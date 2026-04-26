-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: create_pending_product_by_session writes to wrong table
-- ═══════════════════════════════════════════════════════════════════════════════
-- Дата: 2026-04-27
-- Источник: 2025-12-25_p1_session_functions.sql (P1 IDOR fix) ввёл RPC,
-- которая писала в pending_products (таблица-сирота — ничто на фронте её не
-- читает). Frontend cloud.getPendingProducts читает shared_products_pending.
-- В результате все заявки PIN-клиентов на размещение продукта в общей базе
-- молча терялись.
--
-- Что делает эта миграция:
--   1. Перезаписывает create_pending_product_by_session чтобы:
--      - писать в shared_products_pending (правильная таблица)
--      - принимать p_fingerprint и p_name_norm для дедупа и поиска
--      - lookup curator_id из public.clients WHERE id = v_client_id
--      - возвращать совместимый со старым create_pending_product shape
--        ({status:'pending'|'exists'|'error', pending_id|existing_id, message})
--      - сохраняет SECURITY DEFINER + session-token валидацию через require_client_id
--   2. Сохраняет старую UUID-версию create_pending_product (legacy путь —
--      grant'нута authenticated для обратной совместимости).
--
-- Применить вручную через Supabase SQL Editor:
--   1. Открыть Supabase Dashboard → SQL Editor.
--   2. Скопировать содержимое этого файла.
--   3. Выполнить.
--   4. Проверить:
--        SELECT pg_get_functiondef('public.create_pending_product_by_session(text,text,jsonb,text,text)'::regprocedure);
--      В теле должно быть `INSERT INTO public.shared_products_pending`.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Удаляем старую версию (3 параметра) — теперь сигнатура с 5 параметрами.
DROP FUNCTION IF EXISTS public.create_pending_product_by_session(TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.create_pending_product_by_session(
  p_session_token TEXT,
  p_name TEXT,
  p_product_data JSONB DEFAULT '{}'::JSONB,
  p_fingerprint TEXT DEFAULT NULL,
  p_name_norm TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_curator_id UUID;
  v_pending_id UUID;
  v_existing_id UUID;
  v_name_trimmed TEXT;
  v_name_norm_resolved TEXT;
  v_fingerprint_resolved TEXT;
  v_json_size INT;
BEGIN
  -- 🔐 Валидация сессии
  v_client_id := public.require_client_id(p_session_token);

  -- 🛡 Лимит размера JSONB (защита от DoS)
  v_json_size := length(p_product_data::TEXT);
  IF v_json_size > 16384 THEN  -- 16 KB
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'product_data_too_large',
      'message', 'Product data too large (max 16KB)'
    );
  END IF;

  -- 🛡 Валидация имени
  v_name_trimmed := TRIM(p_name);
  IF v_name_trimmed IS NULL OR length(v_name_trimmed) < 2 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'name_too_short',
      'message', 'Название продукта обязательно (минимум 2 символа)'
    );
  END IF;

  IF length(v_name_trimmed) > 200 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'name_too_long',
      'message', 'Название продукта слишком длинное (max 200 символов)'
    );
  END IF;

  -- Резолвим name_norm: если не передан — берём lower(trim(name))
  v_name_norm_resolved := COALESCE(NULLIF(TRIM(p_name_norm), ''), lower(v_name_trimmed));

  -- Резолвим fingerprint: если не передан — используем name_norm как слабый
  -- fallback (без нутриентов; не идеально, но позволяет грубую дедупликацию).
  v_fingerprint_resolved := COALESCE(NULLIF(TRIM(p_fingerprint), ''), v_name_norm_resolved);

  -- 🔍 Дедуп: проверяем не лежит ли продукт уже в shared_products
  SELECT id INTO v_existing_id
  FROM public.shared_products
  WHERE fingerprint = v_fingerprint_resolved
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'exists',
      'existing_id', v_existing_id,
      'message', 'Продукт уже существует в общей базе'
    );
  END IF;

  -- 🔍 Дедуп: проверяем не лежит ли уже pending заявка с таким fingerprint
  -- (на текущего куратора, чтобы клиент не сабмитил один и тот же продукт многократно)
  SELECT id INTO v_existing_id
  FROM public.shared_products_pending
  WHERE fingerprint = v_fingerprint_resolved
    AND status = 'pending'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'pending_dup',
      'pending_id', v_existing_id,
      'message', 'Заявка с таким продуктом уже на модерации'
    );
  END IF;

  -- 🧭 Lookup curator_id клиента
  SELECT curator_id INTO v_curator_id
  FROM public.clients
  WHERE id = v_client_id;

  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'no_curator',
      'message', 'У клиента не назначен куратор'
    );
  END IF;

  -- ✍️ INSERT в правильную таблицу
  INSERT INTO public.shared_products_pending
    (client_id, curator_id, product_data, name_norm, fingerprint, status)
  VALUES
    (v_client_id, v_curator_id, p_product_data, v_name_norm_resolved, v_fingerprint_resolved, 'pending')
  RETURNING id INTO v_pending_id;

  RETURN jsonb_build_object(
    'status', 'pending',
    'pending_id', v_pending_id,
    'message', 'Заявка отправлена куратору'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'status', 'error',
    'error', 'unexpected',
    'message', SQLERRM
  );
END;
$$;

COMMENT ON FUNCTION public.create_pending_product_by_session(TEXT, TEXT, JSONB, TEXT, TEXT) IS
'Создать заявку на добавление продукта в общую базу. Принимает session_token PIN-клиента,
валидирует через require_client_id, lookup-ит curator_id клиента, делает дедуп по fingerprint
в shared_products и shared_products_pending, INSERT в shared_products_pending.
Возвращает {status:''pending''|''exists''|''pending_dup''|''error'', pending_id|existing_id, message}.';

-- 🔑 GRANT для heys_rpc (RPC user)
GRANT EXECUTE ON FUNCTION public.create_pending_product_by_session(TEXT, TEXT, JSONB, TEXT, TEXT) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification (раскомментируй и запусти ОТДЕЛЬНО для smoke-теста, использует
-- реальные UUID — лучше делать в DEV окружении)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- -- 1. Проверка что функция определена с правильной таблицей:
-- SELECT pg_get_functiondef('public.create_pending_product_by_session(text,text,jsonb,text,text)'::regprocedure);
-- -- В теле должна быть строка: INSERT INTO public.shared_products_pending
--
-- -- 2. Проверка что pending_products больше не получает INSERT'ов от этой функции:
-- SELECT proname, prosrc
-- FROM pg_proc
-- WHERE prosrc LIKE '%INSERT INTO public.pending_products%';
-- -- Должно вернуть 0 строк (или только legacy функции, не _by_session)
--
-- -- 3. Smoke test (требует валидный session_token и существующего клиента с куратором):
-- SELECT public.create_pending_product_by_session(
--   '<valid_session_token>',
--   'Test Cake Migration Smoke',
--   '{"kcal100":300,"protein100":5,"carbs100":40,"fat100":15}'::jsonb,
--   'test_fingerprint_smoke_001',
--   'test cake migration smoke'
-- );
-- -- Ожидаем: {"status": "pending", "pending_id": "<uuid>", "message": "Заявка отправлена куратору"}
--
-- -- 4. Подтверждаем что запись в shared_products_pending:
-- SELECT id, name_norm, status FROM public.shared_products_pending
-- WHERE name_norm = 'test cake migration smoke';
-- -- Ожидаем: одну строку со status='pending'
--
-- -- 5. Cleanup smoke test:
-- DELETE FROM public.shared_products_pending WHERE name_norm = 'test cake migration smoke';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'create_pending_product_by_session'
      AND pronargs = 5
  ) THEN
    RAISE NOTICE '✅ create_pending_product_by_session(text,text,jsonb,text,text) успешно создана';
  ELSE
    RAISE WARNING '❌ create_pending_product_by_session 5-параметровая версия не найдена!';
  END IF;
END $$;
