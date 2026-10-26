import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import type {
  AppNotification,
  Fault,
  Geofence,
  RemoteCommand,
  ServiceRecord,
  Trip,
  VehicleService,
  VehicleStatus,
  WarningLight,
} from '@/services/types';
import { errorMessage, isCredentialRejection, UconnectError } from '@/services/uconnect/errors';

const STORAGE_KEY = 'alfa-connect-plus/user-data/v1';

/** The demo build seeded these fake notifications; they must never show up as real events. */
const LEGACY_DEMO_NOTIFICATION_IDS = ['n1', 'n2'];

export type Reminder = { id: string; title: string; dueDate: string };
export type Settings = {
  notifySecurity: boolean;
  notifyService: boolean;
  notifyFuel: boolean;
  lowFuelPercent: number;
  homeAssistantUrl: string;
};

type UserData = {
  reminders: Reminder[];
  geofences: Geofence[];
  notifications: AppNotification[];
  settings: Settings;
};

const defaultUserData: UserData = {
  reminders: [],
  geofences: [],
  notifications: [],
  settings: {
    notifySecurity: true,
    notifyService: true,
    notifyFuel: true,
    lowFuelPercent: 15,
    homeAssistantUrl: '',
  },
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Reads persisted user data tolerantly: only the keys of the current UserData are kept (old builds
 * also saved `drivers` and `bookings`, now dropped) and a value of the wrong type falls back to its default.
 */
function readUserData(raw: string): UserData {
  const saved: unknown = JSON.parse(raw);
  if (!isRecord(saved)) return defaultUserData;
  const data = saved;
  // Elements that are not objects (e.g. a null in a hand-edited or corrupted array) are dropped, not thrown on.
  const list = <T,>(value: unknown, fallback: T[]) => (Array.isArray(value) ? (value.filter(isRecord) as T[]) : fallback);
  const savedSettings = isRecord(data.settings) ? data.settings : {};
  return {
    reminders: list(data.reminders, defaultUserData.reminders),
    geofences: list(data.geofences, defaultUserData.geofences),
    notifications: list<AppNotification>(data.notifications, defaultUserData.notifications).filter(
      (n) => !LEGACY_DEMO_NOTIFICATION_IDS.includes(n.id),
    ),
    settings: Object.fromEntries(
      Object.entries(defaultUserData.settings).map(([key, fallback]) => [
        key,
        typeof savedSettings[key] === typeof fallback ? savedSettings[key] : fallback,
      ]),
    ) as Settings,
  };
}

export type CommandState = { cmd: RemoteCommand; phase: 'confirm' | 'pin' | 'sending' | 'done' | 'error'; message?: string };
/** 'offline': stored credentials exist but the launch sign-in failed for a non-credential reason (retry, keep credentials). */
export type AuthState = 'loading' | 'signedOut' | 'offline' | 'signedIn';

type Store = UserData & {
  auth: AuthState;
  authError: string | null;
  signingIn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Retries the launch sign-in with the stored credentials (one attempt per call). */
  retryRestore: () => Promise<void>;
  signOut: () => Promise<void>;
  status: VehicleStatus | null;
  /** Message of the last failed status load (null when the last load worked). */
  loadError: string | null;
  /** For the lists, null means "unavailable" (not offered by the car or the read failed), [] means "none". */
  trips: Trip[] | null;
  faults: Fault[] | null;
  warningLights: WarningLight[] | null;
  history: ServiceRecord[] | null;
  refreshing: boolean;
  command: CommandState | null;
  refresh: () => Promise<void>;
  requestCommand: (cmd: RemoteCommand) => void;
  confirmCommand: () => void;
  submitPin: (pin: string) => Promise<void>;
  dismissCommand: () => void;
  update: (patch: Partial<UserData>) => void;
  addNotification: (n: Omit<AppNotification, 'id' | 'at' | 'read'>) => void;
};

const Ctx = createContext<Store | null>(null);

const commandLabels: Record<RemoteCommand, string> = {
  lock: 'Veicolo bloccato',
  unlock: 'Veicolo sbloccato',
  lights: 'Luci lampeggiate',
  horn: 'Luci e clacson attivati',
  refresh: 'Stato aggiornato',
};

export function VehicleProvider({ service, children }: { service: VehicleService; children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [status, setStatus] = useState<VehicleStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [faults, setFaults] = useState<Fault[] | null>(null);
  const [warningLights, setWarningLights] = useState<WarningLight[] | null>(null);
  const [history, setHistory] = useState<ServiceRecord[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [command, setCommand] = useState<CommandState | null>(null);
  const [userData, setUserData] = useState<UserData>(defaultUserData);
  const [loaded, setLoaded] = useState(false);
  const refreshInFlight = useRef(false);
  /** Bumped when the session ends: answers of requests started before it are ignored. */
  const generation = useRef(0);
  const commandInFlight = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setUserData(readUserData(raw));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(userData)).catch(() => {});
  }, [userData, loaded]);

  /**
   * The session ended: credential problems go back to the form (and delete the refused credentials),
   * any other failure at launch keeps them and shows the retry screen.
   */
  const endSession = useCallback(
    (e: unknown) => {
      generation.current += 1;
      setStatus(null);
      setTrips(null);
      setFaults(null);
      setWarningLights(null);
      setHistory(null);
      setAuthError(errorMessage(e));
      if (isCredentialRejection(e)) {
        setAuth('signedOut');
        service.signOut().catch(() => {});
      } else {
        setAuth('offline');
      }
    },
    [service],
  );

  const restore = useCallback(
    () => service.restoreSession().then((restored) => setAuth(restored ? 'signedIn' : 'signedOut')).catch(endSession),
    [service, endSession],
  );

  // One silent sign-in attempt at launch with the stored credentials (no automatic retry if it fails).
  useEffect(() => {
    restore();
  }, [restore]);

  const retryRestore = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    await restore();
    setSigningIn(false);
  }, [restore]);

  // Business rule: only the status is essential; trips, faults, warning lights and history may each be unavailable.
  const fetchAll = useCallback(async () => {
    const started = generation.current;
    const results = await Promise.allSettled([
      service.getStatus(),
      service.getTrips(),
      service.getFaults(),
      service.getWarningLights(),
      service.getServiceHistory(),
    ]);
    return { started, results };
  }, [service]);

  const apply = useCallback(
    ({ started, results: [s, t, f, w, h] }: Awaited<ReturnType<typeof fetchAll>>) => {
      if (started !== generation.current) return; // signed out meanwhile: drop the late answer
      if (s.status === 'fulfilled') {
        setStatus(s.value);
        setLoadError(null);
      } else if (isCredentialRejection(s.reason)) {
        endSession(s.reason);
        return;
      } else {
        setLoadError(errorMessage(s.reason));
      }
      setTrips(t.status === 'fulfilled' ? t.value : null);
      setFaults(f.status === 'fulfilled' ? f.value : null);
      setWarningLights(w.status === 'fulfilled' ? w.value : null);
      setHistory(h.status === 'fulfilled' ? h.value : null);
    },
    [endSession],
  );

  useEffect(() => {
    if (auth === 'signedIn') fetchAll().then(apply);
  }, [auth, fetchAll, apply]);

  const refresh = useCallback(async () => {
    // One user action = one load: ignore further pulls while one is running (it may involve a login).
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      apply(await fetchAll());
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, [fetchAll, apply]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setSigningIn(true);
      setAuthError(null);
      try {
        await service.signIn(email.trim(), password);
        setAuth('signedIn');
      } catch (e) {
        setAuthError(errorMessage(e));
      } finally {
        setSigningIn(false);
      }
    },
    [service],
  );

  const signOut = useCallback(async () => {
    generation.current += 1;
    setStatus(null);
    setLoadError(null);
    setTrips(null);
    setFaults(null);
    setWarningLights(null);
    setHistory(null);
    setAuthError(null);
    setAuth('signedOut');
    try {
      await service.signOut();
    } catch {
      setAuthError('Impossibile eliminare le credenziali salvate su questo dispositivo.');
    }
  }, [service]);

  const update = useCallback((patch: Partial<UserData>) => setUserData((d) => ({ ...d, ...patch })), []);

  const addNotification = useCallback((n: Omit<AppNotification, 'id' | 'at' | 'read'>) => {
    setUserData((d) => ({
      ...d,
      notifications: [{ ...n, id: String(Date.now()), at: new Date().toISOString(), read: false }, ...d.notifications],
    }));
  }, []);

  // Locking/unlocking asks "are you sure?" first; lights and horn go straight to the PIN.
  const requestCommand = useCallback(
    (cmd: RemoteCommand) => setCommand({ cmd, phase: cmd === 'lock' || cmd === 'unlock' ? 'confirm' : 'pin' }),
    [],
  );

  const confirmCommand = useCallback(() => setCommand((c) => (c?.phase === 'confirm' ? { cmd: c.cmd, phase: 'pin' } : c)), []);

  const submitPin = useCallback(
    async (pin: string) => {
      // One attempt per user action: a second submit while one is running (or outside the PIN step) is ignored.
      if (!command || command.phase !== 'pin' || commandInFlight.current) return;
      commandInFlight.current = true;
      const { cmd } = command;
      setCommand({ cmd, phase: 'sending' });
      try {
        await service.sendCommand(cmd, pin);
        setCommand({ cmd, phase: 'done', message: commandLabels[cmd] });
        if (cmd === 'lock' || cmd === 'unlock') addNotification({ kind: 'security', title: commandLabels[cmd], body: 'Comando remoto eseguito dall’app.' });
        fetchAll().then(apply); // show the new lock state
      } catch (e) {
        setCommand({ cmd, phase: 'error', message: errorMessage(e) });
        // The car accepted the command but never confirmed: it may still have acted, so show the real state.
        if (e instanceof UconnectError && e.kind === 'no_confirmation') fetchAll().then(apply);
      } finally {
        commandInFlight.current = false;
      }
    },
    [command, service, addNotification, fetchAll, apply],
  );

  const dismissCommand = useCallback(() => setCommand(null), []);

  return (
    <Ctx.Provider
      value={{
        ...userData,
        auth,
        authError,
        signingIn,
        signIn,
        retryRestore,
        signOut,
        status,
        loadError,
        trips,
        faults,
        warningLights,
        history,
        refreshing,
        command,
        refresh,
        requestCommand,
        confirmCommand,
        submitPin,
        dismissCommand,
        update,
        addNotification,
      }}>
      {children}
    </Ctx.Provider>
  );
}

export function useVehicle() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useVehicle must be used inside VehicleProvider');
  return ctx;
}
