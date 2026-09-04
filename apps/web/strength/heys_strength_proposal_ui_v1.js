// heys_strength_proposal_ui_v1.js — правка куратора после старта плана.
//
// Дизайн-хэндофф «Правка куратора после старта» (2026-08-09), экраны 14a/14c и
// 15a–15c; слой 5 CURATOR_TRAINING_PROGRAM_PROTOCOL_2026-08-09.md.
//
// Правило, из которого следует весь этот экран: предложение никогда не трогает
// отмеченные подходы. Поэтому здесь нет ни одного диалога о рисках — «взять
// правку» безопасно всегда, и вопрос «а не сотрёт ли это мою работу» просто не
// возникает. Всё, что решает, ляжет ли часть правки, живёт в ядре
// (TK.strength.applyPlanEdit); этот файл только показывает его вывод человеку.

; (function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  if (!React) return;
  const h = React.createElement;

  const Parts = HEYS.StrengthBuilderParts = HEYS.StrengthBuilderParts || {};

  function kernel() {
    return (HEYS.TrainingKernel && HEYS.TrainingKernel.strength) || null;
  }

  function approachesOf(ex) {
    return ex && Array.isArray(ex.approaches) ? ex.approaches : [];
  }

  function exerciseById(list, id) {
    const arr = Array.isArray(list) ? list : [];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && String(arr[i].id) === String(id)) return arr[i];
    }
    return null;
  }

  /** «4 × 8 · 75 кг» — та же строка, какой упражнение подписано на разборе. */
  function approachSummary(ex) {
    const aps = approachesOf(ex);
    if (!aps.length) return '';
    const first = aps[0];
    const reps = +first.reps || 0;
    const w = first.weightKg === '' || first.weightKg == null ? null : String(first.weightKg);
    const head = aps.length + ' × ' + reps;
    return w && w !== '0' ? head + ' · ' + w + ' кг' : head;
  }

  /** Сводка незакрытых подходов: то, чего правка ещё может коснуться. */
  function openTailSummary(ex, ks) {
    const aps = approachesOf(ex).filter(function (a) { return !ks.isApproachDone(a); });
    if (!aps.length) return 'всё закрыто';
    const first = aps[0];
    const w = first.weightKg === '' || first.weightKg == null ? null : String(first.weightKg);
    const head = aps.length + ' × ' + (+first.reps || 0);
    return w && w !== '0' ? head + ' · ' + w + ' кг' : head;
  }

  /**
   * Раскладка предложения для человека: что останется как есть, а что впереди
   * и поменяется.
   *
   * Считается по фактическому результату применения (ядро, applyPlanEdit), а не
   * сравнением списков на глаз. Разница принципиальная: у начатого упражнения
   * закрытые подходы неприкосновенны, но незакрытые правка ещё меняет — и
   * именно ради этого случая живая правка и нужна. Раскладка «упражнение
   * начато, значит целиком заморожено» показала бы человеку, что куратор
   * ничего не сделал, хотя вес в оставшихся подходах он сбавил.
   */
  function describePlanEdit(liveExercises, proposedExercises) {
    const ks = kernel();
    const live = Array.isArray(liveExercises) ? liveExercises : [];
    const proposed = Array.isArray(proposedExercises) ? proposedExercises : [];
    const frozen = [];
    const ahead = [];
    if (!ks) return { frozen: frozen, ahead: ahead };

    live.forEach(function (ex) {
      if (!ks.hasDoneApproach(ex)) return;
      const aps = approachesOf(ex);
      let done = 0;
      aps.forEach(function (a) { if (ks.isApproachDone(a)) done += 1; });
      frozen.push({
        id: ex.id,
        name: ex.name,
        summary: done === aps.length ? approachSummary(ex) : done + ' из ' + aps.length
      });
    });

    const res = ks.applyPlanEdit(live, proposed);
    const next = res.ok ? res.exercises : live;

    next.forEach(function (nex) {
      const liveEx = nex && nex.id ? exerciseById(live, nex.id) : null;
      if (!liveEx) {
        ahead.push({ kind: 'added', name: nex.name, detail: 'Добавится · ' + approachSummary(nex) });
        return;
      }
      if (liveEx === nex) {
        // Ядро вернуло ту же ссылку — упражнение не тронуто вовсе.
        if (!ks.hasDoneApproach(liveEx)) {
          ahead.push({ kind: 'same', name: nex.name, detail: 'Без изменений · ' + approachSummary(nex) });
        }
        return;
      }
      ahead.push({
        kind: 'changed',
        name: nex.name,
        before: openTailSummary(liveEx, ks),
        after: openTailSummary(nex, ks)
      });
    });

    live.forEach(function (ex) {
      if (ex && ex.id && exerciseById(next, ex.id)) return;
      ahead.push({
        kind: 'removed',
        name: ex.name,
        detail: 'Уберётся из плана. Если решишь сделать — добавишь сам, это не запрет.'
      });
    });

    return { frozen: frozen, ahead: ahead };
  }

  function memberLinesForBlock(exercises, indexes, roundCount) {
    const Parts = HEYS.StrengthBuilderParts || {};
    if (typeof Parts.supersetMemberLines === 'function') {
      return Parts.supersetMemberLines(exercises, indexes, roundCount);
    }
    return (Array.isArray(indexes) ? indexes : []).map(function (i) {
      return exercises[i] && exercises[i].name ? exercises[i].name : '';
    });
  }

  function blockRoundCount(exercises, indexes, ks) {
    const rounds = ks.supersetRounds(exercises, exercises[indexes[0]] && exercises[indexes[0]].ssGroup);
    if (rounds) return rounds.length;
    const counts = indexes.map(function (i) { return ks.workApproaches(exercises[i]).length; });
    return counts.length ? Math.min.apply(null, counts) : 0;
  }

  function namesEqual(left, right) {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  function currentSupersetRound(exercises, groupId, ks) {
    const rounds = ks.supersetRounds(exercises, groupId);
    if (!rounds || !rounds.length) return { current: 0, total: 0 };
    for (let ri = 0; ri < rounds.length; ri++) {
      const cells = rounds[ri];
      for (let ci = 0; ci < cells.length; ci++) {
        const a = exercises[cells[ci].exerciseIndex].approaches[cells[ci].approachIndex];
        if (!ks.isApproachDone(a)) return { current: ri + 1, total: rounds.length };
      }
    }
    return { current: rounds.length, total: rounds.length };
  }

  /**
   * Границы правки связки для кадра Д3: не начатая меняется целиком парой
   * «было → станет», начатая держит состав до конца.
   */
  function describeSupersetBoundaries(liveExercises, proposedExercises) {
    const ks = kernel();
    const replacements = [];
    const frozen = [];
    if (!ks) return { replacements: replacements, frozen: frozen };

    const live = Array.isArray(liveExercises) ? liveExercises : [];
    const proposed = Array.isArray(proposedExercises) ? proposedExercises : [];
    const liveBlocks = ks.orderBlocks(live);
    const proposedBlocks = ks.orderBlocks(proposed);
    const liveByGroup = {};
    liveBlocks.forEach(function (block) {
      if (block.groupId) liveByGroup[block.groupId] = block;
    });
    const seen = {};

    proposedBlocks.forEach(function (pb) {
      if (!pb.groupId || pb.indexes.length < 2 || seen[pb.groupId]) return;
      const lb = liveByGroup[pb.groupId];
      if (!lb || lb.indexes.length < 2) return;
      seen[pb.groupId] = true;

      const started = lb.indexes.some(function (i) { return ks.hasDoneApproach(live[i]); });
      const liveNames = lb.indexes.map(function (i) { return live[i].name; });
      const propNames = pb.indexes.map(function (i) { return proposed[i].name; });
      const liveRounds = blockRoundCount(live, lb.indexes, ks);
      const propRounds = blockRoundCount(proposed, pb.indexes, ks);
      const compositionChanged = !namesEqual(liveNames, propNames) || liveRounds !== propRounds;
      if (!compositionChanged) return;

      if (started) {
        const letter = HEYS.StrengthBuilderParts && HEYS.StrengthBuilderParts.supersetGroupLetter
          ? HEYS.StrengthBuilderParts.supersetGroupLetter(pb.groupId)
          : 'A';
        const round = currentSupersetRound(live, pb.groupId, ks);
        frozen.push({
          title: 'Связка ' + letter + ' · раунд ' + round.current + ' из ' + round.total,
          subtitle: 'состав заморожен до конца',
          badge: 'закрыта'
        });
        return;
      }

      replacements.push({
        key: 'связка не начата',
        beforeLines: memberLinesForBlock(live, lb.indexes, liveRounds),
        afterLines: memberLinesForBlock(proposed, pb.indexes, propRounds)
      });
    });

    return { replacements: replacements, frozen: frozen };
  }

  const KIND_SIGN = { added: '+', removed: '−', changed: '~', same: '·' };

  /**
   * Карточка на дне (14a). Первым слоем — что именно поменял куратор, тремя
   * строками; решение живёт здесь, а не в переписке: одно решение в двух
   * местах разъедется.
   */
  function ProposalCard(props) {
    const { training, onReview, onAccept, onDecline } = props;
    const ks = kernel();
    const proposal = ks && ks.pendingPlanProposal(training);
    if (!proposal) return null;
    const wl = (training && training.workoutLog) || {};
    const diff = describePlanEdit(wl.exercises, proposal.exercises);
    const who = proposal.proposedBy || 'Куратор';
    const started = ks.hasDoneApproach
      ? (Array.isArray(wl.exercises) ? wl.exercises : []).some(function (ex) { return ks.hasDoneApproach(ex); })
      : false;

    // Кадр «Актив · правка куратора»: одна фраза заголовком тоном
    // предупреждения, суть правки прозой, две кнопки — «Принять» и «Оставить
    // прежнюю». Прежде заголовком стояло название дня, а источник правки
    // уходил в мелкую пилюлю; главной кнопкой был переход в разбор, то есть
    // ответить с самой карточки было нельзя.
    //
    // «Сделанное не тронется» остаётся в прозе всегда, когда подходы уже
    // закрыты: это обещание про чужую работу, и прятать его за кнопку разбора
    // нельзя. Список изменений тоже остаётся — он и есть «что изменилось»,
    // поэтому «Принять» здесь не вслепую.
    const prose = [
      started ? 'Сделанное не тронется — только то, что впереди.' : null,
      proposal.note || null,
    ].filter(Boolean).join(' ');
    return h('div', { className: 'sb-plan-card sb-proposal-card' },
      h('b', null, who + ' поправил сегодняшнюю тренировку'),
      h('span', { className: 'sb-plan-meta' },
        prose || 'План на сегодня изменился — посмотрите, что стало.'),
      h('ul', { className: 'sb-proposal-list' },
        diff.ahead.slice(0, 3).map(function (row, i) {
          return h('li', { key: i, className: 'sb-proposal-row is-' + row.kind },
            h('span', { className: 'sb-proposal-sign' }, KIND_SIGN[row.kind] || '·'),
            h('span', { className: 'sb-proposal-text' },
              row.kind === 'changed' ? row.name + ' · ' + row.after : row.name)
          );
        })
      ),
      h('div', { className: 'sb-plan-actions' },
        h('button', {
          type: 'button', className: 'sb-btn is-accent sb-plan-cta', onClick: onAccept || onReview
        }, 'Принять'),
        h('button', {
          type: 'button', className: 'sb-btn sb-plan-skip', onClick: onDecline
        }, 'Оставить прежнюю')
      ),
      // Полный разбор кадр не рисует, но он был единственным входом в список
      // замороженных упражнений — оставлен вторым слоем, не главной кнопкой.
      h('button', {
        type: 'button', className: 'sb-proposal-review-link', onClick: onReview
      }, 'что изменилось ›')
    );
  }

  /**
   * Разбор целиком (14c). Сделанное — отдельным блоком сверху и до того, как
   * человек увидит хоть одну кнопку: обещание «твою работу не тронут» должно
   * стоять раньше вопроса «берёшь ли правку».
   */
  function ProposalReview(props) {
    const { training, onClose, onAccept, onDecline } = props;
    const ks = kernel();
    const proposal = ks && ks.pendingPlanProposal(training);
    if (!proposal) return null;
    const wl = (training && training.workoutLog) || {};
    const diff = describePlanEdit(wl.exercises, proposal.exercises);
    const boundaries = describeSupersetBoundaries(wl.exercises, proposal.exercises);
    const who = proposal.proposedBy || 'Куратор';
    const BoundBody = HEYS.StrengthBuilderParts && HEYS.StrengthBuilderParts.SupersetBoundariesBody;

    return h('div', { className: 'sb-root sb-proposal-review' },
      h('div', { className: 'sb-head' },
        h('button', { type: 'button', className: 'sb-icon-btn', onClick: onClose, 'aria-label': 'Закрыть' }, '✕'),
        h('div', { className: 'sb-head-title' },
          h('b', null, 'Что поменял ' + who),
          h('span', { className: 'sb-head-sub' },
            (training.plan && training.plan.dayLabel) || 'План на сегодня')
        )
      ),
      h('div', { className: 'sb-list' },
        BoundBody && (boundaries.replacements.length > 0 || boundaries.frozen.length > 0)
          && h('section', { className: 'sb-proposal-boundaries' },
            h('div', { className: 'sb-proposal-section-title' }, 'Связка · границы правки'),
            h(BoundBody, {
              replacements: boundaries.replacements,
              frozen: boundaries.frozen
            })
          ),
        diff.frozen.length > 0 && h('section', { className: 'sb-proposal-frozen' },
          h('div', { className: 'sb-proposal-section-title' },
            h('span', { className: 'sb-lock' }, '🔒'),
            'Останется как есть · ' + diff.frozen.length + ' упр.'),
          h('ul', { className: 'sb-proposal-frozen-list' },
            diff.frozen.map(function (row) {
              return h('li', { key: row.id },
                h('span', { className: 'sb-proposal-text' }, row.name),
                h('span', { className: 'sb-proposal-sum' }, row.summary));
            })
          ),
          h('p', { className: 'sb-proposal-hint' },
            'Замороженные именно эти подходы, а не упражнения целиком: незакрытые подходы правка ещё может тронуть. Сделанное остаётся в тренировке и в объёме.')
        ),
        h('section', { className: 'sb-proposal-ahead' },
          h('div', { className: 'sb-proposal-section-title' }, 'Впереди — это и поменяется'),
          h('ul', { className: 'sb-proposal-ahead-list' },
            diff.ahead.map(function (row, i) {
              return h('li', { key: i, className: 'sb-proposal-row is-' + row.kind },
                h('span', { className: 'sb-proposal-sign' }, KIND_SIGN[row.kind] || '·'),
                h('div', { className: 'sb-proposal-body' },
                  h('b', null, row.name),
                  h('span', { className: 'sb-proposal-detail' },
                    row.kind === 'changed' ? row.before + ' → ' + row.after : row.detail)
                )
              );
            })
          )
        )
      ),
      h('div', { className: 'sb-panel sb-proposal-foot' },
        h('button', { type: 'button', className: 'sb-btn', onClick: onDecline }, 'Дальше по-своему'),
        h('button', { type: 'button', className: 'sb-btn is-accent', onClick: onAccept }, 'Взять правку')
      )
    );
  }

  /**
   * Полоска внутри идущей тренировки (14b) — намеренно не модалка: человек
   * стоит с гантелей в руке, и перекрывать ему экран чужой правкой нельзя.
   */
  function ProposalStrip(props) {
    const { training, onReview } = props;
    const ks = kernel();
    const proposal = ks && ks.pendingPlanProposal(training);
    if (!proposal) return null;
    return h('div', { className: 'sb-proposal-strip' },
      h('span', { className: 'sb-proposal-strip-icon' }, (proposal.proposedBy || 'К').slice(0, 1)),
      h('div', { className: 'sb-proposal-strip-main' },
        h('b', null, (proposal.proposedBy || 'Куратор') + ' подправил план'),
        h('span', null, 'Сделанное не тронется — только то, что впереди')
      ),
      h('button', { type: 'button', className: 'sb-btn sb-proposal-strip-btn', onClick: onReview }, 'Смотреть')
    );
  }

  /**
   * Итог в закрытой тренировке (15b): что из правки легло, а что нет. Эта же
   * строка уходит куратору — без неё он решит, что клиент его проигнорировал,
   * и повторит правку через неделю.
   */
  function ProposalOutcome(props) {
    const { training } = props;
    const proposal = training && training.plan && training.plan.proposal;
    if (!proposal || proposal.status !== 'accepted') return null;
    const rejected = Array.isArray(proposal.rejected) ? proposal.rejected : [];
    const applied = Array.isArray(proposal.applied) ? proposal.applied : [];
    if (!rejected.length) return null;

    const REASONS = {
      started_cannot_remove: 'убирал, но ты уже начал',
      superset_composition_frozen: 'связка начата, состав остался',
      done_approaches_kept: 'сделанные подходы остались'
    };
    const who = proposal.proposedBy || 'Куратор';
    return h('section', { className: 'sb-proposal-outcome' },
      h('div', { className: 'sb-proposal-section-title' }, 'Правка ' + who + ' легла не полностью'),
      h('ul', { className: 'sb-proposal-ahead-list' },
        applied.map(function (row, i) {
          return h('li', { key: 'a' + i, className: 'sb-proposal-row is-added' },
            h('span', { className: 'sb-proposal-sign' }, '+'),
            h('div', { className: 'sb-proposal-body' },
              h('b', null, row.name),
              h('span', { className: 'sb-proposal-detail' }, 'Легло'))
          );
        }).concat(rejected.map(function (row, i) {
          return h('li', { key: 'r' + i, className: 'sb-proposal-row is-removed' },
            h('span', { className: 'sb-proposal-sign' }, '−'),
            h('div', { className: 'sb-proposal-body' },
              h('b', null, row.name),
              h('span', { className: 'sb-proposal-detail' }, REASONS[row.reason] || 'осталось как было'))
          );
        }))
      )
    );
  }

  /**
   * Программа пройдена (экран 16e). Про сделанное, а не про пропуски.
   *
   * Чего здесь намеренно нет: разбора «жим 70 вместо 75 три раза» и поимённого
   * списка пропусков. У куратора это рабочий инструмент, у клиента тот же текст
   * читается как перечень провалов — а он месяц ходил в зал. Пропуски названы
   * одной строкой и без имён: факт, но не приговор.
   */
  function ProgramDoneScreen(props) {
    const { program, sessions, doneCount, totalCount, skippedCount, onClose, onWriteCurator } = props;
    const ks = kernel();
    // Ядро недоступно — блока нет вовсе. Показать «Что удержано: 0 тренировок,
    // 0 кг» человеку, который месяц ходил в зал, хуже, чем не показать ничего.
    const growth = ks && ks.programGrowth ? ks.programGrowth(sessions || []) : null;
    const hasHeld = growth && growth.held && growth.held.sessions > 0;
    const weeks = program && program.weeks;

    return h('div', { className: 'sb-root program-done' },
      h('div', { className: 'sb-head' },
        h('button', { type: 'button', className: 'sb-icon-btn', onClick: onClose, 'aria-label': 'Закрыть' }, '✕'),
        h('div', { className: 'sb-head-title' },
          h('b', null, weeks ? weeks + ' недели позади' : 'Цикл позади'),
          h('div', { className: 'sb-head-sub' }, program && program.title ? program.title : 'Программа')
        )
      ),
      h('div', { className: 'sb-list' },
        h('div', { className: 'program-done-hero' },
          h('b', null, 'Программа пройдена'),
          h('p', null,
            doneCount + ' ' + pluralSessions(doneCount) + ' из ' + totalCount
            + ' — и вот что за ними стоит.')
        ),
        growth && growth.kind === 'growth'
          ? h('section', { className: 'program-done-block' },
            h('div', { className: 'sb-proposal-section-title' }, 'Что выросло'),
            h('ul', { className: 'program-done-rows' },
              growth.rows.map(function (r) {
                return h('li', { key: r.name },
                  h('b', null, r.name),
                  h('span', null, r.kind === 'weight'
                    ? r.from + ' → ' + r.to + ' кг'
                    : r.from + ' → ' + r.to + ' повт.')
                );
              })
            )
          )
          : hasHeld && h('section', { className: 'program-done-block' },
            h('div', { className: 'sb-proposal-section-title' }, 'Что удержано'),
            h('ul', { className: 'program-done-rows' },
              h('li', { key: 'c' }, h('b', null, 'Постоянство'),
                h('span', null, (growth.held ? growth.held.sessions : 0) + ' ' + pluralSessions(growth.held ? growth.held.sessions : 0))),
              h('li', { key: 'v' }, h('b', null, 'Объём'),
                h('span', null, fmtVolume(growth.held ? growth.held.totalVolume : 0))),
              h('li', { key: 'a' }, h('b', null, 'Закрытых подходов'),
                h('span', null, String(growth.held ? growth.held.doneApproaches : 0)))
            )
          ),
        skippedCount > 0 && h('p', { className: 'program-done-skips' },
          skippedCount + ' ' + pluralSessions(skippedCount) + ' пропущены — на итог это повлияло мало.'),
        h('button', {
          type: 'button', className: 'sb-btn is-accent program-done-cta', onClick: onWriteCurator
        }, 'Написать куратору'),
        h('p', { className: 'program-done-note' },
          'Куратор уже видит итоги и готовит следующую.')
      )
    );
  }

  function pluralSessions(n) {
    const t = Math.abs(n) % 100;
    const d = t % 10;
    if (t > 10 && t < 20) return 'тренировок';
    if (d === 1) return 'тренировка';
    if (d >= 2 && d <= 4) return 'тренировки';
    return 'тренировок';
  }

  function fmtVolume(kg) {
    const v = Math.round(kg || 0);
    return v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + ' т' : v + ' кг';
  }

  Parts.ProgramDoneScreen = ProgramDoneScreen;

  const REVIEW_ID = 'strength-proposal-review';

  /**
   * Открыть разбор поверх дня. Отдельный полноэкранный слой, а не вид внутри
   * конструктора: правку смотрят и до тренировки, с карточки дня, где
   * конструктор ещё не открыт.
   */
  function openReview(opts) {
    const o = opts || {};
    const TK = HEYS.TrainingKernel;
    const fs = TK && TK.fullscreen;
    if (!fs) return false;
    return fs.mount({
      id: REVIEW_ID,
      ariaLabel: 'Что поменял куратор',
      render: function (api) {
        // Решение применяется ДО закрытия слоя. Наоборот было нельзя: патч,
        // отправленный после размонтирования портала, доходил до состояния
        // React, но на диск уже не сохранялся — ответ клиента жил до
        // перезагрузки и молча исчезал (найдено живой проверкой 2026-08-09).
        return h(ProposalReview, {
          training: o.training,
          onClose: api.close,
          onAccept: function () { if (o.onAccept) o.onAccept(); api.close(); },
          onDecline: function () { if (o.onDecline) o.onDecline(); api.close(); }
        });
      }
    });
  }

  function closeReview() {
    const TK = HEYS.TrainingKernel;
    const fs = TK && TK.fullscreen;
    return fs ? fs.unmount(REVIEW_ID) : false;
  }

  Parts.openProposalReview = openReview;
  Parts.closeProposalReview = closeReview;
  Parts.describePlanEdit = describePlanEdit;
  Parts.describeSupersetBoundaries = describeSupersetBoundaries;
  Parts.ProposalCard = ProposalCard;
  Parts.ProposalReview = ProposalReview;
  Parts.ProposalStrip = ProposalStrip;
  Parts.ProposalOutcome = ProposalOutcome;
})(window);
