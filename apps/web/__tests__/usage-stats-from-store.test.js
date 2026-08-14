// @vitest-environment node
//
// Частые продукты читают in-memory usage stats. Модуль раньше грузил их
// один раз до client-scope и потом не перечитывал store, если lastSync
// казался свежим. Тогда вкладка «Частые» была пустой при живой истории.

import fs from 'fs';
import path from 'path';
import vm from 'vm';

import { describe, expect, it } from 'vitest';

const searchSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'heys_smart_search_v2.js'),
  'utf8'
);

function loadSearch(seed = {}) {
  const storeData = { ...(seed.store || {}) };
  const lsProto = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this, key) ? String(this[key]) : null;
    },
    setItem(key, value) {
      this[key] = String(value);
    },
    removeItem(key) {
      delete this[key];
    },
  };
  const localStorage = Object.create(lsProto);
  Object.assign(localStorage, seed.ls || {});

  const context = {
    console,
    setTimeout,
    clearTimeout,
    requestIdleCallback: (fn) => setTimeout(fn, 0),
    document: { addEventListener() {} },
    localStorage,
    HEYS: {
      currentClientId: seed.cid || '02e1aff8-17b9-4d77-ace4-2369cb283f82',
      store: {
        get(key, fallback) {
          return Object.prototype.hasOwnProperty.call(storeData, key) ? storeData[key] : fallback;
        },
        set(key, value) {
          storeData[key] = value;
          return true;
        },
      },
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(searchSource, context);
  return {
    search: context.HEYS.SmartSearchWithTypos,
    storeData,
  };
}

function dayWithItems(items) {
  return { date: '2026-08-13', meals: [{ id: 'm1', name: 'Ужин', items }] };
}

describe('usage stats for frequent products', () => {
  it('reloads stored stats even when lastSync is still fresh', () => {
    const { search, storeData } = loadSearch();
    expect(search.getUsageStats().size).toBe(0);

    storeData.heys_product_usage_stats = {
      p_milk: { count: 3, lastUsed: Date.now() - 3600000 },
      'Молоко 3.2': { count: 3, lastUsed: Date.now() - 3600000 },
    };
    storeData.heys_product_usage_stats_last_sync = Date.now();

    const refreshed = search.ensureUsageStatsFresh({ maxHours: 24, dateKey: '2026-08-15' });
    const stats = search.getUsageStats();

    expect(refreshed).toBe(true);
    expect(stats.get('p_milk')?.count).toBe(3);
    expect(stats.has('Молоко 3.2')).toBe(true);
  });

  it('does not treat estimated meal fill as a frequent product', () => {
    const milk = {
      id: 'it_milk',
      product_id: 'p_milk',
      name: 'Молоко 3.2',
    };
    const estimated = {
      id: 'estimated_2026-08-13_0',
      product_id: 'estimated_quickfill_2026-08-13_0',
      name: 'Завтрак · оценочно 85%',
      isEstimated: true,
      virtualProduct: true,
      skipOrphanTracking: true,
    };

    const days = {};
    for (let d = 11; d <= 16; d += 1) {
      const key = `heys_dayv2_2026-08-${String(d).padStart(2, '0')}`;
      days[key] = dayWithItems([estimated, milk]);
    }

    const { search } = loadSearch({ store: days });
    search.syncUsageStatsFromDays({
      daysWindow: 21,
      dateKey: '2026-08-15',
      lsGet: (key) => days[key] || null,
    });

    const stats = search.getUsageStats();
    expect(stats.get('p_milk')?.count).toBeGreaterThan(0);
    expect(stats.has('estimated_quickfill_2026-08-13_0')).toBe(false);
    expect(stats.has('Завтрак · оценочно 85%')).toBe(false);
  });
});
