// heys_mobility_calendar_v1.js — weekly mobility planning helper.
//
// Stateless domain planner: turns phase/profile/records into a week of mode IDs.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__calendarRegistered) return;
  Mobility.__calendarRegistered = true;

  const DAY_MS = 24 * 60 * 60 * 1000;

  function kernelDates() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.dates;
  }
  function kernelCalendar() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.calendar;
  }

  function isoDate(date) {
    const kd = kernelDates();
    if (kd && typeof kd.dateKeyUTC === 'function') return kd.dateKeyUTC(date);
    return new Date(date).toISOString().slice(0, 10);
  }
  function startDateOf(input) {
    const kd = kernelDates();
    if (kd && typeof kd.startDate === 'function') return kd.startDate(input);
    const d = input ? new Date(input) : new Date();
    if (!isFinite(d.getTime())) return new Date();
    return d;
  }
  function latestAssessmentDate(records) {
    const items = records && Array.isArray(records.assessments) ? records.assessments : [];
    if (!items.length) return null;
    const item = items[items.length - 1];
    return item && (item.savedAt || item.date || item.createdAt || null);
  }
  function retestInfo(records, opts) {
    const last = latestAssessmentDate(records);
    const now = opts && opts.nowDate;
    const intervalWeeks = opts && opts.retestIntervalWeeks || 6;
    const due = Mobility.assessment && typeof Mobility.assessment.retestDue === 'function'
      ? Mobility.assessment.retestDue(last, now, intervalWeeks)
      : !last;
    return { due: due, lastDate: last, intervalWeeks: intervalWeeks };
  }
  function baseModesForFocus(focus, profile) {
    const pops = profile && Array.isArray(profile.populations) ? profile.populations : [];
    if (focus === 'maintain') return ['anti_sedentary', 'develop_mobility', 'evening_relax'];
    if (focus === 'deload') return ['anti_sedentary', 'post_workout', 'evening_relax'];
    if (pops.indexOf('desk') >= 0) return ['anti_sedentary', 'develop_mobility', 'anti_sedentary', 'evening_relax'];
    return ['develop_mobility', 'anti_sedentary', 'develop_mobility', 'evening_relax'];
  }
  function dayLabel(idx) {
    const kd = kernelDates();
    if (kd && typeof kd.dayLabel === 'function') return kd.dayLabel(idx);
    return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][idx] || String(idx + 1);
  }
  function buildWeekPlan(profile, opts) {
    const o = opts || {};
    const records = o.records || {};
    const period = Mobility.modeEngine && typeof Mobility.modeEngine.periodizationAdvice === 'function'
      ? Mobility.modeEngine.periodizationAdvice(o)
      : { focus: 'develop', avoidHighTissueLoad: false, msg: '' };
    const modes = baseModesForFocus(period.focus, profile);
    const start = startDateOf(o.startDate);
    const retest = retestInfo(records, o);
    const kc = kernelCalendar();
    const kd = kernelDates();
    const calendarDays = kc && typeof kc.buildDays === 'function'
      ? kc.buildDays(start, 7, { utc: true })
      : (kd && typeof kd.sequenceDays === 'function' ? kd.sequenceDays(start, 7, { utc: true }) : null);
    const days = (calendarDays || Array.from({ length: 7 }, function (_, i) {
      const date = kd && typeof kd.addDays === 'function'
        ? kd.addDays(start, i)
        : new Date(start.getTime() + i * DAY_MS);
      return { index: i, date: date, dateKey: isoDate(date), label: dayLabel(i) };
    })).map(function (day) {
      const modeId = modes[day.index % modes.length];
      const mode = Mobility.modeEngine && Mobility.modeEngine.getMode ? Mobility.modeEngine.getMode(modeId) : null;
      return {
        date: day.dateKey || isoDate(day.date),
        label: day.label || dayLabel(day.index),
        modeId: modeId,
        modeLabel: mode ? mode.label : modeId,
        focus: period.focus,
        reason: period.msg
      };
    });
    return {
      focus: period.focus,
      avoidHighTissueLoad: !!period.avoidHighTissueLoad,
      retest: retest,
      days: days
    };
  }

  Mobility.calendar = {
    __registered: true,
    buildWeekPlan: buildWeekPlan,
    retestInfo: retestInfo
  };
})(typeof window !== 'undefined' ? window : globalThis);
