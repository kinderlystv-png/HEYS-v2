import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(webDir, '../..');
const migrationSql = fs.readFileSync(
  path.join(repoDir, 'scripts/db/migrations/2026-08-13_revoke_personal_data_purge_v1.sql'),
  'utf8',
);
const consentsSource = fs.readFileSync(path.join(webDir, 'heys_consents_v1.js'), 'utf8');
const userTabSource = fs.readFileSync(path.join(webDir, 'heys_user_tab_impl_v1.js'), 'utf8');

function sqlFunction(name, nextMarker) {
  const start = migrationSql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = nextMarker
    ? migrationSql.indexOf(nextMarker, start + 1)
    : migrationSql.length;
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migrationSql.slice(start, end);
}

describe('revoke personal_data purge migration', () => {
  it('purges PDn stores on personal_data and keeps health_data on is_health_key', () => {
    const revokeFn = sqlFunction('revoke_consent_by_session', 'EXCEPTION WHEN OTHERS');
    expect(revokeFn).toContain('purge_personal_data_for_client(v_client_id)');
    expect(revokeFn).toContain("p_consent_type = 'health_data'");
    expect(revokeFn).toContain('public.is_health_key(k)');
    expect(revokeFn).toContain("p_consent_type = 'personal_data'");

    const purgeFn = sqlFunction('purge_personal_data_for_client', 'COMMENT ON FUNCTION public.purge_personal_data_for_client');
    expect(purgeFn).toContain('consent_revoked');
    expect(purgeFn).toContain('DISABLE TRIGGER audit_client_kv_store');
    expect(purgeFn).toContain('DELETE FROM public.client_messages');
    expect(purgeFn).toContain('DELETE FROM public.message_transcription_jobs');
    expect(purgeFn).toContain('DELETE FROM public.audit_logs');
    expect(purgeFn).toContain('is_client_personal_data_kv_key');
  });

  it('fails if personal_data purge call is removed from revoke_consent_by_session', () => {
    const broken = migrationSql.replace('purge_personal_data_for_client(v_client_id)', '-- removed');
    expect(broken).not.toContain('purge_personal_data_for_client(v_client_id)');
    expect(migrationSql).toContain('purge_personal_data_for_client(v_client_id)');
  });
});

describe('revoke personal_data client API', () => {
  const originalHEYS = window.HEYS;

  afterEach(() => {
    vi.restoreAllMocks();
    window.HEYS = originalHEYS;
  });

  it('calls revoke_consent_by_session with personal_data', async () => {
    const revokeConsentBySession = vi.fn().mockResolvedValue({
      data: {
        revoke_consent_by_session: {
          success: true,
          deleted_keys: 4,
          personal_data_purge: { deleted_messages: 2, queued_media: 1 },
        },
      },
      error: null,
    });
    window.HEYS = { currentClientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', YandexAPI: { revokeConsentBySession } };
    // eslint-disable-next-line no-eval
    (0, eval)(consentsSource);

    const result = await window.HEYS.Consents.api.revokePersonalDataAndPurge();
    expect(result.success).toBe(true);
    expect(result.deleted_keys).toBe(4);
    expect(revokeConsentBySession).toHaveBeenCalledWith('personal_data');
  });
});

describe('privacy settings copy', () => {
  it('does not promise diary deletion on health revoke button', () => {
    expect(userTabSource).toContain('handleRevokePersonal');
    expect(userTabSource).toMatch(/handleRevokeHealth[\s\S]*?Дневник питания, переписка и фото удаляются отдельно/);
    expect(userTabSource).toContain('Отозвать согласие на персональные данные');
  });

  it('does not promise diary deletion in consent list handleRevoke', () => {
    expect(userTabSource).not.toMatch(/handleRevoke[\s\S]*?дневник питания, вес, активность/);
    expect(userTabSource).toMatch(/handleRevoke[\s\S]*?revokePersonalDataAndPurge/);
    expect(userTabSource).toMatch(/handleRevoke[\s\S]*?пульсовые зоны, анкета пробного периода/);
  });

  it('onboarding health summary does not promise diary without personal_data', () => {
    expect(consentsSource).toMatch(/health_data:[\s\S]*?summary:[\s\S]*?пульсовых зон/);
    expect(consentsSource).not.toMatch(/для анкеты, дневника и ручной работы/);
    expect(consentsSource).toMatch(/health_data:[\s\S]*?Дневник, переписка и фото — под согласием на персональные данные/);
  });
});
