# ML Feedback Loop — Verification Checklist

> Дата завершения: 16.02.2026

## ✅ Реализовано (10/10 шагов)

### Код

- ✅ `pi_product_picker.js` v2: productId в suggestions (3 изменения)
- ✅ `pi_ui_meal_rec_card.js` v12: storeRecommendation + markFollowed + кнопки
  "+" (4 новые функции, 70+ строк)
- ✅ `heys-components.css`: стили для кнопки "+" (40 строк CSS)
- ✅ `index.html`: версии v2/v12 для cache-busting
- ✅ `pi_feedback_loop.test.js`: 2 новых теста (productId tracking)

### Тесты

- ✅ 6/6 Feedback Loop tests
- ✅ 54/54 Meal Recommender + Product Picker tests
- ✅ **ИТОГО: 60/60 тестов прошли**

### Документация

- ✅ `HEYS_Insights_v5_Deep_Analytics_c7.md`: обновлён Section Фаза 6

---

## 🧪 План проверки в production

### 1. Запуск dev server

```bash
cd C:\Users\Ant\HEYS-v2
pnpm dev:web
```

Открыть: http://localhost:3001

### 2. Вход в приложение

- Войти как куратор ИЛИ по PIN-коду клиента
- Перейти на вкладку "Дневник"

### 3. Проверка recommendation card

**Открыть консоль (F12) → установить фильтр: `mealrec`**

Ожидаемые логи:

```
[MEALREC] 🎬 useMemo triggered
[MEALREC] ✅ Backend available
[MEALREC] 🚀 Calling recommend()...
[MEALREC] ✅ Recommendation stored, recId: rec_meal_1739XXXXXX_XXXX
[MEALREC] 🎨 Rendering card UI...
```

### 4. Проверка Шага 1: storeRecommendation

- [ ] В логах видно: `[MEALREC] ✅ Recommendation stored, recId: rec_meal_...`
- [ ] `recId` имеет формат `rec_meal_{timestamp}_{random}`

### 5. Проверка Шага 2: кнопки "+"

- [ ] Развернуть карточку рекомендации (клик на header)
- [ ] В секции "Варианты продуктов:" рядом с каждым продуктом видна зелёная
      круглая кнопка "+"
- [ ] Клик на "+" → продукт добавляется в последний приём пищи
- [ ] В консоли: `[MEALREC] ✅ Suggestion added to diary: Творог (200г)`
- [ ] В консоли: `[MEALREC] ✅ Marked as followed via "+" button`

### 6. Проверка Шага 3: автоотслеживание

- [ ] НЕ кликать на "+" — вручную добавить продукт из рекомендации через обычный
      "Добавить продукт"
- [ ] В консоли:
      `[MEALREC] ✅ Auto-tracked: user added recommended product: Творог`
- [ ] Повторное добавление того же продукта НЕ вызывает повторный markFollowed
      (guard работает)

### 7. Проверка Шага 4: quick feedback

- [ ] Кликнуть 👍 или 👎 на карточке
- [ ] В консоли: `[MEALREC] ✅ Feedback submitted: 👍`
- [ ] В консоли: `[MEALREC] ✅ Quick feedback sent to ML loop: 1`

### 8. Проверка localStorage

Открыть DevTools → Application → Local Storage → localhost:3001

**Проверить ключи:**

```javascript
// Recommendation history
heys_meal_rec_history_{clientId}
// Содержит: [{ id, type, timestamp, recommendation, followed, outcome }]

// ML weights
heys_meal_rec_weights_{clientId}
// Содержит: { "PROTEIN_DEFICIT_123": 1.05, "BALANCED_456": 0.95, ... }

// Quick feedback
heys_meal_rec_feedback_{clientId}
// Содержит: [{ id, timestamp, scenario, rating, products, confidence }]
```

### 9. Проверка outcome modal (через 3+ дней)

**Эмуляция будущей даты:**

```javascript
// В консоли браузера (после клика на "+")
const recHistory = JSON.parse(
  localStorage.getItem('heys_meal_rec_history_' + HEYS.currentClientId) || '[]',
);
const lastRec = recHistory[recHistory.length - 1];

// Изменить timestamp на 3 дня назад
lastRec.timestamp = new Date(
  Date.now() - 3 * 24 * 60 * 60 * 1000,
).toISOString();
lastRec.followedAt = new Date(
  Date.now() - 3 * 24 * 60 * 60 * 1000,
).toISOString();
localStorage.setItem(
  'heys_meal_rec_history_' + HEYS.currentClientId,
  JSON.stringify(recHistory),
);

// Перезагрузить страницу → через 10 секунд должен всплыть outcome modal
location.reload();
```

**Ожидаемый результат:**

- [ ] Через 10 секунд после загрузки всплывает modal "Как прошёл приём пищи?"
- [ ] 3 слайдера: Насыщение, Энергия, Настроение (1-5)
- [ ] Кнопка "Отправить" работает
- [ ] В консоли: `[MEALREC][FeedbackLoop] 📦 Adjusting weights for: ...`
- [ ] В консоли:
      `[MEALREC][FeedbackLoop] ✅ Weight updated for product_id XXX: 1.00 → 1.05`

### 10. Проверка ML weight application

**Создать новую рекомендацию после feedback:**

- [ ] Добавить несколько приёмов пищи
- [ ] Дождаться новой рекомендации
- [ ] В логах Product Picker должно быть: `ML weight multiplier: 1.05` (если был
      позитивный feedback)

---

## 🐛 Troubleshooting

### Проблема: recId = undefined

**Причина:** feedbackLoop не загружен **Решение:**

```javascript
// В консоли браузера
HEYS.InsightsPI.feedbackLoop;
// Должно вернуть: { storeRecommendation: f, markFollowed: f, ... }
```

### Проблема: кнопки "+" не видны

**Причина:** CSS не загрузился или версия закеширована **Решение:**

- Ctrl+F5 (hard reload)
- Проверить в DevTools → Network → heys-components.css?v=... загружается ли

### Проблема: продукт не добавляется по клику "+"

**Причина:** pIndex не передан в карточку ИЛИ продукт не найден в индексе
**Решение:**

```javascript
// В консоли
HEYS.MealRecCard.renderCard;
// Проверить props: { pIndex: { byId: Map, byName: Map } }
```

### Проблема: auto-tracking не срабатывает

**Причина:** heysProductAdded event не содержит detail.product **Решение:**
Проверить в какой функции addProductToMeal вызывается (их 3 варианта в коде)

---

## 📊 Критерии успеха

### Минимальные требования (MVP)

- [x] 60/60 тестов прошли
- [ ] recId генерируется и сохраняется
- [ ] Кнопки "+" добавляют продукты в дневник
- [ ] markFollowed вызывается (любым способом)
- [ ] Quick feedback (👍/👎) обновляет ML weights
- [ ] localStorage содержит 3 ключа (history, weights, feedback)

### Полная функциональность

- [ ] Dual tracking работает (кнопка "+" + автоопределение)
- [ ] Outcome modal всплывает через 3/7/14 дней
- [ ] ML weights влияют на следующие рекомендации
- [ ] Все логи [MEALREC] видны при фильтре "mealrec"
- [ ] Стили кнопок корректны в light/dark mode
- [ ] Haptic feedback работает в Telegram WebApp

---

## 🚀 Следующие шаги (после проверки)

1. **Git commit:**

   ```bash
   git add .
   git commit -m "feat(insights): complete ML feedback loop integration

   - Add productId to suggestions (pi_product_picker v2)
   - Implement storeRecommendation auto-call (useEffect in card)
   - Add '+' buttons for direct product adding
   - Implement dual tracking (button + auto-detect via heysProductAdded)
   - Link handleFeedback to feedbackLoop.submitFeedback
   - Add CSS for '+' button (light/dark mode)
   - Update tests (6/6 feedback loop, 60/60 total)
   - Update documentation (Phase 6 complete)

   Closes R2.7 Step 3 (markFollowed integration)
   ML feedback loop now fully operational: recommendation → followed → reminders → outcome → ML weight update"
   ```

2. **Production deployment:**
   - `pnpm build` (только перед коммитом)
   - Проверить lighthouse-report
   - Deploy to app.heyslab.ru

3. **Monitoring (первые 24 часа):**
   - Собрать логи от реальных пользователей
   - Проверить conversion rate: recommendations → follows (ожидается >20%)
   - Собрать первые outcome data (через 3 дня)
   - Анализ ML weight distribution (ожидается центр 0.9-1.1, outliers 0.5/2.0)

4. **Итерации:**
   - A/B test: с ML weights vs без
   - Tune EMA alpha (0.1 → 0.15 при быстрой адаптации)
   - Добавить decay для старых весов (>30 days → 1.0)
