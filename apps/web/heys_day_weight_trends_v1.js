// heys_day_weight_trends_v1.js — extracted weight trend/sparkline computations

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.dayWeightTrends = HEYS.dayWeightTrends || {};

  HEYS.dayWeightTrends.computeWeightTrends = function computeWeightTrends(ctx) {
    const {
      React,
      date,
      day,
      chartPeriod,
      prof,
      fmtDate,
      r1,
      HEYS: heysCtx
    } = ctx || {};

    const H = heysCtx || HEYS;

    const weightTrend = React.useMemo(() => {
      try {
        const today = new Date(date);
        const weights = [];
        const weightsClean = [];
        const clientId = (H && H.currentClientId) || '';
        let hasRetentionDays = false;

        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          const scopedKey = clientId
            ? 'heys_' + clientId + '_dayv2_' + dateStr
            : 'heys_dayv2_' + dateStr;

          let dayData = null;
          try {
            const raw = localStorage.getItem(scopedKey);
            if (raw) {
              dayData = raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
            }
          } catch (e) {}

          if (dayData && dayData.weightMorning != null && dayData.weightMorning !== '' && dayData.weightMorning !== 0) {
            const cycleDayValue = dayData.cycleDay || null;
            const cycleExclude = H.Cycle?.shouldExcludeFromWeightTrend?.(cycleDayValue) || false;
            const refeedExclude = H.Refeed?.shouldExcludeFromWeightTrend?.(dayData) || false;
            const shouldExclude = cycleExclude || refeedExclude;

            const weightEntry = {
              date: dateStr,
              weight: +dayData.weightMorning,
              dayIndex: 6 - i,
              cycleDay: cycleDayValue,
              hasRetention: shouldExclude
            };

            weights.push(weightEntry);

            if (shouldExclude) {
              hasRetentionDays = true;
            } else {
              weightsClean.push(weightEntry);
            }
          }
        }

        if (weights.length < 2) return null;

        const useClean = weightsClean.length >= 2 && hasRetentionDays;
        const dataForTrend = useClean ? weightsClean : weights;

        dataForTrend.sort((a, b) => a.date.localeCompare(b.date));

        const n = dataForTrend.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
          const x = dataForTrend[i].dayIndex;
          const y = dataForTrend[i].weight;
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumX2 += x * x;
        }

        const denominator = n * sumX2 - sumX * sumX;
        const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
        const clampedSlope = Math.max(-0.3, Math.min(0.3, slope));

        const firstWeight = dataForTrend[0].weight;
        const lastWeight = dataForTrend[dataForTrend.length - 1].weight;
        const diff = lastWeight - firstWeight;

        let arrow = '→';
        let direction = 'same';
        if (clampedSlope > 0.03) { arrow = '⬆️'; direction = 'up'; }
        else if (clampedSlope < -0.03) { arrow = '⬇️'; direction = 'down'; }

        const sign = diff > 0 ? '+' : '';
        const format = typeof r1 === 'function' ? r1(diff) : Math.round(diff * 10) / 10;
        const text = arrow + ' ' + sign + format + ' кг';

        return {
          text,
          diff,
          direction,
          slope: clampedSlope,
          dataPoints: n,
          isCleanTrend: useClean,
          retentionDaysExcluded: hasRetentionDays ? weights.length - weightsClean.length : 0
        };
      } catch (e) {
        return null;
      }
    }, [date, day?.weightMorning, day?.cycleDay]);

    const monthForecast = React.useMemo(() => {
      if (!weightTrend || weightTrend.slope === undefined) return null;

      const monthChange = weightTrend.slope * 30;

      if (Math.abs(monthChange) < 0.3 || weightTrend.dataPoints < 3) return null;

      const sign = monthChange > 0 ? '+' : '';
      const format = typeof r1 === 'function' ? r1(monthChange) : Math.round(monthChange * 10) / 10;
      return {
        text: '~' + sign + format + ' кг/мес',
        direction: monthChange < 0 ? 'down' : monthChange > 0 ? 'up' : 'same'
      };
    }, [weightTrend]);

    const weightSparklineData = React.useMemo(() => {
      try {
        const realToday = new Date(date + 'T12:00:00');
        const realTodayStr = date;
        const days = [];
        const clientId = (H && H.currentClientId) || '';

        const todayCycleDay = day?.cycleDay || null;

        const getDayWeight = (dateStr) => {
          const scopedKey = clientId
            ? 'heys_' + clientId + '_dayv2_' + dateStr
            : 'heys_dayv2_' + dateStr;

          try {
            const raw = localStorage.getItem(scopedKey);
            if (!raw) return null;
            const dayData = raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
            if (dayData?.weightMorning > 0) {
              const cycleDayValue = dayData.cycleDay || null;
              const retentionInfo = H.Cycle?.getWaterRetentionInfo?.(cycleDayValue) || { hasRetention: false };
              const trainings = dayData.trainings || [];
              const hasTraining = trainings.some(t => t?.z?.some(z => z > 0));
              const trainingTypes = trainings
                .filter(t => t?.z?.some(z => z > 0))
                .map(t => t.type || 'cardio');
              return {
                weight: +dayData.weightMorning,
                cycleDay: cycleDayValue,
                hasWaterRetention: retentionInfo.hasRetention,
                retentionSeverity: retentionInfo.severity,
                retentionAdvice: retentionInfo.advice,
                hasTraining,
                trainingTypes
              };
            }
          } catch (e) {}
          return null;
        };

        let firstDataDay = null;
        const maxLookback = 60;
        for (let i = maxLookback; i >= 0; i--) {
          const d = new Date(realToday);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);

          if (dateStr === realTodayStr) {
            if (+day?.weightMorning > 0) {
              firstDataDay = dateStr;
              break;
            }
          } else {
            const data = getDayWeight(dateStr);
            if (data) {
              firstDataDay = dateStr;
              break;
            }
          }
        }

        if (!firstDataDay) return [];

        const firstDataDate = new Date(firstDataDay);
        const daysSinceFirstData = Math.floor((realToday - firstDataDate) / (24 * 60 * 60 * 1000)) + 1;

        let startDate;
        let daysToShow;

        if (daysSinceFirstData >= chartPeriod - 1) {
          startDate = new Date(realToday);
          startDate.setDate(startDate.getDate() - (chartPeriod - 2));
          daysToShow = chartPeriod - 1;
        } else {
          startDate = firstDataDate;
          daysToShow = daysSinceFirstData;
        }

        for (let i = 0; i < daysToShow; i++) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + i);
          const dateStr = fmtDate(d);
          const isRealToday = dateStr === realTodayStr;

          if (isRealToday) {
            const todayWeight = +day?.weightMorning || 0;
            if (todayWeight > 0) {
              const retentionInfo = H.Cycle?.getWaterRetentionInfo?.(todayCycleDay) || { hasRetention: false };
              const trainings = day?.trainings || [];
              const hasTraining = trainings.some(t => t?.z?.some(z => z > 0));
              const trainingTypes = trainings
                .filter(t => t?.z?.some(z => z > 0))
                .map(t => t.type || 'cardio');
              days.push({
                date: dateStr,
                weight: todayWeight,
                isToday: true,
                dayNum: dateStr.slice(-2).replace(/^0/, ''),
                cycleDay: todayCycleDay,
                hasWaterRetention: retentionInfo.hasRetention,
                retentionSeverity: retentionInfo.severity,
                retentionAdvice: retentionInfo.advice,
                hasTraining,
                trainingTypes
              });
            }
            continue;
          }

          const data = getDayWeight(dateStr);
          if (data) {
            days.push({
              date: dateStr,
              weight: data.weight,
              isToday: false,
              dayNum: dateStr.slice(-2).replace(/^0/, ''),
              cycleDay: data.cycleDay,
              hasWaterRetention: data.hasWaterRetention,
              retentionSeverity: data.retentionSeverity,
              retentionAdvice: data.retentionAdvice,
              hasTraining: data.hasTraining,
              trainingTypes: data.trainingTypes
            });
          }
        }

        if (days.length >= 2) {
          const recentDays = days.slice(-7);
          const weights = recentDays.map(d => d.weight);
          const n = weights.length;

          let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
          for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += weights[i];
            sumXY += i * weights[i];
            sumX2 += i * i;
          }
          const denominator = n * sumX2 - sumX * sumX;
          const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;

          const clampedSlope = Math.max(-0.3, Math.min(0.3, slope));

          const lastWeight = weights[n - 1];

          const tomorrowDate = new Date(realToday);
          tomorrowDate.setDate(tomorrowDate.getDate() + 1);
          const tomorrowStr = fmtDate(tomorrowDate);

          const forecastWeight = lastWeight + clampedSlope;

          days.push({
            date: tomorrowStr,
            weight: Math.round(forecastWeight * 10) / 10,
            isToday: false,
            isFuture: true,
            dayNum: tomorrowStr.slice(-2).replace(/^0/, ''),
            cycleDay: null,
            hasWaterRetention: false
          });
        }

        return days;
      } catch (e) {
        return [];
      }
    }, [date, day?.weightMorning, day?.cycleDay, chartPeriod, prof?.weightGoal]);

    const cycleHistoryAnalysis = React.useMemo(() => {
      if (!day?.cycleDay) return null;

      try {
        const lsGet = (key, def) => {
          const clientId = (H && H.currentClientId) || '';
          const scopedKey = clientId ? 'heys_' + clientId + '_' + key.replace('heys_', '') : key;
          try {
            const raw = localStorage.getItem(scopedKey);
            if (!raw) return def;
            return raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
          } catch (e) { return def; }
        };

        const analysis = H.Cycle?.analyzeWaterRetentionHistory?.(6, lsGet);
        const forecast = H.Cycle?.getWeightNormalizationForecast?.(day?.cycleDay);

        return {
          ...analysis,
          forecast
        };
      } catch (e) {
        return null;
      }
    }, [day?.cycleDay]);

    return { weightTrend, monthForecast, weightSparklineData, cycleHistoryAnalysis };
  };
})();
