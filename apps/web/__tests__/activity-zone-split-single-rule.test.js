/**
 * Минуты по зонам: один и тот же расклад, каким бы путём тренировку ни внесли.
 *
 * Решение владельца 15 сентября, строка контракта «минуты по зонам — делим»
 * (tab-activity.v4). Прежде конструктор клал всё время в зону 2, а мастер делил
 * пополам: одна и та же тренировка давала разные числа в зависимости от пути
 * ввода, и сравнивать недели было нельзя.
 *
 * Живьём такое не поймать: нужно внести одну тренировку двумя путями и сверить
 * расход. Поэтому симуляция на настоящем исходнике.
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const CALC_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_day_calculations.js'), 'utf8');

function loadCalculations() {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(CALC_SRC);
  return window.HEYS.dayCalculations;
}

afterEach(() => {
  delete window.HEYS;
});

describe('минуты по зонам', () => {
  it('силовая без названных зон делится 60 на 40', () => {
    const { splitZoneMinutesByType } = loadCalculations();
    expect(splitZoneMinutesByType(60, 'strength')).toEqual([0, 36, 24, 0]);
  });

  it('кардио без пульса делится 70 на 30', () => {
    const { splitZoneMinutesByType } = loadCalculations();
    expect(splitZoneMinutesByType(60, 'cardio')).toEqual([0, 42, 18, 0]);
  });

  it('минуты не теряются на округлении', () => {
    const { splitZoneMinutesByType } = loadCalculations();
    for (const minutes of [1, 7, 13, 45, 47, 90, 133]) {
      for (const type of ['strength', 'cardio']) {
        const zones = splitZoneMinutesByType(minutes, type);
        expect(zones.reduce((sum, m) => sum + m, 0), `${minutes} мин · ${type}`).toBe(minutes);
      }
    }
  });

  it('третья зона не бывает больше второй', () => {
    const { splitZoneMinutesByType } = loadCalculations();
    for (const minutes of [1, 5, 30, 60, 120]) {
      for (const type of ['strength', 'cardio']) {
        const [, second, third] = splitZoneMinutesByType(minutes, type);
        expect(third, `${minutes} мин · ${type}`).toBeLessThanOrEqual(second);
      }
    }
  });

  it('ноль минут — пустой расклад, а не выдуманная минута', () => {
    const { splitZoneMinutesByType } = loadCalculations();
    expect(splitZoneMinutesByType(0, 'strength')).toEqual([0, 0, 0, 0]);
    expect(splitZoneMinutesByType(null, 'cardio')).toEqual([0, 0, 0, 0]);
  });

  it('конструктор больше не кладёт всё время в зону 2', () => {
    const { normalizeTrainings } = loadCalculations();
    const [training] = normalizeTrainings([
      {
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        workoutLog: { totalDurationMinutes: 60, exercises: [] },
      },
    ]);
    expect(training.z).toEqual([0, 36, 24, 0]);
  });

  it('названные человеком зоны остаются как есть', () => {
    const { normalizeTrainings, hasNamedZones } = loadCalculations();
    const [training] = normalizeTrainings([
      {
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        z: [0, 10, 50, 0],
        workoutLog: { totalDurationMinutes: 60, exercises: [] },
      },
    ]);
    expect(training.z).toEqual([0, 10, 50, 0]);
    expect(hasNamedZones(training.z)).toBe(true);
  });
});
