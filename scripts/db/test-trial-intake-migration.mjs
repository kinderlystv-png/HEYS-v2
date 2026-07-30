#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = path.join(repoRoot, 'database/2026-07-27_trial_intake_flow.sql');
const v2MigrationPath = path.join(repoRoot, 'database/2026-07-27_trial_intake_flow_v2.sql');
const v3MigrationPath = path.join(repoRoot, 'scripts/db/migrations/2026-07-29_trial_intake_preclient_v3.sql');
const trialPreparePermissionPath = path.join(
  repoRoot,
  'scripts/db/migrations/2026-07-29_trial_prepare_internal_execute.sql',
);
const correctionsMigrationPath = path.join(
  repoRoot,
  'scripts/db/migrations/2026-07-30_trial_candidate_answer_corrections_v1.sql',
);
const consentProofPath = path.join(repoRoot, 'database/2026-07-27_consent_proof_v2.sql');
const reconsentFixPath = path.join(
  repoRoot,
  'database/2026-07-27_trial_intake_reconsent_fix.sql',
);
const binCandidates = [
  process.env.POSTGRES_BIN,
  '/usr/local/opt/postgresql@15/bin',
  '/opt/homebrew/opt/postgresql@15/bin',
].filter(Boolean);
const pgBin = binCandidates.find((dir) => existsSync(path.join(dir, 'initdb')));

if (!pgBin) {
  console.error('trial-intake migration test requires PostgreSQL 15 binaries (set POSTGRES_BIN)');
  process.exit(1);
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'heys-trial-intake-'));
const dataDir = path.join(tempRoot, 'data');
const socketDir = path.join(tempRoot, 'socket');
const port = 56000 + Math.floor(Math.random() * 3000);

function run(binary, args, input = null) {
  const result = spawnSync(path.join(pgBin, binary), args, {
    input,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
  if (result.status !== 0) {
    throw new Error([
      `${binary} ${args.join(' ')} failed (${result.status})`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result.stdout;
}

const setupSql = String.raw`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE heys_rpc NOLOGIN;
CREATE ROLE heys_admin NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE TABLE public.clients (
  id UUID PRIMARY KEY,
  name TEXT,
  phone TEXT,
  phone_normalized TEXT,
  email TEXT,
  pin_hash TEXT,
  curator_id UUID,
  subscription_status TEXT DEFAULT 'none',
  pin_token UUID,
  pin_token_expires_at TIMESTAMPTZ,
  birth_year INTEGER,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  consent_outdated_since TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  document_version TEXT NOT NULL,
  signature_method TEXT NOT NULL DEFAULT 'checkbox'
    CHECK (signature_method IN ('checkbox', 'sms_code', 'one_time_code', 'messenger_code', 'button')),
  granted BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE public.curator_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL,
  consent_type TEXT NOT NULL,
  document_version TEXT NOT NULL,
  signature_method TEXT NOT NULL DEFAULT 'checkbox',
  granted BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE public.client_sessions (
  token_hash BYTEA PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE public.trial_queue (
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  curator_id UUID,
  status TEXT NOT NULL,
  queued_at TIMESTAMPTZ,
  offer_sent_at TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  source TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.trial_queue_events (
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  meta JSONB
);

CREATE TABLE public.curator_trial_limits (
  curator_id UUID PRIMARY KEY,
  max_active_trials INTEGER NOT NULL DEFAULT 3,
  is_accepting_trials BOOLEAN DEFAULT true
);
INSERT INTO public.curator_trial_limits(curator_id, max_active_trials)
VALUES ('00000000-0000-0000-0000-000000000000', 3);

CREATE TABLE public.leads (
  id UUID PRIMARY KEY,
  name TEXT,
  phone TEXT,
  messenger TEXT,
  status TEXT DEFAULT 'new',
  client_id UUID,
  curator_id UUID,
  birth_year INTEGER,
  ip_address INET,
  user_agent TEXT,
  consent_privacy_version TEXT,
  consent_user_agent TEXT,
  consent_accepted_at TIMESTAMPTZ,
  consent_marketing_accepted_at TIMESTAMPTZ,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  contacted_at TIMESTAMPTZ,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.subscriptions (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  trial_approved_at TIMESTAMPTZ,
  active_until TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ
);

CREATE TABLE public.test_data_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID,
  action TEXT NOT NULL,
  is_health BOOLEAN NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.client_kv_store (
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  k TEXT NOT NULL,
  v JSONB,
  v_encrypted BYTEA,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (client_id, k)
);

CREATE OR REPLACE FUNCTION public.encrypt_health_data(p_value JSONB)
RETURNS BYTEA LANGUAGE sql IMMUTABLE AS $func$
  SELECT convert_to(p_value::text, 'UTF8')
$func$;

CREATE OR REPLACE FUNCTION public.decrypt_health_data(p_value BYTEA)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $func$
  SELECT convert_from(p_value, 'UTF8')::jsonb
$func$;

CREATE OR REPLACE FUNCTION public.log_data_access(
  p_accessor_type TEXT,
  p_accessor_id UUID,
  p_client_id UUID,
  p_action TEXT,
  p_resource_keys TEXT[] DEFAULT NULL,
  p_is_health BOOLEAN DEFAULT false,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID LANGUAGE plpgsql AS $func$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.test_data_access_log(client_id, action, is_health, metadata)
  VALUES (p_client_id, p_action, p_is_health, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END
$func$;

CREATE OR REPLACE FUNCTION public.get_effective_subscription_status(p_client_id UUID)
RETURNS TEXT LANGUAGE sql STABLE AS $func$
  SELECT CASE
    WHEN s.active_until > now() AND s.canceled_at IS NULL THEN 'active'
    WHEN COALESCE(s.trial_started_at, c.trial_started_at) > now() THEN 'trial_pending'
    WHEN COALESCE(s.trial_ends_at, c.trial_ends_at) > now() THEN 'trial'
    ELSE COALESCE(c.subscription_status, 'none')
  END
  FROM public.clients c
  LEFT JOIN public.subscriptions s ON s.client_id = c.id
  WHERE c.id = p_client_id
$func$;

CREATE OR REPLACE FUNCTION public.get_public_trial_capacity()
RETURNS JSONB LANGUAGE sql STABLE AS $func$
  SELECT jsonb_build_object(
    'available_slots', GREATEST(0,
      (SELECT max_active_trials FROM public.curator_trial_limits
       WHERE curator_id = '00000000-0000-0000-0000-000000000000')
      - (SELECT COUNT(*) FROM public.subscriptions
         WHERE trial_started_at IS NOT NULL AND trial_ends_at > now()
           AND canceled_at IS NULL)
    )
  )
$func$;

CREATE OR REPLACE FUNCTION public.record_funnel_event(
  p_event_type TEXT,
  p_lead_id UUID DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_campaign TEXT DEFAULT NULL,
  p_segment TEXT DEFAULT NULL,
  p_tariff TEXT DEFAULT NULL,
  p_ym_client_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_dedupe_key TEXT DEFAULT NULL,
  p_occurred_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB LANGUAGE sql AS $func$ SELECT jsonb_build_object('success', true) $func$;

CREATE OR REPLACE FUNCTION public.require_client_id(p_session_token TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE v_client_id UUID;
BEGIN
  SELECT client_id INTO v_client_id
  FROM public.client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > now() AND revoked_at IS NULL;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'invalid_session'; END IF;
  RETURN v_client_id;
END
$func$;

CREATE OR REPLACE FUNCTION public.is_health_key(p_key TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $func$
  SELECT p_key ~ '^heys_(profile|dayv2_|hr_zones)'
$func$;

CREATE OR REPLACE FUNCTION public.log_consents(UUID, JSONB, TEXT, TEXT)
RETURNS JSONB LANGUAGE sql AS $func$ SELECT jsonb_build_object('success', true) $func$;
CREATE OR REPLACE FUNCTION public.check_required_consents(UUID)
RETURNS JSONB LANGUAGE sql AS $func$ SELECT jsonb_build_object('valid', true) $func$;
CREATE OR REPLACE FUNCTION public.revoke_consent(UUID, TEXT)
RETURNS JSONB LANGUAGE sql AS $func$ SELECT jsonb_build_object('success', true) $func$;
CREATE OR REPLACE FUNCTION public.get_client_consents(UUID)
RETURNS JSONB LANGUAGE sql AS $func$ SELECT '[]'::jsonb $func$;
CREATE OR REPLACE FUNCTION public.purge_health_data(UUID)
RETURNS JSONB LANGUAGE sql AS $func$ SELECT jsonb_build_object('success', true) $func$;
`;

const assertionsSql = String.raw`
\set ON_ERROR_STOP on

INSERT INTO public.leads (
  id, name, phone, messenger, status, birth_year, ip_address,
  consent_privacy_version, consent_user_agent, consent_accepted_at
) VALUES (
  '10000000-0000-4000-8000-000000000001', 'Lead A', '+7 999 111-22-33',
  'telegram', 'new', 1990, '127.0.0.1', '1.7', 'integration-test', now()
);

DO $test$
DECLARE
  v_result JSONB;
  v_client_id UUID;
BEGIN
  v_result := public.admin_convert_lead(
    '10000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'lead conversion failed: %', v_result;
  END IF;
  v_client_id := (v_result->>'client_id')::uuid;
  IF (SELECT subscription_status FROM public.clients WHERE id = v_client_id) <> 'none' THEN
    RAISE EXCEPTION 'conversion activated a trial';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.consents
    WHERE client_id = v_client_id AND consent_type IN ('health_data', 'user_agreement')
  ) THEN
    RAISE EXCEPTION 'conversion forged user/health consent';
  END IF;
  IF (SELECT document_version FROM public.consents WHERE client_id = v_client_id AND consent_type = 'personal_data') <> '1.7' THEN
    RAISE EXCEPTION 'landing privacy version was not preserved';
  END IF;
  IF (SELECT status FROM public.trial_intakes WHERE client_id = v_client_id) <> 'invited' THEN
    RAISE EXCEPTION 'intake invite was not created';
  END IF;
END
$test$;

INSERT INTO public.clients (id, name, phone, phone_normalized, curator_id)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'Client A', '79990000001', '+79990000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('20000000-0000-4000-8000-000000000002', 'Client B', '79990000002', '+79990000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('20000000-0000-4000-8000-000000000003', 'Client C', '79990000003', '+79990000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('20000000-0000-4000-8000-000000000004', 'Client D', '79990000004', '+79990000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('20000000-0000-4000-8000-000000000005', 'Client E', '79990000005', '+79990000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('20000000-0000-4000-8000-000000000006', 'Client F', '79990000006', '+79990000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

DO $test$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.log_consents(
    '20000000-0000-4000-8000-000000000006',
    '[
      {"type":"user_agreement","version":"1.7","granted":true},
      {"type":"personal_data","version":"1.7","granted":true},
      {"type":"health_data","version":"1.5","granted":true}
    ]'::jsonb,
    '127.0.0.1',
    'integration-test'
  );
  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'current consent set was rejected: %', v_result;
  END IF;

  v_result := public.check_required_consents_v2(
    '20000000-0000-4000-8000-000000000006',
    '{"user_agreement":"1.6","personal_data":"1.6","health_data":"1.5"}'::jsonb
  );
  IF NOT COALESCE((v_result->>'valid')::boolean, false) THEN
    RAISE EXCEPTION 'server registry did not protect an older device from version skew: %', v_result;
  END IF;

  v_result := public.log_consents(
    '20000000-0000-4000-8000-000000000006',
    '[{"type":"user_agreement","version":"1.6","granted":true}]'::jsonb,
    '127.0.0.1',
    'integration-test'
  );
  IF v_result->>'error' <> 'consent_version_not_allowed' THEN
    RAISE EXCEPTION 'retired/future version was not rejected: %', v_result;
  END IF;
  IF (
    SELECT document_version
    FROM public.consents
    WHERE client_id = '20000000-0000-4000-8000-000000000006'
      AND consent_type = 'user_agreement'
      AND granted = true
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  ) <> '1.7' THEN
    RAISE EXCEPTION 'rejected version mutated the active consent';
  END IF;
END
$test$;

INSERT INTO public.consents (client_id, consent_type, document_version, signature_method)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'health_data', '1.5', 'checkbox'),
  ('20000000-0000-4000-8000-000000000002', 'health_data', '1.5', 'checkbox'),
  ('20000000-0000-4000-8000-000000000004', 'health_data', '1.5', 'checkbox');

-- Симулируем запись, существовавшую до установки proof-trigger. Новые записи
-- 1.4 после migration обязаны блокироваться server allowlist.
SET session_replication_role = replica;
INSERT INTO public.consents (client_id, consent_type, document_version, signature_method)
VALUES ('20000000-0000-4000-8000-000000000005', 'health_data', '1.4', 'checkbox');
SET session_replication_role = origin;

INSERT INTO public.client_sessions (token_hash, client_id, expires_at)
VALUES
  (digest('token-a', 'sha256'), '20000000-0000-4000-8000-000000000001', now() + interval '1 hour'),
  (digest('token-b', 'sha256'), '20000000-0000-4000-8000-000000000002', now() + interval '1 hour'),
  (digest('token-c', 'sha256'), '20000000-0000-4000-8000-000000000003', now() + interval '1 hour'),
  (digest('expired-token', 'sha256'), '20000000-0000-4000-8000-000000000004', now() - interval '1 minute'),
  (digest('token-e', 'sha256'), '20000000-0000-4000-8000-000000000005', now() + interval '1 hour');

INSERT INTO public.trial_intakes (client_id, curator_id, status, invited_at)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'invited', now()),
  ('20000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'invited', now()),
  ('20000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'invited', now()),
  ('20000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'invited', now()),
  ('20000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'invited', now());

DO $test$
BEGIN
  PERFORM set_config('app.consents_writer', 'authorized', true);
  UPDATE public.consents
  SET granted = false, is_active = false, revoked_at = now()
  WHERE client_id = '20000000-0000-4000-8000-000000000005'
    AND consent_type = 'health_data'
    AND document_version = '1.4';
  INSERT INTO public.consents (
    client_id, consent_type, document_version, signature_method, granted, is_active
  ) VALUES (
    '20000000-0000-4000-8000-000000000005', 'health_data', '1.5', 'checkbox', true, true
  );
END
$test$;

DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.trial_intakes
    WHERE client_id = '20000000-0000-4000-8000-000000000005'
  ) THEN
    RAISE EXCEPTION 'health re-consent rotation purged intake';
  END IF;
END
$test$;

DO $test$
DECLARE
  v_answers JSONB := '{
    "goals":{"primary_goal":"Режим","success_definition":"Стабильность"},
    "experience":{"previous_experience":"self"},
    "lifestyle":{"schedule":"Работа","sleep":"8 часов"},
    "collaboration":{"daily_tracking":"yes","feedback_style":"concise"},
    "health":{"doctor_restrictions":"Нет"},
    "safety":{"acute_symptoms":false},
    "meta":{"schema_version":"1.0"}
  }'::jsonb;
  v_result JSONB;
BEGIN
  v_result := public.save_trial_intake_by_session('token-a', v_answers, 5::smallint, true);
  IF v_result->>'status' <> 'completed' THEN
    RAISE EXCEPTION 'valid intake did not complete: %', v_result;
  END IF;
  IF (public.get_trial_intake_by_session('token-a') #>> '{intake,answers,goals,primary_goal}') <> 'Режим' THEN
    RAISE EXCEPTION 'draft/resume read failed';
  END IF;
  IF public.get_trial_intake_by_session('token-b') #>> '{intake,answers,goals,primary_goal}' IS NOT NULL THEN
    RAISE EXCEPTION 'session B read session A answers';
  END IF;
  IF public.get_trial_intake_by_session('expired-token')->>'error' <> 'invalid_session' THEN
    RAISE EXCEPTION 'expired session accepted';
  END IF;
  IF public.save_trial_intake_by_session('token-c', v_answers, 0::smallint, false)->>'error' <> 'health_consent_required' THEN
    RAISE EXCEPTION 'health write accepted without consent';
  END IF;
  IF public.save_trial_intake_by_session(
    'token-b', jsonb_set(v_answers, '{health,unexpected}', '"x"'::jsonb), 0::smallint, false
  )->>'error' <> 'unknown_answer_field' THEN
    RAISE EXCEPTION 'unknown v1 field accepted';
  END IF;
  IF public.admin_get_trial_intake(
    '20000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  )->>'error' <> 'forbidden' THEN
    RAISE EXCEPTION 'foreign curator read succeeded';
  END IF;
  IF public.admin_review_trial_intake(
    '20000000-0000-4000-8000-000000000001', 'approved', NULL, 'Проверено',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  )->>'error' <> 'forbidden' THEN
    RAISE EXCEPTION 'foreign curator review succeeded';
  END IF;
  IF public.admin_review_trial_intake(
    '20000000-0000-4000-8000-000000000001', 'approved', NULL, 'Проверено',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )->>'status' <> 'approved' THEN
    RAISE EXCEPTION 'owner approval failed';
  END IF;
  IF public.admin_activate_trial(
    '20000000-0000-4000-8000-000000000001', current_date, 7,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  )->>'error' <> 'forbidden' THEN
    RAISE EXCEPTION 'foreign curator activation succeeded';
  END IF;
  IF public.admin_activate_trial(
    '20000000-0000-4000-8000-000000000001', current_date + 1, 7,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )->>'status' <> 'trial_pending' THEN
    RAISE EXCEPTION 'approved future activation failed';
  END IF;
  IF public.export_my_data_by_session('token-a') #>> '{trial_intake,answers,goals,primary_goal}' <> 'Режим' THEN
    RAISE EXCEPTION 'DSAR does not include intake';
  END IF;
END
$test$;

DO $test$
DECLARE
  v_answers JSONB := '{
    "goals":{"primary_goal":"Цель","success_definition":"Результат"},
    "experience":{"previous_experience":"none"},
    "lifestyle":{"schedule":"День","sleep":"8 часов"},
    "collaboration":{"daily_tracking":"yes","feedback_style":"gentle"},
    "health":{"doctor_restrictions":"Нет"},
    "safety":{},
    "meta":{"schema_version":"1.0"}
  }'::jsonb;
BEGIN
  PERFORM public.save_trial_intake_by_session('token-b', v_answers, 5::smallint, true);
  IF public.admin_review_trial_intake(
    '20000000-0000-4000-8000-000000000002', 'rejected', 'no_capacity', 'Нет места',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  )->>'status' <> 'rejected' THEN
    RAISE EXCEPTION 'structured rejection failed';
  END IF;
  UPDATE public.trial_intakes
  SET retention_delete_at = now() - interval '1 second'
  WHERE client_id = '20000000-0000-4000-8000-000000000002';
  IF public.purge_expired_trial_intakes() <> 1 THEN
    RAISE EXCEPTION 'expired rejection was not purged';
  END IF;
  UPDATE public.consents SET granted = false, is_active = false, revoked_at = now()
  WHERE client_id = '20000000-0000-4000-8000-000000000004' AND consent_type = 'health_data';
END
$test$;

DO $test$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.trial_intakes
    WHERE client_id = '20000000-0000-4000-8000-000000000004'
  ) THEN
    RAISE EXCEPTION 'health consent revoke did not purge intake';
  END IF;
END
$test$;

INSERT INTO public.client_kv_store (client_id, k, v)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'heys_dayv2_2026-07-27', '{"weight":70}'::jsonb),
  ('20000000-0000-4000-8000-000000000001', 'heys_settings_v1', '{"theme":"dark"}'::jsonb);

DO $test$
DECLARE
  v_result JSONB;
BEGIN
  IF has_function_privilege('heys_rpc', 'public.log_consents(uuid,jsonb,text,text)', 'EXECUTE')
     OR has_function_privilege('heys_rpc', 'public.revoke_consent(uuid,text)', 'EXECUTE')
     OR has_function_privilege('heys_rpc', 'public.purge_health_data(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'legacy client-id consent RPC remains executable by heys_rpc';
  END IF;

  v_result := public.revoke_consent_by_session('token-a', 'health_data');
  IF NOT COALESCE((v_result->>'success')::boolean, false)
     OR (v_result->>'deleted_keys')::integer <> 1 THEN
    RAISE EXCEPTION 'atomic health revoke failed: %', v_result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.client_kv_store
    WHERE client_id = '20000000-0000-4000-8000-000000000001'
      AND public.is_health_key(k)
  ) THEN
    RAISE EXCEPTION 'health KV survived session-bound revoke';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_kv_store
    WHERE client_id = '20000000-0000-4000-8000-000000000001'
      AND k = 'heys_settings_v1'
  ) THEN
    RAISE EXCEPTION 'non-health KV was deleted by health revoke';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.client_sessions
    WHERE client_id = '20000000-0000-4000-8000-000000000001'
      AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'sessions survived required-consent revoke';
  END IF;
END
$test$;

DO $test$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.trial_intakes
    WHERE client_id = '20000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'trial intake survived health revoke';
  END IF;
END
$test$;

SELECT 'trial intake migration integration OK' AS result;
`;

const v2AssertionsSql = String.raw`
\set ON_ERROR_STOP on

INSERT INTO public.clients (
  id, name, phone, phone_normalized, curator_id, subscription_status
) VALUES
  ('30000000-0000-4000-8000-000000000001', 'V2 Client A', '79992220001', '+79992220001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'none'),
  ('30000000-0000-4000-8000-000000000002', 'V2 Client B', '79992220002', '+79992220002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'none'),
  ('30000000-0000-4000-8000-000000000003', 'V2 Client C', '79992220003', '+79992220003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'none'),
  ('30000000-0000-4000-8000-000000000004', 'V2 Client D', '79992220004', '+79992220004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'none');

INSERT INTO public.consents (
  client_id, consent_type, document_version, signature_method
) VALUES
  ('30000000-0000-4000-8000-000000000001', 'health_data', '1.5', 'checkbox'),
  ('30000000-0000-4000-8000-000000000002', 'health_data', '1.5', 'checkbox'),
  ('30000000-0000-4000-8000-000000000004', 'health_data', '1.5', 'checkbox');

INSERT INTO public.client_sessions (token_hash, client_id, expires_at)
VALUES
  (digest('token-v2-a', 'sha256'), '30000000-0000-4000-8000-000000000001', now() + interval '1 hour'),
  (digest('token-v2-b', 'sha256'), '30000000-0000-4000-8000-000000000002', now() + interval '1 hour'),
  (digest('token-v2-c', 'sha256'), '30000000-0000-4000-8000-000000000003', now() + interval '1 hour');

INSERT INTO public.trial_intakes (
  client_id, curator_id, schema_version, status, invite_prepared_at, invited_at
) VALUES
  ('30000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '1.1', 'invite_prepared', now(), now()),
  ('30000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '1.1', 'invite_prepared', now() - interval '31 days', now() - interval '31 days'),
  ('30000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '1.1', 'rejected', now() - interval '40 days', now() - interval '40 days'),
  ('30000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '1.1', 'needs_clarification', now() - interval '40 days', now() - interval '40 days');

INSERT INTO public.trial_queue (client_id, status, queued_at, source)
VALUES (
  '30000000-0000-4000-8000-000000000002', 'pending',
  now() - interval '31 days', 'trial_intake_invite'
);

UPDATE public.trial_intakes
SET reviewed_at = now() - interval '31 days',
    retention_delete_at = now() + interval '1 day',
    answers_encrypted = public.encrypt_health_data('{"legacy":true}'::jsonb)
WHERE client_id = '30000000-0000-4000-8000-000000000003';

UPDATE public.trial_intakes
SET reviewed_at = now() - interval '31 days',
    updated_at = now(),
    last_client_activity_at = now(),
    clarification_request_encrypted = public.encrypt_health_data('{"text":"Свежий вопрос"}'::jsonb)
WHERE client_id = '30000000-0000-4000-8000-000000000004';

DO $test$
DECLARE
  v_answers JSONB := '{
    "goals":{"primary_goal":"Режим","success_definition":"Стабильность"},
    "experience":{"previous_experience":"self"},
    "lifestyle":{"schedule":"Работа","sleep":"8 часов"},
    "collaboration":{"daily_tracking":"yes","feedback_style":"concise"},
    "health":{
      "chronic_conditions_status":"no",
      "medications_status":"no",
      "injuries_operations_status":"no",
      "allergies_status":"no",
      "doctor_restrictions_status":"no"
    },
    "safety":{
      "acute_symptoms":"no",
      "recent_surgery":"no",
      "active_ed_concern":"no",
      "medical_supervision":"no"
    },
    "meta":{"schema_version":"1.1"}
  }'::jsonb;
  v_checklist JSONB := '{
    "within_scope":true,
    "understands_boundaries":true,
    "ready_to_track":true,
    "realistic_expectations":true,
    "safe_format":true,
    "slot_available":false
  }'::jsonb;
  v_result JSONB;
  v_revision TIMESTAMPTZ;
  v_sent_at TIMESTAMPTZ;
BEGIN
  IF public.save_trial_intake_by_session(
    'token-v2-a',
    jsonb_set(v_answers, '{safety,medical_supervision}', 'null'::jsonb),
    5::smallint,
    true
  )->>'error' <> 'required_answers_missing' THEN
    RAISE EXCEPTION 'v1.1 completion accepted an unanswered safety question';
  END IF;
  IF public.save_trial_intake_by_session(
    'token-v2-a', v_answers, 0::smallint, false
  )->>'error' <> 'intake_locked' THEN
    RAISE EXCEPTION 'client started intake before invite was sent';
  END IF;

  v_result := public.admin_mark_trial_intake_invite_sent(
    '30000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );
  IF v_result->>'error' <> 'forbidden' THEN
    RAISE EXCEPTION 'foreign curator marked invite sent: %', v_result;
  END IF;

  v_result := public.admin_mark_trial_intake_invite_sent(
    '30000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_result->>'status' <> 'invite_sent' THEN
    RAISE EXCEPTION 'invite sent transition failed: %', v_result;
  END IF;
  v_sent_at := (v_result->>'sent_at')::timestamptz;
  PERFORM pg_sleep(0.01);
  v_result := public.admin_mark_trial_intake_invite_sent(
    '30000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF (v_result->>'sent_at')::timestamptz IS DISTINCT FROM v_sent_at THEN
    RAISE EXCEPTION 'invite sent retry returned a false new timestamp: %', v_result;
  END IF;
  v_revision := (public.get_trial_intake_by_session('token-v2-a')
    #>> '{intake,updated_at}')::timestamptz;

  v_result := public.save_trial_intake_by_session(
    'token-v2-a', v_answers, 1::smallint, false, v_revision
  );
  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'revision-aware draft save failed: %', v_result;
  END IF;
  UPDATE public.trial_intakes
  SET updated_at = clock_timestamp() + interval '1 second'
  WHERE client_id = '30000000-0000-4000-8000-000000000001';
  v_result := public.save_trial_intake_by_session(
    'token-v2-a', jsonb_set(v_answers, '{goals,primary_goal}', '"Устаревшая цель"'::jsonb),
    1::smallint, false, v_revision
  );
  IF v_result->>'error' <> 'stale_draft' THEN
    RAISE EXCEPTION 'stale draft overwrote newer answers: %', v_result;
  END IF;
  IF public.get_trial_intake_by_session('token-v2-a')
       #>> '{intake,answers,goals,primary_goal}' <> 'Режим' THEN
    RAISE EXCEPTION 'stale draft changed stored answers';
  END IF;

  v_result := public.save_trial_intake_by_session('token-v2-a', v_answers, 5::smallint, true);
  IF v_result->>'status' <> 'completed' THEN
    RAISE EXCEPTION 'v1.1 completion failed: %', v_result;
  END IF;

  v_result := public.admin_review_trial_intake_v2(
    '30000000-0000-4000-8000-000000000001',
    'approved_waiting_slot',
    NULL,
    'Чужое решение',
    NULL,
    NULL,
    v_checklist,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );
  IF v_result->>'error' <> 'forbidden' THEN
    RAISE EXCEPTION 'foreign curator reviewed intake: %', v_result;
  END IF;

  v_result := public.admin_review_trial_intake_v2(
    '30000000-0000-4000-8000-000000000001',
    'rejected',
    NULL,
    'Причина есть только во внутренней заметке',
    NULL,
    NULL,
    v_checklist,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_result->>'error' <> 'rejection_reason_required' THEN
    RAISE EXCEPTION 'rejection without reason code was accepted: %', v_result;
  END IF;

  v_result := public.admin_review_trial_intake_v2(
    '30000000-0000-4000-8000-000000000001',
    'needs_clarification',
    NULL,
    'Проверить ограничения',
    'Уточните рекомендации врача.',
    ARRAY['health', 'safety'],
    NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (public.get_trial_intake_by_session('token-v2-a') #>> '{intake,updated_at}')::timestamptz
  );
  IF v_result->>'status' <> 'needs_clarification' THEN
    RAISE EXCEPTION 'clarification decision failed: %', v_result;
  END IF;
  IF public.get_trial_intake_by_session('token-v2-a')
       #>> '{intake,clarification_request}' <> 'Уточните рекомендации врача.' THEN
    RAISE EXCEPTION 'client-visible clarification was not returned';
  END IF;
  IF public.admin_get_trial_intake(
    '30000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  )->>'error' <> 'forbidden' THEN
    RAISE EXCEPTION 'v2 foreign curator read succeeded';
  END IF;

  UPDATE public.trial_intakes
  SET updated_at = clock_timestamp() + interval '2 seconds'
  WHERE client_id = '30000000-0000-4000-8000-000000000001';

  v_result := public.admin_review_trial_intake_v2(
    '30000000-0000-4000-8000-000000000001',
    'needs_clarification', NULL, 'Старая вкладка', 'Другой вопрос',
    ARRAY['goals'], NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_revision
  );
  IF v_result->>'error' <> 'stale_intake' THEN
    RAISE EXCEPTION 'stale curator review overwrote current request: %', v_result;
  END IF;

  v_result := public.save_trial_intake_by_session(
    'token-v2-a', v_answers, 4::smallint, false
  );
  IF v_result->>'status' <> 'needs_clarification'
     OR public.get_trial_intake_by_session('token-v2-a')
       #>> '{intake,clarification_request}' <> 'Уточните рекомендации врача.' THEN
    RAISE EXCEPTION 'clarification disappeared during draft autosave: %', v_result;
  END IF;

  PERFORM public.save_trial_intake_by_session('token-v2-a', v_answers, 5::smallint, true);
  IF public.get_trial_intake_by_session('token-v2-a')
       #>> '{intake,clarification_request}' IS NOT NULL THEN
    RAISE EXCEPTION 'clarification survived client resubmission';
  END IF;

  v_result := public.admin_review_trial_intake_v2(
    '30000000-0000-4000-8000-000000000001',
    'approved_waiting_slot',
    NULL,
    'Подходит, ждём место',
    NULL,
    NULL,
    v_checklist,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (public.get_trial_intake_by_session('token-v2-a') #>> '{intake,updated_at}')::timestamptz
  );
  IF v_result->>'status' <> 'approved_waiting_slot' THEN
    RAISE EXCEPTION 'waiting-slot approval failed: %', v_result;
  END IF;
  v_result := public.admin_invite_trial_intake(
    '30000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_result->>'error' <> 'invite_not_allowed' THEN
    RAISE EXCEPTION 'terminal decision was reopened by invite retry: %', v_result;
  END IF;
  v_result := public.admin_remove_from_queue(
    '30000000-0000-4000-8000-000000000001', 'admin_removed',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );
  IF v_result->>'error' <> 'forbidden' THEN
    RAISE EXCEPTION 'foreign curator removed intake queue row: %', v_result;
  END IF;
  v_result := public.admin_remove_from_queue(
    '30000000-0000-4000-8000-000000000001', 'admin_removed',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_result->>'error' <> 'intake_managed' THEN
    RAISE EXCEPTION 'legacy queue removal orphaned intake: %', v_result;
  END IF;
  UPDATE public.curator_trial_limits
  SET max_active_trials = 0
  WHERE curator_id = '00000000-0000-0000-0000-000000000000';
  v_result := public.admin_activate_trial(
    '30000000-0000-4000-8000-000000000001', current_date + 2, 7,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_result->>'error' <> 'no_available_slot' THEN
    RAISE EXCEPTION 'waiting candidate activated with no capacity: %', v_result;
  END IF;
  UPDATE public.curator_trial_limits
  SET max_active_trials = 3
  WHERE curator_id = '00000000-0000-0000-0000-000000000000';
  IF public.admin_activate_trial(
    '30000000-0000-4000-8000-000000000001',
    current_date + 2,
    7,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )->>'status' <> 'trial_pending' THEN
    RAISE EXCEPTION 'waiting-slot activation failed';
  END IF;
  v_result := public.admin_activate_trial(
    '30000000-0000-4000-8000-000000000001', current_date + 5, 14,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_result->>'already_active' <> 'true'
     OR (SELECT trial_started_at::date FROM public.clients
         WHERE id = '30000000-0000-4000-8000-000000000001') <> current_date + 2 THEN
    RAISE EXCEPTION 'repeated future activation changed the first schedule: %', v_result;
  END IF;
END
$test$;

INSERT INTO public.leads (
  id, name, phone, messenger, status, birth_year,
  consent_privacy_version, consent_accepted_at, curator_id
) VALUES (
  '30000000-0000-4000-8000-000000000098',
  'V2 New Candidate', '+7 999 222-00-98', 'telegram', 'new', 1993,
  '1.7', now(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

DO $test$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.admin_prepare_trial_candidate_from_lead(
    '30000000-0000-4000-8000-000000000098',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );
  IF v_result->>'error' <> 'forbidden' THEN
    RAISE EXCEPTION 'foreign curator converted lead: %', v_result;
  END IF;

  v_result := public.admin_prepare_trial_candidate_from_lead(
    '30000000-0000-4000-8000-000000000098',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF NOT COALESCE((v_result->>'success')::boolean, false)
     OR v_result->>'intake_status' <> 'invite_prepared' THEN
    RAISE EXCEPTION 'atomic convert/prepare failed: %', v_result;
  END IF;
  IF (
    SELECT status FROM public.trial_intakes
    WHERE client_id = (v_result->>'client_id')::uuid
  ) <> 'invite_prepared' THEN
    RAISE EXCEPTION 'converted candidate was not left recoverable';
  END IF;

  v_result := public.admin_prepare_trial_candidate_from_lead(
    '30000000-0000-4000-8000-000000000098',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_result->>'error' <> 'lead_already_converted' THEN
    RAISE EXCEPTION 'double conversion was not idempotently blocked: %', v_result;
  END IF;
END
$test$;

INSERT INTO public.leads (
  id, name, phone, messenger, status, birth_year,
  consent_privacy_version, consent_accepted_at, curator_id
) VALUES (
  '30000000-0000-4000-8000-000000000099',
  'V2 Repeat',
  '+7 999 222-00-03',
  'telegram',
  'new',
  1991,
  '1.7',
  now(),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

DO $test$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.admin_reopen_trial_candidate(
    '30000000-0000-4000-8000-000000000099',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_result->>'error' <> 'forbidden' THEN
    RAISE EXCEPTION 'foreign lead reopen was accepted: %', v_result;
  END IF;

  UPDATE public.leads
  SET curator_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  WHERE id = '30000000-0000-4000-8000-000000000099';
  INSERT INTO public.subscriptions (client_id, active_until)
  VALUES ('30000000-0000-4000-8000-000000000003', now() + interval '10 days')
  ON CONFLICT (client_id) DO UPDATE SET active_until = EXCLUDED.active_until;

  v_result := public.admin_reopen_trial_candidate(
    '30000000-0000-4000-8000-000000000099',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_result->>'error' <> 'phone_already_has_active' THEN
    RAISE EXCEPTION 'active client was reopened: %', v_result;
  END IF;

  UPDATE public.subscriptions
  SET active_until = NULL
  WHERE client_id = '30000000-0000-4000-8000-000000000003';
  UPDATE public.trial_intakes
  SET reviewed_at = now() - interval '10 days'
  WHERE client_id = '30000000-0000-4000-8000-000000000003';

  v_result := public.admin_reopen_trial_candidate(
    '30000000-0000-4000-8000-000000000099',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_result->>'error' <> 'reapply_cooldown' THEN
    RAISE EXCEPTION 'reapplication cooldown was bypassed: %', v_result;
  END IF;

  UPDATE public.trial_intakes
  SET reviewed_at = now() - interval '40 days'
  WHERE client_id = '30000000-0000-4000-8000-000000000003';

  v_result := public.admin_reopen_trial_candidate(
    '30000000-0000-4000-8000-000000000099',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF NOT COALESCE((v_result->>'success')::boolean, false)
     OR v_result->>'intake_status' <> 'invite_prepared' THEN
    RAISE EXCEPTION 'reapplication failed: %', v_result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.trial_intakes
    WHERE client_id = '30000000-0000-4000-8000-000000000003'
      AND answers_encrypted IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'reapplication retained old encrypted answers';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.client_sessions
    WHERE client_id = '30000000-0000-4000-8000-000000000003'
      AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'reapplication retained an active old session';
  END IF;
END
$test$;

DO $test$
BEGIN
  IF public.purge_expired_trial_intakes() <> 1 THEN
    RAISE EXCEPTION 'abandoned intake was not purged';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.trial_intakes
    WHERE client_id = '30000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'abandoned invite survived 30-day cleanup';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.trial_intakes
    WHERE client_id = '30000000-0000-4000-8000-000000000004'
      AND status = 'needs_clarification'
  ) THEN
    RAISE EXCEPTION 'fresh clarification was purged using stale client activity';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.trial_queue
    WHERE client_id = '30000000-0000-4000-8000-000000000002'
      AND status = 'canceled'
      AND source = 'trial_intake_purged'
  ) THEN
    RAISE EXCEPTION 'purged intake did not leave a canceled queue marker';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.client_sessions
    WHERE client_id = '30000000-0000-4000-8000-000000000002'
      AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'purged intake retained an active PIN session';
  END IF;
  IF public.admin_activate_trial(
    '30000000-0000-4000-8000-000000000002',
    current_date,
    7,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )->>'error' <> 'intake_not_approved' THEN
    RAISE EXCEPTION 'purged intake was activated through the legacy path';
  END IF;
  IF has_function_privilege(
    'heys_rpc',
    'public.admin_review_trial_intake(uuid,text,text,text,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'heys_admin',
    'public.admin_review_trial_intake(uuid,text,text,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'legacy review RPC remains executable';
  END IF;
  IF has_function_privilege(
    'heys_rpc', 'public.admin_convert_lead(uuid,uuid)', 'EXECUTE'
  ) OR has_function_privilege(
    'heys_admin', 'public.admin_convert_lead(uuid,uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'direct non-atomic lead conversion remains executable';
  END IF;
  IF NOT has_function_privilege(
    'heys_rpc', 'public.admin_remove_from_queue(uuid,text,uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'hardened legacy queue removal is unavailable to gateway role';
  END IF;
  IF (
    SELECT COUNT(DISTINCT action) FROM public.test_data_access_log
    WHERE action IN ('prepare_trial_invite', 'mark_trial_invite_sent',
                     'activate_trial_intake', 'purge_trial_intake')
  ) <> 4 THEN
    RAISE EXCEPTION 'transition audit chronology is incomplete';
  END IF;
END
$test$;

UPDATE public.consents
SET granted = false, is_active = false, revoked_at = now()
WHERE client_id = '30000000-0000-4000-8000-000000000004'
  AND consent_type = 'health_data';

DO $test$
DECLARE
  v_result JSONB;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.trial_intakes
    WHERE client_id = '30000000-0000-4000-8000-000000000004'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.trial_queue
    WHERE client_id = '30000000-0000-4000-8000-000000000004'
      AND status = 'canceled' AND source = 'trial_intake_health_revoked'
  ) THEN
    RAISE EXCEPTION 'health revoke did not leave a blocking tombstone';
  END IF;
  v_result := public.admin_activate_trial(
    '30000000-0000-4000-8000-000000000004', current_date, 7,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_result->>'error' <> 'intake_not_approved' THEN
    RAISE EXCEPTION 'health-revoked candidate used legacy activation: %', v_result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.test_data_access_log
    WHERE metadata::text ~* '(Уточните|Режим|token-v2|7999)'
  ) THEN
    RAISE EXCEPTION 'audit metadata leaked intake or identity data';
  END IF;
END
$test$;

SELECT 'trial intake v2 migration integration OK' AS result;
`;

const v3AssertionsSql = String.raw`
\set ON_ERROR_STOP on

INSERT INTO public.leads (
  id, name, phone, messenger, status, birth_year, ip_address,
  consent_privacy_version, consent_user_agent, consent_accepted_at
) VALUES (
  '10000000-0000-4000-8000-000000000013', 'Candidate V3', '+7 999 111-33-13',
  'telegram', 'new', 1990, '127.0.0.1', '1.7', 'integration-test', now()
);

DO $test$
DECLARE
  v_prepare JSONB; v_candidate_id UUID; v_login JSONB; v_token TEXT;
  v_save JSONB; v_review JSONB; v_updated TIMESTAMPTZ;
  v_answers JSONB := '{
    "goals":{"primary_goal":"Режим","success_definition":"Стабильность"},
    "experience":{"previous_experience":"self"},
    "lifestyle":{"schedule":"Работа","sleep":"8 часов"},
    "collaboration":{"daily_tracking":"yes","feedback_style":"concise"},
    "health":{"chronic_conditions_status":"no","medications_status":"no","injuries_operations_status":"no","allergies_status":"no","doctor_restrictions_status":"no"},
    "safety":{"acute_symptoms":"no","recent_surgery":"no","active_ed_concern":"no","medical_supervision":"no"},
    "meta":{"schema_version":"1.1"}
  }'::jsonb;
BEGIN
  v_prepare := public.admin_prepare_trial_candidate_from_lead(
    '10000000-0000-4000-8000-000000000013',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF NOT COALESCE((v_prepare->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'v3 prepare failed: %', v_prepare;
  END IF;
  v_candidate_id := (v_prepare->>'candidate_id')::uuid;
  IF (SELECT count(*) FROM public.clients WHERE phone LIKE '%3313') <> 0
     OR EXISTS (SELECT 1 FROM public.trial_queue q JOIN public.clients c ON c.id = q.client_id WHERE c.phone LIKE '%3313') THEN
    RAISE EXCEPTION 'prepare created client or queue before review';
  END IF;
  IF public.admin_prepare_trial_candidate_from_lead(
    '10000000-0000-4000-8000-000000000013',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )->>'error' <> 'candidate_already_exists' THEN
    RAISE EXCEPTION 'duplicate prepare was not rejected';
  END IF;
  v_prepare := public.admin_regenerate_trial_candidate_pin(
    v_candidate_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_prepare->>'pin' IS NULL THEN RAISE EXCEPTION 'candidate PIN regeneration failed'; END IF;
  PERFORM public.admin_mark_trial_candidate_invite_sent(v_candidate_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  v_login := public.verify_trial_candidate_pin('+7 999 111-33-13', v_prepare->>'pin');
  v_token := v_login->>'candidate_session_token';
  IF v_token IS NULL THEN RAISE EXCEPTION 'candidate login failed: %', v_login; END IF;
  IF public.accept_trial_candidate_health_consent_by_candidate_session(
    v_token, '1.5', '127.0.0.1', 'integration-test'
  )->>'success' <> 'true' THEN RAISE EXCEPTION 'candidate consent failed'; END IF;
  v_save := public.save_trial_candidate_intake_by_candidate_session(v_token, v_answers, 5::smallint, true, NULL);
  IF v_save->>'status' <> 'completed' THEN RAISE EXCEPTION 'candidate submit failed: %', v_save; END IF;
  SELECT updated_at INTO v_updated FROM public.trial_candidates WHERE id = v_candidate_id;
  v_review := public.admin_review_trial_candidate_v3(
    v_candidate_id, 'approved_waiting_slot', NULL, 'Нет свободного места', NULL, NULL,
    '{"within_scope":true,"understands_boundaries":true,"ready_to_track":true,"realistic_expectations":true,"safe_format":true,"slot_available":false}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_updated
  );
  IF v_review->>'status' <> 'approved_waiting_slot'
     OR EXISTS (SELECT 1 FROM public.clients WHERE phone LIKE '%3313') THEN
    RAISE EXCEPTION 'waiting decision created a client: %', v_review;
  END IF;
  SELECT updated_at INTO v_updated FROM public.trial_candidates WHERE id = v_candidate_id;
  v_review := public.admin_review_trial_candidate_v3(
    v_candidate_id, 'approved', NULL, 'Проверено', NULL, NULL,
    '{"within_scope":true,"understands_boundaries":true,"ready_to_track":true,"realistic_expectations":true,"safe_format":true,"slot_available":true}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_updated
  );
  IF v_review->>'status' <> 'promoted' OR v_review->>'client_id' IS NULL OR v_review->>'pin' IS NULL THEN
    RAISE EXCEPTION 'approval did not create client: %', v_review;
  END IF;
  IF (SELECT count(*) FROM public.clients WHERE id = (v_review->>'client_id')::uuid) <> 1
     OR (SELECT count(*) FROM public.trial_queue WHERE client_id = (v_review->>'client_id')::uuid) <> 1 THEN
    RAISE EXCEPTION 'approval did not create exactly one client and queue row';
  END IF;
  IF public.admin_review_trial_candidate_v3(
    v_candidate_id, 'approved', NULL, 'Повтор', NULL, NULL,
    '{"within_scope":true,"understands_boundaries":true,"ready_to_track":true,"realistic_expectations":true,"safe_format":true,"slot_available":true}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_updated
  )->>'error' <> 'review_not_allowed' THEN
    RAISE EXCEPTION 'duplicate approval was not rejected';
  END IF;
END
$test$;

SELECT 'trial intake v3 preclient integration OK' AS result;
`;

const correctionsAssertionsSql = String.raw`
\set ON_ERROR_STOP on

INSERT INTO public.leads (
  id, name, phone, messenger, status, birth_year, ip_address,
  consent_privacy_version, consent_user_agent, consent_accepted_at
) VALUES
  ('10000000-0000-4000-8000-000000000014', 'Correction Candidate', '+7 999 111-44-14',
   'telegram', 'new', 1991, '127.0.0.1', '1.7', 'integration-test', now()),
  ('10000000-0000-4000-8000-000000000015', 'Rejected Candidate', '+7 999 111-44-15',
   'telegram', 'new', 1992, '127.0.0.1', '1.7', 'integration-test', now()),
  ('10000000-0000-4000-8000-000000000016', 'Legacy Candidate', '+7 999 111-44-16',
   'telegram', 'new', 1993, '127.0.0.1', '1.7', 'integration-test', now());

DO $test$
DECLARE
  v_prepare JSONB;
  v_candidate_id UUID;
  v_login JSONB;
  v_token TEXT;
  v_updated TIMESTAMPTZ;
  v_correction JSONB;
  v_second_correction JSONB;
  v_reversal JSONB;
  v_review JSONB;
  v_read JSONB;
  v_client_id UUID;
  v_export JSONB;
  v_answers JSONB := '{
    "goals":{"primary_goal":"Режим","success_definition":"Стабильность"},
    "experience":{"previous_experience":"self"},
    "lifestyle":{"schedule":"Работа","sleep":"8 часов"},
    "collaboration":{"daily_tracking":"unsure","feedback_style":"concise"},
    "health":{"chronic_conditions_status":"no","medications_status":"no","injuries_operations_status":"no","allergies_status":"no","doctor_restrictions_status":"no"},
    "safety":{"acute_symptoms":"no","recent_surgery":"no","active_ed_concern":"no","medical_supervision":"no"},
    "meta":{"schema_version":"1.1"}
  }'::jsonb;
  v_checklist JSONB := '{
    "within_scope":true,"understands_boundaries":true,"ready_to_track":true,
    "realistic_expectations":true,"safe_format":true
  }'::jsonb;
BEGIN
  IF public.validate_trial_intake_answers_v2(v_answers, true) IS NOT NULL THEN
    RAISE EXCEPTION 'daily_tracking=unsure was rejected';
  END IF;

  v_prepare := public.admin_prepare_trial_candidate_from_lead(
    '10000000-0000-4000-8000-000000000014',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  v_candidate_id := (v_prepare->>'candidate_id')::uuid;
  PERFORM public.admin_mark_trial_candidate_invite_sent(
    v_candidate_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  v_login := public.verify_trial_candidate_pin('+7 999 111-44-14', v_prepare->>'pin');
  v_token := v_login->>'candidate_session_token';
  PERFORM public.accept_trial_candidate_health_consent_by_candidate_session(
    v_token, '1.5', '127.0.0.1', 'integration-test'
  );
  IF public.save_trial_candidate_intake_by_candidate_session(
    v_token, v_answers, 5::smallint, true, NULL
  )->>'status' <> 'completed' THEN
    RAISE EXCEPTION 'correction candidate submit failed';
  END IF;
  SELECT updated_at INTO v_updated FROM public.trial_candidates WHERE id = v_candidate_id;

  IF public.admin_add_trial_candidate_answer_correction_v1(
    v_candidate_id, 'collaboration.daily_tracking', '"yes"'::jsonb,
    'phone', 'Подтверждено в разговоре', true, false,
    '40000000-0000-4000-8000-000000000001', NULL,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_updated
  )->>'error' <> 'forbidden' THEN
    RAISE EXCEPTION 'foreign curator added a correction';
  END IF;
  IF public.admin_add_trial_candidate_answer_correction_v1(
    v_candidate_id, 'meta.schema_version', '"2.0"'::jsonb,
    'phone', 'Недопустимое поле', true, false,
    '40000000-0000-4000-8000-000000000002', NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_updated
  )->>'error' <> 'unknown_question_id' THEN
    RAISE EXCEPTION 'question allowlist accepted metadata mutation';
  END IF;
  IF public.admin_add_trial_candidate_answer_correction_v1(
    v_candidate_id, 'safety.acute_symptoms', '"yes"'::jsonb,
    'phone', 'Safety требует подтверждения', true, false,
    '40000000-0000-4000-8000-000000000003', NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_updated
  )->>'error' <> 'safety_confirmation_required' THEN
    RAISE EXCEPTION 'unsafe correction skipped explicit confirmation';
  END IF;

  v_correction := public.admin_add_trial_candidate_answer_correction_v1(
    v_candidate_id, 'collaboration.daily_tracking', '"yes"'::jsonb,
    'phone', 'Подтверждено в разговоре', true, false,
    '40000000-0000-4000-8000-000000000004', NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_updated
  );
  IF v_correction->>'revision_no' <> '1' THEN
    RAISE EXCEPTION 'valid correction failed: %', v_correction;
  END IF;
  IF public.admin_add_trial_candidate_answer_correction_v1(
    v_candidate_id, 'collaboration.daily_tracking', '"yes"'::jsonb,
    'phone', 'Подтверждено в разговоре', true, false,
    '40000000-0000-4000-8000-000000000004', NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_updated
  )->>'replayed' <> 'true' THEN
    RAISE EXCEPTION 'idempotent correction retry did not replay';
  END IF;
  IF public.admin_add_trial_candidate_answer_correction_v1(
    v_candidate_id, 'collaboration.daily_tracking', '"no"'::jsonb,
    'phone', 'Другая нагрузка', true, false,
    '40000000-0000-4000-8000-000000000004', NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', (v_correction->>'updated_at')::timestamptz
  )->>'error' <> 'idempotency_conflict' THEN
    RAISE EXCEPTION 'request id was reused with a different payload';
  END IF;
  v_second_correction := public.admin_add_trial_candidate_answer_correction_v1(
    v_candidate_id, 'collaboration.feedback_style', '"direct"'::jsonb,
    'messenger', 'Уточнён стиль обратной связи', true, false,
    '40000000-0000-4000-8000-000000000006', NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (v_correction->>'updated_at')::timestamptz
  );
  v_reversal := public.admin_add_trial_candidate_answer_correction_v1(
    v_candidate_id, 'collaboration.feedback_style', '"concise"'::jsonb,
    'messenger', 'Кандидат вернул исходный вариант', true, false,
    '40000000-0000-4000-8000-000000000007',
    (v_second_correction->>'correction_id')::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (v_second_correction->>'updated_at')::timestamptz
  );
  IF v_reversal->>'revision_no' <> '3' THEN
    RAISE EXCEPTION 'append-only reversal failed: % / %', v_second_correction, v_reversal;
  END IF;
  IF public.admin_add_trial_candidate_answer_correction_v1(
    v_candidate_id, 'collaboration.feedback_style', '"direct"'::jsonb,
    'messenger', 'Устаревшая вкладка', true, false,
    '40000000-0000-4000-8000-000000000005', NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_updated
  )->>'error' <> 'stale_intake' THEN
    RAISE EXCEPTION 'stale correction overwrote current history';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.trial_candidate_sessions
    WHERE candidate_id = v_candidate_id AND revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'candidate session survived curator correction'; END IF;

  v_read := public.admin_get_trial_candidate(
    v_candidate_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  IF v_read #>> '{intake,original_answers,collaboration,daily_tracking}' <> 'unsure'
     OR v_read #>> '{intake,answers,collaboration,daily_tracking}' <> 'yes'
     OR v_read #>> '{intake,answers,collaboration,feedback_style}' <> 'concise'
     OR jsonb_array_length(v_read #> '{intake,answer_corrections}') <> 3
     OR v_read #>> '{intake,answer_corrections,0,communication_channel}' <> 'phone' THEN
    RAISE EXCEPTION 'original/effective/history read contract is wrong: %', v_read;
  END IF;
  IF public.decrypt_health_data((
    SELECT answers_encrypted FROM public.trial_candidates WHERE id = v_candidate_id
  )) #>> '{collaboration,daily_tracking}' <> 'unsure' THEN
    RAISE EXCEPTION 'candidate original answer was overwritten';
  END IF;

  v_review := public.admin_review_trial_candidate_v4(
    v_candidate_id, 'needs_clarification', NULL, NULL, v_checklist,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (v_reversal->>'updated_at')::timestamptz
  );
  IF v_review->>'error' <> 'invalid_action' THEN
    RAISE EXCEPTION 'v4 accepted removed clarification action: %', v_review;
  END IF;
  v_review := public.admin_review_trial_candidate_v4(
    v_candidate_id, 'approved', NULL, 'Проверено', v_checklist,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (v_reversal->>'updated_at')::timestamptz
  );
  IF v_review->>'status' <> 'promoted' THEN RAISE EXCEPTION 'v4 approval failed: %', v_review; END IF;
  v_client_id := (v_review->>'client_id')::uuid;
  IF public.decrypt_health_data((
    SELECT answers_encrypted FROM public.trial_intakes WHERE client_id = v_client_id
  )) #>> '{collaboration,daily_tracking}' <> 'yes' THEN
    RAISE EXCEPTION 'promotion did not persist effective answers';
  END IF;
  IF (SELECT count(*) FROM public.clients WHERE id = v_client_id) <> 1
     OR (SELECT count(*) FROM public.trial_queue WHERE client_id = v_client_id) <> 1
     OR (SELECT count(*) FROM public.trial_candidate_answer_corrections WHERE candidate_id = v_candidate_id) <> 3 THEN
    RAISE EXCEPTION 'promotion cardinality/history invariant failed';
  END IF;
  IF public.admin_review_trial_candidate_v4(
    v_candidate_id, 'approved', NULL, 'Повтор', v_checklist,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_updated
  )->>'already_applied' <> 'true' THEN
    RAISE EXCEPTION 'repeat approval was not idempotent';
  END IF;

  INSERT INTO public.client_sessions(token_hash, client_id, expires_at)
  VALUES (digest('promoted-dsar-token', 'sha256'), v_client_id, now() + interval '1 hour');
  v_export := public.export_my_data_by_session('promoted-dsar-token');
  IF v_export #>> '{trial_candidate_history,original_answers,collaboration,daily_tracking}' <> 'unsure'
     OR v_export #>> '{trial_candidate_history,effective_answers,collaboration,daily_tracking}' <> 'yes'
     OR jsonb_array_length(v_export #> '{trial_candidate_history,answer_corrections}') <> 3 THEN
    RAISE EXCEPTION 'DSAR omitted candidate correction history: %', v_export;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.trial_candidate_audit_events
    WHERE candidate_id = v_candidate_id
      AND metadata::text ~* '(daily_tracking|Подтверждено|"yes"|"unsure")'
  ) THEN RAISE EXCEPTION 'audit metadata leaked correction contents'; END IF;
END
$test$;

DO $test$
DECLARE
  v_prepare JSONB;
  v_candidate_id UUID;
  v_login JSONB;
  v_token TEXT;
  v_updated TIMESTAMPTZ;
  v_review JSONB;
  v_answers JSONB := '{
    "goals":{"primary_goal":"Режим","success_definition":"Стабильность"},
    "experience":{"previous_experience":"self"},
    "lifestyle":{"schedule":"Работа","sleep":"8 часов"},
    "collaboration":{"daily_tracking":"yes","feedback_style":"concise"},
    "health":{"chronic_conditions_status":"no","medications_status":"no","injuries_operations_status":"no","allergies_status":"no","doctor_restrictions_status":"no"},
    "safety":{"acute_symptoms":"no","recent_surgery":"no","active_ed_concern":"no","medical_supervision":"no"},
    "meta":{"schema_version":"1.1"}
  }'::jsonb;
  v_checklist JSONB := '{
    "within_scope":true,"understands_boundaries":true,"ready_to_track":true,
    "realistic_expectations":true,"safe_format":true
  }'::jsonb;
BEGIN
  v_prepare := public.admin_prepare_trial_candidate_from_lead(
    '10000000-0000-4000-8000-000000000015',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  v_candidate_id := (v_prepare->>'candidate_id')::uuid;
  PERFORM public.admin_mark_trial_candidate_invite_sent(
    v_candidate_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  v_login := public.verify_trial_candidate_pin('+7 999 111-44-15', v_prepare->>'pin');
  v_token := v_login->>'candidate_session_token';
  PERFORM public.accept_trial_candidate_health_consent_by_candidate_session(
    v_token, '1.5', '127.0.0.1', 'integration-test'
  );
  PERFORM public.save_trial_candidate_intake_by_candidate_session(
    v_token, v_answers, 5::smallint, true, NULL
  );
  SELECT updated_at INTO v_updated FROM public.trial_candidates WHERE id = v_candidate_id;
  v_review := public.admin_review_trial_candidate_v4(
    v_candidate_id, 'rejected', 'format_mismatch', 'Формат не подходит', v_checklist,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_updated
  );
  IF v_review->>'status' <> 'rejected'
     OR EXISTS (SELECT 1 FROM public.clients WHERE phone LIKE '%4415') THEN
    RAISE EXCEPTION 'rejection created a client: %', v_review;
  END IF;
END
$test$;

DO $test$
DECLARE
  v_prepare JSONB;
  v_candidate_id UUID;
  v_updated TIMESTAMPTZ;
BEGIN
  v_prepare := public.admin_prepare_trial_candidate_from_lead(
    '10000000-0000-4000-8000-000000000016',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  v_candidate_id := (v_prepare->>'candidate_id')::uuid;
  UPDATE public.trial_candidates
  SET status = 'approved_waiting_slot', answers_encrypted = public.encrypt_health_data('{
    "goals":{"primary_goal":"Режим","success_definition":"Стабильность"},
    "experience":{"previous_experience":"self"},
    "lifestyle":{"schedule":"Работа","sleep":"8 часов"},
    "collaboration":{"daily_tracking":"yes","feedback_style":"concise"},
    "health":{"chronic_conditions_status":"no","medications_status":"no","injuries_operations_status":"no","allergies_status":"no","doctor_restrictions_status":"no"},
    "safety":{"acute_symptoms":"no","recent_surgery":"no","active_ed_concern":"no","medical_supervision":"no"},
    "meta":{"schema_version":"1.1"}
  }'::jsonb), updated_at = clock_timestamp()
  WHERE id = v_candidate_id RETURNING updated_at INTO v_updated;
  IF public.admin_review_trial_candidate_v4(
    v_candidate_id, 'rejected', 'candidate_withdrew', 'Кандидат отказался',
    '{"within_scope":true,"understands_boundaries":true,"ready_to_track":true,"realistic_expectations":true,"safe_format":true}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_updated
  )->>'status' <> 'rejected' THEN
    RAISE EXCEPTION 'legacy waiting status is not compatible with v4 review';
  END IF;
END
$test$;

DO $test$
BEGIN
  IF has_table_privilege('heys_rpc', 'public.trial_candidate_answer_corrections', 'SELECT')
     OR has_table_privilege('heys_rpc', 'public.trial_candidate_answer_corrections', 'INSERT')
     OR has_table_privilege('heys_rpc', 'public.trial_candidate_answer_corrections', 'UPDATE')
     OR has_table_privilege('heys_rpc', 'public.trial_candidate_answer_corrections', 'DELETE') THEN
    RAISE EXCEPTION 'gateway role has direct correction-ledger privileges';
  END IF;
  IF has_table_privilege('heys_admin', 'public.trial_candidate_answer_corrections', 'UPDATE')
     OR has_table_privilege('heys_admin', 'public.trial_candidate_answer_corrections', 'DELETE') THEN
    RAISE EXCEPTION 'definer role can mutate correction history';
  END IF;
  IF has_function_privilege('heys_rpc', 'public.admin_convert_lead(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('heys_admin', 'public.admin_convert_lead(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'nested conversion is not owner-only';
  END IF;
  IF NOT has_function_privilege(
    'heys_rpc',
    'public.admin_add_trial_candidate_answer_correction_v1(uuid,text,jsonb,text,text,boolean,boolean,uuid,uuid,uuid,timestamptz)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'heys_rpc',
    'public.admin_review_trial_candidate_v4(uuid,text,text,text,jsonb,uuid,timestamptz)',
    'EXECUTE'
  ) THEN RAISE EXCEPTION 'new curator RPC is unavailable to gateway'; END IF;
END
$test$;

SELECT 'trial candidate answer corrections v1 integration OK' AS result;
`;

let started = false;
try {
  run('initdb', ['-D', dataDir, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8']);
  mkdirSync(socketDir);
  run('pg_ctl', [
    '-D', dataDir,
    '-l', path.join(tempRoot, 'postgres.log'),
    '-o', `-F -k ${socketDir} -p ${port}`,
    '-w', 'start',
  ]);
  started = true;

  const psqlArgs = ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socketDir, '-p', String(port), '-U', 'postgres', '-d', 'postgres'];
  run('psql', psqlArgs, setupSql);
  run('psql', psqlArgs, readFileSync(migrationPath, 'utf8'));
  run('psql', psqlArgs, readFileSync(consentProofPath, 'utf8'));
  run('psql', psqlArgs, readFileSync(reconsentFixPath, 'utf8'));
  const output = run('psql', psqlArgs, assertionsSql);
  process.stdout.write(output);
  run('psql', psqlArgs, readFileSync(v2MigrationPath, 'utf8'));
  const v2Output = run('psql', psqlArgs, v2AssertionsSql);
  run('psql', psqlArgs, readFileSync(v3MigrationPath, 'utf8'));
  const v3Output = run('psql', psqlArgs, v3AssertionsSql);
  run('psql', psqlArgs, readFileSync(trialPreparePermissionPath, 'utf8'));
  run('psql', psqlArgs, readFileSync(correctionsMigrationPath, 'utf8'));
  const correctionsOutput = run('psql', psqlArgs, correctionsAssertionsSql);
  process.stdout.write(v2Output);
  process.stdout.write(v3Output);
  process.stdout.write(correctionsOutput);
} finally {
  if (started) {
    try { run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']); } catch (error) {
      console.error(error.message);
    }
  }
  rmSync(tempRoot, { recursive: true, force: true });
}
