// heys_day_measurements_v1.js — measurements helpers/state for DayTab
;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  const MOD = {};

  MOD.useMeasurementsState = function useMeasurementsState({
    React,
    day,
    date,
    setDay,
    HEYS: heysGlobal
  }) {
    const { useMemo, useCallback } = React;
    const HEYSRef = heysGlobal || HEYS;

    const measurementFields = useMemo(() => ([
      { key: 'waist', label: 'Обхват талии', icon: '📏' },
      { key: 'hips', label: 'Обхват бёдер', icon: '🍑' },
      { key: 'thigh', label: 'Обхват бедра', icon: '🦵' },
      { key: 'biceps', label: 'Обхват бицепса', icon: '💪' }
    ]), []);

    const measurementsHistory = useMemo(() => {
      try {
        const history = HEYSRef.Steps?.getMeasurementsHistory ? HEYSRef.Steps.getMeasurementsHistory(90) : [];
        return Array.isArray(history) ? history : [];
      } catch (e) {
        return [];
      }
    }, [date, day.updatedAt, HEYSRef.Steps]);

    const measurementsByField = useMemo(() => {
      const current = day.measurements || {};
      return measurementFields.map((f) => {
        const points = [];
        (measurementsHistory || []).forEach((entry) => {
          const val = entry[f.key];
          if (val !== null && val !== undefined && !Number.isNaN(+val)) {
            points.push({ value: +val, date: entry.date || entry.measuredAt });
          }
        });

        const latest = points[0] || null;
        const prev = points[1] || null;
        const value = (current[f.key] !== null && current[f.key] !== undefined && !Number.isNaN(+current[f.key]))
          ? +current[f.key]
          : latest ? latest.value : null;
        const prevValue = prev ? prev.value : null;
        const delta = (value !== null && prevValue !== null) ? value - prevValue : null;
        const deltaPct = (value !== null && prevValue && prevValue !== 0) ? delta / prevValue : null;
        const warn = deltaPct !== null && Math.abs(deltaPct) > 0.15;

        return {
          ...f,
          value,
          prevValue,
          delta,
          deltaPct,
          warn,
          points: points.slice(0, 8)
        };
      });
    }, [measurementFields, measurementsHistory, day.measurements]);

    const measurementsLastDate = useMemo(() => {
      if (!measurementsHistory || measurementsHistory.length === 0) return null;
      return measurementsHistory[0].date || measurementsHistory[0].measuredAt || null;
    }, [measurementsHistory]);

    const measurementsLastDateFormatted = useMemo(() => {
      if (!measurementsLastDate) return null;
      const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      const lastDate = new Date(measurementsLastDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastDateNorm = new Date(lastDate);
      lastDateNorm.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today - lastDateNorm) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'сегодня';
      if (diffDays === 1) return 'вчера';
      if (diffDays === 2) return 'позавчера';
      return `${lastDate.getDate()} ${months[lastDate.getMonth()]}`;
    }, [measurementsLastDate]);

    const measurementsNeedUpdate = useMemo(() => {
      if (!measurementsLastDate) return true;
      const lastDate = new Date(measurementsLastDate);
      const today = new Date();
      const diffDays = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));
      return diffDays >= 7;
    }, [measurementsLastDate]);

    const measurementsMonthlyProgress = useMemo(() => {
      if (!measurementsHistory || measurementsHistory.length < 2) return null;

      const results = [];
      measurementFields.forEach(f => {
        const values = measurementsHistory
          .filter(h => h[f.key] != null)
          .map(h => ({ value: +h[f.key], date: h.date || h.measuredAt }));

        if (values.length >= 2) {
          const newest = values[0].value;
          const oldest = values[values.length - 1].value;
          const diff = newest - oldest;
          if (Math.abs(diff) >= 0.5) {
            results.push({ label: f.label.toLowerCase(), diff: Math.round(diff * 10) / 10 });
          }
        }
      });

      return results.length > 0 ? results : null;
    }, [measurementsHistory, measurementFields]);

    const openMeasurementsEditor = useCallback(() => {
      if (HEYSRef.showCheckin?.measurements) {
        HEYSRef.showCheckin.measurements(date, (stepData) => {
          const m = stepData?.measurements;
          if (m && (m.waist || m.hips || m.thigh || m.biceps)) {
            setDay(prev => ({
              ...prev,
              measurements: {
                waist: m.waist ?? null,
                hips: m.hips ?? null,
                thigh: m.thigh ?? null,
                biceps: m.biceps ?? null,
                measuredAt: date
              },
              updatedAt: Date.now()
            }));
          }
        });
      } else if (HEYSRef.StepModal?.show) {
        HEYSRef.StepModal.show({
          steps: ['measurements'],
          context: { dateKey: date }
        });
      }
    }, [HEYSRef, date, setDay]);

    const formatShortDate = useCallback((dateStr) => {
      if (!dateStr) return '';
      const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'нояб', 'дек'];
      const d = new Date(dateStr);
      return `${d.getDate()} ${months[d.getMonth()]}`;
    }, []);

    const renderMeasurementSpark = useCallback((points) => {
      if (!points || points.length < 2) return null;

      const reversed = [...points].reverse();
      const values = reversed.map(p => p.value);
      const dates = reversed.map(p => formatShortDate(p.date));

      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const width = 100;
      const height = 20;
      const padding = 8;
      const step = reversed.length > 1 ? (width - padding * 2) / (reversed.length - 1) : 0;

      const pointCoords = values.map((v, idx) => ({
        x: padding + idx * step,
        y: height - ((v - min) / span) * (height - 6) - 3
      }));

      const svgPoints = pointCoords.map(p => `${p.x},${p.y}`).join(' ');
      const datePositions = pointCoords.map(p => p.x);

      return React.createElement('div', { className: 'measurement-spark-container' },
        React.createElement('svg', { className: 'measurement-spark', viewBox: '0 0 100 20' },
          pointCoords.map((p, idx) =>
            React.createElement('line', {
              key: 'grid-' + idx,
              x1: p.x,
              y1: 0,
              x2: p.x,
              y2: height,
              stroke: '#e5e7eb',
              strokeWidth: 0.5,
              strokeDasharray: '1,2'
            })
          ),
          React.createElement('polyline', {
            points: svgPoints,
            fill: 'none',
            stroke: 'var(--acc, #3b82f6)',
            strokeWidth: 1.5,
            strokeLinecap: 'round',
            strokeLinejoin: 'round'
          }),
          pointCoords.map((p, idx) =>
            React.createElement('circle', {
              key: 'dot-' + idx,
              cx: p.x,
              cy: p.y,
              r: 2.5,
              fill: idx === pointCoords.length - 1 ? 'var(--acc, #3b82f6)' : '#fff',
              stroke: 'var(--acc, #3b82f6)',
              strokeWidth: 1
            })
          )
        ),
        React.createElement('div', { className: 'measurement-spark-dates' },
          dates.map((d, idx) =>
            React.createElement('span', {
              key: 'date-' + idx,
              className: 'measurement-spark-date-label',
              style: { left: `${datePositions[idx]}%`, transform: 'translateX(-50%)' }
            }, d)
          )
        )
      );
    }, [formatShortDate, React]);

    return {
      measurementFields,
      measurementsHistory,
      measurementsByField,
      measurementsLastDateFormatted,
      measurementsNeedUpdate,
      measurementsMonthlyProgress,
      openMeasurementsEditor,
      renderMeasurementSpark
    };
  };

  HEYS.dayMeasurements = MOD;
})(window);
