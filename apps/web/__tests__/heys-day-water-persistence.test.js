import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = global.HEYS;
const originalReact = global.React;
const originalRequestAnimationFrame = global.requestAnimationFrame;

function loadModule() {
  const srcPath = path.resolve(__dirname, '../heys_day_day_handlers.js');
  eval(fs.readFileSync(srcPath, 'utf8'));
}

function loadWaterCardModule() {
  const srcPath = path.resolve(__dirname, '../heys_day_water_v1.js');
  eval(fs.readFileSync(srcPath, 'utf8'));
}

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;

  const children = Array.isArray(node.children)
    ? node.children
    : node.props?.children
      ? [node.props.children]
      : [];

  for (const child of children.flat(Infinity)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }

  return null;
}

describe('HEYS.dayDayHandlers water persistence', () => {
  let dispatchEventSpy;
  let getElementByIdSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, 'now').mockReturnValue(1734000003000);

    global.requestAnimationFrame = vi.fn((cb) => {
      cb();
      return 1;
    });

    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
    getElementByIdSpy = vi.spyOn(document, 'getElementById').mockReturnValue(null);

    global.HEYS = {
      dayUtils: {
        haptic: vi.fn(),
        lsGet: vi.fn(),
        lsSet: vi.fn()
      },
      waterFeedback: {
        ensureBound: vi.fn()
      },
      Paywall: {
        canWriteSync: vi.fn(() => true),
        showBlockedToast: vi.fn()
      },
      Day: {
        setBlockCloudUpdates: vi.fn(),
        setLastLoadedUpdatedAt: vi.fn(),
        requestFlush: vi.fn(),
        getDay: vi.fn()
      }
    };

    global.React = {
      startTransition: (cb) => cb()
    };

    loadModule();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    global.HEYS = originalHEYS;
    global.React = originalReact;
    global.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it('persists added water immediately before deferred state flush', () => {
    let currentDay = {
      date: '2025-12-12',
      meals: [{ id: 'm1' }],
      waterMl: 1000,
      updatedAt: 1734000000000
    };

    global.HEYS.Day.getDay.mockImplementation(() => currentDay);
    global.HEYS.dayUtils.lsGet.mockReturnValue({
      date: '2025-12-12',
      meals: [{ id: 'm1' }],
      waterMl: 1000,
      updatedAt: 1734000000000
    });

    const setDay = vi.fn((updater) => {
      currentDay = updater(currentDay);
      return currentDay;
    });

    const handlers = global.HEYS.dayDayHandlers.createDayHandlers({
      setDay,
      day: currentDay,
      date: '2025-12-12',
      prof: {},
      setShowWaterDrop: vi.fn(),
      setWaterAddedAnim: vi.fn(),
      showConfetti: false,
      setShowConfetti: vi.fn(),
      waterGoal: 2000,
      setEditGramsTarget: vi.fn(),
      setEditGramsValue: vi.fn(),
      setGrams: vi.fn()
    });

    handlers.addWater(100, {
      skipScroll: true,
      playSound: false,
      showScreenFill: false,
      pulseWaterWidget: false,
      showSourceBadge: false,
      showSourceDrop: false
    });

    expect(global.HEYS.dayUtils.lsSet).toHaveBeenCalledWith(
      'heys_dayv2_2025-12-12',
      expect.objectContaining({
        date: '2025-12-12',
        meals: [{ id: 'm1' }],
        waterMl: 1100,
        lastWaterTime: 1734000003000,
        updatedAt: 1734000003000
      })
    );
    expect(global.HEYS.Day.setLastLoadedUpdatedAt).toHaveBeenCalledWith(1734000003000);
    expect(global.HEYS.Day.setBlockCloudUpdates).toHaveBeenCalledWith(1734000006000);
    expect(setDay).toHaveBeenCalledTimes(1);
    expect(currentDay.waterMl).toBe(1100);
    expect(currentDay.updatedAt).toBe(1734000003000);
    expect(dispatchEventSpy).toHaveBeenCalled();
    expect(getElementByIdSpy).toHaveBeenCalledWith('water-card');

    vi.runAllTimers();

    expect(global.HEYS.Day.requestFlush).toHaveBeenCalledTimes(1);
  });

  it('persists removed water immediately too', () => {
    let currentDay = {
      date: '2025-12-12',
      waterMl: 900,
      updatedAt: 1734000000000
    };

    global.HEYS.Day.getDay.mockImplementation(() => currentDay);
    global.HEYS.dayUtils.lsGet.mockReturnValue(currentDay);

    const setDay = vi.fn((updater) => {
      currentDay = updater(currentDay);
      return currentDay;
    });

    const handlers = global.HEYS.dayDayHandlers.createDayHandlers({
      setDay,
      day: currentDay,
      date: '2025-12-12',
      prof: {},
      setShowWaterDrop: vi.fn(),
      setWaterAddedAnim: vi.fn(),
      showConfetti: false,
      setShowConfetti: vi.fn(),
      waterGoal: 2000,
      setEditGramsTarget: vi.fn(),
      setEditGramsValue: vi.fn(),
      setGrams: vi.fn()
    });

    handlers.removeWater(200);

    expect(global.HEYS.dayUtils.lsSet).toHaveBeenCalledWith(
      'heys_dayv2_2025-12-12',
      expect.objectContaining({
        date: '2025-12-12',
        waterMl: 700,
        updatedAt: 1734000003000
      })
    );

    expect(currentDay.waterMl).toBe(700);

    vi.runAllTimers();

    expect(global.HEYS.Day.requestFlush).toHaveBeenCalledTimes(1);
  });

  it('water preset click calls addWater synchronously', () => {
    global.React = {
      createElement: (type, props, ...children) => ({
        type,
        props: props || {},
        children
      })
    };

    global.HEYS = {
      utils: {
        lsGet: vi.fn(() => null)
      },
      dayUtils: {
        lsGet: vi.fn(() => null)
      }
    };

    loadWaterCardModule();

    const addWater = vi.fn();
    const sourceEl = { id: 'water-preset' };
    const tree = global.HEYS.dayWater.render({
      React: global.React,
      ctx: {
        day: { date: '2025-12-12', waterMl: 1000, steps: 0 },
        prof: {},
        waterGoal: 2000,
        waterGoalBreakdown: {
          base: 2000,
          weight: 70,
          coef: 30,
          baseRaw: 2100,
          stepsBonus: 0,
          trainBonus: 0,
          seasonBonus: 0,
          cycleBonus: 0
        },
        waterPresets: [{ ml: 100, icon: '💧' }],
        waterMotivation: { emoji: '🌊', text: 'Good start!' },
        waterLastDrink: null,
        waterAddedAnim: null,
        showWaterDrop: false,
        showWaterTooltip: false
      },
      actions: {
        setDay: vi.fn(),
        haptic: vi.fn(),
        setWaterAddedAnim: vi.fn(),
        setShowWaterDrop: vi.fn(),
        setShowWaterTooltip: vi.fn(),
        handleWaterRingDown: vi.fn(),
        handleWaterRingUp: vi.fn(),
        handleWaterRingLeave: vi.fn(),
        openExclusivePopup: vi.fn(),
        addWater,
        removeWater: vi.fn()
      }
    });

    const presetButton = findNode(
      tree,
      (node) => node.type === 'button' && node.props?.className === 'water-preset-compact'
    );

    expect(presetButton).toBeTruthy();

    presetButton.props.onClick({ currentTarget: sourceEl });

    expect(addWater).toHaveBeenCalledTimes(1);
    expect(addWater).toHaveBeenCalledWith(100, {
      skipScroll: true,
      source: 'water-card-preset',
      sourceEl
    });

    vi.runAllTimers();

    expect(addWater).toHaveBeenCalledTimes(1);
  });
});
