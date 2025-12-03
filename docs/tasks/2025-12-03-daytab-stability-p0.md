# Стабилизация DayTab — Phase P0 (ПЕРЕСОБРАНО после второго аудита)

**Дата**: 2025-12-03 (финальная версия)  
**Файл**: `apps/web/heys_day_v12.js` (~10,209 строк)  
**Цель**: Добить оставшиеся замыкания `setDay({...day})` + обернуть модалки в `useCallback`  
**Время**: ~45-60 мин

---

## ✅ УЖЕ СДЕЛАНО (другим агентом)

Другой агент выполнил основную работу:

| Компонент | Статус | Строка |
|-----------|--------|--------|
| `ProductRow` | ✅ React.memo | 193 |
| `MealCard` | ✅ React.memo | 262 |
| `AdviceCard` | ✅ React.memo | 646 |
| `setGrams` | ✅ useCallback | 2752 |
| `removeItem` | ✅ useCallback | 2759 |
| `removeMeal` | ✅ useCallback | 2721 |
| `updateMealTime` | ✅ useCallback | 2710 |
| `updateMealField` | ✅ useCallback | 2766 |
| `changeMealType` | ✅ useCallback | 2775 |
| `changeMealMood/Wellbeing/Stress` | ✅ useCallback | 2772-2774 |
| `isNewItem` | ✅ useCallback (accessor) | 2784 |
| Advice handlers | ✅ useCallback | 1404-1559 |

**Validation пройдена**: `pnpm build` ✅, `pnpm lint` ✅

---

## 🎯 ОСТАЛОСЬ СДЕЛАТЬ

### Приоритет 1: Модалки → useCallback

**Проблема**: Модалки определены как обычные `function`, не обёрнуты в useCallback.

| Функция | Строка | Статус |
|---------|--------|--------|
| `openEditGramsModal` | 2079 | ❌ обычная function |
| `openTimeEditor` | 2521 | ❌ обычная function |
| `openMoodEditor` | 2538 | ❌ обычная function |

**Решение**: Заменить на `const ... = React.useCallback(...)`:
```javascript
// Было:
function openEditGramsModal(mealIndex, itemId, currentGrams, product) {
  setEditGramsTarget({ mealIndex, itemId, product });
  setEditGramsValue(currentGrams || 100);
}

// Стало:
const openEditGramsModal = React.useCallback((mealIndex, itemId, currentGrams, product) => {
  setEditGramsTarget({ mealIndex, itemId, product });
  setEditGramsValue(currentGrams || 100);
}, []);
```

---

### Приоритет 2: Остаточные `setDay({...day})` замыкания

**20 мест** с прямым замыканием на `day` (вместо `setDay(prev => ...)`):

| Категория | Строки | Кол-во |
|-----------|--------|--------|
| Trainings | 1165, 2244, 3081 | 3 |
| Water/Household | 2023, 2051, 2070 | 3 |
| Sleep | 2351, 3186, 3188, 3219 | 4 |
| DayScore | 2382, 3289, 3324 | 3 |
| Meals (другие) | 2589, 2615, 2629, 2682, 2734 | 5 |
| Steps/Deficit | 2999, 3013, 3027 | 3 |

**Решение**: Переписать на функциональный set:
```javascript
// Было:
setDay({ ...day, trainings: arr });

// Стало:
setDay(prev => ({ ...prev, trainings: arr }));
```

---

### Приоритет 3: newItemIds — Set с проблемой memo

**Проблема**: `isNewItem` зависит от `newItemIds` в deps → при любом add/delete создаётся новая функция.

```javascript
const isNewItem = React.useCallback((itemId) => newItemIds.has(itemId), [newItemIds]);
```

**Решение (опционально)**: Передавать версию Set или использовать ref:
```javascript
const newItemIdsRef = React.useRef(new Set());
// При изменении обновлять ref, не state
// isNewItem без deps — стабильная ссылка
```

---

## Phase 0 — Подготовка

### До начала:
- [ ] `node -c apps/web/heys_day_v12.js` — синтаксис OK
- [ ] Бэкап: `cp apps/web/heys_day_v12.js apps/web/heys_day_v12.backup3.js`

### Правило:
**После КАЖДОГО изменения**: `node -c apps/web/heys_day_v12.js`

---

## ✅ Чеклист

### Приоритет 1 — Модалки:
- [ ] `openEditGramsModal` (строка 2079) → useCallback
- [ ] `openTimeEditor` (строка 2521) → useCallback
- [ ] `openMoodEditor` (строка 2538) → useCallback

### Приоритет 2 — Остаточные setDay замыкания:
- [ ] Trainings (строки 1165, 2244, 3081)
- [ ] Water (строки 2023, 2051)
- [ ] Household (строка 2070)
- [ ] Sleep (строки 2351, 3186, 3188, 3219)
- [ ] DayScore (строки 2382, 3289, 3324)
- [ ] Meals/другие (строки 2589, 2615, 2629, 2682, 2734)
- [ ] Steps/Deficit inline (строки 2999, 3013, 3027)

### После КАЖДОГО изменения:
- [ ] `node -c apps/web/heys_day_v12.js`

### Финальные проверки:
- [ ] `pnpm build` проходит
- [ ] `pnpm lint` проходит
- [ ] Ручные тесты: trainings, water, sleep, dayScore

---

## ⚠️ Ограничения

- НЕ трогать компоненты (ProductRow, MealCard, AdviceCard) — уже сделаны
- НЕ трогать графики (строки 3400-6600)
- НЕ менять UMD формат
- Сохранить haptic feedback

---

## 📊 Ожидаемый результат

| Метрика | До | После |
|---------|-----|-------|
| setDay с замыканием | ~20 | 0 |
| Модалки без useCallback | 3 | 0 |

---

## 🔙 Rollback

```bash
cp apps/web/heys_day_v12.backup3.js apps/web/heys_day_v12.js
```

---

## Следующие шаги (P1-P3)

После P0:
1. **P1**: Стабилизация `newItemIds` (ref вместо Set в deps)
2. **P2**: Advice-модуль → вынести в отдельный хук/контейнер
3. **P3**: Графики/попапы → отдельный компонент (3200 строк)
