import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const storageSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_storage_supabase_v1.js'), 'utf8');
const platformSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_platform_apis_v1.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf8');

const originalHEYS = window.HEYS;
const originalDEV = window.DEV;
const originalLogControl = window.__heysLogControl;
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
}

function loadStorageModule() {
  eval(fs.readFileSync(path.join(WEB_DIR, 'heys_pending_queue_pure_v1.js'), 'utf8'));
  eval(fs.readFileSync(path.join(WEB_DIR, 'heys_sync_queue_runtime_pure_v1.js'), 'utf8'));
  eval(storageSrc);
}

function extractRecoveryScript() {
  const marker = '<!-- 🆕 PWA Recovery: Global pre-React error handler -->';
  const markerIndex = indexHtml.indexOf(marker);
  if (markerIndex < 0) throw new Error('Recovery marker not found');
  const scriptStart = indexHtml.indexOf('<script>', markerIndex);
  const scriptEnd = indexHtml.indexOf('</script>', scriptStart);
  if (scriptStart < 0 || scriptEnd < 0) throw new Error('Recovery script not found');
  return indexHtml.slice(scriptStart + '<script>'.length, scriptEnd);
}

function loadRecoveryScript() {
  window.__heysAppReady = false;
  document.body.innerHTML = '<div id="root"></div>';
  eval(extractRecoveryScript());
}

function extractNamedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} end not found`);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  localStorage.clear();
  sessionStorage.clear();
  delete window.__heysRecoveryPolicy;
  delete window.__heysRecoveryBusy;
  delete window.__heysShowRecoveryUI;
  delete window.__heysFixAndReload;
  delete window.__heysAppReady;
  window.DEV = {
    log: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
  window.__heysLogControl = { isEnabled: () => false };
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.HEYS = originalHEYS;
  window.DEV = originalDEV;
  window.__heysLogControl = originalLogControl;
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  }
});

describe('HEYS.cloud sync contract', () => {
  it('keeps retrySync boolean but exposes sync/pushAll as Promise-returning wrappers', async () => {
    setNavigator({
      onLine: true,
      serviceWorker: undefined,
      connection: { addEventListener: vi.fn() },
    });
    window.HEYS = {
      YandexAPI: { CONFIG: { API_URL: 'https://api.example.test' } },
      auth: { getSessionToken: () => null },
      cloud: {},
    };

    loadStorageModule();

    expect(window.HEYS.cloud.retrySync()).toBe(true);
    const syncResult = window.HEYS.cloud.sync();
    expect(syncResult).toBeTruthy();
    expect(typeof syncResult.then).toBe('function');
    await expect(syncResult).resolves.toBe(true);
    await expect(window.HEYS.cloud.pushAll()).resolves.toBe(true);
    await expect(window.HEYS.SupabaseConnection.sync()).resolves.toBe(true);
  });
});

describe('idle return sync', () => {
  it('does not throw when HEYS.cloud.sync returns a boolean', () => {
    const helperSource = extractNamedFunction(platformSrc, 'syncAfterIdleReturn');
    const cloudSync = vi.fn(() => true);
    const fakeWindow = { HEYS: { cloud: { sync: cloudSync } } };
    const helper = new Function('window', 'console', `${helperSource}; return syncAfterIdleReturn;`)(
      fakeWindow,
      console,
    );

    expect(() => helper()).not.toThrow();
    expect(helper()).toBe(true);
    expect(cloudSync).toHaveBeenCalledTimes(2);
    expect(platformSrc).not.toContain('window.HEYS.cloud.sync().catch');
  });
});

describe('runtime recovery policy', () => {
  it('classifies idle sync catch TypeError as runtime-recoverable', () => {
    loadRecoveryScript();
    const policy = window.__heysRecoveryPolicy;
    const message = 'Uncaught TypeError: window.HEYS.cloud.sync(...).catch is not a function';

    expect(policy.isRuntimeRecoverableError(message, '')).toBe(true);
    expect(policy.shouldShowRecoveryForError(message, '', true, 1, 0)).toBe(false);
  });

  it('keeps dynamic import failures boot-critical, not generic network-recoverable', () => {
    loadRecoveryScript();
    const policy = window.__heysRecoveryPolicy;
    const message = 'Failed to fetch dynamically imported module';

    expect(policy.isBootCriticalError(message, '')).toBe(true);
    expect(policy.isRuntimeRecoverableError(message, '')).toBe(false);
  });

  it('does not treat async or middleware stack frames as sync/idle recoverable errors', () => {
    loadRecoveryScript();
    const policy = window.__heysRecoveryPolicy;
    const stack = [
      'Error: ReactDOM is not defined',
      '    at async bootApp (boot-init.bundle.js:10:5)',
      '    at middlewareDispatch (boot-init.bundle.js:20:5)',
    ].join('\n');

    expect(policy.isBootCriticalError('ReactDOM is not defined', stack)).toBe(true);
    expect(policy.isRuntimeRecoverableError('ReactDOM is not defined', stack)).toBe(false);
    expect(policy.shouldShowRecoveryForError('ReactDOM is not defined', stack, false, 1, 0)).toBe(true);
  });

  it('shows recovery immediately for boot-critical errors before app ready', () => {
    loadRecoveryScript();

    const handled = window.onerror(
      'ReactDOM is not defined',
      'boot-init.bundle.js',
      1,
      1,
      new Error('ReactDOM is not defined'),
    );

    expect(handled).toBe(true);
    expect(document.body.textContent).toContain('Ошибка загрузки');
  });

  it('requires three post-ready boot-critical errors before full recovery', () => {
    loadRecoveryScript();
    window.__heysAppReady = true;

    const error = new Error('ReactDOM is not defined');
    expect(window.onerror('ReactDOM is not defined', 'boot-init.bundle.js', 1, 1, error)).toBe(false);
    expect(document.body.textContent).not.toContain('Ошибка загрузки');
    expect(window.onerror('ReactDOM is not defined', 'boot-init.bundle.js', 1, 1, error)).toBe(false);
    expect(document.body.textContent).not.toContain('Ошибка загрузки');
    expect(window.onerror('ReactDOM is not defined', 'boot-init.bundle.js', 1, 1, error)).toBe(true);
    expect(document.body.textContent).toContain('Ошибка загрузки');
  });
});
