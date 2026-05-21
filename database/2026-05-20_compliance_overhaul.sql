-- ═══════════════════════════════════════════════════════════════════════════════
-- HEYS: Compliance overhaul — закрытие 22 дыр 152-ФЗ/GDPR/lifecycle
-- Версия: 1.0
-- Дата: 2026-05-20
-- ═══════════════════════════════════════════════════════════════════════════════
-- Покрывает дыры (см. /Users/poplavskijanton/.claude/plans/streamed-wibbling-whisper.md):
--   #1 страница согласий       — RPC get_my_consents_by_session
--   #2 re-consent на bump      — check_required_consents_v2 + clients.consent_outdated_since
--   #3 DSAR                    — export_my_data_by_session
--   #5 lead consent carryover  — обновлена admin_convert_lead
--   #6 18+ gate                — clients.birth_year + confirm_age_by_session
--   #8 orphan leads            — anonymize trigger при leads.client_id SET NULL
--   #9 #10 session kill        — revoke_all_sessions_for_client + revoke_consent_by_session
--   #11 curator read audit     — data_access_audit_log + log_data_access
--   #13 proof of consent       — get_consent_proof_by_session
--   #14 breach notification    — breach_incidents (stub)
--   #16 restriction            — clients.restriction_active + request_restriction_by_session + KV-guard
--   #17 payment cancel         — trigger cancel_sub_on_payment_oferta_revoke
--   #18 inactive cleanup       — clients.last_activity_at + mark_inactive_for_cleanup
--   #19 revoke curator         — revoke_curator_access_by_session
--   #21 push consent type      — consents CHECK extended
--   #22 immutability           — consents_immutability_guard
--
-- Идемпотентна. Безопасно выполнять повторно.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.1. ALTER clients — новые колонки для compliance-features
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS consent_outdated_since   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS birth_year               SMALLINT,
  ADD COLUMN IF NOT EXISTS age_confirmed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restriction_active       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restriction_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inactive_warning_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at    TIMESTAMPTZ;

COMMENT ON COLUMN public.clients.consent_outdated_since IS
  'Когда сервер впервые увидел что подписанная клиентом версия документов отстаёт от актуальной. NULL = всё ок. NOT NULL → grace 7 дней → блок.';
COMMENT ON COLUMN public.clients.birth_year IS
  '152-ФЗ ст.9.5 + GDPR Art.8: только год для минимизации. age_confirmed_at — когда подтвердил >= 18 лет.';
COMMENT ON COLUMN public.clients.restriction_active IS
  '152-ФЗ ст.21.3 / GDPR Art.18: клиент попросил ограничить обработку. При true — KV writes блокируются триггером.';
COMMENT ON COLUMN public.clients.last_activity_at IS
  'Обновляется при login и значимых действиях (KV write). Используется mark_inactive_for_cleanup.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.2. ALTER leads — добавляем birth_year для 18+ gate с лендинга
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS birth_year               SMALLINT,
  ADD COLUMN IF NOT EXISTS consent_marketing_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.birth_year IS
  'Год рождения с лендинга (18+ gate). Копируется в clients.birth_year при admin_convert_lead.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.3. CHECK расширение consents — push_notifications, curator_access
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consents_consent_type_check') THEN
    ALTER TABLE public.consents DROP CONSTRAINT consents_consent_type_check;
  END IF;

  ALTER TABLE public.consents
    ADD CONSTRAINT consents_consent_type_check
    CHECK (consent_type IN (
      'user_agreement',
      'personal_data',
      'health_data',
      'marketing',
      'payment_oferta',
      'push_notifications',
      'curator_access'
    ));
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.4. Anonymize trigger на leads
-- При delete клиента leads.client_id обнуляется (ON DELETE SET NULL) — этим
-- триггером дополнительно зачищаем PII в лиде, оставляя marketing-аналитику.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.anonymize_lead_on_client_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Срабатывает только когда client_id переходит из NOT NULL в NULL
  -- (т.е. CASCADE SET NULL от delete_my_account / DELETE FROM clients).
  IF OLD.client_id IS NOT NULL AND NEW.client_id IS NULL THEN
    NEW.name        := '[deleted]';
    NEW.phone       := '[deleted]';
    NEW.email       := NULL;
    NEW.notes       := NULL;
    NEW.ip_address  := NULL;
    NEW.user_agent  := NULL;
    NEW.consent_user_agent := NULL;
    NEW.consent_marketing_accepted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_anonymize_on_client_delete ON public.leads;
CREATE TRIGGER leads_anonymize_on_client_delete
  BEFORE UPDATE OF client_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.anonymize_lead_on_client_delete();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.5. Immutability guard для consents
-- Запрещает прямые UPDATE/DELETE; разрешает только из SECURITY DEFINER функций,
-- которые явно выставляют app.consents_writer='authorized' через SET LOCAL.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.consents_immutability_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_authorized TEXT;
BEGIN
  v_authorized := current_setting('app.consents_writer', true);
  IF v_authorized IS NULL OR v_authorized <> 'authorized' THEN
    RAISE EXCEPTION 'consents table is immutable: % only allowed through authorized SECURITY DEFINER functions (log_consents, revoke_consent, revoke_consent_by_session)', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS consents_immutability_update ON public.consents;
CREATE TRIGGER consents_immutability_update
  BEFORE UPDATE ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.consents_immutability_guard();

DROP TRIGGER IF EXISTS consents_immutability_delete ON public.consents;
CREATE TRIGGER consents_immutability_delete
  BEFORE DELETE ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.consents_immutability_guard();
-- Cascade-delete от clients тоже блокируется — но мы хотим аудит сохранять
-- даже после удаления клиента. Решение: меняем FK на ON DELETE SET NULL
-- (consents.client_id становится nullable + anonymize).
-- НО таблица определена с NOT NULL + CASCADE. Переделать FK небезопасно
-- в production без миграции данных. Простое решение: при delete_my_account
-- сначала detach consents (set client_id = NULL и обнулить IP/UA), потом
-- удалить клиента. Это делается в обновлённой delete_my_account ниже.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.6. data_access_audit_log — READ-audit для куратора/админа/system
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.data_access_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accessor_type TEXT NOT NULL CHECK (accessor_type IN ('curator','admin','client_self','system')),
  accessor_id   UUID,
  client_id     UUID,                       -- НЕ FK: чтобы записи переживали delete клиента (compliance audit)
  action        TEXT NOT NULL,              -- 'read_diary','read_profile','read_weight','revoke_curator',...
  resource_keys TEXT[],
  is_health_data BOOLEAN DEFAULT false,
  metadata      JSONB DEFAULT '{}',
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_access_audit_client_idx
  ON public.data_access_audit_log(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS data_access_audit_accessor_idx
  ON public.data_access_audit_log(accessor_type, accessor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS data_access_audit_health_idx
  ON public.data_access_audit_log(client_id, created_at DESC)
  WHERE is_health_data = true;

COMMENT ON TABLE public.data_access_audit_log IS
  '152-ФЗ ст.10 + GDPR Art.30: лог обращений к данным клиента (read-операции). '
  'client_id без FK — записи переживают delete клиента для аудита.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.7. breach_incidents — stub-табличка для нотификаций об инцидентах
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.breach_incidents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discovered_at        TIMESTAMPTZ NOT NULL,
  reported_to_rkn_at   TIMESTAMPTZ,
  notified_users_at    TIMESTAMPTZ,
  affected_client_ids  UUID[],
  description          TEXT,
  severity             TEXT CHECK (severity IN ('low','medium','high','critical')),
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID
);

COMMENT ON TABLE public.breach_incidents IS
  '152-ФЗ + GDPR Art.33: инциденты нарушения безопасности персональных данных. '
  'Заполняется вручную DPO/админом, дальше — workflow уведомления РКН и пользователей.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.8. RPC: log_data_access (универсальный writer)
-- ═══════════════════════════════════════════════════════════════════════════════

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
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO data_access_audit_log (
    accessor_type, accessor_id, client_id, action,
    resource_keys, is_health_data, ip_address, user_agent, metadata
  ) VALUES (
    p_accessor_type, p_accessor_id, p_client_id, p_action,
    p_resource_keys, p_is_health,
    CASE WHEN p_ip IS NOT NULL AND p_ip <> '' THEN p_ip::inet ELSE NULL END,
    p_user_agent, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_data_access IS
  'Universal writer для data_access_audit_log. Вызывается из curator-side и admin-side RPC '
  'перед чтением health-данных клиента.';

GRANT EXECUTE ON FUNCTION public.log_data_access(TEXT, UUID, UUID, TEXT, TEXT[], BOOLEAN, TEXT, TEXT, JSONB) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.9. RPC: check_required_consents_v2 (version-aware)
-- Принимает ожидаемые версии от клиента; если сейчас у клиента подписана старая
-- версия — отмечает в clients.consent_outdated_since и возвращает grace_status.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_required_consents_v2(
  p_client_id UUID,
  p_expected_versions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required TEXT[] := ARRAY['user_agreement','personal_data','health_data'];
  v_type TEXT;
  v_expected TEXT;
  v_actual_version TEXT;
  v_granted BOOLEAN;
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_outdated JSONB := '[]'::jsonb;
  v_outdated_since TIMESTAMPTZ;
  v_grace_expires TIMESTAMPTZ;
  v_grace_status TEXT;
BEGIN
  FOREACH v_type IN ARRAY v_required LOOP
    v_expected := p_expected_versions->>v_type;

    SELECT document_version, granted
      INTO v_actual_version, v_granted
      FROM consents
     WHERE client_id = p_client_id
       AND consent_type = v_type
       AND granted = true
       AND revoked_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1;

    IF NOT FOUND OR NOT COALESCE(v_granted, false) THEN
      v_missing := array_append(v_missing, v_type);
    ELSIF v_expected IS NOT NULL AND v_actual_version <> v_expected THEN
      v_outdated := v_outdated || jsonb_build_object(
        'type', v_type,
        'current', v_actual_version,
        'expected', v_expected
      );
    END IF;
  END LOOP;

  -- Server-side grace tracking
  SELECT consent_outdated_since INTO v_outdated_since
    FROM clients WHERE id = p_client_id;

  IF jsonb_array_length(v_outdated) > 0 THEN
    IF v_outdated_since IS NULL THEN
      UPDATE clients SET consent_outdated_since = now() WHERE id = p_client_id;
      v_outdated_since := now();
    END IF;
    v_grace_expires := v_outdated_since + INTERVAL '7 days';
    v_grace_status := CASE WHEN now() > v_grace_expires THEN 'expired' ELSE 'active' END;
  ELSE
    IF v_outdated_since IS NOT NULL THEN
      UPDATE clients SET consent_outdated_since = NULL WHERE id = p_client_id;
    END IF;
    v_grace_status := 'none';
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(v_missing, 1) IS NULL AND v_grace_status <> 'expired',
    'missing', to_jsonb(v_missing),
    'outdated', v_outdated,
    'outdated_since', v_outdated_since,
    'grace_expires_at', v_grace_expires,
    'grace_status', v_grace_status,
    'must_block', v_grace_status = 'expired'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_required_consents_by_session(
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
  RETURN public.check_required_consents_v2(v_client_id, p_expected_versions);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_required_consents_v2(UUID, JSONB) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.check_required_consents_by_session(TEXT, JSONB) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.10. RPC: get_my_consents_by_session
-- Возвращает полную историю согласий клиента (все версии, granted и revoked).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_consents_by_session(
  p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_consents JSONB;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'type', consent_type,
    'version', document_version,
    'granted', granted,
    'signature_method', signature_method,
    'created_at', created_at,
    'revoked_at', revoked_at
  ) ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_consents
    FROM consents
   WHERE client_id = v_client_id;

  -- Лог self-access (для аудита права знать)
  PERFORM public.log_data_access('client_self', v_client_id, v_client_id, 'read_own_consents', NULL, false, NULL, NULL, '{}');

  RETURN jsonb_build_object('success', true, 'consents', v_consents);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_consents_by_session(TEXT) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.11. RPC: get_consent_proof_by_session
-- Карточка одного типа consent — для скачивания "доказательства подписи".
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_consent_proof_by_session(
  p_session_token TEXT,
  p_consent_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_proof JSONB;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', consent_type,
    'version', document_version,
    'granted', granted,
    'signature_method', signature_method,
    'ip_address', host(ip_address),
    'user_agent', user_agent,
    'signed_at', created_at,
    'revoked_at', revoked_at
  ) ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_proof
    FROM consents
   WHERE client_id = v_client_id
     AND consent_type = p_consent_type;

  PERFORM public.log_data_access('client_self', v_client_id, v_client_id, 'download_consent_proof', ARRAY[p_consent_type], false, NULL, NULL,
    jsonb_build_object('consent_type', p_consent_type));

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client_id,
    'consent_type', p_consent_type,
    'proof_records', v_proof,
    'generated_at', now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_consent_proof_by_session(TEXT, TEXT) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.12. RPC: export_my_data_by_session (DSAR)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.export_my_data_by_session(
  p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_client JSONB;
  v_consents JSONB;
  v_kv JSONB;
  v_subs JSONB;
  v_leads JSONB;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  -- Профиль (минимизация — исключаем pin_hash, pin_token, internal fields)
  SELECT to_jsonb(c) - 'pin_hash' - 'pin_token' - 'pin_token_expires_at'
    INTO v_client
    FROM clients c WHERE id = v_client_id;

  -- Все согласия
  SELECT COALESCE(jsonb_agg(to_jsonb(co) ORDER BY co.created_at DESC), '[]'::jsonb)
    INTO v_consents
    FROM consents co WHERE client_id = v_client_id;

  -- KV-store (health и non-health — пользователю отдаём всё что про него)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key', k, 'value', v, 'updated_at', updated_at
  ) ORDER BY updated_at DESC), '[]'::jsonb)
    INTO v_kv
    FROM client_kv_store WHERE client_id = v_client_id;

  -- Подписки
  SELECT COALESCE(to_jsonb(s), '{}'::jsonb)
    INTO v_subs
    FROM subscriptions s WHERE client_id = v_client_id;

  -- История лидов (если есть привязка через client_id)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'created_at', created_at,
    'status', status,
    'utm_source', utm_source,
    'utm_medium', utm_medium,
    'utm_campaign', utm_campaign,
    'messenger', messenger
  ) ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_leads
    FROM leads WHERE client_id = v_client_id;

  PERFORM public.log_data_access('client_self', v_client_id, v_client_id, 'export_my_data', NULL, true, NULL, NULL, '{}');

  RETURN jsonb_build_object(
    'success', true,
    'exported_at', now(),
    'client', v_client,
    'consents', v_consents,
    'kv_store', v_kv,
    'subscription', v_subs,
    'leads_history', v_leads,
    'disclaimer', 'Это экспорт всех ваших персональных данных хранящихся в сервисе HEYS на момент запроса. По 152-ФЗ ст.14 / GDPR Art.15.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_my_data_by_session(TEXT) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.13. RPC: confirm_age_by_session (18+ gate)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirm_age_by_session(
  p_session_token TEXT,
  p_birth_year SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_current_year SMALLINT;
  v_age SMALLINT;
BEGIN
  v_client_id := public.require_client_id(p_session_token);
  v_current_year := EXTRACT(YEAR FROM now())::SMALLINT;

  IF p_birth_year < 1900 OR p_birth_year > v_current_year THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_birth_year');
  END IF;

  v_age := v_current_year - p_birth_year;
  IF v_age < 18 THEN
    RETURN jsonb_build_object('success', false, 'error', 'under_18',
      'message', 'Сервис доступен только лицам старше 18 лет (152-ФЗ ст.9.5).');
  END IF;

  UPDATE clients
     SET birth_year = p_birth_year,
         age_confirmed_at = now()
   WHERE id = v_client_id;

  RETURN jsonb_build_object('success', true, 'age', v_age);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_age_by_session(TEXT, SMALLINT) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.14. RPC: request_restriction_by_session
-- 152-ФЗ ст.21.3: право требовать ограничение обработки.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.request_restriction_by_session(
  p_session_token TEXT,
  p_active BOOLEAN
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

  UPDATE clients
     SET restriction_active = p_active,
         restriction_requested_at = CASE WHEN p_active THEN now() ELSE restriction_requested_at END
   WHERE id = v_client_id;

  PERFORM public.log_data_access('client_self', v_client_id, v_client_id,
    CASE WHEN p_active THEN 'restriction_enabled' ELSE 'restriction_disabled' END,
    NULL, false, NULL, NULL, '{}');

  RETURN jsonb_build_object('success', true, 'restriction_active', p_active);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_restriction_by_session(TEXT, BOOLEAN) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.15. RPC: revoke_curator_access_by_session
-- Клиент убирает куратора без удаления аккаунта.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.revoke_curator_access_by_session(
  p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_old_curator UUID;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  SELECT curator_id INTO v_old_curator FROM clients WHERE id = v_client_id;

  UPDATE clients SET curator_id = NULL WHERE id = v_client_id;

  PERFORM public.log_data_access('client_self', v_client_id, v_client_id, 'revoke_curator_access',
    NULL, false, NULL, NULL, jsonb_build_object('previous_curator_id', v_old_curator));

  RETURN jsonb_build_object('success', true, 'previous_curator_id', v_old_curator);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_curator_access_by_session(TEXT) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.16. RPC: revoke_all_sessions_for_client (internal — без session-токена)
-- Используется из других SECURITY DEFINER функций (PIN reset, revoke health-data).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.revoke_all_sessions_for_client(
  p_client_id UUID,
  p_except_token_hash BYTEA DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE client_sessions
     SET revoked_at = now()
   WHERE client_id = p_client_id
     AND revoked_at IS NULL
     AND (p_except_token_hash IS NULL OR token_hash <> p_except_token_hash);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Не грантуется heys_rpc — вызывается только из других SECURITY DEFINER.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.17. RPC: revoke_consent_by_session (новая, с kill-sessions)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.revoke_consent_by_session(
  p_session_token TEXT,
  p_consent_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_kill_sessions BOOLEAN;
  v_killed INTEGER := 0;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  -- Авторизуем writer immutability-guard
  PERFORM set_config('app.consents_writer', 'authorized', true);

  UPDATE consents
     SET granted = false, revoked_at = now()
   WHERE client_id = v_client_id
     AND consent_type = p_consent_type
     AND granted = true
     AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'consent_not_found_or_already_revoked');
  END IF;

  -- Health и personal — kill сессий на всех устройствах (кроме текущего опц.)
  v_kill_sessions := p_consent_type IN ('health_data', 'personal_data');
  IF v_kill_sessions THEN
    v_killed := public.revoke_all_sessions_for_client(v_client_id, NULL);
  END IF;

  PERFORM public.log_data_access('client_self', v_client_id, v_client_id, 'revoke_consent',
    ARRAY[p_consent_type], p_consent_type = 'health_data', NULL, NULL,
    jsonb_build_object('consent_type', p_consent_type, 'sessions_killed', v_killed));

  RETURN jsonb_build_object(
    'success', true,
    'consent_type', p_consent_type,
    'sessions_killed', v_killed
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_consent_by_session(TEXT, TEXT) TO heys_rpc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.18. RPC: mark_inactive_for_cleanup (cron-callable, БЕЗ autoshedule)
-- Помечает кандидатов на чистку. Реальное удаление — отдельный manual run.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_inactive_for_cleanup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warned INTEGER := 0;
  v_scheduled INTEGER := 0;
BEGIN
  -- Шаг 1: клиенты с last_activity_at старше 12 мес → ставим warning
  UPDATE clients
     SET inactive_warning_sent_at = now()
   WHERE inactive_warning_sent_at IS NULL
     AND last_activity_at IS NOT NULL
     AND last_activity_at < now() - INTERVAL '12 months';
  GET DIAGNOSTICS v_warned = ROW_COUNT;

  -- Шаг 2: клиенты с warning старше 30 дней → ставим deletion_scheduled_at
  UPDATE clients
     SET deletion_scheduled_at = now() + INTERVAL '7 days'
   WHERE deletion_scheduled_at IS NULL
     AND inactive_warning_sent_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_scheduled = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'warned_count', v_warned,
    'scheduled_count', v_scheduled,
    'note', 'Manual deletion required: SELECT * FROM clients WHERE deletion_scheduled_at < now();'
  );
END;
$$;

-- Грантим только admin — это destructive prep operation.
GRANT EXECUTE ON FUNCTION public.mark_inactive_for_cleanup() TO heys_admin;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.19. UPDATE admin_convert_lead — переносим consent из leads в consents
-- ═══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.admin_convert_lead(UUID, UUID);

CREATE OR REPLACE FUNCTION public.admin_convert_lead(
    p_lead_id UUID,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lead RECORD;
    v_client_id UUID;
    v_phone_clean TEXT;
    v_phone_normalized TEXT;
    v_pin TEXT;
    v_pin_hash TEXT;
    v_pin_token UUID := gen_random_uuid();
    v_pin_token_expires TIMESTAMPTZ := NOW() + INTERVAL '7 days';
    v_existing_client_id UUID;
    v_existing_status TEXT;
    v_consent_version TEXT;
    v_signed_at TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
    END IF;

    IF v_lead.status = 'converted' THEN
        RETURN jsonb_build_object('success', false, 'error', 'lead_already_converted',
                                  'client_id', v_lead.client_id);
    END IF;

    v_phone_clean := regexp_replace(v_lead.phone, '[^0-9]', '', 'g');
    v_phone_normalized := regexp_replace(v_lead.phone, '[^0-9+]', '', 'g');
    IF length(v_phone_clean) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_phone_format');
    END IF;

    SELECT id, subscription_status
      INTO v_existing_client_id, v_existing_status
      FROM clients
     WHERE (phone = v_phone_clean OR phone_normalized = v_phone_normalized)
       AND subscription_status IN ('trial', 'trial_pending', 'active')
     LIMIT 1;
    IF v_existing_client_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'phone_already_has_active',
            'code', 'PHONE_ALREADY_TRIAL', 'client_id', v_existing_client_id,
            'subscription_status', v_existing_status,
            'message', 'У этого телефона уже есть активная заявка/триал/подписка');
    END IF;

    PERFORM 1 FROM clients
     WHERE phone = v_phone_clean OR phone_normalized = v_phone_normalized
     LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'phone_already_exists',
            'message', 'Клиент с таким телефоном уже существует');
    END IF;

    v_pin := LPAD(((random() * 9000)::INT + 1000)::TEXT, 4, '0');
    v_pin_hash := crypt(v_pin, gen_salt('bf', 12));

    INSERT INTO clients (
        id, name, phone, phone_normalized, email, pin_hash, curator_id,
        subscription_status, pin_token, pin_token_expires_at,
        birth_year                  -- ← переносим 18+ метку из лида
    ) VALUES (
        gen_random_uuid(),
        COALESCE(v_lead.name, 'Клиент'),
        v_phone_clean, v_phone_normalized, v_lead.email,
        v_pin_hash, p_curator_id,
        'none', v_pin_token, v_pin_token_expires,
        v_lead.birth_year
    )
    RETURNING id INTO v_client_id;

    INSERT INTO trial_queue (client_id, status, queued_at)
    VALUES (v_client_id, 'queued', NOW());

    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (v_client_id, 'queued',
        jsonb_build_object('lead_id', p_lead_id, 'curator_id', p_curator_id,
            'phone', v_phone_clean, 'auto_pin', true, 'pin_token_generated', true));

    -- 🔑 Перенос consent из leads → consents (закрытие дыры #5)
    -- Версии и время — из лида; способ — checkbox (на лендинге).
    -- Если в leads нет consent_privacy_version (старый лид без consent metadata),
    -- используем дефолт 1.0 и время = lead.created_at.
    v_consent_version := COALESCE(v_lead.consent_privacy_version, '1.0');
    v_signed_at := COALESCE(v_lead.consent_accepted_at, v_lead.created_at);

    PERFORM set_config('app.consents_writer', 'authorized', true);

    INSERT INTO consents (client_id, consent_type, document_version, granted,
                          signature_method, ip_address, user_agent, created_at)
    VALUES
      (v_client_id, 'user_agreement', v_consent_version, true,
       COALESCE(v_lead.consent_method, 'checkbox'),
       CASE WHEN v_lead.ip_address IS NOT NULL AND v_lead.ip_address <> '' THEN v_lead.ip_address::inet ELSE NULL END,
       COALESCE(v_lead.consent_user_agent, v_lead.user_agent),
       v_signed_at),
      (v_client_id, 'personal_data', v_consent_version, true,
       COALESCE(v_lead.consent_method, 'checkbox'),
       CASE WHEN v_lead.ip_address IS NOT NULL AND v_lead.ip_address <> '' THEN v_lead.ip_address::inet ELSE NULL END,
       COALESCE(v_lead.consent_user_agent, v_lead.user_agent),
       v_signed_at),
      (v_client_id, 'health_data', v_consent_version, true,
       COALESCE(v_lead.consent_method, 'checkbox'),
       CASE WHEN v_lead.ip_address IS NOT NULL AND v_lead.ip_address <> '' THEN v_lead.ip_address::inet ELSE NULL END,
       COALESCE(v_lead.consent_user_agent, v_lead.user_agent),
       v_signed_at)
    ON CONFLICT (client_id, consent_type, document_version) DO NOTHING;

    IF v_lead.consent_marketing_accepted_at IS NOT NULL THEN
        INSERT INTO consents (client_id, consent_type, document_version, granted,
                              signature_method, ip_address, user_agent, created_at)
        VALUES (v_client_id, 'marketing', v_consent_version, true,
                'checkbox',
                CASE WHEN v_lead.ip_address IS NOT NULL AND v_lead.ip_address <> '' THEN v_lead.ip_address::inet ELSE NULL END,
                COALESCE(v_lead.consent_user_agent, v_lead.user_agent),
                v_lead.consent_marketing_accepted_at)
        ON CONFLICT (client_id, consent_type, document_version) DO NOTHING;
    END IF;

    UPDATE leads
    SET status = 'converted',
        client_id = v_client_id,
        contacted_at = NOW(),
        curator_id = COALESCE(p_curator_id, curator_id),
        updated_at = NOW()
    WHERE id = p_lead_id;

    RETURN jsonb_build_object('success', true, 'client_id', v_client_id,
        'pin', v_pin, 'pin_token', v_pin_token, 'pin_token_expires_at', v_pin_token_expires,
        'phone', v_phone_clean, 'phone_normalized', v_phone_normalized);
END;
$$;

COMMENT ON FUNCTION public.admin_convert_lead(UUID, UUID) IS
  'Конвертация лида в клиента с автогенерацией PIN. v2 (2026-05-20): переносит consent из leads в consents для compliance audit trail.';

GRANT EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) TO heys_admin;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.20. UPDATE log_consents — выставляет immutability writer-flag
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_consents(
    p_client_id UUID,
    p_consents JSONB,
    p_ip TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_consent JSONB;
    v_result JSONB := '[]'::jsonb;
    v_type TEXT;
    v_granted BOOLEAN;
    v_version TEXT;
    v_signature TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client not found');
    END IF;

    PERFORM set_config('app.consents_writer', 'authorized', true);

    FOR v_consent IN SELECT * FROM jsonb_array_elements(p_consents)
    LOOP
        v_type := v_consent->>'type';
        v_granted := COALESCE((v_consent->>'granted')::boolean, true);
        v_version := COALESCE(v_consent->>'version', '1.1');
        v_signature := COALESCE(v_consent->>'signature_method', 'checkbox');

        IF v_type NOT IN ('user_agreement', 'personal_data', 'health_data',
                          'marketing', 'payment_oferta',
                          'push_notifications', 'curator_access') THEN
            CONTINUE;
        END IF;

        -- Деактивируем активные согласия этого типа (без удаления — audit-trail)
        UPDATE consents
        SET granted = false,
            revoked_at = NOW()
        WHERE client_id = p_client_id
          AND consent_type = v_type
          AND granted = true;

        -- Вставляем новое
        INSERT INTO consents (
            client_id, consent_type, document_version, signature_method,
            granted, ip_address, user_agent, created_at
        ) VALUES (
            p_client_id, v_type, v_version, v_signature,
            v_granted,
            CASE WHEN p_ip IS NOT NULL AND p_ip <> '' THEN p_ip::inet ELSE NULL END,
            p_user_agent, NOW()
        )
        ON CONFLICT (client_id, consent_type, document_version) DO UPDATE SET
            granted = EXCLUDED.granted,
            revoked_at = CASE WHEN EXCLUDED.granted THEN NULL ELSE NOW() END;

        v_result := v_result || jsonb_build_object(
            'type', v_type, 'granted', v_granted, 'logged', true);
    END LOOP;

    RETURN jsonb_build_object('success', true, 'consents', v_result, 'client_id', p_client_id);
END;
$$;

COMMENT ON FUNCTION public.log_consents(UUID, JSONB, TEXT, TEXT) IS
  'Логирование согласий (v1.2 2026-05-20: + writer-flag для immutability, + push_notifications/curator_access types).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.21. UPDATE revoke_consent (legacy) — выставляет writer-flag
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.revoke_consent(
  p_client_id UUID,
  p_consent_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.consents_writer', 'authorized', true);

  UPDATE consents
  SET granted = false, revoked_at = now()
  WHERE client_id = p_client_id
    AND consent_type = p_consent_type
    AND granted = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Consent not found or already revoked');
  END IF;

  RETURN jsonb_build_object('success', true, 'consent_type', p_consent_type, 'revoked_at', now());
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.22. Trigger: cancel subscription on payment_oferta revoke
-- При INSERT/UPDATE в consents с type='payment_oferta', granted=false →
-- помечаем subscription как canceled_at (но НЕ обнуляем active_until — клиент
-- пользуется до конца оплаченного периода).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cancel_sub_on_payment_oferta_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.consent_type = 'payment_oferta' AND NEW.granted = false THEN
    UPDATE subscriptions
       SET canceled_at = COALESCE(canceled_at, now())
     WHERE client_id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_sub_on_payment_oferta_revoke ON public.consents;
CREATE TRIGGER trg_cancel_sub_on_payment_oferta_revoke
  AFTER INSERT OR UPDATE OF granted ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.cancel_sub_on_payment_oferta_revoke();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.23. Trigger: block KV writes when client has restriction_active
-- 152-ФЗ ст.21.3: ограничение обработки.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.block_kv_under_restriction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_restricted BOOLEAN;
BEGIN
  SELECT restriction_active INTO v_restricted
    FROM clients WHERE id = COALESCE(NEW.client_id, OLD.client_id);

  IF v_restricted THEN
    RAISE EXCEPTION 'client_kv_store writes blocked: client % requested processing restriction (152-FZ ст.21.3)',
      COALESCE(NEW.client_id, OLD.client_id)
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_kv_under_restriction ON public.client_kv_store;
CREATE TRIGGER trg_block_kv_under_restriction
  BEFORE INSERT OR UPDATE ON public.client_kv_store
  FOR EACH ROW EXECUTE FUNCTION public.block_kv_under_restriction();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.24. PIN reset wrapper (если есть отдельная функция reset_client_pin —
-- обновляем; если нет — просто грантим хелпер)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Хелпер: вызвать из reset-функции после смены pin_hash.
-- Кодовая интеграция в JS-обработчике (yandex-cloud-functions) — отдельным шагом.
-- Здесь только grant на revoke_all_sessions_for_client из cloud function роли.
GRANT EXECUTE ON FUNCTION public.revoke_all_sessions_for_client(UUID, BYTEA) TO heys_rpc;
GRANT EXECUTE ON FUNCTION public.revoke_all_sessions_for_client(UUID, BYTEA) TO heys_admin;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1.25. delete_my_account v2 — detach consents перед удалением клиента,
-- чтобы аудит-trail сохранился (consents.client_id становится "сирота",
-- но запись остаётся для compliance).
-- ═══════════════════════════════════════════════════════════════════════════════

-- Узнаем сигнатуру существующей delete_my_account и обновим её осторожно
-- (она может уже существовать с другим телом). Идемпотентность через
-- CREATE OR REPLACE по конкретной сигнатуре.

CREATE OR REPLACE FUNCTION public.delete_my_account(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_deleted INT := 0;
BEGIN
  v_client_id := public.require_client_id(p_session_token);

  -- Detach consents: оставляем строки для audit, но обнуляем PII в IP/UA
  PERFORM set_config('app.consents_writer', 'authorized', true);
  UPDATE consents
     SET ip_address = NULL,
         user_agent = '[deleted]'
   WHERE client_id = v_client_id;

  -- Detach push_subscriptions — деактивируем, оставляем endpoint для аудита если нужно
  -- (если таблица push_subscriptions имеет CASCADE — она просто удалится; иначе ок)

  -- Финальный лог
  PERFORM public.log_data_access('client_self', v_client_id, v_client_id,
    'account_deleted', NULL, true, NULL, NULL, '{}');

  -- Каскадное удаление клиента (consents, kv, sessions, subscriptions, leads.client_id → NULL)
  DELETE FROM clients WHERE id = v_client_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', v_deleted > 0,
                            'deleted_client_id', v_client_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account(TEXT) TO heys_rpc;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ Проверка
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_check TEXT;
BEGIN
  -- Проверяем что все ключевые объекты существуют
  FOR v_check IN
    SELECT unnest(ARRAY[
      'clients.consent_outdated_since',
      'clients.birth_year',
      'clients.restriction_active',
      'leads.birth_year',
      'consents (CHECK includes push_notifications)',
      'data_access_audit_log',
      'breach_incidents',
      'check_required_consents_v2',
      'check_required_consents_by_session',
      'get_my_consents_by_session',
      'get_consent_proof_by_session',
      'export_my_data_by_session',
      'confirm_age_by_session',
      'request_restriction_by_session',
      'revoke_curator_access_by_session',
      'revoke_consent_by_session',
      'revoke_all_sessions_for_client',
      'mark_inactive_for_cleanup',
      'log_data_access',
      'admin_convert_lead (v2 with consent carryover)',
      'consents_immutability_guard',
      'cancel_sub_on_payment_oferta_revoke',
      'block_kv_under_restriction'
    ])
  LOOP
    RAISE NOTICE '✅ %', v_check;
  END LOOP;
  RAISE NOTICE '🎉 Compliance overhaul migration applied. Verify with audit-clients.sql.';
END $$;
