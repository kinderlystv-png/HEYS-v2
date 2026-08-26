import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shortcutsSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_app_shortcuts_v1.js'),
  'utf8',
);
const handlersSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_day_handlers.js'),
  'utf8',
);
const cronSource = fs.readFileSync(
  path.resolve(__dirname, '../../../yandex-cloud-functions/heys-cron-reminders/index.js'),
  'utf8',
);

const originalHEYS = global.HEYS;

function loadShortcuts() {
  // eslint-disable-next-line no-eval
  (0, eval)(shortcutsSource);
}

describe('push entry deep links (contract)', () => {
  it('cron sends morning-checkin and water-hint URLs from index.js', () => {
    expect(cronSource).toContain("url: '/?action=morning-checkin'");
    expect(cronSource).toContain("url: '/?tab=ration&focus=water'");
  });

  it('shortcuts source defines morning-checkin handler separate from add-water', () => {
    expect(shortcutsSource).toContain("action === 'morning-checkin'");
    expect(shortcutsSource).toContain('HEYS.showCheckin.morning(today)');
    expect(shortcutsSource).toContain("focusParam === 'water' && mappedTab === 'ration'");
    expect(shortcutsSource).toContain('HEYS.Day.focusWater');
    expect(shortcutsSource).not.toMatch(/action === 'morning-checkin'[\s\S]*addWater/);
  });

  it('focusWater scrolls without writing a sip', () => {
    const match = handlersSource.match(/function focusWater\(\) \{([\s\S]*?)\n\s*\}/);
    expect(match).toBeTruthy();
    expect(match[1]).toContain('scrollIntoView');
    expect(match[1]).not.toContain('addWater');
    expect(match[1]).not.toContain('runWaterAnimation');
  });
});

describe('push entry shortcuts runtime', () => {
  let replaceStateSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    global.HEYS = {
      ui: { setSelectedDate: vi.fn() },
      showCheckin: { morning: vi.fn() },
      Day: { focusWater: vi.fn() },
    };
    replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    window.history.replaceState({}, '', '/?action=morning-checkin');
  });

  afterEach(() => {
    vi.useRealTimers();
    replaceStateSpy.mockRestore();
    vi.restoreAllMocks();
    global.HEYS = originalHEYS;
    window.history.replaceState({}, '', '/');
  });

  it('morning-checkin action navigates to today and opens step modal entry', () => {
    loadShortcuts();
    const setTab = vi.fn();
    const skipTabSwitchRef = { current: false };

    global.HEYS.AppShortcuts.handleShortcuts({ setTab, setNotification: vi.fn(), skipTabSwitchRef });

    vi.advanceTimersByTime(200);

    expect(global.HEYS.ui.setSelectedDate).toHaveBeenCalledTimes(1);
    expect(global.HEYS.showCheckin.morning).toHaveBeenCalledWith(global.HEYS.ui.setSelectedDate.mock.calls[0][0]);
    expect(setTab).not.toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalled();
  });

  it('ration+focus=water switches tab and focuses card without addWater', () => {
    window.history.replaceState({}, '', '/?tab=ration&focus=water');
    loadShortcuts();
    const setTab = vi.fn();
    const skipTabSwitchRef = { current: false };

    global.HEYS.AppShortcuts.handleShortcuts({ setTab, setNotification: vi.fn(), skipTabSwitchRef });

    vi.advanceTimersByTime(700);

    expect(setTab).toHaveBeenCalledWith('ration');
    expect(global.HEYS.Day.focusWater).toHaveBeenCalledTimes(1);
    expect(global.HEYS.Day.addWater).toBeUndefined();
    expect(replaceStateSpy).toHaveBeenCalled();
  });
});
