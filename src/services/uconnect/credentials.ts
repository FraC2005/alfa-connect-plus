import * as SecureStore from 'expo-secure-store';

/** Email and password live ONLY in the platform secure storage (never AsyncStorage, never logged). */
export type StoredCredentials = { email: string; password: string };

const KEY = 'uconnect.credentials';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function saveCredentials(credentials: StoredCredentials): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(credentials), OPTIONS);
}

/** Null when nothing is stored or the entry is unreadable (treated as "signed out"). */
export async function loadCredentials(): Promise<StoredCredentials | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const { email, password } = parsed as Record<string, unknown>;
      if (typeof email === 'string' && typeof password === 'string' && email && password) return { email, password };
    }
  } catch {
    // Unreadable entry: same as no credentials.
  }
  return null;
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTIONS);
}
