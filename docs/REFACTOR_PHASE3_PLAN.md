# Phase 3: Extraction графиков — Детальный план

**Дата**: 2025-12-09  
**Статус**: 🟡 Planned - ready to execute  
**Риск**: 🟡 Средний  
**Время**: ~2-3 часа  
**Сокращение**: ~2,184 строк

---

## 📋 Обзор

Phase 3 извлекает три больших графика (sparklines) из heys_day_v12.js в отдельные модули.

### Целевые компоненты

| Компонент | Строки | Сложность | Приоритет |
|-----------|--------|-----------|-----------|
| KcalSparkline | ~1,300 | 🔴 Высокая | 1 |
| WeightSparkline | ~684 | 🟡 Средняя | 2 |
| MoodSparkline | ~200 | 🟢 Низкая | 3 |

---

## 🎯 KcalSparkline - График калорий

### Местоположение в файле

**Примерная позиция**: строки 7400-8700 (~1,300 строк)

**Ключевые маркеры для поиска:**
- Начало: После Hero Metrics cards, перед WeightSparkline
- Конец: Перед весовым графиком или другой major секцией
- Содержит: SVG rendering, points array, zoom/pan logic, brush selection

### Зависимости

**State dependencies:**
```javascript
- chartPeriod // 7|14|30
- sparklineZoom // 1-3
- sparklinePan // offset for panning
- brushRange // { start, end }
- brushing // boolean
- sliderValue // for interactive slider
- sliderIndex // current point index
```

**Functions/Data:**
```javascript
- getMealAverages(day) // from utils
- HEYS.ratioZones // color zones
- HEYS.Cycle.getWaterRetentionInfo // для розовых зон
- points: Array<{ date, kcal, optimum, ratio, isPerfect, isToday, isWeekend, ... }>
```

**Computed data:**
```javascript
- points // массив точек за период
- streakData // линии streak
- weekendRanges // выходные для shading
- goalAchievementPct // процент дней в норме
- forecastPoints // прогноз будущих значений
```

### Props API

```javascript
{
  // Data
  points: Array<{
    date: string,
    kcal: number,
    optimum: number,
    ratio: number,
    mealCount: number,
    isPerfect: boolean,
    isToday: boolean,
    isWeekend: boolean,
    cycleDay: number | null,
    retentionRisk: boolean
  }>,
  
  // Period
  period: 7 | 14 | 30,
  
  // Interaction
  onPointClick: (point, x, y) => void,
  selectedDate: string,
  
  // Responsive
  isMobile: boolean,
  
  // Optional
  showZoom: boolean,
  showBrush: boolean,
  showSlider: boolean,
  showForecast: boolean
}
```

### Внутренний state

```javascript
const [zoom, setZoom] = useState(1);
const [pan, setPan] = useState(0);
const [brushRange, setBrushRange] = useState(null);
const [brushing, setBrushing] = useState(false);
const [sliderValue, setSliderValue] = useState(null);
const [sliderIndex, setSliderIndex] = useState(null);
```

### Features to preserve

1. **Zoom/Pan**:
   - Pinch-to-zoom (mobile)
   - Double-tap to reset
   - Pan with touch/mouse
   
2. **Brush Selection**:
   - Select range of days
   - Show stats for range
   - Clear brush
   
3. **Interactive Slider**:
   - Scrub through days
   - Show detailed popup
   
4. **Visual Elements**:
   - Weekend shading
   - Water retention zones (розовые)
   - Streak lines
   - Forecast confidence interval
   - Goal line
   
5. **Animations**:
   - Path morphing
   - Fade in/out
   - Highlight transitions

### Паттерн extraction

```javascript
// apps/web/heys_day_charts/KcalSparkline.js
;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Import dependencies
  const rz = HEYS.ratioZones;
  const Cycle = HEYS.Cycle;
  
  // Helper functions (bezier curves, path building, etc.)
  const bezierY = (t, p0, p1, p2, p3) => { ... };
  const buildSmooth Curve = (points) => { ... };
  
  const KcalSparkline = React.memo(function KcalSparkline(props) {
    const {
      points,
      period,
      onPointClick,
      selectedDate,
      isMobile,
      showZoom = true,
      showBrush = true,
      showSlider = true,
      showForecast = true
    } = props;
    
    // State
    const [zoom, setZoom] = React.useState(1);
    // ... rest of state
    
    // Refs
    const zoomRef = React.useRef({ initialDistance: 0, initialZoom: 1 });
    const brushStartRef = React.useRef(null);
    
    // Computed values
    const svgW = 800;
    const svgH = 200;
    // ... rest of computations
    
    // Event handlers
    const handlePointClick = React.useCallback((point, e) => { ... }, []);
    const handleTouchStart = React.useCallback((e) => { ... }, []);
    // ... rest of handlers
    
    // Render
    return React.createElement('div', { className: 'kcal-sparkline-container' },
      // SVG with all paths, circles, labels
      // Slider
      // Brush stats
      // Zoom indicator
    );
  });
  
  // Export
  HEYS.DayCharts = HEYS.DayCharts || {};
  HEYS.DayCharts.KcalSparkline = KcalSparkline;
  
})(typeof window !== 'undefined' ? window : global);
```

### Integration в heys_day_v12.js

**Импорт**:
```javascript
const KcalSparkline = (HEYS.DayCharts && HEYS.DayCharts.KcalSparkline) || (() => null);
```

**Usage**:
```javascript
// Подготовить points data
const kcalPoints = React.useMemo(() => {
  // Build points array from stored days
  const pts = [];
  for (let i = chartPeriod - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayData = U.lsGet('heys_dayv2_' + dateStr);
    
    // Extract metrics
    const kcal = dayData ? calculateDayKcal(dayData) : 0;
    const optimum = normAbs.kcal || 2000;
    const ratio = kcal / optimum;
    // ... more fields
    
    pts.push({ date: dateStr, kcal, optimum, ratio, ... });
  }
  return pts;
}, [chartPeriod, today, normAbs]);

// Render
React.createElement(KcalSparkline, {
  points: kcalPoints,
  period: chartPeriod,
  onPointClick: (point, x, y) => {
    setSparklinePopup({ type: 'kcal', point, x, y });
  },
  selectedDate: today,
  isMobile: isMobile
})
```

---

## 🎯 WeightSparkline - График веса

### Местоположение в файле

**Примерная позиция**: строки 8700-9400 (~684 строк)

### Особенности

- Интеграция с циклом (розовые зоны для дней с задержкой воды)
- Фильтрация дней с задержкой воды из тренда
- Goal line для целевого веса
- Trend line (скользящее среднее)

### Props API

```javascript
{
  points: Array<{
    date: string,
    weight: number,
    cycleDay: number | null,
    retentionRisk: boolean,
    excludeFromTrend: boolean
  }>,
  period: 7 | 14 | 30,
  weightGoal: number,
  onPointClick: (point, x, y) => void,
  selectedDate: string,
  isMobile: boolean
}
```

### Зависимости

```javascript
- HEYS.Cycle.shouldExcludeFromWeightTrend
- HEYS.Cycle.getWaterRetentionInfo
```

---

## 🎯 MoodSparkline - Мини-график настроения

### Местоположение

**НЕ НАЙДЕН в текущем файле**. Возможно, это небольшой inline график настроения/самочувствия за день.

Если его нет, можно пропустить или создать новый simple sparkline для показа настроения по приёмам.

---

## 📝 Порядок выполнения

### Step 1: Locate exact line ranges
```bash
# Найти точные границы каждого графика
grep -n "// === " apps/web/heys_day_v12.js | grep -i "sparkline\|график"

# Проверить что перед и после
sed -n 'START,END p' apps/web/heys_day_v12.js | head -50
sed -n 'START,END p' apps/web/heys_day_v12.js | tail -50
```

### Step 2: Extract KcalSparkline
1. Скопировать код из основного файла
2. Обернуть в IIFE
3. Конвертировать state/refs в локальные
4. Экспортировать через HEYS.DayCharts
5. Syntax check

### Step 3: Create data preparation в main file
```javascript
// Вынести подготовку данных в отдельный useMemo
const kcalChartData = React.useMemo(() => {
  // Build points from localStorage
  return points;
}, [chartPeriod, ...deps]);
```

### Step 4: Replace inline rendering
```javascript
// Заменить большой блок SVG на:
React.createElement(KcalSparkline, { ... })
```

### Step 5: Test syntax
```bash
node -c apps/web/heys_day_charts/KcalSparkline.js
node -c apps/web/heys_day_v12.js
```

### Step 6: Add to index.html
```html
<script src="heys_day_charts/KcalSparkline.js"></script>
```

### Step 7: Repeat for WeightSparkline

### Step 8: Commit и validate

---

## ⚠️ Риски и митигация

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Потеря zoom state | 🟡 Средняя | Поднять state на уровень выше |
| Потеря brush selection | 🟡 Средняя | Передавать через props |
| Сломать анимации | 🟡 Средняя | Сохранить все CSS classes |
| Циклические зависимости | 🟢 Низкая | Только HEYS.Cycle и ratioZones |

---

## 🎯 Ожидаемый результат

### Метрики

| Метрика | Текущее | После Phase 3 | Изменение |
|---------|---------|---------------|-----------|
| **heys_day_v12.js** | 14,633 | ~12,449 | -2,184 (-14.9%) |
| **Файлов модулей** | 6 | 9 | +3 |
| **Строк извлечено** | ~1,664 | ~3,848 | +2,184 |

### Новые файлы

1. **apps/web/heys_day_charts/KcalSparkline.js** (~1,300 строк)
2. **apps/web/heys_day_charts/WeightSparkline.js** (~684 строк)
3. **apps/web/heys_day_charts/MoodSparkline.js** (~200 строк) - если найдётся

---

## 📋 Чеклист Phase 3

### KcalSparkline
- [ ] Найти точные строки в heys_day_v12.js
- [ ] Извлечь код в apps/web/heys_day_charts/KcalSparkline.js
- [ ] Обернуть в IIFE + HEYS namespace
- [ ] Конвертировать все зависимости в props
- [ ] Syntax check
- [ ] Добавить в index.html
- [ ] Импортировать в heys_day_v12.js
- [ ] Заменить inline код на компонент
- [ ] Validate syntax

### WeightSparkline
- [ ] Найти точные строки в heys_day_v12.js
- [ ] Извлечь код в apps/web/heys_day_charts/WeightSparkline.js
- [ ] Обернуть в IIFE + HEYS namespace
- [ ] Конвертировать все зависимости в props
- [ ] Syntax check
- [ ] Добавить в index.html
- [ ] Импортировать в heys_day_v12.js
- [ ] Заменить inline код на компонент
- [ ] Validate syntax

### MoodSparkline (optional)
- [ ] Найти в файле (если есть)
- [ ] Если нет - skip или создать простой

### Final
- [ ] `pnpm type-check`
- [ ] `node -c` для всех файлов
- [ ] Update docs
- [ ] Commit

---

## 🔗 Связанные документы

- **REFACTOR_FINAL_SUMMARY.md** - Overall status
- **REFACTOR_PHASE1_SUMMARY.md** - Phase 1 details
- **REFACTOR_PHASE2_PLAN.md** - Phase 2 details
- **tasks/2025-12-09-refactor-heys-day-v12.md** - Original prompt

---

## 💡 Tips

1. **Начните с Weight**, он проще чем Kcal
2. **Сохраните все helper functions** (bezierY, buildPath, etc.)
3. **Не трогайте CSS** - используйте существующие классы
4. **Тестируйте после каждого шага** - не накапливайте изменения
5. **Используйте Python script** для точной замены кода (как в Phase 2)

---

## Changelog

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0.0 | 2025-12-09 | Initial plan created, ready for execution |
