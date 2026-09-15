/**
 * Пометка подставленного распределения по зонам.
 *
 * Строка контракта «минуты по зонам — как показаны» (tab-activity.v4): «в ряду
 * зон стоит подпись „зоны оценены по типу тренировки“ — та же пометка и по тому
 * же правилу, что у оценённых шагов. Названные человеком зоны подписи не
 * получают».
 *
 * Отличить подставленное от названного по самим числам нельзя, поэтому пометка
 * ставится в момент подстановки. Старые записи, где зоны подставили до этой
 * правки, пометки не получат: додумывать за них — врать, а показать «оценка»
 * там, где её мог задать человек, хуже, чем не показать.
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const CALC_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_day_calculations.js'), 'utf8');
const TRAININGS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_day_trainings_v1.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

function loadCalculations() {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(CALC_SRC);
  return window.HEYS.dayCalculations;
}

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = CSS.match(new RegExp(`^[ \\t]*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  if (!match) throw new Error(`нет правила «${selector}»`);
  return match[1];
}

afterEach(() => {
  delete window.HEYS;
});

describe('пометка оценённых зон', () => {
  it('подставленное распределение помечается в момент подстановки', () => {
    const { normalizeTrainings } = loadCalculations();
    const [training] = normalizeTrainings([
      {
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        workoutLog: { totalDurationMinutes: 60, exercises: [] },
      },
    ]);
    expect(training.zonesEstimated).toBe(true);
    expect(training.z).toEqual([0, 36, 24, 0]);
  });

  it('названные человеком зоны пометки не получают', () => {
    const { normalizeTrainings } = loadCalculations();
    const [training] = normalizeTrainings([
      {
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        z: [0, 20, 40, 0],
        workoutLog: { totalDurationMinutes: 60, exercises: [] },
      },
    ]);
    expect(training.zonesEstimated).toBeUndefined();
  });

  it('зоны из журнала конструктора — тоже названные, а не оценка', () => {
    const { normalizeTrainings } = loadCalculations();
    const [training] = normalizeTrainings([
      {
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        workoutLog: { totalDurationMinutes: 60, zoneMinutes: [0, 25, 35, 0], exercises: [] },
      },
    ]);
    expect(training.zonesEstimated).toBeUndefined();
    expect(training.z).toEqual([0, 25, 35, 0]);
  });

  it('подпись стоит в ряду зон и только при пометке', () => {
    expect(TRAININGS_SRC).toContain('T.zonesEstimated && React.createElement');
    expect(TRAININGS_SRC).toContain('зоны оценены по типу тренировки');
  });

  it('кегль и тон подписи — как в контракте', () => {
    const body = rule('.compact-train-zones-estimated');
    expect(body).toMatch(/font:\s*500 10\.5px\/1\.3/);
    expect(body).toContain('var(--v4-ink-3');
  });

  it('подпись занимает свою строку, а чипы зон остаются в одну', () => {
    // Перенос у ряда включён ради подписи; самих чипов всегда четыре и они
    // влезают, поэтому переносить их нечему.
    expect(rule('.compact-train-zones-estimated')).toContain('flex: 1 0 100%');
  });
});
