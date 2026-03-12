// heys_day_sparkline_data_v1.js — extracted sparkline data computation

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.daySparklineData = HEYS.daySparklineData || {};

  HEYS.daySparklineData.computeSparklineData = function computeSparklineData(ctx) {
    const {
      React,
      date,
      day,
      eatenKcal,
      chartPeriod,
      optimum,
      prof,
      products,
      dayTot,
      sparklineRefreshKey,
      fmtDate,
      HEYS: heysCtx
    } = ctx || {};

    const H = heysCtx || HEYS;

    const sparklineData = React.useMemo(() => {
      try {
        // === ВАЖНО: Используем выбранный день (date) как "сегодня" для sparkline ===
        // Это позволяет корректно показывать данные при просмотре любого дня,
        // включая ночные часы (00:00-02:59) когда HEYS-день ещё не закончился
        const realToday = new Date(date + 'T12:00:00'); // Парсим date из пропсов
        const realTodayStr = date; // date уже в формате YYYY-MM-DD
        const days = [];
        const clientId = (H && H.currentClientId) || '';

        // Строим Map продуктов из state (ключ = lowercase name для поиска по названию)
        // ВАЖНО: getDayData ищет по lowercase, поэтому ключ тоже должен быть lowercase
        const productsMap = new Map();
        (products || []).forEach((p) => {
          if (p && p.name) {
            const name = String(p.name).trim().toLowerCase();
            if (name) productsMap.set(name, p);
          }
        });

        // Получаем данные activeDays для нескольких месяцев
        const getActiveDaysForMonth = (H.dayUtils && H.dayUtils.getActiveDaysForMonth) || (() => new Map());

        const allActiveDays = new Map();

        // Собираем данные за 3 месяца назад (для поиска первого дня с данными)
        for (let monthOffset = 0; monthOffset >= -3; monthOffset--) {
          const checkDate = new Date(realToday);
          checkDate.setMonth(checkDate.getMonth() + monthOffset);

          const monthData = getActiveDaysForMonth(
            checkDate.getFullYear(),
            checkDate.getMonth(),
            prof,
            products
          );
          monthData.forEach((v, k) => allActiveDays.set(k, v));
        }

        // === НОВОЕ: Находим первый день с данными за последние 60 дней ===
        let firstDataDay = null;
        const maxLookback = 60;
        for (let i = maxLookback; i >= 0; i--) {
          const d = new Date(realToday);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          const dayInfo = allActiveDays.get(dateStr);
          if (dayInfo && dayInfo.kcal > 0) {
            firstDataDay = dateStr;
            break;
          }
        }

        // Если нет данных — возвращаем пустой массив (покажем empty state)
        if (!firstDataDay) {
          // Возвращаем chartPeriod пустых дней чтобы empty state отобразился
          for (let i = chartPeriod - 1; i >= 0; i--) {
            const d = new Date(realToday);
            d.setDate(d.getDate() - i);
            days.push({
              date: fmtDate(d),
              kcal: 0,
              target: optimum,
              spent: optimum, // 🆕 v5.0: Затраты = норма для пустых дней
              isToday: i === 0,
              hasTraining: false,
              trainingTypes: [],
              sleepHours: 0,
              sleepQuality: 0,
              dayScore: 0,
              steps: 0
            });
          }
          return days;
        }

        // === Считаем сколько дней с данными от firstDataDay до сегодня ===
        const firstDataDate = new Date(firstDataDay);
        const daysSinceFirstData =
          Math.floor((realToday - firstDataDate) / (24 * 60 * 60 * 1000)) + 1;

        // === КЛЮЧЕВАЯ ЛОГИКА: Определяем диапазон дат для графика ===
        // Если данных >= chartPeriod — показываем последние chartPeriod дней (как раньше)
        // Если данных < chartPeriod — показываем от firstDataDay, остальное справа будет прогнозом
        let startDate;
        let daysToShow;
        let futureDaysCount = 0;

        if (daysSinceFirstData >= chartPeriod) {
          // Данных достаточно — показываем последние chartPeriod дней
          startDate = new Date(realToday);
          startDate.setDate(startDate.getDate() - (chartPeriod - 1));
          daysToShow = chartPeriod;
        } else {
          // Данных мало — показываем от первого дня с данными до сегодня
          // Остальные слоты справа заполним прогнозом
          startDate = firstDataDate;
          daysToShow = daysSinceFirstData;
          futureDaysCount = chartPeriod - daysSinceFirstData;
        }

        // Функция для получения данных одного дня
        const getDayData = (dateStr, isRealToday) => {
          const dayInfo = allActiveDays.get(dateStr);

          // Для реального сегодняшнего дня используем eatenKcal и текущий optimum
          if (isRealToday) {
            const todayTrainings = (day.trainings || []).filter((t) => t && t.z && t.z.some((z) => z > 0));
            const hasTraining = todayTrainings.length > 0;
            const trainingTypes = todayTrainings.map((t) => t.type || 'cardio');
            let trainingMinutes = 0;
            todayTrainings.forEach((t) => {
              if (t.z && Array.isArray(t.z)) trainingMinutes += t.z.reduce((s, m) => s + (+m || 0), 0);
            });
            let sleepHours = 0;
            if (day.sleepStart && day.sleepEnd) {
              const [sh, sm] = day.sleepStart.split(':').map(Number);
              const [eh, em] = day.sleepEnd.split(':').map(Number);
              let startMin = sh * 60 + sm, endMin = eh * 60 + em;
              if (endMin < startMin) endMin += 24 * 60;
              sleepHours = (endMin - startMin) / 60;
            }
            const todayKcal = Math.round(eatenKcal || 0);
            // Используем savedDisplayOptimum (с учётом долга) если есть, иначе optimum
            const todayTarget = day.savedDisplayOptimum > 0 ? day.savedDisplayOptimum : optimum;
            const todayRatio = todayTarget > 0 ? todayKcal / todayTarget : 0;
            // 🆕 v5.0: Рассчитываем затраты дня (TDEE) для сегодня
            const lsGet = (H && H.utils && H.utils.lsGet) || ((k, d) => d);
            const pIndex = productsMap;
            const tdeeResult = (H && H.TDEE && H.TDEE.calculate)
              ? H.TDEE.calculate(day, prof, { lsGet, includeNDTE: true, pIndex })
              : null;
            const todaySpent = tdeeResult?.tdee || todayTarget; // Fallback к target если TDEE недоступен
            return {
              date: dateStr,
              kcal: todayKcal,
              target: todayTarget,
              spent: todaySpent, // 🆕 v5.0: Затраты дня (TDEE) для расчета дефицита/профицита
              ratio: todayRatio, // 🆕 Ratio для инсайтов
              isToday: true,
              isFastingDay: day.isFastingDay || false,
              isIncomplete: day.isIncomplete || false,
              hasTraining,
              trainingTypes,
              trainingMinutes,
              sleepHours,
              steps: +day.steps || 0, // 🆕 Шаги для текущего дня
              waterMl: +day.waterMl || 0, // 🆕 Вода для текущего дня
              weightMorning: +day.weightMorning || 0, // 🆕 Вес для текущего дня
              moodAvg: +day.moodAvg || 0,
              dayScore: +day.dayScore || 0,
              prot: Math.round(dayTot.prot || 0),
              fat: Math.round(dayTot.fat || 0),
              carbs: Math.round(dayTot.carbs || 0),
              isRefeedDay: day.isRefeedDay || false // 🔄 Refeed day flag
            };
          }

          // Для прошлых дней используем данные из activeDays
          if (dayInfo && dayInfo.kcal > 0) {
            return {
              date: dateStr,
              kcal: dayInfo.kcal,
              target: dayInfo.target,
              baseTarget: dayInfo.baseTarget || dayInfo.target, // 🔧 Базовая норма для caloricDebt
              spent: dayInfo.spent || dayInfo.target, // 🆕 v5.0: Затраты дня (TDEE)
              ratio: dayInfo.ratio || (dayInfo.target > 0 ? dayInfo.kcal / dayInfo.target : 0), // 🆕 Ratio для инсайтов
              isToday: false,
              hasTraining: dayInfo.hasTraining || false,
              trainingTypes: dayInfo.trainingTypes || [],
              trainingMinutes: dayInfo.trainingMinutes || 0,
              sleepHours: dayInfo.sleepHours || 0,
              sleepQuality: dayInfo.sleepQuality || 0,
              dayScore: dayInfo.dayScore || 0,
              steps: dayInfo.steps || 0,
              waterMl: dayInfo.waterMl || 0, // 🆕 Вода для персонализированных инсайтов
              weightMorning: dayInfo.weightMorning || 0, // 🆕 Вес для персонализированных инсайтов
              prot: dayInfo.prot || 0,
              fat: dayInfo.fat || 0,
              carbs: dayInfo.carbs || 0,
              isRefeedDay: dayInfo.isRefeedDay || false, // 🔄 Refeed day flag
              isFastingDay: dayInfo.isFastingDay || false, // 🆕 Голодание (данные корректны)
              isIncomplete: dayInfo.isIncomplete || false // 🆕 Незаполненный день (исключить из статистики)
            };
          }

          // Fallback: читаем напрямую из localStorage
          let dayData = null;
          try {
            const scopedKey = clientId
              ? 'heys_' + clientId + '_dayv2_' + dateStr
              : 'heys_dayv2_' + dateStr;
            const raw = localStorage.getItem(scopedKey);
            if (raw) {
              if (raw.startsWith('¤Z¤')) {
                let str = raw.substring(3);
                const patterns = {
                  '¤n¤': '"name":"',
                  '¤k¤': '"kcal100"',
                  '¤p¤': '"protein100"',
                  '¤c¤': '"carbs100"',
                  '¤f¤': '"fat100"'
                };
                for (const [code, pattern] of Object.entries(patterns)) str = str.split(code).join(pattern);
                dayData = JSON.parse(str);
              } else {
                dayData = JSON.parse(raw);
              }
            }
          } catch (e) { }

          if (dayData && dayData.meals) {
            let totalKcal = 0;
            (dayData.meals || []).forEach((meal) => {
              (meal.items || []).forEach((item) => {
                const grams = +item.grams || 0;
                if (grams <= 0) return;
                const nameKey = (item.name || '').trim();
                const product = nameKey ? productsMap.get(nameKey) : null;
                const src = product || item;
                if (src.kcal100 != null) {
                  totalKcal += ((+src.kcal100 || 0) * grams) / 100;
                }
              });
            });
            const dayTrainings = (dayData.trainings || []).filter((t) => t && t.z && t.z.some((z) => z > 0));
            let fallbackSleepHours = 0;
            if (dayData.sleepStart && dayData.sleepEnd) {
              const [sh, sm] = dayData.sleepStart.split(':').map(Number);
              const [eh, em] = dayData.sleepEnd.split(':').map(Number);
              let startMin = sh * 60 + sm, endMin = eh * 60 + em;
              if (endMin < startMin) endMin += 24 * 60;
              fallbackSleepHours = (endMin - startMin) / 60;
            }
            const fallbackTotalKcal = Math.round(totalKcal);
            // 🔧 FIX: Используем сохранённую норму дня если есть, иначе текущий optimum
            const fallbackTarget = +dayData.savedDisplayOptimum > 0 ? +dayData.savedDisplayOptimum : optimum;
            // 🔧 FIX: Используем сохранённые калории если есть, иначе пересчитанные
            const fallbackKcal = +dayData.savedEatenKcal > 0 ? +dayData.savedEatenKcal : fallbackTotalKcal;
            return {
              date: dateStr,
              kcal: fallbackKcal,
              target: fallbackTarget,
              spent: fallbackTarget, // 🆕 v5.0: Затраты = норма для fallback дней (нет TDEE)
              ratio: fallbackTarget > 0 ? fallbackKcal / fallbackTarget : 0, // 🆕 Ratio для инсайтов
              isToday: false,
              hasTraining: dayTrainings.length > 0,
              trainingTypes: dayTrainings.map((t) => t.type || 'cardio'),
              sleepHours: fallbackSleepHours,
              sleepQuality: +dayData.sleepQuality || 0,
              dayScore: +dayData.dayScore || 0,
              steps: +dayData.steps || 0,
              waterMl: +dayData.waterMl || 0, // 🆕 Вода для персонализированных инсайтов
              weightMorning: +dayData.weightMorning || 0, // 🆕 Вес для персонализированных инсайтов
              prot: 0, // fallback — нет детальных данных
              fat: 0,
              carbs: 0,
              isRefeedDay: dayData.isRefeedDay || false, // 🔄 Refeed day flag
              isFastingDay: dayData.isFastingDay || false, // 🆕 Голодание (данные корректны)
              isIncomplete: dayData.isIncomplete || false // 🆕 Незаполненный день (исключить из статистики)
            };
          }

          // Нет данных дня — используем текущий optimum как fallback (день пустой, delta не важна)
          return {
            date: dateStr,
            kcal: 0,
            target: optimum,
            spent: optimum, // 🆕 v5.0: Затраты = норма для пустых дней
            ratio: 0,
            isToday: false,
            hasTraining: false,
            trainingTypes: [],
            sleepHours: 0,
            sleepQuality: 0,
            dayScore: 0,
            steps: 0,
            waterMl: 0,
            weightMorning: 0,
            prot: 0,
            fat: 0,
            carbs: 0,
            isRefeedDay: false,
            isFastingDay: false,
            isIncomplete: false
          };
        };

        // Собираем данные за период (от startDate до сегодня)
        for (let i = 0; i < daysToShow; i++) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + i);
          const dateStr = fmtDate(d);
          const isRealToday = dateStr === realTodayStr;
          days.push(getDayData(dateStr, isRealToday));
        }

        // === НОВОЕ: Добавляем будущие дни как прогноз ===
        // Эти дни будут помечены как isFuture и показаны как "?" с прогнозной линией
        for (let i = 1; i <= futureDaysCount; i++) {
          const d = new Date(realToday);
          d.setDate(d.getDate() + i);
          const dateStr = fmtDate(d);
          days.push({
            date: dateStr,
            kcal: 0,
            target: optimum,
            spent: optimum, // 🆕 v5.0: Затраты = норма для будущих дней
            ratio: 0, // 🆕 Для консистентности
            isToday: false,
            isFuture: true, // Маркер будущего дня
            hasTraining: false,
            trainingTypes: [],
            sleepHours: 0,
            sleepQuality: 0,
            dayScore: 0,
            steps: 0,
            waterMl: 0,
            weightMorning: 0,
            prot: 0,
            fat: 0,
            carbs: 0
          });
        }

        return days;
      } catch (e) {
        return [];
      }
    }, [
      date,
      eatenKcal,
      chartPeriod,
      optimum,
      prof,
      products,
      day?.trainings,
      day?.sleepStart,
      day?.sleepEnd,
      day?.moodAvg,
      day?.dayScore,
      day?.isFastingDay,
      day?.isIncomplete,
      day?.savedDisplayOptimum,
      day?.updatedAt,
      sparklineRefreshKey
    ]);

    return sparklineData;
  };
})();
