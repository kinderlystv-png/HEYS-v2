// heys_day_insulin_wave_data_v1.js — insulin wave data computation for DayTab
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.dayInsulinWaveData = HEYS.dayInsulinWaveData || {};

  // Обогащает результат расчёта данными жиросжигания для прошлого дня
  function _enrichWithPastDayData(result, safeDay, dayDateStr, prof, baseWaveHours, lsGet, HEYSRef) {
    try {
      const meals = safeDay.meals || [];
      const mealsWithTime = meals.filter(function (m) { return m.time; });
      if (mealsWithTime.length === 0) {
        return Object.assign({}, result, { isPastDay: true });
      }

      // Находим последний приём пищи
      var sorted = mealsWithTime.slice().sort(function (a, b) { return b.time.localeCompare(a.time); });
      var lastMeal = sorted[0];
      var parts = (lastMeal.time || '0:0').split(':').map(Number);
      var lastMealMin = parts[0] * 60 + (parts[1] || 0);

      // Длина волны из result
      var waveMinutes = Math.round((result.insulinWaveHours || baseWaveHours) * 60);
      var waveEndMin = lastMealMin + waveMinutes;
      var waveEndTimeH = Math.floor(waveEndMin / 60) % 24;
      var waveEndTimeM = Math.round(waveEndMin % 60);
      var waveEndTime = String(waveEndTimeH).padStart(2, '0') + ':' + String(waveEndTimeM).padStart(2, '0');

      // Ищем первый приём пищи следующего дня
      var nextDayFirstMealMin = -1; // -1 = не найден
      var fatBurningStillActive = false;
      var todayStr = new Date().toISOString().slice(0, 10);
      try {
        var selDate = new Date(dayDateStr);
        selDate.setDate(selDate.getDate() + 1);
        var nextDateStr = selDate.toISOString().slice(0, 10);
        var safeLsGet = typeof lsGet === 'function' ? lsGet : (HEYSRef.utils?.lsGet || function () { return null; });
        var nextDayData = safeLsGet('heys_dayv2_' + nextDateStr, null);
        var nextMeals = (nextDayData?.meals || []).filter(function (m) { return m.time; });
        if (nextMeals.length > 0) {
          var nextSorted = nextMeals.slice().sort(function (a, b) { return a.time.localeCompare(b.time); });
          var firstNextParts = (nextSorted[0].time || '8:0').split(':').map(Number);
          nextDayFirstMealMin = firstNextParts[0] * 60 + (firstNextParts[1] || 0);
        } else if (nextDateStr === todayStr) {
          // Следующий день — сегодня и завтрака ещё нет → жиросжигание ещё идёт
          fatBurningStillActive = true;
          var now = new Date();
          nextDayFirstMealMin = now.getHours() * 60 + now.getMinutes();
        }
      } catch (_) { /* fallback */ }
      // Если следующий день — прошлый без приёмов, используем 08:00 fallback
      if (nextDayFirstMealMin < 0) nextDayFirstMealMin = 8 * 60;

      // Окно жиросжигания
      var fatBurningWindowMin;
      if (waveEndMin >= 1440) {
        var overflowMin = waveEndMin - 1440;
        fatBurningWindowMin = Math.max(0, nextDayFirstMealMin - overflowMin);
      } else {
        fatBurningWindowMin = (1440 - waveEndMin) + nextDayFirstMealMin;
      }
      fatBurningWindowMin = Math.min(fatBurningWindowMin, 16 * 60);
      if (fatBurningWindowMin <= 0) fatBurningWindowMin = 0;

      // Kcal в режиме липолиза
      var weight = prof?.weight || 70;
      var kcalRate = 1.15 * (weight / 70);
      var fatBurningKcal = Math.round(fatBurningWindowMin * kcalRate);

      // Рекорд и история из Lipolysis модуля
      var lipolysisRecord = { minutes: 0, date: null };
      try {
        if (HEYSRef.InsulinWave?.Lipolysis?.getLipolysisRecord) {
          lipolysisRecord = HEYSRef.InsulinWave.Lipolysis.getLipolysisRecord();
        }
      } catch (_) { }

      var fatBurningH = Math.floor(fatBurningWindowMin / 60);
      var fatBurningM = Math.round(fatBurningWindowMin % 60);

      console.info('[HEYS.dayInsulinWaveData] 📅 past day enrichment', {
        date: dayDateStr, lastMeal: lastMeal.time, waveEndTime,
        fatBurningWindowMin, fatBurningKcal, record: lipolysisRecord.minutes
      });

      return Object.assign({}, result, {
        isPastDay: true,
        fatBurningStillActive: fatBurningStillActive,
        status: 'lipolysis',
        progress: 100,
        remaining: 0,
        isLipolysis: true,
        isNightTime: true,
        color: '#22c55e',
        endTime: waveEndTime,
        fatBurningWindowMin: fatBurningWindowMin,
        fatBurningWindowH: fatBurningH,
        fatBurningWindowM: fatBurningM,
        fatBurningKcal: fatBurningKcal,
        lipolysisRecord: lipolysisRecord,
        isRecord: !fatBurningStillActive && fatBurningWindowMin > 0 && fatBurningWindowMin >= (lipolysisRecord.minutes || 0)
      });
    } catch (e) {
      console.error('[HEYS.dayInsulinWaveData] past day enrichment ❌', e);
      return Object.assign({}, result, { isPastDay: true });
    }
  }

  // Ночной липолиз: сегодня нет приёмов пищи, но вчера были
  function _computeOvernightLipolysis(todayStr, prof, baseWaveHours, lsGet, HEYSRef, pIndex, getProductFromItem) {
    try {
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      var yesterdayStr = yesterday.toISOString().slice(0, 10);
      var safeLsGet = typeof lsGet === 'function' ? lsGet : (HEYSRef.utils?.lsGet || function () { return null; });
      var yData = safeLsGet('heys_dayv2_' + yesterdayStr, null);
      var yMeals = (yData?.meals || []).filter(function (m) { return m.time; });
      if (yMeals.length === 0) return null;

      // Последний приём пищи вчера
      var sorted = yMeals.slice().sort(function (a, b) { return b.time.localeCompare(a.time); });
      var lastMeal = sorted[0];
      var parts = (lastMeal.time || '0:0').split(':').map(Number);
      var lastMealMin = parts[0] * 60 + (parts[1] || 0);

      // Длина волны
      var waveMinutes = baseWaveHours * 60;
      if (HEYSRef.InsulinWave && HEYSRef.InsulinWave.calculate) {
        try {
          var fakeNow = new Date(yesterdayStr + 'T23:59:00');
          var result = HEYSRef.InsulinWave.calculate({
            meals: yData.meals || [], pIndex: pIndex, getProductFromItem: getProductFromItem,
            baseWaveHours: baseWaveHours, trainings: yData.trainings || [],
            dayData: {
              sleepHours: yData.sleepHours || null, sleepQuality: yData.sleepQuality || null,
              stressAvg: yData.stressAvg || 0, waterMl: yData.waterMl || 0,
              householdMin: yData.householdMin || 0, steps: yData.steps || 0,
              date: yData.date, lsGet: safeLsGet,
              profile: { age: prof?.age || 0, weight: prof?.weight || 0, height: prof?.height || 0, gender: prof?.gender || '' }
            },
            now: fakeNow
          });
          if (result?.insulinWaveHours) waveMinutes = Math.round(result.insulinWaveHours * 60);
        } catch (_) { /* fallback */ }
      }

      var waveEndMin = lastMealMin + waveMinutes;

      // Минуты с момента конца волны (через полночь)
      var now = new Date();
      var nowMin = now.getHours() * 60 + now.getMinutes();
      var lipolysisMinutes;
      if (waveEndMin >= 1440) {
        lipolysisMinutes = nowMin - (waveEndMin - 1440);
      } else {
        lipolysisMinutes = (1440 - waveEndMin) + nowMin;
      }

      var waveEndTimeH = Math.floor(waveEndMin / 60) % 24;
      var waveEndTimeM = Math.round(waveEndMin % 60);
      var endTime = String(waveEndTimeH).padStart(2, '0') + ':' + String(waveEndTimeM).padStart(2, '0');

      if (lipolysisMinutes <= 0) {
        // Волна ещё не кончилась
        var remainingMin = Math.abs(lipolysisMinutes);
        return {
          isOvernightWave: true,
          status: 'active', emoji: '📈',
          text: Math.floor(remainingMin / 60) > 0 ? Math.floor(remainingMin / 60) + 'ч ' + Math.round(remainingMin % 60) + 'м' : Math.round(remainingMin) + ' мин',
          color: '#3b82f6',
          subtext: '📈 Инсулиновая волна с вечера ещё не закончилась',
          progress: Math.min(100, ((waveMinutes - remainingMin) / waveMinutes) * 100),
          remaining: remainingMin,
          lastMealTime: lastMeal.time, lastMealTimeDisplay: lastMeal.time,
          endTime: endTime, insulinWaveHours: waveMinutes / 60, baseWaveHours: baseWaveHours,
          isNightTime: false, waveHistory: [], overlaps: [], hasOverlaps: false, gapQuality: 'unknown'
        };
      }

      // Липолиз активен
      var weight = prof?.weight || 70;
      var kcalRate = 1.15 * (weight / 70);
      var lipolysisKcal = Math.round(lipolysisMinutes * kcalRate);
      var lipoH = Math.floor(lipolysisMinutes / 60);
      var lipoM = Math.round(lipolysisMinutes % 60);

      console.info('[HEYS.dayInsulinWaveData] 🌙 overnight lipolysis', {
        lastMeal: lastMeal.time, waveEndMin: waveEndMin, lipolysisMinutes: lipolysisMinutes, lipolysisKcal: lipolysisKcal
      });

      return {
        isOvernightLipolysis: true,
        status: 'lipolysis', emoji: '🔥',
        text: 'Липолиз!', color: '#22c55e',
        subtext: '🌙 Жиросжигание с ночи! Не ешь подольше',
        progress: 100, remaining: 0,
        lastMealTime: lastMeal.time, lastMealTimeDisplay: lastMeal.time,
        endTime: endTime, insulinWaveHours: waveMinutes / 60, baseWaveHours: baseWaveHours,
        isNightTime: true,
        lipolysisMinutes: lipolysisMinutes, lipolysisH: lipoH, lipolysisM: lipoM, lipolysisKcal: lipolysisKcal,
        waveHistory: [], overlaps: [], hasOverlaps: false, gapQuality: 'unknown'
      };
    } catch (e) {
      console.error('[HEYS.dayInsulinWaveData] overnight lipolysis ❌', e);
      return null;
    }
  }

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

      // Определяем, прошлый ли это день
      const todayStr = new Date().toISOString().slice(0, 10);
      const dayDateStr = safeDay.date || '';
      const isPastDay = dayDateStr && dayDateStr < todayStr;
      const isToday = !dayDateStr || dayDateStr === todayStr;

      // Для прошлых дней используем конец дня (23:59) чтобы волна корректно считалась
      const nowForCalc = isPastDay ? new Date(dayDateStr + 'T23:59:00') : new Date();

      // Сегодня без приёмов пищи → проверяем ночной липолиз от вчера
      const meals = safeDay.meals || [];
      const mealsWithTime = meals.filter(function (m) { return m.time; });
      if (isToday && mealsWithTime.length === 0) {
        return _computeOvernightLipolysis(todayStr, prof, baseWaveHours, lsGet, HEYSRef, pIndex, getProductFromItem);
      }

      // Используем модуль HEYS.InsulinWave если доступен
      if (HEYSRef.InsulinWave && HEYSRef.InsulinWave.calculate) {
        const result = HEYSRef.InsulinWave.calculate({
          meals: safeDay.meals,
          pIndex,
          getProductFromItem,
          baseWaveHours,
          trainings: safeDay.trainings || [],
          now: nowForCalc,
          dayData: {
            sleepHours: safeDay.sleepHours || null,
            sleepQuality: safeDay.sleepQuality || null,
            stressAvg: safeDay.stressAvg || 0,
            waterMl: safeDay.waterMl || 0,
            householdMin: safeDay.householdMin || 0,
            steps: safeDay.steps || 0,
            cycleDay: safeDay.cycleDay || null,
            profile: {
              age: prof?.age || 0,
              weight: prof?.weight || 0,
              height: prof?.height || 0,
              gender: prof?.gender || ''
            },
            date: safeDay.date,
            lsGet
          }
        });

        // Для прошлых дней: добавляем итоги жиросжигания
        if (isPastDay && result) {
          return _enrichWithPastDayData(result, safeDay, dayDateStr, prof, baseWaveHours, lsGet, HEYSRef);
        }

        return result;
      }

      // Fallback если модуль не загружен
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
        const grams = HEYSRef.models.normalizeItemGrams(item.grams, 100);
        const prod = getProductFromItem ? getProductFromItem(item, pIndex) : null;
        const gi = prod?.gi || prod?.gi100 || 50;
        weightedGI += gi * grams;
        totalGrams += grams;
      }
      if (totalGrams > 0) avgGI = Math.round(weightedGI / totalGrams);

      var giMultiplier = avgGI <= 35 ? 1.2 : avgGI <= 55 ? 1.0 : avgGI <= 70 ? 0.85 : 0.7;
      const giCategory = avgGI <= 35 ? 'low' : avgGI <= 55 ? 'medium' : avgGI <= 70 ? 'high' : 'very-high';

      const waveMinutes = baseWaveHours * giMultiplier * 60;
      const [mealH, mealM] = lastMealTime.split(':').map(Number);
      if (isNaN(mealH)) return null;

      const mealMinutes = mealH * 60 + (mealM || 0);
      const nowMinutes = isPastDay ? (23 * 60 + 59) : (new Date().getHours() * 60 + new Date().getMinutes());
      var diffMinutes = Math.max(0, nowMinutes - mealMinutes);

      const remainingMinutes = Math.max(0, waveMinutes - diffMinutes);
      const progressPct = Math.min(100, (diffMinutes / waveMinutes) * 100);

      const endMinutes = mealMinutes + Math.round(waveMinutes);
      const endTime = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0') + ':' + String(endMinutes % 60).padStart(2, '0');

      const isNightTime = isPastDay ? true : (new Date().getHours() >= 22 || new Date().getHours() < 6);
      var status, emoji, text, color, subtext;

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

      var fallbackResult = {
        status, emoji, text, color, subtext, progress: progressPct, remaining: remainingMinutes,
        lastMealTime, lastMealTimeDisplay: lastMealTime, endTime, insulinWaveHours: baseWaveHours * giMultiplier, baseWaveHours, isNightTime,
        avgGI, giCategory: { color: giMultiplier === 1.2 ? '#22c55e' : giMultiplier === 1.0 ? '#eab308' : giMultiplier === 0.85 ? '#f97316' : '#ef4444', text: giCategory }, giMultiplier,
        waveHistory: [], overlaps: [], hasOverlaps: false, gapQuality: 'unknown'
      };

      if (isPastDay) {
        return _enrichWithPastDayData(fallbackResult, safeDay, dayDateStr, prof, baseWaveHours, lsGet, HEYSRef);
      }
      return fallbackResult;
    }, [safeDay.meals, safeDay.trainings, safeDay.sleepHours, safeDay.sleepQuality, safeDay.stressAvg, safeDay.waterMl, safeDay.householdMin, safeDay.steps, safeDay.cycleDay, safeDay.date, pIndex, getProductFromItem, currentMinute, iwVersion]);
  };
})(window);
