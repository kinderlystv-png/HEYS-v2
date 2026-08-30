import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const webRoot = path.resolve(__dirname, '..');
const diagnosticsSource = fs.readFileSync(path.join(webRoot, 'heys_client_diagnostics_v1.js'), 'utf8');

function loadDiagnostics() {
  const context = { document: {}, navigator: {}, console, setTimeout, clearTimeout };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(diagnosticsSource, context, { filename: 'heys_client_diagnostics_v1.js' });
  return context.HEYS.ClientDiagnostics._test;
}

function session(overrides = {}) {
  return {
    client_id: 'client-1',
    client_name: 'Александра',
    visit_id: 'visit-1',
    boot_id: 'boot-1',
    visit_kind: 'cold_start',
    outcome: 'degraded',
    problem_stage: 'warning',
    problem_event: 'initial_sync_fallback_wait',
    last_success_event: 'boot_ready',
    started_at: '2026-07-24T06:00:00.000Z',
    last_event_at: '2026-07-24T06:00:05.000Z',
    duration_ms: 5000,
    build_id: 'abc123',
    device_id: 'device-1',
    device_class: 'mobile',
    os_name: 'iOS',
    browser_name: 'Safari',
    display_mode: 'standalone',
    event_count: 2,
    error_count: 0,
    warning_count: 1,
    initial_sync_completed: true,
    events: [],
    ...overrides,
  };
}

describe('curator daily diagnostics megalog', () => {
  let api;

  beforeEach(() => {
    api = loadDiagnostics();
  });

  it('queries every client problem from local midnight with the maximum RPC page size', () => {
    const now = new Date('2026-07-24T12:34:56.000Z');
    const expectedStart = new Date(now);
    expectedStart.setHours(0, 0, 0, 0);
    const params = api.buildDailyProblemsParams(null, now);

    expect(params.p_since).toBe(expectedStart.toISOString());
    expect(Array.from(params.p_statuses)).toEqual(['failed', 'degraded', 'abandoned']);
    expect(params.p_limit).toBe(100);
    expect(params.p_client_id).toBeNull();
    expect(params.p_search).toBeNull();
  });

  it('walks all cursor pages, deduplicates visits and returns chronological history', async () => {
    const newer = session({ visit_id: 'visit-new', started_at: '2026-07-24T10:00:00.000Z' });
    const older = session({ visit_id: 'visit-old', started_at: '2026-07-24T08:00:00.000Z' });
    const cursor = { started_at: newer.started_at, boot_id: newer.visit_id };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { get_curator_observability_overview: { generated_at: '2026-07-24T12:00:00.000Z', sessions: [newer], has_more: true, next_cursor: cursor } } })
      .mockResolvedValueOnce({ data: { get_curator_observability_overview: { sessions: [newer, older], has_more: false, next_cursor: null } } });

    const result = await api.fetchAllDailyProblemVisits(rpc, new Date('2026-07-24T12:00:00.000Z'));

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1].p_cursor_boot_id).toBe('visit-new');
    expect(Array.from(result.sessions, (row) => row.visit_id)).toEqual(['visit-old', 'visit-new']);
  });

  it('fails instead of silently copying a partial report when pagination is broken', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { get_curator_observability_overview: { sessions: [session()], has_more: true, next_cursor: null } },
    });

    await expect(api.fetchAllDailyProblemVisits(rpc, new Date())).rejects.toThrow('observability_cursor_missing');
  });

  it('includes aggregate dynamics and every safe event without shortening', () => {
    const events = Array.from({ length: 120 }, (_, index) => ({
      at: new Date(Date.UTC(2026, 6, 24, 6, 0, index)).toISOString(),
      name: `diagnostic_event_${index + 1}`,
      status: index === 119 ? 'degraded' : 'ok',
      level: index === 119 ? 'warn' : 'info',
      source: 'test',
      duration_ms: index,
      context: { reason: `safe_reason_${index + 1}` },
    }));
    const report = api.dailyMegaLogReport({
      since: '2026-07-23T21:00:00.000Z',
      generated_at: '2026-07-24T12:00:00.000Z',
      sessions: [session({ event_count: events.length, events })],
    });

    expect(report).toContain('Динамика по часам:');
    expect(report).toContain('Клиентов с проблемами: 1');
    expect(report).toContain('diagnostic_event_1');
    expect(report).toContain('diagnostic_event_120');
    expect(report).toContain('safe_reason_120');
    expect(report).not.toContain('…[truncated]');
  });

  it('explains redacted raw errors instead of reporting an undefined problem', () => {
    const report = api.dailyMegaLogReport({
      since: '2026-07-23T21:00:00.000Z',
      generated_at: '2026-07-24T12:00:00.000Z',
      sessions: [session({ problem_event: null, error_count: 3, events: [] })],
    });

    expect(report).toContain('Скрытая системная ошибка: 1');
    expect(report).toContain('Проблемное событие: unstructured_console_error');
    expect(report).toContain('Скрытые системные ошибки: 3.');
    expect(report).not.toContain('Проблемное событие: не определено');
  });

  it('places the independent megalog action above the filters', () => {
    const actionIndex = diagnosticsSource.indexOf("h('div', { className: 'cdo-megalog' }");
    const filtersIndex = diagnosticsSource.indexOf("h('div', { className: 'cdo-filters' }");
    expect(actionIndex).toBeGreaterThan(0);
    expect(actionIndex).toBeLessThan(filtersIndex);
    // Кнопка называет объём, а не механику: «Скопировать сбои за день» против
    // прежнего «Скопировать мегалог проблем за сегодня» — длинная фраза ломалась
    // в кнопке на три строки, и слово «мегалог» знает только разработчик.
    // Проверяем, что действие осталось отдельным от «Скопировать отчёт»: тот
    // берёт текущий фильтр, это — все сбои за день.
    expect(diagnosticsSource).toContain("'Скопировать сбои за день'");
    expect(diagnosticsSource).toContain('fetchAllDailyProblemVisits');
  });
});
