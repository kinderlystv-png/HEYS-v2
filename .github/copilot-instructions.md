---
description: HEYS v2 — AI Development Guide v2.8.0
applyTo: '**/*'
---

# HEYS v2 – AI Development Guide

> 🇷🇺 Ответы · EN Code · v2.8.0

📊 **[DATA_MODEL_REFERENCE.md](../docs/DATA_MODEL_REFERENCE.md)** — справочник
всех аналитических параметров (dayTot, normAbs, Product, Meal, Training и др.)

🎯 **[heys_ratio_zones_v1.js](../apps/web/heys_ratio_zones_v1.js)** —
централизованная логика цветов по ratio (калории/норма). Единый источник для
calendar, sparkline, heatmap, advice.

🇷🇺 **Database: Yandex.Cloud PostgreSQL** —
`rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net:6432/heys_production` (152-ФЗ
compliant)

🎯 **[HEYS_BRIEF.md](../docs/HEYS_BRIEF.md)** — операционный бриф MVP (бизнес +
продукт + чеклисты задач + техническая связка)

---

## 1. Базовое поведение

1. Отвечай **по-русски**
2. **🔍 Проактивные улучшения** — при работе над задачей замечай возможности для
   улучшений в контексте и предлагай их (UI/UX, производительность, читаемость
   кода)
3. Предлагай следующий шаг в конце
4. **ИИ не делает** `git commit/push/merge` без просьбы
5. HMR работает — НЕ перезапускай сервер без причины
6. **🚨 НИКОГДА НЕ ОТКАТЫВАЙ ФАЙЛЫ** через `git checkout <file>`, `git restore`,
   `git reset` без **явного согласия пользователя**! Пользователь работает с
   несколькими агентами одновременно — откат может уничтожить работу других
   агентов.
7. **🛠️ Build & Type-check**:
   - `pnpm build` — только **перед коммитом**
   - `pnpm type-check` — только **при изменении TS** или сомнениях
   - HMR достаточно для проверки изменений в runtime

---

## 2. Запрещено → Правильно

| 🚫 Запрещено                      | ✅ Правильно                                  |
| --------------------------------- | --------------------------------------------- |
| `console.log/warn/error` напрямую | `HEYS.analytics.trackError()` или минимально  |
| `localStorage.setItem` напрямую   | `U.lsSet('heys_key', val)` — auto clientId    |
| Monkey patching `console.*`       | Простой wrapper если нужен                    |
| FPS/memory profiling              | Это nutrition app, не game engine             |
| Переписывать Legacy JS → TS       | Только по явному запросу                      |
| `select('*')` в Supabase          | `select('id, name, ...')` — конкретные поля   |
| Глобальные listeners без cleanup  | `addEventListener` + cleanup в unmount        |
| ASCII navigation maps в JS        | 1-line JSDoc: `// file.js — description`      |
| **Inline styles в JSX**           | **Tailwind классы** (см. секцию 2.1)          |
| **Произвольные CSS классы**       | **BEM-naming** `.block__element--modifier`    |
| **Стили в `<style>` тегах**       | **Tailwind или `styles/heys-components.css`** |
| **Дублирование стилей**           | **Переиспользуй существующие классы**         |

---

## 2.1. 🎨 CSS & Стили — КРИТИЧЕСКИ ВАЖНО

### Единый источник правды

```
apps/web/
├── styles/heys-components.css  # Компонентные стили (BEM)
├── index.html                  # Только Tailwind классы
└── *.js                        # React: только Tailwind, НЕ inline styles
```

### Правила стилей

| Тип                         | Где писать                        | Пример                                   |
| --------------------------- | --------------------------------- | ---------------------------------------- |
| **Layout, spacing, colors** | Tailwind в JSX                    | `className="flex gap-2 bg-blue-500"`     |
| **Сложная анимация**        | `styles/heys-components.css`      | `.meal-card { animation: slideIn 0.2s }` |
| **Повторяющийся компонент** | CSS класс в `heys-components.css` | `.btn-primary`, `.card-meal`             |
| **Одноразовый стиль**       | Tailwind arbitrary                | `className="w-[73px]"`                   |

### BEM Naming Convention

```css
/* ✅ Правильно — BEM */
.water-tracker {
} /* Block */
.water-tracker__button {
} /* Element */
.water-tracker__button--active {
} /* Modifier */

/* 🚫 Запрещено — произвольные имена */
.drink-btn {
}
.waterBtn {
}
.my-water-button {
}
```

### Чеклист перед добавлением стилей

1. ❓ **Можно ли сделать Tailwind?** → Да = используй Tailwind
2. ❓ **Стиль уже существует?** → Поищи в `heys-components.css`
3. ❓ **Это повторяющийся паттерн?** → Создай BEM-класс в CSS файле
4. ❓ **Inline style необходим?** → Только для динамических значений
   (`style={{ width: `${pct}%` }}`)

### Частые ошибки стилей

| Код  | Ошибка                  | Решение                                              |
| ---- | ----------------------- | ---------------------------------------------------- |
| S001 | Inline styles в JSX     | `style={{color:'red'}}` → `className="text-red-500"` |
| S002 | Стили в `<style>` теге  | Перенести в `heys-components.css`                    |
| S003 | Произвольное имя класса | Использовать BEM: `.block__element--modifier`        |
| S004 | Дублирование стилей     | Найти и переиспользовать существующий класс          |
| S005 | `!important`            | Увеличить специфичность или рефакторить              |

### При добавлении UI компонента

1. **Сначала** — проверь `heys-components.css` на похожие стили
2. **Tailwind first** — 90% случаев покрывается Tailwind
3. **CSS класс** — только для сложных анимаций или повторяющихся паттернов
4. **Проверь mobile** — `min-h-11` для touch targets

---

## 2.2. 🔧 CSS Refactoring Rules (существующий код)

### 🚫 NO-TOUCH ZONES (не трогать без явного запроса!)

- `@keyframes` — все анимации
- `.confetti-*` — confetti эффекты
- `.water-ring`, `.water-splash` — водные анимации
- `safe-area` rules — iOS отступы
- `.mpc-*` — MealProductCard компоненты

### Правила рефакторинга CSS

| Правило                   | Описание                                   |
| ------------------------- | ------------------------------------------ |
| **Не трогать main.css**   | Только @import'ы, редактируй модули        |
| **Не снимать !important** | Без проверки конфликтов в light/dark       |
| **Скоупить классы**       | `.component__element` вместо `.element`    |
| **Фиксировать метрики**   | ДО и ПОСЛЕ: строки, !important, @keyframes |
| **Тест light/dark**       | После каждого блока правок                 |

### Модульная структура стилей

```
styles/modules/
├── 000-base-and-gamification.css  # Base, confetti, achievements (5705 lines, 172 !important)
├── 100-metrics-and-graphs.css     # Graphs, sparklines (4534 lines)
├── 200-dark-and-effects.css       # Dark theme overrides (1841 lines)
├── 300-modals-and-day.css         # Modals, day UI (3129 lines)
├── 400-water-and-hydration.css    # Water tracker (1387 lines)
├── 500-pwa-and-offline.css        # PWA, install prompts (1794 lines)
└── 600-steps-and-aps.css          # Steps, APS flow (2019 lines)
```

### Перед рефакторингом CSS — ОБЯЗАТЕЛЬНО:

1. **Запустить `pnpm css:audit`** — зафиксировать метрики
2. **Определить scope** — какой модуль затрагивается
3. **Проверить NO-TOUCH** — не ломаем ли анимации
4. **Тест после правок** — light mode + dark mode + mobile
   > `pnpm css:audit` теперь считает только реальные `!important` (по вхождению
   > `!important`, без ложных совпадений в слове “important”).

---

## 3. Частые ошибки HEYS

| Код  | Ошибка                | Причина                 | Решение                                          |
| ---- | --------------------- | ----------------------- | ------------------------------------------------ |
| E001 | Данные не сохраняются | Неверный clientId       | Проверь `U.lsSet()` вместо `localStorage`        |
| E002 | Поиск не работает     | searchIndex не обновлён | Вызови `buildSearchIndex()` после добавления     |
| E003 | Supabase RLS denied   | Нет политики            | Добавь RLS в `database_clients_rls_policies.sql` |
| E004 | React не обновляет UI | Мутация объекта         | Создай новый объект `{...old, newProp}`          |
| E005 | Analytics не трекает  | Неверный метод          | Используй `trackSearch/trackApiCall/trackError`  |
| E006 | Продукт не в базе     | Sync blocked / дубли    | См. секцию 3.1 "Orphan продукты"                 |
| E007 | 400 refresh_token     | RTR одноразовый токен   | См. секцию 3.2 "Supabase RTR"                    |

---

## 3.1. 🔧 Orphan продукты — Критический паттерн

### Симптомы

- Продукт добавлен в приём пищи, данные есть в штампе (MealItem)
- При следующей загрузке:
  `[HEYS] Orphan product: "Название" — используются данные из штампа`
- Продукт **не найден** в `heys_products` базе

### Корневые причины

1. **Sync блокировка при дедупликации** (исправлено 2025-12-09):
   - Лог: `⚠️ [PRODUCTS SYNC] BLOCKED: local (234) > merged (232)`
   - Причина: защита сравнивала raw count с дедуплицированным
   - Решение: сравнивать `localUniqueCount` с `merged.length`

2. **Продукт создан, но не сохранён в базу**:
   - Создание: `HEYS.products.setAll()` должен вызваться
   - Проверка: в консоли должно быть `[CreateProductStep] ✅ VERIFIED`

3. **Race condition при offline**:
   - Продукт добавлен offline → сохранён локально
   - Online sync перезаписывает локальные данные без merge

### Диагностика в консоли

```javascript
// Проверить orphan продукты
HEYS.orphanProducts.list();

// Восстановить из штампов
HEYS.orphanProducts.restore();

// Проверить базу продуктов
HEYS.products.getAll().length;

// Найти продукт по имени
HEYS.products.getAll().find((p) => p.name.includes('Гранола'));
```

### Правила сохранения продуктов

```javascript
// ✅ ПРАВИЛЬНО — с cloud sync
HEYS.products.setAll(newProducts); // React state + localStorage + cloud

// ✅ ПРАВИЛЬНО — через store с правильным ключом
HEYS.store.set('heys_products', newProducts); // localStorage + cloud

// ❌ НЕПРАВИЛЬНО — только localStorage
U.lsSet('heys_products', newProducts); // БЕЗ cloud sync!

// ❌ НЕПРАВИЛЬНО — неверный ключ
HEYS.store.set('products', newProducts); // Создаст heys_<clientId>_products!
```

### Защита данных при создании продукта

При создании нового продукта **ОБЯЗАТЕЛЬНО**:

1. Использовать `HEYS.products.setAll()`
2. Добавить верификацию через 500мс
3. Логировать `savedMethod` для отладки

---

## 3.2. 🔐 Supabase RTR (Refresh Token Rotation) — 400 Bad Request

### Симптомы

- Консоль: `POST .../auth/v1/token?grant_type=refresh_token 400 (Bad Request)`
- Network: `X-Sb-Error-Code: refresh_token_already_used`
- Пользователь выбрасывается из сессии сразу после входа
- Клиенты не загружаются ("Пока нет клиентов")

### Корневая причина

Supabase использует **Refresh Token Rotation (RTR)** — каждый refresh_token
одноразовый.

**Сценарий ошибки:**

1. Пользователь логинится → получает `access_token` + `refresh_token_v1`
2. SDK в фоне пытается рефрешить **старый** `refresh_token_v0` из памяти/storage
3. Сервер возвращает `400 refresh_token_already_used`
4. SDK выбрасывает `SIGNED_OUT` событие → сессия сбрасывается
5. Клиенты не грузятся — RLS блокирует запросы без auth

### Решение (исправлено 2025-12-12)

**Файл**: `heys_storage_supabase_v1.js`

1. **Отключить автоматический refresh**:

   ```javascript
   client = supabase.createClient(url, key, {
     auth: {
       autoRefreshToken: false, // ← КРИТИЧЕСКИ ВАЖНО
       persistSession: true,
       storageKey: 'heys_supabase_auth_token',
     },
   });
   ```

2. **Очищать истёкшие токены ПЕРЕД созданием клиента**:

   ```javascript
   const token = JSON.parse(localStorage.getItem(AUTH_KEY));
   if (token?.expires_at && token.expires_at * 1000 < Date.now()) {
     localStorage.removeItem(AUTH_KEY); // Удаляем протухший токен
   }
   ```

3. **Защитный период после signIn** — игнорировать ложные SIGNED_OUT:

   ```javascript
   let _ignoreSignedOutUntil = 0;

   // После успешного signIn:
   _ignoreSignedOutUntil = Date.now() + 10000; // 10 секунд

   // В onAuthStateChange:
   if (event === 'SIGNED_OUT' && Date.now() < _ignoreSignedOutUntil) {
     return; // Игнорируем ложное срабатывание
   }
   ```

4. **Ручной refresh токена** (раз в 50 минут):
   ```javascript
   setInterval(
     async () => {
       if (user && expiresAt * 1000 < Date.now() + 10 * 60 * 1000) {
         await client.auth.refreshSession();
       }
     },
     50 * 60 * 1000,
   );
   ```

### Диагностика

```javascript
// Проверить состояние токена
const token = JSON.parse(localStorage.getItem('heys_supabase_auth_token'));
console.log('Token expires:', new Date(token?.expires_at * 1000));
console.log('Is expired:', token?.expires_at * 1000 < Date.now());

// Проверить сессию
const { data } = await HEYS.cloud.client.auth.getSession();
console.log('Session:', data?.session?.user?.email);
```

### Правила работы с auth

| 🚫 Запрещено                      | ✅ Правильно                            |
| --------------------------------- | --------------------------------------- |
| `autoRefreshToken: true`          | `autoRefreshToken: false`               |
| `signOut()` без причины           | `signOut({ scope: 'local' })`           |
| `getSession()` сразу после signIn | Использовать `data.session` из signIn   |
| Игнорировать 400 на refresh       | Очищать старые токены при инициализации |

---

## 3.3. 🔐 PIN-авторизация клиентов (vs Curator auth)

### Два типа авторизации

HEYS поддерживает **два режима** авторизации с разными механизмами sync:

| Режим        | Кто использует        | Supabase user | Sync метод            | Флаг                 |
| ------------ | --------------------- | ------------- | --------------------- | -------------------- |
| **Curator**  | Нутрициолог (куратор) | ✅ Есть       | `bootstrapClientSync` | `_rpcOnlyMode=false` |
| **PIN auth** | Клиент (телефон+PIN)  | ❌ Нет        | `syncClientViaRPC`    | `_rpcOnlyMode=true`  |

### Архитектура PIN auth

```
Клиент вводит телефон+PIN
    ↓
RPC: client_pin_auth(phone, pin)
    ↓
Возвращает client_id (без Supabase session!)
    ↓
Все операции через RPC с client_id
    ↓
user = null, но данные доступны
```

**Ключевые переменные** в `heys_storage_supabase_v1.js`:

```javascript
let _rpcOnlyMode = false; // true = PIN auth, false = обычная auth
let _pinAuthClientId = null; // client_id для PIN auth клиента
```

### Универсальный sync — `cloud.syncClient()`

**Проблема**: Старый `bootstrapClientSync()` требует Supabase session (`user`).
Для PIN auth клиентов `user = null` → sync не работал.

**Решение**: Универсальный метод `cloud.syncClient()`:

```javascript
// ✅ ПРАВИЛЬНО — универсальный sync (автовыбор стратегии)
await HEYS.cloud.syncClient(clientId);

// ❌ НЕПРАВИЛЬНО — только для curator auth
await HEYS.cloud.bootstrapClientSync(clientId);
```

**Как работает `syncClient()`**:

```javascript
cloud.syncClient = async function (clientId, options = {}) {
  const isPinAuth = _rpcOnlyMode && _pinAuthClientId === clientId;

  if (isPinAuth) {
    // PIN auth → RPC sync (без Supabase user)
    return cloud.syncClientViaRPC(clientId);
  } else {
    // Curator auth → стандартный bootstrap sync
    return cloud.bootstrapClientSync(clientId, options);
  }
};
```

### Места замены (исправлено 2025-12-12)

Все вызовы `bootstrapClientSync` заменены на `syncClient`:

| Файл               | Место                     | Было                    | Стало          |
| ------------------ | ------------------------- | ----------------------- | -------------- |
| `heys_app_v12.js`  | DayWrapper useEffect      | `bootstrapClientSync()` | `syncClient()` |
| `heys_app_v12.js`  | RationWrapper useEffect   | `bootstrapClientSync()` | `syncClient()` |
| `heys_app_v12.js`  | UserWrapper useEffect     | `bootstrapClientSync()` | `syncClient()` |
| `heys_app_v12.js`  | App client change handler | `bootstrapClientSync()` | `syncClient()` |
| `heys_core_v12.js` | ProductsManager.sync()    | `bootstrapClientSync()` | `syncClient()` |
| `heys_day_v12.js`  | PullRefresh handler       | Только localStorage     | `syncClient()` |

### Диагностика в консоли

```javascript
// Проверить режим auth
console.log('RPC only mode:', HEYS.cloud._rpcOnlyMode);
console.log('PIN client ID:', HEYS.cloud._pinAuthClientId);

// Для PIN auth должно быть:
// _rpcOnlyMode = true
// _pinAuthClientId = "3125a359-..."

// Для curator auth:
// _rpcOnlyMode = false
// _pinAuthClientId = null
```

### Частые проблемы PIN auth

| Симптом                         | Причина                            | Решение                                  |
| ------------------------------- | ---------------------------------- | ---------------------------------------- |
| Данные не синхронизируются      | Используется `bootstrapClientSync` | Заменить на `syncClient()`               |
| PullRefresh не обновляет данные | Читает только localStorage         | Вызвать `syncClient()` перед чтением     |
| `user.id` undefined             | PIN auth не имеет Supabase user    | Проверять `_rpcOnlyMode` перед `user.id` |
| Ложный "требуется обновление"   | String comparison версий           | Использовать `isNewerVersion()`          |

### Сравнение версий (фикс 2025-12-12)

**Проблема**: Версии `2025.12.12.2113.xxx` vs `2025.12.12.2057.yyy` сравнивались
как строки → ложные update prompts.

**Решение**: Функция `isNewerVersion()`:

```javascript
function isNewerVersion(serverVersion, currentVersion) {
  // Извлекаем числовую часть: "2025.12.12.2113" → 202512122113
  const getNumeric = (v) => {
    const parts = v.split('.');
    const numeric = parts.slice(0, 4).join('');
    return parseInt(numeric, 10) || 0;
  };
  return getNumeric(serverVersion) > getNumeric(currentVersion);
}
```

### Правила работы с PIN auth

| 🚫 Запрещено                        | ✅ Правильно                         |
| ----------------------------------- | ------------------------------------ |
| `cloud.bootstrapClientSync()` везде | `cloud.syncClient()` — универсальный |
| `user.id` без проверки              | `if (!_rpcOnlyMode) user.id`         |
| String comparison версий `!==`      | `isNewerVersion(server, current)`    |
| PullRefresh только из localStorage  | `syncClient()` → flush cache → read  |

---

## 4. Архитектура

```
HEYS-v2/
├── apps/web/              # Legacy v12 app (standalone HTML + inline React)
│   ├── index.html         # Main entry point, React components inline
│   ├── heys_app_v12.js    # Main app orchestration
│   ├── heys_core_v12.js   # Product search, localStorage management
│   ├── heys_day_v12.js    # Day statistics, meal tracking
│   ├── heys_user_v12.js   # User profile management
│   ├── heys_reports_v12.js # Reports and analytics
│   ├── heys_models_v1.js  # Data models (Product, Meal, etc.)
│   ├── heys_storage_layer_v1.js # Storage layer (HEYS.store)
│   ├── heys_storage_supabase_v1.js # Cloud sync (Supabase)
│   └── heys_simple_analytics.js # Minimal performance tracking
├── packages/              # Modern TypeScript packages
│   ├── core/             # Core business logic
│   ├── shared/           # Shared utilities
│   ├── storage/          # Storage services
│   └── ...               # analytics, search, ui, logger
└── archive/              # Deprecated code (DO NOT USE)
```

**Key principle:** Legacy v12 код в `apps/web/` — это production runtime. Modern
TS в `packages/` — для переиспользования и типизации.

---

## 5. Quick Start

```bash
pnpm install           # Bootstrap (Node ≥18, pnpm ≥8)
pnpm dev              # Dev server → localhost:3001
pnpm build            # Production build (Turbo)
pnpm type-check       # TypeScript validation
pnpm lint             # ESLint check
```

---

## 6. Development Rules

### Legacy v12 Files (`apps/web/*.js`)

- ✅ **EDIT:** Когда пользователь работает с UI/UX, добавляет фичи в web app
- ❌ **DON'T:** Переписывать на TypeScript без явного запроса
- ⚠️ **WATCH OUT:** React компоненты inline в HTML, используют CDN React 18
- 🔍 **Pattern:** `window.HEYS.ModuleName` для глобальных объектов

### Analytics & Performance

- **MINIMAL:** `heys_simple_analytics.js` — заменил 1316 строк legacy
- **Methods:** `trackSearch()`, `trackApiCall()`, `trackDataOperation()`,
  `trackError()`
- См. секцию 2 "Запрещено→Правильно" для anti-patterns

### Supabase Integration

- **Auth:** `heys_storage_supabase_v1.js` → `cloud.signIn(email, password)`
- **Data:** `DatabaseService` →
  `packages/shared/src/database/DatabaseService.ts`
- **RLS:** Таблица `clients` требует RLS политики
  (`database_clients_rls_policies.sql`)
- **Local mode:** Приложение работает offline через `localStorage`

### Storage Pattern

```javascript
// Legacy API (в heys_core_v12.js) — с clientId namespace
U.lsSet('heys_products', products); // Автоматически добавляет clientId
U.lsGet('heys_products', []);

// Modern API (в heys_storage_layer_v1.js) — с кэшем и watchers
HEYS.store.set('key', value); // Сохранение + notify watchers
HEYS.store.get('key', defaultVal); // Получение из cache/localStorage

// Global storage (без namespace)
localStorage.setItem('heys_client_current', clientId);
```

### Code Style

- **Russian comments** в legacy JS файлах
- **English comments** в TypeScript packages
- **No over-engineering:** Простота > сложность
- **YAGNI:** Не добавляй функциональность "на будущее"

---

## 7. Common Tasks

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

---

## 8. Performance Guidelines

- **Bundle size:** Keep legacy JS < 50KB per file
- **localStorage:** Clear old data periodically (>100KB warning)
- **Supabase:** Используй `select('id, name')` вместо `select('*')`
- **React:** Мемоизация через `useMemo()` для тяжелых вычислений

---

## 9. Debugging Patterns

```javascript
// В browser console:
heysStats(); // Shows session statistics
window.HEYS.cloud.getStatus(); // 'online' | 'offline'

// Inspect localStorage
Object.keys(localStorage).filter((k) => k.startsWith('heys_'));
```

---

## 10. Промпты (Prompt Files)

При запросе **"сделай промпт"** / **"создай промпт"** → использовать шаблон:

**Шаблон**: `docs/TASK_PROMPT_TEMPLATE.md` — использовать как образец структуры

**Расположение**: `docs/tasks/YYYY-MM-DD-slug.md`

**Правила**:

- Конкретные файлы и пути
- **НЕ писать примеры кода** — AI агент сам сгенерирует
- Русский язык для описаний
- **ОБЯЗАТЕЛЬНО секция `## 📌 TL;DR`** в начале промпта с:
  - **Цель** — 1 предложение
  - **Что делаем** — нумерованный список шагов (кратко)
  - **Зачем** — список выгод
  - **Время** — оценка в часах

**При создании промпта СРАЗУ**:

1. Создать файл промпта в `docs/tasks/YYYY-MM-DD-slug.md`
2. **Заполнить TL;DR секцию** — краткий бриф для быстрого понимания
3. **Добавить задачу в `todo.md`** в соответствующую секцию приоритета:

   ```markdown
   ### N. Краткое название задачи

   **Файл**: [YYYY-MM-DD-slug.md](./docs/tasks/YYYY-MM-DD-slug.md) **Описание**:
   Краткое описание задачи **Время**: ~X минут
   ```

**При выполнении промпта**:

- Отмечать `[x]` задачи по мере выполнения
- После всех задач → `pnpm type-check && pnpm build`
- Перенести выполненный промпт: `docs/tasks/` → `docs/tasks/archive/`
- **Перенести задачу в `done.md`** (todo.md только для активных задач!)

---

## 11. Аудит промпта (Deep Audit)

При запросе **"сделай аудит промпта"** / **"проверь промпт"** / **"глубокий
аудит"**:

### Обязательный чеклист (выполнить ДО правок):

1. **Прочитать ВСЕ файлы** из таблицы "Ключевые файлы" целиком (параллельно!)
2. **Найти существующие паттерны** — `semantic_search` для похожих решений
3. **Посмотреть шире на контекст** — какие связанные компоненты могут быть
   затронуты
4. **Проверить на оверкилл** — убрать лишние шаги, которые усложняют без пользы

### Проверка качества:

Для каждого шага в промпте спросить:

- ❓ Это **production-ready** или заглушка?
- ❓ Есть ли **готовый паттерн** в проекте?
- ❓ Продуман ли **UX**: loading states, errors, empty states, feedback?
- ❓ Не **дублирует** ли это существующий функционал?

**Признаки недоделки:**

- Нет loading/error состояний
- Жёсткие значения вместо адаптивных
- Нет анимации где она ожидается
- Нет feedback при действии пользователя

### Формат аудита:

```markdown
## 🔴 Критические (ломают функционал)

- [ ] Проблема 1 → Решение

## 🟡 Важные (могут вызвать баги)

- [ ] Проблема 2 → Решение

## 🟢 Улучшения (nice to have)

- [ ] Проблема 3 → Решение

## ✅ Проверено и ОК

- Пункт 1
```

---

## 12. Ручное тестирование UI

При завершении UI задач проверить:

**Mobile (Chrome DevTools → iPhone SE):**

- [ ] Основной функционал работает
- [ ] Touch targets ≥44px (`min-h-11`)
- [ ] Интерактивные элементы не конфликтуют
- [ ] Анимации плавные

**Desktop (>768px):**

- [ ] Hover-эффекты работают
- [ ] Keyboard навигация (Enter, Escape)

**Общее:**

- [ ] `pnpm type-check` проходит
- [ ] `pnpm build` проходит
- [ ] Нет ошибок в console

---

## 13. Commit Style

```bash
feat: add client selection modal
fix: resolve Supabase RLS permissions
refactor: simplify performance monitoring (-1099 lines)
chore: archive legacy performance monitor
docs: update architecture diagram
```

---

## 14. AI Workflow Rules

1. **HMR работает** — Vite автоматически применяет изменения
2. **Коммиты только по запросу** — жди команды "коммит" или "пуш"
3. **Минимум шагов** — используй HMR, не делай лишних действий
4. **Task Prompt Template** — для многошаговых задач используй
   `docs/TASK_PROMPT_TEMPLATE.md`
5. **todo.md = только задачи** — выполненное сразу переносить в `done.md`

---

## 15. Documentation

- **Architecture:** `docs/ARCHITECTURE.md`
- **Performance audit:** `PERFORMANCE_MONITOR_AUDIT.md`
- **Security:** `docs/SECURITY.md`, `database_clients_rls_policies.sql`
- **Task Template:** `docs/TASK_PROMPT_TEMPLATE.md`

---

## 🎯 Project Philosophy

**"Production-ready качество"** — HEYS это полноценный продукт для учёта
питания. Код должен быть:

- **Качественным** — не MVP-заглушки, а готовые к production решения
- **Продуманным** — UX детали, edge cases, приятные мелочи
- **Простым** — но не примитивным. Минимализм ≠ недоделанность

При реализации фичи делай её **сразу хорошо**: анимации, состояния, feedback
пользователю.

---

## Changelog

| Версия | Дата       | Изменения                                                                                                                                                                                                                              |
| ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.8.0  | 2025-12-21 | **🇷🇺 Yandex.Cloud PostgreSQL**: Миграция базы данных из Supabase (Германия) на Yandex.Cloud (Россия) для соответствия 152-ФЗ. Хост: `rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net:6432/heys_production`. SSL verify-full.                 |
| 2.7.0  | 2025-12-12 | **PIN-авторизация секция 3.3**: Два типа авторизации (Curator vs PIN), универсальный `cloud.syncClient()`, замена bootstrapClientSync во всех местах, семантическое сравнение версий `isNewerVersion()`, диагностика и troubleshooting |
| 2.6.0  | 2025-12-12 | **Caloric Debt + GI Scaling**: Добавлена секция 💰 Caloric Debt в DATA_MODEL_REFERENCE. **v3.5.6**: Увеличен порог для GI с GL≥10 до GL≥20 (хлебцы 24г теперь ~1.9ч вместо 2.2ч)                                                       |
| 2.5.0  | 2025-12-09 | **Orphan продукты секция 3.1**: диагностика, корневые причины, правила сохранения продуктов, исправление sync блокировки при дедупликации                                                                                              |
| 2.4.0  | 2025-12-03 | **CSS/Стили секция**: Tailwind-first, BEM naming, `heys-components.css`; **CSS Refactoring Rules**: NO-TOUCH zones, модульная структура, `pnpm css:audit`                                                                              |
| 2.3.0  | 2025-11-28 | Проактивные улучшения: AI предлагает идеи по улучшению в контексте текущей задачи                                                                                                                                                      |
| 2.2.0  | 2025-11-25 | Промпты: добавлено правило сразу добавлять задачу в todo.md со ссылкой на промпт                                                                                                                                                       |
| 2.1.0  | 2025-11-25 | Аудит: добавлены недостающие файлы в архитектуру, уточнён Storage Pattern (U.lsSet vs HEYS.store), добавлен pnpm lint, убраны дубли                                                                                                    |
| 2.0.0  | 2025-11-25 | Реструктуризация: добавлены секции "Запрещено→Правильно", "Частые ошибки", "Аудит промпта", "Ручное тестирование UI", Changelog                                                                                                        |
| 1.0.0  | 2025-11-XX | Первоначальная версия                                                                                                                                                                                                                  |
