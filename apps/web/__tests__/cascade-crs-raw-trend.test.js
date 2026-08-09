import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// HEYS Score: серия сырого CRS для месячного тренда.
// См. docs/implementation/UI_V4_SPEC_2026-08-09.md, раздел
// «Каскад как трендовая оценка (HEYS Score)» — показываемое число
// (mapRawCrsToDisplay) сплющивает рост, тренд строится по сырому CRS.

const originalHEYS = window.HEYS;

const modulePath = path.resolve(__dirname, '../heys_cascade_card_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');

function loadCascadeCard() {
  // eslint-disable-next-line no-eval
  eval(moduleSource);
  return window.HEYS.CascadeCard;
}

describe('HEYS.CascadeCard.getCrsRawTrend', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
    // Модуль на загрузке оборачивает свою карточку в React.memo — расчётной
    // части теста React не нужен, достаточно минимальной заглушки.
    window.React = {
      memo: (c) => c,
      createElement: () => null,
      useState: (v) => [v, () => {}],
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useCallback: (fn) => fn,
      useRef: (v) => ({ current: v }),
    };
  });

  afterEach(() => {
    localStorage.clear();
    window.HEYS = originalHEYS;
    delete window.React;
  });

  it('возвращает 30-дневную серию в хронологическом порядке, оканчивающуюся todayDate', () => {
    const CascadeCard = loadCascadeCard();
    const result = CascadeCard.getCrsRawTrend('test-client', {
      dcsHistory: { '2026-08-09': 0.5 },
      prevDays: [],
      todayDate: '2026-08-09',
    });

    expect(result.series).toHaveLength(30);
    expect(result.series[29].date).toBe('2026-08-09');
    expect(result.series[0].date).toBe('2026-07-11'); // 29 дней до todayDate
    for (let i = 1; i < result.series.length; i++) {
      expect(result.series[i].date > result.series[i - 1].date).toBe(true);
    }
  });

  it('различает дельту за 14 дней у растущего клиента (реальные данные Александры, прод 2026-08-09)', () => {
    // Реальная история heys_cascade_dcs_v9 клиента 4545ee50-4f5f-4fc0-b862-7ca45fa1bafc,
    // снята через scripts/db/psql.sh 2026-08-09. По аудиту спеки сырой CRS у этого
    // клиента идёт 25%→65% (+40) за 14 дней роста, при том что показываемое число
    // почти не двигается (75%→83%, +9) — ровно случай, где тренд по показываемому
    // числу непригоден.
    const dcsHistory = {
      '2026-07-05': 0.128, '2026-07-06': 0.035, '2026-07-10': -0.062,
      '2026-07-13': -0.036, '2026-07-14': -0.036, '2026-07-20': 0.126,
      '2026-07-21': 0.134, '2026-07-22': 0.364, '2026-07-23': 1,
      '2026-07-24': -0.005, '2026-07-25': 0.46, '2026-07-26': 0.294,
      '2026-07-27': 0.981, '2026-07-28': 0.455, '2026-07-29': 0.079,
      '2026-07-30': 0.598, '2026-07-31': 0.552, '2026-08-01': 1,
      '2026-08-02': 1, '2026-08-03': 0.722, '2026-08-04': 1,
      '2026-08-05': 0.845, '2026-08-06': 0.843, '2026-08-07': 0.762,
      '2026-08-08': 1, '2026-08-09': 0.597,
    };

    const CascadeCard = loadCascadeCard();
    const result = CascadeCard.getCrsRawTrend('4545ee50-4f5f-4fc0-b862-7ca45fa1bafc', {
      dcsHistory,
      prevDays: [],
      todayDate: '2026-08-09',
    });

    // series[15] = значение 14 дней назад относительно todayDate (2026-07-26)
    expect(result.series[15].date).toBe('2026-07-26');
    expect(result.delta14).toBeCloseTo(result.current - result.series[15].raw, 3);

    // Рост заметный и однозначный — не шум округления, как у показываемого числа.
    expect(result.delta14).toBeGreaterThan(0.15);
    expect(result.current).toBeGreaterThan(result.series[15].raw);

    // Текущее сырое значение попадает в «Рост» (0.45–0.70) по новым засечкам —
    // это и есть факт из спеки: реальный клиент «заперт в Росте» по сырой шкале.
    expect(result.state).toBe('GROWING');
    expect(result.stateLabel).toBe('Рост');
  });

  it('у клиента на плато дельта за 14 дней близка к нулю', () => {
    const dcsHistory = {};
    // 30 дней ровного DCS без выраженного тренда — эмулирует «плато» (Полтавский).
    for (let i = 1; i <= 30; i++) {
      const d = new Date('2026-08-09T12:00:00');
      d.setDate(d.getDate() - i);
      dcsHistory[d.toISOString().slice(0, 10)] = 0.2 + (i % 2 === 0 ? 0.05 : -0.05);
    }

    const CascadeCard = loadCascadeCard();
    const result = CascadeCard.getCrsRawTrend('plateau-client', {
      dcsHistory,
      prevDays: [],
      todayDate: '2026-08-09',
    });

    expect(Math.abs(result.delta14)).toBeLessThan(0.05);
  });

  it('размечает состояния по засечкам CRS_RAW_TREND_THRESHOLDS (25/45/70), не по CRS_THRESHOLDS', () => {
    const CascadeCard = loadCascadeCard();
    expect(CascadeCard.CRS_RAW_TREND_THRESHOLDS).toEqual({
      BASE: 0.25,
      ACCELERATING: 0.45,
      GROWING: 0.70,
    });

    // Один день истории на всю серию → ceiling считается от пустого prevDays
    // (0.65), значения ниже него полностью управляются входным DCS.
    const below = CascadeCard.getCrsRawTrend('c', {
      dcsHistory: { '2026-08-08': 0.1 },
      prevDays: [],
      todayDate: '2026-08-09',
    });
    expect(below.state).toBe('BASE');
    expect(below.distanceToNext).toBeCloseTo(0.25 - below.current, 3);

    const mid = CascadeCard.getCrsRawTrend('c', {
      dcsHistory: { '2026-08-08': 0.35 },
      prevDays: [],
      todayDate: '2026-08-09',
    });
    expect(mid.state).toBe('ACCELERATING');
    expect(mid.distanceToNext).toBeCloseTo(0.45 - mid.current, 3);
  });

  it('не трогает показываемую шкалу: CRS_THRESHOLDS остаётся прежним', () => {
    const CascadeCard = loadCascadeCard();
    expect(CascadeCard.CRS_THRESHOLDS).toEqual({
      STRONG: 0.90,
      GROWING: 0.75,
      BUILDING: 0.60,
      RECOVERY: 0.53,
    });
  });
});
