-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: create_client_with_pin для Yandex Cloud (без Supabase auth.uid())
-- Date: 2025-01-07
-- Purpose: Принимает curator_id как параметр вместо auth.uid()
-- ═══════════════════════════════════════════════════════════════════════════

-- Создаём новую версию функции с 5 параметрами
-- Старая 4-параметровая версия остаётся для обратной совместимости

CREATE OR REPLACE FUNCTION public.create_client_with_pin(
  p_name TEXT,
  p_phone TEXT,           -- можно передать как p_phone (маппинг в RPC)
  p_pin_salt TEXT,
  p_pin_hash TEXT,
  p_curator_id UUID       -- Добавлен параметр куратора
)
RETURNS TABLE(client_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
  v_phone_normalized TEXT;  -- v_ prefix to avoid ambiguity
BEGIN
  -- Валидация curator_id
  IF p_curator_id IS NULL THEN
    RAISE EXCEPTION 'curator_id_required';
  END IF;
  
  -- Проверяем что куратор существует
  IF NOT EXISTS (SELECT 1 FROM public.curators WHERE id = p_curator_id) THEN
    RAISE EXCEPTION 'curator_not_found';
  END IF;

  -- Нормализуем телефон (убираем всё кроме цифр, добавляем +)
  v_phone_normalized := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF length(v_phone_normalized) = 10 THEN
    v_phone_normalized := '7' || v_phone_normalized;
  END IF;
  IF NOT v_phone_normalized LIKE '7%' THEN
    v_phone_normalized := '7' || right(v_phone_normalized, 10);
  END IF;
  v_phone_normalized := '+' || v_phone_normalized;

  -- Валидация телефона
  IF v_phone_normalized IS NULL OR length(v_phone_normalized) < 12 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  -- Проверяем уникальность телефона у этого куратора
  IF EXISTS (
    SELECT 1 FROM public.clients 
    WHERE phone = v_phone_normalized 
      AND curator_id = p_curator_id
  ) THEN
    RAISE EXCEPTION 'phone_already_exists';
  END IF;

  -- Валидация salt/hash
  IF p_pin_salt IS NULL OR length(p_pin_salt) < 16 THEN
    RAISE EXCEPTION 'invalid_salt';
  END IF;

  IF p_pin_hash IS NULL OR length(p_pin_hash) < 32 THEN
    RAISE EXCEPTION 'invalid_hash';
  END IF;

  -- Создаём клиента
  INSERT INTO public.clients(
    name,
    curator_id,
    phone,
    pin_salt,
    pin_hash,
    updated_at
  ) VALUES (
    NULLIF(TRIM(COALESCE(p_name, '')), ''),
    p_curator_id,
    v_phone_normalized,
    p_pin_salt,
    p_pin_hash,
    NOW()
  )
  RETURNING id INTO new_id;

  RETURN QUERY SELECT new_id;
END;
$$;

-- Права доступа
REVOKE ALL ON FUNCTION public.create_client_with_pin(TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_with_pin(TEXT, TEXT, TEXT, TEXT, UUID) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification
-- ═══════════════════════════════════════════════════════════════════════════
/*
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('heys_rpc', p.oid, 'EXECUTE') AS rpc_exec,
       has_function_privilege('PUBLIC', p.oid, 'EXECUTE') AS public_exec
FROM pg_proc p
WHERE p.proname = 'create_client_with_pin'
ORDER BY 2;

-- Expected:
-- create_client_with_pin | text, text, text, text        | f | f (old Supabase version)
-- create_client_with_pin | text, text, text, text, uuid  | t | f (new Yandex version)
*/
