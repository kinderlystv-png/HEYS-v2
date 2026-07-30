import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const migrationSource = fs.readFileSync(
  path.join(repoRoot, 'scripts/db/migrations/2026-07-30_client_observability_ignore_preauth_resume.sql'),
  'utf8',
);
const apiSource = fs.readFileSync(path.join(repoRoot, 'apps/web/heys_yandex_api_v1.js'), 'utf8');
const ewsSource = fs.readFileSync(path.join(repoRoot, 'apps/web/insights/pi_early_warning.js'), 'utf8');

describe('client observability signal quality', () => {
  it('keeps routine dismissal and transient fallback signals out of degraded visits', () => {
    expect(migrationSource).toContain("event_name IS DISTINCT FROM 'hunger_prompt_dismissed'");
    expect(migrationSource).toContain("event_name IS DISTINCT FROM 'initial_sync_fallback_wait'");
  });

  it('neutralizes a blank-screen timeout only when a visible overlay was recorded first', () => {
    expect(migrationSource).toContain("event_name IN ('hunger_prompt_shown', 'step_shown')");
    expect(migrationSource).toContain('visible_overlay_at <= s.blank_guard_at');
    expect(migrationSource).toContain("event_name = 'blank_screen_guard_triggered' AND visible_overlay_before_blank_guard");
    expect(migrationSource).toContain("event_name IN ('boot_failed', 'app_runtime_failed')");
    expect(migrationSource).toContain("event_name IN ('boot_failed', 'app_runtime_failed', 'sync_cycle_failed', 'write_failed')");
  });

  it('records intermediate API retries as warnings and keeps the final attempt fatal', () => {
    expect(apiSource).toContain('if (i < retries)');
    expect(apiSource).toContain("console.warn('[HEYS.api] ⚠️'");
    expect(apiSource).toContain('err(`Attempt ${i + 1}/${retries + 1} failed');
    expect(migrationSource).toContain("v.message ~ '^\\[HEYS\\.api\\] .*Attempt [12]/3 failed'");
    expect(migrationSource).toContain("level = 'error' AND NOT transient_api_retry");
  });

  it('turns the weekly EWS cloud timeout into a named non-fatal write deviation', () => {
    expect(ewsSource).toContain("HEYS.LogTrace?.event?.('write_failed'");
    expect(ewsSource).toContain("reason: 'cloud_save_timeout'");
    expect(ewsSource).toContain("key_group: 'ews_weekly'");
    expect(ewsSource).toContain("key_family: 'ews'");
    expect(ewsSource).toContain("key_id: 'k_ews_weekly'");
    expect(ewsSource).toContain("error_code: 'cloud_save_timeout'");
    expect(ewsSource).toContain("status: 'degraded'");
    expect(ewsSource).toContain("console.warn('ews / weekly ☁️ save.cloud.timeout: local cache retained')");
    expect(migrationSource).toContain("THEN 'write_failed' END");
    expect(migrationSource).toContain("message ~* '^ews / weekly .*save\\.cloud\\.error:.*Cloud save timeout'");
  });

  it('excludes only stale pre-auth resume-only traces from visit metrics', () => {
    expect(migrationSource).toContain("event_context->>'visit_kind' = 'resume'");
    expect(migrationSource).toContain("event_name = 'app_foregrounded'");
    expect(migrationSource).toContain("event_context->>'auth_state' = 'pending'");
    expect(migrationSource).toContain("event_name NOT IN ('visit_started', 'app_foregrounded')");
    expect(migrationSource).toContain("event_name IN ('boot_failed', 'app_runtime_failed', 'sync_cycle_failed', 'write_failed')");
    expect(migrationSource).toContain("THEN 'ignored'");
    expect(migrationSource).toContain("SELECT * FROM traced_visits WHERE outcome <> 'ignored'");
    expect(migrationSource.indexOf("THEN 'ignored'")).toBeLessThan(migrationSource.indexOf("THEN 'abandoned'"));
  });
});
