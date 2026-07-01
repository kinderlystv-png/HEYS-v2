import * as SecureStore from 'expo-secure-store';

import type { StoredSession } from './types';

const SESSION_KEY = 'heys.mobile.session.v1';

export async function loadStoredSession(): Promise<StoredSession | null> {
  const available = await SecureStore.isAvailableAsync();
  if (!available) return null;

  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    await clearStoredSession();
    return null;
  }
}

export async function saveStoredSession(session: StoredSession): Promise<void> {
  const available = await SecureStore.isAvailableAsync();
  if (!available) throw new Error('SecureStore недоступен на этом устройстве');
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearStoredSession(): Promise<void> {
  const available = await SecureStore.isAvailableAsync();
  if (!available) return;
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function isSessionExpired(session: StoredSession | null): boolean {
  if (!session?.accessToken) return true;
  if (!session.expiresAt) return false;
  return session.expiresAt * 1000 <= Date.now() + 30000;
}
