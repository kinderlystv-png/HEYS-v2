// Регрессия: серия утренней зарядки восточнее UTC.
// addDaysToDateKey строил локальную полночь, а отдавал toISOString() — в UTC+3
// «вчера» уезжало на два дня назад, streak.lastDoneDate никогда не совпадал,
// серия сбрасывалась в 1 каждый день и вехи 3/7/14 были недостижимы.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'heys_gamification_v1.js'), 'utf8');

let tzBefore;

describe('серия утренней зарядки в UTC+3', () => {
  beforeAll(() => {
    // V8 перечитывает часовой пояс при присваивании process.env.TZ.
    // Прогон идёт одним форком (vitest.config.ts, singleFork), поэтому пояс
    // обязательно возвращается назад в afterAll — иначе он утечёт в остальные файлы.
    tzBefore = process.env.TZ;
    process.env.TZ = 'Europe/Moscow';
    vi.useFakeTimers();
    globalThis.window.HEYS = globalThis.HEYS = {
      utils: { getCurrentClientId: () => '11111111-1111-4111-8111-111111111111' },
      auth: {
        getSessionToken: () => null,
        isCuratorSession: () => false
      }
    };
    // eslint-disable-next-line no-eval
    eval(SOURCE);
    globalThis.HEYS.game.cancelAllPendingFlushes();
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.HEYS.game.reset();
    globalThis.HEYS.game.cancelAllPendingFlushes();
    vi.clearAllTimers();
  });

  afterAll(() => {
    globalThis.HEYS.game.cancelAllPendingFlushes();
    vi.clearAllTimers();
    vi.useRealTimers();
    if (tzBefore === undefined) delete process.env.TZ;
    else process.env.TZ = tzBefore;
  });

  it('среда прогона действительно восточнее UTC (иначе тест ничего не проверяет)', () => {
    expect(new Date(2026, 7, 25).getTimezoneOffset()).toBe(-180);
  });

  it('два календарных дня подряд дают серию 2, а не сброс в 1', () => {
    expect(globalThis.HEYS.game.recordMorningActivationDone('2026-08-24')).toMatchObject({ current: 1 });
    expect(globalThis.HEYS.game.recordMorningActivationDone('2026-08-25')).toMatchObject({ current: 2 });
  });

  it('три дня подряд доводят серию до вехи 3', () => {
    globalThis.HEYS.game.recordMorningActivationDone('2026-08-23');
    globalThis.HEYS.game.recordMorningActivationDone('2026-08-24');
    expect(globalThis.HEYS.game.recordMorningActivationDone('2026-08-25')).toMatchObject({ current: 3 });
  });

  it('серия переживает переход через границу месяца', () => {
    globalThis.HEYS.game.recordMorningActivationDone('2026-07-31');
    expect(globalThis.HEYS.game.recordMorningActivationDone('2026-08-01')).toMatchObject({ current: 2 });
  });

  it('пропущенный день по-прежнему сбрасывает серию в 1', () => {
    globalThis.HEYS.game.recordMorningActivationDone('2026-08-23');
    expect(globalThis.HEYS.game.recordMorningActivationDone('2026-08-25')).toMatchObject({ current: 1 });
  });

  it('повторный вызов в тот же день не наращивает серию', () => {
    globalThis.HEYS.game.recordMorningActivationDone('2026-08-24');
    globalThis.HEYS.game.recordMorningActivationDone('2026-08-25');
    expect(globalThis.HEYS.game.recordMorningActivationDone('2026-08-25')).toMatchObject({
      current: 2,
      alreadyToday: true
    });
  });
});
