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

let renderCalendarBlock;

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

  renderCalendarBlock = global.HEYS.dayCalendarBlock.renderCalendarBlock;
});

describe('очистка дня из календаря (регресс 2026-08-02)', () => {
  it('не удаляет ключ localStorage вручную — обычный autosave сам перепишет его', () => {
    let removed = false;
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => { removed = true; },
    };
    let capturedProps = null;
    const params = {
      React: { createElement: (type, props) => { if (props && props.onRemove) capturedProps = props; return null; } },
      CalendarComponent: () => null,
      date: '2026-08-02',
      activeDays: new Set(),
      products: [],
      setDate: () => {},
      lsGet: () => null,
      lsSet: () => {},
      getProfile: () => ({}),
      ensureDay: global.HEYS.models.ensureDay,
      setDay: () => {},
    };
    renderCalendarBlock(params);
    capturedProps.onRemove();
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
    let capturedProps = null;
    const params = {
      React: { createElement: (type, props) => { if (props && props.onRemove) capturedProps = props; return null; } },
      CalendarComponent: () => null,
      date,
      activeDays: new Set(),
      products: [],
      setDate: () => {},
      lsGet: () => null,
      lsSet: () => {},
      getProfile: () => ({}),
      ensureDay: global.HEYS.models.ensureDay,
      setDay: (next) => { savedDay = next; },
    };

    renderCalendarBlock(params);
    expect(capturedProps).toBeTruthy();
    capturedProps.onRemove();

    expect(savedDay).toBeTruthy();
    expect(savedDay.steps).toBe(0);
    expect(savedDay.dayComment).toBe('');
    // Каждый штамп строго новее прежнего — иначе guardExplicitMutationGroups
    // на клиенте и merge на сервере откатят очистку обратно к prevDay.
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
    let capturedProps = null;
    const params = {
      React: { createElement: (type, props) => { if (props && props.onRemove) capturedProps = props; return null; } },
      CalendarComponent: () => null,
      date,
      activeDays: new Set(),
      products: [],
      setDate: () => {},
      lsGet: () => null,
      lsSet: () => {},
      getProfile: () => ({}),
      ensureDay: global.HEYS.models.ensureDay,
      setDay: (next) => { savedDay = next; },
    };

    renderCalendarBlock(params);
    capturedProps.onRemove();

    expect(savedDay.stepsUpdatedAt).toBeGreaterThan(0);
    expect(Number.isNaN(savedDay.stepsUpdatedAt)).toBe(false);
  });
});
