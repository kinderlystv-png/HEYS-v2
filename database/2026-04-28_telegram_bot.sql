-- =====================================================
-- Migration: Telegram-bot для клиентов + drip-уведомления (P0.7)
-- Date: 2026-04-28
-- Purpose:
--   Куратор после одобрения лида показывает клиенту deep-link
--   `t.me/<bot>?start=<pin_token>`. Бот идентифицирует клиента по pin_token,
--   присылает PIN, кнопку «Открыть приложение» и сохраняет telegram_chat_id для
--   последующих drip-сообщений на дни 0/3/5/6/7 триала.
-- =====================================================

-- 1. Колонки в clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS pin_token UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS drip_sent_stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pin_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS clients_pin_token_idx ON clients(pin_token) WHERE pin_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS clients_telegram_chat_idx ON clients(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

COMMENT ON COLUMN clients.pin_token IS 'Одноразовый UUID для deep-link Telegram-бота клиента. Истекает через 7 дней или после первого использования (P0.7).';
COMMENT ON COLUMN clients.telegram_chat_id IS 'Telegram chat_id клиента, заполняется ботом при /start <pin_token>. Используется для drip-сообщений.';
COMMENT ON COLUMN clients.drip_sent_stages IS 'Массив стейджей drip-цепочки, уже отправленных клиенту: ["welcome","mid","prepay","lastcall","expired"].';

-- 2. Обновляем admin_convert_lead — добавляет генерацию pin_token + возврат в JSONB
DROP FUNCTION IF EXISTS admin_convert_lead(UUID, UUID);

CREATE OR REPLACE FUNCTION admin_convert_lead(
    p_lead_id UUID,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
BEGIN
    SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
    END IF;

    IF v_lead.status = 'converted' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'lead_already_converted',
            'client_id', v_lead.client_id
        );
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
        RETURN jsonb_build_object(
            'success', false,
            'error', 'phone_already_has_active',
            'code', 'PHONE_ALREADY_TRIAL',
            'client_id', v_existing_client_id,
            'subscription_status', v_existing_status,
            'message', 'У этого телефона уже есть активная заявка/триал/подписка'
        );
    END IF;

    PERFORM 1 FROM clients
     WHERE phone = v_phone_clean OR phone_normalized = v_phone_normalized
     LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'phone_already_exists',
            'message', 'Клиент с таким телефоном уже существует'
        );
    END IF;

    -- Криптослучайный 4-значный PIN
    v_pin := LPAD(((random() * 9000)::INT + 1000)::TEXT, 4, '0');
    v_pin_hash := crypt(v_pin, gen_salt('bf', 12));

    INSERT INTO clients (
        id, name, phone, phone_normalized, email, pin_hash, curator_id,
        subscription_status, pin_token, pin_token_expires_at
    ) VALUES (
        gen_random_uuid(),
        COALESCE(v_lead.name, 'Клиент'),
        v_phone_clean, v_phone_normalized, v_lead.email,
        v_pin_hash, p_curator_id,
        'none', v_pin_token, v_pin_token_expires
    )
    RETURNING id INTO v_client_id;

    INSERT INTO trial_queue (client_id, status, queued_at)
    VALUES (v_client_id, 'queued', NOW());

    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (
        v_client_id, 'queued',
        jsonb_build_object(
            'lead_id', p_lead_id,
            'curator_id', p_curator_id,
            'phone', v_phone_clean,
            'auto_pin', true,
            'pin_token_generated', true
        )
    );

    UPDATE leads
    SET status = 'converted',
        client_id = v_client_id,
        contacted_at = NOW(),
        curator_id = COALESCE(p_curator_id, curator_id),
        updated_at = NOW()
    WHERE id = p_lead_id;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', v_client_id,
        'pin', v_pin,
        'pin_token', v_pin_token,
        'pin_token_expires_at', v_pin_token_expires,
        'phone', v_phone_clean,
        'phone_normalized', v_phone_normalized
    );
END;
$$;

COMMENT ON FUNCTION admin_convert_lead(UUID, UUID) IS
  'Конвертация лида: автогенерация PIN + pin_token (UUID для Telegram-бот deep-link). PIN и token возвращаются ОДИН РАЗ.';

GRANT EXECUTE ON FUNCTION admin_convert_lead(UUID, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION admin_convert_lead(UUID, UUID) TO heys_admin;

-- 3. RPC: regenerate_pin_token — куратор может перевыпустить токен и PIN
CREATE OR REPLACE FUNCTION admin_regenerate_pin(
    p_client_id UUID,
    p_curator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_pin TEXT;
    v_pin_hash TEXT;
    v_pin_token UUID := gen_random_uuid();
    v_pin_token_expires TIMESTAMPTZ := NOW() + INTERVAL '7 days';
BEGIN
    SELECT * INTO v_client FROM clients WHERE id = p_client_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
    END IF;
    IF p_curator_id IS NOT NULL AND v_client.curator_id IS DISTINCT FROM p_curator_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;

    v_pin := LPAD(((random() * 9000)::INT + 1000)::TEXT, 4, '0');
    v_pin_hash := crypt(v_pin, gen_salt('bf', 12));

    UPDATE clients
    SET pin_hash = v_pin_hash,
        pin_token = v_pin_token,
        pin_token_expires_at = v_pin_token_expires,
        pin_failed_attempts = 0,
        pin_locked_until = NULL,
        pin_updated_at = NOW(),
        updated_at = NOW()
    WHERE id = p_client_id;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id,
        'pin', v_pin,
        'pin_token', v_pin_token,
        'pin_token_expires_at', v_pin_token_expires
    );
END;
$$;

COMMENT ON FUNCTION admin_regenerate_pin(UUID, UUID) IS
  'Перевыпуск PIN и pin_token. Используется кнопкой «Перевыпустить PIN» в карточке клиента.';

GRANT EXECUTE ON FUNCTION admin_regenerate_pin(UUID, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION admin_regenerate_pin(UUID, UUID) TO heys_admin;

-- 4. RPC: claim_pin_token_chat — Telegram-бот регистрирует chat_id по pin_token
CREATE OR REPLACE FUNCTION claim_pin_token_chat(
    p_pin_token UUID,
    p_chat_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
BEGIN
    SELECT id, name, pin_hash, pin_token_expires_at, telegram_chat_id, subscription_status
      INTO v_client
      FROM clients
     WHERE pin_token = p_pin_token
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
    END IF;

    IF v_client.pin_token_expires_at IS NOT NULL
       AND v_client.pin_token_expires_at < NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'token_expired');
    END IF;

    UPDATE clients
    SET telegram_chat_id = p_chat_id,
        updated_at = NOW()
    WHERE id = v_client.id;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', v_client.id,
        'name', v_client.name,
        'subscription_status', v_client.subscription_status
    );
END;
$$;

COMMENT ON FUNCTION claim_pin_token_chat(UUID, BIGINT) IS
  'Telegram-бот вызывает при /start <token>: связывает chat_id с клиентом, возвращает имя для отображения.';

GRANT EXECUTE ON FUNCTION claim_pin_token_chat(UUID, BIGINT) TO heys_rpc;

-- 5. RPC: get_trial_drip_targets — возвращает клиентов, которым пора отправить
--    очередное drip-сообщение. Cron-скрипт получает список и шлёт в Telegram.
CREATE OR REPLACE FUNCTION get_trial_drip_targets()
RETURNS TABLE(
    client_id UUID,
    name TEXT,
    telegram_chat_id BIGINT,
    drip_stage TEXT,
    days_left INTEGER,
    trial_ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT
            c.id AS client_id,
            c.name,
            c.telegram_chat_id,
            c.trial_started_at,
            c.trial_ends_at,
            c.drip_sent_stages,
            c.subscription_status,
            -- Сколько целых дней прошло с начала триала
            EXTRACT(DAY FROM (NOW() - c.trial_started_at))::int AS days_passed,
            -- Сколько дней осталось (может быть отрицательным после истечения)
            EXTRACT(DAY FROM (c.trial_ends_at - NOW()))::int AS days_left
        FROM clients c
        WHERE c.telegram_chat_id IS NOT NULL
          AND c.trial_started_at IS NOT NULL
          AND c.trial_ends_at IS NOT NULL
    )
    SELECT
        b.client_id,
        b.name,
        b.telegram_chat_id,
        stage::text AS drip_stage,
        b.days_left,
        b.trial_ends_at
    FROM base b
    CROSS JOIN LATERAL (
        VALUES
          -- (стейдж, минимальный days_passed для отправки)
          ('welcome', 0),
          ('mid',     3),
          ('prepay',  5),
          ('lastcall', 6),
          ('expired', 7)
    ) AS stages(stage, min_days)
    WHERE b.days_passed >= stages.min_days
      AND NOT (b.drip_sent_stages @> to_jsonb(stages.stage))
      -- expired только если триал реально истёк
      AND (stages.stage <> 'expired' OR b.trial_ends_at < NOW())
    ORDER BY b.client_id, stages.min_days DESC;
END;
$$;

COMMENT ON FUNCTION get_trial_drip_targets IS
  'Возвращает клиентов, готовых получить очередное drip-сообщение в Telegram. Cron-скрипт обрабатывает результат и помечает отправленные стейджи через mark_drip_sent.';

GRANT EXECUTE ON FUNCTION get_trial_drip_targets() TO heys_rpc;

-- 6. RPC: mark_drip_sent — помечает drip-стейдж как отправленный
CREATE OR REPLACE FUNCTION mark_drip_sent(
    p_client_id UUID,
    p_stage TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE clients
    SET drip_sent_stages = drip_sent_stages || to_jsonb(p_stage),
        updated_at = NOW()
    WHERE id = p_client_id
      AND NOT (drip_sent_stages @> to_jsonb(p_stage));
    RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION mark_drip_sent IS
  'Идемпотентно помечает drip-стейдж как отправленный. Возвращает true только при первой отметке.';

GRANT EXECUTE ON FUNCTION mark_drip_sent(UUID, TEXT) TO heys_rpc;
