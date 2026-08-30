// heys_day_stats_v1.js — Stats block rendering component
// Extracted from heys_day_v12.js (PR-1: Step 2/3)
// Renders statistics card with energy, macros, sparklines, weight tracking

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  // Профиль и цели живут во вкладке 'user' (вкладки 'profile' не существует).
  // Переключатель регистрирует heys_app_tab_state_v1.js; HEYS.openProfileModal
  // не существует ни в одном модуле, поэтому прежний вызов был мёртвым.
  function openProfileTab() {
    const setTab = HEYS.App?.setTab || HEYS.ui?.switchTab;
    if (typeof setTab !== 'function') return false;
    setTab('user');
    return true;
  }

  function resetMorningCheckinDay(day, nowTs = Date.now()) {
    return {
      ...(day || {}),
      weightMorning: '',
      sleepStart: '',
      sleepEnd: '',
      sleepHours: '',
      sleepQuality: '',
      updatedAt: nowTs
    };
  }

  function reportsR1(v) {
    return Math.round((+v || 0) * 10) / 10;
  }

  function formatReportsDayLabel(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return dateStr;
    const wd = d.toLocaleDateString('ru-RU', { weekday: 'short' });
    const dm = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return wd + ' · ' + dm;
  }

  // Контракт «Дисциплина»: entries текущего окна берут ккал/план из точек
  // спарклайна, прошлое окно той же длины пересчитывается через
  // dayUtils.getDayData (ккал требует индекс продуктов). Прошлое окно
  // опционально: без него Δ строк будет «—», матрица не ломается.
  function buildDisciplineEntries(points, chartPeriod, lsGet, clientId) {
    const readDay = (dateStr) => {
      if (typeof lsGet !== 'function' || !dateStr) return null;
      const scopedKey = clientId ? 'heys_' + clientId + '_dayv2_' + dateStr : 'heys_dayv2_' + dateStr;
      return lsGet(scopedKey, null) || lsGet('heys_dayv2_' + dateStr, null) || null;
    };
    const cur = points.map((p) => ({
      day: readDay(p.date),
      kcal: +p.kcal || 0,
      target: +p.target || 0
    }));
    const prev = [];
    try {
      const firstDate = points.length ? points[0].date : null;
      const getDayData = HEYS.dayUtils && HEYS.dayUtils.getDayData;
      if (firstDate && typeof getDayData === 'function') {
        const productsMap = HEYS.dayUtils.getProductsMap ? HEYS.dayUtils.getProductsMap() : new Map();
        const profile = (typeof lsGet === 'function' && lsGet('heys_profile', {})) || {};
        const resolvePlan = HEYS.DisciplineMatrix && HEYS.DisciplineMatrix.resolveDayPlan;
        const first = new Date(firstDate + 'T12:00:00');
        for (let i = 1; i <= chartPeriod; i++) {
          const d = new Date(first);
          d.setDate(d.getDate() - i);
          const ds = d.toISOString().slice(0, 10);
          const info = getDayData(ds, productsMap, {}) || null;
          const dayRow = readDay(ds);
          // План прошлого дня: сохранённая норма, иначе считаем движком —
          // иначе день выпадал из знаменателя Δ и периоды сравнивались по
          // разному числу дней.
          const target = typeof resolvePlan === 'function'
            ? resolvePlan(dayRow, info ? info.savedDisplayOptimum : 0, profile)
            : (info ? +info.savedDisplayOptimum || 0 : 0);
          prev.push({
            day: dayRow,
            kcal: info ? +info.kcal || 0 : 0,
            target
          });
        }
      }
    } catch (e) { /* Δ опциональна */ }
    return { cur, prev };
  }

  // Контракт reports-insights.v4, ярус «Неделя к неделе» (строки «состав»,
  // «неполные дни», «не советует и не предсказывает»): четыре последние
  // ЗАКРЫТЫЕ недели, новая сверху; три колонки — средний ±ккал в день, Δ веса
  // за неделю, Score недели. Незакрытая текущая не попадает. Оценок и
  // экстраполяции здесь нет: только измеренное.
  function buildWeeklyRows(lsGet, clientId, weeksCount) {
    if (typeof lsGet !== 'function') return [];
    const weeks = weeksCount || 4;
    const hasAnyData = HEYS.DisciplineMatrix && HEYS.DisciplineMatrix.hasAnyData;
    if (typeof hasAnyData !== 'function') return [];

    const readDay = (ds) => {
      const scopedKey = clientId ? 'heys_' + clientId + '_dayv2_' + ds : 'heys_dayv2_' + ds;
      return lsGet(scopedKey, null) || lsGet('heys_dayv2_' + ds, null) || null;
    };
    const iso = (d) => d.toISOString().slice(0, 10);

    // Понедельник текущей недели: всё, что раньше него, — закрытые недели.
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7; // 0 = понедельник
    const thisMonday = new Date(today);
    thisMonday.setDate(thisMonday.getDate() - dow);

    // Score по датам — из той же серии, что плитка итога (шкала одна).
    let scoreByDate = {};
    let formatScore = null;
    try {
      const cc = HEYS.CascadeCard;
      if (cc && typeof cc.getCrsRawTrend === 'function') {
        const trend = cc.getCrsRawTrend(clientId || undefined);
        (trend && trend.series ? trend.series : []).forEach((pt) => {
          if (pt && pt.date) scoreByDate[pt.date] = pt.raw;
        });
        formatScore = typeof cc.formatHeysScoreNumber === 'function' ? cc.formatHeysScoreNumber : null;
      }
    } catch (e) { scoreByDate = {}; }

    const productsMap = (() => {
      try {
        return HEYS.dayUtils && HEYS.dayUtils.getProductsMap ? HEYS.dayUtils.getProductsMap() : new Map();
      } catch (e) { return new Map(); }
    })();
    const getDayData = HEYS.dayUtils && HEYS.dayUtils.getDayData;
    const resolvePlan = HEYS.DisciplineMatrix && HEYS.DisciplineMatrix.resolveDayPlan;
    const weeklyProfile = lsGet('heys_profile', {}) || {};

    const rows = [];
    for (let w = 1; w <= weeks; w++) {
      const monday = new Date(thisMonday);
      monday.setDate(monday.getDate() - 7 * w);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);

      let filledDays = 0;
      let planSum = 0;
      let planDays = 0;
      let firstWeight = null;
      let lastWeight = null;

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        const ds = iso(d);
        const row = readDay(ds);
        // Единый счётчик зоны: дни, помеченные «не заполнял», не в счёт.
        if (!row || !hasAnyData(row)) continue;
        filledDays++;

        if (typeof getDayData === 'function') {
          const info = getDayData(ds, productsMap, {});
          const kcal = info ? +info.kcal || 0 : 0;
          // План: сохранённая норма дня, иначе считаем движком — иначе
          // неделя со старыми днями сравнивалась бы по меньшему числу дней.
          const target = typeof resolvePlan === 'function'
            ? resolvePlan(row, info ? info.savedDisplayOptimum : 0, weeklyProfile)
            : (info ? +info.savedDisplayOptimum || 0 : 0);
          if (kcal > 0 && target > 0) {
            planSum += kcal - target;
            planDays++;
          }
        }

        const weight = +row.weightMorning || 0;
        const estimated = row.weightMorningEstimated === true
          || row.weightMorningSource === 'estimated_avg'
          || row.weightMorningSource === 'estimated_profile';
        if (weight > 0 && !estimated) {
          if (firstWeight === null) firstWeight = weight;
          lastWeight = weight;
        }
      }

      if (!filledDays) continue;

      const rawScore = scoreByDate[iso(sunday)];
      const score = (typeof rawScore === 'number' && formatScore) ? formatScore(rawScore) : null;

      // Контракт «порог строки недели»: неделя показывается всегда, но при
      // меньше четырёх днях с записями числа «к плану» и «вес» не считаются —
      // на их месте прочерки, а пометка называет счёт. Строку не убираем:
      // дыра в хронологии читалась бы как отсутствие недели, а не данных.
      // Порог тот же, что у счёта «день ведён» — 4 из 7.
      const MIN_DAYS_FOR_WEEK_NUMBERS = 4;
      const enoughForNumbers = filledDays >= MIN_DAYS_FOR_WEEK_NUMBERS;

      rows.push({
        key: iso(monday),
        label: monday.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
          + '—' + sunday.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        filledDays,
        isPartial: filledDays < 7,
        planAvg: (enoughForNumbers && planDays) ? Math.round(planSum / planDays) : null,
        weightDelta: (enoughForNumbers && firstWeight !== null && lastWeight !== null && lastWeight !== firstWeight)
          ? Math.round((lastWeight - firstWeight) * 10) / 10
          : null,
        score: enoughForNumbers ? score : null
      });
    }
    return rows;
  }

  function buildReportsPeriodMeta(sparklineData, chartPeriod, ratioZones, lsGet, clientId) {
    const points = (sparklineData || []).filter((p) => p && !p.isFuture && !p.isIncomplete);
    const withKcal = points.filter((p) => p.kcal > 0);
    const totalEaten = Math.round(withKcal.reduce((s, p) => s + p.kcal, 0));
    const totalPlan = Math.round(withKcal.reduce((s, p) => s + (p.target || 0), 0));
    const balance = totalEaten - totalPlan;
    const dates = withKcal.map((p) => p.date).filter(Boolean);
    const dateRange = HEYS.SparklinesShared?.formatDateRange?.(dates) || '';

    let inNorm = 0;
    withKcal.forEach((p) => {
      const ratio = p.target > 0 ? p.kcal / p.target : 0;
      if (ratioZones?.isSuccess?.(ratio)) inNorm++;
    });

    const scoredDays = withKcal.filter((p) => p.dayScore > 0);
    const avgScore = scoredDays.length
      ? reportsR1(scoredDays.reduce((s, p) => s + p.dayScore, 0) / scoredDays.length)
      : null;

    const sleepVals = [];
    const moodVals = [];
    const wellbeingVals = [];

    withKcal.forEach((p) => {
      let mood = +p.moodAvg || 0;
      let wellbeing = +p.wellbeingAvg || 0;
      if ((!mood || !wellbeing) && typeof lsGet === 'function' && p.date) {
        const scopedKey = clientId ? 'heys_' + clientId + '_dayv2_' + p.date : 'heys_dayv2_' + p.date;
        const dayRow = lsGet(scopedKey, null) || lsGet('heys_dayv2_' + p.date, null);
        if (dayRow) {
          if (!mood) mood = +dayRow.moodAvg || +dayRow.moodMorning || 0;
          if (!wellbeing) wellbeing = +dayRow.wellbeingAvg || +dayRow.wellbeingMorning || 0;
        }
      }
      if (p.sleepHours > 0) sleepVals.push(+p.sleepHours);
      if (mood > 0) moodVals.push(mood);
      if (wellbeing > 0) wellbeingVals.push(wellbeing);
    });

    const avgSleep = sleepVals.length >= 3
      ? reportsR1(sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length)
      : null;
    const avgMood = moodVals.length >= 3
      ? reportsR1(moodVals.reduce((a, b) => a + b, 0) / moodVals.length)
      : null;
    const avgWellbeing = wellbeingVals.length >= 3
      ? reportsR1(wellbeingVals.reduce((a, b) => a + b, 0) / wellbeingVals.length)
      : null;

    // Кривой нужен каждый день периода, а не только дни с едой: сон
    // записывают и в день без единого приёма. Пропуск остаётся null — линия
    // на нём рвётся, а не соединяет соседние точки прямой через несколько
    // суток, которых не было.
    const wellbeingSeries = points.map((p) => {
      let wellbeing = +p.wellbeingAvg || 0;
      if (!wellbeing && typeof lsGet === 'function' && p.date) {
        const scopedKey = clientId ? 'heys_' + clientId + '_dayv2_' + p.date : 'heys_dayv2_' + p.date;
        const dayRow = lsGet(scopedKey, null) || lsGet('heys_dayv2_' + p.date, null);
        if (dayRow) wellbeing = +dayRow.wellbeingAvg || +dayRow.wellbeingMorning || 0;
      }
      return {
        date: p.date,
        sleep: p.sleepHours > 0 ? +p.sleepHours : null,
        wellbeing: wellbeing > 0 ? wellbeing : null
      };
    });

    const showWellbeingBlock = sleepVals.length >= 3 || moodVals.length >= 3 || wellbeingVals.length >= 3;

    const dayRows = [...withKcal].reverse().map((p) => {
      const delta = Math.round(p.kcal - (p.target || 0));
      const ratio = p.ratio != null ? p.ratio : (p.target > 0 ? p.kcal / p.target : 0);
      return {
        date: p.date,
        label: formatReportsDayLabel(p.date),
        dayScore: p.dayScore || 0,
        delta,
        ratio
      };
    });

    const fatGrams = balance !== 0 ? Math.round(Math.abs(balance) / 7.7) : 0;
    const fatText = fatGrams >= 1000
      ? (fatGrams / 1000).toFixed(1).replace('.', ',') + ' кг'
      : fatGrams + ' г';

    const balanceSign = balance > 0 ? '+' : balance < 0 ? '−' : '';
    const balanceAbs = Math.abs(balance);

    // Контракт «окно периода»: заголовки блоков следуют периоду.
    const periodWord = chartPeriod === 7 ? 'неделю'
      : chartPeriod === 14 ? 'две недели'
        : chartPeriod === 30 ? 'месяц'
          : chartPeriod + ' дней';

    // Контракт «мало данных»: порог общий с Инсайтами — один счётчик на обе
    // вкладки (HEYS.DisciplineMatrix.countHistoryDays): дни с реальными
    // данными за последние 30, дни с isIncomplete не считаются.
    const countHistoryDays = HEYS.DisciplineMatrix && HEYS.DisciplineMatrix.countHistoryDays;
    const historyDays = (typeof lsGet === 'function' && typeof countHistoryDays === 'function')
      ? countHistoryDays(lsGet, 30, clientId)
      : withKcal.length;

    // Контракт «замеры тела»: единственный призыв вкладки — про данные, не
    // про поведение; стоит последним. Ищем последний день с замерами за 60.
    let lastMeasureDaysAgo = null;
    if (typeof lsGet === 'function') {
      const today = new Date();
      for (let i = 0; i < 60; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const ds = d.toISOString().slice(0, 10);
        const scopedKey = clientId ? 'heys_' + clientId + '_dayv2_' + ds : 'heys_dayv2_' + ds;
        const row = lsGet(scopedKey, null) || lsGet('heys_dayv2_' + ds, null);
        const meas = row && row.measurements;
        if (meas && Object.values(meas).some((v) => +v > 0)) {
          lastMeasureDaysAgo = i;
          break;
        }
      }
    }

    // Матрица «Дисциплина» — нормы из движка, сводной суммы нет.
    let discipline = null;
    try {
      if (HEYS.DisciplineMatrix && HEYS.DisciplineMatrix.compute) {
        const entries = buildDisciplineEntries(points, chartPeriod, lsGet, clientId);
        const prof = (typeof lsGet === 'function' && lsGet('heys_profile', {})) || {};
        discipline = HEYS.DisciplineMatrix.compute(entries.cur, entries.prev, prof);
      }
    } catch (e) { discipline = null; }

    return {
      balance,
      balanceSign,
      balanceAbs,
      totalEaten,
      totalPlan,
      periodWord,
      historyDays,
      discipline,
      weeklyRows: buildWeeklyRows(lsGet, clientId, 4),
      lastMeasureDaysAgo,
      wellbeingSeries,
      dateRange,
      inNorm,
      withData: withKcal.length,
      periodDays: chartPeriod || withKcal.length,
      avgScore,
      scoredCount: scoredDays.length,
      avgSleep,
      sleepCount: sleepVals.length,
      avgMood,
      moodCount: moodVals.length,
      avgWellbeing,
      wellbeingCount: wellbeingVals.length,
      showWellbeingBlock,
      dayRows,
      fatText,
      balancePhrase: balance > 0
        ? 'Съедено больше плана — это ≈ ' + fatText + ' жира'
        : balance < 0
          ? 'Недобор относительно плана — это ≈ ' + fatText + ' жира'
          : 'Съедено в пределах плана за период'
    };
  }

  function ReportsTabV4Top(props) {
    const { React, periodMeta, chartPeriod, handlePeriodChange, scoreTile, onBalanceFooterClick } = props || {};
    if (!React || !periodMeta) return null;
    const fmtNum = (n) => Math.round(n || 0).toLocaleString('ru-RU');
    const scoreSuffix = periodMeta.scoredCount > 0 && periodMeta.scoredCount < periodMeta.withData
      ? ' за ' + periodMeta.scoredCount + ' дней из ' + periodMeta.withData
      : '';

    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'reports-v4-meta' },
        React.createElement('span', { className: 'reports-v4-meta__title' }, 'Отчёты'),
        React.createElement('span', { className: 'reports-v4-meta__range' }, periodMeta.dateRange || ''),
        React.createElement('div', { className: 'reports-v4-period-pills', role: 'tablist', 'aria-label': 'Период отчёта' },
          [7, 14, 30].map((period) =>
            React.createElement('button', {
              key: period,
              type: 'button',
              role: 'tab',
              className: 'reports-v4-period-pill' + (chartPeriod === period ? ' is-active' : ''),
              'aria-selected': chartPeriod === period,
              onClick: () => handlePeriodChange(period)
            }, period + ' дней')
          )
        )
      ),
      periodMeta.withData > 0 && React.createElement('div', { className: 'reports-v4-hero' },
        React.createElement('div', { className: 'reports-v4-hero__label' }, 'Баланс за ' + (periodMeta.periodWord || 'период')),
        React.createElement('div', { className: 'reports-v4-hero__value-row' },
          React.createElement('span', { className: 'reports-v4-hero__value' },
            periodMeta.balanceSign + fmtNum(periodMeta.balanceAbs)
          ),
          React.createElement('span', { className: 'reports-v4-hero__unit' }, 'ккал')
        ),
        React.createElement('div', { className: 'reports-v4-hero__phrase' }, periodMeta.balancePhrase),
        React.createElement('button', {
          type: 'button',
          className: 'reports-v4-hero__footer',
          onClick: onBalanceFooterClick
        },
          React.createElement('span', { className: 'reports-v4-hero__footer-text' },
            'Съедено ' + fmtNum(periodMeta.totalEaten) + ' · план ' + fmtNum(periodMeta.totalPlan)
          ),
          React.createElement('span', { className: 'reports-v4-hero__footer-chevron', 'aria-hidden': 'true' }, '›')
        )
      ),
      React.createElement('div', { className: 'reports-v4-tier' }, 'Итог периода'),
      scoreTile,
      React.createElement('div', { className: 'reports-v4-summary' },
        React.createElement('div', { className: 'reports-v4-summary-card reports-v4-summary-card--norm' },
          React.createElement('div', { className: 'reports-v4-summary-card__label' }, 'Дней в норме'),
          React.createElement('div', { className: 'reports-v4-summary-card__value' },
            periodMeta.inNorm,
            React.createElement('span', { className: 'reports-v4-summary-card__suffix' }, ' из ' + periodMeta.withData)
          )
        ),
        periodMeta.avgScore != null && React.createElement('div', { className: 'reports-v4-summary-card reports-v4-summary-card--score' },
          React.createElement('div', { className: 'reports-v4-summary-card__label' }, 'Средняя оценка'),
          React.createElement('div', { className: 'reports-v4-summary-card__value' },
            String(periodMeta.avgScore).replace('.', ','),
            React.createElement('span', { className: 'reports-v4-summary-card__suffix' }, ' из 10' + scoreSuffix)
          )
        )
      ),
      ReportsV4Discipline({ React, discipline: periodMeta.discipline }),
      React.createElement('div', { className: 'reports-v4-tier' }, 'Динамика')
    );
  }

  // Контракт «Дисциплина»: честный счёт дней против нормы по каждому трекеру,
  // «N из M» плюс Δ в п.п.; своей сводной цифры нет — агрегат один, Score.
  function ReportsV4Discipline(props) {
    const { React, discipline } = props || {};
    if (!React || !discipline || !Array.isArray(discipline.rows)) return null;
    const rows = discipline.rows;
    if (!rows.length) return null;
    const fmtDelta = (row) => {
      if (row.delta == null) return '—';
      if (row.delta === 0) return '0';
      const sign = row.delta > 0 ? '+' : '−';
      return sign + Math.abs(row.delta);
    };
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'reports-v4-tier reports-v4-tier--discipline' },
        'Дисциплина',
        React.createElement('span', { className: 'reports-v4-tier__note' }, 'дней в норме · Δ к прошлому периоду')
      ),
      React.createElement('div', { className: 'reports-v4-discipline' },
        rows.map((row) => {
          if (row.notTracked) {
            return React.createElement('div', { key: row.key, className: 'reports-v4-discipline__row' },
              React.createElement('span', { className: 'reports-v4-discipline__name' }, row.label),
              React.createElement('span', { className: 'reports-v4-discipline__off' }, 'не ведётся')
            );
          }
          if (row.kind === 'count') {
            // Контракт «вид · тренировки при программе»: «9 из 12 плановых» —
            // слово «плановых» обязательно, иначе знаменатель читается как
            // календарные дни.
            const suffix = row.planned > 0 ? (' из ' + row.planned + ' плановых') : ' за период';
            return React.createElement('div', { key: row.key, className: 'reports-v4-discipline__row' },
              React.createElement('span', { className: 'reports-v4-discipline__name' }, row.label),
              React.createElement('span', { className: 'reports-v4-discipline__count' }, row.count + suffix),
              React.createElement('span', {
                className: 'reports-v4-discipline__delta'
                  + (row.delta > 0 ? ' is-up' : row.delta < 0 ? ' is-down' : '')
              }, fmtDelta(row))
            );
          }
          // Контракт «нулевая строка» + «вид · нулевая строка»: когда в норме
          // не было ни одного дня, полоса штрихуется, а под строкой встаёт
          // средняя доля нормы — иначе строка молчит и при 200 мл, и при 2500
          // при норме 2745 (найдено на живых данных).
          return React.createElement('div', {
            key: row.key,
            className: 'reports-v4-discipline__group' + (row.isZeroRow ? ' is-zero' : '')
          },
            React.createElement('div', { className: 'reports-v4-discipline__row' },
              React.createElement('span', { className: 'reports-v4-discipline__name' }, row.label),
              React.createElement('span', {
                className: 'reports-v4-discipline__bar' + (row.isZeroRow ? ' is-zero' : '')
              },
                React.createElement('span', {
                  className: 'reports-v4-discipline__bar-fill',
                  style: { width: Math.round((row.share || 0) * 100) + '%' }
                })
              ),
              React.createElement('span', {
                className: 'reports-v4-discipline__score' + (row.isZeroRow ? ' is-zero' : '')
              }, row.inNorm + ' из ' + row.tracked),
              React.createElement('span', {
                className: 'reports-v4-discipline__delta'
                  + (row.delta > 0 ? ' is-up' : row.delta < 0 ? ' is-down' : '')
              }, fmtDelta(row))
            ),
            row.isZeroRow && row.avgShare != null && React.createElement('div', {
              className: 'reports-v4-discipline__zero-note'
            },
              React.createElement('span', { className: 'reports-v4-discipline__zero-share' },
                'в среднем ' + Math.round(row.avgShare * 100) + ' % нормы'),
              React.createElement('span', { className: 'reports-v4-discipline__zero-hint' },
                'ни одного дня в норме')
            )
          );
        }),
        React.createElement('div', { className: 'reports-v4-discipline__footnote' },
          'Сводной суммы у матрицы нет — дисциплину одним числом говорит Score выше.'
        )
      ),
    );
  }

  // Контракт «вид · таблица недель»: ярус «Неделя к неделе» с подписью
  // «закрытые недели · только измеренное»; строка — дата слева, три числа
  // справа (ккал / вес / Score), пометка неполной недели пилюлей.
  function ReportsV4Weeks(props) {
    const { React, rows } = props || {};
    if (!React || !rows || !rows.length) return null;
    const fmtPlan = (v) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v));
    const fmtWeight = (v) => (v == null ? '—' : (v > 0 ? '+' : '−') + String(Math.abs(v)).replace('.', ','));
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'reports-v4-tier reports-v4-tier--weeks' },
        'Неделя к неделе',
        React.createElement('span', { className: 'reports-v4-tier__note' }, 'закрытые недели · только измеренное')
      ),
      React.createElement('div', { className: 'reports-v4-weeks' },
        React.createElement('div', { className: 'reports-v4-weeks__head' },
          React.createElement('span', { className: 'reports-v4-weeks__head-date' }, ''),
          React.createElement('span', { className: 'reports-v4-weeks__head-kcal' }, 'к плану'),
          React.createElement('span', { className: 'reports-v4-weeks__head-weight' }, 'вес'),
          React.createElement('span', { className: 'reports-v4-weeks__head-score' }, 'sc')
        ),
        rows.map((row) => React.createElement('div', { key: row.key, className: 'reports-v4-weeks__row' },
          React.createElement('span', { className: 'reports-v4-weeks__date' },
            row.label,
            row.isPartial && React.createElement('span', { className: 'reports-v4-weeks__partial' },
              row.filledDays + ' из 7')
          ),
          React.createElement('span', { className: 'reports-v4-weeks__kcal' }, fmtPlan(row.planAvg)),
          React.createElement('span', { className: 'reports-v4-weeks__weight' }, fmtWeight(row.weightDelta)),
          // Контракт «прочерк вместо Score»: прочерк тоном чернил 32 %,
          // а не выдуманное число.
          React.createElement('span', {
            className: 'reports-v4-weeks__score' + (row.score == null ? ' is-empty' : '')
          }, row.score == null ? '—' : row.score)
        )),
        // Копия из кадра: прочерк у старой недели и построжавший счётчик дней
        // объясняются здесь, а не прячутся (контракты «прочерк вместо Score»
        // и «счётчик дней»).
        React.createElement('div', { className: 'reports-v4-weeks__note' },
          'К плану — в день, вес — за неделю. Score считается по 30-дневной серии, '
          + 'поэтому у самой старой недели вместо числа стоит прочерк. '
          + 'Считаем дни с записями: те, что вы сами отметили «не заполнял», '
          + 'в счёт не идут — отсюда «5 из 7».'
        )
      )
    );
  }

  /**
   * Две кривые за период на одной сетке: часы сна и оценка самочувствия 1–10.
   *
   * Контракт «ярус „Сон и самочувствие“»: только измеренное — ни выводов о
   * связи, ни оценок «мало/много». Связь сна с весом и аппетитом живёт в
   * Инсайтах паттернами, здесь её нет. Средние за период показывать нечем:
   * они уже стоят в итоге, и повторять их графиком незачем.
   *
   * У каждой кривой своя шкала: часы сна и оценка 1–10 несравнимы, общая ось
   * прижала бы одну из них в полоску. Подпись — у последней точки.
   */
  function ReportsV4Wellbeing(props) {
    const { React, periodMeta } = props || {};
    const series = (periodMeta && periodMeta.wellbeingSeries) || [];
    if (!React || series.length < 2) return null;

    const W = 296;
    const H = 96;
    const PAD = 8;
    const stepX = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;

    // Отрезки строим по подряд идущим точкам: день без записи рвёт линию, а
    // не соединяет соседей прямой через пропуск.
    const buildPath = (key) => {
      const vals = series.map((d) => d[key]).filter((v) => v != null);
      if (vals.length < 2) return null;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const span = max - min || 1;
      const y = (v) => PAD + (H - PAD * 2) * (1 - (v - min) / span);
      const segments = [];
      let current = [];
      series.forEach((d, i) => {
        if (d[key] == null) {
          if (current.length > 1) segments.push(current);
          current = [];
          return;
        }
        current.push((PAD + i * stepX).toFixed(1) + ',' + y(d[key]).toFixed(1));
      });
      if (current.length > 1) segments.push(current);

      let lastIdx = -1;
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i][key] != null) { lastIdx = i; break; }
      }
      return {
        segments,
        last: lastIdx >= 0
          ? { x: PAD + lastIdx * stepX, y: y(series[lastIdx][key]), value: series[lastIdx][key] }
          : null
      };
    };

    const sleep = buildPath('sleep');
    const wellbeing = buildPath('wellbeing');
    if (!sleep && !wellbeing) return null;

    const line = (path, cls) => path && path.segments.map((seg, i) => React.createElement('polyline', {
      key: cls + i,
      className: 'reports-v4-wellbeing__line reports-v4-wellbeing__line--' + cls,
      points: seg.join(' '),
      fill: 'none'
    }));

    const dot = (path, cls, unit) => path && path.last && React.createElement(React.Fragment, { key: cls + '-last' },
      React.createElement('circle', {
        className: 'reports-v4-wellbeing__dot reports-v4-wellbeing__dot--' + cls,
        cx: path.last.x, cy: path.last.y, r: 3
      }),
      React.createElement('text', {
        className: 'reports-v4-wellbeing__mark reports-v4-wellbeing__mark--' + cls,
        x: Math.min(path.last.x + 6, W - 2),
        y: Math.max(path.last.y - 6, 10),
        textAnchor: path.last.x > W - 40 ? 'end' : 'start'
      }, String(Math.round(path.last.value * 10) / 10).replace('.', ',') + unit)
    );

    return React.createElement('div', { className: 'reports-v4-wellbeing' },
      React.createElement('div', { className: 'reports-v4-wellbeing__title' }, 'Сон и самочувствие'),
      React.createElement('svg', {
        className: 'reports-v4-wellbeing__chart',
        viewBox: '0 0 ' + W + ' ' + H,
        preserveAspectRatio: 'none',
        role: 'img',
        'aria-label': 'Часы сна и оценка самочувствия за период'
      },
        line(sleep, 'sleep'),
        line(wellbeing, 'mood'),
        dot(sleep, 'sleep', ' ч'),
        dot(wellbeing, 'mood', '')
      ),
      React.createElement('div', { className: 'reports-v4-wellbeing__legend' },
        React.createElement('span', { className: 'reports-v4-wellbeing__key reports-v4-wellbeing__key--sleep' }, 'сон, часы'),
        React.createElement('span', { className: 'reports-v4-wellbeing__key reports-v4-wellbeing__key--mood' }, 'самочувствие, 1–10')
      )
    );
  }

  function pluralDaysReports(n) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return 'дней';
    if (last > 1 && last < 5) return 'дня';
    if (last === 1) return 'день';
    return 'дней';
  }

  function ReportsTabV4Bottom(props) {
    const { React, periodMeta } = props || {};
    if (!React || !periodMeta) return null;

    return React.createElement(React.Fragment, null,
      // Ярус недель — между «Динамикой» и «Днями»: сверху вниз период
      // дробится (итог → дисциплина → динамика → недели → дни).
      ReportsV4Weeks({ React, rows: periodMeta.weeklyRows }),
      periodMeta.showWellbeingBlock && ReportsV4Wellbeing({ React, periodMeta }),
      periodMeta.dayRows.length > 0 && React.createElement('div', { className: 'reports-v4-tier' }, 'Дни'),
      periodMeta.dayRows.length > 0 && React.createElement('div', { className: 'reports-v4-days' },
        periodMeta.dayRows.slice(0, 4).map((row) => {
          const zone = HEYS.ratioZones?.getZone?.(row.ratio);
          const dotClass = zone?.id === 'low' ? 'warn' : zone?.id === 'over' ? 'over' : 'good';
          const deltaSign = row.delta > 0 ? '+' : row.delta < 0 ? '−' : '';
          return React.createElement('div', {
            key: row.date,
            className: 'reports-v4-days__row'
          },
            React.createElement('span', { className: 'reports-v4-days__left' },
              React.createElement('span', { className: 'reports-v4-days__dot reports-v4-days__dot--' + dotClass }),
              row.label
            ),
            React.createElement('span', { className: 'reports-v4-days__right' },
              deltaSign + Math.abs(row.delta) + (row.dayScore > 0 ? ' · ' + row.dayScore + '/10' : '')
            )
          );
        }),
        periodMeta.dayRows.length > 4 && React.createElement('div', { className: 'reports-v4-days__more' },
          'ещё ' + (periodMeta.dayRows.length - 4) + ' ' + (periodMeta.dayRows.length - 4 === 1 ? 'день' : (periodMeta.dayRows.length - 4 < 5 ? 'дня' : 'дней'))
        )
      ),
      // Контракт «ярус „Что с этим делать“»: единственное место в Отчётах, где
      // есть призыв, и он про данные, а не про поведение. Советов о еде,
      // тренировках и норме здесь нет — это территория Инсайтов; прежний блок
      // предлагал обсудить норму с куратором и был ровно тем, что строка
      // запрещает. Стоит последним: без замеров отчёт верен, просто беднее.
      //
      // Замер сделан сегодня — призывать не к чему, и ярус не рисуется вовсе,
      // а не говорит «всё в порядке».
      periodMeta.lastMeasureDaysAgo !== 0 && React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'reports-v4-tier' }, 'Что с этим делать'),
        React.createElement('div', { className: 'reports-v4-measure' },
          React.createElement('div', { className: 'reports-v4-measure__copy' },
            React.createElement('div', { className: 'reports-v4-measure__title' }, 'Замеры тела'),
            React.createElement('div', { className: 'reports-v4-measure__note' },
              periodMeta.lastMeasureDaysAgo == null
                ? 'замеров ещё не было'
                : 'последний замер ' + periodMeta.lastMeasureDaysAgo + ' ' +
                  pluralDaysReports(periodMeta.lastMeasureDaysAgo) + ' назад')
          ),
          React.createElement('button', {
            type: 'button',
            className: 'reports-v4-measure__cta',
            onClick: () => {
              // Вход прямо в замеры, а не «куда-то в дневник»: призыв называет
              // действие, значит и ведёт в него.
              const show = HEYS.StepModal && HEYS.StepModal.show;
              if (typeof show === 'function') {
                show({ steps: ['measurements'], context: { dateKey: periodMeta.todayKey || undefined } });
                return;
              }
              const setTab = (HEYS.App && HEYS.App.setTab) || (HEYS.ui && HEYS.ui.switchTab);
              if (typeof setTab === 'function') setTab('diary');
            }
          }, 'Записать замер')
        )
      )
    );
  }

  function ReportsTabV4(props) {
    const {
      React,
      periodMeta,
      chartPeriod,
      handlePeriodChange,
      scoreTile,
      kcalDynamics,
      weightDynamics,
      onBalanceFooterClick
    } = props || {};

    // Контракт «мало данных»: до 7 дней вкладка — заглушка «итоги появятся
    // с 7 дней». Баланс и матрица скрыты (баланс из 3 дней врёт масштабом,
    // «2 из 3» — не дисциплина); работают лента дней и тренд веса с трёх
    // замеров. Порог общий с Инсайтами.
    if (periodMeta && (periodMeta.historyDays || 0) < 7) {
      const have = periodMeta.historyDays || 0;
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'reports-v4-meta' },
          React.createElement('span', { className: 'reports-v4-meta__title' }, 'Отчёты'),
          React.createElement('span', { className: 'reports-v4-meta__range' }, periodMeta.dateRange || '')
        ),
        React.createElement('div', { className: 'reports-v4-stub' },
          React.createElement('div', { className: 'reports-v4-tier' }, 'Пока копим данные'),
          React.createElement('div', { className: 'reports-v4-stub__title' }, 'Итоги появятся с 7 дней'),
          React.createElement('div', { className: 'reports-v4-stub__progress' },
            React.createElement('div', {
              className: 'reports-v4-stub__progress-fill',
              style: { width: Math.min(100, Math.round((have / 7) * 100)) + '%' }
            })
          ),
          React.createElement('div', { className: 'reports-v4-stub__count' }, have + ' из 7'),
          React.createElement('div', { className: 'reports-v4-stub__note' },
            'Уже считается: лента дней — с первого дня, тренд веса — с трёх замеров.')
        ),
        weightDynamics,
        ReportsTabV4Bottom({ React, periodMeta })
      );
    }

    return React.createElement(React.Fragment, null,
      ReportsTabV4Top({ React, periodMeta, chartPeriod, handlePeriodChange, scoreTile, onBalanceFooterClick }),
      kcalDynamics,
      weightDynamics,
      ReportsTabV4Bottom({ React, periodMeta })
    );
  }

  /**
   * Render stats block
   * @param {Object} params - Render parameters
   * @param {Object} params.React - React reference
   * @param {Object} params.vm - View model from buildStatsVm()
   * @param {Object} params.actions - Action handlers
   * @param {Object} params.data - Additional data not in VM (for gradual migration)
   * @returns {ReactElement} Stats block element
   */
  function renderStatsBlock({ React, vm, actions, data }) {
    if (!React) {
      try {
        if (HEYS?.analytics?.trackError) {
          HEYS.analytics.trackError(new Error('renderStatsBlock guard: React_missing'), {
            module: 'heys_day_stats_v1',
            reason: 'React_missing'
          });
        }
      } catch (e) { }
      return null;
    }

    const {
      openExclusivePopup,
      haptic,
      setDay,
      handlePeriodChange,
      setChartPeriod,
      setBalanceCardExpanded,
      r0,
      r1,
      setSparklinePopup,
      setWeekNormPopup,
      setWeekDeficitPopup,
      setBalanceDayPopup,
      setTdeePopup,
      setTefInfoPopup,
      setGoalPopup,
      setDebtSciencePopup,
      setMetricPopup,
      setMacroBadgePopup,
      setDate,
      setToastVisible,
      setAdviceTrigger,
      setMealChartHintShown,
      setShowConfetti,
      setInsulinExpanded,
      openWeightPicker,
      openDeficitPicker,
      setMealQualityPopup
    } = actions;

    const reportGuardError = (reason, extra) => {
      try {
        if (HEYS?.analytics?.trackError) {
          HEYS.analytics.trackError(new Error('renderStatsBlock guard: ' + reason), {
            module: 'heys_day_stats_v1',
            reason,
            ...(extra || {})
          });
        }
      } catch (e) { }
    };

    const renderGuardPlaceholder = (title, text) => (
      React.createElement('div', { className: 'empty-state' },
        React.createElement('div', { className: 'empty-state-icon' }, '📊'),
        React.createElement('div', { className: 'empty-state-title' }, title),
        React.createElement('div', { className: 'empty-state-text' }, text)
      )
    );

    if (!vm || !vm.energy || !vm.progress || !vm.debt || !vm.computed || !vm.ui || !vm.context) {
      reportGuardError('vm_missing', { hasVm: !!vm });
      return renderGuardPlaceholder('Статистика недоступна', 'Данные ещё загружаются или VM не инициализирован.');
    }

    const dataSafe = data || {};
    const { helpers, deps, slots } = dataSafe;
    if (!helpers || !deps) {
      reportGuardError('deps_container_missing', { hasHelpers: !!helpers, hasDeps: !!deps });
      return renderGuardPlaceholder('Статистика недоступна', 'Не удалось получить зависимости для рендера.');
    }

    const { renderSparkline, renderWeightSparkline } = helpers;
    if (!renderSparkline || !renderWeightSparkline) {
      reportGuardError('helpers_missing', { hasRenderSparkline: !!renderSparkline, hasRenderWeightSparkline: !!renderWeightSparkline });
      return renderGuardPlaceholder('Статистика недоступна', 'Графики ещё не готовы к отрисовке.');
    }

    const {
      energy: vmEnergy,
      progress: vmProgress,
      debt: vmDebt,
      computed: vmComputed,
      ui: vmUi,
      context: vmContext
    } = vm;

    const day = vmContext.day;
    const prof = vmContext.prof;
    const dayTot = vmContext.dayTot;
    const normAbs = vmContext.normAbs;

    const {
      U,
      pIndex,
      lsGet,
      PopupWithBackdrop,
      createSwipeHandlers,
      getSmartPopupPosition,
      ReactDOM,
      ratioZones,
      Refeed,
      TEF,
      Day,
      showCheckin,
      App
    } = deps;
    const cascadeSlot = slots?.cascade || null;

    if (!PopupWithBackdrop || !createSwipeHandlers || !getSmartPopupPosition || !ReactDOM) {
      reportGuardError('deps_missing', {
        hasPopupWithBackdrop: !!PopupWithBackdrop,
        hasCreateSwipeHandlers: !!createSwipeHandlers,
        hasGetSmartPopupPosition: !!getSmartPopupPosition,
        hasReactDOM: !!ReactDOM
      });
      return renderGuardPlaceholder('Статистика недоступна', 'Компоненты UI ещё не инициализированы.');
    }

    const optimum = vmEnergy.optimum;
    const displayOptimum = vmEnergy.displayOptimum;
    const displayRemainingKcal = vmEnergy.displayRemainingKcal;
    const tdee = vmEnergy.tdee;
    const bmr = vmEnergy.bmr;
    const eatenKcal = vmEnergy.eatenKcal;
    const stepsK = vmEnergy.stepsKcal;
    const householdK = vmEnergy.householdKcal;
    const train1k = vmEnergy.training?.zone1 || 0;
    const train2k = vmEnergy.training?.zone2 || 0;
    const train3k = vmEnergy.training?.zone3 || 0;
    const tefKcal = vmEnergy.tefKcal;
    const dayTargetDef = vmEnergy.deficitPct;
    const baseExpenditure = vmEnergy.baseExpenditure;
    const weight = vmProgress.weight;
    const caloricDebt = vmDebt.caloricDebt;
    const sparklineData = vmProgress.sparklineData;
    const currentRatio = vmProgress.currentRatio;
    const displayRatioStatus = vmComputed.ratioStatus;
    const cycleDay = vmDebt.cycleDay;
    const ndteData = vmDebt.ndteData;
    const tefData = vmDebt.tefData;
    const chartPeriod = vmProgress.chartPeriod || 7;
    const balanceCardExpanded = vmUi.balanceCardExpanded;
    const showConfetti = vmUi.showConfetti;
    const shakeEaten = vmUi.shakeEaten;
    const shakeOver = vmUi.shakeOver;
    const displayTdee = vmComputed.displayTdee;
    const displayHeroOptimum = vmComputed.displayHeroOptimum;
    const displayHeroEaten = vmComputed.displayHeroEaten;
    const displayHeroRemaining = vmComputed.displayHeroRemaining;
    const weightSparklineData = vmProgress.weightSparklineData;
    const weightTrend = vmProgress.weightTrend;
    const kcalTrend = vmProgress.kcalTrend;
    const monthForecast = vmProgress.monthForecast;
    const cycleHistoryAnalysis = vmProgress.cycleHistoryAnalysis;
    const weekHeatmapData = vmProgress.weekHeatmapData;
    const mealsChartData = vmProgress.mealsChartData;
    const sparklinePopup = vmUi.sparklinePopup;
    const weekNormPopup = vmUi.weekNormPopup;
    const weekDeficitPopup = vmUi.weekDeficitPopup;
    const balanceDayPopup = vmUi.balanceDayPopup;
    const tdeePopup = vmUi.tdeePopup;
    const tefInfoPopup = vmUi.tefInfoPopup;
    const goalPopup = vmUi.goalPopup;
    const debtSciencePopup = vmUi.debtSciencePopup;
    const metricPopup = vmUi.metricPopup;
    const macroBadgePopup = vmUi.macroBadgePopup;
    const chartTransitioning = vmUi.chartTransitioning;
    const mealChartHintShown = vmUi.mealChartHintShown;
    const newMealAnimatingIndex = vmUi.newMealAnimatingIndex;
    const showFirstPerfectAchievement = vmUi.showFirstPerfectAchievement;
    const insulinExpanded = vmUi.insulinExpanded;
    const currentDeficit = vmProgress.currentDeficit;
    const profileDeficit = vmProgress.profileDeficit;
    const date = vmProgress.date;
    const insulinWaveData = vmProgress.insulinWaveData;
    const balanceViz = vmProgress.balanceViz;
    const isMobile = vmUi.isMobile;
    const mobileSubTab = vmUi.mobileSubTab;
    const eatenCol = vmComputed.eatenColor;
    const displayRemainCol = vmComputed.remainingColor;
    const metricPopupMeta = vmComputed.metricPopupMeta;
    const macroPopupMeta = vmComputed.macroPopupMeta;
    const weekDeficitPopupMeta = vmComputed.weekDeficitPopupMeta;
    const excessStyleMeta = vmComputed.excessStyleMeta;
    const excessCardMeta = vmComputed.excessCardMeta;
    const excessSciencePopupMeta = vmComputed.excessSciencePopupMeta;
    const balanceInsightsMeta = vmComputed.balanceInsightsMeta || [];
    const balanceDayPopupMeta = vmComputed.balanceDayPopupMeta;
    const weightPopupMeta = vmComputed.weightPopupMeta;
    const weightForecastPopupMeta = vmComputed.weightForecastPopupMeta;
    const tefInfoPopupMeta = vmComputed.tefInfoPopupMeta;
    const debtSciencePopupMeta = vmComputed.debtSciencePopupMeta;
    const weekNormPopupMeta = vmComputed.weekNormPopupMeta;
    const weekHeatmapDaysMeta = vmComputed.weekHeatmapDaysMeta || null;
    const heroCardsMeta = vmComputed.heroCardsMeta;
    const debtCardMeta = vmComputed.debtCardMeta;
    const insightRowsMeta = vmComputed.insightRowsMeta;
    const dayScoreStyleMeta = vmComputed.dayScoreStyleMeta;
    const progressGradient = vmComputed.progressGradient;
    const heatmapDayStyleMeta = vmComputed.heatmapDayStyleMeta;
    const sparklinePerfectPopupMeta = vmComputed.sparklinePerfectPopupMeta;
    const popupPositionStyle = vmComputed.popupPositionStyle;

    // Отчёты v4: вкладка DayTab subTab === 'stats' (в навигации — «Отчёты»).
    const useReportsV4 = !isMobile || mobileSubTab === 'stats';
    const reportsClientId = HEYS.currentClientId || deps?.clientId || '';
    const reportsPeriodMeta = useReportsV4
      ? buildReportsPeriodMeta(sparklineData, chartPeriod, ratioZones, lsGet, reportsClientId)
      : null;

    const weekHeatmapDates = (weekHeatmapDaysMeta || []).map((d) => d.date).filter(Boolean);
    const selectedDayRatio = Number.isFinite(currentRatio)
      ? currentRatio
      : ((displayHeroOptimum || optimum || 0) > 0
        ? ((displayHeroEaten || eatenKcal || 0) / (displayHeroOptimum || optimum || 1))
        : 0);

    const todayDateKey = (() => {
      try {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      } catch (e) {
        return '';
      }
    })();

    const selectedDateKey = (typeof date === 'string' && date.length >= 10) ? date.slice(0, 10) : '';
    const dayDateKey = (typeof day?.date === 'string' && day.date.length >= 10) ? day.date.slice(0, 10) : '';
    const appCurrentDateKey = (typeof App?.currentDate === 'string' && App.currentDate.length >= 10)
      ? App.currentDate.slice(0, 10)
      : '';

    const isSelectedDateToday = Boolean(
      day?.isToday
      || (todayDateKey && selectedDateKey === todayDateKey)
      || (todayDateKey && dayDateKey === todayDateKey)
      || (todayDateKey && appCurrentDateKey === todayDateKey)
    );

    const DayRealDataActions = HEYS.DayRealDataActions || {};
    const mealCountNow = Array.isArray(day?.meals) ? day.meals.length : 0;
    const eatenNow = Math.round(displayHeroEaten || eatenKcal || 0);
    const targetNow = Math.round(displayHeroOptimum || optimum || 0);

    const clearEstimatedDayFields = typeof DayRealDataActions.clearEstimatedDayFields === 'function'
      ? DayRealDataActions.clearEstimatedDayFields
      : (targetDay) => {
        if (!targetDay || typeof targetDay !== 'object') return;
        delete targetDay.savedEatenKcal;
        delete targetDay.savedDisplayOptimum;
        delete targetDay.savedEatenProt;
        delete targetDay.savedEatenCarbs;
        delete targetDay.savedEatenFat;
        delete targetDay.savedEatenFiber;
        delete targetDay.estimatedDayFill;
      };

    const applyDayStatusAction = typeof DayRealDataActions.applyDayStatusAction === 'function'
      ? DayRealDataActions.applyDayStatusAction
      : (targetDay, actionId, options = {}) => {
        const nextDay = { ...(targetDay || {}) };
        const nowTs = Math.max(options.nowTs || Date.now(), (Number(targetDay?.dayStatusUpdatedAt) || 0) + 1);
        if (actionId === 'confirm_real_data') {
          nextDay.isFastingDay = true;
          nextDay.isIncomplete = false;
          clearEstimatedDayFields(nextDay);
        } else if (actionId === 'clear_day') {
          nextDay.meals = [];
          nextDay.isFastingDay = false;
          nextDay.isIncomplete = false;
          clearEstimatedDayFields(nextDay);
        }
        nextDay.dayStatusUpdatedAt = nowTs;
        nextDay.updatedAt = nowTs;
        return nextDay;
      };

    const shouldOfferRealDataConfirmation = typeof DayRealDataActions.shouldOfferConfirmation === 'function'
      ? DayRealDataActions.shouldOfferConfirmation({
        dateKey: date,
        isFuture: !!day?.isFuture,
        isToday: isSelectedDateToday,
        isFastingDay: !!day?.isFastingDay,
        isIncomplete: !!day?.isIncomplete,
        hasEstimatedFill: !!day?.estimatedDayFill,
        ratio: selectedDayRatio,
        eatenKcal: eatenNow,
        mealCount: mealCountNow,
      })
      : Boolean(
        date
        && !day?.isFuture
        && !isSelectedDateToday
        && !day?.isFastingDay
        && !day?.isIncomplete
        && !day?.estimatedDayFill
        && selectedDayRatio > 0
        && selectedDayRatio < 0.5
        && (eatenNow > 0 || mealCountNow > 0)
      );

    const preferredActionId = typeof DayRealDataActions.getPreferredAction === 'function'
      ? DayRealDataActions.getPreferredAction({ ratio: selectedDayRatio, mealCount: mealCountNow })
      : 'confirm_real_data';
    const isClearPrimary = preferredActionId === 'clear_day';
    const recommendationText = isClearPrimary
      ? 'Рекомендуем очистить: день выглядит пустым (0 приёмов и <30% нормы).'
      : 'Рекомендуем подтвердить: в дне есть приёмы пищи, их лучше учесть в статистике.';
    const impactHintText = typeof DayRealDataActions.getImpactHint === 'function'
      ? DayRealDataActions.getImpactHint()
      : 'Влияет на средний дефицит, тренд и рекомендации.';

    const getStatsDayStorageKey = () => {
      const currentClientId = HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '';
      return currentClientId ? ('heys_' + currentClientId + '_dayv2_' + date) : ('heys_dayv2_' + date);
    };

    const cloneDaySnapshot = (value) => {
      try {
        return JSON.parse(JSON.stringify(value || {}));
      } catch (e) {
        return { ...(value || {}) };
      }
    };

    const trackRealDataAction = (actionName, meta = {}) => {
      try {
        if (HEYS.analytics?.trackDataOperation) {
          HEYS.analytics.trackDataOperation(actionName, 1, {
            date,
            ratio: Number(selectedDayRatio || 0),
            mealCount: mealCountNow,
            eatenKcal: eatenNow,
            targetKcal: targetNow,
            ...meta
          });
        }
      } catch (_) { }
    };

    const persistDayChange = (nextDay, source, extraDetail = {}) => {
      if (!date) return;
      const statsDayKey = getStatsDayStorageKey();
      let nextSnapshot = cloneDaySnapshot(nextDay);
      try {
        const isExplicitDestructive =
          source === 'day-stats-clear-day-cta'
          || source === 'day-stats-clear-day-undo'
          || extraDetail.field === 'meals';
        if (!isExplicitDestructive && HEYS.dayMutationGuard?.mergeProtectedFields) {
          const structuralFields = new Set([
            'date',
            'meals',
            'deletedMealIds',
            'deletedItemIds',
            'deletedMealItemIds',
            'updatedAt',
          ]);
          const fields = Object.keys(nextSnapshot).filter((field) => !structuralFields.has(field));
          const current = U?.lsGet?.(statsDayKey, null);
          const protectedResult = HEYS.dayMutationGuard.mergeProtectedFields(date, nextSnapshot, current, fields, {
            action: source || 'day-stats-write',
          });
          if (protectedResult.blocked) return;
          nextSnapshot = protectedResult.day || nextSnapshot;
        }
      } catch (_) { /* guard diagnostics only */ }

      setDay(() => nextSnapshot);

      try {
        const persistDay = typeof HEYS?.dayStorage?.lsSet === 'function'
          ? HEYS.dayStorage.lsSet
          : U?.lsSet;
        persistDay?.(statsDayKey, nextSnapshot);
      } catch (_) { }

      try {
        if (typeof HEYS?.cloud?.saveClientKey === 'function') {
          HEYS.cloud.saveClientKey(statsDayKey, nextSnapshot);
        }
      } catch (_) { }

      try {
        global.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date, source, data: nextSnapshot, ...extraDetail }
        }));
      } catch (_) { }
    };

    const confirmCurrentDayAsRealData = (e) => {
      e?.stopPropagation?.();
      if (!date) return;

      try {
        console.info('[HEYS.dayRealData] confirm click', {
          date,
          isFastingDay: !!day?.isFastingDay,
          isIncomplete: !!day?.isIncomplete,
          eatenKcal: Math.round(displayHeroEaten || eatenKcal || 0),
          targetKcal: Math.round(displayHeroOptimum || optimum || 0),
          ratio: Number(selectedDayRatio || 0)
        });
        global.console?.warn?.('[HEYS.dayRealData] confirm click visible', {
          date,
          isFastingDay: !!day?.isFastingDay,
          isIncomplete: !!day?.isIncomplete,
          eatenKcal: Math.round(displayHeroEaten || eatenKcal || 0),
          targetKcal: Math.round(displayHeroOptimum || optimum || 0),
          ratio: Number(selectedDayRatio || 0)
        });
      } catch (_) { }

      const confirmText = typeof DayRealDataActions.getConfirmDialogText === 'function'
        ? DayRealDataActions.getConfirmDialogText('confirm_real_data', { eatenKcal: eatenNow, targetKcal: targetNow })
        : 'Учесть этот день как реальные данные?\n\n'
        + 'Сейчас: ' + eatenNow + ' из ' + targetNow + ' ккал.\n'
        + 'День останется в статистике, даже если это меньше 50% нормы.';
      const confirmed = typeof global.confirm === 'function' ? global.confirm(confirmText) : true;
      if (!confirmed) return;

      const nextDay = applyDayStatusAction(day || {}, 'confirm_real_data', { nowTs: Date.now() });
      persistDayChange(nextDay, 'day-stats-real-data-cta');
      trackRealDataAction('day_realdata_confirmed', { source: 'day-stats-real-data-cta' });

      try {
        haptic('light');
      } catch (_) { }

      if (HEYS?.Toast?.success) {
        HEYS.Toast.success('День учтён как реальные данные');
      }
    };

    const clearCurrentDayFromStats = (e) => {
      e?.stopPropagation?.();
      if (!date) return;
      const confirmText = typeof DayRealDataActions.getConfirmDialogText === 'function'
        ? DayRealDataActions.getConfirmDialogText('clear_day', { eatenKcal: eatenNow, targetKcal: targetNow })
        : 'Очистить данные за этот день?\n\n'
        + 'Сейчас: ' + eatenNow + ' из ' + targetNow + ' ккал.\n'
        + 'Мы удалим приёмы пищи и исключим день из статистики.';
      const confirmed = typeof global.confirm === 'function' ? global.confirm(confirmText) : true;
      if (!confirmed) return;
      trackRealDataAction('day_realdata_clear_clicked', { source: 'day-stats-clear-day-cta' });

      const prevDaySnapshot = cloneDaySnapshot(day || {});
      const applyClear = () => {
        const clearedDay = applyDayStatusAction(prevDaySnapshot, 'clear_day', { nowTs: Date.now() });
        clearEstimatedDayFields(clearedDay);
        persistDayChange(clearedDay, 'day-stats-clear-day-cta', { field: 'meals', value: [] });
        return { prevDaySnapshot, clearedDay };
      };

      if (HEYS.Undo?.runAction) {
        HEYS.Undo.runAction({
          label: 'День очищен из статистики',
          // Окно общее — 5 с: контракт бара отмены прямо говорит, что
          // отдельных длительностей у экранов нет. Было 7 с.
          apply: applyClear,
          undo: (context) => {
            persistDayChange(context?.prevDaySnapshot || prevDaySnapshot, 'day-stats-clear-day-undo');
            trackRealDataAction('day_realdata_clear_undo', { source: 'day-stats-clear-day-undo' });
          },
          onExpire: () => {
            trackRealDataAction('day_realdata_clear_commit', { source: 'day-stats-clear-day-cta' });
          },
          errorMessage: 'Не удалось очистить данные дня'
        });
      } else {
        applyClear();
        // Бара отмены нет — иначе действие проходит вообще без подтверждения.
        HEYS?.Toast?.info?.('День очищён.');
      }

      try {
        haptic('light');
      } catch (_) { }
      // Общего тоста здесь нет: бар отмены сам говорит и что случилось, и что
      // можно вернуть — второе всплывающее сообщение его дублировало.
    };

    const selectDateWithPrefetch = (nextDate, options = {}) => {
      if (!nextDate) return;
      const prefetchDates = Array.isArray(options.prefetchDates) && options.prefetchDates.length
        ? options.prefetchDates
        : [nextDate];

      try {
        if (Day?.requestFlush) Day.requestFlush({ force: true });
      } catch (e) { }

      try {
        if (HEYS?.Undo?.pending) {
          console.info('[HEYS.dayStats] 🧹 Commit pending undo before date switch', {
            currentDate: date,
            nextDate,
            reason: options.reason || 'stats-date-switch'
          });
          HEYS.Undo.commit('stats-date-switch');
        }
      } catch (e) { }

      const applyDate = () => {
        setDate(nextDate);
        haptic('light');
      };

      if (HEYS?.cloud?.fetchDays && prefetchDates.length > 0) {
        HEYS.cloud.fetchDays(prefetchDates)
          .then(() => applyDate())
          .catch(() => applyDate());
        return;
      }

      applyDate();
    };

    // Контракт «вход один»: разбор Score открывается отдельным экраном —
    // на вкладке каскад занял бы место трёх блоков (screenMode у плитки).
    const reportsV4ScoreTile = HEYS.CascadeCard?.HeysScoreTile
      ? React.createElement('div', { className: 'reports-v4-score-slot' },
        React.createElement(HEYS.CascadeCard.HeysScoreTile, { screenMode: true }))
      : null;

    const reportsV4BalanceClick = (e) => {
      e?.stopPropagation?.();
      haptic('light');
      if (weekHeatmapData?.totalEaten > 0) {
        const deficitMeta = vmComputed.weekHeatmapDeficitMeta;
        if (deficitMeta?.popupData) {
          setWeekDeficitPopup({
            x: window.innerWidth / 2,
            y: window.innerHeight / 3,
            data: deficitMeta.popupData
          });
        }
      }
    };

    const statsBlock = React.createElement('div', {
      className: 'compact-stats stats-section' + (useReportsV4 ? ' reports-v4' : '')
    },
      useReportsV4 && ReportsTabV4Top({
        React,
        periodMeta: reportsPeriodMeta,
        chartPeriod,
        handlePeriodChange,
        scoreTile: reportsV4ScoreTile,
        onBalanceFooterClick: reportsV4BalanceClick
      }),
      !useReportsV4 && React.createElement('div', { className: 'compact-card-header stats-header-with-badge' },
        React.createElement('span', null, '📊 СТАТИСТИКА'),
        React.createElement('span', {
          className: 'ratio-status-badge' + (displayRatioStatus.emoji === '🔥' ? ' perfect' : ''),
          style: vmComputed.ratioBadgeStyle
        }, displayRatioStatus.emoji + ' ' + displayRatioStatus.text)
      ),
      // 4 карточки метрик внутри статистики — только legacy, не на Отчётах v4
      !useReportsV4 && React.createElement('div', { className: 'metrics-cards', id: 'tour-hero-stats' },
        // Затраты (TDEE) — кликабельная для расшифровки
        React.createElement('div', {
          className: 'metrics-card',
          style: heroCardsMeta.tdeeCardStyle,
          title: 'Нажми для расшифровки затрат',
          onClick: (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setTimeout(() => {
              openExclusivePopup('tdee', {
                x: rect.left + rect.width / 2,
                y: rect.bottom,
                data: {
                  bmr,
                  stepsK,
                  householdK,
                  train1k,
                  train2k,
                  train3k,
                  tefKcal,
                  tdee,
                  weight,
                  steps: day.steps || 0,
                  householdMin: day.householdMin || 0,
                  trainings: day.trainings || [],
                  // 🆕 v3.20.0: Extended analytics for TDEE popup
                  ndteData: caloricDebt?.ndteData,
                  bmiContext: caloricDebt?.bmiContext
                }
              });
              haptic('light');
            }, 0);
          }
        },
          React.createElement('div', { className: 'metrics-icon' }, '⚡'),
          React.createElement('div', { className: 'metrics-value', style: heroCardsMeta.tdeeValueStyle }, displayTdee),
          React.createElement('div', { className: 'metrics-label' }, 'Затраты')
        ),
        // Цель — кликабельная для показа формулы
        React.createElement('div', {
          className: 'metrics-card' + (day.isRefeedDay ? ' metrics-card--refeed' : ''),
          style: heroCardsMeta.goalCardStyle,
          onClick: (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setTimeout(() => {
              openExclusivePopup('goal', {
                x: rect.left + rect.width / 2,
                y: rect.bottom,
                data: {
                  baseExpenditure,
                  deficitPct: dayTargetDef,
                  baseOptimum: optimum,
                  dailyBoost: caloricDebt?.dailyBoost || 0,
                  ndteBoost: (HEYS.dayNorm && typeof HEYS.dayNorm.resolve === 'function')
                    ? (HEYS.dayNorm.resolve(day, prof || {}, {}).ndte || 0)
                    : 0,
                  displayOptimum: displayHeroOptimum,
                  isRefeedDay: day.isRefeedDay,
                  refeedBoost: caloricDebt?.refeedBoost || 0,
                  // Поправка на факт правит расход раз в неделю и стоит между
                  // базой и дефицитом: дефицит остаётся договорённостью, долг
                  // правит итог дня. Пока применённой поправки нет — строка
                  // показывает холодный старт со счётом дней, а не прячется.
                  normCorrection: (prof && Number(prof.normCorrectionFactor) > 0 && Number(prof.normCorrectionFactor) !== 1)
                    ? { factor: Number(prof.normCorrectionFactor), appliedAt: prof.normCorrectionAppliedAt || '' }
                    : null,
                  // Путь «съедено → вес → запас → факт»: без него человек
                  // видит поправку числом и не знает, из чего она взялась.
                  // Читаем без последствий — тап по норме не должен применять
                  // поправку и ставить метку просьбы о замере.
                  correctionPath: (() => {
                    try {
                      const g = HEYS.NormCorrection?.gather?.({
                        lsGet: HEYS.utils?.lsGet,
                        profile: prof || {},
                        pIndex: HEYS.products?.buildIndex?.(),
                        readOnly: true
                      });
                      const res = g && g.result;
                      if (!res || !res.path || !Number.isFinite(res.factPerDay)) return null;
                      return {
                        eatenPerDay: res.path.eatenPerDay,
                        deltaKg: res.path.deltaKg,
                        storedPerDay: res.path.storedPerDay,
                        factPerDay: res.factPerDay
                      };
                    } catch (_) { return null; }
                  })(),
                  correctionHistoryDays: HEYS.DisciplineMatrix?.countHistoryDays
                    ? HEYS.DisciplineMatrix.countHistoryDays(
                        HEYS.utils?.lsGet, HEYS.NormCorrection?.COLD_START_DAYS || 14
                      )
                    : 0
                }
              });
              haptic('light');
            }, 0);
          },
          title: 'Как считается цель: база (с NDTE), дефицит, поправка за недобор'
        },
          React.createElement('div', { className: 'metrics-icon' }, '🎯'),
          React.createElement('div', { className: 'metrics-value', style: heroCardsMeta.goalValueStyle }, displayHeroOptimum),
          React.createElement('div', { className: 'metrics-label' },
            'Цель (' + dayTargetDef + '%)' + (heroCardsMeta.goalLabelSuffix || '')
          ),
          // 🍕 Refeed hint (как в "Осталось")
          day.isRefeedDay && React.createElement('div', {
            className: 'metrics-refeed-hint',
            style: heroCardsMeta.refeedHintStyle
          }, '🍕 загрузка +35%')
        ),
        // Съедено
        React.createElement('div', {
          className: 'metrics-card' + (shakeEaten ? ' shake-excess' : ''),
          style: heroCardsMeta.getEatenCardStyle(eatenCol),
          onClick: (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setTimeout(() => {
              openExclusivePopup('metric', {
                type: 'kcal',
                x: rect.left + rect.width / 2,
                y: rect.top,
                data: {
                  eaten: displayHeroEaten,
                  goal: displayHeroOptimum,
                  remaining: displayHeroRemaining,
                  ratio: currentRatio,
                  deficitPct: dayTargetDef
                }
              });
              haptic('light');
            }, 0);
          }
        },
          React.createElement('div', { className: 'metrics-icon' }, '🍽️'),
          React.createElement('div', { className: 'metrics-value', style: heroCardsMeta.getEatenValueStyle(eatenCol) }, r0(displayHeroEaten)),
          React.createElement('div', { className: 'metrics-label' }, 'Съедено')
        ),
        // Осталось / Перебор (с учётом displayRemainingKcal)
        (() => {
          // 🆕 Refeed day микро-объяснение
          const isRefeedDay = day?.isRefeedDay === true;
          const refeedMeta = isRefeedDay && Refeed?.getDayMeta ? Refeed.getDayMeta(day, currentRatio) : null;

          return React.createElement('div', {
            className: 'metrics-card' + (shakeOver && displayHeroRemaining < 0 ? ' shake-excess' : '') + (isRefeedDay ? ' metrics-card--refeed' : ''),
            style: heroCardsMeta.getRemainingCardStyle(displayRemainCol),
            title: refeedMeta?.tooltip || ''
          },
            React.createElement('div', { className: 'metrics-icon' }, displayHeroRemaining >= 0 ? '🎯' : '🚫'),
            React.createElement('div', { className: 'metrics-value', style: heroCardsMeta.getRemainingValueStyle(displayRemainCol) },
              displayHeroRemaining >= 0 ? displayHeroRemaining : Math.abs(displayHeroRemaining)
            ),
            React.createElement('div', { className: 'metrics-label' },
              displayHeroRemaining >= 0 ? 'Осталось' : 'Перебор'
            ),
            // 🆕 Refeed day hint
            isRefeedDay && React.createElement('div', {
              className: 'metrics-refeed-hint',
              style: heroCardsMeta.refeedHintStyle
            }, '🍕 загрузка +35%')
          );
        })()
      ),
      // Спарклайн калорий — карточка в стиле веса
      // Вычисляем статистику для badge здесь (до рендера)
      (() => {
        const sparklinePeriodMeta = vmComputed.sparklinePeriodMeta;
        const deficitBadgeClass = sparklinePeriodMeta.deficitBadgeClass || 'sparkline-goal-badge';
        const deficitText = sparklinePeriodMeta.deficitText || '';
        const tooltipText = sparklinePeriodMeta.tooltipText || '';

        const renderData = vmProgress.sparklineRenderData || sparklineData;

        return React.createElement('div', {
          className: 'kcal-sparkline-container' + (useReportsV4 ? ' reports-v4-dynamics-card' : ''),
          id: 'tour-calorie-graph'
        },
          !useReportsV4 && React.createElement('div', { className: 'kcal-sparkline-header' },
            React.createElement('span', { className: 'kcal-sparkline-title' }, '📊 Калории'),
            React.createElement('div', { className: 'kcal-header-right' },
              React.createElement('div', { className: 'kcal-period-pills' },
                [7, 14, 30].map(period =>
                  React.createElement('button', {
                    key: period,
                    className: 'kcal-period-pill' + (chartPeriod === period ? ' active' : ''),
                    onClick: () => handlePeriodChange(period)
                  }, period + 'д')
                )
              )
            )
          ),
          useReportsV4 && React.createElement('div', { className: 'reports-v4-dynamics-card__head' },
            React.createElement('span', { className: 'reports-v4-dynamics-card__label' }, 'Съедено и норма'),
            React.createElement('span', { className: 'reports-v4-dynamics-card__period' }, chartPeriod + ' дней')
          ),
          !useReportsV4 && React.createElement('div', { className: 'kcal-sparkline-legend' },
            React.createElement('span', { className: 'kcal-sparkline-legend-item' },
              React.createElement('img', {
                className: 'kcal-sparkline-legend-icon',
                src: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/26a1.svg',
                alt: ''
              }),
              '— была зарядка'
            )
          ),
          React.createElement('div', {
            className: chartTransitioning ? 'sparkline-transitioning' : '',
            style: vmComputed.sparklineContainerStyle
          },
            // 🔧 FIX: Используем displayOptimum (с учётом долга) для линии цели
            renderSparkline(renderData, displayOptimum, { reportsV4: useReportsV4, chartPeriod })
          ),
          useReportsV4 && React.createElement('div', { className: 'reports-v4-dynamics-card__legend' },
            React.createElement('span', { className: 'reports-v4-dynamics-card__legend-item' },
              React.createElement('span', { className: 'reports-v4-dynamics-card__legend-swatch is-goal', 'aria-hidden': 'true' }),
              'норма'
            ),
            React.createElement('span', { className: 'reports-v4-dynamics-card__legend-item' },
              React.createElement('span', { className: 'reports-v4-dynamics-card__legend-swatch is-eaten', 'aria-hidden': 'true' }),
              'съедено'
            )
          ),
          useReportsV4 && React.createElement('div', { className: 'reports-v4-dynamics-card__hint' },
            'Ступенька — надбавка второй половины, зоны здесь нет'
          ),
          shouldOfferRealDataConfirmation && React.createElement('div', {
            className: 'kcal-realdata-card'
          },
            React.createElement('div', { className: 'kcal-realdata-card__header' },
              React.createElement('div', { className: 'kcal-realdata-card__copy' },
                React.createElement('div', { className: 'kcal-realdata-card__title' }, 'Мало калорий — ещё не значит, что день пустой'),
                React.createElement('div', { className: 'kcal-realdata-card__text' },
                  'Сейчас ' + Math.round(displayHeroEaten || eatenKcal || 0) + ' из ' + Math.round(displayHeroOptimum || optimum || 0) + ' ккал, поэтому день временно исключён из статистики. Если это реальные данные — подтверди их.'
                )
              )
            ),
            React.createElement('div', { className: 'kcal-realdata-card__footer' },
              React.createElement('span', { className: 'kcal-realdata-card__badge' },
                Math.round((currentRatio || 0) * 100) + '% от нормы'
              ),
              // Контракт «порядок кнопок подтверждения»: рекомендованное
              // действие стоит ПЕРВЫМ, а не просто красится ярче. Раньше
              // порядок был фиксированным и менялось только оформление —
              // читающий сверху вниз видел рекомендацию второй.
              React.createElement('div', { className: 'kcal-realdata-card__actions' },
                (isClearPrimary ? [
                  { id: 'clear', label: 'Очистить данные', onClick: clearCurrentDayFromStats,
                    aria: 'Очистить данные дня и исключить из статистики' },
                  { id: 'real', label: 'Это реальные данные', onClick: confirmCurrentDayAsRealData,
                    aria: 'Подтвердить день как реальные данные' }
                ] : [
                  { id: 'real', label: 'Это реальные данные', onClick: confirmCurrentDayAsRealData,
                    aria: 'Подтвердить день как реальные данные' },
                  { id: 'clear', label: 'Очистить данные', onClick: clearCurrentDayFromStats,
                    aria: 'Очистить данные дня и исключить из статистики' }
                ]).map((btn, index) => React.createElement('button', {
                  key: btn.id,
                  type: 'button',
                  // Вторая остаётся доступной и выглядит вторичной — не
                  // прячется и не гаснет.
                  className: 'kcal-realdata-card__button' + (index === 0 ? '' : ' kcal-realdata-card__button--secondary'),
                  onClick: btn.onClick,
                  'aria-label': btn.aria
                }, btn.label))
              ),
              React.createElement('div', { className: 'kcal-realdata-card__recommendation' }, recommendationText),
              React.createElement('div', { className: 'kcal-realdata-card__impact' }, impactHintText)
            )
          )
        );
      })(),
      // === CALORIC DEBT CARD v2 — Чистая и понятная карточка долга ===
      !useReportsV4 && caloricDebt && caloricDebt.hasDebt && (() => {
        const { debt, effectiveDebt, recoveryDays, dailyBoost, adjustedOptimum, needsRefeed, refeedBoost, refeedOptimum, dayBreakdown, daysToRecover, recoveryDayName } = caloricDebt;
        const debtDaysMeta = vmComputed.debtDaysMeta || dayBreakdown || [];

        // Цвет по уровню долга
        const accentColor = debtCardMeta.accentColor || '#3b82f6';

        // Popup науки
        const showSciencePopup = (e) => {
          e.stopPropagation();
          openExclusivePopup('debt-science', {
            title: '🔬 Как работает восстановление',
            content: [
              { label: 'Почему не 100%?', value: 'Организм адаптируется к дефициту, снижая метаболизм на ~15% (Leibel 1995). Компенсировать весь долг — перебор.' },
              { label: 'Почему ' + recoveryDays + ' дня?', value: debt < 300 ? 'Маленький долг (<300 ккал) — можно закрыть за 1 день без стресса.' : debt < 700 ? 'Средний долг (300-700 ккал) — оптимально 2 дня для плавного восстановления.' : 'Большой долг (>700 ккал) — 3 дня чтобы не перегружать ЖКТ и метаболизм.' },
              { label: 'Формула', value: effectiveDebt + ' ккал (75% от ' + debt + ') ÷ ' + recoveryDays + ' дн = +' + dailyBoost + ' ккал/день' }
            ],
            links: [
              { text: 'Leibel 1995', url: 'https://pubmed.ncbi.nlm.nih.gov/7632212/' },
              { text: 'Hall 2011', url: 'https://pubmed.ncbi.nlm.nih.gov/21872751/' }
            ]
          });
        };

        const showDebtInfo = (e) => {
          e.stopPropagation();
          if (HEYS?.Toast?.info) {
            HEYS.Toast.info('Долг считается от базовой нормы (без бонуса долга и refeed). На графике — цель дня с учётом бонусов.', {
              title: 'ℹ️ Пояснение'
            });
          } else if (typeof HEYS?.toast === 'function') {
            HEYS.toast({
              type: 'info',
              title: 'ℹ️ Пояснение',
              message: 'Долг считается от базовой нормы (без бонуса долга и refeed). На графике — цель дня с учётом бонусов.'
            });
          }
        };

        return React.createElement('div', {
          className: 'debt-card' + (balanceCardExpanded ? ' expanded' : ''),
          onClick: (e) => {
            e.stopPropagation();
            // 2026-05-28: dropped React.startTransition wrapper — в курaторской сессии
            // transition deprioritized, setBalanceCardExpanded discarded → tap не срабатывал.
            // Sync setState возвращает 188-375мс freeze (известная стоимость), но tap надёжен.
            // Полный refactor с component extraction + memo для устранения freeze см.
            // docs/REFACTOR_DAY_TAB_MEMO_v1.md (priority в todo.md).
            setBalanceCardExpanded(!balanceCardExpanded);
          }
        },
          // === COLLAPSED VIEW ===
          React.createElement('div', { className: 'debt-card-row' },
            React.createElement('div', { className: 'debt-card-left' },
              React.createElement('span', { className: 'debt-card-icon', style: debtCardMeta.iconStyle }, '💰'),
              React.createElement('span', { className: 'debt-card-label' },
                'Недобор ' + debt + ' ккал'
              ),
              React.createElement('span', {
                className: 'debt-card-info',
                title: 'Долг считается от базовой нормы (без бонуса долга и refeed).',
                onClick: showDebtInfo
              }, ' ⓘ'),
              dailyBoost > 0 && React.createElement('span', { className: 'debt-card-boost' },
                '+' + dailyBoost + '/день'
              )
            ),
            // Кнопка "?" для науки + chevron
            React.createElement('div', { className: 'debt-card-right' },
              React.createElement('button', {
                className: 'debt-science-btn',
                onClick: showSciencePopup,
                title: 'Как это работает?'
              }, '?'),
              React.createElement('span', { className: 'debt-card-chevron' },
                balanceCardExpanded ? '▲' : '▼'
              )
            )
          ),

          // === EXPANDED VIEW ===
          balanceCardExpanded && React.createElement('div', { className: 'debt-card-expanded' },
            // Мини-график по дням
            React.createElement('div', { className: 'debt-days-row' },
              debtDaysMeta.map((d) => {
                const isPos = d.delta >= 0;
                const baseInfo = d.baseTarget ? ('база ' + d.baseTarget) : 'база —';
                const planInfo = d.target && d.baseTarget && d.target !== d.baseTarget
                  ? (' • план ' + d.target)
                  : '';
                return React.createElement('div', {
                  key: d.date,
                  className: 'debt-day-col',
                  title: d.dayName + ': ' + (d.delta > 0 ? '+' : '') + d.delta + ' ккал (съедено ' + d.eaten + ' / ' + baseInfo + planInfo + ')'
                },
                  React.createElement('div', { className: 'debt-day-bar-wrap' },
                    React.createElement('div', {
                      className: 'debt-day-bar ' + (isPos ? 'pos' : 'neg'),
                      style: d.barStyle
                    })
                  ),
                  React.createElement('span', { className: 'debt-day-label' }, d.dayName),
                  d.hasTraining && React.createElement('span', { className: 'debt-day-train' }, '🏋️')
                );
              })
            ),

            React.createElement('div', { className: 'caloric-balance-legend' },
              React.createElement('span', { className: 'caloric-balance-legend-icon' }, 'ℹ️'),
              React.createElement('span', { className: 'caloric-balance-legend-text' },
                'Недобор считается от базовой нормы. Линия графика — цель дня с учётом бонусов.'
              )
            ),

            // План восстановления — главный блок
            React.createElement('div', { className: 'debt-plan-block' },
              React.createElement('div', { className: 'debt-plan-header' }, '📋 План'),
              React.createElement('div', { className: 'debt-plan-content' },
                React.createElement('span', { className: 'debt-plan-formula' },
                  effectiveDebt + ' ккал' + ' ÷ ' + recoveryDays + ' дн = '
                ),
                React.createElement('strong', { className: 'debt-plan-result' }, '+' + dailyBoost + ' ккал/день')
              ),
              React.createElement('div', { className: 'debt-plan-note' },
                '75% от долга за ' + recoveryDays + ' ' + (recoveryDays === 1 ? 'день' : 'дня')
              )
            ),

            // Итоговая норма
            React.createElement('div', { className: 'debt-summary-row' },
              React.createElement('span', null, '🎯 Норма сегодня: '),
              React.createElement('strong', null, adjustedOptimum + ' ккал')
            ),

            // 🆕 v3.20: PROTEIN DEBT — Секция белкового долга
            // 🔬 Mettler 2010 (PMID: 20095013): При дефиците белок критичен для мышц
            caloricDebt.proteinDebt?.hasDebt && React.createElement('div', {
              className: 'debt-insight-row protein-debt',
              style: insightRowsMeta.proteinDebt?.containerStyle
            },
              React.createElement('span', { style: insightRowsMeta.proteinDebt?.iconStyle }, '🥩'),
              React.createElement('div', { style: insightRowsMeta.flexGrow },
                React.createElement('div', {
                  style: insightRowsMeta.proteinDebt?.titleStyle
                },
                  caloricDebt.proteinDebt.severity === 'critical'
                    ? '⚠️ Критический недобор белка!'
                    : '💪 Белка маловато'
                ),
                React.createElement('div', { style: insightRowsMeta.proteinDebt?.subtitleStyle },
                  caloricDebt.proteinDebt.recommendation ||
                  ('Среднее: ' + caloricDebt.proteinDebt.avgProteinPct + '% от нормы')
                )
              ),
              // PMID ссылка
              React.createElement('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/20095013/',
                target: '_blank',
                rel: 'noopener',
                onClick: (e) => e.stopPropagation(),
                style: insightRowsMeta.proteinDebt?.pmidStyle,
                title: 'Mettler 2010: Белок сохраняет мышцы при дефиците'
              }, '📚')
            ),

            // 🆕 v3.20: EMOTIONAL RISK — Предупреждение о риске срыва
            // 🔬 Epel 2001 (PMID: 11070333): Стресс + голод = binge eating
            caloricDebt.emotionalRisk?.level !== 'low' && React.createElement('div', {
              className: 'debt-insight-row emotional-risk',
              style: insightRowsMeta.emotionalRisk?.containerStyle
            },
              React.createElement('span', { style: insightRowsMeta.emotionalRisk?.iconStyle },
                caloricDebt.emotionalRisk.level === 'critical' ? '🚨' : '😰'
              ),
              React.createElement('div', { style: insightRowsMeta.flexGrow },
                React.createElement('div', {
                  style: insightRowsMeta.emotionalRisk?.titleStyle
                },
                  'Риск срыва: ' + caloricDebt.emotionalRisk.bingeRisk + '%'
                ),
                React.createElement('div', { style: insightRowsMeta.emotionalRisk?.subtitleStyle },
                  caloricDebt.emotionalRisk.recommendation || caloricDebt.emotionalRisk.factors.join(' • ')
                )
              ),
              // PMID ссылка
              React.createElement('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/11070333/',
                target: '_blank',
                rel: 'noopener',
                onClick: (e) => e.stopPropagation(),
                style: insightRowsMeta.emotionalRisk?.pmidStyle,
                title: 'Epel 2001: Кортизол → тяга к сладкому'
              }, '📚')
            ),

            // 🆕 v3.20: CIRCADIAN CONTEXT — Срочность по времени суток
            // 🔬 Van Cauter 1997 (PMID: 9331550): Инсулин лучше утром
            caloricDebt.circadianContext?.urgency === 'high' && React.createElement('div', {
              className: 'debt-insight-row circadian-hint',
              style: insightRowsMeta.circadianContext?.containerStyle
            },
              React.createElement('span', { style: insightRowsMeta.circadianContext?.iconStyle },
                caloricDebt.circadianContext.period === 'morning' ? '🌅' : '🌙'
              ),
              React.createElement('div', { style: insightRowsMeta.flexGrow },
                React.createElement('div', { style: insightRowsMeta.circadianContext?.titleStyle },
                  caloricDebt.circadianContext.period === 'evening' || caloricDebt.circadianContext.period === 'night'
                    ? '⏰ Вечер — время поесть!'
                    : '☀️ Утро — впереди целый день'
                ),
                React.createElement('div', { style: insightRowsMeta.circadianContext?.subtitleStyle },
                  caloricDebt.circadianContext.period === 'evening' || caloricDebt.circadianContext.period === 'night'
                    ? 'Не откладывай — поздний ужин хуже усваивается'
                    : 'Можно спокойно добрать калории'
                )
              ),
              // PMID ссылка
              React.createElement('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/9331550/',
                target: '_blank',
                rel: 'noopener',
                onClick: (e) => e.stopPropagation(),
                style: insightRowsMeta.circadianContext?.pmidStyle,
                title: 'Van Cauter 1997: Циркадные ритмы инсулина'
              }, '📚')
            ),

            // 🆕 v3.20: TRAINING DAY CONTEXT — Приоритет питания
            // 🔬 Aragon 2013 (PMID: 23360586): Тайминг белка критичен
            caloricDebt.trainingDayContext?.isTrainingDay && caloricDebt.trainingDayContext.nutritionPriority === 'highest' && React.createElement('div', {
              className: 'debt-insight-row training-context',
              style: insightRowsMeta.trainingDayContext?.containerStyle
            },
              React.createElement('span', { style: insightRowsMeta.trainingDayContext?.iconStyle }, '💪'),
              React.createElement('div', { style: insightRowsMeta.flexGrow },
                React.createElement('div', { style: insightRowsMeta.trainingDayContext?.titleStyle },
                  caloricDebt.trainingDayContext.trainingType === 'strength'
                    ? '🏋️ Силовая — белок критичен!'
                    : '🏃 Кардио — восполни гликоген!'
                ),
                React.createElement('div', { style: insightRowsMeta.trainingDayContext?.subtitleStyle },
                  'Недоедание в тренировочный день = потеря результатов'
                )
              ),
              // PMID ссылка
              React.createElement('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/23360586/',
                target: '_blank',
                rel: 'noopener',
                onClick: (e) => e.stopPropagation(),
                style: insightRowsMeta.trainingDayContext?.pmidStyle,
                title: 'Aragon 2013: Нутриент тайминг для мышц'
              }, '📚')
            ),

            // 🆕 v3.20: BMI CONTEXT — Персонализированная рекомендация
            // 🔬 DeFronzo 1979 (PMID: 510806): BMI влияет на метаболизм
            caloricDebt.bmiContext?.recommendation && React.createElement('div', {
              className: 'debt-insight-row bmi-context',
              style: insightRowsMeta.bmiContext?.containerStyle
            },
              React.createElement('span', null, 'ℹ️'),
              React.createElement('span', null, caloricDebt.bmiContext.recommendation),
              React.createElement('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/510806/',
                target: '_blank',
                rel: 'noopener',
                onClick: (e) => e.stopPropagation(),
                style: insightRowsMeta.bmiContext?.pmidStyle,
                title: 'DeFronzo 1979: Возраст и инсулинорезистентность'
              }, '📚')
            ),

            // Refeed suggestion (если нужен)
            needsRefeed && refeedBoost > 0 && React.createElement('div', { className: 'debt-refeed-hint' },
              React.createElement('span', null, '🍕 Или refeed: до ' + refeedOptimum + ' ккал'),
              React.createElement('span', { className: 'debt-refeed-tip' }, ' — отметь в чек-ине')
            )
          )
        );
      })(),

      // === CALORIC EXCESS CARD — Карточка перебора (раскрывающаяся) ===
      // 🔬 Философия: НЕ наказываем, а мягко подталкиваем к балансу
      // - Основной акцент на АКТИВНОСТЬ (кардио, шаги)
      // - Снижение нормы — мягкий акцент (5-10%), не штраф
      // - Herman & Polivy 1984: строгие ограничения → срывы
      !useReportsV4 && caloricDebt && caloricDebt.hasExcess && !caloricDebt.hasDebt && (() => {
        const {
          excess, rawExcess, cardioRecommendation, totalTrainingKcal, dayBreakdown, trend, severity, weightImpact, goalMode,
          // 🆕 Мягкая коррекция
          dailyReduction, effectiveExcess, activityCompensation, excessRecoveryDays
        } = caloricDebt;

        const style = excessStyleMeta.style || { icon: '➕', color: '#a3a3a3', bg: 'rgba(163, 163, 163, 0.05)', border: 'rgba(163, 163, 163, 0.12)', label: 'Небольшой плюс' };
        const excessStyles = excessCardMeta.styles;
        const breakdownMax = (Array.isArray(dayBreakdown) && dayBreakdown.length > 0)
          ? dayBreakdown.reduce((max, d) => Math.max(max, Math.abs(d.delta || 0)), 0) || 1
          : 1;

        const shortRec = cardioRecommendation
          ? (cardioRecommendation.compensatedBySteps
            ? '✓ сбалансировано'
            : cardioRecommendation.activityIcon + ' ' + cardioRecommendation.minutes + ' мин')
          : null;

        return React.createElement('div', {
          className: 'caloric-balance-card excess' + (balanceCardExpanded ? ' expanded' : ''),
          style: excessStyleMeta.cardStyle || {
            background: style.bg,
            borderColor: style.border,
            '--balance-color': style.color
          },
          onClick: (e) => {
            e.stopPropagation();
            // 2026-05-28: dropped React.startTransition wrapper (same reason as debt-card above)
            setBalanceCardExpanded(!balanceCardExpanded);
          }
        },
          // === HEADER (всегда виден) — компактная строка ===
          React.createElement('div', { className: 'caloric-balance-header' },
            React.createElement('span', { className: 'caloric-balance-icon' }, style.icon),
            React.createElement('div', { className: 'caloric-balance-summary' },
              React.createElement('span', { className: 'caloric-balance-label' },
                'Профицит за ' + dayBreakdown.length + ' дн',
                React.createElement('span', {
                  className: 'caloric-balance-info',
                  style: excessStyles.infoIcon,
                  'aria-label': 'Баланс считается относительно базовой нормы (TDEE). На графике — цель дня с учётом долга/рефида.',
                  onClick: (e) => {
                    e.stopPropagation();
                    if (HEYS?.Toast?.info) {
                      HEYS.Toast.info('Профицит считается от базовой нормы (TDEE). График — цель дня с учётом долга/рефида.', {
                        title: 'ℹ️ Пояснение'
                      });
                    } else if (typeof HEYS?.toast === 'function') {
                      HEYS.toast({
                        type: 'info',
                        title: 'ℹ️ Пояснение',
                        message: 'Профицит считается от базовой нормы (TDEE). График — цель дня с учётом долга/рефида.'
                      });
                    }
                  }
                }, ' ⓘ')
              ),
              // 🆕 Показываем мягкую коррекцию если есть
              dailyReduction > 0 && React.createElement('span', {
                className: 'caloric-balance-rec-short',
                style: excessStyles.headerRecShort
              }, '−' + dailyReduction + ' ккал'),
              // Или рекомендацию по активности
              !dailyReduction && shortRec && React.createElement('span', { className: 'caloric-balance-rec-short' }, shortRec)
            ),
            React.createElement('span', {
              className: 'caloric-balance-badge',
              style: excessStyleMeta.badgeStyle
            }, '+' + excess),
            // Мини-график баланса ПОСЛЕ бейджа (увеличенный)
            balanceViz && React.createElement('div', { className: 'caloric-balance-viz-inline caloric-balance-viz-large' },
              balanceViz.viz.map((v, i) => React.createElement('span', {
                key: i,
                className: 'balance-viz-bar balance-viz-bar-clickable',
                style: excessCardMeta.getBalanceVizBarStyle
                  ? excessCardMeta.getBalanceVizBarStyle(v.color)
                  : undefined,
                title: v.day + ': ' + (v.delta > 0 ? '+' : '') + v.delta + ' ккал',
                onClick: (e) => {
                  e.stopPropagation();
                  const rect = e.target.getBoundingClientRect();
                  setTimeout(() => { setBalanceDayPopup({ day: v, x: rect.left + rect.width / 2, y: rect.top }); }, 0);
                }
              }, v.bar))
            ),
            React.createElement('span', { className: 'caloric-balance-chevron' },
              balanceCardExpanded ? '▲' : '▼'
            )
          ),

          // === DETAILS (только при раскрытии) ===
          balanceCardExpanded && React.createElement('div', { className: 'caloric-balance-details' },
            // 🆕 Разбивка по дням (чтобы было видно, какие дни учтены)
            Array.isArray(dayBreakdown) && dayBreakdown.length > 0 && React.createElement('div', { className: 'debt-days-row caloric-balance-days' },
              dayBreakdown.map((d) => {
                const isPos = (d.delta || 0) >= 0;
                const pct = Math.min(100, Math.round(Math.abs(d.delta || 0) / breakdownMax * 100));
                return React.createElement('div', {
                  key: d.date,
                  className: 'debt-day-col',
                  title: d.dayName + ': ' + (d.delta > 0 ? '+' : '') + d.delta + ' ккал (съедено ' + d.eaten + ' / норма ' + d.target + ')'
                },
                  React.createElement('div', { className: 'debt-day-bar-wrap' },
                    React.createElement('div', {
                      className: 'debt-day-bar ' + (isPos ? 'pos' : 'neg'),
                      style: { height: pct + '%' }
                    })
                  ),
                  React.createElement('span', { className: 'debt-day-label' }, d.dayName),
                  React.createElement('span', { className: 'debt-day-value' }, (d.delta > 0 ? '+' : '') + d.delta)
                );
              })
            ),

            React.createElement('div', {
              className: 'caloric-balance-legend',
              style: excessStyles.legend
            },
              React.createElement('span', { style: excessStyles.legendIcon }, 'ℹ️'),
              React.createElement('span', { style: excessStyles.legendText }, 'Профицит здесь считается от базовой нормы (TDEE). Линия/план дня — цель с учётом долга или refeed.')
            ),

            // 🆕 МЯГКАЯ КОРРЕКЦИЯ — акцент (не наказание!)
            dailyReduction > 0 && React.createElement('div', {
              className: 'caloric-excess-soft-correction',
              style: excessStyles.softCorrection
            },
              React.createElement('span', { style: excessStyles.softCorrectionIcon }, '🎯'),
              React.createElement('div', { style: excessStyles.softCorrectionTextWrap },
                React.createElement('div', { style: excessStyles.softCorrectionTitle },
                  'Норма сегодня: ' + Math.round(optimum - dailyReduction) + ' ккал'
                ),
                React.createElement('div', { style: excessStyles.softCorrectionSub },
                  'Мягкая коррекция −' + dailyReduction + ' ккал • ' +
                  (activityCompensation > 0 ? Math.round(activityCompensation) + ' ккал через активность' : 'основной акцент — активность')
                )
              ),
              // "?" кнопка с научным обоснованием — открывает popup НА ВКЛАДКЕ ДНЕВНИК
              React.createElement('span', {
                style: excessStyles.scienceBtn,
                title: 'Научное обоснование',
                onClick: (e) => {
                  e.stopPropagation();
                  const popupData = excessSciencePopupMeta;
                  // Сначала переключаемся на вкладку Дневник, потом показываем popup
                  if (mobileSubTab === 'stats' && window.HEYS?.App?.setTab) {
                    App?.setTab?.('diary');
                    setTimeout(() => setDebtSciencePopup(popupData), 200);
                  } else {
                    setDebtSciencePopup(popupData);
                  }
                }
              }, '?')
            ),

            // 🔬 Научная сводка — Forbes equation
            balanceViz && balanceViz.fatGain > 0 && React.createElement('div', {
              className: 'caloric-excess-science-summary',
              style: excessStyles.scienceSummary
            },
              React.createElement('span', null, '🧬'),
              React.createElement('div', { style: excessStyles.softCorrectionTextWrap },
                React.createElement('div', { style: excessStyles.scienceSummaryTitle },
                  'По Forbes: ' + (balanceViz.totalBalance > 0 ? '+' : '') + balanceViz.fatGain + 'г жира, ' +
                  (balanceViz.totalBalance > 0 ? '+' : '') + balanceViz.glycogenWater + 'г воды'
                ),
                balanceViz.epocKcal > 30 && React.createElement('div', { style: excessStyles.scienceSummarySub },
                  'EPOC сжёг ~' + balanceViz.epocKcal + ' ккал после тренировок'
                )
              ),
              React.createElement('a', {
                href: 'https://pubmed.ncbi.nlm.nih.gov/10365981/',
                target: '_blank',
                rel: 'noopener',
                onClick: (e) => e.stopPropagation(),
                style: excessStyles.scienceSummaryLink
              }, 'PMID')
            ),

            // Инсайты БАЛАНСА (тренд, паттерн, прогноз, и т.д.)
            balanceViz && balanceViz.balanceInsights && balanceViz.balanceInsights.length > 0 && React.createElement('div', { className: 'caloric-balance-insights' },
              balanceInsightsMeta.map((insight, i) => (
                React.createElement('div', {
                  key: i,
                  className: 'caloric-balance-insight-item',
                  style: insight.itemStyle
                },
                  React.createElement('span', { className: 'caloric-insight-emoji' }, insight.emoji),
                  React.createElement('span', { className: 'caloric-insight-text' }, insight.text),
                  // PMID ссылка если есть
                  insight.pmid && React.createElement('a', {
                    href: 'https://pubmed.ncbi.nlm.nih.gov/' + insight.pmid + '/',
                    target: '_blank',
                    rel: 'noopener',
                    onClick: (e) => e.stopPropagation(),
                    style: insight.pmidStyle
                  }, '📚')
                )
              ))
            ),

            // Рекомендация кардио (подробная) — ГЛАВНЫЙ способ компенсации
            cardioRecommendation && !cardioRecommendation.compensatedBySteps && React.createElement('div', {
              className: 'caloric-excess-cardio',
              style: excessStyles.cardioRec
            },
              React.createElement('span', { className: 'caloric-excess-rec-icon', style: excessStyles.cardioRecIcon }, cardioRecommendation.activityIcon),
              React.createElement('div', { className: 'caloric-excess-rec-content' },
                React.createElement('span', { className: 'caloric-excess-rec-title', style: excessStyles.cardioRecTitle }, '✨ Лучший способ:'),
                React.createElement('span', { className: 'caloric-excess-rec-text' }, cardioRecommendation.text),
                cardioRecommendation.stepsCompensation > 0 &&
                React.createElement('span', { className: 'caloric-excess-steps-note' },
                  '👟 Шаги уже списали ' + cardioRecommendation.stepsCompensation + ' ккал'
                )
              )
            ),

            // Успех — шаги компенсировали всё
            cardioRecommendation && cardioRecommendation.compensatedBySteps && React.createElement('div', {
              className: 'caloric-excess-success',
              style: excessStyles.success
            },
              React.createElement('span', { style: excessStyles.successText }, '🎉 ' + cardioRecommendation.text)
            ),

            // Позитивное пояснение (НЕ наказываем!)
            React.createElement('div', {
              className: 'caloric-balance-explanation',
              style: excessStyles.explanation
            },
              goalMode === 'bulk'
                ? '💪 При наборе массы профицит — это часть плана!'
                : severity >= 2
                  ? '🏃 Активность — лучший способ выровнять баланс. Это данные, не приговор.'
                  : goalMode === 'loss'
                    ? '💡 Лёгкая прогулка или тренировка сбалансирует день. Без стресса!'
                    : '🌟 Баланс немного в плюсе — отличный повод для активности!'
            )
          )
        );
      })(),

      // Popup с деталями при клике на точку — НОВЫЙ КОНСИСТЕНТНЫЙ ДИЗАЙН
      sparklinePopup && sparklinePopup.type === 'kcal' && (() => {
        const sparklinePopupMeta = vmComputed.sparklinePopupMeta;
        const point = sparklinePopupMeta.point || sparklinePopup.point;
        const ratio = sparklinePopupMeta.ratio || (point.kcal / point.target);
        const pct = sparklinePopupMeta.pct || Math.round(ratio * 100);
        const color = sparklinePopupMeta.color || '#eab308';

        // Позиционирование с защитой от выхода за экран
        const popupW = 260;
        const popupH = 280;
        const pos = getSmartPopupPosition(
          sparklinePopup.x,
          sparklinePopup.y,
          popupW,
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;

        const diff = sparklinePopupMeta.diff;
        const gradient = sparklinePopupMeta.gradient || 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
        const kcalStyles = sparklinePopupMeta.styles;

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setSparklinePopup(null));

        // POPUP с использованием PopupWithBackdrop
        return PopupWithBackdrop({
          onClose: () => setSparklinePopup(null),
          children: React.createElement('div', {
            className: 'sparkline-popup sparkline-popup-v2' + (showAbove ? ' show-above' : ''),
            role: 'dialog',
            'aria-label': (point.isToday ? 'Сегодня' : point.dayNum) + ' — ' + pct + '% от нормы',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(kcalStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Цветная полоса
            React.createElement('div', {
              className: 'sparkline-popup-stripe',
              style: kcalStyles.stripe || undefined
            }),
            // Контент
            React.createElement('div', { className: 'sparkline-popup-content' },
              // Swipe indicator
              React.createElement('div', { className: 'sparkline-popup-swipe' }),
              // Header: дата + процент
              React.createElement('div', { className: 'sparkline-popup-header-v2' },
                React.createElement('span', { className: 'sparkline-popup-date' },
                  (() => {
                    if (point.isToday) return '📅 Сегодня';
                    const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
                    const wd = weekDays[point.dayOfWeek] || '';
                    return '📅 ' + point.dayNum + ' ' + wd;
                  })()
                ),
                React.createElement('span', {
                  className: 'sparkline-popup-pct',
                  style: kcalStyles.pct || undefined
                }, pct + '%')
              ),
              // Progress bar
              React.createElement('div', { className: 'sparkline-popup-progress' },
                React.createElement('div', {
                  className: 'sparkline-popup-progress-fill',
                  style: kcalStyles.progressFill || undefined
                })
              ),
              // Value
              React.createElement('div', { className: 'sparkline-popup-value-row' },
                React.createElement('span', { style: kcalStyles.value || undefined },
                  Math.round(point.kcal) + ' ккал'
                ),
                React.createElement('span', { className: 'sparkline-popup-target' },
                  ' / ' + point.target + ' ккал'
                ),
                // Сравнение со вчера
                diff !== null && React.createElement('span', {
                  className: 'sparkline-popup-compare' + (diff > 0 ? ' up' : diff < 0 ? ' down' : ''),
                }, diff > 0 ? '↑' : diff < 0 ? '↓' : '=', ' ', Math.abs(Math.round(diff)))
              ),
              // Теги: сон, тренировка, шаги, оценка
              (point.sleepHours > 0 || point.trainingMinutes > 0 || point.steps > 0 || point.dayScore > 0) &&
              React.createElement('div', { className: 'sparkline-popup-tags-v2' },
                point.sleepHours > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2' + (point.sleepHours < 6 ? ' bad' : point.sleepHours >= 7 ? ' good' : '')
                }, '😴 ' + point.sleepHours.toFixed(1) + 'ч'),
                point.trainingMinutes > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2 good'
                }, '🏃 ' + point.trainingMinutes + 'м'),
                point.steps > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2' + (point.steps >= 10000 ? ' good' : '')
                }, '👟 ' + point.steps.toLocaleString()),
                point.dayScore > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2',
                  style: dayScoreStyleMeta ? dayScoreStyleMeta(point.dayScore) : undefined
                }, '⭐ ' + point.dayScore)
              ),
              // Кнопка перехода
              !point.isToday && React.createElement('button', {
                className: 'sparkline-popup-btn-v2',
                onClick: () => {
                  setSparklinePopup(null);
                  selectDateWithPrefetch(point.date, { reason: 'sparkline-kcal' });
                }
              }, '→ Перейти к дню'),
              // Close
              React.createElement('button', {
                className: 'sparkline-popup-close',
                'aria-label': 'Закрыть',
                onClick: () => setSparklinePopup(null)
              }, '✕')
            ),
            // Стрелка
            React.createElement('div', {
              className: 'sparkline-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
            })
          ) // Закрываем popup div внутри PopupWithBackdrop
        }); // Закрываем PopupWithBackdrop
      })(),
      // Popup для идеального дня 🔥 — ЗОЛОТОЙ СТИЛЬ
      sparklinePopup && sparklinePopup.type === 'perfect' && (() => {
        const point = sparklinePopup.point;
        const pct = sparklinePerfectPopupMeta.pct || Math.round((point.kcal / point.target) * 100);
        const perfectStyles = sparklinePerfectPopupMeta.styles;

        // Позиционирование
        const popupW = 260;
        let left = sparklinePopup.x - popupW / 2;
        let arrowPos = 'center';
        if (left < 10) { left = 10; arrowPos = 'left'; }
        if (left + popupW > window.innerWidth - 10) { left = window.innerWidth - popupW - 10; arrowPos = 'right'; }

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setSparklinePopup(null));

        return PopupWithBackdrop({
          onClose: () => setSparklinePopup(null),
          children: React.createElement('div', {
            className: 'sparkline-popup sparkline-popup-v2 sparkline-popup-perfect-v2',
            role: 'dialog',
            'aria-label': 'Идеальный день — ' + pct + '% от нормы',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(perfectStyles.popup, left, sparklinePopup.y + 15, popupW) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Золотая полоса
            React.createElement('div', {
              className: 'sparkline-popup-stripe',
              style: perfectStyles.stripe || undefined
            }),
            // Контент
            React.createElement('div', { className: 'sparkline-popup-content' },
              // Swipe indicator
              React.createElement('div', { className: 'sparkline-popup-swipe' }),
              // Header: emoji + дата
              React.createElement('div', { className: 'sparkline-popup-header-v2 perfect' },
                React.createElement('span', { className: 'sparkline-popup-perfect-title' }, '🔥 Идеальный день!'),
                React.createElement('span', {
                  className: 'sparkline-popup-pct',
                  style: perfectStyles.pct || undefined
                }, pct + '%')
              ),
              // Progress bar (золотой)
              React.createElement('div', { className: 'sparkline-popup-progress' },
                React.createElement('div', {
                  className: 'sparkline-popup-progress-fill',
                  style: perfectStyles.progressFill || undefined
                })
              ),
              // Value
              React.createElement('div', { className: 'sparkline-popup-value-row' },
                React.createElement('span', { style: perfectStyles.value || undefined },
                  Math.round(point.kcal) + ' ккал'
                ),
                React.createElement('span', { className: 'sparkline-popup-target' },
                  ' / ' + point.target + ' ккал'
                )
              ),
              // Motivation
              React.createElement('div', { className: 'sparkline-popup-motivation-v2' },
                '✨ Попал точно в цель! Так держать!'
              ),
              // Теги (золотой стиль)
              (point.sleepHours > 0 || point.trainingMinutes > 0 || point.steps > 0 || point.dayScore > 0) &&
              React.createElement('div', { className: 'sparkline-popup-tags-v2 perfect' },
                point.sleepHours > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '😴 ' + point.sleepHours.toFixed(1) + 'ч'),
                point.trainingMinutes > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '🏃 ' + point.trainingMinutes + 'м'),
                point.steps > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '👟 ' + point.steps.toLocaleString()),
                point.dayScore > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '⭐ ' + point.dayScore)
              ),
              // Кнопка перехода
              !point.isToday && React.createElement('button', {
                className: 'sparkline-popup-btn-v2 perfect',
                onClick: () => {
                  setSparklinePopup(null);
                  selectDateWithPrefetch(point.date, { reason: 'sparkline-perfect' });
                }
              }, '→ Перейти к дню'),
              // Close
              React.createElement('button', {
                className: 'sparkline-popup-close perfect',
                'aria-label': 'Закрыть',
                onClick: () => setSparklinePopup(null)
              }, '✕')
            ),
            // Стрелка (золотая)
            React.createElement('div', {
              className: 'sparkline-popup-arrow perfect' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
            })
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // Popup для бейджей БЖУ
      macroBadgePopup && (() => {
        const popupWidth = 220;
        const popupHeight = 320; // Примерная высота popup

        // Используем умное позиционирование
        const pos = getSmartPopupPosition(
          macroBadgePopup.x,
          macroBadgePopup.y,
          popupWidth,
          popupHeight,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;

        const yesterdayCompare = macroPopupMeta.yesterdayCompare;

        const rec = macroPopupMeta.rec;
        const timeMsg = macroPopupMeta.timeMsg || { icon: '⏰', text: ' ' };
        const macroPopupStyles = macroPopupMeta.styles;
        const macroSparkStyles = macroPopupMeta.sparkStyles;

        const macroStreak = macroPopupMeta.macroStreak || 0;
        const sparkData = macroPopupMeta.sparkData || [0, 0, 0, 0, 0, 0, macroBadgePopup.value || 0];
        const sparkMax = macroPopupMeta.sparkMax || Math.max(...sparkData, macroBadgePopup.norm || 100) || 100;

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setMacroBadgePopup(null));

        return PopupWithBackdrop({
          onClose: () => setMacroBadgePopup(null),
          children: React.createElement('div', {
            className: 'macro-badge-popup' + (showAbove ? ' show-above' : ''),
            role: 'dialog',
            'aria-label': macroBadgePopup.macro + ' — ' + Math.round(macroBadgePopup.ratio * 100) + '% от нормы',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(macroPopupStyles.popup, left, top, popupWidth) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Цветная полоса сверху
            React.createElement('div', {
              className: 'macro-badge-popup-stripe',
              style: macroPopupStyles.stripe || undefined
            }),
            // Контент
            React.createElement('div', { className: 'macro-badge-popup-content' },
              // Swipe indicator (mobile)
              React.createElement('div', { className: 'macro-badge-popup-swipe' }),
              // Header: макрос + процент
              React.createElement('div', { className: 'macro-badge-popup-header' },
                React.createElement('span', { className: 'macro-badge-popup-title' }, macroBadgePopup.macro),
                React.createElement('span', {
                  className: 'macro-badge-popup-pct macro-badge-popup-animated',
                  style: macroPopupStyles.pct || undefined
                }, Math.round(macroBadgePopup.ratio * 100) + '%')
              ),
              // 📊 Мини-sparkline
              React.createElement('div', { className: 'macro-badge-popup-sparkline' },
                React.createElement('svg', { viewBox: '0 0 70 20', className: 'macro-badge-popup-spark-svg' },
                  // Линия нормы
                  React.createElement('line', {
                    x1: 0, y1: 20 - (macroBadgePopup.norm / sparkMax * 18),
                    x2: 70, y2: 20 - (macroBadgePopup.norm / sparkMax * 18),
                    stroke: macroSparkStyles?.goalLine?.stroke,
                    strokeWidth: macroSparkStyles?.goalLine?.strokeWidth,
                    strokeDasharray: macroSparkStyles?.goalLine?.strokeDasharray
                  }),
                  // Точки и линии
                  sparkData.map((val, i) => {
                    const x = i * 10 + 5;
                    const y = 20 - (val / sparkMax * 18);
                    const nextVal = sparkData[i + 1];
                    const isToday = i === 6;
                    const pointStyle = isToday ? macroSparkStyles?.pointToday : macroSparkStyles?.point;
                    return React.createElement('g', { key: i },
                      // Линия к следующей точке
                      nextVal !== undefined && React.createElement('line', {
                        x1: x, y1: y,
                        x2: (i + 1) * 10 + 5, y2: 20 - (nextVal / sparkMax * 18),
                        stroke: macroSparkStyles?.connector?.stroke,
                        strokeWidth: macroSparkStyles?.connector?.strokeWidth,
                        strokeOpacity: macroSparkStyles?.connector?.strokeOpacity
                      }),
                      // Точка
                      React.createElement('circle', {
                        cx: x, cy: y,
                        r: pointStyle?.r != null ? pointStyle.r : (isToday ? 3 : 2),
                        fill: pointStyle?.fill || (isToday ? macroBadgePopup.color : '#94a3b8'),
                        className: isToday ? 'macro-badge-popup-spark-today' : ''
                      })
                    );
                  })
                ),
                React.createElement('span', { className: 'macro-badge-popup-spark-label' }, '7 дней')
              ),
              // 🎨 Прогресс-бар с градиентом
              React.createElement('div', { className: 'macro-badge-popup-progress' },
                React.createElement('div', {
                  className: 'macro-badge-popup-progress-fill macro-badge-popup-animated-bar',
                  style: macroPopupStyles.progressFill || undefined
                })
              ),
              // 💫 Значение с анимацией + сравнение со вчера
              React.createElement('div', { className: 'macro-badge-popup-value' },
                React.createElement('span', {
                  className: 'macro-badge-popup-animated',
                  style: macroPopupStyles.value || undefined
                }, macroBadgePopup.value + 'г'),
                React.createElement('span', { className: 'macro-badge-popup-norm' },
                  ' / ' + macroBadgePopup.norm + 'г'
                ),
                // 📊 Сравнение со вчера
                yesterdayCompare && React.createElement('span', {
                  className: 'macro-badge-popup-compare' + (yesterdayCompare.diff > 0 ? ' up' : yesterdayCompare.diff < 0 ? ' down' : ''),
                  'aria-label': 'Сравнение со вчера'
                }, yesterdayCompare.icon + ' ' + yesterdayCompare.text)
              ),
              // ⏰ Динамическое сообщение по времени
              React.createElement('div', { className: 'macro-badge-popup-time-msg' },
                React.createElement('span', null, timeMsg.icon),
                React.createElement('span', null, ' ' + timeMsg.text)
              ),
              // 🏆 Streak макроса
              macroStreak > 0 && React.createElement('div', { className: 'macro-badge-popup-streak' },
                React.createElement('span', { className: 'macro-badge-popup-streak-icon' }, '🏆'),
                React.createElement('span', null, macroStreak + ' ' + (macroStreak === 1 ? 'день' : macroStreak < 5 ? 'дня' : 'дней') + ' подряд в норме!')
              ),
              // Описание (все бейджи)
              macroBadgePopup.allBadges.length > 0 && React.createElement('div', { className: 'macro-badge-popup-desc' },
                macroBadgePopup.allBadges.map((b, i) =>
                  React.createElement('div', { key: i, className: 'macro-badge-popup-item' },
                    React.createElement('span', { className: 'macro-badge-popup-emoji' }, b.emoji),
                    React.createElement('span', null, b.desc)
                  )
                )
              ),
              // Рекомендация продукта
              rec && React.createElement('div', { className: 'macro-badge-popup-rec' },
                React.createElement('span', { className: 'macro-badge-popup-rec-icon' }, rec.icon),
                React.createElement('span', { className: 'macro-badge-popup-rec-text' },
                  rec.text + ' ',
                  React.createElement('b', null, rec.amount)
                )
              ),
              // Закрыть
              React.createElement('button', {
                className: 'macro-badge-popup-close',
                'aria-label': 'Закрыть',
                onClick: () => setMacroBadgePopup(null)
              }, '✕')
            ),
            // Стрелка-указатель
            React.createElement('div', {
              className: 'macro-badge-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
            })
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // === TDEE POPUP (расшифровка затрат) ===
      tdeePopup && (() => {
        const d = tdeePopup.data;
        const tdeePopupMeta = vmComputed.tdeePopupMeta;
        const popupW = 300;
        const popupH = 400;
        const pos = getSmartPopupPosition(
          tdeePopup.x,
          tdeePopup.y,
          popupW,
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;

        // Подсчёт всех активностей
        const trainTotal = tdeePopupMeta.trainTotal || 0;
        const actTotal = tdeePopupMeta.actTotal || 0;

        // Проценты для визуализации
        const bmrPct = tdeePopupMeta.bmrPct || 0;
        const actPct = tdeePopupMeta.actPct || 0;
        const trainMinutesMeta = tdeePopupMeta.trainMinutes || [0, 0, 0];
        const tdeeStyles = tdeePopupMeta.styles;

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setTdeePopup(null));

        return PopupWithBackdrop({
          onClose: () => setTdeePopup(null),
          children: React.createElement('div', {
            className: 'tdee-popup',
            role: 'dialog',
            'aria-label': 'Расшифровка затрат: ' + d.tdee + ' ккал',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(tdeeStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Header
            React.createElement('div', {
              style: tdeeStyles.header
            },
              React.createElement('span', { style: tdeeStyles.headerTitle }, '⚡ Затраты энергии'),
              React.createElement('span', { style: tdeeStyles.headerValue }, d.tdee + ' ккал')
            ),
            // Визуальная полоса BMR + Activity
            React.createElement('div', { className: 'tdee-bar-container' },
              React.createElement('div', { className: 'tdee-bar' },
                React.createElement('div', {
                  className: 'tdee-bar-bmr',
                  style: tdeePopupMeta.bmrBarStyle
                }),
                React.createElement('div', {
                  className: 'tdee-bar-activity',
                  style: tdeePopupMeta.actBarStyle
                })
              ),
              React.createElement('div', { className: 'tdee-bar-labels' },
                React.createElement('span', null, '🧬Базовый: ' + bmrPct + '%'),
                React.createElement('span', null, '🏃 Активность: ' + actPct + '%')
              )
            ),
            // Детали — строки
            React.createElement('div', { className: 'tdee-details' },
              // BMR
              React.createElement('div', { className: 'tdee-row tdee-row-main' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🧬'),
                React.createElement('span', { className: 'tdee-row-label' }, 'Базовый метаболизм (BMR)'),
                React.createElement('span', { className: 'tdee-row-value' }, d.bmr + ' ккал')
              ),
              React.createElement('div', { className: 'tdee-row-hint' },
                'Формула Миффлина-Сан Жеора, вес ' + d.weight + ' кг'
              ),
              // Разделитель
              React.createElement('div', { className: 'tdee-divider' }),
              // Шаги
              d.stepsK > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '👟'),
                React.createElement('span', { className: 'tdee-row-label' },
                  'Шаги (' + (d.steps || 0).toLocaleString() + ')'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.stepsK + ' ккал')
              ),
              // Бытовая активность
              d.householdK > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🏠'),
                React.createElement('span', { className: 'tdee-row-label' },
                  'Быт. активность (' + (d.householdMin || 0) + ' мин)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.householdK + ' ккал')
              ),
              // Тренировка 1
              d.train1k > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🏋️'),
                React.createElement('span', { className: 'tdee-row-label' },
                  'Тренировка 1 (' + (trainMinutesMeta[0] || 0) + ' мин)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.train1k + ' ккал')
              ),
              // Тренировка 2
              d.train2k > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🏋️'),
                React.createElement('span', { className: 'tdee-row-label' },
                  'Тренировка 2 (' + (trainMinutesMeta[1] || 0) + ' мин)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.train2k + ' ккал')
              ),
              // Тренировка 3
              d.train3k > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🏋️'),
                React.createElement('span', { className: 'tdee-row-label' },
                  'Тренировка 3 (' + (trainMinutesMeta[2] || 0) + ' мин)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.train3k + ' ккал')
              ),
              // TEF (Thermic Effect of Food) — затраты на переваривание
              d.tefKcal > 0 && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🔥'),
                React.createElement('span', { className: 'tdee-row-label' },
                  'Переваривание пищи (TEF)'
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' }, '+' + d.tefKcal + ' ккал')
              ),
              // 🆕 v3.20.0: NDTE (Next-Day Training Effect)
              // PMID: 18583478 (Magkos 2008) — тренировка вчера → повышенный расход сегодня
              d.ndteData?.active && React.createElement('div', { className: 'tdee-row' },
                React.createElement('span', { className: 'tdee-row-icon' }, '🔥'),
                React.createElement('span', {
                  className: 'tdee-row-label',
                  style: tdeeStyles.ndteLabel
                },
                  'Эффект вчера трени',
                  React.createElement('a', {
                    href: 'https://pubmed.ncbi.nlm.nih.gov/18583478/',
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    title: 'PMID: 18583478 — Magkos 2008',
                    style: tdeeStyles.ndteLink,
                    onClick: (e) => e.stopPropagation()
                  }, '📚')
                ),
                React.createElement('span', { className: 'tdee-row-value tdee-positive' },
                  '+' + Math.round(d.bmr * d.ndteData.tdeeBoost) + ' ккал'
                )
              ),
              // 🆕 v3.20.0: BMI Context — персонализация по BMI
              // PMID: 10953022 (Kahn & Flier 2000) — BMI влияет на метаболизм
              d.bmiContext && React.createElement('div', {
                className: 'tdee-row tdee-row-hint',
                style: tdeeStyles.bmiRow
              },
                React.createElement('span', {
                  style: tdeeStyles.bmiRowText
                },
                  d.bmiContext.category === 'underweight' ? '⚠️' :
                    d.bmiContext.category === 'obese' ? '📊' : '✅',
                  // Поле называется value, а не bmi (heys_day_caloric_balance_v1.js
                  // строит bmiContext = { value, category, ... }) — при чтении
                  // несуществующего d.bmiContext.bmi `.toFixed?.()` на '—' тихо
                  // возвращал undefined, и попап печатал буквально «BMI undefined»
                  // (2026-08-08).
                  ' BMI ' + (typeof d.bmiContext.value === 'number' ? d.bmiContext.value.toFixed(1) : '—') + ' (' +
                  (d.bmiContext.category === 'normal' ? 'норма' :
                    d.bmiContext.category === 'underweight' ? 'недовес' :
                      d.bmiContext.category === 'overweight' ? 'избыток' : 'ожирение') + ')',
                  React.createElement('a', {
                    href: 'https://pubmed.ncbi.nlm.nih.gov/10953022/',
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    title: 'PMID: 10953022 — Kahn & Flier 2000',
                    style: tdeeStyles.bmiRowLink,
                    onClick: (e) => e.stopPropagation()
                  }, '📚')
                )
              ),
              // Если нет активности
              actTotal === 0 && !d.tefKcal && React.createElement('div', { className: 'tdee-row tdee-row-empty' },
                React.createElement('span', { className: 'tdee-row-icon' }, '💤'),
                React.createElement('span', { className: 'tdee-row-label' }, 'Нет активности за сегодня'),
                React.createElement('span', { className: 'tdee-row-value' }, '+0 ккал')
              ),
              // Итого
              React.createElement('div', { className: 'tdee-divider' }),
              React.createElement('div', { className: 'tdee-row tdee-row-total' },
                React.createElement('span', { className: 'tdee-row-icon' }, '⚡'),
                React.createElement('span', { className: 'tdee-row-label' }, 'ИТОГО затраты'),
                React.createElement('span', { className: 'tdee-row-value' }, d.tdee + ' ккал')
              )
            ),
            // Close button
            React.createElement('button', {
              style: tdeeStyles.closeBtn,
              'aria-label': 'Закрыть',
              onClick: (e) => {
                e.stopPropagation();
                setTdeePopup(null);
              }
            }, '✕')
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // === WEEK NORM POPUP (детали недели X/Y в норме) ===
      weekNormPopup && (() => {
        const popupW = 260;
        const popupH = 280;
        const pos = getSmartPopupPosition(
          weekNormPopup.x,
          weekNormPopup.y,
          popupW,
          popupH,
          { preferAbove: true, offset: 8 }
        );
        const { left, top } = pos;
        const rz = ratioZones;
        const weekNormDays = weekNormPopupMeta.days || [];
        const weekNormInNorm = weekNormPopupMeta.inNorm ?? weekNormPopup.inNorm;
        const weekNormWithData = weekNormPopupMeta.withData ?? weekNormPopup.withData;
        const weekNormStyles = weekNormPopupMeta.styles;

        return PopupWithBackdrop({
          onClose: () => setWeekNormPopup(null),
          children: React.createElement('div', {
            className: 'week-norm-popup sparkline-popup sparkline-popup-v2',
            role: 'dialog',
            style: popupPositionStyle ? popupPositionStyle(weekNormStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation()
          },
            React.createElement('div', {
              className: 'sparkline-popup-stripe',
              style: weekNormStyles.stripe || undefined
            }),
            React.createElement('div', { className: 'sparkline-popup-content' },
              React.createElement('div', { className: 'sparkline-popup-swipe' }),
              React.createElement('div', { className: 'sparkline-popup-header-v2' },
                React.createElement('span', { className: 'sparkline-popup-date' }, '📊 Неделя'),
                React.createElement('span', {
                  className: 'sparkline-popup-pct',
                  style: weekNormStyles.headerValue || undefined
                }, weekNormInNorm + '/' + weekNormWithData + ' в норме')
              ),
              React.createElement('div', { style: weekNormStyles.list },
                weekNormDays.map((d, i) =>
                  React.createElement('div', {
                    key: i,
                    style: d.rowStyle
                  },
                    React.createElement('span', {
                      style: d.nameStyle
                    }, d.name + (d.isToday ? ' (сегодня)' : '')),
                    d.statusText
                      ? React.createElement('span', { style: d.statusTextStyle }, d.statusText)
                      : React.createElement('span', {
                        style: d.badgeStyle
                      }, d.ratioPct + '%')
                  )
                )
              ),
              React.createElement('button', {
                className: 'sparkline-popup-close',
                onClick: () => setWeekNormPopup(null)
              }, '✕')
            )
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // === WEEK DEFICIT POPUP (научный расчёт сожжённого жира) ===
      weekDeficitPopup && (() => {
        const { totalEaten, totalBurned, deficitKcal, deficitPct, fatBurnedGrams,
          avgTargetDeficit, daysWithData, isDeficit } = weekDeficitPopup.data;

        const popupW = 320;
        const popupH = 420;
        const pos = getSmartPopupPosition(
          weekDeficitPopup.x,
          weekDeficitPopup.y,
          popupW,
          popupH,
          { preferAbove: true, offset: 8 }
        );
        const { left, top } = pos;

        const stripeColor = weekDeficitPopupMeta.stripeColor || 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)';
        const fatText = weekDeficitPopupMeta.fatText || '';
        const glycogenWaterText = weekDeficitPopupMeta.glycogenWaterText || '';
        const muscleText = weekDeficitPopupMeta.muscleText || '';
        const surplusWeightText = weekDeficitPopupMeta.surplusWeightText || '';
        const deficitStyles = weekDeficitPopupMeta.styles;

        return PopupWithBackdrop({
          onClose: () => setWeekDeficitPopup(null),
          children: React.createElement('div', {
            className: 'week-deficit-popup sparkline-popup sparkline-popup-v2',
            role: 'dialog',
            style: popupPositionStyle ? popupPositionStyle(deficitStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation()
          },
            // Цветная полоса сверху
            React.createElement('div', {
              className: 'sparkline-popup-stripe',
              style: deficitStyles.stripe || undefined
            }),
            React.createElement('div', { className: 'sparkline-popup-content' },
              // Swipe indicator
              React.createElement('div', { className: 'sparkline-popup-swipe' }),
              // Заголовок
              React.createElement('div', {
                className: 'sparkline-popup-header-v2',
                style: deficitStyles.header
              },
                React.createElement('span', {
                  className: 'sparkline-popup-date',
                  style: deficitStyles.headerDate
                }, '🔬 Научный расчёт за ' + daysWithData + ' дней'),
                React.createElement('span', {
                  style: deficitStyles.headerValue
                }, (isDeficit ? '−' : '+') + Math.abs(deficitKcal).toLocaleString('ru') + ' ккал')
              ),

              // Основные числа
              React.createElement('div', {
                style: deficitStyles.grid
              },
                // Потрачено
                React.createElement('div', { style: deficitStyles.gridCell },
                  React.createElement('div', { style: deficitStyles.gridLabel }, 'Потрачено'),
                  React.createElement('div', { style: deficitStyles.gridValueBurned }, totalBurned.toLocaleString('ru')),
                  React.createElement('div', { style: deficitStyles.gridSubLabel }, 'ккал (TDEE)')
                ),
                // Съедено
                React.createElement('div', { style: deficitStyles.gridCell },
                  React.createElement('div', { style: deficitStyles.gridLabel }, 'Съедено'),
                  React.createElement('div', { style: deficitStyles.gridValueEaten }, totalEaten.toLocaleString('ru')),
                  React.createElement('div', { style: deficitStyles.gridSubLabel }, 'ккал')
                )
              ),

              // Разделитель
              React.createElement('div', {
                style: deficitStyles.divider
              }),

              // Научная формула
              isDeficit && React.createElement('div', { style: deficitStyles.formulaBlock },
                React.createElement('div', {
                  style: deficitStyles.formulaHeader
                },
                  React.createElement('span', null, '📐'),
                  'Состав потери веса (Hall KD, 2008)'
                ),
                // Компоненты потери
                React.createElement('div', {
                  style: deficitStyles.formulaList
                },
                  // Жир
                  React.createElement('div', {
                    style: deficitStyles.rowFat
                  },
                    React.createElement('div', { style: deficitStyles.inlineRow },
                      React.createElement('span', null, '🔥'),
                      React.createElement('span', { style: deficitStyles.rowLabel }, 'Жир (77%)')
                    ),
                    React.createElement('span', { style: deficitStyles.valueFat },
                      '−' + fatText)
                  ),
                  // Гликоген + вода
                  React.createElement('div', {
                    style: deficitStyles.rowGlycogen
                  },
                    React.createElement('div', { style: deficitStyles.inlineRow },
                      React.createElement('span', null, '💧'),
                      React.createElement('span', { style: deficitStyles.rowLabel }, 'Гликоген + вода (18%)')
                    ),
                    React.createElement('span', { style: deficitStyles.valueGlycogen },
                      '−' + glycogenWaterText)
                  ),
                  // Мышцы (если тренировки, меньше)
                  React.createElement('div', {
                    style: deficitStyles.rowMuscle
                  },
                    React.createElement('div', { style: deficitStyles.inlineRow },
                      React.createElement('span', null, '💪'),
                      React.createElement('span', { style: deficitStyles.rowLabel }, 'Мышцы (5%)*')
                    ),
                    React.createElement('span', { style: deficitStyles.valueMuscle },
                      '−' + muscleText)
                  )
                )
              ),

              // Итого
              isDeficit && React.createElement('div', {
                style: deficitStyles.totalBox
              },
                React.createElement('div', {
                  style: deficitStyles.totalRow
                },
                  React.createElement('span', { style: deficitStyles.totalLabel }, '🎯 Чистый жир:'),
                  React.createElement('span', { style: deficitStyles.totalValue },
                    '−' + fatText)
                )
              ),

              // Профицит (набор)
              !isDeficit && React.createElement('div', {
                style: deficitStyles.surplusBox
              },
                React.createElement('div', { style: deficitStyles.surplusText },
                  '⚠️ Профицит ' + Math.abs(deficitKcal).toLocaleString('ru') + ' ккал может привести к набору ~' +
                  surplusWeightText + ' жира'
                )
              ),

              // Сноска
              React.createElement('div', {
                style: deficitStyles.footnote
              },
                '* При адекватном белке (1.6-2.2 г/кг) и силовых тренировках потеря мышц минимальна. ',
                React.createElement('span', { style: deficitStyles.footnoteItalic },
                  'Hall KD. Computational model of in vivo human energy metabolism. Am J Physiol 2008.'
                )
              ),

              // Кнопка закрытия
              React.createElement('button', {
                className: 'sparkline-popup-close',
                onClick: () => setWeekDeficitPopup(null)
              }, '✕')
            )
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),

      // === BALANCE DAY POPUP — детали дня при клике на столбик баланса ===
      balanceDayPopup && (() => {
        const { day: v, x, y } = balanceDayPopup;

        // Позиционирование
        const popupW = 240;
        const popupH = 200;
        const pos = getSmartPopupPosition(x, y, popupW, popupH, { preferAbove: true, offset: 8 });
        const { left, top } = pos;

        const stripeColor = balanceDayPopupMeta.stripeColor || '#22c55e';
        const dateLabel = balanceDayPopupMeta.dateLabel || '';
        const ratioPct = balanceDayPopupMeta.ratioPct || Math.round((v.ratio || 0) * 100);
        const balanceDayStyles = balanceDayPopupMeta.styles;

        return ReactDOM.createPortal(
          PopupWithBackdrop({
            onClose: () => setBalanceDayPopup(null),
            children: React.createElement('div', {
              className: 'balance-day-popup sparkline-popup-v2',
              style: popupPositionStyle ? popupPositionStyle(balanceDayStyles.popup, left, top, popupW) : undefined,
              onClick: (e) => e.stopPropagation()
            },
              // Цветная полоса сверху
              React.createElement('div', {
                style: balanceDayStyles.stripe
              }),
              // Контент
              React.createElement('div', { style: balanceDayStyles.content },
                // Заголовок
                React.createElement('div', {
                  style: balanceDayStyles.header
                },
                  React.createElement('span', {
                    style: balanceDayStyles.headerTitle
                  }, v.day + ', ' + dateLabel),
                  v.hasTraining && React.createElement('span', {
                    style: balanceDayStyles.trainingIcon,
                    title: 'Была тренировка'
                  }, '🏋️')
                ),
                // Съедено / Норма
                React.createElement('div', {
                  style: balanceDayStyles.grid
                },
                  React.createElement('div', {
                    style: balanceDayStyles.eatenBox
                  },
                    React.createElement('div', { style: balanceDayStyles.boxLabel }, 'Съедено'),
                    React.createElement('div', { style: balanceDayStyles.eatenValue }, v.eaten)
                  ),
                  React.createElement('div', {
                    style: balanceDayStyles.targetBox
                  },
                    React.createElement('div', {
                      style: balanceDayStyles.boxLabel,
                      title: 'Цель дня с учётом долга/рефида'
                    }, 'Норма'),
                    React.createElement('div', { style: balanceDayStyles.targetValue }, v.target)
                  )
                ),
                // Базовая норма (до refeed/долга)
                v.baseTarget && v.baseTarget !== v.target && React.createElement('div', {
                  style: balanceDayStyles.baseRow
                },
                  React.createElement('span', {
                    style: balanceDayStyles.baseLabel,
                    title: 'Базовая цель без долга/рефида'
                  }, 'База'),
                  React.createElement('div', null,
                    React.createElement('span', { style: balanceDayStyles.baseValue }, v.baseTarget + ' ккал'),
                    v.isRefeedDay && React.createElement('span', { style: balanceDayStyles.refeedBadge }, '🍕 +35%')
                  )
                ),
                // Баланс
                React.createElement('div', {
                  style: balanceDayStyles.balanceRow
                },
                  React.createElement('span', { style: balanceDayStyles.balanceLabel }, 'Баланс'),
                  React.createElement('span', {
                    style: balanceDayStyles.balanceValue
                  }, (v.delta > 0 ? '+' : '') + v.delta + ' ккал')
                ),
                // Выполнение %
                React.createElement('div', {
                  style: balanceDayStyles.ratioText
                }, 'Выполнение: ' + ratioPct + '%')
              ), // Закрываем "Контент" div
              // Кнопка закрытия
              React.createElement('button', {
                style: balanceDayStyles.closeBtn,
                onClick: (e) => {
                  e.stopPropagation();
                  setBalanceDayPopup(null);
                }
              }, '✕')
            ) // Закрываем popup div
          }), // Закрываем PopupWithBackdrop
          document.body
        ); // Закрываем createPortal
      })(),

      // === TEF INFO POPUP — научная информация о TEF ===
      tefInfoPopup && (() => {
        const popupW = 320;
        const popupH = 420;
        const pos = getSmartPopupPosition(
          tefInfoPopup.x,
          tefInfoPopup.y,
          popupW,
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top } = pos;

        const tefInfo = tefInfoPopupMeta;
        const tefStyles = tefInfoPopupMeta.styles;

        return PopupWithBackdrop({
          onClose: () => setTefInfoPopup(null),
          children: React.createElement('div', {
            className: 'tef-info-popup sparkline-popup-v2',
            role: 'dialog',
            'aria-label': 'Информация о TEF',
            style: popupPositionStyle ? popupPositionStyle(tefStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation()
          },
            // Цветная полоса сверху (оранжевая для TEF)
            React.createElement('div', {
              style: tefStyles.stripe
            }),
            // Контент
            React.createElement('div', { style: tefStyles.content },
              // Заголовок
              React.createElement('div', {
                style: tefStyles.header
              },
                React.createElement('span', { style: tefStyles.headerIcon }, '🔥'),
                React.createElement('div', null,
                  React.createElement('div', {
                    style: tefStyles.title
                  }, 'TEF'),
                  React.createElement('div', {
                    style: tefStyles.subtitle
                  }, tefInfo.nameRu)
                )
              ),
              // Описание
              React.createElement('div', {
                style: tefStyles.description
              }, tefInfo.description),
              // Формула
              React.createElement('div', {
                style: tefStyles.formulaBox
              },
                React.createElement('div', {
                  style: tefStyles.formulaLabel
                }, '📐 Формула'),
                React.createElement('div', {
                  style: tefStyles.formulaCode
                },
                  React.createElement('div', null, 'TEF = Белок×4×', React.createElement('b', null, '25%')),
                  React.createElement('div', { style: tefStyles.formulaIndent }, '+ Углеводы×4×', React.createElement('b', null, '7.5%')),
                  React.createElement('div', { style: tefStyles.formulaIndent }, '+ Жиры×9×', React.createElement('b', null, '1.5%'))
                )
              ),
              // Диапазоны TEF по макросам
              React.createElement('div', {
                style: tefStyles.rangeGrid
              },
                // Белок
                React.createElement('div', {
                  style: tefStyles.rangeBoxProtein
                },
                  React.createElement('div', { style: tefStyles.rangeLabel }, 'Белок'),
                  React.createElement('div', { style: tefStyles.rangeValueProtein }, tefInfo.ranges.protein.label),
                  React.createElement('div', { style: tefStyles.rangeHint }, 'используем 25%')
                ),
                // Углеводы
                React.createElement('div', {
                  style: tefStyles.rangeBoxCarbs
                },
                  React.createElement('div', { style: tefStyles.rangeLabel }, 'Углеводы'),
                  React.createElement('div', { style: tefStyles.rangeValueCarbs }, tefInfo.ranges.carbs.label),
                  React.createElement('div', { style: tefStyles.rangeHint }, 'используем 7.5%')
                ),
                // Жиры
                React.createElement('div', {
                  style: tefStyles.rangeBoxFat
                },
                  React.createElement('div', { style: tefStyles.rangeLabel }, 'Жиры'),
                  React.createElement('div', { style: tefStyles.rangeValueFat }, tefInfo.ranges.fat.label),
                  React.createElement('div', { style: tefStyles.rangeHint }, 'используем 1.5%')
                )
              ),
              // Научные источники
              React.createElement('div', {
                style: tefStyles.sourcesBlock
              },
                React.createElement('div', {
                  style: tefStyles.sourcesLabel
                }, '📚 Научные источники'),
                tefInfo.sources.map((src, i) =>
                  React.createElement('div', {
                    key: i,
                    style: tefStyles.sourceRow
                  },
                    React.createElement('span', null, src.author + ' et al., ' + src.year),
                    React.createElement('a', {
                      href: 'https://pubmed.ncbi.nlm.nih.gov/' + src.pmid,
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      style: tefStyles.sourceLink,
                      onClick: (e) => e.stopPropagation()
                    }, 'PMID: ' + src.pmid)
                  )
                )
              ),
              // Кнопка закрытия
              React.createElement('button', {
                style: tefStyles.closeBtn,
                onClick: (e) => {
                  e.stopPropagation();
                  setTefInfoPopup(null);
                }
              }, '✕')
            ) // Закрываем "Контент" div
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),

      // === GOAL POPUP (объяснение формулы цели) ===
      goalPopup && (() => {
        const popupW = 280;
        const popupH = 240;
        const pos = getSmartPopupPosition(
          goalPopup.x,
          goalPopup.y,
          popupW,
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;
        const d = goalPopup.data;
        const goalPopupMeta = vmComputed.goalPopupMeta;
        const goalStyles = goalPopupMeta.styles;

        // Формула: baseExpenditure × (1 + deficitPct/100) + dailyBoost = displayOptimum
        const baseOptimumCalc = goalPopupMeta.baseOptimumCalc ?? Math.round(d.baseExpenditure * (1 + d.deficitPct / 100));

        return PopupWithBackdrop({
          onClose: () => setGoalPopup(null),
          children: React.createElement('div', {
            className: 'goal-popup',
            style: popupPositionStyle ? popupPositionStyle(goalStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation()
          },
            // Заголовок
            React.createElement('div', {
              style: goalStyles.title
            }, '🎯 Как считается цель'),

            // Строки формулы
            React.createElement('div', { style: goalStyles.rows },
              // 1. База
              React.createElement('div', { style: goalStyles.row },
                React.createElement('span', { style: goalStyles.rowLabel }, 'База (без TEF)'),
                React.createElement('span', { style: goalStyles.rowValue }, d.baseExpenditure + ' ккал')
              ),
              d.ndteBoost > 0 && React.createElement('div', { style: goalStyles.row },
                React.createElement('span', { style: goalStyles.rowLabel }, 'из них вчерашняя тренировка'),
                React.createElement('span', { style: goalStyles.rowValue }, Math.round(d.ndteBoost) + ' ккал')
              ),
              // Из чего взялась поправка: путь от съеденного к факту. Стоит
              // перед самой поправкой — она из него и получается. Числа те же,
              // что видит куратор: одна модель, одно окно, одно округление.
              d.correctionPath && Number.isFinite(d.correctionPath.deltaKg)
                ? React.createElement(React.Fragment, null,
                  React.createElement('div', { style: goalStyles.row },
                    React.createElement('span', { style: goalStyles.rowLabel }, 'Съедено в среднем'),
                    React.createElement('span', { style: goalStyles.rowValue },
                      Math.round(d.correctionPath.eatenPerDay) + ' ккал')
                  ),
                  React.createElement('div', { style: goalStyles.row },
                    React.createElement('span', { style: goalStyles.rowLabel }, 'Вес за три недели'),
                    React.createElement('span', { style: goalStyles.rowValue },
                      (d.correctionPath.deltaKg > 0 ? '+' : '−')
                      + Math.abs(d.correctionPath.deltaKg).toFixed(1).replace('.', ',') + ' кг')
                  ),
                  d.correctionPath.storedPerDay
                    ? React.createElement('div', { style: goalStyles.row },
                      React.createElement('span', { style: goalStyles.rowLabel },
                        d.correctionPath.storedPerDay < 0 ? 'Запас отдал' : 'Запас принял'),
                      React.createElement('span', { style: goalStyles.rowValue },
                        Math.abs(d.correctionPath.storedPerDay) + ' ккал в день')
                    )
                    : null,
                  React.createElement('div', { style: goalStyles.row },
                    React.createElement('span', { style: goalStyles.rowLabel }, 'Расход по факту'),
                    React.createElement('span', { style: goalStyles.rowValue },
                      Math.round(d.correctionPath.factPerDay) + ' ккал')
                  )
                )
                : null,
              // Поправка на факт: расход после неё и есть база дефицита.
              (() => {
                const nc = d.normCorrection;
                const coldDays = HEYS.NormCorrection?.COLD_START_DAYS || 14;
                // Типографика строки — по контракту «вид · строка поправки»:
                // имя 12,5 px/600 тоном --tx, пилюля даты 9 px моношириной на
                // --c2 тоном --ac, значение 12,5 px/700 тоном --ac.
                const ncName = { fontSize: 12.5, fontWeight: 600, color: 'var(--v4-ink, #201e1d)' };
                const ncPill = {
                  marginLeft: 6, fontSize: 9, fontFamily: 'ui-monospace, monospace',
                  background: 'var(--v4-hero, #efe3cf)', color: 'var(--v4-act-text, #8a4a20)',
                  padding: '1px 5px', borderRadius: 4
                };
                const ncValue = { fontSize: 12.5, fontWeight: 700, color: 'var(--v4-act-text, #8a4a20)' };

                if (nc && Number.isFinite(nc.factor) && nc.factor !== 1) {
                  const corrected = Math.round(d.baseExpenditure * nc.factor);
                  return React.createElement(React.Fragment, null,
                    React.createElement('div', { style: goalStyles.row },
                      React.createElement('span', { style: ncName },
                        'Поправка на факт',
                        nc.appliedAt && React.createElement('span', { style: ncPill }, 'с ' + nc.appliedAt)
                      ),
                      React.createElement('span', { style: ncValue },
                        '×' + nc.factor.toFixed(2).replace('.', ','))
                    ),
                    React.createElement('div', { style: goalStyles.row },
                      React.createElement('span', { style: goalStyles.rowLabel }, 'Расход после поправки'),
                      React.createElement('span', { style: goalStyles.rowValue }, corrected + ' ккал')
                    )
                  );
                }

                // Холодный старт — видимое состояние со счётом и полосой, а не
                // пустая строка: «пока нет» 11 px тоном чернил 38 %, пилюля
                // «копим данные» 50 %, полоса 6 px радиусом 999 на --acs.
                const done = Math.min(coldDays, d.correctionHistoryDays || 0);
                const pct = coldDays > 0 ? Math.round((done / coldDays) * 100) : 0;
                return React.createElement('div', null,
                  React.createElement('div', { style: goalStyles.row },
                    React.createElement('span', { style: ncName },
                      'Поправка на факт',
                      React.createElement('span', {
                        style: Object.assign({}, ncPill, { background: 'transparent', color: 'color-mix(in srgb, var(--v4-ink, #201e1d) 50%, transparent)' })
                      }, 'копим данные')
                    ),
                    React.createElement('span', {
                      style: { fontSize: 11, color: 'color-mix(in srgb, var(--v4-ink, #201e1d) 38%, transparent)' }
                    }, 'пока нет')
                  ),
                  React.createElement('div', {
                    style: {
                      height: 6, borderRadius: 999, marginTop: 4,
                      background: 'color-mix(in srgb, var(--v4-ink, #201e1d) 10%, transparent)',
                      overflow: 'hidden'
                    }
                  },
                    React.createElement('div', {
                      style: { width: pct + '%', height: '100%', borderRadius: 999, background: 'var(--v4-act, #c67139)' }
                    })
                  ),
                  React.createElement('div', {
                    style: { fontSize: 11, fontWeight: 700, color: 'var(--v4-act-text, #8a4a20)', marginTop: 3 }
                  }, done + ' дней из ' + coldDays)
                );
              })(),

              // 2. Дефицит
              React.createElement('div', { style: goalStyles.row },
                React.createElement('span', { style: goalStyles.rowLabel },
                  d.deficitPct >= 0 ? 'Профицит ' + d.deficitPct + '%' : 'Дефицит ' + Math.abs(d.deficitPct) + '%'
                ),
                React.createElement('span', { style: goalStyles.deficitValue },
                  (d.deficitPct >= 0 ? '+' : '') + Math.round(d.baseExpenditure * d.deficitPct / 100) + ' ккал'
                )
              ),
              // Разделитель
              React.createElement('div', { style: goalStyles.separatorDashed }),
              // 3. Базовая цель
              React.createElement('div', { style: goalStyles.row },
                React.createElement('span', { style: goalStyles.rowLabel }, 'Базовая цель'),
                React.createElement('span', { style: goalStyles.rowValue }, baseOptimumCalc + ' ккал')
              ),
              // 4. Долг (если есть)
              d.dailyBoost > 0 && React.createElement('div', { style: goalStyles.row },
                React.createElement('span', { style: goalStyles.boostLabel }, '💰 Компенсация долга'),
                React.createElement('span', { style: goalStyles.boostValue }, '+' + Math.round(d.dailyBoost) + ' ккал')
              ),
              // 5. Refeed (если есть)
              d.isRefeedDay && d.refeedBoost > 0 && React.createElement('div', { style: goalStyles.row },
                React.createElement('span', { style: goalStyles.refeedLabel }, '🍕 Refeed день'),
                React.createElement('span', { style: goalStyles.refeedValue }, '+' + Math.round(d.refeedBoost) + ' ккал')
              ),
              // Итого
              React.createElement('div', { style: goalStyles.totalWrap },
                React.createElement('div', { style: goalStyles.row },
                  React.createElement('span', { style: goalStyles.totalLabel }, 'Итого цель'),
                  React.createElement('span', { style: goalStyles.totalValue }, d.displayOptimum + ' ккал')
                )
              )
            ),

            // Пояснение про TEF
            React.createElement('div', {
              style: goalStyles.tefNote
            }, '💡 Цель считается без TEF (термического эффекта пищи), чтобы норма не росла от съеденного.'),

            // Кнопка закрытия
            React.createElement('button', {
              style: goalStyles.closeBtn,
              onClick: (e) => {
                e.stopPropagation();
                setGoalPopup(null);
              }
            }, '✕')
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),

      // === DEBT SCIENCE POPUP (научное объяснение калорийного долга) ===
      debtSciencePopup && (() => {
        const popupW = 320;
        const popupH = 340;
        const { title, content, links } = debtSciencePopup;
        const debtScienceStyles = debtSciencePopupMeta.styles;

        return PopupWithBackdrop({
          onClose: () => setDebtSciencePopup(null),
          children: React.createElement('div', {
            className: 'debt-science-popup',
            style: popupPositionStyle ? popupPositionStyle(debtScienceStyles.popup, null, null, popupW) : undefined,
            onClick: (e) => e.stopPropagation()
          },
            // Заголовок
            React.createElement('div', {
              style: debtScienceStyles.title
            }, title),

            // Контент — вопросы и ответы
            React.createElement('div', { style: debtScienceStyles.content },
              content.map((item, idx) =>
                React.createElement('div', { key: idx, style: debtScienceStyles.item },
                  React.createElement('div', {
                    style: debtScienceStyles.itemLabel
                  }, item.label),
                  React.createElement('div', {
                    style: debtScienceStyles.itemValue
                  }, item.value)
                )
              )
            ),

            // Научные ссылки
            links && links.length > 0 && React.createElement('div', {
              style: debtScienceStyles.links
            },
              React.createElement('span', {
                style: debtScienceStyles.linksLabel
              }, '📚 Источники:'),
              links.map((link, idx) =>
                React.createElement('a', {
                  key: idx,
                  href: link.url,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  style: debtScienceStyles.link
                }, link.text)
              )
            ),

            // Кнопка закрытия
            React.createElement('button', {
              style: debtScienceStyles.closeBtn,
              onClick: (e) => {
                e.stopPropagation();
                setDebtSciencePopup(null);
              }
            }, '✕')
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),

      // === METRIC POPUP (вода, шаги, калории) ===
      metricPopup && (() => {
        // Позиционирование с защитой от выхода за экран
        const popupW = 280;
        const popupH = 320; // Примерная высота
        const pos = getSmartPopupPosition(
          metricPopup.x,
          metricPopup.y,
          popupW,
          popupH,
          { preferAbove: false, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;

        const history = metricPopupMeta.history || [];
        const sparkMax = metricPopupMeta.sparkMax || 1;
        const streak = metricPopupMeta.streak || 0;
        const diff = metricPopupMeta.diff;
        const config = metricPopupMeta.config || { icon: '•', name: 'Метрика', unit: '', color: '#64748b', goal: 0 };
        const ratio = metricPopupMeta.ratio ?? (metricPopup.data.ratio || 0);
        const pct = metricPopupMeta.pct ?? Math.round(ratio * 100);
        const gradient = metricPopupMeta.gradient || 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
        const metricPopupStyles = metricPopupMeta.styles;
        const metricSparkStyles = metricPopupMeta.sparkStyles;

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setMetricPopup(null));

        return PopupWithBackdrop({
          onClose: () => setMetricPopup(null),
          children: React.createElement('div', {
            className: 'metric-popup' + (showAbove ? ' show-above' : ''),
            role: 'dialog',
            'aria-label': config.name + ' — ' + pct + '% от нормы',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(metricPopupStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Цветная полоса
            React.createElement('div', {
              className: 'metric-popup-stripe',
              style: metricPopupStyles.stripe || undefined
            }),
            // Контент
            React.createElement('div', { className: 'metric-popup-content' },
              // Swipe indicator
              React.createElement('div', { className: 'metric-popup-swipe' }),
              // Header
              React.createElement('div', { className: 'metric-popup-header' },
                React.createElement('span', { className: 'metric-popup-title' }, config.icon + ' ' + config.name),
                React.createElement('span', {
                  className: 'metric-popup-pct',
                  style: metricPopupStyles.pct || undefined
                }, pct + '%')
              ),
              // Sparkline
              React.createElement('div', { className: 'metric-popup-sparkline' },
                React.createElement('svg', { viewBox: '0 0 70 20', className: 'metric-popup-spark-svg' },
                  // Goal line
                  React.createElement('line', {
                    x1: 0, y1: 20 - (config.goal / sparkMax * 18),
                    x2: 70, y2: 20 - (config.goal / sparkMax * 18),
                    stroke: metricSparkStyles?.goalLine?.stroke,
                    strokeWidth: metricSparkStyles?.goalLine?.strokeWidth,
                    strokeDasharray: metricSparkStyles?.goalLine?.strokeDasharray
                  }),
                  // Points and lines
                  history.map((val, i) => {
                    const x = i * 10 + 5;
                    const y = 20 - (val / sparkMax * 18);
                    const nextVal = history[i + 1];
                    const isToday = i === 6;
                    const pointStyle = isToday ? metricSparkStyles?.pointToday : metricSparkStyles?.point;
                    return React.createElement('g', { key: i },
                      nextVal !== undefined && React.createElement('line', {
                        x1: x, y1: y,
                        x2: (i + 1) * 10 + 5, y2: 20 - (nextVal / sparkMax * 18),
                        stroke: metricSparkStyles?.connector?.stroke,
                        strokeWidth: metricSparkStyles?.connector?.strokeWidth,
                        strokeOpacity: metricSparkStyles?.connector?.strokeOpacity
                      }),
                      React.createElement('circle', {
                        cx: x, cy: y,
                        r: pointStyle?.r != null ? pointStyle.r : (isToday ? 3 : 2),
                        fill: pointStyle?.fill || (isToday ? config.color : '#94a3b8')
                      })
                    );
                  })
                ),
                React.createElement('span', { className: 'metric-popup-spark-label' }, '7 дней')
              ),
              // Progress bar
              React.createElement('div', { className: 'metric-popup-progress' },
                React.createElement('div', {
                  className: 'metric-popup-progress-fill',
                  style: metricPopupStyles.progressFill || undefined
                })
              ),
              // Value
              React.createElement('div', { className: 'metric-popup-value' },
                React.createElement('span', { style: metricPopupStyles.value || undefined },
                  metricPopupMeta.valueText || ''
                ),
                React.createElement('span', { className: 'metric-popup-goal' },
                  ' / ' + (metricPopupMeta.goalText || '')
                ),
                // Yesterday compare
                metricPopupMeta.compareText && React.createElement('span', {
                  className: 'metric-popup-compare' + (metricPopupMeta.compareClass || ''),
                }, metricPopupMeta.compareText)
              ),
              // Extra info per type
              metricPopup.type === 'water' && metricPopup.data.breakdown && React.createElement('div', { className: 'metric-popup-extra' },
                React.createElement('span', null, '⚖️ База: ' + metricPopup.data.breakdown.base + 'мл'),
                metricPopup.data.breakdown.stepsBonus > 0 && React.createElement('span', null, ' 👟+' + metricPopup.data.breakdown.stepsBonus),
                metricPopup.data.breakdown.trainBonus > 0 && React.createElement('span', null, ' 🏃+' + metricPopup.data.breakdown.trainBonus)
              ),
              metricPopup.type === 'steps' && React.createElement('div', { className: 'metric-popup-extra' },
                React.createElement('span', null, '🔥 Сожжено: '),
                React.createElement('b', null, metricPopup.data.kcal + ' ккал')
              ),
              metricPopup.type === 'kcal' && React.createElement('div', { className: 'metric-popup-extra' },
                React.createElement('span', null, metricPopup.data.remaining >= 0 ? '✅ Осталось: ' : '⚠️ Перебор: '),
                React.createElement('b', null, Math.abs(metricPopup.data.remaining) + ' ккал')
              ),
              // Streak
              streak > 0 && React.createElement('div', { className: 'metric-popup-streak' },
                React.createElement('span', null, '🏆'),
                React.createElement('span', null, streak + ' ' + (streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней') + ' подряд!')
              ),
              // Water reminder
              metricPopup.type === 'water' && metricPopup.data.lastDrink && metricPopup.data.lastDrink.isLong && React.createElement('div', { className: 'metric-popup-reminder' },
                React.createElement('span', null, '⏰ ' + metricPopup.data.lastDrink.text)
              ),
              // Close button
              React.createElement('button', {
                className: 'metric-popup-close',
                'aria-label': 'Закрыть',
                onClick: () => setMetricPopup(null)
              }, '✕')
            ),
            // Arrow
            React.createElement('div', {
              className: 'metric-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
            })
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // Fallback: нет данных о весе, но есть калории
      (!weightTrend && kcalTrend) && !useReportsV4 && React.createElement('div', {
        className: 'correlation-block correlation-clickable',
        onClick: () => {
          haptic('light');
          setToastVisible(true);
          setAdviceTrigger('manual');
        }
      },
        React.createElement('span', { className: 'correlation-icon' }, '📉'),
        React.createElement('span', { className: 'correlation-text' },
          'Добавь вес для анализа связи калорий и веса'
        )
      ),
      !useReportsV4 && cascadeSlot,
      // === Mini-heatmap недели (скрываем если нет данных — появится как сюрприз) ===
      !useReportsV4 && weekHeatmapData && weekHeatmapData.withData > 0 && (() => {
        const weekHeatmapMeta = vmComputed.weekHeatmapMeta;
        const colorClass = weekHeatmapMeta.colorClass || 'deficit-warn';
        const deviationText = weekHeatmapMeta.deviationText || '';
        const deficitIcon = weekHeatmapMeta.deficitIcon || '';

        const weekWrapRange = (() => {
          const dates = (weekHeatmapDaysMeta || []).map((d) => d.date).filter(Boolean);
          if (dates.length && HEYS.SparklinesShared?.formatDateRange) {
            return HEYS.SparklinesShared.formatDateRange(dates);
          }
          if (dates.length) {
            return dates[0] + ' — ' + dates[dates.length - 1];
          }
          return 'Итоги недели';
        })();

        const openWeeklyWrapPopup = (e) => {
          e.stopPropagation();
          haptic('light');
          // ⚡ PERF R22: Defer heavy weekly report build (413ms → ~0ms click processing)
          setTimeout(() => {
            if (HEYS.weeklyReports?.openWeeklyWrap) {
              HEYS.weeklyReports.openWeeklyWrap({
                lsGet,
                profile: prof,
                pIndex
              });
            }
          }, 0);
        };

        return React.createElement('div', {
          className: 'week-heatmap'
        },
          React.createElement('div', { className: 'week-heatmap-header' },
            React.createElement('span', { className: 'week-heatmap-title' }, '📅 Неделя'),
            weekHeatmapData.streak >= 2 && React.createElement('span', {
              className: 'week-heatmap-streak'
            }, '🔥 ' + weekHeatmapData.streak),
            React.createElement('div', {
              className: 'week-heatmap-action-wrap',
              role: 'button',
              tabIndex: 0,
              title: 'Итоги недели: ' + weekWrapRange,
              'aria-label': 'Итоги недели: ' + weekWrapRange,
              onClick: openWeeklyWrapPopup,
              onKeyDown: (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openWeeklyWrapPopup(e);
                }
              }
            },
              React.createElement('span', { className: 'week-heatmap-action-label' }, 'Сравнить неделю'),
              React.createElement('button', {
                className: 'week-heatmap-action',
                title: 'Итоги недели: ' + weekWrapRange,
                'aria-label': 'Итоги недели: ' + weekWrapRange,
                onClick: (e) => {
                  e.stopPropagation();
                  openWeeklyWrapPopup(e);
                }
              }, '📊')
            )
          ),
          // Grid с днями недели + статистика X/Y в норме
          React.createElement('div', { className: 'week-heatmap-row' },
            React.createElement('div', { className: 'week-heatmap-grid' },
              (weekHeatmapDaysMeta || []).map((d, i) =>
                React.createElement('div', {
                  key: i,
                  className: d.className,
                  title: d.title,
                  style: d.style,
                  onClick: () => {
                    if (!d.isFuture && d.status !== 'empty') {
                      selectDateWithPrefetch(d.date, {
                        reason: 'week-heatmap',
                        prefetchDates: weekHeatmapDates
                      });
                    }
                  }
                },
                  React.createElement('span', { className: 'week-heatmap-date' }, d.dayNumber),
                  React.createElement('span', { className: 'week-heatmap-name' }, d.name),
                  React.createElement('div', {
                    className: 'week-heatmap-cell',
                    style: d.cellStyle
                  },
                    // Эмодзи пиццы для refeed дней, огонёк для идеальных
                    d.isRefeedDay && React.createElement('span', {
                      className: 'week-heatmap-refeed-emoji',
                      style: d.emojiStyle
                    }, '🍕'),
                    !d.isRefeedDay && d.isStreakDay && React.createElement('span', {
                      className: 'week-heatmap-perfect-emoji',
                      style: d.emojiStyle
                    }, '🔥')
                  )
                )
              )
            ),
            // Статистика X/Y в норме справа от квадратиков (кликабельно)
            React.createElement('span', {
              className: 'week-heatmap-norm',
              onClick: (e) => {
                e.stopPropagation();
                haptic('light');
                openExclusivePopup('weekNorm', {
                  days: weekHeatmapData.days,
                  inNorm: weekHeatmapData.inNorm,
                  withData: weekHeatmapData.withData,
                  x: e.clientX,
                  y: e.clientY
                });
              },
              title: 'Нажмите для подробностей'
            },
              weekHeatmapData.inNorm + '/' + weekHeatmapData.withData + ' в норме'
            )
          ),
          // === Блок статистики дефицита/жира внутри heatmap ===
          weekHeatmapData.totalEaten > 0 && (() => {
            const deficitMeta = vmComputed.weekHeatmapDeficitMeta;
            const {
              totalEaten,
              totalBurned,
              targetDef,
              diffPct,
              pctColor,
              diffSign,
              targetSign,
              deficitKcal,
              fatBurnedText,
              colorClass,
              styles: deficitStyles
            } = deficitMeta;

            return React.createElement('div', {
              className: 'week-heatmap-deficit ' + (colorClass || 'mixed'),
              onClick: (e) => {
                e.stopPropagation();
                haptic('light');
                // 2026-05-28: dropped startTransition wrapper (transition discarded в курaторе)
                const rect = e.currentTarget.getBoundingClientRect();
                if (deficitMeta.popupData) {
                  const pos = { x: rect.left + rect.width / 2, y: rect.top, data: deficitMeta.popupData };
                  setWeekDeficitPopup(pos);
                }
              }
            },
              weekHeatmapData.todayExcluded && React.createElement('span', {
                className: 'week-heatmap-deficit-excluded'
              }, 'Сегодня не учтён'),
              React.createElement('span', { style: deficitStyles?.stack },
                // Первая строка: потрачено / съедено + процент
                React.createElement('span', { style: deficitStyles?.row },
                  React.createElement('span', { style: deficitStyles?.value }, totalBurned?.toLocaleString('ru')),
                  React.createElement('span', { style: deficitStyles?.slash }, '/'),
                  React.createElement('span', { style: deficitStyles?.value }, totalEaten?.toLocaleString('ru')),
                  React.createElement('span', { style: deficitMeta.pctStyle || deficitStyles?.pct }, (diffSign || '') + diffPct + '%')
                ),
                React.createElement('span', { className: 'week-heatmap-deficit-target' },
                  React.createElement('span', { className: 'week-heatmap-deficit-target-line' },
                    'Средняя цель была ' + (targetSign || '') + targetDef + '%',
                    deficitMeta.hasRefeedInWeek && React.createElement('span', { className: 'week-heatmap-deficit-badge' }, 'Был рефид')
                  )
                ),
                // Вторая строка: сожжённый жир
                fatBurnedText && React.createElement('span', {
                  style: deficitStyles?.fatText,
                  title: 'Научный расчёт: дефицит ' + deficitKcal + ' ккал × 77% / 7.7 ккал/г'
                }, '🔥 −' + fatBurnedText)
              )
            );
          })()
        );
      })(),
      // HEYS Score — плитка итога периода (сырой тренд каскада), рядом с
      // «в норме» выше. UI_V4_SPEC_2026-08-09.md, «Каскад как трендовая
      // оценка (HEYS Score)»; разбор на 4 группы — по тапу на плитке.
      !useReportsV4 && HEYS.CascadeCard?.HeysScoreTile && React.createElement(HEYS.CascadeCard.HeysScoreTile, {}),
      // Спарклайн веса — показываем если есть хотя бы 1 точка (вес из профиля)
      weightSparklineData.length >= 1 && React.createElement('div', {
        className: 'weight-sparkline-container' +
          (useReportsV4 ? ' reports-v4-dynamics-card' : '') +
          (weightTrend?.direction === 'down' ? ' trend-down' :
            weightTrend?.direction === 'up' ? ' trend-up' : ' trend-same')
      },
        React.createElement('div', { className: useReportsV4 ? 'reports-v4-dynamics-card__head' : 'weight-sparkline-header' },
          React.createElement('span', {
            className: useReportsV4 ? 'reports-v4-dynamics-card__label' : 'weight-sparkline-title'
          // Контракт «динамика»: кривая веса на фиксированных 30 днях.
          }, useReportsV4 ? 'Вес · 30 дней' : '⚖️ Вес'),
          // Badges показываем только когда есть тренд (2+ точки)
          weightSparklineData.length >= 2 && weightTrend && React.createElement('div', { className: 'weight-sparkline-badges' },
            React.createElement('span', {
              className: 'weight-trend-badge' +
                (weightTrend.direction === 'down' ? ' down' :
                  weightTrend.direction === 'up' ? ' up' : ' same')
            },
              weightTrend.direction === 'down' ? '↓' :
                weightTrend.direction === 'up' ? '↑' : '→',
              ' ', weightTrend.text
            ),
            // Контракт «два запрета»: «~кг/мес» — экстраполяция, в Отчётах
            // прогнозов нет; темп живёт только в «Подробно» Инсайтов.
            !useReportsV4 && monthForecast && React.createElement('span', {
              className: 'weight-forecast-badge' +
                (monthForecast.direction === 'down' ? ' down' :
                  monthForecast.direction === 'up' ? ' up' : '')
            }, monthForecast.text),
            // Бейдж "чистый тренд" если дни с задержкой воды исключены
            weightTrend.isCleanTrend && React.createElement('span', {
              className: 'weight-clean-trend-badge',
              title: 'Дни с задержкой воды исключены из тренда'
            }, '🌸 чистый')
          ) // закрываем badges div
        ), // закрываем условие weightSparklineData.length >= 2
        renderWeightSparkline(weightSparklineData),
        // Контракт «динамика»: сноска про особый период — всегда, когда такие
        // дни есть в окне (раньше пряталась за chartPeriod >= 61 и на 7/14/30
        // не показывалась никогда). Подсказка «~кг/мес» снята — прогнозов в
        // Отчётах нет («два запрета»).
        useReportsV4 && weightSparklineData.some((d) => d.hasWaterRetention) && React.createElement('div', {
          className: 'reports-v4-weight-cycle-footnote'
        }, 'дни особого периода в тренд не входят'),
        // Сноска о задержке воды если есть такие дни
        !useReportsV4 && weightSparklineData.some(d => d.hasWaterRetention) && React.createElement('div', {
          className: 'weight-retention-note'
        },
          React.createElement('span', { className: 'weight-retention-note-icon' }, '🌸'),
          React.createElement('div', { className: 'weight-retention-note-content' },
            // Основной текст
            React.createElement('span', { className: 'weight-retention-note-text' },
              'Розовые зоны — дни с возможной задержкой воды (',
              React.createElement('b', null, '+1-3 кг'),
              '). Это НЕ жир!'
            ),
            // Прогноз нормализации
            cycleHistoryAnalysis?.forecast?.message && React.createElement('div', {
              className: 'weight-retention-forecast'
            },
              '⏱️ ', cycleHistoryAnalysis.forecast.message
            ),
            // Персональный инсайт из истории
            cycleHistoryAnalysis?.hasSufficientData && cycleHistoryAnalysis?.insight && React.createElement('div', {
              className: 'weight-retention-insight'
            },
              '📊 ', cycleHistoryAnalysis.insight
            ),
            // Статистика по циклам (если >=2 циклов)
            cycleHistoryAnalysis?.cyclesAnalyzed >= 2 && React.createElement('div', {
              className: 'weight-retention-stats'
            },
              'Твоя типичная задержка: ',
              React.createElement('b', null, '~' + cycleHistoryAnalysis.avgRetentionKg + ' кг'),
              ' (на основе ', cycleHistoryAnalysis.cyclesAnalyzed, ' циклов)'
            )
          )
        )
      ),
      // Подсказка если целевой вес не задан — прогноз идёт к стабилизации
      !prof?.weightGoal && weightSparklineData.some(d => d.isFuture) && React.createElement('div', {
        className: 'weight-goal-hint'
      },
        '💡 Укажи ',
        React.createElement('button', {
          className: 'weight-goal-hint-link',
          onClick: (e) => {
            e.preventDefault();
            openProfileTab();
          }
        }, 'целевой вес'),
        ' в профиле — прогноз будет точнее!'
      ),
      useReportsV4 && ReportsTabV4Bottom({ React, periodMeta: reportsPeriodMeta }),
      // Popup с деталями веса при клике на точку — V2 STYLE
      sparklinePopup && sparklinePopup.type === 'weight' && (() => {
        const point = sparklinePopup.point;
        if (point.hasWaterRetention) {
          const popupW = 196;
          const popupH = 82;
          const pos = getSmartPopupPosition(
            sparklinePopup.x,
            sparklinePopup.y,
            popupW,
            popupH,
            { preferAbove: true, offset: 10 }
          );
          const tooltipId = 'weight-retention-tooltip-' + String(point.date || point.cycleDay || 'day')
            .replace(/[^a-zA-Z0-9_-]/g, '-');
          const weightLabel = String(point.weight).replace('.', ',') + ' кг';
          const retentionStyle = popupPositionStyle
            ? popupPositionStyle({ position: 'fixed', zIndex: 9999 }, pos.left, pos.top, popupW)
            : undefined;

          return React.createElement('div', {
            id: tooltipId,
            className: 'sparkline-popup sparkline-popup--retention',
            role: 'tooltip',
            style: retentionStyle,
            onClick: (e) => e.stopPropagation()
          },
            React.createElement('div', { className: 'sparkline-popup--retention__title' },
              'День ' + point.cycleDay + ' · ' + weightLabel
            ),
            React.createElement('div', { className: 'sparkline-popup--retention__text' },
              'Возможна задержка воды: от одного до трёх килограммов. В тренд этот день не входит.'
            )
          );
        }
        const popupW = 240;
        const popupH = 180;
        const pos = getSmartPopupPosition(
          sparklinePopup.x,
          sparklinePopup.y,
          popupW,
          popupH,
          { preferAbove: true, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;

        const trend = weightPopupMeta.trend ?? (point.localTrend || 0);
        const color = weightPopupMeta.color || '#6b7280';
        const weightStyles = weightPopupMeta.styles;
        const trendIcon = weightPopupMeta.trendIcon || '→';
        const trendText = weightPopupMeta.trendText || ((trend > 0 ? '+' : '') + trend.toFixed(1) + ' кг');

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setSparklinePopup(null));

        return PopupWithBackdrop({
          onClose: () => setSparklinePopup(null),
          children: React.createElement('div', {
            className: 'sparkline-popup sparkline-popup-v2' + (showAbove ? ' show-above' : ''),
            role: 'dialog',
            'aria-label': 'Вес ' + point.weight + ' кг',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(weightStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Цветная полоса
            React.createElement('div', {
              className: 'sparkline-popup-stripe',
              style: weightStyles.stripe || undefined
            }),
            // Контент
            React.createElement('div', { className: 'sparkline-popup-content' },
              // Swipe indicator
              React.createElement('div', { className: 'sparkline-popup-swipe' }),
              // Header: дата + тренд
              React.createElement('div', { className: 'sparkline-popup-header-v2' },
                React.createElement('span', { className: 'sparkline-popup-date' },
                  point.isToday ? '📅 Сегодня' : '📅 ' + point.dayNum + ' число'
                ),
                React.createElement('span', {
                  className: 'sparkline-popup-pct',
                  style: weightStyles.pct || undefined
                }, trendIcon + ' ' + trendText)
              ),
              // Основное значение веса
              React.createElement('div', { className: 'sparkline-popup-value-row' },
                React.createElement('span', { style: weightStyles.value || undefined },
                  '⚖️ ' + point.weight + ' кг'
                )
              ),
              // Теги: если есть данные о дне
              (point.sleepHours > 0 || point.steps > 0) &&
              React.createElement('div', { className: 'sparkline-popup-tags-v2' },
                point.sleepHours > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2' + (point.sleepHours < 6 ? ' bad' : point.sleepHours >= 7 ? ' good' : '')
                }, '😴 ' + point.sleepHours.toFixed(1) + 'ч'),
                point.steps > 0 && React.createElement('span', {
                  className: 'sparkline-popup-tag-v2' + (point.steps >= 10000 ? ' good' : '')
                }, '👟 ' + point.steps.toLocaleString())
              ),
              // Кнопка перехода
              !point.isToday && point.date && React.createElement('button', {
                className: 'sparkline-popup-btn-v2',
                onClick: () => {
                  setSparklinePopup(null);
                  selectDateWithPrefetch(point.date, { reason: 'sparkline-weight' });
                }
              }, '→ Перейти к дню'),
              // Close
              React.createElement('button', {
                className: 'sparkline-popup-close',
                'aria-label': 'Закрыть',
                onClick: () => setSparklinePopup(null)
              }, '✕')
            ),
            // Стрелка
            React.createElement('div', {
              className: 'sparkline-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
            })
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // Popup для прогноза веса — V2 STYLE
      sparklinePopup && sparklinePopup.type === 'weight-forecast' && (() => {
        const point = sparklinePopup.point;
        const popupW = 240;
        const popupH = 160;
        const pos = getSmartPopupPosition(
          sparklinePopup.x,
          sparklinePopup.y,
          popupW,
          popupH,
          { preferAbove: true, offset: 8 }
        );
        const { left, top, arrowPos, showAbove } = pos;

        const change = weightForecastPopupMeta.change ?? (point.forecastChange || 0);
        const color = weightForecastPopupMeta.color || '#6b7280';
        const forecastStyles = weightForecastPopupMeta.styles;
        const trendIcon = weightForecastPopupMeta.trendIcon || '→';
        const trendText = weightForecastPopupMeta.trendText || ((change > 0 ? '+' : '') + change.toFixed(1) + ' кг');

        // Swipe — используем хук
        const swipeHandlers = createSwipeHandlers(() => setSparklinePopup(null));

        return PopupWithBackdrop({
          onClose: () => setSparklinePopup(null),
          children: React.createElement('div', {
            className: 'sparkline-popup sparkline-popup-v2' + (showAbove ? ' show-above' : ''),
            role: 'dialog',
            'aria-label': 'Прогноз веса ~' + point.weight + ' кг',
            'aria-modal': 'true',
            style: popupPositionStyle ? popupPositionStyle(forecastStyles.popup, left, top, popupW) : undefined,
            onClick: (e) => e.stopPropagation(),
            ...swipeHandlers
          },
            // Цветная полоса (градиент для прогноза)
            React.createElement('div', {
              className: 'sparkline-popup-stripe',
              style: forecastStyles.stripe || undefined
            }),
            // Контент
            React.createElement('div', { className: 'sparkline-popup-content' },
              // Swipe indicator
              React.createElement('div', { className: 'sparkline-popup-swipe' }),
              // Header: прогноз + изменение
              React.createElement('div', { className: 'sparkline-popup-header-v2' },
                React.createElement('span', { className: 'sparkline-popup-date' },
                  '🔮 Прогноз на ' + point.dayNum
                ),
                React.createElement('span', {
                  className: 'sparkline-popup-pct',
                  style: forecastStyles.pct || undefined
                }, trendIcon + ' ' + trendText)
              ),
              // Основное значение
              React.createElement('div', { className: 'sparkline-popup-value-row' },
                React.createElement('span', { style: forecastStyles.value || undefined },
                  '⚖️ ~' + point.weight + ' кг'
                )
              ),
              // Подсказка
              React.createElement('div', { className: 'sparkline-popup-hint-v2' },
                'На основе тренда последних дней'
              ),
              // Close
              React.createElement('button', {
                className: 'sparkline-popup-close',
                'aria-label': 'Закрыть',
                onClick: () => setSparklinePopup(null)
              }, '✕')
            ),
            // Стрелка
            React.createElement('div', {
              className: 'sparkline-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
            })
          ) // Закрываем popup div
        }); // Закрываем PopupWithBackdrop
      })(),
      // Контейнер: Макро-кольца + Плашка веса
      !useReportsV4 && React.createElement('div', { className: 'macro-weight-row' },
        // Макро-бар БЖУ (в стиле Apple Watch колец)
        (() => {
          const macroRingsMeta = vmComputed.macroRingsMeta;
          // Унификация target БЖУ с шапкой и виджетами: target от displayOptimum
          // (учитывает рефид/dailyBoost/dailyReduction). Используем normAbs из macroRingsMeta
          // (он там уже пересчитан с displayOptimum). Если нет — fallback на базовый.
          const normAbs = macroRingsMeta.displayNormAbs || vmContext.normAbs;
          const protRatio = macroRingsMeta.protRatio ?? ((dayTot.prot || 0) / (normAbs.prot || 1));
          const fatRatio = macroRingsMeta.fatRatio ?? ((dayTot.fat || 0) / (normAbs.fat || 1));
          const carbsRatio = macroRingsMeta.carbsRatio ?? ((dayTot.carbs || 0) / (normAbs.carbs || 1));

          const ringStartOffsetPct = 9;
          const ringCapCompPct = 5;
          const getRingDot = (ratio) => {
            const pctRaw = Math.max(0, Math.min(100, Math.round((Number.isFinite(ratio) ? ratio : 0) * 100)) - ringCapCompPct);
            const dotPct = Math.max(0, pctRaw - 3); // слегка смещаем точку назад, чтобы оставался стартовый интервал
            if (dotPct <= 0) return null;
            const angle = ((dotPct + ringStartOffsetPct) / 100) * Math.PI * 2;
            return {
              x: 18 + 15.5 * Math.cos(angle),
              y: 18 + 15.5 * Math.sin(angle)
            };
          };

          const getDotColor = (ratio) => (ratio > 1 ? '#ef4444' : '#22c55e');
          const protDot = getRingDot(protRatio);
          const fatDot = getRingDot(fatRatio);
          const carbsDot = getRingDot(carbsRatio);
          const protDotColor = getDotColor(protRatio);
          const fatDotColor = getDotColor(fatRatio);
          const carbsDotColor = getDotColor(carbsRatio);

          const protColor = macroRingsMeta.protColor || '#6b7280';
          const fatColor = macroRingsMeta.fatColor || '#6b7280';
          const carbsColor = macroRingsMeta.carbsColor || '#6b7280';

          const protBadges = macroRingsMeta.protBadges || [];
          const fatBadges = macroRingsMeta.fatBadges || [];
          const carbsBadges = macroRingsMeta.carbsBadges || [];

          // Функция открытия popup для круга
          const openRingPopup = (e, macro, value, norm, ratio, color, badges) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const payload = {
              macro,
              emoji: null,
              desc: null,
              value: Math.round(value || 0),
              norm: Math.round(norm || 0),
              ratio,
              color,
              allBadges: badges || [],
              x: rect.left + rect.width / 2,
              y: rect.bottom
            };
            haptic('light');
            // 2026-05-28: dropped startTransition wrapper (transition discarded в курaторе)
            setMacroBadgePopup(payload);
          };

          // Получаем данные о переборе из ViewModel
          const protOverData = macroRingsMeta.protOverData || { hasOver: false, overPct: 0 };
          const fatOverData = macroRingsMeta.fatOverData || { hasOver: false, overPct: 0 };
          const carbsOverData = macroRingsMeta.carbsOverData || { hasOver: false, overPct: 0 };

          return React.createElement('div', { className: 'macro-rings' },
            // Белки
            React.createElement('div', { className: 'macro-ring-item' },
              React.createElement('div', {
                className: 'macro-ring' + (protOverData.hasOver ? ' macro-ring--over' : '') + (protColor === '#ef4444' ? ' macro-ring-pulse' : ''),
                onClick: (e) => openRingPopup(e, 'Белки', dayTot.prot, normAbs.prot, protRatio, protColor, protBadges),
                style: macroRingsMeta.styles?.ringButton
              },
                React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                  React.createElement('defs', null,
                    React.createElement('linearGradient', {
                      id: 'macro-ring-gradient-protein',
                      x1: '0%', y1: '0%', x2: '100%', y2: '100%'
                    },
                      React.createElement('stop', { offset: '0%', stopColor: '#fecaca' }),
                      React.createElement('stop', { offset: '100%', stopColor: '#ef4444' })
                    )
                  ),
                  React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.5, pathLength: 100 }),
                  React.createElement('circle', {
                    className: 'macro-ring-fill',
                    cx: 18, cy: 18, r: 15.5,
                    pathLength: 100,
                    style: macroRingsMeta.protRingStrokeStyle
                  }),
                  // Красная дуга перебора
                  protOverData.hasOver && React.createElement('circle', {
                    className: 'macro-ring-fill--over',
                    cx: 18, cy: 18, r: 15.5,
                    pathLength: 100,
                    style: {
                      strokeDasharray: protOverData.overPct + ' ' + (100 - protOverData.overPct),
                      '--over-dasharray': protOverData.overPct + ' ' + (100 - protOverData.overPct),
                      '--over-offset': -(100 - protOverData.overPct),
                      stroke: '#22c55e'
                    }
                  }),
                  protDot && React.createElement('circle', {
                    className: 'macro-ring-dot',
                    cx: protDot.x,
                    cy: protDot.y,
                    r: 2.2,
                    style: { '--macro-ring-dot': protDotColor }
                  }),
                  // Маркер убран по просьбе
                ),
                React.createElement('span', { className: 'macro-ring-value', style: macroRingsMeta.styles?.value ? macroRingsMeta.styles.value(protColor) : undefined },
                  Math.round(dayTot.prot || 0)
                )
              ),
              React.createElement('span', { className: 'macro-ring-label' }, 'Белки'),
              React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.prot || 0) + 'г')
            ),
            // Жиры
            React.createElement('div', { className: 'macro-ring-item' },
              React.createElement('div', {
                className: 'macro-ring' + (fatOverData.hasOver ? ' macro-ring--over' : '') + (fatColor === '#ef4444' ? ' macro-ring-pulse' : ''),
                onClick: (e) => openRingPopup(e, 'Жиры', dayTot.fat, normAbs.fat, fatRatio, fatColor, fatBadges),
                style: macroRingsMeta.styles?.ringButton
              },
                React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                  React.createElement('defs', null,
                    React.createElement('linearGradient', {
                      id: 'macro-ring-gradient-fat',
                      x1: '0%', y1: '0%', x2: '100%', y2: '100%'
                    },
                      React.createElement('stop', { offset: '0%', stopColor: '#fde68a' }),
                      React.createElement('stop', { offset: '100%', stopColor: '#f59e0b' })
                    )
                  ),
                  React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.5, pathLength: 100 }),
                  React.createElement('circle', {
                    className: 'macro-ring-fill',
                    cx: 18, cy: 18, r: 15.5,
                    pathLength: 100,
                    style: macroRingsMeta.fatRingStrokeStyle
                  }),
                  // Красная дуга перебора
                  fatOverData.hasOver && React.createElement('circle', {
                    className: 'macro-ring-fill--over',
                    cx: 18, cy: 18, r: 15.5,
                    pathLength: 100,
                    style: {
                      strokeDasharray: fatOverData.overPct + ' ' + (100 - fatOverData.overPct),
                      '--over-dasharray': fatOverData.overPct + ' ' + (100 - fatOverData.overPct),
                      '--over-offset': -(100 - fatOverData.overPct),
                      stroke: '#ef4444'
                    }
                  }),
                  fatDot && React.createElement('circle', {
                    className: 'macro-ring-dot',
                    cx: fatDot.x,
                    cy: fatDot.y,
                    r: 2.2,
                    style: { '--macro-ring-dot': fatDotColor }
                  }),
                  // Маркер убран по просьбе
                ),
                React.createElement('span', { className: 'macro-ring-value', style: macroRingsMeta.styles?.value ? macroRingsMeta.styles.value(fatColor) : undefined },
                  Math.round(dayTot.fat || 0)
                )
              ),
              React.createElement('span', { className: 'macro-ring-label' }, 'Жиры'),
              React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.fat || 0) + 'г')
            ),
            // Углеводы
            React.createElement('div', { className: 'macro-ring-item' },
              React.createElement('div', {
                className: 'macro-ring' + (carbsOverData.hasOver ? ' macro-ring--over' : '') + (carbsColor === '#ef4444' ? ' macro-ring-pulse' : ''),
                onClick: (e) => openRingPopup(e, 'Углеводы', dayTot.carbs, normAbs.carbs, carbsRatio, carbsColor, carbsBadges),
                style: macroRingsMeta.styles?.ringButton
              },
                React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                  React.createElement('defs', null,
                    React.createElement('linearGradient', {
                      id: 'macro-ring-gradient-carbs',
                      x1: '0%', y1: '0%', x2: '100%', y2: '100%'
                    },
                      React.createElement('stop', { offset: '0%', stopColor: '#bbf7d0' }),
                      React.createElement('stop', { offset: '100%', stopColor: '#22c55e' })
                    )
                  ),
                  React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.5, pathLength: 100 }),
                  React.createElement('circle', {
                    className: 'macro-ring-fill',
                    cx: 18, cy: 18, r: 15.5,
                    pathLength: 100,
                    style: macroRingsMeta.carbsRingStrokeStyle
                  }),
                  // Красная дуга перебора
                  carbsOverData.hasOver && React.createElement('circle', {
                    className: 'macro-ring-fill--over',
                    cx: 18, cy: 18, r: 15.5,
                    pathLength: 100,
                    style: {
                      strokeDasharray: carbsOverData.overPct + ' ' + (100 - carbsOverData.overPct),
                      '--over-dasharray': carbsOverData.overPct + ' ' + (100 - carbsOverData.overPct),
                      '--over-offset': -(100 - carbsOverData.overPct),
                      stroke: '#ef4444'
                    }
                  }),
                  carbsDot && React.createElement('circle', {
                    className: 'macro-ring-dot',
                    cx: carbsDot.x,
                    cy: carbsDot.y,
                    r: 2.2,
                    style: { '--macro-ring-dot': carbsDotColor }
                  }),
                  // Маркер убран по просьбе
                ),
                React.createElement('span', { className: 'macro-ring-value', style: macroRingsMeta.styles?.value ? macroRingsMeta.styles.value(carbsColor) : undefined },
                  Math.round(dayTot.carbs || 0)
                )
              ),
              React.createElement('span', { className: 'macro-ring-label' }, 'Углеводы'),
              React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.carbs || 0) + 'г')
            )
          );
        })(),
        // Плашка веса - кликабельная целиком
        React.createElement('div', {
          className: 'weight-card-modern' + (day.weightMorning ? '' : ' weight-card-empty'),
          onClick: openWeightPicker
        },
          // Лейбл "Вес" сверху
          React.createElement('span', { className: 'weight-card-label' }, 'ВЕС НА УТРО'),
          // Значение веса
          React.createElement('div', { className: 'weight-card-row' },
            React.createElement('span', { className: 'weight-value-number' },
              day.weightMorning ? r1(day.weightMorning) : '—'
            ),
            React.createElement('span', { className: 'weight-value-unit' }, 'кг')
          ),
          // Тренд под значением + DEV кнопка очистки
          day.weightMorning && React.createElement('div', { className: 'weight-trend-row' },
            weightTrend && React.createElement('div', {
              className: 'weight-card-trend ' + (weightTrend.direction === 'down' ? 'trend-down' : weightTrend.direction === 'up' ? 'trend-up' : 'trend-same')
            },
              React.createElement('span', { className: 'trend-arrow' }, weightTrend.direction === 'down' ? '↓' : weightTrend.direction === 'up' ? '↑' : '→'),
              weightTrend.text.replace(/[^а-яА-Я0-9.,\-+\s]/g, '').trim()
            ),
            // DEV: Мини-кнопка очистки веса
            React.createElement('button', {
              className: 'dev-clear-weight-mini',
              onClick: (e) => {
                e.stopPropagation();
                if (!confirm('🗑️ Сбросить утренний чек-ин за выбранный день?')) return;
                setDay(prev => resetMorningCheckinDay(prev));

                // Даем React применить state, затем сохраняем и открываем чек-ин без перезагрузки
                setTimeout(() => {
                  // Диагностика: эта кнопка — основной user path для re-открытия чекина после ×.
                  // Раньше try/catch проглатывал любые ошибки молча → невозможно понять почему
                  // визард не открылся. Теперь явно логируем что доступно (см. инцидент 2026-06-01
                  // где LS=95% full + missing showCheckin приводили к silent no-op).
                  const trace = {
                    hasDay: !!Day,
                    hasDayFlush: !!(Day && typeof Day.requestFlush === 'function'),
                    hasShowCheckin: !!showCheckin,
                    hasMorning: !!(showCheckin && typeof showCheckin.morning === 'function'),
                    hasWeight: !!(showCheckin && typeof showCheckin.weight === 'function'),
                  };
                  try {
                    if (Day && typeof Day.requestFlush === 'function') {
                      Day.requestFlush();
                    }
                    const targetDateKey = selectedDateKey || dayDateKey || date;
                    if (showCheckin && typeof showCheckin.morning === 'function') {
                      console.info('[dev-clear-weight] open morning checkin for selected day', { ...trace, targetDateKey });
                      showCheckin.morning(targetDateKey, null, {
                        requiredOnly: true,
                        yesterdayVerifyRequired: false,
                        forceStepIds: ['weight', 'sleepTime', 'sleepQuality']
                      });
                    } else {
                      console.warn('[dev-clear-weight] no checkin opener available', trace);
                    }
                  } catch (err) {
                    console.error('[dev-clear-weight] failed to open checkin', err, trace);
                  }
                }, 50);
              },
              title: 'Сбросить утренний чек-ин за выбранный день'
            }, '×')
          )
        ),
        // Плашка дефицита - кликабельная
        (() => {
          // Фактический дефицит: (съедено - затраты) / затраты * 100
          // TDEE уже включает TEF, используем его напрямую
          const actualDeficitPct = tdee > 0 ? Math.round(((eatenKcal - tdee) / tdee) * 100) : null;
          const showActualDeficit = actualDeficitPct !== null && eatenKcal > 0;

          return React.createElement('div', {
            className: 'deficit-card-modern',
            onClick: openDeficitPicker
          },
            React.createElement('span', { className: 'weight-card-label' }, 'ЦЕЛЬ ДЕФИЦИТ'),
            React.createElement('div', { className: 'weight-card-row' },
              React.createElement('span', {
                className: 'deficit-value-number' + (currentDeficit < 0 ? ' deficit-negative' : currentDeficit > 0 ? ' deficit-positive' : '')
              },
                (currentDeficit > 0 ? '+' : '') + currentDeficit
              ),
              React.createElement('span', { className: 'weight-value-unit' }, '%')
            ),
            // Фактический дефицит (если есть данные)
            showActualDeficit && React.createElement('div', {
              className: 'deficit-card-actual'
            },
              React.createElement('span', { className: 'deficit-actual-label' }, 'Факт: '),
              React.createElement('span', {
                className: 'deficit-actual-value' + (actualDeficitPct < 0 ? ' deficit-negative' : actualDeficitPct > 0 ? ' deficit-positive' : '')
              },
                (actualDeficitPct > 0 ? '+' : '') + actualDeficitPct + '%'
              )
            ),
            // Разница от профиля
            currentDeficit !== profileDeficit && React.createElement('div', {
              className: 'deficit-card-trend ' + (currentDeficit < profileDeficit ? 'trend-down' : 'trend-up')
            },
              React.createElement('span', { className: 'trend-arrow' }, currentDeficit < profileDeficit ? '↓' : '↑'),
              (currentDeficit > profileDeficit ? '+' : '') + (currentDeficit - profileDeficit) + '%'
            )
          );
        })()
      )
    );

    return statsBlock;
  }

  // Export
  HEYS.dayStats = {
    render: renderStatsBlock,
    _test: {
      resetMorningCheckinDay,
      buildReportsPeriodMeta,
      ReportsTabV4,
      ReportsTabV4Top,
      ReportsTabV4Bottom
    }
  };

})(window);
