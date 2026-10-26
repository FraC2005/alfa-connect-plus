#!/usr/bin/env node
/**
 * probe-uconnect.mjs - READ-ONLY probe of the My Alfa Connect (FCA Uconnect) cloud.
 *
 * Logs in with the owner's own account and prints which vehicles and which
 * services (RDL, RDU, ROLIGHTS, HBLF, VF, TRIPREPORT...) are enabled. With
 * --status it also reads status / doors / location / maintenance / health report
 * and prints only the STRUCTURE of the answers (keys, types, units), never the
 * personal values (date-like fields show only their digit count). No command is ever sent to the car: the only signed requests
 * this script can build are GETs (see apiGet).
 *
 * Usage:
 *   node scripts/probe-uconnect.mjs                 vehicles + services
 *   node scripts/probe-uconnect.mjs --status        + read-only status structure
 *   node scripts/probe-uconnect.mjs --region US     ASIA | US | EU (default EU)
 *   node scripts/probe-uconnect.mjs --dump [file]   write the sanitized structure to a file
 *   node scripts/probe-uconnect.mjs --selftest      offline SigV4 / sanitizer checks
 *
 * Security rules (by design):
 *  - email and password come ONLY from interactive prompts (neither is echoed, so
 *    the email does not stay in the terminal scrollback); never from argv or environment.
 *  - nothing secret (password, tokens, AWS keys) is written to disk or printed;
 *    all program output goes through print(), which masks known secrets
 *    (case-insensitively). The only direct writes are the fixed prompt texts.
 *  - exactly ONE login attempt per run, never retried (Gigya may lock accounts).
 *
 * Protocol and constants are copied from the public project
 * https://github.com/hass-uconnect/py-uconnect (docs/API.md, brands.py, auth.py,
 * sigv4.py, _http.py). Only Node built-ins are used (Node >= 20).
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Constants (from py-uconnect brands.py / auth.py / _http.py)
// ---------------------------------------------------------------------------

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const GIGYA_PARAMS = {
  targetEnv: 'jssdk',
  loginMode: 'standard',
  sdk: 'js_latest',
  authMode: 'cookie',
  sdkBuild: '12234',
  format: 'json',
};

const JWT_FIELDS =
  'profile.firstName,profile.lastName,profile.email,country,locale,data.disclaimerCodeGSDP';

const API_EU = {
  url: 'https://channels.sdpr-01.fcagcv.com',
  key: '2wGyL6PHec9o1UeLPYpoYa1SkEWqeBur9bLsi24i',
};
const API_US = {
  url: 'https://channels.sdpr-02.fcagcv.com',
  key: 'OgNqp2eAv84oZvMrXPIzP8mR8a6d9bVm1aaH9LqU',
};
const TOKEN_URL_EU = 'https://authz.sdpr-01.fcagcv.com/v2/cognito/identity/token';
const TOKEN_URL_US = 'https://authz.sdpr-02.fcagcv.com/v2/cognito/identity/token';

/** Alfa Romeo configurations of py-uconnect, keyed by the --region value. */
const REGIONS = {
  EU: {
    name: 'ALFA_ROMEO_EU',
    region: 'eu-west-1',
    loginApiKey: '3_h8sj2VQI-KYXiunPq9a1QuAA4yWkY0r5AD1u8A8B1RPn_Cvl54xcoc2-InH5onJ1',
    loginUrl: 'https://login.alfaromeo.com',
    tokenUrl: TOKEN_URL_EU,
    api: API_EU,
    locale: 'de_de',
    brandCode: 'ALFAROMEO',
  },
  US: {
    name: 'ALFA_ROMEO_US_CANADA',
    region: 'us-east-1',
    loginApiKey: '3_FSxGyaktviayTDRcgp9r9o2KjuFSrHT13wWNN9zPrvAGUCoXPDqoIPOwlBUhck4A',
    loginUrl: 'https://login-us.alfaromeo.com',
    tokenUrl: TOKEN_URL_US,
    api: API_US,
    locale: 'en_us',
    brandCode: 'ALL',
  },
  ASIA: {
    name: 'ALFA_ROMEO_ASIA',
    region: 'eu-west-1',
    loginApiKey: '4_PSQeADnQ4p5XOaDgT0B5pA',
    loginUrl: 'https://login-iap.alfaromeo.com',
    tokenUrl: TOKEN_URL_EU,
    api: API_EU,
    locale: 'de_de',
    brandCode: 'ALFAROMEO',
  },
};

const REQUEST_TIMEOUT_MS = 20_000;

/** Services the owner cares about; shown first in the summary. */
const KEY_SERVICES = ['RDL', 'RDU', 'ROLIGHTS', 'HBLF', 'VF', 'TRIPREPORT'];

/** Read-only endpoints queried by --status (besides the vehicle status itself). */
const STATUS_ENDPOINTS = [
  { version: 'v1', suffix: 'remote/status/', label: 'Porte/finestrini/motore (remote/status)' },
  { version: 'v1', suffix: 'location/lastknown/', label: 'Ultima posizione nota (location/lastknown)' },
  { version: 'v1', suffix: 'maintenance/history/', label: 'Storico manutenzione (maintenance/history)' },
  { version: 'v1', suffix: 'vhr/', label: 'Rapporto salute veicolo (vhr)' },
  // Only if the TRIPREPORT service is enabled; query parameters (time range, paging) are unknown, so none are sent.
  { version: 'v2', suffix: 'tripreport/trips/', label: 'Viaggi (tripreport/trips)', requires: 'TRIPREPORT' },
];

// ---------------------------------------------------------------------------
// Output with secret masking
// ---------------------------------------------------------------------------

/** Secrets (password, tokens, uid, VINs...) that must never reach the terminal. */
const secrets = new Set();

/** Registers a value to be masked in every line printed afterwards. */
function addSecret(value) {
  if (typeof value === 'string' && value.length >= 4) secrets.add(value);
}

/** Masks every registered secret, case-insensitively (emails and VINs may be written in any case). */
function scrub(text) {
  let out = String(text);
  // Longest first, so a secret that contains another one is masked as a whole.
  for (const s of [...secrets].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(escapeRegExp(s), 'gi'), '***');
  }
  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The only way this script writes to the terminal. */
function print(text = '') {
  process.stdout.write(`${scrub(text)}\n`);
}

/** Error carrying the failing step and an optional hint, both shown to the owner. */
class ProbeError extends Error {
  constructor(message, { hint, status } = {}) {
    super(message);
    this.hint = hint;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// AWS Signature Version 4 (port of py-uconnect sigv4.py)
// ---------------------------------------------------------------------------

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, msg) => createHmac('sha256', key).update(msg, 'utf8').digest();

/** Percent-encodes like Python's quote(s, safe="-_.~"): only A-Za-z0-9 -_.~ stay. */
const awsQuote = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Sorted, re-encoded query string, as required by the canonical request. */
function canonicalQuery(query) {
  return [...new URLSearchParams(query)]
    .sort(([k1, v1], [k2, v2]) => (k1 === k2 ? (v1 < v2 ? -1 : v1 > v2 ? 1 : 0) : k1 < k2 ? -1 : 1))
    .map(([k, v]) => `${awsQuote(k)}=${awsQuote(v)}`)
    .join('&');
}

/**
 * Signs a request. Only `host` and the `x-amz-*` headers are signed (this is what
 * the Uconnect gateway expects). `url` must be the exact URL that will be sent.
 * Returns the headers to add: X-Amz-Date, Authorization and X-Amz-Security-Token.
 */
function sign(method, url, headers, body, creds, region, service, now = new Date()) {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);

  const parts = new URL(url);
  const host = parts.port && !['80', '443'].includes(parts.port) ? `${parts.hostname}:${parts.port}` : parts.hostname;

  const added = { 'X-Amz-Date': amzDate };
  if (creds.sessionToken != null) added['X-Amz-Security-Token'] = creds.sessionToken;

  const toSign = { host };
  for (const [k, v] of [...Object.entries(headers), ...Object.entries(added)]) {
    if (k.toLowerCase().startsWith('x-amz-')) toSign[k.toLowerCase()] = String(v).trim().split(/\s+/).join(' ');
  }
  const names = Object.keys(toSign).sort();
  const signedHeaders = names.join(';');
  const canonicalHeaders = names.map((k) => `${k}:${toSign[k]}\n`).join('');

  const canonicalPath = (parts.pathname || '/').split('/').map(awsQuote).join('/');
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalPath,
    canonicalQuery(parts.search.replace(/^\?/, '')),
    canonicalHeaders,
    signedHeaders,
    sha256Hex(body),
  ].join('\n');

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  let key = hmac(`AWS4${creds.secretAccessKey}`, dateStamp);
  for (const part of [region, service, 'aws4_request']) key = hmac(key, part);
  const signature = createHmac('sha256', key).update(stringToSign, 'utf8').digest('hex');

  added.Authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return added;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** Headers expected by the Uconnect gateways (web-portal identity, as py-uconnect). */
function apiHeaders(brand, apiKey) {
  return {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
    'x-clientapp-name': 'CWP',
    'x-clientapp-version': '1.0',
    'x-originator-type': 'web',
    clientrequestid: randomUUID().replace(/-/g, '').toUpperCase().slice(0, 16),
    'x-api-key': apiKey,
    locale: brand.locale,
  };
}

/**
 * fetch wrapper: timeout, JSON decoding, optional cookie jar (Gigya keeps its
 * state in cookies between calls). Errors never include the URL, because Gigya
 * carries the credentials in the query string.
 */
async function http(method, url, { headers = {}, body, cookies } = {}) {
  const reqHeaders = { ...headers };
  if (cookies && Object.keys(cookies).length) {
    reqHeaders.Cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  let res;
  let text;
  try {
    // redirect: 'error' so that cookies, signed headers or credentials in the query
    // string are never replayed to a host other than the one we meant to call.
    res = await fetch(url, {
      method,
      headers: reqHeaders,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    text = await res.text();
  } catch (err) {
    if (/redirect/i.test(String(err?.cause?.message ?? err?.message))) {
      throw new ProbeError(`${new URL(url).host} ha risposto con un reindirizzamento: richiesta interrotta per sicurezza.`, {
        hint: 'I server potrebbero essere cambiati: non insistere e avvisa il planner.',
      });
    }
    const why = err?.cause?.code ?? err?.name ?? 'errore sconosciuto';
    throw new ProbeError(`Connessione a ${new URL(url).host} non riuscita (${why}).`, {
      hint: 'Controlla la connessione di rete / VPN e riprova.',
    });
  }
  if (cookies) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: callers fall back on the HTTP status.
  }
  return { status: res.status, json, text };
}

// ---------------------------------------------------------------------------
// Login flow: Gigya -> JWT -> authz token -> Cognito -> temporary AWS credentials
// ---------------------------------------------------------------------------

/** Hints for the Gigya error codes. Codes are from memory of Gigya docs: UNVERIFIED. */
const GIGYA_HINTS = {
  403042: 'Email o password non riconosciute da questo sito di login.',
  403120: 'Account bloccato temporaneamente (troppi tentativi). NON riprovare subito: attendi qualche minuto.',
};

/** One Gigya call; params go in the query string even for POST (as the web SDK does). */
async function gigya(brand, method, call, params, cookies) {
  const { status, json } = await http(method, `${brand.loginUrl}/${call}?${new URLSearchParams(params)}`, {
    headers: { 'User-Agent': USER_AGENT },
    cookies,
  });
  if (status !== 200 || typeof json !== 'object' || json === null) {
    throw new ProbeError(`Gigya ${call}: risposta HTTP ${status} inattesa.`);
  }
  const code = json.errorCode ?? 0;
  if (json.statusCode !== 200 || code !== 0) {
    throw new ProbeError(`Login rifiutato (${call}): ${json.errorMessage ?? 'errore'} [codice ${code}]`, {
      hint: GIGYA_HINTS[code],
    });
  }
  return json;
}

/** Performs the whole login, once. Returns the account uid and the AWS credentials. */
async function login(brand, email, password) {
  const cookies = {};

  await gigya(brand, 'GET', 'accounts.webSdkBootstrap', { apiKey: brand.loginApiKey }, cookies);

  const session = await gigya(
    brand,
    'POST',
    'accounts.login',
    {
      ...GIGYA_PARAMS,
      APIKey: brand.loginApiKey,
      loginID: email,
      password,
      sessionExpiration: '300',
      include: 'profile,data,emails,subscriptions,preferences',
    },
    cookies,
  );
  const uid = session.UID;
  const loginToken = session.sessionInfo?.login_token;
  if (!uid || !loginToken) throw new ProbeError('accounts.login: risposta senza UID o login_token.');
  addSecret(uid);
  addSecret(loginToken);

  const jwt = await gigya(
    brand,
    'POST',
    'accounts.getJWT',
    { ...GIGYA_PARAMS, APIKey: brand.loginApiKey, login_token: loginToken, fields: JWT_FIELDS },
    cookies,
  );
  if (typeof jwt.id_token !== 'string') throw new ProbeError('accounts.getJWT: nessun id_token nella risposta.');
  addSecret(jwt.id_token);

  // Exchange the Gigya JWT for a Cognito identity (this request is not signed).
  const authz = await http('POST', brand.tokenUrl, {
    headers: apiHeaders(brand, brand.api.key),
    body: JSON.stringify({ gigya_token: jwt.id_token }),
  });
  if (authz.status !== 200 || !authz.json?.Token || !authz.json?.IdentityId) {
    throw new ProbeError(`Scambio token (authz) fallito: HTTP ${authz.status}.`, {
      hint: 'Il login Gigya e\' riuscito ma il server FCA ha rifiutato il token: la regione potrebbe essere sbagliata (--region) o le chiavi pubbliche sono cambiate.',
    });
  }
  addSecret(authz.json.Token);
  addSecret(authz.json.IdentityId);

  const cognito = await http('POST', `https://cognito-identity.${brand.region}.amazonaws.com/`, {
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityService.GetCredentialsForIdentity',
    },
    body: JSON.stringify({
      IdentityId: authz.json.IdentityId,
      Logins: { 'cognito-identity.amazonaws.com': authz.json.Token },
    }),
  });
  const c = cognito.json?.Credentials;
  if (cognito.status !== 200 || !c?.AccessKeyId || !c?.SecretKey || !c?.SessionToken) {
    throw new ProbeError(`Cognito GetCredentialsForIdentity fallito: HTTP ${cognito.status}.`);
  }
  addSecret(c.AccessKeyId);
  addSecret(c.SecretKey);
  addSecret(c.SessionToken);

  return { uid, aws: { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretKey, sessionToken: c.SessionToken } };
}

// ---------------------------------------------------------------------------
// Read-only API access
// ---------------------------------------------------------------------------

/**
 * Signed GET on the vehicle API. This is the ONLY request builder for the vehicle
 * API and its method is fixed: the script cannot send commands to the car.
 */
async function apiGet(ctx, path, params) {
  const query = params
    ? Object.entries(params).map(([k, v]) => `${awsQuote(k)}=${awsQuote(v)}`).join('&')
    : '';
  const url = `${ctx.brand.api.url}${path}${query ? `?${query}` : ''}`;
  const headers = apiHeaders(ctx.brand, ctx.brand.api.key);
  Object.assign(headers, sign('GET', url, headers, '', ctx.aws, ctx.brand.region, 'execute-api'));

  const { status, json } = await http('GET', url, { headers });
  if (status >= 400) {
    // Only the HTTP code and a short, scrubbed "message" field: server bodies may echo personal data.
    const message = typeof json?.message === 'string' ? scrub(json.message).replace(/\s+/g, ' ').slice(0, 80) : '';
    const shownPath = path.replace(/\/(accounts|vehicles)\/[^/?]+/g, '/$1/{id}');
    throw new ProbeError(`GET ${shownPath} -> HTTP ${status}${message ? `: ${message}` : ''}`, { status });
  }
  return json ?? {};
}

const vehiclePath = (ctx, version, vin, suffix) =>
  `/${version}/accounts/${awsQuote(ctx.uid)}/vehicles/${awsQuote(vin)}/${suffix}`;

/** Vehicle status: v4 for vehicles with the CPCOOP service, v3 otherwise, with fallback. */
async function getVehicleStatus(ctx, vehicle) {
  const versions = enabledServices(vehicle).has('CPCOOP') ? ['v4', 'v3'] : ['v3', 'v4'];
  for (const [i, version] of versions.entries()) {
    try {
      return await apiGet(ctx, vehiclePath(ctx, version, vehicle.vin, 'status/'));
    } catch (err) {
      // The version may simply be unsupported by this vehicle: try the other one.
      if (![400, 404, 502].includes(err.status) || i === versions.length - 1) throw err;
    }
  }
  return {};
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

const isTrue = (v) => v === true || v === 'true';

function enabledServices(vehicle) {
  return new Set(
    (vehicle.services ?? []).filter((s) => isTrue(s.serviceEnabled)).map((s) => s.service),
  );
}

/** First 3 + last 4 characters of the VIN. */
function maskVin(vin) {
  return typeof vin === 'string' && vin.length > 7
    ? `${vin.slice(0, 3)}${'*'.repeat(vin.length - 7)}${vin.slice(-4)}`
    : '***';
}

/** Service name -> { abilitato, supportato }, with no personal data (used by --dump). */
function serviceMap(vehicle) {
  return Object.fromEntries(
    (vehicle.services ?? []).map((s) => [
      s.service,
      { serviceEnabled: isTrue(s.serviceEnabled), vehicleCapable: isTrue(s.vehicleCapable) },
    ]),
  );
}

function printVehicle(vehicle, index, total) {
  const model = [vehicle.modelDescription, vehicle.model && `(${vehicle.model})`].filter(Boolean).join(' ');
  print(`--- Veicolo ${index + 1} di ${total} ---`);
  print(`  Modello:      ${model || 'n/d'}`);
  print(`  Anno:         ${vehicle.year ?? 'n/d'}`);
  print(`  Soprannome:   ${vehicle.nickname ? 'presente (omesso)' : 'n/d'}`);
  print(`  fuelType:     ${vehicle.fuelType ?? 'n/d'}`);
  print(`  VIN:          ${maskVin(vehicle.vin)}`);
  print(`  sdp:          ${vehicle.sdp ?? 'n/d'}`);
  print(`  Mercato:      ${[vehicle.market, vehicle.soldRegion].filter(Boolean).join(' / ') || 'n/d'}`);

  const services = vehicle.services ?? [];
  const byName = new Map(services.map((s) => [s.service, s]));
  print('  Servizi chiave:');
  for (const name of KEY_SERVICES) {
    const s = byName.get(name);
    const state = !s ? 'ASSENTE' : isTrue(s.serviceEnabled) ? 'ABILITATO' : 'non abilitato';
    print(`    ${name.padEnd(10)} ${state}${s && !isTrue(s.vehicleCapable) ? ' (veicolo non compatibile)' : ''}`);
  }
  print(`  Tutti i servizi (${services.length}), abilitati per primi:`);
  const rank = (s) => (isTrue(s.serviceEnabled) ? 0 : isTrue(s.vehicleCapable) ? 1 : 2);
  for (const s of [...services].sort((a, b) => rank(a) - rank(b) || a.service.localeCompare(b.service))) {
    print(`    ${isTrue(s.serviceEnabled) ? '[SI]' : '[no]'} ${s.service}${isTrue(s.vehicleCapable) ? '' : '  (non compatibile)'}`);
  }
  print();
}

// ---------------------------------------------------------------------------
// Structure sanitizer: keys, types and non-personal values only
// ---------------------------------------------------------------------------

/** Keys whose value is safe and needed to fix field semantics (units, scales, codes). */
const KEEP_VALUE_KEYS = new Set([
  'unit', 'type', 'service', 'sdp', 'fuelType', 'make', 'model', 'year', 'soldRegion',
  'fuelAmountLevel', 'oilLevel', 'batteryStateOfCharge', 'batteryStatus',
]);
/** Parents whose `value` (a pressure or a voltage) is needed to understand the scale. */
const KEEP_VALUE_PARENTS = new Set(['pressure', 'batteryVoltage']);
/** Keys that must never expose their value, even if it looks like an enum. */
const PERSONAL_KEY =
  /vin|nick|name|mail|plate|phone|uid|token|address|city|lat|lon|alt|bearing|owner|dealer|town|province|region|country|street|location|id$/i;
/** Upper-case words (LOCKED, FL, ON...): status enums, not free text. VINs contain digits so never match. */
const ENUM_VALUE = /^[A-Z][A-Z_]{1,23}$/;
/**
 * vhr (vehicle health report): reportCard.items[] is {itemKey, value, items?}, nested arbitrarily deep
 * (reportCard.items[].items[].itemKey...). itemKey names WHICH item this is (e.g. oil life, DPF/FAP soot
 * level); value stays type-only at every depth, EXCEPT for a closed whitelist of known dashboard-light
 * itemKeys (VHR_KNOWN_VALUE_ITEM_KEYS below), whose value is a boolean/enum warning state, not free or
 * personal data, and is revealed when it matches the strict enum shape (VHR_ENUM_VALUE). itemKey is
 * revealed only on this exact path (VHR_ITEM_PATH below), and only when it looks like a technical code:
 * no spaces (the signal of free text / personal data), capped length, same reasoning as the other
 * SAFE_CODE-style guards in this file and in the app's sanitize.ts. Never affects any other field.
 */
const VHR_ITEM_PATH = /(^|\.)reportCard\.items(\.items)*$/;
const VHR_ITEM_KEY = /^[A-Za-z0-9._/-]{1,40}$/;
/** Extra safety net: never reveal something shaped like a VIN, even if it matched VHR_ITEM_KEY. */
const VIN_LIKE = /^[A-Za-z0-9]{17}$/;
/**
 * Closed whitelist of vhr itemKey names whose sibling `value` is a dashboard warning light
 * (enum/boolean), not free-form or personal data: these are the only itemKey values for which
 * the actual VALUE (not just the type) may be revealed, and only on the VHR_ITEM_PATH chain, and
 * only when the value itself matches VHR_ENUM_VALUE below. Exact (case-sensitive) name match only;
 * this list must never be widened to cover fields outside reportCard.items(.items)*.
 */
const VHR_KNOWN_VALUE_ITEM_KEYS = new Set([
  'vehicleStatus', 'isServiceNeeded',
  'ABSIndLampStatus', 'milLampStat', 'brakeFluid', 'checkFuelCap', 'CHRGSystemFail', 'ETCIndLampStatus',
  'oilPressure', 'engineCoolant', 'airbagIndLamp', 'TPMServiceWarningStatus', 'WIFLampStatus',
  'DpfDefWarningStatus', 'filterWarningStatus', 'transOverTemp', 'autoOilChange',
  'headlightPositionLight', 'lowBeamLight', 'highBeamLight',
]);
/** Strict enum/code shape for a known vhr value: no spaces, capped length (same spirit as SAFE_CODE). */
const VHR_ENUM_VALUE = /^[A-Za-z0-9_]{1,20}$/;
/** All-digit strings longer than this look like a timestamp/odometer/id, never a dashboard enum code. */
const DIGITS_ONLY_LONG = /^\d{7,}$/;

/**
 * Shape for the `value` sibling of a whitelisted vhr itemKey: reveals the value only if it is a
 * boolean, or a short enum-like string/number (VHR_ENUM_VALUE) that does NOT also look like a VIN
 * (VIN_LIKE, reused from the itemKey guard above) or a long all-digit timestamp/id (DIGITS_ONLY_LONG)
 * — both are rejected even though they match VHR_ENUM_VALUE's charset, because revealing them would
 * leak a VIN or a precise date/odometer-like number under the guise of an "enum code". Otherwise falls
 * back to type-only, same as every other vhr value.
 */
function vhrKnownValueShape(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'boolean') return `${type} = ${value}`;
  if (type === 'string' || type === 'number') {
    const str = String(value);
    if (VIN_LIKE.test(str) || DIGITS_ONLY_LONG.test(str)) return type;
    if (VHR_ENUM_VALUE.test(str)) return `${type} = ${value}`;
  }
  return type;
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Replaces values with a type description; keeps allow-listed non-personal values.
 * `path` is the dot-joined chain of ancestor field names up to and including the current node's own
 * key (NOT including the key of the value passed to the current call) — used only to recognise the
 * vhr/reportCard.items(.items)* chain at any depth; everywhere else only `key` (and its immediate
 * parent, read off the end of `path`) drives the existing rules, same as before.
 */
function shapeOf(value, key = '', path = '') {
  const parentKey = path ? path.slice(path.lastIndexOf('.') + 1) : '';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    // Array elements share the field's own key/path: they are "the same field", not a new path segment.
    const items = value.slice(0, 20).map((item) => shapeOf(item, key, path));
    return { _array: value.length, _item: items.length ? items.reduce(mergeShapes) : 'vuoto' };
  }
  if (isObject(value)) {
    // Object keys that look like VINs / ids (long, with digits) are replaced, then merged.
    const childPath = path ? `${path}.${key}` : key;
    return Object.entries(value).reduce((out, [k, v]) => {
      const name = /\d/.test(k) && k.length >= 12 ? '<id>' : k;
      // vhr known dashboard-light itemKeys: reveal the sibling `value` itself (see VHR_KNOWN_VALUE_ITEM_KEYS).
      const shape =
        name === 'value' && VHR_ITEM_PATH.test(childPath) && VHR_KNOWN_VALUE_ITEM_KEYS.has(value.itemKey)
          ? vhrKnownValueShape(v)
          : shapeOf(v, name, childPath);
      out[name] = name in out ? mergeShapes(out[name], shape) : shape;
      return out;
    }, {});
  }
  const type = typeof value;
  if (type === 'boolean') return 'boolean';
  // Date-like fields: only the number of digits (10 = seconds, 13 = milliseconds), never the value.
  if (/time|date|stamp/i.test(key) && /^\d+$/.test(String(value))) return `${type} (${String(value).length} cifre)`;
  // Only vhr/reportCard.items[].itemKey at any nesting depth, and only if it looks like a technical code.
  if (key === 'itemKey' && VHR_ITEM_PATH.test(path) && type === 'string') {
    return VHR_ITEM_KEY.test(value) && !VIN_LIKE.test(value) ? `${type} = ${value}` : type;
  }
  const keep =
    KEEP_VALUE_KEYS.has(key) ||
    (key === 'value' && KEEP_VALUE_PARENTS.has(parentKey)) ||
    (type === 'string' && ENUM_VALUE.test(value) && !PERSONAL_KEY.test(key));
  return keep ? `${type} = ${value}` : type;
}

/** Union of two shapes (array items can differ): objects merge key by key, leaves are joined. */
function mergeShapes(a, b) {
  if (isObject(a) && isObject(b)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in out ? mergeShapes(out[k], v) : v;
    return out;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return [...new Set([...a.split(' | '), ...b.split(' | ')])].join(' | ');
  }
  return JSON.stringify(a) === JSON.stringify(b) ? a : { _misto: [a, b] };
}

// ---------------------------------------------------------------------------
// Interactive prompts
// ---------------------------------------------------------------------------

/** Reads one line of visible, non-secret text (the confirmation). EOF (Ctrl-D) aborts. */
async function promptLine(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const closed = new Promise((_, reject) => rl.once('close', () => reject(new ProbeError('Input terminato: interrotto.'))));
  try {
    return (await Promise.race([rl.question(question), closed])).trim();
  } finally {
    rl.close();
  }
}

/**
 * Reads a line without echoing it (email, password). Ctrl-C, Ctrl-D and
 * SIGINT/SIGTERM/SIGHUP abort without returning a partial value, and the
 * terminal is always restored from raw mode.
 */
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    const buffer = [];
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    const finish = (settle) => {
      stdin.removeListener('data', onData);
      for (const sig of signals) process.removeListener(sig, onSignal);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      settle();
    };
    const cancel = () => finish(() => reject(new ProbeError('Interrotto dall\'utente.')));
    const onSignal = () => cancel();
    const onData = (chunk) => {
      // Escape sequences (arrow keys...) are ignored whole.
      if (chunk.startsWith('\u001b')) return;
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish(() => resolve(buffer.join('')));
        if (ch === '\u0003' || ch === '\u0004') return cancel();
        if (ch === '\u007f' || ch === '\b') buffer.pop();
        else if (ch >= ' ') buffer.push(ch);
      }
    };
    stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
    for (const sig of signals) process.once(sig, onSignal);
  });
}

// ---------------------------------------------------------------------------
// Self-test (offline: no network, no credentials)
// ---------------------------------------------------------------------------

function selfTest() {
  const now = new Date(Date.UTC(2015, 7, 30, 12, 36, 0));
  const creds = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };
  const withToken = { ...creds, sessionToken: 'TOKEN123' };
  const awsScope = 'AKIDEXAMPLE/20150830/us-east-1/service/aws4_request';
  const euScope = 'AKIDEXAMPLE/20150830/eu-west-1/execute-api/aws4_request';
  const auth = (scope, signedHeaders, signature) =>
    `AWS4-HMAC-SHA256 Credential=${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  let passed = 0;
  const check = (name, fn) => {
    fn();
    passed += 1;
    print(`  ok  ${name}`);
  };

  print('Self-test SigV4 / sanitizer (offline)');

  // Official AWS SigV4 test-suite vectors (same as py-uconnect tests/test_sigv4.py).
  for (const [url, signature] of [
    ['https://example.amazonaws.com/', '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31'],
    ['https://example.amazonaws.com/?Param2=value2&Param1=value1', 'b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500'],
  ]) {
    check(`AWS vector GET ${url.slice(8)}`, () =>
      assert.deepEqual(sign('GET', url, {}, '', creds, 'us-east-1', 'service', now), {
        'X-Amz-Date': '20150830T123600Z',
        Authorization: auth(awsScope, 'host;x-amz-date', signature),
      }),
    );
  }
  check('AWS vector POST / (body vuoto)', () =>
    assert.equal(
      sign('POST', 'https://example.amazonaws.com/', {}, '', creds, 'us-east-1', 'service', now).Authorization,
      auth(awsScope, 'host;x-amz-date', '5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b'),
    ),
  );

  // Vectors produced by the py-uconnect reference signer (sigv4.py) for the GET
  // requests this script really sends: signed security token, region/service of
  // the Uconnect gateway, plus a path/query with characters that need encoding.
  check('Riferimento py-uconnect: GET elenco veicoli con session token', () =>
    assert.deepEqual(
      sign(
        'GET',
        'https://channels.sdpr-01.fcagcv.com/v4/accounts/abc123/vehicles/?stage=ALL&sdp=ALL&brand=ALFAROMEO',
        { 'Content-Type': 'application/json', 'x-api-key': 'KEY' },
        '',
        withToken,
        'eu-west-1',
        'execute-api',
        now,
      ),
      {
        'X-Amz-Date': '20150830T123600Z',
        'X-Amz-Security-Token': 'TOKEN123',
        Authorization: auth(euScope, 'host;x-amz-date;x-amz-security-token', 'd00171be1b1d9986a89f61c4f8a353154545c37dd7161a3602bf3f7950ce396c'),
      },
    ),
  );
  check('Riferimento py-uconnect: percent-encoding di path e query', () =>
    assert.equal(
      sign(
        'GET',
        "https://channels.sdpr-01.fcagcv.com/v1/accounts/abc123/vehicles/VIN%20X/status/?b=a%20b&a=%C3%A8*'",
        {},
        '',
        withToken,
        'eu-west-1',
        'execute-api',
        now,
      ).Authorization,
      auth(euScope, 'host;x-amz-date;x-amz-security-token', 'fce5d8ade7c180708d44cf067ce256aaa064bcb4874375709ed484e3d3df2f9b'),
    ),
  );
  check('Query canonicalizzata (ordine dei parametri irrilevante)', () =>
    assert.equal(
      sign('GET', 'https://example.com/?b=2&a=1', {}, '', creds, 'r', 's', now).Authorization,
      sign('GET', 'https://example.com/?a=1&b=2', {}, '', creds, 'r', 's', now).Authorization,
    ),
  );
  check('Porta non standard fa parte dell\'host firmato', () =>
    assert.notEqual(
      sign('GET', 'https://example.com:8443/', {}, '', creds, 'r', 's', now).Authorization,
      sign('GET', 'https://example.com/', {}, '', creds, 'r', 's', now).Authorization,
    ),
  );

  check('maskVin mostra solo 3 + 4 caratteri', () => assert.equal(maskVin('ZAR12345678901234'), 'ZAR**********1234'));

  check('Sanitizer: niente VIN/coordinate/soprannome, unita\' e scale si', () => {
    const sample = {
      vin: 'ZAR12345678901234',
      nickname: 'LAMIAGIULIA',
      location: { latitude: 45.07, longitude: 7.68 },
      vehicleInfo: {
        fuel: { fuelAmountLevel: 52.5 },
        odometer: { odometer: { unit: 'km', value: '12345' } },
        tyrePressure: [
          { type: 'FL', pressure: { unit: 'bar', value: '2.4' }, warning: false },
          { type: 'FR', pressure: { unit: 'bar', value: '2.5' }, warning: true },
        ],
      },
      doors: { driver: 'LOCKED' },
      byVin: { ZAR12345678901234: { state: 'ON' }, ZAR12345678909999: { state: 'OFF' } },
      dealer: { country: 'ITALIA', owner: 'ROSSI' },
    };
    const text = JSON.stringify(shapeOf(sample));
    for (const personal of ['ZAR1234', 'LAMIAGIULIA', '45.07', '7.68', '12345', 'ITALIA', 'ROSSI']) assert.ok(!text.includes(personal), personal);
    for (const wanted of ['number = 52.5', 'string = bar', 'string = 2.4', 'string = LOCKED', 'string = FL', '<id>', 'string = ON | string = OFF']) assert.ok(text.includes(wanted), wanted);
  });

  // Forma reale segnalata dal proprietario: reportCard.items[] e reportCard.items[].items[], entrambi {itemKey, value}.
  const vhrSample = {
    reportCard: {
      items: [
        {
          itemKey: 'oilLife.pct', // minuscolo/camelCase con punto: il vecchio pattern solo-maiuscolo non lo ammetteva
          value: 'non deve apparire',
          items: [
            { itemKey: 'dpf-soot-level', value: 42 }, // livello annidato (items dentro items)
            { itemKey: 'frase libera con spazi, non e\' un codice tecnico', value: 7 },
            { itemKey: 'ZAR12345678901234', value: 1 }, // 17 caratteri: non va mostrato come se fosse un codice
          ],
        },
      ],
    },
  };
  const vhrText = () => JSON.stringify(shapeOf(vhrSample));

  check('Sanitizer vhr: itemKey esterno (reportCard.items) mostrato se e\' un codice tecnico', () =>
    assert.ok(vhrText().includes('string = oilLife.pct')));

  check('Sanitizer vhr: itemKey annidato (reportCard.items.items) mostrato anch\'esso', () =>
    assert.ok(vhrText().includes('string = dpf-soot-level')));

  check('Sanitizer vhr: set di caratteri piu\' ampio (minuscole, camelCase, punto, trattino)', () => {
    for (const code of ['oilLife.pct', 'dpf-soot-level']) assert.match(code, /^[A-Za-z0-9._/-]{1,40}$/);
  });

  check('Sanitizer vhr: testo libero con spazi resta nascosto a ogni profondita\'', () =>
    assert.ok(!vhrText().includes('frase libera')));

  check('Sanitizer vhr: un itemKey lungo 17 caratteri alfanumerici (forma di un VIN) resta nascosto', () =>
    assert.ok(!vhrText().includes('ZAR12345678901234')));

  check('Sanitizer vhr: value resta solo tipo, mai il valore, a ogni profondita\'', () => {
    const text = vhrText();
    assert.ok(!text.includes('non deve apparire') && !text.includes('= 42') && !text.includes('= 7') && !text.includes('= 1'));
  });

  check('Sanitizer vhr: la regola vale solo dentro reportCard.items(.items)*, non altrove', () => {
    const elsewhere = JSON.stringify(shapeOf({ outer: { itemKey: 'dpf-soot-level' } }));
    assert.ok(!elsewhere.includes('dpf-soot-level'));
  });

  // itemKey della whitelist nota (spie cruscotto): il VALORE va rivelato solo se combacia con l'enum stretto.
  const vhrKnownSample = {
    reportCard: {
      items: [
        { itemKey: 'DpfDefWarningStatus', value: true }, // booleano
        { itemKey: 'autoOilChange', value: 'NORMAL' }, // stringa enum corta
        {
          itemKey: 'other',
          value: 'n/d',
          items: [
            { itemKey: 'oilPressure', value: '0' }, // annidato, stringa enum corta
            { itemKey: 'brakeFluid', value: 'testo libero con spazi, non enum' }, // noto ma NON enum-like: solo tipo
          ],
        },
      ],
    },
  };
  const vhrKnownText = () => JSON.stringify(shapeOf(vhrKnownSample));

  check('Sanitizer vhr: whitelist nota, valore booleano rivelato', () =>
    assert.ok(vhrKnownText().includes('boolean = true')));

  check('Sanitizer vhr: whitelist nota, valore stringa enum corta rivelato', () =>
    assert.ok(vhrKnownText().includes('string = NORMAL')));

  check('Sanitizer vhr: whitelist nota, valore enum corto annidato (items.items) rivelato', () =>
    assert.ok(vhrKnownText().includes('string = 0')));

  check('Sanitizer vhr: whitelist nota ma valore con spazi (non enum-like) resta solo tipo', () =>
    assert.ok(!vhrKnownText().includes('testo libero con spazi')));

  // Controesempi del reviewer: un timestamp o un VIN sotto un itemKey whitelisted non devono essere
  // rivelati per intero, anche se combaciano con VHR_ENUM_VALUE (charset alfanumerico corto).
  check('Sanitizer vhr: whitelist nota, valore timestamp-like (13 cifre) resta solo tipo', () => {
    const text = JSON.stringify(shapeOf({ reportCard: { items: [{ itemKey: 'vehicleStatus', value: '1738661000000' }] } }));
    assert.ok(!text.includes('1738661000000'));
  });

  check('Sanitizer vhr: whitelist nota, valore timestamp-like numerico (non stringa) resta solo tipo', () => {
    const text = JSON.stringify(shapeOf({ reportCard: { items: [{ itemKey: 'vehicleStatus', value: 1738661000000 }] } }));
    assert.ok(!text.includes('1738661000000'));
  });

  check('Sanitizer vhr: whitelist nota, valore VIN-like (17 caratteri alfanumerici) resta solo tipo', () => {
    const text = JSON.stringify(shapeOf({ reportCard: { items: [{ itemKey: 'vehicleStatus', value: 'ZAR12345678901234' }] } }));
    assert.ok(!text.includes('ZAR12345678901234'));
  });

  check('Sanitizer vhr: itemKey fuori whitelist non rivela il valore anche se enum-like', () => {
    // 'ok42' non e' tutto maiuscolo: non e' preso dalla regola generica ENUM_VALUE, solo (eventualmente) da quella vhr.
    const text = JSON.stringify(shapeOf({ reportCard: { items: [{ itemKey: 'oilLife.pct', value: 'ok42' }] } }));
    assert.ok(!text.includes('string = ok42'));
  });

  check('Sanitizer: campi data mostrano solo il numero di cifre', () => {
    const text = JSON.stringify(shapeOf({ timestamp: 1738661000000, startTime: '1738661000', date: '2025-01-01' }));
    for (const wanted of ['number (13 cifre)', 'string (10 cifre)']) assert.ok(text.includes(wanted), wanted);
    assert.ok(!text.includes('1738661'), 'valore non esposto');
  });

  check('scrub maschera i segreti registrati (minuscoli e maiuscoli)', () => {
    addSecret('mario.rossi@example.com');
    assert.equal(scrub('ciao mario.rossi@example.com e MARIO.ROSSI@Example.COM!'), 'ciao *** e ***!');
    secrets.clear();
  });

  print(`Self-test completato: ${passed} controlli superati.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const USAGE = `Uso: node scripts/probe-uconnect.mjs [opzioni]
  (nessuna)         elenca veicoli e servizi abilitati
  --status          legge anche stato/porte/posizione/manutenzione/vhr e stampa solo la STRUTTURA
  --region <R>      EU (default) | US | ASIA: cambia regione solo se il login fallisce per quel motivo
  --dump [file]     scrive la struttura sanitizzata in un file (default: ./probe-uconnect-struttura.json)
  --selftest        controlli offline della firma SigV4 (nessuna rete, nessuna credenziale)
  --help            questo messaggio`;

function parseArgs(argv) {
  const opts = { region: 'EU', status: false, dump: null, selftest: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--selftest') opts.selftest = true;
    else if (arg === '--status') opts.status = true;
    else if (arg === '--region') opts.region = String(argv[++i] ?? '').toUpperCase();
    else if (arg === '--dump') opts.dump = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'probe-uconnect-struttura.json';
    else if (arg === '--help' || arg === '-h') {
      print(USAGE);
      process.exit(0);
    } else throw new ProbeError(`Argomento non riconosciuto: ${arg.startsWith('--') ? arg : '(ignorato)'}`, { hint: USAGE });
  }
  if (!REGIONS[opts.region]) throw new ProbeError(`Regione non valida. Valori ammessi: ${Object.keys(REGIONS).join(', ')}.`);
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selftest) return selfTest();

  if (typeof Headers.prototype.getSetCookie !== 'function') throw new ProbeError('Serve Node 20 o superiore.');
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new ProbeError('Serve un terminale interattivo (email e password si inseriscono a mano, mai da argomenti o variabili).');
  }

  const brand = REGIONS[opts.region];
  print(`Sonda SOLA LETTURA di My Alfa Connect (configurazione ${brand.name}).`);
  print('Nessun comando viene inviato all\'auto. Verra\' fatto UN SOLO tentativo di login.');
  print();

  // Both are read hidden: a visible email would stay in the scrollback and could be pasted by mistake.
  const email = (await promptHidden('Email del tuo account My Alfa Connect (non viene mostrata): ')).trim();
  const password = await promptHidden('Password (non viene mostrata): ');
  if (!email || !password) throw new ProbeError('Email o password vuote.');
  addSecret(email);
  addSecret(password);

  const [local, domain = ''] = email.split('@');
  print(`Account: ${local.slice(0, 1)}***@${domain ? domain : '?'}`);
  const answer = await promptLine('Procedere con UN solo tentativo di login? [s/N] ');
  if (!/^(s|si|sì|y|yes)$/i.test(answer)) throw new ProbeError('Annullato: nessun login effettuato.');

  print('Login in corso...');
  const { uid, aws } = await login(brand, email, password);
  const ctx = { brand, uid, aws };
  print('Login riuscito. Leggo l\'elenco veicoli...');
  print();
  print('===== DA QUI IN POI E\' INCOLLABILE (le righe sopra no) =====');

  const list = await apiGet(ctx, `/v4/accounts/${awsQuote(uid)}/vehicles/`, {
    stage: 'ALL',
    sdp: 'ALL',
    brand: brand.brandCode,
  });
  const vehicles = Array.isArray(list.vehicles) ? list.vehicles : [];
  for (const v of vehicles) addSecret(v.vin);
  if (!vehicles.length) {
    print('Nessun veicolo trovato su questo account (stage=ALL, sdp=ALL).');
  }
  vehicles.forEach((v, i) => printVehicle(v, i, vehicles.length));
  // Registered after printing (the nickname is never printed) so that a model with the
  // same name is not masked above, while later output and error text still are.
  for (const v of vehicles) addSecret(v.nickname);

  const dump = { generato: 'struttura sanitizzata, nessun valore personale', regione: opts.region, veicoli: [] };
  for (const [i, vehicle] of vehicles.entries()) {
    const entry = { veicolo: i + 1, servizi: serviceMap(vehicle), struttura_elenco: shapeOf(vehicle) };
    delete entry.struttura_elenco.services;
    if (opts.status) {
      entry.strutture = {};
      print(`=== STRUTTURA letture di sola lettura - veicolo ${i + 1} (valori personali omessi) ===`);
      const reads = [
        { label: 'Stato veicolo (status v3/v4)', run: () => getVehicleStatus(ctx, vehicle) },
        ...STATUS_ENDPOINTS.filter((e) => !e.requires || enabledServices(vehicle).has(e.requires)).map((e) => ({
          label: e.label,
          run: () => apiGet(ctx, vehiclePath(ctx, e.version, vehicle.vin, e.suffix)),
        })),
      ];
      for (const read of reads) {
        print(`--- ${read.label}`);
        try {
          const shape = shapeOf(await read.run());
          entry.strutture[read.label] = shape;
          print(JSON.stringify(shape, null, 2));
        } catch (err) {
          entry.strutture[read.label] = `errore: ${err.message}`;
          print(`  (non disponibile) ${err.message}`);
        }
      }
      print();
    }
    dump.veicoli.push(entry);
  }

  if (opts.dump) {
    // The text is scrubbed before it touches the disk, so it can only contain sanitized content.
    // Flag 'wx': never overwrite an existing file.
    try {
      writeFileSync(opts.dump, `${scrub(JSON.stringify(dump, null, 2))}\n`, { mode: 0o600, flag: 'wx' });
      print(`Struttura sanitizzata scritta in: ${opts.dump} (controllala prima di condividerla).`);
    } catch (err) {
      print(
        err?.code === 'EEXIST'
          ? `Il file ${opts.dump} esiste gia': non lo sovrascrivo. Rilancia con --dump <altro-nome> (o cancellalo).`
          : `Impossibile scrivere ${opts.dump} (${err?.code ?? 'errore'}).`,
      );
    }
  }

  print('Fatto. Incolla al planner SOLO l\'output dopo la riga "DA QUI IN POI E\' INCOLLABILE": non incollare nulla di quanto scritto sopra o digitato da te.');
}

/** Prints a failure in Italian, with the likely cause, and sets the exit code. */
function fail(err) {
  if (!(err instanceof ProbeError)) {
    print(`Errore inatteso: ${err?.name ?? 'Error'}: ${err?.message ?? err}`);
    process.exitCode = 1;
    return;
  }
  print();
  print(`ERRORE: ${err.message}`);
  if (err.hint) print(err.hint);
  if (/Login rifiutato/.test(err.message)) {
    print('Cause probabili:');
    print('  - email o password errate (o account creato solo con login Apple/Google, senza password);');
    print('  - account registrato in un\'altra regione: riprova UNA volta con --region US oppure --region ASIA;');
    print('  - account bloccato temporaneamente dopo troppi tentativi: attendi qualche minuto.');
    print('Lo script NON ritenta da solo. Ogni nuovo avvio e\' un nuovo tentativo di login: non insistere.');
  } else if (err.status === 401 || err.status === 403) {
    print('Il server ha rifiutato le credenziali AWS temporanee o l\'account non ha accesso a questa API. Nessun nuovo login automatico.');
  }
  process.exitCode = 1;
}

// Run only when executed directly, so `sign` can be imported by ad-hoc checks.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(fail);
}

export { sign };
