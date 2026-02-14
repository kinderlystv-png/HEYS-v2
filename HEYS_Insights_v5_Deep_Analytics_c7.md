# HEYS Insights — Compact Production Summary (актуально на 14.02.2026)

> Короткий технический саммари-файл для будущих итераций.  
> Источник истины по runtime-логике: `apps/web/insights/*`.

---

## 1) Текущий статус

- Система Predictive Insights в проде, модульная архитектура активна.
- Pattern routing реализован через `HEYS.InsightsPI.patternModules`.
- Основной “монолит” `pi_patterns.js` работает как router/fallback слой.
- Data layer и UI интегрированы (React + Patterns Modal).
- Документация синхронизирована с последними алгоритмическими фикcами Health
  Score.

---

## 2) Что уже сделано (финальное состояние)

### Краткий каталог внедрений C1–C30

Ниже — коротко, что реально внедрено по фичам/паттернам (без deep-деталей):

#### Core (1–19)

1. **Meal Timing** — контроль интервалов между приёмами пищи.
2. **Wave Overlap** — детекция перекрытия инсулиновых волн.
3. **Late Eating** — анализ поздних приёмов (вечер/ночь).
4. **Meal Quality Trend** — тренд качества рациона по дням.
5. **Sleep ↔ Weight** — связь сна и динамики веса.
6. **Sleep ↔ Hunger** — связь недосыпа и аппетита/калорий.
7. **Training ↔ Kcal** — компенсация калорий в тренировочные дни.
8. **Steps ↔ Weight** — влияние шагов на изменение веса.
9. **Protein Satiety** — белок и контроль сытости.
10. **Fiber Regularity** — клетчатка и регулярность питания.
11. **Stress Eating** — стресс как триггер переедания.
12. **Mood Food** — связь настроения и пищевого поведения.
13. **Circadian** — циркадное распределение калорий.
14. **Nutrient Timing** — тайминг нутриентов относительно активности.
15. **Insulin Sensitivity** — персональная реакция на углеводы.
16. **Gut Health** — разнообразие рациона и прокси микробиоты.
17. **Nutrition Quality** — общий баланс рациона (макро/микро).
18. **NEAT Activity** — бытовая активность вне тренировок.
19. **Mood Trajectory** — тренд настроения на горизонте 7–14 дней.

#### Advanced (20–25)

20. **Sleep Quality** — качество сна и влияние на следующий день.
21. **Wellbeing Correlation** — самочувствие vs lifestyle-факторы.
22. **Hydration** — контроль водного баланса.
23. **Body Composition** — динамика композиции тела/замеров.
24. **Cycle Impact** — влияние фаз цикла на метрики (при наличии данных).
25. **Weekend Effect** — отличия выходных от будней.

#### Deep (26–30)

26. **Micronutrient Radar** — риск дефицитов ключевых микронутриентов.
27. **Omega Balancer** — баланс omega-3/omega-6.
28. **Heart Health** — кардио-маркеры питания (Na/K и др.).
29. **NOVA Quality** — доля ультрапереработанных продуктов.
30. **Training Recovery** — баланс нагрузки и восстановления.

#### Extended (31–41)

31. **Hypertrophy** — признаки набора мышечной массы (питание + состав тела).
32. **Vitamin Defense** — радар витаминного покрытия и дефицитов.
33. **B-Complex Anemia** — B-комплекс + маркеры риска анемии.
34. **Glycemic Load** — гликемическая нагрузка приёмов/дня.
35. **Protein Distribution** — распределение белка по приёмам пищи.
36. **Antioxidant Defense** — антиоксидантная защита рациона.
37. **Added Sugar Dependency** — риск зависимости от добавленного сахара.
38. **Bone Health** — нутриенты, влияющие на здоровье костей.
39. **Training Type Match** — соответствие питания типу тренировки.
40. **Electrolyte Homeostasis** — баланс ключевых электролитов.
41. **Nutrient Density** — плотность нутриентов относительно калорий.

### Архитектура

- Вынесены тематические модули паттернов в `apps/web/insights/patterns/`:
  - `timing.js`, `sleep.js`, `activity.js`, `lifestyle.js`, `psychology.js`
  - `quality.js`, `metabolic.js`, `micronutrients.js`, `body.js`,
    `training_nutrition.js`
- `pi_patterns.js` делегирует вычисления в `patternModules` с безопасными
  fallback-ответами.

### Стабилизация данных

- React State/Store sync исправлен (namespaced storage + Store API).
- Паттерны, зависящие от enriched nutrients, считаются на полном наборе данных.

### Patterns Modal (UI)

- Таблица вкладов паттернов стабилизирована (fixed layout, корректные ширины).
- Блок quick unlock сделан сворачиваемым (collapsed by default).
- Табы 7/30 дней перенесены в header модалки.
- Название в модалке: «Паттерны».

---

## 3) Критичные алгоритмические фиксы (13.02.2026)

### A. Health Score weights (deficit)

Исправлена математика весов:

- Было:
  `nutrition=0.35, timing=0.30, activity=0.20, recovery=0.15, metabolism=0.10`
  (сумма 1.10 — ошибка)
- Стало:
  `nutrition=0.25, timing=0.30, activity=0.20, recovery=0.15, metabolism=0.10`
  (сумма 1.00)

### B. Синхронизация категорий (calc engine ↔ UI metadata)

Исправлены 6 несовпадений категорий:

- `antioxidant_defense` → `recovery`
- `bone_health` → `recovery`
- `electrolyte_homeostasis` → `recovery`
- `b_complex_anemia` → `metabolism`
- `glycemic_load` → `metabolism`
- `added_sugar_dependency` → `metabolism`

### C. Что проверено

- `getPatternReliability` идентичен в расчётном модуле и debugger UI.
- Формула вклада паттерна в UI корректна (`share * effectiveWeight`).
- Goal detection корректен (`deficit <= -10`, `bulk >= 10`, иначе
  `maintenance`).

---

## 4) Health Score (актуальная модель)

### Goal-aware веса

- **Deficit**: Nutrition 25%, Timing 30%, Activity 20%, Recovery 15%, Metabolism
  10%
- **Maintenance**: Nutrition 35%, Timing 25%, Activity 20%, Recovery 15%,
  Metabolism 5%
- **Bulk**: Nutrition 40%, Timing 20%, Activity 25%, Recovery 10%, Metabolism 5%

### Формула (концептуально)

- Категории считаются как reliability-weighted average паттернов.
- Вес категории масштабируется через reliability (effective weight).
- Итог: `total = weightedSum / totalWeight`, далее округление.

---

## 5) Инварианты для будущих изменений

1. Любое изменение category mapping делать синхронно в:
   - `pi_advanced.js` (switch-case категоризации)
   - `pi_pattern_debugger.js` (`PATTERN_METADATA`)
2. Сумма goal-weights для каждого режима всегда = **1.0**.
3. При изменении скриптов обновлять query-version в `apps/web/index.html`.
4. При изменении алгоритма — сразу отражать в `docs/DATA_MODEL_REFERENCE.md` и
   `apps/web/CHANGELOG.md`.

---

## 6) Где смотреть детали

- Runtime logic: `apps/web/insights/pi_patterns.js`,
  `apps/web/insights/pi_advanced.js`
- Pattern UI/debug: `apps/web/insights/pi_pattern_debugger.js`
- Canonical data model doc: `docs/DATA_MODEL_REFERENCE.md`
- Web changelog: `apps/web/CHANGELOG.md`

---

## 7) Топ-10 доработок (раскрытый формат)

Ниже — приоритетные направления, чтобы сделать Insights глубже, научно строже и
практичнее для ежедневного использования в HEYS.

### 1. Adaptive Personalized Thresholds ✅ v2.0 PRODUCTION

**Статус:** ✅ v2.0 в проде (валидировано логами 14.02.2026)

#### Что реализовано в v2.0

**Core module:** `apps/web/insights/pi_thresholds.js` (~989 LOC)

- ✅ **CASCADE cache-first**: 7d запросы переиспользуют 30d кэш при покрытии
  `dateRange`
- ✅ **Adaptive TTL**: динамический TTL 12–72ч через
  `calculateBehaviorStability()`
- ✅ **Event-based invalidation**: `detectSignificantChange()`
  (goal/weight/pattern events)
- ✅ **Bayesian priors**: population-informed defaults + `bayesianBlend()` для
  0–13 дней
- ✅ **Per-threshold confidence**: `thresholdsWithConfidence` для granular
  reliability
- ✅ **Graceful profile fallback**: при `profile=undefined` считаем доступные
  пороги, не падаем в полный default-mode

#### Production Validation (14.02.2026)

**Ключевые наблюдения из runtime-логов:**

- 7d → 30d: повторяющиеся `♻️ Using cached (from 30d) for 7d request` ✅
- 30d → 30d: стабильные cache hits ✅
- 59d при 30d cache: `covered: false` → корректный MISS ✅
- Adaptive TTL: `stability: 0.30 → ttlHours: 30.0` ✅

**Фактический пример лога:**

```javascript
[HEYS.thresholds.ttl] ⏰ Adaptive TTL: {stability: '0.30', ttlHours: '30.0', ttlMs: 108000000}
[HEYS.thresholds] ♻️ Using cached (from 30d) for 7d request: {
  cacheAge: '27min', adaptiveTTL: '1800min', confidence: 1
}
```

#### Edge Cases

| Case                       | Behavior                                                       |
| -------------------------- | -------------------------------------------------------------- |
| `days=59`, cache на 30d    | MISS (`covered=false`) → recompute/partial logic               |
| `profile` отсутствует      | НЕ forced-default; считаются пороги, где профиль не обязателен |
| `pIndex` отсутствует       | считаются только профиль/тайминг-зависимые пороги              |
| старый кэш без `dateRange` | безопасный MISS и пересчёт                                     |

#### Оставшийся пункт roadmap

- ⏳ **Incremental Updates (Rolling Window)** — **отложено в v2.1**
  - Причина: оптимизационный шаг, не влияет на корректность v2.0
  - Текущий baseline производительности acceptable для production

### 2. Cross-Pattern Causal Chains

- **Проблема:** паттерны анализируются по отдельности; причинные каскады не
  показываются.
- **Что внедряем:** детектор цепочек вида
  `late_eating → sleep_quality ↓ → hunger ↑ → calories ↑`.
- **Научная база:** causal inference/time-lag подходы, allostatic cascade
  концепция.
- **Имплементация:** post-processing модуль над результатами всех паттернов с
  root-cause ранжированием.
- **Практический KPI:** рост доли “понятных” инсайтов (user comprehension), выше
  конверсия в действия.

### 3. Actionable What-If Simulator

- **Проблема:** текущий What-If слишком общий (3 сценария), без конкретных
  действий пользователя.
- **Что внедряем:** сценарии уровня действия: `+20г белка на завтрак`,
  `сон +60 мин`, `без еды после 21:00`.
- **Научная база:** dynamic energy balance models (Hall et al.),
  TEF/компенсационные эффекты.
- **Имплементация:** granular simulation по паттернам и категориям Health Score,
  с отображением ожидаемого дельта-эффекта.
- **Практический KPI:** % пользователей, выбравших и выполнивших action-plan из
  симулятора.

### 4. Early Warning Signals (EWS)

- **Проблема:** система в основном реактивная; ранние сигналы срыва не
  подсвечиваются.
- **Что внедряем:** индикаторы предсрыва (рост
  variance/autocorrelation/skewness, ухудшение комплаенса).
- **Научная база:** critical slowing down / early warning signals in complex
  systems.
- **Имплементация:** отдельный EWS-скор (rolling windows 5–14 дней) и
  превентивные уведомления.
- **Практический KPI:** снижение частоты “резких провалов” недели и
  crash-сценариев.

### 5. Metabolic Phenotype Engine

- **Проблема:** фенотипизация описана концептуально, но не доведена до рабочего
  персонализатора.
- **Что внедряем:** профиль пользователя по 5 осям (гликемическая
  чувствительность, сатость, циркадный сдвиг и т.д.).
- **Научная база:** персонализированная метаболическая стратификация (PREDICT,
  chrononutrition).
- **Имплементация:** `phenotype profile` + адаптация порогов/весов паттернов под
  тип.
- **Практический KPI:** рост стабильности Health Score у пользователей с
  одинаковой дисциплиной.

### 6. Next Meal Recommender

- **Проблема:** инсайты диагностируют, но не всегда дают конкретный следующий
  шаг “что съесть сейчас”.
- **Что внедряем:** рекомендацию следующего приёма с макро-целями и примерами из
  продуктовой базы.
- **Научная база:** nutrient timing + satiety engineering + post-workout feeding
  evidence.
- **Имплементация:** real-time подбор по текущему дню (дефициты, окно
  тренировки, инсулиновая волна, цель).
- **Практический KPI:** увеличение доли целевых приёмов пищи в течение дня.

### 7. Statistical Significance Layer

- **Проблема:** ряд корреляционных паттернов интерпретируется без формальной
  оценки значимости.
- **Что внедряем:** p-value/CI/effect-size слой для correlation-инсайтов;
  разделение “сигнал” vs “шум”.
- **Научная база:** inferential statistics best-practice.
- **Имплементация:** унифицированный `statsGuard` в паттернах
  sleep/activity/psychology.
- **Практический KPI:** снижение числа ложных причинно-следственных трактовок.

### 8. Feedback Loop & Insight Accuracy Tracking

- **Проблема:** нет цикла обучения “помог/не помог” и ретроспективы по точности
  рекомендаций.
- **Что внедряем:** feedback-контур (thumbs up/down + outcome через 3/7/14
  дней).
- **Научная база:** adaptive decision support, Bayesian updating.
- **Имплементация:** хранение outcome-сигналов, пересчёт confidence и
  приоритетов рекомендаций.
- **Практический KPI:** рост полезности инсайтов по self-reported оценке и
  фактическим outcome-метрикам.

### 9. Energy Forecast (внутридневная кривая)

- **Проблема:** нет прогноза энергии на оставшуюся часть дня для тактических
  решений.
- **Что внедряем:** прогноз спадов/пиков энергии с учётом сна, тайминга еды,
  тренировки и GI-нагрузки.
- **Научная база:** two-process model of alertness + postprandial response
  dynamics.
- **Имплементация:** внутридневный forecast-график и рекомендации “preemptive
  action”.
- **Практический KPI:** снижение вечерних срывов и late-eating эпизодов.

### 10. Test Harness для статистического ядра Insights

- **Проблема:** без жёстких тестов статистики риск скрытых ошибок высок
  (корреляции, тренды, интервалы).
- **Что внедряем:** unit/contract tests для `pi_stats.js` и ключевых формул
  паттернов.
- **Научная база:** воспроизводимость и валидация вычислительных методов.
- **Имплементация:** golden datasets + regression tests + edge-case матрица.
- **Практический KPI:** снижение регрессий в аналитике и предсказуемость
  релизов.

### Рекомендуемый порядок внедрения (roadmap)

1. **Foundation:** #10 → #7
2. **Персонализация:** #1 → #5
3. **Предиктивность и практика:** #4 → #3 → #6
4. **Обучаемость системы:** #8
5. **Углубление day-planning:** #9

---

## 8) Короткий итог

HEYS Insights переведён в модульный production-ready режим; критичные ошибки
Health Score (веса deficit и category mismatch) исправлены; UI прозрачности
паттернов согласован с расчётным движком; документация актуализирована и сжата
до практичного формата для будущих релизов.
