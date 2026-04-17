# 📊 HEYS Data Model Reference

> **Справочник всех аналитических параметров HEYS** Версия: 5.6.0 | Обновлено:
> 2026-02-26 | **~170 умных советов** | **37 факторов инсулиновой волны** | **🧠
> Insulin Wave v4.1.0** | **🔬 PMID Science Links** | **🏋️ Training Context** |
> **💰 Caloric Debt** | **🔄 Refeed Day** | **📊 Status Score** | **🎮
> Gamification (36 достижений, 8 категорий)** | **🏭 NOVA Classification** |
> **🧬 Extended Nutrients** | **🔮 Predictive Insights v6.3.0: 41 паттерн (100%
> научное покрытие + ⚡ мемоизация)** | **🛡️ Store API v4.8.8 (React State Sync
> Fix)** | **🚨 EWS v4.2 (Phenotype-Aware, Global Score, Causal Chains, Weekly
> Progress)** | **🎯 Dynamic Priority Badge v4.3.0 (Acuteness Decay, Section
> Rules, Pattern Degradation)**

📚 **[SCIENTIFIC_REFERENCES.md](./SCIENTIFIC_REFERENCES.md)** — полный список
научных источников с PMID ссылками

---

## Навигация по документации Data Model

### Этот файл (Ядро — DATA_MODEL_REFERENCE.md)

Структуры данных, схемы, localStorage, базовые расчёты.

- [Field Normalization](#-field-normalization-v431)
- [Данные дня (DayRecord)](#данные-дня-dayrecord)
- [Замеры тела (Measurements)](#замеры-тела-measurements)
- [Тренировки (Training)](#тренировки-training)
- [Бытовая активность (HouseholdActivity)](#бытовая-активность-householdactivity)
- [Пульсовые зоны (heys_hr_zones)](#пульсовые-зоны-heys_hr_zones)
- [Приёмы пищи (Meal)](#приёмы-пищи-meal)
- [Продукт в приёме (MealItem)](#продукт-в-приёме-mealitem)
- [Продукт (Product)](#продукт-product)
- [Профиль пользователя (heys_profile)](#профиль-пользователя-heys_profile)
- [Менструальный цикл (Cycle)](#-менструальный-цикл-cycle)
- [Нормы питания (heys_norms)](#нормы-питания-heys_norms)
- [Вычисляемые данные (dayTot, normAbs, метаболизм)](#вычисляемые-данные)
- [Советы (Advice Module)](#советы-advice-module)
- [localStorage ключи](#localstorage-ключи)
- [Частые ошибки](#частые-ошибки)

### 📊 [DATA_MODEL_ANALYTICS.md](./DATA_MODEL_ANALYTICS.md)

Аналитические и скоринговые системы:

- Predictive Insights v6.3.0 (41 паттерн)
- Harm Score (оценка вредности 0-10) + NOVA Classification
- Status Score (0-100)
- Gamification (XP, уровни, 36 достижений, 8 категорий)
- Phenotype v1.1.0 (6 метаболических фенотипов)
- Early Warning System v4.2
- Dynamic Priority Badge v4.3.0
- Metabolic Intelligence + Supplements + Analytics

### 📊 [SCORING_REFERENCE.md](./SCORING_REFERENCE.md)

Скоринговые системы (полные алгоритмы):

- Status Score (9 факторов, 5 уровней, 0-100)
- Day Score (авто + ручной, 0-10)
- Cascade Risk Score v7 (6 состояний, chronotype-aware)

### 🔧 [APP_SYSTEMS_REFERENCE.md](./APP_SYSTEMS_REFERENCE.md)

Инфраструктурные модули приложения:

- Widget Dashboard (grid, D&D, layout)
- Cascade System (product cascading)
- Product SmartSearch (typo tolerance)
- Export/Import (backup format)
- Trial Queue (6 статусов)
- Migration System (6 миграций)
- Cloud Merge Logic (last-write-wins)

### 🥗 [DATA_MODEL_NUTRITION.md](./DATA_MODEL_NUTRITION.md)

Алгоритмы питания и метаболизма:

- Caloric Debt (калорийный долг)
- Caloric Excess (мягкая коррекция перебора)
- Protein Debt + Расширенная аналитика
- Refeed Day (загрузочные дни)
- Meal Quality Score
- Инсулиновая волна (сводка) →
  [полная документация](./INSULIN_WAVE_DOCUMENTATION.md)
- Training Context v3.4.0
- NDTE (Next-Day Training Effect)
- TEF & TDEE

---

## 🔧 Field Normalization (v4.3.1)

### Harm Field Mapping

> **Canonical field**: `harm` (используется везде: UI, items, products, DB)  
> **Legacy alias**: `harmScore` (устаревший, поддерживается для обратной
> совместимости)  
> **Deprecated**: `harmscore` (lowercase), `harm100` (legacy)

| Source                | Field Name  | Status        | Notes                                |
| --------------------- | ----------- | ------------- | ------------------------------------ |
| **UI/Items/Products** | `harm`      | ✅ Canonical  | Primary field для всех операций      |
| PostgreSQL            | `harm`      | ✅ DB field   | Колонка в shared_products            |
| Legacy code           | `harmScore` | ⚠️ Legacy     | Поддерживается через normalizeHarm() |
| Legacy                | `harmscore` | ⚠️ Deprecated | Lowercase — мигрировать на harm      |
| Legacy                | `harm100`   | ❌ Removed    | Больше не поддерживается             |

### Centralized Normalization API

```javascript
// Файл: heys_models_v1.js

// Получить нормализованное значение harm из любого источника
const harmVal = HEYS.models.normalizeHarm(product);
// Returns: number | undefined

// Нормализовать объект — добавить оба поля harm и harmScore
const normalized = HEYS.models.normalizeHarmFields(product);
// Returns: { ...product, harm: val, harmScore: val }
```

### Data Flow

```
PostgreSQL (harm)
     ↓
 YandexAPI Response
     ↓
 normalizeSharedProduct()
     ↓
 harm + harmScore (оба поля)
     ↓
 UI Components (читают harm)
     ↓
 MealItem (сохраняет harm)
```

### Migration Notes

1. **Новый код**: Всегда используй `harm` как primary field
2. **Чтение**: Используй `HEYS.models.normalizeHarm(obj)` вместо
   fallback-цепочек
3. **Запись**: Сохраняй только `harm` (не дублируй в harmScore)
4. **DB sync**: `heys_cloud_shared_v1.js` автоматически нормализует при загрузке

---

## Данные дня (DayRecord)

**localStorage ключ**: `heys_dayv2_{YYYY-MM-DD}` (с clientId namespace)

| Параметр               | Тип                 | Описание                                                                           | Пример                              |
| ---------------------- | ------------------- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| `date`                 | string              | Дата в формате YYYY-MM-DD                                                          | `"2025-11-29"`                      |
| `sleepStart`           | string              | Время начала сна (HH:MM)                                                           | `"23:30"`                           |
| `sleepEnd`             | string              | Время окончания сна (HH:MM)                                                        | `"07:00"`                           |
| `sleepNote`            | string              | Заметка о сне                                                                      | `"Хорошо выспался"`                 |
| `sleepQuality`         | number              | Качество сна (1-10)                                                                | `7`                                 |
| `weightMorning`        | number              | Утренний вес (кг)                                                                  | `75.5`                              |
| `deficitPct`           | number              | Процент дефицита/профицита (дефицит = отрицательное число)                         | `-15`                               |
| `steps`                | number              | Количество шагов                                                                   | `8500`                              |
| `householdActivities`  | HouseholdActivity[] | Массив бытовых активностей                                                         | `[{minutes: 30, time: "14:00"}]`    |
| `householdMin`         | number              | ⚠️ Legacy: сумма минут всех активностей                                            | `30`                                |
| `householdTime`        | string              | ⚠️ Legacy: время первой активности                                                 | `"14:00"`                           |
| `dayScore`             | number              | Оценка дня (1-10)                                                                  | `8`                                 |
| `moodAvg`              | number              | Среднее настроение за день (1-10)                                                  | `7.5`                               |
| `wellbeingAvg`         | number              | Среднее самочувствие за день (1-10)                                                | `7.2`                               |
| `stressAvg`            | number              | Средний стресс за день (1-10)                                                      | `3.0`                               |
| `moodMorning`          | number              | Утреннее настроение (1-10, из утреннего чек-ина)                                   | `6`                                 |
| `wellbeingMorning`     | number              | Утреннее самочувствие (1-10, из утреннего чек-ина)                                 | `7`                                 |
| `stressMorning`        | number              | Утренний стресс (1-10, из утреннего чек-ина)                                       | `4`                                 |
| `dayComment`           | string              | Комментарий к дню                                                                  | `"Продуктивный день"`               |
| `waterMl`              | number              | Выпито воды (мл)                                                                   | `1500`                              |
| `lastWaterTime`        | string              | Время последнего приёма воды (ISO)                                                 | `"2025-11-29T14:30:00"`             |
| `sleepHours`           | number              | Вычисляемое: часы сна                                                              | `7.5`                               |
| `updatedAt`            | number              | Timestamp последнего обновления                                                    | `1732886400000`                     |
| `meals`                | Meal[]              | Массив приёмов пищи                                                                | `[...]`                             |
| `trainings`            | Training[]          | Массив тренировок (до 3)                                                           | `[...]`                             |
| `measurements`         | Measurements        | Замеры тела (опционально)                                                          | `{...}`                             |
| `cycleDay`             | number/null         | День менструального цикла (1-7, null=не отслеживается)                             | `3`                                 |
| `isRefeedDay`          | boolean/null        | Загрузочный день (из утреннего чек-ина)                                            | `true`                              |
| `refeedReason`         | string              | Причина refeed (deficit/training/holiday/rest)                                     | `"deficit"`                         |
| `supplementsPlanned`   | string[]            | IDs запланированных добавок на день                                                | `["vit_d", "omega3"]`               |
| `supplementsTaken`     | string[]            | IDs фактически принятых добавок                                                    | `["vit_d"]`                         |
| `supplementsTakenAt`   | string              | Время приёма добавок (ISO)                                                         | `"2025-11-29T08:00:00"`             |
| `supplementsTakenMeta` | object              | Метаданные приёма (форма, доза, тайминг по ID)                                     | `{vit_d: {dose: 2000, form: "D3"}}` |
| `coldExposure`         | object/null         | Данные холодовой экспозиции (из чек-ина)                                           | `{minutes: 3, type: "shower"}`      |
| `schemaVersion`        | number              | Версия схемы данных (для миграций синхронизации)                                   | `2`                                 |
| `_sourceId`            | string              | Source ID для синхронизации (UUID устройства)                                      | `"abc-123-def"`                     |
| `dayScore`             | number              | Оценка дня 0-10 (авто или ручная), см. [SCORING_REFERENCE](./SCORING_REFERENCE.md) | `7.5`                               |
| `dayScoreManual`       | boolean             | Ручная оценка (выигрывает при cloud merge)                                         | `true`                              |
| `_syncCompletedAt`     | number              | Timestamp завершения синхронизации                                                 | `1732886400000`                     |

---

## Замеры тела (Measurements)

Объект внутри DayRecord. Показывается в утреннем чек-ине раз в 7 дней.

| Параметр     | Тип    | Описание                   | Пример         |
| ------------ | ------ | -------------------------- | -------------- |
| `waist`      | number | Талия (см)                 | `78`           |
| `hips`       | number | Бёдра (см)                 | `96`           |
| `thigh`      | number | Бедро — одна сторона (см)  | `55`           |
| `biceps`     | number | Бицепс — одна сторона (см) | `32`           |
| `measuredAt` | string | Дата замера (YYYY-MM-DD)   | `"2025-12-01"` |

**Логика отображения:**

- Показывается, если `measuredAt` отсутствует или прошло ≥7 дней
- Можно пропустить (canSkip: true)
- Предыдущие значения показываются как placeholder

**API:**

- `HEYS.showCheckin.measurements()` — принудительный показ шага замеров

---

## Тренировки (Training)

| Параметр            | Тип                     | Описание                                                                                | Пример                                |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------- |
| `z`                 | number[4]               | Минуты в каждой пульсовой зоне                                                          | `[5, 20, 15, 0]`                      |
| `time`              | string                  | Время тренировки (HH:MM)                                                                | `"18:00"`                             |
| `type`              | string                  | Тип тренировки (ID)                                                                     | `"cardio"` / `"strength"` / `"hobby"` |
| `mood`              | number                  | Настроение после тренировки (1-10)                                                      | `8`                                   |
| `wellbeing`         | number                  | Самочувствие после тренировки (1-10)                                                    | `7`                                   |
| `stress`            | number                  | Стресс после тренировки (1-10)                                                          | `3`                                   |
| `strengthEntryMode` | string \| _отсутствует_ | Только для `type === 'strength'`: как введена нагрузка — пульсовые зоны или конструктор | `"hr_zones"` / `"workout_builder"`    |
| `workoutLog`        | object \| _отсутствует_ | Дневник упражнений (конструктор); только при `strengthEntryMode === 'workout_builder'`  | см. ниже                              |

**`workoutLog` (v1)** — объект с полями: `version` (number, сейчас `1`),
`totalDurationMinutes` (1–180), `exercises` — массив
`{ name, sets, reps, weightKg?, note? }`. Для расчёта калорий/TDEE в v1
длительность маппится в `z[1]` (зона «жиросжигание»), остальные зоны `0`, чтобы
единообразно участвовать в существующей зональной модели.

**Примечание**: `z[0]` = зона 1 (лёгкая), `z[3]` = зона 4 (максимальная)

⚠️ **Legacy миграция**: Старые тренировки могут содержать поля `quality` и
`feelAfter` вместо `mood`/`wellbeing`.
`heys_day_calculations.js::normalizeTrainings()` автоматически выполняет
миграцию: `quality` → `mood`, `feelAfter` → `wellbeing`, `stress` = 5 (дефолт).

**Типы тренировок** (ID → Label): | ID | Иконка | Label | Описание |
|----|--------|-------|----------| | `cardio` | 🏃 | Кардио | бег, велосипед,
плавание | | `strength` | 🏋️ | Силовая | тренажёры, свободные веса | | `hobby` |
⚽ | Активное хобби | йога, прогулки, спортивные игры |

⚠️ **Важно**: В коде используются **ID** (`'cardio'`, `'strength'`, `'hobby'`),
НЕ русские названия!

---

## Бытовая активность (HouseholdActivity)

| Параметр  | Тип    | Описание                              | Пример    |
| --------- | ------ | ------------------------------------- | --------- |
| `minutes` | number | Количество минут                      | `30`      |
| `time`    | string | Время активности (HH:MM), опционально | `"14:00"` |

**Особенности**:

- Хранится в массиве `day.householdActivities`
- Можно добавлять несколько записей в день
- Legacy поля `householdMin` и `householdTime` обновляются автоматически (для
  backward compatibility)
- MET = 2.5 для расчёта калорий

---

## Пульсовые зоны (heys_hr_zones)

**localStorage ключ**: `heys_hr_zones`

| Параметр | Тип    | Описание                  | Пример           |
| -------- | ------ | ------------------------- | ---------------- |
| `name`   | string | Название зоны             | `"Жиросжигание"` |
| `hrFrom` | number | Нижняя граница пульса     | `120`            |
| `hrTo`   | number | Верхняя граница пульса    | `140`            |
| `MET`    | number | Метаболический эквивалент | `6.0`            |

**Стандартные зоны**:

1. Зона 1: Восстановление (50-60% от max HR)
2. Зона 2: Жиросжигание (60-70%)
3. Зона 3: Аэробная (70-80%)
4. Зона 4: Анаэробная (80-90%)

---

## Приёмы пищи (Meal)

| Параметр    | Тип        | Описание                  | Пример                 |
| ----------- | ---------- | ------------------------- | ---------------------- |
| `id`        | string     | Уникальный ID приёма      | `"meal_1732886400000"` |
| `name`      | string     | Название приёма           | `"Завтрак"`            |
| `time`      | string     | Время приёма (HH:MM)      | `"08:30"`              |
| `mood`      | number     | Настроение (1-10)         | `7`                    |
| `wellbeing` | number     | Самочувствие (1-10)       | `7`                    |
| `stress`    | number     | Уровень стресса (1-10)    | `3`                    |
| `items`     | MealItem[] | Массив продуктов в приёме | `[...]`                |

---

## Продукт в приёме (MealItem)

| Параметр     | Тип           | Описание               | Пример                 |
| ------------ | ------------- | ---------------------- | ---------------------- |
| `id`         | string        | Уникальный ID записи   | `"item_1732886400001"` |
| `product_id` | string/number | ID продукта из базы    | `"prod_123"`           |
| `name`       | string        | Название (опционально) | `"Овсянка"`            |
| `grams`      | number        | Граммы                 | `150`                  |

⚠️ **Важно**: `MealItem` НЕ имеет поля `category`! Для получения категории
используй `getProductFromItem(item, pIndex)`.

---

## Продукт (Product)

**localStorage ключ**: `heys_products` (массив всех продуктов)

### Базовые поля (на 100г)

| Параметр     | Тип           | Описание                                                                                             | Пример                        |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------- |
| `id`         | string/number | Уникальный ID                                                                                        | `"prod_123"`                  |
| `name`       | string        | Название продукта                                                                                    | `"Овсяная каша"`              |
| `simple100`  | number        | Простые углеводы                                                                                     | `2.5`                         |
| `complex100` | number        | Сложные углеводы                                                                                     | `58.0`                        |
| `protein100` | number        | Белок                                                                                                | `12.3`                        |
| `badFat100`  | number        | Вредные жиры                                                                                         | `1.5`                         |
| `goodFat100` | number        | Полезные жиры                                                                                        | `5.0`                         |
| `trans100`   | number        | Транс-жиры                                                                                           | `0`                           |
| `fiber100`   | number        | Клетчатка                                                                                            | `8.0`                         |
| `gi`         | number        | Гликемический индекс                                                                                 | `55`                          |
| `harm`       | number        | Индекс вреда (0-10), см. [Harm Score](#-harm-score--научная-система-оценки-вредности-продуктов-0-10) | `5.5`                         |
| `category`   | string        | Категория продукта                                                                                   | `"Молочные"`                  |
| `portions`   | Portion[]     | Порции продукта (опционально)                                                                        | `[{name: "1 шт", grams: 60}]` |

**Структура Portion:** | Поле | Тип | Описание | |------|-----|----------| |
`name` | string | Название порции ("1 шт", "1 ч.л.") | | `grams` | number |
Граммы в порции |

**Авто-порции**: Если `portions` не задано, система определяет порции
автоматически по названию продукта (~25 паттернов: яйцо, хлеб, молоко, банан,
яблоко и т.д.). См. `HEYS.models.getAutoPortions()`.

**Альтернативные названия полей** (для совместимости):

- ГИ: `gi100`, `GI`, `giIndex`
- Вред: `harmScore`, `harm100`, `harmPct`

### Вычисляемые поля (computeDerived)

| Параметр   | Формула                                | Описание            |
| ---------- | -------------------------------------- | ------------------- |
| `carbs100` | `simple100 + complex100`               | Всего углеводов     |
| `fat100`   | `badFat100 + goodFat100 + trans100`    | Всего жиров         |
| `kcal100`  | `protein100*3 + carbs100*4 + fat100*9` | Калории (TEF-aware) |

### Расширенные нутриенты (Extended Nutrients)

Полные данные нутриентов хранятся в DB (shared_products) и передаются через
YandexAPI. Используются модулями Harm Score, Predictive Insights, Supplements.

#### Витамины (% DV на 100г)

| Поле          | Тип    | Описание                           | DV (взрослые)   |
| ------------- | ------ | ---------------------------------- | --------------- |
| `vitamin_a`   | number | Витамин A (ретинол + бета-каротин) | 900 мкг RAE     |
| `vitamin_c`   | number | Витамин C                          | 90 мг           |
| `vitamin_d`   | number | Витамин D (D2+D3)                  | 20 мкг (800 МЕ) |
| `vitamin_e`   | number | Витамин E (альфа-токоферол)        | 15 мг           |
| `vitamin_k`   | number | Витамин K                          | 120 мкг         |
| `vitamin_b1`  | number | Тиамин                             | 1.2 мг          |
| `vitamin_b2`  | number | Рибофлавин                         | 1.3 мг          |
| `vitamin_b3`  | number | Ниацин (PP)                        | 16 мг NE        |
| `vitamin_b6`  | number | Пиридоксин                         | 1.7 мг          |
| `vitamin_b9`  | number | Фолат (фолиевая кислота)           | 400 мкг DFE     |
| `vitamin_b12` | number | Кобаламин                          | 2.4 мкг         |

#### Минералы (% DV на 100г)

| Поле         | Тип    | Описание | DV (взрослые) |
| ------------ | ------ | -------- | ------------- |
| `calcium`    | number | Кальций  | 1000 мг       |
| `iron`       | number | Железо   | 18 мг         |
| `magnesium`  | number | Магний   | 420 мг        |
| `phosphorus` | number | Фосфор   | 1250 мг       |
| `potassium`  | number | Калий    | 4700 мг       |
| `zinc`       | number | Цинк     | 11 мг         |
| `selenium`   | number | Селен    | 55 мкг        |
| `iodine`     | number | Йод      | 150 мкг       |

#### Дополнительные нутриенты

| Поле               | Тип      | Единица | Описание                                             |
| ------------------ | -------- | ------- | ---------------------------------------------------- |
| `sodium100`        | number   | мг      | Натрий на 100г (Harm Score: >600мг = вредно)         |
| `omega3_100`       | number   | г       | Омега-3 на 100г (EPA+DHA для OMEGA_BALANCER)         |
| `omega6_100`       | number   | г       | Омега-6 на 100г (оптимум O6:O3 ≤ 4:1)                |
| `cholesterol`      | number   | мг      | Холестерин на 100г                                   |
| `nova_group`       | number   | 1-4     | NOVA классификация: 1=цельный, 4=ультра-обработанный |
| `nutrient_density` | number   | 0-100   | Нутриентная плотность (NRF-подобный скор)            |
| `additives`        | string[] | —       | Список добавок (E-числа)                             |

#### Quality Flags (boolean)

| Поле             | Описание                      | Используется в          |
| ---------------- | ----------------------------- | ----------------------- |
| `is_organic`     | Органический продукт          | Harm Score (снижает)    |
| `is_whole_grain` | Цельнозерновые                | Harm Score, MQS         |
| `is_fermented`   | Ферментированный              | PI: PROBIOTIC_GUARDIAN  |
| `is_raw`         | Не подвергался термообработке | PI: MICRONUTRIENT_RADAR |

#### Нормализация полей (DB ↔ JS)

```
snake_case (PostgreSQL)  →  camelCase (JavaScript)
vitamin_b12              →  vitaminB12
omega3_100               →  omega3Per100
nova_group               →  novaGroup
```

EXTENDED_NUTRIENT_KEYS маппинг определён в `heys_models_v1.js`.

---

## Профиль пользователя (heys_profile)

**localStorage ключ**: `heys_profile`

| Параметр               | Тип      | Описание                                            | Пример                                   |
| ---------------------- | -------- | --------------------------------------------------- | ---------------------------------------- |
| `firstName`            | string   | Имя                                                 | `"Антон"`                                |
| `lastName`             | string   | Фамилия                                             | `"Поплавский"`                           |
| `gender`               | string   | Пол                                                 | `"Мужской"` / `"Женской"` / `"Другое"`   |
| `weight`               | number   | Текущий вес (кг)                                    | `75`                                     |
| `height`               | number   | Рост (см)                                           | `180`                                    |
| `age`                  | number   | Возраст (лет)                                       | `30`                                     |
| `sleepHours`           | number   | Норма сна (часов)                                   | `8`                                      |
| `insulinWaveHours`     | number   | Период инсулиновой волны                            | `4`                                      |
| `deficitPctTarget`     | number   | Целевой % дефицита (отриц.) / профицита (полож.)    | `-15`                                    |
| `weightGoal`           | number   | Целевой вес (кг)                                    | `70`                                     |
| `birthDate`            | string   | Дата рождения (YYYY-MM-DD)                          | `"1995-04-12"`                           |
| `stepsGoal`            | number   | Цель по шагам в день (используется в мастере шагов) | `10000`                                  |
| `activityLevel`        | string   | Уровень активности (для TDEE)                       | `"moderate"`                             |
| `cycleTrackingEnabled` | boolean  | Включён ли трекинг менструального цикла             | `false`                                  |
| `profileCompleted`     | boolean  | Флаг завершения мастера профиля                     | `true`                                   |
| `plannedSupplements`   | string[] | IDs запланированных добавок                         | `["vit_d", "omega3", "magnesium"]`       |
| `supplementSettings`   | object   | Настройки добавок (тайминг, форма, доза по ID)      | `{vit_d: {time: "morning", dose: 2000}}` |
| `supplementHistory`    | object   | Лёгкая история для предупреждений/лимитов           | `{vit_d: {streak: 7, lastTaken: "..."}}` |

---

## 🌸 Менструальный цикл (Cycle)

**Модуль**: `heys_cycle_v1.js` | **Утренний чек-ин**: шаг `cycle`

### Поле cycleDay (в DayRecord)

| Значение | Фаза                        | Описание                               |
| -------- | --------------------------- | -------------------------------------- |
| `1-3`    | Менструальная               | Первые дни цикла                       |
| `4-7`    | Менструальная/Фолликулярная | Переходный период                      |
| `null`   | Не отслеживается            | Трекинг выключен или не для этого пола |

### Фазы цикла (getCyclePhase)

| ID           | Иконка | Название      | Дни   | kcalMultiplier | waterMultiplier | insulinWave |
| ------------ | ------ | ------------- | ----- | -------------- | --------------- | ----------- |
| `menstrual`  | 🌸     | Менструация   | 1-7   | 1.05-1.10      | 1.10            | +12-15%     |
| `follicular` | 🌱     | Фолликулярная | 8-14  | 1.00           | 1.00            | 0%          |
| `ovulation`  | ⭐     | Овуляция      | 14-16 | 1.00           | 1.00            | 0%          |
| `luteal`     | 🌙     | Лютеиновая    | 17-28 | 1.05-1.08      | 1.05            | +8-10%      |

### Коррекции норм

**Калории**: `optimum × kcalMultiplier`  
**Вода**: `waterGoal + cycleBonus` (показывается в breakdown)  
**Инсулиновая волна**: `waveHours × insulinWaveMultiplier` (фактор #26)

### Советы для цикла (7 шт)

| ID                       | Условие                     | Описание                          |
| ------------------------ | --------------------------- | --------------------------------- |
| `cycle_sweet_craving`    | Менструация + сладкое >100% | "Тяга к сладкому — норма"         |
| `cycle_iron_important`   | Менструация + нет железа    | "Сейчас железо особенно важно"    |
| `cycle_rest_ok`          | Дни 1-2 + нет тренировки    | "Отдых — правильный выбор"        |
| `cycle_hydration`        | Менструация + вода <70%     | "Сейчас вода особенно нужна"      |
| `cycle_energy_up`        | Фолликулярная фаза          | "Хорошее время для тренировок"    |
| `cycle_peak_performance` | Овуляция                    | "Пик энергии! Время для рекордов" |
| `cycle_tracking_thanks`  | Любая фаза (первый показ)   | "Нормы адаптированы под цикл"     |

### Визуализация

**Календарь**: Розовая точка на днях с `cycleDay != null`  
**Карточка**: `CycleCard` в статистике — фаза, день, корректировки  
**Вода**: Бонус `🌸 +X мл` в breakdown  
**График веса**: Розовые зоны для дней с задержкой воды, "чистый" тренд
исключает эти дни

### Задержка воды (Water Retention)

Научное обоснование: повышение прогестерона → задержка Na+ и воды → +0.5-3 кг.

| Дни цикла | Severity | Оценка  | Исключить из тренда |
| --------- | -------- | ------- | ------------------- |
| 1-3       | high     | +2 кг   | ✅ Да               |
| 4-5       | medium   | +1 кг   | ✅ Да               |
| 6-7       | low      | +0.5 кг | ✅ Да               |
| 8-14      | none     | 0 кг    | ❌ Нет              |

**Визуализация на sparkline веса**:

- Розовые вертикальные зоны за точками с задержкой
- Розовая обводка вокруг точек
- Бейдж "🌸 чистый" — тренд рассчитан без дней задержки
- Сноска под графиком с объяснением (+1-3 кг, не жир)

### API

```javascript
// Проверка доступности шага
HEYS.Steps.shouldShowCycleStep(); // true для женщин с включённым трекингом

// Получение фазы
HEYS.Cycle.getCyclePhase(cycleDay); // { id, name, icon, kcalMultiplier, ... }

// Множители
HEYS.Cycle.getKcalMultiplier(cycleDay); // 1.00-1.10
HEYS.Cycle.getWaterMultiplier(cycleDay); // 1.00-1.10
HEYS.Cycle.getInsulinWaveMultiplier(cycleDay); // 1.00-1.15

// Задержка воды
HEYS.Cycle.getWaterRetentionInfo(cycleDay); // { hasRetention, severity, kgEstimate, advice, excludeFromTrend }
HEYS.Cycle.shouldExcludeFromWeightTrend(cycleDay); // true для дней 1-7

// Исторический анализ
HEYS.Cycle.findAllCycles(monthsBack, lsGet); // [{startDate, endDate, days}]
HEYS.Cycle.analyzeWaterRetentionHistory(monthsBack, lsGet); // {avgRetentionKg, insight, trend, ...}
HEYS.Cycle.getWeightNormalizationForecast(cycleDay); // {daysUntilNormal, message}
```

---

## Нормы питания (heys_norms)

**localStorage ключ**: `heys_norms`

| Параметр         | Тип    | Описание                 | По умолчанию |
| ---------------- | ------ | ------------------------ | ------------ |
| `carbsPct`       | number | % углеводов от калоража  | `50`         |
| `proteinPct`     | number | % белка от калоража      | `25`         |
| `simpleCarbPct`  | number | % простых от углеводов   | `30`         |
| `badFatPct`      | number | % вредных жиров от жиров | `30`         |
| `superbadFatPct` | number | % транс-жиров от жиров   | `5`          |
| `fiberPct`       | number | г клетчатки на 1000 ккал | `14`         |
| `giPct`          | number | Целевой средний ГИ       | `55`         |
| `harmPct`        | number | Допустимый % вреда       | `10`         |

---

## Вычисляемые данные

### Суммы за день (dayTot)

⚠️ **Критично**: Ключ для белка — `prot`, НЕ `protein`!

| Параметр  | Тип    | Описание                |
| --------- | ------ | ----------------------- |
| `kcal`    | number | Сумма калорий за день   |
| `carbs`   | number | Сумма углеводов         |
| `simple`  | number | Сумма простых углеводов |
| `complex` | number | Сумма сложных углеводов |
| `prot`    | number | Сумма белка ⚠️          |
| `fat`     | number | Сумма жиров             |
| `bad`     | number | Сумма вредных жиров     |
| `good`    | number | Сумма полезных жиров    |
| `trans`   | number | Сумма транс-жиров       |
| `fiber`   | number | Сумма клетчатки         |
| `gi`      | number | Средневзвешенный ГИ     |
| `harm`    | number | Сумма вреда             |

### Дневные нормы в граммах (normAbs)

Вычисляется из `optimum` и `heys_norms`:

| Параметр  | Формула                                             |
| --------- | --------------------------------------------------- |
| `kcal`    | `optimum`                                           |
| `carbs`   | `optimum * carbsPct / 100 / 4`                      |
| `prot`    | `optimum * proteinPct / 100 / 4` ⚠️                 |
| `fat`     | `optimum * (100 - carbsPct - proteinPct) / 100 / 9` |
| `simple`  | `carbs * simpleCarbPct / 100`                       |
| `complex` | `carbs - simple`                                    |
| `bad`     | `fat * badFatPct / 100`                             |
| `trans`   | `fat * superbadFatPct / 100`                        |
| `good`    | `fat - bad - trans`                                 |
| `fiber`   | `optimum / 1000 * fiberPct`                         |

### Метаболизм

| Параметр          | Описание                     | Формула                                                                    |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `BMR`             | Базовый метаболизм           | Mifflin-St Jeor                                                            |
| `TEF`             | Термический эффект пищи 🆕   | `carbs×4×0.075 + fat×9×0.015` (prot TEF=0, встроен в NET Atwater 3 kcal/g) |
| `baseExpenditure` | Базовые затраты (без TEF) 🆕 | `BMR + activity + NDTE`                                                    |
| `TDEE`            | Общий расход (с TEF)         | `baseExpenditure + TEF`                                                    |
| `optimum`         | Целевой калораж              | `baseExpenditure * (1 ± deficitPct/100)` ⚠️ без TEF!                       |
| `trainingKcal`    | От тренировок                | `∑(zone_minutes * MET * weight / 60)`                                      |
| `ratio`           | Выполнение нормы             | `dayTot.kcal / optimum`                                                    |

> ⚠️ **Важно v3.9.1**: `optimum` рассчитывается от `baseExpenditure` (без TEF),
> чтобы норма не "догоняла" съеденное. TEF показывается в UI как фактические
> затраты на переваривание.

#### Контексты применения (итоговая логика)

- **План/норма на день (optimum)**: только `baseExpenditure` + дефицит + цикл.
  **TEF НЕ добавляем**.
- **Фактические затраты дня (TDEE)**: `baseExpenditure + TEF` **с учётом NDTE**.
- **Ретроспектива (неделя/месяц/отчёты)**: используем **TDEE** (с TEF и NDTE).
- **Метрики выполнения** (`ratio`, streak, heatmap): считаются от **optimum**.

> Примечание: TEF рассчитывается только при наличии `pIndex`/продуктов (иначе
> 0).

#### TEF (Thermic Effect of Food) — v3.9.0

**Научное обоснование**: Westerterp 2004, Tappy 1996

| Макрос       | Atwater  | TEF %  | Чистая энергия |
| ------------ | -------- | ------ | -------------- |
| **Белок**    | 4 ккал/г | 20-30% | ~3 ккал/г      |
| **Углеводы** | 4 ккал/г | 5-10%  | ~3.7 ккал/г    |
| **Жиры**     | 9 ккал/г | 0-3%   | ~8.8 ккал/г    |

**Формула TEF** (используемая в HEYS):

```javascript
// Protein TEF = 0 (встроен в NET Atwater: protein = 3 kcal/g вместо 4)
TEF = prot_g × 0 + carbs_g × 4 × 0.075 + fat_g × 9 × 0.015
```

> ⚠️ **Важно**: Protein использует NET Atwater = 3 kcal/g (уже TEF-adjusted),
> поэтому TEF-компонент белка = 0. Не путайте с классическими формулами где
> protein × 4 × 0.25.

**Пример**: Съедено 120г белка, 250г углеводов, 70г жиров:

- TEF = 0 + 250×4×0.075 + 70×9×0.015 = 75 + 9 = **84 ккал**

**UI**: В popup "⚡ Затраты энергии" отображается строка "🔥 Переваривание пищи
(TEF)".

### Streak аналитика

| Параметр        | Описание                              |
| --------------- | ------------------------------------- |
| `currentStreak` | Дней подряд в норме (ratio 0.75-1.15) |
| `activeDays`    | Map дней с ratio за текущий месяц     |

---

## Советы (Advice Module)

**Файл**: `advice/` модули (\_core, \_nutrition, \_timing, \_training,
\_emotional, \_hydration, \_other) | **Всего советов: ~170**

> Примечание: `heys_advice_v1.js` — устаревший shim (42 LOC), реальная логика в
> `advice/` модулях.

### 🎯 Goal-aware система (v2.0)

Советы теперь адаптируются к цели пользователя (дефицит/набор/поддержание).

**Режимы цели** (`getGoalMode(deficitPct)`):

| Режим                       | Условие                 | Целевой диапазон kcalPct | Критический перебор | Критический недобор |
| --------------------------- | ----------------------- | ------------------------ | ------------------- | ------------------- |
| `deficit` (Похудение)       | `deficitPct <= -10%`    | 90-105%                  | >115%               | <80%                |
| `deficit` (Лёгкое)          | `deficitPct -5% до -9%` | 92-108%                  | >120%               | <75%                |
| `bulk` (Набор)              | `deficitPct >= +10%`    | 95-110%                  | >125%               | <85%                |
| `bulk` (Лёгкий)             | `deficitPct +5% до +9%` | 93-112%                  | >120%               | <80%                |
| `maintenance` (Поддержание) | `deficitPct -4% до +4%` | 90-110%                  | >125%               | <70%                |

**Источник цели**:

1. `day.deficitPct` — коррекция на конкретный день (из вкладки статистики)
2. `prof.deficitPctTarget` — цель из профиля (fallback)

**Примечание**: `deficitPct` хранится как:

- **Отрицательное число** для дефицита (например: `-15` = 15% дефицит)
- **Положительное число** для профицита (например: `+10` = 10% набор)

### Goal-specific советы

| ID                            | Режим       | Условие                          | Описание                             |
| ----------------------------- | ----------- | -------------------------------- | ------------------------------------ |
| `bulk_protein_critical`       | bulk        | `proteinPct < 0.8`               | "Для набора нужен белок!"            |
| `bulk_carbs_low`              | bulk        | `carbsPct < 0.7`                 | "Добавь углеводов для энергии"       |
| `bulk_kcal_behind`            | bulk        | `hour >= 16 && kcalPct < 0.6`    | "Только X% от плана набора"          |
| `deficit_protein_save_muscle` | deficit     | `proteinPct < 0.9`               | "Белок сохраняет мышцы на дефиците"  |
| `deficit_fiber_satiety`       | deficit     | `fiberPct < 0.5`                 | "Клетчатка даёт сытость без калорий" |
| `deficit_too_harsh`           | deficit     | `hour >= 18 && kcalPct < 0.7`    | "Слишком жёсткий дефицит"            |
| `deficit_on_track_motivation` | deficit     | `isInTargetRange(kcalPct, goal)` | "Дефицит выдерживается!"             |
| `maintenance_stable`          | maintenance | `isInTargetRange(kcalPct, goal)` | "Калории в балансе!"                 |
| `goal_on_track`               | any         | `isInTargetRange(kcalPct, goal)` | "Цель выполняется!"                  |

### Адаптивные советы (изменённые)

| ID                     | Изменение                                          |
| ---------------------- | -------------------------------------------------- |
| `kcal_excess_critical` | Порог зависит от `goal.criticalOver`               |
| `kcal_excess_mild`     | Порог зависит от `goal.targetRange.max`            |
| `kcal_under_critical`  | 🆕 Порог зависит от `goal.criticalUnder`           |
| `evening_undereating`  | Текст зависит от режима (bulk/deficit/maintenance) |
| `perfect_day`          | Текст зависит от режима                            |
| `weekend_relax`        | Не показывается для bulk режима                    |

### Все типы советов

| ID                                   | Условие                                                           | Категория    | Триггер                    |
| ------------------------------------ | ----------------------------------------------------------------- | ------------ | -------------------------- |
| `monday_motivation`                  | Понедельник утро                                                  | motivation   | tab_open                   |
| `friday_reminder`                    | Пятница вечер                                                     | motivation   | tab_open                   |
| `sunday_planning`                    | Воскресенье вечер                                                 | motivation   | tab_open                   |
| `crash_support`                      | `isCriticallyOver/Under(kcalPct, goal)`                           | emotional    | tab_open, product_added    |
| `stress_support`                     | `avgMood < 3`                                                     | emotional    | tab_open                   |
| `streak_7`                           | `currentStreak >= 7`                                              | achievement  | tab_open                   |
| `streak_3`                           | `currentStreak 3-6`                                               | achievement  | tab_open                   |
| `perfect_day`                        | `hour>=18 && isInTargetRange(kcalPct, goal) && macros>=0.9`       | achievement  | tab_open                   |
| `first_day`                          | `mealCount === 1` (первый раз)                                    | achievement  | product_added              |
| `kcal_excess_critical`               | `isCriticallyOver(kcalPct, goal)`                                 | nutrition    | product_added              |
| `kcal_excess_mild`                   | `kcalPct > goal.targetRange.max`                                  | nutrition    | product_added              |
| `kcal_under_critical`                | `isCriticallyUnder(kcalPct, goal) && hour >= 14`                  | nutrition    | tab_open, product_added    |
| `trans_fat_warning`                  | `transPct > 1.0`                                                  | nutrition    | product_added              |
| `simple_carbs_warning`               | `simplePct > 1.3`                                                 | nutrition    | product_added              |
| `harm_warning`                       | `harmPct > 1.0`                                                   | nutrition    | product_added              |
| `protein_low`                        | `proteinPct < 0.5 && hour >= 12`                                  | nutrition    | tab_open, product_added    |
| `fiber_low`                          | `fiberPct < 0.3 && mealCount >= 2`                                | nutrition    | tab_open, product_added    |
| `fiber_good`                         | `fiberPct >= 1.0`                                                 | nutrition    | product_added              |
| `good_fat_low`                       | `goodFatPct < 0.4 && hour >= 14`                                  | nutrition    | tab_open, product_added    |
| `post_training_protein`              | `hasTraining && proteinPct < 0.8`                                 | training     | tab_open, product_added    |
| `post_training_undereating_critical` | `hasTraining && kcalPct < 0.7 && hour >= 18`                      | training     | tab_open                   |
| `undereating_warning`                | `kcalPct < 0.7 && hour >= 18` (crashed state)                     | nutrition    | tab_open                   |
| `evening_undereating`                | `hour >= 20 && isCriticallyUnder(kcalPct, goal)`                  | nutrition    | tab_open                   |
| `balanced_macros`                    | `mealCount>=2 && all macros 0.9-1.2`                              | nutrition    | product_added              |
| `sleep_low`                          | `sleepHours > 0 && < 6`                                           | lifestyle    | tab_open                   |
| `morning_breakfast`                  | `hour 7-10 && mealCount === 0`                                    | lifestyle    | tab_open                   |
| `steps_goal`                         | `steps >= 10000`                                                  | lifestyle    | tab_open                   |
| `variety_low`                        | `items>=5 && uniqueProducts<3`                                    | nutrition    | tab_open, product_added    |
| `after_sweet_protein`                | `lastMeal simplePct>0.6 && kcal>100`                              | nutrition    | product_added              |
| `sleep_hunger_correlation`           | `sleepDeficit>2 && kcalPct>1.15`                                  | correlation  | tab_open, product_added    |
| `sleep_hunger_warning`               | `sleepDeficit>1.5 && hour<12 && kcalPct<0.3`                      | correlation  | tab_open                   |
| `stress_sweet_pattern`               | `avgStress>=4 && simplePct>1.2`                                   | correlation  | product_added              |
| `low_stress_balance`                 | `avgStress 1-2 && kcalPct 0.9-1.1`                                | correlation  | tab_open                   |
| `hard_workout_recovery`              | `highIntensity>20min && proteinPct<1.0`                           | training     | tab_open, product_added    |
| `cardio_carbs_balance`               | `fatBurn>30min && carbsPct>1.2`                                   | training     | product_added              |
| `great_workout`                      | `totalMinutes >= 45`                                              | training     | tab_open                   |
| `water_evening_low`                  | `hour>=18 && waterPct<0.5`                                        | hydration    | tab_open                   |
| `water_reminder`                     | `hoursSinceWater>2 && hour 10-21`                                 | hydration    | tab_open, product_added    |
| `water_goal_reached`                 | `waterPct >= 1.0`                                                 | hydration    | tab_open                   |
| `high_gi_warning`                    | `avgGI>70 && mealCount>=2`                                        | nutrition    | tab_open, product_added    |
| `low_gi_great`                       | `avgGI 0-55 && mealCount>=2`                                      | nutrition    | tab_open                   |
| `simple_complex_ratio`               | `totalCarbs>50 && simpleRatio>0.5`                                | nutrition    | product_added              |
| `carbs_balance_perfect`              | `simpleRatio<=0.3 && mealCount>=2`                                | nutrition    | tab_open                   |
| `fat_quality_low`                    | `totalFat>20 && goodRatio<0.4`                                    | nutrition    | tab_open, product_added    |
| `fat_quality_great`                  | `goodRatio>=0.6`                                                  | nutrition    | tab_open                   |
| `insulin_too_fast`                   | `gap < insulinWave*0.5`                                           | timing       | product_added              |
| `insulin_perfect`                    | `avgGap >= insulinWave*0.9 && meals>=3`                           | timing       | tab_open                   |
| `late_dinner_warning`                | `lastMealHour >= 22`                                              | timing       | product_added              |
| `good_dinner_time`                   | `lastMealHour 18-20 && hour>=21`                                  | timing       | tab_open                   |
| `bad_sleep_advice`                   | `sleepQuality 1-2 && hour<12`                                     | sleep        | tab_open                   |
| `great_sleep`                        | `sleepQuality>=4 && sleepHours>=7`                                | sleep        | tab_open                   |
| `sugar_mood_crash`                   | `moodDrop>=2 && prevMealSimple>30g`                               | emotional    | tab_open                   |
| `wellbeing_low_food`                 | `avgWellbeing<3 && kcalPct<0.4 && hour>=12`                       | emotional    | tab_open                   |
| `wellbeing_nutrition_link`           | `avgWellbeing>=4 && kcalPct 0.8-1.1`                              | emotional    | tab_open                   |
| `iron_reminder`                      | `gender='Женский' && mealCount>=2 && !hasIronFood`                | personalized | tab_open                   |
| **💊 Supplements (Phase 3)**         |                                                                   |              |                            |
| `morning_supplements_reminder`       | Утро (6-12) + есть запланированные непринятые витамины            | health       | tab_open, checkin_complete |
| `evening_supplements_reminder`       | Вечер (18-23) + есть запланированные непринятые вечерние витамины | health       | product_added              |
| `age_protein`                        | `age>=40 && proteinPct<0.9`                                       | personalized | tab_open, product_added    |
| `household_bonus`                    | `householdMin >= 60`                                              | activity     | tab_open                   |
| `sedentary_day`                      | `household=0 && steps<3000 && !training && hour>=18`              | activity     | tab_open                   |
| `day_score_low`                      | `dayScore < 5 && hour >= 20`                                      | emotional    | tab_open                   |
| `day_score_high`                     | `dayScore >= 8 && hour >= 20`                                     | achievement  | tab_open                   |
| `training_type_strength`             | `training.type === 'strength' && proteinPct < 1.0`                | training     | tab_open, product_added    |
| `training_type_hobby`                | `training.type === 'hobby'`                                       | training     | tab_open                   |
| `caffeine_evening`                   | Кофе за <6ч до сна (с учётом реального bedtime)                   | nutrition    | product_added              |
| `bedtime_undereating`                | До сна ≤2ч + недобор калорий                                      | timing       | tab_open                   |
| `undereating_dehydration_combo`      | `kcalPct < 0.6 && waterPct < 0.5` — двойной удар                  | nutrition    | tab_open                   |
| `empty_stomach_late`                 | `hour 10-12 && mealCount === 0`                                   | lifestyle    | tab_open                   |
| `late_heavy_meal`                    | `lastMealHour >= 21 && lastMealKcal > 500`                        | timing       | product_added              |
| `insulin_countdown`                  | `minutesUntilEnd > 0 && < 60`                                     | timing       | tab_open                   |
| `bedtime_protein`                    | До сна ≤4ч + мало белка (с реальным bedtime)                      | timing       | tab_open                   |
| `post_holiday_detox`                 | Дни после праздников (1-2 янв, и др.)                             | lifestyle    | tab_open                   |
| `best_day_recall`                    | Лучший день за 7 дней                                             | motivation   | tab_open                   |
| `lunch_time`                         | `hour === 13 && mealCount === 1`                                  | lifestyle    | tab_open                   |
| `protein_champion`                   | `proteinPct >= 1.2`                                               | achievement  | tab_open, product_added    |
| `snack_window`                       | `hour === 16 && kcalPct < 0.6`                                    | lifestyle    | tab_open                   |
| `mood_improving`                     | Настроение выросло между приёмами                                 | correlation  | product_added              |
| `workout_consistent`                 | 3 дня тренировок подряд                                           | achievement  | tab_open                   |
| `evening_snacker`                    | Паттерн поздних ужинов 3 дня                                      | correlation  | tab_open                   |
| `morning_skipper`                    | Паттерн без завтрака 3 дня                                        | correlation  | tab_open                   |
| `chronic_undereating_pattern`        | 3+ дней kcalPct < 0.75                                            | correlation  | tab_open                   |
| **Phase 2: Meal-level**              |                                                                   |              |                            |
| `meal_too_large`                     | `lastMeal.kcal > 800`                                             | nutrition    | product_added              |
| `meal_too_small`                     | `meal.kcal < 150 && mealCount >= 2`                               | nutrition    | product_added              |
| `protein_per_meal_low`               | `meal.prot < 20 && meal.kcal > 200`                               | nutrition    | product_added              |
| `evening_carbs_high`                 | `hour >= 20 && lastMeal.carbs > 50`                               | nutrition    | product_added              |
| `fiber_per_meal_good`                | `meal.fiber > 8`                                                  | nutrition    | product_added              |
| `variety_meal_good`                  | `meal.items.length >= 4`                                          | nutrition    | product_added              |
| `late_first_meal`                    | `firstMeal.time >= '12:00' && hour >= 13`                         | lifestyle    | tab_open                   |
| **Phase 2: Day-quality**             |                                                                   |              |                            |
| `trans_free_day`                     | `dayTot.trans === 0 && mealCount >= 2`                            | achievement  | tab_open                   |
| `sugar_low_day`                      | `dayTot.simple < 25 && mealCount >= 2`                            | achievement  | tab_open                   |
| `super_hydration`                    | `waterMl >= 2500`                                                 | hydration    | tab_open                   |
| `variety_day_good`                   | `uniqueProducts >= 10`                                            | nutrition    | tab_open                   |
| `deficit_on_track`                   | `kcalPct 0.85-0.95 && deficitPct > 0`                             | lifestyle    | tab_open                   |
| `weekend_relax`                      | `(Сб или Вс) && kcalPct 1.1-1.3`                                  | lifestyle    | tab_open                   |
| **Phase 2: Timing & Patterns**       |                                                                   |              |                            |
| `fasting_window_good`                | `gap ужин→завтрак >= 14h`                                         | timing       | tab_open                   |
| `long_fast_warning`                  | `gap между приёмами > 7h && hour 10-18`                           | timing       | tab_open                   |
| `meal_spacing_perfect`               | `все gaps 3-5 часов && meals >= 3`                                | timing       | tab_open                   |
| `training_recovery_window`           | `30-60 мин после тренировки`                                      | training     | tab_open                   |
| `sleep_debt_accumulating`            | `3 дня < 6 часов сна`                                             | sleep        | tab_open                   |
| `stress_eating_detected`             | `avgStress >= 4 && kcalPct > 1.15`                                | correlation  | tab_open                   |
| **Phase 2: Milestones**              |                                                                   |              |                            |
| `weight_trend_down`                  | `7-day trend < -0.3kg/week`                                       | correlation  | tab_open                   |
| `weight_trend_up`                    | `7-day trend > +0.5kg/week`                                       | correlation  | tab_open                   |
| `weight_forecast_on_track`           | По прогнозу цель достижима                                        | weight       | tab_open                   |
| `weight_forecast_slow`               | Темп медленный >1 год до цели                                     | weight       | tab_open                   |
| `weight_forecast_wrong_direction`    | Вес идёт от цели                                                  | weight       | tab_open                   |
| `weight_almost_there`                | До цели <2кг                                                      | weight       | tab_open                   |
| `milestone_7_days`                   | `totalDaysTracked === 7`                                          | achievement  | tab_open                   |
| `milestone_30_days`                  | `totalDaysTracked === 30`                                         | achievement  | tab_open                   |
| `milestone_100_days`                 | `totalDaysTracked === 100`                                        | achievement  | tab_open                   |
| `new_record_streak`                  | `currentStreak === personalBestStreak`                            | achievement  | tab_open                   |
| `first_training_ever`                | первая тренировка в истории                                       | achievement  | tab_open                   |
| **Meal Quality Score советы**        |                                                                   |              |                            |
| `meal_quality_excellent`             | Score ≥ 85                                                        | nutrition    | product_added              |
| `meal_quality_good`                  | Score 70-84                                                       | nutrition    | product_added              |
| `meal_quality_poor`                  | Score < 50                                                        | nutrition    | product_added              |
| `meal_quality_improving`             | Средний score сегодня > вчера +10                                 | nutrition    | tab_open                   |
| **Supplements советы**               |                                                                   |              |                            |
| `supplements_all_taken`              | Все запланированные добавки приняты                               | supplements  | tab_open                   |
| `supplements_coffee_minerals`        | Кофе + минералы (кофеин ухудшает усвоение Ca/Fe/Mg)               | supplements  | product_added              |
| `supplements_dairy_iron_conflict`    | Молочные + железо (Ca блокирует Fe)                               | supplements  | product_added              |
| `supplements_fat_meal_synergy`       | Жирорастворимые витамины (A/D/E/K) + жирная еда = лучше усвоение  | supplements  | product_added              |
| `supplements_iron_vitc_synergy`      | Железо + витамин C = синергия усвоения                            | supplements  | product_added              |
| `supplements_personal_rec`           | Персонализированная рекомендация по дефициту нутриентов           | supplements  | tab_open                   |
| `supplements_streak`                 | Серия дней с приёмом добавок                                      | supplements  | tab_open                   |
| `supplements_morning_reminder`       | Утреннее напоминание о добавках                                   | supplements  | tab_open, checkin_complete |
| **Caloric Debt советы**              |                                                                   |              |                            |
| `caloric_debt_info`                  | Информация о накопленном калорийном долге                         | nutrition    | tab_open                   |
| `caloric_debt_high`                  | Высокий калорийный долг (>500 ккал)                               | nutrition    | tab_open                   |
| `caloric_debt_repaid`                | Калорийный долг погашен                                           | achievement  | tab_open                   |
| **Protein Debt советы**              |                                                                   |              |                            |
| `protein_debt_mild`                  | Лёгкий белковый долг (1-2 дня <80%)                               | nutrition    | tab_open                   |
| `protein_debt_moderate`              | Средний белковый долг (3+ дней <80%)                              | nutrition    | tab_open                   |
| `protein_debt_critical`              | Критический белковый долг (5+ дней <60%)                          | nutrition    | tab_open                   |
| **Excess Compensation советы**       |                                                                   |              |                            |
| `excess_activity_recommended`        | Рекомендация активности для компенсации перебора                  | activity     | tab_open                   |
| `excess_compensated_by_steps`        | Перебор скомпенсирован шагами                                     | activity     | tab_open                   |
| `excess_soft_correction`             | Мягкая коррекция перебора через следующие приёмы                  | nutrition    | tab_open                   |
| **Training Nutrition советы**        |                                                                   |              |                            |
| `training_cardio_undereating`        | Кардио + недобор калорий                                          | training     | tab_open                   |
| `training_high_intensity_nutrition`  | Высокоинтенсивная тренировка: рекомендации по питанию             | training     | tab_open, product_added    |
| `training_strength_undereating`      | Силовая + недобор калорий (потеря мышц)                           | training     | tab_open                   |
| **Lipolysis советы**                 |                                                                   |              |                            |
| `frequent_eating_no_lipolysis`       | Частые приёмы блокируют липолиз                                   | timing       | product_added              |
| `lipolysis_going_strong`             | Активный липолиз (длинное окно без еды)                           | timing       | tab_open                   |
| **Insulin Wave советы**              |                                                                   |              |                            |
| `high_gi_during_wave`                | Высокий ГИ продукт во время инсулиновой волны                     | timing       | product_added              |
| `low_gi_during_wave`                 | Низкий ГИ — хороший выбор во время волны                          | timing       | product_added              |
| **Circadian советы**                 |                                                                   |              |                            |
| `circadian_evening_urgent`           | Поздний вечер + недобор = срочно доесть                           | timing       | tab_open                   |
| `circadian_morning_calm`             | Утро: спокойный старт, не спеши с едой                            | timing       | tab_open                   |
| **Body Measurements советы**         |                                                                   |              |                            |
| `first_measurement`                  | Первый замер тела сделан                                          | achievement  | tab_open                   |
| `measure_reminder`                   | Напоминание о замерах тела (прошло 7+ дней)                       | lifestyle    | tab_open                   |
| `waist_down_progress`                | Талия уменьшается — прогресс!                                     | achievement  | tab_open                   |
| `weight_waist_correlation`           | Корреляция веса и обхвата талии                                   | correlation  | tab_open                   |
| `biceps_growing`                     | Бицепс растёт (при силовых тренировках)                           | achievement  | tab_open                   |
| **Weekly Analytics советы**          |                                                                   |              |                            |
| `weekly_comparison`                  | Сравнение с прошлой неделей (лучше/хуже)                          | analytics    | tab_open                   |
| `weekly_summary`                     | Еженедельная сводка (средние kcal, макросы, шаги)                 | analytics    | tab_open                   |
| **Missing Nutrients советы**         |                                                                   |              |                            |
| `missing_dairy`                      | Нет молочных продуктов 3+ дня (кальций)                           | nutrition    | tab_open                   |
| `missing_vegetables`                 | Нет овощей 2+ дня (клетчатка, витамины)                           | nutrition    | tab_open                   |
| **Misc новые советы**                |                                                                   |              |                            |
| `day_forecast`                       | Прогноз дня на основе утренних данных                             | analytics    | checkin_complete           |
| `smart_recommendation`               | Умная рекомендация на основе PI паттернов                         | analytics    | tab_open                   |
| `emotional_risk_high`                | Высокий эмоциональный риск (стресс + плохое настроение)           | emotional    | tab_open                   |
| `stress_undereating_warning`         | Стресс + недобор = риск срыва                                     | emotional    | tab_open                   |
| `bmi_underweight_warning`            | BMI < 18.5: предупреждение о недовесе                             | health       | tab_open                   |
| `streak_hint`                        | Подсказка о серии (близок к рекорду)                              | motivation   | tab_open                   |

### Используемые переменные

| Переменная               | Источник                | Описание                             |
| ------------------------ | ----------------------- | ------------------------------------ |
| `dayTot.prot`            | DayTab                  | Сумма белка за день                  |
| `dayTot.gi`              | DayTab                  | Средневзвешенный ГИ                  |
| `dayTot.harm`            | DayTab                  | Средневзвешенный Harm Score (0-10)   |
| `dayTot.trans`           | DayTab                  | Сумма транс-жиров за день (г)        |
| `normAbs.prot`           | DayTab                  | Норма белка в граммах                |
| `kcalPct`                | `dayTot.kcal / optimum` | Выполнение калорийности              |
| `prof.gender`            | heys_profile            | `'Женский'` / `'Мужской'`            |
| `prof.age`               | heys_profile            | Возраст                              |
| `prof.sleepHours`        | heys_profile            | Норма сна                            |
| `prof.insulinWaveHours`  | heys_profile            | Период инсулиновой волны             |
| `waterGoal`              | waterGoalBreakdown      | Динамическая норма воды              |
| `pIndex.byId.get()`      | buildProductIndex       | Индекс продуктов                     |
| `day.householdMin`       | DayRecord               | Минуты домашней активности           |
| `day.householdTime`      | DayRecord               | Время бытовой активности (HH:MM)     |
| `day.steps`              | DayRecord               | Шаги за день                         |
| `day.sleepStart`         | DayRecord               | Время засыпания (HH:MM) из чек-ина   |
| `day.sleepQuality`       | DayRecord               | Качество сна (1-5)                   |
| `day.trainings[].type`   | Training                | Тип тренировки                       |
| `currentStreak`          | DayTab (вычисляется)    | Дней подряд в норме                  |
| `getAverageBedtime()`    | Advice helpers          | Среднее время засыпания за 14 дней   |
| `getHoursUntilBedtime()` | Advice helpers          | Часов до сна (из истории или расчёт) |

---

## 🔮 Потенциальные советы (не реализованы)

Данные уже есть в модели, но советы пока не используют их:

| ID                 | Данные             | Условие                      | Описание                                           |
| ------------------ | ------------------ | ---------------------------- | -------------------------------------------------- |
| `category_variety` | `Product.category` | Все продукты одной категории | Разнообразие по категориям (требует поле category) |
| `weekday_pattern`  | История 28 дней    | Паттерны по дням недели      | Требует много данных                               |

> **Примечание**: Для `category_variety` нужно сначала добавить поле `category`
> в модель Product.

---

## localStorage ключи

### Основные ключи данных

| Ключ                  | Описание             | Namespace     | Файл               |
| --------------------- | -------------------- | ------------- | ------------------ |
| `heys_dayv2_{date}`   | Данные дня           | ✅ clientId   | `heys_day_v12.js`  |
| `heys_products`       | База продуктов       | ✅ clientId   | `heys_core_v12.js` |
| `heys_profile`        | Профиль пользователя | ✅ clientId   | `heys_user_v12.js` |
| `heys_norms`          | Нормы питания        | ✅ clientId   | `heys_user_v12.js` |
| `heys_hr_zones`       | Пульсовые зоны       | ✅ clientId   | `heys_user_v12.js` |
| `heys_client_current` | Текущий клиент       | ❌ глобальный | `heys_app_v12.js`  |

### Insights системы

| Ключ                         | Описание                                                                  | Namespace   | Файл                          |
| ---------------------------- | ------------------------------------------------------------------------- | ----------- | ----------------------------- |
| `heys_ews_weekly_v1`         | EWS Weekly Progress (4 недели снапшотов)                                  | ✅ clientId | `pi_early_warning.js`         |
| `heys_game`                  | Состояние геймификации (XP, уровень, достижения)                          | ✅ clientId | `heys_gamification_v1.js`     |
| `heys_portion_history`       | История выбора порций (для автоподстановки)                               | ✅ clientId | `heys_core_v12.js`            |
| `heys_pending_client_queue`  | Очередь неуспешных синков (retry при восстановлении связи)                | ✅ clientId | `heys_app_sync_effects_v1.js` |
| `heys_widget_layout_v1`      | Layout виджетов Dashboard ([см. APP_SYSTEMS](./APP_SYSTEMS_REFERENCE.md)) | ✅ clientId | `heys_widgets_core_v1.js`     |
| `heys_widget_layout_meta_v1` | Метаданные grid (версия, дата)                                            | ✅ clientId | `heys_widgets_core_v1.js`     |
| `heys_water_history`         | История воды (compressed)                                                 | ✅ clientId | `heys_day_hooks.js`           |
| `heys_grams_history`         | История порций в граммах (автоподстановка)                                | ✅ clientId | `heys_core_v12.js`            |
| `heys_scheduled_advices`     | Запланированные советы/напоминания                                        | ✅ clientId | `heys_advice_bundle_v1.js`    |

### Авторизация и сессия

| Ключ                       | Описание                                                        | Namespace     | Файл              |
| -------------------------- | --------------------------------------------------------------- | ------------- | ----------------- |
| `heys_pin_auth_client`     | ID клиента при PIN-входе                                        | ❌ глобальный | `heys_auth_v1.js` |
| `heys_session_token`       | Session token PIN-пользователя (JWT, глобальный после v55)      | ❌ глобальный | `heys_auth_v1.js` |
| `heys_curator_session`     | JWT токен куратора — источник правды для `isCuratorSession()`   | ❌ глобальный | `heys_auth_v1.js` |
| `heys_supabase_auth_token` | Legacy supabase token (fallback для curator-сессии, к удалению) | ❌ глобальный | `heys_auth_v1.js` |
| `heys_auth_rate_limit_v1`  | Rate limiting для PIN-авторизации                               | ❌ глобальный | `heys_auth_v1.js` |

### Подписки и триал

| Ключ                      | Описание              | Namespace   | Файл                     |
| ------------------------- | --------------------- | ----------- | ------------------------ |
| `heys_trial_queue_status` | Статус очереди триала | ✅ clientId | `heys_trial_queue_v1.js` |
| `heys_trial_capacity`     | Кэш ёмкости триала    | ✅ clientId | `heys_trial_queue_v1.js` |

### UI и онбординг

| Ключ                            | Описание                                        | Namespace     | Файл                       |
| ------------------------------- | ----------------------------------------------- | ------------- | -------------------------- |
| `heys_widgets_tour_completed`   | Статус тура по виджетам                         | ✅ clientId   | `heys_ui_onboarding_v1.js` |
| `heys_consents_{clientId}`      | Согласия пользователя                           | ✅ clientId   | `heys_consents_v1.js`      |
| `heys_registration_in_progress` | Флаг процесса регистрации (guard против дублей) | ❌ глобальный | `heys_auth_v1.js`          |

### Синхронизация

| Ключ                                | Описание                                                 | Namespace     | Файл                          |
| ----------------------------------- | -------------------------------------------------------- | ------------- | ----------------------------- |
| `heys_deleted_products_ignore_list` | Игнор-лист удалённых продуктов (v2 tombstones)           | ❌ глобальный | `heys_day_utils.js`           |
| `heys_deleted_ids`                  | Tombstone IDs для синхронизации (доступ через Store API) | ✅ clientId   | `heys_app_sync_effects_v1.js` |

### Отладка

| Ключ             | Описание                                                          | Namespace     | Файл                    |
| ---------------- | ----------------------------------------------------------------- | ------------- | ----------------------- |
| `heys_debug_api` | Включить debug-логи API (установить значение `'true'` в DevTools) | ❌ глобальный | `heys_yandex_api_v1.js` |

### Кэширование (sessionStorage)

| Ключ                         | Описание                      | Namespace     | Файл                        |
| ---------------------------- | ----------------------------- | ------------- | --------------------------- |
| `heys_session_cache_{key}`   | Кэш сессии (shared products)  | ❌ глобальный | `advanced-cache-manager.ts` |
| `heys_shared_products_cache` | Кэш общих продуктов (offline) | ❌ глобальный | Fallback при офлайн         |

**Правила работы с localStorage:**

> ⚠️ **КРИТИЧНО (v4.8.8)**: В React компонентах НЕ используй прямой доступ к
> localStorage через `U.lsGet/U.lsSet`. Всегда используй **Store API**!

**✅ ПРАВИЛЬНО v4.8.8+ (React):**

```javascript
// Читаем продукты через Store API (handles scoping internally)
const products = window.HEYS?.products?.getAll?.() || [];

// Пишем через Store API (sync + localStorage + memory cache)
HEYS.products.setAll(newProducts);
```

**❌ НЕПРАВИЛЬНО (broken in React):**

```javascript
// Bypasses scoping → reads unscoped key → empty array
const products = window.HEYS.utils.lsGet('heys_products', []);
```

**Почему это критично:**

- Store API пишет в scoped key: `heys_{clientId}_products`
- `U.lsGet('heys_products')` читает unscoped key → empty
- Результат: React видит 42 продукта вместо 290 → паттерны не активируются

**Legacy code (вне React):**

1. **Используй `U.lsSet()` / `U.lsGet()`** для legacy sync logic — они
   автоматически добавляют clientId prefix
2. **Глобальные ключи** (❌) — только для auth/session, НЕ для данных
   пользователя
3. **sessionStorage** — только для временного кэша, НЕ персистентные данные

**Дополнительно**: См. [STORE_API_QUICKREF.md](./STORE_API_QUICKREF.md) для
полного руководства

---

## Частые ошибки

| Ошибка                         | Правильно                                   |
| ------------------------------ | ------------------------------------------- |
| `dayTot.protein`               | `dayTot.prot` ⚠️                            |
| `normAbs.protein`              | `normAbs.prot` ⚠️                           |
| `item.category`                | `getProductFromItem(item, pIndex).category` |
| `heys_day_`                    | `heys_dayv2_` (v2!)                         |
| `localStorage.setItem()`       | `U.lsSet()` (legacy) / `Store API` (React)  |
| `utils.lsGet()` in React       | `products.getAll()` ⚠️ **v4.8.8 CRITICAL**  |
| `utils.lsGet('heys_products')` | `HEYS.products.getAll()` ⚠️ **BROKEN**      |

---

<!-- ════════════════════════════════════════════════════════════════
     ANCHOR STUBS — Обратная совместимость
     Секции перенесены в отдельные файлы, эти якоря предотвращают 404.
     ════════════════════════════════════════════════════════════════ -->

## Перемещённые секции (обратная совместимость)

### → Caloric Debt (Калорийный долг)

> ⚡ **Перенесено** в
> [DATA_MODEL_NUTRITION.md — Caloric Debt](./DATA_MODEL_NUTRITION.md#-caloric-debt-калорийный-долг)

<!-- anchor for old links: #-caloric-debt-калорийный-долг -->

<a name="-caloric-debt-калорийный-долг"></a>

---

### → Harm Score v2

> ⚡ **Перенесено** в
> [DATA_MODEL_ANALYTICS.md — Harm Score](./DATA_MODEL_ANALYTICS.md#-harm-score--научная-система-оценки-вредности-продуктов-0-10)

<!-- anchor for old links: #harm-score-v2 -->

<a name="harm-score-v2"></a>

---

### → Predictive Insights

> ⚡ **Перенесено** в
> [DATA_MODEL_ANALYTICS.md — Predictive Insights](./DATA_MODEL_ANALYTICS.md#-predictive-insights-v520--41-научный-паттерн)

<a name="-predictive-insights-v520--41-научный-паттерн"></a>

---

### → Инсулиновая волна

> ⚡ **Перенесено** в
> [DATA_MODEL_NUTRITION.md — Инсулиновая волна](./DATA_MODEL_NUTRITION.md#-инсулиновая-волна-insulin-wave-module--сводка)
> Полная документация:
> [INSULIN_WAVE_DOCUMENTATION.md](./INSULIN_WAVE_DOCUMENTATION.md)

<a name="инсулиновая-волна-insulin-wave-module"></a>

---

### → Refeed Day

> ⚡ **Перенесено** в
> [DATA_MODEL_NUTRITION.md — Refeed Day](./DATA_MODEL_NUTRITION.md#-refeed-day-загрузочный-день)

<a name="-refeed-day-загрузочный-день"></a>

---

### → Status Score, Gamification, Phenotype, EWS

> ⚡ **Перенесено** в [DATA_MODEL_ANALYTICS.md](./DATA_MODEL_ANALYTICS.md)

<a name="-status-score-статус-дня-0-100"></a>
<a name="-gamification-xp-уровни-достижения"></a>
<a name="-phenotype-метаболический-фенотип"></a>
<a name="-early-warning-system-v42"></a>
<a name="-dynamic-priority-badge-v430"></a>

---

### → Training Context, NDTE, TEF, TDEE

> ⚡ **Перенесено** в [DATA_MODEL_NUTRITION.md](./DATA_MODEL_NUTRITION.md)

<a name="-training-context-v340"></a>
<a name="-ndte--next-day-training-effect-v360"></a>
<a name="-tef-thermic-effect-of-food"></a>
<a name="-tdee-total-daily-energy-expenditure"></a>
<a name="-meal-quality-score"></a>

---

## Связанные файлы

| Файл                                | Описание                                                               |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `heys_models_v1.js`                 | Типы и функции работы с данными                                        |
| `heys_day_v12.js`                   | Proxy → DayTab (14 LOC)                                                |
| `heys_day_hooks.js`                 | React hooks для данных дня                                             |
| `heys_user_v12.js`                  | Профиль и настройки                                                    |
| `heys_core_v12.js`                  | Продукты, поиск, утилиты                                               |
| `heys_advice_v1.js`                 | DEPRECATED shim (42 LOC) → `advice/` modules                           |
| `heys_iw_*.js` (8 файлов)           | Модуль инсулиновой волны (37 факторов), см. DATA_MODEL_NUTRITION       |
| `heys_cycle_v1.js`                  | Модуль менструального цикла                                            |
| `heys_status_v1.js`                 | Статус дня 0-100                                                       |
| `heys_gamification_v1.js`           | XP, уровни, достижения                                                 |
| `heys_phenotype_v1.js`              | Метаболический фенотип                                                 |
| `heys_predictive_insights_v1.js`    | Прогнозы и паттерны (оркестратор Insights)                             |
| `pi_early_warning.js`               | EWS v4.2 — 25 warnings, Dual-Mode, Global Score, Phenotype             |
| `pi_causal_chains.js`               | Cross-Pattern Causal Chains (6 цепочек)                                |
| `pi_constants.js`                   | Dynamic Priority Badge, SECTION_PRIORITY_RULES v4.3.0                  |
| `pi_whatif.js`                      | What-If Scenarios — 10 action types                                    |
| `pi_feedback_loop.js`               | Feedback Loop — EMA weight adjustment (α=0.1)                          |
| `pi_outcome_modal.js`               | Outcome Modal — UI сбора feedback                                      |
| `pi_analytics_api.js`               | forecastEnergy() — прогноз энергии 24ч                                 |
| `pi_meal_recommender.js`            | Meal Recommender v3.0 — 8-сценарный decision tree                      |
| `pi_product_picker.js`              | Product Picker — 11-factor scoring                                     |
| `pi_meal_rec_patterns.js`           | 12 паттернов для meal recommender (Phase A/B/C)                        |
| `pi_stats.js`                       | Advanced Confidence Layer v3.5.0 — 27 функций (131 тест)               |
| `pi_thresholds.js`                  | Adaptive Personalized Thresholds v2.0.0 (~1080 LOC)                    |
| `pi_patterns.js`                    | 22 анализатора паттернов (v4.0)                                        |
| `pi_advanced.js`                    | Продвинутые паттерны B1-B6 (v3.0)                                      |
| `pi_phenotype.js`                   | Insights EWS phenotype detection                                       |
| `pi_meal_planner.js`                | Meal Planner v1.4.0                                                    |
| `pi_meal_rec_feedback.js`           | Meal Recommendation Feedback v1.0                                      |
| `pi_ui_dashboard.js`                | Insights Dashboard UI v3.0.1                                           |
| `pi_ui_cards.js`                    | Insights Cards UI v3.0.2                                               |
| `pi_ui_meal_rec_card.js`            | Meal Recommendation Card UI                                            |
| `pi_ui_whatif_scenarios.js`         | What-If Scenarios UI v1.0                                              |
| `heys_cascade_card_v1.js`           | Cascade Card v1.2.1 — цепочка решений                                  |
| `heys_bootstrap_v1.js`              | App init, dependency management                                        |
| `heys_widgets_core_v1.js`           | Grid Engine, D&D, State Manager                                        |
| `heys_paywall_v1.js`                | Read-only gating + Paywall UI                                          |
| `heys_trial_queue_v1.js`            | Trial queue + онбординг                                                |
| `heys_subscriptions_v1.js`          | Подписки и платежи ЮKassa                                              |
| `heys_consents_v1.js`               | ПЭП, 152-ФЗ compliance                                                 |
| `heys_metabolic_intelligence_v1.js` | A/B тесты, Data Inventory                                              |
| `heys_simple_analytics.js`          | Performance tracking                                                   |
| `heys_data_overview_v1.js`          | Заполненность данных                                                   |
| `heys_refeed_v1.js`                 | Загрузочные дни                                                        |
| `heys_tef_v1.js`                    | Термический эффект пищи                                                |
| `heys_tdee_v1.js`                   | Общий расход энергии                                                   |
| `heys_supplements_v1.js`            | Каталог добавок, тайминг, взаимодействия                               |
| `heys_supplements_science_v1.js`    | Биодоступность, формы, маркеры                                         |
| `heys_status_v1.js`                 | Status Score 0-100 ([см. SCORING_REFERENCE](./SCORING_REFERENCE.md))   |
| `heys_cascade_card_v1.js`           | CRS v7, Cascade Card ([см. SCORING_REFERENCE](./SCORING_REFERENCE.md)) |
| `heys_widgets_core_v1.js`           | Widget Dashboard ([см. APP_SYSTEMS](./APP_SYSTEMS_REFERENCE.md))       |
| `heys_cloud_merge_v1.js`            | Cloud merge logic ([см. APP_SYSTEMS](./APP_SYSTEMS_REFERENCE.md))      |
| `heys_trial_queue_v1.js`            | Trial Queue ([см. APP_SYSTEMS](./APP_SYSTEMS_REFERENCE.md))            |

---

## Changelog

> 📋 Единый changelog вынесен в
> [`CHANGELOG_DATA_MODEL.md`](./CHANGELOG_DATA_MODEL.md). Полная история
> изменений перенесена в единый файл.
