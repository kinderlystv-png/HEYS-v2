// heys_day_activity_v1.js — Activity tab (v4 layout, stage 4)

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  const MA_ZONE_SIGS_MONTH = new Set(['8,0,0,0', '8,6,0,0', '4,8,8,2']);
  const MA_REPLACEMENT_FIRST_HALF_TRAINING = 'first_half_training';

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

  /**
   * Назначенное куратором, но не выполненное — не факт дня. Предикат
   * канонический (`TK.load.isNotPerformedTraining`), локальный фолбэк повторяет
   * тот же список статусов: порядок загрузки модулей не гарантирован.
   *
   * Тот же отсев уже делают TDEE (`trainingKcal` возвращает 0) и тоннаж
   * (`dayTonnage` пропускает план). Здесь его не было, и список «Тренировки за
   * месяц» показывал строки «0 ккал» за тренировки, которых не было
   * (разбор «Актив» 2026-08-30, дефект E).
   */
  const NOT_PERFORMED_PLAN_STATUSES = ['assigned', 'skipped', 'moved'];
  function isNotPerformedTrainingMonth(t) {
    const TK = HEYS.TrainingKernel;
    if (TK && TK.load && typeof TK.load.isNotPerformedTraining === 'function') {
      return !!TK.load.isNotPerformedTraining(t);
    }
    if (!t || !t.plan) return false;
    return NOT_PERFORMED_PLAN_STATUSES.indexOf(t.plan.status) !== -1;
  }

  function isTrainingSlotUsedMonth(t) {
    if (!t || typeof t !== 'object') return false;
    if (isNotPerformedTrainingMonth(t)) return false;
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

  function isMorningActivationTraining(training) {
    return isMorningActivationTrainingMonth(training);
  }

  function getChargeKcalToday(day, r0, kcalMin) {
    const trainings = Array.isArray(day?.trainings) ? day.trainings : [];
    const charge = trainings.find((t) => t && isMorningActivationTraining(t));
    if (!charge) return 0;
    return trainingKcalFromZones(charge, kcalMin || [0, 0, 0, 0], r0);
  }

  function getChargeTimeToday(day) {
    const trainings = Array.isArray(day?.trainings) ? day.trainings : [];
    const charge = trainings.find((t) => t && isMorningActivationTraining(t));
    if (charge?.time) return charge.time;
    const decidedAt = day?.morningActivation?.decidedAt;
    if (!decidedAt) return null;
    const d = new Date(decidedAt);
    if (Number.isNaN(d.getTime())) return null;
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function hasMorningActivationDone(day) {
    if (day?.morningActivation?.status === 'done') return true;
    const trainings = Array.isArray(day?.trainings) ? day.trainings : [];
    if (trainings.some((t) => t && t.source === 'morning_activation')) return true;
    const household = Array.isArray(day?.householdActivities) ? day.householdActivities : [];
    if (household.some((h) => h && h.source === 'morning_activation')) return true;
    return false;
  }

  function hasMorningActivationResolved(day) {
    const status = day?.morningActivation?.status;
    if (status === 'done' || status === 'planned' || status === 'skipped') return true;
    if (Number(day?.morningActivation?.checkinAnsweredAt) > 0) return true;
    return hasMorningActivationDone(day);
  }

  function formatMorningActivationRowValue(day, chargeTime, chargeKcal) {
    const status = day?.morningActivation?.status;
    if (status === 'planned') return 'сделаю';
    if (status === 'done' && !day?.morningActivation?.intensity && !(chargeKcal > 0)) {
      return chargeTime ? `${chargeTime} · была` : 'была';
    }
    if (chargeTime || chargeKcal > 0) {
      return `${chargeTime ? chargeTime + ' · ' : ''}${chargeKcal} ккал`;
    }
    if (status === 'done') return 'была';
    return 'не отмечено';
  }

  function formatDeficitLabel(dayTargetDef) {
    const pct = Number(dayTargetDef) || 0;
    if (pct === 0) return '';
    if (pct < 0) return '\u2212' + Math.abs(pct) + ' %';
    return '+' + pct + ' %';
  }

  function buildHeroFooterLabel(ctx) {
    const { dayTargetDef, day, caloricDebt, ndteBoostKcal } = ctx;
    if (day?.isRefeedDay) return 'день загрузки';
    if ((caloricDebt?.dailyBoost || 0) > 0) return 'компенсация долга';
    if ((caloricDebt?.dailyReduction || 0) > 0) return 'снижение по плану';
    if (ndteBoostKcal > 0) return 'буст после тренировки вчера';
    const def = formatDeficitLabel(dayTargetDef);
    return def
      ? 'от затрат без термического эффекта · ' + def
      : 'от затрат без термического эффекта';
  }

  /**
   * Причина уровня цели — ровно одна строка или ни одной.
   *
   * Долг, загрузка и снижение исключают друг друга по построению: в
   * `displayOptimum` это `if / else if / else` (heys_day_caloric_display_state.js).
   * Величина берётся как разница показанной цели и базовой — так строка всегда
   * сходится с числом под ней, чем бы поправка ни была посчитана
   * (контракт «причина уровня одна», строка 10).
   */
  function buildLevelReasonRow(ctx) {
    const { day, caloricDebt, optimum, displayOptimum, r0 } = ctx || {};
    const base = Number(optimum) || 0;
    const shown = Number(displayOptimum) || 0;
    const delta = (typeof r0 === 'function' ? r0(shown - base) : Math.round(shown - base));
    if (!base || !delta) return null;
    const signed = (delta > 0 ? '+' : '−') + Math.abs(delta);
    if (day && day.isRefeedDay) return { label: 'День загрузки', value: signed, tone: 'add' };
    if ((caloricDebt && caloricDebt.dailyBoost) > 0) {
      return { label: 'Компенсация долга', value: signed, tone: 'add' };
    }
    if ((caloricDebt && caloricDebt.dailyReduction) > 0) {
      return { label: 'Снижение по плану', value: signed, tone: 'aside' };
    }
    return { label: 'Поправка', value: signed, tone: delta > 0 ? 'add' : 'aside' };
  }

  function readHungerSummary(dateKey) {
    const Storage = HEYS.HungerEnergyStatusStorage;
    if (!Storage?.readEvents) return null;
    const rows = Storage.readEvents() || [];
    const todayRows = rows.filter((row) => {
      if (!row || typeof row !== 'object') return false;
      const at = row.recordedAt || row.at || row.createdAt;
      if (typeof at !== 'string') return false;
      return at.slice(0, 10) === dateKey;
    });
    if (!todayRows.length) return null;
    const last = todayRows[todayRows.length - 1];
    const hunger = last.hunger ?? last.hungerLevel ?? last.level;
    const energy = last.energy ?? last.energyLevel;
    if (Number.isFinite(hunger) && Number.isFinite(energy)) {
      return 'голод ' + hunger + ' · энергия ' + energy;
    }
    if (Number.isFinite(hunger)) return 'голод ' + hunger;
    if (Number.isFinite(energy)) return 'энергия ' + energy;
    if (typeof last.summary === 'string' && last.summary.trim()) return last.summary.trim();
    return 'отмечено';
  }

  function openMorningActivationQuickAdd(day, visibleTrainings, openTrainingPicker) {
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
  }

  /**
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

  function ActivityTabV4(props) {
    const { React, ctx, actions } = props;
    const { useState, useMemo } = React;
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
      train1k,
      train2k,
      train3k,
      r0,
      visibleTrainings,
      regularTrainingsBlock,
      ndteData,
      ndteBoostKcal,
      tefData,
      tefKcal,
      dayTargetDef,
      displayOptimum,
      optimum,
      cycleKcalMultiplier,
      tdee,
      caloricDebt,
      monthTrainingsRows,
      morningActivationCalendarBlock,
      kcalMin
    } = ctx;

    const safeR0 = typeof r0 === 'function' ? r0 : (v) => Math.round(v || 0);
    const {
      haptic,
      setMetricPopup,
      setTefInfoPopup,
      openStepsGoalPicker,
      handleStepsDrag,
      openHouseholdPicker,
      openTrainingPicker
    } = actions;

    const [heroOpen, setHeroOpen] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [cardioOpen, setCardioOpen] = useState(false);
    const [monthOpen, setMonthOpen] = useState(false);

    const dateKey = day?.date || day?.dateKey || '';
    const safeKcalMin = Array.isArray(kcalMin) && kcalMin.length === 4
      ? kcalMin
      : (HEYS.TDEE?.calculate?.(day, prof || {})?.kcalMin || [0, 0, 0, 0]);
    const baseExpenditure = safeR0((Number(tdee) || 0) - (Number(tefKcal) || 0));
    const chargeKcal = getChargeKcalToday(day, safeR0, safeKcalMin);
    const chargeTime = getChargeTimeToday(day);
    const chargeResolved = hasMorningActivationResolved(day);
    const chargeDone = hasMorningActivationDone(day);
    const chargePlanned = day?.morningActivation?.status === 'planned';
    const chargeRowValue = formatMorningActivationRowValue(day, chargeTime, chargeKcal);
    const hungerSummary = readHungerSummary(dateKey);

    const monthCount = Array.isArray(monthTrainingsRows) ? monthTrainingsRows.length : 0;
    // Слотов тренировок три, и третий тоже в затратах: без него столбик разбора
    // не сходился с «Затратами», а заголовок аккордеона занижал день
    // (разбор «Актив» 2026-08-30, дефект C).
    const cardioKcal = safeR0((train1k || 0) + (train2k || 0) + (train3k || 0));

    const calendarBlock = morningActivationCalendarBlock && React.isValidElement?.(morningActivationCalendarBlock)
      ? React.cloneElement(morningActivationCalendarBlock, {
        layoutClass: 'ma-habit-cal--activity-v4 ma-habit-cal--activity'
      })
      : morningActivationCalendarBlock;

    const pendingMarks = useMemo(() => {
      const items = [];
      if (!(totalHouseholdMin > 0)) items.push('быт');
      if (!chargeResolved) items.push('зарядка');
      if (!hungerSummary) items.push('голод');
      return items;
    }, [totalHouseholdMin, chargeResolved, hungerSummary]);

    const showCollapsedMark = pendingMarks.length >= 2;

    const heroFooter = buildHeroFooterLabel({ dayTargetDef, day, caloricDebt, ndteBoostKcal });

    const openHungerModal = () => {
      HEYS.HungerEnergyStatusModal?.show?.({
        source: 'activity-row',
        date: dateKey,
        day
      });
    };

    const activitySheet = sheetOpen && React.createElement(React.Fragment, null,
      React.createElement('div', {
        className: 'activity-v4-sheet-backdrop',
        ...(window.HEYS?.ModalDismiss?.reactBackdropDismiss
          ? window.HEYS.ModalDismiss.reactBackdropDismiss(() => setSheetOpen(false))
          : { onClick: () => setSheetOpen(false) })
      }),
      React.createElement('div', { className: 'activity-v4-sheet', role: 'dialog', 'aria-label': 'Добавить активность' },
        React.createElement('div', { className: 'activity-v4-sheet__title' }, 'Добавить активность'),
        visibleTrainings < 3 && React.createElement('button', {
          type: 'button',
          className: 'activity-v4-sheet__btn',
          onClick: () => {
            setSheetOpen(false);
            openTrainingPicker?.(visibleTrainings || 0);
            haptic?.('light');
          }
        }, '🏋️', ' Тренировка'),
        React.createElement('button', {
          type: 'button',
          className: 'activity-v4-sheet__btn',
          onClick: () => {
            setSheetOpen(false);
            openHouseholdPicker?.('add');
            haptic?.('light');
          }
        }, '🏠', ' Бытовая активность'),
        !chargeResolved && React.createElement('button', {
          type: 'button',
          className: 'activity-v4-sheet__btn',
          onClick: () => {
            setSheetOpen(false);
            openMorningActivationQuickAdd(day, visibleTrainings, openTrainingPicker);
            haptic?.('light');
          }
        }, '⚡', ' Зарядка')
      )
    );

    const todayRows = [];

    if (totalHouseholdMin > 0) {
      todayRows.push(React.createElement('div', {
        key: 'household',
        className: 'activity-v4-row activity-v4-row--action',
        onClick: () => openHouseholdPicker?.('stats')
      },
        React.createElement('span', { className: 'activity-v4-row__label' }, 'Бытовая активность'),
        React.createElement('span', { className: 'activity-v4-row__value' },
          totalHouseholdMin + ' мин · ' + (householdK || 0) + ' ккал'
        )
      ));
    }

    if ((chargeDone || chargePlanned) && chargeRowValue !== 'не отмечено') {
      todayRows.push(React.createElement('div', {
        key: 'charge',
        className: 'activity-v4-row' + (chargePlanned ? ' activity-v4-row--muted' : '')
      },
        React.createElement('span', { className: 'activity-v4-row__label' }, 'Зарядка'),
        React.createElement('span', { className: 'activity-v4-row__value' + (chargePlanned ? ' activity-v4-row__value--muted' : '') },
          chargeRowValue
        )
      ));
    }

    if (hungerSummary) {
      todayRows.push(React.createElement('div', {
        key: 'hunger',
        className: 'activity-v4-row activity-v4-row--action',
        onClick: openHungerModal
      },
        React.createElement('span', { className: 'activity-v4-row__label' }, 'Голод и энергия'),
        React.createElement('span', { className: 'activity-v4-row__value' }, hungerSummary)
      ));
    }

    if (showCollapsedMark) {
      todayRows.push(React.createElement('div', {
        key: 'mark-collapsed',
        className: 'activity-v4-row activity-v4-row--action',
        onClick: () => setSheetOpen(true)
      },
        React.createElement('span', { className: 'activity-v4-row__label' }, 'Отметить'),
        React.createElement('span', { className: 'activity-v4-row__value activity-v4-row__value--muted' },
          pendingMarks.join(', ')
        )
      ));
    } else {
      if (!(totalHouseholdMin > 0)) {
        todayRows.push(React.createElement('div', {
          key: 'household-empty',
          className: 'activity-v4-row activity-v4-row--action',
          onClick: () => openHouseholdPicker?.('add')
        },
          React.createElement('span', { className: 'activity-v4-row__label' }, 'Бытовая активность'),
          React.createElement('span', { className: 'activity-v4-row__value activity-v4-row__value--muted' }, 'не отмечено')
        ));
      }
      if (!chargeResolved) {
        todayRows.push(React.createElement('div', {
          key: 'charge-empty',
          className: 'activity-v4-row activity-v4-row--action',
          onClick: () => openMorningActivationQuickAdd(day, visibleTrainings, openTrainingPicker)
        },
          React.createElement('span', { className: 'activity-v4-row__label' }, 'Зарядка'),
          React.createElement('span', { className: 'activity-v4-row__value activity-v4-row__value--muted' }, 'не отмечено')
        ));
      }
      if (!hungerSummary) {
        todayRows.push(React.createElement('div', {
          key: 'hunger-empty',
          className: 'activity-v4-row activity-v4-row--action',
          onClick: openHungerModal
        },
          React.createElement('span', { className: 'activity-v4-row__label' }, 'Голод и энергия'),
          React.createElement('span', { className: 'activity-v4-row__value activity-v4-row__value--muted' }, 'не отмечено')
        ));
      }
    }

    // Разбор цели: цепочка обязана прийти к числу, из которого её открыли
    // (контракт «разбор приходит к числу», строка 8). Прежняя редакция
    // кончалась процентом дефицита, и в день с долгом человек видел 2 210
    // сверху и приходил к 1 940 внизу.
    //
    // Причина уровня одна: долг, загрузка и снижение взаимоисключающие
    // (в displayOptimum это if / else if / else), а цикл — множитель внутри
    // расчёта, до них. Значит строк поправки максимум две, порядок фиксирован:
    // цикл → одна из трёх → «Цель дня» (строка 10).
    const breakdownRow = (key, value, opts) => {
      const o = opts || {};
      return React.createElement('div', {
        key: 'br-' + key,
        className: 'activity-v4-breakdown__row' + (o.total ? ' activity-v4-breakdown__row--total' : '')
      },
        React.createElement('span', { className: 'activity-v4-breakdown__key' },
          React.createElement('span', { className: 'activity-v4-breakdown__name' }, key),
          o.note && React.createElement('span', { className: 'activity-v4-breakdown__note' }, o.note)
        ),
        React.createElement('span', {
          className: 'activity-v4-breakdown__value'
            + (o.tone ? ' activity-v4-breakdown__value--' + o.tone : '')
            + (o.total ? ' activity-v4-breakdown__value--total' : '')
        }, value)
      );
    };

    const breakdownRows = [];
    breakdownRows.push(breakdownRow('Базовый обмен', String(bmr)));
    // «Каждая строка только при значении больше нуля» — правило состава
    // (строка 9). NDTE в кадре не нарисована, потому что у показанного дня её
    // не было; она такая же часть базы, и правило к ней то же.
    if (stepsK > 0) breakdownRows.push(breakdownRow('Шаги', '+' + stepsK, { tone: 'add' }));
    if (householdK > 0) breakdownRows.push(breakdownRow('Быт', '+' + householdK, { tone: 'add' }));
    if (cardioKcal > 0) breakdownRows.push(breakdownRow('Тренировки', '+' + cardioKcal, { tone: 'add' }));
    if (ndteData && ndteData.active && ndteBoostKcal > 0) {
      breakdownRows.push(breakdownRow('Тренировка вчера', '+' + ndteBoostKcal, { tone: 'add' }));
    }
    breakdownRows.push(breakdownRow('База без термического эффекта', String(baseExpenditure), {
      note: 'от неё считается цель', total: true
    }));
    if (tefKcal > 0) {
      breakdownRows.push(breakdownRow('Термический эффект еды', '+' + tefKcal, {
        note: 'в затратах есть, в цели нет', tone: 'aside'
      }));
    }
    breakdownRows.push(breakdownRow('Затраты', String(tdee), { total: true }));
    if (dayTargetDef !== 0) {
      breakdownRows.push(breakdownRow('Дефицит по договорённости', formatDeficitLabel(dayTargetDef), { tone: 'aside' }));
    }
    const cycleMult = Number(cycleKcalMultiplier);
    if (Number.isFinite(cycleMult) && cycleMult !== 1) {
      breakdownRows.push(breakdownRow('Цикл', '×' + (Math.round(cycleMult * 100) / 100), { tone: 'aside' }));
    }
    const levelReason = buildLevelReasonRow({ day, caloricDebt, optimum, displayOptimum, r0: safeR0 });
    if (levelReason) {
      breakdownRows.push(breakdownRow(levelReason.label, levelReason.value, { tone: levelReason.tone }));
    }
    breakdownRows.push(breakdownRow('Цель дня', String(displayOptimum), { total: true }));

    const heroBreakdown = heroOpen
      && React.createElement('div', { className: 'activity-v4-breakdown' }, breakdownRows);
    return React.createElement('div', {
      className: 'compact-activity activity-section activity-v4',
      'data-curator-target': 'activity'
    },
      React.createElement('div', { className: 'activity-v4-hero' },
        React.createElement('div', { className: 'activity-v4-hero__label' }, 'Цель дня'),
        React.createElement('div', { className: 'activity-v4-hero__value-row' },
          React.createElement('span', { className: 'activity-v4-hero__value' }, displayOptimum),
          React.createElement('span', { className: 'activity-v4-hero__unit' }, 'ккал')
        ),
        React.createElement('button', {
          type: 'button',
          className: 'activity-v4-hero__footer',
          onClick: () => setHeroOpen((v) => !v),
          'aria-expanded': heroOpen
        },
          React.createElement('span', null, heroFooter),
          React.createElement('span', { className: 'activity-v4-hero__footer-chevron', 'aria-hidden': 'true' }, heroOpen ? '\u2039' : '\u203A')
        ),
        heroBreakdown
      ),

      React.createElement('div', { className: 'activity-v4-tier' }, 'Сегодня'),

      React.createElement('div', { className: 'activity-v4-steps', 'data-curator-target': 'steps' },
        React.createElement('div', { className: 'activity-v4-steps__head' },
          React.createElement('span', { className: 'activity-v4-steps__label' }, 'Шаги'),
          React.createElement('span', { className: 'activity-v4-steps__values' },
            React.createElement('span', {
              className: 'activity-v4-steps__value',
              onClick: (e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setMetricPopup?.({
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
                haptic?.('light');
              },
              style: { cursor: 'pointer' }
            }, stepsValue.toLocaleString()),
            ' ',
            React.createElement('span', { className: 'activity-v4-steps__goal' }, '/ ' + stepsGoal.toLocaleString())
          )
        ),
        React.createElement('div', { className: 'activity-v4-steps__track-wrap no-swipe-zone' },
          React.createElement('div', { className: 'activity-v4-steps__track' },
            React.createElement('div', {
              className: 'activity-v4-steps__fill',
              style: { width: stepsPercent + '%' }
            })
          ),
          React.createElement('div', { className: 'activity-v4-steps__slider steps-slider-container' },
            React.createElement('div', { className: 'steps-slider' },
              React.createElement('div', { className: 'steps-slider-track' }),
              React.createElement('div', { className: 'steps-slider-goal-mark', style: { left: '80%' } },
                React.createElement('span', { className: 'steps-goal-label' }, String(stepsGoal))
              ),
              React.createElement('div', {
                className: 'steps-slider-fill',
                style: { width: stepsPercent + '%' }
              }),
              React.createElement('div', {
                className: 'steps-slider-thumb',
                style: { left: stepsPercent + '%', borderColor: stepsColor },
                onMouseDown: handleStepsDrag,
                onTouchStart: handleStepsDrag
              })
            )
          )
        ),
        React.createElement('div', { className: 'activity-v4-steps__hint' }, stepsK + ' ккал · правка ползунком')
      ),

      regularTrainingsBlock && React.createElement('div', { className: 'activity-v4-cardio' },
        React.createElement('button', {
          type: 'button',
          className: 'activity-v4-cardio__toggle',
          onClick: () => setCardioOpen((v) => !v),
          'aria-expanded': cardioOpen
        },
          React.createElement('span', null, 'Кардио'),
          React.createElement('span', { className: 'activity-v4-cardio__toggle-value' },
            cardioKcal > 0 ? cardioKcal + ' ккал' : 'не отмечено'
          )
        ),
        cardioOpen && React.createElement('div', { className: 'activity-v4-cardio__body' }, regularTrainingsBlock)
      ),

      todayRows.length > 0 && React.createElement('div', { className: 'activity-v4-rows' }, todayRows),

      React.createElement('div', { className: 'activity-v4-tier' }, 'Действие'),
      React.createElement('button', {
        type: 'button',
        className: 'activity-v4-cta',
        onClick: () => setSheetOpen(true)
      },
        React.createElement('span', null, 'Добавить активность'),
        React.createElement('span', { className: 'activity-v4-cta__icon', 'aria-hidden': 'true' }, '+')
      ),

      React.createElement('div', { className: 'activity-v4-tier' }, 'История'),
      React.createElement('div', { className: 'activity-v4-history' },
        calendarBlock,
        React.createElement('button', {
          type: 'button',
          className: 'activity-v4-history__month-row',
          onClick: () => setMonthOpen((v) => !v),
          'aria-expanded': monthOpen
        },
          React.createElement('span', { className: 'activity-v4-history__month-label' }, 'Тренировки за месяц'),
          React.createElement('span', { className: 'activity-v4-history__month-value' }, monthCount + ' \u203A')
        ),
        monthOpen && monthCount > 0 && React.createElement('div', { className: 'activity-v4-history__month-list month-trainings-list' },
          monthTrainingsRows.map((row, ri) => React.createElement('div', {
            key: 'mtr-' + ri + '-' + row.dateKey,
            className: 'month-trainings-row'
          },
            React.createElement('span', { className: 'month-trainings-row-date' }, row.dateLine || row.dateKey),
            React.createElement('span', { className: 'month-trainings-row-type' }, row.typeLabel),
            React.createElement('span', { className: 'compact-badge train month-trainings-row-kcal' }, (row.kcal || 0) + ' ккал')
          ))
        ),
        monthOpen && monthCount === 0 && React.createElement('div', { className: 'month-trainings-empty' }, 'Нет тренировок за последние 30 дней')
      ),

      activitySheet
    );
  }

  function renderActivityCard(params) {
    return React.createElement(ActivityTabV4, params);
  }

  HEYS.dayActivity = {
    render: renderActivityCard,
    collectMonthTrainingRows,
    ActivityTabV4
  };

})(window);
