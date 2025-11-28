# 🏋️ Модалка добавления тренировки с выбором времени и типа

> **Цель**: При добавлении тренировки открывать модалку (как для приёма пищи) с wheel picker для времени и выбором типа тренировки.

---

## 📋 Ключевые файлы

| Файл | Что есть | Что добавить |
|------|----------|--------------|
| `apps/web/heys_day_v12.js` | TimePicker модалка для meals (строки 1121-1250), trainingsBlock (строка 1537+) | Переиспользовать для тренировок |
| `apps/web/heys_models_v1.js` | `ensureDay` с trainings (строка 80-85) | Сохранять `time`, `type` в модели |
| `apps/web/styles/main.css` | `.time-picker-modal`, `.compact-train-*` стили | Стили для типов тренировок |

---

## ✅ УЖЕ РЕАЛИЗОВАНО (переиспользуем):

- Тренировки хранятся как `trainings: [{z:[0,0,0,0]}]` — 4 зоны HR (минуты)
- TimePicker модалка с wheel для часов/минут (для meals)
- `WheelColumn` компонент (`HEYS.WheelColumn`)
- `hoursValues`, `minutesValues` уже определены (строка 1085-1111)
- `hourToWheelIndex`, `wheelIndexToHour` функции (строка 1090-1094)
- Bottom sheet handlers: `handleSheetTouchStart/Move/End` (строка 1030-1070)
- Расчёт калорий по зонам пульса (`trainK` функция) — **не меняется**
- UI для ввода минут по зонам (ZonePicker)

**⚠️ ВАЖНО**: Тип тренировки — **декоративный** (для визуализации). Расчёт калорий по-прежнему основан на HR-зонах.

---

## 🎯 Задачи

### Задача 1: Расширить модель тренировки

**Файл**: `apps/web/heys_models_v1.js` (строка ~91)

**Текущий формат** (строка 91):
```javascript
base.trainings=base.trainings.map(t=>(t&&Array.isArray(t.z))?{z:[+t.z[0]||0,+t.z[1]||0,+t.z[2]||0,+t.z[3]||0]}:{z:[0,0,0,0]});
```

**Новый формат** — **СОХРАНЯЕМ** все поля:
```javascript
base.trainings = base.trainings.map(t => ({
  z: (t && Array.isArray(t.z)) ? [+t.z[0]||0, +t.z[1]||0, +t.z[2]||0, +t.z[3]||0] : [0,0,0,0],
  time: (t && t.time) || '',
  type: (t && t.type) || ''
}));
```

**⚠️ КРИТИЧНО**: Старые тренировки без `time`/`type` получат пустые значения — это ОК.

---

### Задача 1.1: Исправить `updateTraining` (🔴 КРИТИЧНО)

**Файл**: `apps/web/heys_day_v12.js` (строка ~373-376)

**Текущий код** — теряет `time`/`type`:
```javascript
function updateTraining(i,zi,mins){
  const arr=(day.trainings||[{z:[0,0,0,0]},{z:[0,0,0,0]}]).map((t,idx)=> idx===i? {z:t.z.map((v,j)=> j===zi?(+mins||0):v)}:t);
  const newDay = {...day, trainings:arr};
  setDay(newDay);
}
```

**Исправленный код** — сохраняем все поля:
```javascript
function updateTraining(i, zi, mins) {
  const arr = (day.trainings || [{z:[0,0,0,0]}, {z:[0,0,0,0]}]).map((t, idx) => {
    if (idx !== i) return t;
    return {
      ...t,  // сохраняем time, type и другие поля
      z: t.z.map((v, j) => j === zi ? (+mins || 0) : v)
    };
  });
  setDay({ ...day, trainings: arr });
}
```

---

### Задача 1.2: Исправить `removeTraining`

**Файл**: `apps/web/heys_day_v12.js` (строка ~1529-1533)

**Текущий код**:
```javascript
const removeTraining = (ti) => {
  const newTrainings = [...(day.trainings || [{z:[0,0,0,0]},{z:[0,0,0,0]},{z:[0,0,0,0]}])];
  newTrainings[ti] = {z:[0,0,0,0]}; // очищаем данные
  setDay({...day, trainings: newTrainings});
  setVisibleTrainings(Math.max(0, visibleTrainings - 1));
};
```

**Исправленный код** — очищаем ВСЕ поля:
```javascript
const removeTraining = (ti) => {
  const newTrainings = [...(day.trainings || [{z:[0,0,0,0], time:'', type:''}, {z:[0,0,0,0], time:'', type:''}, {z:[0,0,0,0], time:'', type:''}])];
  newTrainings[ti] = {z:[0,0,0,0], time:'', type:''}; // очищаем ВСЕ данные
  setDay({...day, trainings: newTrainings});
  setVisibleTrainings(Math.max(0, visibleTrainings - 1));
};
```

---

### Задача 2: Состояния для модалки тренировки

**Файл**: `apps/web/heys_day_v12.js`

**Добавить рядом с `showTimePicker` (строка ~676)**:
```javascript
// === Training Picker Modal ===
const [showTrainingPicker, setShowTrainingPicker] = useState(false);
const [editingTrainingIndex, setEditingTrainingIndex] = useState(null);
const [pendingTrainingTime, setPendingTrainingTime] = useState({hours: 10, minutes: 0});
const [pendingTrainingType, setPendingTrainingType] = useState('cardio');
```

**Типы тренировок** (добавить рядом с другими константами, ~строка 1085):
```javascript
const trainingTypes = [
  { id: 'cardio', icon: '🏃', label: 'Кардио' },
  { id: 'strength', icon: '🏋️', label: 'Силовая' },
  { id: 'hobby', icon: '⚽', label: 'Активное хобби' }
];
```

**ПЕРЕИСПОЛЬЗУЕМ** (не дублируем):
- `hoursValues`, `minutesValues` — уже есть
- `hourToWheelIndex`, `wheelIndexToHour` — уже есть
- `WheelColumn` — уже есть (`HEYS.WheelColumn`)

---

### Задача 3: Функции открытия/закрытия модалки

**Файл**: `apps/web/heys_day_v12.js` (добавить после `cancelZonePicker`, ~строка 985)

```javascript
// === Training Picker functions ===
function openTrainingPicker(trainingIndex) {
  const now = new Date();
  const T = TR[trainingIndex] || { z: [0,0,0,0], time: '', type: '' };
  
  // Если уже есть время — парсим, иначе текущее
  if (T.time) {
    const [h, m] = T.time.split(':').map(Number);
    setPendingTrainingTime({ hours: hourToWheelIndex(h || 10), minutes: m || 0 });
  } else {
    setPendingTrainingTime({ hours: hourToWheelIndex(now.getHours()), minutes: now.getMinutes() });
  }
  
  setPendingTrainingType(T.type || 'cardio');
  setEditingTrainingIndex(trainingIndex);
  setShowTrainingPicker(true);
}

function confirmTrainingPicker() {
  const realHours = wheelIndexToHour(pendingTrainingTime.hours);
  const timeStr = pad2(realHours) + ':' + pad2(pendingTrainingTime.minutes);
  
  // Обновляем тренировку с новыми полями
  // ⚠️ ВАЖНО: заполняем массив до нужного индекса если он короткий
  const existingTrainings = day.trainings || [];
  const newTrainings = [...existingTrainings];
  const idx = editingTrainingIndex;
  
  // Заполняем пустые слоты если нужно (для idx=2 при length=2)
  while (newTrainings.length <= idx) {
    newTrainings.push({ z: [0, 0, 0, 0], time: '', type: '' });
  }
  
  // Теперь безопасно обновляем
  newTrainings[idx] = {
    ...newTrainings[idx],
    time: timeStr,
    type: pendingTrainingType
  };
  
  setDay({ ...day, trainings: newTrainings });
  setShowTrainingPicker(false);
  setEditingTrainingIndex(null);
}

function cancelTrainingPicker() {
  setShowTrainingPicker(false);
  setEditingTrainingIndex(null);
}
```

**Примечание**: `hourToWheelIndex` и `wheelIndexToHour` уже определены в коде (строка 1090-1094).

---

### Задача 4: Рендер модалки тренировки

**Файл**: `apps/web/heys_day_v12.js`  
**Где**: После `showZonePicker` modal (или после других picker modals, ~строка 3620)

**⚠️ ВАЖНО**: Используем существующие CSS классы от `time-picker-modal`.

```javascript
// Training Picker Modal
showTrainingPicker && ReactDOM.createPortal(
  React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelTrainingPicker },
    React.createElement('div', { 
      className: 'time-picker-modal training-picker-modal', 
      onClick: e => e.stopPropagation()
    },
      // Ручка для свайпа
      React.createElement('div', { 
        className: 'bottom-sheet-handle',
        onTouchStart: handleSheetTouchStart,
        onTouchMove: handleSheetTouchMove,
        onTouchEnd: () => handleSheetTouchEnd(cancelTrainingPicker)
      }),
      
      // Заголовок (используем существующие классы)
      React.createElement('div', { className: 'time-picker-header' },
        React.createElement('button', { className: 'time-picker-cancel', onClick: cancelTrainingPicker }, 'Отмена'),
        React.createElement('span', { className: 'time-picker-title' }, '🏋️ Тренировка'),
        React.createElement('button', { className: 'time-picker-confirm', onClick: confirmTrainingPicker }, 'Готово')
      ),
      
      // Секция: Тип тренировки
      React.createElement('div', { className: 'training-type-section' },
        React.createElement('div', { className: 'training-type-label' }, 'Тип тренировки'),
        React.createElement('div', { className: 'training-type-buttons' },
          trainingTypes.map(t => 
            React.createElement('button', {
              key: t.id,
              className: 'training-type-btn' + (pendingTrainingType === t.id ? ' active' : ''),
              onClick: () => setPendingTrainingType(t.id)
            },
              React.createElement('span', { className: 'training-type-icon' }, t.icon),
              React.createElement('span', { className: 'training-type-text' }, t.label)
            )
          )
        )
      ),
      
      // Секция: Время начала (используем существующие классы)
      React.createElement('div', { className: 'training-time-section' },
        React.createElement('div', { className: 'training-time-label' }, 'Время начала'),
        React.createElement('div', { className: 'time-picker-wheels' },
          // Часы
          React.createElement(WheelColumn, {
            values: hoursValues,
            selected: pendingTrainingTime.hours,
            onChange: (i) => setPendingTrainingTime(prev => ({...prev, hours: i})),
            label: 'Часы'
          }),
          React.createElement('div', { className: 'time-picker-separator' }, ':'),
          // Минуты
          React.createElement(WheelColumn, {
            values: minutesValues,
            selected: pendingTrainingTime.minutes,
            onChange: (i) => setPendingTrainingTime(prev => ({...prev, minutes: i})),
            label: 'Минуты'
          })
        )
      )
    )
  ),
  document.body
)
```

**Примечание**: Убрано предупреждение о ночных часах — для тренировок это менее критично чем для еды.

---

### Задача 5: Триггер открытия модалки

**Файл**: `apps/web/heys_day_v12.js`  
**Где**: `trainingsBlock` (строка ~1537), элемент `compact-train-header`

**Текущий код** (строка ~1552):
```javascript
React.createElement('div', { className: 'compact-train-header' },
  React.createElement('span', { className: 'compact-train-icon' }, trainIcons[ti] || '💪'),
  React.createElement('span', null, 'Тренировка ' + (ti + 1)),
```

**Изменить на** (добавить onClick + показать время):
```javascript
React.createElement('div', { 
  className: 'compact-train-header',
  onClick: () => openTrainingPicker(ti)
},
  React.createElement('span', { className: 'compact-train-icon' }, 
    // Показываем иконку типа, если есть
    (() => {
      const typeInfo = trainingTypes.find(t => t.id === T.type);
      return typeInfo ? typeInfo.icon : (trainIcons[ti] || '💪');
    })()
  ),
  React.createElement('span', null, 
    // Показываем название типа, если есть
    (() => {
      const typeInfo = trainingTypes.find(t => t.id === T.type);
      return typeInfo ? typeInfo.label : 'Тренировка ' + (ti + 1);
    })()
  ),
  // Показываем время, если есть
  T.time && React.createElement('span', { className: 'compact-train-time' }, T.time),
```

**Примечание**: Переменная `T` уже определена в этом скоупе (строка ~1545).

---

### Задача 6: CSS стили

**Файл**: `apps/web/styles/main.css`  
**Где**: После `.zone-picker-modal` (строка ~4400)

```css
/* === Training Picker Modal === */

/* Секция типа тренировки */
.training-type-section {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.training-type-label {
  font-size: 13px;
  color: var(--muted, #6b7280);
  margin-bottom: 12px;
  text-align: center;
}

.training-type-buttons {
  display: flex;
  gap: 8px;
}

.training-type-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  border: 2px solid var(--border, #e5e7eb);
  border-radius: 12px;
  background: var(--card, #fff);
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 44px; /* Touch target */
}

.training-type-btn:focus-visible {
  outline: 2px solid var(--acc);
  outline-offset: 2px;
}

.training-type-btn.active {
  border-color: var(--acc, #3b82f6);
  background: #eff6ff;
}

.training-type-icon {
  font-size: 24px;
}

.training-type-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}

/* Секция времени */
.training-time-section {
  padding: 16px 20px 20px;
}

.training-time-label {
  font-size: 13px;
  color: var(--muted, #6b7280);
  margin-bottom: 12px;
  text-align: center;
}

/* Время в шапке тренировки */
.compact-train-time {
  font-size: 12px;
  color: var(--muted, #9ca3af);
  margin-left: auto;
  padding-left: 8px;
}

/* Курсор на шапке для индикации кликабельности */
.compact-train-header {
  cursor: pointer;
}

.compact-train-header:active {
  opacity: 0.7;
}

/* Dark theme */
[data-theme="dark"] .training-type-btn {
  border-color: #374151;
  background: #1f2937;
}

[data-theme="dark"] .training-type-btn.active {
  border-color: #3b82f6;
  background: #1e3a5f;
}

[data-theme="dark"] .training-type-section {
  border-bottom-color: #374151;
}
```

**Убрано из изначального промпта**:
- `.training-picker-modal` — не нужен отдельный класс, используем `.time-picker-modal`
- `.training-type-badge`, `.training-time` — интегрированы в `.compact-train-*`

---

## 📊 Итоговый flow

1. Пользователь кликает на **шапку тренировки** (`compact-train-header`)
2. Открывается bottom-sheet модалка
3. Выбор типа: 🏃 Кардио / 🏋️ Силовая / ⚽ Хобби (3 кнопки)
4. Wheel picker времени начала (переиспользуем `hoursValues`/`minutesValues`)
5. После "Готово" — тренировка обновляется с `time` и `type`
6. В UI шапки показывается иконка типа и время

---

## ⚠️ Проверено — НЕ ломается

| Компонент | Почему OK |
|-----------|-----------|
| `trainK()` | Читает только `.z` — новые поля игнорируются |
| `heys_reports_v12.js` | Использует `TR[i].z` — не обращается к `time`/`type` |
| Supabase sync | JSON-объект — новые поля сохранятся автоматически |
| Старые данные | `ensureDay` добавит `time: ''`, `type: ''` — graceful fallback |

## 🔴 Требует исправления (найдено при аудите)

| Место | Проблема | Решение |
|-------|----------|---------|
| `updateTraining` (строка 374) | Теряет `time`/`type` при обновлении зоны | Добавить `...t` spread |
| `removeTraining` (строка 1531) | Очищает только `z` | Очищать `time`/`type` тоже |
| Дефолты `{z:[0,0,0,0]}` (много мест) | Нет `time`/`type` | `ensureDay` добавит — ОК |

---

## ⚠️ Возможные edge cases

1. **Удаление тренировки**: `removeTraining` очищает `z` — нужно также очищать `time`/`type`
2. **3-я тренировка**: При добавлении через "+" — открывать модалку сразу

---

## 💡 Рекомендации для улучшения UX (опционально)

### 1. ✅ Haptic feedback при выборе типа
```javascript
// В onClick кнопки типа:
onClick: () => {
  haptic('light');
  setPendingTrainingType(t.id)
}
```
**Почему**: Уже используется для других действий (удаление, добавление). Даёт тактильный отклик.

### 2. ✅ Кнопка "+" открывает модалку сразу
Сейчас кнопка `+ Тренировка` просто увеличивает `visibleTrainings`.  
**Улучшение**: Открывать модалку для настройки новой тренировки сразу:
```javascript
onClick: () => {
  const newIndex = visibleTrainings;  // индекс новой тренировки (0-based)
  setVisibleTrainings(visibleTrainings + 1);
  // setTimeout нужен чтобы дождаться рендера новой карточки
  setTimeout(() => openTrainingPicker(newIndex), 50);
}
```
**Почему**: Логичный flow — добавил → настрой.

### 3. ✅ Анимация появления карточки тренировки
В CSS уже есть `@keyframes slideIn` (строка 547). Добавить:
```css
.compact-train {
  animation: slideIn 0.25s ease-out;
}
```
**Почему**: Визуально приятнее при добавлении.

### 4. ⚠️ НЕ добавлять (оверкилл):
- ❌ **Длительность тренировки** — вычисляется из суммы зон
- ❌ **Интенсивность** — уже есть через HR-зоны
- ❌ **Заметки к тренировке** — усложнит UI без явной пользы
- ❌ **Иконки для каждого типа** — 3 типа достаточно, больше — путаница
- ❌ **История тренировок** — есть в отчётах

### 5. 🔄 Будущие улучшения (не сейчас):
- **Quick presets**: "Бег 30 мин" → автозаполнение зон
- **Интеграция с часами**: Импорт из Garmin/Apple Watch
- **Статистика по типам**: "За месяц: 8 кардио, 4 силовых"

---

## ✅ Definition of Done

**Основное (must have):**
- [ ] `ensureDay` в `heys_models_v1.js` сохраняет `time`, `type`
- [ ] `updateTraining` (строка 374) сохраняет `time`/`type` при обновлении зон (**КРИТИЧНО**)
- [ ] `removeTraining` (строка 1531) очищает `time`/`type`
- [ ] Состояния `showTrainingPicker`, `pendingTrainingTime`, `pendingTrainingType` добавлены
- [ ] `openTrainingPicker`, `confirmTrainingPicker`, `cancelTrainingPicker` функции работают
- [ ] Модалка рендерится через `ReactDOM.createPortal`
- [ ] Клик на `compact-train-header` открывает модалку
- [ ] Выбор типа (кардио/силовая/хобби) работает
- [ ] Wheel picker времени работает
- [ ] В UI отображается иконка типа и время
- [ ] Dark theme работает
- [ ] `pnpm type-check && pnpm build` проходят

**Улучшения UX (nice to have):**
- [ ] Haptic feedback при выборе типа
- [ ] Кнопка "+" открывает модалку сразу
- [ ] Анимация появления карточки (`.compact-train { animation: slideIn }`)

---

**Время**: ~30-35 минут (основное) + ~10 минут (улучшения)  
**Сложность**: Средняя (переиспользуем 80% существующего кода)

---

## 📝 История аудита

### v1.4 (29.11.2025) — Финальная проверка совместимости

**🔴 Найдено критическое:**
1. **`bottomSheetRef` конфликт** — в Задаче 4 был `ref: bottomSheetRef`, но этот ref используется только для TimePicker meals. Другие модалки (zone-picker, quality-picker и т.д.) **НЕ используют ref** — и это правильный паттерн!
   - **Решение**: Убран `ref: bottomSheetRef` из Задачи 4

2. **`confirmTrainingPicker` баг с массивом** — если `idx=2` а массив короткий, получится "дыра" в массиве
   - **Решение**: Добавлен `while` loop для заполнения пустых слотов

**🟡 Найдено важное:**
3. **Кнопка "+" closure баг** — `visibleTrainings` в closure может быть stale
   - **Решение**: Захватываем `newIndex = visibleTrainings` до `setState`

**🟢 Уточнено:**
- Номер строки `compact-train-header`: 1553-1555 → ~1552
- Номер строки где определён `T`: 1546 → ~1545

**Проверено:**
- Все модалки кроме TimePicker meals НЕ используют `bottomSheetRef`
- Свайп работает через `handleSheetTouchStart/Move/End` без ref
- Анимация закрытия простая (через callback), без трансформации DOM
- `haptic` функция определена (строка 17)
- `WheelColumn` props: `values`, `selected`, `onChange`, `label` — корректно

### v1.3 (28.11.2025) — Финальная проверка потери данных

**🔴 Найдено критическое:**
- `updateTraining` (строка 374) — **ТЕРЯЕТ** `time`/`type` при обновлении зоны!
  ```javascript
  // ТЕКУЩИЙ КОД (СЛОМАН):
  idx===i ? {z:t.z.map((v,j)=> j===zi?(+mins||0):v)} : t  // Только z!
  
  // ИСПРАВЛЕНИЕ:
  idx===i ? {...t, z:t.z.map((v,j)=> j===zi?(+mins||0):v)} : t  // Spread!
  ```
- Добавлена **Задача 1.1** — исправление `updateTraining`
- Добавлена **Задача 1.2** — исправление `removeTraining`

**Поиск выполнен:**
- `grep_search` для `{z:[0,0,0,0]}` — 20+ мест создания тренировок
- Проверены строки 211, 236, 297, 373-376, 1370, 1393, 1529-1533
- Большинство мест — дефолты, нормализуются через `ensureDay` → ОК
- Но `updateTraining` создаёт **новый объект** — теряет поля!

**Обновлено:**
- Добавлена секция "🔴 Требует исправления" в промпт
- Definition of Done: добавлен пункт про `updateTraining`
- Порядок задач: 1 → 1.1 → 1.2 → 2 → ... (сначала исправляем существующее)

### v1.1 (28.11.2025) — Глубокий аудит

**🔴 Исправлено (критическое):**
- Задача 1: Уточнено расположение `ensureDay` (строка 85), добавлен точный формат изменений
- Задача 4: Исправлены классы CSS (`picker-header` → `time-picker-header`), убрано дублирование

**🟡 Исправлено (важное):**
- Задача 2: Добавлены номера строк для вставки состояний
- Задача 3: Указано точное место вставки функций (после `cancelZonePicker`)
- Задача 4: Исправлен prop `value` → `selected` для WheelColumn
- Задача 5: Уточнено точное место (`trainingsBlock`, `compact-train-header`)

**🟢 Улучшено:**
- Добавлена таблица "Проверено — НЕ ломается" с анализом зависимостей
- Добавлена секция "ПЕРЕИСПОЛЬЗУЕМ" — явно указано что НЕ дублировать
- Убрано предупреждение о ночных часах (оверкилл для тренировок)
- Добавлены focus states для accessibility
- Уменьшено время выполнения (35-40 → 30-35 мин)

**Прочитаны файлы:**
- `apps/web/heys_day_v12.js` (3720 строк)
- `apps/web/heys_models_v1.js` (152 строки)
- `apps/web/heys_reports_v12.js` (отчёты — проверка зависимостей)
- `apps/web/styles/main.css` (6818 строк)

### v1.2 (28.11.2025) — Расширенные рекомендации

**Добавлено:**
- Секция "Рекомендации для улучшения UX" с 3 конкретными улучшениями
- Haptic feedback при выборе типа (паттерн уже используется в проекте)
- Кнопка "+" открывает модалку сразу (улучшение flow)
- Анимация появления карточки (переиспользуем `slideIn`)
- Явный список "НЕ добавлять" (защита от оверкилла)
- Definition of Done разделён на "must have" и "nice to have"

**Проанализировано дополнительно:**
- `haptic()` функция и её использование (17 мест)
- `trainIcons` массив и логика иконок
- `add-training-btn` и текущее поведение
- Существующие анимации в CSS
