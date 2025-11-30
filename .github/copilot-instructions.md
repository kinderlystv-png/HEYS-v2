---
description: HEYS v2 — AI Development Guide v2.3.0
applyTo: '**/*'
---

# HEYS v2 – AI Development Guide

> 🇷🇺 Ответы · EN Code · v2.3.0

📊 **[DATA_MODEL_REFERENCE.md](../docs/DATA_MODEL_REFERENCE.md)** — справочник всех аналитических параметров (dayTot, normAbs, Product, Meal, Training и др.)

🎯 **[heys_ratio_zones_v1.js](../apps/web/heys_ratio_zones_v1.js)** — централизованная логика цветов по ratio (калории/норма). Единый источник для calendar, sparkline, heatmap, advice.

📝 **[todo.md](../todo.md)** — текущие задачи и приоритеты

---

## 1. Базовое поведение

1. Отвечай **по-русски**
2. **🔍 Проактивные улучшения** — при работе над задачей замечай возможности для улучшений в контексте и предлагай их (UI/UX, производительность, читаемость кода)
3. Предлагай следующий шаг в конце
4. **ИИ не делает** `git commit/push/merge` без просьбы
5. HMR работает — НЕ перезапускай сервер без причины

---

## 2. Запрещено → Правильно

| 🚫 Запрещено                      | ✅ Правильно                                 |
| --------------------------------- | -------------------------------------------- |
| `console.log/warn/error` напрямую | `HEYS.analytics.trackError()` или минимально |
| `localStorage.setItem` напрямую   | `U.lsSet('heys_key', val)` — auto clientId   |
| Monkey patching `console.*`       | Простой wrapper если нужен                   |
| FPS/memory profiling              | Это nutrition app, не game engine            |
| Переписывать Legacy JS → TS       | Только по явному запросу                     |
| `select('*')` в Supabase          | `select('id, name, ...')` — конкретные поля  |
| Глобальные listeners без cleanup  | `addEventListener` + cleanup в unmount       |
| ASCII navigation maps в JS        | 1-line JSDoc: `// file.js — description`     |

---

## 3. Частые ошибки HEYS

| Код  | Ошибка                | Причина                 | Решение                                          |
| ---- | --------------------- | ----------------------- | ------------------------------------------------ |
| E001 | Данные не сохраняются | Неверный clientId       | Проверь `U.lsSet()` вместо `localStorage`        |
| E002 | Поиск не работает     | searchIndex не обновлён | Вызови `buildSearchIndex()` после добавления     |
| E003 | Supabase RLS denied   | Нет политики            | Добавь RLS в `database_clients_rls_policies.sql` |
| E004 | React не обновляет UI | Мутация объекта         | Создай новый объект `{...old, newProp}`          |
| E005 | Analytics не трекает  | Неверный метод          | Используй `trackSearch/trackApiCall/trackError`  |

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

**При создании промпта СРАЗУ**:

1. Создать файл промпта в `docs/tasks/YYYY-MM-DD-slug.md`
2. **Добавить задачу в `todo.md`** в соответствующую секцию приоритета:

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

**"Production-ready качество"** — HEYS это полноценный продукт для учёта питания.
Код должен быть:
- **Качественным** — не MVP-заглушки, а готовые к production решения
- **Продуманным** — UX детали, edge cases, приятные мелочи
- **Простым** — но не примитивным. Минимализм ≠ недоделанность

При реализации фичи делай её **сразу хорошо**: анимации, состояния, feedback пользователю.

---

## Changelog

| Версия | Дата       | Изменения                                                                                                                           |
| ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 2.3.0  | 2025-11-28 | Проактивные улучшения: AI предлагает идеи по улучшению в контексте текущей задачи                                                   |
| 2.2.0  | 2025-11-25 | Промпты: добавлено правило сразу добавлять задачу в todo.md со ссылкой на промпт                                                    |
| 2.1.0  | 2025-11-25 | Аудит: добавлены недостающие файлы в архитектуру, уточнён Storage Pattern (U.lsSet vs HEYS.store), добавлен pnpm lint, убраны дубли |
| 2.0.0  | 2025-11-25 | Реструктуризация: добавлены секции "Запрещено→Правильно", "Частые ошибки", "Аудит промпта", "Ручное тестирование UI", Changelog     |
| 1.0.0  | 2025-11-XX | Первоначальная версия                                                                                                               |
