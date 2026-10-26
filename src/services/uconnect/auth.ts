/**
 * Login flow: Gigya account login -> JWT -> authz token -> Cognito -> temporary AWS credentials.
 * Port of the approved probe script / py-uconnect auth.py. ONE call performs ONE login attempt
 * and never retries: Gigya may lock the account after repeated failures.
 */
import { ALFA_ROMEO_EU as brand, GIGYA_PARAMS, JWT_FIELDS, USER_AGENT } from './brand';
import { UconnectError } from './errors';
import { apiHeaders, buildQuery, sendRequest } from './http';
import type { AwsCredentials } from './sigv4';

export type Session = { uid: string; aws: AwsCredentials; expiresAt: number; createdAt: number };

// Gigya error codes, from memory of the Gigya docs (UNVERIFIED against the real servers).
const GIGYA_INVALID_CREDENTIALS = 403042;
const GIGYA_ACCOUNT_LOCKED = 403120;

/** Used if Cognito gives no usable expiry; a wrong guess only costs one silent re-login on an "expired" error. */
const FALLBACK_LIFETIME_MS = 30 * 60_000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One Gigya call; params go in the query string even for POST (as the web SDK does). */
async function gigya(method: 'GET' | 'POST', call: string, params: Record<string, string>) {
  const { status, json } = await sendRequest(method, `${brand.loginUrl}/${call}?${buildQuery(params)}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (status !== 200 || !isRecord(json)) throw new UconnectError('unavailable', { status, detail: `login HTTP ${status}` });

  const code = Number(json.errorCode ?? 0);
  if (json.statusCode !== 200 || code !== 0) {
    if (code === GIGYA_INVALID_CREDENTIALS) throw new UconnectError('invalid_credentials');
    if (code === GIGYA_ACCOUNT_LOCKED) throw new UconnectError('account_locked');
    throw new UconnectError('unavailable', { detail: `codice ${code}` });
  }
  return json;
}

/** Performs the whole login once and returns the account uid with temporary AWS credentials. */
export async function login(email: string, password: string): Promise<Session> {
  await gigya('GET', 'accounts.webSdkBootstrap', { apiKey: brand.loginApiKey });

  const session = await gigya('POST', 'accounts.login', {
    ...GIGYA_PARAMS,
    APIKey: brand.loginApiKey,
    loginID: email,
    password,
    sessionExpiration: '300',
    include: 'profile,data,emails,subscriptions,preferences',
  });
  const uid = session.UID;
  const loginToken = isRecord(session.sessionInfo) ? session.sessionInfo.login_token : undefined;
  if (typeof uid !== 'string' || typeof loginToken !== 'string') throw new UconnectError('unavailable', { detail: 'risposta login incompleta' });

  const jwt = await gigya('POST', 'accounts.getJWT', {
    ...GIGYA_PARAMS,
    APIKey: brand.loginApiKey,
    login_token: loginToken,
    fields: JWT_FIELDS,
  });
  if (typeof jwt.id_token !== 'string') throw new UconnectError('unavailable', { detail: 'JWT mancante' });

  // Exchange the Gigya JWT for a Cognito identity (this request is not signed).
  const authz = await sendRequest('POST', brand.tokenUrl, {
    headers: apiHeaders(),
    body: JSON.stringify({ gigya_token: jwt.id_token }),
  });
  const token = isRecord(authz.json) ? authz.json.Token : undefined;
  const identityId = isRecord(authz.json) ? authz.json.IdentityId : undefined;
  if (authz.status !== 200 || typeof token !== 'string' || typeof identityId !== 'string') {
    throw new UconnectError('unavailable', { status: authz.status, detail: `authz HTTP ${authz.status}` });
  }

  const cognito = await sendRequest('POST', `https://cognito-identity.${brand.region}.amazonaws.com/`, {
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityService.GetCredentialsForIdentity',
    },
    body: JSON.stringify({ IdentityId: identityId, Logins: { 'cognito-identity.amazonaws.com': token } }),
  });
  const c = isRecord(cognito.json) && isRecord(cognito.json.Credentials) ? cognito.json.Credentials : null;
  if (
    cognito.status !== 200 ||
    !c ||
    typeof c.AccessKeyId !== 'string' ||
    typeof c.SecretKey !== 'string' ||
    typeof c.SessionToken !== 'string'
  ) {
    throw new UconnectError('unavailable', { status: cognito.status, detail: `cognito HTTP ${cognito.status}` });
  }

  // `Expiration` is a Unix timestamp in seconds (py-uconnect: datetime.fromtimestamp(float(...))).
  const expirationSeconds = Number(c.Expiration);
  return {
    uid,
    aws: { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretKey, sessionToken: c.SessionToken },
    createdAt: Date.now(),
    expiresAt: Number.isFinite(expirationSeconds) ? expirationSeconds * 1000 : Date.now() + FALLBACK_LIFETIME_MS,
  };
}
