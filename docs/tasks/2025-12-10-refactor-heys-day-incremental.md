# Задача: Инкрементальный рефакторинг heys_day_v12.js

**Дата**: 2025-12-10  
**Статус**: 🟢 Ready to Start  
**Приоритет**: High  
**Время**: ~6-8 часов (разбито на фазы)  
**Связано**: PR #15 (закрывается), новый подход

---

## 🎯 Цель

Уменьшить `heys_day_v12.js` с 15,647 строк до ~2,000 строк через серию **маленьких, проверенных PRs**.

---

## 📋 Контекст

**Проблема с PR #15**:
- 35k+ строк изменений
- Merge conflicts
- Никогда не тестировалось в runtime
- Слишком рискованно мержить

**Новый подход**:
- Маленькие PRs (<1000 строк каждый)
- Обязательное runtime тестирование после каждого PR
- Одна фаза за раз
- Частый rebase с main

---

## 🔄 Фазы рефакторинга

### Phase 1: Scoring Logic (Priority: 🔴 Critical)
**Цель**: Извлечь логику подсчёта качества приёма пищи  
**Сокращение**: ~750 строк  
**Риск**: 🟢 Низкий (чистые функции)  
**Время**: ~1-2 часа  

**Файлы для создания**:
1. `apps/web/heys_day_scoring/mealQualityScore.js` (~436 строк)
   - `getMealQualityScore(meal, mealType, optimum, pIndex)`
   - `calcKcalScore`, `calcMacroScore`, `calcCarbQuality`
   - `calcFatQuality`, `calcGiHarmScore`
   - Constants: `MEAL_KCAL_DISTRIBUTION`, `IDEAL_MACROS`

2. `apps/web/heys_day_scoring/nutrientColors.js` (~398 строк)
   - `getNutrientColor(nutrient, value, totals)`
   - `getNutrientTooltip(nutrient, value, totals)`
   - `getDailyNutrientColor(nutrient, fact, norm)`
   - `getDailyNutrientTooltip(nutrient, fact, norm)`

**Шаги**:
- [ ] 1.1. Создать `heys_day_scoring/mealQualityScore.js`
- [ ] 1.2. Создать `heys_day_scoring/nutrientColors.js`
- [ ] 1.3. Добавить скрипты в `index.html`
- [ ] 1.4. Добавить импорты в `heys_day_v12.js`
- [ ] 1.5. Удалить inline код из `heys_day_v12.js`
- [ ] 1.6. Syntax check: `node -c` для всех файлов
- [ ] 1.7. **RUNTIME TEST**: `pnpm dev`, проверить scoring
- [ ] 1.8. Создать PR (~800 lines changed)
- [ ] 1.9. Мержить после code review

**Критерии успеха**:
- ✅ Syntax validation passes
- ✅ `pnpm type-check` passes
- ✅ `pnpm build` succeeds
- ✅ Качество приёма отображается корректно
- ✅ Цвета нутриентов правильные (зелёный/жёлтый/красный)
- ✅ No breaking changes

---

### Phase 2.1: ZoneMinutesPicker Modal (Priority: 🟡 Medium)
**Цель**: Извлечь простейшую модалку  
**Сокращение**: ~113 строк  
**Риск**: 🟢 Низкий  
**Время**: ~30 минут  

**Файл для создания**:
- `apps/web/heys_day_modals/ZoneMinutesPicker.js` (~113 строк)

**Props**:
```javascript
{
  isOpen: boolean,
  zoneIndex: number,      // 0-3
  value: number,          // minutes
  kcalPerMin: number,
  onConfirm: (value) => void,
  onCancel: () => void,
  WheelColumn: Component,
  handleSheetTouchStart,
  handleSheetTouchMove,
  handleSheetTouchEnd
}
```

**Шаги**:
- [ ] 2.1.1. Создать модуль с компонентом
- [ ] 2.1.2. Добавить в `index.html`
- [ ] 2.1.3. Импортировать в `heys_day_v12.js`
- [ ] 2.1.4. Заменить inline код
- [ ] 2.1.5. **RUNTIME TEST**: Проверить открытие/закрытие модалки
- [ ] 2.1.6. Создать PR (~150 lines changed)
- [ ] 2.1.7. Мержить

---

### Phase 2.2: SleepQualityPicker Modal (Priority: 🟡 Medium)
**Цель**: Извлечь модалку оценки сна  
**Сокращение**: ~250 строк  
**Риск**: 🟡 Средний (slider + chips)  
**Время**: ~45 минут  

**Файл для создания**:
- `apps/web/heys_day_modals/SleepQualityPicker.js` (~251 строк)

**Props**:
```javascript
{
  isOpen: boolean,
  value: number,          // 0-10
  note: string,
  sleepHours: number,
  existingNote: string,
  onConfirm: (value, note) => void,
  onCancel: () => void,
  handleSheetTouchStart,
  handleSheetTouchMove,
  handleSheetTouchEnd
}
```

**Шаги**:
- [ ] 2.2.1. Создать модуль
- [ ] 2.2.2. Добавить в `index.html`
- [ ] 2.2.3. Импортировать и заменить
- [ ] 2.2.4. **RUNTIME TEST**: Проверить слайдер, chips, note
- [ ] 2.2.5. Создать PR (~300 lines changed)
- [ ] 2.2.6. Мержить

---

### Phase 2.3: DayScorePicker Modal (Priority: 🟡 Medium)
**Цель**: Извлечь модалку оценки дня  
**Сокращение**: ~220 строк  
**Риск**: 🟡 Средний (автоматический расчёт)  
**Время**: ~40 минут  

**Файл для создания**:
- `apps/web/heys_day_modals/DayScorePicker.js` (~221 строк)

**Props**:
```javascript
{
  isOpen: boolean,
  value: number,          // 0-10
  comment: string,
  autoScore: number,
  existingComment: string,
  moodAvg: number,
  wellbeingAvg: number,
  stressAvg: number,
  onConfirm: (value, comment) => void,
  onCancel: () => void,
  handleSheetTouchStart,
  handleSheetTouchMove,
  handleSheetTouchEnd
}
```

**Шаги**:
- [ ] 2.3.1. Создать модуль
- [ ] 2.3.2. Добавить в `index.html`
- [ ] 2.3.3. Импортировать и заменить
- [ ] 2.3.4. **RUNTIME TEST**: Проверить автоматический расчёт
- [ ] 2.3.5. Создать PR (~280 lines changed)
- [ ] 2.3.6. Мержить

---

### Phase 3.1: WeightSparkline Chart (Priority: 🔵 Low)
**Цель**: Извлечь график веса  
**Сокращение**: ~685 строк  
**Риск**: 🟡 Средний (cycle integration)  
**Время**: ~1.5 часа  

**Файл для создания**:
- `apps/web/heys_day_charts/WeightSparkline.js` (~489 строк)

**Props**:
```javascript
{
  data: Array<{ weight, date, dayNum, isToday, cycleDay, hasWaterRetention }>,
  trend: object,
  onPointClick: (type, point, x, y) => void
}
```

**Зависимости**:
- `HEYS.Cycle.getWaterRetentionInfo`
- `HEYS.dayUtils.parseTime`

**Шаги**:
- [ ] 3.1.1. Найти точные строки в `heys_day_v12.js`
- [ ] 3.1.2. Создать модуль
- [ ] 3.1.3. Добавить в `index.html`
- [ ] 3.1.4. Импортировать и заменить
- [ ] 3.1.5. **RUNTIME TEST**: Проверить cycle зоны, forecast
- [ ] 3.1.6. Создать PR (~750 lines changed)
- [ ] 3.1.7. Мержить

---

### Phase 3.2: KcalSparkline Chart (Priority: 🔵 Low)
**Цель**: Извлечь график калорий  
**Сокращение**: ~1,300 строк  
**Риск**: 🔴 Высокий (zoom, pan, brush, много state)  
**Время**: ~2-3 часа  

**Файл для создания**:
- `apps/web/heys_day_charts/KcalSparkline.js` (~1,558 строк)

**Props**:
```javascript
{
  data: Array<{ kcal, target, date, dayNum, ... }>,
  goal: number,
  selectedDate: string,
  onPointClick: (point, event) => void,
  haptic: Function,
  openExclusivePopup: Function,
  day: object,
  setDay: Function
}
```

**Внутренний state**:
- zoom, pan, brush, slider

**Шаги**:
- [ ] 3.2.1. Найти точные строки
- [ ] 3.2.2. Создать модуль (большой!)
- [ ] 3.2.3. Добавить в `index.html`
- [ ] 3.2.4. Импортировать и заменить
- [ ] 3.2.5. **RUNTIME TEST**: Проверить zoom, pan, brush, slider
- [ ] 3.2.6. Создать PR (~1500 lines changed) ⚠️ **Может нарушить лимит 1000**
- [ ] 3.2.7. Мержить

⚠️ **Внимание**: Возможно, нужно разбить на подфазы:
- 3.2a: Basic sparkline без интерактивности
- 3.2b: Zoom/pan
- 3.2c: Brush selection

---

## ⚠️ Правила безопасности

### Перед КАЖДЫМ PR:
1. ✅ **Syntax validation**: `node -c` для всех изменённых файлов
2. ✅ **Type check**: `pnpm type-check`
3. ✅ **Build**: `pnpm build`
4. ✅ **Runtime test**: `pnpm dev`, проверить в браузере
5. ✅ **No breaking changes**: Проверить внешние API
6. ✅ **Rebase**: `git rebase origin/main` (если main изменился)

### Во время КАЖДОЙ фазы:
- 📝 Commit message: чёткое описание изменений
- 📊 Update checklist в PR description
- 🔍 Code review перед мержем

### Если что-то пошло не так:
- 🚫 **НЕ** продолжать следующую фазу
- 🔙 Откатить изменения: `git reset --hard origin/main`
- 🔧 Зафиксить проблему
- ✅ Re-test перед продолжением

---

## 📊 Метрики прогресса

| Phase | Lines | Status | PR # |
|-------|-------|--------|------|
| 1. Scoring | -750 | ⏳ Pending | — |
| 2.1. ZoneMinutes | -113 | ⏳ Pending | — |
| 2.2. SleepQuality | -250 | ⏳ Pending | — |
| 2.3. DayScore | -220 | ⏳ Pending | — |
| 3.1. WeightChart | -685 | ⏳ Pending | — |
| 3.2. KcalChart | -1,300 | ⏳ Pending | — |
| **Total** | **-3,318** | — | — |

**Прогресс к цели** (15,647 → 2,000):
- После всех фаз: ~12,329 строк (остаётся ~10,329 для Phase 4+)

---

## 🎯 Phase 4+ (Будущее)

После успешного завершения фаз 1-3.2, продолжить с:
- Phase 4: Компоненты карточек (MealCard, HeroMetrics, и т.д.)
- Phase 5: Финальная оптимизация
- Phase 6: Валидация и документация

**Примечание**: Планы Phase 4+ будут обновлены после завершения текущих фаз.

---

## 🔗 Связанные документы

- **PR #15 Analysis**: `docs/PR15_ANALYSIS.md`
- **Original Refactor Plans**: 
  - `docs/REFACTOR_PHASE1_SUMMARY.md`
  - `docs/REFACTOR_PHASE2_PLAN.md`
  - `docs/REFACTOR_PHASE3_PLAN.md`
  - `docs/REFACTOR_FINAL_SUMMARY.md`
- **Reference Implementation**: PR #15 (модули можно использовать как шаблоны)

---

## ✅ Готовность к старту

### Prerequisites
- [x] Main branch чистый и без конфликтов
- [x] Понятна структура `heys_day_v12.js`
- [x] Решение о закрытии PR #15 принято
- [x] Новая стратегия задокументирована

### Следующие шаги
1. Начать с Phase 1 (scoring)
2. Создать новую ветку: `copilot/refactor-phase1-scoring`
3. Выполнить чеклист Phase 1
4. Создать маленький PR
5. Мержить после тестирования

**Готово к старту**: ✅ YES
