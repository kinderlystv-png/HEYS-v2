-- ═══════════════════════════════════════════════════════════════════
-- HOTFIX: PIN-path UPSERT функции не сбрасывают user_id при ON CONFLICT
-- Date: 2026-05-28
-- Severity: P0 (Александра не может login-sync — 500 merge_failed)
--
-- Root cause:
--   После Ticket H (curator_write_locked trigger), trigger
--   `block_curator_write_if_locked` фильтрует по NEW.user_id IS NOT NULL.
--   PIN-path UPSERTs (`upsert_client_kv_by_session`,
--   `batch_upsert_client_kv_by_session`) на ON CONFLICT обновляли только
--   `v` и `updated_at`, оставляя existing user_id нетронутым. Когда строка
--   ранее писалась курaтором (user_id=curatorId), PIN UPDATE preserved
--   curator user_id → NEW.user_id IS NOT NULL → trigger raise EXCEPTION
--   → 500 merge_failed.
--
--   Для Александры: 71 row с user_id=курaтор, 27 с user_id=другой actor.
--   PIN-flow её iPhone'а сейчас падает на этих rows.
--
-- Fix:
--   ON CONFLICT теперь устанавливает user_id = NULL (что соответствует
--   semantic-у PIN-path — это session-write, user_id не применим).
--   После этой правки PIN updates перетирают user_id → trigger пропускает.
--   Курaторские writes (через `batch_upsert_client_kv_by_curator` или
--   merge_save_*_by_curator) задают user_id=curatorId — trigger
--   корректно ловит когда locked=TRUE.
--
-- Parallel companion fix:
--   В heys-api-rpc/index.js (merge_save_*) добавлен
--   `user_id = EXCLUDED.user_id` в SET clause. SQL функции в этой
--   миграции — для путей которые НЕ идут через мой JS handler.
--
-- Apply:
--   ./scripts/db/psql.sh -f database/2026-05-28_fix_pin_path_user_id.sql
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- 1. upsert_client_kv_by_session — single-key PIN write.
CREATE OR REPLACE FUNCTION public.upsert_client_kv_by_session(
  p_session_token TEXT,
  p_key TEXT,
  p_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  SELECT client_id INTO v_client_id
  FROM client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > NOW()
    AND revoked_at IS NULL;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_or_expired_session'
    );
  END IF;

  INSERT INTO client_kv_store (client_id, k, v, updated_at, user_id)
  VALUES (v_client_id, p_key, p_value, NOW(), NULL)
  ON CONFLICT (client_id, k) DO UPDATE SET
    v = EXCLUDED.v,
    updated_at = NOW(),
    user_id = NULL;   -- HOTFIX 2026-05-28: PIN-path сбрасывает user_id,
                      -- иначе trigger block_curator_write_if_locked ловит
                      -- updates на rows с курaтор-user_id и 500'ит.

  RETURN jsonb_build_object(
    'success', true,
    'key', p_key
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'sqlstate', SQLSTATE
    );
END;
$$;

-- 2. batch_upsert_client_kv_by_session — batch PIN write.
CREATE OR REPLACE FUNCTION public.batch_upsert_client_kv_by_session(
  p_session_token TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_item JSONB;
  v_key TEXT;
  v_value JSONB;
  v_saved INT := 0;
BEGIN
  SELECT client_id INTO v_client_id
  FROM client_sessions
  WHERE token_hash = digest(p_session_token, 'sha256')
    AND expires_at > NOW()
    AND revoked_at IS NULL;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_or_expired_session'
    );
  END IF;

  IF jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'p_items must be JSON array'
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_key := v_item->>'k';
    v_value := v_item->'v';

    IF v_key IS NOT NULL AND v_value IS NOT NULL THEN
      INSERT INTO client_kv_store (client_id, k, v, updated_at, user_id)
      VALUES (v_client_id, v_key, v_value, NOW(), NULL)
      ON CONFLICT (client_id, k) DO UPDATE SET
        v = EXCLUDED.v,
        updated_at = NOW(),
        user_id = NULL;   -- HOTFIX 2026-05-28: см. upsert_client_kv_by_session.

      v_saved := v_saved + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'saved', v_saved
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'sqlstate', SQLSTATE,
      'saved', v_saved
    );
END;
$$;

-- Восстанавливаем GRANTs (CREATE OR REPLACE не сбрасывает, но для consistency):
GRANT EXECUTE ON FUNCTION public.upsert_client_kv_by_session(TEXT, TEXT, JSONB) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.batch_upsert_client_kv_by_session(TEXT, JSONB) TO heys_rpc;

COMMIT;

-- Smoke test:
--   После apply: Александра retry login → merge_save_client_kv_by_session
--   и/или batch_upsert paths больше не должны возвращать 500. Trigger
--   block_curator_write_if_locked НЕ срабатывает потому что NEW.user_id
--   теперь NULL на UPDATE (пришёл из EXCLUDED.user_id=NULL).
