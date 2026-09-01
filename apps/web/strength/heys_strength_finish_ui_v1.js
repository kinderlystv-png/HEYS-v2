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
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' т';
    return v + ' кг';
  }

  /** Эпли: 75 кг × 8 повторов → 95 кг. */
  function epley(weightKg, reps) {
    const w = parseFloat(String(weightKg == null ? '' : weightKg).replace(',', '.'));
    const r = +reps || 0;
    if (!isFinite(w) || w <= 0 || r <= 0) return 0;
    return w * (1 + r / 30);
  }

  function asNumber(value) {
    const out = parseFloat(String(value == null ? '' : value).replace(',', '.'));
    return isFinite(out) ? out : 0;
  }

  function formatPct(value) {
    const n = Math.round(Math.abs(value || 0));
    if (!n) return '';
    return (value > 0 ? '↑ ' : '↓ ') + n + ' %';
  }

  function formatDayStrengthCount(count) {
    const n = Math.max(1, Math.round(+count || 1));
    const mod10 = n % 10;
    const mod100 = n % 100;
    const noun = mod10 === 1 && mod100 !== 11
      ? 'силовая'
      : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'силовые' : 'силовых');
    const amount = n === 1 ? 'одна' : (n === 2 ? 'две' : String(n));
    return 'Сегодня всего ' + amount + ' ' + noun;
  }

  function Tile(props) {
    return h('div', { className: 'sb-tile' + (props.accent ? ' is-accent' : '') },
      h('span', null, props.label),
      h('b', null, props.value)
    );
  }

  function completedSetCounts(exercises, SK) {
    let working = 0;
    let warmup = 0;
    (exercises || []).forEach(function (exercise) {
      (exercise && Array.isArray(exercise.approaches) ? exercise.approaches : []).forEach(function (approach) {
        if (!SK || !SK.isApproachDone(approach)) return;
        if (SK.isWarmupApproach(approach)) warmup += 1;
        else working += 1;
      });
    });
    return { working: working, warmup: warmup };
  }

  function bestWorkingSet(exercises) {
    const TK = HEYS.TrainingKernel;
    const SK = (TK && TK.strength) ? TK.strength : null;
    let best = null;
    (exercises || []).forEach(function (ex, exerciseIndex) {
      const aps = (ex && ex.approaches) || [];
      aps.forEach(function (a) {
        if (SK && (SK.isWarmupApproach(a) || SK.isBlankApproach(a))) return;
        if (SK && !SK.isApproachDone(a)) return;
        const stages = SK ? SK.approachStages(a) : [{ weightKg: a.weightKg, reps: a.reps }];
        const base = stages[0] || {};
        const oneRm = epley(base.weightKg, base.reps);
        if (oneRm > 0 && (!best || oneRm > best.oneRm)) {
          best = {
            name: ex.name || '', exerciseIndex: exerciseIndex,
            weightKg: base.weightKg, reps: base.reps, oneRm: oneRm
          };
        }
      });
    });
    return best;
  }

  function bestOneRmFromUsage(usage) {
    const TK = HEYS.TrainingKernel;
    const SK = (TK && TK.strength) ? TK.strength : null;
    let best = 0;
    (usage && Array.isArray(usage.approaches) ? usage.approaches : []).forEach(function (approach) {
      if (SK && SK.isWarmupApproach(approach)) return;
      // Legacy rows have no completion bit and historically represent a
      // finished set. In the current schema an explicit false is real debt,
      // not a point for the chart.
      if (Object.prototype.hasOwnProperty.call(approach || {}, 'done')
        && SK && !SK.isApproachDone(approach)) return;
      const value = epley(approach && approach.weightKg, approach && approach.reps);
      if (value > best) best = value;
    });
    return best;
  }

  function oneRmSeries(best, historyDetailFor) {
    if (!best) return [];
    let history = { usages: [] };
    if (typeof historyDetailFor === 'function') {
      try { history = historyDetailFor(best.name, best.exerciseIndex) || history; } catch (_e) { /* read-only evidence */ }
    }
    const previous = (Array.isArray(history.usages) ? history.usages : [])
      .map(bestOneRmFromUsage)
      .filter(function (value) { return value > 0; })
      .slice(0, 5)
      .reverse();
    return previous.concat([best.oneRm]).slice(-6);
  }

  function currentPersonalRecords(exercises, historyFor) {
    const TK = HEYS.TrainingKernel;
    const SK = (TK && TK.strength) ? TK.strength : null;
    if (!SK || typeof historyFor !== 'function') return [];
    const records = [];
    (exercises || []).forEach(function (exercise, exerciseIndex) {
      if (!exercise || !exercise.name) return;
      let currentMaxWeight = 0;
      let currentMaxSet = 0;
      let maxWeightApproach = null;
      let maxSetApproach = null;
      (exercise.approaches || []).forEach(function (approach) {
        if (SK.isWarmupApproach(approach) || SK.isBlankApproach(approach) || !SK.isApproachDone(approach)) return;
        const stages = SK.approachStages(approach);
        const base = stages[0] || {};
        const baseWeight = asNumber(base.weightKg);
        const setVolume = baseWeight * Math.max(0, +base.reps || 0);
        if (baseWeight > currentMaxWeight) {
          currentMaxWeight = baseWeight;
          maxWeightApproach = base;
        }
        if (setVolume > currentMaxSet) {
          currentMaxSet = setVolume;
          maxSetApproach = base;
        }
      });
      let historical = null;
      try {
        const evidence = historyFor(exercise.name, exerciseIndex);
        historical = evidence && evidence.record ? evidence.record : null;
      } catch (_e) { historical = null; }
      if (!historical) return;
      if (currentMaxWeight > (+historical.maxW || 0) || currentMaxSet > (+historical.maxSet || 0)) {
        const recordApproach = currentMaxWeight > (+historical.maxW || 0)
          ? maxWeightApproach
          : maxSetApproach;
        records.push({
          name: exercise.name,
          weightKg: recordApproach && recordApproach.weightKg,
          reps: recordApproach && recordApproach.reps
        });
      }
    });
    return records;
  }

  function unmeasuredRows(exercises, bodyWeightKg, SK) {
    return (exercises || []).filter(function (exercise) {
      return exercise && String(exercise.unit || '') === 'bodyweight'
        && (exercise.approaches || []).some(function (approach) { return SK && SK.isApproachDone(approach); })
        && (!(+bodyWeightKg > 0) || !(asNumber(exercise.bodyweightFactor) > 0));
    }).map(function (exercise) {
      return {
        name: exercise.name || 'упражнение со своим весом',
        reason: !(+bodyWeightKg > 0) ? 'вес тела неизвестен' : 'коэффициент своего веса неизвестен'
      };
    });
  }

  function otherVolumeRows(exercises, bodyWeightKg, SK) {
    const rows = [];
    (exercises || []).forEach(function (exercise) {
      if (!exercise) return;
      const unit = String(exercise.unit || 'weight_reps');
      let value = 0;
      (exercise.approaches || []).forEach(function (approach) {
        if (!SK.isApproachDone(approach)) return;
        if (unit === 'time') value += Math.max(0, +approach.durationSec || 0);
        else if (unit === 'distance') value += Math.max(0, +approach.distanceM || 0);
        else if (unit === 'bodyweight' && +bodyWeightKg > 0 && asNumber(exercise.bodyweightFactor) > 0) {
          const ownWeight = +bodyWeightKg * asNumber(exercise.bodyweightFactor);
          SK.approachStages(approach).forEach(function (stage) {
            value += (ownWeight + SK.approachExtraWeight(approach)) * Math.max(0, +stage.reps || 0);
          });
        }
      });
      if (!(value > 0)) return;
      if (unit === 'time') rows.push({ label: (exercise.name || 'Упражнение') + ' · время', value: fmtClock(value) + ' под нагрузкой', quiet: true });
      else if (unit === 'distance') rows.push({ label: (exercise.name || 'Упражнение') + ' · дистанция', value: Math.round(value) + ' м', quiet: true });
      else if (unit === 'bodyweight') rows.push({ label: (exercise.name || 'Упражнение') + ' · свой вес', value: fmtTonnage(value) + ' в тоннаже' });
    });
    return rows;
  }

  function MetricTile(props) {
    return h('div', { className: 'sb-finish-metric' + (props.accent ? ' is-accent' : '') },
      h('span', { className: 'sb-finish-metric-label' }, props.label),
      h('span', { className: 'sb-finish-metric-line' },
        h('b', null, props.value),
        props.delta && h('i', { className: props.delta < 0 ? 'is-down' : '' }, formatPct(props.delta))
      )
    );
  }

  function FeedbackField(props) {
    return h('label', { className: 'sb-finish-feedback ' + props.tone },
      h('input', {
        type: 'number', min: 1, max: 10, inputMode: 'numeric',
        value: props.value || '',
        placeholder: '—',
        'aria-label': props.label,
        onChange: function (event) {
          const raw = Math.round(+event.target.value || 0);
          props.onChange(raw > 0 ? Math.max(1, Math.min(10, raw)) : 0);
        }
      }),
      h('span', null, props.label)
    );
  }

  function FinishScreen(props) {
    const { training, dateKey, elapsedSec, bodyWeightKg, dayTonnageKg, strengthCount,
      previousComparableTonnageKg, historyFor, historyDetailFor, onDone, onBack } = props;
    const TK = HEYS.TrainingKernel;
    const SK = (TK && TK.strength) ? TK.strength : null;
    const Parts = HEYS.StrengthBuilderParts || {};
    const wl = (training && training.workoutLog) || {};
    const exercises = Array.isArray(wl.exercises) ? wl.exercises : [];
    const sessionBodyWeightKg = +bodyWeightKg > 0 ? +bodyWeightKg : 0;
    const agg = SK ? SK.trainingTonnage(training, { bodyWeightKg: sessionBodyWeightKg }) : null;
    const best = bestWorkingSet(exercises);
    const [note, setNote] = React.useState(wl.note || '');
    const [feedback, setFeedback] = React.useState(function () {
      const source = wl.feedback && typeof wl.feedback === 'object' ? wl.feedback : {};
      return { mood: +source.mood || 0, wellbeing: +source.wellbeing || 0, stress: +source.stress || 0 };
    });
    const setCounts = completedSetCounts(exercises, SK);
    const records = currentPersonalRecords(exercises, historyFor);
    const missing = unmeasuredRows(exercises, sessionBodyWeightKg, SK);
    const otherRows = SK ? otherVolumeRows(exercises, sessionBodyWeightKg, SK) : [];
    const series = oneRmSeries(best, historyDetailFor);
    const comparableTonnageKg = +previousComparableTonnageKg > 0 ? +previousComparableTonnageKg : 0;
    const tonnageDeltaPct = comparableTonnageKg > 0 && agg
      ? ((agg.totalVolume - comparableTonnageKg) / comparableTonnageKg) * 100
      : 0;
    const record = records[0] || null;

    function patchFeedback(key, value) {
      setFeedback(function (current) {
        return Object.assign({}, current, { [key]: value });
      });
    }

    function recordLabel(value) {
      if (!value) return '—';
      const weight = asNumber(value.weightKg);
      const reps = Math.max(0, +value.reps || 0);
      return value.name + (weight > 0 && reps > 0 ? ' · ' + weight + ' × ' + reps : '');
    }

    function chartHeight(value) {
      if (!series.length) return 41;
      const min = Math.min.apply(null, series);
      const max = Math.max.apply(null, series);
      if (max <= min) return 60;
      return Math.floor(41 + ((value - min) / (max - min)) * 37);
    }

    return h('div', { className: 'sb-root sb-screen sb-finish-screen' },
      h('div', { className: 'sb-head sb-finish-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onBack, 'aria-label': 'Вернуться к тренировке'
        }, '✕'),
        h('div', { className: 'sb-head-title' },
          h('b', null, 'Тренировка завершена'),
          h('div', { className: 'sb-head-sub' },
            (Parts.sessionTitle ? Parts.sessionTitle(exercises) : 'Силовая')
            + ' · ' + (Parts.humanDate ? Parts.humanDate(dateKey).replace(/^[^,]+,\s*/, '') : ''))
        )
      ),
      h('div', { className: 'sb-list sb-finish-list' },
        h('section', { className: 'sb-finish-hero' },
          h('div', { className: 'sb-finish-praise' }, 'Отличная работа'),
          h('div', { className: 'sb-finish-metrics' },
            h(MetricTile, { label: 'Длительность', value: fmtClock(elapsedSec) }),
            h(MetricTile, { label: 'Тоннаж', value: agg ? fmtTonnage(agg.totalVolume) : '—', delta: tonnageDeltaPct }),
            h(MetricTile, { label: 'Макс. вес', value: agg && agg.maxWeight > 0 ? fmtTonnage(agg.maxWeight) : '—' }),
            h(MetricTile, { label: 'Рекорды', value: String(records.length), accent: records.length > 0 })
          )
        ),

        h('section', { className: 'sb-finish-detail' },
          h('div', { className: 'sb-finish-row' },
            h('span', null, 'Рабочих подходов'),
            h('b', null, String(setCounts.working))),
          h('div', { className: 'sb-finish-row' },
            h('span', null, 'Разминочных'),
            h('b', { className: 'is-quiet' }, setCounts.warmup + ' · вне объёма')),
          h('div', { className: 'sb-finish-row' },
            h('span', null, 'Рекорд'),
            h('b', { className: record ? 'is-record' : 'is-quiet' }, recordLabel(record))),
          h('div', { className: 'sb-finish-row sb-finish-row--reason' },
            h('span', null,
              h('span', null, 'Без объёма'),
              h('small', null, missing.length
                ? missing.map(function (row) { return row.name + ' — ' + row.reason; }).join('; ')
                : 'всё посчитано')),
            h('b', { className: 'is-quiet' }, missing.length ? missing.length + ' упр.' : '0')),
          agg && agg.totalApproaches > agg.doneApproaches && h('div', { className: 'sb-finish-row is-warning' },
            h('span', null, 'Остались незакрытые'),
            h('b', null, String(agg.totalApproaches - agg.doneApproaches)))
        ),

        // Что из правки куратора легло, а что нет (экран 15b). Эта же строка
        // уходит куратору: без неё он решит, что клиент его проигнорировал, и
        // повторит правку через неделю.
        Parts.ProposalOutcome && h(Parts.ProposalOutcome, { training: training }),

        h('div', { className: 'sb-finish-tier' }, 'Как оно прошло'),
        h('section', { className: 'sb-finish-feedback-card' },
          h('div', { className: 'sb-finish-feedback-grid' },
            h(FeedbackField, { label: 'настроение', value: feedback.mood, tone: 'is-mood', onChange: function (value) { patchFeedback('mood', value); } }),
            h(FeedbackField, { label: 'самочувствие', value: feedback.wellbeing, tone: 'is-wellbeing', onChange: function (value) { patchFeedback('wellbeing', value); } }),
            h(FeedbackField, { label: 'стресс', value: feedback.stress, tone: 'is-stress', onChange: function (value) { patchFeedback('stress', value); } })
          ),
          h('input', {
            className: 'sb-finish-note', type: 'text', value: note,
            placeholder: 'Заметка к тренировке',
            onChange: function (event) { setNote(event.target.value); },
            'aria-label': 'Заметка к тренировке'
          })
        ),

        best && h(React.Fragment, null,
          h('div', { className: 'sb-finish-tier' }, 'Расчётный максимум · ' + (best.name || 'лучший подход')),
          h('section', { className: 'sb-finish-chart-card' },
            h('div', { className: 'sb-finish-chart-head' },
              h('span', null, 'по весу и повторам каждой тренировки'),
              h('b', null, Math.round(best.oneRm) + ' кг')),
            h('div', { className: 'sb-finish-chart', 'aria-label': 'Динамика расчётного максимума' },
              series.map(function (value, index) {
                const latest = index === series.length - 1;
                return h('span', { className: 'sb-finish-chart-column' + (latest ? ' is-latest' : ''), key: index },
                  h('b', null, String(Math.round(value))),
                  h('i', { style: { height: chartHeight(value) + 'px' } }),
                  h('small', null, 'н' + (index + 1))
                );
              })
            ),
            h('p', null, 'Тоннаж растёт и от лишних подходов. Максимум из веса и повторов показывает, стал ли человек сильнее.')
          )
        ),

        h('section', { className: 'sb-finish-detail sb-finish-day-total' },
          h('div', { className: 'sb-finish-row is-last' },
            h('span', null, formatDayStrengthCount(strengthCount)),
            h('b', null, fmtTonnage(dayTonnageKg > 0 ? dayTonnageKg : (agg ? agg.totalVolume : 0))))
        ),

        otherRows.length > 0 && h(React.Fragment, null,
          h('div', { className: 'sb-finish-tier' }, 'Объём другими величинами'),
          h('section', { className: 'sb-finish-detail sb-finish-other' },
            otherRows.map(function (row, index) {
              return h('div', { className: 'sb-finish-row' + (index === otherRows.length - 1 ? ' is-last' : ''), key: row.label },
                h('span', null, row.label),
                h('b', { className: row.quiet ? 'is-quiet' : '' }, row.value));
            })
          ),
          h('p', { className: 'sb-finish-footnote' }, 'Своя строка, а не пропуск: иначе человек решит, что работа потерялась. Время и метры в тоннаж не идут — килограммы на секунды не умножаются. Свой вес идёт через коэффициент; нет коэффициента — здесь стоит строка «не посчитали».')
        ),

        h('button', {
          type: 'button', className: 'sb-finish-done',
          onClick: function () { onDone(note, feedback); }
        }, 'Готово'),
        h('p', { className: 'sb-finish-footnote' }, 'Упражнения, которые не попали в объём, названы поимённо с причиной: секунды и метры копятся своими величинами, а свой вес без известной массы тела не считается вовсе.')
      ),
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
