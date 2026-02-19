# MealRec + Smart Planner — Development Roadmap

> **Версия**: 6.0  
> **Дата обновления**: 2026-02-19  
> **Статус**: Sprint 1 ✅ + Sprint 2 ✅ + Sprint 3 ✅ + Science UX ✅ — все
> завершены

---

## Текущее состояние (Production, Feb 19 2026)

### ✅ Реализовано

| Компонент                                            | Версия | Статус        |
| ---------------------------------------------------- | ------ | ------------- |
| Multi-meal timeline planner                          | v1.5.0 | ✅ production |
| Per-meal product recommender                         | v3.3.0 | ✅ production |
| Smart meal naming (Завтрак/Обед/Ужин по времени)     | v27.6  | ✅ production |
| Premium sub-card redesign (white bg, colored badges) | v27.6  | ✅ production |
| Physiological macro floors (carbs 20%, fat 15%)      | v1.4.1 | ✅ production |
| Card header: "Умный планировщик" badge               | v27.6  | ✅ production |
| **User-friendly prompt (multi-meal subtitle)**       | v27.7  | ✅ production |
| ConfirmModal meal picker flow (кнопка "+")           | v15.0  | ✅ production |
| Smart Grams Pre-fill (suggestion.grams → modal)      | v15.0  | ✅ production |
| Toast after add + verification logging               | v15.0  | ✅ production |
| Smart meal auto-select в ConfirmModal по времени     | v13.0  | ✅ production |
| **Sprint 2A: normalizeSearch ё→е**                   | v27.7  | ✅ production |
| **Sprint 2B: empty products guard (retry 1s)**       | v27.7  | ✅ production |
| **Sprint 2C: isProcessing guard (double-click)**     | v27.7  | ✅ production |
| **S1: Chrono-Nutrition distribution**                | v1.5.0 | ✅ production |
| **S2: MPS protein-per-meal optimization**            | v1.5.0 | ✅ production |
| **S3: Glycemic Load per meal (targetGL)**            | v1.5.0 | ✅ production |
| **S4: POST_WORKOUT scenario (2ч окно)**              | v1.5.0 | ✅ production |
| **S5: PRE_SLEEP scenario (sleep-friendly foods)**    | v1.5.0 | ✅ production |
| **S6: Adaptive wave from 14d history (median)**      | v1.5.0 | ✅ production |
| **SMART_PLANNER entry in SCIENCE_INFO**              | —      | ✅ production |
| **InfoButton modal (научное обоснование)**           | v27.8  | ✅ production |
| **`[MEALREC]` verification logging (all modules)**   | —      | ✅ production |

**v27.7 Prompt (Feb 18 2026):**

> "Не знаете, что правильно поесть сегодня? Умный планировщик подскажет вам. Вы
> можете просто следовать его рекомендациям, и ваш день будет идеальным по
> питанию!"

### 🏗️ Текущая архитектура `pi_meal_planner.js` (v1.5.0)

```
planRemainingMeals()
  ├── Шаг 1: Инсулиновая волна последнего приёма (HEYS.InsulinWave.calculate)
  ├── Шаг 2: +30 мин окна жиросжигания → nextMealEarliest
  ├── Шаг 3: estimateSleepTarget (history + profile.sleepTarget, fallback 23:00)
  ├── Шаг 4: remainingBudget = target - eaten + macro floors (carbs 20%, fat 15%)
  ├── Шаг 5: Цикл: размещение приёмов
  │           ├── estimateWaveDuration: GI/fat/protein модификаторы → 2.5-5h clamp
  │           └── S6: estimatePersonalWaveHours(14d median gaps) → effectiveProfile
  ├── Шаг 6: distributeBudget()
  │           ├── Адаптивный сплит 60/40..75/25 по hoursToSleep
  │           ├── S1: Chrono-Nutrition ratios (Garaulet 2014) — 70% chrono + 30% sleep blend
  │           ├── S2: MPS protein boost (0.4г/кг, max 40г per meal, Areta 2013)
  │           └── S3: targetGL (Ludwig 2002) — <20 day, <10 pre-sleep
  ├── Шаг 7: detectMealScenario()
  │           ├── S4: POST_WORKOUT (prot 0.35г/кг + carbs 1.0г/кг, Ivy 2004)
  │           ├── S5: PRE_SLEEP (sleep-friendly: dairy/nuts/legumes/poultry, Halson 2014)
  │           ├── LIGHT_SNACK / PROTEIN_DEFICIT / BALANCED
  └── Verification logging: [MEALREC] prefix throughout
```

### 🔬 Научная InfoButton модалка

При клике на ⓘ рядом с бейджем «Умный планировщик» открывается модалка
(`SCIENCE_INFO.SMART_PLANNER` в `pi_constants.js`) с:

- 🧠 Коротко: 6 принципов доказательной нутрициологии
- Подробности: хроно-ритм, MPS, GL, анаб.окно, сон, личный ритм
- Формулы S1-S6 с параметрами
- 5 источников (3×Level A + 2×Level B, все с PubMed PMID)
- Evidence Level A, Confidence 0.88

---

## Sprint 2 — MUST FIX ✅ (завершён Feb 18 2026)

### ✅ Блокер A: normalizeSearch ё→е

Реализовано в `pi_ui_meal_rec_card.js` — `normalizeSearch()` нормализует ё→е,
пробелы, регистр. Log: `[sprint2A] 🔤 normalizeSearch`.

### ✅ Блокер B: Empty products guard

Retry 1000ms + graceful alert при `products.length === 0`. Log: `[sprint2B]`.

### ✅ Блокер C: isProcessing race condition guard

`isProcessing` ref предотвращает двойной клик на "+". Log: `[sprint2]`.

---

## Sprint 3 — Научная глубина ✅ (завершён Feb 18 2026)

### ✅ S1. Chrono-Nutrition Distribution

**Наука**: Garaulet & Gómez-Abellán, 2014 (PMID: 23877420).  
**Реализация**: `getChronoRatio()` + 70% chrono / 30% sleep blend в
`distributeBudget()`.  
**Лог**: `[chrono] ⏰ Chrono-Nutrition ratios applied: Meal1@15.8h=47%, Meal2@20.8h=53%`

### ✅ S2. MPS Protein-per-Meal Optimization

**Наука**: Areta et al., 2013 (PMID: 23459753) — 0.4 г/кг, max 40г.  
**Реализация**: `optimalProtPerMeal` + boost + carb rebalance после
`distributeBudget()`.  
**Лог**: `[mps] 💪 MPS protein boost` (fires только когда prot < порога)

### ✅ S3. Glycemic Load Per Meal

**Наука**: Ludwig, 2002 (PMID: 12002800).  
**Реализация**: `targetGL` = 20 (day) / 10 (pre-sleep, <3ч до сна) на каждый
приём.

### ✅ S4. POST_WORKOUT Scenario

**Наука**: Ivy, 2004 (PMID: 15212750) — prot 0.35г/кг + carbs 1.0г/кг.  
**Реализация**: `detectMealScenario()` → `POST_WORKOUT` при `day.workouts` <2ч.

### ✅ S5. PRE_SLEEP Scenario

**Наука**: Halson, 2014 (PMID: 24435400).  
**Реализация**: `PRE_SLEEP` при `hoursToSleep < 4`, sleep-friendly categories:
dairy, nuts, legumes, poultry.

### ✅ S6. Adaptive Wave Estimation

**Реализация**: `estimatePersonalWaveHours(days)` — медиана gap 2-6ч из 14 дней,
min 5 samples.  
**Лог**: `[wave] 🧬 Personal wave estimated: personalWaveHours=3.75, sampleDays=14`

### ⏸️ S7. TEF-Aware Effective Kcal (отложен)

**Приоритет**: LOW. Частично покрыто формулой protein = 3 ккал/г.  
**Решение**: отложен на Sprint 5 — минимальный эффект при текущей точности.

---

## Sprint 4 — Performance & Quality (предложение)

> Из production-логов выявлены возможности оптимизации.

### P1. Excessive diary re-renders (приоритет: HIGH)

**Проблема**: `[HEYS.diary] ✅ Meal rec card rendered` выводится **40+ раз** за
одну загрузку страницы. Причина: `heys_day_diary_section.js` рендерится при
каждом update React-дерева, а лог стоит безусловно.

**Решение**: подавить лог при отсутствии реальных изменений:

```javascript
// Добавить debounce/ref чтобы логировать только первый рендер
const mealRecRenderedRef = useRef(false);
if (mealRecCard && !mealRecRenderedRef.current) {
  console.info('[HEYS.diary] ✅ Meal rec card rendered');
  mealRecRenderedRef.current = true;
}
```

### P2. Двойной цикл рекомендации (приоритет: MEDIUM)

**Проблема**: полный цикл
`recommendNextMeal → planRemainingMeals → productPicker` отрабатывает **дважды**
за одну загрузку. Видно в логах: два полных набора
`useMemo triggered → recommend → plan → products → enhanced → rendered`.

**Причина**: React.StrictMode двойной рендер + `fetchDays` триггерит повторный
рендер diary section.

**Решение**: усилить `React.memo` comparator в `MemoizedMealRecommenderCard` —
добавить сравнение `day?.updatedAt` или `day?.date`:

```javascript
const MemoizedMealRecommenderCard = React.memo(MealRecommenderCard, (prev, next) => {
  return (
    prev.day?.date === next.day?.date &&
    prev.day?.updatedAt === next.day?.updatedAt &&
    // ... existing checks
  );
});
```

### P3. Product Picker: per-meal продукты идентичны (приоритет: MEDIUM)

**Проблема**: в multi-meal mode оба приёма получают **одинаковые 15 продуктов**
(одинаковые имена, одинаковый порядок). Product Picker не учитывает, что приём 1
уже рекомендовал данный продукт.

**Решение**: передавать `excludeProducts` из предыдущего приёма:

```javascript
// В recommendNextMeal, при генерации per-meal products:
const usedProducts = new Set();
for (const meal of meals) {
  const products = generateSmartMealSuggestions({
    ...params,
    excludeProducts: [...usedProducts],
  });
  products.forEach((p) => usedProducts.add(p.name));
  meal.suggestions = products;
}
```

### P4. Sleep target estimation: позднее время (приоритет: LOW)

**Наблюдение**: `sleepTarget: '24:59'` (1:00 ночи) — определяется по
`avgLastMeal: '21:59' + 3ч`. Если пользователь обычно ест поздно, система
предполагает поздний сон. Может привести к рекомендации ужина в 21:47.

**Решение**: clamp `sleepTarget` к разумному диапазону 22:00–01:30:

```javascript
const sleepTargetClamped = Math.max(22, Math.min(25.5, sleepTarget));
```

### P5. Protein 359г в одном приёме — аномалия (приоритет: HIGH)

**Проблема**: в логах `Final meal macros: protein: 359` — это физически
невозможно. Причина: LAST MEAL OVERRIDE ставит 50% белка от 1844 ккал = 307г
prot, а потом Phase A macro modifier ещё увеличивает до 359г.

**Решение**: добавить protein cap per meal (max 80-100г):

```javascript
const PROTEIN_CAP_PER_MEAL = 100; // г, физически разумный потолок
meal.prot = Math.min(meal.prot, PROTEIN_CAP_PER_MEAL);
```

---

## Sprint 5 — ✅ (завершён Feb 19 2026)

### S7. TEF-Aware Effective Kcal ✅

Добавлено поле `effectiveKcal` в `distributeBudget`: `prot×3 + carbs×4 + fat×9`.
Верификационный лог:
`TEF-adjusted budgets (S7): Meal1: Xkcal nominal → Ykcal effective`.

### F1. PRE_SLEEP product boost ✅ (реализовано в pi_product_picker.js v3.3)

### F2. targetGL интеграция ✅ (реализовано в pi_product_picker.js v3.4)

### F3. POST_WORKOUT carbs boost ✅ (реализовано в pi_product_picker.js v3.5)

### F4. Feedback-driven Product Ranking ✅ (реализовано в pi_product_picker.js v3.6)

---

## Правила реализации

- `pi_meal_planner.js` — только логика (без UI)
- `pi_ui_meal_rec_card.js` — только рендер (без вычислений)
- Все научные параметры — именованные константы с источником в комментарии
- Verification logging обязателен: `[MEALREC][module] prefix + emoji`
- `pnpm test:run` после каждого изменения

---

## Acceptance Criteria

### Sprint 2 ✅

- [x] Нормализация имён (ё→е) в `initialSearch` — search success > 85%
- [x] Empty products: retry 1000ms + graceful alert
- [x] Debounce / `isProcessing` guard на кнопке "+"

### Sprint 3 ✅

- [x] `distributeBudget` учитывает время суток (chrono ratios), сумма = 1.0
- [x] `optimalProtPerMeal = profile.weight × 0.4` (max 40г) с ребалансировкой
      carbs
- [x] `meal.targetGL` передаётся в product recommender
- [x] `POST_WORKOUT` сценарий активируется при `day.workouts` за последние 2ч
- [x] `PRE_SLEEP` сценарий с буст-скором для sleep-friendly категорий
- [x] `estimatePersonalWaveHours` возвращает медиану гэпов из `days[-14:]`
- [x] Логи показывают научную причину каждого решения

### Science UX ✅

- [x] `SMART_PLANNER` entry в `SCIENCE_INFO` с 5 источниками (PMID)
- [x] InfoButton modal рядом с бейджем «Умный планировщик»
- [x] `[MEALREC]` verification logging во всех модулях

### Sprint 4 ✅ (завершён Feb 19 2026)

- [x] Diary re-renders: ≤3 лога за загрузку (вместо 40+)
- [x] Двойной recommendation cycle устранён
- [x] Per-meal product deduplication в multi-meal mode
- [x] Sleep target clamp 22:00–00:30
- [x] Protein cap 100г per meal

### Sprint 5 ✅ (завершён Feb 19 2026)

- [x] S7: `effectiveKcal` в `distributeBudget` (protein=3kcal/g TEF, Halton &
      Hu 2004)
- [x] F1: PRE_SLEEP product boost (pi_product_picker.js v3.3)
- [x] F2: targetGL GL penalty (pi_product_picker.js v3.4)
- [x] F3: POST_WORKOUT carbs boost (pi_product_picker.js v3.5)
- [x] F4: Feedback EMA ML weights per product+scenario (pi_product_picker.js
      v3.6)

### Sprint 6 ✅ (завершён Feb 19 2026)

- [x] R1: Last-meal protein overflow —
      PROTEIN_DEFICIT/POST_WORKOUT/STRESS_EATING используют `remainingProtein`
      (не `50%*kcal`) — P5-cap больше не срабатывает зря
- [x] R2: `profileId: n/a` вместо `undefined` в log recommendNextMeal
- [x] R3: C15/C35 Phase A macro modifiers не бустят protein для `isLastMeal` —
      решает цепочку R1→C35→P5-cap (117g→100g)
- [x] pi_meal_recommender.js: v3.3.1 → v3.4.1
- [x] pi_meal_planner.js: v1.9.1 → v2.0.0

### Sprint 7 ✅ (завершён Feb 19 2026)

- [x] S8: forceMultiMeal теперь реально планирует 2 приёма — volume-scaled
      personal wave + tight 2h gap
  - `estimateWaveDuration` получил `totalBudgetKcal` — sqrt-scaling при split
    (меньше порция → короче волна)
  - `forceMultiMeal` использует min(wave, 2h) gap вместо wave+fatBurn
    (Louis-Sylvestre & Le Magnen, 1980)
  - cursor сдвигается на nextPossibleStart, не на fatBurnEnd
- [x] S9: Phenotype auto-detect — `recommendNextMeal` автоматически вызывает
      `autoDetect()` если `!profile.phenotype && days>=30`
  - Результат кладётся в `profile.phenotype` → `enhanceRecommendation` теперь
    применяет `getPhenotypeAdjustedMacros`
  - `phenotypeApplied: true` в логах при наличии 30+ дней
- [x] pi_meal_recommender.js: v3.4.1 → v3.5.0
- [x] pi_meal_planner.js: v2.0.0 → v2.1.0

---

## Файлы

| Файл                                        | Назначение                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/web/insights/pi_meal_planner.js`      | Логика планирования v2.1.0 (S8: volume-scaled wave + forceMultiMeal fix)                      |
| `apps/web/insights/pi_ui_meal_rec_card.js`  | Карточка рекомендации v27.8 (Sprint 2A/B/C)                                                   |
| `apps/web/insights/pi_meal_recommender.js`  | Engine v3.5.0 (S9 phenotype auto-detect + R1/R3 protein fix)                                  |
| `apps/web/insights/pi_product_picker.js`    | Product scoring **v4.0.0** (S10: 15-factor, macro alignment 49%, fat alignment, soft kcalFit) |
| `apps/web/insights/pi_constants.js`         | SCIENCE_INFO.SMART_PLANNER                                                                    |
| `apps/web/insights/pi_ui_dashboard.js`      | InfoButton component (modal + portal)                                                         |
| `apps/web/insights/pi_meal_rec_patterns.js` | Dynamic patterns v3.0 (12 patterns, confidence)                                               |
| `apps/web/insights/pi_feedback_loop.js`     | ML feedback loop v1.1                                                                         |
| `apps/web/insights/pi_meal_rec_feedback.js` | Feedback storage v1.1 (local + cloud)                                                         |
| `apps/web/insights/pi_outcome_modal.js`     | Outcome modal v1.0                                                                            |
| `apps/web/heys_add_product_step_v1.js`      | Модалка добавления продукта                                                                   |
| `apps/web/heys_day_diary_section.js`        | Diary section (рендер карточки)                                                               |
| `styles/heys-components.css`                | Стили sub-карточек + badge                                                                    |

### Sprint 8 (S10) — Scoring Refactoring (Planned Feb 19 2026)

### 🎯 Goal: Fix "Flat Scoring" & Improve Intelligence

Currently, products score 54-57 points indiscriminately because binary factors
(caffeine, sugar) dominate (58% weight), while macro alignment uses broken math
(g/kcal vs En%).

### 🛠️ Changes (v4.0.0)

1. **Rebalance Weights**:
   - Protein: 0.20 → **0.25**
   - Carbs: 0.11 → **0.14**
   - Fat: 0.00 → **0.10** (New!)
   - Kcal Fit: 0.11 → **0.15**
   - Binary Factors: 0.58 → **0.06** (Drastically reduced to tie-breakers)

2. **Fix Math**:
   - proteinAlignment: Use **Energy %** (g\*4/kcal) for both product and target.
   - carbAlignment: Use **Energy %**.
   - atAlignment: Added (g\*9/kcal).

3. **Soft Penalties**:
   - kcalFit: Replace sharp cutoff at 80% with soft curve (0.8-1.2 range
     allowed).
   - glPenalty: Soften gradient.

4. **Verification**:
   - Expect distinct scores (e.g., Chicken 92 vs Cake 35 for Protein goal).
