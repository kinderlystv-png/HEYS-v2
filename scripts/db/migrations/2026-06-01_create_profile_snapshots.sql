-- 2026-06-01: profile_snapshots — pre-write копии heys_profile перед wholesale-changes
--
-- Context: extends 4-layer profile pollution defense. Когда merge_save detect-ит
-- 3+ identity-fields change (wholesale_identity_change anomaly) или
-- cross_client_profile_blocked — снимок prev_v идёт сюда для instant rollback
-- через RPC restore_profile_snapshot(snapshot_id).
--
-- Retention: 30 дней (cleanup в heys-maintenance daily_cleanup).
--
-- Rollback: inline ниже.

BEGIN;

CREATE TABLE IF NOT EXISTS public.profile_snapshots (
  id         bigserial PRIMARY KEY,
  client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  prev_v     jsonb NOT NULL,
  new_v      jsonb,
  reason     text NOT NULL,    -- 'wholesale_identity_change' | 'cross_client_blocked' | 'manual'
  changed_fields text[],
  writer_cid uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_snapshots_client_ts
  ON public.profile_snapshots (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_snapshots_created_at
  ON public.profile_snapshots (created_at);

COMMENT ON TABLE  public.profile_snapshots IS
  'Pre-write копии heys_profile перед wholesale identity changes / cross-client block. TTL 30d.';
COMMENT ON COLUMN public.profile_snapshots.prev_v IS
  'Полный JSON профиля ДО изменения. Источник для restore_profile_snapshot RPC.';

-- Простой RPC для restore (curator-only через auth check в caller)
CREATE OR REPLACE FUNCTION public.restore_profile_snapshot(p_snapshot_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_client_id uuid;
  v_prev_v    jsonb;
BEGIN
  SELECT client_id, prev_v INTO v_client_id, v_prev_v
    FROM public.profile_snapshots
   WHERE id = p_snapshot_id;
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'snapshot_not_found');
  END IF;

  -- Через safe_upsert_client_kv чтобы пройти все защиты
  PERFORM public.safe_upsert_client_kv(v_client_id, 'heys_profile', v_prev_v);

  RETURN jsonb_build_object(
    'ok', true,
    'client_id', v_client_id,
    'restored_fields', jsonb_object_keys(v_prev_v)
  );
END;
$$;

COMMENT ON FUNCTION public.restore_profile_snapshot IS
  'Откатывает heys_profile клиента к сохранённому pre-write snapshot. См. profile_snapshots.';

COMMIT;

-- ===== ROLLBACK =====
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.restore_profile_snapshot(bigint);
-- DROP TABLE IF EXISTS public.profile_snapshots;
-- COMMIT;
