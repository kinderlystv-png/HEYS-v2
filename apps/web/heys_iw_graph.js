// heys_iw_graph.js — qualitative postprandial response profile
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  function renderWaveChart(data) {
    if (!React || !data) return null;
    const profile = Array.isArray(data.responseProfile) ? data.responseProfile : data.curve;
    if (!Array.isArray(profile) || profile.length < 2) return null;

    const width = 280;
    const height = 78;
    const padding = { left: 12, right: 12, top: 8, bottom: 20 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const points = profile.map((point) => {
      const t = Math.max(0, Math.min(1, Number(point.t) || 0));
      const value = Math.max(0, Math.min(1, Number(point.value ?? point.y) || 0));
      return {
        x: padding.left + t * chartWidth,
        y: padding.top + (1 - value) * chartHeight,
      };
    });
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const fill = `${path} L ${padding.left + chartWidth} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`;
    const progress = Math.max(0, Math.min(1, (Number(data.progress) || 0) / 100));
    const marker = points[Math.min(points.length - 1, Math.round(progress * (points.length - 1)))];

    return React.createElement('div', { className: 'iw-response-chart', style: { marginTop: '10px' } },
      React.createElement('svg', {
        width: '100%',
        height,
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': 'Качественный профиль постпрандиального отклика',
      },
        React.createElement('defs', null,
          React.createElement('linearGradient', { id: 'iwResponseFill', x1: '0', y1: '0', x2: '0', y2: '1' },
            React.createElement('stop', { offset: '0%', stopColor: '#2F6BFF', stopOpacity: '0.24' }),
            React.createElement('stop', { offset: '100%', stopColor: '#2F6BFF', stopOpacity: '0.03' })
          )
        ),
        React.createElement('path', { d: fill, fill: 'url(#iwResponseFill)' }),
        React.createElement('path', { d: path, fill: 'none', stroke: '#2F6BFF', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        data.status !== 'complete' && marker && React.createElement('circle', { cx: marker.x, cy: marker.y, r: 4, fill: '#ffffff', stroke: '#2F6BFF', strokeWidth: 2 }),
        React.createElement('text', { x: padding.left, y: height - 4, fontSize: 9, fill: '#7A8BA3' }, 'после еды'),
        React.createElement('text', { x: width - padding.right, y: height - 4, fontSize: 9, fill: '#7A8BA3', textAnchor: 'end' }, 'ориентир завершения')
      ),
      React.createElement('div', { style: { fontSize: '10px', lineHeight: 1.4, color: '#7A8BA3' } },
        'Схема показывает относительную форму отклика, а не уровень гормонов или глюкозы.'
      )
    );
  }

  HEYS.InsulinWave = HEYS.InsulinWave || {};
  HEYS.InsulinWave.Graph = { renderWaveChart, VERSION: '5.0.0' };
})(typeof window !== 'undefined' ? window : globalThis);
