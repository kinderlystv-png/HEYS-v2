// heys_kernel_strength_v1.js — ОБЩЕЕ ЯДРО: тоннаж силовых тренировок.
//
// Формулы перенесены дословно из apps/web/heys_day_trainings_v1.js (2026-08-08):
// там они читали localStorage напрямую (computeDayTotalTonnage,
// countStrengthWorkoutsOnDay), поэтому ни ядро, ни MCP-коннектор не могли их
// переиспользовать. Здесь — чистые функции от блоба дня / объекта тренировки,
// heys_day_trainings_v1.js делегирует сюда, читая день из своего стора сам.
//
// НЕ вынесено (сознательно): findPrevDayTonnage и поиск исторического рекорда
// по имени упражнения — оба сканируют неограниченную историю по localStorage.
// Тянуть такой скан в MCP значит на каждый запрос читать десятки блобов дней;
// это тот же риск, что у окна модели нагрузки (см. TRAINING_LOAD_MODEL_PROMPT.md,
// этап 5) — сначала измерить, нужен ли скан вообще, потом решать про кэш.
//
// Public API (HEYS.TrainingKernel.strength):
//   trainingTonnage(training)   — {totalVolume, maxWeight, totalApproaches, doneApproaches, exerciseCount} одной тренировки
//   dayTonnage(day)              — суммарный тоннаж дня по всем силовым workout_builder
//   countStrengthWorkouts(day)   — сколько силовых workout_builder тренировок в дне

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.strength && TK.strength.__registered) return; // idempotent

  function isStrengthBuilder(t) {
    return !!t && String(t.type) === 'strength' && t.strengthEntryMode === 'workout_builder'
      && !!t.workoutLog && typeof t.workoutLog === 'object';
  }

  // «Назначено, но не сделано» — смысл модуля нагрузки, там и живёт предикат:
  // второй экземпляр разошёлся бы с ним молча. Локальный фолбэк — на случай
  // сборки без модуля нагрузки: даже там план не должен считаться фактом
  // (тот же приём, что Runner fallback guard, KERNEL_EXTRACTION_PLAN.md).
  function isPlanned(t) {
    return TK.load && TK.load.isNotPerformedTraining ? TK.load.isNotPerformedTraining(t)
      : !!(t && t.plan && ['assigned', 'skipped', 'moved'].indexOf(t.plan.status) !== -1);
  }

  // ——— Схема подхода: тип, довес, ступени дроп-сета ———
  //
  // Шаг 2 протокола STRENGTH_BUILDER_REDESIGN_PROTOCOL_2026-08-09.md. Всё
  // аддитивно и миграции не требует: отсутствие type читается как «рабочий»,
  // отсутствие drops — как обычный подход. Поэтому writers НЕ пишут type у
  // рабочих подходов: пустое поле и есть значение по умолчанию.
  //
  // Сброс — ступень ВНУТРИ подхода, а не отдельный подход: иначе счётчик дня
  // поедет у каждого, кто сделал дроп, и число перестанет сходиться между
  // экранами. Своего номера у ступени нет, в тоннаж идут все ступени.

  const APPROACH_WORK = 'work';
  const APPROACH_WARMUP = 'warmup';
  const APPROACH_TYPES = [APPROACH_WORK, APPROACH_WARMUP];
  // Основная ступень плюс до двух сбросов. Ограничение экранное, а не
  // модельное: четыре строки внутри строки подхода — предел читаемости в зале.
  const MAX_APPROACH_STAGES = 3;
  const MAX_REPS = 200;
  const MAX_WEIGHT_KG = 1000;
  const MAX_EXTRA_WEIGHT_KG = 500;
  const MAX_DISCOMFORT_NOTE = 100;

  function toWeightNumber(v) {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function toWeightString(v) {
    return v == null ? '' : String(v);
  }

  /** Пустой тип — рабочий подход. Разминка вне тоннажа и вне раундов связки. */
  function approachType(a) {
    const t = a && a.type ? String(a.type) : '';
    return t === APPROACH_WARMUP ? APPROACH_WARMUP : APPROACH_WORK;
  }

  function isWarmupApproach(a) {
    return approachType(a) === APPROACH_WARMUP;
  }

  /**
   * Ступени подхода: основная плюс сбросы, в порядке выполнения. Тип у ступеней
   * общий — он свойство подхода: разминочный подход со сбросами целиком вне
   * тоннажа.
   */
  function approachStages(a) {
    const out = [{
      weightKg: toWeightString(a && a.weightKg),
      reps: +(a && a.reps) || 0,
      done: !!(a && a.done),
      isDrop: false
    }];
    const drops = a && Array.isArray(a.drops) ? a.drops : [];
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d) continue;
      out.push({
        weightKg: toWeightString(d.weightKg),
        reps: +d.reps || 0,
        done: !!d.done,
        isDrop: true
      });
    }
    return out;
  }

  /**
   * Подход закрыт, когда закрыты ВСЕ его ступени: отметка у каждой своя, иначе
   * не видно, докуда человек дошёл, если он сбросил вес и ещё работает.
   */
  function isApproachDone(a) {
    const stages = approachStages(a);
    for (let i = 0; i < stages.length; i++) {
      if (!stages[i].done) return false;
    }
    return true;
  }

  /** Довес — свойство подхода, а не упражнения: сегодня свой вес, завтра блин. */
  function approachExtraWeight(a) {
    const n = toWeightNumber(a && a.extraWeightKg);
    return n === null ? 0 : n;
  }

  /**
   * Щадящая нормализация для чтения: кривые данные из облака не должны ронять
   * подсчёт. Строгую проверку делает validateApproach у писателей.
   */
  function normalizeApproach(a) {
    const src = a && typeof a === 'object' ? a : {};
    const out = {
      weightKg: toWeightString(src.weightKg),
      reps: +src.reps || 0,
      done: !!src.done
    };
    if (src.id) out.id = src.id;
    if (isWarmupApproach(src)) out.type = APPROACH_WARMUP;
    const extra = toWeightNumber(src.extraWeightKg);
    if (extra !== null && extra !== 0) out.extraWeightKg = extra;
    // Время и метры — своя величина у подхода: перемножать килограммы на метры
    // физически бессмысленно, поэтому в тоннаж они не идут и копятся отдельно.
    const dur = toWeightNumber(src.durationSec);
    if (dur !== null && dur > 0) out.durationSec = dur;
    const dist = toWeightNumber(src.distanceM);
    if (dist !== null && dist > 0) out.distanceM = dist;
    // Дискомфорт живёт на подходе, а не на упражнении: важно, на каком именно
    // подходе стало больно. Отметка не заканчивается записью в журнал — она
    // ведёт к действию (снизить вес или пропустить упражнение), см. решение 10.
    if (src.discomfort) {
      out.discomfort = true;
      const note = String(src.discomfortNote == null ? '' : src.discomfortNote).trim();
      if (note) out.discomfortNote = note.slice(0, MAX_DISCOMFORT_NOTE);
    }
    const drops = Array.isArray(src.drops) ? src.drops : [];
    const keptDrops = [];
    for (let i = 0; i < drops.length && keptDrops.length < MAX_APPROACH_STAGES - 1; i++) {
      const d = drops[i];
      if (!d || typeof d !== 'object') continue;
      keptDrops.push({
        weightKg: toWeightString(d.weightKg),
        reps: +d.reps || 0,
        done: !!d.done
      });
    }
    if (keptDrops.length) out.drops = keptDrops;
    return out;
  }

  /**
   * Строгая проверка для писателей (конструктор, коннектор).
   * ctx.inSuperset — упражнение внутри связки: там дроп запрещён (решение 11),
   * и при позиционной модели раундов запрет проверяем именно здесь — лишний
   * подход нарушил бы равенство числа рабочих подходов у участников.
   *
   * @returns {{ ok: boolean, errors: string[] }}
   */
  function validateApproach(a, ctx) {
    const errors = [];
    const src = a && typeof a === 'object' ? a : null;
    if (!src) return { ok: false, errors: ['Подход пустой'] };

    if (src.type !== undefined && src.type !== null && src.type !== ''
      && APPROACH_TYPES.indexOf(String(src.type)) < 0) {
      errors.push('Неизвестный тип подхода: ' + src.type);
    }

    // У времени и дистанции повторов может не быть — там объём меряется
    // секундами и метрами; ctx.unit приходит из снимка упражнения.
    const unit = ctx && ctx.unit ? String(ctx.unit) : '';
    const measuredByTime = unit === 'time';
    const measuredByDistance = unit === 'distance';
    const reps = +src.reps;
    if (!measuredByTime && !measuredByDistance) {
      if (!Number.isInteger(reps) || reps < 1 || reps > MAX_REPS) {
        errors.push('Повторы — целое число от 1 до ' + MAX_REPS);
      }
    }
    if (measuredByTime) {
      const dur = toWeightNumber(src.durationSec);
      if (dur === null || !(dur > 0) || dur > 86400) {
        errors.push('Время под нагрузкой — число секунд больше 0');
      }
    }
    if (measuredByDistance) {
      const dist = toWeightNumber(src.distanceM);
      if (dist === null || !(dist > 0) || dist > 200000) {
        errors.push('Дистанция — число метров больше 0');
      }
    }
    const baseWeight = String(src.weightKg == null ? '' : src.weightKg).trim();
    let baseW = null;
    if (baseWeight !== '') {
      baseW = toWeightNumber(baseWeight);
      if (baseW === null || baseW < 0 || baseW > MAX_WEIGHT_KG) {
        errors.push('Вес — число от 0 до ' + MAX_WEIGHT_KG + ' или пусто для своего веса');
      }
    }

    if (src.extraWeightKg !== undefined && src.extraWeightKg !== null && src.extraWeightKg !== '') {
      const extra = toWeightNumber(src.extraWeightKg);
      if (extra === null || extra < 0 || extra > MAX_EXTRA_WEIGHT_KG) {
        errors.push('Довес — число от 0 до ' + MAX_EXTRA_WEIGHT_KG);
      }
    }

    if (src.discomfortNote !== undefined && src.discomfortNote !== null
      && String(src.discomfortNote).length > MAX_DISCOMFORT_NOTE) {
      errors.push('Заметка о дискомфорте длиннее ' + MAX_DISCOMFORT_NOTE + ' символов');
    }

    const drops = src.drops;
    if (drops !== undefined && drops !== null) {
      if (!Array.isArray(drops)) {
        errors.push('Ступени сброса — список');
      } else if (drops.length) {
        if (ctx && ctx.inSuperset) {
          errors.push('Дроп-сет внутри связки запрещён: подходов у участников должно быть поровну');
        }
        if (drops.length > MAX_APPROACH_STAGES - 1) {
          errors.push('Ступеней больше ' + MAX_APPROACH_STAGES + ': предел читаемости строки подхода');
        }
        if (baseWeight === '') {
          errors.push('Сброс считается от веса основной ступени, а он не указан');
        }
        let prevW = baseW;
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i] || {};
          const dReps = +d.reps;
          if (!Number.isInteger(dReps) || dReps < 1 || dReps > MAX_REPS) {
            errors.push('Ступень ' + (i + 1) + ': повторы — целое число от 1 до ' + MAX_REPS);
          }
          const dW = toWeightNumber(d.weightKg);
          if (dW === null || dW < 0 || dW > MAX_WEIGHT_KG) {
            errors.push('Ступень ' + (i + 1) + ': вес — число от 0 до ' + MAX_WEIGHT_KG);
          } else if (prevW !== null && dW >= prevW) {
            // Смысл приёма — сброс: равный или больший вес это уже другой подход.
            errors.push('Ступень ' + (i + 1) + ': вес должен быть ниже предыдущей ступени');
          }
          if (dW !== null) prevW = dW;
        }
      }
    }

    return { ok: errors.length === 0, errors: errors };
  }

  // ——— Связки: суперсет, трисет, круговая ———
  //
  // Шаг 4 протокола. Раунд НЕ хранится, а выводится из позиции: раунд k — это
  // k-й рабочий подход у каждого участника. Новых полей ноль, миграции ноль.
  // Модель держится на решении 11 (подходов поровну): без него она невозможна,
  // с ним она и есть это решение, записанное в данных.
  //
  // Отвергнуто: индекс раунда на подходе (второй экземпляр того же факта — при
  // удалении подхода в середине данные молча противоречат сами себе) и
  // отдельная сущность связки со своим списком раундов (второй путь чтения у
  // каждого подхода, любой пропущенный потребитель тихо теряет тоннаж).

  /**
   * Прочерк — реальный пустой подход у участника, добавленного по ходу: в
   * прошедших раундах он существует, но не заполнен. Не ноль и не пропуск —
   * клетка не закрывается, в счётчик и в тоннаж не идёт.
   */
  function isBlankApproach(a) {
    if (!a) return true;
    if (a.done) return false;
    const stages = approachStages(a);
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].reps > 0) return false;
    }
    const w = toWeightNumber(a.weightKg);
    if (w !== null && w > 0) return false;
    return !(toWeightNumber(a.durationSec) > 0) && !(toWeightNumber(a.distanceM) > 0);
  }

  /** Отмечен ли дискомфорт на подходе — отметка ведёт к действию, не в архив. */
  function hasDiscomfort(a) {
    return !!(a && a.discomfort);
  }

  function exerciseGroupId(ex) {
    const g = +(ex && ex.ssGroup) || 0;
    return g > 0 ? g : 0;
  }

  /** Рабочие подходы упражнения: разминка входит в связку, но не в раунды. */
  function workApproaches(ex) {
    const aps = ex && Array.isArray(ex.approaches) ? ex.approaches : [];
    const out = [];
    for (let i = 0; i < aps.length; i++) {
      if (!isWarmupApproach(aps[i])) out.push(i);
    }
    return out;
  }

  /**
   * Разбор списка упражнений на связки.
   * adjacent — участники идут подряд. Инвариант держится у писателей, здесь
   * только сообщается: переставлять упражнения на чтении значит писать на
   * чтении.
   * balanced — рабочих подходов поровну; на неравных раундов нет (старые
   * связки показываются плоскими списками, дописывать подходы задним числом
   * запрещено — это изменение истории).
   */
  function supersetGroups(exercises) {
    const list = Array.isArray(exercises) ? exercises : [];
    const byGroup = {};
    const order = [];
    for (let i = 0; i < list.length; i++) {
      const g = exerciseGroupId(list[i]);
      if (!g) continue;
      if (!byGroup[g]) {
        byGroup[g] = { groupId: g, indexes: [] };
        order.push(g);
      }
      byGroup[g].indexes.push(i);
    }
    const out = [];
    for (let k = 0; k < order.length; k++) {
      const grp = byGroup[order[k]];
      const idx = grp.indexes;
      let adjacent = true;
      for (let i = 1; i < idx.length; i++) {
        if (idx[i] !== idx[i - 1] + 1) { adjacent = false; break; }
      }
      const counts = idx.map(function (i) { return workApproaches(list[i]).length; });
      const warmups = idx.reduce(function (acc, i) {
        const aps = Array.isArray(list[i].approaches) ? list[i].approaches : [];
        return acc + aps.length - workApproaches(list[i]).length;
      }, 0);
      let balanced = counts.length >= 2 && counts[0] > 0;
      for (let i = 1; i < counts.length && balanced; i++) {
        if (counts[i] !== counts[0]) balanced = false;
      }
      out.push({
        groupId: grp.groupId,
        indexes: idx.slice(),
        adjacent: adjacent,
        balanced: balanced,
        roundCount: balanced ? counts[0] : 0,
        warmupCount: warmups,
        restSec: supersetRestSec(list, grp.groupId)
      });
    }
    return out;
  }

  /**
   * Раунды связки, выведенные из позиции: раунд k — k-й рабочий подход каждого
   * участника. null у несбалансированной связки: раунды появятся, когда
   * человек сам выровняет число подходов.
   */
  function supersetRounds(exercises, groupId) {
    const list = Array.isArray(exercises) ? exercises : [];
    const g = +groupId || 0;
    const members = [];
    for (let i = 0; i < list.length; i++) {
      if (exerciseGroupId(list[i]) === g && g > 0) members.push(i);
    }
    if (members.length < 2) return null;
    const work = members.map(function (i) { return workApproaches(list[i]); });
    const n = work[0].length;
    if (!n) return null;
    for (let i = 1; i < work.length; i++) {
      if (work[i].length !== n) return null;
    }
    const rounds = [];
    for (let k = 0; k < n; k++) {
      const cells = [];
      for (let m = 0; m < members.length; m++) {
        cells.push({ exerciseIndex: members[m], approachIndex: work[m][k] });
      }
      rounds.push(cells);
    }
    return rounds;
  }

  /**
   * Отдых связки — максимум из значений участников. Не «первый участник»:
   * первым можно стать перетаскиванием, и отдых поедет молча.
   */
  function supersetRestSec(exercises, groupId) {
    const list = Array.isArray(exercises) ? exercises : [];
    const g = +groupId || 0;
    let max = 0;
    for (let i = 0; i < list.length; i++) {
      if (exerciseGroupId(list[i]) !== g || !g) continue;
      const r = +(list[i] && list[i].restSec) || 0;
      if (r > max) max = r;
    }
    return max;
  }

  /**
   * Смежность и минимальный размер связки — для писателей (конструктор,
   * коннектор). Неравное число подходов здесь НЕ ошибка: старые связки живут
   * дальше плоскими списками.
   *
   * @returns {{ ok: boolean, errors: string[] }}
   */
  function validateSupersetLayout(exercises) {
    const errors = [];
    const groups = supersetGroups(exercises);
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.indexes.length < 2) {
        errors.push('Связка ' + g.groupId + ': нужно минимум два упражнения');
      }
      if (!g.adjacent) {
        errors.push('Связка ' + g.groupId + ': участники должны идти подряд');
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function blankApproach(makeId) {
    const a = { weightKg: '', reps: 0, done: false };
    if (typeof makeId === 'function') a.id = makeId();
    return a;
  }

  /**
   * «+ Подход» добавляет раунд целиком: подходов у участников должно остаться
   * поровну (решение 11). Значения копируются с последнего рабочего подхода
   * участника, отметка не переносится.
   */
  function addSupersetRound(exercises, groupId, opts) {
    const list = Array.isArray(exercises) ? exercises.slice() : [];
    const g = +groupId || 0;
    const makeId = opts && opts.makeId;
    for (let i = 0; i < list.length; i++) {
      if (exerciseGroupId(list[i]) !== g || !g) continue;
      const ex = list[i];
      const aps = Array.isArray(ex.approaches) ? ex.approaches.slice() : [];
      const work = workApproaches(ex);
      const last = work.length ? aps[work[work.length - 1]] : null;
      const next = blankApproach(makeId);
      if (last) {
        next.weightKg = toWeightString(last.weightKg);
        next.reps = +last.reps || 0;
        if (last.extraWeightKg) next.extraWeightKg = last.extraWeightKg;
      }
      aps.push(next);
      list[i] = Object.assign({}, ex, { approaches: aps });
    }
    return list;
  }

  /**
   * Участник, добавленный по ходу, получает реальные пустые подходы по числу
   * раундов: иначе позиционная модель ломается — единственный заполненный
   * подход оказался бы первым раундом вместо третьего.
   */
  function addSupersetMember(exercises, fromIndex, groupId, opts) {
    const list = Array.isArray(exercises) ? exercises.slice() : [];
    const g = +groupId || 0;
    if (!g || fromIndex < 0 || fromIndex >= list.length) return list;
    const makeId = opts && opts.makeId;
    const groups = supersetGroups(list);
    let target = null;
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].groupId === g) target = groups[i];
    }
    if (!target) return list;
    const rounds = target.balanced ? target.roundCount : 0;
    const moved = Object.assign({}, list[fromIndex], { ssGroup: g });
    const aps = [];
    for (let k = 0; k < rounds; k++) aps.push(blankApproach(makeId));
    moved.approaches = aps;
    list.splice(fromIndex, 1);
    const after = supersetGroups(list);
    let insertAt = list.length;
    for (let i = 0; i < after.length; i++) {
      if (after[i].groupId === g) insertAt = after[i].indexes[after[i].indexes.length - 1] + 1;
    }
    list.splice(insertAt, 0, moved);
    return list;
  }

  /** «Местами»: данные подходов едут за упражнением. */
  function swapSupersetMembers(exercises, indexA, indexB) {
    const list = Array.isArray(exercises) ? exercises.slice() : [];
    if (indexA < 0 || indexB < 0 || indexA >= list.length || indexB >= list.length) return list;
    if (exerciseGroupId(list[indexA]) !== exerciseGroupId(list[indexB])) return list;
    const tmp = list[indexA];
    list[indexA] = list[indexB];
    list[indexB] = tmp;
    return list;
  }

  /**
   * Перетаскивание двигает связку целиком: разорвать её перетаскиванием
   * нельзя, для этого есть явное «Разъединить».
   */
  function moveSupersetGroup(exercises, groupId, beforeIndex) {
    const list = Array.isArray(exercises) ? exercises.slice() : [];
    const g = +groupId || 0;
    if (!g) return list;
    const block = [];
    const rest = [];
    for (let i = 0; i < list.length; i++) {
      if (exerciseGroupId(list[i]) === g) block.push(list[i]);
      else rest.push({ row: list[i], from: i });
    }
    if (!block.length) return list;
    let at = rest.length;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].from >= beforeIndex) { at = i; break; }
    }
    const out = rest.map(function (r) { return r.row; });
    out.splice(at, 0, ...block);
    return out;
  }

  /**
   * Вставка внутрь чужой связки прилипает к её границе: смежность участников —
   * инвариант писателя, а не то, что чинится при чтении.
   */
  function insertRespectingGroups(exercises, fromIndex, beforeIndex) {
    const list = Array.isArray(exercises) ? exercises.slice() : [];
    const n = list.length;
    if (fromIndex < 0 || fromIndex >= n || beforeIndex < 0 || beforeIndex > n) return list;
    const movedGroup = exerciseGroupId(list[fromIndex]);
    let target = beforeIndex;
    const prevIdx = target - 1;
    if (prevIdx >= 0 && target < n) {
      const gPrev = exerciseGroupId(list[prevIdx]);
      const gNext = exerciseGroupId(list[target]);
      // Точка вставки посреди чужой связки: прилипаем к ближней границе.
      if (gPrev && gPrev === gNext && gPrev !== movedGroup) {
        let start = prevIdx;
        while (start > 0 && exerciseGroupId(list[start - 1]) === gPrev) start -= 1;
        let end = target;
        while (end < n - 1 && exerciseGroupId(list[end + 1]) === gPrev) end += 1;
        target = (target - start) <= (end + 1 - target) ? start : end + 1;
      }
    }
    const a = list.slice();
    const [moved] = a.splice(fromIndex, 1);
    let to = target;
    if (target > fromIndex) to = target - 1;
    to = Math.max(0, Math.min(to, a.length));
    a.splice(to, 0, moved);
    return a;
  }

  /**
   * Собрать связку из упражнений, идущих подряд от startIndex.
   * Подходы выравниваются до rounds у всех участников — без равенства
   * позиционная модель раундов невозможна (решение 11). Отдых ставится общий:
   * максимум из значений участников или заданный явно.
   */
  function makeSuperset(exercises, startIndex, memberCount, rounds, restSec, opts) {
    const list = Array.isArray(exercises) ? exercises.slice() : [];
    const count = Math.max(2, +memberCount || 2);
    const start = Math.max(0, +startIndex || 0);
    if (start + count > list.length) return list;
    const groupId = nextGroupId(list);
    const wanted = Math.max(1, +rounds || 1);
    const makeId = opts && opts.makeId;

    let rest = +restSec || 0;
    if (!rest) {
      for (let i = start; i < start + count; i++) {
        const r = +(list[i] && list[i].restSec) || 0;
        if (r > rest) rest = r;
      }
    }

    for (let i = start; i < start + count; i++) {
      const ex = Object.assign({}, list[i], { ssGroup: groupId, restSec: rest || 90 });
      const aps = Array.isArray(ex.approaches) ? ex.approaches.slice() : [];
      const work = [];
      for (let k = 0; k < aps.length; k++) {
        if (!isWarmupApproach(aps[k])) work.push(k);
      }
      // Лишние рабочие подходы не удаляем: это была бы потеря записанного.
      // Недостающие дописываем пустыми — их человек заполнит по ходу.
      while (work.length < wanted) {
        const last = work.length ? aps[work[work.length - 1]] : null;
        const next = blankApproach(makeId);
        if (last) {
          next.weightKg = toWeightString(last.weightKg);
          next.reps = +last.reps || 0;
        }
        aps.push(next);
        work.push(aps.length - 1);
      }
      ex.approaches = aps;
      list[i] = ex;
    }
    return list;
  }

  /**
   * Список в терминах блоков: одиночное упражнение или связка целиком. В режиме
   * порядка человек двигает именно блоки — связку разорвать перестановкой
   * нельзя, для этого есть «Разъединить».
   */
  function orderBlocks(exercises) {
    const list = Array.isArray(exercises) ? exercises : [];
    const out = [];
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const g = exerciseGroupId(list[i]);
      if (!g) {
        out.push({ groupId: 0, indexes: [i] });
        continue;
      }
      if (seen[g]) {
        // Участник уже учтён своим блоком; несмежный хвост держим при блоке,
        // чтобы перестановка не растащила связку ещё сильнее.
        const block = out[seen[g] - 1];
        if (block) block.indexes.push(i);
        continue;
      }
      out.push({ groupId: g, indexes: [i] });
      seen[g] = out.length;
    }
    return out;
  }

  /** Переставить блок на шаг вверх (-1) или вниз (+1). */
  function moveBlock(exercises, blockIndex, direction) {
    const list = Array.isArray(exercises) ? exercises.slice() : [];
    const blocks = orderBlocks(list);
    const from = +blockIndex;
    const to = from + (direction < 0 ? -1 : 1);
    if (from < 0 || from >= blocks.length || to < 0 || to >= blocks.length) return list;
    const order = blocks.slice();
    const moved = order.splice(from, 1)[0];
    order.splice(to, 0, moved);
    const out = [];
    order.forEach(function (block) {
      block.indexes.forEach(function (i) { out.push(list[i]); });
    });
    return out;
  }

  /** Есть ли в упражнении хотя бы один закрытый подход. */
  function hasDoneApproach(ex) {
    const aps = ex && Array.isArray(ex.approaches) ? ex.approaches : [];
    for (let i = 0; i < aps.length; i++) {
      if (isApproachDone(aps[i])) return true;
    }
    return false;
  }

  /**
   * Подходы начатого упражнения после правки.
   *
   * Закрытые сохраняются дословно и всегда — это уже сделанная работа, менять
   * её правка не имеет права ни весом, ни повторами, ни удалением. Дальше:
   *  - fixedCount (участник начатой связки): число подходов держится за
   *    раундами, поэтому меняются только вес и повторы в незакрытых клетках;
   *  - одиночное упражнение: незакрытый хвост заменяется предложенным целиком,
   *    включая его длину — «сделай не три подхода, а пять» это та же правка
   *    того, к чему человек ещё не приступал.
   */
  function mergeStartedApproaches(liveEx, propEx, fixedCount) {
    const liveAps = liveEx && Array.isArray(liveEx.approaches) ? liveEx.approaches : [];
    const propAps = propEx && Array.isArray(propEx.approaches) ? propEx.approaches : [];
    const out = [];
    let changed = false;
    if (fixedCount) {
      for (let i = 0; i < liveAps.length; i++) {
        const a = liveAps[i];
        const p = propAps[i];
        if (isApproachDone(a) || !p) { out.push(a); continue; }
        const w = toWeightString(p.weightKg);
        const r = +p.reps || 0;
        if (w === toWeightString(a.weightKg) && r === (+a.reps || 0)) { out.push(a); continue; }
        out.push(Object.assign({}, a, { weightKg: w, reps: r }));
        changed = true;
      }
      return { approaches: out, changed: changed, lengthLocked: propAps.length !== liveAps.length };
    }
    for (let i = 0; i < liveAps.length; i++) {
      if (isApproachDone(liveAps[i])) out.push(liveAps[i]);
    }
    const keptCount = out.length;
    for (let i = keptCount; i < propAps.length; i++) out.push(propAps[i]);
    changed = out.length !== liveAps.length;
    if (!changed) {
      for (let i = keptCount; i < out.length; i++) {
        const a = liveAps[i];
        const p = out[i];
        if (!a || toWeightString(a.weightKg) !== toWeightString(p.weightKg) || (+a.reps || 0) !== (+p.reps || 0)) {
          changed = true;
          break;
        }
      }
    }
    // Закрытых подходов больше, чем предложено всего — сократить сделанное
    // правка не может, и это тот случай, о котором обеим сторонам говорят вслух.
    return { approaches: out, changed: changed, lengthLocked: propAps.length < keptCount };
  }

  /**
   * Правка куратора поверх тренировки, которую клиент уже открыл.
   *
   * Единственное правило, из которого следует всё остальное: **предложение
   * никогда не трогает отмеченные подходы**. Оно ложится только на то, к чему
   * человек ещё не приступал, поэтому «принять» безопасно всегда и вопроса «а
   * не сотрёт ли это мою работу» не возникает.
   *
   * Отсюда три следствия на упражнении: закрытый подход неприкосновенен;
   * незакрытые подходы начатого упражнения правятся, включая их число; начатое
   * упражнение нельзя убрать из плана — оно остаётся как факт, даже если
   * куратор его вычеркнул.
   *
   * Связка — тот же инвариант этажом выше. Не начата: заменяется целиком,
   * вынуть из неё одно упражнение правка не может — раунды перестанут
   * сходиться. Начата: состав заморожен, правятся только веса в незакрытых
   * клетках. Разбирать связку правка не имеет права ни в каком случае — у
   * клиента это тоже доступно только через «Разъединить».
   *
   * Молчаливого «не применилось» быть не может: всё, что не легло, возвращается
   * в `rejected` с названием упражнения. Без этого куратор решит, что его
   * проигнорировали, и повторит правку через неделю.
   *
   * @returns {{ ok: boolean, exercises: Array, applied: Array, rejected: Array, errors: string[] }}
   */
  function applyPlanEdit(liveExercises, proposedExercises) {
    const live = Array.isArray(liveExercises) ? liveExercises : [];
    const proposed = Array.isArray(proposedExercises) ? proposedExercises : [];
    const applied = [];
    const rejected = [];

    const liveBlocks = orderBlocks(live);
    const blockOfId = {};
    const liveById = {};
    for (let b = 0; b < liveBlocks.length; b++) {
      const idx = liveBlocks[b].indexes;
      for (let k = 0; k < idx.length; k++) {
        const ex = live[idx[k]];
        const id = ex && ex.id ? String(ex.id) : '';
        if (id) { blockOfId[id] = b; liveById[id] = ex; }
      }
    }
    const blockStarted = [];
    for (let b = 0; b < liveBlocks.length; b++) {
      const idx = liveBlocks[b].indexes;
      let started = false;
      for (let k = 0; k < idx.length && !started; k++) started = hasDoneApproach(live[idx[k]]);
      blockStarted.push(started);
    }

    const out = [];
    const usedBlock = {};
    const proposedBlocks = orderBlocks(proposed);

    for (let p = 0; p < proposedBlocks.length; p++) {
      const pb = proposedBlocks[p];
      let target = -1;
      for (let k = 0; k < pb.indexes.length && target < 0; k++) {
        const id = proposed[pb.indexes[k]] && proposed[pb.indexes[k]].id;
        if (id && blockOfId[String(id)] !== undefined) target = blockOfId[String(id)];
      }

      if (target >= 0 && blockStarted[target]) {
        if (usedBlock[target]) continue;
        usedBlock[target] = true;
        const lb = liveBlocks[target];
        const isGroup = lb.indexes.length > 1;
        // Состав начатой связки заморожен: участники берутся живые, а не
        // предложенные, иначе раунды перестанут сходиться с закрытыми клетками.
        if (isGroup && pb.indexes.length !== lb.indexes.length) {
          rejected.push({
            id: live[lb.indexes[0]] && live[lb.indexes[0]].id,
            name: live[lb.indexes[0]] && live[lb.indexes[0]].name,
            reason: 'superset_composition_frozen'
          });
        }
        for (let k = 0; k < lb.indexes.length; k++) {
          const liveEx = live[lb.indexes[k]];
          const propEx = liveEx && liveEx.id ? findById(proposed, liveEx.id) : null;
          const merged = mergeStartedApproaches(liveEx, propEx, isGroup);
          out.push(merged.changed
            ? Object.assign({}, liveEx, { approaches: merged.approaches })
            : liveEx);
          if (merged.changed) applied.push({ id: liveEx.id, name: liveEx.name, reason: 'approaches_changed' });
          if (merged.lengthLocked) {
            rejected.push({ id: liveEx.id, name: liveEx.name, reason: 'done_approaches_kept' });
          }
        }
        continue;
      }

      if (target >= 0) usedBlock[target] = true;
      for (let k = 0; k < pb.indexes.length; k++) {
        const ex = proposed[pb.indexes[k]];
        out.push(ex);
        applied.push({ id: ex && ex.id, name: ex && ex.name, reason: target >= 0 ? 'replaced' : 'added' });
      }
    }

    // Начатые блоки, которых в предложении не оказалось: куратор их вычеркнул,
    // но сделанное остаётся тренировкой. Возвращаем на исходную позицию, чтобы
    // упражнение не уехало в конец списка, а связку — целым блоком.
    for (let b = 0; b < liveBlocks.length; b++) {
      if (usedBlock[b] || !blockStarted[b]) continue;
      const idx = liveBlocks[b].indexes;
      const items = [];
      for (let k = 0; k < idx.length; k++) items.push(live[idx[k]]);
      const at = Math.min(idx[0], out.length);
      Array.prototype.splice.apply(out, [at, 0].concat(items));
      rejected.push({
        id: items[0] && items[0].id,
        name: items[0] && items[0].name,
        reason: 'started_cannot_remove'
      });
    }
    for (let b = 0; b < liveBlocks.length; b++) {
      if (usedBlock[b] || blockStarted[b]) continue;
      const first = live[liveBlocks[b].indexes[0]];
      applied.push({ id: first && first.id, name: first && first.name, reason: 'removed' });
    }

    // Fail-closed: если после всех перестановок связка всё же разорвана,
    // правка не применяется вовсе. Испорченная раскладка тише, чем отказ, и
    // потому опаснее — раунды разъедутся уже у клиента в зале.
    const layout = validateSupersetLayout(out);
    if (!layout.ok) {
      return { ok: false, exercises: live, applied: [], rejected: [], errors: layout.errors };
    }
    return { ok: true, exercises: out, applied: applied, rejected: rejected, errors: [] };
  }

  /**
   * Развязать ссылку перед записью в день. Сериализация дня вырезает второе
   * вхождение одного и того же объекта, поэтому одна ссылка, лежащая сразу в
   * двух местах записи, доезжает на диск только в одном — и молча пропадает во
   * втором.
   */
  function deepCopy(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  /**
   * Клиент взял правку. Снимок задания обновляется здесь и только здесь:
   * иначе отчёт куратору покажет отклонение от плана, который обе стороны уже
   * отменили. Прежний снимок уходит в историю внутри того же поля — заводить
   * ради него новый ключ верхнего уровня значит чинить ещё и passthrough в
   * модели дня.
   *
   * Результат применения остаётся на предложении: строка «правка легла не
   * полностью» нужна обеим сторонам и после того, как тренировка закрыта.
   */
  function acceptPlanProposal(training, nowMs) {
    const plan = training && training.plan;
    const proposal = plan && plan.proposal;
    if (!proposal || proposal.status !== 'pending') return { ok: false, training: training, errors: ['Нет неотвеченного предложения'] };
    const wl = (training && training.workoutLog) || {};
    const live = Array.isArray(wl.exercises) ? wl.exercises : [];
    const res = applyPlanEdit(live, proposal.exercises);
    if (!res.ok) return { ok: false, training: training, errors: res.errors };

    const prevSnapshot = training.planSnapshot;
    const history = (prevSnapshot && Array.isArray(prevSnapshot.previous) ? prevSnapshot.previous : []).slice();
    if (prevSnapshot && Array.isArray(prevSnapshot.exercises)) {
      history.push({ exercises: deepCopy(prevSnapshot.exercises), replacedAt: nowMs || 0 });
    }
    const nextTraining = Object.assign({}, training, {
      workoutLog: Object.assign({}, wl, { exercises: res.exercises }),
      // Копия, а не ссылка на proposal.exercises: сериализация дня вырезает
      // второе вхождение одного и того же объекта (защита от циклов), и снимок
      // молча уезжал на диск пустым. Найдено живой проверкой 2026-08-09.
      planSnapshot: { exercises: deepCopy(proposal.exercises), previous: history },
      plan: Object.assign({}, plan, {
        proposal: Object.assign({}, proposal, {
          status: 'accepted',
          resolvedAt: nowMs || 0,
          applied: res.applied,
          rejected: res.rejected
        })
      })
    });
    return { ok: true, training: nextTraining, applied: res.applied, rejected: res.rejected, errors: [] };
  }

  /**
   * Клиент остался на прежнем плане. Тренировка не меняется вовсе — отказ это
   * решение, а не правка. Куратор увидит, что ответ дан, но объяснять причину
   * клиент не обязан.
   */
  function declinePlanProposal(training, nowMs) {
    const plan = training && training.plan;
    const proposal = plan && plan.proposal;
    if (!proposal || proposal.status !== 'pending') return { ok: false, training: training };
    return {
      ok: true,
      training: Object.assign({}, training, {
        plan: Object.assign({}, plan, {
          proposal: Object.assign({}, proposal, { status: 'declined', resolvedAt: nowMs || 0 })
        })
      })
    };
  }

  /**
   * Тренировку закрыли, не ответив. Предложение не блокирует завершение: оно
   * гаснет само и остаётся строкой в истории дня. Иначе человек с гантелей в
   * руке вынужден разбирать чужую правку, чтобы просто закончить.
   */
  function expirePlanProposal(training, nowMs) {
    const plan = training && training.plan;
    const proposal = plan && plan.proposal;
    if (!proposal || proposal.status !== 'pending') return training;
    return Object.assign({}, training, {
      plan: Object.assign({}, plan, {
        proposal: Object.assign({}, proposal, { status: 'expired', resolvedAt: nowMs || 0 })
      })
    });
  }

  /**
   * Итог пройденной программы (дизайн-ревью 2026-08-10, экран 16e).
   *
   * Контракт задан дизайном и держится дословно, потому что каждое его условие
   * закрывает свой способ соврать человеку:
   *  - берём **рабочие веса, а не тоннаж**: тоннаж растёт и от лишних подходов,
   *    то есть покажет «рост» там, где человек просто дольше сидел в зале;
   *  - упражнение идёт в счёт, только если встречалось **минимум в трёх**
   *    тренировках цикла — на двух точках это шум, а не тренд;
   *  - сравниваем первое и последнее значение, порог — **один шаг**: 2,5 кг
   *    или одно повторение, иначе в «рост» попадёт округление;
   *  - максимум три строки по относительному приросту.
   *
   * Роста нет — заголовок меняется на «Что удержано», и вместо весов идут
   * постоянство, тоннаж и закрытые подходы. «Что выросло» с пустым списком —
   * издевательство над человеком, который месяц ходил в зал.
   */
  const GROWTH_STEP_KG = 2.5;
  const GROWTH_MIN_SESSIONS = 3;
  const GROWTH_MAX_ROWS = 3;

  /**
   * Расчётный максимум по Эпли (контракт strength-builder, инвариант «95 кг из 75 × 8»):
   *   1RM = вес × (1 + повторы / 30)
   * Живёт в ядре, чтобы finish/history не разъехались с Бржицки или другой формулой.
   */
  function epleyOneRepMax(weightKg, reps) {
    const w = toWeightNumber(weightKg);
    const r = +reps || 0;
    if (w === null || w <= 0 || r <= 0) return null;
    return w * (1 + r / 30);
  }

  /** Рабочий вес упражнения за тренировку: лучший закрытый рабочий подход. */
  function workingTopSet(ex) {
    const aps = ex && Array.isArray(ex.approaches) ? ex.approaches : [];
    let best = null;
    for (let i = 0; i < aps.length; i++) {
      const a = aps[i];
      if (isWarmupApproach(a) || !isApproachDone(a) || isBlankApproach(a)) continue;
      const w = toWeightNumber(a.weightKg);
      const reps = +a.reps || 0;
      const weight = w === null ? 0 : w;
      if (!best || weight > best.weightKg || (weight === best.weightKg && reps > best.reps)) {
        best = { weightKg: weight, reps: reps };
      }
    }
    return best;
  }

  /** Расчётный максимум упражнения за тренировку — Эпли от лучшего закрытого рабочего подхода. */
  function estimatedMaxFromExercise(ex) {
    const top = workingTopSet(ex);
    if (!top) return null;
    return epleyOneRepMax(top.weightKg, top.reps);
  }

  function programGrowth(sessions) {
    const list = Array.isArray(sessions) ? sessions.slice() : [];
    list.sort(function (a, b) { return String(a.date) < String(b.date) ? -1 : 1; });

    const byName = {};
    let totalVolume = 0;
    let doneApproaches = 0;
    list.forEach(function (s) {
      const exercises = Array.isArray(s.exercises) ? s.exercises : [];
      exercises.forEach(function (ex) {
        const top = workingTopSet(ex);
        if (!top) return;
        const name = String((ex && ex.name) || '').trim();
        if (!name) return;
        (byName[name] = byName[name] || []).push(top);
        totalVolume += top.weightKg * top.reps;
      });
      const agg = trainingTonnage({
        type: 'strength', strengthEntryMode: 'workout_builder',
        workoutLog: { exercises: exercises }
      });
      doneApproaches += agg.doneApproaches;
    });

    const rows = [];
    Object.keys(byName).forEach(function (name) {
      const points = byName[name];
      if (points.length < GROWTH_MIN_SESSIONS) return;
      const first = points[0];
      const last = points[points.length - 1];
      const dKg = last.weightKg - first.weightKg;
      const dReps = last.reps - first.reps;
      // Один шаг — минимум, ниже которого это не рост, а округление.
      if (dKg >= GROWTH_STEP_KG) {
        rows.push({
          name: name, kind: 'weight',
          from: first.weightKg, to: last.weightKg, delta: dKg,
          relative: first.weightKg > 0 ? dKg / first.weightKg : 1
        });
        return;
      }
      // Вес не вырос, но повторы выросли — для своего веса это единственная ось.
      if (dKg >= 0 && dReps >= 1) {
        rows.push({
          name: name, kind: 'reps',
          from: first.reps, to: last.reps, delta: dReps,
          relative: first.reps > 0 ? dReps / first.reps : 1
        });
      }
    });
    rows.sort(function (a, b) { return b.relative - a.relative; });

    if (rows.length) {
      return { kind: 'growth', rows: rows.slice(0, GROWTH_MAX_ROWS), held: null };
    }
    return {
      kind: 'held',
      rows: [],
      held: {
        sessions: list.length,
        totalVolume: Math.round(totalVolume),
        doneApproaches: doneApproaches
      }
    };
  }

  /** Живое предложение, ждущее ответа клиента. */
  function pendingPlanProposal(training) {
    const p = training && training.plan && training.plan.proposal;
    return p && p.status === 'pending' ? p : null;
  }

  function findById(list, id) {
    const arr = Array.isArray(list) ? list : [];
    const want = String(id);
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && String(arr[i].id) === want) return arr[i];
    }
    return null;
  }

  function nextGroupId(exercises) {
    let max = 0;
    (exercises || []).forEach(function (ex) {
      const g = exerciseGroupId(ex);
      if (g > max) max = g;
    });
    return max + 1;
  }

  /**
   * Сводка одной тренировки.
   *
   * Различаются ДВА тоннажа, и это не дубликат, а разный смысл:
   *   totalVolume   — только отмеченные подходы: сколько реально поднято;
   *   plannedVolume — все подходы, включая неотмеченные: сколько набрано в план.
   *
   * До 2026-08-08 обе величины считались независимо в двух местах
   * heys_day_trainings_v1.js (computeDayTotalTonnage — по done, подпись на
   * карточке через calcWorkoutBuilderVolumeKg — по всем), и разойтись они могли
   * молча. Теперь формула одна, а выбор величины — за вызывающим.
   *
   * Назначенную куратором тренировку эта функция считает как любую другую, и
   * это намеренно: карточка назначенного показывает «~N кг объёма» именно через
   * plannedVolume. Отсев плана — в dayTonnage и countStrengthWorkouts, то есть
   * там, где считается ФАКТ дня.
   *
   * Упражнение без массива approaches — старый снимок: там подходов нет, есть
   * sets/reps/weightKg. Такие строки идут в обе величины целиком: признака
   * выполнения в них не существует, и отбросить их значило бы потерять историю.
   */
  function trainingTonnage(training, opts) {
    const out = {
      totalVolume: 0, plannedVolume: 0, maxWeight: 0,
      totalApproaches: 0, doneApproaches: 0, exerciseCount: 0,
      warmupApproaches: 0, seconds: 0, meters: 0, unmeasuredExercises: 0,
    };
    if (!isStrengthBuilder(training)) return out;
    // Масса тела нужна упражнениям со своим весом. Её нет — считать нечего:
    // то же правило, что у неизвестного коэффициента, строка «не посчитали».
    const bodyWeightKg = opts && +opts.bodyWeightKg > 0 ? +opts.bodyWeightKg : 0;
    const exercises = Array.isArray(training.workoutLog.exercises) ? training.workoutLog.exercises : [];
    for (let j = 0; j < exercises.length; j++) {
      const ex = exercises[j];
      if (!ex) continue;
      const aps = Array.isArray(ex.approaches) ? ex.approaches : [];
      if (aps.length) {
        out.exerciseCount += 1;
        // Единица и коэффициент — снимок, снятый со справочника при добавлении
        // упражнения. Пусто = старая запись: килограммы × повторы, как раньше.
        const unit = ex.unit ? String(ex.unit) : 'weight_reps';
        const factor = toWeightNumber(ex.bodyweightFactor);
        const ownWeightKg = unit === 'bodyweight' && factor !== null && bodyWeightKg > 0
          ? bodyWeightKg * factor
          : null;
        if (unit === 'bodyweight' && ownWeightKg === null) out.unmeasuredExercises += 1;
        for (let k = 0; k < aps.length; k++) {
          const a = aps[k];
          // Прочерк участника, добавленного по ходу: подход существует, но не
          // заполнен — ни в счётчик, ни в тоннаж он не идёт.
          if (isBlankApproach(a)) continue;
          const warmup = isWarmupApproach(a);
          // Canvas acceptance: разминка хранится и показывается отдельно, но
          // не входит ни в рабочий прогресс, ни в число незакрытых подходов.
          if (warmup) {
            out.warmupApproaches += 1;
            continue;
          }
          out.totalApproaches += 1;
          const done = isApproachDone(a);
          if (done) out.doneApproaches += 1;

          if (unit === 'time' || unit === 'distance') {
            // Время и метры не перемножаются с килограммами и копятся своими
            // величинами; в тоннаж не идут ни при каком типе подхода.
            if (!done) continue;
            if (unit === 'time') out.seconds += Math.max(0, toWeightNumber(a && a.durationSec) || 0);
            else out.meters += Math.max(0, toWeightNumber(a && a.distanceM) || 0);
            continue;
          }

          const stages = approachStages(a);
          let vol = 0;
          for (let s = 0; s < stages.length; s++) {
            const st = stages[s];
            const r = st.reps;
            if (!(r > 0)) continue;
            let w;
            if (unit === 'bodyweight') {
              if (ownWeightKg === null) continue;
              w = ownWeightKg + approachExtraWeight(a);
            } else {
              w = toWeightNumber(st.weightKg) || 0;
            }
            if (w > 0) vol += w * r;
            // Рекорд — по основной ступени: иначе любой дроп-сет автоматически
            // стал бы личным рекордом, хотя человек не поднял больше.
            if (!st.isDrop && !warmup && done && w > out.maxWeight) out.maxWeight = w;
          }
          out.plannedVolume += vol;
          if (done) out.totalVolume += vol;
        }
        continue;
      }
      // Legacy-строка: sets × reps × вес, признака выполнения нет.
      const w = parseFloat(String(ex.weightKg || '').replace(',', '.')) || 0;
      const sets = +ex.sets || 0;
      const reps = +ex.reps || 0;
      if (w > 0 && sets > 0 && reps > 0) {
        out.exerciseCount += 1;
        out.totalApproaches += sets;
        out.doneApproaches += sets;
        const vol = w * sets * reps;
        out.totalVolume += vol;
        out.plannedVolume += vol;
        if (w > out.maxWeight) out.maxWeight = w;
      }
    }
    return out;
  }

  /**
   * Сумма тоннажа (вес × повторы) всех завершённых подходов всех силовых в дне.
   * Назначенные куратором тренировки пропускаются: день с планом обязан давать
   * тот же тоннаж, что пустой.
   */
  function dayTonnage(day, opts) {
    if (!day || !Array.isArray(day.trainings)) return 0;
    let total = 0;
    for (let i = 0; i < day.trainings.length; i++) {
      const t = day.trainings[i];
      if (isPlanned(t)) continue;
      total += trainingTonnage(t, opts).totalVolume;
    }
    return total;
  }

  /** Сколько выполняемых workout_builder-тренировок в дне (назначенные не в счёт). */
  function countStrengthWorkouts(day) {
    if (!day || !Array.isArray(day.trainings)) return 0;
    let n = 0;
    for (let i = 0; i < day.trainings.length; i++) {
      const t = day.trainings[i];
      if (isStrengthBuilder(t) && !isPlanned(t)) n += 1;
    }
    return n;
  }

  const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
  const DEFAULT_BARBELL_KG = 20;

  function barbellPlateLayout(totalKg, barKg) {
    const bar = barKg > 0 ? barKg : DEFAULT_BARBELL_KG;
    const total = parseFloat(String(totalKg == null ? '' : totalKg).replace(',', '.'));
    if (!isFinite(total) || total <= bar) return null;
    let perSide = Math.round(((total - bar) / 2) * 100) / 100;
    if (perSide < 0) return null;
    const plates = [];
    for (let pi = 0; pi < STANDARD_PLATES_KG.length; pi++) {
      const plate = STANDARD_PLATES_KG[pi];
      while (perSide >= plate - 0.001) {
        plates.push(plate);
        perSide = Math.round((perSide - plate) * 100) / 100;
      }
    }
    if (perSide > 0.01) return null;
    return { barKg: bar, perSide: plates, totalKg: total };
  }

  TK.strength = {
    __registered: true,
    isStrengthBuilder: isStrengthBuilder,
    trainingTonnage: trainingTonnage,
    dayTonnage: dayTonnage,
    countStrengthWorkouts: countStrengthWorkouts,
    APPROACH_TYPES: APPROACH_TYPES,
    MAX_APPROACH_STAGES: MAX_APPROACH_STAGES,
    approachType: approachType,
    isWarmupApproach: isWarmupApproach,
    approachStages: approachStages,
    isApproachDone: isApproachDone,
    approachExtraWeight: approachExtraWeight,
    normalizeApproach: normalizeApproach,
    validateApproach: validateApproach,
    isBlankApproach: isBlankApproach,
    hasDiscomfort: hasDiscomfort,
    supersetGroups: supersetGroups,
    supersetRounds: supersetRounds,
    supersetRestSec: supersetRestSec,
    validateSupersetLayout: validateSupersetLayout,
    addSupersetRound: addSupersetRound,
    addSupersetMember: addSupersetMember,
    swapSupersetMembers: swapSupersetMembers,
    moveSupersetGroup: moveSupersetGroup,
    insertRespectingGroups: insertRespectingGroups,
    makeSuperset: makeSuperset,
    orderBlocks: orderBlocks,
    moveBlock: moveBlock,
    hasDoneApproach: hasDoneApproach,
    applyPlanEdit: applyPlanEdit,
    acceptPlanProposal: acceptPlanProposal,
    barbellPlateLayout: barbellPlateLayout,
    DEFAULT_BARBELL_KG: DEFAULT_BARBELL_KG,
    declinePlanProposal: declinePlanProposal,
    expirePlanProposal: expirePlanProposal,
    pendingPlanProposal: pendingPlanProposal,
    programGrowth: programGrowth,
    workingTopSet: workingTopSet,
    epleyOneRepMax: epleyOneRepMax,
    estimatedMaxFromExercise: estimatedMaxFromExercise
  };
})(typeof window !== 'undefined' ? window : globalThis);
