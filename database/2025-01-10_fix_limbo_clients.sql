-- 🔧 FIX LIMBO CLIENTS: Исправление клиентов без записи в subscriptions
-- Для клиентов, у которых clients.subscription_status='trial', но нет записи в subscriptions

-- Диагностика ДО фикса
SELECT 
  'До фикса:' as info,
  COUNT(*) FILTER (WHERE sub.client_id IS NOT NULL) as synced_trials,
  COUNT(*) FILTER (WHERE sub.client_id IS NULL) as limbo_clients
FROM clients c
LEFT JOIN subscriptions sub ON c.id = sub.client_id
WHERE c.subscription_status = 'trial';

-- Исправляем клиентов в "limbo" состоянии
DO $$
DECLARE
  v_client RECORD;
  v_fixed_count INT := 0;
BEGIN
  -- Находим клиентов в limbo: статус 'trial', но нет записи в subscriptions
  FOR v_client IN
    SELECT 
      c.id,
      c.name,
      c.trial_started_at as client_trial_started,
      c.trial_ends_at as client_trial_ends
    FROM clients c
    LEFT JOIN subscriptions sub ON c.id = sub.client_id
    WHERE c.subscription_status = 'trial'
      AND sub.client_id IS NULL  -- НЕТ записи в subscriptions
  LOOP
    RAISE NOTICE 'Fixing client % (%) - clients.trial_started=%, clients.trial_ends=%',
      v_client.id, 
      v_client.name,
      v_client.client_trial_started,
      v_client.client_trial_ends;
    
    -- Создаём запись в subscriptions (без status — его нет в схеме!)
    INSERT INTO subscriptions (
      client_id, 
      trial_started_at, 
      trial_ends_at
    )
    VALUES (
      v_client.id,
      COALESCE(v_client.client_trial_started, NOW()),
      COALESCE(v_client.client_trial_ends, NOW() + INTERVAL '7 days')
    )
    ON CONFLICT (client_id) DO UPDATE SET
      trial_started_at = COALESCE(EXCLUDED.trial_started_at, subscriptions.trial_started_at, NOW()),
      trial_ends_at = COALESCE(EXCLUDED.trial_ends_at, subscriptions.trial_ends_at, NOW() + INTERVAL '7 days');
    
    v_fixed_count := v_fixed_count + 1;
  END LOOP;
  
  RAISE NOTICE '✅ Fixed % clients in limbo state', v_fixed_count;
END $$;

-- Проверка ПОСЛЕ фикса
SELECT 
  'После фикса:' as info,
  COUNT(*) FILTER (WHERE sub.client_id IS NOT NULL) as synced_trials,
  COUNT(*) FILTER (WHERE sub.client_id IS NULL) as still_broken
FROM clients c
LEFT JOIN subscriptions sub ON c.id = sub.client_id
WHERE c.subscription_status = 'trial';
