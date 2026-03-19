# 📊 HEYS Analytics & Scoring Reference

> **Справочник аналитических систем HEYS: скоринги, паттерны, предупреждения**
> Версия: 5.6.0 | Обновлено: 2026-02-26 | **41 научный паттерн** | **25 типов
> предупреждений** | **36 достижений** | **6 фенотипов**

**📌 Основной справочник данных**:
[DATA_MODEL_REFERENCE.md](./DATA_MODEL_REFERENCE.md) — структуры данных, ключи,
базовые расчёты

**📚 Связанные документы**:

- [DATA_MODEL_NUTRITION.md](./DATA_MODEL_NUTRITION.md) — питание, инсулиновая
  волна, тренировочный контекст
- [INSULIN_WAVE_DOCUMENTATION.md](./INSULIN_WAVE_DOCUMENTATION.md) — полная
  документация инсулиновой волны (1250 строк)
- [SCIENTIFIC_REFERENCES.md](./SCIENTIFIC_REFERENCES.md) — полный список PMID
  ссылок
- [SCORING_REFERENCE.md](./SCORING_REFERENCE.md) — Status Score, Day Score, CRS
  (полные алгоритмы)
- [APP_SYSTEMS_REFERENCE.md](./APP_SYSTEMS_REFERENCE.md) — Виджеты, Каскад,
  Поиск, Экспорт, Триал

---

## 🔮 Predictive Insights v6.3.0 — 41 научный паттерн

> **Версия**: 6.3.0 | **Обновлено**: 2026-02-26 | **100% покрытие PMID** |
> **41/41 паттернов активны** | **⚡ Мемоизация (44% быстрее)** **Файлы**:
> `pi_patterns.js` (анализаторы), `pi_constants.js` (SCIENCE_INFO),
> `pi_ui_cards.js` (UI), `pi_cache.js` (мемоизация)

### Философия системы

HEYS Insights — персонализированная аналитическая система на базе **научных
метрик с PMID-ссылками**. Каждый из 41 паттернов:

- 🔬 **Научно обоснован** — источники с PubMed PMID, DRI/WHO стандарты
- 📊 **Использует реальные данные** — 35 полей (11 витаминов, 9 минералов, PUFA,
  NOVA, качество)
- 🎯 **Персонализирован** — учёт цели (дефицит/поддержка/профицит), BMI,
  возраст, пол
- ⚡ **Действенен** — не просто «наблюдения», а конкретные рекомендации
- 🧘 **Безопасен** — без диагнозов, только корреляции и риски
- ⚡ **Оптимизирован** — мемоизация дорогих вычислений

### Оптимизация производительности (v5.2.0)

**Pattern Memoization Layer**:

- **Стратегия**: LRU кэш с TTL 60s, Map-based storage, max 100 записей
- **Мемоизированные функции**:
  - `calculateCorrelationMatrix` — 12 корреляционных пар (самая дорогая функция)
  - `detectMetabolicPatterns` — анализ чувствительности к углеводам, жировая
    адаптация
  - `calculateGlycemicVariability` — CV%, CONGA метрики
  - `calculateAllostaticLoad` — композитный индекс стресса (7 биомаркеров)
- **Результаты**: P50 180ms → 100ms (44% прирост), cache hit rate 70-85%

### 41 паттерн (5 версий)

#### Core Patterns v2-v3 (19 паттернов)

| ID  | Паттерн                 | Категория  | Данные                 | MinDays |
| --- | ----------------------- | ---------- | ---------------------- | ------- |
| 1   | **MEAL_TIMING**         | TIMING     | meals, intervals       | 7       |
| 2   | **WAVE_OVERLAP**        | TIMING     | insulin waves          | 7       |
| 3   | **LATE_EATING**         | TIMING     | meals after 21:00      | 7       |
| 4   | **MEAL_QUALITY_TREND**  | NUTRITION  | MQS 7-14d              | 7       |
| 5   | **SLEEP_WEIGHT**        | RECOVERY   | sleep ↔ weight        | 7       |
| 6   | **SLEEP_HUNGER**        | RECOVERY   | недосып → голод        | 7       |
| 7   | **TRAINING_KCAL**       | ACTIVITY   | compensation           | 7       |
| 8   | **STEPS_WEIGHT**        | ACTIVITY   | NEAT ↔ weight         | 7       |
| 9   | **PROTEIN_SATIETY**     | NUTRITION  | белок → сытость        | 7       |
| 10  | **FIBER_REGULARITY**    | NUTRITION  | клетчатка 25-35г       | 7       |
| 11  | **STRESS_EATING**       | PSYCHOLOGY | стресс → перееда       | 7       |
| 12  | **MOOD_FOOD**           | PSYCHOLOGY | настроение ↔ еда      | 7       |
| 13  | **CIRCADIAN**           | TIMING     | распределение по часам | 7       |
| 14  | **NUTRIENT_TIMING**     | TIMING     | до/после тренировки    | 5       |
| 15  | **INSULIN_SENSITIVITY** | METABOLISM | реакция на углеводы    | 14      |
| 16  | **GUT_HEALTH**          | NUTRITION  | разнообразие 15/10     | 7       |
| 17  | **NUTRITION_QUALITY**   | NUTRITION  | макро/микро баланс     | 7       |
| 18  | **NEAT_ACTIVITY**       | ACTIVITY   | бытовая активность     | 7       |
| 19  | **MOOD_TRAJECTORY**     | PSYCHOLOGY | динамика 7-14 дней     | 7       |

#### Advanced Patterns v4 (6 паттернов)

| ID  | Паттерн                   | Категория  | MinDays |
| --- | ------------------------- | ---------- | ------- |
| 20  | **SLEEP_QUALITY**         | RECOVERY   | 7       |
| 21  | **WELLBEING_CORRELATION** | RECOVERY   | 7       |
| 22  | **HYDRATION**             | RECOVERY   | 7       |
| 23  | **BODY_COMPOSITION**      | METABOLISM | 14      |
| 24  | **CYCLE_IMPACT**          | RECOVERY   | 14      |
| 25  | **WEEKEND_EFFECT**        | PSYCHOLOGY | 7       |

#### Deep Analytics v5 (6 паттернов)

| ID  | Паттерн                 | Категория  | MinDays |
| --- | ----------------------- | ---------- | ------- |
| 26  | **MICRONUTRIENT_RADAR** | NUTRITION  | 7       |
| 27  | **OMEGA_BALANCER**      | NUTRITION  | 7       |
| 28  | **HEART_HEALTH**        | METABOLISM | 7       |
| 29  | **NOVA_QUALITY**        | NUTRITION  | 7       |
| 30  | **TRAINING_RECOVERY**   | ACTIVITY   | 5       |
| 31  | **HYPERTROPHY**         | METABOLISM | 14      |

#### v6.0 Phase 1-5 (10 паттернов)

| ID  | Паттерн                     | Phase | Категория  | MinDays |
| --- | --------------------------- | ----- | ---------- | ------- |
| 32  | **VITAMIN_DEFENSE**         | 1     | NUTRITION  | 7       |
| 33  | **B_COMPLEX_ANEMIA**        | 1     | METABOLISM | 7       |
| 34  | **GLYCEMIC_LOAD**           | 2     | METABOLISM | 5       |
| 35  | **PROTEIN_DISTRIBUTION**    | 2     | NUTRITION  | 7       |
| 36  | **ANTIOXIDANT_DEFENSE**     | 3     | RECOVERY   | 7       |
| 37  | **ADDED_SUGAR_DEPENDENCY**  | 3     | METABOLISM | 7       |
| 38  | **BONE_HEALTH**             | 4     | RECOVERY   | 14      |
| 39  | **TRAINING_TYPE_MATCH**     | 4     | ACTIVITY   | 5       |
| 40  | **ELECTROLYTE_HOMEOSTASIS** | 5     | RECOVERY   | 7       |
| 41  | **NUTRIENT_DENSITY**        | 5     | NUTRITION  | 5       |

### Health Score (Goal-Aware Aggregation)

**Категории** (5):

- **Nutrition** (35%): 11 паттернов
- **Timing** (20%): 6 паттернов
- **Activity** (20%): 5 паттернов
- **Recovery** (15%): 9 паттернов
- **Metabolism** (5%): 10 паттернов

**Formula**: `Σ(category_avg × goal_weight) / Σ(weights)` → 0-100 score

### API Usage

```javascript
const insights = await HEYS.InsightsPI.calculate({
  days: last30Days,
  profile: profile,
  minDays: 7
});

// Result structure
insights = {
  available: true,
  patterns: {
    MEAL_TIMING: {
      score: 85,
      confidence: 0.92,
      trend: 'improving',
      data: { avgInterval: 4.2, optimalMeals: 0.85 },
      insights: ['Отличные интервалы между приёмами', ...],
      actions: ['Сохраняй текущий ритм', ...]
    }
  },
  healthScore: {
    total: 78,
    categories: { nutrition: 82, timing: 75, activity: 70, recovery: 80, metabolism: 76 },
    topIssues: [...],
    topWins: [...]
  }
};
```

---

## 🧪 Harm Score — Научная система оценки вредности продуктов (0-10)

> **Версия**: 3.0.0 | **Обновлено**: 2026-01-18 | **Шкала**: 0 (суперполезный) →
> 10 (супервредный) **Файл**: `heys_harm_v1.js` | **NOVA**: 284 продуктов
> классифицированы | **Extended Nutrients**: 29 колонок в БД

### Философия оценки

Harm Score — интегральная оценка **метаболической нагрузки** продукта на
организм. Учитывает не только "плохие" компоненты, но и **защитные факторы**
(клетчатка, белок, полезные жиры).

### Формула расчёта Harm Score v2.0

```
HarmScore = PENALTIES - BONUSES

PENALTIES:
  + trans100 × 3.0      # Транс-жиры — ГЛАВНЫЙ враг (×3 множитель)
  + simple100 × 0.08    # Простые сахара
  + badFat100 × 0.10    # Насыщенные жиры
  + sodium100 × 0.002   # Натрий
  + GI_penalty          # Штраф за высокий ГИ
  + NOVA_penalty        # Штраф за переработку

BONUSES:
  - fiber100 × 0.30     # Клетчатка — мощный протектор
  - protein100 × 0.06   # Белок снижает ГИ
  - goodFat100 × 0.04   # Полезные жиры
```

### 🏭 NOVA Classification — Степень переработки

| NOVA  | Название               | Штраф | Примеры                   |
| ----- | ---------------------- | ----- | ------------------------- |
| **1** | Необработанные         | 0.0   | Яблоко, курица, рис, яйца |
| **2** | Кулинарные ингредиенты | 0.3   | Масло, сахар, соль, мука  |
| **3** | Переработанные         | 0.8   | Консервы, сыр, хлеб, сок  |
| **4** | Ультрапереработанные   | 2.5   | Чипсы, колбаса, газировка |

### Шкала интерпретации (0-10)

| Диапазон     | Категория           | Описание                                               |
| ------------ | ------------------- | ------------------------------------------------------ |
| **0.0-1.0**  | 🟢 Суперполезный    | Максимальная польза, можно есть без ограничений        |
| **1.1-2.5**  | 🟢 Полезный         | Высокая пищевая ценность, рекомендуется к употреблению |
| **2.6-4.0**  | 🟡 Нейтральный      | Сбалансированный профиль, умеренное потребление        |
| **4.1-5.5**  | 🟠 Умеренно вредный | Содержит негативные компоненты, ограничить потребление |
| **5.6-7.0**  | 🔴 Вредный          | Высокое содержание сахара/жиров, употреблять редко     |
| **7.1-8.5**  | 🔴 Очень вредный    | Минимальная пищевая ценность, избегать                 |
| **8.6-10.0** | ⚫ Супервредный     | Опасно для здоровья при регулярном потреблении         |

### API использования

```javascript
const harm = HEYS.Harm.calculateHarmScore(product);
const { id, name, color, emoji } = HEYS.Harm.getHarmCategory(harm);
const nova = HEYS.Harm.detectNovaGroup('Чипсы картофельные'); // → 4
const mealHarm = HEYS.Harm.calculateMealHarm(
  meal,
  productIndex,
  getProductFromItem,
);
const enriched = HEYS.Harm.enrichProduct(product);
```

---

## 📊 Status Score (Статус дня 0-100)

**Файл**: `heys_status_v1.js` | **Версия**: 1.0.0

### Факторы и веса

| Фактор      | Вес | Категория | Описание                    |
| ----------- | --- | --------- | --------------------------- |
| `kcal`      | 15% | nutrition | Выполнение нормы калорий    |
| `protein`   | 10% | nutrition | Выполнение нормы белка      |
| `timing`    | 10% | nutrition | Интервалы между приёмами    |
| `steps`     | 10% | activity  | Достижение 10000 шагов      |
| `training`  | 10% | activity  | Наличие тренировки          |
| `household` | 5%  | activity  | Бытовая активность          |
| `sleep`     | 15% | recovery  | Качество и длительность сна |
| `stress`    | 10% | recovery  | Уровень стресса (инверсия)  |
| `water`     | 15% | hydration | Выполнение нормы воды       |

### Уровни статуса

| Уровень   | Порог | Цвет         | Эмодзи |
| --------- | ----- | ------------ | ------ |
| excellent | ≥85   | #22c55e (🟢) | ⭐     |
| good      | ≥70   | #eab308 (🟡) | ✓      |
| okay      | ≥50   | #f97316 (🟠) | ~      |
| low       | ≥30   | #ef4444 (🔴) | ↓      |
| critical  | <30   | #6b7280 (⚫) | ⚠     |

---

## 🎮 Gamification (XP, Уровни, Достижения)

**Файл**: `heys_gamification_v1.js` | **Версия**: 1.0.0

### Уровни (25 уровней)

| Ранг    | Уровни | Эмодзи | XP до следующего |
| ------- | ------ | ------ | ---------------- |
| Новичок | 1-4    | 🌱     | 100-400          |
| Ученик  | 5-9    | 📚     | 500-900          |
| Практик | 10-14  | 💪     | 1000-1400        |
| Эксперт | 15-19  | ⭐     | 1500-1900        |
| Мастер  | 20-25  | 👑     | 2000+            |

### Достижения (36 штук в 8 категориях)

**Streak (5)**: streak_1, streak_2, streak_3, streak_5, streak_7

**Onboarding (9)**: first_checkin, first_meal, first_product, first_steps,
first_water, first_advice, first_supplements, first_training, first_household

**Quality (4)**: perfect_day, perfect_week, balanced_macros, fiber_champion

**Activity (4)**: water_day, water_master, training_week, steps_champion

**Levels (5)**: level_5, level_10, level_15, level_20, level_25

**Habits (2)**: early_bird, night_owl_safe

**Advice (2)**: advice_reader, advice_master

**Metabolic (5)**: metabolic_stable, crash_avoided, low_risk_master,
phenotype_discovered, weekly_wrap_viewed

### XP Actions (13 действий)

| Action              | XP  | Max/day | Описание                          |
| ------------------- | --- | ------- | --------------------------------- |
| `checkin_complete`  | 10  | 1       | Утренний чек-ин завершён          |
| `meal_added`        | 3   | 10      | Приём пищи добавлен               |
| `product_added`     | 3   | 10      | Продукт добавлен в приём          |
| `water_added`       | 2   | 5       | Вода добавлена                    |
| `supplements_taken` | 5   | 1       | Добавки приняты                   |
| `household_added`   | 5   | 1       | Домашняя активность добавлена     |
| `training_added`    | 15  | 1       | Тренировка добавлена              |
| `sleep_logged`      | 5   | 1       | Сон залогирован                   |
| `weight_logged`     | 5   | 1       | Вес записан                       |
| `day_completed`     | 50  | 1       | День завершён (≥3 приёма)         |
| `perfect_day`       | 25  | 1       | Идеальный день (Status Score ≥85) |
| `advice_read`       | 2   | 5       | Совет прочитан                    |
| `steps_updated`     | 3   | 3       | Шаги обновлены                    |

### Level Thresholds (25 уровней)

| Уровень | XP    | Уровень | XP     |
| ------- | ----- | ------- | ------ |
| 1       | 0     | 14      | 11 000 |
| 2       | 100   | 15      | 13 500 |
| 3       | 300   | 16      | 16 500 |
| 4       | 600   | 17      | 20 000 |
| 5       | 1 000 | 18      | 24 000 |
| 6       | 1 500 | 19      | 29 000 |
| 7       | 2 200 | 20      | 35 000 |
| 8       | 3 000 | 21      | 42 000 |
| 9       | 4 000 | 22      | 50 000 |
| 10      | 5 200 | 23      | 60 000 |
| 11      | 6 500 | 24      | 72 000 |
| 12      | 8 000 | 25      | 78 000 |
| 13      | 9 500 |         |        |

### Status Score

> **Полный алгоритм** (9 факторов, веса, 5 уровней) находится в
> **[SCORING_REFERENCE.md](./SCORING_REFERENCE.md)**. Здесь — краткая сводка.

Status Score (0-100) — комплексная оценка качества дня. 9 факторов в 4
категориях: Nutrition (kcal 15%, protein 10%, timing 10%), Activity (steps 10%,
training 10%, household 5%), Recovery (sleep 15%, stress 10%), Hydration (water
15%).

### Rarity (редкость)

| Rarity    | Цвет    | Вероятность |
| --------- | ------- | ----------- |
| common    | #9ca3af | ~50%        |
| rare      | #3b82f6 | ~25%        |
| epic      | #8b5cf6 | ~15%        |
| legendary | #f59e0b | ~8%         |
| mythic    | #ef4444 | ~2%         |

### API

```javascript
HEYS.game.addXP(amount, reason, sourceEl?);
HEYS.game.getLevel();
HEYS.game.getProgress();  // { current, required, percent }
HEYS.game.getStats();     // { totalXP, level, title, progress, ... }
HEYS.game.getAchievements();
HEYS.game.getAchievementProgress(achId);
```

---

## 🔬 Phenotype (Метаболический фенотип)

**Файл**: `heys_phenotype_v1.js` | **Версия**: 1.1.0

### Фенотипы (6 типов)

| ID            | Название         | Характеристика                  | Рекомендации             |
| ------------- | ---------------- | ------------------------------- | ------------------------ |
| `sprinter`    | Спринтер         | Быстрый метаболизм, высокий BMR | Частые приёмы пищи       |
| `marathoner`  | Марафонец        | Стабильный метаболизм           | Регулярный режим         |
| `powerlifter` | Силовик          | Высокий TEF, мышечная масса     | Больше белка             |
| `balanced`    | Сбалансированный | Средние показатели              | Стандартные рекомендации |
| `nightowl`    | Сова             | Поздний хронотип                | Отложенный завтрак       |
| `earlybird`   | Жаворонок        | Ранний хронотип                 | Ранний завтрак           |

### Traits (для radar chart)

| Trait                | Диапазон | Описание                    |
| -------------------- | -------- | --------------------------- |
| `stability`          | 0-100    | Стабильность метаболизма    |
| `recovery`           | 0-100    | Скорость восстановления     |
| `insulinSensitivity` | 0-100    | Чувствительность к инсулину |
| `consistency`        | 0-100    | Постоянство в питании       |
| `chronotype`         | 0-100    | Тип биоритмов               |

### Tier Configuration (уровни уверенности)

| Tier         | Мин. дней | Confidence | Описание                |
| ------------ | --------- | ---------- | ----------------------- |
| `basic`      | 3         | 0.3        | Начальный (мало данных) |
| `developing` | 7         | 0.5        | Развивающийся           |
| `confident`  | 14        | 0.75       | Уверенный               |
| `expert`     | 30        | 0.95       | Экспертный (28+ дней)   |

### API

```javascript
HEYS.Phenotype.calculate(historyDays, profile);
// Результат: { phenotype, traits, tier, confidence, recommendations }

HEYS.Phenotype.getRecommendations(phenotype);
HEYS.Phenotype.getTraitsRadar(traits);
```

---

## 🚨 Early Warning System v4.2

> **Файл**: `pi_early_warning.js` v44 | **Версия**: EWS v4.2 (Phenotype-Aware)
> **25 типов предупреждений** | **Dual-Mode** | **EWS Global Score (0-100)** |
> **Cross-Pattern Causal Chains** | **Weekly Progress Tracking** |
> **Phenotype-Aware Thresholds**

### Dual-Mode

| Параметр   | `mode: 'acute'`                    | `mode: 'full'`         |
| ---------- | ---------------------------------- | ---------------------- |
| Окно       | 7 дней                             | 30 дней                |
| Checks     | 10 (оперативные риски)             | 25 (полный аудит)      |
| Назначение | Header badge — компактный          | Insights card — полный |
| Пропуск    | 15 checks (`reason: 'acute_mode'`) | —                      |

### 25 типов предупреждений

| ID                     | Health Impact | Описание                      |
| ---------------------- | ------------- | ----------------------------- |
| `HEALTH_SCORE_DECLINE` | 85            | Снижение Health Score         |
| `STATUS_DECLINE`       | 80            | Снижение Status Score         |
| `SLEEP_DEBT`           | 95            | Долг сна                      |
| `CALORIC_DEBT`         | 75            | Калорийный дефицит            |
| `WEIGHT_SPIKE`         | 70            | Резкий скачок веса            |
| `HYDRATION_DEFICIT`    | 65            | Дефицит гидратации            |
| `LOGGING_GAP`          | 60            | Пропуск логирования           |
| `PROTEIN_DEFICIT`      | 80            | Дефицит белка                 |
| `STRESS_ACCUMULATION`  | 90            | Накопление стресса            |
| `MEAL_SKIP_PATTERN`    | 70            | Паттерн пропуска еды          |
| `BINGE_RISK`           | 85            | Риск переедания               |
| `MOOD_DECLINE`         | 75            | Снижение настроения           |
| `PATTERN_DEGRADATION`  | 70            | Деградация паттернов (C1-C41) |
| `TRAINING_NO_RECOVERY` | 80            | Тренировка без восстановления |
| `WEIGHT_PLATEAU`       | 65            | Плато веса                    |
| `WEEKEND_PATTERN`      | 60            | Weekend drift                 |

### EWS Global Score (0-100)

**Интерпретационные зоны**:

| Score   | Уровень риска  | Статус      |
| ------- | -------------- | ----------- |
| ≥ 70    | `HIGH_RISK`    | Высокий     |
| 40 – 69 | `MEDIUM_RISK`  | Умеренный   |
| 20 – 39 | `LOW_RISK`     | Низкий      |
| < 20    | `MINIMAL_RISK` | Минимальный |

### Cross-Pattern Causal Chains

**6 встроенных цепочек**:

| Chain ID               | Root Cause   | Описание                                 |
| ---------------------- | ------------ | ---------------------------------------- |
| `SLEEP_STRESS_BINGE`   | SLEEP_DEBT   | Недосып → стресс → переедание            |
| `LOGGING_PATTERN_GOAL` | LOGGING_GAP  | Пропуск логов → паттерн деградация       |
| `CALORIC_MOOD_EVENING` | CALORIC_DEBT | Долг калорий → плохое настроение вечером |

### Weekly Progress Tracking

**localStorage ключ**: `heys_ews_weekly_v1`

**Trend Analysis**:

| Изменение count | Статус      | Direction |
| --------------- | ----------- | --------- |
| ≤ −15%          | `improving` | `down`    |
| от −15% до +15% | `stable`    | `flat`    |
| ≥ +15%          | `worsening` | `up`      |

### Phenotype-Aware Thresholds (EWS v4.2)

**4 EWS-фенотипа** (берутся из `profile.phenotype`):

| Фенотип              | ID                  | Описание                     |
| -------------------- | ------------------- | ---------------------------- |
| Инсулинорезистентный | `insulin_resistant` | IR, высокий вес, высокий GL  |
| Вечерний тип         | `evening_type`      | Поздний хронотип             |
| Низкое насыщение     | `low_satiety`       | Трудность с контролем порций |
| Стресс-едок          | `stress_eater`      | Эмоциональное переедание     |

### API

```javascript
const result = await HEYS.InsightsPI.earlyWarning.detect({
  mode: 'acute', // или 'full'
  profile,
  daysData,
});
// result.warnings, result.globalScore, result.causalChains, result.weeklyProgress

HEYS.InsightsPI.earlyWarning.phenotype.check(); // текущий фенотип
HEYS.InsightsPI.earlyWarning.phenotype.setIR(); // установить IR
```

---

## 🎯 Dynamic Priority Badge v4.3.0

> **Файл**: `pi_constants.js` v4.3.0 | **Функция**: `computeDynamicPriority()` |
> **Обновлено**: 2026-02-18

### Generic Formula (5 источников)

```
priority = max(
  base_level(healthScore),           // 1. Base: ≥80→LOW, 60-79→MEDIUM, 40-59→HIGH, <40→CRITICAL
  trend_boost(healthScore),          // 2. падение ≥10/7д → +1 level
  ews_boost(warnings),               // 3. ≥1 high → HIGH
  pattern_degradation_boost,         // 4. ≥2 паттернов с score<40 → +1 boost
  section_custom_rule,               // 5. section-specific override
)
```

### Section-Specific Priority Rules (v4.2.0)

| Section            | Логика                                                                            |
| ------------------ | --------------------------------------------------------------------------------- |
| `STATUS_SCORE`     | Инверсия: score≥80 → LOW (позитивный статус), <80 → generic formula               |
| `CRASH_RISK`       | По `weightedHighSum` EWS warnings: >0.7 → CRITICAL, >0.4 → HIGH, >0.2 → MEDIUM    |
| `PRIORITY_ACTIONS` | По количеству срочных действий: ≥3 urgent→CRITICAL, ≥1→HIGH, ≥1 any→MEDIUM, 0→LOW |

### Acuteness Decay (v4.3.0)

EWS warning'и теряют вес со временем:

```javascript
decay = Math.max(0.3, 1 - (daysOld - 3) / 27);
// 3-дневный warning: decay = 1.0  (полный вес)
// 7-дневный warning: decay = 0.85
// 25-дневный warning: decay = 0.3  (минимальный вес)
```

### Pattern Degradation Boost (v4.3.0)

```javascript
const degradedPatterns = patterns.filter((p) => p.available && p.score < 40);
const patternDegradationBoost = degradedPatterns.length >= 2 ? 1 : 0;
```

---

## 📈 Metabolic Intelligence (A/B тесты, Data Inventory)

**Файл**: `heys_metabolic_intelligence_v1.js` | **Версия**: 1.0.0

### A/B Testing Variants

| Variant | Описание            | Особенности                |
| ------- | ------------------- | -------------------------- |
| `A`     | Стандартная формула | Базовый вес факторов       |
| `B`     | Sleep-focused       | Больший вес сна в расчётах |
| `C`     | Deficit-focused     | Больший вес дефицита       |

### Data Inventory (полнота данных)

Отслеживает заполненность данных по 8 полям:

| Поле       | Описание    |
| ---------- | ----------- |
| `meals`    | Приёмы пищи |
| `water`    | Вода        |
| `sleep`    | Сон         |
| `weight`   | Вес         |
| `training` | Тренировки  |
| `steps`    | Шаги        |
| `mood`     | Настроение  |
| `stress`   | Стресс      |

### Phenotype Tiers

| Tier       | Мин. дней | Что доступно          |
| ---------- | --------- | --------------------- |
| `BASIC`    | 7         | Базовые инсайты       |
| `STANDARD` | 14        | Паттерны и корреляции |
| `ADVANCED` | 30+       | Полный фенотип        |

---

## 💊 Supplements (Витамины и добавки)

**Файлы**: `heys_supplements_v1.js` (core, v2.0.0),
`heys_supplements_science_v1.js` (science, v1.0.0)

### Core

- **Каталог**: 25+ добавок с иконками, категориями, рекомендациями по таймингу
- **Категории**: immune, brain, bones, sport, beauty, female, sleep, energy,
  metabolism
- **Взаимодействия**: synergies/conflicts (Ca vs Fe/Zn, D3+K2, Fe+VitC и т.д.)
- **Курсы (presets)**: winter, active, women30, beauty, sleep, brain (готовые
  наборы)
- **Напоминания**: интеграция с советами, бейджи «✅ Принял»

### Science расширение

- **Биодоставл ность**: поглощение, оптимальный жир, half-life
- **Формы и дозировки**: магний (oxide/citrate/glycinate), железо (heme/негем),
  омега-3 (EPA/DHA)
- **Циркадные ритмы**: лучшие окна приёма, маркеры анализов
- **Механизмы влияния**: описания механизмов (GLUT4, желчные мицеллы и т.п.)

### API

```javascript
HEYS.Supplements.TIMING; // словарь тайминга
HEYS.Supplements.CATALOG; // все добавки
HEYS.Supplements.INTERACTIONS; // synergies/conflicts
HEYS.Supplements.COURSES; // предустановленные курсы
```

---

## 📉 Simple Analytics (Performance Tracking)

**Файл**: `heys_simple_analytics.js` | **Версия**: 1.0.0

### Отслеживаемые метрики

| Метрика                                    | Описание           |
| ------------------------------------------ | ------------------ |
| `trackSearch(query, results, ms)`          | Поиск продуктов    |
| `trackApiCall(endpoint, ms, status)`       | API вызовы         |
| `trackDataOperation(operation, count, ms)` | Операции с данными |
| `trackError(error, context)`               | Ошибки             |

### Сессия

```javascript
HEYS.analytics.getSessionStats();
// { searchCount, avgSearchTime, apiCallCount, errorCount, sessionDuration }
```

---

## 📊 Data Overview (Заполненность данных)

**Файл**: `heys_data_overview_v1.js` | **Версия**: 1.0.0 | **Для куратора**

### Отслеживаемые поля (10)

| Поле        | Источник               | Описание           |
| ----------- | ---------------------- | ------------------ |
| `meals`     | `day.meals.length`     | Приёмы пищи        |
| `water`     | `day.waterMl`          | Вода               |
| `sleep`     | `day.sleepStart`       | Сон                |
| `weight`    | `day.weightMorning`    | Вес                |
| `training`  | `day.trainings.length` | Тренировки         |
| `steps`     | `day.steps`            | Шаги               |
| `mood`      | `meals[].mood`         | Настроение         |
| `stress`    | `meals[].stress`       | Стресс             |
| `wellbeing` | `meals[].wellbeing`    | Самочувствие       |
| `household` | `day.householdMin`     | Бытовая активность |

### Результат анализа

```javascript
HEYS.DataOverview.analyze(last30Days);
// {
//   completeness: { meals: 0.95, water: 0.80, ... },
//   avgCompleteness: 0.75,
//   missingFields: ['weight', 'steps'],
//   trend: 'improving' | 'stable' | 'declining'
// }
```

---

## Связанные файлы

| Файл                                | Описание                                 |
| ----------------------------------- | ---------------------------------------- |
| `pi_patterns.js`                    | 22 анализатора паттернов (v4.0)          |
| `pi_constants.js`                   | Dynamic Priority Badge (v4.3.0)          |
| `pi_early_warning.js`               | EWS v4.2 — 25 warnings                   |
| `pi_causal_chains.js`               | Cross-Pattern Causal Chains (6 цепочек)  |
| `heys_harm_v1.js`                   | Вредность продуктов (Harm Score)         |
| `heys_status_v1.js`                 | Статус дня 0-100                         |
| `heys_gamification_v1.js`           | XP, уровни, достижения                   |
| `heys_phenotype_v1.js`              | Метаболический фенотип                   |
| `heys_metabolic_intelligence_v1.js` | A/B тесты, Data Inventory                |
| `heys_simple_analytics.js`          | Performance tracking                     |
| `heys_data_overview_v1.js`          | Заполненность данных                     |
| `heys_supplements_v1.js`            | Каталог добавок, тайминг, взаимодействия |
| `heys_supplements_science_v1.js`    | Биодоставность, формы, маркеры           |
| `heys_relapse_risk_v1.js`           | Relapse Risk Score v1 (RRS) — predictive |
| `advice/_core.js`                   | Advice Engine, ctx.relapseRisk (runtime) |

---

## Relapse Risk Score v1 — Runtime-only

`HEYS.RelapseRisk` живёт как runtime-вычисление и в облаке не хранится.

- **Вход**: `dayData`, `dayTot`, `normAbs`, `profile`, `historyDays` (7 дней)
- **Выход**:
  `{score, level, confidence, primaryDrivers, windows, recommendations}`
- **`dayScoreRaw`**: in-memory float (1 знак, напр. `6.7`), производное от
  `dayScore` через `calculateDayAverages()` — в облаке не хранится
- **ctx.relapseRisk**: вычисляется один раз при инициализации Advice Engine и
  передаётся во все модули через `ctx`
- Подробнее — см.
  [`SCORING_REFERENCE.md`](./SCORING_REFERENCE.md#⚡-relapse-risk-score-rrs-v1)

---

## Changelog (последние версии)

> 📋 Единый changelog перенесён в
> [`CHANGELOG_DATA_MODEL.md`](./CHANGELOG_DATA_MODEL.md). Для этого файла см.
> секцию **Analytics (latest)**.

---

**Версия документа**: 5.6.0 **Последнее обновление**: 2026-02-26
