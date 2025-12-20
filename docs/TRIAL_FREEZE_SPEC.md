# Заморозка триала при неактивности

## Концепция

Триал **замораживается** если пользователь неактивен (0 приёмов пищи за последние 3 дня). Это защищает от «проспанных» триалов и повышает конверсию.

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│  ВАРИАНТ 1: Server-side (рекомендуется для v2)         │
├─────────────────────────────────────────────────────────┤
│  • Cron-задача: раз в сутки проверяет активность        │
│  • SQL функция: get_inactive_trials()                   │
│  • Обновляет: trial_ends_at += неактивные дни           │
│  • Лог: таблица trial_freeze_log                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  ВАРИАНТ 2: Client-side (для MVP)                      │
├─────────────────────────────────────────────────────────┤
│  • При загрузке app: проверяем localStorage            │
│  • Считаем дни без meals: findGaps(meals, 3)           │
│  • Вызываем RPC: freeze_trial_days(client_id, days)    │
│  • Обновляем UI: badge показывает актуальные дни        │
└─────────────────────────────────────────────────────────┘
```

## Реализация для MVP (Client-side)

### SQL функция

```sql
CREATE OR REPLACE FUNCTION freeze_trial_days(
  p_client_id UUID,
  p_days_to_add INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client RECORD;
  v_new_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_client FROM clients WHERE id = p_client_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;
  
  -- Только для триалов
  IF v_client.subscription_status != 'trial' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in trial');
  END IF;
  
  -- Максимум +14 дней заморозки (защита от абьюза)
  IF p_days_to_add > 14 THEN
    p_days_to_add := 14;
  END IF;
  
  v_new_end := v_client.trial_ends_at + (p_days_to_add || ' days')::INTERVAL;
  
  UPDATE clients SET
    trial_ends_at = v_new_end,
    updated_at = NOW()
  WHERE id = p_client_id;
  
  -- Логируем
  INSERT INTO trial_freeze_log (client_id, days_added, reason)
  VALUES (p_client_id, p_days_to_add, 'inactivity');
  
  RETURN jsonb_build_object(
    'success', true,
    'days_added', p_days_to_add,
    'new_trial_ends_at', v_new_end
  );
END;
$$;

-- Таблица для логирования заморозок
CREATE TABLE IF NOT EXISTS trial_freeze_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  days_added INTEGER NOT NULL,
  reason TEXT, -- 'inactivity', 'force_majeure', 'manual'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trial_freeze_log_client ON trial_freeze_log(client_id);
```

### JS-код (heys_subscriptions_v1.js)

```javascript
/**
 * Проверка неактивности триала и автозаморозка
 * Вызывается при загрузке приложения для триал-пользователей
 */
async function checkTrialActivity(clientId) {
  // 1. Получаем все дни клиента за последние 10 дней
  const days = [];
  for (let i = 0; i < 10; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayKey = `heys_${clientId}_day_${dateStr}`;
    const dayData = U.lsGet(dayKey);
    if (dayData && dayData.meals && dayData.meals.length > 0) {
      days.push({ date: dateStr, meals: dayData.meals.length });
    }
  }
  
  // 2. Находим последний активный день
  if (days.length === 0) {
    console.log('[Trial Freeze] No meals found in last 10 days');
    return;
  }
  
  days.sort((a, b) => b.date.localeCompare(a.date)); // Сортируем по убыванию
  const lastActiveDate = new Date(days[0].date);
  const today = new Date();
  const daysSinceActive = Math.floor((today - lastActiveDate) / (1000 * 60 * 60 * 24));
  
  console.log('[Trial Freeze] Last active:', lastActiveDate, '| Days since:', daysSinceActive);
  
  // 3. Если неактивен 3+ дня — замораживаем
  if (daysSinceActive >= 3) {
    const daysToFreeze = Math.min(daysSinceActive - 2, 14); // Max 14 дней
    console.log(`[Trial Freeze] Freezing trial for ${daysToFreeze} days`);
    
    const { data, error } = await HEYS.cloud.client
      .rpc('freeze_trial_days', {
        p_client_id: clientId,
        p_days_to_add: daysToFreeze
      });
    
    if (data?.success) {
      console.log('[Trial Freeze] Success:', data);
      // Обновляем badge
      HEYS.Subscriptions.refreshStatus();
    } else {
      console.error('[Trial Freeze] Error:', error || data?.error);
    }
  }
}

// Вызывать при инициализации приложения для триал-пользователей
HEYS.Subscriptions.checkTrialActivity = checkTrialActivity;
```

### Вызов при старте приложения

В `heys_app_v12.js`:

```javascript
React.useEffect(() => {
  const status = HEYS.Subscriptions.getStatus();
  if (status.is_trial && currentClient) {
    // Проверяем неактивность и замораживаем триал если нужно
    HEYS.Subscriptions.checkTrialActivity(currentClient).catch(console.error);
  }
}, [currentClient]);
```

## Реализация для v2 (Server-side)

### SQL функция для cron

```sql
CREATE OR REPLACE FUNCTION check_inactive_trials()
RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  last_active_date DATE,
  days_inactive INTEGER,
  trial_ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- TODO: Требует таблицу meals или day_records
  -- Пока это заглушка для будущей реализации
  RAISE NOTICE 'This function requires meals table implementation';
  RETURN;
END;
$$;
```

### Node.js cron-скрипт

```javascript
// scripts/cron-freeze-inactive-trials.js

async function freezeInactiveTrials() {
  const { data: inactiveTrials } = await supabase.rpc('check_inactive_trials');
  
  for (const trial of inactiveTrials) {
    if (trial.days_inactive >= 3) {
      const daysToFreeze = Math.min(trial.days_inactive - 2, 14);
      
      await supabase.rpc('freeze_trial_days', {
        p_client_id: trial.client_id,
        p_days_to_add: daysToFreeze
      });
      
      console.log(`Frozen trial for ${trial.client_name}: +${daysToFreeze} days`);
    }
  }
}

// Cron: 0 3 * * * (каждый день в 3:00)
```

## UI/UX

### Badge показывает правильные дни

```javascript
// До заморозки:
"Триал: 2 дня осталось"

// После заморозки (+3 дня):
"Триал: 5 дней осталось"
```

### Уведомление пользователю

```
💤 Ваш триал был на паузе {N} дней из-за неактивности.
   Теперь у вас {X} активных дней чтобы оценить HEYS!
```

## Метрики

- Процент замороженных триалов
- Конверсия после разморозки vs обычный триал
- Средняя длительность заморозки

## Ограничения

- Максимум 14 дней заморозки (защита от абьюза)
- Заморозка срабатывает только если 0 приёмов за последние 3 дня
- Не замораживаем если уже прошло >7 дней с начала триала (поздно)

## Когда включать

**MVP:** Отложить до v2 (сложная логика + риск багов)

**v2:** Включить после 100+ триалов и анализа причин неконверсии

## Вопросы для дискуссии

1. **Порог неактивности:** 3 дня оптимально? Или 2/5?
2. **Уведомления:** SMS/push при заморозке или тихо?
3. **Максимум заморозки:** 14 дней достаточно или меньше?
4. **Триггер:** При старте app или cron server-side?
