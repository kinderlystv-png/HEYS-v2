/**
 * Regression test для TASK-003.
 *
 * Bug: под троттлингом таба apply шагов утреннего чекина дропался
 * (SKIP_RAF_PENDING, heys_day_effects.js), а последующий снапшот дня
 * (addWater → persistDaySnapshotImmediately) затирал в LS поля сна/самочувствия,
 * которых не было в React-снапшоте. Итог — карточки «Сон»/«Оценка дня» показывали
 * прочерки, хотя значения были в свежем scoped LS.
 *
 * Fix: HEYS.dayUtils.mergeSubjectiveFieldsPreferFresh — fill-if-missing мёрж
 * subjective-полей чекина из свежего LS поверх снапшота. Используется в
 * getLatestDaySnapshot / persistDaySnapshotImmediately (heys_day_day_handlers.js),
 * чтобы снапшот не цементировал отсутствие subjective-данных.
 *
 * Инвариант №7: explicit-мёрж по явному списку полей, не shape-inference.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const evalScript = (relativePath) => {
  const filePath = path.resolve(__dirname, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  // eslint-disable-next-line no-eval
  eval(source);
};

beforeEach(() => {
  if (!globalThis.window) globalThis.window = globalThis;
  window.HEYS = {};
  evalScript('../../apps/web/heys_day_utils.js');
});

describe('TASK-003: anti-clobber subjective-полей чекина', () => {
  const merge = (snapshot, lsDay) =>
    window.HEYS.dayUtils.mergeSubjectiveFieldsPreferFresh(snapshot, lsDay);

  it('экспортирует helper и список subjective-полей', () => {
    expect(typeof merge).toBe('function');
    expect(window.HEYS.dayUtils.SUBJECTIVE_DAY_FIELDS).toEqual(
      expect.arrayContaining([
        'sleepStart', 'sleepEnd', 'sleepHours', 'daySleepMinutes',
        'sleepQuality', 'sleepNote',
        'moodMorning', 'wellbeingMorning', 'stressMorning'
      ])
    );
  });

  it('добирает недостающие subjective-поля из свежего LS (ядро бага)', () => {
    // Снапшот addWater: вода есть, сна/самочувствия нет (apply дропнут под троттлингом)
    const snapshot = { date: '2026-06-10', waterMl: 750, weightMorning: 90.9 };
    // Свежий scoped LS: шаги чекина записали значения
    const lsDay = {
      date: '2026-06-10',
      sleepStart: '23:00', sleepEnd: '07:00', sleepHours: 8, daySleepMinutes: 0,
      sleepQuality: 7, sleepNote: '[08:00] норм',
      moodMorning: 6, wellbeingMorning: 7, stressMorning: 3
    };

    const merged = merge(snapshot, lsDay);

    // Subjective-поля восстановлены
    expect(merged.sleepStart).toBe('23:00');
    expect(merged.sleepEnd).toBe('07:00');
    expect(merged.sleepHours).toBe(8);
    expect(merged.sleepQuality).toBe(7);
    expect(merged.sleepNote).toBe('[08:00] норм');
    expect(merged.moodMorning).toBe(6);
    expect(merged.wellbeingMorning).toBe(7);
    expect(merged.stressMorning).toBe(3);
    // Поля снапшота не тронуты
    expect(merged.waterMl).toBe(750);
    expect(merged.weightMorning).toBe(90.9);
  });

  it('НЕ перетирает subjective-значение, уже присутствующее в снапшоте', () => {
    // Пользователь переоценил сон: React/снапшот новее, LS старее
    const snapshot = { date: '2026-06-10', sleepQuality: 9, moodMorning: 8 };
    const lsDay = { date: '2026-06-10', sleepQuality: 5, moodMorning: 4, stressMorning: 2 };

    const merged = merge(snapshot, lsDay);

    expect(merged.sleepQuality).toBe(9); // снапшот выигрывает
    expect(merged.moodMorning).toBe(8);  // снапшот выигрывает
    expect(merged.stressMorning).toBe(2); // отсутствовало в снапшоте — добрано из LS
  });

  it('трактует 0 как присутствующее значение (mood/stress/daySleepMinutes)', () => {
    const snapshot = { date: '2026-06-10', moodMorning: 0, daySleepMinutes: 0 };
    const lsDay = { date: '2026-06-10', moodMorning: 9, daySleepMinutes: 120, stressMorning: 0 };

    const merged = merge(snapshot, lsDay);

    expect(merged.moodMorning).toBe(0);      // 0 в снапшоте не перетирается
    expect(merged.daySleepMinutes).toBe(0);  // 0 в снапшоте не перетирается
    expect(merged.stressMorning).toBe(0);    // 0 из LS добирается (в снапшоте не было)
  });

  it('не добирает из LS пустые/undefined/null значения', () => {
    const snapshot = { date: '2026-06-10', waterMl: 500 };
    const lsDay = { date: '2026-06-10', sleepNote: '', sleepQuality: null, moodMorning: undefined };

    const merged = merge(snapshot, lsDay);

    expect('sleepNote' in merged).toBe(false);
    expect('sleepQuality' in merged).toBe(false);
    expect('moodMorning' in merged).toBe(false);
  });

  it('возвращает снапшот без изменений, если LS пуст/невалиден', () => {
    const snapshot = { date: '2026-06-10', waterMl: 500, moodMorning: 7 };
    expect(merge(snapshot, null)).toBe(snapshot);
    expect(merge(snapshot, undefined)).toBe(snapshot);
    expect(merge(snapshot, 'not-an-object')).toBe(snapshot);
  });

  it('не трогает не-subjective поля и не мутирует исходный снапшот', () => {
    const snapshot = { date: '2026-06-10', waterMl: 500, steps: 1000 };
    const lsDay = { date: '2026-06-10', steps: 9999, waterMl: 0, moodMorning: 6 };

    const merged = merge(snapshot, lsDay);

    // Не-subjective поля LS игнорируются
    expect(merged.steps).toBe(1000);
    expect(merged.waterMl).toBe(500);
    expect(merged.moodMorning).toBe(6);
    // Исходный снапшот не мутирован
    expect('moodMorning' in snapshot).toBe(false);
  });
});
