// heys_reports_v12.js — Reports: 4-week tables + lazy Chart.js modals

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // ---------- Утилиты ----------
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function round1(x) { return Math.round((+x || 0) * 10) / 10; }
  function toNum(x) { const v = +x; return Number.isFinite(v) ? v : 0; }
  function pct(part, total) { if (!total) return 0; return Math.round((part / total) * 1000) / 10; }
  // Точная копия r1 из heys_day_v12.js для идентичных округлений
  const r1 = v => Math.round((+v || 0) * 10) / 10;

  // Функции для работы со временем сна
  function parseTime(timeStr) {
    if (!timeStr) return null;
    const m = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
    return m ? { hh: +m[1], mm: +m[2] } : null;
  }
  function sleepHours(startTime, endTime) {
    const s = parseTime(startTime), e = parseTime(endTime);
    if (!s || !e) return 0;
    let sh = s.hh + s.mm / 60, eh = e.hh + e.mm / 60;
    let d = eh - sh;
    if (d < 0) d += 24;
    return round1(d);
  }

  // ---------- Кэширование вычислений ----------
  const dayCache = new Map();
  const maxCacheSize = 200; // Увеличиваем размер кэша для хранения большего количества дней

  // Кэш для тяжелых вычислений недель
  const weekCache = new Map();
  const maxWeekCacheSize = 20;

  // Инвалидация кэша при изменении данных
  function invalidateCache(pattern) {
    const keysToDelete = [];
    for (const key of dayCache.keys()) {
      if (!pattern || key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => dayCache.delete(key));

    // Также очищаем кэш недель если изменились дни
    if (pattern) {
      weekCache.clear();
    }

    if (window.HEYS && window.HEYS.performance) {
      window.HEYS.performance.increment('cacheInvalidations');
    }
  }

  // Функция для полной очистки кэша (для отладки)
  function clearAllCache() {
    dayCache.clear();
    DEV.log('Кэш отчетов полностью очищен');
  }

  // Делаем функцию доступной глобально для отладки
  if (window.HEYS) {
    window.HEYS.clearReportsCache = clearAllCache;
    window.HEYS.debug = true; // включаем отладку
  }

  // Подписка на изменения данных дней
  function setupCacheInvalidation() {
    if (window.HEYS && window.HEYS.store && typeof window.HEYS.store.watch === 'function') {
      // Следим за изменениями дней
      const currentDate = new Date();
      for (let i = 0; i < 30; i++) {
        const date = new Date(currentDate);
        date.setDate(date.getDate() - i);
        const dateStr = fmtDate(date);

        window.HEYS.store.watch(`dayv2_${dateStr}`, () => {
          invalidateCache(dateStr);
        });
      }

      // Следим за изменениями продуктов и профиля
      window.HEYS.store.watch('products', () => {
        invalidateCache(); // Полная инвалидация при изменении продуктов
      });

      window.HEYS.store.watch('profile', () => {
        invalidateCache(); // Полная инвалидация при изменении профиля
      });

      window.HEYS.store.watch('hr_zones', () => {
        invalidateCache(); // Полная инвалидация при изменении зон
      });
    }
  }

  function getCacheKey(dateStr, products, profile, zones) {
    const productsHash = JSON.stringify(products).substring(0, 100); // Усеченный хэш для производительности
    const profileHash = JSON.stringify(profile);
    const zonesHash = JSON.stringify(zones);
    return `${dateStr}:${productsHash}:${profileHash}:${zonesHash}`;
  }

  function getCachedDay(dateStr, prodIndex, profile, zones, products) {
    // Для абсолютной синхронизации со «Статистикой дня» отключаем кэш:
    // всегда пересчитываем день из актуального объекта heys_dayv2_YYYY-MM-DD.
    return (window.HEYS && window.HEYS.performance && window.HEYS.performance.measure)
      ? window.HEYS.performance.measure('reportCalculation', () => collectDayInternal(dateStr, prodIndex, profile, zones))
      : collectDayInternal(dateStr, prodIndex, profile, zones);
  }

  // ---------- Индекс продуктов ----------
  function buildProductIndex(products) {
    const byName = new Map();
    const byId = new Map();
    (products || []).forEach(p => {
      const nm = String(p.name || p.title || '').trim().toLowerCase();
      if (nm) byName.set(nm, p);
      if (p.id != null) byId.set(String(p.id), p);
      if (p.product_id != null) byId.set(String(p.product_id), p);
    });
    return { byName, byId };
  }

  // ---------- Еда за день -> суммы ----------
  function aggregateDay(meals, prodIndex) {
    let total = { kcal: 0, carbs: 0, prot: 0, fat: 0, simple: 0, complex: 0, badFat: 0, goodFat: 0, trans: 0, fiber: 0, giSum: 0, giCnt: 0, harmSum: 0, harmCnt: 0 };
    (meals || []).forEach(m => {
      const items = (m && (m.items || m.food || m.list || m.products)) || [];
      items.forEach(it => {
        const grams = +(it.grams != null ? it.grams : it.g) || +(it.qty || 0) || +(it.weight || 0) || 0;
        let p = null;
        // Сначала ищем по названию (новый приоритет)
        const nm = String(it.name || it.title || '').trim().toLowerCase();
        if (nm) p = prodIndex.byName.get(nm);
        // Fallback на product_id/id для обратной совместимости
        if (!p && it.product_id != null) p = prodIndex.byId.get(String(it.product_id));
        if (!p && it.productId != null) p = prodIndex.byId.get(String(it.productId));
        if (!p && it.id != null && typeof it.name !== 'string') p = prodIndex.byId.get(String(it.id));
        // Fallback на inline данные
        if (!p && (it.kcal100 !== undefined || it.protein100 !== undefined)) p = it;
        if (!p || !grams) return;

        const k = grams / 100;
        const kcal100 = +p.kcal100 || 0;
        const carbs100 = +p.carbs100 || ((+p.simple100 || 0) + (+p.complex100 || 0));
        const prot100 = +p.protein100 || (+p.prot100 || 0);
        const fat100 = +p.fat100 || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
        const simple100 = +p.simple100 || 0, complex100 = +p.complex100 || 0;
        const bad100 = +p.badFat100 || 0, good100 = +p.goodFat100 || 0, trans100 = +p.trans100 || 0;
        const fiber100 = +p.fiber100 || 0; const gi = +p.gi || 0; const harm = +p.harmScore || 0;

        total.kcal += kcal100 * k; total.carbs += carbs100 * k; total.prot += prot100 * k; total.fat += fat100 * k;
        total.simple += simple100 * k; total.complex += complex100 * k;
        total.badFat += bad100 * k; total.goodFat += good100 * k; total.trans += trans100 * k;
        total.fiber += fiber100 * k;
        if (gi > 0) { total.giSum += gi; total.giCnt++; }
        if (harm > 0) { total.harmSum += harm; total.harmCnt++; }
      });
    });
    return total;
  }

  // ---------- Чтение meals за дату (делегируем в dayUtils для учёта ночной логики) ----------
  function loadMealsForDate(dateStr) {
    // Используем dayUtils если доступен (поддерживает ночные приёмы 00:00-02:59)
    if (global.HEYS && global.HEYS.dayUtils && global.HEYS.dayUtils.loadMealsForDate) {
      return global.HEYS.dayUtils.loadMealsForDate(dateStr);
    }

    // Fallback: старая логика
    const ls = global.localStorage;

    // Проверяем с учетом текущего клиента
    const clientId = window.HEYS && window.HEYS.currentClientId;
    const keys = [
      clientId ? `heys_${clientId}_dayv2_${dateStr}` : null,
      'heys_dayv2_' + dateStr,   // объект дня с meals[]
      'heys_day_' + dateStr,     // старый формат дня
      'day_' + dateStr + '_meals', // массив приёмов
      'meals_' + dateStr,        // массив приёмов
      'food_' + dateStr          // массив приёмов
    ].filter(Boolean);

    for (const k of keys) {
      try {
        const raw = ls.getItem(k);
        if (!raw) continue;
        const v = JSON.parse(raw);
        if (v && Array.isArray(v.meals)) return v.meals;
        if (Array.isArray(v)) return v;
      } catch (e) { }
    }
    return [];
  }

  // ---------- Энергозатраты (как во «Дне») ----------
  function kcalPerMinForMET(met, w) { return Math.round(((+met || 0) * (+w || 0) * 0.0175) * 10) / 10; }
  function kcalHousehold(minutes, w) { return Math.round(((+minutes || 0) * kcalPerMinForMET(2.5, w)) * 10) / 10; }
  // Точная копия stepsKcal из heys_day_v12.js
  function kcalForSteps_V2(steps, w, sex, len) { const coef = (sex === 'female' ? 0.5 : 0.57); const km = (+steps || 0) * (len || 0.7) / 1000; return Math.round(coef * (+w || 0) * km * 10) / 10; }
  function kcalForSteps(steps, heightCm, w, gender) {
    const st = Math.max(0, toNum(steps)); const h = Math.max(0, toNum(heightCm));
    const stepMeters = (h * 0.415) / 100; const distKm = st * stepMeters / 1000;
    const coef = (String(gender || '').toLowerCase().startsWith('ж')) ? 0.5 : 0.57;
    return distKm * toNum(w) * coef;
  }
  function calcBMR(gender, w, h, a) {
    return (String(gender || '').toLowerCase().startsWith('ж'))
      ? (10 * toNum(w) + 6.25 * toNum(h) - 5 * toNum(a) - 161)
      : (10 * toNum(w) + 6.25 * toNum(h) - 5 * toNum(a) + 5);
  }

  // ---------- Сбор по дню (внутренняя функция) ----------
  function collectDayInternal(dateStr, prodIndex, profile, zones) {
    // Жёстко синхронизируемся с тем же самым объектом дня, который использует вкладка «Статистика дня»
    // 1) всегда читаем day из того же ключа, что и DayTab: heys_dayv2_YYYY-MM-DD
    const U = (global.HEYS && HEYS.utils) || { lsGet: (k, d) => d };
    const dayKey = 'heys_dayv2_' + dateStr;
    const storedDay = U.lsGet(dayKey, null);

    // 2) Если дня нет, создаём минимальный объект так же, как это делает DayTab (ensureDay с пустыми полями)
    const baseDay = storedDay && storedDay.date ? storedDay : {
      date: dateStr,
      meals: [],
      trainings: [{ z: [0, 0, 0, 0] }, { z: [0, 0, 0, 0] }],
      steps: 0,
      householdMin: 0,
      weightMorning: profile.weight,
      sleepStart: '',
      sleepEnd: '',
      sleepQuality: '',
      sleepNote: '',
      dayScore: '',
      moodAvg: '',
      wellbeingAvg: '',
      stressAvg: '',
      dayComment: ''
    };

    const dayObj = baseDay;

    // 3) Еду агрегируем только из dayObj.meals (а не из отдельных старых ключей),
    //    чтобы отчётность в точности повторяла суммарные калории из вкладки дня
    const meals = (dayObj && Array.isArray(dayObj.meals)) ? dayObj.meals : [];
    const totals = aggregateDay(meals, prodIndex);

    // Убеждаемся, что deficitPct есть (для старых дней)
    if (dayObj.deficitPct == null) {
      dayObj.deficitPct = -14; // значение по умолчанию
    }

    // =========================================================================
    // 🔬 TDEE v1.1.0: Консолидированный расчёт через единый модуль HEYS.TDEE
    // =========================================================================

    const tdeeResult = HEYS.TDEE?.calculate?.(dayObj, profile, { lsGet: U.lsGet }) || {};
    const {
      bmr = 0,
      actTotal = 0,
      trainingsKcal = 0,
      train1k = 0,
      train2k = 0,
      stepsKcal: stepsK = 0,
      householdKcal: householdK = 0,
      tefKcal = 0,
      baseExpenditure = 0,
      tdee: dailyExp = 0,
      weight = profile.weight || 70
    } = tdeeResult;

    // Диагностический лог для отладки расхождений между Днём и Отчётностью
    // console.* запрещён — оставляем только флаг (можно подключить аналитический трекер при необходимости)

    const energy = totals.prot * 4 + totals.carbs * 4 + totals.fat * 9;
    const carbsPct = pct(totals.carbs * 4, energy);
    const protPct = pct(totals.prot * 4, energy);
    const fatPct = pct(totals.fat * 9, energy);
    const simplePct = pct(totals.simple, totals.carbs);
    const complexPct = pct(totals.complex, totals.carbs);
    const giAvg = totals.giCnt ? Math.round(totals.giSum / totals.giCnt) : 0;
    const harmAvg = totals.harmCnt ? Math.round((totals.harmSum / totals.harmCnt) * 10) / 10 : 0;

    // Подсчёт приёмов с хотя бы одним продуктом
    const mealsCount = (meals || []).filter(m => { const its = (m && (m.items || m.food || m.list || m.products)) || []; return its.length > 0; }).length;
    // Получаем целевой дефицит из дня (если есть и не пустая строка) или из профиля (по умолчанию)
    const dayTargetDef = (dayObj.deficitPct !== '' && dayObj.deficitPct != null) ? +dayObj.deficitPct : +(profile.deficitPctTarget) || 0;
    // Убрано избыточное логирование дефицита калорий
    // sleepComment в дневнике хранится как sleepNote (ранее) — поддержим оба поля
    const calculatedSleepHours = sleepHours(dayObj.sleepStart, dayObj.sleepEnd);
    return {
      dstr: dateStr, totals, bmr, activitySubtotal: actTotal, activitiesKcal: train1k + train2k,
      tefKcal, baseExpenditure, dailyExp, weight: weight, // 🆕 v3.9.1: TEF и baseExpenditure
      carbsPct, protPct, fatPct, simplePct, complexPct, giAvg, harmAvg,
      mealsCount, dayTargetDef, // добавляем целевой дефицит дня
      sleepHours: calculatedSleepHours || dayObj.sleepHours || 0, sleepQuality: dayObj.sleepQuality, sleepComment: (dayObj.sleepComment != null ? dayObj.sleepComment : dayObj.sleepNote),
      stressAvg: dayObj.stressAvg, wellbeingAvg: dayObj.wellbeingAvg, moodAvg: dayObj.moodAvg, dayComment: dayObj.dayComment
    };
  }

  // ---------- Кэшированная функция сбора данных по дню ----------
  function collectDay(dateStr, prodIndex, profile, zones, products) {
    return getCachedDay(dateStr, prodIndex, profile, zones, products);
  }

  // ---------- Табличные компоненты (расширенный список колонок) ----------
  const HEADERS = [
    'дата', 'углеводы', 'простыеУ', 'сложныеУ', 'белки', 'жиры', 'вредныеЖ', 'полезнЖ', 'супервредЖ', 'клетчатка', 'ГИ', 'вреднсть', '',
    'ВЕС', 'Общая\nактивность', 'Трен', 'Общие\nзатраты', 'Целевой\nдефицит%', 'Нужно\nсъесть', 'съедено\nза день', 'Факт\nдефицит\n%', 'Дефицит\nккал', '',
    'Приёмов', 'Сон\nчасы', 'Сон\nкач', 'Сон\nкоммент', 'Стресс', 'Самоч', 'Настроение', 'День\nкоммент'
  ];
  function enrichDay(row, profile) {
    // Добавляем вычисляемые поля если отсутствуют (обратная совместимость с кэшем)
    // Используем целевой дефицит из дня, если есть, иначе из профиля
    const targetDef = (row.dayTargetDef != null ? row.dayTargetDef : +(profile.deficitPctTarget || 0));
    if (row.optimum == null) { row.optimum = row.dailyExp ? Math.round(row.dailyExp * (1 + targetDef / 100)) : 0; }
    if (row.defKcal == null) { row.defKcal = row.dailyExp ? Math.round((row.totals && row.totals.kcal || 0) - row.dailyExp) : 0; } // съедено - затраты (отрицательно = дефицит)
    if (row.defPct == null) { row.defPct = row.dailyExp ? Math.round(row.defKcal / row.dailyExp * 100) : 0; }

    // Добавляем фактический дефицит/профицит в процентах
    if (row.factDefPct == null) {
      const eatenKcal = (row.totals && row.totals.kcal || 0);
      row.factDefPct = row.dailyExp ? Math.round(((eatenKcal - row.dailyExp) / row.dailyExp) * 100) : 0;
    }

    // Добавляем текстовое представление (фактический процент)
    if (row.factDefText == null) {
      const fact = row.factDefPct || 0;
      row.factDefText = (fact > 0 ? '+' : '') + fact + '%';
    }

    return row;
  }
  const ROW_H = '15px';
  const SUM_H = '20px';
  const DEV_H = '15px';
  function RowView({ row, profile }) {
    const t = row.totals; const baseStyle = { height: ROW_H, lineHeight: ROW_H, padding: '0 2px', textAlign: 'center' };
    const gray = '#6b7280'; // Changed color for empty values
    const U = (global.HEYS && HEYS.utils) || { lsGet: (k, d) => d };
    const normsPerc = U.lsGet('heys_norms', {}) || {};

    // Проверяем, заведен ли день куратором (вес отличается от базового)
    const baseWeight = +(profile.weight || 70);
    const dayWeight = +(row.weight || baseWeight);
    const isDayManaged = dayWeight !== baseWeight;

    // Функция расчета нормативов для данной строки
    function computeNorms() {
      const K = +row.optimum || 0; // целевая ккал для этого дня
      const carbPct = +normsPerc.carbsPct || 0;
      const protPct = +normsPerc.proteinPct || 0;
      const fatPct = Math.max(0, 100 - carbPct - protPct);
      const carbs = K ? (K * carbPct / 100) / 4 : 0;
      const prot = K ? (K * protPct / 100) / 4 : 0;
      const fat = K ? (K * fatPct / 100) / 8 : 0;
      const simplePct = +normsPerc.simpleCarbPct || 0;
      const simple = carbs * simplePct / 100;
      const complex = Math.max(0, carbs - simple);
      const badPct = +normsPerc.badFatPct || 0;
      const transPct = +normsPerc.superbadFatPct || 0;
      const bad = fat * badPct / 100;
      const trans = fat * transPct / 100;
      const good = Math.max(0, fat - bad - trans);
      const fiberPct = +normsPerc.fiberPct || 0;
      const fiber = carbs * fiberPct / 100;
      const gi = +normsPerc.giPct || 0;
      const harm = +normsPerc.harmPct || 0;
      return { kcal: K, carbs, simple, complex, prot, fat, badFat: bad, goodFat: good, trans, fiber, gi, harm };
    }
    const norms = computeNorms();

    // Функция определения цвета для питательных веществ
    function getColor(value, key, norms) {
      const f = +value || 0; const n = +norms[key] || 0;
      if (!n) return null; // нет нормы - нет цвета
      const over = f > n, under = f < n;

      if (['badFat', 'trans'].includes(key)) {
        if (under) return '#059669'; // меньше плохих жиров = зеленый
        else if (over) return '#dc2626'; // больше плохих жиров = красный
      }
      else if (key === 'simple') {
        if (under) return '#059669'; // меньше простых углеводов = зеленый
        else if (over) return '#dc2626'; // больше простых углеводов = красный
      }
      else if (key === 'complex') {
        if (over) return '#059669'; // больше сложных углеводов = зеленый
        else if (under) return '#dc2626'; // меньше сложных углеводов = красный
      }
      else if (key === 'fiber') {
        if (over) return '#059669'; // больше клетчатки = зеленый
        else if (under) return '#dc2626'; // меньше клетчатки = красный
      }
      else if (key === 'kcal') {
        if (over) return '#dc2626'; // превышение калорий = красный
      }
      else if (key === 'prot') {
        if (over) return '#059669'; // больше белка = зеленый
      }
      else if (key === 'carbs' || key === 'fat') {
        if (over) return '#dc2626'; // превышение углеводов/жиров = красный
      }
      else if (key === 'goodFat') {
        if (over) return '#059669'; // больше хороших жиров = зеленый
        else if (under) return '#dc2626'; // меньше хороших жиров = красный
      }
      else if (key === 'gi' || key === 'harm') {
        if (over) return '#dc2626'; // высокий ГИ/вредность = красный
        else if (under) return '#059669'; // низкий ГИ/вредность = зеленый
      }
      return null;
    }

    function fmt(v, optional, rawEmpty, forceEmpty, isWeight) {
      if (rawEmpty) return '';
      if (forceEmpty) return React.createElement('span', { style: { color: '#c4c6d8', fontSize: '8px' } }, '—');
      if (v == null || v === 0) return React.createElement('span', { style: { color: '#c4c6d8', fontSize: '8px' } }, '—');
      if (typeof v === 'number') {
        if (optional && (!v || v === 0)) return React.createElement('span', { style: { color: '#c4c6d8', fontSize: '8px' } }, '—');
        // Вес с одним десятичным знаком
        if (isWeight) return Math.round(v * 10) / 10;
        return Math.round(v);
      }
      const s = String(v).trim();
      if (!s) return React.createElement('span', { style: { color: '#c4c6d8', fontSize: '8px' } }, '—');
      return s.length > 40 ? s.slice(0, 40) + '…' : s;
    }

    function td(v, k, opt, raw, colorKey) {
      let style = baseStyle;

      // Серый цвет для колонок активности и тренировок
      if (k === 'act' || k === 'train') {
        style = { ...style, color: '#9ca3af' };
      }

      // Цвет для колонок дефицита: зеленый если < 0, красный если > 0
      if (k === 'factdef' || k === 'defk') {
        const numValue = typeof v === 'string' ? parseFloat(v.replace(/[+%]/g, '')) : +v;
        if (numValue < 0) {
          style = { ...style, color: '#059669', fontWeight: 600 }; // зеленый для дефицита
        } else if (numValue > 0) {
          style = { ...style, color: '#dc2626', fontWeight: 600 }; // красный для профицита
        }
      }

      // Жирные правые границы для разделения секций таблицы
      if (k === 'train' || k === 'opt') {
        style = { ...style, borderRight: '2px solid #4b5563' };
      }

      if (raw) {
        style = { ...style, borderTop: 'none', borderBottom: 'none', background: 'transparent' };
      } else if (colorKey && !opt && isDayManaged) { // цвет только если день заведен куратором
        const color = getColor(v, colorKey, norms);
        if (color) {
          style = { ...style, color, fontWeight: 600 };
        }
      }

      // Для даты всегда показываем значение, для остальных - проверяем isDayManaged
      const forceEmpty = !isDayManaged && k !== 'd';
      // Определяем, является ли колонка весом
      const isWeight = k === 'w';
      return React.createElement('td', { key: k, style }, fmt(v, opt, raw, forceEmpty, isWeight));
    }

    const cells = [
      td(row.dstr, 'd'), td(t.carbs, 'c', false, false, 'carbs'), td(t.simple, 'cs', false, false, 'simple'), td(t.complex, 'cc', false, false, 'complex'),
      td(t.prot, 'p', false, false, 'prot'), td(t.fat, 'f', false, false, 'fat'), td(t.badFat, 'bf', false, false, 'badFat'), td(t.goodFat, 'gf', false, false, 'goodFat'), td(t.trans, 'tr', false, false, 'trans'), td(t.fiber, 'fi', false, false, 'fiber'), td(row.giAvg, 'gi', false, false, 'gi'), td(row.harmAvg, 'ha', false, false, 'harm'), td('', 'emp1', null, true),
      td(Math.round((row.weight || 0) * 10) / 10, 'w', true), td(row.activitySubtotal, 'act', true), td(row.activitiesKcal, 'train', true), td(row.dailyExp, 'exp', true), td(row.dayTargetDef, 'targetdef', true), td(row.optimum, 'opt', true), td(t.kcal, 'k', false, false, 'kcal'), td(row.factDefText, 'factdef', true), td(row.defKcal, 'defk', true), td('', 'emp2', null, true),
      td(row.mealsCount, 'mc', true), td(row.sleepHours, 'slh', true), td(row.sleepQuality, 'slq', true), td(row.sleepComment, 'slc', true), td(row.stressAvg, 'st', true), td(row.wellbeingAvg, 'wb', true), td(row.moodAvg, 'md', true), td(row.dayComment, 'dc', true)
    ];
    return React.createElement('tr', { style: { height: ROW_H } }, cells);
  }
  function computeAveragesRows(rows, profile) {
    const baseWeight = +(profile.weight || 70);
    // Фильтруем только дни, заведенные куратором (вес отличается от базового) и с данными о еде
    const valid = rows.filter(r => {
      if (!r || !r.totals || r.totals.kcal <= 0) return false;
      const dayWeight = +(r.weight || baseWeight);
      return dayWeight !== baseWeight; // день заведен куратором
    });
    if (!valid.length) return { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0, weight: 0, activity: 0, train: 0, exp: 0, targetDef: 0, optimum: 0, factDefPct: 0, defKcal: 0, meals: 0, sleepHours: 0, sleepQuality: 0, stressAvg: 0, wellbeingAvg: 0, moodAvg: 0 };
    const n = valid.length; let sk = 0, sc = 0, ss = 0, scc = 0, sp = 0, sf = 0, sb = 0, sg = 0, st = 0, sfbr = 0, sgi = 0, cgi = 0, sh = 0, ch = 0, sw = 0, sa = 0, strain = 0, sexp = 0, starget = 0, sopt = 0, sfactdef = 0, sdk = 0, smc = 0, ssh = 0, cssh = 0, ssq = 0, cssq = 0, sstr = 0, csstr = 0, swb = 0, cswb = 0, smd = 0, csmd = 0;
    valid.forEach(r => { const t = r.totals; sk += t.kcal; sc += t.carbs; ss += t.simple; scc += t.complex; sp += t.prot; sf += t.fat; sb += t.badFat; sg += t.goodFat; st += t.trans; sfbr += t.fiber; if (t.giCnt > 0) { sgi += r.giAvg; cgi++; } if (t.harmCnt > 0) { sh += r.harmAvg; ch++; } sw += r.weight || 0; sa += r.activitySubtotal || 0; strain += r.activitiesKcal || 0; sexp += r.dailyExp || 0; starget += (r.dayTargetDef || 0); sopt += r.optimum || 0; sfactdef += (r.factDefPct || 0); sdk += r.defKcal || 0; smc += r.mealsCount || 0; if (r.sleepHours != null && r.sleepHours > 0) { ssh += r.sleepHours; cssh++; } if (r.sleepQuality != null && r.sleepQuality > 0) { ssq += r.sleepQuality; cssq++; } if (r.stressAvg != null && r.stressAvg > 0) { sstr += r.stressAvg; csstr++; } if (r.wellbeingAvg != null && r.wellbeingAvg > 0) { swb += r.wellbeingAvg; cswb++; } if (r.moodAvg != null && r.moodAvg > 0) { smd += r.moodAvg; csmd++; } });
    return { kcal: Math.round(sk / n), carbs: Math.round(sc / n), simple: Math.round(ss / n), complex: Math.round(scc / n), prot: Math.round(sp / n), fat: Math.round(sf / n), bad: Math.round(sb / n), good: Math.round(sg / n), trans: Math.round(st / n), fiber: Math.round(sfbr / n), gi: cgi ? Math.round(sgi / cgi) : 0, harm: ch ? Math.round(sh / ch) : 0, weight: Math.round((sw / n) * 10) / 10, activity: Math.round(sa / n), train: Math.round(strain / n), exp: Math.round(sexp / n), targetDef: Math.round(starget / n), optimum: Math.round(sopt / n), factDefPct: Math.round(sfactdef / n), defKcal: Math.round(sdk / n), meals: Math.round(smc / n), sleepHours: cssh ? round1(ssh / cssh) : 0, sleepQuality: cssq ? round1(ssq / cssq) : 0, stressAvg: csstr ? round1(sstr / csstr) : 0, wellbeingAvg: cswb ? round1(swb / cswb) : 0, moodAvg: csmd ? round1(smd / csmd) : 0 };
  }
  function AvgRow({ avg, label, highlight }) {
    const hStyle = { height: SUM_H, lineHeight: SUM_H, padding: '0 4px', textAlign: 'center', fontWeight: 600, fontSize: '100%' };
    const U = (global.HEYS && HEYS.utils) || { lsGet: (k, d) => d };
    const normsPerc = U.lsGet('heys_norms', {}) || {};

    // Функция расчета нормативов для средних значений
    function computeNorms() {
      const K = +avg.optimum || 0; // средняя целевая ккал
      const carbPct = +normsPerc.carbsPct || 0;
      const protPct = +normsPerc.proteinPct || 0;
      const fatPct = Math.max(0, 100 - carbPct - protPct);
      const carbs = K ? (K * carbPct / 100) / 4 : 0;
      const prot = K ? (K * protPct / 100) / 4 : 0;
      const fat = K ? (K * fatPct / 100) / 8 : 0;
      const simplePct = +normsPerc.simpleCarbPct || 0;
      const simple = carbs * simplePct / 100;
      const complex = Math.max(0, carbs - simple);
      const badPct = +normsPerc.badFatPct || 0;
      const transPct = +normsPerc.superbadFatPct || 0;
      const bad = fat * badPct / 100;
      const trans = fat * transPct / 100;
      const good = Math.max(0, fat - bad - trans);
      const fiberPct = +normsPerc.fiberPct || 0;
      const fiber = carbs * fiberPct / 100;
      const gi = +normsPerc.giPct || 0;
      const harm = +normsPerc.harmPct || 0;
      return { kcal: K, carbs, simple, complex, prot, fat, bad, good, trans, fiber, gi, harm };
    }
    const norms = computeNorms();

    // Функция определения цвета для питательных веществ
    function getColor(value, key, norms) {
      const f = +value || 0; const n = +norms[key] || 0;
      if (!n) return null; // нет нормы - нет цвета
      const over = f > n, under = f < n;

      if (['bad', 'trans'].includes(key)) {
        if (under) return '#059669'; // меньше плохих жиров = зеленый
        else if (over) return '#dc2626'; // больше плохих жиров = красный
      }
      else if (key === 'simple') {
        if (under) return '#059669'; // меньше простых углеводов = зеленый
        else if (over) return '#dc2626'; // больше простых углеводов = красный
      }
      else if (key === 'complex') {
        if (over) return '#059669'; // больше сложных углеводов = зеленый
        else if (under) return '#dc2626'; // меньше сложных углеводов = красный
      }
      else if (key === 'fiber') {
        if (over) return '#059669'; // больше клетчатки = зеленый
        else if (under) return '#dc2626'; // меньше клетчатки = красный
      }
      else if (key === 'kcal') {
        if (over) return '#dc2626'; // превышение калорий = красный
      }
      else if (key === 'prot') {
        if (over) return '#059669'; // больше белка = зеленый
      }
      else if (key === 'carbs' || key === 'fat') {
        if (over) return '#dc2626'; // превышение углеводов/жиров = красный
      }
      else if (key === 'good') {
        if (over) return '#059669'; // больше хороших жиров = зеленый
        else if (under) return '#dc2626'; // меньше хороших жиров = красный
      }
      else if (key === 'gi' || key === 'harm') {
        if (over) return '#dc2626'; // высокий ГИ/вредность = красный
        else if (under) return '#059669'; // низкий ГИ/вредность = зеленый
      }
      return null;
    }

    function td(v, k, raw, colorKey) {
      let st = raw ? { ...hStyle, borderTop: 'none', borderBottom: 'none', background: 'transparent' } : hStyle;

      // Серый цвет для колонок активности и тренировок в средних значениях
      if (k === 'aa' || k === 'atr') {
        st = { ...st, color: '#9ca3af' };
      }

      // Жирные правые границы для разделения секций таблицы
      if (k === 'atr' || k === 'ao') {
        st = { ...st, borderRight: '2px solid #4b5563' };
      }

      if (!raw && colorKey) {
        const color = getColor(v, colorKey, norms);
        if (color) {
          st = { ...st, color };
        }
      }
      let displayValue = raw ? '' : (v == null || v === 0 ? React.createElement('span', { style: { color: '#c4c6d8', fontSize: '8px' } }, '—') : v);
      return React.createElement('td', { key: k, style: st }, displayValue);
    }

    const cells = [
      td(label || 'сред', 'l'), td(avg.carbs, 'ac', false, 'carbs'), td(avg.simple, 'as', false, 'simple'), td(avg.complex, 'aco', false, 'complex'), td(avg.prot, 'ap', false, 'prot'), td(avg.fat, 'af', false, 'fat'), td(avg.bad, 'ab', false, 'bad'), td(avg.good, 'ag', false, 'good'), td(avg.trans, 'at', false, 'trans'), td(avg.fiber, 'afi', false, 'fiber'), td(avg.gi, 'agi', false, 'gi'), td(avg.harm, 'ah', false, 'harm'), td('', 'aemp1', true),
      td(Math.round((avg.weight || 0) * 10) / 10, 'aw'), td(avg.activity, 'aa'), td(avg.train, 'atr'), td(avg.exp, 'aexp'), td(avg.targetDef, 'atarget'), td(avg.optimum, 'aopt'), td(avg.kcal, 'ak', false, 'kcal'), td((avg.factDefPct > 0 ? '+' : '') + avg.factDefPct + '%', 'afactdef'), td(avg.defKcal, 'adk'), td('', 'aemp2', true), td(avg.meals, 'amc'), td(avg.sleepHours || 0, 'asl1'), td(avg.sleepQuality || 0, 'asl2'), td('', 'asl3', true), td(avg.stressAvg || 0, 'astr'), td(avg.wellbeingAvg || 0, 'awb'), td(avg.moodAvg || 0, 'amd'), td('', 'adc', true)
    ];
    return React.createElement('tr', { className: 'tr-sum' + (highlight ? ' tr-sum-main' : ''), style: { height: SUM_H } }, cells);
  }
  function WeekTable({ title, rows, tone }) {
    const U = (global.HEYS && HEYS.utils) || { lsGet: (k, d) => d };
    const profile = U.lsGet('heys_profile', {});
    rows.forEach(r => enrichDay(r, profile));
    const avg = computeAveragesRows(rows, profile);
    const normsPerc = U.lsGet('heys_norms', {}) || {};
    const tdeeAvg = rows.length ? Math.round(rows.reduce((s, r) => s + (r.dailyExp || 0), 0) / rows.length) : 0;
    // Вычисляем средний целевой дефицит из дней, а не из профиля
    const validRows = rows.filter(r => r.dayTargetDef != null);
    const targetDef = validRows.length > 0 ?
      validRows.reduce((s, r) => s + r.dayTargetDef, 0) / validRows.length :
      +(profile.deficitPctTarget || 0); // fallback к профилю
    const optimum = tdeeAvg ? Math.round(tdeeAvg * (1 + targetDef / 100)) : 0;
    const carbPct = +normsPerc.carbsPct || 0; const protPct = +normsPerc.proteinPct || 0; const fatPct = Math.max(0, 100 - carbPct - protPct);
    const carbs = optimum ? (optimum * carbPct / 100) / 4 : 0; const prot = optimum ? (optimum * protPct / 100) / 4 : 0; const fat = optimum ? (optimum * fatPct / 100) / 8 : 0;
    const simplePct = +normsPerc.simpleCarbPct || 0; const simple = carbs * simplePct / 100; const complex = Math.max(0, carbs - simple);
    const badPct = +normsPerc.badFatPct || 0; const transPct = +normsPerc.superbadFatPct || 0; const bad = fat * badPct / 100; const trans = fat * transPct / 100; const good = Math.max(0, fat - bad - trans);
    const fiberPct = +normsPerc.fiberPct || 0; const fiber = carbs * fiberPct / 100; const giN = +normsPerc.giPct || 0; const harmN = +normsPerc.harmPct || 0;
    // Норма сна из профиля пользователя
    const sleepHoursNorm = +(profile.sleepHours || 8); // норма сна из профиля
    function td(v, k) {
      const hStyle = { height: SUM_H, lineHeight: SUM_H, padding: '0 4px', textAlign: 'center', fontWeight: 400, fontSize: '100%' };
      // Серый цвет для колонок активности и тренировок в строках норм
      let style = hStyle;
      if (k === 'n_act' || k === 'n_train' || k === 'd_act' || k === 'd_train') {
        style = { ...style, color: '#9ca3af' };
      }
      // Жирные правые границы для разделения секций таблицы
      if (k === 'n_train' || k === 'd_train' || k === 'n_opt' || k === 'd_opt') {
        style = { ...style, borderRight: '2px solid #4b5563' };
      }
      // Для веса показываем с десятичной точностью
      if (k === 'n_weight' || k === 'd_weight') {
        if (typeof v === 'number') v = Math.round(v * 10) / 10;
      } else if (typeof v === 'number') {
        v = Math.round(v);
      }
      const displayValue = v == null || v === 0 ? React.createElement('span', { style: { color: '#c4c6d8', fontSize: '8px' } }, '—') : v;
      // Для пустых ячеек убираем белый фон и границы
      if (k && (k.startsWith('d_emp') || k === 'd_emp1' || k === 'd_emp2' ||
        k.startsWith('n_emp') || k === 'n_emp1' || k === 'n_emp2' ||
        k.startsWith('aemp') || k === 'aemp1' || k === 'aemp2' || k === 'asl3' || k === 'adc' ||
        (k.startsWith('n_') && v === '') ||
        (k.startsWith('d_') && v === ''))) {
        style = { ...style, background: 'transparent', border: 'none' };
      }
      return React.createElement('td', { key: k, style }, displayValue);
    }
    function devCell(f, n, key) {
      // Для пустых ячеек в строках отклонений используем прозрачный фон
      if (!n) return React.createElement('td', { key, style: { height: DEV_H, lineHeight: DEV_H, textAlign: 'center', background: 'transparent' } }, '');
      // Для вредности показываем абсолютное отклонение
      if (key === 'd_harm' || key === 'md_harm') {
        const absDiff = Math.round(f - n);
        const color = absDiff > 0 ? '#dc2626' : (absDiff < 0 ? '#059669' : '#e5e7eb');
        let style = { color, fontWeight: 400, height: DEV_H, lineHeight: DEV_H, padding: '0 2px', textAlign: 'center', fontSize: '90%' };
        // Жирные правые границы для разделения секций таблицы
        if (key === 'd_train' || key === 'd_opt') {
          style = { ...style, borderRight: '2px solid #4b5563' };
        }
        return React.createElement('td', { key, style }, (absDiff > 0 ? '+' : '') + absDiff);
      }
      // Для всех остальных показываем процентное отклонение
      const diff = Math.round(((f - n) / n) * 100);
      const color = diff > 0 ? '#dc2626' : (diff < 0 ? '#059669' : '#e5e7eb');
      // Используем DEV_H для меньшей высоты строк отклонений
      let style = { color, fontWeight: 400, height: DEV_H, lineHeight: DEV_H, padding: '0 2px', textAlign: 'center', fontSize: '90%' };
      // Серый цвет для колонок активности и тренировок в строках отклонений
      if (key === 'd_act' || key === 'd_train') {
        style = { ...style, color: '#9ca3af' };
      }
      // Жирные правые границы для разделения секций таблицы
      if (key === 'd_train' || key === 'd_opt') {
        style = { ...style, borderRight: '2px solid #4b5563' };
      }
      return React.createElement('td', { key, style }, (diff > 0 ? '+' : '') + diff + '%');
    }

    const normRowCells = [
      // Питательные вещества (13 колонок)
      td('норма', 'n0'), td(carbs, 'n_carbs'), td(simple, 'n_simple'), td(complex, 'n_complex'), td(prot, 'n_prot'), td(fat, 'n_fat'), td(bad, 'n_bad'), td(good, 'n_good'), td(trans, 'n_trans'), td(fiber, 'n_fiber'), td(giN, 'n_gi'), td(harmN, 'n_harm'), td('', 'n_emp1'),
      // Физ показатели (10 колонок) - убираем значения для "нужно съесть" и "съедено за день"
      td('', 'n_weight'), td('', 'n_act'), td('', 'n_train'), td('', 'n_exp'), td('', 'n_targetdef'), td('', 'n_opt'), td('', 'n_kcal'), td('', 'n_factdef'), td('', 'n_defkcal'), td('', 'n_emp2'),
      // Остальное (9 колонок) - добавляем нормы для сна и оценок
      td('', 'n_meals'), td(sleepHoursNorm, 'n_slh'), td('', 'n_slq'), td('', 'n_slc'), td('', 'n_stress'), td('', 'n_well'), td('', 'n_mood'), td('', 'n_daycom')
    ];
    const normRow = React.createElement('tr', { className: 'tr-norm', style: { height: SUM_H } }, normRowCells);

    const devRowCells = [
      // Питательные вещества (13 колонок)
      td('откл', 'd0'), devCell(avg.carbs, carbs, 'd_carbs'), devCell(avg.simple, simple, 'd_simple'), devCell(avg.complex, complex, 'd_complex'), devCell(avg.prot, prot, 'd_prot'), devCell(avg.fat, fat, 'd_fat'), devCell(avg.bad, bad, 'd_bad'), devCell(avg.good, good, 'd_good'), devCell(avg.trans, trans, 'd_trans'), devCell(avg.fiber, fiber, 'd_fiber'), devCell(avg.gi, giN, 'd_gi'), devCell(avg.harm, harmN, 'd_harm'), td('', 'd_emp1'),
      // Физ показатели (10 колонок) - убираем значения для "нужно съесть" и "съедено за день"
      td('', 'd_weight'), td('', 'd_act'), td('', 'd_train'), td('', 'd_exp'), td('', 'd_targetdef'), td('', 'd_opt'), td('', 'd_kcal'), td('', 'd_factdef'), td('', 'd_defkcal'), td('', 'd_emp2'),
      // Остальное (9 колонок) - добавляем отклонения для сна и оценок
      td('', 'd_meals'), devCell(avg.sleepHours, sleepHoursNorm, 'd_slh'), td('', 'd_slq'), td('', 'd_slc'), td('', 'd_stress'), td('', 'd_well'), td('', 'd_mood'), td('', 'd_daycom')
    ];
    const devRow = React.createElement('tr', { className: 'tr-dev', style: { height: DEV_H } }, devRowCells);
    const wideIdx = new Set([0, 26, 30]); // дата, сон коммент, день коммент
    const emptyIdx = new Set([12, 22]); // пустые колонки emp1, emp2
    const colgroup = React.createElement('colgroup', null, HEADERS.map((h, i) => React.createElement('col', { key: 'week-col-' + i + '-' + (h || 'empty'), style: { width: wideIdx.has(i) ? '50px' : (emptyIdx.has(i) ? '15px' : '25px') } })));
    const thead = React.createElement('thead', null, React.createElement('tr', null, HEADERS.map((h, i) => { const empty = !h; const parts = String(h).split(/\\n/); const isSeparatorCol = i === 15 || i === 18; const borderRight = isSeparatorCol ? '2px solid #4b5563' : null; return React.createElement('th', { key: 'week-head-' + i + '-' + (h || 'empty'), style: { width: wideIdx.has(i) ? '50px' : '25px', fontSize: '10px', lineHeight: '12px', padding: '3px 1px', whiteSpace: 'normal', textAlign: 'center', background: empty ? 'transparent' : '#d1d5db', color: empty ? 'transparent' : '#111827', borderTop: empty ? 'none' : null, borderBottom: empty ? 'none' : null, borderRight } }, empty ? '' : parts.map((p, pi) => React.createElement(React.Fragment, { key: 'week-hfrag-' + i + '-' + pi }, p, pi < parts.length - 1 ? React.createElement('br', { key: 'week-br-' + i + '-' + pi }) : null))); })));
    // Показываем строки "норма" и "откл" только если есть хотя бы один управляемый день (данные != 0 после фильтра)
    const bodyChildren = [
      ...rows.map(r => React.createElement(RowView, { key: r.dstr, row: r, profile })),
      React.createElement(AvgRow, { avg, label: 'среднее', key: 'avg', highlight: true })
    ];
    if ((avg.kcal || 0) > 0) {
      bodyChildren.push(React.cloneElement(normRow, { key: 'norm' }), React.cloneElement(devRow, { key: 'dev' }));
    }
    const tbody = React.createElement('tbody', null, bodyChildren);
    return React.createElement('div', { className: 'card ' + (tone || 'tone-slate'), style: { margin: '8px 0' } },
      React.createElement('div', { style: { margin: '4px 0', fontWeight: 700 } }, title),
      React.createElement('div', { style: { overflowX: 'auto' } }, React.createElement('table', { className: 'tbl', style: { fontSize: '96%', tableLayout: 'fixed', minWidth: '1150px' } },
        colgroup,
        thead,
        tbody
      ))
    );
  }
  function MonthAverage({ rows }) {
    const U = (global.HEYS && HEYS.utils) || { lsGet: (k, d) => d };
    const profile = U.lsGet('heys_profile', {});
    rows.forEach(r => enrichDay(r, profile));
    const avg = computeAveragesRows(rows, profile);
    const normsPerc = U.lsGet('heys_norms', {}) || {};
    const tdeeAvg = rows.length ? Math.round(rows.reduce((s, r) => s + (r.dailyExp || 0), 0) / rows.length) : 0;
    // Вычисляем средний целевой дефицит из дней, а не из профиля
    const validRows = rows.filter(r => r.dayTargetDef != null);
    const targetDef = validRows.length > 0 ?
      validRows.reduce((s, r) => s + r.dayTargetDef, 0) / validRows.length :
      +(profile.deficitPctTarget || 0); // fallback к профилю
    const optimum = tdeeAvg ? Math.round(tdeeAvg * (1 + targetDef / 100)) : 0;
    const carbPct = +normsPerc.carbsPct || 0; const protPct = +normsPerc.proteinPct || 0; const fatPct = Math.max(0, 100 - carbPct - protPct);
    const carbs = optimum ? (optimum * carbPct / 100) / 4 : 0; const prot = optimum ? (optimum * protPct / 100) / 4 : 0; const fat = optimum ? (optimum * fatPct / 100) / 8 : 0;
    const simplePct = +normsPerc.simpleCarbPct || 0; const simple = carbs * simplePct / 100; const complex = Math.max(0, carbs - simple);
    const badPct = +normsPerc.badFatPct || 0; const transPct = +normsPerc.superbadFatPct || 0; const bad = fat * badPct / 100; const trans = fat * transPct / 100; const good = Math.max(0, fat - bad - trans);
    const fiberPct = +normsPerc.fiberPct || 0; const fiber = carbs * fiberPct / 100; const giN = +normsPerc.giPct || 0; const harmN = +normsPerc.harmPct || 0;
    function td(v, k) {
      const hStyle = { height: SUM_H, lineHeight: SUM_H, padding: '0 2px', textAlign: 'center', fontWeight: 400, fontSize: '90%' };
      // Серый цвет для колонок активности и тренировок в месячной таблице
      let style = hStyle;
      if (k.includes('_act') || k.includes('_train')) {
        style = { ...style, color: '#9ca3af' };
      }
      // Жирные правые границы для разделения секций таблицы
      if (k === 'mn_train' || k === 'md_train' || k === 'mn_opt' || k === 'md_opt') {
        style = { ...style, borderRight: '2px solid #4b5563' };
      }
      // Для веса показываем с десятичной точностью
      if (k.includes('_weight')) {
        if (typeof v === 'number') v = Math.round(v * 10) / 10;
      } else if (typeof v === 'number') {
        v = Math.round(v);
      }
      const displayValue = v == null || v === 0 ? React.createElement('span', { style: { color: '#c4c6d8', fontSize: '8px' } }, '—') : v;
      return React.createElement('td', { key: k, style }, displayValue);
    }
    function devCell(f, n, key) {
      if (!n) return React.createElement('td', { key, style: { height: DEV_H, lineHeight: DEV_H, textAlign: 'center' } }, '');
      // Для вредности показываем абсолютное отклонение
      if (key.includes('_harm')) {
        const absDiff = Math.round(f - n);
        const color = absDiff > 0 ? '#dc2626' : (absDiff < 0 ? '#059669' : '#111827');
        let style = { color, fontWeight: 700, height: DEV_H, lineHeight: DEV_H, textAlign: 'center', fontSize: '85%' };
        if (key.includes('_act') || key.includes('_train')) {
          style = { ...style, color: '#9ca3af' };
        }
        // Жирные правые границы для разделения секций таблицы
        if (key === 'md_train' || key === 'md_opt') {
          style = { ...style, borderRight: '2px solid #4b5563' };
        }
        return React.createElement('td', { key, style }, (absDiff > 0 ? '+' : '') + absDiff);
      }
      // Для всех остальных показываем процентное отклонение
      const diff = Math.round(((f - n) / n) * 100);
      const color = diff > 0 ? '#dc2626' : (diff < 0 ? '#059669' : '#111827');
      const fw = 700;
      // Серый цвет для колонок активности и тренировок в строках отклонений
      let style = { color, fontWeight: fw, height: DEV_H, lineHeight: DEV_H, textAlign: 'center', fontSize: '85%' };
      if (key.includes('_act') || key.includes('_train')) {
        style = { ...style, color: '#9ca3af' };
      }
      // Жирные правые границы для разделения секций таблицы
      if (key === 'md_train' || key === 'md_opt') {
        style = { ...style, borderRight: '2px solid #4b5563' };
      }
      return React.createElement('td', { key, style }, (diff > 0 ? '+' : '') + diff + '%');
    }

    const normRowCells = [
      // Питательные вещества (13 колонок)
      td('норма', 'mn0'), td(carbs, 'mn_carbs'), td(simple, 'mn_simple'), td(complex, 'mn_complex'), td(prot, 'mn_prot'), td(fat, 'mn_fat'), td(bad, 'mn_bad'), td(good, 'mn_good'), td(trans, 'mn_trans'), td(fiber, 'mn_fiber'), td(giN, 'mn_gi'), td(harmN, 'mn_harm'), td('', 'mn_emp1'),
      // Физ показатели (10 колонок) - убираем значения для "нужно съесть" и "съедено за день"
      td('', 'mn_weight'), td('', 'mn_act'), td('', 'mn_train'), td('', 'mn_exp'), td('', 'mn_targetdef'), td('', 'mn_opt'), td('', 'mn_kcal'), td('', 'mn_factdef'), td('', 'mn_defkcal'), td('', 'mn_emp2'),
      // Остальное (9 колонок)
      td('', 'mn_meals'), td('', 'mn_slh'), td('', 'mn_slq'), td('', 'mn_slc'), td('', 'mn_stress'), td('', 'mn_well'), td('', 'mn_mood'), td('', 'mn_daycom')
    ];
    const normRow = React.createElement('tr', { className: 'tr-norm', style: { height: SUM_H } }, normRowCells);

    const devRowCells = [
      // Питательные вещества (13 колонок)
      td('откл', 'md0'), devCell(avg.carbs, carbs, 'md_carbs'), devCell(avg.simple, simple, 'md_simple'), devCell(avg.complex, complex, 'md_complex'), devCell(avg.prot, prot, 'md_prot'), devCell(avg.fat, fat, 'md_fat'), devCell(avg.bad, bad, 'md_bad'), devCell(avg.good, good, 'md_good'), devCell(avg.trans, trans, 'md_trans'), devCell(avg.fiber, fiber, 'md_fiber'), devCell(avg.gi, giN, 'md_gi'), devCell(avg.harm, harmN, 'md_harm'), td('', 'md_emp1'),
      // Физ показатели (10 колонок) - убираем значения для "нужно съесть" и "съедено за день"
      td('', 'md_weight'), td('', 'md_act'), td('', 'md_train'), td('', 'md_exp'), td('', 'md_targetdef'), td('', 'md_opt'), td('', 'md_kcal'), td('', 'md_factdef'), td('', 'md_defkcal'), td('', 'md_emp2'),
      // Остальное (9 колонок)  
      td('', 'md_meals'), td('', 'md_slh'), td('', 'md_slq'), td('', 'md_slc'), td('', 'md_stress'), td('', 'md_well'), td('', 'md_mood'), td('', 'md_daycom')
    ];
    const devRow = React.createElement('tr', { className: 'tr-dev', style: { height: DEV_H } }, devRowCells);
    const wideIdx = new Set([0, 26, 30]); // дата, сон коммент, день коммент
    const colgroup = React.createElement('colgroup', null, HEADERS.map((h, i) => React.createElement('col', { key: 'month-col-' + i + '-' + (h || 'empty'), style: { width: wideIdx.has(i) ? '50px' : '25px' } })));
    const thead = React.createElement('thead', null, React.createElement('tr', null, HEADERS.map((h, i) => {
      const parts = String(h).split(/\\n/);
      let style = { width: wideIdx.has(i) ? '50px' : '25px', fontSize: '9px', lineHeight: '10px', padding: '2px 1px', whiteSpace: 'normal', textAlign: 'center' };
      // Жирные правые границы для разделения секций таблицы
      if (i === 15 || i === 18) { // после "Трен" и "Нужно съесть"
        style = { ...style, borderRight: '2px solid #4b5563' };
      }
      return React.createElement('th', { key: 'month-head-' + i + '-' + (h || 'empty'), style }, parts.map((p, pi) => React.createElement(React.Fragment, { key: 'month-hfrag-' + i + '-' + pi }, p, pi < parts.length - 1 ? React.createElement('br', { key: 'month-br-' + i + '-' + pi }) : null)));
    })));
    const tbody = React.createElement('tbody', null, [React.createElement(AvgRow, { avg, label: 'среднее за месяц (28 дней)', key: 'avg' }), React.cloneElement(normRow, { key: 'norm' }), React.cloneElement(devRow, { key: 'dev' })]);
    return React.createElement('div', { className: 'card tone-violet', style: { margin: '10px 0' } },
      React.createElement('div', { style: { margin: '4px 0', fontWeight: 700 } }, 'Итог за месяц — средние значения'),
      React.createElement('div', { style: { overflowX: 'auto' } }, React.createElement('table', { className: 'tbl', style: { fontSize: '80%' } },
        colgroup,
        thead,
        tbody
      ))
    );
  }

  // ---------- Диаграмма потребления калорий ----------
  // Логика:
  //   target (нужно съесть) = оценка 10 (центр)
  //   каждые ±100 ккал = минус 1 балл
  //   оценка = max(0, 10 - |actual - target| / 100)
  //   ось X показывает калорийные «коридоры» с шагом 100
  //   цвет:
  //     зелёный: в пределах ±100 (оценка 9-10)
  //     жёлтый: фактический коридор
  //     серый: прочие
  //     красный: края (оценка 0 или 1)
  function CalorieChart({ week1Data }) {
    const Sparklines = HEYS.SparklinesShared || {};
    const U = (global.HEYS && HEYS.utils) || { lsGet: (k, d) => d };
    const profile = U.lsGet('heys_profile', {});
    week1Data.forEach(r => enrichDay(r, profile));

    const series = Sparklines.buildSeriesFromRows
      ? Sparklines.buildSeriesFromRows(week1Data, {
        valueKey: 'totals.kcal',
        targetKey: 'optimum',
        dateKey: 'dstr'
      })
      : { values: [], targets: [], labels: [] };

    return React.createElement('div', { className: 'card tone-indigo', style: { margin: '8px 0', width: '700px', background: '#fff', border: '1px dashed #9ca3af', borderRadius: '12px' } },
      React.createElement('div', { style: { margin: '4px 0', fontWeight: 600, textAlign: 'center' } }, 'Съедено vs цель (7 дней)'),
      React.createElement('div', { className: 'reports-sparkline' },
        Sparklines.renderMiniSparkline?.({
          React,
          values: series.values,
          targets: series.targets,
          width: 640,
          height: 120,
          className: 'reports-sparkline__svg'
        })
      )
    );
  }

  // ---------- Графики ----------
  function regressionY(values) {
    const n = values.length;
    if (!n) return [];
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) { const x = i, y = toNum(values[i]); sumX += x; sumY += y; sumXY += x * y; sumXX += x * x; }
    const b = (n * sumXY - sumX * sumY) / Math.max(1, (n * sumXX - sumX * sumX));
    const a = (sumY - b * sumX) / n;
    return values.map((_, i) => round1(a + b * i));
  }
  function ChartsBlock({ rows28 }) {
    const Sparklines = HEYS.SparklinesShared || {};
    const eaten = rows28.map(r => round1(r.totals.kcal));
    const spent = rows28.map(r => round1(r.dailyExp));
    const weight = rows28.map(r => round1(r.weight));
    const weightTrend = regressionY(weight);
    const fiber = rows28.map(r => round1(r.totals.fiber));
    const harm = rows28.map(r => round1(r.harmAvg || 0));
    const activity = rows28.map(r => round1(r.activitySubtotal));
    const carbsPct = rows28.map(r => r.carbsPct);
    const protPct = rows28.map(r => r.protPct);
    const fatPct = rows28.map(r => r.fatPct);
    const simplePct = rows28.map(r => r.simplePct);
    const complexPct = rows28.map(r => r.complexPct);

    const U = (global.HEYS && HEYS.utils) || { lsGet: (k, d) => d };
    const profile = U.lsGet('heys_profile', {});
    const fiberTarget = toNum(profile.fiberTarget) || 25;
    const fiberTargetArr = rows28.map(_ => fiberTarget);

    const metrics = [
      {
        title: 'Съедено vs Потрачено',
        values: eaten,
        targets: spent,
        valueLabel: `${Math.round(eaten.reduce((s, v) => s + v, 0) / Math.max(1, eaten.length))} ккал`
      },
      {
        title: 'Вес (кг)',
        values: weight,
        targets: weightTrend,
        valueLabel: `${weight[weight.length - 1] || 0} кг`
      },
      { title: 'Углеводы %', values: carbsPct, valueLabel: `${Math.round(carbsPct[carbsPct.length - 1] || 0)}%` },
      { title: 'Белки %', values: protPct, valueLabel: `${Math.round(protPct[protPct.length - 1] || 0)}%` },
      { title: 'Жиры %', values: fatPct, valueLabel: `${Math.round(fatPct[fatPct.length - 1] || 0)}%` },
      { title: 'Простые %', values: simplePct, valueLabel: `${Math.round(simplePct[simplePct.length - 1] || 0)}%` },
      { title: 'Сложные %', values: complexPct, valueLabel: `${Math.round(complexPct[complexPct.length - 1] || 0)}%` },
      { title: 'Клетчатка (г)', values: fiber, targets: fiberTargetArr, valueLabel: `${Math.round(fiber[fiber.length - 1] || 0)} г` },
      { title: 'Вредность', values: harm, valueLabel: `${Math.round(harm[harm.length - 1] || 0)}` },
      { title: 'Активность (ккал)', values: activity, valueLabel: `${Math.round(activity[activity.length - 1] || 0)}` }
    ];

    return React.createElement('div', { className: 'page page-reports' },
      React.createElement('div', { style: { margin: '10px 0', fontWeight: 700 } }, 'Графики (последние 28 дней)'),
      React.createElement('div', { className: 'reports-sparkline-grid' },
        metrics.map((metric, idx) => React.createElement('div', { key: 'spark-metric-' + idx, className: 'reports-sparkline-card' },
          Sparklines.renderMetricSparkline?.({
            React,
            title: metric.title,
            subtitle: '28 дней',
            values: metric.values,
            targets: metric.targets,
            valueLabel: metric.valueLabel
          })
        ))
      )
    );
  }

  // ---------- Основной компонент отчётности (кнопка → модалка с графиками; на странице — только таблицы) ----------
  // Определяем компонент ReportsTab
  const ReportsTab = function ReportsTab(props) {
    const React = global.React, { useMemo, useState, useEffect } = React;
    // Fallback chain для products: props → HEYS.products.getAll() → localStorage
    const propsProducts = props.products || [];
    const products = useMemo(() => {
      if (propsProducts.length > 0) return propsProducts;
      const fromStore = global.HEYS?.products?.getAll?.() || [];
      if (fromStore.length > 0) return fromStore;
      const U = (global.HEYS && HEYS.utils) || { lsGet: (k, d) => d };
      return U.lsGet?.('heys_products', []) || [];
    }, [propsProducts]);
    const prodIndex = useMemo(() => buildProductIndex(products), [products]);

    const U = (global.HEYS && HEYS.utils) || { lsGet: (k, d) => d };

    // Добавляем состояние для ленивой загрузки
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Используем точно такую же логику getProfile как в фиолетовой таблице
    const profileRaw = U.lsGet('heys_profile', {}) || {};
    const g = (profileRaw.gender || profileRaw.sex || 'Мужской');
    const sex = (String(g).toLowerCase().startsWith('ж') ? 'female' : 'male');
    const profile = {
      sex: sex,
      height: +profileRaw.height || 175,
      age: +profileRaw.age || 30,
      sleepHours: +profileRaw.sleepHours || 8,
      weight: +profileRaw.weight || 70,
      zones: profileRaw.zones || [],
      deficitPctTarget: profileRaw.deficitPctTarget || 0
    };

    const zones = (profile.zones || []).map(z => ({ met: +z.MET || 0 })).length ? (profile.zones || []).map(z => ({ met: +z.MET || 0 })) : [{ met: 2.5 }, { met: 6 }, { met: 8 }, { met: 10 }];

    // Инициализируем систему инвалидации кэша только при первом отображении
    useEffect(() => {
      if (!isInitialized) {
        setIsLoading(true);
        // Задержка для предотвращения блокировки UI
        setTimeout(() => {
          setupCacheInvalidation();
          setIsInitialized(true);
          setIsLoading(false);
        }, 100);
      }
    }, [isInitialized]);

    // Форсируем обновление при изменении данных (используем timestamp)
    const [updateTrigger, setUpdateTrigger] = useState(Date.now());

    // Подписываемся на события обновления дня (BroadcastChannel + storage) для актуализации отчётов
    useEffect(() => {
      if (!isInitialized) return;

      const RECENT_WINDOW_MS = 1000 * 60 * 60 * 24 * 60; // 60 дней — достаточно для отчётов

      const markUpdated = (isoDate) => {
        if (isoDate) {
          invalidateCache(isoDate);
          const parsed = new Date(isoDate);
          if (!Number.isNaN(parsed.getTime())) {
            if (Date.now() - parsed.getTime() > RECENT_WINDOW_MS) {
              return;
            }
          }
        }
        setUpdateTrigger(Date.now());
      };

      let channel = null;
      if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel('heys_day_updates');
        channel.onmessage = (event) => {
          const data = event && event.data;
          if (!data || data.type !== 'day:update') return;
          const isoDate = (data.payload && data.payload.date) || data.date;
          markUpdated(isoDate);
        };
      }

      const handleStorage = (event) => {
        if (!event || !event.key) return;
        if (event.key.startsWith('heys_dayv2_')) {
          const isoDate = event.key.slice('heys_dayv2_'.length);
          markUpdated(isoDate);
        }
      };
      window.addEventListener('storage', handleStorage);

      const interval = setInterval(() => {
        const now = new Date();
        const today = fmtDate(now);
        const yesterday = fmtDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
        const dates = [today, yesterday];

        if (!window._heysLastDataHash) window._heysLastDataHash = {};
        let changed = false;

        dates.forEach((isoDate) => {
          const key = 'heys_dayv2_' + isoDate;
          const raw = window.localStorage.getItem(key);
          const hash = raw ? raw.length : 0;
          if (window._heysLastDataHash[key] !== hash) {
            window._heysLastDataHash[key] = hash;
            invalidateCache(isoDate);
            changed = true;
          }
        });

        if (changed) {
          markUpdated();
        }
      }, 10000);

      return () => {
        if (channel) {
          channel.close();
        }
        window.removeEventListener('storage', handleStorage);
        clearInterval(interval);
      };
    }, [isInitialized]);

    // 28 дней — для графиков и усреднений (ленивое вычисление)
    const rows28 = useMemo(() => {
      if (!isInitialized) return [];

      const arr = [];
      for (let i = 27; i >= 0; i--) {
        const dt = new Date(); dt.setDate(dt.getDate() - i);
        arr.push(collectDay(fmtDate(dt), prodIndex, profile, zones, products));
      }
      return arr;
    }, [JSON.stringify(products), JSON.stringify(profile), JSON.stringify(zones), updateTrigger, isInitialized]);

    const collectWeek = React.useCallback((offsetDays) => {
      if (!isInitialized) return [];

      // Создаем ключ кэша для недели
      const weekKey = `week_${offsetDays}_${JSON.stringify(profile).substring(0, 50)}_${updateTrigger}`;

      if (weekCache.has(weekKey)) {
        if (window.HEYS && window.HEYS.performance) {
          window.HEYS.performance.increment('weekCacheHits');
        }
        return weekCache.get(weekKey);
      }

      if (window.HEYS && window.HEYS.performance) {
        window.HEYS.performance.increment('weekCacheMisses');
      }

      const rows = [];
      for (let i = 0; i < 7; i++) {
        const dt = new Date(); dt.setDate(dt.getDate() - (offsetDays + i));
        rows.push(collectDay(fmtDate(dt), prodIndex, profile, zones, products));
      }
      rows.sort((a, b) => (a.dstr < b.dstr ? 1 : -1));

      // Управляем размером кэша недель
      if (weekCache.size >= maxWeekCacheSize) {
        const firstKey = weekCache.keys().next().value;
        weekCache.delete(firstKey);
      }

      weekCache.set(weekKey, rows);
      return rows;
    }, [prodIndex, profile, zones, products, updateTrigger, isInitialized]);

    const week1 = useMemo(() => collectWeek(0), [collectWeek]);
    const week2 = useMemo(() => collectWeek(7), [collectWeek]);
    const week3 = useMemo(() => collectWeek(14), [collectWeek]);
    const week4 = useMemo(() => collectWeek(21), [collectWeek]);
    const all28 = [].concat(week1, week2, week3, week4);

    const [showCharts, setShowCharts] = useState(false);

    // Показываем индикатор загрузки пока инициализируется
    if (!isInitialized || isLoading) {
      return React.createElement('div', { className: 'card', style: { margin: '8px 0', padding: '24px', textAlign: 'center' } },
        React.createElement('div', { style: { marginBottom: '8px' } }, 'Загрузка отчетов...'),
        React.createElement('div', { className: 'muted', style: { fontSize: '90%' } }, 'Подготовка данных и кэширование результатов')
      );
    }

    return React.createElement('div', null,
      React.createElement('div', { className: 'card reports-legacy-banner' },
        React.createElement('div', { className: 'reports-legacy-banner__title' }, 'Legacy-отчёты (скоро будут сняты)'),
        React.createElement('div', { className: 'reports-legacy-banner__text' }, 'Этот раздел сохранён на один спринт для обратной совместимости. Новый weekly-отчёт доступен во вкладке «Инсайты».')
      ),
      React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' } },
        React.createElement('div', { style: { fontWeight: 700 } }, 'Таблицы за последние 4 недели'),
        React.createElement('div', null,
          React.createElement('button', { className: 'btn acc', onClick: () => setShowCharts(true) }, 'Показать графики')
        )
      ),
      React.createElement(WeekTable, { title: 'Неделя 1 (последние 7 дней)', rows: week1, tone: 'tone-blue' }),
      React.createElement(CalorieChart, { week1Data: week1 }),
      React.createElement(WeekTable, { title: 'Неделя 2', rows: week2, tone: 'tone-amber' }),
      React.createElement(WeekTable, { title: 'Неделя 3', rows: week3, tone: 'tone-green' }),
      React.createElement(WeekTable, { title: 'Неделя 4', rows: week4, tone: 'tone-slate' }),
      React.createElement(MonthAverage, { rows: all28 }),

      showCharts && React.createElement('div', {
        className: 'modal-backdrop',
        onClick: (e) => { if (e.target.classList.contains('modal-backdrop')) setShowCharts(false); }
      },
        React.createElement('div', { className: 'modal', style: { maxWidth: '980px', width: '100%', maxHeight: '85vh', overflow: 'auto' } },
          React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
            React.createElement('div', { style: { fontWeight: 700 } }, 'Графики (последние 28 дней)'),
            React.createElement('button', { className: 'btn', onClick: () => setShowCharts(false) }, '×')
          ),
          React.createElement(ChartsBlock, { rows28 })
        )
      )
    );
  };

  /** ------------------------------------------------------------
 * React-компонент таба отчётов (удалена дублирующаяся функция)
 * ----------------------------------------------------------- */
  // ReportsTab уже определён выше в строке 1066

  /* === EXPORT ================================================= */
  if (!window.HEYS) window.HEYS = {};
  window.HEYS.ReportsTab = ReportsTab;   // экспорт в namespace

  /* === INITIALIZATION ============================================ */
  setTimeout(setupCacheInvalidation, 100);

})(window);
