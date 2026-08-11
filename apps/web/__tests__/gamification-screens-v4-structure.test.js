import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const screensSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_gamification_screens_v1.js'),
  'utf8',
);
const barSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_gamification_bar_v1.js'),
  'utf8',
);
const bundleConfig = fs.readFileSync(
  path.resolve(__dirname, '../../../scripts/legacy-bundle-config.mjs'),
  'utf8',
);

describe('Gamification screens v4 · structure', () => {
  it('module exports GamificationSheet with three tabs', () => {
    expect(screensSource).toContain('HEYS.GamificationScreens');
    expect(screensSource).toContain('GamificationSheet');
    expect(screensSource).toContain('TAB_PROGRESS');
    expect(screensSource).toContain('TAB_ACHIEVEMENTS');
    expect(screensSource).toContain('TAB_LEVELS');
    expect(screensSource).toContain('Прогресс');
    expect(screensSource).toContain('Достижения');
    expect(screensSource).toContain('Уровни');
  });

  it('covers first-day branch and streak/forgiveness data', () => {
    expect(screensSource).toContain('isFirstDayBranch');
    expect(screensSource).toContain('safeGetStreakDetails');
    expect(screensSource).toContain('yesterdayForgiven');
    expect(screensSource).toContain('onboarding');
    expect(screensSource).toContain('STREAK_CORRIDOR_HINT');
    expect(screensSource).toContain('FORGIVEN_HINT');
  });

  it('levels tab uses XP_ACTIONS, isMax and level titles', () => {
    expect(screensSource).toContain('XP_ACTIONS');
    expect(screensSource).toContain('isMax');
    expect(screensSource).toContain('LEVEL_TITLES');
    expect(screensSource).toContain('максимальный уровень');
    expect(screensSource).toContain('работают 17 из 17');
    expect(screensSource).not.toContain('Platinum');
    expect(screensSource).not.toContain('RANK_BADGES');
  });

  it('bar wires GamificationScreens into expanded panel', () => {
    expect(barSource).toContain('GamificationScreens');
    expect(barSource).toContain('renderExpandedSheet');
    expect(barSource).not.toContain('game-weekly-card');
  });

  it('screens module is in postboot-1-game-lazy after engine', () => {
    expect(bundleConfig).toContain('heys_gamification_screens_v1.js');
    const lazyBlock = bundleConfig.split("'postboot-1-game-lazy': [")[1].split("'postboot-2-insights-eager'")[0];
    const engineIdx = lazyBlock.indexOf('heys_gamification_v1.js');
    const screensIdx = lazyBlock.indexOf('heys_gamification_screens_v1.js');
    expect(engineIdx).toBeGreaterThan(-1);
    expect(screensIdx).toBeGreaterThan(engineIdx);
  });
});
