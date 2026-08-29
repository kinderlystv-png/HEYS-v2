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
    frozen: 'заморозил',
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

  // История решений живёт своим ключом, а не в профиле: она растёт, а профиль
  // читается на каждом расчёте нормы. Ключ client-scoped — иначе при
  // кураторском входе история одного клиента протекла бы другому (девятый
  // архитектурный инвариант проекта).
  const HISTORY_KEY = 'heys_norm_correction_history';
  const HISTORY_MAX = 12;

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
  function recordDecision({ lsGet, lsSet, weekLabel, factor, what, now }) {
    const weeks = readHistory(lsGet).filter((w) => w && w.weekLabel !== weekLabel);
    weeks.unshift({
      weekLabel,
      factor: Number(factor),
      what,
      at: now || null
    });
    if (lsSet) {
      lsSet(HISTORY_KEY, { weeks: weeks.slice(0, HISTORY_MAX), updatedAt: now || 0 });
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
  function pluralWeeksRu(n) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return n + ' недель';
    if (last > 1 && last < 5) return n + ' недели';
    if (last === 1) return n + ' неделю';
    return n + ' недель';
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
    result, tariff, applied, refusalStreak, weeksUnchanged, recomposition,
    justRaised, expenditure, deficitPct, basalMetabolism
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
      safeguards: [
        'Шаг за неделю не больше 3 %',
        'Ниже базового обмена не опускаем',
        'Отменить можно в любой момент'
      ]
    };

    // Вес стоит, но тело меняется — норму не трогаем. Кадр появляется только
    // при подтверждённом доводе, иначе он превращается в оправдание застоя.
    if (recomposition && recomposition.confirmed) {
      return Object.assign(card, {
        frame: 'recomposition',
        evidence: recomposition.source,
        actions: ['ok'],
        decidedBy: 'nobody',
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
    // Кадра «перестройку проверить не удалось» здесь нет намеренно: он
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
      // Самый частый исход не должен занимать больше двух карточек.
      return Object.assign(card, {
        frame: 'matched',
        actions: ['ok'],
        decidedBy: 'nobody',
        copy: {
          title: 'Шли как договаривались',
          body: 'Вес двигался так, как мы и рассчитывали. Норма остаётся прежней.',
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
      // Единственное праздничное состояние — и единственное место, где о
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
  function detectRecomposition(rawDays, profile) {
    const analyze = HEYS.InsightsPI?.patternModules?.analyzeHypertrophy;
    if (!rawDays || !rawDays.length) return null;

    // Дата последнего замера талии в окне — она же источник довода на карточке.
    let evidence = null;
    for (let i = rawDays.length - 1; i >= 0; i--) {
      if (rawDays[i]?.measurements?.waist) { evidence = rawDays[i].date; break; }
    }
    // Замера в окне нет — довода нет, и это надо сказать вслух, а не молча
    // применить поправку по весу.
    if (!evidence) return { noWaistEvidence: true };

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
      source: 'по замеру от ' + d.getDate() + '\u00a0' + MONTHS_RU[d.getMonth()]
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
  function gather({ lsGet, lsSet, profile, pIndex, now, tariff, weekLabel }) {
    if (!lsGet) return null;

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

    // Рост норма применяет сама: молча она не двигается — карточка сообщит об
    // этом в тот же день, — но и согласия на «можно есть больше» не просит.
    // На Pro норма принадлежит куратору: поднять её сами значило бы завести
    // у одного числа второго хозяина. Там любое изменение ждёт его решения.
    const activeTariff = tariff || resolveTariff(prof);
    let justRaised = detectAppliedRaise(weeks, base);
    if (!justRaised && activeTariff === 'self'
        && result.status === 'ready' && result.direction === 'up' && lsSet) {
      const previousFactor = result.currentFactor;
      lsSet('heys_profile', Object.assign({}, prof, {
        normCorrectionFactor: result.nextFactor,
        // Рост действует с сегодня: это не задним числом, а с того дня, когда
        // человеку об этом сказали.
        normCorrectionAppliedAt: base.toISOString().split('T')[0]
      }));
      recordDecision({
        lsGet, lsSet, weekLabel: weekLabel || base.toISOString().split('T')[0],
        factor: result.nextFactor, what: 'applied', now: base.getTime()
      });
      justRaised = { previousFactor };
    }

    const card = buildWeeklySyncCard({
      result,
      justRaised,
      recomposition: detectRecomposition(rawDays, prof),
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
  const PANEL_STATES = ['awaits', 'decided_today', 'silent', 'mismatch', 'collecting', 'fine'];

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
      const mismatchPct = Number.isFinite(result.mismatchPct) ? Math.abs(result.mismatchPct) : null;
      const answeredToday = decidedToday(entry.lastDecisionAt, base);
      const hasProposal = result.status === 'ready' && result.direction !== 'hold';
      // Окно ещё не набралось — это рабочее состояние первых трёх недель, а не
      // ошибка, и своё слово у него отдельное.
      const collecting = result.status === 'cold_start' || result.status === 'not_enough_data';

      let state;
      if (hasProposal && !entry.lastDecision) state = 'awaits';
      else if (answeredToday) state = 'decided_today';
      else if (isSilent) state = 'silent';
      else if (mismatchPct) state = 'mismatch';
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
      const ageDays = state === 'silent' ? silentDays
        : state === 'mismatch' ? (result.windowDays || entry.days.length)
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
        // «Ждёт решения» — расчёт готов, а последнего решения по нему нет.
        awaitsDecision: state === 'awaits',
        mismatchPct,
        card: buildCuratorCard({
          result,
          expenditure: expDays ? expSum / expDays : 0,
          deficitPct,
          basalMetabolism: bmr,
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
    resolveTariff,
    formatKcal,
    HISTORY_KEY,
    HISTORY_MAX,
    readHistory,
    recordDecision,
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
