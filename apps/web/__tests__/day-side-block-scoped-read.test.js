import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = global.HEYS;
const originalWindow = global.window;
const originalDocument = global.document;

function loadMorningModule({ currentClientId = 'client-a', store = {} } = {}) {
  global.HEYS = {
    store: {
      readSafe: store.readSafe || (() => null),
    },
    utils: {
      getCurrentClientId: () => currentClientId,
      lsGet: store.lsGet || ((_, fallback) => fallback),
    },
  };
  global.window = global;
  global.document = {
    addEventListener: vi.fn(),
    getElementById: vi.fn(() => null),
  };
  global.addEventListener = vi.fn();
  global.dispatchEvent = vi.fn();

  const srcPath = path.resolve(__dirname, '../heys_morning_checkin_v1.js');
  eval(fs.readFileSync(srcPath, 'utf8'));
  return global.HEYS.MorningCheckinUtils;
}

function loadSideBlockModule() {
  const srcPath = path.resolve(__dirname, '../heys_day_side_block_v1.js');
  eval(fs.readFileSync(srcPath, 'utf8'));
  return global.HEYS.daySideBlock;
}

function createElement(type, props, ...children) {
  return { type, props: props || {}, children: children.flat() };
}

function findByClass(node, className) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.props?.className === 'string' && node.props.className.includes(className)) {
    return node;
  }
  for (const child of node.children || []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

function renderSideBlock(initialDay, overrides = {}) {
  const sideBlock = loadSideBlockModule();
  let currentDay = { ...initialDay };
  const ctx = {
    React: { createElement },
    day: currentDay,
    date: '2026-06-09',
    sleepH: 0,
    getYesterdayData: () => ({}),
    getCompareArrow: () => null,
    getScoreEmoji: () => '',
    getScoreGradient: () => 'transparent',
    getScoreTextColor: () => '#000',
    setDay: (updater) => {
      currentDay = typeof updater === 'function' ? updater(currentDay) : updater;
    },
    calculateDayAverages: overrides.calculateDayAverages || (() => ({ dayScore: 8 })),
    measurementsNeedUpdate: false,
    openMeasurementsEditor: vi.fn(),
    measurementsByField: [],
    measurementsHistory: [],
    measurementsMonthlyProgress: null,
    measurementsLastDateFormatted: '',
    renderMeasurementSpark: vi.fn(),
  };
  return {
    tree: sideBlock.renderSideBlock(ctx),
    getDay: () => currentDay,
  };
}

describe('day side block checkin refresh', () => {
  afterEach(() => {
    global.HEYS = originalHEYS;
    global.window = originalWindow;
    global.document = originalDocument;
    delete global.addEventListener;
    delete global.dispatchEvent;
    vi.restoreAllMocks();
  });

  it('MorningCheckinUtils strict read does not fall back to unscoped day for scoped client', () => {
    const utils = loadMorningModule({
      currentClientId: 'client-a',
      store: {
        readSafe: (key, fallback) => {
          if (key === 'heys_dayv2_2026-06-09') {
            return { moodMorning: 2, _sourceClientId: 'other-client' };
          }
          return fallback;
        },
      },
    });

    expect(utils.readDayV2ScopedFirst('2026-06-09', {}, { allowUnscopedFallback: false })).toEqual({});
    expect(utils.readDayV2ScopedFirst('2026-06-09', {})).toEqual({
      moodMorning: 2,
      _sourceClientId: 'other-client',
    });
  });

  it('refreshes day sleep from scoped checkin storage', () => {
    loadMorningModule({
      currentClientId: 'client-a',
      store: {
        readSafe: (key, fallback) => {
          if (key === 'heys_client-a_dayv2_2026-06-09') {
            return { daySleepMinutes: 25, sleepQuality: 7 };
          }
          if (key === 'heys_dayv2_2026-06-09') {
            return { daySleepMinutes: 90, sleepQuality: 1 };
          }
          return fallback;
        },
      },
    });
    global.HEYS.showCheckin = {
      daySleep: (_dateKey, onComplete) => onComplete(),
    };

    const view = renderSideBlock({ date: '2026-06-09', meals: [], trainings: [] });
    findByClass(view.tree, 'sleep-breakdown-cta').props.onClick({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(view.getDay().daySleepMinutes).toBe(25);
    expect(view.getDay().sleepQuality).toBe(7);
  });

  it('refreshes mood cards from scoped checkin storage', () => {
    loadMorningModule({
      currentClientId: 'client-a',
      store: {
        readSafe: (key, fallback) => {
          if (key === 'heys_client-a_dayv2_2026-06-09') {
            return {
              meals: [],
              trainings: [],
              moodMorning: 8,
              wellbeingMorning: 7,
              stressMorning: 2,
            };
          }
          if (key === 'heys_dayv2_2026-06-09') {
            return { moodMorning: 1, wellbeingMorning: 1, stressMorning: 9 };
          }
          return fallback;
        },
      },
    });
    global.HEYS.showCheckin = {
      morningMood: (_dateKey, onComplete) => onComplete(),
    };

    const view = renderSideBlock({ date: '2026-06-09', meals: [], trainings: [] });
    findByClass(view.tree, 'day-mood-row').props.onClick();

    expect(view.getDay()).toMatchObject({
      moodMorning: 8,
      wellbeingMorning: 7,
      stressMorning: 2,
      dayScore: 8,
    });
  });
});
