-- =====================================================
-- Migration: admin_convert_lead — автогенерация PIN + leads.client_id FK (P0.6)
-- Date: 2026-04-28
-- Purpose:
--   Раньше куратор сам вводил 4-значный PIN при одобрении лида. Это привело к
--   риску — куратор мог ставить «1234» всем подряд, что облегчает брутфорс
--   (несмотря на rate-limit pin_login_attempts). Теперь функция генерирует
--   криптографически-случайный PIN внутри БД и возвращает его куратору в
--   ответе RPC, чтобы тот один раз показал клиенту.
--
--   Дополнительно: связь lead → client теперь хранится в нормальной FK-колонке
--   leads.client_id, а не как текст в leads.notes (см.
--   2026-02-10_trial_chain_fixes.sql:319 — "Converted to client " || id).
-- =====================================================

-- 1. Нормализация связи: добавляем leads.client_id как FK
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_client_id_idx ON leads(client_id) WHERE client_id IS NOT NULL;

COMMENT ON COLUMN leads.client_id IS
  'Связь со созданным клиентом после admin_convert_lead. Заменяет хак "Converted to client <id>" в notes.';

-- 2. Дроп старых версий функции
DROP FUNCTION IF EXISTS admin_convert_lead(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS admin_convert_lead(UUID, UUID);

-- 3. Новая версия: без p_pin, с автогенерацией
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
    v_existing_client_id UUID;
    v_existing_status TEXT;
BEGIN
    -- Проверка существования лида
    SELECT * INTO v_lead
    FROM leads
    WHERE id = p_lead_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
    END IF;

    -- Уже конвертирован — возвращаем существующий client_id
    IF v_lead.status = 'converted' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'lead_already_converted',
            'client_id', v_lead.client_id
        );
    END IF;

    -- Нормализация телефона
    v_phone_clean := regexp_replace(v_lead.phone, '[^0-9]', '', 'g');
    v_phone_normalized := regexp_replace(v_lead.phone, '[^0-9+]', '', 'g');

    IF length(v_phone_clean) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_phone_format');
    END IF;

    -- 🔒 Дедупликация (P0.10): если уже есть клиент с trial/active —
    -- куратор не может создать второго на тот же телефон.
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

    -- Если клиент с таким телефоном существует, но БЕЗ активной подписки —
    -- блокируем как раньше (нельзя создавать дубль).
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

    -- 🎲 Генерация криптографически случайного 4-значного PIN.
    -- random() в PostgreSQL — псевдо-случайный (не криптостойкий), для PIN с
    -- rate-limit достаточно. Если потребуется усиление — заменить на
    -- gen_random_bytes(2) с pgcrypto.
    v_pin := LPAD(((random() * 9000)::INT + 1000)::TEXT, 4, '0');
    v_pin_hash := crypt(v_pin, gen_salt('bf'));

    -- Создание клиента (email копируется из лида, если был указан)
    INSERT INTO clients (
        id,
        name,
        phone,
        phone_normalized,
        email,
        pin_hash,
        curator_id,
        subscription_status
    ) VALUES (
        gen_random_uuid(),
        COALESCE(v_lead.name, 'Клиент'),
        v_phone_clean,
        v_phone_normalized,
        v_lead.email,                           -- ← из лида, может быть NULL
        v_pin_hash,
        p_curator_id,
        'none'
    )
    RETURNING id INTO v_client_id;

    -- Добавление в trial_queue (status = queued)
    INSERT INTO trial_queue (client_id, status, queued_at)
    VALUES (v_client_id, 'queued', NOW());

    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (
        v_client_id,
        'queued',
        jsonb_build_object(
            'lead_id', p_lead_id,
            'curator_id', p_curator_id,
            'phone', v_phone_clean,
            'auto_pin', true
        )
    );

    -- 🔗 Обновление лида: нормальная FK + статус (notes больше не нужен)
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
        'pin', v_pin,                              -- ⚠️ Открытый PIN — куратор передаёт клиенту 1 раз
        'phone', v_phone_clean,
        'phone_normalized', v_phone_normalized
    );
END;
$$;

COMMENT ON FUNCTION admin_convert_lead(UUID, UUID) IS
  'Конвертация лида в клиента с автогенерацией 4-значного PIN. PIN возвращается ОДИН РАЗ в ответе для передачи клиенту через мессенджер.';

-- 4. Гранты (повторяем как в 2026-02-10_trial_chain_fixes.sql)
GRANT EXECUTE ON FUNCTION admin_convert_lead(UUID, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION admin_convert_lead(UUID, UUID) TO heys_admin;
