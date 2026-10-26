/**
 * AWS Signature Version 4 (port of py-uconnect sigv4.py / the approved probe script).
 * Pure JS (@noble/hashes), no native code: runs in Expo Go.
 * Only `host` and the `x-amz-*` headers are signed, which is what the Uconnect gateway expects.
 */
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export type AwsCredentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string | null };

const sha256Hex = (data: string) => bytesToHex(sha256(utf8ToBytes(data)));
const hmacBytes = (key: Uint8Array | string, msg: string) =>
  hmac(sha256, typeof key === 'string' ? utf8ToBytes(key) : key, utf8ToBytes(msg));

/** Percent-encodes like Python's quote(s, safe="-_.~"): only A-Za-z0-9 -_.~ stay. */
export const awsQuote = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Decodes like parse_qsl(keep_blank_values=True): '+' is a space, empty pairs are skipped. */
function parseQuery(query: string): [string, string][] {
  return query
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      const raw = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '));
      return eq < 0 ? [raw(pair), ''] : [raw(pair.slice(0, eq)), raw(pair.slice(eq + 1))];
    });
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Sorted, re-encoded query string, as required by the canonical request. */
function canonicalQuery(query: string) {
  return parseQuery(query)
    .sort(([k1, v1], [k2, v2]) => compare(k1, k2) || compare(v1, v2))
    .map(([k, v]) => `${awsQuote(k)}=${awsQuote(v)}`)
    .join('&');
}

/** Splits an absolute URL by hand: Hermes' URL support is not guaranteed to be complete. */
function splitUrl(url: string) {
  const m = /^https?:\/\/([^/?#:]+)(?::(\d+))?([^?#]*)(?:\?([^#]*))?/.exec(url);
  if (!m) throw new Error('URL non valido');
  const [, hostname, port, path, query] = m;
  const host = port && port !== '80' && port !== '443' ? `${hostname}:${port}` : hostname;
  return { host, path: path || '/', query: query ?? '' };
}

/**
 * Signs a request. `url` must be the exact URL that will be sent. Returns the headers to add:
 * X-Amz-Date, Authorization and (with a session token) X-Amz-Security-Token.
 */
export function signRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string,
  creds: AwsCredentials,
  region: string,
  service: string,
  now: Date = new Date(),
): Record<string, string> {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const { host, path, query } = splitUrl(url);

  const added: Record<string, string> = { 'X-Amz-Date': amzDate };
  if (creds.sessionToken != null) added['X-Amz-Security-Token'] = creds.sessionToken;

  const toSign: Record<string, string> = { host };
  for (const [k, v] of [...Object.entries(headers), ...Object.entries(added)]) {
    if (k.toLowerCase().startsWith('x-amz-')) toSign[k.toLowerCase()] = String(v).trim().split(/\s+/).join(' ');
  }
  const names = Object.keys(toSign).sort();
  const signedHeaders = names.join(';');
  const canonicalHeaders = names.map((k) => `${k}:${toSign[k]}\n`).join('');

  // The path is re-encoded as is (already-encoded input is double-encoded), like py-uconnect.
  const canonicalRequest = [
    method.toUpperCase(),
    path.split('/').map(awsQuote).join('/'),
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    sha256Hex(body),
  ].join('\n');

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  let key = hmacBytes(`AWS4${creds.secretAccessKey}`, dateStamp);
  for (const part of [region, service, 'aws4_request']) key = hmacBytes(key, part);
  const signature = bytesToHex(hmacBytes(key, stringToSign));

  added.Authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return added;
}
