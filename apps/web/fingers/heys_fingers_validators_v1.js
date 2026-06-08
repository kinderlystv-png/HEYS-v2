// heys_fingers_validators_v1.js — Машинные правила безопасности (Phase 1 / step 3 part 2).
//
// Источник: METHODOLOGY ч.9 (таблица 9.2 S1–S8) + IMPLEMENTATION_MAP «Заметки
// целостности» (homed V_*). Контракт: чистые функции `(input) → Issue[]`.
// Fail-closed: невалидный/отсутствующий вход даёт level:'error', не молча 'ok'.
//
// Off-live-path: модуль НЕ читается mix_engine'ом. Подключение — Шаг 4 за флагом.
//
// Public API:
//   HEYS.Fingers.validators.S1_ageLevelGate(atom, profile)        — fail-closed возраст/уровень
//   HEYS.Fingers.validators.S2_tissueFreshness(atom, history, now)— ≥48ч свежесть high-tissue
//   HEYS.Fingers.validators.S3_warmupRequired(session)            — intensive без warmup_done = invalid
//   HEYS.Fingers.validators.S4_progressionCap(ftlWeek, trailingAvg)— рост >10%/нед = warn
//   HEYS.Fingers.validators.S5_openhandFirst(atom, profile)       — beginner на замке = warn
//   HEYS.Fingers.validators.S6_antagonistBalance(microcycle)      — тяги без antagonist = warn
//   HEYS.Fingers.validators.S7_deloadRequired(mesocycle)          — ≥4 загрузочных без deload = warn
//   HEYS.Fingers.validators.S8_painStop(sessionLog)               — pain в логе = error/блок
//   HEYS.Fingers.validators.V_blockHomogeneity(block)             — атомы блока согласованы
//   HEYS.Fingers.validators.V_sessionOrder(session)               — порядок power→endurance→ant
//   HEYS.Fingers.validators.V_energySystemSequence(mesocycle)     — сила→ёмкость→аэробика
//   HEYS.Fingers.validators.V_skillBalance(week, level)           — железо ≤ skill-доля
//   HEYS.Fingers.validators.runAll(input, profile, history)       — прогон всех применимых

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__validatorsRegistered) return; // idempotent
  Fingers.__validatorsRegistered = true;

  // ─── Хелперы ──────────────────────────────────────────────────────────────────
  const LEVEL_ORDER = { beginner: 0, intermediate: 1, advanced: 2, elite: 3 };
  const LEVELS_KNOWN = Object.keys(LEVEL_ORDER);

  function ok(code, msg, extra) {
    return Object.assign({ level: 'ok', code: code, msg: msg }, extra || {});
  }
  function warn(code, msg, extra) {
    return Object.assign({ level: 'warn', code: code, msg: msg }, extra || {});
  }
  function err(code, msg, extra) {
    return Object.assign({ level: 'error', code: code, msg: msg }, extra || {});
  }

  // Безопасно прочитать число.
  function num(x) {
    return typeof x === 'number' && isFinite(x) ? x : null;
  }

  // ─── S1 — age/level gate (fail-closed) ────────────────────────────────────────
  // METHODOLOGY ч.9.2/9.3, IMPLEMENTATION_MAP S1.
  function S1_ageLevelGate(atom, profile) {
    if (!atom || typeof atom !== 'object') return [err('S1.invalid_atom', 'атом не объект')];
    if (!profile || typeof profile !== 'object')
      return [err('S1.no_profile', 'нет профиля — fail-closed')];

    const g = atom.gates || {};

    // age fail-closed: нет числа возраста → блок
    const age = num(profile.age);
    if (age === null) {
      return [err('S1.age_missing', 'возраст не задан/невалиден — fail-closed', { atomId: atom.id })];
    }
    const minAge = num(g.minAge);
    if (minAge === null) {
      return [err('S1.atom_minAge_invalid', 'у атома gates.minAge не число — fail-closed', { atomId: atom.id })];
    }
    if (age < minAge) {
      return [err('S1.under_min_age', 'возраст ниже порога атома', {
        atomId: atom.id, age: age, minAge: minAge
      })];
    }

    // level
    const minLevel = g.minLevel;
    const profileLevel = profile.level;
    if (LEVELS_KNOWN.indexOf(minLevel) < 0) {
      return [err('S1.atom_minLevel_invalid', 'у атома gates.minLevel не в enum', { atomId: atom.id })];
    }
    if (LEVELS_KNOWN.indexOf(profileLevel) < 0) {
      return [err('S1.profile_level_missing', 'уровень профиля не задан/невалиден — fail-closed', { atomId: atom.id })];
    }
    if (LEVEL_ORDER[profileLevel] < LEVEL_ORDER[minLevel]) {
      return [err('S1.under_min_level', 'уровень профиля ниже порога атома', {
        atomId: atom.id, profileLevel: profileLevel, minLevel: minLevel
      })];
    }
    return [ok('S1.pass', 'S1: возраст/уровень в норме', { atomId: atom.id })];
  }

  // ─── S2 — tissue freshness ≥48ч ────────────────────────────────────────────────
  // METHODOLOGY ч.1.6/9.2, IMPLEMENTATION_MAP S2.
  // history: [{timestamp: ms, atomId, tissueLoad}], now: ms (default Date.now()).
  function S2_tissueFreshness(atom, history, now) {
    if (!atom) return [err('S2.invalid_atom', 'атом не задан')];
    const t = atom.tissueLoad;
    if (t !== 'high' && t !== 'max') {
      return [ok('S2.na', 'S2 не применим: tissueLoad не high/max', { atomId: atom.id })];
    }
    if (!Array.isArray(history)) {
      // fail-safe: нет истории → допускаем (первая сессия)
      return [ok('S2.no_history', 'нет истории, допускаем', { atomId: atom.id })];
    }
    // Нит ревью: now=0 — легитимное значение (Unix epoch). Используем ??, не ||.
    // Date.now()-fallback оставлен сознательно как практический default — это
    // ЕДИНСТВЕННАЯ нечистая точка в модуле; пометить при вызове из CI/тестов.
    const ts = num(now) ?? Date.now();
    const cutoff = ts - 48 * 60 * 60 * 1000;
    const violations = history.filter(function (h) {
      // Окно [cutoff, ts]: и нижняя, и верхняя граница. До фикса не было ts —
      // запись с timestamp ПОСЛЕ now считалась нарушением (бессмыслица для
      // легитимных данных, но открывало семантическую дыру).
      return num(h && h.timestamp) !== null &&
             h.timestamp >= cutoff &&
             h.timestamp <= ts &&
             (h.tissueLoad === 'high' || h.tissueLoad === 'max');
    });
    if (violations.length > 0) {
      const last = violations[violations.length - 1];
      const hoursAgo = ((ts - last.timestamp) / 3600000).toFixed(1);
      return [err('S2.fresh_tissue_violation',
        'высокая нагрузка на ткань пальцев за последние 48ч (' + hoursAgo + 'ч назад)',
        { atomId: atom.id, hoursAgo: parseFloat(hoursAgo) })];
    }
    return [ok('S2.pass', 'S2: ткань свежая', { atomId: atom.id })];
  }

  // ─── S3 — разминка обязательна перед intensive ────────────────────────────────
  // METHODOLOGY ч.5.7/9.2, IMPLEMENTATION_MAP S3.
  // session = {blocks: [...], context: {warmupDone: bool}}
  function S3_warmupRequired(session) {
    if (!session || !Array.isArray(session.blocks))
      return [err('S3.invalid_session', 'сессия без blocks')];
    const intensive = session.blocks.filter(function (b) {
      return b && (b.fatigueCost === 'high' || b.fatigueCost === 'max');
    });
    if (intensive.length === 0) {
      return [ok('S3.na', 'S3 не применим: нет intensive-блоков')];
    }
    const warmupDone = !!(session.context && session.context.warmupDone);
    if (!warmupDone) {
      return [err('S3.warmup_missing',
        'intensive-блок(и) без warmup_done — сессия невалидна',
        { intensiveBlockIds: intensive.map(function (b) { return b.id; }) })];
    }
    return [ok('S3.pass', 'S3: разминка выполнена')];
  }

  // ─── S4 — рост недельного high-intensity объёма ≤10% ──────────────────────────
  // METHODOLOGY ч.1.2/1.8/9.2, CONSTRUCTOR_SPEC §3.1 (FTL), IMPLEMENTATION_MAP S4.
  function S4_progressionCap(ftlWeek, trailingAvg) {
    const cur = num(ftlWeek);
    const base = num(trailingAvg);
    if (cur === null) return [err('S4.invalid_ftl', 'ftlWeek не число')];
    if (base === null || base <= 0) {
      return [ok('S4.no_baseline', 'нет trailing-базы (1-я неделя), пропуск')];
    }
    const ratio = cur / base;
    if (ratio > 1.10) {
      return [warn('S4.acute_overload',
        'недельный FTL вырос на ' + ((ratio - 1) * 100).toFixed(1) + '% (>10%)',
        { ratio: ratio, ftlWeek: cur, trailingAvg: base })];
    }
    return [ok('S4.pass', 'S4: рост ≤10%', { ratio: ratio })];
  }

  // ─── S5 — открытый хват база, замок — позже ───────────────────────────────────
  // METHODOLOGY ч.3.3/9.2, IMPLEMENTATION_MAP S5.
  const CLOSED_GRIPS = ['halfcrimp', 'fullcrimp']; // замки требуют более продвинутого уровня.
  function S5_openhandFirst(atom, profile) {
    if (!atom) return [err('S5.invalid_atom', 'атом не задан')];
    if (!atom.gripId) return [ok('S5.na', 'S5 не применим: атом без gripId', { atomId: atom.id })];
    if (CLOSED_GRIPS.indexOf(atom.gripId) < 0) {
      return [ok('S5.pass', 'S5: открытый хват', { atomId: atom.id, gripId: atom.gripId })];
    }
    // closed grip — beginner = warn
    if (!profile || profile.level === 'beginner') {
      return [warn('S5.closed_grip_for_beginner',
        'замок (' + atom.gripId + ') рискован для beginner — приоритет открытому',
        { atomId: atom.id, gripId: atom.gripId })];
    }
    return [ok('S5.pass', 'S5: замок допустим на уровне', { atomId: atom.id })];
  }

  // ─── S6 — баланс антагонистов ─────────────────────────────────────────────────
  // METHODOLOGY ч.1.8/9.2, IMPLEMENTATION_MAP S6.
  // microcycle = {sessions: [{blocks: [{quality, ...}]}]}
  function S6_antagonistBalance(microcycle) {
    if (!microcycle || !Array.isArray(microcycle.sessions))
      return [err('S6.invalid_microcycle', 'микроцикл без sessions')];
    const allBlocks = microcycle.sessions.reduce(function (acc, s) {
      return acc.concat(Array.isArray(s.blocks) ? s.blocks : []);
    }, []);
    const heavyPulls = allBlocks.filter(function (b) {
      return b && (b.quality === 'max_strength' || b.quality === 'finger_strength') &&
             (b.fatigueCost === 'high' || b.fatigueCost === 'max');
    });
    if (heavyPulls.length === 0) {
      return [ok('S6.na', 'S6 не применим: нет тяжёлых тяг')];
    }
    const hasAntagonist = allBlocks.some(function (b) {
      return b && b.quality === 'antagonist';
    });
    if (!hasAntagonist) {
      return [warn('S6.missing_antagonist',
        'в микроцикле тяжёлые тяги/висы без antagonist-блока',
        { heavyPullsCount: heavyPulls.length })];
    }
    return [ok('S6.pass', 'S6: антагонист присутствует')];
  }

  // ─── S7 — deload обязателен ──────────────────────────────────────────────────
  // METHODOLOGY ч.6.4/9.2, IMPLEMENTATION_MAP S7.
  // mesocycle = {weeks: [{isDeload: bool, ftl: number}]}
  function S7_deloadRequired(mesocycle) {
    if (!mesocycle || !Array.isArray(mesocycle.weeks))
      return [err('S7.invalid_mesocycle', 'мезоцикл без weeks')];
    if (mesocycle.weeks.length < 4) {
      return [ok('S7.na', 'S7 не применим: мезо <4 недель')];
    }
    const hasDeload = mesocycle.weeks.some(function (w) { return w && w.isDeload === true; });
    if (!hasDeload) {
      return [warn('S7.no_deload',
        'мезоцикл из ' + mesocycle.weeks.length + ' недель без разгрузочной',
        { weekCount: mesocycle.weeks.length })];
    }
    return [ok('S7.pass', 'S7: разгрузка присутствует')];
  }

  // ─── S8 — боль = стоп ─────────────────────────────────────────────────────────
  // METHODOLOGY ч.9.5, IMPLEMENTATION_MAP S8, Q-9-1 решено.
  // sessionLog = {painFlag: 'none'|'twinge'|'pain', painLocation?: string}
  function S8_painStop(sessionLog) {
    if (!sessionLog) return [err('S8.invalid_log', 'лог сессии не задан')];
    const flag = sessionLog.painFlag;
    if (flag === undefined || flag === null) {
      return [ok('S8.na', 'S8 не применим: флага боли нет в логе')];
    }
    if (flag === 'pain') {
      return [err('S8.pain_stop',
        'острая боль в логе — стоп прогрессии, переход в rehab',
        { painLocation: sessionLog.painLocation || null })];
    }
    if (flag === 'twinge') {
      return [warn('S8.twinge_advisory',
        'дискомфорт/потягивание — снизить интенсивность, наблюдать',
        { painLocation: sessionLog.painLocation || null })];
    }
    if (flag === 'none') {
      return [ok('S8.pass', 'S8: боли нет')];
    }
    return [err('S8.unknown_flag', 'painFlag не в {none,twinge,pain}', { flag: flag })];
  }

  // ─── V_blockHomogeneity (homed из «Заметки целостности») ──────────────────────
  // IMPLEMENTATION_MAP карточка 1.1 M2.
  function V_blockHomogeneity(block) {
    if (!block || !Array.isArray(block.exercises))
      return [err('V.block.invalid', 'блок без exercises')];
    if (block.exercises.length === 0)
      return [ok('V.block.empty', 'пустой блок, проверка пропущена', { blockId: block.id })];
    const qualities = new Set();
    const fatigueCosts = new Set();
    block.exercises.forEach(function (a) {
      qualities.add(a && a.quality);
      fatigueCosts.add(a && a.fatigueCost);
    });
    const issues = [];
    if (qualities.size > 1) {
      issues.push(warn('V.block.mixed_quality',
        'блок содержит атомы разных quality (' + Array.from(qualities).join(',') + ')',
        { blockId: block.id }));
    }
    if (fatigueCosts.size > 2) { // допускаем близкие, но не разлёт по 3+
      issues.push(warn('V.block.spread_fatigue',
        'разлёт fatigueCost > 2 категорий в блоке',
        { blockId: block.id }));
    }
    return issues.length ? issues : [ok('V.block.pass', 'блок однороден', { blockId: block.id })];
  }

  // ─── V_sessionOrder (homed) ──────────────────────────────────────────────────
  // METHODOLOGY ч.1.1, CONSTRUCTOR_SPEC §1.4: power→max-strength→endurance→antagonist/mobility.
  const SESSION_QUALITY_RANK = {
    power: 0, max_strength: 1, finger_strength: 1,
    anaerobic_capacity: 2, aerobic_base: 3,
    technique: 4, antagonist: 5, mobility: 5, mental: 5
  };
  function V_sessionOrder(session) {
    if (!session || !Array.isArray(session.blocks))
      return [err('V.order.invalid', 'сессия без blocks')];
    const ranked = session.blocks.map(function (b, i) {
      return { idx: i, quality: b && b.quality, rank: SESSION_QUALITY_RANK[b && b.quality] };
    }).filter(function (r) { return typeof r.rank === 'number'; });
    for (let i = 1; i < ranked.length; i++) {
      if (ranked[i].rank < ranked[i - 1].rank) {
        return [warn('V.order.reverse',
          'блок "' + ranked[i].quality + '" после "' + ranked[i - 1].quality +
          '" — порядок нарушен (свежие качества должны быть раньше)',
          { atIndex: ranked[i].idx })];
      }
    }
    return [ok('V.order.pass', 'порядок блоков корректен')];
  }

  // ─── V_energySystemSequence (homed: «инвариант 6.3 для ВСЕХ моделей») ────────
  // METHODOLOGY ч.6.3: сила→ёмкость→аэробика для linear/nonlinear/DUP.
  function V_energySystemSequence(mesocycle) {
    if (!mesocycle || !Array.isArray(mesocycle.weeks))
      return [err('V.es_seq.invalid', 'мезо без weeks')];
    // упрощение Phase 1: проверяем primary focus каждой недели.
    // ожидаемый порядок: phosphagen → glycolytic → aerobic (или их подмножество).
    const ES_RANK = { phosphagen: 0, glycolytic: 1, aerobic: 2 };
    const ranks = mesocycle.weeks.map(function (w) {
      return typeof ES_RANK[w && w.primaryEnergySystem] === 'number'
        ? ES_RANK[w.primaryEnergySystem] : null;
    }).filter(function (r) { return r !== null; });
    if (ranks.length < 2) {
      return [ok('V.es_seq.insufficient', 'недостаточно данных primaryEnergySystem')];
    }
    for (let i = 1; i < ranks.length; i++) {
      if (ranks[i] < ranks[i - 1]) {
        return [warn('V.es_seq.reverse',
          'ёмкостная фаза раньше силовой базы — инвариант 6.3 нарушен')];
      }
    }
    return [ok('V.es_seq.pass', 'порядок энергосистем корректен')];
  }

  // ─── V_skillBalance (homed: 1.5 кэп «железо не вытесняет лазание») ───────────
  // CONSTRUCTOR_SPEC §3.8 skillAllocation по уровню (упрощённо).
  const SKILL_FRACTION_BY_LEVEL = {
    beginner: 0.70, intermediate: 0.50, advanced: 0.40, elite: 0.35
  };
  function V_skillBalance(week, level) {
    if (!week || !Array.isArray(week.sessions))
      return [err('V.skill.invalid', 'неделя без sessions')];
    const target = SKILL_FRACTION_BY_LEVEL[level];
    if (typeof target !== 'number') {
      return [err('V.skill.level_unknown', 'уровень не в enum для skill-доли')];
    }
    const allBlocks = week.sessions.reduce(function (acc, s) {
      return acc.concat(Array.isArray(s.blocks) ? s.blocks : []);
    }, []);
    if (allBlocks.length === 0) {
      return [ok('V.skill.empty_week', 'нет блоков в неделе')];
    }
    const skillCount = allBlocks.filter(function (b) {
      return b && (b.quality === 'technique' || b.modality === 'wall');
    }).length;
    const skillFraction = skillCount / allBlocks.length;
    if (skillFraction < target - 0.10) {
      return [warn('V.skill.under_skill',
        'доля навыка ' + (skillFraction * 100).toFixed(0) + '% < целевой ' +
        (target * 100).toFixed(0) + '% для ' + level,
        { skillFraction: skillFraction, target: target })];
    }
    return [ok('V.skill.pass', 'баланс навык/железо в норме', { skillFraction: skillFraction })];
  }

  // ─── runAll — оркестратор для типичного contextset ────────────────────────────
  // Запускает применимые валидаторы по входу. Возвращает плоский массив Issue[].
  function runAll(input, profile, history) {
    const all = [];
    if (input && input.atom) {
      all.push.apply(all, S1_ageLevelGate(input.atom, profile));
      all.push.apply(all, S5_openhandFirst(input.atom, profile));
      all.push.apply(all, S2_tissueFreshness(input.atom, history, input.now));
    }
    if (input && input.session) {
      all.push.apply(all, S3_warmupRequired(input.session));
      all.push.apply(all, V_sessionOrder(input.session));
    }
    if (input && input.block) {
      all.push.apply(all, V_blockHomogeneity(input.block));
    }
    if (input && input.microcycle) {
      all.push.apply(all, S6_antagonistBalance(input.microcycle));
    }
    if (input && input.mesocycle) {
      all.push.apply(all, S7_deloadRequired(input.mesocycle));
      all.push.apply(all, V_energySystemSequence(input.mesocycle));
    }
    if (input && input.week && profile) {
      all.push.apply(all, V_skillBalance(input.week, profile.level));
    }
    if (input && input.ftl && typeof input.ftl.week === 'number') {
      all.push.apply(all, S4_progressionCap(input.ftl.week, input.ftl.trailingAvg));
    }
    if (input && input.sessionLog) {
      all.push.apply(all, S8_painStop(input.sessionLog));
    }
    return all;
  }

  Fingers.validators = {
    S1_ageLevelGate: S1_ageLevelGate,
    S2_tissueFreshness: S2_tissueFreshness,
    S3_warmupRequired: S3_warmupRequired,
    S4_progressionCap: S4_progressionCap,
    S5_openhandFirst: S5_openhandFirst,
    S6_antagonistBalance: S6_antagonistBalance,
    S7_deloadRequired: S7_deloadRequired,
    S8_painStop: S8_painStop,
    V_blockHomogeneity: V_blockHomogeneity,
    V_sessionOrder: V_sessionOrder,
    V_energySystemSequence: V_energySystemSequence,
    V_skillBalance: V_skillBalance,
    runAll: runAll
  };

})(typeof window !== 'undefined' ? window : globalThis);
