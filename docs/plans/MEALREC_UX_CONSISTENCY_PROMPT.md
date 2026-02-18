# MealRec + Smart Planner — Development Roadmap

> **Версия**: 4.0  
> **Дата обновления**: 2026-02-18  
> **Статус**: Sprint 1 ✅ завершён → Sprint 2 в очереди

---

## Текущее состояние (Production, Feb 18 2026)

ц

### ✅ Реализовано

| Компонент                                            | Версия | Статус        |
| ---------------------------------------------------- | ------ | ------------- |
| Multi-meal timeline planner                          | v1.4.1 | ✅ production |
| Per-meal product recommender                         | v3.3.0 | ✅ production |
| Smart meal naming (Завтрак/Обед/Ужин по времени)     | v27.6  | ✅ production |
| Premium sub-card redesign (white bg, colored badges) | v27.6  | ✅ production |
| Physiological macro floors (carbs 20%, fat 15%)      | v1.4.1 | ✅ production |
| Card header: "Умный планировщик" badge               | v27.6  | ✅ production |
| ConfirmModal meal picker flow (кнопка "+")           | v15.0  | ✅ production |
| Smart Grams Pre-fill (suggestion.grams → modal)      | v15.0  | ✅ production |
| Toast after add + verification logging               | v15.0  | ✅ production |
| Smart meal auto-select в ConfirmModal по времени     | v13.0  | ✅ production |

### 🏗️ Текущая архитектура `pi_meal_planner.js`

```
planRemainingMeals()
  ├── Шаг 1: Инсулиновая волна последнего приёма (HEYS.InsulinWave.calculate)
  ├── Шаг 2: +30 мин окна жиросжигания → nextMealEarliest
  ├── Шаг 3: estimateSleepTarget (history + profile.sleepTarget, fallback 23:00)
  ├── Шаг 4: remainingBudget = target - eaten + macro floors
  ├── Шаг 5: Цикл: размещение приёмов с estimateWaveDuration()
  │           estimateWaveDuration: GI/fat/protein модификаторы → 2.5-5h clamp
  ├── Шаг 6: distributeBudget() + адаптивный 60/40..75/25 сплит по hoursToSleep
  └── Шаг 7: detectMealScenario → LATE_EVENING / LIGHT_SNACK / PROTEIN_DEFICIT / BALANCED
```

---

## Sprint 2 — MUST FIX (критичные пробелы)

### Блокер A: initialSearch не гарантирует нахождение продукта

**Проблема**: "Яйцо варёное" в suggestion vs "яйцо вареное" в базе → пустой
поиск.

**Решение** (~10 строк в `pi_ui_meal_rec_card.js`):

```javascript
const normalizeSearch = (name) =>
  name.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

HEYS.AddProductStep.show({
  initialSearch: normalizeSearch(suggestion.name),
  // ...
});
```

### Блокер B: Empty products crash

**Проблема**: `HEYS.products.getAll()` → `[]` при первом запуске / ошибке
синхронизации.

**Решение**:

```javascript
const products = HEYS?.products?.getAll?.() || [];
if (products.length === 0) {
  setTimeout(() => {
    if ((HEYS?.products?.getAll?.() || []).length === 0) {
      alert('Продукты ещё загружаются. Попробуйте через пару секунд.');
      return;
    }
    openModal();
  }, 1000);
  return;
}
```

### Блокер C: Race condition при двойном клике

**Решение**: `isProcessing` guard в `handleAddSuggestion()`.

---

## Sprint 3 — Научная глубина планировщика

> Цель: сделать `pi_meal_planner.js` клинически обоснованным, а не просто
> "посчитать остаток".

### S1. Chrono-Nutrition Distribution (приоритет: HIGH)

**Проблема**: сейчас `distributeBudget` опирается только на `hoursToSleep`.  
**Наука**: циркадная нутриция — оптимальное распределение калорий по времени
суток (Garaulet & Gómez-Abellán, 2014).

| Время суток   | Доля ккал | Обоснование                                             |
| ------------- | --------- | ------------------------------------------------------- |
| Утро (6–11)   | 30–35%    | Кортизол пик → инсулиновая чувствительность максимальна |
| Обед (11–15)  | 35–40%    | Пик пищеварительной активности                          |
| Вечер (18–22) | 25–30%    | Снижение метаболизма, подготовка ко сну                 |
| Перекус       | 5–10%     | Заполнение дефицита                                     |

**Реализация** в `distributeBudget()` — учитывать `timeOfDay` каждого приёма:

```javascript
function getChronoRatio(mealTimeHours) {
  if (mealTimeHours < 11) return 0.33; // утро
  if (mealTimeHours < 15) return 0.38; // обед
  if (mealTimeHours < 19) return 0.2; // полдник
  return 0.28; // вечер
}
// Нормализовать ratios, чтобы сумма = 1.0
```

**Логирование**:

```javascript
console.info('[MEALPLAN] [chrono] ⏰ Chrono ratios applied:', mealsWithRatios);
```

---

### S2. Protein-per-Meal Optimization (приоритет: HIGH)

**Проблема**: белок распределяется пропорционально ккал — неоптимально для
MPS.  
**Наука**: максимальный синтез мышечного белка при ~0.4 г/кг на приём, потолок
~40–50г (Areta et al., 2013).

**Реализация** в `detectMealScenario` / после `distributeBudget`:

```javascript
const optimalProtPerMeal = Math.min(
  40,
  Math.round((profile.weight || 70) * 0.4),
);
if (meal.macros.prot < optimalProtPerMeal && meal.macros.kcal > 200) {
  const protDelta = optimalProtPerMeal - meal.macros.prot;
  meal.macros.prot = optimalProtPerMeal;
  meal.macros.carbs = Math.max(
    10,
    meal.macros.carbs - Math.round((protDelta * 4) / 4),
  );
  console.info(
    '[MEALPLAN] [mps] 💪 Protein boosted to MPS optimal:',
    optimalProtPerMeal,
  );
}
```

---

### S3. Glycemic Load Per Meal (приоритет: MEDIUM)

**Наука**: GL (glycemic load) = GI × carbs / 100. Цель: < 20 на приём, <
100/день. Высокий GL вечером → нарушает сон (Ludwig, 2002).

**Реализация**: добавить поле `targetGL` в `mealBudget`, передавать в product
recommender:

```javascript
meal.targetGL = meal.hoursToSleep < 3 ? 10 : 20; // строже перед сном
// Product recommender: score -= gl > meal.targetGL ? 50 : 0
```

---

### S4. POST_WORKOUT Scenario (приоритет: MEDIUM)

**Наука**: анаболическое окно 2ч после тренировки — 0.3–0.4 г/кг белка + 0.8–1.2
г/кг углеводов для восстановления гликогена (Ivy, 2004).

**Реализация**: анализировать `day.workouts` в `planRemainingMeals`:

```javascript
const recentWorkout = day.workouts?.find(
  (w) => currentTimeHours - parseTime(w.endTime) < 2,
);
if (recentWorkout) {
  firstMeal.scenario = 'POST_WORKOUT';
  firstMeal.macros.prot = Math.round((profile.weight || 70) * 0.35);
  firstMeal.macros.carbs = Math.round((profile.weight || 70) * 1.0);
}
```

---

### S5. PRE_SLEEP Scenario с Sleep-Quality Foods (приоритет: MEDIUM)

**Наука**: триптофан → серотонин → мелатонин. Продукты за 2–3ч до сна влияют на
качество сна (Halson, 2014).  
Рекомендуются: молочные, орехи, бананы, индейка (высокий триптофан, низкий GI).

**Реализация**: новый сценарий `PRE_SLEEP` заменяет `LATE_EVENING`:

```javascript
const SLEEP_FRIENDLY_PRODUCT_CATEGORIES = [
  'dairy',
  'nuts',
  'legumes',
  'poultry',
];
// В product recommender: при scenario=PRE_SLEEP буст score для этих категорий
```

---

### S6. Adaptive Wave от персональных данных (приоритет: MEDIUM)

**Проблема**: `estimateWaveDuration` использует `profile.insulinWaveHours` —
статично.  
**Решение**: вычислять персональную волну из исторических данных:

```javascript
function estimatePersonalWaveHours(days) {
  const gaps = [];
  days.slice(-14).forEach((d) => {
    const meals = d?.meals || [];
    for (let i = 1; i < meals.length; i++) {
      const gap = parseTime(meals[i].time) - parseTime(meals[i - 1].time);
      if (gap >= 2 && gap <= 6) gaps.push(gap); // фильтр аномалий
    }
  });
  if (gaps.length < 5) return null; // недостаточно данных
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)]; // медиана
}
```

---

### S7. TEF-Aware Effective Kcal (приоритет: LOW)

**Наука**: Thermic Effect of Food — белок 25–30%, углеводы 6–8%, жиры 2–3%
сжигаются при переваривании.  
Уже частично реализовано: protein = **3 ккал/г** (TEF-adjusted формула). Полная
реализация — в `distributeBudget` учитывать effective kcal при размещении:

```javascript
const effectiveKcal = prot * 3 * 0.75 + carbs * 4 * 0.93 + fat * 9 * 0.97;
```

---

## Правила реализации

- `pi_meal_planner.js` — только логика (без UI)
- `pi_ui_meal_rec_card.js` — только рендер (без вычислений)
- Все научные параметры — именованные константы с источником в комментарии
- Verification logging обязателен для каждого нового шага
- `pnpm test:run` после каждого изменения

---

## Acceptance Criteria

### Sprint 2

- [ ] Нормализация имён (ё→е) в `initialSearch` — search success > 85%
- [ ] Empty products: retry 1000ms + graceful alert
- [ ] Debounce / `isProcessing` guard на кнопке "+"

### Sprint 3

- [ ] `distributeBudget` учитывает время суток (chrono ratios), сумма = 1.0
- [ ] `optimalProtPerMeal = profile.weight × 0.4` (max 40г) с ребалансировкой
      carbs
- [ ] `meal.targetGL` передаётся в product recommender
- [ ] `POST_WORKOUT` сценарий активируется при `day.workouts` за последние 2ч
- [ ] `PRE_SLEEP` сценарий с буст-скором для sleep-friendly категорий
- [ ] `estimatePersonalWaveHours` возвращает медиану гэпов из `days[-14:]`
- [ ] Логи показывают научную причину каждого решения

---

## Файлы

| Файл                                       | Назначение                           |
| ------------------------------------------ | ------------------------------------ |
| `apps/web/insights/pi_meal_planner.js`     | Логика планирования v1.4.1           |
| `apps/web/insights/pi_ui_meal_rec_card.js` | Карточка рекомендации v27.6          |
| `apps/web/heys_add_product_step_v1.js`     | Модалка добавления продукта          |
| `styles/heys-components.css`               | Стили sub-карточек (lines 5135–5240) |
