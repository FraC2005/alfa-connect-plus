/**
 * VehicleService backed by the unofficial FCA Uconnect cloud (ALFA_ROMEO_EU), READ-ONLY.
 * Reads use GET only; commands (lock, unlock, lights, lights+horn) go through uconnect/commands.ts with a fresh PIN each time.
 * Mobile only: the web build never instantiates this class (see services/index.ts).
 */
import type { Fault, RemoteCommand, ServiceRecord, Trip, VehicleService, VehicleStatus, WarningLight } from './types';
import { UconnectClient } from './uconnect/client';
import { ALFA_ROMEO_EU } from './uconnect/brand';
import { clearCredentials, loadCredentials, saveCredentials } from './uconnect/credentials';
import { runCommand } from './uconnect/commands';
import { UconnectError } from './uconnect/errors';
import { mapFaults, mapServiceHistory, mapStatus, mapTrips, mapWarningLights, parseVehicleList, type VehicleItem } from './uconnect/mappers';
import { awsQuote } from './uconnect/sigv4';

/** Statuses on which py-uconnect retries the status endpoint with the other API version. */
const STATUS_VERSION_FALLBACK = [400, 404, 502];

export class RealVehicleService implements VehicleService {
  private readonly client = new UconnectClient(loadCredentials);
  private vehicle: Promise<VehicleItem> | null = null;
  /** Last good raw answers of the status reads, reused when one of them fails (VIN-bound). */
  private lastParts: { vin: string; parts: unknown[] } | null = null;
  /** In-flight vhr/ read, shared by getFaults and getWarningLights so one refresh triggers one GET. */
  private vhrRequest: Promise<unknown> | null = null;

  async restoreSession(): Promise<boolean> {
    // Reloads (Fast Refresh, Expo Go) re-run this: never log in again while a valid session is held.
    if (this.client.hasValidSession()) return true;
    const credentials = await loadCredentials();
    if (!credentials) return false;
    await this.client.signIn(credentials.email, credentials.password);
    return true;
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.client.signIn(email, password);
    this.vehicle = null;
    this.lastParts = null;
    try {
      await saveCredentials({ email, password });
    } catch {
      // Signed in for this run only: without secure storage the next launch asks for the password again.
    }
  }

  async signOut(): Promise<void> {
    this.client.signOut();
    this.vehicle = null;
    this.lastParts = null;
    await clearCredentials();
  }

  async getStatus(): Promise<VehicleStatus> {
    const item = await this.vehicleItem(true);
    const base = this.vehiclePath(item);
    // Business rule: the status is the sum of three independent reads; one failing must not hide the others.
    const parts = await Promise.allSettled([
      this.statusInfo(item),
      this.client.get(`${base}/remote/status/`),
      this.client.get(`${base}/location/lastknown/`),
    ]);
    const failed = parts.filter((p): p is PromiseRejectedResult => p.status === 'rejected');
    if (failed.length === parts.length) throw failed[0].reason;
    // A failed read keeps the previous answer (flagged as partial) instead of blanking its fields.
    const previous = this.lastParts?.vin === item.vin ? this.lastParts.parts : [];
    const [info, remote, location] = parts.map((p, i) => (p.status === 'fulfilled' ? p.value : (previous[i] ?? null)));
    this.lastParts = { vin: item.vin, parts: [info, remote, location] };
    return mapStatus(item, info, remote, location, failed.length > 0);
  }

  /** One attempt: the caller refreshes the status afterwards. `pin` is used for this call only. */
  async sendCommand(cmd: RemoteCommand, pin: string): Promise<void> {
    await runCommand(this.client, await this.vehicleItem(), cmd, pin);
  }

  async getTrips(): Promise<Trip[] | null> {
    const item = await this.vehicleItem();
    if (!item.enabledServices.includes('TRIPREPORT')) return null;
    return this.optional(mapTrips, `${this.vehiclePath(item, 'v2')}/tripreport/trips/`);
  }

  async getFaults(): Promise<Fault[] | null> {
    const json = await this.vhr();
    return json === null ? null : mapFaults(json);
  }

  async getWarningLights(): Promise<WarningLight[] | null> {
    const json = await this.vhr();
    return json === null ? null : mapWarningLights(json);
  }

  async getServiceHistory(): Promise<ServiceRecord[] | null> {
    const item = await this.vehicleItem();
    return this.optional(mapServiceHistory, `${this.vehiclePath(item)}/maintenance/history/`);
  }

  /** The account's vehicle; concurrent callers share one request, `refresh` forces a new one. */
  private vehicleItem(refresh = false): Promise<VehicleItem> {
    if (refresh || !this.vehicle) {
      const request = this.client
        .get('/v4/accounts/{uid}/vehicles/', { stage: 'ALL', sdp: 'ALL', brand: ALFA_ROMEO_EU.brandCode })
        .then(parseVehicleList);
      this.vehicle = request;
      // A failed lookup must not stay cached.
      request.catch(() => {
        if (this.vehicle === request) this.vehicle = null;
      });
    }
    return this.vehicle;
  }

  private vehiclePath(item: VehicleItem, version = 'v1') {
    return `/${version}/accounts/{uid}/vehicles/${awsQuote(item.vin)}`;
  }

  /** v4 for cars with the CPCOOP service, v3 otherwise, falling back to the other one (as the official apps). */
  private async statusInfo(item: VehicleItem): Promise<unknown> {
    const versions = item.enabledServices.includes('CPCOOP') ? ['v4', 'v3'] : ['v3', 'v4'];
    for (const [i, version] of versions.entries()) {
      try {
        return await this.client.get(`${this.vehiclePath(item, version)}/status/`);
      } catch (e) {
        const unsupported = e instanceof UconnectError && STATUS_VERSION_FALLBACK.includes(e.status ?? 0);
        if (!unsupported || i === versions.length - 1) throw e;
      }
    }
    throw new UconnectError('unavailable');
  }

  /** Optional read: a 404 means the car does not offer it (null); any other failure propagates to the caller. */
  private async optional<T>(map: (json: unknown) => T | null, path: string): Promise<T | null> {
    try {
      return map(await this.client.get(path));
    } catch (e) {
      if (e instanceof UconnectError && e.kind === 'not_found') return null;
      throw e;
    }
  }

  /**
   * The raw vhr/ answer (null if the car does not offer it), fetched once even when getFaults and
   * getWarningLights are both called during the same refresh. Not `async`: the promise must be
   * assigned to `vhrRequest` synchronously, before either caller's first `await`, so two calls
   * made back-to-back (as Promise.allSettled does) share the same request instead of each starting
   * its own.
   */
  private vhr(): Promise<unknown> {
    if (!this.vhrRequest) {
      this.vhrRequest = this.vehicleItem()
        .then((item) => this.optional((json) => json, `${this.vehiclePath(item)}/vhr/`))
        .finally(() => {
          this.vhrRequest = null;
        });
    }
    return this.vhrRequest;
  }
}
