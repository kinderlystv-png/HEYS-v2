import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const src = fs.readFileSync(
  path.resolve(__dirname, '../heys_norm_correction_v1.js'),
  'utf8'
);

let NC;

function loggedDays(n, kcal = 2112) {
  return Array.from({ length: n }, () => ({
    kcal,
    isLogged: true,
    isIncomplete: false
  }));
}

function downResult() {
  return NC.compute({
    days: loggedDays(21),
    formulaPerDay: 2400,
    trend: { deltaKg: -0.267, measuredDays: 21, windowDays: 21 },
    currentFactor: 1,
    historyDays: 60
  });
}

function cardArgs(overrides = {}) {
  const result = downResult();
  const expenditure = 2400;
  const deficitPct = -12;
  const basalMetabolism = 1520;
  const before = NC.applyFactor({
    expenditure,
    factor: result.currentFactor,
    deficitPct,
    basalMetabolism
  });
  const after = NC.applyFactor({
    expenditure,
    factor: result.nextFactor,
    deficitPct,
    basalMetabolism
  });
  return {
    result,
    tariff: 'pro',
    expenditure,
    deficitPct,
    basalMetabolism,
    appliedDecision: null,
    curatorKeptDecision: null,
    ...overrides
  };
}

beforeEach(() => {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  NC = window.HEYS.NormCorrection;
});

describe('norm-correction · куратор оставил норму', () => {
  it('isCuratorKeptDecision принимает только postponed/frozen от куратора', () => {
    expect(NC.isCuratorKeptDecision({ what: 'postponed', by: 'curator' })).toBe(true);
    expect(NC.isCuratorKeptDecision({ what: 'frozen', by: 'curator' })).toBe(true);
    expect(NC.isCuratorKeptDecision({ what: 'postponed', by: 'client' })).toBe(false);
    expect(NC.isCuratorKeptDecision({ what: 'applied', by: 'curator' })).toBe(false);
    expect(NC.isCuratorKeptDecision(null)).toBe(false);
  });

  it('findCuratorKeptDecision видит решение только в день ответа куратора', () => {
    const today = new Date('2026-09-05T15:00:00');
    const row = {
      weekLabel: '2026-09-05',
      what: 'postponed',
      by: 'curator',
      at: today.getTime()
    };
    expect(NC.findCuratorKeptDecision({ weeks: [row], now: today })).toEqual(row);
    expect(NC.findCuratorKeptDecision({
      weeks: [row],
      now: new Date('2026-09-06T09:00:00')
    })).toBeNull();
  });

  it('куратор посмотрел и оставил норму → клиент видит кадр curator_kept', () => {
    const now = new Date('2026-09-05T12:00:00');
    const kept = {
      weekLabel: '2026-09-05',
      what: 'postponed',
      by: 'curator',
      at: now.getTime()
    };
    const card = NC.buildWeeklySyncCard(cardArgs({
      curatorKeptDecision: kept
    }));

    expect(card.frame).toBe('curator_kept');
    expect(card.copy.title).toBe('Ваша норма сегодня');
    expect(card.titleAs).toBe('key');
    expect(card.copy.heroCaption).toBe('без изменений');
    expect(card.copy.body).toContain('Куратор посмотрел поправку');
    expect(card.facts).toEqual([
      { label: 'Предложение было', value: '2\u00a0049' },
      { label: 'Решение', value: 'оставить 2\u00a0112' },
      {
        label: 'Вернёмся к вопросу',
        value: 'в следующий понедельник',
        tone: 'quiet'
      }
    ]);
    expect(card.actions).toEqual(['ask_curator']);
  });

  it('никто не смотрел → клиент видит pending_curator, не curator_kept', () => {
    const card = NC.buildWeeklySyncCard(cardArgs());
    expect(card.frame).toBe('pending_curator');
    expect(card.frame).not.toBe('curator_kept');
  });

  it('вчерашний отказ куратора не подменяет ожидание — только сегодняшний канал', () => {
    const yesterday = new Date('2026-09-04T18:00:00');
    const weeks = [{
      weekLabel: '2026-09-04',
      what: 'frozen',
      by: 'curator',
      at: yesterday.getTime()
    }];
    const kept = NC.findCuratorKeptDecision({
      weeks,
      now: new Date('2026-09-05T10:00:00')
    });
    expect(kept).toBeNull();

    const card = NC.buildWeeklySyncCard(cardArgs({ curatorKeptDecision: kept }));
    expect(card.frame).toBe('pending_curator');
  });

  it('gather подхватывает последнюю запись куратора без совпадения weekLabel', () => {
    const store = new Map();
    const now = new Date('2026-09-05T14:30:00');
    const lsGet = (key, fallback) => (store.has(key) ? store.get(key) : fallback);
    const lsSet = (key, value) => { store.set(key, value); };

    store.set('heys_profile', {
      hasCurator: true,
      normCorrectionFactor: 1,
      deficitPctTarget: -12,
      weight: 80,
      height: 175,
      age: 30,
      gender: 'female'
    });
    store.set(NC.HISTORY_KEY, {
      weeks: [{
        weekLabel: '2026-09-05',
        what: 'postponed',
        by: 'curator',
        at: now.getTime(),
        factor: 0.97
      }]
    });

    for (let i = 21; i >= 1; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      store.set('heys_dayv2_' + dateStr, {
        meals: [{ items: [{ id: 'p1', grams: 100 }] }],
        dayTot: { kcal: 2112 },
        steps: 8000,
        weightMorning: 80 - i * 0.01
      });
    }

    window.HEYS.TDEE = {
      calculate: () => ({
        baseExpenditure: 2400,
        bmr: 1520,
        deficitPct: -12
      })
    };
    window.HEYS.Widgets = {
      WeightDynamicsV4: {
        trendForWindow: () => ({ deltaKg: -0.267, measuredDays: 21, windowDays: 21 })
      }
    };
    window.HEYS.DisciplineMatrix = { countHistoryDays: () => 60 };

    const gathered = NC.gather({
      lsGet,
      lsSet,
      now,
      weekLabel: '1–7 сент',
      readOnly: true
    });

    expect(gathered?.card?.frame).toBe('curator_kept');
  });
});
