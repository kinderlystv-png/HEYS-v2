/**
 * heys_working_weights_v1.js — растут ли рабочие веса.
 *
 * Поправка на факт спрашивает это в одном месте: вес стоит, замеров нет — может
 * ли дело быть в перестройке состава, а не в застое. Контракт называет такой
 * довод косвенным и говорит, почему: рост рабочих весов в первые месяцы во
 * многом нервная адаптация, то есть довод «тренировки продуктивны», а не
 * «мышцы выросли». Отсюда осторожность всей метрики.
 *
 * Тоннаж для этого не годится. Он растёт и от лишнего подхода, и от смены
 * программы, и от того, что человек добавил упражнение: объём — не нагрузка.
 * Поэтому сравнивается рабочий вес одного и того же упражнения с самим собой.
 *
 * Модуль ничего не решает и никуда не пишет: отдаёт числа и признак, а как их
 * трактовать, решает поправка.
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // Окно контракта — четыре недели, поделённые пополам: сравнивать надо
  // период с периодом, а не последнюю тренировку с первой. Одна тренировка
  // может быть тяжёлой или лёгкой по причинам, к прогрессу не относящимся.
  const WINDOW_DAYS = 28;

  // Упражнение попадает в сравнение, только если встречается в обеих
  // половинах: иначе «рост» получился бы у того, кто просто сменил программу.
  const MIN_SHARED_EXERCISES = 2;

  /**
   * Порог прироста. Веса в зале ходят шагами 2,5 кг, и на штанге 60 кг это
   * 4 %; на гантели 10 кг тот же шаг — это 25 %. Поэтому порог в процентах, а
   * не в килограммах, и взят заведомо ниже одного шага для тяжёлых
   * упражнений — задача не поймать прогресс, а отсечь дрожание вокруг нуля.
   *
   * Величина продуктовая, а не выведенная. Подтверждена владельцем 30 августа
   * 2026 с формулировкой «если так логично и правильно»: менять её — продуктовое
   * решение, а не правка кода, и трогать без такого же решения нельзя.
   */
  const GROWTH_PCT = 2;

  function parseWeight(value) {
    const n = parseFloat(String(value == null ? '' : value).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** Рабочий вес подхода — вес снаряда; повторы здесь не участвуют. */
  function maxWeightOfExercise(ex) {
    if (!ex) return 0;
    let max = 0;
    if (Array.isArray(ex.approaches) && ex.approaches.length) {
      for (const a of ex.approaches) max = Math.max(max, parseWeight(a && a.weightKg));
      return max;
    }
    return parseWeight(ex.weightKg);
  }

  /** Имя упражнения — ключ сравнения; id надёжнее, но есть не везде. */
  function exerciseKey(ex) {
    const id = ex && (ex.exerciseId || ex.id);
    if (id) return 'id:' + String(id);
    const name = String((ex && (ex.name || ex.title)) || '').trim().toLowerCase();
    return name ? 'name:' + name : '';
  }

  /**
   * Максимальный рабочий вес каждого упражнения за набор дней.
   * @param {Array<object>} days дни с trainings[].workoutLog.exercises[]
   */
  function maxWeightsByExercise(days) {
    const out = new Map();
    for (const day of days || []) {
      const trainings = Array.isArray(day && day.trainings) ? day.trainings : [];
      for (const tr of trainings) {
        if (!tr || String(tr.type) !== 'strength') continue;
        const exercises = (tr.workoutLog && Array.isArray(tr.workoutLog.exercises))
          ? tr.workoutLog.exercises
          : [];
        for (const ex of exercises) {
          const key = exerciseKey(ex);
          if (!key) continue;
          const w = maxWeightOfExercise(ex);
          if (w <= 0) continue;
          out.set(key, Math.max(out.get(key) || 0, w));
        }
      }
    }
    return out;
  }

  /**
   * Растут ли рабочие веса за окно.
   *
   * @param {object} input
   * @param {Array<object>} input.days дни окна, по возрастанию даты
   * @returns {{available:boolean, growing:boolean, reason?:string,
   *   shared:number, grew:number, fell:number, deltaPct:number|null, weeks:number}}
   */
  function analyze({ days } = {}) {
    const all = Array.isArray(days) ? days.slice(-WINDOW_DAYS) : [];
    const base = {
      weeks: Math.round(WINDOW_DAYS / 7),
      shared: 0, grew: 0, fell: 0, deltaPct: null, growing: false
    };
    if (all.length < WINDOW_DAYS / 2) {
      return Object.assign(base, { available: false, reason: 'short_window' });
    }

    const half = Math.floor(all.length / 2);
    const early = maxWeightsByExercise(all.slice(0, half));
    const late = maxWeightsByExercise(all.slice(half));

    let grew = 0;
    let fell = 0;
    let sumEarly = 0;
    let sumLate = 0;
    for (const [key, earlyW] of early) {
      const lateW = late.get(key);
      if (!lateW) continue;
      sumEarly += earlyW;
      sumLate += lateW;
      if (lateW > earlyW) grew++;
      else if (lateW < earlyW) fell++;
    }
    const shared = grew + fell + [...early.keys()].filter((k) => late.has(k) && late.get(k) === early.get(k)).length;

    if (shared < MIN_SHARED_EXERCISES) {
      // Сменил программу — сравнивать нечего, и это не «не растут».
      return Object.assign(base, { available: false, reason: 'no_shared_exercises', shared });
    }

    const deltaPct = sumEarly > 0 ? ((sumLate - sumEarly) / sumEarly) * 100 : 0;
    return {
      available: true,
      // Оба условия обязательны: суммарный прирост может дать одно
      // упражнение, а большинство — сойтись на дрожании в сотни граммов.
      growing: deltaPct >= GROWTH_PCT && grew > fell,
      shared, grew, fell,
      deltaPct: Math.round(deltaPct * 10) / 10,
      weeks: Math.round(WINDOW_DAYS / 7)
    };
  }

  HEYS.WorkingWeights = {
    WINDOW_DAYS,
    MIN_SHARED_EXERCISES,
    GROWTH_PCT,
    maxWeightOfExercise,
    maxWeightsByExercise,
    analyze
  };

  console.info('[HEYS.workingWeights] ✅ loaded');
})(typeof window !== 'undefined' ? window : globalThis);
