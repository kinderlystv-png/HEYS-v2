// heys_mobility_validators_v1.js — Машинные правила безопасности режима мобильности.
//
// Источник: METHODOLOGY ч.9 (S1–S9) + §11.2 + CONSTRUCTOR_SPEC §1.6/§3.2.
// Контракт (как у пальцев): чистые функции `(input) → Issue[]`. Fail-closed —
// отсутствующий/невалидный вход даёт level:'error', не молча 'ok'.
//
// Issue = { level:'ok'|'warn'|'error', code, msg, ...extra }
//
// Public API (HEYS.Mobility.validators):
//   S1_ageLevelGate(atom, profile)         — fail-closed возраст/уровень
//   S2_painStop(painInput)                 — флаг боли 'pain' → стоп (error)
//   S3_warmupRequired(session)             — интенсивный/end-range/баллистика без warmup = invalid
//   S4_populationGate(atom, profile)       — гипермобильность/беременность/подросток → блок ограниченных атомов
//   S5_pnfControl(atom, profile)           — PNF при ССЗ/Вальсальва-риске → warn
//   S6_contraindication(atom, context)     — gates.contraind ∩ context → блок
//   S7_rehabGate(atom, context)            — режим rehab: строгие гейты, боль → стоп
//   S8_longStaticBeforePower(session)      — долгая статика (>60с) перед мощностью → warn
//   S9_morningEndRange(atom, context)      — утром end-range без полной разминки → warn
//   R1_autonomicCoherence(session)         — тонизация+релакс в одной сессии → warn
//   E_equipmentGate(atom, profile)         — нет нужного инвентаря → атом недоступен (warn)
//   runAtom(atom, profile, context)        — все атом-уровневые правила
//   runSession(session, profile, context)  — все сессия-уровневые правила

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__validatorsRegistered) return; // idempotent
  Mobility.__validatorsRegistered = true;

  // ─── Хелперы ────────────────────────────────────────────────────────────────
  const LEVEL_ORDER = { beginner: 0, intermediate: 1, advanced: 2 };
  const LEVELS_KNOWN = Object.keys(LEVEL_ORDER);

  function ok(code, msg, extra) { return Object.assign({ level: 'ok', code: code, msg: msg }, extra || {}); }
  function warn(code, msg, extra) { return Object.assign({ level: 'warn', code: code, msg: msg }, extra || {}); }
  function err(code, msg, extra) { return Object.assign({ level: 'error', code: code, msg: msg }, extra || {}); }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function gatesOf(atom) { return (atom && atom.gates) || {}; }
  function doseOf(atom) { return (atom && atom.dose) || {}; }

  // end-range атом: развивающая работа у конца диапазона (методология 3.1/3.2)
  function isEndRange(atom) {
    if (!atom) return false;
    const ds = atom.doseShape;
    // CARs/динамика — низконагруз. (делаются «с холода», в т.ч. утром) → не end-range.
    if (['pnf', 'eccentric'].indexOf(ds) >= 0) return true;
    if (ds === 'hold') {
      const d = doseOf(atom);
      return atom.purpose === 'develop' || d.intensity === 'develop' || num(d.holdSec) > 60;
    }
    return false;
  }
  function isBallistic(atom) {
    return atom && atom.doseShape === 'dynamic' && doseOf(atom).tempo === 'ballistic';
  }
  function isIntensive(atom) {
    return !!atom && (atom.fatigueCost === 'high' || isEndRange(atom) || isBallistic(atom));
  }
  function eachAtom(session, fn) {
    if (!session || !Array.isArray(session.blocks)) return;
    session.blocks.forEach(function (b, bi) {
      (b && Array.isArray(b.atoms) ? b.atoms : []).forEach(function (a, ai) { fn(a, b, bi, ai); });
    });
  }

  // ─── S1 — age/level gate (fail-closed) ────────────────────────────────────────
  function S1_ageLevelGate(atom, profile) {
    if (!atom || typeof atom !== 'object') return [err('S1.invalid_atom', 'атом не объект')];
    if (!profile || typeof profile !== 'object') return [err('S1.no_profile', 'нет профиля — fail-closed')];
    const g = gatesOf(atom);

    const age = num(profile.age);
    if (age === null) return [err('S1.age_missing', 'возраст не задан/невалиден — fail-closed', { atomId: atom.id })];
    const minAge = num(g.minAge);
    if (minAge === null) return [err('S1.atom_minAge_invalid', 'gates.minAge не число — fail-closed', { atomId: atom.id })];
    if (age < minAge) return [err('S1.under_min_age', 'возраст ниже порога атома', { atomId: atom.id, age: age, minAge: minAge })];

    const minLevel = g.minLevel;
    const profileLevel = profile.level;
    if (LEVELS_KNOWN.indexOf(minLevel) < 0) return [err('S1.atom_minLevel_invalid', 'gates.minLevel не в enum', { atomId: atom.id })];
    if (LEVELS_KNOWN.indexOf(profileLevel) < 0) return [err('S1.profile_level_missing', 'уровень профиля не задан — fail-closed', { atomId: atom.id })];
    if (LEVEL_ORDER[profileLevel] < LEVEL_ORDER[minLevel]) {
      return [err('S1.under_min_level', 'уровень профиля ниже порога', { atomId: atom.id, profileLevel: profileLevel, minLevel: minLevel })];
    }
    return [ok('S1.pass', 'возраст/уровень в норме', { atomId: atom.id })];
  }

  // ─── S2 — pain stop ───────────────────────────────────────────────────────────
  // painInput: PainFlag {level,zone,atomId} | { painFlags:[...] } | массив флагов
  function S2_painStop(painInput) {
    let flags = [];
    if (Array.isArray(painInput)) flags = painInput;
    else if (painInput && Array.isArray(painInput.painFlags)) flags = painInput.painFlags;
    else if (painInput && typeof painInput.level === 'string') flags = [painInput];
    const pain = flags.filter(function (f) { return f && f.level === 'pain'; });
    if (pain.length) return [err('S2.pain_stop', 'острая боль — стоп прогрессии, мягкий/реабилитационный режим', { zones: pain.map(function (f) { return f.zone; }) })];
    const disc = flags.filter(function (f) { return f && f.level === 'discomfort'; });
    if (disc.length) return [ok('S2.discomfort', 'тянущий дискомфорт — допустимо, лог', { zones: disc.map(function (f) { return f.zone; }) })];
    return [ok('S2.none', 'боли не зафиксировано')];
  }

  // ─── S3 — разминка обязательна перед интенсивным ──────────────────────────────
  function S3_warmupRequired(session) {
    if (!session || typeof session !== 'object') return [err('S3.invalid_session', 'сессия не объект')];
    let intensive = null;
    eachAtom(session, function (a) { if (!intensive && isIntensive(a)) intensive = a; });
    if (intensive && session.warmupCompleted !== true) {
      return [err('S3.no_warmup', 'интенсивный/end-range/баллистический блок без разминки', { atomId: intensive.id })];
    }
    return [ok('S3.pass', 'разминка не требуется или выполнена')];
  }

  // ─── S4 — population gate (гипермобильность/беременность/подросток) ────────────
  function S4_populationGate(atom, profile) {
    if (!atom || typeof atom !== 'object') return [err('S4.invalid_atom', 'атом не объект')];
    const restricted = gatesOf(atom).populationGate || [];
    const have = (profile && Array.isArray(profile.populations)) ? profile.populations : [];
    const hit = restricted.filter(function (p) { return have.indexOf(p) >= 0; });
    if (hit.length) return [err('S4.population_blocked', 'атом ограничен для популяции пользователя (укреплять, не растягивать)', { atomId: atom.id, populations: hit })];
    return [ok('S4.pass', 'нет популяционных ограничений', { atomId: atom.id })];
  }

  // ─── S5 — PNF под контролем (без Вальсальвы) ──────────────────────────────────
  function S5_pnfControl(atom, profile) {
    if (!atom || typeof atom !== 'object') return [err('S5.invalid_atom', 'атом не объект')];
    if (atom.doseShape !== 'pnf') return [ok('S5.na', 'не PNF')];
    const cardio = !!(profile && profile.cardioFlag);
    const valsalvaTag = (gatesOf(atom).contraind || []).indexOf('valsalva_risk') >= 0;
    if (cardio || valsalvaTag) {
      return [warn('S5.pnf_valsalva', 'PNF: субмакс усилие, дыхание свободно (ССЗ/Вальсальва-риск)', { atomId: atom.id })];
    }
    return [ok('S5.pass', 'PNF допустим под контролем', { atomId: atom.id })];
  }

  // ─── S6 — противопоказания (общий контракт gates.contraind) ───────────────────
  // Данные-контракт: атом несёт gates.contraind[]; контекст несёт состояние
  // пользователя (contraindications[]/beforePower/acuteInjuryZone). Любой матч → блок.
  function S6_contraindication(atom, context) {
    if (!atom || typeof atom !== 'object') return [err('S6.invalid_atom', 'атом не объект')];
    const contra = gatesOf(atom).contraind || [];
    if (!contra.length) return [ok('S6.na', 'нет противопоказаний у атома')];
    const ctx = context || {};
    // pre_power: атом противопоказан перед взрывной работой (напр. перкуссия)
    if (contra.indexOf('pre_power') >= 0 && ctx.beforePower === true) {
      return [err('S6.pre_power', 'атом противопоказан перед взрывной работой', { atomId: atom.id })];
    }
    // acute_injury: воздействие по зоне острой травмы
    if (contra.indexOf('acute_injury') >= 0 && ctx.acuteInjuryZone && ctx.acuteInjuryZone === atom.jointRegion) {
      return [err('S6.over_injury', 'воздействие по зоне острой травмы/воспаления', { atomId: atom.id, zone: atom.jointRegion })];
    }
    // общий матч: состояние пользователя ∩ противопоказания атома
    const userContra = Array.isArray(ctx.contraindications) ? ctx.contraindications : [];
    const hit = contra.filter(function (c) { return userContra.indexOf(c) >= 0; });
    if (hit.length) return [err('S6.contraindicated', 'противопоказание совпало с состоянием пользователя', { atomId: atom.id, contra: hit })];
    return [ok('S6.pass', 'противопоказаний не выявлено', { atomId: atom.id })];
  }

  // ─── S7 — режим реабилитации: строгие гейты ───────────────────────────────────
  function S7_rehabGate(atom, context) {
    if (!atom || typeof atom !== 'object') return [err('S7.invalid_atom', 'атом не объект')];
    const ctx = context || {};
    if (ctx.mode !== 'rehab') return [ok('S7.na', 'не реабилитационный режим')];
    if (ctx.activePain === true) return [err('S7.rehab_pain', 'rehab: активная боль — прогрессия запрещена', { atomId: atom.id })];
    if (atom.fatigueCost === 'high' || atom.tissueLoad === 'high') {
      return [err('S7.rehab_too_intense', 'rehab: высокая нагрузка недопустима', { atomId: atom.id })];
    }
    return [ok('S7.pass', 'допустимо в rehab', { atomId: atom.id })];
  }

  // ─── S8 — долгая статика (>60с) не перед мощностью ────────────────────────────
  function S8_longStaticBeforePower(session) {
    if (!session || typeof session !== 'object') return [err('S8.invalid_session', 'сессия не объект')];
    const prePower = session.mode === 'pre_workout_ramp' || session.beforePower === true;
    if (!prePower) return [ok('S8.na', 'не предтренировочный контекст')];
    let longStatic = null;
    eachAtom(session, function (a) {
      if (!longStatic && a && a.doseShape === 'hold' && num(doseOf(a).holdSec) > 60) longStatic = a;
    });
    if (longStatic) return [warn('S8.long_static_pre_power', 'долгая статика (>60с) перед мощностью — переставить/заменить динамикой', { atomId: longStatic.id })];
    return [ok('S8.pass', 'долгой статики перед мощностью нет')];
  }

  // ─── S9 — утром не форсировать end-range ──────────────────────────────────────
  function S9_morningEndRange(atom, context) {
    if (!atom || typeof atom !== 'object') return [err('S9.invalid_atom', 'атом не объект')];
    const ctx = context || {};
    if (ctx.timeOfDay === 'morning' && isEndRange(atom) && ctx.warmupCompleted !== true) {
      return [warn('S9.morning_cold_endrange', 'утром ткань жёстче — не форсировать конечный диапазон без полной разминки', { atomId: atom.id })];
    }
    return [ok('S9.pass', 'нет утреннего риска end-range', { atomId: atom.id })];
  }

  // ─── R1 — когерентность автономного вектора сессии ────────────────────────────
  function R1_autonomicCoherence(session) {
    if (!session || typeof session !== 'object') return [err('R1.invalid_session', 'сессия не объект')];
    const vectors = {};
    (Array.isArray(session.blocks) ? session.blocks : []).forEach(function (b) {
      if (b && b.autonomic) vectors[b.autonomic] = true;
      // вектор может жить и на атомах внутри блока (builder может не проставить block.autonomic)
      (b && Array.isArray(b.atoms) ? b.atoms : []).forEach(function (a) {
        if (a && a.autonomic) vectors[a.autonomic] = true;
      });
    });
    if (vectors.tonify && vectors.relax) {
      return [warn('R1.mixed_vector', 'в одной сессии смешаны тонизация и релакс — разнести', {})];
    }
    return [ok('R1.pass', 'автономный вектор когерентен')];
  }

  // ─── E — equipment gate (доступность инвентаря) ───────────────────────────────
  function E_equipmentGate(atom, profile) {
    if (!atom || typeof atom !== 'object') return [err('E.invalid_atom', 'атом не объект')];
    const req = gatesOf(atom).equipment || [];
    const have = (profile && Array.isArray(profile.equipment)) ? profile.equipment : [];
    const missing = req.filter(function (e) { return have.indexOf(e) < 0; });
    if (missing.length) return [warn('E.equipment_missing', 'нет нужного инвентаря — атом недоступен', { atomId: atom.id, missing: missing })];
    return [ok('E.pass', 'инвентарь доступен', { atomId: atom.id })];
  }

  // ─── Агрегаторы ───────────────────────────────────────────────────────────────
  function runAtom(atom, profile, context) {
    const ctx = context || {};
    // боль, зона-скоуп: блокируем атом по болящей зоне (общий контракт S2)
    const zonePain = (Array.isArray(ctx.painFlags) ? ctx.painFlags : [])
      .filter(function (f) { return f && f.zone === (atom && atom.jointRegion); });
    return [].concat(
      S1_ageLevelGate(atom, profile),
      S2_painStop(zonePain),
      S4_populationGate(atom, profile),
      S5_pnfControl(atom, profile),
      S6_contraindication(atom, context),
      S7_rehabGate(atom, context),
      S9_morningEndRange(atom, context),
      E_equipmentGate(atom, profile)
    ).filter(function (i) { return i.level !== 'ok'; });
  }
  function runSession(session, profile, context) {
    const ctx = context || {};
    const pain = (Array.isArray(ctx.painFlags) && ctx.painFlags)
      || (session && Array.isArray(session.painFlags) && session.painFlags) || [];
    return [].concat(
      S2_painStop(pain),
      S3_warmupRequired(session),
      S8_longStaticBeforePower(session),
      R1_autonomicCoherence(session)
    ).filter(function (i) { return i.level !== 'ok'; });
  }

  // ─── Экспорт ───────────────────────────────────────────────────────────────────
  Mobility.validators = {
    __registered: true,
    S1_ageLevelGate: S1_ageLevelGate,
    S2_painStop: S2_painStop,
    S3_warmupRequired: S3_warmupRequired,
    S4_populationGate: S4_populationGate,
    S5_pnfControl: S5_pnfControl,
    S6_contraindication: S6_contraindication,
    S7_rehabGate: S7_rehabGate,
    S8_longStaticBeforePower: S8_longStaticBeforePower,
    S9_morningEndRange: S9_morningEndRange,
    R1_autonomicCoherence: R1_autonomicCoherence,
    E_equipmentGate: E_equipmentGate,
    runAtom: runAtom,
    runSession: runSession,
    // хелперы для тестов/builder
    _isEndRange: isEndRange,
    _isBallistic: isBallistic,
    _isIntensive: isIntensive
  };
})(typeof window !== 'undefined' ? window : globalThis);
