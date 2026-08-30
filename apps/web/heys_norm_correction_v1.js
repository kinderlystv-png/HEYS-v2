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

  /**
   * Источники — рядом с тем, что они обосновывают, а не в разметке экрана.
   *
   * Правило одно на продукт: ссылка живёт у константы или у механики, а
   * интерфейс берёт её отсюда. Иначе через год «почему 7700» и «почему
   * формула расходится» приходится восстанавливать по памяти, а пятнадцать
   * экранов с копиями ссылок расходятся при первой же правке.
   *
   * Здесь только работы, уже проверенные в проекте: выдуманная ссылка хуже
   * отсутствующей — она выглядит как обоснование и им не является.
   */
  const EVIDENCE = {
    // Ссылка на запись реестра дневной части, а не номер работы: номер в двух
    // местах — это две ссылки, которые разойдутся, а id в реестре один, и
    // registry.missing() ловит опечатку в нём.
    //
    // rosenbaum2010: при дефиците расход падает сильнее, чем предсказывает
    // формула по массе. Это и есть причина, по которой расчёт расходится с
    // фактом и нуждается в поправке.
    adaptation: 'rosenbaum2010'
  };

  // За этими границами вероятнее ошибка данных, чем экзотический обмен:
  // формула ошибается на человеке примерно на десятую часть.
  const FACTOR_MIN = 0.90;
  const FACTOR_MAX = 1.15;

  // Не больше трёх процентов за обновление: до цели ×0,92 доходим примерно за
  // три недели. Иначе задержка воды дёргала бы норму туда-сюда.
  const MAX_STEP = 0.03;
  const DEAD_ZONE = 0.02;

  // Мёртвая зона поправки: расхождение внутри неё — исход «сошлось», норма не
  // двигается и куратора не спрашивают. Без зоны норма ходила каждую неделю на
  // любой шум: пример контракта «сошлось» (ели 2 095, вес −0,3 кг за неделю,
  // k 1,01) давал кадр «Можно есть больше» и +15 ккал. Ширина — решение
  // владельца 30 августа: два процента при шаге в три оставляют поправке
  // рабочий диапазон и отсекают шум. Считается от действующего коэффициента,
  // а не от единицы: у клиента с уже применённой поправкой ×0,95 расхождение
  // мерится от неё.

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
    // То же расхождение с десятой: целые проценты годятся для фразы «факт ниже
    // формулы на 11 %», но рядом с дрейфом коридора спорят с ним — 0,5 %
    // округлялось до 1 %, и строка панели противоречила листу.
    const mismatchPctExact = Math.round((targetFactor - 1) * 1000) / 10;

    // Слагаемые пути «съедено → факт» отдаём наружу: куратору показывают не
    // вывод, а механизм, и пересчитывать его в панели значило бы завести
    // второй расчёт того же числа.
    const path = {
      eatenPerDay: Math.round(eatenPerDay),
      deltaKg: Number.isFinite(trend.deltaKg) ? trend.deltaKg : null,
      storedPerDay: Math.round(storedPerDay)
    };

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
        mismatchPctExact,
        path,
        nextFactor: currentFactor
      });
    }

    // Шаг ограничен, поэтому к цели идём за несколько недель, а не рывком.
    const stepped = clamp(
      targetFactor,
      currentFactor * (1 - MAX_STEP),
      currentFactor * (1 + MAX_STEP)
    );
    // Округление до десятитысячных — не косметика: ровно на границе двойная
    // точность даёт 0,020000000000000018, и клиент с расхождением в аккуратные
    // два процента выпадал из зоны, которая его должна принимать.
    const drift = currentFactor
      ? Math.round(Math.abs(targetFactor / currentFactor - 1) * 10000) / 10000
      : 0;
    const inDeadZone = drift <= DEAD_ZONE;
    const nextFactor = inDeadZone
      ? currentFactor
      : Math.round(clamp(stepped, FACTOR_MIN, FACTOR_MAX) * 100) / 100;

    return Object.assign({}, base, {
      status: 'ready',
      eatenPerDay: Math.round(eatenPerDay),
      factPerDay: Math.round(factPerDay),
      mismatchPct,
      mismatchPctExact,
      targetFactor: Math.round(targetFactor * 1000) / 1000,
      path,
      // Расхождение внутри мёртвой зоны — не расхождение: норма стоит, и
      // экрану это надо сказать словом, а не молчанием.
      deadZone: inDeadZone,
      driftPct: Math.round(drift * 1000) / 10,
      // Шаг ограничен, и это надо показать: без строки «цель ×0,92, шаг не
      // больше 3 %» куратор видит ×0,97 и не понимает, почему не ×0,92.
      stepCapped: !inDeadZone && Math.abs(targetFactor - nextFactor) > 0.005,
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
    frozen: 'заморозил',
    declined: 'отказался',
    matched: 'сошлось',
    cold_start: 'холодный старт'
  };

  // Кто решил — часть решения, а не догадка читающего: «применил» без хозяина
  // одинаково подходит куратору и клиенту, а в истории это разные вещи.
  const WHO_HUMAN = { curator: 'куратор', client: 'клиент', system: 'система' };

  // Безличные исходы хозяина не имеют: «сошлось» и «холодный старт» никто не
  // выбирал, а «отложено» может прийти и от куратора, и от тишины клиента.
  const IMPERSONAL = new Set(['matched', 'cold_start', 'postponed', 'frozen']);

  function decisionWord(what, by) {
    const verb = WHAT_HUMAN[what] || what;
    if (IMPERSONAL.has(what)) {
      return what === 'postponed' ? 'отложено'
        : what === 'frozen' ? 'заморожено'
          : verb;
    }
    const who = WHO_HUMAN[by];
    return who ? who + ' ' + verb : verb;
  }

  /**
   * Модель кураторской карточки: строки и числа, без вёрстки.
   *
   * Сетка кабинета куратора и место карточки в списке клиентов — отдельное
   * решение и отдельный канвас (строка «вид кабинета куратора»), поэтому здесь
   * только содержимое. Что бы её ни рисовало потом — кабинет или коннектор
   * куратора, — числа берутся отсюда, и они те же, что увидит клиент: одно
   * окно, одно округление.
   */
  function buildCuratorCard({ result, expenditure, deficitPct, basalMetabolism, breakdown, history }) {
    const res = result || {};
    const exp = Number(expenditure) || res.formulaPerDay || 0;

    // Разбор расхода долями: куратор решает не по итогу, а по тому, откуда
    // итог взялся. Доли считаются от суммы слагаемых, а не от baseExpenditure:
    // совпадать они обязаны, но если однажды разойдутся, лучше пусть сумма
    // долей останется честной сотней, чем молча не сойдётся.
    const EXPENDITURE_PARTS = [
      { key: 'bmr', label: 'Базовый обмен' },
      { key: 'trainings', label: 'Тренировки' },
      { key: 'steps', label: 'Шаги' },
      { key: 'household', label: 'Бытовая активность' }
    ];
    let expenditureParts = null;
    if (breakdown) {
      const total = EXPENDITURE_PARTS.reduce(
        (sum, p) => sum + (Number(breakdown[p.key]) || 0), 0
      );
      if (total > 0) {
        // Нулевые слагаемые не показываем: строка «Тренировки 0 ккал · 0 %»
        // не факт о человеке, а шум от того, что он не тренировался.
        const rows = EXPENDITURE_PARTS
          .map((p) => ({ key: p.key, label: p.label, raw: Number(breakdown[p.key]) || 0 }))
          .filter((p) => p.raw >= 0.5);
        const sum = rows.reduce((acc, p) => acc + p.raw, 0);
        // Проценты по наибольшим остаткам: простое округление каждой доли
        // давало 72 + 13 + 13 + 3 = 101, и сумма долей спорила сама с собой.
        const exact = rows.map((p) => (p.raw / sum) * 100);
        const floors = exact.map((v) => Math.floor(v));
        let left = 100 - floors.reduce((a, b) => a + b, 0);
        const order = exact
          .map((v, i) => ({ i, frac: v - Math.floor(v) }))
          .sort((a, b) => b.frac - a.frac);
        for (const o of order) {
          if (left <= 0) break;
          floors[o.i] += 1;
          left--;
        }
        expenditureParts = rows.map((p, i) => ({
          key: p.key, label: p.label,
          value: Math.round(p.raw),
          sharePct: floors[i]
        }));
      }
    }

    const card = {
      status: res.status,
      // Норма против факта — двумя строками с подписями источника.
      formula: { value: Math.round(exp), source: 'BMR + шаги + тренировки' },
      fact: res.status === 'ready' || res.status === 'out_of_range'
        ? { value: res.factPerDay, source: 'съедено минус движение веса' }
        : null,
      mismatchPct: Number.isFinite(res.mismatchPct) ? Math.abs(res.mismatchPct) : null,
      mismatchPctExact: Number.isFinite(res.mismatchPctExact) ? res.mismatchPctExact : null,
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
      //
      // Сторона расхождения выбирает объяснение. Один текст на оба направления
      // прямо противоречил числам над собой: у клиента факт 2 273 против
      // формулы 2 230 — расчёт просит поднять норму, а строка говорила
      // «формула завышает». При нулевом расхождении строки нет вовсе: объяснять
      // нечего.
      whereMismatchSits: (res.status === 'ready' && res.mismatchPct && !res.deadZone)
        ? (res.mismatchPct > 0
          ? 'В расходе — формула занижает: человек тратит больше, чем она считает. Или в точности записей — в дневник попало больше, чем съедено. Поправка выравнивает результат в обоих случаях, но лечится это по-разному.'
          : 'В расходе — формула завышает. Или в точности записей — часть съеденного не попала в дневник. Поправка выравнивает результат в обоих случаях, но лечится это по-разному.')
        : null,
      // Второй слой листа: из чего сложился расход и как из съеденного
      // получилось предложение. В первом слое остаётся вывод и действие.
      expenditureParts,
      path: res.path || null,
      stepCapped: !!res.stepCapped,
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
        // Цель к показу — с той же точностью, что применяемое. Иначе рядом
        // встают «цель ×1,008» и «применяем ×1,01», и разница в записи
        // читается как разница в решении, хотя это одно и то же число.
        targetFactorShown: Math.round(res.targetFactor * 100) / 100,
        // Последний переход — от расхода к норме — без этих двух чисел не
        // объясним: куратор видит факт 2 045 и норму 1 738 и не знает, что
        // между ними стоит дефицит по договорённости.
        correctedExpenditure: after.correctedExpenditure,
        deficitPct: Number(deficitPct) || 0,
        hitFloor: after.hitFloor
      };
      // Внутри мёртвой зоны решать нечего: применение не сдвинуло бы норму ни
      // на калорию, а кнопка, которая ничего не меняет, обесценивает те,
      // которые меняют.
      card.actions = res.deadZone ? [] : ['apply_tomorrow', 'postpone', 'freeze'];
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
        by: row.by || null,
        whatWord: decisionWord(row.what, row.by),
        scaleShare: Math.round(share * 100) / 100
      };
    });

    return card;
  }

  // История решений живёт своим ключом, а не в профиле: она растёт, а профиль
  // читается на каждом расчёте нормы. Ключ client-scoped — иначе при
  // кураторском входе история одного клиента протекла бы другому (девятый
  // архитектурный инвариант проекта).
  const HISTORY_KEY = 'heys_norm_correction_history';
  const HISTORY_MAX = 12;

  // Предел заморозки — две недели, и отсчёт идёт от первой просьбы о замере, а
  // не от начала застоя. Разница принципиальная: застой мог тянуться месяц до
  // того, как мы впервые спросили, и наказывать за это нечестно. А без предела
  // косвенный довод превращается в ту же машину оправданий, только с отсрочкой.
  const FREEZE_LIMIT_DAYS = 14;

  /**
   * Когда впервые попросили замер. Метка живёт в блобе истории решений: она
   * про ту же поправку и синхронизируется тем же атомарным перекрытием.
   */
  function readMeasurementAsk(lsGet) {
    try {
      const raw = lsGet ? lsGet(HISTORY_KEY, null) : null;
      const at = raw && raw.measurementAskedAt;
      return Number.isFinite(at) ? at : null;
    } catch (e) {
      return null;
    }
  }

  /** Ставится один раз: вторая просьба не продлевает заморозку. */
  function recordMeasurementAsk({ lsGet, lsSet, now }) {
    const existing = readMeasurementAsk(lsGet);
    if (existing) return existing;
    const at = Number(now) || 0;
    if (!at || !lsSet) return existing;
    const raw = (lsGet && lsGet(HISTORY_KEY, null)) || {};
    lsSet(HISTORY_KEY, Object.assign({}, raw, { measurementAskedAt: at }));
    return at;
  }

  /** Сколько дней прошло с первой просьбы; null — не просили. */
  function freezeAgeDays(askedAt, now) {
    if (!askedAt) return null;
    const base = now instanceof Date ? now.getTime() : Number(now) || Date.now();
    return Math.floor((base - askedAt) / (24 * 60 * 60 * 1000));
  }

  function readHistory(lsGet) {
    try {
      const raw = lsGet ? lsGet(HISTORY_KEY, null) : null;
      return Array.isArray(raw && raw.weeks) ? raw.weeks : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Записать решение недели. Решение принимает человек — модуль только
   * сохраняет то, что человек выбрал, и не решает сам.
   *
   * Массивы при синхронизации сливаются атомарно: свежая сторона выигрывает
   * целиком. Для решения раз в неделю одним актором это приемлемо, а потеря
   * косметическая — испортится график истории, но не норма: действующее
   * значение живёт скалярами в профиле и сливается отдельно.
   */
  function recordDecision({ lsGet, lsSet, weekLabel, factor, what, now, by }) {
    const weeks = readHistory(lsGet).filter((w) => w && w.weekLabel !== weekLabel);
    weeks.unshift({
      weekLabel,
      factor: Number(factor),
      what,
      // Хозяин решения. У записей, сделанных до этого поля, его нет — история
      // тогда называет только действие, и это честнее выдуманного хозяина.
      by: by || null,
      at: now || null
    });
    if (lsSet) {
      // Пишем поверх блоба, а не вместо него: рядом с решениями живёт метка
      // первой просьбы о замере, и заменить объект целиком значит стереть
      // заморозку ответом на неё же.
      const raw = (lsGet && lsGet(HISTORY_KEY, null)) || {};
      lsSet(HISTORY_KEY, Object.assign({}, raw, {
        weeks: weeks.slice(0, HISTORY_MAX),
        updatedAt: now || 0
      }));
    }
    return weeks.slice(0, HISTORY_MAX);
  }

  // После третьего «Оставить прежнюю» отказ перестаёт уходить в тишину: без
  // куратора норма иначе стоит месяцами при расходящемся расчёте.
  const REFUSAL_STREAK_LIMIT = 3;

  /**
   * Модель карточки недельной сверки — какой кадр показать и чьё это решение.
   *
   * Клиент видит результат, а не предложение: на Pro карточка изменения нормы
   * появляется, только если куратор уже применил. Иначе экран сказал бы «норму
   * снизили», а в приложении норма прежняя. Факты недели показываются всегда.
   */
  function weeksWordRu(n) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return 'недель';
    if (last > 1 && last < 5) return 'недели';
    if (last === 1) return 'неделю';
    return 'недель';
  }

  // «Четвёртая неделя подряд» — порядковым словом: «4-я неделя» в прозе
  // выглядит служебной пометкой, а строка обращается к человеку.
  const WEEK_ORDINAL = ['', 'первая', 'вторая', 'третья', 'четвёртая', 'пятая',
    'шестая', 'седьмая', 'восьмая', 'девятая', 'десятая'];
  function weekOrdinalRu(n) {
    return WEEK_ORDINAL[n] || (n + '-я');
  }

  function pluralWeeksRu(n) {
    return n + ' ' + weeksWordRu(n);
  }

  function pluralDaysRu(n) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return 'дней';
    if (last > 1 && last < 5) return 'дня';
    if (last === 1) return 'день';
    return 'дней';
  }

  function formatKcal(value) {
    // Тысячи разделяем неразрывным пробелом: «2 112» не должно переноситься.
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  }

  function buildWeeklySyncCard({
    result, tariff, applied, refusalStreak, weeksUnchanged, matchedStreak, recomposition,
    justRaised, expenditure, deficitPct, basalMetabolism,
    // Решение этой недели и предыдущей: первое отвечает человеку на его же
    // нажатие, второе не даёт прошлому предложению исчезнуть молча.
    lastDecision, previousDecision
  }) {
    const res = result || {};
    const isSelf = tariff === 'self';
    const streak = Number(refusalStreak) || 0;
    const exp = Number(expenditure) || res.formulaPerDay || 0;

    // Рост уже применён, и расчёт с ним сошёлся — но сказать об этом человеку
    // нужно всё равно. Тогда «было» берётся из истории решений, иначе разница
    // вышла бы нулевой и карточка сообщила бы о росте на ноль килокалорий.
    const raiseApplied = !!(justRaised && Number.isFinite(justRaised.previousFactor));
    const beforeFactor = raiseApplied ? justRaised.previousFactor : res.currentFactor;
    const afterFactor = raiseApplied
      ? res.currentFactor
      : (res.status === 'ready' ? res.nextFactor : res.currentFactor);

    // Оба числа считаем здесь одним способом: рисующему нечего округлять
    // самому, и клиент с куратором видят одно и то же.
    const before = applyFactor({ expenditure: exp, factor: beforeFactor, deficitPct, basalMetabolism });
    const after = applyFactor({ expenditure: exp, factor: afterFactor, deficitPct, basalMetabolism });
    const norms = {
      current: before.norm,
      next: after.norm,
      deltaKcal: after.norm - before.norm,
      hitFloor: after.hitFloor
    };

    const card = {
      tariff: isSelf ? 'self' : 'pro',
      norms,
      // Предохранители есть в обоих тарифах, разный только слой: там, где
      // человека нет, ограничители перестают быть внутренними.
      safeguardsLayer: isSelf ? 'first' : 'second',
      // Парами «ключ — значение», как остальные строки карточки: сплошной
      // фразой предохранитель читается как обещание, а парой — как граница
      // механизма, и глазом сравнивается с соседней.
      safeguards: [
        { label: 'Шаг за неделю', value: 'не больше 3 %' },
        { label: 'Ниже базового обмена', value: 'не опускаем' },
        { label: 'Отменить', value: 'в любой момент' }
      ],
      // Два числа, из которых видно расхождение. Контракт требует их в обоих
      // тарифах — на Self в кадре «снижение ждёт согласия», на Pro в блоке
      // «Что он смотрит», — а карточка показывала только результат. Человек
      // читал «норма снизилась» и не видел, на чём это основано.
      // Чем кончилось прошлое предложение — строкой на карточке. Канала
      // «что решил куратор» между кабинетом и шторкой нет, и до него это
      // единственный способ не потерять исход: иначе «увидел заранее»
      // превращается в «увидел и не понял». Кто решил, видно по тому, что
      // записано: «отказался» пишет только клиент, «отложил» и «заморозил» —
      // только кураторский лист.
      previousNote: previousDecision && previousDecision.what !== 'applied'
        && previousDecision.what !== 'matched'
        ? (previousDecision.what === 'declined'
          ? 'На прошлой неделе норму оставили прежней.'
          : 'На прошлой неделе куратор оставил норму прежней.')
        : null,
      // Природа числа — подписью под ключом: строка контракта «числа называют
      // свою природу». Два числа подряд без неё читаются как одна величина,
      // померенная дважды. Тон у факта тот же, что в кураторском листе, — он
      // разводит расчёт и измерение.
      evidenceRows: (res.status === 'ready' && exp > 0 && res.factPerDay)
        ? [
          { label: 'Формула говорит', hint: 'расход по формуле', value: Math.round(exp) },
          {
            label: 'Факт говорит',
            hint: 'расход по весу и записям',
            value: res.factPerDay,
            tone: 'fact'
          }
        ]
        : null
    };

    // Вес стоит, но тело меняется — норму не трогаем. Кадр появляется только
    // при подтверждённом доводе, иначе он превращается в оправдание застоя.
    if (recomposition && recomposition.confirmed) {
      return Object.assign(card, {
        frame: 'recomposition',
        evidence: recomposition.source,
        actions: ['ok'],
        decidedBy: 'nobody',
        // Строка «вид · карточки сверки»: праздничная заливка у роста и у
        // подтверждённой перестройки. Вес стоит, а тело меняется — это хорошая
        // новость, и выглядеть она должна хорошей.
        celebratory: true,
        chart: recomposition.chart || null,
        copy: {
          title: 'Вес стоит, а тело меняется',
          body: (recomposition.dropCm > 0
            ? 'Талия ушла на ' + String(recomposition.dropCm).replace('.', ',')
              + ' см за ' + pluralWeeksRu(recomposition.weeks) + ' при том же весе. '
            : '')
            + 'Так выглядит смена состава — норму не трогаем.',
          footnote: 'Следующий замер — через неделю: подтвердим, что направление держится.',
          actionLabels: { ok: 'Хорошо' }
        }
      });
    }
    // «Перестройка · по косвенным»: заморозка на один цикл, норму не трогаем.
    // Карточка остаётся обычной, а не праздничной: довод слабее замера, и
    // выглядеть он должен слабее.
    if (recomposition && recomposition.indirect) {
      return Object.assign(card, {
        frame: 'recomposition_indirect',
        evidence: recomposition.source,
        actions: ['enable_measurements', 'later'],
        decidedBy: 'nobody',
        frozenCycle: true,
        // Строки фактов, как у кураторской карточки: довод назван слабым
        // прямо, а не подразумевается оформлением. Состояние нормы и остаток
        // срока стоят рядом с просьбой о замере — иначе «заморожена» звучит
        // бессрочно, а заморозка кончается на четырнадцатый день.
        facts: [
          { label: 'Довод', value: 'косвенный' },
          { label: 'Норма', value: 'заморожена' },
          {
            label: 'Ждём замер',
            value: 'ещё ' + recomposition.daysLeft
              + ' ' + pluralDaysRu(recomposition.daysLeft)
          }
        ],
        copy: {
          title: 'Похоже на перестройку',
          body: 'Вес стоит, но рабочие веса в зале растут ' + recomposition.weeks
            + ' ' + weeksWordRu(recomposition.weeks)
            + ' — тренировки продуктивны. Норму на этот цикл не трогаем.',
          footnote: 'Точнее скажет замер талии — он отличит перестройку от застоя прямо, а не по догадке. Заморозка длится две недели от первой просьбы: без замера поправка применится по весу.',
          actionLabels: { enable_measurements: 'Включить замеры', later: 'Не сейчас' }
        }
      });
    }

    // Заморозка истекла — кадр «перестройку проверить не удалось» перестал
    // быть ложью: две недели ожидания действительно были и действительно
    // кончились. Раньше он утверждал это на пустом месте, поэтому и был удалён.
    if (recomposition && recomposition.checkExpired) {
      return Object.assign(card, {
        frame: 'recomposition_unverified',
        actions: ['ok', 'ask_curator'],
        decidedBy: 'nobody',
        copy: {
          title: 'Отличить перестройку было нечем',
          body: 'Замера не было, а рост рабочих весов — довод косвенный. Две недели ожидания истекли — поправку применяем по весу.',
          footnote: 'Поправка — про расчёт, а не про старание. Замер в любой момент вернёт ветку перестройки.',
          actionLabels: { ok: 'Понятно', ask_curator: 'Написать куратору' }
        }
      });
    }

    // Кадра «перестройку проверить не удалось» без истёкшей заморозки нет: он
    // утверждает, что двухнедельная заморозка истекла, а заморозки в проекте
    // пока нет — метрики роста рабочих весов не существует. Но молчать тоже
    // нельзя: строка контракта «заморозка до косвенного довода» прямо
    // называет молчание дефектом. Поэтому поправка применяется по весу и
    // говорит об этом отдельной строкой на карточке.
    const evidenceNote = (recomposition && recomposition.noWaistEvidence)
      ? 'Замера не было — проверить перестройку было нечем'
      : null;

    // Рост система применяет сама и сообщает в тот же день. Кадр держится
    // неделю после применения: расчёт к этому моменту уже сошёлся, и без этой
    // ветки сообщение исчезло бы раньше, чем человек его увидел.
    if (raiseApplied) {
      return Object.assign(card, {
        frame: 'raised',
        decidedBy: 'system',
        needsConsent: false,
        actions: ['revert'],
        celebratory: true,
        // Возврат идёт к значению до роста, а не к действующему: действующее —
        // это и есть поднятое число.
        previousFactor: justRaised.previousFactor,
        copy: {
          title: 'Можно есть больше',
          body: 'Вы ели больше плана, а вес всё равно шёл вниз. Значит, тратите вы больше, чем мы считали, — норму подняли под ваш результат.',
          heroCaption: '+' + formatKcal(Math.abs(norms.deltaKcal)) + '\u00a0ккал',
          footnote: 'Такое бывает, когда дневник ведут честно: чем точнее записи, тем точнее норма.',
          actionLabels: { revert: 'Вернуть прежнюю норму' }
        }
      });
    }

    if (res.status !== 'ready' || res.direction === 'hold') {
      const streak = Number(matchedStreak) || 0;
      // Самый частый исход не должен занимать больше двух карточек.
      return Object.assign(card, {
        frame: 'matched',
        actions: ['ok'],
        decidedBy: 'nobody',
        // Этот исход человек видит каждую спокойную неделю, поэтому фраза
        // называет факт, а не хвалит: похвала, повторённая четыре недели,
        // обесценивает себя и вызывает вопрос, читает ли систему кто-нибудь.
        matchedStreak: streak,
        copy: {
          title: 'Расчёт сходится с фактом',
          body: streak > 1
            ? weekOrdinalRu(streak) + ' неделя подряд без правок: расхождение'
              + ' внутри ' + Math.round(DEAD_ZONE * 100) + ' %. Норма остаётся прежней.'
            : 'Вес двигался так, как рассчитывали. Норма остаётся прежней.',
          heroCaption: 'без изменений',
          actionLabels: { ok: 'Хорошо' }
        }
      });
    }

    // Рост система применяет сама и сообщает в тот же день — решение её,
    // уведомление человеку. Отменить можно одной кнопкой. На Pro это правило
    // уступает более сильному: у одного числа не бывает двух хозяев, поэтому
    // рост там тоже ждёт куратора и проходит ниже общей веткой.
    if (res.direction === 'up' && isSelf) {
      // Второе праздничное состояние набора — и единственное место, где о
      // дневнике говорят похвалой, а не упрёком.
      return Object.assign(card, {
        frame: 'raised',
        decidedBy: 'system',
        needsConsent: false,
        actions: ['revert'],
        celebratory: true,
        copy: {
          title: 'Можно есть больше',
          body: 'Вы ели больше плана, а вес всё равно шёл вниз. Значит, тратите вы больше, чем мы считали, — норму подняли под ваш результат.',
          heroCaption: '+' + formatKcal(Math.abs(norms.deltaKcal)) + '\u00a0ккал',
          footnote: 'Такое бывает, когда дневник ведут честно: чем точнее записи, тем точнее норма.',
          actionLabels: { revert: 'Вернуть прежнюю норму' }
        }
      });
    }

    // Снижение. На Pro решает куратор: клиент либо видит применённое, либо
    // читает предложение и ждёт — отменить решение куратора он не может, двух
    // хозяев у одного числа быть не должно.
    if (!isSelf) {
      return applied
        ? Object.assign(card, {
            frame: 'lowered',
            decidedBy: 'curator',
            actions: ['ok', 'ask_curator'],
            copy: {
              title: 'Норму подстроили под факт',
              // Причина — система, никогда человек.
              body: 'Вес и обхваты держатся на месте. Значит, наш расчёт расхода для вас завышен — мы поправили его, а не вас.',
              heroCaption: '\u2212' + formatKcal(Math.abs(norms.deltaKcal)) + '\u00a0ккал',
              evidenceNote,
              footnote: 'Решение куратора остаётся в силе — отменить его здесь нельзя, можно спросить, почему так.',
              actionLabels: { ok: 'Понятно', ask_curator: 'Написать куратору' }
            }
          })
        : Object.assign(card, {
            frame: 'pending_curator',
            decidedBy: 'curator',
            readOnly: true,
            // Герой — действующая норма, предложение вторым весом: иначе человек
            // начнёт есть на число, которое ещё не применено.
            hero: 'currentNorm',
            actions: ['ask_curator'],
            // В режиме чтения два числа расхождения — это не основание решения
            // клиента, а то, что смотрит куратор. Ярус называет их своим именем,
            // иначе список читается как «вот на чём вы решаете», а решать здесь
            // нечего.
            evidenceTitle: 'Что он смотрит',
            // В режиме чтения заголовок — ключ над числом, а не отдельная
            // мысль: «Ваша норма сегодня» называет число под собой, и шестнадцать
            // пикселей делали из подписи второй заголовок.
            titleAs: 'key',
            copy: {
              title: 'Ваша норма сегодня',
              body: 'Ешьте на это число. Поправку смотрит куратор — до его решения норма не меняется.',
              heroCaption: 'без изменений',
              proposalNote: formatKcal(norms.next) + ' \u00b7 пока не применено',
              footnote: 'Что решит куратор — придёт в недельной сверке: там будет причина и возможность спросить, если она непонятна.',
              actionLabels: { ask_curator: 'Спросить куратора' }
            }
          });
    }

    // Отказ не уходит в тишину. Человек нажал «Оставить прежнюю» — и должен
    // увидеть, что его услышали: без этого третий отказ подряд читается как
    // поломка расчёта, а не как его собственное решение. Кадр стоит выше
    // «третьего отказа»: это состояние «вы только что решили», а разговор про
    // серию — на следующей неделе, когда решать снова.
    if (lastDecision && lastDecision.what === 'declined') {
      return Object.assign(card, {
        frame: 'refusal_accepted',
        decidedBy: 'client',
        needsConsent: false,
        hero: 'currentNorm',
        actions: ['ok'],
        titleAs: null,
        facts: [
          { label: 'Норма дня', value: formatKcal(norms.current) + '\u00a0ккал' },
          { label: 'Поправка вернётся', value: 'в понедельник' },
          { label: 'Отказ учли', value: 'да' }
        ],
        copy: {
          title: 'Норма осталась прежней',
          body: 'Оставили ' + formatKcal(norms.current) + ' — так и будет.'
            + ' Поправка не исчезла: вернётся в понедельник с обновлёнными'
            + ' данными, и расхождение к тому времени может стать другим.',
          heroCaption: 'без изменений',
          footnote: 'Отказ — сигнал, а не ошибка. На Pro его видит куратор и'
            + ' спросит, что мешает; на Self после третьего раза мы покажем,'
            + ' сколько недель норма не менялась.',
          actionLabels: { ok: 'Понятно' }
        }
      });
    }

    // Self: снижение требует явного согласия клиента.
    if (streak >= REFUSAL_STREAK_LIMIT) {
      return Object.assign(card, {
        frame: 'refused_three_times',
        decidedBy: 'client',
        weeksUnchanged: Number(weeksUnchanged) || 0,
        mismatchPct: Math.abs(res.mismatchPct || 0),
        // Кнопки необязательные: плохо не то, что человек отказывается, а то,
        // что он не знает о расхождении.
        actions: ['apply', 'measure_waist', 'mute_month'],
        copy: {
          title: 'Норма не менялась ' + pluralWeeksRu(Number(weeksUnchanged) || 0),
          body: 'Вы трижды оставили прежнее число — это ваше право, и я его сохраняю. Но расчёт всё это время расходится с фактом, и вес стоит.',
          footnote: 'Ни одна из кнопок не обязательна. Плохо не то, что вы отказываетесь, — плохо, если вы не знаете, что расчёт разошёлся.',
          actionLabels: {
            apply: 'Применить поправку',
            measure_waist: 'Замерить талию',
            mute_month: 'Оставить как есть'
          }
        }
      });
    }

    return Object.assign(card, {
      frame: 'lowered_needs_consent',
      decidedBy: 'client',
      needsConsent: true,
      actions: ['apply_tomorrow', 'keep_current'],
      copy: {
        title: 'Расчёт разошёлся с фактом',
        body: 'По вашим записям и весам расход выходит ниже, чем считает формула. Снижение нормы — только с вашего согласия.',
        heroCaption: '\u2212' + formatKcal(Math.abs(norms.deltaKcal)) + '\u00a0ккал',
        evidenceNote,
        footnote: 'Без ответа норма не меняется. Рост нормы — наоборот: применяем сами и сразу сообщаем, отменить можно в один тап.',
        actionLabels: { apply_tomorrow: 'Применить с завтра', keep_current: 'Оставить прежнюю' }
      }
    });
  }

  /**
   * Была ли поправка применена в течение недели до сверки.
   *
   * Флаг в профиле хранит дату применения, а не «когда-либо трогали»: разница
   * важна на Pro, где кадр «норму подстроили» и кадр «на согласовании»
   * различаются ровно этим.
   */
  function appliedThisWeek(appliedAt, now) {
    if (!appliedAt) return false;
    const at = new Date(appliedAt);
    if (Number.isNaN(at.getTime())) return false;
    const base = now instanceof Date ? now : new Date();
    return (base - at) <= 7 * 24 * 60 * 60 * 1000;
  }

  /**
   * Чей это тариф — свой или кураторский.
   *
   * Признак Pro — наличие куратора, а не оплаченный план (решение владельца,
   * строка «признак Pro» зоны кабинета). Клиент без платежа не Self, а Pro с
   * неактивной подпиской: активность подписки красит срок, но право решения не
   * переносит. Прежняя редакция считала по плану — и на боевых данных давала
   * Self всем без исключения, потому что subscription_plan проставляется только
   * при оплате, а куратор есть у всех десяти клиентов.
   *
   * Неизвестность трактуем как Pro, и это не догадка, а выбор менее опасной
   * ошибки. Ошибиться в сторону Self — отдать клиенту кнопку на числе, которым
   * распоряжается куратор: ровно то, что запрещает «у одного числа один
   * хозяин». Ошибиться в сторону Pro — задержать решение до куратора.
   * Self выставляется только когда о клиенте положительно известно, что
   * куратора у него нет.
   */
  function resolveTariff(profile) {
    // План в решении не участвует вовсе: он говорит об оплате, а не о том,
    // кто распоряжается нормой.
    const prof = profile || {};
    if (prof.hasCurator === false) return 'self';
    // Назначенный куратор приезжает в профиль из get_client_data_by_session
    // (applyAssignedCuratorToProfile): положительный признак сильнее
    // умолчания.
    if (prof.curatorId || prof.curator_id || prof.hasCurator === true) return 'pro';
    return 'pro';
  }

  /**
   * Был ли рост применён на этой неделе — по истории решений, а не по флагу в
   * профиле: флаг знает только «когда», а нужно ещё «с какого значения».
   */
  function detectAppliedRaise(weeks, now) {
    const last = weeks && weeks[0];
    if (!last || last.what !== 'applied' || !last.at) return null;
    const base = now instanceof Date ? now : new Date();
    if ((base - new Date(last.at)) > 7 * 24 * 60 * 60 * 1000) return null;
    const previousFactor = weeks[1] ? Number(weeks[1].factor) : 1;
    if (!(Number(last.factor) > previousFactor)) return null;
    return { previousFactor };
  }

  const MONTHS_RU = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];

  /**
   * Прямой довод перестройки: вес стоит, а талия ушла.
   *
   * Довод обязан быть подтверждённым замером, и источник обязан ехать на
   * карточку — без него экран превращается в убедительное оправдание застоя,
   * то есть в машину опаснее, чем отсутствие поправки вовсе.
   *
   * Косвенный довод (замеров нет, но растут рабочие веса) здесь не считается:
   * метрики роста рабочих весов в проекте пока нет, и заявлять «две недели
   * заморозки истекли», не заводя саму заморозку, было бы неправдой. Пока
   * такого довода нет, поправка идёт по весу — это и есть третья ступень.
   */
  /**
   * Две линии одного графика: вес и талия.
   *
   * Обе величины в разных единицах, и нормировать каждую по своему размаху
   * нельзя — тогда вес, шатнувшийся на двести граммов, нарисуется таким же
   * склоном, как ушедшая талия, и график скажет ровно обратное тому, что
   * показывает. Поэтому обе приводятся к доле изменения от первой точки и
   * кладутся на общую шкалу: у чего изменение больше, у того и склон круче.
   *
   * Точки считает движок, а не рисующий: масштаб — это утверждение о данных.
   */
  function recompositionChart(rawDays) {
    // Вес дня лежит в `weightMorning` — то же поле, что читает тренд веса.
    const pick = (key) => rawDays
      .map((d, i) => ({
        i,
        v: Number(d && (key === 'weight'
          ? d.weightMorning
          : d.measurements && d.measurements.waist))
      }))
      .filter((p) => Number.isFinite(p.v) && p.v > 0);

    const weight = pick('weight');
    const waist = pick('waist');
    // Линия из одной точки — не линия. Нет второй величины — графика нет вовсе:
    // одна линия под подписью «вес и талия» была бы обманом.
    if (weight.length < 2 || waist.length < 2) return null;

    const span = rawDays.length - 1;
    if (span <= 0) return null;

    const rel = (points) => {
      const first = points[0].v;
      return points.map((p) => ({ x: p.i / span, d: first ? (p.v - first) / first : 0 }));
    };
    const rw = rel(weight);
    const rt = rel(waist);
    // Общий размах на обе линии: полосу занимает та, что изменилась сильнее,
    // а вторая ложится узкой лентой. Обе начинаются от нулевого изменения и
    // потому стартуют из одной точки по высоте — расхождение линий и есть то,
    // что показывает график.
    const all = rw.concat(rt).map((p) => p.d);
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const range = hi - lo;
    if (range < 1e-6) return null;
    // y = 0 внизу, 1 вверху.
    const place = (points) => points.map((p) => [
      Math.round(p.x * 1000) / 1000,
      Math.round(((p.d - lo) / range) * 1000) / 1000
    ]);

    const round1 = (v) => Math.round(v * 10) / 10;
    return {
      weight: place(rw),
      waist: place(rt),
      // Ось значений не рисуется: числа стоят подписями у последней точки.
      lastWeight: String(round1(weight[weight.length - 1].v)).replace('.', ',') + '\u00a0кг',
      lastWaist: String(round1(waist[waist.length - 1].v)).replace('.', ',') + '\u00a0см'
    };
  }

  function detectRecomposition(rawDays, profile, freeze) {
    const analyze = HEYS.InsightsPI?.patternModules?.analyzeHypertrophy;
    if (!rawDays || !rawDays.length) return null;

    // Дата последнего замера талии в окне — она же источник довода на карточке.
    let evidence = null;
    for (let i = rawDays.length - 1; i >= 0; i--) {
      if (rawDays[i]?.measurements?.waist) { evidence = rawDays[i].date; break; }
    }
    // Замера в окне нет — прямого довода нет. Но лестница доводов на этом не
    // кончается: вторая ступень — рост рабочих весов. Он слабее замера и
    // назван косвенным, потому что в первые месяцы это во многом нервная
    // адаптация: довод «тренировки продуктивны», а не «мышцы выросли».
    if (!evidence) {
      const weights = HEYS.WorkingWeights && HEYS.WorkingWeights.analyze;
      const growth = weights ? weights({ days: rawDays }) : null;
      if (growth && growth.available && growth.growing) {
        // Заморозка не может длиться вечно: через две недели после первой
        // просьбы о замере поправка применяется по весу, и тогда кадр
        // «проверить не удалось» перестаёт быть ложью — заморозка правда была
        // и правда истекла.
        const age = freezeAgeDays(freeze && freeze.askedAt, freeze && freeze.now);
        if (age != null && age >= FREEZE_LIMIT_DAYS) {
          return { checkExpired: true, weeks: growth.weeks, waitedDays: age };
        }
        return {
          indirect: true,
          weeks: growth.weeks,
          deltaPct: growth.deltaPct,
          daysLeft: age == null ? FREEZE_LIMIT_DAYS : Math.max(0, FREEZE_LIMIT_DAYS - age),
          source: 'по росту рабочих весов за ' + growth.weeks + ' ' + weeksWordRu(growth.weeks)
        };
      }
      // Ни замера, ни роста весов — третья ступень: поправка идёт по весу, и
      // говорит об этом вслух.
      return { noWaistEvidence: true };
    }

    if (!analyze) return { noWaistEvidence: false };

    let pattern;
    try {
      pattern = analyze(rawDays, profile);
    } catch (e) {
      return null;
    }
    if (!pattern || !pattern.available || pattern.compositionQuality !== 'recomposition') return null;

    // Конкретика важнее общей фразы: «талия ушла на 2 см» — это довод, а
    // «тело меняется» — утешение.
    const d = new Date(evidence);
    return {
      confirmed: true,
      dropCm: Math.round(Math.abs(pattern.waistTrend || 0) * rawDays.length * 10) / 10,
      weeks: Math.max(1, Math.round(rawDays.length / 7)),
      source: 'по замеру от ' + d.getDate() + '\u00a0' + MONTHS_RU[d.getMonth()],
      chart: recompositionChart(rawDays)
    };
  }

  /**
   * Собрать окно и посчитать карточку сверки от того, что лежит в хранилище.
   *
   * Поверхность не должна собирать окно сама: тогда понедельничная шторка,
   * кабинет куратора и попап цели разошлись бы в границах окна и округлении.
   * Здесь одна сборка на всех — сюда же приходят тариф и история решений.
   *
   * Окно кончается вчерашним днём: сегодняшний ещё пишется, и его неполнота
   * тянула бы средний съеденный вниз каждую неделю одинаково.
   */
  function gather({ lsGet, lsSet, profile, pIndex, now, tariff, weekLabel, readOnly }) {
    if (!lsGet) return null;
    // Чтение без последствий: разбор нормы у клиента открывается тапом по
    // числу, и собирать сверку оттуда обычным способом значило бы применять
    // поправку и ставить метку просьбы о замере по факту любопытства.
    const canWrite = !readOnly && typeof lsSet === 'function';

    const prof = profile || lsGet('heys_profile', {});
    const base = now instanceof Date ? new Date(now) : new Date();
    const windowDays = WINDOW_WORKING_DAYS;

    const days = [];
    const rawDays = [];
    let expenditureSum = 0;
    let expenditureDays = 0;
    let bmr = 0;
    let deficitPct = 0;

    for (let i = windowDays; i >= 1; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const day = lsGet('heys_dayv2_' + dateStr, null);
      if (!day) continue;

      const totals = HEYS.dayCalculations?.calculateDayTotals
        ? HEYS.dayCalculations.calculateDayTotals(day, pIndex)
        : (day.dayTot || null);
      const hasMeals = Array.isArray(day.meals) && day.meals.some((m) => (m.items || []).length > 0);

      days.push({
        dateStr,
        kcal: totals ? totals.kcal : 0,
        isLogged: hasMeals,
        isIncomplete: !!day.isIncomplete
      });
      rawDays.push(Object.assign({}, day, { date: dateStr }));

      // Формульный расход берём тем же движком, что и норма дня, и до
      // поправки: иначе поправка считалась бы от уже поправленного числа и
      // сходилась бы к единице сама на себе.
      const tdee = HEYS.TDEE?.calculate
        ? HEYS.TDEE.calculate(day, prof, { lsGet, pIndex })
        : null;
      if (tdee && tdee.baseExpenditure > 0) {
        expenditureSum += tdee.baseExpenditure;
        expenditureDays++;
        bmr = tdee.bmr || bmr;
        deficitPct = Number.isFinite(tdee.deficitPct) ? tdee.deficitPct : deficitPct;
      }
    }

    const formulaPerDay = expenditureDays ? expenditureSum / expenditureDays : 0;
    const trend = HEYS.Widgets?.WeightDynamicsV4?.trendForWindow
      ? HEYS.Widgets.WeightDynamicsV4.trendForWindow({ days: windowDays })
      : {};

    const historyDays = HEYS.DisciplineMatrix?.countHistoryDays
      ? HEYS.DisciplineMatrix.countHistoryDays(lsGet)
      : days.length;

    const result = compute({
      days,
      formulaPerDay,
      trend,
      currentFactor: Number.isFinite(prof.normCorrectionFactor) ? prof.normCorrectionFactor : 1,
      historyDays
    });

    // Сколько раз подряд человек оставил прежнее число и сколько недель норма
    // из-за этого стоит — читаем из истории решений, а не заводим счётчик:
    // счётчик разъехался бы с тем, что видно в кураторской карточке.
    const weeks = readHistory(lsGet);
    let refusalStreak = 0;
    for (const w of weeks) {
      if (w && w.what === 'declined') refusalStreak++;
      else break;
    }
    let weeksUnchanged = 0;
    for (const w of weeks) {
      if (w && w.what !== 'applied') weeksUnchanged++;
      else break;
    }
    // Серия спокойных недель. Без записи в историю её негде взять: при исходе
    // «сошлось» человек ничего не нажимает и куратор ничего не решает, а
    // строка «четвёртая неделя подряд» обязана на что-то опираться.
    let matchedStreak = 0;
    for (const w of weeks) {
      if (w && w.what === 'matched') matchedStreak++;
      else break;
    }

    // Косвенный довод замораживает норму, но заморозка отсчитывается от первой
    // просьбы о замере — значит эту просьбу надо поставить в тот же момент,
    // когда она впервые прозвучала, а не когда человек на неё ответит.
    const recomposition = detectRecomposition(rawDays, prof, {
      askedAt: readMeasurementAsk(lsGet),
      now: base
    });
    if (canWrite && recomposition && recomposition.indirect) {
      recordMeasurementAsk({ lsGet, lsSet, now: base.getTime() });
    }

    // Рост норма применяет сама: молча она не двигается — карточка сообщит об
    // этом в тот же день, — но и согласия на «можно есть больше» не просит.
    // На Pro норма принадлежит куратору: поднять её сами значило бы завести
    // у одного числа второго хозяина. Там любое изменение ждёт его решения.
    const activeTariff = tariff || resolveTariff(prof);
    let justRaised = detectAppliedRaise(weeks, base);
    if (!justRaised && activeTariff === 'self'
        && result.status === 'ready' && result.direction === 'up' && canWrite) {
      const previousFactor = result.currentFactor;
      lsSet('heys_profile', Object.assign({}, prof, {
        normCorrectionFactor: result.nextFactor,
        // Рост действует с сегодня: это не задним числом, а с того дня, когда
        // человеку об этом сказали.
        normCorrectionAppliedAt: base.toISOString().split('T')[0]
      }));
      recordDecision({
        lsGet, lsSet, weekLabel: weekLabel || base.toISOString().split('T')[0],
        factor: result.nextFactor, what: 'applied', now: base.getTime(),
        by: 'system'
      });
      justRaised = { previousFactor };
    }

    // Неделя закрылась совпадением — записываем это раз в неделю, как и
    // применённый рост. Иначе серия обнуляется при каждом заходе, а история
    // решений не отличает «сходилось» от «человек молчал».
    const matchedNow = result.status === 'ready' && result.direction === 'hold';
    const weekKey = weekLabel || base.toISOString().split('T')[0];
    if (canWrite && matchedNow && !(weeks[0] && weeks[0].weekLabel === weekKey)) {
      recordDecision({
        lsGet, lsSet, weekLabel: weekKey,
        factor: result.nextFactor, what: 'matched', now: base.getTime()
      });
      matchedStreak++;
    }

    // Решение этой недели — то, на что человек только что нажал; предыдущей —
    // то, чем кончилось прошлое предложение.
    const thisWeekDecision = (weeks[0] && weeks[0].weekLabel === weekKey) ? weeks[0] : null;
    const prevWeekDecision = weeks.find((w) => w && w.weekLabel !== weekKey) || null;

    const card = buildWeeklySyncCard({
      result,
      lastDecision: thisWeekDecision,
      previousDecision: prevWeekDecision,
      justRaised,
      matchedStreak,
      recomposition: recomposition,
      tariff: activeTariff,
      // «Применено» — про эту неделю, а не про то, что поправку когда-то
      // трогали. Иначе клиент, которому куратор поправил норму месяц назад,
      // читал бы новое предложение как уже принятое решение.
      applied: appliedThisWeek(prof.normCorrectionAppliedAt, base),
      refusalStreak,
      weeksUnchanged,
      expenditure: formulaPerDay,
      deficitPct,
      basalMetabolism: bmr
    });

    return { result, card, weeks, lsSet };
  }

  // Молчание считается по последнему дню с записью, а не по последнему заходу:
  // человек может открывать приложение и ничего не вносить.
  const SILENT_DAYS_ALERT = 3;

  // Старшинство состояний строки — из контракта кабинета. Клиент стоит в одной
  // группе, той, где его состояние старше: иначе счёт групп перестаёт
  // складываться в число клиентов.
  //
  // Молчание стоит выше расхождения: молчащий клиент рискует уйти совсем, а
  // расхождение расчёта ждёт до понедельника и само не портится. Человек
  // важнее числа — решение владельца, 30 августа.
  // «В коридоре» — своё состояние, а не «всё ровно»: расчёт у такого клиента
  // сошёлся не сам собой, а попал в зону, и куратор должен видеть это числом.
  // В «всё ровно» строка была бы свёрнута и клиент пропал бы с глаз.
  const PANEL_STATES = ['awaits', 'decided_today', 'silent', 'mismatch',
    'in_corridor', 'collecting', 'fine'];

  /**
   * Дни с последнего понедельника — возраст пересчёта поправки.
   *
   * Пилюля справа в строке всегда значит длительность состояния и никогда
   * важность. У «ждут решения» это дни с последнего пересчёта: предложение не
   * хранится, поэтому «дни с первого расчёта» мерить нечем, и мы не пытаемся —
   * иначе пришлось бы хранить предложение и спорить с его собственной строкой.
   */
  function daysSinceMonday(now) {
    const base = now instanceof Date ? now : new Date();
    // getDay(): воскресенье 0, понедельник 1. Понедельник даёт 0 дней.
    return (base.getDay() + 6) % 7;
  }

  // «Решено сегодня» живёт до конца дня: убрать строку сразу — оставить
  // сомнение, нажалось ли; держать до понедельника — оставить строку, по
  // которой делать нечего.
  function decidedToday(atMs, now) {
    if (!atMs) return false;
    const at = new Date(Number(atMs));
    if (Number.isNaN(at.getTime())) return false;
    return at.toDateString() === now.toDateString();
  }

  /**
   * Синтетический день для движка расхода из строки серверного окна.
   *
   * Окно отдаёт минуты по зонам, сложенные по всем тренировкам дня. Расход
   * тренировки линеен по минутам внутри зоны, поэтому одна тренировка с этими
   * суммами даёт ровно тот же расход, что и поштучный проход, — а числа у
   * куратора и у клиента обязаны совпадать.
   */
  function dayFromWindowRow(row) {
    const zones = Array.isArray(row.zone_min) ? row.zone_min.map((m) => Number(m) || 0) : null;
    return {
      date: row.day_date,
      weightMorning: row.weight_morning == null ? null : Number(row.weight_morning),
      steps: Number(row.steps) || 0,
      householdMin: Number(row.household_min) || 0,
      trainings: zones && zones.some((m) => m > 0) ? [{ z: zones }] : [],
      isIncomplete: !!row.is_incomplete
    };
  }

  /**
   * Профиль клиента из строки контекста.
   *
   * Возраст сервер отдаёт и числом, и датой рождения, потому что в блобах они
   * расходятся — у живого клиента нашлось `age: 25` при дате рождения 1991
   * года. Правило выбора живёт в движке расхода, здесь мы только передаём оба.
   */
  function profileFromContextRow(row) {
    return {
      weight: row.weight == null ? null : Number(row.weight),
      height: row.height == null ? null : Number(row.height),
      age: row.age == null ? null : Number(row.age),
      birthDate: row.birth_date || '',
      gender: row.gender || '',
      deficitPctTarget: row.deficit_pct_target == null ? null : Number(row.deficit_pct_target),
      normCorrectionFactor: row.norm_correction_factor == null ? 1 : Number(row.norm_correction_factor),
      normCorrectionAppliedAt: row.norm_correction_applied_at || ''
    };
  }

  /**
   * Поправка по каждому клиенту куратора из серверного окна и профилей.
   *
   * Считает тот же движок и та же compute(), что у клиента: сервер отдаёт
   * сырьё, а не готовое число, — иначе у панели завёлся бы второй расчёт,
   * который разошёлся бы с первым молча.
   *
   * @param {object} input
   * @param {Array} input.windowRows строки get_curator_clients_window
   * @param {Array} input.contextRows строки get_curator_clients_norm_context
   * @param {Date} input.now точка отсчёта молчания
   */
  function buildPanelRows({ windowRows, contextRows, now }) {
    const base = now instanceof Date ? now : new Date();
    const byClient = new Map();

    for (const row of contextRows || []) {
      if (!row || !row.client_id) continue;
      byClient.set(row.client_id, {
        clientId: row.client_id,
        profile: profileFromContextRow(row),
        hrZones: Array.isArray(row.hr_zones) ? row.hr_zones : [],
        lastDecision: row.last_decision || null,
        lastDecisionWeek: row.last_decision_week || null,
        lastDecisionAt: row.last_decision_at || null,
        days: []
      });
    }

    for (const row of windowRows || []) {
      const entry = byClient.get(row && row.client_id);
      if (entry) entry.days.push(row);
    }

    const out = [];
    for (const entry of byClient.values()) {
      entry.days.sort((a, b) => String(a.day_date).localeCompare(String(b.day_date)));

      // Молчание: сколько дней подряд с конца окна нет ни одной записи.
      let silentDays = 0;
      for (let i = entry.days.length - 1; i >= 0; i--) {
        if (entry.days[i].has_day) break;
        silentDays++;
      }

      // Сторона съеденного и сторона расхода — по тем же правилам, что в
      // gather(): неполные дни исключаются, расход берётся до поправки.
      const days = [];
      let expSum = 0;
      let expDays = 0;
      let bmr = 0;
      let deficitPct = 0;
      const parts = { bmr: 0, trainings: 0, steps: 0, household: 0 };
      for (const row of entry.days) {
        if (!row.has_day) continue;
        days.push({
          dateStr: row.day_date,
          kcal: Number(row.kcal) || 0,
          isLogged: (Number(row.meals_count) || 0) > 0,
          isIncomplete: !!row.is_incomplete
        });
        const tdee = HEYS.TDEE?.calculate
          ? HEYS.TDEE.calculate(dayFromWindowRow(row), entry.profile, {
            includeNDTE: false,
            hrZones: entry.hrZones,
            lsGet: () => null
          })
          : null;
        if (tdee && tdee.baseExpenditure > 0) {
          expSum += tdee.baseExpenditure;
          expDays++;
          bmr = tdee.bmr || bmr;
          deficitPct = Number.isFinite(tdee.deficitPct) ? tdee.deficitPct : deficitPct;
          // Слагаемые расхода копим тем же проходом: baseExpenditure это в
          // точности их сумма (bmr + тренировки + шаги + быт), поэтому доли
          // сходятся в сто процентов без подгонки.
          parts.bmr += tdee.bmr || 0;
          parts.trainings += tdee.trainingsKcal || 0;
          parts.steps += tdee.stepsKcal || 0;
          parts.household += tdee.householdKcal || 0;
        }
      }

      // Тренд веса — тот же канонический алгоритм, что у клиента, только ряд
      // приходит с сервера: у куратора клиентского хранилища нет. Считать тут
      // «первая точка минус последняя» значило бы завести второй тренд —
      // сглаживание и интерполяция дыр остались бы только у клиента, и числа
      // разошлись бы при одинаковых данных.
      const series = entry.days.map((r) => ({
        date: r.day_date,
        weight: (r.weight_measured && r.weight_morning != null) ? Number(r.weight_morning) : null,
        hasWeight: !!(r.weight_measured && r.weight_morning != null)
      }));
      const trend = HEYS.Widgets?.WeightDynamicsV4?.trendForSeries
        ? HEYS.Widgets.WeightDynamicsV4.trendForSeries(series, entry.days.length)
        : { windowDays: entry.days.length, measuredDays: 0, deltaKg: null };

      const result = compute({
        days,
        formulaPerDay: expDays ? expSum / expDays : 0,
        trend,
        currentFactor: entry.profile.normCorrectionFactor,
        // Дней ведения у куратора столько, сколько видно в окне: более длинной
        // истории сервер не отдаёт, и занижать её честнее, чем выдумывать.
        historyDays: days.length
      });

      const isSilent = silentDays >= SILENT_DAYS_ALERT;
      // Внутри мёртвой зоны расхождения нет: норма стоит по решению движка, и
      // выводить клиента в «расчёт разошёлся» значило бы звать куратора туда,
      // где делать нечего.
      const mismatchPct = (Number.isFinite(result.mismatchPct) && !result.deadZone)
        ? Math.abs(result.mismatchPct)
        : null;
      const answeredToday = decidedToday(entry.lastDecisionAt, base);
      const hasProposal = result.status === 'ready' && result.direction !== 'hold';
      // Окно ещё не набралось — это рабочее состояние первых трёх недель, а не
      // ошибка, и своё слово у него отдельное.
      const collecting = result.status === 'cold_start' || result.status === 'not_enough_data';

      // Расчёт попал в мёртвую зону — состояние своё: цифры в порядке, но
      // сказать это надо числом, а не молчанием.
      const inCorridor = result.status === 'ready' && !!result.deadZone;

      let state;
      if (hasProposal && !entry.lastDecision) state = 'awaits';
      else if (answeredToday) state = 'decided_today';
      else if (isSilent) state = 'silent';
      else if (mismatchPct) state = 'mismatch';
      else if (inCorridor) state = 'in_corridor';
      else if (collecting) state = 'collecting';
      else state = 'fine';

      // Второе состояние дописывается фразой в той же строке, а не второй
      // пилюлей: две пилюли читаются как две группы.
      let alsoNote = null;
      if (state !== 'silent' && isSilent) {
        alsoNote = 'не пишет ' + silentDays + ' ' + pluralDaysRu(silentDays);
      } else if (state === 'silent' && mismatchPct) {
        alsoNote = 'и расчёт разошёлся';
      }

      // Длительность состояния — своя у каждой группы, но смысл один.
      // Коридор меряется тем же, чем расхождение, — длиной окна расчёта:
      // строка контракта «группа "В коридоре"» ставит справа «21 дн». Без
      // этого числа «разница 2 %» не говорит, за какой срок она набрана.
      const ageDays = state === 'silent' ? silentDays
        : (state === 'mismatch' || state === 'in_corridor')
          ? (result.windowDays || entry.days.length)
          : state === 'awaits' ? daysSinceMonday(base)
            : null;

      out.push({
        clientId: entry.clientId,
        state,
        ageDays,
        alsoNote,
        silentDays,
        isSilent,
        result,
        collecting,
        inCorridor,
        driftPct: Number.isFinite(result.driftPct) ? result.driftPct : null,
        // «Ждёт решения» — расчёт готов, а последнего решения по нему нет.
        awaitsDecision: state === 'awaits',
        mismatchPct,
        card: buildCuratorCard({
          result,
          expenditure: expDays ? expSum / expDays : 0,
          deficitPct,
          basalMetabolism: bmr,
          breakdown: expDays ? {
            bmr: parts.bmr / expDays,
            trainings: parts.trainings / expDays,
            steps: parts.steps / expDays,
            household: parts.household / expDays
          } : null,
          history: []
        })
      });
    }

    // Порядок панели — кем заняться. Ручной сортировки и алфавита нет: с ними
    // панель становится вторым списком людей, а он уже есть во вкладке
    // «Клиенты».
    //
    // Внутри группы контракт просит «по давности, старое выше». Для молчания
    // давность есть — дни без записей. Для «ждёт решения» её нет и взяться
    // неоткуда: предложение не хранится, оно пересчитывается заново каждый
    // раз. Поэтому там сортируем по величине расхождения и не выдаём это за
    // давность.
    out.sort((a, b) => (
      PANEL_STATES.indexOf(a.state) - PANEL_STATES.indexOf(b.state)
      || b.silentDays - a.silentDays
      || (b.mismatchPct || 0) - (a.mismatchPct || 0)
    ));
    return out;
  }

  HEYS.NormCorrection = {
    REFUSAL_STREAK_LIMIT,
    SILENT_DAYS_ALERT,
    PANEL_STATES,
    daysSinceMonday,
    buildPanelRows,
    dayFromWindowRow,
    profileFromContextRow,
    buildWeeklySyncCard,
    gather,
    detectRecomposition,
    detectAppliedRaise,
    FREEZE_LIMIT_DAYS,
    readMeasurementAsk,
    recordMeasurementAsk,
    freezeAgeDays,
    resolveTariff,
    formatKcal,
    HISTORY_KEY,
    HISTORY_MAX,
    readHistory,
    recordDecision,
    KCAL_PER_KG,
    EVIDENCE,
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
