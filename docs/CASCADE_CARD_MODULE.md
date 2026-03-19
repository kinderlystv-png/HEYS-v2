# Cascade Card — «Ваш позитивный каскад»

> Документация модуля `heys_cascade_card_v1.js` v3.7.0  
> Дата обновления: 2026-02-25

---

## Система оценки каскада

Каскад — адаптивный поведенческий скоринг дня. 10 факторов, каждый
обрабатывается **непрерывной функцией** (вместо ступеней) и адаптируется к
**персональному baseline** пользователя.

### Ключевые принципы v2.1.0

| Принцип                       | Научная основа                           | Реализация                                 |
| :---------------------------- | :--------------------------------------- | :----------------------------------------- |
| **Непрерывное скоринг**       | Природа не работает ступенями            | Сигмоид/линейная интерполяция вместо `if`  |
| **Персональный baseline**     | Межиндивидуальная вариативность ±30%     | 14-дневная скользящая медиана пользователя |
| **Циркадная осведомлённость** | Гормональные ритмы кортизол/мелатонин/GH | Временные модификаторы для каждого фактора |
| **Аллостатическая нагрузка**  | Кумулятивный стресс vs восстановление    | Кросс-факторные синергии и баланс          |
| **Гормезис**                  | Умеренный стресс полезен, избыток — нет  | Diminishing returns на тренировки          |
| **Confidence-взвешивание**    | Мало данных → вес ближе к нулю           | `confidence: 0…1` на каждый фактор         |

```
Общая формация:

getPersonalBaseline(factorKey, defaultValue):
  → median(last 14 days for factor)
  → fallback: populationDefault

scoreFactor(raw, baseline, curveFn):
  → weight = curveFn(raw, baseline)
  → confidence = min(1.0, daysWithData / 7)
  → adjustedWeight = weight × confidence
```

---

### Сводка факторов

```
#   Фактор            v2.0 диапазон  v2.1 диапазон   Что меняется
────────────────────────────────────────────────────────────────────
1   Бытовая актив.     -0.3…+1.0      -0.5…+1.2      Adaptive baseline + log2
2   Качество приёма    -1.0…+1.5      -1.5…+2.0      Непрерывная ф-я + circadian timing
3   Тренировка         -0.5…+2.5      -0.5…+3.0      Load×intensity + recovery-aware
4   Время засыпания    -2.0…+1.0      -2.0…+1.2      Chronotype-adaptive + consistency (v3.2.0: sigmoid softened)
5   Длит. сна          -1.5…+1.0      -2.0…+1.5      Personalized optimal + bell-curve
6   Шаги               -0.3…+1.0      -0.5…+1.3      Rolling adaptive goal + tanh
7   Чек-ин             0…+0.5         -0.1…+0.8      Streak bonus + trend awareness
8   Замеры тела        -0.3…+1.0      -0.3…+1.2      Smart cadence + completeness
9   Витамины           -0.2…+0.5      -0.3…+0.7      Streak bonus + timing
10  Инсулиновые волны  -1.5…+1.5      -2.0…+2.0      Sigmoid overlap + post-training + night fasting
────────────────────────────────────────────────────────────────────
    Мета-шаги         —              —               Confidence + Day-Type + Synergies (+1.3 max)
    TOTAL               ~-8…~+11.5     ~-10…~+16.3
    MOMENTUM_TARGET     8.5            8.5 (v3.5.0: снижен с 10.0 для реалистичного DCS при 4-5 факторах)
```

---

### Фактор 1: Бытовая активность (NEAT) — ШАГ 1

**Источник:** `day.householdMin` (минуты бытовой активности)

**v2.0 (текущее):** фиксированные пороги 60/30/10 мин

**Текущее поведение — любое ненулевое значение всегда в плюс:**

```
if householdMin <= 0:
  weight = 0
elif householdMin <= 15:
  weight = +0.2
else:
  weight = clamp(0.2 + ((householdMin - 15) / 105) × 1.0, 0.2, 1.2)
  // 15 мин → +0.2
  // 30 мин → +0.34
  // 60 мин → +0.63
  // 120+ мин → +1.2 (cap)

Streak penalty (multi-day, smoothed):
  inactiveDays = countConsecutive(prevDays, d => d.householdMin < 10)
  if inactiveDays > 2:
    penalty = -0.08 × (inactiveDays - 2)^0.7, max -0.5
    // Субквадратичная кривая: плавно нарастает
```

**Почему так:**

- Для UX каскада бытовая активность трактуется как «любое движение лучше нуля».
- Поэтому ненулевой бытовой NEAT больше не становится отрицательным событием.
- Негативным остаётся только серия нулевых дней, а не сам факт «сегодня было
  мало».

---

### Фактор 2: Качество приёма пищи — ШАГ 2

**Источник:**
`HEYS.mealScoring.getMealQualityScore(meal, null, normKcal, pIndex)` →
`score: 0–100`

**v2.0 (текущее):** ступенчатая функция (80/60/40/20 → +1.5/+1.0/+0.5/0/-0.5)

**v2.1 (апгрейд) — непрерывная функция + циркадный модификатор:**

```
Непрерывный вес (линейная интерполяция):
  weight = clamp((qualityScore - 40) / 40, -1.0, +1.5)
  //  0 → -1.0,  20 → -0.5,  40 → 0.0,  60 → +0.5,  80 → +1.0, 100 → +1.5

Циркадный модификатор (завтрак важнее ужина):
  v3.5.0: Полосы сдвигаются на `mealBandShift = optimalOnset - 23:00` (адаптация к хронотипу)
  06:00–10:00 (завтрак) → weight × 1.3   — cortisol peak, GH sensitivity
  10:00–14:00 (обед)    → weight × 1.0   — baseline
  14:00–18:00 (перекус) → weight × 0.9   — slight discount
  18:00–21:00 (ужин)    → weight × 0.85  — insulin resistance rises
  21:00–23:00 (поздний) → weight × 0.7   — melatonin onset impairs glucose
  > 23:00 (сдвинуто)    → always -1.0    — hard violation (circadian disruption)

Прогрессивный кумулятив (sigmoid вместо binary 120%):
  ratio = cumulativeKcal / normKcal
  if ratio > 1.0:
    penalty = -sigmoid((ratio - 1.0) / 0.3) × 1.5
    // 105% → -0.3,  115% → -0.9,  130% → -1.4
  // Мягче чем binary cutoff, но нарастает быстро
```

**Научное обоснование:**

- Cortisol утром повышает термический эффект пищи (TEF) на ~15% (Bo et
  al., 2015)
- Вечерняя инсулиновая резистентность: одинаковая еда вечером даёт на 17% выше
  постпрандиальную глюкозу (Morris et al., 2015)
- Непрерывная функция устраняет «cliff effect»: приём со score 79 не должен
  отличаться от score 80

**Фолбэк:** если `getMealQualityScore` недоступен → бинарная логика (+1.0 /
−1.0).

---

### Фактор 3: Тренировка — ШАГ 3

**Источник:** `day.trainings[]`, длительность + тип

**v2.0 (текущее):** duration-only buckets (60/45/30/15 мин)

**v2.1 (апгрейд) — training load + recovery-aware + diminishing returns:**

```
Training load (per session):
  baseDuration = sum(training.z) || training.duration || typeDefault
  intensityMultiplier = {
    hiit: 1.8,  strength: 1.5,  cardio: 1.2,
    yoga: 0.8,  stretching: 0.6, walk: 0.5
  }[training.type] || 1.0

  load = baseDuration × intensityMultiplier

  // Непрерывный вес (sqrt-кривая: diminishing returns):
  sessionWeight = clamp(sqrt(load / 30) × 1.2, 0.3, 3.0)
  //  load=15 (15 мин ходьба)   → +0.85
  //  load=40 (40 мин кардио)   → +1.38
  //  load=60 (40 мин силовая)  → +1.70
  //  load=90 (60 мин силовая)  → +2.08
  //  load=108 (60 мин HIIT)    → +2.28

Multiple sessions/day — diminishing returns:
  totalWeight = session1 + session2 × 0.5 + session3 × 0.25
  // Вторая тренировка в день — бонус, но не полный

Recovery-aware (отмена streak-штрафа):
  yesterdayLoad = sum(yesterday.trainings.load)
  if yesterdayLoad > 60:
    // Интенсивная тренировка вчера = сегодня rest day planned
    skipStreakPenalty = true
    // Даже бонус +0.2 за planned recovery

Weekly volume tracking:
  weeklyLoad = sum(last7days.totalLoad)
  weeklyTarget = baselineWeeklyLoad || 200  // population default
  weeklyRatio = weeklyLoad / weeklyTarget
  // Не штрафовать если weeklyRatio ≥ 0.8 (на неделе достаточно)
```

**Научное обоснование:**

- Training load = Volume × Intensity — стандарт спортивной науки (Foster, 1998)
- Принцип суперкомпенсации: день отдыха после тяжёлой тренировки = часть
  тренировочного цикла, не лень
- Diminishing returns: второй час тренировки менее полезен чем первый (cortisol
  elevation, glycogen depletion)

---

### Фактор 4: Время засыпания — ШАГ 4

**Источник:** `day.sleepStart` (строка `"HH:MM"`)

**v2.0 (текущее):** фиксированные пороги (22:00/23:00/00:00/01:00/02:00)

**v2.1 (апгрейд) — chronotype-adaptive + consistency bonus:**

```
Chronotype baseline:
  personalOnset = median(last14days.sleepStart) || 23:00  // default
  optimalOnset = max(21:30, min(personalOnset, 01:30))  // v3.2.0: расширен с 00:30
  // Clamp: не позволяем baseline уйти дальше 01:30

Continuous scoring (sigmoid) — v3.2.0:
  deviation = sleepStartMins - optimalOnsetMins  // минуты отклонения
  weight = -tanh(deviation / 60) × 1.5 + 0.5     // v3.2.0: /60 × 1.5 (было /45 × 2.0)
  // deviation = -60 (на час раньше оптимума) → +1.2
  // deviation = 0   (в своё оптимальное время) → +0.5
  // deviation = +30  (на 30 мин позже) → +0.0
  // deviation = +60  (на час позже) → -0.6
  // deviation = +120 (на 2 часа позже) → -1.4
  // deviation = +180 (на 3 часа позже) → -1.9 (cap at -2.0)

Consistency bonus (low variance = circadian alignment):
  onsetVariance = stdev(last7days.sleepStartMins)
  if onsetVariance < 30:   consistencyBonus = +0.3
  elif onsetVariance < 45: consistencyBonus = +0.15
  else:                    consistencyBonus = 0.0

Hard floor:
  sleepStart > 04:00 → always -2.0 (circadian catastrophe)  // v3.2.0: сдвинут с 03:00, cap -2.0 вместо -2.5
```

**Научное обоснование:**

- Social jet lag (Wittmann et al., 2006): несовпадение хронотипа и времени сна →
  метаболические нарушения
- Consistency > earliness: стабильное время сна 00:00 лучше чем хаотичное
  22:00/02:00 (Phillips et al., 2017)
- Melatonin dim light onset (DLMO) — индивидуальный биологический маркер:
  оптимальное засыпание = DLMO + 2ч

---

### Фактор 5: Длительность сна — ШАГ 5

**Источник:** `day.sleepHours`

**v2.0 (текущее):** фиксированный оптимум 7.0–8.5ч

**v2.1 (апгрейд) — personalized bell-curve + training recovery:**

```
Personal optimal:
  personalOptimal = median(last14days.sleepHours) || 7.5
  // Clamp: 6.0 ≤ personalOptimal ≤ 9.0

Bell-curve scoring:
  deviation = abs(sleepHours - personalOptimal)
  weight = 1.5 × exp(-deviation² / (2 × 0.8²)) - 0.5
  // В своём оптимуме: +1.0
  // ±1ч от оптимума: +0.3
  // ±2ч от оптимума: -0.4
  // ±3ч от оптимума: -0.5 (floor, cap)

Asymmetry (недосып хуже пересыпа):
  if sleepHours < personalOptimal:
    weight *= 1.3  // Усиление штрафа за недосып
  // 5ч при оптимуме 7.5 → -0.65 (вместо -0.5)

Training recovery modifier:
  if yesterdayHadIntenseTraining:
    personalOptimal += 0.5  // Потребность в сне выше на 30 мин
    // 8ч после интенсивной тренировки = ближе к оптимуму

Hard limits (физиологический пол/потолок):
  sleepHours < 4.0 → floor -2.0 (critical health risk)
  sleepHours > 12.0 → cap -0.5 (маркер проблемы, но не активный вред)
```

**Научное обоснование:**

- Индивидуальная потребность в сне: генетический полиморфизм DEC2 — 5ч vs 9ч (He
  et al., 2009)
- Bell-curve оптимальнее линейных порогов: nature is Gaussian
- Post-exercise sleep need: +20–40 мин после тяжёлой тренировки (Dattilo et
  al., 2011)

---

### Фактор 7: Чек-ин (вес утром) — ШАГ 7

**Источник:** `day.weightMorning > 0`

**v2.0 (текущее):** binary +0.5

**v2.1 (апгрейд) — streak bonus + trend awareness:**

```
Base reward:
  weightMorning > 0 → +0.3

Streak bonus (consecutive check-ins):
  checkinStreak = countConsecutive(prevDays, d => d.weightMorning > 0)
  streakBonus = min(0.5, checkinStreak × 0.05)
  // 1 день → +0.05, 3 дня → +0.15, 7 дней → +0.35, 10+ → +0.50

Trend awareness:
  if weight trending toward goal (7-day slope × goal direction > 0):
    trendBonus = +0.1
  elif weight stable (|7-day slope| < 0.05 kg/day):
    trendBonus = +0.05

No check-in penalty (mild, only if streak existed):
  if checkinStreak >= 3 && today no checkin:
    penalty = -0.1  // break a good habit

Total: base + streakBonus + trendBonus = max +0.8
```

**Научное обоснование:**

- Self-monitoring = самый сильный предиктор долгосрочного результата (Burke et
  al., 2011)
- Daily weighing: -3.1 кг за 12 мес vs -1.2 кг без (Steinberg et al., 2015)
- Reinforcement schedule: variable ratio > fixed ratio (Skinner, 1938) — streak
  bonus создаёт momentum

---

### Фактор 8: Замеры тела — ШАГ 8

**Источник:** `day.measurements` — `{ waist, hips, thigh, biceps, ... }`

**v2.0 (текущее):** binary +1.0 today / penalty if old

**v2.1 (апгрейд) — smart cadence + completeness score:**

```
Optimal cadence:
  daysSinceLast = daysUntil(lastMeasurementDate) || Infinity
  optimalCadence = 7  // 1 раз в неделю

Today has measurements:
  completeness = count(measurements[k] > 0) / totalPossibleMeasurements
  // waist + hips + thigh + biceps = 4 possible
  // 2 из 4 → completeness = 0.5

  baseWeight = 0.5 + completeness × 0.7
  // 1 замер → +0.67,  all 4 → +1.2

  // Если снимали вчера тоже — diminishing returns:
  if daysSinceLast <= 2: baseWeight *= 0.5
  // «Каждый день мерить» не лучше чем раз в неделю

No measurements today:
  if daysSinceLast > optimalCadence × 2:
    penalty = clamp(-0.05 × (daysSinceLast - optimalCadence), -0.3, 0)
  // 14 дней назад → -0.05 × 7 = -0.35 → capped -0.3
```

**Научное обоснование:**

- Обхват талии коррелирует с висцеральным жиром: r = 0.84 (Janssen et al., 2002)
- Еженедельные измерения — стандарт клинических протоколов похудения
- Completeness: больше точек = точнее tracking body recomposition

---

### Фактор 6: Шаги — ШАГ 6

**Источник:** `day.steps` / `prof.stepsGoal || 7000`

**v2.0 (текущее):** ratio-based ступени (120/100/70/50%)

**v2.1 (апгрейд) — rolling adaptive goal + time-of-day curve:**

```
Adaptive goal:
  rollingAvg = mean(last14days.steps) || prof.stepsGoal || 7000
  adaptiveGoal = max(5000, rollingAvg × 1.05)
  // Цель слегка выше среднего — прогрессивная перегрузка

Continuous scoring:
  ratio = steps / adaptiveGoal
  weight = clamp(tanh((ratio - 0.6) × 2.5) × 1.0 + 0.15, -0.5, +1.3)
  //  ratio=0.3 → -0.45
  //  ratio=0.5 → -0.10
  //  ratio=0.7 → +0.30
  //  ratio=1.0 → +0.85
  //  ratio=1.3 → +1.15
  //  ratio=1.5 → +1.25 (diminishing returns)

Time-of-day expectation (intraday credit):
  hourFraction = currentHour / 24
  expectedSteps = adaptiveGoal × hourFraction^0.7
  // К 14:00 ожид. ~55% шагов, к 20:00 ~82%
  // Не штрафуем утром за «мало шагов» — день ещё идёт

  if steps < expectedSteps × 0.5 && currentHour > 16:
    // К вечеру значительно ниже ожид. →  hint «прогуляйся»
    earlyWarning = true
```

**Научное обоснование:**

- 7000–10000 шагов/день = оптимальный диапазон для снижения смертности (Paluch
  et al., 2022)
- Прогрессивная перегрузка: +5% к среднему — стандарт спортивной периодизации
- Intraday curve: физическая активность распределяется неравномерно, пик 10–18ч

---

### Фактор 9: Витамины / добавки — ШАГ 9

**Источник:** `day.supplementsTaken` vs планируемые

**v2.0 (текущее):** ratio-based 3 ступени (100/50/0%)

**v2.1 (апгрейд) — streak bonus + smooth function + zero-plan fallback:**

```
Base scoring (continuous):
  // Если план не задан, но витамины выпиты — считаем план выполненным на 100%
  if suppPlanned == 0 && suppTaken > 0: suppPlanned = suppTaken

  ratio = suppTaken / suppPlanned
  weight = clamp(ratio × 0.7 - 0.1, -0.3, +0.5)
  //  ratio=0.0 → -0.1
  //  ratio=0.3 → +0.11
  //  ratio=0.7 → +0.39
  //  ratio=1.0 → +0.5 (всё принято, ещё не max)

Streak bonus (consistency):
  suppStreak = countConsecutive(prevDays, d => suppRatio(d) >= 0.8)
  if suppStreak >= 7:  streakBonus = +0.2  // неделя подряд
  elif suppStreak >= 3: streakBonus = +0.1

Missed penalty (only if plan exists && streak was active):
  if suppPlanned > 0 && suppTaken == 0 && suppStreak >= 3:
    penalty = -0.3  // breaking established habit

Total: base + streak = max +0.7
```

**Научное обоснование:**

- Adherence > dosage: 80% compliance = 95% эффективности, <50% = потеря эффекта
  (Osterberg & Blaschke, 2005)
- Habit formation: streak-бонус создаёт positive reinforcement loop (Lally et
  al., 2010: average 66 дней до автоматизм, первые 7 — критическое окно)

---

### Фактор 10: Инсулиновые волны — ШАГ 10

**Источник:** `HEYS.InsulinWave.calculate()`

**v2.0 (текущее):** overlap count + avgGap + nightFasting

**v2.1 (апгрейд) — GI-awareness + post-training window + composition:**

```
Overlap scoring (severity-weighted, continuous):
  overlapPenalty = Σ -sigmoid(overlapMinutes / 30) × 0.6
  // 10 мин наложения → -0.18
  // 30 мин → -0.36
  // 60 мин → -0.51
  // Total cap: -2.0

Gap scoring (continuous log-curve):
  gapBonus = Σ clamp(log2(gapMinutes / 120), 0, 1.0) × 0.4
  // 120 мин gap → +0.0
  // 180 мин → +0.23
  // 240 мин → +0.40
  // 360 мин → +0.63

Post-training meal timing (anabolic window):
  if meal within 30–120 мин after training:
    mealTimingBonus = +0.3  // protein synthesis window
  if meal within 0–30 мин after training:
    mealTimingBonus = +0.15  // too fast, but okay

Night fasting (continuous):
  nightGapHours = longestGap / 60
  nightBonus = clamp((nightGapHours - 10) × 0.15, 0.0, +0.5)
  // 10ч → 0.0, 12ч → +0.3, 14ч → +0.5 (cap)

Meal composition modifier (если getMealQualityScore доступен):
  if lastMealBeforeSleep has highGI items:
    nightFastingPenalty -= 0.2
    // Высокий ГИ перед сном = poor sleep quality → hit fasting benefit

Total: overlapPenalty + gapBonus + nightBonus + mealTimingBonus
  range: -2.0 … +2.0
```

**Научное обоснование:**

- Insulin Overlap: повторное повышение инсулина до возврата к baseline → de novo
  lipogenesis (Frayn, 2003)
- Anabolic window: MPS повышается на 50% в первые 2ч после resistance training
  (Schoenfeld et al., 2013)
- Time-restricted eating (16/8): meta-analysis показывает -1.6 кг / 12 недель
  (Regmi & Heilbronn, 2020) — ночной фастинг ≥ 14ч

---

### Кросс-факторные синергии — ШАГ 13 (NEW in v2.1.0)

Факторы не независимы. Определённые комбинации создают **синергетический
эффект**:

```
SYNERGIES = {
  // Сон + Тренировка: хороший сон усиливает recovery
  sleep_training: {
    condition: sleepDurWeight > 0 && yesterdayTrainingLoad > 50
    bonus: +0.3
    reason: 'Quality sleep after training → supercompensation'
  },

  // NEAT + Шаги: combined movement score
  neat_steps: {
    condition: householdWeight > 0 && stepsWeight > 0
    bonus: +0.2
    reason: 'Multi-modal movement → higher TDEE, better insulin sensitivity'
  },

  // Meal timing + Insulin gaps: aligned eating = metabolic harmony
  meals_insulin: {
    condition: avgMealQuality > 60 && avgGap > 180
    bonus: +0.2
    reason: 'Quality food + proper spacing → optimal nutrient partitioning'
  },

  // Morning routine: checkin + early meal + NEAT
  morning_ritual: {
    condition: hasCheckin && firstMealBefore10 && householdMin > 0
    bonus: +0.3
    reason: 'Morning structure → cortisol alignment, habit stacking'
  },

  // Full recovery day: good sleep + rest + low stress
  recovery_day: {
    condition: sleepOnsetWeight > 0 && sleepDurWeight > 0.5
              && !hasTraining && householdMin > 20
    bonus: +0.3
    reason: 'Planned recovery → parasympathetic dominance'
  }
}

Max total synergy bonus: +1.3
```

---

### Day-Type Awareness — ШАГ 12 (NEW in v2.1.0)

Каскад определяет **тип дня** и адаптирует ожидания:

```
DAY_TYPES = {
  training_day: {
    detect: trainings.length > 0 && totalLoad > 40
    adjustments: {
      mealCalorieTolerance: 1.3   // +30% kcal allowance
      sleepImportance: 1.2         // sleep weight × 1.2 tomorrow
      stepsGoalModifier: 0.8       // lower steps expected
    }
  },
  rest_day: {
    detect: trainings.length == 0 && yesterday.trainingLoad > 60
    adjustments: {
      trainingPenalty: 0            // no penalty for missing training
      neatImportance: 1.3           // NEAT more important on rest days
      recoveryBonus: +0.2           // explicit rest = good
    }
  },
  active_rest: {
    detect: trainings has yoga/stretching/walk only
    adjustments: {
      trainingWeight: × 1.2        // boost low-intensity activities
      stepsBonus: +0.1              // walking encouraged
    }
  }
}
```

---

### Confidence Layer — ШАГ 11 (NEW in v2.1.0)

Каждый фактор получает `confidence: 0.0–1.0` на основе объёма данных:

```
getFactorConfidence(factorKey):
  daysWithData = count(last14days where factor has data)

  if daysWithData >= 10:  return 1.0
  elif daysWithData >= 7: return 0.8
  elif daysWithData >= 3: return 0.5
  elif daysWithData >= 1: return 0.3
  else:                   return 0.1  // population default only

Применение:
  adjustedWeight = rawWeight × confidence
  // Новый пользователь (day 1): все веса × 0.1 → score ≈ 0
  // Через неделю: × 0.5–0.8 → score начинает отражать реальность
  // Через 2 недели: × 1.0 → полные веса

Это предотвращает:
  - Ложный STRONG у новичка  с одной хорошей едой
  - Ложный BROKEN при отсутствии данных
  - Нестабильные оценки при малом N
```

---

### Пороги состояний (v3.1.0+ CRS-driven)

```
STRONG:   CRS ≥ 0.75   — устойчивый импульс
GROWING:  CRS ≥ 0.45   — каскад набирает силу
BUILDING: CRS ≥ 0.20   — импульс формируется
RECOVERY: CRS > 0.05   — возвращение
BROKEN:   CRS ≤ 0.05   — начни с малого
EMPTY:    нет событий   — начало дня
```

> **v3.1.0+**: состояние определяется по CRS (кумулятивный импульс), а не по
> дневному score. Пороги score (v2.2.0) всё ещё используются только для
> внутридневного логирования и DCS-нормализации.

> **Важно:** в UI отдельно существует `display CRS` — это сглаженная UX-кривая с
> базой 50% и soft-cap около 80%. Она нужна для отзывчивого прогресс-бара и
> может визуально выглядеть мягче, чем raw CRS внутри EMA.

### Прогресс-бар (v3.0.0+ CRS-driven)

```
Momentum = crs  // v3.0.0+: прогресс-бар = CRS (кумулятивный импульс)
// dailyMomentum = min(1, max(0, score) / MOMENTUM_TARGET) — используется только для логирования
MOMENTUM_TARGET = 8.5  (v3.5.0: снижен с 10.0 для реалистичного DCS при 4-5 активных факторах)

Хороший день (реалистичный, 4-5 активных факторов):
  3 хор. еды (×circadian +3.0) + тренировка 45м (+2.0) + сон (onset+dur +1.5)
  + consistency +0.3 + чек-ин streak (+0.5) + шаги adaptive (+0.6)
  + morning_ritual synergy (+0.3)
  = 8.2 → прогресс-бар 96%  (score / MT=8.5)
  // При MT=8.5 хороший 4-факторный день вплотную приближается к 100%

Отличный день (все 10 факторов):
  3 отл. еды (×circadian +4.5) + тренировка 60м (+2.5) + сон идеальный (+2.5)
  + consistency +0.3 + чек-ин streak (+0.8) + замеры complete (+1.2)
  + шаги 120% adaptive (+1.15) + витамины streak (+0.7)
  + gaps 4ч (+1.0) + ночной 14ч (+0.5) + NEAT 60м relative (+1.0)
  + synergies (+1.0)
  = 17.1 → прогресс-бар 100% (capped)
```

### Пост-тренировочное окно

| Условие               | Эффект                        |
| :-------------------- | :---------------------------- |
| < 2ч после тренировки | Пул сообщений: ANTI_LICENSING |

### Визуальная цепочка (`chain`) — v2.2.0 Soft Chain

`chain` — непрерывная метрика поведенческой последовательности. Негативное
событие **уменьшает** цепочку пропорционально тяжести, а не обнуляет. Не влияет
на state/progress.

```
Soft Chain Penalty Tiers:
  MINOR  (weight ≥ -0.5):  chain -= 1  — слабый приём, мало шагов
  MEDIUM (-1.5 ≤ w < -0.5): chain -= 2  — поздний сон, вредный продукт
  SEVERE (weight < -1.5):  chain -= 3  — засыпание после 03:00, крит. недосып

  chain = max(0, chain - penalty)  — никогда ниже 0

Пример: chain=5, один промах (MINOR) → chain=4 (а не 0)
```

---

## Cascade Rate Score (CRS) v1.0 — Кумулятивный импульс

> Реализована: v3.0.0–v3.5.0 | Статус: implemented

### Проблема

Текущая система (v2.2.0) пересчитывает score **заново каждый день**. 14-дневная
серия чекинов, стабильные тренировки и хорошие приёмы пищи обнуляются визуально
из-за одного плохого сна (03:10, 5.9ч → score −1.84 → BROKEN). Это:

- **Научно некорректно** — накопленные поведенческие паттерны имеют инерцию
- **Демотивирует** — пользователь видит «Пауза 💪» после 2 недель хорошей работы
- **Противоречит Behavioral Momentum Theory** (Nevin, 1992): скорость
  устойчивого отклика сохраняется пропорционально истории подкреплений

### Концепция

**Cascade Rate Score (CRS)** — «резервуар поведенческого импульса». Позитивные
паттерны за **30 дней** накапливаются, формируя инерцию. Один плохой день не
может разрушить 2 недели прогресса.

Модель основана на:

| Теория                                    | Автор              | Применение в CRS                             |
| :---------------------------------------- | :----------------- | :------------------------------------------- |
| **Behavioral Momentum Theory**            | Nevin, 1992        | Инерция пропорциональна истории подкреплений |
| **Habit Formation** (66 дней, медиана)    | Lally et al., 2010 | 30-дневное окно — валидный цикл формирования |
| **Allostatic Load Model**                 | McEwen, 1998       | Кумулятивная нагрузка vs восстановление      |
| **Self-Determination Theory** (автономия) | Deci & Ryan, 2000  | Видимый прогресс = внутренняя мотивация      |

### Архитектура CRS

```
Текущая модель (v2.2.0):
  day → computeCascadeState() → dailyScore → state/progress
  ↑ пересчитывается каждый день, без памяти

Новая модель (v3.6.0 CRS):
  day → computeCascadeState() → dailyScore → DCS (Daily Contribution Score)
                                               ↓
  CRS_base = EMA(completed days, α=0.95)     // i≥1, today excluded
  todayBoost = max(0, DCS) × 0.03            // instant feedback (+0..3%)
  CRS = clamp(CRS_base + todayBoost, 0, ceiling) → state/progress
                                  ↓
                          ceiling (индивидуальный потолок)
```

### 1. Daily Contribution Score (DCS)

Нормализует дневной score в единый масштаб −1.0…+1.0:

```
dcs = clamp(dailyScore / MOMENTUM_TARGET, -0.3, 1.0)
```

**Защита инерции**: обычные негативные дни ограничены **−0.3** (одним плохим
сном не разрушишь неделю прогресса).

**Critical Violation Override** — обходит инерцию:

| Критическое событие                        | DCS override | Обоснование                            |
| :----------------------------------------- | :----------- | :------------------------------------- |
| Еда после 00:00 с `harm ≥ 7`               | −0.8         | Ночной срыв = циркадная катастрофа     |
| Перебор ккал > 150% нормы                  | −0.6         | Массивное переедание                   |
| Комбинация (ночное + вредное + переедание) | −1.0         | Полный сброс дневного вклада           |
| **Дефицит: >150% нормы** (v3.1.0)          | **−0.7**     | Критический перебор при цели похудения |
| **Дефицит: >criticalOver (напр. >115%)**   | **−0.5**     | Нарушение при дефиците (level 2)       |
| **Дефицит: >targetMax (напр. >105%)**      | clamp −0.4   | Мягкий перебор при дефиците (level 1)  |
| **Тренировочный день + дефицит** (v3.3.0)  | пороги ×1.2  | +20% допуск на ккал при тренировке     |

```javascript
// computeDailyContribution(dailyScore, day, normAbs, pIndex, prof)
function computeDailyContribution(dailyScore, day, normAbs, pIndex, prof) {
  var dcs = clamp(dailyScore / MOMENTUM_TARGET, -0.3, 1.0);
  var hasCriticalViolation = false;
  var violationType = null;

  // Critical Violation Detection
  var meals = (day && day.meals) || [];
  // v3.5.1: fallback 0 (was 2000) — skip kcal overrides when normAbs unavailable
  var normKcal = (normAbs && normAbs.kcal) || 0;
  var hasNightHarm = false;
  var hasExcessKcal = false;

  // Ночная еда с harm ≥ 7
  for (var i = 0; i < meals.length; i++) {
    var mealTime = parseTime(meals[i] && meals[i].time);
    if (mealTime !== null && mealTime >= 0 && mealTime < 360) {
      // 00:00–06:00
      if (checkMealHarm(meals[i], pIndex)) {
        hasNightHarm = true;
      }
    }
  }

  // Перебор ккал > 150%
  var totalKcal = /* sum from dayTot */ 0;
  if (totalKcal > normKcal * 1.5) hasExcessKcal = true;

  if (hasNightHarm && hasExcessKcal) {
    dcs = -1.0;
    violationType = 'night_harm_excess';
  } else if (hasNightHarm) {
    dcs = -0.8;
    violationType = 'night_harm';
  } else if (hasExcessKcal) {
    dcs = -0.6;
    violationType = 'excess_kcal';
  }

  hasCriticalViolation = violationType !== null;
  return {
    dcs: dcs,
    hasCriticalViolation: hasCriticalViolation,
    violationType: violationType,
  };
}
```

### 2. Вычисление CRS (v3.7.0 — Base + Today's Boost / Penalty)

**Формула v3.7.0:**

```
CRS = CRS_base + todayBoost

CRS_base   = EMA(завершённые дни, i≥1, α=0.95, 30-day window)
todayBoost = DCS_today > 0
           ? DCS_today × CRS_TODAY_BOOST    // +0..3%
           : DCS_today < -0.1
             ? DCS_today × CRS_TODAY_PENALTY // до -10%
             : 0
CRS        = clamp(CRS_base + todayBoost, 0, ceiling)
```

**Почему v3.7.0 вместо partial-day weighting (v3.3.0):**

- **Проблема v3.3.0:** DCS незавершённого дня (утром 0.3) включался в EMA с
  частичным весом. При DCS < CRS это _тянуло CRS вниз_ — парадокс "сделал
  тренировку → CRS не вырос" (изменение ~0.002, невидимо).
- **Решение v3.6.0:** CRS_base = только завершённые дни (стабилен весь день).
  Каждое действие сегодня увеличивает todayBoost (0 → +3%), мгновенно видимо.
  Утром CRS_base пересчитывается с вчерашним DCS — результат дня закрепляется.

**EMA base (completed days only, i≥1):**

```
weights: вчера=1.0 (α⁰), 2 дня назад=0.95 (α¹), ..., 29 дней=0.95²⁸ ≈ 0.24
crs_base = Σ(weights[i] × dcs[i]) / Σ(weights[i] для дней с данными)
```

**Свойства α = 0.95:**

| Давность      | Вес   | Влияние                    |
| :------------ | :---- | :------------------------- |
| Вчера         | 1.000 | 100% — полный вклад        |
| 2 дня назад   | 0.950 | 95% — почти полный         |
| 7 дней назад  | 0.735 | 74% — заметный             |
| 14 дней назад | 0.513 | 51% — значимый фон         |
| 21 день назад | 0.358 | 36% — ощутимый             |
| 30 дней назад | 0.228 | 23% — всё ещё вносит вклад |

> **Период полураспада:** ~14 дней. Один плохой день среди 14 хороших не обрушит
> CRS.

**Today's Boost — мгновенная обратная связь:**

```
todayBoost = max(0, DCS_today) × 0.03

Примеры (при CRS_base = 80%):
  Утро, пусто:              DCS=0.000 → boost=0.0%  → CRS=80.0%
  + Чекин веса:             DCS=0.094 → boost=+0.3% → CRS=80.3%
  + Завтрак:                DCS=0.289 → boost=+0.9% → CRS=80.9%
  + Тренировка:             DCS=0.466 → boost=+1.4% → CRS=81.4%  ← видимо!
  + 3 приёма пищи:          DCS=0.607 → boost=+1.8% → CRS=81.8%
  Идеальный день (DCS=1.0): boost=+3.0%              → CRS=83.0%
```

**Дни без данных пропускаются** (не считаются как 0, чтобы не штрафовать за
отсутствие — пользователь мог не открывать приложение).

**Пример: 14 хороших дней + 1 плохой сон (score −1.84)**

```
DCS за 14 дней: [0.7, 0.8, 0.6, 0.9, 0.7, 0.8, 0.65, 0.75, 0.8, 0.7, 0.85, 0.6, 0.9, 0.7]
Сегодня DCS: clamp(-1.84/8.5, -0.3, 1.0) = -0.22 (защита инерции −0.3)

CRS_base ≈ 0.68  (EMA без сегодняшнего дня)
todayBoost = max(0, -0.22) × 0.03 = 0  (отрицательный DCS не снижает CRS через boost)
CRS = 0.68 + 0 = 0.68
→ Состояние: GROWING ⚡ «Каскад набирает силу»
→ Прогресс-бар: 68%
```

Без CRS: score −1.84 → BROKEN, прогресс 0%. С CRS: 14 дней инерции → GROWING.

### 3. Индивидуальный потолок (Ceiling)

Потолок определяет **максимальный CRS** для данного пользователя. Растёт по мере
накопления стабильных данных.

```
ceiling = min(1.0, base × consistency × diversity + dataDepth)
```

| Компонент       | Формула                                          | Диапазон   | Смысл                        |
| :-------------- | :----------------------------------------------- | :--------- | :--------------------------- |
| **base**        | `0.65`                                           | 0.65       | Все начинают здесь           |
| **consistency** | `1 + clamp((1 - CV(dailyScores)) × 0.3, 0, 0.3)` | 1.0 – 1.3  | Низкая вариативность → выше  |
| **diversity**   | `1 + activatedFactorTypes / 10 × 0.15`           | 1.0 – 1.15 | Больше типов факторов → выше |
| **dataDepth**   | `+0.03 × полных_недель` (до 4 недель)            | 0 – 0.12   | Каждая неделя +3%            |

### 4. Интеграция в UI (CRS Progress Bar)

Для визуализации CRS используется горизонтальный прогресс-бар, интегрированный в
нижнее навигационное меню (`AppTabsNav`).

**Дизайн и расположение:**

- **Позиция:** В самом низу экрана, под кнопками навигации (привязан к низу
  контейнера `.tabs`).
- **Высота:** 4px (тонкая, элегантная линия с легким фоном-треком).
- **Цветовая схема (Neon):**
  - Левая часть (от 0 до текущего CRS): **Фиксированный зелёный градиент**
    (`#10b981` → `#34d399`).
  - Правая часть (от текущего CRS до 100%): **Фиксированный градиент** (красный
    у центра `#dc2626` → оранжевый `#f97316` → жёлтый у правого края `#fde047`).
    Цвет определяется позицией на шкале, а не значением CRS, что предотвращает
    мерцание при движении точки.
  - Разделитель: Светящаяся белая точка (8x8px) с сильным неоновым ореолом и
    пульсирующей анимацией.
- **Анимация:**
  - **Появление:** При загрузке линии плавно разъезжаются из центра (50%) в
    разные стороны (зеленая влево, оранжевая вправо), а точка-разделитель
    появляется с эффектом `scale`.
  - **Ожидание данных (Маятник):** Пока приложение ждет данные из облака (до
    события `heysSyncCompleted`), точка-разделитель плавно покачивается
    влево-вправо (±5% от центра) каждые 2 секунды, создавая эффект "поиска" или
    "взвешивания" данных.
  - **Установка значения:** Как только облачная синхронизация завершена и
    получен финальный CRS, маятник останавливается, и точка плавно переезжает к
    реальному значению CRS.
  - **Обновление:** При изменении CRS точка плавно переезжает на новую позицию,
    а линии синхронно меняют ширину, создавая эффект непрерывного движения
    (`transition: width 1.8s ease-in-out, left 1.8s...`).
  - **Пульсация:** Бесконечная пульсация разделителя (`@keyframes crs-pulse`).

**Техническая реализация:**

1. **Глобальное состояние:** `computeCascadeState` сохраняет результат в
   `window.HEYS._lastCrs` и вызывает событие `heys:crs-updated`.
2. **Синхронизация с облаком:** Компонент `CrsProgressBar` жестко привязан к
   жизненному циклу приложения. Он проверяет флаг `window.HEYS.syncCompletedAt`
   и слушает событие `heysSyncCompleted`, чтобы гарантированно дождаться
   финальных данных из облака и избежать "двойных прыжков" (сначала к локальному
   кэшу, затем к облачному значению).
3. **React Компонент:** `HEYS.CascadeCard.CrsProgressBar` подписывается на
   события `heys:crs-updated` и `heysSyncCompleted`, локально хранит `crsData` и
   управляет фазами анимации (`isLoaded`, `isSettled`, `loadingOffset`).
4. **Инициализация:** При монтировании `AppTabsNav` проверяет наличие
   `HEYS._lastCrs`. Если пусто — принудительно вызывает `computeCascadeState`
   для текущего дня, чтобы бар отобразился сразу, даже если пользователь не
   заходил на вкладку "Дневник".
5. **CSS:** Классы `.crs-bar-container`, `.crs-bar-green`, `.crs-bar-orange`,
   `.crs-bar-divider` добавлены в `000-base-and-gamification.css` с учетом
   `safe-area-inset-bottom`.

**Примеры:**

| Профиль                              | ceiling | Пояснение                        |
| :----------------------------------- | :------ | :------------------------------- |
| Новичок, 3 дня данных                | ~0.65   | Только base, нет depth           |
| 1 неделя, еда + сон                  | ~0.72   | base + 1 week + 2 factors        |
| 2 недели, стабильный, 5 факторов     | ~0.82   | consistency 1.2 + diversity 1.08 |
| 4 недели, разносторонний, стабильный | ~1.0    | Максимум — полностью раскрытый   |

**CV (Coefficient of Variation)** = stdev(dailyScores) / mean(dailyScores).
Низкий CV = стабильное поведение → множитель до 1.3.

**Activated Factor Types** = количество уникальных типов факторов, по которым
есть данные хотя бы за 3 из 30 дней (еда, сон, тренировки, шаги, чекин, замеры,
витамины, инсулин, NEAT).

### 5. Персистенция DCS в localStorage

```
Ключ: heys_{clientId}_cascade_dcs_v7   (v3.5.0: chronotype-adaptive meals, MT=8.5)
Формат: JSON { "2026-02-20": 0.72, "2026-02-19": 0.85, ... }
```

- Обновляется при каждом вызове `computeCascadeState` для текущего дня
- Автоочистка: записи старше 35 дней удаляются
- **Не шифруется** — данные не содержат PII (аналогично `heys_products`)
- Для дней без кэшированного DCS — ретроспективно вычисляется из `dayv2` данных
  (**v3.5.0: хронотип-адаптивные полосы приёмов** — пороги сдвигаются на
  `mealBandShift = max(-30, optimalOnset - 1380)` мин; breakfast 1.25, daytime
  1.10, поздний (21:00+shift → 23:00+shift) 0.70, hard violation (≥23:00+shift)
  −1.0; дефолт +0.3 для пропущенного сна; синергии 0.25/0.45/0.65/0.80;
  streak-aware checkin, adaptive household, sigmoid сна, bell-curve
  длительность, tanh шаги, insulin gap proxy, хронотип из окрестных дней)

**История миграций кэша:**

| Версия | Миграция                              | Причина                                                                                                            |
| :----- | :------------------------------------ | :----------------------------------------------------------------------------------------------------------------- |
| v1→v2  | positive DCS ×1.2, negative kept      | MOMENTUM_TARGET 12→10                                                                                              |
| v2→v3  | Инвалидация DCS в диапазоне (-0.6, 0) | Deficit penalties без training tolerance (v3.3.0)                                                                  |
| v3→v4  | Полная очистка + пересчёт             | Ретроактивная формула v1-v3 завышала DCS на 50-100% (v3.4.0)                                                       |
| v4→v5  | Полная очистка + пересчёт             | v4 ретро формула занижала DCS на ~30% (flat 0.65/meal, нет streak/synergy, v3.4.1)                                 |
| v5→v6  | Полная очистка + пересчёт             | v5 meal weights занижены на ~10-15% (0.95 vs full algo 1.05-1.15), нет missing-sleep default (v3.4.2)              |
| v6→v7  | Полная очистка + пересчёт             | v6 использовал фиксированный порог 23:00 для еды и MT=10.0. v7 вводит хронотип-адаптивные полосы и MT=8.5 (v3.5.0) |

### 6. CRS-driven состояния (замена score-driven)

| Состояние  | Иконка | Условие    | Лейбл                | v2.2.0 (было) |
| :--------- | :----- | :--------- | :------------------- | :------------ |
| `STRONG`   | 🔥     | CRS ≥ 0.75 | Устойчивый импульс   | score ≥ 8.0   |
| `GROWING`  | ⚡     | CRS ≥ 0.45 | Каскад набирает силу | score ≥ 4.5   |
| `BUILDING` | 🔗     | CRS ≥ 0.20 | Импульс формируется  | score ≥ 1.5   |
| `RECOVERY` | 🌱     | CRS > 0.05 | Возвращение          | score > 0     |
| `BROKEN`   | 💪     | CRS ≤ 0.05 | Начни с малого       | score ≤ 0     |
| `EMPTY`    | 🌅     | нет данных | Начни день           | нет событий   |

**Ключевое свойство**: при CRS ≥ 0.45 (GROWING) невозможно стать BROKEN из-за
одного плохого дня. Бывалый юзер с CRS 0.78 после одного плохого сна:
`Δcrs ≈ −0.02 → CRS ≈ 0.76 → по-прежнему STRONG 🔥`.

### 7. Прогресс-бар: CRS вместо dailyScore

```
v2.2.0:  momentumScore = min(1, max(0, score) / 12.0)     — однодневный
v3.0.0:  momentumScore = crs                                — кумулятивный
```

Прогресс-бар теперь отражает **долгосрочный прогресс**, а не результат одного
дня.

### 8. Обновлённые сообщения

| Состояние  | Сообщения (CRS-контекст)                                                |
| :--------- | :---------------------------------------------------------------------- |
| `STRONG`   | «Устойчивый импульс. Ты на пике — каждый день поддерживает привычку.»   |
|            | «Мощная инерция. Даже небольшой сбой не перечеркнёт твой прогресс.»     |
|            | «Система работает. Две+ недели позитивных решений — это уже фундамент.» |
| `GROWING`  | «Каскад набирает силу. Позитивные действия накапливаются день за днём.» |
|            | «На восходящей. Каждый хороший день поднимает тебя выше.»               |
|            | «Прогресс виден. Ещё немного — и импульс станет устойчивым.»            |
| `BUILDING` | «Импульс формируется. Позитивные действия начинают складываться.»       |
|            | «Первые дни — самые важные. Каждое решение закладывает фундамент.»      |
| `RECOVERY` | «Один шаг назад не отменяет неделю прогресса. Ты уже возвращаешься.»    |
|            | «Импульс снизился, но не обнулился. Один хороший день — и ты на пути.»  |
| `BROKEN`   | «Начни с малого — каждое действие запускает новый каскад.»              |
|            | «Нулевой импульс — это чистый старт. Первый день строит всё остальное.» |

### 9. Расширение cascadeState

Новые поля в возвращаемом объекте `computeCascadeState`:

```js
{
  // ...существующие поля (events, chainLength, score, warnings, state, ...)...

  // NEW in v3.0.0 — Cascade Rate Score
  crs:                  number,        // 0–1, кумулятивный импульс
  crsBase:              number,        // 0–1, EMA completed days only (v3.6.0)
  todayBoost:           number,        // 0–0.03, DCS × CRS_TODAY_BOOST (v3.6.0)
  ceiling:              number,        // 0–1, индивидуальный потолок
  dailyContribution:    number,        // −1..1, вклад сегодняшнего дня (DCS)
  dailyMomentum:        number,        // 0–1, dailyScore / MOMENTUM_TARGET
  hasCriticalViolation: boolean,       // critical violation обошла инерцию?
  crsTrend:             'up' | 'down' | 'flat',  // направление CRS за 7 дней
  daysAtPeak:           number,        // дней подряд DCS ≥ 0.5
  dcsHistory:           { [date]: number },  // вся история DCS
  historicalDays:       HistoricalDay[],  // события прошлых дней
  // NEW in v3.1.0 — Goal-aware:
  hasDeficitOvershoot:  boolean,       // дефицит-mode + перебор ккал?
  deficitOvershootRatio: number|null,  // коэффициент перебора
  goalMode:             string|null    // 'deficit' | 'bulk' | 'maintenance'
}
```

### 10. UI компонента: обновления

**Бейджик**: вместо `chainLength ⚡` → CRS в процентах: `78% ⚡`

**Прогресс-бар**: отображает CRS (0–100%) вместо дневного score.

**Статистика** (в развёрнутом виде):

```
v2.2.0:  🏆 Макс. цепочка: 3    ⚡ Импульс: 43%
v3.0.0:  📈 Импульс: 78/85%     ↑ Тренд: растёт
         💎 Потолок: 85%         🔥 На пике: 3 дня
```

**Daily events**: chain dots и timeline остаются как есть (показывают
сегодняшние события — полезно для интрадневного фидбека).

### 11. Логирование CRS

```javascript
console.info('[HEYS.cascade.crs] 📈 CRS (Cascade Rate Score) v3.6.0:', {
  crsBase: 0.78,
  todayBoost: 0.014,
  crs: 0.794,
  formula: 'CRS_base(0.780) + DCS(0.466) × 0.03 = 0.794',
  ceiling: 0.85,
  dcsToday: 0.466,
  dcsHistoryDays: 18,
  emaDecay: 0.95,
  window: '30 days (completed only)',
});

console.info('[HEYS.cascade.crs] 📊 DCS history (last 7d):', {
  scores: [0.72, 0.85, 0.68, 0.91, 0.73, 0.8, -0.15],
  avgDCS: 0.65,
  trend: 'stable',
});

console.info('[HEYS.cascade.crs] 🏔️ Ceiling computation:', {
  base: 0.65,
  consistency: 1.22,
  diversity: 1.08,
  dataDepth: 0.06,
  ceiling: 0.85,
  activatedFactors: ['meal', 'sleep', 'training', 'checkin', 'steps'],
});

// v3.1.0: goal-aware DCS override (deficit mode)
console.info('[HEYS.cascade.deficit] 📊 Goal-aware DCS override:', {
  level: 2,
  ratio: 1.18,
  criticalOver: 1.15,
  targetMax: 1.05,
  appliedPenalty: -0.5,
  violationType: 'deficit_overshoot',
});
```

### 12. Формулы — сводка

```
┌─────────────────────────────────────────────────────────────────┐
│  DAILY CONTRIBUTION SCORE (DCS)                                 │
│  dcs = clamp(dailyScore / 8.5, -0.3, 1.0)   // v3.5.0          │
│  Critical override: night_harm → -0.8, excess → -0.6, both → -1│
│  Training-day deficit: пороги × 1.2 (v3.3.0)                   │
├─────────────────────────────────────────────────────────────────┤
│  CASCADE RATE SCORE (CRS) — v3.6.0                              │
│  CRS = CRS_base + todayBoost                                    │
│  CRS_base: EMA of completed days (i≥1), α=0.95, 30-day window  │
│    weights[i-1] = 0.95^(i-1)  (yesterday=1.0, 2d ago=0.95...)  │
│    crs_base = Σ(w×dcs) / Σ(w for days with data)                │
│  todayBoost = max(0, DCS_today) × 0.03  (0..+3%)               │
│  CRS = clamp(CRS_base + todayBoost, 0, ceiling)                 │
├─────────────────────────────────────────────────────────────────┤
│  CEILING (индивидуальный потолок)                               │
│  ceiling = min(1.0, 0.65 × consistency × diversity + dataDepth) │
│  consistency = 1 + clamp((1 - CV) × 0.3, 0, 0.3)               │
│  diversity = 1 + activatedTypes/10 × 0.15                       │
│  dataDepth = 0.03 × fullWeeks (max 4)                           │
├─────────────────────────────────────────────────────────────────┤
│  STATE THRESHOLDS (CRS-driven)                                  │
│  STRONG ≥ 0.75 | GROWING ≥ 0.45 | BUILDING ≥ 0.20              │
│  RECOVERY > 0.05 | BROKEN ≤ 0.05                                │
└─────────────────────────────────────────────────────────────────┘
```

### 13. Верификация CRS

| Сценарий                         | Ожидаемый результат                          |
| :------------------------------- | :------------------------------------------- |
| 14 хороших дней + 1 плохой сон   | CRS ≈ 0.68, GROWING (не BROKEN)              |
| 7 хороших дней + 1 плохой        | CRS ≈ 0.50, GROWING (инерция работает)       |
| 3 хороших дня + 2 плохих         | CRS ≈ 0.15, RECOVERY (мало инерции)          |
| 0 дней истории                   | CRS = 0, BROKEN → после 3 хороших → BUILDING |
| Ночной срыв (harm ≥ 7 после 00)  | DCS = −0.8, CRS падает заметно (−30..50%)    |
| 4 недели стабильного поведения   | CRS → ceiling (до 1.0), STRONG               |
| 2 недели хорошо + 1 неделя плохо | CRS плавно снижается, не обваливается        |
| **Дефицит + 110% ккал** (v3.1.0) | DCS clamp ослаблен до −0.4 (level 1)         |
| **Дефицит + 120% ккал** (v3.1.0) | DCS override −0.5, DEFICIT_OVERSHOOT (l2)    |
| **Дефицит + 160% ккал** (v3.1.0) | DCS override −0.7, сильнее generic (l3)      |
| **Набор + 140% ккал** (v3.1.0)   | Penalty снят (bulk exempt ≤ 180%)            |

```javascript
// Консольная проверка:
HEYS.CascadeCard.computeCascadeState(
  HEYS.day,
  HEYS.dayTot,
  HEYS.normAbs,
  HEYS.prof,
  HEYS.pIndex,
);
// → { crs: 0.78, ceiling: 0.85, crsTrend: 'up', state: 'STRONG', ... }
```

---

## Содержание

1. [Концепция](#1-концепция)
2. [Файловая структура](#2-файловая-структура)
3. [Архитектура модуля](#3-архитектура-модуля)
4. [Движок: computeCascadeState](#4-движок-computecascadestate)
5. [Модель данных](#5-модель-данных)
6. [Состояния карточки](#6-состояния-карточки)
7. [Алгоритм цепочки](#7-алгоритм-цепочки)
8. [Компоненты React](#8-компоненты-react)
9. [Контекстные сообщения](#9-контекстные-сообщения)
10. [Интеграция в приложение](#10-интеграция-в-приложение)
11. [CSS и стили](#11-css-и-стили)
12. [Логирование и отладка](#12-логирование-и-отладка)
13. [API модуля](#13-api-модуля)
14. [Реактивность](#14-реактивность)
15. [Верификация](#15-верификация)
16. [Cascade Rate Score (CRS) v1.0](#cascade-rate-score-crs-v10--кумулятивный-импульс)

---

## 1. Концепция

**«Ваш позитивный каскад»** — карточка в Day View, которая визуализирует цепочку
здоровых решений пользователя в реальном времени за текущий день.

**Поведенческая механика** (без научных терминов):

- Каждое позитивное действие добавляет звено в цепочку
- Нарушение **уменьшает** цепочку (не обнуляет), карточка сразу говорит «не всё
  потеряно»
- 2 часа после тренировки — специальное антилицензирующее сообщение
  (предотвращает «заслуженную» переедку)
- RECOVERY-состояние поощряет возврат после срыва

**Место в UI:** между Goal Progress Bar и Refeed Card в `renderDiarySection`.

---

## 2. Файловая структура

| Файл                                           | Тип              | Описание                                   |
| ---------------------------------------------- | ---------------- | ------------------------------------------ |
| `apps/web/heys_cascade_card_v1.js`             | JS (~3790 строк) | Основной модуль: движок + React-компоненты |
| `apps/web/styles/modules/740-cascade-card.css` | CSS              | Стили standalone-компонента                |

### Изменённые файлы при интеграции

| Файл                                 | Изменение                                                        |
| ------------------------------------ | ---------------------------------------------------------------- |
| `apps/web/heys_day_diary_section.js` | Вычисление и вставка `cascadeCard` внутри `renderDiarySection()` |
| `apps/web/index.html`                | `<script defer src="heys_cascade_card_v1.js?v=1">`               |
| `apps/web/styles/main.css`           | `@import url("./modules/740-cascade-card.css")`                  |

---

## 3. Архитектура модуля

```
heys_cascade_card_v1.js
│
├── CONSTANTS
│   ├── STATES            — 6 состояний карточки
│   ├── STATE_CONFIG      — иконка, цвет, лейбл для каждого состояния
│   ├── MESSAGES          — пулы контекстных сообщений (7 пулов: BUILDING, GROWING, STRONG, BROKEN, RECOVERY, ANTI_LICENSING, DEFICIT_OVERSHOOT)
│   └── EVENT_ICONS       — эмодзи иконки типов событий
│
├── UTILITIES
│   ├── parseTime(str)           — "HH:MM" → минуты от полуночи
│   ├── formatTimeShort(str)     — минуты → "HH:MM"
│   ├── pickMessage(pool, key)   — детерминированный выбор по часу
│   ├── isWithinHours(str, h)    — проверка временного окна
│   ├── getMealLabel(meal, i)    — метка приёма по времени
│   ├── checkMealHarm(meal, pi) — наличие product.harm ≥ 7
│   ├── getPreviousDays(n)       — последние N дней из localStorage
│   ├── clamp(v, min, max)       — ограничение диапазона (v2.1.0)
│   ├── median(arr)              — медиана массива (v2.1.0)
│   ├── stdev(arr)               — стандартное отклонение (v2.1.0)
│   ├── getPersonalBaseline()    — 14-дневная медиана фактора (v2.1.0)
│   ├── getFactorConfidence()    — 0..1 конфиденс по объёму данных (v2.1.0)
│   ├── countConsecutive()       — стрик-подсчёт последовательных дней (v2.1.0)
│   ├── getCircadianMultiplier() — циркадный модификатор по времени (v2.1.0)
│   ├── getTrainingDuration()    — длительность тренировки (v2.1.0)
│   └── getTrainingLoad()        — dur × intensity multiplier (v2.1.0)
│
├── ENGINE
│   └── computeCascadeState(day, dayTot, normAbs, prof, pIndex)
│       — 20-шаговый алгоритм, чистая функция, возвращает cascadeState
│
├── REACT COMPONENTS (standalone, не зависят от HEYS.ExpandableCard)
│   ├── ChainDots(props)         — горизонтальная цепочка точек
│   ├── CascadeTimeline(props)   — развёрнутый таймлайн событий
│   └── CascadeCard(props)       — главный компонент (useState для toggle)
│
└── ENTRY POINT
    └── renderCard(params)       — точка входа из diary section
```

**Паттерн модуля:** IIFE `(function(global) { ... })(window)` — соответствует
всем legacy-модулям (`heys_refeed_v1.js`, `heys_supplements_v1.js` и др.)

**Зависимости:**

- `global.React` — должен быть загружен до модуля
- `HEYS.dayUtils.getProductFromItem` или `HEYS.models.getProductFromItem` — для
  расчёта ккал и harm продуктов (опционально, graceful degradation без них)

---

## 4. Движок: computeCascadeState

```js
computeCascadeState(day, dayTot, normAbs, prof, pIndex) → cascadeState
```

**Входные параметры:**

| Параметр  | Тип    | Описание                                                          |
| --------- | ------ | ----------------------------------------------------------------- |
| `day`     | Object | Объект дня: `meals[]`, `trainings[]`, `water`, `steps`            |
| `dayTot`  | Object | Дневные суммарные значения (не используется напрямую, передаётся) |
| `normAbs` | Object | Абсолютные нормы: `normAbs.kcal` — калорийная норма на день       |
| `prof`    | Object | Профиль: `water_norm` (мл), `stepsGoal` / `steps_goal`            |
| `pIndex`  | Object | Индекс продуктов для `getProductFromItem`                         |

**Алгоритм (20 шагов, v2.1.0):**

```
ШАГ 1  — Бытовая активность: adaptive baseline, log2-relative scoring, sub-quad streak
ШАГ 2  — Приёмы пищи: continuous scoring + circadian modifier + sigmoid cumulative penalty
ШАГ 3  — Тренировки: training load (dur × intensity), sqrt-diminishing returns, recovery-aware
ШАГ 4  — Время засыпания: chronotype-adaptive sigmoid + consistency bonus + hard floor
ШАГ 5  — Длительность сна: personalized bell-curve + asymmetric penalty + training recovery
ШАГ 6  — Шаги: rolling adaptive goal, tanh continuous scoring
ШАГ 7  — Чек-ин: streak bonus (consecutive +0.05/day) + trend awareness + habit break penalty
ШАГ 8  — Замеры тела: smart cadence (weekly optimal) + completeness score + diminishing daily
ШАГ 9  — Витамины: continuous ratio scoring + streak bonus + habit break penalty
ШАГ 10 — Инсулиновые волны: sigmoid overlap + log2 gap + post-training timing + night fasting
ШАГ 11 — Scoring summary + Confidence layer: daysWithData / 14 → adjustedWeight = rawWeight × confidence
ШАГ 12 — Day-Type detection: training_day / rest_day / active_rest → modifier adjustments
ШАГ 13 — Cross-factor synergies: sleep+training, NEAT+steps, meals+insulin, morning ritual, recovery
ШАГ 14 — Сортировка events по sortKey (время в минутах)
ШАГ 15 — Алгоритм цепочки (v2.2.0 soft): подсчёт chain c мягкой деградацией, maxChain, warnings
ШАГ 16 — Определение состояния (v3.1.0+ CRS-driven: crs ≥ 0.75 → STRONG, crs ≥ 0.45 → GROWING, etc.)
ШАГ 17 — Post-training window: lastTraining.time в пределах 2 часов?
ШАГ 18 — Выбор пула сообщений (с учётом post-training и DEFICIT_OVERSHOOT)
ШАГ 19 — Momentum score: momentumScore = crs (CRS-driven progress-bar)
ШАГ 20 — Next step hint: следующий рекомендуемый шаг
```

---

## 5. Модель данных

### Событие (Event object)

```js
{
  type:        'meal' | 'training' | 'household' | 'sleep' | 'checkin' | 'measurements' | 'steps' | 'supplements' | 'insulin',
  time:        '08:30' | null,   // строка HH:MM
  positive:    true | false,     // создаёт или ломает цепочку
  icon:        '🥗' | '💪' | ... // эмодзи для отображения
  label:       'Завтрак',        // человекочитаемое название
  sortKey:     480,              // минуты от полуночи для сортировки
  weight:      number            // числовой вклад в score
}
```

### Позитивные события (создают звено цепочки)

| Тип            | Источник               | Условие                                                    |
| -------------- | ---------------------- | ---------------------------------------------------------- |
| `household`    | `day.householdMin`     | householdMin ≥ 10 (вес 0.2–1.0)                            |
| `meal`         | `meals[i]`             | Нет перебора калорий И нет harm-продуктов И не после 23:00 |
| `training`     | `trainings[i]`         | Каждая тренировка (вес зависит от длительности)            |
| `sleep`        | `day.sleepStart`       | sleepOnsetWeight ≥ 0 (засыпание до 00:00)                  |
| `steps`        | `day.steps`            | stepsWeight > 0 (steps / goal ≥ 0.7)                       |
| `checkin`      | `day.weightMorning`    | weightMorning > 0                                          |
| `measurements` | `day.measurements`     | Хотя бы одно измерение > 0                                 |
| `supplements`  | `day.supplementsTaken` | suppRatio ≥ 0.5                                            |

### Негативные события (снижают цепочку)

| Условие                             | Тяжесть | `breakReason`       | Penalty (v2.2.0) |
| ----------------------------------- | ------- | ------------------- | ---------------- |
| Кумулятивные ккал > 120% нормы      | hard    | `'Перебор ккал'`    | SEVERE (3)       |
| Любой продукт в приёме с `harm ≥ 7` | soft    | `'Вредный продукт'` | MINOR (1)        |
| Время приёма ≥ 23:00 (1380 мин)     | soft    | `'Поздний приём'`   | MINOR (1)        |

### cascadeState (результат computeCascadeState)

```js
{
  events:             CascadeEvent[],  // все события, отсортированные
  chainLength:        number,          // текущая длина цепочки (v2.2.0: мягкая деградация)
  maxChainToday:      number,          // максимальная цепочка за день
  score:              number,          // взвешенный скор (сумма всех факторов)
  warnings:           WarningInfo[],   // список отклонений (v2.2.0: с penalty, chainAfter)
  state:              CascadeState,    // текущее состояние (v3.1.0+: CRS-driven)
  momentumScore:      number,          // 0..1 (= crs, CRS-driven progress-bar)
  postTrainingWindow: boolean,         // true = 2ч после последней тренировки
  message:            { short: string }, // контекстное сообщение
  nextStepHint:       string | null,   // подсказка следующего шага
  // NEW in v2.1.0:
  dayType:            'training_day' | 'rest_day' | 'active_rest' | 'normal',
  synergies:          SynergyBonus[],  // applied cross-factor synergies
  confidence:         { [factorKey]: number },  // 0..1 per factor
  avgConfidence:      number,          // mean confidence across all factors
  rawWeights:         { [factorKey]: number },  // raw weights per factor
  // NEW in v3.0.0 — Cascade Rate Score:
  crs:                number,          // 0–1, кумулятивный импульс
  crsBase:            number,          // 0–1, EMA completed days only (v3.6.0)
  todayBoost:         number,          // 0–0.03, DCS × CRS_TODAY_BOOST (v3.6.0)
  ceiling:            number,          // 0–1, индивидуальный потолок
  dailyContribution:  number,          // −1..1, вклад сегодняшнего дня (DCS)
  dailyMomentum:      number,          // 0–1, dailyScore / MOMENTUM_TARGET
  hasCriticalViolation: boolean,       // critical violation обошла инерцию?
  crsTrend:           'up' | 'down' | 'flat',  // направление CRS за 7 дней
  daysAtPeak:         number,          // дней подряд DCS ≥ 0.5
  dcsHistory:         { [date]: number },  // вся история DCS
  historicalDays:     HistoricalDay[], // события прошлых дней для timeline
  // NEW in v3.1.0 — Goal-aware:
  hasDeficitOvershoot: boolean,        // дефицит-mode + перебор ккал?
  deficitOvershootRatio: number|null,  // коэффициент перебора (напр. 1.18)
  goalMode:           string|null      // 'deficit' | 'bulk' | 'maintenance' | null
}
```

---

## 6. Состояния карточки

| Состояние  | Иконка | Цвет      | Условие     | Лейбл                |
| ---------- | ------ | --------- | ----------- | -------------------- |
| `EMPTY`    | 🌅     | `#94a3b8` | Нет событий | Начни день           |
| `BUILDING` | 🔗     | `#3b82f6` | CRS ≥ 0.20  | Импульс формируется  |
| `GROWING`  | ⚡     | `#22c55e` | CRS ≥ 0.45  | Каскад набирает силу |
| `STRONG`   | 🔥     | `#eab308` | CRS ≥ 0.75  | Устойчивый импульс   |
| `BROKEN`   | 💪     | `#f59e0b` | CRS ≤ 0.05  | Начни с малого       |
| `RECOVERY` | 🌱     | `#0ea5e9` | CRS > 0.05  | Возвращение          |

**Матрица переходов (v3.1.0+ CRS-driven):**

```
(нет событий)              → EMPTY
EMPTY + позитив            → BUILDING (CRS растёт через todayBoost)
CRS растёт                  → BUILDING → GROWING → STRONG
негатив снижает DCS         → CRS_base плавно снижается, но инерция защищает
CRS ≤ 0.05                  → BROKEN
```

> **v3.1.0+**: состояние определяется по CRS (кумулятивный импульс), а не по
> дневному score. 14 дней хороших решений создают инерцию, которую один плохой
> день не может разрушить.

---

## 7. Алгоритм цепочки (v2.2.0 Soft Chain)

```js
// Линейный проход по отсортированным events
chain = 0; maxChain = 0; warnings = []; totalPenalty = 0;

for event in sortedEvents:
    if event.positive:
        chain++
        maxChain = max(maxChain, chain)
    else:
        penalty = getChainPenalty(event.weight)
        //  weight ≥ -0.5      → MINOR  (penalty=1)
        // -1.5 ≤ weight < -0.5 → MEDIUM (penalty=2)
        //  weight < -1.5       → SEVERE (penalty=3)
        chain = max(0, chain - penalty)
        totalPenalty += penalty
        warnings.push({ time, reason, penalty, chainBefore, chainAfter })

// Определение состояния (ШАГ 16) — CRS-driven (v3.1.0+):
if events.length == 0         → EMPTY
elif crs >= 0.75              → STRONG
elif crs >= 0.45              → GROWING
elif crs >= 0.20              → BUILDING
elif crs > 0.05               → RECOVERY
else                          → BROKEN
```

> **v3.1.0+**: `hasBreak` удалён из логики. Состояние = f(CRS). Цепочка не
> обнуляется, а деградирует мягко: chain=5 + 1 MINOR → chain=4.

**Momentum score (ШАГ 19):**

```
momentumScore = crs  // v3.0.0+: CRS-driven progress-bar
```

> Знаменатель 8.5 (v3.5.0, было 10.0) — реалистичный потолок для пользователей с
> 4-5 активными факторами

---

## 8. Компоненты React

### ChainDots

```
props: { events: CascadeEvent[] }
```

Горизонтальная цепочка цветных кружков с явными connector-элементами в DOM:

- Цвет точки определяется **весом (влиянием) события** на прогресс (а не типом
  события):
  - `w <= -0.5` — `#dc2626` (красный, сильный негатив)
  - `w < 0` — `#f97316` (оранжевый, слабый негатив)
  - `w == 0` — `#facc15` (желтый, нейтрально)
  - `w <= 0.5` — `#84cc16` (светло-зеленый, слабый позитив)
  - `w <= 1.5` — `#22c55e` (зеленый, хороший позитив)
  - `w > 1.5` — `#10b981` (изумрудный, отличный позитив)
- `.cascade-dot--latest` — пульс-анимация на последнем позитивном звене
- `.cascade-dot-connector` — линия между точками
- `.cascade-dot-connector--warning` — пунктирная янтарная линия предупреждения
  (v2.2.0)

**Tooltip (title):** При наведении на точку отображается время, название события
и его вес (например, `Тренировка 45 мин (+1.2)`).

### CascadeTimeline

```
props: { events: CascadeEvent[], nextStepHint: string | null }
```

Развёрнутый таймлайн с иконкой, временем, названием и бейджем `✓` / `⚠`
(v2.2.0) / `breakReason`.  
В конце — hint `💡 ...`.

### CascadeCard (главный компонент)

```
props: cascadeState (все поля из computeCascadeState)
```

**Standalone** — не использует `HEYS.ExpandableCard`. Управляет expanded через
`React.useState(false)`.

**Свёрнутое состояние:**

```
[🔗 icon] [Ваш позитивный каскад] [3 ⚡ badge]
 Три решения подряд — ты набираешь ход.
 ● — ● — ● (ChainDots)
 [======-------] (progress bar)                 [›]
```

**Развёрнутое состояние:**

```
[🔗 icon] [Ваш позитивный каскад] [3 ⚡ badge]
 Три решения подряд — ты набираешь ход.
 ● — ● — ● (ChainDots)
 [======-------] (progress bar)                 [‹]
──────────────────────────────────────────────────
 ● — ● — ● (ChainDots full)
 🌅  08:15  Ранний завтрак                      ✓
 🥗  09:00  Завтрак                             ✓
 💪  10:30  Тренировка 45 мин                   ✓
 💡 Выпей воды — ты ещё не на 50% нормы
──────────────────────────────────────────────────
 ⚠️ Разрывов цепочки сегодня: 0
 🏆 Макс. цепочка: 3    ⚡ Импульс: 43%
```

---

## 9. Контекстные сообщения

Выбор пула зависит от состояния и post-training window.  
Конкретное сообщение — детерминированно по часу дня (`hour % poolSize`), не
меняется при ре-рендерах.

### BUILDING (chain 1–2)

- «Хорошее начало. Первый шаг уже сделан.»
- «Начало положено — проще всего продолжить, когда уже начал.»

### GROWING (chain 3–4)

- «Три решения подряд — ты набираешь ход.»
- «Хороший ритм. Следующий шаг даётся легче.»
- «Когда всё складывается, правильный выбор становится проще.»

### STRONG (chain 5+)

- «Мощный день. Когда столько сделано — остановиться сложно.»
- «Сегодня всё работает. Такие дни строят привычки.»
- «Пять+ решений — это уже система. Тебе проще делать правильный выбор.»

### BROKEN (CRS ≤ 0.05)

- «Начни с малого — каждое действие запускает новый каскад.»
- «Нулевой импульс — это чистый старт. Первый день строит всё остальное.»
- «Не всё или ничего. Даже 70% хороших решений — отличный день.»

### RECOVERY (0.05 < CRS < 0.20)

- «Один шаг назад не отменяет неделю прогресса. Ты уже возвращаешься.»
- «Импульс снизился, но не обнулился. Один хороший день — и ты на пути.»
- «После перерыва каждое решение имеет значение. Ты уже на пути.»

### ANTI_LICENSING (2ч после тренировки, приоритет над любым состоянием)

- «Тренировка — сама по себе победа. Не «награждай» себя едой.»
- «После нагрузки организм лучше всего усвоит белок и овощи.»
- «Классная тренировка! Выбери качество, а не количество.»

> **Исключение:** ANTI_LICENSING не активируется при BROKEN и EMPTY.

### DEFICIT_OVERSHOOT (перебор ккал при цели похудения, v3.1.0)

- «Перебор, но накопленный прогресс защищает тебя. Завтра — новый шанс.»
- «Один перебор не перечёркивает неделю дисциплины. Импульс сохранён.»
- «Перебрал — бывает. Посмотри на свою неделю: ты справляешься.»
- «Калории выше цели, но каскад инерции на твоей стороне.»

> **Приоритет пулов (ШАГ 18):** DEFICIT_OVERSHOOT > ANTI_LICENSING >
> state-based.

### Next step hint (подсказка следующего шага)

Правило выбора (первое подходящее):

| Условие                   | Hint                                                |
| ------------------------- | --------------------------------------------------- |
| Нет приёма пищи, час < 20 | «Добавь первый приём пищи»                          |
| Нет тренировки, час 6–20  | «Тренировка или прогулка добавят звено в цепочку»   |
| Нет чек-ина, час < 11     | «Взвесься утром — это поможет отслеживать прогресс» |
| Нет замеров, час < 11     | «Сними замеры — это повысит точность анализа»       |
| Нет данных сна            | «Зафиксируй время засыпания для анализа сна»        |
| chain > 0, час < 21       | «Продолжай — следующее решение усилит цепочку»      |

---

## 10. Интеграция в приложение

### Точка вызова — `apps/web/heys_day_diary_section.js`

```js
// Внутри renderDiarySection(), после mealRecCard:
const cascadeCard = app.CascadeCard?.renderCard?.({
    React, day, prof, pIndex, dayTot, normAbs
}) || null;

// В return React.createElement(React.Fragment, ...):
goalProgressBar,
cascadeCard,      // ← ЗДЕСЬ, между goalProgressBar и refeedCard
refeedCard,
mealRecCard,
...
```

### Подключение скрипта — `apps/web/index.html`

```html
<script defer src="heys_cascade_card_v1.js?v=1"></script>
<!-- должен быть до heys_day_diary_section.js -->
```

### Подключение CSS — `apps/web/styles/main.css`

```css
@import url('./modules/740-cascade-card.css');
```

### Интеграция через `renderCard`

```js
// Функция renderCard не рендерит карточку если:
// 1. day = null
// 2. Нет никакой активности (meals, trainings, water, steps — все пустые)
// 3. computeCascadeState вернул state = EMPTY
// В остальных случаях возвращает React.createElement(CascadeCard, cascadeState)
```

---

## 11. CSS и стили

Файл: `apps/web/styles/modules/740-cascade-card.css` (430 строк)

### BEM-структура

```
.cascade-card                     — корневой элемент
.cascade-card--{state}            — модификатор состояния (--building, --strong, etc.)
│
├── .cascade-card__header         — кнопка разворачивания
│   ├── .cascade-card__title-row  — строка заголовка
│   │   ├── .cascade-card__icon   — эмодзи состояния
│   │   ├── .cascade-card__title  — «Ваш позитивный каскад»
│   │   └── .cascade-card__badge  — счётчик «3 ⚡»
│   ├── .cascade-card__subtitle   — текст сообщения
│   ├── .cascade-card__hint       — anti-licensing хинт
│   ├── .cascade-chain-dots       — цепочка точек (свёрнутое)
│   ├── .cascade-card__progress-track
│   │   └── .cascade-card__progress-bar
│   └── .cascade-card__chevron    — «›» / «‹»
│       └── --open
│
└── .cascade-card__body           — развёрнутый контент
    ├── .cascade-chain-dots       — цепочка точек (дублируется)
    ├── .cascade-timeline         — таймлайн
    │   ├── .cascade-timeline-row--positive
    │   ├── .cascade-timeline-row--warning     — v2.2.0: янтарный вместо --negative
    │   ├── .cascade-timeline-icon
    │   ├── .cascade-timeline-time
    │   ├── .cascade-timeline-label
    │   └── .cascade-timeline-badge
    ├── .cascade-next-step        — hint 💡
    ├── .cascade-card__breaks-info
    └── .cascade-card__stats
        └── .cascade-card__stat
```

### Chain dots

```
.cascade-chain-dots               — flex-контейнер, overflow-x: auto
├── .cascade-dot                  — 12×12px кружок
│   ├── style="background: ..."   — цвет задается инлайн в зависимости от веса события (w)
│   └── --latest                  — пульс @keyframes cascadePulse
└── .cascade-dot-connector        — 12px горизонтальная линия
    └── --warning                 — dashed border-top янтарь (v2.2.0, было --broken)
```

### Анимация

```css
@keyframes cascadePulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.35);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(34, 197, 94, 0);
  }
}
/* Применяется к .cascade-dot--latest:not(.cascade-dot--warning) */
```

### Dark mode

Все классы переопределены под `[data-theme="dark"]`.

---

## 12. Логирование и отладка

**Фильтры в консоли:**

- `[HEYS.cascade]` — основной фильтр, все события
- `[HEYS.cascade.crs]` — только CRS-подсистема (DCS, EMA, ceiling)
- `[HEYS.cascade.deficit]` — только goal-aware штрафы v3.1.0 (дефицит/набор)

Все логи используют `console.info` (или `console.warn` для предупреждений).

### Полная карта логов (v3.6.0)

| Эмодзи и префикс                      | Лог                                    | Когда                                         |
| ------------------------------------- | -------------------------------------- | --------------------------------------------- |
| `[cascade] ─── v3.6.0 START`          | computeCascadeState START              | Начало расчёта + перечень фич v3.6.0          |
| `[cascade] 🧬`                        | v3.6.0 features                        | CRS base+todayBoost/continuous/goal-penalty   |
| `[cascade] 📥`                        | Input data                             | Входные параметры                             |
| `[cascade] 🏠 [EVENT]`                | Household (log2 adaptive)              | log2 adaptive scoring + baseline              |
| `[cascade.deficit] 🎯`                | Goal mode for meal loop                | режим цели (deficit/bulk/maintenance), пороги |
| `[cascade] 🥗 Processing N meals`     | начало цикла приёмов                   | количество приёмов                            |
| `[cascade] 🎯 Meal quality`           | score + grade + weight + formula       | continuous scoring v2.1.0                     |
| `[cascade] 🍽️ [MEAL N/M]`             | Meal (continuous + circadian)          | kcal, norm, ratio, penalty, mealWeight        |
| `[cascade.deficit] 🔴`                | Критический перебор при дефиците       | finalRatio > criticalOver (напр. >115%)       |
| `[cascade.deficit] ⚠️`                | Ощутимый перебор при дефиците          | finalRatio > targetRange.max (напр. >105%)    |
| `[cascade.deficit] ✅ Deficit check`  | итог шага 2.5                          | флаг, рацио, goalLabel                        |
| `[cascade] 💪 Processing N trainings` | начало цикла тренировок                | количество тренировок                         |
| `[cascade] 💪 [TRAINING N/M]`         | Training (load×sqrt)                   | load×intensity, diminishing, formula          |
| `[cascade] 💪 Recovery / no training` | recovery-aware + weekly check          | streak, penalty if needed                     |
| `[cascade] 😴`                        | Sleep onset (sigmoid)                  | chronotype-adaptive + consistency + variance  |
| `[cascade] 😴`                        | Sleep duration (bell-curve)            | Gaussian + asymmetry + recovery               |
| `[cascade] 🚶`                        | Steps (tanh)                           | adaptive goal + tanh formula                  |
| `[cascade] ⚖️`                        | Checkin (streak)                       | base + streak + trend                         |
| `[cascade] 📏`                        | Measurements (cadence)                 | completeness + cadence + diminishing          |
| `[cascade] 💊`                        | Supplements (continuous)               | ratio + streak + formula                      |
| `[cascade] ⚡`                        | InsulinWave (sigmoid)                  | sigmoid overlap + log2 gap + fasting          |
| `[cascade] 📊 Scoring summary`        | rawWeights + active/skipped            | scoringMethod v2.2.0                          |
| `[cascade] 🎯 Confidence layer`       | per-factor confidence + avg            | quality: HIGH/MEDIUM/LOW                      |
| `[cascade] 📅 Day-type`               | training/rest/active + effect          | context-aware day type                        |
| `[cascade] 🔗 Cross-factor synergies` | count + names + bonuses                | до 5 синергий                                 |
| `[cascade] 📋 Events sorted`          | финальный список событий (N total)     | перед цепочкой                                |
| `[cascade] ⛓️ Chain algorithm`        | трейс каждого шага цепочки             | soft degradation v2.2.0                       |
| `[cascade] 🔗 Chain result`           | chain, maxChain, warnings[]            | итог цепочки                                  |
| `[cascade.crs] ─── START`             | CRS computation START                  | начало EMA-расчёта                            |
| `[cascade.deficit] 📊 Goal-aware DCS` | DCS override по уровню (1/2/3)         | level, ratio, appliedPenalty                  |
| `[cascade.deficit] 💪 Bulk exemption` | штраф снят (режим набора, ккал ≤ 180%) | ккал% ≤ 180% в bulk-режиме                    |
| `[cascade.crs] 📊 DCS`                | DCS formula + result                   | baseDcs, hasCriticalViolation, violationType  |
| `[cascade.crs] 🗂️`                    | Retroactive backfill                   | сколько дней заполнено                        |
| `[cascade.crs] 🏔️ Ceiling`            | consistency × diversity × depth        | activatedFactors, daysWithData                |
| `[cascade.crs] 📈 CRS`                | crs, ceiling, dcsToday, emaDecay       | финальный CRS                                 |
| `[cascade.crs] 📊 CRS trend`          | up/down/flat                           | динамика за 7 дней                            |
| `[cascade.crs] 🔥 Days at peak`       | консекутивные дни DCS ≥ 0.5            | streak сильных дней                           |
| `[cascade.crs] ─── DONE`              | CRS computation DONE                   | конец EMA-расчёта                             |
| `[cascade] 🏷️ State`                  | CRS-driven state                       | crs, eventsLength, thresholds                 |
| `[cascade] ⏰ Post-training`          | окно 2ч после тренировки               | активно / не активно                          |
| `[cascade] 💬 Message pool`           | выбранный пул                          | DEFICIT_OVERSHOOT / ANTI_LICENSING / state    |
| `[cascade] 💬 Message selected`       | пул, индекс, текст сообщения           | финальное сообщение                           |
| `[cascade] 📊 Momentum score`         | CRS в процентах                        | CRS-driven progress-bar                       |
| `[cascade] 💡 Next step hint`         | hint и почему                          | спец. hint при deficitOvershoot               |
| `[cascade] ✅ v3.6.0 DONE`            | computeCascadeState DONE               | state, crs, goalMode, hasDeficitOvershoot     |
| `[cascade] 🧬 v3.6.0 subsystems`      | все подсистемы кратко                  | goalAwarePenalty + CRS + chainModel + ...     |
| `[cascade] ───────`                   | разделитель                            | конец расчёта                                 |
| `[cascade] 📌 renderCard called`      | вызов точки входа                      | перед всем                                    |
| `[cascade] 🧠 Cache MISS`             | recompute triggered                    | входные данные изменились, пересчёт           |
| `[cascade] ⚡ Cache HIT`              | compute skipped                        | данные не изменились, кэш использован         |
| `[cascade] 🚀`                        | Rendering CascadeCard                  | React-компонент рендерится                    |
| `[cascade] 🔄`                        | Toggle expanded                        | раскрытие / закрытие                          |
| `[cascade] ✅ Module loaded v3.6.0`   | загрузка модуля                        | при загрузке скрипта, sub-префиксы            |

### Примеры запросов в консоли

```js
// Получить текущее состояние напрямую:
HEYS.CascadeCard.computeCascadeState(
  HEYS.day,
  HEYS.dayTot,
  HEYS.normAbs,
  HEYS.prof,
  HEYS.pIndex,
);

// Проверить версию:
HEYS.CascadeCard.VERSION; // → "3.6.0"

// Посмотреть все состояния:
HEYS.CascadeCard.STATES;

// Посмотреть конфиг состояний:
HEYS.CascadeCard.STATE_CONFIG;

// Посмотреть пулы сообщений:
HEYS.CascadeCard.MESSAGES;
```

---

## 13. API модуля

```js
HEYS.CascadeCard = {
  VERSION:             '3.6.0',
  STATES:              { EMPTY, BUILDING, GROWING, STRONG, BROKEN, RECOVERY },
  STATE_CONFIG:        { [state]: { icon, color, label } },
  MESSAGES:            { [poolKey]: [{ short }] },  // + DEFICIT_OVERSHOOT (v3.1.0)
  computeCascadeState: function(day, dayTot, normAbs, prof, pIndex) → cascadeState,
  renderCard:          function({ day, dayTot, normAbs, prof, pIndex, React? }) → ReactElement | null
}
```

### renderCard — входные параметры

| Параметр  | Обязателен | Откуда берётся                |
| --------- | ---------- | ----------------------------- |
| `day`     | **да**     | `params.day` из diary section |
| `dayTot`  | нет        | `params.dayTot`               |
| `normAbs` | нет        | `params.normAbs`              |
| `prof`    | нет        | `params.prof`                 |
| `pIndex`  | нет        | `params.pIndex`               |
| `React`   | нет        | берётся из `global.React`     |

### Условия, при которых renderCard возвращает null

1. `day` не передан / null
2. Нет никакой активности:
   `meals.length === 0 && trainings.length === 0 && steps === 0 && householdMin === 0 && weightMorning === 0 && sleepStart === null && measurements === null && supplementsTaken === 0`
3. `computeCascadeState` вернул `state = 'EMPTY'`

---

## 14. Реактивность

Карточка **полностью реактивна** через стандартный React re-render:

```
Пользователь добавляет еду / тренировку / воду
  → React state (day) обновляется в DayTab
  → DayTab re-render
  → renderDiarySection() вызывается заново
  → app.CascadeCard.renderCard({ day, ... }) пересчитывается
  → computeCascadeState() — чистая функция, 0 side effects
  → CascadeCard рендерится с новым cascadeState
```

`computeCascadeState` — **чистая функция** (pure function):

- Без побочных эффектов
- Без внутреннего состояния
- Детерминирована при одинаковых входных данных
- Производительность: ~0.5–2 мс (3–5 meals + 0–2 trainings)

**Локальное состояние компонента** (`expanded`) — хранится в `React.useState`
внутри `CascadeCard`. Сохраняется при ре-рендерах пока компонент монтирован,
сбрасывается при размонтировании.

---

## 15. Верификация

### Сценарии тестирования вручную

| Шаг | Действие                              | Ожидаемый результат                            |
| --- | ------------------------------------- | ---------------------------------------------- |
| 1   | Открыть Day tab без данных            | Карточки нет                                   |
| 2   | Добавить 1 приём в норме              | BUILDING, «Хорошее начало», score~1.0, 1 точка |
| 3   | Добавить 2-й приём в норме            | BUILDING, 2 точки, hint по тренировке/чек-ину  |
| 4   | Добавить тренировку 45 мин            | score растёт, GROWING если score≥4.0           |
| 5   | Сразу после тренировки (< 2ч)         | ANTI_LICENSING сообщение                       |
| 6   | Добавить приём с harm ≥ 7             | BROKEN💪, разрыв пунктиром, anti-WTH сообщение |
| 7   | Добавить следующий нормальный приём   | RECOVERY🌱, новая точка, «Новая цепочка»       |
| 8   | Взвеситься утром (weightMorning)      | checkin точка +0.5 в score                     |
| 9   | Записать время сна (sleepStart)       | sleep onset точка, bonus/penalty за расписание |
| 10  | 5+ нормальных решений или score ≥ 7.0 | STRONG🔥, «Мощный день», золото                |
| 11  | Нажать на карточку                    | Разворачивается таймлайн с событиями           |
| 12  | Проверить в dark mode                 | Все цвета читаются                             |
| 13  | Консоль → фильтр `[HEYS.cascade]`     | Вся аналитика; каждый пропущенный шаг виден    |

### Консольные команды для проверки

```js
// Прямой тест движка с тестовыми данными:
HEYS.CascadeCard.computeCascadeState(
  {
    meals: [
      { time: '08:00', items: [] },
      { time: '12:30', items: [] },
    ],
    trainings: [{ time: '10:00', duration: 45 }],
    steps: 5000,
    householdMin: 20,
    weightMorning: 75.3,
    sleep: { start: '23:00', hoursTotal: 7.5 },
    measurements: { waist: 80 },
    supplementsTaken: 2,
    supplementsPlanned: 3,
  },
  {},
  { kcal: 2000 },
  { stepsGoal: 10000 },
  null,
);
// Ожидаемо: state=GROWING или STRONG, score~5-8, несколько событий в цепочке
```

---

## История изменений

| Версия | Дата       | Изменение                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0.0 | 2026-02-19 | Первая версия. Использовала `HEYS.ExpandableCard`. Название «Твой импульс сегодня»                                                                                                                                                                                                                                                                                                                                                                                                                             |
| v1.1.0 | 2026-02-19 | Standalone архитектура (без `ExpandableCard`). Детальное 12-шаговое логирование. Переименование → «Ваш позитивный каскад». Явные DOM-коннекторы вместо CSS `::before`                                                                                                                                                                                                                                                                                                                                          |
| v1.2.1 | 2026-02-19 | Decision chain visualization улучшения. 816 LOC                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| v2.0.0 | 2026-02-19 | 10-факторная поведенческая оценка. 17-шаговый алгоритм. Новые типы событий: household, sleep, checkin, measurements, supplements, insulin. EVENT_WEIGHTS система. Score-based состояния (BUILDING≥1.5, GROWING≥4.0, STRONG≥7.0). MOMENTUM_TARGET=10. Полное логирование всех пропущенных шагов. ~1195 LOC                                                                                                                                                                                                      |
| v2.1.0 | 2026-02-20 | Научный апгрейд всех 10 факторов: непрерывные функции (sigmoid/bell-curve/log2) вместо ступеней. Персональный baseline (14-дневная медиана). Chronotype-adaptive сон. Training load (dur×intensity) + recovery-aware. Confidence layer (data volume → weight modulation). Day-Type awareness (training/rest/active). 5 кросс-факторных синергий. Пороги: GROWING≥4.5, STRONG≥8.0, MOMENTUM_TARGET=12. 21-шаговый алгоритм                                                                                      |
| v2.2.0 | 2026-02-20 | **Soft Chain Degradation + Score-driven States.** Цепочка больше не обнуляется при негативном событии — мягкая деградация с 3 уровнями пенальти (MINOR=1, MEDIUM=2, SEVERE=3) в зависимости от тяжести. Состояние определяется только по score (без hasBreak override): STRONG≥8, GROWING≥4.5, BUILDING≥1.5, RECOVERY>0, BROKEN≤0. Визуально: жёлто-янтарные предупреждения (⚠) вместо серых разрывов (✗). API: `breaks[]` → `warnings[]` (с полями penalty, chainAfter, weight)                              |
| v3.0.0 | 2026-02-21 | **Cascade Rate Score (CRS) v1.0 — Кумулятивный импульс.** 30-дневная EMA (α=0.92) заменяет однодневный score для определения состояния и прогресс-бара. Индивидуальный потолок (ceiling) = f(consistency, diversity, dataDepth). DCS (Daily Contribution Score) с защитой инерции (clamp −0.3) и Critical Violation Override (ночное переедание/harm). CRS-driven пороги: STRONG≥0.75, GROWING≥0.45, BUILDING≥0.20. Персистенция DCS в localStorage (`_dcs_v1`).                                               |
| v3.1.0 | 2026-02-22 | **Goal-aware DCS override (дефицит).** Три уровня пенальти при цели похудения: Level 1 (>targetMax → clamp −0.4), Level 2 (>criticalOver → −0.5), Level 3 (>150% → −0.7). DEFICIT_OVERSHOOT пул сообщений.                                                                                                                                                                                                                                                                                                     |
| v3.2.0 | 2026-02-23 | **Chronotype-tolerant sigmoid + MOMENTUM_TARGET.** Сигмоид засыпания: `/45)×2.0` → `/60)×1.5` (мягче для поздних хронотипов). optimalOnset clamp: 00:30 → 01:30. Hard floor: 03:00 → 04:00. Диапазон: [−2.5,+1.5] → [−2.0,+1.2]. MOMENTUM_TARGET: 12.0 → 10.0. DCS cache migration v1→v2 (positive DCS ×1.2).                                                                                                                                                                                                  |
| v3.3.0 | 2026-02-24 | **EMA stabilization + training tolerance.** α: 0.92 → 0.95 (период полураспада ~14д вместо ~8д). Partial-day weighting: вес сегодняшнего дня × dayProgress. Deficit training tolerance: пороги ×1.2 для тренировочных дней. `buildDayEventsSimple`: graduated sleep buckets (6 уровней) + лейблы под chronotype clamp.                                                                                                                                                                                         |
| v3.4.0 | 2026-02-24 | **Accurate retroactive DCS.** Полный пересчёт ретроактивной формулы: раньше `∑bonuses/1.2` (завышала DCS на 50-100%), теперь миррорит полный 10-факторный алгоритм: sigmoid сна с chronotype baseline из окрестных дней, bell-curve длительности, tanh шаги с adaptive goal, training load (sqrt-curve), циркадные штрафы приёмов, log2 household, insulin gap proxy. Кэш v3→v4: полная очистка + backfill с передачей `prevDays` для хронотипного baseline.                                                   |
| v3.4.1 | 2026-02-24 | **Calibrated retroactive DCS.** v3.4.0 занижала DCS на ~30% (flat 0.65/meal vs 0.95–1.15 в full algo, flat checkin 0.4 вместо streak-aware 0.8, нет synergies/measurements). Исправлено: time-band meals (breakfast 1.15, daytime 0.95, 21–23:00 0.50, late/night −1.0), streak-aware checkin (0.3+streak×0.05), adaptive household baseline из prevDays, 3rd+ training ×0.25, synergy approximation (+0.15/+0.30/+0.50 по кол-ву положительных факторов), measurements. Кэш v4→v5: полная очистка + пересчёт. |
| v3.4.2 | 2026-02-24 | **Meal weight calibration.** v3.4.1 meal weights на 10-15% ниже full algo output (верифицировано: сегодня full algo даёт 1.00-1.20/meal, retro давал 0.95). Калибровка: daytime 0.95→1.10, breakfast 1.15→1.25, evening 0.50→0.70. Missing-sleep default +0.3 (пропуск данных ≠ плохое поведение). Synergy бонусы: 0.25/0.45/0.65/0.80 (было 0.15/0.30/0.50). Кэш v5→v6: полная очистка + пересчёт.                                                                                                            |
| v3.5.0 | 2026-02-24 | **Chronotype-adaptive meals & Target calibration.** Сдвиг циркадных полос еды на основе `optimalOnset` (адаптация к хронотипу, защита сов от штрафа -1.0 за еду в 23:30). Снижение `MOMENTUM_TARGET` с 10.0 до 8.5 для реалистичного DCS при 4-5 активных факторах. Кэш v6→v7: полная очистка + пересчёт.                                                                                                                                                                                                      |
| v3.5.1 | 2026-02-25 | **normKcal fallback fix + retroactive DCS correction.** Фикс: `normKcal` fallback `2000` → `0` в `computeDailyContribution` (false positive `deficit_overshoot` при отсутствии normAbs). Ретроактивная перезапись DCS = −0.500 (exact value) через backfill pass — эти значения были результатом бага с normKcal=2000.                                                                                                                                                                                         |
| v3.6.0 | 2026-02-25 | **CRS = base + todayBoost.** EMA считается только по завершённым дням (i≥1). Сегодняшний DCS даёт мгновенный бонус: `todayBoost = max(0, DCS) × 0.03` (0..+3%). Решает проблему: раньше частичный вес незавершённого дня тянул CRS вниз при DCS < CRS (парадокс «добавил тренировку → CRS не вырос»). Теперь CRS_base стабилен весь день, а todayBoost растёт с каждым новым событием. Утром CRS_base обновляется с вчерашним DCS. `CRS_TODAY_BOOST = 0.03` — новая константа.                                 |
