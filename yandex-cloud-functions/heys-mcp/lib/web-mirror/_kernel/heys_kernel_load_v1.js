// heys_kernel_load_v1.js — ОБЩЕЕ ЯДРО: нагрузка сессии + импульс-реакция
// (тренированность/усталость) по классической модели Банистера.
//
// Модели накопленной нагрузки (TRIMP / acute-chronic / CTL-ATL) в проекте не
// было вовсе (проверено 2026-08-08, TRAINING_LOAD_MODEL_PROMPT.md). Обе
// доменных readiness сейчас смотрят на «вчерашнюю
// нагрузку» кустарно — этот модуль даёт им общую математику.
//
// Что вошло:
//   isPlannedTraining(training)       — запись назначена куратором, но не выполнена
//   sessionLoad(training, zoneMets)   — нагрузка кардио-сессии, MET-минуты
//   fitnessFatigue(dailyLoads, opts)  — CTL/ATL/TSB по плотному ряду за день
//
// Что НЕ вошло и почему:
//   — Тоннаж силовой (TK.strength.trainingTonnage) в те же MET-минуты не
//     переводится: единого физиологического коэффициента «кг тоннажа = сколько
//     MET-минут» не существует, любой выбранный будет произвольным. Кардио- и
//     силовая нагрузка считаются РАЗДЕЛЬНЫМИ рядами через один и тот же
//     fitnessFatigue (функция не знает единиц, ей всё равно, что суммировать).
//     Как сводить два TSB в одну готовность — решение для потребителя (этап 4
//     промпта), не для этого модуля: рано фиксировать формулу слияния, пока
//     нет живого сравнения с реальным поведением.
//   — Сведение кардио и силовой через session-RPE. RPE в схеме ЕСТЬ: поле `rpe`
//     на упражнении силового конструктора (0–10) плюс контрол в UI, а с
//     2026-08-08 его принимает и коннектор. Это делает возможным общий
//     знаменатель `RPE × длительность` — но у кардио-тренировок RPE сейчас не
//     заполняется, поэтому единый ряд собрался бы только по силовым и молча
//     игнорировал остальное. Сводить имеет смысл, когда RPE будет и у кардио.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.load && TK.load.__registered) return; // idempotent

  // Те же дефолты, что HEYS.TDEE.calculate использует для zoneMets — не
  // заводим третий набор чисел рядом с калорийной моделью.
  const DEFAULT_ZONE_METS = [2.5, 6, 8, 10];

  // 42/7 дней — стандартные постоянные времени модели Банистера (тренированность
  // усредняет ~6 недель нагрузки, усталость — ~1 неделю). Настраиваемы через opts,
  // но домен, меняющий их без причины, разойдётся с остальными без предупреждения.
  const DEFAULT_CTL_TAU = 42;
  const DEFAULT_ATL_TAU = 7;

  // Числа в блобах бывают строками ('30'), и калорийный путь их принимает
  // (`+min || 0` в heys_tdee_v1). Считать их нулём значило бы показывать нулевую
  // нагрузку там, где калории посчитаны.
  function num(x) {
    const v = typeof x === 'number' ? x : parseFloat(x);
    return isFinite(v) ? v : 0;
  }

  /**
   * Тренировка назначена куратором, но ещё не выполнена.
   *
   * Назначенное лежит в `day.trainings` рядом с фактическим — теми же полями,
   * с теми же зонами и упражнениями. Без общего предиката каждый счётчик
   * считал бы план фактом: одно назначение поднимало бы расход, тоннаж и
   * накопленную нагрузку так, будто человек уже отработал. Статусы 'started' и
   * 'done' — уже факт, для них false.
   *
   * Поле `plan` пока не пишет никто: защита ставится ДО реализации назначения,
   * чтобы к первой такой записи все потребители уже умели её не засчитывать.
   * Предикат один на всё ядро — второй, локальный, разойдётся с этим молча.
   *
   * @param {{plan?:{status?:string}}} training
   */
  function isPlannedTraining(training) {
    return !!(training && training.plan && training.plan.status === 'assigned');
  }

  /**
   * Нагрузка одной кардио-сессии в MET-минутах: сумма `минуты_зоны × MET_зоны`.
   * Вес зоны берётся из настроек клиента (hr_zones), не из новой константы —
   * персонализация уже есть, второй раз её не изобретаем.
   *
   * Силовые (type === 'strength' с workoutLog) сюда не попадают — их нагрузка
   * считается отдельно через TK.strength.trainingTonnage, в других единицах.
   *
   * @param {{z:number[], type?:string}} training
   * @param {number[]} [zoneMets] — MET по зонам, по умолчанию как у TDEE
   */
  function sessionLoad(training, zoneMets) {
    if (!training || String(training.type) === 'strength') return 0;
    // Назначенное — ещё не сделанное: план не создаёт нагрузки, даже если у него
    // уже проставлены минуты по зонам.
    if (isPlannedTraining(training)) return 0;
    const z = Array.isArray(training.z) ? training.z : [];
    const mets = Array.isArray(zoneMets) && zoneMets.length ? zoneMets : DEFAULT_ZONE_METS;
    let load = 0;
    for (let i = 0; i < z.length; i++) {
      // Отсутствующий MET заменяется дефолтом СВОЕЙ зоны, а не последней:
      // `mets[i] || mets[mets.length - 1]` подставлял анаэробные 8 вместо 2.5
      // и завышал нагрузку зоны 1 в 3.2 раза против калорийного расчёта.
      const met = num(mets[i]) || num(DEFAULT_ZONE_METS[i]) || num(DEFAULT_ZONE_METS[DEFAULT_ZONE_METS.length - 1]);
      load += num(z[i]) * met;
    }
    return load;
  }

  /**
   * Импульс-реакция Банистера: тренированность (CTL) и усталость (ATL) как
   * экспоненциально взвешенные средние нагрузки, готовность (TSB) — их разность.
   *
   * @param {number[]} dailyLoads — ПЛОТНЫЙ ряд, один элемент на календарный
   *   день, старые → новые, последний элемент — «сегодня». Дни без тренировок
   *   передаются нулём, а не пропускаются: пропуск исказил бы распад экспоненты
   *   (день без нагрузки — не то же самое, что день, которого не было).
   * @param {{ctlTau?:number, atlTau?:number}} [opts]
   * @returns {{ctl:number, atl:number, tsb:number, daysOfHistory:number, confidence:'low'|'medium'|'high'}}
   */
  function fitnessFatigue(dailyLoads, opts) {
    const o = opts || {};
    const ctlTau = num(o.ctlTau) || DEFAULT_CTL_TAU;
    const atlTau = num(o.atlTau) || DEFAULT_ATL_TAU;
    const series = Array.isArray(dailyLoads) ? dailyLoads : [];
    const ctlAlpha = 1 - Math.exp(-1 / ctlTau);
    const atlAlpha = 1 - Math.exp(-1 / atlTau);

    // Старт с нуля давал структурный перекос: за окно длиной в одну τ
    // экспонента прогревается лишь на 63%, поэтому CTL всегда занижен, а
    // готовность (CTL − ATL) не могла стать положительной даже при идеально
    // ровной нагрузке (проверено: 42 дня по 100 → tsb −36.5). Стартуем со
    // среднего по ряду — это допущение «до окна человек тренировался примерно
    // так же», честное и стандартное для импульс-реакции.
    let seed = 0;
    for (let i = 0; i < series.length; i++) seed += num(series[i]);
    seed = series.length ? seed / series.length : 0;

    let ctl = seed;
    let atl = seed;
    for (let i = 0; i < series.length; i++) {
      const load = num(series[i]);
      ctl += (load - ctl) * ctlAlpha;
      atl += (load - atl) * atlAlpha;
    }

    // Дней С ДАННЫМИ, а не длина ряда: ряд плотный и всегда равен окну, так
    // что series.length говорил «42 дня истории» даже клиенту, заведённому
    // вчера, и confidence навсегда застревал на medium.
    const daysOfHistory = o.daysWithData === undefined || o.daysWithData === null
      ? series.length
      : Math.max(0, Math.round(num(o.daysWithData)));
    const confidence = daysOfHistory >= ctlTau ? 'high'
      : daysOfHistory >= Math.round(ctlTau / 3) ? 'medium'
        : 'low';

    return {
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
      daysOfHistory: daysOfHistory,
      confidence: confidence,
    };
  }

  TK.load = {
    __registered: true,
    DEFAULT_ZONE_METS: DEFAULT_ZONE_METS,
    DEFAULT_CTL_TAU: DEFAULT_CTL_TAU,
    DEFAULT_ATL_TAU: DEFAULT_ATL_TAU,
    isPlannedTraining: isPlannedTraining,
    sessionLoad: sessionLoad,
    fitnessFatigue: fitnessFatigue,
  };
})(typeof window !== 'undefined' ? window : globalThis);
