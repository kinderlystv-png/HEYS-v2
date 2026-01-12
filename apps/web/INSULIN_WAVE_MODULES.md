# InsulinWave Modules - Developer Guide

> Модульная архитектура расчёта инсулиновой волны v4.2.1

## 📚 Обзор

InsulinWave разбит на 11 специализированных модулей для улучшения поддерживаемости, тестируемости и переиспользования кода.

## 🏗️ Архитектура модулей

```
┌─────────────────────────────────────────────────────────┐
│           heys_insulin_wave_v1.js (1386 lines)          │
│                   Main Orchestrator                      │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐   ┌────▼────┐   ┌─────▼─────┐
    │   Core    │   │  Calc   │   │    UI     │
    │ Infrastructure│ Modules│   │ Components│
    └───────────┘   └─────────┘   └───────────┘
          │               │               │
    ┌─────┴─────┐   ┌────┴────┐   ┌─────┴─────┐
    │ Constants │   │  v3.0   │   │   Graph   │
    │   Utils   │   │  v4.1   │   │   NDTE    │
    │   Shim    │   │  Calc   │   │    UI     │
    │           │   │Orchestr.│   │           │
    └───────────┘   └─────────┘   └───────────┘
```

## 📦 Модули

### Core Infrastructure (3333 строк)

#### `heys_iw_shim.js` (50 строк)
**Назначение**: Bootstrap системы модулей, создаёт namespace
**Экспорт**: `HEYS.InsulinWave.__internals`
**Зависимости**: Нет
```javascript
// Автоматически создаёт пространство имён
HEYS.InsulinWave.__internals = { /* константы */ };
```

#### `heys_iw_constants.js` (3144 строк)
**Назначение**: Все константы, пороги, научные коэффициенты
**Экспорт**: Через `__internals`
**Зависимости**: `heys_iw_shim.js`
```javascript
// Доступ к константам
const GI_CATEGORIES = HEYS.InsulinWave.__internals.GI_CATEGORIES;
const WORKOUT_BONUS = HEYS.InsulinWave.__internals.WORKOUT_BONUS;
```

#### `heys_iw_utils.js` (139 строк)
**Назначение**: Утилиты форматирования времени
**Экспорт**: `HEYS.InsulinWave.utils`
**Зависимости**: Нет
```javascript
const utils = HEYS.InsulinWave.utils;
utils.timeToMinutes('14:30'); // 870
utils.formatDuration(125); // "2ч 5мин"
```

### Calculation Modules (1804 строк)

#### `heys_iw_calc.js` (703 строк)
**Назначение**: Базовые расчёты волны
**Экспорт**: `HEYS.InsulinWave.Calc`
**Зависимости**: `constants`, `utils`, `v30`
```javascript
const Calc = HEYS.InsulinWave.Calc;
Calc.calculateMealNutrients(meal, pIndex, getProduct);
Calc.calculateMultiplier(gi, protein, fiber, carbs, fat, gl, hasLiquid);
Calc.calculateWorkoutBonus(trainings);
Calc.calculateCircadianMultiplier(hour);
```

#### `heys_iw_v30.js` (387 строк)
**Назначение**: v3.0 фичи (непрерывная GL, персонализация)
**Экспорт**: `HEYS.InsulinWave.V30`
**Зависимости**: `constants`, `utils`
```javascript
const V30 = HEYS.InsulinWave.V30;
V30.calculateContinuousGLMultiplier(gl);
V30.calculatePersonalBaselineWave(profile);
V30.calculateMealStackingBonus(prevWaveEnd, mealTime, gl);
V30.calculateWavePhases(totalMinutes, nutrients, hasActivity);
```

#### `heys_iw_v41.js` (474 строк)
**Назначение**: v4.1 фичи (метаб. гибкость, сытость, дефицит)
**Экспорт**: `HEYS.InsulinWave.V41`
**Зависимости**: `constants`
```javascript
const V41 = HEYS.InsulinWave.V41;
V41.calculateMetabolicFlexibility({ profile, trainings7d, sleep, stress });
V41.calculateSatietyScore(mealData, hoursSince, options);
V41.calculateAdaptiveDeficit({ tdee, targetDeficitPct, weeksInDeficit });
```

#### `heys_iw_orchestrator.js` (241 строк)
**Назначение**: Вспомогательные функции оркестрации
**Экспорт**: `HEYS.InsulinWave.Orchestrator`
**Зависимости**: `constants`, `utils`, `calc`, `v30`
```javascript
const Orch = HEYS.InsulinWave.Orchestrator;
Orch.prepareWaveData({ meals, profile, dayData, baseWaveHours });
Orch.calculateWaveForMeal({ meal, pIndex, getProductFromItem, ... });
Orch.buildWaveHistory({ sorted, waveData, pIndex, getProduct });
Orch.determineWaveStatus({ remaining, insulinWaveHours });
```

### Data Module (186 строк)

#### `heys_iw_lipolysis.js` (186 строк)
**Назначение**: Управление рекордами и streak'ами липолиза
**Экспорт**: `HEYS.InsulinWave.Lipolysis`
**Зависимости**: `constants`, `utils`
```javascript
const Lipo = HEYS.InsulinWave.Lipolysis;
Lipo.getLipolysisRecord();
Lipo.updateLipolysisRecord(minutes);
Lipo.calculateLipolysisStreak();
Lipo.calculateLipolysisKcal(minutes, weight);
```

### UI Modules (2071 строк)

#### `heys_iw_graph.js` (292 строк)
**Назначение**: SVG график волны с 3-peak Gaussian моделью
**Экспорт**: `HEYS.InsulinWave.Graph`
**Зависимости**: React
```javascript
const Graph = HEYS.InsulinWave.Graph;
Graph.renderWaveChart(waveData);
```

#### `heys_iw_ndte.js` (162 строк)
**Назначение**: NDTE (Next-Day Training Effect) badge UI
**Экспорт**: `HEYS.InsulinWave.NDTE`
**Зависимости**: React, `constants`
```javascript
const NDTE = HEYS.InsulinWave.NDTE;
NDTE.renderNDTEBadge(ndteData, boostKcal, expanded, onToggle);
```

#### `heys_iw_ui.js` (1617 строк)
**Назначение**: React компоненты визуализации волны
**Экспорт**: `HEYS.InsulinWave.UI`
**Зависимости**: React, `constants`, `utils`, `graph`, `ndte`
```javascript
const UI = HEYS.InsulinWave.UI;
UI.MealWaveExpandSection({ waveData, prevWave, nextWave });
UI.ProgressBarComponent({ data });
UI.renderProgressBar(data);
UI.renderWaveHistory(data);
UI.renderActivityContextBadge(activityContext, options);
```

### Main Orchestrator (1386 строк)

#### `heys_insulin_wave_v1.js` (1386 строк)
**Назначение**: Главная оркестрационная логика
**Экспорт**: `HEYS.InsulinWave.calculate`, `HEYS.InsulinWave.useInsulinWave`
**Зависимости**: Все модули
```javascript
// Главная функция
const waveData = HEYS.InsulinWave.calculate({
  meals,
  pIndex,
  getProductFromItem,
  baseWaveHours: 3,
  trainings: [],
  dayData: {}
});

// React Hook
const { data, expanded, toggle } = HEYS.InsulinWave.useInsulinWave({
  meals,
  pIndex,
  getProductFromItem,
  baseWaveHours: 3,
  trainings: [],
  dayData: {}
});
```

## 🔄 Порядок загрузки

Важно соблюдать последовательность загрузки модулей:

```html
<script defer src="heys_iw_shim.js?v=24"></script>
<script defer src="heys_iw_constants.js?v=24"></script>
<script defer src="heys_iw_utils.js?v=24"></script>
<script defer src="heys_iw_lipolysis.js?v=24"></script>
<script defer src="heys_iw_v30.js?v=24"></script>
<script defer src="heys_iw_v41.js?v=24"></script>
<script defer src="heys_iw_calc.js?v=24"></script>
<script defer src="heys_iw_orchestrator.js?v=24"></script>
<script defer src="heys_iw_graph.js?v=24"></script>
<script defer src="heys_iw_ndte.js?v=24"></script>
<script defer src="heys_iw_ui.js?v=24"></script>
<script defer src="heys_insulin_wave_v1.js?v=24"></script>
```

## 📊 Статистика

| Категория | Модулей | Строк кода | % от общего |
|-----------|---------|------------|-------------|
| Core Infrastructure | 3 | 3,333 | 38% |
| Calculations | 4 | 1,804 | 21% |
| UI Components | 3 | 2,071 | 24% |
| Data | 1 | 186 | 2% |
| Main Orchestrator | 1 | 1,386 | 16% |
| **Итого** | **11** | **8,781** | **100%** |

## 🧪 Тестирование модулей

Каждый модуль можно тестировать независимо:

```javascript
// Пример теста для calc модуля
describe('InsulinWave.Calc', () => {
  it('calculateMealNutrients should aggregate nutrients', () => {
    const meal = { items: [{ grams: 100, productId: 'bread' }] };
    const nutrients = HEYS.InsulinWave.Calc.calculateMealNutrients(meal, pIndex, getProduct);
    expect(nutrients.totalCarbs).toBeGreaterThan(0);
  });
});
```

## 🔧 Отладка

Для отладки используйте debug-функции:

```javascript
// Подробная информация о расчёте волны
const debug = HEYS.InsulinWave.V30.getWaveCalculationDebug({
  gl: 15,
  profile: { age: 30, weight: 70, height: 175 },
  prevMealEnd: 720,
  mealTime: 840,
  nutrients: { fiber: 5, protein: 20, fat: 10 },
  hasActivity: true
});

console.log(debug);
// {
//   personalBase: { baseHours: 3.2, factors: [...] },
//   glMultiplier: 0.68,
//   effectiveGL: 15,
//   mealStacking: { stackBonus: -0.08, hasStacking: true },
//   phases: { rise: 25, plateau: 65, decline: 40 }
// }
```

## 📝 Научные ссылки

Все модули сохраняют научные обоснования:

- **Brand-Miller 2003, Wolever 2006** - Гликемическая нагрузка и meal stacking
- **Holt 1997** - Инсулиновый индекс, satiety index
- **Van Cauter 1997** - Циркадные ритмы
- **Colberg 2010, Erickson 2017** - Эффекты упражнений
- **Kelley & Mandarino 2000** - Метаболическая гибкость
- **Trexler 2014, Byrne 2018** - Адаптивный дефицит

## 🚀 Миграция с v3.x

Если вы используете старый монолитный файл:

```javascript
// Старый код (v3.x)
const wave = calculateInsulinWaveData({ meals, pIndex, getProductFromItem });

// Новый код (v4.2.1) - тот же API!
const wave = HEYS.InsulinWave.calculate({ meals, pIndex, getProductFromItem });
```

API полностью обратно совместим.

## 🔗 См. также

- `REFACTORING_SUMMARY.md` - Детальная информация о рефакторинге
- `heys_insulin_wave_v1.js` - JSDoc документация в коде
- `index.html` - Порядок загрузки модулей
