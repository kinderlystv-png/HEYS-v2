# Инсулиновая волна (Insulin Wave) — Полная документация

> [!WARNING] Это глубокая карта алгоритма, но она не является медицинской
> спецификацией и уже содержит отдельные расхождения с runtime source после
> правок v4.3. Проверенный паспорт системы и список drift:
> [`reference/systems/NUTRITION_AND_INSULIN.md`](reference/systems/NUTRITION_AND_INSULIN.md).

> **Версия модуля**: 4.2.5 | **Дата**: 2026-03-10  
> **Обновляй эту документацию при изменении алгоритмов в `heys_iw_*.js`**

---

## Содержание

1. [Что такое инсулиновая волна](#1-что-такое-инсулиновая-волна)
2. [Архитектура модуля](#2-архитектура-модуля)
3. [Главная формула](#3-главная-формула)
4. [Персональная база волны](#4-персональная-база-волны)
5. [GL-скалирование](#5-gl-скалирование)
6. [Блок 1: Расчёт нутриентов приёма (calculateMealNutrients)](#6-блок-1-расчёт-нутриентов-приёма)
7. [Блок 2: Множитель от еды (calculateMultiplier)](#7-блок-2-множитель-от-еды)
8. [Блок 3: Бонусы дня](#8-блок-3-бонусы-дня)
9. [Блок 4: Activity Context](#9-блок-4-activity-context)
10. [Блок 5: NDTE (эффект вчерашней тренировки)](#10-блок-5-ndte)
11. [Блок 6: IR Score — инсулинорезистентность](#11-блок-6-ir-score)
12. [Блок 7: Отдельные мультипликаторы](#12-блок-7-отдельные-мультипликаторы)
13. [Фазы волны](#13-фазы-волны)
14. [Meal Stacking — 2nd Meal Effect](#14-meal-stacking)
15. [Инсулиновый индекс (Insulin Index)](#15-инсулиновый-индекс)
16. [Липолиз и NDTE Badge UI](#16-липолиз)
17. [История волн и анализ перекрытий](#17-история-волн-и-перекрытия)
18. [Gaussian-кривая волны (v4.0.0)](#18-gaussian-кривая)
19. [Справочник всех 38 факторов](#19-справочник-всех-факторов)
20. [API: публичные функции](#20-api)
21. [Примеры расчётов](#21-примеры-расчётов)
22. [Реализованная модель и история изменений](#22-реализованная-модель-и-история-изменений)

---

## 1. Что такое инсулиновая волна

**Инсулиновая волна** — период, когда уровень инсулина в крови повышен после
приёма пищи. В это время:

- Организм **накапливает** энергию (жир не сжигается)
- Активирован синтез гликогена
- Подавлен **липолиз** (жиросжигание)

**Липолиз** (жиросжигание) начинается только **после** окончания волны.

### Почему базово 3 часа?

Базовое значение `defaultWaveHours = 3.0` основано на:

| Источник                | Условия                   | Длительность                |
| ----------------------- | ------------------------- | --------------------------- |
| Wolever & Jenkins, 1994 | Mixed meal, 50г углеводов | 2-3ч до возврата к базовому |
| Brand-Miller, 2003      | Стандартный ГИ-тест       | 2-3ч                        |
| Van Cauter, 1997        | Циркадные исследования    | 2.5-4ч                      |
| ADA                     | Постпрандиальный тест     | 2ч пик (не конец волны!)    |
| Mayer, 1995             | < 10г углеводов           | 1-2ч                        |

> ⚠️ 3 часа — разумная **медианная оценка** для смешанного приёма средней GL у
> здорового человека. Все модификаторы корректируют это значение.

---

## 2. Архитектура модуля

Код разбит на **14 специализированных файлов** + главный оркестратор
(загружаются в порядке зависимостей):

```
heys_iw_shim.js           → Создаёт HEYS.InsulinWave.__internals
heys_iw_config_loader.js  → Загружает конфигурацию из JSON
heys_iw_constants.js      → 3212 строк — все константы + helper-функции
heys_iw_utils.js          → Утилиты (timeToMinutes, formatDuration, etc.)
heys_iw_version_info.js   → Версионная информация модуля (v4.2.5)
heys_iw_v30.js            → v3.0: Continuous GL, Personal Baseline, Meal Stacking, Phases, II
heys_iw_calc.js           → Расчёт нутриентов, multiple-factor weight
heys_iw_v41.js            → v4.1: MetabolicFlexibility, SatietyModel, AdaptiveDeficit
heys_iw_patterns.js       → Паттерны питания (анализ истории приёмов)
heys_iw_lipolysis.js      → Записи рекордов липолиза
heys_iw_graph.js          → SVG-график волны
heys_iw_ndte.js           → NDTE Badge UI
heys_iw_ui.js             → React UI компоненты
heys_iw_orchestrator.js   → Вспомогательные функции оркестратора
heys_insulin_wave_v1.js   → Главный оркестратор (точка входа)
```

**Точка входа**: `HEYS.InsulinWave.calculate(params)` — это
`calculateInsulinWaveData()` в `heys_insulin_wave_v1.js`.

### Схема зависимостей

```
heys_insulin_wave_v1.js
  ├── HEYS.InsulinWave.__internals  (из heys_iw_constants.js)
  ├── HEYS.InsulinWave.utils        (из heys_iw_utils.js)
  ├── HEYS.InsulinWave.Calc         (из heys_iw_calc.js)
  ├── HEYS.InsulinWave.V30          (из heys_iw_v30.js)
  ├── HEYS.InsulinWave.V41          (из heys_iw_v41.js)
  ├── HEYS.InsulinWave.Lipolysis    (из heys_iw_lipolysis.js)
  ├── HEYS.InsulinWave.Graph        (из heys_iw_graph.js)
  ├── HEYS.InsulinWave.NDTE         (из heys_iw_ndte.js)
  └── HEYS.InsulinWave.UI           (из heys_iw_ui.js)
```

---

## 3. Главная формула

Итоговая длина волны вычисляется за **3 шага**:

### Шаг 1: Персональная база

```
effectiveBaseWaveHours = calculatePersonalBaselineWave(profile).baseHours
// Если профиль не заполнен → 3.0
```

Затем — GL-скалирование базы (только если GL < 10, 🆕 v4.2.3):

```javascript
// Применяется только в micro/very-low зоне, мягкое ослабление
baseScaleFactor = max(0.85, 0.85 + (GL / 10) * 0.15);
effectiveBaseWaveHours = effectiveBaseWaveHours * baseScaleFactor;
```

### Шаг 2: Финальный множитель

```
finalMultiplier = foodMultiplier
               × activityMultiplier
               × ndteMultiplier
               × scaledCircadian
               × spicyMultiplier
               × insulinIndexWaveMult
               × simpleRatioMultiplier
               × irScoreMultiplier
               × liquidDairyCompensation   // 🆕 v4.2.3: компенсация двойного штрафа liquid+dairy (×1.08 или ×1.0)
```

Где:

```
foodMultiplier = calculateMultiplier(gi, protein, fiber, carbs, fat, gl, ...) + otherBonuses

otherBonuses = metabolicBonuses + personalBonuses + mealStackingBonus
             + resistantStarchBonus + coldExposureBonus + supplementsBonusValue
             + autophagyBonus + temperatureBonus + largePortionBonus.bonus

metabolicBonuses = (fastingBonus + alcoholBonus + caffeineBonus + stressBonus + sleepBonus) * dayFactorsScale
personalBonuses  = (sleepQualityBonus + hydrationBonus + transFatBonus + cycleBonusValue) * dayFactorsScale

activityMultiplier = max(0.1, 1.0 + activityBonuses)
// activityBonuses — из ActivityContext (если есть) или старая логика
```

### Шаг 3: Длина волны

```
adjustedWaveHours = effectiveBaseWaveHours × finalMultiplier
```

**Физиологический лимит**: `finalMultiplier` обрезается до **1.50** (волна не
может быть > 1.5 × база).  
_Обоснование: Brand-Miller 2003 — даже при максимальных факторах реальная волна
редко превышает 4-4.5 часа._

---

## 4. Персональная база волны

**Файл**: `heys_iw_v30.js` → `calculatePersonalBaselineWave(profile)`

Вместо фиксированных 3 часов — персональная база, учитывающая биологические
факторы:

```javascript
baseHours = 3.0 * (1 + ageFactor + bmiFactor + genderFactor);
// ограничивается: min=1.5ч, max=4.5ч
```

| Фактор           | Условие             | Коэффициент             | Источник          |
| ---------------- | ------------------- | ----------------------- | ----------------- |
| Возраст          | Каждый год > 30 лет | +0.4% / год             | DeFronzo 1979     |
| BMI              | Каждая единица > 25 | +1.5% / ед.             | Kahn & Flier 2000 |
| BMI (ниже нормы) | Каждая единица < 25 | -0.75% / ед. (max -10%) | Kahn & Flier 2000 |
| Женский пол      | —                   | -5%                     | Nuutila 1995      |
| Мужской пол      | —                   | +3%                     | Nuutila 1995      |

**Пример**: Мужчина, 45 лет, BMI=27

```
ageFactor  = (45-30) × 0.004 = 0.06  (+6%)
bmiFactor  = (27-25) × 0.015 = 0.03  (+3%)
genderFactor = 0.03 (+3%)
baseHours  = 3.0 × (1 + 0.06 + 0.03 + 0.03) = 3.36ч
```

> ⚠️ Возраст, BMI и пол **уже учтены** в `effectiveBaseWaveHours`, поэтому **НЕ
> добавляются повторно** в `personalBonuses` — иначе двойной счёт!

---

## 5. GL-скалирование

**Ключевой принцип**: При низкой гликемической нагрузке (GL < 20) инсулина мало,
поэтому дневные факторы (стресс, недосып, циркадные ритмы) применяются
**частично**.

### Скалирование дневных факторов

```javascript
// GL < 20 → пропорциональное ослабление
dayFactorsScale = max(0.3, 0.3 + (GL / 20) * 0.7);
// GL = 0  → 0.30 (30% от факторов)
// GL = 10 → 0.65 (65%)
// GL = 20 → 1.00 (100%)
```

### Скалирование циркадного ритма (более агрессивное)

```javascript
circadianScale = max(0.2, 0.2 + (GL / 20) * 0.8);
// GL = 0  → 0.20
// GL = 7  → 0.48
// GL = 10 → 0.60
// GL = 20 → 1.00
```

### Скалирование персональной базы

```javascript
// 🆕 v4.2.3: ослаблено — только micro/very-low zone (GL < 10)
// Убрано агрессивное двойное скалирование: GL уже сильно влияет через glMultiplier
baseScaleFactor = max(0.85, 0.85 + (GL / 10) * 0.15);
// GL = 0   → 0.85 (мягкое уменьшение базы)
// GL = 5   → 0.925
// GL ≥ 10  → скалирование НЕ применяется
```

**Зачем**: При очень низкой GL (< 10) база мягко уменьшается. Порог снижен с
20→10 в v4.2.3 чтобы устранить двойное GL-penalization (GL уже учтён в
`glMultiplier` внутри `calculateMultiplier()`).

---

## 6. Блок 1: Расчёт нутриентов приёма

**Файл**: `heys_iw_calc.js` →
`calculateMealNutrients(meal, pIndex, getProductFromItem)`

Проходит по всем позициям приёма и суммирует:

### Ключевые формулы

**Средневзвешенный ГИ по углеводам** (v3.0.1 — не по граммам!):

```javascript
avgGI = Σ(gi_i × carbs_i) / Σ(carbs_i)
// Продукты без углеводов (мясо, сыр) НЕ влияют на средний ГИ
// Научное обоснование: ГИ применим только к углеводам (Brand-Miller 2003)
```

**Гликемическая нагрузка с Insulin Index** (v3.2.2):

```javascript
// Для каждого продукта:
itemGL = (gi * carbsFromItem) / 100;
iiFactor = INSULIN_INDEX_FACTORS[insulinogenicType].glBoost; // ×1.5 для молока
boostedGL = min(itemGL * iiFactor, itemGL * 2.0); // maxGLBoost = 2.0
insulinIndexAdjustedGL += boostedGL;

glycemicLoad = Math.round(insulinIndexAdjustedGL * 10) / 10;
```

> 📝 GL рассчитывается **один раз** в `calculateMealNutrients()` с учётом
> Insulin Index. В `calculateMultiplier()` insulinogenicBonus = **0** во
> избежание двойного счёта.

**Другие нутриенты** (с тройным fallback: prod → item snapshot → default):

- `totalProtein`, `totalFiber`, `totalCarbs`, `totalFat`, `totalTrans`,
  `totalSimple`
- Определяется `insulinogenicType` (liquidDairy/softDairy/hardDairy/pureProtein)
- `liquidRatio = liquidGrams / totalGrams`, `hasLiquid = ratio > 0.5`
- `simpleRatio = totalSimple / totalCarbs` (доля простых углеводов)

---

## 7. Блок 2: Множитель от еды

**Файл**: `heys_iw_calc.js` →
`calculateMultiplier(gi, protein, fiber, carbs, fat, gl, ...)`

```
baseMult = giMult + proteinBonus + fiberBonus + fatBonus
total    = baseMult × carbsMult × liquidMult × foodFormMult
```

### GL-скалирование нутриентных бонусов (glScaleFactor)

**Третье GL-скалирование** — внутри `calculateMultiplier()`. При низкой GL
бонусы от белка, клетчатки и жиров применяются частично (без углеводов волна не
может быть долгой).

```javascript
glScaleFactor = max(0.25, 0.25 + (GL / 20) * 0.75);
// GL = 0  → 0.25 (25% от нутриентных бонусов)
// GL = 10 → 0.625 (62.5%)
// GL ≥ 20 → 1.00 (100%)
```

**Важно**: это НЕ `dayFactorsScale` и не `circadianScale`. `glScaleFactor`
масштабирует **только** `proteinBonus`, `fiberBonus` и `fatBonus` внутри
`calculateMultiplier()`. Дневные факторы (стресс, сон) скалируются отдельно
через `dayFactorsScale` в оркестраторе.

### GI множитель

```javascript
// За пределами GL >= 20:
giMult = GI_CATEGORIES[category].multiplier;
// low(0-35)=0.85, medium(36-55)=1.0, high(56-70)=1.1, veryHigh(71+)=1.2

// При GL < 20 — плавное затухание:
if (GL >= 7) giWeight = (GL - 7) / 13;
giMult = 1.0 + (rawGiMult - 1.0) * giWeight;

// При GL < 7: giMult = 1.0 (GI не влияет — Mayer 1995)
```

### GL множитель — непрерывная кривая (v3.0.0)

Вместо ступенчатых категорий — плавная степенная функция:

```javascript
// GL_CONTINUOUS: minMult=0.15, maxMult=1.30, maxGL=40, exponent=0.6
normalized = GL / 40
carbsMult = 0.15 + (1.30 - 0.15) × normalized^0.6
```

| GL  | carbsMult | Волна при базе 3ч |
| --- | --------- | ----------------- |
| 0   | 0.15      | 27 мин            |
| 5   | ~0.35     | 63 мин            |
| 7   | ~0.43     | 77 мин            |
| 10  | ~0.52     | 94 мин            |
| 15  | ~0.68     | ~2ч               |
| 20  | ~0.82     | ~2.5ч             |
| 30  | ~1.05     | ~3.1ч             |
| 40+ | 1.30      | ~3.9ч             |

### Белок (v4.0.0 — дифференциация по типу)

```javascript
// Базовые пороги (одинаковые для всех типов):
// 50г+ = base +7%, 35г = base +5%, 20г = base +3%

// Множители по типу белка:
whey   × 2.0   // Сывороточный: +14%/+10%/+6% (van Loon 2000, Pal 2010)
animal × 1.8   // Животный: +12.6%/+9%/+5.4% (Layman 2003, Nilsson 2004)
mixed  × 1.5   // Смешанный: +10.5%/+7.5%/+4.5%
plant  × 1.3   // Растительный: +9.1%/+6.5%/+3.9% (Mariotti 2017)

// Все бонусы масштабируются по glScaleFactor
```

### Клетчатка, жиры, жидкость, форма пищи

| Фактор              | Константа                    | Значение |
| ------------------- | ---------------------------- | -------- |
| Fiber 5г            | `FIBER_BONUS.medium`         | −0.08    |
| Fiber 10г           | `FIBER_BONUS.high`           | −0.15    |
| Fiber 15г+          | `FIBER_BONUS.veryHigh`       | −0.20    |
| Fat 8г              | `FAT_BONUS.low`              | +0.05    |
| Fat 15г             | `FAT_BONUS.medium`           | +0.10    |
| Fat 25г+            | `FAT_BONUS.high`             | +0.15    |
| Жидкая пища         | `LIQUID_FOOD.waveMultiplier` | ×0.75    |
| Форма: жидкое       | `FOOD_FORM_BONUS.liquid`     | ×1.30    |
| Форма: обработанное | `FOOD_FORM_BONUS.processed`  | ×1.15    |
| Форма: цельное      | `FOOD_FORM_BONUS.whole`      | ×0.85    |
| Форма: смешанное    | `FOOD_FORM_BONUS.mixed`      | ×1.00    |

---

## 8. Блок 3: Бонусы дня

Большинство дневных бонусов **складываются** (не перемножаются) и затем
масштабируются по `dayFactorsScale`.

### Циркадный ритм (smooth sinusoid v3.8.0)

```javascript
// scaledCircadian = 1.0 + (circadian.multiplier - 1.0) * circadianScale
// Формула: center(1.025) - amplitude(0.175) * cos(2π * (hour - 8) / 24)
// Надир (максимум ×1.20) приходится на peakHour + 12 = 20:00 (НЕ на полночь!)
//
// circadian.multiplier при полном скалировании (GL ≥ 20):
// 08:00 → 0.850  (пик чувствительности утром)
// 12:00 → 0.938  (~0.94)
// 18:00 → 1.177  (~1.18)
// 20:00 → 1.200  (надир — максимальная резистентность)
// 22:00 → 1.177  (~1.18, уже снижается)
// 00:00 → 1.113  (~1.11, НЕ 1.20!)
// 04:00 → 0.938  (~0.94, возврат к норме)
// Van Cauter 1997
```

> ⚠️ Если `activityContext.nightPenaltyOverride = true` — ночной штраф
> отменяется (тренировка вечером → штраф убирается).

### Голодание (fastingHours = время с предыдущего приёма)

| Голодание | Бонус | Источник    |
| --------- | ----- | ----------- |
| 8ч        | −0.05 | Sutton 2018 |
| 12ч       | −0.10 | Sutton 2018 |
| 16ч+      | −0.15 | Sutton 2018 |

### Метаболические факторы

| Фактор             | Условие         | Бонус к множителю      |
| ------------------ | --------------- | ---------------------- |
| Стресс             | 5-6 баллов      | +0.08                  |
| Стресс             | 7-10 баллов     | +0.15                  |
| Сон                | 5-6ч            | +0.08                  |
| Сон                | 4-5ч            | +0.15                  |
| Сон                | < 4ч            | +0.20                  |
| Качество сна       | 1-4/10          | +0.08                  |
| Качество сна       | 5-6/10          | +0.04                  |
| Гидратация         | < 30% нормы     | +0.08                  |
| Гидратация         | 30-50% нормы    | +0.05                  |
| Гидратация         | 50-70% нормы    | +0.03                  |
| Алкоголь (слабый)  | —               | +0.10                  |
| Алкоголь (средний) | —               | +0.18                  |
| Алкоголь (крепкий) | —               | +0.25                  |
| Кофеин             | —               | +0.06                  |
| Транс-жиры 0.5г    | —               | +0.04                  |
| Транс-жиры 1г      | —               | +0.08                  |
| Транс-жиры 2г+     | —               | +0.15                  |
| Менструальный цикл | Лютеиновая фаза | ×1.12 (multiplicative) |
| Острая пища        | hasSpicy        | ×0.96 (multiplicative) |

### Прочие бонусы (не скалируются по dayFactorsScale)

| Фактор                          | Константа                       | Значение     |
| ------------------------------- | ------------------------------- | ------------ |
| Холодный душ                    | `COLD_EXPOSURE_BONUS.shower`    | −0.05        |
| Холодная ванна                  | `COLD_EXPOSURE_BONUS.bath`      | −0.10        |
| Моржевание                      | `COLD_EXPOSURE_BONUS.plunge`    | −0.12        |
| Уксус                           | `SUPPLEMENTS_BONUS.vinegar`     | −0.12        |
| Корица                          | `SUPPLEMENTS_BONUS.cinnamon`    | −0.10        |
| Берберин                        | `SUPPLEMENTS_BONUS.berberine`   | −0.15        |
| Аутофагия (голодание ДО приёма) | 12-16ч                          | −0.05..−0.10 |
| Resistant starch (охл. крахмал) | `RESISTANT_STARCH_BONUS.cooled` | −0.15        |
| Горячая еда                     | `FOOD_TEMPERATURE_BONUS.hot`    | +0.08        |
| Холодная еда                    | `FOOD_TEMPERATURE_BONUS.cold`   | −0.05        |
| Большая порция 600 ккал         | `LARGE_PORTION_BONUS`           | +0.05        |
| Большая порция 800 ккал         | —                               | +0.10        |
| Большая порция 1000 ккал        | —                               | +0.18        |
| Большая порция 1200+ ккал       | —                               | +0.25        |

---

## 9. Блок 4: Activity Context

**Файл**: `heys_iw_constants.js` → `calculateActivityContext()`

Заменяет отдельные `workoutBonus`, `postprandialBonus`, `neatBonus` — объединяет
их в единый контекст с приоритизацией.

### 10 контекстов активности (по приоритету)

| Приоритет | Контекст         | Условие                    | Бонус к волне    | harmMultiplier |
| --------- | ---------------- | -------------------------- | ---------------- | -------------- |
| 100       | **PERI-WORKOUT** | Еда во время тренировки    | до -60%          | 0.5            |
| 80        | **POST-WORKOUT** | 0-30 мин после             | -40%             | —              |
| 80        | **POST-WORKOUT** | 30-60 мин после            | -35%             | —              |
| 80        | **POST-WORKOUT** | 1-2ч после                 | -25%             | —              |
| 80        | **POST-WORKOUT** | 2-4ч после                 | -15%             | —              |
| 80        | **POST-WORKOUT** | 4-6ч после                 | -8%              | —              |
| 60        | **PRE-WORKOUT**  | 0-45 мин до тренировки     | -20%             | 0.6            |
| 60        | **PRE-WORKOUT**  | 45-90 мин до               | -10%             | 0.8            |
| 20        | **STEPS**        | 12k+ шагов                 | -12%             | 0.92           |
| 20        | **STEPS**        | 10k шагов                  | -10%             | 0.95           |
| 20        | **STEPS**        | 7.5k шагов                 | -6%              | 0.97           |
| 20        | **STEPS**        | 5k шагов                   | -4%              | 0.98           |
| 15        | **HOUSEHOLD**    | 90+ мин бытовой активности | -12%             | 0.90           |
| 15        | **HOUSEHOLD**    | 60 мин                     | -10%             | 0.93           |
| 15        | **HOUSEHOLD**    | 30 мин                     | -5%              | 0.96           |
| 10        | **MORNING**      | Тренировка до 12:00        | -5% (весь день)  | —              |
| 10        | **DOUBLE DAY**   | 2+ тренировок              | -10% (весь день) | —              |

### POST-WORKOUT: важные особенности

- **nightPenaltyOverride = true** — ночной штраф (×1.2) отменяется
- **Кардио** усиливает бонус ×1.15 (лучше активирует GLUT4)
- Окно увеличивается с тренировкой: базовые 2ч + 60 мин за каждые 500 ккал (max
  6ч)
- Тренировка натощак (8ч+ без еды): POST-WORKOUT бонус ×1.3

### Специальные комбинации

| Комбинация                | Эффект                                  |
| ------------------------- | --------------------------------------- |
| Силовая + белок ≥ 30г     | harmMultiplier ×0.8 (белок = анаболизм) |
| Кардио + простые углеводы | harmМult ×0.5, GL ×0.7 (гликоген)       |
| Ночная тренировка         | ночной штраф отменяется до 4ч           |

### Применение activityBonuses в формуле

```javascript
// Тренировка применяется как МНОЖИТЕЛЬ, а не сложение!
// Это отражает: GLUT4 активируется независимо от состава еды
activityMultiplier = max(0.1, 1.0 + activityBonuses);
// NEAT добавляется к activityBonuses как фоновый бонус
// ⚠️ Шаги (STEPS) в двух режимах:
//   - Если есть activityContext → шаги уже включены в TRAINING_CONTEXT.stepsBonus.tiers (12k/10k/7.5k/5k)
//   - Если тренировки нет (fallback) → используется calculateStepsBonus() с STEPS_BONUS (8k/-8%, 5k/-4%, 2k/-2%)
```

---

## 10. Блок 5: NDTE

**Next-Day Training Effect** — эффект вчерашней тренировки сохраняется 12-48
часов.

**Файл**: `heys_iw_constants.js` → `calculateNDTE()`

**Условие активации**: Вчера было потрачено ≥ 200 ккал на тренировке.

> ⚠️ При 200-300 ккал бонус линейно масштабируется до уровня нижнего tier
> (300-500 ккал). При < 200 ккал — NDTE не активируется. В документации для
> удобства используется «≥ 300 ккал» как порог полного tier-эффекта.

### Бонусы по ккал

| Ккал тренировки | Сокращение волны | TDEE буст | Лейбл                |
| --------------- | ---------------- | --------- | -------------------- |
| 900+            | −25%             | +10%      | 🔥 Мощная тренировка |
| 500-900         | −15%             | +7%       | 💪 Хорошая нагрузка  |
| 300-500         | −8%              | +4%       | ⚡ Лёгкая активность |

### Затухание эффекта

| После тренировки | Множитель эффекта |
| ---------------- | ----------------- |
| 0-12ч            | 100%              |
| 12-24ч           | 80%               |
| 24-36ч           | 50%               |
| 36-48ч           | 25%               |

### BMI модификатор (инсулинорезистентные получают больше пользы)

| BMI       | Множитель |
| --------- | --------- |
| < 18.5    | ×0.8      |
| 18.5-24.9 | ×1.0      |
| 25-29.9   | ×1.4      |
| 30+       | ×1.8      |

### Тип тренировки

| Тип      | TDEE буст | Волна |
| -------- | --------- | ----- |
| strength | ×1.2      | ×0.9  |
| cardio   | ×1.0      | ×1.1  |
| hobby    | ×0.8      | ×0.8  |

**Применение в формуле**:

```javascript
ndteMultiplier = ndteResult.active ? 1 - ndteResult.waveReduction : 1.0;
// Кумулятивный (2+ тренировки) max ×1.5 от базового эффекта
```

_Научная база: Mikines 1988, Magkos 2008, Jamurtas 2004, Cartee 2011_

---

## 11. Блок 6: IR Score

**IR (Insulin Resistance) Score** — объединённый мультипликатор
инсулинорезистентности.

**Файл**: `heys_iw_constants.js` → `calculateIRScore(profile, dayData)`

```
irScore = bmiFactor × sleepFactor × stressFactor × ageFactor
```

Применяется как **последний мультипликатор** волны (увеличивает при
резистентности):

| Фактор  | Условие | Значение |
| ------- | ------- | -------- |
| BMI     | < 25    | ×1.0     |
| BMI     | 25-30   | ×1.1     |
| BMI     | 30-35   | ×1.25    |
| BMI     | 35+     | ×1.4     |
| Сон     | ≥ 7ч    | ×1.0     |
| Сон     | 6-7ч    | ×1.05    |
| Сон     | < 6ч    | ×1.15    |
| Стресс  | ≤ 3     | ×1.0     |
| Стресс  | 4-6     | ×1.08    |
| Стресс  | > 6     | ×1.15    |
| Возраст | < 30    | ×1.0     |
| Возраст | 30-45   | ×1.06    |
| Возраст | 45-60   | ×1.12    |
| Возраст | 60+     | ×1.25    |

**Цветовые уровни IR Score**:

- ≤ 1.1: 🟢 Optimal
- 1.1-1.25: 🟡 Moderate
- 1.25-1.5: 🟠 Elevated
- > 1.5: 🔴 High

**Пример**: Мужчина, BMI=28, 6.5ч сна, стресс=5, возраст=42:

```
irScore = 1.1 × 1.05 × 1.08 × 1.06 ≈ 1.327  (🟠 Elevated)
// Волна удлиняется на 32.7%
```

---

## 12. Блок 7: Отдельные мультипликаторы

Применяются **последовательно множением** (после сложения всех бонусов):

### Simple Ratio Modifier (v3.8.5)

```javascript
simpleRatio = totalSimple / totalCarbs; // Доля простых углеводов
if (simpleRatio > 0.7) mult = 0.9; // > 70% сахара → −10% волна
if (simpleRatio > 0.5) mult = 0.95; // 50-70% → −5%
if (simpleRatio < 0.2 && carbs > 20) mult = 1.05; // Сложные → +5%
```

### Insulin Index Wave Modifier (v3.8.0)

Молочка вызывает **высокий пик, но короткую волну** (быстрее спад):

| Тип         | waveMultiplier | peakMultiplier |
| ----------- | -------------- | -------------- |
| liquidDairy | **×0.85**      | ×1.35          |
| softDairy   | **×0.90**      | ×1.25          |
| hardDairy   | **×0.95**      | ×1.10          |
| pureProtein | **×0.92**      | ×1.15          |

_Holt 1997: "Молоко II=98 при GI=46 — быстрый пик, быстрый спад"_

---

## 13. Фазы волны

**Файл**: `heys_iw_v30.js` →
`calculateWavePhases(totalWaveMinutes, nutrients, hasActivity)`

Волна делится на 3 фазы:

```
RISE (подъём) → PLATEAU (плато) → DECLINE (спад) → LIPOLYSIS
```

| Фаза         | Базовая длина          | Цвет в UI           |
| ------------ | ---------------------- | ------------------- |
| 🔺 Rise      | 20 мин                 | #f97316 (оранжевый) |
| ▬ Plateau    | 35% от волны           | #ef4444 (красный)   |
| 🔻 Decline   | 45% от волны (остаток) | #eab308 (жёлтый)    |
| 🔥 Lipolysis | после спада            | #22c55e (зелёный)   |

### Модификаторы фаз

**Rise**:

- Клетчатка: +3 мин за каждые 5г (замедляет подъём)
- Жидкая пища: ×0.6 (на 40% быстрее)
- Итог: от 10 до 45 мин

**Plateau**:

- База: 35% от оставшегося времени
- Белок: +5% за каждые 20г
- Жиры: +8% за каждые 15г
- Макс плато: 55%

**Decline**:

- Тренировка (hasActivity): ×(1 - 0.15) → на 15% быстрее
- Минимум 20 мин

---

## 14. Meal Stacking

**Second Meal Effect** (Wolever 2006) — наложение инсулиновых волн.

**Файл**: `heys_iw_v30.js` →
`calculateMealStackingBonus(prevWaveEnd, newMealTime, prevGL)`

> ⚠️ До v3.7.4 считалось, что наложение удлиняет волну (+40%). Это было
> **неправильно**!

**Правильная физиология**: Если инсулин уже в крови, для нового приёма нужно
**меньше** нового инсулина → волна **КОРОЧЕ**.

```javascript
overlapMinutes = prevWaveEnd - newMealTime
// Если нет перекрытия → stackBonus = 0

decayFactor = min(1, overlapMinutes / 90 * MEAL_STACKING.decayRate)  // decayRate = 0.5
glFactor = min(1.2, prevGL / 30)
stackBonus = decayFactor × glFactor × (-0.15)   // maxStackBonus = -0.15
// Итог: до -15% к длине волны
```

**Пример**: Завтрак в 08:00 (волна до 11:00), обед в 10:30:

- Перекрытие = 30 мин
- decayFactor = min(1, 30/90 × 0.5) = 0.17
- Если prevGL=15: glFactor = 0.5
- stackBonus = 0.17 × 0.5 × (-0.15) ≈ **-0.013** (-1.3%)

---

## 15. Инсулиновый индекс

**Holt 1997**: Молочные продукты вызывают инсулиновый ответ в 2-3 раза выше, чем
предсказывает их GI.

Применяется в двух местах:

### 1. В `calculateMealNutrients()` — увеличение GL

```javascript
// Per-product GL с учётом Insulin Index:
itemGL = (gi * carbs) / 100;
iiFactor = INSULIN_INDEX_FACTORS[type].glBoost; // liquidDairy = 1.5
effectiveGL = min(itemGL * iiFactor, itemGL * 2.0); // maxGLBoost = 2.0
```

### 2. В финальной формуле — уменьшение длины волны

```javascript
insulinIndexWaveMult = INSULIN_INDEX_FACTORS[insulinogenicType].waveMultiplier;
// liquidDairy = 0.85, softDairy = 0.90, hardDairy = 0.95, pureProtein = 0.92
```

**Итоговый эффект**: Молоко увеличивает `glycemicLoad` (более сильный пик), но
укорачивает волну (быстрее спад). Это соответствует реальной физиологии.

---

## 16. Липолиз

Когда `remainingMinutes <= 0` — волна завершена, начинается **липолиз**.

### Статусы волны

| Статус      | Условие            | Emoji |
| ----------- | ------------------ | ----- |
| `lipolysis` | remaining ≤ 0      | 🔥    |
| `almost`    | remaining ≤ 15 мин | ⏳    |
| `soon`      | remaining ≤ 30 мин | 🌊    |
| `active`    | remaining > 30 мин | 📈    |

### Рекорды липолиза

Файл: `heys_iw_lipolysis.js`

- Сохраняет рекорд максимального времени липолиза
- Считает streak (дни подряд с активным липолизом)
- Рассчитывает `lipolysisKcal` — примерно сожжённые калории

### Аутофагия (текущий момент)

Отображается в UI для **текущей** фазы голодания (currentFastingHours = время с
последнего приёма):

| currentFastingHours | Фаза                        |
| ------------------- | --------------------------- |
| 12-16ч              | early (Переход к голоданию) |
| 16-24ч              | active (Аутофагия активна)  |
| 24-48ч              | deep (Глубокая аутофагия)   |
| 48ч+                | extended (Продлённый пост)  |

---

## 17. История волн и перекрытия

### Wave History

Для каждого приёма дня вычисляется:

- `startMin`, `endMin`, `duration`, `waveHours`
- Все факторы (giCategory, protein, activityContext, ndteData, ...)
- `activityContext` — контекст тренировки для конкретного приёма

**Важно**: `waveHistory[last]` синхронизируется с основным расчётом:

```javascript
// Версия из основного расчёта "выигрывает"
lastMealWave.waveHours = adjustedWaveHours;
lastMealWave.duration = Math.round(adjustedWaveHours * 60);
```

### Анализ перекрытий

```javascript
// Проверяем каждую пару соседних волн:
if (current.endMin > next.startMin) {
  overlapMin = current.endMin - next.startMin;
  severity = overlapMin > 60 ? 'high' : overlapMin > 30 ? 'medium' : 'low';
}
```

### Персональная статистика

- `avgGapToday` — средний промежуток между приёмами сегодня
- `personalAvgGap` — средний за последние N дней (из localStorage)
- `recommendedGap` = baseWaveHours × 60 (минут)
- `gapQuality`: excellent (≥90% от рекомендации), good, moderate, needs-work

---

## 18. Gaussian кривая

**v4.0.0**: Для визуализации инсулинового профиля используется **3-компонентная
Гауссовская кривая**.

Файл: `heys_iw_constants.js` → `generateWaveCurve()`

Три компоненты:

- **fast** — быстрые углеводы (ранний пик, ~15-30 мин)
- **slow** — медленные углеводы / белок (поздний пик, ~60-90 мин)
- **hepatic** — печёночный выброс гликогена (поздний, ~90-150 мин)

Итоговые поля в результате:

```javascript
waveData.curve; // [{t, y}] — массив точек для SVG графика
waveData.waveShape; // 'spike' | 'balanced' | 'prolonged'
waveData.curvePeakMinutes; // Минута пика для UI
waveData.curveAUC; // Площадь под кривой (интегральный инсулиновый ответ)
waveData.curveComponents; // {fast, slow, hepatic}
```

---

## 19. Справочник всех факторов

Текущая версия 4.2.5 содержит **38 факторов** (37 реализованы, 1 объявлен но не
реализован — MEAL_ORDER_BONUS):

| #   | Категория    | Фактор                    | Эффект                             | Константа                 | PMID              |
| --- | ------------ | ------------------------- | ---------------------------------- | ------------------------- | ----------------- |
| 1   | Еда          | ГИ                        | low=×0.85, high=×1.2               | `GI_CATEGORIES`           | 8198048           |
| 2   | Еда          | GL (непрерывно)           | 0.15-1.30                          | `GL_CONTINUOUS`           | 12828192          |
| 3   | Еда          | Углеводы                  | < 5г = 25% волны                   | `CARBS_SCALING`           | Mayer 1995        |
| 4   | Еда          | Жиры                      | 8г=+5%, 25г+=+15%                  | `FAT_BONUS`               | 3949984           |
| 5   | Еда          | Белок (animal/whey)       | 20г=+5-14%                         | `PROTEIN_BONUS_V2`        | 6389060           |
| 6   | Еда          | Клетчатка                 | 5г=−8%, 15г+=−20%                  | `FIBER_BONUS`             | 1654354           |
| 7   | Еда          | Жидкая пища               | ×0.75 волна                        | `LIQUID_FOOD`             | Flood 2009        |
| 8   | Еда          | Инсулиновый индекс (GL)   | молоко ×1.5 к GL                   | `INSULIN_INDEX_FACTORS`   | 9356547           |
| 9   | Еда          | Острая пища               | ×0.96                              | `SPICY_FOOD`              | 21093467          |
| 10  | Еда          | Алкоголь                  | +10-25%                            | `ALCOHOL_BONUS`           | —                 |
| 11  | Еда          | Кофеин                    | +6%                                | `CAFFEINE_BONUS`          | 15277438          |
| 12  | Еда          | Транс-жиры                | 0.5г=+4%                           | `TRANS_FAT_BONUS`         | 9096978           |
| 13  | Еда          | ~~Порядок еды~~           | ~~карбы последними −25%%~~         | `MEAL_ORDER_BONUS`        | ❌ НЕ РЕАЛИЗОВАН  |
| 14  | Еда          | Форма пищи                | обработанное ×1.15                 | `FOOD_FORM_BONUS`         | Flood 2009        |
| 15  | Еда          | Resistant starch          | охл. −15%                          | `RESISTANT_STARCH_BONUS`  | Robertson 2005    |
| 16  | Активность   | Тренировка (общая)        | 45мин=−15%                         | `WORKOUT_BONUS`           | —                 |
| 17  | Активность   | Пост-прандиальная         | 30мин=−50%                         | `POSTPRANDIAL_EXERCISE`   | 19560716          |
| 18  | Активность   | NEAT (бытовая)            | 60мин=−10%                         | `NEAT_BONUS`              | 17827399          |
| 19  | Активность   | Шаги                      | 10k=−10%                           | `STEPS_BONUS`             | —                 |
| 20  | Ритмы        | Циркадные                 | 08:00=×0.85, 20:00=×1.20           | `CIRCADIAN_CONFIG`        | 9331550           |
| 21  | Ритмы        | Голодание                 | 12ч=−10%                           | `FASTING_BONUS`           | 29754952          |
| 22  | Состояние    | Стресс                    | 7+=+15%                            | `STRESS_BONUS`            | —                 |
| 23  | Состояние    | Недосып                   | 4-5ч=+15%                          | `SLEEP_BONUS`             | 10543671          |
| 24  | Состояние    | Качество сна              | 1-4/10=+8%                         | `SLEEP_QUALITY_BONUS`     | 18172212          |
| 25  | Состояние    | Гидратация                | <30%=+8%                           | `HYDRATION_BONUS`         | 28739050          |
| 26  | Персональные | Возраст (в базе)          | +0.4%/год >30л                     | `PERSONAL_BASELINE`       | 510806            |
| 27  | Персональные | BMI (в базе)              | +1.5%/ед >25                       | `PERSONAL_BASELINE`       | 10953022          |
| 28  | Персональные | Пол (в базе)              | М=+3%, Ж=−5%                       | `PERSONAL_BASELINE`       | 7813811           |
| 29  | Персональные | Менструальный цикл        | лют. ×1.12                         | через `HEYS.Cycle`        | Davidsen 2007     |
| 30  | Доп.         | Добавки                   | −10-15%                            | `SUPPLEMENTS_BONUS`       | —                 |
| 31  | Доп.         | Холодовое воздействие     | −5-12%                             | `COLD_EXPOSURE_BONUS`     | —                 |
| 32  | Доп.         | Аутофагия (до приёма)     | 12ч+=−5%                           | `AUTOPHAGY_TIMER`         | —                 |
| 33  | Доп.         | NDTE (вчерашняя трен.)    | 500ккал=−15%                       | `NDTE`                    | 3056758           |
| 34  | Доп.         | Температура пищи          | горяч.=+8%                         | `FOOD_TEMPERATURE_BONUS`  | Valdés-Ramos 2019 |
| 35  | Доп.         | Большая порция            | 800=+10%                           | `LARGE_PORTION_BONUS`     | 1997819           |
| 36  | Доп.         | Simple Ratio              | >70% сахара=−10%                   | (inline)                  | —                 |
| 37  | Мульт.       | Insulin Index → волна     | молоко ×0.85                       | `INSULIN_INDEX_FACTORS`   | 9356547           |
| 38  | Мульт.       | Liquid Dairy Compensation | ×1.08 если hasLiquid + liquidDairy | `liquidDairyCompensation` | —                 |
| —   | Мульт.       | IR Score                  | BMI×сон×стресс×возраст             | `IR_SCORE_CONFIG`         | 510806            |

---

## 20. API

### Главная функция

```javascript
const waveData = HEYS.InsulinWave.calculate({
  meals, // Array — приёмы пищи дня [{time, items, mealType}]
  pIndex, // Object — индекс продуктов
  getProductFromItem, // Function(item, pIndex) → product
  baseWaveHours, // number = 3 — базовая длина из профиля пользователя
  trainings, // Array = [] — тренировки дня [{z, time, type}]
  dayData, // Object = {} — данные дня:
  //   profile: {age, weight, height, gender}
  //   stressAvg, sleepHours, sleepQuality, waterMl
  //   steps, householdMin, cycleDay
  //   date, lsGet (для NDTE)
  now, // Date = new Date()
});
```

### Ключевые поля результата

```javascript
waveData.status; // 'lipolysis' | 'almost' | 'soon' | 'active'
waveData.progress; // 0-100 — прогресс волны (%)
waveData.remaining; // минут оставшихся
waveData.lipolysisMinutes; // минут в состоянии липолиза
waveData.insulinWaveHours; // итоговая длина волны (часы)
waveData.baseWaveHours; // персональная база волны
waveData.finalMultiplier; // итоговый множитель (для отладки)

// Нутриенты последнего приёма
(waveData.gl, waveData.gi, waveData.protein, waveData.fiber);

// Детали факторов
waveData.activityContext; // Контекст тренировки (type, badge, waveBonus)
waveData.irScore; // {score, factors, color, label}
waveData.personalBaseline; // {baseHours, factors}
waveData.ndte; // {active, waveReduction, ...}
waveData.mealStacking; // {stackBonus, hasStacking, desc}

// Фазы и кривая
waveData.currentPhase; // 'rise' | 'plateau' | 'decline' | 'lipolysis'
waveData.wavePhases; // {rise, plateau, decline}
waveData.curve; // [{t, y}] — для SVG графика
waveData.waveShape; // 'spike' | 'balanced' | 'prolonged'

// История дня
waveData.waveHistory; // [{time, duration, gi, gl, activityContext, ...}]
waveData.overlaps; // [{from, to, overlapMinutes, severity}]
waveData.avgGapToday; // мин — средний промежуток сегодня
waveData.gapQuality; // 'excellent' | 'good' | 'moderate' | 'needs-work'

// Липолиз
waveData.lipolysisKcal; // ккал в состоянии липолиза
waveData.isAutophagyActive; // true если >12ч без еды
waveData.autophagy; // {phase: 'none'|'beginning'|'active'|'deep'|'extended'}
```

### Вспомогательные функции

```javascript
// v3.0 функции
HEYS.InsulinWave.calculateContinuousGLMultiplier(gl)
HEYS.InsulinWave.calculatePersonalBaselineWave(profile)
HEYS.InsulinWave.calculateMealStackingBonus(prevWaveEnd, mealMin, prevGL)
HEYS.InsulinWave.calculateWavePhases(totalMin, nutrients, hasActivity)
HEYS.InsulinWave.calculateInsulinIndex(insulinogenicType, baseGL)
HEYS.InsulinWave.getWaveCalculationDebug(params)  // Полный дебаг

// v4.0 функции
HEYS.InsulinWave.calculateIRScore(profile, dayData)
HEYS.InsulinWave.predictInsulinResponse(gl, ...)
HEYS.InsulinWave.calculateWaveScore(waveData)    // Оценка качества волны

// v4.1 функции
HEYS.InsulinWave.calculateMetabolicFlexibility({recentDays, profile, trainings7d})
HEYS.InsulinWave.calculateSatietyScore(nutrients, ...)
HEYS.InsulinWave.calculateAdaptiveDeficit(...)
```

### React Hook

```javascript
const {
  data, // Данные волны (null если нет приёмов)
  expanded, // boolean — раскрыт ли детальный блок
  toggle, // Function — переключить expanded
  isShaking, // boolean — анимация при status='almost'
} = HEYS.InsulinWave.useInsulinWave({
  meals,
  pIndex,
  getProductFromItem,
  baseWaveHours,
  trainings,
  dayData,
});
```

---

## 21. Примеры расчётов

### Пример 1: Простой завтрак

```
Овсянка 80г (GI=55, carbs=48г), молоко 150мл (GI=30, carbs=7г), яблоко 100г (GI=35, carbs=12г)
Время: 08:00
Профиль: муж, 35 лет, BMI=23, норм. сон, нет стресса

1. calculateMealNutrients():
   avgGI = (55*48 + 30*7 + 35*12) / (48+7+12) = (2640+210+420)/67 ≈ 49
   молоко: itemGL = 30*7/100 = 2.1, liquidDairy → glBoost=1.5 → boostedGL = min(2.1*1.5, 2.1*2) = 3.15
   овсянка: GL = 55*48/100 = 26.4
   яблоко: GL = 35*12/100 = 4.2
   glycemicLoad ≈ 33.75

2. calculatePersonalBaselineWave({age:35, BMI:23, gender:'male'}):
   ageFactor  = (35-30) * 0.004 = 0.02 (+2%)
   bmiFactor  = 0 (BMI < 25)
   genderFactor = +0.03 (+3%)
   baseHours = 3.0 * 1.05 = 3.15ч

3. GL-скалирование: GL=33.75 > 20 → baseScaleFactor = 1.0
   effectiveBaseWaveHours = 3.15ч

4. calculateMultiplier(GI=49, GL=33.75):
   carbsMult ≈ 1.07  (GL=33.75 чуть выше 30 → умеренно)
   giMult = 1.0  (medium GI, GL>20)
   proteinBonus = +0.03  (7г белка < 20г threshold)
   baseMult ≈ 1.03
   total = 1.03 * 1.07 * 0.75(liquid) ≈ 0.826  (молоко делает приём «жидким»!)

5. Дневые факторы (08:00 утро, нет стресса, норм. сон):
   circadianMult ≈ 0.85  (утро → лучше)
   все остальные бонусы ≈ 0

6. Insulin Index Wave Modifier:
   insulinogenicType = liquidDairy → waveMultiplier = 0.85

7. IR Score (BMI=23, сон OK, стресс OK, возраст=35):
   irScore = 1.0 * 1.0 * 1.0 * 1.06 ≈ 1.06

8. liquidDairyCompensation:
   hasLiquid: liquidGrams/totalGrams = 150/(80+150+100) = 0.45 < 0.5 → hasLiquid = false
   liquidDairyCompensation = 1.0  (компенсация не нужна — жидкость < 50%)

9. finalMultiplier = 0.826 * 1.0 * 1.0 * 0.85 * 1.0 * 0.85 * 1.0 * 1.06 * 1.0 ≈ 0.633
   (food × activity × ndte × circadian(0.85 в 08:00) × spicy × insIdx × simpleRatio × ir × liqDairy)
   Обрезание: max_mult = 1.5 → не нужно (0.633 < 1.5)

10. adjustedWaveHours = 3.15 * 0.633 ≈ 1.99ч  (~2 часа)
```

---

### Пример 2: Ужин после тренировки

```
Куриная грудка 200г + гречка 150г + огурцы
Время: 20:00, через 40 мин после кардио-тренировки 60 мин (800 ккал)
Профиль: жен, 40 лет, BMI=26

ActivityContext: POST-WORKOUT, 40 мин после кардио
  tier: { maxMin:60, waveBonus:-0.35 }
  typeMultiplier: cardio * 1.15 = 0.35 * 1.15 → waveBonus = -0.40
  nightPenaltyOverride = true (ночной штраф отменён!)

NDTE: нет (тренировка сегодня, не вчера)

IR Score: BMI=26 → 1.1, возраст=40 → 1.06, сон/стресс OK → ~1.17

finalMultiplier = foodMult * max(0.1, 1 + (-0.40)) * 1.17
               = foodMult * 0.60 * 1.17
               ≈ ...  (итог: короткая волна ~1.5-2ч)
```

---

## Важные ловушки

1. **Двойной счёт нутриентов**: Инсулиновый индекс учитывается ТОЛЬКО в
   `calculateMealNutrients()` через `insulinIndexAdjustedGL`. В
   `calculateMultiplier()` insulinogenicBonus = 0 — не трогать!

2. **Возраст/BMI/пол**: Учтены в `effectiveBaseWaveHours` (через
   `calculatePersonalBaselineWave`). В `personalBonuses` они НЕ добавляются.

3. **Activity как множитель**: `activityBonuses` применяются через
   `activityMultiplier = max(0.1, 1 + activityBonuses)`, а не суммированием. Это
   принципиально! (тренировка = независимое ускорение).

4. **GL-скалирование и базы**: При GL < 10 `effectiveBaseWaveHours` мягко
   уменьшается через `baseScaleFactor` (max 0.85→1.0). При GL ≥ 10 скалирования
   базы нет. После этого все дальнейшие бонусы работают с уже уменьшенной базой.

5. **Meal Stacking**: Интуитивно кажется, что наложение должно удлинять волну.
   На самом деле — укорачивает (Second Meal Effect, Wolever 2006).

6. **Синхронизация waveHistory**: Последний приём в `waveHistory`
   синхронизируется с основным расчётом
   (`waveHistory[last].waveHours = adjustedWaveHours`). HE перезаписывай
   основной расчёт данными из waveHistory.

7. **MEAL_ORDER_BONUS**: Константа объявлена в `heys_iw_constants.js`, но в
   формуле **НЕ используется**.

8. **Симметрия формул main vs waveHistory**: В `waveHistory` обязательно должны
   быть ВСЕ те же множители, что и в основном расчёте — `mealInsIndexWaveMult`,
   `mealSimpleRatioMult`, `irScoreMultiplier`. Без них исторические волны будут
   систематически длиннее реальных (особенно при IR > 1.0 или молочной еде). ✅
   Исправлено в v4.2.4.

9. **Синхронизация хэшей бандлов**: После legacy bundle rebuild
   (`pnpm bundle:legacy:auto --files=...` для scoped QA или full
   `pnpm bundle:legacy` для integration/release) хэши бандлов в
   `apps/web/index.html` обновляются **автоматически** через `syncIndexHtml()` в
   `scripts/bundle-legacy.mjs`. До v4.2.4 это не делалось — браузер получал 404
   на удалённые файлы и весь постбут (включая HEYS.InsulinWave) не загружался.
   **Никогда** не правь хэши в `index.html` вручную.

10. **SW cache regex**: Сервис-воркер кэширует бандлы по паттерну
    `\.bundle\.[a-f0-9]{12}\.js$` (`sw.js`, строка ≈219). Длина хэша — 12
    символов (фиксирована Vite). Если паттерн не совпадает — бандлы попадают в
    `staleWhileRevalidate` вместо `cacheFirst` и могут устаревать.

11. **Константы ≠ функции**: Конфиг-объекты (`FIBER_BONUS`,
    `SLEEP_QUALITY_BONUS`, `HYDRATION_BONUS`) могут иметь пороги/tier-ы, которые
    **не проверяются** в соответствующих `calculate*()` функциях (dead code).
    При добавлении нового tier-а в константы — ВСЕГДА проверяй, что функция тоже
    обновлена. ✅ Исправлено в v4.2.5.

---

## 22. Реализованная модель и история изменений

### 22.1 Текущая архитектура принятых решений (v4.2.5 — runtime)

Все критические расхождения между научной моделью и кодом исправлены в v4.2.5.

**Protein type detection**  
`dominantProteinType` вычисляется в `calculateMealNutrients()`
(`heys_iw_calc.js`) через `detectProteinType(product)` и передаётся в
`calculateMultiplier()` как `proteinType`. Молочные продукты возвращают
`'animal'` (×1.8), изоляты — `'whey'` (×2.0). Это корректно: `whey` только для
протеиновых порошков/изолятов.

**Единый ActivityContext**  
`waveHistory` использует `mealActivityContext.waveBonus` — тот же объект, что и
badge-отображение. UI-бейдж и формула всегда согласованы.

**GL-скалирование базы (GL < 10 — только мягкое)**  
Порог снижен с 20 до 10. При `GL ≥ 10` базовое скалирование не применяется. Это
устраняет двойной штраф: GL уже полностью учтён в `carbsMult` через
`GL_CONTINUOUS`.

**liquidDairyCompensation (×1.08)**  
Жидкие молочные продукты получают двойной штраф: `liquidMult=×0.75` +
`insulinIndexWaveMult=×0.85`. Компенсирующий коэффициент `×1.08` (условие:
`hasLiquid=true` && `insulinogenicType='liquidDairy'`) частично нейтрализует
этот эффект.

**Симметрия формул main ↔ waveHistory**  
В `waveHistory` присутствуют все те же множители, что и в основном расчёте:
`mealInsIndexWaveMult`, `mealSimpleRatioMult`, `irScoreMultiplier`. Исторические
волны точно отражают фактические значения.

**Три GL-скалирования (разные системы, не путать!)**

1. `glScaleFactor` (в `calculateMultiplier()`) — масштабирует
   proteinBonus/fiberBonus/fatBonus
2. `dayFactorsScale` (в оркестраторе) — масштабирует метаболические/персональные
   бонусы
3. `circadianScale` (в оркестраторе) — масштабирует циркадный множитель

**FIBER_BONUS.veryHigh активирован (v4.2.5)**  
Константа `veryHigh: { threshold: 15, bonus: -0.20 }` была dead code с момента
создания. Теперь проверяется первой в цепочке `if-else` в
`calculateMultiplier()`.

**Синхронизация функций с конфигами (v4.2.5)**  
`calculateSleepQualityBonus()` теперь использует `maxQuality` из
`SLEEP_QUALITY_BONUS` вместо hardcoded порогов. Ранее функция проверяла `≤2/≤4`,
конфиг говорил `≤4/≤6`.

---

### 22.2 В планах (не реализовано)

| #   | Фича                                                                | Приоритет | Файл(ы)                |
| --- | ------------------------------------------------------------------- | --------- | ---------------------- |
| 5   | `MEAL_ORDER_BONUS` — константа объявлена, в формуле не используется | Средний   | `heys_iw_constants.js` |

**MEAL_ORDER_BONUS**: Физиологический эффект реален (Sofer 2011 — карбы
последними снижают инсулиновый ответ на 37%). Включается только при наличии
надёжного сигнала порядка блюд в приёме; иначе — `mixed` и константа
игнорируется.

---

### 22.3 Протокол валидации после правок

**Ручная проверка (регрессионные сценарии)**:

- Завтрак с молочкой GL 12-16, белок 35-45г → волна не должна быть < 1.5ч
- Перекус во время тренировки → badge `PERI-WORKOUT`, строка `Активность` в
  модалке и итоговая длина согласованы
- Плотный приём GL 40+, жиры 25+, белок 40+ → волна длиннее, но ≤ 4.5ч
  (`MAX_MULTIPLIER=1.50`)

**Техническая проверка**:

- `pnpm test:run` — без регрессий
- CAP: `MAX_MULTIPLIER = 1.50` — не ломать
- API: `HEYS.InsulinWave.calculate` — backward compatible

---

### 22.4 История изменений (почему так, а не иначе)

| Версия | Изменение                                                                          | Причина                                                                                                                |
| ------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| v3.0.0 | `GL_CONTINUOUS` вместо ступенчатых категорий GL                                    | Ступенчатые категории давали резкие скачки волны при переходе GL 19→21                                                 |
| v3.7.4 | Meal Stacking: знак инвертирован (-15% вместо +40%)                                | Second Meal Effect (Wolever 2006): инсулин в крови → меньше нового инсулина нужно                                      |
| v3.8.0 | Циркадный: косинусная кривая вместо ступенчатых часов                              | Плавный переход; надир при 20:00 (peakHour+12), не полночь                                                             |
| v3.8.5 | Simple Ratio Modifier                                                              | Простые сахара > 70% → пик быстрее, спад тоже быстрее                                                                  |
| v4.0.0 | Protein type detection (`animal/plant/whey/mixed`)                                 | `'mixed'` — постоянный заглушка давала систематически заниженный proteinBonus                                          |
| v4.0.0 | Gaussian кривая (3 компоненты)                                                     | SVG-график без физиологически обоснованной формы                                                                       |
| v4.2.3 | `baseScaleFactor` порог 20 → 10                                                    | При GL 10-19 двойной штраф: базовый + carbsMult; снижение порога убирает дублирование                                  |
| v4.2.3 | `liquidDairyCompensation ×1.08`                                                    | Молоко: `liquidMult×0.75` + `insulinIndexWaveMult×0.85` = двойное укорочение одного механизма                          |
| v4.2.4 | `waveHistory` формула = main формула                                               | До этого исторические волны не включали insIdx/simpleRatio/irScore → систематически длиннее                            |
| v4.2.5 | `FIBER_BONUS.veryHigh` активирован в `calculateMultiplier()`                       | Константа была объявлена (15г+ → −20%), но проверка отсутствовала — dead code; Jenkins 1978                            |
| v4.2.5 | `calculateSleepQualityBonus()` синхронизирована с конфигом                         | Функция проверяла ≤2/≤4, конфиг говорил ≤4/≤6; Tasali 2008: quality 1-4 = poor                                         |
| v4.2.5 | `vinegar` bonus −0.20 → −0.12                                                      | Liljeberg 1998: эффект на гликемию 20-35%, но на ДЛИТЕЛЬНОСТЬ волны ~10-15%                                            |
| v4.2.5 | `CIRCADIAN_CONFIG.nadirHour` 24 → 20                                               | Мёртвое поле; реальный надир = peakHour+12=20:00, а не полночь                                                         |
| v4.2.5 | `HYDRATION_BONUS` комментарий 35 → 30 мл/кг                                        | Код использует `weight*30`; IOM 2004: 30 мл/кг — нижняя граница для чистой воды                                        |
| v4.2.5 | Документация: добавлен `glScaleFactor` (Section 7)                                 | 3-е GL-скалирование внутри `calculateMultiplier()` не было описано                                                     |
| v4.2.5 | `MAX_MULTIPLIER` cap добавлен в waveHistory                                        | До этого non-last meals в waveHistory были без cap 1.50 — потенциально бесконечный множитель                           |
| v4.2.5 | Документация: фазы аутофагии синхронизированы с `AUTOPHAGY_TIMER`                  | Section 16: ранее 16-20/20-24/24+ → теперь 16-24/24-48/48+ (как в коде)                                                |
| v4.2.5 | Документация: `FOOD_FORM_BONUS` — добавлены `liquid (×1.30)` и `mixed (×1.0)`      | Section 7: ранее показаны только processed/whole, теперь все 4 формы                                                   |
| doc    | Документация: NDTE порог активации уточнён — ≥ 200 ккал (с пропорцией при 200-300) | Код: `trainingKcal < 200` → не активируется; при 200-300 ккал — линейное масштабирование от нижнего tier               |
| doc    | Документация: STEPS — описаны обе системы (ActivityContext и fallback)             | Section 9: шаги в обоих режимах: с тренировкой (12k/10k/7.5k/5k via TRAINING_CONTEXT) и без (8k/5k/2k via STEPS_BONUS) |

---

## Связанные документы

- [DATA_MODEL_REFERENCE.md](DATA_MODEL_REFERENCE.md) — общая модель данных,
  краткое описание модуля
- [AI_KEY_FILES.md](AI_KEY_FILES.md) — ключевые файлы проекта
- [ARCHITECTURE.md](ARCHITECTURE.md) — архитектура HEYS v2
