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
  const localStorage = storage();
  const sessionStorage = storage();
  const context = {
    console: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    location: { hostname: 'app.heyslab.ru', href: 'https://app.heyslab.ru/' },
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Version/18.5 Mobile Safari/604.1', onLine: true, standalone: true },
    localStorage,
    sessionStorage,
    document: {
      scripts: options.scripts || [{ src: 'https://app.heyslab.ru/boot-app.bundle.abc123ef.js' }],
      visibilityState: 'visible',
      addEventListener: vi.fn(),
    },
    fetch: vi.fn((url, options) => {
      requests.push({ url, options });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ structuredAccepted: true }) });
    }),
    Blob,
    crypto: { randomUUID: () => '123e4567-e89b-42d3-a456-426614174000' },
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
  return { context, requests, localStorage, listeners };
}

describe('client session observability', () => {
  it('emits a structured iPhone/PWA event and strips non-allowlisted context', async () => {
    const { context, requests } = createLoggerRuntime();
    context.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';

    context.HEYS.LogTrace.event('whats_new_shown', {
      source: 'whats_new',
      release_version: '2026.07.24.abc123ef',
      unseen_count: 2,
      hungerLevel: 9,
      phone: '+79990000000',
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
    });
    expect(JSON.stringify(event.event_context)).not.toContain('79990000000');
    expect(event.event_context).not.toHaveProperty('hungerLevel');
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

  it('forces server-side identity and idempotent inserts', () => {
    expect(restSource).toContain('resolveTelemetryIdentity(event, client, claimedClientId)');
    expect(restSource).toContain("return { clientId: null, actorRole: 'anonymous', trustLevel: 'anonymous' }");
    expect(restSource).toContain('ON CONFLICT DO NOTHING');
    expect(restSource).toContain("identity.actorRole === 'anonymous' && row?.event_id");
    expect(restSource).toContain('structuredAccepted: identity.actorRole !== \'anonymous\'');
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
    expect(gateSource).toContain("setCuratorTab('diagnostics')");
    expect(gateSource).toContain('HEYS.ClientDiagnostics.Overview');
    expect(gateSource).toContain("gridTemplateColumns: 'repeat(4, minmax(0, 1fr))'");
    expect(gateSource).toContain("'◉ Диагн.'");
    expect(diagnosticsSource).toContain("HEYS.YandexAPI.rpc('get_curator_observability_overview'");
    expect(diagnosticsSource).toContain('Показать сбои');
    expect(diagnosticsSource).toContain('Автообновление 60 сек');
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
    expect(storageSource).toContain("return 'diary'");
    expect(loggerSource).toContain('key_group: 1');
    expect(restSource).toContain("'count', 'queue_size', 'key_group', 'problem_stage', 'days_received', 'min_required'");
    expect(ewsSource).toContain("event: 'ews_input_insufficient'");
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
  });
});
