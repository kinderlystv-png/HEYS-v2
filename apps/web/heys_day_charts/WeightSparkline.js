// apps/web/heys_day_charts/WeightSparkline.js
// Weight Sparkline Chart Component
// Extracted from heys_day_v12.js (lines 8667-9159, 492 lines)

;(function(global){
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Import dependencies
  const U = HEYS.dayUtils || {};
  const haptic = U.haptic || (() => {});
  
  /**
   * WeightSparkline - График веса с трендом и прогнозом
   * 
   * Props:
   * - data: Array<{ weight, date, dayNum, isToday, cycleDay, hasWaterRetention, ... }>
   * - trend: object with trend info
   * - onPointClick: (type, point, x, y) => void
   */
  const WeightSparkline = function(props) {
    const { data, trend, onPointClick } = props;
    
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
    
    // Если только 1 точка — показываем её с подсказкой
    if (data.length === 1) {
      const point = data[0];
      return React.createElement('div', { className: 'weight-single-point' },
        React.createElement('div', { className: 'weight-single-value' },
          React.createElement('span', { className: 'weight-single-number' }, point.weight),
          React.createElement('span', { className: 'weight-single-unit' }, ' кг')
        ),
        React.createElement('div', { className: 'weight-single-hint' },
          'Добавьте вес завтра для отслеживания тренда'
        )
      );
    }
    
    // Прогноз на +1 день (завтра) по тренду последних 3 точек
    let forecastPoint = null;
    if (data.length >= 3) {
      const lastDays = data.slice(-3);
      const avgChange = (lastDays[2].weight - lastDays[0].weight) / 2;
      const lastWeight = data[data.length - 1].weight;
      const lastDate = data[data.length - 1].date;
      if (lastDate) {
        const forecastDate = new Date(lastDate);
        forecastDate.setDate(forecastDate.getDate() + 1);
        forecastPoint = {
          weight: +(lastWeight + avgChange).toFixed(1),
          date: forecastDate.toISOString().slice(0, 10),
          dayNum: forecastDate.getDate(),
          isForecast: true
        };
      }
    }
    
    const width = 360;
    const height = 120;
    const paddingTop = 16;
    const paddingBottom = 16;
    const paddingX = 8;
    const chartHeight = height - paddingTop - paddingBottom;
    
    // Масштаб с минимумом 1 кг range (включая прогноз)
    const allWeights = [...data.map(d => d.weight), ...(forecastPoint ? [forecastPoint.weight] : [])];
    const minWeight = Math.min(...allWeights);
    const maxWeight = Math.max(...allWeights);
    const rawRange = maxWeight - minWeight;
    const range = Math.max(1, rawRange + 0.5);
    const adjustedMin = minWeight - 0.25;
    
    const totalPoints = data.length + (forecastPoint ? 1 : 0);
    
    // Проверяем есть ли дни с задержкой воды
    const hasAnyRetentionDays = data.some(d => d.hasWaterRetention);
    
    const points = data.map((d, i) => {
      const x = paddingX + (i / (totalPoints - 1)) * (width - paddingX * 2);
      const y = paddingTop + chartHeight - ((d.weight - adjustedMin) / range) * chartHeight;
      return { 
        x, 
        y, 
        weight: d.weight, 
        isToday: d.isToday, 
        dayNum: d.dayNum, 
        date: d.date,
        cycleDay: d.cycleDay,
        hasWaterRetention: d.hasWaterRetention,
        retentionSeverity: d.retentionSeverity,
        retentionAdvice: d.retentionAdvice
      };
    });
    
    // Точка прогноза
    let forecastPt = null;
    if (forecastPoint) {
      const idx = data.length;
      const x = paddingX + (idx / (totalPoints - 1)) * (width - paddingX * 2);
      const y = paddingTop + chartHeight - ((forecastPoint.weight - adjustedMin) / range) * chartHeight;
      forecastPt = { x, y, ...forecastPoint };
    }
    
    // Плавная кривая с monotonic constraint
    const smoothPath = (pts) => {
      if (pts.length < 2) return '';
      if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
      
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
      return d;
    };
    
    const pathD = smoothPath(points);
    
    // Определяем тренд
    const firstHalf = points.slice(0, Math.ceil(points.length / 2));
    const secondHalf = points.slice(Math.floor(points.length / 2));
    const avgFirst = firstHalf.reduce((s, p) => s + p.weight, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, p) => s + p.weight, 0) / secondHalf.length;
    const weightTrend = avgSecond - avgFirst;
    
    // Цвет по тренду
    const trendColor = weightTrend <= -0.1 ? '#22c55e' : (weightTrend >= 0.1 ? '#ef4444' : '#8b5cf6');
    
    // Цвет прогноза
    const forecastColor = forecastPt 
      ? (forecastPt.weight < points[points.length - 1].weight ? '#22c55e' : 
         forecastPt.weight > points[points.length - 1].weight ? '#ef4444' : '#8b5cf6')
      : trendColor;
    
    // Область под графиком
    const areaPath = pathD + ` L${points[points.length-1].x},${paddingTop + chartHeight} L${points[0].x},${paddingTop + chartHeight} Z`;
    
    // Gradient stops для линии
    const weightLineGradientStops = points.map((p, i) => {
      const prevWeight = i > 0 ? points[i-1].weight : p.weight;
      const localTrend = p.weight - prevWeight;
      const dotColor = localTrend < -0.05 ? '#22c55e' : (localTrend > 0.05 ? '#ef4444' : '#8b5cf6');
      const offset = points.length > 1 ? (i / (points.length - 1)) * 100 : 50;
      return { offset, color: dotColor };
    });
    
    // Прогнозная линия
    let forecastLineD = '';
    if (forecastPt && points.length >= 2) {
      const prev2Point = points[points.length - 2];
      const lastPoint = points[points.length - 1];
      const allForBezier = [prev2Point, lastPoint, forecastPt];
      const p0 = allForBezier[0];
      const p1 = allForBezier[1];
      const p2 = allForBezier[2];
      const tension = 0.25;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p2.x - p1.x) * tension;
      const cp2y = p2.y - (p2.y - p1.y) * tension;
      forecastLineD = `M${p1.x},${p1.y} C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    
    // Handler for point clicks
    const handlePointClick = (type, point, e) => {
      e.stopPropagation();
      haptic('light');
      if (onPointClick) {
        onPointClick(type, point, e.clientX, e.clientY);
      }
    };
    
    return React.createElement('svg', { 
      className: 'weight-sparkline-svg animate-always',
      viewBox: '0 0 ' + width + ' ' + height,
      preserveAspectRatio: 'none',
      style: { height: height + 'px' }
    },
      // Градиенты
      React.createElement('defs', null,
        React.createElement('linearGradient', { id: 'weightAreaGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
          React.createElement('stop', { offset: '0%', stopColor: trendColor, stopOpacity: '0.25' }),
          React.createElement('stop', { offset: '100%', stopColor: trendColor, stopOpacity: '0.05' })
        ),
        React.createElement('linearGradient', { id: 'weightLineGrad', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
          weightLineGradientStops.map((stop, i) => 
            React.createElement('stop', { 
              key: i, 
              offset: stop.offset + '%', 
              stopColor: stop.color, 
              stopOpacity: 1 
            })
          )
        ),
        React.createElement('linearGradient', { id: 'retentionZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
          React.createElement('stop', { offset: '0%', stopColor: '#ec4899', stopOpacity: '0.15' }),
          React.createElement('stop', { offset: '100%', stopColor: '#ec4899', stopOpacity: '0.03' })
        )
      ),
      // Розовые зоны для дней с задержкой воды
      hasAnyRetentionDays && (() => {
        const retentionRanges = [];
        let rangeStart = null;
        
        for (let i = 0; i < points.length; i++) {
          if (points[i].hasWaterRetention) {
            if (rangeStart === null) rangeStart = i;
          } else {
            if (rangeStart !== null) {
              retentionRanges.push({ start: rangeStart, end: i - 1 });
              rangeStart = null;
            }
          }
        }
        if (rangeStart !== null) {
          retentionRanges.push({ start: rangeStart, end: points.length - 1 });
        }
        
        const colWidth = (width - paddingX * 2) / (totalPoints - 1);
        
        return retentionRanges.map((range, idx) => {
          const startX = points[range.start].x - colWidth * 0.4;
          const endX = points[range.end].x + colWidth * 0.4;
          const rectWidth = Math.max(endX - startX, colWidth * 0.8);
          
          return React.createElement('rect', {
            key: 'retention-zone-' + idx,
            x: Math.max(0, startX),
            y: 0,
            width: rectWidth,
            height: height,
            fill: 'url(#retentionZoneGrad)',
            className: 'weight-retention-zone',
            rx: 4
          });
        });
      })(),
      // Заливка под графиком
      React.createElement('path', {
        d: areaPath,
        fill: 'url(#weightAreaGrad)',
        className: 'weight-sparkline-area sparkline-area-animated'
      }),
      // Линия графика
      React.createElement('path', {
        d: pathD,
        className: 'weight-sparkline-line weight-sparkline-line-animated',
        style: { stroke: 'url(#weightLineGrad)' }
      }),
      // Прогнозная линия
      forecastPt && forecastLineD && React.createElement('g', { key: 'weight-forecast-group' },
        React.createElement('defs', null,
          React.createElement('mask', { id: 'weightForecastMask' },
            React.createElement('path', {
              d: forecastLineD,
              fill: 'none',
              stroke: 'white',
              strokeWidth: 4,
              strokeLinecap: 'round',
              strokeDasharray: 200,
              strokeDashoffset: 200,
              className: 'weight-sparkline-forecast-mask'
            })
          )
        ),
        React.createElement('path', {
          d: forecastLineD,
          fill: 'none',
          stroke: forecastColor,
          strokeWidth: 2,
          strokeDasharray: '4 3',
          strokeOpacity: 0.6,
          strokeLinecap: 'round',
          mask: 'url(#weightForecastMask)'
        })
      ),
      // Confidence interval для прогноза
      forecastPt && (() => {
        const confidenceKg = 0.3;
        const marginPx = (confidenceKg / range) * chartHeight;
        const lastPt = points[points.length - 1];
        if (!lastPt) return null;
        
        const upperY = Math.max(paddingTop, forecastPt.y - marginPx);
        const lowerY = Math.min(paddingTop + chartHeight, forecastPt.y + marginPx);
        const areaPath = `M ${lastPt.x} ${lastPt.y} L ${forecastPt.x} ${upperY} L ${forecastPt.x} ${lowerY} Z`;
        
        return React.createElement('path', {
          key: 'weight-confidence-area',
          d: areaPath,
          fill: forecastColor,
          fillOpacity: 0.1,
          stroke: 'none'
        });
      })(),
      // TODAY LINE
      (() => {
        const todayPt = points.find(p => p.isToday);
        if (!todayPt) return null;
        
        const firstWeight = points[0]?.weight || todayPt.weight;
        const weightChange = todayPt.weight - firstWeight;
        const changeText = weightChange >= 0 ? '+' + weightChange.toFixed(1) : weightChange.toFixed(1);
        const changeColor = weightChange < -0.05 ? '#22c55e' : (weightChange > 0.05 ? '#ef4444' : '#8b5cf6');
        
        return React.createElement('g', { key: 'weight-today-line-group' },
          React.createElement('text', {
            x: todayPt.x,
            y: todayPt.y - 26,
            textAnchor: 'middle',
            style: { 
              fill: changeColor, 
              fontSize: '9px', 
              fontWeight: '700'
            }
          }, changeText + ' кг'),
          React.createElement('text', {
            x: todayPt.x,
            y: todayPt.y - 16,
            textAnchor: 'middle',
            style: { fill: 'rgba(139, 92, 246, 0.9)', fontSize: '8px', fontWeight: '600' }
          }, '▼')
        );
      })(),
      // Пунктирные линии от точек
      points.map((p, i) => {
        const animDelay = 3 + i * 0.15;
        return React.createElement('line', {
          key: 'wpoint-line-' + i,
          x1: p.x,
          y1: p.y + 6,
          x2: p.x,
          y2: height - paddingBottom + 4,
          className: 'sparkline-point-line weight-sparkline-point-line',
          style: { '--delay': animDelay + 's' }
        });
      }),
      // Метки дней внизу
      points.map((p, i) => {
        const isFirst = i === 0;
        const isLast = i === points.length - 1 && !forecastPt;
        const anchor = isFirst ? 'start' : (isLast ? 'end' : 'middle');
        return React.createElement('text', {
          key: 'wday-' + i,
          x: p.x,
          y: height - 2,
          className: 'weight-sparkline-day-label' + (p.isToday ? ' weight-sparkline-day-today' : ''),
          textAnchor: anchor
        }, p.dayNum);
      }),
      // Метки веса над точками
      points.map((p, i) => {
        const isFirst = i === 0;
        const isLast = i === points.length - 1 && !forecastPt;
        const anchor = isFirst ? 'start' : (isLast ? 'end' : 'middle');
        return React.createElement('text', {
          key: 'wlabel-' + i,
          x: p.x,
          y: p.y - 8,
          className: 'weight-sparkline-weight-label' + (p.isToday ? ' weight-sparkline-day-today' : ''),
          textAnchor: anchor
        }, p.weight.toFixed(1));
      }),
      // Метка прогноза
      forecastPt && React.createElement('text', {
        key: 'wlabel-forecast',
        x: forecastPt.x,
        y: forecastPt.y - 8,
        className: 'weight-sparkline-weight-label weight-sparkline-day-forecast',
        textAnchor: 'end',
        style: { opacity: 0.5 }
      }, forecastPt.weight.toFixed(1)),
      forecastPt && React.createElement('text', {
        key: 'wday-forecast',
        x: forecastPt.x,
        y: height - 2,
        className: 'weight-sparkline-day-label weight-sparkline-day-forecast',
        textAnchor: 'end',
        style: { opacity: 0.5 }
      }, forecastPt.dayNum),
      // Точки с цветом по локальному тренду
      points.map((p, i) => {
        const prevWeight = i > 0 ? points[i-1].weight : p.weight;
        const localTrend = p.weight - prevWeight;
        const dotColor = localTrend < -0.05 ? '#22c55e' : (localTrend > 0.05 ? '#ef4444' : '#8b5cf6');
        
        let dotClass = 'weight-sparkline-dot sparkline-dot';
        if (p.isToday) dotClass += ' weight-sparkline-dot-today sparkline-dot-pulse';
        if (p.hasWaterRetention) dotClass += ' weight-sparkline-dot-retention';
        
        const animDelay = 3 + i * 0.15;
        const dotStyle = { 
          cursor: 'pointer', 
          fill: dotColor, 
          '--delay': animDelay + 's'
        };
        
        if (p.hasWaterRetention) {
          dotStyle.stroke = '#ec4899';
          dotStyle.strokeWidth = 2;
        }
        
        let tooltipText = p.dayNum + ': ' + p.weight + ' кг';
        if (localTrend !== 0) {
          tooltipText += ' (' + (localTrend > 0 ? '+' : '') + localTrend.toFixed(1) + ')';
        }
        if (p.hasWaterRetention) {
          tooltipText += ' 🌸 День ' + p.cycleDay + ' — возможна задержка воды';
        }
        
        return React.createElement('circle', {
          key: 'wdot-' + i,
          cx: p.x, 
          cy: p.y, 
          r: p.isToday ? 5 : 4,
          className: dotClass,
          style: dotStyle,
          onClick: (e) => handlePointClick('weight', { ...p, localTrend }, e)
        },
          React.createElement('title', null, tooltipText)
        );
      }),
      // Точка прогноза
      forecastPt && React.createElement('circle', {
        key: 'wdot-forecast',
        cx: forecastPt.x,
        cy: forecastPt.y,
        r: 3.5,
        className: 'weight-sparkline-dot weight-sparkline-dot-forecast',
        style: { 
          fill: forecastColor, 
          opacity: 0.6,
          strokeDasharray: '2 2',
          stroke: forecastColor,
          strokeWidth: 1.5,
          cursor: 'pointer'
        },
        onClick: (e) => {
          const lastWeight = points[points.length - 1]?.weight || forecastPt.weight;
          const forecastChange = forecastPt.weight - lastWeight;
          handlePointClick('weight-forecast', { 
            ...forecastPt, 
            forecastChange,
            lastWeight
          }, e);
        }
      },
        React.createElement('title', null, forecastPt.dayNum + ' (прогноз): ~' + forecastPt.weight + ' кг')
      )
    );
  };
  
  // Export
  HEYS.DayCharts = HEYS.DayCharts || {};
  HEYS.DayCharts.WeightSparkline = WeightSparkline;
  
})(typeof window !== 'undefined' ? window : global);
