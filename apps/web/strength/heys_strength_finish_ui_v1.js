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

        // Что из правки куратора легло, а что нет (экран 15b). Эта же строка
        // уходит куратору: без неё он решит, что клиент его проигнорировал, и
        // повторит правку через неделю.
        Parts.ProposalOutcome && h(Parts.ProposalOutcome, { training: training }),

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

  /**
   * История упражнения (экран 21): рекорд, максимум по Эпли и последние
   * тренировки подходами. Данные приходят готовыми — сканы по дням делает день,
   * у конструктора доступа к хранилищу нет.
   */
  function HistoryScreen(props) {
    const { name, usages, record, onBack } = props;
    const TK = HEYS.TrainingKernel;
    const SK = (TK && TK.strength) ? TK.strength : null;
    const meta = HEYS.exerciseMeta;
    const m = (meta && typeof meta.get === 'function') ? meta.get(name) : null;
    const groups = m && meta
      ? [meta.groupLabel(m.primaryGroup)].concat((m.secondaryGroups || [])
        .map(function (g) { return meta.groupLabel(g); })).filter(Boolean).join(' · ')
      : '';

    const rows = (usages || []).map(function (u) {
      let volume = 0;
      let best = 0;
      (u.approaches || []).forEach(function (a) {
        const w = parseFloat(String(a.weightKg || '').replace(',', '.')) || 0;
        const r = +a.reps || 0;
        if (w > 0 && r > 0) {
          volume += w * r;
          const oneRm = epley(w, r);
          if (oneRm > best) best = oneRm;
        }
      });
      return { u: u, volume: volume, best: best };
    });

    const oneRmNow = rows.length ? rows[0].best : 0;
    const oneRmOld = rows.length > 1 ? rows[rows.length - 1].best : 0;
    const delta = oneRmNow && oneRmOld ? Math.round(oneRmNow - oneRmOld) : 0;

    return h('div', { className: 'sb-root sb-screen' },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onBack, 'aria-label': 'Назад'
        }, '‹'),
        h('div', { className: 'sb-head-title' },
          h('b', null, name || 'Упражнение'),
          h('div', { className: 'sb-head-sub' },
            (groups ? groups + ' · ' : '') + rows.length + ' тренировок в истории')
        )
      ),
      h('div', { className: 'sb-list' },
        h('div', { className: 'sb-tiles' },
          h(Tile, {
            label: 'Рекорд',
            value: record && record.maxW > 0 ? record.maxW + ' кг' : '—',
            accent: true
          }),
          h(Tile, {
            label: 'Максимум · Эпли',
            value: oneRmNow ? Math.round(oneRmNow) + ' кг' : '—'
          })
        ),
        delta !== 0 && h('div', { className: 'sb-step-hint' },
          (delta > 0 ? '+' : '') + delta + ' кг расчётного максимума за ' + rows.length + ' тренировок'),

        h('div', { className: 'sb-step' }, h('span', null, 'Последние тренировки')),
        rows.length === 0 && h('div', { className: 'sb-empty' }, 'Это упражнение ещё не делали'),
        rows.map(function (row) {
          return h('div', { className: 'sb-block', key: row.u.dateKey },
            h('div', { className: 'sb-line' },
              h('span', null, row.u.label || row.u.dateKey),
              h('b', null, row.volume > 0 ? Math.round(row.volume) + ' кг' : '—')
            ),
            h('div', { className: 'sb-hist' },
              (row.u.approaches || []).map(function (a, i) {
                const drops = SK ? SK.approachStages(a).filter(function (st) { return st.isDrop; }) : [];
                return h('span', { key: i },
                  (a.weightKg || 'свой') + '×' + (a.reps || '—') + (drops.length ? ' дроп' : ''));
              })
            )
          );
        })
      )
    );
  }

  Fin.HistoryScreen = HistoryScreen;

  Fin.FinishScreen = FinishScreen;
  Fin.epley = epley;
  Fin.bestWorkingSet = bestWorkingSet;
})(typeof window !== 'undefined' ? window : globalThis);
