import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  isAvailableAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  ...secureStore,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

import {
  clearStoredSession,
  isSessionExpired,
  loadStoredSession,
  saveStoredSession,
} from '../storage';

const storedSession = {
  accessToken: 'session-token',
  createdAt: 1_700_000_000,
  expiresAt: 2_000_000_000,
  kind: 'client' as const,
  tokenType: 'Bearer',
  user: { id: 'client-1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  secureStore.isAvailableAsync.mockResolvedValue(true);
});

describe('mobile secure session storage', () => {
  it('round-trips a session through the device-only SecureStore key', async () => {
    secureStore.getItemAsync.mockResolvedValue(JSON.stringify(storedSession));

    await saveStoredSession(storedSession);
    await expect(loadStoredSession()).resolves.toEqual(storedSession);

    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'heys.mobile.session.v1',
      JSON.stringify(storedSession),
      { keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' },
    );
  });

  it('clears malformed serialized state instead of returning a partial session', async () => {
    secureStore.getItemAsync.mockResolvedValue('{broken-json');

    await expect(loadStoredSession()).resolves.toBeNull();
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('heys.mobile.session.v1');
  });

  it('treats missing tokens and sessions inside the 30-second safety window as expired', () => {
    vi.setSystemTime(new Date('2026-07-17T12:00:00.000Z'));
    const nowSeconds = Date.now() / 1000;

    expect(isSessionExpired(null)).toBe(true);
    expect(isSessionExpired({ ...storedSession, accessToken: '' })).toBe(true);
    expect(isSessionExpired({ ...storedSession, expiresAt: nowSeconds + 29 })).toBe(true);
    expect(isSessionExpired({ ...storedSession, expiresAt: nowSeconds + 31 })).toBe(false);

    vi.useRealTimers();
  });

  it('is a no-op when SecureStore is unavailable', async () => {
    secureStore.isAvailableAsync.mockResolvedValue(false);

    await expect(loadStoredSession()).resolves.toBeNull();
    await expect(clearStoredSession()).resolves.toBeUndefined();
    expect(secureStore.getItemAsync).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
