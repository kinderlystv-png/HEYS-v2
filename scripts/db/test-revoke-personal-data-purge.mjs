#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = path.join(
  repoRoot,
  'scripts/db/migrations/2026-08-13_revoke_personal_data_purge_v1.sql',
);
const priorRevokePath = path.join(
  repoRoot,
  'scripts/db/migrations/2026-08-13_revoke_consent_detach_push_v1.sql',
);
const auditUnmaskPath = path.join(
  repoRoot,
  'scripts/db/migrations/2026-05-30_unmask_health_keys_in_audit_log.sql',
);

const binCandidates = [
  process.env.POSTGRES_BIN,
  '/usr/local/opt/postgresql@15/bin',
  '/opt/homebrew/opt/postgresql@15/bin',
].filter(Boolean);
const pgBin = binCandidates.find((dir) => existsSync(path.join(dir, 'initdb')));

if (!pgBin) {
  console.error('revoke-personal-data purge test requires PostgreSQL 15 binaries (set POSTGRES_BIN)');
  process.exit(1);
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'heys-revoke-pd-'));
const dataDir = path.join(tempRoot, 'data');
const socketDir = path.join(tempRoot, 'socket');
const port = 57000 + Math.floor(Math.random() * 3000);

const CLIENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CURATOR_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SESSION_A = 'session-token-client-a';
const MESSAGE_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function run(binary, args, input = null) {
  const result = spawnSync(path.join(pgBin, binary), args, {
    input,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'en_US.UTF-8' },
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

CREATE TABLE public.clients (
  id UUID PRIMARY KEY,
  curator_id UUID
);

CREATE TABLE public.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  document_version TEXT NOT NULL DEFAULT '1.7',
  signature_method TEXT NOT NULL DEFAULT 'checkbox',
  granted BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE public.client_sessions (
  token_hash BYTEA PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE public.client_kv_store (
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  k TEXT NOT NULL,
  v JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (client_id, k)
);

CREATE TABLE public.client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  curator_id UUID,
  sender_role TEXT NOT NULL,
  body TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.message_transcription_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.client_messages(id) ON DELETE CASCADE,
  attachment_path TEXT NOT NULL,
  actor_role TEXT NOT NULL DEFAULT 'client',
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  billable_seconds INTEGER NOT NULL DEFAULT 0,
  estimated_cost_rub NUMERIC(10, 4) NOT NULL DEFAULT 0,
  UNIQUE (message_id, attachment_path)
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.data_access_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accessor_type TEXT NOT NULL,
  accessor_id UUID,
  client_id UUID,
  action TEXT NOT NULL,
  resource_keys TEXT[],
  is_health_data BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profile_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  prev_v JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.leaderboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ews_weekly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  week_start DATE NOT NULL DEFAULT CURRENT_DATE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.messenger_media_cleanup_queue (
  object_path TEXT PRIMARY KEY,
  client_id UUID NOT NULL,
  source_message_id UUID,
  reason TEXT NOT NULL DEFAULT 'message_deleted'
    CHECK (reason IN ('message_deleted', 'abandoned_upload')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry', 'completed')),
  attempts INT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.is_health_key(p_key TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT p_key ~ '^heys_(profile|dayv2_|hr_zones)'
$$;

CREATE OR REPLACE FUNCTION public.require_client_id(p_session_token TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client_id UUID;
BEGIN
  SELECT client_id INTO v_client_id
  FROM public.client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > now() AND revoked_at IS NULL;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'invalid_session'; END IF;
  RETURN v_client_id;
END;
$$;

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
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.data_access_audit_log (
    accessor_type, accessor_id, client_id, action, resource_keys, is_health_data, metadata
  ) VALUES (
    p_accessor_type, p_accessor_id, p_client_id, p_action, p_resource_keys, p_is_health, p_metadata
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  audit_action text;
  old_data jsonb;
  new_data jsonb;
  resource_uuid uuid;
BEGIN
  CASE TG_OP
    WHEN 'INSERT' THEN audit_action := 'create'; old_data := null; new_data := to_jsonb(NEW);
    WHEN 'UPDATE' THEN audit_action := 'update'; old_data := to_jsonb(OLD); new_data := to_jsonb(NEW);
    WHEN 'DELETE' THEN audit_action := 'delete'; old_data := to_jsonb(OLD); new_data := null;
  END CASE;
  IF TG_TABLE_NAME = 'client_kv_store' THEN
    resource_uuid := coalesce(NEW.client_id, OLD.client_id);
  ELSE
    resource_uuid := coalesce(NEW.id, OLD.id);
  END IF;
  INSERT INTO audit_logs (action, resource_type, resource_id, old_values, new_values, metadata)
  VALUES (audit_action, TG_TABLE_NAME, resource_uuid, old_data, new_data, '{}'::jsonb);
  CASE TG_OP WHEN 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END CASE;
END;
$$;

CREATE TRIGGER audit_client_kv_store
  AFTER INSERT OR UPDATE OR DELETE ON public.client_kv_store
  FOR EACH ROW EXECUTE FUNCTION public.trigger_audit_log();
`;

const assertionsSql = String.raw`
\set ON_ERROR_STOP on

INSERT INTO public.clients (id, curator_id) VALUES
  ('${CLIENT_A}', '${CURATOR_ID}'),
  ('${CLIENT_B}', '${CURATOR_ID}');

INSERT INTO public.consents (client_id, consent_type, granted) VALUES
  ('${CLIENT_A}', 'personal_data', true),
  ('${CLIENT_B}', 'personal_data', true);

INSERT INTO public.client_sessions (token_hash, client_id, expires_at) VALUES
  (digest('${SESSION_A}', 'sha256'), '${CLIENT_A}', now() + interval '1 day'),
  (digest('session-token-client-b', 'sha256'), '${CLIENT_B}', now() + interval '1 day');

INSERT INTO public.client_kv_store (client_id, k, v) VALUES
  ('${CLIENT_A}', 'heys_dayv2_2026-08-13', '{"meals":[{"name":"lunch"}]}'::jsonb),
  ('${CLIENT_A}', 'heys_profile', '{"weight":72}'::jsonb),
  ('${CLIENT_A}', 'heys_settings_v1', '{"theme":"dark"}'::jsonb),
  ('${CLIENT_B}', 'heys_dayv2_2026-08-13', '{"meals":[{"name":"neighbor"}]}'::jsonb),
  ('${CLIENT_B}', 'heys_profile', '{"weight":80}'::jsonb);

INSERT INTO public.client_messages (id, client_id, curator_id, sender_role, body, attachments) VALUES
  (
    '${MESSAGE_A}',
    '${CLIENT_A}',
    '${CURATOR_ID}',
    'client',
    'photo meal',
  '[{"path":"${CLIENT_A}/2026-08-13/msg-1/photo.jpg","type":"image"}]'::jsonb
  );

INSERT INTO public.message_transcription_jobs (message_id, attachment_path, client_id)
VALUES ('${MESSAGE_A}', '${CLIENT_A}/2026-08-13/msg-1/photo.jpg', '${CLIENT_A}');

INSERT INTO public.audit_logs (action, resource_type, resource_id, old_values)
VALUES (
  'update',
  'client_kv_store',
  '${CLIENT_A}',
  '{"k":"heys_dayv2_2026-08-13","v":{"meals":[{"name":"lunch"}]}}'::jsonb
);

INSERT INTO public.data_access_audit_log (accessor_type, accessor_id, client_id, action, resource_keys, metadata)
VALUES (
  'client_self', '${CLIENT_A}', '${CLIENT_A}', 'read_diary',
  ARRAY['heys_dayv2_2026-08-13'],
  '{"sample":"diary-copy"}'::jsonb
);

INSERT INTO public.profile_snapshots (client_id, prev_v)
VALUES ('${CLIENT_A}', '{"weight":70}'::jsonb);

INSERT INTO public.push_subscriptions (client_id, endpoint)
VALUES ('${CLIENT_A}', 'https://push.example/a');

DO $test$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.revoke_consent_by_session('${SESSION_A}', 'personal_data');
  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'personal_data revoke failed: %', v_result;
  END IF;
END
$test$;

DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.consents
    WHERE client_id = '${CLIENT_A}' AND consent_type = 'personal_data' AND revoked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'consent row without revoked_at';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = '${CLIENT_A}') THEN
    RAISE EXCEPTION 'client row deleted';
  END IF;
  IF (SELECT COUNT(*) FROM public.client_messages WHERE client_id = '${CLIENT_A}') <> 0 THEN
    RAISE EXCEPTION 'client_messages not purged';
  END IF;
  IF (SELECT COUNT(*) FROM public.message_transcription_jobs WHERE client_id = '${CLIENT_A}') <> 0 THEN
    RAISE EXCEPTION 'message_transcription_jobs not purged';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.client_kv_store
    WHERE client_id = '${CLIENT_A}' AND public.is_client_personal_data_kv_key('${CLIENT_A}', k)
  ) THEN
    RAISE EXCEPTION 'personal KV survived purge';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_kv_store
    WHERE client_id = '${CLIENT_A}' AND k = 'heys_settings_v1'
  ) THEN
    RAISE EXCEPTION 'non-personal KV was deleted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE resource_type = 'client_kv_store' AND resource_id = '${CLIENT_A}'
      AND (old_values::text ILIKE '%meals%' OR new_values::text ILIKE '%meals%')
  ) THEN
    RAISE EXCEPTION 'audit_logs still contain diary payload';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.messenger_media_cleanup_queue
    WHERE client_id = '${CLIENT_A}'
      AND object_path = '${CLIENT_A}/2026-08-13/msg-1/photo.jpg'
      AND reason = 'consent_revoked'
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'media cleanup not queued';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.client_sessions
    WHERE client_id = '${CLIENT_A}' AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'sessions not killed';
  END IF;
  IF (SELECT COUNT(*) FROM public.push_subscriptions WHERE client_id = '${CLIENT_A}') <> 0 THEN
    RAISE EXCEPTION 'push subscriptions not removed';
  END IF;
  IF (SELECT COUNT(*) FROM public.profile_snapshots WHERE client_id = '${CLIENT_A}') <> 0 THEN
    RAISE EXCEPTION 'profile_snapshots not purged';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.data_access_audit_log
    WHERE client_id = '${CLIENT_A}' AND action = 'read_diary'
      AND COALESCE(metadata, '{}'::jsonb) ? 'sample'
  ) THEN
    RAISE EXCEPTION 'data_access_audit_log metadata not scrubbed';
  END IF;
  IF (SELECT COUNT(*) FROM public.client_kv_store WHERE client_id = '${CLIENT_B}') < 2 THEN
    RAISE EXCEPTION 'neighbor client data was affected';
  END IF;
END
$test$;

SELECT 'revoke personal_data purge integration OK' AS result;
`;

let started = false;
try {
  run('initdb', ['-D', dataDir, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8']);
  mkdirSync(socketDir, { recursive: true });
  run('pg_ctl', [
    '-D', dataDir,
    '-l', path.join(tempRoot, 'postgres.log'),
    '-o', `-F -k ${socketDir} -p ${port}`,
    '-w', 'start',
  ]);
  started = true;

  const psqlBase = ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socketDir, '-p', String(port), '-U', 'postgres', '-d', 'postgres'];

  run('psql', psqlBase, setupSql);
  run('psql', psqlBase, readFileSync(auditUnmaskPath, 'utf8'));
  run('psql', psqlBase, readFileSync(priorRevokePath, 'utf8'));
  run('psql', psqlBase, readFileSync(migrationPath, 'utf8'));
  const out = run('psql', psqlBase, assertionsSql);
  if (!out.includes('revoke personal_data purge integration OK')) {
    throw new Error(`unexpected psql output:\n${out}`);
  }
  console.log(out.trim());
} finally {
  if (started) {
    try { run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']); } catch (_) { /* ignore */ }
  }
  rmSync(tempRoot, { recursive: true, force: true });
}
