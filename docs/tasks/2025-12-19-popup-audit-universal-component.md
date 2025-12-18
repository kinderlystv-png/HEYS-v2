# Аудит попапов и универсальный компонент

## 📌 TL;DR

- **Цель:** Провести полный аудит всех всплывающих окон и спроектировать
  архитектуру с разделением на Modal (тяжёлые) и Popup (лёгкие).
- **Что делаем:**
  1. Собрать список всех всплывающих окон и разбить на категории.
  2. Разделить на 2 слоя: Modal (StepModal, Confirm) и Popup (info, context).
  3. Расширить существующий ModalManager для поддержки слоёв.
  4. Создать UniversalPopup для лёгких попапов (info, context, tooltip).
  5. Подготовить план миграции (какие попапы переносить первыми).
- **Зачем:** уменьшить дублирование кода, повысить консистентность UX, упростить
  поддержку и устранение багов, сократить bundle.
- **Время:** ~2–3 часа (аудит + дизайн API + план миграции; миграция отдельно).

## 🏗️ Архитектура: Modal vs Popup

### Ключевое разделение

| Характеристика     | **Modal (layer: modal)**               | **Popup (layer: popup)**                    |
| ------------------ | -------------------------------------- | ------------------------------------------- |
| Примеры            | StepModal, ConfirmModal, showModal     | sparklinePopup, tdeePopup, mealQualityPopup |
| Компонент          | StepModal, ConfirmModal (существующие) | **UniversalPopup (новый)**                  |
| Размер             | Большой / fullscreen                   | Маленький / средний                         |
| Позиция            | Центр экрана                           | У элемента (anchor) или центр               |
| Блокировка скролла | ✅ Да                                  | ❌ Нет                                      |
| Trap Focus         | ✅ Да (a11y)                           | ❌ Нет                                      |
| Backdrop           | ✅ Да (затемнение)                     | ⚪ Прозрачный/лёгкий                        |
| z-index            | 1000+                                  | 500-900                                     |
| Swipe to dismiss   | ✅ Да                                  | ⚪ Опционально                              |

### Логика приоритетов в ModalManager

```
ModalManager.register(id, closeFn, { layer: 'modal' | 'popup' })

Открытие Modal:
  → Закрывает все Popup
  → Закрывает другие Modal (одна Modal на экране)

Открытие Popup:
  → Закрывает другие Popup
  → НЕ трогает открытый Modal

Modal открыт:
  → Popup блокируются (не открываются поверх Modal)
```

### Существующий ModalManager (heys_modal_manager_v1.js)

Уже реализован и интегрирован в:

- ✅ StepModal (line 864-865)
- ✅ ConfirmModal (line 185-186)

**Нужно расширить** для поддержки слоёв (layer) — см. план работ.

## 🎯 Цели и рамки

- Полный перечень всплывающих окон с привязкой к файлам и категориям.
- Разделение на Modal (тяжёлые) и Popup (лёгкие) с чёткими критериями.
- Расширение ModalManager для слоёв и приоритетов.
- Создание UniversalPopup компонента для лёгких попапов.
- План миграции: порядок, риски, quick wins.

## 🗂 Категории всплывающих окон

### 🔵 Modal Layer (тяжёлые — существующие компоненты)

- **Wizard/Step:** многошаговые процессы → `StepModal`
  - Утренний чек-ин, создание тренировки, добавление приёма пищи
  - showAddMealModal, showEditMealModal, showEditMoodModal
- **Confirm:** подтверждения действий → `ConfirmModal`
  - Удаление, опасные операции
- **Form (большие):** создание/редактирование сущностей
  - showModal (продукт) в heys_core_v12.js
  - mergeModal (конфликт продуктов)

### 🟢 Popup Layer (лёгкие — для UniversalPopup)

- **Info:** только отображение, без действий
  - sparklinePopup (4 варианта: kcal, weight, steps, water)
  - tdeePopup, metricPopup, goalPopup
  - tefInfoPopup, debtSciencePopup
  - zoneFormulaPopup, householdFormulaPopup
  - showWaveCalcPopup (расчёт инсулиновой волны)
- **Context (anchor):** карточки у элемента
  - macroBadgePopup, mealQualityPopup
  - weekNormPopup, weekDeficitPopup, balanceDayPopup
- **Tooltip:** мини-подсказки
  - showWaterTooltip (формула воды)
- **Form (мини):** быстрый ввод
  - showTimePicker, showTrainingPicker, showZonePicker
  - showSleepQualityPicker, showDayScorePicker
  - showWeightPicker, showDeficitPicker
  - editGramsTarget (редактирование граммовки)
- **Panel/Expanded:** раскрывающиеся панели
  - optimizerPopupOpen (рекомендации MealOptimizer)

### ⚪ НЕ попапы (inline expandable)

Эти состояния НЕ нужно трогать — они раскрываются inline:

- totalsExpanded, insulinExpanded, balanceCardExpanded
- ndteExpanded, adviceExpanded

## � Полная таблица всплывающих окон

### Modal Layer (существующие компоненты)

| Имя                       | Файл                       | Компонент    | Особенности            |
| ------------------------- | -------------------------- | ------------ | ---------------------- |
| Утренний чек-ин           | heys_morning_checkin_v1.js | StepModal    | 5+ шагов, haptic       |
| Создание тренировки       | heys_day_v12.js            | StepModal    | Выбор типа, зоны       |
| Добавление приёма         | heys_meal_step_v1.js       | StepModal    | showAddMealModal       |
| Редактирование приёма     | heys_meal_step_v1.js       | StepModal    | showEditMealModal      |
| Редактирование настроения | heys_meal_step_v1.js       | StepModal    | showEditMoodModal      |
| Создание продукта         | heys_core_v12.js:405       | showModal    | Форма, валидация       |
| Конфликт продуктов        | heys_core_v12.js:427       | mergeModal   | Confirm-подобный       |
| Подтверждение действий    | heys_confirm_modal_v1.js   | ConfirmModal | danger/primary/success |

### Popup Layer (для UniversalPopup)

| Имя                    | Файл:строка  | Категория | Позиция | Backdrop | Swipe |
| ---------------------- | ------------ | --------- | ------- | -------- | ----- |
| sparklinePopup         | day_v12:4360 | info      | anchor  | ✅       | ✅    |
| macroBadgePopup        | day_v12:4363 | context   | anchor  | ✅       | ✅    |
| metricPopup            | day_v12:4366 | info      | anchor  | ✅       | ✅    |
| tdeePopup              | day_v12:4369 | info      | anchor  | ✅       | ✅    |
| mealQualityPopup       | day_v12:4372 | context   | anchor  | ✅       | ✅    |
| weekNormPopup          | day_v12:4375 | context   | anchor  | ✅       | ✅    |
| weekDeficitPopup       | day_v12:4381 | context   | anchor  | ✅       | ✅    |
| balanceDayPopup        | day_v12:4384 | context   | anchor  | ✅       | ✅    |
| tefInfoPopup           | day_v12:4387 | info      | center  | ✅       | ✅    |
| goalPopup              | day_v12:4390 | info      | anchor  | ✅       | ✅    |
| debtSciencePopup       | day_v12:4393 | info      | center  | ✅       | ✅    |
| showWaveCalcPopup      | day_v12:2200 | info      | center  | ✅       | ✅    |
| zoneFormulaPopup       | day_v12:5418 | info      | anchor  | ✅       | ❌    |
| householdFormulaPopup  | day_v12:5421 | info      | anchor  | ✅       | ❌    |
| showWaterTooltip       | day_v12:5540 | tooltip   | anchor  | ❌       | ❌    |
| showTimePicker         | day_v12:4316 | form      | bottom  | ✅       | ✅    |
| showTrainingPicker     | day_v12:4322 | form      | bottom  | ✅       | ✅    |
| showZonePicker         | day_v12:5411 | form      | bottom  | ✅       | ✅    |
| showSleepQualityPicker | day_v12:5424 | form      | bottom  | ✅       | ✅    |
| showDayScorePicker     | day_v12:5430 | form      | bottom  | ✅       | ✅    |
| showWeightPicker       | day_v12:5436 | form      | bottom  | ✅       | ✅    |
| showDeficitPicker      | day_v12:5516 | form      | bottom  | ✅       | ✅    |
| editGramsTarget        | day_v12:5386 | form      | bottom  | ✅       | ✅    |
| optimizerPopupOpen     | day_v12:2240 | panel     | inline  | ❌       | ❌    |

## �🔍 Что собрать в результате аудита

Для каждого попапа:

- Файл и функция/место вызова.
- Категория (из списка выше).
- Особенности: позиционирование (fixed/anchor), backdrop (да/нет), закрытие
  (кнопка/клик вне/escape/swipe), есть ли формы, нужны ли trapFocus/autoFocus,
  анимации, размеры, mobile-специфика.
- Повторяемые паттерны: swipe, кнопки закрытия, backdrop, блокировка скролла,
  фокус-менеджмент.
- Известные баги/UX-долг (если есть).

## 🛠 Требования к UniversalPopup (для Popup Layer)

**НЕ трогаем:** StepModal, ConfirmModal — они уже работают хорошо.

**Создаём UniversalPopup** для лёгких попапов (info, context, tooltip,
mini-form):

- Пресеты: `info`, `context`, `tooltip`, `form`, `panel`
- Размеры: `sm` (tooltip), `md` (info/context), `lg` (form), `full` (panel)
- Позиционирование: `center`, `top`, `bottom`, `anchor` (с offset и viewport
  clamping)
- Опции: backdrop (transparent/dim), closeButton, clickOutside, swipeToDismiss,
  escapeKey
- **Интеграция с ModalManager:** `layer: 'popup'` для корректных приоритетов
- A11y: `role="dialog"`, `aria-modal="false"`, `aria-labelledby`

### API UniversalPopup

```javascript
UniversalPopup({
  // Пресет (определяет дефолты)
  preset: 'info' | 'context' | 'tooltip' | 'form' | 'panel',

  // Позиционирование
  position: 'center' | 'top' | 'bottom' | 'anchor',
  anchorEl: HTMLElement | null,  // для anchor
  offset: { x: 0, y: 8 },        // отступ от anchor

  // Содержимое
  title: string | null,
  children: ReactNode,

  // Закрытие
  onClose: () => void,
  backdrop: 'none' | 'transparent' | 'dim',  // dim = rgba(0,0,0,0.3)
  closeOnBackdrop: true,
  closeOnEscape: true,
  swipeToDismiss: true | false,
  closeButton: true | false,

  // Стили
  size: 'sm' | 'md' | 'lg' | 'full',
  className: string,

  // ModalManager интеграция
  popupId: string,  // для register/close
})
```

### Дефолты по пресетам

| Пресет  | size | position | backdrop    | closeButton | swipe |
| ------- | ---- | -------- | ----------- | ----------- | ----- |
| info    | md   | center   | dim         | ✅          | ✅    |
| context | sm   | anchor   | transparent | ❌          | ✅    |
| tooltip | sm   | anchor   | none        | ❌          | ❌    |
| form    | lg   | bottom   | dim         | ✅          | ✅    |
| panel   | lg   | bottom   | transparent | ✅          | ✅    |

## 🚦 План работ

### Фаза 1: Расширение ModalManager (30 мин)

1. Добавить поддержку `layer: 'modal' | 'popup'` в register()
2. Реализовать логику приоритетов:
   - Modal закрывает все Popup
   - Popup закрывает другие Popup, не трогает Modal
3. Добавить `hasOpenModal()` для блокировки Popup при открытом Modal

### Фаза 2: Создание UniversalPopup (1-1.5 ч)

1. Создать `heys_universal_popup_v1.js`
2. Реализовать базовый компонент с пресетами
3. Интегрировать существующие хелперы:
   - `useSwipeToDismiss` из heys_day_v12.js
   - `PopupCloseButton` из heys_day_v12.js
4. Добавить anchor-позиционирование с viewport clamping
5. Интегрировать с ModalManager (layer: 'popup')

### Фаза 3: Миграция попапов (отдельная задача)

**Quick wins (начать с этих):**

1. Info попапы (tefInfoPopup, debtSciencePopup) — простейшие, center
2. Context попапы (macroBadgePopup, weekNormPopup) — anchor, простые

**Средняя сложность:** 3. Sparkline попапы — 4 варианта, anchor 4. Form попапы
(pickers) — bottom sheet стиль

**Сложные (в конце):** 5. showWaveCalcPopup — большой, много контента 6.
optimizerPopupOpen — panel с рекомендациями

## ✅ Критерии приёмки

### Фаза 1 (ModalManager)

- [ ] `ModalManager.register(id, closeFn, { layer })` работает
- [ ] Modal закрывает все Popup при открытии
- [ ] Popup не закрывает открытый Modal

### Фаза 2 (UniversalPopup)

- [ ] 5 пресетов работают с корректными дефолтами
- [ ] Anchor-позиционирование не выходит за viewport
- [ ] Backdrop click, Escape, Swipe закрывают попап
- [ ] Интеграция с ModalManager (layer: 'popup')

### Фаза 3 (Миграция)

- [ ] Минимум 5 попапов мигрированы на UniversalPopup
- [ ] Визуальное соответствие оригиналу
- [ ] Нет регрессий в UX

## 🧪 Что НЕ делаем в этом промпте

- ❌ Не трогаем StepModal, ConfirmModal — они работают
- ❌ Не мигрируем все попапы сразу — только план и базовый компонент
- ❌ Не меняем визуал существующих попапов

## 📎 Существующие хелперы (переиспользовать)

В `apps/web/heys_day_v12.js`:

- `PopupWithBackdrop` (lines ~3523-3541) — обёртка с backdrop click
- `useSwipeToDismiss` (lines ~3543-3555) — хук для swipe-to-dismiss
- `PopupCloseButton` (lines ~3557-3567) — кнопка закрытия

В `apps/web/heys_modal_manager_v1.js`:

- `ModalManager.register(id, closeFn)` — регистрация модалки
- `ModalManager.closeAll(exceptId)` — закрытие всех
- `ModalManager.close(id)` — закрытие конкретной

Стайлгайд: Tailwind + BEM (`styles/heys-components.css`)
