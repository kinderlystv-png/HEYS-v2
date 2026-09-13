// Утренний чек-ин не должен зацикливаться на «проверке вчера».
// Сценарий владельца 2026-09-13: шаг пройден, «Готово» — и
// checkin_incomplete_steps:проверка вчера, план поднимается заново.
import fs from 'fs';
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const YV_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_yesterday_verify_v1.js'), 'utf8');
const MORNING_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_morning_checkin_v1.js'), 'utf8');

const CLIENT = 'client-loop';
const TODAY = '2026-09-13';

function scopedDayKey(dateKey) {
  return `heys_${CLIENT}_dayv2_${dateKey}`;
}

function baseHeys() {
  return {
    currentClientId: CLIENT,
    _consentsValid: true,
    dayUtils: { todayISO: () => TODAY },
    utils: { getCurrentClientId: () => CLIENT },
    MorningCheckinUtils: {
      readDayV2ScopedFirst: (dateKey, fallback) => {
        const raw = localStorage.getItem(scopedDayKey(dateKey));
        return raw ? JSON.parse(raw) : fallback;
      },
      writeDayV2Scoped: (dateKey, data) => {
        localStorage.setItem(scopedDayKey(dateKey), JSON.stringify(data));
        return true;
      },
    },
  };
}

function writeDay(dateKey, data) {
  localStorage.setItem(scopedDayKey(dateKey), JSON.stringify({ date: dateKey, ...data }));
}

const meal = (kcal100) => ({ id: `m-${kcal100}`, items: [{ id: `i-${kcal100}`, grams: 100, kcal100, name: 'еда' }] });

describe('yesterdayVerify: шаг не оставляет непроверенных дней', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = baseHeys();
  });

  it('«очистить» на дне, где еда всё же есть, всё равно закрывает разбор', () => {
    writeDay('2026-09-11', { meals: [meal(2000)] });
    writeDay('2026-09-12', { meals: [meal(300)] });
    // eslint-disable-next-line no-new-func
    new Function(YV_SRC)();
    const YV = window.HEYS.YesterdayVerify;

    expect(YV.getPendingPastDays().missingDays.map((d) => d.date)).toEqual(['2026-09-12']);

    YV.save({ incompleteAction: 'clear_day', pendingDateKeys: ['2026-09-12'] });

    expect(YV.shouldShow()).toBe(false);
    const stored = JSON.parse(localStorage.getItem(scopedDayKey('2026-09-12')));
    // Числа дня не тронуты: закрыт только текущий чек-ин.
    expect(stored.meals).toHaveLength(1);
    expect(stored.yesterdayVerifyAction).toBe('fill_later');
  });
});

describe('completeMorningCheckin: пройденный «вчера» не возвращается на финале', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('новый «нужен разбор» после пройденного шага не блокирует закрытие', () => {
    const progressKey = `heys_${CLIENT}_morning_checkin_progress_v1_${TODAY}`;
    const now = Date.now();
    const ledger = {
      version: 1,
      dateKey: TODAY,
      flowId: `${TODAY}-loop`,
      plannedStepIds: ['yesterdayVerify', 'weight'],
      steps: {
        yesterdayVerify: { status: 'synced', savedAt: now, syncedAt: now, updatedAt: now },
        weight: { status: 'synced', savedAt: now, syncedAt: now, updatedAt: now },
      },
      updatedAt: now,
    };
    const values = new Map([[progressKey, ledger]]);
    window.HEYS = {
      ...baseHeys(),
      store: {
        readSafe: (key, fallback) => (values.has(key) ? structuredClone(values.get(key)) : fallback),
        get: (key, fallback) => (values.has(key) ? structuredClone(values.get(key)) : fallback),
        set: (key, value) => values.set(key, structuredClone(value)),
      },
      ProfileSteps: { isProfileIncomplete: () => false },
      YesterdayVerifyReady: true,
      // К финалу чек-ина разбор снова «нужен»: норму прошлого дня пересчитали.
      YesterdayVerify: { stepRegistered: true, shouldShow: vi.fn(() => true) },
    };
    // eslint-disable-next-line no-new-func
    new Function(MORNING_SRC)();
    const utils = window.HEYS.MorningCheckinUtils;

    const finalLedger = utils.ensureFinalMorningRequirements({ dateKey: TODAY, clientId: CLIENT, flowId: ledger.flowId });
    expect(finalLedger.steps.yesterdayVerify.status).toBe('synced');

    const blocking = utils.getBlockingMorningSteps({ ledger: finalLedger, dateKey: TODAY, clientId: CLIENT });
    expect(blocking.map((row) => row.id)).not.toContain('yesterdayVerify');
  });

  it('непройденный «вчера» по-прежнему попадает в план и блокирует', () => {
    const progressKey = `heys_${CLIENT}_morning_checkin_progress_v1_${TODAY}`;
    const now = Date.now();
    const ledger = {
      version: 1,
      dateKey: TODAY,
      flowId: `${TODAY}-loop2`,
      plannedStepIds: ['weight'],
      steps: { weight: { status: 'synced', savedAt: now, syncedAt: now, updatedAt: now } },
      updatedAt: now,
    };
    const values = new Map([[progressKey, ledger]]);
    window.HEYS = {
      ...baseHeys(),
      store: {
        readSafe: (key, fallback) => (values.has(key) ? structuredClone(values.get(key)) : fallback),
        get: (key, fallback) => (values.has(key) ? structuredClone(values.get(key)) : fallback),
        set: (key, value) => values.set(key, structuredClone(value)),
      },
      ProfileSteps: { isProfileIncomplete: () => false },
      YesterdayVerifyReady: true,
      YesterdayVerify: { stepRegistered: true, shouldShow: vi.fn(() => true) },
    };
    // eslint-disable-next-line no-new-func
    new Function(MORNING_SRC)();
    const utils = window.HEYS.MorningCheckinUtils;

    const finalLedger = utils.ensureFinalMorningRequirements({ dateKey: TODAY, clientId: CLIENT, flowId: ledger.flowId });
    const blocking = utils.getBlockingMorningSteps({ ledger: finalLedger, dateKey: TODAY, clientId: CLIENT });
    expect(blocking.map((row) => row.id)).toContain('yesterdayVerify');
  });
});
