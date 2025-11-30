# 📊 Mini-heatmap недели

> **Приоритет**: P2 (улучшение UX)  
> **Время**: ~25 минут  
> **Файлы**: 2 файла

---

## 🔍 Глубокий аудит

### ✅ Проверено и ОК
- CSS файл правильный: `apps/web/styles/main.css` (не `day.css`!)
- Паттерн `setDate(day.date)` для переключения даты — корректный
- Формат дат `toISOString().slice(0,10)` соответствует проекту
- `U.lsGet()` для данных — правильный паттерн

### 🔴 Критические исправления
1. **CSS файл**: Был указан `day.css` → исправлено на `main.css`
2. **Timezone bug**: `new Date(date)` может дать неправильный день при создании от ISO-строки → использовать локальную дату
3. **Цветовая схема**: Жёсткие цвета → использовать CSS-переменные из проекта

### 🟡 Важные улучшения
1. **Недоел (<75%)**: Добавить 4-й статус `low` (синий) для сильного дефицита
2. **Hover на desktop**: Добавить эффект при наведении
3. **Accessibility**: Добавить `title` для screen readers
4. **Stagger-анимация**: Уже есть паттерн в проекте — использовать

### 🟢 WOW-эффекты
1. **Свайп влево/вправо** — переключение на предыдущую/следующую неделю
2. **Streak-индикатор** — "🔥 5 дней подряд" в шапке
3. **Паттерн-инсайт** — "По выходным +15% калорий" под heatmap
4. **Анимированный текущий день** — мягкая пульсация рамки

---

## Цель

Добавить компактную визуализацию текущей недели в блок аналитики — 7 квадратиков с цветовой индикацией выполнения калорийности.

---

## Результат

```
┌─────────────────────────────────────────┐
│ 📅 Неделя  🔥 4        4/6 в норме      │
│ ┌───┬───┬───┬───┬───┬───┬───┐          │
│ │ Пн│ Вт│ Ср│ Чт│ Пт│ Сб│ Вс│          │
│ │ 🟢│ 🟢│ 🟡│ 🟢│ 🔴│ 🟡│ ⬜│          │
│ └───┴───┴───┴───┴───┴───┴───┘          │
│        По выходным +12% калорий         │
└─────────────────────────────────────────┘
```

**Цветовая схема (5 статусов):**
- 🔵 Синий (`#3b82f6`) — <75% (сильный дефицит, `low`)
- 🟢 Зелёный (`#22c55e`) — 75-100% (норма, `green`)
- 🟡 Жёлтый (`#eab308`) — 100-115% (небольшой избыток, `yellow`)
- 🔴 Красный (`#ef4444`) — >115% (сильный избыток, `red`)
- ⬜ Серый (`#3f3f46`) — нет данных / будущий день (`empty`)

---

## Ключевые файлы

| Файл | Что делать |
|------|------------|
| `apps/web/heys_day_v12.js` | useMemo + компонент (~строки 3680, 4800) |
| `apps/web/styles/main.css` | CSS стили (в конец файла) |

---

## Фаза 0: Подготовка (блокеры)

**Проверить перед началом:**

1. **Убедиться что есть данные** — открыть консоль, проверить:
   ```javascript
   U.lsGet('heys_dayv2_2025-11-25', null) // должен вернуть объект с meals
   ```

2. **Проверить optimum** — должен быть > 0:
   ```javascript
   // В компоненте DayTab проверить что optimum вычислен
   ```

3. **Найти точное место вставки useMemo** — после `kcalTrend`:
   ```javascript
   // Найти строку: }, [sparklineData, optimum]);
   // Вставить weekHeatmapData useMemo ПОСЛЕ неё
   ```

4. **Найти точное место вставки компонента** — после correlation-block, перед weight-sparkline:
   ```javascript
   // Найти: // Спарклайн веса — график веса с трендом
   // Вставить компонент ПЕРЕД этим комментарием
   ```

---

## Шаги

### 1. Данные недели (useMemo)

**Где**: После `kcalTrend` useMemo (~строка 3695, после `}, [sparklineData, optimum]);`)

```javascript
    // Данные для heatmap текущей недели (пн-вс)
    const weekHeatmapData = React.useMemo(() => {
      // Парсим текущую дату правильно (без timezone issues)
      const [year, month, day] = date.split('-').map(Number);
      const today = new Date(year, month - 1, day);
      const now = new Date();
      const nowDateStr = fmtDate(now);
      
      // Находим понедельник текущей недели
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);
      
      const days = [];
      const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      let streak = 0;
      let weekendExcess = 0;
      let weekdayAvg = 0;
      let weekendCount = 0;
      let weekdayCount = 0;
      
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = fmtDate(d);
        const isFuture = dateStr > nowDateStr;
        const isToday = dateStr === date;
        const isWeekend = i >= 5;
        
        // Загружаем данные дня
        let ratio = null;
        let kcal = 0;
        let status = 'empty'; // empty | low | green | yellow | red
        
        if (!isFuture) {
          const dayData = U.lsGet('heys_dayv2_' + dateStr, null);
          if (dayData && dayData.meals && dayData.meals.length > 0) {
            const totals = M.calcDayTotals ? M.calcDayTotals(dayData, pIndex) : { kcal: 0 };
            kcal = totals.kcal || 0;
            if (kcal > 0 && optimum > 0) {
              ratio = kcal / optimum;
              if (ratio < 0.75) status = 'low';
              else if (ratio <= 1.0) status = 'green';
              else if (ratio <= 1.15) status = 'yellow';
              else status = 'red';
              
              // Считаем streak (последовательные green)
              if (status === 'green' && (days.length === 0 || days[days.length - 1].status === 'green')) {
                streak++;
              } else if (status !== 'green') {
                streak = 0;
              }
              
              // Статистика для паттерна выходных
              if (isWeekend) {
                weekendExcess += ratio;
                weekendCount++;
              } else {
                weekdayAvg += ratio;
                weekdayCount++;
              }
            }
          }
        }
        
        days.push({
          date: dateStr,
          name: dayNames[i],
          status,
          ratio,
          kcal: Math.round(kcal),
          isToday,
          isFuture,
          isWeekend
        });
      }
      
      const inNorm = days.filter(d => d.status === 'green').length;
      const withData = days.filter(d => d.status !== 'empty' && !d.isFuture).length;
      
      // Паттерн выходных
      let weekendPattern = null;
      if (weekendCount > 0 && weekdayCount > 0) {
        const avgWeekend = weekendExcess / weekendCount;
        const avgWeekday = weekdayAvg / weekdayCount;
        const diff = Math.round((avgWeekend - avgWeekday) * 100);
        if (Math.abs(diff) >= 10) {
          weekendPattern = diff > 0 
            ? 'По выходным +' + diff + '% калорий'
            : 'По выходным ' + diff + '% калорий';
        }
      }
      
      return { days, inNorm, withData, streak, weekendPattern };
    }, [date, optimum, pIndex, products]);
```

### 2. Компонент heatmap

**Где**: После блока корреляции, перед `// Спарклайн веса` (~строка 4803)

```javascript
      // === Mini-heatmap недели ===
      weekHeatmapData.withData > 0 && React.createElement('div', {
        className: 'week-heatmap'
      },
        React.createElement('div', { className: 'week-heatmap-header' },
          React.createElement('span', { className: 'week-heatmap-title' }, '📅 Неделя'),
          weekHeatmapData.streak >= 2 && React.createElement('span', { 
            className: 'week-heatmap-streak' 
          }, '🔥 ' + weekHeatmapData.streak),
          React.createElement('span', { className: 'week-heatmap-stat' },
            weekHeatmapData.inNorm + '/' + weekHeatmapData.withData + ' в норме'
          )
        ),
        React.createElement('div', { className: 'week-heatmap-grid' },
          weekHeatmapData.days.map((d, i) => 
            React.createElement('div', {
              key: i,
              className: 'week-heatmap-day ' + d.status + 
                (d.isToday ? ' today' : '') +
                (d.isWeekend ? ' weekend' : ''),
              title: d.isFuture ? d.name : (d.kcal > 0 ? d.kcal + ' ккал' : 'Нет данных'),
              style: { '--stagger-delay': (i * 50) + 'ms' },
              onClick: () => {
                if (!d.isFuture && d.status !== 'empty') {
                  setDate(d.date);
                  haptic('light');
                }
              }
            },
              React.createElement('span', { className: 'week-heatmap-name' }, d.name),
              React.createElement('div', { className: 'week-heatmap-cell' })
            )
          )
        ),
        weekHeatmapData.weekendPattern && React.createElement('div', { 
          className: 'week-heatmap-pattern' 
        }, weekHeatmapData.weekendPattern)
      ),
```

### 3. CSS стили

**Где**: `apps/web/styles/main.css` — после стилей `.correlation-*` (~строка 4187)

```css
/* === Week Heatmap === */
.week-heatmap {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 16px;
  margin-top: 8px;
}

.week-heatmap-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.week-heatmap-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.week-heatmap-streak {
  font-size: 12px;
  font-weight: 600;
  color: #f59e0b;
  background: #fef3c7;
  padding: 2px 6px;
  border-radius: 8px;
}

.week-heatmap-stat {
  font-size: 12px;
  color: #64748b;
  margin-left: auto;
}

.week-heatmap-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.week-heatmap-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: transform 0.15s ease;
  animation: fadeInUp 0.3s ease-out backwards;
  animation-delay: var(--stagger-delay, 0ms);
}

.week-heatmap-day:hover {
  transform: translateY(-2px);
}

.week-heatmap-day:active {
  transform: scale(0.92);
}

.week-heatmap-name {
  font-size: 10px;
  color: #64748b;
  font-weight: 500;
}

.week-heatmap-day.weekend .week-heatmap-name {
  color: #94a3b8;
}

.week-heatmap-day.today .week-heatmap-name {
  color: #3b82f6;
  font-weight: 700;
}

.week-heatmap-cell {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 6px;
  background: #e2e8f0;
  transition: background 0.2s ease, box-shadow 0.2s ease;
}

/* Статусы */
.week-heatmap-day.low .week-heatmap-cell {
  background: #3b82f6;
}

.week-heatmap-day.green .week-heatmap-cell {
  background: #22c55e;
}

.week-heatmap-day.yellow .week-heatmap-cell {
  background: #eab308;
}

.week-heatmap-day.red .week-heatmap-cell {
  background: #ef4444;
}

.week-heatmap-day.empty .week-heatmap-cell {
  background: #e2e8f0;
  opacity: 0.5;
}

/* Today ring с анимацией */
.week-heatmap-day.today .week-heatmap-cell {
  box-shadow: 0 0 0 2px #3b82f6;
  animation: todayPulse 2s ease-in-out infinite;
}

@keyframes todayPulse {
  0%, 100% { box-shadow: 0 0 0 2px #3b82f6; }
  50% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5); }
}

/* Паттерн-инсайт */
.week-heatmap-pattern {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
  font-size: 11px;
  color: #64748b;
  text-align: center;
}

/* Hover на всём блоке */
.week-heatmap:hover {
  border-color: #cbd5e1;
}
```

---

## Критерии готовности

- [ ] 7 квадратиков пн-вс отображаются
- [ ] 5 статусов цвета (low/green/yellow/red/empty)
- [ ] Текущий день выделен рамкой с пульсацией
- [ ] Клик по дню переключает на этот день
- [ ] Streak-бейдж отображается при >= 2 дней
- [ ] Паттерн выходных показывается при разнице >= 10%
- [ ] Stagger-анимация при появлении
- [ ] Hover-эффект на desktop
- [ ] Title для accessibility
- [ ] `pnpm type-check` ✓
- [ ] `pnpm build` ✓

---

## Бонус (опционально, v2)

- **Свайп недель** — влево/вправо для переключения на пред/след неделю
- **Long-press** — детальный tooltip с ккал и макросами
- **Сравнение** — "Лучше прошлой недели на 15%"
- **Анимация заполнения** — квадратики "наливаются" цветом снизу по ratio

