/**
 * heys_norm_correction_v1.js — поправка на факт.
 *
 * Норма считается вперёд от формулы: базовый обмен плюс активность и
 * тренировки. Формула ошибается на конкретном человеке, и раньше эта ошибка
 * жила вечно. Поправка сверяет обещанное изменение веса с фактическим и
 * подкручивает расход под этого человека.
 *
 * Канон — norm-correction.v4.dc.html. Здесь только расчёт: решение применять
 * принимает человек (на Pro — куратор со своей карточки, на Self — клиент).
 * Модуль ничего не сохраняет и ничего не двигает сам.
 *
 * Сквозной пример контракта, он же смоук:
 *   1520 + 610 + 270 = 2400 расход · факт 2210 · расхождение 8 %
 *   цель ×0,92 · шаг недели ×0,97 = 2328 · дефицит −12 % = 2049 норма дня
 *   норма до поправки 2400 × 0,88 = 2112, разница −63 ккал
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // 7700 ккал ≈ 1 кг — та же константа, что во всём проекте (Wishnofsky 1958).
  // Она груба: реальная плотность зависит от того, что именно теряется. Но
  // поправка меряет не физиологию, а результат — насколько расчёт расходится с
  // тем, что показывают весы. Поэтому грубость константы уходит в сам
  // коэффициент и не искажает его назначение.
  const KCAL_PER_KG = 7700;

  // За этими границами вероятнее ошибка данных, чем экзотический обмен:
  // формула ошибается на человеке примерно на десятую часть.
  const FACTOR_MIN = 0.90;
  const FACTOR_MAX = 1.15;

  // Не больше трёх процентов за обновление: до цели ×0,92 доходим примерно за
  // три недели. Иначе задержка воды дёргала бы норму туда-сюда.
  const MAX_STEP = 0.03;

  const WINDOW_MIN_DAYS = 14;
  const WINDOW_WORKING_DAYS = 21;

  // Порог права считать: без него число получится уверенным на вид и случайным
  // по сути.
  const GATE_LOGGED_DAYS = 10;
  const GATE_WEIGH_INS = 6;

  // Первые две недели поправка равна единице, и это видимое состояние, а не
  // пустая строка. Холодный старт не сокращается, даже когда данных уже
  // хватает: на первой неделе дефицита уходит вода, и коэффициент задрало бы
  // вверх ровно тогда, когда водный эффект кончается.
  const COLD_START_DAYS = 14;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /**
   * Насколько реальный расход расходится с формульным.
   *
   * @param {object} input
   * @param {Array<{kcal:number, isLogged:boolean, isIncomplete:boolean}>} input.days
   *        дни окна со стороны съеденного
   * @param {number} input.formulaPerDay средний формульный расход за окно
   * @param {{deltaKg:number, measuredDays:number, windowDays:number}} input.trend
   *        канонический тренд веса (HEYS.Widgets.WeightDynamicsV4.trendForWindow)
   * @param {number} input.currentFactor действующая поправка, по умолчанию 1
   * @param {number} input.historyDays сколько дней человек вообще ведёт дневник
   */
  function compute(input) {
    const opts = input || {};
    const trend = opts.trend || {};
    const currentFactor = Number.isFinite(opts.currentFactor) ? opts.currentFactor : 1;
    const formulaPerDay = Number(opts.formulaPerDay) || 0;
    const historyDays = Number(opts.historyDays) || 0;

    // Сторона съеденного: окно исключает дни, помеченные неполными, ровно как
    // это делает долг калорий. Сторона веса исключает цикл и рефид — но это
    // уже сделано в тренде, здесь второй раз не фильтруем.
    const loggedDays = (opts.days || []).filter(
      (d) => d && d.isLogged && !d.isIncomplete && Number.isFinite(d.kcal)
    );

    const base = {
      windowDays: trend.windowDays || WINDOW_WORKING_DAYS,
      loggedDays: loggedDays.length,
      weighIns: trend.measuredDays || 0,
      formulaPerDay: Math.round(formulaPerDay),
      currentFactor
    };

    if (historyDays < COLD_START_DAYS) {
      return Object.assign({}, base, {
        status: 'cold_start',
        // Не «данных нет», а «ещё рано»: разные состояния и разные слова.
        reason: 'Пока считаем по формуле — проверим расчёт на вашем результате',
        daysLeft: COLD_START_DAYS - historyDays,
        nextFactor: 1
      });
    }

    const missing = {};
    if (loggedDays.length < GATE_LOGGED_DAYS) missing.loggedDays = GATE_LOGGED_DAYS - loggedDays.length;
    if (base.weighIns < GATE_WEIGH_INS) missing.weighIns = GATE_WEIGH_INS - base.weighIns;
    if (!formulaPerDay || !Number.isFinite(trend.deltaKg)) missing.trend = true;

    if (Object.keys(missing).length) {
      return Object.assign({}, base, {
        status: 'not_enough_data',
        reason: 'Данных в окне мало — число получилось бы уверенным на вид и случайным по сути',
        missing,
        nextFactor: currentFactor
      });
    }

    // Реальный расход: сколько человек съел минус то, что ушло из запаса.
    // Снижение веса — отрицательная дельта, значит запас отдавал энергию и
    // расход был выше съеденного.
    const eatenPerDay = loggedDays.reduce((s, d) => s + d.kcal, 0) / loggedDays.length;
    const storedPerDay = (trend.deltaKg * KCAL_PER_KG) / base.windowDays;
    const factPerDay = eatenPerDay - storedPerDay;

    const targetFactor = factPerDay / formulaPerDay;
    const mismatchPct = Math.round((targetFactor - 1) * 100);

    if (targetFactor < FACTOR_MIN || targetFactor > FACTOR_MAX) {
      return Object.assign({}, base, {
        status: 'out_of_range',
        // Не «поправим сильно», а «не поправим»: за границей вероятнее ошибка
        // данных, и двигать норму по ней опаснее, чем не двигать вовсе.
        reason: 'Расхождение за рабочим диапазоном — вероятнее ошибка данных, чем такой обмен',
        eatenPerDay: Math.round(eatenPerDay),
        factPerDay: Math.round(factPerDay),
        targetFactor: Math.round(targetFactor * 1000) / 1000,
        mismatchPct,
        nextFactor: currentFactor
      });
    }

    // Шаг ограничен, поэтому к цели идём за несколько недель, а не рывком.
    const stepped = clamp(
      targetFactor,
      currentFactor * (1 - MAX_STEP),
      currentFactor * (1 + MAX_STEP)
    );
    const nextFactor = Math.round(clamp(stepped, FACTOR_MIN, FACTOR_MAX) * 100) / 100;

    return Object.assign({}, base, {
      status: 'ready',
      eatenPerDay: Math.round(eatenPerDay),
      factPerDay: Math.round(factPerDay),
      mismatchPct,
      targetFactor: Math.round(targetFactor * 1000) / 1000,
      nextFactor,
      // Рост система применяет сама и сообщает в тот же день; снижение требует
      // явного согласия. Делим не по «с подтверждением или без», а по тому,
      // чьё это решение.
      direction: nextFactor > currentFactor ? 'up' : (nextFactor < currentFactor ? 'down' : 'hold'),
      needsConsent: nextFactor < currentFactor
    });
  }

  /**
   * Норма дня с учётом поправки. Дефицит по договорённости поправка не трогает —
   * он остаётся обещанием клиенту. Ниже базового обмена норма не опускается ни
   * при какой поправке.
   */
  function applyFactor({ expenditure, factor, deficitPct, basalMetabolism }) {
    const exp = Number(expenditure) || 0;
    const k = Number.isFinite(factor) ? factor : 1;
    const corrected = exp * k;
    const norm = Math.round(corrected * (1 + (Number(deficitPct) || 0) / 100));
    const floor = Math.round(Number(basalMetabolism) || 0);
    return {
      correctedExpenditure: Math.round(corrected),
      norm: floor > 0 ? Math.max(norm, floor) : norm,
      hitFloor: floor > 0 && norm < floor
    };
  }

  const WHAT_HUMAN = {
    applied: 'применил',
    postponed: 'отложил',
    declined: 'отказался',
    cold_start: 'холодный старт'
  };

  /**
   * Модель кураторской карточки: строки и числа, без вёрстки.
   *
   * Сетка кабинета куратора и место карточки в списке клиентов — отдельное
   * решение и отдельный канвас (строка «вид кабинета куратора»), поэтому здесь
   * только содержимое. Что бы её ни рисовало потом — кабинет или коннектор
   * куратора, — числа берутся отсюда, и они те же, что увидит клиент: одно
   * окно, одно округление.
   */
  function buildCuratorCard({ result, expenditure, deficitPct, basalMetabolism, history }) {
    const res = result || {};
    const exp = Number(expenditure) || res.formulaPerDay || 0;

    const card = {
      status: res.status,
      // Норма против факта — двумя строками с подписями источника.
      formula: { value: Math.round(exp), source: 'BMR + шаги + тренировки' },
      fact: res.status === 'ready' || res.status === 'out_of_range'
        ? { value: res.factPerDay, source: 'съедено минус движение веса' }
        : null,
      mismatchPct: Number.isFinite(res.mismatchPct) ? Math.abs(res.mismatchPct) : null,
      // Качество данных — словом «хватает» или «мало», а не голым числом.
      quality: [
        {
          label: 'Взвешиваний реальных',
          value: res.weighIns,
          need: GATE_WEIGH_INS,
          enough: (res.weighIns || 0) >= GATE_WEIGH_INS
        },
        {
          label: 'Дней ведено',
          value: res.loggedDays,
          need: GATE_LOGGED_DAYS,
          enough: (res.loggedDays || 0) >= GATE_LOGGED_DAYS
        }
      ],
      // Только куратору. Клиенту эта строка не показывается никогда: она про
      // выбор лечения, а не про клиента.
      whereMismatchSits: res.status === 'ready'
        ? 'В расходе — формула завышает. Или в точности записей — часть съеденного не попала в дневник. Поправка выравнивает результат в обоих случаях, но лечится это по-разному.'
        : null,
      recommendation: null,
      actions: []
    };

    if (res.status === 'ready') {
      const after = applyFactor({ expenditure: exp, factor: res.nextFactor, deficitPct, basalMetabolism });
      const before = applyFactor({ expenditure: exp, factor: res.currentFactor, deficitPct, basalMetabolism });
      card.recommendation = {
        norm: after.norm,
        deltaKcal: after.norm - before.norm,
        currentNorm: before.norm,
        stepFactor: res.nextFactor,
        targetFactor: res.targetFactor,
        hitFloor: after.hitFloor
      };
      card.actions = ['apply_tomorrow', 'postpone', 'freeze'];
    } else {
      card.reason = res.reason;
      card.missing = res.missing || null;
    }

    // История: значение поправки и что сделал человек. Точка недели стоит по
    // шкале между 1,00 и целью, а не «примерно» — долю считаем здесь, чтобы
    // рисующий не выдумывал её сам.
    const target = Number.isFinite(res.targetFactor) ? res.targetFactor : FACTOR_MIN;
    card.history = (history || []).map((row) => {
      const span = 1 - target;
      const share = span > 0 ? clamp((1 - row.factor) / span, 0, 1) : 0;
      return {
        weekLabel: row.weekLabel,
        factor: row.factor,
        what: row.what,
        whatWord: WHAT_HUMAN[row.what] || row.what,
        scaleShare: Math.round(share * 100) / 100
      };
    });

    return card;
  }

  HEYS.NormCorrection = {
    KCAL_PER_KG,
    FACTOR_MIN,
    FACTOR_MAX,
    MAX_STEP,
    WINDOW_MIN_DAYS,
    WINDOW_WORKING_DAYS,
    GATE_LOGGED_DAYS,
    GATE_WEIGH_INS,
    COLD_START_DAYS,
    compute,
    applyFactor,
    buildCuratorCard
  };
})(typeof window !== 'undefined' ? window : globalThis);
