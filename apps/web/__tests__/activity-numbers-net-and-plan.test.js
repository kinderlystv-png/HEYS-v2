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
      day: { date: '2026-08-30' },
      prof: {},
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

  it('заголовок «Кардио» суммирует все три слота', () => {
    renderActivity();
    expect(screen.getByText('190 ккал')).toBeTruthy();
    expect(screen.queryByText('150 ккал')).toBeNull();
  });

  it('строка «+ Тренировки» в разборе показывает ту же сумму', () => {
    renderActivity();
    fireEvent.click(screen.getByText('от затрат без термического эффекта · −15 %'));
    const row = screen.getByText('+ Тренировки').parentElement;
    expect(row.textContent).toContain('190 ккал');
  });

  it('без третьей тренировки поведение прежнее', () => {
    renderActivity({ train3k: 0 });
    expect(screen.getByText('150 ккал')).toBeTruthy();
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
