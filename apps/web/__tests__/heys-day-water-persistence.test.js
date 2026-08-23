import fs from 'fs';
import path from 'path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = global.HEYS;
const originalReact = global.React;
const originalRequestAnimationFrame = global.requestAnimationFrame;

function loadModule() {
  const srcPath = path.resolve(__dirname, '../heys_day_day_handlers.js');
  eval(fs.readFileSync(srcPath, 'utf8'));
}

function stubWaterCustomVolume() {
  global.HEYS.WaterCustomVolume = {
    useLongPress350: (_onLongPress, { onShortClick, disabled } = {}) => ({
      onPointerDown: () => {},
      onPointerMove: () => {},
      onPointerUp: (event) => { if (!disabled) onShortClick?.(event); },
      onClick: (event) => { if (!disabled) onShortClick?.(event); }
    }),
    open: vi.fn()
  };
}

function loadWaterCardModule() {
  stubWaterCustomVolume();
  const srcPath = path.resolve(__dirname, '../heys_day_water_v1.js');
  eval(fs.readFileSync(srcPath, 'utf8'));
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

  it('does not seed the selected date from a mismatched runtime or stored day', () => {
    let currentDay = {
      date: '2025-12-11',
      meals: [{ id: 'yesterday-meal', items: [{ id: 'i1' }] }],
      waterMl: 900,
      updatedAt: 1734000000000
    };

    global.HEYS.Day.getDay.mockImplementation(() => currentDay);
    global.HEYS.dayUtils.lsGet.mockReturnValue({
      date: '2025-12-11',
      meals: [{ id: 'stored-yesterday', items: [{ id: 'i2' }] }],
      waterMl: 1200,
      updatedAt: 1734000001000
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

    const savedDay = global.HEYS.dayUtils.lsSet.mock.calls[0][1];
    expect(global.HEYS.dayUtils.lsSet).toHaveBeenCalledWith('heys_dayv2_2025-12-12', expect.any(Object));
    expect(savedDay.date).toBe('2025-12-12');
    expect(savedDay.waterMl).toBe(100);
    expect(savedDay.meals).toBeUndefined();
  });

  it('чип объёма в карточке зовёт addWater сразу', () => {
    // Полный вид (FAB water off) — четыре чипа +200…+500.
    global.HEYS = {
      utils: { lsGet: vi.fn(() => null) },
      dayUtils: { lsGet: vi.fn(() => null) },
      FabVisibility: { read: () => ({ water: false, hunger: true, message: true, activity: true, meal: true }) },
      dayWaterState: { computeWaterGoalBreakdown: () => ({ finalGoal: 2000 }) },
      NutritionV4: { eatingProgressK: () => 0.5 }
    };

    loadWaterCardModule();

    const addWater = vi.fn();
    const element = global.HEYS.dayWater.render({
      React: RealReact,
      ctx: {
        day: { date: '2025-12-12', waterMl: 1000 },
        waterGoal: 2000,
        waterGoalBreakdown: { base: 2000 },
        waterLastDrink: null
      },
      actions: {
        addWater,
        removeWater: vi.fn(),
        haptic: vi.fn(),
        openExclusivePopup: vi.fn()
      }
    });

    const { container } = render(element);
    const chips = container.querySelectorAll('.water-review__chip--quick');
    expect(chips.length).toBe(4);

    fireEvent.click(chips[1]);

    expect(addWater).toHaveBeenCalledTimes(1);
    expect(addWater).toHaveBeenCalledWith(200, expect.objectContaining({
      skipScroll: true,
      source: 'water-review-card'
    }));
  });
});
