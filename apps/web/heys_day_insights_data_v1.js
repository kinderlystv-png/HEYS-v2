// heys_day_insights_data_v1.js — day insights calculations (kcal trend, balance viz, heatmap, meals chart)
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.dayInsightsData = HEYS.dayInsightsData || {};

  HEYS.dayInsightsData.computeDayInsightsData = function computeDayInsightsData(ctx) {
    const {
      React,
      date,
      day,
      eatenKcal,
      optimum,
      caloricDebt,
      prof,
      pIndex,
      U,
      products,
      sparklineData,
      fmtDate,
      M,
      getMealType,
      getMealQualityScore,
      HEYS: heysGlobal
    } = ctx || {};

    if (!React) return {};

    const HEYSRef = heysGlobal || global.HEYS || {};
    const safeDay = day || {};
    const safeMeals = safeDay.meals || [];
    const safeProducts = products || [];
    const safeU = U || HEYSRef.utils || {};

    // Тренд калорий за последние N дней (среднее превышение/дефицит)
    const kcalTrend = React.useMemo(() => {
      if (!sparklineData || sparklineData.length < 3 || !optimum || optimum <= 0) return null;

      try {
        // Считаем среднее отклонение от нормы (исключая сегодня и неполные дни <50%)
        const pastDays = sparklineData.filter(d => {
          if (d.isToday) return false;
          if (d.kcal <= 0) return false;
          // Исключаем дни с <50% заполненности — вероятно незаполненные
          const ratio = d.target > 0 ? d.kcal / d.target : 0;
          return ratio >= 0.5;
        });
        if (pastDays.length < 2) return null;

        const avgKcal = pastDays.reduce((sum, d) => sum + d.kcal, 0) / pastDays.length;
        const diff = avgKcal - optimum;
        const diffPct = Math.round((diff / optimum) * 100);

        let direction = 'same';
        let text = '';

        if (diffPct <= -5) {
          direction = 'deficit';
          text = 'Дефицит ' + Math.abs(diffPct) + '%';
        } else if (diffPct >= 5) {
          direction = 'excess';
          text = 'Избыток ' + diffPct + '%';
        } else {
          direction = 'same';
          text = 'В норме';
        }

        return { text, diff, direction, avgKcal: Math.round(avgKcal) };
      } catch (e) {
        return null;
      }
    }, [sparklineData, optimum]);

    // === BALANCE VIZ — Мини-график баланса за неделю ===
    // Визуализация для карточки "Инсайты недели"
    const balanceViz = React.useMemo(() => {
      // Если нет caloricDebt — создаём базовую визуализацию из текущего дня
      const dayBreakdown = caloricDebt?.dayBreakdown || [];

      // Если вообще нет данных — показываем хотя бы текущий день
      if (dayBreakdown.length === 0) {
        const todayDelta = Math.round((eatenKcal || 0) - (optimum || 0));
        const todayRatio = optimum > 0 ? (eatenKcal || 0) / optimum : 0;

        // Цвет для текущего дня
        let todayColor;
        if (Math.abs(todayDelta) <= 100) {
          todayColor = '#22c55e';
        } else if (todayDelta < 0) {
          todayColor = '#eab308';
        } else {
          todayColor = '#ef4444';
        }

        const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        const todayIdx = new Date().getDay();

        return {
          viz: [{
            bar: todayDelta > 0 ? '▅' : todayDelta < -200 ? '▂' : '▄',
            color: todayColor,
            delta: todayDelta,
            day: dayNames[todayIdx],
            date: new Date().toISOString().split('T')[0],
            eaten: Math.round(eatenKcal || 0),
            target: Math.round(optimum || 0),
            hasTraining: (safeDay.trainings || []).length > 0,
            ratio: todayRatio
          }],
          insights: [{
            type: 'today',
            emoji: '📊',
            text: 'Сегодня: ' + (todayDelta > 0 ? '+' : '') + todayDelta + ' ккал от нормы',
            color: todayColor
          }],
          totalBalance: todayDelta,
          daysCount: 1
        };
      }

      const { totalBalance, trend, goalMode } = caloricDebt || {};

      // Столбики для визуализации
      const bars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

      // Находим максимальную дельту для нормализации
      const maxDelta = Math.max(...dayBreakdown.map(d => Math.abs(d.delta)), 100);

      const viz = dayBreakdown.map(d => {
        // Нормализуем дельту к высоте столбика (0-7)
        const normalized = Math.min(Math.abs(d.delta) / maxDelta, 1);
        const barIdx = Math.floor(normalized * 7);

        // Цвет: зелёный = в норме (±100), жёлтый = недобор, красный = перебор
        let color;
        if (Math.abs(d.delta) <= 100) {
          color = '#22c55e'; // Зелёный — баланс
        } else if (d.delta < 0) {
          color = '#eab308'; // Жёлтый — недобор
        } else {
          color = '#ef4444'; // Красный — перебор
        }

        return {
          bar: bars[barIdx],
          color,
          delta: d.delta,
          day: d.dayName,
          date: d.date,
          eaten: d.eaten,
          target: d.target,
          hasTraining: d.hasTraining,
          ratio: d.ratio,
          dayOfWeek: new Date(d.date).getDay() // 0=Вс, 6=Сб
        };
      });

      // === РАЗДЕЛЯЕМ ИНСАЙТЫ ===
      // 1. balanceInsights — про перебор/баланс (для карточки перебора)
      // 2. scienceInsights — научная аналитика (для "Инсайты недели")

      const balanceInsights = [];
      const scienceInsights = [];

      // === SEVERITY для тона сообщений ===
      const severity = caloricDebt?.severity || 0;
      const severityTone = severity >= 3 ? 'critical' : severity >= 2 ? 'warning' : 'mild';

      // === ИНСАЙТЫ БАЛАНСА (для карточки перебора) ===

      // 1. Тренд с severity-dependent текстом
      if (trend && trend.direction !== 'stable') {
        let trendText = trend.text;
        if (trend.direction === 'worsening' && severity >= 2) {
          trendText = 'Перебор нарастает — нужно действовать';
        }
        balanceInsights.push({
          type: 'trend',
          emoji: trend.emoji,
          text: trendText,
          color: trend.direction === 'improving' ? '#22c55e' : '#ef4444',
          priority: 1
        });
      }

      // 2. Паттерн выходных — ИСПРАВЛЕНО: по dayOfWeek, не по индексу
      const weekendDays = viz.filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6); // Вс или Сб
      const weekdayDays = viz.filter(d => d.dayOfWeek >= 1 && d.dayOfWeek <= 5); // Пн-Пт
      const weekendAvg = weekendDays.length > 0 ? weekendDays.reduce((s, d) => s + d.delta, 0) / weekendDays.length : 0;
      const weekdayAvg = weekdayDays.length > 0 ? weekdayDays.reduce((s, d) => s + d.delta, 0) / weekdayDays.length : 0;

      if (weekendDays.length > 0 && weekendAvg > weekdayAvg + 100) {
        const diff = Math.round(weekendAvg - weekdayAvg);
        balanceInsights.push({
          type: 'pattern',
          emoji: '🎉',
          text: 'В выходные +' + diff + ' ккал к будням',
          color: '#f59e0b',
          priority: 2
        });
      }

      // 3. 🔬 EPOC-adjusted перебор (научно!)
      // EPOC = 6-15% от калорий тренировки (PMID: 12882417)
      const totalTrainingKcal = caloricDebt?.totalTrainingKcal || 0;
      const epocKcal = Math.round(totalTrainingKcal * 0.12); // 12% — средний EPOC
      const netExcess = (totalBalance || 0) - epocKcal;

      if (totalTrainingKcal > 100 && epocKcal > 30) {
        balanceInsights.push({
          type: 'epoc',
          emoji: '🔥',
          text: 'EPOC сжёг ещё ~' + epocKcal + ' ккал после тренировок',
          color: '#22c55e',
          priority: 3,
          pmid: '12882417'
        });
      }

      // 4. ⏰ Тайминг перебора — когда съедены лишние калории
      // Анализируем приёмы пищи за текущий день
      const todayMeals = safeDay.meals || [];
      if (todayMeals.length >= 2 && totalBalance > 100) {
        const mealsByTime = todayMeals.map(m => {
          const hour = parseInt((m.time || '12:00').split(':')[0], 10);
          const mealKcal = (m.items || []).reduce((sum, item) => {
            const prod = pIndex?.byId?.get?.(item.product_id);
            const kcal100 = prod?.kcal100 || item.kcal100 || 0;
            return sum + (kcal100 * (item.grams || 0) / 100);
          }, 0);
          return { hour, kcal: mealKcal };
        });

        const eveningKcal = mealsByTime.filter(m => m.hour >= 19).reduce((s, m) => s + m.kcal, 0);
        const totalDayKcal = mealsByTime.reduce((s, m) => s + m.kcal, 0);
        const eveningPct = totalDayKcal > 0 ? Math.round(eveningKcal / totalDayKcal * 100) : 0;

        if (eveningPct >= 45) {
          balanceInsights.push({
            type: 'timing',
            emoji: '🌙',
            text: eveningPct + '% калорий после 19:00 — ↓термогенез',
            color: '#f59e0b',
            priority: 2,
            pmid: '31064667' // Ночное питание и метаболизм
          });
        }
      }

      // 5. 📈 Умный прогноз с учётом паттерна выходных
      if (dayBreakdown.length >= 3) {
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=Вс
        const remainingDays = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

        // Считаем средние для будней и выходных отдельно
        const weekdayAvgDelta = weekdayDays.length > 0 ? weekdayDays.reduce((s, d) => s + d.delta, 0) / weekdayDays.length : 0;
        const weekendAvgDelta = weekendDays.length > 0 ? weekendDays.reduce((s, d) => s + d.delta, 0) / weekendDays.length : weekdayAvgDelta * 1.3;

        // Прогноз с учётом типа оставшихся дней
        let forecastDelta = 0;
        for (let d = dayOfWeek + 1; d <= 7; d++) {
          const dow = d % 7;
          forecastDelta += (dow === 0 || dow === 6) ? weekendAvgDelta : weekdayAvgDelta;
        }

        const forecastBalance = (totalBalance || 0) + forecastDelta;

        if (remainingDays > 0) {
          balanceInsights.push({
            type: 'forecast',
            emoji: forecastBalance > 300 ? '📈' : forecastBalance < -300 ? '📉' : '✅',
            text: 'К воскресенью: ' + (forecastBalance > 0 ? '+' : '') + Math.round(forecastBalance) + ' ккал',
            color: Math.abs(forecastBalance) <= 300 ? '#22c55e' : forecastBalance > 0 ? '#ef4444' : '#f59e0b',
            priority: 3
          });
        }
      }

      // 6. 🧬 Forbes equation — научный расчёт влияния на вес
      // Forbes: ΔFat = ΔEnergy × (Fat% / (Fat% + 10.4))
      // При жире 25%: ~70% перебора → жир, 30% → гликоген+вода
      // PMID: 10365981
      const bodyFatPct = prof?.bodyFatPct || 25; // Предполагаем 25% если не указано
      const forbesFatRatio = bodyFatPct / (bodyFatPct + 10.4);
      const fatGain = Math.round(Math.abs(totalBalance || 0) * forbesFatRatio / 9); // 9 ккал/г жира
      const glycogenWater = Math.round(Math.abs(totalBalance || 0) * (1 - forbesFatRatio) / 4); // гликоген + вода

      if (Math.abs(totalBalance || 0) >= 200) {
        const sign = totalBalance > 0 ? '+' : '−';
        balanceInsights.push({
          type: 'forbes',
          emoji: '🧬',
          text: sign + fatGain + 'г жира, ' + sign + glycogenWater + 'г воды/гликогена',
          color: '#64748b',
          priority: 4,
          pmid: '10365981'
        });
      }

      // 7. 🎯 Контекст цели
      const currentGoalMode = goalMode || 'maintenance';
      const deficitPct = prof?.deficitPctTarget || safeDay.deficitPct || 0;

      if (currentGoalMode === 'loss' && totalBalance > 200) {
        // Сколько дней прогресса потеряно
        const dailyDeficit = optimum * Math.abs(deficitPct) / 100;
        const daysLost = dailyDeficit > 0 ? Math.round(totalBalance / dailyDeficit * 10) / 10 : 0;

        if (daysLost >= 0.5) {
          balanceInsights.push({
            type: 'goal',
            emoji: '🎯',
            text: '~' + daysLost + ' дн прогресса к цели упущено',
            color: '#ef4444',
            priority: 2
          });
        }
      }

      // 8. 💧 Гидратация и "ложный" вес
      // Углеводы задерживают воду: 1г углеводов = 3-4г воды
      if (caloricDebt?.dayBreakdown?.length > 0) {
        const yesterdayIdx = caloricDebt.dayBreakdown.length - 2;
        if (yesterdayIdx >= 0) {
          const yesterday = caloricDebt.dayBreakdown[yesterdayIdx];
          // Если вчера был большой перебор, сегодня может быть +вес (вода)
          if (yesterday.delta > 300) {
            balanceInsights.push({
              type: 'water',
              emoji: '💧',
              text: 'Вчерашние углеводы → +' + Math.round(yesterday.delta * 0.3 / 100) * 100 + 'г воды сегодня',
              color: '#3b82f6',
              priority: 5
            });
          }
        }
      }

      // Сортируем по приоритету
      balanceInsights.sort((a, b) => (a.priority || 99) - (b.priority || 99));

      // === НАУЧНЫЕ ИНСАЙТЫ (для блока "Инсайты недели") ===
      if (caloricDebt?.scientificInsights) {
        caloricDebt.scientificInsights.slice(0, 6).forEach(sci => {
          if (sci && sci.insight) {
            scienceInsights.push({
              type: sci.type || 'science',
              emoji: sci.insight.charAt(0) === '✅' || sci.insight.charAt(0) === '🔥' ? sci.insight.charAt(0) : '🔬',
              text: sci.insight.replace(/^[^\s]+\s/, ''), // Убираем первый эмодзи
              color: sci.insight.includes('⚠️') || sci.insight.includes('📉') ? '#f59e0b' : '#22c55e',
              pmid: sci.pmid
            });
          }
        });
      }

      return {
        viz,
        balanceInsights,    // Для карточки перебора
        scienceInsights,    // Для блока "Инсайты недели"
        insights: balanceInsights, // Совместимость со старым кодом
        totalBalance,
        netExcess,          // EPOC-adjusted
        epocKcal,           // Сколько EPOC сжёг
        fatGain,            // Forbes: граммы жира
        glycogenWater,      // Forbes: гликоген+вода
        daysCount: dayBreakdown.length,
        severityTone        // mild/warning/critical
      };
    }, [caloricDebt, eatenKcal, optimum, safeDay.trainings, safeDay.meals, pIndex, prof]);

    // Данные для heatmap текущей недели (пн-вс)
    const weekHeatmapData = React.useMemo(() => {
      if (!date || !fmtDate) {
        return {
          days: [],
          inNorm: 0,
          withData: 0,
          streak: 0,
          weekendPattern: null,
          avgRatioPct: 0,
          totalEaten: 0,
          totalBurned: 0,
          avgTargetDeficit: prof?.deficitPctTarget || 0
        };
      }

      // Парсим текущую дату правильно (без timezone issues)
      const [year, month, dayNum] = date.split('-').map(Number);
      const today = new Date(year, month - 1, dayNum);
      const now = new Date();
      const nowDateStr = fmtDate(now);

      // Находим понедельник текущей недели
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);

      // Используем те же данные что и sparklineData (activeDays)
      const getActiveDaysForMonth = (HEYSRef.dayUtils && HEYSRef.dayUtils.getActiveDaysForMonth) || (() => new Map());
      const allActiveDays = new Map();

      // Собираем данные за текущий и предыдущий месяц (неделя может охватывать 2 месяца)
      for (let monthOffset = 0; monthOffset >= -1; monthOffset--) {
        const checkDate = new Date(today);
        checkDate.setMonth(checkDate.getMonth() + monthOffset);
        const monthData = getActiveDaysForMonth(checkDate.getFullYear(), checkDate.getMonth(), prof, safeProducts);
        monthData.forEach((v, k) => allActiveDays.set(k, v));
      }

      const days = [];
      const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      let streak = 0;
      let weekendExcess = 0;
      let weekdayAvg = 0;
      let weekendCount = 0;
      let weekdayCount = 0;

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = fmtDate(d);
        const isFuture = dateStr > nowDateStr;
        const isToday = dateStr === date;
        const isWeekend = i >= 5;

        // Загружаем данные дня из activeDays
        let ratio = null;
        let kcal = 0;
        let status = 'empty'; // empty | low | green | yellow | red | perfect
        let isRefeedDay = false; // Загрузочный день

        // Используем централизованный ratioZones
        const rz = HEYSRef.ratioZones;

        if (!isFuture) {
          const dayInfo = allActiveDays.get(dateStr);
          isRefeedDay = dayInfo?.isRefeedDay || false;

          if (dayInfo && dayInfo.kcal > 0) {
            kcal = dayInfo.kcal;
            const target = dayInfo.target || optimum;
            if (kcal > 0 && target > 0) {
              ratio = kcal / target;
              // Используем ratioZones для определения статуса — с учётом refeed
              if (isRefeedDay && rz && rz.getDayZone) {
                // Refeed: используем расширенные зоны (до 1.35 = ok)
                const refeedZone = rz.getDayZone(ratio, { isRefeedDay: true });
                status = refeedZone.id === 'refeed_ok' ? 'green' :
                         refeedZone.id === 'refeed_under' ? 'yellow' : 'red';
              } else {
                status = rz ? rz.getHeatmapStatus(ratio) : 'empty';
              }

              // Считаем streak (последовательные успешные дни — green) — с учётом refeed
              const isSuccess = rz?.isStreakDayWithRefeed
                ? rz.isStreakDayWithRefeed(ratio, { isRefeedDay })
                : (rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.1));
              if (isSuccess && (days.length === 0 || days[days.length - 1].status === 'green')) {
                streak++;
              } else if (!isSuccess) {
                streak = 0;
              }

              // Статистика для паттерна выходных
              if (isWeekend) {
                weekendExcess += ratio;
                weekendCount++;
              } else {
                weekdayAvg += ratio;
                weekdayCount++;
              }
            }
          }
        }

        days.push({
          date: dateStr,
          name: dayNames[i],
          dayNumber: d.getDate(), // Число месяца (15, 16, 17...)
          status: isToday && status === 'empty' ? 'in-progress' : status, // Сегодня без данных = "в процессе"
          ratio,
          kcal: Math.round(kcal),
          isToday,
          isFuture,
          isWeekend,
          isRefeedDay, // Загрузочный день
          isPerfect: ratio && rz ? rz.isPerfect(ratio) : false, // Идеальный день (0.9-1.1)
          // Градиентный цвет из ratioZones
          bgColor: ratio && rz ? rz.getGradientColor(ratio, 0.6) : null
        });
      }

      const inNorm = days.filter(d => d.status === 'green' || d.status === 'perfect').length;
      const withData = days.filter(d => d.status !== 'empty' && !d.isFuture).length;

      // Средний ratio в процентах за неделю (% от нормы)
      const daysWithRatio = days.filter(d => d.ratio !== null && d.ratio > 0);
      const avgRatioPct = daysWithRatio.length > 0
        ? Math.round(daysWithRatio.reduce((sum, d) => sum + (d.ratio * 100), 0) / daysWithRatio.length)
        : 0;

      // Паттерн выходных
      let weekendPattern = null;
      if (weekendCount > 0 && weekdayCount > 0) {
        const avgWeekend = weekendExcess / weekendCount;
        const avgWeekday = weekdayAvg / weekdayCount;
        const diff = Math.round((avgWeekend - avgWeekday) * 100);
        if (Math.abs(diff) >= 10) {
          weekendPattern = diff > 0
            ? 'По выходным +' + diff + '% калорий'
            : 'По выходным ' + diff + '% калорий';
        }
      }

      // 🆕 Суммы калорий за неделю (потрачено / съедено) + средний целевой дефицит
      let totalEaten = 0;
      let totalBurned = 0;
      let totalTargetDeficit = 0;
      let daysWithDeficit = 0;

      days.forEach(d => {
        if (d.kcal > 0) {
          totalEaten += d.kcal;
          // Загружаем полные данные дня для расчёта TDEE
          const dayData = safeU.lsGet ? safeU.lsGet('heys_dayv2_' + d.date, null) : null;
          if (dayData && HEYSRef.TDEE?.calculate) {
            // Используем централизованный модуль TDEE
            const tdeeResult = HEYSRef.TDEE.calculate(dayData, prof, { lsGet: safeU.lsGet, includeNDTE: true });
            totalBurned += tdeeResult.tdee;
            // Собираем целевой дефицит каждого дня
            totalTargetDeficit += tdeeResult.deficitPct || 0;
            daysWithDeficit++;
          } else {
            // Fallback на норму если модуль не загружен
            const dayTarget = allActiveDays.get(d.date)?.target || optimum;
            totalBurned += dayTarget;
            totalTargetDeficit += prof?.deficitPctTarget || 0;
            daysWithDeficit++;
          }
        }
      });

      // Средний целевой дефицит за эти дни
      const avgTargetDeficit = daysWithDeficit > 0 ? Math.round(totalTargetDeficit / daysWithDeficit) : (prof?.deficitPctTarget || 0);

      return { days, inNorm, withData, streak, weekendPattern, avgRatioPct, totalEaten, totalBurned, avgTargetDeficit };
    }, [date, optimum, pIndex, safeProducts, prof]);

    // === Мини-график калорий по приёмам ===
    const mealsChartData = React.useMemo(() => {
      const meals = safeDay.meals || [];
      if (meals.length === 0) return null;

      // Сортируем по времени для графика (поздние первые — вверху списка)
      const parseTimeToMin = (t) => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      const sortedMeals = [...meals].sort((a, b) => parseTimeToMin(b.time) - parseTimeToMin(a.time));

      const data = sortedMeals.map((meal, mi) => {
        const totals = M && M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0, carbs:0, simple:0, complex:0, prot:0, fat:0, bad:0, good:0, trans:0, fiber:0 };
        // Используем ручной тип если есть, иначе автоопределение
        const autoTypeInfo = getMealType ? getMealType(mi, meal, sortedMeals, pIndex) : { type: 'snack', name: 'Перекус', icon: '🍎' };
        const manualType = meal.mealType;
        const mealTypeInfo = manualType && safeU.MEAL_TYPES && safeU.MEAL_TYPES[manualType]
          ? { type: manualType, ...safeU.MEAL_TYPES[manualType] }
          : autoTypeInfo;
        // Вычисляем activityContext для harmMultiplier
        const mealActCtx = HEYSRef.InsulinWave?.calculateActivityContext?.({
          mealTime: meal.time,
          mealKcal: totals.kcal || 0,
          trainings: safeDay.trainings || [],
          householdMin: safeDay.householdMin || 0,
          steps: safeDay.steps || 0,
          allMeals: sortedMeals
        }) || null;
        const quality = getMealQualityScore ? getMealQualityScore(meal, mealTypeInfo.type, optimum, pIndex, mealActCtx) : null;
        return {
          name: mealTypeInfo.name,
          icon: mealTypeInfo.icon,
          type: mealTypeInfo.type,
          kcal: Math.round(totals.kcal || 0),
          time: meal.time || '',
          quality
        };
      });

      const totalKcal = data.reduce((sum, m) => sum + m.kcal, 0);
      const maxKcal = Math.max(...data.map(m => m.kcal), 1);
      const qualityStreak = (() => {
        // Ищем максимальную последовательность отличных приёмов (≥80)
        let maxStreak = 0;
        let currentStreak = 0;
        for (const m of data) {
          if (m.quality && m.quality.score >= 80) {
            currentStreak += 1;
            maxStreak = Math.max(maxStreak, currentStreak);
          } else {
            currentStreak = 0;
          }
        }
        return maxStreak;
      })();
      const avgQualityScore = data.length > 0
        ? Math.round(data.reduce((sum, m) => sum + (m.quality?.score || 0), 0) / data.length)
        : 0;

      // Лучший приём дня (max score)
      const bestMealIndex = data.reduce((best, m, i) => {
        if (!m.quality) return best;
        if (best === -1) return i;
        return m.quality.score > (data[best]?.quality?.score || 0) ? i : best;
      }, -1);

      // Сравнение с вчера
      const getYesterdayKey = () => {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        return 'heys_meal_avg_' + y.toISOString().slice(0, 10);
      };
      const yesterdayAvgScore = +(localStorage.getItem(getYesterdayKey()) || 0);

      // Сохраняем сегодняшний avg ТОЛЬКО если изменился (чтобы не спамить sync)
      if (avgQualityScore > 0) {
        const todayKey = 'heys_meal_avg_' + new Date().toISOString().slice(0, 10);
        const currentSaved = +(localStorage.getItem(todayKey) || 0);
        if (currentSaved !== avgQualityScore) {
          localStorage.setItem(todayKey, String(avgQualityScore));
        }
      }

      // Debug snapshot
      try {
        HEYSRef.debug = HEYSRef.debug || {};
        HEYSRef.debug.mealsChartData = { meals: data, totalKcal, maxKcal, targetKcal: optimum || 2000, qualityStreak, avgQualityScore };
        HEYSRef.debug.dayProductIndex = pIndex;
      } catch (e) {}

      return { meals: data, totalKcal, maxKcal, targetKcal: optimum || 2000, qualityStreak, avgQualityScore, bestMealIndex, yesterdayAvgScore };
    }, [safeMeals, pIndex, optimum]);

    return {
      kcalTrend,
      balanceViz,
      weekHeatmapData,
      mealsChartData
    };
  };
})(window);
