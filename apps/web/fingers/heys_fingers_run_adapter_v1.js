// heys_fingers_run_adapter_v1.js — адаптер exercises[] → общий RunPlan-контракт.
//
// Этап 5 унификации запуска: оба домена строят исполнение через единый
// kernel-контракт RunPlan {steps:[{kind,durationSec,reps,sets,meta}],totalSteps,
// estimatedDurationSec}. Мобильность уже отдаёт его из routineRunner.buildRunPlan;
// здесь — fingers-сторона: плоский exercises[] (выход mixEngine.recommendDay)
// материализуется в шаги через общий HEYS.TrainingKernel.runner.buildRunPlanFromAtoms.
//
// Важно: это слой ДАННЫХ (roadmap / оценка времени / консистентность с
// persistence), а не рендер-движок. Рендер пальцев остаётся exercise-центричным
// (ExerciseRunner диспатчит по doseShape: вис со внутрисетовым HANG/REST-циклом
// фундаментально отличается от линейных mobility-шагов — это домен-оправдано).

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.runAdapter && Fingers.runAdapter.__registered) return;

  // doseShape → step.kind. Без shape — это классический вис (hang).
  const KIND_MAP = {
    reps: 'reps',
    continuous: 'timer',
    attempts: 'attempts',
    circuit: 'circuit',
    process: 'process'
  };

  function fingersKind(shape) {
    if (!shape) return 'hang';
    return KIND_MAP[shape] || shape;
  }

  function materializeExercise(ex) {
    if (!ex || typeof ex !== 'object') return [];
    const kind = fingersKind(ex.doseShape);
    return [{
      kind: kind,
      durationSec: Number(ex.hangSec || ex.durationSec || ex.holdSec || 0) || null,
      reps: ex.repsPerSet != null ? ex.repsPerSet : (ex.reps != null ? ex.reps : null),
      sets: Number(ex.setsCount || ex.sets) || 1,
      label: ex.label || ex.gripLabel || ex.gripId || kind,
      instruction: ex.instruction || '',
      meta: {
        gripId: ex.gripId || null,
        edgeSizeMm: ex.edgeSizeMm != null ? ex.edgeSizeMm : null,
        addedWeightKg: ex.addedWeightKg != null ? ex.addedWeightKg : null,
        role: ex.__role || null
      }
    }];
  }

  // Оценка времени: для виса работа = hangSec × repsPerSet × setsCount; для
  // прочих kind — durationSec × sets (rest-интервалы здесь не учитываем — это
  // грубая оценка плана, точный тайминг ведёт useTimerCore по фазам).
  function planMultiplier(step) {
    const reps = Array.isArray(step.reps) ? (Number(step.reps[0]) || 1) : (Number(step.reps) || 1);
    return (Number(step.sets) || 1) * (step.kind === 'hang' ? reps : 1);
  }

  function buildFingersRunPlan(recommendation) {
    const rec = recommendation || {};
    const exercises = Array.isArray(rec.exercises) ? rec.exercises : [];
    const kr = HEYS.TrainingKernel && HEYS.TrainingKernel.runner;
    if (!kr || typeof kr.buildRunPlanFromAtoms !== 'function') {
      // Fallback без ядра — минимальный RunPlan-shape, чтобы вызов не падал.
      const steps = [];
      exercises.forEach(function (ex) { materializeExercise(ex).forEach(function (s) { steps.push(s); }); });
      return { sessionMode: rec.id || 'fingers_mix', totalSteps: steps.length, steps: steps, estimatedDurationSec: 0 };
    }
    return kr.buildRunPlanFromAtoms(exercises, {
      sessionMode: rec.id || rec.__engine || 'fingers_mix',
      materializeFn: materializeExercise,
      multiplier: planMultiplier
    });
  }

  Fingers.runAdapter = {
    __registered: true,
    buildFingersRunPlan: buildFingersRunPlan,
    materializeExercise: materializeExercise,
    kindForDoseShape: fingersKind
  };
})(typeof window !== 'undefined' ? window : globalThis);
