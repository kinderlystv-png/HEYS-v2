# 🔬 СУПЕРБЕЗОПАСНЫЙ РЕФАКТОРИНГ: heys_insulin_wave_v1.js

> **Версия документа:** 1.0.0  
> **Дата:** 2026-01-10  
> **Файл:** `apps/web/heys_insulin_wave_v1.js`  
> **Строк:** 8,741  
> **Версия модуля:** 4.1.0  
> **Цель:** Разбить на модули по 1000-1500 строк

---

## 📌 TL;DR

**Цель:** Разбить монолитный файл инсулиновой волны (8,741 строк) на 8 модулей.

**Что делаем:**
1. Извлекаем константы и конфигурации (~2000 строк)
2. Извлекаем утилиты и хелперы (~400 строк)
3. Извлекаем детекторы продуктов (~600 строк)
4. Извлекаем модуль активности/NDTE (~700 строк)
5. Извлекаем расчётные функции (~1500 строк)
6. Извлекаем UI-компоненты (~2250 строк)
7. Извлекаем продвинутые модели v4.x (~500 строк)
8. Оставляем core-функцию с интеграцией (~1500 строк)

**Зачем:**
- Модули по 1000-1500 строк вместо 8,741
- Изолированное тестирование компонентов
- Чистая архитектура с явными зависимостями
- Параллельная разработка фич

**Время:** ~16-20 часов (8 этапов по 2-2.5 часа)

---

## 📊 СТРУКТУРНЫЙ АНАЛИЗ

### Общая статистика

| Метрика | Значение |
|---------|----------|
| Всего строк | 8,741 |
| Версия модуля | 4.1.0 |
| Научных факторов | 37 |
| React компонентов | ~15 |
| Основных функций | ~60 |
| Констант/конфигов | ~30 |

### Распределение кода по секциям

```
┌─────────────────────────────────────────────────────────────┐
│  Секция                          │ Строки  │ % от файла    │
├─────────────────────────────────────────────────────────────┤
│  Header/Changelog                │ 1-180   │ 2.1%          │
│  Constants/Config                │ 180-2000│ 20.8%         │
│  IR Score Calculation            │ 2000-2130│ 1.5%         │
│  Activity Context                │ 2130-2550│ 4.8%         │
│  Supplements/Cold/Autophagy      │ 2550-2750│ 2.3%         │
│  Utilities (waveUtils)           │ 2750-2950│ 2.3%         │
│  GL/Baseline/Phases              │ 2950-3350│ 4.6%         │
│  Lipolysis Records               │ 3350-3550│ 2.3%         │
│  Food Detectors                  │ 3550-3950│ 4.6%         │
│  NDTE (Next-Day Training)        │ 3950-4200│ 2.9%         │
│  Meal Nutrients                  │ 4000-4200│ 2.3%         │
│  Multiplier Calculation          │ 4200-4550│ 4.0%         │
│  Workout Bonuses                 │ 4550-4950│ 4.6%         │
│  Day Factors                     │ 4950-5100│ 1.7%         │
│  Main Calculation (CORE)         │ 5100-5950│ 9.7%         │
│  UI Components                   │ 5950-8200│ 25.7%        │
│  Advanced Models v4.0-4.1        │ 8200-8700│ 5.7%         │
│  Export/API                      │ 8700-8882│ 2.1%         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗂️ ПЛАН МОДУЛЯРИЗАЦИИ (8 МОДУЛЕЙ)

### Диаграмма зависимостей

```
┌─────────────────────────────────────────────────────────────┐
│                    УРОВЕНЬ 0 (нет зависимостей)             │
│  ┌─────────────┐   ┌─────────────┐                          │
│  │ constants.js│   │  utils.js   │                          │
│  │  (~2000)    │   │   (~400)    │                          │
│  └──────┬──────┘   └──────┬──────┘                          │
│         │                 │                                 │
├─────────┼─────────────────┼─────────────────────────────────┤
│         └────────┬────────┘                                 │
│                  ▼         УРОВЕНЬ 1                        │
│  ┌─────────────────────────────────────────────────┐        │
│  │ detectors.js (~600)  │  activity.js (~700)      │        │
│  │ Нужны: constants     │  Нужны: constants, utils │        │
│  └──────────┬───────────┴──────────┬───────────────┘        │
│             │                      │                        │
├─────────────┼──────────────────────┼────────────────────────┤
│             └──────────┬───────────┘                        │
│                        ▼           УРОВЕНЬ 2                │
│              ┌─────────────────┐                            │
│              │ calculations.js │                            │
│              │    (~1500)      │                            │
│              │ Нужны: все выше │                            │
│              └────────┬────────┘                            │
│                       │                                     │
├───────────────────────┼─────────────────────────────────────┤
│                       ▼            УРОВЕНЬ 3                │
│   ┌────────────┬──────┴──────┬────────────┐                 │
│   │  ui.js     │  core.js    │ advanced.js│                 │
│   │ (~2250)    │  (~1500)    │  (~500)    │                 │
│   │ React UI   │ MAIN CALC   │ v4.0-4.1   │                 │
│   └────────────┴─────────────┴────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

### Порядок извлечения (по безопасности)

| # | Модуль | Строк | Извлекаемость | Риск |
|---|--------|-------|---------------|------|
| 1 | constants.js | ~2000 | 🟢 HIGH | LOW |
| 2 | utils.js | ~400 | 🟢 HIGH | LOW |
| 3 | detectors.js | ~600 | 🟢 HIGH | LOW |
| 4 | activity.js | ~700 | 🟢 HIGH | MEDIUM |
| 5 | calculations.js | ~1500 | 🟡 MEDIUM | MEDIUM |
| 6 | ui.js | ~2250 | 🟢 HIGH | LOW |
| 7 | advanced.js | ~500 | 🟢 HIGH | LOW |
| 8 | core.js | ~1500 | 🔴 LOW | HIGH |

---

## 📦 ДЕТАЛЬНОЕ ОПИСАНИЕ МОДУЛЕЙ

### Модуль 1: `heys_iw_constants.js` (~2000 строк)

**Содержимое:**
```javascript
// Строки 180-2000 оригинального файла
// Константы и конфигурации

// GI Categories (гликемический индекс)
const GI_CATEGORIES = { low: {...}, medium: {...}, high: {...} };

// GL Categories (гликемическая нагрузка)
const GL_CONTINUOUS = { minMult: 0.15, maxMult: 1.30, ... };
const GL_THRESHOLDS = { micro: 2, veryLow: 5, low: 10, ... };

// Protein/Fiber/Fat bonuses
const PROTEIN_BONUS = { tier1: 0.08, tier2: 0.15, tier3: 0.25 };
const PROTEIN_BONUS_V2 = { animal: 1.8, plant: 1.3, mixed: 1.5 };
const FIBER_BONUS = { tier1: -0.08, tier2: -0.15, tier3: -0.20 };
const FAT_BONUS = { tier1: 0.08, tier2: 0.15, tier3: 0.25 };

// Workout bonuses
const WORKOUT_BONUS = { baseReduction: -0.15, intensityMult: 1.5 };
const POSTPRANDIAL_EXERCISE = { tier1: -0.10, tier2: -0.18, ... };
const NEAT_BONUS = { tier1: -0.02, tier2: -0.05, tier3: -0.10 };
const STEPS_BONUS = { tier1: -0.02, tier2: -0.04, tier3: -0.08 };

// Circadian rhythms
const CIRCADIAN_MULTIPLIERS = { morning: 0.9, day: 1.0, evening: 1.1, night: 1.2 };
const CIRCADIAN_CONFIG = { peakHour: 8, troughHour: 0, amplitude: 0.175 };

// Wave shape and status
const WAVE_SHAPE_V2 = { rise: {...}, plateau: {...}, decline: {...} };
const STATUS_CONFIG = { active: {...}, almost: {...}, soon: {...}, lipolysis: {...} };

// AUC and advanced configs
const AUC_CONFIG = { levels: {...}, interpretation: {...} };
const IR_SCORE_CONFIG = { weights: {...}, levels: {...} };

// Sleep, stress, hydration
const SLEEP_BONUS = { tier1: 0.08, tier2: 0.15, tier3: 0.20 };
const SLEEP_QUALITY_BONUS = { poor: 0.12, fair: 0.06 };
const STRESS_BONUS = { moderate: 0.08, high: 0.15 };
const HYDRATION_BONUS = { low: 0.12, moderate: 0.08, fair: 0.04 };

// Personal factors
const AGE_BONUS = { tier1: 0.06, tier2: 0.12, tier3: 0.25, tier4: 0.40 };
const BMI_BONUS = { overweight: 0.10, obese: 0.20 };
const GENDER_BONUS = { male: 0.05, female: -0.05 };

// Supplements, cold exposure, autophagy
const SUPPLEMENTS_CONFIG = { vinegar: -0.10, cinnamon: -0.10, berberine: -0.15, ... };
const COLD_EXPOSURE_CONFIG = { shower: -0.05, bath: -0.10, plunge: -0.12 };
const AUTOPHAGY_TIMER = { phases: [...], bonuses: {...} };

// Insulin index, food form, meal order
const INSULIN_INDEX_FACTORS = { liquidDairy: 3.0, softDairy: 2.5, ... };
const FOOD_FORM_BONUS = { liquid: 0.30, processed: 0.15, whole: -0.15 };
const MEAL_ORDER_BONUS = { carbsLast: -0.25, carbsFirst: 0.10 };
const RESISTANT_STARCH_BONUS = { cooled: -0.15 };

// Alcohol, caffeine, spicy, trans-fat
const ALCOHOL_BONUS = { light: 0.10, medium: 0.18, strong: 0.25 };
const CAFFEINE_BONUS = 0.06;
const SPICY_FOOD = 0.96;
const TRANS_FAT_BONUS = { tier1: 0.04, tier2: 0.08, tier3: 0.15 };
```

**Зависимости:** Нет  
**Экспорт:** Все константы как named exports  
**Риск:** 🟢 LOW — чистые данные, нет логики

---

### Модуль 2: `heys_iw_utils.js` (~400 строк)

**Содержимое:**
```javascript
// Строки 2750-2950 + вспомогательные функции

const waveUtils = {
  // Date/time helpers
  parseTime(timeStr) {...},
  formatTime(date) {...},
  minutesBetween(time1, time2) {...},
  
  // Math helpers
  clamp(value, min, max) {...},
  lerp(a, b, t) {...},
  normalizeValue(value, min, max) {...},
  
  // Wave calculations
  calculateWaveEnd(startTime, durationMinutes) {...},
  getRemainingMinutes(endTime) {...},
  getWaveProgress(startTime, endTime) {...},
  
  // Formatting
  formatMinutesAsTime(minutes) {...},
  formatDuration(minutes) {...},
  
  // Gaussian helpers (для v4.0 модели)
  gaussian(x, amplitude, mean, sigma) {...},
  sumGaussians(x, components) {...}
};

// Lipolysis records persistence
function saveLipolysisRecord(record, lsSet) {...}
function getLipolysisRecords(lsGet) {...}
function clearOldLipolysisRecords(lsGet, lsSet, daysToKeep) {...}
```

**Зависимости:** Нет  
**Экспорт:** `waveUtils`, функции persistence  
**Риск:** 🟢 LOW — чистые функции без side effects

---

### Модуль 3: `heys_iw_detectors.js` (~600 строк)

**Содержимое:**
```javascript
// Строки 3550-3950 оригинального файла

// Детектор жидкой пищи
function detectLiquidFood(productName, category) {
  const liquidPatterns = [/сок/i, /молоко/i, /кефир/i, /смузи/i, ...];
  // Returns: { isLiquid: boolean, liquidRatio: number, type: string }
}

// Детектор молочных продуктов (для Insulin Index)
function detectDairy(productName, category) {
  // Returns: { isDairy: boolean, type: 'liquid'|'soft'|'hard', insulinFactor: number }
}

// Детектор острой пищи
function detectSpicy(productName, items) {
  const spicyPatterns = [/перец/i, /чили/i, /васаби/i, ...];
  // Returns: { isSpicy: boolean, spicyMultiplier: number }
}

// Детектор резистентного крахмала
function detectResistantStarch(productName, items) {
  const cooledStarchPatterns = [/холодн/i, /охлажд/i, ...];
  // Returns: { hasCooledStarch: boolean, bonus: number }
}

// Детектор алкоголя
function detectAlcohol(productName, items) {
  // Returns: { hasAlcohol: boolean, strength: 'light'|'medium'|'strong', bonus: number }
}

// Детектор кофеина
function detectCaffeine(productName, items) {
  const caffeinePatterns = [/кофе/i, /чай/i, /энергетик/i, ...];
  // Returns: { hasCaffeine: boolean, bonus: number }
}

// Детектор формы пищи
function detectFoodForm(productName, items) {
  // Returns: { form: 'liquid'|'processed'|'whole', bonus: number }
}

// Детектор типа белка
function detectProteinType(productName) {
  // Returns: 'animal' | 'plant' | 'mixed'
}

// Детектор инсулиногенности
function detectInsulinogenic(productName, category) {
  // Returns: { type: string, factor: number }
}
```

**Зависимости:** `constants.js` (паттерны и коэффициенты)  
**Экспорт:** Все функции detectX  
**Риск:** 🟢 LOW — чистые функции детекции

---

### Модуль 4: `heys_iw_activity.js` (~700 строк)

**Содержимое:**
```javascript
// Строки 2130-2550, 3950-4200, 4550-4950

// === Activity Context ===
function validateWorkout(training) {...}
function determineActivityContext(mealTime, trainings, householdMin, steps, allMeals) {
  // Returns: { type, badge, desc, waveBonus, harmMultiplier, ... }
}

// === NDTE (Next-Day Training Effect) ===
function getPreviousDayTrainings(todayDate, lsGet) {...}
function calculateNDTE({ trainingKcal, hoursSince, bmi, trainingType, trainingsCount }) {
  // Returns: { active, tdeeBoost, waveReduction, peakReduction, label, badge, ... }
}
function calculateNDTEBMIMultiplier(bmi) {...}
function calculateNDTEDecay(hoursSince) {...}

// === Workout Bonuses ===
function calculateWorkoutBonus(trainings, weight) {...}
function calculatePostprandialExerciseBonus(mealTime, trainings, trainingKcal) {...}
function calculateNeatBonus(householdMin) {...}
function calculateStepsBonus(steps) {...}
function calculateActivityBonus({ trainings, householdMin, steps, weight, mealTime }) {...}

// === Circadian Rhythm ===
function getCircadianMultiplier(hour) {...}
function getSmoothCircadianMultiplier(hour) {...}  // v3.8.0 синусоида
function scaleCircadianByGL(circadianMult, gl) {...}

// === Training Kcal ===
function calculateTrainingKcal(training, weight) {...}
function calculateTotalTrainingKcal(trainings, weight) {...}
```

**Зависимости:** `constants.js`, `utils.js`  
**Экспорт:** Все функции активности и NDTE  
**Риск:** 🟡 MEDIUM — интеграция с localStorage

---

### Модуль 5: `heys_iw_calculations.js` (~1500 строк)

**Содержимое:**
```javascript
// Строки 2000-2130, 2950-3350, 4000-4550

// === IR Score (Insulin Resistance) ===
function calculateIRScore({ recentDays, profile }) {
  // Returns: { score, level, factors, waveMultiplier, recommendation }
}

// === GL Calculations ===
function calculateContinuousGLMultiplier(gl) {...}
function getCarbsScalingMultiplier(carbsGrams) {...}

// === Personal Baseline ===
function calculatePersonalBaselineWave(profile) {
  // Returns: { baselineHours, factors, totalBonus }
}

// === Meal Stacking ===
function calculateMealStackingBonus(prevWaveEnd, newMealTime, prevGL) {
  // Returns: { bonus, desc, hasStacking, overlapMinutes }
}

// === Wave Phases ===
function calculateWavePhases(totalMinutes, nutrients, hasActivity) {
  // Returns: { rise, plateau, decline }
}

// === Meal Nutrients ===
function calculateMealNutrients(meal, pIndex, getProductFromItem) {
  // Returns: { kcal, carbs, simple, complex, prot, fat, fiber, gl, gi, ... }
}

// === Main Multiplier ===
function calculateMultiplier({
  avgGI, mealGL, carbsGrams, proteinGrams, fiberGrams, fatGrams,
  insulinogenicType, hasSpicy, hasAlcohol, hasCaffeine, hasTrans, ...
}) {
  // Returns: { total, breakdown }
}

// === Bonus Calculations ===
function getFastingBonus(hoursSinceLastMeal) {...}
function getStressBonus(stressAvg) {...}
function getSleepDeprivationBonus(sleepHours, normSleepHours) {...}
function getSleepQualityBonus(sleepQuality) {...}
function getHydrationBonus(waterPct) {...}
function getSupplementsBonus(supplements) {...}
function getColdExposureBonus(coldExposure) {...}
function getAutophagyPhase(hoursFasted) {...}
function getCycleBonus(cycleDay) {...}

// === Day Factors Aggregation ===
function calculateDayFactors(dayData, profile) {
  // Aggregates all personal/day bonuses
}
```

**Зависимости:** `constants.js`, `utils.js`, `detectors.js`, `activity.js`  
**Экспорт:** Все расчётные функции  
**Риск:** 🟡 MEDIUM — сложная интеграция между компонентами

---

### Модуль 6: `heys_iw_ui.js` (~2250 строк)

**Содержимое:**
```javascript
// Строки 5950-8200 оригинального файла
// Все React компоненты

const { useState, useEffect, useMemo, useCallback, useRef } = React;

// === Wave Progress Bar ===
function WaveProgressBar({ waveData, showDetails, onToggle }) {
  // Визуальный прогресс-бар с анимацией
}

// === Wave Graph (SVG) ===
function WaveGraph({ waveData, width, height, showGaussian }) {
  // SVG график инсулиновой волны
  // Включает 3-компонентную Gaussian модель (v4.0)
}

// === Wave Card ===
function WaveCard({ waveData, expanded, onExpand }) {
  // Карточка с информацией о волне
}

// === Meal Section ===
function MealSection({ meal, waveData, onMealClick }) {
  // Секция приёма пищи с контекстом волны
}

// === Activity Context Badge ===
function ActivityContextBadge({ context, mealTot }) {
  // Бейдж тренировочного контекста
}

// === Factor Breakdown Popup ===
function FactorBreakdownPopup({ waveData, onClose }) {
  // Popup с детализацией факторов
}

// === Science Info Popup ===
function ScienceInfoPopup({ factor, onClose }) {
  // Popup с научным обоснованием (PMID ссылки)
}

// === Wave History ===
function WaveHistory({ history, onSelect }) {
  // История волн за день
}

// === Lipolysis Indicator ===
function LipolysisIndicator({ waveData }) {
  // Индикатор липолиза
}

// === NDTE Badge ===
function NDTEBadge({ ndteData, onClick }) {
  // Бейдж эффекта вчерашней тренировки
}

// === IR Score Display ===
function IRScoreDisplay({ irScore }) {
  // Отображение IR Score
}

// === Wave Prediction ===
function WavePrediction({ prediction }) {
  // Прогноз уровня инсулина
}

// === Gaussian Legend ===
function GaussianLegend({ components, onClose }) {
  // Легенда 3-компонентной модели
}

// Helper: renderActivityContextBadge
function renderActivityContextBadge(activityContext, mealTot) {...}
```

**Зависимости:** `constants.js` (цвета, статусы), `utils.js` (форматирование), React  
**Экспорт:** Все React компоненты  
**Риск:** 🟢 LOW — изолированные UI компоненты

---

### Модуль 7: `heys_iw_advanced.js` (~500 строк)

**Содержимое:**
```javascript
// Строки 8200-8700 оригинального файла
// Продвинутые модели v4.0-4.1

// === Metabolic Flexibility Index (v4.1.0) ===
function calculateMetabolicFlexibility({ recentDays, profile, trainings7d }) {
  // Returns: { score, level, factors, recommendations, waveMultiplier, description }
}

// === Satiety Model (v4.1.0) ===
function calculateSatietyScore(nutrients, hoursSinceMeal, options) {
  // Returns: { score, rawIndex, level, duration, hoursRemaining, nextHungerTime, breakdown }
}

// === Adaptive Deficit Optimizer (v4.1.0) ===
function calculateAdaptiveDeficit({
  tdee, targetDeficitPct, weeksInDeficit, gender, recentRatios, hasRefeedThisWeek
}) {
  // Returns: { originalTdee, adaptedTdee, recommendedKcal, tier, needsDietBreak, ... }
}

// === Meal Timing Optimizer (v4.1.0) ===
function calculateMealTimingScore(meals, optimum) {
  // Returns: { score, level, analysis, nextOptimalWindow, recommendations }
}

// === Multi-component Gaussian (v4.0.0) ===
function generateWaveCurve({ nutrients, waveMinutes }) {
  // Returns: { curve, gaussian: { fast, main, tail }, analysis }
}

// === AUC Calculation (v4.0.0) ===
function calculateFullAUC(curve) {
  // Returns: { total, incremental, normalized, interpretation }
}

// === Insulin Predictor (v4.0.0) ===
function predictInsulinResponse(curve, waveMinutes) {
  // Returns: { checkpoints, peakPrediction, returnToBaseline }
}
function generatePredictionSummary(prediction) {...}

// === Wave Scoring v2 (v4.0.0) ===
function calculateWaveScore(waveData, context) {
  // Returns: { score, level, components, recommendations, summary }
}

// === Migration Utilities ===
function checkVersion(wave) {...}
function migrateWaveData(v3Wave) {...}
function enrichWithV4Features(wave, options) {...}
function exportWave(wave) {...}
function importWave(json) {...}
```

**Зависимости:** `constants.js`, `utils.js`, `calculations.js`  
**Экспорт:** Все advanced функции  
**Риск:** 🟢 LOW — модульная архитектура v4.x

---

### Модуль 8: `heys_iw_core.js` (~1500 строк)

**Содержимое:**
```javascript
// Строки 5100-5950 + Export 8700-8882

// === MAIN CALCULATION FUNCTION ===
function calculateInsulinWaveData({
  meals,
  pIndex,
  getProductFromItem,
  baseWaveHours,
  trainings,
  dayData,
  profile,
  ...options
}) {
  // 1. Найти последний приём с углеводами
  // 2. Рассчитать нутриенты приёма
  // 3. Применить все детекторы
  // 4. Рассчитать персональную базу
  // 5. Применить все множители
  // 6. Рассчитать meal stacking
  // 7. Рассчитать фазы волны
  // 8. Обогатить v4 фичами (Gaussian, AUC, predictions)
  // 9. Определить статус и время до конца
  
  // Returns: {
  //   status, remaining, endTime, insulinWaveHours,
  //   personalBaseline, wavePhases, currentPhase,
  //   mealStacking, activityBonus, ndteData, irScore,
  //   gaussian, curve, auc, predictions, waveScore,
  //   ...breakdown
  // }
}

// === Calculate Function (wrapper) ===
function calculate(params) {
  return calculateInsulinWaveData(params);
}

// === EXPORT OBJECT ===
const InsulinWave = {
  // Version
  VERSION: '4.1.0',
  
  // Constants (re-export)
  GI_CATEGORIES, GL_CONTINUOUS, STATUS_CONFIG, ...
  
  // Utils
  waveUtils,
  
  // Detectors
  detectLiquidFood, detectDairy, detectSpicy, ...
  
  // Activity
  calculateActivityContext: determineActivityContext,
  calculateNDTE, getPreviousDayTrainings, ...
  
  // Calculations
  calculateIRScore, calculateMultiplier, calculateMealNutrients, ...
  
  // Advanced (v4.0-4.1)
  calculateMetabolicFlexibility, calculateSatietyScore,
  calculateAdaptiveDeficit, calculateMealTimingScore,
  generateWaveCurve, calculateFullAUC, predictInsulinResponse,
  calculateWaveScore, ...
  
  // Core
  calculate,
  calculateInsulinWaveData,
  
  // UI Components
  WaveProgressBar, WaveGraph, WaveCard, ...
  renderActivityContextBadge,
  
  // Migration
  checkVersion, migrateWaveData, enrichWithV4Features, ...
};

// Global export
HEYS.InsulinWave = InsulinWave;
HEYS.IW = InsulinWave;  // Alias
```

**Зависимости:** ВСЕ модули  
**Экспорт:** `HEYS.InsulinWave`, `HEYS.IW`  
**Риск:** 🔴 HIGH — центральная интеграционная точка

---

## 🔄 ПОШАГОВЫЙ ПЛАН ИЗВЛЕЧЕНИЯ

### Этап 1: Извлечение констант (2-3 часа)

**Шаги:**
1. [ ] Создать `apps/web/modules/insulin-wave/constants.js`
2. [ ] Скопировать все константы (строки 180-2000)
3. [ ] Добавить `export` к каждой константе
4. [ ] В оригинале: `import * as IWConstants from './modules/insulin-wave/constants.js'`
5. [ ] Заменить все прямые ссылки на `IWConstants.X`
6. [ ] Тест: grep по оригинальным именам констант

**Тестирование:**
```javascript
// Проверка что все константы доступны
console.assert(IWConstants.GI_CATEGORIES !== undefined);
console.assert(IWConstants.GL_CONTINUOUS !== undefined);
console.assert(IWConstants.PROTEIN_BONUS !== undefined);
// ... для каждой константы
```

---

### Этап 2: Извлечение утилит (1-2 часа)

**Шаги:**
1. [ ] Создать `apps/web/modules/insulin-wave/utils.js`
2. [ ] Скопировать `waveUtils` объект (строки 2750-2950)
3. [ ] Скопировать lipolysis persistence функции (строки 3350-3550)
4. [ ] Добавить `export`
5. [ ] В оригинале: `import { waveUtils, saveLipolysisRecord, ... } from './modules/insulin-wave/utils.js'`
6. [ ] Тест: вызов каждой функции с тестовыми данными

**Тестирование:**
```javascript
// Проверка утилит
console.assert(waveUtils.parseTime('14:30') instanceof Date);
console.assert(waveUtils.formatDuration(90) === '1ч 30мин');
console.assert(waveUtils.clamp(150, 0, 100) === 100);
```

---

### Этап 3: Извлечение детекторов (2-3 часа)

**Шаги:**
1. [ ] Создать `apps/web/modules/insulin-wave/detectors.js`
2. [ ] Скопировать все функции detectX (строки 3550-3950)
3. [ ] Добавить `import` констант (паттерны)
4. [ ] Добавить `export` к каждой функции
5. [ ] В оригинале: `import * as Detectors from './modules/insulin-wave/detectors.js'`
6. [ ] Тест: детекция на реальных продуктах

**Тестирование:**
```javascript
// Проверка детекторов
const liquid = Detectors.detectLiquidFood('Апельсиновый сок', 'Напитки');
console.assert(liquid.isLiquid === true);

const dairy = Detectors.detectDairy('Молоко 2.5%', 'Молочные');
console.assert(dairy.isDairy === true);
console.assert(dairy.type === 'liquid');
```

---

### Этап 4: Извлечение модуля активности (2-3 часа)

**Шаги:**
1. [ ] Создать `apps/web/modules/insulin-wave/activity.js`
2. [ ] Скопировать функции активности (строки 2130-2550, 3950-4200, 4550-4950)
3. [ ] Добавить imports: constants, utils
4. [ ] Добавить `export` к каждой функции
5. [ ] В оригинале: `import * as Activity from './modules/insulin-wave/activity.js'`
6. [ ] Тест: расчёт NDTE, activity context

**Тестирование:**
```javascript
// Проверка NDTE
const ndte = Activity.calculateNDTE({
  trainingKcal: 500,
  hoursSince: 14,
  bmi: 24,
  trainingType: 'cardio',
  trainingsCount: 1
});
console.assert(ndte.active === true);
console.assert(ndte.tdeeBoost > 0);

// Проверка activity context
const context = Activity.determineActivityContext('14:30', trainings, 30, 8000, meals);
console.assert(context.type !== undefined);
```

---

### Этап 5: Извлечение расчётов (3-4 часа)

**Шаги:**
1. [ ] Создать `apps/web/modules/insulin-wave/calculations.js`
2. [ ] Скопировать расчётные функции (строки 2000-2130, 2950-3350, 4000-4550)
3. [ ] Добавить imports: constants, utils, detectors, activity
4. [ ] Добавить `export` к каждой функции
5. [ ] В оригинале: `import * as Calculations from './modules/insulin-wave/calculations.js'`
6. [ ] Тест: полный цикл расчёта множителя

**Тестирование:**
```javascript
// Проверка GL multiplier
const glMult = Calculations.calculateContinuousGLMultiplier(15);
console.assert(glMult > 0.5 && glMult < 1.0);

// Проверка IR Score
const irScore = Calculations.calculateIRScore({ recentDays, profile });
console.assert(irScore.score >= 0 && irScore.score <= 1);

// Проверка multiplier
const mult = Calculations.calculateMultiplier({ avgGI: 55, mealGL: 20, ... });
console.assert(mult.total > 0);
```

---

### Этап 6: Извлечение UI (3-4 часа)

**Шаги:**
1. [ ] Создать `apps/web/modules/insulin-wave/ui.js`
2. [ ] Скопировать все React компоненты (строки 5950-8200)
3. [ ] Добавить imports: constants (цвета), utils (форматирование)
4. [ ] Добавить `export` к каждому компоненту
5. [ ] В оригинале: `import * as IWUI from './modules/insulin-wave/ui.js'`
6. [ ] Тест: рендер каждого компонента

**Тестирование:**
```javascript
// Проверка компонентов (визуальный тест)
// WaveProgressBar с разными статусами
// WaveGraph с разными данными
// FactorBreakdownPopup
```

---

### Этап 7: Извлечение advanced моделей (2-3 часа)

**Шаги:**
1. [ ] Создать `apps/web/modules/insulin-wave/advanced.js`
2. [ ] Скопировать v4.0-4.1 функции (строки 8200-8700)
3. [ ] Добавить imports: constants, utils, calculations
4. [ ] Добавить `export` к каждой функции
5. [ ] В оригинале: `import * as Advanced from './modules/insulin-wave/advanced.js'`
6. [ ] Тест: каждая advanced функция

**Тестирование:**
```javascript
// Metabolic Flexibility
const flex = Advanced.calculateMetabolicFlexibility({ recentDays, profile, trainings7d });
console.assert(flex.score >= 0 && flex.score <= 1);

// Satiety
const satiety = Advanced.calculateSatietyScore(nutrients, 1.5, {});
console.assert(satiety.score >= 0 && satiety.score <= 1);

// Gaussian curve
const curve = Advanced.generateWaveCurve({ nutrients, waveMinutes: 180 });
console.assert(curve.curve.length > 0);
```

---

### Этап 8: Рефакторинг core + финализация (3-4 часа)

**Шаги:**
1. [ ] Оставить в оригинале только `calculateInsulinWaveData` и export
2. [ ] Добавить все imports из модулей
3. [ ] Обновить export object с re-exports
4. [ ] Переименовать: `heys_insulin_wave_v1.js` → `heys_iw_core.js`
5. [ ] Создать `heys_insulin_wave_v2.js` как entry point с re-exports
6. [ ] Полное интеграционное тестирование

**Итоговая структура:**
```
apps/web/
├── heys_insulin_wave_v2.js         # Entry point (~100 строк, re-exports)
└── modules/insulin-wave/
    ├── constants.js                 # ~2000 строк
    ├── utils.js                     # ~400 строк
    ├── detectors.js                 # ~600 строк
    ├── activity.js                  # ~700 строк
    ├── calculations.js              # ~1500 строк
    ├── ui.js                        # ~2250 строк
    ├── advanced.js                  # ~500 строк
    └── core.js                      # ~800 строк (main calculation)
```

---

## 🧪 ЧЕКЛИСТ ТЕСТИРОВАНИЯ

### После каждого этапа

- [ ] `pnpm type-check` проходит
- [ ] `pnpm build` успешен
- [ ] Нет ошибок в browser console
- [ ] Основной функционал работает:
  - [ ] Расчёт инсулиновой волны
  - [ ] Отображение прогресс-бара
  - [ ] График волны
  - [ ] NDTE индикатор
  - [ ] Activity context бейджи

### Интеграционные тесты

```javascript
// Полный цикл расчёта
const waveData = HEYS.InsulinWave.calculate({
  meals: testMeals,
  pIndex: testIndex,
  getProductFromItem: testGetter,
  baseWaveHours: 3,
  trainings: testTrainings,
  dayData: testDayData,
  profile: testProfile
});

// Проверки
console.assert(waveData.status !== undefined, 'Status должен быть определён');
console.assert(waveData.remaining >= 0, 'Remaining должен быть >= 0');
console.assert(waveData.insulinWaveHours > 0, 'Wave hours должен быть > 0');
console.assert(waveData.personalBaseline !== undefined, 'Baseline должен быть');
console.assert(waveData.wavePhases !== undefined, 'Phases должны быть');

// v4.0 features
if (waveData._version === '4.0.0' || waveData._version === '4.1.0') {
  console.assert(waveData.gaussian !== undefined, 'Gaussian model должна быть');
  console.assert(waveData.curve?.length > 0, 'Curve должна быть');
  console.assert(waveData.auc !== undefined, 'AUC должен быть');
}
```

---

## 🚨 ПРАВИЛА БЕЗОПАСНОСТИ

### ДО начала рефакторинга

1. **Git checkpoint:**
   ```bash
   git add -A
   git commit -m "checkpoint: before insulin-wave refactoring"
   git tag pre-iw-refactor
   ```

2. **Проверка текущего состояния:**
   - [ ] Все тесты проходят
   - [ ] Build успешен
   - [ ] Приложение работает в браузере

### ВО ВРЕМЯ рефакторинга

1. **Один модуль за раз** — не извлекать несколько параллельно
2. **Commit после каждого этапа** — возможность отката
3. **Не менять логику** — только перемещение кода
4. **Сохранять имена** — не переименовывать функции

### ЕСЛИ что-то сломалось

```bash
# Откат к checkpoint
git checkout pre-iw-refactor

# Или откат конкретного файла
git checkout HEAD~1 -- apps/web/heys_insulin_wave_v1.js
```

---

## 📋 ФИНАЛЬНЫЙ ЧЕКЛИСТ

### Перед началом

- [ ] Прочитан весь документ
- [ ] Создан git checkpoint
- [ ] Все тесты проходят
- [ ] Build успешен

### После завершения

- [ ] 8 модулей созданы
- [ ] Entry point работает
- [ ] Все exports сохранены
- [ ] `HEYS.InsulinWave` и `HEYS.IW` работают
- [ ] Все компоненты рендерятся
- [ ] Научные расчёты корректны
- [ ] v4.0-4.1 фичи работают
- [ ] `pnpm type-check` успешен
- [ ] `pnpm build` успешен
- [ ] Документация обновлена

---

## 🔗 СВЯЗАННЫЕ ДОКУМЕНТЫ

- [DATA_MODEL_REFERENCE.md](../DATA_MODEL_REFERENCE.md) — секция "Инсулиновая волна"
- [SCIENTIFIC_REFERENCES.md](../SCIENTIFIC_REFERENCES.md) — научные источники (PMID)
- [copilot-instructions.md](../../.github/copilot-instructions.md) — правила разработки

---

**Создан:** 2026-01-10  
**Автор:** AI Assistant (Claude)  
**Статус:** 📋 READY FOR IMPLEMENTATION
