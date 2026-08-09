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

  // ——— Экран целиком ———

  function BuilderScreen(props) {
    const { training, dateKey, onPatch, onPatchNote, profile, historyFor, historyDetailFor,
      lastSessionFor, onRepeatLast, syncStatusFor, onClose } = props;
    const SK = kernel();
    const [openIdx, setOpenIdx] = React.useState(0);
    const [view, setView] = React.useState('list');
    const [draftName, setDraftName] = React.useState('');
    const [linkFrom, setLinkFrom] = React.useState(0);
    const [sheetOpen, setSheetOpen] = React.useState(false);
    const [closeConfirm, setCloseConfirm] = React.useState(false);
    const [historyName, setHistoryName] = React.useState('');
    const [rest, setRest] = React.useState(null); // { total, startedAt }
    const [tick, setTick] = React.useState(0);

    // Время с начала тренировки: «начата в 18:40» превращается в ⏱ на экране.
    const startedAt = (HEYS.StrengthBuilderParts || {}).startedAtMs(training, dateKey);
    const elapsedSec = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;

    React.useEffect(function () {
      if (!startedAt) return undefined;
      const id = global.setInterval(function () { setTick(function (t) { return t + 1; }); }, 1000);
      return function () { global.clearInterval(id); };
    }, [startedAt]);

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

    const wl = (training && training.workoutLog) || {};
    // Список держим в состоянии экрана: полноэкранный слой смонтирован один
    // раз, и правка, ушедшая только наружу, на экране бы не появилась.
    const [exercises, setExercises] = React.useState(
      Array.isArray(wl.exercises) ? wl.exercises : []
    );
    const bodyWeightKg = +(profile && profile.weight) || 0;
    // Тоннаж считается по тому, что на экране, а не по снимку из пропсов.
    const liveTraining = Object.assign({}, training, {
      workoutLog: Object.assign({}, wl, { exercises: exercises })
    });
    const agg = SK ? SK.trainingTonnage(liveTraining, { bodyWeightKg: bodyWeightKg }) : null;
    const groups = SK ? SK.supersetGroups(exercises) : [];
    const groupByIndex = {};
    groups.forEach(function (g) {
      g.indexes.forEach(function (i) { groupByIndex[i] = g; });
    });

    function patchExercises(next) {
      setExercises(next);
      if (typeof onPatch === 'function') onPatch(next);
    }

    function patchApproach(exIdx, apIdx, patch) {
      const next = exercises.slice();
      const ex = Object.assign({}, next[exIdx]);
      const aps = (ex.approaches || []).slice();
      aps[apIdx] = Object.assign({}, aps[apIdx], patch);
      ex.approaches = aps;
      next[exIdx] = ex;
      patchExercises(next);
      // Таймер — событие, а не виджет: он стартует, когда подход закрыт.
      if (patch.done && SK && SK.isApproachDone(aps[apIdx]) && !groupByIndex[exIdx]) {
        setRest({ total: +ex.restSec || 90, startedAt: Date.now() });
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
      global.setTimeout(function () { setRest(null); }, 0);
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
      return h(FinUIRef().FinishScreen, {
        training: liveTraining,
        dateKey: dateKey,
        elapsedSec: elapsedSec,
        profile: profile,
        dayTonnageKg: agg ? agg.totalVolume : 0,
        strengthCount: 1,
        onBack: function () { setView('list'); },
        onDone: function (note) {
          // Заметка — часть журнала тренировки, а не состояние экрана: без
          // записи она исчезала бы вместе с закрытием слоя.
          if (typeof onPatchNote === 'function') onPatchNote(note);
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
        onToggleOpen: function (idx) { setOpenIdx(openIdx === idx ? -1 : idx); },
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

    return h('div', { className: 'sb-root' },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn',
          onClick: onClose, 'aria-label': 'Закрыть конструктор'
        }, '✕'),
        h('div', { className: 'sb-head-title' },
          // Название собирается из основных групп упражнений (решение 12):
          // подпись не должна врать про то, что человек делает.
          h('b', null, wl.title || (HEYS.StrengthBuilderParts || {}).sessionTitle(exercises)),
          h('div', { className: 'sb-head-sub' }, (HEYS.StrengthBuilderParts || {}).humanDate(dateKey))
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
      h('div', { className: 'sb-stats' },
        elapsedSec > 0 && h('span', { className: 'sb-stat sb-stat-time' }, '⏱ ' + fmtClock(elapsedSec)),
        h('span', { className: 'sb-stat' }, agg ? (agg.doneApproaches + ' / ' + agg.totalApproaches + ' ✓') : '—'),
        agg && agg.seconds > 0 && h('span', { className: 'sb-stat' }, fmtClock(agg.seconds)),
        agg && agg.meters > 0 && h('span', { className: 'sb-stat' }, Math.round(agg.meters) + ' м'),
        agg && agg.unmeasuredExercises > 0 && h('span', { className: 'sb-stat' },
          agg.unmeasuredExercises + ' без тоннажа')
      ),
      h('div', { className: 'sb-list' },
        rendered.length ? rendered : h('div', { className: 'sb-empty' }, 'Упражнений пока нет')
      ),
      rest && h((HEYS.StrengthBuilderParts || {}).RestRing, {
        secondsLeft: secondsLeft,
        total: rest.total,
        onSkip: function () { setRest(null); },
        onAdd: function () { setRest({ total: rest.total + 30, startedAt: rest.startedAt }); }
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
        }, notClosed > 0 ? 'Завершить · ' + notClosed + ' не закрыто' : 'Завершить')
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
        onPatchNote: state.onPatchNote,
        dateKey: state.dateKey,
        profile: state.profile,
        historyFor: state.historyFor,
        historyDetailFor: state.historyDetailFor,
        lastSessionFor: state.lastSessionFor,
        onRepeatLast: state.onRepeatLast,
        syncStatusFor: state.syncStatusFor,
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
