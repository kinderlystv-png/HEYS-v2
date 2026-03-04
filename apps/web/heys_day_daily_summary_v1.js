// heys_day_daily_summary_v1.js — Daily summary table renderer
; (function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  function renderDailySummary(params) {
    const {
      React,
      day,
      pIndex,
      dayTot,
      normAbs,
      fmtVal,
      pct,
      getDailyNutrientColor,
      getDailyNutrientTooltip,
      tableOnly
    } = params || {};

    if (!React) return null;

    const factKeys = ['kcal', 'prot', 'fat', 'carbs', 'harm', 'fiber', 'gi'];
    const effectiveNormAbs = normAbs || {};
    const effectiveDayTot = { ...(dayTot || {}) };
    const GOOD_GREEN = '#16a34a';
    const BAD_RED = '#dc2626';
    const safeTooltip = typeof getDailyNutrientTooltip === 'function'
      ? getDailyNutrientTooltip
      : () => '';
    const safeFmtVal = typeof fmtVal === 'function'
      ? fmtVal
      : (k, v) => {
        const n = +v || 0;
        if (k === 'harm') return Number.isFinite(n) ? n.toFixed(1) : '0.0';
        return String(Math.round(n));
      };

    function isHigherBetter(k) {
      return k === 'prot' || k === 'fiber';
    }

    function getFactColor(k, f, n) {
      if (!n) return null;
      const higherBetter = isHigherBetter(k);
      if (higherBetter) return f >= n ? GOOD_GREEN : BAD_RED;
      return f <= n ? GOOD_GREEN : BAD_RED;
    }

    function getDeviationColor(k, diff) {
      const higherBetter = isHigherBetter(k);
      if (higherBetter) return diff >= 0 ? GOOD_GREEN : BAD_RED;
      return diff <= 0 ? GOOD_GREEN : BAD_RED;
    }

    function devCell(k) {
      const n = +effectiveNormAbs[k] || 0; if (!n) return React.createElement('td', { key: 'ds-dv' + k }, '-');
      const f = +effectiveDayTot[k] || 0;

      if (k === 'harm') {
        const deltaUnits = Math.round((f - n) * 10) / 10;
        const color = getDeviationColor(k, deltaUnits);
        const fw = deltaUnits !== 0 ? 600 : 400;
        const value = (deltaUnits > 0 ? '+' : '') + deltaUnits.toFixed(1);
        return React.createElement('td', { key: 'ds-dv' + k, style: { color, fontWeight: fw } }, value);
      }

      const d = ((f - n) / n) * 100; const diff = Math.round(d);
      const color = getDeviationColor(k, diff);
      const fw = diff !== 0 ? 600 : 400;
      return React.createElement('td', { key: 'ds-dv' + k, style: { color, fontWeight: fw } }, (diff > 0 ? '+' : '') + diff + '%');
    }

    function factCell(k) {
      const f = +effectiveDayTot[k] || 0; const n = +effectiveNormAbs[k] || 0; if (!n) return React.createElement('td', { key: 'ds-fv' + k }, safeFmtVal(k, f));
      const color = getFactColor(k, f, n);
      const fw = 600;
      const style = color ? { color, fontWeight: fw } : { fontWeight: fw };
      return React.createElement('td', { key: 'ds-fv' + k, style }, safeFmtVal(k, f));
    }

    function normVal(k) { const n = +effectiveNormAbs[k] || 0; return n ? safeFmtVal(k, n) : '-'; }

    const per100Head = ['', '', '', '', '', '', '', '', '', '']; // 10 per100 columns blank (соответствует таблице приёма)
    const factHead = ['ккал', 'Б', 'Ж', 'У', 'вред', 'клет', 'Глик', '']; // последний пустой (кнопка)

    function getProblemStyle(k, f, mt) {
      if (!f) return {};
      let isProblem = false;
      if (k === 'trans' && f > 0.1) isProblem = true;
      else if (k === 'gi' && f >= 70) isProblem = true;
      else if (k === 'harm' && f >= 6.5) isProblem = true;
      else if (k === 'simple' && f > 20) isProblem = true;
      else if (k === 'bad' && f > 10) isProblem = true;

      // also check percentage of macros for simple and bad
      if (k === 'simple' && mt.carbs > 0 && (f / mt.carbs) > 0.5 && f > 10) isProblem = true;
      if (k === 'bad' && mt.fat > 0 && (f / mt.fat) > 0.5 && f > 5) isProblem = true;

      if (isProblem) {
        return { backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#b91c1c', fontWeight: 600, borderRadius: '4px' };
      }
      return {};
    }

    const mealRowsDesktop = [];
    const mealRowsMobile = [];

    function timeToMinutes(time) {
      if (!time || typeof time !== 'string') return Number.MAX_SAFE_INTEGER;
      const m = time.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return Number.MAX_SAFE_INTEGER;
      const h = Number(m[1]);
      const mm = Number(m[2]);
      if (!Number.isFinite(h) || !Number.isFinite(mm)) return Number.MAX_SAFE_INTEGER;
      return (h * 60) + mm;
    }

    function fallbackMealNameByTime(time) {
      const t = timeToMinutes(time);
      if (!Number.isFinite(t) || t === Number.MAX_SAFE_INTEGER) return 'Приём';
      if (t < 11 * 60) return 'Завтрак';
      if (t < 16 * 60) return 'Обед';
      if (t < 21 * 60) return 'Ужин';
      return 'Перекус';
    }

    if (day && day.meals && Array.isArray(day.meals) && window.HEYS?.models?.mealTotals) {
      const getMT = window.HEYS.getMealType || null;
      const totalsFromMeals = { kcal: 0, prot: 0, fat: 0, carbs: 0, fiber: 0, giWeighted: 0, harmWeighted: 0, grams: 0 };

      function readGiFromSources(item, product) {
        const v = product?.gi ?? product?.gi100 ?? product?.GI ?? product?.giIndex
          ?? item?.gi ?? item?.gi100 ?? item?.GI ?? item?.giIndex;
        return Number.isFinite(+v) ? (+v) : null;
      }

      function readHarmFromSources(item, product) {
        const pHarm = window.HEYS?.models?.normalizeHarm
          ? window.HEYS.models.normalizeHarm(product)
          : (product?.harm ?? product?.harmScore ?? product?.harmscore ?? product?.harm100);
        const iHarm = item?.harm ?? item?.harmScore ?? item?.harmscore ?? item?.harm100;
        const v = pHarm ?? iHarm;
        return Number.isFinite(+v) ? (+v) : null;
      }

      const mealsSorted = day.meals
        .map((m, originalIndex) => ({ m, originalIndex }))
        .sort((a, b) => {
          const ta = timeToMinutes(a.m?.time);
          const tb = timeToMinutes(b.m?.time);
          if (ta !== tb) return ta - tb;
          return a.originalIndex - b.originalIndex;
        });

      mealsSorted.forEach(({ m, originalIndex }, idx) => {
        if (!m.items || m.items.length === 0) return;
        const mt = window.HEYS.models.mealTotals(m, pIndex) || {};

        // Fallback quality metrics (gi/harm) if current totals provider does not expose them
        if (mt.gi == null || mt.harm == null) {
          let gramsSum = 0;
          let giWeighted = 0;
          let harmWeighted = 0;
          (m.items || []).forEach((it) => {
            const grams = +it.grams || 0;
            if (!grams) return;
            const product = window.HEYS?.models?.getProductFromItem
              ? window.HEYS.models.getProductFromItem(it, pIndex)
              : null;

            const gi = readGiFromSources(it, product);
            const harm = readHarmFromSources(it, product);
            gramsSum += grams;
            if (gi != null) giWeighted += (+gi || 0) * grams;
            if (harm != null) harmWeighted += (+harm || 0) * grams;
          });
          if (gramsSum > 0) {
            if (mt.gi == null) mt.gi = giWeighted / gramsSum;
            if (mt.harm == null) mt.harm = harmWeighted / gramsSum;
          }
        }

        // Aggregate for robust day-level fallback (fix for missing harm/gi in day totals)
        totalsFromMeals.kcal += +mt.kcal || 0;
        totalsFromMeals.prot += +mt.prot || 0;
        totalsFromMeals.fat += +mt.fat || 0;
        totalsFromMeals.carbs += +mt.carbs || 0;
        totalsFromMeals.fiber += +mt.fiber || 0;

        let mealGrams = 0;
        (m.items || []).forEach((it) => { mealGrams += (+it.grams || 0); });
        if (mealGrams > 0) {
          totalsFromMeals.grams += mealGrams;
          totalsFromMeals.giWeighted += (+mt.gi || 0) * mealGrams;
          totalsFromMeals.harmWeighted += (+mt.harm || 0) * mealGrams;
        }

        let label = fallbackMealNameByTime(m.time);
        if (getMT) {
          try {
            const tInfo = getMT(m);
            if (tInfo && tInfo.name) {
              label = tInfo.name;
            }
          } catch (e) { }
        }

        mealRowsDesktop.push(
          React.createElement('tr', { key: `md-${originalIndex}`, className: 'meal-summary-row', style: { opacity: 0.85, fontSize: '0.95em' } },
            React.createElement('td', null, ''),
            React.createElement('td', null, ''),
            per100Head.map((_, i) => i === per100Head.length - 1
              ? React.createElement('td', { key: `m-${originalIndex}-L${i}`, style: { textAlign: 'right', paddingRight: '6px', whiteSpace: 'nowrap', color: '#6b7280' }, title: 'Приём пищи' }, label)
              : React.createElement('td', { key: `m-${originalIndex}-ph${i}` }, '')),
            factKeys.map(k => {
              const f = +(mt[k] || 0);
              return React.createElement('td', { key: `m-${originalIndex}-${k}`, style: getProblemStyle(k, f, mt) }, safeFmtVal(k, f));
            }),
            React.createElement('td', null, '')
          )
        );

        const shortLabel = label;

        mealRowsMobile.push(
          React.createElement('div', { key: `mm-${originalIndex}`, className: 'mds-row mds-meal-row', style: { opacity: 0.9, borderBottom: '1px dashed rgba(0,0,0,0.05)' } },
            React.createElement('span', { className: 'mds-label', style: { fontSize: '0.85em', color: '#6b7280' }, title: label }, shortLabel),
            React.createElement('span', { style: getProblemStyle('kcal', mt.kcal, mt) }, Math.round(mt.kcal || 0)),
            React.createElement('span', { style: getProblemStyle('prot', mt.prot, mt) }, Math.round(mt.prot || 0)),
            React.createElement('span', { style: getProblemStyle('fat', mt.fat, mt) }, Math.round(mt.fat || 0)),
            React.createElement('span', { style: getProblemStyle('carbs', mt.carbs, mt) }, Math.round(mt.carbs || 0)),
            React.createElement('span', { style: getProblemStyle('harm', mt.harm, mt) }, safeFmtVal('harm', mt.harm || 0)),
            React.createElement('span', { style: getProblemStyle('fiber', mt.fiber, mt) }, Math.round(mt.fiber || 0)),
            React.createElement('span', { style: getProblemStyle('gi', mt.gi, mt) }, Math.round(mt.gi || 0))
          )
        );
      });

      // Apply fallback totals only when source totals are missing/zero but meals clearly have values
      const sourceHarm = +effectiveDayTot.harm || 0;
      const sourceGi = +effectiveDayTot.gi || 0;
      const harmFallback = totalsFromMeals.grams > 0 ? (totalsFromMeals.harmWeighted / totalsFromMeals.grams) : 0;
      const giFallback = totalsFromMeals.grams > 0 ? (totalsFromMeals.giWeighted / totalsFromMeals.grams) : 0;

      if (sourceHarm <= 0 && harmFallback > 0) effectiveDayTot.harm = harmFallback;
      if (sourceGi <= 0 && giFallback > 0) effectiveDayTot.gi = giFallback;
      if ((+effectiveDayTot.prot || 0) <= 0 && totalsFromMeals.prot > 0) effectiveDayTot.prot = totalsFromMeals.prot;
      if ((+effectiveDayTot.carbs || 0) <= 0 && totalsFromMeals.carbs > 0) effectiveDayTot.carbs = totalsFromMeals.carbs;
      if ((+effectiveDayTot.fat || 0) <= 0 && totalsFromMeals.fat > 0) effectiveDayTot.fat = totalsFromMeals.fat;
      if ((+effectiveDayTot.fiber || 0) <= 0 && totalsFromMeals.fiber > 0) effectiveDayTot.fiber = totalsFromMeals.fiber;
      if ((+effectiveDayTot.kcal || 0) <= 0 && totalsFromMeals.kcal > 0) effectiveDayTot.kcal = totalsFromMeals.kcal;
    }

    const tableContent = React.createElement(React.Fragment, null,
      React.createElement('table', { className: 'tbl meals-table daily-summary' },
        React.createElement('thead', null, React.createElement('tr', null,
          React.createElement('th', null, ''),
          React.createElement('th', null, ''),
          per100Head.map((h, i) => React.createElement('th', { key: 'ds-ph' + i, className: 'per100-col' }, h)),
          factHead.map((h, i) => React.createElement('th', { key: 'ds-fh' + i }, h))
        )),
        React.createElement('tbody', null,
          ...mealRowsDesktop,
          // Факт
          React.createElement('tr', { style: { borderTop: '1px solid rgba(59, 130, 246, 0.22)' } },
            React.createElement('td', null, ''),
            React.createElement('td', null, ''),
            per100Head.map((_, i) => i === per100Head.length - 1 ? React.createElement('td', { key: 'ds-pvL' + i, style: { fontWeight: 600, textAlign: 'right', paddingRight: '6px' }, title: 'Факт' }, 'Факт') : React.createElement('td', { key: 'ds-pv' + i }, '')),
            factKeys.map(k => factCell(k)),
            React.createElement('td', null, '')
          ),
          // Норма
          React.createElement('tr', { style: { borderTop: '1px solid rgba(148, 163, 184, 0.28)' } },
            React.createElement('td', null, ''),
            React.createElement('td', null, ''),
            per100Head.map((_, i) => i === per100Head.length - 1 ? React.createElement('td', { key: 'ds-npL' + i, style: { fontWeight: 600, textAlign: 'right', paddingRight: '6px' }, title: 'Норма' }, 'Норма') : React.createElement('td', { key: 'ds-np' + i }, '')),
            factKeys.map(k => React.createElement('td', { key: 'ds-nv' + k }, normVal(k))),
            React.createElement('td', null, '')
          ),
          // Откл
          React.createElement('tr', { className: 'daily-dev-row' },
            React.createElement('td', null, ''),
            React.createElement('td', null, ''),
            per100Head.map((_, i) => i === per100Head.length - 1 ? React.createElement('td', { key: 'ds-dpL' + i, style: { fontWeight: 600, textAlign: 'right', paddingRight: '6px' }, title: 'Отклонение' }, 'Откл.') : React.createElement('td', { key: 'ds-dp' + i }, '')),
            factKeys.map(k => devCell(k)),
            React.createElement('td', null, '')
          )
        )
      ),
      // MOBILE: compact daily summary with column headers
      React.createElement('div', { className: 'mobile-daily-summary' },
        // Header row
        React.createElement('div', { className: 'mds-header' },
          React.createElement('span', { className: 'mds-label' }, ''),
          React.createElement('span', null, 'ккал'),
          React.createElement('span', null, 'Б'),
          React.createElement('span', null, 'Ж'),
          React.createElement('span', null, 'У'),
          React.createElement('span', null, 'вред'),
          React.createElement('span', null, 'клет'),
          React.createElement('span', null, 'Глик')
        ),
        ...mealRowsMobile,
        // Fact row - с цветовой индикацией относительно нормы
        React.createElement('div', { className: 'mds-row', style: { borderTop: '1px solid rgba(59, 130, 246, 0.22)', marginTop: '4px', paddingTop: '4px' } },
          React.createElement('span', { className: 'mds-label', title: 'Факт' }, 'Факт'),
          React.createElement('span', { title: safeTooltip('kcal', effectiveDayTot.kcal, effectiveNormAbs.kcal), style: { color: getFactColor('kcal', +effectiveDayTot.kcal || 0, +effectiveNormAbs.kcal || 0) || undefined, fontWeight: 600, cursor: 'help' } }, Math.round(effectiveDayTot.kcal || 0)),
          React.createElement('span', { title: safeTooltip('prot', effectiveDayTot.prot, effectiveNormAbs.prot), style: { color: getFactColor('prot', +effectiveDayTot.prot || 0, +effectiveNormAbs.prot || 0) || undefined, fontWeight: 600, cursor: 'help' } }, Math.round(effectiveDayTot.prot || 0)),
          React.createElement('span', { title: safeTooltip('fat', effectiveDayTot.fat, effectiveNormAbs.fat), style: { color: getFactColor('fat', +effectiveDayTot.fat || 0, +effectiveNormAbs.fat || 0) || undefined, fontWeight: 600, cursor: 'help' } }, Math.round(effectiveDayTot.fat || 0)),
          React.createElement('span', { title: safeTooltip('carbs', effectiveDayTot.carbs, effectiveNormAbs.carbs), style: { color: getFactColor('carbs', +effectiveDayTot.carbs || 0, +effectiveNormAbs.carbs || 0) || undefined, fontWeight: 600, cursor: 'help' } }, Math.round(effectiveDayTot.carbs || 0)),
          React.createElement('span', { title: safeTooltip('harm', effectiveDayTot.harm, effectiveNormAbs.harm), style: { color: getFactColor('harm', +effectiveDayTot.harm || 0, +effectiveNormAbs.harm || 0) || undefined, fontWeight: 600, cursor: 'help' } }, safeFmtVal('harm', effectiveDayTot.harm || 0)),
          React.createElement('span', { title: safeTooltip('fiber', effectiveDayTot.fiber, effectiveNormAbs.fiber), style: { color: getFactColor('fiber', +effectiveDayTot.fiber || 0, +effectiveNormAbs.fiber || 0) || undefined, fontWeight: 600, cursor: 'help' } }, Math.round(effectiveDayTot.fiber || 0)),
          React.createElement('span', { title: safeTooltip('gi', effectiveDayTot.gi, effectiveNormAbs.gi), style: { color: getFactColor('gi', +effectiveDayTot.gi || 0, +effectiveNormAbs.gi || 0) || undefined, fontWeight: 600, cursor: 'help' } }, Math.round(effectiveDayTot.gi || 0))
        ),
        // Norm row
        React.createElement('div', { className: 'mds-row', style: { borderTop: '1px solid rgba(148, 163, 184, 0.28)', marginTop: '4px', paddingTop: '4px' } },
          React.createElement('span', { className: 'mds-label', title: 'Норма' }, 'Норма'),
          React.createElement('span', null, Math.round(effectiveNormAbs.kcal || 0)),
          React.createElement('span', null, Math.round(effectiveNormAbs.prot || 0)),
          React.createElement('span', null, Math.round(effectiveNormAbs.fat || 0)),
          React.createElement('span', null, Math.round(effectiveNormAbs.carbs || 0)),
          React.createElement('span', null, safeFmtVal('harm', effectiveNormAbs.harm || 0)),
          React.createElement('span', null, Math.round(effectiveNormAbs.fiber || 0)),
          React.createElement('span', null, Math.round(effectiveNormAbs.gi || 0))
        ),
        // Deviation row - custom layout matching header columns
        React.createElement('div', { className: 'mds-row mds-dev' },
          React.createElement('span', { className: 'mds-label', title: 'Отклонение' }, 'Откл.'),
          // kcal
          (() => { const n = effectiveNormAbs.kcal || 0, f = effectiveDayTot.kcal || 0; if (!n) return React.createElement('span', { key: 'dev-kcal' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-kcal', style: { color: getDeviationColor('kcal', d) } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // prot
          (() => { const n = effectiveNormAbs.prot || 0, f = effectiveDayTot.prot || 0; if (!n) return React.createElement('span', { key: 'dev-prot' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-prot', style: { color: getDeviationColor('prot', d) } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // fat
          (() => { const n = effectiveNormAbs.fat || 0, f = effectiveDayTot.fat || 0; if (!n) return React.createElement('span', { key: 'dev-fat' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-fat', style: { color: getDeviationColor('fat', d) } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // carbs
          (() => { const n = effectiveNormAbs.carbs || 0, f = effectiveDayTot.carbs || 0; if (!n) return React.createElement('span', { key: 'dev-carbs' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-carbs', style: { color: getDeviationColor('carbs', d) } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // harm
          (() => {
            const n = effectiveNormAbs.harm || 0, f = effectiveDayTot.harm || 0;
            if (!n) return React.createElement('span', { key: 'dev-harm' }, '-');
            const d = Math.round((f - n) * 10) / 10;
            return React.createElement('span', { key: 'dev-harm', style: { color: getDeviationColor('harm', d) } }, (d > 0 ? '+' : '') + d.toFixed(1));
          })(),
          // fiber
          (() => { const n = effectiveNormAbs.fiber || 0, f = effectiveDayTot.fiber || 0; if (!n) return React.createElement('span', { key: 'dev-fiber' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-fiber', style: { color: getDeviationColor('fiber', d) } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // gi
          (() => { const n = effectiveNormAbs.gi || 0, f = effectiveDayTot.gi || 0; if (!n) return React.createElement('span', { key: 'dev-gi' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-gi', style: { color: getDeviationColor('gi', d) } }, (d > 0 ? '+' : '') + d + '%'); })()
        )
      )
    );

    if (tableOnly) return tableContent;

    return React.createElement('div', {
      className: 'card tone-slate daily-summary-card widget-shadow-diary-glass widget-outline-diary-glass',
      style: {
        margin: 'calc(var(--heys-diary-stack-gap, 12px) * 1.75) 0 var(--heys-diary-stack-gap, 12px) 0',
        padding: 'var(--heys-diary-card-padding, 16px 18px)',
        background: 'var(--surface, #fff)',
        overflowX: 'auto'
      }
    },
      React.createElement('div', {
        className: 'section-title',
        style: {
          marginBottom: '6px',
          fontSize: 'var(--heys-diary-card-title-size, 14px)',
          fontWeight: 'var(--heys-diary-card-title-weight, 600)',
          color: 'var(--heys-diary-card-title-color, var(--text, #1e293b))',
          textTransform: 'none',
          letterSpacing: 'normal',
          textAlign: 'center'
        }
      }, 'Суточные итоги'),
      tableContent
    );
  }

  function renderDailySummaryTable(params) {
    return renderDailySummary({ ...(params || {}), tableOnly: true });
  }

  HEYS.dayDailySummary = {
    renderDailySummary,
    renderDailySummaryTable
  };
})(window);
