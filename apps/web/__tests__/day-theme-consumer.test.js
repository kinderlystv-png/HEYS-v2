import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalMatchMedia = window.matchMedia;

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
      return undefined;
    },
    useMemo(factory) {
      return factory();
    },
    useCallback(fn) {
      return fn;
    },
  };
}

function loadScript(relativePath) {
  const filePath = path.resolve(__dirname, relativePath);
  eval(fs.readFileSync(filePath, 'utf8'));
}

function loadDayThemeStack() {
  loadScript('../heys_theme_v1.js');
  loadScript('../heys_app_hooks_v1.js');
  loadScript('../heys_day_effects.js');
  loadScript('../heys_day_runtime_ui_state_v1.js');
}

function mountDayRuntimeUiState() {
  const fakeReact = createFakeReact();
  window.React = fakeReact;
  fakeReact.beginRender();
  return window.HEYS.dayRuntimeUiState.useRuntimeUiState({
    React: fakeReact,
    HEYS: window.HEYS,
  });
}

describe('day theme is a consumer of HEYS.Theme', () => {
  beforeEach(() => {
    window.HEYS = {};
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-palette');
    window.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-palette');
    window.matchMedia = originalMatchMedia;
    window.HEYS = originalHEYS;
    window.React = originalReact;
  });

  it('keeps sand-dark document attrs when day runtime UI state mounts', () => {
    loadDayThemeStack();
    window.HEYS.Theme.setThemeId('sand-dark');

    expect(document.documentElement.getAttribute('data-theme')).toBe('sand-dark');
    expect(document.documentElement.getAttribute('data-theme-id')).toBe('sand-dark');
    expect(document.documentElement.getAttribute('data-palette')).toBe('sand');

    const setAttrSpy = vi.spyOn(document.documentElement, 'setAttribute');
    const runtime = mountDayRuntimeUiState();

    expect(runtime.theme).toBe('dark');
    expect(runtime.resolvedTheme).toBe('dark');
    expect(typeof runtime.cycleTheme).toBe('function');

    expect(document.documentElement.getAttribute('data-theme')).toBe('sand-dark');
    expect(document.documentElement.getAttribute('data-theme-id')).toBe('sand-dark');
    expect(document.documentElement.getAttribute('data-palette')).toBe('sand');

    const themeAttrWrites = setAttrSpy.mock.calls.filter(
      ([name, value]) => name === 'data-theme' && value !== 'sand-dark',
    );
    expect(themeAttrWrites).toEqual([]);
  });

  it('does not write data-theme or heys_theme from useDayThemeEffect', () => {
    loadDayThemeStack();
    window.HEYS.Theme.setThemeId('sand-dark');

    const setAttrSpy = vi.spyOn(document.documentElement, 'setAttribute');
    const lsSetSpy = vi.spyOn(window.localStorage, 'setItem');

    window.HEYS.dayEffects.useDayThemeEffect({ theme: 'dark', resolvedTheme: 'dark' });

    expect(setAttrSpy).not.toHaveBeenCalled();
    expect(lsSetSpy.mock.calls.filter(([key]) => key === 'heys_theme')).toEqual([]);
    expect(document.documentElement.getAttribute('data-theme')).toBe('sand-dark');
  });
});
