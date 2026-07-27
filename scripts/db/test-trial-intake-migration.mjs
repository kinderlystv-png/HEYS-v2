#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = path.join(repoRoot, 'database/2026-07-27_trial_intake_flow.sql');
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

CREATE TABLE public.client_sessions (
  token_hash BYTEA PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE public.trial_queue (
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  queued_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.trial_queue_events (
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  meta JSONB
);

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
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.subscriptions (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  trial_approved_at TIMESTAMPTZ
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
RETURNS UUID LANGUAGE sql AS $func$ SELECT gen_random_uuid() $func$;

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
  'telegram', 'new', 1990, '127.0.0.1', '1.6', 'integration-test', now()
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
  IF (SELECT document_version FROM public.consents WHERE client_id = v_client_id AND consent_type = 'personal_data') <> '1.6' THEN
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
  ('20000000-0000-4000-8000-000000000005', 'Client E', '79990000005', '+79990000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO public.consents (client_id, consent_type, document_version, signature_method)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'health_data', '1.5', 'checkbox'),
  ('20000000-0000-4000-8000-000000000002', 'health_data', '1.5', 'checkbox'),
  ('20000000-0000-4000-8000-000000000004', 'health_data', '1.5', 'checkbox'),
  ('20000000-0000-4000-8000-000000000005', 'health_data', '1.4', 'checkbox');

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
  run('psql', psqlArgs, readFileSync(reconsentFixPath, 'utf8'));
  const output = run('psql', psqlArgs, assertionsSql);
  process.stdout.write(output);
} finally {
  if (started) {
    try { run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']); } catch (error) {
      console.error(error.message);
    }
  }
  rmSync(tempRoot, { recursive: true, force: true });
}
