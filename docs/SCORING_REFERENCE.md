# 📊 HEYS Scoring Reference

> **Справочник скоринговых систем HEYS** Версия: 1.1.0 | Обновлено: 2026-03-20

**📌 Основной справочник данных**:
[DATA_MODEL_REFERENCE.md](./DATA_MODEL_REFERENCE.md) — структуры данных, ключи,
базовые расчёты

**📚 Связанные документы**:

- [DATA_MODEL_ANALYTICS.md](./DATA_MODEL_ANALYTICS.md) — Predictive Insights,
  Gamification, Phenotype, EWS
- [DATA_MODEL_NUTRITION.md](./DATA_MODEL_NUTRITION.md) — MQS, Caloric
  Debt/Excess, Insulin Wave

---

## 📊 Status Score (0-100)

**Файл**: `heys_status_v1.js` | **API**: `HEYS.StatusScore.calculate(dayData)`

Комплексная оценка качества дня на основе 9 факторов в 4 категориях.

### Факторы и веса

| #   | Фактор        | Вес | Категория | Шкала скоринга                                                     |
| --- | ------------- | --- | --------- | ------------------------------------------------------------------ |
| 1   | **kcal**      | 15% | Nutrition | ratio 0.85-1.10=100, 0.75-0.85/1.10-1.25=80, <0.50/>1.50=20        |
| 2   | **protein**   | 10% | Nutrition | ≥90% target=100, 80-90%=80, 60-80%=60, 40-60%=40, <40%=20          |
| 3   | **timing**    | 10% | Nutrition | lastMeal <20:00=100, 20-21=80, 21-22=60, 22-23=40, >23:00=20       |
| 4   | **steps**     | 10% | Activity  | ≥100% goal=100, 80%=80, 60%=60, 40%=40, <20%=20                    |
| 5   | **training**  | 10% | Activity  | 45+min=100, 30-45=85, 15-30=70, 1-15=60, 0=50 (нет тренировки ≠ 0) |
| 6   | **household** | 5%  | Activity  | 60+min=100, 30-60=80, 15-30=60, 1-15=40, 0=30                      |
| 7   | **sleep**     | 15% | Recovery  | ratio 0.95-1.15=100, 0.85-0.95/1.15-1.25=80, <0.65/>1.35=20        |
| 8   | **stress**    | 10% | Recovery  | ≤3=100, 4-5=70, 6-7=40, >7=20 (инвертированный — меньше = лучше)   |
| 9   | **water**     | 15% | Hydration | ≥95% goal=100, 80-95%=80, 60-80%=60, 40-60%=40, <40%=20            |

**Формула**: `StatusScore = Σ (factor_score × weight)`

> **Примечание**: Если фактор не заполнен (null/0), его вес перераспределяется
> пропорционально между остальными заполненными факторами.

### Уровни Status Score

| Уровень   | Диапазон | Эмодзи | Цвет           | Hex       |
| --------- | -------- | ------ | -------------- | --------- |
| Excellent | 85-100   | ⭐     | 🟢 Зелёный     | `#22c55e` |
| Good      | 70-84    | 😊     | 🟢 Светло-зел. | `#4ade80` |
| Okay      | 50-69    | 😐     | 🟡 Жёлтый      | `#eab308` |
| Low       | 30-49    | 😟     | 🟠 Оранжевый   | `#f97316` |
| Critical  | 0-29     | 😰     | 🔴 Красный     | `#ef4444` |

### Модификаторы

| Контекст            | Модификатор            | Описание                               |
| ------------------- | ---------------------- | -------------------------------------- |
| Refeed Day          | `timing` → fixed 100   | В загрузочный день тайминг не штрафует |
| Training Day        | `training` weight ×1.2 | Тренировочные дни получают больший вес |
| No data (<=2 meals) | Score = null           | Слишком мало данных для расчёта        |

### API

```javascript
HEYS.StatusScore.calculate(opts);
// opts: { dayData, profile, dayTot, normAbs, waterGoal, previousStatus }
// Результат:
{
  score: 72,           // итоговый с учётом сглаживания
  rawScore: 74,        // без сглаживания
  level: { id: 'good', label: 'Хорошо', emoji: '✅', color: '#22c55e' },
  factorScores: { kcal: 100, protein: 80, ... },  // score 0-100 по каждому фактору
  factorDetails: {                                 // фактические значения для UI
    kcal: { value: 1750, target: 2000, unit: 'ккал', percent: 88 },
    protein: { value: 62, target: 80, unit: 'г', percent: 78 },
    sleep: { value: 7.5, target: 8, unit: 'ч', percent: 94 },
    water: { value: 1600, target: 2000, unit: 'мл', percent: 80 },
    steps: { value: 7200, target: 10000, unit: 'шагов', percent: 72 },
    // ...
  },
  breakdown: [         // полный explainability-массив, один элемент на фактор
    {
      factorId: 'kcal',
      label: 'Калории', icon: '🔥',
      weight: 15, category: 'nutrition',
      score: 100,
      value: 1750, target: 2000, unit: 'ккал', percent: 88,
      issue: null, recommendation: null
    },
    // ...
  ],
  categoryScores: {          // агрегат по категориям
    nutrition: { score: 88, label: 'Питание', icon: '🍎', color: '#f97316' },
    activity: { score: 65, ... },
    recovery: { score: 91, ... },
    hydration: { score: 80, ... }
  },
  topIssues: [...],    // ≤2 проблемы с рекомендациями
  topActions: [...],   // ≤2 конкретных шага
}
```

> `breakdown` — основной интерфейс для explainability-UI. Содержит всё: метку,
> фактическое значение + цель + единицу, score, issue и recommendation.

---

## 🎯 Day Score (0-10)

**Файл**: `heys_day_calculations.js` | **Поля DayRecord**: `dayScore`,
`dayScoreManual`

Субъективная оценка качества дня пользователем (или авто-расчёт).

### Автоматическая формула

```javascript
dayScore = (mood + wellbeing + (10 - stress)) / 3;
```

Где:

- `mood` — оценка настроения (0-10) из утреннего чек-ина
- `wellbeing` — самочувствие (0-10) из утреннего чек-ина
- `stress` — уровень стресса (0-10, инверсия: 10=максимальный)

### Ручной vs авто

| Поле             | Тип     | Описание                            |
| ---------------- | ------- | ----------------------------------- |
| `dayScore`       | number  | Значение 0-10 (авто или ручное)     |
| `dayScoreManual` | boolean | Если true — значение задано вручную |

**Cloud merge**: При конфликте `dayScoreManual=true` выигрывает ручное значение.

### dayScoreRaw (derived, in-memory)

Помимо `dayScore` (целое 0-10), функция `calculateDayAverages()` возвращает
`dayScoreRaw` — значение с точностью 1 десятичного знака (например `6.7`).

- **Не хранится в облаке** — вычисляется при каждом пересчёте и живёт только в
  памяти/реактивном состоянии дня.
- Реактивный эффект `heys_day_rating_averages_v1.js` записывает `dayScoreRaw` в
  состояние дня наравне с `dayScore`.
- Используется внутри `heys_relapse_risk_v1.js` как один из входных сигналов для
  более точного (без округления) расчёта риска срыва.

```javascript
const { dayScore, dayScoreRaw } = HEYS.dayCalculations.calculateDayAverages(
  meals,
  trainings,
  dayData,
);
// dayScore = 7 (integer, stored)
// dayScoreRaw = 6.7 (float, in-memory only)
```

### Использование

- Отображается в виджете дня (эмодзи)
- Используется в Predictive Insights паттерне `MOOD_FOOD`
- Влияет на EWS предупреждение `EMOTIONAL_EATING_RISK`
- Используется в формуле Advice `emotional_risk_high`
- `dayScoreRaw` — вспомогательный сигнал для Relapse Risk Score v1

---

## 🔄 Cascade Risk Score (CRS v7)

**Файл**: `heys_cascade_card_v1.js` | **Версия**: CRS_KEY_VERSION = 'v7'

CRS оценивает риск «каскада» — ситуации, когда недобор или перебор калорий за
день может привести к компенсаторному поведению (переедание, отказ от еды).

### Компоненты CRS

| Компонент           | Вес | Описание                         |
| ------------------- | --- | -------------------------------- | ----------- | --- |
| **kcalDeviation**   | 30% | Отклонение от нормы (            | ratio - 1.0 | )   |
| **mealTiming**      | 20% | Распределение калорий по часам   |
| **proteinAdequacy** | 15% | Достаточность белка (% от нормы) |
| **emotionalState**  | 15% | mood + stress + wellbeing        |
| **historicalRisk**  | 10% | Паттерны из последних 7 дней     |
| **sleepDebt**       | 10% | Дефицит сна (часы vs норма)      |

### v7 Chronotype Adaptation

CRS v7 адаптирует тайминг к хронотипу пользователя:

- **Meal Timing threshold (MT)**: 8.5 (вместо фиксированного 20:00)
- Хронотип определяется из `profile.bedtime` и `profile.wakeUpTime`
- Совы получают меньший штраф за поздний тайминг

### 6 состояний Cascade Card

| Состояние   | CRS диапазон | Цвет       | Действие                        |
| ----------- | ------------ | ---------- | ------------------------------- |
| `safe`      | 0-15         | 🟢 Зелёный | Всё в порядке                   |
| `attention` | 15-30        | 🟡 Жёлтый  | Мягкое предупреждение           |
| `warning`   | 30-50        | 🟠 Оранж.  | Показать рекомендации           |
| `high_risk` | 50-70        | 🔴 Красный | Активные рекомендации           |
| `critical`  | 70-90        | 🟣 Фиолет. | Эмоциональная поддержка         |
| `emergency` | 90-100       | ⚫ Чёрный  | Максимальная поддержка + советы |

### Momentum Algorithm

```javascript
// CRS учитывает динамику: улучшение/ухудшение за последние 3 приёма
momentum = (currentCRS - avgCRS_last3meals) / avgCRS_last3meals;
// momentum < -0.1 → improving (снижение severity)
// momentum > 0.1 → worsening (повышение severity)
```

### Миграция v6 → v7

Автоматическая при первом расчёте. Изменения:

- `MT` (Meal Timing): фиксированный → chronotype-adaptive (`8.5` базовый)
- `emotionalState` weight: 10% → 15%
- `historicalRisk` weight: 15% → 10%
- Добавлен `sleepDebt` как отдельный компонент (был частью emotional)

### API

```javascript
HEYS.CascadeCard.calculateCRS(dayData, profile, history7days);
// Результат: { crs: 42, state: 'warning', momentum: -0.05, components: {...} }

HEYS.CascadeCard.getState(crs);
// Результат: { state: 'warning', color: '#f97316', emoji: '🟠' }

HEYS.CascadeCard.getRecommendations(state, dayData);
// Результат: [{ type: 'nutrition', text: '...', priority: 'high' }, ...]
```

---

---

## ⚡ Relapse Risk Score (RRS v1)

**Файл**: `heys_relapse_risk_v1.js` | **Namespace**: `HEYS.RelapseRisk`

Predictive-оценка риска «срыва» — вероятности эмоционального переедания или
отказа от следования нутриционному плану в ближайшие 3–24 часа. Живёт целиком
как runtime-вычисление: в облаке не хранится.

### Диапазон и уровни

| Уровень    | Диапазон | Поведение системы                          |
| ---------- | -------- | ------------------------------------------ |
| `low`      | 0–19     | Фонового риска нет                         |
| `guarded`  | 20–39    | Слабые предупреждающие сигналы             |
| `elevated` | 40–59    | Активируются targeted advice-правила       |
| `high`     | 60–79    | Priority-совет в Advice Engine             |
| `critical` | 80–100   | Неотложный совет, `canSkipCooldown = true` |

### 6 компонент и веса

| Компонент                | Вес | Сигналы                                             |
| ------------------------ | --- | --------------------------------------------------- |
| `stressLoad`             | 24% | stressAvg, mood, wellbeing                          |
| `restrictionPressure`    | 22% | kcal дефицит > 30%, белок < 60% нормы               |
| `sleepDebt`              | 18% | sleepHours vs norm (сегодня + 2 дня истории)        |
| `rewardExposure`         | 16% | Сладкое/фастфуд в последнем приёме, время суток     |
| `timingContext`          | 10% | Часовой пояс, пиковые окна риска (16–20 ч, полночь) |
| `emotionalVulnerability` | 10% | Паттерн из 7 дней истории: частота `dayScore < 5`   |

### Временны́е окна

Каждый вызов `calculate()` возвращает объект `windows` с прогнозами:

```javascript
{
  next3h:  60,   // вероятность 0-100: срыв в ближайшие 3 часа
  tonight: 45,   // вероятность до конца дня (до 24:00)
  next24h: 38    // агрегированный прогноз на 24 ч
}
```

### API

```javascript
const result = HEYS.RelapseRisk.calculate({
  dayData,        // текущий DayRecord
  dayTot,         // аккумулированные за день КБЖУ
  normAbs,        // нормы пользователя
  profile,        // профиль (sleepHours, chronotype, ...)
  historyDays,    // массив последних N DayRecord (обычно 7)
});

// Возвращает:
{
  score: 62,                          // 0-100
  level: 'high',                      // 'low'|'guarded'|'elevated'|'high'|'critical'
  confidence: 0.78,                   // 0-1
  primaryDrivers: [{ id: 'stress_load', weight: 0.24, value: 0.81 }],
  protectiveFactors: [],
  windows: { next3h: 55, tonight: 62, next24h: 48 },
  recommendations: ['...'],
  debug: { components: {...} }
}
```

### Интеграция с Advice Engine

Advice Engine (`advice/_core.js`) вычисляет `relapseRisk` один раз при
инициализации контекста и передаёт его через `ctx.relapseRisk` во все модули.

Модуль `advice/_emotional.js` содержит 6 правил, активируемых на основе RRS:

| ID                         | Триггер                                  | Priority |
| -------------------------- | ---------------------------------------- | -------- |
| `relapse_risk_high`        | level `critical`/`high`                  | 1 / 3    |
| `relapse_risk_elevated`    | level `elevated`, hour ≥ 16              | 12       |
| `relapse_risk_restriction` | topDriver `restriction_pressure` + ≥ 15ч | 5        |
| `relapse_risk_stress`      | topDriver `stress_load`                  | 6        |
| `relapse_risk_sleep_debt`  | topDriver `sleep_debt`                   | 8        |
| `relapse_risk_tonight`     | `windows.tonight` ≥ 65, hour < 18        | 10       |

Все правила объединены в дедупликационную группу `relapse`
(`heys_advice_rules_v1.js`).

### Владение секцией CRASH_RISK

RRS v1 — **единственный источник** данных для секции **CRASH_RISK** (Insights
dashboard). Ранее приоритет crashRisk менялся с учётом EWS warnings
(`SLEEP_DEBT`, `STRESS_ACCUMULATION`, `BINGE_RISK`, `CALORIC_DEBT`), что
создавало дублирование сигналов. Начиная с `2026-03-20`, EWS boost убран:

- CRASH_RISK priority определяется **только** по `relapseRisk.score` (0–100).
- 4 EWS warnings остаются как самостоятельные health-сигналы в ленте EWS и
  используются `pi_causal_chains.js` и `advice/_core.js`, но **не влияют** на
  CRASH_RISK priority.
- SCIENCE_INFO для CRASH_RISK и CRASH_RISK_QUICK обновлены, чтобы описывать
  именно 6-компонентную формулу RRS.

---

## Связанные файлы

| Файл                       | Описание                                  |
| -------------------------- | ----------------------------------------- |
| `heys_status_v1.js`        | Status Score (9 факторов, smooth scoring) |
| `heys_day_calculations.js` | Day Score, dayScoreRaw, derived metrics   |
| `heys_cascade_card_v1.js`  | CRS v7, состояния каскада, momentum       |
| `heys_relapse_risk_v1.js`  | Relapse Risk Score v1 (RRS)               |
| `heys_cloud_merge_v1.js`   | Merge logic для dayScore/dayScoreManual   |
| `advice/_core.js`          | Advice Engine, ctx.relapseRisk            |
| `advice/_emotional.js`     | Advice rules для relapse risk             |
| `heys_advice_rules_v1.js`  | Deduplication group `relapse`             |

---

**Версия документа**: 1.1.0 **Последнее обновление**: 2026-03-19
