// heys_fingers_readiness_v1.js — Readiness Score из morning checkin + yesterday FB load.
// Wave 2-A: реализует формулу из плана stateless-singing-deer.md → раздел "Readiness Score".
//
// Public API:
//   HEYS.Fingers.readiness.assess(today, history) → { score, bucket, reasons }
//
// today:    { moodMorning, wellbeingMorning, stressMorning, sleepStart, sleepEnd,
//             sleepQuality, fingers?: { lastSessionAt, lastIntensity, injuryFlag } }
// history:  массив объектов dayv2 за последние 14 дней (включая today).
//
// bucket:
//   75-100 → 'max-protocol-ok'
//   55-74  → 'moderate-only'
//   35-54  → 'recovery-only'
//   0-34   → 'rest-day'
//
// Hard overrides:
//   yesterday max && <48h               → rest-day
//   today.fingers.injuryFlag === true   → rest-day на 30 дней
//
// Graceful degradation:
//   0 дней    → recommendation = 'moderate-only', reason = 'no-history'
//   1-3 дня   → static thresholds
//   4-13 дней → partial baseline + shrink z по n/14

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__readinessRegistered) return; // idempotent
  Fingers.__readinessRegistered = true;

  // === Утилиты ===

  function clamp(x, lo, hi) {
    if (x < lo) return lo;
    if (x > hi) return hi;
    return x;
  }

  function median(arr) {
    if (!arr.length) return 0;
    const sorted = arr.slice().sort(function (a, b) { return a - b; });
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /** Median Absolute Deviation × 1.4826 = robust sigma estimate. */
  function madSigma(arr) {
    if (!arr.length) return 1;
    const med = median(arr);
    const deviations = arr.map(function (v) { return Math.abs(v - med); });
    const mad = median(deviations);
    return Math.max(mad * 1.4826, 0.5); // floor чтобы не делить на ~0
  }

  function parseSleepHours(day) {
    if (!day || !day.sleepStart || !day.sleepEnd) return null;
    const s = String(day.sleepStart).match(/^(\d{1,2}):(\d{2})$/);
    const e = String(day.sleepEnd).match(/^(\d{1,2}):(\d{2})$/);
    if (!s || !e) return null;
    const sMin = Number(s[1]) * 60 + Number(s[2]);
    const eMin = Number(e[1]) * 60 + Number(e[2]);
    let diff = eMin - sMin;
    if (diff <= 0) diff += 24 * 60; // ночь через полночь
    return diff / 60;
  }

  function bucketFromScore(score) {
    if (score >= 75) return 'max-protocol-ok';
    if (score >= 55) return 'moderate-only';
    if (score >= 35) return 'recovery-only';
    return 'rest-day';
  }

  /**
   * Главная функция оценки готовности.
   * @param {object} today
   * @param {Array<object>} history — массив dayv2 за последние 14 дней (включая today).
   * @returns {{score:number,bucket:string,reasons:Array<string>}}
   */
  function assess(today, history) {
    const reasons = [];
    const safeToday = today || {};
    const hist = Array.isArray(history) ? history : [];

    // === Hard overrides — проверяем первыми ===

    // Injury flag → 30 дней rest
    if (safeToday.fingers && safeToday.fingers.injuryFlag === true) {
      reasons.push('Активен флаг травмы — отдых обязателен');
      return { score: 0, bucket: 'rest-day', reasons: reasons };
    }

    // Yesterday max session < 48ч
    const yesterdayFb = getYesterdayFb(safeToday, hist);
    if (yesterdayFb && yesterdayFb.intensity === 'max' && yesterdayFb.hoursAgo != null && yesterdayFb.hoursAgo < 48) {
      reasons.push('Вчера была max-сессия (< 48ч назад) — нужен отдых для сухожилий');
      return { score: 0, bucket: 'rest-day', reasons: reasons };
    }

    // === Graceful degradation: 0 дней истории ===
    const validHistory = hist.filter(function (d) {
      return d && d !== safeToday
        && Number.isFinite(Number(d.moodMorning))
        && Number.isFinite(Number(d.wellbeingMorning));
    });

    if (validHistory.length === 0) {
      reasons.push('Недостаточно истории — рекомендация по умолчанию');
      return { score: 60, bucket: 'moderate-only', reasons: reasons };
    }

    // === Graceful degradation: 1-3 дня — static thresholds ===
    if (validHistory.length < 4) {
      return assessStatic(safeToday, yesterdayFb, reasons);
    }

    // === 4-13 дней: partial baseline + shrink ===
    // 14+ дней: full baseline
    const moods = validHistory.map(function (d) { return Number(d.moodMorning); }).filter(Number.isFinite);
    const wbs = validHistory.map(function (d) { return Number(d.wellbeingMorning); }).filter(Number.isFinite);
    const stresses = validHistory.map(function (d) { return Number(d.stressMorning); }).filter(Number.isFinite);
    const sleepsArr = validHistory.map(parseSleepHours).filter(function (v) { return Number.isFinite(v); });

    const baseline = {
      mood: median(moods),
      wellbeing: median(wbs),
      stress: stresses.length ? median(stresses) : 5,
      sleepHrs: sleepsArr.length ? median(sleepsArr) : 7.5
    };

    const sigma = {
      mood: madSigma(moods),
      wellbeing: madSigma(wbs),
      stress: stresses.length ? madSigma(stresses) : 1,
      sleepHrs: sleepsArr.length ? madSigma(sleepsArr) : 1
    };

    const shrink = Math.min(1, validHistory.length / 14);

    let score = 50;

    const todayMood = Number(safeToday.moodMorning);
    const todayWb = Number(safeToday.wellbeingMorning);
    const todayStress = Number(safeToday.stressMorning);
    const todaySleep = parseSleepHours(safeToday);

    if (Number.isFinite(todayMood)) {
      const moodZ = (todayMood - baseline.mood) / sigma.mood;
      const delta = clamp(moodZ * 10, -20, 20) * shrink;
      score += delta;
      if (delta < -10) reasons.push('Настроение ниже личной нормы');
      else if (delta > 10) reasons.push('Настроение выше нормы — хороший день');
    }

    if (Number.isFinite(todayWb)) {
      const wbZ = (todayWb - baseline.wellbeing) / sigma.wellbeing;
      const delta = clamp(wbZ * 12.5, -25, 25) * shrink;
      score += delta;
      if (delta < -15) reasons.push('Самочувствие заметно ниже нормы');
      else if (delta > 15) reasons.push('Самочувствие выше нормы');
    }

    if (Number.isFinite(todayStress)) {
      // stress инвертирован: меньше = лучше
      const stressZ = (baseline.stress - todayStress) / sigma.stress;
      const delta = clamp(stressZ * 7.5, -15, 15) * shrink;
      score += delta;
      if (delta < -10) reasons.push('Стресс выше обычного');
    }

    if (Number.isFinite(todaySleep)) {
      if (todaySleep < 5) { score -= 25; reasons.push('Сон менее 5 часов — рекомендуется только лёгкая активность'); }
      else if (todaySleep < 6) { score -= 10; reasons.push('Сон менее 6 часов'); }
      else if (todaySleep >= baseline.sleepHrs - 0.5) { score += 5; }
    }

    if (yesterdayFb) {
      if (yesterdayFb.intensity === 'max') { score -= 30; reasons.push('Вчера была max-нагрузка на пальцы'); }
      else if (yesterdayFb.intensity === 'moderate') { score -= 15; reasons.push('Вчера была умеренная нагрузка на пальцы'); }
      else if (yesterdayFb.intensity === 'recovery') { score -= 5; }
    }

    const finalScore = Math.round(clamp(score, 0, 100));
    return { score: finalScore, bucket: bucketFromScore(finalScore), reasons: reasons };
  }

  /**
   * Static thresholds для 1-3 дней истории.
   * mood<5 OR wb<5 OR sleep<6 OR yesterday=max → recovery-only.
   */
  function assessStatic(today, yesterdayFb, reasons) {
    const mood = Number(today.moodMorning);
    const wb = Number(today.wellbeingMorning);
    const sleep = parseSleepHours(today);

    let score = 65;
    let downgraded = false;

    if (Number.isFinite(mood) && mood < 5) { score = 45; downgraded = true; reasons.push('Настроение ниже среднего'); }
    if (Number.isFinite(wb) && wb < 5) { score = 45; downgraded = true; reasons.push('Самочувствие ниже среднего'); }
    if (Number.isFinite(sleep) && sleep < 6) { score = 40; downgraded = true; reasons.push('Сон менее 6 часов'); }
    if (yesterdayFb && yesterdayFb.intensity === 'max') { score = 35; downgraded = true; reasons.push('Вчера была max-нагрузка'); }

    if (!downgraded) reasons.push('Истории мало — оценка по упрощённым правилам');
    return { score: score, bucket: bucketFromScore(score), reasons: reasons };
  }

  /**
   * Вытаскивает данные о вчерашней FB-сессии: intensity + сколько часов назад.
   * Ищет в today.fingers.lastSessionAt / lastIntensity (заполняется session_ui на финише).
   * Альтернатива: history[1] (предыдущий день), если есть fingers.lastIntensity.
   */
  function getYesterdayFb(today, history) {
    // 1. Приоритет — today.fingers (свежая запись из last session)
    if (today.fingers && today.fingers.lastSessionAt) {
      const at = Number(today.fingers.lastSessionAt);
      if (Number.isFinite(at)) {
        const hoursAgo = (Date.now() - at) / (1000 * 60 * 60);
        return {
          intensity: today.fingers.lastIntensity || 'moderate',
          hoursAgo: hoursAgo
        };
      }
    }
    // 2. Fallback — предыдущий день в истории
    const prev = history.find(function (d) {
      return d && d !== today && d.fingers && d.fingers.lastIntensity;
    });
    if (prev && prev.fingers && prev.fingers.lastSessionAt) {
      const at = Number(prev.fingers.lastSessionAt);
      if (Number.isFinite(at)) {
        return {
          intensity: prev.fingers.lastIntensity,
          hoursAgo: (Date.now() - at) / (1000 * 60 * 60)
        };
      }
    }
    return null;
  }

  // === Экспорт ===
  Fingers.readiness = {
    assess: assess,
    // exposed для тестов / debugging
    _parseSleepHours: parseSleepHours,
    _bucketFromScore: bucketFromScore
  };
})(typeof window !== 'undefined' ? window : globalThis);
