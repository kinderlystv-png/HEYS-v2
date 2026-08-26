/**
 * XP за воду — контракт water-add «XP за воду»:
 * один раз за день, когда норма набрана; не за каждый глоток и не за убавление.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');

const DEBOUNCE_AND_FLUSH_MS = 300;

let game;

function dispatchWater(detail) {
  window.dispatchEvent(new CustomEvent('heysWaterAdded', { detail }));
  vi.advanceTimersByTime(DEBOUNCE_AND_FLUSH_MS);
}

describe('XP за воду — норма и частота', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 26, 12, 0, 0, 0));
    globalThis.localStorage.clear();
    globalThis.window.HEYS = {
      utils: { getCurrentClientId: () => '11111111-1111-4111-8111-111111111111' },
      auth: { getSessionToken: () => null, isCuratorSession: () => false },
      Day: { getWaterPercent: () => 40 },
    };
    // eslint-disable-next-line no-eval
    eval(read('heys_day_utils.js'));
    // eslint-disable-next-line no-eval
    eval(read('heys_gamification_v1.js'));
    game = globalThis.HEYS.game;
    game.cancelAllPendingFlushes();
    vi.advanceTimersByTime(2500);
  });

  afterAll(() => {
    game.cancelAllPendingFlushes();
    vi.useRealTimers();
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
    game.reset();
    game.cancelAllPendingFlushes();
  });

  afterEach(() => {
    game.cancelAllPendingFlushes();
  });

  it('до нормы — опыта нет', () => {
    const before = game.getTotalXP();
    dispatchWater({ ml: 200, total: 800, targetMl: 2000 });
    expect(game.getTotalXP()).toBe(before);
  });

  it('норма набрана — опыт один раз', () => {
    const before = game.getTotalXP();
    dispatchWater({ ml: 200, total: 2000, targetMl: 2000 });
    const afterFirst = game.getTotalXP();
    expect(afterFirst).toBeGreaterThan(before);

    vi.advanceTimersByTime(250);
    dispatchWater({ ml: 200, total: 2200, targetMl: 2000 });
    expect(game.getTotalXP()).toBe(afterFirst);
  });

  it('убавление — опыта нет, даже если норма была', () => {
    dispatchWater({ ml: 200, total: 2000, targetMl: 2000 });
    const afterNorm = game.getTotalXP();

    vi.advanceTimersByTime(250);
    dispatchWater({ ml: -200, total: 1800, targetMl: 2000 });
    expect(game.getTotalXP()).toBe(afterNorm);
  });
});
