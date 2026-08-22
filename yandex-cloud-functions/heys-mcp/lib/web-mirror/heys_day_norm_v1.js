// heys_day_norm_v1.js — единая норма дня (база + NDTE + долг/рефид)
//
// Один resolve() для Главной, Питания и MCP. savedDisplayOptimum сюда не
// читается: это кэш отрисовки, не решение.
//
// Синхронный: блобы только из lsGet / pastBlobs. Если окна долга нет —
// source: 'estimate' и явный why, не молчаливый correction=0.
// Подтянуть облако — ensurePastDays() снаружи, не await внутри resolve.

(function (global) {
  'use strict';
  const HEYS = global.HEYS = global.HEYS || {};

  function addDays(iso, delta) {
    const raw = String(iso || '').slice(0, 10);
    const [y, m, d] = raw.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(Date.UTC(y, m - 1, d + Number(delta || 0)));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  function insulinWave() {
    const iw = HEYS.InsulinWave;
    if (!iw) return null;
    if (iw.__internals && typeof iw.__internals.calculateNDTEDayAverage === 'function') {
      return iw.__internals;
    }
    if (typeof iw.calculateNDTEDayAverage === 'function') return iw;
    return null;
  }

  const GENDERS = ['Мужской', 'Женский'];

  function profileReady(day, profile) {
    const p = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : null;
    if (!p) return { ok: false, reason: 'no_profile' };
    const weight = Number(day && day.weightMorning) || Number(p.weight) || 0;
    const height = Number(p.height) || 0;
    const hasAge = !!(p.birthDate) || Number(p.age) > 0;
    const gender = GENDERS.indexOf(p.gender) >= 0 ? p.gender : null;
    if (!weight || !height || !hasAge || !gender) return { ok: false, reason: 'profile_incomplete' };
    return { ok: true, reason: null };
  }

  function isNotPerformed(t) {
    const TK = HEYS.TrainingKernel;
    if (TK && TK.load && typeof TK.load.isNotPerformedTraining === 'function') {
      return TK.load.isNotPerformedTraining(t);
    }
    return !!(t && t.plan && t.plan.status === 'assigned');
  }

  function lsGetFn(opts) {
    if (opts && typeof opts.lsGet === 'function') return opts.lsGet;
    if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') return HEYS.utils.lsGet;
    return null;
  }

  function readDayBlob(date, opts) {
    if (!date) return null;
    if (opts && opts.pastBlobs && opts.pastBlobs[date]) return opts.pastBlobs[date];
    const lsGet = lsGetFn(opts);
    if (!lsGet) return null;
    const blob = lsGet(`heys_dayv2_${date}`, null);
    return blob && typeof blob === 'object' ? blob : null;
  }

  function mealKcal(day) {
    const meals = (day && day.meals) || [];
    let kcal = 0;
    for (const meal of meals) {
      const items = (meal && meal.items) || [];
      for (const item of items) {
        const g = (Number(item && item.grams) || 0) / 100;
        kcal += (Number(item && item.kcal100) || 0) * g;
      }
    }
    return Math.round(kcal);
  }

  function ndteVolumeWeight(profile, prevDay) {
    return Number(profile && profile.weight)
      || Number(prevDay && prevDay.weightMorning)
      || 70;
  }

  function ndteBoost(prevDay, profile, bmr, dayDate) {
    const iw = insulinWave();
    const all = (prevDay && Array.isArray(prevDay.trainings)) ? prevDay.trainings : [];
    const trainings = all.filter((t) => !isNotPerformed(t));
    if (!iw || typeof iw.calculateNDTEDayAverage !== 'function' || !trainings.length || !bmr) return 0;

    const volW = ndteVolumeWeight(profile, prevDay);
    let totalKcal = 0;
    for (const t of trainings) {
      totalKcal += iw.utils && iw.utils.calculateTrainingKcal
        ? iw.utils.calculateTrainingKcal(t, volW)
        : 0;
    }
    if (totalKcal < 300) return 0;

    const pick = (iw.pickNdteAnchorTraining || (HEYS.InsulinWave && HEYS.InsulinWave.pickNdteAnchorTraining))
      ? (iw.pickNdteAnchorTraining || HEYS.InsulinWave.pickNdteAnchorTraining)(trainings)
      : null;
    const prevDate = (prevDay && prevDay.date) || addDays(dayDate, -1);
    const height = (Number(profile && profile.height) || 170) / 100;
    const weight = Number(profile && profile.weight) || 0;
    const bmi = weight && height ? Math.round(weight / (height * height) * 10) / 10 : 22;
    const ndte = iw.calculateNDTEDayAverage({
      trainingKcal: totalKcal,
      bmi,
      trainingType: (pick && pick.type) || (trainings[0] && trainings[0].type) || 'cardio',
      trainingsCount: trainings.length,
      dayDate,
      prevDate,
      trainingTime: pick && pick.time,
    });
    return Math.round(bmr * ((ndte && ndte.tdeeBoost) || 0));
  }

  function withNdte(tdee, ndte) {
    const baseExp = Math.round((Number(tdee && tdee.baseExpenditure) || 0) + (Number(ndte) || 0));
    const def = Number(tdee && tdee.deficitPct) || 0;
    const cyc = Number(tdee && tdee.cycleMultiplier) || 1;
    return Math.round(Math.round(baseExp * (1 + def / 100)) * cyc);
  }

  function calcTdee(day, profile, opts) {
    if (!HEYS.TDEE || typeof HEYS.TDEE.calculate !== 'function') return null;
    return HEYS.TDEE.calculate(day || {}, profile || {}, {
      includeNDTE: false,
      hrZones: Array.isArray(opts && opts.hrZones) ? opts.hrZones : [],
      lsGet: lsGetFn(opts) || (() => null),
    });
  }

  function dayBase(day, profile, opts, prevBlob) {
    const tdee = calcTdee(day, profile, opts);
    if (!tdee || !(tdee.optimum > 0)) {
      return { kcal: 0, ndte: 0, tdee, reason: tdee ? 'profile_incomplete' : 'no_tdee' };
    }
    const ndte = ndteBoost(prevBlob, profile, tdee.bmr, day && day.date);
    return { kcal: withNdte(tdee, ndte), ndte, tdee, reason: null };
  }

  function buildDebtWindow(date, profile, opts) {
    if (!date) return [];
    const out = [];
    for (let back = 3; back >= 1; back -= 1) {
      const d = addDays(date, -back);
      const blob = readDayBlob(d, opts);
      if (!blob) continue;
      const prev = readDayBlob(addDays(d, -1), opts);
      const own = dayBase({ ...blob, date: blob.date || d }, profile, opts, prev);
      if (!(own.kcal > 0)) continue;
      out.push({
        date: d,
        kcal: mealKcal(blob),
        baseTarget: own.kcal,
        target: own.kcal,
        isRefeedDay: blob.isRefeedDay === true,
        isFastingDay: blob.isFastingDay === true,
        isIncomplete: blob.isIncomplete === true,
        hasTraining: (own.tdee && own.tdee.trainingsKcal) > 0,
        trainingKcal: (own.tdee && own.tdee.trainingsKcal) || 0,
        isToday: false,
        isFuture: false,
      });
    }
    return out;
  }

  function resolve(day, profile, opts) {
    const options = opts || {};
    const date = day && day.date;
    const empty = {
      kcal: 0,
      base: 0,
      correction: 0,
      ndte: 0,
      maintenance: 0,
      deficit_pct: 0,
      source: null,
      why: '',
      parts: null,
      tdee: null,
      window_days: 0,
    };

    const gate = profileReady(day, profile);
    if (!gate.ok) {
      return {
        ...empty,
        source: null,
        reason: gate.reason,
        why: gate.reason === 'no_profile' ? 'нет профиля' : 'профиль неполный',
      };
    }

    const prevDate = addDays(date, -1);
    let prevBlob;
    if (options.prevDay !== undefined) prevBlob = options.prevDay;
    else prevBlob = readDayBlob(prevDate, options);

    const own = dayBase(day, profile, options, prevBlob);
    if (!(own.kcal > 0)) {
      return {
        ...empty,
        source: null,
        reason: own.reason || 'profile_incomplete',
        why: own.reason === 'no_tdee' ? 'нет модуля TDEE' : 'профиль неполный',
        tdee: own.tdee,
      };
    }

    const meta = day && day.savedOptimumMeta && typeof day.savedOptimumMeta === 'object'
      ? day.savedOptimumMeta
      : null;
    let ndte = own.ndte;
    if (options.prevDay === undefined && !prevBlob && meta) {
      ndte = Number(meta.ndte) || ndte;
    }

    const tdee = own.tdee;
    const base = withNdte(tdee, ndte);
    const maintenance = withNdte({ ...tdee, deficitPct: 0 }, ndte);
    const deficitPct = Number(tdee.deficitPct) || 0;

    const windowDays = buildDebtWindow(date, profile, options);
    const debt = (windowDays.length >= 2 && HEYS.dayCaloricDebtCore
      && typeof HEYS.dayCaloricDebtCore.computeDebtCore === 'function')
      ? HEYS.dayCaloricDebtCore.computeDebtCore({
        date,
        day,
        prof: profile,
        optimum: base,
        sparklineData: windowDays,
        fmtDate: (d) => (d && d.toISOString ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)),
      })
      : null;

    let kcal = base;
    let correction = 0;
    let source = 'computed';
    let why = 'ни долга, ни перебора за последние дни нет';

    if (day && day.isRefeedDay === true && HEYS.Refeed && typeof HEYS.Refeed.getRefeedOptimum === 'function') {
      kcal = HEYS.Refeed.getRefeedOptimum(base, true);
      correction = kcal - base;
      why = 'загрузочный день, норма поднята';
    } else if (debt && debt.dailyBoost > 0) {
      correction = debt.dailyBoost;
      kcal = base + correction;
      why = `накопленный недобор за ${windowDays.length} дн — надбавка ${correction} ккал`;
    } else if (debt && debt.dailyReduction > 0 && !debt.hasDebt) {
      correction = -debt.dailyReduction;
      kcal = base + correction;
      why = `перебор за последние дни — мягкое снижение на ${debt.dailyReduction} ккал`;
    }

    if (!debt && !(day && day.isRefeedDay === true)) {
      if (windowDays.length >= 2) {
        why = 'в прошлых днях слишком мало еды для расчёта долга — поправка не применена';
      } else {
        source = 'estimate';
        why = 'история за прошлые дни недоступна, поправка на недобор не учтена';
      }
    }

    return {
      kcal,
      base,
      correction,
      ndte,
      maintenance,
      deficit_pct: deficitPct,
      source,
      why,
      window_days: windowDays.length,
      tdee,
      parts: {
        base,
        maintenance,
        deficit_pct: deficitPct,
        correction,
        ndte,
        window_days: windowDays.length,
      },
    };
  }

  function kcalOf(day, profile, opts) {
    const r = resolve(day, profile, opts);
    return r && r.kcal > 0 ? r.kcal : 0;
  }

  function pastDates(date) {
    return [1, 2, 3, 4].map((back) => addDays(date, -back)).filter(Boolean);
  }

  function ensurePastDays(date) {
    const dates = pastDates(date);
    const cloud = HEYS.cloud;
    if (cloud && typeof cloud.fetchDays === 'function' && dates.length) {
      return cloud.fetchDays(dates);
    }
    return Promise.resolve([]);
  }

  HEYS.dayNorm = {
    resolve,
    kcal: kcalOf,
    ensurePastDays,
    pastDates,
    addDays,
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
