# 🎯 Meal Quality Score — Оценка качества приёма пищи

**Дата**: 2025-12-03  
**Время**: ~2.5-3 часа (+20 мин WOW)  
**Приоритет**: 🔥 Высокий  
**Аудит**: ✅ Выполнен 2025-12-03 (v2 — глубокий)

---

## ⚠️ Phase 0 — Подготовка (ОБЯЗАТЕЛЬНО перед реализацией)

### ✅ До начала (ГОТОВО):
- [x] `git add . && git commit -m "WIP: before meal quality score"` — commit: `bfa4e96`
- [x] Бэкап: `cp apps/web/heys_day_v12.js apps/web/heys_day_v12.backup3.js`
- [ ] Скриншот текущего графика распределения калорий
- [ ] Проверка baseline: график рендерится без ошибок в консоли

### Валидация данных (в консоли браузера):
```javascript
// 1. Проверить типы приёмов в реальных данных:
const days = Object.keys(localStorage).filter(k => k.startsWith('heys_dayv2_'));
const allMealTypes = new Set();
days.forEach(k => {
  const day = JSON.parse(localStorage.getItem(k) || '{}');
  (day.meals || []).forEach((m, i) => {
    // Симулируем getMealType — смотрим время
    const time = m.time || '';
    allMealTypes.add(time + ' → meal #' + i);
  });
});
console.log('Meal times found:', [...allMealTypes]);
// ⚠️ Убедиться, что MEAL_KCAL_DISTRIBUTION покрывает все типы!

// 2. Проверить текущий optimum в рантайме:
console.log('Current optimum:', window.HEYS?.dayState?.optimum || 'NOT SET → fallback 2000');

// 3. Проверить 10 продуктов на наличие gi и harm:
const products = JSON.parse(localStorage.getItem('heys_products') || '[]');
products.slice(0, 10).forEach(p => console.log(p.name, 'gi:', p.gi, 'harm:', p.harm));

// 4. Проверить, что есть поля для расчётов simple/complex/good/bad/trans:
// В продуктах: simple100, complex100, goodFat100, badFat100, trans100 (НЕ simple, complex, good!)
products.slice(0, 10).forEach(p => console.log(p.name, { 
  simple100: p.simple100, complex100: p.complex100, 
  goodFat100: p.goodFat100, badFat100: p.badFat100, trans100: p.trans100 
}));
```

### 🔴 Критические блокеры (все уточнены ✅):

| # | Блокер | Решение | Статус |
|---|--------|---------|--------|
| 1 | `M.mealTotals()` НЕ возвращает gi и harm | Вычислять отдельно как взвешенное среднее | ✅ |
| 2 | Продукты без gi/harm | Fallback: `gi=50`, `harm=0` | ✅ |
| 3 | mealsChartData не имеет `type` | Добавить `type: mealTypeInfo.type` | ✅ |
| 4 | `getProductFromItem` доступность | Уже в scope через `M.getProductFromItem` | ✅ |
| 5 | **Типы приёмов** | `MEAL_TYPES`: `breakfast, snack1, lunch, snack2, dinner, snack3, night` | ✅ |
| 6 | optimum/dailyGoal деление на 0 | `optimum` из scope, fallback `2000`. **Проверить в рантайме!** | ✅ |
| 7 | StepModal/Haptic отсутствие | `HEYS.StepModal?.show()`, `HEYS.dayUtils?.haptic?.()` | ✅ |
| 8 | Поля simple/complex/good/bad/trans | `per100()` уже возвращает 0 для missing fields | ✅ |
| 9 | **Формат времени** | `meal.time` = `"HH:mm"`, парсить через `split(':')` | ✅ |
| 10 | **NaN при делении на 0** | Проверять знаменатель, fallback ratio = 0.5 | 🆕 |

### ✅ Ответы на уточняющие вопросы:

1. **Типы приёмов**: `MEAL_TYPES` в `heys_day_utils.js:301-309`
   - Значения: `breakfast`, `snack1`, `lunch`, `snack2`, `dinner`, `snack3`, `night`
   - Тип берём из `getMealType(mi, meal, meals, pIndex).type`

2. **optimum**: `const optimum = r0(tdee*(1+dayTargetDef/100))` в scope (строка 1155)
   - Передаётся в `mealsChartData.targetKcal`
   - Fallback: `2000` если вдруг undefined

3. **meal.time формат**: Строка `"HH:mm"` (например `"08:30"`)
   - Парсинг: `const [hh] = (meal.time || '').split(':').map(Number)`
   - Проверка вечера: `hh >= 21`

4. **StepModal/Haptic**: Оба доступны с optional chaining
   - `HEYS.StepModal?.show({ steps, onClose })`
   - `HEYS.dayUtils?.haptic?.('success')` или `try { HEYS.haptic?.() } catch {}`

5. **Missing product fields**: `per100()` в `heys_models_v1.js:339`
   - Все поля уже имеют `+p.field || 0` → возвращает 0
   - При делении: если знаменатель = 0 → ratio = 0.5 (нейтральное)

6. **Ночные перекусы (night)**: Существуют, допускается 0-5% калорий
   - Если время >= 23:00 или < 03:00 → дополнительный штраф

---

## 📋 Описание

Добавить интеллектуальную оценку качества каждого приёма пищи в график "Распределение калорий". Цвет полоски и бейджи показывают насколько приём соответствует оптимальным параметрам.

---

## 🎨 Визуал

```
📊 Распределение калорий                    2261 / 1800 ккал

🍳 Завтрак  [████████████████░░░] 387 ккал  ⭐ 92           08:30
🍎 Перекус  [██████░░░░░░░░░░░░░] 120 ккал  ⭐ 78           11:00  
🍲 Обед     [██████████████░░░░░] 450 ккал  ⭐ 85           13:30
🥜 Перекус  [████████████░░░░░░░] 280 ккал  ⭐ 45  !К !ГИ   16:00
🍽️ Ужин     [██████████████████░] 520 ккал  ⭐ 65  !К       20:00

Цвета полосок:
- 🟢 Зелёный (score 80-100): отличный приём (без бейджей)
- 🟡 Жёлтый (score 50-79): нормальный, есть замечания
- 🔴 Красный (score 0-49): проблемный приём
```

**Бейджи (ТОЛЬКО проблемные, max 3):**
- `!Б` — мало белка (< 20г для основного приёма)
- `!К` — перебор калорий для типа приёма
- `!ГИ` — высокий ГИ (> 70)
- `!Вр` — много вредных продуктов (harm > 10)
- `!ТЖ` — есть транс-жиры (> 0.5г)

---

## 🧮 Алгоритм оценки (100 баллов)

### 1. Калории относительно времени и типа (30 баллов)

**Ожидаемое распределение калорий по времени:**
```javascript
// ⚠️ ВАЖНО: Ключи должны совпадать с MEAL_TYPES из heys_day_utils.js:301
const MEAL_KCAL_DISTRIBUTION = {
  breakfast: { minPct: 0.20, maxPct: 0.30 },  // 20-30% дневных
  snack1:    { minPct: 0.05, maxPct: 0.10 },  // 5-10%
  lunch:     { minPct: 0.30, maxPct: 0.40 },  // 30-40%
  snack2:    { minPct: 0.05, maxPct: 0.10 },  // 5-10%
  dinner:    { minPct: 0.20, maxPct: 0.30 },  // 20-30%
  snack3:    { minPct: 0.02, maxPct: 0.05 },  // 2-5%
  night:     { minPct: 0.00, maxPct: 0.05 }   // 0-5% (лучше 0)
};
```

**Штрафы:**
- Приём после 21:00 — штраф пропорционально калориям
- Калории > maxPct — штраф
- Калории < minPct (для основных) — небольшой штраф

### 2. Баланс БЖУ (25 баллов)

```javascript
// Идеальное соотношение для приёма
const IDEAL_MACROS = {
  breakfast: { protPct: 0.20, carbPct: 0.50, fatPct: 0.30 },
  lunch:     { protPct: 0.30, carbPct: 0.40, fatPct: 0.30 },
  dinner:    { protPct: 0.35, carbPct: 0.35, fatPct: 0.30 },
  snack:     { protPct: 0.15, carbPct: 0.55, fatPct: 0.30 }
};
```

**Баллы:**
- Белок >= 20г в основном приёме: **+5 бонус** (не штраф!)
- Белок < 20г в основном: -10 баллов + бейдж `!Б`
- Отклонение от идеального БЖУ: -баллы пропорционально (max -15)

### 3. Качество углеводов (15 баллов)

```javascript
const simpleRatio = simple / (simple + complex);
// Идеал: simpleRatio <= 0.30 (30% простых)
```

- simpleRatio <= 0.30: полные 15 баллов
- simpleRatio 0.30-0.50: 10 баллов
- simpleRatio 0.50-0.70: 5 баллов
- simpleRatio > 0.70: 0 баллов

### 4. Качество жиров (15 баллов)

```javascript
const goodRatio = good / (bad + good + trans);
const badRatio = bad / (bad + good + trans);
const hasTrans = trans > 0.5;
```

**Баллы:**
- goodRatio >= 0.60: полные 15 баллов
- goodRatio 0.40-0.60: 10 баллов
- goodRatio < 0.40: 5 баллов
- **badRatio > 0.50**: -5 баллов (много плохих жиров!)
- **hasTrans (> 0.5г)**: -5 баллов + бейдж `!ТЖ`

### 5. ГИ и вредность (15 баллов)

```javascript
// Средневзвешенный ГИ приёма — по УГЛЕВОДАМ, не по граммам!
// Для мясных блюд (carbs ≈ 0) → нейтральный ГИ = 50
let carbSum = 0, giSum = 0, harmSum = 0, gSum = 0;
items.forEach(it => {
  const p = getProduct(it);
  const g = it.grams;
  const carbs = (p.simple100 + p.complex100) * g / 100;
  const gi = p.gi ?? 50;
  carbSum += carbs;
  giSum += gi * carbs; // взвешиваем по углеводам!
  gSum += g;
  harmSum += (p.harm ?? 0) * g;
});
const avgGI = carbSum > 0 ? giSum / carbSum : 50; // нейтрально для мяса/рыбы
const avgHarm = gSum > 0 ? harmSum / gSum : 0;
```

**Баллы:**
- avgGI <= 55: полные 15 баллов
- avgGI 55-70: 10 баллов
- avgGI > 70: 5 баллов + бейдж `!ГИ`
- avgHarm > 5: -баллы пропорционально (max -5)
- avgHarm > 10: бейдж `!Вр`

---

## 📁 Ключевые файлы

| Файл | Изменения | Строки |
|------|-----------|--------|
| `apps/web/heys_day_v12.js` | `getMealQualityScore()`, обновить `mealsChartData` (строка 4356), рендер | ~4356, ~8553 |
| `apps/web/heys_day_utils.js` | Уже есть `MEAL_TYPES` (строка 301), `getMealType` (строка 436) | readonly |
| `apps/web/heys_models_v1.js` | Уже есть `mealTotals` (строка 353), `per100` (строка 339) | readonly |
| `docs/DATA_MODEL_REFERENCE.md` | Документация алгоритма | append |

---

## ✅ Задачи

### Фаза 1: Функция оценки (45 мин)

- [ ] 1.1. Добавить константы `MEAL_KCAL_DISTRIBUTION` и `IDEAL_MACROS` в начало файла
- [ ] 1.2. Создать `getMealQualityScore(meal, mealType, optimum, pIndex)` 
- [ ] 1.3. Создать вспомогательные функции: `calcKcalScore`, `calcMacroScore`, `calcCarbQuality`, `calcFatQuality`, `calcGiHarmScore`
- [ ] 1.4. Возвращать `{ score, color, badges, details }`
- [ ] 1.5. Unit-тест: пустой приём → `null`, только сладкое → score < 50

### Фаза 2: Интеграция в график (30 мин)

- [ ] 2.1. Обновить `mealsChartData` useMemo (строка 4356) — добавить `quality` и `type`
- [ ] 2.2. **Явные deps**: `[day.meals, pIndex, optimum]` — убедиться что все есть!
- [ ] 2.3. Передать `optimum` (уже есть в scope) и `pIndex`
- [ ] 2.4. Цвет полоски по `quality.color` (или fallback к текущей логике)
- [ ] 2.5. Показать `quality.score` справа: `⭐ 85`

### Фаза 3: Бейджи и детали (25 мин)

- [ ] 3.1. Рендер ТОЛЬКО проблемных бейджей `!К !ГИ !ТЖ !Б !Вр` (max 3)
- [ ] 3.2. Стили: красный фон `#fee2e2`, текст `#991b1b`
- [ ] 3.3. По клику на полоску → `HEYS.StepModal?.show()` с деталями
- [ ] 3.4. Проверить что StepModal доступен: `typeof HEYS?.StepModal?.show === 'function'`

### Фаза 4: Streak качественных приёмов (15 мин)

- [ ] 4.1. Подсчёт подряд идущих приёмов со score ≥ 80 (с начала дня)
- [ ] 4.2. При streak ≥ 3 показать "🔥 N отличных приёмов подряд!"
- [ ] 4.3. Haptic `success` при достижении streak: `HEYS.dayUtils?.haptic?.('success')`

### Фаза 5: Полировка и WOW (20 мин)

- [ ] 5.1. **Counter animation** — score появляется с анимацией 0 → N (CSS keyframes)
- [ ] 5.2. **Micro-interaction** — полоска слегка "прыгает" при клике (scale 0.98)
- [ ] 5.3. **Comparison с вчера** — показать `↑ +12` или `↓ -5` рядом со средним score
- [ ] 5.4. Haptic feedback при score < 50: `HEYS.dayUtils?.haptic?.('warning')`
- [ ] 5.5. Тёмная тема: проверить `var(--surface)`, `var(--text-primary)`
- [ ] 5.6. Edge cases: пустой приём (без score), один продукт, только напиток

---

## 🔧 Код-сниппеты

### getMealQualityScore (ИСПРАВЛЕННЫЙ v2)

```javascript
/**
 * Вычисляет качество приёма пищи (0-100)
 * @param {Object} meal - Приём пищи с items
 * @param {string} mealType - Тип приёма ('breakfast', 'snack1', 'lunch', etc.) из getMealType().type
 * @param {number} optimum - Дневная норма калорий (fallback: 2000)
 * @param {Object} pIndex - Индекс продуктов
 * @returns {{ score: number, color: string, badges: Array, details: Array } | null}
 */
function getMealQualityScore(meal, mealType, optimum, pIndex) {
  // Пустой приём — без оценки
  if (!meal.items || meal.items.length === 0) return null;
  
  // Fallback для optimum (⚠️ проверить в рантайме!)
  const opt = optimum || 2000;
  
  // === Вычисляем totals (M.mealTotals возвращает все нужные поля кроме gi/harm) ===
  const M = window.HEYS?.models;
  const totals = M?.mealTotals ? M.mealTotals(meal, pIndex) : 
    { kcal:0, carbs:0, simple:0, complex:0, prot:0, fat:0, bad:0, good:0, trans:0, fiber:0 };
  
  // gi и harm вычисляем отдельно
  // ⚠️ GI взвешиваем по УГЛЕВОДАМ (не по граммам!) — для мяса/рыбы будет нейтральный 50
  let gSum = 0, carbSum = 0, giSum = 0, harmSum = 0;
  (meal.items || []).forEach(it => {
    const p = M?.getProductFromItem ? M.getProductFromItem(it, pIndex) : null;
    if (!p) return;
    const g = +it.grams || 0;
    if (!g) return;
    
    const simple = (+p.simple100 || 0) * g / 100;
    const complex = (+p.complex100 || 0) * g / 100;
    const itemCarbs = simple + complex;
    
    const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? 50;
    const harm = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct ?? 0;
    
    gSum += g;
    carbSum += itemCarbs;
    giSum += gi * itemCarbs; // взвешиваем по углеводам!
    harmSum += harm * g;
  });
  const avgGI = carbSum > 0 ? giSum / carbSum : 50; // нейтрально для мяса
  const avgHarm = gSum > 0 ? harmSum / gSum : 0;
  
  const { kcal, prot, carbs, simple, complex, fat, bad, good, trans } = totals;
  
  let score = 0;
  const badges = [];
  
  // 1. Калории (30 баллов)
  const kcalScore = calcKcalScore(kcal, mealType, opt, meal.time);
  score += kcalScore.points;
  if (!kcalScore.ok) badges.push({ type: 'К', ok: false });
  
  // 2. БЖУ баланс (25 баллов)
  const macroScore = calcMacroScore(prot, carbs, fat, kcal, mealType);
  score += macroScore.points;
  if (!macroScore.proteinOk) badges.push({ type: 'Б', ok: false });
  
  // 3. Качество углеводов (15 баллов)
  const carbScore = calcCarbQuality(simple, complex);
  score += carbScore.points;
  
  // 4. Качество жиров (15 баллов)
  const fatScore = calcFatQuality(bad, good, trans);
  score += fatScore.points;
  if (trans > 0.5) badges.push({ type: 'ТЖ', ok: false });
  
  // 5. ГИ и вредность (15 баллов)
  const giHarmScore = calcGiHarmScore(avgGI, avgHarm);
  score += giHarmScore.points;
  if (avgGI > 70) badges.push({ type: 'ГИ', ok: false });
  if (avgHarm > 10) badges.push({ type: 'Вр', ok: false });
  
  // Цвет (как в ratioZones)
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';
  
  // Детали для popup (StepModal)
  const details = [
    { label: 'Калории', value: Math.round(kcal) + ' ккал', ok: kcalScore.ok },
    { label: 'Белок', value: Math.round(prot) + 'г', ok: macroScore.proteinOk },
    { label: 'Углеводы', value: carbScore.simpleRatio <= 0.3 ? 'сложные ✓' : Math.round(carbScore.simpleRatio * 100) + '% простых', ok: carbScore.ok },
    { label: 'Жиры', value: fatScore.goodRatio >= 0.6 ? 'полезные ✓' : Math.round(fatScore.goodRatio * 100) + '% полезных', ok: fatScore.ok },
    { label: 'ГИ', value: Math.round(avgGI), ok: avgGI <= 70 }
  ];
  
  // Haptic при низком score выполняется в компоненте, чтобы не триггерить при каждом пересчёте
  
  return { 
    score: Math.round(score), 
    color, 
    badges: badges.slice(0, 3), // max 3 бейджа
    details
  };
}

// === Вспомогательные функции ===

function calcKcalScore(kcal, mealType, optimum, timeStr) {
  const dist = MEAL_KCAL_DISTRIBUTION[mealType] || MEAL_KCAL_DISTRIBUTION.snack1;
  const kcalPct = kcal / (optimum || 2000);
  
  let points = 30; // Начинаем с максимума
  let ok = true;
  
  // Проверка попадания в диапазон
  if (kcalPct > dist.maxPct) {
    const excess = (kcalPct - dist.maxPct) / dist.maxPct;
    points -= Math.min(20, Math.round(excess * 30));
    ok = false;
  } else if (kcalPct < dist.minPct * 0.5 && ['breakfast', 'lunch', 'dinner'].includes(mealType)) {
    // Слишком мало для основного приёма
    points -= 10;
  }
  
  // Штраф за поздний приём (после 21:00)
  const [hh] = (timeStr || '').split(':').map(Number);
  if (hh >= 21 && kcal > 200) {
    points -= Math.min(10, Math.round(kcal / 100));
    ok = false;
  }
  
  return { points: Math.max(0, points), ok };
}

function calcMacroScore(prot, carbs, fat, kcal, mealType) {
  const ideal = IDEAL_MACROS[mealType] || IDEAL_MACROS.snack;
  let points = 20; // Базовые баллы (из 25)
  let proteinOk = true;
  
  const isMainMeal = ['breakfast', 'lunch', 'dinner'].includes(mealType);
  
  // Бонус/штраф за белок в основных приёмах
  if (isMainMeal) {
    if (prot >= 20) {
      points += 5; // ✅ Бонус за хороший белок!
    } else {
      points -= 10; // Штраф за недостаток
      proteinOk = false;
    }
  }
  
  // Отклонение от идеала БЖУ
  if (kcal > 0) {
    const protPct = (prot * 4) / kcal;
    const carbPct = (carbs * 4) / kcal;
    const fatPct = (fat * 9) / kcal;
    
    const deviation = Math.abs(protPct - ideal.protPct) + 
                      Math.abs(carbPct - ideal.carbPct) + 
                      Math.abs(fatPct - ideal.fatPct);
    points -= Math.min(10, Math.round(deviation * 15)); // max -10
  }
  
  return { points: Math.max(0, Math.min(25, points)), proteinOk };
}

function calcCarbQuality(simple, complex) {
  const total = simple + complex;
  // ⚠️ Защита от деления на 0
  const simpleRatio = total > 0 ? simple / total : 0.5; // 0.5 = нейтрально
  
  let points = 15;
  let ok = true;
  
  if (simpleRatio <= 0.30) {
    points = 15; // Идеально
  } else if (simpleRatio <= 0.50) {
    points = 10;
    ok = simpleRatio <= 0.35;
  } else if (simpleRatio <= 0.70) {
    points = 5;
    ok = false;
  } else {
    points = 0;
    ok = false;
  }
  
  return { points, simpleRatio, ok };
}

function calcFatQuality(bad, good, trans) {
  const total = bad + good + trans;
  // ⚠️ Защита от деления на 0
  const goodRatio = total > 0 ? good / total : 0.5;
  const badRatio = total > 0 ? bad / total : 0.5;
  
  let points = 15;
  let ok = true;
  
  // Оценка по доле полезных жиров
  if (goodRatio >= 0.60) {
    points = 15;
  } else if (goodRatio >= 0.40) {
    points = 10;
  } else {
    points = 5;
    ok = false;
  }
  
  // Штраф за много плохих жиров (> 50%)
  if (badRatio > 0.50) {
    points -= 5;
    ok = false;
  }
  
  // Штраф за транс-жиры (> 0.5г)
  if (trans > 0.5) {
    points -= 5;
    ok = false;
  }
  
  return { points: Math.max(0, points), goodRatio, badRatio, ok };
}

function calcGiHarmScore(avgGI, avgHarm) {
  let points = 15;
  let ok = true;
  
  // ГИ оценка
  if (avgGI <= 55) {
    points = 15;
  } else if (avgGI <= 70) {
    points = 10;
  } else {
    points = 5;
    ok = false;
  }
  
  // Штраф за вредность
  if (avgHarm > 5) {
    points -= Math.min(5, Math.round(avgHarm / 5));
    ok = avgHarm <= 10;
  }
  
  return { points: Math.max(0, points), ok };
}
```

### Рендер бейджей (ТОЛЬКО проблемные)

```javascript
// Бейджи — показываем только проблемные (ok: false)
quality && quality.badges.length > 0 && React.createElement('div', { 
  style: { display: 'flex', gap: '2px', marginLeft: '4px' }
},
  quality.badges
    .filter(b => !b.ok) // только проблемные!
    .slice(0, 3)
    .map((b, i) => 
      React.createElement('span', {
        key: i,
        style: {
          fontSize: '9px',
          padding: '1px 3px',
          borderRadius: '3px',
          background: '#fee2e2',
          color: '#991b1b',
          fontWeight: '600'
        }
      }, '!' + b.type)
    )
)
```

### StepModal с деталями качества

```javascript
// Вызов: по клику на полоску приёма
function showMealQualityDetails(meal, quality, mealTypeInfo) {
  if (!HEYS?.StepModal?.show) return; // гард для веб/SSR
  const { score, badges, details } = quality;
  
  // Формируем шаги для StepModal
  const steps = [
    {
      title: `${mealTypeInfo.icon} ${mealTypeInfo.name} — ${score} баллов`,
      content: React.createElement('div', { style: { padding: '16px' } },
        // Прогресс-бар score
        React.createElement('div', { 
          style: { 
            height: '8px', 
            background: '#e5e7eb', 
            borderRadius: '4px', 
            overflow: 'hidden',
            marginBottom: '16px'
          }
        },
          React.createElement('div', { 
            style: { 
              width: score + '%', 
              height: '100%', 
              background: quality.color,
              transition: 'width 0.5s ease'
            }
          })
        ),
        // Детали по категориям
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          details.map((d, i) => 
            React.createElement('div', { 
              key: i,
              style: { 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                padding: '8px 12px',
                background: d.ok ? '#dcfce7' : '#fee2e2',
                borderRadius: '8px'
              }
            },
              React.createElement('span', null, d.ok ? '✓' : '⚠️'),
              React.createElement('span', { style: { flex: 1 } }, d.label),
              React.createElement('span', { 
                style: { fontWeight: '600', color: d.ok ? '#166534' : '#991b1b' }
              }, d.value)
            )
          )
        )
      )
    }
  ];
  
  HEYS.StepModal.show({
    steps,
    onClose: () => {},
    showDots: false // Один шаг — точки не нужны
  });
}

// Пример details в quality:
// details: [
//   { label: 'Калории', value: '387 ккал', ok: true },
//   { label: 'Белок', value: '25г', ok: true },
//   { label: 'Углеводы', value: '80% сложные', ok: true },
//   { label: 'Жиры', value: '60% полезные', ok: true },
//   { label: 'ГИ', value: '72', ok: false }
// ]
```

### Streak качественных приёмов

```javascript
// В mealsChartData useMemo добавить:
const qualityStreak = (() => {
  let streak = 0;
  for (const m of data) {
    if (m.quality && m.quality.score >= 80) {
      streak++;
    } else {
      break; // Streak прерван
    }
  }
  return streak;
})();

// Рендер (если streak >= 3):
qualityStreak >= 3 && React.createElement('div', {
  style: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    background: 'linear-gradient(90deg, #fef3c7 0%, #fde68a 100%)',
    borderRadius: '8px',
    marginTop: '8px'
  }
},
  React.createElement('span', null, '🔥'),
  React.createElement('span', { style: { fontWeight: '600', color: '#92400e' } },
    qualityStreak + ' отличных приёмов подряд!'
  )
)
```

### WOW: Counter animation + Micro-interaction

```css
/* Добавить в styles или inline */
@keyframes scoreCountUp {
  0% { opacity: 0; transform: scale(0.5); }
  50% { transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

.meal-score {
  animation: scoreCountUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.meal-bar-container {
  transition: transform 0.1s ease;
}

.meal-bar-container:active {
  transform: scale(0.98);
}
```

```javascript
// Inline стили для score с анимацией
React.createElement('span', {
  className: 'meal-score',
  style: {
    fontSize: '11px',
    fontWeight: '600',
    color: quality.color,
    display: 'flex',
    alignItems: 'center',
    gap: '2px'
  }
}, '⭐ ' + quality.score)
```

### WOW: Comparison с вчера

```javascript
// В mealsChartData useMemo — вычислить средний score
const avgScore = data.length > 0 
  ? Math.round(data.reduce((sum, m) => sum + (m.quality?.score || 0), 0) / data.length)
  : 0;

// Получить вчерашний средний score (из localStorage)
const getYesterdayAvgScore = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = 'heys_meal_quality_avg_' + yesterday.toISOString().slice(0, 10);
  return +(localStorage.getItem(yKey) || 0);
};

// Сохранить сегодняшний при изменении
React.useEffect(() => {
  if (avgScore > 0) {
    const todayKey = 'heys_meal_quality_avg_' + new Date().toISOString().slice(0, 10);
    localStorage.setItem(todayKey, String(avgScore));
  }
}, [avgScore]);

// Рендер сравнения
const yesterdayScore = getYesterdayAvgScore();
const diff = avgScore - yesterdayScore;
const showDiff = yesterdayScore > 0 && Math.abs(diff) >= 3;

showDiff && React.createElement('span', {
  style: {
    fontSize: '10px',
    marginLeft: '4px',
    color: diff > 0 ? '#16a34a' : '#dc2626',
    fontWeight: '500'
  }
}, diff > 0 ? '↑ +' + diff : '↓ ' + diff)
```

---

## 📊 Примеры оценок

| Приём | Состав | Score | Почему |
|-------|--------|-------|--------|
| Завтрак 08:00: Овсянка + яйца + банан | 400 ккал, Б:25, У:50 (сложные), Ж:15 | 92 | Идеальный баланс, правильное время |
| Перекус 16:00: 3 шоколадки | 450 ккал, Б:5, У:60 (простые), Ж:20 | 25 | Перебор ккал для перекуса, только простые углеводы, высокий ГИ |
| Ужин 21:30: Стейк + салат | 500 ккал, Б:45, У:10, Ж:30 | 70 | Хороший белок, но поздно |

---

## 🎯 Критерии готовности

- [ ] Каждый приём имеет score 0-100
- [ ] Цвет полоски соответствует score
- [ ] Бейджи показывают ТОЛЬКО проблемы (max 3)
- [ ] Пустой приём — без score
- [ ] По клику на полоску → StepModal с деталями
- [ ] Streak ≥ 3 → показ "🔥 N отличных приёмов подряд!"
- [ ] Работает на всех типах приёмов
- [ ] Тёмная тема
- [ ] Нет ошибок в консоли
- [ ] Haptic при score < 50 и при streak

---

## ⚠️ Риск-матрица (обновлена)

| # | Риск | Вероятность | Импакт | Митигация | Статус |
|---|------|-------------|--------|-----------|--------|
| 1 | gi/harm undefined | Высокая | Критический | Fallback: gi=50, harm=0 | ✅ |
| 2 | mealsChartData не обновляется | Средняя | Высокий | Добавить зависимости в useMemo | ⚠️ Проверить |
| 3 | Performance деградация | Низкая | Средний | mealTotals уже с кэшем | ✅ |
| 4 | Бейджи перегружают UI | Средняя | Средний | Только проблемные, max 3 | ✅ |
| 5 | Нет optimum/dailyGoal | Средняя | Высокий | Fallback 2000 | ✅ |
| 6 | StepModal/Haptic нет | Средняя | Средний | Optional chaining + try/catch | ✅ |
| 7 | NaN при делении на 0 | Высокая | Критический | Проверка `total > 0 ? ... : 0.5` | ✅ |
| 8 | Несовпадение типов приёмов | Низкая | Высокий | Используем `getMealType().type` | ✅ |
| 9 | Dark theme contrast | Средняя | Низкий | Использовать CSS variables | ⚠️ Тест |
| 10 | Mobile touch targets | Средняя | Средний | min-height: 44px | ⚠️ Тест |

---

## 🟢 WOW-рекомендации (опционально)

### 🎯 Современные UX-паттерны (рекомендую добавить)

1. **Counter animation**: Score появляется с анимацией от 0 → N
   ```css
   @keyframes countUp { from { opacity: 0; transform: scale(0.5); } }
   .score-value { animation: countUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
   ```

2. **Micro-interaction при клике**: Полоска слегка "прыгает" при нажатии
   ```css
   .meal-bar:active { transform: scale(0.98); transition: transform 0.1s; }
   ```

3. **Gradient progress ring** вместо числа (как Apple Fitness)
   ```
   [🟢●●●○] 80+  |  [🟡●●○○] 50-79  |  [🔴●○○○] 0-49
   ```

4. **Swipe-to-details** (mobile): Свайп влево открывает детали приёма

5. **Confetti для идеала**: Score ≥ 95 → микро-конфетти 🎉 (canvas-confetti, ~2KB)

### 🏆 Gamification расширения (v2)

6. **Streak milestone**: При streak = 5 → особый бейдж "Мастер питания 🏆"

7. **Daily challenge**: "Сегодня: все приёмы ≥ 70 баллов" → reward XP

8. **Comparison с вчера**: `↑ +12 баллов vs вчера` рядом со score

### 🔮 AI/Smart фичи (v3)

9. **Prediction**: "Добавь белок — получишь +15 баллов" (перед сохранением)

10. **Pattern learning**: "Твои завтраки обычно 85+, сегодня только 60 — что случилось?"

---

## 🔬 Глубокий аудит (v2)

### ✅ Что хорошо:
- Алгоритм покрывает все ключевые аспекты качества еды
- Бейджи только для проблем (не шумят)
- StepModal для деталей — правильный выбор (уже используется в проекте)
- Fallbacks для всех edge cases

### 🟡 Потенциальные улучшения:
1. **Вес критериев можно настраивать** — в будущем через `heys_norms`
2. **Cache score** — если приём не менялся, не пересчитывать
3. **Цветовая доступность** — добавить паттерны для дальтоников (полоски с разной текстурой)

### 🔴 Возможные проблемы (митигированы):
1. ~~NaN при делении на 0~~ → добавлена проверка `total > 0 ? ... : 0.5`
2. ~~Нет optimum~~ → fallback 2000
3. ~~Нет gi/harm~~ → fallback 50/0
4. ~~Haptic в SSR~~ → try/catch guard

### 📐 Оценка scope:
- **Оверкилл?** Нет. Все 5 критериев важны для nutrition app.
- **Недокилл?** Можно добавить fiber score, но это усложнит без большой пользы.
- **Время оценка**: 2.5-3 часа реалистично при готовых сниппетах.

---

## 🔙 Rollback план

Если что-то пойдёт не так:
1. `cp apps/web/heys_day_v12.backup3.js apps/web/heys_day_v12.js`
2. `pnpm dev` → проверить localhost:3001
3. Если backup не создан: `git checkout apps/web/heys_day_v12.js`

---

## 📝 Примечания

- Алгоритм можно настраивать через `heys_norms` в будущем
- Score вычисляется в `mealsChartData`, не сохраняется в localStorage
- По клику на приём — модалка с деталями (опционально)
- **Паттерн gi/harm взят из MealCard (строка 292)**
