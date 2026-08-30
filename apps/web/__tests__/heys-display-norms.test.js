import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function loadScript(relPath) {
  // eslint-disable-next-line no-new-func
  new Function('window', read(relPath))(global);
}

beforeAll(() => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  global.HEYS.TEF = { ATWATER: { protein: 3, carbs: 4, fat: 9 } };
  global.HEYS.Steps = {
    STEPS_HISTORY_LOOKBACK_DAYS: 14,
    STEPS_HISTORY_MIN_DAYS: 3,
    medianStepsValue(values) {
      if (!Array.isArray(values) || values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 1) return sorted[mid];
      return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    },
    collectRecentStepsHistory(readDay, today, lookbackDays = 14) {
      const stepsData = [];
      const anchor = today instanceof Date && !Number.isNaN(today.getTime()) ? new Date(today) : new Date();
      for (let i = 1; i <= lookbackDays; i++) {
        const d = new Date(anchor);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const dayData = readDay(key, {}) || {};
        if (dayData.steps !== null && dayData.steps !== undefined) {
          stepsData.push(Number(dayData.steps) || 0);
        }
      }
      return stepsData;
    },
  };
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  loadScript('apps/web/heys_tdee_v1.js');
  loadScript('apps/web/heys_day_calculations.js');
});

describe('HEYS.TDEE steps (heys/798770 PR A)', () => {
  const profile = { weight: 75, height: 175, age: 35, gender: 'Мужской', weightGoal: 70, deficitPctTarget: -20 };

  // Признак «шаги внесены» переехал с формы значения на метку домена
  // (stepsUpdatedAt) — решение владельца «Б», 2026-08-31. Причина: ensureDay
  // приводит steps к числу (`+d.steps || 0`), поэтому null до экрана дня не
  // доживал и явный ноль был неотличим от незаполненного дня. Смысл проверки
  // прежний — «прошёл ноль» обязан отличаться от «не вносил».
  // Разбор: docs/implementation/ACTIVITY_TAB_AS_IS.md §15.2.
  it('явный ноль отличается от незаполненного дня — по метке правки', () => {
    const calc = (day) => global.HEYS.TDEE.calculate({ weightMorning: 75, ...day }, profile, {
      readDay: () => ({}),
      anchorDate: '2026-08-18',
    });

    // Поля нет вовсе — дню шагов не вносили.
    expect(calc({ steps: null }).stepsMissing).toBe(true);
    // Ноль без метки — тоже незаполненный день: так его пишет ensureDay.
    expect(calc({ steps: 0 }).stepsMissing).toBe(true);

    // Ноль с меткой — человек действительно отметил ноль шагов.
    const explicitZero = calc({ steps: 0, stepsUpdatedAt: 1730000000000 });
    expect(explicitZero.stepsMissing).toBe(false);
    expect(explicitZero.stepsEstimated).toBe(false);
    expect(explicitZero.stepsKcal).toBe(0);
  });

  it('медиана шагов — оценка при ≥3 фактах в окне', () => {
    const readDay = (key) => {
      if (key === '2026-08-17') return { steps: 8000 };
      if (key === '2026-08-16') return { steps: 9000 };
      if (key === '2026-08-15') return { steps: 7000 };
      return {};
    };
    const res = global.HEYS.TDEE.calculate({ steps: null, date: '2026-08-18', weightMorning: 75 }, profile, {
      readDay,
      anchorDate: '2026-08-18',
    });
    expect(res.stepsEstimated).toBe(true);
    expect(res.steps).toBe(8000);
    expect(res.stepsKcalForDebt).toBe(0);
    expect(res.stepsKcal).toBeGreaterThan(0);
  });

  it('optimum < BMR → warning', () => {
    const deep = global.HEYS.TDEE.calculate(
      { steps: 0, weightMorning: 75, deficitPct: -40 },
      profile,
      { readDay: () => ({}), anchorDate: '2026-08-18' }
    );
    if (deep.optimum < deep.bmr) {
      expect(deep.warnings).toContain('optimumBelowBmr');
    }
  });

  it('acceptance №7 — оценённые шаги в optimum, не в baseOptimumForDebt', () => {
    const readDay = (key) => {
      if (key === '2026-08-17') return { steps: 8000 };
      if (key === '2026-08-16') return { steps: 9000 };
      if (key === '2026-08-15') return { steps: 7000 };
      return {};
    };
    const estimated = global.HEYS.TDEE.calculate(
      { steps: null, date: '2026-08-18', weightMorning: 75 },
      profile,
      { readDay, anchorDate: '2026-08-18' }
    );
    const factual = global.HEYS.TDEE.calculate(
      { steps: null, date: '2026-08-18', weightMorning: 75 },
      profile,
      { readDay: () => ({}), anchorDate: '2026-08-18' }
    );
    expect(estimated.stepsEstimated).toBe(true);
    expect(estimated.optimum).toBeGreaterThan(factual.optimum);
    expect(estimated.baseOptimumForDebt).toBe(factual.baseOptimumForDebt);
  });

  it('defaultReadDay — scoped ключ раньше legacy', () => {
    const store = {};
    const lsGet = (key, fb) => (key in store ? store[key] : fb);
    store['heys_client-a_dayv2_2026-08-17'] = { steps: 5000 };
    store['heys_dayv2_2026-08-17'] = { steps: 9999 };
    const res = global.HEYS.TDEE.calculate(
      { steps: null, date: '2026-08-18', weightMorning: 75 },
      { ...profile, clientId: 'client-a' },
      { lsGet, anchorDate: '2026-08-18' }
    );
    expect(res.steps).not.toBe(9999);
  });
});

describe('HEYS.dayCalculations.computeDisplayNorms (heys/798770 PR C)', () => {
  const normPerc = { carbsPct: 40, proteinPct: 25, simpleCarbPct: 30, badFatPct: 20, fiberPct: 14 };

  it('дефицит 75 кг М → 1.8 г/кг = 135 г белка', () => {
    const { normAbs, proteinMeta } = global.HEYS.dayCalculations.computeDisplayNorms({
      displayOptimum: 1800,
      normPerc,
      profile: { weight: 75, weightGoal: 70, gender: 'Мужской' },
      day: { weightMorning: 75 },
      tdeeResult: { trainingsKcal: 0 },
    });
    expect(normAbs.prot).toBe(135);
    expect(proteinMeta.mode).toBe('deficit');
  });

  it('trainingsKcal 149 vs 151 — надбавка только при ≥150', () => {
    const base = global.HEYS.dayCalculations.computeDisplayNorms({
      displayOptimum: 1800,
      normPerc,
      profile: { weight: 75, weightGoal: 70, gender: 'Мужской' },
      day: { weightMorning: 75 },
      tdeeResult: { trainingsKcal: 149 },
    });
    const withTrain = global.HEYS.dayCalculations.computeDisplayNorms({
      displayOptimum: 1800,
      normPerc,
      profile: { weight: 75, weightGoal: 70, gender: 'Мужской' },
      day: { weightMorning: 75 },
      tdeeResult: { trainingsKcal: 151 },
    });
    expect(withTrain.normAbs.prot - base.normAbs.prot).toBe(Math.round(0.2 * 75));
  });

  it('потолок 2.4 г/кг — prot не выше cap', () => {
    const { normAbs } = global.HEYS.dayCalculations.computeDisplayNorms({
      displayOptimum: 4000,
      normPerc,
      profile: { weight: 120, weightGoal: 80, gender: 'Мужской' },
      day: { weightMorning: 120 },
      tdeeResult: { trainingsKcal: 200 },
    });
    expect(normAbs.prot).toBe(240);
    expect(normAbs.prot).toBeLessThanOrEqual(Math.round(2.4 * 120));
  });

  it('режим по weightGoal, не deficitPctTarget', () => {
    const { proteinMeta } = global.HEYS.dayCalculations.computeDisplayNorms({
      displayOptimum: 1800,
      normPerc,
      profile: { weight: 91, weightGoal: 80, gender: 'Мужской', deficitPctTarget: 0 },
      day: { weightMorning: 91 },
      tdeeResult: { trainingsKcal: 0 },
    });
    expect(proteinMeta.mode).toBe('deficit');
    expect(proteinMeta.coeffGPerKg).toBe(1.8);
  });

  it('глубокий дефицит — deficitTooDeepForMacros', () => {
    const { warnings, normAbs } = global.HEYS.dayCalculations.computeDisplayNorms({
      displayOptimum: 900,
      normPerc,
      profile: { weight: 100, weightGoal: 70, gender: 'Женский' },
      day: { weightMorning: 100 },
      tdeeResult: { trainingsKcal: 0 },
    });
    expect(warnings).toContain('deficitTooDeepForMacros');
    expect(normAbs.prot).toBe(120);
  });

  it('weightGoal 0 = не задан → поддержка, не дефицит', () => {
    const { normAbs, proteinMeta } = global.HEYS.dayCalculations.computeDisplayNorms({
      displayOptimum: 1800,
      normPerc,
      profile: { weight: 75, weightGoal: 0, gender: 'Мужской' },
      day: { weightMorning: 75 },
      tdeeResult: { trainingsKcal: 0 },
    });
    expect(proteinMeta.mode).toBe('maintenance');
    expect(normAbs.prot).toBe(120);
  });

  it('пустой heys_norms — дефолтные доли У/Ж, не весь остаток в жир', () => {
    const { normAbs } = global.HEYS.dayCalculations.computeDisplayNorms({
      displayOptimum: 1800,
      normPerc: {},
      profile: { weight: 75, weightGoal: 70, gender: 'Мужской' },
      day: { weightMorning: 75 },
      tdeeResult: { trainingsKcal: 0 },
    });
    expect(normAbs.prot).toBe(135);
    expect(normAbs.carbs).toBeGreaterThan(50);
    expect(normAbs.fat).toBeLessThan(120);
  });

  it('acceptance №8 — PR B потребители не зовут computeDailyNorms без ctx', () => {
    const files = [
      'apps/web/widgets/widget_data.js',
      'apps/web/heys_app_shell_v1.js',
      'apps/web/heys_yesterday_verify_v1.js',
    ];
    const twoArgCall = /computeDailyNorms\s*\(\s*[^,)]+,\s*[^,)]+\s*\)/;
    for (const file of files) {
      const src = read(file);
      expect(src, file).not.toMatch(twoArgCall);
    }
  });

  it('resolveNormPerc сохраняет осознанный harmPct: 0 и giPct: 1', () => {
    const { normAbs } = global.HEYS.dayCalculations.computeDisplayNorms({
      displayOptimum: 1800,
      normPerc: { harmPct: 0, giPct: 1, carbsPct: 40, proteinPct: 25 },
      profile: { weight: 75, weightGoal: 70, gender: 'Мужской' },
      day: { weightMorning: 75 },
      tdeeResult: { trainingsKcal: 0 },
    });
    expect(normAbs.harm).toBe(0);
    expect(normAbs.gi).toBe(1);
  });
});
