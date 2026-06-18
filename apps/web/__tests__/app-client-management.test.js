import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalLocalStorage = window.localStorage;

const modulePath = path.resolve(__dirname, '../heys_app_client_management_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');

function createMockStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem: vi.fn((key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    _store: store,
  };
}

function loadClientManagement() {
  eval(moduleSource);
  return window.HEYS.AppClientManagement;
}

async function flushPromises() {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve();
  }
}

describe('HEYS.AppClientManagement', () => {
  beforeEach(() => {
    window.HEYS = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    window.HEYS = originalHEYS;
  });

  it('restores curator client id from JSON-serialized heys_client_current', async () => {
    const clientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    const storage = createMockStorage({
      heys_client_current: JSON.stringify(clientId),
    });
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });

    const clientManagement = loadClientManagement();
    const setClients = vi.fn();
    const setClientId = vi.fn();
    const fetchClientsFromCloud = vi.fn().mockResolvedValue({
      data: [{ id: clientId, name: 'Client A' }],
    });

    clientManagement.useClientListSync({
      React: { useEffect: (fn) => fn() },
      cloudUser: { id: 'curator-1' },
      clientsSource: 'cache',
      fetchClientsFromCloud,
      setClients,
      setClientId,
      clientId: '',
    });

    await flushPromises();

    expect(fetchClientsFromCloud).toHaveBeenCalledWith('curator-1');
    expect(setClients).toHaveBeenCalledWith([{ id: clientId, name: 'Client A' }]);
    expect(setClientId).toHaveBeenCalledWith(clientId);
    expect(window.HEYS.currentClientId).toBe(clientId);
  });
});
