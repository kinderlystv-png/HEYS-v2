---
template-version: 3.4.0
created: 2025-12-15
updated: 2025-12-15
audited: 2025-12-15 — production-grade архитектура, полный функционал
purpose: Task-First template — modular, reusable, extensible widget system
optimization: Enterprise patterns for HEYS-v2 (Registry, Lifecycle, Plugin system)
---

# Task: Widget Dashboard — Модульная система виджетов (Production)

## 📌 TL;DR (Краткий бриф)

**Цель**: Production-ready система виджетов с модульной архитектурой — registry, lifecycle, plugin system, полная кастомизация, undo/redo, presets, keyboard shortcuts.

**Архитектурные принципы**:
1. **Модульность** — каждый виджет = отдельный файл с единым API
2. **Registry Pattern** — централизованная регистрация типов виджетов
3. **Lifecycle Hooks** — mount/update/unmount для каждого виджета
4. **Plugin System** — расширяемость без изменения core
5. **State Management** — immutable updates, undo/redo history
6. **Event Bus** — слабое связывание компонентов
7. **Design System** — визуальная консистентность + уникальность каждого виджета

**Design System (критично для UX)**:
- ✅ **Консистентность** — единый card shell, border-radius 16px, spacing grid 4/8/12px, typography scale
- ✅ **Уникальность** — каждый виджет имеет свою визуальную сигнатуру (border-top color, signature animation, unique visualization)
- ✅ **Размер по контенту** — compact для circular progress, wide для horizontal bars, tall для vertical lists, large для complex graphs
- ✅ **Быстрое распознавание** — top border color (категория) + emoji icon + primary element color + visualization form

**Что делаем** (по приоритету):
1. **Core Engine** — Grid, DnD, State Manager, Event Bus
2. **Widget Framework** — Base class, Registry, Lifecycle
3. **10 Production Widgets** — калории, вода, сон, вес, шаги, streak, инсулин, макросы, цикл, прогресс
4. **Advanced Features** — Undo/Redo, Presets, Settings, Keyboard, Accessibility

**Время**: ~10-14 часов (full production)

**Визуальные примеры уникальности**:
- 🔥 **Калории**: 4-color gradient progress (red→yellow→green→emerald)
- 💧 **Вода**: Circular ring + wave animation (blue)
- 😴 **Сон**: Yellow stars quality + time range (purple category)
- ⚖️ **Вес**: Mini sparkline + trend arrow (purple category)
- 👟 **Шаги**: Radial ring green progress (отличается от воды цветом)
- 🔥 **Streak**: Pulsing flame animation + number
- 📈 **Инсулин**: Wave curve visualization (blue→green)
- 🥗 **Макросы**: 3 horizontal bars P/C/F (red/blue/yellow)
- 🌸 **Цикл**: Phase icon pink gradient
- 📊 **Прогресс**: Linear bar + ETA text

---

## 🎯 WHY (Бизнес-контекст)

**Problem**: Важные метрики разбросаны по разным вкладкам. Нет единой "домашней страницы" с персонализируемым набором показателей.

**Technical Debt Prevention**: Без модульной архитектуры виджеты станут спагетти-кодом как `heys_day_v12.js` (21K строк).

**Value**:
- **Пользователь**: Персональный dashboard за 1 секунду
- **Разработка**: Добавить новый виджет = 1 файл 100-200 строк
- **Масштабируемость**: Plugin system для будущих виджетов (Telegram mini-app, B2B)

---

## 🏗️ ARCHITECTURE (Модульная система)

### Файловая структура

```
apps/web/
├── heys_widgets_core_v1.js        # Core: Grid Engine + DnD + State Manager
├── heys_widgets_registry_v1.js    # Registry: типы, lifecycle, validation
├── heys_widgets_ui_v1.js          # UI: Catalog, Settings, Presets modal
├── heys_widgets_events_v1.js      # Event Bus для слабого связывания
│
├── widgets/                       # Отдельные виджеты (1 файл = 1 виджет)
│   ├── widget_base.js            # Base class с lifecycle hooks
│   ├── widget_kcal.js            # 🔥 Калории + ratio
│   ├── widget_water.js           # 💧 Вода с quick-add
│   ├── widget_sleep.js           # 😴 Сон + качество
│   ├── widget_weight.js          # ⚖️ Вес + тренд + sparkline
│   ├── widget_steps.js           # 👟 Шаги + прогресс
│   ├── widget_streak.js          # 🔥 Streak + confetti
│   ├── widget_insulin.js         # 📈 Инсулиновая волна
│   ├── widget_macros.js          # 🥗 БЖУ distribution
│   ├── widget_cycle.js           # 🌸 Менструальный цикл
│   └── widget_progress.js        # 📊 Прогресс к цели веса
│
└── styles/
    └── modules/
        └── 730-widgets-dashboard.css   # BEM стили (подключать в main.css)
```

### Core Modules API

```javascript
// === heys_widgets_core_v1.js ===
HEYS.Widgets = {
  // State Management (immutable)
  state: {
    layout: [],           // Widget positions
    editMode: false,      // Edit mode flag
    history: [],          // Undo stack
    future: [],           // Redo stack
  },
  
  // Grid Engine
  grid: {
    columns: 4,           // Always 4 columns (mobile-first)
    rowHeight: 80,        // Touch-friendly
    gap: 8,
    
    // Positioning
    positionWidget(widget, x, y): boolean,
    canPlace(widget, x, y): boolean,
    getCollisions(widget, x, y): Widget[],
    autoPack(): void,     // Remove gaps top-to-bottom
    
    // Rendering
    render(container): void,
    renderPlaceholder(x, y, w, h): void,
  },
  
  // Drag & Drop
  dnd: {
    dragging: null,       // Currently dragged widget
    ghost: null,          // Ghost element
    
    start(widget, event): void,
    move(event): void,
    end(event): void,
    
    // Touch support
    onTouchStart(e): void,
    onTouchMove(e): void,
    onTouchEnd(e): void,
  },
  
  // State Actions
  actions: {
    addWidget(type, options?): Widget,
    removeWidget(id): void,
    moveWidget(id, x, y): void,
    resizeWidget(id, size): void,
    updateSettings(id, settings): void,
    
    // Undo/Redo
    undo(): void,
    redo(): void,
    canUndo(): boolean,
    canRedo(): boolean,
    
    // Bulk
    applyPreset(presetId): void,
    resetToDefault(): void,
    exportLayout(): string,
    importLayout(json): boolean,
  },
  
  // Persistence (ОБЯЗАТЕЛЬНО через HEYS.store для cloud sync!)
  storage: {
    save(): void,         // Debounced auto-save через HEYS.store.set()
    load(): Layout,       // HEYS.store.get('heys_widget_layout_v1', defaultLayout)
    getKey(): string,     // 'heys_widget_layout_v1' (namespace через HEYS.store)
    migrate(oldVersion): Layout,
    // Cloud sync включён автоматически через HEYS.store!
  },
  
  // Edit Mode
  editMode: {
    enter(): void,
    exit(): void,
    toggle(): void,
    isActive(): boolean,
  },
};

// === heys_widgets_registry_v1.js ===
HEYS.Widgets.registry = {
  // Registration
  register(type, definition): void,
  unregister(type): void,
  get(type): WidgetDefinition,
  getAll(): WidgetDefinition[],
  
  // Validation
  validate(widget): ValidationResult,
  
  // Categories
  categories: {
    nutrition: ['kcal', 'water', 'macros'],
    health: ['sleep', 'weight', 'steps', 'cycle'],
    motivation: ['streak', 'progress'],
    advanced: ['insulin'],
  },
};

// === Widget Definition Interface ===
interface WidgetDefinition {
  type: string;              // Unique identifier
  name: string;              // Display name (Russian)
  icon: string;              // Emoji
  category: string;          // For catalog grouping
  
  // Supported sizes
  sizes: WidgetSize[];       // ['compact', 'wide', 'tall', 'large']
  defaultSize: WidgetSize;
  
  // Settings schema (for settings modal)
  settings?: SettingsSchema;
  
  // Lifecycle hooks
  render(container, widget, state): void;
  mount?(widget, state): void;
  update?(widget, oldState, newState): void;
  unmount?(widget): void;
  
  // Data requirements
  dataKeys?: string[];       // ['day.waterMl', 'profile.weight']
  refreshInterval?: number;  // Auto-refresh in ms (0 = manual)
  
  // Interactions
  onClick?(widget, event): void;
  onLongPress?(widget, event): void;
  quickActions?: QuickAction[];
}

// === heys_widgets_events_v1.js ===
HEYS.Widgets.events = {
  on(event, handler): () => void,  // Returns unsubscribe
  off(event, handler): void,
  emit(event, data): void,
  
  // Built-in events
  // 'widget:added', 'widget:removed', 'widget:moved'
  // 'widget:settings', 'widget:click', 'widget:action'
  // 'layout:changed', 'layout:saved', 'layout:reset'
  // 'editMode:enter', 'editMode:exit'
  // 'data:updated' (when underlying data changes)
};
```

### Widget Sizes

| Size | Columns | Rows | Use Case |
|------|---------|------|----------|
| `compact` | 2 | 2 | Простые метрики (вода, сон) |
| `wide` | 4 | 2 | Метрики с bar/progress (калории) |
| `tall` | 2 | 4 | Вертикальные списки (streak история) |
| `large` | 4 | 4 | Комплексные (инсулиновая волна, макросы) |

**Принцип подбора размера**: Размер виджета определяется **типом информации**, а не произвольно:
- **Status bar / Progress** → `wide` (4×2) — горизонтальный бар занимает всю ширину
- **Circular progress** → `compact` (2×2) — круг компактный, квадрат оптимален
- **Mini-график / Sparkline** → `wide` (2×2 или 4×2) — зависит от детализации
- **Timeline / History** → `tall` (2×4) — вертикальный список дней
- **Complex visualization** → `large` (4×4) — график инсулиновой волны, макросы

### Design System (Визуальная консистентность + Уникальность)

**Цель**: Единая система виджетов с общим стилем, но каждый виджет узнаваем.

#### Общие элементы (для консистентности)

| Элемент | Стиль | Цель |
|---------|-------|------|
| **Card background** | `var(--card-bg)` | Единый фон для всех виджетов |
| **Border radius** | `16px` | Скруглённые углы везде |
| **Padding** | `12px` | Единое внутреннее расстояние |
| **Typography** | System font stack | Единые шрифты |
| **Spacing** | `4px/8px/12px` grid | Кратно 4px |
| **Transitions** | `0.2s ease` | Плавные переходы |
| **Shadow (hover)** | `0 4px 12px rgba(0,0,0,0.1)` | Единая тень |

#### Уникальные элементы (для узнаваемости)

Каждый виджет имеет **свою визуальную сигнатуру**:

| Виджет | Уникальный элемент | Почему узнаваем |
|--------|-------------------|-----------------|
| **Калории 🔥** | Gradient progress bar по ratio | Цвет меняется: красный→жёлтый→зелёный |
| **Вода 💧** | Circular ring + wave animation | Круг с волной — только у воды |
| **Сон 😴** | Stars (качество) + time range | Звёзды качества уникальны |
| **Вес ⚖️** | Mini sparkline + trend arrow | График веса виден сразу |
| **Шаги 👟** | Radial progress ring | Круговой прогресс (отличается от воды цветом) |
| **Streak 🔥** | Flame emoji + number | Пламя и число — только streak |
| **Инсулин 📈** | Wave curve visualization | Волна инсулина — уникальная кривая |
| **Макросы 🥗** | 3 horizontal bars (P/C/F) | Три полоски разных цветов |
| **Цикл 🌸** | Phase icon + day badge | Розовая иконка фазы |
| **Прогресс 📊** | Linear progress + ETA | Полоска с датой цели |

#### Цветовая система

| Категория | Primary Color | Использование |
|-----------|--------------|---------------|
| **Nutrition** | Orange/Yellow | Калории, вода, макросы |
| **Health** | Purple/Blue | Сон, вес, шаги |
| **Motivation** | Green/Emerald | Streak, прогресс |
| **Advanced** | Blue gradient | Инсулиновая волна |
| **Cycle** | Pink | Менструальный цикл |

**Правило**: Цвет виджета соответствует категории, но внутри используется **градиент по выполнению** (где применимо).

#### Иконография

- **Emoji как primary icon** — каждый виджет имеет свой эмодзи (🔥💧😴⚖️👟🔥📈🥗🌸📊)
- **Size**: 24-32px в зависимости от размера виджета
- **Position**: Top-left или center (зависит от layout)

#### Микроанимации

Каждый виджет имеет **свою signature анимацию**:

| Виджет | Анимация | Триггер |
|--------|----------|---------|
| Калории | Gradient fill слева направо | On data update |
| Вода | Wave fill снизу вверх | On quick add |
| Streak | Pulsing flame | On perfect day |
| Инсулин | Smooth wave curve animation | Real-time countdown |
| Макросы | Staggered bar fill | On data load |

### Layout Schema (v1)

```javascript
const LAYOUT_SCHEMA = {
  version: 1,
  widgets: [
    {
      id: 'kcal_1702656000000',      // type + timestamp
      type: 'kcal',
      size: 'wide',
      x: 0,                          // Grid column (0-3)
      y: 0,                          // Grid row
      settings: {                    // Widget-specific settings
        showRemaining: true,
        colorByRatio: true,
      },
    },
  ],
  presetId: null,                    // If using preset
  updatedAt: 1702656000000,
};
```

---

## 🤖 Output Preferences

**Workflow**: Implement in phases, test each phase before next

**Code style**: 
- Follow copilot-instructions.md
- Each widget = separate file
- JSDoc comments for public API
- BEM for CSS (`.widget-*`, `.widget-*__element`, `.widget-*--modifier`)

---

## 🚨 Фаза 0: Подготовка фундамента (БЛОКЕРЫ)

### 0.0 Wiring в существующую архитектуру

- [ ] **Подключить JS модули в `apps/web/index.html`** (ДО `heys_app_v12.js`):
  - `heys_widgets_events_v1.js`
  - `heys_widgets_registry_v1.js`
  - `heys_widgets_core_v1.js`
  - `heys_widgets_ui_v1.js`
  - `widgets/widget_*.js` (все 10 виджетов)

- [ ] **Обновить PWA precache** в `apps/web/public/sw.js`:
  - Добавить все новые JS/CSS файлы в `PRECACHE_URLS`

- [ ] **Создать CSS модуль** `apps/web/styles/modules/730-widgets-dashboard.css`
  - Подключить через `@import` в `apps/web/styles/main.css`

### 0.1 Интеграция в навигацию

**Решение**: Заменить кнопку "Обзор" (overview) на "Виджеты" (widgets) в мобильной навигации.

- [ ] **Заменить tab "overview" на "widgets" в `heys_app_v12.js`**:
  - Иконка: 🏠 (домик) — станет "домашней" вкладкой
  - В МОБИЛЬНОЙ версии: кнопка "Обзор" → "Виджеты"
  - В DESKTOP версии: оставить "Обзор" отдельно (viewport > 768px)
  - **TODO (позже)**: Настройка стартовой вкладки в профиле

- [ ] **Добавить widgets в `SWIPEABLE_TABS`**:
  ```javascript
  // Было: const SWIPEABLE_TABS = ['stats', 'diary', 'insights'];
  // Стало:
  const SWIPEABLE_TABS = ['widgets', 'stats', 'diary', 'insights'];
  ```

- [ ] **Edit Mode = защита от конфликта DnD/Swipe**:
  - В обычном режиме: свайп работает нормально
  - В edit mode: добавить класс `.no-swipe-zone` на контейнер
  - Вход в edit: долгое нажатие (500ms) ИЛИ кнопка "✏️ Редактировать"
  - Выход: кнопка "✓ Готово" ИЛИ tap вне виджетов

- [ ] **Создать контейнер вкладки**:
  ```javascript
  // В renderTabs() добавить case 'widgets':
  case 'widgets':
    return React.createElement(HEYS.Widgets.components.WidgetsTab, { key: 'widgets' });
  ```

- [ ] **API переключения табов** (использовать везде):
  ```javascript
  // ✅ Правильно:
  window.HEYS.App.setTab('stats');
  // ❌ Неправильно (такого API нет):
  HEYS.switchTab('stats');
  ```

### 0.2 Базовые утилиты для виджетов

- [ ] **Data Access Layer** — unified data fetching:
  ```javascript
  // apps/web/widgets/widget_data.js
  HEYS.Widgets.data = {
    // Get today's data
    getDay(dateISO = getTodayISO()) {
      return HEYS.utils.lsGet(`heys_dayv2_${dateISO}`, {});
    },
    
    // Get profile
    getProfile() {
      return HEYS.utils.lsGet('heys_profile', {});
    },
    
    // Get computed values (uses existing HEYS modules)
    getComputed(dateISO) {
      const day = this.getDay(dateISO);
      const profile = this.getProfile();
      return {
        tdee: HEYS.TDEE?.calculate(profile, day),
        ratio: HEYS.ratioZones?.getStatus(day.ratio),
        insulin: HEYS.InsulinWave?.calculate({ meals: day.meals, ... }),
        cycle: HEYS.Cycle?.getCyclePhase(day.cycleDay),
      };
    },
    
    // Subscribe to changes (for live updates)
    subscribe(key, callback) {
      return HEYS.store?.watch?.(key, callback);
    },
  };
  ```

### 0.3 CSS Foundation

- [ ] **Создать `apps/web/styles/modules/730-widgets-dashboard.css`**
  - [ ] Подключить `@import './modules/730-widgets-dashboard.css';` в `main.css`
  
  **Содержимое**:
  ```css
  /* ===== Design Tokens (CSS Custom Properties) ===== */
  :root {
    /* Spacing */
    --widget-spacing-xs: 4px;
    --widget-spacing-sm: 8px;
    --widget-spacing-md: 12px;
    --widget-spacing-lg: 16px;
    
    /* Border */
    --widget-border-radius: 16px;
    --widget-border-width: 1px;
    
    /* Shadow */
    --widget-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.06);
    --widget-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
    
    /* Typography */
    --widget-font-title: 14px;
    --widget-font-value: 24px;
    --widget-font-label: 12px;
    
    /* Colors (per category) */
    --widget-nutrition: #f97316; /* orange */
    --widget-health: #8b5cf6;    /* purple */
    --widget-motivation: #10b981; /* green */
    --widget-advanced: #3b82f6;  /* blue */
    --widget-cycle: #ec4899;     /* pink */
  }

  /* Dark mode overrides */
  [data-theme="dark"] {
    --widget-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
    --widget-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
  
  /* Grid Container */
  .widgets-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    padding: 8px;
    min-height: calc(100vh - 120px);
  }
  
  /* ===== Widget Base (Консистентность) ===== */
  .widget {
    background: var(--card-bg, #fff);
    border-radius: var(--widget-border-radius);
    padding: var(--widget-spacing-md);
    box-shadow: var(--widget-shadow-sm);
    transition: box-shadow 0.2s ease, transform 0.2s ease;
    cursor: pointer;
    position: relative;
  }
  
  .widget:hover {
    box-shadow: var(--widget-shadow-md);
    transform: translateY(-2px);
  }
  
  /* ===== Widget Identity (Уникальность) ===== */
  
  /* Калории 🔥 — gradient progress */
  .widget--kcal {
    border-top: 3px solid var(--widget-nutrition);
  }
  
  .widget--kcal .widget__progress-bar {
    height: 8px;
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      #ef4444 0%,    /* red at 0% */
      #eab308 50%,   /* yellow at 90% */
      #22c55e 90%,   /* green at 100% */
      #10b981 100%   /* emerald at perfect */
    );
  }
  
  /* Вода 💧 — circular ring + wave */
  .widget--water {
    border-top: 3px solid #3b82f6; /* blue */
  }
  
  .widget--water .widget__ring {
    stroke: #3b82f6;
    stroke-width: 8;
    fill: none;
    transition: stroke-dashoffset 0.5s ease;
  }
  
  .widget--water .widget__wave {
    animation: wave 2s ease-in-out infinite;
  }
  
  @keyframes wave {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  
  /* Сон 😴 — stars quality + time */
  .widget--sleep {
    border-top: 3px solid var(--widget-health);
  }
  
  .widget--sleep .widget__stars {
    color: #fbbf24; /* yellow stars */
    font-size: 16px;
  }
  
  /* Вес ⚖️ — mini sparkline */
  .widget--weight {
    border-top: 3px solid var(--widget-health);
  }
  
  .widget--weight .widget__sparkline {
    stroke: var(--widget-health);
    stroke-width: 2;
    fill: none;
  }
  
  /* Шаги 👟 — radial ring */
  .widget--steps {
    border-top: 3px solid var(--widget-motivation);
  }
  
  .widget--steps .widget__ring {
    stroke: var(--widget-motivation);
  }
  
  /* Streak 🔥 — flame + number */
  .widget--streak {
    border-top: 3px solid var(--widget-motivation);
    position: relative;
  }
  
  .widget--streak .widget__flame {
    font-size: 32px;
    animation: pulse 2s ease-in-out infinite;
  }
  
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
  }
  
  /* Инсулин 📈 — wave curve */
  .widget--insulin {
    border-top: 3px solid var(--widget-advanced);
  }
  
  .widget--insulin .widget__wave-curve {
    stroke: var(--widget-advanced);
    stroke-width: 2;
    fill: url(#insulinGradient);
  }
  
  /* Макросы 🥗 — 3 bars P/C/F */
  .widget--macros {
    border-top: 3px solid var(--widget-nutrition);
  }
  
  .widget--macros .widget__bar--protein {
    background: #ef4444; /* red */
  }
  
  .widget--macros .widget__bar--carbs {
    background: #3b82f6; /* blue */
  }
  
  .widget--macros .widget__bar--fat {
    background: #eab308; /* yellow */
  }
  
  /* Цикл 🌸 — phase badge */
  .widget--cycle {
    border-top: 3px solid var(--widget-cycle);
  }
  
  .widget--cycle .widget__phase-icon {
    font-size: 24px;
    color: var(--widget-cycle);
  }
  
  /* Прогресс 📊 — linear bar + ETA */
  .widget--progress {
    border-top: 3px solid var(--widget-motivation);
  }
  
  .widget--progress .widget__progress-linear {
    height: 6px;
    background: var(--widget-motivation);
    border-radius: 3px;
  }
  
  /* ===== Typography Scale ===== */
  .widget__title {
    font-size: var(--widget-font-title);
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: var(--widget-spacing-sm);
  }
  
  .widget__value {
    font-size: var(--widget-font-value);
    font-weight: 700;
    color: var(--text-primary);
  }
  
  .widget__label {
    font-size: var(--widget-font-label);
    color: var(--text-tertiary);
  }
  
  /* ===== Size Modifiers ===== */
  .widget--compact {
    grid-column: span 2;
    grid-row: span 2;
  }
  
  .widget--wide {
    grid-column: span 4;
    grid-row: span 2;
  }
  
  .widget--tall {
    grid-column: span 2;
    grid-row: span 4;
  }
  
  .widget--large {
    grid-column: span 4;
    grid-row: span 4;
  }
  
  /* ===== Edit Mode ===== */
  .widget--dragging {
    opacity: 0.5;
    cursor: move;
  }
  
  .widget--drag-over {
    border: 2px dashed var(--primary);
  }
  
  .widget--editing {
    animation: widget-shake 0.3s ease-in-out infinite;
  }
  
  @keyframes widget-shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-2px); }
    75% { transform: translateX(2px); }
  }
  
  .widget__delete-btn {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #ef4444;
    color: white;
    display: none;
  }
  
  .widget--editing .widget__delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* Dragging */
  .widget--dragging {
    opacity: 0.8;
    transform: scale(1.05);
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    z-index: 1000;
  }
  
  .widget-ghost {
    border: 2px dashed var(--accent, #3b82f6);
    background: var(--accent-light, rgba(59, 130, 246, 0.1));
    border-radius: 16px;
  }
  
  /* Animations */
  @keyframes widget-shake {
    0%, 100% { transform: rotate(-1deg); }
    50% { transform: rotate(1deg); }
  }
  
  @keyframes widget-drop {
    from { transform: scale(1.1); opacity: 0.8; }
    to { transform: scale(1); opacity: 1; }
  }
  
  /* Accessibility */
  .widget:focus-visible {
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: 2px;
  }
  ```

**Пояснения к CSS Design System**:

**1. Консистентность достигается через:**
- **CSS Custom Properties** — все spacing, colors, shadows в токенах
- **BEM naming** — `.widget`, `.widget--kcal`, `.widget__title`
- **Единая card shell** — одинаковый border-radius, padding, shadow для всех виджетов
- **Typography scale** — 3 размера (title/value/label) во всех виджетах

**2. Уникальность достигается через:**
- **Border-top color** — каждый виджет имеет свой цвет верхней границы (категория)
- **Уникальные элементы** — `.widget__progress-bar` только у калорий, `.widget__ring` у воды и шагов (но разные цвета)
- **Signature анимации** — `wave` у воды, `pulse` у streak, плавные fill у остальных
- **Градиенты и визуализации** — калории имеют 4-color gradient, инсулин имеет wave curve

**3. Размер виджета зависит от контента:**
- **compact (2×2)** — достаточно для circular progress (вода, шаги) и простых метрик (сон)
- **wide (4×2)** — горизонтальный bar требует полной ширины (калории, макросы, прогресс)
- **tall (2×4)** — вертикальный список (7 дней streak history)
- **large (4×4)** — комплексные графики (инсулиновая волна, макросы butterfly chart)

**4. Быстрое распознавание:**
- **Top border** — цвет категории виден сразу
- **Emoji icon** — уникальный для каждого виджета
- **Цвет основного элемента** — калории gradient, вода синяя, streak зелёный
- **Форма визуализации** — bar vs ring vs sparkline vs curve

---

## 📋 WHAT (Чек-лист задач)

### Фаза 1: Core Engine (~3 часа)

- [ ] **Grid Engine** — `heys_widgets_core_v1.js`
  - CSS Grid 4-column layout
  - Position calculation (x, y → grid-column, grid-row)
  - Collision detection (O(n) scan, n < 20)
  - Auto-pack algorithm (gravity: top-to-bottom, left-to-right)

- [ ] **State Manager** — immutable state + history
  - `state.layout` — widget positions
  - `state.history` / `state.future` — undo/redo stacks
  - Debounced persistence (500ms)
  - Schema versioning + migration

- [ ] **Drag & Drop Engine** — native, no libraries
  - Touch events: `touchstart`, `touchmove`, `touchend`
  - Pointer events: `pointerdown`, `pointermove`, `pointerup`
  - Ghost element (clone with reduced opacity)
  - Placeholder preview (dashed border at target position)
  - Drop validation (collision check)
  - `navigator.vibrate(10)` on valid drop

- [ ] **Edit Mode**
  - Enter: Long press (500ms) OR "Edit" button
  - Visual: Shake animation, delete buttons appear
  - Exit: Tap outside OR "Done" button
  - Keyboard: `Escape` exits edit mode

### Фаза 2: Widget Framework (~2 часа)

- [ ] **Widget Registry** — `heys_widgets_registry_v1.js`
  ```javascript
  HEYS.Widgets.registry.register('kcal', {
    type: 'kcal',
    name: 'Калории',
    icon: '🔥',
    category: 'nutrition',
    sizes: ['wide', 'compact'],
    defaultSize: 'wide',
    settings: {
      showRemaining: { type: 'boolean', default: true, label: 'Показать "осталось"' },
      colorByRatio: { type: 'boolean', default: true, label: 'Цвет по выполнению' },
    },
    dataKeys: ['day.meals', 'profile'],
    refreshInterval: 0, // Manual
    render: renderKcalWidget,
    onClick: () => window.HEYS.App?.setTab?.('stats'),
  });
  ```

- [ ] **Base Widget Class** — `widgets/widget_base.js`
  ```javascript
  class WidgetBase {
    constructor(definition, instance) {
      this.def = definition;
      this.instance = instance;
      this.container = null;
      this.mounted = false;
    }
    
    // Lifecycle
    mount(container) {
      this.container = container;
      this.def.mount?.(this.instance, this.getState());
      this.mounted = true;
      this.render();
    }
    
    update(oldState, newState) {
      if (!this.mounted) return;
      this.def.update?.(this.instance, oldState, newState);
      this.render();
    }
    
    unmount() {
      this.def.unmount?.(this.instance);
      this.mounted = false;
      this.container = null;
    }
    
    render() {
      if (!this.container) return;
      this.def.render(this.container, this.instance, this.getState());
    }
    
    getState() {
      return HEYS.Widgets.data.getComputed();
    }
  }
  ```

- [ ] **Event Bus** — `heys_widgets_events_v1.js`
  ```javascript
  const handlers = new Map();
  
  HEYS.Widgets.events = {
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(handler);
      return () => this.off(event, handler);
    },
    
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
    
    emit(event, data) {
      handlers.get(event)?.forEach(h => {
        try { h(data); } catch (e) { console.error('[Widgets Event Error]', e); }
      });
    },
  };
  ```

### Фаза 3: Production Widgets (~4 часа)

#### 3.1 Nutrition Widgets

- [ ] **Widget: Калории** — `widgets/widget_kcal.js`
  - **Sizes**: `wide` (default) — горизонтальный ratio bar требует полной ширины, `compact` — только число
  - **Display**: Ratio bar, "1850 / 2200 ккал", remaining
  - **Color**: `HEYS.ratioZones.getGradientColor(ratio)` (красный→жёлтый→зелёный)
  - **Settings**: showRemaining, colorByRatio
  - **Click**: Navigate to stats tab
  - **Quick Action**: None (tap = navigate)

- [ ] **Widget: Вода** — `widgets/widget_water.js`
  - **Sizes**: `compact` (default) — circular progress компактен, 2×2 достаточно
  - **Display**: Circular progress, "1.2 / 2.0 л"
  - **Color**: Blue gradient by %
  - **Settings**: goalOverride, showLastTime
  - **Quick Action**: "+250мл" button (inline)
  - **Animation**: Wave fill effect

- [ ] **Widget: Макросы** — `widgets/widget_macros.js`
  - **Sizes**: `large` (default) — 3 bars + labels требуют места, `wide` — только bars без labels
  - **Display**: 3 progress bars (P/C/F), percentages, граммы
  - **Color**: Protein blue, Carbs yellow, Fat orange
  - **Settings**: showGrams, showPercentage
  - **Click**: Navigate to stats tab

#### 3.2 Health Widgets

- [ ] **Widget: Сон** — `widgets/widget_sleep.js`
  - **Sizes**: `compact` (default) — время + звёзды качества помещаются в квадрат
  - **Display**: "7.5ч", quality stars, time range (23:30-07:00)
  - **Color**: Purple for sleep
  - **Settings**: showQuality, showTimeRange
  - **Click**: Open sleep step modal

- [ ] **Widget: Вес** — `widgets/widget_weight.js`
  - **Sizes**: `compact` (default) — только цифра, `wide` — с мини-графиком 7 дней
  - **Display**: Current weight, trend arrow, mini sparkline (7d)
  - **Color**: Green/red by trend
  - **Settings**: showSparkline, showTrend
  - **Click**: Open weight modal

- [ ] **Widget: Шаги** — `widgets/widget_steps.js`
  - **Sizes**: `compact` (default) — radial ring + число оптимален в квадрате
  - **Display**: Step count, goal progress ring
  - **Color**: Green by %
  - **Settings**: goalOverride
  - **Click**: None (info only)

- [ ] **Widget: Цикл** — `widgets/widget_cycle.js`
  - **Sizes**: `compact` (default) — иконка фазы + день + название фазы
  - **Display**: Phase icon, day number, phase name
  - **Color**: Pink gradient by phase
  - **Settings**: showPhaseInfo
  - **Visibility**: Only if cycle tracking enabled
  - **Click**: Open cycle info modal

#### 3.3 Motivation Widgets

- [ ] **Widget: Streak** — `widgets/widget_streak.js`
  - **Sizes**: `compact` (default) — пламя + число, `tall` (4 rows) — с историей последних 7 дней (mini-heatmap)
  - **Display**: "🔥 12", flame animation
  - **tall**: Last 7 days mini-heatmap (7 квадратиков вертикально)
  - **Settings**: showAnimation
  - **Click**: Fire confetti if streak > 7
  - **Animation**: Pulsing flame on perfect days

- [ ] **Widget: Прогресс к цели** — `widgets/widget_progress.js`
  - **Sizes**: `wide` (default) — progress bar + текст "75.5 → 70кг" + ETA требуют горизонтального пространства
  - **Display**: Progress bar, "75.5 → 70 кг", ETA ("через 4 недели")
  - **Color**: Gradient by progress (0% = red, 100% = green)
  - **Settings**: None
  - **Click**: Navigate to reports tab

#### 3.4 Advanced Widgets

- [ ] **Widget: Инсулиновая волна** — `widgets/widget_insulin.js`
  - **Sizes**: `large` (default) — wave curve + timeline + factors требуют 4×4, `wide` — только curve без factors
  - **Display**: Wave visualization (SVG кривая), time remaining, status (active/lipolysis)
  - **Color**: Blue→Green (active→lipolysis)
  - **Settings**: showFactors (показывать факторы влияния: ГИ, клетчатка и т.д.)
  - **Refresh**: Every 60s (live countdown)
  - **Click**: Open insulin wave modal

### Фаза 4: UI Components (~2 часа)

- [ ] **Widget Catalog** — `heys_widgets_ui_v1.js`
  - Bottom sheet modal
  - Categories (Питание, Здоровье, Мотивация, Продвинутые)
  - Size preview for each widget
  - Drag from catalog OR tap to add
  - Search/filter (for 10+ widgets)

- [ ] **Widget Settings** — per-widget settings modal
  - Auto-generate from `settings` schema
  - Boolean → Toggle
  - Number → Slider/Input
  - Select → Dropdown
  - Live preview

- [ ] **Presets Modal**
  - 3 built-in presets:
    - "Минималист" — kcal, water, streak
    - "Здоровье" — sleep, weight, steps, water
    - "Полный контроль" — all widgets
  - Apply preset (replaces current)
  - Save current as preset (localStorage)

- [ ] **Empty State**
  - If no widgets: "Добавьте первый виджет" + catalog button
  - If no data: Per-widget placeholder (e.g., "Добавьте сон в утреннем чек-ине")

### Фаза 5: Advanced Features (~2 часа)

- [ ] **Undo/Redo**
  - `Ctrl/Cmd+Z` — undo
  - `Ctrl/Cmd+Shift+Z` — redo
  - UI buttons in edit mode header
  - Max 20 history items

- [ ] **Keyboard Shortcuts**
  - `E` — toggle edit mode
  - `Delete/Backspace` — remove selected widget (in edit mode)
  - `Arrow keys` — move selected widget
  - `Escape` — exit edit mode / close modals

- [ ] **Accessibility**
  - `role="grid"` on container
  - `role="gridcell"` on widgets
  - `aria-label` with widget name and value
  - Focus management in edit mode
  - Screen reader announcements for changes

- [ ] **Performance**
  - Debounced saves (500ms)
  - `requestAnimationFrame` for drag updates
  - Lazy render for off-screen widgets (if > 10)
  - Memo-ize expensive calculations

- [ ] **Export/Import**
  - Export: Copy JSON to clipboard
  - Import: Paste JSON, validate, confirm
  - Include version for compatibility

---

## ✅ DONE (Критерии приёмки)

### Functional

- [ ] 10 виджетов работают корректно с live данными
- [ ] Drag & drop плавный на touch и mouse
- [ ] Undo/Redo работает (min 5 операций)
- [ ] Presets применяются и сохраняются
- [ ] Settings для каждого виджета работают
- [ ] Catalog фильтрует по категориям
- [ ] Keyboard shortcuts работают (E, Escape, Ctrl+Z)
- [ ] Layout сохраняется между сессиями

### Quality Gates

- [ ] `pnpm build` — PASS
- [ ] No console errors
- [ ] Lighthouse Performance > 90
- [ ] Total new JS < 100KB (all widget files combined)

### UI Testing

**Mobile (iPhone SE):**
- [ ] Touch drag работает без лагов
- [ ] Long press 500ms входит в edit mode
- [ ] Quick actions отзывчивые
- [ ] Haptic feedback при drop

**Desktop:**
- [ ] Mouse drag плавный
- [ ] Keyboard navigation полная
- [ ] Hover states корректные

### Accessibility

- [ ] VoiceOver/TalkBack читает виджеты
- [ ] Keyboard-only навигация возможна
- [ ] Focus visible во всех состояниях

---

## 🤖 AI Context (Technical Specs)

### ❌ Anti-Patterns (DO NOT)

1. **НЕ использовать** внешние библиотеки (react-dnd, react-grid-layout)
2. **НЕ класть** всё в один файл — строго 1 виджет = 1 файл
3. **НЕ использовать** inline styles — только Tailwind + BEM CSS
4. **НЕ мутировать** state напрямую — только через actions
5. **НЕ использовать** localStorage напрямую — только `HEYS.store.get/set` (cloud sync!)
6. **НЕ дублировать** логику из `heys_day_v12.js` — использовать HEYS.* modules
7. **НЕ использовать** `HEYS.switchTab()` — только `window.HEYS.App.setTab()`
8. **НЕ включать** DnD без edit mode — иначе конфликт со swipe

### 🔑 Key Patterns

#### Visual Design Pattern (Консистентность + Уникальность)

```javascript
// Паттерн: Widget Shell (единая структура для всех виджетов)
function renderWidgetShell(type, icon, title, content, className = '') {
  return React.createElement('div', { 
    className: `widget widget--${type} ${className}`,
  },
    // Header — единый для всех виджетов
    React.createElement('div', { className: 'widget__header' },
      React.createElement('span', { className: 'widget__icon' }, icon),
      React.createElement('span', { className: 'widget__title' }, title)
    ),
    
    // Body — уникальное содержимое виджета
    React.createElement('div', { className: 'widget__body' },
      content
    )
  );
}

// Использование:
// Калории 🔥 — gradient progress bar (уникально)
renderWidgetShell('kcal', '🔥', 'Калории',
  React.createElement('div', { className: 'widget__progress-bar' },
    React.createElement('div', { 
      className: 'widget__progress-fill',
      style: { width: `${pct}%` } // Gradient background в CSS
    })
  )
);

// Вода 💧 — circular ring (уникально)
renderWidgetShell('water', '💧', 'Вода',
  React.createElement('svg', { className: 'widget__ring', viewBox: '0 0 100 100' },
    React.createElement('circle', { 
      cx: 50, cy: 50, r: 40,
      strokeDasharray: `${pct * 2.51} 251`, // 2πr = 251
      className: 'widget__wave' // Wave animation в CSS
    })
  )
);
```

**Объяснение**:
- **Shell** (консистентность) — единая структура `.widget__header + .widget__body`
- **Type class** (уникальность) — `.widget--kcal` имеет `border-top: 3px solid orange`, `.widget--water` имеет `blue`
- **Unique content** (уникальность) — калории используют linear bar, вода использует circular ring
- **CSS animations** (уникальность) — wave у воды, gradient fill у калорий

---

#### Widget Registration Pattern

```javascript
// Паттерн: Регистрация виджета (widget_kcal.js)
(function(global) {
  'use strict';
  const HEYS = global.HEYS;
  const React = global.React;
  
  function renderKcalWidget(container, widget, state) {
    const { day, profile, computed } = state;
    const eaten = computed.dayTot?.kcal || 0;
    const optimum = computed.optimum || 2000;
    const ratio = eaten / optimum;
    const color = HEYS.ratioZones.getGradientColor(ratio);
    
    const el = renderWidgetShell('kcal', '🔥', 'Калории',
      React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'widget__progress-bar' },
          React.createElement('div', { 
            className: 'widget__progress-fill',
            style: { width: `${Math.min(100, ratio * 100)}%` }
          })
        ),
        React.createElement('div', { className: 'widget__value' },
          `${Math.round(eaten)} / ${Math.round(optimum)} ккал`
        ),
        widget.settings?.showRemaining && ratio < 1 &&
          React.createElement('div', { className: 'widget__remaining' },
            `Осталось: ${Math.round(optimum - eaten)} ккал`
          )
      )
    );
    
    ReactDOM.render(el, container);
  }
  
  // Register on load
  if (HEYS.Widgets?.registry) {
    HEYS.Widgets.registry.register('kcal', {
      type: 'kcal',
      name: 'Калории',
      icon: '🔥',
      category: 'nutrition',
      sizes: ['wide', 'compact'],
      defaultSize: 'wide', // wide т.к. horizontal bar требует полной ширины
      settings: {
        showRemaining: { type: 'boolean', default: true, label: 'Показать остаток' },
      },
      render: renderKcalWidget,
      onClick: () => window.HEYS.App?.setTab?.('stats'),
    });
    console.log('[widget_kcal] ✅ Registered');
  }
})(window);

// Паттерн: Immutable state update
HEYS.Widgets.actions.moveWidget = function(id, x, y) {
  const state = HEYS.Widgets.state;
  const oldLayout = state.layout;
  
  // Push to history (undo)
  state.history.push(JSON.parse(JSON.stringify(oldLayout)));
  if (state.history.length > 20) state.history.shift();
  state.future = []; // Clear redo stack
  
  // Immutable update
  state.layout = oldLayout.map(w => 
    w.id === id ? { ...w, x, y } : w
  );
  
  // Emit event
  HEYS.Widgets.events.emit('widget:moved', { id, x, y });
  
  // Persist
  HEYS.Widgets.storage.save();
};
```

### 🎯 WOW Features

1. **iOS-style shake** в edit mode
2. **Haptic feedback** (`navigator.vibrate`)
3. **Ghost preview** при drag
4. **Confetti** на streak > 7
5. **Wave animation** в water widget
6. **Pulsing flame** в streak widget
7. **Gradient fills** по ratio
8. **Smooth undo/redo** с анимацией

---

## 📝 Notes

- **Priority**: high
- **Complexity**: L (enterprise-grade modular system)
- **Dependencies**: HEYS.ratioZones, HEYS.TDEE, HEYS.InsulinWave, HEYS.Cycle, HEYS.store
- **Related**: `heys_meal_optimizer_v1.js` (similar modular pattern)
- **Created**: 2025-12-15
- **Architecture**: Registry + Lifecycle + Event Bus + Immutable State + Cloud Sync
- **Navigation**: Заменяет "Обзор" в мобильной версии, иконка 🏠
- **Swipeable**: Да (widgets входит в SWIPEABLE_TABS)
- **DnD Protection**: Edit mode с `.no-swipe-zone`
- **Cloud Sync**: Обязательно через HEYS.store

---

## 🚀 Workflow

1. **Фаза 0** — Навигация, Data Layer, CSS Foundation
2. **Фаза 1** — Core Engine (Grid, DnD, State)
3. **Фаза 2** — Widget Framework (Registry, Base, Events)
4. **Фаза 3** — 10 Production Widgets
5. **Фаза 4** — UI (Catalog, Settings, Presets)
6. **Фаза 5** — Advanced (Undo/Redo, Keyboard, A11y)
7. **After**: Archive to `docs/tasks/archive/`
