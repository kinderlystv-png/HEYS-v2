-- ═══════════════════════════════════════════════════════════════════════════
-- HEYS: повторное согласие по НЕобязательным документам (heys/d8f2b0)
-- ═══════════════════════════════════════════════════════════════════════════
-- Задача. check_required_consents_v2 проверяет жёстко зашитый список
--   v_required = ARRAY['user_agreement','personal_data','health_data']
-- и только его. Всё, что вне списка — curator_access, push_notifications,
-- curator_push_notifications, marketing, speech_transcription и прочее, —
-- при подъёме версии не попадает ни в missing, ни в outdated. Клиент ничего
-- не показывает, подписи под новой редакцией не собираются, и расхождение
-- «документ обновлён, а согласия под ним нет» возникает молча.
--
-- Проверено на живом проде 21.08.2026: у аккаунта владельца согласия
-- актуальны (user_agreement 1.11, personal_data 1.0), при этом
-- curator_access 1.1 присутствует в HEYS.LegalVersions, но отсутствует в
-- HEYS.LegalVersions.required — то есть выпуск curator_access 1.2 прошёл бы
-- незамеченным.
--
-- Почему отдельная функция, а не расширение v_required. Список required несёт
-- вторую нагрузку: при непустом outdated функция ставит clients.consent_
-- outdated_since, заводит семидневный grace и по его истечении отдаёт
-- must_block = true, то есть закрывает вход. Для необязательного согласия это
-- недопустимо: человек не должен терять доступ к сервису из-за того, что не
-- переподписал доступ куратора. Поэтому проверка вынесена в отдельную функцию,
-- которая ничего не блокирует, grace не трогает и на valid не влияет. Старый
-- контур остаётся байт-в-байт прежним.
--
-- Never-granted в ответ не попадают намеренно: если согласия никогда не было,
-- это не «устарело», а обычный путь первичного сбора — им занимается онбординг.
--
-- Идемпотентна. Безопасно выполнять повторно.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Ядро: какие необязательные согласия отстали от текущих версий ────────

CREATE OR REPLACE FUNCTION public.check_optional_consents_v2(
  p_client_id UUID,
  p_expected_versions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Те же три, что проверяет check_required_consents_v2. Здесь они
  -- исключаются, чтобы блокирующий и неблокирующий контуры не пересекались.
  v_blocking TEXT[] := ARRAY['user_agreement','personal_data','health_data'];
  -- Служебные ключи HEYS.LegalVersions: не типы согласий.
  v_meta TEXT[] := ARRAY['labels','required','_updatedAt'];
  v_type TEXT;
  v_expected TEXT;
  v_actual_version TEXT;
  v_granted BOOLEAN;
  v_outdated JSONB := '[]'::jsonb;
BEGIN
  IF p_client_id IS NULL OR p_expected_versions IS NULL THEN
    RETURN jsonb_build_object('outdated', '[]'::jsonb);
  END IF;

  FOR v_type IN SELECT jsonb_object_keys(p_expected_versions) LOOP
    CONTINUE WHEN v_type = ANY(v_blocking);
    CONTINUE WHEN v_type = ANY(v_meta);

    -- Только скалярные значения версий: labels/required приходят объектом
    -- и массивом, ->> вернул бы по ним мусор.
    CONTINUE WHEN jsonb_typeof(p_expected_versions->v_type) <> 'string';

    v_expected := p_expected_versions->>v_type;
    CONTINUE WHEN v_expected IS NULL OR v_expected = '';

    SELECT document_version, granted
      INTO v_actual_version, v_granted
      FROM consents
     WHERE client_id = p_client_id
       AND consent_type = v_type
       AND granted = true
       AND revoked_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1;

    -- Никогда не подписывал — это не «устарело», пропускаем.
    IF FOUND AND COALESCE(v_granted, false) AND v_actual_version <> v_expected THEN
      v_outdated := v_outdated || jsonb_build_object(
        'type', v_type,
        'current', v_actual_version,
        'expected', v_expected
      );
    END IF;
  END LOOP;

  -- Ни grace, ни must_block, ни valid: функция ничего не закрывает.
  RETURN jsonb_build_object('outdated', v_outdated);
END;
$$;

COMMENT ON FUNCTION public.check_optional_consents_v2 IS
  'Необязательные согласия, отставшие по версии. Не блокирует вход, не трогает grace. Блокирующий контур — check_required_consents_v2.';

-- ── 2. Session-обёртка для PIN-клиента ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_optional_consents_by_session(
  p_session_token TEXT,
  p_expected_versions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  RETURN public.check_optional_consents_v2(v_client_id, p_expected_versions);
EXCEPTION WHEN OTHERS THEN
  -- Тот же контракт, что у check_required_consents_by_session: ошибку отдаём
  -- телом, а не исключением. Клиент трактует её как «баннер не показывать».
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.check_optional_consents_by_session IS
  'Session-обёртка над check_optional_consents_v2 для PIN-клиента.';

GRANT EXECUTE ON FUNCTION public.check_optional_consents_v2(UUID, JSONB) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.check_optional_consents_by_session(TEXT, JSONB) TO heys_rpc;
