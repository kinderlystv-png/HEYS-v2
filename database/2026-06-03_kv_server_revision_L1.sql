-- 2026-06-03 L1: server-side KV revision foundation (DORMANT — no reader yet).
--
-- Adds a monotonic `revision` per client_kv_store row and carries it into change
-- markers as a per-scope high-watermark. Nothing reads `revision` until L2/L3, so
-- behaviour is unchanged. Backward-compat: the column has a DEFAULT + a BEFORE
-- trigger, so un-upgraded clients (which never send or read it) keep working; the
-- column "warms up" before any reader ships.
--
-- Split out of the monolithic draft 2026-06-03_kv_server_revision.sql.
-- L2 (reads expose revision) = _L2.sql; L4 (batch_upsert soft-CAS) = _L4.sql (deferred).
-- client_kv_store is small (~1.4k rows, 5 MB) → backfill is instant, no lock concern.
-- Idempotent: safe to re-run.

-- 1. Monotonic global sequence. One space for all clients. We NEVER compare revisions
--    across the migration boundary, so the historical backfill order is irrelevant —
--    clients must treat the first observed server_revision as an OPAQUE baseline, not
--    as "revision ≈ time".
CREATE SEQUENCE IF NOT EXISTS public.client_kv_revision_seq AS bigint;

-- 2. revision column: add nullable (instant, no rewrite), backfill, then NOT NULL +
--    DEFAULT (both metadata-only on PG11+; SET NOT NULL scans but does not rewrite).
ALTER TABLE public.client_kv_store
  ADD COLUMN IF NOT EXISTS revision bigint;

UPDATE public.client_kv_store
SET revision = nextval('public.client_kv_revision_seq')
WHERE revision IS NULL;

ALTER TABLE public.client_kv_store
  ALTER COLUMN revision SET NOT NULL,
  ALTER COLUMN revision SET DEFAULT nextval('public.client_kv_revision_seq');

CREATE INDEX IF NOT EXISTS idx_client_kv_store_client_revision
  ON public.client_kv_store (client_id, revision DESC);

-- 3. Per-scope revision high-watermark on change markers.
ALTER TABLE public.client_change_markers
  ADD COLUMN IF NOT EXISTS changed_revision bigint NOT NULL DEFAULT 0;

-- 4. BEFORE trigger: assign a fresh revision ONLY on real content change.
--    The no-op guard is LOAD-BEARING for the CAS-with-debounce design (L3+): a no-op
--    re-save (identical v — e.g. an idempotent merge write-back) must NOT advance the
--    revision, or the client's own next write would look stale against itself.
--    updated_at is intentionally NOT in the change set: it is touched on every UPDATE
--    by update_client_kv_store_updated_at; revision tracks content, not touch.
CREATE OR REPLACE FUNCTION public.bump_client_kv_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.revision IS NULL OR NEW.revision <= 0 THEN
      NEW.revision := nextval('public.client_kv_revision_seq');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.v IS DISTINCT FROM OLD.v
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.key_version IS DISTINCT FROM OLD.key_version
       OR NEW.v_encrypted IS DISTINCT FROM OLD.v_encrypted THEN
      NEW.revision := nextval('public.client_kv_revision_seq');
    ELSE
      NEW.revision := OLD.revision;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bump_client_kv_revision ON public.client_kv_store;
CREATE TRIGGER trg_bump_client_kv_revision
BEFORE INSERT OR UPDATE ON public.client_kv_store
FOR EACH ROW EXECUTE FUNCTION public.bump_client_kv_revision();

-- 5. fn_bump_change_marker: carry the row's revision into the scope marker as a
--    monotonic high-watermark. Scope routing is IDENTICAL to the live function
--    (day:<date> / widgets / profile / norms / hr_zones / planning / products / other),
--    diffed against live before writing — only `changed_revision` is added.
--    This is the AFTER trigger trg_bump_change_marker; NEW.revision is already set by
--    the BEFORE trigger above by the time this runs.
CREATE OR REPLACE FUNCTION public.fn_bump_change_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_scope text;
  v_key text;
  v_cid uuid;
  v_revision bigint;
begin
  v_key := coalesce(NEW.k, OLD.k);
  v_cid := coalesce(NEW.client_id, OLD.client_id);
  v_revision := coalesce(NEW.revision, OLD.revision, 0);

  if not exists (select 1 from clients where id = v_cid) then
    return coalesce(NEW, OLD);
  end if;

  if v_key ~ '^heys_dayv2_\d{4}-\d{2}-\d{2}$' then
    v_scope := 'day:' || substring(v_key from '\d{4}-\d{2}-\d{2}$');
  elsif v_key like '%widget_layout%' then
    v_scope := 'widgets';
  elsif v_key = 'heys_profile' then
    v_scope := 'profile';
  elsif v_key = 'heys_norms' then
    v_scope := 'norms';
  elsif v_key = 'heys_hr_zones' then
    v_scope := 'hr_zones';
  elsif v_key like 'heys_planning_%' then
    v_scope := 'planning';
  elsif v_key like '%products%' then
    v_scope := 'products';
  else
    v_scope := 'other';
  end if;

  insert into client_change_markers (client_id, scope, changed_at, changed_revision)
  values (v_cid, v_scope, now(), v_revision)
  on conflict (client_id, scope)
  do update set
    changed_at = now(),
    changed_revision = greatest(client_change_markers.changed_revision, excluded.changed_revision);

  return coalesce(NEW, OLD);
end$function$;
