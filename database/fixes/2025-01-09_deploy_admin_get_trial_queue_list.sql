-- =====================================================
-- DEPLOY: admin_get_trial_queue_list function
-- Date: 2025-01-09
-- Issue: Function missing from production (partial deploy of 2025-01-09_simplified_trial_queue.sql)
-- Evidence: get_public_trial_capacity works, admin_get_trial_queue_list returns 42883
-- =====================================================

-- 1. CREATE FUNCTION
CREATE OR REPLACE FUNCTION admin_get_trial_queue_list(
  p_status TEXT DEFAULT NULL,  -- NULL = все, 'pending' = только ожидающие
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_total INT;
BEGIN
  -- Получаем общее количество
  SELECT COUNT(*) INTO v_total
  FROM trial_queue tq
  WHERE (p_status IS NULL OR tq.status = p_status);
  
  -- Получаем список с данными клиентов
  SELECT jsonb_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT 
      tq.id AS queue_id,
      tq.client_id,
      COALESCE(c.name, 'Неизвестный') AS client_name,
      COALESCE(c.phone_normalized, '') AS client_phone,
      tq.status,
      tq.queue_position,
      tq.created_at AS requested_at,
      tq.assigned_at,
      tq.rejected_at,
      tq.rejection_reason,
      tq.source,
      tq.priority
    FROM trial_queue tq
    LEFT JOIN clients c ON c.id = tq.client_id
    WHERE (p_status IS NULL OR tq.status = p_status)
    ORDER BY 
      CASE tq.status 
        WHEN 'pending' THEN 0 
        WHEN 'assigned' THEN 1 
        ELSE 2 
      END,
      tq.priority DESC,
      tq.created_at ASC
    LIMIT p_limit
    OFFSET p_offset
  ) t;
  
  RETURN jsonb_build_object(
    'success', true,
    'items', COALESCE(v_result, '[]'::jsonb),
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

-- 2. GRANT EXECUTE
GRANT EXECUTE ON FUNCTION admin_get_trial_queue_list(TEXT, INT, INT) TO PUBLIC;

-- 3. COMMENT
COMMENT ON FUNCTION admin_get_trial_queue_list IS 
'Получение списка заявок в очередь триала для админ-панели куратора. 
Фильтрация по статусу, пагинация. Возвращает данные клиентов.';

-- =====================================================
-- VERIFICATION QUERY (run separately):
-- SELECT admin_get_trial_queue_list(NULL, 10, 0);
-- Expected: {"success": true, "items": [], "total": 0, ...}
-- =====================================================
