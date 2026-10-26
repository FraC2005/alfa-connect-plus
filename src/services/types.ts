/**
 * Domain types and the VehicleService contract.
 *
 * Rule: every value the cloud API may not supply is `null` (or the whole list is `null`),
 * never an invented constant. The UI shows "—" or hides the card for `null`.
 */

export type LockState = 'locked' | 'unlocked';

export type Tyre = { bar: number | null; warning: boolean | null };
export type Tyres = { fl: Tyre; fr: Tyre; rl: Tyre; rr: Tyre };

export type RemoteCommand = 'lock' | 'unlock' | 'lights' | 'horn' | 'refresh';

export type VehicleLocation = {
  lat: number;
  lng: number;
  /** The vehicle reports the position as approximate. */
  approximate: boolean | null;
  updatedAt: string | null;
};

export type VehicleStatus = {
  vin: string;
  /** Nickname chosen in the official app. */
  name: string | null;
  model: string | null;
  year: number | null;
  odometerKm: number | null;
  fuelPercent: number | null;
  fuelLow: boolean | null;
  rangeKm: number | null;
  /** Overall lock state: derived from the doors the car reports. */
  lock: LockState | null;
  /** The API reports locked/unlocked per door, not open/closed. */
  doors: { fl: LockState | null; fr: LockState | null; rl: LockState | null; rr: LockState | null; trunk: LockState | null };
  windowsClosed: boolean | null;
  tyres: Tyres | null;
  oilLevelPercent: number | null;
  batteryVoltage: number | null;
  nextServiceKm: number | null;
  nextServiceDays: number | null;
  location: VehicleLocation | null;
  updatedAt: string | null;
  /** Some reads failed on the last refresh: the affected values come from an earlier answer or are missing. */
  partial: boolean;
  /** Remote commands the enabled services of the car allow. */
  supportedCommands: RemoteCommand[];
};

export type Trip = {
  id: string;
  startedAt: string;
  km: number;
};

export type Fault = {
  code: string;
  title: string;
  severity: 'info' | 'warning' | 'critical' | null;
  detectedAt: string | null;
  advice: string | null;
};

export type WarningLight = {
  /** vhr itemKey (e.g. "DpfDefWarningStatus"), stable across refreshes. */
  code: string;
  /** Italian label for the dashboard light (e.g. "ABS", "Filtro antiparticolato / AdBlue"). */
  label: string;
  /** 'unknown' when the report omits the value or reports something this app does not recognise: never assumed 'ok'. */
  state: 'ok' | 'warning' | 'unknown';
};

export type ServiceRecord = {
  id: string;
  date: string;
  km: number | null;
  title: string;
  workshop: string | null;
};

export type AppNotification = {
  id: string;
  at: string;
  title: string;
  body: string;
  kind: 'security' | 'service' | 'fuel' | 'info';
  read: boolean;
};

export type Geofence = { id: string; name: string; radiusKm: number; enabled: boolean };

/**
 * List methods resolve to `null` when the car does not offer that data (service not enabled)
 * and reject when the read failed; the store turns both into "unavailable".
 */
export interface VehicleService {
  /** Silent sign-in with the stored credentials. Resolves false when none are stored. */
  restoreSession(): Promise<boolean>;
  signIn(email: string, password: string): Promise<void>;
  /** Forgets the session and deletes the stored credentials. */
  signOut(): Promise<void>;
  getStatus(): Promise<VehicleStatus>;
  /** One attempt, PIN needed for this action only. Resolves when the car confirms; the caller refreshes the status. */
  sendCommand(cmd: RemoteCommand, pin: string): Promise<void>;
  getTrips(): Promise<Trip[] | null>;
  getFaults(): Promise<Fault[] | null>;
  /** Dashboard warning lights (oil, FAP/AdBlue, ABS...) from the vehicle health report. */
  getWarningLights(): Promise<WarningLight[] | null>;
  getServiceHistory(): Promise<ServiceRecord[] | null>;
}
