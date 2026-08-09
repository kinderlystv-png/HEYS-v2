// heys_strength_finish_ui_v1.js — финал тренировки (экран 10).
//
// Здесь метрики уместны — в отличие от карточки дня и самого конструктора, где
// они намеренно спрятаны: в зале человеку нужно следующее действие, а не цифры.
//
// Расчётный максимум считается по Эпли (решение 13 протокола):
//   1RM = вес × (1 + повторы / 30)
// Формула зафиксирована именно здесь, чтобы число не разъехалось с Бржицки.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fin = HEYS.StrengthFinishUI = HEYS.StrengthFinishUI || {};
  if (Fin.__registered) return;
  Fin.__registered = true;

  const React = global.React;
  if (!React) return;
  const h = React.createElement;

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

  /** Эпли: 75 кг × 8 повторов → 95 кг. */
  function epley(weightKg, reps) {
    const w = parseFloat(String(weightKg == null ? '' : weightKg).replace(',', '.'));
    const r = +reps || 0;
    if (!isFinite(w) || w <= 0 || r <= 0) return 0;
    return w * (1 + r / 30);
  }

  /** Лучший рабочий подход тренировки: по нему и считается максимум. */
  function bestWorkingSet(exercises) {
    const TK = HEYS.TrainingKernel;
    const SK = (TK && TK.strength) ? TK.strength : null;
    let best = null;
    (exercises || []).forEach(function (ex) {
      const aps = (ex && ex.approaches) || [];
      aps.forEach(function (a) {
        if (SK && (SK.isWarmupApproach(a) || SK.isBlankApproach(a))) return;
        if (SK && !SK.isApproachDone(a)) return;
        const stages = SK ? SK.approachStages(a) : [{ weightKg: a.weightKg, reps: a.reps }];
        const base = stages[0];
        const oneRm = epley(base.weightKg, base.reps);
        if (oneRm > 0 && (!best || oneRm > best.oneRm)) {
          best = { name: ex.name || '', weightKg: base.weightKg, reps: base.reps, oneRm: oneRm };
        }
      });
    });
    return best;
  }

  function Tile(props) {
    return h('div', { className: 'sb-tile' + (props.accent ? ' is-accent' : '') },
      h('span', null, props.label),
      h('b', null, props.value)
    );
  }

  function FinishScreen(props) {
    const { training, dateKey, elapsedSec, profile, dayTonnageKg, strengthCount, onDone, onBack } = props;
    const TK = HEYS.TrainingKernel;
    const SK = (TK && TK.strength) ? TK.strength : null;
    const Parts = HEYS.StrengthBuilderParts || {};
    const wl = (training && training.workoutLog) || {};
    const exercises = Array.isArray(wl.exercises) ? wl.exercises : [];
    const agg = SK ? SK.trainingTonnage(training, { bodyWeightKg: +(profile && profile.weight) || 0 }) : null;
    const best = bestWorkingSet(exercises);
    const [note, setNote] = React.useState(wl.note || '');

    return h('div', { className: 'sb-root sb-screen' },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onBack, 'aria-label': 'Вернуться к тренировке'
        }, '✕'),
        h('div', { className: 'sb-head-title' },
          h('b', null, 'Тренировка завершена'),
          h('div', { className: 'sb-head-sub' },
            (Parts.sessionTitle ? Parts.sessionTitle(exercises) : 'Силовая')
            + ' · ' + (Parts.humanDate ? Parts.humanDate(dateKey) : ''))
        )
      ),
      h('div', { className: 'sb-list' },
        h('div', { className: 'sb-done' },
          h('b', null, '🎉 Отличная работа!'),
          h('div', { className: 'sb-tiles' },
            h(Tile, { label: 'Длительность', value: fmtClock(elapsedSec) }),
            h(Tile, { label: 'Тоннаж', value: agg ? fmtTonnage(agg.totalVolume) : '—' }),
            h(Tile, { label: 'Макс. вес', value: agg && agg.maxWeight > 0 ? agg.maxWeight + ' кг' : '—' }),
            h(Tile, {
              label: 'Подходов',
              value: agg ? agg.doneApproaches + ' / ' + agg.totalApproaches : '—'
            })
          )
        ),

        // Объём другими величинами — время и метры не смешиваются с килограммами.
        agg && (agg.seconds > 0 || agg.meters > 0) && h('div', { className: 'sb-block' },
          h('div', { className: 'sb-step' }, h('span', null, 'Объём другими величинами')),
          agg.seconds > 0 && h('div', { className: 'sb-line' },
            h('span', null, 'Под нагрузкой'), h('b', null, fmtClock(agg.seconds))),
          agg.meters > 0 && h('div', { className: 'sb-line' },
            h('span', null, 'Дистанция'), h('b', null, Math.round(agg.meters) + ' м'))
        ),

        // «Не посчитали» — честная строка вместо тихого нуля.
        agg && agg.unmeasuredExercises > 0 && h('div', { className: 'sb-block' },
          h('div', { className: 'sb-line' },
            h('span', null, 'Без тоннажа'),
            h('b', null, String(agg.unmeasuredExercises))),
          h('div', { className: 'sb-step-hint' },
            'У этих упражнений неизвестен коэффициент своего веса или нет массы тела в профиле — объём по ним не считали.')
        ),

        best && h('div', { className: 'sb-block' },
          h('div', { className: 'sb-step' },
            h('span', null, 'Расчётный максимум · ' + (best.name || 'лучший подход')),
            h('i', null, Math.round(best.oneRm) + ' кг')
          ),
          h('div', { className: 'sb-step-hint' },
            'Из ' + best.weightKg + ' кг × ' + best.reps + ' по формуле Эпли. '
            + 'Тоннаж растёт и от лишних подходов; максимум из веса и повторов показывает, стал ли человек сильнее.')
        ),

        strengthCount > 1 && h('div', { className: 'sb-total' },
          h('span', null, 'Сегодня всего ×' + strengthCount + ' силовых'),
          h('b', null, fmtTonnage(dayTonnageKg))
        ),

        h('div', { className: 'sb-step' }, h('span', null, 'Заметка к тренировке')),
        h('textarea', {
          className: 'sb-note',
          value: note,
          placeholder: 'Как прошло, что мешало, на что обратить внимание',
          onChange: function (e) { setNote(e.target.value); },
          'aria-label': 'Заметка к тренировке'
        })
      ),
      h('div', { className: 'sb-panel' },
        h('button', {
          type: 'button', className: 'sb-finish is-done', onClick: function () { onDone(note); }
        }, 'Готово')
      )
    );
  }

  Fin.FinishScreen = FinishScreen;
  Fin.epley = epley;
  Fin.bestWorkingSet = bestWorkingSet;
})(typeof window !== 'undefined' ? window : globalThis);
