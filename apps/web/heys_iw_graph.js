// heys_iw_graph.js — qualitative postprandial response profile
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  function interpolateMarker(points, progress) {
    if (!Array.isArray(points) || points.length === 0) return null;
    const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
    if (points.every((point) => Number.isFinite(point.t))) {
      const upperIndex = points.findIndex((point) => point.t >= normalized);
      if (upperIndex <= 0) return { x: points[0].x, y: points[0].y };
      if (upperIndex === -1) {
        const last = points[points.length - 1];
        return { x: last.x, y: last.y };
      }
      const lower = points[upperIndex - 1];
      const upper = points[upperIndex];
      const span = Math.max(Number.EPSILON, upper.t - lower.t);
      const ratio = (normalized - lower.t) / span;
      return {
        x: lower.x + (upper.x - lower.x) * ratio,
        y: lower.y + (upper.y - lower.y) * ratio,
      };
    }
    const scaledIndex = normalized * (points.length - 1);
    const lowerIndex = Math.floor(scaledIndex);
    const upperIndex = Math.min(points.length - 1, Math.ceil(scaledIndex));
    const ratio = scaledIndex - lowerIndex;
    const lower = points[lowerIndex];
    const upper = points[upperIndex];
    return {
      x: lower.x + (upper.x - lower.x) * ratio,
      y: lower.y + (upper.y - lower.y) * ratio,
    };
  }

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
        t,
        x: padding.left + t * chartWidth,
        y: padding.top + (1 - value) * chartHeight,
      };
    });
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const fill = `${path} L ${padding.left + chartWidth} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`;
    const progress = Math.max(0, Math.min(1, (Number(data.rangeProgress ?? data.progress) || 0) / 100));
    const marker = interpolateMarker(points, progress);

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
          ),
          React.createElement('filter', { id: 'iwCurrentMarkerGlow', x: '-60%', y: '-60%', width: '220%', height: '220%' },
            React.createElement('feDropShadow', { dx: 0, dy: 1, stdDeviation: 2.2, floodColor: '#1D70B7', floodOpacity: 0.68 })
          )
        ),
        React.createElement('path', { d: fill, fill: 'url(#iwResponseFill)' }),
        React.createElement('path', { d: path, fill: 'none', stroke: '#2F6BFF', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        data.status !== 'complete' && marker && React.createElement('g', { className: 'iw-response-chart__current-marker' },
          React.createElement('circle', { cx: marker.x, cy: marker.y, r: 9, fill: '#52A0D8', fillOpacity: 0.22 }),
          React.createElement('circle', {
            cx: marker.x, cy: marker.y, r: 5.5, fill: '#2F6BFF', stroke: '#ffffff', strokeWidth: 2.5,
            filter: 'url(#iwCurrentMarkerGlow)',
          }),
          React.createElement('circle', { cx: marker.x, cy: marker.y, r: 1.6, fill: '#ffffff' })
        ),
        React.createElement('text', { x: padding.left, y: height - 4, fontSize: 9, fill: '#7A8BA3' }, 'после еды'),
        React.createElement('text', { x: width - padding.right, y: height - 4, fontSize: 9, fill: '#7A8BA3', textAnchor: 'end' }, 'ориентир завершения')
      )
    );
  }

  HEYS.InsulinWave = HEYS.InsulinWave || {};
  HEYS.InsulinWave.Graph = { renderWaveChart, interpolateMarker, VERSION: '5.0.1' };
})(typeof window !== 'undefined' ? window : globalThis);
