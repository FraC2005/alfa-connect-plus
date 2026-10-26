/**
 * Pure mappers from the loosely typed Uconnect JSON to the app's domain types.
 * Ported from py-uconnect models.py (field paths of the vehicle list, status, remote status and
 * location are those verified against its test fixtures). Numbers and booleans often arrive as
 * strings and missing values sometimes as "null". Anything missing or in an unknown unit becomes
 * `null`: nothing is ever invented.
 *
 * UNVERIFIED shapes: maintenance history, vehicle health report (vhr) and trip report have no
 * published fixture. Their mappers read a few plausible field names defensively and return
 * `null` when the response is not recognised; align them with the output of
 * `scripts/probe-uconnect.mjs --status` before trusting them.
 */
import type { Fault, LockState, RemoteCommand, ServiceRecord, Tyre, Tyres, Trip, VehicleLocation, VehicleStatus, WarningLight } from '../types';
import { UconnectError } from './errors';

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

// --- typed accessors (py-uconnect get_*) -----------------------------------------------------

/** Nested lookup; the API's "null" string counts as missing. */
function dig(node: unknown, ...keys: (string | number)[]): unknown {
  let cur = node;
  for (const key of keys) {
    if (isRec(cur)) cur = cur[String(key)];
    else if (Array.isArray(cur) && typeof key === 'number') cur = cur[key];
    else return undefined;
  }
  return cur === 'null' ? undefined : cur;
}

const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const num = (node: unknown, ...keys: (string | number)[]) => toNum(dig(node, ...keys));

const str = (node: unknown, ...keys: (string | number)[]): string | null => {
  const v = dig(node, ...keys);
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
};

const bool = (node: unknown, ...keys: (string | number)[]): boolean | null => {
  const v = dig(node, ...keys);
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string' && (v.toLowerCase() === 'true' || v.toLowerCase() === 'false')) return v.toLowerCase() === 'true';
  return null;
};

/** Whether a status string equals `expected`; "NA" and empty values mean "not reported" (null). */
function is(node: unknown, expected: string, ...keys: (string | number)[]): boolean | null {
  const v = str(node, ...keys);
  if (v === null || v === '' || v.toUpperCase() === 'NA') return null;
  return v.toUpperCase() === expected.toUpperCase();
}

/** Millisecond Unix timestamp (number or numeric string) or ISO string -> ISO string. */
function toIso(v: unknown): string | null {
  const n = toNum(v);
  const date = n !== null ? new Date(n) : typeof v === 'string' ? new Date(v) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

// --- units: unknown units give null, never a guess ------------------------------------------------

const KM_PER_MILE = 1.609344;
const BAR_PER_PSI = 0.0689476;

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

function toKm(value: number | null, unit: string | null): number | null {
  if (value === null || unit === null) return null;
  const u = unit.toLowerCase();
  if (u === 'km') return value;
  if (u === 'mi' || u === 'miles') return round(value * KM_PER_MILE, 1);
  return null;
}

function toBar(value: number | null, unit: string | null): number | null {
  if (value === null || unit === null) return null;
  const u = unit.toLowerCase();
  if (u === 'bar') return value;
  if (u === 'psi') return round(value * BAR_PER_PSI, 2);
  if (u === 'kpa') return round(value / 100, 2);
  return null;
}

/** Distance in km from a `{ unit, value }` node. */
const distanceKm = (node: unknown, ...keys: (string | number)[]) => toKm(num(node, ...keys, 'value'), str(node, ...keys, 'unit'));

// --- vehicle list -------------------------------------------------------------------------------

export type VehicleItem = { vin: string; raw: Rec; enabledServices: string[] };

/** Services that the car supports AND are enabled (py-uconnect apply_list_item). */
function enabledServices(raw: Rec): string[] {
  const services = Array.isArray(raw.services) ? raw.services : [];
  return services.flatMap((s) =>
    isRec(s) && typeof s.service === 'string' && bool(s, 'vehicleCapable') && bool(s, 'serviceEnabled') ? [s.service] : [],
  );
}

/**
 * First vehicle of the account (the owner has one car). Throws 'no_vehicle' when the list is
 * missing or empty, 'unavailable' when the response is not recognised.
 */
export function parseVehicleList(json: unknown): VehicleItem {
  const vehicles = dig(json, 'vehicles');
  if (!Array.isArray(vehicles)) throw new UconnectError('unavailable', { detail: 'elenco veicoli non riconosciuto' });
  const raw = vehicles.find((v): v is Rec => isRec(v) && typeof v.vin === 'string' && v.vin !== '');
  if (!raw) throw new UconnectError('no_vehicle');
  return { vin: raw.vin as string, raw, enabledServices: enabledServices(raw) };
}

/** Service -> command, from the services that enable each command in py-uconnect command.py. */
const COMMAND_SERVICES: [RemoteCommand, string][] = [
  ['lock', 'RDL'],
  ['unlock', 'RDU'],
  ['lights', 'ROLIGHTS'],
  ['horn', 'HBLF'],
  ['refresh', 'VF'],
];

export const supportedCommands = (services: string[]): RemoteCommand[] =>
  COMMAND_SERVICES.filter(([, service]) => services.includes(service)).map(([cmd]) => cmd);

// --- status -------------------------------------------------------------------------------------

function mapTyre(tyres: Rec, key: string): Tyre {
  return {
    bar: toBar(num(tyres, key, 'pressure', 'value'), str(tyres, key, 'pressure', 'unit')),
    warning: bool(tyres, key, 'warning'),
  };
}

function mapTyres(info: unknown): Tyres | null {
  const list = dig(info, 'vehicleInfo', 'tyrePressure');
  if (!Array.isArray(list)) return null;
  const byType: Rec = {};
  for (const t of list) if (isRec(t) && typeof t.type === 'string') byType[t.type] = t;
  return { fl: mapTyre(byType, 'FL'), fr: mapTyre(byType, 'FR'), rl: mapTyre(byType, 'RL'), rr: mapTyre(byType, 'RR') };
}

const lockOf = (locked: boolean | null): LockState | null => (locked === null ? null : locked ? 'locked' : 'unlocked');

/** Overall lock: "locked" only if every reported door is locked, "unlocked" if any is not, null if none is reported. */
function overallLock(states: (LockState | null)[]): LockState | null {
  const known = states.filter((s): s is LockState => s !== null);
  if (known.length === 0) return null;
  return known.every((s) => s === 'locked') ? 'locked' : 'unlocked';
}

function mapWindowsClosed(remote: unknown): boolean | null {
  const closed = ['driver', 'passenger', 'leftRear', 'rightRear'].map((w) => is(remote, 'CLOSED', 'windows', w, 'status'));
  const known = closed.filter((c): c is boolean => c !== null);
  return known.length === 0 ? null : known.every(Boolean);
}

function mapLocation(node: unknown): VehicleLocation | null {
  const lat = num(node, 'latitude');
  const lng = num(node, 'longitude');
  if (lat === null || lng === null) return null;
  return { lat, lng, approximate: bool(node, 'isLocationApprox'), updatedAt: toIso(dig(node, 'timeStamp')) };
}

/**
 * Builds the status from the vehicle-list item and the optional detail responses (null = that
 * endpoint failed or is not offered). The list item carries a snapshot used as fallback.
 * UNVERIFIED assumptions: `fuelAmountLevel` is a percentage and `oilLevel` is a percentage.
 */
export function mapStatus(item: VehicleItem, info: unknown, remote: unknown, location: unknown, partial = false): VehicleStatus {
  const source = info ?? { vehicleInfo: item.raw.vehicleInfo, timestamp: item.raw.vInfoTimestamp };
  const fuel = num(source, 'vehicleInfo', 'fuel', 'fuelAmountLevel');
  const doors = {
    fl: lockOf(is(remote, 'LOCKED', 'doors', 'driver', 'status')),
    fr: lockOf(is(remote, 'LOCKED', 'doors', 'passenger', 'status')),
    rl: lockOf(is(remote, 'LOCKED', 'doors', 'leftRear', 'status')),
    rr: lockOf(is(remote, 'LOCKED', 'doors', 'rightRear', 'status')),
    trunk: lockOf(is(remote, 'LOCKED', 'trunk', 'status')),
  };
  const days = num(source, 'vehicleInfo', 'daysToService');
  const oil = num(source, 'vehicleInfo', 'oilLevel', 'oilLevel');

  return {
    vin: item.vin,
    name: str(item.raw, 'nickname'),
    model: str(item.raw, 'modelDescription') ?? str(item.raw, 'model'),
    year: num(item.raw, 'year') ?? num(item.raw, 'tsoModelYear'),
    odometerKm: distanceKm(source, 'vehicleInfo', 'odometer', 'odometer'),
    fuelPercent: fuel !== null && fuel >= 0 && fuel <= 100 ? fuel : null,
    fuelLow: bool(source, 'vehicleInfo', 'fuel', 'isFuelLevelLow'),
    rangeKm: distanceKm(source, 'vehicleInfo', 'fuel', 'distanceToEmpty'),
    lock: overallLock(Object.values(doors)),
    doors,
    windowsClosed: mapWindowsClosed(remote),
    tyres: mapTyres(source),
    oilLevelPercent: oil !== null && oil >= 0 && oil <= 100 ? oil : null,
    batteryVoltage: num(source, 'vehicleInfo', 'batteryInfo', 'batteryVoltage', 'value'),
    nextServiceKm: distanceKm(source, 'vehicleInfo', 'distanceToService', 'distanceToService'),
    nextServiceDays: days !== null ? Math.round(days) : null,
    location: mapLocation(location ?? item.raw.location),
    updatedAt: toIso(dig(source, 'timestamp')) ?? toIso(dig(remote, 'timestamp')),
    partial,
    supportedCommands: supportedCommands(item.enabledServices),
  };
}

// --- UNVERIFIED shapes: maintenance history, vhr, trips ---------------------------------------------

/** The response itself or its first property that is an array of objects; null if neither exists. */
function recordList(json: unknown): Rec[] | null {
  const list = Array.isArray(json) ? json : isRec(json) ? Object.values(json).find(Array.isArray) : undefined;
  return list ? list.filter(isRec) : null;
}

/** First of the candidate keys holding a string/number. */
const pick = (item: Rec, keys: string[]) => keys.map((k) => str(item, k)).find((v) => v !== null) ?? null;

export function mapServiceHistory(json: unknown): ServiceRecord[] | null {
  const records = recordList(json);
  if (!records) return null;
  return records.flatMap((r, i) => {
    const date = toIso(r.date ?? r.serviceDate ?? r.timestamp);
    const title = pick(r, ['description', 'serviceType', 'title']);
    if (!date || !title) return [];
    return [
      {
        id: pick(r, ['id', 'recordId']) ?? String(i),
        date,
        title,
        // The unit of a plain number is unknown: only a { unit, value } node is converted.
        km: distanceKm(r, 'odometer') ?? distanceKm(r, 'mileage'),
        workshop: pick(r, ['dealerName', 'workshop']),
      },
    ];
  });
}

const FAULT_SEVERITY: [string, NonNullable<Fault['severity']>][] = [
  ['CRIT', 'critical'],
  ['WARN', 'warning'],
  ['INFO', 'info'],
];

export function mapFaults(json: unknown): Fault[] | null {
  const records = recordList(json);
  if (!records) return null;
  return records.flatMap((r, i) => {
    const title = pick(r, ['description', 'title', 'name']);
    if (!title) return [];
    const level = (pick(r, ['severity', 'priority']) ?? '').toUpperCase();
    return [
      {
        code: pick(r, ['code', 'id']) ?? String(i),
        title,
        severity: FAULT_SEVERITY.find(([prefix]) => level.startsWith(prefix))?.[1] ?? null,
        detectedAt: toIso(r.timestamp ?? r.date),
        advice: pick(r, ['advice', 'action']),
      },
    ];
  });
}

// --- vhr: dashboard warning lights ------------------------------------------------------------

/**
 * Known vhr itemKeys that are dashboard warning lights, with their Italian label (same whitelist
 * validated against the real reportCard.items(.items)* shape by scripts/probe-uconnect.mjs,
 * VHR_KNOWN_VALUE_ITEM_KEYS). tirePressureLF/RF/LR/RR(2) are covered by status.tyres and
 * odometer/daysToService/isServiceNeeded/vehicleStatus by other VehicleStatus fields: neither is
 * duplicated here. Any itemKey not in this map is ignored, never turned into a generic entry.
 */
const WARNING_LIGHT_LABELS: Record<string, string> = {
  ABSIndLampStatus: 'ABS',
  milLampStat: 'Spia motore',
  brakeFluid: 'Liquido freni',
  checkFuelCap: 'Tappo serbatoio',
  CHRGSystemFail: 'Sistema di ricarica',
  ETCIndLampStatus: 'Controllo trazione',
  oilPressure: 'Pressione olio',
  engineCoolant: 'Liquido di raffreddamento',
  airbagIndLamp: 'Airbag',
  TPMServiceWarningStatus: 'Sensori pressione pneumatici',
  WIFLampStatus: 'Spia generica',
  DpfDefWarningStatus: 'Filtro antiparticolato / AdBlue',
  filterWarningStatus: 'Filtro',
  transOverTemp: 'Temperatura cambio',
  autoOilChange: 'Promemoria cambio olio',
  headlightPositionLight: 'Luci di posizione',
  lowBeamLight: 'Anabbaglianti',
  highBeamLight: 'Abbaglianti',
};

const WARNING_LIGHT_OK = new Set(['0', 'off', 'normal', 'ok', 'none', 'inactive']);
const WARNING_LIGHT_WARNING = new Set(['1', 'on', 'active', 'fault', 'warning', 'fail', 'alert']);

/**
 * Interprets one vhr item's raw value as a dashboard-light state. No published fixture documents
 * the on/off encoding of THIS whitelist: the public hass-uconnect integration
 * (custom_components/uconnect/sensor.py, UconnectVhrSensor.extra_state_attributes) only forwards
 * reportCard values unchanged as Home Assistant attributes, it never interprets them as on/off, so
 * there is no reliable source to copy from. This is a conservative guess at the most common
 * encodings in similar diagnostic systems (booleans, 0/1, OFF/ON, NORMAL/FAULT...), unverified
 * against a real "warning" value: on the owner's account every one of these items has so far
 * always been null. Business rule: when a value is missing or not recognised this NEVER returns
 * 'ok' (that would falsely reassure the driver); it returns 'unknown' instead.
 */
function warningLightState(value: unknown): WarningLight['state'] {
  if (typeof value === 'boolean') return value ? 'warning' : 'ok';
  if (typeof value === 'number') return value === 0 ? 'ok' : value === 1 ? 'warning' : 'unknown';
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === '' || v === 'null') return 'unknown';
    if (WARNING_LIGHT_OK.has(v)) return 'ok';
    if (WARNING_LIGHT_WARNING.has(v)) return 'warning';
    return 'unknown';
  }
  return 'unknown';
}

/** Walks reportCard.items(.items)* at any depth, collecting the whitelisted itemKeys found. */
function collectWarningLights(items: unknown, out: WarningLight[]): void {
  if (!Array.isArray(items)) return;
  for (const entry of items) {
    if (!isRec(entry)) continue;
    const key = entry.itemKey;
    const label = typeof key === 'string' ? WARNING_LIGHT_LABELS[key] : undefined;
    if (label) out.push({ code: key as string, label, state: warningLightState(entry.value) });
    collectWarningLights(entry.items, out);
  }
}

/** Dashboard warning lights from the vhr report; null when reportCard.items is not the recognised shape. */
export function mapWarningLights(json: unknown): WarningLight[] | null {
  const items = dig(json, 'reportCard', 'items');
  if (!Array.isArray(items)) return null;
  const out: WarningLight[] = [];
  collectWarningLights(items, out);
  return out;
}

export function mapTrips(json: unknown): Trip[] | null {
  const records = recordList(json);
  if (!records) return null;
  return records.flatMap((r, i) => {
    const startedAt = toIso(r.startTime ?? r.startTimestamp ?? r.startDate);
    const km = distanceKm(r, 'distance') ?? distanceKm(r, 'totalDistance');
    if (!startedAt || km === null) return [];
    return [
      { id: pick(r, ['tripId', 'id']) ?? String(i), startedAt, km },
    ];
  });
}
