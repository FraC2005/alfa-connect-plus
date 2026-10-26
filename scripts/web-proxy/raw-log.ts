/**
 * OPT-IN raw log of the real upstream calls (`npm run web:real -- --raw`), so the owner can inspect them in
 * Chrome DevTools > Network (GET /raw-log). Off by default. In memory only (last 40 calls), never on disk,
 * cleared on sign-out and gone when the proxy stops.
 *
 * What it keeps: time, method, upstream URL WITHOUT query string (account/vehicle ids kept: the owner's own
 * data), status, duration and, ONLY for GETs on the vehicle API, the full response body (cut at 200 KB).
 * What it never keeps: request bodies, any header (x-api-key, Cookie, Authorization, signatures...), the
 * password, e-mail, PIN/pinAuth, tokens, and response bodies of login, token exchange, Cognito, PIN and command calls.
 */
import { normalizePath } from '../../src/services/uconnect/recorder';

export type RawEntry = { at: string; method: string; url: string; status: number | null; ms: number; body: string | null };

const MAX_ENTRIES = 40;
const MAX_BODY_CHARS = 200_000;
const API_HOST = 'channels.sdpr-01.fcagcv.com';
/** Command polling answers (.../remote/{correlationId}/(last-)status/) are log-line only. */
const POLLING_PATH = /\/remote\/[^/]+\/(last-)?status\/?$/;

/** Conservative redaction of anything token-like left in a body (JWTs, long opaque strings). */
export const redactBody = (text: string) =>
  text.replace(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '<redatto>').replace(/[A-Za-z0-9_-]{40,}/g, '<redatto>');

let enabled = false;
let entries: RawEntry[] = [];

export const setRawEnabled = (on: boolean) => {
  enabled = on;
  if (!on) entries = [];
};
export const isRawEnabled = () => enabled;
export const getRawLog = (): readonly RawEntry[] => entries;
export const clearRawLog = () => {
  entries = [];
};

/** Called by the proxy's fetch binding for every upstream call (no-op when raw mode is off). */
export async function recordRaw(method: string, rawUrl: string, status: number | null, ms: number, response?: Response) {
  if (!enabled) return;
  try {
    await store(method, rawUrl, status, ms, response);
  } catch {
    // The raw log must never break a request.
  }
}

async function store(method: string, rawUrl: string, status: number | null, ms: number, response?: Response) {
  const u = new URL(rawUrl);
  const url = `${u.origin}${u.pathname}`; // never the query string (Gigya carries the password there)
  let body: string | null = null;
  if (response && method === 'GET' && u.host === API_HOST && status !== null && status < 400 && !POLLING_PATH.test(u.pathname)) {
    body = redactBody((await response.clone().text()).slice(0, MAX_BODY_CHARS));
  }
  entries = [{ at: new Date().toISOString(), method, url, status, ms, body }, ...entries].slice(0, MAX_ENTRIES);
  // The terminal line shows the id-free path; only the browser's /raw-log keeps the real ids.
  console.log(`[raw] ${method} ${u.host} ${normalizePath(rawUrl)} ${status ?? 'errore'} ${ms} ms`);
}
