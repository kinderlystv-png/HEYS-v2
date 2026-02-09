# 🔐 Анализ архитектуры авторизации HEYS v2

**Дата анализа**: 2026-02-09  
**Версия**: Детальный audit

---

## ❌ Текущая проблема

### Два несовместимых механизма авторизации:

#### 1️⃣ **Supabase JWT** (Cloud Function) — ИСПОЛЬЗУЕТСЯ

```javascript
// Файл: yandex-cloud-functions/heys-api-rpc/index.js
// Функция: verifyJwt()

// Проверка JWT токена из Supabase Auth
const jwtResult = verifyJwt(token, JWT_SECRET);
curatorId = jwtResult.payload.sub;

// Добавляет p_curator_id в параметры RPC
params.p_curator_id = curatorId;
```

**Как работает:**

- Фронтенд получает JWT от Supabase Auth при логине куратора
- Сохраняет в `localStorage.getItem('heys_curator_session')`
- Отправляет в заголовке `Authorization: Bearer <JWT>`
- Cloud function проверяет подпись JWT через `JWT_SECRET`
- Извлекает `curator_id` из `payload.sub`

#### 2️⃣ **curator_sessions таблица** (Database) — НЕ ИСПОЛЬЗУЕТСЯ

```sql
-- Файл: database/2025-01-10_curator_sessions.sql
-- Таблица: curator_sessions

-- Проверка токена через SHA256 хеш
SELECT user_id FROM curator_sessions
WHERE token_hash = digest(p_curator_session_token, 'sha256')
  AND expires_at > NOW()
  AND is_revoked = false
```

**Как НЕ работает:**

- Таблица создана, но **пустая** (0 rows)
- Требует создание сессий через `create_curator_session()`
- Database functions проверяют через эту таблицу
- JWT токены из Supabase **НЕ хранятся** в этой таблице
- Результат: все проверки падают с "Неверная сессия куратора"

---

## 🔍 Детальный анализ

### admin_activate_trial — типичный пример проблемы

**Cloud function (heys-api-rpc):**

```javascript
// admin_activate_trial входит в ALLOWED_FUNCTIONS
const ALLOWED_FUNCTIONS = [
  // ...
  'admin_activate_trial', // ← НЕ ТРЕБУЕТ JWT!
  'admin_extend_subscription',
  'admin_cancel_subscription',
  // ...
];

// admin_activate_trial НЕ входит в CURATOR_ONLY_FUNCTIONS
const CURATOR_ONLY_FUNCTIONS = [
  'create_client_with_pin',
  'reset_client_pin',
  'get_curator_clients',
  'admin_extend_subscription', // ← ТРЕБУЕТ JWT
  'admin_cancel_subscription',
  // НЕТ admin_activate_trial!
];
```

**Результат**: Cloud function **НЕ проверяет** JWT для `admin_activate_trial`!

**Database function:**

```sql
-- Файл: database/2026-02-09_trial_machine_v3.sql
CREATE OR REPLACE FUNCTION admin_activate_trial(
  p_client_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_trial_days INT DEFAULT 7,
  p_curator_session_token TEXT DEFAULT NULL  -- ← Устаревший параметр
)
```

**Проверка:**

```sql
IF p_curator_session_token IS NOT NULL THEN
  SELECT user_id INTO v_curator_id
  FROM curator_sessions  -- ← Таблица ПУСТАЯ (0 rows)
  WHERE token_hash = digest(p_curator_session_token, 'sha256')
    AND expires_at > NOW();

  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Неверная сессия куратора');
  END IF;
END IF;
```

**Результат**:

- Фронтенд передаёт JWT токен в `p_curator_session_token`
- Database function ищет SHA256 хеш в пустой таблице
- Всегда падает с ошибкой "Неверная сессия куратора"

---

## ✅ Правильное решение (долгоиграющее)

### План рефакторинга:

#### 1. **Переместить admin\_\* функции в CURATOR_ONLY_FUNCTIONS**

```javascript
// yandex-cloud-functions/heys-api-rpc/index.js

const CURATOR_ONLY_FUNCTIONS = [
  // Существующие
  'create_client_with_pin',
  'reset_client_pin',
  'get_curator_clients',
  'admin_extend_subscription',
  'admin_cancel_subscription',
  'log_gamification_event_by_curator',
  'get_gamification_events_by_curator',
  'delete_gamification_events_by_curator',

  // ✅ ДОБАВИТЬ:
  'admin_activate_trial',
  'admin_get_leads',
  'admin_convert_lead',
  'admin_get_trial_queue_list',
  'admin_add_to_queue',
  'admin_remove_from_queue',
  'admin_send_offer',
  'admin_reject_request',
  'admin_get_queue_stats',
  'admin_update_queue_settings',
  'admin_extend_trial',
  'admin_get_all_clients',
];

// ✅ УБРАТЬ из ALLOWED_FUNCTIONS (переместить выше)
const ALLOWED_FUNCTIONS = [
  // ... клиентские функции ...
  // ❌ Убрать все admin_* функции отсюда
];
```

#### 2. **Обновить сигнатуры admin\_\* функций в БД**

Убрать параметр `p_curator_session_token`, добавить `p_curator_id`:

```sql
-- БЫЛО (НЕПРАВИЛЬНО):
CREATE OR REPLACE FUNCTION admin_activate_trial(
  p_client_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_trial_days INT DEFAULT 7,
  p_curator_session_token TEXT DEFAULT NULL  -- ❌ Убрать
)

-- СТАЛО (ПРАВИЛЬНО):
CREATE OR REPLACE FUNCTION admin_activate_trial(
  p_client_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_trial_days INT DEFAULT 7,
  p_curator_id UUID DEFAULT NULL  -- ✅ Добавить
)
```

Убрать проверку `curator_sessions`:

```sql
-- ❌ УБРАТЬ ЭТО:
IF p_curator_session_token IS NOT NULL THEN
  SELECT user_id INTO v_curator_id
  FROM curator_sessions
  WHERE token_hash = digest(p_curator_session_token, 'sha256')
    AND expires_at > NOW();

  IF v_curator_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Неверная сессия куратора');
  END IF;
END IF;

-- ✅ ЗАМЕНИТЬ НА:
-- v_curator_id уже передан через p_curator_id от cloud function после JWT проверки
-- Опционально: логировать v_curator_id для audit log
```

#### 3. **Создать миграцию для всех admin\_\* функций**

Список функций для обновления:

- `admin_activate_trial`
- `admin_extend_subscription` (уже правильная сигнатура)
- `admin_cancel_subscription` (уже правильная сигнатура)
- `admin_get_leads`
- `admin_convert_lead`
- `admin_extend_trial`
- `admin_reject_request`
- `admin_send_offer` (deprecated, но пофиксить)

#### 4. **Опционально: Удалить curator_sessions**

Если таблица не используется нигде:

```sql
-- Удаление curator_sessions infrastructure
DROP FUNCTION IF EXISTS create_curator_session;
DROP FUNCTION IF EXISTS validate_curator_session;
DROP FUNCTION IF EXISTS revoke_curator_session;
DROP TABLE IF EXISTS curator_sessions;
```

Или оставить для будущего использования, но задокументировать что она не
используется в текущей авторизации.

---

## 📋 Чеклист рефакторинга

### 1. Cloud Function (heys-api-rpc)

- [ ] Переместить все `admin_*` функции из `ALLOWED_FUNCTIONS` в
      `CURATOR_ONLY_FUNCTIONS`
- [ ] Верифицировать что JWT проверка работает для всех admin функций
- [ ] Добавить тесты авторизации

### 2. Database Functions

- [ ] Создать миграцию `2026-02-09_remove_curator_session_tokens.sql`
- [ ] Обновить сигнатуры всех admin\_\* функций (убрать p_curator_session_token)
- [ ] Добавить p_curator_id UUID DEFAULT NULL во все функции
- [ ] Убрать проверки curator_sessions из тел функций
- [ ] Опционально: добавить audit logging с curator_id

### 3. Frontend (опционально)

- [ ] Убрать передачу curator*session_token в RPC вызовы admin*\* функций
- [ ] Оставить только Authorization header с JWT

### 4. Документация

- [ ] Обновить API_DOCUMENTATION.md
- [ ] Обновить SECURITY_DOCUMENTATION.md
- [ ] Добавить раздел "Migration from curator_sessions to JWT-only"

### 5. Тестирование

- [ ] Проверить авторизацию всех admin\_\* функций
- [ ] Проверить что неавторизованные запросы отклоняются (403)
- [ ] Проверить что истекшие JWT не пропускаются
- [ ] Проверить что audit log сохраняет curator_id

---

## 🎯 Преимущества решения

1. **Единая точка авторизации** — только JWT проверка в cloud function
2. **Безопасность** — JWT подписан, проверяется криптографически
3. **Производительность** — нет лишних запросов к БД для проверки сессий
4. **Простота** — один механизм вместо двух
5. **Масштабируемость** — JWT stateless, не требует синхронизации сессий
6. **Аудит** — curator_id логируется из JWT payload, невозможно подделать

---

## ⚠️ Риски и mitigation

### Риск 1: Совместимость со старым кодом

- **Проблема**: Старый код может передавать p_curator_session_token
- **Решение**: Сделать параметр опциональным (DEFAULT NULL), игнорировать

### Риск 2: JWT_SECRET утечка

- **Проблема**: Если JWT_SECRET утекает, атакующий может создавать JWT
- **Решение**:
  - Хранить JWT_SECRET только в env variables cloud function
  - Ротация JWT_SECRET каждые 90 дней
  - Мониторинг подозрительных curator_id в запросах

### Риск 3: Downtime при миграции

- **Проблема**: Обновление функций может сломать активные сессии
- **Решение**:
  - Деплой в 2 этапа:
    1. Добавить p_curator_id, оставить p_curator_session_token (fallback)
    2. Через неделю убрать p_curator_session_token полностью

---

## 📝 Пример миграции (admin_activate_trial)

```sql
-- Файл: database/2026-02-09_admin_functions_jwt_only.sql

-- ═══════════════════════════════════════════════════════════════════
-- Миграция admin_* функций на JWT-only авторизацию
-- Убираем p_curator_session_token, используем p_curator_id
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- 1. admin_activate_trial v3.1 — JWT-only
DROP FUNCTION IF EXISTS admin_activate_trial(UUID, DATE, INT, TEXT);

CREATE OR REPLACE FUNCTION admin_activate_trial(
  p_client_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_trial_days INT DEFAULT 7,
  p_curator_id UUID DEFAULT NULL  -- ✅ JWT-проверенный curator ID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client RECORD;
  v_queue_id UUID;
  v_trial_start TIMESTAMPTZ;
  v_trial_end TIMESTAMPTZ;
  v_is_future BOOLEAN;
  v_status TEXT;
BEGIN
  -- 1. Куратор уже проверен cloud function через JWT
  --    p_curator_id содержит валидный curator ID или NULL
  --    Для audit log можем сохранить curator_id

  -- 2. Проверяем клиента
  SELECT id, name INTO v_client
  FROM clients
  WHERE id = p_client_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'not_found',
      'message', 'Клиент не найден'
    );
  END IF;

  -- 3. Определяем: сегодня или будущая дата
  v_is_future := p_start_date > CURRENT_DATE;
  v_trial_start := p_start_date::TIMESTAMPTZ;
  v_trial_end := (p_start_date + (p_trial_days || ' days')::INTERVAL)::TIMESTAMPTZ;

  IF NOT v_is_future THEN
    v_trial_start := NOW();
    v_trial_end := NOW() + (p_trial_days || ' days')::INTERVAL;
    v_status := 'trial';
  ELSE
    v_status := 'trial_pending';
  END IF;

  -- 4. Обновляем clients
  UPDATE clients
  SET
    subscription_status = v_status,
    trial_started_at = v_trial_start,
    trial_ends_at = v_trial_end,
    updated_at = NOW()
  WHERE id = p_client_id;

  -- 5. UPSERT в subscriptions
  INSERT INTO subscriptions (client_id, active_until, payment_method)
  VALUES (p_client_id, v_trial_end, 'trial')
  ON CONFLICT (client_id) DO UPDATE SET
    active_until = v_trial_end,
    payment_method = 'trial',
    updated_at = NOW();

  -- 6. AUDIT LOG: сохраняем curator_id если передан
  IF p_curator_id IS NOT NULL THEN
    INSERT INTO trial_queue_events (
      client_id,
      event_type,
      event_data
    ) VALUES (
      p_client_id,
      'trial_activated_by_curator',
      jsonb_build_object(
        'curator_id', p_curator_id,
        'start_date', p_start_date,
        'trial_days', p_trial_days,
        'status', v_status
      )
    );
  END IF;

  -- 7. Обновляем trial_queue если есть
  UPDATE trial_queue
  SET
    status = 'claimed',
    updated_at = NOW()
  WHERE client_id = p_client_id
    AND status IN ('queued', 'offer');

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'trial_started_at', v_trial_start,
    'trial_ends_at', v_trial_end,
    'is_future', v_is_future
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_activate_trial(UUID, DATE, INT, UUID) TO heys_rpc;
GRANT EXECUTE ON FUNCTION admin_activate_trial(UUID, DATE, INT, UUID) TO heys_admin;

COMMENT ON FUNCTION admin_activate_trial IS
  'Trial Machine v3.1 — JWT-only авторизация через p_curator_id. ' ||
  'Куратор выбирает дату старта триала (сегодня → trial, будущее → trial_pending)';

COMMIT;
```

---

## 🚀 Deployment plan

### Этап 1: Подготовка (сегодня)

1. Создать миграцию `2026-02-09_admin_functions_jwt_only.sql`
2. Обновить `heys-api-rpc/index.js` (переместить admin\_\* в
   CURATOR_ONLY_FUNCTIONS)
3. Тестирование на dev-окружении

### Этап 2: Деплой cloud function (завтра)

1. Задеплоить обновлённый heys-api-rpc
2. Проверить что JWT проверка работает
3. Мониторинг ошибок авторизации

### Этап 3: Деплой database migration (через 1 день)

1. Применить миграцию в production
2. Проверить что все admin\_\* функции работают
3. Проверить audit log

### Этап 4: Cleanup (через неделю)

1. Удалить curator_sessions таблицу (опционально)
2. Обновить документацию
3. Закрыть задачу

---

**Конец документа**
