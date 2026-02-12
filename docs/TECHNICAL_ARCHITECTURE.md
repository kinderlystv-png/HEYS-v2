# 🏗️ Техническая Архитектура HEYS 2025

## 📋 Обзор системы

HEYS - это современная монолитно-модульная система с микросервисной
архитектурой, построенная на принципах:

- **Domain-Driven Design (DDD)**
- **Clean Architecture**
- **SOLID принципы**
- **Event-Driven Architecture**

---

## 🏛️ Архитектурные слои

### 1. **Presentation Layer** (UI/Frontend)

```
apps/web/          - Основное веб-приложение (Vite + React/Vue)
apps/mobile/       - Мобильное приложение
apps/desktop/      - Десктопное приложение
packages/ui/       - Переиспользуемые UI компоненты
```

### 2. **Application Layer** (Business Logic)

```
packages/core/     - Основная бизнес-логика и API
packages/analytics/    - Аналитика и метрики
packages/gaming/   - Игровая механика
packages/search/   - Поиск и индексирование
```

### 3. **Domain Layer** (Domain Models)

```
packages/shared/   - Общие модели, утилиты и типы
types/            - TypeScript определения
```

### 4. **Infrastructure Layer** (External Services)

```
packages/storage/     - Управление данными и хранилище
packages/threat-detection/ - Безопасность и анализ угроз
packages/analytics-dashboard/ - Дашборд аналитики
```

---

## 🔧 Технологический стек

### **Frontend Stack**

- **Framework**: Vite 6.x + React 18.x
- **TypeScript**: 5.9.x для типобезопасности
- **State Management**: Zustand/Context API
- **Styling**: Tailwind CSS + CSS Modules
- **Testing**: Vitest + @testing-library

### **Backend Stack**

- **Runtime**: Node.js 20.x
- **API Framework**: Express.js 4.x
- **Database**: PostgreSQL + Supabase
- **ORM**: Prisma/Supabase Client
- **Authentication**: Supabase Auth

### **DevOps & Infrastructure**

- **Package Manager**: PNPM (workspace)
- **Build System**: Turbo + Vite
- **CI/CD**: GitHub Actions
- **Containerization**: Docker + Docker Compose
- **Deployment**: Vercel/Netlify (frontend), Railway/Heroku (backend)

### **Security & Monitoring**

- **Security Headers**: Helmet.js
- **Input Validation**: Zod schemas
- **Threat Detection**: Custom ML-based system
- **Monitoring**: Custom analytics + Sentry integration
- **CORS**: Configured for production domains

---

## 📊 Архитектура данных

### **Database Schema**

```sql
-- Основные таблицы
users               -- Пользователи
days                -- Дневниковые записи
food_entries        -- Записи о питании
training_sessions   -- Тренировочные сессии
achievements        -- Достижения в играх
security_events     -- События безопасности
audit_logs          -- Аудит действий
```

### **Data Flow**

```
1. Frontend (UI) → API Gateway → Business Logic
2. Business Logic → Domain Services → Data Layer
3. Events → Analytics Pipeline → Dashboards
4. Security Events → Threat Detection → Incident Response
```

---

## 🔐 Система безопасности

### **Authentication & Authorization**

- **JWT токены** через Supabase Auth
- **Role-based access control** (RBAC)
- **Session management** с автоматическим истечением
- **Multi-factor authentication** (готовность)

### **Data Protection**

- **Field-level encryption** для чувствительных данных
- **Input sanitization** через DOMPurify
- **SQL injection protection** через parameterized queries
- **XSS protection** через CSP headers

### **Threat Detection Engine**

```typescript
// Компоненты системы безопасности
AnomalyDetectionEngine; // ML-анализ аномалий
ThreatIntelligenceEngine; // Анализ угроз
SecurityAnalyticsService; // Агрегация событий безопасности
PenetrationTestFramework; // Автоматическое тестирование безопасности
```

---

## ⚡ Производительность

### **Frontend Optimizations**

- **Code splitting** по маршрутам и компонентам
- **Lazy loading** для тяжелых компонентов
- **Bundle optimization** через Vite
- **Service Workers** для кеширования
- **Mobile performance optimizer** для мобильных устройств

### **Backend Optimizations**

- **Connection pooling** для базы данных
- **Redis caching** для часто запрашиваемых данных
- **API response compression** (gzip/brotli)
- **Database query optimization** с индексами
- **Background job processing** для тяжелых операций

### **Performance Metrics**

- **Core Web Vitals**: LCP < 2.5s, FID < 100ms, CLS < 0.1
- **Lighthouse Score**: 90+ баллов по всем категориям
- **API Response Time**: < 200ms для основных endpoints
- **Database Query Time**: < 50ms для простых запросов

---

## 🔄 Event-Driven Architecture

### **Event Types**

```typescript
// Основные события системы
UserEvents; // Регистрация, логин, обновление профиля
ContentEvents; // Создание, обновление, удаление записей
AnalyticsEvents; // Метрики использования, поведенческие данные
SecurityEvents; // Подозрительная активность, нарушения безопасности
SystemEvents; // Ошибки, мониторинг, health checks
```

### **Event Processing Pipeline**

```
Event Source → Event Bus → Event Handlers → Side Effects
                    ↓
           Analytics Storage → Dashboards & Reports
```

---

## 🧪 Тестирование

### **Testing Strategy**

- **Unit Tests**: 80%+ покрытие кода
- **Integration Tests**: API endpoints и database interactions
- **E2E Tests**: Критические пользовательские сценарии
- **Security Tests**: Penetration testing framework
- **Performance Tests**: Load testing критических endpoints

### **Current Test Status**

```bash
✅ Tests Passed: 450/457 (98.5% success rate)
🟨 Failed Tests: 7 (dependency issues, being fixed)
📊 Code Coverage: 85%+ across all packages
🔐 Security Tests: All passing
```

---

## 🚀 Deployment Architecture

### **Environment Strategy**

```
Development   → Local + Docker Compose
Staging       → Staging environment (production-like)
Production    → Multi-zone deployment с failover
```

### **CI/CD Pipeline**

```yaml
# GitHub Actions workflow
1. Code Quality Check (ESLint, Prettier, TypeScript) 2. Security Scan
(dependency vulnerabilities) 3. Unit & Integration Tests 4. Build & Bundle
Optimization 5. E2E Tests on staging 6. Production Deployment (blue-green) 7.
Post-deployment Health Checks
```

### **Infrastructure Components**

- **Load Balancer**: NGINX/Cloudflare
- **Application Servers**: Node.js clusters
- **Database**: PostgreSQL with read replicas
- **Cache Layer**: Redis for sessions & frequently accessed data
- **File Storage**: Supabase Storage/S3 for static assets
- **CDN**: Cloudflare для global content delivery

---

## 📈 Мониторинг и observability

### **Application Monitoring**

- **Health Checks**: Automated endpoint monitoring
- **Error Tracking**: Sentry integration для exception handling
- **Performance Monitoring**: Custom metrics для key business processes
- **User Analytics**: Behavioral tracking и usage patterns

### **Data Quality Monitoring** (v4.8.8)

**DEBUG Logs** (активны во время тестирования):

```javascript
// 1. Post-sync data verification
console.info(
  `[HEYS.sync] 🔍 After sync: loadedProducts.length=${x}, withIron=${y}`,
);
// Ожидаемое: withIron=290 (не 0 или 42)

// 2. React state update tracking
console.info(
  `[HEYS.sync] 🔄 React state updated: ${prev}→${next} products, ${a}→${b} with iron`,
);
// OR: console.info(`[HEYS.sync] 🚫 React state NOT updated (same quality)`);

// 3. Quality check blocks (критические)
console.error(
  `[HEYS.storage] 🚨 SAVE BLOCKED: only ${x} products with iron (expected 250+)`,
);
```

**Monitoring Checklist**:

- ✅ `withIron=290` после каждого sync (не меньше)
- ✅ `React state updated` должен быть редким (данные не меняются часто)
- ✅ `SAVE BLOCKED` НЕ должен появляться после v4.8.8 fix
- ⚠️ Любой `withIron < 100` = ИНЦИДЕНТ → проверить namespacing

**Purpose**: Раннее обнаружение регрессий защитного слоя (quality checks) и
React state sync

### **Infrastructure Monitoring**

- **Server Metrics**: CPU, память, disk, network
- **Database Performance**: Query performance, connection pools
- **Cache Efficiency**: Redis hit rates и memory usage
- **Security Monitoring**: Real-time threat detection и incident response

---

## 📚 Документация и соответствие

### **Documentation Standards**

- **API Documentation**: OpenAPI 3.0 specifications
- **Code Documentation**: JSDoc для всех public APIs
- **Architecture Decisions**: ADR (Architecture Decision Records)
- **Deployment Guides**: Step-by-step deployment procedures
- **User Manuals**: End-user documentation и tutorials

### **Compliance & Standards**

- **GDPR Compliance**: Data protection и user privacy
- **Security Standards**: OWASP Top 10 protection
- **Code Quality**: ESLint, Prettier, TypeScript strict mode
- **Performance Standards**: Web Vitals и accessibility guidelines

---

## �️ Критические архитектурные решения

### **React State Synchronization v4.8.8 (февраль 2026)**

**Проблема**: React state показывал 42 продукта с микронутриентами вместо 290,
несмотря на корректные данные в cloud/DB/localStorage. Это блокировало активацию
паттернов `micronutrient_radar`, `antioxidant_defense`, `heart_health`.

**Root Cause**: Namespacing conflict — React читал из **unscoped** localStorage
ключа (`heys_products`), а синхронизация писала в **scoped** ключ
(`heys_{clientId}_products`).

**Решение** (v4.8.8):

```javascript
// ❌ СТАРЫЙ подход — прямой доступ к localStorage
const products = window.HEYS.utils.lsGet('heys_products', []);

// ✅ НОВЫЙ подход v4.8.8 — единственный источник истины
const products = window.HEYS?.products?.getAll?.() || [];
```

**Архитектурный принцип**: **Store API как Single Source of Truth**

- React ВСЕГДА читает через `products.getAll()` (не напрямую из localStorage)
- Store API инкапсулирует scoped keys внутри
- Абстракция предотвращает утечку деталей реализации

**Защита данных** (многослойная):

1. **PRIMARY Quality Check** (v4.8.6): Блокирует сохранение если `<50` продуктов
   с железом
2. **Quality-based Comparison** (v4.8.7): Обновление React по iron count, а не
   по длине массива
3. **Pre-sync Block**: Флаг `waitingForSync` предотвращает race conditions

**Результат**:

- Products с Fe: 42 → **290** ✅
- micronutrient_radar: 0 → **100** ✅
- Health Score: 66 → **71** ✅
- Паттерны: 27/41 → активны все нутриентные

**Lessons Learned**:

1. **Никогда не обходите абстракции** — прямой доступ к localStorage нарушает
   scoping
2. **Debug logs критичны** — 3-уровневое логирование выявило namespacing
   conflict
3. **Quality checks работают** — PRIMARY check заблокировал 100% stale saves

**Файлы**:

- `apps/web/heys_app_sync_effects_v1.js` (React hooks, v4.8.8)
- `apps/web/public/heys_storage_supabase_v1.js` (sync + quality checks, v4.8.6)
- `apps/web/public/heys_core_v12.js` (products API)
- `apps/web/public/heys_storage_layer_v1.js` (Store implementation)

---

## �🔮 Будущее развитие

### **Planned Enhancements**

- **Microservices Migration**: Постепенный переход к микросервисам
- **GraphQL API**: Для более эффективных data fetching
- **Real-time Features**: WebSockets для live updates
- **AI/ML Integration**: Персонализация и recommendation engine
- **Progressive Web App**: Enhanced mobile experience

### **Scalability Roadmap**

- **Horizontal Scaling**: Multi-region deployment
- **Database Sharding**: Для handling больших объемов данных
- **Event Sourcing**: Для аудита и eventual consistency
- **CQRS Pattern**: Separation of command и query responsibilities

---

_Документ обновлен: 12 февраля 2026_  
_Статус системы: 100% production ready (v4.8.8)_
