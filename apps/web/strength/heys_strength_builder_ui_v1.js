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

  function parts() {
    return HEYS.StrengthBuilderParts || {};
  }

  function kernel() {
    const TK = HEYS.TrainingKernel;
    return (TK && TK.strength) ? TK.strength : null;
  }

  function fullscreen() {
    const TK = HEYS.TrainingKernel;
    return (TK && TK.fullscreen) ? TK.fullscreen : null;
  }

  function metaFor(name) {
    const m = HEYS.exerciseMeta;
    return (m && typeof m.get === 'function') ? m.get(name) : null;
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

  /** Подпись упражнения во втором слое: группы из справочника, а не выдумка UI. */
  function groupsLabel(name) {
    const meta = metaFor(name);
    const m = HEYS.exerciseMeta;
    if (!meta || !m) return '';
    const parts = [m.groupLabel(meta.primaryGroup)].concat(
      (meta.secondaryGroups || []).map(function (g) { return m.groupLabel(g); })
    );
    return parts.filter(Boolean).join(' · ');
  }

  // ——— Строка подхода (экраны 07, 13, 24) ———

  function ApproachRow(props) {
    const { approach, index, workNumber, onPatch, onToggleType, readOnly } = props;
    const SK = kernel();
    const warmup = SK ? SK.isWarmupApproach(approach) : false;
    const stages = SK ? SK.approachStages(approach) : [];
    const blank = SK ? SK.isBlankApproach(approach) : false;
    const base = stages[0] || { weightKg: '', reps: 0, done: false };

    function patchStage(stageIdx, patch) {
      if (readOnly) return;
      if (stageIdx === 0) {
        onPatch(index, patch);
        return;
      }
      const drops = (approach.drops || []).slice();
      drops[stageIdx - 1] = Object.assign({}, drops[stageIdx - 1], patch);
      onPatch(index, { drops: drops });
    }

    // Пустые повторы блокируют галочку — без модалки и слова «ошибка».
    // Пустой вес нормален: это свой вес.
    function canClose(stage) {
      return +stage.reps > 0;
    }

    const rows = [];
    stages.forEach(function (stage, si) {
      const isDrop = stage.isDrop;
      rows.push(h('div', {
        key: 'st' + si,
        className: (isDrop ? 'sb-drop' : 'sb-ap') + (blank && !isDrop ? ' is-blank' : '')
      },
        isDrop
          ? h('span', { className: 'sb-drop-tag' }, 'дроп')
          : h('button', {
            type: 'button',
            className: 'sb-ap-num' + (warmup ? ' is-warmup' : ''),
            onClick: function () { if (!readOnly) onToggleType(index); },
            title: warmup ? 'Разминка — вне тоннажа. Нажмите, чтобы сделать рабочим' : 'Рабочий подход. Нажмите, чтобы сделать разминочным',
            'aria-label': warmup ? 'Разминочный подход' : 'Рабочий подход номер ' + workNumber
          }, warmup ? 'разм' : String(workNumber || '—')),
        h('input', {
          className: 'sb-ap-field',
          type: 'text',
          inputMode: 'decimal',
          value: stage.weightKg,
          placeholder: 'свой',
          disabled: readOnly,
          onChange: function (e) { patchStage(si, { weightKg: e.target.value }); },
          'aria-label': 'Вес, кг'
        }),
        h('input', {
          className: 'sb-ap-field',
          type: 'text',
          inputMode: 'numeric',
          value: stage.reps ? String(stage.reps) : '',
          placeholder: '—',
          disabled: readOnly,
          onChange: function (e) {
            const n = parseInt(String(e.target.value).replace(/\D/g, ''), 10);
            patchStage(si, { reps: isFinite(n) ? Math.max(0, Math.min(200, n)) : 0 });
          },
          'aria-label': 'Повторы'
        }),
        h('button', {
          type: 'button',
          className: 'sb-ap-check' + (stage.done ? ' is-done' : ''),
          disabled: readOnly || !canClose(stage),
          onClick: function () { patchStage(si, { done: !stage.done }); },
          'aria-label': stage.done ? 'Отменить отметку' : 'Отметить выполненным'
        }, stage.done ? '✓' : '○')
      ));
    });

    if (approach && approach.discomfort) {
      rows.push(h('div', { key: 'pain', className: 'sb-ap-note' },
        '⚠️ Дискомфорт' + (approach.discomfortNote ? ': ' + approach.discomfortNote : '')));
    }

    return h(React.Fragment, { key: 'ap' + index }, rows);
  }

  // ——— Упражнение (экран 04) ———

  function ExerciseCard(props) {
    const { ex, index, open, onToggleOpen, onPatchApproach, onToggleType,
      onAddApproach, onAddDrop, onRpe, onDiscomfortAction, readOnly } = props;
    const SK = kernel();
    const aps = Array.isArray(ex.approaches) ? ex.approaches : [];
    const meta = metaFor(ex.name);
    const unit = (ex.unit || (meta && meta.unit) || 'weight_reps');

    let workNo = 0;
    const rows = aps.map(function (a, ai) {
      const warmup = SK ? SK.isWarmupApproach(a) : false;
      if (!warmup) workNo += 1;
      return h(ApproachRow, {
        key: 'a' + ai,
        approach: a,
        index: ai,
        workNumber: warmup ? 0 : workNo,
        onPatch: onPatchApproach,
        onToggleType: onToggleType,
        readOnly: readOnly
      });
    });

    const doneCount = aps.filter(function (a) {
      return SK ? SK.isApproachDone(a) && !SK.isBlankApproach(a) : !!a.done;
    }).length;
    const totalCount = aps.filter(function (a) {
      return SK ? !SK.isBlankApproach(a) : true;
    }).length;

    const painApproach = aps.filter(function (a) { return a && a.discomfort; })[0];

    const summary = [];
    if (meta || ex.unit) {
      const g = groupsLabel(ex.name);
      if (g) summary.push(g);
    }
    if (unit === 'time') summary.push('время');
    else if (unit === 'distance') summary.push('метры');
    else if (unit === 'bodyweight') summary.push('свой вес');

    return h('div', { className: 'sb-ex' + (open ? ' is-open' : '') },
      h('button', {
        type: 'button',
        className: 'sb-ex-head',
        onClick: function () { onToggleOpen(index); },
        'aria-expanded': open ? 'true' : 'false'
      },
        h('span', { className: 'sb-ex-num' }, String(index + 1)),
        h('span', { className: 'sb-ex-title' },
          h('b', null, ex.name || 'Без названия'),
          h('span', { className: 'sb-ex-sub' }, summary.join(' · '))
        ),
        h('span', {
          className: 'sb-ex-count' + (totalCount > 0 && doneCount === totalCount ? ' is-done' : '')
        }, doneCount + '/' + totalCount),
        h('span', { className: 'sb-ex-count' }, open ? '▾' : '›')
      ),
      open && h('div', { className: 'sb-ex-body' },
        h('div', { className: 'sb-aps-head' },
          h('span', null, '№ / тип'),
          h('span', null, 'Вес, кг'),
          h('span', null, 'Повторы'),
          h('span', null, '✓')
        ),
        h('div', { className: 'sb-aps' }, rows),

        // Безопасность не прячется во второй слой: отметка ведёт к действию.
        painApproach && h('div', { className: 'sb-pain' },
          h('b', null, 'Дискомфорт' + (painApproach.discomfortNote ? ' · ' + painApproach.discomfortNote : '')),
          h('p', null, 'Боль — не «стало тяжело». Уберите вес или пропустите упражнение: отметка уже сохранена и уйдёт куратору.'),
          h('div', { className: 'sb-pain-actions' },
            h('button', {
              type: 'button', className: 'sb-btn',
              onClick: function () { onDiscomfortAction(index, 'reduce'); }
            }, 'Снизить вес на 20%'),
            h('button', {
              type: 'button', className: 'sb-btn',
              onClick: function () { onDiscomfortAction(index, 'skip'); }
            }, 'Пропустить упражнение')
          )
        ),

        h('div', { className: 'sb-rpe' },
          h('span', { className: 'sb-rpe-label' }, 'RPE'),
          [6, 7, 8, 9, 10].map(function (v) {
            return h('button', {
              key: 'rpe' + v,
              type: 'button',
              className: 'sb-rpe-dot' + (+ex.rpe === v ? ' is-on' : ''),
              onClick: function () { onRpe(index, v); },
              'aria-label': 'RPE ' + v
            }, String(v));
          })
        ),
        h('div', { className: 'sb-rest-line' },
          h('span', null, '⏱ Отдых ' + fmtClock(+ex.restSec || 90)),
          h('span', null, ex.restManual ? '· вручную' : '· выведен из RPE')
        ),
        h('div', { className: 'sb-ex-actions' },
          h('button', {
            type: 'button', className: 'sb-btn is-accent',
            onClick: function () { onAddApproach(index); },
            disabled: readOnly
          }, '+ Подход'),
          h('button', {
            type: 'button', className: 'sb-btn',
            onClick: function () { onAddDrop(index); },
            disabled: readOnly,
            title: 'Сброс веса внутри последнего подхода'
          }, '+ Сброс')
        )
      )
    );
  }

  // ——— Экран целиком ———

  function BuilderScreen(props) {
    const { training, dateKey, onPatch, profile, onClose } = props;
    const SK = kernel();
    const [openIdx, setOpenIdx] = React.useState(0);
    const [rest, setRest] = React.useState(null); // { total, startedAt }
    const [tick, setTick] = React.useState(0);

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

    const rendered = [];
    const seenGroups = {};
    exercises.forEach(function (ex, i) {
      const g = groupByIndex[i];
      if (g) {
        if (seenGroups[g.groupId]) return;
        seenGroups[g.groupId] = true;
        rendered.push(h(parts().SupersetBlock, {
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
      rendered.push(h(ExerciseCard, {
        key: 'e' + i,
        ex: ex,
        index: i,
        open: openIdx === i,
        onToggleOpen: function (idx) { setOpenIdx(openIdx === idx ? -1 : idx); },
        onPatchApproach: function (apIdx, patch) { patchApproach(i, apIdx, patch); },
        onToggleType: function (apIdx) { toggleType(i, apIdx); },
        onAddApproach: addApproach,
        onAddDrop: addDrop,
        onRpe: setRpe,
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
          h('b', null, wl.title || 'Силовая'),
          h('div', { className: 'sb-head-sub' }, dateKey || '')
        )
      ),
      h('div', { className: 'sb-stats' },
        h('span', { className: 'sb-stat sb-stat-time' }, agg ? (agg.doneApproaches + ' / ' + agg.totalApproaches + ' ✓') : '—'),
        agg && agg.totalVolume > 0 && h('span', { className: 'sb-stat' }, fmtTonnage(agg.totalVolume)),
        agg && agg.seconds > 0 && h('span', { className: 'sb-stat' }, fmtClock(agg.seconds)),
        agg && agg.meters > 0 && h('span', { className: 'sb-stat' }, Math.round(agg.meters) + ' м'),
        agg && agg.unmeasuredExercises > 0 && h('span', { className: 'sb-stat' },
          agg.unmeasuredExercises + ' без тоннажа')
      ),
      h('div', { className: 'sb-list' },
        rendered.length ? rendered : h('div', { className: 'sb-empty' }, 'Упражнений пока нет')
      ),
      rest && h(parts().RestRing, {
        secondsLeft: secondsLeft,
        total: rest.total,
        onSkip: function () { setRest(null); },
        onAdd: function () { setRest({ total: rest.total + 30, startedAt: rest.startedAt }); }
      }),
      h('div', { className: 'sb-panel' },
        h('button', {
          type: 'button', className: 'sb-finish', onClick: onClose
        }, notClosed > 0 ? 'Завершить · ' + notClosed + ' не закрыто' : 'Завершить'),
        h('button', {
          type: 'button', className: 'sb-panel-add', 'aria-label': 'Добавить упражнение',
          onClick: function () {
            const next = exercises.concat([{ name: '', approaches: [{ weightKg: '', reps: 10, done: false }], restSec: 90 }]);
            patchExercises(next);
            setOpenIdx(next.length - 1);
          }
        }, '+')
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
        dateKey: state.dateKey,
        profile: state.profile,
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
