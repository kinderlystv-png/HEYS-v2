import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const WEB_DIR = path.resolve(__dirname, '..');

function loadWaterCustomVolume() {
  const src = fs.readFileSync(path.join(WEB_DIR, 'heys_water_custom_volume_v1.js'), 'utf8');
  const storage = new Map();
  const listeners = new Map();
  const HEYS = {
    currentClientId: '11111111-1111-1111-1111-111111111111',
    dayUtils: {
      lsGet(k, d) {
        return storage.has(k) ? storage.get(k) : d;
      },
      lsSet(k, v) {
        storage.set(k, v);
      },
      haptic: vi.fn()
    }
  };
  const React = {
    useState(initial) {
      const state = typeof initial === 'function' ? initial() : initial;
      const setState = (next) => {
        if (typeof next === 'function') Object.assign(state, next(state));
        else Object.assign(state, typeof next === 'object' ? next : { value: next });
      };
      return [state, setState];
    },
    useRef(initial) {
      return { current: initial };
    },
    useCallback(fn) { return fn; },
    useEffect() {},
    createElement() { return {}; },
    Fragment: 'Fragment'
  };
  const context = {
    window: {
      HEYS,
      React,
      ReactDOM: { createPortal: () => null },
      localStorage: {
        getItem: (k) => (storage.has(k) ? JSON.stringify(storage.get(k)) : null),
        setItem: (k, v) => storage.set(k, JSON.parse(v))
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      removeEventListener(type, fn) {
        const arr = listeners.get(type) || [];
        listeners.set(type, arr.filter((item) => item !== fn));
      },
      dispatchEvent(event) {
        (listeners.get(event.type) || []).forEach((fn) => fn(event));
        return true;
      },
      CustomEvent: class CustomEvent {
        constructor(type, init) {
          this.type = type;
          this.detail = init?.detail;
        }
      }
    },
    document: { body: {} },
    console,
    setTimeout,
    clearTimeout
  };
  context.window = context.window;
  context.CustomEvent = context.window.CustomEvent;
  vm.runInNewContext(src, context);
  return { HEYS, storage, win: context.window };
}

describe('water custom volume v4', () => {
  let HEYS;
  let storage;

  beforeEach(() => {
    ({ HEYS } = loadWaterCustomVolume());
    storage = new Map();
    HEYS.dayUtils.lsGet = (k, d) => (storage.has(k) ? storage.get(k) : d);
    HEYS.dayUtils.lsSet = (k, v) => storage.set(k, v);
  });

  it('память объёма: client-scoped ключ и дефолт 500 мл', () => {
    expect(HEYS.WaterCustomVolume.readLastMl()).toBe(500);
    HEYS.WaterCustomVolume.saveLastMl(750);
    expect(HEYS.WaterCustomVolume.readLastMl()).toBe(750);
    expect(storage.has('heys_11111111-1111-1111-1111-111111111111_heys_water_custom_volume_ml')).toBe(true);
  });

  it('шаг 50 мл и пресеты 330/500/750/1000', () => {
    expect(HEYS.WaterCustomVolume.STEP_ML).toBe(50);
    expect(HEYS.WaterCustomVolume.PRESETS_ML).toEqual([330, 500, 750, 1000]);
    expect(HEYS.WaterCustomVolume.snapMl(725)).toBe(750);
    expect(HEYS.WaterCustomVolume.snapMl(24)).toBe(50);
  });

  it('open: событие heys:water-custom-volume-open', () => {
    const { HEYS: mod, win } = loadWaterCustomVolume();
    const onAdd = vi.fn();
    const handler = vi.fn();
    win.addEventListener('heys:water-custom-volume-open', handler);
    mod.WaterCustomVolume.open({ onAdd });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.onAdd).toBe(onAdd);
  });
});

describe('water custom volume wiring', () => {
  it('day shell: long-press 350 мс на FAB и чипах', () => {
    const dayShellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_day_page_shell.js'), 'utf8');
    expect(dayShellSrc).toContain('WaterFabVolButton');
    expect(dayShellSrc).toContain('useWaterLongPress');
    expect(dayShellSrc).toContain('HEYS.WaterCustomVolume?.open');
    expect(dayShellSrc).toContain('WaterCustomVolumeHost');
  });

  it('water review card: long-press на чипах', () => {
    const waterSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_day_water_v1.js'), 'utf8');
    expect(waterSrc).toContain('HEYS.WaterCustomVolume?.open');
    expect(waterSrc).toContain('useLongPress350');
  });

  it('CSS листа: stepper 44px, пресеты, кнопка подтверждения', () => {
    const css = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/400-water-and-hydration.css'), 'utf8');
    expect(css).toContain('.water-custom-sheet__step');
    expect(css).toMatch(/\.water-custom-sheet__step \{[\s\S]*?width: 44px/);
    expect(css).toContain('.water-custom-sheet__preset.is-active');
    expect(css).toContain('.water-custom-sheet__confirm');
    expect(css).toContain('blur(var(--v4-modal-backdrop-blur, 2.5px))');
  });
});
