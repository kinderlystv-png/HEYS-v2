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

    function renderMiniSparkline({
        React,
        values,
        targets,
        width = 160,
        height = 42,
        stroke = '#60a5fa',
        targetStroke = '#94a3b8',
        padding = 4,
        className = ''
    }) {
        if (!React) return null;

        const linePoints = buildPolylinePoints(values, width, height, padding);
        const targetPoints = targets ? buildPolylinePoints(targets, width, height, padding) : '';

        return React.createElement('svg', {
            className: 'sparkline ' + className,
            width,
            height,
            viewBox: `0 0 ${width} ${height}`,
            role: 'img'
        },
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
                stroke,
                strokeWidth: 2,
                strokeLinecap: 'round',
                strokeLinejoin: 'round'
            })
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
