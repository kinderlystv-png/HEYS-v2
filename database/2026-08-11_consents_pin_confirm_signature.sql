-- signature_method: приводим перечень к фактическим способам подписи.
--
-- Что меняется:
--   - добавляется 'pin_confirm' — подпись собственным постоянным кодом доступа
--     клиента (новая схема входа, todo.md «Вход по PIN меняется по существу»,
--     2026-08-11, решение владельца). Значение уже названо публично в тексте
--     Пользовательского соглашения на лендинге
--     (apps/landing/src/app/legal/user-agreement/page.tsx:401, § 8.3,
--     действующая версия 1.10) — рассинхрон между текстом и схемой БД
--     существовал независимо от этой задачи, до сегодняшнего дня;
--   - удаляются 'sms_code' и 'messenger_code': SMS/мессенджер-канал подписи
--     отменён. Проверено на проде 2026-08-11: ни в consents (159 строк, все
--     'checkbox'), ни в trial_candidate_consents (100 строк, все 'checkbox')
--     этих значений нет. Оставлять их в схеме — подсказывать следующему
--     читателю, что канал есть.
--
-- Что НЕ меняется:
--   - trial_candidate_consents.signature_method
--     (scripts/db/migrations/2026-07-29_trial_intake_preclient_v3.sql:62) —
--     TEXT NOT NULL DEFAULT 'checkbox', БЕЗ CHECK-constraint вообще.
--     Дублирующего ограничения там нет, менять нечего;
--   - 'checkbox', 'one_time_code', 'button' — используются или зарезервированы
--     в коде, остаются как есть.
--
-- Предохранитель: миграция останавливается явной ошибкой, если в проде уже
-- лежат строки с удаляемыми значениями, вместо того чтобы тихо уронить ALTER
-- или молча продолжить с несогласованными данными.

DO $$
DECLARE
  v_stale_count INT;
BEGIN
  SELECT count(*) INTO v_stale_count
    FROM public.consents
   WHERE signature_method IN ('sms_code', 'messenger_code');

  IF v_stale_count > 0 THEN
    RAISE EXCEPTION
      'Миграция остановлена: % строк(и) в consents используют sms_code/messenger_code — сначала решить, что с ними, потом повторить миграцию',
      v_stale_count;
  END IF;
END $$;

ALTER TABLE public.consents
  DROP CONSTRAINT IF EXISTS consents_signature_method_check;

ALTER TABLE public.consents
  ADD CONSTRAINT consents_signature_method_check
  CHECK (signature_method IS NULL OR signature_method IN (
    'checkbox', 'one_time_code', 'button', 'pin_confirm'
  ));

-- public.log_consents дублирует то же перечисление собственной проверкой:
-- без этого ALTER на таблице ничего бы не дал — RPC отклонял бы pin_confirm
-- строкой раньше, чем запрос доходит до INSERT. Единственное актуальное
-- определение функции — database/2026-07-27_consent_proof_v2.sql, позже не
-- переопределялось (проверено: grep по "CREATE OR REPLACE FUNCTION.*log_consents"
-- во всех последующих миграциях пуст). Тело ниже идентично тому файлу, кроме
-- одной строки со списком допустимых значений.
CREATE OR REPLACE FUNCTION public.log_consents(
  p_client_id UUID,
  p_consents JSONB,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_consent JSONB;
  v_result JSONB := '[]'::jsonb;
  v_type TEXT;
  v_granted BOOLEAN;
  v_version TEXT;
  v_signature TEXT;
  v_hash TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;
  IF jsonb_typeof(p_consents) <> 'array' OR jsonb_array_length(p_consents) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_consents_payload');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_consents) item
     GROUP BY item->>'type' HAVING COUNT(*) > 1
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_consent_type');
  END IF;

  -- Validate the whole request before revoking or inserting anything.
  FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents) LOOP
    v_type := v_consent->>'type';
    v_version := v_consent->>'version';
    v_signature := COALESCE(v_consent->>'signature_method', 'checkbox');
    SELECT document_sha256 INTO v_hash
      FROM public.legal_consent_registry
     WHERE consent_type = v_type AND document_version = v_version AND status = 'active';
    IF v_hash IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'consent_version_not_allowed',
        'consent_type', v_type, 'document_version', v_version);
    END IF;
    IF v_signature NOT IN ('checkbox', 'one_time_code', 'button', 'pin_confirm') THEN
      RETURN jsonb_build_object('success', false, 'error', 'signature_method_not_allowed');
    END IF;
  END LOOP;

  PERFORM set_config('app.consents_writer', 'authorized', true);
  FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents) LOOP
    v_type := v_consent->>'type';
    v_version := v_consent->>'version';
    v_granted := COALESCE((v_consent->>'granted')::boolean, true);
    v_signature := COALESCE(v_consent->>'signature_method', 'checkbox');

    UPDATE public.consents
       SET granted = false, is_active = false, revoked_at = NOW()
     WHERE client_id = p_client_id AND consent_type = v_type
       AND granted = true AND revoked_at IS NULL;

    INSERT INTO public.consents (
      client_id, consent_type, document_version, signature_method,
      granted, is_active, ip_address, user_agent
    ) VALUES (
      p_client_id, v_type, v_version, v_signature, v_granted, v_granted,
      CASE WHEN NULLIF(BTRIM(p_ip), '') IS NOT NULL THEN p_ip::inet ELSE NULL END,
      LEFT(p_user_agent, 500)
    );

    SELECT document_sha256 INTO v_hash FROM public.legal_consent_registry
     WHERE consent_type = v_type AND document_version = v_version;
    v_result := v_result || jsonb_build_object(
      'type', v_type, 'version', v_version, 'document_sha256', v_hash,
      'granted', v_granted, 'logged', true);
  END LOOP;
  RETURN jsonb_build_object('success', true, 'consents', v_result, 'client_id', p_client_id);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('success', false, 'error', 'invalid_consent_payload');
END;
$$;
