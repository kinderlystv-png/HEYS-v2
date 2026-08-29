// heys_discipline_matrix_v1.js — матрица «Дисциплина» вкладки Отчётов.
// Контракт reports-insights.v4, раздел «Дисциплина» (решения владельца
// 2026-08-29, развилки — UI_V4_FINDINGS.md):
// - семь строк: питание, вода, шаги, сон, зарядка, тренировки, ведение;
//   нормы из движка, своих не заводим;
// - сводной суммы нет — дисциплину одним числом говорит HEYS Score;
// - знаменатели двухуровневые: «Ведение» — из календарных дней периода,
//   остальные — из дней, где вёлся этот трекер;
// - тренировки — «N за период · Δ» без знаменателя (плана в движке нет),
//   утренние активации из строки исключаются — зарядка своя строка;
// - трекер без данных — словом «не ведётся», не «0 из 0»;
// - Δ — в процентных пунктах доли к прошлому периоду той же длины
//   (у счётных строк без знаменателя — в штуках).
(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});

  function isMorningActivation(training) {
    if (!training || typeof training !== 'object') return false;
    if (training.source === 'morning_activation') return true;
    const label = typeof training.activityLabel === 'string'
      ? training.activityLabel.trim().toLowerCase()
      : '';
    return label === 'зарядка';
  }

  function sleepHoursOf(day) {
    if (!day || !day.sleepStart || !day.sleepEnd) return 0;
    const p = (t) => {
      const m = String(t).match(/^(\d{1,2}):(\d{2})/);
      return m ? (+m[1] * 60 + +m[2]) : null;
    };
    const s = p(day.sleepStart);
    const e = p(day.sleepEnd);
    if (s === null || e === null) return 0;
    let diff = e - s;
    if (diff < 0) diff += 24 * 60;
    return diff / 60;
  }

  function trainingsWithoutActivation(day) {
    return ((day && day.trainings) || []).filter(
      (t) => t && !isMorningActivation(t)
    );
  }

  // Единый предикат «день считается» для порогов обеих вкладок (контракт
  // «до 7 дней»: порог общий с Инсайтами). До 2026-08-29 критериев было три:
  // Инсайты считали любую непустую запись (даже с одним updatedAt), Отчёты —
  // по наличию данных, спарклайн — по !isIncomplete. Пороги 7/14/30 и
  // разблокировка чипа «30» из-за этого расходились между вкладками.
  //
  // isIncomplete ставит сам человек («день не заполнял» — low-cal banner,
  // realdata actions, yesterday verify): такой день из статистик исключён,
  // значит и порог двигать не должен.
  function hasAnyData(day) {
    if (!day) return false;
    if (day.isIncomplete === true) return false;
    const meals = (day.meals || []).some((m) => {
      const items = (m && (m.items || m.food || m.list || m.products)) || [];
      return items.length > 0;
    });
    return meals
      || (+day.weightMorning || 0) > 0
      || sleepHoursOf(day) > 0
      || (+day.steps || 0) > 0
      || (+day.waterMl || 0) > 0
      || ((day.trainings || []).length > 0);
  }

  // Счётчик истории: сколько дней из последних `depth` реально считаются.
  // Один на обе вкладки — шапка Инсайтов, разблокировка окна «30» и порог
  // заглушки Отчётов должны говорить одно и то же число.
  function countHistoryDays(lsGet, depth, clientId) {
    if (typeof lsGet !== 'function') return 0;
    const days = depth || 30;
    const cid = clientId
      || (HEYS.utils && HEYS.utils.getCurrentClientId && HEYS.utils.getCurrentClientId())
      || HEYS.currentClientId
      || '';
    const today = new Date();
    let count = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const scopedKey = cid ? 'heys_' + cid + '_dayv2_' + ds : 'heys_dayv2_' + ds;
      const row = lsGet(scopedKey, null) || lsGet('heys_dayv2_' + ds, null);
      if (row && hasAnyData(row)) count++;
    }
    return count;
  }

  // «День ведён» = заполнено ≥4 полей из 5 (еда · вес · сон · шаги · вода).
  function fieldsFilled(day) {
    if (!day) return 0;
    let n = 0;
    if ((day.meals || []).some((m) => {
      const items = (m && (m.items || m.food || m.list || m.products)) || [];
      return items.length > 0;
    })) n++;
    if ((+day.weightMorning || 0) > 0) n++;
    if (sleepHoursOf(day) > 0) n++;
    if ((+day.steps || 0) > 0) n++;
    if ((+day.waterMl || 0) > 0) n++;
    return n;
  }

  function shareDelta(cur, prev) {
    if (!cur || !cur.tracked) return null;
    if (!prev || !prev.tracked) return null;
    const curShare = cur.inNorm / cur.tracked;
    const prevShare = prev.inNorm / prev.tracked;
    return Math.round((curShare - prevShare) * 100);
  }

  /**
   * Счёт одного окна. entries: [{ day, kcal, target }] — day может быть null
   * (день без записи), kcal/target приходят от вызывающего кода, потому что
   * пересчёт ккал требует индекс продуктов (у Отчётов он уже есть).
   */
  function computeWindow(entries, profile) {
    const prof = profile || {};
    const weight = +prof.weight || 0;
    const waterGoal = weight > 0 ? weight * 30 : 2000;
    const stepsGoal = +prof.stepsGoal || 10000;
    // calcSleepNorm отдаёт range строкой «7-9» (heys_user_v12.js) — диапазон
    // парсим из неё, дефолт взрослых 7–9 ч.
    const sleepNormFn = HEYS.calcSleepNorm;
    const sleepNorm = typeof sleepNormFn === 'function'
      ? sleepNormFn(+prof.age || 30, prof.gender || prof.sex || '')
      : null;
    let sleepMin = 7;
    let sleepMax = 9;
    if (sleepNorm && typeof sleepNorm.range === 'string') {
      const m = sleepNorm.range.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
      if (m) { sleepMin = +m[1]; sleepMax = +m[2]; }
    }
    const rz = HEYS.ratioZones;

    const acc = {
      nutrition: { inNorm: 0, tracked: 0 },
      water: { inNorm: 0, tracked: 0 },
      steps: { inNorm: 0, tracked: 0 },
      sleep: { inNorm: 0, tracked: 0 },
      activation: { count: 0 },
      trainings: { count: 0 },
      tracking: { inNorm: 0, tracked: entries.length }
    };

    entries.forEach((entry) => {
      const day = entry && entry.day;
      const kcal = entry ? +entry.kcal || 0 : 0;
      const target = entry ? +entry.target || 0 : 0;

      if (kcal > 0 && target > 0) {
        acc.nutrition.tracked++;
        const ratio = kcal / target;
        const ok = rz && typeof rz.isStreakDayWithRefeed === 'function'
          ? rz.isStreakDayWithRefeed(ratio, day || {})
          : (ratio >= 0.70 && ratio < 1.35);
        if (ok) acc.nutrition.inNorm++;
      }

      if (!day) return;

      const water = +day.waterMl || 0;
      if (water > 0) {
        acc.water.tracked++;
        if (water >= waterGoal) acc.water.inNorm++;
      }

      const steps = +day.steps || 0;
      if (steps > 0) {
        acc.steps.tracked++;
        if (steps >= stepsGoal) acc.steps.inNorm++;
      }

      const sleep = sleepHoursOf(day);
      if (sleep > 0) {
        acc.sleep.tracked++;
        // Норма сна — диапазон: пересып тоже вне нормы.
        if (sleep >= sleepMin && sleep <= sleepMax) acc.sleep.inNorm++;
      }

      if (((day.trainings || []).some(isMorningActivation))) acc.activation.count++;
      if (trainingsWithoutActivation(day).length > 0) acc.trainings.count++;

      if (fieldsFilled(day) >= 4) acc.tracking.inNorm++;
    });

    return acc;
  }

  /**
   * Матрица дисциплины за окно periodDays, Δ — к предыдущему окну той же
   * длины. entriesCur/entriesPrev — массивы {day, kcal, target} по дням
   * (день без записи — {day: null, kcal: 0, target: 0}).
   */
  function compute(entriesCur, entriesPrev, profile, opts) {
    const options = opts || {};
    const cur = computeWindow(entriesCur || [], profile);
    const prev = computeWindow(entriesPrev || [], profile);

    const ratioRow = (key, label) => {
      const c = cur[key];
      const p = prev[key];
      if (!c.tracked) return { key, label, kind: 'ratio', notTracked: true };
      return {
        key,
        label,
        kind: 'ratio',
        inNorm: c.inNorm,
        tracked: c.tracked,
        share: c.inNorm / c.tracked,
        delta: shareDelta(c, p)
      };
    };

    const countRow = (key, label) => {
      const c = cur[key];
      const p = prev[key];
      return {
        key,
        label,
        kind: 'count',
        count: c.count,
        delta: (entriesPrev && entriesPrev.length) ? c.count - p.count : null
      };
    };

    // «N из плановых M» — только при назначенной кураторской программе;
    // вид строки при программе не нарисован («Открыто до передачи»), поэтому
    // вызывающий код может передать plannedTrainings, но по умолчанию — факт.
    const trainingsRow = countRow('trainings', 'Тренировки');
    if (options.plannedTrainings > 0) {
      trainingsRow.planned = options.plannedTrainings;
    }

    return {
      rows: [
        ratioRow('nutrition', 'Питание'),
        ratioRow('water', 'Вода'),
        ratioRow('steps', 'Шаги'),
        ratioRow('sleep', 'Сон'),
        countRow('activation', 'Зарядка'),
        trainingsRow,
        // «Ведение» — из календарных дней периода.
        {
          key: 'tracking',
          label: 'Ведение',
          kind: 'ratio',
          inNorm: cur.tracking.inNorm,
          tracked: cur.tracking.tracked,
          share: cur.tracking.tracked ? cur.tracking.inNorm / cur.tracking.tracked : 0,
          delta: shareDelta(cur.tracking, prev.tracking)
        }
      ]
    };
  }

  HEYS.DisciplineMatrix = {
    compute,
    // Публичное API порога — обе вкладки считают дни одинаково.
    hasAnyData,
    countHistoryDays,
    _test: {
      computeWindow,
      fieldsFilled,
      hasAnyData,
      sleepHoursOf,
      isMorningActivation
    }
  };
})(window);
