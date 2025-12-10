# Task: Контекст тренировки для инсулиновой волны

> **Версия**: 3.3.0 | **Дата**: 2025-12-10  
> **Время**: ~5-6 часов  
> **Зависимости**: `heys_insulin_wave_v1.js` v3.2.2

---

## ⚠️ Phase 0 — Критический фундамент (ОБЯЗАТЕЛЬНО!)

### 0.1 Архитектурное решение — БЛОКЕР #1

**Проблема**: `getMealQualityScore` не имеет доступа к тренировкам и шагам!

```javascript
// Текущая сигнатура (heys_day_v12.js:1234):
getMealQualityScore(meal, mealType, optimum, pIndex)
// ❌ НЕ получает trainings, steps, day!
```

**Решение** — добавить опциональный параметр `context`:
```javascript
// Новая сигнатура:
getMealQualityScore(meal, mealType, optimum, pIndex, context = null)
// где context = { trainings, steps, weight, mets, allMeals }

// Внутри функции:
if (context?.trainings) {
  const activityBonus = HEYS.InsulinWave.calculateTrainingContextBonus({
    mealTimeMin: timeToMinutes(meal.time),
    mealKcal: mealKcal,
    mealNutrients: { protein, simpleCarbs },
    trainings: context.trainings,
    steps: context.steps,
    weight: context.weight,
    mets: context.mets,
    allMeals: context.allMeals  // для fastedTraining
  });
  // Применить activityBonus к harm и score
}
```

**Задача Phase 0**:
- [ ] `grep -n "getMealQualityScore" apps/web/heys_day_v12.js` — найти все вызовы
- [ ] Добавить `context` параметр в каждый вызов
- [ ] Убедиться что `trainings` и `steps` доступны в месте вызова

### 0.2 Хелпер для Training Duration — БЛОКЕР #2

**Проблема**: Training не имеет поля `duration`, только массив `z[]`.

**Решение** — создать хелперы в `heys_models_v1.js`:
```javascript
// Добавить в HEYS.models:
getTrainingDuration: function(training) {
  if (!training?.z || !Array.isArray(training.z)) return 0;
  return training.z.reduce((sum, min) => sum + (+min || 0), 0);
},

getTrainingInterval: function(training) {
  const duration = this.getTrainingDuration(training);
  if (!training?.time || duration === 0) return null;
  
  const [h, m] = training.time.split(':').map(Number);
  const startMin = h * 60 + m;
  const endMin = startMin + duration;
  
  return {
    startMin,
    endMin,
    durationMin: duration,
    startTime: training.time,
    endTime: `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`
  };
}
```

### 0.3 Naming — избежать конфликта с POSTPRANDIAL

**Проблема**: Уже существует `hasPostprandialBonus` для активности ПОСЛЕ еды.

**Решение** — использовать чёткий namespace:
| Существующее | Новое | Описание |
|--------------|-------|----------|
| `postprandialExercise` | — | Тренировка ПОСЛЕ еды (не трогаем) |
| — | `periWorkoutMeal` | Еда ВО ВРЕМЯ тренировки |
| — | `postWorkoutMeal` | Еда ПОСЛЕ тренировки |
| — | `preWorkoutMeal` | Еда ПЕРЕД тренировкой |

### 0.4 Выбор тренировки при нескольких в день

**Проблема**: Если 2 тренировки, какую выбрать для конкретного приёма?

**Решение**: Проверять ВСЕ тренировки, выбирать лучший бонус по приоритету:
```javascript
function findBestTrainingContext(mealTimeMin, trainings, ...) {
  let best = null;
  
  for (const training of trainings) {
    const result = analyzeTrainingForMeal(mealTimeMin, training, ...);
    if (!result) continue;
    
    // Приоритет: PERI > POST > PRE
    if (!best || PRIORITY[result.type] > PRIORITY[best.type]) {
      best = result;
    }
    // При равном приоритете — берём с бóльшим бонусом
    else if (PRIORITY[result.type] === PRIORITY[best.type] && 
             Math.abs(result.waveBonus) > Math.abs(best.waveBonus)) {
      best = result;
    }
  }
  
  return best;
}

const PRIORITY = { peri: 3, post: 2, pre: 1, steps: 0, morning: 0, double: 0 };
```

### 0.5 Прогрессивное окно восстановления

**Научное обоснование**: Больше потрачено = дольше восстановление (Ivy & Kuo, 1998).

**Решение**: Масштабировать POST-WORKOUT окно по калориям:
```javascript
// Базовое окно: 120 мин
// Формула: maxGap = 120 + (kcal / 500) * 60, max 360
const baseGap = 120;
const kcalBonus = Math.min(240, (trainingKcal / 500) * 60);
const adjustedMaxGap = baseGap + kcalBonus;

// Примеры:
// 500 ккал → 120 + 60 = 180 мин (3ч)
// 1000 ккал → 120 + 120 = 240 мин (4ч)
// 1500 ккал → 120 + 180 = 300 мин (5ч)
// 2000 ккал → 120 + 240 = 360 мин (6ч, max)
```

### 0.6 Проверки перед началом

- [ ] **git status** — нет незакоммиченных изменений
- [ ] **Бэкап файлов**:
  ```bash
  cp apps/web/heys_insulin_wave_v1.js apps/web/heys_insulin_wave_v1.js.backup
  cp apps/web/heys_day_v12.js apps/web/heys_day_v12.js.backup
  cp apps/web/heys_models_v1.js apps/web/heys_models_v1.js.backup
  ```
- [ ] **`pnpm dev`** — консоль чистая
- [ ] **Базовый тест**: Приём пищи + тренировка → волна рассчитывается

### 0.7 Проверка конфликтов с Advice Module

**Проблема**: В `heys_advice_v1.js` уже есть советы про тренировки:
```javascript
// Существующие советы:
'post_training_protein'           // hasTraining && proteinPct < 0.8
'post_training_undereating_critical' // hasTraining && kcalPct < 0.7
'hard_workout_recovery'           // highIntensity>20min && proteinPct<1.0
'training_recovery_window'        // 30-60 мин после тренировки
```

**Решение**:
- [ ] Проверить что советы НЕ противоречат новой логике Activity Context
- [ ] Если совет дублирует бейдж (например Recovery) — можно отключить совет
- [ ] Или: обновить советы чтобы они использовали `trainingContext` данные

### 0.8 Санity checks для данных тренировки

**Защита от мусорных/ошибочных данных**:
```javascript
const TRAINING_LIMITS = {
  maxDurationMin: 300,      // >5 часов — нереально
  maxTrainingsPerDay: 5,    // >5 тренировок — подозрительно
  maxKcalPerTraining: 2500, // >2500 ккал — скорее всего ошибка
  minDurationMin: 5         // <5 мин — не считаем
};

function isValidTraining(training, kcal) {
  const duration = getTrainingDuration(training);
  if (duration < TRAINING_LIMITS.minDurationMin) return false;
  if (duration > TRAINING_LIMITS.maxDurationMin) return false;
  if (kcal > TRAINING_LIMITS.maxKcalPerTraining) return false;
  return true;
}

function filterValidTrainings(trainings) {
  if (trainings.length > TRAINING_LIMITS.maxTrainingsPerDay) {
    console.warn('[TRAINING_CONTEXT] Too many trainings, using first 5');
    trainings = trainings.slice(0, 5);
  }
  return trainings.filter(t => isValidTraining(t, trainK(t)));
}
```

### 0.9 UI план — избежать перегрузки бейджами

**Проблема**: 10 контекстов = потенциально 10 бейджей в UI

**Решение**:
```javascript
// Правило: максимум 2 бейджа на приём
// 1. Главный бейдж (самый сильный эффект)
// 2. Второстепенный (если есть)

function formatTrainingBadges(context) {
  if (!context) return [];
  
  const badges = [];
  
  // Главный бейдж — по типу контекста
  if (context.badge) {
    badges.push({
      text: context.badge,
      primary: true,
      tooltip: context.desc
    });
  }
  
  // Второстепенный — суммарный эффект
  const totalBonus = Math.round(Math.abs(context.waveBonus) * 100);
  if (totalBonus > 0) {
    badges.push({
      text: `-${totalBonus}%`,
      primary: false,
      tooltip: `Волна сокращена на ${totalBonus}%`
    });
  }
  
  return badges.slice(0, 2); // Max 2
}
```

**UI пример**:
```
Перекус 15:30 — 250 ккал
🏋️ Топливо -60%         // Компактно: бейдж + эффект
                         // При клике: tooltip с деталями
```

### 0.10 Обработка КОМБО-тренировок

**Проблема**: Кардио 30 мин + Силовая 45 мин как одна сессия — 2 записи, какую брать?

**Решение** — объединять близкие тренировки:
```javascript
function mergeCloseTrainingSessions(trainings, maxGapMin = 30) {
  if (trainings.length < 2) return trainings;
  
  // Сортируем по времени
  const sorted = [...trainings].sort((a, b) => 
    parseHour(a.time) - parseHour(b.time)
  );
  
  const merged = [];
  let current = sorted[0];
  
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const currentEnd = getTrainingInterval(current).endMin;
    const nextStart = parseHour(next.time) * 60;
    
    // Gap < 30 мин → merge
    if (nextStart - currentEnd < maxGapMin) {
      current = {
        time: current.time, // Время начала первой
        type: PRIORITY[next.type] > PRIORITY[current.type] ? next.type : current.type,
        z: current.z.map((v, i) => v + (next.z?.[i] || 0)), // Суммируем зоны
        _merged: true
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);
  
  return merged;
}

// Приоритет типа при merge: strength > cardio > hobby
const TYPE_PRIORITY = { strength: 3, cardio: 2, hobby: 1 };
```

### 0.11 Определение HIIT vs LISS

**Научное обоснование**: HIIT создаёт EPOC (Excess Post-exercise Oxygen Consumption) до 24ч.

```javascript
function getTrainingIntensityType(training) {
  const zones = training.z || [0, 0, 0, 0];
  const totalMin = zones.reduce((s, v) => s + v, 0);
  if (totalMin === 0) return 'unknown';
  
  const highIntensityMin = (zones[2] || 0) + (zones[3] || 0); // Zone 3 + Zone 4
  const ratio = highIntensityMin / totalMin;
  
  if (ratio > 0.5) return 'HIIT';      // >50% в высоких зонах
  if (ratio > 0.3) return 'MODERATE';  // 30-50%
  return 'LISS';                        // <30% — низкоинтенсивное кардио
}

// Влияние на POST-WORKOUT окно:
const INTENSITY_GAP_MULTIPLIER = {
  'HIIT': 2.0,      // Окно x2 (до 6-8 часов)
  'MODERATE': 1.5,  // Окно x1.5
  'LISS': 1.0       // Стандартное окно
};
```

### 0.12 Fallback для тренировок без пульсовых зон

**Проблема**: Если `t.z = [0,0,0,0]` → duration = 0 → нет контекста.

```javascript
const DEFAULT_DURATION_BY_TYPE = {
  'cardio': 45,
  'strength': 60,
  'hobby': 30
};

function getTrainingDuration(training) {
  const fromZones = (training.z || []).reduce((s, v) => s + (+v || 0), 0);
  if (fromZones > 0) return fromZones;
  
  // Fallback по типу
  return DEFAULT_DURATION_BY_TYPE[training.type] || 45;
}
```

### 0.13 Интеграция с существующими факторами инсулиновой волны

**КРИТИЧНО**: В `heys_insulin_wave_v1.js` уже есть факторы #16-17!

```javascript
// УЖЕ СУЩЕСТВУЮТ в calculateMultiplier():
WORKOUT_BONUS: {       // Фактор #16 — общая тренировка
  none: 0,
  light: -0.08,        // 20 мин
  moderate: -0.15      // 45+ мин
}
POSTPRANDIAL_EXERCISE: { // Фактор #17 — тренировка ПОСЛЕ еды
  short: -0.10,        // 15 мин
  medium: -0.18,       // 20 мин
  long: -0.25          // 30+ мин
}
```

**Решение** — ActivityContext ЗАМЕНЯЕТ эти факторы (не дублирует!):
```javascript
function calculateMultiplier(params) {
  // ... существующие факторы ...
  
  // НОВОЕ: Если есть ActivityContext — использовать его
  if (params.activityContext) {
    // НЕ применять WORKOUT_BONUS и POSTPRANDIAL_EXERCISE
    // Вместо этого применить activityContext.waveBonus
    foodMult += params.activityContext.waveBonus;
  } else {
    // Fallback на старую логику (для обратной совместимости)
    foodMult += getWorkoutBonus(params);
    foodMult += getPostprandialBonus(params);
  }
}
```

### 0.14 Совместимость с waveHistory

**Проблема**: Структура `waveHistory` уже используется в UI.

```javascript
// Текущая структура в waveData:
waveHistory: [{
  meal: { id, time, ... },
  startMin: 510,
  endMin: 690,
  multiplier: 0.85,
  phases: { rise, plateau, decline },
  // ... другие поля
}]
```

**Решение** — добавить поле `activityContext` в каждую запись:
```javascript
waveHistory: [{
  meal: { ... },
  startMin: 510,
  endMin: 690,
  // НОВОЕ:
  activityContext: {
    type: 'post',              // Тип контекста
    waveBonus: -0.35,          // Применённый бонус
    harmBonus: 0,              // Применённый бонус к harm
    badge: '🔄 Recovery',      // Для UI
    trainingRef: { time, kcal, type } // Ссылка на тренировку
  }
}]
```

### 0.15 Интеграция с Meal Quality Score

**Проблема**: `getMealQualityScore()` не знает о контексте активности.

**Решение** — добавить бонусные баллы за контекст:
```javascript
// В getMealQualityScore() добавить:
function applyActivityContextBonus(baseScore, context) {
  if (!context?.activityContext) return baseScore;
  
  const { type, waveBonus, harmBonus } = context.activityContext;
  let bonus = 0;
  
  // Бонус за контекст (до +10 баллов)
  if (type === 'peri') bonus = 10;      // Еда во время = отлично!
  else if (type === 'post') bonus = 8;  // После тренировки = хорошо
  else if (type === 'pre') bonus = 5;   // Перед тренировкой = норм
  else if (harmBonus < 0) bonus = 3;    // Любой бонус к harm
  
  return Math.min(100, baseScore + bonus);
}
```

**UI**: Добавить бейдж в `badges[]`:
```javascript
if (context?.activityContext) {
  badges.push({
    type: context.activityContext.badge.split(' ')[0], // Эмодзи
    ok: true,
    label: context.activityContext.badge
  });
}
```

### 0.16 Интеграция с добавлением продукта (Smart Portions)

**Проблема**: При добавлении продукта ПОСЛЕ тренировки система не предлагает оптимальную порцию.

**Решение** — автокоррекция порций в модалке добавления:
```javascript
// В ProductAddModal проверять контекст
function getSuggestedPortion(product, activityContext) {
  if (!activityContext) return product.defaultPortion || 100;
  
  const { type, trainingKcal } = activityContext;
  
  if (type === 'post' && product.protein100 > 15) {
    // Для восстановления нужно 25-35г белка
    const targetProtein = Math.min(35, 25 + (trainingKcal / 200));
    return Math.ceil(targetProtein / product.protein100 * 100);
  }
  
  if (type === 'post' && product.complex100 > 30) {
    // Для гликогена нужно ~1г углеводов на кг веса
    const targetCarbs = context.weight || 70;
    return Math.ceil(targetCarbs / product.complex100 * 100);
  }
  
  if (type === 'pre' && product.carbs100 > 20) {
    // Перед тренировкой — умеренные углеводы
    return Math.min(150, Math.ceil(30 / product.carbs100 * 100));
  }
  
  return product.defaultPortion || 100;
}

// UI подсказка:
if (activityContext?.type === 'post') {
  showHint({
    icon: '🎯',
    title: 'Гликогеновое окно!',
    text: `Рекомендуем ${suggestedGrams}г для восстановления`,
    cta: '[Применить]'
  });
}
```

### 0.17 Hydration Context — повышенная норма воды

**Проблема**: После тренировки гидратация КРИТИЧНА, но норма воды не корректируется.

**Решение** — динамическая корректировка нормы:
```javascript
// В waterGoalBreakdown добавить:
function getTrainingWaterBonus(trainings) {
  if (!trainings?.length) return 0;
  
  const totalDuration = trainings.reduce((sum, t) => 
    sum + getTrainingDuration(t), 0
  );
  
  // +500мл на каждые 30 минут активности
  const bonus = Math.floor(totalDuration / 30) * 500;
  
  return {
    bonus,
    desc: `🏋️ +${bonus}мл за ${totalDuration} мин тренировок`
  };
}

// Пример:
// 60 мин тренировки → +1000мл к норме
// Показывать в breakdown воды
```

**UI в WaterCard**:
```
💧 Вода: 1800 / 3000 мл
   ├─ Базовая норма: 2000 мл
   ├─ 🏋️ Тренировка 60 мин: +1000 мл
   └─ Осталось: 1200 мл
```

### 0.18 Визуализация тренировок в календаре

**Проблема**: В календаре не видно какие дни были с тренировками.

**Решение** — добавить иконки в DatePickerModal:
```javascript
// В renderDayCell добавить:
const TRAINING_ICONS = {
  cardio: '🏃',
  strength: '🏋️',
  hobby: '⚽'
};

function getDayTrainingIcon(dayData) {
  if (!dayData.trainings?.length) return null;
  
  // Берём самую интенсивную тренировку
  const bestTraining = dayData.trainings.reduce((best, t) => {
    const kcal = trainK(t);
    return kcal > (best ? trainK(best) : 0) ? t : best;
  }, null);
  
  return TRAINING_ICONS[bestTraining.type] || '🏃';
}

// В календаре: маленькая иконка в углу ячейки
// CSS: position: absolute; top: 2px; right: 2px; font-size: 10px;
```

### 0.19 Адаптация Advice Module для контекста

**Проблема**: Советы `post_training_protein` и др. не знают о новых контекстах.

**Решение** — обновить условия в `heys_advice_v1.js`:
```javascript
// Было:
'post_training_protein': {
  condition: () => hasTraining && proteinPct < 0.8,
  text: 'После тренировки белок важен для восстановления'
}

// Стало:
'post_training_protein': {
  condition: (ctx) => {
    // Проверяем что сейчас POST-WORKOUT контекст И недостаток белка
    const postContext = ctx.meals.some(m => 
      m.activityContext?.type === 'post' && 
      getMealProtein(m) < 25
    );
    return postContext;
  },
  text: 'Ты в гликогеновом окне! Добавь 25-30г белка для восстановления'
}

// Новые советы:
'peri_workout_fuel': {
  condition: (ctx) => ctx.meals.some(m => m.activityContext?.type === 'peri'),
  text: '💪 Отлично! Топливо во время тренировки = максимальная эффективность'
}

'missed_recovery_window': {
  condition: (ctx) => {
    // Была тренировка, но POST-приёма не было в течение 2ч
    const trainings = ctx.day.trainings || [];
    const meals = ctx.day.meals || [];
    return trainings.some(t => {
      const endMin = getTrainingInterval(t).endMin;
      const hasPostMeal = meals.some(m => {
        const mealMin = parseHour(m.time) * 60;
        return mealMin > endMin && mealMin < endMin + 120;
      });
      return !hasPostMeal;
    });
  },
  text: '⚠️ Ты пропустил гликогеновое окно. В следующий раз поешь в течение 2ч после тренировки'
}
```

### 0.20 Мобильная адаптация UI контекстов

**Проблема**: 10 типов бейджей не влезут на маленьких экранах.

**Решение** — адаптивный режим:
```javascript
// Определяем размер экрана
const isMobile = window.innerWidth < 640;

function formatContextBadge(activityContext, isMobile) {
  if (!activityContext) return null;
  
  if (isMobile) {
    // Компактный режим: иконка + процент
    return {
      text: `${activityContext.badge.split(' ')[0]} ${Math.round(Math.abs(activityContext.waveBonus) * 100)}%`,
      expandable: true,
      details: activityContext.desc
    };
  }
  
  // Desktop: полный бейдж
  return {
    text: activityContext.badge,
    subtitle: `Волна -${Math.round(Math.abs(activityContext.waveBonus) * 100)}%`
  };
}
```

**Mobile UI**:
```
Перекус 15:30 — 250 ккал  🏋️-60%
                          ↑ тап для деталей
```

**Desktop UI**:
```
Перекус 15:30 — 250 ккал
🏋️ Топливо • Волна -60% • Harm ×0.5
```

---

## 🎯 WHY (Бизнес-контекст)

**Problem**: Инсулиновая волна не учитывает контекст тренировки. Если пользователь съел "вредный" батончик во время 1100 ккал активности — система показывает 3-часовую волну и высокий harm, хотя по факту:
- Сахар уходит напрямую в мышцы (GLUT4 без инсулина)
- Это топливо для работы, а не избыточные калории
- Волна должна быть минимальной или отсутствовать

**Impact**: Пользователи получают некорректные предупреждения и демотивируются.

**Value**: Точная модель = честные советы. Спортсмены и активные люди увидят адекватную оценку своего питания.

---

## 🔬 Научное обоснование

### 1. PERI-WORKOUT (еда ВО ВРЕМЯ тренировки) — Приоритет #1

**Механизм**: При активной нагрузке адреналин подавляет инсулин, мышцы используют глюкозу напрямую.

| Источник | Находка | Эффект |
|----------|---------|--------|
| **Jeukendrup (2014)** | При >60% VO2max инсулин подавлен, глюкоза = прямое топливо | Волна минимальна |
| **Brooks (2012)** | "Metabolic crossover" — при высокой интенсивности углеводы = приоритетное топливо | Вредность ↓ |

### 2. POST-WORKOUT (еда ПОСЛЕ тренировки) — "Гликогеновое окно"

**Механизм**: После тренировки GLUT4 транспортёры активны 2-4 часа. Глюкоза уходит в мышцы **без инсулина**.

| Источник | Находка | Эффект |
|----------|---------|--------|
| **Richter & Hargreaves (2013)** | GLUT4 активен 2-4ч после упражнений | Волна до -40% |
| **Ivy et al. (1999)** | "Glycogen window" 30-60 мин — углеводы идут в мышцы | Волна до -40% в первые 45 мин |

### 3. PRE-WORKOUT (еда ДО тренировки)

**Механизм**: Углеводы перед тренировкой будут использованы как топливо.

| Источник | Находка | Эффект |
|----------|---------|--------|
| **Ormsbee et al. (2014)** | Углеводы за 1-2ч до тренировки → используются во время | Волна -10-20% |
| **Hargreaves (2004)** | Инсулин подавляется при начале упражнений | Волна прерывается |

### 4. STEPS BONUS (активный день)

**Механизм**: Высокая NEAT активность улучшает инсулиновую чувствительность весь день.

| Источник | Находка | Эффект |
|----------|---------|--------|
| **Hamilton et al. (2007)** | NEAT улучшает инсулиновую чувствительность | -10% волна вечером |

---

## ⏱️ Временные диапазоны и логика

### Структура данных тренировки

```javascript
// Training в HEYS:
training = {
  time: '14:30',        // ← Время НАЧАЛА тренировки
  z: [5, 20, 15, 0],    // ← Минуты в каждой пульсовой зоне
  type: 'hobby'         // ← Только для UI, НЕ влияет на расчёт!
}

// Вычисляемые поля:
const durationMin = training.z.reduce((s, m) => s + (+m || 0), 0); // 40 мин
const startMin = timeToMinutes(training.time); // 14:30 → 870
const endMin = startMin + durationMin;          // 870 + 40 = 910 (15:10)
const trainingKcal = trainK(training);          // По зонам и весу → 1100
```

### Приоритет окон: PERI > POST > PRE > STEPS

Если приём попадает в несколько окон — берём **только одно** с наивысшим приоритетом.

### Константы

```javascript
const TRAINING_CONTEXT = {
  // === PERI-WORKOUT (еда ВО ВРЕМЯ тренировки) ===
  // Условие: mealTime ∈ [startMin, endMin]
  // Бонус зависит от ratio: trainingKcal / mealKcal
  periWorkout: {
    // Формула: bonus = -60% × min(1, ratio / 3)
    // Если ratio >= 3 → -60% (максимум)
    // Если ratio = 1 → -20%
    // Если ratio = 0.5 → -10%
    maxBonus: -0.60,
    harmMultiplier: 0.5,  // harm ×0.5
    badge: '🏋️ Топливо'
  },
  
  // === POST-WORKOUT (гликогеновое окно) ===
  // gap = mealTime - trainingEndTime (положительный = после)
  // 🆕 nightPenaltyOverride: отменяет ночной штраф ×1.2 → ×1.0
  // 🆕 Прогрессивное окно: maxGap = 120 + (kcal/500)*60, max 360 мин
  postWorkout: {
    baseGap: 120,           // Базовое окно 2ч
    kcalScaling: 60,        // +60 мин на каждые 500 ккал
    maxGap: 360,            // Максимум 6ч для очень интенсивных
    tiers: [
      { gapPct: 0.25, waveBonus: -0.40, harmBonus: -0.30, nightPenaltyOverride: true, badge: '💪 Восстановление' },
      { gapPct: 0.50, waveBonus: -0.25, harmBonus: -0.15, nightPenaltyOverride: true, badge: '💪 Восстановление' },
      { gapPct: 0.75, waveBonus: -0.10, harmBonus: 0,     nightPenaltyOverride: true, badge: '💪 Восстановление' },
      { gapPct: 1.00, waveBonus: -0.05, harmBonus: 0,     nightPenaltyOverride: true, badge: null }
    ]
    // gapPct = actualGap / adjustedMaxGap
    // Пример: 1000 ккал → maxGap=240, gap=60 → gapPct=0.25 → tier[0]
  },
  
  // === PRE-WORKOUT (заправка) ===
  // gap = trainingStartTime - mealTime (положительный = до)
  preWorkout: [
    { maxGap: 45, waveBonus: -0.20, harmBonus: -0.15, badge: '⚡ Заправка' },
    { maxGap: 90, waveBonus: -0.10, harmBonus: 0, badge: '⚡ Заправка' }
  ],
  
  // === STEPS BONUS (активный день) ===
  // Условие: steps > 10000 И mealTime > 18:00
  stepsBonus: {
    threshold: 10000,
    afterHour: 18,  // Только для вечерних приёмов
    waveBonus: -0.10,
    harmBonus: 0,
    badge: '👣 Активный день'
  },
  
  // === 🆕 MORNING TRAINING BONUS ===
  // Тренировка до 12:00 → повышенная чувствительность весь день
  morningTraining: {
    beforeHour: 12,       // Тренировка должна ЗАКОНЧИТЬСЯ до 12:00
    dayWaveBonus: -0.05,  // -5% ко всем приёмам
    validUntilHour: 22,   // Эффект действует до 22:00
    badge: '🌅 Утренняя зарядка'
  },
  
  // === 🆕 DOUBLE TRAINING DAY ===
  // 2+ тренировки в день = режим интенсивного восстановления
  doubleTraining: {
    minTrainings: 2,
    dayWaveBonus: -0.10,  // -10% ко всем приёмам
    dayHarmBonus: -0.10,  // -10% к вредности
    badge: '🔥 День восстановления'
  },
  
  // === 🆕 FASTED TRAINING BONUS ===
  // Тренировка натощак (8+ часов без еды) → усиленный POST-WORKOUT
  fastedTraining: {
    minFastHours: 8,
    postWorkoutMultiplier: 1.3,  // POST бонусы ×1.3
    badge: '⚡ Fasted'
  },
  
  // === 🆕 CARDIO + SIMPLE CARBS ===
  // После кардио простые углеводы восполняют гликоген
  cardioSimpleCarbs: {
    minCardioMinutes: 30,   // Мин 30 мин в зонах 2-3
    simpleMultiplier: 0.5,  // Штраф за простые ×0.5
    maxGap: 60,             // В течение часа после кардио
    badge: '🏃 Восполнение'
  },
  
  // === 🆕 STRENGTH + HIGH PROTEIN ===
  // После силовой белок идёт на MPS, не глюконеогенез
  strengthProtein: {
    minProtein: 30,           // ≥30г белка в приёме
    proteinHarmBonus: -0.20,  // harm от белка ×0.8
    maxGap: 120,              // В течение 2ч после силовой
    badge: '💪 Анаболизм'
  }
};
```

### Визуализация временной линии

```
Тренировка: 14:30-15:10 (40 мин, 500 ккал)

PRE-WORKOUT     PERI       POST-WORKOUT
◀───────────▶  ◀────▶   ◀─────────────────▶
13:00   14:00  14:30  15:10  15:55  16:40
  -90м   -30м   START   END   +45м   +90м
  -10%   -20%   -60%   -40%   -40%   -25%

Еда в 14:45 (во время): type=peri, bonus=-60%×(500/300)=−60%
Еда в 15:30 (через 20м): type=post, bonus=-40%
Еда в 14:00 (за 30м до): type=pre, bonus=-20%
```

---

## 📋 WHAT (Чек-лист задач)

### Phase 1: Хелперы и константы

- [ ] **Константы TRAINING_CONTEXT** — `heys_insulin_wave_v1.js`
  - Добавить рядом с `POSTPRANDIAL_EXERCISE` (~строка 290)
  
- [ ] **Хелпер getTrainingInterval()** — вычисление start/end/kcal
  ```javascript
  function getTrainingInterval(training, weight, mets) {
    if (!training?.time) return null;
    const startMin = utils.timeToMinutes(training.time);
    const z = training.z || [0, 0, 0, 0];
    const durationMin = z.reduce((s, m) => s + (+m || 0), 0);
    if (durationMin === 0) return null;
    const endMin = startMin + durationMin;
    const kcal = z.reduce((s, m, i) => s + (+m || 0) * (mets[i] || 0) * weight / 60, 0);
    return { startMin, endMin, durationMin, kcal: Math.round(kcal) };
  }
  ```

### Phase 2: Главная функция

- [ ] **Функция calculateTrainingContextBonus()** — единая точка расчёта
  ```javascript
  calculateTrainingContextBonus({ mealTimeMin, mealKcal, mealNutrients, trainings, steps, weight, mets, allMeals }) → {
    type: 'peri'|'post'|'pre'|'steps'|'morning'|'double'|null,
    waveBonus: number,        // -0.60 ... 0
    harmMultiplier: number,   // 0.5 ... 1.0
    training: Training|null,
    gapMinutes: number|null,
    ratio: number|null,       // trainingKcal / mealKcal (для peri)
    badge: string|null,       // '🏋️ Топливо' etc.
    desc: string|null,
    // 🆕 Дополнительные флаги
    nightPenaltyOverride: boolean,  // Отменить ночной штраф?
    isFasted: boolean,              // Тренировка была натощак?
    simpleMultiplier: number,       // Множитель для простых углеводов
    proteinHarmBonus: number        // Бонус для белка (после силовой)
  }
  ```

### Phase 3: Интеграция

- [ ] **Интеграция в calculate()** — `heys_insulin_wave_v1.js`
  - Вызвать `calculateTrainingContextBonus()` 
  - Добавить `trainingContext` в результат
  - Применить `waveBonus` к финальному множителю

- [ ] **Интеграция в getMealQualityScore()** — `heys_day_v12.js`
  - Добавить параметр `context = { trainings, steps, weight, mets }`
  - Если `context` передан → вызвать HEYS.InsulinWave.calculateTrainingContextBonus()
  - Применить `harmMultiplier` к расчёту вредности
  - Добавить badge в результат

- [ ] **Обновить все вызовы getMealQualityScore()** — передать context

### Phase 4: UI

- [ ] **Бейджи в MealCard**:
  - 🏋️ Топливо (peri)
  - 💪 Восстановление (post)
  - ⚡ Заправка (pre)
  - 👣 Активный день (steps)
  - 🌅 Утренняя зарядка (morning training)
  - 🔥 День восстановления (double training)
  - ⚡ Fasted (fasted training)
  - 🏃 Восполнение (cardio + simple)
  - 💪 Анаболизм (strength + protein)

- [ ] **Зачёркнутый harm**: `"Harm 15 ~~30~~"`

- [ ] **Tooltip с объяснением**: При клике на бейдж — почему применён бонус

---

## 🔧 Ключевые файлы

| Файл | Строки | Что менять |
|------|--------|------------|
| `heys_insulin_wave_v1.js` | ~290 | Константы TRAINING_CONTEXT |
| `heys_insulin_wave_v1.js` | ~2000 | Хелпер getTrainingInterval() |
| `heys_insulin_wave_v1.js` | ~2050 | Функция calculateTrainingContextBonus() |
| `heys_insulin_wave_v1.js` | ~2400 | Интеграция в calculate() |
| `heys_day_v12.js` | ~1234 | getMealQualityScore — добавить context |
| `heys_day_v12.js` | ~2034 | Вызов getMealQualityScore — передать context |

---

## 🧪 Пример: Батончик во время барабанов

**Данные**:
- Батончик: 250 ккал, harm=30
- Кофе: 50 ккал
- Meal total: 300 ккал, time: 15:00
- Тренировка: time=14:00, z=[10, 40, 30, 10]=90 мин, hobby
- Training kcal: 1100 (по зонам!)
- Training interval: 14:00-15:30

**Расчёт**:
1. Meal time 15:00 ∈ [14:00, 15:30] → **PERI**
2. Ratio = 1100 / 300 = 3.67 ≥ 3 → **waveBonus = -60%**
3. harmMultiplier = 0.5
4. Badge = '🏋️ Топливо'

**Результат**:
- Волна: 3ч × 0.4 = **1.2ч** (вместо 3ч!)
- Harm: 30 × 0.5 = **15** (вместо 30)
- UI: `🏋️ Топливо` badge

---

## 🧪 Пример: Ночной приём после вечерней тренировки

**Данные**:
- Тренировка: 19:00-20:00 (60 мин, 600 ккал)
- Ужин: 22:30, 500 ккал, белок 35г

**Расчёт**:
1. Gap = 22:30 - 20:00 = 150 мин
2. POST-WORKOUT: maxGap 240 → попадает! waveBonus = -5%
3. **nightPenaltyOverride = true** → ночной ×1.2 отменён!
4. Час = 22:30 → без override был бы CIRCADIAN ×1.15

**Результат без фичи**: Волна = 3ч × 1.15 = **3.45ч**, ночной штраф
**Результат с фичей**: Волна = 3ч × 0.95 = **2.85ч**, badge '💪 Восстановление'

---

## 🧪 Пример: Утренняя тренировка + весь день

**Данные**:
- Тренировка: 07:00-08:00 (60 мин, 400 ккал)
- Завтрак: 08:30 → POST-WORKOUT (-40%)
- Обед: 13:00 → Morning bonus (-5%)
- Ужин: 19:00 → Morning bonus (-5%)
- Поздний перекус: 23:00 → Нет бонуса (после 22:00)

**Результат**:
- Завтрак: волна -40% (POST)
- Обед: волна -5% (🌅 Утренняя зарядка)
- Ужин: волна -5% (🌅 Утренняя зарядка)
- Перекус: без бонуса

---

## 🧪 Пример: Силовая + белковый приём

**Данные**:
- Тренировка: strength, 18:00-19:00
- Ужин: 19:30, белок 40г, harm=20

**Расчёт**:
1. POST-WORKOUT: gap=30 мин → waveBonus=-40%, harmBonus=-30%
2. strength + protein ≥30г → **proteinHarmBonus = -20%**
3. Итого harm: 20 × 0.7 × 0.8 = **11.2**

**Бейджи**: 💪 Восстановление + 💪 Анаболизм

---

## ⚠️ Риск-матрица

| Риск | Вероятность | Импакт | Митигация |
|------|-------------|--------|-----------|
| Breaking POSTPRANDIAL_EXERCISE | Средняя | Высокий | НЕ трогать, добавлять рядом. trainingContext имеет приоритет |
| getMealQualityScore regression | Средняя | Средний | context optional — если null, старое поведение |
| Несколько тренировок | Средняя | Низкий | Проверить все, взять лучший бонус |
| Производительность | Низкая | Низкий | Один расчёт на приём — OK |

---

## 🔙 Rollback план

```bash
cp apps/web/heys_insulin_wave_v1.js.backup apps/web/heys_insulin_wave_v1.js
cp apps/web/heys_day_v12.js.backup apps/web/heys_day_v12.js
pnpm dev
```

---

## ✅ Критерии приёмки

### Functional

- [ ] **PERI**: Еда во время 500+ ккал тренировки → волна -40% или больше
- [ ] **POST**: Еда через 30 мин после тренировки → волна -40%, harm -30%
- [ ] **PRE**: Еда за 30 мин до тренировки → волна -20%
- [ ] **STEPS**: Ужин после 12000 шагов → волна -10%
- [ ] **🆕 NIGHT OVERRIDE**: Поздний приём после вечерней тренировки → нет ночного штрафа
- [ ] **🆕 MORNING**: Утренняя тренировка → все приёмы до 22:00 получают -5%
- [ ] **🆕 DOUBLE DAY**: 2 тренировки в день → все приёмы -10%
- [ ] **🆕 STRENGTH+PROTEIN**: Белок ≥30г после силовой → доп. harmBonus
- [ ] **🆕 CARDIO+SIMPLE**: Простые углеводы после кардио → штраф ×0.5
- [ ] **Консоль**: `HEYS.InsulinWave.debugTrainingContext(...)` работает
- [ ] **UI**: Бейджи отображаются в карточке приёма

### Non-functional

- [ ] `pnpm type-check` проходит
- [ ] `pnpm build` проходит
- [ ] Нет regression в существующем функционале

---

## 🌟 WOW-рекомендация: Интеграция с шагами

Если `day.steps > 10,000` и `mealTime > 18:00`:
- **Бонус**: -10% к волне
- **Badge**: 👣 Активный день
- **Смысл**: На фоне высокой NEAT активности вечерняя чувствительность к инсулину выше

---

## 🚀 WOW-фичи (Phase 5 — опционально)

### 5.1 Recovery Score после тренировки

После тренировки показывать чеклист восстановления:

```javascript
// В карточке тренировки или отдельным блоком
Recovery Checklist:
[✅] Белок 35г / 20-30г (через 45 мин)
[⬜] Углеводы для гликогена  
[⚠️] Вода 1200мл / 2000мл (+500мл после тренировки)
[✅] Сон запланирован 8ч
```

**Реализация**:
```javascript
function getRecoveryScore(training, mealsAfter, waterMl, plannedSleep) {
  const checks = [];
  const gap = mealsAfter[0]?.gapMinutes || Infinity;
  
  // Белок в первые 2ч
  const proteinInWindow = mealsAfter
    .filter(m => m.gapMinutes <= 120)
    .reduce((sum, m) => sum + m.protein, 0);
  checks.push({
    id: 'protein',
    target: 25,
    actual: proteinInWindow,
    status: proteinInWindow >= 20 ? 'done' : proteinInWindow >= 10 ? 'partial' : 'missing',
    icon: '🥛'
  });
  
  // Углеводы для гликогена
  const carbsInWindow = mealsAfter
    .filter(m => m.gapMinutes <= 60)
    .reduce((sum, m) => sum + m.carbs, 0);
  checks.push({
    id: 'carbs',
    target: 40,
    actual: carbsInWindow,
    status: carbsInWindow >= 30 ? 'done' : 'missing',
    icon: '🍚'
  });
  
  // Вода
  const waterTarget = 2000 + 500; // +500 после тренировки
  checks.push({
    id: 'water',
    target: waterTarget,
    actual: waterMl,
    status: waterMl >= waterTarget * 0.9 ? 'done' : waterMl >= waterTarget * 0.7 ? 'partial' : 'missing',
    icon: '💧'
  });
  
  return {
    checks,
    score: checks.filter(c => c.status === 'done').length / checks.length * 100,
    badge: score >= 80 ? '💯 Восстановление' : score >= 50 ? '⚠️ Частичное' : '❌ Нужно внимание'
  };
}
```

### 5.2 Training Readiness индикатор

Показывать готовность к тренировке перед добавлением:

```javascript
// При открытии формы добавления тренировки
Training Readiness: [████████░░] 82%
✅ Углеводы 2ч назад (овсянка 45г)
✅ Сон 7.5ч / 8ч
⚠️ Вода 58% (1160мл / 2000мл)
⬜ Кофеин не обнаружен

Рекомендация: Выпейте 200мл воды перед тренировкой
```

**Реализация**:
```javascript
function getTrainingReadiness(meals, sleep, waterMl, currentHour) {
  const factors = [];
  
  // Последний приём с углеводами
  const lastCarbMeal = meals.reverse().find(m => m.carbs > 20);
  const carbGap = lastCarbMeal ? currentHour - parseHour(lastCarbMeal.time) : Infinity;
  factors.push({
    id: 'carbs',
    status: carbGap >= 1 && carbGap <= 3 ? 'optimal' : carbGap > 3 ? 'low' : 'digesting',
    value: carbGap,
    icon: '🍞'
  });
  
  // Сон
  factors.push({
    id: 'sleep',
    status: sleep >= 7 ? 'good' : sleep >= 6 ? 'ok' : 'poor',
    value: sleep,
    icon: '😴'
  });
  
  // Гидратация
  const waterPct = waterMl / 2000;
  factors.push({
    id: 'water',
    status: waterPct >= 0.7 ? 'good' : waterPct >= 0.5 ? 'ok' : 'poor',
    value: waterPct,
    icon: '💧'
  });
  
  const score = factors.filter(f => f.status === 'good' || f.status === 'optimal').length / factors.length;
  return { factors, score: Math.round(score * 100) };
}
```

### 5.3 Умная подсказка при добавлении еды

Если была тренировка и пользователь добавляет еду — показать контекст:

```javascript
// Toast или inline-подсказка
🎯 Тренировка была 45 мин назад!
Это идеальное время для восстановления.
Рекомендуем:
• Белок 20-30г (творог, курица, яйца)
• Углеводы для гликогена (рис, овсянка)

[+ Творог 5%]  [+ Куриная грудка]  [Понятно]
```

### 5.4 Анимация "💪 Анаболизм"

При добавлении белка после силовой:
- Пульсирующая анимация 💪
- Floating text "+1 к восстановлению"
- Subtle haptic feedback (если поддерживается)

```css
@keyframes anabolism-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}

.anabolism-badge {
  animation: anabolism-pulse 0.6s ease-in-out 2;
}
```

### 5.5 Training Fuel Calculator 🆕

**Перед тренировкой**: калькулятор "сколько съесть" на основе планируемой активности.

```javascript
// При добавлении тренировки — показать рекомендацию "за сколько поесть"
function getPreWorkoutFuelAdvice(trainingType, estimatedKcal, currentMeals) {
  const lastMeal = currentMeals[currentMeals.length - 1];
  const lastMealTime = lastMeal ? parseHour(lastMeal.time) : null;
  const lastMealKcal = lastMeal ? mealKcal(lastMeal) : 0;
  
  // Рекомендация по времени еды до тренировки
  const recommendations = {
    light: { minGap: 30, maxGap: 60, idealCarbs: 20 },    // Йога, прогулка
    moderate: { minGap: 60, maxGap: 120, idealCarbs: 40 }, // Кардио, хобби
    intense: { minGap: 90, maxGap: 180, idealCarbs: 60 }   // Силовая, HIIT
  };
  
  const intensity = estimatedKcal > 600 ? 'intense' : estimatedKcal > 300 ? 'moderate' : 'light';
  const rec = recommendations[intensity];
  
  return {
    text: `До ${trainingType}: рекомендуем ${rec.idealCarbs}г углеводов за ${rec.minGap}-${rec.maxGap} мин`,
    carbs: rec.idealCarbs,
    protein: intensity === 'intense' ? 15 : 10,
    suggestions: ['Банан', 'Овсянка', 'Тост с мёдом']
  };
}
```

**UI пример**:
```
🏋️ Планируется силовая (~450 ккал)

Рекомендация ДО тренировки:
├─ Углеводы: 40-60г за 90-180 мин до
├─ Белок: 15г
└─ Вода: +300мл

Подходящие продукты:
[🍌 Банан]  [🥣 Овсянка]  [🍞 Тост с мёдом]
```

### 5.6 Recovery Timeline 🆕

**После тренировки**: временная шкала оптимальных окон восстановления.

```javascript
function getRecoveryTimeline(trainingEndTime, trainingKcal, trainingType) {
  const endHour = parseHour(trainingEndTime);
  
  return {
    phases: [
      {
        name: 'Анаболическое окно',
        start: 0,
        end: 30,
        icon: '⚡',
        priority: 'critical',
        advice: 'Быстрые углеводы + BCAA/белок',
        color: '#10b981' // emerald
      },
      {
        name: 'Оптимальное восстановление',
        start: 30,
        end: 120,
        icon: '🔄',
        priority: 'high',
        advice: 'Полноценный приём: белок 30г + углеводы',
        color: '#22c55e' // green
      },
      {
        name: 'Допустимое окно',
        start: 120,
        end: getMaxRecoveryGap(trainingKcal), // 120 + (kcal/500)*60
        icon: '✓',
        priority: 'medium',
        advice: 'Сбалансированное питание',
        color: '#eab308' // yellow
      }
    ],
    currentPhase: null, // Заполняется при проверке
    nextPhaseIn: null   // Минут до следующей фазы
  };
}
```

**UI пример** (визуальная timeline):
```
🏋️ Силовая закончилась в 18:00 (650 ккал)

────────────────────────────────────
⚡ 18:00-18:30  │  🔄 18:30-20:00  │  ✓ 20:00-21:18
  Анаболич.    │    Оптимально   │    Допустимо
────────────────────────────────────
                    ▲ сейчас (19:15)

✅ Ты в оптимальном окне!
   Рекомендуем белок 30г + углеводы
   До закрытия окна: 45 мин
```

### 5.7 Adaptive Night Override Badge 🆕

Специальный бейдж когда ночной штраф отменён из-за тренировки:

```javascript
// Если еда поздняя (22:00+), но была тренировка — показать объяснение
function getNightOverrideBadge(mealTime, trainingContext) {
  if (parseHour(mealTime) < 22) return null;
  if (!trainingContext?.nightPenaltyOverride) return null;
  
  return {
    badge: '🌙💪',
    title: 'Тренировка оправдывает поздний ужин',
    details: [
      'Ночной штраф отменён',
      `Тренировка: ${trainingContext.trainingKcal} ккал`,
      'Мышцам нужно восстановление'
    ],
    color: '#10b981' // Позитивный зелёный вместо красного
  };
}
```

### 5.8 Metabolic State Indicator 🆕

Визуальный индикатор текущего состояния метаболизма — одна иконка показывает "режим работы" организма:

```javascript
function getMetabolicState(currentHour, lastMealTime, lastTrainingEnd, insulinWaveEnd) {
  const now = currentHour * 60;
  const lastMealMin = lastMealTime ? parseHour(lastMealTime) * 60 : null;
  const trainingEnd = lastTrainingEnd ? parseHour(lastTrainingEnd) * 60 : null;
  
  // Приоритет состояний:
  
  // 1. Анаболизм — 0-2ч после тренировки И поел
  if (trainingEnd && now - trainingEnd < 120 && lastMealMin && now - lastMealMin < 60) {
    return {
      state: 'anabolic',
      icon: '⚡',
      label: 'Анаболизм',
      desc: 'Мышцы восстанавливаются и растут',
      color: '#10b981' // emerald
    };
  }
  
  // 2. Инсулиновая волна активна
  if (insulinWaveEnd && now < insulinWaveEnd) {
    return {
      state: 'storing',
      icon: '🔋',
      label: 'Накопление',
      desc: 'Энергия распределяется по телу',
      color: '#eab308' // yellow
    };
  }
  
  // 3. Липолиз — нет активной волны
  if (!insulinWaveEnd || now >= insulinWaveEnd) {
    return {
      state: 'lipolysis',
      icon: '🔥',
      label: 'Жиросжигание',
      desc: 'Организм использует жиры как топливо',
      color: '#ef4444' // red (positive here!)
    };
  }
  
  // 4. Ночной покой
  if (currentHour >= 23 || currentHour < 6) {
    return {
      state: 'rest',
      icon: '😴',
      label: 'Восстановление',
      desc: 'Базальный метаболизм',
      color: '#6366f1' // indigo
    };
  }
  
  return { state: 'normal', icon: '⚙️', label: 'Норма', color: '#94a3b8' };
}
```

**UI**:
```
┌────────────────────────────────┐
│  🔥 Жиросжигание               │
│  Волна закончилась 15 мин назад │
└────────────────────────────────┘
```

### 5.9 Training Sync Score 🆕

Оценка синхронизации еды и тренировок за день (0-100):

```javascript
function getTrainingSyncScore(meals, trainings, day) {
  if (!trainings?.length) return null;
  
  const factors = [];
  
  for (const training of trainings) {
    const interval = getTrainingInterval(training);
    const trainingKcal = trainK(training);
    
    // 1. Была ли еда перед тренировкой (60-120 мин до)?
    const preMeal = meals.find(m => {
      const mealMin = parseHour(m.time) * 60;
      const gap = interval.startMin - mealMin;
      return gap >= 60 && gap <= 120;
    });
    factors.push({
      id: 'pre_meal',
      status: preMeal ? 'good' : 'missing',
      weight: 25
    });
    
    // 2. Была ли еда после тренировки (0-120 мин после)?
    const postMeal = meals.find(m => {
      const mealMin = parseHour(m.time) * 60;
      const gap = mealMin - interval.endMin;
      return gap >= 0 && gap <= 120;
    });
    factors.push({
      id: 'post_meal',
      status: postMeal ? 'good' : 'missing',
      weight: 30
    });
    
    // 3. Достаточно белка после тренировки?
    if (postMeal) {
      const postMealProtein = getMealProtein(postMeal);
      factors.push({
        id: 'post_protein',
        status: postMealProtein >= 25 ? 'good' : postMealProtein >= 15 ? 'ok' : 'low',
        weight: 25
      });
    }
    
    // 4. Не было ли переедания перед тренировкой?
    if (preMeal) {
      const preMealKcal = getMealKcal(preMeal);
      factors.push({
        id: 'pre_not_heavy',
        status: preMealKcal < 400 ? 'good' : preMealKcal < 600 ? 'ok' : 'heavy',
        weight: 20
      });
    }
  }
  
  const score = factors.reduce((sum, f) => {
    const statusScore = { good: 1, ok: 0.6, missing: 0, low: 0.3, heavy: 0.3 };
    return sum + (statusScore[f.status] || 0) * f.weight;
  }, 0) / factors.reduce((sum, f) => sum + f.weight, 0);
  
  return {
    score: Math.round(score * 100),
    factors,
    stars: score >= 0.8 ? 5 : score >= 0.6 ? 4 : score >= 0.4 ? 3 : score >= 0.2 ? 2 : 1
  };
}
```

**UI**:
```
Sync Score: ⭐⭐⭐⭐☆ (85%)
✅ Углеводы за 90 мин до тренировки
✅ Белок 28г в течение часа после
⚠️ Приём перед тренировкой тяжеловат (520 ккал)
```

### 5.10 Fuel Gauge (топливный индикатор) 🆕

Показывает "запас топлива" перед тренировкой на основе последних приёмов:

```javascript
function getFuelGauge(meals, currentHour, plannedTrainingKcal = 400) {
  // Анализируем углеводы за последние 4 часа
  const recentCarbs = meals
    .filter(m => {
      const mealHour = parseHour(m.time);
      return currentHour - mealHour <= 4 && currentHour - mealHour >= 0;
    })
    .reduce((sum, m) => sum + getMealCarbs(m), 0);
  
  // Примерный расчёт:
  // 1г углеводов = ~4 ккал = ~4 минуты умеренной активности
  // Для 400 ккал тренировки нужно ~100г углеводов (но не всё сразу)
  const idealCarbs = plannedTrainingKcal / 4 * 0.5; // 50% от расхода
  const fuelLevel = Math.min(100, (recentCarbs / idealCarbs) * 100);
  
  // Время с последнего приёма
  const lastMeal = meals[meals.length - 1];
  const lastMealGap = lastMeal ? currentHour - parseHour(lastMeal.time) : Infinity;
  
  // Оптимально: 60-120 мин после еды
  const timingOk = lastMealGap >= 1 && lastMealGap <= 2;
  
  return {
    level: Math.round(fuelLevel),
    icon: fuelLevel >= 70 ? '⛽' : fuelLevel >= 40 ? '🔶' : '⚠️',
    status: fuelLevel >= 70 ? 'ready' : fuelLevel >= 40 ? 'ok' : 'low',
    timingOk,
    recommendation: fuelLevel < 40 
      ? `Рекомендуем 20-30г углеводов за 30-60 мин до тренировки`
      : fuelLevel >= 100 
        ? 'Топлива достаточно! Можно начинать'
        : 'Запас в норме',
    durationEstimate: `Достаточно для ~${Math.round(recentCarbs * 4)} мин активности`
  };
}
```

**UI** (показывать при добавлении тренировки или в карточке планируемой тренировки):
```
⛽ Топливо: [████████░░] 78%
   Последний приём: 1.5ч назад (45г углеводов)
   
💡 Достаточно для ~60 мин кардио
   Рекомендация: Можно начинать!
```

### 5.11 Adaptive Coaching — AI-подсказки на основе паттернов 🆕

После накопления данных за 14+ дней — персональные инсайты:

```javascript
function getAdaptiveCoachingTip(historyDays, trainings) {
  if (historyDays.length < 14) return null;
  
  const patterns = analyzeTrainingNutritionPatterns(historyDays, trainings);
  
  // Паттерн 1: Недостаток белка после тренировок
  if (patterns.avgPostWorkoutProtein < 25) {
    return {
      type: 'protein_deficit',
      icon: '🤖',
      title: 'Заметил паттерн',
      text: `После тренировок ты в среднем съедаешь ${patterns.avgPostWorkoutProtein}г белка. 
             Для восстановления рекомендую 25-35г.`,
      suggestion: {
        product: 'Творог 5%',
        grams: 150,
        reason: '+27г белка в окне восстановления'
      },
      cta: '[Добавить в следующий приём]'
    };
  }
  
  // Паттерн 2: Пропуск углеводов перед тренировкой
  if (patterns.preWorkoutCarbsSkipRate > 0.5) {
    return {
      type: 'carbs_timing',
      icon: '🤖',
      title: 'Топливная оптимизация',
      text: `В ${Math.round(patterns.preWorkoutCarbsSkipRate * 100)}% случаев ты тренируешься без углеводов за 1-2ч до.
             Это может снижать интенсивность.`,
      suggestion: { product: 'Банан', grams: 120 },
      cta: '[Запланировать перекус]'
    };
  }
  
  // Паттерн 3: Отличная синхронизация!
  if (patterns.avgSyncScore >= 80) {
    return {
      type: 'great_sync',
      icon: '🏆',
      title: 'Ты молодец!',
      text: `Твоя синхронизация питания и тренировок — ${patterns.avgSyncScore}/100!
             Это лучше чем у 85% пользователей.`,
      cta: null
    };
  }
  
  return null;
}

function analyzeTrainingNutritionPatterns(days, trainings) {
  // Анализ паттернов за 14+ дней
  const trainingDays = days.filter(d => d.trainings?.length > 0);
  
  // Средний белок после тренировки
  let totalPostProtein = 0, postMealCount = 0;
  // ... логика анализа ...
  
  return {
    avgPostWorkoutProtein: totalPostProtein / postMealCount || 0,
    preWorkoutCarbsSkipRate: 0.3, // Доля тренировок без углеводов до
    avgSyncScore: 75
  };
}
```

**UI**:
```
┌─────────────────────────────────────────┐
│ 🤖 Заметил паттерн                      │
│                                         │
│ После тренировок ты в среднем съедаешь  │
│ 18г белка. Для восстановления           │
│ рекомендую 25-35г.                      │
│                                         │
│ 💡 Совет: Творог 150г = +27г белка      │
│                                         │
│ [Добавить в следующий приём]  [Понятно] │
└─────────────────────────────────────────┘
```

### 5.12 Weekly Training Challenges 🆕

Челленджи на неделю для вовлечения:

```javascript
const WEEKLY_CHALLENGES = [
  {
    id: 'zone2_tuesday',
    name: 'Zone 2 Tuesday',
    icon: '🏃',
    description: '30+ минут в зоне жиросжигания по вторникам',
    condition: (day) => {
      const dayOfWeek = new Date(day.date).getDay();
      if (dayOfWeek !== 2) return null; // Только вторник
      const zone2Min = day.trainings?.reduce((sum, t) => sum + (t.z?.[1] || 0), 0) || 0;
      return zone2Min >= 30;
    },
    duration: 4, // недели
    reward: { badge: '🎖️', title: 'Мастер Zone 2' }
  },
  {
    id: 'protein_timing',
    name: 'Protein Window Pro',
    icon: '💪',
    description: 'Белок 25+г в течение часа после каждой тренировки',
    condition: (day, meals) => {
      // Проверить что после каждой тренировки был белок
      return day.trainings?.every(t => {
        const postMeal = findPostWorkoutMeal(t, meals, 60);
        return postMeal && getMealProtein(postMeal) >= 25;
      });
    },
    duration: 2,
    reward: { badge: '🥇', title: 'Анаболический мастер' }
  },
  {
    id: 'sync_master',
    name: 'Sync Master',
    icon: '⚡',
    description: 'Training Sync Score 80+ каждый день с тренировкой',
    condition: (day) => day.trainingSyncScore >= 80,
    duration: 1,
    reward: { badge: '⭐', title: 'Мастер синхронизации' }
  }
];

function getActiveChallenge(userId) {
  // Логика выбора/ротации челленджей
}

function getChallengeProgress(challenge, days) {
  const successDays = days.filter(d => challenge.condition(d, d.meals));
  return {
    current: successDays.length,
    target: challenge.duration,
    progress: successDays.length / challenge.duration,
    completed: successDays.length >= challenge.duration
  };
}
```

**UI**:
```
🎯 Челлендж недели: "Zone 2 Tuesday"
   30+ минут в зоне жиросжигания по вторникам
   
   Прогресс: [✅ ✅ ⬜ ⬜] 2/4 недели
   
   🎖️ Награда: Бейдж "Мастер Zone 2"
```

### 5.13 Perfect Day Constructor 🆕

На основе истории показать "идеальный день" пользователя:

```javascript
function constructPerfectDay(historyDays) {
  // Найти лучшие дни (Meal Quality avg >= 80, Training Sync >= 80)
  const bestDays = historyDays
    .filter(d => d.avgMealQuality >= 80 && d.trainingSyncScore >= 80)
    .sort((a, b) => (b.avgMealQuality + b.trainingSyncScore) - (a.avgMealQuality + a.trainingSyncScore));
  
  if (bestDays.length < 3) return null; // Недостаточно данных
  
  // Анализируем паттерны лучших дней
  const analysis = {
    avgWakeTime: average(bestDays.map(d => parseHour(d.sleepEnd))),
    avgFirstMealTime: average(bestDays.map(d => parseHour(d.meals[0]?.time))),
    avgTrainingTime: average(bestDays.map(d => parseHour(d.trainings[0]?.time))),
    avgMealCount: average(bestDays.map(d => d.meals.length)),
    topBreakfastProducts: findTopProducts(bestDays, 'breakfast'),
    topPostWorkoutProducts: findTopProducts(bestDays, 'postWorkout'),
  };
  
  return {
    title: 'Твой идеальный день',
    subtitle: 'На основе твоих лучших дней',
    schedule: [
      { time: formatTime(analysis.avgWakeTime), event: 'Подъём', icon: '⏰' },
      { 
        time: formatTime(analysis.avgFirstMealTime), 
        event: 'Завтрак', 
        icon: '🍳',
        details: `~${analysis.avgBreakfastKcal} ккал`,
        products: analysis.topBreakfastProducts.slice(0, 3)
      },
      { 
        time: formatTime(analysis.avgTrainingTime), 
        event: 'Тренировка', 
        icon: '🏋️',
        details: `${analysis.avgTrainingDuration} мин`
      },
      { 
        time: formatTime(analysis.avgTrainingTime + 0.5), 
        event: 'Восстановление', 
        icon: '🔄',
        details: 'Белок 25-35г',
        products: analysis.topPostWorkoutProducts.slice(0, 3)
      },
      // ... остальные приёмы
    ],
    cta: '[Сохранить как шаблон]'
  };
}
```

**UI**:
```
📅 Твой идеальный день
   На основе твоих лучших дней (15, 20, 28 ноября)

   07:00 — ⏰ Подъём
   07:30 — 🍳 Завтрак ~350 ккал
           Овсянка, банан, яйца
   09:00 — 🏋️ Тренировка 60 мин
   10:00 — 🔄 Восстановление
           Творог 150г, банан
   13:00 — 🍽️ Обед ~450 ккал
           ...

   [Сохранить как шаблон]  [Применить сегодня]
```

### 5.14 Smart Portion AI — автокоррекция порций после тренировки 🆕

AI предлагает скорректированные порции на основе потраченных калорий:

```javascript
function getSmartPortionSuggestion(product, activityContext, mealTime) {
  if (!activityContext) return null;
  
  const { type, trainingKcal, trainingType } = activityContext;
  const suggestions = [];
  
  // После силовой — увеличить белок
  if (type === 'post' && trainingType === 'strength') {
    if (product.protein100 > 15) {
      const targetProtein = 30 + (trainingKcal / 300); // 30-40г белка
      const suggestedGrams = Math.ceil(targetProtein / product.protein100 * 100);
      const defaultGrams = product.defaultPortion || 100;
      
      if (suggestedGrams > defaultGrams * 1.2) {
        suggestions.push({
          type: 'increase',
          original: defaultGrams,
          suggested: suggestedGrams,
          reason: `+${suggestedGrams - defaultGrams}г для восстановления мышц`,
          delta: `+${Math.round((suggestedGrams - defaultGrams) / defaultGrams * 100)}%`
        });
      }
    }
  }
  
  // После кардио — увеличить углеводы
  if (type === 'post' && trainingType === 'cardio') {
    if (product.carbs100 > 40) {
      const targetCarbs = trainingKcal / 10; // ~10ккал = 1г углеводов восполнения
      const suggestedGrams = Math.ceil(targetCarbs / product.carbs100 * 100);
      suggestions.push({
        type: 'increase',
        reason: `+${Math.round(targetCarbs)}г углеводов для гликогена`
      });
    }
  }
  
  // PERI-WORKOUT — предложить быстрые углеводы
  if (type === 'peri' && product.simple100 > 20) {
    suggestions.push({
      type: 'optimal',
      reason: '⚡ Идеально для энергии во время тренировки!'
    });
  }
  
  return suggestions.length > 0 ? suggestions : null;
}
```

**UI**:
```
┌─────────────────────────────────────────┐
│ 🤖 Smart Portion AI                     │
│                                         │
│ Обнаружена силовая тренировка 45 мин    │
│ назад! Рекомендуемые порции:            │
│                                         │
│ Творог 5%:  150г → 220г                 │
│             (+70г для восстановления)   │
│                                         │
│ Банан:      100г → 150г                 │
│             (+50г для гликогена)        │
│                                         │
│ [Применить рекомендации]    [Оставить]  │
└─────────────────────────────────────────┘
```

### 5.15 Recovery Heatmap — тепловая карта восстановления 🆕

Месячная heatmap показывающая качество восстановления после тренировок:

```javascript
function getRecoveryHeatmapData(days) {
  return days.map(day => {
    if (!day.trainings?.length) return { date: day.date, status: 'no_training' };
    
    // Анализ качества восстановления
    const recoveryScore = analyzeRecoveryQuality(day);
    
    return {
      date: day.date,
      status: recoveryScore >= 80 ? 'excellent' : 
              recoveryScore >= 60 ? 'good' :
              recoveryScore >= 40 ? 'partial' : 'missed',
      score: recoveryScore,
      details: {
        hadProteinInWindow: recoveryScore.proteinInWindow,
        proteinAmount: recoveryScore.proteinGrams,
        timeToFirstMeal: recoveryScore.minutesToFirstMeal,
        trainingKcal: day.trainings.reduce((s, t) => s + trainK(t), 0)
      }
    };
  });
}

function analyzeRecoveryQuality(day) {
  let score = 0;
  const trainings = day.trainings || [];
  const meals = day.meals || [];
  
  for (const training of trainings) {
    const interval = getTrainingInterval(training);
    
    // Поел в течение 2ч после?
    const postMeal = meals.find(m => {
      const mealMin = parseHour(m.time) * 60;
      return mealMin > interval.endMin && mealMin <= interval.endMin + 120;
    });
    
    if (postMeal) {
      score += 40; // Поел в окне
      
      const protein = getMealProtein(postMeal);
      if (protein >= 25) score += 30; // Достаточно белка
      else if (protein >= 15) score += 15;
      
      const carbs = getMealCarbs(postMeal);
      if (carbs >= 30) score += 20; // Достаточно углеводов
      else if (carbs >= 15) score += 10;
      
      // Бонус за быстрое восстановление
      const gap = parseHour(postMeal.time) * 60 - interval.endMin;
      if (gap <= 30) score += 10;
      else if (gap <= 60) score += 5;
    }
  }
  
  return Math.min(100, score);
}
```

**UI** (в статистике/отчётах):
```
🗓️ Качество восстановления — Декабрь 2025

Пн  Вт  Ср  Чт  Пт  Сб  Вс
                        🟢
🟢  ⬜  🟡  ⬜  🔴  🟢  ⬜
🟢  🟢  ⬜  🟡  ⬜  🟢  🟢
🟢  ⬜  🟢  🟢  🔴  ⬜  ...

Легенда:
🟢 Отлично (80+) — белок в окне
🟡 Частично (40-79) — поел, но мало белка
🔴 Пропустил (<40) — окно упущено
⬜ Нет тренировки

📊 Статистика месяца:
• Тренировок: 14
• Отличное восстановление: 9 (64%)
• Пропущено окон: 2 (14%)
```

### 5.16 Training Twins — найди близнеца по тренировкам 🆕

Система находит пользователей с похожим режимом и показывает их успешные паттерны:

```javascript
function findTrainingTwins(userId, userProfile) {
  // Анализ паттернов пользователя
  const userPatterns = {
    avgTrainingsPerWeek: calculateAvgTrainings(userId, 28),
    preferredTrainingTime: getPreferredTrainingTime(userId),
    mainTrainingType: getMostFrequentType(userId),
    avgTrainingDuration: getAvgDuration(userId),
    weightGoal: userProfile.weightGoal > userProfile.weight ? 'bulk' : 'cut'
  };
  
  // Поиск похожих пользователей (анонимно)
  const twins = findSimilarUsers(userPatterns, {
    trainingsPerWeekTolerance: 1,
    timeTolerance: 2, // часа
    sameGoal: true
  });
  
  // Агрегация успешных паттернов близнецов
  const twinInsights = aggregateSuccessPatterns(twins);
  
  return {
    matchCount: twins.length,
    topInsights: [
      {
        type: 'post_workout_meal',
        insight: `${twinInsights.postWorkoutProteinAvg}г белка после тренировки`,
        yourValue: userPatterns.postWorkoutProteinAvg,
        recommendation: twinInsights.postWorkoutProteinAvg > userPatterns.postWorkoutProteinAvg
          ? `Попробуй увеличить до ${twinInsights.postWorkoutProteinAvg}г`
          : 'Ты уже в топе! 💪'
      },
      {
        type: 'meal_timing',
        insight: `Едят через ${twinInsights.avgMinutesToPostMeal} мин после тренировки`,
        yourValue: userPatterns.avgMinutesToPostMeal
      },
      {
        type: 'favorite_products',
        insight: 'Топ продукты после тренировки',
        products: twinInsights.topPostWorkoutProducts.slice(0, 5)
      }
    ]
  };
}
```

**UI**:
```
┌─────────────────────────────────────────┐
│ 👥 Training Twins                       │
│ Найдено 47 пользователей с похожим      │
│ режимом тренировок                      │
│                                         │
│ 💡 Инсайты от твоих "близнецов":        │
│                                         │
│ Белок после тренировки:                 │
│ Они: 32г | Ты: 24г                      │
│ → Попробуй увеличить до 30г             │
│                                         │
│ Время до первого приёма:                │
│ Они: 35 мин | Ты: 65 мин                │
│ → Ешь быстрее после тренировки!         │
│                                         │
│ 🏆 Топ продукты близнецов:              │
│ 1. Творог 5% (78%)                      │
│ 2. Банан (65%)                          │
│ 3. Протеин (52%)                        │
│                                         │
│ [Попробовать их рацион]                 │
└─────────────────────────────────────────┘
```

### 5.17 Fitness Apps Integration — интеграция с фитнес-приложениями 🆕

**Killer-фича для спортсменов!**

```javascript
// Поддерживаемые платформы
const SUPPORTED_INTEGRATIONS = {
  appleHealth: {
    name: 'Apple Health',
    icon: '🍎',
    dataTypes: ['workouts', 'heartRate', 'steps', 'activeEnergy'],
    authMethod: 'HealthKit'
  },
  googleFit: {
    name: 'Google Fit',
    icon: '🏃',
    dataTypes: ['workouts', 'steps', 'calories'],
    authMethod: 'OAuth2'
  },
  strava: {
    name: 'Strava',
    icon: '🚴',
    dataTypes: ['activities', 'heartRateZones', 'calories'],
    authMethod: 'OAuth2',
    webhookSupport: true // Real-time синхронизация!
  },
  garmin: {
    name: 'Garmin Connect',
    icon: '⌚',
    dataTypes: ['activities', 'heartRateZones', 'trainingEffect'],
    authMethod: 'OAuth1'
  },
  polarFlow: {
    name: 'Polar Flow',
    icon: '❄️',
    dataTypes: ['activities', 'heartRateZones', 'recoveryStatus'],
    authMethod: 'OAuth2'
  }
};

// Автоимпорт тренировки
async function importWorkoutFromFitnessApp(platform, activityId) {
  const rawData = await fetchFromPlatform(platform, activityId);
  
  return {
    time: formatTime(rawData.startTime),
    type: mapActivityType(rawData.type), // 'cardio' | 'strength' | 'hobby'
    z: convertHeartRateToZones(rawData.heartRateData, userMaxHR),
    source: platform,
    sourceId: activityId,
    // Дополнительные данные
    _meta: {
      avgHeartRate: rawData.avgHR,
      maxHeartRate: rawData.maxHR,
      calories: rawData.calories,
      distance: rawData.distance,
      elevationGain: rawData.elevation
    }
  };
}

// Strava Webhook — real-time синхронизация
async function handleStravaWebhook(event) {
  if (event.object_type === 'activity' && event.aspect_type === 'create') {
    const activity = await strava.getActivity(event.object_id);
    const training = await importWorkoutFromFitnessApp('strava', activity);
    
    // Автоматически добавить в текущий день
    await addTrainingToDay(training);
    
    // Показать уведомление
    showNotification({
      title: '🚴 Тренировка импортирована!',
      body: `${activity.name} — ${activity.elapsed_time}мин, ${activity.calories}ккал`,
      action: 'Добавить приём восстановления'
    });
  }
}
```

**UI настроек интеграции**:
```
⚙️ Фитнес-интеграции

🍎 Apple Health          [Подключено ✅]
   Синхронизация: тренировки, шаги
   Последний sync: 5 мин назад

🚴 Strava                [Подключить]
   Real-time синхронизация тренировок
   
⌚ Garmin Connect        [Подключить]
   Точные пульсовые зоны
   
🏃 Google Fit            [Подключить]
   Шаги и активность

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Статистика синхронизации:
• Импортировано тренировок: 23
• Автоматических: 18 (78%)
• Средняя точность зон: 94%
```

### 5.18 Voice Commands для тренировок 🆕

Голосовые команды для быстрого ввода:

```javascript
const VOICE_COMMANDS = {
  // Завершение тренировки
  patterns: [
    /(?:окей|привет|хей)\s*heys?\s*(?:я\s*)?(?:закончил|завершил)\s*тренировку/i,
    /(?:окей|привет|хей)\s*heys?\s*тренировка\s*(?:окончена|завершена)/i
  ],
  
  handlers: {
    'end_training': async (speech) => {
      // Найти активную тренировку или создать новую
      const currentTraining = findActiveTraining() || await promptTrainingType();
      
      // Завершить и активировать POST-WORKOUT контекст
      await endTraining(currentTraining);
      
      // Установить напоминание
      scheduleReminder({
        delay: 30 * 60 * 1000, // 30 минут
        title: '🔄 Время восстановления!',
        body: 'Рекомендуем белок 25-30г + углеводы',
        action: 'open_add_meal'
      });
      
      return {
        response: 'Отлично! Тренировка завершена. Напомню поесть через 30 минут.',
        action: 'show_post_workout_suggestions'
      };
    },
    
    'start_training': async (speech) => {
      // Парсинг типа тренировки из речи
      const type = extractTrainingType(speech); // "силовую" → "strength"
      
      await startTraining({ type, startTime: new Date() });
      
      return {
        response: `Начинаю ${type} тренировку. Удачи! 💪`,
        action: 'show_fuel_gauge'
      };
    },
    
    'add_post_meal': async (speech) => {
      // "Окей HEYS, добавь творог после тренировки"
      const product = extractProduct(speech);
      const context = getCurrentActivityContext();
      
      if (context?.type === 'post') {
        const smartPortion = getSuggestedPortion(product, context);
        return {
          response: `Добавляю ${product.name} ${smartPortion}г. Отличный выбор для восстановления!`,
          action: 'add_product',
          params: { product, grams: smartPortion }
        };
      }
    }
  }
};

// Web Speech API интеграция
function initVoiceCommands() {
  if (!('webkitSpeechRecognition' in window)) return null;
  
  const recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.lang = 'ru-RU';
  
  recognition.onresult = (event) => {
    const transcript = event.results[event.results.length - 1][0].transcript;
    processVoiceCommand(transcript);
  };
  
  return recognition;
}
```

**UI активации**:
```
🎙️ Голосовые команды

[🎤 Включить микрофон]

Примеры команд:
• "Окей HEYS, я закончил тренировку"
• "Окей HEYS, начинаю силовую"
• "Окей HEYS, добавь творог после тренировки"
• "Окей HEYS, покажи окно восстановления"

Статус: Ожидание команды...
```

---

## 📚 Phase 6 — Обновление документации

### 6.1 Обновить DATA_MODEL_REFERENCE.md

После реализации обновить справочник `docs/DATA_MODEL_REFERENCE.md`:

**Добавить новую секцию "Training Context (Activity Context Module)":**

```markdown
## Training Context (Activity Context Module)

**Файл**: `heys_insulin_wave_v1.js` | **Версия**: 3.3.0 | **Контекстов**: 10

### Типы контекста тренировки

| ID | Название | Условие | Эффект на волну | Эффект на harm |
|----|----------|---------|-----------------|----------------|
| `peri` | PERI-WORKOUT | Еда ВО ВРЕМЯ тренировки | до -60% | ×0.5 |
| `post` | POST-WORKOUT | Еда 0-360мин ПОСЛЕ | до -40% | — |
| `pre` | PRE-WORKOUT | Еда 0-90мин ДО | до -20% | — |
| `steps` | STEPS | >10k шагов + ужин | -10% | — |
| `morning` | MORNING | Утр. тренировка (<12:00) | -5% весь день | — |
| `double` | DOUBLE DAY | 2+ тренировок | -10% весь день | — |
| `fasted` | FASTED | Тренировка натощак | POST ×1.3 | — |
| `cardio_simple` | CARDIO+SIMPLE | Кардио + сладкое | — | штраф ×0.5 |
| `strength_protein` | STRENGTH+PROTEIN | Силовая + белок ≥30г | — | harm −20% |
| `night_override` | NIGHT OVERRIDE | Поздний ужин после тренировки | ночной штраф отменён | — |

### Константы

\`\`\`javascript
const TRAINING_CONTEXT = {
  periWorkout: { maxBonus: -0.60, harmMultiplier: 0.5 },
  postWorkout: { baseGap: 120, kcalScaling: 60, maxGap: 360 },
  preWorkout: [{ maxGap: 45, waveBonus: -0.20 }, { maxGap: 90, waveBonus: -0.10 }],
  stepsBonus: { threshold: 10000, afterHour: 18, waveBonus: -0.10 },
  morningTraining: { beforeHour: 12, dayWaveBonus: -0.05 },
  doubleTraining: { minTrainings: 2, dayWaveBonus: -0.10 },
  fastedTraining: { minFastHours: 8, postWorkoutMultiplier: 1.3 },
  intensityMultiplier: { HIIT: 2.0, MODERATE: 1.5, LISS: 1.0 }
};
\`\`\`

### API

\`\`\`javascript
// Получить контекст для приёма пищи
const context = HEYS.InsulinWave.getTrainingContext({
  mealTimeMin, trainings, steps, allMeals, weight, mets
});

// Результат
context = {
  type: 'post',           // Тип контекста
  waveBonus: -0.35,       // Бонус к волне
  harmBonus: 0,           // Бонус к вредности
  badge: '🔄 Recovery',   // Бейдж для UI
  desc: 'Еда через 45 мин после тренировки',
  trainingKcal: 650,
  nightPenaltyOverride: true
};
\`\`\`
```

**Добавить в секцию "Инсулиновая волна":**
- Ссылку на Training Context
- Номер фактора #30 (Training Context)

**Обновить Changelog DATA_MODEL_REFERENCE.md:**
```markdown
| 3.7.0 | 2025-12-XX | **Training Context**: 10 контекстов активности, влияние на инсулиновую волну и harm |
```

### 6.2 Чеклист документации

- [ ] DATA_MODEL_REFERENCE.md — новая секция Training Context
- [ ] DATA_MODEL_REFERENCE.md — обновить секцию Инсулиновая волна (добавить фактор #30)
- [ ] DATA_MODEL_REFERENCE.md — Changelog
- [ ] README.md — если есть упоминание фич (опционально)
- [ ] copilot-instructions.md — если нужно обновить архитектуру (опционально)

---

## Changelog

| Версия | Дата | Изменения |
|--------|------|-----------|
| 3.3.0 | 2025-12-10 | **Интеграция**: Phase 0.13 (конфликт с факторами #16-17), 0.14 (waveHistory совместимость), 0.15 (Meal Quality Score бонус). **3 новых WOW**: Adaptive Coaching (AI-паттерны), Weekly Challenges, Perfect Day Constructor |
| 3.2.0 | 2025-12-10 | **Критический аудит**: Phase 0.10 (КОМБО-тренировки), 0.11 (HIIT vs LISS с EPOC), 0.12 (fallback без зон). **3 новых WOW**: Metabolic State Indicator, Training Sync Score, Fuel Gauge. **Phase 6**: обновление DATA_MODEL_REFERENCE.md |
| 3.1.0 | 2025-12-10 | **Глубокий аудит**: Phase 0.7 (Advice конфликты), 0.8 (Sanity checks — лимиты данных), 0.9 (UI план — max 2 бейджа). **3 новых WOW-фичи**: Training Fuel Calculator, Recovery Timeline, Night Override Badge |
| 3.0.0 | 2025-12-10 | **Production-ready**: Расширенный Phase 0 (6 блокеров с решениями), прогрессивное окно по kcal, выбор лучшей тренировки, WOW-фичи (Recovery Score, Training Readiness, умные подсказки) |
| 2.6.0 | 2025-12-10 | **6 новых бонусов**: nightPenaltyOverride, morningTraining, doubleTraining, fastedTraining, cardioSimpleCarbs, strengthProtein |
| 2.5.0 | 2025-12-10 | Финальный аудит: приоритет Peri>Post>Pre>Steps, Steps bonus |
| 2.0.0 | 2025-12-10 | Phase 0 с блокерами, временные диапазоны |
| 1.0.0 | 2025-12-10 | Первоначальная версия |
