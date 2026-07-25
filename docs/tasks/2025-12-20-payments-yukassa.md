# 💳 Платежи и подписки (Mock + ЮKassa later)

> **Приоритет:** 🔴 БЛОКЕР MVP  
> **Время:** ~4-6 часов  
> **Зависимости:** Нет
> **Статус:** 🔄 В работе

---

## 📌 TL;DR

**Цель:** Пользователь может оплатить подписку (mock сейчас, ЮKassa позже)

**Что делаем:**
1. ✅ SQL миграция — поля subscription в clients + таблица payments
2. ✅ JS модуль — heys_subscriptions_v1.js с UI компонентами
3. ⬜ Интеграция в профиль — секция "Подписка"
4. ⬜ Триал-машина — автозапуск при первом приёме
5. ⬜ Read-only гейтинг — блокировка редактирования

**Зачем:**
- Монетизация продукта
- Гейтинг после триала
- Основа для триал-машины

---

## 📋 Бизнес-требования (из HEYS_BRIEF.md)

### Тарифы

| Тариф | Цена/мес | Описание |
|-------|----------|----------|
| **Base** | 1 990 ₽ | Приложение + умные подсказки + 1 чек-ин/неделю |
| **Pro** | 12 990 ₽ | + ведение дневника куратором + чат + созвон/неделю |
| **Pro+** | 19 990 ₽ | + 7/7 без дежурного + приоритетный SLA |

### Статусы подписки

```
trial → active → read_only → canceled
```

| Статус | Описание |
|--------|----------|
| `trial` | Триальный период (7 дней Pro бесплатно) |
| `active` | Оплачена подписка |
| `read_only` | Триал/подписка закончились, не оплачено |
| `canceled` | Отменена пользователем |

### Правила биллинга

- Подписка на месяц (не рекуррентная для MVP)
- Пользователь сам оплачивает (без автосписания)
- Возврат пропорционально неоказанным дням

---

## 🗄️ База данных

### Таблица `clients` — новые поля

```sql
-- Добавить в существующую таблицу clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS subscription_plan TEXT; -- 'base', 'pro', 'proplus'
ALTER TABLE clients ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;

-- Индекс для поиска истекающих подписок
CREATE INDEX IF NOT EXISTS idx_clients_subscription_expires 
ON clients(subscription_expires_at) 
WHERE subscription_status = 'active';
```

### Таблица `payments` — история платежей

```sql
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  
  -- ЮKassa данные
  yukassa_payment_id TEXT UNIQUE,
  yukassa_status TEXT, -- 'pending', 'waiting_for_capture', 'succeeded', 'canceled'
  
  -- Платёж
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'RUB',
  plan TEXT NOT NULL, -- 'base', 'pro', 'proplus'
  
  -- Период
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  
  -- Метаданные
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own payments" ON payments
  FOR SELECT USING (client_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM clients WHERE id = payments.client_id AND curator_id = auth.uid()));
```

---

## 🔧 Backend: ЮKassa интеграция

### Файл: `apps/web/api/payments/create.js`

```javascript
// POST /api/payments/create
// Body: { client_id, plan }
// Returns: { payment_url, payment_id }

// 1. Создать платёж в ЮKassa
// 2. Сохранить в таблицу payments
// 3. Вернуть URL для оплаты
```

### Файл: `apps/web/api/payments/webhook.js`

```javascript
// POST /api/payments/webhook
// Body: ЮKassa notification
// 
// 1. Проверить подпись
// 2. Найти платёж по yukassa_payment_id
// 3. Обновить статус платежа
// 4. Если succeeded → обновить subscription_status клиента
```

### Файл: `apps/web/api/payments/status.js`

```javascript
// GET /api/payments/status?client_id=xxx
// Returns: { status, plan, expires_at }
```

### ЮKassa API

```javascript
// Создание платежа
const payment = await fetch('https://api.yookassa.ru/v3/payments', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${Buffer.from(shopId + ':' + secretKey).toString('base64')}`,
    'Idempotence-Key': uuid(),
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: { value: '12990.00', currency: 'RUB' },
    confirmation: { 
      type: 'redirect', 
      return_url: 'https://app.heyslab.ru/payment-success'
    },
    capture: true,
    description: 'HEYS Pro подписка на 1 месяц',
    metadata: { client_id, plan }
  })
});
```

---

## 🎨 Frontend

### Компонент: `PaymentScreen`

```
┌─────────────────────────────────────────┐
│         💳 Выберите тариф               │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │  Base                           │    │
│  │  1 990 ₽/мес                    │    │
│  │  • Приложение + подсказки       │    │
│  │  • 1 чек-ин/неделю              │    │
│  │  [Выбрать]                      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Pro ⭐ Рекомендуем             │    │
│  │  12 990 ₽/мес                   │    │
│  │  • Ведение дневника куратором   │    │
│  │  • Чат + созвон/неделю          │    │
│  │  [Выбрать]                      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Pro+                           │    │
│  │  19 990 ₽/мес                   │    │
│  │  • Всё из Pro                   │    │
│  │  • 7/7 без дежурного            │    │
│  │  • Приоритетный SLA             │    │
│  │  [Выбрать]                      │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Файл: `apps/web/heys_payments_v1.js`

Модуль платежей:
- `PaymentScreen` — выбор тарифа
- `PaymentSuccessScreen` — после успешной оплаты
- `SubscriptionBadge` — бейдж статуса в профиле
- `PaywallBanner` — баннер "Подписка не активна"

### Интеграция в UI

1. **Профиль** → секция "Подписка" с текущим статусом
2. **После триала** → показать PaymentScreen
3. **В навигации** → если read_only, показать баннер

---

## 📦 Environment Variables

```env
# ЮKassa (Yandex Cloud)
YUKASSA_SHOP_ID=xxx
YUKASSA_SECRET_KEY=xxx
YUKASSA_WEBHOOK_SECRET=xxx

# Для проверки подписи webhook
```

---

## ✅ Чеклист

### База данных
- [ ] Миграция: поля subscription в clients
- [ ] Миграция: таблица payments
- [ ] RLS политики

### Backend API
- [ ] POST /api/payments/create
- [ ] POST /api/payments/webhook
- [ ] GET /api/payments/status
- [ ] Проверка подписи webhook

### Frontend
- [ ] PaymentScreen (выбор тарифа)
- [ ] PaymentSuccessScreen
- [ ] SubscriptionBadge в профиле
- [ ] PaywallBanner для read_only

### Тестирование
- [ ] Тестовый платёж в sandbox ЮKassa
- [ ] Webhook обработка
- [ ] Статус обновляется корректно

---

## 🔗 Ресурсы

- [ЮKassa API документация](https://yookassa.ru/developers/api)
- [Webhook обработка](https://yookassa.ru/developers/using-api/webhooks)
- [Тестовые карты](https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing)

---

## 📝 Примечания

1. **MVP без рекурренту** — пользователь сам оплачивает каждый месяц
2. **Фискализация** — ЮKassa может отправлять чеки (настроить в ЛК)
3. **Refund** — ручной процесс через ЛК ЮKassa

---

## DoD (Definition of Done)

✅ Пользователь может:
1. Выбрать тариф
2. Перейти на страницу оплаты ЮKassa
3. После успешной оплаты — subscription_status = 'active'
4. Видеть статус подписки в профиле
