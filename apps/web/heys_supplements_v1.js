// heys_supplements_v1.js — Трекинг витаминов и добавок
// Версия: 2.0.0 | Дата: 2025-12-14
// Каталог витаминов, timing, взаимодействия, интеграция с инсулиновой волной
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  // === ВРЕМЯ ПРИЁМА ===
  const TIMING = {
    morning: { name: 'Утром', icon: '🌅', hours: [6, 11] },
    withFood: { name: 'С едой', icon: '🍽️', hours: null },
    withFat: { name: 'С жирной едой', icon: '🥑', hours: null },
    evening: { name: 'Вечером', icon: '🌙', hours: [18, 23] },
    beforeBed: { name: 'Перед сном', icon: '😴', hours: [21, 24] },
    empty: { name: 'Натощак', icon: '⏰', hours: null },
    beforeMeal: { name: 'До еды', icon: '⏳', hours: null },
    afterTrain: { name: 'После трени', icon: '💪', hours: null },
    anytime: { name: 'Любое время', icon: '✨', hours: null },
  };

  // === КАТАЛОГ ВИТАМИНОВ ===
  const SUPPLEMENTS_CATALOG = {
    // === 🛡️ Иммунитет ===
    vitD: { name: 'D3', icon: '☀️', category: 'immune', timing: 'withFat', tip: 'Лучше с жирной едой' },
    vitC: { name: 'C', icon: '🍊', category: 'immune', timing: 'anytime', tip: 'Улучшает усвоение железа' },
    zinc: { name: 'Цинк', icon: '🛡️', category: 'immune', timing: 'withFood', tip: 'Не сочетать с кальцием' },
    selenium: { name: 'Селен', icon: '🔬', category: 'immune', timing: 'withFood' },

    // === 🧠 Мозг и нервы ===
    omega3: { name: 'Омега-3', icon: '🐟', category: 'brain', timing: 'withFood', tip: 'Усиливает D3' },
    magnesium: { name: 'Магний', icon: '💤', category: 'brain', timing: 'evening', tip: 'Расслабляет мышцы' },
    b12: { name: 'B12', icon: '⚡', category: 'brain', timing: 'morning', tip: 'Даёт энергию' },
    b6: { name: 'B6', icon: '🧬', category: 'brain', timing: 'morning' },
    lecithin: { name: 'Лецитин', icon: '🥚', category: 'brain', timing: 'withFood' },

    // === 🦴 Кости и суставы ===
    calcium: { name: 'Кальций', icon: '🦴', category: 'bones', timing: 'withFood', tip: 'Не с железом!' },
    k2: { name: 'K2', icon: '🥬', category: 'bones', timing: 'withFat', tip: 'Синергия с D3' },
    collagen: { name: 'Коллаген', icon: '✨', category: 'bones', timing: 'empty', tip: 'Натощак + витамин C' },
    glucosamine: { name: 'Глюкозамин', icon: '🦵', category: 'bones', timing: 'withFood' },

    // === 💪 Спорт ===
    creatine: { name: 'Креатин', icon: '💪', category: 'sport', timing: 'afterTrain', tip: '5г в день' },
    bcaa: { name: 'BCAA', icon: '🏋️', category: 'sport', timing: 'afterTrain' },
    protein: { name: 'Протеин', icon: '🥛', category: 'sport', timing: 'afterTrain', tip: '30мин после трени' },

    // === 💇 Красота ===
    biotin: { name: 'Биотин', icon: '💇', category: 'beauty', timing: 'withFood', tip: 'Волосы и ногти' },
    vitE: { name: 'E', icon: '🌻', category: 'beauty', timing: 'withFat' },
    hyaluronic: { name: 'Гиалуроновая', icon: '💧', category: 'beauty', timing: 'empty' },

    // === 🌸 Женское здоровье ===
    iron: { name: 'Железо', icon: '🩸', category: 'female', timing: 'empty', tip: 'С витамином C, без кальция' },
    folic: { name: 'Фолиевая', icon: '🌸', category: 'female', timing: 'morning' },

    // === 💤 Сон ===
    melatonin: { name: 'Мелатонин', icon: '🌙', category: 'sleep', timing: 'beforeBed', tip: 'За 30-60мин до сна' },
    glycine: { name: 'Глицин', icon: '😴', category: 'sleep', timing: 'beforeBed' },
    ltheanine: { name: 'L-теанин', icon: '🍵', category: 'sleep', timing: 'evening', tip: 'Расслабляет без сонливости' },

    // === ⚡ Энергия ===
    coq10: { name: 'CoQ10', icon: '❤️', category: 'energy', timing: 'withFat', tip: 'Энергия для сердца' },

    // === 🧪 Метаболизм (влияют на инсулиновую волну!) ===
    berberine: { name: 'Берберин', icon: '🌿', category: 'metabolism', timing: 'beforeMeal', insulinBonus: -0.15, tip: '💡 -15% инсулиновая волна' },
    cinnamon: { name: 'Корица', icon: '🍂', category: 'metabolism', timing: 'withFood', insulinBonus: -0.10, tip: '💡 -10% инсулиновая волна' },
    chromium: { name: 'Хром', icon: '⚙️', category: 'metabolism', timing: 'withFood', tip: 'Стабилизирует сахар' },
    vinegar: { name: 'Уксус', icon: '🍎', category: 'metabolism', timing: 'beforeMeal', insulinBonus: -0.20, tip: '💡 -20% инсулиновая волна' },
  };

  // === КАТЕГОРИИ ===
  const SUPPLEMENT_CATEGORIES = {
    immune: { name: 'Иммунитет', icon: '🛡️', order: 1 },
    brain: { name: 'Мозг', icon: '🧠', order: 2 },
    bones: { name: 'Кости', icon: '🦴', order: 3 },
    sport: { name: 'Спорт', icon: '💪', order: 4 },
    beauty: { name: 'Красота', icon: '💇', order: 5 },
    female: { name: 'Женское', icon: '🌸', order: 6 },
    sleep: { name: 'Сон', icon: '💤', order: 7 },
    energy: { name: 'Энергия', icon: '⚡', order: 8 },
    metabolism: { name: 'Метаболизм', icon: '🧪', order: 9 },
  };

  // === ВЗАИМОДЕЙСТВИЯ v2.0 ===
  const INTERACTIONS = {
    synergies: [
      { pair: ['vitD', 'vitK2'], desc: '✨ D3 + K2 — кальций идёт в кости, а не в сосуды' },
      { pair: ['iron', 'vitC'], desc: '✨ Железо + C — усвоение ×3' },
      { pair: ['calcium', 'vitD'], desc: '✨ Кальций + D3 — максимальное усвоение' },
      { pair: ['magnesium', 'b6'], desc: '✨ Магний + B6 — классическая связка' },
      { pair: ['omega3', 'vitD'], desc: '✨ Omega-3 + D3 — жиры помогают усвоению' },
      { pair: ['omega3', 'vitE'], desc: '✨ Omega-3 + E — защита от окисления' },
      { pair: ['zinc', 'vitC'], desc: '✨ Цинк + C — усиление иммунитета' },
      { pair: ['curcumin', 'omega3'], desc: '✨ Куркумин + Omega-3 — противовоспалительная синергия' },
    ],
    conflicts: [
      { pair: ['iron', 'calcium'], desc: '⚠️ Железо vs Кальций — принимать с интервалом 2-3 часа' },
      { pair: ['zinc', 'calcium'], desc: '⚠️ Цинк vs Кальций — конкурируют за усвоение' },
      { pair: ['zinc', 'iron'], desc: '⚠️ Цинк vs Железо — принимать раздельно' },
      { pair: ['magnesium', 'calcium'], desc: '⚠️ Магний vs Кальций — в больших дозах мешают друг другу' },
      { pair: ['vitE', 'iron'], desc: '⚠️ Витамин E vs Железо — E снижает усвоение железа' },
    ],
  };

  // === КУРСЫ (PRESETS) v3.0 ===
  const COURSES = {
    winter: {
      id: 'winter',
      name: '🧊 Зима',
      desc: 'Иммунитет на холодный сезон',
      supplements: ['vitD', 'vitC', 'zinc'],
      duration: '3 месяца',
      tags: ['иммунитет', 'сезон']
    },
    active: {
      id: 'active',
      name: '🏃 Активный образ',
      desc: 'Для спортсменов и активных людей',
      supplements: ['omega3', 'magnesium', 'coq10'],
      duration: 'постоянно',
      tags: ['спорт', 'энергия']
    },
    women30: {
      id: 'women30',
      name: '👩 30+ Женщина',
      desc: 'Базовый набор для женщин',
      supplements: ['vitD', 'calcium', 'iron', 'b12'],
      duration: 'постоянно',
      tags: ['женское', 'базовый']
    },
    beauty: {
      id: 'beauty',
      name: '✨ Красота',
      desc: 'Кожа, волосы, ногти',
      supplements: ['biotin', 'collagen', 'vitE', 'hyaluronic'],
      duration: '2-3 месяца',
      tags: ['красота']
    },
    sleep: {
      id: 'sleep',
      name: '😴 Здоровый сон',
      desc: 'Улучшение качества сна',
      supplements: ['magnesium', 'melatonin', 'glycine'],
      duration: '1-2 месяца',
      tags: ['сон', 'стресс']
    },
    brain: {
      id: 'brain',
      name: '🧠 Мозг',
      desc: 'Концентрация и память',
      supplements: ['omega3', 'lecithin', 'b12', 'b6'],
      duration: 'постоянно',
      tags: ['мозг', 'работа']
    },
    metabolism: {
      id: 'metabolism',
      name: '🔥 Метаболизм',
      desc: 'Улучшение обмена веществ, снижение инсулина',
      supplements: ['berberine', 'chromium', 'cinnamon'],
      duration: '1-3 месяца',
      tags: ['похудение', 'инсулин']
    },
  };

  // === CSS АНИМАЦИИ ===
  const ANIMATIONS_CSS = `
    @keyframes chip-bounce {
      0% { transform: scale(1); }
      50% { transform: scale(0.92); }
      100% { transform: scale(1); }
    }
    .supp-chip-animate {
      animation: chip-bounce 0.15s ease-out;
    }
  `;

  // Инжектим CSS анимации
  if (typeof document !== 'undefined' && !document.getElementById('heys-supplements-css')) {
    const style = document.createElement('style');
    style.id = 'heys-supplements-css';
    style.textContent = ANIMATIONS_CSS;
    document.head.appendChild(style);
  }

  // === УТИЛИТЫ ===

  function readStoredValue(key, fallback = null) {
    let value;

    if (HEYS.store?.get) {
      value = HEYS.store.get(key, fallback);
    } else if (HEYS.utils?.lsGet) {
      value = HEYS.utils.lsGet(key, fallback);
    } else {
      try {
        value = localStorage.getItem(key);
      } catch {
        return fallback;
      }
    }

    if (value == null) return fallback;

    if (typeof value === 'string') {
      if (value.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try {
          value = HEYS.store.decompress(value.slice(3));
        } catch (_) { }
      }
      try {
        return JSON.parse(value);
      } catch (_) {
        return value;
      }
    }

    return value;
  }

  function readSessionValue(key, fallback = null) {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeSessionValue(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // no-op
    }
  }

  function isInteractiveTarget(target) {
    if (!target || !target.closest) return false;
    return !!target.closest('button, [role="button"], a, input, textarea, select, [data-supp-collapse-ignore="1"]');
  }

  /**
   * Получить витамины сгруппированные по категориям
   */
  function getSupplementsByCategory() {
    const result = {};
    for (const [id, supp] of Object.entries(SUPPLEMENTS_CATALOG)) {
      const cat = supp.category;
      if (!result[cat]) result[cat] = [];
      result[cat].push({ id, ...supp });
    }
    // Сортируем категории по order
    const sorted = {};
    Object.entries(SUPPLEMENT_CATEGORIES)
      .sort((a, b) => a[1].order - b[1].order)
      .forEach(([catId]) => {
        if (result[catId]) sorted[catId] = result[catId];
      });
    return sorted;
  }

  // === КАСТОМНЫЕ ДОБАВКИ ===

  /**
   * Получить кастомные добавки пользователя
   */
  function getCustomSupplements() {
    const profile = getProfileSafe();
    return profile.customSupplements || [];
  }

  /**
   * Добавить кастомную добавку
   * @param {Object} supp - { name, icon, timing }
   */
  function addCustomSupplement(supp) {
    const profile = getProfileSafe();
    const customs = profile.customSupplements || [];

    const newSupp = {
      id: 'custom_' + Date.now(),
      name: supp.name || 'Моя добавка',
      icon: supp.icon || '💊',
      timing: supp.timing || 'anytime',
      category: 'custom',
      isCustom: true,
    };

    customs.push(newSupp);
    profile.customSupplements = customs;
    saveProfileSafe(profile, 'customSupplements');

    // Добавляем в рантайм каталог
    SUPPLEMENTS_CATALOG[newSupp.id] = newSupp;

    window.dispatchEvent(new CustomEvent('heys:supplements-updated'));
    return newSupp;
  }

  /**
   * Удалить кастомную добавку
   */
  function removeCustomSupplement(suppId) {
    if (!suppId.startsWith('custom_')) return false;

    const profile = getProfileSafe();
    const customs = profile.customSupplements || [];

    profile.customSupplements = customs.filter(s => s.id !== suppId);
    saveProfileSafe(profile, 'customSupplements');

    // Удаляем из рантайм каталога
    delete SUPPLEMENTS_CATALOG[suppId];

    window.dispatchEvent(new CustomEvent('heys:supplements-updated'));
    return true;
  }

  /**
   * Загрузить кастомные добавки в каталог при инициализации
   */
  function loadCustomSupplements() {
    const customs = getCustomSupplements();
    for (const supp of customs) {
      SUPPLEMENTS_CATALOG[supp.id] = supp;
    }
  }

  // Загружаем кастомные при старте
  if (typeof window !== 'undefined') {
    setTimeout(loadCustomSupplements, 100);
  }

  // === v3.5: SCAFFOLDING — Настройки, история, batch-операции ===

  /**
   * Безопасное получение профиля
   */
  function getProfileSafe() {
    return readStoredValue('heys_profile', {});
  }

  /**
   * Безопасное сохранение профиля с optional полем для dispatch event
   */
  function saveProfileSafe(profile, field) {
    const U = HEYS.utils || {};
    if (HEYS.store && typeof HEYS.store.set === 'function') {
      HEYS.store.set('heys_profile', profile);
    } else if (U.lsSet) {
      U.lsSet('heys_profile', profile);
    }
    if (field) {
      window.dispatchEvent(new CustomEvent('heys:supplements-updated', { detail: { field } }));
    }
  }

  function saveDaySafe(dateKey, dayData) {
    const U = HEYS.utils || {};
    const key = `heys_dayv2_${dateKey}`;
    if (HEYS.store && typeof HEYS.store.set === 'function') {
      HEYS.store.set(key, dayData);
      return;
    }
    if (U.lsSet) {
      U.lsSet(key, dayData);
    }
  }

  /**
   * Получить все персональные настройки витаминов
   * @returns {Object} map suppId → { form, dose, unit, timing, notes }
   */
  function getSupplementSettings() {
    const profile = getProfileSafe();
    return profile.supplementSettings || {};
  }

  /**
   * Получить настройки конкретного витамина
   * @param {string} suppId - ID витамина
   * @returns {Object|null} { form, dose, unit, timing, notes } или null
   */
  function getSupplementSetting(suppId) {
    const settings = getSupplementSettings();
    return settings[suppId] || null;
  }

  /**
   * Установить/обновить настройки витамина
   * @param {string} suppId - ID витамина
   * @param {Object} patch - { form?, dose?, unit?, timing?, notes? }
   */
  function setSupplementSetting(suppId, patch) {
    const profile = getProfileSafe();
    if (!profile.supplementSettings) profile.supplementSettings = {};
    profile.supplementSettings[suppId] = {
      ...(profile.supplementSettings[suppId] || {}),
      ...patch,
      updatedAt: Date.now()
    };
    saveProfileSafe(profile, 'supplementSettings');
  }

  /**
   * Получить историю приёма витаминов (курсы, дни)
   * @returns {Object} map suppId → { startDate, days, totalTaken, lastTaken }
   */
  function getSupplementHistory() {
    const profile = getProfileSafe();
    return profile.supplementHistory || {};
  }

  /**
   * Обновить историю приёма витамина
   * @param {string} suppId - ID витамина
   * @param {string} dateKey - дата в формате YYYY-MM-DD
   * @param {boolean} taken - принят или снят
   */
  function updateSupplementHistory(suppId, dateKey, taken) {
    const profile = getProfileSafe();
    if (!profile.supplementHistory) profile.supplementHistory = {};
    if (!profile.supplementHistory[suppId]) {
      profile.supplementHistory[suppId] = {
        startDate: dateKey,
        days: 0,
        totalTaken: 0,
        lastTaken: null
      };
    }
    const h = profile.supplementHistory[suppId];
    if (taken) {
      h.totalTaken++;
      h.lastTaken = dateKey;
      // Подсчёт дней курса (уникальные даты)
      if (!h.takenDates) h.takenDates = [];
      if (!h.takenDates.includes(dateKey)) {
        h.takenDates.push(dateKey);
        h.days = h.takenDates.length;
      }
    }
    saveProfileSafe(profile, 'supplementHistory');
  }

  // === v4.1: UX/SAFETY — причины, условия, побочки, курсы, единицы ===

  // Пользовательские условия, влияющие на безопасность/подсказки.
  // Храним в профиле: profile.supplementUserFlags
  const SUPP_USER_FLAGS = {
    pregnant: {
      label: 'Беременность',
      desc: 'Важно для ряда добавок. HEYS не заменяет консультацию врача.',
    },
    breastfeeding: {
      label: 'Грудное вскармливание',
      desc: 'Важно для дозировок и ограничений.',
    },
    anticoagulants: {
      label: 'Принимаю антикоагулянты',
      desc: 'Напр. варфарин — витамин K может быть критичен.',
    },
    kidneyIssues: {
      label: 'Есть проблемы с почками',
      desc: 'Минералы (магний) и некоторые добавки требуют осторожности.',
    },
    thyroidIssues: {
      label: 'Есть проблемы со щитовидкой',
      desc: 'Йод и некоторые добавки могут быть нежелательны.',
    },
    giSensitive: {
      label: 'Чувствительный ЖКТ',
      desc: 'Если тошнит/изжога — лучше переносить/принимать с едой.',
    },
  };

  function getSupplementUserFlags() {
    const profile = getProfileSafe();
    return profile.supplementUserFlags || {};
  }

  function setSupplementUserFlag(flagId, value) {
    const profile = getProfileSafe();
    if (!profile.supplementUserFlags) profile.supplementUserFlags = {};
    profile.supplementUserFlags[flagId] = !!value;
    saveProfileSafe(profile, 'supplementUserFlags');
  }

  // Лог побочек (легковесно, без медицины): profile.supplementHistory[suppId].sideEffects[]
  function logSupplementSideEffect(suppId, dateKey, data) {
    const profile = getProfileSafe();
    if (!profile.supplementHistory) profile.supplementHistory = {};
    if (!profile.supplementHistory[suppId]) {
      profile.supplementHistory[suppId] = {
        startDate: dateKey,
        days: 0,
        totalTaken: 0,
        lastTaken: null,
      };
    }
    const h = profile.supplementHistory[suppId];
    if (!h.sideEffects) h.sideEffects = [];
    const effectText = (data?.note || data?.effect || '').slice(0, 200);
    h.sideEffects.push({
      at: Date.now(),
      dateKey,
      symptom: data?.symptom || 'other',
      note: effectText,
      action: data?.action || null,
    });
    // Ограничиваем историю (чтобы не раздувать profile)
    if (h.sideEffects.length > 30) h.sideEffects = h.sideEffects.slice(-30);
    saveProfileSafe(profile, 'supplementHistory');
  }

  function getSideEffectSummary(suppId) {
    const history = getSupplementHistory();
    const h = history[suppId];
    const list = h?.sideEffects || [];
    if (!list.length) return null;
    const last = list[list.length - 1];
    const uniqueDays = new Set(list.map(x => x?.dateKey).filter(Boolean));
    return {
      total: list.length,
      days: uniqueDays.size,
      lastAt: last.at,
      lastDateKey: last.dateKey,
      lastSymptom: last.symptom,
      lastNote: last.note,
      lastAction: last.action,
    };
  }

  // Курсовость/паузы — мягкие рекомендации (не медицинский совет)
  // weeksMax: после этого показать напоминание о паузе.
  const COURSE_HINTS = {
    melatonin: { weeksMax: 8, breakWeeks: 2, title: 'Мелатонин обычно лучше курсами' },
    berberine: { weeksMax: 12, breakWeeks: 2, title: 'Берберин часто принимают курсом' },
    iron: { weeksMax: 12, breakWeeks: 4, title: 'Железо — лучше по анализам' },
  };

  function parseISODateKey(dateKey) {
    if (!dateKey || typeof dateKey !== 'string') return null;
    const d = new Date(dateKey + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function getWeeksBetween(startDateKey, endDateKey) {
    const s = parseISODateKey(startDateKey);
    const e = parseISODateKey(endDateKey);
    if (!s || !e) return 0;
    const diffDays = Math.floor((e.getTime() - s.getTime()) / 86400000);
    return Math.max(0, Math.floor(diffDays / 7) + 1);
  }

  function getCourseInfo(suppId, dateKey) {
    const history = getSupplementHistory();
    const h = history[suppId];
    if (!h || !h.startDate) {
      return { started: false, weeksOnCourse: 0, weeksOn: 0, startDate: null, hint: null, needsBreak: false };
    }
    const weeksOn = getWeeksBetween(h.startDate, dateKey);
    const hint = COURSE_HINTS[suppId] || null;
    const needsBreak = hint?.weeksMax && weeksOn >= hint.weeksMax;
    return { started: true, weeksOnCourse: weeksOn, weeksOn, startDate: h.startDate, hint, needsBreak };
  }

  // Единицы и конверсия (минимально полезные)
  const UNIT_ALIASES = {
    mcg: 'мкг',
    ug: 'мкг',
    iu: 'МЕ',
  };

  function normalizeUnit(u) {
    const s = String(u || '').trim().toLowerCase();
    if (!s) return '';
    if (s === 'µg') return 'мкг';
    if (s === 'мкг' || s === 'mcg' || s === 'ug') return 'мкг';
    if (s === 'iu' || s === 'ме') return 'МЕ';
    if (s === 'mg' || s === 'мг') return 'мг';
    if (s === 'g' || s === 'г') return 'г';
    return UNIT_ALIASES[s] || u;
  }

  // D3: 1 мкг = 40 МЕ
  function convertVitD(dose, fromUnit, toUnit) {
    const n = parseFloat(dose);
    if (!n) return null;
    const f = normalizeUnit(fromUnit);
    const t = normalizeUnit(toUnit);
    if (f === t) return n;
    if (f === 'мкг' && t === 'МЕ') return Math.round(n * 40);
    if (f === 'МЕ' && t === 'мкг') return Math.round((n / 40) * 10) / 10;
    return null;
  }

  function getDoseDisplay(suppId, setting, bio) {
    const dose = setting?.dose;
    const unit = normalizeUnit(setting?.unit || bio?.forms?.[setting?.form]?.unit || 'мг');
    if (!dose) return null;
    // Витамин D: показываем конверсию (если возможно)
    if (suppId === 'vitD') {
      const alt = unit === 'МЕ' ? convertVitD(dose, unit, 'мкг') : convertVitD(dose, unit, 'МЕ');
      const altUnit = unit === 'МЕ' ? 'мкг' : 'МЕ';
      if (alt != null) {
        return `${dose} ${unit} (≈ ${alt} ${altUnit})`;
      }
    }
    return `${dose} ${unit}`;
  }

  // "Почему сейчас" — короткие причины/правила для понятности.
  function getWhyNowBadges(suppId, planned, setting, bio) {
    const supp = SUPPLEMENTS_CATALOG[suppId];
    if (!supp) return [];
    const res = [];

    const timing = setting?.timing || supp.timing;
    if (timing === 'withMeal') res.push({ t: 'С едой', icon: '🍽️' });
    if (timing === 'withFat' || timing === 'withMeal') {
      if (['vitD', 'vitE', 'vitK2'].includes(suppId)) {
        res.push({ t: 'Лучше с жиром', icon: '🥑' });
      }
    }
    if (timing === 'morning') res.push({ t: 'Утром', icon: '🌅' });
    if (timing === 'evening' || timing === 'beforeBed') res.push({ t: 'Вечером', icon: '🌙' });

    // Конфликты: подсказать разнесение
    const conflictPairs = {
      iron: ['calcium', 'zinc', 'magnesium'],
      zinc: ['iron', 'calcium'],
      calcium: ['iron', 'zinc', 'magnesium'],
      magnesium: ['calcium'],
    };
    const conflictsWith = (conflictPairs[suppId] || []).filter(x => planned.includes(x));
    if (conflictsWith.length) {
      const names = conflictsWith.map(id => SUPPLEMENTS_CATALOG[id]?.name || id).join(', ');
      res.push({ t: `Разнести с: ${names}`, icon: '⏱️' });
    }

    // Магний — частая путаница с "элементным".
    if (suppId === 'magnesium') {
      res.push({ t: 'Смотри "элементный Mg" на банке', icon: '⚠️' });
    }

    // Ограничиваем 3 подсказками, чтобы не шумело.
    return res.slice(0, 3);
  }

  function getSafetyWarningsForSupplement(suppId, flags) {
    const out = [];
    if (!flags) return out;

    if (flags.anticoagulants && (suppId === 'vitK2' || suppId === 'vitK')) {
      out.push('Антикоагулянты: витамин K может влиять на терапию — лучше согласовать с врачом.');
    }
    if ((flags.pregnant || flags.breastfeeding) && suppId === 'berberine') {
      out.push('Беременность/ГВ: берберин обычно не рекомендуют без врача.');
    }
    if (flags.kidneyIssues && suppId === 'magnesium') {
      out.push('Почки: магний в высоких дозах требует осторожности.');
    }
    if (flags.giSensitive && (suppId === 'iron' || suppId === 'zinc' || suppId === 'magnesium')) {
      out.push('Чувствительный ЖКТ: если дискомфорт — попробуй с едой/перенести время/уменьшить дозу.');
    }

    return out;
  }

  // Weekly diet suggestions (7 дней) — лёгкая эвристика по названиям продуктов.
  function getWeeklyDietSuggestions(daysBack = 7) {
    const today = new Date();
    const planned = getPlannedSupplements();

    const patterns = {
      fish: /(лосос|семг|скумбр|сардин|тунец|селед|рыб)/i,
      ironFood: /(печень|говядин|чечевиц|фасол|шпинат|гречк)/i,
      dairy: /(творог|молоко|сыр|йогурт|кефир|сметан)/i,
    };

    let fishMeals = 0;
    let ironMeals = 0;
    let dairyMeals = 0;
    let daysWithMeals = 0;

    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = readStoredValue(`heys_dayv2_${key}`, {});
      const meals = dayData.meals || [];
      if (!meals.length) continue;
      daysWithMeals++;

      for (const m of meals) {
        const items = m?.items || [];
        const names = items.map(it => (it?.name || '')).join(' ');
        if (patterns.fish.test(names)) fishMeals++;
        if (patterns.ironFood.test(names)) ironMeals++;
        if (patterns.dairy.test(names)) dairyMeals++;
      }
    }

    const suggestions = [];
    // Omega-3: если рыбы мало
    if (!planned.includes('omega3') && SUPPLEMENTS_CATALOG.omega3 && daysWithMeals >= 3 && fishMeals < 2) {
      suggestions.push({
        suppId: 'omega3',
        icon: '🐟',
        title: 'Рыбы мало за неделю',
        reason: 'Если рыба редко — омега‑3 может быть полезна как поддержка.',
      });
    }
    // Железо: если железных продуктов мало (и особенно для женщин — это уже покрывает profile recs, но тут именно "по рациону")
    if (!planned.includes('iron') && SUPPLEMENTS_CATALOG.iron && daysWithMeals >= 3 && ironMeals < 2) {
      suggestions.push({
        suppId: 'iron',
        icon: '🩸',
        title: 'Мало железосодержащих продуктов',
        reason: 'Если часто устаёшь — лучше начать с анализов (ферритин), а не “наугад”.',
      });
    }
    // Пример: если много молочки и есть железо в плане — напомнить разнести (не добавка, но полезный совет)
    if (planned.includes('iron') && dairyMeals >= 4) {
      suggestions.push({
        suppId: null,
        icon: '🥛',
        title: 'Много молочки',
        reason: 'Кальций мешает усвоению железа — разнеси железо и молочку на 2–3 часа.',
      });
    }

    return suggestions;
  }

  /**
   * Batch-отметка витаминов (Smart Schedule — отметить все в группе)
   * @param {string} dateKey - дата
   * @param {string[]} suppIds - массив ID витаминов
   * @param {boolean} taken - принять или снять (default true)
   */
  function markSupplementsTaken(dateKey, suppIds, taken = true) {
    const dayData = readStoredValue(`heys_dayv2_${dateKey}`, {});

    if (!dayData.supplementsTaken) dayData.supplementsTaken = [];
    if (!dayData.supplementsTakenAt) dayData.supplementsTakenAt = {};
    if (!dayData.supplementsTakenMeta) dayData.supplementsTakenMeta = {};

    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5); // HH:MM

    for (const id of suppIds) {
      if (taken) {
        if (!dayData.supplementsTaken.includes(id)) {
          dayData.supplementsTaken.push(id);
        }
        dayData.supplementsTakenAt[id] = timeStr;
        // Сохраняем мета (настройки на момент приёма)
        const setting = getSupplementSetting(id);
        if (setting) {
          dayData.supplementsTakenMeta[id] = {
            form: setting.form,
            dose: setting.dose,
            unit: setting.unit
          };
        }
        // Обновляем историю
        updateSupplementHistory(id, dateKey, true);
      } else {
        dayData.supplementsTaken = dayData.supplementsTaken.filter(x => x !== id);
        delete dayData.supplementsTakenAt[id];
        delete dayData.supplementsTakenMeta[id];
      }
    }

    dayData.updatedAt = Date.now(); // fix: ensure stale-guard passes in heys_day_effects
    saveDaySafe(dateKey, dayData);
    window.dispatchEvent(new CustomEvent('heys:day-updated', {
      detail: { date: dateKey, dateKey, field: 'supplements', forceReload: true }
    }));
    if (taken && suppIds && suppIds.length > 0) {
      window.dispatchEvent(new CustomEvent('heysSupplementsTaken', {
        detail: { date: dateKey, suppIds: [...suppIds] }
      }));
    }
  }

  // === НАПОМИНАНИЯ ПО ВРЕМЕНИ ===

  /**
   * Получить напоминание по текущему времени
   * @param {string[]} planned - запланированные добавки
   * @param {string[]} taken - уже принятые
   * @returns {Object|null} { message, urgency, suppIds }
   */
  function getTimeReminder(planned, taken) {
    const hour = new Date().getHours();
    const notTaken = planned.filter(id => !taken.includes(id));
    if (notTaken.length === 0) return null;

    // Определяем какие добавки нужны сейчас
    const morningSupps = notTaken.filter(id => {
      const s = SUPPLEMENTS_CATALOG[id];
      return s && (s.timing === 'morning' || s.timing === 'empty');
    });

    const eveningSupps = notTaken.filter(id => {
      const s = SUPPLEMENTS_CATALOG[id];
      return s && (s.timing === 'evening' || s.timing === 'beforeBed');
    });

    // Утро (7-10) — напоминание об утренних
    if (hour >= 7 && hour <= 10 && morningSupps.length > 0) {
      return {
        message: '🌅 Утренние витамины ждут!',
        urgency: 'high',
        suppIds: morningSupps,
      };
    }

    // Поздний вечер (21-23) — напоминание о вечерних
    if (hour >= 21 && hour <= 23 && eveningSupps.length > 0) {
      return {
        message: '🌙 Не забудь вечерние!',
        urgency: 'high',
        suppIds: eveningSupps,
      };
    }

    // День — мягкое напоминание если много не принято
    if (hour >= 12 && hour <= 18 && notTaken.length >= 3) {
      return {
        message: `📋 Ещё ${notTaken.length} добавок не принято`,
        urgency: 'low',
        suppIds: notTaken,
      };
    }

    return null;
  }

  // === УМНЫЕ РЕКОМЕНДАЦИИ ПО ПРОФИЛЮ ===

  /**
   * Получить персональные рекомендации по добавкам
   * @param {Object} profile - профиль пользователя
   * @param {Object} dayData - данные дня
   * @returns {Array} массив { id, reason }
   */
  function getSmartRecommendations(profile, dayData) {
    const recs = [];
    const U = HEYS.utils || {};
    const planned = getPlannedSupplements();

    if (!profile) return recs;

    // По полу
    if (profile.gender === 'Женский') {
      if (!planned.includes('iron') && SUPPLEMENTS_CATALOG['iron'])
        recs.push({ id: 'iron', reason: '🌸 Железо важно для женщин (менструация)' });
      if (!planned.includes('folic') && SUPPLEMENTS_CATALOG['folic'])
        recs.push({ id: 'folic', reason: '🌸 Фолиевая кислота — женский базис' });
      if (!planned.includes('calcium') && SUPPLEMENTS_CATALOG['calcium'])
        recs.push({ id: 'calcium', reason: '🦴 Кальций — профилактика остеопороза' });
    }

    // По возрасту
    const age = profile.age || 30;
    if (age >= 40) {
      if (!planned.includes('vitD') && SUPPLEMENTS_CATALOG['vitD'])
        recs.push({ id: 'vitD', reason: '☀️ После 40 D3 критичен для костей и иммунитета' });
      if (!planned.includes('coq10') && SUPPLEMENTS_CATALOG['coq10'])
        recs.push({ id: 'coq10', reason: '❤️ CoQ10 поддерживает сердце после 40' });
      if (!planned.includes('omega3') && SUPPLEMENTS_CATALOG['omega3'])
        recs.push({ id: 'omega3', reason: '🐟 Омега-3 для мозга и сердца 40+' });
    }
    if (age >= 50) {
      if (!planned.includes('b12') && SUPPLEMENTS_CATALOG['b12'])
        recs.push({ id: 'b12', reason: '⚡ После 50 B12 усваивается хуже — нужна добавка' });
    }

    // По сезону
    const month = new Date().getMonth();
    if (month >= 10 || month <= 2) { // Ноябрь-Февраль
      if (!planned.includes('vitD') && SUPPLEMENTS_CATALOG['vitD'])
        recs.push({ id: 'vitD', reason: '🧊 Зимой D3 обязателен (мало солнца)' });
      if (!planned.includes('vitC') && SUPPLEMENTS_CATALOG['vitC'])
        recs.push({ id: 'vitC', reason: '🍊 Витамин C для иммунитета зимой' });
      if (!planned.includes('zinc') && SUPPLEMENTS_CATALOG['zinc'])
        recs.push({ id: 'zinc', reason: '🛡️ Цинк — защита от простуд' });
    }

    // По данным дня
    if (dayData) {
      // Плохой сон → магний
      if (dayData.sleepQuality && dayData.sleepQuality <= 3) {
        if (!planned.includes('magnesium') && SUPPLEMENTS_CATALOG['magnesium'])
          recs.push({ id: 'magnesium', reason: '😴 Плохой сон → попробуй магний' });
        if (!planned.includes('melatonin') && SUPPLEMENTS_CATALOG['melatonin'])
          recs.push({ id: 'melatonin', reason: '💤 Мелатонин поможет засыпать' });
      }

      // Высокий стресс
      if (dayData.stressAvg && dayData.stressAvg >= 6) {
        if (!planned.includes('magnesium') && SUPPLEMENTS_CATALOG['magnesium'])
          recs.push({ id: 'magnesium', reason: '😰 Высокий стресс → магний успокаивает' });
        if (!planned.includes('b6') && SUPPLEMENTS_CATALOG['b6'])
          recs.push({ id: 'b6', reason: '🧠 B6 снижает тревожность' });
      }

      // Тренировки
      if (dayData.trainings && dayData.trainings.length > 0) {
        if (!planned.includes('magnesium') && SUPPLEMENTS_CATALOG['magnesium'])
          recs.push({ id: 'magnesium', reason: '💪 После трени магний от судорог' });
        if (!planned.includes('omega3') && SUPPLEMENTS_CATALOG['omega3'])
          recs.push({ id: 'omega3', reason: '💪 Омега-3 для восстановления' });
        if (!planned.includes('vitD') && SUPPLEMENTS_CATALOG['vitD'])
          recs.push({ id: 'vitD', reason: '💪 D3 помогает мышцам восстанавливаться' });
      }
    }

    // Удаляем дубликаты (по id)
    const seen = new Set();
    return recs.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }

  // === СВЯЗЬ С ЕДОЙ ===

  /**
   * Получить советы по витаминам на основе еды
   * @param {Array} meals - приёмы пищи
   * @param {string[]} planned - запланированные добавки
   * @param {string[]} taken - принятые добавки
   * @param {Object} pIndex - индекс продуктов
   * @returns {Array} массив советов
   */
  function getMealBasedAdvice(meals, planned, taken, pIndex) {
    const advices = [];
    const notTaken = planned.filter(id => !taken.includes(id));
    if (notTaken.length === 0 || !meals || meals.length === 0) return advices;

    // Анализируем последний приём пищи
    const lastMeal = meals[meals.length - 1];
    if (!lastMeal || !lastMeal.items?.length) return advices;

    // Helper для получения продукта
    const getProduct = (item) => {
      if (!pIndex) return null;
      const nameKey = (item.name || '').trim().toLowerCase();
      if (nameKey && pIndex.byName) {
        const found = pIndex.byName.get(nameKey);
        if (found) return found;
      }
      if (item.product_id != null && pIndex.byId) {
        return pIndex.byId.get(String(item.product_id).toLowerCase());
      }
      return item.fat100 !== undefined ? item : null;
    };

    // 1. Считаем жиры в последнем приёме
    let mealFat = 0;
    for (const item of lastMeal.items) {
      const p = getProduct(item);
      if (p) mealFat += (p.fat100 || 0) * (item.grams || 100) / 100;
    }

    // Жирная еда → жирорастворимые витамины
    if (mealFat >= 10) {
      const fatSoluble = notTaken.filter(id =>
        SUPPLEMENTS_CATALOG[id]?.timing === 'withFat'
      );
      if (fatSoluble.length > 0) {
        const names = fatSoluble.map(id => SUPPLEMENTS_CATALOG[id].name).join(', ');
        advices.push({
          type: 'synergy',
          icon: '🥑',
          message: `Жирный приём! Идеально для: ${names}`,
          details: 'Жирорастворимые витамины (D, E, K, A) усваиваются в 3-4 раза лучше с жирами.',
          suppIds: fatSoluble,
          priority: 'high'
        });
      }
    }

    // 2. Еда с железом + витамин C
    const ironRichFoods = ['печень', 'говядина', 'гречка', 'чечевица', 'шпинат', 'фасоль'];
    const hasIronFood = lastMeal.items.some(item =>
      ironRichFoods.some(f => (item.name || '').toLowerCase().includes(f))
    );
    if (hasIronFood && notTaken.includes('vitC')) {
      advices.push({
        type: 'synergy',
        icon: '🍊',
        message: 'Еда с железом! Добавь витамин C для усвоения ×3',
        details: 'Витамин C превращает негемовое железо в легкоусваиваемую форму.',
        suppIds: ['vitC'],
        priority: 'high'
      });
    }

    // 3. Молочка + НЕ принимать железо
    const dairyFoods = ['творог', 'молоко', 'сыр', 'йогурт', 'кефир', 'сметана'];
    const hasDairy = lastMeal.items.some(item =>
      dairyFoods.some(f => (item.name || '').toLowerCase().includes(f))
    );
    if (hasDairy && notTaken.includes('iron')) {
      advices.push({
        type: 'warning',
        icon: '⚠️',
        message: 'Молочка снижает усвоение железа. Раздели на 2 часа',
        details: 'Кальций конкурирует с железом за усвоение в кишечнике.',
        suppIds: ['iron'],
        priority: 'medium'
      });
    }

    // 4. Кофе + добавки
    const hasCoffee = lastMeal.items.some(item =>
      (item.name || '').toLowerCase().includes('кофе')
    );
    if (hasCoffee) {
      const blockedSupps = notTaken.filter(id =>
        ['iron', 'calcium', 'zinc', 'magnesium'].includes(id)
      );
      if (blockedSupps.length > 0) {
        const names = blockedSupps.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
        advices.push({
          type: 'warning',
          icon: '☕',
          message: `Кофе мешает: ${names}. Подожди 1-2 часа`,
          details: 'Танины и кофеин снижают усвоение минералов на 40-60%.',
          suppIds: blockedSupps,
          priority: 'medium'
        });
      }
    }

    // 5. Белковая еда + креатин/BCAA
    let mealProtein = 0;
    for (const item of lastMeal.items) {
      const p = getProduct(item);
      if (p) mealProtein += (p.protein100 || 0) * (item.grams || 100) / 100;
    }
    if (mealProtein >= 25) {
      const sportSupps = notTaken.filter(id =>
        ['creatine', 'bcaa', 'protein'].includes(id)
      );
      if (sportSupps.length > 0) {
        const names = sportSupps.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
        advices.push({
          type: 'synergy',
          icon: '💪',
          message: `Белковый приём! Отлично для: ${names}`,
          details: 'Спортивные добавки лучше усваиваются с белковой едой.',
          suppIds: sportSupps,
          priority: 'low'
        });
      }
    }

    return advices;
  }

  /**
   * Применить курс — добавить его добавки в planned
   */
  function applyCourse(courseId) {
    const course = COURSES[courseId];
    if (!course) return false;

    const current = getPlannedSupplements();
    const newSupps = [...new Set([...current, ...course.supplements])];
    savePlannedSupplements(newSupps);

    return true;
  }

  /**
   * Получить запланированные на сегодня (из профиля — запоминается)
   */
  function getPlannedSupplements() {
    const profile = getProfileSafe();
    return profile.plannedSupplements || [];
  }

  /**
   * Сохранить запланированные (в профиль — запоминается на след. день)
   */
  function savePlannedSupplements(supplements) {
    const profile = getProfileSafe();
    profile.plannedSupplements = supplements;
    saveProfileSafe(profile, 'plannedSupplements');

    // Событие для синхронизации
    window.dispatchEvent(new CustomEvent('heys:profile-updated', {
      detail: { field: 'plannedSupplements' }
    }));
  }

  /**
   * Получить принятые сегодня
   */
  function getTakenSupplements(dateKey) {
    const dayData = readStoredValue(`heys_dayv2_${dateKey}`, {});
    return dayData.supplementsTaken || [];
  }

  /**
   * Отметить витамин как принятый
   */
  function markSupplementTaken(dateKey, suppId, taken = true) {
    const dayData = readStoredValue(`heys_dayv2_${dateKey}`, { date: dateKey }) || { date: dateKey };

    let takenList = dayData.supplementsTaken || [];
    if (taken && !takenList.includes(suppId)) {
      takenList = [...takenList, suppId];
    } else if (!taken) {
      takenList = takenList.filter(id => id !== suppId);
    }

    dayData.supplementsTaken = takenList;
    dayData.supplementsTakenAt = new Date().toISOString();
    dayData.updatedAt = Date.now();

    saveDaySafe(dateKey, dayData);

    // Событие для обновления UI
    window.dispatchEvent(new CustomEvent('heys:day-updated', {
      detail: { date: dateKey, field: 'supplementsTaken' }
    }));
  }

  /**
   * Отметить все запланированные как принятые
   */
  function markAllSupplementsTaken(dateKey) {
    const dayData = readStoredValue(`heys_dayv2_${dateKey}`, { date: dateKey }) || { date: dateKey };
    const planned = dayData.supplementsPlanned || getPlannedSupplements();

    dayData.supplementsTaken = [...planned];
    dayData.supplementsTakenAt = new Date().toISOString();
    dayData.updatedAt = Date.now();

    saveDaySafe(dateKey, dayData);

    window.dispatchEvent(new CustomEvent('heys:day-updated', {
      detail: { date: dateKey, field: 'supplementsTaken' }
    }));
    if (planned && planned.length > 0) {
      window.dispatchEvent(new CustomEvent('heysSupplementsTaken', {
        detail: { date: dateKey, suppIds: [...planned] }
      }));
    }
  }

  /**
   * Получить статистику соблюдения курса за N дней
   */
  function getComplianceStats(daysBack = 7) {
    const today = new Date();
    let totalPlanned = 0;
    let totalTaken = 0;
    let daysWithData = 0;

    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = readStoredValue(`heys_dayv2_${key}`, {});

      const planned = dayData.supplementsPlanned || [];
      const taken = dayData.supplementsTaken || [];

      if (planned.length > 0) {
        daysWithData++;
        totalPlanned += planned.length;
        totalTaken += taken.filter(id => planned.includes(id)).length;
      }
    }

    return {
      daysWithData,
      totalPlanned,
      totalTaken,
      compliancePct: totalPlanned > 0 ? Math.round((totalTaken / totalPlanned) * 100) : 0
    };
  }

  // === v2.0 ФУНКЦИИ ===

  /**
   * Проверить взаимодействия между выбранными добавками
   * @param {string[]} suppIds - массив ID выбранных добавок
   * @returns {{ synergies: string[], conflicts: string[] }}
   */
  function checkInteractions(suppIds) {
    const synergies = [];
    const conflicts = [];

    if (!suppIds || suppIds.length < 2) return { synergies, conflicts };

    for (const interaction of INTERACTIONS.synergies) {
      const [a, b] = interaction.pair;
      if (suppIds.includes(a) && suppIds.includes(b)) {
        synergies.push(interaction.desc);
      }
    }

    for (const interaction of INTERACTIONS.conflicts) {
      const [a, b] = interaction.pair;
      if (suppIds.includes(a) && suppIds.includes(b)) {
        conflicts.push(interaction.desc);
      }
    }

    return { synergies, conflicts };
  }

  /**
   * Рассчитать суммарный бонус к инсулиновой волне от принятых добавок
   * @param {string} dateKey - дата YYYY-MM-DD
   * @returns {number} бонус (отрицательный = волна короче)
   */
  function getInsulinWaveBonus(dateKey) {
    const taken = getTakenSupplements(dateKey);
    if (!taken.length) return 0;

    let totalBonus = 0;
    for (const id of taken) {
      const supp = SUPPLEMENTS_CATALOG[id];
      if (supp && supp.insulinBonus) {
        totalBonus += supp.insulinBonus;
      }
    }

    // Кепаем максимумом -30%
    return Math.max(-0.30, totalBonus);
  }

  /**
   * Получить умные советы по добавкам на основе времени и состояния
   * @param {string} dateKey - дата
   * @returns {string[]} массив советов
   */
  function getSupplementAdvices(dateKey) {
    const advices = [];
    const now = new Date();
    const hour = now.getHours();

    const dayData = readStoredValue(`heys_dayv2_${dateKey}`, {});
    const planned = dayData.supplementsPlanned || getPlannedSupplements();
    const taken = dayData.supplementsTaken || [];
    const notTaken = planned.filter(id => !taken.includes(id));

    if (notTaken.length === 0) return advices;

    // Утренние добавки
    if (hour >= 6 && hour < 12) {
      const morningSupps = notTaken.filter(id => {
        const s = SUPPLEMENTS_CATALOG[id];
        return s && (s.timing === 'morning' || s.timing === 'empty');
      });
      if (morningSupps.length > 0) {
        const names = morningSupps.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
        advices.push(`🌅 Утро — время для: ${names}`);
      }
    }

    // Вечерние добавки
    if (hour >= 18 && hour < 23) {
      const eveningSupps = notTaken.filter(id => {
        const s = SUPPLEMENTS_CATALOG[id];
        return s && (s.timing === 'evening' || s.timing === 'beforeBed');
      });
      if (eveningSupps.length > 0) {
        const names = eveningSupps.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
        advices.push(`🌙 Вечер — время для: ${names}`);
      }
    }

    // Напоминание про жирорастворимые с едой
    const fatSoluble = notTaken.filter(id => SUPPLEMENTS_CATALOG[id]?.timing === 'withFat');
    if (fatSoluble.length > 0 && hour >= 12 && hour < 15) {
      const names = fatSoluble.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
      advices.push(`🥑 С обедом (нужны жиры): ${names}`);
    }

    // Метаболизм перед едой
    const beforeMeal = notTaken.filter(id => SUPPLEMENTS_CATALOG[id]?.timing === 'beforeMeal');
    if (beforeMeal.length > 0) {
      const names = beforeMeal.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
      advices.push(`⏰ За 15-30 мин до еды: ${names}`);
    }

    return advices;
  }

  /**
   * Получить подсказку по времени приёма
   * @param {string} timing - код времени
   * @returns {string} человекочитаемая подсказка
   */
  function getTimingHint(timing) {
    const hints = {
      morning: '🌅 утром',
      withFood: '🍽️ с едой',
      withFat: '🥑 с жирной едой',
      evening: '🌆 вечером',
      beforeBed: '🌙 перед сном',
      empty: '💨 натощак',
      beforeMeal: '⏰ до еды',
      afterTrain: '💪 после трени',
      anytime: '🕐 в любое время',
    };
    return hints[timing] || '';
  }

  // === ГРУППИРОВКА ПО ВРЕМЕНИ ПРИЁМА ===
  const TIME_GROUPS = {
    morning: { label: '🌅 Утро', timings: ['morning', 'empty'], order: 1 },
    withMeal: { label: '🍽️ С едой', timings: ['withFood', 'withFat', 'beforeMeal'], order: 2 },
    evening: { label: '🌙 Вечер', timings: ['evening', 'beforeBed'], order: 3 },
    anytime: { label: '🕐 Любое время', timings: ['anytime', 'afterTrain'], order: 4 },
  };

  /**
   * Сгруппировать добавки по времени приёма
   * @param {string[]} suppIds - массив ID добавок
   * @returns {Object} { morning: [...], withMeal: [...], evening: [...], anytime: [...] }
   */
  function groupByTimeOfDay(suppIds) {
    const groups = { morning: [], withMeal: [], evening: [], anytime: [] };

    for (const id of suppIds) {
      const supp = SUPPLEMENTS_CATALOG[id];
      if (!supp) continue;

      let placed = false;
      for (const [groupId, group] of Object.entries(TIME_GROUPS)) {
        if (group.timings.includes(supp.timing)) {
          groups[groupId].push(id);
          placed = true;
          break;
        }
      }
      // Если timing не найден — в anytime
      if (!placed) groups.anytime.push(id);
    }

    // UX: чтобы не путать пользователя лишним бейджем "Любое время",
    // добавки "в любое время" и "после трени" показываем в блоке "Утро".
    if (groups.anytime.length > 0) {
      groups.morning = groups.morning.concat(groups.anytime);
      groups.anytime = [];
    }

    return groups;
  }

  // === v4.0: СВОДНЫЙ ЭКРАН "МОЙ КУРС" ===

  /**
   * Открыть полноценный сводный экран витаминов
   * @param {string} dateKey - дата
   * @param {Function} onClose - callback при закрытии
   */
  function openMyCourseScreen(dateKey, onClose) {
    // Создаём контейнер
    let container = document.getElementById('supp-course-screen');
    if (!container) {
      container = document.createElement('div');
      container.id = 'supp-course-screen';
      document.body.appendChild(container);
    }

    let screenRootInstance = null;

    const U = HEYS.utils || {};
    const hasScience = HEYS.Supplements.SCIENCE?.BIOAVAILABILITY;

    // Визуальные константы (без зависимости от CSS/темы)
    const COURSE_MODAL_MAX_WIDTH = 640;
    const COURSE_MODAL_SIDE_PAD = 12;
    const DEFAULT_BOTTOM_MENU_PX = 72; // fallback (старое значение)
    const COURSE_MODAL_BOTTOM_GAP_PX = 10; // визуальный зазор над нижним меню

    // === Адаптивная высота нижнего меню (.tabs) + safe-area ===
    // Важно: в CSS нижние табы имеют padding-bottom: env(safe-area-inset-bottom)
    // Поэтому корректнее брать реальную высоту через DOM, а не хардкод.
    let _safeAreaInsetBottomPx = null;
    let _rerenderRaf = null;

    function getSafeAreaInsetBottomPxCached() {
      if (_safeAreaInsetBottomPx !== null) return _safeAreaInsetBottomPx;
      try {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom, 0px);pointer-events:none;z-index:-1;';
        document.body.appendChild(el);
        const px = parseFloat(window.getComputedStyle(el).paddingBottom) || 0;
        el.remove();
        _safeAreaInsetBottomPx = Math.max(0, Math.round(px));
        return _safeAreaInsetBottomPx;
      } catch (e) {
        _safeAreaInsetBottomPx = 0;
        return 0;
      }
    }

    function getBottomTabsOccupiedPx() {
      try {
        const tabs = document.querySelector('.tabs');
        if (!tabs) return 0;
        const rect = tabs.getBoundingClientRect();
        if (!rect || rect.height <= 0) return 0;
        // rect.top измеряется относительно layout viewport. Берём window.innerHeight для консистентности.
        const occupied = Math.max(0, Math.round(window.innerHeight - rect.top));
        // Небольшой sanity clamp, чтобы не улетать при странных значениях.
        return Math.min(260, occupied);
      } catch (e) {
        return 0;
      }
    }

    function getBottomOffsetPx() {
      const safePx = getSafeAreaInsetBottomPxCached();
      const tabsEl = document.querySelector('.tabs');
      // Если табы есть — они уже включают safe-area.
      if (tabsEl) {
        const tabsPx = getBottomTabsOccupiedPx();
        return tabsPx > 0 ? Math.max(safePx, tabsPx) : DEFAULT_BOTTOM_MENU_PX;
      }
      // Если табов нет — не добавляем “лишний” отступ, только safe-area.
      return safePx;
    }

    const renderScreenRoot = () => {
      if (!screenRootInstance) {
        screenRootInstance = ReactDOM.createRoot(container);
      }
      screenRootInstance.render(renderScreen());
    };

    const requestRerender = () => {
      if (_rerenderRaf) cancelAnimationFrame(_rerenderRaf);
      _rerenderRaf = requestAnimationFrame(() => {
        _rerenderRaf = null;
        try {
          renderScreenRoot();
        } catch (e) {
          // no-op
        }
      });
    };

    // Локальное UI-состояние модалки (живёт в замыкании)
    const uiState = {
      expandedSupp: {}, // { [suppId]: boolean }
    };

    const closeScreen = () => {
      try {
        if (_rerenderRaf) {
          cancelAnimationFrame(_rerenderRaf);
          _rerenderRaf = null;
        }
        window.removeEventListener('resize', requestRerender);
        window.removeEventListener('orientationchange', requestRerender);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', requestRerender);
          window.visualViewport.removeEventListener('scroll', requestRerender);
        }
      } catch (e) {
        // no-op
      }
      if (screenRootInstance) {
        screenRootInstance.unmount();
        screenRootInstance = null;
      }
      if (onClose) onClose();
    };

    // Рендер экрана
    const renderScreen = () => {
      const bottomOffsetPx = getBottomOffsetPx();
      const planned = getPlannedSupplements();
      const stats = getComplianceStats(14); // 2 недели
      const userFlags = getSupplementUserFlags();

      return React.createElement('div', {
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: `${bottomOffsetPx}px`,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          paddingLeft: `${COURSE_MODAL_SIDE_PAD}px`,
          paddingRight: `${COURSE_MODAL_SIDE_PAD}px`
        },
        onClick: (e) => { if (e.target === e.currentTarget) closeScreen(); }
      },
        React.createElement('div', {
          style: {
            flex: 1,
            marginTop: '40px',
            marginBottom: `${COURSE_MODAL_BOTTOM_GAP_PX}px`,
            background: 'var(--bg-secondary, #f8fafc)',
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
            borderBottomLeftRadius: '20px',
            borderBottomRightRadius: '20px',
            overflow: 'auto',
            maxHeight: `calc(100vh - 40px - ${bottomOffsetPx}px - ${COURSE_MODAL_BOTTOM_GAP_PX}px)`,
            width: '100%',
            maxWidth: `${COURSE_MODAL_MAX_WIDTH}px`,
            alignSelf: 'center'
          }
        },
          // Шапка
          React.createElement('div', {
            style: {
              position: 'sticky',
              top: 0,
              background: 'var(--card, #fff)',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 1
            }
          },
            React.createElement('span', { style: { fontWeight: '700', fontSize: '18px' } }, '💊 Мой курс витаминов'),
            React.createElement('button', {
              onClick: closeScreen,
              style: {
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px',
                color: '#64748b'
              }
            }, '×')
          ),

          // Контент
          React.createElement('div', { style: { padding: '16px', paddingBottom: '24px' } },
            // === Статистика курса ===
            React.createElement('div', {
              style: {
                background: 'var(--card, #fff)',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' } }, '📊 Статистика за 14 дней'),
              React.createElement('div', {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  textAlign: 'center'
                }
              },
                // Соблюдение
                React.createElement('div', {
                  style: {
                    background: stats.compliancePct >= 80 ? '#f0fdf4' : (stats.compliancePct >= 50 ? '#fffbeb' : '#fef2f2'),
                    borderRadius: '12px',
                    padding: '12px 8px'
                  }
                },
                  React.createElement('div', {
                    style: {
                      fontSize: '24px',
                      fontWeight: '700',
                      color: stats.compliancePct >= 80 ? '#16a34a' : (stats.compliancePct >= 50 ? '#d97706' : '#dc2626')
                    }
                  }, `${stats.compliancePct}%`),
                  React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } }, 'соблюдение')
                ),
                // Дней
                React.createElement('div', {
                  style: { background: 'var(--bg-secondary, #f1f5f9)', borderRadius: '12px', padding: '12px 8px' }
                },
                  React.createElement('div', { style: { fontSize: '24px', fontWeight: '700', color: '#334155' } }, stats.daysWithData),
                  React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } }, 'дней трекинга')
                ),
                // Принято
                React.createElement('div', {
                  style: { background: 'var(--bg-secondary, #f1f5f9)', borderRadius: '12px', padding: '12px 8px' }
                },
                  React.createElement('div', { style: { fontSize: '24px', fontWeight: '700', color: '#334155' } }, `${stats.totalTaken}/${stats.totalPlanned}`),
                  React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } }, 'принято')
                )
              )
            ),

            // === Мои витамины (список с настройками) ===
            React.createElement('div', {
              style: {
                background: 'var(--card, #fff)',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }
            },
              React.createElement('div', {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }
              },
                React.createElement('span', { style: { fontWeight: '600', fontSize: '15px' } }, `✅ Мои витамины (${planned.length})`),
                React.createElement('button', {
                  onClick: () => {
                    if (HEYS.showCheckin?.supplements) {
                      // Важно: чек-ин модалка должна быть поверх (а у нас оверлей курса на top)
                      // Поэтому закрываем экран курса, открываем чек-ин, затем возвращаем курс.
                      closeScreen();
                      setTimeout(() => {
                        HEYS.showCheckin.supplements(dateKey, () => {
                          openMyCourseScreen(dateKey, onClose);
                        });
                      }, 50);
                    }
                  },
                  style: {
                    background: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }
                }, '+ Изменить')
              ),

              // Список витаминов с настройками
              planned.length === 0
                ? React.createElement('div', { style: { color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' } },
                  'Витамины не выбраны. Нажмите "+ Изменить" чтобы добавить.'
                )
                : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                  planned.map(id => {
                    const supp = SUPPLEMENTS_CATALOG[id];
                    if (!supp) return null;
                    const bio = hasScience && HEYS.Supplements.SCIENCE.BIOAVAILABILITY[id];
                    const setting = getSupplementSetting(id) || {};
                    const history = getSupplementHistory(id);
                    const timingInfo = TIMING[supp.timing];

                    const isExpanded = uiState.expandedSupp[id] === true;
                    const cInfo = getCourseInfo(id, dateKey);
                    const sideSum = getSideEffectSummary(id);
                    const warnings = getSafetyWarningsForSupplement(id, userFlags);

                    return React.createElement('div', {
                      key: id,
                      style: {
                        background: 'var(--bg-secondary, #f8fafc)',
                        borderRadius: '12px',
                        padding: '12px',
                        border: '1px solid #e2e8f0'
                      }
                    },
                      // Название и иконка
                      React.createElement('div', {
                        style: {
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px'
                        }
                      },
                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                          React.createElement('span', { style: { fontSize: '18px' } }, supp.icon),
                          React.createElement('span', { style: { fontWeight: '600', fontSize: '14px' } }, supp.name)
                        ),
                        // Кнопка научной карточки
                        bio && React.createElement('button', {
                          onClick: () => {
                            openSupplementsSciencePopup(id);
                          },
                          style: {
                            background: '#eff6ff',
                            border: '1px solid #93c5fd',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: '600',
                            color: '#1d4ed8',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }
                        }, '🔬 Наука')
                      ),
                      // Мета-информация
                      React.createElement('div', {
                        style: {
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '8px',
                          fontSize: '12px',
                          color: '#64748b'
                        }
                      },
                        // Время приёма
                        timingInfo && React.createElement('span', {
                          style: {
                            background: 'var(--card, #fff)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0'
                          }
                        }, `${timingInfo.icon} ${timingInfo.name}`),
                        // Форма (если выбрана)
                        setting.form && React.createElement('span', {
                          style: {
                            background: '#eff6ff',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            color: '#1d4ed8'
                          }
                        }, setting.form),
                        // Доза (с конвертацией единиц)
                        setting.dose && React.createElement('span', {
                          style: {
                            background: '#f0fdf4',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            color: '#16a34a'
                          }
                        }, getDoseDisplay(id, setting, bio)),
                        // Курсовость (недели + предупреждение о перерыве)
                        (() => {
                          if (!cInfo || cInfo.weeksOnCourse < 1) return null;
                          const needsBreak = cInfo.needsBreak;
                          return React.createElement('span', {
                            style: {
                              background: needsBreak ? '#fef2f2' : '#fef3c7',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              color: needsBreak ? '#dc2626' : '#92400e'
                            }
                          }, needsBreak ? `⚠️ ${cInfo.weeksOnCourse} нед. (нужен перерыв!)` : `📅 ${cInfo.weeksOnCourse} нед.`);
                        })()
                      ),

                      // Короткий статус + управление деталями (чтобы не было «каши»)
                      (() => {
                        const hasEffects = sideSum && sideSum.total > 0;
                        const needsBreak = cInfo?.needsBreak === true;
                        const w0 = warnings && warnings.length ? warnings[0] : null;

                        let msg = null;
                        let bg = '#ffffff';
                        let color = '#64748b';

                        if (w0) {
                          msg = `⚠️ ${w0}${warnings.length > 1 ? ` (+${warnings.length - 1})` : ''}`;
                          bg = '#fef2f2';
                          color = '#dc2626';
                        } else if (needsBreak) {
                          msg = `⏰ На курсе ${cInfo.weeksOnCourse} нед. — пора перерыв`;
                          bg = '#fffbeb';
                          color = '#92400e';
                        } else if (hasEffects) {
                          msg = `⚡ Побочки: ${sideSum.total} за ${sideSum.days} дн.`;
                          bg = '#fffbeb';
                          color = '#92400e';
                        }

                        return React.createElement('div', {
                          style: {
                            marginTop: '8px',
                            background: bg,
                            borderRadius: '10px',
                            padding: '8px 10px',
                            fontSize: '12px',
                            color,
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '10px',
                            alignItems: 'center',
                            border: msg ? 'none' : '1px solid #e2e8f0'
                          }
                        },
                          React.createElement('div', { style: { flex: 1 } }, msg || 'Советы, объяснения и детали'),
                          React.createElement('button', {
                            onClick: () => {
                              uiState.expandedSupp[id] = !isExpanded;
                              renderScreenRoot();
                            },
                            style: {
                              background: 'var(--card, #fff)',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              padding: '4px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              color: '#334155',
                              fontWeight: '600'
                            }
                          }, isExpanded ? 'Скрыть' : 'Подробнее')
                        );
                      })(),

                      // Детали (по запросу)
                      isExpanded && React.createElement('div', { style: { marginTop: '8px' } },
                        // Why-now badges ("почему именно сейчас")
                        (() => {
                          const badges = getWhyNowBadges(id, planned, setting, bio);
                          if (!badges || badges.length === 0) return null;
                          return React.createElement('div', {
                            style: {
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '6px',
                              marginBottom: '8px'
                            }
                          }, badges.map((b, bi) => React.createElement('span', {
                            key: bi,
                            style: {
                              fontSize: '11px',
                              background: b.warn ? '#fef2f2' : '#f0fdf4',
                              color: b.warn ? '#dc2626' : '#16a34a',
                              padding: '2px 6px',
                              borderRadius: '6px'
                            }
                          }, `${b.icon} ${b.t}`)));
                        })(),

                        // Все safety warnings
                        warnings && warnings.length > 0 && React.createElement('div', {
                          style: {
                            background: '#fef2f2',
                            borderRadius: '10px',
                            padding: '8px 10px',
                            fontSize: '12px',
                            color: '#dc2626',
                            marginBottom: '8px'
                          }
                        }, warnings.map((w, wi) => React.createElement('div', { key: wi, style: { marginBottom: wi < warnings.length - 1 ? '6px' : 0 } }, `⚠️ ${w}`))),

                        // Побочные эффекты (история + кнопка)
                        (() => {
                          const hasEffects = sideSum && sideSum.total > 0;
                          return React.createElement('div', {
                            style: {
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }
                          },
                            hasEffects && React.createElement('span', {
                              style: {
                                fontSize: '12px',
                                color: '#f59e0b'
                              }
                            }, `⚡ ${sideSum.total} эффектов за ${sideSum.days} дн.`),
                            React.createElement('button', {
                              onClick: (e) => {
                                e.stopPropagation();
                                const effect = prompt('Опишите побочный эффект (можно коротко). Отмена — не сохраняем:');
                                if (effect && effect.trim()) {
                                  logSupplementSideEffect(id, dateKey, { note: effect.trim(), symptom: 'other' });
                                  HEYS.Toast?.tip('Записано. Если повторяется — попробуйте сменить время/форму или снизить дозу.') || alert('Записано. Если повторяется — попробуйте сменить время/форму или снизить дозу.');
                                  renderScreenRoot();
                                }
                              },
                              style: {
                                background: '#fef3c7',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                fontSize: '12px',
                                color: '#92400e',
                                cursor: 'pointer',
                                fontWeight: '600'
                              }
                            }, '+ Побочка')
                          );
                        })(),

                        // Совет
                        supp.tip && React.createElement('div', {
                          style: {
                            fontSize: '12px',
                            color: '#64748b',
                            marginTop: '8px',
                            fontStyle: 'italic'
                          }
                        }, `💡 ${supp.tip}`)
                      )
                    );
                  })
                )
            ),

            // === Мои условия (user flags) ===
            React.createElement('div', {
              style: {
                background: 'var(--card, #fff)',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' } }, '⚕️ Мои условия'),
              React.createElement('div', { style: { fontSize: '12px', color: '#64748b', marginBottom: '10px' } }, 'Отметьте для персональных предупреждений:'),
              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                Object.entries(SUPP_USER_FLAGS).map(([flagId, flagData]) => {
                  const currentFlags = getSupplementUserFlags();
                  const isChecked = currentFlags[flagId] === true;
                  return React.createElement('label', {
                    key: flagId,
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      background: isChecked ? '#fef3c7' : '#f8fafc',
                      borderRadius: '10px',
                      cursor: 'pointer'
                    }
                  },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: isChecked,
                      onChange: () => {
                        setSupplementUserFlag(flagId, !isChecked);
                        renderScreenRoot();
                      },
                      style: { width: '18px', height: '18px' }
                    }),
                    React.createElement('span', { style: { fontSize: '14px' } }, flagData.label)
                  );
                })
              )
            ),

            // === Рекомендации по рациону ===
            (() => {
              const dietSuggestions = getWeeklyDietSuggestions(7);
              if (!dietSuggestions || dietSuggestions.length === 0) return null;
              return React.createElement('div', {
                style: {
                  background: 'var(--card, #fff)',
                  borderRadius: '16px',
                  padding: '16px',
                  marginBottom: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }
              },
                React.createElement('div', { style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' } }, '🥗 По вашему рациону'),
                React.createElement('div', { style: { fontSize: '12px', color: '#64748b', marginBottom: '10px' } }, 'Анализ питания за 7 дней:'),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                  dietSuggestions.map((sug, si) => {
                    const isSupplement = !!sug.suppId;
                    const isPlanned = isSupplement && planned.includes(sug.suppId);
                    return React.createElement('div', {
                      key: si,
                      style: {
                        background: isPlanned ? '#f0fdf4' : '#fffbeb',
                        border: isPlanned ? '1px solid #86efac' : '1px solid #fcd34d',
                        borderRadius: '10px',
                        padding: '10px'
                      }
                    },
                      React.createElement('div', { style: { fontWeight: '600', fontSize: '13px', color: '#334155' } },
                        sug.icon, ' ', isSupplement ? (SUPPLEMENTS_CATALOG[sug.suppId]?.name || sug.suppId) : sug.title,
                        isPlanned && React.createElement('span', { style: { color: '#16a34a', marginLeft: '8px', fontWeight: '400' } }, '✓ уже в курсе')
                      ),
                      React.createElement('div', { style: { fontSize: '12px', color: '#64748b', marginTop: '4px' } }, sug.reason),
                      (!isPlanned && isSupplement) && React.createElement('button', {
                        onClick: () => {
                          const current = getPlannedSupplements();
                          if (!current.includes(sug.suppId)) {
                            savePlannedSupplements([...current, sug.suppId]);
                            renderScreenRoot();
                          }
                        },
                        style: {
                          marginTop: '8px',
                          background: '#3b82f6',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }
                      }, '+ Добавить в курс')
                    );
                  })
                )
              );
            })(),

            // === Взаимодействия ===
            (() => {
              const { synergies, conflicts } = checkInteractions(planned);
              if (synergies.length === 0 && conflicts.length === 0) return null;

              return React.createElement('div', {
                style: {
                  background: 'var(--card, #fff)',
                  borderRadius: '16px',
                  padding: '16px',
                  marginBottom: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }
              },
                React.createElement('div', { style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' } }, '🔗 Взаимодействия'),
                synergies.length > 0 && React.createElement('div', {
                  style: {
                    background: '#f0fdf4',
                    borderRadius: '10px',
                    padding: '10px',
                    marginBottom: synergies.length > 0 && conflicts.length > 0 ? '10px' : 0,
                    fontSize: '12px',
                    color: '#16a34a'
                  }
                }, synergies.map((s, i) => React.createElement('div', { key: i, style: { marginBottom: i < synergies.length - 1 ? '4px' : 0 } }, s))),
                conflicts.length > 0 && React.createElement('div', {
                  style: {
                    background: '#fffbeb',
                    borderRadius: '10px',
                    padding: '10px',
                    fontSize: '12px',
                    color: '#d97706'
                  }
                }, conflicts.map((c, i) => React.createElement('div', { key: i, style: { marginBottom: i < conflicts.length - 1 ? '4px' : 0 } }, c)))
              );
            })(),

            // === Готовые курсы ===
            React.createElement('div', {
              style: {
                background: 'var(--card, #fff)',
                borderRadius: '16px',
                padding: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' } }, '📦 Готовые курсы'),
              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                Object.entries(COURSES).map(([cid, course]) => {
                  const isActive = course.supplements.every(id => planned.includes(id));
                  return React.createElement('button', {
                    key: cid,
                    onClick: () => {
                      if (!isActive) {
                        applyCourse(cid);
                        renderScreenRoot();
                      }
                    },
                    disabled: isActive,
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: isActive ? '#f0fdf4' : '#f8fafc',
                      border: isActive ? '2px solid #86efac' : '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '12px',
                      cursor: isActive ? 'default' : 'pointer',
                      textAlign: 'left'
                    }
                  },
                    React.createElement('div', null,
                      React.createElement('div', { style: { fontWeight: '600', fontSize: '14px', color: '#334155' } },
                        course.name,
                        isActive && React.createElement('span', { style: { color: '#16a34a', marginLeft: '8px' } }, '✓ активен')
                      ),
                      React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '2px' } },
                        course.supplements.map(id => SUPPLEMENTS_CATALOG[id]?.name || id).join(', ')
                      )
                    ),
                    !isActive && React.createElement('span', { style: { fontSize: '12px', color: '#3b82f6', fontWeight: '600' } }, 'Добавить →')
                  );
                })
              )
            )
          )
        )
      );
    };

    // Обновляем размеры при изменении viewport (клавиатура/поворот/resize)
    try {
      window.addEventListener('resize', requestRerender);
      window.addEventListener('orientationchange', requestRerender);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', requestRerender);
        window.visualViewport.addEventListener('scroll', requestRerender);
      }
    } catch (e) {
      // no-op
    }

    renderScreenRoot();
  }

  // === КОМПОНЕНТ КАРТОЧКИ В СТАТИСТИКЕ v4.0 ===

  // v3.3: Root для научного popup (React 18 createRoot)
  let sciencePopupRoot = null;
  let sciencePopupRootInstance = null;

  function openSupplementsSciencePopup(suppId) {
    const hasScience = HEYS.Supplements?.SCIENCE?.BIOAVAILABILITY;
    if (!hasScience) return;

    if (!sciencePopupRoot) {
      sciencePopupRoot = document.createElement('div');
      sciencePopupRoot.id = 'supp-science-popup';
      document.body.appendChild(sciencePopupRoot);
    }

    if (!sciencePopupRootInstance) {
      sciencePopupRootInstance = ReactDOM.createRoot(sciencePopupRoot);
    }

    const closePopup = () => {
      if (sciencePopupRootInstance) {
        sciencePopupRootInstance.unmount();
        sciencePopupRootInstance = null;
      }
      if (sciencePopupRoot && sciencePopupRoot.parentNode) {
        sciencePopupRoot.parentNode.removeChild(sciencePopupRoot);
        sciencePopupRoot = null;
      }
    };

    sciencePopupRootInstance.render(renderSciencePopup(suppId, closePopup));
  }

  /**
   * Рендер карточки витаминов для вкладки статистики
   * Переработанная версия — чистая, интуитивная, с кнопкой "Мой курс"
   * @param {Object} props - { dateKey, onForceUpdate }
   * @returns {React.Element|null}
   */
  function renderSupplementsCard(props) {
    const { dateKey, onForceUpdate } = props || {};
    if (!dateKey) return null;

    const dayData = readStoredValue(`heys_dayv2_${dateKey}`, {});

    // v3.3: Используем planned из дня ИЛИ из профиля (если чек-ин не был)
    const planned = dayData.supplementsPlanned || getPlannedSupplements();
    const taken = dayData.supplementsTaken || [];

    // v4.0: Если ничего не запланировано — приглашаем настроить
    if (planned.length === 0) {
      return React.createElement('div', {
        className: 'compact-card supplements-card',
        style: {
          background: '#fff1f2',
          borderRadius: '16px',
          padding: '16px',
          marginBottom: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
        }
      },
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px'
          }
        },
          React.createElement('span', {
            style: { fontWeight: '600', fontSize: '15px' }
          }, '💊 Витамины')
        ),
        React.createElement('div', {
          style: {
            textAlign: 'center',
            padding: '16px',
            background: 'var(--bg-secondary, #f8fafc)',
            borderRadius: '12px'
          }
        },
          React.createElement('div', {
            style: { fontSize: '32px', marginBottom: '8px' }
          }, '💊'),
          React.createElement('div', {
            style: { fontSize: '14px', fontWeight: '500', color: '#334155', marginBottom: '4px' }
          }, 'Витамины не настроены'),
          React.createElement('div', {
            style: { fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }
          }, 'Отслеживайте приём добавок и получайте умные рекомендации'),
          React.createElement('button', {
            onClick: () => openMyCourseScreen(dateKey, onForceUpdate),
            style: {
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }
          }, '⚙️ Настроить курс')
        )
      );
    }

    const allTaken = planned.length > 0 && planned.every(id => taken.includes(id));
    const takenCount = planned.filter(id => taken.includes(id)).length;

    // v3.0: Группируем по времени приёма
    const timeGroups = groupByTimeOfDay(planned);

    // v2.0: Проверяем взаимодействия
    const { synergies, conflicts } = checkInteractions(planned);

    // v2.0: Проверяем бонус к инсулиновой волне
    const insulinBonus = getInsulinWaveBonus(dateKey);

    // v3.3: Проверяем наличие научных данных
    const hasScience = HEYS.Supplements.SCIENCE?.BIOAVAILABILITY;

    const cardStateKey = `heys_supplements_card_${dateKey}`;
    const isExpanded = readSessionValue(cardStateKey, false);

    const setExpanded = (next) => {
      writeSessionValue(cardStateKey, !!next);
      if (onForceUpdate) onForceUpdate();
    };

    const toggleExpanded = (e) => {
      if (e?.stopPropagation) e.stopPropagation();
      setExpanded(!isExpanded);
    };

    const handleCardClick = (e) => {
      if (isInteractiveTarget(e?.target)) return;
      setExpanded(!isExpanded);
    };

    const toggleTaken = (id) => {
      const isTaken = taken.includes(id);
      markSupplementTaken(dateKey, id, !isTaken);
      if (onForceUpdate) onForceUpdate();
    };

    const markAll = () => {
      markAllSupplementsTaken(dateKey);
      if (onForceUpdate) onForceUpdate();
    };

    // v3.3: Открыть научный popup
    const openSciencePopup = (suppId) => {
      if (!hasScience) return;
      openSupplementsSciencePopup(suppId);
    };

    // Рендер группы витаминов с анимацией + Smart Schedule batch-кнопка
    const renderGroup = (groupId, suppIds) => {
      if (suppIds.length === 0) return null;
      const group = TIME_GROUPS[groupId];
      const groupTakenCount = suppIds.filter(id => taken.includes(id)).length;
      const allGroupTaken = groupTakenCount === suppIds.length;
      const notTakenInGroup = suppIds.filter(id => !taken.includes(id));

      // UI: цвета для бейджа времени приёма (чтобы визуально разделить группы)
      const GROUP_THEME = {
        morning: { bg: '#fef3c7', border: '#f59e0b', fg: '#92400e' },   // amber
        withMeal: { bg: '#dbeafe', border: '#60a5fa', fg: '#1d4ed8' },  // blue
        evening: { bg: '#ede9fe', border: '#a78bfa', fg: '#6d28d9' },   // violet
        anytime: { bg: '#f1f5f9', border: '#cbd5e1', fg: '#334155' },   // slate
      };
      const theme = GROUP_THEME[groupId] || GROUP_THEME.anytime;

      // v3.5: Batch mark для группы
      const markGroupTaken = () => {
        if (notTakenInGroup.length > 0) {
          markSupplementsTaken(dateKey, notTakenInGroup, true);
          if (onForceUpdate) onForceUpdate();
        }
      };

      return React.createElement('div', {
        key: groupId,
        style: { marginBottom: '12px' }
      },
        // Заголовок группы с batch-кнопкой
        React.createElement('div', {
          style: {
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }
        },
          // Бейдж времени приёма (слева)
          React.createElement('div', {
            style: {
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              color: theme.fg,
              borderRadius: '999px',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: '800',
              lineHeight: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }
          },
            group.label,
            allGroupTaken && React.createElement('span', { style: { fontWeight: '900' } }, '✓')
          ),

          // Batch-кнопка (справа)
          React.createElement('div', null,
            suppIds.length > 1 && React.createElement('button', {
              onClick: allGroupTaken ? null : markGroupTaken,
              style: {
                background: allGroupTaken ? '#f0fdf4' : '#dbeafe',
                border: allGroupTaken ? '1px solid #86efac' : '1px solid #60a5fa',
                borderRadius: '10px',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: '700',
                color: allGroupTaken ? '#16a34a' : '#2563eb',
                cursor: allGroupTaken ? 'default' : 'pointer'
              },
              title: allGroupTaken ? 'Все приняты' : `Отметить все: ${notTakenInGroup.length} шт`
            }, allGroupTaken ? '✓ выпил все' : 'выпить все')
          )
        ),
        // Чипы витаминов
        React.createElement('div', {
          style: { display: 'flex', flexWrap: 'wrap', gap: '6px' }
        },
          suppIds.map(id => {
            const supp = SUPPLEMENTS_CATALOG[id];
            if (!supp) return null;
            const isTaken = taken.includes(id);
            const hasScienceData = hasScience && HEYS.Supplements.SCIENCE.BIOAVAILABILITY[id];
            const setting = getSupplementSetting(id) || {};
            const whyBadges = getWhyNowBadges(id, planned, setting, hasScienceData);
            const firstBadge = whyBadges && whyBadges.length > 0 ? whyBadges[0] : null;

            // v3.3: Таймер для долгого нажатия
            let longPressTimer = null;
            let isLongPress = false;

            const handleTouchStart = (e) => {
              isLongPress = false;
              longPressTimer = setTimeout(() => {
                isLongPress = true;
                // Вибрация для тактильной обратной связи
                if (navigator.vibrate) navigator.vibrate(50);
                openSciencePopup(id);
              }, 500); // 500ms для долгого нажатия
            };

            const handleTouchEnd = (e) => {
              clearTimeout(longPressTimer);
              // Не делаем toggle здесь — это сделает onClick
              // isLongPress сбросится в handleClick если был long press
            };

            const handleTouchMove = () => {
              clearTimeout(longPressTimer);
            };

            // Обработчик клика (для десктопа и мобильных без hasScienceData)
            const handleClick = (e) => {
              // Если это был long press на touch — не toggle (уже открыт popup)
              if (isLongPress) {
                isLongPress = false;
                return;
              }
              const btn = e.currentTarget;
              btn.style.transform = 'scale(1.15)';
              setTimeout(() => { btn.style.transform = 'scale(1)'; }, 150);
              toggleTaken(id);
            };

            return React.createElement('button', {
              key: id,
              className: 'supp-chip',
              onTouchStart: hasScienceData ? handleTouchStart : null,
              onTouchEnd: hasScienceData ? handleTouchEnd : null,
              onTouchMove: hasScienceData ? handleTouchMove : null,
              onClick: handleClick,  // Всегда обрабатываем клик
              title: supp.tip + (hasScienceData ? ' (нажми 🔬 для подробностей)' : '') + (firstBadge ? ` | ${firstBadge.icon} ${firstBadge.t}` : ''),
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: '14px',
                border: firstBadge?.warn ? '1px solid #fca5a5' : 'none',
                background: isTaken ? '#dcfce7' : (firstBadge?.warn ? '#fef2f2' : '#f1f5f9'),
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                color: isTaken ? '#16a34a' : (firstBadge?.warn ? '#dc2626' : '#64748b'),
                transition: 'all 0.15s ease',
                transform: 'scale(1)',
                position: 'relative'
              }
            },
              React.createElement('span', null, isTaken ? '✅' : supp.icon),
              React.createElement('span', null, supp.name),
              // v3.6: Явная кнопка "🔬" для открытия научной карточки (без конфликта с toggle)
              hasScienceData && React.createElement('span', {
                role: 'button',
                tabIndex: 0,
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openSciencePopup(id);
                },
                onKeyDown: (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    openSciencePopup(id);
                  }
                },
                title: '🔬 Открыть научную карточку',
                style: {
                  fontSize: '10px',
                  marginLeft: '4px',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  border: '1px solid #93c5fd',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  lineHeight: '14px',
                  fontWeight: '600',
                  opacity: 0.95
                }
              }, '🔬')
            );
          })
        )
      );
    };

    return React.createElement('div', {
      className: 'compact-card supplements-card',
      onClick: handleCardClick,
      style: {
        background: '#fff1f2',
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }
    },
      // v4.1: Шапка (1 строка)
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '6px'
        }
      },
        // Левая часть: название + прогресс
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          React.createElement('span', {
            style: { fontWeight: '600', fontSize: '15px' }
          }, '💊 Витамины'),
          // Прогресс-бар
          React.createElement('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }
          },
            React.createElement('div', {
              style: {
                width: '60px',
                height: '6px',
                background: '#e2e8f0',
                borderRadius: '3px',
                overflow: 'hidden'
              }
            },
              React.createElement('div', {
                style: {
                  width: `${(takenCount / planned.length) * 100}%`,
                  height: '100%',
                  background: allTaken ? '#22c55e' : '#3b82f6',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease'
                }
              })
            ),
            React.createElement('span', {
              style: {
                fontSize: '12px',
                color: allTaken ? '#16a34a' : '#64748b',
                fontWeight: '600'
              }
            }, `${takenCount}/${planned.length}`)
          )
        ),
        // Правая часть: бонус волны + кнопка курса + toggle
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          insulinBonus < 0 && React.createElement('span', {
            style: {
              fontSize: '10px',
              background: '#dcfce7',
              color: '#16a34a',
              padding: '2px 6px',
              borderRadius: '6px',
              fontWeight: '600'
            },
            title: 'Бонус к инсулиновой волне от добавок'
          }, `🌊${Math.round(insulinBonus * 100)}%`),
          React.createElement('button', {
            'data-supp-collapse-ignore': '1',
            onClick: (e) => {
              e.stopPropagation();
              openMyCourseScreen(dateKey, onForceUpdate);
            },
            style: {
              background: 'var(--bg-secondary, #f1f5f9)',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            },
            title: 'Открыть настройки курса'
          }, '📊'),
          React.createElement('button', {
            'data-supp-collapse-ignore': '1',
            onClick: toggleExpanded,
            style: {
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: 'var(--bg-secondary, #f8fafc)',
              color: '#64748b',
              fontSize: '14px',
              fontWeight: '700',
              cursor: 'pointer'
            },
            title: isExpanded ? 'Свернуть' : 'Развернуть'
          }, isExpanded ? '▴' : '▾')
        )
      ),
      // v4.1: Действие (2 строка)
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: isExpanded ? '10px' : 0
        }
      },
        !allTaken && React.createElement('button', {
          onClick: (e) => {
            e.stopPropagation();
            markAll();
          },
          style: {
            flex: 1,
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid #60a5fa',
            background: 'var(--bg-secondary, #f8fafc)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            color: '#2563eb',
            boxShadow: '0 1px 2px rgba(59, 130, 246, 0.12)'
          }
        }, 'Выпить все'),
        allTaken && React.createElement('div', {
          style: {
            flex: 1,
            textAlign: 'center',
            padding: '8px 10px',
            background: '#f0fdf4',
            borderRadius: '10px'
          }
        },
          React.createElement('span', { style: { fontSize: '12px', color: '#16a34a', fontWeight: '600' } }, '🎉 Все витамины приняты')
        )
      ),
      isExpanded && React.createElement(React.Fragment, null,
        // v3.1: Напоминание по времени
        (() => {
          const reminder = getTimeReminder(planned, taken);
          if (!reminder) return null;
          return React.createElement('div', {
            style: {
              fontSize: '12px',
              color: reminder.urgency === 'high' ? '#dc2626' : '#d97706',
              background: reminder.urgency === 'high' ? '#fef2f2' : '#fffbeb',
              padding: '8px 10px',
              borderRadius: '8px',
              marginBottom: '10px',
              fontWeight: '500'
            }
          }, reminder.message);
        })(),
        // v3.0: Группы по времени
        // UX: "Любое время" слито с "Утро" (см. groupByTimeOfDay)
        ['morning', 'withMeal', 'evening'].map(gid => renderGroup(gid, timeGroups[gid])),
        // v2.0: Синергии
        synergies.length > 0 && React.createElement('div', {
          style: {
            fontSize: '12px',
            color: '#16a34a',
            background: '#f0fdf4',
            padding: '8px 10px',
            borderRadius: '8px',
            marginBottom: '8px'
          }
        }, synergies.map((s, i) => React.createElement('div', { key: i }, s))),
        // v2.0: Конфликты
        conflicts.length > 0 && React.createElement('div', {
          style: {
            fontSize: '12px',
            color: '#d97706',
            background: '#fffbeb',
            padding: '8px 10px',
            borderRadius: '8px',
            marginBottom: '8px'
          }
        }, conflicts.map((c, i) => React.createElement('div', { key: i }, c))),
        // v4.0: Подсказка — компактная и понятная
        React.createElement('div', {
          style: {
            fontSize: '11px',
            color: '#94a3b8',
            textAlign: 'center',
            marginTop: '10px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }
        },
          React.createElement('span', null, '👆 Тап = ✅ принял'),
          hasScience && React.createElement('span', null, '🔬 = подробности'),
          React.createElement('span', null, '📊 = мой курс')
        )
      )
    );
  }

  // === v3.5: HELPER-ФУНКЦИИ ДЛЯ POPUP СЕКЦИЙ ===

  /**
   * Секция "Мои настройки" — форма, доза, время
   */
  function renderSettingsSection(suppId, bio, sectionStyle, labelStyle) {
    const setting = getSupplementSetting(suppId) || {};
    const forms = bio?.forms || {};
    const formIds = Object.keys(forms);

    // Если нет форм — минимальная секция
    if (formIds.length === 0) {
      return React.createElement('div', { style: sectionStyle },
        React.createElement('div', { style: labelStyle }, '⚙️ Мои настройки'),
        React.createElement('div', { style: { fontSize: '13px', color: '#64748b' } },
          'Форму и дозу можно указать вручную в профиле'
        )
      );
    }

    // Текущие значения
    const currentForm = setting.form || formIds[0];
    const currentDose = setting.dose || '';
    const currentUnit = setting.unit || forms[currentForm]?.unit || 'мг';

    // Получаем данные текущей формы
    const formData = forms[currentForm] || {};
    const absorption = formData.absorption ? Math.round(formData.absorption * 100) : null;

    return React.createElement('div', { style: sectionStyle },
      React.createElement('div', { style: labelStyle }, '⚙️ Мои настройки'),

      // Выбор формы
      formIds.length > 1 && React.createElement('div', { style: { marginBottom: '10px' } },
        React.createElement('div', { style: { fontSize: '12px', color: '#64748b', marginBottom: '4px' } }, 'Форма:'),
        React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
          formIds.map(fid => {
            const f = forms[fid];
            const isSelected = fid === currentForm;
            return React.createElement('button', {
              key: fid,
              onClick: () => {
                setSupplementSetting(suppId, { form: fid, unit: f.unit || 'мг' });
                // Перерендер popup
                window.dispatchEvent(new CustomEvent('heys:supplements-updated'));
              },
              style: {
                padding: '4px 10px',
                borderRadius: '10px',
                border: isSelected ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                background: isSelected ? '#eff6ff' : '#fff',
                color: isSelected ? '#1d4ed8' : '#64748b',
                fontSize: '12px',
                fontWeight: isSelected ? '600' : '400',
                cursor: 'pointer'
              }
            }, fid, f.absorption && ` (${Math.round(f.absorption * 100)}%)`);
          })
        )
      ),

      // Биодоступность выбранной формы
      absorption && React.createElement('div', {
        style: {
          fontSize: '12px',
          color: absorption >= 50 ? '#16a34a' : (absorption >= 20 ? '#d97706' : '#dc2626'),
          background: absorption >= 50 ? '#f0fdf4' : (absorption >= 20 ? '#fffbeb' : '#fef2f2'),
          padding: '6px 10px',
          borderRadius: '8px',
          marginBottom: '10px'
        }
      },
        absorption >= 50 ? '✓' : (absorption >= 20 ? '⚠️' : '✗'),
        ` Биодоступность ${currentForm}: ${absorption}%`,
        formData.use && ` — ${formData.use}`
      ),

      // Поле дозы (display only — упрощённо)
      React.createElement('div', { style: { fontSize: '12px', color: '#64748b' } },
        'Доза: ',
        currentDose ? `${currentDose} ${currentUnit}` : 'не указана',
        bio?.optimalDose && ` (рекомендуется: ${bio.optimalDose})`
      )
    );
  }

  /**
   * Секция "Лимиты и безопасность" — UL, предупреждения
   */
  function renderLimitsSection(suppId, sectionStyle, labelStyle) {
    const science = HEYS.Supplements.SCIENCE;
    const limits = science?.LIMITS?.[suppId];

    // v4.0: Safety warnings на основе user flags
    const userFlags = getSupplementUserFlags();
    const safetyWarnings = getSafetyWarningsForSupplement(suppId, userFlags);

    if (!limits && safetyWarnings.length === 0) return null;

    const setting = getSupplementSetting(suppId) || {};
    const currentDose = parseFloat(setting.dose) || 0;
    const ul = limits?.ul;

    // v4.0: Курсовость — проверяем продолжительность
    const cInfo = getCourseInfo(suppId, new Date().toISOString().slice(0, 10));
    const courseWarning = cInfo?.needsBreak ? `⏰ На курсе ${cInfo.weeksOnCourse} недель — рекомендуется перерыв!` : null;

    // Проверяем превышение UL
    let ulWarning = null;
    if (ul && currentDose > 0) {
      const pct = (currentDose / ul) * 100;
      if (pct > 100) {
        ulWarning = { level: 'danger', text: `⚠️ Доза ${currentDose} превышает UL (${ul})!`, pct };
      } else if (pct > 80) {
        ulWarning = { level: 'warning', text: `⚡ Доза близка к верхнему лимиту (${Math.round(pct)}% от UL)`, pct };
      }
    }

    const hasDanger = ulWarning?.level === 'danger' || safetyWarnings.length > 0 || courseWarning;

    return React.createElement('div', {
      style: {
        ...sectionStyle,
        background: hasDanger ? '#fef2f2' : (ulWarning ? '#fffbeb' : sectionStyle.background)
      }
    },
      React.createElement('div', { style: labelStyle }, '⚠️ Лимиты и безопасность'),

      // v4.0: Персональные предупреждения (на основе user flags)
      safetyWarnings.length > 0 && React.createElement('div', {
        style: {
          background: '#fee2e2',
          borderRadius: '8px',
          padding: '8px 10px',
          marginBottom: '10px'
        }
      }, safetyWarnings.map((w, i) => React.createElement('div', {
        key: i,
        style: { fontSize: '12px', color: '#dc2626', fontWeight: '500', marginBottom: i < safetyWarnings.length - 1 ? '4px' : 0 }
      }, `🚨 ${w}`))),

      // v4.0: Предупреждение о длительности курса
      courseWarning && React.createElement('div', {
        style: {
          fontSize: '12px',
          fontWeight: '600',
          color: '#d97706',
          padding: '6px 10px',
          background: '#fef3c7',
          borderRadius: '8px',
          marginBottom: '8px'
        }
      }, courseWarning),

      // UL (верхний лимит)
      ul && React.createElement('div', { style: { fontSize: '13px', marginBottom: '6px' } },
        React.createElement('span', { style: { fontWeight: '600' } }, 'UL (верхний предел): '),
        `${ul} ${limits.unit || 'мг'}/день`
      ),

      // Предупреждение о превышении
      ulWarning && React.createElement('div', {
        style: {
          fontSize: '12px',
          fontWeight: '600',
          color: ulWarning.level === 'danger' ? '#dc2626' : '#d97706',
          padding: '6px 10px',
          background: ulWarning.level === 'danger' ? '#fee2e2' : '#fef3c7',
          borderRadius: '8px',
          marginBottom: '8px'
        }
      }, ulWarning.text),

      // Риски передозировки
      limits.toxicity && React.createElement('div', { style: { fontSize: '12px', color: '#64748b', marginBottom: '6px' } },
        React.createElement('span', { style: { fontWeight: '500' } }, 'Риски: '),
        limits.toxicity
      ),

      // Рекомендуемая длительность курса
      limits.courseDuration && React.createElement('div', { style: { fontSize: '12px', color: '#64748b' } },
        React.createElement('span', { style: { fontWeight: '500' } }, 'Курс: '),
        limits.courseDuration
      )
    );
  }

  /**
   * Секция "История курса" — дни приёма, streak
   */
  function renderHistorySection(suppId, sectionStyle, labelStyle) {
    const history = getSupplementHistory();
    const h = history[suppId];

    if (!h || h.days === 0) return null;

    // Вычисляем streak (последовательные дни)
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const isActiveStreak = h.lastTaken === today || h.lastTaken === yesterday;

    return React.createElement('div', { style: sectionStyle },
      React.createElement('div', { style: labelStyle }, '📊 История курса'),

      React.createElement('div', { style: { display: 'flex', gap: '16px', fontSize: '13px' } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: '600', fontSize: '18px', color: 'var(--text, #1e293b)' } }, h.days),
          React.createElement('div', { style: { color: '#64748b', fontSize: '11px' } }, 'дней приёма')
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: '600', fontSize: '18px', color: 'var(--text, #1e293b)' } }, h.totalTaken || 0),
          React.createElement('div', { style: { color: '#64748b', fontSize: '11px' } }, 'всего принято')
        ),
        isActiveStreak && React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: '600', fontSize: '18px', color: '#16a34a' } }, '🔥'),
          React.createElement('div', { style: { color: '#16a34a', fontSize: '11px' } }, 'активный курс')
        )
      ),

      h.startDate && React.createElement('div', {
        style: { fontSize: '11px', color: '#94a3b8', marginTop: '8px' }
      }, `Начало курса: ${h.startDate}`)
    );
  }

  // === v3.3: НАУЧНЫЕ UI КОМПОНЕНТЫ ===

  /**
   * Рендер научной информации о добавке (popup)
   */
  function renderSciencePopup(suppId, onClose) {
    // Проверяем наличие научного модуля
    const science = HEYS.Supplements.SCIENCE;
    if (!science || !science.BIOAVAILABILITY) {
      return React.createElement('div', {
        style: { padding: '16px', textAlign: 'center', color: '#64748b' }
      }, 'Научный модуль не загружен');
    }

    const supp = SUPPLEMENTS_CATALOG[suppId];
    const bio = science.BIOAVAILABILITY[suppId];

    if (!supp) return null;

    // Получаем расширенные данные
    const synergies = HEYS.Supplements.getSynergies?.(suppId) || [];
    const antagonisms = HEYS.Supplements.getAntagonisms?.(suppId) || [];
    const foodTips = HEYS.Supplements.getFoodTips?.(suppId) || [];
    const optimalTime = HEYS.Supplements.getOptimalTime?.(suppId);

    const sectionStyle = {
      marginBottom: '12px',
      padding: '10px',
      background: 'var(--bg-secondary, #f8fafc)',
      borderRadius: '10px'
    };

    const labelStyle = {
      fontSize: '11px',
      fontWeight: '600',
      color: '#64748b',
      marginBottom: '4px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    };

    const valueStyle = {
      fontSize: '14px',
      color: 'var(--text, #1e293b)'
    };

    return React.createElement('div', {
      style: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px'
      },
      onClick: (e) => { if (e.target === e.currentTarget) onClose(); }
    },
      React.createElement('div', {
        style: {
          background: 'var(--card, #fff)',
          borderRadius: '20px',
          maxWidth: '400px',
          width: '100%',
          maxHeight: '85vh',
          overflow: 'auto',
          padding: '20px'
        }
      },
        // Заголовок
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', { style: { fontSize: '28px' } }, supp.icon),
            React.createElement('div', null,
              React.createElement('div', { style: { fontWeight: '700', fontSize: '18px' } }, supp.name),
              React.createElement('div', { style: { fontSize: '12px', color: '#64748b' } },
                SUPPLEMENT_CATEGORIES[supp.category]?.name || supp.category
              )
            )
          ),
          React.createElement('button', {
            onClick: onClose,
            style: {
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px',
              color: '#94a3b8'
            }
          }, '×')
        ),

        // Подсказка
        supp.tip && React.createElement('div', {
          style: {
            background: '#f0fdf4',
            color: '#16a34a',
            padding: '10px 12px',
            borderRadius: '10px',
            fontSize: '13px',
            marginBottom: '16px'
          }
        }, '💡 ', supp.tip),

        // Биодоступность (если есть научные данные)
        bio && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '🔬 Биодоступность'),
          React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' } },
            React.createElement('div', {
              style: {
                background: '#fef3c7',
                color: '#92400e',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: '500'
              }
            }, `Базовая: ${Math.round(bio.baseAbsorption * 100)}%`),
            bio.withFat && React.createElement('div', {
              style: {
                background: '#dcfce7',
                color: '#166534',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: '500'
              }
            }, `С жирами: ${Math.round(bio.withFat * 100)}%`)
          ),
          bio.mechanism && React.createElement('div', {
            style: { fontSize: '12px', color: '#64748b', marginTop: '8px', lineHeight: '1.5' }
          }, bio.mechanism),
          bio.optimalDose && React.createElement('div', {
            style: { fontSize: '13px', marginTop: '8px', fontWeight: '500' }
          }, '💊 Оптимальная доза: ', bio.optimalDose)
        ),

        // Формы (если есть)
        bio?.forms && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '🧬 Формы'),
          Object.entries(bio.forms).map(([formId, form]) =>
            React.createElement('div', {
              key: formId,
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid #e2e8f0',
                fontSize: '13px'
              }
            },
              React.createElement('span', { style: { fontWeight: '500' } }, formId),
              React.createElement('span', { style: { color: '#64748b' } },
                `${Math.round(form.absorption * 100)}% — ${form.use || form.conversion || ''}`
              )
            )
          )
        ),

        // Оптимальное время
        optimalTime && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '⏰ Оптимальное время'),
          React.createElement('div', { style: valueStyle },
            optimalTime.period === 'any'
              ? optimalTime.reason
              : `${TIMING[optimalTime.period]?.icon || ''} ${TIMING[optimalTime.period]?.name || optimalTime.period} — ${optimalTime.reason}`
          )
        ),

        // Синергии
        synergies.length > 0 && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '✨ Синергии'),
          synergies.map((s, i) =>
            React.createElement('div', {
              key: i,
              style: {
                padding: '8px 0',
                borderBottom: i < synergies.length - 1 ? '1px solid #e2e8f0' : 'none'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '14px', color: '#16a34a' } },
                `+ ${SUPPLEMENTS_CATALOG[s.partner]?.name || s.partner}`
              ),
              s.mechanism && React.createElement('div', {
                style: { fontSize: '12px', color: '#64748b', marginTop: '2px' }
              }, s.mechanism),
              s.ratio && React.createElement('div', {
                style: { fontSize: '12px', color: '#0ea5e9', marginTop: '2px' }
              }, '📐 ', s.ratio)
            )
          )
        ),

        // Антагонизмы
        antagonisms.length > 0 && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '⚠️ Не сочетать'),
          antagonisms.map((a, i) =>
            React.createElement('div', {
              key: i,
              style: {
                padding: '8px 0',
                borderBottom: i < antagonisms.length - 1 ? '1px solid #e2e8f0' : 'none'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '14px', color: '#d97706' } },
                `✗ ${SUPPLEMENTS_CATALOG[a.conflict]?.name || a.conflict}`
              ),
              a.mechanism && React.createElement('div', {
                style: { fontSize: '12px', color: '#64748b', marginTop: '2px' }
              }, a.mechanism),
              a.solution && React.createElement('div', {
                style: { fontSize: '12px', color: '#0ea5e9', marginTop: '2px' }
              }, '💡 ', a.solution)
            )
          )
        ),

        // Советы по еде
        foodTips.length > 0 && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '🍽️ С едой'),
          foodTips.map((tip, i) =>
            React.createElement('div', {
              key: i,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 0',
                fontSize: '13px'
              }
            },
              React.createElement('span', {
                style: {
                  background: tip.type === 'enhancer' ? '#dcfce7' : '#fef3c7',
                  color: tip.type === 'enhancer' ? '#166534' : '#92400e',
                  padding: '2px 8px',
                  borderRadius: '8px',
                  fontSize: '11px'
                }
              }, tip.type === 'enhancer' ? '✓' : '✗'),
              React.createElement('span', null, tip.food),
              React.createElement('span', { style: { color: '#64748b' } }, tip.effect)
            )
          )
        ),

        // Тестирование
        bio?.testMarker && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '🧪 Анализы'),
          React.createElement('div', { style: valueStyle }, bio.testMarker),
          bio.optimalLevel && React.createElement('div', {
            style: { fontSize: '12px', color: '#16a34a', marginTop: '4px' }
          }, '✓ Оптимум: ', bio.optimalLevel)
        ),

        // v3.5: Мои настройки (форма, доза)
        renderSettingsSection(suppId, bio, sectionStyle, labelStyle),

        // v3.5: Лимиты и безопасность
        renderLimitsSection(suppId, sectionStyle, labelStyle),

        // v3.5: История курса
        renderHistorySection(suppId, sectionStyle, labelStyle),

        // Кнопка закрыть
        React.createElement('button', {
          onClick: onClose,
          style: {
            width: '100%',
            padding: '12px',
            background: 'var(--bg-secondary, #f1f5f9)',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            marginTop: '8px'
          }
        }, 'Закрыть')
      )
    );
  }

  /**
   * Рендер умных рекомендаций с научным обоснованием
   */
  function renderScientificRecommendations(profile, dayData, meals) {
    const recs = HEYS.Supplements.getScientificRecommendations?.(profile, dayData, meals);
    if (!recs || recs.length === 0) return null;

    const priorityColors = {
      critical: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
      high: { bg: '#fff7ed', border: '#fdba74', text: '#ea580c' },
      medium: { bg: '#fefce8', border: '#fde047', text: '#ca8a04' },
      timing: { bg: '#ecfdf5', border: '#6ee7b7', text: '#059669' },
      low: { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b' }
    };

    return React.createElement('div', {
      style: {
        background: 'var(--card, #fff)',
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }
    },
      React.createElement('div', {
        style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' }
      }, '🔬 Научные рекомендации'),
      recs.slice(0, 5).map((rec, i) => {
        const colors = priorityColors[rec.priority] || priorityColors.low;
        const supp = SUPPLEMENTS_CATALOG[rec.id];

        return React.createElement('div', {
          key: i,
          style: {
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '10px 12px',
            marginBottom: '8px'
          }
        },
          React.createElement('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px'
            }
          },
            React.createElement('span', { style: { fontSize: '18px' } }, supp?.icon || '💊'),
            React.createElement('span', {
              style: { fontWeight: '600', color: colors.text }
            }, supp?.name || rec.id),
            rec.priority === 'critical' && React.createElement('span', {
              style: {
                fontSize: '10px',
                background: colors.text,
                color: '#fff',
                padding: '2px 6px',
                borderRadius: '6px',
                fontWeight: '600'
              }
            }, 'ВАЖНО')
          ),
          React.createElement('div', {
            style: { fontSize: '12px', color: '#64748b', lineHeight: '1.4' }
          }, rec.reason)
        );
      })
    );
  }

  // === ЭКСПОРТ v3.5 ===
  HEYS.Supplements = {
    // Каталоги
    CATALOG: SUPPLEMENTS_CATALOG,
    CATEGORIES: SUPPLEMENT_CATEGORIES,
    TIMING,
    INTERACTIONS,
    TIME_GROUPS,
    COURSES,
    // Утилиты
    getByCategory: getSupplementsByCategory,
    getPlanned: getPlannedSupplements,
    savePlanned: savePlannedSupplements,
    getTaken: getTakenSupplements,
    markTaken: markSupplementTaken,
    markAllTaken: markAllSupplementsTaken,
    getComplianceStats: getComplianceStats,
    // v2.0 функции
    checkInteractions,
    getInsulinWaveBonus,
    getSupplementAdvices,
    getTimingHint,
    // v3.0 функции
    groupByTimeOfDay,
    // v3.1 функции — курсы и кастомные добавки
    getCustomSupplements,
    addCustomSupplement,
    removeCustomSupplement,
    loadCustomSupplements,
    getTimeReminder,
    applyCourse,
    // v3.2 функции — интеграция с едой и рекомендации
    getSmartRecommendations,
    getMealBasedAdvice,
    // v3.3 функции — научный UI
    renderSciencePopup,
    renderScientificRecommendations,
    // v3.5 функции — настройки, история, batch
    getSupplementSettings,
    getSupplementSetting,
    setSupplementSetting,
    getSupplementHistory,
    updateSupplementHistory,
    markSupplementsTaken,
    // Рендер
    renderCard: renderSupplementsCard,
  };

  // Загружаем кастомные добавки при инициализации
  loadCustomSupplements();

  // Триггерим перерендер DayTab после инициализации модуля
  try {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { source: 'supplements-init', forceReload: true }
      }));
    }
  } catch (e) {
    // no-op
  }

  // Verbose init log removed

})(typeof window !== 'undefined' ? window : global);
