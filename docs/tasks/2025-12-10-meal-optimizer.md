# 🎯 Meal Optimizer — Умные рекомендации при добавлении продуктов

**Дата создания**: 2025-12-10  
**Приоритет**: 🔥 Высокий  
**Время**: ~4-6 часов  
**Статус**: 🆕 Новый  
**Аудит**: ✅ Пройден 2025-12-10

---

## Phase 0 — Подготовка (ОБЯЗАТЕЛЬНО перед реализацией)

### 🔴 Критические блокеры

#### B1. Микронутриенты отсутствуют в модели Product

**Проблема**: Поля `vitaminC100`, `iron100`, `zinc100`, `magnesium100` **НЕ существуют** в модели Product.

**Решение**: Использовать **keyword-детекцию** (как в `heys_advice_v1.js`):

```javascript
// Справочники категорий продуктов
const NUTRIENT_KEYWORDS = {
  ironRich: ['говядина', 'печень', 'гречка', 'чечевица', 'шпинат', 'тунец', 'индейка'],
  vitaminC: ['лимон', 'апельсин', 'грейпфрут', 'киви', 'перец болг', 'шиповник', 'смородина', 'клубника'],
  calcium: ['молоко', 'творог', 'сыр', 'йогурт', 'кефир', 'сметана'],
  magnesium: ['тыквенные семечки', 'миндаль', 'шпинат', 'гречка', 'авокадо', 'банан'],
  zinc: ['говядина', 'устрицы', 'тыквенные семечки', 'кешью', 'курица'],
  phytates: ['пшеница', 'отруби', 'овёс', 'рис', 'кукуруза', 'соя', 'фасоль'],
  omega3: ['лосось', 'сёмга', 'скумбрия', 'сельдь', 'льняное масло', 'чиа', 'грецкий орех'],
  redMeat: ['говядина', 'свинина', 'баранина', 'телятина'],
  probiotics: ['кефир', 'йогурт', 'квашеная капуста', 'кимчи', 'комбуча'],
  prebiotics: ['чеснок', 'лук', 'банан', 'топинамбур', 'цикорий', 'спаржа'],
  antioxidants: ['черника', 'голубика', 'зелёный чай', 'тёмный шоколад', 'куркума', 'имбирь'],
  polyphenols: ['зелёный чай', 'кофе', 'какао', 'виноград', 'гранат', 'оливковое масло']
};
```

#### B2. CSS slot 700 занят

**Проблема**: `700-profile-wizard.css` уже существует.

**Решение**: Использовать `800-meal-optimizer.css`.

#### B3. Место вставки в MealCard

**Точное место**: После списка продуктов, **перед** `meal-meta-row` (строка ~2355 в `heys_day_v12.js`).

```javascript
// В MealCard, после mobile-products-list / desktop table:
meal.items?.length > 0 && React.createElement(MealOptimizerCard, {
  meal,
  pIndex,
  context: { day, prof, hour: new Date().getHours() },
  onAddProduct: handleAddOptimizedProduct  // ← Реиспользовать существующий handler!
}),
// Существующий meal-meta-row
React.createElement('div', { className: 'meal-meta-row' }, ...)
```

#### B4. localStorage через HEYS.store (НЕ прямой localStorage!)

**Проблема**: Прямой `localStorage.setItem` нарушит multi-client namespace.

**Решение**: Использовать `U.lsSet()` / `U.lsGet()` из `heys_core_v12.js`:

```javascript
// ❌ НЕПРАВИЛЬНО
localStorage.setItem('heys_optimizer_prefs', JSON.stringify(prefs));

// ✅ ПРАВИЛЬНО
const U = HEYS.utils || {};
U.lsSet('heys_optimizer_prefs', prefs);  // Автоматически добавит clientId
U.lsGet('heys_optimizer_prefs', {});      // С дефолтом
```

#### B5. Keyword-детекция: case-insensitive + partial match

**Проблема**: "перец болг" не найдёт "Перец болгарский красный".

**Решение**: Нормализация + includes:

```javascript
function matchesKeyword(productName, keywords) {
  const normalized = productName.toLowerCase().trim();
  return keywords.some(kw => normalized.includes(kw.toLowerCase()));
}

// Пример: matchesKeyword("Перец болгарский красный", ["перец болг"]) → true
```

#### B6. Handler добавления продукта

**Проблема**: Создание нового handler нарушит логику штампов/индексов.

**Решение**: Реиспользовать существующий `handleAddProduct` из MealCard:

```javascript
// В MealCard уже есть:
const handleAddProduct = (product, grams) => { /* ... */ };

// MealOptimizerCard получает его как проп:
onAddProduct: (product, grams) => handleAddProduct(product, grams)
```

#### B7. pIndex — передавать как проп, НЕ пересоздавать

**Проблема**: Пересоздание индекса приведёт к рассинхронизации.

**Решение**: `pIndex` передаётся из DayTab → MealCard → MealOptimizerCard как проп.

#### B8. prefers-reduced-motion для анимаций

**Проблема**: Анимации могут вызвать дискомфорт.

**Решение**:

```css
@media (prefers-reduced-motion: reduce) {
  .optimizer-card,
  .synergy-fill,
  .optimizer-success {
    animation: none !important;
    transition: none !important;
  }
}
```

### ✅ Чеклист Phase 0 (расширенный)

**Код и зависимости:**
- [ ] Подтвердить структуру `NUTRIENT_KEYWORDS` — проверить в реальных продуктах БД
- [ ] Проверить `PRODUCT_CATEGORIES` в `heys_advice_v1.js` (строка ~470) — переиспользовать
- [ ] Проверить `analyzeProductCategories()` в `heys_advice_v1.js` (строка ~500)
- [ ] Проверить `M.mealTotals()` в `heys_models_v1.js` (строка ~398)
- [ ] Найти точную строку вставки в MealCard (grep `meal-meta-row`)
- [ ] Найти существующий `handleAddProduct` в MealCard — реиспользовать
- [ ] Проверить как передаётся `pIndex` в MealCard

**Стили:**
- [ ] Проверить что slot 800 свободен: `ls styles/modules/8*`
- [ ] Создать пустой `800-meal-optimizer.css`
- [ ] Добавить `@import './modules/800-meal-optimizer.css';` в `styles/main.css`

**Данные:**
- [ ] Составить справочник `RECOMMENDED_PORTIONS` для 50+ продуктов
- [ ] Сверить keywords с реальными названиями из `heys_products`
- [ ] Проверить есть ли английские названия в БД (если есть — добавить в keywords)

**Git:**
- [ ] `git status` — убедиться что нет незакоммиченных изменений
- [ ] Скриншот текущего MealCard для сравнения

---

## 📋 Суть задачи

Создать систему контекстных рекомендаций, которые появляются **прямо в карточке приёма пищи** при добавлении продуктов. Рекомендации помогают оптимизировать приём пищи на лету — предлагают добавить недостающие нутриенты, предупреждают о конфликтах усвоения, обучают правильным комбинациям.

### Ключевая идея

Вместо общих советов в отдельном модуле — **встроенные рекомендации в каждом приёме пищи**, которые:
- Обновляются после каждого добавленного продукта
- Основаны на научных данных
- Позволяют добавить рекомендованный продукт одним кликом
- Остаются в истории для ретроспективного анализа

### Отличие от heys_advice

| Аспект | heys_advice | Meal Optimizer |
|--------|-------------|----------------|
| Уровень | День | Приём пищи |
| Триггер | Открытие вкладки | Добавление продукта |
| Действие | Информация | One-click добавление |
| Сохранение | Нет | В `meal.optimization` |

---

## 🏗️ Архитектура

```
apps/web/
├── heys_meal_optimizer_v1.js       # Главный модуль + UI (UMD)
└── styles/modules/
    └── 800-meal-optimizer.css       # Стили (slot 800!)
```

**Важно**: Код в стиле `React.createElement`, не JSX! Единый файл (как InsulinWave).

---

## 📊 База правил — 50+ правил

### Принятые решения по аудиту

| Вопрос | Решение |
|--------|--------|
| Приоритет vs ротация | Критические (>90) — всегда, остальные — ротация max 2 подряд |
| Конфликт vs синергия | Конфликты = highest priority (warning), синергии = opportunity |
| Умные порции | Справочник + формулы для простых случаев (клетчатка, белок) |
| Сохранение | Только топ-1 показанная + `wasActedOn: true/false` |
| localStorage | Через `U.lsSet()` / `U.lsGet()` с clientId namespace |
| Handler добавления | Реиспользовать существующий `handleAddProduct` из MealCard |
| pIndex | Передавать как проп, НЕ пересоздавать |

### Ответы на уточняющие вопросы аудита

#### Q1. Источник времени тренировки (`hasTrainingSoon`)

**Решение**: Использовать `day.trainings` с `time >= now && time <= now+2h`:

```javascript
function checkUpcomingTraining(day) {
  if (!day?.trainings?.length) return false;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  
  return day.trainings.some(t => {
    if (!t.time) return false;
    const [h, m] = t.time.split(':').map(Number);
    const trainingMinutes = h * 60 + m;
    const diff = trainingMinutes - nowMinutes;
    return diff > 0 && diff <= 120; // В пределах 2 часов
  });
}

function getMinutesAfterTraining(day) {
  if (!day?.trainings?.length) return Infinity;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  
  let minAfter = Infinity;
  day.trainings.forEach(t => {
    if (!t.time) return;
    const [h, m] = t.time.split(':').map(Number);
    const trainingMinutes = h * 60 + m;
    // Добавляем среднюю длительность тренировки (45 мин)
    const endMinutes = trainingMinutes + 45;
    const diff = nowMinutes - endMinutes;
    if (diff > 0 && diff < minAfter) minAfter = diff;
  });
  return minAfter;
}
```

#### Q2. Резолвинг дубликатов рекомендаций

**Решение**: Иерархия приоритетов (при равенстве — больший gain на метрику):

```
critical (100-90) > conflict (89-80) > synergy (79-70) > balance (69-50) > timing (49-30) > micro (29-20) > gut (19-10) > antioxidants (9-1)
```

При равном приоритете — правило с большим `gainScore`:

```javascript
function calculateGainScore(rule, nutrients) {
  // Чем больше "дыра" в нутриентах, тем выше gain
  switch(rule.id) {
    case 'no_fiber': return Math.max(0, 5 - nutrients.fiber) * 10;
    case 'protein_low_meal': return Math.max(0, 15 - nutrients.prot) * 5;
    case 'simple_carbs_high': return Math.max(0, nutrients.simple - 30) * 3;
    default: return 0;
  }
}
```

#### Q3. Рекомендованный продукт уже в приёме

**Решение**: Показывать с пометкой "уже есть, +Xг?":

```javascript
function getSmartProducts(rule, meal, pIndex) {
  return rule.quickAdd.map(productName => {
    const existing = meal.items?.find(item => {
      const p = getProductFromItem(item, pIndex);
      return p?.name?.toLowerCase().includes(productName.toLowerCase());
    });
    
    if (existing) {
      return {
        name: productName,
        alreadyInMeal: true,
        currentGrams: existing.grams,
        suggestedAdd: 50,  // Предложить добавить ещё 50г
        label: `+50г (уже ${existing.grams}г)`
      };
    }
    
    return {
      name: productName,
      alreadyInMeal: false,
      ...getSmartPortion(productName)
    };
  });
}
```

### 1. КРИТИЧЕСКИЕ (Priority 100-90) — Всегда показывать

| ID | Условие | Рекомендация | Наука |
|----|---------|--------------|-------|
| `no_fiber` | `fiber < 2 && kcal > 300` | "Нет клетчатки — добавь овощи" | Wolever 1991 |
| `high_gi_spike` | `gi > 70 && fat < 5 && fiber < 3` | "Высокий ГИ без защиты" | Brand-Miller 2003 |
| `insulin_wave_extend` | `gl > 20 && protein < 15` | "Долгая инсулиновая волна" | Nuttall 1984 |
| `trans_fat_alert` | `trans > 0.5` | "Транс-жиры обнаружены!" | WHO Guidelines |
| `calcium_blocks_iron` | `hasCalcium && hasIronRich` | "⚠️ Кальций блокирует железо" | Hallberg 1991 |

### 2. СИНЕРГИЯ НУТРИЕНТОВ (Priority 89-70) — Opportunities

| ID | Условие | Рекомендация | Наука | quickAdd |
|----|---------|--------------|-------|----------|
| `iron_needs_c` | `hasIronRich && !hasVitaminC` | "Добавь витамин C к железу" | Lynch 2018: +300% усвоение | Лимон, Перец красный, Киви |
| `zinc_phytates` | `hasZincRich && hasPhytates` | "Фитаты блокируют цинк" | Gibson 2018: -80% | Квашеная капуста |
| `omega3_balance` | `hasRedMeat && !hasOmega3` | "Баланс омега-3/6" | Calder 2017: снижает IL-6 | Льняное масло, Грецкий орех |
| `fat_soluble_vitamins` | `hasVitaminADE && fat < 5` | "Жиры для усвоения витаминов" | Reboul 2017 | Оливковое масло, Авокадо |
| `curcumin_pepper` | `hasCurcumin && !hasPepper` | "Чёрный перец усилит куркуму" | Shoba 1998: +2000% | Чёрный перец |

### 3. БАЛАНСИРОВКА МАКРОСОВ (Priority 69-50)

| ID | Условие | Рекомендация | quickAdd |
|----|---------|--------------|----------|
| `protein_alone` | `protein > 30 && carbs < 10` | "Добавь углеводы к белку" | Гречка, Рис бурый, Банан |
| `carbs_alone` | `carbs > 40 && protein < 10 && fat < 5` | "Голые углеводы — добавь белок" | Творог, Яйцо, Йогурт |
| `fat_missing` | `fat < 5 && kcal > 300` | "Мало жиров — добавь полезные" | Авокадо, Орехи, Оливковое масло |
| `simple_carbs_high` | `simple > 30 && fiber < 3` | "Много сахара — добавь клетчатку" | Огурец, Салат, Капуста |
| `protein_low_meal` | `protein < 10 && kcal > 200` | "Мало белка в приёме" | Творог, Яйцо, Курица |

### 4. ОПТИМИЗАЦИЯ ВРЕМЕНИ (Priority 49-30)

| ID | Условие | Рекомендация | quickAdd |
|----|---------|--------------|----------|
| `morning_needs_energy` | `hour 6-10 && complex < 20` | "Утром нужны сложные углеводы" | Овсянка, Гречка, Хлеб цельнозерновой |
| `evening_light` | `hour >= 21 && kcal > 600` | "Поздний ужин — полегче" | (информационное) |
| `pre_training_fuel` | `hasTrainingSoon && carbs < 20` | "Перед тренировкой нужны углеводы" | Банан, Финики, Мёд |
| `post_training_window` | `minutesAfterTraining < 60 && protein < 20` | "Белковое окно открыто!" | Творог, Протеин, Курица |
| `evening_carbs_warning` | `hour >= 20 && simple > 30` | "Вечером простые углеводы → плохой сон" | (информационное) |

### 5. МИКРОНУТРИЕНТЫ (Priority 29-20)

| ID | Условие | Рекомендация | quickAdd |
|----|---------|--------------|----------|
| `magnesium_evening` | `hour >= 19 && !hasMagnesium` | "Магний улучшит сон" | Тыквенные семечки, Миндаль |
| `b12_vegetarian` | `isVegetarian && !hasB12` | "Веганам важен B12" | Пищевые дрожжи, Яйца |
| `potassium_balance` | `hasSodiumHigh && !hasPotassium` | "Добавь калий к соли" | Банан, Картофель, Авокадо |
| `iron_women` | `isFemale && cycleDay 1-5 && !hasIronRich` | "Железо особенно важно сейчас" | Говядина, Гречка, Шпинат |

### 6. ПРОБИОТИКИ И ПРЕБИОТИКИ (Priority 19-10)

| ID | Условие | Рекомендация | quickAdd |
|----|---------|--------------|----------|
| `probiotics_morning` | `hour <= 10 && !hasProbiotics` | "Пробиотики лучше натощак" | Кефир, Йогурт |
| `prebiotics_feed` | `hasProbiotics && !hasPrebiotics` | "Корм для бактерий" | Чеснок, Лук, Банан |
| `fermented_missing` | `mealCount >= 2 && !hasFermented` | "Ферментированное для микробиома" | Квашеная капуста, Кимчи |

### 7. АНТИОКСИДАНТЫ (Priority 9-1)

| ID | Условие | Рекомендация | quickAdd |
|----|---------|--------------|----------|
| `antioxidants_stress` | `stressLevel > 6 && !hasAntioxidants` | "Антиоксиданты против стресса" | Черника, Зелёный чай |
| `polyphenols_carbs` | `simple > 25 && !hasPolyphenols` | "Полифенолы снизят сахар" | Зелёный чай, Корица |
| `seasonal_vitamins` | `season === 'winter' && !hasVitaminD` | "Зимой важен витамин D" | Рыба жирная, Яйца |

---

## 🧠 Алгоритм выбора рекомендации

```javascript
getMealOptimization(mealItems, pIndex, context) {
  // 1. Рассчитать nutrients приёма
  const nutrients = M.mealTotals(mealItems, pIndex);
  
  // 2. Детекция категорий через keywords
  const categories = detectCategories(mealItems, pIndex);
  
  // 3. Обогатить context
  const enrichedContext = {
    ...context,
    hour: new Date().getHours(),
    hasIronRich: categories.ironRich,
    hasVitaminC: categories.vitaminC,
    hasCalcium: categories.calcium,
    // ... остальные категории
    isFemale: context.prof?.gender === 'Женский',
    cycleDay: context.day?.cycleDay,
    stressLevel: context.day?.stressAvg || 3,
    isVegetarian: detectVegetarian(context.recentMeals),
    hasTrainingSoon: checkUpcomingTraining(context.day),
    minutesAfterTraining: getMinutesAfterTraining(context.day)
  };
  
  // 4. Найти все применимые правила
  const applicable = RULES.filter(r => r.check(nutrients, enrichedContext));
  
  // 5. Ранжировать
  const ranked = applicable.map(rule => ({
    ...rule,
    score: calculateScore(rule, enrichedContext)
  })).sort((a, b) => b.score - a.score);
  
  // 6. Применить ротацию (для non-critical)
  const selected = applyRotation(ranked, context.lastShownRuleId);
  
  // 7. Получить продукты с умными порциями
  const products = getSmartProducts(selected, nutrients, pIndex);
  
  return { ...selected, products };
}

function calculateScore(rule, context) {
  let score = rule.priority;
  
  // Персональные бонусы
  if (rule.type === 'synergy' && context.age > 40) score += 10;
  if (rule.type === 'timing' && context.activityLevel === 'high') score += 8;
  if (rule.type === 'micro' && context.deficitMode) score += 12;
  if (rule.type === 'gut' && context.stressLevel > 6) score += 15;
  
  // Штраф за частый показ (для non-critical)
  if (rule.priority < 90) {
    const showCount = userHistory.get(rule.id) || 0;
    score -= showCount * 3;
  }
  
  // Бонус за позитивные реакции
  const userScore = userPreferences.get(rule.id) || 0;
  score += userScore * 5;
  
  return score;
}

function applyRotation(ranked, lastShownRuleId) {
  // Критические (>90) — всегда показываем топ-1
  if (ranked[0]?.priority > 90) return ranked[0];
  
  // Остальные — ротация, не больше 2 раз подряд
  const sameAsLast = ranked.findIndex(r => r.id === lastShownRuleId);
  if (sameAsLast === 0 && ranked.length > 1) {
    // Показывали это правило — берём следующее
    return ranked[1];
  }
  
  return ranked[0];
}
```

---

## 📈 Умные порции — Гибридный подход

### Справочник фиксированных порций (50+ продуктов)

```javascript
const RECOMMENDED_PORTIONS = {
  // Овощи
  'огурец': { grams: 100, display: '1 средний' },
  'помидор': { grams: 120, display: '1 средний' },
  'перец болгарский': { grams: 75, display: '½ шт' },
  'салат': { grams: 50, display: 'горсть' },
  'капуста': { grams: 80, display: '1 чашка' },
  'брокколи': { grams: 100, display: '5-6 соцветий' },
  'шпинат': { grams: 50, display: '2 горсти' },
  
  // Фрукты
  'банан': { grams: 120, display: '1 средний' },
  'яблоко': { grams: 150, display: '1 среднее' },
  'апельсин': { grams: 150, display: '1 средний' },
  'киви': { grams: 75, display: '1 шт' },
  'лимон': { grams: 30, display: 'сок ½ лимона' },
  
  // Орехи и семена
  'миндаль': { grams: 25, display: '15-20 шт' },
  'грецкий орех': { grams: 25, display: '5-7 половинок' },
  'тыквенные семечки': { grams: 20, display: '2 ст.л.' },
  'льняное семя': { grams: 15, display: '1 ст.л.' },
  
  // Молочные
  'творог': { grams: 100, display: '100г' },
  'йогурт': { grams: 150, display: '1 баночка' },
  'кефир': { grams: 200, display: '1 стакан' },
  'сыр': { grams: 30, display: '2 ломтика' },
  
  // Крупы
  'овсянка': { grams: 50, display: '50г сухой' },
  'гречка': { grams: 80, display: '80г сухой' },
  'рис бурый': { grams: 80, display: '80г сухой' },
  
  // Белковые
  'яйцо': { grams: 60, display: '1 шт' },
  'куриная грудка': { grams: 120, display: '1 филе' },
  'творог 5%': { grams: 150, display: '150г' },
  
  // Масла
  'оливковое масло': { grams: 15, display: '1 ст.л.' },
  'льняное масло': { grams: 10, display: '1 ч.л.' },
  
  // Специи и добавки
  'корица': { grams: 3, display: '½ ч.л.' },
  'куркума': { grams: 3, display: '½ ч.л.' },
  'чёрный перец': { grams: 1, display: 'щепотка' }
};
```

### Формулы для расчёта (простые случаи)

```javascript
function calculateSmartPortion(product, currentNutrients, rule) {
  // 1. Сначала проверяем справочник
  const preset = RECOMMENDED_PORTIONS[product.name.toLowerCase()];
  if (preset) return preset;
  
  // 2. Формулы для простых случаев
  if (rule.id === 'no_fiber' && product.fiber100 > 0) {
    // Нужно добрать до 5г клетчатки
    const fiberNeeded = Math.max(5 - currentNutrients.fiber, 3);
    const grams = Math.round((fiberNeeded / product.fiber100) * 100);
    return { grams: roundToNice(grams), display: `${roundToNice(grams)}г` };
  }
  
  if (rule.id === 'protein_low_meal' && product.protein100 > 0) {
    // Добрать до 15г белка
    const proteinNeeded = Math.max(15 - currentNutrients.prot, 10);
    const grams = Math.round((proteinNeeded / product.protein100) * 100);
    return { grams: roundToNice(grams), display: `${roundToNice(grams)}г` };
  }
  
  // 3. Fallback — типовая порция 100г
  return { grams: 100, display: '100г' };
}

function roundToNice(grams) {
  // Округление до "красивых" чисел
  if (grams <= 20) return 20;
  if (grams <= 35) return 30;
  if (grams <= 60) return 50;
  if (grams <= 90) return 75;
  if (grams <= 115) return 100;
  if (grams <= 140) return 120;
  return 150;
}
```

---

## 🎨 UI Компонент

### Расположение в MealCard (точное место)

```
┌─ MealCard ──────────────────────────────────┐
│ Заголовок (время, тип, ккал)                │
│ ────────────────────────────────────────── │
│ Продукты:                                   │
│   • Курица 150г                             │
│   • Рис белый 100г                          │
│ ────────────────────────────────────────── │
│ ┌─ 💡 РЕКОМЕНДАЦИЯ ──────────────────────┐ │ ← ВСТАВИТЬ СЮДА
│ │ 🥬 Нет клетчатки — добавь овощи        │ │
│ │ [+Огурец 100г] [+Перец 75г] [+Салат]   │ │
│ │                                         │ │
│ │ ▼ Почему это важно?                     │ │
│ │   Клетчатка замедляет усвоение на 30%   │ │
│ │   и продлевает сытость.                 │ │
│ │   📊 Было → Стало: усвоение 40% → 85%   │ │ ← Визуализация синергии
│ └─────────────────────────────────────────┘ │
│ ────────────────────────────────────────── │
│ meal-meta-row (бейдж качества + оценки)    │
│ Фотографии                                  │
│ Инсулиновая волна                           │
└─────────────────────────────────────────────┘
```

### Визуализация синергии "Было → Стало"

```javascript
function SynergyVisualization({ rule, currentNutrients }) {
  // Только для synergy правил
  if (rule.type !== 'synergy') return null;
  
  const SYNERGY_DATA = {
    'iron_needs_c': { before: 30, after: 90, unit: '% усвоение железа' },
    'curcumin_pepper': { before: 5, after: 100, unit: '% биодоступность' },
    'fat_soluble_vitamins': { before: 20, after: 80, unit: '% усвоение витаминов' },
    'omega3_balance': { before: 'воспаление ↑', after: 'воспаление ↓', unit: '' }
  };
  
  const data = SYNERGY_DATA[rule.id];
  if (!data) return null;
  
  return React.createElement('div', { className: 'optimizer-synergy' },
    React.createElement('div', { className: 'synergy-before' },
      React.createElement('span', { className: 'synergy-label' }, 'Сейчас:'),
      React.createElement('div', { className: 'synergy-bar' },
        React.createElement('div', { 
          className: 'synergy-fill synergy-fill--before',
          style: { width: typeof data.before === 'number' ? `${data.before}%` : '30%' }
        })
      ),
      React.createElement('span', { className: 'synergy-value' }, 
        typeof data.before === 'number' ? `${data.before}%` : data.before
      )
    ),
    React.createElement('span', { className: 'synergy-arrow' }, '→'),
    React.createElement('div', { className: 'synergy-after' },
      React.createElement('span', { className: 'synergy-label' }, 'С добавкой:'),
      React.createElement('div', { className: 'synergy-bar' },
        React.createElement('div', { 
          className: 'synergy-fill synergy-fill--after',
          style: { width: typeof data.after === 'number' ? `${data.after}%` : '90%' }
        })
      ),
      React.createElement('span', { className: 'synergy-value synergy-value--boosted' }, 
        typeof data.after === 'number' ? `${data.after}% 🚀` : data.after
      )
    )
  );
}
```

### Типы рекомендаций — визуал

| Тип | Класс | Фон | Бейдж |
|-----|-------|-----|-------|
| `critical` | `optimizer--critical` | `#fef2f2` → `#fee2e2` | 🔴 "Важно" |
| `conflict` | `optimizer--conflict` | `#fff7ed` → `#ffedd5` | ⚠️ "Конфликт" |
| `synergy` | `optimizer--synergy` | `#f5f3ff` → `#ede9fe` | ✨ "Синергия" |
| `balance` | `optimizer--balance` | `#f0f9ff` → `#e0f2fe` | — |
| `timing` | `optimizer--timing` | `#fefce8` → `#fef9c3` | ⏰ |
| `micro` | `optimizer--micro` | `#f0fdf4` → `#dcfce7` | 💊 |
| `gut` | `optimizer--gut` | `#fdf4ff` → `#fae8ff` | 🦠 |

---

## 🔧 Зависимости от существующих модулей

| Модуль | Что использовать | Как |
|--------|------------------|-----|
| `heys_models_v1.js` | `M.mealTotals()` | Расчёт nutrients приёма |
| `heys_models_v1.js` | `getProductFromItem()` | Получение продукта по item |
| `heys_advice_v1.js` | `PRODUCT_CATEGORIES` | **Переиспользовать**, не дублировать |
| `heys_advice_v1.js` | `analyzeProductCategories()` | Для детекции категорий |
| `heys_cycle_v1.js` | `HEYS.Cycle?.getCyclePhase()` | Фаза цикла |
| `heys_insulin_wave_v1.js` | GL расчёты | Для insulin_wave_extend правила |
| `pIndex` | Индекс продуктов | Передаётся как проп |

### Паттерн регистрации модуля

```javascript
// heys_meal_optimizer_v1.js
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  // Используем существующие утилиты
  const M = HEYS.models || {};
  const Advice = HEYS.Advice || {};
  const PRODUCT_CATEGORIES = Advice.PRODUCT_CATEGORIES || {};
  
  // ... код модуля ...
  
  HEYS.MealOptimizer = {
    getMealOptimization,
    trackUserAction,
    RULES,
    NUTRIENT_KEYWORDS,
    RECOMMENDED_PORTIONS,
    // UI компоненты
    MealOptimizerCard
  };
  
})(typeof window !== 'undefined' ? window : global);
```

---

## 🎮 Персонализация

### Трекинг действий

```javascript
function trackUserAction(ruleId, action, productAdded = null) {
  const U = HEYS.utils || {};
  const key = 'heys_optimizer_prefs';
  const prefs = U.lsGet(key, {});  // ✅ Через HEYS.utils с clientId!
  
  prefs[ruleId] = prefs[ruleId] || { score: 0, shown: 0 };
  
  switch(action) {
    case 'shown':
      prefs[ruleId].shown++;
      prefs[ruleId].lastShown = Date.now();
      break;
    case 'expanded':
      prefs[ruleId].score += 1;
      break;
    case 'added':
      prefs[ruleId].score += 3;
      // Haptic feedback на мобильных (безопасно)
      safeVibrate(50);
      break;
    case 'dismissed':
      prefs[ruleId].score -= 1;
      break;
  }
  
  // Ограничиваем историю (max 50 правил)
  const keys = Object.keys(prefs);
  if (keys.length > 50) {
    const oldest = keys.sort((a, b) => 
      (prefs[a].lastShown || 0) - (prefs[b].lastShown || 0)
    )[0];
    delete prefs[oldest];
  }
  
  U.lsSet(key, prefs);  // ✅ Через HEYS.utils с clientId!
  
  // Аналитика (батчинг — только 4 типа событий)
  HEYS.analytics?.track?.('meal_optimization_action', {
    ruleId,
    action,
    productAdded
  });
}

// Безопасный haptic feedback
function safeVibrate(ms) {
  try {
    if ('vibrate' in navigator && /Mobi|Android/i.test(navigator.userAgent)) {
      navigator.vibrate(ms);
    }
  } catch (e) {
    // Игнорируем ошибки
  }
}
```

### Сохранение в meal

```javascript
meal.optimization = {
  id: 'iron_needs_c',
  message: "Добавь витамин C к железу",
  products: ["Лимон", "Перец красный"],
  wasShown: true,
  wasActedOn: false,  // true если добавил рекомендованное
  timestamp: Date.now()
};
```

---

## 💡 WOW-фишки

### 1. Haptic feedback (безопасный)
```javascript
function safeVibrate(ms) {
  try {
    if ('vibrate' in navigator && /Mobi|Android/i.test(navigator.userAgent)) {
      navigator.vibrate(ms);
    }
  } catch (e) { /* ignore */ }
}
```

### 2. Интеграция с инсулиновой волной (реальные данные!) (реальные данные!)
```javascript
// Берём данные из актуального HEYS.InsulinWave.calculate()
function getWaveBonusText(rule, meal, day, pIndex) {
  if (!HEYS.InsulinWave?.calculate) return null;
  
  // Текущая волна
  const currentWave = HEYS.InsulinWave.calculate({
    meals: day.meals,
    pIndex,
    getProductFromItem: (item) => getProductFromItem(item, pIndex),
    baseWaveHours: 3
  });
  
  if (!currentWave?.insulinWaveHours) return null;
  const currentMinutes = Math.round(currentWave.insulinWaveHours * 60);
  
  // Бонус от правила
  const WAVE_BONUSES = {
    'no_fiber': 0.08,        // fiber -8%
    'protein_alone': -0.15,  // protein +15%
    'fat_missing': -0.10     // fat +10%
  };
  
  const bonus = WAVE_BONUSES[rule.id];
  if (!bonus) return null;
  
  const reduction = Math.round(currentMinutes * Math.abs(bonus));
  return bonus > 0 
    ? `→ волна -${reduction} мин 🎯`
    : `→ волна +${reduction} мин ⚠️`;
}
```

### 3. Сезонные рекомендации
```javascript
const SEASONAL = {
  winter: ['Квашеная капуста', 'Хурма', 'Мандарин', 'Имбирь'],
  spring: ['Редис', 'Шпинат', 'Черемша', 'Спаржа'],
  summer: ['Огурец', 'Помидор', 'Арбуз', 'Черника'],
  autumn: ['Тыква', 'Яблоко', 'Груша', 'Виноград']
};
```

### 4. Streak за следование советам
```javascript
// +5 XP за каждое добавление рекомендованного
// Бейдж "🧠 Нутрициолог" за 10 подряд
```

### 5. Quick-swipe на мобильных
Свайп влево на рекомендации = добавить первый продукт.

### 6. Micro-animations (с respect к prefers-reduced-motion)
```css
.optimizer-card {
  animation: slideInUp 0.2s ease-out;
}

.optimizer-success {
  animation: pulse 0.3s ease-out;
}

@keyframes slideInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

@media (prefers-reduced-motion: reduce) {
  .optimizer-card,
  .optimizer-success,
  .synergy-fill {
    animation: none !important;
    transition: none !important;
  }
}
```

### 7. Empty state handling
Если приём пустой (нет продуктов) — НЕ показывать рекомендации.

```javascript
if (!meal.items?.length) return null;
```

### 8. AI-style typing effect для объяснений
```javascript
// При раскрытии "Почему это важно?" — печатающийся текст
function TypewriterText({ text, speed = 20 }) {
  const [displayed, setDisplayed] = React.useState('');
  
  React.useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplayed(text);
      return;
    }
    
    let i = 0;
    const timer = setInterval(() => {
      setDisplayed(text.slice(0, i));
      i++;
      if (i > text.length) clearInterval(timer);
    }, speed);
    
    return () => clearInterval(timer);
  }, [text]);
  
  return React.createElement('span', null, displayed);
}
```

### 9. Confetti при streak следования советам
```javascript
// При 3+ подряд добавлениях рекомендованных продуктов
if (optimizerStreak >= 3 && HEYS.confetti) {
  HEYS.confetti.fire({ particleCount: 30, spread: 50 });
}
```

---

## 🛡️ Edge Cases

| Случай | Поведение |
|--------|----------|
| Пустой приём (0 продуктов) | Не показывать рекомендации |
| Один продукт | Показывать, если есть применимые правила |
| Продукт уже в приёме | Показывать "+50г (уже Xг)" |
| Нет подходящих правил | Показывать мотивационное "Отлично! 👍" |
| Приём с фото | Карточка должна корректно сжиматься |
| Dark mode | Все цвета должны быть адаптированы |
| prefers-reduced-motion | Отключить все анимации |
| Нет pIndex | Graceful degradation — не показывать |
| Ошибка в правиле | try/catch, логировать, показать следующее |

---

## ✅ Чеклист реализации

### Phase 0: Подготовка
- [ ] Выполнить все пункты из Phase 0 выше
- [ ] `git status` — чистое состояние
- [ ] Скриншот текущего MealCard

### Phase 1: Ядро
- [ ] Создать `heys_meal_optimizer_v1.js`
- [ ] Реализовать `NUTRIENT_KEYWORDS` справочник
- [ ] Реализовать `RECOMMENDED_PORTIONS` справочник
- [ ] Реализовать `detectCategories()` через keywords
- [ ] Реализовать `getMealOptimization()` с ранжированием
- [ ] Реализовать `calculateSmartPortion()` гибридно
- [ ] Реализовать 50+ правил из таблиц выше
- [ ] Добавить `trackUserAction()` с localStorage

### Phase 2: UI
- [ ] Реализовать `MealOptimizerCard` (React.createElement!)
- [ ] Реализовать `SynergyVisualization` компонент
- [ ] Состояния: свёрнутое / развёрнутое / после добавления
- [ ] Анимации появления и успеха

### Phase 3: Стили
- [ ] Создать `800-meal-optimizer.css`
- [ ] Добавить `@import` в main.css
- [ ] Стили для всех типов (critical, synergy, conflict, ...)
- [ ] Dark mode поддержка
- [ ] Микроанимации (pulse, slide, success)

### Phase 4: Интеграция
- [ ] Найти точную строку в MealCard (~2355)
- [ ] Добавить вызов `MealOptimizerCard` в MealCard
- [ ] Передать пропсы: meal, pIndex, context, onAddProduct
- [ ] Реализовать `handleAddOptimizedProduct`
- [ ] Сохранять `meal.optimization`

### Phase 5: Финализация
- [ ] `node --check` на новый файл
- [ ] `pnpm type-check`
- [ ] `pnpm build`
- [ ] Тест на mobile (DevTools → iPhone SE)
- [ ] Тест dark mode
- [ ] Перенести в done.md

---

## 🔙 Rollback план

Если что-то пойдёт не так:
1. `git checkout apps/web/heys_day_v12.js`
2. Удалить `heys_meal_optimizer_v1.js`
3. Удалить `800-meal-optimizer.css`
4. Убрать `@import` из main.css

---

## 📊 Метрики успеха

| Метрика | Цель |
|---------|------|
| Показов рекомендаций | 1000+ |
| Раскрытие (expand) | >40% |
| Добавление продукта | >25% |
| Повторное использование | >60% |
| Рост клетчатки в приёмах | +30% |
| Снижение среднего ГИ | -10% |

---

## Changelog

| Версия | Дата | Изменения |
|--------|------|----------|
| 1.2.0 | 2025-12-10 | **Глубокий аудит v2**: +5 новых блокеров (B4-B8), ответы на 3 уточняющих вопроса, localStorage→U.lsSet, безопасный haptic, лимит истории 50 записей, интеграция с реальным InsulinWave.calculate(), Edge Cases секция, +4 WOW-фишки (typing effect, confetti streak, micro-animations, empty state), prefers-reduced-motion support |
| 1.1.0 | 2025-12-10 | **Аудит**: Phase 0 с блокерами, keyword-детекция вместо микронутриентов, CSS slot 800, точное место в MealCard, переиспользование утилит из advice, визуализация синергии, haptic feedback, 50+ правил |
| 1.0.0 | 2025-12-10 | Первоначальная версия промпта |
