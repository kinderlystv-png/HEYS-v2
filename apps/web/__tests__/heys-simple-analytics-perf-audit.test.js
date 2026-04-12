import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalLocalStorage = window.localStorage;
const originalPerformanceObserver = window.PerformanceObserver;
const originalRequestIdleCallback = window.requestIdleCallback;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;

function createMockStorage(seed = {}) {
  const store = {};
  Object.keys(seed).forEach((key) => {
    store[key] = String(seed[key]);
  });

  return {
    get length() {
      return Object.keys(store).length;
    },
    key(index) {
      return Object.keys(store)[index] || null;
    },
    getItem: vi.fn((key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
    setItem: vi.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    _store: store,
  };
}

function installPerformanceObserverMock() {
  class MockPerformanceObserver {
    static supportedEntryTypes = ['event', 'longtask', 'largest-contentful-paint', 'layout-shift'];
    constructor(callback) {
      this.callback = callback;
    }
    observe() { }
    disconnect() { }
  }

  window.PerformanceObserver = MockPerformanceObserver;
}

function loadAnalyticsModule() {
  const modulePath = path.resolve(__dirname, '../heys_simple_analytics.js');
  const source = fs.readFileSync(modulePath, 'utf8');
  eval(source);
}

describe('heys_simple_analytics perf audit', () => {
  let now;
  let nowSpy;

  beforeEach(() => {
    now = 0;
    window.HEYS = {};

    const mockStorage = createMockStorage({
      heys_perf_audit: '1',
      'heys_dayv2_2026-04-10': JSON.stringify({ meals: [{ items: [{}, {}, {}] }] }),
      'heys_dayv2_2026-04-11': JSON.stringify({ meals: [{ items: [{}, {}] }] }),
    });
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    installPerformanceObserverMock();
    window.requestIdleCallback = (cb) => {
      cb({ didTimeout: false, timeRemaining: () => 5 });
      return 1;
    };
    window.requestAnimationFrame = (cb) => {
      now += 16;
      cb(now);
      return 1;
    };
    window.cancelAnimationFrame = () => { };
    nowSpy = vi.spyOn(window.performance, 'now').mockImplementation(() => {
      now += 10;
      return now;
    });
  });

  afterEach(() => {
    try {
      window.HEYS?.analytics?.stopPerformanceAudit?.();
    } catch (e) { }
    nowSpy?.mockRestore();
    vi.restoreAllMocks();
    window.HEYS = originalHEYS;
    window.PerformanceObserver = originalPerformanceObserver;
    window.requestIdleCallback = originalRequestIdleCallback;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it('collects performance payload and event counters', () => {
    loadAnalyticsModule();

    expect(window.HEYS.analytics).toBeDefined();

    window.HEYS.analytics.trackEvent('tab_switch_day');
    window.HEYS.analytics.trackEvent('generic_click');
    window.HEYS.analytics.trackInteraction('open_day', 180, { source: 'test' });
    window.HEYS.analytics.startMeasure('sync-roundtrip');
    const measured = window.HEYS.analytics.endMeasure('sync-roundtrip', { target: 'queue' });

    const stats = window.HEYS.analytics.getStats();

    expect(measured).toBeGreaterThan(0);
    expect(stats.events.total).toBe(2);
    expect(stats.events.tabSwitches).toBe(1);
    expect(stats.performance.enabled).toBe(true);
    expect(stats.performance.dataProfile.daysCount).toBe(2);
    expect(stats.performance.customMeasures.length).toBeGreaterThan(0);
  });

  it('reset clears aggregated performance and events counters', () => {
    loadAnalyticsModule();

    window.HEYS.analytics.trackEvent('tab_switch_reports');
    window.HEYS.analytics.trackInteraction('open_reports', 220);
    window.HEYS.analytics.reset();

    const stats = window.HEYS.analytics.getStats();
    expect(stats.events.total).toBe(0);
    expect(stats.events.tabSwitches).toBe(0);
    expect(stats.performance.customMeasures.length).toBe(0);
  });
});
