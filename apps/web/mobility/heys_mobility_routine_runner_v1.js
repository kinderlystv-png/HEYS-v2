// heys_mobility_routine_runner_v1.js — materializer исполняемых шагов.
//
// Это runner-core без UI: атомы каталога превращаются в шаги hold/reps/PNF/SMR/
// breath. Таймер/экран могут читать этот план и вести lifecycle отдельно.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__routineRunnerRegistered) return;
  Mobility.__routineRunnerRegistered = true;

  function kernelRunner() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.runner;
  }
  function doseOf(atom) { return (atom && atom.dose) || {}; }
  const DEFAULT_PREP_SEC = 10;
  const DEFAULT_REST_SEC = 20;

  function num(value, fallback) {
    const n = Number(value);
    return isFinite(n) && n > 0 ? n : fallback;
  }
  function targetReps(reps, fallback) {
    if (Array.isArray(reps) && reps.length) {
      const values = reps.map(function (v) { return Number(v); }).filter(function (v) { return isFinite(v) && v > 0; });
      if (values.length) return Math.round(values.reduce(function (sum, v) { return sum + v; }, 0) / values.length);
    }
    return num(reps, fallback || 1);
  }
  function prepSec(dose) {
    return dose.prepSec === 0 ? 0 : num(dose.prepSec, DEFAULT_PREP_SEC);
  }
  function repSec(atom, dose) {
    if (dose.repSec) return num(dose.repSec, 4);
    if (dose.tempoEccSec) return num(dose.tempoEccSec, 4) + 2;
    const tempo = String(dose.tempo || '').toLowerCase();
    if (tempo === 'slow') return 5;
    if (tempo === 'ballistic') return 2;
    if (atom && atom.doseShape === 'cars') return 6;
    if (atom && atom.doseShape === 'activation') return 4;
    return 4;
  }
  function restSec(atom, dose) {
    if (dose.restSec != null) return Math.max(0, Math.round(Number(dose.restSec) || 0));
    if (!atom) return DEFAULT_REST_SEC;
    let base = DEFAULT_REST_SEC;
    if (atom.doseShape === 'dynamic' || atom.doseShape === 'cars') base = 15;
    else if (atom.doseShape === 'activation' || atom.doseShape === 'eccentric') base = 30;
    if (Mobility.loadScale && atom.loadLevel != null && Mobility.loadScale.getLevel) {
      const policy = Mobility.loadScale.getLevel(atom.loadLevel);
      const mult = Number(policy.restMultiplier) || 1;
      return Math.max(0, Math.round((base * mult) / 5) * 5);
    }
    return base;
  }
  function withLoadDose(atom, options) {
    const opts = options || {};
    if (!atom || !Mobility.loadScale || typeof Mobility.loadScale.tuneDose !== 'function') return atom;
    const loadLevel = opts.loadLevel != null ? opts.loadLevel : 3;
    return Object.assign({}, atom, {
      dose: Mobility.loadScale.tuneDose(atom, loadLevel),
      loadLevel: Mobility.loadScale.normalize ? Mobility.loadScale.normalize(loadLevel) : loadLevel
    });
  }
  function step(atom, kind, over) {
    return Object.assign({
      atomId: atom.id,
      jointRegion: atom.jointRegion || null,
      kind: kind,
      label: kind,
      durationSec: null,
      reps: null,
      instruction: ''
    }, over || {});
  }
  function setPhases(atom, workKind, workOver, opts) {
    const o = opts || {};
    const d = doseOf(atom);
    const sets = Math.max(1, Math.round(num(o.sets != null ? o.sets : d.sets, 1)));
    const rest = restSec(atom, d);
    const prep = prepSec(d);
    const out = [];
    for (let setIdx = 1; setIdx <= sets; setIdx++) {
      if (prep) {
        out.push(step(atom, 'prep', {
          label: 'подготовка',
          durationSec: prep,
          set: setIdx,
          sets: sets,
          instruction: 'займи позицию, проверь дыхание и отсутствие боли'
        }));
      }
      out.push(step(atom, workKind, Object.assign({
        set: setIdx,
        sets: sets
      }, workOver || {})));
      if (setIdx < sets && rest) {
        out.push(step(atom, 'rest', {
          label: 'отдых',
          durationSec: rest,
          set: setIdx,
          sets: sets,
          instruction: 'сохрани лёгкое дыхание, подготовь следующий подход'
        }));
      }
    }
    return out;
  }
  function materializeAtom(atom, options) {
    if (!atom || typeof atom !== 'object') return [];
    atom = withLoadDose(atom, options);
    const d = doseOf(atom);
    switch (atom.doseShape) {
      case 'raise':
        return [step(atom, 'timer', { label: 'разогрев', durationSec: d.durationSec, instruction: 'плавно подними температуру и пульс' })];
      case 'dynamic':
      case 'activation': {
        const reps = targetReps(d.reps, 8);
        const secondsPerRep = repSec(atom, d);
        return setPhases(atom, 'reps_work', {
          label: 'работа',
          durationSec: reps * secondsPerRep,
          reps: reps,
          secondsPerRep: secondsPerRep,
          instruction: reps + ' повторов, примерно ' + secondsPerRep + ' сек на повтор'
        });
      }
      case 'flow':
        return [step(atom, 'flow', { label: 'flow', durationSec: d.durationSec || null, rounds: d.rounds || null, sequence: d.sequence || [], instruction: 'контролируемый поток без форсирования конца диапазона' })];
      case 'hold':
        {
          const reps = targetReps(d.reps, 1);
          const holdSec = Number(d.holdSec) || 0;
          const label = reps > 1 ? reps + ' удержания по ' + holdSec + ' сек' : holdSec + ' сек удержание';
          return setPhases(atom, 'hold', {
            label: 'удержание',
            durationSec: holdSec * reps,
            reps: reps,
            instruction: d.intensity === 'develop' ? 'натяжение без боли: ' + label : 'комфортное расслабление: ' + label
          });
        }
      case 'pnf': {
        const out = [];
        const reps = Number(d.reps) || 1;
        for (let i = 0; i < reps; i++) {
          out.push(step(atom, 'pnf_contract', { label: 'PNF напряжение', durationSec: d.contractSec, round: i + 1, instruction: 'субмаксимально, без задержки дыхания' }));
          out.push(step(atom, 'pnf_relax', { label: 'PNF расслабление', durationSec: d.relaxSec, round: i + 1, instruction: 'сбрось напряжение' }));
          out.push(step(atom, 'pnf_hold', { label: 'PNF удержание', durationSec: d.holdSec, round: i + 1, instruction: 'мягко занять новый диапазон' }));
        }
        return out;
      }
      case 'eccentric': {
        const reps = targetReps(d.reps, 6);
        const secondsPerRep = repSec(atom, d);
        return setPhases(atom, 'eccentric_reps', {
          label: 'эксцентрика',
          durationSec: reps * secondsPerRep,
          reps: reps,
          secondsPerRep: secondsPerRep,
          tempoEccSec: d.tempoEccSec,
          instruction: reps + ' повторов, медленная уступающая фаза'
        });
      }
      case 'cars': {
        const reps = targetReps(d.reps, 2);
        const secondsPerRep = repSec(atom, d);
        return setPhases(atom, 'cars', {
          label: 'CARs',
          durationSec: reps * secondsPerRep,
          reps: reps,
          secondsPerRep: secondsPerRep,
          instruction: reps + ' контролируемых круга без боли'
        }, { sets: d.sets || 1 });
      }
      case 'smr':
        return setPhases(atom, 'smr', {
          label: 'самомассаж',
          durationSec: d.durationSec,
          target: d.target,
          instruction: 'не работать по кости, нерву или острой травме'
        });
      case 'breath':
        if (!Mobility.breathRunner) return [step(atom, 'breath', { label: 'дыхание', durationSec: d.durationSec, instruction: 'дыхательный блок' })];
        return [step(atom, 'breath', { label: 'дыхание', durationSec: d.durationSec, breath: Mobility.breathRunner.buildBreathPlan(atom), instruction: 'следуй фазам дыхания' })];
      case 'active_rec':
        return [step(atom, 'active_recovery', { label: 'активное восстановление', durationSec: d.durationSec, instruction: 'лёгкое движение без накопления усталости' })];
      default:
        return [step(atom, 'unknown', { label: 'неизвестный атом', instruction: 'нет runner-схемы для doseShape=' + atom.doseShape })];
    }
  }
  function buildRunPlan(session) {
    const blocks = (session && Array.isArray(session.blocks)) ? session.blocks : [];
    const steps = [];
    const loadLevel = session && session.loadLevel != null ? session.loadLevel : 3;
    blocks.forEach(function (b) {
      (Array.isArray(b.atoms) ? b.atoms : []).forEach(function (a) {
        materializeAtom(a, { loadLevel: loadLevel }).forEach(function (s) {
          steps.push(Object.assign({ blockId: b.id, slotId: b.slotId || b.id, mode: session.mode }, s));
        });
      });
    });
    const kr = kernelRunner();
    if (kr && typeof kr.createRunPlan === 'function') {
      return kr.createRunPlan(session, steps, {
        multiplier: function () { return 1; }
      });
    }
    return {
      sessionMode: session && session.mode,
      totalSteps: steps.length,
      steps: steps,
      estimatedDurationSec: steps.reduce(function (sum, s) {
        return sum + (Number(s.durationSec) || 0);
      }, 0)
    };
  }
  function createState(plan) {
    const kr = kernelRunner();
    if (kr && kr.createLinearState) return kr.createLinearState(plan);
    return { status: 'idle', index: 0, totalSteps: (plan && plan.steps && plan.steps.length) || 0, aborted: false };
  }
  function transition(state, event) {
    const kr = kernelRunner();
    if (kr && kr.transitionLinear) return kr.transitionLinear(state, event);
    const s = Object.assign({}, state || createState());
    if (event === 'start') s.status = 'running';
    if (event === 'pause' && s.status === 'running') s.status = 'paused';
    if (event === 'resume' && s.status === 'paused') s.status = 'running';
    if (event === 'next') s.index = Math.min(s.index + 1, Math.max(0, s.totalSteps - 1));
    if (event === 'complete') s.status = 'complete';
    if (event === 'abort') { s.status = 'aborted'; s.aborted = true; }
    return s;
  }

  Mobility.routineRunner = {
    __registered: true,
    materializeAtom: materializeAtom,
    buildRunPlan: buildRunPlan,
    createState: createState,
    transition: transition
  };
})(typeof window !== 'undefined' ? window : globalThis);
