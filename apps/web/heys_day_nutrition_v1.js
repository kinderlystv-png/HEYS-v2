// heys_day_nutrition_v1.js — вкладка «Питание» v4.
//
// Единственный владелец содержимого вкладки: порядок блоков задан строкой
// контракта «порядок блоков» канваса nutrition-tab.v4.dc.html. Ярусов
// «Сейчас / Дневник / Разбор дня» больше нет — блоки разделены воздухом и
// своими подписями. Вода — сразу после «Итогов дня», затем «Качество еды» и
// чип-зависимые блоки; page shell рендерит diarySection после карточки.

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  const NBSP = ' ';
  const DASH = '—';
  const NO_DATA_LABEL = 'нет данных';
  const HARM_THRESHOLD = 5;
  const MACRO_WARN_PCT = 110;
  const MACRO_RED_PCT = 130;
  const LAG_OK_PCT = 8;
  const LAG_WARN_PCT = 25;
  const DEFAULT_WAKE_MIN = 8 * 60;
  const DEFAULT_EAT_END_MIN = 21 * 60;
  const EATING_END_BEFORE_BED_MIN = 3 * 60;

  const SUPP_GROUP_ORDER = ['morning', 'withMeal', 'evening', 'anytime'];
  const SUPP_GROUP_LABELS = {
    morning: 'Утро',
    withMeal: 'С едой',
    evening: 'Вечер',
    anytime: 'По случаю'
  };
  const SUPP_TIMING_TO_GROUP = {
    morning: 'morning',
    empty: 'morning',
    withFood: 'withMeal',
    withFat: 'withMeal',
    beforeMeal: 'withMeal',
    evening: 'evening',
    beforeBed: 'evening',
    anytime: 'anytime',
    afterTrain: 'anytime'
  };
  const SUPP_VISIBLE_LIMIT = 6;

  // Повторный тап · правило продукта (nutrition-tab.v4.dc.html, строка
  // «повторный тап и поворот»): 350 мс защиты на чипах добавок, пилюле
  // группы и «Всё сразу» — второе нажатие внутри окна не создаёт лишнюю
  // отметку. На чипах блоков вкладки такой защиты нет (второй тап выключает
  // блок), поэтому этот guard применяется только внутри SupplementsBlockV4.
  const REPEAT_TAP_GUARD_MS = 350;
  const repeatTapGuardMap = new Map();
  function passRepeatTapGuard(key) {
    const now = Date.now();
    const last = repeatTapGuardMap.get(key) || 0;
    if (now - last < REPEAT_TAP_GUARD_MS) return false;
    repeatTapGuardMap.set(key, now);
    return true;
  }

  // === Числа и форматы ===============================================

  function isNum(value) {
    if (value === null || value === undefined || value === '') return false;
    return Number.isFinite(Number(value));
  }

  function dashNode(React, className) {
    return React.createElement('span', className ? { className } : null,
      React.createElement('span', { 'aria-hidden': 'true' }, DASH),
      React.createElement('span', { className: 'nutrition-v4-sr-only' }, NO_DATA_LABEL)
    );
  }

  function formatProductCountLabel(count) {
    const n = Math.max(0, Number(count) || 0);
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'продукт'
      : (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'продукта' : 'продуктов');
    return n + ' ' + word;
  }

  function buildHeroAriaLabel(hero) {
    if (!hero) return '';
    const valueText = hero.value === DASH ? NO_DATA_LABEL : hero.value + ' ккал';
    if (hero.label === 'Съедено за день') return 'съедено ' + valueText;
    if (hero.label === 'Перебор') return 'перебор ' + valueText;
    const zoneWord = hero.zone === 'red'
      ? 'перебор'
      : hero.zone === 'warn'
        ? 'выше нормы'
        : hero.value === DASH
          ? NO_DATA_LABEL
          : 'в коридоре';
    if (hero.label === 'Осталось на сегодня' && hero.value !== DASH) {
      return 'осталось ' + hero.value + ' ккал, ' + zoneWord;
    }
    return hero.label.toLowerCase() + ' ' + valueText;
  }

  function buildMealRowAriaLabel(time, title, isEmpty, kcalText, productCount) {
    const kcalPart = isEmpty ? NO_DATA_LABEL : kcalText + ' ккал';
    return time + ', ' + title + ', ' + kcalPart + ', ' + formatProductCountLabel(productCount);
  }

  function chipAriaLabel(label, enabled) {
    return label + ', ' + (enabled ? 'включено' : 'выключено');
  }

  // Разделитель тысяч — неразрывный пробел, один на весь экран (контракт
  // «формат чисел»): раньше герой печатал 1873, а строка ниже 1 873.
  function formatNumber(value) {
    if (!isNum(value)) return DASH;
    return Math.round(Number(value)).toLocaleString('ru-RU').replace(/\s/g, NBSP);
  }

  function formatDecimal(value, digits) {
    if (!isNum(value)) return DASH;
    return Number(value).toFixed(digits == null ? 1 : digits).replace('.', ',');
  }

  function formatPercent(value) {
    if (!isNum(value)) return DASH;
    return Math.round(Number(value)) + NBSP + '%';
  }

  function timeToMinutes(time) {
    if (!time || typeof time !== 'string') return null;
    const m = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function formatShortDate(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
    if (!match) return String(dateKey || '');
    const dateValue = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(dateValue.getTime())) return String(dateKey || '');
    const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(dateValue).replace(/\.$/, '');
    const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(dateValue).replace(/\.$/, '');
    return weekday + ', ' + dayMonth;
  }

  function countFilledMeals(day) {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    return meals.filter((meal) => Array.isArray(meal?.items) && meal.items.length > 0).length;
  }

  function formatMealCountLabel(count) {
    const n = Number(count) || 0;
    const mod10 = n % 10;
    const mod100 = n % 100;
    let word = 'приёмов';
    if (mod10 === 1 && mod100 !== 11) word = 'приём';
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'приёма';
    return n + ' ' + word;
  }

  // Метки «синхронизировано» на экране нет (контракт «мета-строка шапки»):
  // её отсутствие значило и «нет сети», и «не успело». Состояние синхронизации
  // живёт в жесте обновления.
  function formatTabMetaLine(dateKey, day) {
    const count = countFilledMeals(day);
    const datePart = formatShortDate(dateKey || day?.date);
    const text = count > 0 ? datePart + ' · ' + formatMealCountLabel(count) : datePart;
    return { text, syncLabel: null };
  }

  // Кадр пишет длительность волны часами с запятой — «волна 4,5 ч», а не «4:30»:
  // здесь это оценка, а не точное время.
  function formatWaveHours(totalMinutes) {
    const hours = Math.max(0, Number(totalMinutes) || 0) / 60;
    return String(Math.round(hours * 10) / 10).replace('.', ',') + ' ч';
  }

  function formatDurationShort(totalMinutes) {
    const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return h + ':' + String(m).padStart(2, '0');
    return String(m) + ' мин';
  }

  function formatClockFromNow(minutesAhead) {
    const mins = Math.max(0, Math.round(Number(minutesAhead) || 0));
    const now = new Date();
    const target = new Date(now.getTime() + mins * 60000);
    return String(target.getHours()).padStart(2, '0') + ':' + String(target.getMinutes()).padStart(2, '0');
  }

  function formatMinutesClock(minutes) {
    const mins = Math.max(0, Math.round(Number(minutes) || 0)) % 1440;
    return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  }

  // === Продукты и приёмы =============================================

  function mealTotals(meal, pIndex) {
    if (HEYS.models?.mealTotals) return HEYS.models.mealTotals(meal, pIndex) || {};
    return {};
  }

  function productName(item, pIndex) {
    if (!item) return '';
    const id = String(item.product_id || item.id || '').toLowerCase();
    const fromIndex = pIndex?.byId?.get?.(id);
    if (fromIndex?.name) return fromIndex.name;
    if (item.name) return item.name;
    return 'продукт';
  }

  function mealItemSummary(meal, pIndex, maxNames) {
    const items = Array.isArray(meal?.items) ? meal.items : [];
    if (!items.length) return 'без продуктов · итог дня посчитан без него';
    const names = items.map((item) => productName(item, pIndex)).filter(Boolean);
    const limit = maxNames || 3;
    if (names.length <= limit) return names.join(' · ');
    return names.slice(0, limit).join(' · ') + ' · ещё ' + (names.length - limit);
  }

  // Название приёма фиксируется только явным касанием чипа типа в шторке
  // (контракт «название приёма»). Автоподстановка по времени фиксацией не
  // считается: у приёмов без флага остаётся прежняя динамика, иначе первый
  // приём дня навсегда становился «Завтраком».
  function mealTypeLabel(meal) {
    const localize = HEYS.dayUtils?.localizeMealName;
    const localized = (raw) => (typeof localize === 'function' ? localize(raw, 'Приём') : (raw || 'Приём'));
    if (meal?.mealTypePinned && (meal.name || meal.mealType)) {
      return localized(meal.name || meal.mealType);
    }
    const info = HEYS.getMealType?.(meal);
    return localized(info?.name || info?.label || meal?.name || info?.type);
  }

  function sortMealsAscending(meals) {
    const list = Array.isArray(meals) ? meals.slice() : [];
    return list.sort((a, b) => {
      const ta = timeToMinutes(a?.time);
      const tb = timeToMinutes(b?.time);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb;
    });
  }

  function findMealIndexInDay(dayData, meal) {
    const meals = Array.isArray(dayData?.meals) ? dayData.meals : [];
    if (meal?.id) {
      const byId = meals.findIndex((entry) => entry && entry.id === meal.id);
      if (byId >= 0) return byId;
    }
    return meals.indexOf(meal);
  }

  // === Зоны перебора =================================================

  // Пороги 110 и 130 — дефолты; куратор правит их зонами ratio, и только для
  // калорий (контракт «зоны у макросов»).
  function kcalZoneThresholds() {
    const fallback = { warn: MACRO_WARN_PCT, red: MACRO_RED_PCT };
    try {
      const zones = HEYS.ratioZones?.getZones?.();
      if (!Array.isArray(zones)) return fallback;
      const over = zones.find((zone) => zone?.id === 'over');
      const binge = zones.find((zone) => zone?.id === 'binge');
      return {
        warn: isNum(over?.from) ? Number(over.from) * 100 : fallback.warn,
        red: isNum(binge?.from) ? Number(binge.from) * 100 : fallback.red
      };
    } catch (_) {
      return fallback;
    }
  }

  function zoneOf(pct, thresholds) {
    const t = thresholds || { warn: MACRO_WARN_PCT, red: MACRO_RED_PCT };
    if (!isNum(pct) || pct <= 100) return 'none';
    if (pct >= t.red) return 'red';
    if (pct >= t.warn) return 'warn';
    return 'over';
  }

  // === Герой =========================================================

  function buildHeroState(params) {
    const { eatenKcal, budgetKcal, hasData, isPastDay } = params || {};
    const budget = Math.round(Number(budgetKcal) || 0);
    const eaten = Math.round(Number(eatenKcal) || 0);
    const pct = budget > 0 ? (eaten / budget) * 100 : null;
    const thresholds = kcalZoneThresholds();

    if (!hasData) {
      return {
        label: isPastDay ? 'Съедено за день' : 'Осталось на сегодня',
        value: isPastDay ? DASH : formatNumber(budget),
        zone: 'none',
        fillPct: 0,
        overPct: 0,
        left: isPastDay ? 'из ' + formatNumber(budget) : 'съедено ' + DASH,
        right: isPastDay ? 'не съедено ' + DASH : 'бюджет ' + formatNumber(budget),
        rightZone: 'none'
      };
    }

    // Закрытый день: факт, «из M» и «не съедено N». Порогов «к этому часу» нет.
    if (isPastDay) {
      return {
        label: 'Съедено за день',
        value: formatNumber(eaten),
        zone: zoneOf(pct, thresholds),
        fillPct: budget > 0 ? Math.min(100, (eaten / budget) * 100) : 0,
        overPct: 0,
        left: 'из ' + formatNumber(budget),
        right: eaten >= budget
          ? 'перебор ' + formatNumber(eaten - budget)
          : 'не съедено ' + formatNumber(budget - eaten),
        rightZone: 'none'
      };
    }

    if (pct != null && pct > 100) {
      // Полоса делится внутри дорожки: бюджет и то, что сверх него.
      const overShare = eaten > 0 ? ((eaten - budget) / eaten) * 100 : 0;
      const zone = zoneOf(pct, thresholds);
      return {
        label: 'Перебор',
        value: formatNumber(eaten - budget),
        zone,
        fillPct: 100 - overShare,
        overPct: overShare,
        left: 'съедено ' + formatNumber(eaten),
        right: formatPercent(pct),
        rightZone: zone
      };
    }

    return {
      label: 'Осталось на сегодня',
      value: formatNumber(Math.max(0, budget - eaten)),
      zone: 'none',
      fillPct: budget > 0 ? Math.max(0, Math.min(100, (eaten / budget) * 100)) : 0,
      overPct: 0,
      left: 'съедено ' + formatNumber(eaten),
      right: 'бюджет ' + formatNumber(budget),
      rightZone: 'none'
    };
  }

  // === Окно приёмов ==================================================

  // Нахлёст волн старше остальных состояний: пока он есть, строка показывает
  // его, даже если окно открыто (контракт «приоритет состояний»).
  function buildWindowState(insulinWaveData) {
    const overlapMinutes = Number(insulinWaveData?.worstOverlap?.overlapMinutes) || 0;
    if (insulinWaveData?.hasOverlaps && overlapMinutes > 0) {
      return { tone: 'warn', lines: ['волны наложились', 'нахлёст ' + formatDurationShort(overlapMinutes)] };
    }
    if (insulinWaveData?.isPastDay) return { tone: 'calm', lines: ['день закрыт'] };
    if (!insulinWaveData) return { tone: 'calm', lines: ['добавьте приём', 'для расчёта'] };
    if (insulinWaveData.isOvernightEstimate) return { tone: 'calm', lines: ['оценка по вчерашнему дню'] };

    const rangeStatus = insulinWaveData.rangeStatus || insulinWaveData.status;
    if (rangeStatus === 'scheduled') return { tone: 'calm', lines: ['приём ещё впереди'] };
    if (rangeStatus === 'complete') return { tone: 'ok', lines: ['окно открыто'] };

    const remaining = Number(insulinWaveData.rangeRemaining ?? insulinWaveData.remaining);
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return { tone: 'calm', lines: ['следите по голоду'] };
    }
    return {
      tone: remaining > 60 ? 'ok' : 'calm',
      lines: ['закроется в ' + formatClockFromNow(remaining), 'через ' + formatDurationShort(remaining)]
    };
  }

  // === Итоги дня =====================================================

  const TOTAL_ROWS = [
    { key: 'kcal', label: 'Калории', unit: 'ккал' },
    { key: 'prot', label: 'Белок', unit: 'г' },
    { key: 'fat', label: 'Жиры', unit: 'г' },
    { key: 'carbs', label: 'Углеводы', unit: 'г' },
    { key: 'fiber', label: 'Клетчатка', unit: 'г' }
  ];

  function resolveEatingWindow(day) {
    const wake = timeToMinutes(day?.sleepEnd || day?.wakeTime || day?.wokeAt);
    const bed = timeToMinutes(day?.sleepStart || day?.bedTime || day?.asleepAt);
    const wakeMinutes = wake == null ? DEFAULT_WAKE_MIN : wake;
    let eatEndMinutes = DEFAULT_EAT_END_MIN;
    if (bed != null) {
      eatEndMinutes = bed - EATING_END_BEFORE_BED_MIN;
      if (eatEndMinutes <= wakeMinutes) eatEndMinutes = DEFAULT_EAT_END_MIN;
    }
    return { wakeMinutes, eatEndMinutes };
  }

  function eatingProgressK(day, isPastDay, nowMinutes) {
    if (isPastDay) return 1;
    const { wakeMinutes, eatEndMinutes } = resolveEatingWindow(day);
    const span = Math.max(1, eatEndMinutes - wakeMinutes);
    const current = Number.isFinite(nowMinutes)
      ? nowMinutes
      : (new Date().getHours() * 60 + new Date().getMinutes());
    return Math.min(1, Math.max(0, (current - wakeMinutes) / span));
  }

  // Тревога воды: окно до отбоя минус 1 ч (контракт water-add / nutrition-tab).
  const WATER_ALARM_END_BEFORE_BED_MIN = 60;

  function waterAlarmProgressK(day, isPastDay, nowMinutes) {
    if (isPastDay) return 1;
    const wake = timeToMinutes(day?.sleepEnd || day?.wakeTime || day?.wokeAt);
    const bed = timeToMinutes(day?.sleepStart || day?.bedTime || day?.asleepAt);
    const wakeMinutes = wake == null ? DEFAULT_WAKE_MIN : wake;
    let endMinutes = DEFAULT_EAT_END_MIN;
    if (bed != null) {
      endMinutes = bed - WATER_ALARM_END_BEFORE_BED_MIN;
      if (endMinutes <= wakeMinutes) endMinutes = DEFAULT_EAT_END_MIN;
    }
    const span = Math.max(1, endMinutes - wakeMinutes);
    const current = Number.isFinite(nowMinutes)
      ? nowMinutes
      : (new Date().getHours() * 60 + new Date().getMinutes());
    return Math.min(1, Math.max(0, (current - wakeMinutes) / span));
  }

  function totalRowDeviationZone(fact, norm, progressK) {
    if (!isNum(fact) || norm <= 0) {
      return { zone: 'none', barClass: 'is-ok', overClass: 'is-warn' };
    }
    const pct = (fact / norm) * 100;
    if (pct > 100) {
      const zone = pct >= MACRO_RED_PCT ? 'red' : (pct >= MACRO_WARN_PCT ? 'warn' : 'none');
      const barClass = zone === 'red' ? 'is-red' : (zone === 'warn' ? 'is-warn' : 'is-ok');
      return { zone, barClass, overClass: barClass };
    }
    const expected = norm * progressK;
    const lagPct = ((expected - fact) / norm) * 100;
    if (lagPct <= LAG_OK_PCT) return { zone: 'none', barClass: 'is-ok', overClass: 'is-warn' };
    if (lagPct <= LAG_WARN_PCT) return { zone: 'warn', barClass: 'is-warn', overClass: 'is-warn' };
    return { zone: 'red', barClass: 'is-red', overClass: 'is-red' };
  }

  function buildTotalRows(dayTot, normAbs, hasData, options) {
    const isPastDay = !!(options && options.isPastDay);
    const progressK = isPastDay ? 1 : (Number(options?.progressK) || 0);
    const showTick = !isPastDay && progressK < 1;
    return TOTAL_ROWS.map((row) => {
      const norm = Number(normAbs?.[row.key]);
      const fact = hasData ? Number(dayTot?.[row.key]) : null;
      const hasFact = hasData && isNum(fact);
      const pct = hasFact && norm > 0 ? (fact / norm) * 100 : null;
      const deviation = hasFact && norm > 0
        ? totalRowDeviationZone(fact, norm, progressK)
        : { zone: 'none', barClass: 'is-ok', overClass: 'is-warn' };
      const overShare = pct != null && pct > 100 && fact > 0 ? ((fact - norm) / fact) * 100 : 0;
      return {
        key: row.key,
        label: row.label,
        unit: row.unit,
        fact: hasFact ? formatNumber(fact) : DASH,
        norm: isNum(norm) && norm > 0 ? formatNumber(norm) : DASH,
        hasBar: hasFact && norm > 0,
        fillPct: pct == null ? 0 : (pct > 100 ? 100 - overShare : Math.max(0, pct)),
        overPct: overShare,
        zone: deviation.zone,
        barClass: deviation.barClass,
        overClass: deviation.overClass,
        showTick: showTick && !(pct > 100),
        tickPct: Math.round(progressK * 1000) / 10
      };
    });
  }

  // === Качество еды ==================================================

  function giStepLabel(gi) {
    if (!isNum(gi) || gi <= 0) return DASH;
    if (gi < 40) return 'низкий';
    if (gi <= 60) return 'средний';
    return 'высокий';
  }

  // === Серия приёмов =================================================

  // «Полноценный» — приём с продуктами, который берёт заметную долю бюджета:
  // строка называет факт, а не хвалит, поэтому кофе с молоком в серию не идёт.
  const FULL_MEAL_BUDGET_SHARE = 0.15;
  const RU_COUNT_WORDS = { 3: 'Три', 4: 'Четыре', 5: 'Пять', 6: 'Шесть', 7: 'Семь', 8: 'Восемь', 9: 'Девять' };

  function buildMealStreak(meals, pIndex, budgetKcal) {
    const budget = Number(budgetKcal) || 0;
    if (budget <= 0) return null;
    const threshold = budget * FULL_MEAL_BUDGET_SHARE;
    let best = 0;
    let run = 0;
    meals.forEach((meal) => {
      const items = Array.isArray(meal?.items) ? meal.items : [];
      const kcal = items.length ? Number(mealTotals(meal, pIndex).kcal) || 0 : 0;
      if (items.length && kcal >= threshold) {
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    });
    if (best < 3) return null;
    const word = RU_COUNT_WORDS[best] || String(best);
    const noun = best >= 5 ? 'приёмов' : 'приёма';
    return word + ' полноценных ' + noun + ' подряд';
  }

  // === Настраиваемые блоки ===========================================

  // Семь чипов вкладки. Голод, рефид и «приёмы за день» — новые поля профиля:
  // переключателей у них раньше не было. Планер и распределение сняты вместе
  // с разделом «Ещё → Дневник»: оба переехали в «Инсайты».
  const CHIPS = [
    { key: 'hunger', field: 'showDiaryHungerPanel', label: 'Голод' },
  // порядок остальных чипов задан контрактом, см. строку «семь чипов»
    { key: 'fiber', field: 'showDiaryFiberPanel', label: 'Клетчатка' },
    { key: 'supplements', field: 'showDiarySupplementsPanel', label: 'Добавки', needsConsent: true },
    { key: 'refeed', field: 'showDiaryRefeedPanel', label: 'Рефид' },
    { key: 'mealsTimeline', field: 'showDiaryMealsTimelinePanel', label: 'Приёмы за день' },
    { key: 'scoreRisk', field: 'showDiaryScoreRiskTrendPanel', label: 'Оценка и риск' },
    { key: 'wave', field: 'showDiaryInsulinWavePanel', label: 'Волна сейчас' }
  ];

  const CYCLE_CHIP = { key: 'cycle', field: 'showDiaryCyclePanel', label: 'Особый период' };

  function isCycleNutritionAvailable(profile) {
    const source = profile && typeof profile === 'object' ? profile : readProfile();
    try {
      const hf = HEYS.healthFeatures;
      if (hf && typeof hf.isCycleTrackingEnabled === 'function') {
        return hf.isCycleTrackingEnabled(source);
      }
    } catch (_) { /* noop */ }
    return (source?.gender === 'Женский' || source?.sex === 'female')
      && source?.cycleTrackingEnabled === true;
  }

  function listConfigChips(profile) {
    const source = profile && typeof profile === 'object' ? profile : readProfile();
    const chips = CHIPS.filter((chip) => {
      if (!chip.needsConsent) return true;
      const hf = HEYS.healthFeatures;
      const trackingOn = typeof hf?.isSupplementsTrackingEnabled === 'function'
        ? hf.isSupplementsTrackingEnabled(source)
        : source.supplementsTrackingEnabled === true;
      return trackingOn;
    });
    if (isCycleNutritionAvailable(source)) chips.splice(1, 0, CYCLE_CHIP);
    return chips;
  }

  function readProfile() {
    try {
      return HEYS.utils?.lsGet?.('heys_profile', {}) || {};
    } catch (_) {
      return {};
    }
  }

  function readChipState(profile) {
    const source = profile && typeof profile === 'object' ? profile : readProfile();
    const acc = CHIPS.reduce((state, chip) => {
      if (chip.needsConsent) {
        const hf = HEYS.healthFeatures;
        const trackingOn = typeof hf?.isSupplementsTrackingEnabled === 'function'
          ? hf.isSupplementsTrackingEnabled(source)
          : source.supplementsTrackingEnabled === true;
        state[chip.key] = trackingOn && source[chip.field] !== false;
      } else {
        state[chip.key] = source[chip.field] !== false;
      }
      return state;
    }, {});
    if (isCycleNutritionAvailable(source)) {
      acc[CYCLE_CHIP.key] = source[CYCLE_CHIP.field] !== false;
    }
    return acc;
  }

  // Решение владельца 24.08: чип «Добавки» только прячет и показывает блок.
  // Отзыв согласия — отдельная строка в настройках («Мои согласия и данные»),
  // на вкладке его нет: выключение чипа не спрашивает подтверждения и не трогает
  // ни курс, ни отметки, ни поля профиля — они остаются лежать до отзыва.
  // Согласие спрашивается один раз, при первом включении: если трекинг уже
  // разрешён, повторный показ уже согласованного блока идёт без листа согласия.
  // Отступление от строки контракта «согласие» в nutrition-tab (там выключение
  // чипа удаляет отметки и поля профиля) — по прямому решению владельца.
  async function writeChipState(chip, nextEnabled) {
    const U = HEYS.utils;
    const profile = U?.lsGet?.('heys_profile', {}) || {};
    const hf = HEYS.healthFeatures;

    if (chip.needsConsent && nextEnabled) {
      const trackingOn = typeof hf?.isSupplementsTrackingEnabled === 'function'
        ? hf.isSupplementsTrackingEnabled(profile)
        : profile.supplementsTrackingEnabled === true;
      if (!trackingOn && typeof hf?.requestHealthFeatureToggle === 'function') {
        const allowed = await hf.requestHealthFeatureToggle('supplementsTrackingEnabled', true);
        if (!allowed) return false;
        profile.supplementsTrackingEnabled = true;
      }
    }

    const updated = { ...profile, [chip.field]: nextEnabled !== false };

    U?.lsSet?.('heys_profile', updated);
    global.dispatchEvent(new CustomEvent('heys:diary-optional-panels-visibility-changed', {
      detail: { field: chip.field, enabled: nextEnabled !== false }
    }));
    global.dispatchEvent(new CustomEvent('heys:profile-updated', {
      detail: { field: chip.field, fields: [chip.field], source: 'nutrition-tab-chips' }
    }));
    return true;
  }

  // === Мелкая разметка ===============================================

  // Иконке бывает мало одной кривой: календарю нужна ещё рамка. Третий аргумент
  // принимает либо кривую строкой, как раньше, либо список частей, где часть —
  // строка (кривая) или объект-рамка {x, y, width, height, rx}. Больше видов
  // частей не заводим: произвольная SVG-разметка здесь не нужна, а два соседних
  // svgIcon в fingers живут со своей сигнатурой и сводить их сейчас не просили.
  function svgIcon(React, props, parts) {
    const list = Array.isArray(parts) ? parts : [parts];
    return React.createElement('svg', Object.assign({
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2.75,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true'
    }, props), list.map((part, i) => (typeof part === 'string'
      ? React.createElement('path', { key: i, d: part })
      : React.createElement('rect', Object.assign({ key: i }, part)))));
  }

  function chevron(React, size) {
    return svgIcon(React, { width: size || 15, height: size || 15, className: 'nutrition-v4-chevron' }, 'M9 6l6 6-6 6');
  }

  function blockShell(React, key, title, meta, metaTone, children) {
    return React.createElement('section', { key, className: 'nutrition-v4-block', 'data-block': key },
      React.createElement('div', { className: 'nutrition-v4-block__head' },
        React.createElement('b', null, title),
        meta ? React.createElement('span', {
          className: 'nutrition-v4-block__meta' + (metaTone ? ' is-' + metaTone : '')
        }, meta) : null
      ),
      children
    );
  }

  function listRows(React, rows) {
    return React.createElement('div', { className: 'nutrition-v4-list' },
      rows.map((row, idx) => React.createElement('div', { key: row.key || idx, className: 'nutrition-v4-list__row' },
        React.createElement('b', null, row.label),
        React.createElement('span', null, row.value)
      ))
    );
  }

  // === Чип-зависимые блоки ===========================================

  // Контракт «нахлёст»: пересечение красится в ОБЕИХ строках. Прежний код рисовал
  // тревожный сегмент только у ранней волны, поздняя оставалась спокойной.
  function overlapRange(wave, neighbour) {
    if (!wave || !neighbour) return null;
    const from = Math.max(wave.startMin, neighbour.startMin);
    const to = Math.min(wave.endMin, neighbour.endMin);
    return to > from ? { from, to } : null;
  }

  function timelineRow(React, keyPrefix, waves, idx, pos) {
    const wave = waves[idx];
    const segments = [overlapRange(wave, waves[idx - 1]), overlapRange(wave, waves[idx + 1])].filter(Boolean);
    return React.createElement('div', { key: keyPrefix + idx, className: 'nutrition-v4-timeline__row' },
      React.createElement('b', null, formatMinutesClock(wave.startMin)),
      React.createElement('span', { className: 'nutrition-v4-timeline__track', 'aria-hidden': 'true' },
        React.createElement('i', {
          'aria-hidden': 'true',
          style: { left: pos(wave.startMin) + '%', width: (pos(wave.endMin) - pos(wave.startMin)) + '%' }
        }),
        segments.map((segment, segIdx) => React.createElement('i', {
          key: 'ov-' + segIdx,
          className: 'is-overlap',
          'aria-hidden': 'true',
          style: { left: pos(segment.from) + '%', width: (pos(segment.to) - pos(segment.from)) + '%' }
        }))
      ),
      React.createElement('s', null, formatMinutesClock(wave.endMin))
    );
  }

  function renderMealsTimelineBlock(React, insulinWaveData, day) {
    const history = Array.isArray(insulinWaveData?.waveHistory) ? insulinWaveData.waveHistory : [];
    const waves = history
      .map((wave) => ({
        startMin: Number(wave?.startMin),
        endMin: Number(wave?.endMin)
      }))
      .filter((wave) => Number.isFinite(wave.startMin) && Number.isFinite(wave.endMin) && wave.endMin > wave.startMin)
      .sort((a, b) => a.startMin - b.startMin);
    if (!waves.length) return null;

    const overlaps = Array.isArray(insulinWaveData?.overlaps) ? insulinWaveData.overlaps : [];
    const totalOverlap = overlaps.reduce((sum, item) => sum + (Number(item?.overlapMinutes) || 0), 0);
    const { wakeMinutes, eatEndMinutes } = resolveEatingWindow(day);
    const rangeStart = wakeMinutes;
    const rangeEnd = eatEndMinutes;
    const span = Math.max(1, rangeEnd - rangeStart);
    const pos = (minutes) => Math.min(100, Math.max(0, ((minutes - rangeStart) / span) * 100));

    // Контракт «нахлёст»: пересечений нет — подписи нет вовсе. «Без пересечений»
    // было своей выдумкой кода.
    return blockShell(React, 'mealsTimeline', 'Приёмы за день',
      totalOverlap > 0 ? 'нахлёст ' + formatDurationShort(totalOverlap) : null,
      totalOverlap > 0 ? 'warn' : null,
      React.createElement('div', { className: 'nutrition-v4-timeline' },
        waves.map((wave, idx) => timelineRow(React, 'wave-', waves, idx, pos))
      )
    );
  }

  // Контракт «трассировка расчёта»: расчёт признаёт, чего не знает. На первом
  // слое — три крупнейших вклада и строка неопределённости с диапазоном; полный
  // список вкладов открывается «Весь расчёт», иначе семь строк по «+0,2 мин»
  // прячут главное.
  const TRACE_TOP_LIMIT = 3;

  function signedMinutesLabel(minutes) {
    const value = Math.round((Number(minutes) || 0) * 10) / 10;
    if (value === 0) return '0 мин';
    const abs = Math.abs(value);
    // Контракт «формат чисел»: дробные с запятой; у целых хвост «,0» не пишем.
    const body = Number.isInteger(abs) ? formatNumber(abs) : formatDecimal(abs, 1);
    return (value > 0 ? '+' : '−') + body + ' мин';
  }

  function buildWaveTrace(insulinWaveData) {
    const calc = insulinWaveData?.estimatedWindow?.calculation;
    if (!calc) return null;
    const contributions = (Array.isArray(calc.contributions) ? calc.contributions : [])
      .filter((item) => item && Number.isFinite(Number(item.minutes)))
      .slice()
      .sort((a, b) => Math.abs(Number(b.minutes)) - Math.abs(Number(a.minutes)));
    if (!contributions.length) return null;
    const uncertainty = Number(calc.uncertaintyPercent);
    const lower = Number(calc.lowerMinutes);
    const upper = Number(calc.upperMinutes);
    return {
      contributions,
      hasMore: contributions.length > TRACE_TOP_LIMIT,
      uncertaintyLine: Number.isFinite(lower) && Number.isFinite(upper)
        ? (Number.isFinite(uncertainty) ? '±' + uncertainty + ' % · ' : '')
          + formatDurationShort(lower) + ' – ' + formatDurationShort(upper)
        : null
    };
  }

  function renderWaveTrace(React, trace, expanded, onToggle) {
    if (!trace) return null;
    const shown = expanded ? trace.contributions : trace.contributions.slice(0, TRACE_TOP_LIMIT);
    return React.createElement(React.Fragment, null,
      listRows(React, shown.map((item, idx) => ({
        key: item.code || item.label || idx,
        label: item.label || item.code || '—',
        value: signedMinutesLabel(item.minutes)
      }))),
      trace.uncertaintyLine ? React.createElement('div', { className: 'nutrition-v4-why' },
        'Неопределённость расчёта ' + trace.uncertaintyLine
      ) : null,
      trace.hasMore ? React.createElement('button', {
        type: 'button',
        className: 'nutrition-v4-disclose' + (expanded ? ' is-open' : ''),
        'aria-expanded': expanded ? 'true' : 'false',
        onClick: onToggle
      },
        React.createElement('span', null, expanded ? 'Свернуть расчёт' : 'Весь расчёт'),
        chevron(React, 15)
      ) : null
    );
  }

  function renderWaveNowBlock(React, insulinWaveData, options) {
    if (!insulinWaveData || insulinWaveData.isPastDay || insulinWaveData.isOvernightEstimate) return null;
    const remaining = Number(insulinWaveData.rangeRemaining ?? insulinWaveData.remaining);
    if (!Number.isFinite(remaining)) return null;

    const history = Array.isArray(insulinWaveData.waveHistory) ? insulinWaveData.waveHistory : [];
    const active = history
      .map((wave) => ({ startMin: Number(wave?.startMin), endMin: Number(wave?.endMin) }))
      .filter((wave) => Number.isFinite(wave.startMin) && Number.isFinite(wave.endMin) && wave.endMin > wave.startMin)
      .slice(-2);
    const overlapMinutes = Number(insulinWaveData.worstOverlap?.overlapMinutes) || 0;
    const rangeStart = active.length ? Math.min(...active.map((w) => w.startMin)) : 0;
    const rangeEnd = active.length ? Math.max(...active.map((w) => w.endMin)) : 1;
    const span = Math.max(1, rangeEnd - rangeStart);
    const pos = (minutes) => ((minutes - rangeStart) / span) * 100;

    return blockShell(React, 'wave', 'Волна сейчас',
      overlapMinutes > 0 ? 'нахлёст ' + formatDurationShort(overlapMinutes) : null,
      'warn',
      React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'nutrition-v4-wave-now' },
          React.createElement('b', null, remaining > 0 ? formatDurationShort(remaining) : 'спад прошёл'),
          React.createElement('span', null, remaining > 0
            ? 'до спада · закончится ≈' + formatClockFromNow(remaining)
            : 'окно открыто')
        ),
        active.length ? React.createElement('div', { className: 'nutrition-v4-timeline' },
          active.map((wave, idx) => timelineRow(React, 'now-', active, idx, pos))
        ) : null,
        renderWaveTrace(React, buildWaveTrace(insulinWaveData), !!options?.traceExpanded, options?.onToggleTrace)
      )
    );
  }

  // Карточка называется тем, что измеряется: метрики «энергия» в данных нет,
  // ближайшая шкала 1–10 того же смысла — самочувствие (контракт «голод и
  // самочувствие», уточнён дизайном 21.08).
  function renderHungerBlock(React, day, date, onOpenCheckin) {
    const hunger = HEYS.HungerEnergyStatusModal?.getLatestHungerLevel?.(date) ?? null;
    const wellbeingRaw = Number(day?.wellbeingAvg) || Number(day?.wellbeingMorning) || null;
    const wellbeing = isNum(wellbeingRaw) && wellbeingRaw > 0 ? Math.round(wellbeingRaw) : null;
    const empty = hunger == null && wellbeing == null;

    const scale = (value, tone) => React.createElement('div', { className: 'nutrition-v4-scale', 'aria-hidden': 'true' },
      Array.from({ length: 10 }, (_, i) => React.createElement('i', {
        key: i,
        className: value != null && i < value ? 'is-on is-' + tone : ''
      }))
    );

    const card = (key, label, value, tone) => React.createElement('button', {
      key,
      type: 'button',
      className: 'nutrition-v4-mini',
      onClick: () => onOpenCheckin?.()
    },
      React.createElement('b', null, label),
      React.createElement('s', null,
        value == null ? dashNode(React) : value,
        React.createElement('i', null, 'из 10')
      ),
      scale(value, tone)
    );

    return blockShell(React, 'hunger', 'Голод и самочувствие', null, null,
      React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'nutrition-v4-mini-row' },
          card('hunger', 'Голод', hunger, 'act'),
          card('wellbeing', 'Самочувствие', wellbeing, 'ok')
        ),
        empty ? React.createElement('div', { className: 'nutrition-v4-why' }, 'отмечается в утреннем чек-ине') : null
      )
    );
  }

  function saveNutritionCycleDay(dateKey, cycleDay) {
    const U = HEYS.utils;
    const lsGet = U?.lsGet?.bind(U);
    const lsSet = U?.lsSet?.bind(U);
    if (HEYS.CycleUI?.applyCycleDaySelection) {
      HEYS.CycleUI.applyCycleDaySelection(dateKey, cycleDay, lsGet, lsSet);
      return;
    }
    if (HEYS.Cycle?.setCycleDaysAuto) {
      HEYS.Cycle.setCycleDaysAuto(dateKey, cycleDay, lsGet, lsSet);
    }
  }

  function renderCycleBlock(React, params) {
    const { day, date, prof, isReadOnly, haptic, eatenKcal, displayOptimum } = params || {};
    if (!isCycleNutritionAvailable(prof)) return null;

    const U = HEYS.utils;
    const lsGet = U?.lsGet?.bind(U);
    const countDay = HEYS.Cycle?.resolveCycleCountDay?.({
      date: date || day?.date,
      cycleDay: day?.cycleDay,
      lsGet,
    }) ?? null;
    const cycleKcalMultiplier = HEYS.Cycle?.getKcalMultiplier?.(countDay) || 1;

    if (HEYS.CycleUI?.renderNutritionCycleBlock) {
      return HEYS.CycleUI.renderNutritionCycleBlock(React, {
        day,
        date,
        prof,
        isReadOnly,
        haptic,
        showCycleCard: true,
        cyclePhase: HEYS.Cycle?.getCyclePhase?.(day?.cycleDay),
        lsGet,
        lsSet: U?.lsSet?.bind(U),
        eatenKcal,
        budgetKcal: displayOptimum,
        cycleKcalMultiplier,
      });
    }

    const CycleUI = HEYS.CycleUI || {};
    const dateKey = date || day?.date;
    const storedDay = Number(day?.cycleDay);
    const hasStoredDay = Number.isFinite(storedDay) && storedDay >= 1 && storedDay <= 7;
    const suggestedDay = typeof CycleUI.getSuggestedCycleDay === 'function'
      ? CycleUI.getSuggestedCycleDay(dateKey, HEYS.utils?.lsGet)
      : null;
    const activeDay = typeof CycleUI.resolveCycleDayForUi === 'function'
      ? CycleUI.resolveCycleDayForUi(dateKey, hasStoredDay ? storedDay : null, HEYS.utils?.lsGet)
      : (hasStoredDay ? storedDay : (suggestedDay || null));
    const cycleDays = [1, 2, 3, 4, 5, 6, 7];
    const meta = hasStoredDay && typeof CycleUI.formatCycleWeekBadge === 'function'
      ? CycleUI.formatCycleWeekBadge(storedDay)
      : (hasStoredDay ? `День ${storedDay}` : 'Указать день');

    return blockShell(React, 'cycle', 'Особый период', meta, hasStoredDay ? 'ok' : null,
      React.createElement(React.Fragment, null,
        !hasStoredDay && React.createElement('div', { className: 'nutrition-v4-why' },
          'Отметьте день периода — нормы дня подстроятся под него.'
        ),
        React.createElement('div', {
          className: 'nutrition-v4-cycle-days',
          role: 'radiogroup',
          'aria-label': 'Какой день'
        },
          cycleDays.map((cycleDay) => React.createElement('button', {
            key: cycleDay,
            type: 'button',
            role: 'radio',
            className: 'nutrition-v4-cycle-day' + ((activeDay === cycleDay || storedDay === cycleDay) ? ' is-on' : ''),
            'aria-checked': storedDay === cycleDay ? 'true' : 'false',
            'aria-label': `День ${cycleDay}`,
            disabled: !!isReadOnly,
            tabIndex: storedDay === cycleDay || (!hasStoredDay && cycleDay === (activeDay || 1)) ? 0 : -1,
            onClick: () => {
              if (isReadOnly) return;
              saveNutritionCycleDay(dateKey, cycleDay);
              haptic?.('light');
            }
          }, String(cycleDay)))
        )
      )
    );
  }

  // Обход тридцати дней в localStorage — не для каждого рендера: считаем один
  // раз на дату и держим результат до её смены.
  let bestFiberCache = { key: null, value: null };

  function bestFiberSource(dateKey, pIndex) {
    if (!dateKey) return null;
    if (bestFiberCache.key === dateKey) return bestFiberCache.value;
    const value = HEYS.dayDiarySection?.getBestFiberSource?.(dateKey, pIndex, HEYS) || null;
    bestFiberCache = { key: dateKey, value };
    return value;
  }

  function renderFiberBlock(React, params) {
    const { dayTot, normAbs, day, pIndex, expanded, onToggle, hasData, progressK } = params;
    const eaten = hasData ? Math.max(0, Number(dayTot?.fiber) || 0) : null;
    const target = Math.max(1, Math.round(Number(normAbs?.fiber) || 0));
    if (!target) return null;
    const remaining = eaten == null ? null : Math.max(0, Math.round(target - eaten));
    const pct = eaten == null ? 0 : Math.max(0, Math.min(100, (eaten / target) * 100));
    const sources = expanded ? (HEYS.dayDiarySection?.getFiberSources?.() || []) : [];
    const best = expanded ? bestFiberSource(day?.date, pIndex) : null;
    // Контракт «клетчатка · блок»: дорожка по той же шкале зон, что у итогов дня
    // (раньше была вечно is-ok). Число красным не красится никогда — тон шапки
    // остаётся вторичным.
    const barClass = eaten == null
      ? 'is-ok'
      : totalRowDeviationZone(eaten, target, Number(progressK) || 0).barClass;

    return blockShell(React, 'fiber', 'Клетчатка',
      (eaten == null ? DASH : formatNumber(eaten)) + ' из ' + formatNumber(target) + ' г', null,
      React.createElement(React.Fragment, null,
        // Пустой день: прочерк вместо числа, дорожка и строка «добрать» не рисуются.
        eaten == null ? null : React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'nutrition-v4-bar' },
            React.createElement('i', { className: barClass, style: { width: pct + '%' } })
          ),
          React.createElement('button', {
            type: 'button',
            className: 'nutrition-v4-disclose' + (expanded ? ' is-open' : ''),
            'aria-expanded': expanded ? 'true' : 'false',
            onClick: onToggle
          },
            React.createElement('span', null,
              remaining > 0 ? 'добрать ' + remaining + ' г' : 'норма закрыта'),
            chevron(React, 15)
          )
        ),
        expanded && eaten != null ? React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'nutrition-v4-why' },
            remaining > 0
              ? 'Не хватает ' + remaining + ' г. Добирать лучше постепенно — резкая прибавка тяжело переносится.'
              : 'Сегодня клетчатка в норме. Дальше достаточно не перегружать день.'
          ),
          sources.length ? listRows(React, sources.map((source) => ({
            key: source.title,
            label: source.title,
            value: source.grams
          }))) : null,
          best ? React.createElement('div', { className: 'nutrition-v4-note' },
            'Ваш лучший источник за месяц — ',
            React.createElement('b', null, best.name),
            ', ' + formatDecimal(best.fiber, 0) + ' г на порцию.'
          ) : null
        ) : null
      )
    );
  }

  function groupSupplementsForTab(planned, catalog) {
    const groups = { morning: [], withMeal: [], evening: [], anytime: [] };
    (planned || []).forEach((id) => {
      const timing = catalog?.[id]?.timing;
      const groupKey = SUPP_TIMING_TO_GROUP[timing] || 'anytime';
      groups[groupKey].push(id);
    });
    // Контракт «порядок чипов»: внутри группы — порядок каталога, а не порядок
    // добавления в курс. Ключи каталога и задают этот порядок; позиции вне
    // каталога уходят в конец, сохраняя свой относительный порядок.
    const catalogOrder = new Map(Object.keys(catalog || {}).map((id, idx) => [id, idx]));
    const rank = (id) => (catalogOrder.has(id) ? catalogOrder.get(id) : Number.MAX_SAFE_INTEGER);
    Object.keys(groups).forEach((groupKey) => {
      groups[groupKey] = groups[groupKey]
        .map((id, idx) => ({ id, idx }))
        .sort((a, b) => (rank(a.id) - rank(b.id)) || (a.idx - b.idx))
        .map((entry) => entry.id);
    });
    return groups;
  }

  function SupplementsBlockV4(props) {
    const { React, date, day, haptic } = props;
    const api = HEYS.Supplements;
    const [, bump] = React.useReducer((value) => value + 1, 0);
    const [expandedGroups, setExpandedGroups] = React.useState({});

    React.useEffect(() => {
      const sync = (event) => {
        if (!event?.detail?.date || event.detail.date === date) bump();
      };
      global.addEventListener('heys:day-updated', sync);
      return () => global.removeEventListener('heys:day-updated', sync);
    }, [date]);

    const catalog = api?.CATALOG || {};
    const planned = Array.isArray(day?.supplementsPlanned) && day.supplementsPlanned.length
      ? day.supplementsPlanned
      : (typeof api?.getPlanned === 'function' ? api.getPlanned() : []);
    const taken = Array.isArray(day?.supplementsTaken) ? day.supplementsTaken : [];
    const plannedSet = new Set(planned || []);
    const staleTaken = taken.filter((id) => !plannedSet.has(id));

    const openCourse = () => {
      if (typeof api?.openMyCourseScreen === 'function') api.openMyCourseScreen(date, bump);
      else if (typeof api?.renderCard === 'function') api.renderCard({ dateKey: date, onForceUpdate: bump });
      haptic?.('light');
    };

    const toggleSupplement = (id, nextTaken) => {
      if (typeof api?.markSupplementsTaken === 'function') {
        api.markSupplementsTaken(date, [id], nextTaken);
      } else if (typeof api?.markTaken === 'function') {
        api.markTaken(date, id, nextTaken);
      }
      bump();
      haptic?.('light');
    };

    const toggleMany = (ids, nextTaken) => {
      if (!ids.length) return;
      if (typeof api?.markSupplementsTaken === 'function') {
        api.markSupplementsTaken(date, ids, nextTaken);
      } else {
        ids.forEach((id) => api?.markTaken?.(date, id, nextTaken));
      }
      bump();
      haptic?.('light');
    };

    if (!Array.isArray(planned) || planned.length === 0) {
      return React.createElement('section', { className: 'nutrition-v4-block', 'data-block': 'supplements' },
        React.createElement('div', { className: 'nutrition-v4-block__head' },
          React.createElement('b', null, 'Добавки')
        ),
        React.createElement('div', { className: 'nutrition-v4-supplements__empty' },
          'Курс не заведён — отметки появятся после настройки.'
        ),
        React.createElement('button', {
          type: 'button',
          className: 'nutrition-v4-cta nutrition-v4-supplements__setup',
          onClick: openCourse
        }, 'Настроить курс')
      );
    }

    const groups = groupSupplementsForTab(planned, catalog);
    const allIds = planned.slice();
    const takenCount = allIds.filter((id) => taken.includes(id)).length;
    const allTaken = allIds.length > 0 && takenCount === allIds.length;
    const headerMeta = allTaken
      ? React.createElement('span', { className: 'nutrition-v4-block__meta is-ok' }, 'всё принято')
      : React.createElement('span', { className: 'nutrition-v4-block__meta' },
        takenCount > 0 ? React.createElement('em', null, takenCount) : null,
        (takenCount > 0 ? ' ' : '') + 'из ' + allIds.length
      );

    const renderChip = (id, options) => {
      const name = catalog[id]?.name || id;
      const isTaken = taken.includes(id);
      const isStale = options?.stale;
      return React.createElement('button', {
        key: id + (isStale ? '-stale' : ''),
        type: 'button',
        className: 'nutrition-v4-supplements__chip'
          + (isTaken ? ' is-on' : '')
          + (isStale ? ' is-stale' : ''),
        onClick: () => {
          if (!passRepeatTapGuard(date + ':supp-chip:' + id)) return;
          toggleSupplement(id, !isTaken);
        }
      },
        isTaken ? React.createElement('span', { className: 'nutrition-v4-supplements__chip-check', 'aria-hidden': 'true' },
          svgIcon(React, { width: 11, height: 11, strokeWidth: 3.5 }, 'M5 13l4 4L19 7')) : null,
        name,
        isStale ? React.createElement('span', { className: 'nutrition-v4-supplements__chip-note' }, '· не в курсе') : null
      );
    };

    const renderGroup = (groupKey) => {
      const ids = groups[groupKey] || [];
      const groupIds = ids.slice();
      const staleInGroup = staleTaken.filter((id) => (SUPP_TIMING_TO_GROUP[catalog[id]?.timing] || 'anytime') === groupKey);
      if (!groupIds.length && !staleInGroup.length) return null;
      const groupTaken = groupIds.filter((id) => taken.includes(id)).length;
      const allGroupTaken = groupIds.length > 0 && groupTaken === groupIds.length;
      const expanded = !!expandedGroups[groupKey];
      const visible = expanded ? groupIds : groupIds.slice(0, SUPP_VISIBLE_LIMIT);
      const hiddenCount = Math.max(0, groupIds.length - visible.length);
      const notTaken = groupIds.filter((id) => !taken.includes(id));

      return React.createElement('div', { key: groupKey, className: 'nutrition-v4-supplements__group' },
        React.createElement('button', {
          type: 'button',
          className: 'nutrition-v4-supplements__group-pill' + (allGroupTaken ? ' is-done' : ''),
          onClick: () => {
            if (!passRepeatTapGuard(date + ':supp-group:' + groupKey)) return;
            if (allGroupTaken) {
              toggleMany(groupIds, false);
            } else {
              toggleMany(notTaken, true);
            }
          }
        },
          React.createElement('b', null, SUPP_GROUP_LABELS[groupKey]),
          allGroupTaken
            ? React.createElement('i', { className: 'is-done', 'aria-hidden': 'true' },
              svgIcon(React, { width: 11, height: 11, strokeWidth: 3.5 }, 'M5 13l4 4L19 7'))
            : React.createElement('i', null,
              groupTaken > 0 ? React.createElement('em', null, groupTaken) : null,
              (groupTaken > 0 ? ' ' : '') + 'из ' + groupIds.length
            )
        ),
        React.createElement('div', { className: 'nutrition-v4-supplements__chips' },
          visible.map((id) => renderChip(id)),
          hiddenCount > 0 ? React.createElement('button', {
            type: 'button',
            className: 'nutrition-v4-supplements__chip is-more',
            onClick: () => setExpandedGroups((state) => ({ ...state, [groupKey]: true }))
          }, 'ещё ' + hiddenCount) : null,
          staleInGroup.map((id) => renderChip(id, { stale: true }))
        )
      );
    };

    return React.createElement('section', { className: 'nutrition-v4-block', 'data-block': 'supplements' },
      React.createElement('div', { className: 'nutrition-v4-block__head nutrition-v4-supplements__head' },
        React.createElement('b', null, 'Добавки'),
        React.createElement('div', { className: 'nutrition-v4-supplements__actions' },
          headerMeta,
          React.createElement('button', {
            type: 'button',
            className: 'nutrition-v4-supplements__pill is-course',
            onClick: openCourse
          }, 'Курс'),
          React.createElement('button', {
            type: 'button',
            className: 'nutrition-v4-supplements__pill',
            onClick: () => {
              if (!passRepeatTapGuard(date + ':supp-all')) return;
              if (allTaken) toggleMany(allIds, false);
              else toggleMany(allIds.filter((id) => !taken.includes(id)), true);
            }
          }, allTaken ? 'Снять всё' : 'Всё сразу')
        )
      ),
      React.createElement('div', { className: 'nutrition-v4-supplements__groups' },
        SUPP_GROUP_ORDER.map((groupKey) => renderGroup(groupKey)).filter(Boolean)
      )
    );
  }

  function renderSupplementsBlock(React, params) {
    return React.createElement(SupplementsBlockV4, params);
  }

  function renderRefeedBlock(React, params) {
    const { day, optimum, budgetKcal } = params;
    if (!day?.isRefeedDay) return null;
    const base = Math.round(Number(optimum) || 0);
    const budget = Math.round(Number(budgetKcal) || 0);
    const boost = budget - base;
    if (!(boost > 0)) return null;

    return blockShell(React, 'refeed', 'Загрузочный день', '+' + formatNumber(boost) + ' ккал', 'ok',
      React.createElement(React.Fragment, null,
        listRows(React, [
          { key: 'boosted', label: 'Прибавка уже в бюджете', value: formatNumber(budget) },
          { key: 'base', label: 'Обычная норма', value: formatNumber(base) }
        ]),
        React.createElement('div', { className: 'nutrition-v4-why' },
          'Норма дня выросла на ' + formatNumber(boost) + ' ккал — герой уже считает от '
          + formatNumber(budget) + ', добирать вручную ничего не нужно.'
        )
      )
    );
  }

  const RISK_STEPS = { critical: 3, high: 2, elevated: 1, guarded: 1, medium: 1 };

  let dayScoreCache = { key: null, value: null };

  function dayScoreSummary(params) {
    const { day, prof, dayTot, normAbs, pIndex } = params;
    const key = [
      day?.date, (day?.meals || []).length, day?.waterMl, day?.updatedAt,
      dayTot?.kcal, dayTot?.prot, dayTot?.fat, dayTot?.carbs, dayTot?.fiber, normAbs?.kcal
    ].join('|');
    if (dayScoreCache.key === key) return dayScoreCache.value;
    const value = HEYS.dayDiarySection?.getDayScoreSummary?.({
      dayData: day, profile: prof, dayTot, normAbs, pIndex
    }) || null;
    dayScoreCache = { key, value };
    return value;
  }

  function renderScoreRiskBlock(React, params) {
    const { day, prof, dayTot, normAbs, pIndex } = params;
    const summary = dayScoreSummary({ day, prof, dayTot, normAbs, pIndex });
    const dayScore = summary?.dayScore;
    const risk = summary?.riskRadar;
    if (!dayScore && !risk) return null;

    const riskLevelId = risk?.level?.id || 'low';
    const riskWord = riskLevelId === 'critical' ? 'критичный'
      : riskLevelId === 'high' ? 'высокий'
        : (riskLevelId === 'elevated' || riskLevelId === 'guarded' || riskLevelId === 'medium') ? 'средний'
          : 'низкий';
    const activeStep = RISK_STEPS[riskLevelId] ?? 0;
    const scoreWord = String(dayScore?.level?.label || '').replace(/[!]+$/, '').trim();
    const driver = Array.isArray(risk?.drivers) ? risk.drivers[0] : null;
    const driverText = driver?.explanation || driver?.label || null;

    return blockShell(React, 'scoreRisk', 'Оценка и риск', 'сегодня', null,
      React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'nutrition-v4-verdict' },
          React.createElement('b', null, scoreWord || 'день идёт'),
          React.createElement('span', null, 'риск ' + riskWord)
        ),
        React.createElement('div', { className: 'nutrition-v4-steps', 'aria-hidden': 'true' },
          [0, 1, 2, 3].map((i) => React.createElement('span', {
            key: i,
            className: i === activeStep ? 'is-on is-' + (activeStep >= 2 ? 'warn' : activeStep === 1 ? 'soft' : 'ok') : ''
          }))
        ),
        driverText ? React.createElement('div', { className: 'nutrition-v4-why' }, 'Поднимут риск: ' + driverText + '.') : null
      )
    );
  }

  // === Лист правки приёма ============================================

  function buildVisibleMealOptimizerRecs(meal, mealTotalsValue, ctx) {
    const MO = HEYS.MealOptimizer;
    if (!MO || !meal?.items?.length) return [];
    const recommendations = MO.getMealOptimization({
      meal,
      mealTotals: mealTotalsValue,
      dayData: ctx?.dayData || {},
      profile: ctx?.profile || {},
      products: ctx?.products || [],
      pIndex: ctx?.pIndex,
      avgGI: mealTotalsValue?.gi || 50
    });
    const filtered = recommendations.filter((rec) => !MO.shouldHideRecommendation(rec.id));
    const seen = new Map();
    filtered.forEach((rec) => {
      const key = String(rec.title || '').toLowerCase().trim();
      if (!seen.has(key) || (seen.get(key).priority || 0) < (rec.priority || 0)) {
        seen.set(key, rec);
      }
    });
    return Array.from(seen.values()).sort((a, b) => {
      if (a.isWarning && !b.isWarning) return -1;
      if (!a.isWarning && b.isWarning) return 1;
      const aHasProds = (a.products?.length || 0) > 0 ? 1 : 0;
      const bHasProds = (b.products?.length || 0) > 0 ? 1 : 0;
      if (aHasProds !== bHasProds) return bHasProds - aHasProds;
      return (b.priority || 50) - (a.priority || 50);
    });
  }

  function MealProductRow(props) {
    const { React, item, name, grams, onEdit, onRemove } = props;

    // Контракт 03.09: тап по строке — граммовка; удаление — крестик 14 px в цели 44.
    // Копирование и перенос продукта — отдельными листами из блока действий приёма.
    return React.createElement('div', { className: 'nutrition-v4-sheet__row--product' },
      React.createElement('button', {
        type: 'button',
        className: 'nutrition-v4-sheet__row-main',
        onClick: () => onEdit?.(item)
      },
        React.createElement('b', null, name),
        React.createElement('span', null, grams)
      ),
      React.createElement('button', {
        type: 'button',
        className: 'nutrition-v4-sheet__row-remove',
        'aria-label': 'Удалить ' + name,
        onClick: (event) => {
          event.stopPropagation();
          onRemove?.(item);
        }
      },
        svgIcon(React, { width: 14, height: 14, strokeWidth: 2.75 }, 'M6 6l12 12M18 6L6 18')
      )
    );
  }

  function MealEditSheet(props) {
    const {
      React,
      meal,
      mealIndex,
      pIndex,
      date,
      actions,
      onClose,
      insulinWaveData,
      prof,
      dayTot,
      waterMl
    } = props;
    const sheetRef = React.useRef(null);
    const [dragY, setDragY] = React.useState(0);
    const [whyOpen, setWhyOpen] = React.useState(false);
    const [tipsOpen, setTipsOpen] = React.useState(false);
    const startY = React.useRef(null);
    const MealOptimizerSection = HEYS.dayMealOptimizerSection?.MealOptimizerSection;

    // Строка «вид · разбор приёма»: карточка «Смешанный профиль · волна 4,5 ч»
    // стоит ниже блока действий, прямо перед «Удалить приём» — она объясняет
    // приём, а не правит его. Волну для этого приёма модель уже посчитала:
    // до сих пор её видел только виджет дня, а в листе правки человек не мог
    // узнать, почему у приёма именно такая длительность.
    const mealWave = React.useMemo(() => {
      const list = Array.isArray(insulinWaveData?.waveHistory) ? insulinWaveData.waveHistory : [];
      if (!list.length) return null;
      return list.find((wave) => (meal?.id ? wave.id === meal.id : wave.time === meal?.time)) || null;
    }, [insulinWaveData, meal?.id, meal?.time]);
    const waveTrace = mealWave ? buildWaveTrace(mealWave) : null;

    const items = Array.isArray(meal?.items) ? meal.items : [];
    const isEmpty = items.length === 0;
    const totals = mealTotals(meal, pIndex);
    const title = mealTypeLabel(meal) + ' · ' + (meal?.time || '--:--');
    const macros = isEmpty
      ? 'без продуктов'
      : [
        formatNumber(totals.kcal) + ' ккал',
        'Б ' + formatNumber(totals.prot),
        'Ж ' + formatNumber(totals.fat),
        'У ' + formatNumber(totals.carbs)
      ].join(' · ');

    const optimizerCtx = React.useMemo(() => ({
      dayData: { dayTot: dayTot || {}, waterMl: waterMl || 0 },
      profile: prof || {},
      products: [],
      pIndex
    }), [dayTot, waterMl, prof, pIndex]);
    const mealOptimizerRecs = React.useMemo(
      () => buildVisibleMealOptimizerRecs(meal, totals, optimizerCtx),
      [meal, totals, optimizerCtx]
    );
    const mealOptimizerCount = mealOptimizerRecs.length;
    React.useEffect(() => {
      if (!mealOptimizerCount) setTipsOpen(false);
    }, [mealOptimizerCount, meal?.id]);

    // Пустой приём предлагает самый частый сценарий копирования — «то же, что вчера».
    const yesterday = React.useMemo(() => {
      if (!isEmpty) return null;
      const api = HEYS.dayMealHandlers;
      if (typeof api?.loadRecentMealsForDate !== 'function') return null;
      try {
        const recent = api.loadRecentMealsForDate(date, 2) || [];
        const yMeals = recent.filter((entry) => entry.dateLabel === 'вчера').map((entry) => entry.meal);
        const match = api.findYesterdayEquivalent?.(meal, yMeals);
        return match && (match.items || []).length ? match : null;
      } catch (_) {
        return null;
      }
    }, [isEmpty, date, meal?.mealType, meal?.time]);

    const onTouchStart = (event) => {
      if (sheetRef.current && sheetRef.current.scrollTop > 0) return;
      startY.current = event.touches[0].clientY;
    };
    const onTouchMove = (event) => {
      if (startY.current == null) return;
      setDragY(Math.max(0, event.touches[0].clientY - startY.current));
    };
    const onTouchEnd = () => {
      if (startY.current == null) return;
      startY.current = null;
      if (dragY > 90) { setDragY(0); onClose?.(); } else setDragY(0);
    };

    // Контракт nutrition-tab, «safe-area и кнопка назад»: аппаратная кнопка
    // назад / жест на Android закрывают лист правки приёма, а не уводят с
    // экрана. Паттерн — heys_widgets_ui_v1.js (карточка «Ещё») и
    // heys_day_pickers.js (шторка календаря): pushState-метка при монтировании
    // листа, popstate закрывает его через тот же onClose, которым закрываются
    // и остальные пути (подложка, свайп вниз); при размонтировании — снять
    // слушатель и увести историю на шаг назад, если запись ещё наша.
    React.useEffect(() => {
      const onPopState = () => { onClose?.(); };
      window.addEventListener('popstate', onPopState);
      try {
        window.history.pushState({ heysMealEditSheet: true }, '');
      } catch (_e) { /* история недоступна — остальные пути закрытия работают */ }
      return () => {
        window.removeEventListener('popstate', onPopState);
        try {
          if (window.history.state?.heysMealEditSheet) window.history.back();
        } catch (_e) { /* ignore */ }
      };
    }, []);

    // Контракт pwa-update, «обновление во время записи»: перезагрузку
    // задерживает не только открытая модалка, но и заполненная форма на
    // экране. Реестр держит платформенный модуль; возвращённая функция
    // снимает признак и при закрытии листа, и при уходе с экрана.
    React.useEffect(() => window.HEYS?.PlatformAPIs?.holdUpdateForFormDraft?.('meal-edit-sheet'), []);

    // Строка продукта — залитая карточка, действие — строка без заливки на
    // грунте листа: иконка акцентом слева, подпись, шеврон, волосяной
    // разделитель (контракт «продукт против действия»).
    const actionRow = (key, label, icon, handler, disabled) => React.createElement('button', {
      key,
      type: 'button',
      className: 'nutrition-v4-sheet__action' + (disabled ? ' is-disabled' : ''),
      disabled: !!disabled,
      onClick: () => { if (!disabled) handler?.(); }
    },
      React.createElement('span', { className: 'nutrition-v4-sheet__action-icon', 'aria-hidden': 'true' },
        svgIcon(React, { width: 16, height: 16, strokeWidth: 2.4 }, icon)),
      React.createElement('b', null, label),
      React.createElement('span', { className: 'nutrition-v4-sheet__chevron', 'aria-hidden': 'true' }, chevron(React, 15))
    );

    const productFor = (item) => pIndex?.byId?.get?.(String(item?.product_id || item?.id || '').toLowerCase()) || null;

    // Правки применяются сразу, кнопки «Готово» нет: закрытие — свайп вниз или
    // тап по затемнению (контракт «закрытие»).
    const sheet = React.createElement('div', {
      className: 'nutrition-v4-sheet-backdrop',
      role: 'presentation',
      onClick: (event) => { if (event.target === event.currentTarget) onClose?.(); }
    },
      React.createElement('div', {
        ref: sheetRef,
        className: 'nutrition-v4-sheet',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Правка приёма',
        style: dragY ? { transform: 'translateY(' + dragY + 'px)' } : undefined,
        onTouchStart,
        onTouchMove,
        onTouchEnd
      },
        React.createElement('div', { className: 'nutrition-v4-sheet__head' },
          React.createElement('b', null, title),
          React.createElement('span', null, macros)
        ),
        React.createElement('button', {
          type: 'button',
          className: 'nutrition-v4-sheet__row',
          onClick: () => { onClose?.(); actions.openTimeEditor?.(mealIndex); }
        },
          React.createElement('b', null, 'Время'),
          React.createElement('span', null, meal?.time || '--:--'),
          React.createElement('span', { className: 'nutrition-v4-sheet__chevron', 'aria-hidden': 'true' }, chevron(React, 15))
        ),

        items.map((item) => React.createElement(MealProductRow, {
          key: item.id || item.product_id,
          React,
          item,
          name: productName(item, pIndex),
          grams: formatNumber(item.grams) + ' г',
          onEdit: (it) => actions.openEditGramsModal?.(mealIndex, it.id, Number(it.grams) || 0, productFor(it)),
          onRemove: (it) => actions.removeItem?.(mealIndex, it.id)
        })),

        yesterday ? React.createElement('button', {
          type: 'button',
          className: 'nutrition-v4-sheet__repeat',
          onClick: () => { onClose?.(); actions.repeatYesterdayMeal?.(mealIndex, yesterday); }
        },
          React.createElement('b', null, 'Повторить вчерашний «' + mealTypeLabel(yesterday) + '»'),
          React.createElement('span', null,
            (yesterday.items || []).slice(0, 4).map((it) => productName(it, pIndex)).join(' · ')
          )
        ) : null,

        React.createElement('button', {
          type: 'button',
          className: 'nutrition-v4-cta nutrition-v4-sheet__cta',
          onClick: () => {
            onClose?.();
            actions.openAddProductForMeal?.({ mealIndex, mealId: meal?.id || null, source: 'nutrition-v4-meal-sheet' });
          }
        },
          React.createElement('span', null, 'Добавить продукт'),
          React.createElement('span', { className: 'nutrition-v4-cta__icon', 'aria-hidden': 'true' },
            svgIcon(React, { width: 17, height: 17 }, 'M12 5v14M5 12h14')
          )
        ),

        React.createElement('div', { className: 'nutrition-v4-sheet__caption' }, 'Действия с приёмом'),

        mealOptimizerCount > 0 ? React.createElement('button', {
          type: 'button',
          className: 'nutrition-v4-sheet__tips-toggle' + (tipsOpen ? ' is-open' : ''),
          'aria-expanded': tipsOpen ? 'true' : 'false',
          onClick: () => setTipsOpen(!tipsOpen)
        },
          React.createElement('span', { className: 'nutrition-v4-sheet__tips-icon', 'aria-hidden': 'true' },
            svgIcon(React, { width: 17, height: 17, strokeWidth: 2.4 }, ['M12 16v-4', 'M12 8h.01', 'M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16'])),
          React.createElement('b', null, 'Советы · ' + mealOptimizerCount),
          React.createElement('span', { className: 'nutrition-v4-sheet__chevron', 'aria-hidden': 'true' }, chevron(React, 15))
        ) : null,

        tipsOpen && mealOptimizerCount > 0 && MealOptimizerSection
          ? React.createElement('div', { className: 'nutrition-v4-sheet__tips-panel' },
            React.createElement(MealOptimizerSection, {
              meal,
              totals,
              dayData: optimizerCtx.dayData,
              profile: optimizerCtx.profile,
              products: optimizerCtx.products,
              pIndex,
              mealIndex
            }))
          : null,

        // Контракт nutrition-tab «действия приёма»: четыре строки; у пустого приёма все погашены.
        actionRow('repeat', 'Повторить сегодня', 'M3 12a9 9 0 0 1 9-9c3.6 0 6.7 2.1 8.1 5.2M21 4v5h-5M21 12a9 9 0 0 1-9 9c-3.6 0-6.7-2.1-8.1-5.2M3 20v-5h5',
          () => { onClose?.(); actions.repeatTodayMeal?.(mealIndex); }, isEmpty),
        // Тот же ответ №34, третий случай: кадр рисует верхний лист рамкой со
        // скруглением 2,5, а код — кривой с острыми углами.
        actionRow('copy', 'Копировать приём',
          [{ x: 9, y: 9, width: 11, height: 11, rx: 2.5 }, 'M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15'],
          () => { onClose?.(); actions.openCopyMealModal?.(mealIndex); }, isEmpty),
        // Ответ дизайнера №34: обмен стрелками означает «поменять местами», а
        // не «перенести на день». Кадр «Приём · правка · рисунок 10–11» даёт
        // календарь со стрелкой; иконка здесь единственное, что различает
        // четыре одинаковых по длине строки при беглом взгляде.
        actionRow('move', 'Переместить на другой день',
          [{ x: 3, y: 5, width: 18, height: 16, rx: 3 }, 'M8 3v4M16 3v4M14 13l3 3-3 3'],
          () => { onClose?.(); actions.openMoveMealModal?.(mealIndex); }, isEmpty),
        // Закладка означала «сохранить в избранное». Кадр даёт документ с
        // загнутым углом. Форма взята из самого кадра, а не из разбора: разбор
        // режет data-v на 95 знаках (долг дизайнера №45) и обрывает рисунок 12
        // многоточием, тогда как разметка кадра полна — обе кривые целы.
        actionRow('preset', 'Сохранить набором',
          ['M5 5.5A1.5 1.5 0 0 1 6.5 4h8L19 8.5v10A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5z',
            'M9 4v5h6'],
          () => { onClose?.(); actions.saveAsPreset?.(mealIndex); }, isEmpty),

        mealWave ? React.createElement('div', { className: 'nutrition-v4-sheet__why' },
          React.createElement('button', {
            type: 'button',
            className: 'nutrition-v4-sheet__why-head' + (whyOpen ? ' is-open' : ''),
            'aria-expanded': whyOpen ? 'true' : 'false',
            onClick: () => setWhyOpen(!whyOpen)
          },
            React.createElement('span', { className: 'nutrition-v4-sheet__why-title' },
              mealWave.responseShape?.label || 'Профиль приёма'),
            React.createElement('span', { className: 'nutrition-v4-sheet__why-wave' },
              '· волна ' + formatWaveHours(mealWave.duration)),
            chevron(React, 15)
          ),
          whyOpen ? renderWaveTrace(React, waveTrace, true, null) : null
        ) : null,

        React.createElement('button', {
          type: 'button',
          className: 'nutrition-v4-sheet__delete',
          onClick: () => { onClose?.(); actions.removeMeal?.(mealIndex); }
        },
          svgIcon(React, { width: 14, height: 14 }, 'M6 6l12 12M18 6L6 18'),
          'Удалить приём'
        )
      )
    );

    const ReactDOM = global.ReactDOM;
    if (ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined') {
      return ReactDOM.createPortal(sheet, document.body);
    }
    return sheet;
  }

  // === Вкладка =======================================================

  function NutritionTabV4(props) {
    const { React, ctx, actions } = props;
    const {
      day,
      prof,
      pIndex,
      date,
      eatenKcal,
      displayOptimum,
      optimum,
      dayTot,
      normAbs,
      insulinWaveData,
      waterMl,
      waterGoal,
      waterGoalBreakdown,
      waterLastDrink
    } = ctx;

    const {
      addMeal,
      addWater,
      removeWater,
      openAddProductForMeal,
      haptic,
      openExclusivePopup
    } = actions || {};

    // Тап по строке дневника открывает лист правки приёма. Раньше со вкладки
    // нельзя было изменить время, граммы и удалить приём вовсе — вся механика
    // жила в скрытом легаси-блоке.
    const [sheetMeal, setSheetMeal] = React.useState(null);
    const openMealSheet = React.useCallback((payload) => {
      if (!payload) return;
      setSheetMeal({ id: payload.mealId || null, index: payload.mealIndex });
    }, []);
    const closeMealSheet = React.useCallback(() => setSheetMeal(null), []);
    React.useEffect(() => { setSheetMeal(null); }, [date]);

    const [curatorCue, setCuratorCue] = React.useState(null);
    React.useEffect(() => {
      const sync = () => {
        const api = global.HEYS && global.HEYS.CuratorActionsBanner;
        if (!api) {
          setCuratorCue(null);
          return;
        }
        if (typeof api.getVisibleCue === 'function') {
          setCuratorCue(api.getVisibleCue(date));
          return;
        }
        setCuratorCue(typeof api.getDayCue === 'function' ? api.getDayCue(date) : null);
      };
      global.addEventListener('heys:curator-review-cues', sync);
      sync();
      return () => global.removeEventListener('heys:curator-review-cues', sync);
    }, [date]);

    // Чипы хранятся в профиле — со второго телефона человек видит свою вкладку.
    const [chipState, setChipState] = React.useState(() => readChipState(prof));
    React.useEffect(() => {
      const sync = () => setChipState(readChipState(null));
      global.addEventListener('heys:diary-optional-panels-visibility-changed', sync);
      global.addEventListener('heys:diary-fiber-panel-visibility-changed', sync);
      global.addEventListener('heys:profile-updated', sync);
      return () => {
        global.removeEventListener('heys:diary-optional-panels-visibility-changed', sync);
        global.removeEventListener('heys:diary-fiber-panel-visibility-changed', sync);
        global.removeEventListener('heys:profile-updated', sync);
      };
    }, []);
    React.useEffect(() => {
      setChipState(readChipState(prof));
    }, [prof]);

    const [fiberExpanded, setFiberExpanded] = React.useState(false);
    // «Весь расчёт» — второй слой трассировки окна сжигания жира.
    const [traceExpanded, setTraceExpanded] = React.useState(false);

    // Только чтение: кнопки записи гаснут до 40 %, но остаются на месте —
    // спрятать кнопку значит сделать вид, что действия нет.
    const isReadOnly = React.useMemo(() => {
      const status = HEYS.Subscription?.getCachedStatus?.() || prof?.subscription_status || 'none';
      return (HEYS.Subscription?.normalizeStatus?.(status) || status) === 'read_only';
    }, [prof?.subscription_status]);

    const meals = sortMealsAscending(day?.meals || []);
    const hasData = meals.some((meal) => Array.isArray(meal?.items) && meal.items.length > 0);
    const budgetKcal = Math.round(Number(displayOptimum) || 0);
    const todayIso = HEYS.dayUtils?.todayISO?.() || HEYS.models?.todayISO?.();
    const isPastDay = !!(todayIso && date && String(date) < String(todayIso));

    const hero = buildHeroState({ eatenKcal, budgetKcal, hasData, isPastDay });
    const windowState = buildWindowState(insulinWaveData);
    const progressK = eatingProgressK(day, isPastDay);
    const totalRows = buildTotalRows(dayTot, normAbs, hasData, { isPastDay, progressK });
    const visibleTotalRows = hasData ? totalRows : totalRows.slice(0, 3);
    const streak = hasData ? buildMealStreak(meals, pIndex, budgetKcal) : null;

    const allMeals = Array.isArray(day?.meals) ? day.meals : [];
    const sheetMealIndex = sheetMeal
      ? (sheetMeal.id ? allMeals.findIndex((entry) => entry && entry.id === sheetMeal.id) : sheetMeal.index)
      : -1;
    const sheetMealData = sheetMealIndex >= 0 ? allMeals[sheetMealIndex] || null : null;

    const harmValue = hasData ? Number(dayTot?.harm) || 0 : null;
    const harmGood = harmValue == null ? true : harmValue <= HARM_THRESHOLD;
    const giValue = hasData ? Number(dayTot?.gi) || 0 : null;

    const waterCurrent = Math.round(Number(waterMl ?? day?.water) || 0);
    const waterTarget = Math.round(Number(waterGoal) || 0);

    const toggleChip = React.useCallback((chip) => {
      const next = !readChipState(null)[chip.key];
      Promise.resolve(writeChipState(chip, next)).then((applied) => {
        if (applied !== false) setChipState(readChipState(null));
      });
      haptic?.('light');
    }, [haptic]);

    // Порядок чип-зависимых блоков задан контрактом и от порядка чипов не
    // зависит: выключенный чип убирает блок, порядок остальных не меняется.
    const openMorningCheckin = React.useCallback(() => {
      const ui = HEYS.ui;
      if (ui && typeof ui.openMorningCheckin === 'function') {
        ui.openMorningCheckin(date);
      } else if (HEYS.MorningCheckin && typeof HEYS.MorningCheckin.open === 'function') {
        HEYS.MorningCheckin.open({ date });
      }
      haptic?.('light');
    }, [date, haptic]);

    const optionalBlocks = [
      chipState.mealsTimeline && renderMealsTimelineBlock(React, insulinWaveData, day),
      chipState.hunger && renderHungerBlock(React, day, date, openMorningCheckin),
      chipState.cycle && isCycleNutritionAvailable(prof) && renderCycleBlock(React, {
        day, date, prof, isReadOnly, haptic, eatenKcal, displayOptimum
      }),
      chipState.fiber && renderFiberBlock(React, {
        dayTot, normAbs, day, pIndex, hasData, progressK,
        expanded: fiberExpanded,
        onToggle: () => { setFiberExpanded((value) => !value); haptic?.('light'); }
      }),
      chipState.supplements && renderSupplementsBlock(React, { React, date, day, haptic }),
      chipState.refeed && renderRefeedBlock(React, { day, optimum, budgetKcal }),
      chipState.scoreRisk && renderScoreRiskBlock(React, { day, prof, dayTot, normAbs, pIndex }),
      chipState.wave && renderWaveNowBlock(React, insulinWaveData, {
        traceExpanded,
        onToggleTrace: () => { setTraceExpanded((value) => !value); haptic?.('light'); }
      })
    ].filter(Boolean);

    return React.createElement('div', {
      className: 'compact-nutrition nutrition-section nutrition-v4',
      'data-curator-target': 'nutrition',
      'data-readonly': isReadOnly ? 'true' : undefined
    },
      curatorCue && React.createElement('button', {
        type: 'button',
        className: 'ca-day-entry',
        onClick: () => {
          const api = global.HEYS && global.HEYS.CuratorActionsBanner;
          const cueDate = (curatorCue && curatorCue.date) || date;
          if (api && typeof api.openFromCue === 'function') api.openFromCue(cueDate);
          const ui = global.HEYS && global.HEYS.ui;
          if (cueDate && cueDate !== date && ui && typeof ui.setSelectedDate === 'function') {
            ui.setSelectedDate(cueDate);
          }
          haptic?.('light');
        }
      },
        React.createElement('span', { className: 'ca-day-entry__copy' },
          React.createElement('b', { className: 'ca-day-entry__title' }, curatorCue.title),
          React.createElement('span', { className: 'ca-day-entry__sub' }, curatorCue.subtitle)
        ),
        React.createElement('span', { className: 'ca-modal__chevron', 'aria-hidden': 'true' }, chevron(React, 15))
      ),

      React.createElement('div', {
        className: 'nutrition-v4-hero',
        'data-zone': hero.zone,
        'aria-label': buildHeroAriaLabel(hero)
      },
        React.createElement('div', { className: 'nutrition-v4-hero__label' }, hero.label),
        React.createElement('div', { className: 'nutrition-v4-hero__value-row' },
          React.createElement('span', { className: 'nutrition-v4-hero__value' }, hero.value),
          React.createElement('span', { className: 'nutrition-v4-hero__unit' }, 'ккал')
        ),
        React.createElement('div', { className: 'nutrition-v4-hero__track' },
          hero.fillPct > 0 ? React.createElement('i', {
            className: 'nutrition-v4-hero__fill',
            style: { width: hero.fillPct + '%' }
          }) : null,
          hero.overPct > 0 ? React.createElement('i', {
            className: 'nutrition-v4-hero__fill is-over',
            style: { width: hero.overPct + '%' }
          }) : null
        ),
        React.createElement('div', { className: 'nutrition-v4-hero__budget' },
          React.createElement('span', null, hero.left),
          React.createElement('span', { 'data-zone': hero.rightZone }, hero.right)
        )
      ),

      React.createElement('div', { className: 'nutrition-v4-window', 'data-tone': windowState.tone },
        React.createElement('span', { className: 'nutrition-v4-window__label' }, 'Окно приёмов'),
        React.createElement('span', { className: 'nutrition-v4-window__value' },
          windowState.lines.map((line, idx) => React.createElement('span', { key: idx }, line))
        )
      ),

      React.createElement('div', { className: 'nutrition-v4-diary' },
        meals.length === 0
          ? React.createElement('div', { className: 'nutrition-v4-diary__empty' }, 'Пока нет приёмов — добавьте первый')
          : meals.map((meal, idx) => {
            const totals = mealTotals(meal, pIndex);
            const items = Array.isArray(meal?.items) ? meal.items : [];
            const isEmpty = !items.length;
            const kcalText = isEmpty ? DASH : formatNumber(Number(totals.kcal) || 0);
            const time = meal?.time || '--:--';
            const title = mealTypeLabel(meal);
            const mealIndex = findMealIndexInDay(day, meal);
            const summary = mealItemSummary(meal, pIndex, 3);
            return React.createElement('div', {
              key: 'meal-row-' + idx + '-' + (meal.id || meal.time || idx),
              className: 'nutrition-v4-meal-row' + (isEmpty ? ' nutrition-v4-meal-row--empty' : ''),
              role: 'button',
              tabIndex: 0,
              'data-meal-id': meal?.id || undefined,
              'aria-label': buildMealRowAriaLabel(time, title, isEmpty, kcalText, items.length),
              onClick: () => {
                openMealSheet?.({ mealIndex, mealId: meal?.id || null, source: 'nutrition-v4-meal-row' });
                haptic?.('light');
              },
              onKeyDown: (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openMealSheet?.({ mealIndex, mealId: meal?.id || null, source: 'nutrition-v4-meal-row-key' });
              }
            },
              React.createElement('div', { className: 'nutrition-v4-meal-row__head' },
                React.createElement('span', { className: 'nutrition-v4-meal-row__title' },
                  React.createElement('span', { className: 'nutrition-v4-meal-row__num', 'aria-hidden': 'true' }, idx + 1),
                  time + ' · ' + title
                ),
                React.createElement('span', { className: 'nutrition-v4-meal-row__kcal' },
                  isEmpty ? dashNode(React) : kcalText
                )
              ),
              React.createElement('div', { className: 'nutrition-v4-meal-row__body' },
                React.createElement('div', { className: 'nutrition-v4-meal-row__items' }, summary),
                React.createElement('button', {
                  type: 'button',
                  className: 'nutrition-v4-meal-row__add',
                  'aria-label': (isEmpty ? 'Добавить продукт в ' : 'Добавить ещё продукт в ') + title,
                  'data-add-product': 'single',
                  onClick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openAddProductForMeal?.({
                      mealIndex,
                      mealId: meal?.id || null,
                      source: 'nutrition-v4-meal-row'
                    });
                    haptic?.('light');
                  }
                }, isEmpty ? '+ продукт' : '+ ещё'),
                React.createElement('span', { className: 'nutrition-v4-meal-row__chevron', 'aria-hidden': 'true' }, chevron(React, 15))
              )
            );
          })
      ),
      streak ? React.createElement('div', { className: 'nutrition-v4-streak' }, streak) : null,

      React.createElement('button', {
        type: 'button',
        className: 'nutrition-v4-cta',
        id: 'nutrition-v4-cta',
        onClick: () => {
          addMeal?.();
          haptic?.('light');
        }
      },
        React.createElement('span', null, 'Добавить приём пищи'),
        React.createElement('span', { className: 'nutrition-v4-cta__icon', 'aria-hidden': 'true' },
          svgIcon(React, { width: 17, height: 17 }, 'M12 5v14M5 12h14')
        )
      ),

      React.createElement('section', { className: 'nutrition-v4-totals' },
        React.createElement('div', { className: 'nutrition-v4-totals__title' }, 'Итоги дня'),
        visibleTotalRows.map((row) => React.createElement('div', { key: row.key, className: 'nutrition-v4-total-row' },
          React.createElement('div', { className: 'nutrition-v4-total-row__head' },
            React.createElement('b', null, row.label),
            React.createElement('span', { 'data-zone': row.zone },
              React.createElement('em', null, row.fact === DASH ? dashNode(React) : row.fact),
              ' из ',
              row.norm === DASH ? dashNode(React) : row.norm,
              ' ' + row.unit
            )
          ),
          row.hasBar ? React.createElement('div', { className: 'nutrition-v4-bar' },
            React.createElement('i', {
              className: row.barClass,
              style: { width: row.fillPct + '%' }
            }),
            row.overPct > 0 ? React.createElement('i', {
              className: row.overClass,
              style: { width: row.overPct + '%' }
            }) : null,
            row.showTick ? React.createElement('u', {
              className: 'nutrition-v4-bar__tick',
              style: { left: row.tickPct + '%' }
            }) : null
          ) : null
        ))
      ),

      // Карточка воды рисуется своим канвасом water-add.v4.dc.html; здесь она
      // вторична и показывается всегда — чипа у неё нет.
      global.HEYS?.dayWaterCard?.buildWaterCard?.({
        React,
        day: { ...(day || {}), waterMl: waterCurrent },
        prof,
        waterGoal: waterTarget,
        waterGoalBreakdown,
        waterLastDrink,
        isPastDay,
        isReadOnly,
        haptic,
        openExclusivePopup,
        addWater,
        removeWater
      }),

      React.createElement('section', { className: 'nutrition-v4-quality' },
        React.createElement('div', { className: 'nutrition-v4-totals__title' }, 'Качество еды'),
        React.createElement('div', { className: 'nutrition-v4-quality__row' },
          React.createElement('div', {
            className: 'nutrition-v4-quality__card' + (harmValue != null && harmGood ? ' is-ok' : '')
          },
            React.createElement('div', { className: 'nutrition-v4-quality__label' }, 'Вредность'),
            React.createElement('div', { className: 'nutrition-v4-quality__value' },
              React.createElement('b', null,
                harmValue == null ? dashNode(React) : formatDecimal(harmValue, 1)
              ),
              harmValue == null ? null : React.createElement('i', null, 'из 10')
            ),
            harmValue == null ? null : React.createElement('div', { className: 'nutrition-v4-quality__hint' + (!harmGood ? ' is-bad' : '') },
              harmGood
                ? React.createElement('span', { className: 'nutrition-v4-quality__check', 'aria-hidden': 'true' },
                  svgIcon(React, { width: 11, height: 11, strokeWidth: 3.5 }, 'M5 13l4 4L19 7'))
                : null,
              'порог ' + HARM_THRESHOLD + ' · ' + (harmGood ? 'в норме' : 'выше порога')
            )
          ),
          React.createElement('div', { className: 'nutrition-v4-quality__card' },
            React.createElement('div', { className: 'nutrition-v4-quality__label' }, 'Гликемический'),
            React.createElement('div', { className: 'nutrition-v4-quality__value' },
              React.createElement('b', null,
                giValue == null || giValue <= 0 ? dashNode(React) : Math.round(giValue)
              ),
              (giValue == null || giValue <= 0) ? null : React.createElement('i', null, giStepLabel(giValue))
            ),
            (giValue == null || giValue <= 0) ? null : React.createElement('div', { className: 'nutrition-v4-quality__hint' }, 'взвешен по углеводам')
          )
        )
      ),

      optionalBlocks,

      sheetMealData ? React.createElement(MealEditSheet, {
        React,
        meal: sheetMealData,
        mealIndex: sheetMealIndex,
        pIndex,
        date,
        actions: actions || {},
        insulinWaveData,
        prof,
        dayTot,
        waterMl,
        onClose: closeMealSheet
      }) : null,

      React.createElement('section', { className: 'nutrition-v4-config' },
        React.createElement('div', { className: 'nutrition-v4-config__title' }, 'Что показывать на этой вкладке'),
        React.createElement('div', { className: 'nutrition-v4-config__row' },
          listConfigChips(prof).map((chip) => {
            const on = chipState[chip.key] !== false;
            return React.createElement('button', {
              key: chip.key,
              type: 'button',
              className: 'nutrition-v4-chip' + (on ? '' : ' is-off'),
              role: 'switch',
              'aria-checked': on ? 'true' : 'false',
              'aria-label': chipAriaLabel(chip.label, on),
              onClick: () => toggleChip(chip)
            },
              on ? React.createElement('span', { className: 'nutrition-v4-chip__check', 'aria-hidden': 'true' },
                svgIcon(React, { width: 11, height: 11, strokeWidth: 3.5 }, 'M5 13l4 4L19 7')) : null,
              chip.label
            );
          })
        )
      )
    );
  }

  function renderNutritionCard(params) {
    return params.React.createElement(NutritionTabV4, params);
  }

  HEYS.dayNutrition = {
    render: renderNutritionCard,
    NutritionTabV4
  };

  HEYS.NutritionV4 = {
    CHIPS,
    CYCLE_CHIP,
    isCycleNutritionAvailable,
    listConfigChips,
    HARM_THRESHOLD,
    formatShortDate,
    formatNumber,
    formatDecimal,
    formatPercent,
    countFilledMeals,
    formatMealCountLabel,
    formatTabMetaLine,
    mealTypeLabel,
    sortMealsAscending,
    buildHeroState,
    buildWindowState,
    buildTotalRows,
    buildMealStreak,
    giStepLabel,
    kcalZoneThresholds,
    resolveEatingWindow,
    eatingProgressK,
    waterAlarmProgressK,
    totalRowDeviationZone,
    readChipState,
    writeChipState,
    buildHeroAriaLabel,
    buildMealRowAriaLabel,
    chipAriaLabel,
    formatProductCountLabel
  };

  // AppShell may mount before this lazy day bundle. Wake its header memo once
  // the formatter exists so Canvas meta is not silently absent on first load.
  try {
    global.dispatchEvent(new CustomEvent('heys:nutrition-v4-ready'));
  } catch (_) { }

})(window);
