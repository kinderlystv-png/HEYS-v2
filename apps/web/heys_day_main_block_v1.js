// heys_day_main_block_v1.js — main violet block (DayTab)
(function () {
  if (!window.HEYS) window.HEYS = {};

  const MOD = {};

  MOD.renderMainBlock = function renderMainBlock(params) {
    const {
      React,
      day,
      tdee,
      ndteData,
      ndteBoostKcal,
      ndteExpanded,
      setNdteExpanded,
      bmr,
      stepsK,
      train1k,
      train2k,
      householdK,
      actTotal,
      tefKcal,
      setTefInfoPopup,
      optimum,
      dayTargetDef,
      factDefPct,
      eatenKcal,
      getProfile,
      setDay,
      r0,
      cycleKcalMultiplier
    } = params || {};

    if (!React) return null;

    return React.createElement('div', { className: 'area-main card tone-violet main-violet', id: 'main-violet-block', style: { overflow: 'hidden' } },
      React.createElement('table', { className: 'violet-table' },
        React.createElement('colgroup', null, [
          React.createElement('col', { key: 'main-col-0', style: { width: '40%' } }),
          React.createElement('col', { key: 'main-col-1', style: { width: '20%' } }),
          React.createElement('col', { key: 'main-col-2', style: { width: '20%' } }),
          React.createElement('col', { key: 'main-col-3', style: { width: '20%' } })
        ]),
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', null, ''),
            React.createElement('th', null, 'ккал.'),
            React.createElement('th', null, ''),
            React.createElement('th', null, '')
          )
        ),
        React.createElement('tbody', null,
          // Row 1 — Общие затраты
          React.createElement('tr', { className: 'vio-row total-kcal' },
            React.createElement('td', { className: 'label small' },
              React.createElement('strong', null, 'Общие затраты :'),
              // 🆕 v3.7.0: Интерактивный NDTE badge с expand/countdown
              window.HEYS?.InsulinWave?.renderNDTEBadge &&
              window.HEYS.InsulinWave.renderNDTEBadge(ndteData, ndteBoostKcal, ndteExpanded, () => setNdteExpanded(prev => !prev))
            ),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: tdee, disabled: true })),
            React.createElement('td', null, ''),
            React.createElement('td', null, '')
          ),
          // Row 2 — BMR + вес
          React.createElement('tr', null,
            React.createElement('td', { className: 'label small' }, 'BMR :'),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: bmr, disabled: true })),
            React.createElement('td', null, React.createElement('input', {
              type: 'number',
              step: '0.1',
              value: day?.weightMorning ? Math.round(day.weightMorning * 10) / 10 : '',
              onChange: e => {
                const newWeight = +e.target.value || '';
                const prof = getProfile ? getProfile() : {};
                // Если раньше вес был пустой и сейчас вводится первый раз, подставляем целевой дефицит из профиля
                if (!setDay) return;
                setDay(prevDay => {
                  const shouldSetDeficit = (!prevDay.weightMorning || prevDay.weightMorning === '') && newWeight && (!prevDay.deficitPct && prevDay.deficitPct !== 0);
                  return {
                    ...prevDay,
                    weightMorning: newWeight,
                    deficitPct: shouldSetDeficit ? (Number(prof.deficitPctTarget) || 0) : prevDay.deficitPct
                  };
                });
              }
            })),
            React.createElement('td', null, 'вес на утро')
          ),
          // Row 3 — Шаги (ккал считаем из stepsK)
          React.createElement('tr', null,
            React.createElement('td', { className: 'label muted small' }, 'Шаги :'),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: stepsK, disabled: true, title: 'ккал от шагов' })),
            React.createElement('td', null, React.createElement('input', {
              type: 'number',
              value: day?.steps || 0,
              onChange: e => setDay && setDay(prev => ({ ...prev, steps: +e.target.value || 0, updatedAt: Date.now() }))
            })),
            React.createElement('td', null, 'шагов')
          ),
          // Row 4 — Тренировки
          React.createElement('tr', null,
            React.createElement('td', { className: 'label muted small' }, 'Тренировки :'),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: r0 ? r0(train1k + train2k) : (train1k + train2k), disabled: true })),
            React.createElement('td', null, ''),
            React.createElement('td', null, '')
          ),
          // Row 5 — Бытовая активность
          React.createElement('tr', null,
            React.createElement('td', { className: 'label muted small' }, 'Бытовая активность :'),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: householdK, disabled: true })),
            React.createElement('td', null, React.createElement('input', {
              type: 'number',
              value: day?.householdMin || 0,
              onChange: e => setDay && setDay(prev => ({ ...prev, householdMin: +e.target.value || 0, updatedAt: Date.now() }))
            })),
            React.createElement('td', null, 'мин')
          ),
          // Row 6 — Общая активность
          React.createElement('tr', null,
            React.createElement('td', { className: 'label muted small' }, React.createElement('strong', null, 'Общая активность :')),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: actTotal, disabled: true })),
            React.createElement('td', null, ''),
            React.createElement('td', null, '')
          ),
          // Row 7 — TEF (Термический эффект пищи) v1.0.0
          tefKcal > 0 && React.createElement('tr', null,
            React.createElement('td', { className: 'label muted small', title: 'Thermic Effect of Food — затраты на переваривание' },
              '🔥 Переваривание (TEF) :',
              React.createElement('span', {
                className: 'tef-help-icon',
                onClick: (e) => {
                  e.stopPropagation();
                  const rect = e.target.getBoundingClientRect();
                  const pos = { x: rect.left + rect.width / 2, y: rect.bottom };
                  // R24: defer popup setState to avoid sync DayTab re-render (188ms → ~0ms)
                  if (setTefInfoPopup) setTimeout(() => { React.startTransition(() => setTefInfoPopup(pos)); }, 0);
                },
                style: {
                  marginLeft: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: 'rgba(100,116,139,0.15)',
                  color: '#64748b',
                  fontSize: '9px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }
              }, '?')
            ),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: tefKcal, disabled: true })),
            React.createElement('td', null, ''),
            React.createElement('td', null, '')
          ),
          // Row 8 — Нужно съесть ккал + Целевой дефицит (редактируемый по дням)
          React.createElement('tr', { className: 'vio-row need-kcal' },
            React.createElement('td', { className: 'label small' },
              React.createElement('strong', null, 'Нужно съесть ккал :'),
              // Индикатор коррекции на цикл
              cycleKcalMultiplier > 1 && React.createElement('span', {
                style: { marginLeft: '6px', fontSize: '11px', color: '#ec4899' }
              }, '🌸 +' + Math.round((cycleKcalMultiplier - 1) * 100) + '%')
            ),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: optimum, disabled: true })),
            React.createElement('td', null, React.createElement('input', {
              type: 'number',
              value: day?.deficitPct || 0,
              onChange: e => setDay && setDay(prev => ({ ...prev, deficitPct: Number(e.target.value) || 0, updatedAt: Date.now() })),
              style: { width: '60px', textAlign: 'center', fontWeight: 600 }
            })),
            React.createElement('td', null, 'Целевой дефицит')
          ),
          // Row 7 — Съедено за день
          React.createElement('tr', { className: 'vio-row eaten-kcal' },
            React.createElement('td', { className: 'label small' }, React.createElement('strong', null, 'Съедено за день :')),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: r0 ? r0(eatenKcal) : eatenKcal, disabled: true })),
            React.createElement('td', null, ''),
            React.createElement('td', null, '')
          ),
          // Row 8 — Дефицит ФАКТ (фактический % от Общих затрат)
          React.createElement('tr', { className: 'dev-row' },
            (function () {
              const target = dayTargetDef; // используем целевой дефицит дня
              const fact = factDefPct; // отрицательно — хорошо если <= target
              const labelText = fact < target ? 'Дефицит ФАКТ :' : 'Профицит ФАКТ :';
              return React.createElement('td', { className: 'label small' }, labelText);
            })(),
            (function () {
              const target = dayTargetDef; // используем целевой дефицит дня
              const fact = factDefPct; // отрицательно — хорошо если <= target
              const good = fact <= target; // более глубокий дефицит (более отрицательно) чем целевой => зелёный
              const bg = good ? '#dcfce7' : '#fee2e2';
              const col = good ? '#065f46' : '#b91c1c';
              return React.createElement('td', null, React.createElement('input', { className: 'readOnly', disabled: true, value: (fact > 0 ? '+' : '') + fact + '%', style: { background: bg, color: col, fontWeight: 700, border: '1px solid ' + (good ? '#86efac' : '#fecaca') } }));
            })(),
            (function () {
              const target = dayTargetDef; // используем целевой дефицит дня
              const fact = factDefPct; // отрицательно — хорошо если <= target
              const good = fact <= target; // более глубокий дефицит (более отрицательно) чем целевой => зелёный
              const deficitKcal = eatenKcal - tdee; // отрицательно = дефицит, положительно = профицит
              const bg = good ? '#dcfce7' : '#fee2e2';
              const col = good ? '#065f46' : '#b91c1c';
              return React.createElement('td', null, React.createElement('input', { className: 'readOnly', disabled: true, value: (deficitKcal > 0 ? '+' : '') + Math.round(deficitKcal), style: { background: bg, color: col, fontWeight: 700, border: '1px solid ' + (good ? '#86efac' : '#fecaca') } }));
            })(),
            React.createElement('td', null, '')
          )
        )
      )
    );
  };

  window.HEYS.dayMainBlock = MOD;
})();
