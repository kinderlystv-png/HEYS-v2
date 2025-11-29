# Advice Module Phase 2 — 26 новых советов

**Дата**: 2025-11-29  
**Приоритет**: 🟡 Средний  
**Время**: ~2-3 часа (Phase 0 проверки + 4 фазы реализации)  
**Зависимости**: Advice Module v1 (77 советов уже реализовано)

---

## 📋 Описание

Расширение модуля советов до **103 уникальных типов**. Новые советы основаны на уже существующих данных в модели — не требуют новых полей.

**Справочник данных**: [DATA_MODEL_REFERENCE.md](../DATA_MODEL_REFERENCE.md)

---

## 🔴 PHASE 0: ОБЯЗАТЕЛЬНЫЕ ПРОВЕРКИ (5-10 мин)

> ⚠️ **НЕ НАЧИНАТЬ реализацию пока все проверки не пройдены!**

### Команды для консоли браузера:

```javascript
// ═══════════════════════════════════════════════════════════
// B1: HEYS.models.mealTotals доступность
// ═══════════════════════════════════════════════════════════
console.log('B1 — mealTotals:', typeof HEYS?.models?.mealTotals === 'function' ? '✅ OK' : '❌ FAIL');

// ═══════════════════════════════════════════════════════════
// B2: Тест пустого дня — не должен упасть
// ═══════════════════════════════════════════════════════════
try {
  const testCtx = { 
    dayTot: {}, 
    normAbs: {}, 
    day: { meals: [] }, 
    hour: 12, 
    mealCount: 0,
    currentStreak: 0,
    tone: 'active',
    optimum: 2000
  };
  const result = HEYS.advice.generateAdvices?.(testCtx);
  console.log('B2 — пустой день:', Array.isArray(result) ? '✅ OK' : '❌ FAIL');
} catch(e) {
  console.log('B2 — пустой день: ❌ FAIL', e.message);
}

// ═══════════════════════════════════════════════════════════
// B3: localStorage размер (должен быть < 5MB)
// ═══════════════════════════════════════════════════════════
const lsSize = (JSON.stringify(localStorage).length / 1024 / 1024).toFixed(2);
console.log('B3 — localStorage:', parseFloat(lsSize) < 5 ? `✅ OK (${lsSize}MB)` : `❌ WARN (${lsSize}MB)`);

// ═══════════════════════════════════════════════════════════
// B4: Счётчик советов в advice модуле
// ═══════════════════════════════════════════════════════════
const fullCtx = {
  dayTot: { kcal: 1500, prot: 80, carbs: 150, fat: 50, fiber: 20 },
  normAbs: { kcal: 2000, prot: 100, carbs: 250, fat: 70, fiber: 25 },
  day: { meals: [{ items: [{ id: 1 }] }], trainings: [] },
  hour: 14,
  mealCount: 1,
  currentStreak: 2,
  tone: 'active',
  optimum: 2000,
  prof: {}
};
const advices = HEYS.advice.generateAdvices?.(fullCtx) || [];
console.log('B4 — советов в модуле:', advices.length, '(ожидается ~10-20 для базового контекста)');

// ═══════════════════════════════════════════════════════════
// B5: Phase 0 helpers доступность
// ═══════════════════════════════════════════════════════════
const helpers = [
  'getMealTotals', 'getLastMealWithItems', 'getFirstMealWithItems',
  'isMilestoneShown', 'markMilestoneShown', 'countUniqueProducts',
  'getTotalDaysTracked', 'getPersonalBestStreak', 'updatePersonalBestStreak',
  'canShowMealAdvice', 'markMealAdviceShown', 'getRecentDays'
];
const missing = helpers.filter(h => typeof HEYS?.advice?.[h] !== 'function');
console.log('B5 — helpers:', missing.length === 0 ? '✅ OK (12/12)' : `❌ MISSING: ${missing.join(', ')}`);
```

### Чеклист проверок:

| # | Проверка | Ожидаемый результат | Статус |
|---|----------|---------------------|--------|
| B1 | `HEYS.models.mealTotals` | `✅ OK` | ⏳ |
| B2 | Пустой день без ошибки | `✅ OK` | ⏳ |
| B3 | localStorage < 5MB | `✅ OK (<X.XX MB)` | ⏳ |
| B4 | Советов ~10-20 базовых | Число в консоли | ⏳ |
| B5 | Helpers 12/12 | `✅ OK (12/12)` | ⏳ |

> ✅ **Все проверки пройдены?** → Переходи к Phase 1!

---

## 🎯 Новые советы по фазам (после удаления дубликатов)

### Phase 1: Meal-level советы (7 советов) — ~30 мин

Советы на уровне отдельных приёмов пищи.

| ID | Условие | Текст | Триггер |
|----|---------|-------|---------|
| `meal_too_large` | `lastMeal.kcal > 800` | "Большой приём! Следующий сделай полегче 🍽️" | product_added |
| `meal_too_small` | `meal.kcal < 150 && mealCount >= 2` | "Маловато — добавь ещё что-нибудь" | product_added |
| `protein_per_meal_low` | `meal.prot < 20 && meal.kcal > 200` | "Мало белка в приёме — добавь яйцо или творог" | product_added |
| `evening_carbs_high` | `hour >= 20 && lastMeal.carbs > 50` | "Много углеводов на ночь — утром может быть голодно" | product_added |
| `fiber_per_meal_good` | `meal.fiber > 8` | "Отлично с клетчаткой! Надолго насытит 🥗" | product_added |
| `variety_meal_good` | `meal.items.length >= 4` | "Разнообразный приём — так держать! 🌈" | product_added |
| `late_first_meal` | `firstMeal.time >= '12:00' && hour >= 13` | "Первый приём поздновато — завтра попробуй раньше" | tab_open |

**Реализация:**
```javascript
// Использовать getMealTotals из Phase 0
const lastMeal = getLastMealWithItems(day);
if (lastMeal) {
  const mealTot = getMealTotals(lastMeal, pIndex);
  if (mealTot && mealTot.kcal > 800) { ... }
}
```

---

### Phase 2: Day-quality советы (6 советов) — ~25 мин

Советы об общем качестве дня. **Удалены дубликаты!**

| ID | Условие | Текст | Триггер |
|----|---------|-------|---------|
| `trans_free_day` | `dayTot.trans === 0 && mealCount >= 2` | "День без транс-жиров! 🎉" | tab_open |
| `sugar_low_day` | `dayTot.simple < 25 && mealCount >= 2` | "Почти без сахара — отлично! 🍬❌" | tab_open |
| `super_hydration` | `waterMl >= 2500` | "Гидратация на максимуме! 💧💧💧" | tab_open |
| `variety_day_good` | `uniqueProducts >= 10` | "10+ разных продуктов — отличное разнообразие! 🌈" | tab_open |
| `deficit_on_track` | `kcalPct 0.85-0.95 && deficitPct > 0` | "Дефицит идёт по плану! 📊" | tab_open |
| `weekend_relax` | `(Сб или Вс) && kcalPct 1.1-1.3` | "Выходной расслабляешься — это нормально 🛋️" | tab_open |

**Удалены:**
- ~~`high_protein_day`~~ → дубликат `protein_champion`
- ~~`all_macros_perfect`~~ → дубликат `balanced_macros`
- ~~`hydration_perfect`~~ → заменён на `super_hydration` (2500мл)

---

### Phase 3: Timing & Patterns (6 советов) — ~45 мин

Советы о времени и паттернах питания.

| ID | Условие | Текст | Триггер |
|----|---------|-------|---------|
| `fasting_window_good` | `gap ужин→завтрак >= 14h` | "14+ часов без еды — отличное окно! 🕐" | tab_open |
| `long_fast_warning` | `gap между приёмами > 7h && hour 10-18` | "Давно не ел — не переешь потом!" | tab_open |
| `meal_spacing_perfect` | `все gaps 3-5 часов && meals >= 3` | "Идеальные интервалы между приёмами! ⏱️" | tab_open |
| `training_recovery_window` | `30-60 мин после тренировки` | "Окно восстановления — белок сейчас усвоится лучше! 🏋️" | tab_open |
| `sleep_debt_accumulating` | `3 дня < 6 часов сна` | "Накопился недосып — сегодня ляг пораньше! 😴" | tab_open |
| `stress_eating_detected` | `avgStress >= 4 && kcalPct > 1.15` | "Стресс → перекус? Попробуй прогулку вместо еды 🚶" | tab_open |

---

### Phase 4: Trends & Milestones (7 советов) — ~45 мин

Советы о трендах и достижениях. **Используют localStorage!**

| ID | Условие | Текст | Триггер | Storage |
|----|---------|-------|---------|---------|
| `weight_trend_down` | `7-day trend < -0.3kg/week` | "Вес уходит! Так держать 📉" | tab_open | session |
| `weight_trend_up` | `7-day trend > +0.5kg/week` | "Вес растёт быстро — проверь калории 📈" | tab_open | session |
| `milestone_7_days` | `totalDaysTracked === 7` | "Неделя с HEYS! Привычка формируется 📅" | tab_open | **localStorage** |
| `milestone_30_days` | `totalDaysTracked === 30` | "Месяц с HEYS! Ты молодец 🎉" | tab_open | **localStorage** |
| `milestone_100_days` | `totalDaysTracked === 100` | "100 дней! Ты легенда 🏆" | tab_open | **localStorage** |
| `new_record_streak` | `currentStreak === personalBestStreak` | "Рекордный streak! 🔥🔥🔥" | tab_open | **localStorage** |
| `first_training_ever` | `первая тренировка в истории` | "Первая тренировка в HEYS! Начало положено 🏃" | tab_open | **localStorage** |

---

## 💡 WOW-эффекты и современные фичи

### 🎨 Визуальные улучшения (Phase 5 — опционально)

| Идея | Описание | Сложность | Приоритет |
|------|----------|-----------|-----------|
| **Confetti для milestones** | Конфетти при 7/30/100 днях | Easy (уже работает для streak_7) | ✅ Включено |
| **Haptic feedback** | Вибрация для achievements/warnings | Easy (уже работает в DayTab) | ✅ Включено |
| **Animated emoji** | CSS `@keyframes pulse` для иконок | Easy | 🟡 Nice-to-have |
| **Gradient toast** | Разные цвета по категориям | Easy | 🟡 Nice-to-have |
| ~~Sound effects~~ | ~~Тихий звук при достижении~~ | ~~Medium~~ | ❌ Оверкилл |

### 🚀 Современные UX-паттерны (рекомендуется)

| Паттерн | Описание | Как реализовать |
|---------|----------|-----------------|
| **Progressive disclosure** | Совет → "Подробнее" → детали | Уже работает через `details` поле |
| **Contextual timing** | Советы только когда уместно | Уже работает через `tone` (silent/gentle/active/calm) |
| **Emotional awareness** | Не критикуй при стрессе | Уже работает через `filterByEmotionalState()` |
| **Gamification streak** | Визуализация прогресса | ✅ Milestones с confetti |
| **Micro-celebrations** | Мини-праздник за успехи | ✅ `showConfetti: true` |
| **Smart throttling** | Не спамить советами | ⚠️ Добавить в Phase 0 |

### 🧠 Умные советы (Future Scope — НЕ в этом промпте)

| Идея | Почему отложено |
|------|-----------------|
| AI-рецепты | Требует интеграции с LLM API |
| Погодные советы | Требует Weather API + геолокация |
| Сезонные продукты | Требует базу сезонности |
| Social comparison | Требует backend + приватность |

### 📊 Аналитические советы (Phase 5+ — опционально)

| ID | Условие | Описание | Сложность |
|----|---------|----------|-----------|
| `weekly_protein_avg` | 7-day protein < 80% | "На неделе мало белка" | Medium |
| `weekly_fiber_avg` | 7-day fiber < 70% | "Клетчатка за неделю низкая" | Medium |
| `best_day_of_week` | статистика 28 дней | "Понедельники — твои лучшие дни!" | Hard |
| `worst_time_slot` | анализ переедания | "После 20:00 чаще срывы" | Hard |

> **Рекомендация**: Phase 5 советы требуют больше данных и сложнее в реализации. Лучше добавить их позже, когда основные 26 советов будут стабильно работать.

---

## 🎯 Рекомендации для WOW-эффекта

### 1. Персонализация текстов (Easy Win)
```javascript
// Вместо: "Месяц с HEYS!"
// Лучше:  "Месяц с HEYS, ${firstName}! 🎉"
const firstName = prof?.firstName || '';
const text = firstName 
  ? `Месяц с HEYS, ${firstName}! Ты молодец 🎉` 
  : 'Месяц с HEYS! Ты молодец 🎉';
```

### 2. Динамические числа (Easy Win)
```javascript
// Вместо: "Много углеводов на ночь"
// Лучше:  "50г углеводов после 20:00 — может быть голодно утром"
const text = `${Math.round(mealTot.carbs)}г углеводов после 20:00 — утром может быть голодно`;
```

### 3. Контекстные иконки (Easy Win)
```javascript
// Разные иконки для разных достижений
const milestoneIcons = {
  7: '📅',    // Неделя
  30: '🎉',   // Месяц
  100: '🏆',  // 100 дней
  365: '👑'   // Год
};
```

### 4. Gradient badges для категорий (CSS)
```css
/* Добавить в стили */
.advice-badge-nutrition { background: linear-gradient(135deg, #4CAF50, #8BC34A); }
.advice-badge-achievement { background: linear-gradient(135deg, #FFD700, #FFA500); }
.advice-badge-lifestyle { background: linear-gradient(135deg, #2196F3, #03A9F4); }
.advice-badge-timing { background: linear-gradient(135deg, #9C27B0, #E91E63); }
```

### 5. Pulse animation для эмодзи (CSS)
```css
@keyframes advice-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}
.advice-icon-animate { animation: advice-pulse 0.5s ease-in-out; }
```

---

## 📁 Ключевые файлы

| Файл | Действие |
|------|----------|
| `apps/web/heys_advice_v1.js` | Добавить 26 новых советов + helpers |
| `docs/DATA_MODEL_REFERENCE.md` | Обновить таблицу советов |

---

## ✅ Чеклист по фазам

### Phase 0: Фундамент (ОБЯЗАТЕЛЬНО!) — ✅ ВЫПОЛНЕН
- [x] P0.1: Helper `getMealTotals(meal, pIndex)` с fallback
- [x] P0.2: Проверено — `getRecentDays` использует clientId
- [x] P0.3: Helper `getLastMealWithItems(day)` + `getFirstMealWithItems(day)`
- [x] P0.4: Helpers `isMilestoneShown` / `markMilestoneShown`
- [x] P0.5: Helper `countUniqueProducts(day)`
- [x] P0.6: Helper `getTotalDaysTracked()` с фильтрацией clientId
- [x] P0.7: Helper `getPersonalBestStreak()` + `updatePersonalBestStreak()`
- [x] P0.8: Исправлен `getTotalDaysTracked()` — фильтрация по clientId
- [x] P0.9: Добавлен throttle для meal-level советов (3 сек)
- [x] **P0.11**: Все helpers добавлены в `window.HEYS.advice` exports

### Phase 1: Meal-level
- [ ] Реализовать `meal_too_large`
- [ ] Реализовать `meal_too_small`
- [ ] Реализовать `protein_per_meal_low`
- [ ] Реализовать `evening_carbs_high`
- [ ] Реализовать `fiber_per_meal_good`
- [ ] Реализовать `variety_meal_good`
- [ ] Реализовать `late_first_meal`

### Phase 2: Day-quality
- [x] ~~Добавить helper `countUniqueProducts(day)`~~ (уже в Phase 0)
- [ ] Реализовать `trans_free_day`
- [ ] Реализовать `sugar_low_day`
- [ ] Реализовать `super_hydration`
- [ ] Реализовать `variety_day_good`
- [ ] Реализовать `deficit_on_track`
- [ ] Реализовать `weekend_relax`

### Phase 3: Timing & Patterns
- [ ] Добавить helper `calculateFastingWindow(today, yesterday)`
- [ ] Добавить helper `getMaxMealGap(day)`
- [ ] Добавить helper `getSleepDebtDays(n)`
- [ ] Реализовать `fasting_window_good`
- [ ] Реализовать `long_fast_warning`
- [ ] Реализовать `meal_spacing_perfect`
- [ ] Реализовать `training_recovery_window`
- [ ] Реализовать `sleep_debt_accumulating`
- [ ] Реализовать `stress_eating_detected`

### Phase 4: Trends & Milestones
- [ ] Добавить helper `calculateWeightTrend(days)` — упрощённый (не линейная регрессия)
- [x] ~~Добавить helper `getTotalDaysTracked()`~~ (уже в Phase 0)
- [ ] Добавить helper `getPersonalBestStreak()` — уже в Phase 0
- [ ] Реализовать `weight_trend_down`
- [ ] Реализовать `weight_trend_up`
- [ ] Реализовать `milestone_7_days` (с confetti!)
- [ ] Реализовать `milestone_30_days` (с confetti!)
- [ ] Реализовать `milestone_100_days` (с confetti!)
- [ ] Реализовать `new_record_streak`
- [ ] Реализовать `first_training_ever`

### Финализация
- [ ] `pnpm type-check`
- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] Обновить DATA_MODEL_REFERENCE.md до v1.6.0 (добавить 26 советов = 103 всего)
- [ ] Тест в браузере
- [ ] Проверить milestones в localStorage

---

## 🔧 Технические детали

### Helper: getMealTotals (Phase 0)
```javascript
function getMealTotals(meal, pIndex) {
  if (!meal || !meal.items || meal.items.length === 0) return null;
  if (!window.HEYS?.models?.mealTotals) {
    console.warn('[Advice] HEYS.models.mealTotals not available');
    return null;
  }
  return window.HEYS.models.mealTotals(meal, pIndex);
}
```

### Helper: getLastMealWithItems (Phase 0)
```javascript
function getLastMealWithItems(day) {
  const meals = (day?.meals || []).filter(m => m.items?.length > 0);
  return meals.length > 0 ? meals[meals.length - 1] : null;
}
```

### Helper: countUniqueProducts
```javascript
function countUniqueProducts(day) {
  const ids = new Set();
  (day?.meals || []).forEach(meal => {
    (meal.items || []).forEach(item => {
      if (item.product_id) ids.add(String(item.product_id));
    });
  });
  return ids.size;
}
```

### Helper: getTotalDaysTracked
```javascript
function getTotalDaysTracked() {
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.includes('heys_dayv2_')) count++;
  }
  return count;
}
```

### Helper: calculateWeightTrend — УПРОЩЁННАЯ ВЕРСИЯ
```javascript
// Вместо линейной регрессии — простое сравнение первого и последнего
function calculateWeightTrend(recentDays) {
  const weights = recentDays
    .map(d => d.weightMorning)
    .filter(w => w > 0);
  
  if (weights.length < 3) return 0;
  
  // Средний за первые 3 дня vs средний за последние 3 дня
  const firstAvg = weights.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const lastAvg = weights.slice(-3).reduce((a, b) => a + b, 0) / 3;
  
  // Разница в кг/неделю (приблизительно)
  const daysDiff = weights.length;
  return ((lastAvg - firstAvg) / daysDiff) * 7;
}
```

### Helper: getPersonalBestStreak (Phase 0)
```javascript
function getPersonalBestStreak() {
  try {
    return parseInt(localStorage.getItem('heys_best_streak') || '0', 10);
  } catch (e) { return 0; }
}

function updatePersonalBestStreak(currentStreak) {
  const best = getPersonalBestStreak();
  if (currentStreak > best) {
    try { localStorage.setItem('heys_best_streak', String(currentStreak)); } catch (e) {}
    return true; // Новый рекорд!
  }
  return false;
}
```

### Helper: Meal advice throttling (Phase 0)
```javascript
const MEAL_ADVICE_THROTTLE_MS = 3000;

function canShowMealAdvice() {
  const last = sessionStorage.getItem('heys_last_meal_advice');
  return !last || (Date.now() - parseInt(last, 10)) > MEAL_ADVICE_THROTTLE_MS;
}

function markMealAdviceShown() {
  sessionStorage.setItem('heys_last_meal_advice', String(Date.now()));
}
```

### Milestone с confetti
```javascript
if (totalDaysTracked === 30 && !isMilestoneShown('30_days')) {
  advices.push({
    id: 'milestone_30_days',
    icon: '🎉',
    text: 'Месяц с HEYS! Ты молодец!',
    type: 'achievement',
    priority: 1,
    category: 'achievement',
    triggers: ['tab_open'],
    ttl: 10000,
    showConfetti: true,
    onShow: () => markMilestoneShown('30_days')
  });
}
```

---

## 🧪 Тестирование (обязательно после каждой фазы)

### Автоматическое
```bash
pnpm type-check  # TypeScript
pnpm lint        # ESLint
pnpm build       # Сборка
```

### Ручное в браузере

**Phase 1 (Meal-level):**
- [ ] Добавить продукт > 800 ккал → появляется `meal_too_large`
- [ ] Добавить 4+ продуктов в один приём → `variety_meal_good`
- [ ] Проверить throttle — быстрые добавления не спамят

**Phase 2 (Day-quality):**
- [ ] День без транс-жиров → `trans_free_day`
- [ ] Выпить 2500мл воды → `super_hydration`
- [ ] 10+ уникальных продуктов → `variety_day_good`

**Phase 3 (Timing):**
- [ ] Первый приём после 12:00 → `late_first_meal`
- [ ] 3 дня < 6 часов сна → `sleep_debt_accumulating`

**Phase 4 (Milestones):**
- [ ] Проверить 7/30/100 дней в localStorage
- [ ] Confetti работает для milestones
- [ ] `new_record_streak` показывается при новом рекорде

### DevTools проверки
```javascript
// В консоли браузера:

// Проверить milestones
Object.keys(localStorage).filter(k => k.includes('milestone'))

// Симулировать 30 дней
localStorage.setItem('heys_milestone_30_days', '0'); // Сброс

// Проверить best streak
localStorage.getItem('heys_best_streak')

// Проверить throttle
sessionStorage.getItem('heys_last_meal_advice')
```

---

## 📊 Итог

| Метрика | До | После |
|---------|-----|-------|
| Всего советов | 77 | **103** |
| Meal-level | 0 | 7 |
| Day-quality | ~10 | 16 |
| Timing | 7 | 13 |
| Milestones | 2 | 9 |
| С confetti | 1 | 4 |

---

## 🚀 После выполнения

1. Закоммитить: `git commit -m "feat(advice): add 26 new advice types → 103 total"`
2. Обновить DATA_MODEL_REFERENCE.md до v1.6.0
3. Перенести промпт в `archive/`
4. Обновить todo.md — отметить Phase 2 как ✅

---

## 🎯 Итоговые рекомендации

### ✅ Что делать:
1. **Проверить блокеры B1-B5** в консоли браузера (5 мин)
2. **Тестировать после каждой фазы** — не накапливать баги
3. **Персонализация текстов** — `${firstName}` где уместно
4. **Динамические числа** — `${Math.round(mealTot.kcal)}` вместо "много"
5. **Использовать существующие паттерны** — confetti, haptic, onShow

### ❌ Чего избегать:
1. **Sound effects** — лишняя сложность, мало пользы
2. **AI/Weather интеграции** — отложить на будущее
3. **Сложная линейная регрессия** — использовать упрощённый trend
4. **Слишком много советов сразу** — throttle 3 сек
5. **Переусложнение Phase 3** — можно сократить до 4 советов

### 💡 Easy Wins (после Phase 2):
1. ✅ Confetti для milestones — **уже работает**
2. Персонализация с `firstName` — 5 минут
3. CSS pulse animation для иконок — 5 минут
4. Gradient badges для категорий — 10 минут

---

## 🌟 WOW-идеи для следующего спринта

> **После Phase 2 — фокус на современные UX-паттерны!**

| Фича | Почему WOW | Время | Сложность |
|------|------------|-------|-----------|
| 🎙️ **Voice Input** | "Добавь 100г творога" — конкуренты не умеют | 2ч | M |
| 📸 **Фото еды** | Дневник становится живым, эмоциональная связь | 1-2ч | S |
| 📲 **Share Streak** | Viral growth через Instagram Stories | 30м | S |
| 👋 **Onboarding** | x2 retention для новых пользователей | 1-2ч | M |
| 📊 **Widget iOS/Android** | Home screen = ежедневное напоминание | 3-4ч | L |
| 🌙 **Sleep Integration** | Apple Health / Google Fit sync | 2-3ч | M |
| ✨ **Animated Streaks** | Огненная анимация при streak | 30м | S |
| 🏆 **Weekly Leaderboard** | Соревнование с друзьями | 3-4ч | L |

### 🎯 Рекомендуемый порядок после Phase 2:
1. **Onboarding** (1-2ч) — 3 экрана при первом запуске
2. **Voice Input** (2ч) — Web Speech API
3. **Фото еды** (1-2ч) — `<input type="file" accept="image/*" capture>`
4. **Share Streak** (30м) — Web Share API + canvas

---

**Версия промпта**: 2.1 (глубокий аудит + блокеры)  
**Последнее обновление**: 2025-11-29

