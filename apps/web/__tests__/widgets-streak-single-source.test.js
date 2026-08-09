/**
 * «Серия» в приложении должна считаться одним способом и не обнуляться из-за
 * того, что вкладка Дня размонтирована.
 *
 * До 2026-08-09 HEYS.Day.getStreak был замыканием DayTab: уходишь на виджеты —
 * замыкание удаляется, и серия молча становится нулём. Вместе с ней падали
 * XP-множитель, прогресс миссий и запись рекорда bestStreak.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function loadLegacy(relPath, host) {
  const src = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(host);
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Пять успешных дней подряд начиная со вчера. */
function seedSuccessfulDays(count) {
  const store = new Map();
  for (let i = 1; i <= count; i++) {
    store.set(`heys_dayv2_${isoDaysAgo(i)}`, {
      savedDisplayOptimum: 2000,
      meals: [{ items: [{ name: 'каша', grams: 200, kcal100: 500 }] }], // ratio 0.5*2000/2000 = 0.5
    });
  }
  return store;
}

function installHost(store) {
  global.window = global;
  global.HEYS = {};
  global.HEYS.utils = {
    lsGet: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
  };
  global.HEYS.dayUtils = {
    fmtDate: (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    buildProductIndex: () => ({ byId: new Map(), byName: new Map() }),
  };
  global.HEYS.products = { getAll: () => [] };
  global.HEYS.TDEE = { calculate: () => ({ optimum: 2000 }) };
  // Зоны: успешный день — ratio в коридоре 0.75..1.10.
  global.HEYS.ratioZones = { isSuccess: (r) => r >= 0.75 && r <= 1.1 };
}

describe('dayCalendarMetrics.getCurrentStreak — единая точка входа', () => {
  beforeEach(() => {
    const store = seedSuccessfulDays(5);
    // ratio должен попасть в коридор: 200г × 1000 ккал/100г = 2000 ккал.
    for (const [key, day] of store) {
      day.meals[0].items[0].kcal100 = 1000;
      store.set(key, day);
    }
    installHost(store);
    loadLegacy('apps/web/heys_day_calendar_metrics.js', global);
  });

  it('считает серию сама, без аргументов и без вкладки Дня', () => {
    expect(global.HEYS.dayCalendarMetrics.getCurrentStreak()).toBe(5);
  });

  it('кэширует результат, чтобы 30-секундный опрос шапки не сканировал LS каждый раз', () => {
    const metrics = global.HEYS.dayCalendarMetrics;
    let reads = 0;
    const inner = global.HEYS.utils.lsGet;
    global.HEYS.utils.lsGet = (k, f) => {
      reads += 1;
      return inner(k, f);
    };

    metrics.invalidateStreakCache();
    metrics.getCurrentStreak();
    const afterFirst = reads;
    metrics.getCurrentStreak();
    metrics.getCurrentStreak();

    expect(afterFirst).toBeGreaterThan(1);
    expect(reads).toBe(afterFirst);
  });
});

describe('safeGetStreak переживает размонтирование вкладки Дня', () => {
  beforeEach(() => {
    const store = seedSuccessfulDays(5);
    for (const [key, day] of store) {
      day.meals[0].items[0].kcal100 = 1000;
      store.set(key, day);
    }
    installHost(store);
    global.React = React;
    loadLegacy('apps/web/heys_day_calendar_metrics.js', global);
    loadLegacy('apps/web/heys_gamification_bar_v1.js', global);
  });

  it('без HEYS.Day.getStreak отдаёт каноническую серию, а не ноль', () => {
    expect(global.HEYS.Day?.getStreak).toBeUndefined();
    expect(global.HEYS.utils.safeGetStreak()).toBe(5);
  });

  it('когда вкладка Дня смонтирована — берёт её значение', () => {
    global.HEYS.Day = { getStreak: () => 12 };
    expect(global.HEYS.utils.safeGetStreak()).toBe(12);
  });
});

describe('второго алгоритма серии в приложении не осталось', () => {
  it('step-modal больше не считает «дни, где хоть что-то записано»', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'apps/web/heys_step_modal_v1.js'), 'utf8');
    const fn = src.slice(src.indexOf('function getCurrentStreak()'));
    const body = fn.slice(0, fn.indexOf('\n  }\n') + 4);

    // Признаки старого алгоритма: собственный цикл по 30 дням, UTC-дата и
    // условие «есть meals» вместо калорий и зон.
    expect(body).not.toMatch(/toISOString/);
    expect(body).not.toMatch(/heys_dayv2_/);
    expect(body).toMatch(/safeGetStreak|dayCalendarMetrics/);
  });

  it('бейдж на иконке PWA не читает замыкание вкладки Дня напрямую', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'apps/web/heys_app_gates_v1.js'), 'utf8');
    const fn = src.slice(src.indexOf('updateFromStreak()'), src.indexOf('updateFromStreak()') + 400);
    expect(fn).toMatch(/safeGetStreak/);
  });
});

describe('кэш серии сбрасывается, когда вкладка Дня пересчитала её', () => {
  beforeEach(() => {
    const store = seedSuccessfulDays(5);
    for (const [key, day] of store) {
      day.meals[0].items[0].kcal100 = 1000;
      store.set(key, day);
    }
    installHost(store);
    global.addEventListener = globalThis.addEventListener.bind(globalThis);
    global.dispatchEvent = globalThis.dispatchEvent.bind(globalThis);
    loadLegacy('apps/web/heys_day_calendar_metrics.js', global);
  });

  it('heysDayStreakUpdated обнуляет кэш, а не ждёт истечения TTL', () => {
    const metrics = global.HEYS.dayCalendarMetrics;
    expect(metrics.getCurrentStreak()).toBe(5);

    // День «испортился» — но без сброса кэша вернулось бы старое значение.
    global.HEYS.ratioZones = { isSuccess: () => false };
    expect(metrics.getCurrentStreak()).toBe(5);

    globalThis.dispatchEvent(new Event('heysDayStreakUpdated'));
    expect(metrics.getCurrentStreak()).toBe(0);
  });
});
