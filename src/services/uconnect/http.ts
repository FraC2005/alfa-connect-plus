import { fetch } from 'expo/fetch';

import { ALFA_ROMEO_EU, REQUEST_TIMEOUT_MS, USER_AGENT } from './brand';
import { UconnectError } from './errors';
import { recordRequest } from './recorder';
import { awsQuote } from './sigv4';

export type HttpResponse = { status: number; json: unknown };

/** Query string with RFC 3986 encoding (URLSearchParams.toString is not reliable in React Native). */
export const buildQuery = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([k, v]) => `${awsQuote(k)}=${awsQuote(v)}`)
    .join('&');

/**
 * Headers expected by the Uconnect gateways (web-portal identity, as py-uconnect).
 * The request id is only a correlation label, so Math.random is enough.
 */
export function apiHeaders(apiKey: string = ALFA_ROMEO_EU.apiKey): Record<string, string> {
  const requestId = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
  return {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
    'x-clientapp-name': 'CWP',
    'x-clientapp-version': '1.0',
    'x-originator-type': 'web',
    clientrequestid: requestId,
    'x-api-key': apiKey,
    locale: ALFA_ROMEO_EU.locale,
  };
}

/**
 * fetch wrapper: timeout and JSON decoding. A transport failure becomes a 'network' error whose
 * message never includes the URL (Gigya carries the credentials in the query string).
 * Gigya's cookies are kept by the native HTTP stack (`credentials: 'include'`): the app cannot read Set-Cookie.
 * Redirects are refused (expo/fetch `redirect: 'error'`; iOS returns the 3xx itself, rejected below), so
 * credentials in the query string or signed headers are never replayed to another host.
 */
export async function sendRequest(
  method: 'GET' | 'POST',
  url: string,
  options: { headers?: Record<string, string>; body?: string } = {},
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();
  // The recorder gets method, URL (reduced to a logical host and an id-free path), status and timing, never bodies or headers.
  let logged = false;
  const log = (status: number | null, error?: string, json?: unknown) => {
    logged = true;
    try {
      recordRequest({ method, url, status, error, ms: Date.now() - started, json });
    } catch {
      // Diagnostics must never break a request.
    }
  };
  try {
    const res = await fetch(url, {
      method,
      headers: options.headers,
      body: options.body,
      credentials: 'include',
      redirect: 'error',
      signal: controller.signal,
    });
    if (res.status >= 300 && res.status < 400) {
      log(res.status, 'redirect');
      throw new UconnectError('unavailable', { detail: 'reindirizzamento rifiutato' });
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON: callers fall back on the HTTP status.
    }
    log(res.status, undefined, json);
    return { status: res.status, json };
  } catch (e) {
    if (e instanceof UconnectError) throw e;
    if (!logged) log(null, 'network');
    throw new UconnectError('network');
  } finally {
    clearTimeout(timer);
  }
}
