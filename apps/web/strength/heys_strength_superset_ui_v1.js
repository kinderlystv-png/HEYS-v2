// heys_strength_superset_ui_v1.js — связка и таймер отдыха силового конструктора.
//
// Экраны 05 (отдых), 23 (трисет в работе) и 26 (два состояния связки) из
// STRENGTH_BUILDER_REDESIGN_PROTOCOL_2026-08-09.md. Вынесено из
// heys_strength_builder_ui_v1.js отдельным модулем: это разные экраны, и вместе
// они упирались в лимит функций на модуль.
//
// Раунды и отдых берутся у ядра (TrainingKernel.strength): раунд выводится из
// позиции, отдых — максимум из значений участников.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Parts = HEYS.StrengthBuilderParts = HEYS.StrengthBuilderParts || {};
  if (Parts.__registered) return;
  Parts.__registered = true;

  const React = global.React;
  if (!React) return;
  const h = React.createElement;

  function kernel() {
    const TK = HEYS.TrainingKernel;
    return (TK && TK.strength) ? TK.strength : null;
  }

  function fmtClock(totalSec) {
    const s = Math.max(0, Math.round(totalSec || 0));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return String(mm) + ':' + (ss < 10 ? '0' : '') + ss;
  }

  // ——— Связка (экраны 23, 26) ———

  function SupersetBlock(props) {
    const { group, exercises, onToggleCell, onAddRound, onSwap } = props;
    const SK = kernel();
    if (!SK) return null;
    const rounds = SK.supersetRounds(exercises, group.groupId);
    const members = group.indexes.map(function (i) { return exercises[i]; });

    const head = h('div', { className: 'sb-ss-head' },
      h('b', null, 'Связка · ' + members.length + (members.length === 2 ? ' упражнения' : ' упражнений')),
      h('button', {
        type: 'button', className: 'sb-icon-btn',
        onClick: function () { onSwap(group.groupId); },
        title: 'Поменять участников местами'
      }, '⇅')
    );

    const memberList = h('div', { className: 'sb-ss-members' },
      members.map(function (m, mi) {
        return h('div', { className: 'sb-ss-member', key: 'm' + mi },
          h('i', null, 'A' + (mi + 1)),
          h('span', null, m.name || 'Без названия')
        );
      })
    );

    // Старая связка с неравным числом подходов: плоские списки без раундов,
    // историю не переписываем.
    if (!rounds) {
      return h('div', { className: 'sb-ss' }, head, memberList,
        h('div', { className: 'sb-ss-flat' },
          'Подходов у участников поровну нет — раунды не показываем, чтобы не переписывать историю. '
          + 'Выровняйте число подходов, и раунды появятся сами.')
      );
    }

    const roundRows = rounds.map(function (cells, ri) {
      const allDone = cells.every(function (c) {
        return SK.isApproachDone(exercises[c.exerciseIndex].approaches[c.approachIndex]);
      });
      return h('div', { className: 'sb-round', key: 'r' + ri },
        h('span', { className: 'sb-round-num' }, 'Р' + (ri + 1)),
        cells.map(function (c, ci) {
          const a = exercises[c.exerciseIndex].approaches[c.approachIndex];
          const blank = SK.isBlankApproach(a);
          const done = SK.isApproachDone(a);
          const label = blank
            ? '—'
            : (a.weightKg ? a.weightKg : 'свой') + ' × ' + (a.reps || '—');
          return h('button', {
            key: 'c' + ci,
            type: 'button',
            className: 'sb-cell' + (done && !blank ? ' is-done' : '') + (blank ? ' is-blank' : ''),
            disabled: blank,
            onClick: function () { onToggleCell(c.exerciseIndex, c.approachIndex); },
            title: blank ? 'Участник добавлен по ходу — в этом раунде его не было' : ''
          }, label);
        }),
        allDone && h('span', { className: 'sb-round-num' }, '⏱')
      );
    });

    return h('div', { className: 'sb-ss' }, head, memberList,
      roundRows,
      h('div', { className: 'sb-ss-note' },
        '⏱ Отдых ' + fmtClock(group.restSec) + ' пойдёт, когда закрыт весь раунд — внутри раунда таймера нет'),
      group.warmupCount > 0 && h('div', { className: 'sb-ss-note' },
        'Разминочных строк: ' + group.warmupCount + ' — в раунды и в тоннаж не входят'),
      h('div', { className: 'sb-ss-note' },
        h('button', {
          type: 'button', className: 'sb-btn is-accent',
          onClick: function () { onAddRound(group.groupId); }
        }, '+ Раунд')
      )
    );
  }

  // ——— Отдых (экран 05) ———

  function RestRing(props) {
    const { secondsLeft, total, onSkip, onAdd } = props;
    const r = 84;
    const c = 2 * Math.PI * r;
    const ratio = total > 0 ? Math.max(0, Math.min(1, secondsLeft / total)) : 0;
    return h('div', { className: 'sb-rest' },
      h('div', { className: 'sb-rest-ring' },
        h('svg', { width: 184, height: 184, viewBox: '0 0 184 184' },
          h('circle', {
            cx: 92, cy: 92, r: r, fill: 'none',
            stroke: 'var(--sb-br)', strokeWidth: 10
          }),
          h('circle', {
            cx: 92, cy: 92, r: r, fill: 'none',
            stroke: 'var(--sb-acc)', strokeWidth: 10, strokeLinecap: 'round',
            strokeDasharray: c, strokeDashoffset: c * (1 - ratio)
          })
        ),
        h('div', { className: 'sb-rest-value' },
          fmtClock(secondsLeft),
          h('small', null, 'отдых')
        )
      ),
      h('div', { className: 'sb-rest-actions' },
        h('button', { type: 'button', className: 'sb-btn', onClick: onAdd }, '+30 с'),
        h('button', { type: 'button', className: 'sb-btn is-accent', onClick: onSkip }, 'Пропустить')
      )
    );
  }

  /**
   * Название упражнения — первое обязательное поле: от него зависят группы,
   * единица измерения и история. Пока оно пустое, показываем частые из
   * каталога, чтобы не заставлять печатать вслепую.
   */
  function NameField(props) {
    const { name, suggestions, onRename } = props;
    return h('div', null,
      h('input', {
        className: 'sb-ap-field sb-ex-name',
        type: 'text',
        value: name,
        placeholder: 'Название упражнения',
        onChange: function (e) { onRename(e.target.value); },
        'aria-label': 'Название упражнения'
      }),
      (suggestions && suggestions.length > 0) && h('div', { className: 'sb-hist' },
        suggestions.map(function (sg) {
          return h('button', {
            key: sg.norm,
            type: 'button',
            className: 'sb-suggest',
            onClick: function () { onRename(sg.name); }
          }, sg.name);
        })
      )
    );
  }

  Parts.NameField = NameField;

  const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WEEKDAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  /** «2026-08-09» человеку читается как «Вс, 9 августа». */
  function humanDate(dateKey) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
    if (!m) return String(dateKey || '');
    const d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
    return WEEKDAYS_RU[d.getDay()] + ', ' + (+m[3]) + ' ' + MONTHS_RU[+m[2] - 1];
  }

  /**
   * Название сессии — из основных групп упражнений (решение 12). Те же группы
   * идут в движок, поэтому подпись не может разойтись с тем, что посчитано.
   */
  function sessionTitle(exercises) {
    const meta = HEYS.exerciseMeta;
    if (!meta || typeof meta.get !== 'function') return 'Силовая';
    const seen = [];
    (exercises || []).forEach(function (ex) {
      const m = ex && ex.name ? meta.get(ex.name) : null;
      if (!m || !m.primaryGroup) return;
      const label = meta.groupLabel(m.primaryGroup);
      if (label && seen.indexOf(label) < 0) seen.push(label);
    });
    if (!seen.length) return 'Силовая';
    return 'Силовая · ' + seen.slice(0, 3).join(', ').toLowerCase();
  }

  Parts.humanDate = humanDate;
  Parts.sessionTitle = sessionTitle;

  // ——— Строка подхода (экраны 07, 13, 24) ———

  function ApproachRow(props) {
    const { approach, index, workNumber, onPatch, onToggleType, readOnly, unit } = props;
    const SK = kernel();
    const warmup = SK ? SK.isWarmupApproach(approach) : false;

    // Время/дистанция — не про ступени сброса (это про вес), поэтому у них
    // своя однострочная ветка вместо approachStages: та же сетка из 4 колонок
    // (номер/вес/мера/галочка), только вторая колонка меряет секунды или метры,
    // а не повторы. Вес остаётся полем — фермерская переноска весит.
    if (unit === 'time' || unit === 'distance') {
      const isTime = unit === 'time';
      const field = isTime ? 'durationSec' : 'distanceM';
      const value = approach && approach[field];
      const blankMeasured = !(approach && (approach.weightKg || value || approach.done));
      const rowState = approach.done ? ' is-done' : (!warmup && !approach.done ? ' is-current' : '');
      const rows = [
        h('div', {
          key: 'st0',
          className: 'sb-ap' + (blankMeasured ? ' is-blank' : '') + rowState
        },
          h('button', {
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
            value: approach.weightKg || '',
            placeholder: 'свой',
            disabled: readOnly,
            onChange: function (e) { if (!readOnly) onPatch(index, { weightKg: e.target.value }); },
            'aria-label': 'Вес, кг'
          }),
          h('input', {
            className: 'sb-ap-field',
            type: 'text',
            inputMode: 'numeric',
            value: value ? String(value) : '',
            placeholder: isTime ? 'сек' : 'м',
            disabled: readOnly,
            onChange: function (e) {
              const n = parseInt(String(e.target.value).replace(/\D/g, ''), 10);
              const max = isTime ? 86400 : 200000;
              const clamped = isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
              if (!readOnly) onPatch(index, isTime ? { durationSec: clamped } : { distanceM: clamped });
            },
            'aria-label': isTime ? 'Время, сек' : 'Дистанция, м'
          }),
          h('button', {
            type: 'button',
            className: 'sb-ap-check' + (approach.done ? ' is-done' : ''),
            disabled: readOnly || !(+value > 0),
            onClick: function () { if (!readOnly) onPatch(index, { done: !approach.done }); },
            'aria-label': approach.done ? 'Отменить отметку' : 'Отметить выполненным'
          }, approach.done ? '✓' : '○')
        )
      ];
      if (approach && approach.discomfort) {
        rows.push(h('div', { key: 'pain', className: 'sb-ap-note' },
          '⚠️ Дискомфорт' + (approach.discomfortNote ? ': ' + approach.discomfortNote : '')));
      }
      return h(React.Fragment, { key: 'ap' + index }, rows);
    }

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
      const rowState = stage.done ? ' is-done' : (si === 0 && !warmup && !stage.done ? ' is-current' : '');
      rows.push(h('div', {
        key: 'st' + si,
        className: (isDrop ? 'sb-drop' : 'sb-ap') + (blank && !isDrop ? ' is-blank' : '') + rowState
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
      onAddApproach, onAddDrop, onRpe, onRename, onRestManual, onRemove, onDiscomfortAction,
      onLink, history, readOnly } = props;
    const SK = kernel();
    const aps = Array.isArray(ex.approaches) ? ex.approaches : [];
    const metaApi = HEYS.exerciseMeta;
    const meta = (metaApi && typeof metaApi.get === 'function') ? metaApi.get(ex.name) : null;
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
        readOnly: readOnly,
        unit: unit
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

    const suggestFn = HEYS.getExerciseSuggestions;
    const suggestions = (open && !String(ex.name || '').trim() && typeof suggestFn === 'function')
      ? suggestFn('', 6)
      : [];

    const allDone = totalCount > 0 && doneCount === totalCount;
    return h('div', { className: 'sb-ex' + (open ? ' is-open' : '') + (allDone ? ' is-complete' : '') },
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
          className: 'sb-ex-count' + (totalCount > 0 && doneCount === totalCount ? ' is-done' : ' is-current')
        }, doneCount + '/' + totalCount),
        h('span', { className: 'sb-ex-count' }, open ? '▾' : '›')
      ),

      open && h('div', { className: 'sb-ex-body' },
        !String(ex.name || '').trim() && h((HEYS.StrengthBuilderParts || {}).NameField, {
          name: ex.name || '',
          suggestions: suggestions,
          onRename: function (value) { onRename(index, value); }
        }),
        // Чипы истории: «прошлый раз» и рекорд — то, с чем человек сравнивает
        // сегодняшний подход. Данные приходят из дня, UI их не ищет сам.
        (function () {
          const chips = [];
          const last = history && history.last;
          const rec = history && history.record;
          if (last) {
            const w = last.weightKg || (last.approaches && last.approaches[0] && last.approaches[0].weightKg);
            const r = last.reps || (last.approaches && last.approaches[0] && last.approaches[0].reps);
            if (w || r) chips.push(h('span', { key: 'last' }, 'Прошлый раз · ' + (w || 'свой') + ' × ' + (r || '—')));
          }
          if (rec && rec.maxW > 0) {
            chips.push(h('span', { key: 'rec', className: 'is-record' },
              '🏆 Рекорд · ' + rec.maxW + ' кг'));
          }
          return chips.length ? h('div', { className: 'sb-hist' }, chips) : null;
        })(),
        h('div', { className: 'sb-aps-head' },
          h('span', null, ''),
          h('span', null, 'Вес, кг'),
          h('span', null, unit === 'time' ? 'Время, сек' : (unit === 'distance' ? 'Дистанция, м' : 'Повторы')),
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
          // Без RPE это значение по умолчанию, а не вывод из него: подпись,
          // называющая источником незаполненное поле, врёт.
          h('span', null, ex.restManual
            ? '· вручную'
            : (+ex.rpe > 0 ? '· выведен из RPE ' + ex.rpe : '· по умолчанию')),
          h('button', {
            type: 'button',
            className: 'sb-rest-manual' + (ex.restManual ? ' is-on' : ''),
            onClick: function () { onRestManual(index, !ex.restManual); }
          }, ex.restManual ? 'Авто' : 'Вручную')
        ),
        h('div', { className: 'sb-ex-actions' },
          h('button', {
            type: 'button', className: 'sb-btn is-accent',
            onClick: function () { onAddApproach(index); },
            disabled: readOnly
          }, '+ Подход'),
          (unit === 'weight_reps' || unit === 'bodyweight') && h('button', {
            type: 'button', className: 'sb-btn',
            onClick: function () { onAddDrop(index); },
            disabled: readOnly,
            title: 'Сброс веса внутри последнего подхода'
          }, '+ Сброс'),
          h('button', {
            type: 'button', className: 'sb-btn',
            onClick: function () { onLink(index); },
            disabled: readOnly,
            title: 'Связать со следующими упражнениями'
          }, '🔗 Связать')
        ),
        h('button', {
          type: 'button',
          className: 'sb-ex-remove',
          onClick: function () { onRemove(index); },
          'aria-label': 'Убрать упражнение из тренировки'
        }, 'Убрать упражнение')
      )
    );
  }

  /** Начало тренировки в миллисекундах: «начата в 18:40» + дата дня. */
  function startedAtMs(training, dateKey) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String((training && training.time) || ''));
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
    if (!m || !d) return 0;
    return new Date(+d[1], +d[2] - 1, +d[3], +m[1], +m[2], 0).getTime();
  }

  /** Подпись упражнения во втором слое: группы из справочника, а не выдумка UI. */
  function groupsLabel(name) {
    const m = HEYS.exerciseMeta;
    const meta = (m && typeof m.get === 'function') ? m.get(name) : null;
    if (!meta || !m) return '';
    const parts = [m.groupLabel(meta.primaryGroup)].concat(
      (meta.secondaryGroups || []).map(function (g) { return m.groupLabel(g); })
    );
    return parts.filter(Boolean).join(' · ');
  }

  Parts.ApproachRow = ApproachRow;
  Parts.ExerciseCard = ExerciseCard;
  Parts.startedAtMs = startedAtMs;

  /**
   * Карточка дня (экран 01): сводка вместо конструктора. Тоннажа и калорий
   * здесь нет намеренно — в зале человеку нужно одно: сколько осталось и куда
   * нажать, чтобы продолжить.
   */
  function SummaryCard(props) {
    const { training, dateKey, onOpen } = props;
    // Таймер тикает сам: карточка обязана показывать идущее время, иначе
    // «47:12» превращается в момент последней перерисовки дня.
    const [, setTick] = React.useState(0);
    const startedAt = startedAtMs(training, dateKey);
    React.useEffect(function () {
      if (!startedAt) return undefined;
      const id = setInterval(function () { setTick(function (t) { return t + 1; }); }, 1000);
      return function () { clearInterval(id); };
    }, [startedAt]);
    const elapsedSec = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
    const TK = HEYS.TrainingKernel;
    const SK = (TK && TK.strength) ? TK.strength : null;
    const wl = (training && training.workoutLog) || {};
    const exercises = Array.isArray(wl.exercises) ? wl.exercises : [];
    const agg = SK ? SK.trainingTonnage(training) : null;
    const done = agg ? agg.doneApproaches : 0;
    const total = agg ? agg.totalApproaches : 0;
    const ratio = total > 0 ? Math.min(1, done / total) : 0;

    // Текущее упражнение — первое незакрытое: подпись под кнопкой отвечает на
    // вопрос «а где я сейчас».
    let currentIdx = -1;
    for (let i = 0; i < exercises.length && currentIdx < 0; i++) {
      const aps = (exercises[i] && exercises[i].approaches) || [];
      for (let k = 0; k < aps.length; k++) {
        if (SK && SK.isBlankApproach(aps[k])) continue;
        if (!(SK ? SK.isApproachDone(aps[k]) : aps[k].done)) { currentIdx = i; break; }
      }
    }
    const current = currentIdx >= 0 ? exercises[currentIdx] : null;
    const running = done > 0 && done < total;

    return h('div', { className: 'sb-card' },
      h('div', { className: 'sb-card-head' },
        h('div', { className: 'sb-card-title' },
          h('b', null, sessionTitle(exercises)),
          h('span', null, humanDate(dateKey) + (training && training.time ? ' · начата в ' + training.time : ''))
        ),
        running && h('span', { className: 'sb-card-badge' }, '● идёт')
      ),
      h('div', { className: 'sb-card-metrics' },
        elapsedSec > 0 && h('span', { className: 'sb-card-clock' }, fmtClock(elapsedSec)),
        h('span', { className: 'sb-card-count' }, done + ' / ' + total + ' подходов')
      ),
      h('div', { className: 'sb-card-bar' },
        h('span', { style: { width: Math.round(ratio * 100) + '%' } })
      ),
      h('button', {
        type: 'button', className: 'sb-card-cta', onClick: onOpen
      },
        h('b', null, running ? 'Продолжить тренировку' : 'Открыть конструктор'),
        current && h('span', null,
          'Упражнение ' + (currentIdx + 1) + ' из ' + exercises.length
          + (current.name ? ' · ' + current.name : '')),
        h('i', null, '›')
      )
    );
  }

  Parts.SummaryCard = SummaryCard;

  /**
   * Входы шторки ⋯ (экран 20). Только рабочие: кнопка в пустоту в разработку не
   * уходит (решение 9). Недоступные объясняют причину, а не просто гаснут.
   */
  function sheetRows(ctx) {
    const exercises = ctx.exercises || [];
    const current = exercises[ctx.openIdx >= 0 ? ctx.openIdx : 0] || {};
    return [
      {
        icon: '🔍', t: 'Каталог упражнений', d: 'Фильтр по мышцам',
        go: function () { ctx.close(); ctx.go('catalog'); }
      },
      {
        icon: '⚡', t: 'Собрать связку', d: 'Суперсет, трисет, круговая',
        off: exercises.length < 2,
        go: function () { ctx.close(); ctx.setLinkFrom(0); ctx.go('superset'); }
      },
      {
        icon: '📈', t: 'История и рекорды', d: 'Динамика веса и тоннажа',
        off: !current.name,
        go: function () { ctx.setHistoryName(current.name || ''); ctx.close(); ctx.go('history'); }
      },
      {
        icon: '↕️', t: 'Порядок упражнений', d: 'Стрелками, связка блоком',
        off: exercises.length < 2,
        go: function () { ctx.close(); ctx.go('order'); }
      },
      {
        icon: '📝', t: 'Заметка и итоги', d: 'Самочувствие, зал, партнёр',
        go: function () { ctx.close(); ctx.go('finish'); }
      }
    ];
  }

  Parts.sheetRows = sheetRows;

  /**
   * Программа куратора, слой 3 (карточка дня). Слой 2 в MCP пишет план в ту
   * же запись тренировки, что и факт (plan + planSnapshot), поэтому карточка
   * читает те же данные, что SummaryCard, но показывает другое действие.
   */
  const SKIP_REASONS = ['Не было времени', 'Мало сил', 'Плохое самочувствие', 'Другие приоритеты'];

  /**
   * Пропуск дня (экран 18, минимальная версия). Перенос на другую дату — открытый
   * вопрос протокола («Перенос назначенной тренировки — операции нет ни в схеме,
   * ни в коде»), сюда сознательно не входит: только «отпустить» день целиком.
   */
  function SkipSheet(props) {
    const { onCancel, onConfirm } = props;
    const [reason, setReason] = React.useState('');
    const [custom, setCustom] = React.useState('');
    return h('div', { className: 'sb-sheet-back', onClick: onCancel },
      h('div', { className: 'sb-sheet', onClick: function (e) { e.stopPropagation(); } },
        h('div', { className: 'sb-sheet-grip' }),
        h('b', { className: 'sb-confirm-title' }, 'Что помешало · необязательно'),
        h('div', { className: 'sb-chips' },
          SKIP_REASONS.map(function (r) {
            return h('button', {
              key: r, type: 'button',
              className: 'sb-chip' + (reason === r ? ' is-on' : ''),
              onClick: function () { setReason(reason === r ? '' : r); }
            }, r);
          })
        ),
        h('input', {
          className: 'sb-ap-field sb-skip-reason-input',
          type: 'text',
          placeholder: 'Своя причина',
          value: custom,
          onChange: function (e) { setCustom(e.target.value); setReason(''); }
        }),
        h('p', { className: 'sb-confirm-text' },
          'Пропуск не считается провалом: он просто не попадёт в объём. Куратор увидит и решение, и причину, если укажешь.'),
        h('div', { className: 'sb-pain-actions' },
          h('button', { type: 'button', className: 'sb-btn', onClick: onCancel }, 'Передумал'),
          h('button', {
            type: 'button', className: 'sb-btn is-accent',
            onClick: function () { onConfirm(custom.trim() || reason || ''); }
          }, 'Отпустить')
        )
      )
    );
  }

  /** Ближайшие свободные дни для переноса (16a). Занятый день не предлагается. */
  function MoveSheet(props) {
    const { options, onCancel, onConfirm } = props;
    const [pick, setPick] = React.useState('');
    return h('div', { className: 'sb-sheet-back', onClick: onCancel },
      h('div', { className: 'sb-sheet', onClick: function (e) { e.stopPropagation(); } },
        h('div', { className: 'sb-sheet-grip' }),
        h('b', { className: 'sb-confirm-title' }, 'Когда сможешь?'),
        h('p', { className: 'sb-confirm-text' },
          'Тренировка переедет целиком, вместе с весами. Куратор увидит новую дату.'),
        h('div', { className: 'sb-move-days' },
          options.map(function (o) {
            return h('button', {
              key: o.date, type: 'button',
              className: 'sb-move-day' + (pick === o.date ? ' is-on' : '') + (o.busy ? ' is-busy' : ''),
              disabled: o.busy,
              onClick: function () { if (!o.busy) setPick(o.date); }
            },
              h('b', null, o.weekday),
              h('span', null, o.human),
              o.busy && h('i', null, 'занят')
            );
          })
        ),
        h('div', { className: 'sb-pain-actions' },
          h('button', { type: 'button', className: 'sb-btn', onClick: onCancel }, 'Передумал'),
          h('button', {
            type: 'button', className: 'sb-btn is-accent',
            disabled: !pick,
            onClick: function () { if (pick) onConfirm(pick); }
          }, pick ? 'Перенести' : 'Выбери день')
        ),
        h('button', {
          type: 'button', className: 'sb-move-skip',
          onClick: function () { if (props.onSkipInstead) props.onSkipInstead(); }
        }, 'Совсем пропустить')
      )
    );
  }

  Parts.MoveSheet = MoveSheet;

  function PlanCard(props) {
    const { training, dateKey, isFutureDay, weekPlace, moveOptions, onStart, onOpenReadonly, onSkip, onMove, onResumeSkipped } = props;
    const wl = (training && training.workoutLog) || {};
    const exercises = Array.isArray(wl.exercises) ? wl.exercises : [];
    const plan = training && training.plan;
    const [skipOpen, setSkipOpen] = React.useState(false);
    const [moveOpen, setMoveOpen] = React.useState(false);
    if (!plan) return null;
    const label = plan.dayLabel || sessionTitle(exercises);
    // Место в неделе вместо даты следующей тренировки — единственное, что
    // осталось от прежнего виджета обзора (дизайн-ревью 2026-08-10, 16c):
    // человеку важно, где он в неделе, а не когда календарно следующий раз.
    const meta = 'назначил ' + (plan.assignedBy || 'куратор')
      + (isFutureDay ? '' : ' · ' + exercises.length + ' упр.')
      + (!isFutureDay && weekPlace ? ' · ' + weekPlace : '');

    if (plan.status === 'moved') {
      // День, с которого тренировку унесли: не пропуск — она ждёт на новой дате.
      return h('div', { className: 'sb-plan-card is-moved' },
        h('b', null, label + ' перенесён'),
        h('span', { className: 'sb-plan-meta' },
          plan.movedTo ? 'Не пропуск — тренировка ждёт ' + humanDate(plan.movedTo) : 'Не пропуск — перенесён')
      );
    }

    if (plan.status === 'skipped') {
      // Пропущенный день остаётся пустым: тоннажа нет, подходов нет (ядро уже
      // фильтрует skipped наравне с assigned) — но передумать можно.
      return h('div', { className: 'sb-plan-card is-skipped' },
        h('b', null, label + ' пропущен'),
        h('span', { className: 'sb-plan-meta' },
          plan.skipReason ? 'Причина: ' + plan.skipReason : 'Без объяснения — и это нормально'),
        h('button', {
          type: 'button', className: 'sb-btn sb-plan-cta',
          onClick: onResumeSkipped
        }, 'Начать всё же')
      );
    }

    if (isFutureDay) {
      // Будущий день: только просмотр состава, старт недоступен раньше своей даты.
      return h('div', { className: 'sb-plan-card' },
        h('div', { className: 'sb-plan-badge' }, 'Запланировано куратором'),
        h('b', null, label),
        h('span', { className: 'sb-plan-meta' }, meta + ' · ' + exercises.length + ' упр.'),
        h('button', {
          type: 'button', className: 'sb-btn sb-plan-cta',
          onClick: onOpenReadonly
        }, 'Посмотреть')
      );
    }

    // Кадр «Актив · план назначен»: заголовок «Сегодня по программе», пилюля
    // «от куратора» справа, состав прозой, «Начать» и под ней ряд из двух.
    // Прежде состав жил в мелкой мете, а перенос и пропуск прятались за одной
    // кнопкой «Не смогу сегодня» — какое из двух действий за ней, было не
    // видно. Разнесены: «Перенести» уходит в выбор даты, «Пропустить» — в
    // причину. Переносить некуда — кнопки нет, а не погашена (то же правило,
    // что у листа действия, контракт строка 29).
    const canMove = !!(moveOptions && moveOptions.length);
    const planProse = label
      + (exercises.length ? ' · ' + exercises.length + ' упр.' : '')
      + (weekPlace ? ' · ' + weekPlace : '')
      + '. В расход не идёт, пока не начнёте.';
    return h('div', { className: 'sb-plan-card' },
      h('div', { className: 'sb-plan-head' },
        h('b', null, 'Сегодня по программе'),
        h('span', { className: 'sb-plan-badge' },
          plan.movedFrom ? 'план с ' + humanDate(plan.movedFrom) : 'от куратора')
      ),
      h('span', { className: 'sb-plan-meta' }, planProse),
      h('button', {
        type: 'button', className: 'sb-btn is-accent sb-plan-cta',
        onClick: onStart
      }, 'Начать'),
      h('div', { className: 'sb-plan-actions' },
        canMove && h('button', {
          type: 'button', className: 'sb-btn sb-plan-skip',
          onClick: function () { setMoveOpen(true); }
        }, 'Перенести'),
        h('button', {
          type: 'button', className: 'sb-btn sb-plan-skip',
          onClick: function () { setSkipOpen(true); }
        }, 'Пропустить')
      ),
      moveOpen && h(MoveSheet, {
        options: moveOptions,
        onCancel: function () { setMoveOpen(false); },
        onConfirm: function (toDate) { setMoveOpen(false); onMove(toDate); },
        onSkipInstead: function () { setMoveOpen(false); setSkipOpen(true); }
      }),
      skipOpen && h(SkipSheet, {
        onCancel: function () { setSkipOpen(false); },
        onConfirm: function (skipReason) { setSkipOpen(false); onSkip(skipReason); }
      })
    );
  }

  Parts.PlanCard = PlanCard;

  Parts.SupersetBlock = SupersetBlock;
  Parts.RestRing = RestRing;
})(typeof window !== 'undefined' ? window : globalThis);
