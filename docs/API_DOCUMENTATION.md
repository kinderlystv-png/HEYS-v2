# � HEYS API Documentation

> **Version:** 15.1.0  
> **Last Updated:** February 12, 2026  
> **Status:** Production Ready (v4.8.8 — React State Sync Fix)  
> **Maintainer:** @development-team

## 📋 Overview

HEYS Platform provides a comprehensive RESTful API for diary tracking, nutrition
management, training sessions, and analytics. The API is built on modern
TypeScript/Node.js stack with Supabase backend integration.

**Base URL:** `https://api.heys.app/v1`  
**Authentication:** Bearer JWT tokens via Supabase Auth  
**Content-Type:** `application/json`

## 🏗️ Architecture

### Core Components

- **Legacy Core** - LocalStorage-based data management
- **Modern Layer** - TypeScript/React with Supabase integration
- **Security Layer** - Input validation and XSS protection
- **Integration Layer** - Multi-service connectors

## 🔐 Authentication

### Supabase Authentication

All authenticated endpoints require a valid Supabase session.

```javascript
// Sign in
const { user, error } = await cloud.signIn(email, password);

// Get current user
const user = cloud.getUser();

// Sign out
cloud.signOut();
```

## 📊 Core APIs

### 1. User Management

#### Authentication

```javascript
// POST /auth/signin
cloud.signIn(email, password);
// Returns: { user?, error? }

// POST /auth/signout
cloud.signOut();
// Returns: void

// GET /auth/user
cloud.getUser();
// Returns: SupabaseUser | null
```

#### User Data

```javascript
// GET /users/profile
HEYS.User.getProfile();
// Returns: UserProfile

// PUT /users/profile
HEYS.User.updateProfile(data);
// Returns: boolean
```

### 2. Client Management

#### Client CRUD Operations

```javascript
// GET /clients
fetchClientsFromCloud(curatorId);
// Returns: Client[]

// POST /clients
addClientToCloud(name);
// Returns: Client

// PUT /clients/:id
renameClient(id, name);
// Returns: boolean

// DELETE /clients/:id
removeClient(id);
// Returns: boolean
```

### 3. Data Synchronization

#### Key-Value Storage

```javascript
// Global Storage
cloud.saveKey(key, value); // POST /kv/global
cloud.getKey(key); // GET /kv/global/:key
cloud.deleteKey(key); // DELETE /kv/global/:key

// Client-specific Storage
cloud.saveClientKey(clientId, key, value); // POST /kv/client
cloud.getClientKey(clientId, key); // GET /kv/client/:clientId/:key
cloud.deleteClientKey(clientId, key); // DELETE /kv/client/:clientId/:key
```

#### Sync Operations

```javascript
// Full Bootstrap Sync
cloud.bootstrapSync(); // GET /sync/bootstrap
cloud.bootstrapClientSync(clientId); // GET /sync/client/:clientId

// Incremental Sync
cloud.syncToCloud(); // POST /sync/push
cloud.syncFromCloud(); // POST /sync/pull
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
- `apps/web/public/heys_storage_supabase_v1.js` — Quality checks (v4.8.6)
- `apps/web/public/heys_core_v12.js` — Store API implementation
- `apps/web/public/heys_storage_layer_v1.js` — Scoping logic

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

### 5. Nutrition Management

#### Food Database

```javascript
// GET /nutrition/foods
HEYS.Food.search(query, options);
// Returns: Food[]

// GET /nutrition/foods/:id
HEYS.Food.getById(id);
// Returns: Food

// POST /nutrition/foods
HEYS.Food.create(foodData);
// Returns: Food
```

#### Meal Tracking

```javascript
// POST /nutrition/meals
HEYS.Nutrition.addMeal(mealData)
// Returns: Meal

// GET /nutrition/meals
HEYS.Nutrition.getMeals(date?, clientId?)
// Returns: Meal[]

// GET /nutrition/summary
HEYS.Nutrition.getDailySummary(date, clientId?)
// Returns: NutritionSummary
```

### 5. Training Management

#### Training Plans

```javascript
// GET /training/plans
HEYS.Training.getPlans(clientId?)
// Returns: TrainingPlan[]

// POST /training/plans
HEYS.Training.createPlan(planData)
// Returns: TrainingPlan

// PUT /training/plans/:id
HEYS.Training.updatePlan(id, planData)
// Returns: TrainingPlan
```

#### Workout Sessions

```javascript
// POST /training/sessions
HEYS.Training.startSession(planId)
// Returns: WorkoutSession

// PUT /training/sessions/:id
HEYS.Training.updateSession(id, sessionData)
// Returns: WorkoutSession

// GET /training/sessions
HEYS.Training.getSessions(clientId?, date?)
// Returns: WorkoutSession[]
```

### 6. Analytics & Reporting

#### Progress Tracking

```javascript
// GET /analytics/progress
HEYS.Analytics.getProgress(clientId, period);
// Returns: ProgressData

// GET /analytics/reports
HEYS.Analytics.generateReport(type, filters);
// Returns: Report

// GET /analytics/metrics
HEYS.Analytics.getMetrics(clientId);
// Returns: MetricsData
```

## 🔌 Integration Layer

### External Service Connectors

#### Supabase Integration

```javascript
// Connection Management
IntegrationLayer.connectSupabase(credentials);
IntegrationLayer.testSupabaseConnection(connection);
IntegrationLayer.syncSupabase(connection, direction, filters);
```

#### REST API Integration

```javascript
// Generic REST API
IntegrationLayer.connectRestAPI(credentials);
IntegrationLayer.syncRestAPI(connection, direction, filters);
IntegrationLayer.testRestAPIConnection(connection);
```

#### WebSocket Integration

```javascript
// Real-time Connections
IntegrationLayer.connectWebSocket(credentials);
IntegrationLayer.handleWebSocketMessage(connection, message);
```

#### File System Integration

```javascript
// Local File Operations
IntegrationLayer.connectFileSystem(credentials);
IntegrationLayer.syncFileSystem(connection, direction, filters);
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

## 📱 Platform-Specific APIs

### Web Application

- **Service Worker** - Offline functionality
- **LocalStorage** - Client-side caching
- **Progressive Web App** - Install capabilities

### Mobile Application

- **Native Bridge** - Platform integration
- **Push Notifications** - Real-time updates
- **Offline Sync** - Background synchronization

### Desktop Application

- **System Integration** - File system access
- **Background Services** - System tray functionality
- **Auto-updater** - Seamless updates

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
// 1. Authentication
const { user } = await cloud.signIn('user@example.com', 'password');

// 2. Load client data
const clients = await fetchClientsFromCloud(user.id);
const clientId = clients[0].id;

// 3. Add nutrition data
const meal = await HEYS.Nutrition.addMeal({
  clientId,
  foodId: 'food_123',
  quantity: 150,
  mealType: 'breakfast',
});

// 4. Track training
const session = await HEYS.Training.startSession('plan_456');
await HEYS.Training.updateSession(session.id, {
  exercises: [{ name: 'Push-ups', sets: 3, reps: 15 }],
});

// 5. Generate report
const report = await HEYS.Analytics.generateReport('weekly', {
  clientId,
  startDate: '2025-08-25',
  endDate: '2025-09-01',
});
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

**© 2025 HEYS Development Team** | Licensed under [MIT License](../LICENSE)
