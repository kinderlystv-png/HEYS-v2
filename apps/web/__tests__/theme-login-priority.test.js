import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalLocalStorage = window.localStorage;
const originalMatchMedia = window.matchMedia;

function createMockStorage(seed = {}) {
  const store = {};
  Object.keys(seed).forEach((key) => {
    store[key] = String(seed[key]);
  });
  return {
    getItem: vi.fn((key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
    setItem: vi.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    _store: store,
  };
}

function createFakeReact() {
  const state = [];
  let cursor = 0;
  return {
    beginRender() {
      cursor = 0;
    },
    useState(initialValue) {
      const index = cursor++;
      if (!(index in state)) {
        state[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
      }
      const setState = (nextValue) => {
        state[index] = typeof nextValue === 'function' ? nextValue(state[index]) : nextValue;
      };
      return [state[index], setState];
    },
    useEffect(effect) {
      effect();
    },
    useMemo(factory) {
      return factory();
    },
    useCallback(fn) {
      return fn;
    },
  };
}

function loadHooksModule() {
  const themePath = path.resolve(__dirname, '../heys_theme_v1.js');
  eval(fs.readFileSync(themePath, 'utf8'));
  const modulePath = path.resolve(__dirname, '../heys_app_hooks_v1.js');
  const source = fs.readFileSync(modulePath, 'utf8');
  eval(source);
}

function renderThemeHook() {
  const fakeReact = createFakeReact();
  window.React = fakeReact;
  fakeReact.beginRender();
  return window.HEYS.AppHooks.useThemePreference();
}

describe('theme priority on login/init', () => {
  beforeEach(() => {
    window.HEYS = { utils: {} };
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    window.matchMedia = originalMatchMedia;
    window.HEYS = originalHEYS;
    delete window.React;
  });

  it('uses light by default even if system is dark', () => {
    const mockStorage = createMockStorage();
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    loadHooksModule();
    const themeState = renderThemeHook();

    expect(themeState.theme).toBe('light');
    expect(themeState.resolvedTheme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('applies dark only when explicit preference is dark', () => {
    const mockStorage = createMockStorage({
      heys_theme_explicit: '1',
      heys_theme_pref: 'dark',
    });
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    loadHooksModule();
    const themeState = renderThemeHook();

    expect(themeState.theme).toBe('dark');
    expect(themeState.resolvedTheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  // До 2026-08-10 значение 'auto' схлопывалось в классику, и этот тест
  // закреплял именно это. По решению владельца «Как в системе» восстановлено,
  // поэтому эталон меняется вместе с поведением: при auto и тёмной системе
  // на входе должна быть тёмная тема.
  it('follows the system mode when preference is auto', () => {
    const mockStorage = createMockStorage({
      heys_theme_explicit: '1',
      heys_theme_pref: 'auto',
      heys_theme: 'dark',
    });
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    loadHooksModule();
    const themeState = renderThemeHook();

    expect(themeState.theme).toBe('dark');
    expect(themeState.resolvedTheme).toBe('dark');
    expect(themeState.modePreference).toBe('auto');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('syncs hook state after external Theme.setThemeId', () => {
    const mockStorage = createMockStorage();
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    loadHooksModule();
    const fakeReact = createFakeReact();
    window.React = fakeReact;
    fakeReact.beginRender();
    window.HEYS.AppHooks.useThemePreference();

    window.HEYS.Theme.setThemeId('sand');

    fakeReact.beginRender();
    const themeState = window.HEYS.AppHooks.useThemePreference();

    expect(themeState.themeId).toBe('sand');
    expect(document.documentElement.getAttribute('data-theme')).toBe('sand');
  });
});
