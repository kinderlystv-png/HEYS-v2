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

let clearDayForDate;

beforeAll(() => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  global.HEYS.currentClientId = '';

  const modelsSrc = read('apps/web/heys_models_v1.js');
  // eslint-disable-next-line no-new-func
  new Function('window', modelsSrc)(global);

  const calBlockSrc = read('apps/web/heys_day_calendar_block_v1.js');
  // eslint-disable-next-line no-new-func
  new Function('window', calBlockSrc)(global);

  clearDayForDate = global.HEYS.dayCalendarBlock.clearDayForDate;
});

describe('очистка дня (регресс 2026-08-02, экспорт clearDayForDate)', () => {
  it('не удаляет ключ localStorage вручную — обычный autosave сам перепишет его', () => {
    let removed = false;
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => { removed = true; },
    };
    clearDayForDate({
      date: '2026-08-02',
      getProfile: () => ({}),
      ensureDay: global.HEYS.models.ensureDay,
      setDay: () => {},
    });
    expect(removed).toBe(false);
  });

  it('проставляет свежие штампы mutation-групп поверх ensureDay', () => {
    const date = '2026-08-02';
    const key = 'heys_dayv2_' + date;
    const prevDay = {
      date,
      steps: 8000,
      stepsUpdatedAt: 1000,
      sleepNote: 'спал плохо',
      sleepNoteUpdatedAt: 1000,
      dayComment: 'тяжёлый день',
      dayCommentUpdatedAt: 1000,
      dayScore: 7,
      dayScoreUpdatedAt: 1000,
    };
    global.localStorage = {
      getItem: (k) => (k === key ? JSON.stringify(prevDay) : null),
      setItem: () => {},
      removeItem: () => {},
    };

    let savedDay = null;
    clearDayForDate({
      date,
      getProfile: () => ({}),
      ensureDay: global.HEYS.models.ensureDay,
      setDay: (next) => { savedDay = next; },
    });

    expect(savedDay).toBeTruthy();
    expect(savedDay.steps).toBe(0);
    expect(savedDay.dayComment).toBe('');
    expect(savedDay.stepsUpdatedAt).toBeGreaterThan(prevDay.stepsUpdatedAt);
    expect(savedDay.sleepNoteUpdatedAt).toBeGreaterThan(prevDay.sleepNoteUpdatedAt);
    expect(savedDay.dayCommentUpdatedAt).toBeGreaterThan(prevDay.dayCommentUpdatedAt);
    expect(savedDay.dayScoreUpdatedAt).toBeGreaterThan(prevDay.dayScoreUpdatedAt);
  });

  it('без предыдущего дня в LS всё равно проставляет штампы (не NaN, не 0)', () => {
    const date = '2026-08-02';
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };

    let savedDay = null;
    clearDayForDate({
      date,
      getProfile: () => ({}),
      ensureDay: global.HEYS.models.ensureDay,
      setDay: (next) => { savedDay = next; },
    });

    expect(savedDay.stepsUpdatedAt).toBeGreaterThan(0);
    expect(Number.isNaN(savedDay.stepsUpdatedAt)).toBe(false);
  });
});
