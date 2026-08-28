import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const PROFILE_SRC = read('apps/web/heys_profile_step_v1.js');
const RPC_SRC = read('yandex-cloud-functions/heys-api-rpc/index.js');
const MIGRATION_SRC = read('scripts/db/migrations/2026-08-28_registration_server_norms.sql');
const MIGRATION_MANIFEST = JSON.parse(read('scripts/db/migrations/manifest.json'));

describe('registration server norms contract', () => {
  it('removes the client formula and completes only after server norms', () => {
    expect(PROFILE_SRC).not.toContain('calcNormsFromGoal');
    expect(PROFILE_SRC).toContain("api.rpc('calculate_registration_norms_by_session', params)");

    const confirmStart = PROFILE_SRC.indexOf('async function confirmProfileCloudSave');
    const confirmEnd = PROFILE_SRC.indexOf('function readDayDataScoped', confirmStart);
    const confirmBlock = PROFILE_SRC.slice(confirmStart, confirmEnd);
    expect(confirmBlock.indexOf('await fetchRegistrationNormsFromServer(expectedProfile)'))
      .toBeLessThan(confirmBlock.indexOf("localStorage.removeItem('heys_registration_in_progress')"));
    expect(confirmBlock.indexOf('await fetchRegistrationNormsFromServer(expectedProfile)'))
      .toBeLessThan(confirmBlock.indexOf("HEYS.feedback?.emit?.('registration.done')"));
  });

  it('exposes only the session-safe RPC with an explicit text parameter', () => {
    expect(RPC_SRC).toContain("'calculate_registration_norms_by_session', // Server-owned initial nutrition norms");
    expect(RPC_SRC).toMatch(
      /'calculate_registration_norms_by_session':\s*\{\s*'p_session_token':\s*'::text'\s*\}/,
    );
  });

  it('calculates from the stored profile and persists through the existing KV gate', () => {
    expect(MIGRATION_SRC).toContain("kv.k = 'heys_profile'");
    expect(MIGRATION_SRC).toContain("v_profile->>'deficitPctTarget'");
    expect(MIGRATION_SRC).toContain("v_profile->>'gender' = 'Женский'");
    expect(MIGRATION_SRC).toContain("v_profile->>'age'");
    expect(MIGRATION_SRC).toContain("public.upsert_client_kv_by_session(");
    expect(MIGRATION_SRC).toContain("'heys_norms'");
    expect(MIGRATION_SRC).toContain("'source', 'registration-server'");
    expect(MIGRATION_SRC).toContain('REVOKE ALL ON FUNCTION public.calculate_registration_norms_by_session(text) FROM PUBLIC');
  });

  it('registers the migration in the canonical ledger', () => {
    expect(MIGRATION_MANIFEST.migrations.at(-1)).toMatchObject({
      id: '2026-08-28_registration_server_norms',
      order: 32,
      path: 'scripts/db/migrations/2026-08-28_registration_server_norms.sql',
      destructive: false,
    });
  });
});
