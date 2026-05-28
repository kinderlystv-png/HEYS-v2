// heys_day_activity_v1.js — Activity tracking card component
// Extracted from heys_day_v12.js (PR-2: Step 2/2)
// Renders steps slider, household activities, and training blocks

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  const MA_ZONE_SIGS_MONTH = new Set(['8,0,0,0', '8,6,0,0', '4,8,8,2']);

  const MA_SKIP_REASON_LABEL_FALLBACK = {
    no_time: 'Не было времени',
    low_mood: 'Плохое настроение или самочувствие',
    low_energy: 'Мало сил и энергии',
    other_priority: 'Были другие приоритеты',
    other: 'Другая причина'
  };

  function trainingZoneSigMonth(training) {
    const z = Array.isArray(training?.z) ? training.z : [];
    return [0, 1, 2, 3].map((i) => Number(z[i]) || 0).join(',');
  }

  function isMorningActivationTrainingMonth(training) {
    if (!training || typeof training !== 'object') return false;
    if (training.source === 'morning_activation') return true;
    const label = typeof training.activityLabel === 'string' ? training.activityLabel.trim().toLowerCase() : '';
    if (label === 'зарядка') return true;
    if (String(training.type) === 'strength' && MA_ZONE_SIGS_MONTH.has(trainingZoneSigMonth(training))) {
      const raw = typeof training.activityLabel === 'string' ? training.activityLabel.trim() : '';
      if (!raw) return true;
    }
    return false;
  }

  function getTrainingDisplayLabelMonth(training, trainingType, index) {
    if (isMorningActivationTrainingMonth(training)) return 'Зарядка';
    const customLabel = typeof training?.activityLabel === 'string'
      ? training.activityLabel.trim()
      : '';
    return customLabel || trainingType?.label || ('Тренировка ' + (index + 1));
  }

  function isTrainingSlotUsedMonth(t) {
    if (!t || typeof t !== 'object') return false;
    if (t.source === 'morning_activation') return true;
    const z = Array.isArray(t.z) ? t.z : [];
    if (z.some((m) => Number(m) > 0)) return true;
    if (t.type && String(t.type).trim() !== '') return true;
    return false;
  }

  function trainingKcalFromZones(tr, kcalMin, r0) {
    const z = tr.z || [0, 0, 0, 0];
    return z.reduce((s, min, i) => s + r0((+min || 0) * (kcalMin[i] || 0)), 0);
  }

  /**
   * Собирает строки для блока «тренировки за 30 дней» (чтение дней из localStorage).
   * Утреннюю зарядку (charge / morning_activation) не включаем — она в календаре зарядки выше.
   * @returns {Array<{ dateKey: string, dateLine: string, typeLabel: string, kcal: number }>}
   */
  function collectMonthTrainingRows(params) {
    const {
      lsGet,
      kcalMin = [0, 0, 0, 0],
      trainingTypes = [],
      r0: r0In,
      formatDateDisplay,
      todayISO,
      parseISO,
      fmtDate
    } = params || {};
    const r0 = typeof r0In === 'function' ? r0In : (v) => Math.round(v || 0);
    if (typeof lsGet !== 'function' || typeof todayISO !== 'function' || typeof parseISO !== 'function' || typeof fmtDate !== 'function' || typeof formatDateDisplay !== 'function') {
      return [];
    }
    const safeTypes = Array.isArray(trainingTypes) ? trainingTypes : [];
    const rows = [];
    const endD = parseISO(todayISO());
    if (!endD || isNaN(endD.getTime())) return [];

    for (let i = 0; i < 30; i++) {
      const d = new Date(endD);
      d.setDate(d.getDate() - i);
      const dateKey = fmtDate(d);
      // Логический ключ «heys_dayv2_DATE»: HEYS.utils.lsGet сам добавит clientId (nsKey).
      // Нельзя передавать уже префиксованный heys_${cid}_dayv2_ — получится двойной clientId и null.
      const stored = lsGet('heys_dayv2_' + dateKey, null);
      if (!stored || typeof stored !== 'object') continue;
      const trainings = Array.isArray(stored.trainings) ? stored.trainings : [];
      for (let ti = 0; ti < trainings.length; ti++) {
        const tr = trainings[ti];
        if (!isTrainingSlotUsedMonth(tr)) continue;
        if (isMorningActivationTrainingMonth(tr)) continue;
        const trainingType = safeTypes.find((item) => item.id === tr.type);
        const typeLabel = getTrainingDisplayLabelMonth(tr, trainingType, ti);
        const kcal = trainingKcalFromZones(tr, kcalMin, r0);
        const fd = formatDateDisplay(dateKey);
        const dateLine = fd
          ? (fd.sub ? fd.label + ' · ' + fd.sub : fd.label)
          : dateKey;
        rows.push({ dateKey, dateLine, typeLabel, kcal });
      }
    }
    return rows;
  }

  /**
   * Render activity card
   * @param {Object} params - Render parameters
   * @param {Object} params.React - React reference
   * @param {Object} params.ctx - Context data (day, prof, steps, trainings, etc.)
   * @param {Object} params.actions - Action handlers
   * @returns {ReactElement} Activity card element
   */
  function renderActivityCard({ React, ctx, actions }) {
    const {
      day,
      prof,
      stepsValue,
      stepsGoal,
      stepsPercent,
      stepsColor,
      stepsK,
      bmr,
      householdK,
      totalHouseholdMin,
      householdActivities,
      train1k,
      train2k,
      r0,
      visibleTrainings,
      trainingsBlock,
      ndteData,
      ndteBoostKcal,
      tefData,
      tefKcal,
      dayTargetDef,
      displayOptimum,
      tdee,
      caloricDebt,
      monthTrainingsRows,
      morningActivationCalendarBlock
    } = ctx;
    const safeR0 = typeof r0 === 'function' ? r0 : (v) => Math.round(v || 0);
    const {
      setDay,
      haptic,
      setMetricPopup,
      setTefInfoPopup,
      openStepsGoalPicker,
      handleStepsDrag,
      openHouseholdPicker,
      openTrainingPicker
    } = actions;

    const hasMorningActivationDone = (() => {
      if (day?.morningActivation?.status === 'done') return true;
      const trainings = Array.isArray(day?.trainings) ? day.trainings : [];
      if (trainings.some((t) => t && t.source === 'morning_activation')) return true;
      const household = Array.isArray(day?.householdActivities) ? day.householdActivities : [];
      if (household.some((h) => h && h.source === 'morning_activation')) return true;
      return false;
    })();

    const showMaSkippedChargeNotice = day?.morningActivation?.status === 'missed' && !hasMorningActivationDone;
    const maSkipReasonSubtitle = (() => {
      const id = day?.morningActivation?.skipReasonId;
      if (!id) return null;
      const list = HEYS.morningActivationSkipReasons;
      if (Array.isArray(list) && list.length) {
        const row = list.find((x) => x && x.id === id);
        if (row) return row.label;
      }
      return MA_SKIP_REASON_LABEL_FALLBACK[id] || null;
    })();

    const openMorningActivationQuickAdd = () => {
      const dateKey = day?.date || day?.dateKey || (HEYS.StepModal?.utils?.getTodayKey?.() || new Date().toISOString().slice(0, 10));
      if (HEYS.StepModal?.show && HEYS.StepModal?.registry?.morning_activation_followup) {
        HEYS.StepModal.show({
          steps: ['morning_activation_followup'],
          title: 'Утренняя зарядка',
          showProgress: false,
          showStreak: false,
          showGreeting: false,
          showTip: false,
          allowSwipe: false,
          context: { dateKey }
        });
        return;
      }
      openTrainingPicker?.(visibleTrainings || 0);
    };

    return React.createElement('div', { className: 'compact-activity compact-card widget-shadow-diary-glass widget-outline-diary-glass' },
      React.createElement('div', { className: 'compact-card-header' }, '📏 АКТИВНОСТЬ'),

      // Слайдер шагов с зоной защиты от свайпа
      React.createElement('div', { className: 'steps-slider-container no-swipe-zone' },
        React.createElement('div', { className: 'steps-slider-header' },
          React.createElement('span', { className: 'steps-label' }, '👟 Шаги'),
          React.createElement('span', { className: 'steps-value' },
            // Фактические шаги — кликабельные с подсказкой
            React.createElement('span', {
              onClick: (e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setMetricPopup({
                  type: 'steps',
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  data: {
                    value: stepsValue,
                    goal: stepsGoal,
                    ratio: stepsValue / stepsGoal,
                    kcal: stepsK,
                    color: stepsColor
                  }
                });
                haptic('light');
              },
              style: { cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' },
              title: 'Нажмите для подробностей'
            },
              React.createElement('b', { style: { color: stepsColor } }, stepsValue.toLocaleString())
            ),
            ' / ',
            // Цель шагов — с кнопкой редактирования
            React.createElement('span', {
              onClick: (e) => {
                e.stopPropagation();
                openStepsGoalPicker();
                haptic('light');
              },
              style: { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' },
              title: 'Изменить цель'
            },
              React.createElement('b', { className: 'steps-goal' }, stepsGoal.toLocaleString()),
              React.createElement('span', { style: { fontSize: '12px', opacity: 0.7 } }, '✏️')
            ),
            React.createElement('span', { className: 'steps-kcal-hint' }, ' / ' + stepsK + ' ккал')
          )
        ),
        React.createElement('div', {
          className: 'steps-slider'
        },
          React.createElement('div', { className: 'steps-slider-track' }),
          React.createElement('div', { className: 'steps-slider-goal-mark', style: { left: '80%' } },
            React.createElement('span', { className: 'steps-goal-label' }, String(stepsGoal))
          ),
          React.createElement('div', {
            className: 'steps-slider-fill',
            style: { width: stepsPercent + '%', background: stepsColor }
          }),
          React.createElement('div', {
            className: 'steps-slider-thumb',
            style: { left: stepsPercent + '%', borderColor: stepsColor },
            onMouseDown: handleStepsDrag,
            onTouchStart: handleStepsDrag
          })
        )
      ),

      // Ряд: Формула расчёта + Бытовая активность
      React.createElement('div', { className: 'activity-cards-row' },
        // Плашка с формулой расчёта
        React.createElement('div', { className: 'formula-card widget-shadow-diary-glass widget-outline-diary-glass' },
          React.createElement('div', { className: 'formula-card-header' },
            React.createElement('span', { className: 'formula-card-icon' }, '📊'),
            React.createElement('span', { className: 'formula-card-title' }, 'Расчёт калорий')
          ),
          React.createElement('div', { className: 'formula-card-rows' },
            React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, 'BMR'),
              React.createElement('span', { className: 'formula-value' }, bmr)
            ),
            React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, '+ Шаги'),
              React.createElement('span', { className: 'formula-value' }, stepsK)
            ),
            householdK > 0 && React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, '+ Быт'),
              React.createElement('span', { className: 'formula-value' }, householdK)
            ),
            (train1k + train2k > 0) && React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, '+ Тренировки'),
              React.createElement('span', { className: 'formula-value' }, safeR0(train1k + train2k))
            ),
            // 🆕 v3.7.0: NDTE — эффект вчерашней тренировки
            ndteData.active && ndteBoostKcal > 0 && React.createElement('div', { className: 'formula-row ndte-row' },
              React.createElement('span', { className: 'formula-label' },
                React.createElement('span', { style: { marginRight: '4px' } }, '🔥'),
                'Тренировка вчера'
              ),
              React.createElement('span', { className: 'formula-value ndte-value' }, '+' + ndteBoostKcal)
            ),
            // 🔬 TEF v1.0.0: Затраты на переваривание пищи
            tefKcal > 0 && React.createElement('div', { className: 'formula-row tef-row' },
              React.createElement('span', { className: 'formula-label', title: tefData.breakdown ? `Б: ${tefData.breakdown.protein} | У: ${tefData.breakdown.carbs} | Ж: ${tefData.breakdown.fat}` : '' },
                React.createElement('span', { style: { marginRight: '4px' } }, '🔥'),
                '+ TEF',
                // Иконка "?" для открытия popup с научной информацией
                React.createElement('span', {
                  className: 'tef-help-icon',
                  onClick: (e) => {
                    e.stopPropagation();
                    const rect = e.target.getBoundingClientRect();
                    const pos = { x: rect.left + rect.width / 2, y: rect.bottom };
                    // 2026-05-28: dropped startTransition wrapper (transition discarded в курaторе)
                    setTefInfoPopup(pos);
                  },
                  style: {
                    marginLeft: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: 'rgba(100, 116, 139, 0.15)',
                    color: '#64748b',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }
                }, '?')
              ),
              React.createElement('span', { className: 'formula-value tef-value' }, tefKcal)
            ),
            React.createElement('div', { className: 'formula-row formula-subtotal' },
              React.createElement('span', { className: 'formula-label' }, '= Затраты'),
              React.createElement('span', { className: 'formula-value' }, tdee)
            ),
            dayTargetDef !== 0 && React.createElement('div', { className: 'formula-row' + (dayTargetDef < 0 ? ' deficit' : ' surplus') },
              React.createElement('span', { className: 'formula-label' }, dayTargetDef < 0 ? 'Дефицит' : 'Профицит'),
              React.createElement('span', { className: 'formula-value' }, (dayTargetDef > 0 ? '+' : '') + dayTargetDef + '%')
            ),
            // 💰 Калорийный долг (если есть) — показываем всегда для информации
            caloricDebt?.dailyBoost > 0 && React.createElement('div', { className: 'formula-row debt-row' },
              React.createElement('span', { className: 'formula-label' },
                React.createElement('span', { style: { marginRight: '4px' } }, '💰'),
                'Долг'
              ),
              // При refeed долг показываем серым (не добавляется к цели)
              React.createElement('span', { className: 'formula-value', style: { color: day.isRefeedDay ? '#9ca3af' : '#22c55e' } },
                (day.isRefeedDay ? '(' : '+') + caloricDebt.dailyBoost + (day.isRefeedDay ? ')' : '')
              )
            ),
            // 🍕 Refeed day boost (Загрузка)
            day.isRefeedDay && React.createElement('div', { className: 'formula-row refeed-row' },
              React.createElement('span', { className: 'formula-label' },
                React.createElement('span', { style: { marginRight: '4px' } }, '🍕'),
                'Загрузка'
              ),
              React.createElement('span', { className: 'formula-value', style: { color: '#f97316' } }, '+35%')
            ),
            React.createElement('div', { className: 'formula-row formula-total' },
              React.createElement('span', { className: 'formula-label' }, 'Цель'),
              React.createElement('span', { className: 'formula-value' }, displayOptimum)
            )
          )
        ),
        // Правая колонка: бытовая активность + кнопка тренировки
        React.createElement('div', { className: 'activity-right-col' },
          // Бытовая активность - клик открывает статистику
          React.createElement('div', {
            className: 'household-activity-card clickable widget-shadow-diary-glass widget-outline-diary-glass',
            onClick: () => openHouseholdPicker('stats') // Открывает статистику
          },
            React.createElement('div', { className: 'household-activity-header' },
              React.createElement('span', { className: 'household-activity-icon' }, '🏠'),
              React.createElement('span', { className: 'household-activity-title' }, 'Бытовая активность'),
              householdActivities.length > 0 && React.createElement('span', { className: 'household-count-badge' }, householdActivities.length)
            ),
            React.createElement('div', { className: 'household-activity-value' },
              React.createElement('span', { className: 'household-value-number' }, totalHouseholdMin),
              React.createElement('span', { className: 'household-value-unit' }, 'мин')
            ),
            React.createElement('span', { className: 'household-stats-link' },
              React.createElement('span', { className: 'household-help-icon' }, '?'),
              ' подробнее'
            ),
            householdK > 0 && React.createElement('div', { className: 'household-value-kcal' }, '→ ' + householdK + ' ккал'),
            // Кнопка добавления внутри карточки
            React.createElement('button', {
              className: 'household-add-btn',
              onClick: (e) => {
                e.stopPropagation(); // Не открывать stats
                openHouseholdPicker('add'); // Только ввод
              }
            }, '+ Добавить')
          ),
          React.createElement('div', {
            style: {
              display: 'flex',
              gap: '6px',
              alignItems: 'stretch',
              marginTop: '6px'
            }
          },
            // Кнопка добавления тренировки
            visibleTrainings < 3 && React.createElement('button', {
              className: 'add-training-btn',
              onClick: () => {
                const newIndex = visibleTrainings;
                // НЕ увеличиваем visibleTrainings сразу —
                // он обновится автоматически когда тренировка сохранится
                openTrainingPicker(newIndex);
              },
              style: {
                flex: hasMorningActivationDone ? '1 1 100%' : '1 1 auto',
                minWidth: 0,
                padding: hasMorningActivationDone ? '14px 12px' : '12px 10px'
              }
            }, '+ Тренировка'),
            !hasMorningActivationDone && React.createElement('button', {
              className: 'add-training-btn add-charge-btn',
              type: 'button',
              onClick: openMorningActivationQuickAdd,
              title: 'Добавить зарядку'
            }, '⚡🔋')
          )
        )
      ),

      showMaSkippedChargeNotice && React.createElement('div', {
        className: 'ma-skip-notice-card compact-card widget-shadow-diary-glass widget-outline-diary-glass',
        role: 'status'
      },
      React.createElement('div', { className: 'ma-skip-notice-row' },
        React.createElement('span', { className: 'ma-skip-notice-icon', 'aria-hidden': 'true' }, '⚡'),
        React.createElement('div', { className: 'ma-skip-notice-text' },
          React.createElement('div', { className: 'ma-skip-notice-title' }, 'Зарядка сегодня не в плане'),
          React.createElement('div', { className: 'ma-skip-notice-sub' },
            maSkipReasonSubtitle
              ? maSkipReasonSubtitle
              : (day?.morningActivation?.skipReasonPending
                ? 'После добавления продукта в приём можно коротко отметить причину.'
                : 'Ты отметил(а), что зарядку сегодня не планируешь.')
          )
        )
      )
      ),

      // Тренировки — компактные
      trainingsBlock,

      morningActivationCalendarBlock,

      // Тренировки за последние 30 дней (сводка)
      React.createElement('div', { className: 'month-trainings-card compact-card widget-shadow-diary-glass widget-outline-diary-glass' },
        React.createElement('div', { className: 'month-trainings-card-header' },
          React.createElement('span', { className: 'month-trainings-card-title' }, '📋 Тренировки за 30 дней')
        ),
        (!Array.isArray(monthTrainingsRows) || monthTrainingsRows.length === 0)
          ? React.createElement('div', { className: 'month-trainings-empty' }, 'Нет тренировок за последние 30 дней')
          : React.createElement('div', { className: 'month-trainings-list' },
            monthTrainingsRows.map((row, ri) => React.createElement('div', {
              key: 'mtr-' + ri + '-' + row.dateKey,
              className: 'month-trainings-row'
            },
            React.createElement('span', { className: 'month-trainings-row-date' }, row.dateLine || row.dateKey),
            React.createElement('span', { className: 'month-trainings-row-type' }, row.typeLabel),
            React.createElement('span', { className: 'compact-badge train month-trainings-row-kcal' }, (row.kcal || 0) + ' ккал')
            ))
          )
      )
    );
  }

  // Export
  HEYS.dayActivity = {
    render: renderActivityCard,
    collectMonthTrainingRows
  };

})(window);
