import type { Fault, RemoteCommand, ServiceRecord, Trip, VehicleService, VehicleStatus, WarningLight } from './types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const daysAgo = (d: number, h = 9) => {
  const date = new Date();
  date.setDate(date.getDate() - d);
  date.setHours(h, 15, 0, 0);
  return date.toISOString();
};

export const DEMO_PIN = '1234';

let status: VehicleStatus = {
  vin: 'ZAREAEKN0N7XXXXXX',
  name: 'La mia Giulia',
  model: 'Alfa Romeo Giulia Veloce',
  year: 2022,
  odometerKm: 38412,
  fuelPercent: 62,
  fuelLow: false,
  rangeKm: 418,
  lock: 'locked',
  doors: { fl: 'locked', fr: 'locked', rl: 'locked', rr: 'locked', trunk: 'locked' },
  windowsClosed: true,
  tyres: {
    fl: { bar: 2.4, warning: false },
    fr: { bar: 2.4, warning: false },
    rl: { bar: 2.2, warning: true },
    rr: { bar: 2.5, warning: false },
  },
  oilLevelPercent: 78,
  batteryVoltage: 12.6,
  nextServiceKm: 6588,
  nextServiceDays: 120,
  location: { lat: 45.4642, lng: 9.19, approximate: false, updatedAt: now() },
  updatedAt: now(),
  partial: false,
  supportedCommands: ['lock', 'unlock', 'lights', 'horn', 'refresh'],
};

const trips: Trip[] = [
  { id: 't1', startedAt: daysAgo(0, 8), km: 18.4 },
  { id: 't2', startedAt: daysAgo(1, 18), km: 19.1 },
  { id: 't3', startedAt: daysAgo(2, 10), km: 51.7 },
];

const faults: Fault[] = [
  {
    code: 'TPMS-RL',
    title: 'Pressione pneumatico posteriore sinistro bassa',
    severity: 'warning',
    detectedAt: daysAgo(1, 7),
    advice: 'Gonfia a 2,5 bar alla prossima occasione. Controlla eventuali forature.',
  },
  {
    code: 'INFO-WASH',
    title: 'Livello liquido lavavetri basso',
    severity: 'info',
    detectedAt: daysAgo(4, 12),
    advice: 'Rabbocca il serbatoio del liquido lavavetri.',
  },
];

const warningLights: WarningLight[] = [
  { code: 'DpfDefWarningStatus', label: 'Filtro antiparticolato / AdBlue', state: 'ok' },
  { code: 'autoOilChange', label: 'Promemoria cambio olio', state: 'ok' },
  { code: 'ABSIndLampStatus', label: 'ABS', state: 'ok' },
];

const history: ServiceRecord[] = [
  { id: 's1', date: '2026-03-10', km: 30120, title: 'Tagliando 30.000 km', workshop: 'Alfa Romeo Milano Centro' },
  { id: 's2', date: '2025-11-02', km: 24800, title: 'Cambio pneumatici invernali', workshop: 'Gommista Rossi' },
  { id: 's3', date: '2025-03-18', km: 15300, title: 'Tagliando 15.000 km', workshop: 'Alfa Romeo Milano Centro' },
];

export const mockVehicleService: VehicleService = {
  async restoreSession() {
    return true;
  },
  async signIn() {},
  async signOut() {},

  async getStatus() {
    await wait(400);
    return { ...status };
  },

  async sendCommand(cmd: RemoteCommand, pin: string) {
    await wait(1600);
    if (cmd !== 'refresh' && pin !== DEMO_PIN) throw new Error('PIN non corretto');
    if (cmd === 'lock') status = { ...status, lock: 'locked' };
    if (cmd === 'unlock') status = { ...status, lock: 'unlocked' };
    status = { ...status, updatedAt: now(), location: status.location && { ...status.location, updatedAt: now() } };
  },

  async getTrips() {
    await wait(300);
    return trips;
  },

  async getFaults() {
    await wait(300);
    return faults;
  },

  async getWarningLights() {
    await wait(300);
    return warningLights;
  },

  async getServiceHistory() {
    await wait(300);
    return history;
  },
};
