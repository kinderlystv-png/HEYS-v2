# 🍞 Toast Improvements v2 — Дополнительные рекомендации

> **Цель**: Добавить оставшиеся умные рекомендации + финальная полировка модуля советов.

**✅ Статус**: advice-module.md ВЫПОЛНЕН (2025-11-29)  
**⬅️ Зависит от**: [2025-11-29-advice-module.md](./2025-11-29-advice-module.md) ✅

---

## ✅ ВЫПОЛНЕНО (Фаза -1 и 0) — 2025-11-29

| # | Задача | Статус |
|---|--------|--------|
| 1 | ~~`prof` не передаётся в adviceEngine~~ | ✅ Передан (строка 2421) |
| 2 | ~~macroTip с `waterGoal = 2000` hardcoded~~ | ✅ Удалён полностью |
| 3 | ~~`waterGoal` не передаётся в adviceEngine~~ | ✅ Передан |
| 4 | ~~Добавить `calculateAverageStress()`~~ | ✅ Добавлена (строка 78) |
| 5 | ~~Добавить `calculateAverageWellbeing()`~~ | ✅ Добавлена (строка 90) |

## 🟡 ЗАМЕЧАНИЯ (актуальные)

| # | Проблема | Решение |
|---|----------|---------|
| 1 | **`U.lsGet` недоступен напрямую в advice модуле** | Использовать `window.U` в задачах 12, 17, 18 |
| 2 | **`prof.sex` vs `prof.gender`** | Использовать `prof.sex === 'female'` в задаче 26 |

---

## 📌 Результаты аудита advice-module после реализации

> Аудит выполнен 2025-11-29 после полной реализации модуля советов

### ✅ Что сделано качественно

| Элемент | Статус |
|---------|--------|
| `heys_advice_v1.js` создан (757 строк) | ✅ |
| `currentStreak` передаётся как параметр | ✅ |
| `heysProductAdded` dispatch в addProductToMeal | ✅ |
| Swipe handlers сохранены | ✅ |
| uiState с 9 picker'ами | ✅ |
| CSS для expandable toast | ✅ |
| Session management (cooldown, max per session) | ✅ |
| getToneForHour (ночью silent) | ✅ |
| getEmotionalState (crashed, stressed, success) | ✅ |
| filterByEmotionalState | ✅ |
| Сброс при смене даты | ✅ |
| adviceExpanded collapse при picker | ✅ |
| Toast render (macroTip удалён) | ✅ |

### 🟡 Что осталось улучшить

1. ~~**`macroTip` useMemo НЕ удалён**~~ — ✅ УДАЛЁН (Фаза -1)

2. **`returning` emotional state не активен** — `lastVisitDaysAgo` hardcoded = 0. Для активации нужен localStorage ключ `heys_last_visit`. → **Задача 8**

3. **Нет `meal_opened` trigger** — Описан в промпте, но не реализован. → **Задача 9 (опционально)**

### 🟢 Всё критическое реализовано

- ✅ Ошибка `dayTot` initialization исправлена
- ✅ Ошибка `searchOpen` исправлена
- ✅ Swipe-to-dismiss работает
- ✅ Progress bar сохранён
- ✅ CSS типы не дублированы
- ✅ Toast ширина 80% (4/5 экрана) — `width: 80%; max-width: 400px;`

---

## 📋 Ключевые файлы

| Файл | Описание |
|------|----------|
| `apps/web/heys_advice_v1.js` | Модуль советов (757 строк) |
| `apps/web/heys_day_v12.js` | DayTab с интеграцией (строки 2406-2480) |
| `apps/web/styles/main.css` | Toast стили (строки 4850-5060) |

---

---

## 🎯 Задачи для реализации

### ~~Задача 4: Удалить старый macroTip useMemo~~ ✅ ВЫПОЛНЕНО

> macroTip с багом `waterGoal = 2000` полностью удалён из `heys_day_v12.js`

---

### Задача 5: Добавить сезонные рекомендации в advice модуль

**Где**: `apps/web/heys_advice_v1.js` в функции `generateAdvices()`

**Добавить после LIFESTYLE TIPS (priority: 51-70):**

```javascript
// ─────────────────────────────────────────────────────────
// ❄️ SEASONAL TIPS (priority: 60-65)
// ─────────────────────────────────────────────────────────

const month = new Date().getMonth();
// Зима: ноябрь (10), декабрь (11), январь (0), февраль (1), март (2)
if ((month >= 10 || month <= 2) && !sessionStorage.getItem('heys_winter_tip')) {
  advices.push({
    id: 'winter_vitamin_d',
    icon: '❄️',
    text: 'Зимой важен витамин D — рыба, яйца, грибы',
    type: 'tip',
    priority: 60,
    category: 'lifestyle',
    triggers: ['tab_open'],
    ttl: 5000,
    onShow: () => { try { sessionStorage.setItem('heys_winter_tip', '1'); } catch(e) {} }
  });
}
```

---

### Задача 6: Добавить проверку разнообразия рациона

**Где**: `apps/web/heys_advice_v1.js` в функции `generateAdvices()`

**Добавить в NUTRITION TIPS:**

```javascript
// Разнообразие рациона
const allItems = (day?.meals || []).flatMap(m => m.items || []);
const productNames = allItems.map(it => {
  const product = pIndex?.get(it.product_id);
  return (product?.name || it.name || '').toLowerCase().trim();
}).filter(Boolean);
const uniqueProducts = new Set(productNames).size;

if (productNames.length >= 5 && uniqueProducts < 3) {
  advices.push({
    id: 'variety_low',
    icon: '🌈',
    text: 'Разнообразь рацион — добавь другие продукты',
    type: 'tip',
    priority: 45,
    category: 'nutrition',
    triggers: ['product_added', 'tab_open'],
    ttl: 5000
  });
}
```

---

### Задача 7: После сладкого → белок

**Где**: `apps/web/heys_advice_v1.js` в функции `generateAdvices()`

**Добавить в TIMING TIPS:**

```javascript
// После сладкого нужен белок
const lastMeal = (day?.meals || []).slice(-1)[0];
if (lastMeal && lastMeal.items?.length > 0) {
  // Вычисляем простые углеводы в последнем приёме
  let lastMealSimple = 0, lastMealCarbs = 0, lastMealKcal = 0;
  for (const item of lastMeal.items) {
    const product = pIndex?.get(item.product_id);
    if (!product) continue;
    const grams = item.grams || 100;
    lastMealSimple += (product.simple100 || 0) * grams / 100;
    lastMealCarbs += ((product.simple100 || 0) + (product.complex100 || 0)) * grams / 100;
    lastMealKcal += (product.kcal100 || 0) * grams / 100;
  }
  const lastMealSimplePct = lastMealCarbs > 0 ? (lastMealSimple / lastMealCarbs) : 0;
  
  if (lastMealSimplePct > 0.6 && lastMealKcal > 100) {
    advices.push({
      id: 'after_sweet_protein',
      icon: '🥜',
      text: 'После сладкого добавь белок — орехи или творог',
      type: 'tip',
      priority: 55,
      category: 'nutrition',
      triggers: ['product_added'],
      ttl: 5000
    });
  }
}
```

---

### Задача 8: Активировать returning emotional state

**Зачем**: Показывать "Рады видеть!" если пользователь не заходил >3 дней

**Где**: 
1. `apps/web/heys_day_v12.js` — записывать дату последнего визита
2. `apps/web/heys_advice_v1.js` — читать и вычислять

**⚠️ ВАЖНО**: Порядок операций критичен!

**1. В heys_advice_v1.js изменить getEmotionalState (читаем ПЕРВЫМ):**
```javascript
// Вычисляем lastVisitDaysAgo — ЧИТАЕМ до записи!
let lastVisitDaysAgo = 0;
try {
  const lastVisit = localStorage.getItem('heys_last_visit');
  if (lastVisit) {
    const last = new Date(lastVisit);
    const now = new Date();
    lastVisitDaysAgo = Math.floor((now - last) / (1000 * 60 * 60 * 24));
  }
} catch(e) {}

// Вернулся после перерыва (>3 дней)
if (lastVisitDaysAgo > 3) return 'returning';
```

**2. В heys_day_v12.js добавить useEffect с задержкой (записываем ПОСЛЕ):**
```javascript
// Записываем дату последнего визита ПОСЛЕ рендера (чтобы advice успел прочитать)
React.useEffect(() => {
  const timer = setTimeout(() => {
    try {
      localStorage.setItem('heys_last_visit', new Date().toISOString().slice(0, 10));
    } catch(e) {}
  }, 3000); // Задержка 3 сек, чтобы advice успел прочитать старое значение
  return () => clearTimeout(timer);
}, []);
```

**Почему задержка**: Без неё advice прочитает уже обновлённую дату = lastVisitDaysAgo всегда 0.

---

### Задача 9: Добавить meal_opened trigger (опционально)

**Зачем**: Показывать советы при раскрытии приёма пищи

**Где**: `apps/web/heys_day_v12.js` — в обработчике раскрытия MealCard

**Примечание**: Низкий приоритет, пока достаточно `product_added` и `tab_open`

---

## ✅ Definition of Done

- [x] 🔴 ~~Удалить старый macroTip useMemo (Задача 4)~~ ✅
- [x] ~~Передать `prof` в adviceEngine~~ ✅
- [x] ~~Передать `waterGoal` в adviceEngine~~ ✅
- [x] ~~Добавить `calculateAverageStress()` и `calculateAverageWellbeing()`~~ ✅
- [x] Сезонные рекомендации в advice модуле (Задача 5) ✅
- [x] Разнообразие рациона в advice модуле (Задача 6) ✅
- [x] После сладкого → белок в advice модуле (Задача 7) ✅
- [x] `returning` emotional state работает (Задача 8) ✅
- [ ] Нет регрессий в существующих toast'ах
- [x] `pnpm type-check && pnpm build` проходят ✅

---

## 🧠 Продвинутые аналитические логики (v3)

> Глубокий анализ всех параметров DATA_MODEL_REFERENCE для восхитительных рекомендаций

---

## ✅ BLOCKER УСТРАНЁН: `prof` и `waterGoal` теперь передаются!

> Выполнено в Фазе 0 (2025-11-29)

**Текущий вызов adviceEngine** (heys_day_v12.js строка ~2415):
```javascript
const adviceResult = adviceEngine ? adviceEngine({
  dayTot, normAbs, optimum, day, pIndex, currentStreak,
  trigger: adviceTrigger, uiState,
  prof,      // ✅ Передаётся
  waterGoal  // ✅ Передаётся
}) : { primary: null, relevant: [], adviceCount: 0 };
```

**useAdviceEngine** (heys_advice_v1.js строка ~683):
```javascript
const { dayTot, normAbs, optimum, day, pIndex, currentStreak, trigger, uiState, prof, waterGoal } = params;
```

**ctx содержит** (строка ~717):
```javascript
prof: prof || {},
waterGoal: waterGoal || 2000
```

---

### 🟡 ВАЖНО: Несоответствие имён полей

| В промпте | В коде | Правильно |
|-----------|--------|-----------|
| `prof.gender` = `'Женской'` | `prof.sex` = `'female'` | **Использовать `prof.sex`** |
| `prof?.weight` | Уже есть `prof.weight` | ✅ OK |
| `prof?.age` | Уже есть `prof.age` | ✅ OK |
| `prof?.sleepHours` | Есть в profile | ✅ OK |
| `prof?.insulinWaveHours` | Есть в profile | ✅ OK |

**Исправить в задаче 26**: `prof.sex === 'female'` вместо `prof.gender === 'Женской'`

---

### 🟡 ВАЖНО: Уже реализовано в heys_day_v12.js

1. **`waterGoal`** — уже вычисляется динамически в `waterGoalBreakdown` (строки 951-1001)
   - Учитывает: вес, возраст, пол, шаги, тренировки, сезон
   - **Задача 13**: Использовать существующий `waterGoal` вместо `(prof?.weight || 70) * 30`

2. **`waterLastDrink`** — уже есть логика в строках 1015-1040
   - **Задача 13**: Переиспользовать существующую логику

---

### 🟡 ВАЖНО: U.lsGet vs localStorage

**В промпте используется**: `localStorage.getItem('heys_last_visit')`

**Правильно**: Для глобальных ключей (без clientId) — `localStorage` OK
**Для ключей с данными клиента**: Использовать `U.lsGet(key, default)`

---

### 🟡 ВАЖНО: Конфликты с существующими советами

Новые задачи могут конфликтовать с уже реализованными:

| Новая задача | Существующий совет | Решение |
|--------------|-------------------|---------|
| Задача 10 (сон+переедание) | `sleep_low` (строка 572) | Объединить в один совет или добавить `&& !showed sleep_low` |
| Задача 14 (post-workout) | `post_training_protein` (строка 514) | Расширить существующий, не создавать новый |
| Задача 22 (ГИ) | Нет прямого конфликта | OK |
| Задача 24 (жиры) | `good_fat_low` (строка 500) | Расширить существующий |

**Рекомендация**: Перед добавлением нового совета проверить, нет ли похожего в `generateAdvices()`.

---

### 🟢 Проверено и OK

- ✅ `dayTot.prot` (не `protein`) — правильно используется
- ✅ `normAbs.*` — все ключи соответствуют
- ✅ `day.sleepStart`, `day.sleepEnd` — соответствуют
- ✅ `day.meals[].mood`, `day.meals[].stress`, `day.meals[].wellbeing` — соответствуют
- ✅ `day.trainings[].z` — массив из 4 элементов (зоны)
- ✅ `calculateSleepHours(day)` — уже есть в advice модуле
- ✅ `prof` определён в начале DayTab (строка 140), в scope при вызове adviceEngine

---

### ✅ Зависимости: вспомогательные функции ДОБАВЛЕНЫ

> Выполнено в Фазе 0 (2025-11-29)

**heys_advice_v1.js**:
- `calculateAverageStress(day)` — строка 78
- `calculateAverageWellbeing(day)` — строка 90
- Экспортированы в строках 795-796

---

### 📊 Категория: Корреляции и паттерны

#### Задача 10: Связь сна и переедания

**Инсайт**: Недосып повышает грелин (гормон голода) на 15-30%. Если мало спал → аппетит выше.

**Использует**: `prof.sleepHours` ✅ (передаётся в ctx)

**Логика**:
```javascript
const sleepHours = calculateSleepHours(day);
const sleepNorm = prof?.sleepHours || 8;
const sleepDeficit = sleepNorm - sleepHours;

// Недосып + переедание = объяснить связь
if (sleepDeficit > 2 && kcalPct > 1.15) {
  advices.push({
    id: 'sleep_hunger_correlation',
    icon: '🧠',
    text: `Недосып ${sleepDeficit.toFixed(1)}ч повышает аппетит — это нормально`,
    type: 'insight',
    priority: 20,
    category: 'correlation',
    triggers: ['product_added', 'tab_open'],
    ttl: 6000
  });
}

// Недосып утром — предупредить о повышенном аппетите
if (sleepDeficit > 1.5 && hour < 12 && kcalPct < 0.3) {
  advices.push({
    id: 'sleep_hunger_warning',
    icon: '⚡',
    text: 'После недосыпа аппетит выше — планируй сытный обед',
    type: 'tip',
    priority: 25,
    category: 'correlation',
    triggers: ['tab_open'],
    ttl: 5000
  });
}
```

---

#### Задача 11: Стресс → простые углеводы

**Инсайт**: При стрессе тянет на сладкое (кортизол требует быстрой энергии).

**Требует**: Добавить `calculateAverageStress()` — см. секцию "Зависимости" выше!

**Логика**:
```javascript
const avgStress = calculateAverageStress(day); // ← Добавить функцию!

// Высокий стресс + много сладкого = понять паттерн
if (avgStress >= 4 && simplePct > 1.2) {
  advices.push({
    id: 'stress_sweet_pattern',
    icon: '💡',
    text: 'Стресс → сладкое — попробуй орехи или тёмный шоколад',
    type: 'insight',
    priority: 22,
    category: 'correlation',
    triggers: ['product_added'],
    ttl: 6000
  });
}

// Низкий стресс + хороший баланс = похвалить
if (avgStress > 0 && avgStress <= 2 && kcalPct >= 0.9 && kcalPct <= 1.1) {
  advices.push({
    id: 'low_stress_balance',
    icon: '☮️',
    text: 'Спокойный день = легче держать баланс. Замечаешь?',
    type: 'insight',
    priority: 40,
    category: 'correlation',
    triggers: ['tab_open'],
    ttl: 5000
  });
}
```

**Добавить функцию calculateAverageStress:**
```javascript
function calculateAverageStress(day) {
  const meals = day?.meals || [];
  const stresses = meals.map(m => m.stress).filter(s => s > 0);
  if (stresses.length === 0) return 0;
  return stresses.reduce((a, b) => a + b, 0) / stresses.length;
}
```

---

#### Задача 12: Динамика веса + дефицит

**Инсайт**: Анализ weightMorning за несколько дней + текущий дефицит.

**⚠️ ВАЖНО**: 
1. Используем `U.lsGet()` с правильным форматом ключа!
2. **U.lsGet НЕ доступен внутри advice модуля** — нужен `window.U.lsGet` или передать данные через params

**⚠️ АЛЬТЕРНАТИВА**: Вычислять weightTrend в DayTab и передавать в adviceEngine как параметр (более чистый подход)

**Логика**:
```javascript
// Получаем вес за последние 7 дней
// ⚠️ Используем window.U — U напрямую недоступен в advice модуле!
function getWeightTrend() {
  const weights = [];
  const U = window.U; // Важно!
  if (!U?.lsGet) return [];
  
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayData = U.lsGet('heys_dayv2_' + dateStr, {});
    if (dayData.weightMorning) weights.push(dayData.weightMorning);
  }
  return weights;
}

const weights = getWeightTrend();
if (weights.length >= 3) {
  const trend = weights[0] - weights[weights.length - 1]; // Положительный = набор
  
  // Набираешь вес, но держишь дефицит — терпение!
  if (trend > 0.5 && kcalPct < 1.0 && day?.deficitPct >= 10) {
    advices.push({
      id: 'weight_patience',
      icon: '⏳',
      text: 'Вес может колебаться — смотри на недельный тренд',
      type: 'insight',
      priority: 28,
      category: 'weight',
      triggers: ['tab_open'],
      ttl: 6000
    });
  }
  
  // Хороший прогресс!
  if (trend < -0.3 && kcalPct >= 0.85 && kcalPct <= 1.1) {
    advices.push({
      id: 'weight_progress',
      icon: '📉',
      text: `−${Math.abs(trend).toFixed(1)} кг за неделю — отличный темп!`,
      type: 'achievement',
      priority: 8,
      category: 'weight',
      triggers: ['tab_open'],
      ttl: 5000
    });
  }
}
```

---

### 💧 Категория: Гидратация

#### Задача 13: Умные напоминания о воде

**Используем**: `waterMl`, `lastWaterTime`

**⚠️ ВАЖНО**: В `heys_day_v12.js` уже есть `waterGoalBreakdown` (строки 951-1001) с динамическим расчётом нормы воды! Нужно передать `waterGoal` в advice модуль или переиспользовать логику.

**Вариант A — передать waterGoal в adviceEngine:**
```javascript
// В heys_day_v12.js
const adviceResult = adviceEngine ? adviceEngine({
  ...existingParams,
  waterGoal  // ← добавить
}) : ...;
```

**Вариант B — упрощённая формула в advice (менее точная):**
```javascript
// Используем упрощённую формулу: 30мл на кг
const waterNorm = (prof?.weight || 70) * 30;
```

**Рекомендация**: Вариант A — переиспользовать существующий расчёт

**Логика**:
```javascript
const waterMl = day?.waterMl || 0;
// Используем waterGoal из params или упрощённую формулу
const waterNorm = params.waterGoal || (prof?.weight || 70) * 30;
const waterPct = waterMl / waterNorm;

// Мало воды к вечеру
if (hour >= 18 && waterPct < 0.5) {
  advices.push({
    id: 'water_evening_low',
    icon: '💧',
    text: `Выпито ${waterMl}мл — добавь ещё ${Math.round(waterNorm * 0.7 - waterMl)}мл`,
    type: 'tip',
    priority: 42,
    category: 'hydration',
    triggers: ['tab_open'],
    ttl: 5000
  });
}

// Давно не пил — напомнить
const lastWater = day?.lastWaterTime ? new Date(day.lastWaterTime) : null;
const hoursSinceWater = lastWater ? (Date.now() - lastWater.getTime()) / (1000 * 60 * 60) : 99;

if (hoursSinceWater > 2 && hour >= 10 && hour <= 21) {
  advices.push({
    id: 'water_reminder',
    icon: '🚰',
    text: 'Уже 2+ часа без воды — выпей стакан',
    type: 'tip',
    priority: 44,
    category: 'hydration',
    triggers: ['tab_open', 'product_added'],
    ttl: 4000
  });
}

// Норма выполнена!
if (waterPct >= 1.0 && !sessionStorage.getItem('heys_water_done')) {
  advices.push({
    id: 'water_goal_reached',
    icon: '💦',
    text: `${waterMl}мл — дневная норма воды выполнена!`,
    type: 'achievement',
    priority: 6,
    category: 'hydration',
    triggers: ['tab_open'],
    ttl: 5000,
    onShow: () => { try { sessionStorage.setItem('heys_water_done', '1'); } catch(e) {} }
  });
}
```

---

### 🏃 Категория: Тренировки и восстановление

#### Задача 14: Персонализированные post-workout советы

**Используем**: `trainings[].z`, `trainings[].type`, пульсовые зоны

**Логика**:
```javascript
const trainings = day?.trainings || [];
const todayTraining = trainings.find(t => t.z && t.z.some(m => m > 0));

if (todayTraining) {
  const totalMinutes = todayTraining.z.reduce((a, b) => a + b, 0);
  const highIntensityMinutes = (todayTraining.z[2] || 0) + (todayTraining.z[3] || 0); // Зоны 3-4
  const isHardWorkout = highIntensityMinutes > 20;
  
  // Тяжёлая тренировка — нужно больше белка и углеводов
  if (isHardWorkout && proteinPct < 1.0) {
    advices.push({
      id: 'hard_workout_recovery',
      icon: '🔥',
      text: `${highIntensityMinutes} мин в высоких зонах — добавь белка для восстановления`,
      type: 'tip',
      priority: 30,
      category: 'training',
      triggers: ['product_added', 'tab_open'],
      ttl: 5000
    });
  }
  
  // Кардио в зоне жиросжигания — не переедать углеводами
  const fatBurnMinutes = todayTraining.z[1] || 0; // Зона 2
  if (fatBurnMinutes > 30 && carbsPct > 1.2) {
    advices.push({
      id: 'cardio_carbs_balance',
      icon: '🏃',
      text: 'После кардио лучше белок и овощи, чем углеводы',
      type: 'tip',
      priority: 35,
      category: 'training',
      triggers: ['product_added'],
      ttl: 5000
    });
  }
  
  // Отличная тренировка!
  if (totalMinutes >= 45) {
    advices.push({
      id: 'great_workout',
      icon: '💪',
      text: `${totalMinutes} мин тренировки — супер!`,
      type: 'achievement',
      priority: 7,
      category: 'training',
      triggers: ['tab_open'],
      ttl: 4000
    });
  }
}
```

---

### ⏰ Категория: Временные паттерны (Chrono-nutrition)

#### Задача 15: Инсулиновые волны

**Используем**: `prof.insulinWaveHours`, время приёмов пищи ✅ (передаётся в ctx)

**Логика**:
```javascript
const insulinWave = prof?.insulinWaveHours || 4;
const meals = (day?.meals || []).filter(m => m.items?.length > 0);

if (meals.length >= 2) {
  // Проверяем интервалы между приёмами
  const times = meals.map(m => {
    const [h, min] = (m.time || '12:00').split(':').map(Number);
    return h * 60 + min;
  }).sort((a, b) => a - b);
  
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    
    // Слишком быстро — инсулин ещё не упал
    if (gap < insulinWave * 60 * 0.5) { // < 50% от нормы
      advices.push({
        id: 'insulin_too_fast',
        icon: '⏱️',
        text: `Между приёмами ${Math.round(gap / 60)}ч — дай инсулину отдохнуть`,
        type: 'tip',
        priority: 38,
        category: 'timing',
        triggers: ['product_added'],
        ttl: 5000
      });
      break;
    }
  }
  
  // Отличные интервалы!
  const avgGap = (times[times.length - 1] - times[0]) / (times.length - 1);
  if (avgGap >= insulinWave * 60 * 0.9 && meals.length >= 3) {
    advices.push({
      id: 'insulin_perfect',
      icon: '⏰',
      text: 'Отличные интервалы между приёмами!',
      type: 'achievement',
      priority: 39,
      category: 'timing',
      triggers: ['tab_open'],
      ttl: 4000
    });
  }
}
```

---

#### Задача 16: Поздний ужин

**Логика**:
```javascript
const lastMealTime = (() => {
  const meals = (day?.meals || []).filter(m => m.items?.length > 0);
  if (meals.length === 0) return null;
  const times = meals.map(m => m.time || '12:00').sort();
  return times[times.length - 1];
})();

if (lastMealTime) {
  const [h] = lastMealTime.split(':').map(Number);
  
  // Очень поздний ужин
  if (h >= 22) {
    advices.push({
      id: 'late_dinner_warning',
      icon: '🌙',
      text: 'Поздний ужин — сон может быть хуже',
      type: 'tip',
      priority: 41,
      category: 'timing',
      triggers: ['product_added'],
      ttl: 5000
    });
  }
  
  // Хороший последний приём
  if (h >= 18 && h <= 20 && hour >= 21) {
    advices.push({
      id: 'good_dinner_time',
      icon: '✨',
      text: 'Ужин в правильное время — молодец!',
      type: 'achievement',
      priority: 43,
      category: 'timing',
      triggers: ['tab_open'],
      ttl: 4000
    });
  }
}
```

---

### 📈 Категория: Тренды и прогресс

#### Задача 17: Недельная статистика (воскресенье)

**⚠️ ВАЖНО**: Эта задача требует загрузки 7 дней из localStorage — используй кэширование!

**Рекомендация**: Вычислять weekStats в DayTab и передавать через params, если `dayOfWeek === 0 && hour >= 18`

**Логика**:
```javascript
const dayOfWeek = new Date().getDay();

// Воскресенье вечером — итоги недели
if (dayOfWeek === 0 && hour >= 18) {
  // ⚠️ Кэшируем результат на день, чтобы не читать 7 раз за каждый render!
  const cacheKey = 'heys_week_stats_' + new Date().toISOString().slice(0, 10);
  let weekStats = null;
  
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      weekStats = JSON.parse(cached);
    }
  } catch(e) {}
  
  if (!weekStats) {
    weekStats = { daysInNorm: 0, avgKcalPct: 0, totalTrainingMin: 0 };
    const U = window.U;
    if (U?.lsGet) {
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = `heys_dayv2_${d.toISOString().slice(0, 10)}`;
        const dayData = U.lsGet(key, {});
        // ... вычисления для каждого дня
      }
    }
    try { sessionStorage.setItem(cacheKey, JSON.stringify(weekStats)); } catch(e) {}
  }
  
  if (weekStats.daysInNorm >= 5 && !sessionStorage.getItem('heys_week_summary')) {
    advices.push({
      id: 'week_summary_good',
      icon: '📊',
      text: `${weekStats.daysInNorm}/7 дней в норме — отличная неделя!`,
      type: 'achievement',
      priority: 4,
      category: 'weekly',
      triggers: ['tab_open'],
      ttl: 7000,
      showConfetti: true,
      onShow: () => { try { sessionStorage.setItem('heys_week_summary', '1'); } catch(e) {} }
    });
  }
}
```

---

#### Задача 18: Сравнение с прошлой неделей

**Логика**:
```javascript
// Если понедельник — сравнить с прошлой неделей
if (dayOfWeek === 1 && hour >= 10 && hour <= 14) {
  const thisWeekAvg = calculateWeekAverage(0); // Текущая
  const lastWeekAvg = calculateWeekAverage(7); // Прошлая
  
  if (thisWeekAvg && lastWeekAvg) {
    const improvement = lastWeekAvg.kcalPct - thisWeekAvg.kcalPct;
    
    if (improvement > 0.1) { // Улучшение на 10%+
      advices.push({
        id: 'week_improvement',
        icon: '📈',
        text: 'Эта неделя лучше прошлой — так держать!',
        type: 'achievement',
        priority: 9,
        category: 'weekly',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
  }
}
```

---

### 🎭 Категория: Эмоциональный интеллект

#### Задача 19: Паттерны настроения и еды

**Используем**: `meal.mood`, `meal.wellbeing`, продукты в приёме

**Логика**:
```javascript
// Анализ: когда настроение падает — что ели?
const mealsWithMood = (day?.meals || []).filter(m => m.mood > 0 && m.items?.length > 0);

if (mealsWithMood.length >= 2) {
  const moodDropMeal = mealsWithMood.find((m, i) => {
    if (i === 0) return false;
    return m.mood < mealsWithMood[i - 1].mood - 1; // Падение на 2+
  });
  
  if (moodDropMeal) {
    // Анализируем что ели в предыдущий приём
    const prevMealIdx = mealsWithMood.indexOf(moodDropMeal) - 1;
    const prevMeal = mealsWithMood[prevMealIdx];
    
    // Много сахара в предыдущем приёме?
    let prevSimple = 0;
    for (const item of prevMeal.items || []) {
      const product = pIndex?.get(item.product_id);
      if (product) prevSimple += (product.simple100 || 0) * (item.grams || 100) / 100;
    }
    
    if (prevSimple > 30) {
      advices.push({
        id: 'sugar_mood_crash',
        icon: '🎢',
        text: 'Заметил? После сладкого настроение может падать',
        type: 'insight',
        priority: 24,
        category: 'emotional',
        triggers: ['tab_open'],
        ttl: 6000
      });
    }
  }
}
```

---

#### Задача 20: Wellbeing и питание

**Требует**: Добавить `calculateAverageWellbeing()` — см. секцию "Зависимости" выше!

**Логика**:
```javascript
const avgWellbeing = calculateAverageWellbeing(day); // ← Добавить функцию!

// Плохое самочувствие + мало еды — поесть!
if (avgWellbeing > 0 && avgWellbeing < 3 && kcalPct < 0.4 && hour >= 12) {
  advices.push({
    id: 'wellbeing_low_food',
    icon: '🍽️',
    text: 'Возможно самочувствие улучшится после еды',
    type: 'tip',
    priority: 29,
    category: 'emotional',
    triggers: ['tab_open'],
    ttl: 5000
  });
}

// Отличное самочувствие — закрепить
if (avgWellbeing >= 4 && kcalPct >= 0.8 && kcalPct <= 1.1) {
  advices.push({
    id: 'wellbeing_nutrition_link',
    icon: '✨',
    text: 'Хорошее самочувствие + правильное питание — запомни этот день!',
    type: 'insight',
    priority: 45,
    category: 'emotional',
    triggers: ['tab_open'],
    ttl: 5000
  });
}
```

---

### 🏠 Категория: Активность

#### Задача 21: Домашняя активность

**Используем**: `householdMin`

**Логика**:
```javascript
const household = day?.householdMin || 0;

// Много домашней активности — учесть в калориях
if (household >= 60) {
  const extraKcal = Math.round(household * 3); // ~3 ккал/мин
  advices.push({
    id: 'household_bonus',
    icon: '🏠',
    text: `${household} мин активности ≈ +${extraKcal} ккал сожжено`,
    type: 'info',
    priority: 50,
    category: 'activity',
    triggers: ['tab_open'],
    ttl: 5000
  });
}

// Нет активности весь день
if (household === 0 && (day?.steps || 0) < 3000 && !hasTraining && hour >= 18) {
  advices.push({
    id: 'sedentary_day',
    icon: '🚶',
    text: 'Малоподвижный день — прогуляйся 15 минут',
    type: 'tip',
    priority: 48,
    category: 'activity',
    triggers: ['tab_open'],
    ttl: 5000
  });
}
```

---

### 🎯 Категория: Качество питания

#### Задача 22: Гликемический индекс

**Используем**: `dayTot.gi`, средневзвешенный ГИ

**Логика**:
```javascript
const avgGI = dayTot?.gi || 0;

// Высокий ГИ
if (avgGI > 70 && mealCount >= 2) {
  advices.push({
    id: 'high_gi_warning',
    icon: '📈',
    text: `Средний ГИ ${Math.round(avgGI)} — добавь белок и клетчатку`,
    type: 'tip',
    priority: 33,
    category: 'nutrition',
    triggers: ['product_added', 'tab_open'],
    ttl: 5000
  });
}

// Отличный ГИ
if (avgGI > 0 && avgGI <= 55 && mealCount >= 2) {
  advices.push({
    id: 'low_gi_great',
    icon: '💚',
    text: `ГИ ${Math.round(avgGI)} — стабильная энергия весь день`,
    type: 'achievement',
    priority: 36,
    category: 'nutrition',
    triggers: ['tab_open'],
    ttl: 4000
  });
}
```

---

#### Задача 23: Соотношение простых/сложных углеводов

**Логика**:
```javascript
const simpleCarbs = dayTot?.simple || 0;
const complexCarbs = dayTot?.complex || 0;
const totalCarbs = simpleCarbs + complexCarbs;

if (totalCarbs > 50) {
  const simpleRatio = simpleCarbs / totalCarbs;
  
  // Слишком много простых
  if (simpleRatio > 0.5) {
    advices.push({
      id: 'simple_complex_ratio',
      icon: '⚖️',
      text: `${Math.round(simpleRatio * 100)}% простых углеводов — добавь каши, хлеб`,
      type: 'tip',
      priority: 34,
      category: 'nutrition',
      triggers: ['product_added'],
      ttl: 5000
    });
  }
  
  // Идеальный баланс
  if (simpleRatio <= 0.3) {
    advices.push({
      id: 'carbs_balance_perfect',
      icon: '🌾',
      text: 'Отличный баланс углеводов!',
      type: 'achievement',
      priority: 37,
      category: 'nutrition',
      triggers: ['tab_open'],
      ttl: 4000
    });
  }
}
```

---

#### Задача 24: Качество жиров

**Логика**:
```javascript
const goodFat = dayTot?.good || 0;
const badFat = dayTot?.bad || 0;
const transFat = dayTot?.trans || 0;
const totalFat = goodFat + badFat + transFat;

if (totalFat > 20) {
  const goodRatio = goodFat / totalFat;
  
  // Мало полезных жиров
  if (goodRatio < 0.4) {
    advices.push({
      id: 'fat_quality_low',
      icon: '🐟',
      text: 'Добавь полезных жиров — рыба, орехи, авокадо',
      type: 'tip',
      priority: 32,
      category: 'nutrition',
      triggers: ['product_added', 'tab_open'],
      ttl: 5000
    });
  }
  
  // Отличное качество жиров
  if (goodRatio >= 0.6) {
    advices.push({
      id: 'fat_quality_great',
      icon: '💚',
      text: `${Math.round(goodRatio * 100)}% полезных жиров — супер!`,
      type: 'achievement',
      priority: 38,
      category: 'nutrition',
      triggers: ['tab_open'],
      ttl: 4000
    });
  }
}
```

---

### 🌙 Категория: Сон и восстановление

#### Задача 25: Качество сна + питание

**Используем**: `sleepQuality`, `sleepHours`, `sleepNote`

**Логика**:
```javascript
const sleepQuality = day?.sleepQuality || 0;
const sleepHours = calculateSleepHours(day);

// Плохой сон — дать рекомендации по питанию
if (sleepQuality > 0 && sleepQuality <= 2 && hour < 12) {
  advices.push({
    id: 'bad_sleep_advice',
    icon: '😴',
    text: 'После плохого сна — меньше кофе, больше белка',
    type: 'tip',
    priority: 26,
    category: 'sleep',
    triggers: ['tab_open'],
    ttl: 5000
  });
}

// Отличный сон — отметить
if (sleepQuality >= 4 && sleepHours >= 7) {
  advices.push({
    id: 'great_sleep',
    icon: '😊',
    text: 'Хорошо выспался — день будет продуктивным!',
    type: 'achievement',
    priority: 46,
    category: 'sleep',
    triggers: ['tab_open'],
    ttl: 4000
  });
}
```

---

### 🌟 Категория: Персонализация по профилю

#### Задача 26: Рекомендации по полу

**Используем**: `prof.sex` (⚠️ НЕ `prof.gender`!)

**⚠️ ВАЖНО**: В проекте используется:
- `prof.sex` = `'male'` | `'female'` (для расчётов BMR)
- `profile.gender` = `'Мужской'` | `'Женской'` | `'Другое'` (для UI)

**Логика**:
```javascript
const isFemale = prof?.sex === 'female';

// Женщинам — больше железа
if (isFemale && mealCount >= 2) {
  // Проверяем наличие продуктов богатых железом
  const ironRichKeywords = ['мясо', 'печень', 'говядина', 'гречка', 'шпинат', 'чечевица'];
  const allItems = (day?.meals || []).flatMap(m => m.items || []);
  const hasIronRichFood = allItems.some(item => {
    const product = pIndex?.get(item.product_id);
    const name = (product?.name || item.name || '').toLowerCase();
    return ironRichKeywords.some(kw => name.includes(kw));
  });
  
  if (!hasIronRichFood && !sessionStorage.getItem('heys_iron_tip_today')) {
    advices.push({
      id: 'iron_reminder',
      icon: '🩸',
      text: 'Не забывай о железе — мясо, печень, гречка',
      type: 'tip',
      priority: 55,
      category: 'personalized',
      triggers: ['tab_open'],
      ttl: 5000,
      onShow: () => { try { sessionStorage.setItem('heys_iron_tip_today', '1'); } catch(e) {} }
    });
  }
}
```

---

#### Задача 27: Рекомендации по возрасту

**Использует**: `prof.age` ✅ (передаётся в ctx)

**Логика**:
```javascript
const age = prof?.age || 30;

// Старше 40 — больше белка
if (age >= 40 && proteinPct < 0.9) {
  advices.push({
    id: 'age_protein',
    icon: '💪',
    text: 'После 40 важно больше белка — сохраняем мышцы',
    type: 'tip',
    priority: 54,
    category: 'personalized',
    triggers: ['product_added', 'tab_open'],
    ttl: 5000
  });
}

// Молодым — про режим
if (age < 25 && hour >= 1 && hour <= 5) {
  advices.push({
    id: 'young_sleep',
    icon: '🌙',
    text: 'Поздно не спишь? Сон важнее диеты!',
    type: 'tip',
    priority: 15,
    category: 'personalized',
    triggers: ['tab_open'],
    ttl: 5000
  });
}
```

---

## 📋 Summary: Новые задачи (10-27)

| # | Название | Использует | Категория | Приоритет |
|---|----------|------------|-----------|-----------|
| 10 | Сон + переедание | sleepHours, kcalPct | correlation | Высокий |
| 11 | Стресс → сладкое | stress, simplePct | correlation | Высокий |
| 12 | Динамика веса | weightMorning (7 дней) | weight | Высокий |
| 13 | Напоминания о воде | waterMl, lastWaterTime | hydration | Средний |
| 14 | Post-workout советы | trainings.z, пульсовые зоны | training | Высокий |
| 15 | Инсулиновые волны | insulinWaveHours, meal.time | timing | Средний |
| 16 | Поздний ужин | meal.time | timing | Средний |
| 17 | Недельная статистика | 7 дней данных | weekly | Низкий |
| 18 | Сравнение с прошлой неделей | 14 дней данных | weekly | Низкий |
| 19 | Паттерны настроения | meal.mood, продукты | emotional | Средний |
| 20 | Wellbeing + питание | meal.wellbeing, kcalPct | emotional | Средний |
| 21 | Домашняя активность | householdMin, steps | activity | Низкий |
| 22 | Гликемический индекс | dayTot.gi | nutrition | Средний |
| 23 | Простые/сложные углеводы | simple, complex | nutrition | Средний |
| 24 | Качество жиров | good, bad, trans | nutrition | Средний |
| 25 | Качество сна | sleepQuality, sleepHours | sleep | Средний |
| 26 | По полу | prof.sex ⚠️ (не prof.gender!) | personalized | Низкий |
| 27 | По возрасту | prof.age | personalized | Низкий |

---

## 🚀 Рекомендуемый порядок реализации

**✅ Фаза -1 — ВЫПОЛНЕНО:**
1. ~~Удалить macroTip~~ ✅

**✅ Фаза 0 — ВЫПОЛНЕНО:**
1. ~~Передать `prof` в adviceEngine~~ ✅
2. ~~Передать `waterGoal` в adviceEngine~~ ✅
3. ~~Добавить `calculateAverageStress()` и `calculateAverageWellbeing()`~~ ✅

**✅ Фаза 1 — Базовые рекомендации (Tasks 5-9):** ✅ ВЫПОЛНЕНО
1. ~~Задача 5: Сезонные рекомендации~~ ✅
2. ~~Задача 6: Разнообразие рациона~~ ✅
3. ~~Задача 7: После сладкого → белок~~ ✅
4. ~~Задача 8: Returning emotional state~~ ✅

**✅ Фаза 2 — Корреляции и паттерны (Tasks 10-14):** ✅ ВЫПОЛНЕНО
1. ~~Задача 10: Сон + переедание~~ ✅
2. ~~Задача 11: Стресс → сладкое~~ ✅
3. Задача 12: Динамика веса ⏸️ (требует кэширование localStorage)
4. ~~Задача 14: Post-workout~~ ✅
5. ~~Задача 13: Вода~~ ✅

**✅ Фаза 3 — Качество питания (Tasks 15-16, 22-25):** ✅ ВЫПОЛНЕНО
1. ~~Задача 22: ГИ (гликемический индекс)~~ ✅
2. ~~Задача 23: Простые/сложные углеводы~~ ✅
3. ~~Задача 24: Качество жиров~~ ✅
4. ~~Задача 15-16: Инсулиновые волны, поздний ужин~~ ✅
5. ~~Задача 25: Качество сна~~ ✅

**✅ Фаза 4 — Эмоциональный интеллект (Tasks 19-20):** ✅ ВЫПОЛНЕНО
1. ~~Задача 19: Паттерны настроения и еды~~ ✅
2. ~~Задача 20: Wellbeing + питание~~ ✅

**🔜 Фаза 5 — Персонализация (опционально):**
1. Задачи 17-18: Недельная статистика ⏸️ (требует кэширование)
2. Задачи 26-27: По полу и возрасту
3. Задача 21: Домашняя активность

---

**Общее время на все 18 задач**: ~3-4 часа
**Сложность**: Средняя (требует аккуратной работы с данными)
**Приоритет**: Высокий — это делает приложение по-настоящему умным

---

## ✅ Чеклист

### ✅ Фаза -1 и 0 — ВЫПОЛНЕНО:
- [x] **Удалить macroTip useMemo** ✅
- [x] **Передать `prof` в `useAdviceEngine`** ✅
- [x] **Принять `prof` в `useAdviceEngine`** ✅
- [x] **Добавить `prof` в ctx** ✅
- [x] **Передать `waterGoal` в `useAdviceEngine`** ✅
- [x] Добавить `calculateAverageStress()` ✅
- [x] Добавить `calculateAverageWellbeing()` ✅

### 🟡 Проверки во время реализации:
- [ ] Использовать `prof.sex === 'female'` (НЕ `prof.gender === 'Женской'`)
- [ ] Использовать `waterGoal` из params (НЕ вычислять заново)
- [ ] Проверить нет ли конфликтов с существующими советами перед добавлением нового
- [ ] Для localStorage циклов — добавить кэширование через sessionStorage

### ✅ После изменений:
- [ ] `pnpm type-check` проходит
- [ ] `pnpm build` проходит
- [ ] Проверить в браузере: toast работает на мобильной ширине

---

## ⚡ Потенциальные проблемы производительности

### 1. Задачи 12, 17, 18 — чтение из localStorage в цикле

**Проблема**: `U.lsGet()` в цикле 7-14 раз за каждый render

**Решение**: Кэшировать данные за неделю в `useMemo` или делать эти проверки только 1 раз в день (sessionStorage флаг)

```javascript
// Плохо ❌
const weights = [];
for (let i = 0; i < 7; i++) {
  const dayData = U.lsGet('heys_dayv2_' + dateStr, {});
  // ...
}

// Хорошо ✅
const weekData = React.useMemo(() => {
  if (sessionStorage.getItem('heys_week_analyzed_' + todayISO())) return null;
  // ... загрузка данных
  sessionStorage.setItem('heys_week_analyzed_' + todayISO(), '1');
  return data;
}, [date]);
```

### 2. Слишком много советов одновременно

**Проблема**: 18 новых задач = потенциально 30+ советов в `allAdvices`

**Решение**: 
- Использовать категории для ограничения: не более 1 совета из каждой категории
- Приоритизировать по score/priority

### 3. Пересечение с существующей логикой

**Проблема**: Некоторые новые советы дублируют существующие:
- `fiber_low` vs задача 22 (ГИ)
- `sleep_low` vs задача 10 (сон + переедание)

**Решение**: Добавить взаимоисключающие условия или объединить логику
