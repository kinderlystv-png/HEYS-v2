---
template-version: 3.3.0
created: 2026-01-08
purpose: Upgrade Insulin Wave model to v2.0 (Scientific Depth & Precision)
priority: High
---

# Task: Инсулиновая Волна v2.0 — Научная точность и скоринг

## 📌 TL;DR (Краткий бриф)

**Цель**: Внедрить научно обоснованную модель инсулиновой волны (v2.0) с учётом
Гликемической Нагрузки (GL), Инсулинового Индекса (II),
бимодальной/многокомпонентной кривой, эффекта второго приёма, добавок и
продвинутой системой скоринга (AUC).

**Что делаем** (по приоритету):

1. **Core Model**: Переход от GI к GL + контекст (жиры/белки/клетчатка) и
   добавление Инсулинового Индекса (II).
2. **Dynamic Curve**: Внедрение многокомпонентной кривой
   (быстрый/средний/медленный пики) вместо линейного затухания.
3. **Advanced Metrics**: Расчёт AUC (Area Under Curve) и циркадных ритмов.
4. **Scoring v2**: Новая система оценки (Stability, Amplitude, Recovery,
   Timing) + KPI успеха релиза.
5. **Personalization**: Базовый расчёт инсулинорезистентности (IR score), эффект
   второго приёма пищи, добавки (уксус/корица/берберин).
6. **Predictor & UI**: Мини-прогноз по окну липолиза и обновление UI
   (heatmap/прогресс-бар/бейджи).

**Зачем**:

- Текущая модель (v1) слишком линейна и игнорирует инсулиновый ответ на белки
  (молочка/мясо).
- Повышение точности прогнозов состояния "Липолиз" на 40-60%.
- Научная база для премиум-аналитики (Pro/Pro+ тарифов).

**Время**: ~8-12 часов

---

## 🎯 WHY (Бизнес-контекст)

**Problem**: Текущая реализация `heys_insulin_wave_v1.js` использует упрощённую
модель:

- GI считается линейно (без учёта GL и контекста еды).
- Игнорируется Инсулиновый Индекс (творог имеет низкий GI, но огромный
  инсулиновый отклик).
- Форма волны всегда одинаковая (треугольная), что неверно для жирной/белковой
  пищи.
- Нет метрики "Нагрузка на поджелудочную" (AUC).

**Solution**: Переписать ядро расчёта (`calculateWave`), внедрив научно
подтверждённые формулы (Brand-Miller, Holt et al., Wolever).

---

## 🛠️ REQUIREMENTS (Технические требования)

### 1. Обновление модели данных (Data Model)

- Использовать **GL (Glycemic Load)** вместо GI как базу.
- Добавить поддержку **Insulin Index (II)**:
  - Молочные продукты: жидкая молочка x3.0, мягкая x2.5, твёрдая x1.5 (cap
    +150-180%).
  - Белок животный: x1.8, растительный: x1.3.
- Учёт **контекста приёма**:
  - Жиры/Клетчатка/Белок снижают пик, но растягивают хвост.
  - Температура (холодный крахмал) — опционально.
- Добавить **Second-meal effect**: предыдущая волна <2-3ч назад уменьшает пик до
  -25-40%, но увеличивает хвост.
- Добавить **Supplements**: уксус (-20%), корица (-10%), берберин (-15%) на
  GL/пик (флаги в день/приёме).
- Добавить **IR Score**: простой расчёт чувствительности
  (возраст/BMI/стресс/сон) → baseline множитель.

### 2. Многокомпонентная кривая (Multi-component Curve)

Заменить линейное затухание на сумму 3 гауссовых кривых:

1. **Fast**: Сахара/крахмалы (пик 30-45 мин).
2. **Medium**: Белки/сложные угли (пик 90-120 мин).
3. **Slow**: Жиры/замедление (пик 180+ мин).

Дополнительно:

- Параметры ширины/амплитуды зависят от доли макросов, IR, II, second-meal и
  supplements.
- **Stacking**: перекрытие волн накладывает бонус к длительности новой волны (до
  +40%, с decay от GL предыдущего).

### 3. Новые метрики и Скоринг

- **AUC (Area Under Curve)**: Интегральная нагрузка за день.
- **Circadian Sensitivity**: Утро (x1.0) vs Вечер (x0.8 чувствительность).
- **Activity Interaction**: Активность до/после еды меняет чувствительность.
- **Scoring System**:
  - Stability (вариабельность).
  - Amplitude (высота пиков).
  - Recovery (скорость спада).
  - Timing (циркадное окно и second-meal stacking).
  - Load (AUC, II, IR).
- **Predictor**: краткий прогноз «сколько минут до липолиза» + вероятный статус
  через 60/120 мин.
- **Success metrics (release KPI)**: снижение ложных предупреждений гиперволны
  на 20%, рост точности попадания в статус липолиза на 40-60% по тестовым дням.

### 4. Интеграция

- Сохранить обратную совместимость API `HEYS.InsulinWave.calculate()`.
- Добавить флаг `useV2` для плавного перехода и A/B (v1 vs v2) в runtime.
- Миграции данных/кэша: при сохранении волны добавить поля
  `waveV`/`irScore`/`supplementsApplied`/`secondMealEffect` (если есть
  персистентный слой).
- UI: бейджи активности/добавок, подсветка stacked wave, отображение
  AUC/прогноза, тултипы с II/GL.

---

## 📋 KEY FILES (Ключевые файлы)

| Файл                               | Роль       | Изменения                                                                       |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `apps/web/heys_insulin_wave_v1.js` | **TARGET** | Полный рефакторинг ядра расчёта, добавление классов `InsulinWaveV2`, `Scoring`. |
| `apps/web/heys_models_v1.js`       | Context    | Проверка полей продукта (GI, carbs).                                            |
| `apps/web/heys_day_v12.js`         | Consumer   | Обновление вызова (если поменяется сигнатура) и передача контекста.             |
| `docs/DATA_MODEL_REFERENCE.md`     | Docs       | Обновление раздела "Инсулиновая волна" новыми формулами.                        |

---

## 🧗 PLAN (План работ)

### Phase 1: Core Calculation Logic (GL & II)

- [ ] Создать класс/модуль `InsulinWaveCalculatorV2`.
- [ ] Реализовать `calculateAdjustedGL(meal)` (GL с учётом жиров/клетчатки).
- [ ] Реализовать `getInsulinResponse(product, item)` с учётом II (особая логика
      для молочки).
- [ ] Добавить IR baseline (возраст/BMI/сон/стресс) → множитель.

### Phase 2: Dynamic Curve Model

- [ ] Реализовать `getInsulinCurve(meal, timeSince)` на основе 3 компонентов
      (Gaussian).
- [ ] Настроить параметры кривых (amplitude, peak, width) в зависимости от
      макросов.
- [ ] Учесть second-meal stacking (overlap) и liquid/solid формы.
- [ ] Встроить supplements-модификаторы (уксус/корица/берберин) и температурный
      фактор (опционально).

### Phase 3: Advanced Context & Metrics

- [ ] Внедрить `CIRCADIAN_SENSITIVITY` (множители по часам).
- [ ] Реализовать `calculateAUC(waveData)` (интеграл).
- [ ] Добавить `getActivityImpact()` (влияние тренировок).
- [ ] Реализовать predictor: время до липолиза + статус через 60/120 мин.
- [ ] Добавить second-meal effect (дефицит/stacking) в метрики.

### Phase 4: Scoring System V2

- [ ] Реализовать `InsulinWaveScoring` (оценка по 100 балльной шкале).
- [ ] Расчёт компонентов: Stability, Amplitude, Recovery, Timing, Total Load.
- [ ] KPI: метрики успеха релиза (точность статуса, снижение ложных флагов).

### Phase 5: Integration & Verification

- [ ] Интегрировать в `heys_insulin_wave_v1.js` как `HEYS.InsulinWaveV2`.
- [ ] Добавить toggle/флаг для переключения версий.
- [ ] Провести smoke-test на реальных данных дня.
- [ ] Обновить UI/бейджи/тултипы (AUC, predictor, supplements/stacking
      индикаторы).
- [ ] Обновить `DATA_MODEL_REFERENCE.md` и миграции сохранения волн (если
      требуется).

---

## 🧪 TESTING STRATEGY (Как проверять)

1. **Unit Tests (Manual)**:
   - Сравнить волну для "Сахар 50г" (должен быть острый пик).
   - Сравнить волну для "Творог 200г" (должен быть высокий инсулиновый ответ при
     низком GI).
   - Сравнить волну для "Пицца" (жиры + угли = долгий хвост).
   - Сравнить stacked meal (перекус через 90 мин после завтрака) — пик ниже,
     хвост длиннее.
   - Проверить supplements флаги (уксус/корица/берберин) на снижении пика.
   - Проверить IR baseline (ожирение/стресс/недосып) на удлинении волны.
2. **Visual Check**:
   - Проверить график в UI (визуально форма должна стать более плавной и
     реалистичной).
   - Проверить бейджи stacking/II/supplements, AUC и прогноз липолиза.
3. **Performance**:
   - Расчёт AUC не должен фризить UI (проверить на 30+ днях истории).
4. **Regression/A-B**:
   - Сравнить v1 vs v2 по дням эталона: точность статуса липолиза, число ложных
     флагов.
   - Время выполнения расчёта на 30 днях < предела UI (зафиксировать порог).

---

---

## 💡 CODE EXAMPLES (Ключевые формулы)

### 1. Adjusted GL Calculation

```javascript
function calculateAdjustedGL(meal) {
  const baseGL = (product.gi * item.carbs) / 100;
  const fatReduction = Math.min(0.4, (meal.totalFat / meal.totalCarbs) * 0.3);
  const proteinReduction = Math.min(
    0.3,
    (meal.totalProtein / meal.totalCarbs) * 0.2,
  );
  const fiberReduction = Math.min(0.25, (meal.fiber / meal.totalCarbs) * 0.5);
  const tempFactor = item.temperature === 'cold' ? 0.85 : 1.0;

  return (
    baseGL * (1 - fatReduction - proteinReduction - fiberReduction) * tempFactor
  );
}
```

### 2. Insulin Index Response

```javascript
function getInsulinResponse(product, item) {
  if (product.insulin_index) return (product.insulin_index * item.amount) / 100;

  const carbII = product.gi * 1.0;
  const proteinII = item.protein * 0.56;
  const fatII = item.fat * 0.1;

  // Dairy/protein type multipliers
  let multiplier = 1.0;
  if (product.isDairyLiquid) multiplier = 3.0;
  else if (product.isDairySoft) multiplier = 2.5;
  else if (product.isDairyHard) multiplier = 1.5;
  else if (product.isAnimalProtein) multiplier = 1.8;
  else if (product.isPlantProtein) multiplier = 1.3;

  return (carbII + proteinII + fatII) * multiplier;
}
```

### 3. Multi-component Gaussian Curve

```javascript
function getInsulinCurve(meal, timeSinceMinutes) {
  const fastCarbs = meal.simple || meal.carbs * 0.3;
  const slowCarbs = meal.carbs - fastCarbs;

  const components = [
    { amplitude: fastCarbs * 2.5, peak: 30, width: 20 }, // Fast
    { amplitude: slowCarbs * 1.5 + meal.protein * 0.8, peak: 90, width: 40 }, // Medium
    { amplitude: meal.fat > 10 ? meal.kcal * 0.1 : 0, peak: 180, width: 60 }, // Slow
  ];

  let total = 0;
  for (const c of components) {
    const sigma = c.width;
    const exponent =
      -Math.pow(timeSinceMinutes - c.peak, 2) / (2 * sigma * sigma);
    total += c.amplitude * Math.exp(exponent);
  }
  return total;
}
```

### 4. IR Baseline Calculator

```javascript
function calculateIRScore(userData) {
  const bmiFactor =
    userData.bmi < 25
      ? 1.0
      : userData.bmi < 30
        ? 1.1
        : userData.bmi < 35
          ? 1.25
          : 1.4;
  const waistFactor = !userData.waistToHip
    ? 1.0
    : userData.waistToHip < 0.85
      ? 0.95
      : userData.waistToHip < 0.95
        ? 1.0
        : 1.15;
  const sleepFactor =
    userData.sleepHours >= 7 ? 1.0 : userData.sleepHours >= 6 ? 1.05 : 1.15;
  const stressFactor =
    userData.stressAvg <= 3 ? 1.0 : userData.stressAvg <= 6 ? 1.08 : 1.15;
  const ageFactor =
    userData.age < 30
      ? 1.0
      : userData.age < 45
        ? 1.06
        : userData.age < 60
          ? 1.12
          : 1.25;

  return bmiFactor * waistFactor * sleepFactor * stressFactor * ageFactor;
}
```

### 5. AUC Integration

```javascript
function calculateAUC(waveData, startMinutes, endMinutes) {
  let auc = 0;
  const step = 5;
  for (let t = startMinutes; t < endMinutes; t += step) {
    const y1 = getInsulinLevel(waveData, t);
    const y2 = getInsulinLevel(waveData, t + step);
    auc += ((y1 + y2) / 2) * step;
  }
  return auc / 60; // convert to hours
}
```

### 6. Circadian Sensitivity Table

```javascript
const CIRCADIAN_SENSITIVITY = {
  '04-08': 1.2, // Утро: высокая чувствительность
  '08-12': 1.0, // День: норма
  '12-16': 0.95, // После обеда: небольшое снижение
  '16-20': 0.9, // Вечер: снижение
  '20-00': 0.8, // Ночь: низкая чувствительность
  '00-04': 0.7, // Глубокая ночь: минимум
};

function getCircadianMultiplier(hour) {
  for (const [range, mult] of Object.entries(CIRCADIAN_SENSITIVITY)) {
    const [start, end] = range.split('-').map(Number);
    if (hour >= start && hour < end) return mult;
  }
  return 1.0;
}

// Применение: деление, т.к. это чувствительность (выше = меньше инсулина)
const adjustedResponse = baseResponse / getCircadianMultiplier(meal.hour);
```

### 7. Second-Meal Effect

```javascript
function getSecondMealEffect(previousMeal, currentMeal) {
  if (!previousMeal) return { peakReduction: 1.0, durationIncrease: 1.0 };

  const timeDiffHours =
    (currentMeal.time - previousMeal.time) / (1000 * 60 * 60);
  if (timeDiffHours > 4) return { peakReduction: 1.0, durationIncrease: 1.0 };

  // Если предыдущий приём был высокобелковый/жирный - эффект сильнее
  const previousFatProtein = previousMeal.fat + previousMeal.protein;
  const slowdownFactor = Math.min(0.4, previousFatProtein / 100); // до 40%

  // Эффект затухает со временем
  const timeFactor = Math.max(0, 1 - timeDiffHours / 4);
  const effectStrength = slowdownFactor * timeFactor;

  return {
    peakReduction: 1 - effectStrength, // пик ниже до 40%
    durationIncrease: 1 + effectStrength * 0.5, // хвост длиннее до 20%
  };
}
```

### 8. Liquid vs Solid Form

```javascript
function getFormModifier(item) {
  if (item.form === 'liquid' || item.isLiquid) {
    return {
      peakShift: -15, // пик на 15 минут раньше
      amplitude: 1.35, // на 35% выше
      width: 0.75, // на 25% уже (быстрее)
    };
  }
  return { peakShift: 0, amplitude: 1.0, width: 1.0 };
}
```

### 9. Activity Impact

```javascript
function getActivityImpact(activities, mealTime) {
  let modifier = 1.0;

  for (const activity of activities) {
    const timeDiffMinutes = (activity.time - mealTime) / (1000 * 60);

    if (timeDiffMinutes > 0 && timeDiffMinutes < 30) {
      // Активность ПОСЛЕ еды (0-30 мин)
      const intensityMult =
        activity.intensity === 'high'
          ? 0.6
          : activity.intensity === 'medium'
            ? 0.75
            : 0.85;
      modifier *= intensityMult;
    } else if (timeDiffMinutes < 0 && timeDiffMinutes > -120) {
      // Активность ДО еды (-120 до 0 мин) - повышает чувствительность
      modifier *= 0.85;
    }
  }

  return modifier;
}
```

### 10. Wave Stacking (Overlap)

```javascript
function calculateWaveStacking(previousWave, currentMealTime) {
  if (!previousWave || !previousWave.endTime) return { hasStacking: false };

  const overlapMinutes = (previousWave.endTime - currentMealTime) / (1000 * 60);
  if (overlapMinutes <= 0) return { hasStacking: false };

  const totalPreviousMinutes =
    (previousWave.endTime - previousWave.startTime) / (1000 * 60);
  const overlapRatio = overlapMinutes / totalPreviousMinutes;

  // Чем больше overlap и выше предыдущая GL - тем сильнее эффект
  const glWeight = Math.min(1.0, previousWave.gl / 20); // normalize to 0-1
  const stackingStrength = overlapRatio * glWeight * 0.5; // max 50% от overlap

  return {
    hasStacking: true,
    amplitudeBonus: Math.min(0.4, stackingStrength), // до +40%
    durationBonus: Math.min(0.3, stackingStrength * 0.75), // до +30%
  };
}
```

---

## 🎨 UI/UX IMPLEMENTATION (Детали интерфейса)

### 1. Heatmap волны

```javascript
const InsulinWaveHeatmap = {
  colors: [
    { threshold: 0, color: '#22c55e', label: 'Липолиз' }, // зеленый
    { threshold: 30, color: '#eab308', label: 'Низкая волна' }, // желтый
    { threshold: 70, color: '#f97316', label: 'Средняя' }, // оранжевый
    { threshold: 100, color: '#ef4444', label: 'Высокая' }, // красный
  ],

  render(canvas, waveData, dayMinutes) {
    const cellWidth = canvas.width / (dayMinutes / 30); // 30-минутные ячейки
    for (let t = 0; t < dayMinutes; t += 30) {
      const level = getInsulinLevel(waveData, t);
      const color = this.getColor(level);
      // draw rect at (t/30 * cellWidth, 0, cellWidth, canvas.height)
    }
  },
};
```

### 2. Прогресс-бар липолиза

```javascript
const LipolysisProgressBar = {
  shouldShow: (currentLevel) => currentLevel > 30,

  calculate(waveData, currentTime) {
    if (currentLevel < 30) return null; // уже в липолизе

    // Ищем следующий момент когда уровень < 30
    let minutesToLipolysis = 0;
    for (let t = 0; t < 360; t += 5) {
      // проверяем следующие 6 часов
      const futureTime = currentTime + t * 60 * 1000;
      const level = getInsulinLevel(waveData, futureTime);
      if (level < 30) {
        minutesToLipolysis = t;
        break;
      }
    }

    return {
      minutes: minutesToLipolysis,
      hours: Math.floor(minutesToLipolysis / 60),
      remainingMinutes: minutesToLipolysis % 60,
      confidence: this.calculateConfidence(waveData),
    };
  },

  calculateConfidence(waveData) {
    // Уверенность выше если нет pending meals и активности
    return waveData.hasPendingMeals ? 0.7 : 0.95;
  },
};
```

### 3. Бейджи состояния

```javascript
const InsulinWaveBadges = {
  badges: [
    {
      id: 'stacking',
      check: (waveData) => waveData.stacking?.hasStacking,
      icon: '🔗',
      label: 'Наложение волн',
      color: '#f97316',
      tooltip: 'Приём пищи накладывается на предыдущую волну',
    },
    {
      id: 'highII',
      check: (mealData) => mealData.insulinIndex > 100,
      icon: '🥛',
      label: 'Высокий II',
      color: '#3b82f6',
      tooltip: 'Молочные продукты вызывают повышенный инсулиновый ответ',
    },
    {
      id: 'supplements',
      check: (dayData) => dayData.supplements?.length > 0,
      icon: '💊',
      label: dayData.supplements?.join(', '),
      color: '#10b981',
      tooltip: 'Добавки снижают инсулиновый ответ',
    },
    {
      id: 'circadian',
      check: (mealData) => mealData.hour >= 6 && mealData.hour <= 14,
      icon: '🌅',
      label: 'Оптимальное время',
      color: '#22c55e',
      tooltip: 'Высокая инсулиновая чувствительность утром',
    },
    {
      id: 'activity',
      check: (context) => context.activityModifier < 0.9,
      icon: '🏃',
      label: 'После активности',
      color: '#8b5cf6',
      tooltip: 'Тренировка улучшает усвоение глюкозы',
    },
  ],
};
```

### 4. Predictor алгоритм

```javascript
const InsulinWavePredictor = {
  predict(currentWave, timeHorizonMinutes = [60, 120]) {
    const predictions = {};

    for (const minutes of timeHorizonMinutes) {
      const futureTime = Date.now() + minutes * 60 * 1000;
      const predictedLevel = getInsulinLevel(currentWave, futureTime);

      predictions[`${minutes}min`] = {
        level: predictedLevel,
        status: this.getStatus(predictedLevel),
        confidence: this.calculateConfidence(currentWave, minutes),
      };
    }

    return predictions;
  },

  getStatus(level) {
    if (level < 30)
      return { id: 'lipolysis', label: '🟢 Липолиз', color: '#22c55e' };
    if (level < 70)
      return { id: 'low', label: '🟡 Низкая волна', color: '#eab308' };
    if (level < 100)
      return { id: 'medium', label: '🟠 Средняя', color: '#f97316' };
    return { id: 'high', label: '🔴 Высокая', color: '#ef4444' };
  },

  calculateConfidence(waveData, minutesAhead) {
    // Уверенность падает с увеличением времени прогноза
    const timeDecay = 1 - minutesAhead / 360; // 6 часов = 0 confidence
    // Уверенность выше если нет pending meals
    const pendingFactor = waveData.hasPendingMeals ? 0.7 : 1.0;
    return Math.max(0.5, timeDecay * pendingFactor);
  },
};
```

### 5. Tooltip детали

```javascript
function generateWaveTooltip(meal, waveData) {
  const parts = [];

  // GL breakdown
  parts.push(
    `GL: ${waveData.gl.toFixed(1)} (${waveData.glAdjustments.join(', ')})`,
  );

  // II if applicable
  if (waveData.insulinIndex > 80) {
    parts.push(`II: ${waveData.insulinIndex} (${waveData.iiReason})`);
  }

  // Modifiers
  if (waveData.stacking)
    parts.push(
      '🔗 Stacking +' +
        Math.round(waveData.stacking.amplitudeBonus * 100) +
        '%',
    );
  if (waveData.circadianMult !== 1.0)
    parts.push('🌅 Циркадный ×' + waveData.circadianMult.toFixed(2));
  if (waveData.activityMult < 1.0)
    parts.push('🏃 Активность ×' + waveData.activityMult.toFixed(2));
  if (waveData.irScore > 1.1)
    parts.push('⚠️ IR ×' + waveData.irScore.toFixed(2));

  return parts.join('\n');
}
```

---

## 🔍 REFERENCE (Научные источники)

1. **Brand-Miller (2003)**: GL как предиктор инсулинового ответа.
2. **Holt et al. (1997)**: Инсулиновый Индекс (II) продуктов.
3. **Wolever (1991)**: Влияние клетчатки и обработки пищи.
4. **Van Cauter (1997)**: Циркадные ритмы и инсулиновая чувствительность.
5. **Colberg (2010)**: Влияние физической активности на метаболизм глюкозы.
