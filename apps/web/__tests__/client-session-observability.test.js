import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '..', '..');
const loggerSource = fs.readFileSync(path.join(webRoot, 'heys_client_log_trace_v1.js'), 'utf8');
const restSource = fs.readFileSync(path.join(repoRoot, 'yandex-cloud-functions/heys-api-rest/index.js'), 'utf8');
const migrationSource = fs.readFileSync(path.join(repoRoot, 'scripts/db/migrations/2026-07-24_client_session_observability.sql'), 'utf8');
const diagnosticsSource = fs.readFileSync(path.join(webRoot, 'heys_client_diagnostics_v1.js'), 'utf8');
const checkinSource = fs.readFileSync(path.join(webRoot, 'heys_morning_checkin_v1.js'), 'utf8');
const hungerSource = fs.readFileSync(path.join(webRoot, 'heys_hunger_energy_status_ui_v1.js'), 'utf8');
const whatsNewSource = fs.readFileSync(path.join(webRoot, 'heys_whats_new_modal_v1.js'), 'utf8');
const swSource = fs.readFileSync(path.join(webRoot, 'heys_platform_apis_v1.js'), 'utf8');
const curatorChangesSource = fs.readFileSync(path.join(webRoot, 'heys_curator_actions_banner_v1.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(webRoot, 'heys_storage_supabase_v1.js'), 'utf8');
const ewsSource = fs.readFileSync(path.join(webRoot, 'insights/pi_early_warning.js'), 'utf8');
const tabsSource = fs.readFileSync(path.join(webRoot, 'heys_app_tabs_v1.js'), 'utf8');
const gateSource = fs.readFileSync(path.join(webRoot, 'heys_app_gate_flow_v1.js'), 'utf8');
const gamificationSource = fs.readFileSync(path.join(webRoot, 'heys_gamification_v1.js'), 'utf8');
const rpcSource = fs.readFileSync(path.join(repoRoot, 'yandex-cloud-functions/heys-api-rpc/index.js'), 'utf8');
const messagesSource = fs.readFileSync(path.join(repoRoot, 'yandex-cloud-functions/heys-api-messages/index.js'), 'utf8');
const classificationSource = fs.readFileSync(path.join(repoRoot, 'scripts/db/migrations/2026-07-24_client_session_outcome_classification.sql'), 'utf8');
const visitMigrationSource = fs.readFileSync(path.join(repoRoot, 'scripts/db/migrations/2026-07-24_client_visit_observability.sql'), 'utf8');
const pinLoginMigrationSource = fs.readFileSync(path.join(repoRoot, 'scripts/db/migrations/2026-07-24_pin_login_observability.sql'), 'utf8');
const clientEntryMigrationSource = fs.readFileSync(path.join(repoRoot, 'scripts/db/migrations/2026-07-24_client_entry_observability.sql'), 'utf8');
const runtimeEnvMigrationSource = fs.readFileSync(path.join(repoRoot, 'scripts/db/migrations/2026-07-25_client_observability_runtime_env.sql'), 'utf8');
const devServerSource = fs.readFileSync(path.join(repoRoot, 'packages/core/src/server.js'), 'utf8');

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function createLoggerRuntime(options = {}) {
  const requests = [];
  const listeners = {};
  const documentListeners = {};
  const localStorage = storage();
  const sessionStorage = storage();
  class RuntimeDate extends Date {
    static now() { return typeof options.now === 'function' ? options.now() : Date.now(); }
  }
  let uuidCounter = 0;
  const context = {
    console: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    location: { hostname: 'app.heyslab.ru', href: 'https://app.heyslab.ru/' },
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Version/18.5 Mobile Safari/604.1', onLine: true, standalone: true },
    localStorage,
    sessionStorage,
    Date: RuntimeDate,
    document: {
      scripts: options.scripts || [{ src: 'https://app.heyslab.ru/boot-app.bundle.abc123ef.js' }],
      visibilityState: 'visible',
      addEventListener: vi.fn((name, handler) => { documentListeners[name] = handler; }),
    },
    fetch: vi.fn((url, options) => {
      requests.push({ url, options });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ structuredAccepted: true }) });
    }),
    Blob,
    crypto: { randomUUID: () => '123e4567-e89b-42d3-a456-' + String(426614174000 + uuidCounter++).padStart(12, '0') },
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
    addEventListener: (name, handler) => { listeners[name] = handler; },
    dispatchEvent: vi.fn(),
    matchMedia: () => ({ matches: true }),
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(loggerSource, context, { filename: 'heys_client_log_trace_v1.js' });
  return { context, requests, localStorage, listeners, documentListeners };
}

describe('client session observability', () => {
  it('emits a structured iPhone/PWA event and strips non-allowlisted context', async () => {
    const { context, requests } = createLoggerRuntime();
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';

    context.HEYS.LogTrace.event('whats_new_shown', {
      source: 'whats_new',
      release_version: '2026.07.24.abc123ef',
      unseen_count: 2,
      key_family: 'reading_preferences',
      key_id: 'k_a1b2c3d4',
      error_code: 'server_error',
      hungerLevel: 9,
      phone: '+79990000000',
      raw_key: 'heys_secret_key',
      value: 'secret-value',
      client_id: 'foreign-client-id',
    });
    context.HEYS.LogTrace.flush();
    await Promise.resolve();

    expect(requests).toHaveLength(1);
    expect(requests[0].options.credentials).toBe('include');
    const rows = JSON.parse(requests[0].options.body);
    const event = rows.find((row) => row.event_name === 'whats_new_shown');
    expect(event).toMatchObject({
      boot_id: '123e4567-e89b-42d3-a456-426614174000',
      build_id: 'abc123ef',
      device_class: 'mobile',
      os_name: 'iOS',
      browser_name: 'Safari',
      display_mode: 'standalone',
    });
    expect(event.event_context).toEqual({
      source: 'whats_new',
      release_version: '2026.07.24.abc123ef',
      unseen_count: 2,
      key_family: 'reading_preferences',
      key_id: 'k_a1b2c3d4',
      error_code: 'server_error',
    });
    expect(JSON.stringify(event.event_context)).not.toContain('79990000000');
    expect(event.event_context).not.toHaveProperty('hungerLevel');
    expect(event.event_context).not.toHaveProperty('raw_key');
    expect(event.event_context).not.toHaveProperty('value');
    expect(event.event_context).not.toHaveProperty('client_id');
  });

  it('keeps structured events in a bounded offline queue until the server accepts them', () => {
    const { context, localStorage } = createLoggerRuntime();
    context.HEYS.LogTrace.event('boot_failed', { source: 'window', status: 'failed', phase: 'boot' }, 'error');
    const queued = JSON.parse(localStorage.getItem('_heys_observability_queue_v1'));
    expect(queued.some((row) => row.event_name === 'boot_failed')).toBe(true);
    expect(queued.length).toBeLessThanOrEqual(200);
  });

  it('defers structured boot events until a client context exists', () => {
    const { context, requests, localStorage } = createLoggerRuntime();
    context.HEYS.LogTrace.flush();

    expect(requests).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('_heys_observability_queue_v1')))
      .toEqual(expect.arrayContaining([expect.objectContaining({ event_name: 'boot_started' })]));
  });

  it('flushes the preserved visit start as soon as PIN client context is ready', async () => {
    const { context, requests, localStorage, listeners } = createLoggerRuntime();
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';

    listeners['heys:client-changed']({ detail: { source: 'pin-login' } });
    await Promise.resolve();
    await Promise.resolve();

    expect(requests).toHaveLength(1);
    const rows = JSON.parse(requests[0].options.body);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        client_id: 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a',
        event_name: 'visit_started',
      }),
      expect.objectContaining({ event_name: 'client_context_ready' }),
    ]));
    expect(JSON.parse(localStorage.getItem('_heys_observability_queue_v1')))
      .toEqual(expect.arrayContaining([expect.objectContaining({ event_name: 'visit_started' })]));
  });

  it('announces fresh React PIN login only after the client id is installed', () => {
    const installAt = gateSource.indexOf('setClientId(targetClientId);');
    const notifyAt = gateSource.indexOf("detail: { clientId: targetClientId, source: 'pin-login', startVisit: true }");
    expect(installAt).toBeGreaterThan(-1);
    expect(notifyAt).toBeGreaterThan(installAt);
  });

  it('does not mark the full boot ready when only the app shell is ready', async () => {
    const { context, requests, listeners } = createLoggerRuntime();
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    listeners['heys:progress']({ detail: { phase: 'ready' } });
    context.HEYS.LogTrace.flush();
    await Promise.resolve();

    const rows = JSON.parse(requests[0].options.body);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_name: 'app_shell_ready', event_status: 'ready' }),
    ]));
    expect(rows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ event_name: 'boot_ready' }),
    ]));
    expect(tabsSource).toContain("HEYS?.LogTrace?.event?.('boot_ready'");
  });

  it('keeps known warning deviations structured with safe debugging context', async () => {
    const { context, requests } = createLoggerRuntime();
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';

    context.console.warn('ews / detect ⚠️ input.invalid:', {
      event: 'ews_input_insufficient', source: 'ews', status: 'degraded',
      reason: 'insufficient_data', daysReceived: 3, minRequired: 6,
    });
    context.console.warn('[HEYS.sync] Critical first-frame batch unavailable; keeping startup barrier until fallback', {
      event: 'initial_sync_fallback_wait', source: 'sync', status: 'degraded',
      reason: 'critical_batch_unavailable',
    });
    context.HEYS.LogTrace.flush();
    await Promise.resolve();

    const rows = JSON.parse(requests[0].options.body);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event_name: 'ews_input_insufficient', event_source: 'ews', event_status: 'degraded',
        event_context: expect.objectContaining({ reason: 'insufficient_data', days_received: 3, min_required: 6 }),
      }),
      expect.objectContaining({
        event_name: 'initial_sync_fallback_wait', event_source: 'sync', event_status: 'degraded',
        event_context: expect.objectContaining({ reason: 'critical_batch_unavailable' }),
      }),
    ]));
  });

  it('refreshes an initially unknown build id after the boot bundle appears', async () => {
    const { context, requests } = createLoggerRuntime({ scripts: [] });
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    context.HEYS.LogTrace.event('test_before_bundle', { source: 'test' });
    context.document.scripts = [{ src: 'https://app.heyslab.ru/boot-app.bundle.deadbeef.js' }];
    context.HEYS.LogTrace.event('test_after_bundle', { source: 'test' });
    context.HEYS.LogTrace.flush();
    await Promise.resolve();

    const rows = JSON.parse(requests[0].options.body);
    expect(rows.find((row) => row.event_name === 'test_before_bundle')?.build_id).toBe('deadbeef');
    expect(rows.find((row) => row.event_name === 'test_after_bundle')?.build_id).toBe('deadbeef');
  });

  it('starts a distinct visit when an authenticated PWA returns from background', async () => {
    const { context, requests, documentListeners } = createLoggerRuntime();
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    context.__heysAppReady = true;
    context.navigator.sendBeacon = vi.fn(() => true);
    const coldVisit = context.HEYS.LogTrace.stats().visitId;

    context.document.visibilityState = 'hidden';
    documentListeners.visibilitychange();
    context.document.visibilityState = 'visible';
    documentListeners.visibilitychange();
    context.HEYS.LogTrace.flush();
    await Promise.resolve();

    const rows = requests.flatMap((request) => JSON.parse(request.options.body));
    const resume = rows.find((row) => row.event_name === 'app_foregrounded');
    expect(resume).toMatchObject({
      boot_id: '123e4567-e89b-42d3-a456-426614174000',
      event_status: 'ok',
      event_context: expect.objectContaining({ visit_kind: 'resume', auth_state: 'authenticated' }),
    });
    expect(resume.visit_id).toBeTruthy();
    expect(resume.visit_id).not.toBe(coldVisit);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_name: 'visit_ready', visit_id: resume.visit_id }),
    ]));
  });

  it('starts a distinct visit for an explicit repeat client entry without splitting initial auth', async () => {
    let now = 1000;
    const { context, localStorage, listeners } = createLoggerRuntime({ now: () => now });
    const coldVisit = context.HEYS.LogTrace.stats().visitId;
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    context.__heysAppReady = true;

    listeners['heys:client-changed']({
      detail: { clientId: context.HEYS.currentClientId, source: 'pin-login', startVisit: true },
    });
    expect(context.HEYS.LogTrace.stats().visitId).toBe(coldVisit);

    now = 2500;
    listeners['heys:client-changed']({
      detail: { clientId: context.HEYS.currentClientId, source: 'pin-login', startVisit: true },
    });
    const entryVisit = context.HEYS.LogTrace.stats().visitId;
    expect(entryVisit).not.toBe(coldVisit);
    expect(context.HEYS.LogTrace.stats().visitKind).toBe('client_entry');
    const rows = JSON.parse(localStorage.getItem('_heys_observability_queue_v1'));
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event_name: 'visit_started',
        visit_id: entryVisit,
        event_context: expect.objectContaining({ visit_kind: 'client_entry', source: 'pin-login' }),
      }),
      expect.objectContaining({ event_name: 'client_opened', visit_id: entryVisit }),
      expect.objectContaining({ event_name: 'visit_ready', visit_id: entryVisit }),
    ]));
  });

  it('deduplicates client context readiness and does not split duplicate entry notifications', () => {
    const { context, localStorage, listeners } = createLoggerRuntime();
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    listeners['heys:client-changed']({ detail: { clientId: context.HEYS.currentClientId, source: 'pin-login', startVisit: true } });
    const visitId = context.HEYS.LogTrace.stats().visitId;
    listeners['heys:client-changed']({ detail: { clientId: context.HEYS.currentClientId, source: 'pin-login', startVisit: true } });
    expect(context.HEYS.LogTrace.stats().visitId).toBe(visitId);
    const rows = JSON.parse(localStorage.getItem('_heys_observability_queue_v1'));
    expect(rows.filter((row) => row.event_name === 'client_context_ready')).toHaveLength(1);
  });

  it('records client context again after the active client changes', () => {
    const { context, localStorage, listeners } = createLoggerRuntime();
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    listeners['heys:client-changed']({ detail: { clientId: context.HEYS.currentClientId } });
    context.HEYS.currentClientId = '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc';
    listeners['heys:client-changed']({ detail: { clientId: context.HEYS.currentClientId } });
    const rows = JSON.parse(localStorage.getItem('_heys_observability_queue_v1'));
    expect(rows.filter((row) => row.event_name === 'client_context_ready')).toHaveLength(2);
  });

  it('distinguishes Phase A from full readiness and deduplicates each signal', () => {
    const { context, localStorage, listeners } = createLoggerRuntime();
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    listeners.heysSyncCompleted({ detail: { clientId: context.HEYS.currentClientId, phaseA: true } });
    listeners.heysSyncCompleted({ detail: { clientId: context.HEYS.currentClientId, phaseA: true } });
    listeners.heysSyncCompleted({ detail: { clientId: context.HEYS.currentClientId, phase: 'hot' } });
    listeners.heysSyncCompleted({ detail: { clientId: context.HEYS.currentClientId, phase: 'full', error: true } });
    listeners.heysSyncCompleted({ detail: { clientId: context.HEYS.currentClientId, phase: 'full' } });
    listeners.heysSyncCompleted({ detail: { clientId: context.HEYS.currentClientId, phase: 'full' } });
    const rows = JSON.parse(localStorage.getItem('_heys_observability_queue_v1'));
    expect(rows.filter((row) => row.event_name === 'initial_sync_phase_a_ready')).toHaveLength(1);
    expect(rows.filter((row) => row.event_name === 'initial_sync_ready')).toHaveLength(1);
    expect(rows.find((row) => row.event_name === 'initial_sync_ready').event_context)
      .toMatchObject({ phase: 'initial_sync', result: 'full' });
  });

  it('does not report fallback wait after critical readiness in the same visit', () => {
    const { context, localStorage, listeners } = createLoggerRuntime();
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    listeners.heysSyncCompleted({ detail: { clientId: context.HEYS.currentClientId, phaseA: true } });
    context.console.warn('[HEYS.sync]', {
      event: 'initial_sync_fallback_wait', source: 'sync', status: 'degraded', reason: 'critical_batch_unavailable',
    });
    const rows = JSON.parse(localStorage.getItem('_heys_observability_queue_v1'));
    expect(rows.filter((row) => row.event_name === 'initial_sync_fallback_wait')).toHaveLength(0);
  });

  it('measures resume sync readiness from the current sync cycle instead of page boot', async () => {
    let now = 1000;
    const { context, requests, listeners, documentListeners } = createLoggerRuntime({ now: () => now });
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    context.__heysAppReady = true;
    context.navigator.sendBeacon = vi.fn(() => true);

    now = 200000;
    context.document.visibilityState = 'hidden';
    documentListeners.visibilitychange();
    now = 201000;
    context.document.visibilityState = 'visible';
    documentListeners.visibilitychange();
    now = 201100;
    context.HEYS.LogTrace.event('sync_cycle_started', { source: 'sync', status: 'started' });
    now = 201450;
    listeners.heysSyncCompleted({ detail: { phase: 'full' } });
    context.HEYS.LogTrace.flush();
    await Promise.resolve();

    const rows = requests.flatMap((request) => JSON.parse(request.options.body));
    const syncReady = rows.find((row) => row.event_name === 'initial_sync_ready' && row.visit_id === context.HEYS.LogTrace.stats().visitId);
    expect(syncReady?.duration_ms).toBe(350);
  });

  it('keeps structured events queued when the server has no verified identity', async () => {
    const { context, localStorage } = createLoggerRuntime();
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    context.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ structuredAccepted: false }),
    }));
    context.HEYS.LogTrace.event('write_queued', { source: 'sync', status: 'queued', count: 1 });
    context.HEYS.LogTrace.flush();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(JSON.parse(localStorage.getItem('_heys_observability_queue_v1')))
      .toEqual(expect.arrayContaining([expect.objectContaining({ event_name: 'write_queued' })]));
  });

  it('keeps a PIN success visible as an unfinished visit when telemetry is absent', () => {
    expect(pinLoginMigrationSource).toContain("se.event_type = 'pin_success'");
    expect(pinLoginMigrationSource).toContain('NOT EXISTS');
    expect(pinLoginMigrationSource).toContain("THEN 'abandoned'");
    expect(pinLoginMigrationSource).toContain("'pin_success'::text AS last_success_event");
  });

  it('classifies explicit client entries separately in the visit summary', () => {
    expect(clientEntryMigrationSource).toContain("event_context->>'visit_kind' = 'client_entry'");
    expect(clientEntryMigrationSource).toContain("THEN 'client_entry'");
    expect(diagnosticsSource).toContain("kind === 'client_entry'");
    expect(runtimeEnvMigrationSource).toContain('login_without_trace AS');
    expect(runtimeEnvMigrationSource).toContain("'pin-' || se.id::text AS visit_id");
    expect(runtimeEnvMigrationSource).toContain('UNION ALL');
  });

  it('labels telemetry environment on the server and hides non-production visits by default', () => {
    expect(restSource).toContain('function resolveTelemetryRuntimeEnv(event)');
    expect(restSource).toContain("process.env.NODE_ENV === 'development'");
    expect(restSource).toContain("process.env.NODE_ENV === 'test'");
    expect(restSource).toContain("'runtime_env'");
    expect(restSource).not.toContain('row.runtime_env');
    expect(devServerSource).toContain("headers['x-heys-runtime-env'] = 'local'");
    expect(devServerSource).toContain("/^\\/rest\\/client_log_trace");
    expect(restSource).toContain("event?.headers?.['x-heys-runtime-env']");
    const corsBlock = restSource.split('function getCorsHeaders')[1].split('async function handleRestRequest')[0];
    const allowHeadersLine = corsBlock.split('\n').find((line) => line.includes('Access-Control-Allow-Headers'));
    expect(allowHeadersLine).not.toContain('x-heys-runtime-env');
    expect(runtimeEnvMigrationSource).toContain("ADD COLUMN IF NOT EXISTS runtime_env text NOT NULL DEFAULT 'production'");
    expect(runtimeEnvMigrationSource).toContain("p_include_nonproduction boolean DEFAULT false");
    expect(runtimeEnvMigrationSource).toContain("COALESCE(p_include_nonproduction, false) OR s.runtime_env = 'production'");

    const context = { document: {}, navigator: {}, console };
    context.window = context;
    context.globalThis = context;
    vm.runInNewContext(diagnosticsSource, context, { filename: 'heys_client_diagnostics_v1.js' });
    const baseFilters = { range: '24h', clientId: '', search: '', status: 'all', device: '', mode: '', build: '', stage: '', sort: 'problems' };

    expect(context.HEYS.ClientDiagnostics._test.buildOverviewParams(baseFilters, null).p_include_nonproduction).toBeUndefined();
    expect(context.HEYS.ClientDiagnostics._test.buildOverviewParams({ ...baseFilters, includeNonProduction: true }, null).p_include_nonproduction).toBe(true);
    expect(context.HEYS.ClientDiagnostics._test.buildDailyProblemsParams(null, new Date('2026-07-25T12:00:00Z')).p_include_nonproduction).toBeUndefined();
    expect(context.HEYS.ClientDiagnostics._test.buildDailyProblemsParams(null, new Date('2026-07-25T12:00:00Z'), true).p_include_nonproduction).toBe(true);
    expect(diagnosticsSource).toContain('Включая локальные тесты');
  });

  it('keeps unnamed console warnings from degrading a ready visit', () => {
    expect(runtimeEnvMigrationSource).toContain("level = 'error' OR (event_name IS NOT NULL AND (level = 'warn' OR event_status IN ('degraded', 'timeout', 'failed')))");
    expect(runtimeEnvMigrationSource).toContain("count(*) FILTER (WHERE event_name IS NOT NULL AND (level = 'warn' OR event_status IN ('degraded', 'timeout')))");
    expect(runtimeEnvMigrationSource).toContain("'pin_success'::text AS last_success_event");
    expect(runtimeEnvMigrationSource).toContain("'production'::text AS runtime_env");
  });

  it('forces server-side identity and idempotent inserts', () => {
    expect(restSource).toContain('resolveTelemetryIdentity(event, client, claimedClientId)');
    expect(restSource).toContain("return { clientId: null, actorRole: 'anonymous', trustLevel: 'anonymous' }");
    expect(restSource).toContain('ON CONFLICT DO NOTHING');
    expect(restSource).toContain("identity.actorRole === 'anonymous' && row?.event_id");
    expect(restSource).toContain('structuredAccepted: identity.actorRole !== \'anonymous\'');
    expect(restSource).toContain("'event_id', 'boot_id', 'visit_id'");
  });

  it('redacts bearer tokens and restricts curator diagnostics by ownership', () => {
    expect(migrationSource).toContain("SET meta = meta - 'session_id'");
    expect(migrationSource).toContain("jsonb_build_object('session_record_id', v_session_record_id)");
    expect(migrationSource).toContain('WHERE id = p_client_id AND curator_id = p_curator_id');
    expect(migrationSource).not.toContain("jsonb_build_object('session_id', v_session_token)");
  });

  it('keeps raw console messages out of curator diagnostics', () => {
    expect(migrationSource).not.toMatch(/'message',\s*t\.message/);
    expect(diagnosticsSource).toContain('Скопировать отчёт');
    expect(diagnosticsSource).toContain('Только проблемы');
  });

  it('provides one curator-only aggregate RPC with ownership, filters, audit and cursor pagination', () => {
    const overviewSql = migrationSource.split('CREATE OR REPLACE FUNCTION public.get_curator_observability_overview')[1]
      .split('-- Stop writing raw bearer tokens')[0];
    expect(overviewSql).toContain('c.curator_id = p_curator_id');
    expect(overviewSql).toContain("now() - interval '30 days'");
    expect(overviewSql).toContain('v_limit := least');
    expect(overviewSql).toContain('p_cursor_started_at');
    expect(overviewSql).toContain("'get_curator_observability_overview'");
    expect(overviewSql).toContain('public.log_data_access');
    expect(overviewSql).not.toMatch(/'message',\s*t\.message/);
    expect(overviewSql).not.toContain("'ip_address'");
    expect(rpcSource).toContain("'get_curator_observability_overview'");
  });

  it('adds the all-client diagnostics tab with server filters and safe reports', () => {
    // Вкладка заведена рядом с остальными и переключается общим обработчиком
    // ряда. Прежде проверка искала `setCuratorTab('diagnostics')`, сетку
    // `repeat(4, minmax(0, 1fr))` и подпись «◉ Диагн.»: ряд собирался четырьмя
    // отдельными кнопками в сетке на четыре колонки при пяти вкладках, и
    // «Диагн.» переносилась вниз. Ряд стал списком с общим onClick, сетка —
    // флексом .cur-cab__tabs, значок из подписи ушёл вместе с остальными.
    expect(gateSource).toContain("{ key: 'diagnostics', label: 'Диагн.' }");
    expect(gateSource).toContain('setCuratorTab(tab.key)');
    expect(gateSource).toContain('HEYS.ClientDiagnostics.Overview');
    expect(diagnosticsSource).toContain("HEYS.YandexAPI.rpc('get_curator_observability_overview'");
    expect(diagnosticsSource).toContain('Показать сбои');
    // Период обновления назван строкой листа «ключ — значение», а не одной
    // фразой «Автообновление 60 сек»: ключ слева, значение справа.
    expect(diagnosticsSource).toContain("'Автообновление'");
    expect(diagnosticsSource).toContain("'каждые 60 с'");
    expect(diagnosticsSource).toContain('p_problem_stage');
    expect(diagnosticsSource).toContain('p_cursor_started_at');
  });

  it('unwraps scalar JSON RPC responses before rendering dashboard totals', () => {
    const context = { document: {}, navigator: {}, console };
    context.window = context;
    context.globalThis = context;
    vm.runInNewContext(diagnosticsSource, context, { filename: 'heys_client_diagnostics_v1.js' });

    const payload = { summary: { launches: 2, active_clients: 2 }, sessions: [{ boot_id: 'boot-1' }] };
    const wrapped = { data: { get_curator_observability_overview: payload }, error: null };
    const direct = { data: payload, error: null };

    expect(context.HEYS.ClientDiagnostics._test.unwrapRpcPayload(wrapped, 'get_curator_observability_overview')).toBe(payload);
    expect(context.HEYS.ClientDiagnostics._test.unwrapRpcPayload(direct, 'get_curator_observability_overview')).toBe(payload);
  });

  it('copies a complete structured failure report without private context fields', () => {
    const context = { document: {}, navigator: {}, console };
    context.window = context;
    context.globalThis = context;
    vm.runInNewContext(diagnosticsSource, context, { filename: 'heys_client_diagnostics_v1.js' });

    const report = context.HEYS.ClientDiagnostics._test.sessionDebugReport('Полтавский', 'client-1', {
      boot_id: 'boot-1', outcome: 'degraded', problem_stage: 'warning', problem_event: null,
      last_success_event: 'boot_ready', started_at: '2026-07-24T11:24:44Z', last_event_at: '2026-07-24T11:25:56Z',
      duration_ms: 72000, build_id: 'abc123', device_id: 'device-1', device_class: 'mobile', os_name: 'Android',
      browser_name: 'Chrome', display_mode: 'standalone', event_count: 9, error_count: 1, warning_count: 0,
      initial_sync_completed: true,
      events: [{ at: '2026-07-24T11:24:44Z', name: 'boot_ready', status: 'ready', level: 'info', source: 'bootstrap', duration_ms: 800,
        context: { phase: 'ready', online: true, token: 'secret-token', phone: '+79990000000', body: 'private diary text' } }],
    });

    expect(report).toContain('HEYS — полный безопасный лог сбоя');
    expect(report).toContain('boot_id: boot-1');
    expect(report).toContain('build_id: abc123');
    expect(report).toContain('source=bootstrap');
    expect(report).toContain('"phase":"ready"');
    expect(report).not.toContain('secret-token');
    expect(report).not.toContain('+79990000000');
    expect(report).not.toContain('private diary text');
    expect(diagnosticsSource).toContain('Скопировать полный лог');
  });

  it('reconnects the curator inbox after a stale pooled database connection', () => {
    const inboxBlock = messagesSource.split('async function handleInbox')[1].split('async function handleMarkRead')[0];
    expect(messagesSource).toContain("const { getPool, acquireHealthyClient } = require('./shared/db-pool')");
    expect(inboxBlock).toContain('await acquireHealthyClient()');
    expect(inboxBlock).not.toContain('pool.connect()');
  });

  it('keeps raw dependency errors degraded after boot_ready instead of reporting a fatal launch', () => {
    expect(classificationSource).toContain("event_name IN ('boot_failed', 'app_runtime_failed')");
    expect(classificationSource).toContain("event_name IS NOT NULL AND event_status = 'failed'");
    expect(classificationSource).toContain("WHEN bool_or(event_name = 'boot_ready') THEN");
    expect(classificationSource).toContain("level IN ('warn', 'error')");
    expect(classificationSource).not.toContain("event_status = 'failed' OR level = 'error') THEN 'failed'");
    expect(classificationSource).toContain("bool_or(event_name = 'boot_started')");
    expect(classificationSource).toContain("AND bool_or(event_name IS NOT NULL)");
    expect(classificationSource).toContain("event_name IN ('initial_sync_ready', 'sync_cycle_completed')");
    expect(classificationSource).toContain("event_status IN ('degraded', 'timeout', 'failed')");
    expect(classificationSource).toContain("build_id IS NOT NULL AND build_id <> 'unknown'");
  });

  it('keeps foreground visits separate from immutable page-load boots in curator diagnostics', () => {
    expect(visitMigrationSource).toContain('ADD COLUMN IF NOT EXISTS visit_id text');
    expect(visitMigrationSource).toContain('COALESCE(t.visit_id, t.boot_id) AS effective_visit_id');
    expect(visitMigrationSource).toContain("event_context->>'visit_kind' = 'resume'");
    expect(visitMigrationSource).toContain("'visit_id', s.visit_id");
    expect(visitMigrationSource).toContain('COALESCE(t.visit_id, t.boot_id) = s.visit_id');
    expect(diagnosticsSource).toContain("if (kind === 'resume')");
    expect(diagnosticsSource).toContain("if (kind === 'client_entry')");
    expect(diagnosticsSource).toContain("'visit_id: ' + (session.visit_id || 'unknown')");
  });

  it('keeps routine EWS insufficiency visible without degrading a ready visit', () => {
    expect(runtimeEnvMigrationSource).toContain("event_name IS DISTINCT FROM 'ews_input_insufficient'");
    expect(classificationSource).toContain("event_name IS DISTINCT FROM 'ews_input_insufficient'");
    expect(runtimeEnvMigrationSource).toMatch(/count\(\*\) FILTER \(WHERE event_name IS NOT NULL AND \(level = 'warn' OR event_status IN \('degraded', 'timeout'\)\)\)/);
    expect(runtimeEnvMigrationSource).toMatch(/array_agg\(event_name[\s\S]*level IN \('warn', 'error'\)[\s\S]*AS problem_event/);
  });

  it('keeps curator cookies off client-session gamification RPCs', () => {
    expect(gamificationSource).toContain('function hasCuratorAuditContext(context = {})');
    expect(gamificationSource).toMatch(/function hasCookieSessionCarrier\(\)[\s\S]*getCuratorToken\?\.\(\)[\s\S]*hasCuratorAuditContext\(\{ curatorToken \}\)[\s\S]*return false;[\s\S]*heys_pin_cookie_session_hint/);
    expect(gamificationSource).not.toMatch(/function hasCookieSessionCarrier\(\)[\s\S]{0,700}heys_curator_cookie_session_hint/);
    expect(gamificationSource).toMatch(/const auditContext = getAuditContext\(\);[\s\S]*const isCuratorSession = hasCuratorAuditContext\(auditContext\);[\s\S]*const canUseCurator = isCuratorSession && clientId;/);
  });

  it('records aggregate sync and write lifecycle events without raw storage values', () => {
    ['sync_cycle_started', 'sync_cycle_completed', 'sync_cycle_failed', 'sync_recovered', 'write_queued', 'write_uploaded', 'write_failed']
      .forEach((eventName) => expect(storageSource).toContain(`'${eventName}'`));
    expect(storageSource).toContain('observabilityKeyGroup');
    expect(storageSource).toContain('observabilityWriteContext');
    expect(storageSource).toContain('observabilityErrorCode');
    expect(storageSource).toContain("key_id: `k_${observabilityFingerprint(keys.join('|') || 'none')}`");
    expect(storageSource).toContain('count: failedUploadItems.length, ...failedWriteContext');
    expect(storageSource).toContain("return 'diary'");
    expect(loggerSource).toContain('key_group: 1, key_family: 1, key_id: 1, error_code: 1');
    expect(restSource).toContain("'count', 'queue_size', 'key_group', 'key_family', 'key_id', 'error_code', 'problem_stage'");
    expect(diagnosticsSource).toContain("'key_group', 'key_family', 'key_id', 'error_code'");
    expect(ewsSource).toContain("event: 'ews_input_insufficient'");
    expect(ewsSource).toContain("HEYS.LogTrace?.event?.('write_failed'");
    expect(ewsSource).toContain("key_group: 'ews_weekly'");
    expect(ewsSource).toContain("key_family: 'ews'");
    expect(ewsSource).toContain("error_code: 'cloud_save_timeout'");
    expect(storageSource).toContain("event: 'initial_sync_fallback_wait'");
  });

  it('covers the user-visible overlays and update lifecycle with stable events', () => {
    expect(checkinSource).toContain("traceMorningCheckin('step_shown'");
    expect(hungerSource).toContain("traceHungerUi('hunger_prompt_shown'");
    expect(hungerSource).toContain("traceHungerUi('hunger_prompt_submitted'");
    expect(whatsNewSource).toContain("HEYS.LogTrace?.event?.('whats_new_acknowledged'");
    expect(curatorChangesSource).toContain("HEYS.LogTrace?.event?.('curator_changes_shown'");
    expect(swSource).toContain("reloading: 'sw_reload_requested'");
    expect(swSource).toContain("HEYS.LogTrace?.event?.('sw_reload_suppressed'");
    expect(hungerSource).toContain("activeTelemetryOpen, 'info'");
  });
});
