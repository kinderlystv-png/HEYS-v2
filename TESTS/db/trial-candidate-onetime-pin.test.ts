/**
 * Trial candidate one-time invite PIN (prompt-transfer-measures part 1).
 */
import { describe, it, expect, beforeAll } from 'vitest';

import { runSql, runSqlBlock } from './_helpers';

function columnsReady(): boolean {
  const r = runSql(`
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'trial_candidates'
       AND column_name = 'pin_consumed_at'
  `);
  return r.success && r.output.includes('(1 строка)');
}

let ready = false;

beforeAll(() => {
  ready = columnsReady();
});

describe('trial candidate onetime PIN', () => {
  it('second verify with the same code returns onetime_pin_consumed', () => {
    if (!ready) return;

    const out = runSqlBlock(`
      DO $test$
      DECLARE
        v_lead_id UUID := gen_random_uuid();
        v_curator_id UUID;
        v_phone TEXT;
        v_prep JSONB;
        v_sent JSONB;
        v_pin TEXT;
        v_first JSONB;
        v_second JSONB;
        v_candidate_id UUID;
      BEGIN
        SELECT id INTO v_curator_id FROM public.curators LIMIT 1;
        IF v_curator_id IS NULL THEN
          RAISE EXCEPTION 'no curator for fixture';
        END IF;
        v_phone := '+7999' || lpad((floor(random() * 9000000) + 1000000)::bigint::text, 7, '0');

        INSERT INTO public.leads (
          id, name, phone, messenger, status, birth_year,
          consent_privacy_version, consent_accepted_at, curator_id
        ) VALUES (
          v_lead_id, 'Onetime PIN Test', v_phone, 'telegram', 'new', 1990,
          '1.7', NOW(), v_curator_id
        );

        v_prep := public.admin_prepare_trial_candidate_from_lead(v_lead_id, v_curator_id);
        IF COALESCE((v_prep->>'success')::boolean, false) IS NOT TRUE THEN
          RAISE EXCEPTION 'prepare failed: %', v_prep;
        END IF;
        v_candidate_id := (v_prep->>'candidate_id')::uuid;
        v_pin := v_prep->>'pin';
        v_sent := public.admin_mark_trial_candidate_invite_sent(v_candidate_id, v_curator_id);
        IF COALESCE((v_sent->>'success')::boolean, false) IS NOT TRUE THEN
          RAISE EXCEPTION 'mark sent failed: %', v_sent;
        END IF;
        v_first := public.verify_trial_candidate_pin(v_phone, v_pin);
        IF COALESCE((v_first->>'success')::boolean, false) IS NOT TRUE THEN
          RAISE EXCEPTION 'first verify failed: %', v_first;
        END IF;
        v_second := public.verify_trial_candidate_pin(v_phone, v_pin);
        IF v_second->>'error' <> 'onetime_pin_consumed' THEN
          RAISE EXCEPTION 'second verify expected onetime_pin_consumed, got: %', v_second;
        END IF;

        RAISE NOTICE 'trial_onetime_pin_ok';
      END
      $test$;
    `);

    expect(out.success, out.error || out.output).toBe(true);
  });
});
