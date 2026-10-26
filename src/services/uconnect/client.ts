/**
 * Client of the Uconnect vehicle API: keeps the session, renews it silently and
 * performs SIGNED GET requests. The only non-GET is postCommand, locked to an allowlist of
 * PIN authentication plus lock/unlock/lights/horn.
 */
import { ALFA_ROMEO_EU as brand } from './brand';
import { login, type Session } from './auth';
import type { StoredCredentials } from './credentials';
import { UconnectError } from './errors';
import { clearLog } from './recorder';
import { apiHeaders, buildQuery, sendRequest, type HttpResponse } from './http';
import { awsQuote, signRequest } from './sigv4';

/** Sessions closer than this to their expiry are renewed before use... */
const RENEW_MARGIN_MS = 5 * 60_000;
/** ...but never a session younger than this: with a wrong phone clock every session would look expired. */
const MIN_SESSION_AGE_MS = 60_000;

/** The only command names that may ever be POSTed (py-uconnect command.py: lock, unlock, lights, lights+horn). */
export const ALLOWED_COMMANDS = ['RDL', 'RDU', 'ROLIGHTS', 'HBLF'];

const SEGMENT = '[A-Za-z0-9%._~-]+';
const PIN_AUTH_PATH = new RegExp(`^/v1/accounts/\\{uid\\}/${SEGMENT}/pin/authenticate/$`);
const COMMAND_PATH = new RegExp(`^/v1/accounts/\\{uid\\}/vehicles/${SEGMENT}/remote/$`);

/** '.' / '..' segments (also percent-encoded) could climb out of the allowed path. */
const DOT_SEGMENT = /^(\.|%2e){1,2}$/i;

const hasExactKeys = (body: Record<string, unknown>, keys: string[]) =>
  Object.keys(body).sort().join() === [...keys].sort().join();

/** Throws unless this is one of the two POSTs the command module is allowed to make. */
function assertAllowedPost(target: 'api' | 'mfa', path: string, body: Record<string, string>) {
  const allowed =
    !path.split('/').some((segment) => DOT_SEGMENT.test(segment)) &&
    (target === 'mfa'
      ? PIN_AUTH_PATH.test(path) && hasExactKeys(body, ['pin'])
      : COMMAND_PATH.test(path) && hasExactKeys(body, ['command', 'pinAuth']) && ALLOWED_COMMANDS.includes(body.command));
  if (!allowed) throw new UconnectError('unavailable', { detail: 'richiesta non consentita' });
}

/** The gateway answers 401/403 with a message mentioning an expired token/signature (py-uconnect api.py). */
export function isExpiredTokenError(status: number, json: unknown) {
  if (status !== 401 && status !== 403) return false;
  const message = typeof json === 'object' && json !== null ? (json as { message?: unknown }).message : undefined;
  const text = String(message ?? '').toLowerCase();
  return text.includes('expired') && (text.includes('token') || text.includes('signature'));
}

function errorForStatus(status: number) {
  if (status === 404) return new UconnectError('not_found', { status });
  // UNVERIFIED mapping: 504 is assumed to mean "the car did not answer".
  if (status === 504) return new UconnectError('vehicle_unreachable', { status });
  return new UconnectError('unavailable', { status, detail: `HTTP ${status}` });
}

export class UconnectClient {
  private session: Session | null = null;
  private loginInFlight: Promise<Session> | null = null;
  /** Bumped by signOut: a login that finishes after it is discarded. */
  private epoch = 0;

  /** `loadCredentials` supplies the stored email/password for the silent re-login. */
  constructor(private readonly loadCredentials: () => Promise<StoredCredentials | null>) {}

  /** The one explicit login of a user action. Replaces any previous session. */
  async signIn(email: string, password: string): Promise<void> {
    await this.shareLogin(() => login(email, password));
  }

  /** Whether a usable session is already held (no login needed). */
  hasValidSession(): boolean {
    return this.session !== null && !this.needsRenewal(this.session);
  }

  /** Forgets the in-memory session and any login in progress (the caller deletes the stored credentials). */
  signOut() {
    this.epoch += 1;
    clearLog();
    this.session = null;
    this.loginInFlight = null;
  }

  /** Signed GET on the vehicle API; `{uid}` in `path` is replaced by the account uid. */
  async get(path: string, params?: Record<string, string>): Promise<unknown> {
    // At most two rounds: the second one only after a silent re-login on an "expired" answer.
    for (let attempt = 0; ; attempt += 1) {
      const session = await this.ensureSession();
      const { status, json } = await this.signedGet(session, path, params);
      if (status < 400) return json ?? {};
      if (isExpiredTokenError(status, json)) {
        // A session just created and already "expired" (or still expired after a re-login) points to the
        // phone clock, not to the password: do not log in again and do not treat it as a credentials refusal.
        if (attempt > 0 || Date.now() - session.createdAt < MIN_SESSION_AGE_MS) throw new UconnectError('session_rejected', { status });
        // Only drop the session that failed: another request may already have renewed it.
        if (this.session === session) this.session = null;
        continue;
      }
      throw errorForStatus(status);
    }
  }

  /**
   * Signed POST, ONLY for PIN authentication and the four allowlisted commands (see assertAllowedPost).
   * Never retried here, whatever the answer: the caller maps the raw response. A session is renewed
   * beforehand if needed, but an "expired" answer is not followed by a second POST.
   */
  async postCommand(target: 'api' | 'mfa', path: string, body: Record<string, string>): Promise<HttpResponse> {
    assertAllowedPost(target, path, body);
    const session = await this.ensureSession();
    const base = target === 'mfa' ? brand.mfaUrl : brand.apiUrl;
    const url = `${base}${path.replace('{uid}', awsQuote(session.uid))}`;
    const payload = JSON.stringify(body);
    const headers = apiHeaders(target === 'mfa' ? brand.mfaKey : brand.apiKey);
    Object.assign(headers, signRequest('POST', url, headers, payload, session.aws, brand.region, 'execute-api'));
    const response = await sendRequest('POST', url, { headers, body: payload });
    // The POST may already have reached the server: never resend it. Drop the stale session and let the user retry.
    if (isExpiredTokenError(response.status, response.json)) {
      if (this.session === session) this.session = null;
      throw new UconnectError('session_expired', { status: response.status });
    }
    return response;
  }

  private async ensureSession(): Promise<Session> {
    const current = this.session;
    if (current && !this.needsRenewal(current)) return current;
    // Business rule: one silent login with the stored credentials, shared by parallel requests.
    // A failed login is NOT retried here; the caller signs the user out when the credentials are refused.
    return this.shareLogin(async () => {
      const credentials = await this.loadCredentials();
      if (!credentials) throw new UconnectError('session_expired');
      return login(credentials.email, credentials.password);
    });
  }

  private needsRenewal(session: Session) {
    const now = Date.now();
    return session.expiresAt - now <= RENEW_MARGIN_MS && now - session.createdAt >= MIN_SESSION_AGE_MS;
  }

  /** Runs one login at a time: parallel callers share the same attempt instead of starting more. */
  private shareLogin(run: () => Promise<Session>): Promise<Session> {
    if (!this.loginInFlight) {
      const epoch = this.epoch;
      const attempt: Promise<Session> = run()
        .then((session) => {
          // Signed out while logging in: the result must not resurrect the session.
          if (epoch !== this.epoch) throw new UconnectError('session_expired');
          this.session = session;
          return session;
        })
        .finally(() => {
          if (this.loginInFlight === attempt) this.loginInFlight = null;
        });
      this.loginInFlight = attempt;
    }
    return this.loginInFlight;
  }

  private signedGet(session: Session, path: string, params?: Record<string, string>) {
    const query = params ? buildQuery(params) : '';
    const url = `${brand.apiUrl}${path.replace('{uid}', awsQuote(session.uid))}${query ? `?${query}` : ''}`;
    const headers = apiHeaders();
    Object.assign(headers, signRequest('GET', url, headers, '', session.aws, brand.region, 'execute-api'));
    return sendRequest('GET', url, { headers });
  }
}
