-- ═══════════════════════════════════════════════════════════════════════════
-- Wave A: curator_kv_store — namespace isolation для UI-state курaтора.
-- Plan ref: curried-stirring-shell.md Wave A
-- ═══════════════════════════════════════════════════════════════════════════
-- Зачем: курaторская сессия с разных устройств (laptop, iPad) должна делить
--   theme / widget layout / whats-new last seen / etc. — но эти данные НЕ
--   принадлежат конкретному клиенту. Раньше interceptor зеркалил их через
--   currentClientId → cross-client pollution (broadcast-bug 2026-05-31, см.
--   NON_CLIENT_DATA_BLACKLIST).
--
-- Что: отдельная таблица curator_kv_store(curator_id, k, v) — изолированна
--   от client_kv_store на уровне схемы. Никаких FK / триггеров между ними.
--
-- PIN-сессии НЕ используют эту таблицу — для PIN всё остаётся в существующем
--   client_kv_store пути (theme/widget logically принадлежат конкретному клиенту).
--
-- Rollback: DROP TABLE curator_kv_store CASCADE; (Wave A flag-gated, безопасно).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.curator_kv_store (
  curator_id  UUID         NOT NULL REFERENCES public.curators(id) ON DELETE CASCADE,
  k           TEXT         NOT NULL,
  v           JSONB        NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (curator_id, k)
);

CREATE INDEX IF NOT EXISTS idx_curator_kv_store_curator_id
  ON public.curator_kv_store (curator_id);

CREATE INDEX IF NOT EXISTS idx_curator_kv_store_updated_at
  ON public.curator_kv_store (updated_at DESC);

COMMENT ON TABLE  public.curator_kv_store IS
  'Curator-scoped UI state (theme, widget_layout, whats_new_last_seen, etc.). Cross-device sync per curator account, NO client scoping. Plan: curried-stirring-shell.md Wave A.';
COMMENT ON COLUMN public.curator_kv_store.curator_id IS
  'FK → curators(id) ON DELETE CASCADE. Derived from JWT.sub in RPC handler, NEVER passed by client.';
COMMENT ON COLUMN public.curator_kv_store.k IS
  'Storage key. Convention: heys_curator__<name> (двойное __ как reserved separator).';

-- ═══════════════════════════════════════════════════════════════════════════
-- merge_save_curator_kv — server-side merge с last_seen_updated_at conflict
-- detection. Симметрично merge_save_client_kv_by_session/curator: если в БД
-- лежит более свежий updated_at чем клиент видел при чтении — клиенту
-- возвращается conflict, он мерджит и ретраит.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.merge_save_curator_kv(
  p_curator_id               UUID,        -- из JWT, проставляется RPC handler'ом
  p_k                        TEXT,
  p_v                        JSONB,
  p_last_seen_updated_at     TIMESTAMPTZ  -- NULL = первая запись
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_updated_at TIMESTAMPTZ;
  v_current_v          JSONB;
BEGIN
  IF p_curator_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_curator_id');
  END IF;
  IF p_k IS NULL OR length(p_k) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_k');
  END IF;
  IF p_v IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_v');
  END IF;

  -- Стандартная семантика namespace: ожидаем heys_curator__* (двойное __).
  -- Server-side defence in depth: записи с другим префиксом отклоняем.
  IF p_k NOT LIKE 'heys\_curator\_\_%' ESCAPE '\' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_key_prefix',
      'expected_prefix', 'heys_curator__'
    );
  END IF;

  -- Conflict detection: если клиент видел старое updated_at, но в БД новее →
  -- вернуть current_value, клиент сольёт и ретраит.
  SELECT updated_at, v INTO v_current_updated_at, v_current_v
    FROM public.curator_kv_store
    WHERE curator_id = p_curator_id AND k = p_k;

  IF v_current_updated_at IS NOT NULL
     AND p_last_seen_updated_at IS NOT NULL
     AND v_current_updated_at > p_last_seen_updated_at THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conflict',
      'current_v', v_current_v,
      'current_updated_at', v_current_updated_at
    );
  END IF;

  INSERT INTO public.curator_kv_store (curator_id, k, v, updated_at)
  VALUES (p_curator_id, p_k, p_v, now())
  ON CONFLICT (curator_id, k) DO UPDATE SET
    v          = EXCLUDED.v,
    updated_at = now()
  RETURNING updated_at INTO v_current_updated_at;

  RETURN jsonb_build_object(
    'ok',          true,
    'updated_at',  v_current_updated_at
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',    false,
    'error', SQLERRM
  );
END;
$$;

COMMENT ON FUNCTION public.merge_save_curator_kv(UUID, TEXT, JSONB, TIMESTAMPTZ) IS
  'Curator namespace KV upsert. curator_id from JWT.sub (NOT client-provided). Returns conflict if stale write detected. Plan: curried-stirring-shell.md Wave A.';

-- ═══════════════════════════════════════════════════════════════════════════
-- get_curator_kv_all — батч-чтение всех ключей курaтора (HOT-sync hydration).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_curator_kv_all(
  p_curator_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items JSONB;
BEGIN
  IF p_curator_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_curator_id');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'k',          k,
    'v',          v,
    'updated_at', updated_at
  )), '[]'::jsonb)
  INTO v_items
  FROM public.curator_kv_store
  WHERE curator_id = p_curator_id;

  RETURN jsonb_build_object(
    'ok',    true,
    'items', v_items
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.get_curator_kv_all(UUID) IS
  'Batch-read all curator KV items (used on app boot / device switch).';

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants — heys_rpc role (runtime для cloud functions). REVOKE PUBLIC.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.merge_save_curator_kv(UUID, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_curator_kv_all(UUID)                              FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.merge_save_curator_kv(UUID, TEXT, JSONB, TIMESTAMPTZ) TO heys_rpc';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_curator_kv_all(UUID)                              TO heys_rpc';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.curator_kv_store                        TO heys_rpc';
    RAISE NOTICE 'Wave A: granted SELECT/INSERT/UPDATE/DELETE on curator_kv_store + EXECUTE on RPCs to heys_rpc';
  ELSE
    RAISE NOTICE 'Role heys_rpc not found, skipping grants (dev/test env?)';
  END IF;
END $$;

COMMIT;
