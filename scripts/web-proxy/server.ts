/**
 * Local web proxy: lets the web build of the app (Chrome on localhost) use REAL data.
 * Browsers cannot call the Stellantis hosts (CORS, forbidden headers/cookies), so this Node process runs
 * the very same service code as the phone app (src/services/real-vehicle-service.ts) and exposes ONLY
 * the VehicleService surface as local JSON endpoints. It never forwards arbitrary URLs.
 *
 * Start with `npm run web:real` (see scripts/web-real.mjs). Safety rules:
 *  - listens on 127.0.0.1 only; Host must be localhost/127.0.0.1 with this port (DNS rebinding);
 *  - Origin must be one of the allowed web origins (default http://localhost:8081 / http://127.0.0.1:8081),
 *    CORS allows exactly that origin, never a wildcard; requests without Origin are refused;
 *  - POST /session and POST /command are single-flight (a second one gets 409) and their answers close the connection;
 *  - every request except the CORS preflight needs the per-run secret in the `x-proxy-token` header;
 *  - the Stellantis session and the credentials stay in this process's memory (see secure-store-memory.ts),
 *    are never written to disk and are never sent to the browser; no bodies are logged; body size is capped.
 */
import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';

import { RealVehicleService } from '../../src/services/real-vehicle-service';
import type { RemoteCommand, VehicleService } from '../../src/services/types';
import { UconnectError } from '../../src/services/uconnect/errors';
import { getEntries } from '../../src/services/uconnect/recorder';
import { clearCookies } from './node-fetch';
import { clearRawLog, getRawLog, setRawEnabled } from './raw-log';

const MAX_BODY_BYTES = 8 * 1024;
const COMMANDS: RemoteCommand[] = ['lock', 'unlock', 'lights', 'horn'];

export type ProxyOptions = {
  service: VehicleService;
  token: string;
  port: number;
  allowedOrigins: string[];
  /** Opt-in raw log of the real upstream calls (GET /raw-log), see raw-log.ts. */
  raw?: boolean;
  /** How long a client may take to send its body (default 5 s). */
  bodyTimeoutMs?: number;
  onSignOut?: () => void;
};

/** An error with the HTTP status to answer. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown, origin?: string, closeConnection = false) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  // The browser must not retry a POST on a reused socket: one attempt per user action.
  if (closeConnection) headers.Connection = 'close';
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, timeoutMs: number): Promise<Record<string, unknown>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HttpError(408, 'Richiesta troppo lenta.')), timeoutMs);
  });
  try {
    return await Promise.race([readBody(req), stalled]);
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) throw new HttpError(413, 'Richiesta troppo grande.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Richiesta troppo grande.');
    chunks.push(chunk as Buffer);
  }
  let parsed: unknown;
  try {
    parsed = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  } catch {
    throw new HttpError(400, 'Richiesta non valida.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new HttpError(400, 'Richiesta non valida.');
  return parsed as Record<string, unknown>;
}

const sameToken = (given: string | undefined, expected: string) => {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function createProxy({ service, token, port, allowedOrigins, raw = false, bodyTimeoutMs = 5000, onSignOut }: ProxyOptions): Server {
  const allowedHosts = [`localhost:${port}`, `127.0.0.1:${port}`];
  setRawEnabled(raw);
  // Single-flight: a second login or command while one runs is refused without touching the upstream.
  let signingIn = false;
  let commandRunning = false;

  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    // DNS rebinding and foreign pages: refuse before anything else (no CORS headers in the answer).
    if (!allowedHosts.includes(req.headers.host ?? '') || !origin || !allowedOrigins.includes(origin)) {
      return send(res, 403, { kind: 'proxy_unreachable', message: 'Richiesta non consentita.' });
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, x-proxy-token',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      });
      return res.end();
    }
    if (!sameToken(req.headers['x-proxy-token'] as string | undefined, token)) {
      return send(res, 403, { kind: 'proxy_unreachable', message: 'Token del proxy non valido: riavvia con npm run web:real.' }, origin);
    }

    const route = `${req.method} ${(req.url ?? '').split('?')[0]}`;
    const post = req.method === 'POST';
    const busy = () => send(res, 409, { kind: 'unavailable', message: 'Operazione già in corso' }, origin, true);
    try {
      switch (route) {
        case 'GET /session':
          return send(res, 200, { signedIn: await service.restoreSession(), raw }, origin);
        case 'POST /session': {
          // Body first (with a timeout), then check-and-set the flag with no await in between.
          const { email, password } = await readJson(req, bodyTimeoutMs);
          if (signingIn) return busy();
          signingIn = true;
          try {
            if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) throw new UconnectError('invalid_credentials');
            await service.signIn(email, password);
            return send(res, 200, { ok: true }, origin, true);
          } finally {
            signingIn = false;
          }
        }
        case 'DELETE /session':
          try {
            await service.signOut();
          } finally {
            // Even if deleting the stored credentials failed, nothing else may linger.
            clearCookies();
            clearRawLog();
            onSignOut?.();
          }
          return send(res, 200, { ok: true }, origin);
        case 'GET /status':
          return send(res, 200, await service.getStatus(), origin);
        case 'GET /trips':
          return send(res, 200, await service.getTrips(), origin);
        case 'GET /faults':
          return send(res, 200, await service.getFaults(), origin);
        case 'GET /warning-lights':
          return send(res, 200, await service.getWarningLights(), origin);
        case 'GET /history':
          return send(res, 200, await service.getServiceHistory(), origin);
        case 'POST /command': {
          const { cmd, pin } = await readJson(req, bodyTimeoutMs);
          if (commandRunning) return busy();
          commandRunning = true;
          try {
            if (typeof pin !== 'string' || !COMMANDS.includes(cmd as RemoteCommand)) throw new UconnectError('command_unavailable');
            await service.sendCommand(cmd as RemoteCommand, pin);
            return send(res, 200, { ok: true }, origin, true);
          } finally {
            commandRunning = false;
          }
        }
        case 'GET /diagnostics':
          return send(res, 200, getEntries(), origin);
        case 'GET /raw-log':
          if (!raw) return send(res, 404, { kind: 'not_found', message: 'Percorso sconosciuto.' }, origin);
          return send(res, 200, getRawLog(), origin);
        default:
          return send(res, 404, { kind: 'not_found', message: 'Percorso sconosciuto.' }, origin);
      }
    } catch (e) {
      // Only the Italian message and kind travel back: never URLs, bodies, tokens or the PIN.
      if (e instanceof HttpError) {
        send(res, e.status, { kind: 'unavailable', message: e.message }, origin, true);
        if (e.status === 413 || e.status === 408) res.once('finish', () => req.destroy());
        return;
      }
      const error = e instanceof UconnectError ? e : new UconnectError('unavailable');
      send(res, error.kind === 'not_found' ? 404 : 502, { kind: error.kind, message: error.message, status: error.status }, origin, post);
    }
  });
}

// Run only when executed directly (tests import createProxy).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env.PROXY_TOKEN;
  if (!token) {
    console.error('PROXY_TOKEN mancante: avvia con `npm run web:real`.');
    process.exit(1);
  }
  const port = Number(process.env.PROXY_PORT ?? 8787);
  const webPort = Number(process.env.WEB_PORT ?? 8081);
  const server = createProxy({
    service: new RealVehicleService(),
    token,
    port,
    allowedOrigins: [`http://localhost:${webPort}`, `http://127.0.0.1:${webPort}`],
    raw: process.env.PROXY_RAW === '1',
  });
  if (process.env.PROXY_RAW === '1') console.warn('ATTENZIONE: modalità RAW attiva. /raw-log contiene risposte con dati personali (in memoria, mai su disco). Non condividerle.');
  server.listen(port, '127.0.0.1', () => console.log(`Proxy locale in ascolto su http://127.0.0.1:${port} (solo questo computer)`));
}
