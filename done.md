# ✅ DONE — HEYS v2

> **Выполненные задачи** | Обновлено: 2025-12-17

---

## 🎉 Декабрь 2025

### �️ Mini-heatmap 7 дней ✅ (2025-12-17)

**Файл**: `apps/web/heys_day_v12.js` (строки 16688-16743)

- [x] **Компонент** — `.week-heatmap` с header, grid, cells
- [x] **Визуализация** — 7 дней (green/yellow/red dots)
- [x] **Streak индикатор** — показывает текущую серию
- [x] **Тултипы** — дата, статус, ratio для каждого дня
- [x] **Responsive** — адаптивная сетка для mobile
- [x] **Интеграция** — в stats секцию day_v12

### 📈 Sparkline v2 — Прогноз веса ✅ (2025-12-17)

**Файл**: `apps/web/heys_steps_v1.js` (строки 79-135)

- [x] **Линейная регрессия** — slope по 14-дневной истории
- [x] **Прогноз** — вес через 2 недели с weekly change
- [x] **Визуализация** — forecast точки в weight sparkline
- [x] **UI карточка** — `.mc-weight-forecast` с прогнозом
- [x] **Формула** — `forecastWeight = intercept + slope × 14`

### 📊 Data Overview для куратора ✅ (2025-12-17)

**Файл**: `apps/web/heys_data_overview_v1.js` (229 строк)

- [x] **Модуль** — `HEYS.DataOverviewTab` компонент
- [x] **Таблица** — список дней с ключевыми метриками
- [x] **Навигация** — клик по дню → переход в DayTab
- [x] **Empty state** — подсказка когда нет данных
- [x] **Интеграция** — в `heys_app_v12.js` (строки 5737-5738)

### 📷 Фото еды Upload ✅ (2025-12-17)

**Файл**: `apps/web/heys_storage_supabase_v1.js` (строки 4789-4950)

- [x] **Bucket** — `meal-photos` в Supabase Storage
- [x] **Upload функция** — `cloud.uploadPhoto(base64, clientId, date, mealId)`
- [x] **Pending queue** — offline фото сохраняются локально
- [x] **Photo viewer** — просмотр фото в `heys_day_v12.js`
- [x] **Delete** — удаление фото с confirm
- [x] **Integration** — в MealCard с photo thumbnails

### 🍽️ Insulin Wave — Food Form & Resistant Starch ✅ (2025-12-17)

**Файл**: `apps/web/heys_insulin_wave_v1.js`

- [x] **LIQUID_FOOD** — константы и паттерны (строка 155)
- [x] **FOOD_FORM_BONUS** — жидкое/обработанное/цельное (строка 672)
- [x] **RESISTANT_STARCH_BONUS** — охлаждённые крахмалы (строка 687)
- [x] **Детекция** — `isLiquidFood()`, `getFoodForm()` автоматически
- [x] **UI** — показывается в MealCard insulin wave breakdown
- [x] **Расчёт** — волна учитывает форму пищи (−15% для resistant starch)

### �🔄 Refeed Day (Загрузочный день) ✅ (2025-12-17)

**Файл**: `apps/web/heys_refeed_v1.js` (v1.3.3, 785 строк) | **Стили**:
`styles/modules/710-refeed.css`

- [x] **Модуль** — константы (REFEED_BOOST_PCT 35%, REFEED_OK_RATIO 1.35,
      thresholds)
- [x] **Причины** — 4 типа (deficit 💰, training 💪, holiday 🎉, rest 🧘)
- [x] **Зоны выполнения** — refeed_under/ok/over/binge (70-135% = зелёный
      streak)
- [x] **React компоненты** — RefeedDayStepComponent, RefeedCard, RefeedBadge,
      RefeedToggle
- [x] **Шаг в чек-ине** — автоматическая регистрация в HEYS.StepModal, toggle
      Да/Нет, выбор причины
- [x] **Интеграция day_v12** — toggle в goal progress (строка 13984), card в
      статистике (18054)
- [x] **Утилиты** — getRefeedZone, shouldRecommendRefeed, getRefeedOptimum,
      isStreakPreserved, getHistoryStats, getDayMeta (единая точка правды)
- [x] **Советы** — 5 типов (recommended, in_progress, completed, over, missed)
- [x] **API хелперы** — renderRefeedToggle, renderRefeedCard, renderRefeedStats
- [x] **Документация** — DATA_MODEL_REFERENCE.md (строки 535-650)
- [x] `pnpm build` PASS ✅

**Архив**:
[2025-12-12-refeed-day-checkin.md](./docs/tasks/2025-12-12-refeed-day-checkin.md)

### 🌐 Shared Products + модерация ✅ (2025-12-17)

- [x] **Database** — `shared_products`, `shared_products_blocklist`,
      `shared_products_pending` таблицы
- [x] **VIEW** — `shared_products_public` с `is_mine` флагом, скрывает
      `created_by_user_id`
- [x] **RLS** — SELECT всем, INSERT authenticated, UPDATE автору, DELETE
      куратор/автор
- [x] **Fingerprint** — SHA-256 дедупликация, `normalizeProductName()` (ё→е,
      lowercase)
- [x] **Storage Layer** — 10 cloud методов (search, publish, delete, pending
      CRUD, blocklist)
- [x] **UI подвкладки** — «👤 Продукты клиента» и «🌐 Общая база»
- [x] **Переключатель источника** — 👤 Мои / 🌐 Общие / 👤+🌐 Оба
- [x] **Pending** — заявки от PIN-клиентов, Approve/Reject в curator режиме
- [x] **Кнопки действий** — ➕ клонировать, 🚫 скрыть (blocklist), 🗑️ удалить
- [x] **Автоклонирование** — `HEYS.products.addFromShared()` при добавлении в
      приём
- [x] **Поиск shared** — в модалке создания продукта с вычислением `kcal100`
- [x] `pnpm build` PASS ✅

**Архив**:
[2025-12-16-shared-products-DONE.md](./docs/tasks/archive/2025-12-16-shared-products-DONE.md)

### 🎛️ Вкладка-конструктор виджетов (Widgets Dashboard) ✅ (2025-12-15)

- [x] **Phase 0: Foundation** — CSS (730-widgets-dashboard.css), JS modules
      wiring
- [x] **Phase 1: Core Engine** — Grid Engine (2 columns), DnD Manager, State
      Manager
- [x] **Phase 2: Widget Framework** — Registry (10 types), Events pub/sub, Data
      layer
- [x] **Phase 3-4: Widgets + UI** — 10 виджетов (calories, water, sleep, streak,
      weight, steps, macros, insulin, heatmap, cycle)
- [x] **CatalogModal** — категории (nutrition, health, motivation, advanced)
- [x] **SettingsModal** — выбор размера (compact, wide, tall, large)
- [x] **WidgetsTab** — основной контейнер с edit mode toggle
- [x] **Phase 5: Advanced** — Undo/Redo (20 steps), Keyboard (Escape, Ctrl+Z),
      Presets (minimal, balanced, fitness, detailed)
- [x] **PWA precache** — все модули в sw.js
- [x] **Navigation** — SWIPEABLE_TABS, swipe блокировка в edit mode
- [x] `pnpm type-check && pnpm build` PASS ✅

### 💰 Caloric Debt → Optimum Integration ✅ (2025-12-12)

- [x] **Phase 1 — UI Display** — `displayOptimum` используется в 3/4 местах
      отображения
- [x] **Phase 2 — Progress Bar** — "бонусная зона" со штриховкой,
      `displayRemainingKcal`
- [x] **Stats карточка "Осталось"** — использует `displayRemainingKcal` с inline
      цветом
- [x] **Popup метрик** — использует `displayOptimum` и `displayRemainingKcal`
- [x] **Phase 3 — Пояснение в карточке долга** — контекстный текст для
      пользователя
- [x] **Phase 4 — Streak логика** — решено НЕ менять (streak на базовом
      `optimum`)
- [x] **Документация** — DATA_MODEL v3.14.0, секция "Caloric Debt"
- [x] `pnpm build` PASS ✅

### 🏋️ Training Context для инсулиновой волны ✅ (2025-12-11)

- [x] **10 типов контекста** — peri, post, pre, steps, morning, double, fasted,
      strength_protein, cardio_simple, none
- [x] **PERI-WORKOUT** — еда во время тренировки → волна до -60%, harm ×0.5
- [x] **POST-WORKOUT v3.5.0** — kcal-based waveBonus (1000+ ккал → -60%),
      прогрессивное окно до 6ч
- [x] **PRE-WORKOUT v3.5.4** — harmMultiplier 0.6/0.8 (еда ДО тренировки снижает
      вредность)
- [x] **Postprandial Exercise v3.5.1** — бонусы удвоены, proximityBoost ×1.5,
      kcalBoost ×1.5
- [x] **Formula fix v3.5.2** — multiplicative vs additive для activityBonuses
- [x] **UI v3.5.3** — `renderActivityContextBadge()` переиспользуемый хелпер,
      бейджи в 2 местах
- [x] **Meal Quality Score бонусы** — +3 peri, +2 post, +1 pre за тайминг
      тренировки
- [x] **nightPenaltyOverride** — отмена ночного штрафа после тренировки
- [x] **Smart Hints** — контекстные подсказки в пустых карточках приёмов пищи
- [x] **Документация** — DATA_MODEL v3.11.0, полная секция Training Context
- [x] `pnpm build` PASS ✅

### 🌸 Трекинг менструального цикла ✅ (2025-12-08)

- [x] **Модель данных** — `cycleDay` в DayRecord, `cycleTrackingEnabled` в
      Profile
- [x] **Шаг в утреннем чек-ине** — CycleStepComponent с выбором дня 1-7
- [x] **Модуль heys_cycle_v1.js** — getCyclePhase, getKcalMultiplier,
      getWaterMultiplier, getInsulinWaveMultiplier
- [x] **Коррекция норм воды** — cycleBonus в waterGoalBreakdown
- [x] **Коррекция инсулиновой волны** — фактор #26 (cycleBonusValue +12-15%)
- [x] **7 специальных советов** — cycle_sweet_craving, cycle_iron_important,
      cycle_rest_ok и др.
- [x] **Визуализация в календаре** — розовые точки на днях с cycleDay
- [x] **CycleCard в статистике** — фаза, день, корректировки
- [x] **Документация DATA_MODEL** — версия 2.0.0, секция "Менструальный цикл"
- [x] `pnpm type-check && pnpm build` PASS ✅

### Инсулиновая волна — предупреждение при приёме ✅ (2025-12-07)

- [x] **Предупреждение при первом скролле** — проверка активной волны через
      `HEYS.InsulinWave.calculate()`
- [x] **UI с виджетом** — `renderProgressBar` + текстовый fallback
- [x] **Edge cases** — первый приём, редактирование, bulk mode, ночные часы
- [x] **Analytics** — `insulin_wave_warning` с action show/wait/continue
- [x] **UX polish** — min-h-11 для touch targets, Escape keyboard handler
- [x] `pnpm build` PASS ✅

### DayTab Stability P0 ✅ (2025-12-03)

- [x] **React.memo** — ProductRow, MealCard, AdviceCard
- [x] **useCallback** — setGrams, removeItem, removeMeal, updateMealTime,
      changeMealType, changeMealMood/Wellbeing/Stress
- [x] **Advice handlers** → useCallback
- [x] **Guard findIndex === -1** — защита от крашей при рендере
- [x] **Функциональный setDay** — addMeal, addProductToMeal
- [x] `pnpm build` и `pnpm lint` пройдены ✅

> Остаточные замыкания (trainings/water/household) — P3, низкий приоритет

---

## 🎉 Ноябрь 2025

### Phase 0: UX Foundation ✅

- [x] **Skeleton Loading** — shimmer animations для продуктов/дня (уже было)
- [x] **Haptic Feedback** — вибрация для add/remove/swipe actions (уже было)
- [x] **ErrorBoundary** — graceful fallback UI с кнопкой перезагрузки
- [x] **Confetti Effect** — celebration на streak/perfect day (уже было)
- [x] **Glassmorphism Modals** — blur(20px) + rgba фон + dark theme

### Quick Tasks ✅

- [x] **Micro-animations** — продукт "влетает" с зелёной подсветкой (fly-in +
      scale bounce)
- [x] **Training Type Picker** — уже реализован (cardio/strength/hobby с
      иконками)
- [x] **Swipe Haptic** — уже реализован (20+ мест с haptic feedback)

### Advice Module

- [x] **Advice Module Phase 2** — +26 советов → **103 total** (2025-11-29)
- [x] **Advice FAB + Panel** — 💡 кнопка, swipe-to-dismiss, 10 вау-эффектов
- [x] **Advice Module Expansion** — +21 совет → 77
- [x] **Toast v2** — сезонные, correlations, emotional
- [x] **Advice helpers Phase 0** — все 12 helpers

### UI/UX

- [x] **Тренд веса** — спарклайн + корреляция kcal↔weight (🎯⚠️🤔💪)
      (2025-11-29)
- [x] **Порции продуктов** — "1 яйцо = 60г", 25+ авто-порций, smart initial,
      haptic (2025-11-29)
- [x] **Training Modal** — 2-step, wheel picker
- [x] **Mobile Meal Cards** — базовый UI v2.7
- [x] **CSS Refactoring** — -173 строки
- [x] **Карточки-метрики** — 5 hero cards
- [x] **Mobile UX Phase 3**

### Code Quality

- [x] **threat-detection** — удалено 3000 строк + mock bridge
- [x] **Удалены dead packages** — ~2500 строк
- [x] **Script order** — models → advice → day ✓
- [x] **Toast v2 промпт** → archive

### Refactoring

- [x] **Day v12 Phases 2-4** — -383 строки (heys_day_utils, hooks, pickers)
- [x] **Навигационные карты** — удалены ~350 строк
- [x] **Root cleanup** — 77→5 MD файлов

<details>
<summary>📜 Более ранние задачи</summary>

- Structural Refactoring
- Mobile UX Foundation
- PWA Setup
- levels.config.js
- @heys/shared/ui/web fixes
- Code Quality Cleanup
- batch-файлы удалены

</details>

---

## 📊 Статистика

| Метрика                 | Значение   |
| ----------------------- | ---------- |
| Советов в модуле        | **103**    |
| Удалено строк кода      | **~8000+** |
| Архивированных промптов | **10+**    |

---

📁 [docs/tasks/archive/](./docs/tasks/archive/) — архив промптов
