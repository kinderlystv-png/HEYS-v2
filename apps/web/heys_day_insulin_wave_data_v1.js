// heys_day_insulin_wave_data_v1.js — insulin wave data computation for DayTab
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.dayInsulinWaveData = HEYS.dayInsulinWaveData || {};

  HEYS.dayInsulinWaveData.computeInsulinWaveData = function computeInsulinWaveData(ctx) {
    const {
      React,
      day,
      pIndex,
      getProductFromItem,
      getProfile,
      lsGet,
      currentMinute,
      HEYS: heysGlobal
    } = ctx || {};

    if (!React) return null;

    const HEYSRef = heysGlobal || global.HEYS || {};
    const safeDay = day || {};

    // Версионный счётчик: увеличивается когда InsulinWave-модуль загружается
    // (postboot-1-game грузится позже boot-бандлов — нужен re-render при готовности модуля)
    const [iwVersion, setIwVersion] = React.useState(() => HEYSRef.InsulinWave?.calculate ? 1 : 0);
    React.useEffect(function () {
      // v1.1: Race condition fix — postboot-1-game may fire heys-insulinwave-ready
      // BEFORE this effect runs (React runs effects after DOM commit, scripts run earlier).
      // So we re-check availability here; if already loaded, bump version immediately.
      if (HEYSRef.InsulinWave?.calculate) {
        setIwVersion(function (v) { return v === 0 ? 1 : v; });
        return;
      }
      function onIWReady() {
        setIwVersion(function (v) { return v + 1; });
        console.info('[HEYS.dayInsulinWaveData] ✅ InsulinWave ready, re-computing wave data');
      }
      document.addEventListener('heys-insulinwave-ready', onIWReady, { once: true });
      return function () { document.removeEventListener('heys-insulinwave-ready', onIWReady); };
    }, []);

    return React.useMemo(() => {
      const prof = typeof getProfile === 'function' ? getProfile() : (HEYSRef.utils?.lsGet?.('heys_profile', {}) || {});
      const baseWaveHours = prof?.insulinWaveHours || 3;

      // Используем модуль HEYS.InsulinWave если доступен
      if (HEYSRef.InsulinWave && HEYSRef.InsulinWave.calculate) {
        const result = HEYSRef.InsulinWave.calculate({
          meals: safeDay.meals,
          pIndex,
          getProductFromItem,
          baseWaveHours,
          trainings: safeDay.trainings || [], // 🏃 Передаём тренировки для workout acceleration
          // 🆕 v1.4: Данные дня для stress и sleep факторов
          // 🆕 v3.0.0: Добавлен profile для персональной базы волны
          dayData: {
            sleepHours: safeDay.sleepHours || null,  // часы сна предыдущей ночи
            sleepQuality: safeDay.sleepQuality || null, // качество сна (1-10)
            stressAvg: safeDay.stressAvg || 0,        // средний стресс за день (1-5)
            waterMl: safeDay.waterMl || 0,            // выпито воды (мл)
            householdMin: safeDay.householdMin || 0,  // бытовая активность
            steps: safeDay.steps || 0,                // шаги
            cycleDay: safeDay.cycleDay || null,       // день цикла
            // 🆕 v3.0.0: Профиль для персональной базы
            profile: {
              age: prof?.age || 0,
              weight: prof?.weight || 0,
              height: prof?.height || 0,
              gender: prof?.gender || ''
            },
            // 🆕 v3.6.0: Для расчёта NDTE (эффект вчерашней тренировки)
            date: safeDay.date,
            lsGet
          }
        });
        return result;
      }

      // Fallback если модуль не загружен
      const meals = safeDay.meals || [];
      if (meals.length === 0) return null;

      const mealsWithTime = meals.filter(m => m.time);
      if (mealsWithTime.length === 0) return null;

      const sorted = [...mealsWithTime].sort((a, b) => {
        const timeA = (a.time || '').replace(':', '');
        const timeB = (b.time || '').replace(':', '');
        return timeB.localeCompare(timeA);
      });
      const lastMeal = sorted[0];
      const lastMealTime = lastMeal?.time;
      if (!lastMealTime) return null;

      // Простой расчёт без модуля
      let avgGI = 50, totalGrams = 0, weightedGI = 0;
      for (const item of (lastMeal.items || [])) {
        const grams = item.grams || 100;
        const prod = getProductFromItem ? getProductFromItem(item, pIndex) : null;
        const gi = prod?.gi || prod?.gi100 || 50;
        weightedGI += gi * grams;
        totalGrams += grams;
      }
      if (totalGrams > 0) avgGI = Math.round(weightedGI / totalGrams);

      let giMultiplier = avgGI <= 35 ? 1.2 : avgGI <= 55 ? 1.0 : avgGI <= 70 ? 0.85 : 0.7;
      const giCategory = avgGI <= 35 ? 'low' : avgGI <= 55 ? 'medium' : avgGI <= 70 ? 'high' : 'very-high';

      const waveMinutes = baseWaveHours * giMultiplier * 60;
      const [mealH, mealM] = lastMealTime.split(':').map(Number);
      if (isNaN(mealH)) return null;

      const mealMinutes = mealH * 60 + (mealM || 0);
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      let diffMinutes = Math.max(0, nowMinutes - mealMinutes);

      const remainingMinutes = Math.max(0, waveMinutes - diffMinutes);
      const progressPct = Math.min(100, (diffMinutes / waveMinutes) * 100);

      const endMinutes = mealMinutes + Math.round(waveMinutes);
      const endTime = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0') + ':' + String(endMinutes % 60).padStart(2, '0');

      const isNightTime = now.getHours() >= 22 || now.getHours() < 6;
      let status, emoji, text, color, subtext;

      if (remainingMinutes <= 0) {
        status = 'lipolysis'; emoji = '🔥'; text = 'Липолиз!'; color = '#22c55e';
        subtext = isNightTime ? '🌙 Идеально! Ночной липолиз до утра' : '💪 Жиросжигание идёт! Продержись подольше';
      } else if (remainingMinutes <= 15) {
        status = 'almost'; emoji = '⏳'; text = Math.ceil(remainingMinutes) + ' мин'; color = '#f97316';
        subtext = '⏳ Скоро начнётся липолиз!';
      } else if (remainingMinutes <= 30) {
        status = 'soon'; emoji = '🌊'; text = Math.ceil(remainingMinutes) + ' мин'; color = '#eab308';
        subtext = '🍵 Вода не прерывает липолиз';
      } else {
        const h = Math.floor(remainingMinutes / 60), m = Math.round(remainingMinutes % 60);
        status = 'active'; emoji = '📈'; text = h > 0 ? h + 'ч ' + m + 'м' : m + ' мин'; color = '#3b82f6';
        subtext = '📈 Инсулин высокий, жир запасается';
      }

      return {
        status, emoji, text, color, subtext, progress: progressPct, remaining: remainingMinutes,
        lastMealTime, lastMealTimeDisplay: lastMealTime, endTime, insulinWaveHours: baseWaveHours * giMultiplier, baseWaveHours, isNightTime,
        avgGI, giCategory: { color: giMultiplier === 1.2 ? '#22c55e' : giMultiplier === 1.0 ? '#eab308' : giMultiplier === 0.85 ? '#f97316' : '#ef4444', text: giCategory }, giMultiplier,
        waveHistory: [], overlaps: [], hasOverlaps: false, gapQuality: 'unknown'
      };
    }, [safeDay.meals, safeDay.trainings, safeDay.sleepHours, safeDay.sleepQuality, safeDay.stressAvg, safeDay.waterMl, safeDay.householdMin, safeDay.steps, safeDay.cycleDay, safeDay.date, pIndex, getProductFromItem, currentMinute, iwVersion]);
  };
})(window);
