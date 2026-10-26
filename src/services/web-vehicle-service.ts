/**
 * VehicleService for the web build: talks to the LOCAL proxy (scripts/web-proxy/server.ts, started with
 * `npm run web:real`), which holds the Stellantis session. The browser never sees tokens, and email,
 * password and PIN are only sent to the proxy, once per action, and never stored in the browser
 * (no localStorage/sessionStorage/IndexedDB, no cookies).
 */
import type { Fault, RemoteCommand, ServiceRecord, Trip, VehicleService, VehicleStatus, WarningLight } from './types';
import { UconnectError, type UconnectErrorKind } from './uconnect/errors';
import { replaceEntries, setRawNotice, type LogEntry } from './uconnect/recorder';

const BASE_URL = process.env.EXPO_PUBLIC_PROXY_URL ?? 'http://127.0.0.1:8787';
const TOKEN = process.env.EXPO_PUBLIC_PROXY_TOKEN ?? '';

export class WebVehicleService implements VehicleService {
  /** One request to the proxy; proxy errors keep their kind and Italian message. */
  private async call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: object): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-proxy-token': TOKEN },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'omit',
      });
    } catch {
      throw new UconnectError('proxy_unreachable');
    }
    const json: unknown = await res.json().catch(() => null);
    if (path !== '/diagnostics') this.syncDiagnostics();
    if (!res.ok) {
      const e = json as { kind?: UconnectErrorKind; message?: string; status?: number } | null;
      const error = new UconnectError(e?.kind ?? 'unavailable', { status: e?.status });
      if (e?.message) error.message = e.message;
      throw error;
    }
    return json as T;
  }

  /** Mirrors the proxy's sanitized request log into the Diagnostica screen (fire and forget). */
  private syncDiagnostics() {
    this.call<LogEntry[]>('GET', '/diagnostics')
      .then(replaceEntries)
      .catch(() => {});
  }

  async restoreSession() {
    const { signedIn, raw } = await this.call<{ signedIn: boolean; raw?: boolean }>('GET', '/session');
    setRawNotice(raw === true);
    return signedIn;
  }

  async signIn(email: string, password: string) {
    await this.call('POST', '/session', { email, password });
  }

  async signOut() {
    await this.call('DELETE', '/session');
    replaceEntries([]);
  }

  getStatus() {
    return this.call<VehicleStatus>('GET', '/status');
  }

  async sendCommand(cmd: RemoteCommand, pin: string) {
    await this.call('POST', '/command', { cmd, pin });
  }

  getTrips() {
    return this.call<Trip[] | null>('GET', '/trips');
  }

  getFaults() {
    return this.call<Fault[] | null>('GET', '/faults');
  }

  getWarningLights() {
    return this.call<WarningLight[] | null>('GET', '/warning-lights');
  }

  getServiceHistory() {
    return this.call<ServiceRecord[] | null>('GET', '/history');
  }
}
