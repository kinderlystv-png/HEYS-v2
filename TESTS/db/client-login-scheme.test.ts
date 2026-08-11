/**
 * Свойства схемы входа v2 (prompt-login-server).
 * Один round-trip на свойство — как pin-lockout.test.ts.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

import { runSql, runSqlBlock } from './_helpers';

const PHONE = '79995550211';
const DEVICE_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ONETIME_A = '5829';
const ONETIME_B = '9012';
const ACCESS_CODE = '7394';
const LEGACY_PIN = '4731';
const WEAK_CODE = '1234';

function fnExists(name: string): boolean {
  const r = runSql(
    `SELECT 1 FROM pg_proc WHERE proname = '${name}' AND pronamespace = 'public'::regnamespace`
  );
  return r.success && r.output.includes('(1 строка)');
}

function purge() {
  return `
    DELETE FROM public.client_auth_push_queue
     WHERE client_id IN (SELECT id FROM public.clients WHERE phone = '+${PHONE}');
    DELETE FROM public.client_devices
     WHERE client_id IN (SELECT id FROM public.clients WHERE phone = '+${PHONE}');
    DELETE FROM public.client_sessions
     WHERE client_id IN (SELECT id FROM public.clients WHERE phone = '+${PHONE}');
    DELETE FROM public.consents
     WHERE client_id IN (SELECT id FROM public.clients WHERE phone = '+${PHONE}');
    DELETE FROM public.clients WHERE phone = '+${PHONE}';
  `;
}

let schemeReady = false;

beforeAll(() => {
  schemeReady = fnExists('verify_client_onetime_pin') && fnExists('login_client_v1');
});

afterEach(() => {
  runSqlBlock(purge());
});

describe('client login scheme — свойства', () => {
  it('одноразовый PIN не срабатывает второй раз', () => {
    if (!schemeReady) return;

    const out = runSqlBlock(`
      ${purge()}
      INSERT INTO public.clients (id, curator_id, name, phone)
      SELECT gen_random_uuid(), c.id, 'props', '+${PHONE}' FROM public.curators c LIMIT 1;

      SELECT 'first' AS marker,
             public.verify_client_onetime_pin('+${PHONE}','${ONETIME_A}','${DEVICE_A}','203.0.113.1','vitest')->>'success' AS value
        FROM (SELECT public.admin_set_client_pin(id, '${ONETIME_A}') FROM public.clients WHERE phone = '+${PHONE}') s;

      SELECT 'second' AS marker,
             public.verify_client_onetime_pin('+${PHONE}','${ONETIME_A}','${DEVICE_A}','203.0.113.2','vitest')->>'error' AS value;

      ${purge()}
    `).output;

    expect(out).toMatch(/first\s*\|\s*t/);
    expect(out).toMatch(/second\s*\|\s*invalid_credentials/);
  });

  it('перевыдача гасит предыдущий одноразовый PIN', () => {
    if (!schemeReady) return;

    const out = runSqlBlock(`
      ${purge()}
      INSERT INTO public.clients (id, curator_id, name, phone)
      SELECT gen_random_uuid(), c.id, 'props', '+${PHONE}' FROM public.curators c LIMIT 1;

      SELECT public.admin_set_client_pin(id, '${ONETIME_A}') FROM public.clients WHERE phone = '+${PHONE}';
      SELECT public.admin_set_client_pin(id, '${ONETIME_B}') FROM public.clients WHERE phone = '+${PHONE}';

      SELECT 'old' AS marker,
             public.verify_client_onetime_pin('+${PHONE}','${ONETIME_A}','${DEVICE_A}','203.0.113.1','vitest')->>'error' AS value;
      SELECT 'new' AS marker,
             public.verify_client_onetime_pin('+${PHONE}','${ONETIME_B}','${DEVICE_A}','203.0.113.2','vitest')->>'success' AS value;

      ${purge()}
    `).output;

    expect(out).toMatch(/old\s*\|\s*invalid_credentials/);
    expect(out).toMatch(/new\s*\|\s*t/);
  });

  it('слабый код доступа не принимается', () => {
    if (!schemeReady) return;

    const out = runSqlBlock(`
      ${purge()}
      INSERT INTO public.clients (id, curator_id, name, phone)
      SELECT gen_random_uuid(), c.id, 'props', '+${PHONE}' FROM public.curators c LIMIT 1;
      SELECT public.admin_set_client_pin(id, '${ONETIME_A}') FROM public.clients WHERE phone = '+${PHONE}';

      WITH login AS (
        SELECT public.verify_client_onetime_pin('+${PHONE}','${ONETIME_A}','${DEVICE_A}','203.0.113.1','vitest') AS j
      )
      SELECT 'weak' AS marker,
             public.set_client_access_code(
               (SELECT j->>'session_token' FROM login),
               '${WEAK_CODE}', '${DEVICE_A}', '203.0.113.3', 'vitest'
             )->>'error' AS value;

      ${purge()}
    `).output;

    expect(out).toMatch(/weak\s*\|\s*weak_access_code/);
  });

  it('сброс куратором рвёт все активные сессии', () => {
    if (!schemeReady) return;

    const out = runSqlBlock(`
      ${purge()}
      INSERT INTO public.clients (id, curator_id, name, phone)
      SELECT gen_random_uuid(), c.id, 'props', '+${PHONE}' FROM public.curators c LIMIT 1;
      SELECT public.admin_set_client_pin(id, '${ONETIME_A}') FROM public.clients WHERE phone = '+${PHONE}';
      SELECT public.verify_client_onetime_pin('+${PHONE}','${ONETIME_A}','${DEVICE_A}','203.0.113.1','vitest');

      SELECT 'before' AS marker, count(*)::text AS value
        FROM public.client_sessions
       WHERE client_id = (SELECT id FROM public.clients WHERE phone = '+${PHONE}')
         AND revoked_at IS NULL;

      SELECT public.admin_regenerate_pin(id) FROM public.clients WHERE phone = '+${PHONE}';

      SELECT 'after' AS marker, count(*)::text AS value
        FROM public.client_sessions
       WHERE client_id = (SELECT id FROM public.clients WHERE phone = '+${PHONE}')
         AND revoked_at IS NULL;

      ${purge()}
    `).output;

    expect(out).toMatch(/before\s*\|\s*[1-9]/);
    expect(out).toMatch(/after\s*\|\s*0/);
  });

  it('доверенное устройство снимает блокировку входа', () => {
    if (!schemeReady) return;

    const out = runSqlBlock(`
      ${purge()}
      INSERT INTO public.clients (id, curator_id, name, phone, access_code_hash, access_code_set_at, pin_failed_attempts, pin_locked_until)
      SELECT gen_random_uuid(), c.id, 'props', '+${PHONE}',
             crypt('${ACCESS_CODE}', gen_salt('bf', 12)), now(), 6, now() + interval '1 hour'
        FROM public.curators c LIMIT 1;

      INSERT INTO public.client_devices (client_id, device_id, expires_at)
      SELECT id, '${DEVICE_A}', now() + interval '30 days' FROM public.clients WHERE phone = '+${PHONE}';

      SELECT 'login' AS marker,
             public.login_client_v1('+${PHONE}','${DEVICE_A}',NULL,'203.0.113.50','vitest')->>'success' AS value;

      ${purge()}
    `).output;

    expect(out).toMatch(/login\s*\|\s*t/);
  });

  it('клиент с кодом доступа не входит через verify_client_pin_v3', () => {
    if (!schemeReady) return;

    const out = runSqlBlock(`
      ${purge()}
      INSERT INTO public.clients (id, curator_id, name, phone, pin_hash, access_code_hash, access_code_set_at)
      SELECT gen_random_uuid(), c.id, 'props', '+${PHONE}',
             crypt('${LEGACY_PIN}', gen_salt('bf', 12)),
             crypt('${ACCESS_CODE}', gen_salt('bf', 12)), now()
        FROM public.curators c LIMIT 1;

      SELECT 'legacy' AS marker,
             public.verify_client_pin_v3('+${PHONE}','${LEGACY_PIN}','203.0.113.1','vitest')->>'error' AS value;

      ${purge()}
    `).output;

    expect(out).toMatch(/legacy\s*\|\s*access_code_login_required/);
  });

  it('клиент без кода доступа входит через verify_client_pin_v3', () => {
    if (!schemeReady) return;

    const out = runSqlBlock(`
      ${purge()}
      INSERT INTO public.clients (id, curator_id, name, phone, pin_hash)
      SELECT gen_random_uuid(), c.id, 'props', '+${PHONE}',
             crypt('${LEGACY_PIN}', gen_salt('bf', 12))
        FROM public.curators c LIMIT 1;

      SELECT 'legacy_ok' AS marker,
             public.verify_client_pin_v3('+${PHONE}','${LEGACY_PIN}','203.0.113.1','vitest')->>'success' AS value
      UNION ALL
      SELECT 'legacy_err',
             COALESCE(
               public.verify_client_pin_v3('+${PHONE}','${LEGACY_PIN}','203.0.113.2','vitest')->>'error',
               ''
             );

      ${purge()}
    `).output;

    expect(out).toMatch(/legacy_ok\s*\|\s*t/);
    expect(out).not.toMatch(/legacy_err\s*\|\s*access_code_login_required/);
  });

  it('подписание checkbox с сессии запрещено после set_client_access_code', () => {
    if (!schemeReady) return;

    const out = runSqlBlock(`
      ${purge()}
      INSERT INTO public.clients (id, curator_id, name, phone)
      SELECT gen_random_uuid(), c.id, 'props', '+${PHONE}' FROM public.curators c LIMIT 1;
      SELECT public.admin_set_client_pin(id, '${ONETIME_A}') FROM public.clients WHERE phone = '+${PHONE}';

      WITH login AS (
        SELECT public.verify_client_onetime_pin('+${PHONE}','${ONETIME_A}','${DEVICE_A}','203.0.113.1','vitest') AS j
      ),
      coded AS (
        SELECT public.set_client_access_code(
                 (SELECT j->>'session_token' FROM login),
                 '${ACCESS_CODE}', '${DEVICE_A}', '203.0.113.3', 'vitest'
               ) AS r
      ),
      sess AS (
        SELECT public.issue_client_session_v2(
                 (SELECT id FROM public.clients WHERE phone = '+${PHONE}'),
                 'vitest', '203.0.113.4', 30
               )->>'session_token' AS t
        FROM coded WHERE (r->>'success') = 'true'
      )
      SELECT 'checkbox' AS marker,
             public.log_consents_by_session(
               (SELECT t FROM sess),
               '[{"type":"user_agreement","version":"1.10","granted":true,"signature_method":"checkbox"}]'::jsonb,
               '203.0.113.5', 'vitest'
             )->>'error' AS value;

      ${purge()}
    `).output;

    expect(out).toMatch(/checkbox\s*\|\s*signing_requires_access_code/);
  });

  it('доверенное устройство + сессия не подписывают без кода', () => {
    if (!schemeReady) return;

    const out = runSqlBlock(`
      ${purge()}
      INSERT INTO public.clients (id, curator_id, name, phone, access_code_hash, access_code_set_at, pin_failed_attempts, pin_locked_until)
      SELECT gen_random_uuid(), c.id, 'props', '+${PHONE}',
             crypt('${ACCESS_CODE}', gen_salt('bf', 12)), now(), 6, now() + interval '1 hour'
        FROM public.curators c LIMIT 1;

      INSERT INTO public.client_devices (client_id, device_id, expires_at)
      SELECT id, '${DEVICE_A}', now() + interval '30 days' FROM public.clients WHERE phone = '+${PHONE}';

      WITH login AS (
        SELECT public.login_client_v1('+${PHONE}','${DEVICE_A}',NULL,'203.0.113.50','vitest') AS j
      )
      SELECT 'login' AS marker, (SELECT j->>'success' FROM login) AS value
      UNION ALL
      SELECT 'sign_no_code',
             public.sign_consents_with_access_code_by_session(
               (SELECT j->>'session_token' FROM login),
               NULL,
               '[{"type":"user_agreement","version":"1.10","granted":true,"document_text":"x"}]'::jsonb,
               '${DEVICE_A}', '203.0.113.51', 'vitest'
             )->>'error';

      ${purge()}
    `).output;

    expect(out).toMatch(/login\s*\|\s*t/);
    expect(out).toMatch(/sign_no_code\s*\|\s*access_code_required/);
  });
});
