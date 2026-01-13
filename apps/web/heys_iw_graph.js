// heys_iw_graph.js — InsulinWave Graph Module  
// Версия: 1.0.0 | Дата: 2026-01-12
//
// ОПИСАНИЕ:
// Модуль SVG-визуализации инсулиновой волны с 3-компонентной Gaussian моделью.
// Выделен из heys_insulin_wave_v1.js для улучшения модульности.
//
// ФУНКЦИИ:
// - renderWaveChart() — рендер SVG графика с текущей позицией
// - Поддержка 3-peak модели (fast, slow, hepatic компоненты)
// - Fallback на однопиковую модель для backward compatibility
//
// Научная база: Multi-component Gaussian insulin response model

(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // === SVG ГРАФИК ВОЛНЫ (выносим наружу для использования в основной карточке) ===
  const renderWaveChart = (data) => {
    if (!data || data.remaining <= 0) return null; // Не показываем если волна завершена
    // 🆕 v3.0.0: Защита от undefined insulinWaveHours
    if (!data.insulinWaveHours || data.insulinWaveHours <= 0) return null;
    
    const width = 280;
    const height = 80;
    const padding = { left: 25, right: 10, top: 10, bottom: 20 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    
    // Данные волны
    const totalMinutes = data.insulinWaveHours * 60;
    const elapsedMinutes = totalMinutes - data.remaining;
    const progress = Math.min(1, elapsedMinutes / totalMinutes); // 0-1
    
    // 🆕 v4.1.0: Используем научную 3-компонентную Gaussian кривую если доступна
    const generateWavePath = () => {
      const points = [];
      
      // Если есть curve из calculateInsulinWaveData — используем её (3-peak Gaussian)
      if (data.curve && Array.isArray(data.curve) && data.curve.length > 0) {
        // data.curve: массив {t, y, components: {fast, slow, hepatic}} 
        // t уже нормализован 0-1 в generateWaveCurve()
        const curveData = data.curve;
        const maxY = Math.max(...curveData.map(p => p.y || p.value || 0), 0.01);
        
        curveData.forEach(point => {
          const tNorm = point.t || 0; // t уже 0-1, НЕ делим на totalMinutes!
          const yNorm = (point.y || point.value || 0) / maxY; // нормализуем по высоте
          const x = padding.left + tNorm * chartW;
          const yPx = padding.top + chartH * (1 - yNorm);
          
          // 🆕 v4.1.0: Сохраняем компоненты для 3-peak визуализации
          const components = point.components || {};
          const fastNorm = (components.fast || 0) / maxY;
          const slowNorm = (components.slow || 0) / maxY;
          const hepaticNorm = (components.hepatic || 0) / maxY;
          
          points.push({ 
            x, y: yPx, t: tNorm, value: yNorm,
            // Компоненты в пикселях Y
            fastY: padding.top + chartH * (1 - fastNorm),
            slowY: padding.top + chartH * (1 - slowNorm),
            hepaticY: padding.top + chartH * (1 - hepaticNorm)
          });
        });
        
        return points;
      }
      
      // Fallback: старая однопиковая модель (для backwards compatibility)
      const gi = data.avgGI || 50;
      const peakPosition = gi >= 70 ? 0.15 : gi <= 40 ? 0.35 : 0.25;
      const peakHeight = gi >= 70 ? 0.95 : gi <= 40 ? 0.7 : 0.85;
      const steps = 50;
      
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        let y;
        if (t <= peakPosition) {
          const tNorm = t / peakPosition;
          y = peakHeight * Math.pow(tNorm, 1.5);
        } else {
          const tNorm = (t - peakPosition) / (1 - peakPosition);
          y = peakHeight * Math.exp(-2.5 * tNorm);
        }
        const x = padding.left + t * chartW;
        const yPx = padding.top + chartH * (1 - y);
        points.push({ x, y: yPx, t, value: y });
      }
      return points;
    };
    
    const wavePoints = generateWavePath();
    // 🆕 v3.0.0: Защита от пустого массива точек
    if (!wavePoints || wavePoints.length === 0) return null;
    
    const pathD = wavePoints.map((p, i) => 
      `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
    ).join(' ');
    const fillPathD = `${pathD} L ${padding.left + chartW} ${padding.top + chartH} L ${padding.left} ${padding.top + chartH} Z`;
    
    // 🆕 v4.1.0: Генерация путей для 3-компонентной визуализации
    const hasComponents = wavePoints[0]?.fastY !== undefined;
    let fastPathD = '', slowPathD = '', hepaticPathD = '';
    
    if (hasComponents) {
      fastPathD = wavePoints.map((p, i) => 
        `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.fastY.toFixed(1)}`
      ).join(' ');
      
      slowPathD = wavePoints.map((p, i) => 
        `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.slowY.toFixed(1)}`
      ).join(' ');
      
      hepaticPathD = wavePoints.map((p, i) => 
        `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.hepaticY.toFixed(1)}`
      ).join(' ');
    }
    
    const currentIdx = Math.round(progress * (wavePoints.length - 1));
    const currentPoint = wavePoints[Math.min(currentIdx, wavePoints.length - 1)];
    // 🆕 v3.0.0: Защита от undefined currentPoint
    if (!currentPoint) return null;
    
    // 🆕 v4.1.2: Позиции пиков для 3-компонентной модели (сноски на графике)
    let fastPeak = null, slowPeak = null, hepaticPeak = null;
    if (hasComponents && wavePoints.length > 5) {
      let fastMinY = Infinity, slowMinY = Infinity, hepaticMinY = Infinity;
      wavePoints.forEach((p) => {
        // Fast peak: t ≈ 0.15-0.25 (быстрые углеводы)
        if (p.t >= 0.10 && p.t <= 0.35 && p.fastY < fastMinY) { 
          fastMinY = p.fastY; fastPeak = { x: p.x, y: p.y, t: p.t }; 
        }
        // Slow/Main peak: t ≈ 0.40-0.50 (основной инсулиновый ответ)
        if (p.t >= 0.30 && p.t <= 0.60 && p.slowY < slowMinY) { 
          slowMinY = p.slowY; slowPeak = { x: p.x, y: p.y, t: p.t }; 
        }
        // Hepatic peak: t ≈ 0.65-0.75 (печёночный хвост)
        if (p.t >= 0.55 && p.t <= 0.85 && p.hepaticY < hepaticMinY) { 
          hepaticMinY = p.hepaticY; hepaticPeak = { x: p.x, y: p.y, t: p.t }; 
        }
      });
    }
    
    // Время начала и конца волны
    const startTime = data.lastMealTimeDisplay || data.lastMealTime || '';
    const endTime = data.endTimeDisplay || data.endTime || '';
    
    return React.createElement('div', {
      style: {
        background: 'rgba(255,255,255,0.15)',
        borderRadius: '12px',
        padding: '8px',
        marginTop: '12px'
      }
    },
      React.createElement('svg', {
        width: '100%',
        height: height,
        viewBox: `0 0 ${width} ${height}`,
        style: { display: 'block' }
      },
        // Градиенты
        React.createElement('defs', null,
          React.createElement('linearGradient', { id: 'waveGradientMain', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#fff', stopOpacity: 0.4 }),
            React.createElement('stop', { offset: '100%', stopColor: '#fff', stopOpacity: 0.1 })
          ),
          // 🆕 v4.1.0: Градиенты для 3-компонентной визуализации
          React.createElement('linearGradient', { id: 'waveGradientFast', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#f97316', stopOpacity: 0.5 }),
            React.createElement('stop', { offset: '100%', stopColor: '#f97316', stopOpacity: 0.1 })
          ),
          React.createElement('linearGradient', { id: 'waveGradientSlow', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#22c55e', stopOpacity: 0.5 }),
            React.createElement('stop', { offset: '100%', stopColor: '#22c55e', stopOpacity: 0.1 })
          ),
          React.createElement('linearGradient', { id: 'waveGradientHepatic', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#8b5cf6', stopOpacity: 0.5 }),
            React.createElement('stop', { offset: '100%', stopColor: '#8b5cf6', stopOpacity: 0.1 })
          )
        ),
        // Базовая линия
        React.createElement('line', {
          x1: padding.left, y1: padding.top + chartH,
          x2: padding.left + chartW, y2: padding.top + chartH,
          stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1
        }),
        
        // === Пунктирная линия НАЧАЛА (время приёма пищи) ===
        React.createElement('line', {
          x1: padding.left, y1: padding.top - 5,
          x2: padding.left, y2: padding.top + chartH + 5,
          stroke: 'rgba(255,255,255,0.5)', strokeWidth: 1, strokeDasharray: '3,2'
        }),
        // Время начала
        React.createElement('text', {
          x: padding.left, y: height - 2,
          fontSize: 9, fill: 'rgba(255,255,255,0.9)', textAnchor: 'middle', fontWeight: 500
        }, '🍽️ ' + startTime),
        
        // === Пунктирная линия КОНЦА (время окончания волны) ===
        React.createElement('line', {
          x1: padding.left + chartW, y1: padding.top - 5,
          x2: padding.left + chartW, y2: padding.top + chartH + 5,
          stroke: 'rgba(255,255,255,0.5)', strokeWidth: 1, strokeDasharray: '3,2'
        }),
        // Время конца
        React.createElement('text', {
          x: padding.left + chartW, y: height - 2,
          fontSize: 9, fill: 'rgba(255,255,255,0.9)', textAnchor: 'middle', fontWeight: 500
        }, '🔥 ' + endTime),
        
        // Заливка под кривой (суммарная)
        React.createElement('path', { d: fillPathD, fill: 'url(#waveGradientMain)' }),
        
        // === ОДНА суммарная линия волны с 3 пиками ===
        // (компоненты объединены в суммарную кривую — 3 пика видны как "холмики")
        React.createElement('path', {
          d: pathD, fill: 'none', stroke: 'rgba(255,255,255,0.95)',
          strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round'
        }),
        
        // 🆕 v4.1.3: Маркеры пиков компонентов (увеличенные эмодзи)
        fastPeak && React.createElement('g', { key: 'fastPeak' },
          React.createElement('circle', {
            cx: fastPeak.x, cy: fastPeak.y, r: 6,
            fill: '#f97316', stroke: '#fff', strokeWidth: 1.5
          }),
          React.createElement('text', {
            x: fastPeak.x, y: fastPeak.y - 10,
            fontSize: 11, fill: '#f97316', textAnchor: 'middle', fontWeight: 700
          }, '⚡')
        ),
        slowPeak && React.createElement('g', { key: 'slowPeak' },
          React.createElement('circle', {
            cx: slowPeak.x, cy: slowPeak.y, r: 6,
            fill: '#22c55e', stroke: '#fff', strokeWidth: 1.5
          }),
          React.createElement('text', {
            x: slowPeak.x, y: slowPeak.y - 10,
            fontSize: 11, fill: '#22c55e', textAnchor: 'middle', fontWeight: 700
          }, '🌿')
        ),
        hepaticPeak && React.createElement('g', { key: 'hepaticPeak' },
          React.createElement('circle', {
            cx: hepaticPeak.x, cy: hepaticPeak.y, r: 6,
            fill: '#8b5cf6', stroke: '#fff', strokeWidth: 1.5
          }),
          React.createElement('text', {
            x: hepaticPeak.x, y: hepaticPeak.y - 10,
            fontSize: 11, fill: '#8b5cf6', textAnchor: 'middle', fontWeight: 700
          }, '🫀')
        ),
        
        // Вертикальная линия текущей позиции
        React.createElement('line', {
          x1: currentPoint.x, y1: padding.top,
          x2: currentPoint.x, y2: padding.top + chartH,
          stroke: '#fff', strokeWidth: 1.5, strokeDasharray: '3,3'
        }),
        // Точка текущей позиции
        React.createElement('circle', {
          cx: currentPoint.x, cy: currentPoint.y, r: 5,
          fill: '#fff', stroke: 'rgba(0,0,0,0.2)', strokeWidth: 1.5
        }),
        // Пульсирующий круг
        React.createElement('circle', {
          cx: currentPoint.x, cy: currentPoint.y, r: 9,
          fill: 'none', stroke: '#fff', strokeWidth: 1, opacity: 0.5,
          style: { animation: 'pulse 2s ease-in-out infinite' }
        }),
        // Подпись "сейчас"
        React.createElement('text', {
          x: currentPoint.x, y: padding.top - 2,
          fontSize: 9, fill: '#fff', textAnchor: 'middle', fontWeight: 600
        }, 'сейчас')
      )
    );
  };

  
  // === ЭКСПОРТ ===
  HEYS.InsulinWave = HEYS.InsulinWave || {};
  HEYS.InsulinWave.Graph = {
    renderWaveChart
  };
  
})(typeof window !== 'undefined' ? window : global);
