import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Четыре вызова на вкладке «Отчёты» уходили в несуществующие функции.
// Ни один не падал: optional chaining и проверки типа глушили промах, поэтому
// поведение ломалось молча — ссылка не открывала профиль, модалка залипала на
// загрузке, кэш отчётов не сбрасывался, ГИ и вредность считались по нулям.
// Тест держит и отсутствие фантомов в исходниках, и фактическое поведение
// сервиса месячных отчётов.

const WEB_DIR = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(WEB_DIR, rel), 'utf8');

describe('исходники вкладки «Отчёты» не зовут несуществующие функции', () => {
  it('ссылка «Укажи целевой вес» не зовёт HEYS.openProfileModal', () => {
    // Определения openProfileModal нет ни в одном модуле apps/web.
    expect(read('heys_day_stats_v1.js')).not.toMatch(/openProfileModal\s*\(/);
    expect(read('heys_day_stats_block_v1.js')).not.toContain('openProfileModal');
  });

  it('ссылка не опирается на селектор [data-tab], которого нет в разметке', () => {
    expect(read('heys_day_stats_v1.js')).not.toContain('[data-tab="profile"]');
  });

  it('ссылка переключает на существующую вкладку профиля — user, не profile', () => {
    const src = read('heys_day_stats_v1.js');
    expect(src).toMatch(/HEYS\.App\?\.setTab \|\| HEYS\.ui\?\.switchTab/);
    expect(src).toMatch(/setTab\('user'\)/);
  });

  it('ленивый чанк отчётов берётся из HEYS, а не с голого window', () => {
    const src = read('heys_day_tab_impl_v1.js');
    expect(src).toContain('window.HEYS?.__loadPostboot3Ui');
    expect(src).not.toMatch(/window\.__loadPostboot3Ui/);
  });

  it('владелец глобала __loadPostboot3Ui — HEYS (иначе неймспейс снова разъедется)', () => {
    expect(read('heys_postboot3_facade_v1.js')).toContain('HEYS.__loadPostboot3Ui = ');
  });

  it('сервис месячных отчётов не зовёт HEYS.store.getCurrentProfile', () => {
    expect(read('heys_monthly_reports_service_v1.js')).not.toMatch(/getCurrentProfile\?\.\(/);
  });

  it('сервис месячных отчётов не зовёт HEYS.products.buildIndex', () => {
    expect(read('heys_monthly_reports_service_v1.js')).not.toMatch(/products\?\.buildIndex/);
  });

  it('cache-bust ленивых stats-скриптов сдвинут — иначе правка не доедет до юзера', () => {
    // heys_day_stats_v1.js не входит ни в один бандл: он грузится инъекцией из
    // лоадера, а ключ ?v= = хеш boot-day + эта константа.
    const src = read('heys_day_stats_bundle_loader_v1.js');
    const version = src.match(/DAY_STATS_LAZY_VERSION = '([^']+)'/)?.[1];
    expect(version).toBeTruthy();
    expect(version).not.toBe('2026-06-17-charge-hide-zones-v1');
    expect(src).toContain("'?v=' + cacheBust");
  });
});

// --- Поведение сервиса месячных отчётов -------------------------------------

const CLIENT_ID = '11111111-2222-3333-4444-555555555555';

function isoDaysAgo(offset) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function makeLocalStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

function loadService({ products = [], days = {} } = {}) {
  const scopedDays = {};
  for (const [dateStr, payload] of Object.entries(days)) {
    scopedDays[`heys_${CLIENT_ID}_dayv2_${dateStr}`] = JSON.stringify(payload);
  }

  const storage = makeLocalStorage(scopedDays);
  const captured = { pIndexes: [], buildCalls: 0 };

  const HEYS = {
    utils: {
      getCurrentClientId: () => CLIENT_ID,
      lsGet: (key, fallback) => {
        const scoped = key.startsWith('heys_')
          ? `heys_${CLIENT_ID}_${key.slice('heys_'.length)}`
          : `heys_${CLIENT_ID}_${key}`;
        const raw = storage.getItem(scoped) ?? storage.getItem(key);
        if (raw == null) return fallback;
        try { return JSON.parse(raw); } catch { return fallback; }
      },
    },
    products: { getAll: () => products },
    models: {
      buildProductIndex: (ps) => {
        const byId = new Map();
        (ps || []).forEach((p) => p?.id != null && byId.set(String(p.id).toLowerCase(), p));
        return { byId, byName: new Map(), byFingerprint: new Map() };
      },
    },
    weeklyReports: {
      buildWeekReport: ({ pIndex }) => {
        captured.buildCalls += 1;
        captured.pIndexes.push(pIndex);
        // daysWithData >= 2 — иначе неделя не попадёт в результат и кэш не запишется.
        return { daysWithData: 2, days: [], avgWeight: 0 };
      },
    },
  };

  global.window = global;
  global.HEYS = HEYS;
  global.localStorage = storage;

  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB_DIR, 'heys_monthly_reports_service_v1.js'), 'utf8'));

  return { service: global.HEYS.monthlyReportsService, captured, storage, HEYS };
}

describe('сервис месячных отчётов: clientId и индекс продуктов', () => {
  const originalWindow = global.window;
  const originalHEYS = global.HEYS;
  const originalLocalStorage = global.localStorage;

  afterEach(() => {
    global.window = originalWindow;
    global.HEYS = originalHEYS;
    global.localStorage = originalLocalStorage;
  });

  it('в отчёт уезжает непустой индекс продуктов, а не undefined', () => {
    const { service, captured } = loadService({
      products: [{ id: 'p1', name: 'Гречка', kcal100: 330 }],
    });

    service.buildMonthlyWeeks({ weeksCount: 1, useCache: false });

    expect(captured.buildCalls).toBeGreaterThan(0);
    const pIndex = captured.pIndexes[0];
    expect(pIndex, 'pIndex не должен быть undefined — иначе ГИ и вредность нули').toBeTruthy();
    expect(pIndex.byId.get('p1')).toMatchObject({ name: 'Гречка' });
  });

  it('без загруженного каталога индекс null, но пустым индексом кэш не залипает', () => {
    const { service, captured } = loadService({ products: [] });

    service.buildMonthlyWeeks({ weeksCount: 1, useCache: true });
    expect(captured.pIndexes[0]).toBeNull();

    // Каталог доехал позже — подпись обязана измениться, отчёт пересобраться.
    const callsBefore = captured.buildCalls;
    global.HEYS.products.getAll = () => [{ id: 'p1', name: 'Гречка' }];
    service.buildMonthlyWeeks({ weeksCount: 1, useCache: true });

    expect(captured.buildCalls).toBeGreaterThan(callsBefore);
    expect(captured.pIndexes.at(-1)?.byId.get('p1')).toBeTruthy();
  });
});

describe('сервис месячных отчётов: подпись кэша видит правки дня', () => {
  const originalWindow = global.window;
  const originalHEYS = global.HEYS;
  const originalLocalStorage = global.localStorage;

  afterEach(() => {
    global.window = originalWindow;
    global.HEYS = originalHEYS;
    global.localStorage = originalLocalStorage;
  });

  it('добавление еды в client-scoped ключ сбрасывает кэш', () => {
    const dateStr = isoDaysAgo(1);
    const { service, captured, storage } = loadService({
      products: [{ id: 'p1', name: 'Гречка' }],
      days: { [dateStr]: { meals: [{ items: [{ id: 'p1', grams: 100 }] }] } },
    });

    service.buildMonthlyWeeks({ weeksCount: 1, useCache: true });
    const callsAfterFirst = captured.buildCalls;

    // Второй вызов без правок — обязан прийти из кэша.
    service.buildMonthlyWeeks({ weeksCount: 1, useCache: true });
    expect(captured.buildCalls, 'кэш не сработал').toBe(callsAfterFirst);

    // Правка лежит в реальном формате ключа: heys_<clientId>_dayv2_<дата>.
    // Раньше подпись читала heys_dayv2_<дата>_guest — то есть всегда null,
    // подпись была константной и кэш не сбрасывался никогда.
    storage.setItem(
      `heys_${CLIENT_ID}_dayv2_${dateStr}`,
      JSON.stringify({ meals: [{ items: [{ id: 'p1', grams: 100 }, { id: 'p1', grams: 250 }] }] })
    );

    service.buildMonthlyWeeks({ weeksCount: 1, useCache: true });
    expect(captured.buildCalls, 'кэш не сбросился после добавления еды').toBeGreaterThan(callsAfterFirst);
  });

  it('legacy-клиент без скоупа ключей: подпись читает unscoped ключ', () => {
    const dateStr = isoDaysAgo(1);
    const { service, captured, storage } = loadService({ products: [] });

    // Клиент без id — ключи не скоупятся.
    global.HEYS.utils.getCurrentClientId = () => '';
    storage.setItem(`heys_dayv2_${dateStr}`, JSON.stringify({ meals: [] }));

    service.buildMonthlyWeeks({ weeksCount: 1, useCache: true });
    const callsAfterFirst = captured.buildCalls;

    storage.setItem(
      `heys_dayv2_${dateStr}`,
      JSON.stringify({ meals: [{ items: [{ id: 'p1', grams: 100 }] }] })
    );
    service.buildMonthlyWeeks({ weeksCount: 1, useCache: true });

    expect(captured.buildCalls).toBeGreaterThan(callsAfterFirst);
  });
});
