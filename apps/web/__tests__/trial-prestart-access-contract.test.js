import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

const migration = read('../../../scripts/db/migrations/2026-07-30_trial_prestart_access_v1.sql');
const rpcGateway = read('../../../yandex-cloud-functions/heys-api-rpc/index.js');
const gateFlow = read('../heys_app_gate_flow_v1.js');
const overlays = read('../heys_app_overlays_v1.js');
const morningCheckin = read('../heys_morning_checkin_v1.js');
const queue = read('../heys_trial_queue_v1.js');

describe('trial prestart access contract', () => {
  it('keeps pre-trial storage profile-only and revokes both PIN self-start functions', () => {
    const accessFunction = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.client_kv_value_can_write'),
      migration.indexOf('REVOKE ALL ON FUNCTION public.start_trial_by_session'),
    );

    expect(accessFunction).toContain('public.subscription_can_write(p_client_id)');
    expect(accessFunction).toContain('public.is_always_writable_key(p_key)');
    expect(accessFunction).not.toContain('public.is_dayv2_key');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.start_trial_by_session(text, integer) FROM heys_rpc',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.activate_trial_timer_by_session(text, integer) FROM heys_rpc',
    );
  });

  it('does not expose PIN self-start through the client RPC allowlist', () => {
    const clientAllowlist = rpcGateway.slice(
      rpcGateway.indexOf('const ALLOWED_FUNCTIONS = ['),
      rpcGateway.indexOf('const CURATOR_ONLY_FUNCTIONS = ['),
    );
    expect(clientAllowlist).not.toContain("'start_trial_by_session'");
    expect(clientAllowlist).not.toContain("'activate_trial_timer_by_session'");
    expect(rpcGateway).toContain("'admin_activate_trial'");
  });

  it('blocks the app until the curator assigns or starts the trial', () => {
    expect(gateFlow).toContain("key: 'subscription-waiting'");
    expect(gateFlow).toContain('Аккаунт готов');
    expect(gateFlow).toContain('Куратор ещё не назначил дату начала пробной недели');
    expect(gateFlow).toContain('В этот день откроются чек-ин и дневник');
    expect(overlays).toContain("['trial-intake', 'subscription-loading', 'subscription-waiting']");
    expect(morningCheckin).toContain('if (!canUseDailyFlow) return steps');
    expect(morningCheckin).toContain('isProfileOnlyRegistration');
  });

  it('keeps trial activation only in curator subscription management', () => {
    expect(queue).toContain("api.rpc('admin_activate_trial', params)");
    expect(queue).not.toContain('ДИАЛОГ: Активация триала');
    expect(queue).not.toContain('onClick: () => handleActivateTrial(');
    expect(gateFlow).toContain('function ClientSubscriptionButton');
    expect(gateFlow).toContain('Назначьте дату старта');
  });
});
