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
const gateSource = fs.readFileSync(path.join(webRoot, 'heys_app_gate_flow_v1.js'), 'utf8');
const rpcSource = fs.readFileSync(path.join(repoRoot, 'yandex-cloud-functions/heys-api-rpc/index.js'), 'utf8');

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function createLoggerRuntime() {
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
      scripts: [{ src: 'https://app.heyslab.ru/boot-app.abc123ef.js' }],
      visibilityState: 'visible',
      addEventListener: vi.fn(),
    },
    fetch: vi.fn((url, options) => {
      requests.push({ url, options });
      return Promise.resolve({ ok: true });
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
  return { context, requests, localStorage };
}

describe('client session observability', () => {
  it('emits a structured iPhone/PWA event and strips non-allowlisted context', async () => {
    const { context, requests } = createLoggerRuntime();

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

  it('forces server-side identity and idempotent inserts', () => {
    expect(restSource).toContain('resolveTelemetryIdentity(event, client, claimedClientId)');
    expect(restSource).toContain("return { clientId: null, actorRole: 'anonymous', trustLevel: 'anonymous' }");
    expect(restSource).toContain('ON CONFLICT DO NOTHING');
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

  it('records aggregate sync and write lifecycle events without raw storage values', () => {
    ['sync_cycle_started', 'sync_cycle_completed', 'sync_cycle_failed', 'sync_recovered', 'write_queued', 'write_uploaded', 'write_failed']
      .forEach((eventName) => expect(storageSource).toContain(`'${eventName}'`));
    expect(storageSource).toContain('observabilityKeyGroup');
    expect(storageSource).toContain("return 'diary'");
    expect(loggerSource).toContain('key_group: 1');
    expect(restSource).toContain("'count', 'queue_size', 'key_group', 'problem_stage'");
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
