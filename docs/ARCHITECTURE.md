# 🏗️ HEYS Platform Architecture

> **System Architecture Overview** **Version:** 15.1.0 (Supabase → Yandex Cloud
> migration documented) **Last Updated:** February 19, 2026

## 📊 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      🌐 CLIENT LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│  📱 PWA (app.heyslab.ru)     💬 Telegram Mini App              │
│  (React 18 + Vite)        (apps/tg-mini)                   │
│  ├─ Service Worker           ├─ Vite app                       │
│  ├─ Offline First            ├─ Telegram API               │
│  └─ LocalStorage cache        └─ Same API backend            │
└─────────────────────────────────────────────────────────────────┘
                                │
                        🔄 HTTPS/WSS
                                │
┌─────────────────────────────────────────────────────────────────┐
│                     🚀 APPLICATION LAYER                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│  │ 🧠 Core Logic │  │ 🔐 Security   │  │ 🔌 Integration│      │
│  │               │  │               │  │               │      │
│  │ • User Mgmt   │  │ • Auth Layer  │  │ • Yandex Cloud│      │
│  │ • Nutrition   │  │ • Validation  │  │ • REST APIs   │      │
│  │ • Training    │  │ • XSS Guard   │  │ • WebSockets  │      │
│  │ • Analytics   │  │ • Input San.  │  │ • File System │      │
│  │ • Reports     │  │ • Rate Limit  │  │ • External    │      │
│  └───────────────┘  └───────────────┘  └───────────────┘      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 🎯 SMART FEATURES ENGINE                                 │ │
│  │                                                           │ │
│  │ • 🔍 Smart Search (typo correction, fuzzy matching)     │ │
│  │ • 🎮 Gamification (achievements, progress tracking)     │ │
│  │ • 🚀 Universal Anchors (auto-navigation system)        │ │
│  │ • 📊 Enhanced Analytics (real-time insights)           │ │
│  │ • 🤖 AI-powered Recommendations                         │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                        🔄 API Calls
                                │
┌─────────────────────────────────────────────────────────────────┐
│                      💾 DATA LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐           ┌─────────────────┐              │
│  │ 🏛️ Legacy Core   │◄─────────►│ ☁️ Modern Cloud │              │
│  │ (localStorage)  │  Sync     │ (Yandex Cloud)  │              │
│  │                 │           │                 │              │
│  │ • Fast Access   │           │ • PostgreSQL    │              │
│  │ • Offline Mode  │           │ • Real-time     │              │
│  │ • Client Cache  │           │ • Auth System   │              │
│  │ • Day Records   │           │ • Row Security  │              │
│  │ • Settings      │           │ • Backups       │              │
│  └─────────────────┘           └─────────────────┘              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 📋 DATABASE SCHEMA                                          │ │
│  │                                                             │ │
│  │ Tables:                                                     │ │
│  │ • clients (id, name, phone_normalized, pin_hash, curator_id)│ │
│  │ • kv_store (id, user_id, k, v, timestamps)                 │ │
│  │ • client_kv_store (client_id, k, v, v_encrypted, ...)      │ │
│  │   ⤵ PRIMARY KEY (client_id, k)                             │ │
│  │ • client_sessions (id, client_id, token_hash BYTEA)        │ │
│  │ • shared_products (id, name, nutrients, harm, ...)         │ │
│  │ • consents (client_id, type, accepted_at)                  │ │
│  │ • pin_login_attempts (phone, ip INET, locked_until)        │ │
│  │ • leads (id UUID, name, phone, utm_source, status)         │ │
│  │ • trial_queue + payment_orders + subscriptions             │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    USER     │───►│   CLIENT    │───►│ APPLICATION │───►│   DATABASE  │
│ Interaction │    │    LAYER    │    │    LAYER    │    │    LAYER    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                           │                   │                   │
                           ▼                   ▼                   ▼
                   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                   │ UI Component│    │ Core Logic  │    │ Data Store  │
                   │ State Mgmt  │    │ Validation  │    │ Sync Layer  │
                   │ User Events │    │ Business    │    │ Persistence │
                   └─────────────┘    └─────────────┘    └─────────────┘
                           │                   │                   │
                           ▼                   ▼                   ▼
                   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                   │ Service     │    │ Integration │    │ External    │
                   │ Worker      │    │ Layer       │    │ Services    │
                   │ Cache       │    │ API Calls   │    │ Third-party │
                   └─────────────┘    └─────────────┘    └─────────────┘
```

## 🎯 Module Architecture

### 1. Core Modules

```
packages/core/
├── src/
│   ├── models/          # Data models (User, Food, Training)
│   ├── services/        # Business logic services
│   ├── security/        # Security & validation
│   └── integration/     # External service connectors
```

### 2. Application Modules

```
apps/
├── web/                 # React web application (PWA, port 3001)
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Application pages
│   │   ├── hooks/       # Custom React hooks
│   │   └── utils/       # Utility functions
│   └── public/          # Static assets
├── mobile/              # React Native mobile app (❌ DISABLED)
└── tg-mini/             # Telegram Mini App (port 3002)
```

### 3. Shared Packages

```
packages/
├── shared/              # Shared utilities and types
├── ui/                  # Reusable UI components
├── storage/             # Data persistence layer
├── analytics/           # Analytics and tracking
├── search/              # Smart search engine
└── gaming/              # Gamification features
```

## 🔐 Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    🛡️ SECURITY LAYERS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🌐 Network Layer                                               │
│  ├── HTTPS/TLS Encryption                                      │
│  ├── CORS Policy                                               │
│  ├── Rate Limiting                                             │
│  └── DDoS Protection                                           │
│                                                                 │
│  🔐 Authentication Layer                                        │
│  ├── Session-based Auth (PIN + Yandex Cloud Functions)        │
│  ├── Session Management                                        │
│  ├── Multi-factor Authentication                               │
│  └── OAuth Integration                                         │
│                                                                 │
│  ✅ Validation Layer                                           │
│  ├── Input Sanitization                                        │
│  ├── Schema Validation                                         │
│  ├── XSS Prevention                                            │
│  └── SQL Injection Protection                                  │
│                                                                 │
│  🗃️ Data Protection Layer                                      │
│  ├── Row Level Security (RLS)                                  │
│  ├── Encrypted Storage                                         │
│  ├── Data Anonymization                                        │
│  └── GDPR Compliance                                           │
└─────────────────────────────────────────────────────────────────┘
```

## ⚡ Performance Architecture

### Caching Strategy

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Browser     │    │ Service     │    │ Application │    │ Database    │
│ Cache       │    │ Worker      │    │ Cache       │    │ Cache       │
├─────────────┤    ├─────────────┤    ├─────────────┤    ├─────────────┤
│ • Static    │    │ • API Resp. │    │ • Memory    │    │ • Query     │
│ • Assets    │    │ • Offline   │    │ • Redis     │    │ • Indexes   │
│ • Images    │    │ • Background│    │ • Sessions  │    │ • Views     │
│ • Scripts   │    │ • Sync      │    │ • Objects   │    │ • Triggers  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                    │                    │                    │
      └────────────────────┼────────────────────┼────────────────────┘
                           │                    │
                    ⚡ Fast Access        💾 Persistent Storage
```

### Load Balancing

```
        ┌─────────────┐
        │ Load        │
        │ Balancer    │
        └─────────────┘
               │
        ┌──────┴──────┐
        │             │
  ┌─────────┐   ┌─────────┐
  │ Server  │   │ Server  │
  │ Node 1  │   │ Node 2  │
  └─────────┘   └─────────┘
        │             │
        └──────┬──────┘
               │
    ┌─────────────────┐
    │   Database      │
    │   Cluster       │
    └─────────────────┘
```

## 🔄 Synchronization Architecture

### Dual-Layer Sync

```
┌─────────────────────────────────────────────────────────────────┐
│                 💾 LOCAL STORAGE (Legacy Core)                 │
├─────────────────────────────────────────────────────────────────┤
│ • Instant Access          • Offline Capability                 │
│ • Client Caching          • Fast Read/Write                    │
│ • Day Records             • Settings Storage                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                        🔄 Bidirectional Sync
                                │
┌─────────────────────────────────────────────────────────────────┐
│                  ☁️ CLOUD STORAGE (Yandex Cloud)              │
├─────────────────────────────────────────────────────────────────┤
│ • Multi-device Access     • Real-time Updates                  │
│ • Backup & Recovery        • Collaborative Features            │
│ • Analytics & Reporting    • Admin Dashboard                   │
└─────────────────────────────────────────────────────────────────┘
```

### Conflict Resolution

```
Local Change    Cloud Change    Resolution Strategy
─────────────   ─────────────   ──────────────────
Timestamp A  ┌─ Timestamp B  ─► Last Writer Wins
Value X      │  Value Y
             │
User Action  └─ Server Action ─► User Priority

Offline Mode ┌─ Online Sync  ─► Merge Strategy
Queue        │  Real-time
```

## 🚀 Deployment Architecture

### Development Environment

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Development │    │ Staging     │    │ Production  │
│ Environment │    │ Environment │    │ Environment │
├─────────────┤    ├─────────────┤    ├─────────────┤
│ • Hot Reload│    │ • Testing   │    │ • Optimized │
│ • Debug     │    │ • QA        │    │ • Monitoring│
│ • Local DB  │    │ • Review    │    │ • Scaling   │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                   ┌─────────────┐
                   │   CI/CD     │
                   │  Pipeline   │
                   │             │
                   │ • Tests     │
                   │ • Build     │
                   │ • Deploy    │
                   └─────────────┘
```

### Container Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      🐳 DOCKER CONTAINERS                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │    Web      │  │   Mobile    │  │  Desktop    │             │
│  │    App      │  │    App      │  │    App      │             │
│  │  (React)    │  │ (RN Bundle) │  │ (Electron)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   API       │  │   Worker    │  │   Monitor   │             │
│  │  Server     │  │  Services   │  │  Services   │             │
│  │  (Node.js)  │  │ (Background)│  │ (Analytics) │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 🗄️ Shared Volumes (Config, Logs, Cache)                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 📊 Monitoring & Observability

### System Health Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│                    📈 SYSTEM METRICS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Performance Metrics   │  Error Tracking      │  User Analytics │
│ ├── Response Time     │  ├── Error Rate      │  ├── DAU/MAU    │
│ ├── Throughput        │  ├── Error Types     │  ├── Retention  │
│ ├── CPU Usage         │  ├── Stack Traces    │  ├── Features   │
│ └── Memory Usage      │  └── Resolution      │  └── Conversion │
│                       │                      │                 │
│ Database Metrics      │  Security Metrics    │  Business KPIs  │
│ ├── Query Time        │  ├── Failed Logins   │  ├── Revenue    │
│ ├── Connection Pool   │  ├── Blocked IPs     │  ├── Growth     │
│ ├── Storage Usage     │  ├── Vulnerability   │  ├── Engagement │
│ └── Backup Status     │  └── Compliance      │  └── Support    │
└─────────────────────────────────────────────────────────────────┘
```

## 🔧 Development Tools & Workflows

### Build Pipeline

```
📝 Code → 🔍 Lint → 🧪 Test → 📦 Build → 🚀 Deploy
   │         │         │         │         │
   │         │         │         │         └── Production
   │         │         │         └── Bundle Optimization
   │         │         └── Unit/Integration Tests
   │         └── ESLint + Prettier
   └── TypeScript + React
```

### Quality Gates

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Code Review │    │   Testing   │    │ Performance │
├─────────────┤    ├─────────────┤    ├─────────────┤
│ • PR Review │    │ • Unit      │    │ • Lighthouse│
│ • Standards │    │ • E2E       │    │ • Bundle    │
│ • Security  │    │ • Visual    │    │ • Memory    │
└─────────────┘    └─────────────┘    └─────────────┘
```

---

## 🛡️ Critical Architecture Evolution

### **v4.8.8: React State Synchronization Fix** (February 2026)

**Problem Identified:**

React components displayed **42 products** with micronutrients instead of
**290** despite:

- ✅ Database: 292 products with Fe/VitC/Ca
- ✅ Yandex Cloud KV: 290 products with micronutrients + timestamps
- ✅ localStorage scoped key `heys_{clientId}_products`: 290 products
- ❌ React state via `products.getAll()`: **42 products**

**Root Cause:**

**Namespacing conflict** between:

1. **Storage Layer** (`heys_storage_layer_v1.js`): Writes to **scoped keys**
   `heys_{clientId}_products`
2. **React Components** (`heys_app_sync_effects_v1.js`): Read from **unscoped
   keys** via `utils.lsGet('heys_products')`

```javascript
// ❌ PROBLEM (v4.8.7 and earlier)
// React: reads unscoped key → empty array → fallback to stale state
const products = window.HEYS.utils.lsGet('heys_products', []);

// Storage Layer: writes scoped key → data never seen by React
Store.set('heys_products', data); // → heys_{clientId}_products
```

**Impact:**

- `micronutrient_radar` pattern stuck at **0** (expected **100**)
- `antioxidant_defense` at **21** (expected **79**)
- `heart_health` at **55** (expected **70**)
- Health Score: **66** (expected **71+**)
- **Critical patterns inactive** due to missing micronutrient data

**Solution Architecture v4.8.8:**

**Store API as Single Source of Truth** — React NEVER accesses localStorage
directly:

```javascript
// ✅ SOLUTION v4.8.8
// React: ALWAYS reads via Store API (handles scoping internally)
const products = window.HEYS?.products?.getAll?.() || [];

// Store API: automatically resolves scoped keys
HEYS.products.getAll() → Store.get('heys_products') → heys_{clientId}_products
```

**3 Critical Changes** (all in `heys_app_sync_effects_v1.js`):

1. **Post-sync load** (Line 46-48):

   ```javascript
   // OLD: const loadedProducts = window.HEYS.utils.lsGet('heys_products', []);
   const loadedProducts = window.HEYS?.products?.getAll?.() || [];
   ```

2. **Initial mount hydration** (Line 18-20):

   ```javascript
   // OLD: const stored = window.HEYS.utils.lsGet('heys_products', []);
   const stored = window.HEYS?.products?.getAll?.() || [];
   ```

3. **Event listener fallback** (Line 147-149):
   ```javascript
   // OLD: fallback = utils.lsGet('heys_products', [])
   const latest = window.HEYS?.products?.getAll?.() || [];
   ```

**Quality Protection System** (4 layers):

```javascript
// Layer 1: PRIMARY Quality Check (v4.8.6) — heys_storage_supabase_v1.js:5625
const savingWithIron = value.filter((p) => p && p.iron && +p.iron > 0).length;
if (savingWithIron < 50) {
  logCritical(`🚨 SAVE BLOCKED: ${savingWithIron} products (expected 250+)`);
  return; // Prevents stale saves immediately
}
// Result: 100% effectiveness, 0 stale saves post-v4.8.8

// Layer 2: Pre-sync Block
if (waitingForSync.current === true) return; // Race condition guard

// Layer 3: Quality-based React Update (v4.8.7)
const prevIron = prev.filter((p) => p.iron > 0).length;
const loadedIron = loaded.filter((p) => p.iron > 0).length;
if (prevIron === loadedIron && prev.length === loaded.length) {
  return prev; // Skip update, same quality
}

// Layer 4: Architectural — Store API prevents namespacing conflicts (v4.8.8)
```

**Verification Results:**

```javascript
// User console command:
HEYS.products.getAll().filter(x => x.iron > 0).length
// Result: 290 ✅ (was 42 ❌)

// Console output after sync:
[HEYS.sync] 🔍 After sync: loadedProducts.length=293, withIron=290
// Patterns activated:
micronutrient_radar: 0 → 100 ✅
antioxidant_defense: 21 → 79 ✅
heart_health: 55 → 70 ✅
electrolyte_homeostasis: 11 → 89 ✅
nutrient_density: 30 → 73 ✅
healthScore: 66 → 71 ✅
```

**DEBUG Monitoring** (active during testing phase):

```javascript
// Post-sync verification (Line 52)
console.info(
  `[HEYS.sync] 🔍 After sync: loadedProducts.length=${x}, withIron=${y}`,
);
// Expected: withIron=290 (not 0 or 42)

// React state update tracking (Lines 89-100)
console.info(`[HEYS.sync] 🔄 React state updated: ${prev}→${next} products`);
```

**Architectural Lesson:**

> ⚠️ **NEVER bypass abstractions.** Direct localStorage access breaks scoping.
> ✅ **ALWAYS use Store API** as the single source of truth for data access. 🛡️
> **Quality checks work** when architectural patterns are followed.

**Modified Files:**

- `apps/web/heys_app_sync_effects_v1.js` (v4.8.8 — 3 Store API changes + DEBUG
  logs)
- `apps/web/public/heys_storage_supabase_v1.js` (v4.8.6 — PRIMARY quality check)
- No changes needed: `heys_core_v12.js`, `heys_storage_layer_v1.js` (already
  correct)

---

## 🎯 Future Architecture Considerations

### Microservices Evolution

```
Current Monolith          Future Microservices
┌─────────────┐          ┌───┐ ┌───┐ ┌───┐ ┌───┐
│             │          │API│ │USR│ │NUT│ │TRN│
│    HEYS     │    ───►  │GW │ │SVC│ │SVC│ │SVC│
│   Platform  │          └───┘ └───┘ └───┘ └───┘
│             │              │     │     │     │
└─────────────┘              └─────┼─────┼─────┘
                                   │     │
                             ┌───┐ │ ┌───┐ ┌───┐
                             │ANA│ │ │GAM│ │INT│
                             │SVC│ │ │SVC│ │SVC│
                             └───┘   └───┘ └───┘
```

### Scalability Roadmap

- **Phase 1**: Optimize current monolith
- **Phase 2**: Extract core services
- **Phase 3**: Implement microservices
- **Phase 4**: Auto-scaling infrastructure
- **Phase 5**: Global CDN deployment

---

## 📚 Additional Documentation

- [**API Documentation**](./API_DOCUMENTATION.md) - Comprehensive API reference
- [**Security Guide**](../SECURITY.md) - Security implementation details
- [**Development Guide**](../CONTRIBUTING.md) - Development setup and guidelines
- [**Deployment Guide**](./guides/DEPLOYMENT.md) - Production deployment
  instructions

---

**© 2025 HEYS Development Team** | Architecture by @system-architects
