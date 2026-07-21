// heys_day_insulin_wave_data_v1.js — DayTab adapter for the canonical response model
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.dayInsulinWaveData = HEYS.dayInsulinWaveData || {};

  const loadingState = (meals) => Array.isArray(meals) && meals.some((meal) => meal?.time) ? {
    status: 'loading',
    statusLabel: 'Уточняем расчёт после еды',
    text: 'Загрузка…',
    subtext: 'Расчёт появится после загрузки модели.',
    progress: 0,
    remaining: 0,
    waveHistory: [],
    overlaps: [],
    hasOverlaps: false,
    confidence: { score: 0, level: 'low', label: 'Модель загружается', dataQuality: { missingFields: [], assumptions: [] } },
  } : null;

  const previousDate = (iso) => {
    const date = new Date(`${iso}T12:00:00`);
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  };

  HEYS.dayInsulinWaveData.computeInsulinWaveData = function computeInsulinWaveData(ctx) {
    const {
      React,
      day,
      pIndex,
      getProductFromItem,
      getProfile,
      lsGet,
      currentMinute,
      HEYS: providedHEYS,
    } = ctx || {};
    if (!React?.useState || !React?.useEffect || !React?.useMemo) return null;

    const HEYSRef = providedHEYS || global.HEYS || {};
    const safeDay = day || {};
    const [iwVersion, setIwVersion] = React.useState(() => HEYSRef.InsulinWave?.calculate ? 1 : 0);

    React.useEffect(() => {
      if (HEYSRef.InsulinWave?.calculate) {
        setIwVersion((value) => value || 1);
        return undefined;
      }
      if (typeof document === 'undefined') return undefined;
      const onReady = () => setIwVersion((value) => value + 1);
      document.addEventListener('heys-insulinwave-ready', onReady, { once: true });
      return () => document.removeEventListener('heys-insulinwave-ready', onReady);
    }, [HEYSRef]);

    return React.useMemo(() => {
      const meals = Array.isArray(safeDay.meals) ? safeDay.meals : [];
      if (!HEYSRef.InsulinWave?.calculate) return loadingState(meals);
      if (typeof getProductFromItem !== 'function') {
        throw new TypeError('dayInsulinWaveData: getProductFromItem must be a function');
      }

      const today = new Date().toISOString().slice(0, 10);
      const selectedDate = safeDay.date || today;
      const isPastDay = selectedDate < today;
      const profile = typeof getProfile === 'function' ? getProfile() : {};
      const calculateFor = (sourceDay, nowMinutes) => HEYSRef.InsulinWave.calculate({
        meals: sourceDay.meals || [],
        pIndex,
        getProductFromItem,
        trainings: sourceDay.trainings || [],
        nowMinutes,
        dayData: { profile, date: sourceDay.date },
      });

      if (meals.some((meal) => meal?.time)) {
        const now = new Date();
        const result = calculateFor(safeDay, isPastDay ? 1439 : now.getHours() * 60 + now.getMinutes());
        return result ? { ...result, isPastDay } : null;
      }

      if (!isPastDay) {
        const safeGet = typeof lsGet === 'function' ? lsGet : HEYSRef.utils?.lsGet;
        const yesterdayIso = previousDate(today);
        const yesterday = typeof safeGet === 'function' ? safeGet(`heys_dayv2_${yesterdayIso}`, null) : null;
        if (yesterday?.meals?.some((meal) => meal?.time)) {
          const now = new Date();
          const result = calculateFor(yesterday, 1440 + now.getHours() * 60 + now.getMinutes());
          return result ? { ...result, isOvernightEstimate: true, sourceDate: yesterdayIso } : null;
        }
      }
      return null;
    }, [safeDay.meals, safeDay.trainings, safeDay.date, pIndex, getProductFromItem, currentMinute, iwVersion]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
