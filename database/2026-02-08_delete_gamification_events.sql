-- Delete gamification events (for cleanup of duplicates)
-- Created: 2026-02-08
-- Usage: SELECT delete_gamification_events_by_curator(curator_id, ARRAY['uuid1', 'uuid2']::uuid[])

CREATE OR REPLACE FUNCTION delete_gamification_events_by_curator(
    p_curator_id UUID,
    p_event_ids UUID[]
)
RETURNS TABLE (
    deleted_count INTEGER,
    event_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
    v_deleted_ids UUID[];
BEGIN
    -- 🔒 SECURITY: Проверяем, что все события принадлежат клиентам данного куратора
    -- Удаляем только те события, которые принадлежат клиентам этого куратора
    WITH deleted AS (
        DELETE FROM gamification_events ge
        WHERE ge.id = ANY(p_event_ids)
        AND ge.client_id IN (
            SELECT c.id 
            FROM clients c 
            WHERE c.curator_id = p_curator_id
        )
        RETURNING ge.id
    )
    SELECT 
        COUNT(*)::INTEGER,
        ARRAY_AGG(id)
    INTO v_deleted_count, v_deleted_ids
    FROM deleted;

    -- Возвращаем результат
    RETURN QUERY SELECT 
        COALESCE(v_deleted_count, 0) as deleted_count,
        COALESCE(v_deleted_ids, ARRAY[]::UUID[]) as event_ids;
END;
$$;

-- Grant выполнения для heys_rpc_only роли
GRANT EXECUTE ON FUNCTION delete_gamification_events_by_curator(UUID, UUID[]) TO heys_rpc_only;

-- Комментарий для документации
COMMENT ON FUNCTION delete_gamification_events_by_curator(UUID, UUID[]) IS 
'Удаляет события gamification по UUID. Проверяет, что события принадлежат клиентам данного куратора (SECURITY DEFINER + curator_id check)';
