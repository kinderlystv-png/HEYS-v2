-- ═══════════════════════════════════════════════════════════════════════════
-- Trial Machine v3.0: Admin Lead Management Functions
-- Created: 2026-02-10
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing functions if any (idempotent migration)
DROP FUNCTION IF EXISTS admin_get_leads(text, uuid);
DROP FUNCTION IF EXISTS admin_convert_lead(uuid, text, uuid);
DROP FUNCTION IF EXISTS admin_update_lead_status(uuid, text);

-- ═══════════════════════════════════════════════════════════════════════════
-- Function: admin_get_leads
-- Purpose: Получить список лидов для куратора (отфильтрованные по статусу)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_leads(
  p_status text DEFAULT 'new',
  p_curator_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  phone text,
  messenger text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  referrer text,
  landing_page text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  converted_to_client_id uuid,
  converted_at timestamptz,
  notes text
) AS $$
BEGIN
  -- Если p_status = 'all', показываем все
  IF p_status = 'all' THEN
    RETURN QUERY
    SELECT 
      l.id,
      l.name,
      l.phone,
      l.messenger,
      l.utm_source,
      l.utm_medium,
      l.utm_campaign,
      l.utm_term,
      l.utm_content,
      l.referrer,
      l.landing_page,
      COALESCE(l.status, 'new') as status,
      l.created_at,
      l.updated_at,
      l.converted_to_client_id,
      l.converted_at,
      l.notes
    FROM leads l
    ORDER BY l.created_at DESC
    LIMIT 100;
  ELSE
    -- Фильтруем по статусу
    RETURN QUERY
    SELECT 
      l.id,
      l.name,
      l.phone,
      l.messenger,
      l.utm_source,
      l.utm_medium,
      l.utm_campaign,
      l.utm_term,
      l.utm_content,
      l.referrer,
      l.landing_page,
      COALESCE(l.status, 'new') as status,
      l.created_at,
      l.updated_at,
      l.converted_to_client_id,
      l.converted_at,
      l.notes
    FROM leads l
    WHERE COALESCE(l.status, 'new') = p_status
    ORDER BY l.created_at DESC
    LIMIT 100;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION admin_get_leads IS 'Trial Machine v3.0: Получить список лидов с фильтром по статусу';

-- ═══════════════════════════════════════════════════════════════════════════
-- Function: admin_convert_lead
-- Purpose: Конвертировать лид в клиента
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_convert_lead(
  p_lead_id uuid,
  p_pin text,
  p_curator_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_lead_data RECORD;
  v_client_id uuid;
  v_client_data jsonb;
BEGIN
  -- 1. Получить данные лида
  SELECT * INTO v_lead_data
  FROM leads
  WHERE id = p_lead_id
    AND COALESCE(status, 'new') = 'new';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Lead not found or already converted'
    );
  END IF;

  -- 2. Создать клиента
  INSERT INTO clients (
    name,
    phone,
    pin_hash,
    curator_id
  ) VALUES (
    v_lead_data.name,
    v_lead_data.phone,
    crypt(p_pin, gen_salt('bf')),  -- bcrypt hash
    p_curator_id
  )
  RETURNING id, name, phone, curator_id INTO v_client_data;

  v_client_id := (v_client_data->>'id')::uuid;

  -- 3. Обновить лид
  UPDATE leads
  SET 
    status = 'converted',
    converted_to_client_id = v_client_id,
    converted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_lead_id;

  -- 4. Добавить в очередь триала
  INSERT INTO trial_queue (
    client_id,
    curator_id,
    status,
    created_at
  ) VALUES (
    v_client_id,
    p_curator_id,
    'queued',
    NOW()
  );

  -- 5. Записать событие
  INSERT INTO trial_queue_events (
    client_id,
    event_type,
    curator_id,
    metadata,
    created_at
  ) VALUES (
    v_client_id,
    'queued',
    p_curator_id,
    jsonb_build_object('source', 'lead_conversion', 'lead_id', p_lead_id),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client_id,
    'client', v_client_data
  );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

COMMENT ON FUNCTION admin_convert_lead IS 'Trial Machine v3.0: Конвертировать лид в клиента и добавить в очередь';

-- ═══════════════════════════════════════════════════════════════════════════
-- Function: admin_update_lead_status
-- Purpose: Обновить статус лида
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_update_lead_status(
  p_lead_id uuid,
  p_status text
)
RETURNS jsonb AS $$
BEGIN
  UPDATE leads
  SET 
    status = p_status,
    updated_at = NOW()
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

COMMENT ON FUNCTION admin_update_lead_status IS 'Trial Machine v3.0: Обновить статус лида';

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants: heys_admin должен иметь доступ к этим функциям
-- ═══════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION admin_get_leads TO heys_admin;
GRANT EXECUTE ON FUNCTION admin_convert_lead TO heys_admin;
GRANT EXECUTE ON FUNCTION admin_update_lead_status TO heys_admin;
