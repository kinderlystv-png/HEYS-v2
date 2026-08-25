// Раскладка Главной: облако под аккаунт, отложенное применение, миграция копий.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REGISTRY_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_registry_v1.js'), 'utf8');
const CORE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_widgets_core_v1.js'), 'utf8');

const LAYOUT_KEY = 'heys_widget_layout_v1';
const META_KEY = 'heys_widget_layout_meta_v1';
const CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function tile(type, id, col = 0, row = 0) {
  return { id, type, size: '2x1', position: { col, row }, settings: {} };
}

function boot({ savedLayout, meta, clientId = CLIENT_ID } = {}) {
  const memory = new Map();
  if (savedLayout) memory.set(LAYOUT_KEY, savedLayout);
  if (meta) memory.set(META_KEY, meta);

  window.HEYS = {
    currentClientId: clientId,
    Widgets: { emit: vi.fn(), on: () => () => {}, off: () => {} },
    store: {
      get: (k, d) => (memory.has(k) ? memory.get(k) : d),
      set: (k, v) => { memory.set(k, v); },
      invalidate: (k) => { memory.delete(k); },
    },
  };

  localStorage.clear();
  eval(REGISTRY_SRC);
  eval(CORE_SRC);
  window.HEYS.Widgets.state.init();
  return { state: window.HEYS.Widgets.state, memory };
}

describe('раскладка · облако и отложенное применение', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.HEYS;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.HEYS;
  });

  it('событие облака не меняет раскладку сразу — только ставит в очередь', () => {
    const local = {
      widgets: [tile('calories', 'w1'), tile('water', 'w2', 2, 0)],
      updatedAt: 5000,
    };
    const { state } = boot({ savedLayout: local, meta: { retiredMigration: '', layoutCloudMigrationV2: 'done' } });

    const before = state.getWidgets().map((w) => w.type);
    window.dispatchEvent(new CustomEvent('heys:widget-layout-updated', {
      detail: {
        layout: {
          widgets: [tile('sleep', 'w9')],
          updatedAt: 9000,
        },
      },
    }));

    expect(state.getWidgets().map((w) => w.type)).toEqual(before);
    expect(state._pendingCloudLayout?.updatedAt).toBe(9000);
  });

  it('отложенная раскладка применяется при открытии Главной, если облако новее', () => {
    const local = {
      widgets: [tile('calories', 'w1'), tile('water', 'w2', 2, 0)],
      updatedAt: 1000,
    };
    const { state, memory } = boot({ savedLayout: local, meta: { retiredMigration: '', layoutCloudMigrationV2: 'done' } });

    const cloudUpdatedAt = Date.now() + 60_000;
    state.stageCloudLayoutUpdate({
      widgets: [tile('sleep', 'w9'), tile('steps', 'w10', 2, 0)],
      updatedAt: cloudUpdatedAt,
    });

    const applied = state.applyPendingCloudLayoutIfAllowed();
    expect(applied).toBe(true);
    expect(state.getWidgets().map((w) => w.type)).toEqual(['sleep', 'steps']);
    expect(memory.get(LAYOUT_KEY)?.updatedAt).toBe(cloudUpdatedAt);
    expect(state._pendingCloudLayout).toBeNull();
  });

  it('в режиме расстановки отложенная раскладка не применяется', () => {
    const local = { widgets: [tile('calories', 'w1')], updatedAt: 1000 };
    const { state } = boot({ savedLayout: local, meta: { retiredMigration: '', layoutCloudMigrationV2: 'done' } });

    state.enterEditMode();
    state.stageCloudLayoutUpdate({ widgets: [tile('water', 'w2')], updatedAt: 9000 });

    expect(state.applyPendingCloudLayoutIfAllowed()).toBe(false);
    expect(state.getWidgets().map((w) => w.type)).toEqual(['calories']);
  });

  it('локальная раскладка новее облака — отложенное сбрасывается', () => {
    const local = { widgets: [tile('calories', 'w1')], updatedAt: 8000 };
    const { state } = boot({ savedLayout: local, meta: { retiredMigration: '', layoutCloudMigrationV2: 'done' } });

    state.stageCloudLayoutUpdate({ widgets: [tile('water', 'w2')], updatedAt: 3000 });
    expect(state.applyPendingCloudLayoutIfAllowed()).toBe(false);
    expect(state._pendingCloudLayout).toBeNull();
  });

  it('две расходящиеся копии при миграции дают разовый дефолт', () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({
      widgets: [tile('calories', 'l1')],
      updatedAt: 100,
    }));
    localStorage.setItem(`heys_${CLIENT_ID}_widget_layout_v1`, JSON.stringify({
      widgets: [tile('water', 's1')],
      updatedAt: 200,
    }));

    const memory = new Map();
    window.HEYS = {
      currentClientId: CLIENT_ID,
      Widgets: { emit: vi.fn(), on: () => () => {}, off: () => {} },
      store: {
        get: (k, d) => (memory.has(k) ? memory.get(k) : d),
        set: (k, v) => { memory.set(k, v); },
        invalidate: (k) => { memory.delete(k); },
      },
    };
    eval(REGISTRY_SRC);
    eval(CORE_SRC);
    window.HEYS.Widgets.state.init();

    const widgets = window.HEYS.Widgets.state.getWidgets();
    expect(widgets.length).toBeGreaterThan(1);
    expect(widgets.some((w) => w.type === 'calories')).toBe(true);
    expect(memory.get(META_KEY)?.layoutCloudMigrationV2).toBe('diverged-default');
  });

  it('одна legacy-копия при миграции становится канонической в store', () => {
    const legacy = {
      widgets: [tile('calories', 'l1'), tile('water', 'l2', 2, 0)],
      updatedAt: 400,
    };
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(legacy));

    const memory = new Map();
    window.HEYS = {
      currentClientId: CLIENT_ID,
      Widgets: { emit: vi.fn(), on: () => () => {}, off: () => {} },
      store: {
        get: (k, d) => (memory.has(k) ? memory.get(k) : d),
        set: (k, v) => { memory.set(k, v); },
        invalidate: (k) => { memory.delete(k); },
      },
    };
    eval(REGISTRY_SRC);
    eval(CORE_SRC);
    window.HEYS.Widgets.state.init();

    expect(memory.get(LAYOUT_KEY)?.widgets?.map((w) => w.type)).toEqual(['calories', 'water']);
    expect(memory.get(META_KEY)?.layoutCloudMigrationV2).toBe('done');
    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull();
  });
});
