// heys_kernel_gate_v1.js — ОБЩЕЕ ЯДРО: каркас валидаторов (Issue + S1 level/age gate).
//
// Single source: конструкторы Issue (ok/warn/err), fail-closed гейт уровня/возраста
// (S1), S3 warmup-каркас и простые token-gates (equipment/prerequisites).
// Набор уровней (3 у мобильности / 4 у пальцев c elite) инъектируется как levelOrder.
// Доменные S-правила (ткань/боль/популяция/МФР) остаются в доменных validators.
//
// Issue = { level:'ok'|'warn'|'error', code, msg, ...extra }
//
// Public API (HEYS.TrainingKernel.gate):
//   ok(code,msg,extra) / warn(...) / err(...)
//   levelAgeGate(atom, profile, levelOrder) → Issue[]     (fail-closed, коды S1.*)
//   warmupRequired(session, config) → Issue[]               (S3, с доменными hooks)
//   equipmentGate(atom, profile) → Issue[]                  (коды E.*)
//   prerequisitesGate(atom, profile, opts?) → Issue[]        (по умолчанию коды S9.*)
//   runRules(rules, args?) → Issue[]                        (flat, fail-safe runner)
//   nonOk(issues) → Issue[]                                 (drop ok)

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.gate && TK.gate.__registered) return; // idempotent

  const DEFAULT_LEVEL_ORDER = { beginner: 0, intermediate: 1, advanced: 2, elite: 3 };

  function ok(code, msg, extra) { return Object.assign({ level: 'ok', code: code, msg: msg }, extra || {}); }
  function warn(code, msg, extra) { return Object.assign({ level: 'warn', code: code, msg: msg }, extra || {}); }
  function err(code, msg, extra) { return Object.assign({ level: 'error', code: code, msg: msg }, extra || {}); }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }

  function asArray(x) {
    if (Array.isArray(x)) return x;
    return x == null ? [] : [x];
  }

  function runRules(rules, args) {
    const out = [];
    const list = Array.isArray(rules) ? rules : [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (typeof r !== 'function') continue;
      try {
        const value = r.apply(null, Array.isArray(args) ? args : []);
        asArray(value).forEach(function (issue) {
          if (issue && typeof issue === 'object') out.push(issue);
        });
      } catch (e) {
        out.push(err('validator.exception', 'исключение в валидаторе — fail-closed', {
          index: i,
          message: e && e.message ? e.message : String(e)
        }));
      }
    }
    return out;
  }

  function nonOk(issues) {
    return asArray(issues).filter(function (i) { return i && i.level !== 'ok'; });
  }

  // S1 — fail-closed гейт уровня/возраста (METHODOLOGY ч.9; коды/семантика как у пальцев).
  function levelAgeGate(atom, profile, levelOrder) {
    const order = levelOrder || DEFAULT_LEVEL_ORDER;
    const known = Object.keys(order);
    if (!atom || typeof atom !== 'object') return [err('S1.invalid_atom', 'атом не объект')];
    if (!profile || typeof profile !== 'object') return [err('S1.no_profile', 'нет профиля — fail-closed')];

    const g = atom.gates || {};
    const age = num(profile.age);
    if (age === null) return [err('S1.age_missing', 'возраст не задан/невалиден — fail-closed', { atomId: atom.id })];
    const minAge = num(g.minAge);
    if (minAge === null) return [err('S1.atom_minAge_invalid', 'у атома gates.minAge не число — fail-closed', { atomId: atom.id })];
    if (age < minAge) return [err('S1.under_min_age', 'возраст ниже порога атома', { atomId: atom.id, age: age, minAge: minAge })];

    const minLevel = g.minLevel;
    const profileLevel = profile.level;
    if (known.indexOf(minLevel) < 0) return [err('S1.atom_minLevel_invalid', 'у атома gates.minLevel не в enum', { atomId: atom.id })];
    if (known.indexOf(profileLevel) < 0) return [err('S1.profile_level_missing', 'уровень профиля не задан/невалиден — fail-closed', { atomId: atom.id })];
    if (order[profileLevel] < order[minLevel]) {
      return [err('S1.under_min_level', 'уровень профиля ниже порога атома', { atomId: atom.id, profileLevel: profileLevel, minLevel: minLevel })];
    }
    return [ok('S1.pass', 'S1: возраст/уровень в норме', { atomId: atom.id })];
  }

  function gatesOf(atom) {
    return (atom && atom.gates) || {};
  }

  function equipmentGate(atom, profile) {
    if (!atom || typeof atom !== 'object') return [err('E.invalid_atom', 'атом не объект')];
    const req = Array.isArray(gatesOf(atom).equipment) ? gatesOf(atom).equipment : [];
    const have = profile && Array.isArray(profile.equipment) ? profile.equipment : [];
    const missing = req.filter(function (e) { return have.indexOf(e) < 0; });
    if (missing.length) return [warn('E.equipment_missing', 'нет нужного инвентаря — атом недоступен', { atomId: atom.id, missing: missing })];
    return [ok('E.pass', 'инвентарь доступен', { atomId: atom.id })];
  }

  function warmupRequired(session, config) {
    const cfg = config || {};
    const invalid = typeof cfg.invalid === 'function'
      ? cfg.invalid
      : function (s) { return !s || typeof s !== 'object'; };
    if (invalid(session)) {
      return [err(cfg.invalidCode || 'S3.invalid_session', cfg.invalidMsg || 'сессия не объект')];
    }

    const rawItems = typeof cfg.items === 'function'
      ? cfg.items(session)
      : (Array.isArray(session && session.blocks) ? session.blocks : []);
    const items = Array.isArray(rawItems) ? rawItems : [];
    const isIntensive = typeof cfg.isIntensive === 'function'
      ? cfg.isIntensive
      : function (x) { return !!x && (x.fatigueCost === 'high' || x.fatigueCost === 'max'); };
    const intensive = items.filter(function (item) { return isIntensive(item, session); });
    if (intensive.length === 0) {
      return [ok(cfg.emptyCode || 'S3.na', cfg.emptyMsg || 'S3 не применим: нет intensive-блоков')];
    }

    const warmupDone = typeof cfg.warmupDone === 'function'
      ? !!cfg.warmupDone(session)
      : !!(session && session.context && session.context.warmupDone);
    if (!warmupDone) {
      const extra = typeof cfg.missingExtra === 'function' ? (cfg.missingExtra(intensive, session) || {}) : {};
      return [err(cfg.missingCode || 'S3.warmup_missing',
        cfg.missingMsg || 'intensive-блок(и) без warmup_done — сессия невалидна',
        extra)];
    }
    return [ok(cfg.passCode || 'S3.pass', cfg.passMsg || 'S3: разминка выполнена')];
  }

  function prerequisitesGate(atom, profile, opts) {
    const options = opts || {};
    const prefix = options.codePrefix || 'S9';
    function code(suffix) { return prefix + '.' + suffix; }
    if (!atom || typeof atom !== 'object') return [err(code('invalid_atom'), 'атом не объект')];
    const prereqs = Array.isArray(gatesOf(atom).prerequisites) ? gatesOf(atom).prerequisites : [];
    if (prereqs.length === 0) {
      return [ok(code('na'), prefix + ' не применим: prereq-список пуст', { atomId: atom.id })];
    }
    if (!profile || typeof profile !== 'object') {
      return [err(code('no_profile'), 'нет профиля — fail-closed', { atomId: atom.id })];
    }
    const completed = Array.isArray(profile.completedPrerequisites) ? profile.completedPrerequisites : [];
    const missing = prereqs.filter(function (tok) { return completed.indexOf(tok) < 0; });
    if (missing.length > 0) {
      return [err(code('prereq_missing'), 'не выполнены prereq: ' + missing.join(', '), {
        atomId: atom.id,
        missing: missing
      })];
    }
    return [ok(code('pass'), prefix + ': все prereq выполнены', { atomId: atom.id })];
  }

  TK.gate = {
    __registered: true,
    DEFAULT_LEVEL_ORDER: DEFAULT_LEVEL_ORDER,
    ok: ok, warn: warn, err: err,
    levelAgeGate: levelAgeGate,
    warmupRequired: warmupRequired,
    equipmentGate: equipmentGate,
    prerequisitesGate: prerequisitesGate,
    runRules: runRules,
    nonOk: nonOk
  };
})(typeof window !== 'undefined' ? window : globalThis);
