import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const webRoot = path.resolve(__dirname, '..');
const initializerSource = fs.readFileSync(path.join(webRoot, 'heys_app_initialize_v1.js'), 'utf8');
const diagnosticsSource = fs.readFileSync(path.join(webRoot, 'heys_client_diagnostics_v1.js'), 'utf8');
const tabsSource = fs.readFileSync(path.join(webRoot, 'heys_app_tabs_v1.js'), 'utf8');
const shellSource = fs.readFileSync(path.join(webRoot, 'heys_app_shell_v1.js'), 'utf8');
const hungerSource = fs.readFileSync(path.join(webRoot, 'heys_hunger_energy_status_ui_v1.js'), 'utf8');
const stepModalSource = fs.readFileSync(path.join(webRoot, 'heys_step_modal_v1.js'), 'utf8');

function visible(element) {
  element.getBoundingClientRect = () => ({ width: 390, height: 600, top: 0, left: 0, right: 390, bottom: 600 });
  return element;
}

function createRuntime() {
  const events = [];
  const timers = [];
  let clock = 0;
  window.HEYS = {
    LogTrace: {
      event: vi.fn((name, context, level) => events.push({ name, context, level })),
    },
  };
  window.__heysHasSession = true;
  document.body.innerHTML = '<div id="root"><div class="heys-skeleton">Загрузка</div></div>';
  eval(initializerSource);
  const createGuard = window.HEYS.AppInitializer._test.createBlankScreenGuard;
  const guard = createGuard({
    timeoutMs: 15000,
    retryTimeoutMs: 10000,
    observe: false,
    now: () => clock,
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout: vi.fn(),
  });
  const root = document.getElementById('root');
  return {
    events,
    guard,
    root,
    timers,
    setClock: (value) => { clock = value; },
  };
}

beforeEach(() => {
  delete window.HEYS;
  delete window.__heysHasSession;
});

afterEach(() => {
  document.body.innerHTML = '';
  delete window.HEYS;
  delete window.__heysHasSession;
  vi.restoreAllMocks();
});

describe('iOS/PWA blank-screen visual guard', () => {
  it('keeps every visual outcome named in curator diagnostics', () => {
    ['first_visible_frame', 'blank_screen_guard_triggered', 'blank_screen_recovered', 'blank_screen_recovery_failed']
      .forEach((eventName) => expect(diagnosticsSource).toContain(`${eventName}:`));
  });

  it('wires Day retry and active-tab paint markers without weakening boot_ready', () => {
    expect(tabsSource).toContain("window.addEventListener('heys:blank-screen-retry'");
    expect(tabsSource).toContain("'data-heys-visible-frame': isActive ? 'day' : undefined");
    expect(tabsSource).toContain('BlankScreenGuard?.reportVisibleFrame?.({');
    expect(shellSource).toContain("'data-heys-visible-frame': isDayTab ? undefined : tab");
    expect(tabsSource).toContain("HEYS?.LogTrace?.event?.('boot_ready'");
  });

  it('accepts auto-opened hunger and check-in modals as visible first frames', () => {
    expect(hungerSource).toContain("screen: 'hunger-assessment'");
    expect(hungerSource).toContain("reason: 'hunger_prompt_painted'");
    expect(stepModalSource).toContain("screen: 'step-modal'");
    expect(stepModalSource).toContain("reason: 'step_modal_painted'");
  });

  it('keeps the skeleton until a visible frame is confirmed after paint', () => {
    const runtime = createRuntime();
    expect(runtime.guard.arm(runtime.root)).toBe(true);
    expect(document.getElementById('heys-boot-visual-guard')).not.toBeNull();

    const frame = visible(document.createElement('div'));
    frame.dataset.heysVisibleFrame = 'day';
    runtime.root.appendChild(frame);
    runtime.setClock(5200);
    runtime.guard.reportVisibleFrame({ element: frame, screen: 'day', reason: 'day_content_painted' });

    expect(document.getElementById('heys-boot-visual-guard')).toBeNull();
    expect(runtime.events.filter((event) => event.name === 'first_visible_frame')).toHaveLength(1);
    expect(runtime.events.find((event) => event.name === 'first_visible_frame')).toMatchObject({
      level: 'info',
      context: expect.objectContaining({ durationMs: 5200, screen: 'day', attempt: 0 }),
    });

    runtime.guard.reportVisibleFrame({ element: frame, screen: 'day' });
    expect(runtime.events.filter((event) => event.name === 'first_visible_frame')).toHaveLength(1);
  });

  it('shows explicit recovery actions and records a detailed timeout deviation', () => {
    const runtime = createRuntime();
    runtime.guard.arm(runtime.root);
    runtime.setClock(15000);
    runtime.timers[0]();

    const overlay = document.getElementById('heys-boot-visual-guard');
    expect(overlay.textContent).toContain('Экран не загрузился');
    expect(overlay.textContent).toContain('Повторить');
    expect(overlay.textContent).toContain('Перезагрузить приложение');
    expect(runtime.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'blank_screen_guard_triggered',
        level: 'warn',
        context: expect.objectContaining({ reason: 'first_visible_frame_timeout', durationMs: 15000 }),
      }),
    ]));
  });

  it('records recovery after retry without duplicating the first-frame event', () => {
    const runtime = createRuntime();
    runtime.guard.arm(runtime.root);
    runtime.setClock(15000);
    runtime.timers[0]();

    const frame = visible(document.createElement('div'));
    frame.dataset.heysVisibleFrame = 'day';
    runtime.root.appendChild(frame);
    runtime.setClock(17000);
    runtime.guard.retryRecovery();

    expect(runtime.events.filter((event) => event.name === 'first_visible_frame')).toHaveLength(1);
    expect(runtime.events.filter((event) => event.name === 'blank_screen_recovered')).toHaveLength(1);
    expect(runtime.events.find((event) => event.name === 'blank_screen_recovered')?.context)
      .toEqual(expect.objectContaining({ attempt: 1, reason: 'retry_visible_content' }));
  });

  it('records a failed recovery when the retry also times out', () => {
    const runtime = createRuntime();
    runtime.guard.arm(runtime.root);
    runtime.setClock(15000);
    runtime.timers[0]();
    runtime.guard.retryRecovery();
    runtime.setClock(25000);
    runtime.timers.at(-1)();
    runtime.guard.retryRecovery();
    runtime.timers.at(-1)();

    expect(runtime.events.filter((event) => event.name === 'blank_screen_recovery_failed')).toEqual([
      expect.objectContaining({
        name: 'blank_screen_recovery_failed',
        level: 'error',
        context: expect.objectContaining({ attempt: 1, reason: 'retry_timeout' }),
      }),
    ]);
  });
});
