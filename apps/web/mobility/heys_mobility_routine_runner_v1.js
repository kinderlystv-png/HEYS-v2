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

  function doseOf(atom) { return (atom && atom.dose) || {}; }
  function repsLabel(reps) {
    return Array.isArray(reps) ? reps[0] + '-' + reps[1] : String(reps || 1);
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
  function materializeAtom(atom) {
    if (!atom || typeof atom !== 'object') return [];
    const d = doseOf(atom);
    switch (atom.doseShape) {
      case 'raise':
        return [step(atom, 'timer', { label: 'разогрев', durationSec: d.durationSec, instruction: 'плавно подними температуру и пульс' })];
      case 'dynamic':
      case 'activation':
        return [step(atom, 'reps', { label: 'повторы', reps: d.reps, sets: d.sets || 1, instruction: repsLabel(d.reps) + ' повторов, темп ' + (d.tempo || 'controlled') })];
      case 'flow':
        return [step(atom, 'flow', { label: 'flow', durationSec: d.durationSec || null, rounds: d.rounds || null, sequence: d.sequence || [], instruction: 'контролируемый поток без форсирования конца диапазона' })];
      case 'hold':
        return [step(atom, 'hold', { label: 'удержание', durationSec: d.holdSec, reps: d.reps || 1, sets: d.sets || 1, instruction: d.intensity === 'develop' ? 'натяжение без боли' : 'комфортное расслабление' })];
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
      case 'eccentric':
        return [step(atom, 'eccentric_reps', { label: 'эксцентрика', reps: d.reps, sets: d.sets || 1, tempoEccSec: d.tempoEccSec, instruction: 'медленная уступающая фаза' })];
      case 'cars':
        return [step(atom, 'cars', { label: 'CARs', reps: d.reps, instruction: 'медленно, активно, без боли' })];
      case 'smr':
        return [step(atom, 'smr', { label: 'самомассаж', durationSec: d.durationSec, sets: d.sets || 1, target: d.target, instruction: 'не работать по кости, нерву или острой травме' })];
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
    blocks.forEach(function (b) {
      (Array.isArray(b.atoms) ? b.atoms : []).forEach(function (a) {
        materializeAtom(a).forEach(function (s) {
          steps.push(Object.assign({ blockId: b.id, mode: session.mode }, s));
        });
      });
    });
    return {
      sessionMode: session && session.mode,
      totalSteps: steps.length,
      steps: steps,
      estimatedDurationSec: steps.reduce(function (sum, s) {
        return sum + (Number(s.durationSec) || 0) * (Number(s.sets) || 1) * (Number(s.reps) && s.kind === 'hold' ? Number(s.reps) : 1);
      }, 0)
    };
  }
  function createState(plan) {
    return { status: 'idle', index: 0, totalSteps: (plan && plan.steps && plan.steps.length) || 0, aborted: false };
  }
  function transition(state, event) {
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
