# Очередь на триал + покупка без ожидания (Base/Pro/Pro+)

> **Статус:** 🟡 В работе  
> **Дата:** 2025-12-24  
> **Приоритет:** HIGH  
> **MVP оценка:** 12–16 часов + лендинг 4–6 часов

---

## 🎯 Что это и как работает (простым языком)

### Проблема
Куратор может вести одновременно только 3–5 клиентов на триале. Если придёт 20 человек сразу — качество упадёт, люди разочаруются, конверсия в оплату будет нулевой.

### Решение
Делаем **умную очередь на бесплатный триал** + **покупка всегда без очереди**.

### Как это выглядит для пользователя

**Сценарий 1: Есть свободное место**
1. Человек заходит на лендинг → видит "🟢 Свободно 2 места из 3"
2. Нажимает "Начать триал" → получает **предложение (offer)** на 2 часа
3. Подтверждает → триал стартует
4. Не подтвердил за 2 часа → место уходит следующему

**Сценарий 2: Мест нет**
1. Человек видит "🔴 Мест нет • В очереди: 5 человек"
2. Нажимает "Встать в очередь" → получает позицию (#6)
3. Когда место освободится — получит уведомление в Telegram
4. 2 часа на подтверждение → если не успел, место уходит дальше

**Сценарий 3: Не хочу ждать**
- Рядом всегда кнопка **"Купить без ожидания"**
- Покупка любого тарифа (Base/Pro/Pro+) — **мгновенно**, без очереди
- Если был в очереди и купил — автоматически снимаем из очереди

### Почему это честно
- Очередь только на **бесплатное** — платящие не ждут
- Позицию нельзя "перепрыгнуть" повторными запросами
- Offer не продлевается — все в равных условиях
- Куратор не перегружен → качество для всех

### Что делаем технически
1. **Таблица `trial_queue`** — хранит очередь и статусы (queued → offer → assigned)
2. **Assigner** — каждые 5–10 минут проверяет слоты и раздаёт offers
3. **Виджет на лендинге** — показывает места в реальном времени
4. **Уведомления** — Telegram когда пришла очередь

---

## ⚠️ Критические правки (иначе будут дыры/баги)

### 1) `session_token` — opaque token + pgcrypto

UUID угадывать сложнее числа, но **это не секрет**. Для PIN-auth нужен **opaque token**:
- `session_token TEXT` (рандом 32 байта hex/base64)
- в БД хранить `token_hash BYTEA` через `pgcrypto`:
  ```sql
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  token_hash BYTEA = digest(p_session_token, 'sha256')
  ```
- поиск: `WHERE token_hash = digest(p_session_token, 'sha256')`

⚠️ **НЕ использовать** `encode(sha256(...), 'hex')` — в Postgres так не работает!

### 2) Единый источник правды для подписок

В текущей схеме поля в `clients` (subscription_status/trial_ends_at/trial_started_at). Для MVP:
- **trial/status поля в `clients`** — единственный источник
- очередь отдельно в `trial_queue`

### 3) `current_active_trials` не хранить

Убрать поле из таблицы лимитов полностью — считать запросом.

### 4) Позиция в очереди — относительно записи

Позиция должна вычисляться относительно конкретной записи (`queued_at + priority`), а не "COUNT(*) по now()".

### 5) Offer → Claim → Trial

Ассайнер **выдает offer**, а trial стартует **только после claim**. Иначе будут "assigned без старта" и занятые слоты.

### 6) Защита от гонок (oversubscribe)

При наплыве 20 человек все могут увидеть "слот есть" и получить offer. Решение:
```sql
SELECT pg_advisory_xact_lock(hashtext('trial_capacity'));
```
В начале `request_trial()` и `assign_trials_from_queue()`.

### 7) trial_queue: одна запись на клиента (MVP)

`client_id UNIQUE` в таблице — **запрещает** хранить историю попыток.
**MVP решение:** одна актуальная запись + история в `trial_queue_events`.

### 8) Offer expiry: жёсткий вариант

`offer_expired` → запись становится `expired`, слот уходит следующему.
Чтобы снова участвовать — пользователь заново вызывает `request_trial()`.
Мягкий вариант (возврат в очередь) — только в v2 с лимитом попыток.

### 9) Позиция в очереди — формула (учитывает priority)

Эталонная формула (1-based): "сколько людей **впереди** меня по `(priority DESC, queued_at ASC)` + 1":

```sql
-- позиция относительно своей записи (1-based)
SELECT COUNT(*) + 1
INTO v_position
FROM trial_queue
WHERE status = 'queued'
  AND (
    priority > v_my_priority
    OR (priority = v_my_priority AND queued_at < v_my_queued_at)
  );
```

⚠️ **Важно:** используем `<`, не `<=`, т.к. позиция = "сколько впереди + 1". При `<=` позиция будет на 1 больше.

### 10) Запрет "перепрыгивания очереди" повторными запросами

При `ON CONFLICT` **нельзя обновлять `queued_at`** — иначе абьюз.

**Правило MVP:**
- Если `status IN ('queued', 'offer')` → **не менять `queued_at`**, вернуть `get_trial_queue_status()`
- Если `status IN ('expired', 'canceled', 'canceled_by_purchase')` → разрешить заново поставить в очередь с новым `queued_at`

### 11) claim_trial_offer: идемпотентность + покупка во время offer

Добавить guards:
- Если `clients.subscription_status = 'active'` → закрыть очередь как `canceled_by_purchase`, вернуть `already_active`
- Если `clients.trial_started_at IS NOT NULL` → вернуть `already_started` (идемпотентно)

Это защитит от гонок "оплата vs claim".

### 12) assign_trials_from_queue: пропускать купивших/уже стартовавших

В SELECT добавить фильтр:
```sql
SELECT tq.*
FROM trial_queue tq
JOIN clients c ON c.id = tq.client_id
WHERE tq.status = 'queued'
  AND c.subscription_status != 'active'
  AND c.trial_started_at IS NULL
ORDER BY tq.priority DESC, tq.queued_at ASC
LIMIT ...
```

---

## 📌 TL;DR

**Цель:** защититься от наплыва бесплатных триалов и не блокировать продажи.

**Правило продукта:**
- Очередь применяется **только к бесплатному триалу**
- Покупка **любой** подписки (Base/Pro/Pro+) — **всегда сразу**, без очереди
- Слот триала = единица реальной нагрузки куратора (не просто "trial статус")
- Claim window: слот предлагается на 2–6 часов; не подтвердил — уходит следующему

**Что делаем:**
1. Admission control (пускать в триал или в очередь)
2. Waitlist storage + Assigner worker
3. Offer + Claim механика
4. Notifications (Telegram/SMS)
5. Лендинг: два пути + виджет мест
6. Admin controls (лимиты, пауза)

---

## ✨ UX-апгрейд "суперкруто" (минимальная цена разработки)

- На лендинге показывать **виджет мест** (свободные слоты + размер очереди).
- Сразу в этом же экране давать альтернативу **"Купить без ожидания"** (без дополнительных переходов).
- Эффект: резко снижает трение и не выглядит как "продавливаем оплату", потому что всё прозрачно и честно.

---

## 1) Продуктовая модель

### 1.1 Что пользователь может сделать

1. **Начать бесплатный триал** (может потребовать ожидания, если нет слотов)
2. **Купить тариф сразу** (всегда доступно, без очереди)

### 1.2 Почему очередь только на триал

- Триал — зона абьюза и всплесков (10–20 одновременно).
- Платная покупка — намерение сильнее; блокировать её очередью нельзя.

### 1.3 SLA для платных (честно, без обещаний сверх возможностей)

- Pro: "ответ куратора в течение 24 часов"
- Pro+: "ответ куратора в течение 4 часов"

Если сомневаешься — "в течение 24 часов в рабочие дни".

---

## 2) Что такое "слот триала"

### MVP (текущая реализация)

Слот занят = `clients.subscription_status = 'trial' AND clients.trial_ends_at > NOW()`

Простой подсчёт по времени.

**MVP capacity — глобальная** (все слоты суммарно, под одного куратора).

### v2 (когда понадобится точнее)

Слот занят, если клиент в триале **и**:
- есть активность за последние `N` дней (например `3`)
  **или**
- есть незакрытое "обязательное действие куратора" (чек-ин/вопрос/задача)

**v2 capacity — per curator** (шардирование очереди по `curator_id`, если несколько кураторов).

⚠️ **Важно:** в MVP используем простую модель. v2 требует отдельной таски.

---

## 3) Состояния и переходы

**Состояния:**
- `trial_not_started`
- `trial_queued`
- `trial_offer` (**2 часа** на claim — MVP)
- `trial_active`
- `trial_expired` → read_only

**Ключевые переходы:**
- `request_trial()` → возвращает `trial_offer` **только если `available_slots > 0`**, иначе `trial_queued`
- `assign_trials_from_queue()` → **единственный** механизм выдачи offer при освобождении слота (для клиентов в `queued`)
- `claim_trial_offer()` → старт триала
- **offer_expired** → вылетел, надо заново запросить (жёсткий вариант для MVP)
- покупка → всегда активируем сразу, очередь отменяем

---

## 4) UX на лендинге heyslab.ru

### 4.1 Hero: два маршрута + виджет мест

CTA рядом:
- **"Начать бесплатный триал"** / **"Встать в очередь"** (динамически)
- **"Купить тариф сразу"**

**Виджет мест — три состояния:**

1. `available_slots > 0`:
   - 🟢 **Свободно мест: X из Y**
   - CTA: "Начать триал"

2. `available_slots = 0`:
   - 🔴 **Мест нет • В очереди: N**
   - CTA: "Встать в очередь"

3. `offer для текущего пользователя`:
   - 🟡 **Место доступно! Подтвердите за HH:MM**
   - CTA: "Начать триал" (таймер 2ч)

**Всегда рядом альтернативный CTA:**
- "Купить без ожидания" (в Hero и в модалке триала)

Короткий текст под CTA (антискепсис):

> "Триал ограничен по местам, чтобы гарантировать качество.  
> Любой тариф можно купить сразу — без ожидания."

### 4.2 Карточки тарифов

- Base: "самостоятельно" → **Купить**
- Pro: "с куратором" + SLA → **Купить**
- Pro+: "с куратором + приоритет" + SLA → **Купить**

---

## 5) База данных (MVP)

### 5.0 Расширение pgcrypto

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### 5.1 `trial_queue`

```sql
CREATE TABLE trial_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) UNIQUE, -- одна актуальная запись на клиента
  curator_id UUID, -- назначенный куратор (опционально)
  
  status TEXT NOT NULL DEFAULT 'queued' 
    CHECK (status IN ('queued', 'offer', 'assigned', 'canceled', 'canceled_by_purchase', 'expired')),
  
  -- Timestamps
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  offer_sent_at TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  
  -- Meta
  source TEXT, -- landing / app / referral / utm_*
  priority INT DEFAULT 0, -- для priority boost (referral, депозит)
  notification_channel TEXT DEFAULT 'telegram',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для эффективных запросов
CREATE INDEX idx_trial_queue_status_queued ON trial_queue(status, queued_at) WHERE status = 'queued';
CREATE INDEX idx_trial_queue_status_offer ON trial_queue(status, offer_expires_at) WHERE status = 'offer';
```

**Важно:**
- `client_id UNIQUE` — одна актуальная запись, история в `trial_queue_events`
- `position` НЕ хранить — вычислять
- `current_active_trials` НЕ хранить — считать запросом

### 5.2 `curator_trial_limits`

```sql
CREATE TABLE curator_trial_limits (
  curator_id UUID PRIMARY KEY, -- ссылка на auth.users
  max_active_trials INT NOT NULL DEFAULT 3,
  is_accepting_trials BOOLEAN DEFAULT TRUE, -- пауза
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.3 `trial_queue_events` (для аналитики)

```sql
CREATE TABLE trial_queue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- queued, offer_sent, claimed, offer_expired, canceled, purchased
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trial_queue_events_client ON trial_queue_events(client_id);
```

---

## 6) RPC / API контракт (MVP, под PIN-auth)

### 6.0 Важно про сессию (PIN-auth)

- `session_token` передаётся как **TEXT** (opaque token)
- В БД хранится **только hash**: `token_hash BYTEA = digest(token, 'sha256')`
- Любые RPC для клиента принимают `p_session_token TEXT` и получают `client_id` через `client_sessions`
- Поиск сессии: `WHERE token_hash = digest(p_session_token, 'sha256')`

### 6.1 Публичный виджет для лендинга

```sql
-- Безопасно дёргать с лендинга (без auth)
CREATE FUNCTION get_public_trial_capacity()
RETURNS JSONB AS $$
DECLARE
  v_total_slots INT;
  v_used_slots INT;
  v_queue_size INT;
BEGIN
  -- Считаем слоты (не храним!)
  SELECT COALESCE(SUM(max_active_trials), 0) INTO v_total_slots 
  FROM curator_trial_limits WHERE is_accepting_trials = TRUE;
  
  -- Считаем занятые (активные триалы из clients) — MVP модель
  SELECT COUNT(*) INTO v_used_slots 
  FROM clients 
  WHERE subscription_status = 'trial' 
    AND trial_ends_at > NOW();
  
  SELECT COUNT(*) INTO v_queue_size FROM trial_queue WHERE status = 'queued';
  
  RETURN jsonb_build_object(
    'available_slots', GREATEST(0, v_total_slots - v_used_slots),
    'total_slots', v_total_slots,
    'queue_size', v_queue_size,
    'is_accepting', (v_total_slots > 0) AND (v_total_slots > v_used_slots),
    'offer_window_minutes', 120,  -- 2 часа на claim
    'trial_days', 7               -- длительность триала
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 6.2 request_trial(session_token TEXT, source TEXT)

**Поведение при ON CONFLICT:**
- Если уже `queued/offer` → возвращаем `get_trial_queue_status()`, **не обновляем queued_at**
- Если `expired/canceled` → можно заново поставить в очередь с новым `queued_at`

```sql
CREATE FUNCTION request_trial(p_session_token TEXT, p_source TEXT DEFAULT 'app')
RETURNS JSONB AS $$
DECLARE
  v_client_id UUID;
  v_free_slots INT;
  v_position INT;
  v_existing RECORD;
  v_my_queued_at TIMESTAMPTZ;
  v_my_priority INT;
BEGIN
  -- ⚠️ Лок от гонок
  PERFORM pg_advisory_xact_lock(hashtext('trial_capacity'));
  
  -- Получить client_id из сессии (pgcrypto digest)
  SELECT client_id INTO v_client_id FROM client_sessions 
  WHERE token_hash = digest(p_session_token, 'sha256') 
    AND expires_at > NOW() 
    AND revoked_at IS NULL;
  
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;
  
  -- Проверить: уже был/есть триал? (trial_started_at — явный флаг)
  IF EXISTS (SELECT 1 FROM clients WHERE id = v_client_id AND trial_started_at IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'trial_already_used');
  END IF;
  
  -- Проверить существующую запись в очереди
  SELECT * INTO v_existing FROM trial_queue WHERE client_id = v_client_id;
  
  -- ⚠️ Если есть offer и он истёк — переводим в expired и продолжаем как новую попытку
  -- NB: событие offer_expired логируем один раз — UPDATE меняет статус, повторный вызов не попадёт сюда
  IF v_existing IS NOT NULL
     AND v_existing.status = 'offer'
     AND v_existing.offer_expires_at IS NOT NULL
     AND v_existing.offer_expires_at < NOW()
  THEN
    UPDATE trial_queue
    SET status = 'expired', updated_at = NOW()
    WHERE client_id = v_client_id;

    INSERT INTO trial_queue_events (client_id, event_type)
    VALUES (v_client_id, 'offer_expired');
    
    -- Обнуляем v_existing, чтобы логика ниже работала как "expired"
    v_existing := NULL;
  END IF;
  
  -- ⚠️ Если queued/offer (не истёк) — НЕ ОБНОВЛЯЕМ queued_at, возвращаем статус
  IF v_existing IS NOT NULL AND v_existing.status IN ('queued', 'offer') THEN
    RETURN get_trial_queue_status(p_session_token);
  END IF;
  
  -- Проверить свободные слоты
  SELECT (get_public_trial_capacity()->>'available_slots')::INT INTO v_free_slots;
  
  IF v_free_slots > 0 THEN
    -- Выдаём offer сразу (единообразно — всегда через claim)
    INSERT INTO trial_queue (client_id, source, status, offer_sent_at, offer_expires_at)
    VALUES (v_client_id, p_source, 'offer', NOW(), NOW() + INTERVAL '2 hours')
    ON CONFLICT (client_id) DO UPDATE SET
      status = 'offer',
      offer_sent_at = NOW(),
      offer_expires_at = NOW() + INTERVAL '2 hours',
      updated_at = NOW();
    
    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (v_client_id, 'offer_sent', jsonb_build_object('source', p_source, 'immediate', true));
    
    RETURN jsonb_build_object(
      'success', true,
      'result', 'offer',
      'offer_expires_at', NOW() + INTERVAL '2 hours',
      'message', 'Место доступно! Подтвердите в течение 2 часов.'
    );
  ELSE
    -- Ставим в очередь (queued_at обновляется только для новых/expired/canceled)
    INSERT INTO trial_queue (client_id, source, status, queued_at)
    VALUES (v_client_id, p_source, 'queued', NOW())
    ON CONFLICT (client_id) DO UPDATE SET
      status = 'queued',
      queued_at = NOW(),  -- Ок, т.к. мы уже проверили что status НЕ queued/offer
      updated_at = NOW();
    
    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (v_client_id, 'queued', jsonb_build_object('source', p_source));
    
    -- Получить свою запись для расчёта позиции
    SELECT queued_at, priority INTO v_my_queued_at, v_my_priority
    FROM trial_queue WHERE client_id = v_client_id;
    
    -- ⚠️ Позиция: сколько впереди меня по (priority DESC, queued_at ASC) + 1
    SELECT COUNT(*) + 1 INTO v_position
    FROM trial_queue
    WHERE status = 'queued'
      AND (
        priority > v_my_priority
        OR (priority = v_my_priority AND queued_at < v_my_queued_at)
      );
    
    RETURN jsonb_build_object(
      'success', true,
      'result', 'queued',
      'position', v_position,
      'queue_size', (SELECT COUNT(*) FROM trial_queue WHERE status = 'queued'),
      'message', 'Вы в очереди на триал'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 6.3 get_trial_queue_status(session_token TEXT)

```sql
CREATE FUNCTION get_trial_queue_status(p_session_token TEXT)
RETURNS JSONB AS $$
DECLARE
  v_client_id UUID;
  v_queue RECORD;
  v_position INT;
BEGIN
  -- Получить client_id из сессии (pgcrypto digest)
  SELECT client_id INTO v_client_id FROM client_sessions 
  WHERE token_hash = digest(p_session_token, 'sha256') 
    AND expires_at > NOW() 
    AND revoked_at IS NULL;
  
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;
  
  SELECT * INTO v_queue FROM trial_queue WHERE client_id = v_client_id;
  
  IF v_queue IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'not_in_queue');
  END IF;
  
  -- Вычислить позицию относительно записи (1-based)
  IF v_queue.status = 'queued' THEN
    SELECT COUNT(*) + 1 INTO v_position FROM trial_queue 
    WHERE status = 'queued' 
      AND (priority > v_queue.priority 
           OR (priority = v_queue.priority AND queued_at < v_queue.queued_at));
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'status', v_queue.status,
    'position', v_position,
    'queued_at', v_queue.queued_at,
    'offer_expires_at', v_queue.offer_expires_at,
    'queue_size', (SELECT COUNT(*) FROM trial_queue WHERE status = 'queued')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 6.4 claim_trial_offer(session_token TEXT)

**Guards для идемпотентности + покупка во время offer:**
- Если `clients.subscription_status = 'active'` → `canceled_by_purchase`, return `already_active`
- Если `clients.trial_started_at IS NOT NULL` → return `already_started`

```sql
CREATE FUNCTION claim_trial_offer(p_session_token TEXT)
RETURNS JSONB AS $$
DECLARE
  v_client_id UUID;
  v_client RECORD;
  v_queue RECORD;
BEGIN
  -- Получить client_id из сессии (pgcrypto digest)
  SELECT client_id INTO v_client_id FROM client_sessions 
  WHERE token_hash = digest(p_session_token, 'sha256') 
    AND expires_at > NOW() 
    AND revoked_at IS NULL;
  
  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;
  
  -- ⚠️ Guard: проверить состояние клиента
  SELECT * INTO v_client FROM clients WHERE id = v_client_id;
  
  -- Guard 1: Уже купил подписку во время offer
  IF v_client.subscription_status = 'active' THEN
    UPDATE trial_queue SET status = 'canceled_by_purchase', updated_at = NOW()
    WHERE client_id = v_client_id AND status = 'offer';
    INSERT INTO trial_queue_events (client_id, event_type) VALUES (v_client_id, 'canceled_by_purchase');
    RETURN jsonb_build_object('success', false, 'error', 'already_active', 'message', 'У вас уже есть активная подписка.');
  END IF;
  
  -- Guard 2: Триал уже стартовал (идемпотентность)
  IF v_client.trial_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_started', 'message', 'Триал уже активен.');
  END IF;
  
  SELECT * INTO v_queue FROM trial_queue 
  WHERE client_id = v_client_id AND status = 'offer';
  
  IF v_queue IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_offer_available');
  END IF;
  
  -- Проверить не истёк ли offer (жёсткий вариант: expired = вылетел)
  IF v_queue.offer_expires_at < NOW() THEN
    UPDATE trial_queue SET status = 'expired', updated_at = NOW() WHERE id = v_queue.id;
    INSERT INTO trial_queue_events (client_id, event_type) VALUES (v_client_id, 'offer_expired');
    RETURN jsonb_build_object('success', false, 'error', 'offer_expired', 'message', 'Время истекло. Запросите триал снова.');
  END IF;
  
  -- Помечаем как assigned
  UPDATE trial_queue SET status = 'assigned', assigned_at = NOW(), updated_at = NOW() WHERE id = v_queue.id;
  
  -- Стартуем триал (обновляем clients)
  UPDATE clients SET 
    subscription_status = 'trial',
    trial_started_at = NOW(),
    trial_ends_at = NOW() + INTERVAL '7 days',
    updated_at = NOW()
  WHERE id = v_client_id;
  
  INSERT INTO trial_queue_events (client_id, event_type) VALUES (v_client_id, 'claimed');
  
  RETURN jsonb_build_object('success', true, 'message', 'Триал начат!', 'trial_ends_at', NOW() + INTERVAL '7 days');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 6.5 assign_trials_from_queue(limit INT)

**Guard:** пропускать тех, кто уже купил или уже получил trial.

```sql
-- Вызывается воркером/cron каждые 5-10 минут
CREATE FUNCTION assign_trials_from_queue(p_limit INT DEFAULT 10)
RETURNS JSONB AS $$
DECLARE
  v_assigned INT := 0;
  v_queue_row RECORD;
  v_available INT;
  v_offer_window INTERVAL := INTERVAL '2 hours';
BEGIN
  -- ⚠️ Лок от гонок
  PERFORM pg_advisory_xact_lock(hashtext('trial_capacity'));
  
  -- Сначала: expired offers → пометить expired
  UPDATE trial_queue SET status = 'expired', updated_at = NOW()
  WHERE status = 'offer' AND offer_expires_at < NOW();
  
  -- Проверить доступные слоты
  SELECT (get_public_trial_capacity()->>'available_slots')::INT INTO v_available;
  
  IF v_available <= 0 THEN
    RETURN jsonb_build_object('assigned', 0, 'reason', 'no_slots_available');
  END IF;
  
  -- ⚠️ Раздать offers первым в очереди (с фильтром по клиентам!)
  FOR v_queue_row IN 
    SELECT tq.*
    FROM trial_queue tq
    JOIN clients c ON c.id = tq.client_id
    WHERE tq.status = 'queued'
      AND c.subscription_status != 'active'      -- не купил
      AND c.trial_started_at IS NULL             -- не стартовал trial
    ORDER BY tq.priority DESC, tq.queued_at ASC 
    LIMIT LEAST(p_limit, v_available)
  LOOP
    UPDATE trial_queue SET 
      status = 'offer',
      offer_sent_at = NOW(),
      offer_expires_at = NOW() + v_offer_window,
      updated_at = NOW()
    WHERE id = v_queue_row.id;
    
    INSERT INTO trial_queue_events (client_id, event_type, meta)
    VALUES (v_queue_row.client_id, 'offer_sent', jsonb_build_object('expires_at', NOW() + v_offer_window));
    
    -- TODO: Отправить уведомление (Telegram/SMS)
    -- PERFORM send_trial_offer_notification(v_queue_row.client_id);
    
    v_assigned := v_assigned + 1;
  END LOOP;
  
  RETURN jsonb_build_object('assigned', v_assigned);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 7) Интеграция с покупкой (обязательно!)

При успешной оплате любого тарифа:

```sql
-- Добавить в обработчик покупки
UPDATE trial_queue 
SET status = 'canceled_by_purchase', canceled_at = NOW(), updated_at = NOW()
WHERE client_id = p_client_id AND status IN ('queued', 'offer');

INSERT INTO trial_queue_events (client_id, event_type, meta)
VALUES (p_client_id, 'purchased', jsonb_build_object('tariff', p_tariff));
```

Чтобы не занимал место в очереди.

---

## 8) Антиабьюз (MVP)

1. **1 триал на телефон** — проверка в `request_trial()`
2. **Cooldown повторного триала** — 30 дней после отмены/истечения
3. **Rate limit на request_trial** — max 3 заявки в час с одного IP
4. **Claim window** — 2–6 часов

---

## 9) Метрики

| Метрика | Описание |
|---------|----------|
| `waitlist_size` | Текущий размер очереди |
| `wait_time_p50` | Медианное время ожидания |
| `wait_time_p90` | 90-й перцентиль ожидания |
| `offer_claim_rate` | % подтвердивших offer |
| `trial_to_paid` | Конверсия триал → покупка |
| `paid_direct` | Сколько купили без триала |
| `curator_load` | Активных триалов на куратора |

---

## 📅 План работ (пошагово)

### Phase 1: Backend (4–6ч)
- [ ] Таблицы очереди и лимитов
- [ ] RPC: capacity/status/request/claim/cancel
- [ ] Assigner RPC + cron
- [ ] Снятие из очереди при покупке

### Phase 2: App (4–6ч)
- [ ] TrialCapacityWidget
- [ ] QueueStatusCard
- [ ] OfferClaimCard (таймер)
- [ ] Везде кнопка "Купить без ожидания"

### Phase 3: Landing (4–6ч)
- [ ] Hero с двумя путями + виджет мест
- [ ] Модалка триала (slot/queue/offer)
- [ ] Тарифы с "Купить сразу"

### Phase 4: Уведомления (2–4ч)
- [ ] Telegram + SMS fallback
- [ ] Шаблоны сообщений

---

## 🔗 Связанные файлы

| Файл | Описание |
|------|----------|
| `database/2025-12-24_subscriptions_and_sessions_yc.sql` | Текущая схема подписок |
| `apps/web/heys_subscription_v1.js` | Модуль подписок |
| `apps/web/heys_paywall_v1.js` | Paywall UI |
| `apps/landing/` | Landing page |
| `yandex-cloud-functions/heys-api-rpc/index.js` | RPC gateway |

---

## ✅ Definition of Done

1. ✅ Нет слотов → очередь + позиция (вычисляется относительно записи)
2. ✅ Слот появился → offer + таймер
3. ✅ Claim → trial стартует
4. ✅ Таймаут offer → следующий
5. ✅ Любой тариф покупается сразу
6. ✅ Покупка снимает из очереди (`canceled_by_purchase`)
7. ✅ Лендинг показывает места и "купить без ожидания" на одном экране
8. ✅ Повторные `request_trial` НЕ сбрасывают позицию в очереди
9. ✅ `assign_trials` пропускает клиентов, которые уже купили/стартовали триал
10. ✅ `request_trial()` корректно обрабатывает просроченный offer: переводит в `expired` и позволяет заново запросить триал
11. ✅ На клиента не может существовать более одного активного `offer` (UNIQUE constraint на `client_id`)
12. ✅ Повторный `request_trial()` при активном `offer` **не продлевает** `offer_expires_at` (возвращает статус без изменений)
13. ✅ `get_public_trial_capacity()` возвращает `offer_window_minutes` и `trial_days` — лендинг/приложение используют эти значения без хардкода
