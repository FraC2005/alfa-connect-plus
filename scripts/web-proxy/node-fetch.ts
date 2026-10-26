/**
 * Stand-in for `expo/fetch` inside the local web proxy (selected through tsconfig.json "paths").
 * Node's fetch already refuses redirects with `redirect: 'error'`; what Node lacks is a cookie jar,
 * which Gigya needs between its calls. This is a minimal in-memory jar (per host, name=value only;
 * only Max-Age=0 and Expires are honoured, other attributes ignored), never written to disk and emptied by clearCookies() on sign-out.
 */
import { recordRaw } from './raw-log';

const jar = new Map<string, Map<string, string>>();

export function clearCookies() {
  jar.clear();
}

const hostOf = (url: string) => new URL(url).host;

function storeCookies(host: string, setCookies: string[]) {
  const cookies = jar.get(host) ?? new Map<string, string>();
  for (const line of setCookies) {
    const [pair, ...attributes] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const expiresAt = attributes.map((a) => /^\s*expires\s*=\s*(.+)$/i.exec(a)?.[1]).find(Boolean);
    const pastExpires = expiresAt !== undefined && Date.parse(expiresAt) <= Date.now();
    const expired = pastExpires || attributes.some((a) => /^\s*max-age\s*=\s*(0|-\d+)\s*$/i.test(a));
    if (expired || value === '') cookies.delete(name);
    else cookies.set(name, value);
  }
  jar.set(host, cookies);
}

export async function fetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; redirect?: RequestRedirect; signal?: AbortSignal; credentials?: string } = {},
): Promise<Response> {
  const host = hostOf(url);
  const headers = { ...init.headers };
  const cookies = jar.get(host);
  if (cookies && cookies.size > 0) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  const started = Date.now();
  const method = init.method ?? 'GET';
  let res: Response;
  try {
    res = await globalThis.fetch(url, { method: init.method, headers, body: init.body, redirect: init.redirect ?? 'error', signal: init.signal });
  } catch (e) {
    await recordRaw(method, url, null, Date.now() - started);
    throw e;
  }
  storeCookies(host, res.headers.getSetCookie());
  await recordRaw(method, url, res.status, Date.now() - started, res);
  return res;
}
