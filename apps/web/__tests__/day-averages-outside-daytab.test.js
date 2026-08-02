/**
 * Регресс 2026-08-02: moodAvg/wellbeingAvg/stressAvg/dayScore пересчитываются
 * React-эффектом heys_day_rating_averages_v1.js, который работает только пока
 * смонтирована вкладка дня. Морнинг-чек-ин, синхронизация утренней активации
 * и запись тренировки пишут `moodMorning` / `trainings[].mood` напрямую в
 * storage — до этой правки средние протухали до следующего открытия вкладки.
 */
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

beforeAll(() => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  const src = read('apps/web/heys_day_calculations.js');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(global);
});

describe('applyDayAverages — пересчёт средних вне вкладки дня', () => {
  it('пересчитывает средние и dayScore по утренней отметке', () => {
    const day = { moodMorning: 7, wellbeingMorning: 8, stressMorning: 3, meals: [], trainings: [] };
    global.HEYS.dayCalculations.applyDayAverages(day);
    expect(day.moodAvg).toBe(7);
    expect(day.wellbeingAvg).toBe(8);
    expect(day.stressAvg).toBe(3);
    expect(day.dayScore).toBe(7); // (7 + 8 + (10-3)) / 3 = 7.33
  });

  it('не трогает dayScore при ручном override', () => {
    const day = { moodMorning: 3, wellbeingMorning: 3, stressMorning: 8, dayScore: 9, dayScoreManual: true, meals: [], trainings: [] };
    global.HEYS.dayCalculations.applyDayAverages(day);
    expect(day.dayScore).toBe(9);
  });

  it('учитывает оценки реальной тренировки (со временем или минутами)', () => {
    const day = {
      meals: [],
      trainings: [{ time: '08:00', z: [10, 0, 0, 0], mood: 8, wellbeing: 7, stress: 4 }],
    };
    global.HEYS.dayCalculations.applyDayAverages(day);
    expect(day.moodAvg).toBe(8);
  });

  it('не считает заготовку тренировки без времени и минут', () => {
    const day = {
      meals: [],
      trainings: [{ z: [0, 0, 0, 0], mood: 8 }],
    };
    global.HEYS.dayCalculations.applyDayAverages(day);
    expect(day.moodAvg).toBe('');
  });

  it('мутирует и возвращает тот же объект', () => {
    const day = { moodMorning: 5, meals: [], trainings: [] };
    const result = global.HEYS.dayCalculations.applyDayAverages(day);
    expect(result).toBe(day);
  });
});

describe('вызовы applyDayAverages из писателей вне вкладки дня', () => {
  it('морнинг-чек-ин (heys_steps_v1.js) пересчитывает средние перед сохранением', () => {
    const src = read('apps/web/heys_steps_v1.js');
    const saveBlock = src.slice(src.indexOf("dayData.moodMorning = data.mood"));
    const beforeSave = saveBlock.slice(0, saveBlock.indexOf('saveDayData(dateKey, dayData);'));
    expect(beforeSave).toContain('HEYS.dayCalculations?.applyDayAverages?.(dayData)');
  });

  it('синхронизация утренней активации (heys_steps_v1.js) пересчитывает средние перед сохранением', () => {
    const src = read('apps/web/heys_steps_v1.js');
    const fnStart = src.indexOf('function syncMorningActivationActivity');
    const fnBody = src.slice(fnStart, src.indexOf('function ', fnStart + 10));
    const beforeSave = fnBody.slice(0, fnBody.indexOf('saveDayData(dateKey, dayData);'));
    expect(beforeSave).toContain('HEYS.dayCalculations?.applyDayAverages?.(dayData)');
  });

  it('запись тренировки (heys_training_step_v1.js) пересчитывает средние перед сохранением', () => {
    const src = read('apps/web/heys_training_step_v1.js');
    const idx = src.indexOf("day.trainings = trainings;");
    const block = src.slice(idx, src.indexOf('saveDayFields(dateKey, day,', idx) + 200);
    expect(block).toContain('HEYS.dayCalculations?.applyDayAverages?.(day)');
    expect(block).toContain("'moodAvg'");
  });
});
