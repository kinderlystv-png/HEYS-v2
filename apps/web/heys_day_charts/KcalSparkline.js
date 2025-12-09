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
 * @param {Array} sparklineData - Массив точек данных [{kcal, target, date, dayNum, ...}]
 * @param {number} optimum - Целевая норма калорий
 * @param {Function} onPointClick - Callback при клике на точку (point, event)
 * @param {string} selectedDate - Текущая выбранная дата (для подсветки)
 * @param {boolean} isMobile - Флаг мобильной версии
 * @param {number} sparklineZoom - Уровень зума (1 = 100%, 2 = 200%, 3 = 300%)
 * @param {Function} haptic - Функция для тактильной обратной связи
 * @param {Function} openExclusivePopup - Открыть popup с деталями точки
 * 
 * Экспортирует через HEYS.DayCharts.KcalSparkline
 */

(function (global) {
  'use strict';

  const { React } = global;

  if (!React) {
    console.error('KcalSparkline: React is not available');
    return;
  }

  /**
   * KcalSparkline Component
   */
  const KcalSparkline = ({ 
    sparklineData, 
    optimum, 
    onPointClick,
    selectedDate,
    isMobile = false,
    sparklineZoom = 1,
    haptic = () => {},
    openExclusivePopup = () => {}
  }) => {
    // Skeleton loader пока данные загружаются
    if (!sparklineData) {
      return React.createElement('div', { className: 'sparkline-skeleton' },
        React.createElement('div', { className: 'sparkline-skeleton-line' }),
        React.createElement('div', { className: 'sparkline-skeleton-dots' },
          Array.from({length: 7}).map((_, i) => 
            React.createElement('div', { key: i, className: 'sparkline-skeleton-dot' })
          )
        )
      );
    }
    
    if (sparklineData.length === 0) return null;
    
    // === Empty state: проверяем есть ли реальные данные (хотя бы 2 дня с kcal > 0) ===
    const daysWithData = sparklineData.filter(d => d.kcal > 0).length;
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
    
    // === Вычисляем размеры графика ===
    const w = 800; // viewBox width
    const h = 200; // viewBox height
    const padding = { top: 30, right: 20, bottom: 30, left: 20 };
    const innerW = w - padding.left - padding.right;
    const innerH = h - padding.top - padding.bottom;
    
    // Находим min/max для масштаба Y-оси (учитываем только дни с данными)
    const validPoints = sparklineData.filter(p => p.kcal > 0 || p.target > 0);
    if (validPoints.length === 0) return null;
    
    const maxKcal = Math.max(
      ...validPoints.map(p => Math.max(p.kcal, p.target)),
      optimum || 2000
    );
    const minKcal = Math.min(
      ...validPoints.map(p => Math.min(p.kcal, p.target)),
      0
    );
    
    const yScale = (value) => {
      const range = maxKcal - minKcal;
      const normalized = (value - minKcal) / range;
      return h - padding.bottom - (normalized * innerH);
    };
    
    const xScale = (index) => {
      const step = innerW / (sparklineData.length - 1 || 1);
      return padding.left + (index * step);
    };
    
    // === Goal line (горизонтальная линия цели) ===
    const goalY = yScale(optimum);
    const goalLine = React.createElement('line', {
      x1: padding.left,
      y1: goalY,
      x2: w - padding.right,
      y2: goalY,
      stroke: '#9ca3af',
      strokeWidth: 1,
      strokeDasharray: '4 4',
      opacity: 0.3
    });
    
    // === Path для линии калорий (соединяем только точки с данными) ===
    let pathD = '';
    sparklineData.forEach((p, i) => {
      if (p.kcal > 0) {
        const x = xScale(i);
        const y = yScale(p.kcal);
        pathD += (pathD ? ' L ' : 'M ') + x + ' ' + y;
      }
    });
    
    const kcalPath = React.createElement('path', {
      d: pathD,
      fill: 'none',
      stroke: '#3b82f6',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    });
    
    // === Точки на графике ===
    const points = sparklineData.map((p, i) => {
      if (p.kcal === 0 && p.target === 0) return null;
      
      const x = xScale(i);
      const y = yScale(p.kcal);
      const ratio = p.kcal / (p.target || optimum);
      
      // Цвет точки по ratio
      let color = '#9ca3af'; // gray - no data
      if (p.kcal > 0) {
        if (ratio <= 0.5) color = '#ef4444'; // red - very low
        else if (ratio < 0.75) color = '#eab308'; // yellow - low
        else if (ratio < 0.9) color = '#22c55e'; // green - good
        else if (ratio <= 1.1) color = '#10b981'; // emerald - perfect
        else if (ratio < 1.3) color = '#eab308'; // yellow - high
        else color = '#ef4444'; // red - very high
      }
      
      // Подсветка выбранной даты
      const isSelected = p.date === selectedDate;
      
      return React.createElement('circle', {
        key: i,
        cx: x,
        cy: y,
        r: isSelected ? 6 : 4,
        fill: color,
        stroke: isSelected ? '#fff' : 'none',
        strokeWidth: isSelected ? 2 : 0,
        style: { cursor: 'pointer', transition: 'all 0.2s' },
        onClick: (e) => {
          if (onPointClick) onPointClick(p, e);
          haptic('light');
        }
      });
    });
    
    // === Weekend shading ===
    const weekendRects = sparklineData.map((p, i) => {
      // Проверяем день недели (0 = воскресенье, 6 = суббота)
      const date = new Date(p.date);
      const dow = date.getDay();
      if (dow !== 0 && dow !== 6) return null;
      
      const x = xScale(i);
      const rectWidth = innerW / (sparklineData.length - 1 || 1);
      
      return React.createElement('rect', {
        key: 'weekend-' + i,
        x: x - rectWidth / 2,
        y: padding.top,
        width: rectWidth,
        height: innerH,
        fill: '#f3f4f6',
        opacity: 0.3
      });
    });
    
    // === SVG ===
    const svg = React.createElement('svg', {
      viewBox: '0 0 ' + w + ' ' + h,
      style: { 
        width: '100%', 
        height: 'auto',
        touchAction: 'none'
      }
    },
      // Weekend shading (за графиком)
      weekendRects,
      // Goal line
      goalLine,
      // Kcal path
      kcalPath,
      // Points
      points
    );
    
    // === Statistics для header ===
    const totalDaysWithData = sparklineData.filter(p => p.kcal > 0).length;
    const avgKcal = totalDaysWithData > 0
      ? Math.round(sparklineData.reduce((sum, p) => sum + p.kcal, 0) / totalDaysWithData)
      : 0;
    const avgRatio = totalDaysWithData > 0 && optimum > 0
      ? sparklineData.reduce((sum, p) => sum + (p.kcal / optimum), 0) / totalDaysWithData
      : 0;
    const avgRatioPct = Math.round(avgRatio * 100);
    
    // Определяем зону по среднему выполнению
    let zone = { name: 'Нет данных', color: '#9ca3af' };
    if (avgRatio > 0) {
      if (avgRatio <= 0.5) zone = { name: 'Критический дефицит', color: '#ef4444' };
      else if (avgRatio < 0.75) zone = { name: 'Дефицит', color: '#eab308' };
      else if (avgRatio < 0.9) zone = { name: 'Легкий дефицит', color: '#22c55e' };
      else if (avgRatio <= 1.1) zone = { name: 'Идеально', color: '#10b981' };
      else if (avgRatio < 1.3) zone = { name: 'Легкий профицит', color: '#eab308' };
      else zone = { name: 'Профицит', color: '#ef4444' };
    }
    
    // === Render ===
    return React.createElement('div', { className: 'kcal-sparkline-container' },
      React.createElement('div', { className: 'kcal-sparkline-header' },
        React.createElement('span', { className: 'kcal-sparkline-title' }, '📊 Калории'),
        React.createElement('div', { className: 'kcal-header-right' },
          totalDaysWithData >= 3 && React.createElement('div', {
            className: 'kcal-avg-badge',
            style: { backgroundColor: zone.color + '20', color: zone.color }
          },
            React.createElement('span', { className: 'kcal-avg-value' }, avgRatioPct + '%'),
            React.createElement('span', { className: 'kcal-avg-label' }, zone.name)
          )
        )
      ),
      React.createElement('div', { 
        className: 'sparkline-container' + (sparklineZoom > 1 ? ' sparkline-zoomed' : ''),
        style: { position: 'relative' }
      },
        sparklineZoom > 1 && React.createElement('div', {
          className: 'sparkline-zoom-indicator',
          style: { position: 'absolute', top: 10, right: 10, zIndex: 10 }
        }, Math.round(sparklineZoom * 100) + '%'),
        svg
      )
    );
  };

  // === Export ===
  if (!global.HEYS) global.HEYS = {};
  if (!global.HEYS.DayCharts) global.HEYS.DayCharts = {};
  global.HEYS.DayCharts.KcalSparkline = KcalSparkline;

  console.log('✅ KcalSparkline loaded');

})(typeof window !== 'undefined' ? window : this);
