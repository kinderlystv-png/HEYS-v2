/**
 * heys_widgets_weight_dynamics_v4.js
 * V4 «Динамика веса» — адаптивное окно, сглаживание MA7, спарклайн, недели.
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.Widgets = HEYS.Widgets || {};

  const DEAD_ZONE_KG = 0.2;
  const MA_WINDOW = 7;
  const MAX_HISTORY_DAYS = 35;
  const MONTH_WINDOW = 30;
  const GAP_DASH_DAYS = 3;

  // Дни цикла и рефида из тренда веса исключаются: там вода и гликоген, а не
  // изменение состава. Правило и предикаты те же, что у семидневного тренда дня
  // (heys_day_weight_trends_v1.js) — заводить второй набор нельзя, иначе
  // «чистый тренд» станет означать разное в разных местах.
  function isWaterRetentionDay(dayData, dateStr) {
    if (!dayData) return false;
    const cycleCountDay = HEYS.Cycle?.resolveCycleCountDay?.({
      date: dateStr,
      cycleDay: dayData.cycleDay ?? null
    }) ?? null;
    if (HEYS.Cycle?.shouldExcludeFromWeightTrend?.(cycleCountDay)) return true;
    return !!HEYS.Refeed?.shouldExcludeFromWeightTrend?.(dayData);
  }

  function getWeightFromDay(dayData, dateStr) {
    if (!dayData) return null;
    if (dayData.weightMorningEstimated === true) return null;
    if (dayData.weightMorningSource === 'estimated_avg' || dayData.weightMorningSource === 'estimated_profile') return null;
    if (isWaterRetentionDay(dayData, dateStr)) return null;
    const w = dayData.weightMorning;
    return (w && w > 0) ? w : null;
  }

  function loadDailyWeights(maxDays) {
    const U = HEYS.utils || {};
    const fmtDate = HEYS.dayUtils?.fmtDate || U.fmtDate || ((d) => d.toISOString().split('T')[0]);
    const days = Math.max(7, maxDays || MAX_HISTORY_DAYS);
    const today = new Date();
    const result = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = fmtDate(date);
      const dayData = U.lsGet(`heys_dayv2_${dateStr}`, null);
      const weight = getWeightFromDay(dayData, dateStr);
      result.push({
        date: dateStr,
        weight,
        hasWeight: weight !== null
      });
    }
    return result;
  }

  function countWeighDays(series) {
    return (series || []).filter((d) => d.hasWeight).length;
  }

  // label — подпись плитки. Со словом «вес»: без него плитка не говорила, чего
  // именно динамика (строка контракта «состав дефолта», решение 20 августа).
  // shortLabel — то же окно в винительном падеже для фраз вроде «Сброшено за …».
  function resolveWindow(weighDayCount) {
    if (weighDayCount < 7) {
      return { ready: false, windowDays: 0, label: 'Первые дни', shortLabel: 'Первые дни' };
    }
    if (weighDayCount < 14) {
      return { ready: true, windowDays: 7, label: 'Вес за неделю', shortLabel: 'неделю' };
    }
    if (weighDayCount < 21) {
      return { ready: true, windowDays: 14, label: 'Вес за 2 недели', shortLabel: '2 недели' };
    }
    if (weighDayCount < 28) {
      return { ready: true, windowDays: 21, label: 'Вес за 3 недели', shortLabel: '3 недели' };
    }
    return { ready: true, windowDays: MONTH_WINDOW, label: 'Вес за месяц', shortLabel: 'месяц' };
  }

  function movingAverageAt(series, index, windowSize) {
    const start = Math.max(0, index - windowSize + 1);
    const slice = series.slice(start, index + 1).filter((d) => d.hasWeight);
    if (!slice.length) return null;
    const sum = slice.reduce((s, d) => s + d.weight, 0);
    return sum / slice.length;
  }

  function buildSmoothedSeries(series) {
    return series.map((day, index) => ({
      ...day,
      smoothed: movingAverageAt(series, index, MA_WINDOW)
    }));
  }

  function interpolateSeries(smoothed) {
    const out = smoothed.map((d) => ({ ...d }));
    for (let i = 0; i < out.length; i++) {
      if (out[i].smoothed != null) continue;
      let prev = null;
      let next = null;
      for (let j = i - 1; j >= 0; j--) {
        if (out[j].smoothed != null) { prev = j; break; }
      }
      for (let j = i + 1; j < out.length; j++) {
        if (out[j].smoothed != null) { next = j; break; }
      }
      if (prev == null || next == null) continue;
      const gap = next - prev;
      if (gap > GAP_DASH_DAYS + 1) continue;
      const t = (i - prev) / gap;
      out[i].smoothed = out[prev].smoothed + (out[next].smoothed - out[prev].smoothed) * t;
      out[i].interpolated = true;
    }
    return out;
  }

  function markGapSegments(series) {
    let gapLen = 0;
    return series.map((d) => {
      if (d.hasWeight) {
        gapLen = 0;
        return { ...d, gapDash: false };
      }
      gapLen += 1;
      return { ...d, gapDash: gapLen > GAP_DASH_DAYS };
    });
  }

  function formatDelta(deltaKg) {
    if (!Number.isFinite(deltaKg)) return { text: '—', sign: '' };
    if (Math.abs(deltaKg) <= DEAD_ZONE_KG) {
      return { text: '0,0', sign: '' };
    }
    const sign = deltaKg < 0 ? '−' : '+';
    return { text: Math.abs(deltaKg).toFixed(1).replace('.', ','), sign };
  }

  function resolveGoalDirection(profile, currentWeight, goalWeight) {
    const explicit = profile?.goalDirection;
    if (explicit === 'lose' || explicit === 'gain' || explicit === 'hold') return explicit;
    if (goalWeight && currentWeight) {
      if (goalWeight < currentWeight - 0.05) return 'lose';
      if (goalWeight > currentWeight + 0.05) return 'gain';
    }
    return 'hold';
  }

  function deltaStateForGoal(deltaKg, goalDirection) {
    if (!Number.isFinite(deltaKg)) return 'neutral';
    if (Math.abs(deltaKg) <= DEAD_ZONE_KG) return 'neutral';
    if (goalDirection === 'lose') return deltaKg < 0 ? 'good' : 'bad';
    if (goalDirection === 'gain') return deltaKg > 0 ? 'good' : 'bad';
    return 'neutral';
  }

  function buildWeeklyBars(windowSeries, deltaState) {
    const chunks = [];
    const size = 7;
    for (let i = 0; i < windowSeries.length; i += size) {
      const chunk = windowSeries.slice(i, i + size).filter((d) => d.smoothed != null);
      if (!chunk.length) continue;
      const avg = chunk.reduce((s, d) => s + d.smoothed, 0) / chunk.length;
      chunks.push({ avg, count: chunk.length });
    }
    if (chunks.length < 2) return [];
    const avgs = chunks.map((c) => c.avg);
    const min = Math.min(...avgs);
    const max = Math.max(...avgs);
    const span = Math.max(0.1, max - min);
    return chunks.map((c, idx) => ({
      heightPct: Math.round(20 + ((max - c.avg) / span) * 80),
      isLast: idx === chunks.length - 1,
      state: idx === chunks.length - 1 ? deltaState : 'neutral'
    }));
  }

  function buildSparklinePoints(windowSeries) {
    const pts = windowSeries.filter((d) => d.smoothed != null);
    if (pts.length < 2) return { points: '', last: null, segments: [] };

    const values = pts.map((d) => d.smoothed);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.1 || 0.1;
    const lo = min - pad;
    const hi = max + pad;
    const span = Math.max(0.1, hi - lo);

    const mapped = pts.map((p, i) => {
      const x = 2 + (i / (pts.length - 1)) * 56;
      const y = 22 - ((p.smoothed - lo) / span) * 18;
      return { x, y, gapDash: p.gapDash, interpolated: p.interpolated };
    });

    return {
      points: mapped.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      last: mapped[mapped.length - 1],
      segments: mapped
    };
  }

  // Вид «График» 2×2, кадр «Динамика · E график 2×2 · рисунок 01–03»: поле
  // 121 × 54, кривая ложится в полосу 9…38, заливка под ней уходит вниз до
  // нижнего края поля. Спарклайн 2×1 (58 × 24) остаётся своим — у него другая
  // роль и другой кегль, сводить их в одну функцию нечего.
  const CHART_VIEW = { width: 121, height: 54, padX: 2, top: 9, bottom: 38 };

  function buildChartPoints(windowSeries) {
    const pts = (windowSeries || []).filter((d) => d.smoothed != null);
    if (pts.length < 2) return { points: '', area: '', last: null, days: pts.length };

    const values = pts.map((d) => d.smoothed);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const band = CHART_VIEW.bottom - CHART_VIEW.top;
    const mid = CHART_VIEW.top + band / 2;
    const usableX = CHART_VIEW.width - CHART_VIEW.padX * 2;

    const mapped = pts.map((p, i) => {
      const x = CHART_VIEW.padX + (i / (pts.length - 1)) * usableX;
      // Больший вес — выше: то же направление, что у спарклайна 2×1.
      const y = span > 0 ? CHART_VIEW.top + ((max - p.smoothed) / span) * band : mid;
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    });

    const line = mapped.map((p) => `${p.x},${p.y}`).join(' ');
    const area = `M${mapped[0].x} ${mapped[0].y} `
      + mapped.slice(1).map((p) => `L${p.x} ${p.y}`).join(' ')
      + ` V${CHART_VIEW.height} H${CHART_VIEW.padX} Z`;

    return { points: line, area, last: mapped[mapped.length - 1], days: pts.length };
  }

  function computeGoalMeta(profile, smoothedCurrent) {
    const goalWeight = profile?.weightGoal || profile?.goalWeight || null;
    if (!goalWeight || !Number.isFinite(smoothedCurrent)) {
      return {
        goalWeight: null,
        toGoalKg: null,
        goalReached: false,
        goalProgressPct: null,
        remainderLabel: null,
        remainderShort: null
      };
    }

    const toGoalKg = smoothedCurrent - goalWeight;
    const goalReached = Math.abs(toGoalKg) <= DEAD_ZONE_KG;

    const startWeight = profile?.weight || smoothedCurrent;
    const total = startWeight - goalWeight;
    let goalProgressPct = null;
    if (Math.abs(total) > 0.1) {
      goalProgressPct = Math.max(0, Math.min(100, Math.round((1 - toGoalKg / total) * 100)));
    }

    let remainderLabel = null;
    let remainderShort = null;
    if (goalReached) {
      remainderLabel = 'цель взята';
      remainderShort = 'цель взята';
    } else if (toGoalKg > 0) {
      const abs = Math.abs(toGoalKg).toFixed(1).replace('.', ',');
      remainderLabel = `до цели ${abs}`;
      remainderShort = `осталось ${abs}`;
    } else {
      const abs = Math.abs(toGoalKg).toFixed(1).replace('.', ',');
      remainderLabel = `+${abs} до цели`;
      remainderShort = `осталось ${abs}`;
    }

    return {
      goalWeight,
      toGoalKg,
      goalReached,
      goalProgressPct,
      remainderLabel,
      remainderShort
    };
  }

  function computeWeightDynamicsV4(options = {}) {
    const profile = options.profile || HEYS.utils?.lsGet?.('heys_profile', {}) || {};
    const series = loadDailyWeights(MAX_HISTORY_DAYS);
    const weighDayCount = countWeighDays(series);
    const windowInfo = resolveWindow(weighDayCount);

    const smoothedRaw = buildSmoothedSeries(series);
    const smoothed = markGapSegments(interpolateSeries(smoothedRaw));

    const lastIdx = smoothed.length - 1;
    const smoothedCurrent = smoothed[lastIdx]?.smoothed ?? null;
    const goalDirection = resolveGoalDirection(profile, smoothedCurrent, profile?.weightGoal || profile?.goalWeight);

    if (!windowInfo.ready) {
      const goalMeta = computeGoalMeta(profile, smoothedCurrent);
      return {
        hasDynamics: false,
        placeholder: 'нужна неделя',
        window: windowInfo,
        goalDirection,
        smoothedCurrent,
        ...goalMeta,
        weighDayCount
      };
    }

    const windowStartIdx = Math.max(0, smoothed.length - windowInfo.windowDays);
    const windowSeries = smoothed.slice(windowStartIdx);
    const startSmoothed = windowSeries.find((d) => d.smoothed != null)?.smoothed ?? null;
    const endSmoothed = [...windowSeries].reverse().find((d) => d.smoothed != null)?.smoothed ?? null;

    const deltaKg = (startSmoothed != null && endSmoothed != null)
      ? endSmoothed - startSmoothed
      : null;

    const delta = formatDelta(deltaKg);
    const deltaState = deltaStateForGoal(deltaKg, goalDirection);
    const goalMeta = computeGoalMeta(profile, smoothedCurrent);
    const sparkline = buildSparklinePoints(windowSeries);
    const weeklyBars = buildWeeklyBars(windowSeries, deltaState);
    const monthRateKg = windowInfo.windowDays >= 28 && Number.isFinite(deltaKg)
      ? deltaKg
      : (Number.isFinite(deltaKg) ? (deltaKg / windowInfo.windowDays) * 30 : null);

    return {
      hasDynamics: true,
      placeholder: null,
      window: windowInfo,
      deltaKg,
      delta,
      deltaState,
      goalDirection,
      smoothedCurrent,
      windowSeries,
      sparkline,
      chart: buildChartPoints(windowSeries),
      weeklyBars,
      monthRateKg,
      weighDayCount,
      ...goalMeta
    };
  }

  // Канонический тренд веса для поправки на факт (строка контракта «тренд веса
  // один»): поправка ходит сюда, а не заводит седьмую реализацию. Остальные
  // тренды в проекте не трогаются и в расчёт не входят.
  //
  // Возвращает изменение сглаженного тренда за окно и качество данных, потому
  // что поправке нужно и число, и право его посчитать: гейт требует не меньше
  // шести реальных взвешиваний в окне.
  /**
   * Тот же тренд, но по готовому ряду вместо локального хранилища.
   *
   * Кураторской панели ряд приходит с сервера — клиентского хранилища у неё
   * нет. Считать там «первая точка минус последняя» значило бы завести второй
   * тренд: сглаживание, интерполяция дыр и мёртвая зона остались бы только у
   * клиента, и числа разошлись бы при одинаковых данных. Поэтому ряд входит
   * снаружи, а алгоритм остаётся один.
   *
   * @param {Array<{date:string, weight:number|null, hasWeight:boolean}>} series
   * @param {number} days длина окна
   */
  function trendForSeries(series, days) {
    const windowDays = Math.max(7, days || 21);
    const smoothed = interpolateSeries(buildSmoothedSeries(series || []));
    const windowSeries = smoothed.slice(-windowDays);

    const measuredDays = windowSeries.filter((d) => d.hasWeight).length;
    const withTrend = windowSeries.filter((d) => d.smoothed != null);
    const first = withTrend[0] || null;
    const last = withTrend[withTrend.length - 1] || null;

    return {
      windowDays,
      measuredDays,
      deltaKg: (first && last) ? last.smoothed - first.smoothed : null,
      startSmoothed: first ? first.smoothed : null,
      endSmoothed: last ? last.smoothed : null,
      series: windowSeries
    };
  }

  function trendForWindow(options) {
    const windowDays = Math.max(7, (options && options.days) || 21);
    const series = loadDailyWeights(Math.max(windowDays + MA_WINDOW, MAX_HISTORY_DAYS));
    const smoothed = interpolateSeries(buildSmoothedSeries(series));
    const windowSeries = smoothed.slice(-windowDays);

    const measuredDays = windowSeries.filter((d) => d.hasWeight).length;
    const withTrend = windowSeries.filter((d) => d.smoothed != null);
    const first = withTrend[0] || null;
    const last = withTrend[withTrend.length - 1] || null;
    const deltaKg = (first && last) ? last.smoothed - first.smoothed : null;

    return {
      windowDays,
      measuredDays,
      // Мёртвая зона тренда — своя у виджета; поправке нужно сырое число,
      // округление и «без изменений» решаются на её стороне.
      deltaKg,
      startSmoothed: first ? first.smoothed : null,
      endSmoothed: last ? last.smoothed : null,
      series: windowSeries
    };
  }

  HEYS.Widgets.WeightDynamicsV4 = {
    DEAD_ZONE_KG,
    MA_WINDOW,
    CHART_VIEW,
    compute: computeWeightDynamicsV4,
    buildChartPoints,
    trendForWindow,
    trendForSeries,
    deltaStateForGoal,
    resolveGoalDirection
  };

  console.info('[HEYS.widgets.weightDynamicsV4] ✅ loaded');
})(typeof window !== 'undefined' ? window : globalThis);
