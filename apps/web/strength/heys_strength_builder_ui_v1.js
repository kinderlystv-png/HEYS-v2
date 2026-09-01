// heys_strength_builder_ui_v1.js — полноэкранный силовой конструктор.
//
// Шаг 5 протокола STRENGTH_BUILDER_REDESIGN_PROTOCOL_2026-08-09.md: экраны 04
// (тренировка в работе), 05 (отдых), 07 (типы подходов), 13 (валидация),
// 23 (связка в работе), 24 (дроп-сет), 26 (два состояния связки).
//
// Вся арифметика уже посчитана ядром (TrainingKernel.strength): раунды
// выводятся из позиции, тоннаж знает типы подходов и ступени сброса. UI
// показывает готовые числа и НЕ считает их сам — второй экземпляр формулы
// разошёлся бы с ядром молча.
//
// Progressive disclosure: первый слой — что делать сейчас (подходы текущего
// упражнения, одна главная кнопка). Второй слой — RPE, отдых, связка, дроп,
// история. Безопасность (дискомфорт) во второй слой не прячется.
//
// Public API:
//   HEYS.StrengthBuilder.open({ training, dateKey, onPatch, profile, haptic })
//   HEYS.StrengthBuilder.close()

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const SB = HEYS.StrengthBuilder = HEYS.StrengthBuilder || {};
  if (SB.__registered) return;
  SB.__registered = true;

  const React = global.React;
  if (!React) return;
  const h = React.createElement;
  const FULLSCREEN_ID = 'strength-builder';

  function kernel() {
    const TK = HEYS.TrainingKernel;
    return (TK && TK.strength) ? TK.strength : null;
  }

  function fullscreen() {
    const TK = HEYS.TrainingKernel;
    return (TK && TK.fullscreen) ? TK.fullscreen : null;
  }

  function strengthKernelRef() {
    const TK = HEYS.TrainingKernel;
    return (TK && TK.strength) ? TK.strength : null;
  }

  function fmtClock(totalSec) {
    const s = Math.max(0, Math.round(totalSec || 0));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return String(mm) + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function fmtTonnage(kg) {
    const v = Math.round(kg || 0);
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + ' т';
    return v + ' кг';
  }

  function fmtTime(ms) {
    const d = new Date(ms || 0);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function restoreActiveRest(value, now) {
    const raw = value && typeof value === 'object' ? value : null;
    const startedAt = raw && Number.isFinite(+raw.startedAt) ? +raw.startedAt : 0;
    const total = raw && Number.isFinite(+raw.total) ? Math.max(1, Math.min(3600, +raw.total)) : 0;
    if (!startedAt || !total || startedAt + total * 1000 <= (now || Date.now())) return null;
    return {
      startedAt: startedAt,
      total: total,
      exName: String(raw.exName || ''),
      owner: String(raw.owner || ''),
      source: String(raw.source || ''),
      closedLabel: String(raw.closedLabel || ''),
      contextNextLabel: String(raw.contextNextLabel || ''),
      notificationLabel: String(raw.notificationLabel || ''),
      nextLabel: String(raw.nextLabel || ''),
      collapsed: !!raw.collapsed
    };
  }

  // ——— Экран целиком ———

  function BuilderScreen(props) {
    const { training, dateKey, onPatch, onPatchSession, onPatchNote, profile, historyFor, historyDetailFor,
      lastSessionFor, finishSummaryFor, onRepeatLast, syncStatusFor, onReviewProposal, onFinishProposal, onClose } = props;
    const SK = kernel();
    const wl = (training && training.workoutLog) || {};
    const [openIdx, setOpenIdx] = React.useState(0);
    const [view, setView] = React.useState('list');
    const [draftName, setDraftName] = React.useState('');
    const [linkFrom, setLinkFrom] = React.useState(0);
    const [sheetOpen, setSheetOpen] = React.useState(false);
    const [closeConfirm, setCloseConfirm] = React.useState(false);
    const [historyName, setHistoryName] = React.useState('');
    const [dismissedBreakAt, setDismissedBreakAt] = React.useState(0);
    const [finishAtOverride, setFinishAtOverride] = React.useState(0);
    const [rest, setRest] = React.useState(function () {
      return restoreActiveRest(wl.activeRest, Date.now());
    });
    const sessionRef = React.useRef(Object.assign({}, wl));
    const [tick, setTick] = React.useState(0);

    function patchSession(patch) {
      const nextPatch = patch && typeof patch === 'object' ? patch : {};
      Object.keys(nextPatch).forEach(function (key) {
        if (key === 'finish') return;
        if (nextPatch[key] == null) delete sessionRef.current[key];
        else sessionRef.current[key] = nextPatch[key];
      });
      if (typeof onPatchSession === 'function') {
        onPatchSession(nextPatch);
      }
    }

    function patchRest(next) {
      setRest(next);
      patchSession({ activeRest: next ? Object.assign({}, next) : null });
    }

    React.useEffect(function () {
      if (wl.activeRest && !rest && typeof onPatchSession === 'function') {
        patchSession({ activeRest: null });
      }
      // Только очистка протухшего входного снимка при первом монтировании.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Время с начала тренировки: «начата в 18:40» превращается в ⏱ на экране.
    const persistedStartedAt = Number.isFinite(+sessionRef.current.startedAt) ? +sessionRef.current.startedAt : 0;
    const startedAt = persistedStartedAt || (HEYS.StrengthBuilderParts || {}).startedAtMs(training, dateKey);
    const completedAt = Number.isFinite(+sessionRef.current.completedAt) ? +sessionRef.current.completedAt : 0;
    const firstMarkAt = Number.isFinite(+sessionRef.current.firstMarkAt) ? +sessionRef.current.firstMarkAt : 0;
    const lastMarkAt = Number.isFinite(+sessionRef.current.lastMarkAt) ? +sessionRef.current.lastMarkAt : 0;
    const elapsedEnd = completedAt > 0 ? completedAt : Date.now();
    const elapsedSec = startedAt ? Math.max(0, Math.floor((elapsedEnd - startedAt) / 1000)) : 0;
    const workElapsedSec = firstMarkAt && lastMarkAt && lastMarkAt >= firstMarkAt
      ? Math.floor((lastMarkAt - firstMarkAt) / 1000)
      : elapsedSec;

    React.useEffect(function () {
      if (!startedAt || completedAt) return undefined;
      const id = global.setInterval(function () { setTick(function (t) { return t + 1; }); }, 1000);
      return function () { global.clearInterval(id); };
    }, [startedAt, completedAt]);

    const [syncStatus, setSyncStatus] = React.useState(function () {
      return typeof syncStatusFor === 'function' ? syncStatusFor() : null;
    });
    React.useEffect(function () {
      if (typeof syncStatusFor !== 'function') return undefined;
      const id = global.setInterval(function () { setSyncStatus(syncStatusFor()); }, 3000);
      return function () { global.clearInterval(id); };
    }, [syncStatusFor]);

    React.useEffect(function () {
      if (!rest) return undefined;
      const id = global.setInterval(function () { setTick(function (t) { return t + 1; }); }, 1000);
      return function () { global.clearInterval(id); };
    }, [rest]);

    // Список держим в состоянии экрана: полноэкранный слой смонтирован один
    // раз, и правка, ушедшая только наружу, на экране бы не появилась.
    const [exercises, setExercises] = React.useState(
      Array.isArray(wl.exercises) ? wl.exercises : []
    );
    const bodyWeightKg = +(profile && profile.weight) || 0;
    // Тоннаж считается по тому, что на экране, а не по снимку из пропсов.
    const liveTraining = Object.assign({}, training, {
      workoutLog: Object.assign({}, wl, sessionRef.current, { exercises: exercises })
    });
    const agg = SK ? SK.trainingTonnage(liveTraining, { bodyWeightKg: bodyWeightKg }) : null;
    const groups = SK ? SK.supersetGroups(exercises) : [];
    const groupByIndex = {};
    groups.forEach(function (g) {
      g.indexes.forEach(function (i) { groupByIndex[i] = g; });
    });

    function groupName(group) {
      const index = groups.indexOf(group);
      return 'Связка ' + (index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(group.groupId));
    }

    function isRoundDone(source, cells) {
      return cells.every(function (cell) {
        return SK.isApproachDone(source[cell.exerciseIndex].approaches[cell.approachIndex]);
      });
    }

    function approachProgressLabel(exercise, approachIndex) {
      const source = exercise || {};
      const approaches = Array.isArray(source.approaches) ? source.approaches : [];
      if (SK && SK.isWarmupApproach(approaches[approachIndex])) {
        return (source.name || 'Упражнение') + ' · разминка';
      }
      let workNumber = 0;
      let workTotal = 0;
      approaches.forEach(function (approach, index) {
        if (SK && SK.isWarmupApproach(approach)) return;
        workTotal += 1;
        if (index <= approachIndex) workNumber += 1;
      });
      return (source.name || 'Упражнение') + ' · подход ' + workNumber + ' из ' + workTotal;
    }

    function patchExercises(next) {
      setExercises(next);
      if (typeof onPatch === 'function') onPatch(next);
    }

    function patchApproach(exIdx, apIdx, patch) {
      const group = groupByIndex[exIdx];
      const roundsBefore = group && SK ? SK.supersetRounds(exercises, group.groupId) : null;
      const roundIndex = roundsBefore ? roundsBefore.findIndex(function (cells) {
        return cells.some(function (cell) {
          return cell.exerciseIndex === exIdx && cell.approachIndex === apIdx;
        });
      }) : -1;
      const wasRoundDone = roundIndex >= 0 ? isRoundDone(exercises, roundsBefore[roundIndex]) : false;
      const previousApproach = ((exercises[exIdx] || {}).approaches || [])[apIdx];
      const wasApproachDone = SK ? SK.isApproachDone(previousApproach) : !!(previousApproach && previousApproach.done);
      const next = exercises.slice();
      const ex = Object.assign({}, next[exIdx]);
      const aps = (ex.approaches || []).slice();
      aps[apIdx] = Object.assign({}, aps[apIdx], patch);
      ex.approaches = aps;
      next[exIdx] = ex;
      patchExercises(next);
      const isApproachDone = SK ? SK.isApproachDone(aps[apIdx]) : !!(aps[apIdx] && aps[apIdx].done);
      if (!wasApproachDone && isApproachDone) {
        const markedAt = Date.now();
        const lifecyclePatch = { lastMarkAt: markedAt };
        if (!(+sessionRef.current.startedAt > 0)) lifecyclePatch.startedAt = markedAt;
        if (!(+sessionRef.current.firstMarkAt > 0)) lifecyclePatch.firstMarkAt = markedAt;
        patchSession(lifecyclePatch);
      }
      // Таймер — событие, а не виджет: одиночный стартует от подхода, связка —
      // только от перехода последней клетки раунда в закрытое состояние.
      if (patch.done && SK && SK.isApproachDone(aps[apIdx]) && !group) {
        const total = +ex.restSec || 90;
        patchRest({
          total: total,
          startedAt: Date.now(),
          exName: ex.name || '',
          owner: ex.name || 'Упражнение',
          source: ex.rpe > 0 ? 'тяжесть ' + ex.rpe + ' → ' + fmtClock(total) : 'по умолчанию · ' + fmtClock(total),
          closedLabel: ex.name ? ex.name + ' закрыт' : 'Подход закрыт',
          contextNextLabel: 'дальше · следующий подход',
          notificationLabel: approachProgressLabel(ex, apIdx),
          nextLabel: 'Следующий подход'
        });
      } else if (patch.done && group && roundIndex >= 0) {
        const roundsAfter = SK.supersetRounds(next, group.groupId);
        const nowRoundDone = roundsAfter && isRoundDone(next, roundsAfter[roundIndex]);
        if (!wasRoundDone && nowRoundDone) {
          const total = +group.restSec || 90;
          const effort = Math.max.apply(null, group.indexes.map(function (index) {
            return +(next[index] && next[index].rpe) || 0;
          }));
          const owner = groupName(group);
          const first = next[group.indexes[0]] || {};
          patchRest({
            total: total,
            startedAt: Date.now(),
            exName: owner,
            owner: owner,
            source: effort > 0 ? 'тяжесть ' + effort + ' → ' + fmtClock(total) : 'максимум участников · ' + fmtClock(total),
            closedLabel: ex.name ? ex.name + ' закрыт' : 'Подход закрыт',
            contextNextLabel: roundIndex + 1 < roundsAfter.length
              ? 'дальше ' + owner.charAt(0).toLowerCase() + owner.slice(1) + ' · раунд ' + (roundIndex + 2) + ' из ' + roundsAfter.length
              : 'дальше · завершение связки',
            notificationLabel: approachProgressLabel(ex, apIdx),
            nextLabel: roundIndex + 1 < roundsAfter.length
              ? 'Следующий раунд · A1 ' + (first.name || 'упражнение')
              : 'Связка завершена'
          });
        }
      }
    }

    function toggleType(exIdx, apIdx) {
      const ex = exercises[exIdx];
      const a = (ex.approaches || [])[apIdx];
      const warmup = SK ? SK.isWarmupApproach(a) : false;
      patchApproach(exIdx, apIdx, { type: warmup ? '' : 'warmup' });
    }

    function addApproach(exIdx) {
      const g = groupByIndex[exIdx];
      // Новый подход снова делает завершённую сессию активной: старое время
      // завершения больше не описывает тренировку с незакрытым подходом.
      if (+sessionRef.current.completedAt > 0 || finishAtOverride > 0) {
        setFinishAtOverride(0);
        patchSession({ completedAt: null });
      }
      // «+ Подход» внутри связки добавляет раунд целиком: подходов у
      // участников должно остаться поровну.
      if (g && SK) {
        patchExercises(SK.addSupersetRound(exercises, g.groupId));
        return;
      }
      const next = exercises.slice();
      const ex = Object.assign({}, next[exIdx]);
      const aps = (ex.approaches || []).slice();
      const last = aps[aps.length - 1] || { weightKg: '', reps: 10 };
      aps.push({ weightKg: last.weightKg, reps: last.reps, done: false });
      ex.approaches = aps;
      next[exIdx] = ex;
      patchExercises(next);
    }

    function addDrop(exIdx) {
      // Защита держится у writer, а не только у SupersetBlock: скрытая кнопка
      // не должна быть единственной причиной, почему группа сохраняет равные
      // раунды при программном/устаревшем вызове.
      if (groupByIndex[exIdx]) return;
      const next = exercises.slice();
      const ex = Object.assign({}, next[exIdx]);
      const aps = (ex.approaches || []).slice();
      let target = -1;
      for (let i = aps.length - 1; i >= 0; i--) {
        if (SK && !SK.isWarmupApproach(aps[i])) { target = i; break; }
      }
      if (target < 0) return;
      const a = Object.assign({}, aps[target]);
      const stages = SK ? SK.approachStages(a) : [];
      const lastW = parseFloat(String(stages[stages.length - 1].weightKg || '').replace(',', '.'));
      if (!isFinite(lastW) || lastW <= 0) return;
      const drops = (a.drops || []).slice();
      if (drops.length >= (SK ? SK.MAX_APPROACH_STAGES - 1 : 2)) return;
      // Подставляем −20% и даём поправить: вес только вниз.
      drops.push({ weightKg: String(Math.round(lastW * 0.8)), reps: a.reps || 0, done: false });
      a.drops = drops;
      aps[target] = a;
      ex.approaches = aps;
      next[exIdx] = ex;
      patchExercises(next);
    }

    function addExercise(name) {
      const m = HEYS.exerciseMeta;
      const snap = (m && typeof m.snapshot === 'function') ? m.snapshot(name) : null;
      const row = Object.assign({
        name: name || '',
        approaches: [{ weightKg: '', reps: 10, done: false }],
        restSec: 90
      }, snap || {});
      const next = exercises.concat([row]);
      patchExercises(next);
      setOpenIdx(next.length - 1);
      setView('list');
      if (typeof HEYS.bumpExerciseUsage === 'function' && name) HEYS.bumpExerciseUsage(name);
    }

    function renameExercise(exIdx, value) {
      const next = exercises.slice();
      next[exIdx] = Object.assign({}, next[exIdx], { name: value });
      patchExercises(next);
      // Единица и коэффициент снимаются со справочника в момент, когда
      // упражнение названо: дальше тоннаж считается по снимку, а не по
      // справочнику, и правка справочника не перепишет историю.
      const m = HEYS.exerciseMeta;
      if (m && typeof m.snapshot === 'function') {
        const snap = m.snapshot(value);
        if (snap) next[exIdx] = Object.assign({}, next[exIdx], snap);
        patchExercises(next.slice());
      }
    }

    function setRpe(exIdx, value) {
      const next = exercises.slice();
      const ex = Object.assign({}, next[exIdx], { rpe: value });
      if (!ex.restManual) {
        ex.restSec = value >= 9 ? 180 : value >= 7 ? 120 : 60;
      }
      next[exIdx] = ex;
      patchExercises(next);
    }

    function discomfortAction(exIdx, action) {
      const next = exercises.slice();
      const ex = Object.assign({}, next[exIdx]);
      const aps = (ex.approaches || []).slice();
      if (action === 'reduce') {
        for (let i = 0; i < aps.length; i++) {
          if (SK && SK.isApproachDone(aps[i])) continue;
          const w = parseFloat(String(aps[i].weightKg || '').replace(',', '.'));
          if (isFinite(w) && w > 0) aps[i] = Object.assign({}, aps[i], { weightKg: String(Math.round(w * 0.8)) });
        }
        ex.approaches = aps;
        next[exIdx] = ex;
      } else {
        next.splice(exIdx, 1);
      }
      patchExercises(next);
    }

    function addRound(groupId) {
      if (SK) patchExercises(SK.addSupersetRound(exercises, groupId));
    }

    function swapMembers(groupId) {
      const g = groups.filter(function (x) { return x.groupId === groupId; })[0];
      if (!g || !SK || g.indexes.length < 2) return;
      patchExercises(SK.swapSupersetMembers(exercises, g.indexes[0], g.indexes[1]));
    }

    const notClosed = agg ? Math.max(0, agg.totalApproaches - agg.doneApproaches) : 0;
    const secondsLeft = rest ? Math.max(0, rest.total - Math.round((Date.now() - rest.startedAt) / 1000)) : 0;
    if (rest && secondsLeft === 0 && tick >= 0) {
      // Отдых кончился — снимаем экран, не дожидаясь действия человека.
      // Пуш «отдых закончился, телефон в кармане» (экран 11) — только если
      // разрешение уже есть (не запрашиваем сами посреди тренировки, это
      // отдельное решение пользователя) и вкладка сейчас не на экране.
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted'
          && typeof document !== 'undefined' && document.hidden) {
          new Notification('Отдых закончился', {
            body: rest.notificationLabel || (rest.exName || 'Тренировка') + ' · пора продолжать',
            icon: '/icon-192.png',
            tag: 'heys-strength-rest', renotify: false
          });
        }
      } catch (_e) { /* Notification недоступен — просто нет пуша */ }
      global.setTimeout(function () { patchRest(null); }, 0);
    }

    const CatUI = HEYS.StrengthCatalogUI || {};
    function FinUIRef() { return HEYS.StrengthFinishUI || {}; }
    if (view === 'catalog' && CatUI.CatalogScreen) {
      return h(CatUI.CatalogScreen, {
        onPick: addExercise,
        onCreate: function (name) { setDraftName(name || ''); setView('new'); },
        onBack: function () { setView('list'); }
      });
    }
    if (view === 'finish' && FinUIRef().FinishScreen) {
      const daySummary = typeof finishSummaryFor === 'function'
        ? (finishSummaryFor(exercises) || {})
        : {};
      return h(FinUIRef().FinishScreen, {
        training: liveTraining,
        dateKey: dateKey,
        elapsedSec: workElapsedSec,
        profile: profile,
        dayTonnageKg: Number.isFinite(+daySummary.dayTonnageKg)
          ? +daySummary.dayTonnageKg
          : (agg ? agg.totalVolume : 0),
        strengthCount: Number.isFinite(+daySummary.strengthCount)
          ? +daySummary.strengthCount
          : 1,
        bodyWeightKg: Number.isFinite(+daySummary.currentBodyWeightKg)
          ? +daySummary.currentBodyWeightKg
          : 0,
        previousComparableTonnageKg: Number.isFinite(+daySummary.previousComparableTonnageKg)
          ? +daySummary.previousComparableTonnageKg
          : null,
        historyFor: historyFor,
        historyDetailFor: historyDetailFor,
        onBack: function () { setView('list'); },
        onDone: function (note, feedback) {
          const finishedAt = finishAtOverride || lastMarkAt || Date.now();
          setRest(null);
          const finishPatch = {
            completedAt: finishedAt,
            activeRest: null,
            finish: true
          };
          const feedbackValues = feedback && typeof feedback === 'object' ? feedback : null;
          const hasFeedback = feedbackValues && ['mood', 'wellbeing', 'stress']
            .some(function (key) { return +feedbackValues[key] > 0; });
          if (hasFeedback) finishPatch.feedback = feedbackValues;
          else if (sessionRef.current.feedback) finishPatch.feedback = null;
          patchSession(finishPatch);
          // Заметка — часть журнала тренировки, а не состояние экрана: без
          // записи она исчезала бы вместе с закрытием слоя.
          if (typeof onPatchNote === 'function') onPatchNote(note);
          // Неотвеченная правка гаснет сама и завершение не держит: иначе
          // человек с гантелей в руке обязан разобрать чужое предложение,
          // чтобы просто закончить тренировку (экран 14d).
          if (typeof onFinishProposal === 'function') onFinishProposal();
          onClose();
        }
      });
    }
    const Parts = HEYS.StrengthBuilderParts || {};
    if (view === 'history' && FinUIRef().HistoryScreen) {
      const detail = typeof historyDetailFor === 'function'
        ? historyDetailFor(historyName, 0)
        : { usages: [], record: null };
      return h(FinUIRef().HistoryScreen, {
        name: historyName,
        usages: detail.usages,
        record: detail.record,
        onBack: function () { setView('list'); }
      });
    }
    if (view === 'order' && CatUI.OrderScreen) {
      return h(CatUI.OrderScreen, {
        exercises: exercises,
        onApply: function (next) { patchExercises(next); setView('list'); },
        onCancel: function () { setView('list'); }
      });
    }
    if (view === 'superset' && CatUI.SupersetScreen) {
      return h(CatUI.SupersetScreen, {
        exercises: exercises,
        startIndex: linkFrom,
        onCreate: function (next) { patchExercises(next); setView('list'); },
        onCancel: function () { setView('list'); }
      });
    }
    if (view === 'new' && CatUI.NewExerciseScreen) {
      return h(CatUI.NewExerciseScreen, {
        initialName: draftName,
        onDone: addExercise,
        onCancel: function () { setView('catalog'); }
      });
    }

    // Экран 02: пустая тренировка. «Начать по плану» не показываем — под неё
    // нет схемы данных (см. протокол, раздел «Открытое»); кнопка в пустоту не
    // уходит в разработку (решение 9).
    if (exercises.length === 0) {
      const last = typeof lastSessionFor === 'function' ? lastSessionFor() : null;
      return h('div', { className: 'sb-root' },
        h('div', { className: 'sb-head' },
          h('button', {
            type: 'button', className: 'sb-icon-btn', onClick: onClose, 'aria-label': 'Закрыть'
          }, '✕'),
          h('div', { className: 'sb-head-title' },
            h('b', null, 'Силовая'),
            h('div', { className: 'sb-head-sub' }, 'Пусто · 0 подходов')
          )
        ),
        h('div', { className: 'sb-empty-screen' },
          h('div', { className: 'sb-empty-emoji' }, '🏆'),
          h('b', null, 'Пустая тренировка'),
          h('p', null, 'Добавляйте упражнения по ходу — план не обязан быть готов заранее.'),
          h('button', {
            type: 'button', className: 'sb-btn is-accent sb-empty-cta',
            onClick: function () { setView('catalog'); }
          }, '+ Собрать свою'),
          last && h('button', {
            type: 'button', className: 'sb-btn sb-empty-cta',
            onClick: function () { onRepeatLast(last.exercises); }
          }, '↻ Повторить ' + (Parts.humanDate ? Parts.humanDate(last.dateKey) : last.dateKey))
        )
      );
    }

    const rendered = [];
    const seenGroups = {};
    exercises.forEach(function (ex, i) {
      const g = groupByIndex[i];
      if (g) {
        if (seenGroups[g.groupId]) return;
        seenGroups[g.groupId] = true;
        rendered.push(h((HEYS.StrengthBuilderParts || {}).SupersetBlock, {
          key: 'g' + g.groupId,
          group: g,
          exercises: exercises,
          onToggleCell: function (exIdx, apIdx) {
            const a = exercises[exIdx].approaches[apIdx];
            patchApproach(exIdx, apIdx, { done: !(SK ? SK.isApproachDone(a) : a.done) });
          },
          onAddRound: addRound,
          onSwap: swapMembers
        }));
        return;
      }
      rendered.push(h((HEYS.StrengthBuilderParts || {}).ExerciseCard, {
        key: 'e' + i,
        ex: ex,
        index: i,
        open: openIdx === i,
        onToggleOpen: function (idx) {
          setOpenIdx(openIdx === idx ? -1 : idx);
          if (rest && !rest.collapsed) patchRest(Object.assign({}, rest, { collapsed: true }));
        },
        onPatchApproach: function (apIdx, patch) { patchApproach(i, apIdx, patch); },
        onToggleType: function (apIdx) { toggleType(i, apIdx); },
        onAddApproach: addApproach,
        onAddDrop: addDrop,
        history: typeof historyFor === 'function' ? historyFor(ex.name, i) : null,
        onRpe: setRpe,
        onRename: renameExercise,
        onLink: function (exIdx) { setLinkFrom(exIdx); setView('superset'); },
        onRemove: function (exIdx) {
          const next = exercises.slice();
          next.splice(exIdx, 1);
          patchExercises(next);
        },
        onRestManual: function (exIdx, value) {
          const next = exercises.slice();
          next[exIdx] = Object.assign({}, next[exIdx], { restManual: value });
          patchExercises(next);
        },
        onDiscomfortAction: discomfortAction
      }));
    });

    const breakSec = lastMarkAt && !completedAt
      ? Math.max(0, Math.floor((Date.now() - lastMarkAt) / 1000))
      : 0;
    const showInterrupted = breakSec > 45 * 60 && dismissedBreakAt !== lastMarkAt;
    const restSourceName = rest ? String(rest.source || '').split(/\s(?:→|·)\s/)[0] : '';
    const restOrigin = /^тяжесть\s/.test(restSourceName)
      ? 'из ' + restSourceName
      : 'по правилу «' + (restSourceName || 'отдыха') + '»';

    return h('div', {
      className: 'sb-root' + (rest
        ? ' sb-root--rest-docked ' + (rest.collapsed ? 'sb-root--rest-collapsed' : 'sb-root--rest-expanded')
        : '')
    },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn',
          onClick: onClose, 'aria-label': 'Закрыть конструктор'
        }, '✕'),
        h('div', { className: 'sb-head-title' },
          // Название собирается из основных групп упражнений (решение 12):
          // подпись не должна врать про то, что человек делает.
          h('b', null, wl.title || (HEYS.StrengthBuilderParts || {}).sessionTitle(exercises)),
          h('div', { className: 'sb-head-sub' }, rest && !rest.collapsed
            ? 'отдых между подходами'
            : (HEYS.StrengthBuilderParts || {}).humanDate(dateKey))
        ),
        // Очередь отправки: зал без сети — основной сценарий (решение 6). Статус
        // берётся у уже существующей общей sync-очереди приложения, конструктор
        // не заводит вторую.
        syncStatus === 'pending' && h('span', {
          className: 'sb-sync-badge',
          title: 'Сохранено на телефоне, ждёт сеть'
        }, '📡 Ждёт сеть'),
        h('button', {
          type: 'button', className: 'sb-icon-btn',
          onClick: function () { setSheetOpen(true); },
          'aria-label': 'Ещё'
        }, '⋯')
      ),
      h('div', { className: 'sb-stats' + (rest && !rest.collapsed ? ' sb-stats--rest' : '') },
        rest && !rest.collapsed
          ? elapsedSec > 0 && h('span', { className: 'sb-stat sb-stat-time' }, fmtClock(elapsedSec))
          : elapsedSec > 0 && h('span', { className: 'sb-stat sb-stat-time' }, '⏱ ' + fmtClock(elapsedSec)),
        h('span', { className: 'sb-stat' + (rest && !rest.collapsed ? ' sb-stat--progress' : '') }, agg
          ? (rest && !rest.collapsed
            ? agg.doneApproaches + ' из ' + agg.totalApproaches + ' подходов'
            : agg.doneApproaches + ' / ' + agg.totalApproaches + ' ✓')
          : '—'),
        !(rest && !rest.collapsed) && agg && agg.seconds > 0 && h('span', { className: 'sb-stat' }, fmtClock(agg.seconds)),
        !(rest && !rest.collapsed) && agg && agg.meters > 0 && h('span', { className: 'sb-stat' }, Math.round(agg.meters) + ' м'),
        !(rest && !rest.collapsed) && agg && agg.unmeasuredExercises > 0 && h('span', { className: 'sb-stat' },
          agg.unmeasuredExercises + ' без тоннажа')
      ),
      // Правка куратора, пришедшая посреди тренировки (экран 14b): полоска, а
      // не модалка — человек стоит с гантелей в руке, и перекрывать ему экран
      // чужой правкой нельзя. Ответить можно и позже: завершение она не держит.
      Parts.ProposalStrip && h(Parts.ProposalStrip, {
        training: training,
        onReview: function () {
          if (typeof onReviewProposal === 'function') onReviewProposal();
        }
      }),
      showInterrupted && h('section', { className: 'sb-interrupted', 'aria-label': 'Тренировка на паузе' },
        h('div', { className: 'sb-interrupted-title' }, 'Тренировка на паузе'),
        h('b', { className: 'sb-interrupted-key' },
          (agg ? agg.doneApproaches + ' из ' + agg.totalApproaches + ' подходов' : 'Тренировка начата')
          + ' · вас не было ' + fmtClock(breakSec)),
        h('p', null, 'Всё, что отмечено, на месте. Таймер отдыха истёк и заново не запускается.'),
        h('div', { className: 'sb-interrupted-meta' },
          h('span', null, 'Последняя отметка'),
          h('b', null, fmtTime(lastMarkAt))
        ),
        h('div', { className: 'sb-interrupted-actions' },
          h('button', {
            type: 'button', className: 'sb-btn is-accent',
            onClick: function () { setDismissedBreakAt(lastMarkAt); }
          }, 'Продолжить'),
          h('button', {
            type: 'button', className: 'sb-btn',
            onClick: function () {
              setFinishAtOverride(lastMarkAt);
              setRest(null);
              patchSession({ completedAt: lastMarkAt, activeRest: null });
              setView('finish');
            }
          }, 'Завершить в ' + fmtTime(lastMarkAt))
        )
      ),
      h('div', { className: 'sb-list' },
        rendered.length ? rendered : h('div', { className: 'sb-empty' }, 'Упражнений пока нет')
      ),
      rest && h((HEYS.StrengthBuilderParts || {}).RestRing, {
        secondsLeft: secondsLeft,
        total: rest.total,
        owner: rest.owner,
        source: rest.source,
        closedLabel: rest.closedLabel,
        contextNextLabel: rest.contextNextLabel,
        nextLabel: rest.nextLabel,
        collapsed: !!rest.collapsed,
        onSkip: function () { patchRest(null); },
        onAdd: function () { patchRest(Object.assign({}, rest, { total: rest.total + 10 })); },
        onCollapse: function () { patchRest(Object.assign({}, rest, { collapsed: true })); },
        onExpand: function () { patchRest(Object.assign({}, rest, { collapsed: false })); }
      }),
      // Шторка ⋯ (экран 20). Показываем только рабочие входы: кнопка в пустоту
      // в разработку не уходит (решение 9).
      sheetOpen && h('div', { className: 'sb-sheet-back', onClick: function () { setSheetOpen(false); } },
        h('div', {
          className: 'sb-sheet',
          onClick: function (e) { e.stopPropagation(); }
        },
          h('div', { className: 'sb-sheet-grip' }),
          (HEYS.StrengthBuilderParts || {}).sheetRows({
            exercises: exercises,
            openIdx: openIdx,
            close: function () { setSheetOpen(false); },
            go: setView,
            setLinkFrom: setLinkFrom,
            setHistoryName: setHistoryName
          }).map(function (row, i) {
            return h('button', {
              key: i,
              type: 'button',
              className: 'sb-sheet-row',
              disabled: !!row.off,
              onClick: row.go
            },
              h('span', { className: 'sb-sheet-icon' }, row.icon),
              h('div', { className: 'sb-cat-title' },
                h('b', null, row.t),
                h('span', null, row.off ? 'Нужно больше упражнений в тренировке' : row.d)
              ),
              h('span', { className: 'sb-ex-count' }, '›')
            );
          })
        )
      ),
      // Осталось незакрытым: если это не сделано — лучше убрать, иначе тоннаж и
      // объём по группам завышаются пустыми строками (экран 11).
      closeConfirm && h('div', { className: 'sb-sheet-back', onClick: function () { setCloseConfirm(false); } },
        h('div', { className: 'sb-sheet', onClick: function (e) { e.stopPropagation(); } },
          h('div', { className: 'sb-sheet-grip' }),
          h('b', { className: 'sb-confirm-title' }, 'Остались незакрытые подходы'),
          h('p', { className: 'sb-confirm-text' },
            notClosed + (notClosed === 1 ? ' подход' : notClosed < 5 ? ' подхода' : ' подходов')
            + ' без отметки. Если они не сделаны — лучше убрать: иначе тоннаж и объём по группам будут завышены.'),
          h('div', { className: 'sb-pain-actions' },
            h('button', {
              type: 'button', className: 'sb-btn',
              onClick: function () { setCloseConfirm(false); onClose(); }
            }, 'Оставить'),
            h('button', {
              type: 'button', className: 'sb-btn is-accent',
              onClick: function () {
                const SK = strengthKernelRef();
                const cleaned = exercises.map(function (ex) {
                  const aps = (ex.approaches || []).filter(function (a) {
                    return !SK || SK.isApproachDone(a) || SK.isBlankApproach(a);
                  });
                  return Object.assign({}, ex, { approaches: aps });
                });
                patchExercises(cleaned);
                setCloseConfirm(false);
                onClose();
              }
            }, 'Убрать пустые')
          )
        )
      ),
      h('div', { className: 'sb-panel' },
        h('button', {
          type: 'button', className: 'sb-panel-add', 'aria-label': 'Добавить упражнение',
          onClick: function () { setView('catalog'); }
        }, '+'),
        h('button', {
          type: 'button', className: 'sb-finish',
          onClick: function () {
            if (notClosed > 0) { setCloseConfirm(true); return; }
            setView('finish');
          }
        }, notClosed > 0 ? 'Завершить · ' + notClosed + ' не закрыто' : 'Завершить тренировку'),
        rest && !rest.collapsed && h('div', { className: 'sb-rest-note' },
          'Кольцо стоит над кнопкой «Завершить», а не поверх списка: пока идёт отдых, упражнения видны и правятся. Число подписано, откуда взялось — ' + restOrigin + ', — и правится теми же двумя кнопками, а не настройками.')
      )
    );
  }

  function open(opts) {
    const o = opts || {};
    const fs = fullscreen();
    if (!fs) return false;
    let state = o;
    function render(api) {
      return h(BuilderScreen, {
        training: state.training,
        onPatchSession: state.onPatchSession,
        onPatchNote: state.onPatchNote,
        dateKey: state.dateKey,
        profile: state.profile,
        historyFor: state.historyFor,
        historyDetailFor: state.historyDetailFor,
        lastSessionFor: state.lastSessionFor,
        finishSummaryFor: state.finishSummaryFor,
        onRepeatLast: state.onRepeatLast,
        syncStatusFor: state.syncStatusFor,
        onReviewProposal: state.onReviewProposal,
        onFinishProposal: state.onFinishProposal,
        onPatch: function (nextExercises) {
          if (typeof state.onPatch === 'function') state.onPatch(nextExercises);
        },
        onClose: api.close
      });
    }
    return fs.mount({
      id: FULLSCREEN_ID,
      ariaLabel: 'Силовой конструктор',
      render: render,
      onClose: typeof o.onCloseScreen === 'function' ? o.onCloseScreen : null
    });
  }

  function close() {
    const fs = fullscreen();
    return fs ? fs.unmount(FULLSCREEN_ID) : false;
  }

  SB.open = open;
  SB.close = close;
  SB.BuilderScreen = BuilderScreen;
})(typeof window !== 'undefined' ? window : globalThis);
