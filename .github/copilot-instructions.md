# HEYS v2 – AI Development Guide

## 🗣️ Communication

**Русский язык** для всех ответов и комментариев. Технические термины и имена
файлов — по-английски.

## 🏗️ Architecture Overview

```
HEYS-v2/
├── apps/web/              # Legacy v12 app (standalone HTML + inline React)
│   ├── index.html         # Main entry point, React components inline
│   ├── heys_core_v12.js   # Product search, localStorage management
│   ├── heys_day_v12.js    # Day statistics, meal tracking
│   ├── heys_user_v12.js   # User profile management
│   ├── heys_reports_v12.js # Reports and analytics
│   └── heys_simple_analytics.js # Minimal performance tracking (217 lines)
├── packages/              # Modern TypeScript packages
│   ├── core/             # Core business logic
│   ├── shared/           # Shared utilities
│   └── logger/           # Logging infrastructure
└── archive/              # Deprecated code (DO NOT USE)
```

**Key principle:** Legacy v12 код в `apps/web/` — это production runtime. Modern
TS в `packages/` — для переиспользования и типизации.

## 🚀 Quick Start

```bash
pnpm install           # Bootstrap (Node ≥18, pnpm ≥8)
pnpm dev              # Dev server → localhost:3001
pnpm build            # Production build (Turbo)
pnpm type-check       # TypeScript validation
```

## 📝 Development Rules

### 1. Legacy v12 Files (`apps/web/*.js`)

- ✅ **EDIT:** Когда пользователь работает с UI/UX, добавляет фичи в web app
- ❌ **DON'T:** Переписывать на TypeScript без явного запроса
- ⚠️ **WATCH OUT:** React компоненты inline в HTML, используют CDN React 18
- 🔍 **Pattern:** `window.HEYS.ModuleName` для глобальных объектов

### 2. Analytics & Performance

- **MINIMAL:** `heys_simple_analytics.js` (217 строк) заменил 1316 строк legacy
  кода
- **Methods:** `trackSearch()`, `trackApiCall()`, `trackDataOperation()`,
  `trackError()`
- **Aliases:** `HEYS.performance.increment()`, `HEYS.performance.measure()`
- ❌ **NEVER:** Добавлять сложный performance monitoring без обсуждения

### 3. Supabase Integration

- **Auth:** `heys_storage_supabase_v1.js` → `cloud.signIn(email, password)`
- **Data:** `DatabaseService` →
  `packages/shared/src/database/DatabaseService.ts`
- **RLS:** Таблица `clients` требует RLS политики
  (`database_clients_rls_policies.sql`)
- **Local mode:** Приложение работает offline через `localStorage`

### 4. Storage Pattern

```javascript
// Client-specific storage
U.lsSet('heys_products', products); // Автоматически добавляет clientId
U.lsGet('heys_products', []);

// Global storage
localStorage.setItem('heys_client_current', clientId);
```

### 5. Code Style

- **Russian comments** в legacy JS файлах
- **English comments** в TypeScript packages
- **No over-engineering:** Простота > сложность (см.
  `PERFORMANCE_MONITOR_AUDIT.md`)
- **YAGNI:** Не добавляй функциональность "на будущее"

## 🔧 Common Tasks

### Add new product field

1. Edit `heys_models_v1.js` (data model)
2. Update `heys_day_v12.js` (UI rendering)
3. Modify `heys_storage_layer_v1.js` (persistence)

### Fix search issue

1. Check `heys_core_v12.js` → `ProductsManager.search()`
2. Verify `searchIndex` in `buildSearchIndex()`
3. Test with `HEYS.analytics.trackSearch()` для slow queries

### Add Supabase table

1. Create SQL in `database/*.sql`
2. Add RLS policies (см. `database_clients_rls_policies.sql`)
3. Update `DatabaseService.ts` если нужен TypeScript access

### Archive old code

```bash
mv apps/web/old_module.js archive/legacy-v12/
git add archive/ && git commit -m "chore: archive old_module.js"
```

## ⚡ Performance Guidelines

- **Bundle size:** Keep legacy JS < 50KB per file
- **localStorage:** Clear old data periodically (>100KB warning)
- **Supabase:** Используй `select('id, name')` вместо `select('*')`
- **React:** Мемоизация через `useMemo()` для тяжелых вычислений

## 🐛 Debugging Patterns

### Check analytics stats

```javascript
// В browser console:
heysStats(); // Shows session statistics
```

### Inspect localStorage

```javascript
Object.keys(localStorage).filter((k) => k.startsWith('heys_'));
```

### Supabase connection issues

```javascript
// Check cloud status
window.HEYS.cloud.getStatus(); // 'online' | 'offline'
```

## 📦 Package Dependencies

- **Legacy JS:** React 18 (CDN), Supabase JS (CDN)
- **Modern TS:** Built with `tsup`, published to `dist/`
- **Shared config:** `tsconfig.json` (root), `levels.config.js`,
  `logger.config.*`

## 🚫 Anti-Patterns (DO NOT)

1. ❌ Monkey patching `document.createElement` или `console.*`
2. ❌ FPS tracking, детальный memory profiling для nutrition app
3. ❌ Глобальные event listeners без cleanup
4. ❌ Избыточная типизация в legacy JS (используй JSDoc по минимуму)
5. ❌ Преждевременная оптимизация

## 📚 Documentation

- **Architecture:** `docs/ARCHITECTURE.md`
- **Performance audit:** `PERFORMANCE_MONITOR_AUDIT.md`
- **Security:** `docs/SECURITY.md`, `database_clients_rls_policies.sql`
- **Legacy navigation:** Navigation maps in repo root (для больших HTML файлов)

## 🎯 Project Philosophy

**"Минимализм и практичность"** — HEYS это приложение учета питания, не
enterprise monitoring platform. Код должен быть простым, понятным и решать
конкретные задачи пользователей.

## 🤝 Commit Style

```bash
feat: add client selection modal
fix: resolve Supabase RLS permissions
refactor: simplify performance monitoring (-1099 lines)
chore: archive legacy performance monitor
docs: update architecture diagram
```

**Всегда тестируй изменения:**

```bash
pnpm dev  # Проверь localhost:3001
# Убедись что нет ошибок в console
# Проверь что данные сохраняются в localStorage
```

## 🤖 AI Workflow Rules

1. **HMR работает** - Vite автоматически применяет изменения, НЕ перезапускай
   сервер без причины
2. **Коммиты только по запросу** - показывай изменения, жди команды "коммит" или
   "пуш"
3. **Минимум шагов** - используй HMR, не делай лишних действий
