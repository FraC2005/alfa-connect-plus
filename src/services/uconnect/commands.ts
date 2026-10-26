/**
 * Remote commands: PIN authentication, one allowlisted POST, then polling of the result.
 * Endpoints, bodies and states are copied from py-uconnect (api.py pin_auth/_send_command,
 * client.py wait_for_operation, command.py); NOT yet confirmed against the real servers.
 *
 * Business rules:
 *  - exactly ONE attempt per user action: no retry of the PIN, of the command or of a login;
 *  - the PIN exists only as the argument of runCommand and in the pin/authenticate body; the pinAuth
 *    token is a local variable (not cached), so every command needs a fresh PIN from the user;
 *  - a command runs only if the car's enabled services allow it.
 * Error messages never contain the PIN, URLs or response bodies.
 */
import type { RemoteCommand } from '../types';
import type { UconnectClient } from './client';
import { isCredentialRejection, UconnectError } from './errors';
import { supportedCommands, type VehicleItem } from './mappers';
import { awsQuote } from './sigv4';

/** App command -> Uconnect command name. There is no separate horn command: HBLF flashes lights AND sounds the horn. */
const COMMAND_NAMES: Partial<Record<RemoteCommand, string>> = {
  lock: 'RDL',
  unlock: 'RDU',
  lights: 'ROLIGHTS',
  horn: 'HBLF',
};

/** Default service delivery platform for the PIN path when the vehicle reports none (py-uconnect DEFAULT_SDP). */
const DEFAULT_SDP = 'ignite';

export const POLL_INTERVAL_MS = 2_000;
export const POLL_TIMEOUT_MS = 60_000;

const SUCCEEDED = ['success', 'succeeded', 'completed', 'complete'];
const FAILED = ['failure', 'failed', 'error', 'rejected', 'timeout'];

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Injectable for tests only. */
export type Timing = { sleep?: (ms: number) => Promise<void>; now?: () => number };

/** Exchanges the PIN for a pinAuth token. HTTP 423 = PIN locked; any other 4xx = wrong PIN. */
async function authenticatePin(client: UconnectClient, item: VehicleItem, pin: string): Promise<string> {
  const sdp = typeof item.raw.sdp === 'string' && item.raw.sdp ? item.raw.sdp : DEFAULT_SDP;
  const { status, json } = await client.postCommand('mfa', `/v1/accounts/{uid}/${awsQuote(sdp)}/pin/authenticate/`, {
    pin: btoa(pin),
  });
  if (status === 423) throw new UconnectError('pin_locked', { status });
  // Only 400/401/403 mean "wrong PIN" (UNVERIFIED); the status is shown so a false "wrong PIN" can be
  // spotted after ONE attempt. Any other 4xx is not blamed on the PIN.
  if (status === 400 || status === 401 || status === 403) throw new UconnectError('pin_wrong', { status, detail: `HTTP ${status}` });
  const token = isRec(json) ? json.token : undefined;
  if (status >= 400 || typeof token !== 'string' || !token) {
    throw new UconnectError('unavailable', { status, detail: `PIN HTTP ${status}` });
  }
  return token;
}

/** Sends the command and returns the correlation id of the asynchronous operation. */
async function sendCommand(client: UconnectClient, item: VehicleItem, name: string, pinAuth: string): Promise<string> {
  const path = `/v1/accounts/{uid}/vehicles/${awsQuote(item.vin)}/remote/`;
  const { status, json } = await client.postCommand('api', path, { command: name, pinAuth });
  // UNVERIFIED: 400/403/404 are the statuses py-uconnect treats as "this variant is not supported".
  if (status === 400 || status === 403 || status === 404) throw new UconnectError('command_unavailable', { status, detail: `HTTP ${status}` });
  if (status >= 400) {
    throw new UconnectError(status === 502 || status === 504 ? 'vehicle_unreachable' : 'unavailable', { status, detail: `HTTP ${status}` });
  }
  const correlationId = isRec(json) ? json.correlationId : undefined;
  const accepted = isRec(json) ? String(json.responseStatus ?? json.requestStatus ?? '').toLowerCase() : '';
  // Before acceptance a failure means the command did not go out: "unreachable" is accurate here.
  if (typeof correlationId !== 'string' || !correlationId || FAILED.includes(accepted)) throw new UconnectError('vehicle_unreachable');
  return correlationId;
}

/** Polls the operation every 2 s for at most 60 s. Success resolves; failure or timeout = 'no_confirmation'. */
async function waitForResult(client: UconnectClient, item: VehicleItem, correlationId: string, timing: Timing) {
  const sleep = timing.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = timing.now ?? Date.now;
  const base = `/v1/accounts/{uid}/vehicles/${awsQuote(item.vin)}/remote/${awsQuote(correlationId)}`;
  // `last-status` is used by the apps for remote commands, `status` for other operations; an endpoint answering 404 is dropped.
  const endpoints = [`${base}/last-status/`, `${base}/status/`];
  const deadline = now() + POLL_TIMEOUT_MS;

  // The command was accepted: from here on a failure or timeout means "no confirmation", not "unreachable".
  while (endpoints.length > 0 && now() + POLL_INTERVAL_MS <= deadline) {
    await sleep(POLL_INTERVAL_MS);
    for (const endpoint of [...endpoints]) {
      if (now() > deadline) throw new UconnectError('no_confirmation');
      let state = '';
      try {
        const json = await client.get(endpoint);
        state = isRec(json) ? String(json.status ?? json.responseStatus ?? '').toLowerCase() : '';
      } catch (e) {
        // Never loop on login problems: a refused/rejected session ends the wait at once.
        if (e instanceof UconnectError && (isCredentialRejection(e) || e.kind === 'session_rejected')) throw e;
        // Other read errors are transient (a 404 drops that endpoint): keep polling until the deadline.
        if (e instanceof UconnectError && e.kind === 'not_found') endpoints.splice(endpoints.indexOf(endpoint), 1);
      }
      if (SUCCEEDED.includes(state)) return;
      if (FAILED.includes(state)) throw new UconnectError('no_confirmation');
    }
  }
  throw new UconnectError('no_confirmation');
}

/** Runs one command end to end. Resolves when the car reports success; rejects with an Italian-message UconnectError. */
export async function runCommand(client: UconnectClient, item: VehicleItem, cmd: RemoteCommand, pin: string, timing: Timing = {}) {
  const name = COMMAND_NAMES[cmd];
  if (!name || !supportedCommands(item.enabledServices).includes(cmd)) throw new UconnectError('command_unavailable');
  // The real PIN length is unverified: accept 4-8 digits, send nothing for anything else.
  if (!/^\d{4,8}$/.test(pin)) throw new UconnectError('pin_wrong');

  const pinAuth = await authenticatePin(client, item, pin);
  const correlationId = await sendCommand(client, item, name, pinAuth);
  await waitForResult(client, item, correlationId, timing);
}
