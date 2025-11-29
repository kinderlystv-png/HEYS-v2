# 🍞 Toast Improvements v2 — Дополнительные рекомендации

> **Цель**: Добавить оставшиеся умные рекомендации + финальная полировка модуля советов.

**✅ Статус**: advice-module.md ВЫПОЛНЕН (2025-11-29)  
**⬅️ Зависит от**: [2025-11-29-advice-module.md](./2025-11-29-advice-module.md) ✅

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
| Toast render с fallback на macroTip | ✅ |

### 🟡 Что осталось улучшить

1. **`macroTip` useMemo НЕ удалён** — Старый код (строки ~2653-2870) остался как fallback. Это работает, но дублирует логику. **Рекомендация**: Удалить после стабилизации модуля.

2. **`returning` emotional state не активен** — `lastVisitDaysAgo` hardcoded = 0. Для активации нужен localStorage ключ `heys_last_visit`.

3. **Нет `meal_opened` trigger** — Описан в промпте, но не реализован. Нужен listener при раскрытии приёма пищи.

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

### Задача 4: Удалить старый macroTip useMemo

**Зачем**: Старый код дублирует логику модуля советов. Сейчас работает fallback `advicePrimary || macroTip`, но это лишний код.

**Где**: `apps/web/heys_day_v12.js` строки ~2653-2870

**Действие**: Удалить весь `const macroTip = React.useMemo(() => { ... })` блок

**⚠️ Риск**: Низкий — модуль уже покрывает все советы

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

**В heys_day_v12.js добавить useEffect:**
```javascript
// Записываем дату последнего визита
React.useEffect(() => {
  try {
    localStorage.setItem('heys_last_visit', new Date().toISOString().slice(0, 10));
  } catch(e) {}
}, []);
```

**В heys_advice_v1.js изменить getEmotionalState:**
```javascript
// Вычисляем lastVisitDaysAgo
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

---

### Задача 9: Добавить meal_opened trigger (опционально)

**Зачем**: Показывать советы при раскрытии приёма пищи

**Где**: `apps/web/heys_day_v12.js` — в обработчике раскрытия MealCard

**Примечание**: Низкий приоритет, пока достаточно `product_added` и `tab_open`

---

## ✅ Definition of Done

- [ ] Сезонные рекомендации в advice модуле (Задача 5)
- [ ] Разнообразие рациона в advice модуле (Задача 6)
- [ ] После сладкого → белок в advice модуле (Задача 7)
- [ ] `returning` emotional state работает (Задача 8)
- [ ] (Опционально) Удалить старый macroTip useMemo (Задача 4)
- [ ] Нет регрессий в существующих toast'ах
- [ ] `pnpm type-check && pnpm build` проходят

---

**Время**: ~30-40 минут
**Сложность**: Низкая
**Приоритет**: Средний — модуль уже работает, это полировка
