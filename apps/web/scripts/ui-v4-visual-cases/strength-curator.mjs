// Стенды зоны strength-builder, часть «правки куратора, карточка упражнения,
// возврат в сессию» — кадры Л1–Л12, М1–М3, М7—М8 канваса strength-builder.
//
// Экран поднимают настоящие компоненты продукта (HEYS.StrengthBuilder,
// HEYS.StrengthBuilderParts, HEYS.StrengthCatalogUI) на живой странице
// приложения: подменяются только данные сервера (предложение куратора, журнал
// дня, профиль) и часы. Своей разметки с классами продукта стенд не рисует.
//
// Ветка исполнения — общая `demo-strength-zone` в ui-v4-visual-capture.mjs
// (`sbReady` / `sbSetup` / `sbSteps`), своей ветки этот файл не заводит.

const CANVAS = 'strength-builder.v4.dc.html';
const NOW_ISO = '2026-08-10T20:51:00+03:00';

/**
 * Монтаж кейса. Функция уходит в браузер исходником, поэтому замыканий не
 * имеет: сценарий, хост и часы приходят аргументом.
 */
function mountStrengthCuratorCase(payload) {
  const scenario = payload.scenario;
  const hostId = payload.hostId;
  const nowIso = payload.nowIso;
  if (payload.themeId && window.HEYS && window.HEYS.Theme && window.HEYS.Theme.setThemeId) {
    window.HEYS.Theme.setThemeId(payload.themeId);
  }
  const nowMs = Date.parse(nowIso);
  window.Date.now = function () { return nowMs; };

  const HEYS = window.HEYS;
  const Parts = HEYS.StrengthBuilderParts || {};
  const Builder = HEYS.StrengthBuilder || {};
  const Cat = HEYS.StrengthCatalogUI || {};
  const h = window.React.createElement;

  let seq = 0;
  const at = function (hhmm) {
    const base = new Date(nowMs);
    const parts = String(hhmm).split(':');
    base.setHours(+parts[0], +parts[1], 0, 0);
    return base.getTime();
  };
  const ap = function (weightKg, reps, done) {
    seq += 1;
    return { id: 'ap-' + seq, weightKg: String(weightKg), reps: reps, done: !!done };
  };
  const ex = function (id, name, list) {
    return { id: id, name: name, unit: 'weight_reps', approaches: list };
  };
  const sets = function (count, weightKg, reps, doneCount) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(ap(weightKg, reps, i < (doneCount || 0)));
    return out;
  };

  // Один и тот же план дня во всех кадрах правки: «Верх тела B», семь
  // упражнений, 23 подхода — числа кадров Л1 и Л2.
  const planExercises = function (doneMap) {
    const d = doneMap || {};
    return [
      ex('e-row', 'Тяга штанги', sets(3, 60, 10, d.row)),
      ex('e-bench', 'Жим лёжа', sets(4, 75, 8, d.bench)),
      ex('e-fly', 'Разведение гантелей', sets(3, 40, 12, d.fly)),
      ex('e-incline', 'Жим гантелей под углом', sets(3, 24, 10, 0)),
      ex('e-plank', 'Планка', sets(3, 0, 12, 0)),
      ex('e-pull', 'Тяга блока', sets(4, 55, 10, 0)),
      ex('e-french', 'Французский жим', sets(3, 30, 12, 0)),
    ];
  };

  let host = document.getElementById(hostId);
  if (!host) {
    host = document.createElement('main');
    host.id = hostId;
    Object.assign(host.style, {
      position: 'fixed', top: '0', left: '0', zIndex: '20000',
      width: '375px', height: '100vh', overflow: 'hidden',
      background: 'var(--v4-bg, #fffaf3)',
    });
    document.body.appendChild(host);
  }

  let element = null;

  if (scenario === 'l1-proposal-card') {
    const base = planExercises();
    const proposed = base
      .filter(function (e) { return e.id !== 'e-fly'; })
      .map(function (e) { return e.id === 'e-bench' ? ex(e.id, e.name, sets(4, 70, 8, 0)) : e; })
      .concat([ex('e-latpull', 'Тяга блока вертикальная', sets(3, 50, 12, 0))]);
    element = h(Parts.ProposalCard, {
      training: {
        type: 'strength',
        plan: {
          status: 'assigned',
          dayLabel: 'Верх тела B',
          proposal: {
            id: 'pp-l1', status: 'pending', proposedBy: 'Артём',
            proposedAt: at('09:14'), exercises: proposed,
          },
        },
        workoutLog: { exercises: base },
      },
      onReview: function () {}, onAccept: function () {}, onDecline: function () {},
    });
  }

  if (scenario === 'l2-proposal-started') {
    const base = planExercises({ row: 3, bench: 3, fly: 1 });
    const proposed = base
      .filter(function (e) { return e.id !== 'e-incline'; })
      .map(function (e) {
        if (e.id !== 'e-bench') return e;
        return ex(e.id, e.name, e.approaches.slice(0, 3).concat([ap(70, 8, false)]));
      });
    element = h(Builder.BuilderScreen, {
      training: {
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        time: '18:40',
        plan: {
          status: 'started', dayLabel: 'Верх тела B',
          proposal: {
            id: 'pp-l2', status: 'pending', proposedBy: 'Артём',
            proposedAt: at('19:02'), exercises: proposed,
          },
        },
        workoutLog: { title: 'Верх тела B', startedAt: at('18:40'), exercises: base },
      },
      dateKey: nowIso.slice(0, 10),
      profile: { weight: 78 },
      historyFor: function () { return null; },
      historyDetailFor: function () { return { usages: [], record: null }; },
      onPatch: function () {}, onPatchSession: function () {}, onClose: function () {},
    });
  }

  if (scenario === 'l5-missed-today') {
    const base = [
      ex('e-pull', 'Тяга блока', sets(3, 55, 10, 0)),
      ex('e-ohp', 'Жим над головой', sets(3, 30, 10, 0)),
    ];
    const proposed = [
      ex('e-pull', 'Тяга блока', sets(3, 55, 10, 0)),
      ex('e-squat', 'Приседания', sets(3, 60, 10, 0)),
    ];
    element = h(Parts.MissedTodayProposalScreen, {
      training: {
        type: 'strength',
        plan: {
          status: 'skipped', dayLabel: 'Верх тела B', skipReason: 'Болит плечо',
          planSnapshot: { exercises: base },
          proposal: {
            id: 'pp-l5', status: 'pending', proposedBy: 'Артём',
            proposedAt: nowMs - 12 * 60 * 1000,
            note: 'Собрал то же самое без жимов над головой. Плечо не тронем, спину и ноги сделаем.',
            exercises: proposed,
          },
        },
        planSnapshot: { exercises: base },
        workoutLog: { exercises: [] },
      },
      nowMs: nowMs,
      onDecline: function () {}, onReview: function () {},
    });
  }

  if (scenario === 'l6-missed-earlier') {
    const proposed = [
      ex('e-pull', 'Тяга блока', sets(3, 50, 12, 0)),
      ex('e-squat', 'Приседания', sets(3, 50, 12, 0)),
    ];
    element = h(Parts.MissedEarlierProposalScreen, {
      training: {
        type: 'strength',
        plan: {
          status: 'assigned', dayLabel: 'Замена вместо вторника',
          subtitle: 'та же группа, но полегче',
          missedDateKey: '2026-08-04',
          proposal: {
            id: 'pp-l6', status: 'pending', proposedBy: 'Артём',
            proposedAt: nowMs - 40 * 60 * 1000,
            dayLabel: 'Замена вместо вторника',
            subtitle: 'та же группа, но полегче',
            missedDateKey: '2026-08-04',
            replacementDateKey: nowIso.slice(0, 10),
            exercises: proposed,
          },
        },
        workoutLog: { exercises: [] },
      },
      nowMs: nowMs,
      dateKey: nowIso.slice(0, 10),
      onReview: function () {},
    });
  }

  if (scenario === 'l9-curator-side') {
    element = h(Parts.CuratorEditStatusScreen, {
      clientName: 'Марина К.',
      programKey: 'Pro Спорт · программа «Верх-низ»',
      dayLabel: 'Верх тела B',
      nowMs: nowMs,
      trainingStarted: false,
      proposal: {
        id: 'pp-l9', status: 'accepted', proposedBy: 'Артём',
        proposedAt: at('09:14'), resolvedAt: at('09:31'), dayLabel: 'Верх тела B',
        rejected: [{ name: 'тяга блока', reason: 'done' }],
      },
      onClose: function () {},
    });
  }

  if (scenario.indexOf('outcome-') === 0) {
    const base = planExercises({ row: 3, bench: 3 });
    const proposed = base
      .filter(function (e) { return e.id !== 'e-incline'; })
      .map(function (e) {
        if (e.id !== 'e-bench') return e;
        return ex(e.id, e.name, e.approaches.slice(0, 3).concat([ap(70, 8, false)]));
      });
    const status = scenario.slice('outcome-'.length);
    element = h(Parts.ProposalOutcomeScreen, {
      training: {
        type: 'strength',
        plan: {
          status: 'started', dayLabel: 'Верх тела B',
          proposal: {
            id: 'pp-out', status: status, proposedBy: 'Артём',
            proposedAt: at('09:14'), resolvedAt: at('09:21'),
            exercises: proposed, baselineExercises: base,
          },
        },
        workoutLog: {
          title: 'Верх тела B', startedAt: at('18:40'),
          exercises: status === 'expired' ? planExercises({ row: 3, bench: 4, fly: 3, pull: 4 }) : base,
        },
      },
      variant: status,
      elapsedSec: 54 * 60 + 30,
      onClose: function () {}, onPrimary: function () {},
    });
  }

  if (scenario === 'm1-exercise-card') {
    element = h(Builder.ExerciseCardScreen, {
      initialName: 'Тяга саней', bodyWeightKg: 78,
      onDone: function () {}, onCancel: function () {},
    });
  }

  if (scenario === 'm2-exercise-muscles') {
    element = h(Cat.ExerciseMuscleGroupsScreen, {
      exerciseName: 'Жим лёжа',
      primaryGroup: 'chest',
      secondaryGroups: ['triceps', 'shoulders'],
      previewTonnageKg: 2980,
      onSave: function () {}, onBack: function () {},
    });
  }

  if (scenario === 'm3-exercise-similar') {
    element = h(Cat.ExerciseSimilarScreen, {
      exerciseName: 'Подтягивания', bodyWeightKg: 78, selectedKey: 'pullup',
      onSave: function () {}, onBack: function () {},
    });
  }

  if (scenario.indexOf('m7-interrupted') === 0) {
    const exercises = planExercises({ row: 3, bench: 4, fly: 3 });
    const lastMarkAt = at('19:47');
    const wl = {
      title: 'Верх тела B', startedAt: at('18:40'),
      lastMarkAt: lastMarkAt, exercises: exercises,
    };
    // Таймер отдыха: истёк, пока человека не было (М7), не запускался (М7б)
    // или сохранился и ещё идёт — осталось 0:38 (М7в).
    if (scenario === 'm7-interrupted-expired') wl.activeRest = { exId: 'e-fly', total: 120, startedAt: lastMarkAt };
    if (scenario === 'm7-interrupted-running') wl.activeRest = { exId: 'e-fly', total: 120, startedAt: nowMs - 82 * 1000 };
    element = h(Builder.BuilderScreen, {
      training: {
        type: 'strength', strengthEntryMode: 'workout_builder', time: '18:40',
        workoutLog: wl,
      },
      dateKey: nowIso.slice(0, 10),
      profile: { weight: 78 },
      historyFor: function () { return null; },
      historyDetailFor: function () { return { usages: [], record: null }; },
      onPatch: function () {}, onPatchSession: function () {}, onClose: function () {},
    });
  }

  if (scenario === 'm8-abandoned-yesterday') {
    const yesterday = new Date(nowMs);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateKey = yesterday.getFullYear() + '-'
      + String(yesterday.getMonth() + 1).padStart(2, '0') + '-'
      + String(yesterday.getDate()).padStart(2, '0');
    const startedAt = new Date(yesterday).setHours(18, 40, 0, 0);
    const lastMarkAt = new Date(yesterday).setHours(19, 47, 0, 0);
    element = h(Parts.SummaryCard, {
      training: {
        type: 'strength', strengthEntryMode: 'workout_builder', time: '18:40',
        workoutLog: {
          title: 'Верх тела B', startedAt: startedAt, lastMarkAt: lastMarkAt,
          exercises: planExercises({ row: 3, bench: 4, fly: 3 }),
        },
      },
      dateKey: dateKey,
      onOpen: function () {}, onDelete: function () {}, onCloseAtLastMark: function () {},
    });
  }

  if (!element) throw new Error('Стенд не знает сценария ' + scenario);
  window.__sbRoots = window.__sbRoots || {};
  if (!window.__sbRoots[hostId]) window.__sbRoots[hostId] = window.ReactDOM.createRoot(host);
  window.__sbRoots[hostId].render(element);
}

// Готовность и монтаж отдаём НАСТОЯЩИМИ функциями, а не строками: строку
// Playwright исполняет уже в странице через `new Function`, а CSP приложения
// (`script-src 'self' 'unsafe-inline'`) такую строку запрещает — стенд падал
// на «Refused to evaluate a string as JavaScript». Функцию Playwright передаёт
// протоколом отладчика, и CSP её не касается. Замыкания при этом не
// переживают сериализацию, поэтому данные кейса вшиваются в исходник.
function setupFn(hostId, scenario) {
  return new Function('opts', `return (${mountStrengthCuratorCase.toString()})({
    scenario: ${JSON.stringify(scenario)},
    hostId: ${JSON.stringify(hostId)},
    nowIso: ${JSON.stringify(NOW_ISO)},
    themeId: (opts && opts.themeId) || null,
  })`);
}

function readyFn() {
  const H = window.HEYS;
  const B = H && H.StrengthBuilder;
  const P = H && H.StrengthBuilderParts;
  const C = H && H.StrengthCatalogUI;
  const K = H && H.TrainingKernel && H.TrainingKernel.strength;
  return !!window.React && !!window.ReactDOM && !!window.ReactDOM.createRoot
    && !!B && typeof B.BuilderScreen === 'function' && typeof B.ExerciseCardScreen === 'function'
    && !!P && typeof P.ProposalCard === 'function' && typeof P.CuratorEditStatusScreen === 'function'
    && typeof P.MissedTodayProposalScreen === 'function' && typeof P.SummaryCard === 'function'
    && !!C && typeof C.ExerciseMuscleGroupsScreen === 'function'
    && !!K && typeof K.trainingTonnage === 'function'
    && !!H.exerciseMeta;
}

function curatorCase(spec) {
  const hostId = `ui-v4-sbc-${spec.slug}-host`;
  return {
    id: spec.id,
    zone: 'strength-builder',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-strength-zone',
    themeId: spec.themeId || 'sand',
    viewport: { width: 375, height: spec.height || 812 },
    rootSelector: `#${hostId}`,
    captureSelector: spec.captureSelector
      ? `#${hostId} ${spec.captureSelector}`
      : `#${hostId} > .sb-root`,
    sbReady: readyFn,
    sbSetup: setupFn(hostId, spec.scenario),
    sbSteps: (spec.steps || []).map((step) => {
      const next = { ...step };
      if (next.wait) next.wait = `#${hostId} ${next.wait}`;
      if (next.click) next.click = `#${hostId} ${next.click}`;
      return next;
    }),
    canvasFrame: {
      file: CANVAS,
      label: spec.label,
      oid: spec.oid,
      palette: spec.themeId || 'sand',
      ...(spec.canvasCapture ? { captureSelector: spec.canvasCapture } : {}),
    },
  };
}

export const STRENGTH_CURATOR_VISUAL_CASES = Object.freeze([
  curatorCase({
    id: 'sbc-l1-proposal-card', slug: 'l1-proposal-card', scenario: 'l1-proposal-card',
    label: 'Правка · план ещё не начат', oid: 'Л1', height: 640,
    captureSelector: '> .sb-proposal-card', canvasCapture: ':scope > .sc',
  }),
  curatorCase({
    id: 'sbc-l2-proposal-started', slug: 'l2-proposal-started', scenario: 'l2-proposal-started',
    label: 'Правка · клиент уже начал', oid: 'Л2', height: 900,
    steps: [{ wait: '.sb-proposal-strip-btn' }, { click: '.sb-proposal-strip-btn' }, { wait: '.sb-proposal-started' }],
  }),
  curatorCase({
    id: 'sbc-l5-missed-today', slug: 'l5-missed-today', scenario: 'l5-missed-today',
    label: 'Правка · пропущен сегодня', oid: 'Л5', height: 812,
  }),
  curatorCase({
    id: 'sbc-l6-missed-earlier', slug: 'l6-missed-earlier', scenario: 'l6-missed-earlier',
    label: 'Правка · пропущен раньше', oid: 'Л6', height: 760,
  }),
  curatorCase({
    id: 'sbc-l9-curator-side', slug: 'l9-curator-side', scenario: 'l9-curator-side',
    label: 'Правка · сторона куратора', oid: 'Л9', height: 640,
  }),
  curatorCase({
    id: 'sbc-l10-outcome-accepted', slug: 'l10-outcome', scenario: 'outcome-accepted',
    label: 'Исход · правка принята', oid: 'Л10', height: 812,
  }),
  curatorCase({
    id: 'sbc-l11-outcome-declined', slug: 'l11-outcome', scenario: 'outcome-declined',
    label: 'Исход · отказ', oid: 'Л11', height: 640,
  }),
  curatorCase({
    id: 'sbc-l12-outcome-expired', slug: 'l12-outcome', scenario: 'outcome-expired',
    label: 'Исход · без ответа', oid: 'Л12', height: 640,
  }),
  curatorCase({
    id: 'sbc-m1-exercise-card', slug: 'm1-exercise-card', scenario: 'm1-exercise-card',
    label: 'Упражнение · карточка', oid: 'М1', height: 812,
  }),
  curatorCase({
    id: 'sbc-m2-exercise-muscles', slug: 'm2-exercise-muscles', scenario: 'm2-exercise-muscles',
    label: 'Упражнение · группы мышц', oid: 'М2', height: 900,
  }),
  curatorCase({
    id: 'sbc-m3-exercise-similar', slug: 'm3-exercise-similar', scenario: 'm3-exercise-similar',
    label: 'Упражнение · на что похоже', oid: 'М3', height: 812,
  }),
  curatorCase({
    id: 'sbc-m7-interrupted-expired', slug: 'm7-expired', scenario: 'm7-interrupted-expired',
    label: 'Сессия · вернулись через час', oid: 'М7', height: 640,
  }),
  curatorCase({
    id: 'sbc-m7-interrupted-no-timer', slug: 'm7-no-timer', scenario: 'm7-interrupted-no-timer',
    label: 'Сессия · вернулись через час · без таймера', oid: 'М7б', height: 640,
  }),
  curatorCase({
    id: 'sbc-m7-interrupted-running', slug: 'm7-running', scenario: 'm7-interrupted-running',
    label: 'Сессия · вернулись через час · таймер идёт', oid: 'М7в', height: 640,
  }),
  curatorCase({
    id: 'sbc-m8-abandoned', slug: 'm8-abandoned', scenario: 'm8-abandoned-yesterday',
    label: 'Сессия · брошена вчера', oid: 'М8', height: 640,
    captureSelector: '> .sb-card', canvasCapture: ':scope > .sc',
  }),
]);
