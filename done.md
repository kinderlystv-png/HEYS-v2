# ✅ DONE — HEYS v2

> **Выполненные задачи** | Обновлено: 2025-12-08

---

## 🎉 Декабрь 2025

### 🌸 Трекинг менструального цикла ✅ (2025-12-08)
- [x] **Модель данных** — `cycleDay` в DayRecord, `cycleTrackingEnabled` в Profile
- [x] **Шаг в утреннем чек-ине** — CycleStepComponent с выбором дня 1-7
- [x] **Модуль heys_cycle_v1.js** — getCyclePhase, getKcalMultiplier, getWaterMultiplier, getInsulinWaveMultiplier
- [x] **Коррекция норм воды** — cycleBonus в waterGoalBreakdown
- [x] **Коррекция инсулиновой волны** — фактор #26 (cycleBonusValue +12-15%)
- [x] **7 специальных советов** — cycle_sweet_craving, cycle_iron_important, cycle_rest_ok и др.
- [x] **Визуализация в календаре** — розовые точки на днях с cycleDay
- [x] **CycleCard в статистике** — фаза, день, корректировки
- [x] **Документация DATA_MODEL** — версия 2.0.0, секция "Менструальный цикл"
- [x] `pnpm type-check && pnpm build` PASS ✅

### Инсулиновая волна — предупреждение при приёме ✅ (2025-12-07)
- [x] **Предупреждение при первом скролле** — проверка активной волны через `HEYS.InsulinWave.calculate()`
- [x] **UI с виджетом** — `renderProgressBar` + текстовый fallback
- [x] **Edge cases** — первый приём, редактирование, bulk mode, ночные часы
- [x] **Analytics** — `insulin_wave_warning` с action show/wait/continue
- [x] **UX polish** — min-h-11 для touch targets, Escape keyboard handler
- [x] `pnpm build` PASS ✅

### DayTab Stability P0 ✅ (2025-12-03)
- [x] **React.memo** — ProductRow, MealCard, AdviceCard
- [x] **useCallback** — setGrams, removeItem, removeMeal, updateMealTime, changeMealType, changeMealMood/Wellbeing/Stress
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
- [x] **Micro-animations** — продукт "влетает" с зелёной подсветкой (fly-in + scale bounce)
- [x] **Training Type Picker** — уже реализован (cardio/strength/hobby с иконками)
- [x] **Swipe Haptic** — уже реализован (20+ мест с haptic feedback)

### Advice Module
- [x] **Advice Module Phase 2** — +26 советов → **103 total** (2025-11-29)
- [x] **Advice FAB + Panel** — 💡 кнопка, swipe-to-dismiss, 10 вау-эффектов
- [x] **Advice Module Expansion** — +21 совет → 77
- [x] **Toast v2** — сезонные, correlations, emotional
- [x] **Advice helpers Phase 0** — все 12 helpers

### UI/UX
- [x] **Тренд веса** — спарклайн + корреляция kcal↔weight (🎯⚠️🤔💪) (2025-11-29)
- [x] **Порции продуктов** — "1 яйцо = 60г", 25+ авто-порций, smart initial, haptic (2025-11-29)
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

| Метрика | Значение |
|---------|----------|
| Советов в модуле | **103** |
| Удалено строк кода | **~8000+** |
| Архивированных промптов | **10+** |

---

📁 [docs/tasks/archive/](./docs/tasks/archive/) — архив промптов
