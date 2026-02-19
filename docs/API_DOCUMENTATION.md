# � HEYS API Documentation

> **Version:** 15.1.0  
> **Last Updated:** February 12, 2026  
> **Status:** Production Ready (v4.8.8 — React State Sync Fix)  
> **Maintainer:** @development-team

## 📋 Overview

HEYS Platform предоставляет API для ведения дневника питания,
нутрициологического анализа и управления клиентами. API реализован через **7
Yandex Cloud Functions** (serverless, nodejs18).

**Base URL:** `https://api.heyslab.ru`  
**Authentication:** Клиенты: PIN → `session_token` | Кураторы: JWT (Bearer)  
**Content-Type:** `application/json`  
**CORS:** только `app.heyslab.ru`, `heyslab.ru`

## 🏗️ Architecture

### Core Components

- **Legacy Core** - LocalStorage-based data management (`heys_*.js` vanilla JS)
- **Modern Layer** - TypeScript/React (`packages/`, `apps/web/src/`)
- **API Layer** - 7 Yandex Cloud Functions at `api.heyslab.ru`
- **Security Layer** - Input validation, XSS protection, session-based IDOR
  protection

## 🔐 Authentication

### Клиенты (phone + PIN)

```javascript
// PIN-авторизация — возвращает session_token
await HEYS.YandexAPI.rpc('client_pin_auth', {
  p_phone: '+7XXXXXXXXXX',
  p_pin: '1234',
});
// Returns: { session_token, client_id, name, curator_id }

// Все последующие RPC вызовы используют session_token автоматически
// (через HEYS.YandexAPI — не передавай client_id напрямую!)
```

### Кураторы (email + password → JWT)

```javascript
// POST https://api.heyslab.ru/auth/curator
fetch('https://api.heyslab.ru/auth/curator', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'curator@example.com', password: '...' }),
});
// Returns: { token: 'JWT...', curator_id, name }

// Дальнейшие API запросы: Authorization: Bearer <JWT>
```

> **ПРАВИЛО:** Никогда не передавай `client_id` напрямую в RPC. Всегда используй
> `*_by_session` pattern с `session_token`.

## 📊 Core APIs

### 1. YandexAPI — Главный API адаптер

Всё взаимодействие с сервером идёт через `HEYS.YandexAPI`:

```javascript
// RPC (вызов PostgreSQL функций)
await HEYS.YandexAPI.rpc('function_name', { param: 'value' });

// REST (GET запросы к таблицам)
await HEYS.YandexAPI.rest('table_name', {
  method: 'GET',
  params: { limit: 100, order: 'created_at.desc' },
});
```

### 2. Client Management

```javascript
// Список клиентов куратора
await HEYS.YandexAPI.rpc('get_curator_clients_by_session', {
  p_session_token: token,
});

// Добавить клиента
await HEYS.YandexAPI.rpc('add_client_by_session', {
  p_session_token: token,
  p_name: 'Иван Иванов',
  p_phone: '+7XXXXXXXXXX',
  p_pin: '1234',
});

// Переименовать клиента
await HEYS.YandexAPI.rpc('rename_client_by_session', {
  p_session_token: token,
  p_client_id: clientId,
  p_name: 'Новое Имя',
});

// Удалить клиента
await HEYS.YandexAPI.rpc('delete_client_by_session', {
  p_session_token: token,
  p_client_id: clientId,
});
```

### 3. Data Synchronization (Key-Value Storage)

```javascript
// Bootstrap Sync (загрузить все данные клиента)
await HEYS.cloud.syncClient(clientId); // автовыбор стратегии (curator / PIN)

// KV операции (глобальные ключи)
await HEYS.YandexAPI.rpc('kv_set', {
  p_key: 'settings',
  p_value: JSON.stringify(data),
});
await HEYS.YandexAPI.rpc('kv_get', { p_key: 'settings' });
await HEYS.YandexAPI.rpc('kv_delete', { p_key: 'settings' });

// KV операции (ключи клиента)
await HEYS.YandexAPI.rpc('client_kv_set_by_session', {
  p_session_token: token,
  p_client_id: clientId,
  p_key: 'heys_products',
  p_value: JSON.stringify(products),
});
await HEYS.YandexAPI.rpc('client_kv_get_by_session', {
  p_session_token: token,
  p_client_id: clientId,
  p_key: 'heys_products',
});
```

---

### 🛡️ Store API Best Practices (v4.8.8)

**CRITICAL RULE:** ВСЕГДА используй Store API для доступа к данным в React.
НИКОГДА не обращайся напрямую к localStorage через `utils.lsGet/lsSet`.

**Проблема namespacing conflict (решена в v4.8.8):**

```javascript
// ❌ НЕПРАВИЛЬНО — bypasses scoping, reads unscoped key
const products = window.HEYS.utils.lsGet('heys_products', []);

// ✅ ПРАВИЛЬНО v4.8.8 — Store API handles scoping internally
const products = window.HEYS?.products?.getAll?.() || [];
```

**Почему это критично?**

- Store API автоматически добавляет `clientId` в ключи:
  `heys_{clientId}_products`
- Прямой доступ к localStorage ищет unscoped ключ `heys_products` → empty array
- React видит пустой массив → откатывается к stale state → 42 продукта вместо
  290
- Паттерны `micronutrient_radar` и др. не активируются → healthScore падает

**Store API Methods:**

```javascript
// Products
HEYS.products.getAll(); // Read all products (scoped)
HEYS.products.setAll(array); // Write products (scoped)
HEYS.products.update(id, changes); // Update single product

// Generic Store Access (для других данных)
HEYS.store.get('heys_profile'); // Read with scoping
HEYS.store.set('heys_profile', data); // Write with scoping
```

**Data Quality Checks** (защита от stale saves):

```javascript
// PRIMARY Quality Check (v4.8.6) — в heys_storage_supabase_v1.js
const savingWithIron = value.filter((p) => p && p.iron && +p.iron > 0).length;
if (savingWithIron < 50) {
  logCritical(`🚨 [SAVE BLOCKED] Only ${savingWithIron} products with iron`);
  return; // Блокирует сохранение немедленно
}
// Эта проверка блокирует 100% stale saves (проверено в production)
```

**React Integration Pattern:**

```javascript
// В useEffect или event handlers
useEffect(
  () => {
    // 1. Check if sync in progress
    if (waitingForSync.current === true) {
      return; // Don't load stale data before sync completes
    }

    // 2. Load from Store API (not utils.lsGet!)
    const loadedProducts = window.HEYS?.products?.getAll?.() || [];

    // 3. Verify quality (iron count, not just length)
    const loadedIron = loadedProducts.filter(
      (p) => p?.iron && +p.iron > 0,
    ).length;

    // 4. Update React state with quality check
    setProducts((prev) => {
      const prevIron = Array.isArray(prev)
        ? prev.filter((p) => p?.iron && +p.iron > 0).length
        : 0;

      // Only update if quality changed (not same stale data)
      if (prevIron === loadedIron && prev.length === loadedProducts.length) {
        return prev; // Skip re-render, same data
      }

      return loadedProducts; // Quality improved or data changed
    });
  },
  [
    /* deps */
  ],
);
```

**Expected Values** (production):

- `products.filter(x => x.iron > 0).length` → **290** (не 0, не 42)
- `micronutrient_radar` pattern → **100** (не 0)
- `healthScore` → **71+** (не 66-)

**Files to Study:**

- `apps/web/heys_app_sync_effects_v1.js` — React integration (v4.8.8)
- `apps/web/heys_storage_supabase_v1.js` — Quality checks (v4.8.6)
- `apps/web/heys_core_v12.js` — Store API implementation
- `apps/web/heys_storage_layer_v1.js` — Scoping logic

---

### 4. Trial Machine & Subscription Management

> **Version:** v3.0 (February 2026)  
> **Flow:** Curator-controlled trial start date + leads management

#### Trial Lifecycle Functions

```javascript
// Get leads from landing page
await HEYS.YandexAPI.rpc('admin_get_leads', {
  p_status: 'new', // 'new' | 'converted' | 'all'
});
// Returns: [{ id: UUID, name, phone, messenger, utm_source, status, created_at, updated_at }]

// Convert lead to client
await HEYS.YandexAPI.rpc('admin_convert_lead', {
  p_lead_id: 'b5a0f0ae-f92e-46ab-a805-fc3f9044af8e', // UUID
  p_pin: '1234', // 4-digit PIN
  p_curator_id: curatorId, // UUID, optional (auto-assign if null)
});
// Returns: { success: true, client_id, client_name, already_existed }

// Activate trial with custom start date
await HEYS.YandexAPI.rpc('admin_activate_trial', {
  p_client_id: clientId, // UUID
  p_start_date: '2026-02-15', // DATE, default = CURRENT_DATE
  p_trial_days: 7, // INT, default = 7
  p_curator_session_token: token, // TEXT, optional
});
// Returns: {
//   success: true,
//   client_id,
//   status: 'trial' | 'trial_pending',
//   trial_started_at: timestamp,
//   trial_ends_at: timestamp,
//   is_future: boolean
// }
```

#### Subscription Status Logic

```javascript
// Get effective subscription status (internal function, called by other RPC)
get_effective_subscription_status(client_id);
// Returns: 'none' | 'trial_pending' | 'trial' | 'active' | 'read_only'

// Status Rules (v3.0):
// 'active' → active_until > NOW()
// 'trial' → trial_started_at ≤ NOW() AND trial_ends_at > NOW()
// 'trial_pending' → trial_started_at > NOW() (curator set future date)
// 'read_only' → trial/subscription expired
// 'none' → no subscription
```

#### Trial Machine Flow (v3.0)

1. **Landing** → `leads` table (via `heys-api-leads` cloud function)
2. **Admin UI** → curator sees leads via `admin_get_leads()`
3. **Conversion** → curator creates client via `admin_convert_lead()` → client
   added to `trial_queue` with `status='queued'`
4. **Activation** → curator picks start date via `admin_activate_trial()`:
   - If `start_date = today` → `status='trial'` immediately (7 days from NOW())
   - If `start_date > today` → `status='trial_pending'` until date arrives
5. **Date arrives** → status automatically becomes `'trial'` (via
   `get_effective_subscription_status`)
6. **Trial expires** → `status='read_only'` → paywall

#### Data Types & Constraints

- `leads.id` → UUID (not INT)
- `clients` → no `created_at` column (only `updated_at`)
- `trial_queue.status` → CHECK:
  `('queued','offer','assigned','canceled','canceled_by_purchase','expired')`
- `trial_queue_events.event_type` → CHECK:
  `('queued','offer_sent','claimed','offer_expired','canceled','canceled_by_purchase','purchased')`

### 5. Nutrition & Day Tracking

Данные дня хранятся в KV storage под ключом `heys_dayv2_{date}`:

```javascript
// Получить данные дня
const dayData = await HEYS.YandexAPI.rpc('client_kv_get_by_session', {
  p_session_token: token,
  p_client_id: clientId,
  p_key: 'heys_dayv2_2026-02-19',
});

// Сохранить данные дня
await HEYS.YandexAPI.rpc('batch_upsert_client_kv_by_session', {
  p_session_token: token,
  p_client_id: clientId,
  p_keys: ['heys_dayv2_2026-02-19'],
  p_values: [JSON.stringify(dayData)],
});

// Получить продукты клиента
const productsRaw = await HEYS.YandexAPI.rpc('client_kv_get_by_session', {
  p_session_token: token,
  p_client_id: clientId,
  p_key: 'heys_products',
});
// Или через Store API (рекомендуется из React):
const products = HEYS.products.getAll();

// Данные дня (поля: dayTot.prot НЕ dayTot.protein!)
// dayTot: { kcal, prot, fat, carb, ... }
// Protein = 3 kcal/g (TEF-adjusted)
```

### 6. Shared Products

```javascript
// Получить базу продуктов (публично)
await HEYS.YandexAPI.rpc('get_shared_products', {});

// Создать pending product (клиент)
await HEYS.YandexAPI.rpc('create_pending_product_by_session', {
  p_session_token: token,
  p_name: 'Продукт',
  p_kcal: 200,
  p_prot: 15,
  p_fat: 8,
  p_carb: 20,
});

// Опубликовать продукт (куратор)
await HEYS.YandexAPI.rpc('publish_shared_product_by_session', {
  p_session_token: token,
  p_product_id: productId,
});
```

### 7. Insights API

Insights работают на локальных данных (localStorage), без API-вызовов:

```javascript
// Адаптивные пороги (pi_thresholds.js)
const thresholds = await HEYS.thresholds.getAdaptiveThresholds(
  30,
  profile,
  pIndex,
);
// Returns: { calories: { min, max, confidence }, protein: {...}, ... }

// Early Warning System (pi_early_warning.js v4.2)
const ews = HEYS.insights.getEarlyWarnings(historyData);
// Returns: { warnings: [{ type, severity, message }], globalScore, phenotype }

// Статистика (pi_stats.js v3.5.0, 27 функций)
const corr = HEYS.stats.bayesianCorrelation(x, y);
const ci = HEYS.stats.confidenceIntervalForCorrelation(r, n);
```

## 🔌 External Integrations

### SMS (SMSC.ru) — через `heys-api-sms`

```javascript
await HEYS.YandexAPI.rpc('send_verification_sms', {
  p_phone: '+7XXXXXXXXXX',
  p_code: '1234',
});
```

### Leads (с лендинга) — через `heys-api-leads`

```javascript
// POST https://api.heyslab.ru/leads
// Body: { name, phone, messenger, utm_source }
// Автоматически сохраняется в таблицу leads
```

### Payments (ЮKassa) — через `heys-api-payments`

```javascript
await HEYS.YandexAPI.rpc('create_payment_order', {
  p_session_token: token,
  p_amount: 2990,
  p_description: 'Подписка HEYS на 30 дней',
});
// Returns: { payment_url, order_id }
```

## 🛡️ Security & Validation

### Request Validation

```javascript
// Secure API Handler
SecureHeysCore.handleApiRequest(request);
// Validates and sanitizes all API requests

// Input Validation
SecurityValidator.validateInput(data, schema);
SecurityValidator.sanitizeInput(data);
```

### Security Headers

- **XSS Protection** - Automatic content sanitization
- **CSRF Protection** - Token-based validation
- **Input Validation** - Schema-based validation
- **Rate Limiting** - Automatic throttling

## 📱 Platform APIs

### PWA (`app.heyslab.ru`)

- **Service Worker** - Offline functionality (`apps/web/public/sw.js`)
- **LocalStorage** - Client-side caching (namespaced via `U.lsSet/lsGet`)
- **Progressive Web App** - Install capabilities

### Telegram Mini App

- `apps/tg-mini/` — отдельный Vite app
- Использует тот же API backend (`api.heyslab.ru`)

## 🔍 Search & Discovery

### Smart Search Engine

```javascript
// Advanced Search with Typo Correction
HEYS.Search.smartSearch(query, options);
// Returns: SearchResults

// Auto-complete
HEYS.Search.suggest(partialQuery, context);
// Returns: Suggestion[]

// Search Analytics
HEYS.Search.getSearchMetrics();
// Returns: SearchMetrics
```

## 📈 Monitoring & Diagnostics

### Health Checks

```javascript
// System Health
HEYS.Diagnostics.getSystemHealth();
// Returns: HealthStatus

// Performance Metrics
HEYS.Performance.getMetrics();
// Returns: PerformanceData

// Error Tracking
HEYS.ErrorLogger.getRecentErrors();
// Returns: ErrorLog[]
```

## 🚀 Usage Examples

### Complete User Flow Example

```javascript
// 1. Авторизация клиента через PIN
const authResult = await HEYS.YandexAPI.rpc('client_pin_auth', {
  p_phone: '+79001234567',
  p_pin: '1234',
});
const { session_token, client_id } = authResult;

// 2. Bootstrap sync (загрузка данных клиента)
await HEYS.cloud.syncClient(client_id);

// 3. Добавить продукт в дневник
const meal = HEYS.day.addMeal({
  date: '2026-02-19',
  mealType: 'breakfast',
  productId: 'product_123',
  weight: 150,
});

// 4. Сохранить день в облако
await HEYS.YandexAPI.rpc('client_kv_set_by_session', {
  p_session_token: session_token,
  p_client_id: client_id,
  p_key: 'heys_dayv2_2026-02-19',
  p_value: JSON.stringify(dayData),
});

// 5. Получить аналитику
const thresholds = await HEYS.thresholds.getAdaptiveThresholds(
  30,
  profile,
  pIndex,
);
const warnings = HEYS.insights.getEarlyWarnings(historyData);
```

## 🔧 Error Handling

### Standard Error Format

```javascript
{
  error: true,
  code: 'VALIDATION_ERROR',
  message: 'Invalid input data',
  details: ['Field "email" is required'],
  timestamp: '2025-09-01T12:00:00Z'
}
```

### Common Error Codes

- `AUTH_REQUIRED` - Authentication needed
- `VALIDATION_ERROR` - Invalid input data
- `NOT_FOUND` - Resource not found
- `RATE_LIMIT` - Too many requests
- `SERVER_ERROR` - Internal server error
- `SYNC_CONFLICT` - Data synchronization conflict

## 📚 Additional Resources

- [**Architecture Guide**](./guides/ARCHITECTURE.md) - System architecture
  overview
- [**Security Guide**](./guides/SECURITY.md) - Security implementation details
- [**Integration Guide**](./guides/INTEGRATION.md) - External service
  integration
- [**Testing Guide**](./guides/TESTING.md) - API testing strategies

## 🔄 Versioning

API follows semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR** - Breaking changes
- **MINOR** - New features (backward compatible)
- **PATCH** - Bug fixes (backward compatible)

Current version: **14.0.0**

## 📞 Support

For API support and questions:

- **Documentation**: [HEYS Docs](./README.md)
- **Issues**: [GitHub Issues](https://github.com/kinderlystv-png/HEYS-v2/issues)
- **Contributing**: [Contributing Guide](../CONTRIBUTING.md)

---

**© 2026 HEYS Development Team** | Licensed under [MIT License](../LICENSE)
