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
    if (status === 'done' || status === 'planned' || status === 'skipped' || status === 'missed') return true;
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

  /** Число объёма словами кадра: «1,9 т» от тонны, иначе «460 кг». */
  function formatVolumeShort(kg) {
    const n = Math.max(0, Number(kg) || 0);
    if (n <= 0) return '';
    if (n >= 1000) {
      const t = n / 1000;
      return String(t >= 10 ? Math.round(t) : Math.round(t * 10) / 10).replace('.', ',') + ' т';
    }
    return Math.round(n) + ' кг';
  }

  /**
   * Строка «Тренировки» яруса «Сегодня».
   *
   * Слово «Кардио» с экрана снято: под ним лежали семь сущностей — программа,
   * назначенная силовая, правка куратора, силовые с журналом, хобби, «Пальцы» и
   * бытовая активность, и кардио было одной из них (контракт «„Кардио" как имя
   * снято», строка 6).
   *
   * Значение читается четырьмя состояниями. «не начаты» вместо нуля — потому
   * что назначенный план до старта не даёт расхода, и ноль читался бы как
   * «тренировался и не потратил»: слово честнее числа.
   *
   * Тоннаж в составе — фактический, по отмеченным подходам и без назначенного
   * плана: день с планом обязан давать тот же тоннаж, что пустой. Плановый
   * живёт в карточке силовой, где виден состав упражнений.
   */
  function buildTrainingsRowValue(params) {
    const { day, kcalMin, r0, trainingTypes, cardioKcal, hasProgram } = params || {};
    const trainings = Array.isArray(day && day.trainings) ? day.trainings : [];
    const performed = trainings.filter((t) => isTrainingSlotUsedMonth(t) && !isMorningActivationTraining(t));
    const planned = trainings.filter((t) => isNotPerformedTrainingMonth(t));
    const ks = HEYS.TrainingKernel && HEYS.TrainingKernel.strength;
    const round = typeof r0 === 'function' ? r0 : (v) => Math.round(v || 0);
    let runningAgg = null;
    if (ks && typeof ks.trainingTonnage === 'function') {
      for (let i = 0; i < trainings.length; i++) {
        const t = trainings[i];
        if (isMorningActivationTraining(t)) continue;
        const agg = ks.trainingTonnage(t);
        if (agg && agg.doneApproaches > 0 && agg.doneApproaches < agg.totalApproaches) {
          runningAgg = agg;
          break;
        }
      }
    }

    if (runningAgg) {
      const runningKcal = Number.isFinite(cardioKcal)
        ? cardioKcal
        : performed.reduce((s, t) => s + trainingKcalFromZones(t, kcalMin || [0, 0, 0, 0], round), 0);
      return {
        value: round(runningKcal) + ' ккал',
        sub: 'силовая идёт · ' + runningAgg.doneApproaches + ' из ' + runningAgg.totalApproaches + ' подходов',
        strong: true,
        running: true
      };
    }

    if (!performed.length) {
      // Назначенное есть, сделанного нет — «не начаты», а не ноль.
      if (planned.length) return { value: 'не начаты', muted: true, sub: '' };
      // Программа ведётся, но на сегодня в ней ничего нет — это день отдыха,
      // а не пропуск: «не отмечено» здесь читалось бы как забывчивость.
      if (hasProgram) return { value: 'день отдыха', muted: true, sub: '' };
      return { value: 'не отмечено', muted: true, sub: '' };
    }

    const types = Array.isArray(trainingTypes) ? trainingTypes : [];
    const parts = [];
    for (let i = 0; i < performed.length; i++) {
      const t = performed[i];
      const type = types.find((x) => x && x.id === t.type);
      const label = String((type && type.label) || t.activityLabel || 'тренировка').toLowerCase();
      const minutes = (Array.isArray(t.z) ? t.z : []).reduce((s, m) => s + (Number(m) || 0), 0);
      parts.push(minutes > 0 ? label + ' ' + minutes + ' мин' : label);
    }

    let tonnage = 0;
    if (ks && typeof ks.dayTonnage === 'function') {
      const bodyWeightKg = Number(day && day.weightMorning) || 0;
      tonnage = ks.dayTonnage(day, bodyWeightKg > 0 ? { bodyWeightKg } : undefined);
    }
    const volume = formatVolumeShort(tonnage);
    const sub = parts.join(' · ') + (volume ? ' · ' + volume + ' объёма' : '');

    const kcal = Number.isFinite(cardioKcal)
      ? cardioKcal
      : performed.reduce((s, t) => s + trainingKcalFromZones(t, kcalMin || [0, 0, 0, 0], round), 0);
    return { value: round(kcal) + ' ккал', sub: sub, strong: true };
  }

  const MONTHS_RU_GEN = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  function formatDayMonth(dateKey) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
    if (!m) return '';
    return String(Number(m[3])) + ' ' + MONTHS_RU_GEN[Number(m[2]) - 1];
  }

  function pluralRu(n, one, few, many) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  /**
   * Строка «Рабочие веса» яруса «История».
   *
   * В поправке на факт эта же метрика — довод, и звучит она отрицательно
   * («норму не трогаем»). Здесь она факт о тренировках, и формулировка
   * положительная (контракт «рост рабочих весов на вкладке», строка 17).
   *
   * Пустот две, и они разного смысла: «рано сравнивать» — данных мало,
   * «нет общих упражнений» — сменил программу. Второе не результат, и красить
   * его как плохой результат нельзя (строки 18 и 25).
   */
  function buildWorkingWeightsRow(analysis) {
    if (!analysis) return null;
    if (!analysis.available) {
      if (analysis.reason === 'short_window') {
        const have = Number(analysis.haveDays) || 0;
        const need = Number(analysis.needDays) || 14;
        return {
          sub: 'данных ' + have + ' ' + pluralRu(have, 'день', 'дня', 'дней') + ' из ' + need,
          value: 'рано сравнивать',
          muted: true
        };
      }
      if (analysis.reason === 'no_shared_exercises') {
        const when = formatDayMonth(analysis.changedAt);
        return {
          sub: when ? 'программа сменилась ' + when : 'программа сменилась',
          value: 'нет общих упражнений',
          muted: true
        };
      }
      return null;
    }
    const delta = Number(analysis.deltaPct) || 0;
    const weeks = Number(analysis.weeks) || 4;
    const shared = Number(analysis.shared) || 0;
    const sign = delta > 0 ? '+' : (delta < 0 ? '−' : '');
    const value = sign + String(Math.abs(Math.round(delta * 10) / 10)).replace('.', ',') + ' %';
    return {
      sub: 'за ' + weeks + ' ' + pluralRu(weeks, 'неделю', 'недели', 'недель')
        + ' · ' + shared + ' ' + pluralRu(shared, 'общее упражнение', 'общих упражнения', 'общих упражнений'),
      value,
      tone: delta > 0 ? 'grow' : (delta < 0 ? 'drop' : 'flat')
    };
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
      fmtDate,
      anchorDate
    } = params || {};
    const r0 = typeof r0In === 'function' ? r0In : (v) => Math.round(v || 0);
    if (typeof lsGet !== 'function' || typeof todayISO !== 'function' || typeof parseISO !== 'function' || typeof fmtDate !== 'function' || typeof formatDateDisplay !== 'function') {
      return [];
    }
    const safeTypes = Array.isArray(trainingTypes) ? trainingTypes : [];
    const rows = [];
    // Окно кончается открытым днём, а не сегодня. Прежде при листании на
    // прошлую дату шапка была про этот день, а список — про последние 30 дней
    // от сегодня: два разных окна на одном экране
    // (контракт «тренировки за месяц», строка 26).
    const endD = parseISO(anchorDate || todayISO());
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

  const LOAD_WINDOW_DAYS = 42;
  const LOAD_ADVICE_DAYS = 14;

  function loadDate(key) {
    const parts = String(key || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  }

  function loadDateKey(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return date.getFullYear() + '-'
      + String(date.getMonth() + 1).padStart(2, '0') + '-'
      + String(date.getDate()).padStart(2, '0');
  }

  function loadDayKey(anchor, offset) {
    const date = loadDate(anchor);
    if (!date) return '';
    date.setDate(date.getDate() + offset);
    return loadDateKey(date);
  }

  function median(values) {
    const list = (values || []).filter((v) => Number(v) > 0).map(Number).sort((a, b) => a - b);
    if (!list.length) return 0;
    const mid = Math.floor(list.length / 2);
    return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
  }

  function trendWord(current, previous, faster) {
    const cur = Number(current) || 0;
    const prev = Number(previous) || 0;
    if (!(cur > 0) && !(prev > 0)) return { text: 'без изменений', tone: 'muted', rate: 0 };
    const rate = prev > 0 ? (cur - prev) / prev : 1;
    if (rate > 0.05) return { text: faster ? 'растёт быстрее' : 'растёт', tone: faster ? 'warn' : '', rate };
    if (rate < -0.05) return { text: 'снижается', tone: 'grow', rate };
    return { text: 'без изменений', tone: 'muted', rate };
  }

  function formatTonnage(value) {
    const kg = Number(value) || 0;
    if (kg >= 1000) return String(Math.round(kg / 100) / 10).replace('.', ',') + ' т';
    return Math.round(kg) + ' кг';
  }

  function weekdayShort(dateKey) {
    const d = loadDate(dateKey);
    if (!d) return dateKey;
    return ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()];
  }

  function weekdayFull(dateKey) {
    const d = loadDate(dateKey);
    if (!d) return dateKey;
    return ['воскресенья', 'понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы'][d.getDay()];
  }

  function groupVolumesForTraining(training, bodyWeightKg) {
    const SK = HEYS.TrainingKernel?.strength;
    const metaApi = HEYS.exerciseMeta;
    const wl = training && training.workoutLog;
    if (!SK || typeof SK.trainingTonnage !== 'function' || !metaApi || !wl) return {};
    const exercises = Array.isArray(wl.exercises) ? wl.exercises : [];
    const out = {};
    exercises.forEach((exercise) => {
      if (!exercise) return;
      const one = {
        ...training,
        workoutLog: { ...wl, exercises: [exercise] }
      };
      const kg = Number(SK.trainingTonnage(one, { bodyWeightKg }).totalVolume) || 0;
      if (!(kg > 0)) return;
      const catalogMeta = typeof metaApi.get === 'function' ? metaApi.get(exercise.name || '') : null;
      const snapshot = {
        primaryGroup: exercise.primaryGroup || catalogMeta?.primaryGroup || '',
        secondaryGroups: Array.isArray(exercise.secondaryGroups)
          ? exercise.secondaryGroups
          : (catalogMeta?.secondaryGroups || [])
      };
      const weights = typeof metaApi.groupWeights === 'function' ? metaApi.groupWeights(snapshot) : {};
      Object.keys(weights).forEach((group) => {
        out[group] = (out[group] || 0) + kg * (Number(weights[group]) || 0);
      });
    });
    return out;
  }

  function averageRpe(training) {
    const exercises = training?.workoutLog?.exercises || [];
    const values = exercises.map((ex) => Number(ex?.rpe) || 0).filter((v) => v > 0);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  /**
   * Клиентский consumer существующего TK.load. Абсолютные CTL/ATL не выходят
   * наружу как пользовательские баллы: шкала не откалибрована, поэтому UI
   * получает только сравнение окон, вклад сессии и проверяемое время отдыха.
   */
  function collectTrainingLoadSummary(params) {
    const { lsGet, anchorDate, liveDay, zoneMets, bodyWeightKg } = params || {};
    const loadApi = HEYS.TrainingKernel?.load;
    const strengthApi = HEYS.TrainingKernel?.strength;
    if (typeof lsGet !== 'function' || !loadDate(anchorDate) || !loadApi || !strengthApi) return null;

    const rows = [];
    for (let offset = -(LOAD_WINDOW_DAYS - 1); offset <= 0; offset++) {
      const dateKey = loadDayKey(anchorDate, offset);
      let stored = lsGet('heys_dayv2_' + dateKey, null);
      if (liveDay && (liveDay.date === dateKey || liveDay.dateKey === dateKey)
        && (!stored || (Number(liveDay.updatedAt) || 0) >= (Number(stored.updatedAt) || 0))) {
        stored = liveDay;
      }
      const day = stored && typeof stored === 'object' ? stored : null;
      const trainings = Array.isArray(day?.trainings) ? day.trainings : [];
      let cardio = 0;
      let strength = 0;
      const groups = {};
      const closed = [];
      trainings.forEach((training) => {
        cardio += Number(loadApi.sessionLoad(training, zoneMets)) || 0;
        if (loadApi.isNotPerformedTraining(training)) return;
        const agg = strengthApi.trainingTonnage(training, { bodyWeightKg });
        const volume = Number(agg?.totalVolume) || 0;
        strength += volume;
        const groupPart = groupVolumesForTraining(training, bodyWeightKg);
        Object.keys(groupPart).forEach((group) => {
          groups[group] = (groups[group] || 0) + groupPart[group];
        });
        if (volume > 0 && agg.totalApproaches > 0
          && (training?.workoutLog?.completedAt || agg.doneApproaches >= agg.totalApproaches)) {
          closed.push({ training, volume, rpe: averageRpe(training), dateKey });
        }
      });
      rows.push({ dateKey, hasData: !!day, cardio, strength, groups, closed });
    }

    const daysWithData = rows.filter((row) => row.hasData).length;
    if (!rows.some((row) => row.strength > 0 || row.cardio > 0)) return null;
    const strengthSeries = rows.map((row) => row.strength);
    const cardioSeries = rows.map((row) => row.cardio);
    const strengthNow = loadApi.fitnessFatigue(strengthSeries, { daysWithData });
    const strengthBefore = loadApi.fitnessFatigue(strengthSeries.slice(0, -7), {
      daysWithData: Math.max(0, daysWithData - 7)
    });
    const cardioNow = loadApi.fitnessFatigue(cardioSeries, { daysWithData });
    const cardioBefore = loadApi.fitnessFatigue(cardioSeries.slice(0, -7), {
      daysWithData: Math.max(0, daysWithData - 7)
    });
    const accumulated = trendWord(strengthNow.ctl, strengthBefore.ctl, false);
    const fatigueBase = trendWord(strengthNow.atl, strengthBefore.atl, false);
    const fatigue = trendWord(strengthNow.atl, strengthBefore.atl, fatigueBase.rate > accumulated.rate + 0.05);
    const cardioTrend = trendWord(cardioNow.ctl, cardioBefore.ctl, false);
    const weeklyStrength = [];
    for (let start = 0; start < strengthSeries.length; start += 7) {
      weeklyStrength.push(strengthSeries.slice(start, start + 7).reduce((sum, value) => sum + value, 0));
    }
    let accumulatedWeeks = weeklyStrength.length ? 1 : 0;
    for (let index = weeklyStrength.length - 1; index > 0; index--) {
      const current = weeklyStrength[index];
      const previous = weeklyStrength[index - 1];
      if (current > 0 && (previous <= 0 || current > previous * 1.05)) accumulatedWeeks += 1;
      else break;
    }

    const recent = rows.slice(-LOAD_ADVICE_DAYS);
    const adviceDaysWithData = recent.filter((row) => row.hasData).length;
    const allGroups = new Set();
    recent.forEach((row) => Object.keys(row.groups).forEach((group) => allGroups.add(group)));
    let warning = null;
    allGroups.forEach((group) => {
      const activeIndexes = [];
      recent.forEach((row, index) => { if ((row.groups[group] || 0) > 0) activeIndexes.push(index); });
      if (!activeIndexes.length) return;
      let end = activeIndexes[activeIndexes.length - 1];
      if (end < recent.length - 2) return;
      let start = end;
      while (start > 0 && (recent[start - 1].groups[group] || 0) > 0) start--;
      const streak = end - start + 1;
      if (streak < 3) return;
      const score = recent.slice(start, end + 1).reduce((sum, row) => sum + (row.groups[group] || 0), 0);
      if (!warning || score > warning.score) {
        warning = { group, start, end, streak, score, dates: recent.slice(start, end + 1).map((row) => row.dateKey) };
      }
    });

    if (warning) {
      const lastByGroup = {};
      recent.forEach((row, index) => Object.keys(row.groups).forEach((group) => {
        if ((row.groups[group] || 0) > 0) lastByGroup[group] = index;
      }));
      const opposite = { back: 'chest', chest: 'back', biceps: 'triceps', triceps: 'biceps', quads: 'hamstrings', hamstrings: 'quads' };
      let restedGroup = opposite[warning.group] || '';
      if (!restedGroup || lastByGroup[restedGroup] === recent.length - 1) {
        restedGroup = Array.from(allGroups).filter((group) => group !== warning.group)
          .sort((a, b) => (lastByGroup[a] ?? -1) - (lastByGroup[b] ?? -1))[0] || '';
      }
      const lastIndex = lastByGroup[restedGroup];
      const restDays = lastIndex === undefined ? LOAD_ADVICE_DAYS : Math.max(0, recent.length - 1 - lastIndex);
      warning = {
        ...warning,
        groupLabel: HEYS.exerciseMeta?.groupLabel?.(warning.group) || warning.group,
        restedGroup,
        restedLabel: HEYS.exerciseMeta?.groupLabel?.(restedGroup) || restedGroup,
        restDays,
        historyDays: adviceDaysWithData,
        since: weekdayFull(recent[warning.start].dateKey),
        dateList: warning.dates.slice(-3).reverse().map(weekdayShort).join(', '),
        isBackPull: warning.group === 'back'
      };
    }

    const sessions = rows.flatMap((row) => row.closed);
    const latest = sessions[sessions.length - 1] || null;
    const previousVolumes = latest ? sessions.slice(0, -1).map((item) => item.volume) : [];
    const baseline = median(previousVolumes);
    const heavy = !!latest && (latest.rpe >= 8 || (baseline > 0 && latest.volume >= baseline * 1.25));
    const completedAt = Number(latest?.training?.workoutLog?.completedAt) || 0;
    const recoveryTotalHours = heavy ? 36 : 24;
    const elapsedHours = completedAt > 0 ? Math.max(0, (Date.now() - completedAt) / 3600000) : recoveryTotalHours;
    const recoveryPct = Math.max(0, Math.min(100, Math.round(elapsedHours / recoveryTotalHours * 100)));
    const remainingHours = Math.max(0, Math.ceil(recoveryTotalHours - elapsedHours));
    const readinessRatio = strengthNow.ctl > 0 ? strengthNow.tsb / strengthNow.ctl : 0;
    const readinessPct = Math.max(20, Math.min(80, Math.round(50 + readinessRatio * 50)));
    const readiness = readinessRatio < -0.05 ? 'ниже нормы' : readinessRatio > 0.05 ? 'выше обычного' : 'в норме';

    return {
      accumulated,
      accumulatedWeeks,
      fatigue,
      cardio: cardioTrend,
      sessionContribution: latest ? formatTonnage(latest.volume) : '—',
      verdict: latest ? (heavy ? 'Сессия зачтена как тяжёлая' : 'Сессия зачтена как обычная') : '',
      nextHeavyDate: latest ? loadDayKey(latest.dateKey, heavy ? 3 : 2) : '',
      recoveryPct,
      remainingHours,
      readiness,
      readinessPct,
      warning,
      daysWithData
    };
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
      stepsEstimated,
      stepsMissing,
      bmr,
      householdK,
      totalHouseholdMin,
      train1k,
      train2k,
      train3k,
      r0,
      visibleTrainings,
      trainingTypes,
      regularTrainingsBlock,
      programTrainingsBlock,
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
      workingWeights,
      chargeTrackedDays,
      chargeDoneDays,
      morningActivationCalendarBlock,
      kcalMin,
      trainingLoad
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
    const [calOpen, setCalOpen] = useState(false);
    const [loadOpen, setLoadOpen] = useState(false);
    const [loadDismissed, setLoadDismissed] = useState(false);

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

    const heroFooter = buildHeroFooterLabel({ dayTargetDef, day, caloricDebt, ndteBoostKcal });

    // «У нового человека» — не «нет данных за сегодня», а нет истории вовсе:
    // ни одного дня привычки, ни одной тренировки за месяц, весам нечего
    // сравнивать. Пока хоть что-то есть, ярус показывает это, а не прозу.
    const historyIsEmpty = !(Number(chargeTrackedDays) > 0)
      && monthCount === 0
      && !(workingWeights && workingWeights.available);

    const weightsRow = buildWorkingWeightsRow(workingWeights);
    const workingWeightsRow = weightsRow && React.createElement('div', {
      className: 'activity-v4-history__row'
    },
      React.createElement('span', { className: 'activity-v4-history__key' },
        React.createElement('span', { className: 'activity-v4-history__name' }, 'Рабочие веса'),
        React.createElement('span', { className: 'activity-v4-history__sub' }, weightsRow.sub)
      ),
      React.createElement('span', {
        className: 'activity-v4-history__delta'
          + (weightsRow.muted ? ' activity-v4-history__delta--muted' : '')
          + (weightsRow.tone ? ' activity-v4-history__delta--' + weightsRow.tone : '')
      }, weightsRow.value)
    );


    // Пункт листа: имя и под ним — что именно спросят. Без подписи «Зарядка»
    // и «Тренировка» выглядят одинаково весомо, хотя спрашивают разное.
    const sheetItem = ({ key, icon, name, sub, onPick }) => React.createElement('button', {
      key: key,
      type: 'button',
      className: 'activity-v4-sheet__btn',
      onClick: () => {
        setSheetOpen(false);
        onPick();
        haptic?.('light');
      }
    },
      React.createElement('span', { className: 'activity-v4-sheet__icon', 'aria-hidden': 'true' }, icon),
      React.createElement('span', { className: 'activity-v4-sheet__text' },
        React.createElement('span', { className: 'activity-v4-sheet__name' }, name),
        React.createElement('span', { className: 'activity-v4-sheet__sub' }, sub)
      )
    );

    const activitySheet = sheetOpen && React.createElement(React.Fragment, null,
      React.createElement('div', {
        className: 'activity-v4-sheet-backdrop',
        ...(window.HEYS?.ModalDismiss?.reactBackdropDismiss
          ? window.HEYS.ModalDismiss.reactBackdropDismiss(() => setSheetOpen(false))
          : { onClick: () => setSheetOpen(false) })
      }),
      React.createElement('div', { className: 'activity-v4-sheet', role: 'dialog', 'aria-label': 'Добавить активность' },
        React.createElement('div', { className: 'activity-v4-sheet__title' }, 'Добавить активность'),
        // Слотов тренировки три. Когда все заняты, пункт исчезает, а не гаснет:
        // погашенная кнопка обещает действие, которого нет
        // (контракт «лист действия · три пункта», строка 22).
        visibleTrainings < 3 && sheetItem({
          key: 'training', icon: '🏋️', name: 'Тренировка',
          sub: 'время, тип, минуты по зонам',
          onPick: () => openTrainingPicker?.(visibleTrainings || 0)
        }),
        sheetItem({
          key: 'charge', icon: '⚡', name: 'Зарядка',
          sub: 'сделал · сделаю · не сегодня',
          onPick: () => openMorningActivationQuickAdd(day, visibleTrainings, openTrainingPicker)
        }),
        sheetItem({
          key: 'household', icon: '🏠', name: 'Бытовая активность',
          sub: 'минуты',
          onPick: () => openHouseholdPicker?.('add')
        })
      )
    );

    // Ярус «Сегодня»: три строки, и они стоят всегда. Прежде весь блок
    // пропадал, когда нет ни тренировок, ни быта, — и вместе с ним пропадала
    // строка программы (контракт «ярус не исчезает пустым», строка 6).
    const todayRow = (key, name, value, opts) => {
      const o = opts || {};
      return React.createElement('div', {
        key: key,
        className: 'activity-v4-today__row' + (o.onClick ? ' activity-v4-today__row--action' : ''),
        onClick: o.onClick,
        role: o.onClick ? 'button' : undefined,
        'aria-expanded': o.expanded === undefined ? undefined : o.expanded
      },
        React.createElement('span', { className: 'activity-v4-today__key' },
          React.createElement('span', { className: 'activity-v4-today__name' }, name),
          o.sub && React.createElement('span', {
            className: 'activity-v4-today__sub' + (o.running ? ' activity-v4-today__sub--running' : '')
          }, o.sub)
        ),
        React.createElement('span', {
          className: 'activity-v4-today__value'
            + (o.muted ? ' activity-v4-today__value--muted' : '')
            + (o.strong ? ' activity-v4-today__value--strong' : '')
            + (o.chevron ? ' activity-v4-today__value--chevron' : '')
            + (o.tone ? ' activity-v4-today__value--' + o.tone : '')
        },
          React.createElement('span', null, value),
          o.chevron && React.createElement('i', { 'aria-hidden': 'true' }, '›')
        )
      );
    };

    const trainingsRow = buildTrainingsRowValue({
      day, kcalMin: safeKcalMin, r0: safeR0, trainingTypes, cardioKcal,
      // Программа на экране есть, а сделанного за день нет — это не
      // «не отмечено», а день отдыха по программе (кадр «день отдыха»).
      hasProgram: !!programTrainingsBlock
    });

    const householdHasData = totalHouseholdMin > 0;
    const chargeHasData = (chargeDone || chargePlanned) && chargeRowValue !== 'не отмечено';

    const todayRows = [
      todayRow('trainings', 'Тренировки', trainingsRow.value, {
        sub: trainingsRow.sub,
        muted: trainingsRow.muted,
        strong: trainingsRow.strong,
        running: trainingsRow.running,
        chevron: trainingsRow.running,
        onClick: regularTrainingsBlock ? () => setCardioOpen((v) => !v) : undefined,
        expanded: regularTrainingsBlock ? cardioOpen : undefined
      }),
      todayRow('household', 'Бытовая активность',
        householdHasData ? (totalHouseholdMin + ' мин · ' + (householdK || 0) + ' ккал') : 'не отмечено', {
          muted: !householdHasData,
          onClick: () => openHouseholdPicker?.(householdHasData ? 'stats' : 'add')
        }),
      todayRow('charge', 'Зарядка', chargeHasData ? chargeRowValue : 'не отмечено', {
        muted: !chargeHasData,
        tone: chargeHasData && !chargePlanned ? 'grow' : undefined,
        onClick: chargeResolved ? undefined : () => openMorningActivationQuickAdd(day, visibleTrainings, openTrainingPicker)
      })
    ];
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
            + (o.strong ? ' activity-v4-breakdown__value--strong' : '')
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
      // Кадр «разбор цели» набирает поправку уровня весом 700, в отличие от
      // обычных слагаемых: это не ещё одно слагаемое, а причина, по которой
      // цель отличается от базовой.
      breakdownRows.push(breakdownRow(levelReason.label, levelReason.value, { tone: levelReason.tone, strong: true }));
    }
    breakdownRows.push(breakdownRow('Цель дня', String(displayOptimum), { total: true }));

    const heroBreakdown = heroOpen
      && React.createElement('div', { className: 'activity-v4-breakdown' }, breakdownRows);

    const warning = trainingLoad?.warning;
    const loadWarning = warning && !loadDismissed && React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'activity-v4-load-warning' },
        React.createElement('div', { className: 'activity-v4-load-warning__title' },
          warning.groupLabel + ' ' + warning.streak + ' день подряд'),
        React.createElement('div', { className: 'activity-v4-load-warning__reason' },
          'восстановление ещё не закрыто с ' + warning.since),
        React.createElement('div', { className: 'activity-v4-load-warning__text' },
          warning.isBackPull
            ? 'Сегодня лучше жать, чем тянуть. Если тяга принципиальна — оставьте два рабочих подхода вместо четырёх.'
            : 'Сегодня лучше сменить группу, чем повторять ту же нагрузку. Если это принципиально — сократите рабочие подходы вдвое.'),
        React.createElement('div', { className: 'activity-v4-load-warning__actions' },
          React.createElement('button', {
            type: 'button',
            className: 'activity-v4-load-warning__action activity-v4-load-warning__action--primary',
            onClick: () => {
              setLoadDismissed(true);
              if ((Number(visibleTrainings) || 0) < 3) openTrainingPicker?.(visibleTrainings || 0);
              else setCardioOpen(true);
              haptic?.('light');
            }
          }, warning.isBackPull ? 'Взять день жимов' : 'Сменить группу'),
          React.createElement('button', {
            type: 'button',
            className: 'activity-v4-load-warning__action',
            onClick: () => { setLoadDismissed(true); haptic?.('light'); }
          }, warning.isBackPull ? 'Всё равно тянуть' : 'Всё равно продолжить')
        ),
        React.createElement('div', { className: 'activity-v4-load-warning__confidence' },
          'Уверенность ' + (warning.historyDays >= 14 ? 'достаточная' : 'низкая')
          + ' — данных ' + warning.historyDays + ' дней из 14. Совет остаётся советом: оба выхода равнозначны, запрета нет.')
      ),
      React.createElement('div', { className: 'activity-v4-tier' }, 'Что стоит за советом'),
      React.createElement('div', { className: 'activity-v4-load-evidence' },
        React.createElement('div', { className: 'activity-v4-load-evidence__row' },
          React.createElement('span', null, warning.groupLabel),
          React.createElement('span', { className: 'activity-v4-load-evidence__warn' }, 'нагружали ' + warning.dateList)
        ),
        warning.restedLabel && React.createElement('div', { className: 'activity-v4-load-evidence__row' },
          React.createElement('span', null, warning.restedLabel),
          React.createElement('span', { className: 'activity-v4-load-evidence__rest' },
            'отдыхала ' + warning.restDays + ' ' + pluralRu(warning.restDays, 'день', 'дня', 'дней'))
        ),
        React.createElement('div', {
          className: 'activity-v4-load-evidence__row activity-v4-load-evidence__row--last'
        },
          React.createElement('span', { className: 'activity-v4-load-evidence__rule' },
            React.createElement('span', null, 'Основная группа берёт полный вес'),
            React.createElement('span', null, 'синергист — половину, как в конструкторе')
          )
        )
      ),
      React.createElement('div', { className: 'activity-v4-load-note' },
        'Совет считается по группам мышц упражнений, а не по названию тренировки: «спина» набирается и тягой блока, и подтягиваниями, где спина — основная.')
    );

    const loadRow = (key, note, value, tone, last) => React.createElement('div', {
      key,
      className: 'activity-v4-load-details__row' + (last ? ' activity-v4-load-details__row--last' : '')
    },
      React.createElement('span', { className: 'activity-v4-load-details__copy' },
        React.createElement('span', { className: 'activity-v4-load-details__name' }, key),
        React.createElement('span', { className: 'activity-v4-load-details__note' }, note)
      ),
      React.createElement('span', {
        className: 'activity-v4-load-details__value'
          + (tone ? ' activity-v4-load-details__value--' + tone : '')
      }, value)
    );

    const growthWeeks = Number(trainingLoad?.accumulatedWeeks) || 0;
    const growthNote = growthWeeks >= 3
      ? 'третью неделю подряд, окно 6 недель'
      : 'динамика по неделям, окно 6 недель';
    const loadDetails = trainingLoad && loadOpen && React.createElement('div', {
      className: 'activity-v4-load-details'
    },
      React.createElement('div', { className: 'activity-v4-tier' }, 'Как меняется'),
      React.createElement('div', { className: 'activity-v4-load-details__list' },
        loadRow('Силовая нагрузка · накопленная', growthNote,
          trainingLoad.accumulated.text, trainingLoad.accumulated.tone),
        loadRow('Силовая усталость · короткое окно',
          trainingLoad.fatigue.text === 'растёт быстрее'
            ? 'окно 7 дней · обгоняет накопленную'
            : 'динамика за последние 7 дней',
          trainingLoad.fatigue.text, trainingLoad.fatigue.tone),
        loadRow('Кардио — отдельным рядом', 'в одно число с силовой не сводится',
          trainingLoad.cardio.text, trainingLoad.cardio.tone),
        loadRow('Вклад этой сессии', 'в силовом ряду, своей единицей — тоннажем',
          trainingLoad.sessionContribution, 'number', true)
      ),
      React.createElement('div', { className: 'activity-v4-load-note' },
        'Абсолютных значений нет намеренно: шкала не откалибрована на живой истории, и «72 из 100» читалось бы как измерение. Числа не хранятся — считаются на чтении.'),
      trainingLoad.verdict && React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'activity-v4-tier' }, 'Вердикт сессии'),
        React.createElement('div', { className: 'activity-v4-load-verdict' },
          React.createElement('div', { className: 'activity-v4-load-verdict__title' }, trainingLoad.verdict),
          React.createElement('div', { className: 'activity-v4-load-verdict__next' },
            'следующая тяжёлая — не раньше ' + weekdayFull(trainingLoad.nextHeavyDate)),
          React.createElement('div', { className: 'activity-v4-load-verdict__tiles' },
            React.createElement('div', { className: 'activity-v4-load-verdict__tile' },
              React.createElement('span', { className: 'activity-v4-load-verdict__key' }, 'восстановление'),
              React.createElement('span', { className: 'activity-v4-load-verdict__track' },
                React.createElement('span', {
                  className: 'activity-v4-load-verdict__fill activity-v4-load-verdict__fill--recovery',
                  style: { width: trainingLoad.recoveryPct + '%' }
                })
              ),
              React.createElement('span', { className: 'activity-v4-load-verdict__value' },
                trainingLoad.recoveryPct + ' % · ~' + trainingLoad.remainingHours + ' ч')
            ),
            React.createElement('div', { className: 'activity-v4-load-verdict__tile' },
              React.createElement('span', { className: 'activity-v4-load-verdict__key' }, 'готовность'),
              React.createElement('span', { className: 'activity-v4-load-verdict__track' },
                React.createElement('span', {
                  className: 'activity-v4-load-verdict__fill activity-v4-load-verdict__fill--readiness',
                  style: { width: trainingLoad.readinessPct + '%' }
                })
              ),
              React.createElement('span', { className: 'activity-v4-load-verdict__value' }, trainingLoad.readiness)
            )
          )
        ),
        React.createElement('div', { className: 'activity-v4-load-note' },
          'Вердикт ставится по тоннажу и тяжести подходов закрытой сессии — их считает конструктор. Восстановление названо процентом и часами, готовность — словом: часы человек проверяет по себе, а процент готовности проверить нечем.')
      )
    );
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
          // Справа кадр даёт не голый шеврон, а подпись действия: «из чего ›»
          // в свёрнутом виде и «свернуть ›» в раскрытом (контракт строка 34).
          React.createElement('span', {
            className: 'activity-v4-hero__footer-link'
          }, (heroOpen ? 'свернуть' : 'из чего') + ' ›')
        ),
        heroBreakdown
      ),

      loadWarning,

      // Три элемента программы стоят выше яруса: назначенная на сегодня
      // тренировка и правка куратора — самое важное на экране, и они не
      // могут жить за свёрнутым чевроном (контракт строка 7).
      programTrainingsBlock && React.createElement('div', {
        className: 'activity-v4-program'
      }, programTrainingsBlock),

      React.createElement('div', { className: 'activity-v4-tier' }, 'Сегодня'),

      React.createElement('div', { className: 'activity-v4-steps', 'data-curator-target': 'steps' },
        React.createElement('div', { className: 'activity-v4-steps__head' },
          React.createElement('span', { className: 'activity-v4-steps__label' }, 'Шаги'),
          React.createElement('span', { className: 'activity-v4-steps__values' },
            // Пилюля стоит перед числом: подставленное значение видно раньше,
            // чем прочитано (контракт «оценённые шаги помечены», строка 14).
            stepsEstimated && React.createElement('span', {
              className: 'activity-v4-steps__pill'
            }, 'оценка'),
            React.createElement('span', {
              // Ноль шагов кадр «новый человек» приглушает целиком: числу нечего
              // выделять, а тон говорит «здесь пока пусто» раньше, чем читается
              // само число.
              className: 'activity-v4-steps__value'
                + (stepsEstimated ? ' activity-v4-steps__value--estimated' : '')
                + (!stepsEstimated && !(Number(stepsValue) > 0) ? ' activity-v4-steps__value--zero' : ''),
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
            React.createElement('span', {
              className: 'activity-v4-steps__goal',
              // Цель — план дня, а не настройка: её спрашивают каждое утро и
              // считают от медианы с модификаторами. Тап открывает тот же шаг
              // чек-ина (контракт «факт и цель правятся по-разному», строка 12).
              onClick: (e) => {
                e.stopPropagation();
                openStepsGoalPicker?.();
                haptic?.('light');
              },
              style: { cursor: 'pointer' }
            }, '/ ' + stepsGoal.toLocaleString())
          )
        ),
        React.createElement('div', { className: 'activity-v4-steps__track-wrap no-swipe-zone' },
          React.createElement('div', { className: 'activity-v4-steps__track' },
            React.createElement('div', {
              className: 'activity-v4-steps__fill' + (stepsEstimated ? ' activity-v4-steps__fill--estimated' : ''),
              style: { width: stepsPercent + '%' }
            })
          ),
          React.createElement('div', {
            className: 'activity-v4-steps__slider steps-slider-container'
              + ((stepsEstimated || !(Number(stepsValue) > 0)) ? ' activity-v4-steps__slider--muted' : '')
          },
            // Виден фактический маркер, а удобная зона захвата остаётся на всей
            // полосе: в крайнем положении ручка не превращается в узкую цель.
            React.createElement('div', {
              className: 'steps-slider',
              onMouseDown: handleStepsDrag,
              onTouchStart: handleStepsDrag
            },
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
                style: { left: stepsPercent + '%', borderColor: stepsColor }
              })
            )
          )
        ),
        React.createElement('div', { className: 'activity-v4-steps__foot' },
          React.createElement('span', {
            className: 'activity-v4-steps__kcal'
              + (!(Number(stepsK) > 0) ? ' activity-v4-steps__kcal--zero' : '')
          }, stepsK + ' ккал'),
          React.createElement('span', { className: 'activity-v4-steps__hint' },
            // При оценке подпись зовёт поставить факт: править ползунком
            // подставленное число бессмысленно, пока его не заменили своим.
            stepsEstimated ? 'поставьте факт ползунком' : 'факт — ползунком, цель — тапом')
        ),
        stepsEstimated && React.createElement('div', { className: 'activity-v4-steps__note' },
          'Числа за этот день нет — взята медиана ваших последних 14 дней.'
          + ' Она участвует в расходе и в цели, поэтому помечена.')
      ),

      React.createElement('div', { className: 'activity-v4-today' }, todayRows),

      // Аккордеон остался только внутри тренировок — для карточек с журналом
      // подходов (контракт строка 6). Раскрывается тапом по строке выше.
      cardioOpen && regularTrainingsBlock && React.createElement('div', {
        className: 'activity-v4-today__body'
      }, regularTrainingsBlock),
      React.createElement('div', { className: 'activity-v4-tier' }, 'Действие'),
      React.createElement('button', {
        type: 'button',
        className: 'activity-v4-cta',
        onClick: () => setSheetOpen(true)
      },
        'Добавить активность'
      ),

      React.createElement('div', { className: 'activity-v4-tier' }, 'История'),
      historyIsEmpty
        // Показывать нечего и предлагать нечего — заголовок и проза, без кнопок
        // (контракт «вид · пустые состояния», строка 33).
        ? React.createElement('div', { className: 'activity-v4-history-empty' },
          React.createElement('div', { className: 'activity-v4-history-empty__title' },
            'История начнётся с первой отметки'),
          React.createElement('div', { className: 'activity-v4-history-empty__text' },
            'Календарь зарядки и рост рабочих весов появятся, когда будет что'
            + ' сравнивать: календарь — с первого дня, веса — с двух недель и двух'
            + ' общих упражнений.')
        )
        // Ярус — список .cd из трёх строк, как в кадре «день собран»: сам
        // календарь стоит за строкой «Зарядка», а не развёрнут всегда
        // (контракт «вид · ярус История», строка 24).
        : React.createElement('div', { className: 'activity-v4-history' },
        React.createElement('button', {
          type: 'button',
          className: 'activity-v4-history__row activity-v4-history__row--action',
          onClick: () => setCalOpen((v) => !v),
          'aria-expanded': calOpen
        },
          React.createElement('span', { className: 'activity-v4-history__name' },
            'Зарядка · ' + (Number(chargeDoneDays) || 0) + ' из ' + (Number(chargeTrackedDays) || 0)),
          React.createElement('span', { className: 'activity-v4-history__link' }, '28 дней \u203A')
        ),
        calOpen && React.createElement('div', { className: 'activity-v4-history__cal' }, calendarBlock),
        workingWeightsRow,
        React.createElement('button', {
          type: 'button',
          className: 'activity-v4-history__row activity-v4-history__row--action'
            + ' activity-v4-history__row--last',
          onClick: () => setMonthOpen((v) => !v),
          'aria-expanded': monthOpen
        },
          React.createElement('span', { className: 'activity-v4-history__name' }, 'Тренировки за месяц'),
          React.createElement('span', { className: 'activity-v4-history__delta' }, monthCount + ' \u203A')
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

      trainingLoad && React.createElement('button', {
        type: 'button',
        className: 'activity-v4-load-toggle',
        onClick: () => setLoadOpen((value) => !value),
        'aria-expanded': loadOpen
      },
        React.createElement('span', null, 'Нагрузка'),
        React.createElement('span', null, (loadOpen ? 'Свернуть' : 'Подробнее') + ' ›')
      ),
      loadDetails,

      activitySheet
    );
  }

  function renderActivityCard(params) {
    return React.createElement(ActivityTabV4, params);
  }

  HEYS.dayActivity = {
    render: renderActivityCard,
    collectMonthTrainingRows,
    collectTrainingLoadSummary,
    ActivityTabV4
  };

})(window);
