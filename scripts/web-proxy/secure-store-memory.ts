/**
 * Stand-in for expo-secure-store inside the local web proxy: credentials live only in this process's
 * memory (never on disk) and vanish when the proxy stops. Selected through tsconfig.json "paths".
 */
const store = new Map<string, string>();

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 0;

export async function setItemAsync(key: string, value: string, _options?: unknown): Promise<void> {
  store.set(key, value);
}

export async function getItemAsync(key: string, _options?: unknown): Promise<string | null> {
  return store.get(key) ?? null;
}

export async function deleteItemAsync(key: string, _options?: unknown): Promise<void> {
  store.delete(key);
}
