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
    if (v >= 1000) {
      return (v / 1000).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' т';
    }
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + ' кг';
  }

  function fmtVolumeKg(kg) {
    return String(Math.round(kg || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + ' кг';
  }

  function fmtTime(ms) {
    const d = new Date(ms || 0);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function fmtAbsence(totalSec) {
    const s = Math.max(0, Math.floor(totalSec || 0));
    if (s < 60 * 60) return fmtClock(s);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    return String(hours) + ':' + String(minutes).padStart(2, '0');
  }

  function unitEntryLabel(unit) {
    if (unit === 'time') return 'единица — время';
    if (unit === 'distance') return 'единица — метры';
    if (unit === 'bodyweight') return 'свой вес';
    return '';
  }

  function formatFactorLabel(factor) {
    const n = parseFloat(String(factor == null ? '' : factor).replace(',', '.'));
    if (!isFinite(n)) return null;
    return n.toFixed(1).replace('.', ',');
  }

  function bodyweightHeadKey(ex) {
    const label = formatFactorLabel(ex && ex.bodyweightFactor);
    return label ? ('свой вес · коэффициент ' + label) : 'свой вес';
  }

  function approachAddonKg(approach) {
    const SK = kernel();
    if (SK && typeof SK.approachExtraWeight === 'function') {
      const extra = SK.approachExtraWeight(approach);
      if (extra > 0) return extra;
    }
    const w = parseFloat(String((approach && approach.weightKg) || '').replace(',', '.'));
    return isFinite(w) && w > 0 ? w : 0;
  }

  function bodyweightGroupTitle(startWorkNo, count, hasAddon) {
    if (count === 2 && startWorkNo === 1) return 'Первые два подхода';
    if (count === 1 && hasAddon) {
      const ord = { 1: 'Первый', 2: 'Второй', 3: 'Третий', 4: 'Четвёртый', 5: 'Пятый' };
      return (ord[startWorkNo] || (startWorkNo + '-й')) + ' · с довесом';
    }
    if (count === 1) return startWorkNo + '-й подход';
    return 'Подходы ' + startWorkNo + '–' + (startWorkNo + count - 1);
  }

  function perRepBodyweightLabel(ownKg, addon) {
    const own = Math.round(ownKg);
    const add = Math.round(addon);
    if (add > 0) return own + ' + ' + add + ' = ' + (own + add) + ' кг за повтор';
    return own + ' кг за повтор';
  }

  function bodyweightEntrySummary(ex, bodyWeightKg) {
    const SK = kernel();
    if (!ex || (ex.unit || 'weight_reps') !== 'bodyweight') return null;
    const factor = parseFloat(String(ex.bodyweightFactor == null ? '' : ex.bodyweightFactor).replace(',', '.'));
    const ownKg = isFinite(factor) && factor > 0 && bodyWeightKg > 0 ? bodyWeightKg * factor : null;
    if (ownKg === null) return null;

    const groups = [];
    let current = null;
    let workNo = 0;
    (Array.isArray(ex.approaches) ? ex.approaches : []).forEach(function (approach) {
      if (SK && (SK.isWarmupApproach(approach) || SK.isBlankApproach(approach))) return;
      if (!SK || !SK.isApproachDone(approach)) return;
      workNo += 1;
      const addon = approachAddonKg(approach);
      const reps = +approach.reps || 0;
      const eff = ownKg + addon;
      const volume = Math.round(eff * reps);
      if (current && current.addon === addon) {
        current.count += 1;
        current.volume += volume;
      } else {
        if (current) groups.push(current);
        current = {
          startWorkNo: workNo,
          count: 1,
          addon: addon,
          eff: eff,
          volume: volume
        };
      }
    });
    if (current) groups.push(current);
    if (!groups.length) return null;

    const rows = groups.map(function (group) {
      return {
        title: bodyweightGroupTitle(group.startWorkNo, group.count, group.addon > 0),
        subtitle: perRepBodyweightLabel(ownKg, group.addon),
        volume: group.volume,
        isTotal: false
      };
    });
    const total = rows.reduce(function (sum, row) { return sum + row.volume; }, 0);
    rows.push({ title: 'Упражнение', subtitle: '', volume: total, isTotal: true });
    return { rows: rows, total: total, ownKg: ownKg };
  }

  function approachCountLabel(n) {
    const t = Math.abs(n) % 100;
    const d = t % 10;
    if (t > 10 && t < 20) return n + ' подходов';
    if (d === 1) return n + ' подход';
    if (d >= 2 && d <= 4) return n + ' подхода';
    return n + ' подходов';
  }

  function exerciseDurationTotalSec(ex) {
    let sec = 0;
    (ex && Array.isArray(ex.approaches) ? ex.approaches : []).forEach(function (a) {
      if (a && a.done && Number.isFinite(+a.durationSec) && +a.durationSec > 0) sec += +a.durationSec;
    });
    return sec;
  }

  function exerciseDistanceTotalM(ex) {
    let meters = 0;
    (ex && Array.isArray(ex.approaches) ? ex.approaches : []).forEach(function (a) {
      if (a && a.done && Number.isFinite(+a.distanceM) && +a.distanceM > 0) meters += +a.distanceM;
    });
    return meters;
  }

  function formatDistanceM(meters) {
    const n = Math.round(meters);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' м';
  }

  function pluralChanges(n) {
    const t = Math.abs(n) % 100;
    const d = t % 10;
    if (t > 10 && t < 20) return 'изменений';
    if (d === 1) return 'изменение';
    if (d >= 2 && d <= 4) return 'изменения';
    return 'изменений';
  }

  function exerciseById(list, id) {
    return (Array.isArray(list) ? list : []).find(function (ex) { return ex && ex.id === id; }) || null;
  }

  function proposalLockIcon() {
    return h('svg', {
      width: 11,
      height: 11,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2.75,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true'
    },
      h('rect', { x: 4, y: 11, width: 16, height: 10, rx: 2.5 }),
      h('path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' })
    );
  }

  /** Незакрытый подход начатого упражнения, который правка ещё меняет (кадр Л2 ·20–23). */
  function frozenPartialDetail(liveEx, proposedEx, ks) {
    if (!liveEx || !proposedEx || !ks) return null;
    const liveAps = liveEx.approaches || [];
    const propAps = proposedEx.approaches || [];
    for (let i = 0; i < liveAps.length; i++) {
      const la = liveAps[i];
      if (ks.isApproachDone(la)) continue;
      const pa = propAps[i];
      if (!pa) continue;
      const wLive = la.weightKg == null || la.weightKg === '' ? '' : String(la.weightKg);
      const wProp = pa.weightKg == null || pa.weightKg === '' ? '' : String(pa.weightKg);
      const rLive = la.reps;
      const rProp = pa.reps;
      if (wLive !== wProp || rLive !== rProp) {
        const n = i + 1;
        return {
          approachNo: n,
          tag: 'править ' + n + '-й',
          label: 'Подход ' + n + ' · не закрыт',
          oldReps: rLive != null && rLive !== '' ? String(rLive) : '',
          newWeight: wProp && wProp !== '0' ? wProp + ' кг' : ''
        };
      }
    }
    return null;
  }

  /**
   * Кадр Л2 «Правка · клиент уже начал»: полный разбор поверх идущей
   * тренировки. Шапка — как у конструктора; тело — замороженное и впереди.
   */
  function ProposalStartedScreen(props) {
    const Parts = HEYS.StrengthBuilderParts || {};
    const {
      training, exercises, startedAt, elapsedSec, agg, onClose, onAccept, onDecline
    } = props;
    const ks = kernel();
    const proposal = ks && ks.pendingPlanProposal(training);
    if (!proposal) return null;
    const wl = (training && training.workoutLog) || {};
    const diff = Parts.describePlanEdit
      ? Parts.describePlanEdit(wl.exercises || exercises, proposal.exercises)
      : { frozen: [], ahead: [] };
    const who = proposal.proposedBy || 'Куратор';
    const dayLabel = (training.plan && training.plan.dayLabel) || 'План на сегодня';
    const changeCount = diff.ahead.length;
    const acceptLabel = changeCount > 0
      ? 'Принять · ' + changeCount + ' ' + pluralChanges(changeCount)
      : 'Принять';

    return h('div', { className: 'sb-root sb-builder-screen sb-proposal-started' },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn',
          onClick: onClose, 'aria-label': 'Закрыть разбор'
        }, '✕'),
        h('div', { className: 'sb-head-title' },
          h('b', null, dayLabel),
          h('div', { className: 'sb-head-sub' },
            'по плану ' + who + (elapsedSec > 0 ? ' · идёт ' + fmtClock(elapsedSec) : ''))
        ),
        agg && h('span', { className: 'sb-proposal-started-badge' },
          agg.doneApproaches + ' / ' + agg.totalApproaches + ' ✓')
      ),
      h('div', { className: 'sb-list sb-proposal-started-scroll' },
        h('div', { className: 'sb-proposal-started-banner' },
          h('span', { className: 'sb-proposal-started-banner-icon' }, who.slice(0, 1)),
          h('span', { className: 'sb-proposal-started-banner-main' },
            h('b', null, who + ' подправил план'),
            h('span', null, 'сделанное не тронется — только то, что впереди')
          )
        ),
        diff.frozen.length > 0 && h('div', { className: 'sb-proposal-started-block' },
          diff.frozen.map(function (row, i) {
            const liveEx = exerciseById(wl.exercises || exercises, row.id);
            const propEx = exerciseById(proposal.exercises, row.id);
            const partial = frozenPartialDetail(liveEx, propEx, ks);
            const summary = partial && partial.approachNo > 1
              ? 'подходы 1–' + (partial.approachNo - 1) + ' закрыты · заморожены'
              : row.summary;
            return h('div', {
              key: 'f' + i,
              className: 'sb-proposal-started-card is-frozen' + (partial ? ' is-partial' : '')
            },
              h('span', { className: 'sb-proposal-started-lock', 'aria-hidden': 'true' }, proposalLockIcon()),
              h('span', { className: 'sb-proposal-started-card-main' },
                h('b', null, row.name),
                h('span', null, summary)
              ),
              partial && h('div', { className: 'sb-proposal-started-detail' },
                h('span', { className: 'sb-proposal-started-detail-label' }, partial.label),
                partial.oldReps && h('span', { className: 'sb-proposal-started-detail-old' }, partial.oldReps),
                partial.newWeight && h('span', { className: 'sb-proposal-started-detail-new' }, partial.newWeight)
              ),
              h('span', {
                className: 'sb-proposal-started-tag' + (partial ? ' is-edit' : ' is-done')
              }, partial ? partial.tag : 'сделано')
            );
          })
        ),
        diff.ahead.length > 0 && h('div', { className: 'sb-proposal-started-block' },
          diff.ahead.map(function (row, i) {
            const tag = row.kind === 'removed' ? 'убрать'
              : row.kind === 'added' ? 'добавить'
                : row.kind === 'changed' ? 'править'
                  : '';
            const isPlain = row.kind === 'same';
            return h('div', {
              key: 'a' + i,
              className: 'sb-proposal-started-card'
                + (row.kind === 'removed' ? ' is-remove' : '')
                + (row.kind === 'changed' ? ' is-change' : '')
                + (isPlain ? ' is-plain' : '')
            },
              h('span', { className: 'sb-proposal-started-num' }, String(i + 1)),
              h('span', { className: 'sb-proposal-started-card-main' },
                h('b', null, row.name),
                h('span', null, row.detail || row.before || '')
              ),
              tag
                ? h('span', {
                  className: 'sb-proposal-started-tag'
                    + (row.kind === 'removed' ? ' is-remove' : ' is-change')
                }, tag)
                : isPlain && h('span', { className: 'sb-proposal-started-tag is-empty', 'aria-hidden': 'true' })
            );
          })
        ),
        h('button', {
          type: 'button', className: 'sb-btn is-accent sb-proposal-started-accept',
          onClick: onAccept
        }, acceptLabel),
        h('p', { className: 'sb-proposal-started-footnote' },
          'Заморожены именно подходы, а не упражнения целиком: незакрытые подходы начатого упражнения править можно, включая их число. Начатое упражнение из плана не исчезает, даже если куратор его вычеркнул.'),
        onDecline && h('button', {
          type: 'button', className: 'sb-btn sb-proposal-started-decline',
          onClick: onDecline
        }, 'Оставить прежнюю')
      )
    );
  }

  var EX_CARD_UNIT_LABELS = {
    weight_reps: 'кг × повт',
    bodyweight: 'свой вес',
    time: 'время',
    distance: 'метры'
  };

  /**
   * Кадр М1 «Упражнение · карточка»: единая форма — имя, единица, группы,
   * коэффициент только у своего веса. Одна кнопка «Сохранить упражнение».
   */
  function ExerciseCardScreen(props) {
    const { initialName, onDone, onCancel } = props;
    const api = HEYS.exerciseMeta;
    const [name, setName] = React.useState(initialName || '');
    const [unit, setUnit] = React.useState('');
    const [primary, setPrimary] = React.useState('');
    const [secondary, setSecondary] = React.useState([]);
    const [picker, setPicker] = React.useState('');

    if (!api) return null;

    const ready = !!String(name).trim() && !!unit && !!primary;
    const share = typeof api.synergistShare === 'number' ? api.synergistShare : 0.5;
    const shareLabel = share === 0.5 ? 'половину' : Math.round(share * 100) + '%';

    function toggleGroup(id) {
      if (picker === 'primary') {
        setPrimary(id);
        setSecondary(secondary.filter(function (x) { return x !== id; }));
        setPicker('');
        return;
      }
      if (picker === 'secondary') {
        if (id === primary) return;
        if (secondary.indexOf(id) >= 0) {
          setSecondary(secondary.filter(function (x) { return x !== id; }));
        } else {
          setSecondary(secondary.concat([id]));
        }
        return;
      }
    }

    function save() {
      const res = api.save(name, {
        primaryGroup: primary,
        secondaryGroups: secondary,
        unit: unit,
        bodyweightFactor: unit === 'bodyweight' ? null : null
      });
      if (res.ok) onDone(String(name).trim());
    }

    const secondaryText = secondary.map(function (id) {
      return api.groupLabel(id).toLowerCase();
    }).join(', ');

    return h('div', {
      className: 'sb-root sb-screen sb-exercise-card-screen'
    },
      h('div', { className: 'sb-head sb-ex-card-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn', onClick: onCancel, 'aria-label': 'Отменить'
        }, '✕'),
        h('div', { className: 'sb-head-title sb-ex-card-head-title' },
          h('b', null, 'Новое упражнение'),
          h('div', { className: 'sb-head-sub' }, 'своё, не из каталога')
        )
      ),
      h('div', { className: 'sb-list sb-ex-card-scroll' },
        h('input', {
          className: 'sb-ap-field sb-ex-card-name',
          type: 'text',
          value: name,
          placeholder: 'Название упражнения',
          onChange: function (e) { setName(e.target.value); },
          'aria-label': 'Название упражнения'
        }),

        h('div', { className: 'sb-ex-card-tier' }, 'Чем меряется'),
        h('div', { className: 'sb-ex-card-units' },
          api.units.map(function (u) {
            const label = EX_CARD_UNIT_LABELS[u.id] || u.label.toLowerCase();
            return h('button', {
              key: u.id,
              type: 'button',
              className: 'sb-ex-card-pill' + (unit === u.id ? ' is-on' : ''),
              onClick: function () { setUnit(u.id); setPicker(''); }
            }, label);
          })
        ),
        unit && h('p', { className: 'sb-ex-card-footnote' },
          'Единица решает две вещи сразу: состав колонок в таблице и то, попадёт ли упражнение в тоннаж. '
          + 'Метры и время не попадают — у них своя строка в итогах.'),

        h('div', { className: 'sb-ex-card-tier' }, 'Какие мышцы'),
        picker && h('div', { className: 'sb-ex-card-picker' },
          api.groups.map(function (g) {
            const isPrimary = g.id === primary;
            const isSecondary = secondary.indexOf(g.id) >= 0;
            const isOn = picker === 'primary' ? isPrimary : isSecondary;
            return h('button', {
              key: g.id,
              type: 'button',
              className: 'sb-ex-card-pill sb-ex-card-pill--pick' + (isOn ? ' is-on' : ''),
              onClick: function () { toggleGroup(g.id); }
            }, g.label.toLowerCase());
          }),
          h('button', {
            type: 'button',
            className: 'sb-ex-card-picker-done',
            onClick: function () { setPicker(''); }
          }, 'Готово')
        ),
        !picker && h('div', { className: 'sb-ex-card-cd' },
          primary && h('div', { className: 'sb-ex-card-row' },
            h('span', { className: 'sb-ex-card-row-copy' },
              h('b', null, 'Основная · ' + api.groupLabel(primary).toLowerCase()),
              h('span', null, 'берёт полный объём')
            ),
            h('button', {
              type: 'button',
              className: 'sb-ex-card-action',
              onClick: function () { setPicker('primary'); }
            }, 'сменить')
          ),
          h('div', {
            className: 'sb-ex-card-row' + (!secondary.length ? ' is-last' : '')
          },
            h('span', { className: 'sb-ex-card-row-copy' },
              h('b', null, secondary.length
                ? ('Синергисты · ' + secondaryText)
                : 'Синергисты'),
              h('span', null, secondary.length ? ('берут ' + shareLabel) : 'по желанию')
            ),
            h('button', {
              type: 'button',
              className: 'sb-ex-card-action',
              onClick: function () { setPicker('secondary'); }
            }, 'выбрать')
          )
        ),

        h('div', { className: 'sb-ex-card-tier' }, 'Коэффициент своего веса'),
        h('div', { className: 'sb-ex-card-cd' },
          h('div', { className: 'sb-ex-card-row is-last' },
            h('span', { className: 'sb-ex-card-row-copy' },
              h('b', { className: 'sb-ex-card-muted' }, 'Не спрашиваем'),
              h('span', null, unit === 'bodyweight'
                ? 'выберите «на что похоже» после сохранения'
                : 'единица не «свой вес» — поля нет')
            )
          )
        ),

        h('button', {
          type: 'button',
          className: 'sb-finish sb-ex-card-save',
          disabled: !ready,
          onClick: save
        }, 'Сохранить упражнение'),
        h('p', { className: 'sb-ex-card-footnote sb-ex-card-footnote--tail' },
          'Карточка спрашивает ровно то, без чего расчёт неверен, и ни одного поля сверх: единицу, '
          + 'группы и — только для своего веса — коэффициент. Ничего из этого не заполняется за человека молча.')
      )
    );
  }

  function repeatDateLabel(dateKey) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
    if (!m) return String(dateKey || '');
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return String(+m[3]) + ' ' + months[+m[2] - 1];
  }

  function restRemainingSec(activeRestObj, now) {
    const raw = activeRestObj && typeof activeRestObj === 'object' ? activeRestObj : null;
    const startedAt = raw && Number.isFinite(+raw.startedAt) ? +raw.startedAt : 0;
    const total = raw && Number.isFinite(+raw.total) ? +raw.total : 0;
    if (!startedAt || !total) return 0;
    return Math.max(0, Math.ceil((startedAt + total * 1000 - (now || Date.now())) / 1000));
  }

  function closeIconButton(onClose, label) {
    return h('button', {
      type: 'button',
      className: 'sb-icon-btn sb-icon-btn--close',
      onClick: onClose,
      'aria-label': label || 'Закрыть'
    }, h('svg', {
      width: 16,
      height: 16,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2.75,
      strokeLinecap: 'round',
      'aria-hidden': 'true'
    }, h('path', { d: 'M6 6l12 12M18 6L6 18' })));
  }

  function exerciseCountLabel(count) {
    const n = Math.max(0, Math.round(+count || 0));
    const mod100 = n % 100;
    const mod10 = n % 10;
    const word = mod100 >= 11 && mod100 <= 14 ? 'упражнений'
      : mod10 === 1 ? 'упражнение'
        : mod10 >= 2 && mod10 <= 4 ? 'упражнения' : 'упражнений';
    return n + ' ' + word;
  }

  function plannedExercisesFor(training) {
    const plan = training && training.plan;
    const snapshot = training && training.planSnapshot;
    const source = snapshot && Array.isArray(snapshot.exercises) ? snapshot.exercises : [];
    if (!plan || plan.status !== 'assigned' || !source.length) return null;
    if (!source.every(function (ex) { return ex && String(ex.name || '').trim(); })) return null;
    return source.map(function (ex) {
      const next = Object.assign({}, ex);
      next.approaches = (Array.isArray(ex.approaches) ? ex.approaches : []).map(function (approach) {
        const fresh = Object.assign({}, approach, { done: false });
        if (Array.isArray(approach && approach.drops)) {
          fresh.drops = approach.drops.map(function (drop) {
            return Object.assign({}, drop, { done: false });
          });
        }
        return fresh;
      });
      return next;
    });
  }

  function planRevisionFor(plan) {
    if (!plan || typeof plan !== 'object') return null;
    return {
      id: plan.id || null,
      assignedAt: Number.isFinite(+plan.assignedAt) ? +plan.assignedAt : null
    };
  }

  function samePlanRevision(left, right) {
    return !!left && !!right && left.id === right.id && left.assignedAt === right.assignedAt;
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
      lastSessionFor, finishSummaryFor, onRepeatLast, onStartPlan, onStartCustom, syncStatusFor,
      onReviewProposal, onProposalAccept, onProposalDecline, onFinishProposal, onClose } = props;
    const SK = kernel();
    const wl = (training && training.workoutLog) || {};
    const [openIdx, setOpenIdx] = React.useState(0);
    const [view, setView] = React.useState('list');
    const [warmupDropIdx, setWarmupDropIdx] = React.useState(-1);
    const [approachTypesIdx, setApproachTypesIdx] = React.useState(-1);
    const [dropSetCtx, setDropSetCtx] = React.useState(null);
    const [draftName, setDraftName] = React.useState('');
    const [linkFrom, setLinkFrom] = React.useState(0);
    const [sheetOpen, setSheetOpen] = React.useState(false);
    const [closeConfirm, setCloseConfirm] = React.useState(false);
    const [historyName, setHistoryName] = React.useState('');
    const [dismissedBreakAt, setDismissedBreakAt] = React.useState(0);
    const [finishAtOverride, setFinishAtOverride] = React.useState(0);
    const [emptyActionPending, setEmptyActionPending] = React.useState(false);
    const [consumedPlanRevision, setConsumedPlanRevision] = React.useState(null);
    const [renumberCtx, setRenumberCtx] = React.useState(null);
    const [approachUndo, setApproachUndo] = React.useState(null);
    const skipUndoToastRef = React.useRef(false);
    const [rest, setRest] = React.useState(function () {
      return restoreActiveRest(wl.activeRest, Date.now());
    });
    const sessionRef = React.useRef(Object.assign({}, wl));
    const closeConfirmDialogRef = React.useRef(null);
    const finishButtonRef = React.useRef(null);
    const [tick, setTick] = React.useState(0);

    function dismissCloseConfirm() {
      setCloseConfirm(false);
      global.setTimeout(function () {
        if (finishButtonRef.current && typeof finishButtonRef.current.focus === 'function') {
          finishButtonRef.current.focus();
        }
      }, 0);
    }

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
      const markAt = Number.isFinite(+wl.lastMarkAt) ? +wl.lastMarkAt : 0;
      const interruptedOnMount = markAt && !wl.completedAt && Date.now() - markAt > 45 * 60 * 1000;
      if (wl.activeRest && !rest && !interruptedOnMount && typeof onPatchSession === 'function') {
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
    const breakSec = lastMarkAt && !completedAt
      ? Math.max(0, Math.floor((Date.now() - lastMarkAt) / 1000))
      : 0;
    const showInterrupted = breakSec > 45 * 60 && dismissedBreakAt !== lastMarkAt;

    React.useEffect(function () {
      if (!startedAt || completedAt) return undefined;
      const id = global.setInterval(function () { setTick(function (t) { return t + 1; }); }, 1000);
      return function () { global.clearInterval(id); };
    }, [startedAt, completedAt]);

    React.useEffect(function () {
      if (!approachUndo) return undefined;
      const id = global.setTimeout(function () { setApproachUndo(null); }, 5000);
      return function () { global.clearTimeout(id); };
    }, [approachUndo]);

    React.useEffect(function () {
      if (!closeConfirm || !global.document) return undefined;
      function onConfirmKeyDown(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          dismissCloseConfirm();
          return;
        }
        if (event.key !== 'Tab') return;
        const dialog = closeConfirmDialogRef.current;
        if (!dialog) return;
        const focusable = Array.from(dialog.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = global.document.activeElement;
        if (event.shiftKey && (active === first || !dialog.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
          event.preventDefault();
          first.focus();
        }
      }
      global.document.addEventListener('keydown', onConfirmKeyDown);
      return function () { global.document.removeEventListener('keydown', onConfirmKeyDown); };
      // Закрытие подтверждения возвращает фокус через refs текущего fullscreen.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [closeConfirm]);

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

    function collapsedExerciseRow(exercise, index) {
      const source = exercise || {};
      const approaches = Array.isArray(source.approaches) ? source.approaches : [];
      const workApproaches = approaches.filter(function (approach) {
        return !(SK && SK.isWarmupApproach(approach));
      });
      const doneCount = workApproaches.filter(function (approach) {
        return SK ? SK.isApproachDone(approach) && !SK.isBlankApproach(approach) : !!approach.done;
      }).length;
      const totalCount = workApproaches.filter(function (approach) {
        return SK ? !SK.isBlankApproach(approach) : true;
      }).length;
      const allDone = totalCount > 0 && doneCount === totalCount;
      const started = doneCount > 0 && !allDone;
      const weights = workApproaches.map(function (approach) { return +approach.weightKg || 0; }).filter(Boolean);
      const maxWeight = weights.length ? Math.max.apply(null, weights) : 0;
      const parts = HEYS.StrengthBuilderParts || {};
      const dose = typeof parts.planExerciseSummary === 'function'
        ? parts.planExerciseSummary(source)
        : totalCount + ' подходов';
      const history = typeof historyFor === 'function' ? historyFor(source.name, index) : null;
      const record = history && history.record && +history.record.maxW === maxWeight;
      const restOwnerMatch = !!(rest && (
        rest.owner === source.name || rest.exName === source.name
      ));
      const editingElsewhere = openIdx >= 0 && openIdx !== index;
      const showRestEditing = allDone && restOwnerMatch && editingElsewhere;
      const reopened = !!source.reopened && doneCount > 0 && totalCount > doneCount;
      const stateLabel = reopened
        ? 'было ' + doneCount + ' из ' + doneCount + ' · стало ' + doneCount + ' из ' + totalCount
        : allDone
          ? dose + (record ? ' · рекорд' : '')
          : started
            ? 'сейчас · подход ' + (doneCount + 1) + ' из ' + totalCount
            : (dose ? dose + ' · ' : '') + 'не начато';
      const titleText = (allDone && showRestEditing)
        ? ((source.name || 'Без названия') + ' · закрыт')
        : (source.name || 'Без названия');
      const showDoneChevron = allDone && openIdx >= 0;

      return h('div', {
        key: 'e' + index,
        className: 'sb-ex sb-ex--collapsed'
          + (allDone ? ' is-complete' : started ? ' is-current' : ' is-pending')
          + (showRestEditing ? ' is-rest-editing' : '')
      },
        h('button', {
          type: 'button',
          className: 'sb-ex-head',
          onClick: function () {
            setOpenIdx(index);
            if (rest && !rest.collapsed) patchRest(Object.assign({}, rest, { collapsed: true }));
          },
          'aria-expanded': 'false'
        },
          h('span', { className: 'sb-ex-num' }, String(index + 1)),
          h('span', { className: 'sb-ex-title' },
            h('b', null, titleText),
            h('span', { className: 'sb-ex-sub' + (reopened ? ' is-reopened' : '') }, stateLabel)
          ),
          h('span', { className: 'sb-ex-signals' },
            showRestEditing
              ? h('span', { className: 'sb-ex-state is-editing' }, 'правится')
              : allDone
                ? h('span', { className: 'sb-ex-state', 'aria-label': 'Упражнение закрыто' }, '✓')
                : started
                  ? h('span', { className: 'sb-ex-state' }, 'раскрыть ›')
                  : null,
            showDoneChevron
              && h('span', { className: 'sb-ex-chevron', 'aria-hidden': 'true' }, '›')
          )
        )
      );
    }

    function compactSessionDate(value) {
      return String((HEYS.StrengthBuilderParts || {}).humanDate(value) || '')
        .replace(/^./, function (letter) { return letter.toLowerCase(); })
        .replace(/ января$/, ' янв')
        .replace(/ февраля$/, ' фев')
        .replace(/ марта$/, ' мар')
        .replace(/ апреля$/, ' апр')
        .replace(/ мая$/, ' мая')
        .replace(/ июня$/, ' июн')
        .replace(/ июля$/, ' июл')
        .replace(/ августа$/, ' авг')
        .replace(/ сентября$/, ' сен')
        .replace(/ октября$/, ' окт')
        .replace(/ ноября$/, ' ноя')
        .replace(/ декабря$/, ' дек');
    }

    function historyForCard(name, index) {
      const summary = typeof historyFor === 'function' ? historyFor(name, index) : null;
      if (summary && summary.last) return summary;
      const detail = typeof historyDetailFor === 'function' ? historyDetailFor(name, index) : null;
      const latest = detail && Array.isArray(detail.usages) ? detail.usages[0] : null;
      if (!latest || !Array.isArray(latest.approaches) || !latest.approaches.length) return summary;
      return Object.assign({}, summary || {}, {
        last: { approaches: latest.approaches }
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
      const workAfter = aps.filter(function (approach) {
        return !(SK && SK.isWarmupApproach(approach));
      });
      const allWorkDone = workAfter.length > 0 && workAfter.every(function (approach) {
        return SK
          ? SK.isApproachDone(approach) && !SK.isBlankApproach(approach)
          : !!approach.done;
      });
      if (allWorkDone) ex.reopened = false;
      next[exIdx] = ex;
      patchExercises(next);
      const isApproachDone = SK ? SK.isApproachDone(aps[apIdx]) : !!(aps[apIdx] && aps[apIdx].done);
      if (!wasApproachDone && isApproachDone) {
        const markedAt = Date.now();
        const lifecyclePatch = { lastMarkAt: markedAt };
        if (!(+sessionRef.current.startedAt > 0)) lifecyclePatch.startedAt = markedAt;
        if (!(+sessionRef.current.firstMarkAt > 0)) lifecyclePatch.firstMarkAt = markedAt;
        patchSession(lifecyclePatch);
        if (!skipUndoToastRef.current) {
          const marked = aps[apIdx];
          const weightLabel = marked && marked.weightKg ? String(marked.weightKg).replace('.', ',') : 'свой';
          const repsLabel = marked && marked.reps ? marked.reps : '—';
          setApproachUndo({
            label: 'Подход засчитан · ' + weightLabel + ' кг × ' + repsLabel,
            hint: 'тост живёт несколько секунд',
            onUndo: function () {
              skipUndoToastRef.current = true;
              patchApproach(exIdx, apIdx, { done: false });
              setApproachUndo(null);
            }
          });
        }
        skipUndoToastRef.current = false;
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

    function cloneExercise(ex) {
      return JSON.parse(JSON.stringify(ex || {}));
    }

    function toggleType(exIdx, apIdx, opts) {
      const ex = exercises[exIdx];
      const a = (ex && ex.approaches || [])[apIdx];
      if (!ex || !a) return;
      const warmup = SK ? SK.isWarmupApproach(a) : false;
      const beforeEx = cloneExercise(ex);
      patchApproach(exIdx, apIdx, { type: warmup ? '' : 'warmup' });
      if (!(opts && opts.skipRenumber)) {
        setRenumberCtx({ exIdx: exIdx, beforeEx: beforeEx });
        setOpenIdx(exIdx);
        setView('renumber');
      }
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
      const workBefore = aps.filter(function (approach) {
        return !(SK && SK.isWarmupApproach(approach));
      });
      const allDoneBefore = workBefore.length > 0 && workBefore.every(function (approach) {
        return SK
          ? SK.isApproachDone(approach) && !SK.isBlankApproach(approach)
          : !!approach.done;
      });
      const last = aps[aps.length - 1] || { weightKg: '', reps: 10 };
      aps.push({ weightKg: last.weightKg, reps: last.reps, done: false });
      ex.approaches = aps;
      if (allDoneBefore) ex.reopened = true;
      next[exIdx] = ex;
      patchExercises(next);
    }

    function addDrop(exIdx) {
      if (groupByIndex[exIdx]) return;
      const next = exercises.slice();
      const ex = Object.assign({}, next[exIdx]);
      const aps = (ex.approaches || []).slice();
      let target = -1;
      for (let i = aps.length - 1; i >= 0; i--) {
        if (SK && !SK.isWarmupApproach(aps[i])) { target = i; break; }
      }
      if (target < 0) return;
      addDropAt(exIdx, target, next, ex, aps);
    }

    function addDropAt(exIdx, apIdx, nextIn, exIn, apsIn) {
      if (groupByIndex[exIdx]) return;
      const next = nextIn || exercises.slice();
      const ex = exIn || Object.assign({}, next[exIdx]);
      const aps = apsIn || (ex.approaches || []).slice();
      const target = apIdx;
      if (target < 0 || !aps[target]) return;
      const a = Object.assign({}, aps[target]);
      const stages = SK ? SK.approachStages(a) : [];
      const lastW = parseFloat(String(stages[stages.length - 1].weightKg || '').replace(',', '.'));
      if (!isFinite(lastW) || lastW <= 0) return;
      const drops = (a.drops || []).slice();
      if (drops.length >= (SK ? SK.MAX_APPROACH_STAGES - 1 : 2)) return;
      drops.push({ weightKg: String(Math.round(lastW * 0.8)), reps: a.reps || 0, done: false });
      a.drops = drops;
      aps[target] = a;
      ex.approaches = aps;
      next[exIdx] = ex;
      patchExercises(next);
    }

    function applyWeightRemaining(exIdx, weightKg) {
      const next = exercises.slice();
      const ex = Object.assign({}, next[exIdx]);
      const aps = (ex.approaches || []).slice();
      const w = String(weightKg);
      for (let i = 0; i < aps.length; i++) {
        if (SK && SK.isWarmupApproach(aps[i])) continue;
        if (SK && SK.isApproachDone(aps[i])) continue;
        aps[i] = Object.assign({}, aps[i], { weightKg: w });
      }
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

    if (showInterrupted) {
      const hadRestTimer = !!wl.activeRest;
      const restRunning = !!rest;
      let restMessage;
      let interruptedNote;
      if (!hadRestTimer) {
        restMessage = 'Всё, что отмечено, на месте. Таймер отдыха вы не запускали — ждать нечего.';
        interruptedNote = 'Пауза больше 45 минут бывает и без таймера: тогда экран не говорит про истечение, потому что истекать было нечему. Кнопки те же.';
      } else if (restRunning) {
        restMessage = 'Всё, что отмечено, на месте. Таймер отдыха ещё идёт — осталось '
          + fmtClock(restRemainingSec(rest, Date.now())) + '.';
        interruptedNote = 'Редкий случай: таймер сохранился и не истёк. «Продолжить» возвращает к нему, не сбрасывая; предлагать закрыть тренировку всё равно можно — разрыв уже больше 45 минут.';
      } else {
        restMessage = 'Всё, что отмечено, на месте. Таймер отдыха истёк, пока вас не было, и заново не запускается.';
        interruptedNote = 'Разрыв больше 45 минут — и второй кнопкой предлагаем закрыть тренировку временем последней отметки, а не текущим: иначе в истории останется тренировка на два часа, из которых час человек ехал домой. Длительность в итогах всегда считается от первой отметки до последней.';
      }

      return h('div', { className: 'sb-root sb-root--interrupted' },
        h('div', { className: 'sb-head sb-interrupted-head' },
          closeIconButton(onClose, 'Закрыть конструктор'),
          h('div', { className: 'sb-head-title' },
            h('b', null, 'Тренировка на паузе'),
            h('div', { className: 'sb-head-sub' },
              (agg ? agg.doneApproaches + ' из ' + agg.totalApproaches + ' подходов' : 'Тренировка начата')
              + ' · вас не было ' + fmtAbsence(breakSec))
          )
        ),
        h('main', { className: 'sb-interrupted-scroll' },
          h('p', { className: 'sb-interrupted-copy' }, restMessage),
          h('div', { className: 'sb-interrupted-meta' },
            h('div', { className: 'sb-interrupted-row' },
              h('span', null, 'Последняя отметка'),
              h('b', null, fmtTime(lastMarkAt))
            ),
            h('div', { className: 'sb-interrupted-row' },
              h('span', null, 'Сейчас'),
              h('b', null, fmtTime(Date.now()))
            )
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
          ),
          h('p', { className: 'sb-interrupted-note' }, interruptedNote)
        )
      );
    }

    const CatUI = HEYS.StrengthCatalogUI || {};
    function FinUIRef() { return HEYS.StrengthFinishUI || {}; }

    const pendingProposal = SK && SK.pendingPlanProposal ? SK.pendingPlanProposal(training) : null;

    function handleProposalAccept() {
      if (typeof onProposalAccept === 'function') {
        onProposalAccept();
        setView('list');
        return;
      }
      if (typeof onReviewProposal === 'function') onReviewProposal();
    }

    function handleProposalDecline() {
      if (typeof onProposalDecline === 'function') {
        onProposalDecline();
        setView('list');
        return;
      }
      if (typeof onReviewProposal === 'function') onReviewProposal();
    }

    if (view === 'proposal-started' && pendingProposal) {
      return h(ProposalStartedScreen, {
        training: training,
        exercises: exercises,
        startedAt: startedAt,
        elapsedSec: elapsedSec,
        agg: agg,
        onClose: function () { setView('list'); },
        onAccept: handleProposalAccept,
        onDecline: handleProposalDecline
      });
    }

    if (view === 'warmup-drop' && warmupDropIdx >= 0 && exercises[warmupDropIdx]) {
      const wdEx = exercises[warmupDropIdx];
      return h((HEYS.StrengthBuilderParts || {}).WarmupDropScreen, {
        ex: wdEx,
        index: warmupDropIdx,
        exercises: exercises,
        bodyWeightKg: profile && profile.weight,
        onBack: function () { setView('list'); },
        onClose: onClose,
        onOpenSheet: function () { setSheetOpen(true); },
        onPatchApproach: function (apIdx, patch) { patchApproach(warmupDropIdx, apIdx, patch); },
        onToggleType: function (apIdx) { toggleType(warmupDropIdx, apIdx, { skipRenumber: true }); },
        onAddDrop: function () { addDrop(warmupDropIdx); },
        onAddApproach: function () { addApproach(warmupDropIdx); },
        readOnly: false
      });
    }
    if (view === 'approach-types' && approachTypesIdx >= 0 && exercises[approachTypesIdx]) {
      const atEx = exercises[approachTypesIdx];
      return h((HEYS.StrengthBuilderParts || {}).ApproachTypesScreen, {
        ex: atEx,
        index: approachTypesIdx,
        bodyWeightKg: profile && profile.weight,
        onBack: function () { setView('list'); },
        onClose: onClose,
        onOpenSheet: function () { setSheetOpen(true); },
        onPatchApproach: function (apIdx, patch) { patchApproach(approachTypesIdx, apIdx, patch); },
        onToggleType: function (apIdx) { toggleType(approachTypesIdx, apIdx, { skipRenumber: true }); },
        onAddDrop: function () { addDrop(approachTypesIdx); },
        onAddApproach: function () { addApproach(approachTypesIdx); },
        onApplyWeight: function (w) { applyWeightRemaining(approachTypesIdx, w); },
        onOpenDropSet: function () {
          const aps = (exercises[approachTypesIdx].approaches || []);
          let targetAp = -1;
          for (let i = aps.length - 1; i >= 0; i--) {
            if (SK && SK.isWarmupApproach(aps[i])) continue;
            if ((SK.approachStages(aps[i]) || []).length > 1) { targetAp = i; break; }
          }
          if (targetAp < 0) {
            for (let i = aps.length - 1; i >= 0; i--) {
              if (SK && !SK.isWarmupApproach(aps[i])) { targetAp = i; break; }
            }
          }
          if (targetAp >= 0) {
            setDropSetCtx({ exIdx: approachTypesIdx, apIdx: targetAp });
            setView('drop-set');
          }
        },
        readOnly: false
      });
    }
    if (view === 'drop-set' && dropSetCtx && exercises[dropSetCtx.exIdx]) {
      const dsEx = exercises[dropSetCtx.exIdx];
      return h((HEYS.StrengthBuilderParts || {}).DropSetScreen, {
        ex: dsEx,
        apIdx: dropSetCtx.apIdx,
        bodyWeightKg: profile && profile.weight,
        onBack: function () { setView('approach-types'); },
        onClose: onClose,
        onOpenSheet: function () { setSheetOpen(true); },
        onPatchApproach: function (apIdx, patch) { patchApproach(dropSetCtx.exIdx, apIdx, patch); },
        onAddDrop: function () { addDropAt(dropSetCtx.exIdx, dropSetCtx.apIdx); },
        readOnly: false
      });
    }
    if (view === 'renumber' && renumberCtx && exercises[renumberCtx.exIdx]) {
      const rnEx = exercises[renumberCtx.exIdx];
      return h((HEYS.StrengthBuilderParts || {}).RenumberScreen, {
        ex: rnEx,
        beforeEx: renumberCtx.beforeEx,
        bodyWeightKg: profile && profile.weight,
        onBack: function () { setView('list'); setRenumberCtx(null); },
        onOpenSheet: function () { setSheetOpen(true); }
      });
    }
    if (view === 'catalog' && CatUI.CatalogScreen) {
      return h(CatUI.CatalogScreen, {
        onPick: addExercise,
        onCreate: function (name) { setDraftName(name || ''); setView('new'); },
        onBack: function () { setView('list'); },
        historyFor: historyFor
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
        undoToast: approachUndo,
        onApply: function (next) { patchExercises(next); setView('list'); },
        onCancel: function () { setView('list'); }
      });
    }
    if (view === 'plan-vs-done' && Parts.PlanVsDoneScreen) {
      return h(Parts.PlanVsDoneScreen, {
        training: training,
        onBack: function () { setView('list'); },
        onClose: onClose
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
    if (view === 'new') {
      return h(ExerciseCardScreen, {
        initialName: draftName,
        onDone: addExercise,
        onCancel: function () { setView('catalog'); }
      });
    }

    // Б1 «Конструктор · пусто»: показываем только те способы старта, для
    // которых есть данные и рабочий callback. Статичный макет сводит в одном
    // кадре взаимоисключающие состояния (план есть / «Плана нет»), поэтому
    // иерархия динамическая: план главный, когда его снимок валиден; иначе
    // главное действие — собрать тренировку самому.
    if (exercises.length === 0) {
      const last = typeof lastSessionFor === 'function' ? lastSessionFor() : null;
      const planExercises = plannedExercisesFor(training);
      const candidatePlan = planExercises ? training.plan : null;
      const planRevision = planRevisionFor(candidatePlan);
      const planWasConsumed = samePlanRevision(consumedPlanRevision, planRevision);
      const canStartPlan = !!(candidatePlan && !planWasConsumed && typeof onStartPlan === 'function');
      const plan = canStartPlan ? candidatePlan : null;
      const planLabel = plan && String(plan.dayLabel || '').trim();
      const assignedBy = plan && String(plan.assignedBy || 'куратор').trim();
      const builderParts = HEYS.StrengthBuilderParts || {};
      const planPreviewRows = canStartPlan && typeof builderParts.planPreviewRows === 'function'
        ? builderParts.planPreviewRows(planExercises)
        : [];
      const emptyPlanPreviewShown = planPreviewRows.slice(0, 3);
      const emptyPlanPreviewHidden = planPreviewRows.slice(3).reduce(function (sum, row) {
        return sum + (row.memberCount || 1);
      }, 0);
      function emptyPlanPreviewDose(row) {
        if (row.memberCount > 1) return row.summary || '';
        if (typeof builderParts.planEmptyPreviewDose !== 'function') return row.summary || '';
        for (let pi = 0; pi < planExercises.length; pi += 1) {
          const exercise = planExercises[pi];
          const key = (exercise && exercise.id) || ('plan-exercise-' + pi);
          if (key === row.key) return builderParts.planEmptyPreviewDose(exercise);
        }
        return row.summary || '';
      }
      return h('div', { className: 'sb-root' },
        h('div', { className: 'sb-head is-empty' },
          closeIconButton(onClose, 'Закрыть конструктор'),
          h('div', { className: 'sb-head-title' },
            h('b', null, 'Силовая'),
            h('div', { className: 'sb-head-sub' },
              canStartPlan ? 'план на день · 0 подходов' : 'пусто · 0 подходов')
          )
        ),
        h('div', { className: 'sb-empty-scroll' },
          h('div', { className: 'sb-empty-card' },
            h('b', null, canStartPlan ? 'План на сегодня готов' : 'Пустая тренировка'),
            h('p', null, canStartPlan
              ? 'Можно начать по плану куратора или собрать свою — план не обязателен.'
              : 'Добавляйте упражнения по ходу — план не обязан быть готов заранее.'),
            emptyPlanPreviewShown.length > 0 && h('ol', {
              className: 'sb-empty-plan-preview',
              'aria-label': 'Состав плана'
            }, emptyPlanPreviewShown.map(function (row, rowIndex) {
              const dose = emptyPlanPreviewDose(row);
              return h('li', { key: row.key },
                h('span', { className: 'sb-empty-plan-preview-num', 'aria-hidden': 'true' }, String(rowIndex + 1)),
                h('span', { className: 'sb-empty-plan-preview-name' }, row.name),
                dose ? h('i', { className: 'sb-empty-plan-preview-dose' }, dose) : null
              );
            }).concat(emptyPlanPreviewHidden > 0
              ? [h('li', { key: 'more', className: 'sb-empty-plan-preview-more' },
                'и ещё ' + emptyPlanPreviewHidden + ' '
                + (emptyPlanPreviewHidden % 10 === 1 && emptyPlanPreviewHidden % 100 !== 11
                  ? 'упражнение'
                  : emptyPlanPreviewHidden % 10 >= 2 && emptyPlanPreviewHidden % 10 <= 4
                    && !(emptyPlanPreviewHidden % 100 >= 12 && emptyPlanPreviewHidden % 100 <= 14)
                    ? 'упражнения' : 'упражнений'))]
              : []))
          ),
          canStartPlan && h(React.Fragment, null,
            h('button', {
              type: 'button', className: 'sb-empty-action is-primary',
              disabled: emptyActionPending,
              onClick: async function () {
                if (emptyActionPending) return;
                setEmptyActionPending(true);
                try {
                  const startedExercises = await onStartPlan(planRevision);
                  if (!Array.isArray(startedExercises) || !startedExercises.length) return;
                  setExercises(startedExercises);
                  setOpenIdx(0);
                } finally {
                  setEmptyActionPending(false);
                }
              }
            }, emptyActionPending ? 'Начинаем…' : 'Начать по плану' + (planLabel ? ' · ' + planLabel : '')),
            h('div', { className: 'sb-empty-plan-meta' },
              exerciseCountLabel(planExercises.length) + ' · назначил ' + assignedBy
            )
          ),
          h('button', {
            type: 'button', className: 'sb-empty-action' + (canStartPlan ? '' : ' is-primary'),
            disabled: emptyActionPending,
            onClick: async function () {
              if (emptyActionPending) return;
              if (canStartPlan && typeof onStartCustom === 'function') {
                setEmptyActionPending(true);
                try {
                  const accepted = await onStartCustom(planRevision);
                  if (accepted !== true) return;
                  setConsumedPlanRevision(planRevision);
                } finally {
                  setEmptyActionPending(false);
                }
              }
              setView('catalog');
            }
          }, emptyActionPending ? 'Начинаем…' : 'Собрать свою'),
          last && Array.isArray(last.exercises) && last.exercises.length > 0 && typeof onRepeatLast === 'function'
            && h('div', { className: 'sb-empty-options' },
              h('button', {
                type: 'button', className: 'sb-empty-option',
                disabled: emptyActionPending,
                onClick: async function () {
                  if (emptyActionPending) return;
                  setEmptyActionPending(true);
                  try {
                    const repeatedExercises = await onRepeatLast(last.exercises, planRevision);
                    if (!Array.isArray(repeatedExercises) || !repeatedExercises.length) return;
                    setExercises(repeatedExercises);
                    setOpenIdx(0);
                  } finally {
                    setEmptyActionPending(false);
                  }
                }
              },
                h('span', null, 'Повторить ' + repeatDateLabel(last.dateKey)),
                h('b', null, last.exercises.length + ' упр.')
              )
            ),
          h('p', { className: 'sb-empty-note' }, canStartPlan
            ? 'План назначен — главной становится кнопка плана, «Собрать свою» уходит вторичной. Повтор стоит строкой. Состав виден сразу внутри карточки, только для чтения: первые три упражнения с дозами и строка остатка.'
            : 'Плана нет — главной становится «Собрать свою». Повтор стоит строкой, а не кнопкой: это способ начать, а не решение.')
        )
      );
    }

    const planMeta = training && training.plan;
    const curatorMeta = planMeta ? {
      author: planMeta.assignedBy || 'Куратор',
      assignedAt: planMeta.assignedAt || planMeta.updatedAt || 0
    } : null;
    const syncQueueRows = typeof Parts.buildSyncQueueRows === 'function'
      ? Parts.buildSyncQueueRows({
        syncStatus: syncStatus,
        doneApproaches: agg ? agg.doneApproaches : 0,
        lastMarkAt: wl.lastMarkAt || wl.startedAt || 0,
        notePending: syncStatus === 'pending' && !!(wl.note && String(wl.note).trim()),
        onRetry: function () {
          try {
            const cloud = HEYS.cloud;
            if (cloud && typeof cloud.flushPending === 'function') cloud.flushPending();
          } catch (_e) { /* retry best-effort */ }
        }
      })
      : [];

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
          dateKey: dateKey,
          onToggleCell: function (exIdx, apIdx) {
            const a = exercises[exIdx].approaches[apIdx];
            patchApproach(exIdx, apIdx, { done: !(SK ? SK.isApproachDone(a) : a.done) });
          },
          onAddRound: addRound,
          onSwap: swapMembers
        }));
        return;
      }
      if (openIdx !== i) {
        rendered.push(collapsedExerciseRow(ex, i));
        return;
      }
      rendered.push(h(React.Fragment, { key: 'e-wrap' + i },
        h((HEYS.StrengthBuilderParts || {}).ExerciseCard, {
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
        history: historyForCard(ex.name, i),
        onRpe: setRpe,
        onRename: renameExercise,
        onLink: function (exIdx) { setLinkFrom(exIdx); setView('superset'); },
        onOpenWarmupDrop: function (exIdx) { setWarmupDropIdx(exIdx); setView('warmup-drop'); },
        onStartRest: function (exIdx) {
          const restEx = exercises[exIdx];
          if (!restEx) return;
          const total = +restEx.restSec || 90;
          patchRest({
            total: total,
            startedAt: Date.now(),
            exName: restEx.name || '',
            owner: restEx.name || 'Упражнение',
            source: restEx.rpe > 0 ? 'тяжесть ' + restEx.rpe + ' → ' + fmtClock(total) : 'по умолчанию · ' + fmtClock(total),
            closedLabel: restEx.name ? restEx.name + ' закрыт' : 'Подход закрыт',
            contextNextLabel: 'дальше · следующий подход',
            notificationLabel: approachProgressLabel(restEx, 0),
            nextLabel: 'Следующий подход'
          });
        },
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
        onDiscomfortAction: discomfortAction,
        curatorMeta: curatorMeta,
        onReplyCurator: function () {
          setView('proposal-started');
        }
      }),
        ((ex.unit || 'weight_reps') === 'time') && h('div', { className: 'sb-time-entry-block' },
          h('div', { className: 'sb-time-summary' },
            h('div', { className: 'sb-time-summary-row' },
              h('span', null, 'Итого под нагрузкой'),
              h('b', { className: 'sb-time-summary-val' }, fmtClock(exerciseDurationTotalSec(ex)))
            ),
            h('div', { className: 'sb-time-summary-row is-muted' },
              h('span', { className: 'sb-time-summary-copy' },
                h('b', null, 'В тоннаж'),
                h('span', null, 'не идёт · килограммы на секунды не умножаются')
              ),
              h('span', { className: 'sb-time-summary-dash' }, '—')
            )
          ),
          h('p', { className: 'sb-time-entry-footnote' },
            'Колонка «Вес» показывается по признаку «есть ли что взвешивать», а не по единице: у планки её нет, у фермерской переноски есть — обе меряются временем. Клавиатура времени — мм:сс, хранение в секундах.')
        ),
        ((ex.unit || 'weight_reps') === 'distance') && h('div', { className: 'sb-time-entry-block sb-distance-entry-block' },
          h('div', { className: 'sb-time-summary' },
            h('div', { className: 'sb-time-summary-row' },
              h('span', null, 'Итого'),
              h('b', { className: 'sb-time-summary-val' }, formatDistanceM(exerciseDistanceTotalM(ex)))
            ),
            h('div', { className: 'sb-time-summary-row is-muted' },
              h('span', { className: 'sb-time-summary-copy' },
                h('b', null, 'В тоннаж'),
                h('span', null, 'не идёт · метры не умножаются на килограммы')
              ),
              h('span', { className: 'sb-time-summary-dash' }, '—')
            )
          ),
          h('p', { className: 'sb-time-entry-footnote' },
            'Метры и время устроены одинаково: одна колонка значений, свой итог в «Объёме другими величинами», в тоннаж не идут. Своя строка, а не пропуск — иначе человек решит, что работа потерялась.')
        ),
        ((ex.unit || 'weight_reps') === 'bodyweight') && (function () {
          const summary = bodyweightEntrySummary(ex, bodyWeightKg);
          if (!summary) return null;
          return h('div', { className: 'sb-time-entry-block sb-bw-entry-block' },
            h('div', { className: 'sb-bw-entry-summary' },
              summary.rows.map(function (row, rowIdx) {
                return h('div', {
                  key: 'bw-sum-' + rowIdx,
                  className: 'sb-bw-entry-summary-row' + (row.isTotal ? ' is-total' : '')
                    + (rowIdx === summary.rows.length - 1 ? ' is-last' : '')
                },
                  row.isTotal
                    ? h('span', { className: 'sb-bw-entry-summary-title' }, row.title)
                    : h('span', { className: 'sb-bw-entry-summary-copy' },
                      h('b', null, row.title),
                      row.subtitle && h('span', null, row.subtitle)),
                  h('b', { className: 'sb-bw-entry-summary-val' }, fmtVolumeKg(row.volume)));
              })
            ),
            h('p', { className: 'sb-time-entry-footnote sb-bw-entry-footnote' },
              'Прочерк в довесе значит «только вес тела», а не забытое поле: галочку он не блокирует. Довес живёт на подходе, а не на упражнении — сегодня без блина, через месяц с блином на поясе.')
          );
        })()
      ));
    });

    const restSourceName = rest ? String(rest.source || '').split(/\s(?:→|·)\s/)[0] : '';
    const restOrigin = /^тяжесть\s/.test(restSourceName)
      ? 'из ' + restSourceName
      : 'по правилу «' + (restSourceName || 'отдыха') + '»';

    const openEx = openIdx >= 0 ? exercises[openIdx] : null;
    const openUnit = openEx ? (openEx.unit || 'weight_reps') : '';
    const openApproachCount = openEx && Array.isArray(openEx.approaches) ? openEx.approaches.length : 0;
    const proposalWho = pendingProposal && pendingProposal.proposedBy ? pendingProposal.proposedBy : null;

    return h('div', {
      className: 'sb-root sb-builder-screen'
        + (openIdx >= 0 ? ' is-exercise-open' : '')
        + (openUnit === 'time' ? ' is-time-entry' : '')
        + (openUnit === 'distance' ? ' is-distance-entry' : '')
        + (openUnit === 'bodyweight' ? ' is-bodyweight-entry' : '')
        + (rest
        ? ' sb-root--rest-docked ' + (rest.collapsed ? 'sb-root--rest-collapsed' : 'sb-root--rest-expanded')
        : '')
    },
      h('div', { className: 'sb-head' },
        h('button', {
          type: 'button', className: 'sb-icon-btn',
          onClick: onClose, 'aria-label': 'Закрыть конструктор'
        }, '✕'),
        h('div', { className: 'sb-head-title' },
          h('b', null, openEx
            ? ((openEx.name || 'Упражнение') + ' · ' + approachCountLabel(openApproachCount))
            : (wl.title || (HEYS.StrengthBuilderParts || {}).sessionTitle(exercises))),
          h('div', { className: 'sb-head-sub' }, rest && !rest.collapsed
            ? 'отдых между подходами'
            : openEx && openUnit === 'bodyweight'
              ? bodyweightHeadKey(openEx)
              : openEx && unitEntryLabel(openUnit)
                ? unitEntryLabel(openUnit)
                : (proposalWho && startedAt > 0 && !completedAt
                ? 'по плану ' + proposalWho + (elapsedSec > 0 ? ' · идёт ' + fmtClock(elapsedSec) : '')
                : compactSessionDate(dateKey)
                  + (startedAt ? ' · начата в ' + fmtTime(startedAt) : '')))
        ),
        syncStatus === 'pending' && h('span', {
          className: 'sb-sync-badge',
          title: 'Сохранено на телефоне, ждёт сеть'
        }, '📡 Ждёт сеть'),
        agg && startedAt > 0 && !completedAt && (openIdx >= 0 || pendingProposal)
          && h('span', { className: 'sb-proposal-started-badge' },
            agg.doneApproaches + ' / ' + agg.totalApproaches + ' ✓'),
        startedAt > 0 && !completedAt && openIdx < 0 && !pendingProposal
          && h('span', { className: 'sb-session-badge' }, 'идёт'),
        h('button', {
          type: 'button', className: 'sb-icon-btn',
          onClick: function () { setSheetOpen(true); },
          'aria-label': 'Ещё'
        }, '⋯')
      ),
      h('div', { className: 'sb-stats' + (rest && !rest.collapsed ? ' sb-stats--rest' : '') },
        rest && !rest.collapsed
          ? elapsedSec > 0 && h('span', { className: 'sb-stat sb-stat-time' }, fmtClock(elapsedSec))
          : elapsedSec > 0 && h('span', { className: 'sb-stat sb-stat-time' },
            (openIdx >= 0 ? '⏱ ' : '') + fmtClock(elapsedSec)),
        h('span', { className: 'sb-stat' + (rest && !rest.collapsed ? ' sb-stat--progress' : '') }, agg
          ? (rest && !rest.collapsed
            ? agg.doneApproaches + ' из ' + agg.totalApproaches + ' подходов'
            : (openIdx >= 0
              ? agg.doneApproaches + ' / ' + agg.totalApproaches + ' ✓'
              : agg.doneApproaches + ' из ' + agg.totalApproaches + ' подходов'))
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
          setView('proposal-started');
        }
      }),
      h('div', { className: 'sb-list' },
        planMeta && planMeta.status === 'started' && startedAt > 0 && !completedAt
          && Parts.CuratorPlanStrip && h(Parts.CuratorPlanStrip, {
            plan: planMeta,
            showActions: false,
            muscleHint: (Parts.sessionTitle && typeof Parts.sessionTitle === 'function')
              ? Parts.sessionTitle(exercises).replace(/^Силовая ·\s*/, '')
              : 'верх тела'
          }),
        rendered.length ? rendered : h('div', { className: 'sb-empty' }, 'Упражнений пока нет'),
        Parts.SyncQueuePanel && h(Parts.SyncQueuePanel, { rows: syncQueueRows })
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
          openIdx >= 0 && h(React.Fragment, null,
            h('button', {
              type: 'button', className: 'sb-sheet-row',
              onClick: function () { addApproach(openIdx); setSheetOpen(false); }
            }, h('span', { className: 'sb-sheet-icon' }, '+'),
            h('div', { className: 'sb-cat-title' }, h('b', null, 'Добавить подход'),
              h('span', null, 'Новая строка текущего упражнения'))),
            (function () {
              const openUnit = ((exercises[openIdx] || {}).unit || 'weight_reps');
              return (openUnit === 'weight_reps' || openUnit === 'bodyweight') && h('button', {
                type: 'button', className: 'sb-sheet-row',
                onClick: function () { addDrop(openIdx); setSheetOpen(false); }
              }, h('span', { className: 'sb-sheet-icon' }, '↘'),
              h('div', { className: 'sb-cat-title' }, h('b', null, 'Добавить сброс'),
                h('span', null, 'Ступень сброса последнего подхода')));
            })(),
            h('button', {
              type: 'button', className: 'sb-sheet-row',
              onClick: function () { setLinkFrom(openIdx); setView('superset'); setSheetOpen(false); }
            }, h('span', { className: 'sb-sheet-icon' }, '↔'),
            h('div', { className: 'sb-cat-title' }, h('b', null, 'Связать упражнения'),
              h('span', null, 'Суперсет или трисет')))
          ),
          (HEYS.StrengthBuilderParts || {}).sheetRows({
            exercises: exercises,
            openIdx: openIdx,
            close: function () { setSheetOpen(false); },
            go: setView,
            setLinkFrom: setLinkFrom,
            setHistoryName: setHistoryName,
            setWarmupDropIdx: setWarmupDropIdx,
            setApproachTypesIdx: setApproachTypesIdx,
            hasPlanSnapshot: !!(training && training.planSnapshot
              && Array.isArray(training.planSnapshot.exercises)
              && training.planSnapshot.exercises.length)
          }).map(function (row, i) {
            return h('button', {
              key: i,
              type: 'button',
              className: 'sb-sheet-menu-row',
              disabled: !!row.off,
              onClick: row.go
            },
              h('span', { className: 'sb-sheet-menu-copy' },
                h('b', null, row.t),
                h('span', null, row.d)
              ),
              h('span', {
                className: 'sb-sheet-menu-chevron'
                  + (row.chevron === 'muted' ? ' is-muted' : ' is-dim')
              }, '›')
            );
          }),
          h('p', { className: 'sb-sheet-footnote' },
            'Всё, что не нужно посреди подхода, живёт здесь: шаблоны, каталог, история, отчёт куратора и заметка. '
            + 'Шапка сессии несёт только время и счёт подходов — семь входов в ней превратили бы её в панель управления.')
        )
      ),
      // Осталось незакрытым: если это не сделано — лучше убрать, иначе тоннаж и
      // объём по группам завышаются пустыми строками (экран 11).
      closeConfirm && h('div', { className: 'sb-sheet-back', onClick: dismissCloseConfirm },
        h('div', {
          ref: closeConfirmDialogRef,
          className: 'sb-sheet',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'sb-close-confirm-title',
          onClick: function (e) { e.stopPropagation(); }
        },
          h('div', { className: 'sb-sheet-grip' }),
          h('b', { className: 'sb-confirm-title', id: 'sb-close-confirm-title' }, 'Остались незакрытые подходы'),
          h('p', { className: 'sb-confirm-text' },
            notClosed + (notClosed === 1 ? ' подход' : notClosed < 5 ? ' подхода' : ' подходов')
            + ' без отметки. Если они не сделаны — лучше убрать: иначе тоннаж и объём по группам будут завышены.'),
          h('div', { className: 'sb-pain-actions' },
            h('button', {
              type: 'button', className: 'sb-btn', autoFocus: true,
              onClick: function () { setCloseConfirm(false); setView('finish'); }
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
                setView('finish');
              }
            }, 'Убрать пустые')
          )
        )
      ),
      h('div', { className: 'sb-panel' },
        approachUndo && CatUI.ApproachUndoToast && h(CatUI.ApproachUndoToast, { toast: approachUndo }),
        h('button', {
          type: 'button', className: 'sb-panel-add', 'aria-label': 'Добавить упражнение',
          onClick: function () { setView('catalog'); }
        }, 'Добавить упражнение'),
        h('button', {
          ref: finishButtonRef,
          type: 'button', className: 'sb-finish' + (notClosed === 0 ? ' is-ready' : ''),
          'aria-label': notClosed > 0
            ? 'Завершить тренировку · ' + notClosed + ' не закрыто'
            : 'Завершить тренировку',
          onClick: function () {
            if (notClosed > 0) { setCloseConfirm(true); return; }
            setView('finish');
          }
        }, openIdx >= 0
          ? 'Завершить тренировку'
          : (notClosed > 0 ? 'Завершить · ' + notClosed + ' не закрыто' : 'Завершить')),
        !rest && h('div', { className: 'sb-builder-note' },
          openIdx < 0
            ? 'Состояние, в котором список живёт между упражнениями: карточку свернули, подход закрыт, следующее ещё не начато. Раскрытие — тап по карточке, и прежняя сворачивается сама: две открытые карточки не бывают. «Завершить» остаётся тихой, пока счёт незакрытых не дошёл до нуля.'
            : 'Тот же состав, шесть правок против шума. Сделанное не громче текущего: у закрытых упражнений и подходов снята зелёная заливка, сигнал остался один — галочка. Акцент указывает одно место: обводка карточки говорит «открыто здесь», рамка полей — «писать сюда»; номера, кольцо галочки и обводка активной строки приглушены, потому что шесть акцентов внутри одного блока не акцентируют ничего. Заливки больше не вложены тройкой: строки внутри карточки живут на её фоне. Шкала тяжести без обводок — это одна необязательная оценка, а не второй блок веса таблицы. Счётчик незакрытых снят с кнопки: он уже стоит бейджем в шапке.'),
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
        onStartPlan: state.onStartPlan,
        onStartCustom: state.onStartCustom,
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
  SB.ExerciseCardScreen = ExerciseCardScreen;
})(typeof window !== 'undefined' ? window : globalThis);
