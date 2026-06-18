import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalNavigator = window.navigator;

const modulePath = path.resolve(__dirname, '../heys_app_hooks_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');

function loadHooks() {
  eval(moduleSource);
  return window.HEYS.AppHooks;
}

describe('curator login product scope guard', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'navigator', {
      value: { ...originalNavigator, onLine: true },
      writable: true,
      configurable: true,
    });
    window.React = {
      useRef: (value) => ({ current: value }),
      useCallback: (fn) => fn,
      useEffect: () => {},
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    Object.defineProperty(window, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    window.React = originalReact;
    window.HEYS = originalHEYS;
  });

  it('does not read or migrate products before a curator selects a real client', async () => {
    const productGetAll = vi.fn(() => [{ id: 'p1', name: 'Milk', b: 10, j: 1, u: 2, kcal: 100 }]);
    const productSetAll = vi.fn();
    const storeSet = vi.fn();

    window.HEYS = {
      store: { get: vi.fn(() => null), set: storeSet },
      products: { getAll: productGetAll, setAll: productSetAll },
      YandexAPI: {
        getClients: vi.fn().mockResolvedValue({
          data: [{ id: 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a', name: 'Client A' }],
        }),
      },
      Toast: { warning: vi.fn() },
    };

    const hooks = loadHooks();
    const setProducts = vi.fn();
    const setSyncVer = vi.fn((fn) => fn(0));
    const cloud = {
      signIn: vi.fn().mockResolvedValue({ user: { id: 'curator-1', email: 'curator@example.test' } }),
      getStatus: vi.fn(() => 'online'),
    };
    const { cloudSignIn } = hooks.useCloudClients(cloud, {}, {
      clients: [],
      setClients: vi.fn(),
      clientsSource: '',
      setClientsSource: vi.fn(),
      clientId: '',
      setClientId: vi.fn(),
      cloudUser: null,
      setCloudUser: vi.fn(),
      setProducts,
      setStatus: vi.fn(),
      setSyncVer,
      setLoginError: vi.fn(),
    });

    await cloudSignIn('curator@example.test', 'secret', { rememberMe: true });

    expect(window.HEYS.YandexAPI.getClients).toHaveBeenCalledWith('curator-1');
    expect(productGetAll).not.toHaveBeenCalled();
    expect(productSetAll).not.toHaveBeenCalled();
    expect(setProducts).toHaveBeenCalledWith([]);
  });
});
