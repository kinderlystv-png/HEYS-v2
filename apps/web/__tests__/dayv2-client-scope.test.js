/**
 * Фильтр dayv2-ключей по клиенту (инвариант 9): scoped + unscoped legacy,
 * без foreign и pollution `heys_<cid>_<foreign>_dayv2_*`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAY_UTILS_SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_utils.js'),
  'utf8',
);
const ADD_PRODUCT_SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_add_product_step_v1.js'),
  'utf8',
);
const GAMIFICATION_SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_gamification_v1.js'),
  'utf8',
);

const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function loadDayUtils() {
  window.HEYS = window.HEYS || {};
  eval(DAY_UTILS_SRC);
  return window.HEYS.dayUtils.isDayv2KeyForCurrentClient;
}

describe('dayv2 client scope · isDayv2KeyForCurrentClient', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.HEYS;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('принимает scoped ключ текущего клиента и unscoped legacy', () => {
    const isOwn = loadDayUtils();
    expect(isOwn(`heys_${CLIENT_A}_dayv2_2026-06-17`, CLIENT_A)).toBe(true);
    expect(isOwn('heys_dayv2_2026-06-17', CLIENT_A)).toBe(true);
  });

  it('отклоняет foreign-scoped и pollution с двумя uuid', () => {
    const isOwn = loadDayUtils();
    expect(isOwn(`heys_${CLIENT_B}_dayv2_2026-06-17`, CLIENT_A)).toBe(false);
    expect(isOwn(`heys_${CLIENT_A}_${CLIENT_B}_dayv2_2026-06-17`, CLIENT_A)).toBe(false);
  });

  it('без client id оставляет только unscoped legacy', () => {
    const isOwn = loadDayUtils();
    expect(isOwn('heys_dayv2_2026-06-17', null)).toBe(true);
    expect(isOwn(`heys_${CLIENT_A}_dayv2_2026-06-17`, null)).toBe(false);
  });
});

describe('dayv2 client scope · wiring', () => {
  it('каскад и геймификация зовут isDayv2KeyForCurrentClient / isDayKeyForCurrentClient', () => {
    expect(ADD_PRODUCT_SRC).toContain('HEYS.dayUtils.isDayv2KeyForCurrentClient');
    expect(GAMIFICATION_SRC).toContain('isDayKeyForCurrentClient');
    expect(GAMIFICATION_SRC).not.toMatch(
      /typeof isOwnDayKey === 'function' && !isOwnDayKey/,
    );
    expect(ADD_PRODUCT_SRC).toContain('debug.cascadeMealItemsOnProductUpdate');
    expect(ADD_PRODUCT_SRC).toContain('debug.collectCascadeDayKeys');
  });
});

/** Зеркало inline-fallback каскада/геймификации при отсутствии dayUtils. */
function dayKeyFilterWithoutDayUtils(key, clientId) {
  if (!key || typeof key !== 'string' || !key.includes('_dayv2_')) return false;
  if (!clientId) return false;
  return key.startsWith(`heys_${clientId}_dayv2_`) || key.startsWith('heys_dayv2_');
}

describe('dayv2 client scope · fail-safe без dayUtils', () => {
  it('inline-fallback отклоняет foreign-scoped, принимает scoped и legacy', () => {
    expect(dayKeyFilterWithoutDayUtils(`heys_${CLIENT_B}_dayv2_2026-06-17`, CLIENT_A)).toBe(false);
    expect(dayKeyFilterWithoutDayUtils(`heys_${CLIENT_A}_dayv2_2026-06-17`, CLIENT_A)).toBe(true);
    expect(dayKeyFilterWithoutDayUtils('heys_dayv2_2026-06-17', CLIENT_A)).toBe(true);
    expect(dayKeyFilterWithoutDayUtils(`heys_${CLIENT_A}_${CLIENT_B}_dayv2_2026-06-17`, CLIENT_A)).toBe(false);
  });

  it('без client id fallback fail-closed — не читает ни один scoped ключ', () => {
    expect(dayKeyFilterWithoutDayUtils('heys_dayv2_2026-06-17', null)).toBe(false);
    expect(dayKeyFilterWithoutDayUtils(`heys_${CLIENT_A}_dayv2_2026-06-17`, null)).toBe(false);
  });
});
