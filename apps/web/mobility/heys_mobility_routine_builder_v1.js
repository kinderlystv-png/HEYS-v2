// heys_mobility_routine_builder_v1.js — гибридная сборка сессии мобильности.
//
// Вход: mode_engine mode + профиль + ручные правки. Выход: Session с блоками,
// trace и safety issues. Builder всегда гоняет сначала runSession, затем runAtom.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__routineBuilderRegistered) return;
  Mobility.__routineBuilderRegistered = true;

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function uniq(arr) {
    const seen = {};
    return (arr || []).filter(function (x) {
      if (!x || seen[x]) return false;
      seen[x] = true;
      return true;
    });
  }
  function hasIssueLevel(issues, level) {
    return (issues || []).some(function (i) { return i && i.level === level; });
  }
  function blocksAutopick(issue) {
    return issue && (issue.level === 'error' || issue.code === 'E.equipment_missing');
  }
  function isHighTissueAtom(atom) {
    return !!atom && (atom.fatigueCost === 'high' || atom.tissueLoad === 'high');
  }
  function atomAllowedByMode(atom, mode) {
    if (!atom || !mode) return false;
    if (atom.autonomic !== 'neutral' && atom.autonomic !== mode.autonomic) return false;
    if (mode.id === 'develop_mobility') return atom.purpose === 'develop';
    if (mode.id === 'evening_relax') return atom.purpose === 'regulate' || atom.purpose === 'recover';
    if (mode.id === 'post_workout') return atom.purpose === 'recover' || atom.autonomic === 'relax';
    if (mode.id === 'rehab') return atom.purpose === 'recover' || atom.doseShape === 'cars';
    return atom.purpose === mode.purpose || atom.doseShape === 'cars';
  }
  function scoreAtom(atom, slot, mode, options) {
    let score = 0;
    const blockWeights = options.blockWeights || {};
    if (blockWeights[atom.block]) score += Number(blockWeights[atom.block]) * 20;
    const focus = options.populationFocus || {};
    if (focus.preferredAtomIds && focus.preferredAtomIds.indexOf(atom.id) >= 0) {
      score += 50 + (focus.preferredAtomIds.length - focus.preferredAtomIds.indexOf(atom.id)) * 20;
    }
    if (focus.preferredJointRegions && focus.preferredJointRegions.indexOf(atom.jointRegion) >= 0) score += 14;
    if (focus.preferredAxes && focus.preferredAxes.indexOf(atom.axis) >= 0) score += 12;
    if (focus.preferredBlocks && focus.preferredBlocks.indexOf(atom.block) >= 0) score += 10;
    if (focus.avoidHighLoad && (atom.fatigueCost === 'high' || atom.tissueLoad === 'high')) score -= 30;
    const preferred = options.preferredAtomIds || [];
    if (preferred.indexOf(atom.id) >= 0) score += 100;
    if (slot.atomIds && slot.atomIds.indexOf(atom.id) >= 0) score += 80 + (slot.atomIds.length - slot.atomIds.indexOf(atom.id));
    if (atom.autonomic === mode.autonomic) score += 12;
    if (atom.purpose === mode.purpose) score += 8;
    if (atom.timeOfDayPref && atom.timeOfDayPref === (options.timeOfDay || mode.timeOfDay)) score += 5;
    if (atom.doseConfidence === 'A') score += 3;
    if (atom.doseConfidence === 'B') score += 2;
    return score;
  }
  function blockMeta(slot, atom) {
    return {
      id: slot.id,
      name: slot.id,
      axis: atom.axis,
      purpose: atom.purpose,
      autonomic: atom.autonomic,
      fatigueCost: atom.fatigueCost || 'low',
      tissueLoad: atom.tissueLoad || 'low',
      atoms: [atom]
    };
  }
  function getDeps() {
    return {
      cat: Mobility.atomCatalog,
      validators: Mobility.validators,
      modeEngine: Mobility.modeEngine
    };
  }
  function validateDeps() {
    const d = getDeps();
    if (!d.cat || !d.validators || !d.modeEngine) {
      throw new Error('HEYS.Mobility atomCatalog/validators/modeEngine должны быть загружены до routineBuilder');
    }
    return d;
  }
  function assessmentAuditFromOptions(opts) {
    if (opts.assessmentAudit && typeof opts.assessmentAudit === 'object') return opts.assessmentAudit;
    if (Array.isArray(opts.screens) && Mobility.assessment && typeof Mobility.assessment.limiterAudit === 'function') {
      return Mobility.assessment.limiterAudit(opts.screens);
    }
    return null;
  }
  function mergeBlockWeights(opts, audit) {
    return Object.assign({}, (audit && audit.blockWeights) || {}, opts.blockWeights || {});
  }
  function populationFocus(profile) {
    const pops = profile && Array.isArray(profile.populations) ? profile.populations : [];
    const focus = { preferredAtomIds: [], preferredJointRegions: [], preferredAxes: [], preferredBlocks: [], reasons: [], avoidHighLoad: false };
    if (pops.indexOf('desk') >= 0) {
      focus.preferredAtomIds.push('recov_movement_snack', 'mob_dynamic_thoracic_openbook', 'mob_dynamic_legswing_hip', 'joint_cars_spine');
      focus.preferredJointRegions.push('thoracic', 'hip');
      focus.reasons.push('population_desk_thoracic_hip');
    }
    if (pops.indexOf('hypermobile') >= 0) {
      focus.preferredAxes.push('motor_control', 'joint_stability');
      focus.preferredBlocks.push('F', 'G');
      focus.reasons.push('population_hypermobile_stability');
    }
    if (pops.indexOf('older') >= 0 || pops.indexOf('pregnancy') >= 0) {
      focus.avoidHighLoad = true;
      focus.reasons.push(pops.indexOf('pregnancy') >= 0 ? 'population_pregnancy_low_load' : 'population_older_low_load');
    }
    return focus;
  }
  function applyBlockPriority(blocks, blockWeights, trace) {
    const weights = blockWeights || {};
    if (!Object.keys(weights).length) return blocks;
    const indexed = blocks.map(function (b, idx) { return { block: b, idx: idx, weight: Number(weights[b.axis]) || Number(weights[b.atoms[0].block]) || Number(weights[b.id]) || Number(weights[b.block]) || 0 }; });
    indexed.sort(function (a, b) { return b.weight - a.weight || a.idx - b.idx; });
    const reordered = indexed.map(function (x) { return x.block; });
    const changed = reordered.some(function (b, idx) { return b !== blocks[idx]; });
    if (changed && trace) {
      trace.push({
        slot: 'assessment_priority',
        reason: 'limiter_block_weights',
        blockWeights: weights,
        order: reordered.map(function (b) { return b.id; })
      });
    }
    return reordered;
  }
  function candidateAtoms(slot, mode, profile, context, options) {
    const d = getDeps();
    const excluded = options.excludeAtomIds || options.removeAtomIds || [];
    let atoms = d.cat.byBlock(slot.block);
    if (slot.atomIds && slot.atomIds.length) {
      atoms = slot.atomIds.map(function (id) { return d.cat.getAtom(id); }).filter(Boolean);
    }
    return atoms
      .filter(function (a) { return excluded.indexOf(a.id) < 0; })
      .filter(function (a) { return atomAllowedByMode(a, mode); })
      .filter(function (a) { return !(context && context.avoidHighTissueLoad && isHighTissueAtom(a)); })
      .map(function (a) {
        const issues = d.validators.runAtom(a, profile, context);
        return { atom: a, issues: issues, score: scoreAtom(a, slot, mode, options) };
      })
      .filter(function (x) { return !x.issues.some(blocksAutopick); })
      .sort(function (a, b) { return b.score - a.score || a.atom.id.localeCompare(b.atom.id); });
  }
  function pickSlot(slot, mode, profile, context, options) {
    const candidates = candidateAtoms(slot, mode, profile, context, options);
    if (!candidates.length) {
      return {
        block: null,
        trace: { slot: slot.id, block: slot.block, picked: null, optional: !!slot.optional, reason: 'no_safe_candidate' }
      };
    }
    const picked = clone(candidates[0].atom);
    return {
      block: blockMeta(slot, picked),
      trace: {
        slot: slot.id,
        block: slot.block,
        picked: picked.id,
        candidateCount: candidates.length,
        filteredWarnings: candidates[0].issues.filter(function (i) { return i.level === 'warn'; }).map(function (i) { return i.code; })
      }
    };
  }
  function applyReplacements(blocks, mode, profile, context, options) {
    const d = getDeps();
    const replaceAtoms = options.replaceAtoms || {};
    return blocks.map(function (b) {
      const wanted = replaceAtoms[b.id] || replaceAtoms[b.atoms[0].id];
      if (!wanted) return b;
      const atom = d.cat.getAtom(wanted);
      if (!atom || !atomAllowedByMode(atom, mode)) return b;
      if (context && context.avoidHighTissueLoad && isHighTissueAtom(atom)) return b;
      const issues = d.validators.runAtom(atom, profile, context);
      if (issues.some(blocksAutopick)) return b;
      return blockMeta({ id: b.id, block: atom.block }, clone(atom));
    });
  }
  function appendExtraAtoms(blocks, mode, profile, context, options, trace) {
    const d = getDeps();
    (options.extraAtomIds || []).forEach(function (id) {
      const atom = d.cat.getAtom(id);
      if (!atom) {
        trace.push({ slot: 'extra', picked: id, reason: 'missing_atom' });
        return;
      }
      const issues = d.validators.runAtom(atom, profile, context);
      if (issues.some(blocksAutopick)) {
        trace.push({ slot: 'extra', picked: id, reason: 'blocked_by_safety', issueCodes: issues.map(function (i) { return i.code; }) });
        return;
      }
      if (!atomAllowedByMode(atom, mode)) {
        trace.push({ slot: 'extra', picked: id, reason: 'incompatible_with_mode' });
        return;
      }
      if (context && context.avoidHighTissueLoad && isHighTissueAtom(atom)) {
        trace.push({ slot: 'extra', picked: id, reason: 'blocked_by_periodization', periodization: context.periodization });
        return;
      }
      blocks.push(blockMeta({ id: 'extra_' + id, block: atom.block }, clone(atom)));
      trace.push({ slot: 'extra', picked: id, reason: 'manual_extra' });
    });
  }
  function buildSession(modeId, profile, options) {
    const d = validateDeps();
    const opts = options || {};
    const mode = typeof modeId === 'string' ? d.modeEngine.getMode(modeId) : clone(modeId || {});
    if (!mode || !mode.id) {
      return { ok: false, errors: [{ level: 'error', code: 'mode.unknown', msg: 'неизвестный режим' }], session: null, trace: [] };
    }
    const context = d.modeEngine.buildContext(mode, opts);
    const assessmentAudit = assessmentAuditFromOptions(opts);
    const blockWeights = mergeBlockWeights(opts, assessmentAudit);
    const popFocus = populationFocus(profile);
    const pickerOptions = Object.assign({}, opts, { blockWeights: blockWeights, populationFocus: popFocus });
    const trace = [];
    let blocks = [];

    mode.slots.forEach(function (slot) {
      const picked = pickSlot(slot, mode, profile, context, pickerOptions);
      trace.push(picked.trace);
      if (picked.block) blocks.push(picked.block);
    });
    blocks = applyReplacements(blocks, mode, profile, context, pickerOptions);
    appendExtraAtoms(blocks, mode, profile, context, pickerOptions, trace);
    blocks = applyBlockPriority(blocks, blockWeights, trace);

    const session = {
      date: opts.date || null,
      mode: mode.id,
      purpose: mode.purpose,
      autonomic: mode.autonomic,
      timeOfDay: context.timeOfDay,
      beforePower: context.beforePower,
      warmupCompleted: context.warmupCompleted,
      blocks: blocks,
      painFlags: context.painFlags,
      reasons: uniq((mode.reasons || []).concat(popFocus.reasons || []).concat(context.circadian ? [context.circadian.reason] : [])),
      advisories: [context.coldWater].filter(Boolean),
      periodization: context.periodization,
      assessment: assessmentAudit ? {
        leadingLimiter: assessmentAudit.leadingLimiter || null,
        blockWeights: blockWeights
      } : null
    };

    const sessionIssues = d.validators.runSession(session, profile, context);
    const atomIssues = [];
    blocks.forEach(function (b) {
      b.atoms.forEach(function (a) {
        d.validators.runAtom(a, profile, context).forEach(function (issue) {
          atomIssues.push(Object.assign({ blockId: b.id }, issue));
        });
      });
    });
    const issues = sessionIssues.concat(atomIssues);
    return {
      ok: !hasIssueLevel(issues, 'error'),
      session: session,
      issues: issues,
      trace: trace,
      context: context
    };
  }

  Mobility.routineBuilder = {
    __registered: true,
    buildSession: buildSession,
    _atomAllowedByMode: atomAllowedByMode,
    _isHighTissueAtom: isHighTissueAtom
  };
})(typeof window !== 'undefined' ? window : globalThis);
