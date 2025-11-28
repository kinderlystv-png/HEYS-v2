# Task: Безопасный рефакторинг heys_day_v12.js

> **Тип задачи**: Strategic — многошаговый рефакторинг с сохранением функционала

## 🎯 WHY (Бизнес-контекст)

**Problem**: Файл `heys_day_v12.js` содержит **~3400 строк** кода — это монолитный компонент с UI, бизнес-логикой, хуками, пикерами и утилитами в одном файле. Сложно поддерживать, отлаживать и расширять.

**Impact**: Разработчик тратит много времени на навигацию по файлу, высокий риск регрессий при изменениях, сложно переиспользовать компоненты.

**Value**: После рефакторинга:
- Читаемость ↑ (файлы по 100-300 строк вместо 3300)
- Переиспользуемость компонентов (пикеры, карточки)
- Снижение риска регрессий (изолированные модули)
- Упрощение будущих изменений

---

## 🤖 Output Preferences

**Workflow**: Propose plan first → Implement phase by phase → Test after each phase

**Code style**: Follow copilot-instructions.md, минимальные изменения в логике

**Safety first**: 
- Каждая фаза завершается проверкой `pnpm type-check && pnpm build`
- HMR для проверки UI после каждого изменения
- НЕ менять бизнес-логику — только структуру кода

---

## 📋 WHAT (Чек-лист задач)

### Phase 1: Анализ и подготовка

- [x] **Анализ структуры** — построить карту зависимостей внутри файла
  - **Why**: Понять какие функции от каких зависят
  - **Acceptance**: Список компонентов с их зависимостями
  - **Files**: `apps/web/heys_day_v12.js`

- [x] **Определить границы модулей** — разбить на логические группы
  - **Why**: Минимизировать связанность при выносе
  - **Acceptance**: План разбиения на 5-8 файлов
  - **Groups** (предварительно):
    1. `heys_day_utils.js` — утилиты (pad2, todayISO, fmtDate, parseISO, uid, clamp, r0, r1, scale, per100)
    2. `heys_day_hooks.js` — хуки (useDayAutosave, useMobileDetection)
    3. `heys_day_pickers.js` — пикеры (DatePicker, Calendar, TimePicker modals)
    4. `heys_day_modals.js` — модальные окна (GramsPicker, ZonePicker, WeightPicker, DeficitPicker, HouseholdPicker)
    5. `heys_day_trainings.js` — блок тренировок (trainingsBlock)
    6. `heys_day_meals.js` — приёмы пищи (MealAddProduct, mealsUI, мобильные карточки)
    7. `heys_day_stats.js` — статистика (mainBlock, sideBlock, dayTotals)
    8. `heys_day_v12.js` — оркестратор (DayTab, объединяет всё)

### Phase 2: Вынос утилит (SAFE — без React)

- [x] **Создать `heys_day_utils.js`** — чистые функции без зависимостей (267 строк)
  - **Why**: Наиболее безопасный первый шаг
  - **Acceptance**: Утилиты работают, импорт в heys_day_v12.js
  - **Functions**: pad2, todayISO, fmtDate, parseISO, uid, clamp, r0, r1, scale, per100, lsGet, lsSet, sleepHours, parseTime, formatDateDisplay, calcBMR, kcalPerMin, stepsKcal, getProfile, productsSignature, **haptic**
  - **Pattern**: IIFE с экспортом в `HEYS.dayUtils`

- [x] **Тест Phase 2** — проверить работоспособность
  - **How**: `pnpm dev` → открыть вкладку День → проверить расчёты
  - **Acceptance**: UI работает как раньше, нет ошибок в console

### Phase 3: Вынос хуков

- [x] **Создать `heys_day_hooks.js`** — React хуки (188 строк)
  - **Why**: Хуки переиспользуемы, можно вынести независимо
  - **Functions**: useDayAutosave, useMobileDetection
  - **Dependencies**: lsGet, lsSet из heys_day_utils.js, React.useState/useEffect/useRef/useCallback
  - **Pattern**: IIFE с экспортом в `HEYS.dayHooks`
  - **⚠️ Note**: `useMobileDetection` сейчас НЕ экспортируется, используется локально в DayTab. После выноса — экспортировать как `HEYS.dayHooks.useMobileDetection`

- [x] **Тест Phase 3** — автосохранение и детекция мобильных
  - **How**: Добавить продукт → перезагрузить → проверить сохранение
  - **Acceptance**: Данные сохраняются, isMobile корректно определяется

### Phase 4: Вынос пикеров (DatePicker, Calendar)

- [x] **Создать `heys_day_pickers.js`** — компоненты выбора даты (155 строк)
  - **Why**: Независимые UI компоненты, переиспользуются
  - **Components**: DatePicker, Calendar
  - **Dependencies**: formatDateDisplay, parseISO, fmtDate, todayISO
  - **Pattern**: IIFE с экспортом в `HEYS.DatePicker`, `HEYS.Calendar`

- [x] **Тест Phase 4** — навигация по датам
  - **How**: Кликнуть на датапикер → выбрать другую дату → вернуться
  - **Acceptance**: Календарь работает, дата меняется

### Phase 5: Вынос модальных окон

- [ ] **Создать `heys_day_modals.js`** — iOS-style пикеры (ОТЛОЖЕНО)
  - **Why**: Крупные UI блоки с wheel columns
  - **⚠️ ЗАМЕТКА**: Модальные окна тесно связаны с локальным состоянием DayTab (showTimePicker, pendingMealTime, editingMealIndex и т.д.). Вынос требует значительного рефакторинга props-drilling или использования Context API.
  - **Components**: 
    - Time Picker modal (showTimePicker state)
    - Grams Picker modal (showGramsPicker state)
    - Zone Picker modal (showZonePicker state)
    - Weight Picker modal (showWeightPicker state)
    - Deficit Picker modal (showDeficitPicker state)
    - Household Picker modal (showHouseholdPicker state)
  - **Dependencies**: HEYS.WheelColumn, хуки состояния, **ReactDOM.createPortal**
  - **Pattern**: Компоненты + контроллеры (open/confirm/cancel)
  - **⚠️ Note**: Все модальные окна рендерятся через `ReactDOM.createPortal(el, document.body)`

- [ ] **Тест Phase 5** — все модальные окна
  - **How**: Открыть каждый пикер → выбрать значение → подтвердить
  - **Acceptance**: Все пикеры работают, данные сохраняются

### Phase 6: Вынос блока тренировок

- [ ] **Создать `heys_day_trainings.js`** — UI тренировок (ОТЛОЖЕНО)
  - **Why**: Изолированный UI блок с собственной логикой
  - **⚠️ ЗАМЕТКА**: Блок тренировок зависит от TR, kcalMin, visibleTrainings, setVisibleTrainings, day, setDay — все это локальное состояние DayTab. Требует передачи ~10+ props.
  - **Components**: trainingsBlock, trainIcons, removeTraining
  - **Dependencies**: TR, kcalMin, openZonePicker, r0
  - **Pattern**: Компонент TrainingsBlock(props)

- [ ] **Тест Phase 6** — добавление/удаление тренировок
  - **How**: Добавить тренировку → ввести минуты → удалить
  - **Acceptance**: Калории считаются правильно

### Phase 7: Вынос приёмов пищи

- [ ] **Создать `heys_day_meals.js`** — UI приёмов пищи
  - **Why**: Самый большой UI блок, критически важен
  - **Components**: MealAddProduct, mealsUI, pRow, mTotals, mobile product cards
  - **Dependencies**: pIndex, products, day, setDay, isMobile, expandedMeals
  - **⚠️ POPULAR_CACHE**: module-level кэш для популярных продуктов — вынести вместе с `computePopularProducts()`
  - **Pattern**: Компонент MealsSection(props)

- [ ] **Тест Phase 7** — полный цикл работы с едой
  - **How**: Добавить приём → найти продукт → изменить граммы → удалить
  - **Acceptance**: Поиск работает, граммы считаются, UI обновляется

### Phase 8: Вынос статистики

- [ ] **Создать `heys_day_stats.js`** — блоки статистики
  - **Why**: Отдельная логика расчётов и отображения
  - **Components**: 
    - mainBlock (violet table)
    - sideBlock (сон, оценка)
    - dayTotals
    - **Sparkline** (SVG график калорий за 7 дней)
    - **Macro rings** (кольца прогресса БЖУ в стиле Apple Watch)
    - **Goal progress bar** (прогресс калорий)
    - **Confetti** (празднование достижения цели)
    - **macroTip toast** (подсказки по БЖУ)
  - **Dependencies**: tdee, bmr, optimum, eatenKcal, factDefPct, day, setDay
  - **State**: showConfetti, animatedProgress, toastVisible, toastDismissed
  - **Pattern**: Компоненты MainStatsBlock, SideStatsBlock

- [ ] **Тест Phase 8** — расчёты статистики
  - **How**: Изменить вес → проверить BMR → добавить шаги → проверить TDEE
  - **Acceptance**: Все расчёты корректны

### Phase 9: Финализация и очистка

- [ ] **Упростить heys_day_v12.js** — оставить только оркестрацию
  - **Why**: Главный файл должен быть читаемым
  - **Acceptance**: < 500 строк, только DayTab и импорты
  - **Оставить в DayTab** (не выносить):
    - Skeleton loader (skeletonLoader, isHydrated)
    - Pull-to-refresh логика (pullProgress, isPulling, handleRefresh)
    - Theme toggle (isDarkTheme, toggleTheme)
    - FAB кнопка добавления приёма
    - Empty state
  - **Structure**:
    ```javascript
    // heys_day_v12.js — DayTab orchestrator
    (function(global){
      // Imports from sub-modules
      const { utils } = HEYS.dayUtils;
      const { useDayAutosave, useMobileDetection } = HEYS.dayHooks;
      // ... etc
      
      // DayTab component — state + layout
      HEYS.DayTab = function DayTab(props) {
        // State management
        // Render sub-components
      };
    })(window);
    ```

- [ ] **Обновить index.html** — добавить загрузку новых файлов
  - **Why**: Модули должны загружаться в правильном порядке
  - **Order**: utils → hooks → pickers → modals → trainings → meals → stats → day_v12

- [ ] **Финальный тест** — полный регрессионный тест
  - **How**: Пройти все сценарии на мобильном и десктопе
  - **Acceptance**: Всё работает как до рефакторинга

---

## ✅ DONE (Критерии приёмки)

### Functional

- [ ] **Все фичи работают**: добавление/удаление приёмов, продуктов, тренировок
- [ ] **Расчёты корректны**: BMR, TDEE, калории, БЖУ
- [ ] **Сохранение работает**: данные сохраняются в localStorage и синхронизируются
- [ ] **Mobile-friendly**: все пикеры и жесты работают на телефоне

### Quality Gates

- [ ] **Type safety**: `pnpm type-check` PASS
- [ ] **Linting**: `pnpm lint` PASS (без новых ошибок)
- [ ] **Build**: `pnpm build` PASS
- [ ] **No console errors**: в браузере нет ошибок

### Structure

- [ ] **Файлы < 500 строк**: каждый модуль читаем
- [ ] **Чёткие зависимости**: нет циклических импортов
- [ ] **IIFE pattern**: все модули используют единый паттерн
- [ ] **HEYS namespace**: все экспорты через window.HEYS.*

### UI Testing

**Mobile (Chrome DevTools → iPhone SE):**
- [ ] Добавить приём пищи → выбрать время → подтвердить
- [ ] Найти продукт → добавить → изменить граммы
- [ ] Свайп для удаления продукта
- [ ] Пикер тренировок работает

**Desktop (>768px):**
- [ ] Таблица продуктов отображается корректно
- [ ] Hover-эффекты работают
- [ ] Клавиатурная навигация в поиске

---

## 🤖 AI Context (Technical Specs)

### 📐 Current Architecture

```
apps/web/heys_day_v12.js (~3400 lines)
├── Utilities (lines 1-70)
│   ├── pad2, todayISO, fmtDate, parseISO, uid, clamp, r0, r1
│   ├── lsGet, lsSet (storage wrappers)
│   ├── per100, scale (calculations)
│   └── haptic(type) — экспортируется в HEYS.haptic
├── Hooks (lines 70-200)
│   ├── useDayAutosave (autosave with debounce + BroadcastChannel)
│   └── useMobileDetection (responsive)
├── Helper Functions (lines 200-300)
│   ├── loadMealsForDate, computePopularProducts, POPULAR_CACHE
│   ├── getProfile, calcBMR, kcalPerMin, stepsKcal
│   └── parseTime, sleepHours, formatDateDisplay
├── UI Components (lines 300-600)
│   ├── DatePicker (compact dropdown)
│   └── Calendar (full month view)
├── DayTab Component (lines 429-3400)
│   ├── State declarations (lines 600-900)
│   │   └── showConfetti, animatedProgress, pullProgress, macroTip...
│   ├── Modal pickers (lines 900-1400) — используют ReactDOM.createPortal
│   ├── Meal functions (lines 1400-1700)
│   ├── Training blocks (lines 1700-1900)
│   ├── Stats blocks (lines 1900-2200)
│   │   └── Sparkline, Macro rings, Goal progress, Confetti
│   ├── Meals UI (lines 2200-2800)
│   ├── Pull-to-refresh, Skeleton loader (lines 2800-2900)
│   └── Day totals & render (lines 2900-3400)
```

### ❌ Anti-Patterns (DO NOT)

1. **NO** изменений в бизнес-логике — только структура
2. **NO** переименований функций — сохранить API
3. **NO** новых зависимостей — использовать существующие паттерны
4. **NO** TypeScript конвертации — оставить JavaScript
5. **NO** "улучшений" кода — рефакторинг, не переписывание

### 🔑 Key Patterns

- **IIFE Module Pattern**: `(function(global){ ... })(window);`
- **HEYS Namespace**: `HEYS.moduleName = { ... }`
- **React from CDN**: `const React = global.React;`
- **ReactDOM.createPortal**: используется для модальных окон (document.body)
- **Storage via HEYS.store**: `HEYS.store.get/set` или `U.lsGet/lsSet`

### 📦 External Dependencies (не переносить!)

Эти файлы загружаются ДО `heys_day_v12.js` и предоставляют компоненты:
- `HEYS.WheelColumn` — из `heys_wheel_picker.js`
- `HEYS.SwipeableRow` — из `heys_swipeable.js`  
- `HEYS.PullToRefresh` — из `heys_pull_refresh.js`
- `HEYS.models` — из `heys_models_v1.js`
- `HEYS.store` — из `heys_storage_layer_v1.js`

### ⚠️ Module-level State (осторожно!)

Переменные вне DayTab, которые нужно учитывать при выносе:
- `POPULAR_CACHE` — кэш популярных продуктов (Map)
- `pIndex` — индекс продуктов (в scope у computePopularProducts)

### 🏷️ Текущие экспорты в HEYS namespace

Из `heys_day_v12.js` экспортируются только:
- `HEYS.haptic` — функция вибрации (строка 23)
- `HEYS.DatePicker` — компонент выбора даты (строка 372)
- `HEYS.DayTab` — главный компонент вкладки (строка 429)

**Остальные функции локальны** — при выносе нужно добавить экспорт в `HEYS.dayUtils`, `HEYS.dayHooks` и т.д.

### 💡 Риск оверкилла: Phase 4 + Phase 5

**Рассмотреть объединение**: `heys_day_pickers.js` + `heys_day_modals.js` → `heys_day_pickers.js`
- Оба используют `HEYS.WheelColumn` и `ReactDOM.createPortal`
- Логически связаны (все picker-компоненты)
- Разделение на 2 файла может быть избыточным если суммарно < 400 строк

### 📝 File Loading Order in index.html

```html
<!-- Current order (ACTUAL from index.html) -->
<script defer src="heys_dev_utils.js"></script>
<script defer src="heys_simple_analytics.js"></script>
<script defer src="heys_core_v12.js"></script>
<script defer src="heys_storage_supabase_v1.js"></script>
<script defer src="heys_models_v1.js"></script>
<script defer src="heys_storage_layer_v1.js"></script>
<script defer src="heys_wheel_picker.js"></script>
<script defer src="heys_swipeable.js"></script>
<script defer src="heys_pull_refresh.js"></script>
<script defer src="heys_day_v12.js"></script>
<script defer src="heys_user_v12.js"></script>
<script defer src="heys_reports_v12.js"></script>
<script defer src="heys_app_v12.js"></script>

<!-- After refactoring (сохраняем defer и порядок) -->
<script defer src="heys_dev_utils.js"></script>
<script defer src="heys_simple_analytics.js"></script>
<script defer src="heys_core_v12.js"></script>
<script defer src="heys_storage_supabase_v1.js"></script>
<script defer src="heys_models_v1.js"></script>
<script defer src="heys_storage_layer_v1.js"></script>
<script defer src="heys_wheel_picker.js"></script>
<script defer src="heys_swipeable.js"></script>
<script defer src="heys_pull_refresh.js"></script>
<!-- Day module split (insert BEFORE heys_day_v12.js) -->
<script defer src="heys_day_utils.js"></script>
<script defer src="heys_day_hooks.js"></script>
<script defer src="heys_day_pickers.js"></script>
<script defer src="heys_day_modals.js"></script>
<script defer src="heys_day_trainings.js"></script>
<script defer src="heys_day_meals.js"></script>
<script defer src="heys_day_stats.js"></script>
<!-- End Day module split -->
<script defer src="heys_day_v12.js"></script>
<script defer src="heys_user_v12.js"></script>
<script defer src="heys_reports_v12.js"></script>
<script defer src="heys_app_v12.js"></script>
```

---

## 📂 Quick Reference

### Key Files

| Файл | Назначение | Строк |
|------|-----------|-------|
| `apps/web/heys_day_v12.js` | Целевой файл рефакторинга | **~3400** |
| `apps/web/heys_models_v1.js` | Модели данных (Product, Meal) | ~150 |
| `apps/web/heys_storage_layer_v1.js` | HEYS.store API | ~120 |
| `apps/web/heys_wheel_picker.js` | WheelColumn для пикеров | ~150 |
| `apps/web/heys_swipeable.js` | SwipeableRow для мобильных | ~100 |
| `apps/web/heys_pull_refresh.js` | PullToRefresh компонент | ~80 |
| `apps/web/index.html` | Загрузка скриптов | — |

### Commands

```bash
pnpm dev           # Start dev server → localhost:3001
pnpm type-check    # TypeScript validation
pnpm lint          # ESLint check
pnpm build         # Production build
```

---

## 📝 Notes

- **Priority**: medium
- **Complexity**: L (8-10 фаз, 4-6 часов работы)
- **Risk**: medium — много UI компонентов, нужно тщательное тестирование
- **Blockers**: нет
- **Related Tasks**: CSS Refactoring (завершён), Mobile UX (в прогрессе)
- **Created**: 2025-11-28

---

## ⚠️ Потенциальные проблемы

### 1. defer скрипты и порядок загрузки
- Все скрипты используют `defer` — выполняются после парсинга HTML в порядке объявления
- **Риск**: новые файлы должны быть ДО `heys_day_v12.js` в HTML
- **Решение**: вставлять строго перед `<script defer src="heys_day_v12.js">`

### 2. Циклические зависимости
- `heys_day_v12.js` использует `HEYS.store` и `HEYS.models`
- Вынесенные модули тоже будут их использовать
- **Риск**: если модуль A зависит от B, а B от A — сломается
- **Решение**: utils → hooks → pickers (строгий порядок без обратных зависимостей)

### 3. Состояние между модулями
- `useDayAutosave` использует `lsGet`/`lsSet` из utils
- `POPULAR_CACHE` используется в meals
- **Риск**: после выноса кэш может не работать
- **Решение**: выносить `POPULAR_CACHE` вместе с `computePopularProducts`

### 4. ReactDOM.createPortal
- Модальные окна рендерятся в `document.body`
- **Риск**: при выносе может потеряться контекст React
- **Решение**: передавать ReactDOM как зависимость или брать из `global.ReactDOM`

---

## 🚀 Execution Plan

1. **Начать с Phase 2** (утилиты) — самый безопасный шаг
2. **После каждой фазы**: `pnpm build` + ручной тест в браузере
3. **Коммит после каждой фазы**: `refactor: extract heys_day_utils.js`
4. **При проблемах**: откат к предыдущему коммиту
5. **После Phase 9**: полный регрессионный тест

---

**Version**: 1.2.0 | **Created**: 2025-11-28 | **Last audit**: 2025-11-28

### Changelog
- **1.2.0**: Выполнены Phase 2-4 — созданы heys_day_utils.js (267 строк), heys_day_hooks.js (188 строк), heys_day_pickers.js (155 строк). heys_day_v12.js уменьшен с 3434 до 3051 строк (-11%). Phases 5-9 отложены из-за сильной связности с локальным состоянием DayTab.
- **1.1.0**: Глубокий аудит — исправлено количество строк (3400), актуализирован порядок скриптов в index.html с defer, добавлена секция рисков, уточнение по useMobileDetection, добавлены текущие HEYS экспорты, предупреждение об объединении Phase 4+5
