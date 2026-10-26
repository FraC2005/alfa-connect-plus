/**
 * In-memory log of the last requests to the car's cloud, for the Diagnostica screen.
 * Stores ONLY: time, method, logical host, path with ids replaced by {id} and no query string,
 * HTTP status or error kind, duration. Never bodies, headers, cookies, tokens, credentials, PIN or
 * personal values. For successful vehicle-data GETs it also keeps the sanitized STRUCTURE of the
 * answer (sanitize.ts). Not persisted; cleared on sign-out and gone on app restart.
 */
import { ALFA_ROMEO_EU as brand } from './brand';
import { presenceSummary, redact, structureText } from './sanitize';

export type LogEntry = {
  id: number;
  at: number;
  method: string;
  host: string;
  path: string;
  status: number | null;
  /** Error kind when no HTTP answer arrived (e.g. 'network'). */
  error: string | null;
  ms: number;
  structure: string | null;
  summary: string[];
};

const MAX_ENTRIES = 50;
let entries: readonly LogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const hostOf = (url: string) => /^https?:\/\/([^/?#:]+)/.exec(url)?.[1] ?? '';

/** Logical name of a host: never the real host string. */
function hostName(host: string): string {
  if (host === hostOf(brand.loginUrl)) return 'login';
  if (host === hostOf(brand.tokenUrl)) return 'authz';
  if (host === hostOf(brand.apiUrl)) return 'api';
  if (host === hostOf(brand.mfaUrl)) return 'mfa';
  if (host.startsWith('cognito-identity.')) return 'cognito';
  return 'altro';
}

/** Path without query; account, vehicle, PIN-platform and correlation ids become {id}. */
export function normalizePath(url: string): string {
  const path = /^https?:\/\/[^/?#]+([^?#]*)/.exec(url)?.[1] || '/';
  const segments = path.split('/');
  return segments
    .map((seg, i) => {
      if (!seg) return seg;
      const prev = segments[i - 1];
      const isLast = i === segments.length - 1 || (i === segments.length - 2 && segments[segments.length - 1] === '');
      if (prev === 'accounts' || prev === 'vehicles' || segments[i + 1] === 'pin') return '{id}';
      if (prev === 'remote' && !isLast) return '{id}';
      return seg;
    })
    .join('/');
}

/** Which vehicle-data answers get a stored structure; command and polling endpoints never do. */
const STRUCTURE_ENDPOINTS: [RegExp, string][] = [
  [/^\/v4\/accounts\/\{id\}\/vehicles\/$/, 'vehicles'],
  [/^\/v[34]\/accounts\/\{id\}\/vehicles\/\{id\}\/status\/$/, 'status'],
  [/^\/v1\/accounts\/\{id\}\/vehicles\/\{id\}\/remote\/status\/$/, 'remote-status'],
  [/^\/v1\/accounts\/\{id\}\/vehicles\/\{id\}\/location\/lastknown\/$/, 'location'],
  [/^\/v1\/accounts\/\{id\}\/vehicles\/\{id\}\/maintenance\/history\/$/, 'maintenance'],
  [/^\/v1\/accounts\/\{id\}\/vehicles\/\{id\}\/vhr\/$/, 'vhr'],
  [/^\/v2\/accounts\/\{id\}\/vehicles\/\{id\}\/tripreport\/trips\/$/, 'trips'],
];

/** Names of the enabled services (e.g. RDL, ROLIGHTS): upper-case codes only, so no free text can slip in. */
function enabledServiceLines(json: unknown): string[] {
  const vehicles = (json as { vehicles?: unknown } | null)?.vehicles;
  if (!Array.isArray(vehicles)) return [];
  return vehicles.slice(0, 3).map((v, i) => {
    const services: unknown[] = Array.isArray(v?.services) ? v.services : [];
    const names = services
      .filter((s: any) => (s?.serviceEnabled === true || s?.serviceEnabled === 'true') && (s?.vehicleCapable === true || s?.vehicleCapable === 'true'))
      .map((s: any) => String(s.service))
      .filter((name) => /^[A-Z0-9_]{2,24}$/.test(name));
    return `Servizi abilitati (veicolo ${i + 1}): ${names.join(', ') || 'nessuno'}`;
  });
}

function emit() {
  listeners.forEach((l) => l());
}

/** Records one finished request. `json` is only inspected for the allowlisted GET endpoints. */
export function recordRequest(r: { method: string; url: string; status: number | null; error?: string; ms: number; json?: unknown }) {
  const host = hostName(hostOf(r.url));
  // An unknown host is not described at all: its path could itself be a secret (e.g. a webhook token).
  const path = host === 'altro' ? '/…' : normalizePath(r.url);
  let structure: string | null = null;
  let summary: string[] = [];
  const kind = r.method === 'GET' && host === 'api' && r.status !== null && r.status < 400 ? STRUCTURE_ENDPOINTS.find(([re]) => re.test(path))?.[1] : undefined;
  if (kind && r.json !== undefined && r.json !== null) {
    const { text, shape } = structureText(r.json);
    structure = text;
    summary = presenceSummary(kind, shape);
    if (kind === 'vehicles') summary.push(...enabledServiceLines(r.json));
  }
  const entry: LogEntry = { id: nextId++, at: Date.now(), method: r.method, host, path, status: r.status, error: r.error ?? null, ms: Math.round(r.ms), structure, summary };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  emit();
}

/** Web build only: the calls happen in the local proxy, whose (already sanitized) log is mirrored here. */
export function replaceEntries(next: readonly LogEntry[]) {
  entries = next.slice(0, MAX_ENTRIES);
  emit();
}

/** Web build only: tells the Diagnostica screen that the proxy runs in raw mode. */
let rawNotice = false;
export const setRawNotice = (on: boolean) => {
  rawNotice = on;
};
export const getRawNotice = () => rawNotice;

export const getEntries = (): readonly LogEntry[] => entries;

export function clearLog() {
  entries = [];
  emit();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The line shown for an entry; also used by the export. */
export const entryLine = (e: LogEntry) =>
  `${new Date(e.at).toLocaleTimeString('it-IT')} ${e.method} ${e.host} ${e.path} → ${e.status ?? e.error ?? '?'} (${e.ms} ms)`;

/** The ONLY text that leaves the app: log lines and sanitized structures, redacted once more. */
export function exportText(): string {
  const blocks = entries.map((e) =>
    [entryLine(e), ...e.summary.map((s) => `  ${s}`), ...(e.structure ? [e.structure] : [])].join('\n'),
  );
  return redact(['Diagnostica Alfa Connect+ — struttura delle risposte, progettata per non includere dati personali (controlla prima di condividere)', ...blocks].join('\n\n'));
}
