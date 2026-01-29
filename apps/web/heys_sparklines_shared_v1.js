// heys_sparklines_shared_v1.js — Shared sparkline helpers (mini charts)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function toISODate(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    function getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay(); // 0=Sun..6=Sat
        const diff = (day + 6) % 7; // days since Monday
        d.setDate(d.getDate() - diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function getWeekDates(anchorDate) {
        const start = getWeekStart(anchorDate);
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            dates.push(toISODate(d));
        }
        return dates;
    }

    function formatDateRange(dates) {
        if (!dates || dates.length === 0) return '';
        const first = new Date(dates[0]);
        const last = new Date(dates[dates.length - 1]);
        const fmt = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        return fmt(first) + ' — ' + fmt(last);
    }

    function getByPath(obj, path) {
        if (!path) return undefined;
        const parts = String(path).split('.');
        let cur = obj;
        for (const p of parts) {
            if (!cur) return undefined;
            cur = cur[p];
        }
        return cur;
    }

    function buildSeriesFromRows(rows, options = {}) {
        const {
            valueKey,
            targetKey,
            valueGetter,
            targetGetter,
            dateKey = 'dstr'
        } = options;

        const values = (rows || []).map((row) => {
            if (valueGetter) return valueGetter(row);
            return getByPath(row, valueKey);
        });

        const targets = targetKey || targetGetter
            ? (rows || []).map((row) => {
                if (targetGetter) return targetGetter(row);
                return getByPath(row, targetKey);
            })
            : null;

        const labels = (rows || []).map((row) => row?.[dateKey] || '');

        return { values, targets, labels };
    }

    function normalizeValues(values) {
        const clean = (values || []).filter((v) => Number.isFinite(v));
        if (!clean.length) return { min: 0, max: 1 };
        const min = Math.min.apply(null, clean);
        const max = Math.max.apply(null, clean);
        return { min, max: min === max ? min + 1 : max };
    }

    function buildPolylinePoints(values, width, height, padding) {
        const safeValues = (values || []).map((v) => (Number.isFinite(v) ? v : null));
        const { min, max } = normalizeValues(safeValues);
        const span = max - min || 1;
        const step = (width - padding * 2) / Math.max(1, safeValues.length - 1);

        const points = [];
        safeValues.forEach((v, i) => {
            if (v == null) return;
            const x = padding + i * step;
            const y = padding + (height - padding * 2) - ((v - min) / span) * (height - padding * 2);
            points.push(x + ',' + y);
        });

        return points.join(' ');
    }

    function buildPolylinePointArray(values, width, height, padding) {
        const safeValues = (values || []).map((v) => (Number.isFinite(v) ? v : null));
        const { min, max } = normalizeValues(safeValues);
        const span = max - min || 1;
        const step = (width - padding * 2) / Math.max(1, safeValues.length - 1);

        return safeValues.map((v, i) => {
            if (v == null) return null;
            const x = padding + i * step;
            const y = padding + (height - padding * 2) - ((v - min) / span) * (height - padding * 2);
            return { x, y, v, i };
        }).filter(Boolean);
    }

    let sparklineGradientId = 0;

    function renderMiniSparkline({
        React,
        values,
        targets,
        width = 160,
        height = 42,
        stroke = '#60a5fa',
        targetStroke = '#94a3b8',
        padding = 4,
        className = '',
        useTargetGradient = false,
        aboveStroke = '#ef4444',
        belowStroke = '#22c55e',
        fillTargetGradient = false,
        aboveFill = 'rgba(239, 68, 68, 0.18)',
        belowFill = 'rgba(34, 197, 94, 0.18)',
        showPeakDots = false,
        peakDotRadius = 3.4,
        perfectDotRadius = 3.9,
        perfectEps = 0.04,
        perfectDotColor = '#f59e0b',
        peakAboveColor = '#dc2626',
        peakBelowColor = '#16a34a'
    }) {
        if (!React) return null;

        const linePoints = buildPolylinePoints(values, width, height, padding);
        const targetPoints = targets ? buildPolylinePoints(targets, width, height, padding) : '';
        const gradId = useTargetGradient ? ('sparkline-grad-' + (++sparklineGradientId)) : null;
        const fillGradId = fillTargetGradient ? ('sparkline-fill-grad-' + (++sparklineGradientId)) : null;
        const pointsArr = (useTargetGradient || showPeakDots) ? buildPolylinePointArray(values, width, height, padding) : [];
        const hasTargets = useTargetGradient && Array.isArray(targets) && targets.length === (values || []).length;
        const gradientStops = [];
        const fillStops = [];
        const peakDots = [];
        const peakTargetsValid = Array.isArray(targets) && targets.length === (values || []).length;

        if (useTargetGradient && hasTargets && pointsArr.length > 0) {
            let prevColor = null;
            let prevOffset = null;
            pointsArr.forEach((pt) => {
                const target = targets[pt.i];
                if (!Number.isFinite(target)) return;
                const color = pt.v > target ? aboveStroke : belowStroke;
                const fillColor = pt.v > target ? aboveFill : belowFill;
                const offset = Math.min(1, Math.max(0, (pt.x - padding) / Math.max(1, width - padding * 2)));

                if (prevColor && color !== prevColor && prevOffset != null) {
                    const mid = (prevOffset + offset) / 2;
                    const delta = Math.min(0.02, Math.abs(offset - prevOffset) / 2);
                    gradientStops.push({ offset: Math.max(0, mid - delta), color: prevColor });
                    gradientStops.push({ offset: Math.min(1, mid + delta), color });
                }

                gradientStops.push({ offset, color });
                fillStops.push({ offset, color: fillColor });
                prevColor = color;
                prevOffset = offset;
            });
        }

        const areaPath = (() => {
            if (!fillTargetGradient || !pointsArr.length) return '';
            const baseline = height - padding;
            const first = pointsArr[0];
            const last = pointsArr[pointsArr.length - 1];
            const linePath = pointsArr.map((pt) => `${pt.x},${pt.y}`).join(' ');
            return `M ${first.x},${baseline} L ${linePath} L ${last.x},${baseline} Z`;
        })();

        if (showPeakDots && pointsArr.length >= 2) {
            const lastIdx = pointsArr.length - 1;
            for (let i = 0; i <= lastIdx; i += 1) {
                const prev = pointsArr[i - 1];
                const cur = pointsArr[i];
                const next = pointsArr[i + 1];
                if (!cur) continue;

                let isPeak = false;
                let isTrough = false;
                if (i === 0 && next) {
                    isPeak = cur.v >= next.v;
                    isTrough = cur.v <= next.v;
                } else if (i === lastIdx && prev) {
                    isPeak = cur.v >= prev.v;
                    isTrough = cur.v <= prev.v;
                } else if (prev && next) {
                    isPeak = cur.v >= prev.v && cur.v >= next.v;
                    isTrough = cur.v <= prev.v && cur.v <= next.v;
                }

                if (!(isPeak || isTrough)) continue;

                const target = peakTargetsValid ? targets[cur.i] : null;
                const isPerfect = Number.isFinite(target) && target > 0
                    ? Math.abs(cur.v - target) / target <= perfectEps
                    : false;
                const dotColor = isPerfect
                    ? perfectDotColor
                    : (Number.isFinite(target) && cur.v > target ? peakAboveColor : peakBelowColor);
                peakDots.push({
                    x: cur.x,
                    y: cur.y,
                    r: isPerfect ? perfectDotRadius : peakDotRadius,
                    color: dotColor,
                    isPerfect
                });
            }
        }

        return React.createElement('svg', {
            className: 'sparkline ' + className,
            width,
            height,
            viewBox: `0 0 ${width} ${height}`,
            role: 'img'
        },
            (useTargetGradient && hasTargets && gradientStops.length) || (fillTargetGradient && hasTargets && fillStops.length)
                ? React.createElement('defs', null,
                    useTargetGradient && gradientStops.length ? React.createElement('linearGradient', {
                        id: gradId,
                        x1: '0',
                        y1: '0',
                        x2: '1',
                        y2: '0'
                    },
                        gradientStops.map((stop, idx) => React.createElement('stop', {
                            key: `${gradId}-${idx}`,
                            offset: `${Math.round(stop.offset * 1000) / 10}%`,
                            stopColor: stop.color
                        }))
                    ) : null,
                    fillTargetGradient && fillStops.length ? React.createElement('linearGradient', {
                        id: fillGradId,
                        x1: '0',
                        y1: '0',
                        x2: '1',
                        y2: '0'
                    },
                        fillStops.map((stop, idx) => React.createElement('stop', {
                            key: `${fillGradId}-${idx}`,
                            offset: `${Math.round(stop.offset * 1000) / 10}%`,
                            stopColor: stop.color
                        }))
                    ) : null
                )
                : null,
            fillTargetGradient && hasTargets && areaPath ? React.createElement('path', {
                d: areaPath,
                fill: fillStops.length ? `url(#${fillGradId})` : 'transparent',
                stroke: 'none'
            }) : null,
            targetPoints ? React.createElement('polyline', {
                points: targetPoints,
                fill: 'none',
                stroke: targetStroke,
                strokeWidth: 1,
                strokeDasharray: '4 3'
            }) : null,
            React.createElement('polyline', {
                points: linePoints,
                fill: 'none',
                stroke: useTargetGradient && hasTargets && gradientStops.length ? `url(#${gradId})` : stroke,
                strokeWidth: 2,
                strokeLinecap: 'round',
                strokeLinejoin: 'round'
            }),
            showPeakDots && peakDots.length
                ? peakDots.map((dot, idx) => React.createElement('circle', {
                    key: `peak-${idx}`,
                    cx: dot.x,
                    cy: dot.y,
                    r: dot.r,
                    fill: dot.color,
                    stroke: '#ffffff',
                    strokeWidth: dot.isPerfect ? 1.4 : 1.2
                }))
                : null
        );
    }

    function renderMetricSparkline({
        React,
        title,
        subtitle,
        values,
        targets,
        valueLabel,
        className = ''
    }) {
        if (!React) return null;

        return React.createElement('div', { className: 'sparkline-metric ' + className },
            React.createElement('div', { className: 'sparkline-metric__header' },
                React.createElement('div', { className: 'sparkline-metric__title' }, title || ''),
                valueLabel ? React.createElement('div', { className: 'sparkline-metric__value' }, valueLabel) : null
            ),
            subtitle ? React.createElement('div', { className: 'sparkline-metric__subtitle' }, subtitle) : null,
            renderMiniSparkline({
                React,
                values,
                targets,
                className: 'sparkline-metric__chart'
            })
        );
    }

    HEYS.SparklinesShared = {
        getWeekDates,
        formatDateRange,
        buildSeriesFromRows,
        renderMiniSparkline,
        renderMetricSparkline
    };
})(window);
