# HEYS Insights — Compact Production Summary (16.02.2026, v4.2.0)

> Минимальный рабочий summary: что сделано, что осталось, и каталог C1–C41.

---

## 1) Что сделано (коротко)

### ✅ Реально завершено в production

#### Core Insights Platform

- Predictive Insights стабильно работает в production.
- 41 паттерн C1–C41 активны через `patternModules` + `pi_patterns.js`.
- Adaptive Thresholds v2.0 стабилизированы (cache-first/cascade, adaptive TTL,
  graceful fallback).
- Health Score синхронизирован (engine ↔ debugger UI), веса нормализованы до
  суммы 1.0.
- Advanced Confidence Layer v3.5.0 внедрён:
  - `pi_stats.js` = 27 функций;
  - добавлены `bayesianCorrelation`, `confidenceIntervalForCorrelation`,
    `detectOutliers`;
  - `pi_stats.test.js` — 131 тест, pass.
- Rollout confidence завершён для 9/9 correlation-паттернов.
- Технический cleanup выполнен (`correlation_helper.js`, `pi_data.js`, runtime
  cleanup `pi_math.js`).
- Verification Logging стандартизован и используется в PI-модулях.

#### Фаза 1 — Стабилизация (реально выполнено)

- Покрытие correlation-паттернов тестами доведено (ядро Advanced Confidence +
  edge cases).

#### Фаза 2 — Early Warning System v4.0 (полностью завершено 16.02.2026)

**Backend (`pi_early_warning.js` v20, 3160 LOC)**

- **25 типов предупреждений**: Health Score decline, Status decline, Sleep debt,
  Caloric debt, Weight spike, Hydration deficit, Logging gap, Protein deficit,
  Stress accumulation, Meal skip pattern, Binge risk, Mood decline, Pattern
  degradation (low scores C1-C41), Training without recovery, Weight plateau,
  Weekend pattern, и др.
- **Dual-Mode архитектура**:
  - `mode: 'acute'` (10 checks, 7 дней) для badge — оперативные риски
  - `mode: 'full'` (25 checks, 30 дней) для insights — полный аудит
- **v3.1 Enterprise Features**:
  - Priority Queue: severity × frequency × health_impact ranking
  - Trends Tracking: частота warnings за 14/30 дней, chronic warnings detection
  - Actionable Steps: 2-3 конкретных действия для каждого warning type
  - Health Impact Scores: 0-100 для приоритизации (SLEEP_DEBT=95, STRESS=90,
    etc.)
- **Pipeline Logging Standard**: единый фильтр `ews /` для всего lifecycle
  (start → input → compute → result → ui)

**UI/Integration (4 файла)**

- **Header Badge** (`heys_app_shell_v1.js` v11): 7 дней, acute mode, компактный
  индикатор с count
- **Insights Card** (`pi_ui_dashboard.js` v12): 30 дней, full mode, полный аудит
- **Warning Panel** (`heys_early_warning_panel_v1.js` v16): mode-aware headers
  (⚡ vs 📊), severity groups, actionable advice
- **Event System**: `heysShowEWSPanel` для открытия из любого контекста

**Production Results (verified 16.02.2026)**

- Badge: 1 acute warning (CALORIC_DEBT) из 10 checks на 7 днях
- Insights: 11 comprehensive warnings из 25 checks на 30 днях
- 15 checks корректно пропускаются в acute mode (`reason: 'acute_mode'`)
- Zero regressions, full backward compatibility
- Complete `ews /` logging pipeline operational

**Tests/Artifacts**

- 8 unit tests (100% passed)
- Test script: `apps/web/insights/test_ews_v3.1.js`
- Guide: `docs/EWS_V3.1_TESTING_GUIDE.md`
- Cache-bust: index.html обновлен для всех 4 файлов

#### Фаза 3 — Phenotype-Aware Thresholds (реально выполнено)

**Component:** `pi_phenotype.js` + интеграция в `pi_thresholds.js`

- Реализованы phenotype multipliers и auto-detection по 4 категориям.
- Интеграция в adaptive thresholds работает автоматически при наличии
  `profile.phenotype`.
- Unit-тесты фазы пройдены (16/16).

#### Фаза 4 — What-If Scenarios (реально выполнено)

**Component:** `pi_whatif.js`

- Реализованы action-level симуляции (10 action types) + impact matrix.
- Выдаются baseline/predicted impact, side benefits и practical tips.
- Unit-тесты фазы пройдены (13/13).

#### Фаза 5 — Meal Recommender v3.0 (реально выполнено)

**Backend:** `pi_meal_recommender.js`

- Работает 8-сценарный decision tree.
- Интегрированы паттерны Phase A/B/C (12 total).

**Product Picker:** `pi_product_picker.js`

- 11-factor scoring + history-based подбор + fallback-стратегии.

**Pattern Layer:** `pi_meal_rec_patterns.js`

- Dynamic confidence + pattern impact tracking.

**UI:** `pi_ui_meal_rec_card.js`

**Meal Recommender v3.0 — Stabilization Audit (✅ 16.02.2026)**

- **P0 Fixes**: - timing fallback: реализован guard `idealStart >= currentTime`,
  first meal fallback корректен - confidence scale: нормализация `[0.5, 1.0]`
  clamp работает
- **P1 Fixes**:
  - `patternsUsed = Object.keys(...).length` реализовано
  - MEALREC logging: полный pipeline
    (timing/macros/patterns/impact/productPicker)
- **P2 Fixes**:
  - memo comparator hardened (убрана зависимость от pIndex reference)
  - storage migration: `U.lsGet/lsSet` + backward compatibility на legacy keys
- **Pattern Expansion (✅ v3.1 — all 3 phases)**:
  - Phase A (Core, 6 patterns): C01, C02, C15 Insulin Sensitivity, C34 Glycemic
    Load, C35 Protein Distribution, C37 Added Sugar Dependency
  - Phase B (Context, 4 patterns): C06 Sleep→Hunger, C10 Fiber Regularity, C12
    Mood↔Food, C14 Nutrient Timing
  - Phase C (Micronutrients, 2 patterns): C26 Micronutrient Radar (Fe/Mg/Zn/Ca
    boost), C29 NOVA Quality (NOVA-4 penalty)
  - Итого: **12 паттернов** интегрированы в recommender + product picker

#### Фаза 6 — Status Widget + EWS Badge (✅ 16.02.2026)

- **Crash Risk Widget** (`heys_widgets_registry_v1.js`, `heys_widgets_ui_v1.js`,
  `heys_metabolic_intelligence_v1.js`): - Формула:
  `weeklyLossPercent = |slope × 7 / currentWeight| × 100` - Пороги: `>5%`
  warning, `>7%` high severity - Интеграция в widget dashboard, 2x2/4x2/4x3
  layouts - Verification logging present (`crashRisk` data computed)- **EWS
  Badge in Header** (`heys_app_shell_v1.js`):
  - Badge с count + severity indicator (⚠️)
  - Click opens Early Warning panel (`heysShowEWSPanel` event)
  - Styles: `.ews-badge*` в `styles/modules/000-base-and-gamification.css`
  - Auto-refresh on mount/date/client change- **Events**: `heysShowEWSPanel`,
    invalidation on `heys:day-updated`

#### Фаза 7 — Priority Badge Dynamic (✅ 16.02.2026)

- **Dynamic Priority Resolver** (`pi_constants.js`, `pi_ui_dashboard.js`):
  - Формула: 1. Base level по Health Score (`>=80` → LOW, `60-79` → MEDIUM,
    `40-59` → HIGH, `<40` → CRITICAL) 2. Trend boost: падение `>=10`/7д → +1
    level, `>=20` → min HIGH 3. EWS boost: `>=1` high warning → HIGH, `>=3`
    high/chronic → CRITICAL 4. Final: максимальный из трёх источников -
    Context-specific labels: `STATUS_SCORE` (Всё отлично/Обратите
    внимание/Важно/Критический), `CRASH_RISK` - Integration: `resolvedPriority`
    используется в InsightsTab рендере, фильтры работают по динамическому
    приоритету - Verification logging: `dynamic / priority-badge` pipeline
    (fallback/result)
  - Фильтры секций по `resolvedPriority` вместо static config

#### Фаза 8 — What-If UI Integration (✅ 16.02.2026)

- **Backend**: `pi_whatif.js` — 10 action types + impact matrix,
  baseline/predicted/side benefits
- **UI**: `pi_ui_whatif.js` (What-If cards + Weight Prediction) +
  `pi_ui_whatif_scenarios.js` (Scenarios Panel)
- **Dashboard Integration**: `WhatIfSection` в `pi_ui_dashboard.js`, секция
  WHAT_IF в SECTIONS_CONFIG
- Interactive панель с CTA, предсказаниями, quick presets

#### Фаза 9 — Feedback Loop (✅ 16.02.2026)

- **Backend**: `pi_feedback_loop.js` — outcome learning (satiety/energy/mood
  1-5), EMA weight adjustment (α=0.1, ±5%, range 0.5-2.0)
- **Outcome Modal**: `pi_outcome_modal.js` — UI для сбора feedback, reminder
  system (3/7/14 дней)
- **ML Integration**: `pi_product_picker.js` — ML weight multiplier from
  feedback (R2.7)
- **Dashboard**: `FeedbackWidget` + `FeedbackPrompt` в `pi_ui_dashboard.js` для
  прошлых дней
- **Analysis**: `analyzeOutcomes(profile, daysBack)` — follow rate, avg
  outcomes, positive %

#### Фаза 10 — Energy Forecast (✅ 16.02.2026)

- **Backend**: `pi_analytics_api.js` → `forecastEnergy()` — прогноз энергии на
  24ч
- Базовый циркадный профиль (Van Cauter 1997) × модификаторы
  (сон/еда/стресс/тренировка)
- Output: hourlyForecast, peakWindow, dipWindow, recommendations
- Energy Forecast секция зарегистрирована в SECTIONS_CONFIG

#### Фаза 11 — EWS v4.0 Enhancement (✅ 16.02.2026)

**Logging Pipeline Standardization**

- **Full `priority /` Logging Pipeline** (`pi_constants.js`,
  `pi_ui_dashboard.js`): - 5-step standard реализован: `🚀 start`, `📥 input`,
  `🧮 compute`, `✅ result`, `🖥️ ui` - Unified prefix `priority /` вместо
  `dynamic / priority-badge` - Все dynamic priority вычисления теперь с полной
  наблюдаемостью

**EWS Global Score (0-100)**

- **Backend** (`pi_early_warning.js` v4.0, функция `calculateEwsGlobalScore`): -
  Единый числовой индекс риска: severity × healthImpact × chronicity -
  Нормализация в 0-100 (higher = higher risk) - Interpretation bands: ≥70
  HIGH_RISK, ≥40 MEDIUM_RISK, ≥20 LOW_RISK, <20 MINIMAL_RISK - Graceful fallback
  при нет warnings (score=0) - Полный `ews / global_score` logging pipeline
  (start/input/compute/result/ui)- **Integration**: `globalScore` и
  `globalScoreBreakdown` в результат `detect()` для acute/full mode

**Cross-Pattern Causal Chains**

- **New Module** (`pi_causal_chains.js` v1.0): - Библиотека 6 причинных цепочек
  (SLEEP_STRESS_BINGE, LOGGING_PATTERN_GOAL, CALORIC_MOOD_EVENING, и др.) -
  Детектор `detectCausalChains({ warnings, patterns, trends })` - Output:
  chainId, rootCause, matchedNodes, adjustedConfidence, actionableFix,
  evidenceLevel - Confidence adjustment: boost за high severity/chronic
  warnings, penalty за неполное покрытие - Полный `ews / causal_chain` logging
  pipeline- **Integration** (`pi_early_warning.js`):
  - `causalChains` array в результат `detect()`
  - Graceful fallback если модуль не загружен
  - UI лог с топ-3 цепочками и их confidence

**Production Status**

- Версия обновлена: EWS v3.2 → v4.0
- index.html: добавлен `pi_causal_chains.js?v=1`, `pi_early_warning.js`
  cache-bust v20→v21
- Все модули без ошибок компиляции
- Backward compatible: старый код продолжает работать

#### Фаза 12 — Weekly Progress Tracking (✅ 16.02.2026)

**Backend** (`pi_early_warning.js` v4.1):

- **Weekly Aggregation Function** (`calculateWeeklyProgress`):
  - Группирует warnings по неделям (понедельник-воскресенье)
  - Сохраняет snapshot каждой недели: warningsCount, globalScore, severity
    breakdown, top-3 warnings
  - Хранение в `localStorage` (`heys_ews_weekly_v1`), последние 4 недели
- **Trend Analysis** (`determineWeeklyTrend`):
  - Вычисляет % изменение count warnings (текущая vs предыдущая неделя)
  - Статусы: `improving` (≤-15%), `stable` (±15%), `worsening` (≥+15%)
  - Direction indicators: `down`, `flat`, `up`
- **Integration**:
  - Вызов автоматический после `detectEarlyWarnings()` + global score
  - Добавлен в результат `detect()`:
    `weeklyProgress { weeks[], trend, currentWeek }`
  - Weekly snapshot updates на каждый detect run
- **Logging Pipeline**:
  - Полный `ews / weekly` pipeline (load/save/compute/trend/result/ui)
  - Console.table для 4 недель с warnings/score/severity breakdown

**Storage**:

- Key: `heys_ews_weekly_v1`
- Structure:
  `{ version: 1, weeks: [{ weekStart, weekEnd, weekNumber, year, warningsCount, globalScore, severityBreakdown, topWarnings[], lastUpdate }], lastUpdated }`
- Auto-pruning: keep only last 4 weeks

**Configuration**:

- `WEEKLY_CONFIG.WEEKS_TO_TRACK = 4`
- `WEEKLY_CONFIG.IMPROVEMENT_THRESHOLD = -15` (%)
- `WEEKLY_CONFIG.STABLE_THRESHOLD = 15` (%)

**Production Status**:

- Версия обновлена: EWS v4.0 → v4.1
- index.html: `pi_early_warning.js` cache-bust v21→v22
- Export API: добавлен `calculateWeeklyProgress` в
  `HEYS.InsightsPI.earlyWarning`
- Console message: "v4.1 loaded (25 checks + trends + priority + global score +
  weekly progress)"
- Нет ошибок компиляции, backward compatible

#### Фаза 13 — Phenotype-Aware EWS (✅ 17.02.2026)

**Backend** (`pi_early_warning.js` v44):

- **Phenotype Integration** (`getEwsThreshold`):
  - Автоматическое определение активного фенотипа из профиля
    (`insulin_resistant`, `evening_type`, `low_satiety`, `stress_eater`).
  - **Dynamic Multipliers**:
    - Fiber Target: `+20%` (IR), `+10%` (Low Satiety), `+20%` (Evening)
    - Sugar Limit: `-50%` (IR), `-30%` (Stress Eater), `-20%` (Evening)
    - Sodium Limit: `-20%` (IR), `-15%` (Evening)
    - Protein Target: `+20%` (IR), `+20%` (Low Satiety)
    - Late Meal Threshold: `-90 min` (Evening), `-30 min` (IR/Stress)
    - Stress Sensitivity: `+30%` (Stress Eater)
- **Diagnostics & DX**:
  - **Smart Detection Logging**: Сообщение `🧬 Active phenotype detected` при
    первой проверке с деталями adjustments.
  - **Quick API**: `HEYS.InsightsPI.earlyWarning.phenotype` (check, setIR,
    setEveningStress, clear) для быстрого тестирования в консоли.
  - **Cheat Sheet**: Создан `docs/EWS_PHENOTYPE_CHEAT_SHEET.md`.

**Production Status**:

- Версия обновлена: EWS v4.1 → v4.2
- index.html: `pi_early_warning.js` cache-bust v22→v44
- Verified: Логи подтверждают применение корректных порогов (Fiber 15g → 23.4g,
  etc.)

#### Фаза 14 — Section-Specific Priority Rules (✅ 17.02.2026)

**Backend** (`pi_constants.js` v4.2.0):

- **SECTION_PRIORITY_RULES** — кастомная логика приоритетов для 3 секций:
  - `STATUS_SCORE`: Инверсия логики — score≥80 → LOW (позитивный статус),
    fallback к generic для <80
  - `CRASH_RISK`: Инвертированная логика — чем выше crashRiskScore (0-100%), тем
    выше приоритет. Пороги: >60%→CRITICAL, >30%→HIGH, >15%→MEDIUM. Релевантные
    warnings: SLEEP_DEBT, STRESS_ACCUMULATION, BINGE_RISK, CALORIC_DEBT
  - `PRIORITY_ACTIONS`: Зависит от количества срочных действий — ≥3
    urgent→CRITICAL, ≥1 urgent→HIGH, ≥1 any→MEDIUM, 0→LOW
- **Рефакторинг `computeDynamicPriority`**:
  - Проверка `SECTION_PRIORITY_RULES[sectionId]` перед generic формулой
  - Расширенная сигнатура: `options.crashRiskScore`,
    `options.urgentActionsCount`, `options.actionsCount`
  - Полный logging pipeline для custom (`rule: 'custom'`) и generic
    (`rule: 'generic'`) путей
- **PRIORITY_CONTEXT_LABELS.PRIORITY_ACTIONS** добавлен:
  `{ LOW: 'Нет срочных', MEDIUM: 'Рекомендации', HIGH: 'Внимание!', CRITICAL: 'Критически 🔥' }`

**UI Integration** (`pi_ui_dashboard.js` v13):

- **3 динамических приоритета**:
  - `statusSectionPriority` — на базе `healthScore.total` (было)
  - `crashRiskPriority` — на базе warnings (temporary: crashRiskScore прокинут
    как null)
  - `actionsPriority` — на базе количества high-warnings (≥1 → HIGH)
- **PriorityBadge** добавлен для обеих новых секций:
  - `CRASH_RISK` — с `PRIORITY_CONTEXT_LABELS.CRASH_RISK` ("Низкий риск" /
    "Критический риск")
  - `PRIORITY_ACTIONS` — с `PRIORITY_CONTEXT_LABELS.PRIORITY_ACTIONS` ("Нет
    срочных" / "Критически 🔥")
- **Динамические CSS-классы**: `insights-tab__section--critical/high/medium/low`
  для всех 3 секций
- **Удален hardcode**: `shouldShowSection('CRITICAL')` заменен на
  `shouldShowSection(crashRiskPriority)` и `shouldShowSection(actionsPriority)`

**Production Status**:

- Версия обновлена: pi_constants v7 → v42, pi_ui_dashboard v12 → v13
- index.html: cache-bust для обоих файлов
- Generic формула остается fallback для 9 секций без custom rules
- ✅ **P1 #6 Crash Risk Score Integration** — `CRASH_RISK` dynamic priority
  подключён через EWS warnings (SLEEP_DEBT, STRESS, CALORIC_DEBT, BINGE_RISK).
  Hardcode `shouldShowSection('CRITICAL')` убран, `PriorityBadge` с
  `PRIORITY_CONTEXT_LABELS.CRASH_RISK` активен. Реальный numeric
  `crashRiskScore` из `MetabolicQuickStatus` как input — отложен в P2 (текущий
  fallback: `null`)

#### Фаза 15 — Priority Formula: Acuteness Decay + Pattern Degradation (✅ 18.02.2026)

**Backend** (`pi_constants.js` v4.3.0):

- **#11 EWS Warning Acuteness Decay** — CRASH_RISK custom rule перешёл с
  `highCount >= 1` на `weightedHighSum`:
  - `decay = max(0.3, 1 - (days - 3) / 27)` — warning с 7-дневным окном весит
    0.85, 25-дневным — 0.3
  - boost тԷперь: `weightedHighSum >= 0.7` → +2 (vs старое `highCount >= 1` → +2
    без dawn)
  - Логирование: `priority / 🛠️ custom_rule CRASH_RISK` с `weightedHighSum` в
    консоли
- **#12 Pattern Degradation Boost** — в generic formula добавлен 5-й источник
  boost:
  - Если ≥2 pattern с `available=true` и `score < 40` →
    `patternDegradationBoost = 1`
  - Итог: `maxBoost = max(trendBoost, warningsBoost, patternDegradationBoost)`
  - `computeDynamicPriority` теперь принимает `options.patterns: Pattern[]`
- **JSDocs/logging**: `compute (generic)` лог теперь показывает
  `patternDegradationBoost` и `degradedPatterns` в result

**UI Integration** (`pi_ui_dashboard.js` v19):

- `statusSectionPriority` `useMemo` теперь передаёт
  `patterns: insights?.patterns ?? []` в `computeDynamicPriority`
- Депенденси `useMemo` расширены: добавлен `insights?.patterns`

**Production Status**:

- `pi_constants.js` v4.2.1 → v4.3.0, cache-bust v43 → v44
- `pi_ui_dashboard.js` cache-bust v18 → v19

## 2) Каталог паттернов C1–C41 (ссылка)

> Полный каталог и формулы — в runtime-файлах (см. раздел 5). Ниже — быстрый
> индекс.

### A) Nutrition & Intake

- **C1** Protein Balance
- **C2** Fiber Deficit
- **C3** Harm Load
- **C4** Late Eating
- **C5** Hydration Stability
- **C6** Sodium Overload
- **C7** Meal Timing Regularity
- **C8** Ultra-Processed Share

### B) Metabolic & Dynamics

- **C9** Energy Volatility
- **C10** Insulin Wave Risk
- **C11** Evening Overconsumption
- **C12** Glycemic Exposure
- **C13** Caloric Debt Accumulation
- **C14** Refeed Readiness

### C) Recovery & Stress

- **C15** Sleep Debt
- **C16** Circadian Drift
- **C17** Stress-Driven Eating
- **C18** Recovery Window Missed
- **C19** HRV Proxy Deterioration

### D) Adherence & Behavior

- **C20** Plan Adherence Drop
- **C21** Logging Consistency
- **C22** Weekend Drift
- **C23** Habit Fragility
- **C24** Motivation Decay

### E) Performance & Activity

- **C25** Activity Deficit
- **C26** Overtraining Proxy
- **C27** NEAT Suppression
- **C28** Training-Fuel Mismatch

### F) Composite / Predictive

- **C29** Early Warning Composite
- **C30** Plateau Probability
- **C31** Bounce-Back Potential
- **C32** Goal-Risk Score
- **C33** Retention Risk

### G) Meal Recommender Patterns

- **C34** Fast-Carb Overload (A)
- **C35** Low-Fiber Day (A)
- **C36** Sodium + Processed Combo (A)
- **C37** Evening Spike Risk (B)
- **C38** Protein Under-target (B)
- **C39** Hydration + Craving Link (B)
- **C40** Recovery Meal Opportunity (C)
- **C41** Stabilization Meal Opportunity (C)

## 3) Что осталось (единый backlog)

> Последнее обновление: 18.02.2026. **Backlog пуст.**

- **P0** — все задачи выполнены (Фазы 1–11).
- **P1** — все задачи выполнены (Фазы 12–15).

---

## 4) Инварианты (минимум)

1. Goal-weights в каждом режиме суммируются в **1.0**.
2. Для калорий в raw day-data приоритет: `savedEatenKcal`.
3. Любые изменения `pi_stats.js` → обязательный прогон тестов.
4. `pi_ui_dashboard.js` не расширять без декомпозиции.
5. Новая EWS-фича обязательна с полным `ews /` pipeline.
6. Новая MEALREC-фича обязательна с полным `MEALREC /` pipeline.
7. Новая Priority-фича обязательна с `priority /` logging.

---

## 5) Где детали

| Модуль           | Файлы                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Patterns runtime | `pi_patterns.js`, `pi_advanced.js`                                                                     |
| Thresholds       | `pi_thresholds.js`                                                                                     |
| EWS              | `pi_early_warning.js`, `pi_causal_chains.js`                                                           |
| What-If          | `pi_whatif.js`, `pi_ui_whatif.js`, `pi_ui_whatif_scenarios.js`                                         |
| Meal Rec         | `pi_meal_recommender.js`, `pi_product_picker.js`, `pi_meal_rec_patterns.js`, `pi_meal_rec_feedback.js` |
| Feedback Loop    | `pi_feedback_loop.js`, `pi_outcome_modal.js`                                                           |
| Energy Forecast  | `pi_analytics_api.js` → `forecastEnergy()`                                                             |
| Priority Badge   | `pi_constants.js` → `computeDynamicPriority()`                                                         |
| Stats/Tests      | `pi_stats.js`, `pi_stats.test.js`                                                                      |
| Debug/UI         | `pi_pattern_debugger.js`, `pi_ui_dashboard.js`                                                         |
| Orchestrator     | `heys_predictive_insights_v1.js`                                                                       |

> Все файлы: `apps/web/insights/`

---

## 6) План реализации (Execution Plan)

> Цель: закрыть P1/P2 backlog последовательно, с минимальным риском регрессий и
> обязательной наблюдаемостью (`ews /`, `MEALREC /`, `priority /`).

### Wave 3 — Personalization & UX (P1, текущий спринт)

#### 6.5 Phenotype-aware EWS

**Файлы:** `pi_early_warning.js`, `pi_phenotype.js`

**Шаги:**

1. Добавить слой `applyPhenotypeAdjustments()` для порогов/весов warning-types.
2. Поддержать graceful fallback при отсутствии phenotype.
3. Протоколировать источник корректировки (`default` / `phenotype`).

**DoD:** отсутствие phenotype не ломает EWS, корректировки воспроизводимы.

#### 6.6 Proactive PWA Notifications (opt-in)

**Файлы:** `public/sw.js`, `pi_early_warning.js`, UI settings

**Шаги:**

1. Добавить opt-in согласие пользователя.
2. Триггерить push только для high/critical событий с антиспам-правилами
   (cooldown).
3. Добавить deep-link в EWS panel.

**DoD:** уведомления отправляются только при согласии и не спамят.

---

### Wave 4 — Medium-Term (P2, после стабилизации)

#### 6.7 A/B Framework + Advanced ML + SQL Analytics

**Состав:**

1. `pi_ab_test.js`: split rules-vs-ml, метрики эффективности.
2. ML-слой: calibration/ensemble для confidence.
3. SQL analytics: `insights_recommendations`, dual-write (KV + SQL), curator
   dashboard.

**DoD:** эксперименты воспроизводимы, аналитика консистентна между KV и SQL.

#### 6.8 Priority Enhancements

**Файл:** `pi_constants.js`

1. Section-specific rules per card type.
2. Time-decay factor для trend.
3. Multi-metric fusion (score + trend + ews + pattern degradation).

**DoD:** меньше false-alarm кейсов при сохранении чувствительности к рискам.

---

### Cross-cutting Quality Gates (обязательно для каждой задачи)

1. **Logging Gate:** полный pipeline-лог по стандарту модуля.
2. **Regression Gate:** `pnpm test:run` + точечные тесты изменённых модулей.
3. **Type/Runtime Gate:** `pnpm type-check` (для TS-участков) и smoke в UI.
4. **Performance Gate:** проверка budget’ов из раздела 3/4, без деградации UX.
5. **Doc Gate:** обновление разделов 1 и 3 после закрытия каждой задачи.
