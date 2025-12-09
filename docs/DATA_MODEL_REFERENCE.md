# 📊 HEYS Data Model Reference

> **Справочник всех аналитических параметров HEYS**  
> Версия: 2.1.1 | Обновлено: 2025-12-09 | **156 умных советов** | **26 факторов инсулиновой волны** | **🌸 Трекинг цикла**

---

## Быстрая навигация

- [📊 HEYS Data Model Reference](#-heys-data-model-reference)
  - [Быстрая навигация](#быстрая-навигация)
  - [Данные дня (DayRecord)](#данные-дня-dayrecord)
  - [Тренировки (Training)](#тренировки-training)
  - [Пульсовые зоны (heys\_hr\_zones)](#пульсовые-зоны-heys_hr_zones)
  - [Приёмы пищи (Meal)](#приёмы-пищи-meal)
  - [Продукт в приёме (MealItem)](#продукт-в-приёме-mealitem)
  - [Продукт (Product)](#продукт-product)
    - [Базовые поля (на 100г)](#базовые-поля-на-100г)
    - [Вычисляемые поля (computeDerived)](#вычисляемые-поля-computederived)
  - [Профиль пользователя (heys\_profile)](#профиль-пользователя-heys_profile)
  - [Нормы питания (heys\_norms)](#нормы-питания-heys_norms)
  - [Вычисляемые данные](#вычисляемые-данные)
    - [Суммы за день (dayTot)](#суммы-за-день-daytot)
    - [Дневные нормы в граммах (normAbs)](#дневные-нормы-в-граммах-normabs)
    - [Метаболизм](#метаболизм)
    - [Streak аналитика](#streak-аналитика)
  - [Советы (Advice Module)](#советы-advice-module)
    - [Все типы советов](#все-типы-советов)
    - [Используемые переменные](#используемые-переменные)
  - [🔮 Потенциальные советы (не реализованы)](#-потенциальные-советы-не-реализованы)
  - [localStorage ключи](#localstorage-ключи)
  - [Частые ошибки](#частые-ошибки)
  - [Связанные файлы](#связанные-файлы)
  - [Changelog](#changelog)

---

## Данные дня (DayRecord)

**localStorage ключ**: `heys_dayv2_{YYYY-MM-DD}` (с clientId namespace)

| Параметр | Тип | Описание | Пример |
|----------|-----|----------|--------|
| `date` | string | Дата в формате YYYY-MM-DD | `"2025-11-29"` |
| `sleepStart` | string | Время начала сна (HH:MM) | `"23:30"` |
| `sleepEnd` | string | Время окончания сна (HH:MM) | `"07:00"` |
| `sleepNote` | string | Заметка о сне | `"Хорошо выспался"` |
| `sleepQuality` | number | Качество сна (1-10) | `7` |
| `weightMorning` | number | Утренний вес (кг) | `75.5` |
| `deficitPct` | number | Процент дефицита/профицита (дефицит = отрицательное число) | `-15` |
| `steps` | number | Количество шагов | `8500` |
| `householdActivities` | HouseholdActivity[] | Массив бытовых активностей | `[{minutes: 30, time: "14:00"}]` |
| `householdMin` | number | ⚠️ Legacy: сумма минут всех активностей | `30` |
| `householdTime` | string | ⚠️ Legacy: время первой активности | `"14:00"` |
| `dayScore` | number | Оценка дня (1-10) | `8` |
| `moodAvg` | number | Среднее настроение за день (1-10) | `7.5` |
| `wellbeingAvg` | number | Среднее самочувствие за день (1-10) | `7.2` |
| `stressAvg` | number | Средний стресс за день (1-10) | `3.0` |
| `dayComment` | string | Комментарий к дню | `"Продуктивный день"` |
| `waterMl` | number | Выпито воды (мл) | `1500` |
| `lastWaterTime` | string | Время последнего приёма воды (ISO) | `"2025-11-29T14:30:00"` |
| `sleepHours` | number | Вычисляемое: часы сна | `7.5` |
| `updatedAt` | number | Timestamp последнего обновления | `1732886400000` |
| `meals` | Meal[] | Массив приёмов пищи | `[...]` |
| `trainings` | Training[] | Массив тренировок (до 3) | `[...]` |
| `measurements` | Measurements | Замеры тела (опционально) | `{...}` |
| `cycleDay` | number/null | День менструального цикла (1-7, null=не отслеживается) | `3` |

---

## Замеры тела (Measurements)

Объект внутри DayRecord. Показывается в утреннем чек-ине раз в 7 дней.

| Параметр | Тип | Описание | Пример |
|----------|-----|----------|--------|
| `waist` | number | Талия (см) | `78` |
| `hips` | number | Бёдра (см) | `96` |
| `thigh` | number | Бедро — одна сторона (см) | `55` |
| `biceps` | number | Бицепс — одна сторона (см) | `32` |
| `measuredAt` | string | Дата замера (YYYY-MM-DD) | `"2025-12-01"` |

**Логика отображения:**
- Показывается, если `measuredAt` отсутствует или прошло ≥7 дней
- Можно пропустить (canSkip: true)
- Предыдущие значения показываются как placeholder

**API:**
- `HEYS.showCheckin.measurements()` — принудительный показ шага замеров

---

## Тренировки (Training)

| Параметр | Тип | Описание | Пример |
|----------|-----|----------|--------|
| `z` | number[4] | Минуты в каждой пульсовой зоне | `[5, 20, 15, 0]` |
| `time` | string | Время тренировки (HH:MM) | `"18:00"` |
| `type` | string | Тип тренировки (ID) | `"cardio"` / `"strength"` / `"hobby"` |

**Примечание**: `z[0]` = зона 1 (лёгкая), `z[3]` = зона 4 (максимальная)

**Типы тренировок** (ID → Label):
| ID | Иконка | Label | Описание |
|----|--------|-------|----------|
| `cardio` | 🏃 | Кардио | бег, велосипед, плавание |
| `strength` | 🏋️ | Силовая | тренажёры, свободные веса |
| `hobby` | ⚽ | Активное хобби | йога, прогулки, спортивные игры |

⚠️ **Важно**: В коде используются **ID** (`'cardio'`, `'strength'`, `'hobby'`), НЕ русские названия!

---

## Бытовая активность (HouseholdActivity)

| Параметр | Тип | Описание | Пример |
|----------|-----|----------|--------|
| `minutes` | number | Количество минут | `30` |
| `time` | string | Время активности (HH:MM), опционально | `"14:00"` |

**Особенности**:
- Хранится в массиве `day.householdActivities`
- Можно добавлять несколько записей в день
- Legacy поля `householdMin` и `householdTime` обновляются автоматически (для backward compatibility)
- MET = 2.5 для расчёта калорий

---

## Пульсовые зоны (heys_hr_zones)

**localStorage ключ**: `heys_hr_zones`

| Параметр | Тип | Описание | Пример |
|----------|-----|----------|--------|
| `name` | string | Название зоны | `"Жиросжигание"` |
| `hrFrom` | number | Нижняя граница пульса | `120` |
| `hrTo` | number | Верхняя граница пульса | `140` |
| `MET` | number | Метаболический эквивалент | `6.0` |

**Стандартные зоны**:
1. Зона 1: Восстановление (50-60% от max HR)
2. Зона 2: Жиросжигание (60-70%)
3. Зона 3: Аэробная (70-80%)
4. Зона 4: Анаэробная (80-90%)

---

## Приёмы пищи (Meal)

| Параметр | Тип | Описание | Пример |
|----------|-----|----------|--------|
| `id` | string | Уникальный ID приёма | `"meal_1732886400000"` |
| `name` | string | Название приёма | `"Завтрак"` |
| `time` | string | Время приёма (HH:MM) | `"08:30"` |
| `mood` | number | Настроение (1-10) | `7` |
| `wellbeing` | number | Самочувствие (1-10) | `7` |
| `stress` | number | Уровень стресса (1-10) | `3` |
| `items` | MealItem[] | Массив продуктов в приёме | `[...]` |

---

## Продукт в приёме (MealItem)

| Параметр | Тип | Описание | Пример |
|----------|-----|----------|--------|
| `id` | string | Уникальный ID записи | `"item_1732886400001"` |
| `product_id` | string/number | ID продукта из базы | `"prod_123"` |
| `name` | string | Название (опционально) | `"Овсянка"` |
| `grams` | number | Граммы | `150` |

⚠️ **Важно**: `MealItem` НЕ имеет поля `category`! Для получения категории используй `getProductFromItem(item, pIndex)`.

---

## Продукт (Product)

**localStorage ключ**: `heys_products` (массив всех продуктов)

### Базовые поля (на 100г)

| Параметр | Тип | Описание | Пример |
|----------|-----|----------|--------|
| `id` | string/number | Уникальный ID | `"prod_123"` |
| `name` | string | Название продукта | `"Овсяная каша"` |
| `simple100` | number | Простые углеводы | `2.5` |
| `complex100` | number | Сложные углеводы | `58.0` |
| `protein100` | number | Белок | `12.3` |
| `badFat100` | number | Вредные жиры | `1.5` |
| `goodFat100` | number | Полезные жиры | `5.0` |
| `trans100` | number | Транс-жиры | `0` |
| `fiber100` | number | Клетчатка | `8.0` |
| `gi` | number | Гликемический индекс | `55` |
| `harm` | number | Индекс вреда (0-100) | `5` |
| `category` | string | Категория продукта | `"Молочные"` |
| `portions` | Portion[] | Порции продукта (опционально) | `[{name: "1 шт", grams: 60}]` |

**Структура Portion:**
| Поле | Тип | Описание |
|------|-----|----------|
| `name` | string | Название порции ("1 шт", "1 ч.л.") |
| `grams` | number | Граммы в порции |

**Авто-порции**: Если `portions` не задано, система определяет порции автоматически по названию продукта (~25 паттернов: яйцо, хлеб, молоко, банан, яблоко и т.д.). См. `HEYS.models.getAutoPortions()`.

**Альтернативные названия полей** (для совместимости):
- ГИ: `gi100`, `GI`, `giIndex`
- Вред: `harmScore`, `harm100`, `harmPct`

### Вычисляемые поля (computeDerived)

| Параметр | Формула | Описание |
|----------|---------|----------|
| `carbs100` | `simple100 + complex100` | Всего углеводов |
| `fat100` | `badFat100 + goodFat100 + trans100` | Всего жиров |
| `kcal100` | `protein100*4 + carbs100*4 + fat100*9` | Калории |

---

## Профиль пользователя (heys_profile)

**localStorage ключ**: `heys_profile`

| Параметр | Тип | Описание | Пример |
|----------|-----|----------|--------|
| `firstName` | string | Имя | `"Антон"` |
| `lastName` | string | Фамилия | `"Поплавский"` |
| `gender` | string | Пол | `"Мужской"` / `"Женской"` / `"Другое"` |
| `weight` | number | Текущий вес (кг) | `75` |
| `height` | number | Рост (см) | `180` |
| `age` | number | Возраст (лет) | `30` |
| `sleepHours` | number | Норма сна (часов) | `8` |
| `insulinWaveHours` | number | Период инсулиновой волны | `4` |
| `deficitPctTarget` | number | Целевой % дефицита (отриц.) / профицита (полож.) | `-15` |
| `weightGoal` | number | Целевой вес (кг) | `70` |
| `birthDate` | string | Дата рождения (YYYY-MM-DD) | `"1995-04-12"` |
| `stepsGoal` | number | Цель по шагам в день (используется в мастере шагов) | `10000` |
| `activityLevel` | string | Уровень активности (для TDEE) | `"moderate"` |
| `cycleTrackingEnabled` | boolean | Включён ли трекинг менструального цикла | `false` |

---

## 🌸 Менструальный цикл (Cycle)

**Модуль**: `heys_cycle_v1.js` | **Утренний чек-ин**: шаг `cycle`

### Поле cycleDay (в DayRecord)

| Значение | Фаза | Описание |
|----------|------|----------|
| `1-3` | Менструальная | Первые дни цикла |
| `4-7` | Менструальная/Фолликулярная | Переходный период |
| `null` | Не отслеживается | Трекинг выключен или не для этого пола |

### Фазы цикла (getCyclePhase)

| ID | Иконка | Название | Дни | kcalMultiplier | waterMultiplier | insulinWave |
|----|--------|----------|-----|----------------|-----------------|-------------|
| `menstrual` | 🌸 | Менструация | 1-7 | 1.05-1.10 | 1.10 | +12-15% |
| `follicular` | 🌱 | Фолликулярная | 8-14 | 1.00 | 1.00 | 0% |
| `ovulation` | ⭐ | Овуляция | 14-16 | 1.00 | 1.00 | 0% |
| `luteal` | 🌙 | Лютеиновая | 17-28 | 1.05-1.08 | 1.05 | +8-10% |

### Коррекции норм

**Калории**: `optimum × kcalMultiplier`  
**Вода**: `waterGoal + cycleBonus` (показывается в breakdown)  
**Инсулиновая волна**: `waveHours × insulinWaveMultiplier` (фактор #26)

### Советы для цикла (7 шт)

| ID | Условие | Описание |
|----|---------|----------|
| `cycle_sweet_craving` | Менструация + сладкое >100% | "Тяга к сладкому — норма" |
| `cycle_iron_important` | Менструация + нет железа | "Сейчас железо особенно важно" |
| `cycle_rest_ok` | Дни 1-2 + нет тренировки | "Отдых — правильный выбор" |
| `cycle_hydration` | Менструация + вода <70% | "Сейчас вода особенно нужна" |
| `cycle_energy_up` | Фолликулярная фаза | "Хорошее время для тренировок" |
| `cycle_peak_performance` | Овуляция | "Пик энергии! Время для рекордов" |
| `cycle_tracking_thanks` | Любая фаза (первый показ) | "Нормы адаптированы под цикл" |

### Визуализация

**Календарь**: Розовая точка на днях с `cycleDay != null`  
**Карточка**: `CycleCard` в статистике — фаза, день, корректировки  
**Вода**: Бонус `🌸 +X мл` в breakdown  
**График веса**: Розовые зоны для дней с задержкой воды, "чистый" тренд исключает эти дни

### Задержка воды (Water Retention)

Научное обоснование: повышение прогестерона → задержка Na+ и воды → +0.5-3 кг.

| Дни цикла | Severity | Оценка | Исключить из тренда |
|-----------|----------|--------|---------------------|
| 1-3 | high | +2 кг | ✅ Да |
| 4-5 | medium | +1 кг | ✅ Да |
| 6-7 | low | +0.5 кг | ✅ Да |
| 8-14 | none | 0 кг | ❌ Нет |

**Визуализация на sparkline веса**:
- Розовые вертикальные зоны за точками с задержкой
- Розовая обводка вокруг точек
- Бейдж "🌸 чистый" — тренд рассчитан без дней задержки
- Сноска под графиком с объяснением (+1-3 кг, не жир)

### API

```javascript
// Проверка доступности шага
HEYS.Steps.shouldShowCycleStep() // true для женщин с включённым трекингом

// Получение фазы
HEYS.Cycle.getCyclePhase(cycleDay) // { id, name, icon, kcalMultiplier, ... }

// Множители
HEYS.Cycle.getKcalMultiplier(cycleDay) // 1.00-1.10
HEYS.Cycle.getWaterMultiplier(cycleDay) // 1.00-1.10
HEYS.Cycle.getInsulinWaveMultiplier(cycleDay) // 1.00-1.15

// Задержка воды
HEYS.Cycle.getWaterRetentionInfo(cycleDay) // { hasRetention, severity, kgEstimate, advice, excludeFromTrend }
HEYS.Cycle.shouldExcludeFromWeightTrend(cycleDay) // true для дней 1-7

// Исторический анализ
HEYS.Cycle.findAllCycles(monthsBack, lsGet) // [{startDate, endDate, days}]
HEYS.Cycle.analyzeWaterRetentionHistory(monthsBack, lsGet) // {avgRetentionKg, insight, trend, ...}
HEYS.Cycle.getWeightNormalizationForecast(cycleDay) // {daysUntilNormal, message}
```

---

## Нормы питания (heys_norms)

**localStorage ключ**: `heys_norms`

| Параметр | Тип | Описание | По умолчанию |
|----------|-----|----------|--------------|
| `carbsPct` | number | % углеводов от калоража | `50` |
| `proteinPct` | number | % белка от калоража | `25` |
| `simpleCarbPct` | number | % простых от углеводов | `30` |
| `badFatPct` | number | % вредных жиров от жиров | `30` |
| `superbadFatPct` | number | % транс-жиров от жиров | `5` |
| `fiberPct` | number | г клетчатки на 1000 ккал | `14` |
| `giPct` | number | Целевой средний ГИ | `55` |
| `harmPct` | number | Допустимый % вреда | `10` |

---

## Вычисляемые данные

### Суммы за день (dayTot)

⚠️ **Критично**: Ключ для белка — `prot`, НЕ `protein`!

| Параметр | Тип | Описание |
|----------|-----|----------|
| `kcal` | number | Сумма калорий за день |
| `carbs` | number | Сумма углеводов |
| `simple` | number | Сумма простых углеводов |
| `complex` | number | Сумма сложных углеводов |
| `prot` | number | Сумма белка ⚠️ |
| `fat` | number | Сумма жиров |
| `bad` | number | Сумма вредных жиров |
| `good` | number | Сумма полезных жиров |
| `trans` | number | Сумма транс-жиров |
| `fiber` | number | Сумма клетчатки |
| `gi` | number | Средневзвешенный ГИ |
| `harm` | number | Сумма вреда |

### Дневные нормы в граммах (normAbs)

Вычисляется из `optimum` и `heys_norms`:

| Параметр | Формула |
|----------|---------|
| `kcal` | `optimum` |
| `carbs` | `optimum * carbsPct / 100 / 4` |
| `prot` | `optimum * proteinPct / 100 / 4` ⚠️ |
| `fat` | `optimum * (100 - carbsPct - proteinPct) / 100 / 9` |
| `simple` | `carbs * simpleCarbPct / 100` |
| `complex` | `carbs - simple` |
| `bad` | `fat * badFatPct / 100` |
| `trans` | `fat * superbadFatPct / 100` |
| `good` | `fat - bad - trans` |
| `fiber` | `optimum / 1000 * fiberPct` |

### Метаболизм

| Параметр | Описание | Формула |
|----------|----------|---------|
| `BMR` | Базовый метаболизм | Mifflin-St Jeor |
| `TDEE` | Общий расход | `BMR * activityFactor` |
| `optimum` | Целевой калораж | `TDEE * (1 - deficitPct/100)` |
| `trainingKcal` | От тренировок | `∑(zone_minutes * MET * weight / 60)` |
| `ratio` | Выполнение нормы | `dayTot.kcal / optimum` |

### Streak аналитика

| Параметр | Описание |
|----------|----------|
| `currentStreak` | Дней подряд в норме (ratio 0.75-1.15) |
| `activeDays` | Map дней с ratio за текущий месяц |

---

## Советы (Advice Module)

**Файл**: `heys_advice_v1.js` | **Всего советов: 149**

### 🎯 Goal-aware система (v2.0)

Советы теперь адаптируются к цели пользователя (дефицит/набор/поддержание).

**Режимы цели** (`getGoalMode(deficitPct)`):

| Режим | Условие | Целевой диапазон kcalPct | Критический перебор | Критический недобор |
|-------|---------|--------------------------|---------------------|---------------------|
| `deficit` (Похудение) | `deficitPct <= -10%` | 90-105% | >115% | <80% |
| `deficit` (Лёгкое) | `deficitPct -5% до -9%` | 92-108% | >120% | <75% |
| `bulk` (Набор) | `deficitPct >= +10%` | 95-110% | >125% | <85% |
| `bulk` (Лёгкий) | `deficitPct +5% до +9%` | 93-112% | >120% | <80% |
| `maintenance` (Поддержание) | `deficitPct -4% до +4%` | 90-110% | >125% | <70% |

**Источник цели**:
1. `day.deficitPct` — коррекция на конкретный день (из вкладки статистики)
2. `prof.deficitPctTarget` — цель из профиля (fallback)

**Примечание**: `deficitPct` хранится как:
- **Отрицательное число** для дефицита (например: `-15` = 15% дефицит)
- **Положительное число** для профицита (например: `+10` = 10% набор)

### Goal-specific советы

| ID | Режим | Условие | Описание |
|---|---|---|---|
| `bulk_protein_critical` | bulk | `proteinPct < 0.8` | "Для набора нужен белок!" |
| `bulk_carbs_low` | bulk | `carbsPct < 0.7` | "Добавь углеводов для энергии" |
| `bulk_kcal_behind` | bulk | `hour >= 16 && kcalPct < 0.6` | "Только X% от плана набора" |
| `deficit_protein_save_muscle` | deficit | `proteinPct < 0.9` | "Белок сохраняет мышцы на дефиците" |
| `deficit_fiber_satiety` | deficit | `fiberPct < 0.5` | "Клетчатка даёт сытость без калорий" |
| `deficit_too_harsh` | deficit | `hour >= 18 && kcalPct < 0.7` | "Слишком жёсткий дефицит" |
| `deficit_on_track_motivation` | deficit | `isInTargetRange(kcalPct, goal)` | "Дефицит выдерживается!" |
| `maintenance_stable` | maintenance | `isInTargetRange(kcalPct, goal)` | "Калории в балансе!" |
| `goal_on_track` | any | `isInTargetRange(kcalPct, goal)` | "Цель выполняется!" |

### Адаптивные советы (изменённые)

| ID | Изменение |
|---|---|
| `kcal_excess_critical` | Порог зависит от `goal.criticalOver` |
| `kcal_excess_mild` | Порог зависит от `goal.targetRange.max` |
| `kcal_under_critical` | 🆕 Порог зависит от `goal.criticalUnder` |
| `evening_undereating` | Текст зависит от режима (bulk/deficit/maintenance) |
| `evening_perfect` | Текст зависит от режима |
| `perfect_day` | Текст зависит от режима |
| `weekend_relax` | Не показывается для bulk режима |

### Все типы советов

| ID | Условие | Категория | Триггер |
|---|---|---|---|
| `young_sleep` | `age<25 && hour 1-5` | personalized | tab_open |
| `monday_motivation` | Понедельник утро | motivation | tab_open |
| `friday_reminder` | Пятница вечер | motivation | tab_open |
| `sunday_planning` | Воскресенье вечер | motivation | tab_open |
| `crash_support` | `isCriticallyOver/Under(kcalPct, goal)` | emotional | tab_open, product_added |
| `stress_support` | `avgMood < 3` | emotional | tab_open |
| `streak_7` | `currentStreak >= 7` | achievement | tab_open |
| `streak_3` | `currentStreak 3-6` | achievement | tab_open |
| `perfect_day` | `hour>=18 && isInTargetRange(kcalPct, goal) && macros>=0.9` | achievement | tab_open |
| `first_day` | `mealCount === 1` (первый раз) | achievement | product_added |
| `kcal_excess_critical` | `isCriticallyOver(kcalPct, goal)` | nutrition | product_added |
| `kcal_excess_mild` | `kcalPct > goal.targetRange.max` | nutrition | product_added |
| `kcal_under_critical` | `isCriticallyUnder(kcalPct, goal) && hour >= 14` | nutrition | tab_open, product_added |
| `trans_fat_warning` | `transPct > 1.0` | nutrition | product_added |
| `simple_carbs_warning` | `simplePct > 1.3` | nutrition | product_added |
| `harm_warning` | `harmPct > 1.0` | nutrition | product_added |
| `protein_low` | `proteinPct < 0.5 && hour >= 12` | nutrition | tab_open, product_added |
| `fiber_low` | `fiberPct < 0.3 && mealCount >= 2` | nutrition | tab_open, product_added |
| `fiber_good` | `fiberPct >= 1.0` | nutrition | product_added |
| `good_fat_low` | `goodFatPct < 0.4 && hour >= 14` | nutrition | tab_open, product_added |
| `post_training_protein` | `hasTraining && proteinPct < 0.8` | training | tab_open, product_added |
| `evening_undereating` | `hour >= 20 && isCriticallyUnder(kcalPct, goal)` | nutrition | tab_open |
| `evening_perfect` | `hour >= 21 && kcalPct 0.9-1.1` | lifestyle | tab_open |
| `balanced_macros` | `mealCount>=2 && all macros 0.9-1.2` | nutrition | product_added |
| `sleep_low` | `sleepHours > 0 && < 6` | lifestyle | tab_open |
| `morning_breakfast` | `hour 7-10 && mealCount === 0` | lifestyle | tab_open |
| `steps_goal` | `steps >= 10000` | lifestyle | tab_open |
| `winter_vitamin_d` | `month 10-2` (ноябрь-март) | lifestyle | tab_open |
| `variety_low` | `items>=5 && uniqueProducts<3` | nutrition | tab_open, product_added |
| `after_sweet_protein` | `lastMeal simplePct>0.6 && kcal>100` | nutrition | product_added |
| `sleep_hunger_correlation` | `sleepDeficit>2 && kcalPct>1.15` | correlation | tab_open, product_added |
| `sleep_hunger_warning` | `sleepDeficit>1.5 && hour<12 && kcalPct<0.3` | correlation | tab_open |
| `stress_sweet_pattern` | `avgStress>=4 && simplePct>1.2` | correlation | product_added |
| `low_stress_balance` | `avgStress 1-2 && kcalPct 0.9-1.1` | correlation | tab_open |
| `hard_workout_recovery` | `highIntensity>20min && proteinPct<1.0` | training | tab_open, product_added |
| `cardio_carbs_balance` | `fatBurn>30min && carbsPct>1.2` | training | product_added |
| `great_workout` | `totalMinutes >= 45` | training | tab_open |
| `water_evening_low` | `hour>=18 && waterPct<0.5` | hydration | tab_open |
| `water_reminder` | `hoursSinceWater>2 && hour 10-21` | hydration | tab_open, product_added |
| `water_goal_reached` | `waterPct >= 1.0` | hydration | tab_open |
| `high_gi_warning` | `avgGI>70 && mealCount>=2` | nutrition | tab_open, product_added |
| `low_gi_great` | `avgGI 0-55 && mealCount>=2` | nutrition | tab_open |
| `simple_complex_ratio` | `totalCarbs>50 && simpleRatio>0.5` | nutrition | product_added |
| `carbs_balance_perfect` | `simpleRatio<=0.3 && mealCount>=2` | nutrition | tab_open |
| `fat_quality_low` | `totalFat>20 && goodRatio<0.4` | nutrition | tab_open, product_added |
| `fat_quality_great` | `goodRatio>=0.6` | nutrition | tab_open |
| `insulin_too_fast` | `gap < insulinWave*0.5` | timing | product_added |
| `insulin_perfect` | `avgGap >= insulinWave*0.9 && meals>=3` | timing | tab_open |
| `late_dinner_warning` | `lastMealHour >= 22` | timing | product_added |
| `good_dinner_time` | `lastMealHour 18-20 && hour>=21` | timing | tab_open |
| `bad_sleep_advice` | `sleepQuality 1-2 && hour<12` | sleep | tab_open |
| `great_sleep` | `sleepQuality>=4 && sleepHours>=7` | sleep | tab_open |
| `sugar_mood_crash` | `moodDrop>=2 && prevMealSimple>30g` | emotional | tab_open |
| `wellbeing_low_food` | `avgWellbeing<3 && kcalPct<0.4 && hour>=12` | emotional | tab_open |
| `wellbeing_nutrition_link` | `avgWellbeing>=4 && kcalPct 0.8-1.1` | emotional | tab_open |
| `iron_reminder` | `gender='Женский' && mealCount>=2 && !hasIronFood` | personalized | tab_open |
| `age_protein` | `age>=40 && proteinPct<0.9` | personalized | tab_open, product_added |
| `household_bonus` | `householdMin >= 60` | activity | tab_open |
| `sedentary_day` | `household=0 && steps<3000 && !training && hour>=18` | activity | tab_open |
| `day_score_low` | `dayScore < 5 && hour >= 20` | emotional | tab_open |
| `day_score_high` | `dayScore >= 8 && hour >= 20` | achievement | tab_open |
| `training_type_strength` | `training.type === 'strength' && proteinPct < 1.0` | training | tab_open, product_added |
| `training_type_hobby` | `training.type === 'hobby'` | training | tab_open |
| `weight_spike_up` | `\|Δweight\| > 1kg` | correlation | tab_open |
| `weight_stable` | `7-day weights σ < 0.5kg` | achievement | tab_open |
| `caffeine_evening` | Кофе после 16:00 | nutrition | product_added |
| `empty_stomach_late` | `hour 10-12 && mealCount === 0` | lifestyle | tab_open |
| `late_heavy_meal` | `lastMealHour >= 21 && lastMealKcal > 500` | timing | product_added |
| `insulin_countdown` | `minutesUntilEnd > 0 && < 60` | timing | tab_open |
| `bedtime_protein` | `hour 20-22 && proteinPct < 0.8` | timing | tab_open |
| `post_holiday_detox` | Дни после праздников (1-2 янв, и др.) | lifestyle | tab_open |
| `best_day_recall` | Лучший день за 7 дней | motivation | tab_open |
| `night_owl_warning` | `hour 1-5 && mealCount > 0` | lifestyle | product_added |
| `lunch_time` | `hour === 13 && mealCount === 1` | lifestyle | tab_open |
| `protein_champion` | `proteinPct >= 1.2` | achievement | tab_open, product_added |
| `snack_window` | `hour === 16 && kcalPct < 0.6` | lifestyle | tab_open |
| `mood_improving` | Настроение выросло между приёмами | correlation | product_added |
| `workout_consistent` | 3 дня тренировок подряд | achievement | tab_open |
| `evening_snacker` | Паттерн поздних ужинов 3 дня | correlation | tab_open |
| `morning_skipper` | Паттерн без завтрака 3 дня | correlation | tab_open |
| **Phase 2: Meal-level** | | | |
| `meal_too_large` | `lastMeal.kcal > 800` | nutrition | product_added |
| `meal_too_small` | `meal.kcal < 150 && mealCount >= 2` | nutrition | product_added |
| `protein_per_meal_low` | `meal.prot < 20 && meal.kcal > 200` | nutrition | product_added |
| `evening_carbs_high` | `hour >= 20 && lastMeal.carbs > 50` | nutrition | product_added |
| `fiber_per_meal_good` | `meal.fiber > 8` | nutrition | product_added |
| `variety_meal_good` | `meal.items.length >= 4` | nutrition | product_added |
| `late_first_meal` | `firstMeal.time >= '12:00' && hour >= 13` | lifestyle | tab_open |
| **Phase 2: Day-quality** | | | |
| `trans_free_day` | `dayTot.trans === 0 && mealCount >= 2` | achievement | tab_open |
| `sugar_low_day` | `dayTot.simple < 25 && mealCount >= 2` | achievement | tab_open |
| `super_hydration` | `waterMl >= 2500` | hydration | tab_open |
| `variety_day_good` | `uniqueProducts >= 10` | nutrition | tab_open |
| `deficit_on_track` | `kcalPct 0.85-0.95 && deficitPct > 0` | lifestyle | tab_open |
| `weekend_relax` | `(Сб или Вс) && kcalPct 1.1-1.3` | lifestyle | tab_open |
| **Phase 2: Timing & Patterns** | | | |
| `fasting_window_good` | `gap ужин→завтрак >= 14h` | timing | tab_open |
| `long_fast_warning` | `gap между приёмами > 7h && hour 10-18` | timing | tab_open |
| `meal_spacing_perfect` | `все gaps 3-5 часов && meals >= 3` | timing | tab_open |
| `training_recovery_window` | `30-60 мин после тренировки` | training | tab_open |
| `sleep_debt_accumulating` | `3 дня < 6 часов сна` | sleep | tab_open |
| `stress_eating_detected` | `avgStress >= 4 && kcalPct > 1.15` | correlation | tab_open |
| **Phase 2: Milestones** | | | |
| `weight_trend_down` | `7-day trend < -0.3kg/week` | correlation | tab_open |
| `weight_trend_up` | `7-day trend > +0.5kg/week` | correlation | tab_open |
| `milestone_7_days` | `totalDaysTracked === 7` | achievement | tab_open |
| `milestone_30_days` | `totalDaysTracked === 30` | achievement | tab_open |
| `milestone_100_days` | `totalDaysTracked === 100` | achievement | tab_open |
| `new_record_streak` | `currentStreak === personalBestStreak` | achievement | tab_open |
| `first_training_ever` | первая тренировка в истории | achievement | tab_open |

### Используемые переменные

| Переменная | Источник | Описание |
|------------|----------|----------|
| `dayTot.prot` | DayTab | Сумма белка за день |
| `dayTot.gi` | DayTab | Средневзвешенный ГИ |
| `normAbs.prot` | DayTab | Норма белка в граммах |
| `kcalPct` | `dayTot.kcal / optimum` | Выполнение калорийности |
| `prof.gender` | heys_profile | `'Женский'` / `'Мужской'` |
| `prof.age` | heys_profile | Возраст |
| `prof.sleepHours` | heys_profile | Норма сна |
| `prof.insulinWaveHours` | heys_profile | Период инсулиновой волны |
| `waterGoal` | waterGoalBreakdown | Динамическая норма воды |
| `pIndex.byId.get()` | buildProductIndex | Индекс продуктов |
| `day.householdMin` | DayRecord | Минуты домашней активности |
| `day.householdTime` | DayRecord | Время бытовой активности (HH:MM) |
| `day.steps` | DayRecord | Шаги за день |
| `day.sleepQuality` | DayRecord | Качество сна (1-5) |
| `day.trainings[].type` | Training | Тип тренировки |
| `currentStreak` | DayTab (вычисляется) | Дней подряд в норме |

---

## 🔮 Потенциальные советы (не реализованы)

Данные уже есть в модели, но советы пока не используют их:

| ID | Данные | Условие | Описание |
|----|--------|---------|----------|
| `category_variety` | `Product.category` | Все продукты одной категории | Разнообразие по категориям (требует поле category) |
| `training_type_cardio` | `training.type` | `type === 'cardio'` | Лёгкие углеводы после кардио |
| `weekly_trends` | История дней | Анализ недели | Еженедельный инсайт |
| `weekday_pattern` | История 28 дней | Паттерны по дням недели | Требует много данных |

> **Примечание**: Для `category_variety` нужно сначала добавить поле `category` в модель Product.

---

## localStorage ключи

| Ключ | Описание | Namespace |
|------|----------|-----------|
| `heys_dayv2_{date}` | Данные дня | ✅ clientId |
| `heys_products` | База продуктов | ✅ clientId |
| `heys_profile` | Профиль пользователя | ✅ clientId |
| `heys_norms` | Нормы питания | ✅ clientId |
| `heys_hr_zones` | Пульсовые зоны | ✅ clientId |
| `heys_client_current` | Текущий клиент | ❌ глобальный |

**Правило**: Используй `U.lsSet()` / `U.lsGet()` вместо прямого `localStorage` — они автоматически добавляют clientId prefix.

---

## Частые ошибки

| Ошибка | Правильно |
|--------|-----------|
| `dayTot.protein` | `dayTot.prot` ⚠️ |
| `normAbs.protein` | `normAbs.prot` ⚠️ |
| `item.category` | `getProductFromItem(item, pIndex).category` |
| `heys_day_` | `heys_dayv2_` (v2!) |
| `localStorage.setItem()` | `U.lsSet()` |

## Meal Quality Score (2025-12-03)

- Расчёт в `apps/web/heys_day_v12.js`: `getMealQualityScore` + `mealsChartData`.
- Использует `MEAL_KCAL_DISTRIBUTION` (ключи совпадают с `MEAL_TYPES` в `heys_day_utils.js`).
- Источники данных: `mealTotals` (kcal, prot, carbs, simple, complex, fat, bad, good, trans), `getProductFromItem` (gi, harm).
- Fallbacks: `gi=50`, `harm=0`, отсутствующие simple/complex/bad/good/trans = 0, `optimum` fallback 2000.
- Score не пишется в storage: рассчитывается на лету, цвет полосы = `quality.color`, бейджи только проблемные (max 3).

---

## Инсулиновая волна (Insulin Wave Module)

**Файл**: `heys_insulin_wave_v1.js` | **Версия**: 2.0.0 | **Факторов**: 25

### Научная основа

Инсулиновая волна — период, когда уровень инсулина в крови повышен после приёма пищи. В это время организм накапливает энергию, а не сжигает жир.

**Липолиз** (жиросжигание) начинается только после окончания волны.

### Факторы влияющие на длину волны (v2.0 — научный аудит)

| # | Категория | Фактор | Эффект | Константа в коде | Научный источник |
|---|-----------|--------|--------|------------------|------------------|
| 1 | **Еда** | ГИ (гликемический индекс) | low=×1.2, medium=×1.0, high=×0.85, veryHigh=×0.7 | `GI_CATEGORIES` | Wolever 1994 |
| 2 | | GL (гликемическая нагрузка) | veryLow=×0.5, low=×0.7, medium=×1.0, high=×1.15, veryHigh=×1.25 | `GL_CATEGORIES` | Brand-Miller 2003 |
| 3 | | Количество углеводов | < 5г = 25% волны, 30г+ = 100% | `CARBS_SCALING` | — |
| 4 | | Жиры | 8г=+8%, 15г=+15%, 25г+=+25% | `FAT_BONUS` | Liddle 1991 |
| 5 | | Белок | 20г=+5%, 35г+=+10% | `PROTEIN_BONUS` | Westphal 1990 |
| 6 | | Клетчатка | 5г=+8%, 10г+=+18% | `FIBER_BONUS` | Wolever 1991 |
| 7 | | Жидкая пища | ×0.82 (−18%) | `LIQUID_FOOD` | — |
| 8 | | Инсулиногенность | жидкие молочные +15%, мягкие +10%, твёрдые +5%, белок +8% | `INSULINOGENIC_BONUS` | Holt 1997 |
| 9 | | Острая пища | ×0.96 (−4%) | `SPICY_FOOD` | Ludy 2011 |
| 10 | | Алкоголь | слабый=+10%, средний=+18%, крепкий=+25% | `ALCOHOL_BONUS` | — |
| 11 | | Кофеин | +6% | `CAFFEINE_BONUS` | Lane 2011 |
| 12 | | 🆕 Транс-жиры | 0.5г=+4%, 1г=+8%, 2г+=+15% | `TRANS_FAT_BONUS` | Salmerón 2001 |
| 13 | **Активность** | Тренировка (общая) | 20мин=-8%, 45мин+=-15% (интенсивные ×1.5) | `WORKOUT_BONUS` | — |
| 14 | | Постпрандиальная тренировка | 15мин=-10%, 20мин=-18%, 30мин+=-25% | `POSTPRANDIAL_EXERCISE` | Colberg 2010 |
| 15 | | NEAT (бытовая активность) | 15мин=-2%, 30мин=-5%, 60мин+=-10% | `NEAT_BONUS` | Hamilton 2007 |
| 16 | | Шаги | 2000=-2%, 5000=-4%, 8000+=-8% | `STEPS_BONUS` | — |
| 17 | **Ритмы** | Циркадные ритмы | утро=×0.9, день×0.95-1.0, вечер=×1.1, ночь=×1.2 | `CIRCADIAN_MULTIPLIERS` | Van Cauter 1997 |
| 18 | | Голодание (fasting) | 8ч=-5%, 12ч=-10%, 16ч+=-15% ⚠️ ИНВЕРТИРОВАНО | `FASTING_BONUS` | Sutton 2018 |
| 19 | **Состояние** | Стресс (шкала 1-10) | 5-6=+8%, 7-10=+15% | `STRESS_BONUS` | — |
| 20 | | Недосып | 5-6ч=+8%, 4-5ч=+15%, <4ч=+20% | `SLEEP_BONUS` | Spiegel 1999 |
| 21 | | 🆕 Качество сна (1-10) | 1-4=+12%, 5-6=+6% | `SLEEP_QUALITY_BONUS` | Tasali 2008 |
| 22 | | 🆕 Гидратация | <30%=-12%, 30-50%=+8%, 50-70%=+4% | `HYDRATION_BONUS` | Carroll 2016 |
| 23 | **Персональные** | 🆕 Возраст | 30-44=+4%, 45-59=+8%, 60+=+15% | `AGE_BONUS` | DeFronzo 1979 |
| 24 | | 🆕 BMI | 25-30=+10%, 30+=+20% | `BMI_BONUS` | Kahn & Flier 2000 |
| 25 | | 🆕 Пол | М=+5%, Ж=-5% | `GENDER_BONUS` | Nuutila 1995 |

### Изменения v2.1.1 (научный аудит low-GL)

**Скорректированные факторы:**
- GL: диапазон усилен для низкой нагрузки (×0.5/×0.7/×1.0/×1.15/×1.25)
- Жиры: +8/+15/+25% (снижено; эффект завязан на углеводы)
- Белок: +5/+10% (снижено; белок ≈ 30-40% инсулинового отклика углеводов)

**GL-зависимое скалирование (НОВОЕ):**
- Все бонусы еды (белок, жир, клетчатка, инсулиногенность) масштабируются по GL
- Дневные факторы (стресс, недосып, возраст, BMI, пол, гидратация, качество сна, цикл) масштабируются по GL
- Циркадные ритмы ослабляются при низкой GL (GL<20 → множитель ближе к 1.0)
- Итог: при GL<10 волна не может быть «длинной» — 25-65% от обычной длины

**Пример (низкоуглеводная еда, GL=5, углеводы 11г, белок 47г, жир 13г):**
- glScaleFactor ≈ 0.45 (факторы применяются на 45%)
- GI не влияет (при GL<10 → giMult≈1.0)
- Белок +10% → +4.5% после скалирования
- Жир +8% → +3.6% после скалирования
- GL multiplier = 0.5 → волна вдвое короче
- Дневные/активность/циркадный скалируются по GL (ночной ×1.2 → ×1.1)
- Итог: волна ≈ **1.8–2.2 часа** вместо 4–5 часов

### Постпрандиальная активность (v1.5)

**Научное обоснование**: Физическая активность ПОСЛЕ еды ускоряет утилизацию глюкозы через активацию GLUT4 транспортеров в мышцах (Colberg et al. 2010, Erickson et al. 2017).

| Тип тренировки | Эффект | Условие |
|----------------|--------|---------|
| Кардио | -25% × 1.2 = **-30%** | ≥30 мин высокой интенсивности |
| Силовая | -25% × 1.0 = **-25%** | ≥30 мин высокой интенсивности |
| Хобби (йога, прогулка) | -25% × 0.8 = **-20%** | ≥30 мин |
| Умеренная | **-18%** | ≥20 мин любой |
| Лёгкая | **-10%** | ≥15 мин |

**Окно эффекта**: 0-2 часа после еды (эффект линейно уменьшается по мере удаления от приёма).

### NEAT (бытовая активность)

**Научное обоснование**: NEAT (Non-Exercise Activity Thermogenesis) улучшает инсулиновую чувствительность (Hamilton et al. 2007, Levine et al. 2002).

| Минут | Эффект |
|-------|--------|
| ≥60 мин | **-10%** |
| ≥30 мин | **-5%** |
| ≥15 мин | **-2%** |

### Шаги

| Шагов | Эффект |
|-------|--------|
| ≥8000 | **-8%** |
| ≥5000 | **-4%** |
| ≥2000 | **-2%** |

### API использования

```javascript
// Расчёт волны
const waveData = HEYS.InsulinWave.calculate({
  meals: day.meals,
  pIndex: buildProductIndex(),
  getProductFromItem: fn,
  baseWaveHours: prof?.insulinWaveHours || 3,
  trainings: day.trainings || [],
  dayData: {
    sleepHours: day.sleepHours,
    sleepQuality: day.sleepQuality,
    waterMl: day.waterMl,
    stressAvg: day.stressAvg,
    householdMin: day.householdMin,
    steps: day.steps,
    profile: {
      age: prof.age,
      weight: prof.weight,
      height: prof.height,
      gender: prof.gender
    }
  }
});

// Результат (основные поля)
waveData = {
  status: 'active' | 'almost' | 'soon' | 'lipolysis',
  remaining: 45,              // Минут до конца волны
  endTime: '17:45',           // Время окончания
  insulinWaveHours: 2.8,      // Скорректированная длина
  // 🆕 v1.5: Бонусы активности
  hasPostprandialBonus: true,
  postprandialBonus: -0.18,
  postprandialDesc: '🏃‍♂️ Тренировка через 0.5ч после еды → волна 18% короче',
  hasNeatBonus: true,
  neatBonus: -0.05,
  hasStepsBonus: true,
  stepsBonus: -0.04,
  activityBonusTotal: -0.27,  // Суммарный бонус активности
  activityBonusPct: 27        // В процентах для UI
};
```

---

## Связанные файлы

| Файл | Описание |
|------|----------|
| `heys_models_v1.js` | Типы и функции работы с данными |
| `heys_day_v12.js` | Логика вкладки дня |
| `heys_day_hooks.js` | React hooks для данных дня |
| `heys_user_v12.js` | Профиль и настройки |
| `heys_core_v12.js` | Продукты, поиск, утилиты |
| `heys_advice_v1.js` | Модуль умных советов |
| `heys_insulin_wave_v1.js` | Модуль инсулиновой волны (26 факторов) |
| `heys_cycle_v1.js` | Модуль менструального цикла |

---

## Changelog

| Версия | Дата | Изменения |
|--------|------|----------|
| 2.1.1 | 2025-12-09 | **Инсулиновая волна low-GL аудит**: усилено влияние GL<10 (×0.5/×0.7), снижен эффект белка/жиров, GL-скалирование дневных факторов и циркадных ритмов |
| 2.1.0 | 2025-12-08 | **🌸 Задержка воды**: Визуализация на sparkline веса — розовые зоны для дней с задержкой, "чистый" тренд исключает дни 1-7, научная сноска под графиком, **исторический анализ** — персональный инсайт на основе прошлых циклов, прогноз нормализации, средняя задержка воды |
| 2.0.0 | 2025-12-08 | **🌸 Менструальный цикл**: Полный трекинг особого периода — шаг в утреннем чек-ине, 4 фазы цикла, коррекция норм (kcal, вода, инсулин), 7 специальных советов, визуализация в календаре и карточка в статистике |
| 1.9.0 | 2025-12-08 | **Инсулиновая волна v2.0**: Научный аудит всех факторов, +6 новых (качество сна, гидратация, возраст, BMI, пол, транс-жиры), исправлена инверсия fasting, скорректированы 9 коэффициентов |
| 1.8.0 | 2025-12-08 | **Аудит инсулиновой волны**: Точные значения всех 19 факторов из кода, новая таблица с константами и научными механизмами |
| 1.7.0 | 2025-12-08 | **Инсулиновая волна v1.5**: +3 фактора активности (постпрандиальная тренировка, NEAT, шаги), секция документации |
| 1.6.0 | 2025-11-29 | **+26 советов Phase 2**: meal-level (7), day-quality (6), timing & patterns (6), milestones (7) = 103 всего |
| 1.5.0 | 2025-11-29 | Финальная актуализация: подтверждено 77 уникальных советов, добавлен счётчик в заголовок |
| 1.4.1 | 2025-11-29 | Актуализация: Training.type использует ID ('cardio', 'strength', 'hobby'), а не русские названия |
| 1.4.0 | 2025-11-29 | +21 новый совет: dayScore, training.type, weight, caffeine, timing, gamification, patterns |
| 1.3.0 | 2025-11-29 | Глубокий аудит: Training.type, Product.category, альтернативные поля ГИ/вред, секция "Потенциальные советы" |
| 1.2.0 | 2025-11-29 | Добавлена секция Советы (Advice Module) — 34 типа советов |
| 1.1.0 | 2025-11-29 | Аудит: добавлены `waterMl` ✅, `lastWaterTime`, `sleepHours`, `updatedAt` |
| 1.0.0 | 2025-11-29 | Первоначальная версия справочника |
