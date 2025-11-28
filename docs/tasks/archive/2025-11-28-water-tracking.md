# 💧 Быстрое добавление воды на вкладке статистики

> **Цель**: Добавить кнопку быстрого добавления воды на подвкладке статистики (по аналогии с FAB на дневнике).

---

## 📋 Ключевые файлы

| Файл | Что есть | Что добавить |
|------|----------|--------------|
| `apps/web/heys_day_v12.js` | FAB кнопка на diary (строка ~3314), statsBlock (строка ~2736) | FAB на stats, карточка воды в statsBlock |
| `apps/web/heys_models_v1.js` | `DayRecord` (строка 35) | `waterMl: number` |
| `apps/web/styles/main.css` | `.fab-add-meal` стили | `.fab-add-water`, `.water-quick-picker`, `.water-ring` |

---

## ✅ УЖЕ РЕАЛИЗОВАНО (переиспользуем):

- FAB кнопка "+" для добавления приёма пищи на подвкладке `diary` (строка ~3314)
- Подвкладки: `mobileSubTab === 'stats'` и `mobileSubTab === 'diary'` (строка ~180)
- Bottom-sheet модалки с swipe-to-dismiss (строка ~1030-1070)
- `haptic` локальная функция (строка ~17, НЕ HEYS.dayUtils.haptic!)
- `showConfetti` / `setShowConfetti` (строка ~740)
- `bottomSheetRef`, `handleSheetTouchStart/Move/End` (строка ~1030)
- Macro-rings (БЖУ кольца) в statsBlock (строка ~2846)
- `.time-picker-backdrop` и `.time-picker-modal` CSS стили
- Анимация `slideUp` (НЕ `slide-up`!) в CSS (строка ~6378)

---

## 🎯 Задачи

### Задача 1: Расширить модель дня

**Файл**: `apps/web/heys_models_v1.js`

**1. Добавить в `DayRecord` typedef** (строка ~51, перед закрывающей `*/`):
```javascript
 * @property {number} waterMl - Выпито воды в мл
```

**2. Добавить в `ensureDay` функцию** (строка ~86, после `dayComment:d.dayComment||''`):
```javascript
      dayComment:d.dayComment||'',
      waterMl: +d.waterMl || 0,
      meals:Array.isArray(d.meals)? ...  // ← существующая строка
```

---

### Задача 2: Состояние для модалки воды

**Файл**: `apps/web/heys_day_v12.js`

**Где добавить**: После `showDeficitPicker` state (строка ~874), рядом с другими picker states

```javascript
// === Water Picker Modal ===
const [showWaterPicker, setShowWaterPicker] = useState(false);
const [waterAddedAnim, setWaterAddedAnim] = useState(null); // для анимации "+200мл"
```

---

### Задача 3: Константы и функции добавления воды

**Где добавить**: После state declarations (после Задачи 2), перед другими функциями

```javascript
// === Water Tracking ===
// Быстрые пресеты воды
const waterPresets = [
  { ml: 100, label: '100 мл', icon: '💧' },
  { ml: 200, label: 'Стакан', icon: '🥛' },
  { ml: 330, label: 'Бутылка', icon: '🧴' },
  { ml: 500, label: '0.5л', icon: '🍶' }
];

// Цель воды (можно вынести в профиль позже)
const waterGoal = 2000; // 2л стандарт, потом: prof.waterGoalMl || (prof.weight * 30)

// Мотивационное сообщение по прогрессу
const waterMotivation = useMemo(() => {
  const pct = ((day.waterMl || 0) / waterGoal) * 100;
  if (pct >= 100) return { emoji: '🏆', text: 'Цель достигнута!' };
  if (pct >= 75) return { emoji: '🔥', text: 'Почти у цели!' };
  if (pct >= 50) return { emoji: '🎯', text: 'Половина пути!' };
  if (pct >= 25) return { emoji: '🌊', text: 'Хороший старт!' };
  return { emoji: '💧', text: 'Добавь воды' };
}, [day.waterMl, waterGoal]);

// Быстрое добавление воды с анимацией
function addWater(ml) {
  const newWater = (day.waterMl || 0) + ml;
  setDay({ ...day, waterMl: newWater });
  
  // Анимация feedback
  setWaterAddedAnim('+' + ml + ' мл');
  haptic('light'); // Используем локальную haptic (строка ~17)
  
  // 🎉 Celebration при достижении цели (переиспользуем confetti от калорий)
  if (newWater >= waterGoal && (day.waterMl || 0) < waterGoal && !showConfetti) {
    setShowConfetti(true);
    haptic('success'); // паттерн [10, 50, 20]
    setTimeout(() => setShowConfetti(false), 2000);
  }
  
  // Скрыть анимацию и закрыть модалку
  setTimeout(() => {
    setWaterAddedAnim(null);
    setShowWaterPicker(false);
  }, 600);
}

// Убрать воду (для исправления ошибок)
function removeWater(ml) {
  const newWater = Math.max(0, (day.waterMl || 0) - ml);
  setDay({ ...day, waterMl: newWater });
  haptic('light');
}

// Открыть/закрыть пикер воды
function openWaterPicker() {
  setShowWaterPicker(true);
}

function cancelWaterPicker() {
  setShowWaterPicker(false);
  setWaterAddedAnim(null);
}
```

---

### Задача 4: FAB кнопка для воды

**Где**: Сразу после FAB для еды (строка ~3318), ПЕРЕД toast

**Контекст кода:**
```javascript
      }, '+'),  // ← конец FAB еды
      
      // FAB - Water Button (только mobile + только на вкладке stats)
      isMobile && mobileSubTab === 'stats' && React.createElement('button', {
        className: 'fab-add-water',
        onClick: openWaterPicker,
        title: 'Добавить воду'
      }, '💧'),
      
      // Toast подсказка БЖУ  // ← существующий код
```

---

### Задача 5: Кольцо воды в macro-rings

**Где**: В `statsBlock`, внутри `macro-rings` div, после кольца углеводов (строка ~2893)

**Контекст кода:**
```javascript
            React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.carbs || 0) + 'г')
          ),  // ← конец кольца Углеводы
          
          // Вода (4-е кольцо) — ДОБАВИТЬ ЗДЕСЬ
          React.createElement('div', { className: 'macro-ring-item water' },
            ...
          )
        ),  // ← закрывающая скобка macro-rings
```

**Код кольца воды:**
```javascript
          // Вода (4-е кольцо)
          React.createElement('div', { className: 'macro-ring-item water' },
            React.createElement('div', { 
              className: 'macro-ring water',
              onClick: openWaterPicker  // кликабельное
            },
              React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.9 }),
                React.createElement('circle', { 
                  className: 'macro-ring-fill', 
                  cx: 18, cy: 18, r: 15.9,
                  style: { strokeDasharray: Math.min(100, ((day.waterMl || 0) / waterGoal) * 100) + ' 100' }
                })
              ),
              React.createElement('span', { className: 'macro-ring-value' }, 
                day.waterMl ? (day.waterMl >= 1000 ? (day.waterMl / 1000).toFixed(1) + 'л' : day.waterMl) : '0'
              )
            ),
            React.createElement('span', { className: 'macro-ring-label' }, 'Вода'),
            React.createElement('span', { className: 'macro-ring-target' }, '/ ' + (waterGoal / 1000) + 'л')
          )
```

---

### Задача 6: Модалка выбора воды

**Где**: После последней модалки `showDayScorePicker` (строка ~3715), перед закрывающими скобками `);` и `};`

**Контекст кода:**
```javascript
        document.body
      )
    );  // ← конец showDayScorePicker
    
    // Water Quick Picker Modal — ДОБАВИТЬ ЗДЕСЬ
    
  };  // ← конец return
})(window);
```

**ВАЖНО**: Переиспользуем существующий `bottomSheetRef` и handlers

```javascript
// Water Quick Picker Modal
showWaterPicker && ReactDOM.createPortal(
  React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelWaterPicker },
    React.createElement('div', { 
      ref: bottomSheetRef,
      className: 'time-picker-modal water-quick-picker', // наследуем анимацию slideUp
      onClick: e => e.stopPropagation()
    },
      // Ручка для свайпа (переиспользуем handlers)
      React.createElement('div', { 
        className: 'bottom-sheet-handle',
        onTouchStart: handleSheetTouchStart,
        onTouchMove: handleSheetTouchMove,
        onTouchEnd: () => handleSheetTouchEnd(cancelWaterPicker)
      }),
      
      // Анимация добавления
      waterAddedAnim && React.createElement('div', { className: 'water-added-anim' }, waterAddedAnim),
      
      // Заголовок с прогрессом и мотивацией
      React.createElement('div', { className: 'water-picker-header' },
        React.createElement('span', { className: 'water-picker-title' }, 
          waterMotivation.emoji + ' ' + waterMotivation.text
        ),
        React.createElement('span', { className: 'water-picker-progress' }, 
          (day.waterMl || 0) + ' / ' + waterGoal + ' мл'
        )
      ),
      
      // Прогресс-бар воды
      React.createElement('div', { className: 'water-progress-bar' },
        React.createElement('div', { 
          className: 'water-progress-fill',
          style: { width: Math.min(100, ((day.waterMl || 0) / waterGoal) * 100) + '%' }
        })
      ),
      
      // Кнопки пресетов
      React.createElement('div', { className: 'water-presets' },
        waterPresets.map(preset => 
          React.createElement('button', {
            key: preset.ml,
            className: 'water-preset-btn',
            onClick: () => addWater(preset.ml)
          },
            React.createElement('span', { className: 'water-preset-icon' }, preset.icon),
            React.createElement('span', { className: 'water-preset-label' }, preset.label),
            React.createElement('span', { className: 'water-preset-plus' }, '+')
          )
        )
      ),
      
      // Кнопки управления
      React.createElement('div', { className: 'water-actions' },
        // Кнопка "-100мл" для исправления
        (day.waterMl || 0) > 0 && React.createElement('button', {
          className: 'water-minus-btn',
          onClick: () => removeWater(100)
        }, '−100 мл'),
        // Кнопка сброса
        (day.waterMl || 0) > 0 && React.createElement('button', {
          className: 'water-reset-btn',
          onClick: () => { setDay({ ...day, waterMl: 0 }); setShowWaterPicker(false); }
        }, '🔄 Сбросить')
      )
    )
  ),
  document.body
),
```

---

### Задача 7: CSS стили

```css
/* === FAB для воды === */
.fab-add-water {
  position: fixed;
  bottom: calc(160px + env(safe-area-inset-bottom, 0px)); /* ВЫШЕ чем FAB еды, не перекрывает toast */
  right: 16px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
  color: white;
  font-size: 24px;
  border: none;
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.4);
  cursor: pointer;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.fab-add-water:active {
  transform: scale(0.95);
}

/* === Кольцо воды (в macro-rings) === */
.macro-ring.water .macro-ring-fill {
  stroke: #0ea5e9; /* голубой */
}

.macro-ring.water .macro-ring-bg {
  stroke: #bae6fd;
}

.macro-ring-item.water .macro-ring-value {
  color: #0369a1;
  font-size: 10px; /* чуть меньше для "1.5л" */
}

.macro-ring-item.water {
  cursor: pointer;
}

/* 
 * ВАЖНО: НЕ переопределяем глобальные .macro-rings и .macro-ring!
 * При 4 кольцах justify-content: space-around автоматически распределит.
 * Если будет тесно на маленьких экранах — добавить media query:
 * @media (max-width: 360px) { .macro-rings { gap: 2px; } }
 */

/* === Water Quick Picker === */
/* ВАЖНО: используем time-picker-modal как базовый класс для наследования анимаций */
.water-quick-picker {
  /* Дополнительные стили поверх time-picker-modal */
  padding: 8px 16px 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
}

/* Анимация добавления */
.water-added-anim {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 32px;
  font-weight: 700;
  color: #0ea5e9;
  animation: water-pop 0.6s ease forwards;
  z-index: 10;
}

@keyframes water-pop {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
  100% { opacity: 0; transform: translate(-50%, -80%) scale(1); }
}

.water-picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.water-picker-title {
  font-size: 18px;
  font-weight: 600;
}

.water-picker-progress {
  font-size: 14px;
  color: var(--text-secondary, #6b7280);
}

/* Прогресс-бар воды */
.water-progress-bar {
  height: 8px;
  background: var(--bg-secondary, #f3f4f6);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 16px;
}

.water-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8 0%, #0ea5e9 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* Пресеты */
.water-presets {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.water-preset-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--bg-secondary, #f3f4f6);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.water-preset-btn:active {
  transform: scale(0.98);
  background: #e0f2fe;
}

.water-preset-icon {
  font-size: 24px;
}

.water-preset-label {
  flex: 1;
  text-align: left;
  font-size: 15px;
  font-weight: 500;
}

.water-preset-plus {
  width: 24px;
  height: 24px;
  background: #0ea5e9;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
}

/* Кнопки действий */
.water-actions {
  display: flex;
  gap: 8px;
}

.water-minus-btn {
  flex: 1;
  padding: 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.water-reset-btn {
  flex: 1;
  padding: 12px;
  background: transparent;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  color: var(--text-secondary, #6b7280);
  font-size: 14px;
  cursor: pointer;
}

/* Dark theme */
[data-theme="dark"] .fab-add-water {
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
}

[data-theme="dark"] .water-quick-picker {
  background: #1f2937;
}

[data-theme="dark"] .water-preset-btn {
  background: #374151;
}

[data-theme="dark"] .water-preset-btn:active {
  background: #1e3a5f;
}

[data-theme="dark"] .water-minus-btn {
  background: #7f1d1d;
  border-color: #991b1b;
  color: #fca5a5;
}

[data-theme="dark"] .macro-ring.water .macro-ring-bg {
  stroke: #0c4a6e;
}
```

---

## 📊 Итоговый flow

1. Пользователь на подвкладке "Статистика" видит:
   - Кольцо воды в macro-rings (кликабельное)
   - FAB кнопку 💧 справа
2. Клик → открывается bottom-sheet с пресетами
3. Показывается текущий прогресс (X / 2000 мл)
4. Выбор пресета: 100 мл / Стакан / Бутылка / 0.5л
5. **Анимация "+200мл"** появляется и исчезает
6. Haptic feedback + автозакрытие модалки
7. Кольцо воды обновляется
8. Также есть кнопки "−100мл" и "🔄 Сбросить" для исправлений

---

## ⚠️ Возможные риски

1. **Цель 2000 мл hardcoded**: Потом добавить в профиль `waterGoalMl`
2. **Supabase sync**: `waterMl` должно сохраняться в cloud (уже работает через `setDay`)
3. **FAB конфликт решён**: FAB воды на 160px, FAB еды на 90px
4. **4 кольца**: На очень маленьких экранах (<360px) может быть тесно — проверить визуально
5. **Confetti overlap**: Если достигнуты калории И вода одновременно — один confetti (проверка `!showConfetti`)

---

## 🔧 Важные технические детали

1. **haptic** — использовать ЛОКАЛЬНУЮ переменную `haptic` (строка ~17), НЕ `HEYS.dayUtils.haptic`
2. **className модалки** — `time-picker-modal water-quick-picker` (двойной класс для наследования анимации `slideUp`)
3. **bottomSheetRef** — переиспользуем существующий ref (строка ~1030)
4. **showConfetti** — переиспользуем существующий state (строка ~740)

---

## 🚫 НЕ ДЕЛАТЬ (оверкилл):

- ❌ История приёмов воды с временем (можно позже)
- ❌ Напоминания/уведомления (уже есть в Smart Toast)
- ❌ Интеграция с HealthKit/Google Fit
- ❌ Анимация капель/волн (слишком сложно)

---

## ✅ Definition of Done

- [ ] `waterMl` добавлен в typedef и `ensureDay` (модель дня)
- [ ] FAB кнопка 💧 на подвкладке stats (позиция 160px)
- [ ] Кольцо воды в macro-rings (4-е кольцо, синее)
- [ ] Мотивационные сообщения по прогрессу (25%/50%/75%/100%)
- [ ] Модалка с пресетами открывается (swipe-to-dismiss работает)
- [ ] Пресеты работают: +100/+200/+330/+500 мл, −100мл
- [ ] Анимация "+Nмл" при добавлении
- [ ] Confetti-анимация при достижении цели (2000мл)
- [ ] Haptic feedback при добавлении
- [ ] Dark theme работает корректно
- [ ] Переиспользован `bottomSheetRef` (НЕ создан новый)
- [ ] Данные сохраняются при переключении дат
- [ ] `pnpm type-check && pnpm build` проходят

---

**Время**: ~30-35 минут  
**Сложность**: Низкая-Средняя (простая UI фича + кольцо)
