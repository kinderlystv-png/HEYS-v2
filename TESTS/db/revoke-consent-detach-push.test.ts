/**
 * Revoke consent detaches client Web Push subscriptions.
 */
import { describe, it, expect, beforeAll } from 'vitest';

import { runSql, runSqlBlock } from './_helpers';

function fnReady(): boolean {
  const r = runSql(`
    SELECT 1 FROM pg_proc
     WHERE proname = 'revoke_consent'
       AND pronamespace = 'public'::regnamespace
  `);
  return r.success && r.output.includes('(1 строка)');
}

let ready = false;

beforeAll(() => {
  ready = fnReady();
});

describe('revoke consent detaches push subscriptions', () => {
  it('revoking push_notifications deletes all client subscriptions', () => {
    if (!ready) return;

    const out = runSqlBlock(`
      DO $test$
      DECLARE
        v_client_id UUID;
        v_curator_id UUID;
        v_rev JSONB;
        v_left INTEGER;
      BEGIN
        SELECT id INTO v_curator_id FROM public.curators LIMIT 1;
        IF v_curator_id IS NULL THEN
          RAISE EXCEPTION 'no curator for fixture';
        END IF;

        INSERT INTO public.clients (id, curator_id, name, phone)
        VALUES (gen_random_uuid(), v_curator_id, 'Push Consent Test', '+79995550813')
        RETURNING id INTO v_client_id;

        INSERT INTO public.consents (
          client_id, consent_type, document_version, granted, accepted_at
        ) VALUES
          (v_client_id, 'push_notifications', '1.0', true, NOW());

        INSERT INTO public.push_subscriptions (
          client_id, endpoint, p256dh, auth
        ) VALUES (
          v_client_id,
          'https://web.push.apple.com/test-consent-gate',
          'p256',
          'auth'
        );

        v_rev := public.revoke_consent(v_client_id, 'push_notifications');
        IF COALESCE((v_rev->>'success')::boolean, false) IS NOT TRUE THEN
          RAISE EXCEPTION 'revoke failed: %', v_rev;
        END IF;
        IF COALESCE((v_rev->>'deleted_push_subscriptions')::int, 0) < 1 THEN
          RAISE EXCEPTION 'expected deleted_push_subscriptions >= 1, got %', v_rev;
        END IF;

        SELECT COUNT(*) INTO v_left
          FROM public.push_subscriptions WHERE client_id = v_client_id;
        IF v_left <> 0 THEN
          RAISE EXCEPTION 'subscriptions left after revoke: %', v_left;
        END IF;

        IF EXISTS (
          SELECT 1 FROM public.consents
           WHERE client_id = v_client_id
             AND consent_type = 'push_notifications'
             AND granted = true
             AND revoked_at IS NULL
        ) THEN
          RAISE EXCEPTION 'live push consent remained after revoke';
        END IF;

        DELETE FROM public.push_subscriptions WHERE client_id = v_client_id;
        DELETE FROM public.consents WHERE client_id = v_client_id;
        DELETE FROM public.clients WHERE id = v_client_id;
      END
      $test$;
    `);

    expect(out.success, out.error || out.output).toBe(true);
  });

  it('revoking personal_data also deletes push subscriptions', () => {
    if (!ready) return;

    const out = runSqlBlock(`
      DO $test$
      DECLARE
        v_client_id UUID;
        v_curator_id UUID;
        v_rev JSONB;
        v_left INTEGER;
      BEGIN
        SELECT id INTO v_curator_id FROM public.curators LIMIT 1;
        IF v_curator_id IS NULL THEN
          RAISE EXCEPTION 'no curator for fixture';
        END IF;

        INSERT INTO public.clients (id, curator_id, name, phone)
        VALUES (gen_random_uuid(), v_curator_id, 'Push Personal Test', '+79995550814')
        RETURNING id INTO v_client_id;

        INSERT INTO public.consents (
          client_id, consent_type, document_version, granted, accepted_at
        ) VALUES
          (v_client_id, 'personal_data', '1.7', true, NOW()),
          (v_client_id, 'push_notifications', '1.0', true, NOW());

        INSERT INTO public.push_subscriptions (
          client_id, endpoint, p256dh, auth
        ) VALUES (
          v_client_id,
          'https://fcm.googleapis.com/fcm/send/test-personal',
          'p256',
          'auth'
        );

        v_rev := public.revoke_consent(v_client_id, 'personal_data');
        IF COALESCE((v_rev->>'success')::boolean, false) IS NOT TRUE THEN
          RAISE EXCEPTION 'revoke personal_data failed: %', v_rev;
        END IF;

        SELECT COUNT(*) INTO v_left
          FROM public.push_subscriptions WHERE client_id = v_client_id;
        IF v_left <> 0 THEN
          RAISE EXCEPTION 'subscriptions left after personal_data revoke: %', v_left;
        END IF;

        DELETE FROM public.push_subscriptions WHERE client_id = v_client_id;
        DELETE FROM public.consents WHERE client_id = v_client_id;
        DELETE FROM public.clients WHERE id = v_client_id;
      END
      $test$;
    `);

    expect(out.success, out.error || out.output).toBe(true);
  });
});
