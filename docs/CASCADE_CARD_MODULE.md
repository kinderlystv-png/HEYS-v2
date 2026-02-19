# Cascade Card — «Ваш позитивный каскад»

> Документация модуля `heys_cascade_card_v1.js` v2.2.0  
> Дата обновления: 2026-02-19

---

## Система оценки каскада (v2.2.0)

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
4   Время засыпания    -2.0…+1.0      -2.5…+1.5      Chronotype-adaptive + consistency
5   Длит. сна          -1.5…+1.0      -2.0…+1.5      Personalized optimal + bell-curve
6   Шаги               -0.3…+1.0      -0.5…+1.3      Rolling adaptive goal + tanh
7   Чек-ин             0…+0.5         -0.1…+0.8      Streak bonus + trend awareness
8   Замеры тела        -0.3…+1.0      -0.3…+1.2      Smart cadence + completeness
9   Витамины           -0.2…+0.5      -0.3…+0.7      Streak bonus + timing
10  Инсулиновые волны  -1.5…+1.5      -2.0…+2.0      Sigmoid overlap + post-training + night fasting
────────────────────────────────────────────────────────────────────
    Мета-шаги         —              —               Confidence + Day-Type + Synergies (+1.3 max)
    TOTAL               ~-8…~+11.5     ~-10…~+16.3
    MOMENTUM_TARGET     10.0           12.0
```

---

### Фактор 1: Бытовая активность (NEAT) — ШАГ 1

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
  06:00–10:00 (завтрак) → weight × 1.3   — cortisol peak, GH sensitivity
  10:00–14:00 (обед)    → weight × 1.0   — baseline
  14:00–18:00 (перекус) → weight × 0.9   — slight discount
  18:00–21:00 (ужин)    → weight × 0.85  — insulin resistance rises
  21:00–23:00 (поздний) → weight × 0.7   — melatonin onset impairs glucose
  > 23:00               → always -1.0    — hard violation (circadian disruption)

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

### Фактор 2: Качество приёма пищи — ШАГ 2

**Источник:** `day.householdMin` (минуты бытовой активности)

**v2.0 (текущее):** фиксированные пороги 60/30/10 мин

**v2.1 (апгрейд) — adaptive baseline + relative scoring:**

```
Personal baseline:
  baselineNEAT = median(last14days.householdMin) || 30  // population default

Relative scoring (к персональному уровню):
  ratio = householdMin / baselineNEAT
  weight = clamp(log2(ratio + 0.5) × 0.8, -0.5, +1.2)
  //  ratio=0.0 → -0.5 (резко ниже своей нормы)
  //  ratio=0.3 → -0.15
  //  ratio=1.0 → +0.35 (на уровне)
  //  ratio=1.5 → +0.70
  //  ratio=2.0 → +1.0 (вдвое выше привычного)
  //  ratio=3.0 → +1.2 (cap)

Streak penalty (multi-day, smoothed):
  inactiveDays = countConsecutive(prevDays, d => d.householdMin < 10)
  if inactiveDays > 2:
    penalty = -0.08 × (inactiveDays - 2)^0.7, max -0.5
    // Субквадратичная кривая: плавно нарастает
```

**Научное обоснование:**

- NEAT составляет 15–50% суточного расхода (Levine, 2004) — вариативность
  огромна
- Относительное скоринг важнее абсолютного: человек с NEAT 120 мин/день и 60
  мин/день — разные базовые уровни
- Log-кривая: diminishing returns (60→120 мин менее значимы чем 0→60)

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
  optimalOnset = max(21:30, min(personalOnset, 00:30))
  // Clamp: не позволяем baseline уйти дальше 00:30

Continuous scoring (sigmoid):
  deviation = sleepStartMins - optimalOnsetMins  // минуты отклонения
  weight = -tanh(deviation / 45) × 2.0 + 0.5
  // deviation = -60 (на час раньше оптимума) → +1.5
  // deviation = 0   (в своё оптимальное время) → +0.5
  // deviation = +30  (на 30 мин позже) → -0.2
  // deviation = +60  (на час позже) → -1.0
  // deviation = +120 (на 2 часа позже) → -2.0
  // deviation = +180 (на 3 часа позже) → -2.5 (cap)

Consistency bonus (low variance = circadian alignment):
  onsetVariance = stdev(last7days.sleepStartMins)
  if onsetVariance < 30:   consistencyBonus = +0.3
  elif onsetVariance < 45: consistencyBonus = +0.15
  else:                    consistencyBonus = 0.0

Hard floor:
  sleepStart > 03:00 → always -2.5 (circadian catastrophe)
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

### Фактор 6: Чек-ин (вес утром) — ШАГ 7

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

### Фактор 7: Замеры тела — ШАГ 8

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

### Фактор 8: Шаги — ШАГ 6

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

**v2.1 (апгрейд) — streak bonus + smooth function:**

```
Base scoring (continuous):
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

### Пороги состояний (v2.2.0)

```
STRONG:   score ≥ 8.0   — мощный день
GROWING:  score ≥ 4.5   — каскад растёт
BUILDING: score ≥ 1.5   — начало
RECOVERY: 0 < score < 1.5  — слабый импульс (в v2.1 было: hasBreak + score > 0)
BROKEN:   score ≤ 0     — негативы перевесили (в v2.1: hasBreak + score ≤ 0)
EMPTY:    нет событий   — начало дня
```

> **v2.2.0**: `hasBreak` больше не влияет на состояние. Состояние = f(score).
> RECOVERY теперь означает «слабый позитивный импульс», а не «был разрыв».
> BROKEN теперь означает «негативы перевесили позитив».

### Прогресс-бар (v2.2.0)

```
Momentum = min(1, max(0, score) / MOMENTUM_TARGET)
MOMENTUM_TARGET = 12.0  (raised from 10.0 to accommodate higher range)

Хороший день (реалистичный):
  3 хор. еды (×circadian +3.5) + тренировка 45м (+2.0) + сон (onset+dur +2.0)
  + consistency +0.3 + чек-ин streak (+0.5) + шаги adaptive (+0.9)
  + витамины streak (+0.6) + gaps 3ч (+0.5) + morning_ritual synergy (+0.3)
  = 10.6 → прогресс-бар 88%

Отличный день:
  3 отл. еды (×circadian +5.0) + тренировка 60м (+2.5) + сон идеальный (+2.5)
  + consistency +0.3 + чек-ин streak (+0.8) + замеры complete (+1.2)
  + шаги 120% adaptive (+1.15) + витамины streak (+0.7)
  + gaps 4ч (+1.0) + ночной 14ч (+0.5) + NEAT 60м relative (+1.0)
  + synergies (+1.0)
  = 17.6 → прогресс-бар 100% (capped)
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
| `apps/web/heys_cascade_card_v1.js`             | JS (~1760 строк) | Основной модуль: движок + React-компоненты |
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
│   ├── MESSAGES          — пулы контекстных сообщений (6 пулов)
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
ШАГ 16 — Определение состояния (v2.2.0 score-driven, без hasBreak)
ШАГ 17 — Post-training window: lastTraining.time в пределах 2 часов?
ШАГ 18 — Выбор пула сообщений (с учётом post-training)
ШАГ 19 — Momentum score: min(1, max(0, score) / MOMENTUM_TARGET=12.0)
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
  state:              CascadeState,    // текущее состояние (v2.2.0: score-driven)
  momentumScore:      number,          // 0..1 (score / MOMENTUM_TARGET)
  postTrainingWindow: boolean,         // true = 2ч после последней тренировки
  message:            { short: string }, // контекстное сообщение
  nextStepHint:       string | null,   // подсказка следующего шага
  // NEW in v2.1.0:
  dayType:            'training_day' | 'rest_day' | 'active_rest' | 'normal',
  synergies:          SynergyBonus[],  // applied cross-factor synergies
  confidence:         { [factorKey]: number },  // 0..1 per factor
  avgConfidence:      number           // mean confidence across all factors
}
```

---

## 6. Состояния карточки

| Состояние  | Иконка | Цвет      | Условие         | Лейбл          |
| ---------- | ------ | --------- | --------------- | -------------- |
| `EMPTY`    | 🌅     | `#94a3b8` | Нет событий     | Начни день     |
| `BUILDING` | 🔗     | `#3b82f6` | score ≥ 1.5     | Начало         |
| `GROWING`  | ⚡     | `#22c55e` | score ≥ 4.5     | Каскад растёт  |
| `STRONG`   | 🔥     | `#eab308` | score ≥ 8.0     | Мощный день    |
| `BROKEN`   | 💪     | `#f59e0b` | score ≤ 0       | Пауза          |
| `RECOVERY` | 🌱     | `#0ea5e9` | 0 < score < 1.5 | Слабый импульс |

**Матрица переходов (v2.2.0 score-driven):**

```
(нет событий)           → EMPTY
EMPTY + позитив         → RECOVERY (score 0–1.5) или BUILDING (≥ 1.5)
любое событие          → состояние = f(score)
score растёт              → BUILDING → GROWING → STRONG
негатив снижает score   → состояние может упасть, но score ≥ 4.5 → GROWING
score ≤ 0                 → BROKEN
```

> **v2.2.0**: нет прямого перехода в BROKEN/RECOVERY по наличию негатива. Score
> включает негативные веса, поэтому один промах снижает score, но не
> перечёркивает 5 позитивных событий.

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

// Определение состояния (ШАГ 16) — только по score:
if events.length == 0         → EMPTY
elif score >= 8.0             → STRONG
elif score >= 4.5             → GROWING
elif score >= 1.5             → BUILDING
elif score > 0                → RECOVERY
else                          → BROKEN
```

> **v2.2.0**: `hasBreak` удалён из логики определения состояния. Цепочка не
> обнуляется, а деградирует мягко: chain=5 + 1 MINOR → chain=4.

**Momentum score (ШАГ 19):**

```
momentumScore = min(1.0, max(0, score) / MOMENTUM_TARGET)  // MOMENTUM_TARGET = 12.0
```

> Знаменатель 12 — расширенный диапазон v2.1.0 с синергиями и confidence

---

## 8. Компоненты React

### ChainDots

```
props: { events: CascadeEvent[] }
```

Горизонтальная цепочка цветных кружков с явными connector-элементами в DOM:

- `.cascade-dot--{type}` — цвет по типу события
- `.cascade-dot--warning` — янтарный (amber #f59e0b) для негативных событий
  (v2.2.0)
- `.cascade-dot--latest` — пульс-анимация на последнем позитивном звене
- `.cascade-dot-connector` — линия между точками
- `.cascade-dot-connector--warning` — пунктирная янтарная линия предупреждения
  (v2.2.0)

**Цвета точек:** | Тип | Цвет | |-----|------| | `meal` | `#22c55e` зелёный | |
`training` | `#f59e0b` янтарь | | `household` | `#f97316` оранжевый | | `sleep`
| `#6366f1` индиго | | `checkin` | `#14b8a6` тиловый | | `measurements` |
`#ec4899` розовый | | `steps` | `#8b5cf6` фиолетовый | | `supplements` |
`#0ea5e9` голубой | | _(warning)_ | `#f59e0b` янтарь |

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

### BROKEN (цепочка прервалась)

- «Один шаг в сторону — не конец пути. Следующее решение уже может быть
  хорошим.»
- «Не всё или ничего. Даже 70% хороших решений — отличный день.»
- «Цепочка прервалась? Начни новую. Каждая цепочка из 2+ звеньев работает.»

### RECOVERY (возврат после срыва)

- «Новая цепочка начинается. Это важнее, чем быть идеальным.»
- «Ты вернулся в ритм. Первый шаг после паузы — самый важный.»
- «После перерыва каждое решение имеет значение. Ты уже на пути.»

### ANTI_LICENSING (2ч после тренировки, приоритет над любым состоянием)

- «Тренировка — сама по себе победа. Не «награждай» себя едой.»
- «После нагрузки организм лучше всего усвоит белок и овощи.»
- «Классная тренировка! Выбери качество, а не количество.»

> **Исключение:** ANTI_LICENSING не активируется при BROKEN и EMPTY.

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
│   ├── --meal / --training / --household / --sleep / --checkin / --measurements / --steps / --supplements / --insulin — цвет по типу
│   ├── --warning                 — янтарь #f59e0b, solid border (v2.2.0)
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

**Фильтр в консоли:** `[HEYS.cascade]`

Все логи используют `console.info` (или `console.warn` для предупреждений).

### Полная карта логов (v2.1.0)

| Эмодзи              | Лог                             | Когда                                         |
| ------------------- | ------------------------------- | --------------------------------------------- |
| `─── v2.1.0 START`  | computeCascadeState START       | Начало расчёта + список фич v2.1.0            |
| `🧬`                | v2.1.0 features                 | continuous/baselines/circadian/synergies      |
| `📥`                | Input data                      | Входные параметры (расширенные)               |
| `🏠 [EVENT]`        | Household (v2.1.0 log2)         | log2 adaptive scoring + baseline              |
| `🍽️ [MEAL N/M]`     | Meal (v2.1.0 continuous)        | continuous + circadian modifier + formula     |
| `💪 [TRAINING N/M]` | Training (v2.1.0 load×sqrt)     | load×intensity, diminishing, formula          |
| `💪`                | Recovery / no training          | recovery-aware + weekly load check            |
| `😴`                | Sleep onset (v2.1.0 sigmoid)    | chronotype-adaptive + consistency + variance  |
| `😴`                | Sleep duration (v2.1.0 bell)    | Gaussian bell-curve + asymmetry + recovery    |
| `🚶`                | Steps (v2.1.0 tanh)             | adaptive goal + tanh formula                  |
| `⚖️`                | Checkin (v2.1.0 streak)         | base + streak + trend + formula               |
| `📏`                | Measurements (v2.1.0 cadence)   | completeness + cadence + diminishing          |
| `💊`                | Supplements (v2.1.0 continuous) | ratio + streak + formula                      |
| `⚡`                | InsulinWave (v2.1.0 sigmoid)    | sigmoid overlap + log2 gap + fasting          |
| `📊`                | v2.1.0 Scoring summary          | rawWeights + active/skipped + method          |
| `🎯`                | Confidence layer (v2.1.0)       | per-factor confidence + avg + quality         |
| `📅`                | Day-type (v2.1.0)               | training/rest/active_rest + effect            |
| `🔗`                | Cross-factor synergies          | count + names + bonuses + capped              |
| `📋`                | Events sorted (N total)         | финальный список событий                      |
| `⛓️`                | Chain algorithm trace           | трейс каждого шага цепочки                    |
| `🔗`                | Chain result                    | итог: chain, maxChain, warnings[]             |
| `🏷️`                | State determination             | score-driven (v2.2.0)                         |
| `⏰`                | Post-training window            | активно/не активно и эффект                   |
| `💬`                | Message selected                | пул, индекс, текст сообщения                  |
| `📊`                | Momentum score                  | формула и результат                           |
| `💡`                | Next step hint                  | какой hint и почему                           |
| `✅ v2.2.0 DONE`    | computeCascadeState DONE        | итоговый объект + elapsed                     |
| `🧬 v2.2.0 subsys`  | v2.2.0 subsystems               | dayType + synergies + confidence + chainModel |
| `─────────────`     | разделитель                     | конец расчёта                                 |
| `📌`                | renderCard called               | вызов точки входа                             |
| `⏭️`                | No activity / State=EMPTY       | карточка не показывается                      |
| `🧠 Cache MISS`     | recompute triggered             | входные данные изменились, пересчёт           |
| `⚡ Cache HIT`      | compute skipped                 | данные не изменились, кэш использован         |
| `🚀`                | Rendering CascadeCard           | карточка рендерится                           |
| `🎨`                | CascadeCard render              | каждый рендер компонента                      |
| `🔄`                | Toggle expanded                 | раскрытие/закрытие                            |
| `✅ Module loaded`  | загрузка модуля v2.1.0          | при загрузке скрипта                          |

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
HEYS.CascadeCard.VERSION; // → "2.1.0"

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
  VERSION:             '2.1.0',
  STATES:              { EMPTY, BUILDING, GROWING, STRONG, BROKEN, RECOVERY },
  STATE_CONFIG:        { [state]: { icon, color, label } },
  MESSAGES:            { [poolKey]: [{ short }] },
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

| Версия | Дата       | Изменение                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0.0 | 2026-02-19 | Первая версия. Использовала `HEYS.ExpandableCard`. Название «Твой импульс сегодня»                                                                                                                                                                                                                                                                                                                                                                                                |
| v1.1.0 | 2026-02-19 | Standalone архитектура (без `ExpandableCard`). Детальное 12-шаговое логирование. Переименование → «Ваш позитивный каскад». Явные DOM-коннекторы вместо CSS `::before`                                                                                                                                                                                                                                                                                                             |
| v1.2.1 | 2026-02-19 | Decision chain visualization улучшения. 816 LOC                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| v2.0.0 | 2026-02-19 | 10-факторная поведенческая оценка. 17-шаговый алгоритм. Новые типы событий: household, sleep, checkin, measurements, supplements, insulin. EVENT_WEIGHTS система. Score-based состояния (BUILDING≥1.5, GROWING≥4.0, STRONG≥7.0). MOMENTUM_TARGET=10. Полное логирование всех пропущенных шагов. ~1195 LOC                                                                                                                                                                         |
| v2.1.0 | 2026-02-20 | Научный апгрейд всех 10 факторов: непрерывные функции (sigmoid/bell-curve/log2) вместо ступеней. Персональный baseline (14-дневная медиана). Chronotype-adaptive сон. Training load (dur×intensity) + recovery-aware. Confidence layer (data volume → weight modulation). Day-Type awareness (training/rest/active). 5 кросс-факторных синергий. Пороги: GROWING≥4.5, STRONG≥8.0, MOMENTUM_TARGET=12. 21-шаговый алгоритм                                                         |
| v2.2.0 | 2026-02-20 | **Soft Chain Degradation + Score-driven States.** Цепочка больше не обнуляется при негативном событии — мягкая деградация с 3 уровнями пенальти (MINOR=1, MEDIUM=2, SEVERE=3) в зависимости от тяжести. Состояние определяется только по score (без hasBreak override): STRONG≥8, GROWING≥4.5, BUILDING≥1.5, RECOVERY>0, BROKEN≤0. Визуально: жёлто-янтарные предупреждения (⚠) вместо серых разрывов (✗). API: `breaks[]` → `warnings[]` (с полями penalty, chainAfter, weight) |
