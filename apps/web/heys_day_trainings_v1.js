// heys_day_trainings_v1.js — Trainings + household block renderer
// Extracted from heys_day_v12.js (trainings block)

; (function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  let _approachIdSeq = 0;
  let _exerciseIdSeq = 0;

  /** Как в шаге «Зоны пульса» / настройках профиля (индекс 0…3). */
  const WB_KCAL_ZONE_LABELS = ['Разминка', 'Жиросжигание', 'Аэробная', 'Анаэробная'];

  /**
   * Цена минуты быта — над покоем, как в расчёте дня (TDEE `householdKcal`).
   * Брутто-MET на бейдже давал 60 мин при 80 кг = 210 ккал против 126 в строке
   * «Бытовая активность» ярусом выше: два разных числа про одну и ту же запись
   * на одном экране (разбор «Актив» 2026-08-30, дефект B).
   */
  const HOUSEHOLD_MET = 2.5;
  function householdNetKcalPerMin(weight, kcalPerMinFn) {
    const tdeeNet = HEYS.TDEE && HEYS.TDEE.netKcalPerMin;
    if (typeof tdeeNet === 'function') {
      const v = +tdeeNet(HOUSEHOLD_MET, weight);
      if (Number.isFinite(v)) return v;
    }
    if (typeof kcalPerMinFn !== 'function') return 0;
    return kcalPerMinFn(HOUSEHOLD_MET - 1, weight);
  }

  /**
   * Поля подхода вне базовой формы `{id, weightKg, reps, done}`, от которых
   * зависит арифметика: тип (разминка вне тоннажа), сбросы, довес, время и
   * метры. Список зеркалит `TK.strength.normalizeApproach` — расходиться им
   * нельзя, иначе тоннаж на дне и в конструкторе разъедется.
   */
  const APPROACH_CARRY_FIELDS = ['type', 'extraWeightKg', 'drops', 'durationSec', 'distanceM'];
  /** Отметка боли — факт прошедшего подхода, а не его состав: в повтор не едет. */
  const APPROACH_FACT_FIELDS = ['discomfort', 'discomfortNote'];
  /** Снимок справочника на упражнении: от него считается тоннаж своего веса. */
  const EXERCISE_CARRY_FIELDS = ['exerciseId', 'unit', 'bodyweightFactor', 'primaryGroup', 'secondaryGroups'];

  function carryApproachSnapshotFields(out, src, keepFacts) {
    const ks = HEYS.TrainingKernel && HEYS.TrainingKernel.strength;
    const from = (ks && typeof ks.normalizeApproach === 'function')
      ? ks.normalizeApproach(src)
      : (src && typeof src === 'object' ? src : {});
    const keys = keepFacts ? APPROACH_CARRY_FIELDS.concat(APPROACH_FACT_FIELDS) : APPROACH_CARRY_FIELDS;
    for (let i = 0; i < keys.length; i++) {
      const v = from[keys[i]];
      if (v === undefined || v === null) continue;
      out[keys[i]] = Array.isArray(v) ? v.slice() : v;
    }
    return out;
  }

  function carryExerciseSnapshotFields(out, src) {
    const e = src && typeof src === 'object' ? src : {};
    for (let i = 0; i < EXERCISE_CARRY_FIELDS.length; i++) {
      const v = e[EXERCISE_CARRY_FIELDS[i]];
      if (v === undefined || v === null) continue;
      out[EXERCISE_CARRY_FIELDS[i]] = Array.isArray(v) ? v.slice() : v;
    }
    return out;
  }

  /** Повтор прошлой тренировки — это план, а не её копия: отметки сбрасываются. */
  function resetCarriedDropsDone(approach) {
    if (approach && Array.isArray(approach.drops)) {
      approach.drops = approach.drops.map(function (d) {
        return Object.assign({}, d, { done: false });
      });
    }
    return approach;
  }

  /**
   * Масса тела для тоннажа: упражнения со своим весом считаются как
   * `масса × коэффициент`, и без массы ядро отдаёт по ним ноль
   * (`unmeasuredExercises`). Конструктор её передаёт
   * (strength/heys_strength_builder_ui_v1.js), а день — нет, и одна и та же
   * тренировка показывала разный тоннаж в двух местах (разбор «Актив»
   * 2026-08-30, предусловие решения 7).
   *
   * Берём вес того дня, а не сегодняшний: тоннаж прошлой тренировки не должен
   * меняться от того, что человек сегодня взвесился. Правило то же, что у TDEE.
   */
  function bodyWeightForDay(dayData) {
    const fromDay = +(dayData && dayData.weightMorning) || 0;
    if (fromDay > 0) return fromDay;
    const U = HEYS.utils || {};
    if (typeof U.lsGet !== 'function') return 0;
    try {
      const prof = U.lsGet('heys_profile', {}) || {};
      return +prof.weight || 0;
    } catch (_) {
      return 0;
    }
  }

  function readDayFromStore(dateStr) {
    const U = HEYS.utils || {};
    if (typeof U.lsGet !== 'function') return null;
    let cid = '';
    try {
      const prof = U.lsGet('heys_profile', {}) || {};
      cid = prof.clientId || prof.cid || '';
    } catch (_) { /* noop */ }
    const withCid = cid ? U.lsGet('heys_' + cid + '_dayv2_' + dateStr, null) : null;
    return withCid || U.lsGet('heys_dayv2_' + dateStr, null) || null;
  }

  /**
   * Дописать тренировку в другой день — единственная операция переноса, которой
   * у карточки дня не было: React-состояние держит только открытый день, а
   * целевой лежит в хранилище. Пишем тем же путём, что и остальной день
   * (lsSet → Store.set → облако), чтобы перенос доехал до куратора сам.
   */
  function appendTrainingToDay(dateStr, training) {
    const U = HEYS.utils || {};
    if (typeof U.lsGet !== 'function' || typeof U.lsSet !== 'function') return false;
    let cid = '';
    try { cid = HEYS.currentClientId || ''; } catch (_) { cid = ''; }
    const key = cid ? 'heys_' + cid + '_dayv2_' + dateStr : 'heys_dayv2_' + dateStr;
    const existing = U.lsGet(key, null) || { date: dateStr, meals: [], trainings: [] };
    const list = Array.isArray(existing.trainings) ? existing.trainings.slice() : [];
    // Лимит тот же, что у дня: занятый день до сюда доходить не должен, но
    // проверка стоит и здесь — между показом списка и выбором проходит время.
    const real = list.filter(function (t) {
      return t && (t.time || (Array.isArray(t.z) && t.z.some(function (m) { return +m > 0; })) || t.workoutLog);
    });
    if (real.length >= 3) return false;
    list.push(training);
    const next = Object.assign({}, existing, {
      date: existing.date || dateStr,
      trainings: list,
      updatedAt: Date.now()
    });
    try {
      U.lsSet(key, next);
      return true;
    } catch (_) {
      return false;
    }
  }

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function prevCalendarDateParts(y, m, d) {
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  }

  function dayKeyFromParts(y, m, d) {
    return y + '-' + pad2(m) + '-' + pad2(d);
  }

  /** Сегодняшняя дата в формате дня — для различения карточек экрана 02/09 (сегодня) и будущего дня. */
  function todayDateKeyForPlan() {
    const now = new Date();
    return dayKeyFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  /**
   * Модульный кэш исторических сканов. Ключи — '<funcTag>|<normName>|<refDate>|<curTi>|<curExi>'.
   * Полная инвалидация по событию heys:day-updated (приходит при любом изменении dayv2_*).
   * Без кэша на cold-render с 8 упражнениями было до ~2880 LS-чтений.
   */
  const _historyCache = (function () {
    const map = new Map();
    function clear() { map.clear(); }
    if (typeof global.addEventListener === 'function') {
      try {
        global.addEventListener('heys:day-updated', clear);
        global.addEventListener('storage', function (e) {
          if (!e || !e.key) { clear(); return; }
          if (String(e.key).indexOf('dayv2_') >= 0) clear();
        });
      } catch (_e) { /* noop */ }
    }
    return {
      get: function (key) { return map.has(key) ? map.get(key) : undefined; },
      set: function (key, val) {
        if (map.size > 600) {
          const firstKey = map.keys().next().value;
          map.delete(firstKey);
        }
        map.set(key, val);
        return val;
      },
      clear: clear,
      _size: function () { return map.size; }
    };
  })();

  function _normName(s) {
    return typeof HEYS.normalizeExerciseName === 'function'
      ? HEYS.normalizeExerciseName(s || '')
      : String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  }

  /** Web Audio короткий двойной бип на финише отдыха (чтобы не зависеть только от вибры). */
  let _audioCtx = null;
  function _getAudioCtx() {
    if (_audioCtx) return _audioCtx;
    try {
      const Ctor = global.AudioContext || global.webkitAudioContext;
      if (!Ctor) return null;
      _audioCtx = new Ctor();
    } catch (_e) {
      _audioCtx = null;
    }
    return _audioCtx;
  }
  function playRestDoneBeep() {
    const ctx = _getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (_e) { /* noop */ }
    }
    function tone(startOffset, freq, durMs, gainPeak) {
      const t0 = ctx.currentTime + startOffset;
      const t1 = t0 + durMs / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
    tone(0,    880, 120, 0.18);
    tone(0.18, 1320, 180, 0.22);
  }
  // 🤚 Exposed for reuse by Fingers module (heys_fingers_timer_v1.js).
  try { HEYS.__playRestDoneBeep = playRestDoneBeep; } catch (_) { /* noop */ }

  /** Последние сохранённые вес/подходы/повторы по нормализованному имени (прошлые дни + раньше в этот день). */
  function findLastExerciseSnapshot(dateKey, norm, curTi, curExi) {
    const normKey = _normName(norm);
    if (!normKey || !dateKey) return null;
    const cacheKey = 'last|' + normKey + '|' + dateKey + '|' + curTi + '|' + curExi;
    const cached = _historyCache.get(cacheKey);
    if (cached !== undefined) return cached;

    function matchEx(ex) {
      const n = typeof HEYS.normalizeExerciseName === 'function'
        ? HEYS.normalizeExerciseName(ex && ex.name ? ex.name : '')
        : String(ex && ex.name ? ex.name : '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
      return n === normKey;
    }

    function pickFromTrainingList(trainings, beforeTi, beforeExi, sameDay) {
      let best = null;
      if (!Array.isArray(trainings)) return null;
      for (let ti = 0; ti < trainings.length; ti++) {
        const tr = trainings[ti];
        if (!tr || String(tr.type) !== 'strength' || tr.strengthEntryMode !== 'workout_builder') continue;
        const wl = tr.workoutLog;
        if (!wl || !Array.isArray(wl.exercises)) continue;
        for (let exi = 0; exi < wl.exercises.length; exi++) {
          if (sameDay) {
            if (ti > curTi) continue;
            if (ti === curTi && exi >= curExi) continue;
          }
          const ex = wl.exercises[exi];
          if (!matchEx(ex)) continue;
          const score = ti * 1000 + exi;
          const prevScore = best ? best.ti * 1000 + best.exi : -1;
          if (score > prevScore) best = { ti: ti, exi: exi, ex: ex };
        }
      }
      return best;
    }

    function snapshotFromEx(ex) {
      return {
        sets: ex.sets,
        reps: ex.reps,
        weightKg: ex.weightKg != null ? String(ex.weightKg) : '',
        // Тип, довес и ступени сброса едут в снимок вместе с подходом: иначе
        // «прошлый раз» покажет тоннаж ниже фактического, потеряв сбросы.
        approaches: Array.isArray(ex.approaches) && ex.approaches.length
          ? ex.approaches.map(function (a) {
            const SK = strengthKernel();
            const base = SK ? SK.normalizeApproach(a) : {
              weightKg: a.weightKg != null ? String(a.weightKg) : '',
              reps: +a.reps || 0,
              done: !!a.done
            };
            base.reps = a.reps != null ? Math.max(1, Math.min(200, parseInt(a.reps, 10) || 1)) : 10;
            return base;
          })
          : null,
        rpe: ex.rpe != null ? +ex.rpe : 0,
        note: typeof ex.note === 'string' ? ex.note : ''
      };
    }

    const m0 = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m0) return _historyCache.set(cacheKey, null);
    let y = +m0[1];
    let mo = +m0[2];
    let d = +m0[3];

    for (let iter = 0; iter < 150; iter++) {
      const prev = prevCalendarDateParts(y, mo, d);
      y = prev.y;
      mo = prev.m;
      d = prev.d;
      const dk = dayKeyFromParts(y, mo, d);
      const day = readDayFromStore(dk);
      const hit = pickFromTrainingList(day && day.trainings, 0, 0, false);
      if (hit && hit.ex) {
        return _historyCache.set(cacheKey, snapshotFromEx(hit.ex));
      }
    }

    const todayDay = readDayFromStore(dateKey);
    const hit2 = pickFromTrainingList(todayDay && todayDay.trainings, curTi, curExi, true);
    if (hit2 && hit2.ex) {
      return _historyCache.set(cacheKey, snapshotFromEx(hit2.ex));
    }
    return _historyCache.set(cacheKey, null);
  }

  /**
   * Объём НАБРАННЫЙ (все подходы, включая неотмеченные) — подпись «~N кг объёма»
   * на карточке тренировки. Отличается от тоннажа ПОДНЯТОГО
   * (computeDayTotalTonnage, только отмеченные): по ходу тренировки подходы
   * добавляют заранее, а галочки ставят потом, и подпись должна показывать
   * набранный план, а не отставать от него.
   *
   * Формула одна на оба смысла — в ядре (2026-08-08). До этого здесь и в
   * computeDayTotalTonnage жили две независимые реализации, и разойтись они
   * могли молча.
   */
  function calcWorkoutBuilderVolumeKg(wl, bodyWeightKg) {
    const ks = HEYS.TrainingKernel && HEYS.TrainingKernel.strength;
    if (!ks) return 0;
    // Масса тела обязательна: без неё упражнения со своим весом дают ноль,
    // и подпись «~N кг объёма» занижала тренировку из подтягиваний до нуля.
    return ks.trainingTonnage({
      type: 'strength', strengthEntryMode: 'workout_builder', workoutLog: wl,
    }, { bodyWeightKg: +bodyWeightKg || 0 }).plannedVolume;
  }

  /** Синхронные поля sets / reps / weightKg для облака и старых снимков — с первой строки approaches. */
  function syncLegacyFieldsFromApproaches(row) {
    const ap = row.approaches;
    if (!Array.isArray(ap) || ap.length === 0) {
      return { sets: 1, reps: 10, weightKg: '' };
    }
    return {
      sets: ap.length,
      reps: Math.max(1, parseInt(ap[0].reps, 10) || 1),
      weightKg: ap[0].weightKg != null ? String(ap[0].weightKg) : ''
    };
  }

  function approachOrdinalRu(i) {
    return (i + 1) + '-й подход';
  }

  function createApproachId(exi, api) {
    _approachIdSeq += 1;
    return 'ap_' + Date.now() + '_' + _approachIdSeq + '_' + exi + '_' + api;
  }

  function createExerciseId(exi) {
    _exerciseIdSeq += 1;
    return 'ex_' + Date.now() + '_' + _exerciseIdSeq + '_' + exi;
  }

  /** Сколько подходов в упражнении (для превью при свёрнутой карточке). */
  function approachesCountForExercise(ex) {
    if (!ex) return 1;
    if (Array.isArray(ex.approaches) && ex.approaches.length > 0) {
      return ex.approaches.length;
    }
    if (ex.sets != null) {
      return Math.max(1, parseInt(ex.sets, 10) || 1);
    }
    return 1;
  }

  function approachesCountLabelRu(n) {
    var n0 = Math.max(1, Math.min(999, parseInt(n, 10) || 1));
    var nMod100 = n0 % 100;
    var nMod10 = n0 % 10;
    if (nMod100 >= 11 && nMod100 <= 19) return String(n0) + ' подходов';
    if (nMod10 === 1) return String(n0) + ' подход';
    if (nMod10 >= 2 && nMod10 <= 4) return String(n0) + ' подхода';
    return String(n0) + ' подходов';
  }

  function approachesFromStoredExercise(ex) {
    if (!ex) return [];
    if (Array.isArray(ex.approaches) && ex.approaches.length > 0) {
      return ex.approaches.map(function (a) {
        return {
          weightKg: a.weightKg != null ? String(a.weightKg) : '',
          reps: a.reps != null ? Math.max(1, Math.min(200, parseInt(a.reps, 10) || 1)) : 10
        };
      });
    }
    const sets = ex.sets != null ? Math.max(1, parseInt(ex.sets, 10) || 1) : 1;
    const reps = ex.reps != null ? Math.max(1, parseInt(ex.reps, 10) || 1) : 10;
    const w = ex.weightKg != null ? String(ex.weightKg) : '';
    const out = [];
    for (let s = 0; s < sets; s++) {
      out.push({ weightKg: w, reps: reps });
    }
    return out;
  }

  function formatExerciseHistoryLabel(dk, refDateKey) {
    if (!dk || !refDateKey) return dk || '';
    if (dk === refDateKey) return 'Сегодня';
    try {
      const t1 = new Date(dk + 'T12:00:00').getTime();
      const t2 = new Date(refDateKey + 'T12:00:00').getTime();
      const diff = Math.round((t2 - t1) / 86400000);
      if (diff === 1) return 'Вчера';
      return new Date(dk + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch (_e) {
      return dk;
    }
  }

  /**
   * До maxEntries предыдущих тренировок с этим упражнением (по дате одна запись — последняя сессия за день).
   */
  function findRecentExerciseUsages(normRaw, refDateKey, curTi, curExi, maxEntries) {
    const normKey = _normName(normRaw);
    if (!normKey || !refDateKey) return [];
    const cacheKey = 'rec|' + normKey + '|' + refDateKey + '|' + curTi + '|' + curExi + '|' + maxEntries;
    const cached = _historyCache.get(cacheKey);
    if (cached !== undefined) return cached;

    function matchEx(ex) {
      const n = typeof HEYS.normalizeExerciseName === 'function'
        ? HEYS.normalizeExerciseName(ex && ex.name ? ex.name : '')
        : String(ex && ex.name ? ex.name : '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
      return n === normKey;
    }

    function lexBefore(dk, ti, exi) {
      if (dk < refDateKey) return true;
      if (dk > refDateKey) return false;
      if (ti < curTi) return true;
      if (ti > curTi) return false;
      return exi < curExi;
    }

    const byDate = new Map();

    function consider(dk, ti, exi, ex) {
      if (!ex || !matchEx(ex)) return;
      if (!lexBefore(dk, ti, exi)) return;
      const score = ti * 1000 + exi;
      const prev = byDate.get(dk);
      if (!prev || score > prev.score) {
        byDate.set(dk, { score: score, ti: ti, exi: exi, ex: ex });
      }
    }

    const day0 = readDayFromStore(refDateKey);
    const tr0 = day0 && day0.trainings;
    if (Array.isArray(tr0)) {
      for (let tii = 0; tii < tr0.length; tii++) {
        const tr = tr0[tii];
        if (!tr || String(tr.type) !== 'strength' || tr.strengthEntryMode !== 'workout_builder') continue;
        const wl = tr.workoutLog;
        if (!wl || !Array.isArray(wl.exercises)) continue;
        for (let exj = 0; exj < wl.exercises.length; exj++) {
          consider(refDateKey, tii, exj, wl.exercises[exj]);
        }
      }
    }

    const m0 = refDateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m0) return _historyCache.set(cacheKey, []);
    var y = +m0[1];
    var mo = +m0[2];
    var d = +m0[3];

    for (var iter = 0; iter < 180; iter++) {
      var prevParts = prevCalendarDateParts(y, mo, d);
      y = prevParts.y;
      mo = prevParts.m;
      d = prevParts.d;
      var dk = dayKeyFromParts(y, mo, d);
      var day = readDayFromStore(dk);
      var trList = day && day.trainings;
      if (Array.isArray(trList)) {
        for (var tii = 0; tii < trList.length; tii++) {
          var tr2 = trList[tii];
          if (!tr2 || String(tr2.type) !== 'strength' || tr2.strengthEntryMode !== 'workout_builder') continue;
          var wl2 = tr2.workoutLog;
          if (!wl2 || !Array.isArray(wl2.exercises)) continue;
          for (var exj = 0; exj < wl2.exercises.length; exj++) {
            consider(dk, tii, exj, wl2.exercises[exj]);
          }
        }
      }
    }

    var keys = Array.from(byDate.keys()).sort().reverse();
    var out = [];
    for (var i = 0; i < keys.length && out.length < maxEntries; i++) {
      var dk2 = keys[i];
      var row = byDate.get(dk2);
      out.push({
        dateKey: dk2,
        label: formatExerciseHistoryLabel(dk2, refDateKey),
        approaches: approachesFromStoredExercise(row.ex)
      });
    }
    return _historyCache.set(cacheKey, out);
  }

  // Схема подхода (тип, ступени дроп-сета) живёт в ядре в одном экземпляре:
  // второй набор условий здесь разошёлся бы с ним молча. Фолбэк — на случай
  // сборки без модуля силовой, там подход читается как обычный рабочий.
  function strengthKernel() {
    const TK = HEYS.TrainingKernel;
    return (TK && TK.strength && TK.strength.approachStages) ? TK.strength : null;
  }

  function approachStagesOf(a) {
    const SK = strengthKernel();
    if (SK) return SK.approachStages(a);
    return [{
      weightKg: a && a.weightKg != null ? String(a.weightKg) : '',
      reps: +(a && a.reps) || 0,
      done: !!(a && a.done),
      isDrop: false
    }];
  }

  function approachIsWarmup(a) {
    const SK = strengthKernel();
    if (SK) return SK.isWarmupApproach(a);
    return !!(a && a.type === 'warmup');
  }

  function approachIsDone(a) {
    const SK = strengthKernel();
    if (SK) return SK.isApproachDone(a);
    return !!(a && a.done);
  }

  /** Объём подхода со всеми ступенями: работа сделана вся. Разминка вне тоннажа. */
  function approachVolumeKg(a) {
    if (!a || approachIsWarmup(a)) return 0;
    const stages = approachStagesOf(a);
    let vol = 0;
    for (let i = 0; i < stages.length; i++) {
      const w = parseFloat(String(stages[i].weightKg || '').replace(',', '.')) || 0;
      const r = +stages[i].reps || 0;
      if (w > 0 && r > 0) vol += w * r;
    }
    return vol;
  }

  function exerciseRecordsFromApproaches(approaches) {
    let maxSet = 0, maxW = 0, total = 0;
    if (!Array.isArray(approaches)) return { maxSet: 0, maxW: 0, total: 0 };
    for (let i = 0; i < approaches.length; i++) {
      const a = approaches[i];
      if (!a || approachIsWarmup(a)) continue;
      const vol = approachVolumeKg(a);
      if (vol > maxSet) maxSet = vol;
      // Рекорд по весу — только основная ступень: иначе любой дроп-сет стал бы
      // личным рекордом, хотя человек не поднял больше.
      const stages = approachStagesOf(a);
      const baseW = parseFloat(String((stages[0] && stages[0].weightKg) || '').replace(',', '.')) || 0;
      if (baseW > maxW) maxW = baseW;
      total += vol;
    }
    return { maxSet: maxSet, maxW: maxW, total: total };
  }

  function recordsFromStoredExercise(ex) {
    if (!ex) return { maxSet: 0, maxW: 0, total: 0 };
    if (Array.isArray(ex.approaches) && ex.approaches.length > 0) {
      return exerciseRecordsFromApproaches(ex.approaches);
    }
    const w = parseFloat(String(ex.weightKg || '').replace(',', '.')) || 0;
    const sets = Math.max(0, parseInt(ex.sets, 10) || 0);
    const reps = Math.max(0, parseInt(ex.reps, 10) || 0);
    if (w > 0 && sets > 0 && reps > 0) {
      const setVol = w * reps;
      return { maxSet: setVol, maxW: w, total: setVol * sets };
    }
    return { maxSet: 0, maxW: 0, total: 0 };
  }

  /** Исторические рекорды для упражнения (max вес × повторы за подход, max вес, max объём за сессию). */
  function findExerciseHistoricalRecord(normRaw, refDateKey, curTi, curExi) {
    const normKey = _normName(normRaw);
    if (!normKey || !refDateKey) return null;
    const cacheKey = 'rec_max|' + normKey + '|' + refDateKey + '|' + curTi + '|' + curExi;
    const cached = _historyCache.get(cacheKey);
    if (cached !== undefined) return cached;

    function matchEx(ex) {
      const n = typeof HEYS.normalizeExerciseName === 'function'
        ? HEYS.normalizeExerciseName(ex && ex.name ? ex.name : '')
        : String(ex && ex.name ? ex.name : '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
      return n === normKey;
    }

    function lexBefore(dk, ti, exi) {
      if (dk < refDateKey) return true;
      if (dk > refDateKey) return false;
      if (ti < curTi) return true;
      if (ti > curTi) return false;
      return exi < curExi;
    }

    let maxSet = 0, maxW = 0, maxTotal = 0, found = false;

    function consider(dk, ti, exi, ex) {
      if (!ex || !matchEx(ex)) return;
      if (!lexBefore(dk, ti, exi)) return;
      const r = recordsFromStoredExercise(ex);
      if (r.maxSet > maxSet) maxSet = r.maxSet;
      if (r.maxW > maxW) maxW = r.maxW;
      if (r.total > maxTotal) maxTotal = r.total;
      found = true;
    }

    const day0 = readDayFromStore(refDateKey);
    const tr0 = day0 && day0.trainings;
    if (Array.isArray(tr0)) {
      for (let tii = 0; tii < tr0.length; tii++) {
        const tr = tr0[tii];
        if (!tr || String(tr.type) !== 'strength' || tr.strengthEntryMode !== 'workout_builder') continue;
        const wl = tr.workoutLog;
        if (!wl || !Array.isArray(wl.exercises)) continue;
        for (let exj = 0; exj < wl.exercises.length; exj++) {
          consider(refDateKey, tii, exj, wl.exercises[exj]);
        }
      }
    }

    const m0 = refDateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m0) return _historyCache.set(cacheKey, found ? { maxSet: maxSet, maxW: maxW, total: maxTotal } : null);
    let y = +m0[1], mo = +m0[2], d = +m0[3];
    for (let iter = 0; iter < 180; iter++) {
      const prev = prevCalendarDateParts(y, mo, d);
      y = prev.y; mo = prev.m; d = prev.d;
      const dk = dayKeyFromParts(y, mo, d);
      const day = readDayFromStore(dk);
      const trList = day && day.trainings;
      if (!Array.isArray(trList)) continue;
      for (let tii = 0; tii < trList.length; tii++) {
        const tr2 = trList[tii];
        if (!tr2 || String(tr2.type) !== 'strength' || tr2.strengthEntryMode !== 'workout_builder') continue;
        const wl2 = tr2.workoutLog;
        if (!wl2 || !Array.isArray(wl2.exercises)) continue;
        for (let exj = 0; exj < wl2.exercises.length; exj++) {
          consider(dk, tii, exj, wl2.exercises[exj]);
        }
      }
    }

    return _historyCache.set(cacheKey, found ? { maxSet: maxSet, maxW: maxW, total: maxTotal } : null);
  }

  function formatRestSec(sec) {
    const s = Math.max(0, Math.round(+sec || 0));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return mm + ':' + (ss < 10 ? '0' + ss : '' + ss);
  }

  const REST_PRESETS = [60, 90, 120, 180];
  function nextRestPreset(cur) {
    const i = REST_PRESETS.indexOf(+cur || 90);
    return REST_PRESETS[(i + 1) % REST_PRESETS.length];
  }

  function restSecForRpe(rpe) {
    const r = +rpe || 0;
    if (r >= 9) return 180;
    if (r >= 7) return 120;
    if (r >= 1) return 60;
    return 90;
  }

  function formatWorkoutDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    if (hh > 0) {
      return hh + ':' + (mm < 10 ? '0' + mm : '' + mm) + ':' + (ss < 10 ? '0' + ss : '' + ss);
    }
    return mm + ':' + (ss < 10 ? '0' + ss : '' + ss);
  }

  function formatVolumeKg(v) {
    const n = Math.max(0, +v || 0);
    if (n >= 1000) {
      const t = n / 1000;
      const fixed = t >= 10 ? Math.round(t) : Math.round(t * 10) / 10;
      return String(fixed) + ' т';
    }
    return Math.round(n) + ' кг';
  }

  /**
   * Сумма тоннажа (вес × повторы) всех завершённых подходов всех силовых в
   * указанный день. Формула — в _kernel/heys_kernel_strength_v1.js
   * (HEYS.TrainingKernel.strength.dayTonnage): та же математика зеркалится в
   * heys-mcp/lib/web-mirror, чтобы куратор через MCP видел то же число.
   */
  function computeDayTotalTonnage(dateKey) {
    if (!dateKey) return 0;
    const ks = HEYS.TrainingKernel && HEYS.TrainingKernel.strength;
    if (!ks) return 0; // ядро не загружено — прод-safety, копии формулы здесь больше нет
    const dayData = readDayFromStore(dateKey);
    return ks.dayTonnage(dayData, { bodyWeightKg: bodyWeightForDay(dayData) });
  }

  /** Сколько workout_builder-тренировок на дне. */
  function countStrengthWorkoutsOnDay(dateKey) {
    if (!dateKey) return 0;
    const ks = HEYS.TrainingKernel && HEYS.TrainingKernel.strength;
    if (!ks) return 0;
    return ks.countStrengthWorkouts(readDayFromStore(dateKey));
  }

  /** Ближайший прошлый день, в котором был ненулевой тоннаж workout_builder. */
  function findPrevDayTonnage(refDateKey) {
    if (!refDateKey) return null;
    const m0 = refDateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m0) return null;
    let y = +m0[1], mo = +m0[2], d = +m0[3];
    for (let iter = 0; iter < 90; iter++) {
      const prev = prevCalendarDateParts(y, mo, d);
      y = prev.y; mo = prev.m; d = prev.d;
      const dk = dayKeyFromParts(y, mo, d);
      const t = computeDayTotalTonnage(dk);
      if (t > 0) return { dateKey: dk, total: t };
    }
    return null;
  }

  /** Найти ближайшую прошлую workout_builder-тренировку (до refDateKey/curTi) и вернуть копию её упражнений (без done, id обновлены). */
  function findLastWorkoutBuilderExercises(refDateKey, curTi) {
    function takeFromTrainings(trainings, sameDayBeforeTi) {
      if (!Array.isArray(trainings)) return null;
      let bestIdx = -1;
      for (let tii = 0; tii < trainings.length; tii++) {
        const tr = trainings[tii];
        if (!tr || String(tr.type) !== 'strength' || tr.strengthEntryMode !== 'workout_builder') continue;
        const wl = tr.workoutLog;
        if (!wl || !Array.isArray(wl.exercises) || wl.exercises.length === 0) continue;
        const hasName = wl.exercises.some(function (ex) { return ex && String(ex.name || '').trim(); });
        if (!hasName) continue;
        if (sameDayBeforeTi != null && tii >= sameDayBeforeTi) continue;
        if (tii > bestIdx) bestIdx = tii;
      }
      if (bestIdx < 0) return null;
      const wl2 = trainings[bestIdx].workoutLog;
      return { exercises: wl2.exercises };
    }
    const day0 = readDayFromStore(refDateKey);
    const todayHit = day0 && takeFromTrainings(day0.trainings, curTi);
    if (todayHit) return todayHit;
    const m0 = refDateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m0) return null;
    let y = +m0[1], mo = +m0[2], d = +m0[3];
    for (let iter = 0; iter < 180; iter++) {
      const prev = prevCalendarDateParts(y, mo, d);
      y = prev.y; mo = prev.m; d = prev.d;
      const dk = dayKeyFromParts(y, mo, d);
      const day = readDayFromStore(dk);
      const hit = day && takeFromTrainings(day.trainings, null);
      if (hit) {
        return { dateKey: dk, exercises: hit.exercises };
      }
    }
    return null;
  }

  /** Скопировать упражнения для повтора: новые id, done сброшены, restManual сохранён. */
  function cloneExercisesForReplay(srcExercises) {
    const ts = Date.now();
    return srcExercises.map(function (ex, i) {
      const aps = Array.isArray(ex.approaches) && ex.approaches.length > 0
        ? ex.approaches.map(function (a, ai) {
          return resetCarriedDropsDone(carryApproachSnapshotFields({
            id: 'ap_replay_' + ts + '_' + i + '_' + ai,
            weightKg: a.weightKg != null ? String(a.weightKg) : '',
            reps: a.reps != null ? Math.max(1, Math.min(200, parseInt(a.reps, 10) || 1)) : 10,
            done: false
          }, a, false));
        })
        : [{ id: 'ap_replay_' + ts + '_' + i + '_0', weightKg: '', reps: 10, done: false }];
      return carryExerciseSnapshotFields({
        id: 'ex_replay_' + ts + '_' + i,
        name: String(ex.name || ''),
        approaches: aps,
        note: typeof ex.note === 'string' ? ex.note : '',
        ssGroup: ex.ssGroup != null ? Math.max(0, parseInt(ex.ssGroup, 10) || 0) : 0,
        rpe: ex.rpe != null ? Math.max(0, Math.min(10, parseInt(ex.rpe, 10) || 0)) : 0,
        restSec: ex.restSec != null && REST_PRESETS.indexOf(+ex.restSec) >= 0 ? +ex.restSec : 90,
        restManual: !!ex.restManual
      }, ex);
    });
  }

  function fmtKgDelta(diff) {
    const v = Math.round(diff * 10) / 10;
    const abs = Math.abs(v);
    return (v > 0 ? '+' : '−') + (abs % 1 === 0 ? String(abs) : abs.toFixed(1)) + ' кг';
  }

  /** Полоска дат прошлых тренировок + раскрытие подходов по клику. */
  function WorkoutExerciseHistoryStrip(props) {
    const { exerciseName, dateKey, ti, exi, haptic } = props || {};
    var _st = React.useState(null);
    var open = _st[0];
    var setOpen = _st[1];

    var entries = React.useMemo(function () {
      return findRecentExerciseUsages(exerciseName, dateKey, ti, exi, 8);
    }, [exerciseName, dateKey, ti, exi]);

    if (!entries.length) return null;

    var chipEntries = entries.slice(0, 4);
    var openEntry = open ? entries.find(function (x) { return x.dateKey === open; }) : null;

    var detailEl = null;
    if (openEntry) {
      var apList = openEntry.approaches && openEntry.approaches.length > 0 ? openEntry.approaches : null;
      detailEl = apList
        ? React.createElement('ul', { className: 'ct-wb-ex-hist-detail' },
          apList.map(function (a, i) {
            var w = String(a.weightKg != null ? a.weightKg : '').trim();
            var r = a.reps != null ? a.reps : '';
            var wDisp = w || '—';
            var rDisp = r !== '' ? String(r) : '—';
            return React.createElement('li', { key: 'hl' + i },
              (i + 1) + '-й подход: ' + wDisp + ' кг × ' + rDisp + ' повт.'
            );
          })
        )
        : React.createElement('p', { className: 'ct-wb-ex-hist-empty' }, 'Нет записей по подходам');
    }

    var sparkEl = null;
    if (entries.length >= 2) {
      var series = entries.slice().reverse().map(function (e) {
        var rec = exerciseRecordsFromApproaches(e.approaches);
        return { total: rec.total, label: e.label };
      });
      var values = series.map(function (s) { return s.total; });
      var maxV = Math.max.apply(null, values);
      if (maxV > 0) {
        var minV = Math.min.apply(null, values);
        var rangeV = (maxV - minV) || 1;
        var W = 88, H = 22, PAD = 2;
        var stepX = (W - PAD * 2) / Math.max(1, series.length - 1);
        var ptsArr = [];
        for (var pi = 0; pi < series.length; pi++) {
          var px = PAD + pi * stepX;
          var py = PAD + (1 - (series[pi].total - minV) / rangeV) * (H - PAD * 2);
          ptsArr.push(px.toFixed(1) + ',' + py.toFixed(1));
        }
        var lastX = PAD + (series.length - 1) * stepX;
        var lastY = PAD + (1 - (series[series.length - 1].total - minV) / rangeV) * (H - PAD * 2);
        var deltaPct = null;
        if (series.length >= 2 && series[series.length - 2].total > 0) {
          deltaPct = ((series[series.length - 1].total - series[series.length - 2].total) / series[series.length - 2].total) * 100;
        }
        var trendCls = deltaPct == null ? 'is-flat' : (deltaPct > 1 ? 'is-up' : (deltaPct < -1 ? 'is-down' : 'is-flat'));
        sparkEl = React.createElement('span', {
          className: 'ct-wb-ex-sparkline ' + trendCls,
          title: 'Объём (вес × повторы) за последние ' + series.length + ' тренировок'
        },
          React.createElement('svg', {
            width: W, height: H,
            viewBox: '0 0 ' + W + ' ' + H,
            className: 'ct-wb-ex-sparkline-svg',
            'aria-hidden': true
          },
            React.createElement('polyline', {
              points: ptsArr.join(' '),
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.6,
              strokeLinejoin: 'round',
              strokeLinecap: 'round'
            }),
            React.createElement('circle', { cx: lastX, cy: lastY, r: 2.4, fill: 'currentColor' })
          ),
          deltaPct != null && Math.abs(deltaPct) >= 1 && React.createElement('span', {
            className: 'ct-wb-ex-sparkline-delta'
          }, (deltaPct > 0 ? '+' : '') + Math.round(deltaPct) + '%')
        );
      }
    }

    return React.createElement('div', { className: 'ct-wb-ex-hist' },
      React.createElement('div', { className: 'ct-wb-ex-hist-head' },
        React.createElement('span', { className: 'ct-wb-ex-hist-title' }, 'Раньше:'),
        React.createElement('div', { className: 'ct-wb-ex-hist-chips' },
          chipEntries.map(function (e) {
            return React.createElement('button', {
              key: e.dateKey,
              type: 'button',
              className: 'ct-wb-ex-hist-chip' + (open === e.dateKey ? ' is-open' : ''),
              title: e.dateKey,
              onClick: function (ev) {
                ev.stopPropagation();
                setOpen(open === e.dateKey ? null : e.dateKey);
                if (typeof haptic === 'function') haptic('light');
              }
            }, e.label);
          })
        ),
        sparkEl
      ),
      detailEl
    );
  }

  /** Снимок из истории: либо готовый массив подходов, либо разворачивание sets×reps×вес. */
  function buildApproachesFromSnapshot(snap, row) {
    if (snap.approaches && snap.approaches.length > 0) {
      return snap.approaches.map(function (a, idx) {
        const out = {
          id: createApproachId('snap', idx),
          weightKg: a.weightKg != null ? String(a.weightKg) : '',
          reps: a.reps != null ? Math.max(1, Math.min(200, parseInt(a.reps, 10) || 1)) : 10
        };
        // Повторяется схема подхода, но не отметки: тренировку ещё предстоит
        // сделать, поэтому done не переносится ни у подхода, ни у ступеней.
        if (a.type === 'warmup') out.type = 'warmup';
        if (a.extraWeightKg) out.extraWeightKg = a.extraWeightKg;
        if (Array.isArray(a.drops) && a.drops.length) {
          out.drops = a.drops.map(function (d) {
            return { weightKg: d.weightKg != null ? String(d.weightKg) : '', reps: +d.reps || 0, done: false };
          });
        }
        return out;
      });
    }
    const nSets = snap.sets != null
      ? Math.max(1, Math.min(50, parseInt(snap.sets, 10) || 1))
      : Math.max(1, (row.approaches && row.approaches.length) || 1);
    const r = snap.reps != null ? Math.max(1, Math.min(200, parseInt(snap.reps, 10) || 10)) : 10;
    const w = snap.weightKg != null && String(snap.weightKg).trim() !== '' ? String(snap.weightKg) : '';
    const out = [];
    for (let s = 0; s < nSets; s++) {
      out.push({
        id: createApproachId('snap', s),
        weightKg: w,
        reps: r
      });
    }
    return out;
  }

  function cleanupSsGroups(exercises) {
    const counts = {};
    exercises.forEach(function (e) {
      const g = +(e.ssGroup || 0);
      if (g > 0) counts[g] = (counts[g] || 0) + 1;
    });
    return exercises.map(function (e) {
      const g = +(e.ssGroup || 0);
      if (g > 0 && counts[g] < 2) return { ...e, ssGroup: 0 };
      return e;
    });
  }

  function nextSsGroupId(exercises) {
    let m = 0;
    exercises.forEach(function (e) {
      const g = +(e.ssGroup || 0);
      if (g > m) m = g;
    });
    return m + 1;
  }

  function mergeSupersetLinks(exercises, fromIdx, toIdx) {
    const a = exercises.map(function (e) {
      return { ...e };
    });
    if (fromIdx === toIdx) return a;
    const gA = +(a[fromIdx].ssGroup || 0);
    const gB = +(a[toIdx].ssGroup || 0);
    if (gA && gB && gA === gB) {
      return a;
    }
    let target;
    if (!gA && !gB) {
      target = nextSsGroupId(exercises);
    } else if (gA && gB && gA !== gB) {
      const lo = Math.min(gA, gB);
      const hi = Math.max(gA, gB);
      return a.map(function (row) {
        const g = +(row.ssGroup || 0);
        const nextG = g === hi ? lo : g;
        return { ...row, ssGroup: nextG };
      });
    } else {
      target = gA || gB;
    }
    return a.map(function (row, i) {
      if (i === fromIdx || i === toIdx) return { ...row, ssGroup: target };
      return row;
    });
  }

  /**
   * Связать два упражнения и тут же собрать связку смежно: раунд выводится из
   * позиции, поэтому участники обязаны идти подряд. Инвариант держится здесь, у
   * писателя, а не чинится при чтении.
   */
  function linkAsSuperset(exercises, idxA, idxB) {
    const merged = mergeSupersetLinks(exercises, idxA, idxB);
    // Номер связки берётся ДО пересборки: после неё прежние индексы указывают
    // уже на других участников.
    const groupId = +(merged[idxB] && merged[idxB].ssGroup) || 0;
    const SK = strengthKernel();
    if (!SK || !SK.moveSupersetGroup || !groupId) return { exercises: merged, groupId: groupId };
    let firstMember = -1;
    for (let i = 0; i < merged.length; i++) {
      if (+(merged[i].ssGroup || 0) === groupId) { firstMember = i; break; }
    }
    if (firstMember < 0) return { exercises: merged, groupId: groupId };
    return { exercises: SK.moveSupersetGroup(merged, groupId, firstMember), groupId: groupId };
  }

  function reorderExercises(arr, fromIdx, toIdx) {
    if (fromIdx === toIdx) return arr.slice();
    const a = arr.slice();
    const item = a.splice(fromIdx, 1)[0];
    a.splice(toIdx, 0, item);
    return a;
  }

  /**
   * Переставить упражнение: beforeIdx — позиция «вставить перед» в исходном массиве (0…n).
   * После удаления элемента целевой индекс в укороченном массиве: beforeIdx > fromIdx → beforeIdx - 1.
   */
  function reorderExerciseToBeforeIndex(exercises, fromIdx, beforeIdx) {
    const a = exercises.slice();
    const n = a.length;
    if (fromIdx < 0 || fromIdx >= n || beforeIdx < 0 || beforeIdx > n) return a;
    const [moved] = a.splice(fromIdx, 1);
    let toIdx = beforeIdx;
    if (beforeIdx > fromIdx) toIdx = beforeIdx - 1;
    toIdx = Math.max(0, Math.min(toIdx, a.length));
    a.splice(toIdx, 0, moved);
    return a;
  }

  function dissolveSsGroupEverywhere(exercises, groupId) {
    const g = +groupId || 0;
    if (g <= 0) return exercises.slice();
    return exercises.map(function (row) {
      if (+(row.ssGroup || 0) === g) return { ...row, ssGroup: 0 };
      return row;
    });
  }

  /** В dragover getData() часто пустой — храним вид DnD в замыкании модуля. */
  let wbDndKind = null;
  let wbDndFrom = null;

  /**
   * Список упражнений: линия вставки при перетаскивании порядка, drop «перед индексом».
   */
  function WorkoutBuilderExerciseList(props) {
    const {
      ti,
      wlLive,
      dateKey,
      haptic,
      patchTraining,
      ensureWorkoutLogShape,
      applyWorkoutLogToTraining,
      wbApproachRepStepper
    } = props || {};
    const [insertBefore, setInsertBefore] = React.useState(null);
    const [ssHover, setSsHover] = React.useState(null);
    const [reorderDragActive, setReorderDragActive] = React.useState(false);
    const [ssPickFrom, setSsPickFrom] = React.useState(null);
    /** По id упражнения: свёрнут блок под шапкой (название, таблица, RPE…). */
    const [wbExFolded, setWbExFolded] = React.useState({});
    const addApproachGuardRef = React.useRef({});
    const hasOwn = Object.prototype.hasOwnProperty;

    React.useEffect(function () {
      function clearDnD() {
        wbDndKind = null;
        wbDndFrom = null;
        setInsertBefore(null);
        setSsHover(null);
        setReorderDragActive(false);
      }
      global.addEventListener('dragend', clearDnD);
      return function () {
        global.removeEventListener('dragend', clearDnD);
      };
    }, []);

    const exercises = wlLive.exercises;
    const n = exercises.length;
    const dk = typeof dateKey === 'string' ? dateKey : '';
    const out = [];

    /** Таймер отдыха в стиле секундомера: { startTs, thresholdSec, exi, api, exName, notified } или null.
     *  startTs — момент начала отдыха; thresholdSec — желаемая длительность; пользователь видит count-up.
     *  При достижении threshold однократно вибрирует + бипает (notified=true). Дальше продолжает считать «сверх».
     *  Тап «+10с» добавляет к thresholdSec — даёт буфер «дойти до снаряда / взять вес».
     */
    const [restTimer, setRestTimer] = React.useState(null);
    const [restNow, setRestNow] = React.useState(Date.now());
    React.useEffect(function () {
      if (!restTimer) return;
      const id = global.setInterval(function () {
        setRestNow(Date.now());
      }, 250);
      return function () { global.clearInterval(id); };
    }, [restTimer && restTimer.startTs]);
    React.useEffect(function () {
      if (!restTimer || restTimer.notified) return;
      const elapsedSec = (restNow - restTimer.startTs) / 1000;
      if (elapsedSec >= restTimer.thresholdSec) {
        // Конец отдыха — таймерный сигнал тренировки: человек не смотрит на
        // экран. Своего кадра в пакете дизайна у тренировок нет; отклик остаётся,
        // но пятиимпульсный образец сведён к контрактному отклику записи.
        try { playRestDoneBeep(); } catch (_e) { /* noop */ }
        HEYS.feedback?.emit?.('step.done');
        setRestTimer(function (prev) {
          if (!prev) return prev;
          return { ...prev, notified: true };
        });
      }
    }, [restNow, restTimer]);

    /** Память исторических рекордов и последней сессии — пересчёт только при смене имён/даты. */
    const exerciseNamesSig = exercises
      .map(function (ex) { return ex ? String(ex.name || '') : ''; })
      .join('|');
    const exerciseStats = React.useMemo(function () {
      const out2 = [];
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        const name = ex && ex.name ? String(ex.name) : '';
        if (!dk || !name.trim()) {
          out2.push({ last: null, record: null });
          continue;
        }
        out2.push({
          last: findLastExerciseSnapshot(dk, name, ti, i),
          record: findExerciseHistoricalRecord(name, dk, ti, i)
        });
      }
      return out2;
    }, [exerciseNamesSig, dk, ti]);

    /** Какие упражнения уже полностью завершены (все подходы ✓). */
    const allDoneByExi = exercises.map(function (ex) {
      const aps = (ex && Array.isArray(ex.approaches)) ? ex.approaches : [];
      if (aps.length === 0) return false;
      for (let k = 0; k < aps.length; k++) {
        // Подход со сбросами закрыт, только когда закрыты все его ступени.
        if (!aps[k] || !approachIsDone(aps[k])) return false;
      }
      return true;
    });

    /** Подсчёт выполненных подходов и сводных метрик за тренировку. */
    const workoutAggregate = React.useMemo(function () {
      let totalApproaches = 0, doneApproaches = 0;
      let totalVolume = 0, maxWeight = 0, prCount = 0;
      let hasAnyName = false;
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        if (!ex) continue;
        if (String(ex.name || '').trim()) hasAnyName = true;
        const aps = Array.isArray(ex.approaches) ? ex.approaches : [];
        const histMaxSet = exerciseStats[i] && exerciseStats[i].record ? exerciseStats[i].record.maxSet : 0;
        for (let k = 0; k < aps.length; k++) {
          totalApproaches += 1;
          const a = aps[k];
          if (!a) continue;
          // Разминка вне тоннажа и вне рекордов; подход со сбросами — один
          // подход, но объём в нём весь, а рекорд — по основной ступени.
          const warmup = approachIsWarmup(a);
          const vol = approachVolumeKg(a);
          const stages = approachStagesOf(a);
          const baseW = parseFloat(String((stages[0] && stages[0].weightKg) || '').replace(',', '.')) || 0;
          if (approachIsDone(a)) {
            doneApproaches += 1;
            if (warmup) continue;
            totalVolume += vol;
            if (baseW > maxWeight) maxWeight = baseW;
            if (histMaxSet > 0 && vol > histMaxSet + 0.05) prCount += 1;
          }
        }
      }
      const allDone = totalApproaches > 0 && doneApproaches === totalApproaches && hasAnyName;
      return {
        totalApproaches: totalApproaches,
        doneApproaches: doneApproaches,
        totalVolume: totalVolume,
        maxWeight: maxWeight,
        prCount: prCount,
        allDone: allDone,
        hasAnyDone: doneApproaches > 0
      };
    }, [exerciseNamesSig, dk, ti, exercises]);

    /** Авто-сворачивание упражнения после последнего ✓. */
    const prevAllDoneRef = React.useRef([]);
    React.useEffect(function () {
      const prev = prevAllDoneRef.current;
      const newlyDoneIds = [];
      for (let i = 0; i < allDoneByExi.length; i++) {
        if (allDoneByExi[i] && !prev[i]) {
          const ex = exercises[i];
          newlyDoneIds.push(String(ex && ex.id != null ? ex.id : 'exi-' + i));
        }
      }
      prevAllDoneRef.current = allDoneByExi.slice();
      if (newlyDoneIds.length > 0) {
        setWbExFolded(function (prevFolded) {
          const next = { ...prevFolded };
          for (let j = 0; j < newlyDoneIds.length; j++) next[newlyDoneIds[j]] = true;
          return next;
        });
        patchTraining(ti, function (t0) {
          const wl0 = ensureWorkoutLogShape(t0);
          wl0.exercises = wl0.exercises.map(function (row, i) {
            if (!allDoneByExi[i] || row.collapsed === true) return row;
            return { ...row, collapsed: true };
          });
          return applyWorkoutLogToTraining(t0, wl0);
        });
      }
    }, [allDoneByExi.join('|')]);

    /** Старт-стоп тренировки в самом workoutLog (переживает релоад). */
    const wlStartedAt = +(wlLive && wlLive.startedAt) || 0;
    const wlCompletedAt = +(wlLive && wlLive.completedAt) || 0;
    React.useEffect(function () {
      if (!workoutAggregate.hasAnyDone) {
        if (wlStartedAt > 0 && workoutAggregate.totalApproaches > 0) {
          patchTraining(ti, function (t0) {
            const wl0 = ensureWorkoutLogShape(t0);
            delete wl0.startedAt;
            delete wl0.completedAt;
            return applyWorkoutLogToTraining(t0, wl0);
          });
        }
        return;
      }
      if (workoutAggregate.allDone) {
        if (!wlCompletedAt) {
          patchTraining(ti, function (t0) {
            const wl0 = ensureWorkoutLogShape(t0);
            if (!wl0.startedAt) wl0.startedAt = Date.now();
            wl0.completedAt = Date.now();
            return applyWorkoutLogToTraining(t0, wl0);
          });
        }
        return;
      }
      if (!wlStartedAt) {
        patchTraining(ti, function (t0) {
          const wl0 = ensureWorkoutLogShape(t0);
          if (!wl0.startedAt) wl0.startedAt = Date.now();
          delete wl0.completedAt;
          return applyWorkoutLogToTraining(t0, wl0);
        });
      } else if (wlCompletedAt) {
        patchTraining(ti, function (t0) {
          const wl0 = ensureWorkoutLogShape(t0);
          delete wl0.completedAt;
          return applyWorkoutLogToTraining(t0, wl0);
        });
      }
    }, [workoutAggregate.hasAnyDone, workoutAggregate.allDone, workoutAggregate.totalApproaches, wlStartedAt, wlCompletedAt, ti]);

    /** Тик для отображения общего таймера тренировки. */
    const [workoutNow, setWorkoutNow] = React.useState(Date.now());
    React.useEffect(function () {
      if (!wlStartedAt || wlCompletedAt) return;
      const id = global.setInterval(function () {
        setWorkoutNow(Date.now());
      }, 1000);
      return function () { global.clearInterval(id); };
    }, [wlStartedAt, wlCompletedAt]);

    /** Wake Lock пока есть незавершённые подходы и хотя бы один уже выполнен. */
    React.useEffect(function () {
      if (typeof navigator === 'undefined' || !navigator.wakeLock || !navigator.wakeLock.request) return;
      if (!workoutAggregate.hasAnyDone || workoutAggregate.allDone) return;
      let sentinel = null;
      let cancelled = false;
      function acquire() {
        navigator.wakeLock.request('screen').then(function (s) {
          if (cancelled) {
            try { s.release(); } catch (_e) { /* noop */ }
            return;
          }
          sentinel = s;
          try {
            sentinel.addEventListener('release', function () {
              if (!cancelled) sentinel = null;
            });
          } catch (_e) { /* noop */ }
        }).catch(function () { /* noop — не критично */ });
      }
      function onVis() {
        if (document.visibilityState === 'visible' && !sentinel && !cancelled) acquire();
      }
      acquire();
      document.addEventListener('visibilitychange', onVis);
      return function () {
        cancelled = true;
        document.removeEventListener('visibilitychange', onVis);
        if (sentinel) {
          try { sentinel.release(); } catch (_e) { /* noop */ }
          sentinel = null;
        }
      };
    }, [workoutAggregate.hasAnyDone, workoutAggregate.allDone]);

    const prevExLenRef = React.useRef(n);
    React.useEffect(function () {
      const prevLen = prevExLenRef.current;
      if (n > prevLen && n > 1) {
        setWbExFolded(function (prev) {
          const next = { ...prev };
          for (let i = 0; i < n - 1; i++) {
            const ex = exercises[i];
            const key = String(ex && ex.id != null ? ex.id : 'exi-' + i);
            next[key] = true;
          }
          return next;
        });
        patchTraining(ti, function (t0) {
          const wl0 = ensureWorkoutLogShape(t0);
          wl0.exercises = wl0.exercises.map(function (row, i) {
            if (i >= n - 1 || row.collapsed === true) return row;
            return { ...row, collapsed: true };
          });
          return applyWorkoutLogToTraining(t0, wl0);
        });
      }
      prevExLenRef.current = n;
    }, [n]);

    if (wlStartedAt > 0 && workoutAggregate.totalApproaches > 0 && !workoutAggregate.allDone) {
      const elapsed = (wlCompletedAt > 0 ? wlCompletedAt : workoutNow) - wlStartedAt;
      out.push(React.createElement('div', {
        key: 'wb-workout-pill',
        className: 'ct-wb-workout-pill',
        role: 'status',
        'aria-live': 'off',
        onClick: function (e) { e.stopPropagation(); }
      },
        React.createElement('span', { className: 'ct-wb-workout-pill-icon', 'aria-hidden': true }, '⏱'),
        React.createElement('span', { className: 'ct-wb-workout-pill-time' }, formatWorkoutDuration(elapsed)),
        React.createElement('span', { className: 'ct-wb-workout-pill-sep', 'aria-hidden': true }, '·'),
        React.createElement('span', { className: 'ct-wb-workout-pill-progress' },
          workoutAggregate.doneApproaches + ' / ' + workoutAggregate.totalApproaches + ' ✓'),
        workoutAggregate.totalVolume > 0 && React.createElement(React.Fragment, null,
          React.createElement('span', { className: 'ct-wb-workout-pill-sep', 'aria-hidden': true }, '·'),
          React.createElement('span', { className: 'ct-wb-workout-pill-vol' }, formatVolumeKg(workoutAggregate.totalVolume))
        ),
        workoutAggregate.prCount > 0 && React.createElement('span', {
          className: 'ct-wb-workout-pill-pr',
          title: 'Личных рекордов в этой тренировке: ' + workoutAggregate.prCount
        }, '🏆 ' + workoutAggregate.prCount)
      ));
    }

    for (let exi = 0; exi < n; exi++) {
      const ex = exercises[exi];
      if (insertBefore === exi && wbDndKind === 'reorder') {
        out.push(React.createElement('div', {
          key: 'wb-ins-' + exi,
          className: 'ct-wb-ex-drop-line',
          'aria-hidden': true
        }));
      }

      const ssG = +(ex.ssGroup || 0);
      const ssClass = ssG > 0 ? ' ct-wb-ex-row--ss ct-wb-ss-g' + (((ssG - 1) % 4) + 1) : '';
      const ssHi = wbDndKind === 'ss' && ssHover === exi;
      const ssPickHint = ssPickFrom != null && ssPickFrom !== exi;
      const exRowStableKey = String(ex.id != null ? ex.id : 'exi-' + exi);
      const isExFolded = hasOwn.call(wbExFolded, exRowStableKey)
        ? !!wbExFolded[exRowStableKey]
        : !!ex.collapsed;

      out.push(React.createElement('div', {
        key: ex.id || 'ex' + exi,
        className: 'ct-wb-ex-row' + ssClass + (ssHi ? ' ct-wb-ex-row--ss-hover' : '') +
          (ssPickHint ? ' ct-wb-ex-row--ss-pick-hint' : '') +
          (isExFolded ? ' ct-wb-ex-row--folded' : ''),
        onDragOver: function (e) {
          if (wbDndKind === 'reorder') {
            e.preventDefault();
            e.stopPropagation();
            try {
              e.dataTransfer.dropEffect = 'move';
            } catch (err) { /* noop */ }
            const rect = e.currentTarget.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            const before = e.clientY < mid ? exi : exi + 1;
            setInsertBefore(before);
          } else if (wbDndKind === 'ss') {
            e.preventDefault();
            e.stopPropagation();
            try {
              e.dataTransfer.dropEffect = 'copy';
            } catch (err2) { /* noop */ }
            setSsHover(exi);
          }
        },
        onDragLeave: function (e) {
          if (wbDndKind === 'ss') {
            if (!e.currentTarget.contains(e.relatedTarget)) setSsHover(null);
          }
        },
        onDrop: function (e) {
          e.preventDefault();
          e.stopPropagation();
          const raw = e.dataTransfer.getData('text/plain') || '';
          const rect = e.currentTarget.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          const beforeIdx = e.clientY < mid ? exi : exi + 1;
          if (raw.indexOf('heysWbSs:') === 0) {
            const fromSs = parseInt(raw.split(':')[1], 10);
            if (fromSs !== exi && !Number.isNaN(fromSs)) {
              const aEx = exercises[fromSs];
              const bEx = exercises[exi];
              const aId = String(aEx && aEx.id != null ? aEx.id : 'exi-' + fromSs);
              const bId = String(bEx && bEx.id != null ? bEx.id : 'exi-' + exi);
              setWbExFolded(function (prev) {
                const next = { ...prev };
                delete next[aId];
                delete next[bId];
                return next;
              });
              patchTraining(ti, function (t0) {
                const wl0 = ensureWorkoutLogShape(t0);
                // Связка собирается смежно, поэтому прежние индексы уже не
                // указывают на тех же участников — раскрываем по номеру связки.
                const linked = linkAsSuperset(wl0.exercises, fromSs, exi);
                const gLinked = linked.groupId;
                wl0.exercises = linked.exercises.map(function (row) {
                  if (gLinked && +(row.ssGroup || 0) === gLinked) return { ...row, collapsed: false };
                  return row;
                });
                return applyWorkoutLogToTraining(t0, wl0);
              });
            }
            if (typeof haptic === 'function') haptic('medium');
          } else if (raw.indexOf('heysWbReorder:') === 0 || wbDndKind === 'reorder') {
            let from = NaN;
            if (raw.indexOf('heysWbReorder:') === 0) {
              from = parseInt(raw.split(':')[1], 10);
            } else if (wbDndFrom != null) {
              from = wbDndFrom;
            }
            if (!Number.isNaN(from)) {
              patchTraining(ti, function (t0) {
                const wl0 = ensureWorkoutLogShape(t0);
                const SK = strengthKernel();
                const movedGroup = +(wl0.exercises[from] && wl0.exercises[from].ssGroup) || 0;
                if (SK && movedGroup > 0) {
                  // Связка перетаскивается целиком: разорвать её перетаскиванием
                  // нельзя, для этого есть явное «Разъединить».
                  wl0.exercises = SK.moveSupersetGroup(wl0.exercises, movedGroup, beforeIdx);
                } else if (SK && SK.insertRespectingGroups) {
                  // Вставка внутрь чужой связки прилипает к её границе: участники
                  // обязаны идти подряд, иначе раунды перестают выводиться.
                  wl0.exercises = SK.insertRespectingGroups(wl0.exercises, from, beforeIdx);
                } else {
                  wl0.exercises = reorderExerciseToBeforeIndex(wl0.exercises, from, beforeIdx);
                }
                return applyWorkoutLogToTraining(t0, wl0);
              });
            }
            if (typeof haptic === 'function') haptic('light');
          }
          wbDndKind = null;
          wbDndFrom = null;
          setInsertBefore(null);
          setSsHover(null);
        }
      },
        React.createElement('div', { className: 'ct-wb-ex-head' },
          React.createElement('button', {
            type: 'button',
            className: 'ct-wb-ex-drag-order',
            title: 'Перетащить — порядок упражнений',
            'aria-label': 'Перетащить порядок',
            draggable: true,
            onDragStart: function (e) {
              e.stopPropagation();
              setSsPickFrom(null);
              wbDndKind = 'reorder';
              wbDndFrom = exi;
              setReorderDragActive(true);
              try {
                e.dataTransfer.setData('text/plain', 'heysWbReorder:' + exi);
                e.dataTransfer.effectAllowed = 'move';
              } catch (err) { /* noop */ }
            },
            onClick: function (e) {
              e.stopPropagation();
            }
          }, '⠿'),
          React.createElement('span', { className: 'ct-wb-ex-num ct-wb-ex-num--full' }, 'Упражнение ' + (exi + 1)),
          React.createElement('button', {
            type: 'button',
            className: 'ct-wb-ex-drag-ss ct-wb-ex-fold-toggle' + (isExFolded ? ' is-collapsed' : ''),
            title: isExFolded ? 'Развернуть блок упражнения' : 'Свернуть блок упражнения',
            'aria-expanded': !isExFolded,
            'aria-label': isExFolded ? 'Развернуть' : 'Свернуть',
            onClick: function (e) {
              e.stopPropagation();
              e.preventDefault();
              if (typeof haptic === 'function') haptic('light');
              setWbExFolded(function (prev) {
                var next = { ...prev };
                next[exRowStableKey] = !isExFolded;
                return next;
              });
              patchTraining(ti, function (t0) {
                const wl0 = ensureWorkoutLogShape(t0);
                wl0.exercises = wl0.exercises.map(function (row, idx) {
                  if (idx !== exi) return row;
                  return { ...row, collapsed: !isExFolded };
                });
                return applyWorkoutLogToTraining(t0, wl0);
              });
            }
          }, isExFolded ? 'Развернуть' : 'Свернуть'),
          React.createElement('span', { className: 'ct-wb-ex-head-spacer' }),
          React.createElement('span', { className: 'ct-wb-ex-ss-wrap' },
            React.createElement('button', {
              type: 'button',
              className: 'ct-wb-ex-drag-ss' + (ssPickFrom === exi ? ' is-picking' : ''),
              title: ssPickFrom === exi
                ? 'Выбери второе упражнение (СС) или отмени'
                : 'Супerset: нажми, затем на СС другого упражнения — или перетащи на карточку',
              'aria-label': 'Суперсет',
              draggable: true,
              onDragStart: function (e) {
                e.stopPropagation();
                setSsPickFrom(null);
                wbDndKind = 'ss';
                wbDndFrom = exi;
                try {
                  e.dataTransfer.setData('text/plain', 'heysWbSs:' + exi);
                  e.dataTransfer.effectAllowed = 'copy';
                } catch (err) { /* noop */ }
              },
              onClick: function (e) {
                e.stopPropagation();
                e.preventDefault();
                if (ssPickFrom == null) {
                  setSsPickFrom(exi);
                  if (typeof haptic === 'function') haptic('light');
                  return;
                }
                if (ssPickFrom === exi) {
                  setSsPickFrom(null);
                  return;
                }
                const partner = ssPickFrom;
                setSsPickFrom(null);
                const aEx = exercises[partner];
                const bEx = exercises[exi];
                const aId = String(aEx && aEx.id != null ? aEx.id : 'exi-' + partner);
                const bId = String(bEx && bEx.id != null ? bEx.id : 'exi-' + exi);
                setWbExFolded(function (prev) {
                  const next = { ...prev };
                  delete next[aId];
                  delete next[bId];
                  return next;
                });
                patchTraining(ti, function (t0) {
                  const wl0 = ensureWorkoutLogShape(t0);
                  const linked = linkAsSuperset(wl0.exercises, partner, exi);
                  const gLinked = linked.groupId;
                  wl0.exercises = linked.exercises.map(function (row) {
                    if (gLinked && +(row.ssGroup || 0) === gLinked) return { ...row, collapsed: false };
                    return row;
                  });
                  return applyWorkoutLogToTraining(t0, wl0);
                });
                if (typeof haptic === 'function') haptic('medium');
              }
            }, 'СС'),
            ssPickFrom === exi && React.createElement('button', {
              type: 'button',
              className: 'ct-wb-ex-ss-pick-cancel',
              title: 'Отменить выбор',
              'aria-label': 'Отменить выбор суперсета',
              onClick: function (e) {
                e.stopPropagation();
                e.preventDefault();
                setSsPickFrom(null);
                if (typeof haptic === 'function') haptic('light');
              }
            }, '✕')
          ),
          exercises.length > 1 && React.createElement('button', {
            type: 'button',
            className: 'ct-wb-ex-remove',
            onClick: (e) => {
              e.stopPropagation();
              if (typeof haptic === 'function') haptic('light');
              patchTraining(ti, (t0) => {
                const wl0 = ensureWorkoutLogShape(t0);
                wl0.exercises = wl0.exercises.filter((_, j) => j !== exi);
                if (wl0.exercises.length === 0) {
                  wl0.exercises = [{
                    id: createExerciseId(0),
                    name: '',
                    approaches: [{ id: createApproachId(0, 0), weightKg: '', reps: 10 }],
                    note: '',
                    ssGroup: 0,
                    rpe: 0
                  }];
                }
                return applyWorkoutLogToTraining(t0, wl0);
              });
            }
          }, '✕')
        ),
        isExFolded && (function () {
          var apN = approachesCountForExercise(ex);
          var nameDisp = String(ex.name || '').trim();
          var stats = exerciseStats[exi] || {};
          var curStats = exerciseRecordsFromApproaches(ex.approaches);
          var prevStats = stats.last
            ? exerciseRecordsFromApproaches(approachesFromStoredExercise({ approaches: stats.last.approaches, sets: stats.last.sets, reps: stats.last.reps, weightKg: stats.last.weightKg }))
            : null;
          var hasCurrent = curStats.total > 0;
          var deltaEls = [];
          if (hasCurrent && prevStats && prevStats.total > 0) {
            var dW = curStats.maxW - prevStats.maxW;
            var dT = curStats.total - prevStats.total;
            if (Math.abs(dW) >= 0.05) {
              deltaEls.push(React.createElement('span', {
                key: 'dw',
                className: 'ct-wb-ex-folded-delta ' + (dW > 0 ? 'is-up' : 'is-down'),
                title: 'Макс. вес vs прошлый раз'
              }, (dW > 0 ? '↑' : '↓') + ' ' + fmtKgDelta(dW)));
            }
            if (Math.abs(dT) >= 0.5) {
              deltaEls.push(React.createElement('span', {
                key: 'dt',
                className: 'ct-wb-ex-folded-delta ' + (dT > 0 ? 'is-up' : 'is-down'),
                title: 'Объём (вес × повторы) vs прошлый раз'
              }, (dT > 0 ? '↑' : '↓') + ' ' + fmtKgDelta(dT)));
            }
            if (deltaEls.length === 0 && hasCurrent) {
              deltaEls.push(React.createElement('span', {
                key: 'eq',
                className: 'ct-wb-ex-folded-delta is-eq',
                title: 'Без изменений vs прошлый раз'
              }, '= ' + fmtKgDelta(0)));
            }
          }
          var isPR = !!(stats.record && hasCurrent && curStats.maxSet > stats.record.maxSet + 0.05);
          var prEl = isPR && React.createElement('span', {
            className: 'ct-wb-ex-folded-pr',
            title: 'Личный рекорд: вес × повторы превысил исторический максимум'
          }, '🏆');
          return React.createElement('div', { className: 'ct-wb-ex-name-folded' },
            React.createElement('span', {
              className: 'ct-wb-ex-name-folded-text',
              title: nameDisp || 'Без названия'
            }, nameDisp || 'Без названия'),
            prEl,
            deltaEls.length > 0 && React.createElement('span', { className: 'ct-wb-ex-folded-deltas' }, deltaEls),
            React.createElement('span', {
              className: 'ct-wb-ex-name-folded-cnt',
              'aria-label': approachesCountLabelRu(apN)
            }, approachesCountLabelRu(apN))
          );
        })(),
        !isExFolded && React.createElement(WorkoutExerciseNameField, {
          key: 'wb-ex-name-' + exi,
          listId: 'wb-ex-suggest-' + ti + '-' + exi,
          focusTargetId: 'wb-ex-weight-' + ti + '-' + exi + '-0',
          value: ex.name,
          haptic: haptic,
          onChange: function (v) {
            patchTraining(ti, function (t0) {
              const wl0 = ensureWorkoutLogShape(t0);
              wl0.exercises = wl0.exercises.map(function (row, j) {
                return j === exi ? { ...row, name: v } : row;
              });
              return applyWorkoutLogToTraining(t0, wl0);
            });
          },
          onPick: function (picked) {
            if (typeof HEYS.bumpExerciseUsage === 'function') {
              HEYS.bumpExerciseUsage(picked);
            }
            const norm = typeof HEYS.normalizeExerciseName === 'function'
              ? HEYS.normalizeExerciseName(picked)
              : String(picked || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
            const snap = dk && norm ? findLastExerciseSnapshot(dk, norm, ti, exi) : null;
            if (!snap) return;
            patchTraining(ti, function (t0) {
              const wl0 = ensureWorkoutLogShape(t0);
              wl0.exercises = wl0.exercises.map(function (row, j) {
                if (j !== exi) return row;
                const apNew = buildApproachesFromSnapshot(snap, row);
                const merged = {
                  ...row,
                  name: picked,
                  approaches: apNew,
                  rpe: snap.rpe > 0 ? snap.rpe : row.rpe,
                  note: snap.note && String(snap.note).trim() ? snap.note : row.note
                };
                const leg = syncLegacyFieldsFromApproaches(merged);
                return { ...merged, ...leg };
              });
              return applyWorkoutLogToTraining(t0, wl0);
            });
          }
        }),
        !isExFolded && React.createElement(WorkoutExerciseHistoryStrip, {
          key: 'wb-ex-hist-' + ti + '-' + exi,
          exerciseName: ex.name,
          dateKey: dk,
          ti: ti,
          exi: exi,
          haptic: haptic
        }),
        !isExFolded && (function () {
          const approaches = Array.isArray(ex.approaches) && ex.approaches.length
            ? ex.approaches
            : [{ id: 'ap_fallback', weightKg: ex.weightKg != null ? String(ex.weightKg) : '', reps: ex.reps != null ? +ex.reps : 10 }];
          var statsForApRow = exerciseStats[exi] || {};
          var historicalMaxSet = statsForApRow.record ? statsForApRow.record.maxSet : 0;
          var restPresetSec = ex.restSec != null && REST_PRESETS.indexOf(+ex.restSec) >= 0 ? +ex.restSec : 90;
          return React.createElement('div', { className: 'ct-wb-ex-ap-table' },
            React.createElement('div', { className: 'ct-wb-ex-ap-head', 'aria-hidden': true },
              React.createElement('span', { className: 'ct-wb-ex-ap-h' }, 'Подход'),
              React.createElement('span', { className: 'ct-wb-ex-ap-h' }, 'Вес'),
              React.createElement('span', { className: 'ct-wb-ex-ap-h' }, 'Повторы'),
              React.createElement('span', { className: 'ct-wb-ex-ap-h ct-wb-ex-ap-h--done', title: 'Отметить подход выполненным' }, '✓')
            ),
            approaches.map(function (ap, api) {
              var apVol = approachVolumeKg(ap);
              var isApPR = !!(historicalMaxSet > 0 && apVol > historicalMaxSet + 0.05);
              var isApDone = !!ap.done;
              return React.createElement('div', {
                key: ap.id || 'wb-ap-' + ti + '-' + exi + '-' + api,
                className: 'ct-wb-ex-ap-row' + (isApDone ? ' ct-wb-ex-ap-row--done' : '') + (isApPR ? ' ct-wb-ex-ap-row--pr' : '')
              },
                React.createElement('div', { className: 'ct-wb-ex-ap-cell ct-wb-ex-ap-cell--label' },
                  React.createElement('span', { className: 'ct-wb-ex-ap-num' }, approachOrdinalRu(api)),
                  isApPR && React.createElement('span', {
                    className: 'ct-wb-ex-ap-pr',
                    title: 'Личный рекорд: ' + Math.round(apVol) + ' кг (вес × повторы)'
                  }, '🏆'),
                  approaches.length > 1 && React.createElement('button', {
                    type: 'button',
                    className: 'ct-wb-ex-ap-remove',
                    title: 'Убрать подход',
                    'aria-label': 'Убрать ' + approachOrdinalRu(api),
                    onClick: function (e) {
                      e.stopPropagation();
                      if (typeof haptic === 'function') haptic('light');
                      patchTraining(ti, function (t0) {
                        const wl0 = ensureWorkoutLogShape(t0);
                        wl0.exercises = wl0.exercises.map(function (row, j) {
                          if (j !== exi) return row;
                          const ap2 = (row.approaches || []).slice();
                          if (ap2.length <= 1) return row;
                          ap2.splice(api, 1);
                          const merged = { ...row, approaches: ap2 };
                          return { ...merged, ...syncLegacyFieldsFromApproaches(merged) };
                        });
                        return applyWorkoutLogToTraining(t0, wl0);
                      });
                    }
                  }, '×')
                ),
                React.createElement('label', { className: 'ct-wb-ex-ap-cell ct-wb-ex-ap-cell--weight' },
                  React.createElement('input', {
                    type: 'text',
                    id: 'wb-ex-weight-' + ti + '-' + exi + '-' + api,
                    className: 'ct-wb-mini-inp',
                    placeholder: 'кг',
                    inputMode: 'decimal',
                    enterKeyHint: 'done',
                    autoComplete: 'off',
                    value: ap.weightKg != null ? String(ap.weightKg) : '',
                    onClick: function (e) { e.stopPropagation(); },
                    onChange: function (e) {
                      const v = e.target.value;
                      patchTraining(ti, function (t0) {
                        const wl0 = ensureWorkoutLogShape(t0);
                        wl0.exercises = wl0.exercises.map(function (row, j) {
                          if (j !== exi) return row;
                          const ap3 = (row.approaches || []).slice();
                          if (!ap3[api]) return row;
                          ap3[api] = { ...ap3[api], weightKg: v };
                          const merged = { ...row, approaches: ap3 };
                          return { ...merged, ...syncLegacyFieldsFromApproaches(merged) };
                        });
                        return applyWorkoutLogToTraining(t0, wl0);
                      });
                    }
                  })
                ),
                React.createElement('div', { className: 'ct-wb-ex-ap-cell ct-wb-ex-ap-cell--reps' },
                  wbApproachRepStepper(ti, exi, api, Math.max(1, parseInt(ap.reps, 10) || 1), 1, 200)
                ),
                React.createElement('div', { className: 'ct-wb-ex-ap-cell ct-wb-ex-ap-cell--done' },
                  React.createElement('button', {
                    type: 'button',
                    className: 'ct-wb-ex-ap-done-btn' + (isApDone ? ' is-on' : ''),
                    title: isApDone ? 'Подход выполнен — снять отметку' : 'Отметить подход выполненным',
                    'aria-label': (isApDone ? 'Снять отметку с подхода: ' : 'Отметить подход выполненным: ') + approachOrdinalRu(api),
                    'aria-pressed': isApDone,
                    onClick: function (e) {
                      e.stopPropagation();
                      const wasDone = isApDone;
                      patchTraining(ti, function (t0) {
                        const wl0 = ensureWorkoutLogShape(t0);
                        wl0.exercises = wl0.exercises.map(function (row, j) {
                          if (j !== exi) return row;
                          const apX = (row.approaches || []).slice();
                          if (!apX[api]) return row;
                          apX[api] = { ...apX[api], done: !wasDone };
                          const merged = { ...row, approaches: apX };
                          return { ...merged, ...syncLegacyFieldsFromApproaches(merged) };
                        });
                        let totalAp = 0, doneAp = 0, hasName = false;
                        for (let ii = 0; ii < wl0.exercises.length; ii++) {
                          const ex0 = wl0.exercises[ii];
                          if (!ex0) continue;
                          if (String(ex0.name || '').trim()) hasName = true;
                          const aps0 = Array.isArray(ex0.approaches) ? ex0.approaches : [];
                          for (let kk = 0; kk < aps0.length; kk++) {
                            totalAp += 1;
                            if (aps0[kk] && aps0[kk].done) doneAp += 1;
                          }
                        }
                        const allDoneNew = totalAp > 0 && doneAp === totalAp && hasName;
                        const hasDoneNew = doneAp > 0;
                        const nowTs = Date.now();
                        if (!hasDoneNew) {
                          delete wl0.startedAt;
                          delete wl0.completedAt;
                        } else if (allDoneNew) {
                          if (!wl0.startedAt) wl0.startedAt = nowTs;
                          wl0.completedAt = nowTs;
                        } else {
                          if (!wl0.startedAt) wl0.startedAt = nowTs;
                          if (wl0.completedAt) delete wl0.completedAt;
                        }
                        return applyWorkoutLogToTraining(t0, wl0);
                      });
                      if (!wasDone) {
                        // Упражнение отмечено сделанным — запись в данные.
                        HEYS.feedback?.emit?.('step.done');
                        setRestTimer({
                          startTs: Date.now(),
                          thresholdSec: restPresetSec,
                          exi: exi,
                          api: api,
                          exName: ex.name || ('Упражнение ' + (exi + 1)),
                          notified: false
                        });
                        setRestNow(Date.now());
                      } else {
                        if (typeof haptic === 'function') haptic('light');
                      }
                    }
                  }, isApDone ? '✓' : '○')
                )
              );
            }),
            React.createElement('button', {
              type: 'button',
              className: 'ct-wb-add-approach-btn',
              onClick: function (e) {
                e.stopPropagation();
                e.preventDefault();
                const guardKey = ti + ':' + exi;
                const nowClick = Date.now();
                if (nowClick - (addApproachGuardRef.current[guardKey] || 0) < 250) return;
                addApproachGuardRef.current[guardKey] = nowClick;
                if (typeof haptic === 'function') haptic('light');
                const nextIdx = approaches.length;
                patchTraining(ti, function (t0) {
                  const wl0 = ensureWorkoutLogShape(t0);
                  wl0.exercises = wl0.exercises.map(function (row, j) {
                    if (j !== exi) return row;
                    const ap4 = (row.approaches && row.approaches.length ? row.approaches.slice() : [{ id: 'ap0', weightKg: '', reps: 10 }]);
                    const lastAp = ap4[ap4.length - 1];
                    const lastReps = lastAp ? Math.max(1, parseInt(lastAp.reps, 10) || 10) : 10;
                    const lastW = lastAp && lastAp.weightKg != null ? String(lastAp.weightKg) : '';
                    ap4.push({
                      id: createApproachId(exi, ap4.length),
                      weightKg: lastW,
                      reps: lastReps
                    });
                    const merged = { ...row, approaches: ap4 };
                    return { ...merged, ...syncLegacyFieldsFromApproaches(merged) };
                  });
                  return applyWorkoutLogToTraining(t0, wl0);
                });
                global.requestAnimationFrame(function () {
                  global.requestAnimationFrame(function () {
                    var el = document.getElementById('wb-ex-weight-' + ti + '-' + exi + '-' + nextIdx);
                    if (el && typeof el.focus === 'function') el.focus();
                  });
                });
              }
            }, '+ Добавить подход')
          );
        })(),
        !isExFolded && React.createElement('div', { className: 'ct-wb-ex-meta' },
          React.createElement('div', { className: 'ct-wb-ex-rpe-row' },
            React.createElement('span', { className: 'ct-wb-ex-rpe-label' }, 'RPE'),
            [6, 7, 8, 9, 10].map(function (num) {
              return React.createElement('button', {
                type: 'button',
                key: 'rpe-' + ti + '-' + exi + '-' + num,
                className: 'ct-wb-ex-rpe-chip' + ((ex.rpe || 0) === num ? ' is-on' : ''),
                onClick: function (e) {
                  e.stopPropagation();
                  patchTraining(ti, function (t0) {
                    const wl0 = ensureWorkoutLogShape(t0);
                    wl0.exercises = wl0.exercises.map(function (row, j) {
                      if (j !== exi) return row;
                      const nextR = (row.rpe || 0) === num ? 0 : num;
                      const next = { ...row, rpe: nextR };
                      if (!row.restManual) next.restSec = restSecForRpe(nextR);
                      return next;
                    });
                    return applyWorkoutLogToTraining(t0, wl0);
                  });
                  if (typeof haptic === 'function') haptic('light');
                }
              }, String(num));
            }),
            React.createElement('button', {
              type: 'button',
              className: 'ct-wb-ex-rest-chip' + (ex.restManual ? ' is-manual' : ' is-auto'),
              title: ex.restManual
                ? 'Отдых между подходами (задан вручную) — нажмите для переключения 60/90/120/180 с'
                : 'Отдых между подходами (авто по RPE) — нажмите чтобы переключить вручную',
              'aria-label': 'Отдых между подходами: ' + formatRestSec(ex.restSec != null ? +ex.restSec : 90) + (ex.restManual ? ' (вручную)' : ' (авто по RPE)') + '. Нажмите для смены.',
              onClick: function (e) {
                e.stopPropagation();
                const cur = ex.restSec != null ? +ex.restSec : 90;
                const nxt = nextRestPreset(cur);
                patchTraining(ti, function (t0) {
                  const wl0 = ensureWorkoutLogShape(t0);
                  wl0.exercises = wl0.exercises.map(function (row, j) {
                    return j === exi ? { ...row, restSec: nxt, restManual: true } : row;
                  });
                  return applyWorkoutLogToTraining(t0, wl0);
                });
                if (typeof haptic === 'function') haptic('light');
              }
            }, '⏱ ' + formatRestSec(ex.restSec != null ? +ex.restSec : 90) + (ex.restManual ? '' : ' · авто'))
          ),
          React.createElement('input', {
            type: 'text',
            className: 'ct-wb-ex-note-inp',
            placeholder: 'Заметка к упражнению',
            value: ex.note || '',
            onClick: function (e) {
              e.stopPropagation();
            },
            onChange: function (e) {
              const v = e.target.value;
              patchTraining(ti, function (t0) {
                const wl0 = ensureWorkoutLogShape(t0);
                wl0.exercises = wl0.exercises.map(function (row, j) {
                  return j === exi ? { ...row, note: v } : row;
                });
                return applyWorkoutLogToTraining(t0, wl0);
              });
            }
          })
        )
      ));

      if (exi < n - 1) {
        const gHere = +(exercises[exi].ssGroup || 0);
        const gNext = +(exercises[exi + 1].ssGroup || 0);
        if (gHere > 0 && gHere === gNext) {
          const gColor = ((gHere - 1) % 4) + 1;
          out.push(React.createElement('div', {
            key: 'ss-conn-' + exi,
            className: 'ct-wb-ex-ss-connector ct-wb-ss-conn-g' + gColor
          },
            React.createElement('span', { className: 'ct-wb-ex-ss-arrows', 'aria-hidden': true }, '⇄'),
            React.createElement('button', {
              type: 'button',
              className: 'ct-wb-ex-ss-break',
              title: 'Разъединить суперсет (все упражнения этой группы)',
              'aria-label': 'Разъединить суперсет',
              onClick: function (e) {
                e.stopPropagation();
                e.preventDefault();
                patchTraining(ti, function (t0) {
                  const wl0 = ensureWorkoutLogShape(t0);
                  wl0.exercises = dissolveSsGroupEverywhere(wl0.exercises, gHere);
                  return applyWorkoutLogToTraining(t0, wl0);
                });
                if (typeof haptic === 'function') haptic('light');
              }
            }, '✕')
          ));
        }
      }
    }

    if (insertBefore === n && wbDndKind === 'reorder') {
      out.push(React.createElement('div', {
        key: 'wb-ins-end',
        className: 'ct-wb-ex-drop-line',
        'aria-hidden': true
      }));
    }

    if (workoutAggregate.allDone && wlStartedAt > 0) {
      const elapsedMs = (wlCompletedAt > 0 ? wlCompletedAt : workoutNow) - wlStartedAt;
      const tonnage = workoutAggregate.totalVolume;
      let prevTonnageSum = 0;
      let prevHasData = false;
      for (let pi = 0; pi < exercises.length; pi++) {
        const stats = exerciseStats[pi];
        if (!stats || !stats.last) continue;
        const aps = approachesFromStoredExercise({
          approaches: stats.last.approaches,
          sets: stats.last.sets,
          reps: stats.last.reps,
          weightKg: stats.last.weightKg
        });
        const r = exerciseRecordsFromApproaches(aps);
        if (r.total > 0) {
          prevTonnageSum += r.total;
          prevHasData = true;
        }
      }
      let tonnageDeltaPct = null;
      if (prevHasData && prevTonnageSum > 0 && tonnage > 0) {
        tonnageDeltaPct = ((tonnage - prevTonnageSum) / prevTonnageSum) * 100;
      }
      const dayWorkoutCount = countStrengthWorkoutsOnDay(dk);
      const dayTonnage = computeDayTotalTonnage(dk);
      const showDayRow = dayWorkoutCount > 1 && dayTonnage > 0;
      let dayTonnageDeltaPct = null;
      let prevDayLabel = null;
      if (showDayRow) {
        const prevDay = findPrevDayTonnage(dk);
        if (prevDay && prevDay.total > 0) {
          dayTonnageDeltaPct = ((dayTonnage - prevDay.total) / prevDay.total) * 100;
          prevDayLabel = formatExerciseHistoryLabel(prevDay.dateKey, dk);
        }
      }
      out.push(React.createElement('div', {
        key: 'wb-summary-card',
        className: 'ct-wb-summary-card',
        role: 'status',
        onClick: function (e) { e.stopPropagation(); }
      },
        React.createElement('div', { className: 'ct-wb-summary-title' },
          React.createElement('span', { className: 'ct-wb-summary-emoji', 'aria-hidden': true }, '🎉'),
          React.createElement('span', null, 'Тренировка завершена!')
        ),
        React.createElement('div', { className: 'ct-wb-summary-grid' },
          React.createElement('div', { className: 'ct-wb-summary-cell' },
            React.createElement('span', { className: 'ct-wb-summary-cell-label' }, 'Длительность'),
            React.createElement('span', { className: 'ct-wb-summary-cell-value' }, formatWorkoutDuration(elapsedMs))
          ),
          React.createElement('div', { className: 'ct-wb-summary-cell' },
            React.createElement('span', { className: 'ct-wb-summary-cell-label' }, 'Тоннаж'),
            React.createElement('span', { className: 'ct-wb-summary-cell-value' },
              formatVolumeKg(tonnage),
              tonnageDeltaPct != null && Math.abs(tonnageDeltaPct) >= 1 && React.createElement('span', {
                className: 'ct-wb-summary-cell-delta ' + (tonnageDeltaPct > 0 ? 'is-up' : 'is-down')
              }, (tonnageDeltaPct > 0 ? ' ↑' : ' ↓') + Math.abs(Math.round(tonnageDeltaPct)) + '%')
            )
          ),
          React.createElement('div', { className: 'ct-wb-summary-cell' },
            React.createElement('span', { className: 'ct-wb-summary-cell-label' }, 'Макс. вес'),
            React.createElement('span', { className: 'ct-wb-summary-cell-value' },
              workoutAggregate.maxWeight > 0 ? Math.round(workoutAggregate.maxWeight * 10) / 10 + ' кг' : '—')
          ),
          React.createElement('div', { className: 'ct-wb-summary-cell' + (workoutAggregate.prCount > 0 ? ' is-pr' : '') },
            React.createElement('span', { className: 'ct-wb-summary-cell-label' }, 'PR за день'),
            React.createElement('span', { className: 'ct-wb-summary-cell-value' },
              workoutAggregate.prCount > 0 ? '🏆 ' + workoutAggregate.prCount : '—')
          )
        ),
        showDayRow && React.createElement('div', { className: 'ct-wb-summary-day-row' },
          React.createElement('span', { className: 'ct-wb-summary-day-label' },
            'Сегодня всего (×' + dayWorkoutCount + ' силовых)'),
          React.createElement('span', { className: 'ct-wb-summary-day-value' },
            formatVolumeKg(dayTonnage),
            dayTonnageDeltaPct != null && Math.abs(dayTonnageDeltaPct) >= 1 && prevDayLabel && React.createElement('span', {
              className: 'ct-wb-summary-cell-delta ' + (dayTonnageDeltaPct > 0 ? 'is-up' : 'is-down'),
              title: 'vs ' + prevDayLabel
            }, (dayTonnageDeltaPct > 0 ? ' ↑' : ' ↓') + Math.abs(Math.round(dayTonnageDeltaPct)) + '% vs ' + prevDayLabel.toLowerCase())
          )
        )
      ));
    }

    if (restTimer) {
      const elapsedMs = Math.max(0, restNow - restTimer.startTs);
      const elapsedSec = Math.floor(elapsedMs / 1000);
      const thresholdSec = Math.max(1, +restTimer.thresholdSec || 90);
      const overSec = Math.max(0, elapsedSec - thresholdSec);
      const reached = elapsedSec >= thresholdSec;
      const fillFrac = reached ? 1 : Math.min(1, elapsedMs / (thresholdSec * 1000));

      const RING_R = 36;
      const RING_C = 2 * Math.PI * RING_R;
      const dashOffset = RING_C * (1 - fillFrac);

      out.push(React.createElement('div', {
        key: 'wb-rest-stopwatch',
        className: 'ct-wb-rest-watch'
          + (reached ? ' is-reached' : '')
          + (reached && overSec >= 1 ? ' is-overflow' : ''),
        role: 'timer',
        'aria-live': 'off',
        onClick: function (e) { e.stopPropagation(); }
      },
        React.createElement('div', { className: 'ct-wb-rest-watch-ring-wrap' },
          React.createElement('svg', {
            className: 'ct-wb-rest-watch-svg',
            viewBox: '0 0 80 80',
            width: 80,
            height: 80,
            'aria-hidden': true
          },
            React.createElement('circle', {
              className: 'ct-wb-rest-watch-track',
              cx: 40, cy: 40, r: RING_R,
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 5
            }),
            React.createElement('circle', {
              className: 'ct-wb-rest-watch-arc',
              cx: 40, cy: 40, r: RING_R,
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 5,
              strokeLinecap: 'round',
              strokeDasharray: RING_C.toFixed(2),
              strokeDashoffset: dashOffset.toFixed(2),
              transform: 'rotate(-90 40 40)'
            })
          ),
          React.createElement('div', { className: 'ct-wb-rest-watch-center' },
            React.createElement('div', { className: 'ct-wb-rest-watch-time' }, formatRestSec(elapsedSec)),
            React.createElement('div', { className: 'ct-wb-rest-watch-threshold' },
              reached
                ? (overSec >= 1 ? '+' + formatRestSec(overSec) + ' сверх' : 'Готов!')
                : 'из ' + formatRestSec(thresholdSec)
            )
          )
        ),
        React.createElement('div', { className: 'ct-wb-rest-watch-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'ct-wb-rest-watch-btn ct-wb-rest-watch-btn--add',
            title: '+10 секунд к желаемой паузе (нужно дойти до снаряда / взять вес)',
            'aria-label': 'Добавить 10 секунд к желаемой паузе',
            onClick: function (e) {
              e.stopPropagation();
              setRestTimer(function (prev) {
                if (!prev) return prev;
                const newThreshold = Math.min(900, (+prev.thresholdSec || 90) + 10);
                const stillReachable = (Date.now() - prev.startTs) / 1000 < newThreshold;
                return {
                  ...prev,
                  thresholdSec: newThreshold,
                  notified: stillReachable ? false : prev.notified
                };
              });
              if (typeof haptic === 'function') haptic('light');
            }
          }, '+10с'),
          React.createElement('button', {
            type: 'button',
            className: 'ct-wb-rest-watch-btn ct-wb-rest-watch-btn--stop',
            title: 'Закрыть таймер',
            'aria-label': 'Закрыть таймер отдыха',
            onClick: function (e) {
              e.stopPropagation();
              setRestTimer(null);
              if (typeof haptic === 'function') haptic('light');
            }
          }, '✕')
        )
      ));
    }

    return React.createElement('div', {
      className: 'ct-wb-ex-list' + (reorderDragActive ? ' ct-wb-ex-list--reorder-drag' : '')
    }, out);
  }

  /** Силовая (конструктор): квадратная кнопка по центру шапки — свернуть/развернуть тело карточки. */
  function CollapsibleWorkoutBuilderTrainingCard(props) {
    const {
      cardClassName,
      haptic,
      openTrainingPicker,
      trainingIndex,
      headerIconChar,
      titleBoxEl,
      timeEl,
      rightGroupEl,
      foldedContentEl,
      footerEl,
      commentEl,
      initialCollapsed,
      collapsedStorageKey,
      onCollapsedChange,
      curatorTarget,
      trainingTargetIndex
    } = props || {};

    function readStoredCollapsed() {
      if (!collapsedStorageKey) return null;
      try {
        const raw = global.sessionStorage && global.sessionStorage.getItem(collapsedStorageKey);
        if (raw === '1') return true;
        if (raw === '0') return false;
      } catch (_) { /* noop */ }
      return null;
    }

    function writeStoredCollapsed(nextCollapsed) {
      if (!collapsedStorageKey) return;
      try {
        if (global.sessionStorage) {
          global.sessionStorage.setItem(collapsedStorageKey, nextCollapsed ? '1' : '0');
        }
      } catch (_) { /* noop */ }
    }

    const [collapsed, setCollapsed] = React.useState(function () {
      const stored = readStoredCollapsed();
      return stored === null ? !!initialCollapsed : stored;
    });
    React.useEffect(function () {
      const stored = readStoredCollapsed();
      setCollapsed(stored === null ? !!initialCollapsed : stored);
    }, [collapsedStorageKey]);
    const startSlot = React.createElement('div', { className: 'compact-train-header-start' },
      React.createElement('span', { className: 'compact-train-icon' }, headerIconChar),
      titleBoxEl
    );
    const foldBtn = React.createElement('button', {
      type: 'button',
      className: 'compact-train-fold-btn' + (collapsed ? ' is-collapsed' : ''),
      title: collapsed ? 'Развернуть дневник' : 'Свернуть дневник',
      'aria-expanded': !collapsed,
      onClick: (e) => {
        e.stopPropagation();
        if (typeof haptic === 'function') haptic('light');
        setCollapsed((c) => {
          const next = !c;
          writeStoredCollapsed(next);
          if (typeof onCollapsedChange === 'function') onCollapsedChange(next);
          return next;
        });
      }
    },
      React.createElement('svg', {
        className: 'compact-train-fold-svg',
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': true
      },
        React.createElement('path', {
          d: 'M6 9l6 6 6-6',
          stroke: 'currentColor',
          strokeWidth: '2.2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        }))
    );
    const endSlot = React.createElement('div', { className: 'compact-train-header-end' },
      timeEl || null,
      rightGroupEl
    );
    return React.createElement('div', {
      className: cardClassName + (collapsed ? ' compact-train--wb-collapsed' : ''),
      'data-curator-target': curatorTarget,
      'data-training-index': trainingTargetIndex
    },
      React.createElement('div', {
        className: 'compact-train-header compact-train-header--with-fold',
        onClick: () => openTrainingPicker && openTrainingPicker(trainingIndex)
      }, startSlot, foldBtn, endSlot),
      !collapsed && React.createElement('div', { className: 'ct-wb-training-scale' },
        foldedContentEl,
        footerEl,
        commentEl
      )
    );
  }

  /** Название упражнения: подсказки из HEYS.exerciseCatalog + частота (LS). */
  function WorkoutExerciseNameField(props) {
    const {
      value,
      onChange,
      onPick,
      listId,
      haptic,
      focusTargetId
    } = props || {};
    const [open, setOpen] = React.useState(false);
    const [activeIdx, setActiveIdx] = React.useState(0);
    const [favTick, setFavTick] = React.useState(0);
    const blurTimerRef = React.useRef(null);

    React.useEffect(function () {
      setActiveIdx(0);
    }, [value]);

    const suggestions = React.useMemo(function () {
      const fn = HEYS.getExerciseSuggestions;
      if (typeof fn === 'function') {
        try {
          return fn(value || '', 12);
        } catch (err) {
          console.warn('[HEYS.dayTrainings] getExerciseSuggestions', err);
        }
      }
      const cat = HEYS.exerciseCatalog;
      if (!Array.isArray(cat) || cat.length === 0) return [];
      const q = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е');
      const normFn = typeof HEYS.normalizeExerciseName === 'function' ? HEYS.normalizeExerciseName : null;
      if (!q) {
        return cat.slice(0, 12).map(function (c) {
          const norm = normFn ? normFn(c.name) : String(c.name || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
          return {
            name: c.name,
            rank: c.rank,
            norm: norm,
            favorite: typeof HEYS.isExerciseFavoriteNorm === 'function' && norm ? HEYS.isExerciseFavoriteNorm(norm) : false
          };
        });
      }
      const out = [];
      for (let i = 0; i < cat.length && out.length < 12; i++) {
        const n = String(cat[i].name || '')
          .toLowerCase()
          .replace(/ё/g, 'е');
        if (n.indexOf(q) >= 0) {
          const norm = normFn ? normFn(cat[i].name) : n.replace(/\s+/g, ' ');
          out.push({
            name: cat[i].name,
            rank: cat[i].rank,
            norm: norm,
            favorite: typeof HEYS.isExerciseFavoriteNorm === 'function' && norm ? HEYS.isExerciseFavoriteNorm(norm) : false
          });
        }
      }
      return out;
    }, [value, favTick]);

    const commitPick = function (name) {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      if (typeof onPick === 'function') onPick(name);
      if (typeof haptic === 'function') haptic('light');
      setOpen(false);
      onChange(name);
      if (focusTargetId) {
        function tryFocusWeight() {
          var el = document.getElementById(focusTargetId);
          if (el && typeof el.focus === 'function') el.focus();
        }
        requestAnimationFrame(function () {
          requestAnimationFrame(tryFocusWeight);
        });
        setTimeout(tryFocusWeight, 120);
      }
    };

    const onInputChange = function (e) {
      onChange(e.target.value);
      setOpen(true);
    };

    const onKeyDown = function (e) {
      if (!open || suggestions.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(function (i) {
          return Math.min(suggestions.length - 1, i + 1);
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(function (i) {
          return Math.max(0, i - 1);
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const s = suggestions[activeIdx];
        if (s) commitPick(s.name);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };

    const nameNorm = typeof HEYS.normalizeExerciseName === 'function'
      ? HEYS.normalizeExerciseName(value || '')
      : String(value || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
    const headerIsFav = !!(nameNorm && typeof HEYS.isExerciseFavoriteNorm === 'function' && HEYS.isExerciseFavoriteNorm(nameNorm));

    return React.createElement('div', { className: 'ct-wb-ex-name-wrap' },
      React.createElement('div', { className: 'ct-wb-ex-name-row' },
        React.createElement('input', {
          type: 'text',
          className: 'ct-wb-ex-name',
          placeholder: 'Название — поиск по каталогу',
          autoComplete: 'off',
          role: 'combobox',
          'aria-expanded': open && suggestions.length > 0,
          'aria-controls': listId,
          'aria-autocomplete': 'list',
          value: value,
          onClick: function (e) {
            e.stopPropagation();
          },
          onFocus: function (e) {
            e.stopPropagation();
            if (blurTimerRef.current) {
              clearTimeout(blurTimerRef.current);
              blurTimerRef.current = null;
            }
            setOpen(true);
          },
          onBlur: function () {
            blurTimerRef.current = global.setTimeout(function () {
              setOpen(false);
              blurTimerRef.current = null;
            }, 180);
          },
          onChange: function (e) {
            e.stopPropagation();
            onInputChange(e);
          },
          onKeyDown: function (e) {
            e.stopPropagation();
            onKeyDown(e);
          }
        }),
        React.createElement('button', {
          type: 'button',
          className: 'ct-wb-ex-name-header-fav' + (headerIsFav ? ' is-on' : ''),
          title: headerIsFav ? 'Убрать из избранного' : 'В избранное',
          'aria-label': headerIsFav ? 'Убрать из избранного' : 'В избранное',
          onClick: function (e) {
            e.stopPropagation();
            e.preventDefault();
            var nm = String(value || '').trim();
            if (!nm) return;
            if (typeof HEYS.toggleExerciseFavorite === 'function') {
              HEYS.toggleExerciseFavorite(nm);
              setFavTick(function (t) {
                return t + 1;
              });
            }
            if (typeof haptic === 'function') haptic('light');
          }
        }, headerIsFav ? '★' : '☆')
      ),
      open && suggestions.length > 0 && React.createElement('ul', {
        id: listId,
        className: 'ct-wb-ex-name-suggest',
        role: 'listbox',
        onMouseDown: function (e) {
          e.preventDefault();
        },
        onClick: function (e) {
          e.stopPropagation();
        }
      }, suggestions.map(function (item, idx) {
        const isFav = item.favorite || (typeof HEYS.isExerciseFavoriteNorm === 'function' && item.norm && HEYS.isExerciseFavoriteNorm(item.norm));
        const starEl = React.createElement('button', {
          type: 'button',
          className: 'ct-wb-ex-name-suggest-fav' + (isFav ? ' is-on' : ''),
          title: isFav ? 'Убрать из избранного' : 'В избранное',
          'aria-label': isFav ? 'Убрать из избранного' : 'В избранное',
          onMouseDown: function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof HEYS.toggleExerciseFavorite === 'function') {
              HEYS.toggleExerciseFavorite(item.name);
              setFavTick(function (t) {
                return t + 1;
              });
            }
            if (typeof haptic === 'function') haptic('light');
          }
        }, isFav ? '★' : '☆');
        const labelEl = React.createElement('span', {
          className: 'ct-wb-ex-name-suggest-label',
          onMouseDown: function (e) {
            e.preventDefault();
            commitPick(item.name);
          }
        }, item.name);
        return React.createElement('li', {
          key: (item.name || '') + '_' + idx,
          role: 'option',
          className: 'ct-wb-ex-name-suggest-item' + (idx === activeIdx ? ' is-active' : ''),
          'aria-selected': idx === activeIdx,
          onMouseEnter: function () {
            setActiveIdx(idx);
          }
        }, labelEl, starEl);
      }))
    );
  }

  /** Понедельник ISO-недели, содержащей dateKey — тот же расчёт, что в heys_planning_store_v1.js/heys_day_tab_impl_v1.js. */
  function mondayOfWeek(dateKey) {
    const parts = String(dateKey).split('-').map(Number);
    const date = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    const dow = date.getDay();
    date.setDate(date.getDate() + (dow === 0 ? -6 : 1 - dow));
    return dayKeyFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function addDaysToKey(dateKey, delta) {
    const parts = String(dateKey).split('-').map(Number);
    const date = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    date.setDate(date.getDate() + delta);
    return dayKeyFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  /** «в четверг» — так, как это скажет человек, а не «14.08». */
  const WEEKDAY_IN = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];

  function whenPhrase(dateKey, today) {
    if (dateKey === today) return 'сегодня';
    if (dateKey === addDaysToKey(today, 1)) return 'завтра';
    const parts = String(dateKey).split('-').map(Number);
    const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    const within = dateKey <= addDaysToKey(today, 6);
    const label = WEEKDAY_IN[d.getDay()] || '';
    if (within && label) return label;
    return label ? (label + ', ' + parts[2] + '.' + String(parts[1]).padStart(2, '0')) : dateKey;
  }

  /**
   * Обзор программы куратора. Дизайн-ревью 2026-08-10 (экраны 16c/16d) снял
   * прежнюю карточку-календарь: она занимала место каждый день, а менялась раз
   * в неделю, ничего не предлагала сделать сегодня и — хуже всего — исчезала,
   * когда цикл выполнен, то есть пропадала ровно в лучший его момент.
   *
   * Осталась строка и только в день, когда тренировки нет: карточку занимает
   * то, что делают сегодня. В день с планом строки нет вовсе — карточка плана
   * уже говорит всё нужное, из обзора туда ушло лишь место в неделе.
   *
   * heys_training_program — снимок на момент назначения, не источник правды:
   * живой статус каждого дня лежит в самой записи тренировки (plan.status), и
   * читается он отдельным батчем по датам программы.
   */
  function useProgramState(clientId) {
    const [state, setState] = React.useState({ loading: true, program: null, days: null });

    React.useEffect(() => {
      let cancelled = false;
      if (!clientId || !HEYS.YandexAPI || typeof HEYS.YandexAPI.getKV !== 'function') {
        setState({ loading: false, program: null, days: null });
        return undefined;
      }
      (async () => {
        try {
          const res = await HEYS.YandexAPI.getKV(clientId, 'heys_training_program');
          const program = res && res.data && typeof res.data === 'object' ? res.data : null;
          const raw = Array.isArray(program && program.days) ? program.days : [];
          if (!program || (program.status !== 'active' && program.status !== 'partial') || !raw.length) {
            if (!cancelled) setState({ loading: false, program: null, days: null });
            return;
          }
          const sorted = raw.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
          // Статусы всех дней, а не только будущих: «сделано 5 из 12» — про
          // весь путь, и прошедшие дни в нём такая же часть, как впереди.
          const batch = typeof HEYS.YandexAPI.getKVBatch === 'function'
            ? await HEYS.YandexAPI.getKVBatch(clientId, sorted.map((d) => 'heys_dayv2_' + d.date))
            : { data: [] };
          const byKey = new Map();
          (Array.isArray(batch && batch.data) ? batch.data : []).forEach((row) => {
            if (row && row.k) byKey.set(row.k, row.v);
          });
          const days = sorted.map((d) => {
            const blob = byKey.get('heys_dayv2_' + d.date);
            const list = Array.isArray(blob && blob.trainings) ? blob.trainings : [];
            const training = list.find((t) => t && t.id === d.trainingId);
            return {
              date: d.date,
              dayLabel: d.dayLabel || null,
              weekIndex: d.weekIndex || null,
              status: (training && training.plan && training.plan.status) || null
            };
          });
          if (!cancelled) setState({ loading: false, program, days });
        } catch (_) {
          if (!cancelled) setState({ loading: false, program: null, days: null });
        }
      })();
      return () => { cancelled = true; };
    }, [clientId]);

    return state;
  }

  /** Место дня в своей неделе: «вторая из трёх на неделе». */
  const ORDINAL_F = ['', 'первая', 'вторая', 'третья', 'четвёртая', 'пятая', 'шестая', 'седьмая'];
  const COUNT_F = ['', 'одной', 'двух', 'трёх', 'четырёх', 'пяти', 'шести', 'семи'];

  function placeInWeek(days, dateKey) {
    const start = mondayOfWeek(dateKey);
    const end = addDaysToKey(start, 6);
    const week = (days || []).filter((d) => d.date >= start && d.date <= end);
    if (week.length < 2) return '';
    const idx = week.findIndex((d) => d.date === dateKey);
    if (idx < 0) return '';
    const nth = ORDINAL_F[idx + 1];
    const total = COUNT_F[week.length];
    return nth && total ? nth + ' из ' + total + ' на неделе' : '';
  }

  const PROGRAM_DONE_STATES = { done: 1, started: 1 };

  /** Второй слой (16d): путь, а не таблица статусов — сколько прошёл и сколько осталось. */
  function ProgramPathScreen({ program, days, onClose }) {
    const today = todayDateKeyForPlan();
    const doneCount = days.filter((d) => PROGRAM_DONE_STATES[d.status]).length;
    const skipped = days.filter((d) => d.status === 'skipped').length;
    const ahead = days.length - doneCount - skipped;
    const next = days.find((d) => d.date >= today && d.status !== 'done' && d.status !== 'skipped');
    const weeks = {};
    days.forEach((d) => {
      const w = d.weekIndex || 0;
      (weeks[w] = weeks[w] || []).push(d);
    });
    const weekKeys = Object.keys(weeks).sort((a, b) => Number(a) - Number(b));
    const currentWeek = next && next.weekIndex ? next.weekIndex : null;

    return React.createElement('div', { className: 'sb-root program-path' },
      React.createElement('div', { className: 'sb-head' },
        React.createElement('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onClose, 'aria-label': 'Назад'
        }, '‹'),
        React.createElement('div', { className: 'sb-head-title' },
          React.createElement('b', null, program.title || 'Программа'),
          React.createElement('div', { className: 'sb-head-sub' },
            (program.weeks ? program.weeks + ' нед.' : 'Программа')
            + (currentWeek ? ' · идёт ' + (ORDINAL_F[currentWeek] || currentWeek) : ''))
        )
      ),
      React.createElement('div', { className: 'sb-list' },
        React.createElement('div', { className: 'program-path-count' },
          React.createElement('b', null, 'Сделано ' + doneCount + ' из ' + days.length),
          ahead > 0 && React.createElement('span', null, 'осталось ' + ahead)
        ),
        React.createElement('div', { className: 'program-path-weeks' },
          weekKeys.map((w) => React.createElement('div', { key: w, className: 'program-path-week' },
            React.createElement('span', { className: 'program-path-week-label' },
              w === '0' ? 'Дни' : 'Неделя ' + w),
            React.createElement('div', { className: 'program-path-dots' },
              weeks[w].map((d) => {
                const kind = PROGRAM_DONE_STATES[d.status] ? 'done'
                  : d.status === 'skipped' ? 'skipped' : 'ahead';
                return React.createElement('span', {
                  key: d.date,
                  className: 'program-path-dot is-' + kind,
                  title: (d.dayLabel || '') + ' · ' + d.date
                });
              })
            )
          ))
        ),
        React.createElement('div', { className: 'program-path-legend' },
          React.createElement('span', null, React.createElement('i', { className: 'program-path-dot is-done' }), 'сделано'),
          skipped > 0 && React.createElement('span', null, React.createElement('i', { className: 'program-path-dot is-skipped' }), 'пропущено'),
          React.createElement('span', null, React.createElement('i', { className: 'program-path-dot is-ahead' }), 'впереди')
        ),
        next && React.createElement('div', { className: 'program-path-next' },
          React.createElement('div', { className: 'program-path-next-label' }, 'Ближайшая'),
          React.createElement('b', null,
            whenPhrase(next.date, today).replace(/^в[оо]? /, (m) => m.toUpperCase().slice(0, 1) + m.slice(1))
            + (next.dayLabel ? ' · ' + next.dayLabel : '')),
          React.createElement('span', { className: 'program-path-next-meta' },
            placeInWeek(days, next.date) || (program.title || ''))
        )
      )
    );
  }

  /**
   * Место дня в своей неделе по дням из хранилища, а не по индексу программы:
   * карточка плана рендерится синхронно, а индекс читается из сети. Считаем по
   * тому же, что и показываем, — по назначенным планам недели.
   */
  function weekPlaceFromStore(dateKey) {
    const start = mondayOfWeek(dateKey);
    const dates = [];
    for (let i = 0; i < 7; i++) dates.push(addDaysToKey(start, i));
    const planned = [];
    dates.forEach(function (d) {
      let day = null;
      try { day = readDayFromStore(d); } catch (_) { day = null; }
      const list = day && Array.isArray(day.trainings) ? day.trainings : [];
      if (list.some(function (t) { return t && t.plan; })) planned.push(d);
    });
    return placeInWeek(planned.map(function (d) { return { date: d }; }), dateKey);
  }

  const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  /**
   * Ближайшие дни для переноса (16a). Занятый день не предлагается — с
   * пометкой «занят», без диалога «что убрать»: лимит трёх тренировок решается
   * выбором, а не разговором посреди переноса.
   */
  function moveOptionsFor(dateKey) {
    const out = [];
    for (let i = 1; i <= 7 && out.length < 5; i++) {
      const d = addDaysToKey(dateKey, i);
      let day = null;
      try { day = readDayFromStore(d); } catch (_) { day = null; }
      const list = day && Array.isArray(day.trainings) ? day.trainings : [];
      const real = list.filter(function (t) {
        return t && (t.time || (Array.isArray(t.z) && t.z.some(function (m) { return +m > 0; })) || t.workoutLog);
      });
      const parts = d.split('-').map(Number);
      const dt = new Date(parts[0], parts[1] - 1, parts[2]);
      out.push({
        date: d,
        weekday: WEEKDAY_SHORT[dt.getDay()],
        human: parts[2] + '.' + String(parts[1]).padStart(2, '0'),
        busy: real.length >= 3
      });
    }
    return out;
  }

  const PROGRAM_PATH_ID = 'program-path';

  const PROGRAM_DONE_ID = 'program-done';

  /**
   * Цикл пройден (16e). Строка вместо исчезновения: месяц работы обязан
   * чем-то закончиться, иначе программа просто перестаёт существовать.
   */
  function ProgramDoneLine({ program, days, clientId }) {
    const [dismissed, setDismissed] = React.useState(false);
    if (dismissed) return null;
    const Parts = HEYS.StrengthBuilderParts || {};
    if (!Parts.ProgramDoneScreen) return null;

    const doneCount = days.filter((d) => PROGRAM_DONE_STATES[d.status]).length;
    const skippedCount = days.filter((d) => d.status === 'skipped').length;

    function openDone() {
      const fs = HEYS.TrainingKernel && HEYS.TrainingKernel.fullscreen;
      if (!fs) return;
      // Сессии цикла читаются из хранилища: рост считается по рабочим весам, а
      // они лежат в самих тренировках, не в индексе программы.
      const sessions = days.map(function (d) {
        let blob = null;
        try { blob = readDayFromStore(d.date); } catch (_) { blob = null; }
        const list = blob && Array.isArray(blob.trainings) ? blob.trainings : [];
        const t = list.find(function (x) { return x && x.plan && x.workoutLog; });
        return { date: d.date, exercises: t && t.workoutLog ? (t.workoutLog.exercises || []) : [] };
      }).filter(function (s) { return s.exercises.length; });

      fs.mount({
        id: PROGRAM_DONE_ID,
        ariaLabel: 'Программа пройдена',
        render: (api) => React.createElement(Parts.ProgramDoneScreen, {
          program, sessions, doneCount, totalCount: days.length, skippedCount,
          onClose: () => { api.close(); setDismissed(true); },
          onWriteCurator: () => {
            api.close();
            setDismissed(true);
            try { window.dispatchEvent(new CustomEvent('heys:open-messages')); } catch (_) { /* noop */ }
          }
        })
      });
    }

    return React.createElement('button', {
      type: 'button', className: 'program-next-line is-done', onClick: openDone
    },
      React.createElement('span', { className: 'program-next-text' },
        React.createElement('b', null, 'Программа пройдена'),
        ' · ', doneCount, ' из ', days.length),
      React.createElement('span', { className: 'program-next-link' }, 'Итоги ›')
    );
  }

  /**
   * Первый слой (16c): одна строка и только в день без тренировки. В день с
   * планом карточка плана говорит всё сама — строка там была бы вторым
   * сообщением об одном и том же.
   */
  function ProgramNextLine({ clientId, hasPlanToday }) {
    const state = useProgramState(clientId);
    if (state.loading || !state.program || !Array.isArray(state.days)) return null;
    if (hasPlanToday) return null;

    const today = todayDateKeyForPlan();
    const next = state.days.find((d) => d.date >= today && d.status !== 'done' && d.status !== 'skipped');
    // Цикл пройден. Прежний виджет здесь просто исчезал — то есть пропадал
    // ровно в лучший момент программы (дизайн-ревью 2026-08-10, 16c/16e).
    if (!next) {
      return React.createElement(ProgramDoneLine, { program: state.program, days: state.days, clientId });
    }

    function openPath() {
      const fs = HEYS.TrainingKernel && HEYS.TrainingKernel.fullscreen;
      if (!fs) return;
      fs.mount({
        id: PROGRAM_PATH_ID,
        ariaLabel: 'Программа',
        render: (api) => React.createElement(ProgramPathScreen, {
          program: state.program, days: state.days, onClose: api.close
        })
      });
    }

    return React.createElement('button', {
      type: 'button', className: 'program-next-line', onClick: openPath
    },
      React.createElement('span', { className: 'program-next-text' },
        'Следующая тренировка — ',
        React.createElement('b', null, whenPhrase(next.date, today))),
      React.createElement('span', { className: 'program-next-link' }, 'Программа ›')
    );
  }

  function renderTrainingsBlock(params) {
    if (!React) return null;

    const {
      haptic,
      setDay,
      setVisibleTrainings,
      visibleTrainings,
      householdActivities,
      openTrainingPicker,
      showZoneFormula,
      openHouseholdPicker,
      showHouseholdFormula,
      trainingTypes,
      TR,
      kcalMin,
      kcalPerMin,
      weight,
      r0,
      dateKey,
      trainingFilterMode,
      includeHouseholdEntries
    } = params || {};

    const safeR0 = typeof r0 === 'function' ? r0 : (v) => Math.round(v || 0);
    const safeVisibleTrainings = Math.max(0, visibleTrainings || 0);
    const safeHouseholdActivities = Array.isArray(householdActivities) ? householdActivities : [];
    const safeTrainingTypes = Array.isArray(trainingTypes) ? trainingTypes : [];
    const safeTrainings = Array.isArray(TR) ? TR : [];
    const safeTrainingFilterMode = ['regular', 'morning_activation', 'program'].includes(trainingFilterMode)
      ? trainingFilterMode
      : 'all';

    const MA_ZONE_SIGS = new Set(['8,0,0,0', '8,6,0,0', '4,8,8,2']);
    function trainingZoneSig(training) {
      const z = Array.isArray(training?.z) ? training.z : [];
      return [0, 1, 2, 3].map((i) => Number(z[i]) || 0).join(',');
    }

    function isMorningActivationTraining(training) {
      if (!training || typeof training !== 'object') return false;
      if (training.source === 'morning_activation') return true;
      const label = typeof training.activityLabel === 'string' ? training.activityLabel.trim().toLowerCase() : '';
      if (label === 'зарядка') return true;
      if (String(training.type) === 'strength' && MA_ZONE_SIGS.has(trainingZoneSig(training))) {
        const raw = typeof training.activityLabel === 'string' ? training.activityLabel.trim() : '';
        if (!raw) return true;
      }
      return false;
    }

    function isMorningActivationReplacementTraining(training) {
      return !!(training && typeof training === 'object' && training.source === 'morning_activation_replacement');
    }

    function getTrainingDisplayLabel(training, trainingType, index) {
      if (isMorningActivationTraining(training)) return 'Зарядка';
      const customLabel = typeof training?.activityLabel === 'string'
        ? training.activityLabel.trim()
        : '';
      return customLabel || trainingType?.label || ('Тренировка ' + (index + 1));
    }

    /**
     * Программа куратора живёт выше яруса «Сегодня» и собирается своим
     * проходом (контракт «три элемента программы», строка 7). Поэтому
     * назначенное и то, на что клиент ещё не ответил, показывает режим
     * program, а режим regular их не берёт: иначе одна и та же карточка
     * встала бы дважды — над ярусом и внутри него.
     */
    function isProgramEntry(training) {
      if (!training || typeof training !== 'object') return false;
      const TKs = (HEYS.TrainingKernel && HEYS.TrainingKernel.strength) || null;
      if (TKs && TKs.pendingPlanProposal && TKs.pendingPlanProposal(training)) return true;
      const status = training.plan && training.plan.status;
      return status === 'assigned' || status === 'skipped';
    }

    function shouldRenderTraining(training) {
      if (safeTrainingFilterMode === 'all') return true;
      const isMorningActivation = isMorningActivationTraining(training);
      if (safeTrainingFilterMode === 'morning_activation') return isMorningActivation;
      if (isMorningActivation) return false;
      if (safeTrainingFilterMode === 'program') return isProgramEntry(training);
      return !isProgramEntry(training);
    }

    function getTrainingDisplayMeta(displayLabel, trainingType, training) {
      if (isMorningActivationTraining(training)) return '';
      const wl = training?.workoutLog;
      if (
        training?.strengthEntryMode === 'workout_builder' &&
        wl &&
        Array.isArray(wl.exercises) &&
        wl.exercises.length
      ) {
        const vol = calcWorkoutBuilderVolumeKg(wl, weight);
        let volBit = '';
        if (vol > 0) {
          volBit =
            vol >= 1000
              ? ' · ~' + (vol / 1000).toFixed(1).replace(/\.0$/, '') + ' т объёма'
              : ' · ~' + Math.round(vol) + ' кг объёма';
        }
        return 'Конструктор · ' + wl.exercises.length + ' упр.' + volBit;
      }
      const baseLabel = trainingType?.label || '';
      if (!displayLabel || !baseLabel) return '';
      return displayLabel.toLowerCase() === baseLabel.toLowerCase() ? '' : baseLabel;
    }

    const trainIcons = ['🏃', '🚴', '🏊'];

    function cloneTraining(training) {
      const source = training || {};
      return {
        ...source,
        z: Array.isArray(source.z) ? source.z.slice() : [0, 0, 0, 0]
      };
    }

    function getTrainingDeletionSignature(training) {
      try {
        const shared = HEYS.sync?.trainingDeletionSignature;
        if (typeof shared === 'function') return shared(training);
      } catch (_) { /* noop */ }
      if (!training || typeof training !== 'object') return '';
      const id = training.id == null ? '' : String(training.id).trim();
      if (id) return 'id:' + id;
      const identity = [training.type, training.activityLabel, training.source, training.time, training.hobbySubtype]
        .map((value) => String(value == null ? '' : value).trim().toLowerCase());
      if (identity.some(Boolean)) return 'fields:' + identity.join('|');
      const zones = Array.isArray(training.z) ? training.z.map((value) => Number(value) || 0) : [];
      return zones.some((value) => value > 0) ? 'zones:' + zones.join('|') : '';
    }

    function cloneHouseholdActivity(activity) {
      return activity ? { ...activity } : activity;
    }

    function getHouseholdDisplayTitle(activity) {
      const rawLabel = typeof activity?.label === 'string' ? activity.label.trim() : '';
      if (rawLabel) return rawLabel;
      if (activity?.source === 'morning_activation') return 'Зарядка';
      return 'Бытовая активность';
    }

    function getHouseholdDisplayIcon(activity) {
      if (activity?.source === 'morning_activation') return '🧘';
      return '🏠';
    }

    function runUndoableAction(options) {
      if (!options || typeof options.apply !== 'function') return false;

      if (HEYS.Undo?.runAction && typeof options.undo === 'function') {
        return HEYS.Undo.runAction({
          label: options.label,
          batch: options.batch,
          errorMessage: options.errorMessage,
          apply: options.apply,
          undo: options.undo,
          onExpire: options.onExpire,
          onApplyError: options.onApplyError,
        });
      }

      try {
        return options.apply();
      } catch (error) {
        console.error('[HEYS.dayTrainings] undoable apply error:', error);
        options.onApplyError?.(error);
        if (options.errorMessage) {
          HEYS.Toast?.error(options.errorMessage);
        }
        return false;
      }
    }

    function prepareTrainingMutation(updatedAt) {
      try {
        const mutationDate = dateKey || HEYS.Day?.getDay?.()?.date;
        HEYS.Day?.setLastLoadedUpdatedAt?.(updatedAt);
        HEYS.Day?.setBlockCloudUpdates?.(updatedAt + 15000);
        if (mutationDate) HEYS.Day?.markPendingMutation?.(mutationDate);
      } catch (_) { /* noop */ }
    }

    function flushTrainingMutationAfterCommit() {
      const requestFlush = function () {
        global.setTimeout(function () {
          HEYS.Day?.requestFlush?.({ force: true });
        }, 50);
      };
      if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(requestFlush);
      } else {
        requestFlush();
      }
    }

    const removeTraining = async (ti) => {
      const confirmed = await HEYS.ConfirmModal?.confirmDelete({
        icon: '🏋️',
        title: 'Удалить тренировку?',
        text: 'Тренировка исчезнет сразу, но её можно будет быстро вернуть через кнопку «Отменить».'
      });

      if (!confirmed) return;

      if (typeof haptic === 'function') haptic('medium');
      const emptyTraining = { z: [0, 0, 0, 0], time: '', type: '' };
      const previousTrainings = safeTrainings.map(cloneTraining);
      const previousVisibleTrainings = safeVisibleTrainings;
      const removedTraining = previousTrainings[ti] || emptyTraining;
      const removedMorningActivation = isMorningActivationTraining(removedTraining) || isMorningActivationReplacementTraining(removedTraining);
      const previousMorningActivation = removedMorningActivation
        ? { ...(HEYS.Day?.getDay?.()?.morningActivation || {}) }
        : null;
      const trainingType = safeTrainingTypes.find((item) => item.id === removedTraining.type);
      const label = getTrainingDisplayLabel(removedTraining, trainingType, ti) + ' удалена';

      runUndoableAction({
        label,
        errorMessage: 'Не удалось удалить тренировку',
        apply: () => {
          const mutationTs = Date.now();
          const deletionSignature = getTrainingDeletionSignature(removedTraining);
          const tombstoneId = mutationTs + ':' + ti + ':' + deletionSignature;
          prepareTrainingMutation(mutationTs);
          if (typeof setDay === 'function') {
            setDay((prevDay) => {
              const oldTrainings = prevDay.trainings || [emptyTraining, emptyTraining, emptyTraining];
              const newTrainings = [
                ...oldTrainings.slice(0, ti),
                ...oldTrainings.slice(ti + 1),
                emptyTraining
              ].slice(0, 3);
              const previousTombstones = Array.isArray(prevDay.deletedTrainings) ? prevDay.deletedTrainings : [];
              const deletedTrainings = deletionSignature
                ? [{ tombstoneId, signature: deletionSignature, deletedAt: mutationTs, index: ti }, ...previousTombstones]
                    .slice(0, 50)
                : previousTombstones;
              const nextDay = { ...prevDay, trainings: newTrainings, deletedTrainings, updatedAt: mutationTs };
              if (removedMorningActivation) {
                nextDay.morningActivation = {
                  ...(prevDay.morningActivation || {}),
                  status: 'pending',
                  replacement: null,
                  clearedByUser: true,
                  clearedAt: nextDay.updatedAt,
                  followupSnoozeUntilMealCount: null
                };
              }
              return nextDay;
            });
          }
          if (typeof setVisibleTrainings === 'function') {
            setVisibleTrainings((prev) => Math.max(0, prev - 1));
          }
          if (removedTraining && (String(removedTraining.type) === 'fingers' || removedTraining.fingersLog)) {
            try {
              HEYS.Fingers?.persistence?.clearForTraining?.({
                dateKey: day && day.date,
                trainingIndex: ti
              });
            } catch (_) { /* noop */ }
          }
          // Ждём commit React: иначе flush может прочитать старый dayRef и вернуть удалённую тренировку из облака.
          flushTrainingMutationAfterCommit();
          return {
            trainings: previousTrainings,
            visibleTrainings: previousVisibleTrainings,
            morningActivation: previousMorningActivation,
          };
        },
        undo: (context) => {
          const mutationTs = Date.now();
          prepareTrainingMutation(mutationTs);
          if (typeof setDay === 'function') {
            setDay((prevDay) => {
              const nextDay = {
                ...prevDay,
                trainings: (context?.trainings || []).map(cloneTraining),
                updatedAt: mutationTs,
              };
              if (context?.morningActivation) {
                nextDay.morningActivation = context.morningActivation;
              }
              return nextDay;
            });
          }
          if (typeof setVisibleTrainings === 'function' && context) {
            setVisibleTrainings(context.visibleTrainings);
          }
          flushTrainingMutationAfterCommit();
        },
      });
    };

    function isStrengthWorkoutBuilder(t) {
      if (String(t.type) !== 'strength') return false;
      if (t.strengthEntryMode === 'workout_builder') return true;
      // Явный выбор «пульсовые зоны» сильнее наследия: мастер теперь хранит
      // журнал упражнений и в этом режиме, но показывать его не должен.
      if (t.strengthEntryMode === 'hr_zones') return false;
      const wl = t.workoutLog;
      return !!(wl && typeof wl === 'object' && Array.isArray(wl.exercises) && wl.exercises.length > 0);
    }

    /** Силовая по зонам без дневника — можно включить конструктор без пересоздания тренировки */
    function canOfferWorkoutBuilderOnCard(t) {
      if (!t || String(t.type) !== 'strength') return false;
      if (isMorningActivationTraining(t)) return false;
      if (t.strengthEntryMode === 'workout_builder') return false;
      // Режим «пульсовые зоны» выбран явно — это и есть путь назад к журналу,
      // сохранённый workoutLog при этом оживает, а не пересоздаётся пустым.
      if (t.strengthEntryMode === 'hr_zones') return true;
      const wl = t.workoutLog;
      if (wl && Array.isArray(wl.exercises) && wl.exercises.length > 0) return false;
      return true;
    }

    function clampWbZoneMin(n) {
      return Math.max(0, Math.min(180, Math.round(Number(n) || 0)));
    }

    /** Минуты по зонам пульса для MET/ккал (heys_iw_utils.calculateTrainingKcal). */
    function normalizeWorkoutLogZoneMinutes(raw, training) {
      const rawZm = raw && Array.isArray(raw.zoneMinutes) ? raw.zoneMinutes : null;
      if (rawZm && rawZm.length >= 4) {
        return [0, 1, 2, 3].map((i) => clampWbZoneMin(rawZm[i]));
      }
      const tz = Array.isArray(training?.z) ? training.z : [];
      if (tz.length >= 4 && [0, 1, 2, 3].some((i) => +tz[i] > 0)) {
        return [0, 1, 2, 3].map((i) => clampWbZoneMin(tz[i]));
      }
      const dur = Math.round(Number(raw && raw.totalDurationMinutes));
      if (Number.isFinite(dur) && dur > 0) {
        const m = Math.max(1, Math.min(180, dur));
        return [0, m, 0, 0];
      }
      return [0, 1, 0, 0];
    }

    function enableStrengthWorkoutBuilderOnCard(ti) {
      if (typeof haptic === 'function') haptic('light');
      patchTraining(ti, (t0) => {
        const z0 = Array.isArray(t0.z) ? t0.z : [0, 0, 0, 0];
        const sumMin = z0.reduce((s, m) => s + (+m || 0), 0);
        const zoneMinutes = sumMin > 0
          ? [0, 1, 2, 3].map((i) => clampWbZoneMin(z0[i]))
          : [0, Math.max(1, Math.min(180, 45)), 0, 0];
        // Если журнал уже есть (например, тренировку переключали в «пульсовые
        // зоны»), возвращаем его, а не затираем пустой заготовкой.
        const prevWl = t0.workoutLog;
        const hasPrevWl = !!(prevWl && typeof prevWl === 'object'
          && Array.isArray(prevWl.exercises) && prevWl.exercises.length > 0);
        const wl = hasPrevWl ? {
          ...prevWl,
          version: 1,
          zoneMinutes: zoneMinutes.slice(),
          totalDurationMinutes: zoneMinutes.reduce((s, v) => s + (+v || 0), 0)
        } : {
          version: 1,
          zoneMinutes: zoneMinutes.slice(),
          totalDurationMinutes: zoneMinutes.reduce((s, v) => s + (+v || 0), 0),
          exercises: [{
            id: createExerciseId(0),
            name: '',
            approaches: [{ id: createApproachId(0, 0), weightKg: '', reps: 10 }],
            note: '',
            ssGroup: 0,
            rpe: 0
          }]
        };
        return {
          ...t0,
          type: 'strength',
          strengthEntryMode: 'workout_builder',
          workoutLog: wl,
          z: zoneMinutes.slice()
        };
      });
    }

    function ensureWorkoutLogShape(t) {
      const raw = t.workoutLog || {};
      const zoneMinutes = normalizeWorkoutLogZoneMinutes(raw, t);
      let exercises = Array.isArray(raw.exercises) ? raw.exercises.slice() : [];
      if (exercises.length === 0) {
        exercises = [{
          id: 'ex_0',
          name: '',
          approaches: [{ id: 'ap_0_0', weightKg: '', reps: 10 }],
          note: '',
          ssGroup: 0,
          rpe: 0
        }];
      }
      exercises = exercises.map((e, i) => {
        const base = {
          id: e.id || 'ex_' + i,
          name: String(e.name || ''),
          note: typeof e.note === 'string' ? e.note : '',
          ssGroup: e.ssGroup != null ? Math.max(0, parseInt(e.ssGroup, 10) || 0) : 0,
          rpe: e.rpe != null ? Math.max(0, Math.min(10, parseInt(e.rpe, 10) || 0)) : 0,
          collapsed: !!e.collapsed,
          restSec: e.restSec != null && REST_PRESETS.indexOf(+e.restSec) >= 0 ? +e.restSec : 90,
          restManual: !!e.restManual
        };
        // Единица, коэффициент своего веса и id справочника — снимок, снятый при
        // добавлении упражнения: от них зависит тоннаж. Пересборка их не знала,
        // и любая правка через эту функцию превращала упражнение на своём весе
        // в обычное (разбор «Актив» 2026-08-30, дефект T).
        carryExerciseSnapshotFields(base, e);
        let approaches = Array.isArray(e.approaches) && e.approaches.length > 0
          ? e.approaches.map((a, ai) => carryApproachSnapshotFields({
            id: a.id || 'ap_' + i + '_' + ai,
            weightKg: a.weightKg != null ? String(a.weightKg) : '',
            reps: a.reps != null ? Math.max(1, Math.min(200, parseInt(a.reps, 10) || 1)) : 10,
            done: !!a.done
          }, a, true))
          : null;
        if (!approaches || approaches.length === 0) {
          const legacySets = e.sets != null ? Math.max(1, parseInt(e.sets, 10) || 1) : 1;
          const legacyReps = e.reps != null ? Math.max(1, parseInt(e.reps, 10) || 1) : 10;
          const legacyW = e.weightKg != null ? String(e.weightKg) : '';
          approaches = [];
          for (let s = 0; s < legacySets; s++) {
            approaches.push({
              id: 'ap_' + i + '_' + s,
              weightKg: legacyW,
              reps: legacyReps
            });
          }
        }
        const leg = syncLegacyFieldsFromApproaches({ approaches });
        return {
          ...base,
          approaches,
          sets: leg.sets,
          reps: leg.reps,
          weightKg: leg.weightKg
        };
      });
      exercises = cleanupSsGroups(exercises);
      const totalDurationMinutes = zoneMinutes.reduce((s, v) => s + (+v || 0), 0);
      const out = {
        version: 1,
        zoneMinutes: zoneMinutes.slice(),
        totalDurationMinutes,
        exercises
      };
      const startedAtNum = Number.isFinite(+raw.startedAt) ? +raw.startedAt : 0;
      if (startedAtNum > 0) out.startedAt = startedAtNum;
      const completedAtNum = Number.isFinite(+raw.completedAt) ? +raw.completedAt : 0;
      if (completedAtNum > 0) out.completedAt = completedAtNum;
      return out;
    }

    function patchTraining(ti, mutator) {
      if (typeof setDay !== 'function') return;
      const ts = Date.now();
      // Синхронно поднимаем ref до setDay: иначе heys:day-updated в том же тике видит старый LS и
      // stale-guard (storageUpdatedAt < lastLoadedUpdatedAtRef) не срабатывает до коммита React —
      // overlay из LS откатывает только что открытый дневник.
      try {
        if (HEYS.Day && typeof HEYS.Day.setLastLoadedUpdatedAt === 'function') {
          HEYS.Day.setLastLoadedUpdatedAt(ts);
        }
        if (HEYS.Day && typeof HEYS.Day.setBlockCloudUpdates === 'function') {
          HEYS.Day.setBlockCloudUpdates(ts + 3000);
        }
      } catch (_) { /* noop */ }
      setDay((prevDay) => {
        const list = [...(prevDay.trainings || [])];
        const cur = { ...(list[ti] || {}) };
        // Метка на самой строке, а не только на дне: merge сравнивает
        // тренировки по training.updatedAt, а day.updatedAt двигают фоновые
        // reconcile/autosave. Без неё правка конструктора опиралась на
        // авто-штамп stamper'а — тот же путь, которым stale-снимок
        // откатывал кураторские зоны (heys/9cb568).
        list[ti] = { ...mutator(cur), updatedAt: ts };
        var nextDay = { ...prevDay, trainings: list, updatedAt: ts };
        try {
          HEYS.Day = HEYS.Day || {};
          HEYS.Day._lastWbRowsByDate = HEYS.Day._lastWbRowsByDate || {};
          var dkPatch = nextDay.date;
          var sumWb = 0;
          for (var pxi = 0; pxi < list.length; pxi++) {
            var ptx = list[pxi];
            if (!ptx || String(ptx.type) !== 'strength' || ptx.strengthEntryMode !== 'workout_builder') continue;
            var wlx = ptx.workoutLog;
            if (wlx && Array.isArray(wlx.exercises)) sumWb += wlx.exercises.length;
          }
          if (dkPatch) HEYS.Day._lastWbRowsByDate[dkPatch] = sumWb;
          try {
            if (dkPatch && typeof global.sessionStorage !== 'undefined' && global.sessionStorage) {
              global.sessionStorage.setItem('heys_last_wbrows_' + dkPatch, String(sumWb));
            }
          } catch (_eSs) { /* noop */ }
        } catch (_eWb) { /* noop */ }
        return nextDay;
      });
      try {
        global.setTimeout(function () {
          if (HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
            HEYS.Day.requestFlush({ force: true });
          }
        }, 16);
      } catch (_) { /* noop */ }
      // Не шлём heys:day-updated сами: слушатель перечитывает LS до debounced autosave; requestFlush форсит запись в store/облако.
    }

    function applyWorkoutLogToTraining(t, wl) {
      const shaped = ensureWorkoutLogShape({ ...t, workoutLog: { ...wl } });
      return {
        ...t,
        strengthEntryMode: 'workout_builder',
        workoutLog: shaped,
        z: shaped.zoneMinutes.slice()
      };
    }

    /** Повторы в строке подхода (таблица): − число + */
    function wbApproachRepStepper(ti, exi, api, curVal, minV, maxV) {
      const clamp = function (n) {
        return Math.max(minV, Math.min(maxV, Math.round(Number(n)) || minV));
      };
      const commit = function (next) {
        const n = clamp(next);
        patchTraining(ti, function (t0) {
          const wl0 = ensureWorkoutLogShape(t0);
          wl0.exercises = wl0.exercises.map(function (row, j) {
            if (j !== exi) return row;
            const ap = (row.approaches || []).slice();
            if (!ap[api]) return row;
            ap[api] = { ...ap[api], reps: n };
            const merged = { ...row, approaches: ap };
            return { ...merged, ...syncLegacyFieldsFromApproaches(merged) };
          });
          return applyWorkoutLogToTraining(t0, wl0);
        });
        if (typeof haptic === 'function') haptic('light');
      };
      const labelA = 'Повторы, ' + approachOrdinalRu(api);
      return React.createElement('div', { className: 'ct-wb-mini ct-wb-stepper ct-wb-stepper--ap-reps' },
        React.createElement('div', { className: 'ct-wb-stepper-row' },
          React.createElement('button', {
            type: 'button',
            className: 'ct-wb-stepper-btn',
            disabled: curVal <= minV,
            'aria-label': labelA + ', уменьшить',
            onClick: function (e) {
              e.stopPropagation();
              commit(curVal - 1);
            }
          }, '\u2212'),
          React.createElement('input', {
            type: 'number',
            className: 'ct-wb-mini-inp ct-wb-stepper-inp',
            min: minV,
            max: maxV,
            value: curVal,
            inputMode: 'numeric',
            'aria-label': labelA,
            onClick: function (e) { e.stopPropagation(); },
            onChange: function (e) {
              const raw = parseInt(e.target.value, 10);
              commit(Number.isFinite(raw) ? raw : curVal);
            }
          }),
          React.createElement('button', {
            type: 'button',
            className: 'ct-wb-stepper-btn',
            disabled: curVal >= maxV,
            'aria-label': labelA + ', увеличить',
            onClick: function (e) {
              e.stopPropagation();
              commit(curVal + 1);
            }
          }, '+')
        )
      );
    }

    const removeHousehold = async (idx) => {
      const confirmed = await HEYS.ConfirmModal?.confirmDelete({
        icon: '🏠',
        title: 'Удалить активность?',
        text: 'Активность исчезнет сразу, но её можно будет быстро вернуть через кнопку «Отменить».'
      });

      if (!confirmed) return;

      if (typeof haptic === 'function') haptic('medium');
      const previousActivities = safeHouseholdActivities.map(cloneHouseholdActivity);
      const removedActivity = previousActivities[idx] || null;

      runUndoableAction({
        label: 'Бытовая активность удалена',
        errorMessage: 'Не удалось удалить активность',
        apply: () => {
          if (typeof setDay === 'function') {
            setDay((prevDay) => {
              const oldActivities = prevDay.householdActivities || [];
              const newActivities = oldActivities.filter((_, i) => i !== idx);
              const totalMin = newActivities.reduce((sum, h) => sum + (+h.minutes || 0), 0);
              const mutationAt = Math.max(Date.now(), (Number(prevDay.householdUpdatedAt) || 0) + 1);
              return {
                ...prevDay,
                householdActivities: newActivities,
                householdMin: totalMin,
                householdTime: newActivities[0]?.time || '',
                householdUpdatedAt: mutationAt,
                updatedAt: mutationAt
              };
            });
          }
          // Форсируем запись в store/облако — без этого sync не триггерится
          global.setTimeout(function () {
            if (HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
              HEYS.Day.requestFlush({ force: true });
            }
          }, 16);
          return {
            activities: previousActivities,
            removedActivity,
          };
        },
        undo: (context) => {
          if (!context || typeof setDay !== 'function') return;
          setDay((prevDay) => {
            const restoredActivities = (context.activities || []).map(cloneHouseholdActivity);
            const totalMin = restoredActivities.reduce((sum, activity) => sum + (+activity?.minutes || 0), 0);
            const mutationAt = Math.max(Date.now(), (Number(prevDay.householdUpdatedAt) || 0) + 1);
            return {
              ...prevDay,
              householdActivities: restoredActivities,
              householdMin: totalMin,
              householdTime: restoredActivities[0]?.time || '',
              householdUpdatedAt: mutationAt,
              updatedAt: mutationAt
            };
          });
        },
      });
    };

    const trainingEntries = Array.from({ length: safeVisibleTrainings }, (_, ti) => ({
      ti,
      rawT: safeTrainings[ti] || {}
    })).filter(({ rawT }) => shouldRenderTraining(rawT));
    const householdEntries = (safeTrainingFilterMode === 'all' || includeHouseholdEntries === true)
      ? safeHouseholdActivities
      : [];

    // Режим программы возвращает пустоту только когда программы нет вовсе:
    // строка «Следующая тренировка» — это и есть его содержимое в день без
    // назначенного. Прежде она жила внутри блока фактов и исчезала вместе с
    // ним в пустой день (контракт «ярус не исчезает пустым», строка 6).
    if (safeTrainingFilterMode === 'program') {
      if (!HEYS.currentClientId) return null;
    } else if (trainingEntries.length === 0 && householdEntries.length === 0
      && safeTrainingFilterMode !== 'all') {
      return null;
    }

    return React.createElement('div', { className: 'compact-trainings' },
      safeTrainingFilterMode === 'program' && HEYS.currentClientId && React.createElement(ProgramNextLine, {
        clientId: HEYS.currentClientId,
        // Строка и карточка взаимоисключающие: строка прячется, когда план
        // на сегодня есть — карточка уже сказала всё (контракт строка 7).
        hasPlanToday: trainingEntries.some(function (e) { return e.rawT && e.rawT.plan; })
      }),
      safeTrainingFilterMode === 'all' && safeVisibleTrainings === 0 && safeHouseholdActivities.length === 0 && React.createElement('div', {
        className: 'empty-trainings',
        title: 'Силовые и другие тренировки при дефиците помогают сохранять мышечную массу и силовые показатели; учёт в HEYS — в калориях и самочувствии. Питание остаётся главным рычагом энергетического баланса.'
      },
        React.createElement('span', { className: 'empty-trainings-icon' }, '🏃‍♂️'),
        React.createElement('span', { className: 'empty-trainings-text' }, 'Нет тренировок')
      ),
      trainingEntries.map(({ ti, rawT }) => {
        const T = {
          z: rawT.z || [0, 0, 0, 0],
          time: rawT.time || '',
          type: rawT.type || '',
          activityLabel: rawT.activityLabel || '',
          source: rawT.source || '',
          mood: rawT.mood ?? 0,
          wellbeing: rawT.wellbeing ?? 0,
          stress: rawT.stress ?? 0,
          comment: rawT.comment || '',
          strengthEntryMode: rawT.strengthEntryMode,
          workoutBuilderCollapsed: !!rawT.workoutBuilderCollapsed,
          workoutLog: rawT.workoutLog,
          fingersLog: rawT.fingersLog || null,
          mobilityLog: rawT.mobilityLog || null,
          hobbySubtype: rawT.hobbySubtype || '',
          hobbyLog: rawT.hobbyLog || null
        };

        // 🤚 Fingers branch — рендерим компактный pill вместо обычной карточки.
        // Click → открывает full-screen overlay через portal (heys_fingers_fullscreen_v1.js).
        if (String(T.type) === 'fingers' && HEYS.Fingers?.renderPreviewPill) {
          return React.createElement('div', {
            key: 'training-' + ti,
            className: 'compact-train-wrap',
            'data-curator-target': 'training',
            'data-training-index': String(ti)
          },
            HEYS.Fingers.renderPreviewPill({
              training: T,
              dateKey: dateKey,
              trainingIndex: ti
            })
          );
        }

        if (String(T.type) === 'mobility' && HEYS.Mobility?.renderPreviewPill) {
          return React.createElement('div', {
            key: 'training-' + ti,
            className: 'compact-train-wrap',
            'data-curator-target': 'training',
            'data-training-index': String(ti)
          },
            HEYS.Mobility.renderPreviewPill({
              training: T,
              dateKey: dateKey,
              trainingIndex: ti
            })
          );
        }

        if (HEYS.Hobby?.DrumsFingerControl?.isDrumsTraining?.(T) && HEYS.Hobby.DrumsFingerControl.renderPreviewPill) {
          return React.createElement('div', {
            key: 'training-' + ti,
            className: 'compact-train-wrap',
            'data-curator-target': 'training',
            'data-training-index': String(ti)
          },
            HEYS.Hobby.DrumsFingerControl.renderPreviewPill({
              training: T,
              dateKey: dateKey,
              trainingIndex: ti
            })
          );
        }

        const kcalZ = (i) => safeR0((+T.z[i] || 0) * (kcalMin?.[i] || 0));
        const total = safeR0(kcalZ(0) + kcalZ(1) + kcalZ(2) + kcalZ(3));
        const trainingType = safeTrainingTypes.find(t => t.id === T.type);
        const displayLabel = getTrainingDisplayLabel(T, trainingType, ti);
        const displayMeta = getTrainingDisplayMeta(displayLabel, trainingType, T);

        const getMoodEmoji = (v) =>
          v <= 0 ? null : v <= 2 ? '😢' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '😊' : '😄';
        const getWellbeingEmoji = (v) =>
          v <= 0 ? null : v <= 2 ? '🤒' : v <= 4 ? '😓' : v <= 6 ? '😐' : v <= 8 ? '💪' : '🏆';
        const getStressEmoji = (v) =>
          v <= 0 ? null : v <= 2 ? '😌' : v <= 4 ? '🙂' : v <= 6 ? '😐' : v <= 8 ? '😟' : '😰';

        const moodEmoji = getMoodEmoji(T.mood);
        const wellbeingEmoji = getWellbeingEmoji(T.wellbeing);
        const stressEmoji = getStressEmoji(T.stress);
        const hasRatings = T.mood > 0 || T.wellbeing > 0 || T.stress > 0;

        const totalMinutes = (T.z || []).reduce((sum, m) => sum + (+m || 0), 0);
        const hasDuration = totalMinutes > 0;
        const isMorningActivation = isMorningActivationTraining(T);

        const isBuilder = isStrengthWorkoutBuilder(T);
        const wlLive = isBuilder ? ensureWorkoutLogShape(T) : null;

        const zonesRow = !isBuilder && !isMorningActivation && React.createElement('div', { className: 'compact-train-zones-inline' },
          [0, 1, 2, 3].map((zi) => {
            const hasValue = +T.z[zi] > 0;
            return React.createElement('span', {
              key: 'z' + zi,
              className: 'compact-zone-inline' + (hasValue ? ' has-value' : ''),
              onClick: (e) => showZoneFormula && showZoneFormula(ti, zi, e)
            },
              React.createElement('span', { className: 'zone-label' }, 'Z' + (zi + 1)),
              React.createElement('span', { className: 'zone-value' }, hasValue ? T.z[zi] : '—'),
              hasValue && React.createElement('span', { className: 'zone-kcal' }, kcalZ(zi))
            );
          })
        );

        const showBuilderCta = !isBuilder && canOfferWorkoutBuilderOnCard(T);
        const strengthBuilderCtaRow = showBuilderCta && React.createElement('div', { className: 'ct-wb-enable-wrap' },
          React.createElement('button', {
            type: 'button',
            className: 'ct-wb-enable-btn',
            onClick: (e) => {
              e.stopPropagation();
              enableStrengthWorkoutBuilderOnCard(ti);
            }
          }, '📋 Дневник упражнений (подходы и повторы)')
        );

        const strengthSummaryRow = isBuilder && wlLive && (function () {
            const builder = HEYS.StrengthBuilder;
            if (!builder || !builder.open) return null;
            const Parts = HEYS.StrengthBuilderParts || {};
            const startedTime = (function () {
              try {
                const d = readDayFromStore(dateKey);
                const t = d && Array.isArray(d.trainings) ? d.trainings[ti] : null;
                return (t && t.time) || '';
              } catch (_e) { return ''; }
            })();
            const trainingForBuilder = {
              type: 'strength',
              strengthEntryMode: 'workout_builder',
              time: startedTime,
              workoutLog: wlLive,
              // plan нужен полоске правки (экран 14b) и итогу «легла не
              // полностью» (15b): без него конструктор не знает, что у этой
              // тренировки вообще есть неотвеченное предложение куратора.
              plan: rawT.plan,
              planSnapshot: rawT.planSnapshot
            };
            function openBuilder() {
              const U = HEYS.utils;
              builder.open({
                training: trainingForBuilder,
                dateKey: dateKey,
                profile: (U && U.lsGet) ? (U.lsGet('heys_profile', {}) || {}) : {},
                // Клиент закрыл тренировку, так и не ответив: предложение
                // гаснет само и остаётся строкой в истории дня.
                onFinishProposal: function () {
                  const TKs3 = (HEYS.TrainingKernel && HEYS.TrainingKernel.strength) || null;
                  if (!TKs3 || !TKs3.pendingPlanProposal) return;
                  patchTraining(ti, function (t0) {
                    return TKs3.pendingPlanProposal(t0) ? TKs3.expirePlanProposal(t0, Date.now()) : t0;
                  });
                },
                // Разбор правки открывается поверх конструктора тем же слоем,
                // что и с карточки дня: экран один, входов в него два.
                onReviewProposal: function () {
                  const TKs2 = (HEYS.TrainingKernel && HEYS.TrainingKernel.strength) || null;
                  if (!TKs2 || !Parts.openProposalReview) return;
                  Parts.openProposalReview({
                    training: trainingForBuilder,
                    onAccept: function () {
                      patchTraining(ti, function (t0) {
                        const r = TKs2.acceptPlanProposal(t0, Date.now());
                        return r.ok ? r.training : t0;
                      });
                    },
                    onDecline: function () {
                      patchTraining(ti, function (t0) {
                        const r = TKs2.declinePlanProposal(t0, Date.now());
                        return r.ok ? r.training : t0;
                      });
                    }
                  });
                },
                // История упражнения живёт здесь: сканы по дням делает
                // heys_day_trainings_v1.js, у конструктора своего доступа к
                // хранилищу дней нет и быть не должно.
                historyFor: function (name, exIdx) {
                  try {
                    const snap = findLastExerciseSnapshot(dateKey, name, ti, exIdx);
                    const rec = findExerciseHistoricalRecord(name, dateKey, ti, exIdx);
                    return { last: snap, record: rec };
                  } catch (_e) { return { last: null, record: null }; }
                },
                lastSessionFor: function () {
                  try {
                    const hit = findLastWorkoutBuilderExercises(dateKey, ti);
                    if (!hit || !hit.exercises || !hit.exercises.length) return null;
                    return { dateKey: hit.dateKey || dateKey, exercises: hit.exercises };
                  } catch (_e) { return null; }
                },
                onRepeatLast: function (srcExercises) {
                  patchTraining(ti, function (t0) {
                    const wl0 = ensureWorkoutLogShape(t0);
                    wl0.exercises = cloneExercisesForReplay(srcExercises);
                    return applyWorkoutLogToTraining(t0, wl0);
                  });
                },
                historyDetailFor: function (name, exIdx) {
                  try {
                    return {
                      usages: findRecentExerciseUsages(name, dateKey, ti, exIdx, 12),
                      record: findExerciseHistoricalRecord(name, dateKey, ti, exIdx)
                    };
                  } catch (_e) { return { usages: [], record: null }; }
                },
                onPatch: function (nextExercises) {
                  patchTraining(ti, function (t0) {
                    const wl0 = ensureWorkoutLogShape(t0);
                    wl0.exercises = nextExercises;
                    return applyWorkoutLogToTraining(t0, wl0);
                  });
                },
                syncStatusFor: function () {
                  try {
                    const cloud = HEYS.cloud;
                    if (!cloud || typeof cloud.getSyncStatus !== 'function') return null;
                    const cid = HEYS.currentClientId || '';
                    const key = cid ? ('heys_' + cid + '_dayv2_' + dateKey) : ('heys_dayv2_' + dateKey);
                    return cloud.getSyncStatus(key);
                  } catch (_e) { return null; }
                },
                onPatchNote: function (note) {
                  patchTraining(ti, function (t0) {
                    const wl0 = ensureWorkoutLogShape(t0);
                    wl0.note = String(note == null ? '' : note);
                    return applyWorkoutLogToTraining(t0, wl0);
                  });
                }
              });
              if (typeof haptic === 'function') haptic('light');
            }
            // Программа куратора, слой 3: назначенный, но не начатый план
            // получает свою карточку вместо обычной сводки — экран 02/09
            // макета. rawT, не T: T пересобирается вручную для остальной
            // карточки и plan/planSnapshot туда не проброшены.
            // skipped тоже сюда: PlanCard сама решает, что показать — карточку
            // «пропущен» с возможностью передумать. started/done уже обычная
            // сессия, им место в SummaryCard ниже.
            // Слой 5: правка куратора, на которую клиент ещё не ответил.
            // Идёт раньше всех прочих карточек — включая started/skipped, где
            // предложение как раз и появляется. Решение живёт здесь, на дне, а
            // не в переписке: одно решение в двух местах разъедется.
            const TKs = (HEYS.TrainingKernel && HEYS.TrainingKernel.strength) || null;
            const pendingProposal = TKs && TKs.pendingPlanProposal
              ? TKs.pendingPlanProposal(rawT)
              : null;
            // Карточкой предложение перехватывает день только пока клиент к
            // тренировке не приступал (экран 14a, «ты его ещё не начинал»).
            // Начатую тренировку подменять нельзя: тогда правка запирает вход
            // в конструктор, а человек не может продолжить, не ответив на неё.
            // Ему она приходит полоской внутри конструктора (экран 14b).
            const proposalBlocksDay = pendingProposal
              && !(Array.isArray(wlLive && wlLive.exercises) ? wlLive.exercises : [])
                .some(function (ex) { return TKs && TKs.hasDoneApproach(ex); });
            if (proposalBlocksDay && Parts.ProposalCard) {
              const trainingWithProposal = { workoutLog: wlLive, plan: rawT.plan, planSnapshot: rawT.planSnapshot };
              const acceptProposal = function () {
                patchTraining(ti, function (t0) {
                  const res = TKs.acceptPlanProposal(t0, Date.now());
                  // Не легло целиком (разрыв связки) — тренировку не трогаем:
                  // испорченная раскладка тише отказа и потому опаснее.
                  return res.ok ? res.training : t0;
                });
              };
              const declineProposal = function () {
                patchTraining(ti, function (t0) {
                  const res = TKs.declinePlanProposal(t0, Date.now());
                  return res.ok ? res.training : t0;
                });
              };
              return React.createElement(Parts.ProposalCard, {
                key: 'wb-proposal-' + ti,
                training: trainingWithProposal,
                onReview: function (e) {
                  if (e && e.stopPropagation) e.stopPropagation();
                  Parts.openProposalReview({
                    training: trainingWithProposal,
                    onAccept: acceptProposal,
                    onDecline: declineProposal
                  });
                },
                onDecline: function (e) {
                  if (e && e.stopPropagation) e.stopPropagation();
                  declineProposal();
                }
              });
            }
            if (rawT.plan && (rawT.plan.status === 'assigned' || rawT.plan.status === 'skipped') && Parts.PlanCard) {
              const isFutureDay = String(dateKey) > todayDateKeyForPlan();
              return React.createElement(Parts.PlanCard, {
                key: 'wb-plan-' + ti,
                training: { workoutLog: wlLive, plan: rawT.plan },
                dateKey: dateKey,
                isFutureDay: isFutureDay,
                // Единственное, что забрано из прежнего виджета обзора (16c):
                // место в неделе, а не дата следующей тренировки.
                weekPlace: weekPlaceFromStore(dateKey),
                moveOptions: moveOptionsFor(dateKey),
                // Клиент переносит сам, без подтверждения куратора (16a): пока
                // тот ответит, день уйдёт, и перенос превратится в пропуск.
                onMove: function (toDate) {
                  const src = readDayFromStore(dateKey);
                  const t0 = src && Array.isArray(src.trainings) ? src.trainings[ti] : null;
                  if (!t0 || !t0.plan) return;
                  const moved = {
                    ...t0,
                    id: 'tr_' + Math.random().toString(36).slice(2, 10),
                    plan: { ...t0.plan, status: 'assigned', movedFrom: dateKey, movedAt: Date.now() },
                    updatedAt: Date.now()
                  };
                  delete moved.plan.movedTo;
                  // Целевой день пишем первым: если не удастся, у клиента
                  // останется исходный план, а не потерянная тренировка.
                  const okTarget = appendTrainingToDay(toDate, moved);
                  if (!okTarget) return;
                  patchTraining(ti, function (cur) {
                    return { ...cur, plan: { ...cur.plan, status: 'moved', movedTo: toDate, movedAt: Date.now() } };
                  });
                },
                onStart: function (e) {
                  if (e && e.stopPropagation) e.stopPropagation();
                  // Старт снимает «assigned» один раз: дальше это обычная
                  // сессия конструктора, куратор её больше не правит поверх
                  // (setStrengthWorkout откажет на статусе started/done).
                  patchTraining(ti, function (t0) {
                    return { ...t0, plan: { ...t0.plan, status: 'started' } };
                  });
                  openBuilder();
                },
                // «Посмотреть» до своей даты не переводит план в started: это
                // просмотр состава, а не начало тренировки раньше срока.
                onOpenReadonly: function (e) { if (e && e.stopPropagation) e.stopPropagation(); openBuilder(); },
                // Пропуск — явное «не делал»: без него незакрытый план остаётся
                // «assigned» и вечно просится начать. Перенос на другую дату не
                // входит — открытый вопрос протокола, отдельная операция.
                onSkip: function (skipReason) {
                  patchTraining(ti, function (t0) {
                    const patch = { ...t0.plan, status: 'skipped' };
                    if (skipReason) patch.skipReason = skipReason;
                    else delete patch.skipReason;
                    patch.skippedAt = Date.now();
                    return { ...t0, plan: patch };
                  });
                },
                onResumeSkipped: function (e) {
                  if (e && e.stopPropagation) e.stopPropagation();
                  patchTraining(ti, function (t0) {
                    const patch = { ...t0.plan, status: 'assigned' };
                    delete patch.skipReason;
                    delete patch.skippedAt;
                    return { ...t0, plan: patch };
                  });
                }
              });
            }
            // Экран 01: сводка вместо конструктора — время, прогресс подходов и
            // одно действие. Тоннажа и калорий здесь нет намеренно.
            if (Parts.SummaryCard) {
              return React.createElement(Parts.SummaryCard, {
                key: 'wb-summary-' + ti,
                training: trainingForBuilder,
                dateKey: dateKey,
                onOpen: function (e) { if (e && e.stopPropagation) e.stopPropagation(); openBuilder(); }
              });
            }
            return React.createElement('button', {
            key: 'wb-fullscreen-' + ti,
            type: 'button',
            className: 'ct-wb-open-fullscreen',
            onClick: function (e) {
              e.stopPropagation();
              const U = HEYS.utils;
              builder.open({
                training: {
                  type: 'strength',
                  strengthEntryMode: 'workout_builder',
                  // Время начала нужно шапке конструктора: без него таймер
                  // тренировки показать не из чего.
                  time: (function () {
                    try {
                      const d = readDayFromStore(dateKey);
                      const t = d && Array.isArray(d.trainings) ? d.trainings[ti] : null;
                      return (t && t.time) || '';
                    } catch (_e) { return ''; }
                  })(),
                  workoutLog: wlLive
                },
                dateKey: dateKey,
                profile: (U && U.lsGet) ? (U.lsGet('heys_profile', {}) || {}) : {},
                onPatch: function (nextExercises) {
                  patchTraining(ti, function (t0) {
                    const wl0 = ensureWorkoutLogShape(t0);
                    wl0.exercises = nextExercises;
                    return applyWorkoutLogToTraining(t0, wl0);
                  });
                }
              });
              if (typeof haptic === 'function') haptic('light');
            }
            }, '⛶ Открыть конструктор');
          })();

        // Прототип экрана 01: на карточке дня — только сводка и одно действие.
        // Минуты по зонам и построчный ввод переехали во второй слой (сам
        // конструктор), поэтому старый инлайн-блок здесь больше не рисуем.
        // Он остаётся рабочим путём, пока полноэкранный не закроет все экраны:
        // условие снимается, если модуль конструктора почему-то не загрузился.
        const fullscreenReady = !!(HEYS.StrengthBuilder && HEYS.StrengthBuilder.open
          && HEYS.StrengthBuilderParts && HEYS.StrengthBuilderParts.SummaryCard);
        const builderBody = isBuilder && wlLive && !fullscreenReady && React.createElement('div', { className: 'ct-wb-card-body' },
          React.createElement('div', { className: 'ct-wb-zones-for-kcal' },
            React.createElement('div', { className: 'ct-wb-zones-for-kcal-title' }, 'Минуты по зонам для ккал'),
            React.createElement('div', { className: 'ct-wb-zones-for-kcal-grid' },
              [0, 1, 2, 3].map((zi) =>
                React.createElement('label', { key: 'wbz' + zi, className: 'ct-wb-mini ct-wb-zone-mini' },
                  React.createElement('span', { className: 'ct-wb-zone-mini-label' }, WB_KCAL_ZONE_LABELS[zi]),
                  React.createElement('input', {
                    type: 'number',
                    className: 'ct-wb-mini-inp',
                    min: 0,
                    max: 180,
                    inputMode: 'numeric',
                    'aria-label': 'Минуты, зона «' + WB_KCAL_ZONE_LABELS[zi] + '»',
                    value: wlLive.zoneMinutes[zi],
                    onClick: (e) => e.stopPropagation(),
                    onChange: (e) => {
                      const n = clampWbZoneMin(parseInt(e.target.value, 10) || 0);
                      patchTraining(ti, (t0) => {
                        const wl0 = ensureWorkoutLogShape(t0);
                        const nextZm = wl0.zoneMinutes.slice();
                        nextZm[zi] = n;
                        wl0.zoneMinutes = nextZm;
                        wl0.totalDurationMinutes = nextZm.reduce((s, v) => s + (+v || 0), 0);
                        return applyWorkoutLogToTraining(t0, wl0);
                      });
                    }
                  })
                )
              )
            )
          ),
          // Вход в полноэкранный конструктор (шаг 5 редизайна). Инлайновый
          // список остаётся рабочим путём, пока полноэкранный не закроет все
          // экраны: strangler-переход, а не разовая замена.
          React.createElement(WorkoutBuilderExerciseList, {
            key: 'wb-ex-list-' + ti,
            ti: ti,
            wlLive: wlLive,
            dateKey: dateKey,
            haptic: haptic,
            patchTraining: patchTraining,
            ensureWorkoutLogShape: ensureWorkoutLogShape,
            applyWorkoutLogToTraining: applyWorkoutLogToTraining,
            wbApproachRepStepper: wbApproachRepStepper
          }),
          (function () {
            const exs = (wlLive && Array.isArray(wlLive.exercises)) ? wlLive.exercises : [];
            const isFresh = exs.length === 0 || (exs.length === 1
              && !String(exs[0]?.name || '').trim()
              && !(exs[0]?.approaches || []).some(function (a) { return !!a.done; }));
            if (!isFresh) return null;
            const lastSession = dateKey ? findLastWorkoutBuilderExercises(dateKey, ti) : null;
            if (!lastSession || !lastSession.exercises || !lastSession.exercises.length) return null;
            const exCount = lastSession.exercises.length;
            const dateLabel = lastSession.dateKey
              ? formatExerciseHistoryLabel(lastSession.dateKey, dateKey)
              : 'недавно';
            return React.createElement('button', {
              type: 'button',
              className: 'ct-wb-replay-btn',
              title: 'Скопировать упражнения из прошлой силовой (' + dateLabel + ', ' + exCount + ' упр.)',
              onClick: (e) => {
                e.stopPropagation();
                if (typeof haptic === 'function') haptic('light');
                const cloned = cloneExercisesForReplay(lastSession.exercises);
                patchTraining(ti, (t0) => {
                  const wl0 = ensureWorkoutLogShape(t0);
                  wl0.exercises = cloned;
                  delete wl0.startedAt;
                  delete wl0.completedAt;
                  return applyWorkoutLogToTraining(t0, wl0);
                });
              }
            }, '↻ Повторить ' + dateLabel.toLowerCase() + ' (' + exCount + ' упр.)');
          })(),
          React.createElement('button', {
            type: 'button',
            className: 'ct-wb-add-btn',
            onClick: (e) => {
              e.stopPropagation();
              if (typeof haptic === 'function') haptic('light');
              patchTraining(ti, (t0) => {
                const wl0 = ensureWorkoutLogShape(t0);
                wl0.exercises = wl0.exercises.concat([{
                  id: createExerciseId(wl0.exercises.length),
                  name: '',
                  approaches: [{ id: createApproachId(wl0.exercises.length, 0), weightKg: '', reps: 10 }],
                  note: '',
                  ssGroup: 0,
                  rpe: 0
                }]);
                return applyWorkoutLogToTraining(t0, wl0);
              });
            }
          }, '+ Добавить упражнение')
        );

        const footerHintText = isBuilder
          ? 'Заголовок — полная карточка · здесь дневник подходов'
          : '✏️ Нажми для изменения';

        const cardClass =
          'compact-card compact-train compact-train--minimal widget-shadow-diary-glass widget-outline-diary-glass' +
          (isBuilder ? ' compact-train--workout-builder' : '');

        const headerIconChar = isMorningActivation ? '🧘' : (trainingType ? trainingType.icon : (trainIcons[ti] || '💪'));
        const titleBoxEl = React.createElement('div', { className: 'compact-train-title-box' },
          React.createElement('span', { className: 'compact-train-title' }, displayLabel),
          displayMeta && React.createElement('span', { className: 'compact-train-subtitle' }, displayMeta)
        );
        const timeEl = T.time && React.createElement('span', { className: 'compact-train-time' }, T.time);
        const rightGroupEl = React.createElement('div', { className: 'compact-right-group' },
          React.createElement('span', { className: 'compact-badge train' }, total + ' ккал'),
          React.createElement('button', {
            className: 'compact-train-remove',
            onClick: (e) => { e.stopPropagation(); removeTraining(ti); },
            title: 'Убрать тренировку'
          }, '×')
        );

        const footerEl = React.createElement('div', { className: 'compact-train-footer' },
          hasDuration && React.createElement('span', { className: 'train-duration-badge' }, '⏱ ' + totalMinutes + ' мин'),
          hasRatings && React.createElement('div', { className: 'train-ratings-inline' },
            moodEmoji && React.createElement('span', { className: 'train-rating-mini mood', title: 'Настроение' }, moodEmoji + ' ' + T.mood),
            wellbeingEmoji && React.createElement('span', { className: 'train-rating-mini wellbeing', title: 'Самочувствие' }, wellbeingEmoji + ' ' + T.wellbeing),
            stressEmoji && React.createElement('span', { className: 'train-rating-mini stress', title: 'Усталость' }, stressEmoji + ' ' + T.stress)
          ),
          React.createElement('span', { className: 'tap-hint' }, footerHintText)
        );

        const commentEl = T.comment && React.createElement('div', { className: 'training-card-comment' },
          '💬 ', T.comment
        );

        const foldedContentEl = React.createElement(React.Fragment, null, zonesRow, strengthBuilderCtaRow, strengthSummaryRow, builderBody);

        if (isBuilder) {
          return React.createElement(CollapsibleWorkoutBuilderTrainingCard, {
            key: 'tr' + ti,
            cardClassName: cardClass,
            haptic,
            openTrainingPicker,
            trainingIndex: ti,
            headerIconChar,
            titleBoxEl,
            timeEl,
            rightGroupEl,
            foldedContentEl,
            footerEl,
            commentEl,
            initialCollapsed: !!T.workoutBuilderCollapsed,
            collapsedStorageKey: 'heys_wb_collapsed_' + (dateKey || 'day') + '_' + ti,
            curatorTarget: 'training',
            trainingTargetIndex: String(ti),
            onCollapsedChange: (nextCollapsed) => {
              patchTraining(ti, (t0) => ({
                ...t0,
                workoutBuilderCollapsed: !!nextCollapsed
              }));
            }
          });
        }

        return React.createElement('div', {
          key: 'tr' + ti,
          className: cardClass,
          'data-curator-target': 'training',
          'data-training-index': String(ti)
        },
          React.createElement('div', {
            className: 'compact-train-header',
            onClick: () => openTrainingPicker && openTrainingPicker(ti)
          },
            React.createElement('span', { className: 'compact-train-icon' }, headerIconChar),
            titleBoxEl,
            timeEl,
            rightGroupEl
          ),
          foldedContentEl,
          footerEl,
          commentEl
        );
      }),
      householdEntries.map((h, hi) => {
        const hKcal = safeR0((+h.minutes || 0) * householdNetKcalPerMin(weight, kcalPerMin));
        const householdTitle = getHouseholdDisplayTitle(h);
        const isCustomTitle = householdTitle !== 'Бытовая активность';
        return React.createElement('div', {
          key: 'household-' + hi,
          className: 'compact-card compact-household widget-shadow-diary-glass widget-outline-diary-glass'
        },
          React.createElement('div', {
            className: 'compact-train-header',
            onClick: () => openHouseholdPicker && openHouseholdPicker('edit', hi)
          },
            React.createElement('span', { className: 'compact-train-icon' }, getHouseholdDisplayIcon(h)),
            React.createElement('div', { className: 'compact-train-title-box' },
              React.createElement('span', { className: 'compact-train-title' }, householdTitle),
              isCustomTitle && React.createElement('span', { className: 'compact-train-subtitle' }, 'Бытовая активность')
            ),
            h.time && React.createElement('span', { className: 'compact-train-time' }, h.time),
            React.createElement('div', { className: 'compact-right-group' },
              React.createElement('span', {
                className: 'compact-badge household clickable',
                onClick: (e) => showHouseholdFormula && showHouseholdFormula(hi, e)
              }, hKcal + ' ккал'),
              React.createElement('button', {
                className: 'compact-train-remove',
                onClick: (e) => { e.stopPropagation(); removeHousehold(hi); },
                title: 'Убрать активность'
              }, '×')
            )
          ),
          React.createElement('div', { className: 'compact-household-details' },
            React.createElement('span', { className: 'household-detail' }, '⏱ ' + h.minutes + ' мин'),
            React.createElement('span', { className: 'household-detail tap-hint' }, '✏️ Нажми для изменения')
          )
        );
      })
    );
  }

  HEYS.dayTrainings = {
    renderTrainingsBlock,
    // Тестовый шов — прямой рендер обзора программы куратора в изоляции от
    // всего остального compact-trainings дерева (много обязательных пропов).
    ProgramNextLine,
    // Тестовый шов — перенос полей подхода и упражнения при пересборке журнала.
    // От него зависит тоннаж (разминка вне счёта, сбросы в счёте, свой вес по
    // коэффициенту), а сама пересборка живёт внутри renderTrainingsBlock.
    carryApproachSnapshotFields,
    carryExerciseSnapshotFields,
    cloneExercisesForReplay,
    // Тестовый шов — тоннаж дня: он обязан совпадать с числом в конструкторе,
    // а совпадает только когда знает массу тела.
    computeDayTotalTonnage,
    moveOptionsFor,
    appendTrainingToDay,
    ProgramPathScreen,
    placeInWeek
  };
})(window);
