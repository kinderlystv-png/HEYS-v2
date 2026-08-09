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

  Parts.SupersetBlock = SupersetBlock;
  Parts.RestRing = RestRing;
})(typeof window !== 'undefined' ? window : globalThis);
