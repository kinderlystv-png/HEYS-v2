// activity-numbers-net-and-plan.test.js — числа вкладки «Актив» после разбора
// 2026-08-30 (docs/implementation/ACTIVITY_TAB_AS_IS.md, дефекты A, B, C, E, T).
//
// Стыки, которые нельзя закрыть просмотром экрана: попап объясняет число, из
// которого его открыли; одна и та же бытовая активность показана дважды на
// одном экране; третий слот тренировок; назначенное куратором в списке фактов;
// разминка и сбросы, переживающие пересборку журнала.

import fs from 'fs';
import path from 'path';
import React from 'react';
import ReactDOM from 'react-dom';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

/** Брутто-цена минуты — то, чем считали до правки: MET × вес × 0.0175. */
const grossKcalPerMin = (met, weight) => (met * 3.5 * weight) / 200;
/** Нетто, как в TDEE: активность стоит столько, на сколько она дороже покоя. */
const netKcalPerMin = (met, weight) => grossKcalPerMin(Math.max(met - 1, 0), weight);

function loadFiles(files) {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  globalThis.ReactDOM = globalThis.window.ReactDOM = ReactDOM;
  for (const rel of files) {
    /* eslint-disable-next-line no-eval */
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  }
  return globalThis.HEYS;
}

afterEach(() => {
  cleanup();
  delete globalThis.HEYS;
  if (globalThis.window) delete globalThis.window.HEYS;
});

// ───────────────────────────────────────────────────────────────────────────
// A · попап «формулы» приходит к тому же числу, что чип, из которого открыт
// ───────────────────────────────────────────────────────────────────────────

describe('A · формула зоны и быта считает нетто', () => {
  const WEIGHT = 80;
  const METS = [2.5, 6, 8, 10];
  // Тот же массив, что кладёт TDEE и по которому считает чип зоны.
  const KCAL_MIN = METS.map((m) => netKcalPerMin(m, WEIGHT));

  function renderPopups(extra) {
    const HEYS = loadFiles(['heys_day_training_popups_v1.js']);
    HEYS.TDEE = { netKcalPerMin };
    return {
      HEYS,
      portals: HEYS.dayTrainingPopups.renderTrainingPopups({
        TR: [{ z: [0, 45, 0, 0] }],
        mets: METS,
        kcalMin: KCAL_MIN,
        zoneNames: ['Разминка', 'Жиросжигание', 'Аэробная', 'Анаэробная'],
        weight: WEIGHT,
        kcalPerMin: grossKcalPerMin,
        r0: (v) => Math.round(v || 0),
        householdActivities: [{ minutes: 60 }],
        ...extra,
      }),
    };
  }

  it('зона: 45 мин Z2 при 80 кг — 315 ккал, как на чипе, а не 378 брутто', () => {
    const { portals } = renderPopups({
      zoneFormulaPopup: { zi: 1, ti: 0, left: 10, top: 10 },
      closeZoneFormula: () => {},
    });
    render(React.createElement(React.Fragment, null, portals));

    const chipKcal = Math.round(45 * KCAL_MIN[1]);
    expect(chipKcal).toBe(315);
    expect(screen.getByText('= ' + chipKcal + ' ккал')).toBeTruthy();
    expect(screen.queryByText('= ' + Math.round(45 * grossKcalPerMin(6, WEIGHT)) + ' ккал')).toBeNull();
  });

  it('зона: подпись формулы читается как расчёт и содержит (MET − 1)', () => {
    const { portals } = renderPopups({
      zoneFormulaPopup: { zi: 1, ti: 0, left: 10, top: 10 },
      closeZoneFormula: () => {},
    });
    render(React.createElement(React.Fragment, null, portals));

    expect(screen.getByText('45 × (6 − 1) × 80 × 0.0175')).toBeTruthy();
    // Прежняя подпись «× 0.0175 − 1» неверна ни для нетто, ни для брутто.
    expect(screen.queryByText(/0\.0175 − 1$/)).toBeNull();
  });

  it('быт: 60 мин при 80 кг — 126 ккал, а не 210 брутто', () => {
    const { portals } = renderPopups({
      householdFormulaPopup: { hi: 0, left: 10, top: 10 },
      closeHouseholdFormula: () => {},
    });
    render(React.createElement(React.Fragment, null, portals));

    expect(Math.round(60 * netKcalPerMin(2.5, WEIGHT))).toBe(126);
    expect(screen.getByText('= 126 ккал')).toBeTruthy();
    expect(screen.getByText('60 × (2.5 − 1) × 80 × 0.0175')).toBeTruthy();
  });

  it('быт: без загруженного TDEE фолбэк даёт то же нетто', () => {
    const HEYS = loadFiles(['heys_day_training_popups_v1.js']);
    // HEYS.TDEE намеренно не задан: порядок загрузки модулей не гарантирован.
    const portals = HEYS.dayTrainingPopups.renderTrainingPopups({
      householdFormulaPopup: { hi: 0, left: 10, top: 10 },
      closeHouseholdFormula: () => {},
      weight: WEIGHT,
      kcalPerMin: grossKcalPerMin,
      r0: (v) => Math.round(v || 0),
      householdActivities: [{ minutes: 60 }],
    });
    render(React.createElement(React.Fragment, null, portals));
    expect(screen.getByText('= 126 ккал')).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// B · бейдж быта внутри блока тренировок совпадает со строкой яруса «Сегодня»
// ───────────────────────────────────────────────────────────────────────────

describe('B · бейдж бытовой активности считает нетто', () => {
  it('60 мин при 80 кг дают 126 ккал — столько же, сколько в TDEE', () => {
    const HEYS = loadFiles(['heys_day_trainings_v1.js']);
    HEYS.TDEE = { netKcalPerMin };

    const block = HEYS.dayTrainings.renderTrainingsBlock({
      visibleTrainings: 0,
      householdActivities: [{ minutes: 60 }],
      trainingTypes: [],
      TR: [],
      kcalMin: [0, 0, 0, 0],
      kcalPerMin: grossKcalPerMin,
      weight: 80,
      r0: (v) => Math.round(v || 0),
      dateKey: '2026-08-30',
      trainingFilterMode: 'all',
    });
    render(block);

    // Строка яруса «Сегодня» берёт householdKcal прямо из TDEE.
    const tdeeHouseholdKcal = Math.round(60 * netKcalPerMin(2.5, 80));
    expect(tdeeHouseholdKcal).toBe(126);
    expect(screen.getByText('126 ккал')).toBeTruthy();
    expect(screen.queryByText('210 ккал')).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// C · третий слот тренировок входит в «Кардио» и в разбор
// ───────────────────────────────────────────────────────────────────────────

describe('C · третья тренировка не теряется', () => {
  function renderActivity(ctxExtra) {
    const HEYS = loadFiles(['heys_day_activity_v1.js']);
    HEYS.TDEE = { calculate: () => ({ kcalMin: [0, 2, 3, 4] }) };
    const ctx = {
      day: {
        date: '2026-08-30',
        trainings: [
          { type: 'cardio', z: [0, 30, 0, 0] },
          { type: 'cardio', z: [0, 20, 0, 0] },
          { type: 'cardio', z: [0, 15, 0, 0] },
        ],
      },
      prof: {},
      trainingTypes: [{ id: 'cardio', label: 'Кардио' }],
      stepsValue: 0,
      stepsGoal: 10000,
      stepsPercent: 0,
      stepsColor: '#000',
      stepsK: 0,
      bmr: 1700,
      householdK: 0,
      totalHouseholdMin: 0,
      train1k: 100,
      train2k: 50,
      train3k: 40,
      r0: (v) => Math.round(v || 0),
      visibleTrainings: 3,
      regularTrainingsBlock: React.createElement('div', null, 'блок тренировок'),
      ndteData: { active: false },
      ndteBoostKcal: 0,
      tefData: {},
      tefKcal: 0,
      dayTargetDef: -15,
      displayOptimum: 1940,
      tdee: 2280,
      caloricDebt: null,
      monthTrainingsRows: [],
      morningActivationCalendarBlock: null,
      ...ctxExtra,
    };
    render(HEYS.dayActivity.render({ React, ctx, actions: {} }));
    return HEYS;
  }

  it('строка «Тренировки» яруса суммирует все три слота', () => {
    renderActivity();
    const row = document.querySelector('.activity-v4-today__row');
    expect(row.querySelector('.activity-v4-today__name').textContent).toBe('Тренировки');
    expect(row.querySelector('.activity-v4-today__value').textContent).toBe('190 ккал');
  });

  it('строка «Тренировки» в разборе показывает ту же сумму', () => {
    renderActivity();
    fireEvent.click(document.querySelector('.activity-v4-hero__footer'));
    const row = [...document.querySelectorAll('.activity-v4-breakdown__row')]
      .find((r) => r.querySelector('.activity-v4-breakdown__name').textContent === 'Тренировки');
    // Разбор пишет число без единицы — единица стоит в шапке карточки.
    expect(row.querySelector('.activity-v4-breakdown__value').textContent).toBe('+190');
  });

  it('без третьей тренировки поведение прежнее', () => {
    renderActivity({ train3k: 0 });
    expect(document.querySelector('.activity-v4-today__value').textContent).toBe('150 ккал');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// E · назначенное куратором не считается сделанным
// ───────────────────────────────────────────────────────────────────────────

describe('E · «Тренировки за месяц» показывают только факт', () => {
  const DATE = '2026-08-30';

  function collect(withKernel) {
    const HEYS = loadFiles(withKernel
      ? ['_kernel/heys_kernel_load_v1.js', 'heys_day_activity_v1.js']
      : ['heys_day_activity_v1.js']);

    const day = {
      trainings: [
        { type: 'cardio', z: [0, 30, 0, 0] },
        { type: 'strength', z: [0, 45, 0, 0], plan: { status: 'assigned' } },
        { type: 'strength', z: [0, 45, 0, 0], plan: { status: 'skipped' } },
        { type: 'strength', z: [0, 45, 0, 0], plan: { status: 'moved' } },
        { type: 'strength', z: [0, 40, 0, 0], plan: { status: 'done' } },
      ],
    };

    return HEYS.dayActivity.collectMonthTrainingRows({
      lsGet: (key) => (key === 'heys_dayv2_' + DATE ? day : null),
      kcalMin: [0, 2, 3, 4],
      trainingTypes: [
        { id: 'cardio', label: 'Кардио' },
        { id: 'strength', label: 'Силовая' },
      ],
      r0: (v) => Math.round(v || 0),
      formatDateDisplay: () => ({ label: '30 авг', sub: '' }),
      todayISO: () => DATE,
      parseISO: (s) => new Date(s + 'T12:00:00'),
      fmtDate: (d) => d.toISOString().slice(0, 10),
    });
  }

  it('assigned / skipped / moved отсеиваются, выполненное остаётся', () => {
    const rows = collect(true);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.typeLabel)).toEqual(['Кардио', 'Силовая']);
    // Строк «0 ккал» за тренировки, которых не было, больше нет.
    expect(rows.every((r) => r.kcal > 0)).toBe(true);
  });

  it('без загруженного ядра фолбэк отсеивает те же статусы', () => {
    expect(collect(false)).toHaveLength(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// T · пересборка журнала не теряет разминку, сбросы и снимок справочника
// ───────────────────────────────────────────────────────────────────────────

describe('T · состав подхода переживает пересборку', () => {
  let HEYS;
  beforeEach(() => {
    HEYS = loadFiles(['_kernel/heys_kernel_strength_v1.js', 'heys_day_trainings_v1.js']);
  });

  const warmupApproach = {
    id: 'ap_w',
    type: 'warmup',
    weightKg: '40',
    reps: 10,
    done: true,
  };
  const workApproach = {
    id: 'ap_1',
    weightKg: '100',
    reps: 5,
    done: true,
    extraWeightKg: 5,
    drops: [{ weightKg: '80', reps: 6, done: true }],
    discomfort: true,
    discomfortNote: 'плечо',
  };

  it('перенос сохраняет тип, довес и сбросы', () => {
    const out = HEYS.dayTrainings.carryApproachSnapshotFields(
      { id: 'x', weightKg: '100', reps: 5, done: true },
      workApproach,
      true,
    );
    expect(out.extraWeightKg).toBe(5);
    expect(out.drops).toEqual([{ weightKg: '80', reps: 6, done: true }]);
    expect(out.discomfort).toBe(true);
    expect(out.discomfortNote).toBe('плечо');
  });

  it('разминочный подход остаётся разминочным', () => {
    const out = HEYS.dayTrainings.carryApproachSnapshotFields(
      { id: 'x', weightKg: '40', reps: 10, done: true },
      warmupApproach,
      true,
    );
    expect(out.type).toBe('warmup');
    expect(HEYS.TrainingKernel.strength.isWarmupApproach(out)).toBe(true);
  });

  it('снимок справочника на упражнении не теряется', () => {
    const out = HEYS.dayTrainings.carryExerciseSnapshotFields(
      { id: 'x', name: 'Подтягивания' },
      { unit: 'bodyweight', bodyweightFactor: 0.95, primaryGroup: 'back', secondaryGroups: ['biceps'] },
    );
    expect(out.unit).toBe('bodyweight');
    expect(out.bodyweightFactor).toBe(0.95);
    expect(out.secondaryGroups).toEqual(['biceps']);
  });

  it('тоннаж после пересборки тот же: разминка вне счёта, сбросы в счёте', () => {
    const exercises = [{
      id: 'ex_0',
      name: 'Жим лёжа',
      unit: 'weight_reps',
      approaches: [warmupApproach, workApproach],
    }];
    const before = HEYS.TrainingKernel.strength.trainingTonnage({
      type: 'strength', strengthEntryMode: 'workout_builder', workoutLog: { exercises },
    });

    const rebuilt = exercises.map((ex) => HEYS.dayTrainings.carryExerciseSnapshotFields({
      id: ex.id,
      name: ex.name,
      approaches: ex.approaches.map((a) => HEYS.dayTrainings.carryApproachSnapshotFields({
        id: a.id,
        weightKg: a.weightKg != null ? String(a.weightKg) : '',
        reps: a.reps,
        done: !!a.done,
      }, a, true)),
    }, ex));
    const after = HEYS.TrainingKernel.strength.trainingTonnage({
      type: 'strength', strengthEntryMode: 'workout_builder', workoutLog: { exercises: rebuilt },
    });

    // 100×5 + 80×6 = 980; 40×10 разминки в тоннаж не идут.
    expect(before.totalVolume).toBe(980);
    expect(after.totalVolume).toBe(before.totalVolume);
    expect(after.warmupApproaches).toBe(1);
  });

  it('«повторить прошлую» сохраняет состав, но сбрасывает отметки', () => {
    const [clone] = HEYS.dayTrainings.cloneExercisesForReplay([{
      id: 'ex_0',
      name: 'Жим лёжа',
      unit: 'weight_reps',
      bodyweightFactor: null,
      approaches: [warmupApproach, workApproach],
    }]);

    expect(clone.unit).toBe('weight_reps');
    expect(clone.approaches[0].type).toBe('warmup');
    expect(clone.approaches[1].extraWeightKg).toBe(5);
    expect(clone.approaches[1].drops).toEqual([{ weightKg: '80', reps: 6, done: false }]);
    expect(clone.approaches.every((a) => a.done === false)).toBe(true);
    // Боль — факт прошедшего подхода, в план повтора она не едет.
    expect(clone.approaches[1].discomfort).toBeUndefined();
  });

  it('пересборка журнала действительно зовёт оба переносчика', () => {
    const src = fs.readFileSync(path.join(WEB_DIR, 'heys_day_trainings_v1.js'), 'utf8');
    const body = src.slice(src.indexOf('function ensureWorkoutLogShape'));
    const end = body.indexOf('function patchTraining');
    const shape = body.slice(0, end > 0 ? end : body.length);
    expect(shape).toContain('carryExerciseSnapshotFields(base, e)');
    expect(shape).toContain('carryApproachSnapshotFields({');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Предусловие решения 7 · тоннаж дня знает массу тела
// ───────────────────────────────────────────────────────────────────────────

describe('bodyWeightKg · тоннаж дня совпадает с конструктором', () => {
  const PULLUPS = {
    id: 'ex_0',
    name: 'Подтягивания',
    unit: 'bodyweight',
    bodyweightFactor: 0.95,
    approaches: [{ id: 'a0', weightKg: '', reps: 10, done: true }],
  };

  function dayWith(weightMorning) {
    return {
      date: '2026-08-30',
      weightMorning,
      trainings: [{
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        workoutLog: { exercises: [PULLUPS] },
      }],
    };
  }

  function loadWithStore(day) {
    const HEYS = loadFiles(['_kernel/heys_kernel_strength_v1.js', 'heys_day_trainings_v1.js']);
    HEYS.utils = {
      lsGet: (key, def) => {
        if (key === 'heys_profile') return { weight: 70 };
        if (key.indexOf('dayv2_') !== -1) return day;
        return def;
      },
    };
    return HEYS;
  }

  it('упражнение на своём весе больше не даёт ноль', () => {
    const day = dayWith(80);
    const HEYS = loadWithStore(day);
    const expected = HEYS.TrainingKernel.strength
      .trainingTonnage(day.trainings[0], { bodyWeightKg: 80 }).totalVolume;

    // 80 × 0.95 × 10 = 760 — столько же показывает конструктор.
    expect(expected).toBe(760);
    expect(HEYS.dayTrainings.computeDayTotalTonnage('2026-08-30')).toBe(expected);
    // Без массы тела ядро отдаёт ноль — именно это и было на дне.
    expect(HEYS.TrainingKernel.strength
      .trainingTonnage(day.trainings[0], {}).totalVolume).toBe(0);
  });

  it('берётся вес того дня, а не сегодняшний из профиля', () => {
    const HEYS = loadWithStore(dayWith(80));
    expect(HEYS.dayTrainings.computeDayTotalTonnage('2026-08-30')).toBe(760);
  });

  it('без утреннего веса падаем на профиль, а не на ноль', () => {
    const HEYS = loadWithStore(dayWith(''));
    // 70 × 0.95 × 10 = 665
    expect(HEYS.dayTrainings.computeDayTotalTonnage('2026-08-30')).toBe(665);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// L1 · признак оценённых шагов доезжает до экрана
// ───────────────────────────────────────────────────────────────────────────

describe('L1 · контекст дня отдаёт признак оценки шагов', () => {
  function build(tdeeResult) {
    const HEYS = loadFiles(['heys_day_energy_context_v1.js']);
    HEYS.TDEE = { calculate: () => tdeeResult };
    return HEYS.dayEnergyContext.buildEnergyContext({
      day: { date: '2026-08-30', meals: [] },
      prof: {},
      lsGet: () => ({}),
      r0: (v) => Math.round(v || 0),
      HEYS,
    });
  }

  it('медиана вместо факта видна вызывающему', () => {
    const ctx = build({ stepsKcal: 210, steps: 7400, stepsEstimated: true, stepsMissing: false });
    expect(ctx.stepsEstimated).toBe(true);
    expect(ctx.stepsResolved).toBe(7400);
    expect(ctx.stepsMissing).toBe(false);
  });

  it('«нет данных» отличимо от факта и от оценки', () => {
    const ctx = build({ stepsKcal: 0, steps: 0, stepsEstimated: false, stepsMissing: true });
    expect(ctx.stepsMissing).toBe(true);
    expect(ctx.stepsEstimated).toBe(false);
  });

  it('обычный факт не помечается ничем', () => {
    const ctx = build({ stepsKcal: 300, steps: 9000, stepsEstimated: false, stepsMissing: false });
    expect(ctx.stepsEstimated).toBe(false);
    expect(ctx.stepsMissing).toBe(false);
    expect(ctx.stepsResolved).toBe(9000);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// L2 · оценка шагов по медиане включается на экране дня
// ───────────────────────────────────────────────────────────────────────────

describe('L2 · «прошёл ноль» и «не вносил» — разные состояния', () => {
  function loadTdee() {
    if (!globalThis.window) globalThis.window = globalThis;
    globalThis.window.HEYS = globalThis.HEYS = {};
    /* eslint-disable-next-line no-eval */
    eval(fs.readFileSync(path.join(WEB_DIR, 'heys_tdee_v1.js'), 'utf8'));
    return globalThis.HEYS;
  }

  /** История: дни с настоящими шагами + один явный ноль + пустые дни. */
  function makeReadDay(entries) {
    return (key) => entries[key] || {};
  }

  function daysBack(n, from = '2026-08-31') {
    const d = new Date(from + 'T12:00:00');
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  it('ноль с меткой правки — это факт «прошёл ноль», не оценка', () => {
    const HEYS = loadTdee();
    expect(HEYS.TDEE.hasStepsFact({ steps: 0, stepsUpdatedAt: 1730000000000 })).toBe(true);
    const res = HEYS.TDEE.resolveStepsInput(
      { date: '2026-08-31', steps: 0, stepsUpdatedAt: 1730000000000 }, {}, { readDay: () => ({}) },
    );
    expect(res).toMatchObject({ steps: 0, stepsEstimated: false, stepsMissing: false });
  });

  it('ноль без метки — незаполненный день, а не нулевая активность', () => {
    const HEYS = loadTdee();
    expect(HEYS.TDEE.hasStepsFact({ steps: 0 })).toBe(false);
    expect(HEYS.TDEE.hasStepsFact({})).toBe(false);
    expect(HEYS.TDEE.hasStepsFact({ steps: 8000 })).toBe(true);
  });

  it('незаполненный день берёт медиану прошлых, и это помечено', () => {
    const HEYS = loadTdee();
    HEYS.Steps = {
      STEPS_HISTORY_LOOKBACK_DAYS: 14,
      STEPS_HISTORY_MIN_DAYS: 3,
      collectRecentStepsHistory: (readDay, anchor, lookback) => {
        const out = [];
        for (let i = 1; i <= lookback; i++) {
          const d = new Date(anchor);
          d.setDate(d.getDate() - i);
          const day = readDay(d.toISOString().slice(0, 10), {}) || {};
          if (HEYS.TDEE.hasStepsFact(day)) out.push(Number(day.steps) || 0);
        }
        return out;
      },
      medianStepsValue: (v) => {
        const s = [...v].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
      },
    };

    const entries = {
      [daysBack(1)]: { steps: 6000, stepsUpdatedAt: 1 },
      [daysBack(2)]: { steps: 8000, stepsUpdatedAt: 1 },
      [daysBack(3)]: { steps: 10000, stepsUpdatedAt: 1 },
      // Незаполненные дни в медиану не идут — иначе она уползала бы в ноль.
      [daysBack(4)]: { steps: 0 },
      [daysBack(5)]: {},
    };

    const res = HEYS.TDEE.resolveStepsInput(
      { date: '2026-08-31', steps: 0 }, {}, { readDay: makeReadDay(entries) },
    );
    expect(res.stepsEstimated).toBe(true);
    expect(res.stepsMissing).toBe(false);
    expect(res.steps).toBe(8000); // медиана 6000/8000/10000, нули не учтены
  });

  it('у нового человека оценки нет — «нет данных», а не выдуманное число', () => {
    const HEYS = loadTdee();
    HEYS.Steps = {
      STEPS_HISTORY_LOOKBACK_DAYS: 14,
      STEPS_HISTORY_MIN_DAYS: 3,
      collectRecentStepsHistory: () => [],
      medianStepsValue: () => 0,
    };
    const res = HEYS.TDEE.resolveStepsInput(
      { date: '2026-08-31', steps: 0 }, {}, { readDay: () => ({}) },
    );
    expect(res).toMatchObject({ steps: 0, stepsEstimated: false, stepsMissing: true });
  });

  it('оценка не попадает в расчёт долга — там она обнуляется', () => {
    const HEYS = loadTdee();
    HEYS.Steps = {
      STEPS_HISTORY_LOOKBACK_DAYS: 14,
      STEPS_HISTORY_MIN_DAYS: 3,
      collectRecentStepsHistory: () => [7000, 8000, 9000],
      medianStepsValue: () => 8000,
    };
    const out = HEYS.TDEE.calculate(
      { date: '2026-08-31', steps: 0, trainings: [] },
      { weight: 80, height: 180, age: 35 },
      { readDay: (k) => ({ steps: 8000, stepsUpdatedAt: 1, date: k }) },
    );
    expect(out.stepsEstimated).toBe(true);
    expect(out.stepsKcal).toBeGreaterThan(0);
    expect(out.stepsKcalForDebt).toBe(0);
  });

  it('сборщик истории в heys_steps_v1 спрашивает тот же предикат', () => {
    const src = fs.readFileSync(path.join(WEB_DIR, 'heys_steps_v1.js'), 'utf8');
    expect(src).toContain('hasStepsFactForHistory(dayData)');
    expect(src).toContain('HEYS.TDEE && HEYS.TDEE.hasStepsFact');
    // Прежнее правило «любое не-null считается фактом» ушло.
    expect(src).not.toContain("// steps === 0 — явный ввод; null/undefined — нет данных");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Блок 1 · разбор цели приходит к числу, из которого его открыли
// tab-activity.v4.dc.html, строки 8–11 и кадр «Актив · разбор цели»
// ───────────────────────────────────────────────────────────────────────────

describe('Разбор цели · сведение с канвасом', () => {
  function renderBreakdown(ctxExtra) {
    const HEYS = loadFiles(['heys_day_activity_v1.js']);
    HEYS.TDEE = { calculate: () => ({ kcalMin: [0, 2, 3, 4] }) };
    const ctx = {
      day: { date: '2026-08-30' },
      prof: {},
      stepsValue: 8420, stepsGoal: 10000, stepsPercent: 67, stepsColor: '#000', stepsK: 312,
      bmr: 1520,
      householdK: 126, totalHouseholdMin: 60,
      train1k: 385, train2k: 0, train3k: 0,
      r0: (v) => Math.round(v || 0),
      visibleTrainings: 1,
      regularTrainingsBlock: React.createElement('div', null, 'блок'),
      ndteData: { active: false }, ndteBoostKcal: 0,
      tefData: {}, tefKcal: 188,
      dayTargetDef: -15,
      displayOptimum: 2210,
      optimum: 1992,
      cycleKcalMultiplier: 1,
      tdee: 2531,
      caloricDebt: { dailyBoost: 218 },
      monthTrainingsRows: [],
      morningActivationCalendarBlock: null,
      ...ctxExtra,
    };
    render(HEYS.dayActivity.render({ React, ctx, actions: {} }));
    // Разбор открывается тапом по строке причины под числом; сам текст
    // причины меняется вместе с состоянием дня, поэтому жмём кнопку.
    fireEvent.click(document.querySelector('.activity-v4-hero__footer'));
    return [...document.querySelectorAll('.activity-v4-breakdown__row')].map((row) => [
      row.querySelector('.activity-v4-breakdown__name').textContent,
      row.querySelector('.activity-v4-breakdown__value').textContent,
    ]);
  }

  it('последняя строка — «Цель дня» с числом из hero', () => {
    const rows = renderBreakdown();
    expect(rows[rows.length - 1]).toEqual(['Цель дня', '2210']);
    // То же число стоит наверху карточки.
    expect(screen.getAllByText('2210').length).toBeGreaterThanOrEqual(2);
  });

  it('состав и порядок строк — как в контракте', () => {
    expect(renderBreakdown().map((r) => r[0])).toEqual([
      'Базовый обмен',
      'Шаги',
      'Быт',
      'Тренировки',
      'База без термического эффекта',
      'Термический эффект еды',
      'Затраты',
      'Дефицит по договорённости',
      'Компенсация долга',
      'Цель дня',
    ]);
  });

  it('строка составляющей появляется только при значении больше нуля', () => {
    const names = renderBreakdown({ householdK: 0, train1k: 0, tefKcal: 0 }).map((r) => r[0]);
    expect(names).not.toContain('Быт');
    expect(names).not.toContain('Тренировки');
    expect(names).not.toContain('Термический эффект еды');
    expect(names).toContain('Базовый обмен');
  });

  it('причина уровня ровно одна и сходится с разницей целей', () => {
    const rows = renderBreakdown();
    const reasons = rows.filter((r) => ['Компенсация долга', 'День загрузки', 'Снижение по плану'].includes(r[0]));
    expect(reasons).toHaveLength(1);
    expect(reasons[0][1]).toBe('+218'); // 2210 − 1992
  });

  it('день загрузки вытесняет долг — ветки взаимоисключающие', () => {
    const names = renderBreakdown({
      day: { date: '2026-08-30', isRefeedDay: true },
      caloricDebt: { dailyBoost: 218 },
    }).map((r) => r[0]);
    expect(names).toContain('День загрузки');
    expect(names).not.toContain('Компенсация долга');
  });

  it('цикл — отдельная строка и стоит до причины уровня', () => {
    const names = renderBreakdown({ cycleKcalMultiplier: 1.05 }).map((r) => r[0]);
    expect(names.indexOf('Цикл')).toBeGreaterThan(-1);
    expect(names.indexOf('Цикл')).toBeLessThan(names.indexOf('Компенсация долга'));
  });

  it('без поправки цепочка всё равно кончается «Целью дня»', () => {
    const rows = renderBreakdown({ displayOptimum: 1940, optimum: 1940, caloricDebt: null });
    const names = rows.map((r) => r[0]);
    expect(names).not.toContain('Компенсация долга');
    expect(rows[rows.length - 1]).toEqual(['Цель дня', '1940']);
  });

  it('две подписи под ключами стоят дословно', () => {
    renderBreakdown();
    expect(screen.getByText('от неё считается цель')).toBeTruthy();
    expect(screen.getByText('в затратах есть, в цели нет')).toBeTruthy();
  });

  it('прежняя редакция, кончавшаяся процентом, ушла', () => {
    const names = renderBreakdown().map((r) => r[0]);
    expect(names).not.toContain('BMR');
    expect(names).not.toContain('База (без TEF)');
    expect(names[names.length - 1]).not.toBe('Дефицит по договорённости');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Блок 2 · ярус «Сегодня» тремя строками вместо аккордеона «Кардио»
// tab-activity.v4.dc.html, строки 6, 15, 32
// ───────────────────────────────────────────────────────────────────────────

describe('Ярус «Сегодня» · сведение с канвасом', () => {
  function renderTier(ctxExtra) {
    const HEYS = loadFiles(['_kernel/heys_kernel_strength_v1.js', 'heys_day_activity_v1.js']);
    HEYS.TDEE = { calculate: () => ({ kcalMin: [0, 7, 8, 9] }) };
    const ctx = {
      day: { date: '2026-08-30', weightMorning: 80, trainings: [] },
      prof: {},
      trainingTypes: [
        { id: 'cardio', label: 'Кардио' },
        { id: 'strength', label: 'Силовая' },
      ],
      stepsValue: 8420, stepsGoal: 10000, stepsPercent: 67, stepsColor: '#000', stepsK: 312,
      bmr: 1520, householdK: 0, totalHouseholdMin: 0,
      train1k: 0, train2k: 0, train3k: 0,
      r0: (v) => Math.round(v || 0),
      visibleTrainings: 0,
      regularTrainingsBlock: null,
      ndteData: { active: false }, ndteBoostKcal: 0,
      tefData: {}, tefKcal: 0,
      dayTargetDef: -15, displayOptimum: 1940, optimum: 1940, cycleKcalMultiplier: 1,
      tdee: 2280, caloricDebt: null,
      monthTrainingsRows: [], morningActivationCalendarBlock: null,
      ...ctxExtra,
    };
    render(HEYS.dayActivity.render({ React, ctx, actions: {} }));
    return [...document.querySelectorAll('.activity-v4-today__row')].map((row) => ({
      name: row.querySelector('.activity-v4-today__name').textContent,
      sub: row.querySelector('.activity-v4-today__sub')?.textContent || '',
      value: row.querySelector('.activity-v4-today__value').textContent,
    }));
  }

  it('три строки в порядке контракта', () => {
    expect(renderTier().map((r) => r.name)).toEqual([
      'Тренировки', 'Бытовая активность', 'Зарядка',
    ]);
  });

  it('слово «Кардио» с экрана снято', () => {
    renderTier({ regularTrainingsBlock: React.createElement('div', null, 'блок') });
    expect(screen.queryByText('Кардио')).toBeNull();
  });

  it('ярус не исчезает в пустой день — строки стоят со словом «не отмечено»', () => {
    expect(renderTier().map((r) => r.value)).toEqual([
      'не отмечено', 'не отмечено', 'не отмечено',
    ]);
  });

  it('состав дня стоит под именем, объём — фактический', () => {
    const rows = renderTier({
      day: {
        date: '2026-08-30', weightMorning: 80,
        trainings: [{
          type: 'strength', z: [0, 45, 0, 0],
          strengthEntryMode: 'workout_builder',
          workoutLog: {
            exercises: [{
              id: 'e', name: 'Присед', unit: 'weight_reps',
              approaches: [
                { id: 'w', type: 'warmup', weightKg: '40', reps: 10, done: true },
                { id: 'a', weightKg: '95', reps: 20, done: true },
              ],
            }],
          },
        }],
      },
      train1k: 385,
    });
    // 95 × 20 = 1900 кг; разминочные 40 × 10 в объём не идут.
    // Ровно так стоит в кадре «день собран»: «силовая 45 мин · 1,9 т объёма».
    expect(rows[0].sub).toBe('силовая 45 мин · 1,9 т объёма');
    expect(rows[0].value).toBe('385 ккал');
  });

  it('назначенный план даёт «не начаты», а не ноль', () => {
    const rows = renderTier({
      day: {
        date: '2026-08-30',
        trainings: [{ type: 'strength', z: [0, 45, 0, 0], plan: { status: 'assigned' } }],
      },
    });
    expect(rows[0].value).toBe('не начаты');
    expect(rows[0].value).not.toBe('0 ккал');
  });

  it('быт и зарядка пишут числа и время, зарядка — тоном роста', () => {
    const rows = renderTier({
      totalHouseholdMin: 60, householdK: 126,
      day: {
        date: '2026-08-30',
        morningActivation: { status: 'done' },
        trainings: [{ source: 'morning_activation', type: 'strength', z: [8, 0, 0, 0], time: '07:20' }],
      },
    });
    expect(rows[1].value).toBe('60 мин · 126 ккал');
    expect(rows[2].value).toContain('07:20');
    const chargeValue = [...document.querySelectorAll('.activity-v4-today__value')][2];
    expect(chargeValue.className).toContain('activity-v4-today__value--grow');
  });

  it('«сделаю» — обещанная зарядка, без тона роста', () => {
    const rows = renderTier({
      day: { date: '2026-08-30', morningActivation: { status: 'planned' } },
    });
    expect(rows[2].value).toBe('сделаю');
  });

  it('аккордеон остался только внутри тренировок', () => {
    renderTier({ regularTrainingsBlock: React.createElement('div', null, 'карточки журнала') });
    expect(screen.queryByText('карточки журнала')).toBeNull();
    fireEvent.click(document.querySelector('.activity-v4-today__row'));
    expect(screen.getByText('карточки журнала')).toBeTruthy();
  });

  it('строка «Голод и энергия» из яруса ушла — в контракте три строки', () => {
    const names = renderTier().map((r) => r.name);
    expect(names).not.toContain('Голод и энергия');
    expect(names).toHaveLength(3);
  });

  it('свёрнутой строки «Отметить» больше нет — строки стоят каждая своя', () => {
    renderTier();
    expect(screen.queryByText('Отметить')).toBeNull();
  });
});
