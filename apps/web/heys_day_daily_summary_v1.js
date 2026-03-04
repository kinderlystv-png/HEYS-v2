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
      getDailyNutrientTooltip
    } = params || {};

    if (!React) return null;

    const factKeys = ['kcal', 'carbs', 'simple', 'complex', 'prot', 'fat', 'bad', 'good', 'trans', 'fiber', 'gi', 'harm'];

    function devCell(k) {
      const n = +normAbs[k] || 0; if (!n) return React.createElement('td', { key: 'ds-dv' + k }, '-');
      const f = +dayTot[k] || 0; const d = ((f - n) / n) * 100; const diff = Math.round(d);
      const color = diff > 0 ? '#dc2626' : (diff < 0 ? '#059669' : '#111827'); const fw = diff !== 0 ? 600 : 400;
      return React.createElement('td', { key: 'ds-dv' + k, style: { color, fontWeight: fw } }, (diff > 0 ? '+' : '') + diff + '%');
    }

    function factCell(k) {
      const f = +dayTot[k] || 0; const n = +normAbs[k] || 0; if (!n) return React.createElement('td', { key: 'ds-fv' + k }, fmtVal(k, f));
      const over = f > n, under = f < n; let color = null; let fw = 600;
      if (['bad', 'trans'].includes(k)) { if (under) color = '#059669'; else if (over) color = '#dc2626'; else fw = 400; }
      else if (k === 'simple') { if (under) color = '#059669'; else if (over) color = '#dc2626'; else fw = 400; }
      else if (k === 'complex') { if (over) color = '#059669'; else if (under) color = '#dc2626'; else fw = 400; }
      else if (k === 'fiber') { if (over) color = '#059669'; else if (under) color = '#dc2626'; else fw = 400; }
      else if (k === 'kcal') { if (over) color = '#dc2626'; else fw = 400; }
      else if (k === 'prot') { if (over) color = '#059669'; else fw = 400; }
      else if (k === 'carbs' || k === 'fat') { if (over) color = '#dc2626'; else fw = 400; }
      else if (k === 'good') { if (over) color = '#059669'; else if (under) color = '#dc2626'; else fw = 400; }
      else if (k === 'gi' || k === 'harm') { if (over) color = '#dc2626'; else if (under) color = '#059669'; else fw = 400; }
      else { fw = 400; }
      const style = color ? { color, fontWeight: fw } : { fontWeight: fw };
      return React.createElement('td', { key: 'ds-fv' + k, style }, fmtVal(k, f));
    }

    function normVal(k) { const n = +normAbs[k] || 0; return n ? fmtVal(k, n) : '-'; }

    const per100Head = ['', '', '', '', '', '', '', '', '', '']; // 10 per100 columns blank (соответствует таблице приёма)
    const factHead = ['ккал', 'У', 'Прост', 'Сл', 'Б', 'Ж', 'ВрЖ', 'ПолЖ', 'СупЖ', 'Клет', 'ГИ', 'Вред', '']; // последний пустой (кнопка)

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

    if (day && day.meals && Array.isArray(day.meals) && window.HEYS?.models?.mealTotals) {
      const getMT = window.HEYS.getMealType || null;
      day.meals.forEach((m, idx) => {
        if (!m.items || m.items.length === 0) return;
        const mt = window.HEYS.models.mealTotals(m, pIndex) || {};

        let label = m.time || `П${idx + 1}`;
        if (getMT) {
          try {
            const tInfo = getMT(m);
            if (tInfo && tInfo.name) {
              label = m.time ? `${tInfo.name.substring(0, 1)} ${m.time}` : tInfo.name;
            }
          } catch (e) { }
        }

        mealRowsDesktop.push(
          React.createElement('tr', { key: `md-${idx}`, className: 'meal-summary-row', style: { opacity: 0.85, fontSize: '0.95em' } },
            React.createElement('td', null, ''),
            React.createElement('td', null, ''),
            per100Head.map((_, i) => i === per100Head.length - 1
              ? React.createElement('td', { key: `m-${idx}-L${i}`, style: { textAlign: 'right', paddingRight: '6px', whiteSpace: 'nowrap', color: '#6b7280' }, title: 'Приём пищи' }, label)
              : React.createElement('td', { key: `m-${idx}-ph${i}` }, '')),
            factKeys.map(k => {
              const f = +(mt[k] || 0);
              return React.createElement('td', { key: `m-${idx}-${k}`, style: getProblemStyle(k, f, mt) }, fmtVal(k, f));
            }),
            React.createElement('td', null, '')
          )
        );

        let shortLabel = label.length > 5 ? label.substring(0, 5) : label;
        if (m.time) shortLabel = m.time;

        mealRowsMobile.push(
          React.createElement('div', { key: `mm-${idx}`, className: 'mds-row mds-meal-row', style: { opacity: 0.9, borderBottom: '1px dashed rgba(0,0,0,0.05)' } },
            React.createElement('span', { className: 'mds-label', style: { fontSize: '0.85em', color: '#6b7280' }, title: label }, shortLabel),
            React.createElement('span', { style: getProblemStyle('kcal', mt.kcal, mt) }, Math.round(mt.kcal || 0)),
            React.createElement('span', { style: getProblemStyle('carbs', mt.carbs, mt) }, Math.round(mt.carbs || 0)),
            React.createElement('span', { className: 'mds-dim' },
              React.createElement('span', { style: getProblemStyle('simple', mt.simple, mt) }, pct(mt.simple, mt.carbs)),
              '/',
              React.createElement('span', { style: getProblemStyle('complex', mt.complex, mt) }, pct(mt.complex, mt.carbs))
            ),
            React.createElement('span', { style: getProblemStyle('prot', mt.prot, mt) }, Math.round(mt.prot || 0)),
            React.createElement('span', { style: getProblemStyle('fat', mt.fat, mt) }, Math.round(mt.fat || 0)),
            React.createElement('span', { className: 'mds-dim' },
              React.createElement('span', { style: getProblemStyle('bad', mt.bad, mt) }, pct(mt.bad, mt.fat)),
              '/',
              React.createElement('span', { style: getProblemStyle('good', mt.good, mt) }, pct(mt.good, mt.fat)),
              '/',
              React.createElement('span', { style: getProblemStyle('trans', mt.trans, mt) }, pct(mt.trans, mt.fat))
            ),
            React.createElement('span', { style: getProblemStyle('fiber', mt.fiber, mt) }, Math.round(mt.fiber || 0)),
            React.createElement('span', { style: getProblemStyle('gi', mt.gi, mt) }, Math.round(mt.gi || 0)),
            React.createElement('span', { style: getProblemStyle('harm', mt.harm, mt) }, fmtVal('harm', mt.harm || 0))
          )
        );
      });
    }

    return React.createElement('div', { className: 'card tone-slate', style: { marginTop: '8px', overflowX: 'auto' } },
      React.createElement('div', { className: 'section-title', style: { marginBottom: '4px' } }, 'СУТОЧНЫЕ ИТОГИ'),
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
          React.createElement('tr', null,
            React.createElement('td', null, ''),
            React.createElement('td', null, ''),
            per100Head.map((_, i) => i === per100Head.length - 1 ? React.createElement('td', { key: 'ds-pvL' + i, style: { fontWeight: 600, textAlign: 'right', paddingRight: '6px' }, title: 'Факт' }, 'Ф') : React.createElement('td', { key: 'ds-pv' + i }, '')),
            factKeys.map(k => factCell(k)),
            React.createElement('td', null, '')
          ),
          // Норма
          React.createElement('tr', null,
            React.createElement('td', null, ''),
            React.createElement('td', null, ''),
            per100Head.map((_, i) => i === per100Head.length - 1 ? React.createElement('td', { key: 'ds-npL' + i, style: { fontWeight: 600, textAlign: 'right', paddingRight: '6px' }, title: 'Норма' }, 'Н') : React.createElement('td', { key: 'ds-np' + i }, '')),
            factKeys.map(k => React.createElement('td', { key: 'ds-nv' + k }, normVal(k))),
            React.createElement('td', null, '')
          ),
          // Откл
          React.createElement('tr', { className: 'daily-dev-row' },
            React.createElement('td', null, ''),
            React.createElement('td', null, ''),
            per100Head.map((_, i) => i === per100Head.length - 1 ? React.createElement('td', { key: 'ds-dpL' + i, style: { fontWeight: 600, textAlign: 'right', paddingRight: '6px' }, title: 'Отклонение' }, 'Δ') : React.createElement('td', { key: 'ds-dp' + i }, '')),
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
          React.createElement('span', null, 'У'),
          React.createElement('span', { className: 'mds-dim' }, 'пр/сл'),
          React.createElement('span', null, 'Б'),
          React.createElement('span', null, 'Ж'),
          React.createElement('span', { className: 'mds-dim' }, 'вр/пол/суп'),
          React.createElement('span', null, 'Кл'),
          React.createElement('span', null, 'ГИ'),
          React.createElement('span', null, 'Вр')
        ),
        ...mealRowsMobile,
        // Fact row - с цветовой индикацией относительно нормы
        React.createElement('div', { className: 'mds-row' },
          React.createElement('span', { className: 'mds-label', title: 'Факт' }, 'Ф'),
          React.createElement('span', { title: getDailyNutrientTooltip('kcal', dayTot.kcal, normAbs.kcal), style: { color: getDailyNutrientColor('kcal', dayTot.kcal, normAbs.kcal), fontWeight: getDailyNutrientColor('kcal', dayTot.kcal, normAbs.kcal) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.kcal)),
          React.createElement('span', { title: getDailyNutrientTooltip('carbs', dayTot.carbs, normAbs.carbs), style: { color: getDailyNutrientColor('carbs', dayTot.carbs, normAbs.carbs), fontWeight: getDailyNutrientColor('carbs', dayTot.carbs, normAbs.carbs) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.carbs)),
          React.createElement('span', { className: 'mds-dim' },
            React.createElement('span', { title: getDailyNutrientTooltip('simple', dayTot.simple, normAbs.simple), style: { color: getDailyNutrientColor('simple', dayTot.simple, normAbs.simple), fontWeight: getDailyNutrientColor('simple', dayTot.simple, normAbs.simple) ? 600 : 400, cursor: 'help' } }, pct(dayTot.simple, dayTot.carbs)),
            '/',
            React.createElement('span', { title: getDailyNutrientTooltip('complex', dayTot.complex, normAbs.complex), style: { color: getDailyNutrientColor('complex', dayTot.complex, normAbs.complex), cursor: 'help' } }, pct(dayTot.complex, dayTot.carbs))
          ),
          React.createElement('span', { title: getDailyNutrientTooltip('prot', dayTot.prot, normAbs.prot), style: { color: getDailyNutrientColor('prot', dayTot.prot, normAbs.prot), fontWeight: getDailyNutrientColor('prot', dayTot.prot, normAbs.prot) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.prot)),
          React.createElement('span', { title: getDailyNutrientTooltip('fat', dayTot.fat, normAbs.fat), style: { color: getDailyNutrientColor('fat', dayTot.fat, normAbs.fat), fontWeight: getDailyNutrientColor('fat', dayTot.fat, normAbs.fat) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.fat)),
          React.createElement('span', { className: 'mds-dim' },
            React.createElement('span', { title: getDailyNutrientTooltip('bad', dayTot.bad, normAbs.bad), style: { color: getDailyNutrientColor('bad', dayTot.bad, normAbs.bad), fontWeight: getDailyNutrientColor('bad', dayTot.bad, normAbs.bad) ? 600 : 400, cursor: 'help' } }, pct(dayTot.bad, dayTot.fat)),
            '/',
            React.createElement('span', { title: getDailyNutrientTooltip('good', dayTot.good, normAbs.good), style: { color: getDailyNutrientColor('good', dayTot.good, normAbs.good), fontWeight: getDailyNutrientColor('good', dayTot.good, normAbs.good) ? 600 : 400, cursor: 'help' } }, pct(dayTot.good, dayTot.fat)),
            '/',
            React.createElement('span', { title: getDailyNutrientTooltip('trans', dayTot.trans, normAbs.trans), style: { color: getDailyNutrientColor('trans', dayTot.trans, normAbs.trans), fontWeight: getDailyNutrientColor('trans', dayTot.trans, normAbs.trans) ? 600 : 400, cursor: 'help' } }, pct(dayTot.trans || 0, dayTot.fat))
          ),
          React.createElement('span', { title: getDailyNutrientTooltip('fiber', dayTot.fiber, normAbs.fiber), style: { color: getDailyNutrientColor('fiber', dayTot.fiber, normAbs.fiber), fontWeight: getDailyNutrientColor('fiber', dayTot.fiber, normAbs.fiber) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.fiber)),
          React.createElement('span', { title: getDailyNutrientTooltip('gi', dayTot.gi, normAbs.gi), style: { color: getDailyNutrientColor('gi', dayTot.gi, normAbs.gi), fontWeight: getDailyNutrientColor('gi', dayTot.gi, normAbs.gi) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.gi || 0)),
          React.createElement('span', { title: getDailyNutrientTooltip('harm', dayTot.harm, normAbs.harm), style: { color: getDailyNutrientColor('harm', dayTot.harm, normAbs.harm), fontWeight: getDailyNutrientColor('harm', dayTot.harm, normAbs.harm) ? 600 : 400, cursor: 'help' } }, fmtVal('harm', dayTot.harm || 0))
        ),
        // Norm row
        React.createElement('div', { className: 'mds-row' },
          React.createElement('span', { className: 'mds-label', title: 'Норма' }, 'Н'),
          React.createElement('span', null, Math.round(normAbs.kcal || 0)),
          React.createElement('span', null, Math.round(normAbs.carbs || 0)),
          React.createElement('span', { className: 'mds-dim' }, pct(normAbs.simple || 0, normAbs.carbs || 1) + '/' + pct(normAbs.complex || 0, normAbs.carbs || 1)),
          React.createElement('span', null, Math.round(normAbs.prot || 0)),
          React.createElement('span', null, Math.round(normAbs.fat || 0)),
          React.createElement('span', { className: 'mds-dim' }, pct(normAbs.bad || 0, normAbs.fat || 1) + '/' + pct(normAbs.good || 0, normAbs.fat || 1) + '/' + pct(normAbs.trans || 0, normAbs.fat || 1)),
          React.createElement('span', null, Math.round(normAbs.fiber || 0)),
          React.createElement('span', null, Math.round(normAbs.gi || 0)),
          React.createElement('span', null, fmtVal('harm', normAbs.harm || 0))
        ),
        // Deviation row - custom layout matching header columns
        React.createElement('div', { className: 'mds-row mds-dev' },
          React.createElement('span', { className: 'mds-label', title: 'Отклонение' }, 'Δ'),
          // kcal
          (() => { const n = normAbs.kcal || 0, f = dayTot.kcal || 0; if (!n) return React.createElement('span', { key: 'dev-kcal' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-kcal', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // carbs
          (() => { const n = normAbs.carbs || 0, f = dayTot.carbs || 0; if (!n) return React.createElement('span', { key: 'dev-carbs' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-carbs', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // simple/complex (combined)
          (() => {
            const ns = normAbs.simple || 0, fs = dayTot.simple || 0;
            const nc = normAbs.complex || 0, fc = dayTot.complex || 0;
            const ds = ns ? Math.round(((fs - ns) / ns) * 100) : 0;
            const dc = nc ? Math.round(((fc - nc) / nc) * 100) : 0;
            const cs = ds > 0 ? '#dc2626' : ds < 0 ? '#059669' : '#6b7280';
            const cc = dc > 0 ? '#dc2626' : dc < 0 ? '#059669' : '#6b7280';
            return React.createElement('span', { key: 'dev-sc', className: 'mds-dim' },
              React.createElement('span', { style: { color: cs } }, (ds > 0 ? '+' : '') + ds),
              '/',
              React.createElement('span', { style: { color: cc } }, (dc > 0 ? '+' : '') + dc)
            );
          })(),
          // prot
          (() => { const n = normAbs.prot || 0, f = dayTot.prot || 0; if (!n) return React.createElement('span', { key: 'dev-prot' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-prot', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // fat
          (() => { const n = normAbs.fat || 0, f = dayTot.fat || 0; if (!n) return React.createElement('span', { key: 'dev-fat' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-fat', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // bad/good/trans (combined)
          (() => {
            const nb = normAbs.bad || 0, fb = dayTot.bad || 0;
            const ng = normAbs.good || 0, fg = dayTot.good || 0;
            const nt = normAbs.trans || 0, ft = dayTot.trans || 0;
            const db = nb ? Math.round(((fb - nb) / nb) * 100) : 0;
            const dg = ng ? Math.round(((fg - ng) / ng) * 100) : 0;
            const dt = nt ? Math.round(((ft - nt) / nt) * 100) : 0;
            const cb = db > 0 ? '#dc2626' : db < 0 ? '#059669' : '#6b7280';
            const cg = dg > 0 ? '#dc2626' : dg < 0 ? '#059669' : '#6b7280';
            const ct = dt > 0 ? '#dc2626' : dt < 0 ? '#059669' : '#6b7280';
            return React.createElement('span', { key: 'dev-bgt', className: 'mds-dim' },
              React.createElement('span', { style: { color: cb } }, (db > 0 ? '+' : '') + db),
              '/',
              React.createElement('span', { style: { color: cg } }, (dg > 0 ? '+' : '') + dg),
              '/',
              React.createElement('span', { style: { color: ct } }, (dt > 0 ? '+' : '') + dt)
            );
          })(),
          // fiber
          (() => { const n = normAbs.fiber || 0, f = dayTot.fiber || 0; if (!n) return React.createElement('span', { key: 'dev-fiber' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-fiber', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // gi
          (() => { const n = normAbs.gi || 0, f = dayTot.gi || 0; if (!n) return React.createElement('span', { key: 'dev-gi' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-gi', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // harm
          (() => { const n = normAbs.harm || 0, f = dayTot.harm || 0; if (!n) return React.createElement('span', { key: 'dev-harm' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-harm', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })()
        )
      )
    );
  }

  HEYS.dayDailySummary = {
    renderDailySummary
  };
})(window);
