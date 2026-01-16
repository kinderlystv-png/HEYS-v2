# HEYS Day v12 - План Дальнейшего Рефакторинга (Фазы 9-15)
## Цель: Уменьшить главный файл до 3,000-4,000 строк

---

## Текущее Состояние

```
Главный файл:        20,068 строк
Цель:                3,000-4,000 строк
Требуется извлечь:   16,068-17,068 строк (~80%)
```

---

## 📋 Анализ Оставшегося Кода

### Структура heys_day_v12.js (20,068 строк)

1. **Imports и Setup** (~70 строк)
2. **MealOptimizerSection** (~178 строк) - уже выделен в компонент
3. **HEYS.DayTab функция** (~19,820 строк) - ОСНОВНАЯ ЦЕЛЬ
   - Hooks и State Management (~2,000 строк)
   - Event Handlers (~3,500 строк)
   - Helper Functions (~1,500 строк)
   - Effects (~1,000 строк)
   - Render Logic (JSX) (~11,820 строк)

---

## 🎯 План Извлечения по Фазам

### **Phase 9: State Management & Hooks** 
**Приоритет:** 🔴 HIGH  
**Риск:** 🟡 MEDIUM  
**Время:** 4-6 часов  
**Извлечь:** ~2,000 строк

#### Что извлечь:
- `useDayState` - управление состоянием дня
- `useMealsState` - управление приемами пищи
- `useAdviceState` - управление советами
- `useUIState` - управление UI состоянием (popups, expanded cards)
- `useProductsIndex` - индексирование продуктов

#### Создать файл: `heys_day_state_hooks.js`

#### Структура:
```javascript
HEYS.dayStateHooks = {
  useDayState,
  useMealsState,
  useAdviceState,
  useUIState,
  useProductsIndex
};
```

#### Зависимости:
- `dayUtils` - базовые утилиты
- `models` - модели данных
- `localStorage` handling

---

### **Phase 10: Event Handlers**
**Приоритет:** 🔴 HIGH  
**Риск:** 🟢 LOW  
**Время:** 5-7 часов  
**Извлечь:** ~3,500 строк

#### Что извлечь:
**10.1: Meal Handlers** (~1,200 строк)
- `handleAddMeal`
- `handleRemoveMeal`
- `handleChangeMealType`
- `handleChangeTime`
- `handleChangeMood/Wellbeing/Stress`

**10.2: Product Handlers** (~1,000 строк)
- `handleAddProduct`
- `handleRemoveProduct`
- `handleChangeGrams`
- `handleProductSearch`

**10.3: Day Handlers** (~800 строк)
- `handleDateChange`
- `handleDaySync`
- `handleDayUpdate`
- `handleWeightUpdate`
- `handleStepsUpdate`

**10.4: Advice Handlers** (~500 строк)
- `handleAdviceDismiss`
- `handleAdviceSchedule`
- `handleAdviceRate`

#### Создать файлы:
- `heys_day_meal_handlers.js` (1,200 строк)
- `heys_day_product_handlers.js` (1,000 строк)
- `heys_day_handlers.js` (1,300 строк)

#### Структура:
```javascript
HEYS.dayMealHandlers = { /* meal handlers */ };
HEYS.dayProductHandlers = { /* product handlers */ };
HEYS.dayHandlers = { /* day & advice handlers */ };
```

---

### **Phase 11: Helper Functions**
**Приоритет:** 🟡 MEDIUM  
**Риск:** 🟢 LOW  
**Время:** 3-4 часа  
**Извлечь:** ~1,500 строк

#### Что извлечь:
- `calculateDayTotals` - расчет итогов дня
- `calculateTDEE` - расчет энергозатрат
- `buildAdviceList` - построение списка советов
- `sortMealsByTime` - сортировка приемов
- `validateMealData` - валидация данных
- `formatDayData` - форматирование данных

#### Создать файл: `heys_day_calculations.js`

#### Структура:
```javascript
HEYS.dayCalculations = {
  calculateDayTotals,
  calculateTDEE,
  buildAdviceList,
  sortMealsByTime,
  validateMealData,
  formatDayData
};
```

---

### **Phase 12: Effects & Side Effects**
**Приоритет:** 🟡 MEDIUM  
**Риск:** 🟡 MEDIUM  
**Время:** 3-4 часа  
**Извлечь:** ~1,000 строк

#### Что извлечь:
- `useAutoSaveEffect` - автосохранение
- `useSyncEffect` - синхронизация с облаком
- `useAnalyticsEffect` - аналитика
- `useNotificationEffect` - уведомления
- `useKeyboardEffect` - клавиатурные события

#### Создать файл: `heys_day_effects.js`

#### Структура:
```javascript
HEYS.dayEffects = {
  useAutoSaveEffect,
  useSyncEffect,
  useAnalyticsEffect,
  useNotificationEffect,
  useKeyboardEffect
};
```

---

### **Phase 13: Render Components (Large JSX Blocks)**
**Приоритет:** 🔴 HIGH  
**Риск:** 🟢 LOW  
**Время:** 6-8 часов  
**Извлечь:** ~5,000 строк

#### Что извлечь:
**13.1: Header Components** (~800 строк)
- `DayHeader` - шапка дня с датой и навигацией
- `DayStatsBar` - полоса статистики (ккал, БЖУ)
- `TDEEIndicator` - индикатор энергобаланса

**13.2: Summary Components** (~1,200 строк)
- `DaySummaryCard` - сводка дня
- `MacrosChart` - график макронутриентов
- `CaloricDebtCard` - карточка калорийного долга

**13.3: Advice List** (~1,000 строк)
- `AdviceListSection` - секция советов
- `AdviceFilters` - фильтры советов

**13.4: Meal List** (~2,000 строк)
- `MealListSection` - список приемов пищи
- `EmptyMealState` - пустое состояние
- `AddMealButton` - кнопка добавления

#### Создать файлы:
- `heys_day_header.js` (800 строк)
- `heys_day_summary.js` (1,200 строк)
- `heys_day_advice_list.js` (1,000 строк)
- `heys_day_meal_list.js` (2,000 строк)

---

### **Phase 14: Bottom Sections & Modals**
**Приоритет:** 🟡 MEDIUM  
**Риск:** 🟢 LOW  
**Время:** 4-5 часов  
**Извлечь:** ~3,000 строк

#### Что извлечь:
**14.1: Footer Sections** (~1,500 строк)
- `TrainingsSection` - секция тренировок
- `SupplementsSection` - секция добавок
- `NotesSection` - заметки дня

**14.2: Modals & Popups** (~1,500 строк)
- `TimePickerModal` - выбор времени
- `MoodPickerModal` - выбор настроения
- `GramsEditorModal` - редактор граммов
- `MealQualityPopup` - детали качества приема

#### Создать файлы:
- `heys_day_footer_sections.js` (1,500 строк)
- `heys_day_modals.js` (1,500 строк)

---

### **Phase 15: Final Cleanup & Core DayTab**
**Приоритет:** 🔴 HIGH  
**Риск:** 🟢 LOW  
**Время:** 2-3 часа  
**Извлечь:** ~3,000 строк (остаётся ~3,500-4,000)

#### Что остаётся в главном файле:
- Imports и module setup (~100 строк)
- MealOptimizerSection компонент (~180 строк)
- Core DayTab logic (~3,200 строк):
  - Props destructuring
  - Core hooks вызовы
  - Main render structure
  - Error boundaries
  - Loading states

#### Финальная структура DayTab:
```javascript
HEYS.DayTab = function DayTab(props) {
  // 1. Props & Setup (50 строк)
  // 2. State Hooks из модулей (100 строк)
  // 3. Event Handlers из модулей (100 строк)
  // 4. Effects из модулей (100 строк)
  // 5. Calculations из модулей (50 строк)
  // 6. Main Render (3,000 строк)
  //    - Используя компоненты из модулей
  return React.createElement(...)
};
```

---

## 📊 Итоговое Распределение

### После всех фаз (9-15):

| Компонент | Строк | Файл |
|-----------|-------|------|
| **Главный файл** | **3,500-4,000** | `heys_day_v12.js` |
| State Hooks | 2,000 | `heys_day_state_hooks.js` |
| Meal Handlers | 1,200 | `heys_day_meal_handlers.js` |
| Product Handlers | 1,000 | `heys_day_product_handlers.js` |
| Day/Advice Handlers | 1,300 | `heys_day_handlers.js` |
| Calculations | 1,500 | `heys_day_calculations.js` |
| Effects | 1,000 | `heys_day_effects.js` |
| Header | 800 | `heys_day_header.js` |
| Summary | 1,200 | `heys_day_summary.js` |
| Advice List | 1,000 | `heys_day_advice_list.js` |
| Meal List | 2,000 | `heys_day_meal_list.js` |
| Footer Sections | 1,500 | `heys_day_footer_sections.js` |
| Modals | 1,500 | `heys_day_modals.js` |
| **Итого модулей** | **15,000** | **13 новых файлов** |

### Плюс уже созданные модули (Phases 2-8):

| Компонент | Строк | Файл |
|-----------|-------|------|
| Popups | 71 | `heys_day_popups.js` |
| AdviceCard | 219 | `heys_day_advice_card.js` |
| Add Product | 394 | `heys_day_add_product.js` |
| Gallery | 479 | `heys_day_gallery.js` |
| Meal Scoring | 1,338 | `day/_meal_quality.js` |
| MealCard | 1,295 | `heys_day_meal_card.js` |
| **Итого (Phases 2-8)** | **3,796** | **6 файлов** |

---

## 🎯 Приоритизация Фаз

### Критический путь (для достижения 3,000-4,000 строк):

1. **Phase 13** (5,000 строк) - Render Components
2. **Phase 10** (3,500 строк) - Event Handlers  
3. **Phase 14** (3,000 строк) - Bottom Sections & Modals
4. **Phase 9** (2,000 строк) - State Hooks
5. **Phase 11** (1,500 строк) - Helper Functions
6. **Phase 12** (1,000 строк) - Effects

**Общее извлечение:** 16,000 строк
**Остаток:** 4,068 строк ✅

---

## ⚠️ Риски и Митигация

### High Risk Areas:

1. **State Hooks (Phase 9)**
   - **Риск:** Сложные зависимости между hooks
   - **Митигация:** Извлекать по одному hook с тестированием

2. **Effects (Phase 12)**
   - **Риск:** Побочные эффекты и race conditions
   - **Митигация:** Comprehensive testing после каждого

3. **Render Components (Phase 13)**
   - **Риск:** Props drilling и context
   - **Митигация:** Использовать React.memo и careful props design

### Medium Risk Areas:

4. **Event Handlers (Phase 10)**
   - **Риск:** Closure scope issues
   - **Митигация:** useCallback для стабильных ссылок

### Low Risk Areas:

5. **Helper Functions (Phase 11)**
6. **Bottom Sections (Phase 14)**

---

## 🧪 Стратегия Тестирования

### Для каждой фазы:

1. **Unit Tests** - для извлеченных функций
2. **Integration Tests** - для hooks и handlers
3. **Smoke Tests** - UI проверка после каждой фазы
4. **Regression Tests** - для критических функций

### Чеклист на фазу:

- [ ] Syntax validation (node -c)
- [ ] Import/export проверка
- [ ] Smoke test в браузере
- [ ] Проверка HMR
- [ ] Console errors check
- [ ] Visual regression test

---

## 📅 Временная Оценка

| Фаза | Время | Риск |
|------|-------|------|
| Phase 9: State Hooks | 4-6h | 🟡 Medium |
| Phase 10: Event Handlers | 5-7h | 🟢 Low |
| Phase 11: Helper Functions | 3-4h | 🟢 Low |
| Phase 12: Effects | 3-4h | 🟡 Medium |
| Phase 13: Render Components | 6-8h | 🟢 Low |
| Phase 14: Bottom Sections | 4-5h | 🟢 Low |
| Phase 15: Final Cleanup | 2-3h | 🟢 Low |
| **ИТОГО** | **27-37h** | |

**С учетом тестирования и отладки:** 35-45 часов

---

## 🚀 Быстрый Старт (Quick Wins)

Если нужно быстро достичь 4,000 строк:

### Приоритет 1 (критично):
1. **Phase 13** - Render Components (5,000 строк, 6-8h)
2. **Phase 10** - Event Handlers (3,500 строк, 5-7h)

**После этих 2 фаз:** 11,568 строк ✅ (близко к цели)

### Приоритет 2 (довести до 4,000):
3. **Phase 14** - Bottom Sections (3,000 строк, 4-5h)

**После 3 фаз:** 8,568 строк (близко к цели)

---

## 💡 Рекомендации

### Порядок выполнения:

**Вариант A (Безопасный):**
Phase 9 → 10 → 11 → 12 → 13 → 14 → 15

**Вариант B (Быстрый к цели):**
Phase 13 → 10 → 14 → 9 → 11 → 12 → 15

**Вариант C (Балансированный):**
Phase 10 → 13 → 9 → 14 → 11 → 12 → 15

### Рекомендую: **Вариант C (Балансированный)**

1. Начать с handlers (безопасно, много строк)
2. Затем render components (максимум строк)
3. State hooks (критичные зависимости)
4. Bottom sections (чистка)
5. Остальное (финализация)

---

## 📋 Чеклист Готовности

Перед началом:
- [ ] Backup текущего состояния
- [ ] Создать feature branch
- [ ] Настроить автосохранение
- [ ] Подготовить smoke tests
- [ ] Документировать текущие зависимости

---

## 📝 Примечания

- Все модули должны быть self-contained
- Использовать fallbacks для зависимостей
- Документировать exports в каждом модуле
- Сохранять обратную совместимость
- Тестировать после каждого извлечения

---

*Создан: 2026-01-14*  
*Цель: 3,000-4,000 строк в главном файле*  
*Статус: Готов к выполнению*
