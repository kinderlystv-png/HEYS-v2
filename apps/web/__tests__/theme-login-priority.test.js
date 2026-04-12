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

  it('ignores auto preference and keeps light on init', () => {
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

    expect(themeState.theme).toBe('light');
    expect(themeState.resolvedTheme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
