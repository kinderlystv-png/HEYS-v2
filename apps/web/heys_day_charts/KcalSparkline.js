/**
 * KcalSparkline - График калорий с зумом/паном, brush selection, forecast
 * 
 * @module heys_day_charts/KcalSparkline
 * @version 1.0.0
 * 
 * Компонент отвечает за:
 * - Отображение графика калорий за выбранный период  
 * - Zoom/pan функционал для детального просмотра
 * - Brush selection для выбора диапазона дат
 * - Слайдер для быстрой навигации
 * - Forecast (прогноз) на основе тренда
 * - Weekend shading и water retention zones
 * - Streak visualization (серии дней с данными)
 * - Интерактивные tooltips и popup с деталями
 * 
 * Props:
 * @param {Array} data - Массив точек данных [{kcal, target, date, dayNum, ...}]
 * @param {number} goal - Целевая норма калорий
 * @param {string} selectedDate - Текущая выбранная дата (для подсветки)
 * @param {Function} onPointClick - Callback при клике на точку (point, event)
 * @param {Function} haptic - Функция для тактильной обратной связи
 * @param {Function} openExclusivePopup - Открыть popup с деталями точки
 * @param {Object} day - Объект текущего дня
 * @param {Function} setDay - Setter для обновления day state
 * 
 * Экспортирует через HEYS.DayCharts.renderSparkline
 */

(function (global) {
  'use strict';

  const { React } = global;

  if (!React) {
    console.error('KcalSparkline: React is not available');
    return;
  }

  // Namespace для экспорта
  if (!global.HEYS) global.HEYS = {};
  if (!global.HEYS.DayCharts) global.HEYS.DayCharts = {};

  /**
   * Главная функция рендеринга sparkline графика
   */
    const renderSparkline = (data, goal) => {
      // Skeleton loader пока данные загружаются
      if (!data) {
        return React.createElement('div', { className: 'sparkline-skeleton' },
          React.createElement('div', { className: 'sparkline-skeleton-line' }),
          React.createElement('div', { className: 'sparkline-skeleton-dots' },
            Array.from({length: 7}).map((_, i) => 
              React.createElement('div', { key: i, className: 'sparkline-skeleton-dot' })
            )
          )
        );
      }
      
      if (data.length === 0) return null;
      
      // === Empty state: проверяем есть ли реальные данные (хотя бы 2 дня с kcal > 0) ===
      const daysWithData = data.filter(d => d.kcal > 0).length;
      if (daysWithData < 2) {
        const daysNeeded = 2 - daysWithData;
        return React.createElement('div', { className: 'sparkline-empty-state' },
          React.createElement('div', { className: 'sparkline-empty-icon' }, '📊'),
          React.createElement('div', { className: 'sparkline-empty-text' },
            daysWithData === 0 
              ? 'Начните вести дневник питания'
              : 'Добавьте еду ещё за ' + daysNeeded + ' день'
          ),
          React.createElement('div', { className: 'sparkline-empty-hint' },
            'График появится после 2+ дней с данными'
          ),
          React.createElement('div', { className: 'sparkline-empty-progress' },
            React.createElement('div', { 
              className: 'sparkline-empty-progress-bar',
              style: { width: (daysWithData / 2 * 100) + '%' }
            }),
            React.createElement('span', { className: 'sparkline-empty-progress-text' },
              daysWithData + ' / 2 дней'
            )
          ),
          React.createElement('button', { 
            className: 'sparkline-empty-btn',
            onClick: () => {
              // Открываем модалку добавления приёма
              if (window.HEYS && window.HEYS.Day && window.HEYS.Day.addMeal) {
                window.HEYS.Day.addMeal();
              }
              haptic('light');
            }
          }, '+ Добавить еду')
        );
      }
      
      // === Helpers для выходных и праздников ===
      const RU_HOLIDAYS = [
        '01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08',
        '02-23', '03-08', '05-01', '05-09', '06-12', '11-04'
      ];
      const isWeekend = (dateStr) => {
        if (!dateStr) return false;
        const day = new Date(dateStr).getDay();
        return day === 0 || day === 6;
      };
      const isHoliday = (dateStr) => dateStr ? RU_HOLIDAYS.includes(dateStr.slice(5)) : false;
      const addDays = (dateStr, days) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
      };
      
      // === Проверка: сегодня съедено < 50% нормы? ===
      // Если да, показываем сегодня как прогноз (пунктиром), а не как реальные данные
      const todayData = data.find(d => d.isToday);
      const todayRatio = todayData && todayData.target > 0 ? todayData.kcal / todayData.target : 0;
      const isTodayIncomplete = todayData && todayRatio < 0.5;
      
      // Обрабатываем данные:
      // 1. Помечаем пустые/неполные дни как "unknown" (будут показаны как "?")
      // 2. Интерполируем их kcal между соседними известными днями
      const processedData = data.map((d, idx) => {
        // Сегодня неполный — отдельная логика (показываем как прогноз)
        if (d.isToday && isTodayIncomplete) {
          return { ...d, isUnknown: false, excludeFromChart: true };
        }
        
        // Пустой день или <50% нормы = неизвестный
        const ratio = d.target > 0 ? d.kcal / d.target : 0;
        const isUnknown = d.kcal === 0 || (!d.isToday && ratio < 0.5);
        
        return { ...d, isUnknown, excludeFromChart: false };
      });
      
      // Интерполируем kcal для unknown дней
      const chartData = processedData.filter(d => !d.excludeFromChart).map((d, idx, arr) => {
        if (!d.isUnknown) return d;
        
        // Ищем ближайший известный день слева
        let leftKcal = null, leftIdx = idx - 1;
        while (leftIdx >= 0) {
          if (!arr[leftIdx].isUnknown) { leftKcal = arr[leftIdx].kcal; break; }
          leftIdx--;
        }
        
        // Ищем ближайший известный день справа
        let rightKcal = null, rightIdx = idx + 1;
        while (rightIdx < arr.length) {
          if (!arr[rightIdx].isUnknown) { rightKcal = arr[rightIdx].kcal; break; }
          rightIdx++;
        }
        
        // Интерполируем
        let interpolatedKcal;
        if (leftKcal !== null && rightKcal !== null) {
          // Линейная интерполяция между соседями
          const leftDist = idx - leftIdx;
          const rightDist = rightIdx - idx;
          const totalDist = leftDist + rightDist;
          interpolatedKcal = Math.round((leftKcal * rightDist + rightKcal * leftDist) / totalDist);
        } else if (leftKcal !== null) {
          interpolatedKcal = leftKcal; // Только слева — берём его
        } else if (rightKcal !== null) {
          interpolatedKcal = rightKcal; // Только справа — берём его
        } else {
          interpolatedKcal = d.target || goal; // Нет соседей — берём норму
        }
        
        return { ...d, kcal: interpolatedKcal, originalKcal: d.kcal };
      });
      
      // Прогноз на +1 день по тренду (завтра), или сегодня+завтра если сегодня неполный
      const forecastDays = 1;
      const hasEnoughData = chartData.length >= 3;
      let forecastPoints = [];
      const lastChartDate = chartData[chartData.length - 1]?.date || '';
      
      if (hasEnoughData && lastChartDate) {
        // Используем линейную регрессию по всем данным для более стабильного тренда
        // Это предотвращает "взлёты" из-за одного-двух дней переедания
        const n = chartData.length;
        const kcalValues = chartData.map(d => d.kcal);
        
        // Вычисляем линейную регрессию: y = a + b*x
        // b = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
          sumX += i;
          sumY += kcalValues[i];
          sumXY += i * kcalValues[i];
          sumX2 += i * i;
        }
        
        const denominator = n * sumX2 - sumX * sumX;
        // slope = изменение ккал за 1 день по тренду
        const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
        const intercept = (sumY - slope * sumX) / n;
        
        // Ограничиваем slope чтобы не было безумных прогнозов
        // Максимум ±150 ккал/день изменения тренда
        const clampedSlope = Math.max(-150, Math.min(150, slope));
        
        // Последнее значение и прогноз следующего
        const lastKcal = kcalValues[n - 1];
        const lastTarget = chartData[n - 1].target || goal;
        
        // Для прогноза: используем регрессию, но ближе к последнему значению
        // Смешиваем: 60% регрессия + 40% продолжение от последнего значения
        const regressionNext = intercept + clampedSlope * n;
        const simpleNext = lastKcal + clampedSlope;
        const blendedNext = regressionNext * 0.6 + simpleNext * 0.4;
        
        // Вычисляем тренд НОРМЫ за последние 7 дней (учитывает изменения веса, активности)
        const last7Days = chartData.slice(-7);
        let targetTrend = 0;
        if (last7Days.length >= 2) {
          const firstTarget = last7Days[0].target || goal;
          const lastTargetVal = last7Days[last7Days.length - 1].target || goal;
          targetTrend = (lastTargetVal - firstTarget) / (last7Days.length - 1);
        }
        
        // Если сегодня неполный — добавляем прогноз на сегодня и завтра
        const daysToForecast = isTodayIncomplete ? 2 : forecastDays;
        
        for (let i = 1; i <= daysToForecast; i++) {
          const forecastDate = addDays(lastChartDate, i);
          const forecastDayNum = forecastDate ? new Date(forecastDate).getDate() : '';
          const isTodayForecast = isTodayIncomplete && i === 1;
          // Прогноз нормы по тренду
          const forecastTarget = Math.round(lastTarget + targetTrend * i);
          // Прогноз ккал: blendedNext для первого дня, далее +clampedSlope
          const forecastKcal = i === 1 
            ? Math.round(blendedNext) 
            : Math.round(blendedNext + clampedSlope * (i - 1));
          forecastPoints.push({
            kcal: Math.max(0, forecastKcal),
            target: forecastTarget,
            isForecast: true,
            isTodayForecast, // маркер что это прогноз на сегодня
            date: forecastDate,
            dayNum: forecastDayNum,
            isWeekend: isWeekend(forecastDate) || isHoliday(forecastDate)
          });
        }
      }
      
      const totalPoints = chartData.length + forecastPoints.length;
      const width = 360;
      const height = 130; // увеличено для дельты под датами
      const paddingTop = 16; // для меток над точками
      const paddingBottom = 26; // место для дат + дельты
      const paddingX = 8; // минимальные отступы — точки почти у края
      const chartHeight = height - paddingTop - paddingBottom;
      
      // Адаптивная шкала Y: от минимума до максимума с отступами
      // Это делает разницу между точками более заметной
      const allKcalValues = [...chartData, ...forecastPoints].map(d => d.kcal).filter(v => v > 0);
      const allTargetValues = [...chartData, ...forecastPoints].map(d => d.target || goal);
      const allValues = [...allKcalValues, ...allTargetValues];
      
      const dataMin = Math.min(...allValues);
      const dataMax = Math.max(...allValues);
      const range = dataMax - dataMin;
      
      // Отступы: 15% снизу и сверху от диапазона данных
      const padding = Math.max(range * 0.15, 100); // минимум 100 ккал отступ
      const scaleMin = Math.max(0, dataMin - padding);
      const scaleMax = dataMax + padding;
      const scaleRange = scaleMax - scaleMin;
      
      // Основные точки данных (без неполного сегодня)
      const points = chartData.map((d, i) => {
        const x = paddingX + (i / (totalPoints - 1)) * (width - paddingX * 2);
        // Нормализуем к scaleMin-scaleMax
        const yNorm = scaleRange > 0 ? (d.kcal - scaleMin) / scaleRange : 0.5;
        const y = paddingTop + chartHeight - yNorm * chartHeight;
        const targetNorm = scaleRange > 0 ? ((d.target || goal) - scaleMin) / scaleRange : 0.5;
        const targetY = paddingTop + chartHeight - targetNorm * chartHeight;
        // Извлекаем день из даты (последние 2 символа)
        const dayNum = d.date ? d.date.slice(-2).replace(/^0/, '') : '';
        const ratio = (d.target || goal) > 0 ? d.kcal / (d.target || goal) : 0;
        // Хороший день: используем централизованный ratioZones
        const rz = HEYS.ratioZones;
        const isPerfect = d.isUnknown ? false : (rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.10));
        // Выходные/праздники
        const isWeekendDay = isWeekend(d.date) || isHoliday(d.date);
        // День недели (0=Вс, 1=Пн, ...)
        const dayOfWeek = d.date ? new Date(d.date).getDay() : 0;
        return { 
          x, y, kcal: d.kcal, target: d.target || goal, targetY, ratio,
          isToday: d.isToday, dayNum, date: d.date, isPerfect,
          isUnknown: d.isUnknown || false, // флаг неизвестного дня
          hasTraining: d.hasTraining, trainingTypes: d.trainingTypes || [],
          trainingMinutes: d.trainingMinutes || 0,
          isWeekend: isWeekendDay, sleepQuality: d.sleepQuality || 0,
          sleepHours: d.sleepHours || 0, dayScore: d.dayScore || 0,
          steps: d.steps || 0,
          prot: d.prot || 0, fat: d.fat || 0, carbs: d.carbs || 0,
          dayOfWeek
        };
      });
      
      // Точки прогноза (включая сегодня если неполный)
      const forecastPts = forecastPoints.map((d, i) => {
        const idx = chartData.length + i;
        const x = paddingX + (idx / (totalPoints - 1)) * (width - paddingX * 2);
        const yNorm = scaleRange > 0 ? (d.kcal - scaleMin) / scaleRange : 0.5;
        const y = paddingTop + chartHeight - yNorm * chartHeight;
        const targetNorm = scaleRange > 0 ? ((d.target || goal) - scaleMin) / scaleRange : 0.5;
        const targetY = paddingTop + chartHeight - targetNorm * chartHeight;
        return { 
          x, y, kcal: d.kcal, target: d.target, targetY, isForecast: true, 
          isTodayForecast: d.isTodayForecast || false,
          dayNum: d.dayNum || '', date: d.date, isWeekend: d.isWeekend 
        };
      });
      
      // Min/Max для меток
      const kcalValues = points.filter(p => p.kcal > 0).map(p => p.kcal);
      const minKcal = Math.min(...kcalValues);
      const maxKcalVal = Math.max(...kcalValues);
      const minPoint = points.find(p => p.kcal === minKcal);
      const maxPoint = points.find(p => p.kcal === maxKcalVal);
      
      // Плавная кривая через cubic bezier (catmull-rom → bezier)
      // С ограничением overshooting для монотонности
      const smoothPath = (pts, yKey = 'y') => {
        if (pts.length < 2) return '';
        if (pts.length === 2) return `M${pts[0].x},${pts[0][yKey]} L${pts[1].x},${pts[1][yKey]}`;
        
        let d = `M${pts[0].x},${pts[0][yKey]}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          
          // Catmull-Rom → Cubic Bezier control points
          const tension = 0.25; // Уменьшено для меньшего overshooting
          
          // Базовые контрольные точки
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1[yKey] + (p2[yKey] - p0[yKey]) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2[yKey] - (p3[yKey] - p1[yKey]) * tension;
          
          // === Monotonic constraint: ограничиваем overshooting ===
          // Контрольные точки не должны выходить за пределы Y между p1 и p2
          const minY = Math.min(p1[yKey], p2[yKey]);
          const maxY = Math.max(p1[yKey], p2[yKey]);
          const margin = (maxY - minY) * 0.15; // 15% допуск
          
          cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
          cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2[yKey]}`;
        }
        return d;
      };
      
      // Расчёт длины cubic bezier сегмента (приближение через разбиение на отрезки)
      const bezierLength = (p1, cp1, cp2, p2, steps = 10) => {
        let length = 0;
        let prevX = p1.x, prevY = p1.y;
        for (let t = 1; t <= steps; t++) {
          const s = t / steps;
          const u = 1 - s;
          // Cubic Bezier formula: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
          const x = u*u*u*p1.x + 3*u*u*s*cp1.x + 3*u*s*s*cp2.x + s*s*s*p2.x;
          const y = u*u*u*p1.y + 3*u*u*s*cp1.y + 3*u*s*s*cp2.y + s*s*s*p2.y;
          length += Math.sqrt((x - prevX) ** 2 + (y - prevY) ** 2);
          prevX = x;
          prevY = y;
        }
        return length;
      };
      
      // Кумулятивные длины пути до каждой точки (для синхронизации анимации)
      const calcCumulativeLengths = (pts, yKey = 'y') => {
        const lengths = [0]; // первая точка = 0
        if (pts.length < 2) return lengths;
        
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          
          const tension = 0.25;
          const cp1 = { x: p1.x + (p2.x - p0.x) * tension, y: p1[yKey] + (p2[yKey] - p0[yKey]) * tension };
          const cp2 = { x: p2.x - (p3.x - p1.x) * tension, y: p2[yKey] - (p3[yKey] - p1[yKey]) * tension };
          
          const segmentLen = bezierLength(
            { x: p1.x, y: p1[yKey] }, cp1, cp2, { x: p2.x, y: p2[yKey] }
          );
          lengths.push(lengths[lengths.length - 1] + segmentLen);
        }
        return lengths;
      };
      
      const cumulativeLengths = calcCumulativeLengths(points, 'y');
      const totalPathLength = cumulativeLengths[cumulativeLengths.length - 1] || 1;
      
      // === Известные точки для построения path ===
      const knownPoints = points.filter(p => !p.isUnknown);
      
      // Path строится ТОЛЬКО по известным точкам — плавная кривая
      const pathD = smoothPath(knownPoints, 'y');
      
      // === Вычисляем Y для unknown точек на кривой Безье ===
      // Cubic Bezier formula: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
      const cubicBezier = (t, p0, cp1, cp2, p3) => {
        const u = 1 - t;
        return u*u*u*p0 + 3*u*u*t*cp1 + 3*u*t*t*cp2 + t*t*t*p3;
      };
      
      points.forEach((p) => {
        if (!p.isUnknown) return;
        
        // Находим между какими известными точками (по X) лежит unknown
        let leftIdx = -1, rightIdx = -1;
        for (let i = 0; i < knownPoints.length; i++) {
          if (knownPoints[i].x <= p.x) leftIdx = i;
          if (knownPoints[i].x > p.x && rightIdx < 0) { rightIdx = i; break; }
        }
        
        if (leftIdx < 0 || rightIdx < 0) {
          // Крайний случай — используем ближайшую точку
          if (leftIdx >= 0) p.y = knownPoints[leftIdx].y;
          else if (rightIdx >= 0) p.y = knownPoints[rightIdx].y;
          return;
        }
        
        // Catmull-Rom → Bezier control points (те же что в smoothPath)
        const tension = 0.25;
        const i = leftIdx;
        const p0 = knownPoints[Math.max(0, i - 1)];
        const p1 = knownPoints[i];
        const p2 = knownPoints[i + 1];
        const p3 = knownPoints[Math.min(knownPoints.length - 1, i + 2)];
        
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;
        
        // Находим t по X (приближённо, для Bezier X тоже кривая)
        // Используем итеративный поиск
        const targetX = p.x;
        let t = (targetX - p1.x) / (p2.x - p1.x); // начальное приближение
        
        // Несколько итераций Newton-Raphson для уточнения t
        for (let iter = 0; iter < 5; iter++) {
          const currentX = cubicBezier(t, p1.x, cp1x, cp2x, p2.x);
          const error = currentX - targetX;
          if (Math.abs(error) < 0.1) break;
          
          // Производная Bezier по t
          const u = 1 - t;
          const dx = 3*u*u*(cp1x - p1.x) + 6*u*t*(cp2x - cp1x) + 3*t*t*(p2.x - cp2x);
          if (Math.abs(dx) > 0.001) t -= error / dx;
          t = Math.max(0, Math.min(1, t));
        }
        
        // Вычисляем Y по найденному t
        p.y = cubicBezier(t, p1.y, cp1y, cp2y, p2.y);
      });
      
      // Линия цели — плавная пунктирная
      const goalPathD = smoothPath(points, 'targetY');
      
      // Прогнозная линия (если есть данные)
      let forecastPathD = '';
      let forecastColor = '#94a3b8'; // серый по умолчанию
      let forecastPathLength = 0; // длина для анимации
      if (forecastPts.length > 0 && points.length >= 2) {
        // Берём 2 последние точки для плавного продолжения Bezier
        const prev2Point = points[points.length - 2];
        const lastPoint = points[points.length - 1];
        const forecastPoint = forecastPts[forecastPts.length - 1];
        
        // Полный массив для расчёта касательных
        const allForBezier = [prev2Point, lastPoint, ...forecastPts];
        
        // Строим путь только для прогнозной части (от lastPoint)
        // Используем smoothPath но начинаем с индекса 1
        let d = `M${lastPoint.x},${lastPoint.y}`;
        for (let i = 1; i < allForBezier.length - 1; i++) {
          const p0 = allForBezier[i - 1];
          const p1 = allForBezier[i];
          const p2 = allForBezier[i + 1];
          const p3 = allForBezier[Math.min(allForBezier.length - 1, i + 2)];
          const tension = 0.25;
          const cp1x = p1.x + (p2.x - p0.x) * tension;
          const cp1y = p1.y + (p2.y - p0.y) * tension;
          const cp2x = p2.x - (p3.x - p1.x) * tension;
          const cp2y = p2.y - (p3.y - p1.y) * tension;
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
          
          // Длина сегмента
          forecastPathLength += bezierLength(
            { x: p1.x, y: p1.y },
            { x: cp1x, y: cp1y },
            { x: cp2x, y: cp2y },
            { x: p2.x, y: p2.y }
          );
        }
        forecastPathD = d;
        
        // Цвет по направлению тренда относительно цели
        const lastRatio = lastPoint.target > 0 ? lastPoint.kcal / lastPoint.target : 1;
        const forecastRatio = forecastPoint.target > 0 ? forecastPoint.kcal / forecastPoint.target : 1;
        // Зелёный если идём к дефициту, красный если к избытку
        if (forecastRatio < lastRatio && forecastRatio <= 1.1) {
          forecastColor = '#22c55e'; // зелёный — улучшение
        } else if (forecastRatio > lastRatio && forecastRatio > 1.0) {
          forecastColor = '#ef4444'; // красный — ухудшение
        } else {
          forecastColor = '#8b5cf6'; // фиолетовый — стабильно
        }
      }
      
      // Прогнозная линия НОРМЫ (goal) — продолжение тренда за 7 дней
      let forecastGoalPathD = '';
      if (forecastPts.length > 0 && points.length >= 2) {
        // Берём 2 последние точки для плавного продолжения Bezier
        const prev2Point = points[points.length - 2];
        const lastPoint = points[points.length - 1];
        
        // Полный массив для расчёта касательных (используем targetY)
        const allForBezier = [prev2Point, lastPoint, ...forecastPts];
        
        // Строим путь только для прогнозной части (от lastPoint)
        let d = `M${lastPoint.x},${lastPoint.targetY}`;
        for (let i = 1; i < allForBezier.length - 1; i++) {
          const p0 = allForBezier[i - 1];
          const p1 = allForBezier[i];
          const p2 = allForBezier[i + 1];
          const p3 = allForBezier[Math.min(allForBezier.length - 1, i + 2)];
          const tension = 0.25;
          const cp1x = p1.x + (p2.x - p0.x) * tension;
          const cp1y = p1.targetY + (p2.targetY - p0.targetY) * tension;
          const cp2x = p2.x - (p3.x - p1.x) * tension;
          const cp2y = p2.targetY - (p3.targetY - p1.targetY) * tension;
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.targetY}`;
        }
        forecastGoalPathD = d;
      }
      
      // === Streak detection: золотая линия между последовательными 🔥 днями ===
      // Находит индексы начала и конца последовательных идеальных дней
      const findStreakRanges = (pts) => {
        const ranges = [];
        let startIdx = -1;
        pts.forEach((p, i) => {
          if (p.isPerfect && p.kcal > 0) {
            if (startIdx === -1) startIdx = i;
          } else {
            if (startIdx !== -1 && i - startIdx >= 2) {
              ranges.push({ start: startIdx, end: i - 1 });
            }
            startIdx = -1;
          }
        });
        // Последний streak
        if (startIdx !== -1 && pts.length - startIdx >= 2) {
          ranges.push({ start: startIdx, end: pts.length - 1 });
        }
        return ranges;
      };
      
      // Извлекает сегмент пути между индексами, используя ТЕ ЖЕ контрольные точки
      // С monotonic constraint для предотвращения overshooting
      const extractPathSegment = (allPts, startIdx, endIdx, yKey = 'y') => {
        if (startIdx >= endIdx) return '';
        
        let d = `M${allPts[startIdx].x},${allPts[startIdx][yKey]}`;
        for (let i = startIdx; i < endIdx; i++) {
          // Используем ВСЕ точки для расчёта контрольных точек (как в основном пути)
          const p0 = allPts[Math.max(0, i - 1)];
          const p1 = allPts[i];
          const p2 = allPts[i + 1];
          const p3 = allPts[Math.min(allPts.length - 1, i + 2)];
          
          const tension = 0.25;
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1[yKey] + (p2[yKey] - p0[yKey]) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2[yKey] - (p3[yKey] - p1[yKey]) * tension;
          
          // Monotonic constraint
          const minY = Math.min(p1[yKey], p2[yKey]);
          const maxY = Math.max(p1[yKey], p2[yKey]);
          const margin = (maxY - minY) * 0.15;
          cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
          cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2[yKey]}`;
        }
        return d;
      };
      
      const streakRanges = findStreakRanges(points);
      
      // Вычисляем длину каждого streak-сегмента и задержку анимации
      const lineDrawDuration = 3; // секунд — должно совпадать с анимацией основной линии
      const streakData = streakRanges.map(range => {
        const path = extractPathSegment(points, range.start, range.end, 'y');
        
        // Длина streak-сегмента
        let segmentLength = 0;
        for (let i = range.start; i < range.end; i++) {
          const p0 = points[Math.max(0, i - 1)];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[Math.min(points.length - 1, i + 2)];
          const tension = 0.25;
          const cp1 = { x: p1.x + (p2.x - p0.x) * tension, y: p1.y + (p2.y - p0.y) * tension };
          const cp2 = { x: p2.x - (p3.x - p1.x) * tension, y: p2.y - (p3.y - p1.y) * tension };
          segmentLength += bezierLength({ x: p1.x, y: p1.y }, cp1, cp2, { x: p2.x, y: p2.y });
        }
        
        // Задержка = когда основная линия достигает начала streak
        const startProgress = cumulativeLengths[range.start] / totalPathLength;
        const animDelay = startProgress * lineDrawDuration;
        
        // Длительность = пропорционально длине сегмента относительно общей длины
        const segmentDuration = (segmentLength / totalPathLength) * lineDrawDuration;
        
        return { path, segmentLength, animDelay, segmentDuration };
      });
      
      // Для совместимости оставляем streakPaths
      const streakPaths = streakData.map(d => d.path);
      
      // Определяем цвет точки по ratio — используем централизованный ratioZones
      const rz = HEYS.ratioZones;
      const getDotColor = (ratio) => {
        return rz ? rz.getGradientColor(ratio, 1) : '#22c55e';
      };
      
      // Полный плавный путь области между двумя кривыми
      // С monotonic constraint для предотвращения overshooting
      const buildFullAreaPath = (pts) => {
        if (pts.length < 2) return '';
        
        let d = `M${pts[0].x},${pts[0].y}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          
          const tension = 0.25;
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1.y + (p2.y - p0.y) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2.y - (p3.y - p1.y) * tension;
          
          // Monotonic constraint
          const minY = Math.min(p1.y, p2.y);
          const maxY = Math.max(p1.y, p2.y);
          const margin = (maxY - minY) * 0.15;
          cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
          cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
        }
        
        d += ` L${pts[pts.length - 1].x},${pts[pts.length - 1].targetY}`;
        
        for (let i = pts.length - 1; i > 0; i--) {
          const p0 = pts[Math.min(pts.length - 1, i + 1)];
          const p1 = pts[i];
          const p2 = pts[i - 1];
          const p3 = pts[Math.max(0, i - 2)];
          
          const tension = 0.25;
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1.targetY + (p2.targetY - p0.targetY) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2.targetY - (p3.targetY - p1.targetY) * tension;
          
          // Monotonic constraint for targetY
          const minTY = Math.min(p1.targetY, p2.targetY);
          const maxTY = Math.max(p1.targetY, p2.targetY);
          const marginT = (maxTY - minTY) * 0.15;
          cp1y = Math.max(minTY - marginT, Math.min(maxTY + marginT, cp1y));
          cp2y = Math.max(minTY - marginT, Math.min(maxTY + marginT, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.targetY}`;
        }
        
        d += ' Z';
        return d;
      };
      
      const fullAreaPath = buildFullAreaPath(points);
      
      // === 1. Goal Achievement % — процент дней в норме ===
      const successDays = points.filter(p => p.kcal > 0 && p.isPerfect).length;
      const totalDaysWithData = points.filter(p => p.kcal > 0).length;
      const goalAchievementPct = totalDaysWithData > 0 
        ? Math.round((successDays / totalDaysWithData) * 100) 
        : 0;
      
      // === 2. Confidence interval для прогноза ===
      // Стандартное отклонение калорий за период
      const avgKcal = points.length > 0 
        ? points.reduce((s, p) => s + p.kcal, 0) / points.length 
        : 0;
      const variance = points.length > 1 
        ? points.reduce((s, p) => s + Math.pow(p.kcal - avgKcal, 2), 0) / (points.length - 1) 
        : 0;
      const stdDev = Math.sqrt(variance);
      // Коридор: ±1 стандартное отклонение (≈68% уверенность)
      const confidenceMargin = Math.min(stdDev * 0.7, 300); // макс ±300 ккал
      
      // === 3. Weekend ranges для shading ===
      const weekendRanges = [];
      let weekendStart = null;
      points.forEach((p, i) => {
        if (p.isWeekend) {
          if (weekendStart === null) weekendStart = i;
        } else {
          if (weekendStart !== null) {
            weekendRanges.push({ start: weekendStart, end: i - 1 });
            weekendStart = null;
          }
        }
      });
      // Последний weekend
      if (weekendStart !== null) {
        weekendRanges.push({ start: weekendStart, end: points.length - 1 });
      }
      
      // Определяем цвет для каждой точки — используем градиент из ratioZones
      const getPointColor = (ratio) => {
        return rz ? rz.getGradientColor(ratio, 1) : '#22c55e';
      };
      
      // Создаём горизонтальный градиент с цветами по точкам
      const gradientStops = points.map((p, i) => {
        const ratio = p.target > 0 ? p.kcal / p.target : 0;
        const color = getPointColor(ratio);
        const offset = points.length > 1 ? (i / (points.length - 1)) * 100 : 50;
        return { offset, color };
      });
      
      // === Pointer events для slider ===
      const handlePointerMove = (e) => {
        // Если идёт brush — обновляем диапазон
        if (brushing && brushStartRef.current !== null) {
          const svg = e.currentTarget;
          const rect = svg.getBoundingClientRect();
          const x = (e.clientX - rect.left) * (width / rect.width);
          const nearestIdx = points.reduce((prevIdx, curr, idx) => 
            Math.abs(curr.x - x) < Math.abs(points[prevIdx].x - x) ? idx : prevIdx, 0);
          
          const startIdx = brushStartRef.current;
          setBrushRange({
            start: Math.min(startIdx, nearestIdx),
            end: Math.max(startIdx, nearestIdx)
          });
          return;
        }
        
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (width / rect.width);
        
        // Найти ближайшую точку (только основные, не прогноз)
        const nearest = points.reduce((prev, curr) => 
          Math.abs(curr.x - x) < Math.abs(prev.x - x) ? curr : prev
        );
        
        // Haptic при смене точки
        if (sliderPrevPointRef.current !== nearest) {
          sliderPrevPointRef.current = nearest;
          haptic('selection');
        }
        
        setSliderPoint(nearest);
      };
      
      const handlePointerLeave = () => {
        setSliderPoint(null);
        sliderPrevPointRef.current = null;
      };
      
      // === Brush selection handlers ===
      const handleBrushStart = (e) => {
        // Только при долгом нажатии или с Shift
        if (!e.shiftKey && e.pointerType !== 'touch') return;
        
        e.preventDefault();
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (width / rect.width);
        const nearestIdx = points.reduce((prevIdx, curr, idx) => 
          Math.abs(curr.x - x) < Math.abs(points[prevIdx].x - x) ? idx : prevIdx, 0);
        
        brushStartRef.current = nearestIdx;
        setBrushing(true);
        setBrushRange({ start: nearestIdx, end: nearestIdx });
        haptic('light');
      };
      
      const handleBrushEnd = () => {
        if (brushing && brushRange && brushRange.start !== brushRange.end) {
          haptic('medium');
          // Brush завершён — можно показать статистику по диапазону
        }
        setBrushing(false);
        brushStartRef.current = null;
      };
      
      const clearBrush = () => {
        setBrushRange(null);
        setBrushing(false);
        brushStartRef.current = null;
      };
      
      // === Pinch zoom handlers ===
      const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          sparklineZoomRef.current.initialDistance = Math.hypot(dx, dy);
          sparklineZoomRef.current.initialZoom = sparklineZoom;
        }
      };
      
      const handleTouchMove = (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const distance = Math.hypot(dx, dy);
          const initialDist = sparklineZoomRef.current.initialDistance;
          
          if (initialDist > 0) {
            const scale = distance / initialDist;
            const newZoom = Math.max(1, Math.min(3, sparklineZoomRef.current.initialZoom * scale));
            setSparklineZoom(newZoom);
          }
        }
      };
      
      const handleTouchEnd = () => {
        sparklineZoomRef.current.initialDistance = 0;
      };
      
      // Сброс zoom по двойному тапу
      const handleDoubleClick = () => {
        if (sparklineZoom > 1) {
          setSparklineZoom(1);
          setSparklinePan(0);
          haptic('light');
        }
      };
      
      // === Точка "сегодня" ===
      const todayPoint = points.find(p => p.isToday);
      
      // === Статистика выбранного диапазона (brush) ===
      const brushStats = brushRange && brushRange.start !== brushRange.end ? (() => {
        const rangePoints = points.slice(brushRange.start, brushRange.end + 1);
        const totalKcal = rangePoints.reduce((s, p) => s + p.kcal, 0);
        const avgKcal = Math.round(totalKcal / rangePoints.length);
        const avgRatio = rangePoints.reduce((s, p) => s + p.ratio, 0) / rangePoints.length;
        const daysInRange = rangePoints.length;
        return { totalKcal, avgKcal, avgRatio, daysInRange };
      })() : null;
      
      // Класс для Goal Achievement badge
      const goalBadgeClass = 'sparkline-goal-badge' + 
        (goalAchievementPct >= 70 ? '' : goalAchievementPct >= 40 ? ' goal-low' : ' goal-critical');
      
      return React.createElement('div', { 
        className: 'sparkline-container' + (sparklineZoom > 1 ? ' sparkline-zoomed' : ''),
        style: { position: 'relative', overflow: 'hidden' },
        ref: (el) => {
          // Вызываем Twemoji после рендера для foreignObject
          if (el && window.applyTwemoji) {
            setTimeout(() => window.applyTwemoji(el), 50);
          }
        }
      },
      // Goal Achievement Badge перенесён в header (kcal-sparkline-header)
      // === Brush Stats Badge (при выборе диапазона) ===
      brushStats && React.createElement('div', {
        className: 'sparkline-brush-stats',
        onClick: clearBrush
      },
        React.createElement('span', { className: 'brush-days' }, brushStats.daysInRange + ' дн'),
        React.createElement('span', { className: 'brush-avg' }, 'Ø ' + brushStats.avgKcal + ' ккал'),
        React.createElement('span', { 
          className: 'brush-ratio',
          style: { backgroundColor: rz ? rz.getGradientColor(brushStats.avgRatio, 0.9) : '#22c55e' }
        }, Math.round(brushStats.avgRatio * 100) + '%'),
        React.createElement('span', { className: 'brush-close' }, '✕')
      ),
      // === Zoom indicator ===
      sparklineZoom > 1 && React.createElement('div', {
        className: 'sparkline-zoom-indicator',
        onClick: handleDoubleClick
      }, Math.round(sparklineZoom * 100) + '%'),
      React.createElement('svg', { 
        className: 'sparkline-svg animate-always',
        viewBox: '0 0 ' + width + ' ' + height,
        preserveAspectRatio: 'none',
        onPointerMove: handlePointerMove,
        onPointerLeave: handlePointerLeave,
        onPointerDown: handleBrushStart,
        onPointerUp: handleBrushEnd,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onDoubleClick: handleDoubleClick,
        style: { 
          touchAction: sparklineZoom > 1 ? 'pan-x' : 'none', 
          height: height + 'px',
          transform: sparklineZoom > 1 ? `scale(${sparklineZoom}) translateX(${sparklinePan}%)` : 'none',
          transformOrigin: 'center center'
        }
      },
        // Градиенты с цветами по точкам (для области и линии)
        React.createElement('defs', null,
          // Градиент для заливки области (с прозрачностью)
          React.createElement('linearGradient', { id: 'kcalAreaGradient', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            gradientStops.map((stop, i) => 
              React.createElement('stop', { 
                key: i, 
                offset: stop.offset + '%', 
                stopColor: stop.color, 
                stopOpacity: 0.25 
              })
            )
          ),
          // Градиент для линии (полная яркость) — цвета по ratio zones
          React.createElement('linearGradient', { id: 'kcalLineGradient', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            gradientStops.map((stop, i) => 
              React.createElement('stop', { 
                key: i, 
                offset: stop.offset + '%', 
                stopColor: stop.color, 
                stopOpacity: 1 
              })
            )
          )
        ),
        // Заливка области с градиентом (анимированная)
        React.createElement('path', {
          d: fullAreaPath,
          fill: 'url(#kcalAreaGradient)',
          className: 'sparkline-area-animated'
        }),
        // Линия цели (плавная пунктирная)
        React.createElement('path', {
          d: goalPathD,
          className: 'sparkline-goal',
          fill: 'none'
        }),
        // Линия графика с градиентом по ratio zones
        React.createElement('path', {
          d: pathD,
          className: 'sparkline-line',
          style: { 
            stroke: 'url(#kcalLineGradient)',
            strokeDasharray: totalPathLength, 
            strokeDashoffset: totalPathLength 
          }
        }),
        // Золотые streak-линии между 🔥 днями (анимируются синхронно с основной линией)
        streakData.map((data, i) => 
          React.createElement('path', {
            key: 'streak-' + i,
            d: data.path,
            className: 'sparkline-streak-line sparkline-streak-animated',
            style: {
              strokeDasharray: data.segmentLength,
              strokeDashoffset: data.segmentLength,
              animationDelay: data.animDelay + 's',
              animationDuration: data.segmentDuration + 's'
            }
          })
        ),
        // Прогнозная линия калорий — маска для анимации + пунктир
        forecastPathD && React.createElement('g', { key: 'forecast-group' },
          // Маска: сплошная линия которая рисуется
          React.createElement('defs', null,
            React.createElement('mask', { id: 'forecastMask' },
              React.createElement('path', {
                d: forecastPathD,
                fill: 'none',
                stroke: 'white',
                strokeWidth: 4,
                strokeLinecap: 'round',
                strokeDasharray: forecastPathLength,
                strokeDashoffset: forecastPathLength,
                className: 'sparkline-forecast-mask'
              })
            )
          ),
          // Видимая пунктирная линия под маской
          React.createElement('path', {
            d: forecastPathD,
            fill: 'none',
            stroke: forecastColor,
            strokeWidth: 2,
            strokeDasharray: '6 4',
            strokeOpacity: 0.7,
            strokeLinecap: 'round',
            mask: 'url(#forecastMask)'
          })
        ),
        // Прогнозная линия нормы (цели)
        forecastGoalPathD && React.createElement('path', {
          key: 'forecast-goal-line',
          d: forecastGoalPathD,
          fill: 'none',
          stroke: 'rgba(148, 163, 184, 0.7)', // серый slate-400
          strokeWidth: 1.5,
          strokeDasharray: '4 3',
          strokeLinecap: 'round'
        }),
        // === Confidence interval для прогноза (коридор ±σ) — заливка области ===
        forecastPts.length > 0 && confidenceMargin > 50 && (() => {
          // Строим path для области: верхняя граница → нижняя граница (обратно)
          const marginPx = (confidenceMargin / scaleRange) * chartHeight;
          
          // Верхняя линия (слева направо)
          const upperPoints = forecastPts.map(p => ({
            x: p.x,
            y: Math.max(paddingTop, p.y - marginPx)
          }));
          
          // Нижняя линия (справа налево)
          const lowerPoints = forecastPts.map(p => ({
            x: p.x,
            y: Math.min(paddingTop + chartHeight, p.y + marginPx)
          })).reverse();
          
          // Добавляем начальную точку от последней реальной точки
          const lastRealPoint = points[points.length - 1];
          const startX = lastRealPoint ? lastRealPoint.x : forecastPts[0].x;
          
          // Строим path
          let areaPath = 'M ' + startX + ' ' + upperPoints[0].y;
          upperPoints.forEach(p => { areaPath += ' L ' + p.x + ' ' + p.y; });
          lowerPoints.forEach(p => { areaPath += ' L ' + p.x + ' ' + p.y; });
          areaPath += ' Z';
          
          return React.createElement('path', {
            key: 'confidence-area',
            d: areaPath,
            fill: forecastColor,
            fillOpacity: 0.08,
            stroke: 'none'
          });
        })(),
        // Точки прогноза (с цветом по тренду) — появляются после прогнозной линии
        forecastPts.map((p, i) => {
          // Задержка = 3с (основная линия) + время до этой точки в прогнозе
          const forecastDelay = 3 + (i + 1) / forecastPts.length * Math.max(0.5, (forecastPathLength / totalPathLength) * 3);
          return React.createElement('circle', {
            key: 'forecast-dot-' + i,
            cx: p.x, 
            cy: p.y, 
            r: p.isTodayForecast ? 4 : 3, // сегодня крупнее
            className: 'sparkline-dot sparkline-forecast-dot',
            style: {
              fill: forecastColor,
              opacity: 0, // начинаем скрытым
              '--delay': forecastDelay + 's',
              strokeDasharray: '2 2',
              stroke: forecastColor,
              strokeWidth: p.isTodayForecast ? 2 : 1
            }
          });
        }),
        // Метки прогнозных ккал над точками (бледные)
        forecastPts.map((p, i) => {
          const isLast = i === forecastPts.length - 1;
          return React.createElement('text', {
            key: 'forecast-kcal-' + i,
            x: p.x,
            y: p.y - 8,
            className: 'sparkline-day-label' + (p.isTodayForecast ? ' sparkline-day-today' : ' sparkline-day-forecast'),
            textAnchor: isLast ? 'end' : 'middle',
            style: { opacity: p.isTodayForecast ? 0.7 : 0.5, fill: forecastColor }
          }, p.kcal);
        }),
        // Метки прогнозных дней (дата + "прогноз" выше в 2 строки)
        forecastPts.map((p, i) => {
          const isLast = i === forecastPts.length - 1;
          const isTomorrow = !p.isTodayForecast && i === 0;
          const isLabelMultiline = p.isTodayForecast || isTomorrow;
          const line1 = 'прогноз';
          const line2 = p.isTodayForecast ? 'на сегодня' : 'на завтра';
          
          return React.createElement('g', { key: 'forecast-day-' + i },
            // "прогноз" + "на сегодня/завтра" выше даты
            isLabelMultiline && React.createElement('text', {
              x: p.x,
              y: height - 18,
              className: 'sparkline-day-label sparkline-day-forecast',
              textAnchor: isLast ? 'end' : 'middle',
              style: { opacity: 0.8, fontSize: '7px' }
            }, line1),
            isLabelMultiline && React.createElement('text', {
              x: p.x,
              y: height - 11,
              className: 'sparkline-day-label sparkline-day-forecast',
              textAnchor: isLast ? 'end' : 'middle',
              style: { opacity: 0.8, fontSize: '7px' }
            }, line2),
            // Дата внизу
            React.createElement('text', {
              x: p.x,
              y: height - 2,
              className: 'sparkline-day-label sparkline-day-forecast' + 
                (p.isWeekend ? ' sparkline-day-weekend' : ''),
              textAnchor: isLast ? 'end' : 'middle',
              style: { opacity: 0.8 }
            }, p.dayNum)
          );
        }),
        // Метки дней внизу + дельта для всех дней (дельта появляется синхронно с точкой)
        points.map((p, i) => {
          // Классы для выходных и сегодня
          let dayClass = 'sparkline-day-label';
          if (p.isToday) dayClass += ' sparkline-day-today';
          if (p.isWeekend) dayClass += ' sparkline-day-weekend';
          if (p.isUnknown) dayClass += ' sparkline-day-unknown';
          // Динамический anchor для крайних точек
          const isFirst = i === 0;
          const isLast = i === points.length - 1 && forecastPts.length === 0;
          const anchor = isFirst ? 'start' : (isLast ? 'end' : 'middle');
          
          // Дельта: разница между съеденным и нормой
          const delta = p.kcal - p.target;
          const deltaText = delta >= 0 ? '+' + Math.round(delta) : Math.round(delta);
          const ratio = p.target > 0 ? p.kcal / p.target : 0;
          const deltaColor = rz ? rz.getGradientColor(ratio, 1) : '#64748b';
          
          // Delay: все дельты и эмодзи появляются одновременно — взрыв от оси X
          const deltaDelay = 2.6; // все сразу
          
          return React.createElement('g', { key: 'day-group-' + i },
            // Дата
            React.createElement('text', {
              x: p.x,
              y: height - 2,
              className: dayClass,
              textAnchor: anchor,
              style: p.isUnknown ? { opacity: 0.5 } : {}
            }, p.dayNum),
            // Дельта под датой (для всех дней с данными, кроме unknown)
            p.kcal > 0 && !p.isUnknown && React.createElement('text', {
              x: p.x,
              y: height + 10,
              className: 'sparkline-delta-label',
              textAnchor: anchor,
              style: { fill: deltaColor, '--delay': deltaDelay + 's' }
            }, deltaText),
            // Для unknown дней — показываем "?" вместо дельты
            p.isUnknown && React.createElement('text', {
              x: p.x,
              y: height + 10,
              className: 'sparkline-delta-label sparkline-delta-unknown',
              textAnchor: anchor,
              style: { fill: 'rgba(156, 163, 175, 0.6)', '--delay': deltaDelay + 's' }
            }, '—')
          );
        }),
        // Точки на все дни с hover и цветом по статусу (анимация с задержкой)
        // Weekly Rhythm — вертикальные сепараторы перед понедельниками (но не первым)
        points.filter((p, i) => i > 0 && p.dayOfWeek === 1).map((p, i) =>
          React.createElement('line', {
            key: 'week-sep-' + i,
            x1: p.x - 4,
            y1: paddingTop + 4,
            x2: p.x - 4,
            y2: height - paddingBottom - 4,
            className: 'sparkline-week-separator'
          })
        ),
        // Золотые пульсирующие точки для идеальных дней, иначе обычные точки
        // Точки появляются синхронно с рисованием линии (по реальной длине кривой Безье)
        (() => {
          const lineDrawDuration = 3; // секунд — должно совпадать с CSS animation
          const leadTime = 0.15; // точки появляются чуть раньше линии
          
          return points.map((p, i) => {
            const ratio = p.target > 0 ? p.kcal / p.target : 0;
            // Задержка пропорциональна реальной длине пути до точки
            const pathProgress = cumulativeLengths[i] / totalPathLength;
            const animDelay = Math.max(0, pathProgress * lineDrawDuration - leadTime);
          
            // Неизвестный день — серый кружок с "?"
            if (p.isUnknown) {
              return React.createElement('g', { key: 'unknown-' + i },
                React.createElement('circle', {
                  cx: p.x,
                  cy: p.y,
                  r: 6,
                  className: 'sparkline-dot sparkline-dot-unknown',
                  style: { 
                    cursor: 'pointer', 
                    '--delay': animDelay + 's',
                    fill: 'rgba(156, 163, 175, 0.3)',
                    stroke: 'rgba(156, 163, 175, 0.6)',
                    strokeWidth: 1.5,
                    strokeDasharray: '2 2'
                  },
                  onClick: (e) => {
                    e.stopPropagation();
                    haptic('light');
                    openExclusivePopup('sparkline', { type: 'unknown', point: p, x: e.clientX, y: e.clientY });
                  }
                }),
                React.createElement('text', {
                  x: p.x,
                  y: p.y + 3,
                  textAnchor: 'middle',
                  className: 'sparkline-unknown-label',
                  style: { 
                    fill: 'rgba(156, 163, 175, 0.9)',
                    fontSize: '9px',
                    fontWeight: '600',
                    pointerEvents: 'none'
                  }
                }, '?')
              );
            }
          
            // Идеальный день — золотая пульсирующая точка
            if (p.isPerfect && p.kcal > 0) {
              return React.createElement('circle', {
                key: 'gold-' + i,
                cx: p.x,
                cy: p.y,
                r: p.isToday ? 5 : 4,
                className: 'sparkline-dot-gold' + (p.isToday ? ' sparkline-dot-gold-today' : ''),
                style: { cursor: 'pointer', '--delay': animDelay + 's' },
                onClick: (e) => {
                  e.stopPropagation();
                  haptic('medium');
                  openExclusivePopup('sparkline', { type: 'perfect', point: p, x: e.clientX, y: e.clientY });
                }
              });
            }
          
            // Обычная точка — цвет через inline style из ratioZones
            const dotColor = rz ? rz.getGradientColor(ratio, 1) : '#22c55e';
          let dotClass = 'sparkline-dot';
          if (p.isToday) dotClass += ' sparkline-dot-today';
          
          return React.createElement('circle', {
            key: 'dot-' + i,
            cx: p.x, 
            cy: p.y, 
            r: p.isToday ? 5 : 4,
            className: dotClass,
            style: { cursor: 'pointer', '--delay': animDelay + 's', fill: dotColor },
            onClick: (e) => {
              e.stopPropagation();
              haptic('light');
              openExclusivePopup('sparkline', { type: 'kcal', point: p, x: e.clientX, y: e.clientY });
            }
          },
            React.createElement('title', null, p.dayNum + ': ' + p.kcal + ' / ' + p.target + ' ккал')
          );
        });
        })(),
        // Пунктирные линии от точек к меткам дней (появляются синхронно с точкой)
        points.map((p, i) => {
          if (p.kcal <= 0) return null;
          const pathProgress = cumulativeLengths[i] / totalPathLength;
          const lineDelay = Math.max(0, pathProgress * 3 - 0.15);
          return React.createElement('line', {
            key: 'point-line-' + i,
            x1: p.x,
            y1: p.y + 6, // от точки
            x2: p.x,
            y2: height - paddingBottom + 6, // до меток дней
            className: 'sparkline-point-line',
            style: { '--delay': lineDelay + 's' }
          });
        }).filter(Boolean),
        // Аннотации тренировок — пунктирные линии вниз к точкам (появляются синхронно с точкой)
        points.map((p, i) => {
          if (!p.hasTraining || !p.trainingTypes.length) return null;
          const lineDelay = 2.6; // все сразу
          return React.createElement('line', {
            key: 'train-line-' + i,
            x1: p.x,
            y1: 6, // от верхней линии
            x2: p.x,
            y2: p.y - 6, // до точки
            className: 'sparkline-training-line',
            style: { '--delay': lineDelay + 's' }
          });
        }).filter(Boolean),
        // Аннотации тренировок — иконки в одну линию сверху
        // Используем SVG <image> с Twemoji CDN напрямую
        points.map((p, i) => {
          if (!p.hasTraining || !p.trainingTypes.length) return null;
          // Маппинг типов на Twemoji codepoints
          const typeCodepoint = { 
            cardio: '1f3c3',      // 🏃
            strength: '1f3cb',    // 🏋️ (без -fe0f!)
            hobby: '26bd'         // ⚽
          };
          const emojiDelay = 2.6;
          const emojiSize = 16;
          const emojiCount = p.trainingTypes.length;
          const totalWidth = emojiCount * emojiSize;
          const startX = p.x - totalWidth / 2;
          
          return React.createElement('g', {
            key: 'train-' + i,
            className: 'sparkline-annotation sparkline-annotation-training',
            style: { '--delay': emojiDelay + 's' }
          },
            p.trainingTypes.map((t, j) => {
              const code = typeCodepoint[t] || '1f3c3';
              const url = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/' + code + '.svg';
              return React.createElement('image', {
                key: j,
                href: url,
                x: startX + j * emojiSize,
                y: 1,
                width: emojiSize,
                height: emojiSize
              });
            })
          );
        }).filter(Boolean),
        // Слайдер — вертикальная линия
        sliderPoint && React.createElement('line', {
          key: 'slider-line',
          x1: sliderPoint.x,
          y1: paddingTop,
          x2: sliderPoint.x,
          y2: height - paddingBottom + 2,
          className: 'sparkline-slider-line'
        }),
        // Слайдер — увеличенная точка
        sliderPoint && React.createElement('circle', {
          key: 'slider-point',
          cx: sliderPoint.x,
          cy: sliderPoint.y,
          r: 6,
          className: 'sparkline-slider-point'
        }),
        // === TODAY LINE — вертикальная линия на сегодня ===
        todayPoint && React.createElement('g', { key: 'today-line-group' },
          // Полупрозрачная полоса
          React.createElement('rect', {
            x: todayPoint.x - 1.5,
            y: paddingTop,
            width: 3,
            height: chartHeight,
            className: 'sparkline-today-line',
            fill: 'rgba(59, 130, 246, 0.2)'
          }),
          // Процент отклонения от нормы (ближе к точке, под графиком)
          todayPoint.target > 0 && React.createElement('text', {
            x: todayPoint.x,
            y: todayPoint.y - 18,
            textAnchor: 'middle',
            className: 'sparkline-today-pct',
            style: { 
              fill: rz ? rz.getGradientColor(todayPoint.kcal / todayPoint.target, 1) : '#22c55e', 
              fontSize: '9px', 
              fontWeight: '700'
            }
          }, (() => {
            const deviation = Math.round((todayPoint.kcal / todayPoint.target - 1) * 100);
            return deviation >= 0 ? '+' + deviation + '%' : deviation + '%';
          })()),
          // Метка "сегодня" — стрелка (над точкой)
          React.createElement('text', {
            x: todayPoint.x,
            y: todayPoint.y - 8,
            textAnchor: 'middle',
            className: 'sparkline-today-label',
            style: { fill: 'rgba(59, 130, 246, 0.9)', fontSize: '8px', fontWeight: '600' }
          }, '▼')
        ),
        // === BRUSH SELECTION — полоса выбора диапазона ===
        brushRange && points[brushRange.start] && points[brushRange.end] && React.createElement('rect', {
          key: 'brush-overlay',
          x: Math.min(points[brushRange.start].x, points[brushRange.end].x),
          y: paddingTop,
          width: Math.abs(points[brushRange.end].x - points[brushRange.start].x),
          height: chartHeight,
          className: 'sparkline-brush-overlay',
          fill: 'rgba(59, 130, 246, 0.12)',
          stroke: 'rgba(59, 130, 246, 0.4)',
          strokeWidth: 1,
          rx: 2
        })
      ),
      // Glassmorphism тултип для слайдера (компактный)
      sliderPoint && React.createElement('div', {
        className: 'sparkline-slider-tooltip',
        style: {
          left: Math.min(Math.max(sliderPoint.x, 60), width - 60) + 'px',
          transform: 'translateX(-50%)'
        }
      },
        // Header: дата + badge процент
        React.createElement('div', { className: 'sparkline-slider-tooltip-header' }, 
          React.createElement('span', { className: 'sparkline-slider-tooltip-date' }, 
            (() => {
              if (sliderPoint.isForecast) return sliderPoint.dayNum + ' П';
              const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
              const wd = weekDays[sliderPoint.dayOfWeek] || '';
              return sliderPoint.dayNum + ' ' + wd;
            })()
          ),
          sliderPoint.ratio && React.createElement('span', { 
            className: 'sparkline-slider-tooltip-ratio',
            style: { backgroundColor: rz ? rz.getGradientColor(sliderPoint.ratio, 0.9) : '#22c55e' }
          }, Math.round(sliderPoint.ratio * 100) + '%')
        ),
        // Калории
        React.createElement('div', { className: 'sparkline-slider-tooltip-kcal' }, 
          sliderPoint.kcal + ' ',
          React.createElement('small', null, '/ ' + sliderPoint.target)
        ),
        // Теги: сон, оценка сна, тренировка, шаги, оценка дня
        (sliderPoint.sleepHours > 0 || sliderPoint.sleepQuality > 0 || sliderPoint.dayScore > 0 || sliderPoint.trainingMinutes > 0 || sliderPoint.steps > 0) &&
          React.createElement('div', { className: 'sparkline-slider-tooltip-tags' },
            // Сон
            sliderPoint.sleepHours > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag' + (sliderPoint.sleepHours < 6 ? ' bad' : '')
              }, 'Сон: ' + sliderPoint.sleepHours.toFixed(1) + 'ч'),
            // Оценка сна (1-10) — динамический цвет
            sliderPoint.sleepQuality > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag',
                style: { 
                  backgroundColor: sliderPoint.sleepQuality <= 3 ? '#ef4444' : 
                                   sliderPoint.sleepQuality <= 5 ? '#f97316' : 
                                   sliderPoint.sleepQuality <= 7 ? '#eab308' : '#22c55e',
                  color: sliderPoint.sleepQuality <= 5 ? '#fff' : '#000'
                }
              }, 'Оценка сна: ' + sliderPoint.sleepQuality),
            // Тренировка
            sliderPoint.trainingMinutes > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag good'
              }, 'Тренировка: ' + sliderPoint.trainingMinutes + 'м'),
            // Шаги
            sliderPoint.steps > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag' + (sliderPoint.steps >= 10000 ? ' good' : '')
              }, 'Шаги: ' + sliderPoint.steps.toLocaleString()),
            // Оценка дня (1-10) — динамический цвет
            sliderPoint.dayScore > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag',
                style: { 
                  backgroundColor: sliderPoint.dayScore <= 3 ? '#ef4444' : 
                                   sliderPoint.dayScore <= 5 ? '#f97316' : 
                                   sliderPoint.dayScore <= 7 ? '#eab308' : '#22c55e',
                  color: sliderPoint.dayScore <= 5 ? '#fff' : '#000'
                }
              }, 'Оценка дня: ' + sliderPoint.dayScore)
          )
      ),
      // Полоса оценки дня (dayScore) под графиком
      (() => {
        // Используем исходные data (до фильтрации excludeFromChart), чтобы включить сегодня
        const allDaysWithScore = data.filter(d => d.dayScore > 0);
        const hasDayScoreData = allDaysWithScore.length > 0;
        
        if (hasDayScoreData) {
          // Полоса с градиентом по dayScore (1-10)
          const getDayScoreColor = (score) => {
            if (!score || score <= 0) return 'transparent'; // нет данных — прозрачный пропуск
            if (score <= 3) return '#ef4444'; // 😢 плохо — красный
            if (score <= 5) return '#f97316'; // 😐 средне — оранжевый
            if (score <= 7) return '#eab308'; // 🙂 нормально — жёлтый
            return '#22c55e'; // 😊 хорошо — зелёный
          };
          
          // Используем все дни из data для градиента (включая сегодня)
          const moodStops = data.map((d, i) => ({
            offset: data.length > 1 ? (i / (data.length - 1)) * 100 : 50,
            color: getDayScoreColor(d.dayScore)
          }));
          
          // Бар заканчивается на сегодня, справа место для надписи
          // Вычисляем ширину бара: data.length дней из totalPoints (включая прогноз)
          const barWidthPct = totalPoints > 1 ? ((data.length) / totalPoints) * 100 : 85;
          
          return React.createElement('div', { className: 'sparkline-mood-container' },
            React.createElement('div', { 
              className: 'sparkline-mood-bar-modern',
              style: { 
                width: barWidthPct + '%',
                background: 'linear-gradient(to right, ' + 
                  moodStops.map(s => s.color + ' ' + s.offset + '%').join(', ') + ')'
              }
            }),
            React.createElement('span', { 
              className: 'sparkline-mood-label',
              style: { textAlign: 'right', lineHeight: '1.1', fontSize: '8px' }
            }, 
              React.createElement('span', null, 'Оценка'),
              React.createElement('br'),
              React.createElement('span', null, 'дня')
            )
          );
        }
        
        // Fallback: Mini heatmap калорий
        return React.createElement('div', { className: 'sparkline-heatmap' },
          points.map((p, i) => {
            const ratio = p.target > 0 ? p.kcal / p.target : 0;
            let level;
            if (ratio === 0) level = 0;
            else if (ratio < 0.5) level = 1;
            else if (ratio < 0.8) level = 2;
            else if (ratio < 0.95) level = 3;
            else if (ratio <= 1.05) level = 4;
            else if (ratio <= 1.15) level = 5;
            else level = 6;
            
            return React.createElement('div', {
              key: 'hm-' + i,
              className: 'sparkline-heatmap-cell level-' + level,
              title: p.dayNum + ': ' + Math.round(ratio * 100) + '%'
            });
          })
        );
      })()
      // Ряд индикаторов сна убран — информация дублируется с баром "Оценка дня"
    );
    };


  // Экспорт в глобальный namespace
  global.HEYS.DayCharts.renderSparkline = renderSparkline;

  console.log('✅ KcalSparkline module loaded');

})(typeof window !== 'undefined' ? window : this);
