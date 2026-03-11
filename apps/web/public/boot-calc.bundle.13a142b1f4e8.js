
/* ===== heys_ratio_zones_v1.js ===== */
// 🆕 PERF v9.2: Метка момента когда boot-calc начал исполняться
window.__heysPerfMark && window.__heysPerfMark('boot-calc: execute start');
// heys_ratio_zones_v1.js — Централизованная логика цветов ratio (калории/норма)
// Единый источник правды для всех компонентов: sparkline, heatmap, datepicker, advice
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  // === Дефолтные зоны ratio ===
  const DEFAULT_RATIO_ZONES = [
    { id: 'crash', name: 'Срыв (недоел)', from: 0, to: 0.5, color: '#ef4444', textColor: '#fff' },
    { id: 'low', name: 'Маловато', from: 0.5, to: 0.75, color: '#eab308', textColor: '#000' },
    { id: 'good', name: 'Хорошо', from: 0.75, to: 0.9, color: '#22c55e', textColor: '#fff' },
    { id: 'perfect', name: 'Идеально!', from: 0.9, to: 1.1, color: '#10b981', textColor: '#fff' },
    { id: 'over', name: 'Переел', from: 1.1, to: 1.3, color: '#eab308', textColor: '#000' },
    { id: 'binge', name: 'Срыв (переел)', from: 1.3, to: Infinity, color: '#ef4444', textColor: '#fff' }
  ];

  // RGB компоненты для интерполяции градиентов
  const COLORS = {
    red: { r: 239, g: 68, b: 68 },      // #ef4444
    yellow: { r: 234, g: 179, b: 8 },    // #eab308
    green: { r: 34, g: 197, b: 94 },     // #22c55e
    emerald: { r: 16, g: 185, b: 129 }   // #10b981 (perfect)
  };

  /**
   * Линейная интерполяция между двумя цветами
   */
  function lerpColor(c1, c2, t) {
    t = Math.max(0, Math.min(1, t));
    return {
      r: Math.round(c1.r + (c2.r - c1.r) * t),
      g: Math.round(c1.g + (c2.g - c1.g) * t),
      b: Math.round(c1.b + (c2.b - c1.b) * t)
    };
  }

  function rgbToHex({ r, g, b }) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  function rgbToRgba({ r, g, b }, alpha = 1) {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // === API модуля ===
  const ratioZones = {
    DEFAULT_ZONES: DEFAULT_RATIO_ZONES,

    /**
     * Получить текущие зоны (из localStorage или дефолтные)
     */
    getZones() {
      try {
        if (HEYS.utils && HEYS.utils.lsGet) {
          return HEYS.utils.lsGet('heys_ratio_zones', DEFAULT_RATIO_ZONES);
        }
        const stored = localStorage.getItem('heys_ratio_zones');
        return stored ? JSON.parse(stored) : DEFAULT_RATIO_ZONES;
      } catch (e) {
        return DEFAULT_RATIO_ZONES;
      }
    },

    /**
     * Сохранить зоны
     */
    setZones(zones) {
      try {
        if (HEYS.utils && HEYS.utils.lsSet) {
          HEYS.utils.lsSet('heys_ratio_zones', zones);
        } else {
          localStorage.setItem('heys_ratio_zones', JSON.stringify(zones));
        }
      } catch (e) {
        console.error('Failed to save ratio zones:', e);
      }
    },

    /**
     * Сбросить к дефолтным
     */
    resetZones() {
      this.setZones(DEFAULT_RATIO_ZONES);
      return DEFAULT_RATIO_ZONES;
    },

    /**
     * Найти зону по ratio
     * @param {number} ratio - значение kcal/optimum
     * @returns {Object} зона { id, name, from, to, color, textColor }
     */
    getZone(ratio) {
      const zones = this.getZones();
      if (!ratio || ratio <= 0) return zones[0]; // crash

      for (const zone of zones) {
        if (ratio >= zone.from && ratio < zone.to) {
          return zone;
        }
      }
      return zones[zones.length - 1]; // binge (последняя)
    },

    /**
     * Получить статус (id зоны)
     */
    getStatus(ratio) {
      return this.getZone(ratio).id;
    },

    /**
     * Получить название статуса
     */
    getStatusName(ratio) {
      return this.getZone(ratio).name;
    },

    /**
     * Проверка: это успешный день? (good или perfect)
     */
    isSuccess(ratio) {
      const status = this.getStatus(ratio);
      return status === 'good' || status === 'perfect';
    },

    /**
     * Проверка: это идеальный день?
     */
    isPerfect(ratio) {
      return this.getStatus(ratio) === 'perfect';
    },

    /**
     * Проверка: это streak-день? (хороший для серии)
     */
    isStreakDay(ratio) {
      return this.isSuccess(ratio);
    },

    /**
     * Получить базовый цвет зоны (hex)
     */
    getColor(ratio) {
      return this.getZone(ratio).color;
    },

    /**
     * Получить цвет с градиентом внутри зоны
     * @param {number} ratio - значение kcal/optimum
     * @param {number} alpha - прозрачность (0-1)
     * @param {number} bonusPct - бонусный % к зелёной зоне (от калорийного долга, 0-0.25)
     * @returns {string} rgba цвет
     */
    getGradientColor(ratio, alpha = 1, bonusPct = 0) {
      if (!ratio || ratio <= 0) {
        return rgbToRgba(COLORS.red, alpha);
      }

      // Расширяем зелёную зону на bonusPct (например, при долге 1.1→1.35 = зелёный)
      const bonusEnd = 1.1 + bonusPct;

      // Находим позицию ratio и интерполируем
      if (ratio < 0.5) {
        // 0 → 0.5: красный (без градиента, это crash)
        return rgbToRgba(COLORS.red, alpha);
      } else if (ratio < 0.75) {
        // 0.5 → 0.75: красный → жёлтый
        const t = (ratio - 0.5) / 0.25;
        return rgbToRgba(lerpColor(COLORS.red, COLORS.yellow, t), alpha);
      } else if (ratio < 0.9) {
        // 0.75 → 0.9: жёлтый → зелёный
        const t = (ratio - 0.75) / 0.15;
        return rgbToRgba(lerpColor(COLORS.yellow, COLORS.green, t), alpha);
      } else if (ratio < 1.0) {
        // 0.9 → 1.0: зелёный → изумрудный (perfect)
        const t = (ratio - 0.9) / 0.1;
        return rgbToRgba(lerpColor(COLORS.green, COLORS.emerald, t), alpha);
      } else if (ratio < bonusEnd) {
        // 1.0 → bonusEnd: изумрудный (идеально + бонусная зона)
        return rgbToRgba(COLORS.emerald, alpha);
      } else if (ratio < bonusEnd + 0.2) {
        // bonusEnd → bonusEnd+0.2: изумрудный → жёлтый
        const t = (ratio - bonusEnd) / 0.2;
        return rgbToRgba(lerpColor(COLORS.emerald, COLORS.yellow, t), alpha);
      } else {
        // > bonusEnd+0.2: жёлтый → красный (binge)
        const t = Math.min((ratio - bonusEnd - 0.2) / 0.2, 1);
        return rgbToRgba(lerpColor(COLORS.yellow, COLORS.red, t), alpha);
      }
    },

    /**
     * Получить CSS класс для статуса
     */
    getStatusClass(ratio) {
      const status = this.getStatus(ratio);
      return 'ratio-' + status;
    },

    /**
     * Для heatmap: простой статус (совместимость)
     */
    getHeatmapStatus(ratio) {
      if (!ratio || ratio <= 0) return 'empty';
      const status = this.getStatus(ratio);
      switch (status) {
        case 'crash': return 'red';
        case 'low': return 'yellow';
        case 'good':
        case 'perfect': return 'green';
        case 'over': return 'yellow';
        case 'binge': return 'red';
        default: return 'empty';
      }
    },

    /**
     * Получить эмодзи для ratio
     */
    getEmoji(ratio) {
      const status = this.getStatus(ratio);
      switch (status) {
        case 'crash': return '💀';
        case 'low': return '😕';
        case 'good': return '✓';
        case 'perfect': return '⭐';
        case 'over': return '😅';
        case 'binge': return '🚨';
        default: return '';
      }
    },

    /**
     * Определить эмоциональное состояние (для advice)
     */
    getEmotionalCategory(ratio, currentStreak = 0) {
      const status = this.getStatus(ratio);

      // Срыв — важнее всего
      if (status === 'crash' || status === 'binge') return 'crashed';

      // Успех — streak или хороший день
      if (currentStreak >= 3 || status === 'perfect' || status === 'good') return 'success';

      // Лёгкий перебор — returning
      if (status === 'over') return 'returning';

      // Маловато — stressed
      if (status === 'low') return 'stressed';

      return 'normal';
    },

    /**
     * Статистика для дебага
     */
    debugInfo(ratio) {
      const zone = this.getZone(ratio);
      return {
        ratio,
        zone: zone.id,
        name: zone.name,
        color: zone.color,
        gradientColor: this.getGradientColor(ratio, 1),
        isSuccess: this.isSuccess(ratio),
        isPerfect: this.isPerfect(ratio),
        emoji: this.getEmoji(ratio)
      };
    },

    // === REFEED DAY SUPPORT ===

    /**
     * Получить зону с учётом refeed дня
     * @param {number} ratio - значение kcal/optimum
     * @param {Object} dayData - данные дня { isRefeedDay, ... }
     * @returns {Object} зона { id, name, color, textColor }
     */
    getDayZone(ratio, dayData) {
      // Если refeed день — используем расширенные зоны
      if (dayData?.isRefeedDay) {
        if (ratio < 0.70) {
          return { id: 'refeed_under', name: 'Маловато для refeed', color: '#f59e0b', textColor: '#000' };
        }
        if (ratio < 1.35) {
          return { id: 'refeed_ok', name: 'Загрузочный день ✓', color: '#22c55e', textColor: '#fff' };
        }
        return { id: 'refeed_over', name: 'Даже для refeed много!', color: '#ef4444', textColor: '#fff' };
      }
      // Обычный день — стандартная логика
      return this.getZone(ratio);
    },

    /**
     * Проверка: сохраняется ли streak в refeed день
     * @param {number} ratio - значение kcal/optimum
     * @returns {boolean} true если ratio в диапазоне 0.70-1.35
     */
    isRefeedStreakDay(ratio) {
      return ratio >= 0.70 && ratio < 1.35;
    },

    /**
     * Универсальная проверка streak дня (с учётом refeed)
     * @param {number} ratio - значение kcal/optimum
     * @param {Object} dayData - данные дня { isRefeedDay, ... }
     * @returns {boolean}
     */
    isStreakDayWithRefeed(ratio, dayData) {
      if (dayData?.isRefeedDay) {
        return this.isRefeedStreakDay(ratio);
      }
      return this.isSuccess(ratio);
    },

    /**
     * 🆕 Единый метод определения успешности дня (с учётом refeed)
     * Возвращает всё что нужно UI: статус, цвет, streak, tooltip
     * @param {number} ratio - значение kcal/optimum
     * @param {Object} dayData - данные дня { isRefeedDay, refeedReason, ... }
     * @returns {Object} { isSuccess, isStreak, zone, heatmapStatus, color, tooltip }
     */
    getDaySuccess(ratio, dayData) {
      const isRefeedDay = dayData?.isRefeedDay === true;

      // Получаем зону (с учётом refeed)
      const zone = this.getDayZone(ratio, dayData);

      // Определяем streak
      const isStreak = this.isStreakDayWithRefeed(ratio, dayData);

      // Heatmap статус
      let heatmapStatus;
      if (isRefeedDay) {
        // Refeed: зелёный 70-135%, жёлтый <70% или >135%<150%, красный >150%
        if (zone.id === 'refeed_ok') heatmapStatus = 'green';
        else if (zone.id === 'refeed_under' || zone.id === 'refeed_over') heatmapStatus = 'yellow';
        else heatmapStatus = 'red';
      } else {
        // Обычный день: стандартная логика
        heatmapStatus = this.getHeatmapStatus(ratio);
      }

      // Определяем успешность
      const isSuccess = heatmapStatus === 'green';

      // Tooltip
      let tooltip = zone.name;
      if (isRefeedDay) {
        const reasonLabel = HEYS.Refeed?.getReasonLabel?.(dayData.refeedReason)?.label || '';
        tooltip = `🍕 ${zone.name}\n${reasonLabel ? reasonLabel + '\n' : ''}${isStreak ? '✅ Streak сохранён' : '⚠️ Вне диапазона streak'}`;
      }

      return {
        isSuccess,
        isStreak,
        isRefeedDay,
        zone,
        heatmapStatus,
        color: zone.color,
        tooltip,
        emoji: isRefeedDay ? '🍕' : this.getEmoji(ratio)
      };
    }
  };

  // Экспорт
  HEYS.ratioZones = ratioZones;

  // Для отладки в консоли
  if (typeof window !== 'undefined') {
    window.debugRatio = (ratio) => {
      console.table(ratioZones.debugInfo(ratio));
    };
  }

})(typeof window !== 'undefined' ? window : global);


/* ===== heys_tef_v1.js ===== */
// heys_tef_v1.js — Thermic Effect of Food (TEF) Module v1.0.0
// Единый источник правды для расчёта TEF во всём приложении
// Научное обоснование: Westerterp 2004, Tappy 1996
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // === КОНСТАНТЫ ===

  /**
   * Коэффициенты TEF по макронутриентам
   * Научные диапазоны: Protein 20-30%, Carbs 5-10%, Fat 0-3%
   * Используем средние значения для точности
   */
  const TEF_COEFFICIENTS = {
    protein: 0,       // 0% — TEF уже встроен в коэффициент NET Atwater (3 kcal/g вместо 4)
    carbs: 0.075,     // 7.5% калорий углеводов
    fat: 0.015        // 1.5% калорий жиров
  };

  /**
   * Atwater факторы (ккал на грамм)
   */
  const ATWATER = {
    protein: 3, // NET Atwater: TEF 25% built-in (4 × 0.75 = 3)
    carbs: 4,
    fat: 9
  };

  /**
   * Научная информация для UI
   */
  const SCIENCE_INFO = {
    name: 'Thermic Effect of Food',
    nameRu: 'Термический эффект пищи',
    abbrev: 'TEF',
    description: 'Энергия, затрачиваемая на переваривание, всасывание и метаболизм пищи',
    formula: 'TEF = Белок×4×0.25 + Углеводы×4×0.075 + Жиры×9×0.015',
    sources: [
      { author: 'Westerterp', year: 2004, pmid: '15507147' },
      { author: 'Tappy', year: 1996, pmid: '8696422' }
    ],
    ranges: {
      protein: { min: 0.20, max: 0.30, used: 0.25, label: '20-30%' },
      carbs: { min: 0.05, max: 0.10, used: 0.075, label: '5-10%' },
      fat: { min: 0.00, max: 0.03, used: 0.015, label: '0-3%' }
    }
  };

  // === ФУНКЦИИ ===

  /**
   * Рассчитать TEF из макронутриентов (в граммах)
   * @param {number} proteinG - граммы белка
   * @param {number} carbsG - граммы углеводов  
   * @param {number} fatG - граммы жиров
   * @returns {Object} { total, breakdown: { protein, carbs, fat } }
   */
  function calculate(proteinG, carbsG, fatG) {
    proteinG = proteinG || 0;
    carbsG = carbsG || 0;
    fatG = fatG || 0;

    const proteinTEF = proteinG * ATWATER.protein * TEF_COEFFICIENTS.protein;
    const carbsTEF = carbsG * ATWATER.carbs * TEF_COEFFICIENTS.carbs;
    const fatTEF = fatG * ATWATER.fat * TEF_COEFFICIENTS.fat;

    return {
      total: Math.round(proteinTEF + carbsTEF + fatTEF),
      breakdown: {
        protein: Math.round(proteinTEF),
        carbs: Math.round(carbsTEF),
        fat: Math.round(fatTEF)
      }
    };
  }

  /**
   * Рассчитать TEF из объекта с макросами
   * @param {Object} macros - { prot, carbs, fat } или { protein, carbs, fat }
   * @returns {Object} { total, breakdown }
   */
  function calculateFromMacros(macros) {
    if (!macros) return { total: 0, breakdown: { protein: 0, carbs: 0, fat: 0 } };

    const prot = macros.prot || macros.protein || 0;
    const carbs = macros.carbs || macros.carbohydrates || 0;
    const fat = macros.fat || macros.fats || 0;

    return calculate(prot, carbs, fat);
  }

  /**
   * Рассчитать TEF из dayTot (суммы дня)
   * @param {Object} dayTot - { prot, carbs, fat, ... }
   * @returns {Object} { total, breakdown }
   */
  function calculateFromDayTot(dayTot) {
    if (!dayTot) return { total: 0, breakdown: { protein: 0, carbs: 0, fat: 0 } };
    return calculate(dayTot.prot || 0, dayTot.carbs || 0, dayTot.fat || 0);
  }

  /**
   * Рассчитать TEF из meals через pIndex
   * @param {Array} meals - массив приёмов пищи
   * @param {Object} pIndex - индекс продуктов { byId: Map }
   * @param {Function} getProductFromItem - функция получения продукта из item
   * @returns {Object} { total, breakdown }
   */
  function calculateFromMeals(meals, pIndex, getProductFromItem) {
    if (!meals || !meals.length) {
      return { total: 0, breakdown: { protein: 0, carbs: 0, fat: 0 } };
    }

    let totalProt = 0, totalCarbs = 0, totalFat = 0;

    for (const meal of meals) {
      if (!meal.items) continue;
      for (const item of meal.items) {
        const product = getProductFromItem ? getProductFromItem(item, pIndex) : pIndex?.byId?.get(item.product_id);
        if (!product) continue;

        const g = item.grams || 0;
        totalProt += (product.protein100 || 0) * g / 100;
        totalCarbs += ((product.simple100 || 0) + (product.complex100 || 0)) * g / 100;
        totalFat += ((product.badFat100 || 0) + (product.goodFat100 || 0) + (product.trans100 || 0)) * g / 100;
      }
    }

    return calculate(totalProt, totalCarbs, totalFat);
  }

  /**
   * Получить только число TEF (для простых случаев)
   * @param {number} proteinG
   * @param {number} carbsG
   * @param {number} fatG
   * @returns {number}
   */
  function getTotal(proteinG, carbsG, fatG) {
    return calculate(proteinG, carbsG, fatG).total;
  }

  /**
   * Форматировать TEF для отображения в UI
   * @param {Object} tefData - результат calculate()
   * @returns {Object} { label, value, details, tooltip }
   */
  function format(tefData) {
    if (!tefData || !tefData.total) {
      return { label: 'TEF', value: '0', details: '', tooltip: '' };
    }

    const { total, breakdown } = tefData;

    return {
      label: '🔥 Переваривание пищи (TEF)',
      value: `${total}`,
      details: `Б: ${breakdown.protein} | У: ${breakdown.carbs} | Ж: ${breakdown.fat}`,
      tooltip: `Термический эффект пищи:\n• Белок (25%): ${breakdown.protein} ккал\n• Углеводы (7.5%): ${breakdown.carbs} ккал\n• Жиры (1.5%): ${breakdown.fat} ккал`
    };
  }

  /**
   * Проверить, значим ли TEF (> 50 ккал)
   * @param {number} tefTotal
   * @returns {boolean}
   */
  function isSignificant(tefTotal) {
    return tefTotal > 50;
  }

  // === ЭКСПОРТ ===

  HEYS.TEF = {
    // Константы
    COEFFICIENTS: TEF_COEFFICIENTS,
    ATWATER: ATWATER,
    SCIENCE_INFO: SCIENCE_INFO,

    // Функции расчёта
    calculate,
    calculateFromMacros,
    calculateFromDayTot,
    calculateFromMeals,
    getTotal,

    // UI хелперы
    format,
    isSignificant,

    // Версия
    VERSION: '1.0.0'
  };

  // Debug
  if (typeof window !== 'undefined') {
    window.debugTEF = (prot, carbs, fat) => {
      const result = calculate(prot, carbs, fat);
      console.log('TEF Calculation:');
      console.log(`  Input: ${prot}g prot, ${carbs}g carbs, ${fat}g fat`);
      console.log(`  Breakdown: Б ${result.breakdown.protein} | У ${result.breakdown.carbs} | Ж ${result.breakdown.fat}`);
      console.log(`  Total: ${result.total} kcal`);
      return result;
    };
  }

})(typeof window !== 'undefined' ? window : global);


/* ===== heys_tdee_v1.js ===== */
// heys_tdee_v1.js — Модуль расчёта затрат калорий (TDEE)
// Единый источник правды для всех компонентов: hero, статистика, недельный отчёт
// v1.1.2 — Добавлено totalHouseholdMin для UI

(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};

  const tryParseStoredValue = (raw, fallback) => {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'string') {
      let str = raw;
      if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try { str = HEYS.store.decompress(str); } catch (_) { }
      }
      try { return JSON.parse(str); } catch (_) { return str; }
    }
    return raw;
  };

  const storeGet = (k, def) => {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(k, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, def);
        }
      }
      if (U.lsGet) {
        const legacy = U.lsGet(k, def);
        if (legacy !== null && legacy !== undefined) return legacy;
      }
      const raw = localStorage.getItem(k);
      return tryParseStoredValue(raw, def);
    } catch (e) {
      return def;
    }
  };

  // === Вспомогательные функции ===
  const r0 = x => Math.round(+x || 0);

  /**
   * Калории в минуту по MET и весу
   * @param {number} met - Метаболический эквивалент
   * @param {number} weight - Вес в кг
   * @returns {number} ккал/мин
   */
  const kcalPerMin = (met, weight) => (met * 3.5 * weight) / 200;

  /**
   * BMR по формуле Mifflin-St Jeor
   * @param {number} weight - Вес в кг
   * @param {Object} profile - { age, height, gender }
   * @returns {number} ккал/день
   */
  const calcBMR = (weight, profile) => {
    const p = profile || {};
    const age = +p.age || 30;
    const height = +p.height || 170;
    const isMale = p.gender !== 'Женский';
    // Mifflin-St Jeor: 10×вес + 6.25×рост − 5×возраст + (5 муж / −161 жен)
    return r0(10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161));
  };

  /**
   * Калории от шагов
   * @param {number} steps - Количество шагов
   * @param {number} weight - Вес в кг
   * @param {string} sex - Пол
   * @param {number} strideMultiplier - Множитель длины шага (0.7 по умолчанию)
   * @returns {number} ккал
   */
  const stepsKcal = (steps, weight, sex, strideMultiplier = 0.7) => {
    if (!steps || steps <= 0) return 0;
    const height = 170; // Средний рост для расчёта
    const strideLength = height * strideMultiplier / 100; // в метрах
    const distanceKm = (steps * strideLength) / 1000;
    // ~0.5 ккал на кг на км при ходьбе
    return r0(distanceKm * weight * 0.5);
  };

  /**
   * Расчёт калорий от тренировки
   * @param {Object} training - { z: [min1, min2, min3, min4], type, time }
   * @param {number} weight - Вес в кг
   * @param {number[]} mets - MET для каждой зоны [zone1, zone2, zone3, zone4]
   * @returns {number} ккал
   */
  const trainingKcal = (training, weight, mets = [2.5, 6, 8, 10]) => {
    if (!training || !training.z) return 0;
    const kcalMin = mets.map(m => kcalPerMin(m, weight));
    return (training.z || [0, 0, 0, 0]).reduce((sum, min, i) =>
      sum + r0((+min || 0) * (kcalMin[i] || 0)), 0);
  };

  /**
   * Полный расчёт TDEE для дня
   * @param {Object} day - Данные дня { weightMorning, trainings, steps, householdMin, householdActivities, cycleDay, deficitPct }
   * @param {Object} profile - Профиль { weight, age, height, gender, deficitPctTarget }
   * @param {Object} options - { hrZones, includeNDTE, lsGet }
   * @returns {Object} { bmr, actTotal, trainingsKcal, stepsKcal, householdKcal, ndteBoost, tdee, optimum }
   */
  const calculateTDEE = (day, profile, options = {}) => {
    // 🛡️ Null-защита: day и profile могут быть null при инициализации
    const d = day || {};
    const prof = profile || {};

    const lsGet = options.lsGet || storeGet;

    // Вес: из дня или из профиля
    const weight = +d.weightMorning || +prof.weight || 70;

    // MET зоны
    const hrZones = options.hrZones || lsGet('heys_hr_zones', []);
    const zoneMets = hrZones.map(x => +x.MET || 0);
    const mets = [2.5, 6, 8, 10].map((def, i) => zoneMets[i] || def);

    // BMR
    const bmr = calcBMR(weight, prof);

    // Тренировки
    const trainings = (d.trainings && Array.isArray(d.trainings)) ? d.trainings : [];
    const train1k = trainingKcal(trainings[0], weight, mets);
    const train2k = trainingKcal(trainings[1], weight, mets);
    const train3k = trainingKcal(trainings[2], weight, mets);
    const trainingsKcal = train1k + train2k + train3k;

    // Шаги
    const stepsK = stepsKcal(d.steps || 0, weight, prof.gender);

    // Бытовая активность
    const householdActivities = d.householdActivities ||
      (d.householdMin > 0 ? [{ minutes: d.householdMin }] : []);
    const totalHouseholdMin = householdActivities.reduce((sum, h) => sum + (+h.minutes || 0), 0);
    const householdKcal = r0(totalHouseholdMin * kcalPerMin(2.5, weight));

    // Общая активность
    const actTotal = r0(trainingsKcal + stepsK + householdKcal);

    // 🔬 TEF v1.0.0: используем единый модуль HEYS.TEF с fallback
    let tefData = { total: 0, breakdown: { protein: 0, carbs: 0, fat: 0 } };
    if (HEYS.TEF) {
      if (options.dayMacros) {
        // Если макросы переданы явно
        tefData = HEYS.TEF.calculateFromMacros(options.dayMacros);
      } else if (d.meals && Array.isArray(d.meals) && options.pIndex) {
        // Расчёт из приёмов пищи через модуль
        const getProduct = (item) => options.pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
        tefData = HEYS.TEF.calculateFromMeals(d.meals, options.pIndex, (item) => getProduct(item));
      }
    } else {
      // Fallback: inline расчёт если модуль не загружен (Westerterp 2004, Tappy 1996)
      let totalProt = 0, totalCarbs = 0, totalFat = 0;
      if (options.dayMacros) {
        totalProt = options.dayMacros.prot || options.dayMacros.protein || 0;
        totalCarbs = options.dayMacros.carbs || options.dayMacros.carbohydrates || 0;
        totalFat = options.dayMacros.fat || options.dayMacros.fats || 0;
      } else if (d.meals && Array.isArray(d.meals) && options.pIndex) {
        d.meals.forEach(meal => {
          (meal.items || []).forEach(item => {
            const g = item.grams || 0;
            const prod = options.pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            if (prod && g > 0) {
              totalProt += (prod.protein100 || 0) * g / 100;
              totalCarbs += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
              totalFat += ((prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0)) * g / 100;
            }
          });
        });
      }
      const proteinTEF = 0; // NET Atwater: TEF 25% built into 3 kcal/g coefficient
      const carbsTEF = Math.round(totalCarbs * 4 * 0.075);
      const fatTEF = Math.round(totalFat * 9 * 0.015);
      tefData = {
        total: proteinTEF + carbsTEF + fatTEF,
        breakdown: { protein: proteinTEF, carbs: carbsTEF, fat: fatTEF }
      };
    }
    const tefKcal = tefData.total || 0;

    // NDTE (Next-Day Training Effect) — буст от вчерашней тренировки
    let ndteBoost = 0;
    if (options.includeNDTE !== false && HEYS.InsulinWave?.calculateNDTE && HEYS.InsulinWave?.getPreviousDayTrainings && d.date) {
      const prevTrainings = HEYS.InsulinWave.getPreviousDayTrainings(d.date, lsGet);
      if (prevTrainings.totalKcal >= 200) {
        const heightM = (+prof.height || 170) / 100;
        const bmi = weight && heightM ? r0(weight / (heightM * heightM) * 10) / 10 : 22;
        const ndteData = HEYS.InsulinWave.calculateNDTE({
          trainingKcal: prevTrainings.totalKcal,
          hoursSince: prevTrainings.hoursSince,
          bmi,
          trainingType: prevTrainings.dominantType || 'cardio',
          trainingsCount: prevTrainings.trainings.length
        });
        ndteBoost = r0(bmr * ndteData.tdeeBoost);
      }
    }

    // baseExpenditure — без TEF, для расчёта optimum (норма не должна "догонять" съеденное)
    const baseExpenditure = r0(bmr + actTotal + ndteBoost);
    // TDEE — с TEF, для отображения фактических затрат
    const tdee = r0(baseExpenditure + tefKcal);

    // Целевой дефицит
    const profileTargetDef = +prof.deficitPctTarget || 0;
    const dayTargetDef = (d.deficitPct !== '' && d.deficitPct != null)
      ? +d.deficitPct
      : profileTargetDef;

    // Коррекция на менструальный цикл
    const cycleKcalMultiplier = HEYS.Cycle?.getKcalMultiplier?.(d.cycleDay) || 1;
    // Optimum рассчитывается от baseExpenditure (без TEF)
    const baseOptimum = r0(baseExpenditure * (1 + dayTargetDef / 100));
    const optimum = r0(baseOptimum * cycleKcalMultiplier);

    return {
      bmr,
      actTotal,
      trainingsKcal,
      train1k,
      train2k,
      train3k,
      stepsKcal: stepsK,
      householdKcal,
      totalHouseholdMin,  // 🆕 v1.1.2: Минуты для UI
      ndteBoost,
      ndteData: ndteBoost > 0 ? { active: true, tdeeBoost: ndteBoost / bmr } : { active: false, tdeeBoost: 0 }, // 🆕 v1.1.0
      tefKcal,             // 🆕 v3.9.1: TEF
      tefData,             // 🆕 v1.1.1: Full TEF data with breakdown
      baseExpenditure,     // 🆕 v3.9.1: без TEF (для optimum)
      tdee,                // с TEF (для UI)
      optimum,
      weight,
      mets,                // 🆕 v1.1.0: MET зоны для UI
      kcalMin: mets.map(m => kcalPerMin(m, weight)), // 🆕 v1.1.0: ккал/мин для UI
      deficitPct: dayTargetDef,
      cycleMultiplier: cycleKcalMultiplier
    };
  };

  /**
   * Быстрый расчёт только TDEE (затрат) для дня
   * @param {Object} day - Данные дня
   * @param {Object} profile - Профиль
   * @param {Object} options - Опции
   * @returns {number} TDEE в ккал
   */
  const getTDEE = (day, profile, options = {}) => {
    return calculateTDEE(day, profile, options).tdee;
  };

  /**
   * Расчёт TDEE для массива дней (для недельной/месячной статистики)
   * @param {string[]} dates - Массив дат в формате YYYY-MM-DD
   * @param {Object} profile - Профиль
   * @param {Object} options - { lsGet }
   * @returns {Object} { totalBurned, totalTarget, days: [...] }
   */
  const calculateWeekTDEE = (dates, profile, options = {}) => {
    const lsGet = options.lsGet || storeGet;

    let totalBurned = 0;
    let totalTarget = 0;
    const days = [];

    dates.forEach(dateStr => {
      const dayData = lsGet('heys_dayv2_' + dateStr, null);
      if (dayData) {
        const result = calculateTDEE(dayData, profile, { ...options, lsGet });
        totalBurned += result.tdee;
        totalTarget += result.optimum;
        days.push({
          date: dateStr,
          ...result
        });
      }
    });

    return {
      totalBurned,
      totalTarget,
      days,
      avgTDEE: days.length > 0 ? r0(totalBurned / days.length) : 0,
      avgTarget: days.length > 0 ? r0(totalTarget / days.length) : 0
    };
  };

  // === Экспорт ===
  HEYS.TDEE = {
    VERSION: '1.1.0',

    // Основные функции
    calculate: calculateTDEE,
    getTDEE,
    calculateWeek: calculateWeekTDEE,

    // Вспомогательные (для обратной совместимости)
    calcBMR,
    stepsKcal,
    trainingKcal,
    kcalPerMin
  };

  // Для отладки
  if (typeof window !== 'undefined') {
    window.debugTDEE = (date) => {
      const prof = storeGet('heys_profile', {});
      const day = storeGet('heys_dayv2_' + date, {});
      console.table(calculateTDEE(day, prof));
    };
  }

})(typeof window !== 'undefined' ? window : global);


/* ===== heys_harm_v1.js ===== */
// heys_harm_v1.js — Harm Score v3.0: Advanced Scientific Food Harm Assessment System
// ===========================================================================
// Научно обоснованная система оценки вредности продуктов
// 
// Факторы оценки v3.0:
// - Макронутриенты: транс-жиры, насыщенные жиры, простые сахара
// - Защитные факторы: клетчатка, белок, полезные жиры
// - Гликемический индекс (GI) И нагрузка (GL) — более точная оценка
// - NOVA classification: степень переработки
// - Натрий (соль): риски гипертензии
// - Микронутриентная плотность — теперь интегрирована в формулу!
// - Omega-3/6 ratio — баланс ПНЖК для воспаления
// - Quality flags: organic, whole grain, fermented, raw
// - E-добавки (additives) — штраф за вредные E-коды
// - Goal-based personalization — адаптация под цель пользователя
//
// Научные источники:
// - Mozaffarian 2006 (PMID: 16611951) — транс-жиры
// - Ludwig 2002 (PMID: 12081821) — простые сахара
// - Sacks 2017 (PMID: 28620111) — насыщенные жиры
// - Brand-Miller 2003 (PMID: 12828192) — гликемический индекс
// - Weickert 2008 (PMID: 18287346) — клетчатка
// - Monteiro 2019 (PMID: 29444892) — NOVA classification
// - He & MacGregor 2011 (PMID: 21731062) — натрий и гипертензия
// - Simopoulos 2002 (PMID: 12442909) — omega-3/6 ratio
// - Chassaing 2015 (PMID: 25731162) — пищевые добавки и воспаление
// - Drewnowski 2005 (PMID: 16002828) — nutrient density
// - Smith-Spangler 2012 (PMID: 22944875) — органические продукты
// - Aune 2016 (PMID: 27301975) — цельнозерновые и здоровье
// ===========================================================================

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const Harm = HEYS.Harm = HEYS.Harm || {};

    // ===========================================================================
    // 🔬 SCIENTIFIC CONSTANTS
    // ===========================================================================

    /**
     * Веса факторов для расчёта Harm Score
     * Основаны на мета-анализах и рекомендациях WHO/AHA
     */
    const HARM_WEIGHTS = {
        // ❌ PENALTIES (увеличивают вред)
        trans100: 3.0,        // Транс-жиры — ГЛАВНЫЙ враг (Mozaffarian 2006)
        simple100: 0.08,      // Простые сахара (Ludwig 2002)
        badFat100: 0.10,      // Насыщенные жиры (Sacks 2017) — снижено с 0.12
        sodium100: 0.002,     // Натрий мг→harm: 2000мг = +4 балла (He 2011)

        // ✅ BONUSES (снижают вред)
        fiber100: -0.30,      // Клетчатка — мощный протектор (Weickert 2008) — усилено
        protein100: -0.06,    // Белок снижает ГИ и насыщает (Nuttall 1984)
        goodFat100: -0.04,    // MUFA/PUFA улучшают липидный профиль (Schwingshackl 2012)

        // 📊 NOVA classification penalty
        nova1: 0,             // Необработанные — без штрафа
        nova2: 0.3,           // Кулинарные ингредиенты
        nova3: 0.8,           // Переработанные
        nova4: 2.5,           // Ультрапереработанные — серьёзный штраф (Monteiro 2019)
    };

    /**
     * GI penalty thresholds (Brand-Miller 2003)
     */
    const GI_PENALTY = {
        low: { max: 35, penalty: 0 },
        medium: { max: 55, penalty: 0.5 },
        high: { max: 70, penalty: 1.0 },
        veryHigh: { max: Infinity, penalty: 1.5, progressive: 0.02 } // +0.02 за каждый пункт выше 70
    };

    /**
     * 🆕 v3.0: Glycemic Load (GL) thresholds — более точная оценка чем GI
     * GL = (GI × carbs per serving) / 100
     * Simopoulos 2002, Brand-Miller 2003
     */
    const GL_PENALTY = {
        low: { max: 10, penalty: 0 },        // Низкая GL
        medium: { max: 20, penalty: 0.3 },   // Средняя GL
        high: { max: 30, penalty: 0.6 },     // Высокая GL
        veryHigh: { max: Infinity, penalty: 1.0, progressive: 0.02 } // Очень высокая
    };

    /**
     * 🆕 v3.0: Omega-3/6 ratio penalty (Simopoulos 2002)
     * Оптимальное соотношение omega-6:omega-3 = 1:1 до 4:1
     * Типичная западная диета = 15-20:1 (провоспалительная)
     */
    const OMEGA_RATIO_PENALTY = {
        optimal: { maxRatio: 4, penalty: 0 },     // Оптимум ≤4:1
        acceptable: { maxRatio: 10, penalty: 0.3 }, // Приемлемо 4-10:1
        harmful: { maxRatio: 20, penalty: 0.8 },   // Вредно 10-20:1
        veryHarmful: { maxRatio: Infinity, penalty: 1.5 } // Очень вредно >20:1
    };

    /**
     * 🆕 v3.0: Quality flags bonuses (Smith-Spangler 2012, Aune 2016)
     * Флаги качества продукта снижают harm
     */
    const QUALITY_BONUSES = {
        isOrganic: -0.3,       // Органический — меньше пестицидов
        isWholeGrain: -0.5,    // Цельнозерновой — больше клетчатки и нутриентов
        isFermented: -0.5,     // Ферментированный — пробиотики, улучшенная биодоступность
        isRaw: -0.3,           // Сырой — сохранены ферменты и витамины
        isGrassFed: -0.2,      // Животные на выпасе — лучший omega-3 профиль
        isWildCaught: -0.2,    // Дикая рыба — лучше чем фермерская
    };

    /**
     * 🆕 v3.0: Harmful additives blacklist (Chassaing 2015, PMID: 25731162)
     * E-добавки которые увеличивают harm score
     */
    const HARMFUL_ADDITIVES = {
        // Критически вредные (+0.5 каждый)
        critical: [
            'E621', 'E627', 'E631', // Усилители вкуса (MSG family) — нейротоксичность
            'E951', 'E950', 'E952', // Искусственные подсластители — микробиом
            'E320', 'E321',         // BHA/BHT — возможные канцерогены
            'E249', 'E250', 'E251', 'E252', // Нитраты/нитриты — канцерогены в переработанном мясе
        ],
        // Умеренно вредные (+0.3 каждый)
        moderate: [
            'E102', 'E110', 'E122', 'E124', 'E129', // Азокрасители — гиперактивность у детей
            'E211', 'E212', 'E213', // Бензоаты — аллергии
            'E338', 'E339', 'E340', 'E341', // Фосфаты — риски для почек
            'E407',                  // Каррагинан — воспаление ЖКТ
        ],
        // Слабо вредные (+0.1 каждый)
        mild: [
            'E471', 'E472', // Эмульгаторы — могут нарушать микробиом
            'E300', 'E301', 'E302', // Аскорбаты — в целом безопасны, но синтетические
        ]
    };

    /**
     * 🆕 v3.0: Nutrient Density integration weights
     * Drewnowski 2005 — пустые калории увеличивают harm
     */
    const NUTRIENT_DENSITY_WEIGHT = -0.015; // Высокая плотность снижает harm

    /**
     * 🆕 v3.0: Goal-based weight modifiers
     * Персонализация под цель пользователя
     */
    const GOAL_MODIFIERS = {
        weightLoss: {
            simple100: 1.3,    // Штраф за сахар выше
            badFat100: 1.2,    // Штраф за жиры выше
            fiber100: 1.2,     // Бонус за клетчатку выше (сытость)
            gl: 1.3,           // Штраф за GL выше
        },
        muscleGain: {
            protein100: 1.5,   // Бонус за белок выше
            simple100: 0.7,    // Штраф за сахар ниже (энергия для тренировок)
            badFat100: 0.8,    // Штраф за жиры ниже
        },
        health: {
            nova: 1.5,         // Штраф за переработку выше
            omega: 1.3,        // Штраф за плохой omega ratio выше
            additives: 1.5,    // Штраф за добавки выше
            nutrientDensity: 1.3, // Бонус за плотность выше
        },
        default: {}            // Без модификаций
    };

    /**
     * Категории Harm Score (7 уровней)
     */
    const HARM_CATEGORIES = [
        { max: 1.0, id: 'superHealthy', name: '🟢 Суперполезный', color: '#16a34a', emoji: '🟢' },
        { max: 2.5, id: 'healthy', name: '🟢 Полезный', color: '#22c55e', emoji: '🟢' },
        { max: 4.0, id: 'neutral', name: '🟡 Нейтральный', color: '#eab308', emoji: '🟡' },
        { max: 5.5, id: 'mildlyHarmful', name: '🟠 Умеренно вредный', color: '#f97316', emoji: '🟠' },
        { max: 7.0, id: 'harmful', name: '🔴 Вредный', color: '#ef4444', emoji: '🔴' },
        { max: 8.5, id: 'veryHarmful', name: '🔴 Очень вредный', color: '#dc2626', emoji: '🔴' },
        { max: 10, id: 'superHarmful', name: '⚫ Супервредный', color: '#7f1d1d', emoji: '⚫' }
    ];

    // ===========================================================================
    // 🏭 NOVA CLASSIFICATION — Эвристика по названию продукта
    // ===========================================================================
    // NOVA 1: Необработанные или минимально обработанные продукты
    // NOVA 2: Кулинарные ингредиенты (масла, сахар, соль)
    // NOVA 3: Переработанные продукты (консервы, сыры)
    // NOVA 4: Ультрапереработанные продукты (чипсы, газировка, колбаса)
    // ===========================================================================

    const NOVA_PATTERNS = {
        // NOVA 4 — Ультрапереработанные (самый строгий список)
        nova4: [
            // Снеки и фастфуд
            'чипс', 'крекер', 'сухарик', 'попкорн',
            'бургер', 'гамбургер', 'хот-дог', 'наггетс', 'нагетс',
            'пицц', 'шаурм', 'шаверм', 'фастфуд',

            // Сладости промышленные
            'конфет', 'шоколадн', 'батончик', 'сникерс', 'марс', 'твикс', 'кит-кат', 'киткат',
            'печенье', 'вафл', 'пирожн', 'торт', 'кекс', 'маффин', 'круассан', 'пончик', 'донат',
            'мороженое', 'пломбир', 'эскимо',
            'зефир', 'мармелад', 'пастил', 'халва', 'нуга',

            // Напитки сладкие
            'кола', 'cola', 'пепси', 'pepsi', 'фанта', 'fanta', 'спрайт', 'sprite',
            'газировк', 'лимонад', 'тоник', 'энергетик', 'energy', 'red bull', 'monster',
            'нектар', 'сокосодержащ',

            // Мясные изделия промышленные
            'колбас', 'сосис', 'сардельк', 'ветчин', 'бекон', 'грудинк', 'буженин',
            'пельмен', 'вареник', 'манты', 'хинкал', 'позы', 'равиол',
            'котлет', 'тефтел', 'фрикадельк', // промышленные полуфабрикаты

            // Соусы и заправки
            'майонез', 'кетчуп', 'соус готов', 'заправк',

            // Молочные ультрапереработанные
            'йогурт питьев', 'йогурт с наполнител', 'глазирован', 'сырок глазирован',
            'молочн коктейл', 'милкшейк',

            // Завтраки и снеки
            'мюсл', 'гранол', 'хлопья', 'подушечк', 'кукурузн палочк',
            'сухой завтрак', 'cereal',

            // Хлебобулочные промышленные
            'хлебц', 'тост', 'слойк', 'булк',

            // Готовые блюда
            'лапша быстр', 'доширак', 'роллтон', 'instant', 'готов блюд',
            'замороженн', 'полуфабрикат',

            // Другое
            'маргарин', 'спред', 'чизкейк',
        ],

        // NOVA 3 — Переработанные
        nova3: [
            // Консервы
            'консерв', 'консервирован', 'маринован', 'солён', 'квашен', 'копчён',
            'тушёнк', 'паштет', 'шпрот',

            // Сыры
            'сыр', 'брынз', 'фета', 'моцарелл', 'пармезан', 'чеддер',

            // Мясо/рыба обработанные
            'буженина', 'рулет', 'карбонад', 'шейка', 'балык',
            'сельдь', 'скумбри', 'форель копч', 'лосось копч',

            // Молочные
            'сметан', 'сливк', 'масло сливоч',

            // Хлеб (не ультрапереработанный)
            'хлеб', 'батон', 'лаваш', 'пита', 'лепёшк',

            // Соки
            'сок',

            // Другое
            'пюре', 'варень', 'джем', 'повидл', 'мёд',
        ],

        // NOVA 2 — Кулинарные ингредиенты
        nova2: [
            'масло растител', 'масло подсолнеч', 'масло оливк', 'масло кукуруз', 'масло рапсов',
            'масло кокос', 'масло пальм', 'масло льнян', 'масло кунжут',
            'сахар', 'соль', 'мука', 'крахмал', 'дрожж',
            'уксус', 'желатин', 'агар',
        ],

        // NOVA 1 определяется по умолчанию, если не подошли другие категории
        // + явные паттерны для надёжности
        nova1: [
            // Свежие овощи
            'огурец', 'помидор', 'томат', 'морков', 'картоф', 'капуст', 'брокколи',
            'перец', 'лук ', 'чеснок', 'свёкл', 'редис', 'кабачок', 'баклажан',
            'тыкв', 'салат', 'шпинат', 'руккол', 'укроп', 'петрушк', 'базилик',
            'сельдер', 'фенхел', 'спарж', 'горох свеж', 'фасоль свеж',

            // Свежие фрукты и ягоды
            'яблок', 'груш', 'банан', 'апельсин', 'мандарин', 'лимон', 'грейпфрут',
            'виноград', 'персик', 'абрикос', 'слив', 'вишн', 'черешн', 'клубник',
            'малин', 'ежевик', 'голубик', 'черник', 'смородин', 'крыжовник',
            'арбуз', 'дын', 'манго', 'ананас', 'киви', 'гранат', 'хурм', 'инжир',
            'авокадо', 'кокос',

            // Мясо свежее
            'говядин', 'свинин', 'баранин', 'телятин', 'кролик', 'оленин',
            'курин', 'куриц', 'индейк', 'утк', 'гус',
            'филе', 'грудк', 'бедр', 'голен', 'крыл',

            // Рыба и морепродукты свежие
            'лосось', 'сёмг', 'форель', 'тунец', 'треск', 'камбал', 'палтус',
            'скумбри свеж', 'сельдь свеж', 'дорадо', 'сибас', 'окунь', 'судак', 'щук',
            'креветк', 'мидии', 'устриц', 'кальмар', 'осьминог', 'краб',

            // Молочные базовые
            'молоко', 'кефир', 'ряженк', 'простокваш', 'йогурт натур', 'творог',
            'яйц',

            // Крупы и бобовые
            'рис ', 'гречк', 'овёс', 'овсянк', 'пшен', 'перловк', 'ячнев', 'кукуруз',
            'булгур', 'кус-кус', 'киноа', 'полба',
            'чечевиц', 'нут', 'фасоль сух', 'горох сух', 'соя',

            // Орехи и семена
            'грецк', 'миндал', 'фундук', 'кешью', 'фисташк', 'арахис', 'пекан', 'макадам',
            'семечк', 'кунжут', 'лён', 'чиа', 'тыквен семен',

            // Сухофрукты
            'изюм', 'курага', 'чернослив', 'финик', 'инжир сушён',
        ]
    };

    // Отрицательные паттерны — понижают NOVA если встречаются
    const NOVA_NEGATIVE_PATTERNS = {
        // Слова, указывающие на свежесть/натуральность
        fresh: ['свеж', 'сыр', 'натурал', 'домашн', 'фермер', 'органик', 'био'],
        // Слова, указывающие на переработку
        processed: ['готов', 'быстр', 'instant', 'полуфабрикат', 'заморож', 'порошк']
    };

    /**
     * Определить NOVA группу продукта по названию (эвристика)
     * @param {string} productName - Название продукта
     * @returns {number} - NOVA группа (1-4)
     */
    function detectNovaGroup(productName) {
        if (!productName) return 2; // Default: кулинарный ингредиент

        const name = productName.toLowerCase().trim();

        // Проверяем NOVA 4 (ультрапереработанные) — самый строгий
        for (const pattern of NOVA_PATTERNS.nova4) {
            if (name.includes(pattern)) return 4;
        }

        // Проверяем NOVA 1 (необработанные) — высший приоритет над 2,3
        for (const pattern of NOVA_PATTERNS.nova1) {
            if (name.includes(pattern)) {
                // Но проверяем negative patterns (готовые блюда из свежего)
                const hasProcessed = NOVA_NEGATIVE_PATTERNS.processed.some(p => name.includes(p));
                if (hasProcessed) return 3; // Переработанные
                return 1; // Необработанные
            }
        }

        // Проверяем NOVA 3 (переработанные)
        for (const pattern of NOVA_PATTERNS.nova3) {
            if (name.includes(pattern)) return 3;
        }

        // Проверяем NOVA 2 (кулинарные ингредиенты)
        for (const pattern of NOVA_PATTERNS.nova2) {
            if (name.includes(pattern)) return 2;
        }

        // По умолчанию — NOVA 2 (неизвестный продукт)
        return 2;
    }

    // ===========================================================================
    // 📊 HARM SCORE CALCULATION
    // ===========================================================================

    /**
     * Рассчитать GI penalty
     * @param {number} gi - Гликемический индекс (0-100+)
     * @returns {number} - Штраф за GI
     */
    function calculateGIPenalty(gi) {
        if (!gi || gi <= 0) return 0;

        if (gi <= GI_PENALTY.low.max) return GI_PENALTY.low.penalty;
        if (gi <= GI_PENALTY.medium.max) return GI_PENALTY.medium.penalty;
        if (gi <= GI_PENALTY.high.max) return GI_PENALTY.high.penalty;

        // veryHigh: базовый штраф + прогрессивный
        return GI_PENALTY.veryHigh.penalty + (gi - 70) * GI_PENALTY.veryHigh.progressive;
    }

    /**
     * 🆕 v3.0: Рассчитать GL penalty
     * GL (Glycemic Load) = GI × carbs / 100
     * Более точный показатель реального гликемического воздействия
     */
    function calculateGLPenalty(gi, carbs100) {
        if (!gi || !carbs100 || gi <= 0 || carbs100 <= 0) return 0;

        const gl = (gi * carbs100) / 100;

        if (gl <= GL_PENALTY.low.max) return GL_PENALTY.low.penalty;
        if (gl <= GL_PENALTY.medium.max) return GL_PENALTY.medium.penalty;
        if (gl <= GL_PENALTY.high.max) return GL_PENALTY.high.penalty;

        // veryHigh: базовый штраф + прогрессивный
        return GL_PENALTY.veryHigh.penalty + (gl - 30) * GL_PENALTY.veryHigh.progressive;
    }

    /**
     * 🆕 v3.0: Рассчитать Omega-3/6 ratio penalty
     * Оптимум: omega-6:omega-3 ≤ 4:1 (Simopoulos 2002)
     */
    function calculateOmegaRatioPenalty(omega3, omega6) {
        if (!omega3 || omega3 <= 0) return 0; // Нет данных — без штрафа
        if (!omega6 || omega6 <= 0) return 0;

        const ratio = omega6 / omega3;

        if (ratio <= OMEGA_RATIO_PENALTY.optimal.maxRatio) return OMEGA_RATIO_PENALTY.optimal.penalty;
        if (ratio <= OMEGA_RATIO_PENALTY.acceptable.maxRatio) return OMEGA_RATIO_PENALTY.acceptable.penalty;
        if (ratio <= OMEGA_RATIO_PENALTY.harmful.maxRatio) return OMEGA_RATIO_PENALTY.harmful.penalty;

        return OMEGA_RATIO_PENALTY.veryHarmful.penalty;
    }

    /**
     * 🆕 v3.0: Рассчитать штраф за вредные E-добавки
     * Chassaing 2015 — добавки нарушают микробиом
     */
    function calculateAdditivesPenalty(additives) {
        if (!additives || !Array.isArray(additives) || additives.length === 0) return 0;

        let penalty = 0;
        const normalizedAdditives = additives.map(a => a.toString().toUpperCase().trim());

        for (const additive of normalizedAdditives) {
            if (HARMFUL_ADDITIVES.critical.includes(additive)) {
                penalty += 0.5;
            } else if (HARMFUL_ADDITIVES.moderate.includes(additive)) {
                penalty += 0.3;
            } else if (HARMFUL_ADDITIVES.mild.includes(additive)) {
                penalty += 0.1;
            }
        }

        return Math.min(penalty, 3.0); // Cap at 3.0
    }

    /**
     * 🆕 v3.0: Рассчитать бонусы за флаги качества
     * Smith-Spangler 2012, Aune 2016
     */
    function calculateQualityBonus(product) {
        let bonus = 0;

        for (const [flag, value] of Object.entries(QUALITY_BONUSES)) {
            if (product[flag] === true) {
                bonus += value; // value уже отрицательный
            }
        }

        return bonus; // Отрицательное число (снижает harm)
    }

    /**
     * Рассчитать Harm Score для продукта v3.0
     * 
     * @param {Object} product - Объект продукта с нутриентами на 100г
     * @param {Object} [options] - Опции расчёта
     * @param {number} [options.activityMultiplier=1.0] - Множитель активности (0.5-1.0)
     * @param {boolean} [options.includeNova=true] - Учитывать NOVA classification
     * @param {boolean} [options.includeGL=true] - 🆕 Учитывать Glycemic Load
     * @param {boolean} [options.includeOmega=true] - 🆕 Учитывать Omega ratio
     * @param {boolean} [options.includeAdditives=true] - 🆕 Учитывать E-добавки
     * @param {boolean} [options.includeQuality=true] - 🆕 Учитывать флаги качества
     * @param {boolean} [options.includeNutrientDensity=true] - 🆕 Учитывать микронутриентную плотность
     * @param {string} [options.goal='default'] - 🆕 Цель: weightLoss, muscleGain, health, default
     * @param {boolean} [options.debug=false] - Вернуть детализацию расчёта
     * @returns {number|Object} - Harm Score (0-10) или объект с деталями
     */
    function calculateHarmScore(product, options = {}) {
        if (!product) return options.debug ? { score: 5, error: 'No product' } : 5;

        const {
            activityMultiplier = 1.0,
            includeNova = true,
            includeGL = true,
            includeOmega = true,
            includeAdditives = true,
            includeQuality = true,
            includeNutrientDensity = true,
            goal = 'default',
            debug = false
        } = options;

        // Получаем модификаторы для цели
        const goalMod = GOAL_MODIFIERS[goal] || GOAL_MODIFIERS.default;

        // Извлекаем нутриенты с fallback'ами
        const trans = Number(product.trans100) || 0;
        const simple = Number(product.simple100) || 0;
        const badFat = Number(product.badFat100) || Number(product.badfat100) || 0;
        const sodium = Number(product.sodium100) || 0;
        const fiber = Number(product.fiber100) || 0;
        const protein = Number(product.protein100) || 0;
        const goodFat = Number(product.goodFat100) || Number(product.goodfat100) || 0;
        const gi = Number(product.gi) || Number(product.gi100) || Number(product.GI) || 0;
        const carbs = Number(product.carbs100) || (Number(product.simple100) || 0) + (Number(product.complex100) || 0);

        // 🆕 v3.0: Новые нутриенты
        const omega3 = Number(product.omega3_100) || 0;
        const omega6 = Number(product.omega6_100) || 0;
        const additives = product.additives || [];

        // NOVA группа (детект по названию если не задана явно)
        const novaGroup = product.novaGroup || (includeNova ? detectNovaGroup(product.name) : 1);

        // === РАСЧЁТ PENALTIES ===
        const penalties = {
            trans: trans * HARM_WEIGHTS.trans100,
            simple: simple * HARM_WEIGHTS.simple100 * (goalMod.simple100 || 1),
            badFat: badFat * HARM_WEIGHTS.badFat100 * (goalMod.badFat100 || 1),
            sodium: sodium * HARM_WEIGHTS.sodium100,
            gi: calculateGIPenalty(gi),
            nova: includeNova ? (HARM_WEIGHTS[`nova${novaGroup}`] || 0) * (goalMod.nova || 1) : 0,
            // 🆕 v3.0: Новые штрафы
            gl: includeGL ? calculateGLPenalty(gi, carbs) * (goalMod.gl || 1) : 0,
            omega: includeOmega ? calculateOmegaRatioPenalty(omega3, omega6) * (goalMod.omega || 1) : 0,
            additives: includeAdditives ? calculateAdditivesPenalty(additives) * (goalMod.additives || 1) : 0
        };
        const totalPenalties = Object.values(penalties).reduce((s, v) => s + v, 0);

        // === РАСЧЁТ BONUSES ===
        const bonuses = {
            fiber: Math.abs(fiber * HARM_WEIGHTS.fiber100 * (goalMod.fiber100 || 1)),
            protein: Math.abs(protein * HARM_WEIGHTS.protein100 * (goalMod.protein100 || 1)),
            goodFat: Math.abs(goodFat * HARM_WEIGHTS.goodFat100),
            // 🆕 v3.0: Новые бонусы
            quality: includeQuality ? Math.abs(calculateQualityBonus(product)) : 0,
            nutrientDensity: 0 // Рассчитаем ниже
        };

        // 🆕 v3.0: Nutrient Density bonus (Drewnowski 2005)
        if (includeNutrientDensity) {
            const density = calculateNutrientDensity(product);
            if (density > 0) {
                // Высокая плотность (>50) даёт бонус до -0.75
                bonuses.nutrientDensity = Math.abs(density * NUTRIENT_DENSITY_WEIGHT * (goalMod.nutrientDensity || 1));
            }
        }

        const totalBonuses = Object.values(bonuses).reduce((s, v) => s + v, 0);

        // === ИТОГОВЫЙ SCORE ===
        let rawScore = totalPenalties - totalBonuses;

        // Применяем множитель активности (снижает вред при тренировках)
        rawScore *= activityMultiplier;

        // Clamp to 0-10
        const score = Math.max(0, Math.min(10, rawScore));
        const roundedScore = Math.round(score * 10) / 10;

        if (debug) {
            return {
                score: roundedScore,
                version: '3.0',
                rawScore,
                penalties,
                bonuses,
                totalPenalties,
                totalBonuses,
                novaGroup,
                activityMultiplier,
                goal,
                goalModifiers: goalMod,
                inputs: {
                    trans, simple, badFat, sodium, fiber, protein, goodFat, gi, carbs,
                    omega3, omega6, additives: additives.length,
                    qualityFlags: Object.keys(QUALITY_BONUSES).filter(k => product[k])
                }
            };
        }

        return roundedScore;
    }

    /**
     * Получить категорию Harm Score
     * @param {number} harm - Harm Score (0-10)
     * @returns {Object} - { id, name, color, emoji }
     */
    function getHarmCategory(harm) {
        if (harm == null || isNaN(harm)) {
            return { id: 'unknown', name: '❓ Неизвестно', color: '#6b7280', emoji: '❓' };
        }

        for (const cat of HARM_CATEGORIES) {
            if (harm <= cat.max) {
                return { id: cat.id, name: cat.name, color: cat.color, emoji: cat.emoji };
            }
        }

        // Fallback: супервредный
        return HARM_CATEGORIES[HARM_CATEGORIES.length - 1];
    }

    /**
     * Получить цвет для Harm Score (gradient)
     * @param {number} harm - Harm Score (0-10)
     * @returns {string} - Hex color
     */
    function getHarmColor(harm) {
        return getHarmCategory(harm).color;
    }

    /**
     * Получить детальную расшифровку расчёта Harm Score v3.0
     * Используется для UI с объяснением формулы пользователю
     * СИНХРОНИЗИРОВАНО с calculateHarmScore v3.0!
     * 
     * @param {Object} product - Объект продукта
     * @param {Object} [options] - Опции (те же что у calculateHarmScore)
     * @returns {Object} - Структурированная расшифровка
     */
    function getHarmBreakdown(product, options = {}) {
        if (!product) return null;

        const {
            includeNova = true,
            includeGL = true,
            includeOmega = true,
            includeAdditives = true,
            includeQuality = true,
            includeNutrientDensity = true,
            goal = 'default'
        } = options;

        // Получаем модификаторы для цели
        const goalMod = GOAL_MODIFIERS[goal] || GOAL_MODIFIERS.default;

        // Извлекаем нутриенты (те же что в calculateHarmScore)
        const trans = Number(product.trans100) || 0;
        const simple = Number(product.simple100) || 0;
        const badFat = Number(product.badFat100) || Number(product.badfat100) || 0;
        const sodium = Number(product.sodium100) || 0;
        const fiber = Number(product.fiber100) || 0;
        const protein = Number(product.protein100) || 0;
        const goodFat = Number(product.goodFat100) || Number(product.goodfat100) || 0;
        const gi = Number(product.gi) || Number(product.gi100) || Number(product.GI) || 0;
        const carbs = Number(product.carbs100) || (Number(product.simple100) || 0) + (Number(product.complex100) || 0);

        // 🆕 v3.0: Новые нутриенты
        const omega3 = Number(product.omega3_100) || 0;
        const omega6 = Number(product.omega6_100) || 0;
        const additives = product.additives || [];

        const novaGroup = product.novaGroup || (includeNova ? detectNovaGroup(product.name) : 1);

        // Рассчитываем каждый компонент (синхронизировано с calculateHarmScore)
        const giPenalty = calculateGIPenalty(gi);
        const novaPenalty = includeNova ? (HARM_WEIGHTS[`nova${novaGroup}`] || 0) * (goalMod.nova || 1) : 0;
        const glPenalty = includeGL ? calculateGLPenalty(gi, carbs) * (goalMod.gl || 1) : 0;
        const omegaPenalty = includeOmega ? calculateOmegaRatioPenalty(omega3, omega6) * (goalMod.omega || 1) : 0;
        const additivesPenalty = includeAdditives ? calculateAdditivesPenalty(additives) * (goalMod.additives || 1) : 0;
        const qualityBonus = includeQuality ? Math.abs(calculateQualityBonus(product)) : 0;

        // Nutrient Density bonus
        let nutrientDensityBonus = 0;
        if (includeNutrientDensity) {
            const density = calculateNutrientDensity(product);
            if (density > 0) {
                nutrientDensityBonus = Math.abs(density * NUTRIENT_DENSITY_WEIGHT * (goalMod.nutrientDensity || 1));
            }
        }

        // === PENALTIES ===
        const penalties = [
            { id: 'trans', label: 'Транс-жиры', value: trans, weight: HARM_WEIGHTS.trans100, contribution: trans * HARM_WEIGHTS.trans100, unit: 'г', icon: '⚠️', desc: '×3.0 — самые вредные жиры' },
            { id: 'simple', label: 'Простые сахара', value: simple, weight: HARM_WEIGHTS.simple100, contribution: simple * HARM_WEIGHTS.simple100 * (goalMod.simple100 || 1), unit: 'г', icon: '🍬', desc: '×0.08 — быстрые углеводы' },
            { id: 'badFat', label: 'Насыщенные жиры', value: badFat, weight: HARM_WEIGHTS.badFat100, contribution: badFat * HARM_WEIGHTS.badFat100 * (goalMod.badFat100 || 1), unit: 'г', icon: '🧈', desc: '×0.10 — повышают LDL' },
            { id: 'sodium', label: 'Натрий', value: sodium, weight: HARM_WEIGHTS.sodium100, contribution: sodium * HARM_WEIGHTS.sodium100, unit: 'мг', icon: '🧂', desc: '×0.002 — риск гипертензии' },
            { id: 'gi', label: 'Гликемический индекс', value: gi, weight: null, contribution: giPenalty, unit: '', icon: '📈', desc: gi > 70 ? 'Высокий ГИ — прогрессивный штраф' : gi > 55 ? 'Средний ГИ' : 'Низкий ГИ — без штрафа' },
            { id: 'nova', label: `NOVA ${novaGroup}`, value: novaGroup, weight: null, contribution: novaPenalty, unit: '', icon: '🏭', desc: novaGroup === 4 ? 'Ультрапереработанный' : novaGroup === 3 ? 'Переработанный' : novaGroup === 2 ? 'Ингредиент' : 'Необработанный' },
            // 🆕 v3.0: Новые штрафы
            { id: 'gl', label: 'Гликемическая нагрузка', value: carbs > 0 ? Math.round((gi * carbs) / 100 * 10) / 10 : 0, weight: null, contribution: glPenalty, unit: '', icon: '📊', desc: 'GL = GI × углеводы / 100' },
            { id: 'omega', label: 'Соотношение Omega-6/3', value: omega3 > 0 ? Math.round(omega6 / omega3 * 10) / 10 : 0, weight: null, contribution: omegaPenalty, unit: ':1', icon: '🐟', desc: 'Оптимум ≤4:1' },
            { id: 'additives', label: 'E-добавки', value: additives.length, weight: null, contribution: additivesPenalty, unit: 'шт', icon: '🧪', desc: 'Вредные пищевые добавки' }
        ].filter(p => p.contribution > 0.01); // Показываем только значимые

        // === BONUSES ===
        const bonuses = [
            { id: 'fiber', label: 'Клетчатка', value: fiber, weight: Math.abs(HARM_WEIGHTS.fiber100), contribution: Math.abs(fiber * HARM_WEIGHTS.fiber100 * (goalMod.fiber100 || 1)), unit: 'г', icon: '🥬', desc: '×0.30 — замедляет всасывание' },
            { id: 'protein', label: 'Белок', value: protein, weight: Math.abs(HARM_WEIGHTS.protein100), contribution: Math.abs(protein * HARM_WEIGHTS.protein100 * (goalMod.protein100 || 1)), unit: 'г', icon: '🥩', desc: '×0.06 — снижает ГИ' },
            { id: 'goodFat', label: 'Полезные жиры', value: goodFat, weight: Math.abs(HARM_WEIGHTS.goodFat100), contribution: Math.abs(goodFat * HARM_WEIGHTS.goodFat100), unit: 'г', icon: '🥑', desc: '×0.04 — MUFA/PUFA' },
            // 🆕 v3.0: Новые бонусы
            { id: 'quality', label: 'Качество', value: null, weight: null, contribution: qualityBonus, unit: '', icon: '🌿', desc: 'Органик/цельнозерн./ферментир.' },
            { id: 'nutrientDensity', label: 'Плотность нутриентов', value: null, weight: null, contribution: nutrientDensityBonus, unit: '', icon: '💎', desc: 'Drewnowski 2005' }
        ].filter(b => b.contribution > 0.01); // Показываем только значимые

        const totalPenalties = penalties.reduce((s, p) => s + p.contribution, 0);
        const totalBonuses = bonuses.reduce((s, b) => s + b.contribution, 0);
        const rawScore = totalPenalties - totalBonuses;
        const score = Math.max(0, Math.min(10, rawScore));
        const roundedScore = Math.round(score * 10) / 10;
        const category = getHarmCategory(roundedScore);

        return {
            score: roundedScore,
            version: '3.0',
            category,
            formula: `${totalPenalties.toFixed(1)} штрафов − ${totalBonuses.toFixed(1)} бонусов = ${roundedScore}`,
            penalties,
            bonuses,
            totalPenalties: Math.round(totalPenalties * 10) / 10,
            totalBonuses: Math.round(totalBonuses * 10) / 10,
            novaGroup,
            goal,
            inputs: { trans, simple, badFat, sodium, fiber, protein, goodFat, gi, carbs, omega3, omega6, additives: additives.length }
        };
    }

    // ===========================================================================
    // 🍽️ MEAL-LEVEL HARM CALCULATION
    // ===========================================================================

    /**
     * Рассчитать средневзвешенный Harm Score для приёма пищи
     * @param {Object} meal - Объект приёма пищи с items
     * @param {Object} productIndex - Индекс продуктов {byId, byName}
     * @param {Function} getProductFromItem - Функция получения продукта из item
     * @param {Object} [activityContext] - Контекст тренировки {harmMultiplier}
     * @returns {Object} - { harm, category, breakdown }
     */
    function calculateMealHarm(meal, productIndex, getProductFromItem, activityContext = null) {
        if (!meal || !Array.isArray(meal.items) || meal.items.length === 0) {
            return { harm: 0, category: getHarmCategory(0), breakdown: [] };
        }

        const harmMultiplier = activityContext?.harmMultiplier || 1.0;
        let harmSum = 0;
        let gramSum = 0;
        const breakdown = [];

        for (const item of meal.items) {
            const product = getProductFromItem(item, productIndex);
            if (!product) continue;

            const grams = Number(item.grams) || 0;
            if (grams <= 0) continue;

            // Рассчитываем harm для продукта (или берём существующий)
            let productHarm = product.harm ?? product.harmScore ?? product.harmscore ?? product.harm100;
            if (productHarm == null) {
                productHarm = calculateHarmScore(product);
            }

            // Применяем множитель активности
            const adjustedHarm = productHarm * harmMultiplier;

            harmSum += adjustedHarm * grams;
            gramSum += grams;

            breakdown.push({
                name: product.name || item.name,
                grams,
                harm: productHarm,
                adjustedHarm,
                contribution: adjustedHarm * grams
            });
        }

        const avgHarm = gramSum > 0 ? harmSum / gramSum : 0;
        const roundedHarm = Math.round(avgHarm * 10) / 10;

        return {
            harm: roundedHarm,
            category: getHarmCategory(roundedHarm),
            breakdown,
            gramSum,
            harmMultiplier
        };
    }

    // ===========================================================================
    // 📋 EXTENDED PRODUCT MODEL — Дополнительные нутриенты
    // ===========================================================================
    // Эти поля можно добавлять к продуктам для более точной оценки.
    // AI-агент может заполнить их из USDA/FatSecret/OpenFoodFacts.
    // ===========================================================================

    /**
     * @typedef {Object} ExtendedNutrients
     * @property {number} [sodium100] - Натрий (мг на 100г) — критично для гипертензии
     * @property {number} [cholesterol100] - Холестерин (мг на 100г)
     * @property {number} [sugar100] - Добавленный сахар (г на 100г) — отличие от natural sugars
     * @property {number} [saturatedFat100] - Alias для badFat100
     * @property {number} [omega3_100] - Омега-3 (г на 100г)
     * @property {number} [omega6_100] - Омега-6 (г на 100г)
     * 
     * // Витамины (% от суточной нормы на 100г)
     * @property {number} [vitaminA] - Витамин A (%)
     * @property {number} [vitaminC] - Витамин C (%)
     * @property {number} [vitaminD] - Витамин D (%)
     * @property {number} [vitaminE] - Витамин E (%)
     * @property {number} [vitaminK] - Витамин K (%)
     * @property {number} [vitaminB1] - Тиамин (%)
     * @property {number} [vitaminB2] - Рибофлавин (%)
     * @property {number} [vitaminB3] - Ниацин (%)
     * @property {number} [vitaminB6] - Пиридоксин (%)
     * @property {number} [vitaminB9] - Фолат (%)
     * @property {number} [vitaminB12] - Кобаламин (%)
     * 
     * // Минералы (% от суточной нормы на 100г)
     * @property {number} [calcium] - Кальций (%)
     * @property {number} [iron] - Железо (%)
     * @property {number} [magnesium] - Магний (%)
     * @property {number} [phosphorus] - Фосфор (%)
     * @property {number} [potassium] - Калий (%)
     * @property {number} [zinc] - Цинк (%)
     * @property {number} [selenium] - Селен (%)
     * @property {number} [iodine] - Йод (%)
     * 
     * // NOVA и переработка
     * @property {number} [novaGroup] - NOVA классификация (1-4)
     * @property {boolean} [isUltraProcessed] - Флаг ультрапереработки
     * @property {string[]} [additives] - E-добавки
     * 
     * // Дополнительные флаги
     * @property {boolean} [isOrganic] - Органический продукт
     * @property {boolean} [isWholeGrain] - Цельнозерновой
     * @property {boolean} [isFermented] - Ферментированный
     * @property {boolean} [isRaw] - Сырой/не обработанный термически
     */

    /**
     * Рассчитать Nutrient Density Score (микронутриентная плотность)
     * Чем выше — тем больше полезных веществ на калорию
     * 
     * @param {Object} product - Продукт с витаминами/минералами
     * @returns {number} - Score 0-100
     */
    function calculateNutrientDensity(product) {
        if (!product) return 0;

        const kcal = Number(product.kcal100) || 100;
        const kcalFactor = 100 / Math.max(kcal, 1); // Нормализация на 100 ккал

        // Список ключевых микронутриентов и их веса
        const micronutrients = [
            { field: 'vitaminA', weight: 1 },
            { field: 'vitaminC', weight: 1.2 },
            { field: 'vitaminD', weight: 1.5 },
            { field: 'vitaminB12', weight: 1.3 },
            { field: 'vitaminB9', weight: 1.1 }, // Folate
            { field: 'iron', weight: 1.2 },
            { field: 'calcium', weight: 1 },
            { field: 'magnesium', weight: 1.1 },
            { field: 'potassium', weight: 0.8 },
            { field: 'zinc', weight: 1 },
            { field: 'fiber100', weight: 2, isDirect: true } // Клетчатка в граммах, не %
        ];

        let totalScore = 0;
        let totalWeight = 0;

        for (const { field, weight, isDirect } of micronutrients) {
            const value = Number(product[field]) || 0;
            if (value > 0) {
                // Для % DV — просто берём значение
                // Для прямых значений (fiber) — конвертируем в условные %
                const normalizedValue = isDirect ? value * 3 : value; // 10г клетчатки ≈ 30%
                totalScore += Math.min(normalizedValue, 100) * weight; // Cap at 100%
                totalWeight += weight;
            }
        }

        if (totalWeight === 0) return 0;

        // Нормализуем на калорийность и приводим к 0-100
        const density = (totalScore / totalWeight) * kcalFactor;
        return Math.round(Math.min(density, 100) * 10) / 10;
    }

    // ===========================================================================
    // 🔧 UTILITY FUNCTIONS
    // ===========================================================================

    /**
     * Нормализовать продукт и добавить вычисляемые поля
     * @param {Object} product - Исходный продукт
     * @returns {Object} - Продукт с harm, novaGroup и др.
     */
    function enrichProduct(product) {
        if (!product) return product;

        const enriched = { ...product };

        // Вычисляем NOVA если не задана
        if (enriched.novaGroup == null) {
            enriched.novaGroup = detectNovaGroup(enriched.name);
        }

        // Вычисляем Harm Score если не задан
        if (enriched.harm == null && enriched.harmScore == null) {
            enriched.harm = calculateHarmScore(enriched);
        }

        // Вычисляем Nutrient Density если есть микронутриенты
        if (enriched.nutrientDensity == null) {
            const density = calculateNutrientDensity(enriched);
            if (density > 0) {
                enriched.nutrientDensity = density;
            }
        }

        return enriched;
    }

    /**
     * Валидировать и исправить Harm Score для массива продуктов
     * @param {Object[]} products - Массив продуктов
     * @param {Object} [options] - Опции
     * @param {boolean} [options.recalculate=false] - Пересчитать даже если есть
     * @returns {Object} - { updated, products, stats }
     */
    function validateAndFixHarmScores(products, options = {}) {
        if (!Array.isArray(products)) return { updated: 0, products: [], stats: {} };

        const { recalculate = false } = options;
        let updated = 0;
        const stats = { total: products.length, withHarm: 0, calculated: 0, novaStats: {} };

        const fixedProducts = products.map(p => {
            if (!p) return p;

            const hasHarm = p.harm != null || p.harmScore != null;
            if (hasHarm) stats.withHarm++;

            if (recalculate || !hasHarm) {
                const enriched = enrichProduct(p);
                if (enriched.harm !== p.harm) {
                    updated++;
                    stats.calculated++;
                }

                // Считаем NOVA статистику
                const nova = enriched.novaGroup || 2;
                stats.novaStats[`nova${nova}`] = (stats.novaStats[`nova${nova}`] || 0) + 1;

                return enriched;
            }

            return p;
        });

        return { updated, products: fixedProducts, stats };
    }

    // ===========================================================================
    // 📤 EXPORTS
    // ===========================================================================

    // Constants
    Harm.HARM_WEIGHTS = HARM_WEIGHTS;
    Harm.GI_PENALTY = GI_PENALTY;
    Harm.HARM_CATEGORIES = HARM_CATEGORIES;
    Harm.NOVA_PATTERNS = NOVA_PATTERNS;
    // 🆕 v3.0 constants
    Harm.GL_PENALTY = GL_PENALTY;
    Harm.OMEGA_RATIO_PENALTY = OMEGA_RATIO_PENALTY;
    Harm.QUALITY_BONUSES = QUALITY_BONUSES;
    Harm.HARMFUL_ADDITIVES = HARMFUL_ADDITIVES;
    Harm.GOAL_MODIFIERS = GOAL_MODIFIERS;

    // Functions
    Harm.detectNovaGroup = detectNovaGroup;
    Harm.calculateGIPenalty = calculateGIPenalty;
    Harm.calculateHarmScore = calculateHarmScore;
    Harm.getHarmCategory = getHarmCategory;
    Harm.getHarmColor = getHarmColor;
    Harm.getHarmBreakdown = getHarmBreakdown;
    Harm.calculateMealHarm = calculateMealHarm;
    Harm.calculateNutrientDensity = calculateNutrientDensity;
    Harm.enrichProduct = enrichProduct;
    Harm.validateAndFixHarmScores = validateAndFixHarmScores;
    // 🆕 v3.0 functions
    Harm.calculateGLPenalty = calculateGLPenalty;
    Harm.calculateOmegaRatioPenalty = calculateOmegaRatioPenalty;
    Harm.calculateAdditivesPenalty = calculateAdditivesPenalty;
    Harm.calculateQualityBonus = calculateQualityBonus;

    // Для обратной совместимости — экспортируем в HEYS.products если нужно
    if (HEYS.products) {
        HEYS.products.calculateHarmScore = calculateHarmScore;
        HEYS.products.getHarmCategory = getHarmCategory;
    }

    // Verbose log disabled
    // console.log('[HEYS] Harm Score v3.0 module loaded');

})(typeof window !== 'undefined' ? window : this);


/* ===== heys_sparkline_utils_v1.js ===== */
// heys_sparkline_utils_v1.js — Утилиты для sparkline графиков
// Единый источник для калорий и веса: кривые, расчёты, конфигурация
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  
  // === КОНФИГУРАЦИЯ SPARKLINE ===
  const SPARKLINE_CONFIG = {
    // Период графика (дней)
    chartPeriod: 10,
    
    // Размеры SVG
    svgWidth: 360,
    svgHeight: 120,
    svgHeightKcal: 150, // Калории выше из-за полосы оценки дня
    
    // Отступы
    paddingTop: 16,
    paddingBottom: 16,
    paddingX: 8,
    
    // Lookback для поиска первого дня с данными
    maxLookbackDays: 60,
    
    // === Вес ===
    weight: {
      maxSlopePerDay: 0.3,      // Максимум ±0.3 кг/день
      decayRate: 0.15,          // 15% decay к цели за день (медленнее)
      confidenceKg: 0.3,        // ±300г для confidence interval
      trendThreshold: 0.05,     // Порог изменения для цвета точки
    },
    
    // === Калории ===
    kcal: {
      maxSlopePerDay: 500,      // Максимум ±500 ккал/день
      decayRate: 0.30,          // 30% decay к цели за день
      trendDays: 2,             // Дни по тренду перед regression
    },
    
    // === Анимация ===
    animation: {
      baseDelay: 3,             // Базовая задержка (секунды)
      delayPerPoint: 0.15,      // Задержка на точку
      lineDuration: 1.5,        // Длительность анимации линии
    },
    
    // === Цвета ===
    colors: {
      // Прогноз
      forecast: '#9ca3af',       // gray-400
      forecastOpacity: 0.6,
      
      // Тренд веса
      weightDown: '#22c55e',     // green-500 (хорошо)
      weightUp: '#ef4444',       // red-500 (плохо)
      weightStable: '#3b82f6',   // violet-500
      
      // Цикл
      retention: '#ec4899',      // pink-500
      
      // Streak
      streakGold: '#f59e0b',     // amber-500
    }
  };

  // === УТИЛИТЫ ===
  
  /**
   * Построить плавную кривую через точки (Catmull-Rom → Bezier)
   * @param {Array<{x: number, y: number}>} pts - Массив точек
   * @param {number} tension - Напряжение кривой (0-1), default 0.25
   * @returns {string} SVG path d attribute
   */
  function smoothPath(pts, tension = 0.25) {
    if (!pts || pts.length < 2) return '';
    if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
    
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      
      let cp1x = p1.x + (p2.x - p0.x) * tension;
      let cp1y = p1.y + (p2.y - p0.y) * tension;
      let cp2x = p2.x - (p3.x - p1.x) * tension;
      let cp2y = p2.y - (p3.y - p1.y) * tension;
      
      // Monotonic constraint — ограничиваем overshooting
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      const margin = (maxY - minY) * 0.15;
      cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
      cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
      
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  }
  
  /**
   * Линейная регрессия для массива значений
   * @param {number[]} values - Массив значений
   * @returns {{slope: number, intercept: number, predict: (x: number) => number}}
   */
  function linearRegression(values) {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: values[0] || 0, predict: () => values[0] || 0 };
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }
    
    const denominator = n * sumX2 - sumX * sumX;
    const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
    const intercept = (sumY - slope * sumX) / n;
    
    return {
      slope,
      intercept,
      predict: (x) => intercept + slope * x
    };
  }
  
  /**
   * Regression to Mean — прогноз с возвратом к целевому значению
   * @param {number} lastValue - Последнее известное значение
   * @param {number} targetValue - Целевое значение
   * @param {number} slope - Текущий тренд (изменение за единицу)
   * @param {number} dayIndex - Номер дня прогноза (1, 2, 3...)
   * @param {number} trendDays - Сколько дней следовать тренду (default 2)
   * @param {number} decayRate - Скорость возврата к цели (0-1, default 0.3)
   * @returns {number} Прогнозное значение
   */
  function regressionToMean(lastValue, targetValue, slope, dayIndex, trendDays = 2, decayRate = 0.3) {
    if (dayIndex <= trendDays) {
      // Первые N дней — следуем тренду
      return lastValue + slope * dayIndex;
    } else {
      // После — возвращаемся к цели
      // Сначала вычисляем значение на конец тренд-периода
      let value = lastValue + slope * trendDays;
      // Затем применяем decay для каждого дня после тренда
      for (let d = trendDays + 1; d <= dayIndex; d++) {
        value = value + (targetValue - value) * decayRate;
      }
      return value;
    }
  }
  
  /**
   * Найти первый день с данными за период
   * @param {number} maxDays - Максимум дней назад
   * @param {function} hasDataFn - Функция проверки (dateStr) => boolean
   * @returns {string|null} Дата первого дня с данными или null
   */
  function findFirstDataDay(maxDays, hasDataFn) {
    const today = new Date();
    for (let i = maxDays; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = formatDate(d);
      if (hasDataFn(dateStr)) {
        return dateStr;
      }
    }
    return null;
  }
  
  /**
   * Форматировать дату как YYYY-MM-DD
   */
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  
  /**
   * Получить число дня из даты (без ведущего нуля)
   */
  function getDayNum(dateStr) {
    return dateStr.slice(-2).replace(/^0/, '');
  }
  
  /**
   * Рассчитать координаты точек для SVG
   * @param {Array} data - Массив данных с полем value
   * @param {number} width - Ширина SVG
   * @param {number} height - Высота SVG
   * @param {Object} padding - { top, bottom, x }
   * @param {Object} range - { min, max } или null для авто
   * @returns {Array} Массив точек с x, y координатами
   */
  function calculateSvgPoints(data, width, height, padding, range = null) {
    if (!data || data.length === 0) return [];
    
    const values = data.map(d => d.value);
    const minVal = range?.min ?? Math.min(...values);
    const maxVal = range?.max ?? Math.max(...values);
    const rawRange = maxVal - minVal;
    const valueRange = Math.max(1, rawRange + rawRange * 0.1); // +10% padding
    const adjustedMin = minVal - rawRange * 0.05;
    
    const chartHeight = height - padding.top - padding.bottom;
    const chartWidth = width - padding.x * 2;
    
    return data.map((d, i) => {
      const x = padding.x + (data.length > 1 ? (i / (data.length - 1)) * chartWidth : chartWidth / 2);
      const y = padding.top + chartHeight - ((d.value - adjustedMin) / valueRange) * chartHeight;
      return { ...d, x, y };
    });
  }
  
  /**
   * Clamp значение в диапазон
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  
  /**
   * Получить цвет тренда веса
   */
  function getWeightTrendColor(change) {
    const threshold = SPARKLINE_CONFIG.weight.trendThreshold;
    if (change < -threshold) return SPARKLINE_CONFIG.colors.weightDown;
    if (change > threshold) return SPARKLINE_CONFIG.colors.weightUp;
    return SPARKLINE_CONFIG.colors.weightStable;
  }
  
  /**
   * Кэш для localStorage — избегаем повторных чтений
   */
  const localStorageCache = {
    _cache: new Map(),
    _lastClear: Date.now(),
    _maxAge: 5000, // 5 секунд
    
    get(key) {
      // Очищаем кэш каждые 5 секунд
      if (Date.now() - this._lastClear > this._maxAge) {
        this._cache.clear();
        this._lastClear = Date.now();
      }
      
      if (this._cache.has(key)) {
        return this._cache.get(key);
      }
      
      try {
        const raw = localStorage.getItem(key);
        if (!raw) {
          this._cache.set(key, null);
          return null;
        }
        const parsed = raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
        this._cache.set(key, parsed);
        return parsed;
      } catch (e) {
        this._cache.set(key, null);
        return null;
      }
    },
    
    clear() {
      this._cache.clear();
      this._lastClear = Date.now();
    },
    
    // Предзагрузка данных для диапазона дат
    preload(keys) {
      keys.forEach(key => this.get(key));
    }
  };
  
  /**
   * Получить данные дня из кэша
   * @param {string} dateStr - Дата YYYY-MM-DD
   * @param {string} clientId - ID клиента
   * @returns {Object|null} Данные дня
   */
  function getDayDataCached(dateStr, clientId) {
    const scopedKey = clientId 
      ? `heys_${clientId}_dayv2_${dateStr}` 
      : `heys_dayv2_${dateStr}`;
    return localStorageCache.get(scopedKey);
  }
  
  /**
   * Предзагрузить данные за период
   * @param {number} days - Количество дней
   * @param {string} clientId - ID клиента
   */
  function preloadDayData(days, clientId) {
    const today = new Date();
    const keys = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = formatDate(d);
      const scopedKey = clientId 
        ? `heys_${clientId}_dayv2_${dateStr}` 
        : `heys_dayv2_${dateStr}`;
      keys.push(scopedKey);
    }
    localStorageCache.preload(keys);
  }

  // === ЭКСПОРТ ===
  HEYS.SparklineUtils = {
    // Конфигурация
    CONFIG: SPARKLINE_CONFIG,
    
    // Функции построения кривых
    smoothPath,
    
    // Математика
    linearRegression,
    regressionToMean,
    clamp,
    
    // Даты
    formatDate,
    getDayNum,
    findFirstDataDay,
    
    // SVG
    calculateSvgPoints,
    
    // Цвета
    getWeightTrendColor,
    
    // Кэширование
    cache: localStorageCache,
    getDayDataCached,
    preloadDayData
  };

  // Для отладки
  if (typeof window !== 'undefined') {
    window.debugSparklineConfig = () => {
      console.table(SPARKLINE_CONFIG);
      console.log('Cache size:', localStorageCache._cache.size);
    };
  }

})(typeof window !== 'undefined' ? window : global);


/* ===== heys_sparklines_shared_v1.js ===== */
// heys_sparklines_shared_v1.js — Shared sparkline helpers (mini charts)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function toISODate(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    function getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay(); // 0=Sun..6=Sat
        const diff = (day + 6) % 7; // days since Monday
        d.setDate(d.getDate() - diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function getWeekDates(anchorDate) {
        const start = getWeekStart(anchorDate);
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            dates.push(toISODate(d));
        }
        return dates;
    }

    function formatDateRange(dates) {
        if (!dates || dates.length === 0) return '';
        const first = new Date(dates[0]);
        const last = new Date(dates[dates.length - 1]);
        const fmt = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        return fmt(first) + ' — ' + fmt(last);
    }

    function getByPath(obj, path) {
        if (!path) return undefined;
        const parts = String(path).split('.');
        let cur = obj;
        for (const p of parts) {
            if (!cur) return undefined;
            cur = cur[p];
        }
        return cur;
    }

    function buildSeriesFromRows(rows, options = {}) {
        const {
            valueKey,
            targetKey,
            valueGetter,
            targetGetter,
            dateKey = 'dstr'
        } = options;

        const values = (rows || []).map((row) => {
            if (valueGetter) return valueGetter(row);
            return getByPath(row, valueKey);
        });

        const targets = targetKey || targetGetter
            ? (rows || []).map((row) => {
                if (targetGetter) return targetGetter(row);
                return getByPath(row, targetKey);
            })
            : null;

        const labels = (rows || []).map((row) => row?.[dateKey] || '');

        return { values, targets, labels };
    }

    function normalizeValues(values) {
        const clean = (values || []).filter((v) => Number.isFinite(v));
        if (!clean.length) return { min: 0, max: 1 };
        const min = Math.min.apply(null, clean);
        const max = Math.max.apply(null, clean);
        return { min, max: min === max ? min + 1 : max };
    }

    function buildPolylinePoints(values, width, height, padding) {
        const safeValues = (values || []).map((v) => (Number.isFinite(v) ? v : null));
        const { min, max } = normalizeValues(safeValues);
        const span = max - min || 1;
        const step = (width - padding * 2) / Math.max(1, safeValues.length - 1);

        const points = [];
        safeValues.forEach((v, i) => {
            if (v == null) return;
            const x = padding + i * step;
            const y = padding + (height - padding * 2) - ((v - min) / span) * (height - padding * 2);
            points.push(x + ',' + y);
        });

        return points.join(' ');
    }

    function buildPolylinePointArray(values, width, height, padding) {
        const safeValues = (values || []).map((v) => (Number.isFinite(v) ? v : null));
        const { min, max } = normalizeValues(safeValues);
        const span = max - min || 1;
        const step = (width - padding * 2) / Math.max(1, safeValues.length - 1);

        return safeValues.map((v, i) => {
            if (v == null) return null;
            const x = padding + i * step;
            const y = padding + (height - padding * 2) - ((v - min) / span) * (height - padding * 2);
            return { x, y, v, i };
        }).filter(Boolean);
    }

    let sparklineGradientId = 0;

    function renderMiniSparkline({
        React,
        values,
        targets,
        width = 160,
        height = 42,
        stroke = '#60a5fa',
        targetStroke = '#94a3b8',
        padding = 4,
        className = '',
        useTargetGradient = false,
        aboveStroke = '#ef4444',
        belowStroke = '#22c55e',
        fillTargetGradient = false,
        aboveFill = 'rgba(239, 68, 68, 0.18)',
        belowFill = 'rgba(34, 197, 94, 0.18)',
        showPeakDots = false,
        peakDotRadius = 3.4,
        perfectDotRadius = 3.9,
        perfectEps = 0.04,
        perfectDotColor = '#f59e0b',
        peakAboveColor = '#dc2626',
        peakBelowColor = '#16a34a'
    }) {
        if (!React) return null;

        const linePoints = buildPolylinePoints(values, width, height, padding);
        const targetPoints = targets ? buildPolylinePoints(targets, width, height, padding) : '';
        const gradId = useTargetGradient ? ('sparkline-grad-' + (++sparklineGradientId)) : null;
        const fillGradId = fillTargetGradient ? ('sparkline-fill-grad-' + (++sparklineGradientId)) : null;
        const pointsArr = (useTargetGradient || showPeakDots) ? buildPolylinePointArray(values, width, height, padding) : [];
        const hasTargets = useTargetGradient && Array.isArray(targets) && targets.length === (values || []).length;
        const gradientStops = [];
        const fillStops = [];
        const peakDots = [];
        const peakTargetsValid = Array.isArray(targets) && targets.length === (values || []).length;

        if (useTargetGradient && hasTargets && pointsArr.length > 0) {
            let prevColor = null;
            let prevOffset = null;
            pointsArr.forEach((pt) => {
                const target = targets[pt.i];
                if (!Number.isFinite(target)) return;
                const color = pt.v > target ? aboveStroke : belowStroke;
                const fillColor = pt.v > target ? aboveFill : belowFill;
                const offset = Math.min(1, Math.max(0, (pt.x - padding) / Math.max(1, width - padding * 2)));

                if (prevColor && color !== prevColor && prevOffset != null) {
                    const mid = (prevOffset + offset) / 2;
                    const delta = Math.min(0.02, Math.abs(offset - prevOffset) / 2);
                    gradientStops.push({ offset: Math.max(0, mid - delta), color: prevColor });
                    gradientStops.push({ offset: Math.min(1, mid + delta), color });
                }

                gradientStops.push({ offset, color });
                fillStops.push({ offset, color: fillColor });
                prevColor = color;
                prevOffset = offset;
            });
        }

        const areaPath = (() => {
            if (!fillTargetGradient || !pointsArr.length) return '';
            const baseline = height - padding;
            const first = pointsArr[0];
            const last = pointsArr[pointsArr.length - 1];
            const linePath = pointsArr.map((pt) => `${pt.x},${pt.y}`).join(' ');
            return `M ${first.x},${baseline} L ${linePath} L ${last.x},${baseline} Z`;
        })();

        if (showPeakDots && pointsArr.length >= 2) {
            const lastIdx = pointsArr.length - 1;
            for (let i = 0; i <= lastIdx; i += 1) {
                const prev = pointsArr[i - 1];
                const cur = pointsArr[i];
                const next = pointsArr[i + 1];
                if (!cur) continue;

                let isPeak = false;
                let isTrough = false;
                if (i === 0 && next) {
                    isPeak = cur.v >= next.v;
                    isTrough = cur.v <= next.v;
                } else if (i === lastIdx && prev) {
                    isPeak = cur.v >= prev.v;
                    isTrough = cur.v <= prev.v;
                } else if (prev && next) {
                    isPeak = cur.v >= prev.v && cur.v >= next.v;
                    isTrough = cur.v <= prev.v && cur.v <= next.v;
                }

                if (!(isPeak || isTrough)) continue;

                const target = peakTargetsValid ? targets[cur.i] : null;
                const isPerfect = Number.isFinite(target) && target > 0
                    ? Math.abs(cur.v - target) / target <= perfectEps
                    : false;
                const dotColor = isPerfect
                    ? perfectDotColor
                    : (Number.isFinite(target) && cur.v > target ? peakAboveColor : peakBelowColor);
                peakDots.push({
                    x: cur.x,
                    y: cur.y,
                    r: isPerfect ? perfectDotRadius : peakDotRadius,
                    color: dotColor,
                    isPerfect
                });
            }
        }

        return React.createElement('svg', {
            className: 'sparkline ' + className,
            width,
            height,
            viewBox: `0 0 ${width} ${height}`,
            role: 'img'
        },
            (useTargetGradient && hasTargets && gradientStops.length) || (fillTargetGradient && hasTargets && fillStops.length)
                ? React.createElement('defs', null,
                    useTargetGradient && gradientStops.length ? React.createElement('linearGradient', {
                        id: gradId,
                        x1: '0',
                        y1: '0',
                        x2: '1',
                        y2: '0'
                    },
                        gradientStops.map((stop, idx) => React.createElement('stop', {
                            key: `${gradId}-${idx}`,
                            offset: `${Math.round(stop.offset * 1000) / 10}%`,
                            stopColor: stop.color
                        }))
                    ) : null,
                    fillTargetGradient && fillStops.length ? React.createElement('linearGradient', {
                        id: fillGradId,
                        x1: '0',
                        y1: '0',
                        x2: '1',
                        y2: '0'
                    },
                        fillStops.map((stop, idx) => React.createElement('stop', {
                            key: `${fillGradId}-${idx}`,
                            offset: `${Math.round(stop.offset * 1000) / 10}%`,
                            stopColor: stop.color
                        }))
                    ) : null
                )
                : null,
            fillTargetGradient && hasTargets && areaPath ? React.createElement('path', {
                d: areaPath,
                fill: fillStops.length ? `url(#${fillGradId})` : 'transparent',
                stroke: 'none'
            }) : null,
            targetPoints ? React.createElement('polyline', {
                points: targetPoints,
                fill: 'none',
                stroke: targetStroke,
                strokeWidth: 1,
                strokeDasharray: '4 3'
            }) : null,
            React.createElement('polyline', {
                points: linePoints,
                fill: 'none',
                stroke: useTargetGradient && hasTargets && gradientStops.length ? `url(#${gradId})` : stroke,
                strokeWidth: 2,
                strokeLinecap: 'round',
                strokeLinejoin: 'round'
            }),
            showPeakDots && peakDots.length
                ? peakDots.map((dot, idx) => React.createElement('circle', {
                    key: `peak-${idx}`,
                    cx: dot.x,
                    cy: dot.y,
                    r: dot.r,
                    fill: dot.color,
                    stroke: '#ffffff',
                    strokeWidth: dot.isPerfect ? 1.4 : 1.2
                }))
                : null
        );
    }

    function renderMetricSparkline({
        React,
        title,
        subtitle,
        values,
        targets,
        valueLabel,
        className = ''
    }) {
        if (!React) return null;

        return React.createElement('div', { className: 'sparkline-metric ' + className },
            React.createElement('div', { className: 'sparkline-metric__header' },
                React.createElement('div', { className: 'sparkline-metric__title' }, title || ''),
                valueLabel ? React.createElement('div', { className: 'sparkline-metric__value' }, valueLabel) : null
            ),
            subtitle ? React.createElement('div', { className: 'sparkline-metric__subtitle' }, subtitle) : null,
            renderMiniSparkline({
                React,
                values,
                targets,
                className: 'sparkline-metric__chart'
            })
        );
    }

    HEYS.SparklinesShared = {
        getWeekDates,
        formatDateRange,
        buildSeriesFromRows,
        renderMiniSparkline,
        renderMetricSparkline
    };
})(window);


/* ===== heys_day_core_bundle_v1.js ===== */
// heys_day_core_bundle_v1.js — Day core bundle (utils/hooks/calculations/effects/handlers)
// ⚠️ Manual concat for delivery optimization. Keep order in sync with dependencies.

// === heys_day_utils.js ===
// heys_day_utils.js — Day utilities: date/time, storage, calculations

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    // Создаём namespace для утилит дня
    HEYS.dayUtils = {};

    // === Deleted Products Ignore List v2.0 ===
    // 🆕 v4.8.0: Персистентный список удалённых продуктов с TTL и метаданными
    const DELETED_PRODUCTS_KEY = 'heys_deleted_products_ignore_list';
    const DELETED_PRODUCTS_VERSION = 2;
    const DELETED_PRODUCTS_TTL_DAYS = 90;

    function loadDeletedProductsList() {
        try {
            const stored = localStorage.getItem(DELETED_PRODUCTS_KEY);
            if (!stored) return { entries: {}, version: DELETED_PRODUCTS_VERSION };

            const parsed = JSON.parse(stored);

            // Миграция v1 → v2
            if (Array.isArray(parsed)) {
                const now = Date.now();
                const migrated = { entries: {}, version: DELETED_PRODUCTS_VERSION };
                parsed.forEach(key => {
                    if (key) {
                        migrated.entries[String(key).toLowerCase()] = { name: key, deletedAt: now, _migratedFromV1: true };
                    }
                });
                saveDeletedProductsData(migrated);
                return migrated;
            }

            if (parsed.version === DELETED_PRODUCTS_VERSION && parsed.entries) {
                return parsed;
            }

            return { entries: {}, version: DELETED_PRODUCTS_VERSION };
        } catch (e) {
            console.warn('[HEYS] Ошибка загрузки deleted products list:', e);
            return { entries: {}, version: DELETED_PRODUCTS_VERSION };
        }
    }

    function saveDeletedProductsData(data) {
        try {
            localStorage.setItem(DELETED_PRODUCTS_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('[HEYS] Ошибка сохранения deleted products list:', e);
        }
    }

    let deletedProductsData = loadDeletedProductsList();

    function normalizeDeletedKey(name) {
        return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function cleanupExpiredEntries() {
        const now = Date.now();
        const ttlMs = DELETED_PRODUCTS_TTL_DAYS * 24 * 60 * 60 * 1000;
        let removed = 0;

        for (const [key, entry] of Object.entries(deletedProductsData.entries)) {
            if (entry.deletedAt && (now - entry.deletedAt) > ttlMs) {
                delete deletedProductsData.entries[key];
                removed++;
            }
        }

        if (removed > 0) {
            saveDeletedProductsData(deletedProductsData);
            console.log(`[HEYS] 🧹 Очищено ${removed} устаревших записей из игнор-листа`);
        }
        return removed;
    }

    cleanupExpiredEntries();

    // 🆕 v4.8.0: API для управления игнор-листом удалённых продуктов (v2)
    HEYS.deletedProducts = {
        add(name, id, fingerprint) {
            if (!name) return;
            const key = normalizeDeletedKey(name);
            const now = Date.now();

            deletedProductsData.entries[key] = { name, id: id || null, fingerprint: fingerprint || null, deletedAt: now };
            if (id) deletedProductsData.entries[String(id)] = { name, id, fingerprint: fingerprint || null, deletedAt: now, _isIdKey: true };
            if (fingerprint) deletedProductsData.entries[String(fingerprint)] = { name, id: id || null, fingerprint, deletedAt: now, _isFingerprintKey: true };

            saveDeletedProductsData(deletedProductsData);
            console.log(`[HEYS] 🚫 Продукт добавлен в игнор-лист: "${name}"`);
        },
        isDeleted(nameOrId) {
            if (!nameOrId) return false;
            const key = normalizeDeletedKey(nameOrId);
            return !!deletedProductsData.entries[key] || !!deletedProductsData.entries[String(nameOrId)];
        },
        isProductDeleted(product) {
            if (!product) return false;
            if (product.name && this.isDeleted(product.name)) return true;
            if (product.id && this.isDeleted(product.id)) return true;
            if (product.product_id && this.isDeleted(product.product_id)) return true;
            if (product.fingerprint && this.isDeleted(product.fingerprint)) return true;
            return false;
        },
        remove(name, id, fingerprint) {
            if (!name) return;
            const key = normalizeDeletedKey(name);
            delete deletedProductsData.entries[key];
            if (id) delete deletedProductsData.entries[String(id)];
            if (fingerprint) delete deletedProductsData.entries[String(fingerprint)];
            saveDeletedProductsData(deletedProductsData);
            console.info(`[HEYS] ✅ Продукт восстановлен из игнор-листа: "${name}"`);
            // 🪦 FIX v5.0.2: Также очищаем Store tombstone (heys_deleted_ids) при явном восстановлении.
            try {
                const _storeTombstones = window.HEYS?.store?.get?.('heys_deleted_ids') || [];
                if (Array.isArray(_storeTombstones) && _storeTombstones.length > 0) {
                    const normName = (n) => String(n || '').toLowerCase().trim();
                    const nameNorm = normName(name);
                    const before = _storeTombstones.length;
                    const cleaned = _storeTombstones.filter(t => {
                        if (id && t.id === id) return false;
                        if (nameNorm && normName(t.name) === nameNorm) return false;
                        return true;
                    });
                    if (cleaned.length < before) {
                        window.HEYS.store.set('heys_deleted_ids', cleaned);
                        console.info(`[HEYS] 🪦 Store tombstone очищен при восстановлении: "${name}" (${before}→${cleaned.length})`);
                    }
                }
            } catch (e) {
                console.warn('[HEYS] ⚠️ Ошибка очистки Store tombstone:', e?.message);
            }
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('heys:deleted-products-changed', { detail: { action: 'remove', name, id, fingerprint } }));
            }
        },
        getAll() {
            const unique = new Map();
            for (const [key, entry] of Object.entries(deletedProductsData.entries)) {
                if (entry._isIdKey || entry._isFingerprintKey) continue;
                unique.set(normalizeDeletedKey(entry.name), entry);
            }
            return Array.from(unique.values());
        },
        getEntry(nameOrId) {
            if (!nameOrId) return null;
            const key = normalizeDeletedKey(nameOrId);
            return deletedProductsData.entries[key] || deletedProductsData.entries[String(nameOrId)] || null;
        },
        count() { return this.getAll().length; },
        clear() {
            const count = this.count();
            deletedProductsData = { entries: {}, version: DELETED_PRODUCTS_VERSION };
            saveDeletedProductsData(deletedProductsData);
            console.info(`[HEYS] Игнор-лист удалённых продуктов очищен (было ${count})`);
            // 🪦 FIX v5.0.2: При полной очистке тоже сбрасываем Store tombstones
            try {
                if (window.HEYS?.store?.set) {
                    window.HEYS.store.set('heys_deleted_ids', []);
                    console.info('[HEYS] 🪦 Store tombstones (heys_deleted_ids) полностью очищены');
                }
            } catch (e) {
                console.warn('[HEYS] ⚠️ Ошибка очистки heys_deleted_ids:', e?.message);
            }
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('heys:deleted-products-changed', { detail: { action: 'clear', count } }));
            }
        },
        cleanup() { return cleanupExpiredEntries(); },
        log() {
            const all = this.getAll();
            if (all.length === 0) {
                console.log('✅ Игнор-лист удалённых продуктов пуст');
                return;
            }
            console.log(`🚫 Игнор-лист удалённых продуктов (${all.length}):`);
            const now = Date.now();
            all.forEach((entry, i) => {
                const daysAgo = Math.floor((now - entry.deletedAt) / (24 * 60 * 60 * 1000));
                console.log(`  ${i + 1}. "${entry.name}" — удалён ${daysAgo}д назад`);
            });
        },
        exportForSync() {
            return { entries: deletedProductsData.entries, version: DELETED_PRODUCTS_VERSION, exportedAt: Date.now() };
        },
        importFromSync(cloudData) {
            if (!cloudData || !cloudData.entries) return 0;
            let imported = 0;
            for (const [key, entry] of Object.entries(cloudData.entries)) {
                const local = deletedProductsData.entries[key];
                if (!local || (entry.deletedAt > (local.deletedAt || 0))) {
                    deletedProductsData.entries[key] = entry;
                    imported++;
                }
            }
            if (imported > 0) {
                saveDeletedProductsData(deletedProductsData);
                console.log(`[HEYS] ☁️ Импортировано ${imported} записей игнор-листа из облака`);
            }
            return imported;
        },
        TTL_DAYS: DELETED_PRODUCTS_TTL_DAYS,
        VERSION: DELETED_PRODUCTS_VERSION
    };

    // === Orphan Products Tracking ===
    // Отслеживание продуктов, для которых данные берутся из штампа вместо базы
    const orphanProductsMap = new Map(); // name => { name, usedInDays: Set, firstSeen }
    const orphanLoggedRecently = new Map(); // name => timestamp (throttle логов)
    const shouldLogRecovery = () => {
        // 🔇 v4.8.2: Recovery логи только при явном HEYS.debug.recovery = true
        return !!(HEYS && HEYS.debug && HEYS.debug.recovery);
    };
    const logRecovery = (level, ...args) => {
        if (!shouldLogRecovery()) return;
        const fn = console[level] || console.log;
        fn(...args);
    };

    function copySnapshotFields(item, target) {
        if (!item || !target) return target;

        const numericFields = [
            'kcal100', 'protein100', 'carbs100', 'fat100',
            'simple100', 'complex100', 'badFat100', 'goodFat100', 'trans100',
            'fiber100', 'sodium100',
            'omega3_100', 'omega6_100', 'nutrient_density',
            'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
            'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
            'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine'
        ];

        numericFields.forEach((field) => {
            if (target[field] == null && item[field] != null) {
                target[field] = item[field];
            }
        });

        const itemNova = item.nova_group ?? item.novaGroup;
        if (target.nova_group == null && itemNova != null) {
            target.nova_group = itemNova;
        }
        if (target.novaGroup == null && target.nova_group != null) {
            target.novaGroup = target.nova_group;
        }

        if (target.additives == null && Array.isArray(item.additives) && item.additives.length) {
            target.additives = item.additives;
        }

        const boolFields = ['is_organic', 'is_whole_grain', 'is_fermented', 'is_raw'];
        boolFields.forEach((field) => {
            if (target[field] == null && item[field] != null) {
                target[field] = item[field];
            }
        });

        return target;
    }

    function enrichProductMaybe(product) {
        if (!product) return product;
        const normalized = global.HEYS?.models?.normalizeProductFields
            ? global.HEYS.models.normalizeProductFields(product)
            : product;

        if (global.HEYS?.Harm?.enrichProduct) {
            try {
                return global.HEYS.Harm.enrichProduct(normalized) || normalized;
            } catch {
                return normalized;
            }
        }

        return normalized;
    }

    function trackOrphanProduct(item, dateStr) {
        if (!item || !item.name) return;
        const name = String(item.name).trim();
        if (!name) return;

        if (!orphanProductsMap.has(name)) {
            orphanProductsMap.set(name, {
                name: name,
                // v4.8.0: Store product_id for better matching after rename
                product_id: item.product_id ?? item.productId ?? null,
                usedInDays: new Set([dateStr]),
                firstSeen: Date.now(),
                hasInlineData: item.kcal100 != null
            });
            // 🔇 v4.7.0: Тихий режим — orphan логи отключены (см. HEYS.orphanProducts.list())
        } else {
            const orphanData = orphanProductsMap.get(name);
            orphanData.usedInDays.add(dateStr);
            // v4.8.0: Update product_id if not set
            if (!orphanData.product_id && (item.product_id ?? item.productId)) {
                orphanData.product_id = item.product_id ?? item.productId;
            }
        }
    }

    // API для просмотра orphan-продуктов
    HEYS.orphanProducts = {
        // Получить список всех orphan-продуктов
        getAll() {
            return Array.from(orphanProductsMap.values()).map(o => ({
                ...o,
                usedInDays: Array.from(o.usedInDays),
                daysCount: o.usedInDays.size
            }));
        },

        // Количество orphan-продуктов
        count() {
            return orphanProductsMap.size;
        },

        // Есть ли orphan-продукты?
        hasAny() {
            return orphanProductsMap.size > 0;
        },

        // Очистить (после синхронизации или исправления)
        clear() {
            orphanProductsMap.clear();
        },

        // Удалить конкретный по имени (если продукт добавили обратно в базу)
        remove(productName) {
            const name = String(productName || '').trim();
            if (name) {
                orphanProductsMap.delete(name);
                // Также пробуем lowercase
                orphanProductsMap.delete(name.toLowerCase());
            }
        },

        // Пересчитать orphan-продукты на основе актуальной базы
        // Вызывается после добавления продукта или удаления item из meal
        // v4.8.0: Теперь проверяет и по product_id, не только по name
        recalculate() {
            if (!global.HEYS?.products?.getAll) return;

            const products = global.HEYS.products.getAll();
            // Index by name (lowercase)
            const productNames = new Set(
                products.map(p => String(p.name || '').trim().toLowerCase()).filter(Boolean)
            );
            // Index by id
            const productIds = new Set(
                products.map(p => String(p.id ?? p.product_id ?? '').toLowerCase()).filter(Boolean)
            );

            const beforeCount = orphanProductsMap.size;

            // Удаляем из orphan те, что теперь есть в базе (по name ИЛИ по id)
            for (const [name, orphanData] of orphanProductsMap) {
                const nameLower = name.toLowerCase();
                const hasName = productNames.has(nameLower);
                // v4.8.0: Также проверяем product_id если он сохранён в orphan data
                const pid = orphanData.product_id ? String(orphanData.product_id).toLowerCase() : '';
                const hasId = pid && productIds.has(pid);

                if (hasName || hasId) {
                    orphanProductsMap.delete(name);
                }
            }

            const afterCount = orphanProductsMap.size;

            // Если количество изменилось — диспатчим событие для обновления UI
            if (beforeCount !== afterCount && typeof global.dispatchEvent === 'function') {
                global.dispatchEvent(new CustomEvent('heys:orphan-updated', {
                    detail: { count: afterCount, removed: beforeCount - afterCount }
                }));
            }
        },

        // Показать в консоли красивую таблицу
        log() {
            const all = this.getAll();
            if (all.length === 0) {
                console.log('✅ Нет orphan-продуктов — все данные берутся из базы');
                return;
            }
            console.warn(`⚠️ Найдено ${all.length} orphan-продуктов (данные из штампа):`);
            console.table(all.map(o => ({
                Название: o.name,
                'Дней использования': o.daysCount,
                'Есть данные': o.hasInlineData ? '✓' : '✗'
            })));
        },

        // Восстановить orphan-продукты в базу из штампов в днях
        async restore() {
            const U = HEYS.utils || {};
            const lsGet = HEYS.store?.get
                ? (k, d) => HEYS.store.get(k, d)
                : (U.lsGet || ((k, d) => {
                    try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
                }));
            const lsSet = HEYS.store?.set
                ? (k, v) => HEYS.store.set(k, v)
                : (U.lsSet || ((k, v) => localStorage.setItem(k, JSON.stringify(v))));
            const parseStoredValue = (raw) => {
                if (!raw) return null;
                if (typeof raw === 'object') return raw;
                if (typeof raw !== 'string') return null;
                if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) {
                    return HEYS.store.decompress(raw);
                }
                try { return JSON.parse(raw); } catch { return null; }
            };

            // Получаем текущие продукты (ключ = name LOWERCASE для консистентности с getDayData)
            const products = lsGet('heys_products', []);
            const productsMap = new Map();
            const productsById = new Map(); // Для восстановления по id
            products.forEach(p => {
                if (p && p.name) {
                    const name = String(p.name).trim().toLowerCase();
                    if (name) productsMap.set(name, p);
                    if (p.id) productsById.set(String(p.id), p);
                }
            });

            // Собираем orphan-продукты из всех дней
            // Ключи могут быть: heys_dayv2_YYYY-MM-DD (legacy) или heys_<clientId>_dayv2_YYYY-MM-DD
            const restored = [];
            const keys = Object.keys(localStorage).filter(k => k.includes('_dayv2_'));

            // 🔇 v4.7.0: Debug логи отключены
            const orphanNames = Array.from(orphanProductsMap.keys());

            let checkedItems = 0;
            let foundWithData = 0;
            let alreadyInBase = 0;

            for (const key of keys) {
                try {
                    const storedDay = HEYS.store?.get ? HEYS.store.get(key, null) : null;
                    const day = parseStoredValue(storedDay ?? localStorage.getItem(key));
                    if (!day || !day.meals) continue;

                    for (const meal of day.meals) {
                        for (const item of (meal.items || [])) {
                            checkedItems++;
                            const itemName = String(item.name || '').trim();
                            const itemNameLower = itemName.toLowerCase();
                            if (!itemName) continue;

                            const hasData = item.kcal100 != null;
                            const inBase = productsMap.has(itemNameLower) || (item.product_id && productsById.has(String(item.product_id)));

                            if (hasData) foundWithData++;
                            if (inBase) alreadyInBase++;

                            // 🔇 v4.7.0: Debug логи отключены

                            // Если продукта нет в базе по имени И есть inline данные
                            if (itemName && !inBase && hasData) {
                                const restoredProduct = {
                                    id: item.product_id || ('restored_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
                                    name: itemName, // Сохраняем оригинальное имя
                                    kcal100: item.kcal100,
                                    protein100: item.protein100 || 0,
                                    fat100: item.fat100 || 0,
                                    carbs100: item.carbs100 || 0,
                                    simple100: item.simple100 || 0,
                                    complex100: item.complex100 || 0,
                                    badFat100: item.badFat100 || 0,
                                    goodFat100: item.goodFat100 || 0,
                                    trans100: item.trans100 || 0,
                                    fiber100: item.fiber100 || 0,
                                    gi: item.gi || 50,
                                    harm: item.harm ?? item.harmScore ?? 0,
                                    restoredAt: Date.now(),
                                    restoredFrom: 'orphan_stamp'
                                };
                                copySnapshotFields(item, restoredProduct);
                                const enriched = enrichProductMaybe(restoredProduct);
                                productsMap.set(itemNameLower, enriched);
                                restored.push(enriched);
                                // 🔇 v4.7.0: Логи восстановления отключены
                            }
                        }
                    }
                } catch (e) {
                    // Пропускаем битые записи
                }
            }

            // 🔇 v4.7.0: Stats лог отключён (см. return.stats)

            if (restored.length > 0) {
                // 🔒 SAFETY: НИКОГДА не перезаписывать если products пустой — это означает corrupted state
                if (products.length === 0) {
                    console.error('[HEYS] ❌ RESTORE BLOCKED: localStorage products пустой! Это признак corruption.');
                    console.error('[HEYS] Для восстановления запусти: await HEYS.YandexAPI.rest("shared_products").then(r => { HEYS.store.set("heys_products", r.data || r); location.reload(); })');
                    return { success: false, count: 0, products: [], error: 'BLOCKED_EMPTY_BASE' };
                }

                // 🔒 SAFETY: Проверяем что НЕ уменьшаем количество продуктов
                const newProducts = Array.from(productsMap.values());
                if (newProducts.length < products.length * 0.5) {
                    console.error(`[HEYS] ❌ RESTORE BLOCKED: Новое кол-во (${newProducts.length}) меньше 50% от текущего (${products.length})`);
                    return { success: false, count: 0, products: [], error: 'BLOCKED_DATA_LOSS' };
                }

                // 🔍 DEBUG: Лог перед сохранением
                console.log('[HEYS] 🔍 RESTORE DEBUG:', {
                    restoredCount: restored.length,
                    newProductsCount: newProducts.length,
                    previousCount: products.length,
                    hasSetAll: !!HEYS.products?.setAll,
                    hasStore: !!HEYS.store?.set,
                    restoredSample: restored.slice(0, 3).map(p => ({ id: p.id, name: p.name }))
                });

                // Используем HEYS.products.setAll для синхронизации с облаком и React state
                if (HEYS.products?.setAll) {
                    console.log('[HEYS] 🔍 Calling HEYS.products.setAll with', newProducts.length, 'products');
                    HEYS.products.setAll(newProducts, { source: 'button-restore-orphans' });

                    // 🔍 DEBUG: Проверяем что сохранилось
                    setTimeout(() => {
                        const afterSave = HEYS.products.getAll();
                        const restoredStillThere = restored.every(rp =>
                            afterSave.some(p => p.id === rp.id || p.name?.toLowerCase() === rp.name?.toLowerCase())
                        );
                        console.log('[HEYS] 🔍 POST-SAVE CHECK:', {
                            savedCount: afterSave.length,
                            restoredStillPresent: restoredStillThere,
                            missingRestored: restoredStillThere ? 0 : restored.filter(rp =>
                                !afterSave.some(p => p.id === rp.id || p.name?.toLowerCase() === rp.name?.toLowerCase())
                            ).map(p => p.name)
                        });
                    }, 500);
                } else {
                    lsSet('heys_products', newProducts);
                    console.warn('[HEYS] ⚠️ Products saved via lsSet only (no cloud sync)');
                }

                if (HEYS.cloud?.flushPendingQueue) {
                    try {
                        await HEYS.cloud.flushPendingQueue(3000);
                    } catch (e) { }
                }

                // Очищаем orphan-трекинг
                this.clear();

                // Обновляем индекс продуктов если есть
                if (HEYS.products?.buildSearchIndex) {
                    HEYS.products.buildSearchIndex();
                }

                // Уведомляем UI об обновлении продуктов
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('heysProductsUpdated', {
                        detail: { products: newProducts, restored: restored.length }
                    }));
                }

                console.log(`✅ Восстановлено ${restored.length} продуктов в базу`);
                return { success: true, count: restored.length, products: restored };
            }

            console.log('ℹ️ Нечего восстанавливать — нет данных в штампах');
            return { success: false, count: 0, products: [] };
        },

        /**
         * 🔄 autoRecoverOnLoad — Автоматическая проверка и восстановление orphan-продуктов при загрузке
         * Вызывается после загрузки продуктов (sync или localStorage)
         * 
         * Логика:
         * 1. Сканирует все дни (heys_dayv2_*)
         * 2. Для каждого продукта в приёмах пищи проверяет наличие в локальной базе
         * 3. Если не найден — пытается восстановить:
         *    a) Из штампа (kcal100, protein100, etc. в meal item) — приоритет
         *    b) Из shared_products через HEYS.YandexAPI.rpc — fallback
         * 4. Добавляет восстановленные продукты в локальную базу
         * 
         * @param {Object} options - Опции
         * @param {boolean} options.verbose - Подробный лог (default: false)
         * @param {boolean} options.tryShared - Пытаться восстановить из shared_products (default: true)
         * @returns {Promise<{recovered: number, fromStamp: number, fromShared: number, missing: string[]}>}
         */
        async autoRecoverOnLoad(options = {}) {
            const { verbose = false, tryShared = true } = options;
            const U = HEYS.utils || {};
            const lsGet = HEYS.store?.get
                ? (k, d) => HEYS.store.get(k, d)
                : (U.lsGet || ((k, d) => {
                    try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
                }));
            const parseStoredValue = (raw) => {
                if (!raw) return null;
                if (typeof raw === 'object') return raw;
                if (typeof raw !== 'string') return null;
                if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) {
                    return HEYS.store.decompress(raw);
                }
                try { return JSON.parse(raw); } catch { return null; }
            };

            const startTime = Date.now();
            logRecovery('log', '[RECOVERY] 🔄 autoRecoverOnLoad START', { verbose, tryShared });

            // 1. Собираем текущие продукты в Map по id и по name (lowercase)
            // 🔧 FIX: Используем HEYS.products.getAll() который читает правильный scoped ключ
            const products = (HEYS.products?.getAll?.() || lsGet('heys_products', []));
            const productsById = new Map();
            const productsByName = new Map();
            const productsByFingerprint = new Map();
            const normalizeName = HEYS.models?.normalizeProductName || ((n) => String(n || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));
            products.forEach(p => {
                if (p && p.id) productsById.set(String(p.id), p);
                if (p && p.name) productsByName.set(normalizeName(p.name), p);
                if (p && p.fingerprint) productsByFingerprint.set(p.fingerprint, p);
            });

            logRecovery('log', `[RECOVERY] 📦 Локальная база: ${products.length} продуктов (byId: ${productsById.size}, byName: ${productsByName.size}, byFP: ${productsByFingerprint.size})`);

            // 2. Собираем все уникальные продукты из всех дней
            const keys = Object.keys(localStorage).filter(k => k.includes('_dayv2_'));
            const missingProducts = new Map(); // product_id or name => { item, dateStr, hasStamp }

            for (const key of keys) {
                try {
                    const storedDay = HEYS.store?.get ? HEYS.store.get(key, null) : null;
                    const day = parseStoredValue(storedDay ?? localStorage.getItem(key));
                    if (!day || !day.meals) continue;
                    const dateStr = key.split('_dayv2_').pop();

                    for (const meal of day.meals) {
                        for (const item of (meal.items || [])) {
                            const productId = item.product_id ? String(item.product_id) : null;
                            const itemName = String(item.name || '').trim();
                            const itemNameNorm = normalizeName(itemName);
                            const itemFingerprint = item.fingerprint || null;

                            // Проверяем есть ли в базе
                            const foundById = productId && productsById.has(productId);
                            const foundByFingerprint = itemFingerprint && productsByFingerprint.has(itemFingerprint);
                            const foundByName = itemNameNorm && productsByName.has(itemNameNorm);

                            if (!foundById && !foundByFingerprint && !foundByName && itemName) {
                                const key = itemFingerprint || productId || itemNameNorm;
                                if (!missingProducts.has(key)) {
                                    const stampData = item.kcal100 != null ? {
                                        kcal100: item.kcal100,
                                        protein100: item.protein100 || 0,
                                        fat100: item.fat100 || 0,
                                        carbs100: item.carbs100 || 0,
                                        simple100: item.simple100 || 0,
                                        complex100: item.complex100 || 0,
                                        badFat100: item.badFat100 || 0,
                                        goodFat100: item.goodFat100 || 0,
                                        trans100: item.trans100 || 0,
                                        fiber100: item.fiber100 || 0,
                                        gi: item.gi,
                                        harm: item.harm ?? item.harmScore
                                    } : null;

                                    if (stampData) {
                                        copySnapshotFields(item, stampData);
                                    }

                                    missingProducts.set(key, {
                                        productId,
                                        name: itemName,
                                        fingerprint: itemFingerprint,
                                        hasStamp: item.kcal100 != null,
                                        stampData: stampData,
                                        firstSeenDate: dateStr
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {
                    // Пропускаем битые записи
                }
            }

            if (missingProducts.size === 0) {
                logRecovery('log', `[RECOVERY] ✅ Нет orphan-продуктов (проверено ${keys.length} дней)`);
                return { recovered: 0, fromStamp: 0, fromShared: 0, missing: [] };
            }

            logRecovery('warn', `[RECOVERY] ⚠️ Найдено ${missingProducts.size} orphan-продуктов в ${keys.length} днях`);

            // 🔇 v4.7.0: Лог про отсутствующие отключён (см. return.missing));

            // 3. Пытаемся восстановить
            const recovered = [];
            let fromStamp = 0;
            let fromShared = 0;
            let skippedDeleted = 0; // 🆕 v4.8.0: Счётчик пропущенных удалённых
            const stillMissing = [];

            // 🪦 FIX v4.9.1: Строим Set удалённых имён из heys_deleted_ids (Store-based, надёжный)
            // HEYS.deletedProducts — localStorage-based, может потеряться при overflow/cleanup.
            // heys_deleted_ids — Store-based, синхронизирован с облаком, НАДЁЖНЫЙ.
            const _tombstonesRecovery = window.HEYS?.store?.get?.('heys_deleted_ids') || [];
            const _deletedNamesSet = new Set();
            const _deletedIdsSet = new Set();
            if (Array.isArray(_tombstonesRecovery)) {
                const _normTS = (n) => String(n || '').toLowerCase().trim();
                _tombstonesRecovery.forEach(t => {
                    if (t.name) _deletedNamesSet.add(_normTS(t.name));
                    if (t.id) _deletedIdsSet.add(String(t.id));
                });
            }

            // Хелпер: проверка tombstones (оба источника)
            const _isProductTombstoned = (name, productId) => {
                const _normCheck = (n) => String(n || '').toLowerCase().trim();
                if (name && _deletedNamesSet.has(_normCheck(name))) return true;
                if (productId && _deletedIdsSet.has(String(productId))) return true;
                if (HEYS.deletedProducts?.isDeleted?.(name)) return true;
                if (HEYS.deletedProducts?.isDeleted?.(productId)) return true;
                return false;
            };

            // 3a. Восстановление из штампов
            for (const [key, data] of missingProducts) {
                // 🆕 v4.9.1: Проверяем ОБА tombstone-источника (heys_deleted_ids + deletedProducts)
                if (_isProductTombstoned(data.name, data.productId)) {
                    skippedDeleted++;
                    if (verbose) console.log(`[HEYS] ⏭️ Пропускаю удалённый продукт: "${data.name}" (tombstone)`);
                    continue;
                }

                if (data.hasStamp && data.stampData) {
                    const restoredProduct = {
                        id: data.productId || ('restored_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
                        name: data.name,
                        fingerprint: data.fingerprint,
                        ...data.stampData,
                        gi: data.stampData.gi ?? 50,
                        harm: data.stampData.harm ?? 0,
                        _recoveredFrom: 'stamp',
                        _recoveredAt: Date.now()
                    };
                    const enriched = enrichProductMaybe(restoredProduct);
                    recovered.push(enriched);
                    productsById.set(String(enriched.id), enriched);
                    productsByName.set(normalizeName(data.name), enriched);
                    if (data.fingerprint) productsByFingerprint.set(data.fingerprint, enriched);
                    fromStamp++;
                    // 🔇 v4.7.0: Лог восстановления отключён
                } else {
                    stillMissing.push(data);
                }
            }

            // 3b. Пытаемся найти в shared_products (если есть YandexAPI)
            if (tryShared && stillMissing.length > 0 && HEYS.YandexAPI?.rpc) {
                try {
                    // 🔇 v4.7.0: verbose логи отключены

                    const { data: sharedProducts, error } = await HEYS.YandexAPI.rpc('get_shared_products', {});

                    if (!error && Array.isArray(sharedProducts)) {
                        // Создаём индекс shared продуктов по id и name
                        const sharedByFingerprint = new Map();
                        const sharedById = new Map();
                        const sharedByName = new Map();
                        sharedProducts.forEach(p => {
                            if (p && p.fingerprint) sharedByFingerprint.set(p.fingerprint, p);
                            if (p && p.id) sharedById.set(String(p.id), p);
                            if (p && p.name) sharedByName.set(normalizeName(p.name), p);
                        });

                        for (const data of stillMissing) {
                            // 🆕 v4.9.1: Проверяем ОБА tombstone-источника (heys_deleted_ids + deletedProducts)
                            if (_isProductTombstoned(data.name, data.productId)) {
                                skippedDeleted++;
                                if (verbose) console.log(`[HEYS] ⏭️ Пропускаю удалённый продукт (shared): "${data.name}" (tombstone)`);
                                continue;
                            }

                            // Ищем сначала по id, потом по имени
                            let found = null;
                            if (data.fingerprint) found = sharedByFingerprint.get(data.fingerprint);
                            if (!found && data.productId) found = sharedById.get(data.productId);
                            if (!found && data.name) found = sharedByName.get(normalizeName(data.name));

                            if (found) {
                                // Клонируем из shared
                                const cloned = HEYS.products?.addFromShared?.(found);
                                if (cloned) {
                                    cloned._recoveredFrom = 'shared';
                                    cloned._recoveredAt = Date.now();
                                    recovered.push(cloned);
                                    fromShared++;
                                    // 🔇 v4.7.0: Лог отключён
                                }
                            }
                        }
                    }
                } catch (e) {
                    // 🔇 v4.7.0: Только критические ошибки
                }
            }

            // 4. Сохраняем восстановленные продукты (если были восстановлены из штампов)
            logRecovery('log', `[RECOVERY] 📊 Результат: fromStamp=${fromStamp}, fromShared=${fromShared}, stillMissing=${stillMissing.length}`);

            if (fromStamp > 0) {
                // 🔒 SAFETY: Проверяем что products НЕ пустой (признак corruption)
                if (products.length === 0) {
                    console.error('[RECOVERY] ❌ autoRecover BLOCKED: localStorage products пустой! Не сохраняем только orphan-ы.');
                    console.error('[HEYS] Для восстановления запусти: await HEYS.YandexAPI.rest("shared_products").then(r => { HEYS.store.set("heys_products", r.data || r); location.reload(); })');
                    // Но диспатчим событие чтобы UI показал ошибку
                    window.dispatchEvent(new CustomEvent('heys:recovery-blocked', {
                        detail: { reason: 'EMPTY_BASE', recoveredCount: recovered.length }
                    }));
                    // 🐛 FIX v1.1: Было Object.keys(orphans) — orphans не определена, заменено на missingProducts
                    return { success: false, recovered: [], fromStamp: 0, fromShared: 0, stillMissing: Array.from(missingProducts.keys()), error: 'BLOCKED_EMPTY_BASE' };
                }

                const stampRecovered = recovered.filter(p => p._recoveredFrom === 'stamp');
                const newProducts = [...products, ...stampRecovered];

                logRecovery('log', `[RECOVERY] 💾 Сохраняю: было ${products.length}, добавляю ${stampRecovered.length}, итого ${newProducts.length}`);

                if (HEYS.products?.setAll) {
                    logRecovery('log', '[RECOVERY] 🔄 Вызываю HEYS.products.setAll...');
                    HEYS.products.setAll(newProducts, { source: 'orphan-recovery' });

                    // Проверяем сохранение
                    const afterSave = HEYS.products.getAll?.() || [];
                    logRecovery('log', `[RECOVERY] ✅ После setAll: ${afterSave.length} продуктов в базе`);
                } else {
                    logRecovery('warn', '[RECOVERY] ⚠️ HEYS.products.setAll недоступен, использую lsSet');
                    const storeSet = HEYS.store?.set;
                    if (storeSet) {
                        storeSet('heys_products', newProducts);
                    } else if (U.lsSet) {
                        U.lsSet('heys_products', newProducts);
                    } else {
                        localStorage.setItem('heys_products', JSON.stringify(newProducts));
                    }
                }

                // Обновляем индекс
                if (HEYS.products?.buildSearchIndex) {
                    HEYS.products.buildSearchIndex();
                }
            }

            // 5. Очищаем orphan-трекинг для восстановленных
            recovered.forEach(p => this.remove(p.name));

            // Собираем имена тех, кого так и не нашли
            const finalMissing = [];
            for (const data of stillMissing) {
                const wasRecovered = recovered.some(p =>
                    (data.fingerprint && p.fingerprint === data.fingerprint) ||
                    (data.productId && String(p.id) === data.productId) ||
                    normalizeName(p.name) === normalizeName(data.name)
                );
                if (!wasRecovered) {
                    finalMissing.push(data.name);
                    // 🔇 v4.7.0: Лог отключён (см. return.missing)
                }
            }

            // 🔇 v4.7.0: Итоговый лог отключён (данные в return)

            const elapsed = Date.now() - startTime;
            logRecovery('log', `[RECOVERY] 🏁 autoRecoverOnLoad END: recovered=${recovered.length}, skippedDeleted=${skippedDeleted}, elapsed=${elapsed}ms`);

            // 🆕 v4.8.0: Лог пропущенных удалённых
            if (skippedDeleted > 0 && verbose) {
                console.log(`[HEYS] 🚫 Пропущено ${skippedDeleted} удалённых продуктов (в игнор-листе)`);
            }

            // Диспатчим событие для UI
            if (recovered.length > 0 && typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('heys:orphans-recovered', {
                    detail: { recovered: recovered.length, fromStamp, fromShared, missing: finalMissing }
                }));
            }

            return { recovered: recovered.length, fromStamp, fromShared, missing: finalMissing };
        }
    };

    // === Haptic Feedback ===
    // Track if user has interacted (required for vibrate API)
    let userHasInteracted = false;
    if (typeof window !== 'undefined') {
        const markInteracted = () => { userHasInteracted = true; };
        window.addEventListener('click', markInteracted, { once: true, passive: true });
        window.addEventListener('touchstart', markInteracted, { once: true, passive: true });
        window.addEventListener('keydown', markInteracted, { once: true, passive: true });
    }

    function hapticFn(type = 'light') {
        if (!navigator.vibrate || !userHasInteracted) return;
        try {
            switch (type) {
                case 'light': navigator.vibrate(10); break;
                case 'medium': navigator.vibrate(20); break;
                case 'heavy': navigator.vibrate(30); break;
                case 'success': navigator.vibrate([10, 50, 20]); break;
                case 'warning': navigator.vibrate([30, 30, 30]); break;
                case 'error': navigator.vibrate([50, 30, 50, 30, 50]); break;
                case 'tick': navigator.vibrate(5); break;
                default: navigator.vibrate(10);
            }
        } catch (e) { /* ignore vibrate errors */ }
    }

    // Двойной API: функция + объект с методами для удобства
    // HEYS.haptic('medium') ИЛИ HEYS.haptic.medium()
    const hapticObj = Object.assign(
        (type) => hapticFn(type),
        {
            light: () => hapticFn('light'),
            medium: () => hapticFn('medium'),
            heavy: () => hapticFn('heavy'),
            success: () => hapticFn('success'),
            warning: () => hapticFn('warning'),
            error: () => hapticFn('error'),
            tick: () => hapticFn('tick')
        }
    );

    HEYS.haptic = hapticObj;

    // === Date/Time Utilities ===
    function pad2(n) { return String(n).padStart(2, '0'); }

    // Ночной порог: до 03:00 считается "вчера" (день ещё не закончился)
    const NIGHT_HOUR_THRESHOLD = 3; // 00:00 - 02:59 → ещё предыдущий день

    // "Эффективная" сегодняшняя дата — до 3:00 возвращает вчера
    function todayISO() {
        const d = new Date();
        const hour = d.getHours();
        // До 3:00 — это ещё "вчера" (день не закончился)
        if (hour < NIGHT_HOUR_THRESHOLD) {
            d.setDate(d.getDate() - 1);
        }
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    }

    function fmtDate(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
    function parseISO(s) { const [y, m, d] = String(s || '').split('-').map(x => parseInt(x, 10)); if (!y || !m || !d) return new Date(); const dt = new Date(y, m - 1, d); dt.setHours(12); return dt; }
    function uid(p) { return (p || 'id') + Math.random().toString(36).slice(2, 8); }

    // Проверка: время относится к "ночным" часам (00:00-02:59)
    function isNightTime(timeStr) {
        if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return false;
        const [hh] = timeStr.split(':').map(x => parseInt(x, 10));
        if (isNaN(hh)) return false;
        return hh >= 0 && hh < NIGHT_HOUR_THRESHOLD;
    }

    // Возвращает "эффективную" дату для приёма пищи
    // Если время 00:00-02:59, возвращает предыдущий день
    function getEffectiveDate(timeStr, calendarDateISO) {
        if (!calendarDateISO) return calendarDateISO;
        if (!isNightTime(timeStr)) return calendarDateISO;
        // Вычитаем 1 день
        const d = parseISO(calendarDateISO);
        d.setDate(d.getDate() - 1);
        return fmtDate(d);
    }

    // Возвращает "следующий" календарный день
    function getNextDay(dateISO) {
        const d = parseISO(dateISO);
        d.setDate(d.getDate() + 1);
        return fmtDate(d);
    }

    // === Storage Utilities ===
    // ВАЖНО: Store-first (HEYS.store), затем HEYS.utils, затем localStorage
    function lsGet(k, d) {
        try {
            // Приоритет: HEYS.store → HEYS.utils → localStorage fallback
            if (HEYS.store && typeof HEYS.store.get === 'function') {
                return HEYS.store.get(k, d);
            }
            if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
                return HEYS.utils.lsGet(k, d);
            }
            const v = JSON.parse(localStorage.getItem(k));
            return v == null ? d : v;
        } catch (e) { return d; }
    }

    function lsSet(k, v) {
        try {
            // Приоритет: HEYS.store → HEYS.utils → localStorage fallback
            if (HEYS.store && typeof HEYS.store.set === 'function') {
                return HEYS.store.set(k, v);
            }
            if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
                return HEYS.utils.lsSet(k, v);
            }
            localStorage.setItem(k, JSON.stringify(v));
        } catch (e) { }
    }

    // === Math Utilities ===
    function clamp(n, a, b) { n = +n || 0; if (n < a) return a; if (n > b) return b; return n; }
    const r1 = v => Math.round((+v || 0) * 10) / 10; // округление до 1 десятой (для веса)
    const r0 = v => Math.round(+v || 0); // округление до целого (для калорий)
    const scale = (v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10;

    // === Model Helpers (delegates to HEYS.models) ===
    function ensureDay(d, prof) {
        const M = HEYS.models || {};
        return (M.ensureDay ? M.ensureDay(d, prof) : (d || {}));
    }

    function buildProductIndex(ps) {
        const M = HEYS.models || {};
        return M.buildProductIndex ? M.buildProductIndex(ps) : { byId: new Map(), byName: new Map(), byFingerprint: new Map() }; // 🆕 v4.6.0
    }

    function getProductFromItem(it, idx) {
        const M = HEYS.models || {};
        return M.getProductFromItem ? M.getProductFromItem(it, idx) : null;
    }

    function per100(p) {
        const M = HEYS.models || {};
        if (!p) return { kcal100: 0, carbs100: 0, prot100: 0, fat100: 0, simple100: 0, complex100: 0, bad100: 0, good100: 0, trans100: 0, fiber100: 0 };
        if (M.computeDerivedProduct) {
            const d = M.computeDerivedProduct(p);
            return { kcal100: d.kcal100, carbs100: d.carbs100, prot100: +p.protein100 || 0, fat100: d.fat100, simple100: +p.simple100 || 0, complex100: +p.complex100 || 0, bad100: +p.badFat100 || 0, good100: +p.goodFat100 || 0, trans100: +p.trans100 || 0, fiber100: +p.fiber100 || 0 };
        }
        const s = +p.simple100 || 0, c = +p.complex100 || 0, pr = +p.protein100 || 0, b = +p.badFat100 || 0, g = +p.goodFat100 || 0, t = +p.trans100 || 0, fib = +p.fiber100 || 0;
        const carbs = +p.carbs100 || (s + c);
        const fat = +p.fat100 || (b + g + t);
        const kcal = +p.kcal100 || (4 * (pr + carbs) + 8 * fat);
        return { kcal100: kcal, carbs100: carbs, prot100: pr, fat100: fat, simple100: s, complex100: c, bad100: b, good100: g, trans100: t, fiber100: fib };
    }

    // === Data Loading ===

    // Базовая загрузка приёмов из storage (store-first) (без ночной логики)
    function loadMealsRaw(ds) {
        const keys = ['heys_dayv2_' + ds, 'heys_day_' + ds, 'day_' + ds + '_meals', 'meals_' + ds, 'food_' + ds];
        const debugEnabled = !!(global.HEYS?.DEBUG_MODE || global.HEYS?.debug?.dayLoad);
        const debugLog = debugEnabled ? (...args) => console.log(...args) : null;
        const summarizeObjectArrays = (obj) => {
            if (!obj || typeof obj !== 'object') return null;
            const keys = Object.keys(obj);
            const arrays = keys
                .filter((key) => Array.isArray(obj[key]))
                .map((key) => ({ key, count: obj[key].length }))
                .filter((entry) => entry.count > 0);
            return { keys, arrays };
        };
        for (const k of keys) {
            try {
                const fromStore = (global.HEYS?.store?.get ? global.HEYS.store.get(k, null) : null);
                const raw = fromStore ?? (global.localStorage ? global.localStorage.getItem(k) : null);
                if (!raw) continue;
                if (debugLog) {
                    debugLog('[MEALS LOAD] candidate', {
                        date: ds,
                        key: k,
                        source: fromStore != null ? 'store' : 'localStorage',
                        rawType: typeof raw
                    });
                }
                if (typeof raw === 'object') {
                    if (raw && Array.isArray(raw.meals) && raw.meals.length > 0) {
                        if (debugLog) debugLog('[MEALS LOAD] hit object.meals', { key: k, count: raw.meals.length });
                        return raw.meals;
                    }
                    if (Array.isArray(raw) && raw.length > 0) {
                        if (debugLog) debugLog('[MEALS LOAD] hit array', { key: k, count: raw.length });
                        return raw;
                    }
                    if (debugLog) {
                        const summary = summarizeObjectArrays(raw);
                        const compact = summary
                            ? {
                                keys: summary.keys.slice(0, 30),
                                arrays: summary.arrays.slice(0, 30)
                            }
                            : null;
                        debugLog('[MEALS LOAD] object without meals', {
                            key: k,
                            summary: compact,
                            summaryStr: compact ? JSON.stringify(compact) : null
                        });
                    }
                }
                if (typeof raw === 'string') {
                    let parsed = null;
                    if (raw.startsWith('¤Z¤') && global.HEYS?.store?.decompress) {
                        parsed = global.HEYS.store.decompress(raw);
                    } else {
                        parsed = JSON.parse(raw);
                    }
                    if (parsed && Array.isArray(parsed.meals) && parsed.meals.length > 0) {
                        if (debugLog) debugLog('[MEALS LOAD] hit parsed.meals', { key: k, count: parsed.meals.length });
                        return parsed.meals;
                    }
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        if (debugLog) debugLog('[MEALS LOAD] hit parsed array', { key: k, count: parsed.length });
                        return parsed;
                    }
                    if (debugLog) {
                        const summary = summarizeObjectArrays(parsed);
                        const compact = summary
                            ? {
                                keys: summary.keys.slice(0, 30),
                                arrays: summary.arrays.slice(0, 30)
                            }
                            : null;
                        debugLog('[MEALS LOAD] parsed without meals', {
                            key: k,
                            summary: compact,
                            summaryStr: compact ? JSON.stringify(compact) : null
                        });
                    }
                }
            } catch (e) { }
        }
        // 🔁 Fallback: искать данные по всем ключам localStorage для этой даты
        // (на случай, если данные лежат под другим clientId)
        try {
            const patterns = [
                `_dayv2_${ds}`,
                `_day_${ds}`,
                `day_${ds}_meals`,
                `meals_${ds}`,
                `food_${ds}`
            ];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || !patterns.some((p) => key.includes(p))) continue;
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                let parsed = null;
                if (typeof raw === 'string') {
                    if (raw.startsWith('¤Z¤') && global.HEYS?.store?.decompress) {
                        parsed = global.HEYS.store.decompress(raw);
                    } else {
                        parsed = JSON.parse(raw);
                    }
                } else if (typeof raw === 'object') {
                    parsed = raw;
                }
                if (parsed && Array.isArray(parsed.meals) && parsed.meals.length > 0) {
                    if (debugLog) debugLog('[MEALS LOAD] cross-key hit meals', { key, count: parsed.meals.length });
                    return parsed.meals;
                }
                if (Array.isArray(parsed) && parsed.length > 0) {
                    if (debugLog) debugLog('[MEALS LOAD] cross-key hit array', { key, count: parsed.length });
                    return parsed;
                }
            }
        } catch (e) { }
        if (debugLog) debugLog('[MEALS LOAD] miss', { date: ds, triedKeys: keys });
        return [];
    }

    // Загрузка приёмов для даты с учётом ночной логики:
    // - Берём приёмы текущего дня (кроме ночных 00:00-02:59)
    // - Добавляем ночные приёмы из следующего календарного дня (они принадлежат этому дню)
    function loadMealsForDate(ds) {
        // 1. Загружаем приёмы текущего календарного дня (фильтруем ночные — они ушли в предыдущий день)
        const currentDayMeals = (loadMealsRaw(ds) || []).filter(m => !isNightTime(m.time));

        // 2. Загружаем ночные приёмы из следующего календарного дня
        const nextDayISO = getNextDay(ds);
        const nextDayMeals = (loadMealsRaw(nextDayISO) || []).filter(m => isNightTime(m.time));

        // 3. Объединяем и сортируем по времени
        const allMeals = [...currentDayMeals, ...nextDayMeals];

        // Сортировка: ночные (00:00-02:59) в конец, остальные по времени
        allMeals.sort((a, b) => {
            const aIsNight = isNightTime(a.time);
            const bIsNight = isNightTime(b.time);
            if (aIsNight && !bIsNight) return 1; // ночные в конец
            if (!aIsNight && bIsNight) return -1;
            // Одинаковый тип — сортируем по времени
            return (a.time || '').localeCompare(b.time || '');
        });

        return allMeals;
    }

    // Lightweight signature for products (ids/names + kcal для инвалидации при синхронизации)
    // FIX: добавлен kcal100 чтобы пересобрать индекс когда продукт обновился с нулей на реальные данные
    function productsSignature(ps) {
        // Ensure ps is an array
        if (!ps) return '';
        if (!Array.isArray(ps)) {
            console.warn('[HEYS] productsSignature: expected array, got', typeof ps);
            return '';
        }
        // Включаем id/name + kcal100 для детектирования обновлений содержимого
        return ps.map(p => {
            if (!p) return '';
            const id = p.id || p.product_id || p.name || '';
            const kcal = p.kcal100 ?? p.kcal ?? 0;
            return `${id}:${kcal}`;
        }).join('|');
    }

    // Cached popular products (per month + signature + TTL)
    const POPULAR_CACHE = {}; // key => {ts, list}

    function computePopularProducts(ps, iso) {
        const sig = productsSignature(ps);
        const monthKey = (iso || todayISO()).slice(0, 7); // YYYY-MM
        // Добавляем favorites в ключ кэша чтобы обновлять при изменении избранных
        const favorites = (window.HEYS && window.HEYS.store && window.HEYS.store.getFavorites)
            ? window.HEYS.store.getFavorites()
            : new Set();
        const favSig = Array.from(favorites).sort().join(',');
        const key = monthKey + '::' + sig + '::' + favSig;
        const now = Date.now();
        const ttl = 1000 * 60 * 10; // 10 минут
        const cached = POPULAR_CACHE[key];
        if (cached && (now - cached.ts) < ttl) return cached.list;
        const idx = buildProductIndex(ps), base = iso ? new Date(iso) : new Date(), cnt = new Map();
        for (let i = 0; i < 30; i++) {
            const d = new Date(base); d.setDate(d.getDate() - i);
            (loadMealsForDate(fmtDate(d)) || []).forEach(m => {
                ((m && m.items) || []).forEach(it => {
                    const p = getProductFromItem(it, idx);
                    if (!p) return;
                    const k = String(p.id ?? p.product_id ?? p.name);
                    cnt.set(k, (cnt.get(k) || 0) + 1);
                });
            });
        }
        const arr = [];
        cnt.forEach((c, k) => {
            let p = idx.byId.get(String(k)) || idx.byName.get(String(k).trim().toLowerCase());
            if (p) arr.push({ p, c });
        });
        // Сортировка: избранные первые, затем по частоте
        arr.sort((a, b) => {
            const aFav = favorites.has(String(a.p.id ?? a.p.product_id ?? a.p.name));
            const bFav = favorites.has(String(b.p.id ?? b.p.product_id ?? b.p.name));
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return b.c - a.c;
        });
        const list = arr.slice(0, 20).map(x => x.p);
        POPULAR_CACHE[key] = { ts: now, list };
        return list;
    }

    // === Profile & Calculations ===
    function getProfile() {
        const p = lsGet('heys_profile', {}) || {};
        const g = (p.gender || p.sex || 'Мужской');
        const sex = (String(g).toLowerCase().startsWith('ж') ? 'female' : 'male');
        return {
            sex,
            height: +p.height || 175,
            age: +p.age || 30,
            sleepHours: +p.sleepHours || 8,
            weight: +p.weight || 70,
            deficitPctTarget: +p.deficitPctTarget || 0,
            stepsGoal: +p.stepsGoal || 7000,
            weightGoal: +p.weightGoal || 0,  // Целевой вес для прогноза
            cycleTrackingEnabled: !!p.cycleTrackingEnabled
        };
    }

    // 🔬 TDEE v1.1.0: Делегируем в единый модуль HEYS.TDEE с fallback для legacy
    function calcBMR(w, prof) {
        // Fallback: Mifflin-St Jeor (всегда должен быть доступен)
        const fallback = () => {
            const h = +prof.height || 175, a = +prof.age || 30, sex = (prof.sex || 'male');
            return Math.round(10 * (+w || 0) + 6.25 * h - 5 * a + (sex === 'female' ? -161 : 5));
        };

        // Делегируем в единый модуль, но НИКОГДА не даём ошибке “убить” UI.
        // В противном случае getActiveDaysForMonth вернёт пустой Map из-за try/catch.
        try {
            if (typeof HEYS !== 'undefined' && HEYS.TDEE && HEYS.TDEE.calcBMR) {
                const v = HEYS.TDEE.calcBMR({ ...prof, weight: w });
                const num = +v;
                if (Number.isFinite(num) && num > 0) return Math.round(num);
            }
        } catch (e) {
            try {
                if (typeof HEYS !== 'undefined' && HEYS.analytics && HEYS.analytics.trackError) {
                    HEYS.analytics.trackError(e, { where: 'day_utils.calcBMR', hasTDEE: !!HEYS.TDEE });
                }
            } catch (_) { }
        }

        return fallback();
    }

    // 🔬 TDEE v1.1.0: Делегируем в единый модуль с fallback
    function kcalPerMin(met, w) {
        try {
            if (typeof HEYS !== 'undefined' && HEYS.TDEE && HEYS.TDEE.kcalPerMin) {
                const v = HEYS.TDEE.kcalPerMin(met, w);
                const num = +v;
                if (Number.isFinite(num)) return num;
            }
        } catch (e) {
            try {
                if (typeof HEYS !== 'undefined' && HEYS.analytics && HEYS.analytics.trackError) {
                    HEYS.analytics.trackError(e, { where: 'day_utils.kcalPerMin', hasTDEE: !!HEYS.TDEE });
                }
            } catch (_) { }
        }
        return Math.round((((+met || 0) * (+w || 0) * 0.0175) - 1) * 10) / 10;
    }

    function stepsKcal(steps, w, sex, len) {
        try {
            if (typeof HEYS !== 'undefined' && HEYS.TDEE && HEYS.TDEE.stepsKcal) {
                const v = HEYS.TDEE.stepsKcal(steps, w, sex, len);
                const num = +v;
                if (Number.isFinite(num)) return num;
            }
        } catch (e) {
            try {
                if (typeof HEYS !== 'undefined' && HEYS.analytics && HEYS.analytics.trackError) {
                    HEYS.analytics.trackError(e, { where: 'day_utils.stepsKcal', hasTDEE: !!HEYS.TDEE });
                }
            } catch (_) { }
        }
        const coef = (sex === 'female' ? 0.5 : 0.57);
        const km = (+steps || 0) * (len || 0.7) / 1000;
        return Math.round(coef * (+w || 0) * km * 10) / 10;
    }

    // === Time/Sleep Utilities ===
    function parseTime(t) {
        if (!t || typeof t !== 'string' || !t.includes(':')) return null;
        const [hh, mm] = t.split(':').map(x => parseInt(x, 10));
        if (isNaN(hh) || isNaN(mm)) return null;
        // НЕ обрезаем часы до 23 — ночные часы могут быть 24-26
        return { hh: Math.max(0, hh), mm: clamp(mm, 0, 59) };
    }

    function sleepHours(a, b) {
        const s = parseTime(a), e = parseTime(b);
        if (!s || !e) return 0;
        let sh = s.hh + s.mm / 60, eh = e.hh + e.mm / 60;
        let d = eh - sh;
        if (d < 0) d += 24;
        return r1(d);
    }

    // === Meal Type Classification ===
    // Типы приёмов пищи с иконками и названиями
    const MEAL_TYPES = {
        breakfast: { name: 'Завтрак', icon: '🍳', order: 1 },
        snack1: { name: 'Перекус', icon: '🍎', order: 2 },
        lunch: { name: 'Обед', icon: '🍲', order: 3 },
        snack2: { name: 'Перекус', icon: '🥜', order: 4 },
        dinner: { name: 'Ужин', icon: '🍽️', order: 5 },
        snack3: { name: 'Перекус', icon: '🧀', order: 6 },
        night: { name: 'Ночной приём', icon: '🌙', order: 7 }
    };

    // Пороги для определения "основного приёма" vs "перекуса"
    const MAIN_MEAL_THRESHOLDS = {
        minProducts: 3,      // минимум продуктов для основного приёма
        minGrams: 200,       // минимум граммов для основного приёма
        minKcal: 300         // минимум калорий для основного приёма
    };

    /**
     * Вычисляет тотал по приёму (граммы, продукты, калории)
     */
    function getMealStats(meal, pIndex) {
        if (!meal || !meal.items || !meal.items.length) {
            return { totalGrams: 0, productCount: 0, totalKcal: 0 };
        }

        let totalGrams = 0;
        let totalKcal = 0;
        const productCount = meal.items.length;

        meal.items.forEach(item => {
            const g = +item.grams || 0;
            totalGrams += g;

            // Пытаемся получить калории
            const p = pIndex ? getProductFromItem(item, pIndex) : null;
            if (p) {
                const per = per100(p);
                totalKcal += (per.kcal100 || 0) * g / 100;
            }
        });

        return { totalGrams, productCount, totalKcal: Math.round(totalKcal) };
    }

    /**
     * Проверяет, является ли приём "основным" (завтрак/обед/ужин) по размеру
     */
    function isMainMeal(mealStats) {
        const { totalGrams, productCount, totalKcal } = mealStats;

        // Основной приём если: много продуктов ИЛИ (много граммов И больше 1 продукта)
        if (productCount >= MAIN_MEAL_THRESHOLDS.minProducts) return true;
        if (totalGrams >= MAIN_MEAL_THRESHOLDS.minGrams && productCount >= 2) return true;
        if (totalKcal >= MAIN_MEAL_THRESHOLDS.minKcal) return true;

        return false;
    }

    /**
     * Преобразует время в минуты от полуночи (с учётом ночных часов)
     * Ночные часы (00:00-02:59) считаются как 24:00-26:59
     */
    function timeToMinutes(timeStr) {
        const parsed = parseTime(timeStr);
        if (!parsed) return null;

        let { hh, mm } = parsed;
        // Ночные часы (00-02) — это "после полуночи" предыдущего дня
        if (hh < NIGHT_HOUR_THRESHOLD) {
            hh += 24;
        }
        return hh * 60 + mm;
    }

    /**
     * Форматирует время приёма для отображения
     * 24:20 → 00:20 (ночные часы хранятся как 24-26)
     */
    function formatMealTime(timeStr) {
        if (!timeStr) return '';
        const parsed = parseTime(timeStr);
        if (!parsed) return timeStr;

        let { hh, mm } = parsed;
        // Нормализуем ночные часы: 24 → 00, 25 → 01, 26 → 02
        if (hh >= 24) {
            hh = hh - 24;
        }
        return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    }

    // === Hours Order для Wheel Picker ===
    // Порядок часов: 03, 04, ..., 23, 00, 01, 02
    // Это позволяет скроллить от вечера к ночи естественно
    const HOURS_ORDER = (() => {
        const order = [];
        for (let h = NIGHT_HOUR_THRESHOLD; h < 24; h++) order.push(h);
        for (let h = 0; h < NIGHT_HOUR_THRESHOLD; h++) order.push(h);
        return order;
    })();

    /**
     * Конвертация: индекс колеса → реальный час
     * @param {number} idx - индекс в HOURS_ORDER
     * @returns {number} реальный час (0-23)
     */
    function wheelIndexToHour(idx) {
        return HOURS_ORDER[idx] ?? idx;
    }

    /**
     * Конвертация: реальный час → индекс колеса
     * Учитывает ночные часы: 24→0, 25→1, 26→2
     * @param {number} hour - реальный час (0-26)
     * @returns {number} индекс в HOURS_ORDER
     */
    function hourToWheelIndex(hour) {
        // Нормализуем ночные часы для поиска в колесе
        const normalizedHour = hour >= 24 ? hour - 24 : hour;
        const idx = HOURS_ORDER.indexOf(normalizedHour);
        return idx >= 0 ? idx : 0;
    }

    /**
     * Определяет тип приёма пищи на основе:
     * - Порядкового номера (первый = завтрак)
     * - Времени (деление дня на слоты)
     * - Размера приёма (основной vs перекус)
     * 
     * @param {number} mealIndex - Индекс приёма в отсортированном списке
     * @param {Object} meal - Объект приёма {id, time, items, ...}
     * @param {Array} allMeals - Все приёмы дня (отсортированы по времени)
     * @param {Object} pIndex - Индекс продуктов для расчёта калорий
     * @returns {Object} { type: string, name: string, icon: string }
     */
    function getMealType(mealIndex, meal, allMeals, pIndex) {
        // Защита от undefined
        if (!allMeals || !Array.isArray(allMeals) || allMeals.length === 0) {
            return { type: 'snack', ...MEAL_TYPES.snack };
        }

        // Первый приём дня всегда Завтрак
        if (mealIndex === 0) {
            return { type: 'breakfast', ...MEAL_TYPES.breakfast };
        }

        // Получаем время первого приёма (завтрака)
        const firstMeal = allMeals[0];
        const breakfastMinutes = timeToMinutes(firstMeal?.time);
        const currentMinutes = timeToMinutes(meal?.time);

        // Если время не указано, определяем по порядку и размеру
        if (breakfastMinutes === null || currentMinutes === null) {
            return fallbackMealType(mealIndex, meal, pIndex);
        }

        // Конец дня = 03:00 следующего дня = 27:00 в нашей системе
        const endOfDayMinutes = 27 * 60; // 03:00 + 24 = 27:00

        // Оставшееся время от завтрака до конца дня
        const remainingMinutes = endOfDayMinutes - breakfastMinutes;

        // Делим на 6 слотов (7 типов минус завтрак = 6)
        const slotDuration = remainingMinutes / 6;

        // Определяем в какой слот попадает текущий приём
        const minutesSinceBreakfast = currentMinutes - breakfastMinutes;
        const slotIndex = Math.floor(minutesSinceBreakfast / slotDuration);

        // Типы слотов: 0=перекус1, 1=обед, 2=перекус2, 3=ужин, 4=перекус3, 5=ночной
        const slotTypes = ['snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'night'];

        // Получаем статистику приёма
        const mealStats = getMealStats(meal, pIndex);
        const isMain = isMainMeal(mealStats);

        // Определяем базовый тип по слоту
        let baseType = slotTypes[clamp(slotIndex, 0, 5)];

        // Корректируем: если попали в "перекус" слот, но это большой приём — 
        // проверяем соседние "основные" слоты
        if (baseType.startsWith('snack') && isMain) {
            // Ищем ближайший основной слот
            if (slotIndex <= 1) {
                baseType = 'lunch';
            } else if (slotIndex >= 2 && slotIndex <= 3) {
                baseType = 'dinner';
            }
            // Если после ужина большой приём — оставляем как есть (поздний ужин → snack3)
        }

        // Обратная корректировка: если попали в "основной" слот, но это маленький приём — 
        // оставляем как основной (обед может быть лёгким)

        // Проверяем не дублируется ли уже этот тип (избегаем 2 обеда)
        const usedTypes = new Set();
        for (let i = 0; i < mealIndex; i++) {
            const prevType = getMealTypeSimple(i, allMeals[i], allMeals, pIndex);
            usedTypes.add(prevType);
        }

        // Если обед уже был, а мы пытаемся назвать это обедом — делаем перекусом
        if (baseType === 'lunch' && usedTypes.has('lunch')) {
            baseType = 'snack2';
        }
        if (baseType === 'dinner' && usedTypes.has('dinner')) {
            baseType = 'snack3';
        }

        return { type: baseType, ...MEAL_TYPES[baseType] };
    }

    /**
     * Упрощённая версия для проверки дубликатов (без рекурсии)
     */
    function getMealTypeSimple(mealIndex, meal, allMeals, pIndex) {
        if (mealIndex === 0) return 'breakfast';

        const firstMeal = allMeals[0];
        const breakfastMinutes = timeToMinutes(firstMeal?.time);
        const currentMinutes = timeToMinutes(meal?.time);

        if (breakfastMinutes === null || currentMinutes === null) {
            return 'snack1';
        }

        const endOfDayMinutes = 27 * 60;
        const remainingMinutes = endOfDayMinutes - breakfastMinutes;
        const slotDuration = remainingMinutes / 6;
        const minutesSinceBreakfast = currentMinutes - breakfastMinutes;
        const slotIndex = Math.floor(minutesSinceBreakfast / slotDuration);

        const slotTypes = ['snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'night'];
        let baseType = slotTypes[clamp(slotIndex, 0, 5)];

        const mealStats = getMealStats(meal, pIndex);
        const isMain = isMainMeal(mealStats);

        if (baseType.startsWith('snack') && isMain) {
            if (slotIndex <= 1) baseType = 'lunch';
            else if (slotIndex >= 2 && slotIndex <= 3) baseType = 'dinner';
        }

        return baseType;
    }

    /**
     * Fallback определение типа (когда нет времени)
     */
    function fallbackMealType(mealIndex, meal, pIndex) {
        const mealStats = getMealStats(meal, pIndex);
        const isMain = isMainMeal(mealStats);

        // По порядку: 0=завтрак, 1=перекус/обед, 2=перекус/ужин, ...
        const fallbackTypes = [
            'breakfast',
            isMain ? 'lunch' : 'snack1',
            isMain ? 'dinner' : 'snack2',
            'snack3',
            'night'
        ];

        const type = fallbackTypes[clamp(mealIndex, 0, fallbackTypes.length - 1)];
        return { type, ...MEAL_TYPES[type] };
    }

    // Форматирование даты для отображения
    // Использует "эффективную" дату (до 3:00 — ещё вчера)
    function formatDateDisplay(isoDate) {
        const d = parseISO(isoDate);
        const effectiveToday = parseISO(todayISO()); // todayISO учитывает ночной порог
        const effectiveYesterday = new Date(effectiveToday);
        effectiveYesterday.setDate(effectiveYesterday.getDate() - 1);

        const isToday = d.toDateString() === effectiveToday.toDateString();
        const isYesterday = d.toDateString() === effectiveYesterday.toDateString();

        const dayName = d.toLocaleDateString('ru-RU', { weekday: 'short' });
        const dayNum = d.getDate();
        const month = d.toLocaleDateString('ru-RU', { month: 'short' });

        if (isToday) return { label: 'Сегодня', sub: `${dayNum} ${month}` };
        if (isYesterday) return { label: 'Вчера', sub: `${dayNum} ${month}` };
        return { label: `${dayNum} ${month}`, sub: dayName };
    }

    /**
     * Предпросмотр типа приёма для модалки создания.
     * Определяет тип по времени и существующим приёмам (без данных о продуктах).
     * @param {string} timeStr - время в формате "HH:MM"
     * @param {Array} existingMeals - массив существующих приёмов дня
     * @returns {string} - ключ типа (breakfast, lunch, dinner, snack1, snack2, snack3, night)
     */
    function getMealTypeForPreview(timeStr, existingMeals) {
        const meals = existingMeals || [];

        // Если нет приёмов — это будет первый, значит завтрак
        if (meals.length === 0) {
            return 'breakfast';
        }

        // Находим первый приём (завтрак)
        const sortedMeals = [...meals].sort((a, b) => {
            const aMin = timeToMinutes(a.time) || 0;
            const bMin = timeToMinutes(b.time) || 0;
            return aMin - bMin;
        });

        const breakfastMinutes = timeToMinutes(sortedMeals[0]?.time);
        const currentMinutes = timeToMinutes(timeStr);

        if (breakfastMinutes === null || currentMinutes === null) {
            return 'snack1'; // fallback
        }

        // Если новый приём раньше первого — он станет завтраком
        if (currentMinutes < breakfastMinutes) {
            return 'breakfast';
        }

        // Конец дня = 03:00 следующего дня = 27:00
        const endOfDayMinutes = 27 * 60;
        const remainingMinutes = endOfDayMinutes - breakfastMinutes;
        const slotDuration = remainingMinutes / 6;

        const minutesSinceBreakfast = currentMinutes - breakfastMinutes;
        const slotIndex = Math.floor(minutesSinceBreakfast / slotDuration);

        const slotTypes = ['snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'night'];
        return slotTypes[clamp(slotIndex, 0, 5)];
    }

    // === Calendar Day Indicators ===

    /**
     * Получает данные дня: калории и активность для расчёта реального target
     * @param {string} dateStr - Дата в формате YYYY-MM-DD
     * @param {Map} productsMap - Map продуктов (id => product)
     * @param {Object} profile - Профиль пользователя
     * @returns {{kcal: number, steps: number, householdMin: number, trainings: Array}} Данные дня
     */
    function getDayData(dateStr, productsMap, profile) {
        try {
            // Пробуем несколько источников clientId (через утилиту для корректного JSON.parse)
            const U = window.HEYS && window.HEYS.utils;
            const storeGet = window.HEYS?.store?.get;
            const clientId = (U && U.getCurrentClientId ? U.getCurrentClientId() : '')
                || (window.HEYS && window.HEYS.currentClientId) || (storeGet ? storeGet('heys_client_current', '') : '')
                || localStorage.getItem('heys_client_current') || '';

            const scopedKey = clientId
                ? 'heys_' + clientId + '_dayv2_' + dateStr
                : 'heys_dayv2_' + dateStr;

            const raw = (global.HEYS?.store?.get ? global.HEYS.store.get(scopedKey, null) : null)
                ?? (global.localStorage ? global.localStorage.getItem(scopedKey) : null);
            if (!raw) return null;

            let dayData = null;
            if (typeof raw === 'object') {
                dayData = raw;
            } else if (typeof raw === 'string') {
                if (raw.startsWith('¤Z¤')) {
                    let str = raw.substring(3);
                    const patterns = {
                        '¤n¤': '"name":"', '¤k¤': '"kcal100"', '¤p¤': '"protein100"',
                        '¤c¤': '"carbs100"', '¤f¤': '"fat100"'
                    };
                    for (const [code, pattern] of Object.entries(patterns)) {
                        str = str.split(code).join(pattern);
                    }
                    dayData = JSON.parse(str);
                } else {
                    dayData = JSON.parse(raw);
                }
            }

            if (!dayData) return null;

            // Считаем калории и макросы из meals
            let totalKcal = 0, totalProt = 0, totalFat = 0, totalCarbs = 0;
            (dayData.meals || []).forEach(meal => {
                (meal.items || []).forEach(item => {
                    const grams = +item.grams || 0;
                    if (grams <= 0) return;

                    // Ищем в productsMap по названию (lowercase), потом fallback на inline данные item
                    const itemName = String(item.name || '').trim();
                    const itemNameLower = itemName.toLowerCase();
                    let product = itemName ? productsMap.get(itemNameLower) : null;

                    // 🔄 Fallback: если не найден в переданном productsMap, проверяем актуальную базу
                    // Это решает проблему когда продукт только что добавлен но props ещё не обновились
                    if (!product && itemName && global.HEYS?.products?.getAll) {
                        const freshProducts = global.HEYS.products.getAll();
                        const freshProduct = freshProducts.find(p =>
                            String(p.name || '').trim().toLowerCase() === itemNameLower
                        );
                        if (freshProduct) {
                            product = freshProduct;
                            // Добавляем в productsMap для следующих итераций (ключ lowercase)
                            productsMap.set(itemNameLower, freshProduct);
                            // Убираем из orphan если был там
                            if (orphanProductsMap.has(itemName)) {
                                orphanProductsMap.delete(itemName);
                            }
                            if (orphanProductsMap.has(itemNameLower)) {
                                orphanProductsMap.delete(itemNameLower);
                            }
                        }
                        // 🔇 v4.7.0: Orphan mismatch логи отключены для чистоты консоли
                    }

                    const src = product || item; // item может иметь inline kcal100, protein100 и т.д.

                    // Трекаем orphan-продукты (когда используется штамп вместо базы)
                    // НЕ трекаем если база продуктов пуста или синхронизация не завершена
                    if (!product && itemName) {
                        // Получаем продукты из всех возможных источников
                        let freshProducts = global.HEYS?.products?.getAll?.() || [];

                        // Fallback: читаем напрямую из localStorage если HEYS.products пуст
                        if (freshProducts.length === 0) {
                            try {
                                // Пробуем разные варианты ключей
                                const U = global.HEYS?.utils;
                                const storeGet = global.HEYS?.store?.get;
                                if (storeGet) {
                                    freshProducts = storeGet('heys_products', []) || [];
                                } else if (U && U.lsGet) {
                                    freshProducts = U.lsGet('heys_products', []) || [];
                                } else {
                                    // Fallback без clientId-aware функции
                                    const clientId = U?.getCurrentClientId?.()
                                        || (storeGet ? storeGet('heys_client_current', '') : '')
                                        || localStorage.getItem('heys_client_current') || '';
                                    const keys = [
                                        clientId ? `heys_${clientId}_products` : null,
                                        'heys_products'
                                    ].filter(Boolean);

                                    for (const key of keys) {
                                        const stored = storeGet ? storeGet(key, null) : localStorage.getItem(key);
                                        if (stored) {
                                            const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
                                            if (Array.isArray(parsed) && parsed.length > 0) {
                                                freshProducts = parsed;
                                                break;
                                            }
                                        }
                                    }
                                }
                            } catch (e) { /* ignore */ }
                        }

                        // 🔧 v3.19.0: Получаем также shared products из кэша
                        const sharedProducts = global.HEYS?.cloud?.getCachedSharedProducts?.() || [];

                        const hasProductsLoaded = productsMap.size > 0 || freshProducts.length > 0 || sharedProducts.length > 0;

                        // Дополнительная проверка: ищем продукт напрямую в свежей базе
                        const foundInFresh = freshProducts.find(p =>
                            String(p.name || '').trim().toLowerCase() === itemNameLower
                        );

                        // 🔧 v3.19.0: Также ищем в shared products
                        const foundInShared = sharedProducts.find(p =>
                            String(p.name || '').trim().toLowerCase() === itemNameLower
                        );

                        // Трекаем только если база загружена И продукт реально не найден в обеих базах
                        if (hasProductsLoaded && !foundInFresh && !foundInShared) {
                            trackOrphanProduct(item, dateStr);
                        }
                    }

                    if (src.kcal100 != null || src.protein100 != null) {
                        const mult = grams / 100;
                        const prot = (+src.protein100 || 0) * mult;
                        const fat = (+src.fat100 || 0) * mult;
                        const carbs = (+src.carbs100 || (+src.simple100 || 0) + (+src.complex100 || 0)) * mult;

                        // 🔄 v3.9.2: Используем TEF-формулу как в mealTotals (белок 3 ккал/г вместо 4)
                        // TEF-aware: protein 3 kcal/g (25% TEF), carbs 4 kcal/g, fat 9 kcal/g
                        const kcalTEF = 3 * prot + 4 * carbs + 9 * fat;
                        totalKcal += kcalTEF;
                        totalProt += prot;
                        totalFat += fat;
                        totalCarbs += carbs;
                    }
                });
            });

            // Вычисляем sleepHours из sleepStart/sleepEnd
            let sleepHours = 0;
            if (dayData.sleepStart && dayData.sleepEnd) {
                const [sh, sm] = dayData.sleepStart.split(':').map(Number);
                const [eh, em] = dayData.sleepEnd.split(':').map(Number);
                let startMin = sh * 60 + sm;
                let endMin = eh * 60 + em;
                if (endMin < startMin) endMin += 24 * 60; // через полночь
                sleepHours = (endMin - startMin) / 60;
            }

            // Считаем общие минуты тренировок
            let trainingMinutes = 0;
            (dayData.trainings || []).forEach(t => {
                if (t && t.z && Array.isArray(t.z)) {
                    trainingMinutes += t.z.reduce((sum, m) => sum + (+m || 0), 0);
                }
            });

            return {
                kcal: Math.round(totalKcal),
                savedEatenKcal: +dayData.savedEatenKcal || 0, // 🆕 Сохранённые калории (приоритет над пересчитанными)
                prot: Math.round(totalProt),
                fat: Math.round(totalFat),
                carbs: Math.round(totalCarbs),
                steps: +dayData.steps || 0,
                waterMl: +dayData.waterMl || 0, // 🆕 Вода для персонализированных инсайтов
                householdMin: +dayData.householdMin || 0,
                trainings: dayData.trainings || [],
                trainingMinutes,
                weightMorning: +dayData.weightMorning || 0,
                deficitPct: dayData.deficitPct, // может быть undefined — тогда из профиля
                sleepHours,
                moodAvg: +dayData.moodAvg || 0,
                dayScore: +dayData.dayScore || 0,
                cycleDay: dayData.cycleDay || null, // День менструального цикла (1-N или null)
                isRefeedDay: dayData.isRefeedDay || false, // Загрузочный день
                refeedReason: dayData.refeedReason || null, // Причина refeed
                // 🔧 FIX: Сохранённая норма с учётом долга — используется для корректного отображения в sparkline
                savedDisplayOptimum: +dayData.savedDisplayOptimum || 0,
                // 🆕 v1.1: Флаги верификации низкокалорийных дней
                isFastingDay: dayData.isFastingDay || false, // Осознанное голодание — данные корректны
                isIncomplete: dayData.isIncomplete || false, // Не заполнен — исключить из статистик
                meals: dayData.meals || [] // 🆕 v1.1: Для определения пустого дня
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Вычисляет калории за день напрямую из localStorage (legacy wrapper)
     */
    function getDayCalories(dateStr, productsMap) {
        const data = getDayData(dateStr, productsMap, {});
        return data ? data.kcal : 0;
    }

    /**
     * Получает Map продуктов для вычисления калорий
     * @returns {Map} productsMap (name => product)
     */
    function getProductsMap() {
        const productsMap = new Map();
        try {
            // Используем HEYS.store.get который знает правильный ключ с clientId
            let products = [];
            if (window.HEYS && window.HEYS.store && typeof window.HEYS.store.get === 'function') {
                products = window.HEYS.store.get('heys_products', []);
            } else {
                // Fallback: пробуем напрямую из localStorage
                const U = window.HEYS?.utils;
                const storeGet = window.HEYS?.store?.get;
                const clientId = U?.getCurrentClientId?.()
                    || (window.HEYS && window.HEYS.currentClientId)
                    || (storeGet ? storeGet('heys_client_current', '') : '')
                    || localStorage.getItem('heys_client_current') || '';
                const productsKey = clientId
                    ? 'heys_' + clientId + '_products'
                    : 'heys_products';
                const productsRaw = storeGet ? storeGet(productsKey, null) : localStorage.getItem(productsKey);

                if (productsRaw) {
                    if (typeof productsRaw === 'string') {
                        if (productsRaw.startsWith('¤Z¤')) {
                            let str = productsRaw.substring(3);
                            const patterns = {
                                '¤n¤': '"name":"', '¤k¤': '"kcal100"', '¤p¤': '"protein100"',
                                '¤c¤': '"carbs100"', '¤f¤': '"fat100"', '¤s¤': '"simple100"',
                                '¤x¤': '"complex100"', '¤b¤': '"badFat100"', '¤g¤': '"goodFat100"',
                                '¤t¤': '"trans100"', '¤i¤': '"fiber100"', '¤G¤': '"gi"', '¤h¤': '"harmScore"'
                            };
                            for (const [code, pattern] of Object.entries(patterns)) {
                                str = str.split(code).join(pattern);
                            }
                            products = JSON.parse(str);
                        } else {
                            products = JSON.parse(productsRaw);
                        }
                    } else {
                        products = productsRaw;
                    }
                }
            }
            // Если products — объект с полем products, извлекаем массив
            if (products && !Array.isArray(products) && Array.isArray(products.products)) {
                products = products.products;
            }
            // Финальная проверка что это массив
            if (!Array.isArray(products)) {
                products = [];
            }
            products.forEach(p => {
                if (p && p.name) {
                    const name = String(p.name).trim();
                    if (name) productsMap.set(name, p);
                }
            });
        } catch (e) {
            // Тихий fallback — productsMap не критичен
        }
        return productsMap;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🚀 LAZY-LOADING DAYS — Оптимизированная загрузка дней
    // ═══════════════════════════════════════════════════════════════════

    // Кэш загруженных дней (для предотвращения повторных чтений)
    const DAYS_CACHE = new Map(); // dateStr => { data, timestamp }
    const DAYS_CACHE_TTL = 5 * 60 * 1000; // 5 минут TTL

    /**
     * Lazy-загрузка дней — загружает только последние N дней
     * Оптимизирует холодный старт приложения
     * 
     * @param {number} daysBack - Сколько дней назад загружать (default: 30)
     * @param {Object} options - Опции
     * @param {boolean} options.forceRefresh - Игнорировать кэш
     * @param {Function} options.onProgress - Callback прогресса (loaded, total)
     * @returns {Map<string, Object>} Map дат с данными дней
     */
    function loadRecentDays(daysBack = 30, options = {}) {
        const { forceRefresh = false, onProgress } = options;
        const result = new Map();
        const now = Date.now();
        const today = new Date();

        for (let i = 0; i < daysBack; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = fmtDate(d);

            // Проверяем кэш
            if (!forceRefresh && DAYS_CACHE.has(dateStr)) {
                const cached = DAYS_CACHE.get(dateStr);
                if (now - cached.timestamp < DAYS_CACHE_TTL) {
                    result.set(dateStr, cached.data);
                    if (onProgress) onProgress(i + 1, daysBack);
                    continue;
                }
            }

            // Загружаем день
            const dayData = lsGet('heys_dayv2_' + dateStr, null);
            if (dayData && typeof dayData === 'object') {
                result.set(dateStr, dayData);
                DAYS_CACHE.set(dateStr, { data: dayData, timestamp: now });
            }

            if (onProgress) onProgress(i + 1, daysBack);
        }

        return result;
    }

    /**
     * Lazy-загрузка одного дня с кэшированием
     * @param {string} dateStr - Дата в формате YYYY-MM-DD
     * @param {boolean} forceRefresh - Игнорировать кэш
     * @returns {Object|null} Данные дня или null
     */
    function loadDay(dateStr, forceRefresh = false) {
        const now = Date.now();

        // Проверяем кэш
        if (!forceRefresh && DAYS_CACHE.has(dateStr)) {
            const cached = DAYS_CACHE.get(dateStr);
            if (now - cached.timestamp < DAYS_CACHE_TTL) {
                return cached.data;
            }
        }

        // Загружаем день
        const dayData = lsGet('heys_dayv2_' + dateStr, null);
        if (dayData && typeof dayData === 'object') {
            DAYS_CACHE.set(dateStr, { data: dayData, timestamp: now });
            return dayData;
        }

        return null;
    }

    /**
     * Инвалидирует кэш дня (вызывать после сохранения)
     * @param {string} dateStr - Дата в формате YYYY-MM-DD
     */
    function invalidateDayCache(dateStr) {
        DAYS_CACHE.delete(dateStr);
    }

    /**
     * Очищает весь кэш дней
     */
    function clearDaysCache() {
        DAYS_CACHE.clear();
    }

    /**
     * Получить статистику кэша
     * @returns {{size: number, hitRate: number}}
     */
    function getDaysCacheStats() {
        let validCount = 0;
        const now = Date.now();

        DAYS_CACHE.forEach((cached) => {
            if (now - cached.timestamp < DAYS_CACHE_TTL) {
                validCount++;
            }
        });

        return {
            size: DAYS_CACHE.size,
            validEntries: validCount,
            expiredEntries: DAYS_CACHE.size - validCount
        };
    }

    /**
     * Предзагрузка дней для месяца (для календаря)
     * Загружает данные асинхронно чтобы не блокировать UI
     * 
     * @param {number} year
     * @param {number} month - 0-11
     * @returns {Promise<Map<string, Object>>}
     */
    async function preloadMonthDays(year, month) {
        return new Promise((resolve) => {
            const result = new Map();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            // Используем requestIdleCallback для фоновой загрузки
            const loadBatch = (startDay, batchSize = 5) => {
                const endDay = Math.min(startDay + batchSize, daysInMonth + 1);

                for (let d = startDay; d < endDay; d++) {
                    const dateStr = fmtDate(new Date(year, month, d));
                    const dayData = loadDay(dateStr);
                    if (dayData) {
                        result.set(dateStr, dayData);
                    }
                }

                if (endDay <= daysInMonth) {
                    // Продолжаем загрузку в следующем idle callback
                    if (typeof requestIdleCallback !== 'undefined') {
                        requestIdleCallback(() => loadBatch(endDay, batchSize));
                    } else {
                        setTimeout(() => loadBatch(endDay, batchSize), 0);
                    }
                } else {
                    // Загрузка завершена
                    resolve(result);
                }
            };

            // Начинаем загрузку
            loadBatch(1);
        });
    }

    /**
     * Вычисляет Set активных дней для месяца
     * Активный день = съедено ≥ 1/3 BMR (реальное ведение дневника)
     * 
     * @param {number} year - Год
     * @param {number} month - Месяц (0-11)
     * @param {Object} profile - Профиль пользователя {weight, height, age, sex, deficitPctTarget}
     * @param {Array} products - Массив продуктов (передаётся из App state)
     * @returns {Map<string, {kcal: number, target: number, ratio: number}>} Map дат с данными
     */
    function getActiveDaysForMonth(year, month, profile, products) {
        const daysData = new Map();

        try {
            // Получаем базовые данные из профиля
            const profileWeight = +(profile && profile.weight) || 70;
            const deficitPct = +(profile && profile.deficitPctTarget) || 0;
            const sex = (profile && profile.sex) || 'male';
            const baseBmr = calcBMR(profileWeight, profile || {});
            const threshold = Math.round(baseBmr / 3); // 1/3 BMR — минимум для "активного" дня

            // Строим Map продуктов из переданного массива (ключ = lowercase name)
            const productsMap = new Map();
            const productsArr = Array.isArray(products) ? products : [];
            productsArr.forEach(p => {
                if (p && p.name) {
                    const name = String(p.name).trim().toLowerCase();
                    if (name) productsMap.set(name, p);
                }
            });

            // Проходим по всем дням месяца
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            // [HEYS.calendar] Диагностика: подсчёт статуса дней
            let _diagNull = 0, _diagFiltered = 0, _diagActive = 0;

            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = fmtDate(new Date(year, month, d));
                const dayInfo = getDayData(dateStr, productsMap, profile);

                // Пропускаем дни без данных. Если есть цикл или хотя бы один приём пищи — показываем даже при низких ккал
                const hasCycleDay = dayInfo && dayInfo.cycleDay != null;
                const hasMeals = !!(dayInfo && Array.isArray(dayInfo.meals) && dayInfo.meals.length > 0);
                if (!dayInfo) { _diagNull++; continue; }
                if (dayInfo.kcal < threshold && !hasCycleDay && !hasMeals) { _diagFiltered++; continue; }

                // Если день только с cycleDay (без еды) — добавляем минимальную запись
                if (dayInfo.kcal < threshold && hasCycleDay) {
                    daysData.set(dateStr, {
                        kcal: 0, target: 0, ratio: 0,
                        hasTraining: false, trainingTypes: [], trainingMinutes: 0,
                        moodAvg: null, sleepHours: 0, dayScore: 0,
                        prot: 0, fat: 0, carbs: 0,
                        cycleDay: dayInfo.cycleDay
                    });
                    continue;
                }

                // Используем вес дня если есть, иначе из профиля
                const weight = dayInfo.weightMorning || profileWeight;
                const bmr = calcBMR(weight, profile || {});

                // Шаги: формула stepsKcal(steps, weight, sex, 0.7)
                const steps = dayInfo.steps || 0;
                const stepsK = stepsKcal(steps, weight, sex, 0.7);

                // Быт: householdMin × kcalPerMin(2.5, weight)
                const householdMin = dayInfo.householdMin || 0;
                const householdK = Math.round(householdMin * kcalPerMin(2.5, weight));

                // Тренировки: суммируем ккал из зон z (как на экране дня — только первые 3)
                // Читаем кастомные MET из heys_hr_zones (как на экране дня)
                const hrZones = lsGet('heys_hr_zones', []);
                const customMets = hrZones.map(x => +x.MET || 0);
                const mets = [2.5, 6, 8, 10].map((def, i) => customMets[i] || def);
                const kcalMin = mets.map(m => kcalPerMin(m, weight));

                let trainingsK = 0;
                const trainings = (dayInfo.trainings || []).slice(0, 3); // максимум 3 тренировки

                // Собираем типы тренировок с реальными минутами
                const trainingTypes = trainings
                    .filter(t => t && t.z && Array.isArray(t.z) && t.z.some(z => z > 0))
                    .map(t => t.type || 'cardio');
                const hasTraining = trainingTypes.length > 0;

                trainings.forEach((t, tIdx) => {
                    if (t.z && Array.isArray(t.z)) {
                        let tKcal = 0;
                        t.z.forEach((min, i) => {
                            tKcal += Math.round((+min || 0) * (kcalMin[i] || 0));
                        });
                        trainingsK += tKcal;
                    }
                });

                const tdee = bmr + stepsK + householdK + trainingsK;
                // Используем дефицит дня если есть (не пустая строка и не null), иначе из профиля
                const dayDeficit = (dayInfo.deficitPct !== '' && dayInfo.deficitPct != null) ? +dayInfo.deficitPct : deficitPct;
                const calculatedTarget = Math.round(tdee * (1 + dayDeficit / 100));

                // 🔧 FIX: Используем сохранённую норму с долгом если есть, иначе расчётную
                // Это позволяет показывать корректную линию нормы в sparkline для прошлых дней
                const target = dayInfo.savedDisplayOptimum > 0 ? dayInfo.savedDisplayOptimum : calculatedTarget;

                // 🔧 FIX: Используем сохранённые калории если есть, иначе пересчитанные
                // savedEatenKcal гарантирует точное значение, которое показывалось пользователю в тот день
                const kcal = dayInfo.savedEatenKcal > 0 ? dayInfo.savedEatenKcal : dayInfo.kcal;

                // ratio: 1.0 = идеально в цель, <1 недоел, >1 переел
                const ratio = target > 0 ? kcal / target : 0;

                // moodAvg для mood-полосы на графике
                const moodAvg = dayInfo.moodAvg ? +dayInfo.moodAvg : null;

                // Дополнительные данные для sparkline и персонализированных инсайтов
                const sleepHours = dayInfo.sleepHours || 0;
                const trainingMinutes = dayInfo.trainingMinutes || 0;
                const prot = dayInfo.prot || 0;
                const fat = dayInfo.fat || 0;
                const carbs = dayInfo.carbs || 0;
                const dayScore = dayInfo.dayScore || 0;
                const cycleDay = dayInfo.cycleDay || null; // День менструального цикла
                // steps уже объявлен выше для расчёта stepsKcal
                const waterMl = dayInfo.waterMl || 0; // 🆕 Вода для персонализированных инсайтов
                const weightMorning = dayInfo.weightMorning || 0; // 🆕 Вес для персонализированных инсайтов

                daysData.set(dateStr, {
                    kcal, target, ratio, // 🔧 FIX: kcal теперь использует savedEatenKcal если есть
                    baseTarget: calculatedTarget, // 🔧 Базовая норма БЕЗ долга — для расчёта caloricDebt
                    hasTraining, trainingTypes, trainingMinutes,
                    moodAvg, sleepHours, dayScore,
                    prot, fat, carbs,
                    steps, waterMl, weightMorning, // 🆕 Добавлены для персонализированных инсайтов
                    cycleDay,
                    isRefeedDay: dayInfo.isRefeedDay || false,
                    refeedReason: dayInfo.refeedReason || null,
                    // 🆕 v1.1: Флаги верификации низкокалорийных дней
                    isFastingDay: dayInfo.isFastingDay || false,
                    isIncomplete: dayInfo.isIncomplete || false
                });

                _diagActive++;
            }

            // [HEYS.calendar] Диагностика результатов
            window.console.info('[HEYS.calendar] 📊 getActiveDaysForMonth: month=' + (month + 1)
                + ' daysInMonth=' + daysInMonth
                + ' null=' + _diagNull + ' filtered=' + _diagFiltered + ' active=' + _diagActive
                + ' productsMap=' + productsMap.size
                + ' threshold=' + threshold
                + ' clientId=' + (window.HEYS?.currentClientId?.slice(0, 8) || 'none'));

        } catch (e) {
            // Тихий fallback — activeDays для календаря не критичны,
            // но ошибку стоит залогировать, иначе отладка невозможна.
            window.console.error('[HEYS.calendar] ❌ getActiveDaysForMonth ошибка:', e?.message || e);
            try {
                if (typeof HEYS !== 'undefined' && HEYS.analytics && HEYS.analytics.trackError) {
                    HEYS.analytics.trackError(e, {
                        where: 'day_utils.getActiveDaysForMonth',
                        year,
                        month,
                        hasProfile: !!profile,
                        productsLen: Array.isArray(products) ? products.length : null,
                    });
                }
            } catch (_) { }
        }

        return daysData;
    }

    // === Exports ===
    // Всё экспортируется через HEYS.dayUtils
    // POPULAR_CACHE — приватный, не экспортируется (инкапсуляция)
    HEYS.dayUtils = {
        // Haptic
        haptic: hapticFn,
        // Date/Time
        pad2,
        todayISO,
        fmtDate,
        parseISO,
        uid,
        formatDateDisplay,
        // Night time logic (приёмы 00:00-02:59 относятся к предыдущему дню)
        NIGHT_HOUR_THRESHOLD,
        isNightTime,
        getEffectiveDate,
        getNextDay,
        // Storage
        lsGet,
        lsSet,
        // Math
        clamp,
        r0,
        r1,
        scale,
        // Models
        ensureDay,
        buildProductIndex,
        getProductFromItem,
        per100,
        // Data
        loadMealsForDate,
        loadMealsRaw,
        productsSignature,
        computePopularProducts,
        // Profile/Calculations
        getProfile,
        calcBMR,
        kcalPerMin,
        stepsKcal,
        // Time/Sleep
        parseTime,
        sleepHours,
        formatMealTime,
        // Hours Order (для wheel picker с ночными часами)
        HOURS_ORDER,
        wheelIndexToHour,
        hourToWheelIndex,
        // Meal Type Classification
        MEAL_TYPES,
        MAIN_MEAL_THRESHOLDS,
        getMealStats,
        isMainMeal,
        timeToMinutes,
        getMealType,
        getMealTypeSimple,
        getMealTypeForPreview,
        fallbackMealType,
        // Calendar indicators
        getDayCalories,
        getProductsMap,
        getActiveDaysForMonth,
        getDayData,
        // 🚀 Lazy-loading API
        loadRecentDays,
        loadDay,
        invalidateDayCache,
        clearDaysCache,
        getDaysCacheStats,
        preloadMonthDays
    };

})(window);

// === heys_day_hooks.js ===
// heys_day_hooks.js — React hooks for Day component

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // Импортируем утилиты из dayUtils
    const getDayUtils = () => HEYS.dayUtils || {};

    // Хук для централизованного автосохранения дня с учётом гонок и межвкладочной синхронизации
    // Поддерживает ночную логику: приёмы 00:00-02:59 сохраняются под следующий календарный день
    function useDayAutosave({
        day,
        date,
        lsSet,
        lsGetFn,
        keyPrefix = 'heys_dayv2_',
        debounceMs = 500,
        now = () => Date.now(),
        disabled = false, // ЗАЩИТА: не сохранять пока данные не загружены
    }) {
        const utils = getDayUtils();
        // ВАЖНО: Используем динамический вызов чтобы всегда брать актуальный HEYS.utils.lsSet
        // Это нужно для синхронизации с облаком (диспатч события heys:data-saved)
        const lsSetFn = React.useCallback((key, val) => {
            const storeSet = global.HEYS?.store?.set;
            if (storeSet) {
                storeSet(key, val);
                return;
            }
            const actualLsSet = global.HEYS?.utils?.lsSet || lsSet || utils.lsSet;
            if (actualLsSet) {
                actualLsSet(key, val);
            } else {
                // Fallback
                try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { }
            }
        }, [lsSet, utils.lsSet]);
        const lsGetFunc = lsGetFn || utils.lsGet;

        const timerRef = React.useRef(null);
        const prevStoredSnapRef = React.useRef(null);
        const prevDaySnapRef = React.useRef(null);
        const sourceIdRef = React.useRef((global.crypto && typeof global.crypto.randomUUID === 'function') ? global.crypto.randomUUID() : String(Math.random()));
        const channelRef = React.useRef(null);
        const isUnmountedRef = React.useRef(false);

        React.useEffect(() => {
            isUnmountedRef.current = false;
            if ('BroadcastChannel' in global) {
                const channel = new BroadcastChannel('heys_day_updates');
                channelRef.current = channel;
                return () => {
                    isUnmountedRef.current = true;
                    channel.close();
                    channelRef.current = null;
                };
            }
            channelRef.current = null;
        }, []);

        const getKey = React.useCallback((dateStr) => keyPrefix + dateStr, [keyPrefix]);

        const stripMeta = React.useCallback((payload) => {
            if (!payload) return payload;
            const { updatedAt, _sourceId, ...rest } = payload;
            return rest;
        }, []);

        const readExisting = React.useCallback((key) => {
            if (!key) return null;
            try {
                if (global.HEYS?.store?.invalidate) {
                    global.HEYS.store.invalidate(key);
                }
                const stored = lsGetFunc ? lsGetFunc(key, null) : null;
                if (stored && typeof stored === 'object') return stored;
                if (typeof stored === 'string') {
                    return JSON.parse(stored);
                }
            } catch (e) { }

            const readRawLocal = (rawKey) => {
                if (!rawKey) return null;
                try {
                    const raw = global.localStorage?.getItem(rawKey);
                    if (!raw) return null;
                    if (raw.startsWith('¤Z¤') && global.HEYS?.store?.decompress) {
                        return global.HEYS.store.decompress(raw);
                    }
                    return JSON.parse(raw);
                } catch (e) {
                    return null;
                }
            };

            try {
                const cid = global.HEYS?.currentClientId;
                const isScoped = cid && key.startsWith('heys_') && !key.includes(cid);
                const scopedKey = isScoped ? ('heys_' + cid + '_' + key.substring('heys_'.length)) : key;
                const scopedVal = readRawLocal(scopedKey);
                if (scopedVal && typeof scopedVal === 'object') return scopedVal;
                const rawVal = readRawLocal(key);
                if (rawVal && typeof rawVal === 'object') return rawVal;
            } catch (e) { }
            return null;
        }, [lsGetFunc]);

        const isMeaningfulDayData = React.useCallback((data) => {
            if (!data || typeof data !== 'object') return false;
            const mealsCount = Array.isArray(data.meals) ? data.meals.length : 0;
            const trainingsCount = Array.isArray(data.trainings) ? data.trainings.length : 0;
            if (mealsCount > 0 || trainingsCount > 0) return true;
            if ((data.waterMl || 0) > 0) return true;
            if ((data.steps || 0) > 0) return true;
            if ((data.weightMorning || 0) > 0) return true;
            if (data.sleepStart || data.sleepEnd || data.sleepQuality || data.sleepNote) return true;
            if (data.dayScore || data.moodAvg || data.wellbeingAvg || data.stressAvg) return true;
            if (data.moodMorning || data.wellbeingMorning || data.stressMorning) return true;
            if (data.householdMin || (Array.isArray(data.householdActivities) && data.householdActivities.length > 0)) return true;
            if (data.isRefeedDay || data.refeedReason) return true;
            if (data.cycleDay !== null && data.cycleDay !== undefined) return true;
            if (data.deficitPct !== null && data.deficitPct !== undefined && data.deficitPct !== '') return true;
            if ((Array.isArray(data.supplementsPlanned) && data.supplementsPlanned.length > 0) ||
                (Array.isArray(data.supplementsTaken) && data.supplementsTaken.length > 0)) return true;
            return false;
        }, []);

        // Очистка фото от base64 данных перед сохранением (экономия localStorage)
        const stripPhotoData = React.useCallback((payload) => {
            if (!payload?.meals) return payload;
            return {
                ...payload,
                meals: payload.meals.map(meal => {
                    if (!meal?.photos?.length) return meal;
                    return {
                        ...meal,
                        photos: meal.photos.map(photo => {
                            // Если есть URL — удаляем data (base64)
                            // Если нет URL (pending) — сохраняем data для offline
                            if (photo.url) {
                                const { data, ...rest } = photo;
                                return rest;
                            }
                            // Pending фото: сохраняем, но ограничиваем размер
                            // Если data > 100KB — не сохраняем в localStorage (только в pending queue)
                            if (photo.data && photo.data.length > 100000) {
                                console.warn('[AUTOSAVE] Photo too large for localStorage, skipping data');
                                const { data, ...rest } = photo;
                                return { ...rest, dataSkipped: true };
                            }
                            return photo;
                        })
                    };
                })
            };
        }, []);

        // Сохранение данных дня под конкретную дату
        const saveToDate = React.useCallback((dateStr, payload) => {
            if (!dateStr || !payload) return;
            const key = getKey(dateStr);
            const current = readExisting(key);
            const incomingUpdatedAt = payload.updatedAt != null ? payload.updatedAt : now();

            if (current && current.updatedAt > incomingUpdatedAt) return;
            if (current && current.updatedAt === incomingUpdatedAt && current._sourceId && current._sourceId > sourceIdRef.current) return;

            if (current && isMeaningfulDayData(current) && !isMeaningfulDayData(payload)) return;

            // 🔍 DEBUG: Проверка на продукты без нутриентов в meals
            const emptyItems = [];
            (payload.meals || []).forEach((meal, mi) => {
                (meal.items || []).forEach((item, ii) => {
                    if (!item.kcal100 && !item.protein100 && !item.carbs100) {
                        emptyItems.push({
                            mealIndex: mi,
                            itemIndex: ii,
                            name: item.name,
                            id: item.id,
                            product_id: item.product_id,
                            grams: item.grams
                        });
                    }
                });
            });
            if (emptyItems.length > 0) {
                console.warn('⚠️ [AUTOSAVE] Items WITHOUT nutrients being saved:', emptyItems);
                // Попробуем найти продукт в базе для этого item
                emptyItems.forEach(item => {
                    const products = HEYS?.products?.getAll?.() || [];
                    const found = products.find(p =>
                        p.name?.toLowerCase() === item.name?.toLowerCase() ||
                        String(p.id) === String(item.product_id)
                    );
                    if (found) {
                        console.log('🔍 [AUTOSAVE] Found product in DB for empty item:', item.name, {
                            dbHasNutrients: !!(found.kcal100 || found.protein100),
                            dbKcal100: found.kcal100,
                            dbProtein100: found.protein100
                        });
                    } else {
                        console.error('🚨 [AUTOSAVE] Product NOT FOUND in DB for:', item.name);
                    }
                });
            }

            // Очищаем фото от base64 перед сохранением
            const cleanedPayload = stripPhotoData(payload);

            const toStore = {
                ...cleanedPayload,
                date: dateStr,
                schemaVersion: payload.schemaVersion != null ? payload.schemaVersion : 3,
                updatedAt: incomingUpdatedAt,
                _sourceId: sourceIdRef.current,
            };

            try {
                lsSetFn(key, toStore);
                if (channelRef.current && !isUnmountedRef.current) {
                    try {
                        channelRef.current.postMessage({ type: 'day:update', date: dateStr, payload: toStore });
                    } catch (e) { }
                }
            } catch (error) {
                console.error('[AUTOSAVE] localStorage write failed:', error);
            }
        }, [getKey, lsSetFn, now, readExisting, stripPhotoData, isMeaningfulDayData]);

        const flush = React.useCallback((options = {}) => {
            const force = options && options.force === true;
            if (!force && (disabled || isUnmountedRef.current)) return;
            if (!day || !day.date) return;

            if (force) {
                const key = getKey(day.date);
                const existing = readExisting(key);
                if (isMeaningfulDayData(existing) && !isMeaningfulDayData(day)) return;
            }

            const daySnap = JSON.stringify(stripMeta(day));
            if (prevDaySnapRef.current === daySnap) return;

            const updatedAt = day.updatedAt != null ? day.updatedAt : now();

            // Просто сохраняем все приёмы под текущую дату
            // Ночная логика теперь в todayISO() — до 3:00 "сегодня" = вчера
            const payload = {
                ...day,
                updatedAt,
            };
            saveToDate(day.date, payload);
            prevStoredSnapRef.current = JSON.stringify(payload);
            prevDaySnapRef.current = daySnap;
        }, [day, now, saveToDate, stripMeta, disabled, getKey, readExisting, isMeaningfulDayData]);

        React.useEffect(() => {
            // 🔒 ЗАЩИТА: Не инициализируем prevDaySnapRef до гидратации!
            // Иначе после sync данные изменятся, а ref будет содержать старую версию
            if (disabled) return;
            if (!day || !day.date) return;
            // ✅ FIX: getKey ожидает dateStr, а не объект day
            // Иначе получаем ключ вида "heys_dayv2_[object Object]" и ломаем init снапов.
            const key = getKey(day.date);
            const current = readExisting(key);
            if (current) {
                prevStoredSnapRef.current = JSON.stringify(current);
                prevDaySnapRef.current = JSON.stringify(stripMeta(current));
            } else {
                prevDaySnapRef.current = JSON.stringify(stripMeta(day));
            }
        }, [day && day.date, getKey, readExisting, stripMeta, disabled]);

        React.useEffect(() => {
            if (disabled) return; // ЗАЩИТА: не запускать таймер до гидратации
            if (!day || !day.date) return;

            // 🔒 ЗАЩИТА: Инициализируем prevDaySnapRef при первом включении
            // Это предотвращает ложный save сразу после isHydrated=true
            const daySnap = JSON.stringify(stripMeta(day));

            if (prevDaySnapRef.current === null) {
                // Первый запуск после гидратации — просто запоминаем состояние без save
                prevDaySnapRef.current = daySnap;
                return;
            }

            if (prevDaySnapRef.current === daySnap) return;

            // ☁️ Сразу показать что данные изменились (до debounce)
            // Это запустит анимацию синхронизации в облачном индикаторе
            if (typeof global.dispatchEvent === 'function') {
                global.dispatchEvent(new CustomEvent('heys:data-saved', { detail: { key: 'day', type: 'data' } }));
            }

            global.clearTimeout(timerRef.current);
            timerRef.current = global.setTimeout(flush, debounceMs);
            return () => { global.clearTimeout(timerRef.current); };
        }, [day, debounceMs, flush, stripMeta, disabled]);

        React.useEffect(() => {
            return () => {
                global.clearTimeout(timerRef.current);
                if (!disabled) flush(); // ЗАЩИТА: не сохранять при unmount если не гидратировано
            };
        }, [flush, disabled]);

        React.useEffect(() => {
            const onVisChange = () => {
                if (!disabled && global.document.visibilityState !== 'visible') flush();
            };
            global.document.addEventListener('visibilitychange', onVisChange);
            global.addEventListener('pagehide', flush);
            return () => {
                global.document.removeEventListener('visibilitychange', onVisChange);
                global.removeEventListener('pagehide', flush);
            };
        }, [flush]);

        return { flush };
    }

    // Хук для централизованной детекции мобильных устройств с поддержкой ротации
    function useMobileDetection(breakpoint = 768) {
        const [isMobile, setIsMobile] = React.useState(() => {
            if (typeof window === 'undefined') return false;
            return window.innerWidth <= breakpoint;
        });

        React.useEffect(() => {
            if (typeof window === 'undefined' || !window.matchMedia) return;

            const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);

            const handleChange = (e) => {
                setIsMobile(e.matches);
            };

            // Начальное значение
            setIsMobile(mediaQuery.matches);

            // Подписка на изменения (поддержка ротации экрана)
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', handleChange);
                return () => mediaQuery.removeEventListener('change', handleChange);
            } else {
                // Fallback для старых браузеров
                mediaQuery.addListener(handleChange);
                return () => mediaQuery.removeListener(handleChange);
            }
        }, [breakpoint]);

        return isMobile;
    }

    // 🔧 v3.19.2: Глобальный кэш prefetch для предотвращения повторных запросов
    // Сохраняется между размонтированиями компонента
    const globalPrefetchCache = {
        prefetched: new Set(),
        lastPrefetchTime: 0,
        PREFETCH_COOLDOWN: 5000 // 5 секунд между prefetch
    };

    // Хук для Smart Prefetch — предзагрузка данных ±N дней при наличии интернета
    function useSmartPrefetch({
        currentDate,
        daysRange = 7,  // ±7 дней
        enabled = true
    }) {
        // 🔧 v3.19.2: Используем глобальный кэш вместо локального ref
        const prefetchedRef = React.useRef(globalPrefetchCache.prefetched);
        const utils = getDayUtils();
        const lsGet = utils.lsGet || HEYS.utils?.lsGet;

        // Генерация списка дат для prefetch
        const getDatesToPrefetch = React.useCallback((centerDate) => {
            const dates = [];
            const center = new Date(centerDate);

            for (let i = -daysRange; i <= daysRange; i++) {
                const d = new Date(center);
                d.setDate(d.getDate() + i);
                dates.push(d.toISOString().slice(0, 10));
            }

            return dates;
        }, [daysRange]);

        // Prefetch данных через Supabase (если доступно)
        const prefetchFromCloud = React.useCallback(async (dates) => {
            if (!navigator.onLine) return;
            if (!HEYS.cloud?.isAuthenticated?.()) return;

            // 🔧 v3.19.2: Cooldown защита от частых вызовов
            const now = Date.now();
            if (now - globalPrefetchCache.lastPrefetchTime < globalPrefetchCache.PREFETCH_COOLDOWN) {
                return; // Слишком частые вызовы — пропускаем
            }

            const toFetch = dates.filter(d => !prefetchedRef.current.has(d));
            if (toFetch.length === 0) return;

            try {
                // 🔧 v3.19.2: Обновляем время последнего prefetch
                globalPrefetchCache.lastPrefetchTime = now;

                // Пометим как "в процессе" чтобы избежать дублирования
                toFetch.forEach(d => prefetchedRef.current.add(d));

                // Загружаем данные через cloud sync
                if (HEYS.cloud?.fetchDays) {
                    await HEYS.cloud.fetchDays(toFetch);
                }
            } catch (error) {
                // Откатываем пометки при ошибке
                toFetch.forEach(d => prefetchedRef.current.delete(d));
            }
        }, []);

        // Prefetch при смене даты или восстановлении соединения
        React.useEffect(() => {
            if (!enabled || !currentDate) return;

            const dates = getDatesToPrefetch(currentDate);
            prefetchFromCloud(dates);

            // Подписка на восстановление соединения
            const handleOnline = () => {
                prefetchFromCloud(getDatesToPrefetch(currentDate));
            };

            window.addEventListener('online', handleOnline);
            return () => window.removeEventListener('online', handleOnline);
        }, [currentDate, enabled, getDatesToPrefetch, prefetchFromCloud]);

        // Ручной триггер prefetch
        const triggerPrefetch = React.useCallback(() => {
            if (!currentDate) return;
            prefetchedRef.current.clear();
            prefetchFromCloud(getDatesToPrefetch(currentDate));
        }, [currentDate, getDatesToPrefetch, prefetchFromCloud]);

        return { triggerPrefetch };
    }

    // === Exports ===
    HEYS.dayHooks = {
        useDayAutosave,
        useMobileDetection,
        useSmartPrefetch
    };

})(window);

// === heys_day_calculations.js ===
// heys_day_calculations.js — Helper functions for calculations and data processing
// Phase 11 of HEYS Day v12 refactoring
// Extracted calculation and utility functions
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // Dependencies - use HEYS.dayUtils if available (optional for this module)
    const U = HEYS.dayUtils || {};
    const M = HEYS.models || {};
    const r0 = (n) => Math.round(n) || 0;
    const r1 = (n) => Math.round(n * 10) / 10;

    /**
     * Calculate day totals from meals
     * @param {Object} day - Day data
     * @param {Object} pIndex - Product index
     * @returns {Object} Day totals
     */
    function calculateDayTotals(day, pIndex) {
        const t = { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };
        (day.meals || []).forEach(m => {
            const mt = M.mealTotals ? M.mealTotals(m, pIndex) : {};
            Object.keys(t).forEach(k => {
                t[k] += mt[k] || 0;
            });
        });
        Object.keys(t).forEach(k => t[k] = r0(t[k]));

        // Weighted averages для ГИ и вредности по граммам
        let gSum = 0, giSum = 0, harmSum = 0;
        (day.meals || []).forEach(m => {
            (m.items || []).forEach(it => {
                const p = getProductFromItem(it, pIndex);
                if (!p) return;
                const g = +it.grams || 0;
                if (!g) return;
                const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
                const harm = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct;
                gSum += g;
                if (gi != null) giSum += gi * g;
                if (harm != null) harmSum += harm * g;
            });
        });
        t.gi = gSum ? giSum / gSum : 0;
        t.harm = gSum ? harmSum / gSum : 0;

        return t;
    }

    /**
     * Get product from item (helper function)
     */
    function getProductFromItem(item, pIndex) {
        if (!item || !pIndex) return null;
        const productId = item.product_id || item.id;
        return pIndex[productId] || null;
    }

    /**
     * Compute daily norms from percentages
     * @param {number} optimum - Target calories
     * @param {Object} normPerc - Norm percentages
     * @returns {Object} Absolute norms
     */
    function computeDailyNorms(optimum, normPerc = {}) {
        const K = +optimum || 0;
        const carbPct = +normPerc.carbsPct || 0;
        const protPct = +normPerc.proteinPct || 0;
        const fatPct = Math.max(0, 100 - carbPct - protPct);
        const carbs = K ? (K * carbPct / 100) / 4 : 0;
        const prot = K ? (K * protPct / 100) / 4 : 0;
        const fat = K ? (K * fatPct / 100) / 9 : 0; // 9 ккал/г
        const simplePct = +normPerc.simpleCarbPct || 0;
        const simple = carbs * simplePct / 100;
        const complex = Math.max(0, carbs - simple);
        const badPct = +normPerc.badFatPct || 0;
        const transPct = +normPerc.superbadFatPct || 0;
        const bad = fat * badPct / 100;
        const trans = fat * transPct / 100;
        const good = Math.max(0, fat - bad - trans);
        const fiberPct = +normPerc.fiberPct || 0;
        const fiber = K ? (K / 1000) * fiberPct : 0;
        const gi = +normPerc.giPct || 0;
        const harm = +normPerc.harmPct || 0;
        return { kcal: K, carbs, simple, complex, prot, fat, bad, good, trans, fiber, gi, harm };
    }

    /**
     * Calculate day averages (mood, wellbeing, stress, dayScore)
     * @param {Array} meals - Meals array
     * @param {Array} trainings - Trainings array
     * @param {Object} dayData - Day data with morning scores
     * @returns {Object} Averages
     */
    function calculateDayAverages(meals, trainings, dayData) {
        // Утренние оценки из чек-ина (если есть — это стартовая точка дня)
        const morningMood = dayData?.moodMorning && !isNaN(+dayData.moodMorning) ? [+dayData.moodMorning] : [];
        const morningWellbeing = dayData?.wellbeingMorning && !isNaN(+dayData.wellbeingMorning) ? [+dayData.wellbeingMorning] : [];
        const morningStress = dayData?.stressMorning && !isNaN(+dayData.stressMorning) ? [+dayData.stressMorning] : [];

        // Собираем все оценки из приёмов пищи
        const mealMoods = (meals || []).filter(m => m.mood && !isNaN(+m.mood)).map(m => +m.mood);
        const mealWellbeing = (meals || []).filter(m => m.wellbeing && !isNaN(+m.wellbeing)).map(m => +m.wellbeing);
        const mealStress = (meals || []).filter(m => m.stress && !isNaN(+m.stress)).map(m => +m.stress);

        // Собираем оценки из тренировок (фильтруем только РЕАЛЬНЫЕ тренировки)
        const realTrainings = (trainings || []).filter(t => {
            const hasTime = t.time && t.time.trim() !== '';
            const hasMinutes = t.z && Array.isArray(t.z) && t.z.some(m => m > 0);
            return hasTime || hasMinutes;
        });
        const trainingMoods = realTrainings.filter(t => t.mood && !isNaN(+t.mood)).map(t => +t.mood);
        const trainingWellbeing = realTrainings.filter(t => t.wellbeing && !isNaN(+t.wellbeing)).map(t => +t.wellbeing);
        const trainingStress = realTrainings.filter(t => t.stress && !isNaN(+t.stress)).map(t => +t.stress);

        // Объединяем все оценки: утро + приёмы пищи + тренировки
        const allMoods = [...morningMood, ...mealMoods, ...trainingMoods];
        const allWellbeing = [...morningWellbeing, ...mealWellbeing, ...trainingWellbeing];
        const allStress = [...morningStress, ...mealStress, ...trainingStress];

        const moodAvg = allMoods.length ? r1(allMoods.reduce((sum, val) => sum + val, 0) / allMoods.length) : '';
        const wellbeingAvg = allWellbeing.length ? r1(allWellbeing.reduce((sum, val) => sum + val, 0) / allWellbeing.length) : '';
        const stressAvg = allStress.length ? r1(allStress.reduce((sum, val) => sum + val, 0) / allStress.length) : '';

        // Автоматический расчёт dayScore
        // Формула: (mood + wellbeing + (10 - stress)) / 3, округлено до целого
        let dayScore = '';
        if (moodAvg !== '' || wellbeingAvg !== '' || stressAvg !== '') {
            const m = moodAvg !== '' ? +moodAvg : 5;
            const w = wellbeingAvg !== '' ? +wellbeingAvg : 5;
            const s = stressAvg !== '' ? +stressAvg : 5;
            // stress инвертируем: низкий стресс = хорошо
            dayScore = Math.round((m + w + (10 - s)) / 3);
        }

        return { moodAvg, wellbeingAvg, stressAvg, dayScore };
    }

    /**
     * Normalize trainings data (migrate quality/feelAfter to mood/wellbeing)
     * @param {Array} trainings - Trainings array
     * @returns {Array} Normalized trainings
     */
    function normalizeTrainings(trainings = []) {
        return trainings.map((t = {}) => {
            if (t.quality !== undefined || t.feelAfter !== undefined) {
                const { quality, feelAfter, ...rest } = t;
                return {
                    ...rest,
                    mood: rest.mood ?? quality ?? 5,
                    wellbeing: rest.wellbeing ?? feelAfter ?? 5,
                    stress: rest.stress ?? 5
                };
            }
            return t;
        });
    }

    /**
     * Clean empty trainings (all zones = 0)
     * @param {Array} trainings - Trainings array
     * @returns {Array} Filtered trainings
     */
    function cleanEmptyTrainings(trainings) {
        if (!Array.isArray(trainings)) return [];
        return trainings.filter(t => t && t.z && t.z.some(z => z > 0));
    }

    /**
     * Sort meals by time (latest first)
     * @param {Array} meals - Meals array
     * @returns {Array} Sorted meals
     */
    function sortMealsByTime(meals) {
        if (!meals || meals.length <= 1) return meals;

        return [...meals].sort((a, b) => {
            const timeA = U.timeToMinutes ? U.timeToMinutes(a.time) : null;
            const timeB = U.timeToMinutes ? U.timeToMinutes(b.time) : null;

            // Если оба без времени — сохраняем порядок
            if (timeA === null && timeB === null) return 0;
            // Без времени — в конец
            if (timeA === null) return 1;
            if (timeB === null) return -1;

            // Обратный порядок: последние наверху
            return timeB - timeA;
        });
    }

    /**
     * Parse time string to minutes
     * @param {string} timeStr - Time string (HH:MM)
     * @returns {number} Minutes since midnight
     */
    function parseTimeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }

    /**
     * Format time from minutes
     * @param {number} minutes - Minutes since midnight
     * @returns {string} Time string (HH:MM)
     */
    function formatMinutesToTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // Export module
    HEYS.dayCalculations = {
        calculateDayTotals,
        computeDailyNorms,
        calculateDayAverages,
        normalizeTrainings,
        cleanEmptyTrainings,
        sortMealsByTime,
        parseTimeToMinutes,
        formatMinutesToTime,
        getProductFromItem
    };

})(window);

// === heys_day_effects.js ===
// heys_day_effects.js — DayTab side effects (sync, events)
// Phase 12 of HEYS Day v12 refactoring
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function getReact() {
        const React = global.React;
        if (!React) {
            throw new Error('[heys_day_effects] React is required. Ensure React is loaded before heys_day_effects.js');
        }
        return React;
    }

    function useDaySyncEffects(deps) {
        const React = getReact();
        const {
            date,
            setIsHydrated,
            setDay,
            getProfile,
            ensureDay,
            loadMealsForDate,
            lsGet,
            lsSet,
            normalizeTrainings,
            cleanEmptyTrainings,
            prevDateRef,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            isSyncingRef
        } = deps || {};

        const isMeaningfulDayData = (data) => {
            if (!data || typeof data !== 'object') return false;
            const mealsCount = Array.isArray(data.meals) ? data.meals.length : 0;
            const trainingsCount = Array.isArray(data.trainings) ? data.trainings.length : 0;
            if (mealsCount > 0 || trainingsCount > 0) return true;
            if ((data.waterMl || 0) > 0) return true;
            if ((data.steps || 0) > 0) return true;
            if ((data.weightMorning || 0) > 0) return true;
            if (data.sleepStart || data.sleepEnd || data.sleepQuality || data.sleepNote) return true;
            if (data.dayScore || data.moodAvg || data.wellbeingAvg || data.stressAvg) return true;
            if (data.moodMorning || data.wellbeingMorning || data.stressMorning) return true;
            if (data.householdMin || (Array.isArray(data.householdActivities) && data.householdActivities.length > 0)) return true;
            if (data.isRefeedDay || data.refeedReason) return true;
            if (data.cycleDay !== null && data.cycleDay !== undefined) return true;
            if (data.deficitPct !== null && data.deficitPct !== undefined && data.deficitPct !== '') return true;
            if ((Array.isArray(data.supplementsPlanned) && data.supplementsPlanned.length > 0) ||
                (Array.isArray(data.supplementsTaken) && data.supplementsTaken.length > 0)) return true;
            return false;
        };

        // Подгружать данные дня из облака при смене даты
        React.useEffect(() => {
            let cancelled = false;

            // 🔴 КРИТИЧНО: Сохранить текущие данные ПЕРЕД сменой даты!
            // Иначе несохранённые изменения потеряются при переходе на другую дату
            const dateActuallyChanged = prevDateRef.current !== date;
            if (dateActuallyChanged && HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
                console.info(`[HEYS] 📅 Смена даты: ${prevDateRef.current} → ${date}, сохраняем предыдущий день...`);
                // Flush данные предыдущего дня синхронно
                // force=true — сохраняем предыдущий день даже если isHydrated=false
                HEYS.Day.requestFlush({ force: true });
            }
            prevDateRef.current = date;

            setIsHydrated(false); // Сброс: данные ещё не загружены для новой даты
            const clientId = global.HEYS?.utils?.getCurrentClientId?.()
                || global.HEYS?.currentClientId
                || (global.HEYS?.store?.get ? global.HEYS.store.get('heys_client_current', '') : '')
                || localStorage.getItem('heys_client_current') || '';
            const cloud = global.HEYS && global.HEYS.cloud;

            // Сбрасываем ref при смене даты
            lastLoadedUpdatedAtRef.current = 0;

            const doLocal = () => {
                if (cancelled) return;
                const profNow = getProfile();
                const key = 'heys_dayv2_' + date;
                HEYS?.store?.invalidate?.(key);
                const v = lsGet(key, null);
                const hasStoredData = !!(v && typeof v === 'object' && (
                    v.date ||
                    (Array.isArray(v.meals) && v.meals.length > 0) ||
                    (Array.isArray(v.trainings) && v.trainings.length > 0) ||
                    v.updatedAt || v.waterMl || v.steps || v.weightMorning
                ));

                // � DEBUG v59 → v4.8.2: Отключено — слишком много логов при навигации
                // console.log(`[DAY LOAD] date=${date}, key=${key}, hasData=${hasStoredData}, meals=${v?.meals?.length || 0}`);

                if (hasStoredData) {
                    const normalizedDay = v?.date ? v : { ...v, date };
                    // ЗАЩИТА: не перезаписываем более свежие данные
                    // handleDayUpdated может уже загрузить sync данные
                    if (normalizedDay.updatedAt && lastLoadedUpdatedAtRef.current > 0 && normalizedDay.updatedAt < lastLoadedUpdatedAtRef.current) {
                        return;
                    }
                    lastLoadedUpdatedAtRef.current = normalizedDay.updatedAt || Date.now();

                    // Мигрируем оценки тренировок и очищаем пустые (только в памяти, НЕ сохраняем)
                    // Миграция сохранится автоматически при следующем реальном изменении данных
                    const normalizedTrainings = normalizeTrainings(normalizedDay.trainings);
                    const cleanedTrainings = cleanEmptyTrainings(normalizedTrainings);
                    const cleanedDay = {
                        ...normalizedDay,
                        trainings: cleanedTrainings
                    };
                    // 🔧 FIX: если meals пустые, пробуем подхватить legacy-ключи (heys_day_*, meals_*)
                    if (!Array.isArray(cleanedDay.meals) || cleanedDay.meals.length === 0) {
                        const legacyMeals = loadMealsForDate(date) || [];
                        if (legacyMeals.length > 0) {
                            cleanedDay.meals = legacyMeals;
                        }
                    }
                    // 🔒 НЕ сохраняем миграцию сразу — это вызывает DAY SAVE и мерцание UI
                    // Данные сохранятся при следующем изменении (добавление еды, воды и т.д.)
                    const newDay = ensureDay(cleanedDay, profNow);
                    // 🔒 Оптимизация: не вызываем setDay если данные идентичны (предотвращает мерцание)
                    setDay(prevDay => {
                        // Сравниваем по КОНТЕНТУ, а не по метаданным (updatedAt может отличаться между локальной и облачной версией)
                        if (prevDay && prevDay.date === newDay.date) {
                            const prevMealsJson = JSON.stringify(prevDay.meals || []);
                            const newMealsJson = JSON.stringify(newDay.meals || []);
                            const prevTrainingsJson = JSON.stringify(prevDay.trainings || []);
                            const newTrainingsJson = JSON.stringify(newDay.trainings || []);
                            const isSameContent =
                                prevMealsJson === newMealsJson &&
                                prevTrainingsJson === newTrainingsJson &&
                                prevDay.waterMl === newDay.waterMl &&
                                prevDay.steps === newDay.steps &&
                                prevDay.weightMorning === newDay.weightMorning &&
                                prevDay.sleepStart === newDay.sleepStart &&
                                prevDay.sleepEnd === newDay.sleepEnd;
                            if (isSameContent) {
                                // Данные не изменились — оставляем предыдущий объект (без ре-рендера)
                                return prevDay;
                            }
                        }
                        return newDay;
                    });
                } else {
                    // create a clean default day for the selected date (don't inherit previous trainings)
                    const defaultDay = ensureDay({
                        date: date,
                        meals: (loadMealsForDate(date) || []),
                        trainings: [],
                        // Явно устанавливаем пустые значения для полей сна и оценки
                        sleepStart: '',
                        sleepEnd: '',
                        sleepQuality: '',
                        sleepNote: '',
                        dayScore: '',
                        moodAvg: '',
                        wellbeingAvg: '',
                        stressAvg: '',
                        dayComment: ''
                    }, profNow);
                    setDay(defaultDay);
                }

                // ВАЖНО: данные загружены, теперь можно сохранять
                // Продукты приходят через props.products, не нужно обновлять локально
                setIsHydrated(true);
            };

            if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
                if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true) {
                    // 🔒 Блокируем события heys:day-updated во время синхронизации
                    // Это предотвращает множественные setDay() и мерцание UI
                    isSyncingRef.current = true;
                    cloud.bootstrapClientSync(clientId)
                        .then(() => {
                            // После sync localStorage уже обновлён событиями heys:day-updated
                            // Просто загружаем финальные данные (без задержки!)
                            isSyncingRef.current = false;
                            doLocal();
                        })
                        .catch((err) => {
                            // Нет сети или ошибка — загружаем из локального кэша
                            isSyncingRef.current = false;
                            console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                            doLocal();
                        });
                } else {
                    doLocal();
                }
            } else {
                doLocal();
            }

            return () => {
                cancelled = true;
                isSyncingRef.current = false; // Сброс при смене даты или размонтировании
            };
        }, [date]);

        // Слушаем событие обновления данных дня (от Morning Check-in или внешних изменений)
        // НЕ слушаем heysSyncCompleted — это вызывает бесконечный цикл при каждом сохранении
        // 🔧 v3.19.1: Защита от дублирующихся событий fetchDays
        const lastProcessedEventRef = React.useRef({ date: null, source: null, timestamp: 0 });
        const dayUpdateLogBufferRef = React.useRef([]);
        const dayUpdateLogTimerRef = React.useRef(null);

        React.useEffect(() => {
            const flushDayUpdateLog = () => {
                if (!dayUpdateLogBufferRef.current.length) return;
                const batch = dayUpdateLogBufferRef.current.splice(0);
                const bySource = batch.reduce((acc, item) => {
                    acc[item.source] = (acc[item.source] || 0) + 1;
                    return acc;
                }, {});
                const sourcesSummary = Object.entries(bySource)
                    .map(([source, count]) => `${source}:${count}`)
                    .join(', ');
                const dates = [...new Set(batch.map(item => item.updatedDate).filter(Boolean))].slice(0, 6).join(', ');
                console.info('[HEYS.day] 🔄 heys:day-updated (batch)', {
                    count: batch.length,
                    sources: sourcesSummary,
                    dates: dates ? dates + (batch.length > 6 ? '…' : '') : undefined
                });
            };

            const scheduleDayUpdateLog = (payload) => {
                dayUpdateLogBufferRef.current.push(payload);
                if (dayUpdateLogTimerRef.current) return;
                dayUpdateLogTimerRef.current = setTimeout(() => {
                    dayUpdateLogTimerRef.current = null;
                    flushDayUpdateLog();
                }, 250);
            };

            const handleDayUpdated = (e) => {
                const updatedDate = e.detail?.date;
                const source = e.detail?.source || 'unknown';
                const forceReload = e.detail?.forceReload || false;
                const syncTimestampOnly = e.detail?.syncTimestampOnly || false;
                const updatedAt = e.detail?.updatedAt;
                const payloadData = e.detail?.data;

                // v25.8.6.1: Handle timestamp-only sync (prevent fetchDays overwrite)
                if (syncTimestampOnly && updatedAt) {
                    const newTimestamp = Math.max(lastLoadedUpdatedAtRef.current || 0, updatedAt);
                    lastLoadedUpdatedAtRef.current = newTimestamp;
                    console.info(`[HEYS.day] ⏱️ Timestamp ref synced: ${newTimestamp} (source: ${source})`);
                    return; // Don't reload day, just updated timestamp ref
                }

                scheduleDayUpdateLog({
                    source,
                    updatedDate,
                    forceReload,
                    blockUntil: blockCloudUpdatesUntilRef.current
                });

                // 🔧 v3.19.1: Дедупликация событий — игнорируем одинаковые события в течение 100мс
                const now = Date.now();
                const last = lastProcessedEventRef.current;
                if (source === 'fetchDays' &&
                    last.date === updatedDate &&
                    last.source === source &&
                    now - last.timestamp < 100) {
                    return; // Пропускаем дубликат
                }
                lastProcessedEventRef.current = { date: updatedDate, source, timestamp: now };

                // 🔒 Игнорируем события во время начальной синхронизации
                // doLocal() в конце синхронизации загрузит все финальные данные
                if (isSyncingRef.current && (source === 'cloud' || source === 'merge')) {
                    return;
                }

                // v25.8.6.5: Если событие пришло с полным payload дня — применяем его напрямую.
                // Это обходит риск чтения устаревшего localStorage во время/после fetchDays.
                if (payloadData && (!updatedDate || updatedDate === date)) {
                    const profNow = getProfile();
                    const normalizedPayload = ensureDay(payloadData?.date ? payloadData : { ...payloadData, date }, profNow);
                    const payloadUpdatedAt = normalizedPayload.updatedAt || updatedAt || Date.now();
                    const payloadMealsCount = (normalizedPayload.meals || []).length;

                    setDay(prevDay => {
                        const prevUpdatedAt = prevDay?.updatedAt || 0;
                        const prevMealsCount = (prevDay?.meals || []).length;

                        // Защита от отката: принимаем payload, если он не старее
                        // или если в нём больше приемов пищи (локальный прогресс).
                        if (!forceReload && payloadUpdatedAt < prevUpdatedAt && payloadMealsCount <= prevMealsCount) {
                            console.info('[HEYS.day] ⏭️ Payload skipped (older than current)', {
                                source,
                                payloadUpdatedAt,
                                prevUpdatedAt,
                                payloadMealsCount,
                                prevMealsCount
                            });
                            return prevDay;
                        }

                        console.info('[HEYS.day] 📦 Applied day-updated payload', {
                            source,
                            payloadUpdatedAt,
                            payloadMealsCount,
                            forceReload
                        });
                        return normalizedPayload;
                    });

                    lastLoadedUpdatedAtRef.current = Math.max(lastLoadedUpdatedAtRef.current || 0, payloadUpdatedAt);
                    return;
                }

                // 🔧 v4.9.0: Определяем внешние источники (cloud sync)
                const externalSources = ['cloud', 'cloud-sync', 'merge', 'fetchDays'];
                const isExternalSource = externalSources.includes(source);

                // 🔒 Блокируем ЛЮБЫЕ внешние обновления (включая forceReload)
                // на 3 секунды после локального изменения
                if (isExternalSource && Date.now() < blockCloudUpdatesUntilRef.current) {
                    console.info('[HEYS.day] 🔒 External update blocked', {
                        source,
                        forceReload,
                        remainingMs: blockCloudUpdatesUntilRef.current - Date.now()
                    });
                    return;
                }

                // Для внутренних источников (step-modal, training-step, morning-checkin)
                // forceReload обходит блокировку как раньше
                if (!isExternalSource && !forceReload && Date.now() < blockCloudUpdatesUntilRef.current) {
                    console.info('[HEYS.day] 🔒 Internal update blocked (no forceReload)');
                    return;
                }

                // Если date не указан или совпадает с текущим — перезагружаем
                if (!updatedDate || updatedDate === date) {
                    const profNow = getProfile();
                    const key = 'heys_dayv2_' + date;
                    HEYS?.store?.invalidate?.(key);
                    const v = lsGet(key, null);
                    const hasStoredData = !!(v && typeof v === 'object' && (
                        v.date ||
                        (Array.isArray(v.meals) && v.meals.length > 0) ||
                        (Array.isArray(v.trainings) && v.trainings.length > 0) ||
                        v.updatedAt || v.waterMl || v.steps || v.weightMorning
                    ));
                    if (hasStoredData) {
                        const normalizedDay = v?.date ? v : { ...v, date };
                        const storageMeaningful = isMeaningfulDayData(normalizedDay);
                        // Проверяем: данные из storage новее текущих?
                        const storageUpdatedAt = normalizedDay.updatedAt || 0;
                        const currentUpdatedAt = lastLoadedUpdatedAtRef.current || 0;

                        const storageMealsCount = (normalizedDay.meals || []).length;
                        console.info('[HEYS.day] 📥 storage snapshot', {
                            source,
                            storageUpdatedAt,
                            currentUpdatedAt,
                            storageMealsCount,
                            forceReload
                        });

                        // Двойная защита: по timestamp И по количеству meals
                        // Не откатываем если в storage меньше meals чем в текущем state
                        const isStaleStorage = storageUpdatedAt < currentUpdatedAt;

                        // Пропускаем проверку timestamp если forceReload
                        // ВАЖНО: используем < вместо <= чтобы обрабатывать первую загрузку (когда оба = 0)
                        if (!forceReload && isStaleStorage) {
                            console.info('[HEYS.day] ⏭️ Day update skipped (stale storage)', {
                                source,
                                updatedDate,
                                storageUpdatedAt,
                                currentUpdatedAt
                            });
                            return; // Не перезаписываем более новые данные старыми
                        }
                        const migratedTrainings = normalizeTrainings(normalizedDay.trainings);
                        const cleanedTrainings = cleanEmptyTrainings(migratedTrainings);
                        const migratedDay = { ...normalizedDay, trainings: cleanedTrainings };
                        // 🔧 FIX: если meals пустые, пробуем подхватить legacy-ключи (heys_day_*, meals_*)
                        if (!Array.isArray(migratedDay.meals) || migratedDay.meals.length === 0) {
                            const legacyMeals = loadMealsForDate(date) || [];
                            if (legacyMeals.length > 0) {
                                migratedDay.meals = legacyMeals;
                            }
                        }
                        // Сохраняем миграцию ТОЛЬКО если данные изменились
                        const trainingsChanged = JSON.stringify(normalizedDay.trainings) !== JSON.stringify(cleanedTrainings);
                        if (trainingsChanged) {
                            lsSet(key, migratedDay);
                        }
                        const newDay = ensureDay(migratedDay, profNow);

                        // 🔒 Оптимизация: не вызываем setDay если контент идентичен (предотвращает мерцание)
                        setDay(prevDay => {
                            if (!storageMeaningful && isMeaningfulDayData(prevDay)) {
                                return prevDay;
                            }
                            const prevMealsCount = (prevDay?.meals || []).length;
                            if (storageMealsCount < prevMealsCount) {
                                console.warn('[HEYS.day] ⚠️ Potential overwrite (meals count down)', {
                                    source,
                                    prevMealsCount,
                                    storageMealsCount,
                                    forceReload
                                });
                            }

                            const shouldSkipOverwrite = isStaleStorage && storageMealsCount < prevMealsCount;
                            if (shouldSkipOverwrite) {
                                console.warn('[HEYS.day] 🛡️ Skip overwrite (stale + meals down)', {
                                    source,
                                    updatedDate,
                                    storageUpdatedAt,
                                    currentUpdatedAt,
                                    prevMealsCount,
                                    storageMealsCount,
                                    forceReload
                                });
                                return prevDay;
                            }

                            // v25.8.6.6: Защита от cloud/fetchDays отката количества приёмов.
                            // Внешние источники не должны уменьшать локально подтвержденные meals
                            // (особенно кейс 1 -> 0 при запаздывающем merge/fetchDays).
                            const shouldSkipExternalMealsRollback =
                                isExternalSource &&
                                storageMealsCount < prevMealsCount;

                            if (shouldSkipExternalMealsRollback) {
                                console.warn('[HEYS.day] 🛡️ Skip overwrite (external meals rollback)', {
                                    source,
                                    updatedDate,
                                    prevMealsCount,
                                    storageMealsCount,
                                    storageUpdatedAt,
                                    currentUpdatedAt,
                                    forceReload
                                });
                                return prevDay;
                            }

                            // Обновляем ref только если приняли данные из storage
                            lastLoadedUpdatedAtRef.current = storageUpdatedAt;

                            if (prevDay && prevDay.date === newDay.date) {
                                const prevMealsJson = JSON.stringify(prevDay.meals || []);
                                const newMealsJson = JSON.stringify(newDay.meals || []);
                                const prevTrainingsJson = JSON.stringify(prevDay.trainings || []);
                                const newTrainingsJson = JSON.stringify(newDay.trainings || []);
                                const prevSupplementsPlanned = JSON.stringify(prevDay.supplementsPlanned || []);
                                const newSupplementsPlanned = JSON.stringify(newDay.supplementsPlanned || []);
                                const prevSupplementsTaken = JSON.stringify(prevDay.supplementsTaken || []);
                                const newSupplementsTaken = JSON.stringify(newDay.supplementsTaken || []);

                                const isSameContent =
                                    prevMealsJson === newMealsJson &&
                                    prevTrainingsJson === newTrainingsJson &&
                                    prevDay.waterMl === newDay.waterMl &&
                                    prevDay.steps === newDay.steps &&
                                    prevDay.weightMorning === newDay.weightMorning &&
                                    // Утренние оценки из чек-ина
                                    prevDay.moodMorning === newDay.moodMorning &&
                                    prevDay.wellbeingMorning === newDay.wellbeingMorning &&
                                    prevDay.stressMorning === newDay.stressMorning &&
                                    // Витамины/добавки
                                    prevSupplementsPlanned === newSupplementsPlanned &&
                                    prevSupplementsTaken === newSupplementsTaken &&
                                    // Данные сна — без проверки state не обновляется при сохранении через StepModal
                                    prevDay.sleepStart === newDay.sleepStart &&
                                    prevDay.sleepEnd === newDay.sleepEnd &&
                                    prevDay.sleepHours === newDay.sleepHours &&
                                    prevDay.sleepQuality === newDay.sleepQuality;

                                if (isSameContent) {
                                    return prevDay;
                                }
                            }
                            return newDay;
                        });
                    }
                }
            };

            // Слушаем явное событие обновления дня (от StepModal, Morning Check-in)
            global.addEventListener('heys:day-updated', handleDayUpdated);

            return () => {
                global.removeEventListener('heys:day-updated', handleDayUpdated);
                if (dayUpdateLogTimerRef.current) {
                    clearTimeout(dayUpdateLogTimerRef.current);
                    dayUpdateLogTimerRef.current = null;
                }
            };
        }, [date]);

        // v25.8.6.7: Export addMealDirect — direct React state update for external callers
        // Used by meal rec card instead of unreliable event dispatch pipeline
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};

            /**
             * Add a meal directly to day state + localStorage (synchronous).
             * Mirrors the pattern from heys_day_meal_handlers.js addMeal onComplete.
             * @param {Object} newMeal - Meal object from MealStep.showAddMeal onComplete
             * @returns {boolean} success
             */
            HEYS.Day.addMealDirect = (newMeal) => {
                if (!newMeal || !newMeal.id) {
                    console.warn('[HEYS.Day.addMealDirect] ❌ Invalid meal:', newMeal);
                    return false;
                }

                const newUpdatedAt = Date.now();
                lastLoadedUpdatedAtRef.current = newUpdatedAt;
                blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                setDay(prevDay => {
                    const newMeals = [...(prevDay.meals || []), newMeal];
                    const newDayData = { ...prevDay, meals: newMeals, updatedAt: newUpdatedAt };
                    const key = 'heys_dayv2_' + (prevDay.date || date);
                    try {
                        lsSet(key, newDayData);
                    } catch (e) {
                        console.error('[HEYS.Day.addMealDirect] ❌ lsSet failed:', e);
                    }
                    return newDayData;
                });

                console.info('[HEYS.Day.addMealDirect] ✅ Meal added:', newMeal.name, 'id=' + newMeal.id);
                return true;
            };

            return () => {
                if (HEYS.Day && HEYS.Day.addMealDirect) {
                    delete HEYS.Day.addMealDirect;
                }
            };
        }, [date]);
    }

    function useDayBootEffects() {
        const React = getReact();
        // Twemoji: reparse emoji on mount only (subsequent reparses handled by useTwemojiEffect on tab change)
        React.useEffect(() => {
            if (global.scheduleTwemojiParse) global.scheduleTwemojiParse();
        }, []); // eslint-disable-line react-hooks/exhaustive-deps

        // Трекинг просмотра дня (только один раз)
        React.useEffect(() => {
            if (global.HEYS && global.HEYS.analytics) {
                global.HEYS.analytics.trackDataOperation('day-viewed');
            }
        }, []);
    }

    function useDayCurrentMinuteEffect(deps) {
        const React = getReact();
        const { setCurrentMinute } = deps || {};
        React.useEffect(() => {
            const intervalId = setInterval(() => {
                setCurrentMinute(Math.floor(Date.now() / 60000));
            }, 60000); // Обновляем каждую минуту
            return () => clearInterval(intervalId);
        }, []);
    }

    function useDayThemeEffect(deps) {
        const React = getReact();
        const { theme, resolvedTheme } = deps || {};
        React.useEffect(() => {
            document.documentElement.setAttribute('data-theme', resolvedTheme);
            try {
                const U = global.HEYS?.utils || {};
                if (global.HEYS?.store?.set) {
                    global.HEYS.store.set('heys_theme', theme);
                } else if (U.lsSet) {
                    U.lsSet('heys_theme', theme);
                } else {
                    localStorage.setItem('heys_theme', theme);
                }
            } catch (e) {
                // QuotaExceeded — игнорируем, тема применится через data-theme
            }

            if (theme !== 'auto') return;

            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = () => {
                document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
            };
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }, [theme, resolvedTheme]);
    }

    function useDayExportsEffects(deps) {
        const React = getReact();
        const {
            currentStreak,
            addMeal,
            addWater,
            addProductToMeal,
            day,
            pIndex,
            getMealType,
            getMealQualityScore,
            safeMeals
        } = deps || {};

        // Экспорт getStreak для использования в gamification модуле
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.getStreak = () => currentStreak;

            // Dispatch событие чтобы GamificationBar мог обновить streak
            window.dispatchEvent(new CustomEvent('heysDayStreakUpdated', {
                detail: { streak: currentStreak }
            }));

            // ✅ Проверяем streak-достижения при каждом обновлении streak
            // 🔒 v4.0: Не выдаём ачивки во время loading phase
            if (HEYS.game?.checkStreakAchievements && !HEYS.game?.isLoadingPhase) {
                HEYS.game.checkStreakAchievements(currentStreak);
            }

            // Confetti при streak 3, 5, 7
            // 🔒 v4.0: Не показываем конфетти при загрузке
            if ([3, 5, 7].includes(currentStreak) && HEYS.game && HEYS.game.celebrate && !HEYS.game?.isLoadingPhase) {
                HEYS.game.celebrate();
            }

            return () => {
                if (HEYS.Day && HEYS.Day.getStreak) {
                    delete HEYS.Day.getStreak;
                }
            };
        }, [currentStreak]);

        // Экспорт addMeal для PWA shortcuts и внешних вызовов
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addMeal = addMeal;
            return () => {
                if (HEYS.Day && HEYS.Day.addMeal === addMeal) {
                    delete HEYS.Day.addMeal;
                }
            };
        }, [addMeal]);

        // Экспорт addWater для внешних вызовов (например, FAB на вкладке Виджеты)
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addWater = addWater;
            return () => {
                if (HEYS.Day && HEYS.Day.addWater === addWater) {
                    delete HEYS.Day.addWater;
                }
            };
        }, [addWater]);

        // Экспорт addProductToMeal как публичный API
        // Позволяет добавлять продукт в приём извне: HEYS.Day.addProductToMeal(mealIndex, product, grams?)
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addProductToMeal = (mi, product, grams) => {
                // Валидация
                if (typeof mi !== 'number' || mi < 0) {
                    console.warn('[HEYS.Day.addProductToMeal] Invalid meal index:', mi);
                    return false;
                }
                if (!product || !product.name) {
                    console.warn('[HEYS.Day.addProductToMeal] Invalid product:', product);
                    return false;
                }
                // Добавляем продукт
                const productWithGrams = grams ? { ...product, grams } : product;
                addProductToMeal(mi, productWithGrams);
                return true;
            };
            return () => {
                if (HEYS.Day) delete HEYS.Day.addProductToMeal;
            };
        }, [addProductToMeal]);

        // Экспорт getMealQualityScore и getMealType как публичный API для advice модуля
        // getMealTypeByMeal — wrapper с текущим контекстом (meals и pIndex)
        React.useEffect(() => {
            HEYS.getMealQualityScore = getMealQualityScore;
            // Wrapper: принимает meal объект, находит его индекс и вызывает с полным контекстом
            HEYS.getMealType = (meal) => {
                if (!meal) return { type: 'snack', name: 'Перекус', icon: '🍎' };
                const allMeals = day.meals || [];
                // Если передали только time (string), находим meal по времени
                if (typeof meal === 'string') {
                    const foundMeal = allMeals.find(m => m.time === meal);
                    if (!foundMeal) return { type: 'snack', name: 'Перекус', icon: '🍎' };
                    const idx = allMeals.indexOf(foundMeal);
                    return getMealType(idx, foundMeal, allMeals, pIndex);
                }
                // Если передали meal объект
                const idx = allMeals.findIndex(m => m.id === meal.id || m.time === meal.time);
                if (idx === -1) return { type: 'snack', name: 'Перекус', icon: '🍎' };
                return getMealType(idx, meal, allMeals, pIndex);
            };
            return () => {
                delete HEYS.getMealQualityScore;
                delete HEYS.getMealType;
            };
        }, [safeMeals, pIndex]);
    }

    // PERF v8.1: Lightweight re-render trigger for deferred modules
    // When deferred modules (CascadeCard, MealRecCard, Supplements) finish loading,
    // they dispatch 'heys-deferred-module-loaded' instead of 'heys:day-updated'.
    // This avoids full day data reload (setDay) — just triggers UI re-render
    // so deferredSlot sees module readiness and swaps skeleton → content.
    function useDeferredModuleEffect() {
        const React = getReact();
        const [, setDeferredTick] = React.useState(0);

        React.useEffect(() => {
            const handleModuleLoaded = (e) => {
                const mod = e.detail?.module || 'unknown';
                console.info('[HEYS.day] 🧩 Deferred module loaded:', mod);
                setDeferredTick(c => c + 1);
            };
            window.addEventListener('heys-deferred-module-loaded', handleModuleLoaded);
            return () => window.removeEventListener('heys-deferred-module-loaded', handleModuleLoaded);
        }, []);
    }

    HEYS.dayEffects = {
        useDaySyncEffects,
        useDayBootEffects,
        useDeferredModuleEffect,
        useDayCurrentMinuteEffect,
        useDayThemeEffect,
        useDayExportsEffects
    };

})(window);

// === heys_day_training_handlers.js ===
// heys_day_training_handlers.js — Training picker + zone/household popups handlers
// Phase 10.2 of HEYS Day v12 refactoring
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    if (!HEYS.dayUtils) {
        throw new Error('[heys_day_training_handlers] HEYS.dayUtils is required. Ensure heys_day_utils.js is loaded first.');
    }

    const { pad2, wheelIndexToHour, hourToWheelIndex } = HEYS.dayUtils;

    function createTrainingHandlers(deps) {
        const {
            day,
            date,
            TR,
            zoneMinutesValues,
            visibleTrainings,
            setVisibleTrainings,
            updateTraining,
            lsGet,
            haptic,
            getSmartPopupPosition,
            setZonePickerTarget,
            zonePickerTarget,
            setPendingZoneMinutes,
            setShowZonePicker,
            setZoneFormulaPopup,
            setHouseholdFormulaPopup,
            setShowTrainingPicker,
            setTrainingPickerStep,
            setEditingTrainingIndex,
            setPendingTrainingTime,
            setPendingTrainingType,
            setPendingTrainingZones,
            setPendingTrainingQuality,
            setPendingTrainingFeelAfter,
            setPendingTrainingComment,
            setDay,
            trainingPickerStep,
            pendingTrainingTime,
            pendingTrainingZones,
            pendingTrainingType,
            pendingTrainingQuality,
            pendingTrainingFeelAfter,
            pendingTrainingComment,
            editingTrainingIndex
        } = deps;

        const hapticFn = typeof haptic === 'function' ? haptic : HEYS.dayUtils.haptic || (() => { });

        const zoneNames = ['Восстановление', 'Жиросжигание', 'Аэробная', 'Анаэробная'];
        const POPUP_WIDTH = 240;
        const POPUP_HEIGHT = 220;

        function openZonePicker(trainingIndex, zoneIndex) {
            const T = TR[trainingIndex] || { z: [0, 0, 0, 0] };
            const currentMinutes = +T.z[zoneIndex] || 0;
            setZonePickerTarget({ trainingIndex, zoneIndex });
            setPendingZoneMinutes(currentMinutes);
            setShowZonePicker(true);
        }

        function confirmZonePicker() {
            if (zonePickerTarget) {
                updateTraining(zonePickerTarget.trainingIndex, zonePickerTarget.zoneIndex, pendingZoneMinutes);
            }
            setShowZonePicker(false);
            setZonePickerTarget(null);
        }

        function cancelZonePicker() {
            setShowZonePicker(false);
            setZonePickerTarget(null);
        }

        function showZoneFormula(trainingIndex, zoneIndex, event) {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            const pos = getSmartPopupPosition(
                rect.left + rect.width / 2,
                rect.bottom,
                POPUP_WIDTH,
                POPUP_HEIGHT,
                { offset: 8 }
            );
            setZoneFormulaPopup({
                ti: trainingIndex,
                zi: zoneIndex,
                left: pos.left,
                top: pos.top,
                showAbove: pos.showAbove
            });
        }

        function closeZoneFormula() {
            setZoneFormulaPopup(null);
        }

        function showHouseholdFormula(householdIndex, event) {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            const pos = getSmartPopupPosition(
                rect.left + rect.width / 2,
                rect.bottom,
                POPUP_WIDTH,
                POPUP_HEIGHT,
                { offset: 8 }
            );
            setHouseholdFormulaPopup({
                hi: householdIndex,
                left: pos.left,
                top: pos.top,
                showAbove: pos.showAbove
            });
        }

        function closeHouseholdFormula() {
            setHouseholdFormulaPopup(null);
        }

        function openTrainingPicker(trainingIndex) {
            if (HEYS.TrainingStep?.show) {
                HEYS.TrainingStep.show({
                    dateKey: date,
                    trainingIndex,
                    onComplete: () => {
                        const savedDay = lsGet(`heys_dayv2_${date}`, {});
                        const savedTrainings = savedDay.trainings || [];
                        setDay(prev => ({
                            ...prev,
                            trainings: savedTrainings,
                            updatedAt: Date.now()
                        }));
                        const validCount = savedTrainings.filter(t => t && t.z && t.z.some(v => +v > 0)).length;
                        setVisibleTrainings(validCount);
                    }
                });
                return;
            }

            const now = new Date();
            const T = TR[trainingIndex] || { z: [0, 0, 0, 0], time: '', type: '', mood: 5, wellbeing: 5, stress: 5, comment: '' };

            if (T.time) {
                const [h, m] = T.time.split(':').map(Number);
                setPendingTrainingTime({ hours: hourToWheelIndex(h || 10), minutes: m || 0 });
            } else {
                setPendingTrainingTime({ hours: hourToWheelIndex(now.getHours()), minutes: now.getMinutes() });
            }

            setPendingTrainingType(T.type || 'cardio');

            const zones = T.z || [0, 0, 0, 0];
            const zoneIndices = zones.map(minutes => {
                const idx = zoneMinutesValues.indexOf(String(minutes));
                return idx >= 0 ? idx : 0;
            });
            setPendingTrainingZones(zoneIndices);

            setPendingTrainingQuality(T.quality || 0);
            setPendingTrainingFeelAfter(T.feelAfter || 0);
            setPendingTrainingComment(T.comment || '');

            setTrainingPickerStep(1);
            setEditingTrainingIndex(trainingIndex);
            setShowTrainingPicker(true);
        }

        function confirmTrainingPicker() {
            if (trainingPickerStep === 1) {
                setTrainingPickerStep(2);
                return;
            }

            if (trainingPickerStep === 2) {
                const totalMinutes = pendingTrainingZones.reduce(
                    (sum, idx) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0),
                    0
                );
                if (totalMinutes === 0) {
                    hapticFn('error');
                    const zonesSection = document.querySelector('.training-zones-section');
                    if (zonesSection) {
                        zonesSection.classList.add('shake');
                        setTimeout(() => zonesSection.classList.remove('shake'), 500);
                    }
                    return;
                }
                setTrainingPickerStep(3);
                return;
            }

            const realHours = wheelIndexToHour(pendingTrainingTime.hours);
            const timeStr = pad2(realHours) + ':' + pad2(pendingTrainingTime.minutes);
            const zoneMinutes = pendingTrainingZones.map(idx => parseInt(zoneMinutesValues[idx], 10) || 0);

            const existingTrainings = day.trainings || [];
            const newTrainings = [...existingTrainings];
            const idx = editingTrainingIndex;

            while (newTrainings.length <= idx) {
                newTrainings.push({ z: [0, 0, 0, 0], time: '', type: '', mood: 5, wellbeing: 5, stress: 5, comment: '' });
            }

            newTrainings[idx] = {
                ...newTrainings[idx],
                z: zoneMinutes,
                time: timeStr,
                type: pendingTrainingType,
                mood: pendingTrainingQuality || 5,
                wellbeing: pendingTrainingFeelAfter || 5,
                stress: 5,
                comment: pendingTrainingComment
            };

            setDay(prev => ({ ...prev, trainings: newTrainings, updatedAt: Date.now() }));
            setShowTrainingPicker(false);
            setTrainingPickerStep(1);
            setEditingTrainingIndex(null);
        }

        function cancelTrainingPicker() {
            if (trainingPickerStep === 3) {
                setTrainingPickerStep(2);
                return;
            }
            if (trainingPickerStep === 2) {
                setTrainingPickerStep(1);
                return;
            }

            const idx = editingTrainingIndex;
            const trainings = day.trainings || [];
            const training = trainings[idx];

            const isEmpty = !training || (
                (!training.z || training.z.every(z => z === 0)) &&
                !training.time &&
                !training.type
            );

            if (isEmpty && idx !== null && idx === visibleTrainings - 1) {
                setVisibleTrainings(prev => Math.max(0, prev - 1));
            }

            setShowTrainingPicker(false);
            setTrainingPickerStep(1);
            setEditingTrainingIndex(null);
        }

        return {
            openZonePicker,
            confirmZonePicker,
            cancelZonePicker,
            showZoneFormula,
            closeZoneFormula,
            showHouseholdFormula,
            closeHouseholdFormula,
            openTrainingPicker,
            confirmTrainingPicker,
            cancelTrainingPicker,
            zoneNames
        };
    }

    HEYS.dayTrainingHandlers = {
        createTrainingHandlers
    };

})(window);

// === heys_day_day_handlers.js ===
// heys_day_day_handlers.js — Day-level handlers (water, weight, steps, date, training)
// Phase 10.3 of HEYS Day v12 refactoring
// Extracted from heys_day_v12.js
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // Dependencies - explicit check instead of silent fallbacks
    if (!HEYS.dayUtils) {
        throw new Error('[heys_day_day_handlers] HEYS.dayUtils is required. Ensure heys_day_utils.js is loaded first.');
    }
    const { haptic, lsGet } = HEYS.dayUtils;

    /**
     * Create day-level handlers
     * @param {Object} deps - Dependencies
     * @returns {Object} Day handler functions
     */
    function createDayHandlers(deps) {
        const {
            setDay,
            day,
            date,
            prof,
            setShowWaterDrop,
            setWaterAddedAnim,
            showConfetti,
            setShowConfetti,
            waterGoal,
            setEditGramsTarget,
            setEditGramsValue,
            setGrams
        } = deps;

        /**
         * Open weight picker modal
         */
        function openWeightPicker() {
            if (HEYS.showCheckin && HEYS.showCheckin.weight) {
                HEYS.showCheckin.weight(date, (weightData) => {
                    // Мгновенное обновление UI через setDay
                    if (weightData && (weightData.weightKg !== undefined || weightData.weightG !== undefined)) {
                        const newWeight = (weightData.weightKg || 70) + (weightData.weightG || 0) / 10;
                        setDay(prev => ({ ...prev, weightMorning: newWeight, updatedAt: Date.now() }));
                    }
                });
            }
        }

        /**
         * Open steps goal picker
         */
        function openStepsGoalPicker() {
            if (HEYS.showCheckin && HEYS.showCheckin.steps) {
                HEYS.showCheckin.steps();
            }
        }

        /**
         * Open deficit picker
         */
        function openDeficitPicker() {
            // Используем StepModal вместо старого пикера
            if (HEYS.showCheckin && HEYS.showCheckin.deficit) {
                HEYS.showCheckin.deficit(date, (stepData) => {
                    // Мгновенное обновление UI через setDay
                    // stepData = { deficit: { deficit: -15, dateKey: '...' } }
                    const deficitValue = stepData?.deficit?.deficit;
                    if (deficitValue !== undefined) {
                        setDay(prev => ({ ...prev, deficitPct: deficitValue, updatedAt: Date.now() }));
                    }
                });
            }
        }

        /**
         * Add water with animation
         * @param {number} ml - Milliliters to add
         * @param {boolean} skipScroll - Skip scroll to water card
         */
        function addWater(ml, skipScroll = false) {
            // 🔒 Read-only gating
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast('Добавление воды недоступно');
                return;
            }

            // Сначала прокручиваем к карточке воды (если вызвано из FAB)
            const waterCardEl = document.getElementById('water-card');
            if (!skipScroll && waterCardEl) {
                waterCardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Задержка для завершения скролла перед анимацией
                setTimeout(() => runWaterAnimation(ml), 400);
                return;
            }
            runWaterAnimation(ml);
        }

        /**
         * Internal water animation runner
         */
        function runWaterAnimation(ml) {
            const newWater = (day.waterMl || 0) + ml;
            setDay(prev => ({ ...prev, waterMl: (prev.waterMl || 0) + ml, lastWaterTime: Date.now(), updatedAt: Date.now() }));

            // 💧 Анимация падающей капли (длиннее для плавности)
            if (setShowWaterDrop) {
                setShowWaterDrop(true);
                setTimeout(() => setShowWaterDrop(false), 1200);
            }

            // Анимация feedback
            if (setWaterAddedAnim) {
                setWaterAddedAnim('+' + ml);
            }
            haptic('light');

            // 🎮 XP: Dispatch для gamification
            window.dispatchEvent(new CustomEvent('heysWaterAdded', { detail: { ml, total: newWater } }));

            // 🎉 Celebration при достижении цели (переиспользуем confetti от калорий)
            const prevWater = day.waterMl || 0;
            if (waterGoal && newWater >= waterGoal && prevWater < waterGoal && !showConfetti && setShowConfetti) {
                setShowConfetti(true);
                haptic('success');
                setTimeout(() => setShowConfetti(false), 2000);
            }

            // Скрыть анимацию
            if (setWaterAddedAnim) {
                setTimeout(() => setWaterAddedAnim(null), 800);
            }
        }

        /**
         * Remove water (для исправления ошибок)
         */
        function removeWater(ml) {
            const newWater = Math.max(0, (day.waterMl || 0) - ml);
            setDay(prev => ({ ...prev, waterMl: Math.max(0, (prev.waterMl || 0) - ml), updatedAt: Date.now() }));
            haptic('light');
        }

        /**
         * Open household activity picker
         */
        function openHouseholdPicker(mode = 'add', editIndex = null) {
            const dateKey = date; // ключ дня (YYYY-MM-DD)
            if (HEYS.StepModal) {
                // Выбираем шаги в зависимости от режима
                let steps, title;
                if (mode === 'stats') {
                    steps = ['household_stats'];
                    title = '📊 Статистика активности';
                } else if (mode === 'edit' && editIndex !== null) {
                    steps = ['household_minutes'];
                    title = '🏠 Редактирование';
                } else {
                    steps = ['household_minutes'];
                    title = '🏠 Добавить активность';
                }

                HEYS.StepModal.show({
                    steps,
                    title,
                    showProgress: steps.length > 1,
                    showStreak: false,
                    showGreeting: false,
                    showTip: false,
                    finishLabel: 'Готово',
                    context: { dateKey, editIndex, mode },
                    onComplete: (stepData) => {
                        // Обновляем локальное состояние из сохранённых данных
                        const savedDay = lsGet(`heys_dayv2_${dateKey}`, {});
                        setDay(prev => ({
                            ...prev,
                            householdActivities: savedDay.householdActivities || [],
                            // Legacy fields для backward compatibility
                            householdMin: savedDay.householdMin || 0,
                            householdTime: savedDay.householdTime || '',
                            updatedAt: Date.now()
                        }));
                    }
                });
            }
        }

        /**
         * Open edit grams modal
         */
        function openEditGramsModal(mealIndex, itemId, currentGrams, product) {
            if (HEYS.AddProductStep?.showEditGrams) {
                HEYS.AddProductStep.showEditGrams({
                    product,
                    currentGrams: currentGrams || 100,
                    mealIndex,
                    itemId,
                    dateKey: date,
                    onSave: ({ mealIndex: mi, itemId: id, grams }) => {
                        if (setGrams) setGrams(mi, id, grams);
                    }
                });
            } else {
                // Fallback на старую модалку (если AddProductStep не загружен)
                if (setEditGramsTarget) setEditGramsTarget({ mealIndex, itemId, product });
                if (setEditGramsValue) setEditGramsValue(currentGrams || 100);
            }
        }

        /**
         * Confirm edit grams modal
         */
        function confirmEditGramsModal(editGramsTarget, editGramsValue) {
            if (editGramsTarget && editGramsValue > 0 && setGrams) {
                setGrams(editGramsTarget.mealIndex, editGramsTarget.itemId, editGramsValue);
            }
            if (setEditGramsTarget) setEditGramsTarget(null);
            if (setEditGramsValue) setEditGramsValue(100);
        }

        /**
         * Cancel edit grams modal
         */
        function cancelEditGramsModal() {
            if (setEditGramsTarget) setEditGramsTarget(null);
            if (setEditGramsValue) setEditGramsValue(100);
        }

        /**
         * Update training zone minutes
         */
        function updateTraining(i, zi, mins) {
            setDay(prevDay => {
                const arr = (prevDay.trainings || []).map((t, idx) => {
                    if (idx !== i) return t;
                    return {
                        ...t,  // сохраняем time, type и другие поля
                        z: t.z.map((v, j) => j === zi ? (+mins || 0) : v)
                    };
                });
                return { ...prevDay, trainings: arr, updatedAt: Date.now() };
            });
        }

        /**
         * Open training picker
         */
        function openTrainingPicker(mode = 'add', editIndex = null) {
            if (HEYS.TrainingStep) {
                const dateKey = date;
                HEYS.TrainingStep.show({
                    dateKey,
                    mode,
                    editIndex,
                    onComplete: (stepData) => {
                        // Обновляем локальное состояние из сохранённых данных
                        const savedDay = lsGet(`heys_dayv2_${dateKey}`, {});
                        setDay(prev => ({
                            ...prev,
                            trainings: savedDay.trainings || [],
                            updatedAt: Date.now()
                        }));
                    }
                });
            }
        }

        return {
            // Weight & Stats
            openWeightPicker,
            openStepsGoalPicker,
            openDeficitPicker,

            // Water
            addWater,
            removeWater,
            runWaterAnimation,

            // Household
            openHouseholdPicker,

            // Grams editing
            openEditGramsModal,
            confirmEditGramsModal,
            cancelEditGramsModal,

            // Training
            updateTraining,
            openTrainingPicker
        };
    }

    // Export module
    HEYS.dayDayHandlers = {
        createDayHandlers
    };

})(window);

// === heys_day_handlers_bundle_v1.js ===
// heys_day_handlers_bundle_v1.js — DayTab handlers + water anim/presets bundle

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    HEYS.dayHandlersBundle = HEYS.dayHandlersBundle || {};

    HEYS.dayHandlersBundle.useDayHandlersBundle = function useDayHandlersBundle(ctx) {
        const React = ctx.React || global.React;
        const heysRef = ctx.HEYS || HEYS;

        // Вспомогательная функция: моментальная прокрутка к заголовку дневника
        const scrollToDiaryHeading = React.useCallback(() => {
            setTimeout(() => {
                const heading = document.getElementById('diary-heading');
                if (heading) {
                    heading.scrollIntoView({ behavior: 'auto', block: 'start' });
                }
            }, 50);
        }, []);

        // Track newly added items for fly-in animation
        const [newItemIds, setNewItemIds] = React.useState(new Set());

        // === Water Tracking Animation States ===
        const [waterAddedAnim, setWaterAddedAnim] = React.useState(null); // для анимации "+200"
        const [showWaterDrop, setShowWaterDrop] = React.useState(false); // анимация падающей капли

        // Быстрые пресеты воды
        const waterPresets = [
            { ml: 100, label: '100 мл', icon: '💧' },
            { ml: 200, label: 'Стакан', icon: '🥛' },
            { ml: 330, label: 'Бутылка', icon: '🧴' },
            { ml: 500, label: '0.5л', icon: '🍶' }
        ];

        // === Meal handlers (extracted) ===
        const mealHandlers = heysRef.dayMealHandlers.createMealHandlers({
            setDay: ctx.setDay,
            expandOnlyMeal: ctx.expandOnlyMeal,
            date: ctx.date,
            products: ctx.products,
            day: ctx.day,
            prof: ctx.prof,
            pIndex: ctx.pIndex,
            getProductFromItem: ctx.getProductFromItem,
            isMobile: ctx.isMobile,
            openTimePickerForNewMeal: ctx.openTimePickerForNewMeal,
            scrollToDiaryHeading,
            lastLoadedUpdatedAtRef: ctx.lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef: ctx.blockCloudUpdatesUntilRef,
            newItemIds,
            setNewItemIds
        });

        React.useEffect(() => {
            if (ctx.updateMealTimeRef) {
                ctx.updateMealTimeRef.current = mealHandlers.updateMealTime;
            }
        }, [ctx.updateMealTimeRef, mealHandlers.updateMealTime]);

        // === Day-level handlers (weight/steps/deficit/water/household/edit grams/training zones) ===
        if (!heysRef.dayDayHandlers?.createDayHandlers) {
            throw new Error('[heys_day_handlers_bundle_v1] HEYS.dayDayHandlers not loaded');
        }
        const dayHandlers = heysRef.dayDayHandlers.createDayHandlers({
            setDay: ctx.setDay,
            day: ctx.day,
            date: ctx.date,
            prof: ctx.prof,
            setShowWaterDrop,
            setWaterAddedAnim,
            showConfetti: ctx.showConfetti,
            setShowConfetti: ctx.setShowConfetti,
            waterGoal: ctx.waterGoal,
            setEditGramsTarget: ctx.setEditGramsTarget,
            setEditGramsValue: ctx.setEditGramsValue,
            setGrams: mealHandlers.setGrams
        });

        // === Training handlers (Phase 10) ===
        if (!heysRef.dayTrainingHandlers?.createTrainingHandlers) {
            throw new Error('[heys_day_handlers_bundle_v1] HEYS.dayTrainingHandlers not loaded');
        }
        const trainingHandlers = heysRef.dayTrainingHandlers.createTrainingHandlers({
            day: ctx.day,
            date: ctx.date,
            TR: ctx.TR,
            zoneMinutesValues: ctx.zoneMinutesValues,
            visibleTrainings: ctx.visibleTrainings,
            setVisibleTrainings: ctx.setVisibleTrainings,
            updateTraining: dayHandlers.updateTraining,
            lsGet: ctx.lsGet,
            haptic: ctx.haptic,
            getSmartPopupPosition: ctx.getSmartPopupPosition,
            setZonePickerTarget: ctx.setZonePickerTarget,
            zonePickerTarget: ctx.zonePickerTarget,
            pendingZoneMinutes: ctx.pendingZoneMinutes,
            setPendingZoneMinutes: ctx.setPendingZoneMinutes,
            setShowZonePicker: ctx.setShowZonePicker,
            setZoneFormulaPopup: ctx.setZoneFormulaPopup,
            setHouseholdFormulaPopup: ctx.setHouseholdFormulaPopup,
            setShowTrainingPicker: ctx.setShowTrainingPicker,
            setTrainingPickerStep: ctx.setTrainingPickerStep,
            setEditingTrainingIndex: ctx.setEditingTrainingIndex,
            setPendingTrainingTime: ctx.setPendingTrainingTime,
            setPendingTrainingType: ctx.setPendingTrainingType,
            setPendingTrainingZones: ctx.setPendingTrainingZones,
            setPendingTrainingQuality: ctx.setPendingTrainingQuality,
            setPendingTrainingFeelAfter: ctx.setPendingTrainingFeelAfter,
            setPendingTrainingComment: ctx.setPendingTrainingComment,
            setDay: ctx.setDay,
            trainingPickerStep: ctx.trainingPickerStep,
            pendingTrainingTime: ctx.pendingTrainingTime,
            pendingTrainingZones: ctx.pendingTrainingZones,
            pendingTrainingType: ctx.pendingTrainingType,
            pendingTrainingQuality: ctx.pendingTrainingQuality,
            pendingTrainingFeelAfter: ctx.pendingTrainingFeelAfter,
            pendingTrainingComment: ctx.pendingTrainingComment,
            editingTrainingIndex: ctx.editingTrainingIndex
        });

        return {
            waterPresets,
            waterAddedAnim,
            showWaterDrop,
            setWaterAddedAnim,
            setShowWaterDrop,
            mealHandlers,
            dayHandlers,
            trainingHandlers
        };
    };
})(window);


/* ===== heys_day_utils.js ===== */
// heys_day_utils.js — Day utilities: date/time, storage, calculations

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  // Создаём namespace для утилит дня
  HEYS.dayUtils = {};

  // === Deleted Products Ignore List v2.0 ===
  // Персистентный список удалённых продуктов — чтобы autoRecover и cloud sync не восстанавливали их
  // Ключ localStorage: heys_deleted_products_ignore_list
  // Формат v2: { entries: { [key]: { name, id?, deletedAt, fingerprint? } }, version: 2 }
  const DELETED_PRODUCTS_KEY = 'heys_deleted_products_ignore_list';
  const DELETED_PRODUCTS_VERSION = 2;
  const DELETED_PRODUCTS_TTL_DAYS = 90; // Автоочистка через 90 дней

  /**
   * Загружаем игнор-лист из localStorage при инициализации
   * Поддерживает миграцию с v1 (Set) на v2 (Object с метаданными)
   */
  function loadDeletedProductsList() {
    try {
      const stored = localStorage.getItem(DELETED_PRODUCTS_KEY);
      if (!stored) return { entries: {}, version: DELETED_PRODUCTS_VERSION };

      const parsed = JSON.parse(stored);

      // Миграция с v1 (массив строк) на v2 (объект с метаданными)
      if (Array.isArray(parsed)) {
        const now = Date.now();
        const migrated = { entries: {}, version: DELETED_PRODUCTS_VERSION };
        parsed.forEach(key => {
          if (key) {
            migrated.entries[String(key).toLowerCase()] = {
              name: key,
              deletedAt: now,
              _migratedFromV1: true
            };
          }
        });
        console.log(`[HEYS] 🔄 Мигрировано ${Object.keys(migrated.entries).length} записей игнор-листа v1 → v2`);
        saveDeletedProductsData(migrated);
        return migrated;
      }

      // v2 формат
      if (parsed.version === DELETED_PRODUCTS_VERSION && parsed.entries) {
        return parsed;
      }

      return { entries: {}, version: DELETED_PRODUCTS_VERSION };
    } catch (e) {
      console.warn('[HEYS] Ошибка загрузки deleted products list:', e);
      return { entries: {}, version: DELETED_PRODUCTS_VERSION };
    }
  }

  /**
   * Сохраняем игнор-лист в localStorage
   */
  function saveDeletedProductsData(data) {
    try {
      localStorage.setItem(DELETED_PRODUCTS_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[HEYS] Ошибка сохранения deleted products list:', e);
    }
  }

  // In-memory кэш игнор-листа
  let deletedProductsData = loadDeletedProductsList();

  /**
   * Нормализация ключа для игнор-листа (lowercase, trim, collapse spaces)
   */
  function normalizeDeletedKey(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Автоочистка устаревших записей (старше TTL)
   */
  function cleanupExpiredEntries() {
    const now = Date.now();
    const ttlMs = DELETED_PRODUCTS_TTL_DAYS * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [key, entry] of Object.entries(deletedProductsData.entries)) {
      if (entry.deletedAt && (now - entry.deletedAt) > ttlMs) {
        delete deletedProductsData.entries[key];
        removed++;
      }
    }

    if (removed > 0) {
      saveDeletedProductsData(deletedProductsData);
      console.log(`[HEYS] 🧹 Очищено ${removed} устаревших записей из игнор-листа (TTL: ${DELETED_PRODUCTS_TTL_DAYS} дней)`);
    }

    return removed;
  }

  // Автоочистка при загрузке
  cleanupExpiredEntries();

  // === API для управления игнор-листом удалённых продуктов ===
  HEYS.deletedProducts = {
    /**
     * Добавить продукт в игнор-лист (при удалении)
     * @param {string} name - Название продукта
     * @param {string} [id] - ID продукта (опционально)
     * @param {string} [fingerprint] - Fingerprint продукта (опционально)
     */
    add(name, id, fingerprint) {
      if (!name) return;
      const key = normalizeDeletedKey(name);
      const now = Date.now();

      deletedProductsData.entries[key] = {
        name: name,
        id: id || null,
        fingerprint: fingerprint || null,
        deletedAt: now
      };

      // Также добавляем по ID и fingerprint для быстрого поиска
      if (id) {
        deletedProductsData.entries[String(id)] = {
          name: name,
          id: id,
          fingerprint: fingerprint || null,
          deletedAt: now,
          _isIdKey: true
        };
      }
      if (fingerprint) {
        deletedProductsData.entries[String(fingerprint)] = {
          name: name,
          id: id || null,
          fingerprint: fingerprint,
          deletedAt: now,
          _isFingerprintKey: true
        };
      }

      saveDeletedProductsData(deletedProductsData);
      console.log(`[HEYS] 🚫 Продукт добавлен в игнор-лист: "${name}"${id ? ` (id: ${id.slice(0, 8)}...)` : ''}`);

      // Диспатчим событие для синхронизации с облаком
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:deleted-products-changed', {
          detail: { action: 'add', name, id, fingerprint }
        }));
      }
    },

    /**
     * Проверить, удалён ли продукт (по имени, ID или fingerprint)
     * @param {string} nameOrIdOrFingerprint - Название, ID или fingerprint продукта
     * @returns {boolean}
     */
    isDeleted(nameOrIdOrFingerprint) {
      if (!nameOrIdOrFingerprint) return false;
      const key = normalizeDeletedKey(nameOrIdOrFingerprint);
      return !!deletedProductsData.entries[key] || !!deletedProductsData.entries[String(nameOrIdOrFingerprint)];
    },

    /**
     * Проверить продукт по всем полям (имя, ID, fingerprint)
     * @param {Object} product - Объект продукта
     * @returns {boolean}
     */
    isProductDeleted(product) {
      if (!product) return false;
      if (product.name && this.isDeleted(product.name)) return true;
      if (product.id && this.isDeleted(product.id)) return true;
      if (product.product_id && this.isDeleted(product.product_id)) return true;
      if (product.fingerprint && this.isDeleted(product.fingerprint)) return true;
      return false;
    },

    /**
     * Удалить продукт из игнор-листа (если пользователь снова добавил продукт с таким же именем)
     * @param {string} name - Название продукта
     * @param {string} [id] - ID продукта (опционально)
     * @param {string} [fingerprint] - Fingerprint продукта (опционально)
     */
    remove(name, id, fingerprint) {
      if (!name) return;
      const key = normalizeDeletedKey(name);
      delete deletedProductsData.entries[key];
      if (id) delete deletedProductsData.entries[String(id)];
      if (fingerprint) delete deletedProductsData.entries[String(fingerprint)];
      saveDeletedProductsData(deletedProductsData);
      console.info(`[HEYS] ✅ Продукт восстановлен из игнор-листа: "${name}"`);

      // 🪦 FIX v5.0.2: Также очищаем Store tombstone (heys_deleted_ids) при явном восстановлении.
      // Без этого tombstone из Store блокирует orphan recovery и merge sync,
      // и продукт не появляется в личной базе даже после восстановления из игнор-листа.
      try {
        const _storeTombstones = window.HEYS?.store?.get?.('heys_deleted_ids') || [];
        if (Array.isArray(_storeTombstones) && _storeTombstones.length > 0) {
          const normName = (n) => String(n || '').toLowerCase().trim();
          const nameNorm = normName(name);
          const before = _storeTombstones.length;
          const cleaned = _storeTombstones.filter(t => {
            if (id && t.id === id) return false;
            if (nameNorm && normName(t.name) === nameNorm) return false;
            return true;
          });
          if (cleaned.length < before) {
            window.HEYS.store.set('heys_deleted_ids', cleaned);
            console.info(`[HEYS] 🪦 Store tombstone очищен при восстановлении: "${name}" (${before}→${cleaned.length})`);
          }
        }
      } catch (e) {
        console.warn('[HEYS] ⚠️ Ошибка очистки Store tombstone:', e?.message);
      }

      // Диспатчим событие для обновления UI
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:deleted-products-changed', {
          detail: { action: 'remove', name, id, fingerprint }
        }));
      }
    },

    /**
     * Получить весь игнор-лист (только уникальные записи по name)
     * @returns {Array<{name: string, id?: string, fingerprint?: string, deletedAt: number}>}
     */
    getAll() {
      const unique = new Map();
      for (const [key, entry] of Object.entries(deletedProductsData.entries)) {
        // Пропускаем вспомогательные ключи (_isIdKey, _isFingerprintKey)
        if (entry._isIdKey || entry._isFingerprintKey) continue;
        unique.set(normalizeDeletedKey(entry.name), entry);
      }
      return Array.from(unique.values());
    },

    /**
     * Получить метаданные записи
     * @param {string} nameOrId - Название или ID продукта
     * @returns {Object|null}
     */
    getEntry(nameOrId) {
      if (!nameOrId) return null;
      const key = normalizeDeletedKey(nameOrId);
      return deletedProductsData.entries[key] || deletedProductsData.entries[String(nameOrId)] || null;
    },

    /**
     * Количество удалённых продуктов в игнор-листе (уникальных)
     * @returns {number}
     */
    count() {
      return this.getAll().length;
    },

    /**
     * Очистить игнор-лист (осторожно!)
     */
    clear() {
      const count = this.count();
      deletedProductsData = { entries: {}, version: DELETED_PRODUCTS_VERSION };
      saveDeletedProductsData(deletedProductsData);
      console.info(`[HEYS] Игнор-лист удалённых продуктов очищен (было ${count})`);

      // 🪦 FIX v5.0.2: При полной очистке тоже сбрасываем Store tombstones (heys_deleted_ids)
      try {
        if (window.HEYS?.store?.set) {
          window.HEYS.store.set('heys_deleted_ids', []);
          console.info('[HEYS] 🪦 Store tombstones (heys_deleted_ids) полностью очищены');
        }
      } catch (e) {
        console.warn('[HEYS] ⚠️ Ошибка очистки heys_deleted_ids:', e?.message);
      }

      // Диспатчим событие для обновления UI
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:deleted-products-changed', {
          detail: { action: 'clear', count }
        }));
      }
    },

    /**
     * Принудительная очистка устаревших записей
     * @returns {number} Количество удалённых записей
     */
    cleanup() {
      return cleanupExpiredEntries();
    },

    /**
     * Показать игнор-лист в консоли
     */
    log() {
      const all = this.getAll();
      if (all.length === 0) {
        console.log('✅ Игнор-лист удалённых продуктов пуст');
        return;
      }
      console.log(`🚫 Игнор-лист удалённых продуктов (${all.length}):`);
      const now = Date.now();
      all.forEach((entry, i) => {
        const daysAgo = Math.floor((now - entry.deletedAt) / (24 * 60 * 60 * 1000));
        const ttlRemaining = DELETED_PRODUCTS_TTL_DAYS - daysAgo;
        console.log(`  ${i + 1}. "${entry.name}" — удалён ${daysAgo}д назад (TTL: ${ttlRemaining}д)`);
      });
    },

    /**
     * Экспорт данных для cloud sync
     * @returns {Object}
     */
    exportForSync() {
      return {
        entries: deletedProductsData.entries,
        version: DELETED_PRODUCTS_VERSION,
        exportedAt: Date.now()
      };
    },

    /**
     * Импорт данных из cloud sync (merge с локальными)
     * @param {Object} cloudData - Данные из облака
     * @returns {number} Количество импортированных записей
     */
    importFromSync(cloudData) {
      if (!cloudData || !cloudData.entries) return 0;

      let imported = 0;
      for (const [key, entry] of Object.entries(cloudData.entries)) {
        // Мержим: если запись новее — заменяем
        const local = deletedProductsData.entries[key];
        if (!local || (entry.deletedAt > (local.deletedAt || 0))) {
          deletedProductsData.entries[key] = entry;
          imported++;
        }
      }

      if (imported > 0) {
        saveDeletedProductsData(deletedProductsData);
        console.log(`[HEYS] ☁️ Импортировано ${imported} записей игнор-листа из облака`);
      }

      return imported;
    },

    /**
     * Batch-очистка item'ов из дневника для удалённого продукта
     * @param {string} name - Название продукта
     * @param {Object} options - Опции
     * @returns {Promise<{daysAffected: number, itemsRemoved: number}>}
     */
    async purgeFromDiary(name, options = {}) {
      const { dryRun = false, maxDays = 365 } = options;

      if (!name) return { daysAffected: 0, itemsRemoved: 0 };

      const normalizedName = normalizeDeletedKey(name);
      const entry = this.getEntry(name);
      const productId = entry?.id;
      const fingerprint = entry?.fingerprint;

      const U = HEYS.utils || {};
      const lsGet = U.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      });
      const lsSet = U.lsSet || ((k, v) => localStorage.setItem(k, JSON.stringify(v)));

      // Собираем все ключи дней
      const keys = Object.keys(localStorage).filter(k => k.includes('_dayv2_'));

      let daysAffected = 0;
      let itemsRemoved = 0;

      for (const key of keys.slice(0, maxDays)) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;

          let day;
          if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) {
            day = HEYS.store.decompress(raw);
          } else {
            day = JSON.parse(raw);
          }

          if (!day || !Array.isArray(day.meals)) continue;

          let dayModified = false;

          for (const meal of day.meals) {
            if (!Array.isArray(meal.items)) continue;

            const beforeCount = meal.items.length;
            meal.items = meal.items.filter(item => {
              const itemName = normalizeDeletedKey(item.name);
              const itemId = String(item.product_id || item.productId || '');
              const itemFingerprint = item.fingerprint || '';

              // Проверяем совпадение по имени, ID или fingerprint
              if (itemName === normalizedName) return false;
              if (productId && itemId === String(productId)) return false;
              if (fingerprint && itemFingerprint === fingerprint) return false;

              return true;
            });

            if (meal.items.length < beforeCount) {
              dayModified = true;
              itemsRemoved += (beforeCount - meal.items.length);
            }
          }

          if (dayModified && !dryRun) {
            // Сохраняем изменённый день
            if (HEYS.store?.compress) {
              localStorage.setItem(key, HEYS.store.compress(day));
            } else {
              localStorage.setItem(key, JSON.stringify(day));
            }
            daysAffected++;
          } else if (dayModified) {
            daysAffected++;
          }
        } catch (e) {
          // Пропускаем битые записи
        }
      }

      if (itemsRemoved > 0) {
        console.log(`[HEYS] ${dryRun ? '🔍 [DRY RUN]' : '🗑️'} Удалено ${itemsRemoved} записей "${name}" из ${daysAffected} дней`);
      }

      return { daysAffected, itemsRemoved };
    },

    // Константы для внешнего использования
    TTL_DAYS: DELETED_PRODUCTS_TTL_DAYS,
    VERSION: DELETED_PRODUCTS_VERSION
  };

  // === Orphan Products Tracking ===
  // Отслеживание продуктов, для которых данные берутся из штампа вместо базы
  const orphanProductsMap = new Map(); // name => { name, usedInDays: Set, firstSeen }
  const orphanLoggedRecently = new Map(); // name => timestamp (throttle логов)

  function isSyntheticEstimatedItem(item) {
    if (!item || typeof item !== 'object') return false;
    const productId = String(item.product_id ?? item.productId ?? '');
    const itemId = String(item.id ?? '');
    const estimatedSource = String(item.estimatedSource ?? '');
    return !!(
      item.isEstimated ||
      item.virtualProduct ||
      item.skipProductRestore ||
      item.skipOrphanTracking ||
      estimatedSource === 'morning-checkin' ||
      productId.startsWith('estimated_') ||
      productId.startsWith('estimated_quickfill_') ||
      itemId.startsWith('estimated_')
    );
  }

  function trackOrphanProduct(item, dateStr) {
    if (!item || !item.name) return;
    if (isSyntheticEstimatedItem(item)) return;
    const name = String(item.name).trim();
    if (!name) return;

    if (!orphanProductsMap.has(name)) {
      orphanProductsMap.set(name, {
        name: name,
        usedInDays: new Set([dateStr]),
        firstSeen: Date.now(),
        hasInlineData: item.kcal100 != null
      });
      // Первое обнаружение — логируем с датой
      console.warn(`[HEYS] Orphan product: "${name}" — используются данные из штампа (день: ${dateStr || 'unknown'})`);
    } else {
      orphanProductsMap.get(name).usedInDays.add(dateStr);
    }
  }

  // API для просмотра orphan-продуктов
  HEYS.orphanProducts = {
    // Получить список всех orphan-продуктов
    getAll() {
      return Array.from(orphanProductsMap.values()).map(o => ({
        ...o,
        usedInDays: Array.from(o.usedInDays),
        daysCount: o.usedInDays.size
      }));
    },

    // Количество orphan-продуктов
    count() {
      return orphanProductsMap.size;
    },

    // Есть ли orphan-продукты?
    hasAny() {
      return orphanProductsMap.size > 0;
    },

    // Очистить (после синхронизации или исправления)
    clear() {
      orphanProductsMap.clear();
    },

    // Удалить конкретный по имени (если продукт добавили обратно в базу)
    remove(productName) {
      const name = String(productName || '').trim();
      if (name) {
        orphanProductsMap.delete(name);
        // Также пробуем lowercase
        orphanProductsMap.delete(name.toLowerCase());
      }
    },

    // Пересчитать orphan-продукты на основе актуальной базы
    // Вызывается после добавления продукта или удаления item из meal
    recalculate() {
      if (!global.HEYS?.products?.getAll) return;

      const products = global.HEYS.products.getAll();
      const productNames = new Set(
        products.map(p => String(p.name || '').trim().toLowerCase()).filter(Boolean)
      );

      const beforeCount = orphanProductsMap.size;

      // Удаляем из orphan те, что теперь есть в базе
      for (const [name] of orphanProductsMap) {
        if (productNames.has(name.toLowerCase())) {
          orphanProductsMap.delete(name);
        }
      }

      const afterCount = orphanProductsMap.size;

      // Если количество изменилось — диспатчим событие для обновления UI
      if (beforeCount !== afterCount && typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new CustomEvent('heys:orphan-updated', {
          detail: { count: afterCount, removed: beforeCount - afterCount }
        }));
      }
    },

    // Показать в консоли красивую таблицу
    log() {
      const all = this.getAll();
      if (all.length === 0) {
        console.log('✅ Нет orphan-продуктов — все данные берутся из базы');
        return;
      }
      console.warn(`⚠️ Найдено ${all.length} orphan-продуктов (данные из штампа):`);
      console.table(all.map(o => ({
        Название: o.name,
        'Дней использования': o.daysCount,
        'Есть данные': o.hasInlineData ? '✓' : '✗'
      })));
    },

    // Восстановить orphan-продукты в базу из штампов в днях
    async restore() {
      const U = HEYS.utils || {};
      const lsGet = U.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      });
      const lsSet = U.lsSet || ((k, v) => localStorage.setItem(k, JSON.stringify(v)));
      const parseStoredValue = (raw) => {
        if (!raw || typeof raw !== 'string') return null;
        if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) {
          return HEYS.store.decompress(raw);
        }
        try { return JSON.parse(raw); } catch { return null; }
      };

      // Получаем текущие продукты (ключ = name LOWERCASE для консистентности с getDayData)
      const products = lsGet('heys_products', []);
      const productsMap = new Map();
      const productsById = new Map(); // Для восстановления по id
      products.forEach(p => {
        if (p && p.name) {
          const name = String(p.name).trim().toLowerCase();
          if (name) productsMap.set(name, p);
          if (p.id) productsById.set(String(p.id), p);
        }
      });

      // Собираем orphan-продукты из всех дней
      // Ключи могут быть: heys_dayv2_YYYY-MM-DD (legacy) или heys_<clientId>_dayv2_YYYY-MM-DD
      const restored = [];
      const keys = Object.keys(localStorage).filter(k => k.includes('_dayv2_'));

      // 🔇 v4.7.0: DEBUG логи отключены

      // Debug: показать какие orphan продукты мы ищем
      const orphanNames = Array.from(orphanProductsMap.keys());

      let checkedItems = 0;
      let foundWithData = 0;
      let alreadyInBase = 0;

      for (const key of keys) {
        try {
          const day = parseStoredValue(localStorage.getItem(key));
          if (!day || !day.meals) continue;

          for (const meal of day.meals) {
            for (const item of (meal.items || [])) {
              if (isSyntheticEstimatedItem(item)) continue;
              checkedItems++;
              const itemName = String(item.name || '').trim();
              const itemNameLower = itemName.toLowerCase();
              if (!itemName) continue;

              const hasData = item.kcal100 != null;
              const inBase = productsMap.has(itemNameLower) || (item.product_id && productsById.has(String(item.product_id)));

              if (hasData) foundWithData++;
              if (inBase) alreadyInBase++;

              // 🔇 v4.7.0: DEBUG логи отключены

              // Если продукта нет в базе по имени И есть inline данные
              if (itemName && !inBase && hasData) {
                const restoredProduct = {
                  id: item.product_id || ('restored_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
                  name: itemName, // Сохраняем оригинальное имя
                  kcal100: item.kcal100,
                  protein100: item.protein100 || 0,
                  fat100: item.fat100 || 0,
                  carbs100: item.carbs100 || 0,
                  simple100: item.simple100 || 0,
                  complex100: item.complex100 || 0,
                  badFat100: item.badFat100 || 0,
                  goodFat100: item.goodFat100 || 0,
                  trans100: item.trans100 || 0,
                  fiber100: item.fiber100 || 0,
                  gi: item.gi || 50,
                  harm: item.harm ?? item.harmScore ?? 0,
                  restoredAt: Date.now(),
                  restoredFrom: 'orphan_stamp'
                };
                productsMap.set(itemNameLower, restoredProduct);
                restored.push(restoredProduct);
                // 🔇 v4.7.0: Лог отключён
              }
            }
          }
        } catch (e) {
          // Пропускаем битые записи
        }
      }

      // 🔇 v4.7.0: DEBUG лог отключён

      if (restored.length > 0) {
        // Сохраняем обновлённую базу
        const newProducts = Array.from(productsMap.values());

        // Используем HEYS.products.setAll для синхронизации с облаком и React state
        if (HEYS.products?.setAll) {
          HEYS.products.setAll(newProducts);
        } else {
          lsSet('heys_products', newProducts);
          console.warn('[HEYS] ⚠️ Products saved via lsSet only (no cloud sync)');
        }

        if (HEYS.cloud?.flushPendingQueue) {
          try {
            await HEYS.cloud.flushPendingQueue(3000);
          } catch (e) { }
        }

        // Очищаем orphan-трекинг
        this.clear();

        // Обновляем индекс продуктов если есть
        if (HEYS.products?.buildSearchIndex) {
          HEYS.products.buildSearchIndex();
        }

        // Уведомляем UI об обновлении продуктов
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('heysProductsUpdated', {
            detail: { products: newProducts, restored: restored.length }
          }));
        }

        console.log(`✅ Восстановлено ${restored.length} продуктов в базу`);
        return { success: true, count: restored.length, products: restored };
      }

      console.log('ℹ️ Нечего восстанавливать — нет данных в штампах');
      return { success: false, count: 0, products: [] };
    },

    /**
     * 🔄 autoRecoverOnLoad — Автоматическая проверка и восстановление orphan-продуктов при загрузке
     * Вызывается после загрузки продуктов (sync или localStorage)
     * 
     * Логика:
     * 1. Сканирует все дни (heys_dayv2_*)
     * 2. Для каждого продукта в приёмах пищи проверяет наличие в локальной базе
     * 3. Если не найден — пытается восстановить:
     *    a) Из штампа (kcal100, protein100, etc. в meal item) — приоритет
     *    b) Из shared_products через HEYS.YandexAPI.rpc — fallback
     * 4. Добавляет восстановленные продукты в локальную базу
     * 
     * @param {Object} options - Опции
     * @param {boolean} options.verbose - Подробный лог (default: false)
     * @param {boolean} options.tryShared - Пытаться восстановить из shared_products (default: true)
     * @returns {Promise<{recovered: number, fromStamp: number, fromShared: number, missing: string[]}>}
     */
    async autoRecoverOnLoad(options = {}) {
      const { verbose = false, tryShared = true } = options;
      const U = HEYS.utils || {};
      const lsGet = U.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      });
      const parseStoredValue = (raw) => {
        if (!raw || typeof raw !== 'string') return null;
        if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) {
          return HEYS.store.decompress(raw);
        }
        try { return JSON.parse(raw); } catch { return null; }
      };

      const startTime = Date.now();
      if (verbose) console.log('[HEYS] 🔍 autoRecoverOnLoad: начинаю проверку продуктов...');

      // 1. Собираем текущие продукты в Map по id и по name (normalized)
      // 🆕 v4.9.0: Используем HEYS.products.getAll() вместо localStorage напрямую
      // чтобы не потерять продукты которые уже загружены в память
      const products = HEYS.products?.getAll?.() || lsGet('heys_products', []);
      const productsById = new Map();
      const productsByName = new Map();
      const productsByFingerprint = new Map(); // 🆕 v4.6.0: Индекс по fingerprint
      const normalizeName = HEYS.models?.normalizeProductName || ((n) => String(n || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));
      products.forEach(p => {
        if (p && p.id) productsById.set(String(p.id), p);
        if (p && p.name) productsByName.set(normalizeName(p.name), p);
        if (p && p.fingerprint) productsByFingerprint.set(p.fingerprint, p); // 🆕
      });

      if (verbose) console.log(`[HEYS] Локальная база: ${products.length} продуктов`);

      // 2. Собираем все уникальные продукты из всех дней
      const keys = Object.keys(localStorage).filter(k => k.includes('_dayv2_'));
      const missingProducts = new Map(); // product_id or name => { item, dateStr, hasStamp }

      for (const key of keys) {
        try {
          const day = parseStoredValue(localStorage.getItem(key));
          if (!day || !day.meals) continue;
          const dateStr = key.split('_dayv2_').pop();

          for (const meal of day.meals) {
            for (const item of (meal.items || [])) {
              if (isSyntheticEstimatedItem(item)) continue;
              const productId = item.product_id ? String(item.product_id) : null;
              const itemName = String(item.name || '').trim();
              const itemNameNorm = normalizeName(itemName); // 🆕 v4.6.0: Используем normalizeProductName
              const itemFingerprint = item.fingerprint || null; // 🆕 v4.6.0: Fingerprint из штампа

              // Проверяем есть ли в базе (ID → fingerprint → name)
              const foundById = productId && productsById.has(productId);
              const foundByFingerprint = itemFingerprint && productsByFingerprint.has(itemFingerprint); // 🆕
              const foundByName = itemNameNorm && productsByName.has(itemNameNorm);

              if (!foundById && !foundByFingerprint && !foundByName && itemName) {
                const key = itemFingerprint || productId || itemNameNorm; // 🆕 Приоритет: fingerprint → id → name
                if (!missingProducts.has(key)) {
                  missingProducts.set(key, {
                    productId,
                    name: itemName,
                    fingerprint: itemFingerprint, // 🆕 v4.6.0
                    hasStamp: item.kcal100 != null,
                    stampData: item.kcal100 != null ? {
                      kcal100: item.kcal100,
                      protein100: item.protein100 || 0,
                      fat100: item.fat100 || 0,
                      carbs100: item.carbs100 || 0,
                      simple100: item.simple100 || 0,
                      complex100: item.complex100 || 0,
                      badFat100: item.badFat100 || 0,
                      goodFat100: item.goodFat100 || 0,
                      trans100: item.trans100 || 0,
                      fiber100: item.fiber100 || 0,
                      gi: item.gi,
                      harm: item.harm ?? item.harmScore
                    } : null,
                    firstSeenDate: dateStr
                  });
                }
              }
            }
          }
        } catch (e) {
          // Пропускаем битые записи
        }
      }

      if (missingProducts.size === 0) {
        if (verbose) console.log(`[HEYS] ✅ Все продукты найдены в базе (${Date.now() - startTime}ms)`);
        return { recovered: 0, fromStamp: 0, fromShared: 0, missing: [] };
      }

      // 🔇 v4.7.1: Лог отключён

      // 3. Пытаемся восстановить
      const recovered = [];
      let fromStamp = 0;
      let fromShared = 0;
      let skippedDeleted = 0; // 🆕 v4.8.0: Счётчик пропущенных удалённых
      const stillMissing = [];

      // 🪦 FIX v4.9.1: Строим Set удалённых имён из heys_deleted_ids (Store-based, надёжный)
      // HEYS.deletedProducts — localStorage-based, может потеряться при overflow/cleanup.
      // heys_deleted_ids — Store-based, синхронизирован с облаком, НАДЁЖНЫЙ.
      const _tombstonesRecovery = window.HEYS?.store?.get?.('heys_deleted_ids') || [];
      const _deletedNamesSet = new Set();
      const _deletedIdsSet = new Set();
      if (Array.isArray(_tombstonesRecovery)) {
        const _normTS = (n) => String(n || '').toLowerCase().trim();
        _tombstonesRecovery.forEach(t => {
          if (t.name) _deletedNamesSet.add(_normTS(t.name));
          if (t.id) _deletedIdsSet.add(String(t.id));
        });
      }

      // Хелпер: проверка tombstones (оба источника)
      const _isProductTombstoned = (name, productId) => {
        // 1️⃣ heys_deleted_ids (Store — надёжный)
        const _normCheck = (n) => String(n || '').toLowerCase().trim();
        if (name && _deletedNamesSet.has(_normCheck(name))) return true;
        if (productId && _deletedIdsSet.has(String(productId))) return true;
        // 2️⃣ HEYS.deletedProducts (localStorage — fallback)
        if (HEYS.deletedProducts?.isDeleted?.(name)) return true;
        if (HEYS.deletedProducts?.isDeleted?.(productId)) return true;
        return false;
      };

      // 3a. Восстановление из штампов
      for (const [key, data] of missingProducts) {
        // 🆕 v4.9.1: Проверяем ОБА tombstone-источника (heys_deleted_ids + deletedProducts)
        if (_isProductTombstoned(data.name, data.productId)) {
          skippedDeleted++;
          if (verbose) console.log(`[HEYS] ⏭️ Пропускаю удалённый продукт: "${data.name}" (tombstone)`);
          continue;
        }

        if (data.hasStamp && data.stampData) {
          const restoredProduct = {
            id: data.productId || ('restored_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
            name: data.name,
            fingerprint: data.fingerprint, // 🆕 v4.6.0: Сохраняем fingerprint
            ...data.stampData,
            gi: data.stampData.gi ?? 50,
            harm: data.stampData.harm ?? 0,
            _recoveredFrom: 'stamp',
            _recoveredAt: Date.now()
          };
          recovered.push(restoredProduct);
          productsById.set(String(restoredProduct.id), restoredProduct);
          productsByName.set(normalizeName(data.name), restoredProduct); // 🆕 v4.6.0: normalizeProductName
          if (data.fingerprint) productsByFingerprint.set(data.fingerprint, restoredProduct); // 🆕
          fromStamp++;
          // 🔇 v4.7.1: Лог отключён
        } else {
          stillMissing.push(data);
        }
      }

      // 3b. Пытаемся найти в shared_products (если есть YandexAPI)
      if (tryShared && stillMissing.length > 0 && HEYS.YandexAPI?.rpc) {
        try {
          if (verbose) console.log(`[HEYS] 🌐 Пытаюсь найти ${stillMissing.length} продуктов в shared_products...`);

          const { data: sharedProducts, error } = await HEYS.YandexAPI.rpc('get_shared_products', {});

          if (!error && Array.isArray(sharedProducts)) {
            // 🆕 v4.6.0: Индексация shared по fingerprint, id и name
            const sharedByFingerprint = new Map();
            const sharedById = new Map();
            const sharedByName = new Map();
            sharedProducts.forEach(p => {
              if (p && p.fingerprint) sharedByFingerprint.set(p.fingerprint, p);
              if (p && p.id) sharedById.set(String(p.id), p);
              if (p && p.name) sharedByName.set(normalizeName(p.name), p);
            });

            for (const data of stillMissing) {
              // 🆕 v4.9.1: Проверяем ОБА tombstone-источника (heys_deleted_ids + deletedProducts)
              if (_isProductTombstoned(data.name, data.productId)) {
                skippedDeleted++;
                if (verbose) console.log(`[HEYS] ⏭️ Пропускаю удалённый продукт (shared): "${data.name}" (tombstone)`);
                continue;
              }

              // 🆕 v4.6.0: Поиск: fingerprint → id → name (приоритет)
              let found = null;
              if (data.fingerprint) found = sharedByFingerprint.get(data.fingerprint);
              if (!found && data.productId) found = sharedById.get(data.productId);
              if (!found && data.name) found = sharedByName.get(normalizeName(data.name));

              if (found) {
                // Клонируем из shared
                const cloned = HEYS.products?.addFromShared?.(found);
                if (cloned) {
                  cloned._recoveredFrom = 'shared';
                  cloned._recoveredAt = Date.now();
                  recovered.push(cloned);
                  fromShared++;
                  // 🔇 v4.7.1: Лог отключён
                }
              }
            }
          }
        } catch (e) {
          console.warn('[HEYS] Не удалось загрузить shared_products:', e?.message || e);
        }
      }

      // 4. Сохраняем восстановленные продукты (если были восстановлены из штампов)
      if (fromStamp > 0) {
        const newProducts = [...products, ...recovered.filter(p => p._recoveredFrom === 'stamp')];

        if (HEYS.products?.setAll) {
          HEYS.products.setAll(newProducts);
        } else {
          const lsSet = U.lsSet || ((k, v) => localStorage.setItem(k, JSON.stringify(v)));
          lsSet('heys_products', newProducts);
        }

        // Обновляем индекс
        if (HEYS.products?.buildSearchIndex) {
          HEYS.products.buildSearchIndex();
        }
      }

      // 5. Очищаем orphan-трекинг для восстановленных
      recovered.forEach(p => this.remove(p.name));

      // Собираем имена тех, кого так и не нашли
      const finalMissing = [];
      for (const data of stillMissing) {
        const wasRecovered = recovered.some(p =>
          p.name.toLowerCase() === data.name.toLowerCase() ||
          (data.productId && String(p.id) === data.productId)
        );
        if (!wasRecovered) {
          finalMissing.push(data.name);
          // 🔇 v4.7.1: Лог отключён
        }
      }

      const elapsed = Date.now() - startTime;

      // 🆕 v4.8.0: Лог пропущенных удалённых
      if (skippedDeleted > 0 && verbose) {
        console.log(`[HEYS] 🚫 Пропущено ${skippedDeleted} удалённых продуктов (в игнор-листе)`);
      }

      // Диспатчим событие для UI
      if (recovered.length > 0 && typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:orphans-recovered', {
          detail: { recovered: recovered.length, fromStamp, fromShared, missing: finalMissing }
        }));
      }

      return { recovered: recovered.length, fromStamp, fromShared, missing: finalMissing };
    }
  };

  // === Haptic Feedback ===
  // Track if user has interacted (required for vibrate API)
  let userHasInteracted = false;
  if (typeof window !== 'undefined') {
    const markInteracted = () => { userHasInteracted = true; };
    window.addEventListener('click', markInteracted, { once: true, passive: true });
    window.addEventListener('touchstart', markInteracted, { once: true, passive: true });
    window.addEventListener('keydown', markInteracted, { once: true, passive: true });
  }

  function hapticFn(type = 'light') {
    if (!navigator.vibrate || !userHasInteracted) return;
    try {
      switch (type) {
        case 'light': navigator.vibrate(10); break;
        case 'medium': navigator.vibrate(20); break;
        case 'heavy': navigator.vibrate(30); break;
        case 'success': navigator.vibrate([10, 50, 20]); break;
        case 'warning': navigator.vibrate([30, 30, 30]); break;
        case 'error': navigator.vibrate([50, 30, 50, 30, 50]); break;
        case 'tick': navigator.vibrate(5); break;
        default: navigator.vibrate(10);
      }
    } catch (e) { /* ignore vibrate errors */ }
  }

  // Двойной API: функция + объект с методами для удобства
  // HEYS.haptic('medium') ИЛИ HEYS.haptic.medium()
  const hapticObj = Object.assign(
    (type) => hapticFn(type),
    {
      light: () => hapticFn('light'),
      medium: () => hapticFn('medium'),
      heavy: () => hapticFn('heavy'),
      success: () => hapticFn('success'),
      warning: () => hapticFn('warning'),
      error: () => hapticFn('error'),
      tick: () => hapticFn('tick')
    }
  );

  HEYS.haptic = hapticObj;

  // === Date/Time Utilities ===
  function pad2(n) { return String(n).padStart(2, '0'); }

  // Ночной порог: до 03:00 считается "вчера" (день ещё не закончился)
  const NIGHT_HOUR_THRESHOLD = 3; // 00:00 - 02:59 → ещё предыдущий день

  // "Эффективная" сегодняшняя дата — до 3:00 возвращает вчера
  function todayISO() {
    const d = new Date();
    const hour = d.getHours();
    // До 3:00 — это ещё "вчера" (день не закончился)
    if (hour < NIGHT_HOUR_THRESHOLD) {
      d.setDate(d.getDate() - 1);
    }
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function fmtDate(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function parseISO(s) { const [y, m, d] = String(s || '').split('-').map(x => parseInt(x, 10)); if (!y || !m || !d) return new Date(); const dt = new Date(y, m - 1, d); dt.setHours(12); return dt; }
  function uid(p) { return (p || 'id') + Math.random().toString(36).slice(2, 8); }

  // Проверка: время относится к "ночным" часам (00:00-02:59)
  function isNightTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return false;
    const [hh] = timeStr.split(':').map(x => parseInt(x, 10));
    if (isNaN(hh)) return false;
    return hh >= 0 && hh < NIGHT_HOUR_THRESHOLD;
  }

  // Возвращает "эффективную" дату для приёма пищи
  // Если время 00:00-02:59, возвращает предыдущий день
  function getEffectiveDate(timeStr, calendarDateISO) {
    if (!calendarDateISO) return calendarDateISO;
    if (!isNightTime(timeStr)) return calendarDateISO;
    // Вычитаем 1 день
    const d = parseISO(calendarDateISO);
    d.setDate(d.getDate() - 1);
    return fmtDate(d);
  }

  // Возвращает "следующий" календарный день
  function getNextDay(dateISO) {
    const d = parseISO(dateISO);
    d.setDate(d.getDate() + 1);
    return fmtDate(d);
  }

  // === Storage Utilities ===
  // ВАЖНО: Используем HEYS.utils.lsGet/lsSet которые работают с clientId namespace
  function lsGet(k, d) {
    try {
      // Приоритет: HEYS.utils (с namespace) → HEYS.store → localStorage fallback
      if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
        return HEYS.utils.lsGet(k, d);
      }
      if (HEYS.store && typeof HEYS.store.get === 'function') {
        return HEYS.store.get(k, d);
      }
      const v = JSON.parse(localStorage.getItem(k));
      return v == null ? d : v;
    } catch (e) { return d; }
  }

  function lsSet(k, v) {
    try {
      // Приоритет: HEYS.utils (с namespace) → HEYS.store → localStorage fallback
      if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
        return HEYS.utils.lsSet(k, v);
      }
      if (HEYS.store && typeof HEYS.store.set === 'function') {
        return HEYS.store.set(k, v);
      }
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { }
  }

  // === Math Utilities ===
  function clamp(n, a, b) { n = +n || 0; if (n < a) return a; if (n > b) return b; return n; }
  const r1 = v => Math.round((+v || 0) * 10) / 10; // округление до 1 десятой (для веса)
  const r0 = v => Math.round(+v || 0); // округление до целого (для калорий)
  const scale = (v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10;

  // === Model Helpers (delegates to HEYS.models) ===
  function ensureDay(d, prof) {
    const M = HEYS.models || {};
    return (M.ensureDay ? M.ensureDay(d, prof) : (d || {}));
  }

  function buildProductIndex(ps) {
    const M = HEYS.models || {};
    return M.buildProductIndex ? M.buildProductIndex(ps) : { byId: new Map(), byName: new Map(), byFingerprint: new Map() }; // 🆕 v4.6.0
  }

  function getProductFromItem(it, idx) {
    const M = HEYS.models || {};
    return M.getProductFromItem ? M.getProductFromItem(it, idx) : null;
  }

  function per100(p) {
    const M = HEYS.models || {};
    if (!p) return { kcal100: 0, carbs100: 0, prot100: 0, fat100: 0, simple100: 0, complex100: 0, bad100: 0, good100: 0, trans100: 0, fiber100: 0, sodium100: 0 };
    if (M.computeDerivedProduct) {
      const d = M.computeDerivedProduct(p);
      return { kcal100: d.kcal100, carbs100: d.carbs100, prot100: +p.protein100 || 0, fat100: d.fat100, simple100: +p.simple100 || 0, complex100: +p.complex100 || 0, bad100: +p.badFat100 || 0, good100: +p.goodFat100 || 0, trans100: +p.trans100 || 0, fiber100: +p.fiber100 || 0, sodium100: +p.sodium100 || 0 };
    }
    const s = +p.simple100 || 0, c = +p.complex100 || 0, pr = +p.protein100 || 0, b = +p.badFat100 || 0, g = +p.goodFat100 || 0, t = +p.trans100 || 0, fib = +p.fiber100 || 0, na = +p.sodium100 || 0;
    const carbs = +p.carbs100 || (s + c);
    const fat = +p.fat100 || (b + g + t);
    const kcal = +p.kcal100 || (4 * (pr + carbs) + 8 * fat);
    return { kcal100: kcal, carbs100: carbs, prot100: pr, fat100: fat, simple100: s, complex100: c, bad100: b, good100: g, trans100: t, fiber100: fib, sodium100: na };
  }

  // === Data Loading ===

  // Базовая загрузка приёмов из localStorage (без ночной логики)
  function loadMealsRaw(ds) {
    const keys = ['heys_dayv2_' + ds, 'heys_day_' + ds, 'day_' + ds + '_meals', 'meals_' + ds, 'food_' + ds];
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const v = JSON.parse(raw);
        if (v && Array.isArray(v.meals)) return v.meals;
        if (Array.isArray(v)) return v;
      } catch (e) { }
    }
    return [];
  }

  // Загрузка приёмов для даты с учётом ночной логики:
  // - Берём приёмы текущего дня (кроме ночных 00:00-02:59)
  // - Добавляем ночные приёмы из следующего календарного дня (они принадлежат этому дню)
  function loadMealsForDate(ds) {
    // 1. Загружаем приёмы текущего календарного дня (фильтруем ночные — они ушли в предыдущий день)
    const currentDayMeals = (loadMealsRaw(ds) || []).filter(m => !isNightTime(m.time));

    // 2. Загружаем ночные приёмы из следующего календарного дня
    const nextDayISO = getNextDay(ds);
    const nextDayMeals = (loadMealsRaw(nextDayISO) || []).filter(m => isNightTime(m.time));

    // 3. Объединяем и сортируем по времени
    const allMeals = [...currentDayMeals, ...nextDayMeals];

    // Сортировка: ночные (00:00-02:59) в конец, остальные по времени
    allMeals.sort((a, b) => {
      const aIsNight = isNightTime(a.time);
      const bIsNight = isNightTime(b.time);
      if (aIsNight && !bIsNight) return 1; // ночные в конец
      if (!aIsNight && bIsNight) return -1;
      // Одинаковый тип — сортируем по времени
      return (a.time || '').localeCompare(b.time || '');
    });

    return allMeals;
  }

  // Lightweight signature for products (ids/names + kcal для инвалидации при синхронизации)
  // FIX: добавлен kcal100 чтобы пересобрать индекс когда продукт обновился с нулей на реальные данные
  function productsSignature(ps) {
    // Ensure ps is an array
    if (!ps) return '';
    if (!Array.isArray(ps)) {
      console.warn('[HEYS] productsSignature: expected array, got', typeof ps);
      return '';
    }
    // Включаем id/name + kcal100 для детектирования обновлений содержимого
    return ps.map(p => {
      if (!p) return '';
      const id = p.id || p.product_id || p.name || '';
      const kcal = p.kcal100 ?? p.kcal ?? 0;
      return `${id}:${kcal}`;
    }).join('|');
  }

  // Cached popular products (per month + signature + TTL)
  const POPULAR_CACHE = {}; // key => {ts, list}

  function computePopularProducts(ps, iso) {
    const sig = productsSignature(ps);
    const monthKey = (iso || todayISO()).slice(0, 7); // YYYY-MM
    // Добавляем favorites в ключ кэша чтобы обновлять при изменении избранных
    const favorites = (window.HEYS && window.HEYS.store && window.HEYS.store.getFavorites)
      ? window.HEYS.store.getFavorites()
      : new Set();
    const favSig = Array.from(favorites).sort().join(',');
    const key = monthKey + '::' + sig + '::' + favSig;
    const now = Date.now();
    const ttl = 1000 * 60 * 10; // 10 минут
    const cached = POPULAR_CACHE[key];
    if (cached && (now - cached.ts) < ttl) return cached.list;
    const idx = buildProductIndex(ps), base = iso ? new Date(iso) : new Date(), cnt = new Map();
    for (let i = 0; i < 30; i++) {
      const d = new Date(base); d.setDate(d.getDate() - i);
      (loadMealsForDate(fmtDate(d)) || []).forEach(m => {
        ((m && m.items) || []).forEach(it => {
          const p = getProductFromItem(it, idx);
          if (!p) return;
          const k = String(p.id ?? p.product_id ?? p.name);
          cnt.set(k, (cnt.get(k) || 0) + 1);
        });
      });
    }
    const arr = [];
    cnt.forEach((c, k) => {
      let p = idx.byId.get(String(k)) || idx.byName.get(String(k).trim().toLowerCase());
      if (p) arr.push({ p, c });
    });
    // Сортировка: избранные первые, затем по частоте
    arr.sort((a, b) => {
      const aFav = favorites.has(String(a.p.id ?? a.p.product_id ?? a.p.name));
      const bFav = favorites.has(String(b.p.id ?? b.p.product_id ?? b.p.name));
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return b.c - a.c;
    });
    const list = arr.slice(0, 20).map(x => x.p);
    POPULAR_CACHE[key] = { ts: now, list };
    return list;
  }

  // === Profile & Calculations ===
  function getProfile() {
    const p = lsGet('heys_profile', {}) || {};
    const g = (p.gender || p.sex || 'Мужской');
    const sex = (String(g).toLowerCase().startsWith('ж') ? 'female' : 'male');
    return {
      sex,
      height: +p.height || 175,
      age: +p.age || 30,
      sleepHours: +p.sleepHours || 8,
      weight: +p.weight || 70,
      deficitPctTarget: +p.deficitPctTarget || 0,
      stepsGoal: +p.stepsGoal || 7000,
      weightGoal: +p.weightGoal || 0,  // Целевой вес для прогноза
      cycleTrackingEnabled: !!p.cycleTrackingEnabled
    };
  }

  // 🔬 TDEE v1.1.0: Делегируем в единый модуль HEYS.TDEE с fallback для legacy
  function calcBMR(w, prof) {
    // Fallback: Mifflin-St Jeor (всегда должен быть доступен)
    const fallback = () => {
      const h = +prof.height || 175, a = +prof.age || 30, sex = (prof.sex || 'male');
      return Math.round(10 * (+w || 0) + 6.25 * h - 5 * a + (sex === 'female' ? -161 : 5));
    };

    // Делегируем в единый модуль, но НИКОГДА не даём ошибке “убить” UI.
    // В противном случае getActiveDaysForMonth вернёт пустой Map из-за try/catch.
    try {
      if (typeof HEYS !== 'undefined' && HEYS.TDEE && HEYS.TDEE.calcBMR) {
        const v = HEYS.TDEE.calcBMR({ ...prof, weight: w });
        const num = +v;
        if (Number.isFinite(num) && num > 0) return Math.round(num);
      }
    } catch (e) {
      try {
        if (typeof HEYS !== 'undefined' && HEYS.analytics && HEYS.analytics.trackError) {
          HEYS.analytics.trackError(e, { where: 'day_utils.calcBMR', hasTDEE: !!HEYS.TDEE });
        }
      } catch (_) { }
    }

    return fallback();
  }

  // 🔬 TDEE v1.1.0: Делегируем в единый модуль с fallback
  function kcalPerMin(met, w) {
    try {
      if (typeof HEYS !== 'undefined' && HEYS.TDEE && HEYS.TDEE.kcalPerMin) {
        const v = HEYS.TDEE.kcalPerMin(met, w);
        const num = +v;
        if (Number.isFinite(num)) return num;
      }
    } catch (e) {
      try {
        if (typeof HEYS !== 'undefined' && HEYS.analytics && HEYS.analytics.trackError) {
          HEYS.analytics.trackError(e, { where: 'day_utils.kcalPerMin', hasTDEE: !!HEYS.TDEE });
        }
      } catch (_) { }
    }
    return Math.round((((+met || 0) * (+w || 0) * 0.0175) - 1) * 10) / 10;
  }

  function stepsKcal(steps, w, sex, len) {
    try {
      if (typeof HEYS !== 'undefined' && HEYS.TDEE && HEYS.TDEE.stepsKcal) {
        const v = HEYS.TDEE.stepsKcal(steps, w, sex, len);
        const num = +v;
        if (Number.isFinite(num)) return num;
      }
    } catch (e) {
      try {
        if (typeof HEYS !== 'undefined' && HEYS.analytics && HEYS.analytics.trackError) {
          HEYS.analytics.trackError(e, { where: 'day_utils.stepsKcal', hasTDEE: !!HEYS.TDEE });
        }
      } catch (_) { }
    }
    const coef = (sex === 'female' ? 0.5 : 0.57);
    const km = (+steps || 0) * (len || 0.7) / 1000;
    return Math.round(coef * (+w || 0) * km * 10) / 10;
  }

  // === Time/Sleep Utilities ===
  function parseTime(t) {
    if (!t || typeof t !== 'string' || !t.includes(':')) return null;
    const [hh, mm] = t.split(':').map(x => parseInt(x, 10));
    if (isNaN(hh) || isNaN(mm)) return null;
    // НЕ обрезаем часы до 23 — ночные часы могут быть 24-26
    return { hh: Math.max(0, hh), mm: clamp(mm, 0, 59) };
  }

  function sleepHours(a, b) {
    const s = parseTime(a), e = parseTime(b);
    if (!s || !e) return 0;
    let sh = s.hh + s.mm / 60, eh = e.hh + e.mm / 60;
    let d = eh - sh;
    if (d < 0) d += 24;
    return r1(d);
  }

  function normalizeDaySleepMinutes(value) {
    const n = Math.round(+value || 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return clamp(n, 0, 360);
  }

  function getNightSleepHours(day) {
    if (!day) return 0;
    const fromWindow = sleepHours(day.sleepStart, day.sleepEnd);
    if (fromWindow > 0) return fromWindow;

    const total = +day.sleepHours || 0;
    const napHours = normalizeDaySleepMinutes(day.daySleepMinutes) / 60;
    return r1(Math.max(0, total - napHours));
  }

  function getTotalSleepHours(day) {
    if (!day) return 0;

    const totalStored = +day.sleepHours || 0;
    const napHours = normalizeDaySleepMinutes(day.daySleepMinutes) / 60;
    const nightHours = getNightSleepHours(day);

    if (nightHours > 0 || napHours > 0) {
      return r1(nightHours + napHours);
    }

    return r1(Math.max(0, totalStored));
  }

  // === Meal Type Classification ===
  // Типы приёмов пищи с иконками и названиями
  const MEAL_TYPES = {
    breakfast: { name: 'Завтрак', icon: '🍳', order: 1 },
    snack1: { name: 'Перекус', icon: '🍎', order: 2 },
    lunch: { name: 'Обед', icon: '🍲', order: 3 },
    snack2: { name: 'Перекус', icon: '🥜', order: 4 },
    dinner: { name: 'Ужин', icon: '🍽️', order: 5 },
    snack3: { name: 'Перекус', icon: '🧀', order: 6 },
    night: { name: 'Ночной приём', icon: '🌙', order: 7 }
  };

  // Пороги для определения "основного приёма" vs "перекуса"
  const MAIN_MEAL_THRESHOLDS = {
    minProducts: 3,      // минимум продуктов для основного приёма
    minGrams: 200,       // минимум граммов для основного приёма
    minKcal: 300         // минимум калорий для основного приёма
  };

  /**
   * Вычисляет тотал по приёму (граммы, продукты, калории)
   */
  function getMealStats(meal, pIndex) {
    if (!meal || !meal.items || !meal.items.length) {
      return { totalGrams: 0, productCount: 0, totalKcal: 0 };
    }

    let totalGrams = 0;
    let totalKcal = 0;
    const productCount = meal.items.length;

    meal.items.forEach(item => {
      const g = +item.grams || 0;
      totalGrams += g;

      // Пытаемся получить калории
      const p = pIndex ? getProductFromItem(item, pIndex) : null;
      if (p) {
        const per = per100(p);
        totalKcal += (per.kcal100 || 0) * g / 100;
      }
    });

    return { totalGrams, productCount, totalKcal: Math.round(totalKcal) };
  }

  /**
   * Проверяет, является ли приём "основным" (завтрак/обед/ужин) по размеру
   */
  function isMainMeal(mealStats) {
    const { totalGrams, productCount, totalKcal } = mealStats;

    // Основной приём если: много продуктов ИЛИ (много граммов И больше 1 продукта)
    if (productCount >= MAIN_MEAL_THRESHOLDS.minProducts) return true;
    if (totalGrams >= MAIN_MEAL_THRESHOLDS.minGrams && productCount >= 2) return true;
    if (totalKcal >= MAIN_MEAL_THRESHOLDS.minKcal) return true;

    return false;
  }

  /**
   * Преобразует время в минуты от полуночи (с учётом ночных часов)
   * Ночные часы (00:00-02:59) считаются как 24:00-26:59
   */
  function timeToMinutes(timeStr) {
    const parsed = parseTime(timeStr);
    if (!parsed) return null;

    let { hh, mm } = parsed;
    // Ночные часы (00-02) — это "после полуночи" предыдущего дня
    if (hh < NIGHT_HOUR_THRESHOLD) {
      hh += 24;
    }
    return hh * 60 + mm;
  }

  /**
   * Форматирует время приёма для отображения
   * 24:20 → 00:20 (ночные часы хранятся как 24-26)
   */
  function formatMealTime(timeStr) {
    if (!timeStr) return '';
    const parsed = parseTime(timeStr);
    if (!parsed) return timeStr;

    let { hh, mm } = parsed;
    // Нормализуем ночные часы: 24 → 00, 25 → 01, 26 → 02
    if (hh >= 24) {
      hh = hh - 24;
    }
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  // === Hours Order для Wheel Picker ===
  // Порядок часов: 03, 04, ..., 23, 00, 01, 02
  // Это позволяет скроллить от вечера к ночи естественно
  const HOURS_ORDER = (() => {
    const order = [];
    for (let h = NIGHT_HOUR_THRESHOLD; h < 24; h++) order.push(h);
    for (let h = 0; h < NIGHT_HOUR_THRESHOLD; h++) order.push(h);
    return order;
  })();

  /**
   * Конвертация: индекс колеса → реальный час
   * @param {number} idx - индекс в HOURS_ORDER
   * @returns {number} реальный час (0-23)
   */
  function wheelIndexToHour(idx) {
    return HOURS_ORDER[idx] ?? idx;
  }

  /**
   * Конвертация: реальный час → индекс колеса
   * Учитывает ночные часы: 24→0, 25→1, 26→2
   * @param {number} hour - реальный час (0-26)
   * @returns {number} индекс в HOURS_ORDER
   */
  function hourToWheelIndex(hour) {
    // Нормализуем ночные часы для поиска в колесе
    const normalizedHour = hour >= 24 ? hour - 24 : hour;
    const idx = HOURS_ORDER.indexOf(normalizedHour);
    return idx >= 0 ? idx : 0;
  }

  /**
   * Определяет тип приёма пищи на основе:
   * - Порядкового номера (первый = завтрак)
   * - Времени (деление дня на слоты)
   * - Размера приёма (основной vs перекус)
   * 
   * @param {number} mealIndex - Индекс приёма в отсортированном списке
   * @param {Object} meal - Объект приёма {id, time, items, ...}
   * @param {Array} allMeals - Все приёмы дня (отсортированы по времени)
   * @param {Object} pIndex - Индекс продуктов для расчёта калорий
   * @returns {Object} { type: string, name: string, icon: string }
   */
  function getMealType(mealIndex, meal, allMeals, pIndex) {
    // Защита от undefined
    if (!allMeals || !Array.isArray(allMeals) || allMeals.length === 0) {
      return { type: 'snack', ...MEAL_TYPES.snack };
    }

    // Первый приём дня всегда Завтрак
    if (mealIndex === 0) {
      return { type: 'breakfast', ...MEAL_TYPES.breakfast };
    }

    // Получаем время первого приёма (завтрака)
    const firstMeal = allMeals[0];
    const breakfastMinutes = timeToMinutes(firstMeal?.time);
    const currentMinutes = timeToMinutes(meal?.time);

    // Если время не указано, определяем по порядку и размеру
    if (breakfastMinutes === null || currentMinutes === null) {
      return fallbackMealType(mealIndex, meal, pIndex);
    }

    // Конец дня = 03:00 следующего дня = 27:00 в нашей системе
    const endOfDayMinutes = 27 * 60; // 03:00 + 24 = 27:00

    // Оставшееся время от завтрака до конца дня
    const remainingMinutes = endOfDayMinutes - breakfastMinutes;

    // Делим на 6 слотов (7 типов минус завтрак = 6)
    const slotDuration = remainingMinutes / 6;

    // Определяем в какой слот попадает текущий приём
    const minutesSinceBreakfast = currentMinutes - breakfastMinutes;
    const slotIndex = Math.floor(minutesSinceBreakfast / slotDuration);

    // Типы слотов: 0=перекус1, 1=обед, 2=перекус2, 3=ужин, 4=перекус3, 5=ночной
    const slotTypes = ['snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'night'];

    // Получаем статистику приёма
    const mealStats = getMealStats(meal, pIndex);
    const isMain = isMainMeal(mealStats);

    // Определяем базовый тип по слоту
    let baseType = slotTypes[clamp(slotIndex, 0, 5)];

    // Корректируем: если попали в "перекус" слот, но это большой приём — 
    // проверяем соседние "основные" слоты
    if (baseType.startsWith('snack') && isMain) {
      // Ищем ближайший основной слот
      if (slotIndex <= 1) {
        baseType = 'lunch';
      } else if (slotIndex >= 2 && slotIndex <= 3) {
        baseType = 'dinner';
      }
      // Если после ужина большой приём — оставляем как есть (поздний ужин → snack3)
    }

    // Обратная корректировка: если попали в "основной" слот, но это маленький приём — 
    // оставляем как основной (обед может быть лёгким)

    // Проверяем не дублируется ли уже этот тип (избегаем 2 обеда)
    const usedTypes = new Set();
    for (let i = 0; i < mealIndex; i++) {
      const prevType = getMealTypeSimple(i, allMeals[i], allMeals, pIndex);
      usedTypes.add(prevType);
    }

    // Если обед уже был, а мы пытаемся назвать это обедом — делаем перекусом
    if (baseType === 'lunch' && usedTypes.has('lunch')) {
      baseType = 'snack2';
    }
    if (baseType === 'dinner' && usedTypes.has('dinner')) {
      baseType = 'snack3';
    }

    return { type: baseType, ...MEAL_TYPES[baseType] };
  }

  /**
   * Упрощённая версия для проверки дубликатов (без рекурсии)
   */
  function getMealTypeSimple(mealIndex, meal, allMeals, pIndex) {
    if (mealIndex === 0) return 'breakfast';

    const firstMeal = allMeals[0];
    const breakfastMinutes = timeToMinutes(firstMeal?.time);
    const currentMinutes = timeToMinutes(meal?.time);

    if (breakfastMinutes === null || currentMinutes === null) {
      return 'snack1';
    }

    const endOfDayMinutes = 27 * 60;
    const remainingMinutes = endOfDayMinutes - breakfastMinutes;
    const slotDuration = remainingMinutes / 6;
    const minutesSinceBreakfast = currentMinutes - breakfastMinutes;
    const slotIndex = Math.floor(minutesSinceBreakfast / slotDuration);

    const slotTypes = ['snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'night'];
    let baseType = slotTypes[clamp(slotIndex, 0, 5)];

    const mealStats = getMealStats(meal, pIndex);
    const isMain = isMainMeal(mealStats);

    if (baseType.startsWith('snack') && isMain) {
      if (slotIndex <= 1) baseType = 'lunch';
      else if (slotIndex >= 2 && slotIndex <= 3) baseType = 'dinner';
    }

    return baseType;
  }

  /**
   * Fallback определение типа (когда нет времени)
   */
  function fallbackMealType(mealIndex, meal, pIndex) {
    const mealStats = getMealStats(meal, pIndex);
    const isMain = isMainMeal(mealStats);

    // По порядку: 0=завтрак, 1=перекус/обед, 2=перекус/ужин, ...
    const fallbackTypes = [
      'breakfast',
      isMain ? 'lunch' : 'snack1',
      isMain ? 'dinner' : 'snack2',
      'snack3',
      'night'
    ];

    const type = fallbackTypes[clamp(mealIndex, 0, fallbackTypes.length - 1)];
    return { type, ...MEAL_TYPES[type] };
  }

  // Форматирование даты для отображения
  // Использует "эффективную" дату (до 3:00 — ещё вчера)
  function formatDateDisplay(isoDate) {
    const d = parseISO(isoDate);
    const effectiveToday = parseISO(todayISO()); // todayISO учитывает ночной порог
    const effectiveYesterday = new Date(effectiveToday);
    effectiveYesterday.setDate(effectiveYesterday.getDate() - 1);

    const isToday = d.toDateString() === effectiveToday.toDateString();
    const isYesterday = d.toDateString() === effectiveYesterday.toDateString();

    const dayName = d.toLocaleDateString('ru-RU', { weekday: 'short' });
    const dayNum = d.getDate();
    const month = d.toLocaleDateString('ru-RU', { month: 'short' });

    if (isToday) return { label: 'Сегодня', sub: `${dayNum} ${month}` };
    if (isYesterday) return { label: 'Вчера', sub: `${dayNum} ${month}` };
    return { label: `${dayNum} ${month}`, sub: dayName };
  }

  /**
   * Предпросмотр типа приёма для модалки создания.
   * Определяет тип по времени и существующим приёмам (без данных о продуктах).
   * @param {string} timeStr - время в формате "HH:MM"
   * @param {Array} existingMeals - массив существующих приёмов дня
   * @returns {string} - ключ типа (breakfast, lunch, dinner, snack1, snack2, snack3, night)
   */
  function getMealTypeForPreview(timeStr, existingMeals) {
    const meals = existingMeals || [];

    // Если нет приёмов — это будет первый, значит завтрак
    if (meals.length === 0) {
      return 'breakfast';
    }

    // Находим первый приём (завтрак)
    const sortedMeals = [...meals].sort((a, b) => {
      const aMin = timeToMinutes(a.time) || 0;
      const bMin = timeToMinutes(b.time) || 0;
      return aMin - bMin;
    });

    const breakfastMinutes = timeToMinutes(sortedMeals[0]?.time);
    const currentMinutes = timeToMinutes(timeStr);

    if (breakfastMinutes === null || currentMinutes === null) {
      return 'snack1'; // fallback
    }

    // Если новый приём раньше первого — он станет завтраком
    if (currentMinutes < breakfastMinutes) {
      return 'breakfast';
    }

    // Конец дня = 03:00 следующего дня = 27:00
    const endOfDayMinutes = 27 * 60;
    const remainingMinutes = endOfDayMinutes - breakfastMinutes;
    const slotDuration = remainingMinutes / 6;

    const minutesSinceBreakfast = currentMinutes - breakfastMinutes;
    const slotIndex = Math.floor(minutesSinceBreakfast / slotDuration);

    const slotTypes = ['snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'night'];
    return slotTypes[clamp(slotIndex, 0, 5)];
  }

  // === Calendar Day Indicators ===

  /**
   * Получает данные дня: калории и активность для расчёта реального target
   * @param {string} dateStr - Дата в формате YYYY-MM-DD
   * @param {Map} productsMap - Map продуктов (id => product)
   * @param {Object} profile - Профиль пользователя
   * @returns {{kcal: number, steps: number, householdMin: number, trainings: Array}} Данные дня
   */
  function getDayData(dateStr, productsMap, profile) {
    try {
      // Пробуем несколько источников clientId (через утилиту для корректного JSON.parse)
      const U = window.HEYS && window.HEYS.utils;
      const clientId = U && U.getCurrentClientId ? U.getCurrentClientId() : '';

      const scopedKey = clientId
        ? 'heys_' + clientId + '_dayv2_' + dateStr
        : 'heys_dayv2_' + dateStr;

      const raw = localStorage.getItem(scopedKey);
      if (!raw) return null;

      let dayData = null;
      if (raw.startsWith('¤Z¤')) {
        let str = raw.substring(3);
        const patterns = {
          '¤n¤': '"name":"', '¤k¤': '"kcal100"', '¤p¤': '"protein100"',
          '¤c¤': '"carbs100"', '¤f¤': '"fat100"'
        };
        for (const [code, pattern] of Object.entries(patterns)) {
          str = str.split(code).join(pattern);
        }
        dayData = JSON.parse(str);
      } else {
        dayData = JSON.parse(raw);
      }

      if (!dayData) return null;

      // Считаем калории и макросы из meals
      let totalKcal = 0, totalProt = 0, totalFat = 0, totalCarbs = 0;
      (dayData.meals || []).forEach(meal => {
        (meal.items || []).forEach(item => {
          const grams = +item.grams || 0;
          if (grams <= 0) return;

          // Ищем в productsMap по названию (lowercase), потом fallback на inline данные item
          const itemName = String(item.name || '').trim();
          const itemNameLower = itemName.toLowerCase();
          let product = itemName ? productsMap.get(itemNameLower) : null;

          // 🔄 Fallback: если не найден в переданном productsMap, проверяем актуальную базу
          // Это решает проблему когда продукт только что добавлен но props ещё не обновились
          if (!product && itemName && global.HEYS?.products?.getAll) {
            const freshProducts = global.HEYS.products.getAll();
            const freshProduct = freshProducts.find(p =>
              String(p.name || '').trim().toLowerCase() === itemNameLower
            );
            if (freshProduct) {
              product = freshProduct;
              // Добавляем в productsMap для следующих итераций (ключ lowercase)
              productsMap.set(itemNameLower, freshProduct);
              // Убираем из orphan если был там
              if (orphanProductsMap.has(itemName)) {
                orphanProductsMap.delete(itemName);
              }
              if (orphanProductsMap.has(itemNameLower)) {
                orphanProductsMap.delete(itemNameLower);
              }
            } else if (freshProducts.length > 0) {
              // DEBUG: Продукт не найден, но база загружена
              // Проверяем возможные причины
              const similar = freshProducts.filter(p => {
                const pName = String(p.name || '').trim().toLowerCase();
                return pName.includes(itemNameLower.slice(0, 10)) ||
                  itemNameLower.includes(pName.slice(0, 10));
              });
              if (similar.length > 0) {
                // Throttle: не логируем чаще раза в минуту для каждого продукта
                const lastLogged = orphanLoggedRecently.get(itemName) || 0;
                if (Date.now() - lastLogged > 60000) {
                  console.warn(`[HEYS] Orphan mismatch: "${itemName}" not found, similar: "${similar[0].name}"`);
                  orphanLoggedRecently.set(itemName, Date.now());
                }
              }
            }
          }

          const src = product || item; // item может иметь inline kcal100, protein100 и т.д.

          // Трекаем orphan-продукты (когда используется штамп вместо базы)
          // НЕ трекаем если база продуктов пуста или синхронизация не завершена
          if (!product && itemName && !isSyntheticEstimatedItem(item)) {
            // Получаем продукты из всех возможных источников
            let freshProducts = global.HEYS?.products?.getAll?.() || [];

            // Fallback: читаем напрямую из localStorage если HEYS.products пуст
            if (freshProducts.length === 0) {
              try {
                // Пробуем разные варианты ключей
                const U = global.HEYS?.utils;
                if (U && U.lsGet) {
                  freshProducts = U.lsGet('heys_products', []) || [];
                } else {
                  // Fallback без clientId-aware функции
                  const clientId = localStorage.getItem('heys_client_current') || '';
                  const keys = [
                    clientId ? `heys_${clientId}_products` : null,
                    'heys_products'
                  ].filter(Boolean);

                  for (const key of keys) {
                    const stored = localStorage.getItem(key);
                    if (stored) {
                      const parsed = JSON.parse(stored);
                      if (Array.isArray(parsed) && parsed.length > 0) {
                        freshProducts = parsed;
                        break;
                      }
                    }
                  }
                }
              } catch (e) { /* ignore */ }
            }

            // 🔧 v3.19.0: Получаем также shared products из кэша
            const sharedProducts = global.HEYS?.cloud?.getCachedSharedProducts?.() || [];

            const hasProductsLoaded = productsMap.size > 0 || freshProducts.length > 0 || sharedProducts.length > 0;

            // Дополнительная проверка: ищем продукт напрямую в свежей базе
            const foundInFresh = freshProducts.find(p =>
              String(p.name || '').trim().toLowerCase() === itemNameLower
            );

            // 🔧 v3.19.0: Также ищем в shared products
            const foundInShared = sharedProducts.find(p =>
              String(p.name || '').trim().toLowerCase() === itemNameLower
            );

            // Трекаем только если база загружена И продукт реально не найден в обеих базах
            if (hasProductsLoaded && !foundInFresh && !foundInShared) {
              trackOrphanProduct(item, dateStr);
            }
          }

          if (src.kcal100 != null || src.protein100 != null) {
            const mult = grams / 100;
            const prot = (+src.protein100 || 0) * mult;
            const fat = (+src.fat100 || 0) * mult;
            const carbs = (+src.carbs100 || (+src.simple100 || 0) + (+src.complex100 || 0)) * mult;

            // 🔄 v3.9.2: Используем TEF-формулу как в mealTotals (белок 3 ккал/г вместо 4)
            // TEF-aware: protein 3 kcal/g (25% TEF), carbs 4 kcal/g, fat 9 kcal/g
            const kcalTEF = 3 * prot + 4 * carbs + 9 * fat;
            totalKcal += kcalTEF;
            totalProt += prot;
            totalFat += fat;
            totalCarbs += carbs;
          }
        });
      });

      const sleepHours = getTotalSleepHours(dayData);

      // Считаем общие минуты тренировок
      let trainingMinutes = 0;
      (dayData.trainings || []).forEach(t => {
        if (t && t.z && Array.isArray(t.z)) {
          trainingMinutes += t.z.reduce((sum, m) => sum + (+m || 0), 0);
        }
      });

      return {
        kcal: Math.round(totalKcal),
        savedEatenKcal: +dayData.savedEatenKcal || 0, // 🆕 Сохранённые калории (приоритет над пересчитанными)
        prot: Math.round(totalProt),
        fat: Math.round(totalFat),
        carbs: Math.round(totalCarbs),
        steps: +dayData.steps || 0,
        waterMl: +dayData.waterMl || 0, // 🆕 Вода для персонализированных инсайтов
        householdMin: +dayData.householdMin || 0,
        trainings: dayData.trainings || [],
        trainingMinutes,
        weightMorning: +dayData.weightMorning || 0,
        deficitPct: dayData.deficitPct, // может быть undefined — тогда из профиля
        sleepHours,
        moodAvg: +dayData.moodAvg || 0,
        dayScore: +dayData.dayScore || 0,
        cycleDay: dayData.cycleDay || null, // День менструального цикла (1-N или null)
        isRefeedDay: dayData.isRefeedDay || false, // Загрузочный день
        refeedReason: dayData.refeedReason || null, // Причина refeed
        // 🔧 FIX: Сохранённая норма с учётом долга — используется для корректного отображения в sparkline
        savedDisplayOptimum: +dayData.savedDisplayOptimum || 0,
        // 🆕 v1.1: Флаги верификации низкокалорийных дней
        isFastingDay: dayData.isFastingDay || false, // Осознанное голодание — данные корректны
        isIncomplete: dayData.isIncomplete || false, // Не заполнен — исключить из статистик
        meals: dayData.meals || [] // 🆕 v1.1: Для определения пустого дня
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Рассчитать оптимум для конкретного дня
   * @param {Object} dayData - данные дня
   * @param {Object} profile - профиль пользователя
   * @param {Object} options - { includeNDTE?: boolean }
   * @returns {{ optimum: number, baseOptimum: number|null, deficitPct: number, tdee: number }}
   */
  function getOptimumForDay(dayData, profile, options = {}) {
    const day = dayData || {};
    const prof = profile || getProfile() || {};
    const savedDisplayOptimum = +day.savedDisplayOptimum || 0;
    const dayDeficit = (day.deficitPct !== '' && day.deficitPct != null) ? +day.deficitPct : (prof.deficitPctTarget || 0);

    if (savedDisplayOptimum > 0) {
      return {
        optimum: savedDisplayOptimum,
        baseOptimum: null,
        deficitPct: dayDeficit,
        tdee: 0
      };
    }

    if (global.HEYS?.TDEE?.calculate) {
      const tdeeResult = global.HEYS.TDEE.calculate(day, prof, { lsGet, includeNDTE: options.includeNDTE }) || {};
      const optimum = tdeeResult.optimum || 0;
      const baseExpenditure = tdeeResult.baseExpenditure || 0;
      const deficitPct = (tdeeResult.deficitPct != null) ? tdeeResult.deficitPct : dayDeficit;
      const baseOptimum = baseExpenditure
        ? Math.round(baseExpenditure * (1 + deficitPct / 100))
        : (optimum || 0);
      return {
        optimum,
        baseOptimum,
        deficitPct,
        tdee: tdeeResult.tdee || 0
      };
    }

    if (!prof.weight || !prof.height || !prof.age) {
      return {
        optimum: 2000,
        baseOptimum: 2000,
        deficitPct: dayDeficit,
        tdee: 0
      };
    }

    const bmr = calcBMR(prof);
    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };
    const multiplier = activityMultipliers[prof.activityLevel] || 1.55;
    const baseExpenditure = Math.round(bmr * multiplier);
    const optimum = Math.round(baseExpenditure * (1 + dayDeficit / 100));

    return {
      optimum,
      baseOptimum: baseExpenditure,
      deficitPct: dayDeficit,
      tdee: baseExpenditure
    };
  }

  /**
   * Рассчитать оптимумы для набора дат
   * @param {string[]} dateStrs
   * @param {Object} options - { profile?: Object, includeNDTE?: boolean, daysByDate?: Map }
   * @returns {Map<string, { optimum: number, baseOptimum: number|null, deficitPct: number, tdee: number }>}
   */
  function getOptimumForDays(dateStrs, options = {}) {
    const result = new Map();
    const prof = options.profile || getProfile() || {};
    const daysByDate = options.daysByDate || new Map();

    (dateStrs || []).forEach((dateStr) => {
      const dayData = daysByDate.get(dateStr) || loadDay(dateStr);
      result.set(dateStr, getOptimumForDay(dayData, prof, options));
    });

    return result;
  }

  /**
   * Вычисляет калории за день напрямую из localStorage (legacy wrapper)
   */
  function getDayCalories(dateStr, productsMap) {
    const data = getDayData(dateStr, productsMap, {});
    return data ? data.kcal : 0;
  }

  /**
   * Получает Map продуктов для вычисления калорий
   * @returns {Map} productsMap (name => product)
   */
  function getProductsMap() {
    const productsMap = new Map();
    try {
      // Используем HEYS.store.get который знает правильный ключ с clientId
      let products = [];
      if (window.HEYS && window.HEYS.store && typeof window.HEYS.store.get === 'function') {
        products = window.HEYS.store.get('heys_products', []);
      } else {
        // Fallback: пробуем напрямую из localStorage
        const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
        const productsKey = clientId
          ? 'heys_' + clientId + '_products'
          : 'heys_products';
        const productsRaw = localStorage.getItem(productsKey);

        if (productsRaw) {
          if (productsRaw.startsWith('¤Z¤')) {
            let str = productsRaw.substring(3);
            const patterns = {
              '¤n¤': '"name":"', '¤k¤': '"kcal100"', '¤p¤': '"protein100"',
              '¤c¤': '"carbs100"', '¤f¤': '"fat100"', '¤s¤': '"simple100"',
              '¤x¤': '"complex100"', '¤b¤': '"badFat100"', '¤g¤': '"goodFat100"',
              '¤t¤': '"trans100"', '¤i¤': '"fiber100"', '¤G¤': '"gi"', '¤h¤': '"harmScore"'
            };
            for (const [code, pattern] of Object.entries(patterns)) {
              str = str.split(code).join(pattern);
            }
            products = JSON.parse(str);
          } else {
            products = JSON.parse(productsRaw);
          }
        }
      }
      // Если products — объект с полем products, извлекаем массив
      if (products && !Array.isArray(products) && Array.isArray(products.products)) {
        products = products.products;
      }
      // Финальная проверка что это массив
      if (!Array.isArray(products)) {
        products = [];
      }
      products.forEach(p => {
        if (p && p.name) {
          const name = String(p.name).trim();
          if (name) productsMap.set(name, p);
        }
      });
    } catch (e) {
      // Тихий fallback — productsMap не критичен
    }
    return productsMap;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🚀 LAZY-LOADING DAYS — Оптимизированная загрузка дней
  // ═══════════════════════════════════════════════════════════════════

  // Кэш загруженных дней (для предотвращения повторных чтений)
  const DAYS_CACHE = new Map(); // dateStr => { data, timestamp }
  const DAYS_CACHE_TTL = 5 * 60 * 1000; // 5 минут TTL
  const TDEE_CACHE = new Map(); // key => { data, timestamp }
  const TDEE_CACHE_TTL = 5 * 60 * 1000; // 5 минут TTL
  let TDEE_CACHE_HITS = 0;
  let TDEE_CACHE_MISSES = 0;

  /**
   * Lazy-загрузка дней — загружает только последние N дней
   * Оптимизирует холодный старт приложения
   * 
   * @param {number} daysBack - Сколько дней назад загружать (default: 30)
   * @param {Object} options - Опции
   * @param {boolean} options.forceRefresh - Игнорировать кэш
   * @param {Function} options.onProgress - Callback прогресса (loaded, total)
   * @returns {Map<string, Object>} Map дат с данными дней
   */
  function loadRecentDays(daysBack = 30, options = {}) {
    const { forceRefresh = false, onProgress } = options;
    const result = new Map();
    const now = Date.now();
    const today = new Date();

    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = fmtDate(d);

      // Проверяем кэш
      if (!forceRefresh && DAYS_CACHE.has(dateStr)) {
        const cached = DAYS_CACHE.get(dateStr);
        if (now - cached.timestamp < DAYS_CACHE_TTL) {
          result.set(dateStr, cached.data);
          if (onProgress) onProgress(i + 1, daysBack);
          continue;
        }
      }

      // Загружаем день
      const dayData = lsGet('heys_dayv2_' + dateStr, null);
      if (dayData && typeof dayData === 'object') {
        result.set(dateStr, dayData);
        DAYS_CACHE.set(dateStr, { data: dayData, timestamp: now });
      }

      if (onProgress) onProgress(i + 1, daysBack);
    }

    return result;
  }

  /**
   * Lazy-загрузка одного дня с кэшированием
   * @param {string} dateStr - Дата в формате YYYY-MM-DD
   * @param {boolean} forceRefresh - Игнорировать кэш
   * @returns {Object|null} Данные дня или null
   */
  function loadDay(dateStr, forceRefresh = false) {
    const now = Date.now();

    // Проверяем кэш
    if (!forceRefresh && DAYS_CACHE.has(dateStr)) {
      const cached = DAYS_CACHE.get(dateStr);
      if (now - cached.timestamp < DAYS_CACHE_TTL) {
        return cached.data;
      }
    }

    // Загружаем день
    const dayData = lsGet('heys_dayv2_' + dateStr, null);
    if (dayData && typeof dayData === 'object') {
      DAYS_CACHE.set(dateStr, { data: dayData, timestamp: now });
      return dayData;
    }

    return null;
  }

  /**
   * Инвалидирует кэш дня (вызывать после сохранения)
   * @param {string} dateStr - Дата в формате YYYY-MM-DD
   */
  function invalidateDayCache(dateStr) {
    DAYS_CACHE.delete(dateStr);
    if (!dateStr) return;
    const prefix = dateStr + '|';
    Array.from(TDEE_CACHE.keys()).forEach((key) => {
      if (key.startsWith(prefix)) TDEE_CACHE.delete(key);
    });
  }

  /**
   * Очищает весь кэш дней
   */
  function clearDaysCache() {
    DAYS_CACHE.clear();
    TDEE_CACHE.clear();
    TDEE_CACHE_HITS = 0;
    TDEE_CACHE_MISSES = 0;
  }

  /**
   * Получить статистику кэша
   * @returns {{size: number, hitRate: number}}
   */
  function getDaysCacheStats() {
    let validCount = 0;
    const now = Date.now();

    DAYS_CACHE.forEach((cached) => {
      if (now - cached.timestamp < DAYS_CACHE_TTL) {
        validCount++;
      }
    });

    return {
      size: DAYS_CACHE.size,
      validEntries: validCount,
      expiredEntries: DAYS_CACHE.size - validCount
    };
  }

  /**
   * Получить статистику TDEE-кэша
   * @returns {{size: number, validEntries: number, expiredEntries: number, hits: number, misses: number, hitRate: number}}
   */
  function getTdeeCacheStats() {
    let validCount = 0;
    const now = Date.now();

    TDEE_CACHE.forEach((cached) => {
      if (now - cached.timestamp < TDEE_CACHE_TTL) {
        validCount++;
      }
    });

    const total = TDEE_CACHE_HITS + TDEE_CACHE_MISSES;
    const hitRate = total > 0 ? Math.round((TDEE_CACHE_HITS / total) * 1000) / 10 : 0;

    return {
      size: TDEE_CACHE.size,
      validEntries: validCount,
      expiredEntries: TDEE_CACHE.size - validCount,
      hits: TDEE_CACHE_HITS,
      misses: TDEE_CACHE_MISSES,
      hitRate
    };
  }

  /**
   * Получить TDEE/optimum для дня с кэшированием
   * @param {string} dateStr
   * @param {Object} profile
   * @param {Object} options - { includeNDTE?: boolean, dayData?: Object }
   * @returns {{ tdee: number, optimum: number, baseExpenditure: number|null, deficitPct: number }}
   */
  function getDayTdee(dateStr, profile, options = {}) {
    if (!dateStr) {
      return { tdee: 0, optimum: 0, baseExpenditure: null, deficitPct: (profile?.deficitPctTarget || 0) };
    }

    const includeNDTE = !!options.includeNDTE;
    const productsSig = options.products ? productsSignature(options.products) : (options.pIndex ? 'pindex' : 'nopindex');
    const cacheKey = dateStr + '|' + (includeNDTE ? '1' : '0') + '|' + productsSig;
    const now = Date.now();

    if (TDEE_CACHE.has(cacheKey)) {
      const cached = TDEE_CACHE.get(cacheKey);
      if (now - cached.timestamp < TDEE_CACHE_TTL) {
        TDEE_CACHE_HITS += 1;
        return cached.data;
      }
    }

    TDEE_CACHE_MISSES += 1;

    const prof = profile || getProfile() || {};
    const dayDataRaw = options.dayData || loadDay(dateStr);
    const dayData = dayDataRaw ? { ...dayDataRaw, date: dayDataRaw.date || dateStr } : dayDataRaw;
    const resolvedPIndex = options.pIndex || (options.products ? buildProductIndex(options.products) : null);

    let result = null;
    if (dayData && global.HEYS?.TDEE?.calculate) {
      const tdeeResult = global.HEYS.TDEE.calculate(dayData, prof, { lsGet, includeNDTE, pIndex: resolvedPIndex }) || {};
      result = {
        tdee: tdeeResult.tdee || 0,
        optimum: tdeeResult.optimum || 0,
        baseExpenditure: tdeeResult.baseExpenditure || null,
        deficitPct: (tdeeResult.deficitPct != null) ? tdeeResult.deficitPct : (prof.deficitPctTarget || 0)
      };
    } else {
      const optInfo = getOptimumForDay(dayData, prof, { includeNDTE });
      result = {
        tdee: optInfo.tdee || optInfo.baseOptimum || optInfo.optimum || 0,
        optimum: optInfo.optimum || 0,
        baseExpenditure: optInfo.baseOptimum || null,
        deficitPct: optInfo.deficitPct || (prof.deficitPctTarget || 0)
      };
    }

    TDEE_CACHE.set(cacheKey, { data: result, timestamp: now });
    return result;
  }

  /**
   * Предзагрузка дней для месяца (для календаря)
   * Загружает данные асинхронно чтобы не блокировать UI
   * 
   * @param {number} year
   * @param {number} month - 0-11
   * @returns {Promise<Map<string, Object>>}
   */
  async function preloadMonthDays(year, month) {
    return new Promise((resolve) => {
      const result = new Map();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // Используем requestIdleCallback для фоновой загрузки
      const loadBatch = (startDay, batchSize = 5) => {
        const endDay = Math.min(startDay + batchSize, daysInMonth + 1);

        for (let d = startDay; d < endDay; d++) {
          const dateStr = fmtDate(new Date(year, month, d));
          const dayData = loadDay(dateStr);
          if (dayData) {
            result.set(dateStr, dayData);
          }
        }

        if (endDay <= daysInMonth) {
          // Продолжаем загрузку в следующем idle callback
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => loadBatch(endDay, batchSize));
          } else {
            setTimeout(() => loadBatch(endDay, batchSize), 0);
          }
        } else {
          // Загрузка завершена
          resolve(result);
        }
      };

      // Начинаем загрузку
      loadBatch(1);
    });
  }

  /**
   * Вычисляет Set активных дней для месяца
   * Активный день = съедено ≥ 1/3 BMR (реальное ведение дневника)
   * 
   * @param {number} year - Год
   * @param {number} month - Месяц (0-11)
   * @param {Object} profile - Профиль пользователя {weight, height, age, sex, deficitPctTarget}
   * @param {Array} products - Массив продуктов (передаётся из App state)
   * @returns {Map<string, {kcal: number, target: number, ratio: number}>} Map дат с данными
   */
  function getActiveDaysForMonth(year, month, profile, products) {
    const daysData = new Map();

    try {
      // Получаем базовые данные из профиля
      const profileWeight = +(profile && profile.weight) || 70;
      const deficitPct = +(profile && profile.deficitPctTarget) || 0;
      const sex = (profile && profile.sex) || 'male';
      const baseBmr = calcBMR(profileWeight, profile || {});
      const threshold = Math.round(baseBmr / 3); // 1/3 BMR — минимум для "активного" дня

      // Строим Map продуктов из переданного массива (ключ = lowercase name)
      const productsMap = new Map();
      const productsArr = Array.isArray(products) ? products : [];
      productsArr.forEach(p => {
        if (p && p.name) {
          const name = String(p.name).trim().toLowerCase();
          if (name) productsMap.set(name, p);
        }
      });
      const pIndex = buildProductIndex(productsArr);

      // Проходим по всем дням месяца
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = fmtDate(new Date(year, month, d));
        const dayInfo = getDayData(dateStr, productsMap, profile);

        // Пропускаем дни без данных. Если есть цикл или хотя бы один приём пищи — показываем даже при низких ккал
        const hasCycleDay = dayInfo && dayInfo.cycleDay != null;
        const hasMeals = !!(dayInfo && Array.isArray(dayInfo.meals) && dayInfo.meals.length > 0);
        if (!dayInfo || (dayInfo.kcal < threshold && !hasCycleDay && !hasMeals)) continue;

        // Если день только с cycleDay (без еды) — добавляем минимальную запись
        if (dayInfo.kcal < threshold && hasCycleDay) {
          daysData.set(dateStr, {
            kcal: 0, target: 0, ratio: 0,
            hasTraining: false, trainingTypes: [], trainingMinutes: 0,
            moodAvg: null, sleepHours: 0, dayScore: 0,
            prot: 0, fat: 0, carbs: 0,
            cycleDay: dayInfo.cycleDay
          });
          continue;
        }

        // Используем вес дня если есть, иначе из профиля
        const weight = dayInfo.weightMorning || profileWeight;
        const bmr = calcBMR(weight, profile || {});

        // Шаги: формула stepsKcal(steps, weight, sex, 0.7)
        const steps = dayInfo.steps || 0;

        // Быт: householdMin × kcalPerMin(2.5, weight)
        const householdMin = dayInfo.householdMin || 0;

        // Тренировки: суммируем ккал из зон z (как на экране дня — только первые 3)
        const trainings = (dayInfo.trainings || []).slice(0, 3); // максимум 3 тренировки

        // Собираем типы тренировок с реальными минутами
        const trainingTypes = trainings
          .filter(t => t && t.z && Array.isArray(t.z) && t.z.some(z => z > 0))
          .map(t => t.type || 'cardio');
        const hasTraining = trainingTypes.length > 0;

        const dayForTdee = { ...dayInfo, date: dayInfo.date || dateStr };
        const tdeeResult = global.HEYS?.TDEE?.calculate
          ? global.HEYS.TDEE.calculate(dayForTdee, profile || {}, { lsGet, includeNDTE: true, pIndex })
          : null;
        const tdee = tdeeResult?.tdee || (bmr + stepsKcal(steps, weight, sex, 0.7) + Math.round(householdMin * kcalPerMin(2.5, weight)));
        // Используем дефицит дня если есть (не пустая строка и не null), иначе из профиля
        const dayDeficit = (tdeeResult?.deficitPct != null)
          ? tdeeResult.deficitPct
          : ((dayInfo.deficitPct !== '' && dayInfo.deficitPct != null) ? +dayInfo.deficitPct : deficitPct);
        const calculatedTarget = tdeeResult?.optimum || Math.round(tdee * (1 + dayDeficit / 100));
        const calculatedBaseTarget = tdeeResult?.baseExpenditure
          ? Math.round(tdeeResult.baseExpenditure * (1 + dayDeficit / 100))
          : calculatedTarget;

        // 🔧 FIX: Используем сохранённую норму с долгом если есть, иначе расчётную
        // Это позволяет показывать корректную линию нормы в sparkline для прошлых дней
        const target = dayInfo.savedDisplayOptimum > 0 ? dayInfo.savedDisplayOptimum : calculatedTarget;

        // 🔧 FIX: Используем сохранённые калории если есть, иначе пересчитанные
        // savedEatenKcal гарантирует точное значение, которое показывалось пользователю в тот день
        const kcal = dayInfo.savedEatenKcal > 0 ? dayInfo.savedEatenKcal : dayInfo.kcal;

        // ratio: 1.0 = идеально в цель, <1 недоел, >1 переел
        const ratio = target > 0 ? kcal / target : 0;

        // moodAvg для mood-полосы на графике
        const moodAvg = dayInfo.moodAvg ? +dayInfo.moodAvg : null;

        // Дополнительные данные для sparkline и персонализированных инсайтов
        const sleepHours = dayInfo.sleepHours || 0;
        const trainingMinutes = dayInfo.trainingMinutes || 0;
        const prot = dayInfo.prot || 0;
        const fat = dayInfo.fat || 0;
        const carbs = dayInfo.carbs || 0;
        const dayScore = dayInfo.dayScore || 0;
        const cycleDay = dayInfo.cycleDay || null; // День менструального цикла
        // steps уже объявлен выше для расчёта stepsKcal
        const waterMl = dayInfo.waterMl || 0; // 🆕 Вода для персонализированных инсайтов
        const weightMorning = dayInfo.weightMorning || 0; // 🆕 Вес для персонализированных инсайтов

        daysData.set(dateStr, {
          kcal, target, ratio, // 🔧 FIX: kcal теперь использует savedEatenKcal если есть
          baseTarget: calculatedBaseTarget, // 🔧 Базовая норма БЕЗ долга — для расчёта caloricDebt
          spent: tdee, // 🆕 v5.0: Затраты дня (TDEE) для расчета дефицита/профицита
          hasTraining, trainingTypes, trainingMinutes,
          moodAvg, sleepHours, dayScore,
          prot, fat, carbs,
          steps, waterMl, weightMorning, // 🆕 Добавлены для персонализированных инсайтов
          cycleDay,
          isRefeedDay: dayInfo.isRefeedDay || false,
          refeedReason: dayInfo.refeedReason || null,
          // 🆕 v1.1: Флаги верификации низкокалорийных дней
          isFastingDay: dayInfo.isFastingDay || false,
          isIncomplete: dayInfo.isIncomplete || false
        });
      }
    } catch (e) {
      // Тихий fallback — activeDays для календаря не критичны,
      // но ошибку стоит залогировать, иначе отладка невозможна.
      try {
        if (typeof HEYS !== 'undefined' && HEYS.analytics && HEYS.analytics.trackError) {
          HEYS.analytics.trackError(e, {
            where: 'day_utils.getActiveDaysForMonth',
            year,
            month,
            hasProfile: !!profile,
            productsLen: Array.isArray(products) ? products.length : null,
          });
        }
      } catch (_) { }
    }

    return daysData;
  }

  // === Exports ===
  // Всё экспортируется через HEYS.dayUtils
  // POPULAR_CACHE — приватный, не экспортируется (инкапсуляция)
  HEYS.dayUtils = {
    // Haptic
    haptic: hapticFn,
    // Date/Time
    pad2,
    todayISO,
    fmtDate,
    parseISO,
    uid,
    formatDateDisplay,
    // Night time logic (приёмы 00:00-02:59 относятся к предыдущему дню)
    NIGHT_HOUR_THRESHOLD,
    isNightTime,
    getEffectiveDate,
    getNextDay,
    // Storage
    lsGet,
    lsSet,
    // Math
    clamp,
    r0,
    r1,
    scale,
    sleepHours,
    normalizeDaySleepMinutes,
    getNightSleepHours,
    getTotalSleepHours,
    // Models
    ensureDay,
    buildProductIndex,
    getProductFromItem,
    per100,
    // Data
    loadMealsForDate,
    loadMealsRaw,
    productsSignature,
    computePopularProducts,
    // Profile/Calculations
    getProfile,
    calcBMR,
    kcalPerMin,
    stepsKcal,
    // Time/Sleep
    parseTime,
    sleepHours,
    formatMealTime,
    // Hours Order (для wheel picker с ночными часами)
    HOURS_ORDER,
    wheelIndexToHour,
    hourToWheelIndex,
    // Meal Type Classification
    MEAL_TYPES,
    MAIN_MEAL_THRESHOLDS,
    getMealStats,
    isMainMeal,
    timeToMinutes,
    getMealType,
    getMealTypeSimple,
    getMealTypeForPreview,
    fallbackMealType,
    // Calendar indicators
    getDayCalories,
    getProductsMap,
    getActiveDaysForMonth,
    getDayData,
    getOptimumForDay,
    getOptimumForDays,
    getDayTdee,
    getTdeeCacheStats,
    // 🚀 Lazy-loading API
    loadRecentDays,
    loadDay,
    invalidateDayCache,
    clearDaysCache,
    getDaysCacheStats,
    preloadMonthDays
  };

})(window);


/* ===== heys_day_pickers.js ===== */
// heys_day_pickers.js — DatePicker and Calendar components

;(function(global){
  // heys_day_pickers.js — DatePicker и Calendar компоненты
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;
  
  // Lazy getter for dayUtils (loaded asynchronously)
  const getDayUtils = () => HEYS.dayUtils || {};

  // Компактный DatePicker с dropdown
  // activeDays: Map<dateStr, {kcal, target, ratio}> — данные о заполненных днях (опционально)
  // getActiveDaysForMonth: (year, month) => Map — функция для загрузки данных при смене месяца
  function DatePicker({valueISO, onSelect, onRemove, activeDays, getActiveDaysForMonth}) {
    const utils = getDayUtils();
    if (!utils.parseISO || !utils.todayISO || !utils.fmtDate) {
      console.error('[heys_day_pickers] dayUtils not loaded yet');
      return null;
    }
    const { parseISO, todayISO, fmtDate, formatDateDisplay } = utils;
    
    const [isOpen, setIsOpen] = React.useState(false);
    const [cur, setCur] = React.useState(parseISO(valueISO || todayISO()));
    const [dropdownPos, setDropdownPos] = React.useState({ top: 0, right: 0 });
    const [tooltip, setTooltip] = React.useState(null); // { x, y, text }
    const [monthData, setMonthData] = React.useState(null); // Данные для текущего месяца календаря
    const wrapperRef = React.useRef(null);
    const triggerRef = React.useRef(null);
    
    const y = cur.getFullYear(), m = cur.getMonth();
    
    // Загружаем данные при смене месяца
    React.useEffect(() => {
      if (getActiveDaysForMonth) {
        try {
          const data = getActiveDaysForMonth(y, m);
          setMonthData(data);
        } catch (e) {
          setMonthData(null);
        }
      }
    }, [y, m, getActiveDaysForMonth]);
    
    // Преобразуем activeDays в Map (fallback если нет getActiveDaysForMonth)
    const daysDataMap = React.useMemo(() => {
      // Приоритет: данные для текущего месяца → переданные activeDays
      if (monthData instanceof Map) return monthData;
      if (activeDays instanceof Map) return activeDays;
      return new Map();
    }, [monthData, activeDays]);
    
    // Функция для расчёта цвета фона — используем централизованный ratioZones
    const rz = HEYS.ratioZones;
    function getDayBgColor(ratio) {
      if (!ratio || ratio <= 0) return null;
      return rz ? rz.getGradientColor(ratio, 0.35) : 'rgba(156, 163, 175, 0.35)';
    }
    
    // Функция для получения эмодзи статуса — используем ratioZones
    function getStatusEmoji(ratio) {
      return rz ? rz.getEmoji(ratio) : '';
    }
    
    // Вычисляем streak (серию хороших дней) — используем ratioZones.isSuccess()
    const streakInfo = React.useMemo(() => {
      if (daysDataMap.size === 0) return { count: 0, isActive: false };
      
      let count = 0;
      let checkDate = new Date();
      checkDate.setHours(12);
      
      // Проверяем дни назад от сегодня
      for (let i = 0; i < 30; i++) {
        const dateStr = fmtDate(checkDate);
        const dayData = daysDataMap.get(dateStr);
        
        // Хороший день = isSuccess из ratioZones (good или perfect)
        if (dayData && rz && rz.isSuccess(dayData.ratio)) {
          count++;
        } else if (i > 0) { // Первый день (сегодня) может быть без данных
          break;
        }
        
        checkDate.setDate(checkDate.getDate() - 1);
      }
      
      return { count, isActive: count > 0 };
    }, [daysDataMap, fmtDate]);
    
    React.useEffect(() => { setCur(parseISO(valueISO || todayISO())); }, [valueISO]);
    
    // Вычисляем позицию при открытии
    React.useEffect(() => {
      if (isOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right
        });
      }
    }, [isOpen]);
    
    const first = new Date(y, m, 1), start = (first.getDay() + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < start; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(new Date(y, m, d));
    
    function same(a, b) {
      return a && b && a.getFullYear() === b.getFullYear() && 
             a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }
    
    const sel = parseISO(valueISO || todayISO());
    const today = parseISO(todayISO()); // Учитываем ночной порог (до 3:00 = вчера)
    const dateInfo = formatDateDisplay(valueISO || todayISO());
    
    // Проверяем, показывается ли текущий месяц
    const isCurrentMonth = y === today.getFullYear() && m === today.getMonth();
    
    // Обработчик hover для tooltip
    const handleDayHover = (e, dayData, dateStr) => {
      if (!dayData) {
        setTooltip(null);
        return;
      }
      const rect = e.target.getBoundingClientRect();
      const pct = Math.round(dayData.ratio * 100);
      const status = dayData.ratio > 1.15 ? 'переел' : 
                    dayData.ratio > 1 ? 'чуть больше' :
                    dayData.ratio >= 0.9 ? 'отлично!' :
                    dayData.ratio >= 0.75 ? 'хорошо' : 'мало';
      setTooltip({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        text: `${dayData.kcal} ккал (${pct}%) — ${status}`
      });
    };
    
    return React.createElement('div', { className: 'date-picker', ref: wrapperRef },
      // Кнопка-триггер
      React.createElement('button', {
        ref: triggerRef,
        className: 'date-picker-trigger' + (isOpen ? ' open' : ''),
        onClick: () => setIsOpen(!isOpen)
      },
        React.createElement('span', { className: 'date-picker-icon' }, '📅'),
        React.createElement('span', { className: 'date-picker-text' },
          React.createElement('span', { className: 'date-picker-main' }, dateInfo.label),
          React.createElement('span', { className: 'date-picker-sub' }, dateInfo.sub)
        ),
        React.createElement('span', { className: 'date-picker-arrow' }, isOpen ? '▲' : '▼')
      ),
      // Backdrop и Dropdown через portal в body
      isOpen && ReactDOM.createPortal(
        React.createElement(React.Fragment, null,
          React.createElement('div', { 
            className: 'date-picker-backdrop',
            onClick: () => { setIsOpen(false); setTooltip(null); }
          }),
          // Tooltip
          tooltip && React.createElement('div', {
            className: 'date-picker-tooltip',
            style: { left: tooltip.x + 'px', top: tooltip.y + 'px' }
          }, tooltip.text),
          React.createElement('div', { 
            className: 'date-picker-dropdown',
            style: { top: dropdownPos.top + 'px', right: dropdownPos.right + 'px' }
          },
        React.createElement('div', { className: 'date-picker-header' },
          React.createElement('button', { 
            className: 'date-picker-nav', 
            onClick: () => setCur(new Date(y, m - 1, 1)) 
          }, '‹'),
          React.createElement('span', { className: 'date-picker-title' },
            cur.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })
          ),
          React.createElement('button', { 
            className: 'date-picker-nav', 
            onClick: () => setCur(new Date(y, m + 1, 1)) 
          }, '›')
        ),
        // Кнопка "Вернуться к сегодня" если не текущий месяц
        !isCurrentMonth && React.createElement('button', {
          className: 'date-picker-goto-today',
          onClick: () => setCur(new Date())
        }, '↩ Вернуться к сегодня'),
        React.createElement('div', { className: 'date-picker-weekdays' },
          ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => 
            React.createElement('div', { key: d, className: 'date-picker-weekday' }, d)
          )
        ),
        React.createElement('div', { className: 'date-picker-days' },
          cells.map((dt, i) => {
            if (dt == null) {
              return React.createElement('div', { key: 'e' + i, className: 'date-picker-day empty' });
            }
            const dateStr = fmtDate(dt);
            const dayData = daysDataMap.get(dateStr);
            const isSel = same(dt, sel);
            const isToday = same(dt, today);
            const hasCycle = dayData?.cycleDay != null;
            const hasRefeed = dayData?.isRefeedDay === true;
            const hasRealData = dayData && dayData.kcal > 0; // Есть реальные данные (еда)
            
            // Фон только для дней с едой
            const bgColor = hasRealData ? getDayBgColor(dayData.ratio) : null;
            // Не показываем градиентный фон для сегодня и выбранного дня
            const cellStyle = bgColor && !isSel && !isToday ? { background: bgColor } : undefined;
            
            // Emoji только для дней с едой (не для пустых дней с cycleDay)
            const statusEmoji = hasRealData ? getStatusEmoji(dayData.ratio) : '';
            
            return React.createElement('div', {
              key: dt.toISOString(),
              className: [
                'date-picker-day',
                isSel ? 'selected' : '',
                isToday ? 'today' : '',
                hasRealData ? 'has-data' : '',
                hasCycle ? 'has-cycle' : '',
                hasRefeed ? 'has-refeed' : ''
              ].join(' ').trim(),
              style: cellStyle,
              onClick: () => { onSelect(dateStr); setIsOpen(false); setTooltip(null); },
              onMouseEnter: (e) => handleDayHover(e, dayData, dateStr),
              onMouseLeave: () => setTooltip(null)
            }, 
              React.createElement('span', { className: 'day-number' }, dt.getDate()),
              statusEmoji && React.createElement('span', { className: 'day-status' }, statusEmoji),
              hasCycle && React.createElement('span', { className: 'day-cycle-dot' }, '🌸'),
              hasRefeed && React.createElement('span', { className: 'day-refeed-dot' }, '🍕')
            );
          })
        ),
        // Streak индикатор
        streakInfo.count > 1 && React.createElement('div', { className: 'date-picker-streak' },
          '🔥 ', streakInfo.count, ' дней подряд в норме!'
        ),
        // Легенда цветов
        React.createElement('div', { className: 'date-picker-legend' },
          React.createElement('span', { className: 'legend-item good' }, '● норма'),
          React.createElement('span', { className: 'legend-item warn' }, '● мало'),
          React.createElement('span', { className: 'legend-item bad' }, '● переел'),
          React.createElement('span', { className: 'legend-item cycle' }, '🌸 цикл'),
          React.createElement('span', { className: 'legend-item refeed' }, '🍕 refeed')
        ),
        React.createElement('div', { className: 'date-picker-footer' },
          React.createElement('button', {
            className: 'date-picker-btn today-btn',
            onClick: () => { onSelect(todayISO()); setIsOpen(false); }
          }, '📍 Сегодня'),
          React.createElement('button', {
            className: 'date-picker-btn delete-btn',
            onClick: () => { onRemove(); setIsOpen(false); }
          }, '🗑️ Очистить')
        )
      )
    ), document.body)
    );
  }

  // Полноэкранный Calendar компонент
  // activeDays: Map<dateStr, {kcal, target, ratio}> — данные о заполненных днях
  function Calendar({valueISO,onSelect,onRemove,activeDays}){
    const utils = getDayUtils();
    // Explicit check instead of silent fallbacks
    if (!utils.parseISO || !utils.todayISO || !utils.fmtDate) {
      console.error('[heys_day_pickers] Calendar: dayUtils not loaded yet');
      return null;
    }
    const { parseISO, todayISO, fmtDate } = utils;
    
    const [cur,setCur]=React.useState(parseISO(valueISO||todayISO()));
    React.useEffect(()=>{ setCur(parseISO(valueISO||todayISO())); },[valueISO]);
    const y=cur.getFullYear(),m=cur.getMonth(),first=new Date(y,m,1),start=(first.getDay()+6)%7,dim=new Date(y,m+1,0).getDate();
    const cells=[]; for(let i=0;i<start;i++) cells.push(null); for(let d=1;d<=dim;d++) cells.push(new Date(y,m,d));
    function same(a,b){ return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
    const sel=parseISO(valueISO||todayISO()); const today=parseISO(todayISO()); // Учитываем ночной порог
    
    // Преобразуем activeDays в Map для быстрого поиска
    const daysDataMap = React.useMemo(() => {
      if (activeDays instanceof Map) return activeDays;
      return new Map();
    }, [activeDays]);
    
    // Используем централизованный ratioZones для всей логики цветов
    const rz = HEYS.ratioZones;
    
    // Проверка является ли день "успешным" (good или perfect)
    function isGoodDay(ratio) {
      return rz ? rz.isSuccess(ratio) : (ratio && ratio >= 0.75 && ratio <= 1.1);
    }
    
    // Функция для расчёта цвета фона с градиентом
    function getDayBgColor(ratio) {
      if (!ratio || ratio <= 0) return null;
      return rz ? rz.getGradientColor(ratio, 0.35) : 'rgba(156, 163, 175, 0.35)';
    }
    
    // Вычисляем streak информацию для каждого дня
    const streakInfo = React.useMemo(() => {
      const info = new Map();
      
      // Проходим по всем дням месяца
      for (let d = 1; d <= dim; d++) {
        const dt = new Date(y, m, d);
        const dateStr = fmtDate(dt);
        const dayData = daysDataMap.get(dateStr);
        const isGood = dayData && isGoodDay(dayData.ratio);
        
        if (!isGood) continue;
        
        // Проверяем предыдущий день
        const prevDt = new Date(y, m, d - 1);
        const prevStr = fmtDate(prevDt);
        const prevData = daysDataMap.get(prevStr);
        const prevGood = prevData && isGoodDay(prevData.ratio);
        
        // Проверяем следующий день
        const nextDt = new Date(y, m, d + 1);
        const nextStr = fmtDate(nextDt);
        const nextData = daysDataMap.get(nextStr);
        const nextGood = nextData && isGoodDay(nextData.ratio);
        
        // Определяем позицию в streak
        let streakClass = '';
        if (prevGood && nextGood) {
          streakClass = 'streak-middle'; // Середина серии
        } else if (prevGood && !nextGood) {
          streakClass = 'streak-end';    // Конец серии
        } else if (!prevGood && nextGood) {
          streakClass = 'streak-start';  // Начало серии
        }
        // Если ни prev ни next не good — одиночный день, без класса
        
        if (streakClass) {
          info.set(dateStr, streakClass);
        }
      }
      
      return info;
    }, [daysDataMap, y, m, dim, fmtDate]);
    
    return React.createElement('div',{className:'calendar card'},
      React.createElement('div',{className:'cal-head'},
        React.createElement('button',{className:'cal-nav',onClick:()=>setCur(new Date(y,m-1,1))},'‹'),
        React.createElement('div',{className:'cal-title'},cur.toLocaleString('ru-RU',{month:'long',year:'numeric'})),
        React.createElement('button',{className:'cal-nav',onClick:()=>setCur(new Date(y,m+1,1))},'›'),
        // Кнопка "Сегодня" — быстрый переход
        React.createElement('button',{
          className:'cal-today-btn',
          onClick:()=>onSelect(todayISO()),
          title:'Сегодня'
        },'⌂')
      ),
      React.createElement('div',{className:'cal-grid cal-dow'},['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>React.createElement('div',{key:d},d))),
      React.createElement('div',{className:'cal-grid'}, cells.map((dt,i)=> {
        if (dt == null) return React.createElement('div',{key:'e'+i});
        
        const dateStr = fmtDate(dt);
        const dayData = daysDataMap.get(dateStr);
        const isSel = same(dt, sel);
        const isToday = same(dt, today);
        const streakClass = streakInfo.get(dateStr) || '';
        
        // Стиль с градиентным фоном для заполненных дней
        const bgColor = dayData ? getDayBgColor(dayData.ratio) : null;
        const cellStyle = bgColor && !isSel ? { background: bgColor } : undefined;
        
        return React.createElement('div', {
          key: dt.toISOString(),
          className: ['cal-cell', isSel ? 'sel' : '', isToday ? 'today' : '', dayData ? 'has-data' : '', streakClass].filter(Boolean).join(' '),
          style: cellStyle,
          onClick: () => onSelect(dateStr),
          title: dayData ? `${dayData.kcal} / ${dayData.target} ккал (${Math.round(dayData.ratio * 100)}%)` : undefined
        },
          dt.getDate(),
          // Иконка огня для streak
          streakClass && React.createElement('span', { className: 'streak-fire' }, '🔥')
        );
      })),
      React.createElement('div',{className:'cal-foot'},
        React.createElement('button',{className:'btn',onClick:()=>onSelect(todayISO())},'Сегодня'),
        React.createElement('button',{className:'btn',onClick:onRemove},'Удалить')
      )
    );
  }

  // Экспортируем DatePicker для использования в шапке (legacy)
  HEYS.DatePicker = DatePicker;
  HEYS.Calendar = Calendar;
  
  // Новый namespace
  HEYS.dayPickers = {
    DatePicker,
    Calendar
  };

})(window);


/* ===== heys_day_popups.js ===== */
// heys_day_popups.js — Popup components for DayTab
// Extracted from heys_day_v12.js (Phase 2.1)
// Contains: PopupWithBackdrop, createSwipeHandlers, PopupCloseButton

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Import haptic from dayUtils (with fallback)
  const U = HEYS.dayUtils || {};
  const haptic = U.haptic || (() => {});
  
  // === POPUP WITH BACKDROP — переиспользуемый компонент ===
  // Универсальная обёртка для попапов с backdrop'ом для закрытия по клику вне попапа
  const PopupWithBackdrop = ({ children, onClose, backdropStyle = {}, zIndex = 9998 }) => {
    return React.createElement('div', {
      className: 'popup-backdrop-invisible',
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: zIndex,
        pointerEvents: 'all',
        ...backdropStyle
      },
      onClick: (e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }
    }, children);
  };
  
  // === SWIPE TO DISMISS — функция для swipe-жестов на попапах ===
  // Возвращает { onTouchStart, onTouchEnd } для передачи в props попапа
  // НЕ хук! Можно вызывать условно внутри попапов
  const createSwipeHandlers = (onClose, threshold = 50) => {
    let startY = 0;
    return {
      onTouchStart: (e) => { startY = e.touches[0].clientY; },
      onTouchEnd: (e) => {
        const deltaY = e.changedTouches[0].clientY - startY;
        if (deltaY > threshold) {
          onClose();
          if (typeof haptic === 'function') haptic('light');
        }
      }
    };
  };
  
  // === POPUP CLOSE BUTTON — универсальная кнопка закрытия ===
  // className: опционально для кастомных стилей (sparkline-popup-close, metric-popup-close, etc.)
  const PopupCloseButton = ({ onClose, className = 'popup-close-btn', style = {} }) => {
    return React.createElement('button', {
      className,
      'aria-label': 'Закрыть',
      onClick: (e) => {
        e.stopPropagation();
        onClose();
      },
      style
    }, '✕');
  };
  
  // Export to HEYS namespace
  HEYS.dayPopups = {
    PopupWithBackdrop,
    createSwipeHandlers,
    PopupCloseButton
  };
  
})(window);


/* ===== heys_day_gallery.js ===== */
// heys_day_gallery.js — Photo Gallery components for DayTab
// Extracted from heys_day_v12.js (Phase 3)
// Contains: LazyPhotoThumb, fullscreen viewer, photo upload/delete

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Import utilities from dayUtils
  const U = HEYS.dayUtils || {};
  const haptic = U.haptic || (() => {});
  const fmtDate = U.fmtDate || ((d) => d);
  
  // Import popup components
  const { PopupCloseButton } = HEYS.dayPopups || {};
  
  const PHOTO_LIMIT_PER_MEAL = 10;
  
  /**
   * Lazy Photo Thumbnail с IntersectionObserver и skeleton loading
   */
  const LazyPhotoThumb = React.memo(function LazyPhotoThumb({
    photo, photoSrc, thumbClass, timeStr, mealIndex, photoIndex, mealPhotos, handleDelete, setDay
  }) {
    const [isLoaded, setIsLoaded] = React.useState(false);
    const [isVisible, setIsVisible] = React.useState(false);
    const containerRef = React.useRef(null);
    
    // IntersectionObserver для lazy loading
    React.useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      
      // Если это base64 data, показываем сразу (уже в памяти)
      if (photoSrc?.startsWith('data:')) {
        setIsVisible(true);
        return;
      }
      
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        },
        { rootMargin: '100px' } // Предзагружаем за 100px до видимости
      );
      
      observer.observe(el);
      return () => observer.disconnect();
    }, [photoSrc]);
    
    // Открытие галереи
    const handleClick = React.useCallback((e) => {
      // Не открывать галерею если кликнули по чекбоксу
      if (e.target.closest('.photo-processed-checkbox')) return;
      
      if (window.HEYS?.showPhotoViewer) {
        const onDeleteInViewer = (photoId) => {
          setDay((prevDay = {}) => {
            const meals = (prevDay.meals || []).map((m, i) => {
              if (i !== mealIndex || !m.photos) return m;
              return { ...m, photos: m.photos.filter(p => p.id !== photoId) };
            });
            return { ...prevDay, meals, updatedAt: Date.now() };
          });
        };
        window.HEYS.showPhotoViewer(mealPhotos, photoIndex, onDeleteInViewer);
      } else {
        window.open(photoSrc, '_blank');
      }
    }, [mealPhotos, photoIndex, photoSrc, mealIndex, setDay]);
    
    // Toggle "обработано"
    const handleToggleProcessed = React.useCallback((e) => {
      e.stopPropagation();
      setDay((prevDay = {}) => {
        const meals = (prevDay.meals || []).map((m, i) => {
          if (i !== mealIndex || !m.photos) return m;
          return { 
            ...m, 
            photos: m.photos.map(p => 
              p.id === photo.id ? { ...p, processed: !p.processed } : p
            )
          };
        });
        return { ...prevDay, meals, updatedAt: Date.now() };
      });
      // Haptic feedback
      try { navigator.vibrate?.(10); } catch(e) {}
    }, [photo.id, mealIndex, setDay]);
    
    // Классы с skeleton
    let finalClass = thumbClass;
    if (!isLoaded && isVisible) finalClass += ' skeleton';
    if (photo.processed) finalClass += ' processed';
    
    return React.createElement('div', { 
      ref: containerRef,
      className: finalClass,
      onClick: handleClick
    },
      // Изображение (показываем только когда видимо)
      isVisible && React.createElement('img', { 
        src: photoSrc, 
        alt: 'Фото приёма',
        onLoad: () => setIsLoaded(true),
        onError: () => setIsLoaded(true) // Убираем skeleton даже при ошибке
      }),
      // Чекбокс "обработано" (круглый, в левом верхнем углу)
      isLoaded && React.createElement('button', {
        className: 'photo-processed-checkbox' + (photo.processed ? ' checked' : ''),
        onClick: handleToggleProcessed,
        title: photo.processed ? 'Снять отметку' : 'Отметить как обработано'
      }, photo.processed ? '✓' : ''),
      // Timestamp badge
      timeStr && isLoaded && React.createElement('div', { 
        className: 'photo-time-badge'
      }, timeStr),
      // Кнопка удаления
      isLoaded && React.createElement('button', {
        className: 'photo-delete-btn',
        onClick: handleDelete,
        title: 'Удалить фото'
      }, '✕'),
      // Индикатор pending
      photo.pending && isLoaded && React.createElement('div', { 
        className: 'photo-pending-badge',
        title: 'Ожидает загрузки в облако'
      }, '⏳')
    );
  });

  /**
   * Показать галерею фото на весь экран
   * @param {Array} photos - массив фото [{url, data, id, timestamp, pending}]
   * @param {number} startIndex - индекс начального фото
   * @param {Function} onDelete - callback для удаления (photoId) => void
   */
  HEYS.showPhotoViewer = function showPhotoViewer(photos, startIndex = 0, onDelete = null) {
    // Поддержка старого API (один imageSrc)
    if (typeof photos === 'string') {
      photos = [{ data: photos, id: 'single' }];
      startIndex = 0;
    }
    if (!photos || photos.length === 0) return;
    
    let currentIndex = startIndex;
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isPinching = false;
    let startDistance = 0;
    let startScale = 1;
    
    // Создаём overlay
    const overlay = document.createElement('div');
    overlay.className = 'photo-viewer-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.2s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: none;
      user-select: none;
    `;
    
    // Верхняя панель
    const topBar = document.createElement('div');
    topBar.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0;
      padding: max(16px, env(safe-area-inset-top, 16px)) 16px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(to bottom, rgba(0,0,0,0.6), transparent);
      z-index: 10001;
    `;
    
    // Счётчик фото
    const counter = document.createElement('span');
    counter.style.cssText = 'color: white; font-size: 16px; font-weight: 500;';
    const updateCounter = () => {
      counter.textContent = photos.length > 1 ? `${currentIndex + 1} / ${photos.length}` : '';
    };
    updateCounter();
    
    // Кнопки
    const buttonsWrap = document.createElement('div');
    buttonsWrap.style.cssText = 'display: flex; gap: 12px;';
    
    // Кнопка удаления
    if (onDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '🗑';
      deleteBtn.style.cssText = `
        width: 44px; height: 44px; border: none;
        background: rgba(239, 68, 68, 0.8);
        color: white; font-size: 20px; border-radius: 50%;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
      `;
      deleteBtn.onclick = () => {
        const photo = photos[currentIndex];
        if (photo && confirm('Удалить это фото?')) {
          onDelete(photo.id);
          photos.splice(currentIndex, 1);
          if (photos.length === 0) {
            close();
          } else {
            currentIndex = Math.min(currentIndex, photos.length - 1);
            showPhoto(currentIndex);
            updateCounter();
            updateDots();
          }
        }
      };
      buttonsWrap.appendChild(deleteBtn);
    }
    
    // Кнопка закрытия
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      width: 44px; height: 44px; border: none;
      background: rgba(255, 255, 255, 0.2);
      color: white; font-size: 24px; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    `;
    closeBtn.onclick = close;
    buttonsWrap.appendChild(closeBtn);
    
    topBar.appendChild(counter);
    topBar.appendChild(buttonsWrap);
    
    // Контейнер для изображения (для zoom/pan)
    const imgContainer = document.createElement('div');
    imgContainer.style.cssText = `
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      overflow: hidden;
    `;
    
    // Изображение
    const img = document.createElement('img');
    img.alt = 'Фото приёма';
    img.style.cssText = `
      max-width: calc(100% - 32px);
      max-height: calc(100% - 120px);
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      transition: transform 0.1s ease-out;
      touch-action: none;
    `;
    
    function showPhoto(index) {
      const photo = photos[index];
      if (!photo) return;
      img.src = photo.url || photo.data;
      scale = 1;
      translateX = 0;
      translateY = 0;
      updateTransform();
    }
    
    function updateTransform() {
      img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }
    
    showPhoto(currentIndex);
    imgContainer.appendChild(img);
    
    // Точки-индикаторы (если > 1 фото)
    let dotsContainer = null;
    function updateDots() {
      if (!dotsContainer) return;
      dotsContainer.innerHTML = '';
      if (photos.length <= 1) return;
      photos.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.style.cssText = `
          width: 8px; height: 8px; border-radius: 50%;
          background: ${i === currentIndex ? 'white' : 'rgba(255,255,255,0.4)'};
          transition: background 0.2s;
        `;
        dotsContainer.appendChild(dot);
      });
    }
    
    if (photos.length > 1) {
      dotsContainer = document.createElement('div');
      dotsContainer.style.cssText = `
        position: absolute;
        bottom: max(24px, env(safe-area-inset-bottom, 24px));
        display: flex; gap: 8px;
        z-index: 10001;
      `;
      updateDots();
    }
    
    // Timestamp badge
    const timestampBadge = document.createElement('div');
    timestampBadge.style.cssText = `
      position: absolute;
      bottom: max(60px, calc(env(safe-area-inset-bottom, 24px) + 36px));
      color: rgba(255,255,255,0.7);
      font-size: 14px;
      z-index: 10001;
    `;
    function updateTimestamp() {
      const photo = photos[currentIndex];
      if (photo?.timestamp) {
        const d = new Date(photo.timestamp);
        timestampBadge.textContent = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      } else {
        timestampBadge.textContent = '';
      }
    }
    updateTimestamp();
    
    // === Gesture handling ===
    let startX = 0, startY = 0;
    let isDragging = false;
    let swipeStartX = 0;
    
    function getDistance(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    
    imgContainer.ontouchstart = function(e) {
      if (e.touches.length === 2) {
        // Pinch start
        isPinching = true;
        startDistance = getDistance(e.touches);
        startScale = scale;
      } else if (e.touches.length === 1) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        swipeStartX = startX;
        isDragging = scale > 1;
      }
    };
    
    imgContainer.ontouchmove = function(e) {
      if (isPinching && e.touches.length === 2) {
        // Pinch zoom
        const distance = getDistance(e.touches);
        scale = Math.max(1, Math.min(5, startScale * (distance / startDistance)));
        updateTransform();
        e.preventDefault();
      } else if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        
        if (scale > 1 && isDragging) {
          // Pan when zoomed
          translateX += dx;
          translateY += dy;
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
          updateTransform();
          e.preventDefault();
        } else if (Math.abs(dy) > 80 && dy > 0) {
          // Swipe down to close
          close();
        }
      }
    };
    
    imgContainer.ontouchend = function(e) {
      if (isPinching) {
        isPinching = false;
        if (scale < 1.1) {
          scale = 1;
          translateX = 0;
          translateY = 0;
          updateTransform();
        }
        return;
      }
      
      // Swipe left/right for navigation (only when not zoomed)
      if (scale <= 1 && photos.length > 1) {
        const dx = e.changedTouches[0].clientX - swipeStartX;
        if (Math.abs(dx) > 50) {
          if (dx < 0 && currentIndex < photos.length - 1) {
            currentIndex++;
          } else if (dx > 0 && currentIndex > 0) {
            currentIndex--;
          }
          showPhoto(currentIndex);
          updateCounter();
          updateDots();
          updateTimestamp();
        }
      }
      isDragging = false;
    };
    
    // Double tap to zoom
    let lastTap = 0;
    imgContainer.onclick = function(e) {
      const now = Date.now();
      if (now - lastTap < 300) {
        // Double tap
        if (scale > 1) {
          scale = 1;
          translateX = 0;
          translateY = 0;
        } else {
          scale = 2.5;
        }
        updateTransform();
      }
      lastTap = now;
    };
    
    // Keyboard navigation
    function onKeydown(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        currentIndex--;
        showPhoto(currentIndex);
        updateCounter();
        updateDots();
        updateTimestamp();
      }
      if (e.key === 'ArrowRight' && currentIndex < photos.length - 1) {
        currentIndex++;
        showPhoto(currentIndex);
        updateCounter();
        updateDots();
        updateTimestamp();
      }
    }
    document.addEventListener('keydown', onKeydown);
    
    // Close on overlay click (not on image)
    overlay.onclick = function(e) {
      if (e.target === overlay) close();
    };
    
    function close() {
      overlay.style.animation = 'fadeOut 0.15s ease forwards';
      document.removeEventListener('keydown', onKeydown);
      setTimeout(() => overlay.remove(), 150);
    }
    
    // Assemble
    overlay.appendChild(topBar);
    overlay.appendChild(imgContainer);
    if (dotsContainer) overlay.appendChild(dotsContainer);
    overlay.appendChild(timestampBadge);
    document.body.appendChild(overlay);
    
    overlay.tabIndex = -1;
    overlay.focus();
  };
  
  // Export to HEYS namespace
  HEYS.dayGallery = {
    PHOTO_LIMIT_PER_MEAL,
    LazyPhotoThumb
  };
  
})(window);


/* ===== heys_day_bundle_v1.js ===== */
// heys_day_bundle_v1.js — bundled day modules (advice + meals bundle)
// ⚠️ Auto-generated by scripts/bundle-day.cjs. Do not edit manually.

// ===== Begin day/_advice.js =====
;// day/_advice.js — Advice UI + State bundle for DayTab
// Aggregates: AdviceCard, manual list, toast UI, and advice state

; (function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    function isAdviceStillRelevant(advice, advices) {
        if (!advice?.id || !Array.isArray(advices)) return false;
        return advices.some(item => item?.id === advice.id);
    }

    function hasExpertContent(advice) {
        return !!(
            advice?.confidence ||
            advice?.evidenceSummary ||
            advice?.expertMeta?.whyNow ||
            advice?.expertMeta?.actionNow?.label ||
            advice?.expertMeta?.science ||
            advice?.expertMeta?.uncertainty ||
            advice?.expertMeta?.causal ||
            advice?.expertMeta?.responseMemory
        );
    }

    function getConfidenceNarrative(confidence) {
        if (confidence === 'high') return 'Сигнал уверенный: тут есть несколько независимых подтверждений, поэтому совет стоит считать приоритетным.';
        if (confidence === 'medium') return 'Сигнал хороший: это не жёсткая догма, но направление выглядит достаточно сильным.';
        if (confidence === 'low') return 'Сигнал мягкий: это скорее бережная подсказка, чем срочная команда.';
        return '';
    }

    function humanizeAdviceInsight(text) {
        if (!text || typeof text !== 'string') return text || '';

        const trimmed = text.trim();
        const rules = [
            [/^белок ниже цели (\d+)\/7 дн$/i, (_, days) => `Белок регулярно не дотягивал до цели: это повторялось ${days} дней из последних 7.`],
            [/^клетчатка проседает (\d+)\/7 дн$/i, (_, days) => `Клетчатки было маловато уже ${days} дней из последних 7.`],
            [/^вода ниже цели (\d+)\/7 дн$/i, (_, days) => `С водой есть повторяющийся недобор: ${days} дней из последних 7 цель не набиралась.`],
            [/^поздние приёмы (\d+)\/7 дн$/i, (_, days) => `Поздние приёмы пищи повторялись ${days} дней из последних 7 и уже стали паттерном.`],
            [/^недосып (\d+)\/7 дн$/i, (_, days) => `Недосып повторялся ${days} дней из последних 7, поэтому он уже влияет на аппетит и самоконтроль.`],
            [/^стресс высокий (\d+)\/7 дн$/i, (_, days) => `Высокий стресс держался ${days} дней из последних 7 — это уже заметный фон для тяги к еде и усталости.`],
            [/^энергия ниже цели (\d+)\/7 дн$/i, (_, days) => `Калорий регулярно не хватало: ${days} дней из последних 7 были ниже цели.`],
            [/^нагрузка без восстановления (\d+) дн$/i, (_, days) => `Нагрузка накапливалась без достаточного восстановления уже ${days} дня.`],
            [/^простые углеводы высокие (\d+)\/7 дн$/i, (_, days) => `Простые углеводы были высокими ${days} дней из последних 7, так что это уже не разовый эпизод.`],
            [/^за неделю белок стал хуже относительно прошлой$/i, () => 'По сравнению с прошлой неделей белок просел — это уже не случайность одного дня.'],
            [/^за неделю клетчатка снизилась$/i, () => 'По сравнению с прошлой неделей клетчатки стало меньше.'],
            [/^за неделю вода просела$/i, () => 'По сравнению с прошлой неделей воды стало заметно меньше.'],
            [/^за неделю поздние приёмы участились$/i, () => 'Поздние приёмы стали случаться чаще, чем на прошлой неделе.'],
            [/^за неделю стресс усилился$/i, () => 'Стресс по неделе усилился, поэтому организм сейчас уязвимее к тяге и перееданию.'],
            [/^за неделю быстрые углеводы выросли$/i, () => 'За неделю стало больше быстрых углеводов — это может усиливать тягу и качели энергии.'],
            [/^подтверждено фенотипом insulin resistant$/i, () => 'Совет дополнительно согласуется с твоим метаболическим профилем и чувствительностью к углеводам.'],
            [/^учтён вечерний циркадный тип$/i, () => 'Совет подстроен под твой вечерний ритм, а не взят из общего шаблона.'],
            [/^учтён низкий satiety-профиль$/i, () => 'Совет учитывает, что для тебя особенно важно насыщение и устойчивость к перекусам.'],
            [/^учтён stress-eating паттерн$/i, () => 'Совет учитывает твою склонность тянуться к еде на фоне стресса.'],
            [/^pattern meal timing: (\d+)\/100$/i, (_, score) => `Ритм питания сейчас держится неидеально (${score}/100), поэтому мягкая коррекция к месту.`],
            [/^pattern circadian: (\d+)\/100$/i, (_, score) => `Ритм еды и биологические часы сейчас согласованы неидеально (${score}/100).`],
            [/^pattern sleep→hunger: (\d+)\/100$/i, (_, score) => `Связка «сон → голод» сейчас выглядит заметной (${score}/100).`],
            [/^pattern hydration: (\d+)\/100$/i, (_, score) => `Паттерн по воде просел (${score}/100), так что совет появился не случайно.`],
            [/^pattern stress-eating подтверждает риск$/i, () => 'Паттерн стрессового переедания тоже подтверждает, что совет сейчас вовремя.'],
            [/^pattern insulin sensitivity: (\d+)\/100$/i, (_, score) => `Чувствительность к углеводам сейчас выглядит слабее обычного (${score}/100).`],
            [/^высокий crash-risk 24ч$/i, () => 'На ближайшие сутки система видит высокий риск срыва, поэтому лучше подстелить соломку заранее.'],
            [/^средний crash-risk 24ч$/i, () => 'На ближайшие сутки есть умеренный риск срыва, поэтому лучше слегка скорректировать курс заранее.'],
            [/^EWS: (.+)$/i, (_, label) => `Система ранних сигналов тоже подсвечивает похожий риск: ${label}.`],
            [/^EWS подтверждает ещё (\d+) связ\. сигн\.$/i, (_, count) => `Кроме основного сигнала, есть ещё ${count} связанных подтверждения.`],
            [/^EWS risk (\d+)\/100$/i, (_, score) => `Система ранних сигналов оценивает общий риск на ${score}/100.`],
            [/^causal root: (.+)$/i, (_, name) => `Совет бьёт не по симптому, а по корневой причине: ${name}.`],
            [/^causal path: (.+)$/i, (_, name) => `Совет вмешивается в механизм, который сейчас толкает ситуацию в плохую сторону: ${name}.`],
            [/^causal outcome: (.+)$/i, (_, name) => `Совет помогает сдержать уже заметное последствие: ${name}.`],
            [/^response memory: (.+)$/i, (_, label) => `Похожие советы в похожем контексте раньше реагировали так: ${label}.`],
        ];

        for (const [pattern, formatter] of rules) {
            if (pattern.test(trimmed)) {
                return trimmed.replace(pattern, formatter);
            }
        }

        return trimmed
            .replace(/root cause/gi, 'корневую причину')
            .replace(/outcome/gi, 'последствие')
            .replace(/response memory/gi, 'реакцию на похожие советы')
            .replace(/\bEWS\b/g, 'система ранних сигналов');
    }

    function getScienceEvidenceLabel(level) {
        if (level === 'A') return 'сильная научная опора';
        if (level === 'B') return 'хорошая научная опора';
        if (level === 'C') return 'рабочая научная опора';
        return 'научная опора';
    }

    function getSourceSupportLabel(count) {
        if (!count || count <= 1) return 'Опора идёт хотя бы из одного надёжного слоя данных текущего дня.';
        if (count === 2) return 'Совет подтверждён минимум двумя независимыми слоями данных.';
        if (count === 3) return 'Совет опирается сразу на три слоя данных, а не на один показатель.';
        return `Совет опирается сразу на ${count} независимых слоя данных.`;
    }

    function getAdviceTechnicalFacts(advice) {
        const expertMeta = advice?.expertMeta || {};
        return {
            summary: [
                advice?.id ? `id: ${advice.id}` : null,
                advice?.category ? `category: ${advice.category}` : null,
                advice?.confidenceLabel ? `confidence: ${advice.confidenceLabel}` : null,
                typeof expertMeta.evidenceScore === 'number' ? `score: ${expertMeta.evidenceScore}` : null,
                typeof expertMeta.sourceCount === 'number' ? `sources: ${expertMeta.sourceCount}` : null,
            ].filter(Boolean),
            drivers: Array.isArray(expertMeta.drivers) ? expertMeta.drivers : [],
            crossConfirmedBy: Array.isArray(expertMeta.crossConfirmedBy) ? expertMeta.crossConfirmedBy : [],
            contradictions: Array.isArray(expertMeta.contradictions) ? expertMeta.contradictions : [],
            actionNow: expertMeta.actionNow || null,
            science: expertMeta.science || null,
            causal: expertMeta.causal || null,
            responseMemory: expertMeta.responseMemory || null,
            uncertainty: expertMeta.uncertainty || null,
        };
    }

    function getHumanWhyNowParts(advice) {
        const expertMeta = advice?.expertMeta || {};
        const parts = [];

        if (advice?.evidenceSummary) {
            advice.evidenceSummary
                .split('•')
                .map(part => humanizeAdviceInsight(part))
                .filter(Boolean)
                .forEach(part => parts.push(part));
        }

        if (parts.length === 0 && expertMeta.whyNow) {
            parts.push(humanizeAdviceInsight(expertMeta.whyNow));
        }

        return parts.slice(0, 3);
    }

    function getAdviceDescription(advice) {
        if (!advice) return '';

        if (typeof advice.details === 'string' && advice.details.trim()) {
            return advice.details.trim();
        }

        const whyNowParts = getHumanWhyNowParts(advice);
        if (whyNowParts.length > 0) {
            return whyNowParts[0];
        }

        const actionNowLabel = advice?.expertMeta?.actionNow?.label;
        if (typeof actionNowLabel === 'string' && actionNowLabel.trim()) {
            return actionNowLabel.trim();
        }

        return '';
    }

    function renderAdviceEvidence(advice, options = {}) {
        if (!hasExpertContent(advice)) return null;

        const expertMeta = advice?.expertMeta || {};
        const confidenceLabel = advice.confidenceLabel || (
            advice.confidence === 'high' ? 'высокая'
                : advice.confidence === 'medium' ? 'средняя'
                    : advice.confidence === 'low' ? 'базовая'
                        : ''
        );

        const parts = getHumanWhyNowParts(advice);
        const showWhyNow = options.showWhyNow !== false;
        const showActionNow = options.showActionNow !== false;
        const showCausal = options.showCausal !== false;

        if (
            (!showWhyNow || parts.length === 0) &&
            (!showActionNow || !expertMeta.actionNow?.label) &&
            !expertMeta.science?.rationale &&
            (!showCausal || !expertMeta.causal?.mechanism) &&
            !expertMeta.uncertainty?.message
        ) {
            return null;
        }

        return React.createElement('div', {
            className: 'advice-expert-evidence advice-expert-evidence--human'
        },
            showWhyNow && parts.length > 0 && React.createElement(React.Fragment, null,
                React.createElement('div', { className: 'advice-expert-evidence__title' }, 'Почему этот совет сейчас к месту'),
                React.createElement('ul', { className: 'advice-expert-evidence__list' },
                    parts.slice(0, 3).map((part, index) => React.createElement('li', {
                        key: `human_${index}`,
                        className: 'advice-expert-evidence__list-item'
                    }, part))
                )
            ),
            showActionNow && expertMeta.actionNow?.label && React.createElement('div', { className: 'advice-expert-evidence__block' },
                React.createElement('div', { className: 'advice-expert-evidence__label' }, 'Что лучше сделать сейчас'),
                React.createElement('div', { className: 'advice-expert-evidence__text is-accent' }, expertMeta.actionNow.label)
            ),
            expertMeta.science?.rationale && React.createElement('div', { className: 'advice-expert-evidence__block' },
                React.createElement('div', { className: 'advice-expert-evidence__label' }, 'Почему это обычно работает'),
                React.createElement('div', { className: 'advice-expert-evidence__text' }, expertMeta.science.rationale)
            ),
            showCausal && expertMeta.causal?.mechanism && React.createElement('div', { className: 'advice-expert-evidence__block' },
                React.createElement('div', { className: 'advice-expert-evidence__label' }, 'Какой механизм здесь важен'),
                React.createElement('div', { className: 'advice-expert-evidence__text' }, expertMeta.causal.mechanism)
            ),
            expertMeta.science && React.createElement('div', { className: 'advice-expert-evidence__block' },
                React.createElement('div', { className: 'advice-expert-evidence__label' }, 'На что опирается совет'),
                React.createElement('div', { className: 'advice-expert-evidence__text' }, `${getScienceEvidenceLabel(expertMeta.science.evidenceLevel)} · ${expertMeta.science.topic}`)
            ),
            (expertMeta.sourceCount || confidenceLabel) && React.createElement('div', { className: 'advice-expert-evidence__block' },
                React.createElement('div', { className: 'advice-expert-evidence__label' }, 'Насколько это надёжно'),
                React.createElement('div', { className: 'advice-expert-evidence__text' }, [
                    getConfidenceNarrative(advice.confidence),
                    expertMeta.uncertainty?.message,
                    expertMeta.sourceCount ? getSourceSupportLabel(expertMeta.sourceCount) : null
                ].filter(Boolean).join(' '))
            )
        );
    }

    function formatPercentValue(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
        return `${Math.round(value * 100)}%`;
    }

    function getQualityGradeLabel(grade) {
        if (grade === 'strong') return 'сильный';
        if (grade === 'good') return 'хороший';
        if (grade === 'mixed') return 'смешанный';
        if (grade === 'weak') return 'слабый';
        return '—';
    }

    function getQualityGradeClass(grade) {
        if (grade === 'strong') return 'is-strong';
        if (grade === 'good') return 'is-good';
        if (grade === 'mixed') return 'is-mixed';
        if (grade === 'weak') return 'is-weak';
        return 'is-neutral';
    }

    function AdviceDiagnosticsModal({
        React,
        diagnostics,
        onClose,
    }) {
        if (!diagnostics) return null;

        const summary = diagnostics.executiveSummary || {};
        const quality = diagnostics.quality || {};
        const effect = diagnostics.analyticsEffectiveness || {};
        const lastSnapshot = diagnostics.lastSnapshot || null;
        const eventFunnel = effect.eventFunnel || quality.eventFunnel || {};
        const moduleReport = Array.isArray(diagnostics.moduleReport) ? diagnostics.moduleReport : [];
        const silentModules = Array.isArray(summary.topSilentModules) && summary.topSilentModules.length > 0
            ? summary.topSilentModules
            : (Array.isArray(quality.silentModules) ? quality.silentModules : []);
        const topReasons = Array.isArray(diagnostics.blockerReport?.topReasons)
            ? diagnostics.blockerReport.topReasons.slice(0, 4)
            : [];
        const findings = Array.isArray(summary.topIssues) && summary.topIssues.length > 0
            ? summary.topIssues
            : (Array.isArray(quality.findings) ? quality.findings : []);
        const activeModules = moduleReport.filter(item => (item?.withOutput || 0) > 0).slice(0, 4);
        const manualEventsExceedShown = (eventFunnel.manualOpen || 0) > 0 && (eventFunnel.click || 0) > (eventFunnel.shown || 0);
        const blockerLabels = {
            trigger_mismatch: 'триггер не совпал',
            global_cooldown: 'глобальный cooldown',
            expert_conflict_resolution: 'конфликт сигналов',
            category_limit: 'лимит категории',
            ui_busy: 'интерфейс был занят',
            missing_trigger: 'триггер не был передан',
            session_limit: 'лимит за сессию',
        };
        const humanizeBlocker = (key) => blockerLabels[key] || key;
        const getKpiStatusClass = (metric, value) => {
            if (typeof value !== 'number' || !Number.isFinite(value)) return 'is-neutral';
            if (metric === 'coverage') return value >= 0.7 ? 'is-good' : value >= 0.45 ? 'is-mixed' : 'is-weak';
            if (metric === 'precision') return value >= 0.6 ? 'is-good' : value >= 0.35 ? 'is-mixed' : 'is-weak';
            if (metric === 'ignored') return value <= 0.35 ? 'is-good' : value <= 0.6 ? 'is-mixed' : 'is-weak';
            if (metric === 'cooldown') return value <= 0.35 ? 'is-good' : value <= 0.65 ? 'is-mixed' : 'is-weak';
            return 'is-neutral';
        };

        return React.createElement('div', {
            className: 'advice-diagnostics-modal-overlay',
            role: 'presentation',
            onClick: (e) => {
                e.stopPropagation();
                onClose && onClose();
            }
        },
            React.createElement('div', {
                className: 'advice-diagnostics-modal',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': 'Диагностика advice engine',
                onClick: (e) => e.stopPropagation()
            },
                React.createElement('div', { className: 'advice-diagnostics-modal__header' },
                    React.createElement('div', { className: 'advice-diagnostics-modal__title-wrap' },
                        React.createElement('div', { className: 'advice-diagnostics-modal__eyebrow' }, 'Advice diagnostics'),
                        React.createElement('div', { className: 'advice-diagnostics-modal__title' }, 'Что реально происходило сегодня'),
                        React.createElement('div', { className: 'advice-diagnostics-modal__subtitle' },
                            `Лог за ${diagnostics.date || 'сегодня'} · snapshots ${diagnostics.snapshotCount || 0} · events ${diagnostics.eventCount || 0}`
                        )
                    ),
                    React.createElement('button', {
                        className: 'advice-diagnostics-modal__close',
                        onClick: onClose,
                        type: 'button',
                        'aria-label': 'Закрыть диагностику'
                    }, '×')
                ),

                React.createElement('div', { className: 'advice-diagnostics-modal__body' },
                    React.createElement('div', { className: 'advice-diagnostics-summary-card' },
                        React.createElement('div', { className: 'advice-diagnostics-summary-card__row' },
                            React.createElement('div', null,
                                React.createElement('div', { className: 'advice-diagnostics-summary-card__score' }, summary.qualityScore ?? '—'),
                                React.createElement('div', { className: 'advice-diagnostics-summary-card__score-label' }, 'качество дня')
                            ),
                            React.createElement('div', {
                                className: `advice-diagnostics-grade ${getQualityGradeClass(summary.qualityGrade || quality.grade)}`
                            }, getQualityGradeLabel(summary.qualityGrade || quality.grade))
                        ),
                        summary.dominantIssue?.key && React.createElement('div', { className: 'advice-diagnostics-summary-card__issue' },
                            summary.dominantIssue?.message
                                ? summary.dominantIssue.message
                                : `Главный блокер: ${summary.dominantIssue?.label || humanizeBlocker(summary.dominantIssue.key)} · ${summary.dominantIssue.count || 0}`
                        )
                    ),

                    React.createElement('div', { className: 'advice-diagnostics-stat-grid' },
                        React.createElement('div', { className: `advice-diagnostics-stat-card ${getKpiStatusClass('coverage', effect.coverage)}` },
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__label' }, 'Покрытие'),
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__value' }, formatPercentValue(effect.coverage))
                        ),
                        React.createElement('div', { className: `advice-diagnostics-stat-card ${getKpiStatusClass('precision', effect.precisionProxy)}` },
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__label' }, 'Точность сигнала'),
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__value' }, formatPercentValue(effect.precisionProxy))
                        ),
                        React.createElement('div', { className: `advice-diagnostics-stat-card ${getKpiStatusClass('ignored', effect.ignoredRate)}` },
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__label' }, 'Проигнорировано'),
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__value' }, formatPercentValue(effect.ignoredRate))
                        ),
                        React.createElement('div', { className: `advice-diagnostics-stat-card ${getKpiStatusClass('cooldown', effect.suppressedByCooldownRate)}` },
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__label' }, 'Подавлено cooldown'),
                            React.createElement('div', { className: 'advice-diagnostics-stat-card__value' }, formatPercentValue(effect.suppressedByCooldownRate))
                        )
                    ),

                    React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'События взаимодействий'),
                        React.createElement('div', { className: 'advice-diagnostics-chip-grid' },
                            [
                                ['shown', 'shown'],
                                ['read', 'read'],
                                ['click', 'click'],
                                ['hidden', 'hidden'],
                                ['positive', 'positive'],
                                ['negative', 'negative'],
                                ['manualOpen', 'manual open']
                            ].map(([key, label]) => React.createElement('div', {
                                key,
                                className: 'advice-diagnostics-chip'
                            },
                                React.createElement('span', { className: 'advice-diagnostics-chip__label' }, label),
                                React.createElement('span', { className: 'advice-diagnostics-chip__value' }, eventFunnel[key] || 0)
                            ))
                        ),
                        manualEventsExceedShown && React.createElement('div', {
                            className: 'advice-diagnostics-section__hint'
                        }, 'Клики могут приходить из manual drawer, поэтому это не strict toast funnel.')
                    ),

                    findings.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Что бросается в глаза'),
                        React.createElement('ul', { className: 'advice-diagnostics-list' },
                            findings.slice(0, 4).map((item, index) => React.createElement('li', {
                                key: `finding_${index}`,
                                className: 'advice-diagnostics-list__item'
                            }, humanizeAdviceInsight(item)))
                        )
                    ),

                    silentModules.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Модули без выдачи'),
                        React.createElement('div', { className: 'advice-diagnostics-tags' },
                            silentModules.map(moduleName => React.createElement('span', {
                                key: moduleName,
                                className: 'advice-diagnostics-tag is-muted'
                            }, moduleName))
                        )
                    ),

                    topReasons.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Главные блокеры'),
                        React.createElement('div', { className: 'advice-diagnostics-tags' },
                            topReasons.map(item => React.createElement('span', {
                                key: item.key,
                                className: 'advice-diagnostics-tag'
                            }, `${humanizeBlocker(item.key)} · ${item.count || 0}`))
                        )
                    ),

                    activeModules.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Активные модули'),
                        React.createElement('div', { className: 'advice-diagnostics-module-list' },
                            activeModules.map(item => React.createElement('div', {
                                key: item.module,
                                className: 'advice-diagnostics-module-row'
                            },
                                React.createElement('div', { className: 'advice-diagnostics-module-row__name' }, item.module),
                                React.createElement('div', { className: 'advice-diagnostics-module-row__meta' }, `${item.withOutput}/${item.runs} запусков дали совет`),
                                React.createElement('div', { className: 'advice-diagnostics-module-row__sub' },
                                    item.topBlockers?.[0]
                                        ? `главный блокер: ${humanizeBlocker(item.topBlockers[0].key)} · ${item.topBlockers[0].count || 0}`
                                        : `средняя выдача: ${item.avgOutputCount ?? 0}`
                                )
                            ))
                        )
                    ),

                    lastSnapshot && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Последний snapshot'),
                        React.createElement('div', { className: 'advice-diagnostics-last-snapshot' },
                            React.createElement('div', { className: 'advice-diagnostics-last-snapshot__row' },
                                React.createElement('span', null, `trigger: ${lastSnapshot.trigger || '—'}`),
                                React.createElement('span', null, `видно вручную: ${lastSnapshot.visibleForManualCount || 0}`)
                            ),
                            React.createElement('div', { className: 'advice-diagnostics-last-snapshot__row' },
                                React.createElement('span', null, `подходит для auto-toast: ${lastSnapshot.eligibleForAutoToastCount || 0}`),
                                React.createElement('span', null, `primary: ${lastSnapshot.primaryId || '—'}`)
                            )
                        )
                    )
                ),

                React.createElement('div', { className: 'advice-diagnostics-modal__footer' },
                    React.createElement('button', {
                        className: 'advice-diagnostics-modal__action advice-diagnostics-modal__action--secondary',
                        onClick: onClose,
                        type: 'button'
                    }, 'Закрыть')
                )
            )
        );
    }

    function AdviceTechnicalModal({
        React,
        advice,
        onClose,
    }) {
        if (!advice || !hasExpertContent(advice)) return null;

        const facts = getAdviceTechnicalFacts(advice);
        const whyNowParts = getHumanWhyNowParts(advice);
        const science = facts.science;
        const causal = facts.causal;
        const responseMemory = facts.responseMemory;
        const uncertainty = facts.uncertainty;

        return React.createElement('div', {
            className: 'advice-diagnostics-modal-overlay',
            role: 'presentation',
            onClick: (e) => {
                e.stopPropagation();
                onClose && onClose();
            }
        },
            React.createElement('div', {
                className: 'advice-diagnostics-modal advice-diagnostics-modal--technical',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': 'Технические детали совета',
                onClick: (e) => e.stopPropagation()
            },
                React.createElement('div', { className: 'advice-diagnostics-modal__header' },
                    React.createElement('div', { className: 'advice-diagnostics-modal__title-wrap' },
                        React.createElement('div', { className: 'advice-diagnostics-modal__eyebrow' }, 'Advice tech details'),
                        React.createElement('div', { className: 'advice-diagnostics-modal__title' }, 'Технические детали по совету'),
                        React.createElement('div', { className: 'advice-diagnostics-modal__subtitle' }, advice.text || advice.id || 'Совет')
                    ),
                    React.createElement('button', {
                        className: 'advice-diagnostics-modal__close',
                        onClick: onClose,
                        type: 'button',
                        'aria-label': 'Закрыть технические детали'
                    }, '×')
                ),
                React.createElement('div', { className: 'advice-diagnostics-modal__body' },
                    facts.summary.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Сводка решения'),
                        React.createElement('div', { className: 'advice-diagnostics-tags' },
                            facts.summary.map((item, index) => React.createElement('span', {
                                key: `summary_${index}`,
                                className: 'advice-diagnostics-tag is-muted'
                            }, item))
                        )
                    ),
                    whyNowParts.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Почему этот совет сейчас к месту'),
                        React.createElement('ul', { className: 'advice-diagnostics-list' },
                            whyNowParts.map((item, index) => React.createElement('li', {
                                key: `why_now_${index}`,
                                className: 'advice-diagnostics-list__item'
                            }, item))
                        )
                    ),
                    facts.drivers.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Primary drivers'),
                        React.createElement('ul', { className: 'advice-diagnostics-list' },
                            facts.drivers.map((item, index) => React.createElement('li', {
                                key: `driver_${index}`,
                                className: 'advice-diagnostics-list__item'
                            }, item))
                        )
                    ),
                    facts.crossConfirmedBy.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Cross confirmation'),
                        React.createElement('ul', { className: 'advice-diagnostics-list' },
                            facts.crossConfirmedBy.map((item, index) => React.createElement('li', {
                                key: `cross_${index}`,
                                className: 'advice-diagnostics-list__item'
                            }, item))
                        )
                    ),
                    facts.contradictions.length > 0 && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Contradictions'),
                        React.createElement('ul', { className: 'advice-diagnostics-list' },
                            facts.contradictions.map((item, index) => React.createElement('li', {
                                key: `contradiction_${index}`,
                                className: 'advice-diagnostics-list__item'
                            }, item))
                        )
                    ),
                    facts.actionNow?.label && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Actionability'),
                        React.createElement('div', { className: 'advice-diagnostics-module-row' },
                            React.createElement('div', { className: 'advice-diagnostics-module-row__name' }, facts.actionNow.label),
                            React.createElement('div', { className: 'advice-diagnostics-module-row__meta' }, `urgency: ${facts.actionNow.urgency || 'watch'}`),
                            facts.actionNow.rationale && React.createElement('div', { className: 'advice-diagnostics-module-row__sub' }, facts.actionNow.rationale)
                        )
                    ),
                    science && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Science registry'),
                        React.createElement('div', { className: 'advice-diagnostics-module-row' },
                            React.createElement('div', { className: 'advice-diagnostics-module-row__name' }, `${science.topic || '—'} (${science.key || 'no-key'})`),
                            React.createElement('div', { className: 'advice-diagnostics-module-row__meta' }, [
                                science.evidenceLevel ? `evidence: ${science.evidenceLevel}` : null,
                                typeof science.confidenceScore === 'number' ? `confidence: ${Math.round(science.confidenceScore * 100)}%` : null,
                                typeof science.impactScore === 'number' ? `impact: ${Math.round(science.impactScore * 100)}%` : null,
                            ].filter(Boolean).join(' · ')),
                            science.rationale && React.createElement('div', { className: 'advice-diagnostics-module-row__sub' }, science.rationale)
                        )
                    ),
                    causal && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Causal model'),
                        React.createElement('div', { className: 'advice-diagnostics-module-row' },
                            React.createElement('div', { className: 'advice-diagnostics-module-row__name' }, `${causal.name || '—'} (${causal.relevance || 'unknown'})`),
                            React.createElement('div', { className: 'advice-diagnostics-module-row__meta' }, [
                                typeof causal.confidence === 'number' ? `confidence: ${Math.round(causal.confidence * 100)}%` : null,
                                typeof causal.coverage === 'number' ? `coverage: ${Math.round(causal.coverage)}%` : null,
                            ].filter(Boolean).join(' · ')),
                            causal.mechanism && React.createElement('div', { className: 'advice-diagnostics-module-row__sub' }, causal.mechanism),
                            causal.path && React.createElement('div', { className: 'advice-diagnostics-module-row__sub' }, `path: ${causal.path}`)
                        )
                    ),
                    responseMemory && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Response memory'),
                        React.createElement('div', { className: 'advice-diagnostics-module-row' },
                            React.createElement('div', { className: 'advice-diagnostics-module-row__name' }, responseMemory.label || '—'),
                            React.createElement('div', { className: 'advice-diagnostics-module-row__meta' }, [
                                typeof responseMemory.score === 'number' ? `score: ${responseMemory.score}` : null,
                                typeof responseMemory.sampleCount === 'number' ? `samples: ${responseMemory.sampleCount}` : null,
                            ].filter(Boolean).join(' · ')),
                            responseMemory.message && React.createElement('div', { className: 'advice-diagnostics-module-row__sub' }, responseMemory.message)
                        )
                    ),
                    uncertainty && React.createElement('section', { className: 'advice-diagnostics-section' },
                        React.createElement('div', { className: 'advice-diagnostics-section__title' }, 'Uncertainty model'),
                        React.createElement('div', { className: 'advice-diagnostics-module-row' },
                            React.createElement('div', { className: 'advice-diagnostics-module-row__name' }, uncertainty.label || '—'),
                            uncertainty.message && React.createElement('div', { className: 'advice-diagnostics-module-row__sub' }, uncertainty.message)
                        )
                    )
                ),
                React.createElement('div', { className: 'advice-diagnostics-modal__footer' },
                    React.createElement('button', {
                        className: 'advice-diagnostics-modal__action advice-diagnostics-modal__action--secondary',
                        onClick: onClose,
                        type: 'button'
                    }, 'Закрыть')
                )
            )
        );
    }

    // --- AdviceCard component ---
    const AdviceCard = React.memo(function AdviceCard({
        advice,
        globalIndex,
        isDismissed,
        isHidden,
        swipeState,
        isExpanded,
        isLastDismissed,
        lastDismissedAction,
        onUndo,
        onClearLastDismissed,
        onSchedule,
        onToggleExpand,
        trackClick,
        onRate,
        onSwipeStart,
        onSwipeMove,
        onSwipeEnd,
        onLongPressStart,
        onLongPressEnd,
        registerCardRef,
        onOpenTechnicalDetails,
    }) {
        const [scheduledConfirm, setScheduledConfirm] = React.useState(false);
        const [ratedState, setRatedState] = React.useState(null); // 'positive' | 'negative' | null
        const adviceDescription = getAdviceDescription(advice);
        const hasExpandedContent = !!(adviceDescription || hasExpertContent(advice));

        const swipeX = swipeState?.x || 0;
        const swipeDirection = swipeState?.direction;
        const swipeProgress = Math.min(1, Math.abs(swipeX) / 100);
        const showUndo = isLastDismissed && (isDismissed || isHidden);
        const showReadFeedback = showUndo && lastDismissedAction === 'read';

        const handleSchedule = React.useCallback((e) => {
            e.stopPropagation();
            if (onSchedule) {
                onSchedule(advice, 120);
                setScheduledConfirm(true);
                if (navigator.vibrate) navigator.vibrate(50);
                setTimeout(() => {
                    onClearLastDismissed && onClearLastDismissed();
                }, 1500);
            }
        }, [advice, onSchedule, onClearLastDismissed]);

        const handleRate = React.useCallback((isPositive, e) => {
            e.stopPropagation();
            if (!onRate) return;
            onRate(advice, isPositive);
            setRatedState(isPositive ? 'positive' : 'negative');
            if (navigator.vibrate) navigator.vibrate(30);
            setTimeout(() => {
                onClearLastDismissed && onClearLastDismissed();
            }, 900);
        }, [advice, onRate, onClearLastDismissed]);

        React.useEffect(() => {
            if (!showUndo) {
                setScheduledConfirm(false);
                setRatedState(null);
            }
        }, [showUndo]);

        if ((isDismissed || isHidden) && !showUndo) return null;

        return React.createElement('div', {
            className: 'advice-list-item-wrapper',
            style: {
                animationDelay: `${globalIndex * 50}ms`,
                '--stagger-delay': `${globalIndex * 50}ms`,
                position: 'relative',
                overflow: 'hidden',
            },
        },
            showUndo && React.createElement('div', {
                className: `advice-undo-overlay advice-list-item-${advice.type}`,
                style: {
                    position: 'absolute',
                    inset: 0,
                    background: 'var(--advice-bg, #ecfdf5)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    color: 'var(--color-slate-700, #334155)',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                    zIndex: 10,
                },
            },
                showReadFeedback
                    ? React.createElement(React.Fragment, null,
                        React.createElement('button', {
                            onClick: (e) => {
                                e.stopPropagation();
                                onClearLastDismissed && onClearLastDismissed();
                            },
                            style: {
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                border: 'none',
                                background: 'rgba(0,0,0,0.05)',
                                borderRadius: '999px',
                                width: '24px',
                                height: '24px',
                                cursor: 'pointer',
                                color: '#64748b'
                            }
                        }, '×'),
                        scheduledConfirm
                            ? React.createElement('span', {
                                style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    color: '#3b82f6',
                                    animation: 'fadeIn 0.3s ease',
                                },
                            }, '⏰ Напомню через 2 часа ✓')
                            : ratedState
                                ? React.createElement('span', {
                                    style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        color: ratedState === 'positive' ? '#16a34a' : '#dc2626',
                                        animation: 'fadeIn 0.2s ease',
                                    }
                                }, ratedState === 'positive' ? '👍 Учту как полезный' : '👎 Учту как слабый / вредный')
                                : React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        alignItems: 'stretch',
                                        justifyContent: 'stretch',
                                        gap: '10px',
                                        width: '100%',
                                        height: '100%',
                                        padding: '8px 10px',
                                        boxSizing: 'border-box',
                                    }
                                },
                                    React.createElement('button', {
                                        onClick: (e) => handleRate(false, e),
                                        style: {
                                            border: 'none',
                                            background: 'rgba(220, 38, 38, 0.16)',
                                            color: '#b91c1c',
                                            padding: '10px 14px',
                                            borderRadius: '18px',
                                            fontSize: '15px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            flex: '1 1 40%',
                                            minWidth: '0',
                                            minHeight: '72px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center',
                                            lineHeight: 1.1,
                                            boxShadow: 'inset 0 0 0 1px rgba(220, 38, 38, 0.06)'
                                        }
                                    }, '👎 Вредный'),
                                    onSchedule && React.createElement('button', {
                                        onClick: handleSchedule,
                                        style: {
                                            border: 'none',
                                            background: 'rgba(59, 130, 246, 0.14)',
                                            color: '#2563eb',
                                            padding: '10px 8px',
                                            borderRadius: '18px',
                                            fontSize: '15px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            flex: '0 0 20%',
                                            minWidth: '70px',
                                            minHeight: '72px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center',
                                            lineHeight: 1.1,
                                            boxShadow: 'inset 0 0 0 1px rgba(59, 130, 246, 0.06)'
                                        }
                                    }, '⏰ 2ч'),
                                    React.createElement('button', {
                                        onClick: (e) => handleRate(true, e),
                                        style: {
                                            border: 'none',
                                            background: 'rgba(22, 163, 74, 0.16)',
                                            color: '#15803d',
                                            padding: '10px 14px',
                                            borderRadius: '18px',
                                            fontSize: '15px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            flex: '1 1 40%',
                                            minWidth: '0',
                                            minHeight: '72px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center',
                                            lineHeight: 1.1,
                                            boxShadow: 'inset 0 0 0 1px rgba(22, 163, 74, 0.06)'
                                        }
                                    }, '👍 Полезный')
                                )
                    )
                    : React.createElement(React.Fragment, null,
                        scheduledConfirm
                            ? React.createElement('span', {
                                style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    color: '#3b82f6',
                                    animation: 'fadeIn 0.3s ease',
                                },
                            }, '⏰ Напомню через 2 часа ✓')
                            : React.createElement(React.Fragment, null,
                                React.createElement('span', {
                                    style: { color: '#f97316' },
                                }, '🔕 Скрыто'),
                                React.createElement('div', { style: { display: 'flex', gap: '8px' } },
                                    React.createElement('span', {
                                        onClick: (e) => { e.stopPropagation(); onUndo(); },
                                        style: {
                                            background: 'rgba(0,0,0,0.08)',
                                            padding: '4px 10px',
                                            borderRadius: '12px',
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                        },
                                    }, 'Отменить'),
                                    onSchedule && React.createElement('span', {
                                        onClick: handleSchedule,
                                        style: {
                                            background: 'rgba(0,0,0,0.06)',
                                            padding: '4px 10px',
                                            borderRadius: '12px',
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                        },
                                    }, 'Напомнить через 2ч.')
                                )
                            )
                    ),
                !showReadFeedback && !scheduledConfirm && React.createElement('div', {
                    style: {
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        height: '3px',
                        background: 'rgba(0,0,0,0.15)',
                        width: '100%',
                        animation: 'undoProgress 3s linear forwards',
                    },
                })
            ),
            !showUndo && React.createElement('div', {
                className: 'advice-list-item-bg advice-list-item-bg-left',
                style: { opacity: swipeDirection === 'left' ? swipeProgress : 0 },
            }, React.createElement('span', null, '✓ Прочитано')),
            !showUndo && React.createElement('div', {
                className: 'advice-list-item-bg advice-list-item-bg-right',
                style: { opacity: swipeDirection === 'right' ? swipeProgress : 0 },
            }, React.createElement('span', null, '🔕 До завтра')),
            React.createElement('div', {
                ref: (el) => registerCardRef(advice.id, el),
                className: `advice-list-item advice-list-item-${advice.type}${isExpanded ? ' expanded' : ''}`,
                style: {
                    transform: showUndo ? 'none' : `translateX(${swipeX}px)`,
                    opacity: showUndo ? 0.1 : (1 - swipeProgress * 0.3),
                    pointerEvents: showUndo ? 'none' : 'auto',
                },
                onClick: (e) => {
                    if (showUndo || Math.abs(swipeX) > 10) return;
                    e.stopPropagation();
                    if (!isExpanded && trackClick) trackClick(advice);
                    onToggleExpand && onToggleExpand(advice.id);
                },
                onTouchStart: (e) => {
                    if (showUndo) return;
                    onSwipeStart(advice.id, e);
                    onLongPressStart(advice.id);
                },
                onTouchMove: (e) => {
                    if (showUndo) return;
                    onSwipeMove(advice.id, e);
                    onLongPressEnd();
                },
                onTouchEnd: () => {
                    if (showUndo) return;
                    onSwipeEnd(advice.id);
                    onLongPressEnd();
                },
            },
                React.createElement('span', { className: 'advice-list-icon' }, advice.icon),
                React.createElement('div', { className: 'advice-list-content' },
                    React.createElement('span', { className: 'advice-list-text' }, advice.text),
                    hasExpandedContent && React.createElement('span', {
                        className: 'advice-expand-arrow',
                        style: {
                            marginLeft: '6px',
                            fontSize: '10px',
                            opacity: 0.5,
                            transition: 'transform 0.2s',
                            display: 'inline-block',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        },
                    }, '▼'),
                    isExpanded && hasExpandedContent && React.createElement('div', {
                        className: 'advice-list-details',
                    },
                        adviceDescription && React.createElement('div', { className: 'advice-list-details__description' }, adviceDescription)
                    ),
                    hasExpertContent(advice) && isExpanded && React.createElement('div', { className: 'advice-list-details__actions advice-list-details__actions--subtle' },
                        React.createElement('button', {
                            type: 'button',
                            className: 'advice-technical-trigger',
                            onClick: (e) => {
                                e.stopPropagation();
                                onOpenTechnicalDetails && onOpenTechnicalDetails(advice, e);
                            }
                        }, 'Тех. детали')
                    )
                )
            )
        );
    });

    HEYS.dayComponents = HEYS.dayComponents || {};
    HEYS.dayComponents.AdviceCard = AdviceCard;

    // --- Manual advice list UI ---
    const dayAdviceListUI = {};

    dayAdviceListUI.renderManualAdviceList = function renderManualAdviceList({
        React,
        adviceTrigger,
        adviceRelevant,
        toastVisible,
        dismissToast,
        getSortedGroupedAdvices,
        dismissedAdvices,
        hiddenUntilTomorrow,
        lastDismissedAdvice,
        adviceSwipeState,
        expandedAdviceId,
        trackClick,
        handleAdviceToggleExpand,
        rateAdvice,
        handleAdviceSwipeStart,
        handleAdviceSwipeMove,
        handleAdviceSwipeEnd,
        handleAdviceLongPressStart,
        handleAdviceLongPressEnd,
        registerAdviceCardRef,
        handleAdviceListTouchStart,
        handleAdviceListTouchMove,
        handleAdviceListTouchEnd,
        handleDismissAll,
        dismissAllAnimation,
        toastsEnabled,
        toggleToastsEnabled,
        adviceSoundEnabled,
        toggleAdviceSoundEnabled,
        scheduleAdvice,
        undoLastDismiss,
        clearLastDismissed,
        copyAdviceTrace,
        adviceTraceAvailable,
        adviceTraceCopyState,
        adviceDiagnostics,
        adviceDiagnosticsOpen,
        openAdviceDiagnostics,
        closeAdviceDiagnostics,
        adviceTechnicalDetails,
        adviceTechnicalDetailsOpen,
        openAdviceTechnicalDetails,
        closeAdviceTechnicalDetails,
        ADVICE_CATEGORY_NAMES,
        AdviceCard,
    }) {
        if (!(adviceTrigger === 'manual' && adviceRelevant?.length > 0 && toastVisible)) return null;

        const { sorted, groups } = getSortedGroupedAdvices(adviceRelevant);
        const activeCount = sorted.filter(a => !dismissedAdvices.has(a.id)).length;
        const groupKeys = Object.keys(groups);

        return React.createElement('div', {
            className: 'advice-list-overlay',
            onClick: dismissToast,
        },
            React.createElement('div', {
                className: `advice-list-container${dismissAllAnimation ? ' shake-warning' : ''}`,
                onClick: e => e.stopPropagation(),
                onTouchStart: handleAdviceListTouchStart,
                onTouchMove: handleAdviceListTouchMove,
                onTouchEnd: handleAdviceListTouchEnd,
            },
                React.createElement('div', { className: 'advice-list-header' },
                    React.createElement('div', { className: 'advice-list-header-top' },
                        React.createElement('span', null, `💡 Советы (${activeCount})`),
                        React.createElement('div', { className: 'advice-list-header-actions' },
                            adviceTraceAvailable && React.createElement('button', {
                                className: 'advice-list-dismiss-all',
                                onClick: copyAdviceTrace,
                                title: 'Скопировать технический лог принятия решений по советам',
                            },
                                adviceTraceCopyState === 'success'
                                    ? '✅ Лог скопирован'
                                    : adviceTraceCopyState === 'error'
                                        ? '⚠️ Ошибка копии'
                                        : '📋 Техлог'
                            ),
                            adviceDiagnostics && React.createElement('button', {
                                className: 'advice-list-dismiss-all advice-list-dismiss-all--diagnostics',
                                onClick: openAdviceDiagnostics,
                                title: 'Показать компактную диагностику advice engine',
                            }, '📊 Диагностика'),
                            activeCount > 1 && React.createElement('button', {
                                className: 'advice-list-dismiss-all',
                                onClick: handleDismissAll,
                                disabled: dismissAllAnimation,
                                title: 'Пометить все советы прочитанными',
                            }, 'Прочитать все')
                        )
                    ),
                    React.createElement('div', { className: 'advice-list-header-left' },
                        React.createElement('div', { className: 'advice-list-toggles' },
                            React.createElement('label', {
                                className: 'ios-toggle-label',
                                title: toastsEnabled ? 'Отключить всплывающие советы' : 'Включить всплывающие советы',
                            },
                                React.createElement('div', {
                                    className: `ios-toggle ${toastsEnabled ? 'ios-toggle-on' : ''}`,
                                    onClick: toggleToastsEnabled,
                                }, React.createElement('div', { className: 'ios-toggle-thumb' })),
                                React.createElement('div', { className: 'advice-toggle-text-group' },
                                    React.createElement('span', { className: 'ios-toggle-text' }, '🔔'),
                                    React.createElement('span', { className: 'advice-toggle-hint' }, 'Автопоказ всплывающих советов')
                                )
                            ),
                            React.createElement('label', {
                                className: 'ios-toggle-label',
                                title: adviceSoundEnabled ? 'Выключить звук советов' : 'Включить звук советов',
                            },
                                React.createElement('div', {
                                    className: `ios-toggle ${adviceSoundEnabled ? 'ios-toggle-on' : ''}`,
                                    onClick: toggleAdviceSoundEnabled,
                                }, React.createElement('div', { className: 'ios-toggle-thumb' })),
                                React.createElement('div', { className: 'advice-toggle-text-group' },
                                    React.createElement('span', { className: 'ios-toggle-text' }, adviceSoundEnabled ? '🔊' : '🔇'),
                                    React.createElement('span', { className: 'advice-toggle-hint' }, adviceSoundEnabled ? 'Звук советов включён' : 'Звук советов выключен')
                                )
                            )
                        )
                    )
                ),
                React.createElement('div', { className: 'advice-list-items' },
                    groupKeys.length > 1
                        ? groupKeys.map(category => {
                            const categoryAdvices = groups[category];
                            const activeCategoryAdvices = categoryAdvices.filter(a =>
                                !dismissedAdvices.has(a.id) || lastDismissedAdvice?.id === a.id
                            );
                            if (activeCategoryAdvices.length === 0) return null;

                            return React.createElement('div', { key: category, className: 'advice-group' },
                                React.createElement('div', { className: 'advice-group-header' },
                                    ADVICE_CATEGORY_NAMES[category] || category
                                ),
                                activeCategoryAdvices.map((advice) =>
                                    React.createElement(AdviceCard, {
                                        key: advice.id,
                                        advice,
                                        globalIndex: sorted.indexOf(advice),
                                        isDismissed: dismissedAdvices.has(advice.id),
                                        isHidden: hiddenUntilTomorrow.has(advice.id),
                                        swipeState: adviceSwipeState[advice.id] || { x: 0, direction: null },
                                        isExpanded: expandedAdviceId === advice.id,
                                        isLastDismissed: lastDismissedAdvice?.id === advice.id,
                                        lastDismissedAction: lastDismissedAdvice?.action,
                                        onUndo: undoLastDismiss,
                                        onClearLastDismissed: clearLastDismissed,
                                        onSchedule: scheduleAdvice,
                                        onToggleExpand: handleAdviceToggleExpand,
                                        trackClick,
                                        onRate: rateAdvice,
                                        onSwipeStart: handleAdviceSwipeStart,
                                        onSwipeMove: handleAdviceSwipeMove,
                                        onSwipeEnd: handleAdviceSwipeEnd,
                                        onLongPressStart: handleAdviceLongPressStart,
                                        onLongPressEnd: handleAdviceLongPressEnd,
                                        registerCardRef: registerAdviceCardRef,
                                        onOpenTechnicalDetails: openAdviceTechnicalDetails,
                                    })
                                )
                            );
                        })
                        : sorted.filter(a => !dismissedAdvices.has(a.id) || lastDismissedAdvice?.id === a.id)
                            .map((advice, index) => React.createElement(AdviceCard, {
                                key: advice.id,
                                advice,
                                globalIndex: index,
                                isDismissed: dismissedAdvices.has(advice.id),
                                isHidden: hiddenUntilTomorrow.has(advice.id),
                                swipeState: adviceSwipeState[advice.id] || { x: 0, direction: null },
                                isExpanded: expandedAdviceId === advice.id,
                                isLastDismissed: lastDismissedAdvice?.id === advice.id,
                                lastDismissedAction: lastDismissedAdvice?.action,
                                onUndo: undoLastDismiss,
                                onClearLastDismissed: clearLastDismissed,
                                onSchedule: scheduleAdvice,
                                onToggleExpand: handleAdviceToggleExpand,
                                trackClick,
                                onRate: rateAdvice,
                                onSwipeStart: handleAdviceSwipeStart,
                                onSwipeMove: handleAdviceSwipeMove,
                                onSwipeEnd: handleAdviceSwipeEnd,
                                onLongPressStart: handleAdviceLongPressStart,
                                onLongPressEnd: handleAdviceLongPressEnd,
                                registerCardRef: registerAdviceCardRef,
                                onOpenTechnicalDetails: openAdviceTechnicalDetails,
                            }))
                ),
                activeCount > 0 && React.createElement('div', { className: 'advice-list-hints' },
                    React.createElement('span', { className: 'advice-list-hint-item' }, '← прочитано'),
                    React.createElement('span', { className: 'advice-list-hint-divider' }, '•'),
                    React.createElement('span', { className: 'advice-list-hint-item' }, 'скрыть →'),
                    React.createElement('span', { className: 'advice-list-hint-divider' }, '•'),
                    React.createElement('span', { className: 'advice-list-hint-item' }, 'удерживать = детали')
                )
            ),
            adviceDiagnosticsOpen && React.createElement(AdviceDiagnosticsModal, {
                React,
                diagnostics: adviceDiagnostics,
                onClose: closeAdviceDiagnostics
            }),
            adviceTechnicalDetailsOpen && React.createElement(AdviceTechnicalModal, {
                React,
                advice: adviceTechnicalDetails,
                onClose: closeAdviceTechnicalDetails
            })
        );
    };

    dayAdviceListUI.renderEmptyAdviceToast = function renderEmptyAdviceToast({
        React,
        adviceTrigger,
        toastVisible,
        dismissToast,
    }) {
        if (!(adviceTrigger === 'manual_empty' && toastVisible)) return null;

        return React.createElement('div', {
            className: 'macro-toast macro-toast-success visible',
            role: 'alert',
            onClick: dismissToast,
            style: { transform: 'translateX(-50%) translateY(0)' },
        },
            React.createElement('div', { className: 'macro-toast-main' },
                React.createElement('span', { className: 'macro-toast-icon' }, '✨'),
                React.createElement('span', { className: 'macro-toast-text' }, 'Всё отлично! Советов нет'),
                React.createElement('button', {
                    className: 'macro-toast-close',
                    onClick: (e) => { e.stopPropagation(); dismissToast(); },
                }, '×')
            )
        );
    };

    HEYS.dayAdviceListUI = dayAdviceListUI;

    // --- Auto advice toast UI ---
    const dayAdviceToastUI = {};

    dayAdviceToastUI.renderAutoAdviceToast = function renderAutoAdviceToast({
        React,
        adviceTrigger,
        displayedAdvice,
        toastVisible,
        adviceExpanded,
        toastSwiped,
        toastSwipeX,
        toastDetailsOpen,
        toastAppearedAtRef,
        toastRatedState,
        toastScheduledConfirm,
        haptic,
        dismissToast,
        handleToastRate,
        handleToastInteraction,
        setToastDetailsOpen,
        setAdviceExpanded,
        setAdviceTrigger,
        handleToastTouchStart,
        handleToastTouchMove,
        handleToastTouchEnd,
        handleToastUndo,
        handleToastSchedule,
        adviceTechnicalDetails,
        adviceTechnicalDetailsOpen,
        openAdviceTechnicalDetails,
        closeAdviceTechnicalDetails,
    }) {
        if (adviceTrigger === 'manual' || adviceTrigger === 'manual_empty') return null;
        if (!displayedAdvice || !toastVisible) return null;
        const adviceDescription = getAdviceDescription(displayedAdvice);
        const hasDetailsContent = !!(adviceDescription || hasExpertContent(displayedAdvice));

        return React.createElement('div', {
            className: 'macro-toast macro-toast-' + displayedAdvice.type +
                ' visible' +
                (adviceExpanded ? ' expanded' : '') +
                (toastSwiped ? ' swiped' : '') +
                (displayedAdvice.animationClass ? ' anim-' + displayedAdvice.animationClass : '') +
                (displayedAdvice.id?.startsWith('personal_best') ? ' personal-best' : ''),
            role: 'alert',
            'aria-live': 'polite',
            onClick: () => {
                if (toastSwiped) return;
                if (Math.abs(toastSwipeX) < 10 && hasDetailsContent) {
                    handleToastInteraction && handleToastInteraction('details_toggle');
                    haptic && haptic('light');
                    setToastDetailsOpen(!toastDetailsOpen);
                }
            },
            onTouchStart: handleToastTouchStart,
            onTouchMove: handleToastTouchMove,
            onTouchEnd: handleToastTouchEnd,
            style: {
                transform: toastSwiped
                    ? 'translateX(-50%) translateY(0)'
                    : `translateX(calc(-50% + ${toastSwipeX}px)) translateY(0)`,
                opacity: toastSwiped ? 1 : 1 - Math.abs(toastSwipeX) / 150,
            },
        },
            toastSwiped && React.createElement('div', {
                className: 'advice-undo-overlay',
                style: {
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    background: 'var(--toast-bg, #ecfdf5)',
                    borderRadius: '10px',
                    color: 'var(--color-slate-700, #334155)',
                    fontWeight: 600,
                    fontSize: '14px',
                    zIndex: 10,
                },
            },
                React.createElement('button', {
                    onClick: (e) => {
                        e.stopPropagation();
                        dismissToast && dismissToast();
                    },
                    style: {
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        border: 'none',
                        background: 'rgba(0,0,0,0.05)',
                        borderRadius: '999px',
                        width: '24px',
                        height: '24px',
                        cursor: 'pointer',
                        color: '#64748b'
                    }
                }, '×'),
                toastScheduledConfirm
                    ? React.createElement('span', {
                        style: { display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6' },
                    }, '⏰ Напомню через 2 часа ✓')
                    : toastRatedState
                        ? React.createElement('span', {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                color: toastRatedState === 'positive' ? '#16a34a' : '#dc2626',
                                animation: 'fadeIn 0.2s ease',
                            }
                        }, toastRatedState === 'positive' ? '👍 Учту как полезный' : '👎 Учту как слабый / вредный')
                        : React.createElement('div', {
                            style: {
                                display: 'flex',
                                alignItems: 'stretch',
                                justifyContent: 'stretch',
                                gap: '10px',
                                width: '100%',
                                height: '100%',
                                padding: '8px 10px',
                                boxSizing: 'border-box',
                            }
                        },
                            React.createElement('button', {
                                onClick: (e) => handleToastRate && handleToastRate(false, e),
                                style: {
                                    border: 'none',
                                    background: 'rgba(220, 38, 38, 0.16)',
                                    color: '#b91c1c',
                                    padding: '10px 14px',
                                    borderRadius: '18px',
                                    fontSize: '15px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    flex: '1 1 40%',
                                    minWidth: '0',
                                    minHeight: '72px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    lineHeight: 1.1,
                                    boxShadow: 'inset 0 0 0 1px rgba(220, 38, 38, 0.06)'
                                },
                            }, '👎 Вредный'),
                            React.createElement('button', {
                                onClick: handleToastSchedule,
                                style: {
                                    border: 'none',
                                    background: 'rgba(59, 130, 246, 0.14)',
                                    color: '#2563eb',
                                    padding: '10px 8px',
                                    borderRadius: '18px',
                                    fontSize: '15px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    flex: '0 0 20%',
                                    minWidth: '70px',
                                    minHeight: '72px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    lineHeight: 1.1,
                                    boxShadow: 'inset 0 0 0 1px rgba(59, 130, 246, 0.06)'
                                },
                            }, '⏰ 2ч'),
                            React.createElement('button', {
                                onClick: (e) => handleToastRate && handleToastRate(true, e),
                                style: {
                                    border: 'none',
                                    background: 'rgba(22, 163, 74, 0.16)',
                                    color: '#15803d',
                                    padding: '10px 14px',
                                    borderRadius: '18px',
                                    fontSize: '15px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    flex: '1 1 40%',
                                    minWidth: '0',
                                    minHeight: '72px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    lineHeight: 1.1,
                                    boxShadow: 'inset 0 0 0 1px rgba(22, 163, 74, 0.06)'
                                },
                            }, '👍 Полезный')
                        )
            ),
            React.createElement('div', {
                className: 'macro-toast-main',
                style: { visibility: toastSwiped ? 'hidden' : 'visible' },
            },
                React.createElement('span', { className: 'macro-toast-icon' }, displayedAdvice.icon),
                React.createElement('span', { className: 'macro-toast-text' }, displayedAdvice.text),
                React.createElement('div', {
                    className: 'macro-toast-expand',
                    onClick: (e) => {
                        e.stopPropagation();
                        const timeSinceAppear = Date.now() - toastAppearedAtRef.current;
                        if (timeSinceAppear < 500) return;
                        handleToastInteraction && handleToastInteraction('expand_all', e);
                        haptic && haptic('light');
                        setAdviceExpanded(true);
                        setAdviceTrigger('manual');
                    },
                    style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        opacity: 0.7,
                        transition: 'opacity 0.2s',
                        lineHeight: 1.1,
                    },
                },
                    React.createElement('span', { style: { fontSize: '14px' } }, '▲'),
                    React.createElement('span', { style: { fontSize: '9px' } }, 'все'),
                    React.createElement('span', { style: { fontSize: '9px' } }, 'советы')
                )
            ),
            React.createElement('div', {
                style: {
                    display: 'flex',
                    visibility: toastSwiped ? 'hidden' : 'visible',
                    alignItems: 'center',
                    justifyContent: hasDetailsContent ? 'space-between' : 'flex-end',
                    padding: '6px 0 2px 0',
                    marginTop: '2px',
                },
            },
                hasDetailsContent && React.createElement('div', {
                    onClick: (e) => {
                        e.stopPropagation();
                        handleToastInteraction && handleToastInteraction('details_toggle', e);
                        haptic && haptic('light');
                        setToastDetailsOpen(!toastDetailsOpen);
                    },
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: 'rgba(100, 100, 100, 0.8)',
                        fontWeight: 500,
                    },
                },
                    React.createElement('span', {
                        style: {
                            display: 'inline-block',
                            transition: 'transform 0.2s',
                            transform: toastDetailsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        },
                    }, '▼'),
                    toastDetailsOpen ? 'Скрыть' : 'Детали'
                ),
                React.createElement('span', {
                    style: {
                        fontSize: '11px',
                        color: 'rgba(128, 128, 128, 0.6)',
                    },
                }, '← свайп — прочитано')
            ),
            !toastSwiped && toastDetailsOpen && hasDetailsContent && React.createElement('div', {
                style: {
                    padding: '8px 12px',
                    fontSize: '13px',
                    lineHeight: '1.4',
                    color: 'rgba(80, 80, 80, 0.9)',
                    background: 'rgba(0, 0, 0, 0.03)',
                    borderRadius: '8px',
                    marginTop: '4px',
                    marginBottom: '4px',
                },
            },
                adviceDescription && React.createElement('div', { className: 'advice-list-details__description' }, adviceDescription)
            ),
            !toastSwiped && toastDetailsOpen && hasExpertContent(displayedAdvice) && React.createElement('div', { className: 'advice-list-details__actions advice-list-details__actions--subtle' },
                React.createElement('button', {
                    type: 'button',
                    className: 'advice-technical-trigger',
                    onClick: (e) => {
                        e.stopPropagation();
                        openAdviceTechnicalDetails && openAdviceTechnicalDetails(displayedAdvice, e);
                    }
                }, 'Тех. детали')
            ),
            adviceTechnicalDetailsOpen && React.createElement(AdviceTechnicalModal, {
                React,
                advice: adviceTechnicalDetails,
                onClose: closeAdviceTechnicalDetails
            })
        );
    };

    HEYS.dayAdviceToastUI = dayAdviceToastUI;

    // --- Advice state hook ---
    const dayAdviceState = {};

    dayAdviceState.useAdviceState = function useAdviceState({
        React,
        day,
        date,
        prof,
        pIndex,
        dayTot,
        normAbs,
        optimum,
        waterGoal,
        uiState,
        haptic,
        U,
        lsGet,
        currentStreak,
        setShowConfetti,
        HEYS: heysGlobal,
    }) {
        const { useState, useEffect, useMemo, useRef, useCallback } = React;
        const HEYSRef = heysGlobal || HEYS;
        const utils = U || HEYSRef.utils || {};

        const readStoredValue = useCallback((key, fallback) => {
            if (HEYSRef.store?.get) return HEYSRef.store.get(key, fallback);
            if (utils.lsGet) return utils.lsGet(key, fallback);
            try {
                const raw = localStorage.getItem(key);
                if (raw == null) return fallback;
                if (raw === 'true') return true;
                if (raw === 'false') return false;
                const first = raw[0];
                if (first === '{' || first === '[') return JSON.parse(raw);
                return raw;
            } catch (e) {
                return fallback;
            }
        }, [HEYSRef.store, utils.lsGet]);

        const setStoredValue = useCallback((key, value) => {
            if (HEYSRef.store?.set) {
                HEYSRef.store.set(key, value);
                return;
            }
            if (utils.lsSet) {
                utils.lsSet(key, value);
                return;
            }
            try {
                if (value && typeof value === 'object') {
                    localStorage.setItem(key, JSON.stringify(value));
                } else {
                    localStorage.setItem(key, String(value));
                }
            } catch (e) { }
        }, [HEYSRef.store, utils.lsSet]);

        const [toastVisible, setToastVisible] = useState(false);
        const [toastDismissed, setToastDismissed] = useState(false);
        const toastTimeoutRef = useRef(null);
        const [toastSwipeX, setToastSwipeX] = useState(0);
        const [toastSwiped, setToastSwiped] = useState(false);
        const [toastRatedState, setToastRatedState] = useState(null);
        const [toastScheduledConfirm, setToastScheduledConfirm] = useState(false);
        const [toastDetailsOpen, setToastDetailsOpen] = useState(false);
        const toastTouchStart = useRef(0);
        const toastInteractionTrackedRef = useRef(false);
        const autoSuppressionTrackedRef = useRef(new Set());

        const [adviceTrigger, setAdviceTrigger] = useState(null);
        const [adviceExpanded, setAdviceExpanded] = useState(false);
        const toastAppearedAtRef = useRef(0);
        const [displayedAdvice, setDisplayedAdvice] = useState(null);
        const [displayedAdviceList, setDisplayedAdviceList] = useState([]);
        const readAdviceSettings = useCallback(() => {
            try {
                // 1. Try store (may return null if cloud sync not yet complete)
                if (HEYSRef.store?.get) {
                    const fromStore = HEYSRef.store.get('heys_advice_settings', null);
                    if (fromStore !== null) {
                        console.info('[HEYS.advice] ✅ readAdviceSettings: source=store', fromStore);
                        return fromStore;
                    }
                    console.info('[HEYS.advice] ⚠️ readAdviceSettings: store returned null, trying lsGet');
                }
                // 2. Fallback to lsGet (encrypted localStorage, always available locally)
                if (utils.lsGet) {
                    const fromLs = utils.lsGet('heys_advice_settings', null);
                    if (fromLs !== null) {
                        console.info('[HEYS.advice] ✅ readAdviceSettings: source=lsGet', fromLs);
                        return fromLs;
                    }
                    console.info('[HEYS.advice] ⚠️ readAdviceSettings: lsGet returned null, trying raw localStorage');
                }
                // 3. Last resort: direct localStorage (for non-encrypted fallback)
                try {
                    const raw = localStorage.getItem('heys_advice_settings');
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        console.info('[HEYS.advice] ✅ readAdviceSettings: source=rawLocalStorage', parsed);
                        return parsed;
                    }
                } catch (_) { }
            } catch (e) { }
            console.warn('[HEYS.advice] ⚠️ readAdviceSettings: no settings found, returning {}');
            return {};
        }, [HEYSRef.store, utils.lsGet]);

        const [toastsEnabled, setToastsEnabled] = useState(() => {
            try {
                const settings = (() => {
                    try {
                        if (HEYSRef.store?.get) {
                            const fromStore = HEYSRef.store.get('heys_advice_settings', null);
                            if (fromStore !== null) return fromStore;
                        }
                        if (utils.lsGet) {
                            const fromLs = utils.lsGet('heys_advice_settings', null);
                            if (fromLs !== null) return fromLs;
                        }
                        const raw = localStorage.getItem('heys_advice_settings');
                        if (raw) return JSON.parse(raw);
                    } catch (_) { }
                    return {};
                })();
                return settings.toastsEnabled !== false;
            } catch (e) {
                return true;
            }
        });
        const [adviceSoundEnabled, setAdviceSoundEnabled] = useState(() => {
            try {
                const settings = (() => {
                    try {
                        if (HEYSRef.store?.get) {
                            const fromStore = HEYSRef.store.get('heys_advice_settings', null);
                            if (fromStore !== null) return fromStore;
                        }
                        if (utils.lsGet) {
                            const fromLs = utils.lsGet('heys_advice_settings', null);
                            if (fromLs !== null) return fromLs;
                        }
                        const raw = localStorage.getItem('heys_advice_settings');
                        if (raw) return JSON.parse(raw);
                    } catch (_) { }
                    return {};
                })();
                return settings.adviceSoundEnabled !== false;
            } catch (e) {
                return true;
            }
        });
        const [adviceTraceCopyState, setAdviceTraceCopyState] = useState('idle');
        const [adviceDiagnosticsOpen, setAdviceDiagnosticsOpen] = useState(false);
        const [adviceTechnicalDetailsOpen, setAdviceTechnicalDetailsOpen] = useState(false);
        const [adviceTechnicalDetails, setAdviceTechnicalDetails] = useState(null);

        // On mount: re-read settings early (before 1500ms tab_open timer) in case
        // store was not ready during useState initializer (slow network race condition)
        useEffect(() => {
            const settings = readAdviceSettings();
            const newToastsEnabled = Object.prototype.hasOwnProperty.call(settings, 'toastsEnabled')
                ? settings.toastsEnabled !== false
                : null;
            const newSoundEnabled = Object.prototype.hasOwnProperty.call(settings, 'adviceSoundEnabled')
                ? settings.adviceSoundEnabled !== false
                : null;
            console.info('[HEYS.advice] 🔍 mount useEffect: settings read', {
                settings,
                newToastsEnabled,
                newSoundEnabled,
                hasStore: !!HEYSRef.store?.get,
                hasLsGet: !!utils.lsGet,
            });
            if (newToastsEnabled !== null) setToastsEnabled(newToastsEnabled);
            if (newSoundEnabled !== null) setAdviceSoundEnabled(newSoundEnabled);
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        useEffect(() => {
            const handleSyncCompleted = () => {
                try {
                    const settings = readAdviceSettings();
                    setToastsEnabled((prev) => {
                        if (!Object.prototype.hasOwnProperty.call(settings, 'toastsEnabled')) return prev;
                        const cloudVal = settings.toastsEnabled !== false;
                        return prev !== cloudVal ? cloudVal : prev;
                    });
                    setAdviceSoundEnabled((prev) => {
                        if (!Object.prototype.hasOwnProperty.call(settings, 'adviceSoundEnabled')) return prev;
                        const cloudVal = settings.adviceSoundEnabled !== false;
                        return prev !== cloudVal ? cloudVal : prev;
                    });
                } catch (e) {
                    HEYSRef.analytics?.trackError?.(e, { context: 'advice_settings_sync' });
                }
            };

            window.addEventListener('heysSyncCompleted', handleSyncCompleted);
            return () => window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
        }, [HEYSRef.analytics, readAdviceSettings]);

        const [dismissedAdvices, setDismissedAdvices] = useState(() => {
            try {
                const saved = readStoredValue('heys_advice_read_today', null);
                if (saved) {
                    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                    if (parsed.date === new Date().toISOString().slice(0, 10)) {
                        return new Set(parsed.ids);
                    }
                }
            } catch (e) { }
            return new Set();
        });
        const [hiddenUntilTomorrow, setHiddenUntilTomorrow] = useState(() => {
            try {
                const saved = readStoredValue('heys_advice_hidden_today', null);
                if (saved) {
                    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                    if (parsed.date === new Date().toISOString().slice(0, 10)) {
                        return new Set(parsed.ids);
                    }
                }
            } catch (e) { }
            return new Set();
        });
        const [adviceSwipeState, setAdviceSwipeState] = useState({});
        const [expandedAdviceId, setExpandedAdviceId] = useState(null);
        const [dismissAllAnimation, setDismissAllAnimation] = useState(false);
        const [lastDismissedAdvice, setLastDismissedAdvice] = useState(null);
        const [undoFading, setUndoFading] = useState(false);
        const adviceSwipeStart = useRef({});
        const adviceCardRefs = useRef({});
        const dismissToastRef = useRef(null);
        const registerAdviceCardRef = useCallback((adviceId, el) => {
            if (el) adviceCardRefs.current[adviceId] = el;
        }, []);

        const adviceListTouchStartY = useRef(null);
        const adviceListTouchLastY = useRef(null);
        const handleAdviceListTouchStart = useCallback((e) => {
            if (!e.touches?.length) return;
            adviceListTouchStartY.current = e.touches[0].clientY;
            adviceListTouchLastY.current = e.touches[0].clientY;
        }, []);
        const handleAdviceListTouchMove = useCallback((e) => {
            if (!e.touches?.length || adviceListTouchStartY.current === null) return;
            adviceListTouchLastY.current = e.touches[0].clientY;
        }, []);
        const handleAdviceListTouchEnd = useCallback(() => {
            if (adviceListTouchStartY.current === null || adviceListTouchLastY.current === null) return;
            const diff = adviceListTouchLastY.current - adviceListTouchStartY.current;
            adviceListTouchStartY.current = null;
            adviceListTouchLastY.current = null;
            if (diff > 50 && typeof dismissToastRef.current === 'function') {
                dismissToastRef.current();
            }
        }, []);

        const ADVICE_PRIORITY = { warning: 0, insight: 1, tip: 2, achievement: 3, info: 4 };
        const ADVICE_CATEGORY_NAMES = {
            nutrition: '🍎 Питание',
            training: '💪 Тренировки',
            lifestyle: '🌙 Режим',
            hydration: '💧 Вода',
            emotional: '🧠 Психология',
            achievement: '🏆 Достижения',
            motivation: '✨ Мотивация',
            personalized: '👤 Персональное',
            correlation: '🔗 Корреляции',
            timing: '⏰ Тайминг',
            sleep: '😴 Сон',
            activity: '🚶 Активность',
        };

        const getSortedGroupedAdvices = useCallback((advices) => {
            if (!advices?.length) return { sorted: [], groups: {} };
            const filtered = advices.filter(a =>
                (!dismissedAdvices.has(a.id) && !hiddenUntilTomorrow.has(a.id)) ||
                (lastDismissedAdvice?.id === a.id)
            );
            const sorted = [...filtered].sort((a, b) =>
                (ADVICE_PRIORITY[a.type] ?? 99) - (ADVICE_PRIORITY[b.type] ?? 99)
            );
            const groups = {};
            sorted.forEach(advice => {
                const cat = advice.category || 'other';
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(advice);
            });
            return { sorted, groups };
        }, [dismissedAdvices, hiddenUntilTomorrow, lastDismissedAdvice]);

        const handleAdviceSwipeStart = useCallback((adviceId, e) => {
            adviceSwipeStart.current[adviceId] = e.touches[0].clientX;
        }, []);
        const handleAdviceSwipeMove = useCallback((adviceId, e) => {
            const startX = adviceSwipeStart.current[adviceId];
            if (startX === undefined) return;
            const diff = e.touches[0].clientX - startX;
            const direction = diff < 0 ? 'left' : 'right';
            setAdviceSwipeState(prev => ({ ...prev, [adviceId]: { x: diff, direction } }));
        }, []);

        const playAdviceSound = useCallback(() => {
            if (adviceSoundEnabled && HEYSRef?.sounds) {
                HEYSRef.sounds.ding();
            }
        }, [adviceSoundEnabled, HEYSRef]);

        const playAdviceHideSound = useCallback(() => {
            if (adviceSoundEnabled && HEYSRef?.sounds) {
                HEYSRef.sounds.whoosh();
            }
        }, [adviceSoundEnabled, HEYSRef]);

        const toggleToastsEnabled = useCallback(() => {
            setToastsEnabled(prev => {
                const newVal = !prev;
                try {
                    const settings = HEYSRef.store?.get
                        ? (HEYSRef.store.get('heys_advice_settings', null) || {})
                        : (utils.lsGet ? utils.lsGet('heys_advice_settings', {}) : {});
                    settings.toastsEnabled = newVal;
                    if (HEYSRef.store?.set) {
                        HEYSRef.store.set('heys_advice_settings', settings);
                    } else if (utils.lsSet) {
                        utils.lsSet('heys_advice_settings', settings);
                    }
                    window.dispatchEvent(new CustomEvent('heysAdviceSettingsChanged', { detail: settings }));
                } catch (e) { }
                if (typeof haptic === 'function') haptic('light');
                return newVal;
            });
        }, [haptic, utils.lsGet, utils.lsSet]);

        const toggleAdviceSoundEnabled = useCallback(() => {
            setAdviceSoundEnabled(prev => {
                const newVal = !prev;
                try {
                    const settings = HEYSRef.store?.get
                        ? (HEYSRef.store.get('heys_advice_settings', null) || {})
                        : (utils.lsGet ? utils.lsGet('heys_advice_settings', {}) : {});
                    settings.adviceSoundEnabled = newVal;
                    if (HEYSRef.store?.set) {
                        HEYSRef.store.set('heys_advice_settings', settings);
                    } else if (utils.lsSet) {
                        utils.lsSet('heys_advice_settings', settings);
                    }
                    window.dispatchEvent(new CustomEvent('heysAdviceSettingsChanged', { detail: settings }));
                } catch (e) { }
                if (typeof haptic === 'function') haptic('light');
                return newVal;
            });
        }, [haptic, utils.lsGet, utils.lsSet]);

        const [adviceModuleReady, setAdviceModuleReady] = useState(!!HEYSRef?.advice?.useAdviceEngine);

        useEffect(() => {
            if (adviceModuleReady) return;
            const checkInterval = setInterval(() => {
                if (HEYSRef?.advice?.useAdviceEngine) {
                    setAdviceModuleReady(true);
                    clearInterval(checkInterval);
                }
            }, 100);
            const timeout = setTimeout(() => clearInterval(checkInterval), 5000);
            return () => {
                clearInterval(checkInterval);
                clearTimeout(timeout);
            };
        }, [adviceModuleReady, HEYSRef]);

        const adviceEngine = adviceModuleReady ? HEYSRef.advice.useAdviceEngine : null;

        const hasClient = !!(HEYSRef?.currentClientId);
        const emptyAdviceResult = {
            primary: null,
            relevant: [],
            adviceCount: 0,
            allAdvices: [],
            badgeAdvices: [],
            trace: null,
            markShown: null,
            markRead: null,
            markHidden: null,
            trackClick: null,
            rateAdvice: null,
            scheduleAdvice: null,
            scheduledCount: 0
        };

        const adviceResult = (adviceEngine && hasClient) ? adviceEngine({
            dayTot,
            normAbs,
            optimum,
            displayOptimum: null,
            caloricDebt: null,
            day,
            pIndex,
            currentStreak,
            trigger: adviceTrigger,
            uiState,
            prof,
            waterGoal,
        }) : emptyAdviceResult;

        const safeAdviceResult = adviceResult || emptyAdviceResult;
        const {
            primary: advicePrimary = null,
            relevant: adviceRelevant = [],
            adviceCount = 0,
            allAdvices = [],
            badgeAdvices = [],
            trace: adviceTrace = null,
            markShown = null,
            markRead = null,
            markHidden = null,
            rateAdvice = null,
            trackClick = null,
            scheduleAdvice = null,
            scheduledCount = 0,
        } = safeAdviceResult || {};

        const copyTextFallback = useCallback((text) => {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', 'true');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                textarea.style.pointerEvents = 'none';
                document.body.appendChild(textarea);
                textarea.select();
                textarea.setSelectionRange(0, textarea.value.length);
                const copied = document.execCommand('copy');
                document.body.removeChild(textarea);
                return copied;
            } catch (e) {
                return false;
            }
        }, []);

        const copyAdviceTrace = useCallback(async () => {
            if (!adviceTrace) {
                setAdviceTraceCopyState('error');
                return false;
            }

            const dailyLog = HEYSRef?.advice?.getDailyAdviceTraceLog?.(date);
            const dailyFormatter = HEYSRef?.advice?.formatDailyAdviceTraceForClipboard;
            const formatter = HEYSRef?.advice?.formatAdviceTraceForClipboard;
            const payload = (dailyLog && typeof dailyFormatter === 'function')
                ? dailyFormatter(dailyLog, { mode: 'clipboard', timelineLimit: 8 })
                : typeof formatter === 'function'
                    ? formatter(adviceTrace, { mode: 'clipboard' })
                    : JSON.stringify(adviceTrace, null, 2);

            try {
                if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(payload);
                } else {
                    const copied = copyTextFallback(payload);
                    if (!copied) throw new Error('clipboard fallback failed');
                }

                setAdviceTraceCopyState('success');
                if (typeof haptic === 'function') haptic('light');
                HEYSRef?.advice?.recordDailyAdviceTraceEvent?.(date, 'trace_exported', {
                    source: dailyLog ? 'daily_log' : 'single_trace',
                    trigger: adviceTrace?.trigger || null,
                    visibleForManualCount: adviceTrace?.outputs?.visibleForManualCount || 0,
                    eligibleForAutoToastCount: adviceTrace?.outputs?.eligibleForAutoToastCount || 0
                });
                console.info('[HEYS.advice] trace copied to clipboard');
                return true;
            } catch (e) {
                setAdviceTraceCopyState('error');
                console.error('[HEYS.advice] failed to copy trace:', e?.message || e);
                return false;
            }
        }, [adviceTrace, HEYSRef, copyTextFallback, haptic]);

        const adviceDiagnostics = useMemo(() => {
            try {
                if (!date || typeof HEYSRef?.advice?.getDailyAdviceTraceDiagnostics !== 'function') return null;
                return HEYSRef.advice.getDailyAdviceTraceDiagnostics(date);
            } catch (e) {
                console.error('[HEYS.advice] failed to build diagnostics modal payload:', e?.message || e);
                return null;
            }
        }, [date, HEYSRef, adviceTrace, toastVisible, adviceTrigger, adviceTraceCopyState]);

        const openAdviceDiagnostics = useCallback((e) => {
            if (e?.stopPropagation) e.stopPropagation();
            setAdviceDiagnosticsOpen(true);
            if (typeof haptic === 'function') haptic('light');
        }, [haptic]);

        const closeAdviceDiagnostics = useCallback((e) => {
            if (e?.stopPropagation) e.stopPropagation();
            setAdviceDiagnosticsOpen(false);
        }, []);

        const openAdviceTechnicalDetails = useCallback((advice, e) => {
            if (e?.stopPropagation) e.stopPropagation();
            if (!advice) return;
            setAdviceTechnicalDetails(advice);
            setAdviceTechnicalDetailsOpen(true);
            if (typeof haptic === 'function') haptic('light');
        }, [haptic]);

        const closeAdviceTechnicalDetails = useCallback((e) => {
            if (e?.stopPropagation) e.stopPropagation();
            setAdviceTechnicalDetailsOpen(false);
            setAdviceTechnicalDetails(null);
        }, []);

        useEffect(() => {
            if (adviceTraceCopyState === 'idle') return undefined;
            const timer = setTimeout(() => setAdviceTraceCopyState('idle'), 2200);
            return () => clearTimeout(timer);
        }, [adviceTraceCopyState]);

        useEffect(() => {
            if (!adviceDiagnosticsOpen && !adviceTechnicalDetailsOpen) return undefined;
            const handleEscape = (event) => {
                if (event?.key === 'Escape') {
                    setAdviceDiagnosticsOpen(false);
                    setAdviceTechnicalDetailsOpen(false);
                }
            };
            window.addEventListener('keydown', handleEscape);
            return () => window.removeEventListener('keydown', handleEscape);
        }, [adviceDiagnosticsOpen, adviceTechnicalDetailsOpen]);

        useEffect(() => {
            if (!adviceTrace) return;
            HEYSRef?.advice?.appendDailyAdviceTraceSnapshot?.(adviceTrace);
        }, [adviceTrace, HEYSRef]);

        const safeAdviceRelevant = Array.isArray(adviceRelevant) ? adviceRelevant : [];
        const safeBadgeAdvices = Array.isArray(badgeAdvices) ? badgeAdvices : [];
        const safeDismissedAdvices = dismissedAdvices instanceof Set ? dismissedAdvices : new Set();
        const safeHiddenUntilTomorrow = hiddenUntilTomorrow instanceof Set ? hiddenUntilTomorrow : new Set();

        const totalAdviceCount = useMemo(() => {
            if (!Array.isArray(safeBadgeAdvices) || safeBadgeAdvices.length === 0) return 0;
            try {
                return safeBadgeAdvices.filter(a =>
                    a && a.id && !safeDismissedAdvices.has(a.id) && !safeHiddenUntilTomorrow.has(a.id)
                ).length;
            } catch (e) {
                return 0;
            }
        }, [safeBadgeAdvices, safeDismissedAdvices, safeHiddenUntilTomorrow]);

        useEffect(() => {
            const badge = document.getElementById('nav-advice-badge');
            if (badge) {
                badge.textContent = totalAdviceCount > 0 ? totalAdviceCount : '';
                badge.style.display = totalAdviceCount > 0 ? 'flex' : 'none';
            }
        }, [totalAdviceCount]);

        useEffect(() => {
            const handleShowAdvice = () => {
                if (totalAdviceCount > 0) {
                    const engineVisibleAdviceCount = Array.isArray(safeBadgeAdvices)
                        ? safeBadgeAdvices.length
                        : 0;
                    setAdviceTrigger('manual');
                    setAdviceExpanded(true);
                    setToastVisible(true);
                    setToastDismissed(false);
                    HEYSRef?.advice?.recordDailyAdviceTraceEvent?.(date, 'manual_open', {
                        trigger: 'manual',
                        visibleAdviceCount: totalAdviceCount,
                        displayedAdviceCount: totalAdviceCount,
                        engineVisibleAdviceCount,
                        badgeCount: Array.isArray(safeBadgeAdvices) ? safeBadgeAdvices.length : 0,
                        filteredOutCount: Math.max(0, engineVisibleAdviceCount - totalAdviceCount)
                    });
                    haptic('light');
                } else {
                    setAdviceTrigger('manual_empty');
                    setToastVisible(true);
                    setToastDismissed(false);
                    HEYSRef?.advice?.recordDailyAdviceTraceEvent?.(date, 'manual_empty', {
                        trigger: 'manual_empty',
                        visibleAdviceCount: 0,
                        badgeCount: 0
                    });
                    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                    toastTimeoutRef.current = setTimeout(() => {
                        setToastVisible(false);
                        setAdviceTrigger(null);
                    }, 2000);
                }
            };
            window.addEventListener('heysShowAdvice', handleShowAdvice);
            return () => window.removeEventListener('heysShowAdvice', handleShowAdvice);
        }, [totalAdviceCount, haptic, HEYSRef, date, safeBadgeAdvices, adviceTrace]);

        useEffect(() => {
            const handleProductAdded = () => {
                if (HEYSRef.advice?.invalidateAdviceCache) {
                    HEYSRef.advice.invalidateAdviceCache();
                }
                setTimeout(() => setAdviceTrigger('product_added'), 500);
            };
            window.addEventListener('heysProductAdded', handleProductAdded);
            return () => window.removeEventListener('heysProductAdded', handleProductAdded);
        }, [HEYSRef.advice]);

        useEffect(() => {
            const checkScheduled = () => {
                try {
                    const rawScheduled = readStoredValue('heys_scheduled_advices', []) || [];
                    const scheduled = Array.isArray(rawScheduled) ? rawScheduled : [];
                    const now = Date.now();
                    const ready = scheduled.filter(s => s.showAt <= now);
                    if (ready.length > 0) {
                        setAdviceTrigger('scheduled');
                    }
                } catch (e) { }
            };
            const intervalId = setInterval(checkScheduled, 30000);
            return () => clearInterval(intervalId);
        }, [readStoredValue]);

        useEffect(() => {
            const handleCelebrate = () => {
                setShowConfetti(true);
                if (typeof haptic === 'function') haptic('success');
                setTimeout(() => setShowConfetti(false), 2500);
            };
            window.addEventListener('heysCelebrate', handleCelebrate);
            return () => window.removeEventListener('heysCelebrate', handleCelebrate);
        }, [haptic, setShowConfetti]);

        useEffect(() => {
            // Cold-start guard (v1.0): if heys_advice_settings is absent from localStorage
            // (incognito / first visit), the user's toastsEnabled=false setting hasn't loaded
            // yet at 1500ms. Wait for Phase B sync (which carries CLIENT_SPECIFIC_KEYS incl.
            // heys_advice_settings) before firing tab_open.
            // Phase A is explicitly ignored — it has no dayv2 or advice settings.
            // Fallback: 5s if sync never arrives (offline, error, new user with no cloud data).
            const isColdStart = (() => {
                try {
                    if (HEYSRef.store?.get) {
                        const fromStore = HEYSRef.store.get('heys_advice_settings', null);
                        if (fromStore !== null) return false;
                    }
                    const raw = localStorage.getItem('heys_advice_settings');
                    return raw === null;
                } catch (_) {
                    return false;
                }
            })();

            if (!isColdStart) {
                // Normal path: settings already in localStorage (returning user)
                const timer = setTimeout(() => {
                    setToastsEnabled((currentVal) => {
                        console.info('[HEYS.advice] 🔔 tab_open timer fired: toastsEnabled =', currentVal);
                        return currentVal;
                    });
                    setAdviceTrigger('tab_open');
                }, 1500);
                return () => clearTimeout(timer);
            }

            // Cold-start path: wait for Phase B before triggering tab_open toast
            console.info('[HEYS.advice] 🛡️ cold-start guard: waiting for Phase B sync before tab_open');
            let fired = false;
            let fallbackTimer;

            const fireTabOpen = () => {
                if (fired) return;
                fired = true;
                clearTimeout(fallbackTimer);
                setToastsEnabled((currentVal) => {
                    console.info('[HEYS.advice] 🔔 tab_open (cold-start) fired: toastsEnabled =', currentVal);
                    return currentVal;
                });
                setAdviceTrigger('tab_open');
            };

            const handlePhaseB = (e) => {
                if (e && e.detail && e.detail.phaseA) return; // Phase A has no heys_advice_settings
                // 100ms buffer so setToastsEnabled from the sibling heysSyncCompleted
                // listener has time to commit before advicePrimary effect evaluates it
                setTimeout(fireTabOpen, 100);
            };

            window.addEventListener('heysSyncCompleted', handlePhaseB);

            // Fallback: offline / error / new user with zero cloud data
            fallbackTimer = setTimeout(() => {
                console.info('[HEYS.advice] 🛡️ cold-start fallback (5s): firing tab_open');
                fireTabOpen();
            }, 5000);

            return () => {
                window.removeEventListener('heysSyncCompleted', handlePhaseB);
                clearTimeout(fallbackTimer);
            };
        }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

        useEffect(() => {
            if (!toastVisible) return;

            if (adviceTrigger === 'manual') {
                if (safeAdviceRelevant.length === 0) {
                    setExpandedAdviceId(null);
                    setAdviceTrigger('manual_empty');
                } else if (expandedAdviceId && !safeAdviceRelevant.some(item => item?.id === expandedAdviceId)) {
                    setExpandedAdviceId(null);
                }
                return;
            }

            if (adviceTrigger !== 'manual_empty' && displayedAdvice) {
                if (safeAdviceRelevant.length === 0) {
                    setToastVisible(false);
                    setDisplayedAdvice(null);
                    setDisplayedAdviceList([]);
                    setToastDetailsOpen(false);
                    setToastSwiped(false);
                    setToastRatedState(null);
                    setToastScheduledConfirm(false);
                    setAdviceTrigger(null);
                    return;
                }

                if (!isAdviceStillRelevant(displayedAdvice, safeAdviceRelevant)) {
                    setDisplayedAdvice(safeAdviceRelevant[0] || null);
                    setDisplayedAdviceList(safeAdviceRelevant);
                    setToastDetailsOpen(false);
                    setToastSwiped(false);
                    setToastRatedState(null);
                    setToastScheduledConfirm(false);
                }
            }
        }, [toastVisible, adviceTrigger, safeAdviceRelevant, displayedAdvice, expandedAdviceId]);

        useEffect(() => {
            if (!advicePrimary) return;

            const isManualTrigger = adviceTrigger === 'manual' || adviceTrigger === 'manual_empty';
            if (!isManualTrigger && dismissedAdvices.has(advicePrimary.id)) {
                const suppressionKey = `${date || 'unknown'}|${adviceTrigger || 'unknown'}|${advicePrimary.id}`;
                if (!autoSuppressionTrackedRef.current.has(suppressionKey)) {
                    autoSuppressionTrackedRef.current.add(suppressionKey);
                    HEYSRef?.advice?.recordDailyAdviceTraceEvent?.(date, 'auto_suppressed_ui', {
                        adviceId: advicePrimary.id,
                        trigger: adviceTrigger || null,
                        reason: hiddenUntilTomorrow.has(advicePrimary.id)
                            ? 'hidden_until_tomorrow'
                            : 'dismissed_today',
                        module: advicePrimary?.__traceModule || null,
                        category: advicePrimary?.category || null
                    });
                }
                return;
            }

            if (!isManualTrigger && !toastsEnabled) {
                console.info('[HEYS.advice] 🚫 Toast BLOCKED: toastsEnabled=false, adviceTrigger=' + adviceTrigger);
                setDisplayedAdvice(advicePrimary);
                setDisplayedAdviceList(safeAdviceRelevant);
                setToastVisible(false);
                if (markShown) markShown(advicePrimary);
                return;
            }

            console.info('[HEYS.advice] ✅ Toast SHOWN: toastsEnabled=' + toastsEnabled + ', adviceTrigger=' + adviceTrigger);
            setDisplayedAdvice(advicePrimary);
            setDisplayedAdviceList(safeAdviceRelevant);
            setAdviceExpanded(false);
            setToastVisible(true);
            toastAppearedAtRef.current = Date.now();
            setToastDismissed(false);
            setToastDetailsOpen(false);
            setToastRatedState(null);

            if (adviceSoundEnabled && HEYSRef?.sounds) {
                if (advicePrimary.type === 'achievement' || advicePrimary.showConfetti) {
                    HEYSRef.sounds.success();
                } else if (advicePrimary.type === 'warning') {
                    HEYSRef.sounds.warning();
                } else {
                    HEYSRef.sounds.pop();
                }
            }

            if ((advicePrimary.type === 'achievement' || advicePrimary.type === 'warning') && typeof haptic === 'function') {
                haptic('light');
            }
            if (advicePrimary.onShow) advicePrimary.onShow();
            if (advicePrimary.showConfetti) {
                setShowConfetti(true);
                if (typeof haptic === 'function') haptic('success');
                setTimeout(() => setShowConfetti(false), 2000);
            }

            if (!isManualTrigger && markShown) markShown(advicePrimary);
        }, [advicePrimary?.id, adviceTrigger, adviceSoundEnabled, dismissedAdvices, hiddenUntilTomorrow, markShown, toastsEnabled, setShowConfetti, haptic, HEYSRef, safeAdviceRelevant, date]);

        useEffect(() => {
            setAdviceTrigger(null);
            setAdviceExpanded(false);
            setToastVisible(false);
            setDisplayedAdvice(null);
            setDisplayedAdviceList([]);
            setToastDetailsOpen(false);
            if (HEYSRef?.advice?.resetSessionAdvices) HEYSRef.advice.resetSessionAdvices();
        }, [date, HEYSRef]);

        useEffect(() => {
            if (uiState.showTimePicker || uiState.showWeightPicker ||
                uiState.showDeficitPicker || uiState.showZonePicker) {
                setAdviceExpanded(false);
            }
        }, [uiState.showTimePicker, uiState.showWeightPicker,
        uiState.showDeficitPicker, uiState.showZonePicker]);

        useEffect(() => {
            if (adviceTrigger !== 'manual') {
                setAdviceSwipeState({});
                setExpandedAdviceId(null);
                setDismissAllAnimation(false);
                setAdviceDiagnosticsOpen(false);
                setAdviceTechnicalDetailsOpen(false);
                setAdviceTechnicalDetails(null);
            }
        }, [adviceTrigger]);

        useEffect(() => {
            const timer = setTimeout(() => {
                try {
                    const value = new Date().toISOString().slice(0, 10);
                    setStoredValue('heys_last_visit', value);
                } catch (e) { }
            }, 3000);
            return () => clearTimeout(timer);
        }, [setStoredValue]);

        const handleToastTouchStart = (e) => {
            if (toastSwiped) return;
            e.stopPropagation();
            toastTouchStart.current = e.touches[0].clientX;
        };
        const handleToastTouchMove = (e) => {
            if (toastSwiped) return;
            e.stopPropagation();
            const diff = e.touches[0].clientX - toastTouchStart.current;
            if (diff < 0) {
                setToastSwipeX(diff);
            }
        };
        const handleToastTouchEnd = (e) => {
            if (toastSwiped) return;
            e.stopPropagation();
            if (toastSwipeX < -80) {
                setToastSwiped(true);
                setToastRatedState(null);
                setToastScheduledConfirm(false);
                if (toastTimeoutRef.current) {
                    clearTimeout(toastTimeoutRef.current);
                    toastTimeoutRef.current = null;
                }
            }
            setToastSwipeX(0);
        };

        const handleToastUndo = () => {
            setToastSwiped(false);
            setToastRatedState(null);
            setToastScheduledConfirm(false);
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
                toastTimeoutRef.current = null;
            }
        };

        const handleToastInteraction = useCallback((source, e) => {
            if (e?.stopPropagation) e.stopPropagation();
            if (!displayedAdvice || !trackClick) return;
            if (toastInteractionTrackedRef.current) return;
            trackClick(displayedAdvice, { source: source || 'toast_interaction' });
            toastInteractionTrackedRef.current = true;
        }, [displayedAdvice, trackClick]);

        const handleToastRate = (isPositive, e) => {
            e && e.stopPropagation();
            if (displayedAdvice && rateAdvice) {
                rateAdvice(displayedAdvice, isPositive);
                setToastRatedState(isPositive ? 'positive' : 'negative');
                setToastScheduledConfirm(false);
                if (navigator.vibrate) navigator.vibrate(30);
                setTimeout(() => {
                    dismissToast();
                }, 900);
            }
        };

        const handleToastSchedule = (e) => {
            e && e.stopPropagation();
            if (displayedAdvice && scheduleAdvice) {
                scheduleAdvice(displayedAdvice, 120);
                setToastRatedState(null);
                setToastScheduledConfirm(true);
                if (navigator.vibrate) navigator.vibrate(50);
                setTimeout(() => {
                    dismissToast();
                }, 1500);
            }
        };

        const undoLastDismiss = useCallback(() => {
            if (!lastDismissedAdvice) return;
            const { id, action, hideTimeout } = lastDismissedAdvice;

            if (hideTimeout) clearTimeout(hideTimeout);

            if (action === 'read' || action === 'hidden') {
                setDismissedAdvices(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(id);
                    try {
                        const saveData = {
                            date: new Date().toISOString().slice(0, 10),
                            ids: [...newSet],
                        };
                        setStoredValue('heys_advice_read_today', saveData);
                    } catch (e) { }
                    return newSet;
                });
            }
            if (action === 'hidden') {
                setHiddenUntilTomorrow(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(id);
                    try {
                        const saveData = {
                            date: new Date().toISOString().slice(0, 10),
                            ids: [...newSet],
                        };
                        setStoredValue('heys_advice_hidden_today', saveData);
                    } catch (e) { }
                    return newSet;
                });
            }

            setLastDismissedAdvice(null);
            haptic('light');
        }, [haptic, lastDismissedAdvice, setStoredValue]);

        const clearLastDismissed = useCallback(() => {
            if (lastDismissedAdvice?.hideTimeout) {
                clearTimeout(lastDismissedAdvice.hideTimeout);
            }
            setLastDismissedAdvice(null);
        }, [lastDismissedAdvice]);

        const handleAdviceSwipeEnd = useCallback((adviceId) => {
            const state = adviceSwipeState[adviceId];
            const swipeX = state?.x || 0;

            if (lastDismissedAdvice?.hideTimeout) clearTimeout(lastDismissedAdvice.hideTimeout);

            if (swipeX < -100) {
                setDismissedAdvices(prev => {
                    const newSet = new Set([...prev, adviceId]);
                    const saveData = {
                        date: new Date().toISOString().slice(0, 10),
                        ids: [...newSet],
                    };
                    try {
                        setStoredValue('heys_advice_read_today', saveData);
                    } catch (e) { }
                    return newSet;
                });

                if (HEYSRef?.game?.addXP) {
                    const cardEl = adviceCardRefs.current[adviceId];
                    HEYSRef.game.addXP(0, 'advice_read', cardEl);
                }

                const advice = safeAdviceRelevant.find(item => item?.id === adviceId) || safeBadgeAdvices.find(item => item?.id === adviceId);
                if (advice && markRead) markRead(advice);

                playAdviceSound();
                haptic('light');

                setUndoFading(false);
                const hideTimeout = setTimeout(() => {
                    setLastDismissedAdvice(null);
                    setUndoFading(false);
                }, 3000);
                setLastDismissedAdvice({ id: adviceId, action: 'read', hideTimeout });

            } else if (swipeX > 100) {
                setHiddenUntilTomorrow(prev => {
                    const newSet = new Set([...prev, adviceId]);
                    try {
                        const saveData = {
                            date: new Date().toISOString().slice(0, 10),
                            ids: [...newSet],
                        };
                        setStoredValue('heys_advice_hidden_today', saveData);
                    } catch (e) { }
                    return newSet;
                });
                setDismissedAdvices(prev => {
                    const newSet = new Set([...prev, adviceId]);
                    try {
                        const saveData = {
                            date: new Date().toISOString().slice(0, 10),
                            ids: [...newSet],
                        };
                        setStoredValue('heys_advice_read_today', saveData);
                    } catch (e) { }
                    return newSet;
                });

                const advice = safeAdviceRelevant.find(item => item?.id === adviceId) || safeBadgeAdvices.find(item => item?.id === adviceId);
                if (advice && markHidden) markHidden(advice);

                playAdviceHideSound();
                haptic('medium');

                setUndoFading(false);
                const hideTimeout = setTimeout(() => {
                    setLastDismissedAdvice(null);
                    setUndoFading(false);
                }, 3000);
                setLastDismissedAdvice({ id: adviceId, action: 'hidden', hideTimeout });
            }

            setAdviceSwipeState(prev => ({ ...prev, [adviceId]: { x: 0, direction: null } }));
            delete adviceSwipeStart.current[adviceId];
        }, [adviceSwipeState, haptic, lastDismissedAdvice, playAdviceSound, playAdviceHideSound, safeAdviceRelevant, safeBadgeAdvices, markRead, markHidden, setStoredValue]);

        const adviceLongPressTimer = useRef(null);
        const handleAdviceLongPressStart = useCallback((adviceId) => {
            adviceLongPressTimer.current = setTimeout(() => {
                setExpandedAdviceId(prev => prev === adviceId ? null : adviceId);
                haptic('light');
            }, 500);
        }, [haptic]);
        const handleAdviceLongPressEnd = useCallback(() => {
            if (adviceLongPressTimer.current) {
                clearTimeout(adviceLongPressTimer.current);
                adviceLongPressTimer.current = null;
            }
        }, []);

        const handleAdviceToggleExpand = useCallback((adviceId) => {
            setExpandedAdviceId(prev => prev === adviceId ? null : adviceId);
            haptic('light');
        }, [haptic]);

        const handleDismissAll = () => {
            setDismissAllAnimation(true);
            haptic('medium');

            const advices = safeAdviceRelevant.filter(a => !dismissedAdvices.has(a.id) && !hiddenUntilTomorrow.has(a.id));

            advices.forEach((advice, index) => {
                setTimeout(() => {
                    setDismissedAdvices(prev => {
                        const newSet = new Set([...prev, advice.id]);
                        if (index === advices.length - 1) {
                            try {
                                const saveData = {
                                    date: new Date().toISOString().slice(0, 10),
                                    ids: [...newSet],
                                };
                                setStoredValue('heys_advice_read_today', saveData);
                            } catch (e) { }
                        }
                        return newSet;
                    });
                    if (index < 3) haptic('light');
                }, index * 80);
            });

            setTimeout(() => {
                setDismissAllAnimation(false);
                dismissToast();
            }, advices.length * 80 + 300);
        };

        const dismissToast = () => {
            if (displayedAdvice?.id) {
                setDismissedAdvices(prev => {
                    const newSet = new Set([...prev, displayedAdvice.id]);
                    const saveData = {
                        date: new Date().toISOString().slice(0, 10),
                        ids: [...newSet],
                    };
                    try {
                        setStoredValue('heys_advice_read_today', saveData);
                    } catch (e) { }
                    return newSet;
                });

                if (markRead) markRead(displayedAdvice);

                if (HEYSRef?.game?.addXP) {
                    HEYSRef.game.addXP(0, 'advice_read', null);
                }
            }

            setToastVisible(false);
            setToastDismissed(true);
            setToastSwiped(false);
            setToastRatedState(null);
            setToastScheduledConfirm(false);
            setAdviceExpanded(false);
            setAdviceTrigger(null);
            setDisplayedAdvice(null);
            setDisplayedAdviceList([]);
            toastInteractionTrackedRef.current = false;
            setAdviceTechnicalDetails(null);
            setAdviceTechnicalDetailsOpen(false);
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };

        useEffect(() => {
            toastInteractionTrackedRef.current = false;
        }, [displayedAdvice?.id, toastVisible, adviceTrigger]);

        useEffect(() => {
            autoSuppressionTrackedRef.current = new Set();
        }, [date]);

        dismissToastRef.current = dismissToast;

        return {
            toastVisible,
            setToastVisible,
            toastDismissed,
            setToastDismissed,
            toastTimeoutRef,
            toastSwipeX,
            setToastSwipeX,
            toastSwiped,
            setToastSwiped,
            toastRatedState,
            setToastRatedState,
            toastScheduledConfirm,
            setToastScheduledConfirm,
            toastDetailsOpen,
            setToastDetailsOpen,
            toastAppearedAtRef,
            toastTouchStart,
            handleToastTouchStart,
            handleToastTouchMove,
            handleToastTouchEnd,
            handleToastUndo,
            handleToastInteraction,
            handleToastRate,
            handleToastSchedule,
            adviceTrigger,
            setAdviceTrigger,
            adviceExpanded,
            setAdviceExpanded,
            displayedAdvice,
            setDisplayedAdvice,
            displayedAdviceList,
            setDisplayedAdviceList,
            advicePrimary,
            adviceRelevant: safeAdviceRelevant,
            adviceCount,
            allAdvices,
            badgeAdvices: safeBadgeAdvices,
            adviceTrace,
            adviceTraceAvailable: !!adviceTrace,
            adviceTraceCopyState,
            markShown,
            markRead,
            markHidden,
            rateAdvice,
            trackClick,
            scheduleAdvice,
            copyAdviceTrace,
            adviceDiagnostics,
            adviceDiagnosticsOpen,
            openAdviceDiagnostics,
            closeAdviceDiagnostics,
            adviceTechnicalDetails,
            adviceTechnicalDetailsOpen,
            openAdviceTechnicalDetails,
            closeAdviceTechnicalDetails,
            scheduledCount,
            dismissedAdvices,
            setDismissedAdvices,
            hiddenUntilTomorrow,
            setHiddenUntilTomorrow,
            adviceSwipeState,
            setAdviceSwipeState,
            expandedAdviceId,
            setExpandedAdviceId,
            dismissAllAnimation,
            setDismissAllAnimation,
            lastDismissedAdvice,
            setLastDismissedAdvice,
            undoFading,
            setUndoFading,
            adviceCardRefs,
            dismissToastRef,
            registerAdviceCardRef,
            handleAdviceListTouchStart,
            handleAdviceListTouchMove,
            handleAdviceListTouchEnd,
            getSortedGroupedAdvices,
            handleAdviceSwipeStart,
            handleAdviceSwipeMove,
            handleAdviceSwipeEnd,
            handleAdviceLongPressStart,
            handleAdviceLongPressEnd,
            handleAdviceToggleExpand,
            handleDismissAll,
            toggleToastsEnabled,
            toastsEnabled,
            toggleAdviceSoundEnabled,
            adviceSoundEnabled,
            undoLastDismiss,
            clearLastDismissed,
            totalAdviceCount,
            dismissToast,
            ADVICE_CATEGORY_NAMES,
        };
    };

    HEYS.dayAdviceState = dayAdviceState;
})(window);
// ===== End day/_advice.js =====

// ===== Begin heys_day_meals_bundle_v1.js =====
;// heys_day_meals_bundle_v1.js — bundled day meals modules (meal quality, add product, optimizer, meals UI, diary, orphan alert)
// ⚠️ Auto-generated by scripts/bundle-meals.cjs. Do not edit manually.

// ===== Begin day/_meal_quality.js =====
;// day/_meal_quality.js — consolidated meal scoring + quality popup

; (function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const ReactDOM = global.ReactDOM;
    const M = HEYS.models || {};
    const U = HEYS.dayUtils || {};

    // Import utility functions from dayUtils
    const getProductFromItem = U.getProductFromItem || (() => null);
    const parseTime = U.parseTime || ((t) => { if (!t || typeof t !== 'string' || !t.includes(':')) return null; const [hh, mm] = t.split(':').map((x) => parseInt(x, 10)); if (isNaN(hh) || isNaN(mm)) return null; return { hh: Math.max(0, Math.min(23, hh)), mm: Math.max(0, Math.min(59, mm)) }; });

    const MEAL_KCAL_LIMITS = {
        light: { max: 200 },
        normal: { max: 600 },
        heavy: { max: 800 },
        excess: { max: 1000 },
    };

    const IDEAL_MACROS_UNIFIED = {
        protPct: 0.25,
        carbPct: 0.45,
        fatPct: 0.30,
        minProtLight: 10,
        minProtNormal: 15,
    };

    const CIRCADIAN_MEAL_BONUS = {
        morning: { from: 6, to: 10, bonus: 3, desc: '🌅 Утро — лучшее время' },
        midday: { from: 10, to: 14, bonus: 2, desc: '🌞 Обеденное время' },
        afternoon: { from: 14, to: 18, bonus: 0, desc: 'Дневное время' },
        evening: { from: 18, to: 21, bonus: 0, desc: 'Вечер' },
        lateEvening: { from: 21, to: 23, bonus: -1, desc: '⏰ Поздний вечер' },
        night: { from: 23, to: 6, bonus: -3, desc: '🌙 Ночь' },
    };

    const LIQUID_FOOD_PATTERNS = [
        /сок\b/i, /\bсока\b/i, /\bсоки\b/i,
        /смузи/i, /коктейль/i, /shake/i,
        /йогурт.*питьевой/i, /питьевой.*йогурт/i,
        /бульон/i, /суп.*пюре/i, /крем.*суп/i,
        /кола/i, /пепси/i, /фанта/i, /спрайт/i, /лимонад/i, /газировка/i,
        /энергетик/i, /energy/i,
        /протеин.*коктейль/i, /protein.*shake/i,
    ];

    const HEALTHY_LIQUID_PATTERNS = [
        /кефир/i, /ряженка/i, /айран/i, /тан\b/i,
        /молоко/i, /простокваша/i, /варенец/i,
        /протеин/i, /protein/i,
    ];

    const LIQUID_FOOD_PENALTY = 5;

    const GL_QUALITY_THRESHOLDS = {
        veryLow: { max: 5, bonus: 3, desc: 'Минимальный инсулиновый ответ' },
        low: { max: 10, bonus: 2, desc: 'Низкий инсулиновый ответ' },
        medium: { max: 20, bonus: 0, desc: 'Умеренный ответ' },
        high: { max: 30, bonus: -2, desc: 'Высокий ответ' },
        veryHigh: { max: Infinity, bonus: -4, desc: 'Очень высокий ответ' },
    };

    function isLiquidFood(productName, category) {
        if (!productName) return false;
        const name = String(productName);
        const cat = String(category || '');

        for (const pattern of HEALTHY_LIQUID_PATTERNS) {
            if (pattern.test(name)) return false;
        }

        if (['Напитки', 'Соки', 'Молочные напитки'].includes(cat)) {
            if (cat === 'Молочные напитки') {
                for (const pattern of HEALTHY_LIQUID_PATTERNS) {
                    if (pattern.test(name)) return false;
                }
            }
            return true;
        }

        for (const pattern of LIQUID_FOOD_PATTERNS) {
            if (pattern.test(name)) return true;
        }

        return false;
    }

    function calculateMealGL(avgGI, totalCarbs) {
        if (!avgGI || !totalCarbs) return 0;
        return (avgGI * totalCarbs) / 100;
    }

    function getCircadianBonus(hour) {
        for (const [period, config] of Object.entries(CIRCADIAN_MEAL_BONUS)) {
            if (config.from <= config.to) {
                if (hour >= config.from && hour < config.to) {
                    return { bonus: config.bonus, period, desc: config.desc };
                }
            } else {
                if (hour >= config.from || hour < config.to) {
                    return { bonus: config.bonus, period, desc: config.desc };
                }
            }
        }
        return { bonus: 0, period: 'afternoon', desc: 'Дневное время' };
    }

    function getGLQualityBonus(gl) {
        for (const [level, config] of Object.entries(GL_QUALITY_THRESHOLDS)) {
            if (gl <= config.max) {
                return { bonus: config.bonus, level, desc: config.desc };
            }
        }
        return { bonus: -4, level: 'veryHigh', desc: 'Очень высокий ответ' };
    }

    const MEAL_KCAL_DISTRIBUTION = {
        breakfast: { minPct: 0.15, maxPct: 0.35 },
        snack1: { minPct: 0.05, maxPct: 0.25 },
        lunch: { minPct: 0.25, maxPct: 0.40 },
        snack2: { minPct: 0.05, maxPct: 0.25 },
        dinner: { minPct: 0.15, maxPct: 0.35 },
        snack3: { minPct: 0.02, maxPct: 0.15 },
        night: { minPct: 0.00, maxPct: 0.15 },
    };
    const MEAL_KCAL_ABSOLUTE = MEAL_KCAL_LIMITS;
    const IDEAL_MACROS = {
        breakfast: IDEAL_MACROS_UNIFIED,
        lunch: IDEAL_MACROS_UNIFIED,
        dinner: IDEAL_MACROS_UNIFIED,
        snack: IDEAL_MACROS_UNIFIED,
        night: IDEAL_MACROS_UNIFIED,
    };

    const safeRatio = (num, denom, fallback = 0.5) => {
        const n = +num || 0;
        const d = +denom || 0;
        if (d <= 0) return fallback;
        return n / d;
    };

    const NUTRIENT_COLORS = {
        good: '#16a34a',
        medium: '#ca8a04',
        bad: '#dc2626',
    };

    function getNutrientColor(nutrient, value, totals = {}) {
        const v = +value || 0;
        const { kcal = 0, carbs = 0, simple = 0, complex = 0, prot = 0, fat = 0, bad = 0, good = 0, trans = 0, fiber = 0 } = totals;

        switch (nutrient) {
            case 'kcal':
                if (v <= 0) return null;
                if (v <= 150) return NUTRIENT_COLORS.good;
                if (v <= 500) return null;
                if (v <= 700) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'carbs':
                if (v <= 0) return null;
                if (v <= 60) return NUTRIENT_COLORS.good;
                if (v <= 100) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'simple':
                if (v <= 0) return NUTRIENT_COLORS.good;
                if (v <= 10) return NUTRIENT_COLORS.good;
                if (v <= 25) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'complex':
                if (v <= 0) return null;
                if (v >= 30 && carbs > 0 && v / carbs >= 0.7) return NUTRIENT_COLORS.good;
                return null;
            case 'simple_complex_ratio': {
                if (carbs <= 5) return null;
                const simpleRatio = simple / carbs;
                if (simpleRatio <= 0.3) return NUTRIENT_COLORS.good;
                if (simpleRatio <= 0.5) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            }
            case 'prot':
                if (v <= 0) return null;
                if (v >= 20 && v <= 40) return NUTRIENT_COLORS.good;
                if (v >= 10 && v <= 50) return null;
                if (v < 10 && kcal > 200) return NUTRIENT_COLORS.medium;
                if (v > 50) return NUTRIENT_COLORS.medium;
                return null;
            case 'fat':
                if (v <= 0) return null;
                if (v <= 20) return NUTRIENT_COLORS.good;
                if (v <= 35) return null;
                if (v <= 50) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'bad':
                if (v <= 0) return NUTRIENT_COLORS.good;
                if (v <= 5) return null;
                if (v <= 10) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'good':
                if (fat <= 0) return null;
                if (v >= fat * 0.6) return NUTRIENT_COLORS.good;
                if (v >= fat * 0.4) return null;
                return NUTRIENT_COLORS.medium;
            case 'trans':
                if (v <= 0) return NUTRIENT_COLORS.good;
                if (v <= 0.5) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'fat_ratio': {
                if (fat <= 3) return null;
                const goodRatio = good / fat;
                const badRatio = bad / fat;
                if (goodRatio >= 0.6 && trans <= 0) return NUTRIENT_COLORS.good;
                if (badRatio > 0.5 || trans > 0.5) return NUTRIENT_COLORS.bad;
                return NUTRIENT_COLORS.medium;
            }
            case 'fiber':
                if (v <= 0) return null;
                if (v >= 8) return NUTRIENT_COLORS.good;
                if (v >= 4) return null;
                if (kcal > 300 && v < 2) return NUTRIENT_COLORS.medium;
                return null;
            case 'gi':
                if (v <= 0 || carbs <= 5) return null;
                if (v <= 40) return NUTRIENT_COLORS.good;
                if (v <= 55) return NUTRIENT_COLORS.good;
                if (v <= 70) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'harm':
                if (v <= 0) return NUTRIENT_COLORS.good;
                if (v <= 2) return NUTRIENT_COLORS.good;
                if (v <= 4) return null;
                if (v <= 6) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            default:
                return null;
        }
    }

    function getNutrientTooltip(nutrient, value, totals = {}) {
        const v = +value || 0;
        const { kcal = 0, carbs = 0, simple = 0, fat = 0, bad = 0, good = 0, trans = 0 } = totals;

        switch (nutrient) {
            case 'kcal':
                if (v <= 0) return 'Нет калорий';
                if (v <= 150) return '✅ Лёгкий приём (≤150 ккал)';
                if (v <= 500) return 'Нормальный приём';
                if (v <= 700) return '⚠️ Много для одного приёма (500-700 ккал)';
                return '❌ Переедание (>700 ккал за раз)';
            case 'carbs':
                if (v <= 0) return 'Без углеводов';
                if (v <= 60) return '✅ Умеренно углеводов (≤60г)';
                if (v <= 100) return '⚠️ Много углеводов (60-100г)';
                return '❌ Очень много углеводов (>100г)';
            case 'simple':
                if (v <= 0) return '✅ Без простых углеводов — идеально!';
                if (v <= 10) return '✅ Минимум простых (≤10г)';
                if (v <= 25) return '⚠️ Терпимо простых (10-25г)';
                return '❌ Много сахара (>25г) — инсулиновый скачок';
            case 'complex':
                if (v <= 0) return 'Без сложных углеводов';
                if (carbs > 0 && v / carbs >= 0.7) return '✅ Отлично! Сложных ≥70%';
                return 'Сложные углеводы';
            case 'prot':
                if (v <= 0) return 'Без белка';
                if (v >= 20 && v <= 40) return '✅ Оптимум белка (20-40г)';
                if (v < 10 && kcal > 200) return '⚠️ Мало белка для сытного приёма';
                if (v > 50) return '⚠️ Много белка (>50г) — избыток не усвоится';
                return 'Белок в норме';
            case 'fat':
                if (v <= 0) return 'Без жиров';
                if (v <= 20) return '✅ Умеренно жиров (≤20г)';
                if (v <= 35) return 'Жиры в норме';
                if (v <= 50) return '⚠️ Много жиров (35-50г)';
                return '❌ Очень много жиров (>50г)';
            case 'bad':
                if (v <= 0) return '✅ Без вредных жиров — отлично!';
                if (v <= 5) return 'Минимум вредных жиров';
                if (v <= 10) return '⚠️ Терпимо вредных жиров (5-10г)';
                return '❌ Много вредных жиров (>10г)';
            case 'good':
                if (fat <= 0) return 'Нет жиров';
                if (v >= fat * 0.6) return '✅ Полезных жиров ≥60%';
                if (v >= fat * 0.4) return 'Полезные жиры в норме';
                return '⚠️ Мало полезных жиров (<40%)';
            case 'trans':
                if (v <= 0) return '✅ Без транс-жиров — идеально!';
                if (v <= 0.5) return '⚠️ Есть транс-жиры (≤0.5г)';
                return '❌ Транс-жиры опасны (>0.5г)';
            case 'fiber':
                if (v <= 0) return 'Без клетчатки';
                if (v >= 8) return '✅ Отлично! Много клетчатки (≥8г)';
                if (v >= 4) return 'Клетчатка в норме';
                if (kcal > 300 && v < 2) return '⚠️ Мало клетчатки для сытного приёма';
                return 'Клетчатка';
            case 'gi':
                if (carbs <= 5) return 'Мало углеводов — ГИ неважен';
                if (v <= 40) return '✅ Низкий ГИ (≤40) — медленные углеводы';
                if (v <= 55) return '✅ Умеренный ГИ (40-55)';
                if (v <= 70) return '⚠️ Средний ГИ (55-70) — инсулин повышен';
                return '❌ Высокий ГИ (>70) — быстрый сахар в крови';
            case 'harm':
                if (v <= 0) return '✅ Полезная еда';
                if (v <= 2) return '✅ Минимальный вред';
                if (v <= 4) return 'Умеренный вред';
                if (v <= 6) return '⚠️ Заметный вред (4-6)';
                return '❌ Вредная еда (>6)';
            default:
                return null;
        }
    }

    function getDailyNutrientColor(nutrient, fact, norm) {
        if (!norm || norm <= 0) return null;
        const pct = fact / norm;

        switch (nutrient) {
            case 'kcal':
                if (pct >= 0.90 && pct <= 1.10) return NUTRIENT_COLORS.good;
                if (pct >= 0.75 && pct <= 1.20) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'prot':
                if (pct >= 0.90 && pct <= 1.30) return NUTRIENT_COLORS.good;
                if (pct >= 0.70) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'carbs':
                if (pct >= 0.85 && pct <= 1.15) return NUTRIENT_COLORS.good;
                if (pct >= 0.60 && pct <= 1.30) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'simple':
                if (pct <= 0.80) return NUTRIENT_COLORS.good;
                if (pct <= 1.10) return null;
                if (pct <= 1.30) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'complex':
                if (pct >= 1.00) return NUTRIENT_COLORS.good;
                if (pct >= 0.70) return null;
                return NUTRIENT_COLORS.medium;
            case 'fat':
                if (pct >= 0.85 && pct <= 1.15) return NUTRIENT_COLORS.good;
                if (pct >= 0.60 && pct <= 1.30) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'bad':
                if (pct <= 0.70) return NUTRIENT_COLORS.good;
                if (pct <= 1.00) return null;
                if (pct <= 1.30) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'good':
                if (pct >= 1.00) return NUTRIENT_COLORS.good;
                if (pct >= 0.70) return null;
                return NUTRIENT_COLORS.medium;
            case 'trans':
                if (pct <= 0.50) return NUTRIENT_COLORS.good;
                if (pct <= 1.00) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'fiber':
                if (pct >= 1.00) return NUTRIENT_COLORS.good;
                if (pct >= 0.70) return null;
                if (pct >= 0.40) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'gi':
                if (pct <= 0.80) return NUTRIENT_COLORS.good;
                if (pct <= 1.10) return null;
                if (pct <= 1.30) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'harm':
                if (pct <= 0.50) return NUTRIENT_COLORS.good;
                if (pct <= 1.00) return null;
                if (pct <= 1.50) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            default:
                return null;
        }
    }

    function getDailyNutrientTooltip(nutrient, fact, norm) {
        if (!norm || norm <= 0) return 'Норма не задана';
        const pct = Math.round((fact / norm) * 100);
        const diff = fact - norm;
        const diffStr = diff >= 0 ? '+' + Math.round(diff) : Math.round(diff);

        const baseInfo = `${Math.round(fact)} из ${Math.round(norm)} (${pct}%)`;

        switch (nutrient) {
            case 'kcal':
                if (pct >= 90 && pct <= 110) return `✅ Калории в норме: ${baseInfo}`;
                if (pct < 90) return `⚠️ Недобор калорий: ${baseInfo}`;
                return `❌ Перебор калорий: ${baseInfo}`;
            case 'prot':
                if (pct >= 90) return `✅ Белок в норме: ${baseInfo}`;
                if (pct >= 70) return `⚠️ Маловато белка: ${baseInfo}`;
                return `❌ Мало белка: ${baseInfo}`;
            case 'carbs':
                if (pct >= 85 && pct <= 115) return `✅ Углеводы в норме: ${baseInfo}`;
                if (pct < 85) return `⚠️ Мало углеводов: ${baseInfo}`;
                return `⚠️ Много углеводов: ${baseInfo}`;
            case 'simple':
                if (pct <= 80) return `✅ Мало простых — отлично: ${baseInfo}`;
                if (pct <= 110) return `Простые углеводы: ${baseInfo}`;
                return `❌ Много простых углеводов: ${baseInfo}`;
            case 'complex':
                if (pct >= 100) return `✅ Достаточно сложных: ${baseInfo}`;
                return `Сложные углеводы: ${baseInfo}`;
            case 'fat':
                if (pct >= 85 && pct <= 115) return `✅ Жиры в норме: ${baseInfo}`;
                return `Жиры: ${baseInfo}`;
            case 'bad':
                if (pct <= 70) return `✅ Мало вредных жиров: ${baseInfo}`;
                if (pct <= 100) return `Вредные жиры: ${baseInfo}`;
                return `❌ Много вредных жиров: ${baseInfo}`;
            case 'good':
                if (pct >= 100) return `✅ Достаточно полезных жиров: ${baseInfo}`;
                return `Полезные жиры: ${baseInfo}`;
            case 'trans':
                if (pct <= 50) return `✅ Минимум транс-жиров: ${baseInfo}`;
                return `❌ Транс-жиры: ${baseInfo}`;
            case 'fiber':
                if (pct >= 100) return `✅ Достаточно клетчатки: ${baseInfo}`;
                if (pct >= 70) return `Клетчатка: ${baseInfo}`;
                return `⚠️ Мало клетчатки: ${baseInfo}`;
            case 'gi':
                if (pct <= 80) return `✅ Низкий средний ГИ: ${baseInfo}`;
                if (pct <= 110) return `Средний ГИ: ${baseInfo}`;
                return `⚠️ Высокий средний ГИ: ${baseInfo}`;
            case 'harm':
                if (pct <= 50) return `✅ Минимальный вред: ${baseInfo}`;
                if (pct <= 100) return `Вредность: ${baseInfo}`;
                return `❌ Высокая вредность: ${baseInfo}`;
            default:
                return baseInfo;
        }
    }

    function calcKcalScore(kcal, mealType, optimum, timeStr, activityContext = null) {
        let points = 30;
        let ok = true;
        const issues = [];

        const hasTrainingContext = activityContext &&
            (activityContext.type === 'peri' || activityContext.type === 'post' || activityContext.type === 'pre');

        const kcalBoost = hasTrainingContext
            ? (activityContext.type === 'peri' ? 1.6 :
                activityContext.type === 'post' ? 1.4 : 1.2)
            : 1.0;

        const adjustedLimit = 800 * kcalBoost;
        const adjustedOvereatLimit = 1000 * kcalBoost;

        if (kcal > adjustedLimit) {
            const excess = (kcal - adjustedLimit) / 200;
            const penalty = Math.min(15, Math.round(excess * 5));
            points -= penalty;
            ok = false;
            issues.push(hasTrainingContext ? 'много для восстановления' : 'много ккал');
        }

        if (kcal > adjustedOvereatLimit) {
            points -= 10;
            issues.push('переедание');
        }

        const nightPenaltyOverride = activityContext?.nightPenaltyOverride === true;

        const parsed = parseTime(timeStr || '');
        if (parsed && !nightPenaltyOverride) {
            const hour = parsed.hh;

            if (hour >= 23 || hour < 5) {
                if (kcal > 300) {
                    const nightPenalty = Math.min(10, Math.round((kcal - 300) / 100));
                    points -= nightPenalty;
                    ok = false;
                    issues.push('ночь');
                }
                if (kcal > 700) {
                    points -= 5;
                    issues.push('тяжёлая еда ночью');
                }
            } else if (hour >= 21 && kcal > 500) {
                const latePenalty = Math.min(5, Math.round((kcal - 500) / 150));
                points -= latePenalty;
                issues.push('поздно');
            }
        }

        if (hasTrainingContext && kcal >= 300 && kcal <= adjustedLimit) {
            points += 2;
        }

        return {
            points: Math.max(0, Math.min(32, points)),
            ok,
            issues,
            trainingContextApplied: hasTrainingContext,
        };
    }

    function calcMacroScore(prot, carbs, fat, kcal, mealType, timeStr, activityContext = null) {
        const ideal = IDEAL_MACROS_UNIFIED;
        let points = 20;
        let proteinOk = true;
        const issues = [];

        const hasTrainingContext = activityContext &&
            (activityContext.type === 'peri' || activityContext.type === 'post' || activityContext.type === 'pre');

        const trainingMinProt = (activityContext?.type === 'post' || activityContext?.type === 'peri')
            ? 25 : ideal.minProtNormal;

        const minProt = kcal > 200
            ? (hasTrainingContext ? trainingMinProt : ideal.minProtNormal)
            : ideal.minProtLight;

        if (prot >= minProt) {
            points += 5;
            if (hasTrainingContext && prot >= 25) {
                points += 2;
            }
        } else if (kcal > 150) {
            const proteinPenalty = hasTrainingContext ? 7 : 5;
            points -= proteinPenalty;
            proteinOk = false;
            issues.push(hasTrainingContext ? 'мало белка для восстановления' : 'мало белка');
        }

        const maxProtThreshold = hasTrainingContext ? 80 : 60;
        if (prot > maxProtThreshold) {
            points -= 2;
            issues.push('много белка');
        }

        if (kcal > 0) {
            const protPct = (prot * 3) / kcal;
            const carbPct = (carbs * 4) / kcal;
            const fatPct = (fat * 9) / kcal;
            const deviation = Math.abs(protPct - ideal.protPct) + Math.abs(carbPct - ideal.carbPct) + Math.abs(fatPct - ideal.fatPct);
            points -= Math.min(10, Math.round(deviation * 15));

            const nightCarbsAllowed = activityContext?.type === 'post' && activityContext?.trainingRef?.intensity === 'high';
            const parsed = parseTime(timeStr || '');
            if (parsed && parsed.hh >= 20 && carbPct > 0.50 && !nightCarbsAllowed) {
                points -= 5;
                issues.push('углеводы вечером');
            }
        }

        return {
            points: Math.max(0, Math.min(27, points)),
            proteinOk,
            issues,
            trainingContextApplied: hasTrainingContext,
        };
    }

    function calcCarbQuality(simple, complex, context = {}) {
        const total = simple + complex;
        const simpleRatio = safeRatio(simple, total, 0.5);

        const {
            avgGI = 50,
            mealGL = 10,
            protein = 0,
            fat = 0,
            fiber = 0,
            hasDairy = false,
        } = context;

        let points = 15;
        let ok = true;
        const adjustments = [];

        let basePoints = 15;
        if (simpleRatio <= 0.30) {
            basePoints = 15;
        } else if (simpleRatio <= 0.50) {
            basePoints = 10;
        } else if (simpleRatio <= 0.70) {
            basePoints = 5;
        } else {
            basePoints = 0;
        }

        points = basePoints;

        if (total < 10) {
            const boost = Math.round((15 - basePoints) * 0.9);
            if (boost > 0) {
                points += boost;
                adjustments.push({ factor: 'lowCarbs', boost, reason: `Углеводов мало (${total.toFixed(0)}г)` });
            }
        } else if (total < 20) {
            const boost = Math.round((15 - basePoints) * 0.6);
            if (boost > 0) {
                points += boost;
                adjustments.push({ factor: 'moderateLowCarbs', boost, reason: `Углеводов немного (${total.toFixed(0)}г)` });
            }
        } else if (total < 30) {
            const boost = Math.round((15 - basePoints) * 0.3);
            if (boost > 0) {
                points += boost;
                adjustments.push({ factor: 'mediumCarbs', boost, reason: `Углеводов умеренно (${total.toFixed(0)}г)` });
            }
        }

        if (avgGI < 55 && simpleRatio > 0.30) {
            const giCompensation = avgGI < 40 ? 0.5 : avgGI < 50 ? 0.35 : 0.2;
            const lostPoints = 15 - basePoints;
            const boost = Math.round(lostPoints * giCompensation);
            if (boost > 0) {
                points += boost;
                adjustments.push({ factor: 'lowGI', boost, reason: `Низкий ГИ (${avgGI.toFixed(0)}) компенсирует` });
            }
        }

        if (mealGL < 10 && simpleRatio > 0.30) {
            const boost = Math.round((15 - basePoints) * 0.4);
            if (boost > 0 && !adjustments.find((a) => a.factor === 'lowGI')) {
                points += boost;
                adjustments.push({ factor: 'lowGL', boost, reason: `Низкая GL (${mealGL.toFixed(1)})` });
            }
        }

        if (hasDairy && simpleRatio > 0.50) {
            const boost = 3;
            points += boost;
            adjustments.push({ factor: 'dairy', boost, reason: 'Молочные углеводы (лактоза)' });
        }

        if (protein >= 25 && simpleRatio > 0.30) {
            const boost = 2;
            points += boost;
            adjustments.push({ factor: 'highProtein', boost, reason: `Высокий белок (${protein.toFixed(0)}г) замедляет усвоение` });
        } else if (protein >= 15 && simpleRatio > 0.50) {
            const boost = 1;
            points += boost;
            adjustments.push({ factor: 'moderateProtein', boost, reason: `Белок (${protein.toFixed(0)}г) смягчает эффект` });
        }

        if (fiber >= 5 && simpleRatio > 0.30) {
            const boost = 2;
            points += boost;
            adjustments.push({ factor: 'highFiber', boost, reason: `Клетчатка (${fiber.toFixed(0)}г) замедляет усвоение` });
        } else if (fiber >= 2 && simpleRatio > 0.50) {
            const boost = 1;
            points += boost;
            adjustments.push({ factor: 'moderateFiber', boost, reason: 'Клетчатка смягчает эффект' });
        }

        if (fat >= 10 && simpleRatio > 0.40 && avgGI < 60) {
            const boost = 1;
            points += boost;
            adjustments.push({ factor: 'fatSlowdown', boost, reason: 'Жиры замедляют усвоение углеводов' });
        }

        points = Math.max(0, Math.min(15, points));
        ok = simpleRatio <= 0.35 || points >= 10;

        return {
            points,
            simpleRatio,
            ok,
            basePoints,
            adjustments,
            contextUsed: Object.keys(context).length > 0,
        };
    }

    function calcFatQuality(bad, good, trans) {
        const total = bad + good + trans;
        const goodRatio = safeRatio(good, total, 0.5);
        const badRatio = safeRatio(bad, total, 0.5);

        let points = 15;
        let ok = true;

        const isLowFat = total < 5;

        if (goodRatio >= 0.60) {
            points = 15;
        } else if (goodRatio >= 0.40) {
            points = 10;
        } else {
            points = isLowFat ? 10 : 5;
            ok = isLowFat ? true : false;
        }

        if (badRatio > 0.50 && !isLowFat) {
            points -= 5;
            ok = false;
        }

        const transRatio = total > 0 ? trans / total : 0;
        if (trans > 1 || (transRatio > 0.02 && trans > 0.3)) {
            points -= 5;
            ok = false;
        }

        return { points: Math.max(0, points), goodRatio, badRatio, ok };
    }

    function calcGiHarmScore(avgGI, avgHarm) {
        let points = 15;
        let ok = true;
        let harmPenalty = 0;

        if (avgGI <= 55) {
            points = 15;
        } else if (avgGI <= 70) {
            points = 10;
        } else {
            points = 5;
            ok = false;
        }

        if (avgHarm > 5) {
            if (avgHarm <= 10) {
                harmPenalty = Math.round((avgHarm - 5) / 2.5);
            } else if (avgHarm <= 20) {
                harmPenalty = 2 + Math.round((avgHarm - 10) / 3.3);
            } else if (avgHarm <= 40) {
                harmPenalty = 5 + Math.round((avgHarm - 20) / 4);
            } else {
                harmPenalty = 10 + Math.min(5, Math.round((avgHarm - 40) / 10));
            }

            points -= Math.min(15, harmPenalty);
            ok = avgHarm <= 15;
        }

        return { points: Math.max(0, points), ok, harmPenalty };
    }

    function getMealQualityScore(meal, mealType, optimum, pIndex, activityContext) {
        if (!meal?.items || meal.items.length === 0) return null;

        const opt = optimum > 0 ? optimum : 2000;
        const totals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };

        const harmMultiplier = activityContext?.harmMultiplier ?? 1;

        let gramSum = 0; let carbSum = 0; let giSum = 0; let harmSum = 0;
        let hasDairy = false;

        (meal.items || []).forEach((it) => {
            const p = getProductFromItem(it, pIndex) || {};
            const g = +it.grams || 0;
            if (!g) return;

            const name = (p.name || '').toLowerCase();
            const category = (p.category || '').toLowerCase();
            if (
                category.includes('молоч') || category.includes('dairy') ||
                name.includes('молок') || name.includes('творог') || name.includes('кефир') ||
                name.includes('йогурт') || name.includes('сметан') || name.includes('сливк') ||
                name.includes('сыр') || name.includes('ряженк') || name.includes('простокваш') ||
                name.includes('milk') || name.includes('cheese') || name.includes('yogurt')
            ) {
                hasDairy = true;
            }

            const simple100 = +p.simple100 || 0;
            const complex100 = +p.complex100 || 0;
            const itemCarbs = (simple100 + complex100) * g / 100;

            const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? 50;
            const harm = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct ?? 0;

            gramSum += g;
            carbSum += itemCarbs;
            giSum += gi * itemCarbs;
            harmSum += harm * g;
        });
        const avgGI = carbSum > 0 ? giSum / carbSum : 50;
        const rawAvgHarm = gramSum > 0 ? harmSum / gramSum : 0;

        const avgHarm = rawAvgHarm * harmMultiplier;
        const harmReduction = harmMultiplier < 1 ? Math.round((1 - harmMultiplier) * 100) : 0;

        const { kcal, prot, carbs, simple, complex, fat, bad, good, trans } = totals;
        let score = 0;
        const badges = [];

        const kcalScore = calcKcalScore(kcal, mealType, opt, meal.time, activityContext);
        score += kcalScore.points;
        if (!kcalScore.ok) badges.push({ type: 'К', ok: false });
        if (kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('тяжёлая еда ночью')) {
            badges.push({ type: '🌙', ok: false, label: 'Поздно' });
        } else if (kcalScore.issues?.includes('поздно')) {
            badges.push({ type: '⏰', ok: false, label: 'Вечер' });
        }

        const macroScore = calcMacroScore(prot, carbs, fat, kcal, mealType, meal.time, activityContext);
        score += macroScore.points;
        if (!macroScore.proteinOk) badges.push({ type: 'Б', ok: false });
        if (macroScore.issues?.includes('углеводы вечером')) badges.push({ type: 'У⬇', ok: false, label: 'Угл вечером' });

        const mealGL = calculateMealGL(avgGI, totals.carbs || 0);

        const carbScore = calcCarbQuality(simple, complex, {
            avgGI,
            mealGL,
            protein: prot,
            fat,
            fiber: totals.fiber || 0,
            hasDairy,
        });
        score += carbScore.points;

        if (window.HEYS_DEBUG_CARB_SCORE) {
            // console.log('🔬 calcCarbQuality DEBUG:', {
            //   mealName: meal.name || 'Приём',
            //   simple, complex, total: simple + complex,
            //   simpleRatio: (simple / (simple + complex) * 100).toFixed(0) + '%',
            //   context: { avgGI: avgGI.toFixed(0), mealGL: mealGL.toFixed(1), protein: prot.toFixed(0), fat: fat.toFixed(0), fiber: (totals.fiber || 0).toFixed(0), hasDairy },
            //   result: carbScore
            // });
        }

        const fatScore = calcFatQuality(bad, good, trans);
        score += fatScore.points;
        if (trans > 0.5) badges.push({ type: 'ТЖ', ok: false });

        const giHarmScore = calcGiHarmScore(avgGI, avgHarm);
        score += giHarmScore.points;
        if (avgGI > 70) badges.push({ type: 'ГИ', ok: false });
        if (avgHarm > 10) badges.push({ type: 'Вр', ok: false });

        let bonusPoints = 0;
        const positiveBadges = [];

        const timeParsed = parseTime(meal.time || '');
        const hour = timeParsed?.hh || 12;

        const glBonus = getGLQualityBonus(mealGL);
        if (glBonus.bonus !== 0) {
            bonusPoints += glBonus.bonus;
            if (glBonus.bonus > 0) {
                positiveBadges.push({ type: '📉', ok: true, label: 'Низкая GL' });
            }
        }

        const circadian = getCircadianBonus(hour);
        if (circadian.bonus > 0 && kcal >= 200) {
            bonusPoints += circadian.bonus;
            if (circadian.period === 'morning') {
                positiveBadges.push({ type: '🌅', ok: true, label: 'Утренний приём' });
            } else if (circadian.period === 'midday') {
                positiveBadges.push({ type: '🌞', ok: true, label: 'Обеденное время' });
            }
        }

        let liquidKcal = 0;
        (meal.items || []).forEach((it) => {
            const p = getProductFromItem(it, pIndex) || {};
            const g = +it.grams || 0;
            if (!g) return;

            if (isLiquidFood(p.name, p.category)) {
                const itemKcal = (p.kcal100 || 0) * g / 100;
                liquidKcal += itemKcal;
            }
        });
        const liquidRatio = kcal > 0 ? liquidKcal / kcal : 0;
        if (liquidRatio > 0.5 && kcal >= 100) {
            bonusPoints -= LIQUID_FOOD_PENALTY;
            badges.push({ type: '🥤', ok: false, label: 'Жидкие калории' });
        }

        if (hour >= 18 && hour < 20 && kcal >= 200) {
            bonusPoints += 2;
            positiveBadges.push({ type: '🌇', ok: true, label: 'Ранний вечер' });
        }

        if (prot >= 20) {
            bonusPoints += 3;
            positiveBadges.push({ type: '🥛', ok: true, label: 'Белковый' });
        } else if (prot >= 15 && kcal <= 400) {
            bonusPoints += 2;
        }

        const fiber = totals.fiber || 0;
        if (fiber >= 5) {
            bonusPoints += 3;
            positiveBadges.push({ type: '🥗', ok: true, label: 'Клетчатка' });
        } else if (fiber >= 2) {
            bonusPoints += 1;
        }

        const itemCount = (meal.items || []).length;
        if (itemCount >= 4) {
            bonusPoints += 2;
            positiveBadges.push({ type: '🌈', ok: true, label: 'Разнообразие' });
        }

        const protCalRatio = kcal > 0 ? (prot * 3) / kcal : 0;
        if (protCalRatio >= 0.20 && protCalRatio <= 0.40 && prot >= 10) {
            bonusPoints += 2;
            positiveBadges.push({ type: '💪', ok: true, label: 'Белок' });
        }

        if (avgGI <= 50 && carbSum > 5) {
            bonusPoints += 2;
            positiveBadges.push({ type: '🎯', ok: true, label: 'Низкий ГИ' });
        }

        if (harmReduction > 0 && rawAvgHarm > 5) {
            const activityBonusPoints = Math.min(5, Math.round(harmReduction / 10));
            if (activityBonusPoints > 0) {
                bonusPoints += activityBonusPoints;
                positiveBadges.push({ type: activityContext?.badge || '🏋️', ok: true, label: `−${harmReduction}% вред` });
            }
        }

        if (activityContext && ['peri', 'post', 'pre'].includes(activityContext.type)) {
            const timingBonus = activityContext.type === 'peri' ? 3 :
                activityContext.type === 'post' ? 2 :
                    1;
            if (harmReduction === 0 || rawAvgHarm <= 5) {
                bonusPoints += timingBonus;
                positiveBadges.push({
                    type: activityContext.type === 'peri' ? '🔥' :
                        activityContext.type === 'post' ? '💪' : '⚡',
                    ok: true,
                    label: activityContext.type === 'peri' ? 'Во время трени' :
                        activityContext.type === 'post' ? 'После трени' : 'Перед трени',
                });
            }
        }

        const hasNightIssue = kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('поздно');
        if (hasNightIssue) {
            if (prot >= 25) {
                bonusPoints += 4;
                positiveBadges.push({ type: '🌙💪', ok: true, label: 'Белок ночью' });
            }
            if (avgGI <= 40) {
                bonusPoints += 3;
                positiveBadges.push({ type: '🌙🎯', ok: true, label: 'Низкий ГИ' });
            }
            if (simple < 15) {
                bonusPoints += 2;
            }
        }

        if (kcalScore.ok && macroScore.proteinOk && carbScore.ok && fatScore.ok && giHarmScore.ok) {
            bonusPoints += 3;
            positiveBadges.push({ type: '⭐', ok: true, label: 'Баланс' });
        }

        score += Math.min(15, bonusPoints);

        const finalScore = Math.min(100, Math.round(score));

        const color = finalScore >= 80 ? '#22c55e' : finalScore >= 50 ? '#eab308' : '#ef4444';

        const timeIssue = kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('тяжёлая еда ночью');
        const lateIssue = kcalScore.issues?.includes('поздно');
        const timeOk = !timeIssue && !lateIssue;
        const timeValue = timeIssue ? '⚠️ ночь' : lateIssue ? 'поздно' : '✓';

        const details = [
            { label: 'Калории', value: Math.round(kcal) + ' ккал', ok: kcalScore.ok },
            { label: 'Время', value: timeValue, ok: timeOk },
            { label: 'Белок', value: Math.round(prot) + 'г', ok: macroScore.proteinOk },
            { label: 'Углеводы', value: carbScore.simpleRatio <= 0.3 ? 'сложные ✓' : Math.round(carbScore.simpleRatio * 100) + '% простых', ok: carbScore.ok },
            { label: 'Жиры', value: fatScore.goodRatio >= 0.6 ? 'полезные ✓' : Math.round(fatScore.goodRatio * 100) + '% полезных', ok: fatScore.ok },
            { label: 'ГИ', value: Math.round(avgGI), ok: avgGI <= 70 },
            { label: 'GL', value: Math.round(mealGL), ok: mealGL <= 20 },
            { label: 'Клетчатка', value: Math.round(fiber) + 'г', ok: fiber >= 2 },
            ...(harmReduction > 0 ? [{ label: 'Вред', value: `${Math.round(rawAvgHarm)} → ${Math.round(avgHarm)} (−${harmReduction}%)`, ok: avgHarm <= 10 }] : []),
        ];

        const allBadges = [...badges.slice(0, 2), ...positiveBadges.slice(0, 1)];

        return {
            score: finalScore,
            color,
            badges: allBadges.slice(0, 3),
            details,
            avgGI,
            avgHarm,
            rawAvgHarm: harmReduction > 0 ? rawAvgHarm : undefined,
            harmReduction: harmReduction > 0 ? harmReduction : undefined,
            fiber,
            bonusPoints,
            mealGL: Math.round(mealGL * 10) / 10,
            glLevel: glBonus.level,
            circadianPeriod: circadian.period,
            circadianBonus: circadian.bonus,
            liquidRatio: Math.round(liquidRatio * 100),
            activityContext: activityContext || undefined,
            carbScore,
        };
    }

    function renderMealQualityPopup(params) {
        if (!React || !ReactDOM) return null;

        const {
            mealQualityPopup,
            setMealQualityPopup,
            getSmartPopupPosition,
            createSwipeHandlers,
            pIndex,
            getMealType,
        } = params || {};

        if (!mealQualityPopup) return null;

        return ReactDOM.createPortal(
            (() => {
                const { meal, quality, mealTypeInfo, x, y } = mealQualityPopup;
                const popupW = 320;
                const popupH = 480;

                const pos = getSmartPopupPosition(x, y, popupW, popupH, { preferAbove: true, offset: 12, margin: 16 });
                const { left, top, arrowPos, showAbove } = pos;

                const getColor = (score) => {
                    if (score >= 80) return '#10b981';
                    if (score >= 60) return '#22c55e';
                    if (score >= 40) return '#eab308';
                    return '#ef4444';
                };
                const color = getColor(quality.score);

                const swipeHandlers = createSwipeHandlers(() => setMealQualityPopup(null));

                const getTotals = () => {
                    if (!meal?.items || meal.items.length === 0) return { kcal: 0, prot: 0, carbs: 0, simple: 0, complex: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };
                    const totals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };
                    return totals;
                };
                const totals = getTotals();

                const parseTimeH = (t) => {
                    if (!t) return 12;
                    const [h] = t.split(':').map(Number);
                    return h || 12;
                };
                const hour = parseTimeH(meal.time);

                const calcKcalDisplay = () => {
                    let points = 30;
                    const issues = [];
                    if (totals.kcal > 800) {
                        const penalty = Math.min(15, Math.round((totals.kcal - 800) / 200 * 5));
                        points -= penalty;
                        issues.push('>' + 800 + ' ккал: -' + penalty);
                    }
                    if (totals.kcal > 1000) {
                        points -= 10;
                        issues.push('переедание: -10');
                    }
                    if ((hour >= 23 || hour < 5) && totals.kcal > 300) {
                        const nightPenalty = Math.min(10, Math.round((totals.kcal - 300) / 100));
                        points -= nightPenalty;
                        issues.push('ночь: -' + nightPenalty);
                    } else if (hour >= 21 && totals.kcal > 500) {
                        const latePenalty = Math.min(5, Math.round((totals.kcal - 500) / 150));
                        points -= latePenalty;
                        issues.push('поздно: -' + latePenalty);
                    }
                    return { points: Math.max(0, points), max: 30, issues };
                };

                const calcMacroDisplay = () => {
                    let points = 20;
                    const issues = [];
                    const minProt = totals.kcal > 200 ? 15 : 10;
                    if (totals.prot >= minProt) {
                        points += 5;
                        issues.push('белок ≥' + minProt + 'г: +5');
                    } else if (totals.kcal > 300) {
                        points -= 5;
                        issues.push('белок <' + minProt + 'г: -5');
                    }
                    if (totals.prot > 50) {
                        points -= 3;
                        issues.push('белок >' + 50 + 'г: -3');
                    }
                    if (totals.kcal > 0) {
                        const protPct = (totals.prot * 3) / totals.kcal;
                        const carbPct = (totals.carbs * 4) / totals.kcal;
                        const fatPct = (totals.fat * 9) / totals.kcal;
                        const deviation = Math.abs(protPct - 0.25) + Math.abs(carbPct - 0.45) + Math.abs(fatPct - 0.30);
                        const devPenalty = Math.min(10, Math.round(deviation * 15));
                        if (devPenalty > 0) {
                            points -= devPenalty;
                            issues.push('отклонение БЖУ: -' + devPenalty);
                        }
                    }
                    return { points: Math.max(0, Math.min(25, points)), max: 25, issues };
                };

                const calcCarbDisplay = () => {
                    const total = totals.simple + totals.complex;
                    const simpleRatio = total > 0 ? totals.simple / total : 0.5;
                    const issues = [];

                    const carbScore = quality.carbScore;
                    let points = carbScore?.points ?? 0;

                    if (carbScore?.adjustments && carbScore.adjustments.length > 0) {
                        carbScore.adjustments.forEach((adj) => {
                            if (adj.points !== 0) {
                                issues.push(adj.reason + ': ' + (adj.points > 0 ? '+' : '') + adj.points);
                            }
                        });
                    } else {
                        if (simpleRatio <= 0.30) {
                            issues.push('простые ≤30%: ' + points);
                        } else if (points >= 12) {
                            issues.push('адаптивная оценка: ' + points + ' (молочка/низкий ГИ)');
                        } else if (points >= 8) {
                            issues.push('умеренный бонус: ' + points);
                        } else {
                            issues.push('базовый расчёт: ' + points);
                        }
                    }

                    return { points, max: 15, issues, simpleRatio: Math.round(simpleRatio * 100) };
                };

                const calcFatDisplay = () => {
                    const total = totals.bad + totals.good + totals.trans;
                    const goodRatio = total > 0 ? totals.good / total : 0.5;
                    let points = 15;
                    const issues = [];
                    if (goodRatio >= 0.60) {
                        points = 15;
                        issues.push('полезные ≥60%: 15');
                    } else if (goodRatio >= 0.40) {
                        points = 10;
                        issues.push('полезные 40-60%: 10');
                    } else {
                        points = 5;
                        issues.push('полезные <40%: 5');
                    }
                    if (totals.trans > 0.5) {
                        points -= 5;
                        issues.push('транс >' + 0.5 + 'г: -5');
                    }
                    return { points: Math.max(0, points), max: 15, issues, goodRatio: Math.round(goodRatio * 100) };
                };

                const calcGiDisplay = () => {
                    const avgGI = quality.avgGI || 50;
                    let points = 15;
                    const issues = [];
                    if (avgGI <= 55) {
                        points = 15;
                        issues.push('ГИ ≤55: 15');
                    } else if (avgGI <= 70) {
                        points = 10;
                        issues.push('ГИ 55-70: 10');
                    } else {
                        points = 5;
                        issues.push('ГИ >70: 5');
                    }
                    const avgHarm = quality.avgHarm || 0;
                    if (avgHarm > 5) {
                        const harmPenalty = Math.min(5, Math.round(avgHarm / 5));
                        points -= harmPenalty;
                        issues.push('вред: -' + harmPenalty);
                    }
                    return { points: Math.max(0, points), max: 15, issues };
                };

                const kcalCalc = calcKcalDisplay();
                const macroCalc = calcMacroDisplay();
                const carbCalc = calcCarbDisplay();
                const fatCalc = calcFatDisplay();
                const giCalc = calcGiDisplay();

                const baseScore = kcalCalc.points + macroCalc.points + carbCalc.points + fatCalc.points + giCalc.points;
                const bonusPoints = quality.bonusPoints || 0;

                const allCalcs = [
                    { id: 'kcal', ...kcalCalc, icon: '🔥', label: Math.round(totals.kcal) + ' ккал' },
                    { id: 'macro', ...macroCalc, icon: '🥩', label: 'Б' + Math.round(totals.prot) + ' У' + Math.round(totals.carbs) + ' Ж' + Math.round(totals.fat) },
                    { id: 'carb', ...carbCalc, icon: '🍬', label: carbCalc.simpleRatio + '% простых' },
                    { id: 'fat', ...fatCalc, icon: '🥑', label: fatCalc.goodRatio + '% полезных' },
                    { id: 'gi', ...giCalc, icon: '📈', label: 'ГИ ' + Math.round(quality.avgGI || 50) },
                ];
                const worstCalc = allCalcs.reduce((w, c) => (c.points / c.max) < (w.points / w.max) ? c : w, allCalcs[0]);
                const worstId = (worstCalc.points / worstCalc.max) < 0.8 ? worstCalc.id : null;

                const circadianBonus = quality.circadianBonus || 0;
                const circadianBonusPct = Math.round(circadianBonus * 100);

                const getDairyWarning = () => {
                    if (!meal?.items || !pIndex) return null;
                    const dairyPatterns = /молок|кефир|йогурт|творог|сыр|сливк|ряженк/i;
                    const dairyItems = meal.items.filter((item) => {
                        const p = getProductFromItem(item, pIndex);
                        return p && dairyPatterns.test(p.name || item.name || '');
                    });
                    if (dairyItems.length === 0) return null;
                    const totalDairyGrams = dairyItems.reduce((sum, it) => sum + (+it.grams || 0), 0);
                    if (totalDairyGrams < 100) return null;
                    return { count: dairyItems.length, grams: totalDairyGrams };
                };
                const dairyWarning = getDairyWarning();

                const mealGL = quality.mealGL || 0;
                const glLevel = quality.glLevel || 'medium';
                const circadianPeriod = quality.circadianPeriod || 'afternoon';
                const liquidRatio = quality.liquidRatio || 0;

                const glLevelRu = {
                    'very-low': 'очень низкая',
                    'low': 'низкая',
                    'medium': 'средняя',
                    'high': 'высокая',
                    'very-high': 'очень высокая',
                }[glLevel] || glLevel;

                const circadianPeriodRu = {
                    'morning': '🌅 утро (метаболизм ↑)',
                    'midday': '🌞 день (оптимально)',
                    'afternoon': '☀️ день',
                    'evening': '🌇 вечер',
                    'night': '🌙 ночь (метаболизм ↓)',
                }[circadianPeriod] || circadianPeriod;

                const getProductsList = () => {
                    if (!meal?.items || meal.items.length === 0) return [];
                    return meal.items.slice(0, 5).map((item) => {
                        const p = getProductFromItem(item, pIndex) || {};
                        const name = item.name || p.name || 'Продукт';
                        const grams = +item.grams || 0;
                        const kcal = Math.round((p.kcal100 || 0) * grams / 100);
                        return { name: name.length > 20 ? name.slice(0, 18) + '...' : name, grams, kcal };
                    });
                };
                const productsList = getProductsList();

                const getTip = () => {
                    if (!worstId) return { text: '✨ Отличный сбалансированный приём!', type: 'success', worstId: null };

                    const tips = {
                        kcal: { text: '💡 Следи за размером порций', type: 'warning' },
                        macro: { text: '💡 Добавь белок: яйца, курицу или творог', type: 'info' },
                        carb: { text: '💡 Замени сладкое на сложные углеводы (каши, овощи)', type: 'info' },
                        fat: { text: '💡 Добавь полезные жиры: орехи, авокадо, рыба', type: 'info' },
                        gi: { text: '💡 Выбирай продукты с низким ГИ (<55)', type: 'info' },
                    };

                    return { ...tips[worstId], worstId } || { text: '💡 Следующий раз будет лучше!', type: 'neutral', worstId: null };
                };

                const tip = getTip();

                const getYesterdayComparison = () => {
                    try {
                        const mealType = mealTypeInfo?.type || 'meal';
                        const today = new Date();
                        const yesterday = new Date(today);
                        yesterday.setDate(yesterday.getDate() - 1);
                        const yesterdayKey = yesterday.toISOString().split('T')[0];
                        const yesterdayDay = U.lsGet ? U.lsGet('heys_dayv2_' + yesterdayKey, null) : null;
                        if (!yesterdayDay?.meals?.length) return null;

                        const yesterdayMeal = yesterdayDay.meals.find((m, i) => {
                            const yType = getMealType(i, m, yesterdayDay.meals, pIndex);
                            return yType?.type === mealType;
                        });
                        if (!yesterdayMeal?.items?.length) return null;

                        const yQuality = getMealQualityScore(yesterdayMeal, mealType, params?.optimum || 2000, pIndex);
                        if (!yQuality) return null;

                        const diff = quality.score - yQuality.score;
                        if (Math.abs(diff) < 3) return { diff: 0, text: '≈ как вчера' };
                        if (diff > 0) return { diff, text: '+' + diff + ' vs вчера 📈' };
                        return { diff, text: diff + ' vs вчера 📉' };
                    } catch (e) {
                        return null;
                    }
                };
                const yesterdayComp = getYesterdayComparison();

                const CalcRow = ({ id, icon, label, points, max, isBonus, isWorst }) =>
                    React.createElement('div', {
                        style: {
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 8px',
                            background: isBonus ? 'rgba(234, 179, 8, 0.1)' : (points === max ? 'rgba(16, 185, 129, 0.06)' : points < max * 0.5 ? 'rgba(239, 68, 68, 0.06)' : 'rgba(234, 179, 8, 0.06)'),
                            borderRadius: '6px',
                            marginBottom: '4px',
                            borderLeft: '3px solid ' + (isBonus ? '#b45309' : (points === max ? '#10b981' : points < max * 0.5 ? '#ef4444' : '#eab308')),
                            animation: isWorst ? 'pulse-worst 1.5s ease-in-out infinite' : 'none',
                            boxShadow: isWorst ? '0 0 0 2px rgba(239, 68, 68, 0.3)' : 'none',
                        },
                    },
                        React.createElement('span', { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' } },
                            icon,
                            React.createElement('span', { style: { color: 'var(--text-secondary)' } }, label),
                            isWorst && React.createElement('span', { style: { fontSize: '10px', color: '#ef4444', marginLeft: '4px' } }, '← исправить'),
                        ),
                        React.createElement('span', {
                            style: {
                                fontWeight: 700,
                                fontSize: '12px',
                                color: isBonus ? '#b45309' : (points === max ? '#10b981' : points < max * 0.5 ? '#ef4444' : '#eab308'),
                            },
                        }, (isBonus && points > 0 ? '+' : '') + points + '/' + max),
                    );

                return React.createElement('div', {
                    className: 'metric-popup meal-quality-popup' + (showAbove ? ' above' : ''),
                    role: 'dialog',
                    'aria-modal': 'true',
                    style: {
                        position: 'fixed',
                        left: left + 'px',
                        top: top + 'px',
                        width: popupW + 'px',
                        maxHeight: 'calc(100vh - 32px)',
                        overflowY: 'auto',
                        zIndex: 10000,
                    },
                    onClick: (e) => e.stopPropagation(),
                    ...swipeHandlers,
                },
                    React.createElement('div', { className: 'metric-popup-stripe', style: { background: color } }),
                    React.createElement('div', { className: 'metric-popup-content', style: { padding: '12px' } },
                        React.createElement('div', { className: 'metric-popup-swipe' }),
                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } },
                            React.createElement('span', { style: { fontSize: '14px', fontWeight: 600 } },
                                (mealTypeInfo?.icon || '🍽️') + ' ' + (mealTypeInfo?.label || meal.name || 'Приём'),
                            ),
                            React.createElement('div', { style: { flex: 1, height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' } },
                                React.createElement('div', { style: { width: quality.score + '%', height: '100%', background: color, transition: 'width 0.3s' } }),
                            ),
                            React.createElement('span', { style: { fontSize: '18px', fontWeight: 800, color: color } }, quality.score),
                            yesterdayComp && React.createElement('span', {
                                style: {
                                    fontSize: '10px',
                                    color: yesterdayComp.diff > 0 ? '#10b981' : yesterdayComp.diff < 0 ? '#ef4444' : 'var(--text-muted)',
                                    fontWeight: 600,
                                },
                            }, yesterdayComp.text),
                        ),
                        React.createElement('div', {
                            style: {
                                padding: '6px 10px',
                                background: tip.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : tip.type === 'warning' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                borderRadius: '6px',
                                marginBottom: '10px',
                                fontSize: '12px',
                            },
                        }, tip.text),
                        allCalcs.map((calc) => CalcRow({
                            key: calc.id,
                            id: calc.id,
                            icon: calc.icon,
                            label: calc.label,
                            points: calc.points,
                            max: calc.max,
                            isWorst: calc.id === worstId,
                        })),
                        bonusPoints !== 0 && CalcRow({ id: 'bonus', icon: '⭐', label: 'Бонусы', points: bonusPoints, max: 15, isBonus: true }),
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px 10px',
                                background: color + '15',
                                borderRadius: '6px',
                                marginTop: '6px',
                                marginBottom: '8px',
                            },
                        },
                            React.createElement('span', { style: { fontWeight: 600, fontSize: '12px' } }, '∑ ИТОГО'),
                            React.createElement('span', { style: { fontWeight: 700, fontSize: '14px', color: color } },
                                baseScore + '+' + bonusPoints + ' = ' + quality.score,
                            ),
                        ),
                        (circadianBonusPct !== 0 || dairyWarning) && React.createElement('div', {
                            style: {
                                display: 'flex',
                                gap: '6px',
                                flexWrap: 'wrap',
                                marginBottom: '8px',
                                fontSize: '10px',
                            },
                        },
                            circadianBonusPct !== 0 && React.createElement('span', {
                                style: {
                                    padding: '3px 6px',
                                    borderRadius: '6px',
                                    background: circadianBonusPct > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    color: circadianBonusPct > 0 ? '#10b981' : '#ef4444',
                                    fontWeight: 600,
                                },
                            }, '🕐 ' + (circadianBonusPct > 0 ? '+' : '') + circadianBonusPct + '% (время суток)'),
                            dairyWarning && React.createElement('span', {
                                style: {
                                    padding: '3px 6px',
                                    borderRadius: '6px',
                                    background: 'rgba(234, 179, 8, 0.1)',
                                    color: '#b45309',
                                    fontWeight: 600,
                                },
                                title: 'Молочные продукты вызывают повышенный инсулиновый ответ (II ×2-3)',
                            }, '🥛 ' + dairyWarning.grams + 'г молочки → II↑'),
                        ),
                        React.createElement('div', { style: { display: 'flex', gap: '8px', fontSize: '11px', marginBottom: '8px' } },
                            React.createElement('div', { style: { flex: 1, padding: '6px', background: 'var(--bg-tertiary, #f3f4f6)', borderRadius: '6px' } },
                                React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px', fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' } }, '🔬 Данные'),
                                React.createElement('div', null, 'GL: ' + glLevelRu),
                                React.createElement('div', null, circadianPeriodRu),
                                liquidRatio > 0.3 && React.createElement('div', { style: { color: '#f59e0b' } }, '💧 ' + Math.round(liquidRatio * 100) + '% жидкое'),
                            ),
                            productsList.length > 0 && React.createElement('div', { style: { flex: 1, padding: '6px', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' } },
                                React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px', fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' } }, '📋 Состав'),
                                productsList.slice(0, 3).map((p, i) => React.createElement('div', { key: i, style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                                    p.name + ' ' + p.grams + 'г',
                                )),
                                meal.items && meal.items.length > 3 && React.createElement('div', { style: { color: 'var(--text-muted)' } }, '+' + (meal.items.length - 3) + ' ещё'),
                            ),
                        ),
                        (quality.badges && quality.badges.length > 0) && React.createElement('div', {
                            style: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' },
                        },
                            quality.badges.slice(0, 4).map((badge, i) => {
                                const isPositive = badge.ok === true;
                                const badgeType = typeof badge === 'object' ? badge.type : String(badge);
                                return React.createElement('span', {
                                    key: i,
                                    style: {
                                        background: isPositive ? '#dcfce7' : '#fee2e2',
                                        color: isPositive ? '#166534' : '#dc2626',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        fontSize: '10px',
                                        fontWeight: 500,
                                    },
                                }, badgeType);
                            }),
                        ),
                        React.createElement('button', { className: 'metric-popup-close', 'aria-label': 'Закрыть', onClick: () => setMealQualityPopup(null) }, '✕'),
                    ),
                    React.createElement('div', { className: 'metric-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '') }),
                );
            })(),
            document.body,
        );
    }

    HEYS.mealScoring = {
        MEAL_KCAL_LIMITS,
        IDEAL_MACROS_UNIFIED,
        MEAL_KCAL_ABSOLUTE,
        IDEAL_MACROS,
        CIRCADIAN_MEAL_BONUS,
        LIQUID_FOOD_PATTERNS,
        HEALTHY_LIQUID_PATTERNS,
        LIQUID_FOOD_PENALTY,
        GL_QUALITY_THRESHOLDS,
        isLiquidFood,
        calculateMealGL,
        getCircadianBonus,
        getGLQualityBonus,
        calcKcalScore,
        calcMacroScore,
        calcCarbQuality,
        calcFatQuality,
        calcGiHarmScore,
        getMealQualityScore,
        getNutrientColor,
        getNutrientTooltip,
        getDailyNutrientColor,
        getDailyNutrientTooltip,
    };

    HEYS.dayMealQualityPopup = {
        renderMealQualityPopup,
    };
})(window);
// ===== End day/_meal_quality.js =====

// ===== Begin heys_day_add_product.js =====
;// heys_day_add_product.js — MealAddProduct and ProductRow components for DayTab
// Extracted from heys_day_v12.js (Phase 2.3)
// Contains: MealAddProduct component, ProductRow component

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // Import utilities from dayUtils
  const U = HEYS.dayUtils || {};
  const uid = U.uid || (() => 'id_' + Date.now());
  const buildProductIndex = U.buildProductIndex || (() => ({}));
  const getProductFromItem = U.getProductFromItem || (() => null);
  const per100 = U.per100 || ((p) => ({ kcal100: 0, carbs100: 0, prot100: 0, fat100: 0, simple100: 0, complex100: 0, bad100: 0, good100: 0, trans100: 0, fiber100: 0 }));
  const scale = U.scale || ((v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10);

  // ✅ Общий helper: summary-модалка для multiProductMode
  async function showMultiProductSummary({
    day,
    mealIndex,
    pIndex,
    getProductFromItem,
    per100,
    scale,
    onAddMore
  }) {
    if (!HEYS.ConfirmModal?.show) return;

    const currentDay = day || HEYS.Day?.getDay?.() || {};
    const currentMeal = currentDay?.meals?.[mealIndex];
    if (!currentMeal) return;

    const localPIndex = pIndex || HEYS.dayUtils?.buildProductIndex?.() || HEYS.products?.buildIndex?.() || {};
    const mealTotals = HEYS.models?.mealTotals?.(currentMeal, localPIndex) || {};
    const mealKcal = Math.round(mealTotals.kcal || 0);

    const optimumData = HEYS.dayUtils?.getOptimumForDay?.(currentDay) || {};
    const optimum = Math.round(optimumData.optimum || 2000);

    const dayTotals = HEYS.dayCalculations?.calculateDayTotals?.(currentDay, localPIndex) || {};
    const eatenKcal = Math.round(dayTotals.kcal || 0);
    const remainingKcal = optimum - eatenKcal;

    const mealScore = HEYS.mealScoring?.calcKcalScore?.(mealKcal, null, optimum, currentMeal.time, null);
    const mealQuality = HEYS.mealScoring?.getMealQualityScore?.(currentMeal, null, optimum, localPIndex, null);
    const mealKcalStatus = (() => {
      let status = 'good';
      if (mealScore?.ok === false) status = 'bad';
      else if ((mealScore?.issues || []).length > 0) status = 'warn';
      if (mealQuality?.score != null) {
        if (mealQuality.score < 50) status = 'bad';
        else if (mealQuality.score < 75 && status !== 'bad') status = 'warn';
      }
      return status;
    })();
    const mealKcalColor = mealKcalStatus === 'bad'
      ? '#ef4444'
      : mealKcalStatus === 'warn'
        ? '#eab308'
        : '#22c55e';

    const heroMetrics = HEYS.dayHeroMetrics?.computeHeroMetrics?.({
      day: currentDay,
      eatenKcal,
      optimum,
      dayTargetDef: currentDay?.deficitPct,
      factDefPct: currentDay?.deficitPct,
      r0: (v) => Math.round(v),
      ratioZones: HEYS.ratioZones
    });
    const remainingColor = heroMetrics?.remainCol?.text
      || (remainingKcal > 100 ? '#22c55e' : remainingKcal >= 0 ? '#eab308' : '#ef4444');

    const mealOverLimit = (mealScore?.issues || []).some((issue) =>
      String(issue).includes('переед') || String(issue).includes('много')
    ) || mealScore?.ok === false;

    const isGoalReached = remainingKcal <= 0;
    const mealName = currentMeal.name || `Приём ${mealIndex + 1}`;

    const mealItems = (currentMeal.items || []).map((item) => {
      const product = getProductFromItem(item, localPIndex) || { name: item.name || '?' };
      const grams = +item.grams || 0;
      const p100 = per100(product);
      const itemKcal = Math.round(scale(p100.kcal100, grams));
      let name = product.name || item.name || '?';
      if (name.length > 22) name = name.slice(0, 20) + '…';
      return { name, grams, kcal: itemKcal };
    });

    const ProductsList = mealItems.length > 0 ? React.createElement('div', {
      className: 'confirm-modal-products-list',
      style: {
        margin: '10px 0',
        padding: '8px 10px',
        background: 'var(--bg-secondary, #f8fafc)',
        borderRadius: '8px',
        fontSize: '13px'
      }
    },
      React.createElement('div', {
        style: {
          fontSize: '11px',
          fontWeight: '600',
          color: '#64748b',
          marginBottom: '6px',
          textTransform: 'uppercase',
          letterSpacing: '0.3px'
        }
      }, 'В приёме:'),
      mealItems.slice(0, 6).map((item, idx) =>
        React.createElement('div', {
          key: idx,
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '3px 0',
            borderBottom: idx < Math.min(mealItems.length, 6) - 1 ? '1px dotted #e2e8f0' : 'none'
          }
        },
          React.createElement('span', { style: { color: '#334155' } },
            item.name,
            ' ',
            React.createElement('span', { style: { color: '#94a3b8', fontSize: '11px' } }, item.grams + 'г')
          ),
          React.createElement('span', {
            style: { fontWeight: '600', color: '#475569', minWidth: '45px', textAlign: 'right' }
          }, item.kcal)
        )
      ),
      mealItems.length > 6 && React.createElement('div', {
        style: { fontSize: '11px', color: '#94a3b8', marginTop: '4px', textAlign: 'center' }
      }, '...и ещё ' + (mealItems.length - 6)),
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '6px',
          paddingTop: '6px',
          borderTop: '1px solid #cbd5e1',
          fontWeight: '700'
        }
      },
        React.createElement('span', { style: { color: '#334155' } }, 'Итого'),
        React.createElement('span', { style: { color: mealKcalColor } }, mealKcal + ' ккал')
      )
    ) : null;

    let modalResult = false;

    if (isGoalReached) {
      modalResult = await HEYS.ConfirmModal.show({
        icon: '🎉',
        title: 'Норма выполнена!',
        text: React.createElement('div', { className: 'confirm-modal-text-block' },
          React.createElement('div', null,
            'Отличная работа! В "',
            mealName,
            '" уже ',
            React.createElement('span', {
              className: 'confirm-modal-kcal',
              style: { color: mealKcalColor }
            }, mealKcal + ' ккал'),
            '.'
          ),
          ProductsList,
          React.createElement('div', { style: { marginTop: '8px' } },
            'Всего за день: ',
            React.createElement('span', {
              className: 'confirm-modal-kcal',
              style: { color: remainingColor }
            }, eatenKcal + ' ккал')
          )
        ),
        confirmText: 'Добавить ещё',
        cancelText: 'Завершить 🎊',
        confirmStyle: 'success',
        cancelStyle: 'primary',
        confirmVariant: 'fill',
        cancelVariant: 'fill'
      });

      if (!modalResult && HEYS.Confetti?.fire) {
        HEYS.Confetti.fire();
      }
    } else {
      modalResult = await HEYS.ConfirmModal.show({
        icon: '🍽️',
        title: `Добавить ещё в ${String(mealName).toLowerCase()}?`,
        text: React.createElement('div', { className: 'confirm-modal-text-block' },
          ProductsList,
          React.createElement('div', { style: { marginTop: ProductsList ? '8px' : '0' } },
            'До нормы сегодня осталось ',
            React.createElement('span', {
              className: 'confirm-modal-remaining',
              style: { color: remainingColor }
            }, Math.max(0, remainingKcal) + ' ккал'),
            '.'
          ),
          mealOverLimit && React.createElement('div', { className: 'confirm-modal-warning' },
            '⚠️ Похоже, приём уже тяжеловат.'
          )
        ),
        confirmText: 'Добавить ещё',
        cancelText: 'Завершить',
        confirmStyle: 'success',
        cancelStyle: 'primary',
        confirmVariant: 'fill',
        cancelVariant: 'fill'
      });
    }

    if (modalResult && onAddMore) {
      onAddMore(currentDay);
    }
  }

  HEYS.dayAddProductSummary = HEYS.dayAddProductSummary || {};
  HEYS.dayAddProductSummary.show = showMultiProductSummary;

  // === MealAddProduct Component (extracted for stable identity) ===
  const MealAddProduct = React.memo(function MealAddProduct({
    mi,
    products,
    date,
    day,
    setDay,
    isCurrentMeal = false,
    multiProductMode = false,
    buttonText = 'Добавить еще продукт',
    buttonIcon = '🔍',
    buttonClassName = '',
    highlightCurrent = true,
    ariaLabel = 'Добавить продукт'
  }) {
    const getLatestProducts = React.useCallback(() => {
      const fromHeys = HEYS.products?.getAll?.() || [];
      const fromStore = HEYS.store?.get?.('heys_products', []) || [];
      const fromLs = U.lsGet ? U.lsGet('heys_products', []) : [];

      if (fromHeys.length > 0) return fromHeys;
      if (fromStore.length > 0) return fromStore;
      if (fromLs.length > 0) return fromLs;
      return Array.isArray(products) ? products : [];
    }, [products]);

    const getLatestDay = React.useCallback(() => {
      return day || HEYS.Day?.getDay?.() || {};
    }, [day]);

    const handleOpenModal = React.useCallback(() => {
      try { navigator.vibrate?.(10); } catch (e) { }

      const handleAddPhoto = async ({ mealIndex, photo, filename, timestamp }) => {
        const activeDay = getLatestDay();
        const activeMeal = activeDay?.meals?.[mealIndex];

        // Проверяем лимит фото (10 на приём)
        const currentPhotos = activeMeal?.photos?.length || 0;
        if (currentPhotos >= PHOTO_LIMIT_PER_MEAL) {
          HEYS.Toast?.warning(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`) || alert(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`);
          return;
        }

        // Получаем данные для загрузки
        const clientId = HEYS.utils?.getCurrentClientId?.() || 'default';
        const mealId = activeMeal?.id || uid('meal_');
        const photoId = uid('photo_');

        // Пытаемся загрузить в облако
        let photoData = {
          id: photoId,
          data: photo,
          filename,
          timestamp,
          pending: true,
          uploading: true,
          uploaded: false
        };

        // Сначала добавляем в UI (для мгновенного отображения)
        setDay((prevDay = {}) => {
          const meals = (prevDay.meals || []).map((m, i) =>
            i === mealIndex
              ? {
                ...m,
                photos: [...(m.photos || []), photoData]
              }
              : m
          );
          return { ...prevDay, meals, updatedAt: Date.now() };
        });

        try { navigator.vibrate?.(10); } catch (e) { }

        // Асинхронно загружаем в облако
        if (HEYS.cloud?.uploadPhoto) {
          try {
            const result = await HEYS.cloud.uploadPhoto(photo, clientId, date, mealId);

            if (result?.uploaded && result?.url) {
              setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) => {
                  if (i !== mealIndex || !m.photos) return m;
                  return {
                    ...m,
                    photos: m.photos.map(p =>
                      p.id === photoId
                        ? { ...p, url: result.url, data: undefined, pending: false, uploading: false, uploaded: true }
                        : p
                    )
                  };
                });
                return { ...prevDay, meals, updatedAt: Date.now() };
              });
            } else if (result?.pending) {
              setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) => {
                  if (i !== mealIndex || !m.photos) return m;
                  return {
                    ...m,
                    photos: m.photos.map(p =>
                      p.id === photoId
                        ? { ...p, uploading: false }
                        : p
                    )
                  };
                });
                return { ...prevDay, meals, updatedAt: Date.now() };
              });
            }
          } catch (e) {
            setDay((prevDay = {}) => {
              const meals = (prevDay.meals || []).map((m, i) => {
                if (i !== mealIndex || !m.photos) return m;
                return {
                  ...m,
                  photos: m.photos.map(p =>
                    p.id === photoId
                      ? { ...p, uploading: false }
                      : p
                  )
                };
              });
              return { ...prevDay, meals, updatedAt: Date.now() };
            });
            console.warn('[HEYS] Photo upload failed, will retry later:', e);
          }
        }
      };

      const handleNewProduct = () => {
        if (window.HEYS?.products?.showAddModal) {
          window.HEYS.products.showAddModal();
        }
      };

      const openAddModal = (override = {}) => {
        const latestDay = override.day || getLatestDay();
        const latestMeal = latestDay?.meals?.[mi] || {};
        const latestProducts = getLatestProducts();

        if (window.HEYS?.AddProductStep?.show) {
          window.HEYS.AddProductStep.show({
            mealIndex: mi,
            mealPhotos: latestMeal.photos || [],
            products: latestProducts,
            day: latestDay,
            dateKey: date,
            multiProductMode,
            onAdd: handleAdd,
            onAddPhoto: handleAddPhoto,
            onNewProduct: handleNewProduct
          });
        } else {
          console.error('[HEYS] AddProductStep not loaded');
        }
      };

      const handleAdd = ({ product, grams, mealIndex }) => {
        console.info('[HEYS.day] ➕ Add product to meal (modal)', {
          mealIndex,
          grams,
          productId: product?.id ?? product?.product_id ?? null,
          productName: product?.name || null,
          source: product?._source || (product?._fromShared ? 'shared' : 'personal')
        });
        // 🌐 Если продукт из общей базы — автоматически клонируем в личную
        let finalProduct = product;
        if (product?._fromShared || product?._source === 'shared') {
          const cloned = window.HEYS?.products?.addFromShared?.(product);
          if (cloned) {
            finalProduct = cloned;
          }
        }

        // 🔍 DEBUG: Подробный лог при добавлении продукта в meal
        const hasNutrients = !!(finalProduct?.kcal100 || finalProduct?.protein100 || finalProduct?.carbs100);
        if (!hasNutrients) {
          console.error('🚨 [DayTab] CRITICAL: Received product with NO nutrients!', finalProduct);
        }

        const productId = finalProduct.id ?? finalProduct.product_id ?? finalProduct.name;
        const computeTEFKcal100 = (p) => {
          const carbs = (+p.carbs100) || ((+p.simple100 || 0) + (+p.complex100 || 0));
          const fat = (+p.fat100) || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
          // NET Atwater: protein 3 kcal/g (TEF 25% built-in: 4×0.75=3), carbs 4 kcal/g, fat 9 kcal/g
          return Math.round((3 * (+p.protein100 || 0) + 4 * carbs + 9 * fat) * 10) / 10;
        };
        const additivesList = Array.isArray(finalProduct.additives) ? finalProduct.additives : undefined;
        const novaGroup = finalProduct.nova_group ?? finalProduct.novaGroup;
        const nutrientDensity = finalProduct.nutrient_density ?? finalProduct.nutrientDensity;
        const newItem = {
          id: uid('it_'),
          product_id: finalProduct.id ?? finalProduct.product_id,
          name: finalProduct.name,
          fingerprint: finalProduct.fingerprint,
          grams: grams || 100,
          portions: Array.isArray(finalProduct.portions) ? finalProduct.portions : undefined,
          ...(finalProduct.kcal100 !== undefined && {
            kcal100: computeTEFKcal100(finalProduct),
            protein100: finalProduct.protein100,
            carbs100: finalProduct.carbs100,
            fat100: finalProduct.fat100,
            simple100: finalProduct.simple100,
            complex100: finalProduct.complex100,
            badFat100: finalProduct.badFat100,
            goodFat100: finalProduct.goodFat100,
            trans100: finalProduct.trans100,
            fiber100: finalProduct.fiber100,
            sodium100: finalProduct.sodium100,
            omega3_100: finalProduct.omega3_100,
            omega6_100: finalProduct.omega6_100,
            nova_group: novaGroup,
            additives: additivesList,
            nutrient_density: nutrientDensity,
            is_organic: finalProduct.is_organic,
            is_whole_grain: finalProduct.is_whole_grain,
            is_fermented: finalProduct.is_fermented,
            is_raw: finalProduct.is_raw,
            vitamin_a: finalProduct.vitamin_a,
            vitamin_c: finalProduct.vitamin_c,
            vitamin_d: finalProduct.vitamin_d,
            vitamin_e: finalProduct.vitamin_e,
            vitamin_k: finalProduct.vitamin_k,
            vitamin_b1: finalProduct.vitamin_b1,
            vitamin_b2: finalProduct.vitamin_b2,
            vitamin_b3: finalProduct.vitamin_b3,
            vitamin_b6: finalProduct.vitamin_b6,
            vitamin_b9: finalProduct.vitamin_b9,
            vitamin_b12: finalProduct.vitamin_b12,
            calcium: finalProduct.calcium,
            iron: finalProduct.iron,
            magnesium: finalProduct.magnesium,
            phosphorus: finalProduct.phosphorus,
            potassium: finalProduct.potassium,
            zinc: finalProduct.zinc,
            selenium: finalProduct.selenium,
            iodine: finalProduct.iodine,
            gi: finalProduct.gi,
            harm: HEYS.models?.normalizeHarm?.(finalProduct)
          })
        };

        const itemHasNutrients = !!(newItem.kcal100 || newItem.protein100 || newItem.carbs100);
        if (!itemHasNutrients) {
          console.error('🚨 [DayTab] CRITICAL: newItem has NO nutrients! Will be saved without data.', {
            newItem,
            finalProduct,
            spreadCondition: finalProduct.kcal100 !== undefined
          });
        }

        const newUpdatedAt = Date.now();
        if (HEYS.Day?.setBlockCloudUpdates) {
          HEYS.Day.setBlockCloudUpdates(newUpdatedAt + 3000);
        } else {
          console.warn('[HEYS.day] ⚠️ setBlockCloudUpdates missing');
        }
        if (HEYS.Day?.setLastLoadedUpdatedAt) {
          HEYS.Day.setLastLoadedUpdatedAt(newUpdatedAt);
        } else {
          console.warn('[HEYS.day] ⚠️ setLastLoadedUpdatedAt missing');
        }

        setDay((prevDay = {}) => {
          const mealsList = prevDay.meals || [];
          if (!mealsList[mealIndex]) {
            console.warn('[HEYS.day] ❌ Meal index not found for add', {
              mealIndex,
              mealsCount: mealsList.length,
              productName: finalProduct?.name || null
            });
          }
          const meals = mealsList.map((m, i) =>
            i === mealIndex
              ? { ...m, items: [...(m.items || []), newItem] }
              : m
          );
          return { ...prevDay, meals, updatedAt: newUpdatedAt };
        });

        requestAnimationFrame(() => {
          setTimeout(() => {
            if (HEYS.Day?.requestFlush) {
              HEYS.Day.requestFlush();
            }
          }, 50);
        });

        try { navigator.vibrate?.(10); } catch (e) { }

        window.dispatchEvent(new CustomEvent('heysProductAdded', {
          detail: { product, grams }
        }));

        try {
          if (HEYS.store?.set) {
            HEYS.store.set(`heys_last_grams_${productId}`, grams);
          } else if (U.lsSet) {
            U.lsSet(`heys_last_grams_${productId}`, grams);
          } else {
            localStorage.setItem(`heys_last_grams_${productId}`, JSON.stringify(grams));
          }

          const history = HEYS.store?.get
            ? HEYS.store.get('heys_grams_history', {})
            : (U.lsGet ? U.lsGet('heys_grams_history', {}) : {});
          if (!history[productId]) history[productId] = [];
          history[productId].push(grams);
          if (history[productId].length > 20) history[productId].shift();

          if (HEYS.store?.set) {
            HEYS.store.set('heys_grams_history', history);
          } else if (U.lsSet) {
            U.lsSet('heys_grams_history', history);
          } else {
            localStorage.setItem('heys_grams_history', JSON.stringify(history));
          }
        } catch (e) { }

        if (multiProductMode && HEYS.dayAddProductSummary?.show) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              HEYS.dayAddProductSummary.show({
                day: HEYS.Day?.getDay?.() || day || {},
                mealIndex,
                pIndex: HEYS.dayUtils?.buildProductIndex?.() || HEYS.products?.buildIndex?.() || {},
                getProductFromItem,
                per100,
                scale,
                onAddMore: (updatedDay) => openAddModal({ day: updatedDay })
              });
            }, 100);
          });
        }
      };

      openAddModal();
    }, [mi, date, day, setDay, getLatestDay, getLatestProducts, multiProductMode]);

    return React.createElement('button', {
      className: 'aps-open-btn'
        + ((highlightCurrent && isCurrentMeal) ? ' aps-open-btn--current' : '')
        + (buttonClassName ? ` ${buttonClassName}` : ''),
      onClick: handleOpenModal,
      'aria-label': ariaLabel
    },
      React.createElement('span', { className: 'aps-open-icon' }, buttonIcon),
      React.createElement('span', { className: 'aps-open-text' }, buttonText)
    );
  }, (prev, next) => {
    if (prev.mi !== next.mi) return false;
    if (prev.products !== next.products) return false;

    const prevItems = prev.day?.meals?.[prev.mi]?.items;
    const nextItems = next.day?.meals?.[next.mi]?.items;
    if (prevItems !== nextItems) return false;

    return true;
  });

  const MEAL_HEADER_META = [
    { label: '' },
    { label: 'г' },
    { label: 'ккал<br>/100', per100: true },
    { label: 'У<br>/100', per100: true },
    { label: 'Прост<br>/100', per100: true },
    { label: 'Сл<br>/100', per100: true },
    { label: 'Б<br>/100', per100: true },
    { label: 'Ж<br>/100', per100: true },
    { label: 'ВрЖ<br>/100', per100: true },
    { label: 'ПолЖ<br>/100', per100: true },
    { label: 'СупЖ<br>/100', per100: true },
    { label: 'Клет<br>/100', per100: true },
    { label: 'ккал' },
    { label: 'У' },
    { label: 'Прост' },
    { label: 'Сл' },
    { label: 'Б' },
    { label: 'Ж' },
    { label: 'ВрЖ' },
    { label: 'ПолЖ' },
    { label: 'СупЖ' },
    { label: 'Клет' },
    { label: 'ГИ' },
    { label: 'Вред' },
    { label: '' }
  ];

  function fmtVal(key, v) {
    if (v == null || v === '') return '-';
    const num = +v || 0;
    if (key === 'harm') return Math.round(num * 10) / 10; // вредность с одной десятичной
    if (!num) return '-';
    return Math.round(num); // всё остальное до целых
  }

  const harmMissingLogged = new Set();
  function logMissingHarm(name, item, source) {
    if (!HEYS.analytics?.trackDataOperation) return;
    const key = `${source || 'meal-table'}:${(name || 'unknown').toLowerCase()}`;
    if (harmMissingLogged.has(key)) return;
    harmMissingLogged.add(key);
    HEYS.analytics.trackDataOperation('harm_missing_in_meal_card', {
      source: source || 'meal-table',
      name: name || null,
      productId: item?.product_id ?? item?.productId ?? item?.id ?? null,
      hasItemHarm: HEYS.models?.normalizeHarm?.(item) != null,
    });
  }

  const ProductRow = React.memo(function ProductRow({
    item,
    mealIndex,
    isNew,
    pIndex,
    setGrams,
    removeItem
  }) {
    const p = getProductFromItem(item, pIndex) || { name: item.name || '?' };
    const grams = +item.grams || 0;
    const per = per100(p);
    const row = {
      kcal: scale(per.kcal100, grams),
      carbs: scale(per.carbs100, grams),
      simple: scale(per.simple100, grams),
      complex: scale(per.complex100, grams),
      prot: scale(per.prot100, grams),
      fat: scale(per.fat100, grams),
      bad: scale(per.bad100, grams),
      good: scale(per.good100, grams),
      trans: scale(per.trans100, grams),
      fiber: scale(per.fiber100, grams)
    };
    const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? item.gi;
    // Use centralized harm normalization with fallback to item
    const harmVal = HEYS.models?.normalizeHarm?.(p) ?? HEYS.models?.normalizeHarm?.(item);
    if (harmVal == null) {
      logMissingHarm(p.name, item, 'meal-table');
    }
    return React.createElement('tr', { 'data-new': isNew ? 'true' : 'false' },
      React.createElement('td', { 'data-cell': 'name' }, p.name),
      React.createElement('td', { 'data-cell': 'grams' }, React.createElement('input', {
        type: 'number',
        value: grams,
        'data-grams-input': true,
        'data-meal-index': mealIndex,
        'data-item-id': item.id,
        onChange: e => setGrams(mealIndex, item.id, e.target.value),
        onKeyDown: e => {
          if (e.key === 'Enter') {
            e.target.blur(); // Убрать фокус после подтверждения
          }
        },
        onFocus: e => e.target.select(), // Выделить текст при фокусе
        placeholder: 'грамм',
        style: { textAlign: 'center' }
      })),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('kcal100', per.kcal100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('carbs100', per.carbs100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('simple100', per.simple100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('complex100', per.complex100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('prot100', per.prot100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('fat100', per.fat100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('bad', per.bad100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('good100', per.good100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('trans100', per.trans100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('fiber100', per.fiber100)),
      React.createElement('td', { 'data-cell': 'kcal' }, fmtVal('kcal', row.kcal)),
      React.createElement('td', { 'data-cell': 'carbs' }, fmtVal('carbs', row.carbs)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('simple', row.simple)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('complex', row.complex)),
      React.createElement('td', { 'data-cell': 'prot' }, fmtVal('prot', row.prot)),
      React.createElement('td', { 'data-cell': 'fat' }, fmtVal('fat', row.fat)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('bad', row.bad)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('good', row.good)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('trans', row.trans)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('fiber', row.fiber)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('gi', giVal)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('harm', harmVal)),
      React.createElement('td', { 'data-cell': 'delete' }, React.createElement('button', { className: 'btn secondary', onClick: () => removeItem(mealIndex, item.id) }, '×'))
    );
  });

  // Export to HEYS namespace
  HEYS.dayComponents = HEYS.dayComponents || {};
  HEYS.dayComponents.MealAddProduct = MealAddProduct;
  HEYS.dayComponents.ProductRow = ProductRow;

})(window);
// ===== End heys_day_add_product.js =====

// ===== Begin heys_day_meal_optimizer_section.js =====
;// heys_day_meal_optimizer_section.js — MealOptimizerSection component

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    const MealOptimizerSection = React.memo(function MealOptimizerSection(props) {
        const { meal, totals, dayData, profile, products, pIndex, mealIndex, addProductToMeal } = props || {};
        const MO = HEYS.MealOptimizer;
        const [optExpanded, setOptExpanded] = React.useState(true);
        const [debouncedMeal, setDebouncedMeal] = React.useState(meal);

        if (!meal?.items?.length) return null;

        React.useEffect(() => {
            const timer = setTimeout(() => setDebouncedMeal(meal), 300);
            return () => clearTimeout(timer);
        }, [meal]);

        const recommendations = React.useMemo(() => {
            if (!MO) return [];
            return MO.getMealOptimization({
                meal: debouncedMeal,
                mealTotals: totals,
                dayData,
                profile,
                products,
                pIndex,
                avgGI: totals?.gi || 50
            });
        }, [debouncedMeal, totals, dayData, profile, products, pIndex]);

        const visibleRecs = React.useMemo(() => {
            if (!MO) return [];
            const filtered = recommendations.filter(r => !MO.shouldHideRecommendation(r.id));

            const seen = new Map();
            filtered.forEach(r => {
                const key = r.title.toLowerCase().trim();
                if (!seen.has(key) || (seen.get(key).priority || 0) < (r.priority || 0)) {
                    seen.set(key, r);
                }
            });
            const deduped = Array.from(seen.values());

            return deduped.sort((a, b) => {
                if (a.isWarning && !b.isWarning) return -1;
                if (!a.isWarning && b.isWarning) return 1;
                const aHasProds = (a.products?.length || 0) > 0 ? 1 : 0;
                const bHasProds = (b.products?.length || 0) > 0 ? 1 : 0;
                if (aHasProds !== bHasProds) return bHasProds - aHasProds;
                return (b.priority || 50) - (a.priority || 50);
            });
        }, [recommendations]);

        const handleAddProduct = React.useCallback((product, ruleId) => {
            if (!addProductToMeal || !product || !MO) return;

            const portion = MO.getSmartPortion(product);
            const productWithGrams = { ...product, grams: portion.grams };

            addProductToMeal(mealIndex, productWithGrams);

            MO.trackUserAction({
                type: 'accept',
                ruleId,
                productId: product.id,
                productName: product.name
            });
        }, [addProductToMeal, mealIndex]);

        const handleDismiss = React.useCallback((ruleId) => {
            if (!MO) return;
            MO.trackUserAction({
                type: 'dismiss',
                ruleId
            });
        }, []);

        if (visibleRecs.length === 0) return null;

        const bestRec = visibleRecs[0];
        const restRecs = visibleRecs.slice(1);

        return React.createElement('div', {
            className: 'meal-optimizer' + (optExpanded ? ' meal-optimizer--expanded' : '')
        },
            React.createElement('div', {
                className: 'meal-optimizer__header',
                onClick: () => restRecs.length > 0 && setOptExpanded(!optExpanded)
            },
                React.createElement('span', { className: 'meal-optimizer__header-icon' }, bestRec.icon),
                React.createElement('div', { className: 'meal-optimizer__header-text' },
                    React.createElement('div', { className: 'meal-optimizer__header-title' }, bestRec.title),
                    React.createElement('div', { className: 'meal-optimizer__header-reason' }, bestRec.reason)
                ),
                React.createElement('div', { className: 'meal-optimizer__header-right' },
                    restRecs.length > 0 && React.createElement('span', { className: 'meal-optimizer__badge' },
                        '+' + restRecs.length
                    ),
                    restRecs.length > 0 && React.createElement('span', {
                        className: 'meal-optimizer__toggle' + (optExpanded ? ' meal-optimizer__toggle--expanded' : '')
                    }, '▼'),
                    React.createElement('button', {
                        className: 'meal-optimizer__dismiss',
                        onClick: (e) => { e.stopPropagation(); handleDismiss(bestRec.id); },
                        title: 'Скрыть'
                    }, '×')
                )
            ),

            bestRec.products && bestRec.products.length > 0 && React.createElement('div', { className: 'meal-optimizer__products' },
                bestRec.products.map((prod, pIdx) =>
                    React.createElement('button', {
                        key: prod.id || pIdx,
                        className: 'meal-optimizer__product',
                        onClick: (e) => { e.stopPropagation(); handleAddProduct(prod, bestRec.id); },
                        title: `Добавить ${prod.name}`
                    },
                        React.createElement('span', { className: 'meal-optimizer__product-name' }, prod.name),
                        prod.smartPortion && React.createElement('span', { className: 'meal-optimizer__product-portion' }, prod.smartPortion.label),
                        React.createElement('span', { className: 'meal-optimizer__product-add' }, '+')
                    )
                )
            ),

            optExpanded && restRecs.length > 0 && React.createElement('div', { className: 'meal-optimizer__content' },
                restRecs.map((rec) =>
                    React.createElement('div', {
                        key: rec.id,
                        className: 'meal-optimizer__item'
                            + (rec.isWarning ? ' meal-optimizer__item--warning' : '')
                            + (rec.isInfo ? ' meal-optimizer__item--info' : '')
                    },
                        React.createElement('div', { className: 'meal-optimizer__item-header' },
                            React.createElement('span', { className: 'meal-optimizer__item-icon' }, rec.icon),
                            React.createElement('div', { className: 'meal-optimizer__item-content' },
                                React.createElement('div', { className: 'meal-optimizer__item-title' }, rec.title),
                                React.createElement('div', { className: 'meal-optimizer__item-reason' }, rec.reason),
                                rec.science && React.createElement('div', { className: 'meal-optimizer__item-science' }, rec.science)
                            ),
                            React.createElement('button', {
                                className: 'meal-optimizer__item-dismiss',
                                onClick: (e) => { e.stopPropagation(); handleDismiss(rec.id); },
                                title: 'Больше не показывать'
                            }, '×')
                        ),

                        rec.products && rec.products.length > 0 && React.createElement('div', { className: 'meal-optimizer__products' },
                            rec.products.map((prod, pIdx) =>
                                React.createElement('button', {
                                    key: prod.id || pIdx,
                                    className: 'meal-optimizer__product',
                                    onClick: (e) => { e.stopPropagation(); handleAddProduct(prod, rec.id); },
                                    title: `Добавить ${prod.name}`
                                },
                                    React.createElement('span', { className: 'meal-optimizer__product-name' }, prod.name),
                                    prod.smartPortion && React.createElement('span', { className: 'meal-optimizer__product-portion' }, prod.smartPortion.label),
                                    React.createElement('span', { className: 'meal-optimizer__product-add' }, '+')
                                )
                            )
                        )
                    )
                )
            )
        );
    });

    HEYS.dayMealOptimizerSection = {
        MealOptimizerSection
    };
})(window);
// ===== End heys_day_meal_optimizer_section.js =====

// ===== Begin day/_meals.js =====
;// day/_meals.js — consolidated DayTab meals modules (card/list/display/chart/state/handlers)

; (function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const trackError = (err, context) => {
        if (HEYS.analytics?.trackError) {
            HEYS.analytics.trackError(err, context);
        }
    };

    // =========================
    // MealCard
    // =========================
    const U = HEYS.dayUtils || {};
    const getProductFromItem = U.getProductFromItem || (() => null);
    const formatMealTime = U.formatMealTime || ((time) => time);
    const MEAL_TYPES = U.MEAL_TYPES || {};
    const per100 = U.per100 || (() => ({
        kcal100: 0,
        carbs100: 0,
        prot100: 0,
        fat100: 0,
        simple100: 0,
        complex100: 0,
        bad100: 0,
        good100: 0,
        trans100: 0,
        fiber100: 0,
    }));
    const scale = U.scale || ((v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10);

    const M = HEYS.models || {};
    const { LazyPhotoThumb } = HEYS.dayGallery || {};
    const { getMealQualityScore, getNutrientColor, getNutrientTooltip } = HEYS.mealScoring || {};
    const { PopupCloseButton } = HEYS.dayPopups || {};
    const MealOptimizerSection = HEYS.dayMealOptimizerSection?.MealOptimizerSection;

    function fmtVal(key, v) {
        if (v == null || v === '') return '-';
        const num = +v || 0;
        if (key === 'harm') return Math.round(num * 10) / 10;
        if (!num) return '-';
        return Math.round(num);
    }

    const harmMissingLogged = new Set();
    function logMissingHarm(name, item, source) {
        if (!HEYS.analytics?.trackDataOperation) return;
        const key = `${source || 'meal-card'}:${(name || 'unknown').toLowerCase()}`;
        if (harmMissingLogged.has(key)) return;
        harmMissingLogged.add(key);
        HEYS.analytics.trackDataOperation('harm_missing_in_meal_card', {
            source: source || 'meal-card',
            name: name || null,
            productId: item?.product_id ?? item?.productId ?? item?.id ?? null,
            hasItemHarm: HEYS.models?.normalizeHarm?.(item) != null,
        });
    }

    const MEAL_HEADER_META = [
        { label: 'Название<br>продукта' },
        { label: 'г' },
        { label: 'ккал<br>/100', per100: true },
        { label: 'У<br>/100', per100: true },
        { label: 'Прост<br>/100', per100: true },
        { label: 'Сл<br>/100', per100: true },
        { label: 'Б<br>/100', per100: true },
        { label: 'Ж<br>/100', per100: true },
        { label: 'ВрЖ<br>/100', per100: true },
        { label: 'ПЖ<br>/100', per100: true },
        { label: 'ТрЖ<br>/100', per100: true },
        { label: 'Клетч<br>/100', per100: true },
        { label: 'ГИ' },
        { label: 'Вред' },
        { label: '' },
    ];

    function getMealType(mealIndex, meal, allMeals, pIndex) {
        const time = meal?.time || '';
        const hour = parseInt(time.split(':')[0]) || 12;

        if (hour >= 6 && hour < 11) return { type: 'breakfast', label: 'Завтрак', emoji: '🌅' };
        if (hour >= 11 && hour < 16) return { type: 'lunch', label: 'Обед', emoji: '🌞' };
        if (hour >= 16 && hour < 21) return { type: 'dinner', label: 'Ужин', emoji: '🌆' };
        return { type: 'snack', label: 'Перекус', emoji: '🍎' };
    }

    const MealCard = React.memo(function MealCard({
        meal,
        mealIndex,
        displayIndex,
        products,
        pIndex,
        date,
        setDay,
        isMobile,
        isExpanded,
        onToggleExpand,
        onChangeMealType,
        onChangeTime,
        onChangeMood,
        onChangeWellbeing,
        onChangeStress,
        onRemoveMeal,
        openEditGramsModal,
        openTimeEditor,
        openMoodEditor,
        setGrams,
        removeItem,
        isMealStale,
        allMeals,
        isNewItem,
        optimum,
        setMealQualityPopup,
        addProductToMeal,
        dayData,
        profile,
        insulinWaveData: insulinWaveDataProp,
    }) {
        const MealAddProduct = HEYS.dayComponents?.MealAddProduct;
        const ProductRow = HEYS.dayComponents?.ProductRow;
        if (!MealAddProduct || !ProductRow) {
            trackError(new Error('[HEYS Day Meals] Meal components not loaded'), {
                source: 'day/_meals.js',
                type: 'missing_dependency',
                missing: {
                    MealAddProduct: !MealAddProduct,
                    ProductRow: !ProductRow,
                },
            });
            return React.createElement('div', {
                className: 'card tone-slate meal-card widget-shadow-diary-glass widget-outline-diary-glass',
                style: { padding: '12px', marginTop: '8px' },
            }, 'Загрузка...');
        }
        const headerMeta = MEAL_HEADER_META;
        function mTotals(m) {
            const t = (M.mealTotals ? M.mealTotals(m, pIndex) : {
                kcal: 0,
                carbs: 0,
                simple: 0,
                complex: 0,
                prot: 0,
                fat: 0,
                bad: 0,
                good: 0,
                trans: 0,
                fiber: 0,
            });
            let gSum = 0;
            let giSum = 0;
            let harmSum = 0;
            (m.items || []).forEach((it) => {
                const p = getProductFromItem(it, pIndex);
                if (!p) return;
                const g = +it.grams || 0;
                if (!g) return;
                const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
                // Use centralized harm normalization with fallback to item
                const harm = HEYS.models?.normalizeHarm?.(p) ?? HEYS.models?.normalizeHarm?.(it);
                gSum += g;
                if (gi != null) giSum += gi * g;
                if (harm != null) harmSum += harm * g;
            });
            t.gi = gSum ? giSum / gSum : 0;
            t.harm = gSum ? harmSum / gSum : 0;
            return t;
        }
        const totals = mTotals(meal);
        const manualType = meal.mealType;
        const autoTypeInfo = getMealType(mealIndex, meal, allMeals, pIndex);
        const mealTypeInfo = manualType && U.MEAL_TYPES && U.MEAL_TYPES[manualType]
            ? { type: manualType, ...U.MEAL_TYPES[manualType] }
            : autoTypeInfo;

        const changeMealType = (newType) => {
            onChangeMealType(mealIndex, newType);
        };
        const timeDisplay = U.formatMealTime ? U.formatMealTime(meal.time) : (meal.time || '');
        const mealKcal = Math.round(totals.kcal || 0);
        const isStale = isMealStale(meal);
        const isCurrentMeal = displayIndex === 0 && !isStale;

        const mealActivityContext = React.useMemo(() => {
            if (!HEYS.InsulinWave?.calculateActivityContext) return null;
            if (!dayData?.trainings || dayData.trainings.length === 0) return null;
            if (!meal?.time || !meal?.items?.length) return null;

            const mealTotals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0 };
            return HEYS.InsulinWave.calculateActivityContext({
                mealTime: meal.time,
                mealKcal: mealTotals.kcal || 0,
                trainings: dayData.trainings,
                householdMin: dayData.householdMin || 0,
                steps: dayData.steps || 0,
                allMeals: allMeals,
            });
        }, [meal?.time, meal?.items, dayData?.trainings, dayData?.householdMin, dayData?.steps, allMeals, pIndex]);

        const mealQuality = React.useMemo(() => {
            if (!meal?.items || meal.items.length === 0) return null;
            return getMealQualityScore(meal, mealTypeInfo.type, optimum || 2000, pIndex, mealActivityContext);
        }, [meal?.items, mealTypeInfo.type, optimum, pIndex, mealActivityContext]);

        const qualityLineColor = mealQuality
            ? mealQuality.color
            : (meal?.items?.length > 0 ? '#9ca3af' : 'transparent');

        const mealCardClass = isCurrentMeal
            ? 'card tone-green meal-card meal-card--current widget-shadow-diary-glass widget-outline-diary-glass'
            : 'card tone-slate meal-card widget-shadow-diary-glass widget-outline-diary-glass';
        const mealCardStyle = {
            marginTop: '8px',
            width: '100%',
            position: 'relative',
            paddingLeft: '12px',
        };
        const computeDerivedProductFn = M.computeDerivedProduct || ((prod) => prod || {});

        const InsulinWave = HEYS.InsulinWave || {};
        const IWUtils = InsulinWave.utils || {};
        const insulinWaveData = insulinWaveDataProp || {};
        const waveHistorySorted = React.useMemo(() => {
            const list = insulinWaveData.waveHistory || [];
            if (!IWUtils.normalizeToHeysDay) return [...list].sort((a, b) => a.startMin - b.startMin);
            return [...list].sort((a, b) => IWUtils.normalizeToHeysDay(a.startMin) - IWUtils.normalizeToHeysDay(b.startMin));
        }, [insulinWaveData.waveHistory]);

        const currentWaveIndex = React.useMemo(() => waveHistorySorted.findIndex((w) => w.time === meal.time), [waveHistorySorted, meal.time]);
        const currentWave = currentWaveIndex >= 0 ? waveHistorySorted[currentWaveIndex] : null;
        const prevWave = currentWaveIndex > 0 ? waveHistorySorted[currentWaveIndex - 1] : null;
        const nextWave = (currentWaveIndex >= 0 && currentWaveIndex < waveHistorySorted.length - 1) ? waveHistorySorted[currentWaveIndex + 1] : null;
        const hasOverlapWithNext = currentWave && nextWave ? currentWave.endMin > nextWave.startMin : false;
        const hasOverlapWithPrev = currentWave && prevWave ? prevWave.endMin > currentWave.startMin : false;
        const hasAnyOverlap = hasOverlapWithNext || hasOverlapWithPrev;
        const lipolysisGapNext = currentWave && nextWave ? Math.max(0, nextWave.startMin - currentWave.endMin) : 0;
        const overlapMinutes = hasOverlapWithNext
            ? currentWave.endMin - nextWave.startMin
            : hasOverlapWithPrev
                ? prevWave.endMin - currentWave.startMin
                : 0;
        const [waveExpanded, setWaveExpanded] = React.useState(true);
        const [showWaveCalcPopup, setShowWaveCalcPopup] = React.useState(false);
        const showWaveButton = !!(currentWave && meal.time && (meal.items || []).length > 0);
        const formatMinutes = React.useCallback((mins) => {
            if (IWUtils.formatDuration) return IWUtils.formatDuration(mins);
            return `${Math.max(0, Math.round(mins))}м`;
        }, [IWUtils.formatDuration]);

        const toggleWave = React.useCallback(() => {
            const newState = !waveExpanded;
            setWaveExpanded(newState);
            if (HEYS.dayUtils?.haptic) HEYS.dayUtils.haptic('light');
            if (HEYS.analytics?.trackDataOperation) {
                HEYS.analytics.trackDataOperation('insulin_wave_meal_expand', {
                    action: newState ? 'open' : 'close',
                    hasOverlap: hasAnyOverlap,
                    overlapMinutes,
                    lipolysisGap: lipolysisGapNext,
                    mealIndex,
                });
            }
        }, [waveExpanded, hasAnyOverlap, overlapMinutes, lipolysisGapNext, mealIndex]);

        const getMoodEmoji = (v) =>
            v <= 0 ? null : v <= 2 ? '😢' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '😊' : '😄';
        const getWellbeingEmoji = (v) =>
            v <= 0 ? null : v <= 2 ? '🤒' : v <= 4 ? '😓' : v <= 6 ? '😐' : v <= 8 ? '💪' : '🏆';
        const getStressEmoji = (v) =>
            v <= 0 ? null : v <= 2 ? '😌' : v <= 4 ? '🙂' : v <= 6 ? '😐' : v <= 8 ? '😟' : '😰';

        const moodVal = +meal.mood || 0;
        const wellbeingVal = +meal.wellbeing || 0;
        const stressVal = +meal.stress || 0;
        const moodEmoji = getMoodEmoji(moodVal);
        const wellbeingEmoji = getWellbeingEmoji(wellbeingVal);
        const stressEmoji = getStressEmoji(stressVal);
        const hasRatings = moodVal > 0 || wellbeingVal > 0 || stressVal > 0;

        const [optimizerPopupOpen, setOptimizerPopupOpen] = React.useState(false);
        const [totalsExpanded, setTotalsExpanded] = React.useState(false);

        const optimizerRecsCount = React.useMemo(() => {
            const MO = HEYS.MealOptimizer;
            if (!MO || !meal?.items?.length) return 0;

            const recommendations = MO.getMealOptimization({
                meal,
                mealTotals: totals,
                dayData: dayData || {},
                profile: profile || {},
                products: products || [],
                pIndex,
                avgGI: totals?.gi || 50,
            });

            const filtered = recommendations.filter((r) => !MO.shouldHideRecommendation(r.id));

            const seen = new Set();
            return filtered.filter((r) => {
                const key = r.title.toLowerCase().trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).length;
        }, [meal, totals, dayData, profile, products, pIndex]);

        return React.createElement('div', {
            className: mealCardClass,
            'data-meal-index': mealIndex,
            'data-meal-id': meal?.id || '',
            'data-meal-time': meal?.time || '',
            style: mealCardStyle,
        },
            qualityLineColor !== 'transparent' && React.createElement('div', {
                className: 'meal-quality-line',
                style: {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '5px',
                    borderRadius: '12px 0 0 12px',
                    background: qualityLineColor,
                    transition: 'background 0.3s ease',
                },
            }),
            React.createElement('div', {
                className: 'meal-header-inside meal-type-' + mealTypeInfo.type,
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    background: qualityLineColor !== 'transparent'
                        ? qualityLineColor + '1F'
                        : undefined,
                    borderRadius: '10px 10px 0 0',
                    margin: '-12px -12px 8px -4px',
                    padding: '12px 16px 12px 8px',
                },
            },
                timeDisplay && React.createElement('span', {
                    className: 'meal-time-badge-inside',
                    onClick: () => openTimeEditor(mealIndex),
                    title: 'Изменить время',
                    style: { fontSize: '15px', padding: '6px 14px', fontWeight: '700', flexShrink: 0 },
                }, timeDisplay),
                React.createElement('div', { className: 'meal-type-wrapper', style: { flex: 1, display: 'flex', justifyContent: 'center' } },
                    React.createElement('span', { className: 'meal-type-label', style: { fontSize: '16px', fontWeight: '700', padding: '4px 12px' } },
                        mealTypeInfo.icon + ' ' + mealTypeInfo.name,
                        React.createElement('span', { className: 'meal-type-arrow' }, ' ▾'),
                    ),
                    React.createElement('select', {
                        className: 'meal-type-select',
                        value: manualType || '',
                        onChange: (e) => {
                            changeMealType(e.target.value || null);
                        },
                        title: 'Изменить тип приёма',
                    }, [
                        { value: '', label: '🔄 Авто' },
                        { value: 'breakfast', label: '🍳 Завтрак' },
                        { value: 'snack1', label: '🍎 Перекус' },
                        { value: 'lunch', label: '🍲 Обед' },
                        { value: 'snack2', label: '🥜 Перекус' },
                        { value: 'dinner', label: '🍽️ Ужин' },
                        { value: 'snack3', label: '🧀 Перекус' },
                        { value: 'night', label: '🌙 Ночной' },
                    ].map((opt) =>
                        React.createElement('option', { key: opt.value, value: opt.value }, opt.label),
                    )),
                ),
                React.createElement('span', { className: 'meal-kcal-badge-inside', style: { fontSize: '15px', padding: '6px 14px', flexShrink: 0 } },
                    mealKcal > 0 ? (mealKcal + ' ккал') : '0 ккал',
                ),
                currentWave && currentWave.activityContext && React.createElement('span', {
                    className: 'activity-context-badge',
                    title: currentWave.activityContext.desc,
                    style: {
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        background: currentWave.activityContext.type === 'peri' ? '#22c55e33'
                            : currentWave.activityContext.type === 'post' ? '#3b82f633'
                                : currentWave.activityContext.type === 'pre' ? '#eab30833'
                                    : '#6b728033',
                        color: currentWave.activityContext.type === 'peri' ? '#16a34a'
                            : currentWave.activityContext.type === 'post' ? '#2563eb'
                                : currentWave.activityContext.type === 'pre' ? '#ca8a04'
                                    : '#374151',
                        fontWeight: '600',
                        flexShrink: 0,
                        marginLeft: '4px',
                        whiteSpace: 'nowrap',
                    },
                }, currentWave.activityContext.badge || ''),
            ),
            mealActivityContext && mealActivityContext.type !== 'none' && (meal.items || []).length === 0
            && React.createElement('div', {
                className: 'training-context-hint',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    margin: '0 -4px 8px -4px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    lineHeight: '1.4',
                    background: mealActivityContext.type === 'peri' ? 'linear-gradient(135deg, #22c55e15, #22c55e25)'
                        : mealActivityContext.type === 'post' ? 'linear-gradient(135deg, #3b82f615, #3b82f625)'
                            : mealActivityContext.type === 'pre' ? 'linear-gradient(135deg, #eab30815, #eab30825)'
                                : 'linear-gradient(135deg, #6b728015, #6b728025)',
                    border: mealActivityContext.type === 'peri' ? '1px solid #22c55e40'
                        : mealActivityContext.type === 'post' ? '1px solid #3b82f640'
                            : mealActivityContext.type === 'pre' ? '1px solid #eab30840'
                                : '1px solid #6b728040',
                    color: mealActivityContext.type === 'peri' ? '#16a34a'
                        : mealActivityContext.type === 'post' ? '#2563eb'
                            : mealActivityContext.type === 'pre' ? '#ca8a04'
                                : '#374151',
                },
            },
                React.createElement('span', { style: { fontSize: '18px' } }, mealActivityContext.badge || '🏋️'),
                React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px' } },
                        mealActivityContext.type === 'peri' ? '🔥 Топливо для тренировки!'
                            : mealActivityContext.type === 'post' ? '💪 Анаболическое окно!'
                                : mealActivityContext.type === 'pre' ? '⚡ Скоро тренировка!'
                                    : mealActivityContext.type === 'steps' ? '👟 Активный день!'
                                        : mealActivityContext.type === 'double' ? '🏆 Двойная тренировка!'
                                            : '🎯 Хорошее время!'
                    ),
                    React.createElement('div', { style: { opacity: 0.85, fontSize: '12px' } },
                        mealActivityContext.type === 'peri'
                            ? 'Еда пойдёт в энергию, а не в жир. Вред снижен на ' + Math.round((1 - (mealActivityContext.harmMultiplier || 1)) * 100) + '%'
                            : mealActivityContext.type === 'post'
                                ? 'Нутриенты усвоятся в мышцы. Отличное время для белка!'
                                : mealActivityContext.type === 'pre'
                                    ? 'Лёгкие углеводы дадут энергию для тренировки'
                                    : mealActivityContext.type === 'steps'
                                        ? 'Высокая активность улучшает метаболизм'
                                        : mealActivityContext.type === 'double'
                                            ? 'Двойная нагрузка — можно есть смелее!'
                                            : 'Инсулиновая волна будет короче'
                    ),
                ),
            ),
            React.createElement('div', { className: 'row desktop-add-product', style: { justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('div', { className: 'section-title' }, 'Добавить продукт'),
                React.createElement('div', { className: 'aps-open-buttons' },
                    React.createElement(MealAddProduct, {
                        mi: mealIndex,
                        products,
                        date,
                        setDay,
                        isCurrentMeal,
                        buttonText: 'Быстро добавить 1 продукт',
                        buttonIcon: '⚡',
                        buttonClassName: 'aps-open-btn--quick',
                        highlightCurrent: false,
                        ariaLabel: 'Быстро добавить 1 продукт'
                    }),
                    React.createElement(MealAddProduct, {
                        mi: mealIndex,
                        products,
                        date,
                        setDay,
                        isCurrentMeal,
                        multiProductMode: true,
                        buttonText: 'Добавить несколько продуктов',
                        buttonIcon: '➕',
                        buttonClassName: 'aps-open-btn--multi',
                        highlightCurrent: true,
                        ariaLabel: 'Добавить несколько продуктов'
                    }),
                ),
            ),
            React.createElement('div', { style: { overflowX: 'auto', marginTop: '8px' } }, React.createElement('table', { className: 'tbl meals-table' },
                React.createElement('thead', null, React.createElement('tr', null, headerMeta.map((h, i) => React.createElement('th', {
                    key: 'h' + i,
                    className: h.per100 ? 'per100-col' : undefined,
                    dangerouslySetInnerHTML: { __html: h.label },
                })))),
                React.createElement('tbody', null,
                    (meal.items || []).map((it) => React.createElement(ProductRow, {
                        key: it.id,
                        item: it,
                        mealIndex,
                        isNew: isNewItem(it.id),
                        pIndex,
                        setGrams,
                        removeItem,
                    })),
                    React.createElement('tr', { className: 'tr-sum' },
                        React.createElement('td', { className: 'fw-600' }, ''),
                        React.createElement('td', null, ''),
                        React.createElement('td', { colSpan: 10 }, React.createElement('div', { className: 'table-divider' })),
                        React.createElement('td', null, fmtVal('kcal', totals.kcal)),
                        React.createElement('td', null, fmtVal('carbs', totals.carbs)),
                        React.createElement('td', null, fmtVal('simple', totals.simple)),
                        React.createElement('td', null, fmtVal('complex', totals.complex)),
                        React.createElement('td', null, fmtVal('prot', totals.prot)),
                        React.createElement('td', null, fmtVal('fat', totals.fat)),
                        React.createElement('td', null, fmtVal('bad', totals.bad)),
                        React.createElement('td', null, fmtVal('good', totals.good)),
                        React.createElement('td', null, fmtVal('trans', totals.trans)),
                        React.createElement('td', null, fmtVal('fiber', totals.fiber)),
                        React.createElement('td', null, fmtVal('gi', totals.gi)),
                        React.createElement('td', null, fmtVal('harm', totals.harm)),
                        React.createElement('td', null, ''),
                    ),
                ),
            )),
            React.createElement('div', { className: 'mobile-products-list' },
                React.createElement('div', { className: 'mpc-toggle-add-row' + ((meal.items || []).length === 0 ? ' single' : '') },
                    (meal.items || []).length > 0 && React.createElement('div', {
                        className: 'mpc-products-toggle' + (isExpanded ? ' expanded' : ''),
                        onClick: () => onToggleExpand(mealIndex, allMeals),
                    },
                        React.createElement('span', { className: 'toggle-arrow' }, '›'),
                        React.createElement('span', { className: 'mpc-toggle-text' },
                            React.createElement('span', { className: 'mpc-toggle-title' }, isExpanded ? 'Свернуть' : 'Развернуть'),
                            React.createElement('span', { className: 'mpc-toggle-count' },
                                (meal.items || []).length + ' продукт' + ((meal.items || []).length === 1 ? '' : (meal.items || []).length < 5 ? 'а' : 'ов'),
                            ),
                        ),
                    ),
                    React.createElement('div', { className: 'aps-open-buttons' },
                        React.createElement(MealAddProduct, {
                            mi: mealIndex,
                            products,
                            date,
                            setDay,
                            isCurrentMeal,
                            buttonText: 'Быстро добавить 1 продукт',
                            buttonIcon: '⚡',
                            buttonClassName: 'aps-open-btn--quick',
                            highlightCurrent: false,
                            ariaLabel: 'Быстро добавить 1 продукт'
                        }),
                        React.createElement(MealAddProduct, {
                            mi: mealIndex,
                            products,
                            date,
                            setDay,
                            isCurrentMeal,
                            multiProductMode: true,
                            buttonText: 'Добавить несколько продуктов',
                            buttonIcon: '➕',
                            buttonClassName: 'aps-open-btn--multi',
                            highlightCurrent: true,
                            ariaLabel: 'Добавить несколько продуктов'
                        }),
                    ),
                ),
                isExpanded && (meal.items || []).map((it) => {
                    const p = getProductFromItem(it, pIndex) || { name: it.name || '?' };
                    const G = +it.grams || 0;
                    const per = per100(p);
                    const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? it.gi;
                    // Use centralized harm normalization with fallback to item
                    const harmVal = HEYS.models?.normalizeHarm?.(p) ?? HEYS.models?.normalizeHarm?.(it);

                    if (harmVal == null) {
                        logMissingHarm(p.name, it, 'mobile-card');
                    }

                    if (harmVal == null) {
                        logMissingHarm(p.name, it, 'mobile-card-compact');
                    }

                    const gramsClass = G > 500 ? 'grams-danger' : G > 300 ? 'grams-warn' : '';

                    const getHarmBg = (h) => {
                        if (h == null) return '#fff';
                        if (h <= 1) return '#34d399';
                        if (h <= 2) return '#6ee7b7';
                        if (h <= 3) return '#a7f3d0';
                        if (h <= 4) return '#d1fae5';
                        if (h <= 5) return '#bae6fd';
                        if (h <= 6) return '#e0f2fe';
                        if (h <= 7) return '#fecaca';
                        if (h <= 8) return '#fee2e2';
                        if (h <= 9) return '#fecdd3';
                        return '#f87171';
                    };
                    const harmBg = getHarmBg(harmVal);

                    const getHarmBadge = (h) => {
                        if (h == null) return null;
                        if (h <= 2) return { emoji: '🌿', text: 'полезный', color: '#059669' };
                        if (h >= 8) return { emoji: '⚠️', text: 'вредный', color: '#dc2626' };
                        return null;
                    };
                    const harmBadge = getHarmBadge(harmVal);

                    const getCategoryIcon = (cat) => {
                        if (!cat) return null;
                        const c = cat.toLowerCase();
                        if (c.includes('молоч') || c.includes('сыр') || c.includes('творог')) return '🥛';
                        if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говя') || c.includes('свин')) return '🍖';
                        if (c.includes('рыб') || c.includes('морепр')) return '🐟';
                        if (c.includes('овощ') || c.includes('салат') || c.includes('зелен')) return '🥬';
                        if (c.includes('фрукт') || c.includes('ягод')) return '🍎';
                        if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('выпеч')) return '🌾';
                        if (c.includes('яйц')) return '🥚';
                        if (c.includes('орех') || c.includes('семеч')) return '🥜';
                        if (c.includes('масл')) return '🫒';
                        if (c.includes('напит') || c.includes('сок') || c.includes('кофе') || c.includes('чай')) return '🥤';
                        if (c.includes('сладк') || c.includes('десерт') || c.includes('конфет') || c.includes('шокол')) return '🍬';
                        if (c.includes('соус') || c.includes('специ') || c.includes('припра')) return '🧂';
                        return '🍽️';
                    };
                    const categoryIcon = getCategoryIcon(p.category);

                    const findAlternative = (prod, allProducts) => {
                        // Smart Alternative v1.0: semantic category + macro similarity + multi-factor scoring
                        const _LOG = '[HEYS.prodRec]';
                        if (!allProducts || allProducts.length < 2) {
                            console.info(_LOG, '⛔ skip: allProducts empty or single', { product: prod?.name, poolSize: allProducts?.length });
                            return null;
                        }
                        const currentKcal = per.kcal100 || 0;
                        if (currentKcal < 50) {
                            console.info(_LOG, '⛔ skip: product kcal too low (< 50)', { product: prod?.name, kcal: currentKcal });
                            return null;
                        }

                        console.info(_LOG, '🔍 START findAlternative', {
                            product: prod.name,
                            kcal: currentKcal,
                            prot: per.prot100 || 0,
                            carbs: per.carbs100 || 0,
                            fat: per.fat100 || 0,
                            harm: prod.harm ?? harmVal ?? 0,
                            gi: prod.gi ?? 50,
                            fiber: per.fiber100 || 0,
                            category: prod.category || '—',
                            poolSize: allProducts.length,
                        });

                        // Actual calories consumed at the real portion the user ate (G = grams from closure)
                        // Early harm eval — needed for good-product guard (#6) and harm-only fallback (#4)
                        const origHarm = prod.harm ?? harmVal ?? 0;
                        // #6 Guard: product already good — no value in recommending a swap
                        if (origHarm <= 1 && currentKcal <= 200) {
                            console.info(_LOG, '⛔ skip: product already good (harm≤1 + kcal≤200)', { product: prod.name, harm: origHarm, kcal: currentKcal });
                            return null;
                        }
                        const actualCurrentKcal = Math.round(currentKcal * G / 100);
                        // Tiny portion guard: swapping < 20g serving is nonsensical (e.g. 11g almonds)
                        if (G > 0 && G < 20) {
                            console.info(_LOG, '⛔ skip: portion too small (< 20г) — swap makes no sense', { product: prod?.name, grams: G, actualKcal: actualCurrentKcal });
                            return null;
                        }
                        // Helper: typical portion (grams) a person would eat of a given product
                        const getTypicalGrams = (altProd) => {
                            const sp = HEYS.MealOptimizer?.getSmartPortion?.(altProd);
                            return sp?.grams || 100;
                        };

                        // Semantic category detection (Product Picker if available, else keyword fallback)
                        const _detectCat = HEYS.InsightsPI?.productPicker?._internal?.detectCategory;
                        const _catSource = _detectCat ? 'ProductPicker' : 'keyword-fallback';
                        const getSemanticCat = (name, fallbackCat) => {
                            // Priority sub-categories — override ProductPicker for specific use-cases
                            const _n = (name || '').toLowerCase();
                            // Guard: "блюдо в майонезе" — майонез как ингредиент, а не соус сам по себе
                            // Note: '(в майонезе)' has '(' before 'в', not space — use includes without leading space
                            const _sauceAsIngredient = _n.includes('в майонезе') || _n.includes('с майонезом') ||
                                _n.includes('в кетчупе') || _n.includes('в горчиц') ||
                                _n.includes('в соусе') || _n.includes('с соусом');
                            if (!_sauceAsIngredient && (
                                _n.includes('майонез') || _n.includes('кетчуп') || _n.includes('горчиц') ||
                                _n.startsWith('соус') || _n.includes(' соус') || _n.includes('уксус') ||
                                _n.includes('заправк') || _n.includes('аджик') || _n.includes('хрен') ||
                                _n.includes('васаби') || _n.includes('песто') || _n.includes('тахини') ||
                                _n.includes('ткемали'))) return 'sauce';
                            if (_n.includes('шоколад') || _n.includes('мороженое') || _n.includes('пломбир') ||
                                _n.includes('сорбет') || _n.includes('тирамису') || _n.includes('торт') ||
                                _n.includes('пирожн') || _n.includes('вафл') || _n.includes('круасс') ||
                                _n.includes('суфле') || _n.includes('макарун') ||
                                _n.includes('сгущён') || _n.includes('пудинг') || _n.includes('конфет') ||
                                _n.includes('мармелад') || _n.includes('зефир') || _n.includes('халва') ||
                                _n.includes('варень') || _n.includes('джем') || _n.includes('нутелл') ||
                                _n.includes('карамел') || _n.includes('пастил') || _n.includes('трюфел')) return 'dessert_sweet';
                            if (_n.includes('колбас') || _n.includes('сосис') || _n.includes('сарделька') ||
                                _n.includes('ветчин') || _n.includes('бекон') || _n.includes('паштет') ||
                                _n.includes('сервелат') || _n.includes('буженин') || _n.includes('балык') ||
                                _n.includes('карбонад') || _n.includes('салями') || _n.includes('прошутто')) return 'processed_meat';
                            if (_n.includes('газировк') || _n.includes('кола') || _n.includes('лимонад') ||
                                _n.includes('компот') || _n.includes('морс') || _n.includes('нектар') ||
                                _n.includes('квас')) return 'drink';
                            if (_n.startsWith('масло ') || _n.includes(' масло ') ||
                                _n.includes('масло сливочн') || _n.includes('масло растительн') ||
                                _n.includes('масло оливков') || _n.includes('масло подсолнечн') ||
                                _n.includes('масло кокосов') || _n.includes('масло кунжутн') ||
                                _n.includes('масло льнян')) return 'oil';
                            // Grains: ProductPicker пропускает блины/оладьи/лепёшки/овсяные хлопья
                            if (_n.includes('блин') || _n.includes('оладь') || _n.includes('лепёшк') ||
                                _n.includes('пицц') || _n.includes('тортилья') || _n.includes('лаваш') ||
                                _n.startsWith('овсян') || _n.includes('овсяные') || _n.includes('овсяных')) return 'grains';
                            if (_detectCat) return _detectCat(name || '');
                            const c = (fallbackCat || name || '').toLowerCase();
                            if (c.includes('молоч') || c.includes('кефир') || c.includes('творог') || c.includes('йогур') || c.includes('сыр')) return 'dairy';
                            if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говяд') || c.includes('рыб') || c.includes('морепр') || c.includes('яйц')) return 'protein';
                            if (c.includes('овощ') || c.includes('фрукт') || c.includes('ягод') || c.includes('зелен') || c.includes('салат')) return 'vegetables';
                            if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('макарон')) return 'grains';
                            if (c.includes('орех') || c.includes('семеч') || c.includes('миндал') || c.includes('фундук')) return 'snacks';
                            return 'other';
                        };
                        const getGrainSubtype = (name) => {
                            const _n = (name || '').toLowerCase();
                            if (_n.includes('овсян') || _n.includes('каша') || _n.includes('мюсли') ||
                                _n.includes('гранол') || _n.includes('хлопь') || _n.includes('отруб')) return 'breakfast_grain';
                            if (_n.includes('блин') || _n.includes('оладь') || _n.includes('лепёшк') ||
                                _n.includes('тортилья') || _n.includes('лаваш') || _n.includes('пицц')) return 'flatbread_grain';
                            if (_n.includes('макарон') || _n.includes('паста') || _n.includes('лапша') ||
                                _n.includes('спагет')) return 'pasta_grain';
                            return 'generic_grain';
                        };
                        const getLateEveningPreparationPenalty = (name, scenario, semCat) => {
                            if (!(scenario === 'LATE_EVENING' || scenario === 'PRE_SLEEP')) return 0;
                            const _n = (name || '').toLowerCase();
                            const _isFried = _n.includes('жарен') || _n.includes('фритюр');
                            const _isDoughy = _n.includes('блин') || _n.includes('оладь') || _n.includes('пицц') ||
                                _n.includes('лаваш') || _n.includes('лепёшк') || _n.includes('тортилья');
                            if (_isFried) return -10;
                            if (_isDoughy && semCat === 'grains') return -8;
                            if (_isDoughy) return -5;
                            return 0;
                        };
                        const getFoodFormFactor = (name, semCat) => {
                            const _n = (name || '').toLowerCase();
                            const _isSpreadableToken =
                                semCat === 'sauce' || semCat === 'oil' ||
                                _n.includes('творожн') && _n.includes('сыр') ||
                                _n.includes('сливочн') && _n.includes('сыр') ||
                                _n.includes('крем-сыр') || _n.includes('плавлен') ||
                                _n.includes('намазк') || _n.includes('паштет') ||
                                _n.includes('хумус') || _n.includes('арахисов') && _n.includes('паста');
                            const _isDishToken =
                                _n.includes('ролл') || _n.includes('сэндвич') || _n.includes('бургер') ||
                                _n.includes('шаурм') || _n.includes('брускет') || _n.includes('суши') ||
                                _n.includes('суп') || _n.includes('котлет') || _n.includes('тефтел') ||
                                _n.includes('куриц') || _n.includes('индейк') || _n.includes('говядин') ||
                                _n.includes('свинин') || _n.includes('рыба') || _n.includes('лосос') ||
                                _n.includes('минтай') || _n.includes('салат') || _n.includes('запек') ||
                                _n.includes('туш') || _n.includes('шашлык') || _n.includes('плов') ||
                                _n.includes('омлет') || _n.includes('жаркое');
                            // В композитных блюдах (например, ролл с творожным сыром)
                            // spreadable ингредиент не должен определять форму всего продукта.
                            if (_isDishToken) return 'solid_meal';
                            if (_isSpreadableToken) return 'spreadable';
                            if (semCat === 'drink' || _n.includes('кефир') || _n.includes('йогурт пить')) return 'liquid';
                            return 'neutral';
                        };
                        // Dominant macro fallback: for products where semantic cat = 'other'
                        const getDominantMacro = (prot, carbs, fat, kcal) => {
                            if (!kcal || kcal < 1) return 'macro_mixed';
                            if ((prot * 3) / kcal >= 0.35) return 'macro_protein';
                            if ((fat * 9) / kcal >= 0.55) return 'macro_fat';
                            if ((carbs * 4) / kcal >= 0.50) return 'macro_carb';
                            return 'macro_mixed';
                        };
                        const origSemCat = getSemanticCat(prod.name, prod.category);
                        const origFormFactor = getFoodFormFactor(prod.name, origSemCat);
                        const origMacroCat = origSemCat === 'other'
                            ? getDominantMacro(per.prot100 || 0, per.carbs100 || 0, per.fat100 || 0, currentKcal)
                            : null;
                        const origGrainSubtype = origSemCat === 'grains' ? getGrainSubtype(prod.name) : null;

                        console.info(_LOG, '🏷️ category detection', {
                            catSource: _catSource,
                            semCat: origSemCat,
                            formFactor: origFormFactor,
                            macroCat: origMacroCat || '—',
                            grainSubtype: origGrainSubtype || '—',
                        });

                        // Candidate pool: client products + shared products (#8 try multiple access paths)
                        const _sharedList = (() => {
                            const _paths = [
                                HEYS.cloud?.getCachedSharedProducts?.(),
                                HEYS.products?.shared,
                                HEYS.products?.getShared?.(),
                                HEYS.products?.sharedProducts,
                                HEYS.products?.all?.filter?.((p) => p._shared || p.shared),
                            ];
                            for (const _p of _paths) {
                                if (Array.isArray(_p) && _p.length > 0) return _p;
                            }
                            return [];
                        })();
                        const _clientIds = new Set(allProducts.map((ap) => ap.id));
                        const candidatePool = [
                            ...allProducts.map((ap) => ({ ...ap, _familiar: true })),
                            ..._sharedList.filter((sp) => sp && sp.id && !_clientIds.has(sp.id)).map((sp) => ({ ...sp, _familiar: false })),
                        ];

                        console.info(_LOG, '📦 candidate pool built', {
                            clientProducts: allProducts.length,
                            sharedProducts: _sharedList.length,
                            totalPool: candidatePool.length,
                        });

                        // #3 Exclude ALL products already in this meal (other items in same sitting)
                        const _mealItemIds = new Set(
                            (meal?.items || []).map((mi) => mi.product_id || mi.id).filter(Boolean)
                        );
                        // #2 Adaptive noSaving threshold: low-kcal products need softer filter
                        const _noSavingThreshold = currentKcal < 200 ? 0.75 : 0.90;
                        // Filter: real food, category-compatible, meaningful saving
                        const _rejectLog = { selfMatch: 0, mealItem: 0, lowKcal: 0, lowMacro: 0, noSaving: 0, tooLowKcal: 0, wrongCat: 0, formMismatch: 0, grainSubtypeMismatch: 0, passed: 0 };
                        const candidates = candidatePool.filter((alt) => {
                            if (alt.id === prod.id) { _rejectLog.selfMatch++; return false; }
                            if (_mealItemIds.has(alt.id) || _mealItemIds.has(alt.product_id)) { _rejectLog.mealItem++; return false; }
                            const altDer = computeDerivedProductFn(alt);
                            const altKcal = alt.kcal100 || altDer.kcal100 || 0;
                            if (altKcal < 30) { _rejectLog.lowKcal++; return false; } // exclude supplements/spices/teas
                            const altMacroSum = (alt.prot100 || altDer.prot100 || 0)
                                + (alt.fat100 || altDer.fat100 || 0)
                                + ((alt.simple100 || 0) + (alt.complex100 || 0) || alt.carbs100 || altDer.carbs100 || 0);
                            if (altMacroSum < 5) { _rejectLog.lowMacro++; return false; } // not real food
                            if (altKcal >= currentKcal * _noSavingThreshold) { _rejectLog.noSaving++; return false; } // adaptive: 75% for <200kcal, 90% otherwise
                            if (altKcal < currentKcal * 0.15) { _rejectLog.tooLowKcal++; return false; } // guard: cap at 85% saving
                            const altSemCat = getSemanticCat(alt.name, alt.category);
                            const altFormFactor = getFoodFormFactor(alt.name, altSemCat);
                            if (origSemCat === 'grains' && origGrainSubtype === 'breakfast_grain') {
                                const altGrainSubtype = getGrainSubtype(alt.name);
                                if (altGrainSubtype === 'flatbread_grain') {
                                    _rejectLog.grainSubtypeMismatch++;
                                    return false;
                                }
                            }
                            if (origSemCat !== 'other') {
                                if (altSemCat !== origSemCat) { _rejectLog.wrongCat++; return false; }
                            } else {
                                const altMacroCat = getDominantMacro(
                                    alt.prot100 || altDer.prot100 || 0,
                                    alt.carbs100 || altDer.carbs100 || 0,
                                    alt.fat100 || altDer.fat100 || 0,
                                    altKcal,
                                );
                                if (origMacroCat !== 'macro_mixed' && altMacroCat !== 'macro_mixed' && origMacroCat !== altMacroCat) { _rejectLog.wrongCat++; return false; }
                            }
                            // Hard guard: spreadable products should only be replaced with spreadable products
                            if (origFormFactor === 'spreadable' && altFormFactor !== 'spreadable') {
                                _rejectLog.formMismatch++;
                                return false;
                            }
                            _rejectLog.passed++;
                            return true;
                        });

                        console.info(_LOG, '🔬 filter results', {
                            ..._rejectLog,
                            passedCandidates: candidates.map((c) => c.name),
                        });

                        if (candidates.length === 0) {
                            console.info(_LOG, '❌ no candidates after filter — no recommendation');
                            return null;
                        }

                        // Pre-compute original macro energy fractions
                        // origHarm already declared above (early guard section)
                        const origGI = prod.gi ?? 50;
                        const origProtEn = (per.prot100 || 0) * 3 / currentKcal;
                        const origCarbEn = (per.carbs100 || 0) * 4 / currentKcal;
                        const origFatEn = (per.fat100 || 0) * 9 / currentKcal;
                        const origFiber = per.fiber100 || 0;

                        // Build Product Picker scenario context (best effort)
                        let _pickerFn = null;
                        let _pickerScenario = null;
                        try {
                            _pickerFn = HEYS.InsightsPI?.productPicker?.calculateProductScore;
                            if (_pickerFn && meal?.time) {
                                const _mealHour = parseInt(meal.time.split(':')[0], 10);
                                _pickerScenario = {
                                    scenario: _mealHour >= 22 ? 'PRE_SLEEP' : _mealHour >= 20 ? 'LATE_EVENING' : 'BALANCED',
                                    remainingKcal: optimum ? Math.max(0, optimum - currentKcal) : 500,
                                    currentTime: _mealHour,
                                    targetProtein: profile?.targetProtein || 100,
                                    sugarDependencyRisk: false,
                                    fiberRegularityScore: 0.5,
                                    micronutrientDeficits: [],
                                    novaQualityScore: 0.5,
                                    targetGL: _mealHour >= 20 ? 10 : 20,
                                };
                                console.info(_LOG, '⚙️ ProductPicker scenario', _pickerScenario);
                            } else {
                                console.info(_LOG, '⚙️ ProductPicker unavailable — using neutral pickerScore=50', {
                                    hasFn: !!_pickerFn,
                                    mealTime: meal?.time || '—',
                                });
                            }
                        } catch (e) {
                            _pickerFn = null;
                            console.warn(_LOG, '⚠️ ProductPicker scenario build failed:', e?.message);
                        }

                        let best = null;
                        let bestComposite = -Infinity;
                        const scoredCandidates = [];
                        for (const alt of candidates) {
                            try {
                                const altDer = computeDerivedProductFn(alt);
                                const altKcal = alt.kcal100 || altDer.kcal100 || 1;
                                const altProt = alt.prot100 || altDer.prot100 || 0;
                                const altCarbs = alt.carbs100 || altDer.carbs100 || 0;
                                const altFat = alt.fat100 || altDer.fat100 || 0;
                                const altFiber = alt.fiber100 || altDer.fiber100 || 0;
                                const altGI = alt.gi ?? 50;
                                const altHarm = alt.harm ?? 0;
                                // 5. Portion-aware reality check: compare realistic serving calories
                                const typicalAltGrams = getTypicalGrams(alt);
                                const actualAltKcal = Math.round(altKcal * typicalAltGrams / 100);
                                const portionKcalRatio = actualAltKcal / Math.max(1, actualCurrentKcal);
                                // If replacement realistically means >50% more calories → skip entirely
                                if (portionKcalRatio > 1.5) {
                                    console.info(_LOG, '🚫 portion skip (would eat more kcal in real serving):', {
                                        name: alt.name,
                                        typicalAltGrams,
                                        actualAltKcal,
                                        vs: actualCurrentKcal,
                                        ratio: Math.round(portionKcalRatio * 100) + '%',
                                    });
                                    continue;
                                }
                                let portionPenalty = 0;
                                let portionMode = 'real_saving';
                                if (portionKcalRatio > 1.0) {
                                    portionPenalty = -10; // per-100g better but real serving ≈ same/more kcal
                                    portionMode = 'composition';
                                }
                                // 1. Macro similarity (0–100)
                                const macroSimilarity = Math.max(0,
                                    100
                                    - Math.abs(origProtEn - (altProt * 3 / altKcal)) * 150
                                    - Math.abs(origCarbEn - (altCarbs * 4 / altKcal)) * 100
                                    - Math.abs(origFatEn - (altFat * 9 / altKcal)) * 100,
                                );
                                // 2. Improvement: harm reduction + soft kcal saving + fiber
                                const savingPct = Math.round((1 - altKcal / currentKcal) * 100);
                                const harmImprov = Math.min(50, Math.max(-20, (origHarm - altHarm) * 15));
                                const fiberBonus = altFiber > origFiber + 1 ? 10 : 0;
                                const improvementScore = harmImprov + Math.min(35, savingPct * 0.45) + fiberBonus;
                                // 3. Familiarity bonus
                                const familiarBonus = alt._familiar ? 10 : 0;
                                // 3.1 Grains subtype bias: keep breakfast grains close to breakfast grains
                                const altSemCatForScore = getSemanticCat(alt.name, alt.category);
                                const altFormFactor = getFoodFormFactor(alt.name, altSemCatForScore);
                                const altGrainSubtype = origSemCat === 'grains' ? getGrainSubtype(alt.name) : null;
                                let grainSubtypeBonus = 0;
                                if (origGrainSubtype && altGrainSubtype) {
                                    if (origGrainSubtype === altGrainSubtype) {
                                        grainSubtypeBonus = 8;
                                    } else if (
                                        (origGrainSubtype === 'breakfast_grain' && altGrainSubtype === 'flatbread_grain') ||
                                        (origGrainSubtype === 'flatbread_grain' && altGrainSubtype === 'breakfast_grain')
                                    ) {
                                        grainSubtypeBonus = -12;
                                    } else {
                                        grainSubtypeBonus = -4;
                                    }
                                }
                                const eveningPrepPenalty = getLateEveningPreparationPenalty(
                                    alt.name,
                                    _pickerScenario?.scenario,
                                    altSemCatForScore,
                                );
                                let formFactorBonus = 0;
                                if (origFormFactor === 'spreadable' && altFormFactor !== 'spreadable') {
                                    formFactorBonus = altFormFactor === 'solid_meal' ? -24 : -12;
                                } else if (origFormFactor === altFormFactor && origFormFactor !== 'neutral') {
                                    formFactorBonus = 6;
                                }
                                // 4. Product Picker contextual score (optional)
                                // calculateProductScore returns { totalScore, breakdown } — extract number!
                                let pickerScore = 50;
                                if (_pickerFn && _pickerScenario) {
                                    try {
                                        const _pickerResult = _pickerFn({
                                            name: alt.name,
                                            macros: { protein: altProt, carbs: altCarbs, fat: altFat, kcal: altKcal },
                                            harm: altHarm, gi: altGI,
                                            category: getSemanticCat(alt.name, alt.category),
                                            familiarityScore: alt._familiar ? 7 : 3,
                                            fiber: altFiber, nova_group: alt.novaGroup || 2,
                                        }, _pickerScenario);
                                        // Return is always an object { totalScore, breakdown }
                                        pickerScore = typeof _pickerResult?.totalScore === 'number'
                                            ? _pickerResult.totalScore
                                            : (typeof _pickerResult === 'number' ? _pickerResult : 50);
                                    } catch (e) {
                                        console.warn(_LOG, '⚠️ pickerFn threw for', alt?.name, e?.message);
                                        pickerScore = 50;
                                    }
                                }
                                // Composite: productPicker 35% + macroSimilarity 30% + improvement 25% + familiarity 10% + portionPenalty + grains subtype bias + late-evening preparation penalty
                                const composite = pickerScore * 0.35 + macroSimilarity * 0.30 + improvementScore * 0.25 + familiarBonus * 0.10 + portionPenalty + grainSubtypeBonus + eveningPrepPenalty + formFactorBonus;
                                scoredCandidates.push({
                                    name: alt.name,
                                    kcal: altKcal,
                                    harm: altHarm,
                                    saving: savingPct,
                                    familiar: alt._familiar,
                                    portionMode,
                                    typicalAltGrams,
                                    actualAltKcal,
                                    scores: {
                                        picker: Math.round(pickerScore * 10) / 10,
                                        macroSim: Math.round(macroSimilarity * 10) / 10,
                                        improvement: Math.round(improvementScore * 10) / 10,
                                        familiarBonus,
                                        portionPenalty,
                                        grainSubtypeBonus,
                                        eveningPrepPenalty,
                                        formFactorBonus,
                                        composite: Math.round(composite * 10) / 10,
                                    },
                                    breakdown: {
                                        harmImprov: Math.round(harmImprov * 10) / 10,
                                        savingBonus: Math.round(Math.min(35, savingPct * 0.45) * 10) / 10,
                                        fiberBonus,
                                        grainSubtype: origSemCat === 'grains'
                                            ? `${origGrainSubtype || '—'}→${altGrainSubtype || '—'}`
                                            : '—',
                                        prepPenaltyReason: eveningPrepPenalty < 0 ? 'late-evening fried/doughy' : 'none',
                                        formFactor: `${origFormFactor}→${altFormFactor}`,
                                    },
                                });
                                if (composite > bestComposite) {
                                    bestComposite = composite;
                                    best = { name: alt.name, saving: savingPct, score: Math.round(composite), portionMode, actualCurrentKcal, actualAltKcal, harmImproved: altHarm < origHarm - 0.5 };
                                }
                            } catch (e) {
                                console.warn(_LOG, '⚠️ scoring error for candidate', alt?.name, e?.message);
                            }
                        }

                        // Log all scored candidates sorted by composite desc
                        const sortedLog = [...scoredCandidates].sort((a, b) => b.scores.composite - a.scores.composite);
                        console.info(_LOG, '📊 scoring table (desc)', sortedLog.map((c) => ({
                            name: c.name,
                            kcal: c.kcal,
                            saving: c.saving + '%',
                            harm: c.harm,
                            familiar: c.familiar,
                            portionMode: c.portionMode,
                            portion: `${c.typicalAltGrams}г → ${c.actualAltKcal}ккал (orig ${actualCurrentKcal}ккал)`,
                            composite: c.scores.composite,
                            breakdown: `picker=${c.scores.picker} | macroSim=${c.scores.macroSim} | improv=${c.scores.improvement}(harm=${c.breakdown.harmImprov},save=${c.breakdown.savingBonus},fiber=${c.breakdown.fiberBonus}) | fam=${c.scores.familiarBonus} | grainSubtype=${c.scores.grainSubtypeBonus}(${c.breakdown.grainSubtype}) | portionPenalty=${c.scores.portionPenalty} | eveningPrep=${c.scores.eveningPrepPenalty}(${c.breakdown.prepPenaltyReason}) | form=${c.scores.formFactorBonus}(${c.breakdown.formFactor})`,
                        })));

                        if (!best || bestComposite < 28) {
                            // #4 Harm-only fallback: original product is harmful — recommend cleaner option
                            // even when no kcal saving is achievable (e.g. Краковская колбаса harm=8.5)
                            if (origHarm >= 3) {
                                const _harmPool = candidatePool.filter((alt) => {
                                    if (alt.id === prod.id || _mealItemIds.has(alt.id)) return false;
                                    const _altDer = computeDerivedProductFn(alt);
                                    const _altKcal2 = alt.kcal100 || _altDer.kcal100 || 0;
                                    const _altHarm2 = alt.harm ?? 0;
                                    if (_altKcal2 < 30) return false;
                                    if (_altHarm2 >= origHarm - 2) return false; // must be meaningfully cleaner
                                    const _typGrams2 = getTypicalGrams(alt);
                                    if (Math.round(_altKcal2 * _typGrams2 / 100) > actualCurrentKcal * 2) return false; // portion reality
                                    const _altSemCat2 = getSemanticCat(alt.name, alt.category);
                                    if (origSemCat !== 'other' && _altSemCat2 !== origSemCat) return false;
                                    return true;
                                });
                                if (_harmPool.length > 0) {
                                    const _hBest = _harmPool.reduce((a, b) => (a.harm ?? 0) < (b.harm ?? 0) ? a : b);
                                    const _hDer = computeDerivedProductFn(_hBest);
                                    const _hKcal = _hBest.kcal100 || _hDer.kcal100 || 1;
                                    const _hHarm = _hBest.harm ?? 0;
                                    const _hGrams = getTypicalGrams(_hBest);
                                    const _hActKcal = Math.round(_hKcal * _hGrams / 100);
                                    const _hSaving = Math.round((1 - _hKcal / currentKcal) * 100);
                                    console.info(_LOG, '✅ harm-only fallback selected', {
                                        original: prod.name, origHarm,
                                        replacement: _hBest.name, altHarm: _hHarm,
                                        portion: `${_hGrams}г → ${_hActKcal}ккал`,
                                        harmOnlyPool: _harmPool.length,
                                    });
                                    return { name: _hBest.name, saving: _hSaving, score: 0, portionMode: 'harm_only', actualCurrentKcal, actualAltKcal: _hActKcal, harmImproved: true, origHarm: Math.round(origHarm * 10) / 10, altHarm: _hHarm };
                                }
                            }
                            console.info(_LOG, '❌ no recommendation — below threshold, no harm-only fallback', {
                                bestName: best?.name || '—',
                                bestComposite: Math.round(bestComposite * 10) / 10,
                                origHarm,
                            });
                            return null;
                        }
                        console.info(_LOG, '✅ recommendation selected', {
                            original: prod.name,
                            originalKcal: currentKcal,
                            replacement: best.name,
                            saving: best.saving + '%',
                            composite: best.score,
                            portionMode: best.portionMode,
                            portion: `${G}г → ${best.actualCurrentKcal}ккал | замена ~${best.actualAltKcal}ккал`,
                            semCat: origSemCat,
                            grainSubtype: origGrainSubtype || '—',
                            macroCat: origMacroCat || '—',
                            candidatesTotal: candidates.length,
                        });
                        return best;
                    };
                    const alternative = findAlternative(p, products);

                    const cardContent = React.createElement('div', { className: 'mpc', style: { background: harmBg } },
                        React.createElement('div', { className: 'mpc-row1' },
                            categoryIcon && React.createElement('span', { className: 'mpc-category-icon' }, categoryIcon),
                            React.createElement('span', { className: 'mpc-name' }, p.name),
                            harmBadge && React.createElement('span', {
                                className: 'mpc-badge',
                                style: { color: harmBadge.color },
                            }, harmBadge.emoji),
                            React.createElement('button', {
                                className: 'mpc-grams-btn ' + gramsClass,
                                onClick: (e) => { e.stopPropagation(); openEditGramsModal(mealIndex, it.id, G, p); },
                            }, G + 'г'),
                        ),
                        React.createElement('div', { className: 'mpc-grid mpc-header' },
                            React.createElement('span', null, 'ккал'),
                            React.createElement('span', null, 'У'),
                            React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                            React.createElement('span', null, 'Б'),
                            React.createElement('span', null, 'Ж'),
                            React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                            React.createElement('span', null, 'Кл'),
                            React.createElement('span', null, 'ГИ'),
                            React.createElement('span', null, 'Вр'),
                        ),
                        (() => {
                            const itemTotals = {
                                kcal: scale(per.kcal100, G),
                                carbs: scale(per.carbs100, G),
                                simple: scale(per.simple100, G),
                                complex: scale(per.complex100, G),
                                prot: scale(per.prot100, G),
                                fat: scale(per.fat100, G),
                                bad: scale(per.bad100, G),
                                good: scale(per.good100, G),
                                trans: scale(per.trans100 || 0, G),
                                fiber: scale(per.fiber100, G),
                                gi: giVal || 0,
                                harm: harmVal || 0,
                            };
                            return React.createElement('div', { className: 'mpc-grid mpc-values' },
                                React.createElement('span', { title: getNutrientTooltip('kcal', itemTotals.kcal, itemTotals), style: { color: getNutrientColor('kcal', itemTotals.kcal, itemTotals), fontWeight: getNutrientColor('kcal', itemTotals.kcal, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.kcal)),
                                React.createElement('span', { title: getNutrientTooltip('carbs', itemTotals.carbs, itemTotals), style: { color: getNutrientColor('carbs', itemTotals.carbs, itemTotals), fontWeight: getNutrientColor('carbs', itemTotals.carbs, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.carbs)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('simple', itemTotals.simple, itemTotals), style: { color: getNutrientColor('simple', itemTotals.simple, itemTotals), fontWeight: getNutrientColor('simple', itemTotals.simple, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.simple)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('complex', itemTotals.complex, itemTotals), style: { color: getNutrientColor('complex', itemTotals.complex, itemTotals), cursor: 'help' } }, Math.round(itemTotals.complex)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('prot', itemTotals.prot, itemTotals), style: { color: getNutrientColor('prot', itemTotals.prot, itemTotals), fontWeight: getNutrientColor('prot', itemTotals.prot, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.prot)),
                                React.createElement('span', { title: getNutrientTooltip('fat', itemTotals.fat, itemTotals), style: { color: getNutrientColor('fat', itemTotals.fat, itemTotals), fontWeight: getNutrientColor('fat', itemTotals.fat, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fat)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('bad', itemTotals.bad, itemTotals), style: { color: getNutrientColor('bad', itemTotals.bad, itemTotals), fontWeight: getNutrientColor('bad', itemTotals.bad, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.bad)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('good', itemTotals.good, itemTotals), style: { color: getNutrientColor('good', itemTotals.good, itemTotals), fontWeight: getNutrientColor('good', itemTotals.good, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.good)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('trans', itemTotals.trans, itemTotals), style: { color: getNutrientColor('trans', itemTotals.trans, itemTotals), fontWeight: getNutrientColor('trans', itemTotals.trans, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.trans)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('fiber', itemTotals.fiber, itemTotals), style: { color: getNutrientColor('fiber', itemTotals.fiber, itemTotals), fontWeight: getNutrientColor('fiber', itemTotals.fiber, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fiber)),
                                React.createElement('span', { title: getNutrientTooltip('gi', itemTotals.gi, itemTotals), style: { color: getNutrientColor('gi', itemTotals.gi, itemTotals), fontWeight: getNutrientColor('gi', itemTotals.gi, itemTotals) ? 600 : 400, cursor: 'help' } }, giVal != null ? Math.round(giVal) : '-'),
                                React.createElement('span', { title: getNutrientTooltip('harm', itemTotals.harm, itemTotals), style: { color: getNutrientColor('harm', itemTotals.harm, itemTotals), fontWeight: getNutrientColor('harm', itemTotals.harm, itemTotals) ? 600 : 400, cursor: 'help' } }, harmVal != null ? fmtVal('harm', harmVal) : '-'),
                            );
                        })(),
                        alternative && React.createElement('div', { className: 'mpc-alternative' },
                            React.createElement('span', null, '💡 Замени на '),
                            React.createElement('strong', null, alternative.name),
                            React.createElement('span', null, (() => {
                                const _a = alternative;
                                if (_a.portionMode === 'harm_only') return ` — вред ${_a.origHarm} → ${_a.altHarm}`;
                                if (_a.portionMode === 'real_saving') {
                                    const _t = ` — ~${_a.actualAltKcal} ккал вместо ~${_a.actualCurrentKcal} ккал`;
                                    return _a.harmImproved ? _t + ', вред ниже' : _t;
                                }
                                return _a.harmImproved ? ' — полезнее по составу, вред ниже' : ' — полезнее по составу';
                            })()),
                        ),
                    );

                    if (isMobile && HEYS.SwipeableRow) {
                        return React.createElement(HEYS.SwipeableRow, {
                            key: it.id,
                            onDelete: () => removeItem(mealIndex, it.id),
                        }, cardContent);
                    }

                    return React.createElement('div', { key: it.id, className: 'mpc', style: { marginBottom: '6px', background: harmBg } },
                        React.createElement('div', { className: 'mpc-row1' },
                            React.createElement('span', { className: 'mpc-name' }, p.name),
                            React.createElement('input', {
                                type: 'number',
                                className: 'mpc-grams',
                                value: G,
                                onChange: (e) => setGrams(mealIndex, it.id, e.target.value),
                                onFocus: (e) => e.target.select(),
                                onKeyDown: (e) => { if (e.key === 'Enter') e.target.blur(); },
                                'data-grams-input': true,
                                'data-meal-index': mealIndex,
                                'data-item-id': it.id,
                                inputMode: 'decimal',
                            }),
                            React.createElement('button', {
                                className: 'mpc-delete',
                                onClick: () => removeItem(mealIndex, it.id),
                            }, '×'),
                        ),
                        React.createElement('div', { className: 'mpc-grid mpc-header' },
                            React.createElement('span', null, 'ккал'),
                            React.createElement('span', null, 'У'),
                            React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                            React.createElement('span', null, 'Б'),
                            React.createElement('span', null, 'Ж'),
                            React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                            React.createElement('span', null, 'Кл'),
                            React.createElement('span', null, 'ГИ'),
                            React.createElement('span', null, 'Вр'),
                        ),
                        (() => {
                            const itemTotals = {
                                kcal: scale(per.kcal100, G),
                                carbs: scale(per.carbs100, G),
                                simple: scale(per.simple100, G),
                                complex: scale(per.complex100, G),
                                prot: scale(per.prot100, G),
                                fat: scale(per.fat100, G),
                                bad: scale(per.bad100, G),
                                good: scale(per.good100, G),
                                trans: scale(per.trans100 || 0, G),
                                fiber: scale(per.fiber100, G),
                                gi: giVal || 0,
                                harm: harmVal || 0,
                            };
                            return React.createElement('div', { className: 'mpc-grid mpc-values' },
                                React.createElement('span', { title: getNutrientTooltip('kcal', itemTotals.kcal, itemTotals), style: { color: getNutrientColor('kcal', itemTotals.kcal, itemTotals), fontWeight: getNutrientColor('kcal', itemTotals.kcal, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.kcal)),
                                React.createElement('span', { title: getNutrientTooltip('carbs', itemTotals.carbs, itemTotals), style: { color: getNutrientColor('carbs', itemTotals.carbs, itemTotals), fontWeight: getNutrientColor('carbs', itemTotals.carbs, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.carbs)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('simple', itemTotals.simple, itemTotals), style: { color: getNutrientColor('simple', itemTotals.simple, itemTotals), fontWeight: getNutrientColor('simple', itemTotals.simple, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.simple)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('complex', itemTotals.complex, itemTotals), style: { color: getNutrientColor('complex', itemTotals.complex, itemTotals), cursor: 'help' } }, Math.round(itemTotals.complex)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('prot', itemTotals.prot, itemTotals), style: { color: getNutrientColor('prot', itemTotals.prot, itemTotals), fontWeight: getNutrientColor('prot', itemTotals.prot, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.prot)),
                                React.createElement('span', { title: getNutrientTooltip('fat', itemTotals.fat, itemTotals), style: { color: getNutrientColor('fat', itemTotals.fat, itemTotals), fontWeight: getNutrientColor('fat', itemTotals.fat, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fat)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('bad', itemTotals.bad, itemTotals), style: { color: getNutrientColor('bad', itemTotals.bad, itemTotals), fontWeight: getNutrientColor('bad', itemTotals.bad, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.bad)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('good', itemTotals.good, itemTotals), style: { color: getNutrientColor('good', itemTotals.good, itemTotals), fontWeight: getNutrientColor('good', itemTotals.good, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.good)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('trans', itemTotals.trans, itemTotals), style: { color: getNutrientColor('trans', itemTotals.trans, itemTotals), fontWeight: getNutrientColor('trans', itemTotals.trans, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.trans)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('fiber', itemTotals.fiber, itemTotals), style: { color: getNutrientColor('fiber', itemTotals.fiber, itemTotals), fontWeight: getNutrientColor('fiber', itemTotals.fiber, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fiber)),
                                React.createElement('span', { title: getNutrientTooltip('gi', itemTotals.gi, itemTotals), style: { color: getNutrientColor('gi', itemTotals.gi, itemTotals), fontWeight: getNutrientColor('gi', itemTotals.gi, itemTotals) ? 600 : 400, cursor: 'help' } }, giVal != null ? Math.round(giVal) : '-'),
                                React.createElement('span', { title: getNutrientTooltip('harm', itemTotals.harm, itemTotals), style: { color: getNutrientColor('harm', itemTotals.harm, itemTotals), fontWeight: getNutrientColor('harm', itemTotals.harm, itemTotals) ? 600 : 400, cursor: 'help' } }, harmVal != null ? fmtVal('harm', harmVal) : '-'),
                            );
                        })(),
                    );
                }),

                (meal.photos && meal.photos.length > 0) && React.createElement('div', { className: 'meal-photos' },
                    meal.photos.map((photo, photoIndex) => {
                        const photoSrc = photo.url || photo.data;
                        if (!photoSrc) return null;

                        const timeStr = photo.timestamp
                            ? new Date(photo.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                            : null;

                        const handleDelete = async (e) => {
                            e.stopPropagation();
                            if (!confirm('Удалить это фото?')) return;

                            if (photo.path && photo.uploaded && window.HEYS?.cloud?.deletePhoto) {
                                try {
                                    await window.HEYS.cloud.deletePhoto(photo.path);
                                } catch (err) {
                                    trackError(err, { source: 'day/_meals.js', action: 'delete_photo', mealIndex });
                                }
                            }

                            setDay((prevDay = {}) => {
                                const meals = (prevDay.meals || []).map((m, i) => {
                                    if (i !== mealIndex || !m.photos) return m;
                                    return { ...m, photos: m.photos.filter((p) => p.id !== photo.id) };
                                });
                                return { ...prevDay, meals, updatedAt: Date.now() };
                            });
                        };

                        let thumbClass = 'meal-photo-thumb';
                        if (photo.pending) thumbClass += ' pending';
                        if (photo.uploading) thumbClass += ' uploading';

                        return React.createElement(LazyPhotoThumb, {
                            key: photo.id || photoIndex,
                            photo,
                            photoSrc,
                            thumbClass,
                            timeStr,
                            mealIndex,
                            photoIndex,
                            mealPhotos: meal.photos,
                            handleDelete,
                            setDay,
                        });
                    }),
                ),

                showWaveButton && React.createElement('div', {
                    className: 'meal-wave-block' + (waveExpanded ? ' expanded' : ''),
                    style: {
                        marginTop: '10px',
                        background: 'transparent',
                        borderRadius: '12px',
                        overflow: 'hidden',
                    },
                },
                    React.createElement('div', {
                        className: 'meal-wave-toggle',
                        onClick: toggleWave,
                        style: {
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            fontSize: '13px', fontWeight: 600,
                            color: hasAnyOverlap ? '#b91c1c' : '#1f2937',
                        },
                    },
                        React.createElement('span', null,
                            `📉 Волна ${(currentWave.duration / 60).toFixed(1)}ч • ` + (
                                hasAnyOverlap
                                    ? `⚠️ перехлёст ${formatMinutes(overlapMinutes)}`
                                    : nextWave
                                        ? `✅ липолиз ${formatMinutes(lipolysisGapNext)}`
                                        : '🟢 последний приём'
                            ),
                        ),
                        React.createElement('button', {
                            onClick: (e) => {
                                e.stopPropagation();
                                setShowWaveCalcPopup(true);
                            },
                            style: {
                                background: 'rgba(59, 130, 246, 0.12)',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '3px 8px',
                                fontSize: '11px',
                                color: '#3b82f6',
                                fontWeight: 500,
                                cursor: 'pointer',
                                marginLeft: '8px',
                            },
                        }, 'расчёт'),
                        React.createElement('span', { className: 'toggle-arrow' }, waveExpanded ? '▴' : '▾'),
                    ),
                    waveExpanded && InsulinWave.MealWaveExpandSection && React.createElement(InsulinWave.MealWaveExpandSection, {
                        waveData: currentWave,
                        prevWave,
                        nextWave,
                    }),

                    (() => {
                        const IW = HEYS.InsulinWave;
                        if (!IW || !IW.calculateHypoglycemiaRisk) return null;

                        const hypoRisk = IW.calculateHypoglycemiaRisk(meal, pIndex, getProductFromItem);
                        if (!hypoRisk.hasRisk) return null;

                        const mealMinutes = IW.utils?.timeToMinutes?.(meal.time) || 0;
                        const now = new Date();
                        const nowMinutes = now.getHours() * 60 + now.getMinutes();
                        let minutesSinceMeal = nowMinutes - mealMinutes;
                        if (minutesSinceMeal < 0) minutesSinceMeal += 24 * 60;

                        const inRiskWindow = minutesSinceMeal >= hypoRisk.riskWindow.start && minutesSinceMeal <= hypoRisk.riskWindow.end;

                        return React.createElement('div', {
                            className: 'hypoglycemia-warning',
                            style: {
                                margin: '8px 12px 10px 12px',
                                padding: '8px 10px',
                                background: inRiskWindow ? 'rgba(249,115,22,0.12)' : 'rgba(234,179,8,0.1)',
                                borderRadius: '8px',
                                fontSize: '12px',
                                color: inRiskWindow ? '#ea580c' : '#ca8a04',
                            },
                        },
                            React.createElement('div', { style: { fontWeight: '600', marginBottom: '2px' } },
                                inRiskWindow
                                    ? '⚡ Сейчас возможен спад энергии'
                                    : '⚡ Высокий GI — риск "сахарных качелей"',
                            ),
                            React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } },
                                inRiskWindow
                                    ? 'Это нормально! Съешь орехи или белок если устал'
                                    : `GI ~${Math.round(hypoRisk.details.avgGI)}, белок ${Math.round(hypoRisk.details.totalProtein)}г — через 2-3ч может "накрыть"`,
                            ),
                        );
                    })(),
                ),

                React.createElement('div', {
                    className: 'meal-meta-row',
                    style: {
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '8px 0',
                    },
                },
                    mealQuality && React.createElement('button', {
                        className: 'meal-quality-badge',
                        onClick: (e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMealQualityPopup({
                                meal,
                                quality: mealQuality,
                                mealTypeInfo,
                                x: rect.left + rect.width / 2,
                                y: rect.bottom + 8,
                            });
                        },
                        title: 'Качество приёма — нажми для деталей',
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '2px 6px',
                            borderRadius: '8px',
                            border: 'none',
                            background: mealQuality.color + '20',
                            color: mealQuality.color,
                            cursor: 'pointer',
                            marginRight: '4px',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            flexShrink: 0,
                            minWidth: '28px',
                        },
                    },
                        React.createElement('span', { style: { fontSize: '12px' } },
                            mealQuality.score >= 80 ? '⭐' : mealQuality.score >= 50 ? '📊' : '⚠️',
                        ),
                        React.createElement('span', { style: { fontSize: '11px', fontWeight: 600 } }, mealQuality.score),
                    ),
                    isMobile
                        ? React.createElement('div', {
                            className: 'mobile-mood-btn',
                            onClick: () => openMoodEditor(mealIndex),
                            title: 'Изменить оценки',
                            style: {
                                display: 'flex',
                                gap: '6px',
                                cursor: 'pointer',
                            },
                        },
                            hasRatings ? React.createElement(React.Fragment, null,
                                moodEmoji && React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        background: '#fef3c7',
                                        minWidth: '28px',
                                    },
                                },
                                    React.createElement('span', { style: { fontSize: '12px' } }, moodEmoji),
                                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#b45309' } }, moodVal),
                                ),
                                wellbeingEmoji && React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        background: '#dcfce7',
                                        minWidth: '28px',
                                    },
                                },
                                    React.createElement('span', { style: { fontSize: '12px' } }, wellbeingEmoji),
                                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#15803d' } }, wellbeingVal),
                                ),
                                stressEmoji && React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        background: '#fce7f3',
                                        minWidth: '28px',
                                    },
                                },
                                    React.createElement('span', { style: { fontSize: '12px' } }, stressEmoji),
                                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#be185d' } }, stressVal),
                                ),
                            ) : React.createElement('span', {
                                style: {
                                    fontSize: '11px',
                                    color: '#94a3b8',
                                    padding: '4px 8px',
                                    borderRadius: '8px',
                                    background: '#f1f5f9',
                                },
                            }, '+ оценки'))
                        : React.createElement(React.Fragment, null,
                            React.createElement('input', { className: 'compact-input time', type: 'time', title: 'Время приёма', value: meal.time || '', onChange: (e) => onChangeTime(mealIndex, e.target.value) }),
                            React.createElement('span', { className: 'meal-meta-field' }, '😊', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Настроение', value: meal.mood || '', onChange: (e) => onChangeMood(mealIndex, +e.target.value || '') })),
                            React.createElement('span', { className: 'meal-meta-field' }, '💪', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Самочувствие', value: meal.wellbeing || '', onChange: (e) => onChangeWellbeing(mealIndex, +e.target.value || '') })),
                            React.createElement('span', { className: 'meal-meta-field' }, '😰', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Стресс', value: meal.stress || '', onChange: (e) => onChangeStress(mealIndex, +e.target.value || '') })),
                        ),
                    (meal.items || []).length > 0 && React.createElement('button', {
                        className: 'meal-totals-badge',
                        onClick: (e) => {
                            e.stopPropagation();
                            setTotalsExpanded(!totalsExpanded);
                        },
                        title: 'Показать итоговые КБЖУ приёма',
                        style: {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            border: 'none',
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginRight: '4px',
                            transition: 'transform 0.15s, background 0.15s',
                            flexShrink: 0,
                        },
                    },
                        'КБЖУ',
                        React.createElement('span', { style: { fontSize: '10px', opacity: 0.7, marginLeft: '2px' } }, totalsExpanded ? '▴' : '▾'),
                    ),
                    optimizerRecsCount > 0 && React.createElement('button', {
                        className: 'meal-optimizer-badge',
                        onClick: () => setOptimizerPopupOpen(!optimizerPopupOpen),
                        title: 'Советы по улучшению приёма',
                        style: {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            border: 'none',
                            background: '#fef3c7',
                            color: '#b45309',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginRight: '4px',
                            transition: 'transform 0.15s, background 0.15s',
                            flexShrink: 0,
                        },
                    },
                        'Советы',
                        React.createElement('span', {
                            style: {
                                background: '#f59e0b',
                                color: '#fff',
                                borderRadius: '8px',
                                padding: '0 5px',
                                fontSize: '10px',
                                fontWeight: 700,
                                marginLeft: '3px',
                                lineHeight: '16px',
                            },
                        }, optimizerRecsCount),
                        React.createElement('span', { style: { fontSize: '10px', opacity: 0.7, marginLeft: '2px' } }, optimizerPopupOpen ? '▴' : '▾'),
                    ),
                    React.createElement('button', {
                        className: 'meal-delete-btn',
                        onClick: () => onRemoveMeal(mealIndex),
                        title: 'Удалить приём',
                        style: {
                            padding: '4px 6px',
                            fontSize: '14px',
                            lineHeight: 1,
                            flexShrink: 0,
                        },
                    }, '🗑'),
                ),

                totalsExpanded && (meal.items || []).length > 0 && React.createElement('div', {
                    className: 'mpc-totals-wrap',
                    style: {
                        marginTop: '10px',
                        padding: '12px',
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(96, 165, 250, 0.05) 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        animation: 'slideDown 0.2s ease-out',
                    },
                },
                    React.createElement('div', { className: 'mpc-grid mpc-header' },
                        React.createElement('span', null, 'ккал'),
                        React.createElement('span', null, 'У'),
                        React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                        React.createElement('span', null, 'Б'),
                        React.createElement('span', null, 'Ж'),
                        React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                        React.createElement('span', null, 'Кл'),
                        React.createElement('span', null, 'ГИ'),
                        React.createElement('span', null, 'Вр'),
                    ),
                    React.createElement('div', { className: 'mpc-grid mpc-totals-values' },
                        React.createElement('span', { title: getNutrientTooltip('kcal', totals.kcal, totals), style: { color: getNutrientColor('kcal', totals.kcal, totals), fontWeight: getNutrientColor('kcal', totals.kcal, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.kcal)),
                        React.createElement('span', { title: getNutrientTooltip('carbs', totals.carbs, totals), style: { color: getNutrientColor('carbs', totals.carbs, totals), fontWeight: getNutrientColor('carbs', totals.carbs, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.carbs)),
                        React.createElement('span', { className: 'mpc-dim' },
                            React.createElement('span', { title: getNutrientTooltip('simple', totals.simple, totals), style: { color: getNutrientColor('simple', totals.simple, totals), fontWeight: getNutrientColor('simple', totals.simple, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.simple || 0)),
                            '/',
                            React.createElement('span', { title: getNutrientTooltip('complex', totals.complex, totals), style: { color: getNutrientColor('complex', totals.complex, totals), cursor: 'help' } }, Math.round(totals.complex || 0)),
                        ),
                        React.createElement('span', { title: getNutrientTooltip('prot', totals.prot, totals), style: { color: getNutrientColor('prot', totals.prot, totals), fontWeight: getNutrientColor('prot', totals.prot, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.prot)),
                        React.createElement('span', { title: getNutrientTooltip('fat', totals.fat, totals), style: { color: getNutrientColor('fat', totals.fat, totals), fontWeight: getNutrientColor('fat', totals.fat, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.fat)),
                        React.createElement('span', { className: 'mpc-dim' },
                            React.createElement('span', { title: getNutrientTooltip('bad', totals.bad, totals), style: { color: getNutrientColor('bad', totals.bad, totals), fontWeight: getNutrientColor('bad', totals.bad, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.bad || 0)),
                            '/',
                            React.createElement('span', { title: getNutrientTooltip('good', totals.good, totals), style: { color: getNutrientColor('good', totals.good, totals), fontWeight: getNutrientColor('good', totals.good, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.good || 0)),
                            '/',
                            React.createElement('span', { title: getNutrientTooltip('trans', totals.trans, totals), style: { color: getNutrientColor('trans', totals.trans, totals), fontWeight: getNutrientColor('trans', totals.trans, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.trans || 0)),
                        ),
                        React.createElement('span', { title: getNutrientTooltip('fiber', totals.fiber, totals), style: { color: getNutrientColor('fiber', totals.fiber, totals), fontWeight: getNutrientColor('fiber', totals.fiber, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.fiber || 0)),
                        React.createElement('span', { title: getNutrientTooltip('gi', totals.gi, totals), style: { color: getNutrientColor('gi', totals.gi, totals), fontWeight: getNutrientColor('gi', totals.gi, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.gi || 0)),
                        React.createElement('span', { title: getNutrientTooltip('harm', totals.harm, totals), style: { color: getNutrientColor('harm', totals.harm, totals), fontWeight: getNutrientColor('harm', totals.harm, totals) ? 600 : 400, cursor: 'help' } }, fmtVal('harm', totals.harm || 0)),
                    ),
                ),

                optimizerPopupOpen && optimizerRecsCount > 0 && HEYS.MealOptimizer && MealOptimizerSection && React.createElement('div', {
                    className: 'meal-optimizer-expanded',
                    style: {
                        marginTop: '12px',
                        padding: '12px',
                        background: 'linear-gradient(135deg, rgba(245, 158, 0, 0.08) 0%, rgba(251, 191, 36, 0.05) 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(245, 158, 0, 0.2)',
                        animation: 'slideDown 0.2s ease-out',
                    },
                }, React.createElement(MealOptimizerSection, {
                    meal,
                    totals,
                    dayData: dayData || {},
                    profile: profile || {},
                    products: products || [],
                    pIndex,
                    mealIndex,
                    addProductToMeal,
                })),

                showWaveCalcPopup && currentWave && React.createElement('div', {
                    className: 'wave-details-overlay',
                    onClick: (e) => { if (e.target === e.currentTarget) setShowWaveCalcPopup(false); },
                    style: {
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                    },
                },
                    React.createElement('div', {
                        className: 'wave-details-popup',
                        style: {
                            background: '#fff',
                            borderRadius: '16px',
                            padding: '20px',
                            maxWidth: '360px',
                            width: '100%',
                            maxHeight: '80vh',
                            overflowY: 'auto',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        },
                    },
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '16px',
                            },
                        },
                            React.createElement('h3', {
                                style: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#1f2937' },
                            }, 'Расчёт волны'),
                            React.createElement('button', {
                                onClick: () => setShowWaveCalcPopup(false),
                                style: {
                                    background: 'none', border: 'none', fontSize: '20px',
                                    cursor: 'pointer', color: '#9ca3af', padding: '4px',
                                },
                            }, '×'),
                        ),

                        React.createElement('div', {
                            style: {
                                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                borderRadius: '12px',
                                padding: '16px',
                                marginBottom: '16px',
                                textAlign: 'center',
                                color: '#fff',
                            },
                        },
                            React.createElement('div', { style: { fontSize: '12px', opacity: 0.9, marginBottom: '4px' } }, 'Длина волны'),
                            React.createElement('div', { style: { fontSize: '28px', fontWeight: 700 } }, (currentWave.waveHours || currentWave.duration / 60).toFixed(1) + 'ч'),
                            React.createElement('div', { style: { fontSize: '11px', opacity: 0.8, marginTop: '4px' } }, currentWave.timeDisplay + ' → ' + currentWave.endTimeDisplay),
                        ),

                        React.createElement('div', {
                            style: {
                                background: '#f8fafc',
                                borderRadius: '10px',
                                padding: '12px',
                                marginBottom: '16px',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                color: '#64748b',
                                textAlign: 'center',
                            },
                        }, 'База × Множитель = ' + (currentWave.baseWaveHours || 3).toFixed(1) + 'ч × '
                        + (currentWave.finalMultiplier || 1).toFixed(2) + ' = ' + (currentWave.waveHours || currentWave.duration / 60).toFixed(1) + 'ч'),

                        React.createElement('div', { style: { marginBottom: '12px' } },
                            React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' } }, '🍽️ Факторы еды'),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'ГИ'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.gi || 0)),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'GL (нагрузка)'),
                                React.createElement('span', { style: { fontWeight: 500, color: currentWave.gl < 10 ? '#22c55e' : currentWave.gl > 20 ? '#ef4444' : '#1f2937' } }, (currentWave.gl || 0).toFixed(1)),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Белок'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.protein || 0) + 'г'),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Клетчатка'),
                                React.createElement('span', { style: { fontWeight: 500, color: currentWave.fiber >= 5 ? '#22c55e' : '#1f2937' } }, Math.round(currentWave.fiber || 0) + 'г'),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Жиры'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.fat || 0) + 'г'),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Углеводы'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.carbs || 0) + 'г'),
                            ),
                        ),

                        React.createElement('div', { style: { marginBottom: '12px' } },
                            React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' } }, '⏰ Дневные факторы'),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Время суток'),
                                React.createElement('span', { style: { fontWeight: 500, color: currentWave.circadianMultiplier > 1.05 ? '#f97316' : '#1f2937' } }, '×' + (currentWave.circadianMultiplier || 1).toFixed(2)),
                            ),
                            currentWave.activityBonus && currentWave.activityBonus !== 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' } },
                                React.createElement('span', { style: { color: '#22c55e' } }, '🏃 Активность'),
                                React.createElement('span', { style: { fontWeight: 500, color: '#22c55e' } }, (currentWave.activityBonus * 100).toFixed(0) + '%'),
                            ),
                        ),

                        React.createElement('button', {
                            onClick: () => setShowWaveCalcPopup(false),
                            style: {
                                width: '100%',
                                background: '#3b82f6',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '10px',
                                padding: '12px',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                marginTop: '8px',
                            },
                        }, 'Закрыть'),
                    ),
                ),
            ),
        );
    }, (prevProps, nextProps) => {
        if (prevProps.meal !== nextProps.meal) return false;
        if (prevProps.meal?.mealType !== nextProps.meal?.mealType) return false;
        if (prevProps.meal?.name !== nextProps.meal?.name) return false;
        if (prevProps.meal?.time !== nextProps.meal?.time) return false;
        if (prevProps.meal?.items?.length !== nextProps.meal?.items?.length) return false;
        if (prevProps.meal?.photos?.length !== nextProps.meal?.photos?.length) return false;
        if (prevProps.mealIndex !== nextProps.mealIndex) return false;
        if (prevProps.displayIndex !== nextProps.displayIndex) return false;
        if (prevProps.isExpanded !== nextProps.isExpanded) return false;
        if (prevProps.allMeals !== nextProps.allMeals) return false;
        return true;
    });

    HEYS.dayComponents = HEYS.dayComponents || {};
    HEYS.dayComponents.MealCard = MealCard;

    // =========================
    // Meals list
    // =========================
    function renderMealsList(params) {
        const {
            sortedMealsForDisplay,
            day,
            products,
            pIndex,
            date,
            setDay,
            isMobile,
            isMealExpanded,
            isMealStale,
            toggleMealExpand,
            changeMealType,
            updateMealTime,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            removeMeal,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData,
        } = params;

        if (!sortedMealsForDisplay || !Array.isArray(sortedMealsForDisplay)) {
            return [];
        }

        if (!MealCard) {
            trackError(new Error('[HEYS Day Meals] MealCard not loaded'), {
                source: 'day/_meals.js',
                type: 'missing_dependency',
            });
            return [];
        }

        return sortedMealsForDisplay.map((sortedMeal, displayIndex) => {
            const mi = (day.meals || []).findIndex((m) => m.id === sortedMeal.id);
            if (mi === -1) {
                trackError(new Error('[HEYS Day Meals] meal not found in day.meals'), {
                    source: 'day/_meals.js',
                    type: 'missing_meal',
                    mealId: sortedMeal.id,
                });
                return null;
            }

            const meal = day.meals[mi];
            const isExpanded = isMealExpanded(mi, (day.meals || []).length, day.meals, displayIndex);
            const mealNumber = sortedMealsForDisplay.length - displayIndex;
            const isFirst = displayIndex === 0;
            const isCurrentMeal = isFirst && !isMealStale(meal);

            return React.createElement('div', {
                key: meal.id + '_' + (meal.mealType || 'auto'),
                className: 'meal-with-number',
                style: {
                    marginTop: isFirst ? '0' : '24px',
                },
            },
                React.createElement('div', {
                    className: 'meal-number-header',
                    style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '6px',
                        gap: '4px',
                    },
                },
                    React.createElement('div', {
                        className: 'meal-number-badge' + (isCurrentMeal ? ' meal-number-badge--current' : ''),
                        style: {
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: isCurrentMeal
                                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                            fontWeight: '700',
                            boxShadow: isCurrentMeal
                                ? '0 2px 8px rgba(34,197,94,0.35)'
                                : '0 2px 8px rgba(59,130,246,0.35)',
                        },
                    }, mealNumber),
                    React.createElement('span', {
                        className: 'meal-current-label',
                        style: {
                            fontSize: '14px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            color: isCurrentMeal ? '#22c55e' : '#3b82f6',
                            marginTop: '4px',
                        },
                    }, isCurrentMeal ? 'ТЕКУЩИЙ ПРИЁМ' : 'ПРИЁМ'),
                ),
                React.createElement(MealCard, {
                    meal,
                    mealIndex: mi,
                    displayIndex,
                    products,
                    pIndex,
                    date,
                    setDay,
                    isMobile,
                    isExpanded,
                    onToggleExpand: toggleMealExpand,
                    onChangeMealType: changeMealType,
                    onChangeTime: updateMealTime,
                    onChangeMood: changeMealMood,
                    onChangeWellbeing: changeMealWellbeing,
                    onChangeStress: changeMealStress,
                    onRemoveMeal: removeMeal,
                    openEditGramsModal,
                    openTimeEditor,
                    openMoodEditor,
                    setGrams,
                    removeItem,
                    isMealStale,
                    allMeals: day.meals,
                    isNewItem,
                    optimum,
                    setMealQualityPopup,
                    addProductToMeal,
                    dayData: day,
                    profile: prof,
                    insulinWaveData,
                }),
            );
        });
    }

    function renderEmptyMealsState(params) {
        const { addMeal } = params;

        return React.createElement('div', {
            className: 'empty-meals-state',
            style: {
                textAlign: 'center',
                padding: '40px 20px',
                color: '#64748b',
            },
        },
            React.createElement('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '🍽️'),
            React.createElement('div', { style: { fontSize: '18px', fontWeight: '600', marginBottom: '8px' } }, 'Нет приёмов пищи'),
            React.createElement('div', { style: { fontSize: '14px', marginBottom: '24px' } }, 'Добавь свой первый приём пищи'),
            addMeal && React.createElement('button', {
                className: 'button-primary',
                onClick: addMeal,
                style: {
                    padding: '12px 24px',
                    fontSize: '16px',
                },
            }, '➕ Добавить приём'),
        );
    }

    HEYS.dayMealsList = {
        renderMealsList,
        renderEmptyMealsState,
    };

    // =========================
    // Meals display (sorting + list)
    // =========================
    function useMealsDisplay(params) {
        const {
            day,
            safeMeals,
            products,
            pIndex,
            date,
            setDay,
            isMobile,
            isMealExpanded,
            isMealStale,
            toggleMealExpand,
            changeMealType,
            updateMealTime,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            removeMeal,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData,
        } = params || {};

        if (!React) return { sortedMealsForDisplay: [], mealsUI: [] };

        const sortedMealsForDisplay = React.useMemo(() => {
            const meals = day?.meals || [];
            if (meals.length <= 1) return meals;

            return [...meals].sort((a, b) => {
                const timeA = U?.timeToMinutes ? U.timeToMinutes(a.time) : null;
                const timeB = U?.timeToMinutes ? U.timeToMinutes(b.time) : null;

                if (timeA === null && timeB === null) return 0;
                if (timeA === null) return 1;
                if (timeB === null) return -1;

                return timeB - timeA;
            });
        }, [safeMeals]);

        const mealsUI = HEYS.dayMealsList?.renderMealsList?.({
            sortedMealsForDisplay,
            day,
            products,
            pIndex,
            date,
            setDay,
            isMobile,
            isMealExpanded,
            isMealStale,
            toggleMealExpand,
            changeMealType,
            updateMealTime,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            removeMeal,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData,
        }) || [];

        return { sortedMealsForDisplay, mealsUI };
    }

    HEYS.dayMealsDisplay = {
        useMealsDisplay,
    };

    // =========================
    // Meals chart UI
    // =========================
    const MealsChartUI = {};
    MealsChartUI.renderMealsChart = function renderMealsChart({
        React,
        mealsChartData,
        statsVm,
        day,
        dayTot,
        normAbs,
        pIndex,
        getDailyNutrientColor,
        getDailyNutrientTooltip,
        mealChartHintShown,
        setMealChartHintShown,
        setShowConfetti,
        setMealQualityPopup,
        newMealAnimatingIndex,
        showFirstPerfectAchievement,
        U,
    }) {
        if (!mealsChartData || !mealsChartData.meals || mealsChartData.meals.length === 0) return null;

        const utils = U || HEYS.utils || {};

        return React.createElement('div', {
            className: 'meals-chart-container widget-shadow-diary-glass widget-outline-diary-glass',
            style: {
                margin: '0 0 var(--heys-diary-stack-gap, 12px) 0',
                padding: 'var(--heys-diary-card-padding, 14px 16px)',
                background: 'var(--surface, #fff)',
            },
        },
            React.createElement('div', {
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                    gap: '4px',
                },
            },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', {
                        style: {
                            fontSize: 'var(--heys-diary-card-title-size, 14px)',
                            fontWeight: 'var(--heys-diary-card-title-weight, 600)',
                            color: 'var(--heys-diary-card-title-color, var(--text, #1e293b))',
                        },
                    }, 'Распределение'),
                    mealsChartData.avgQualityScore > 0 && React.createElement('span', {
                        className: 'meal-avg-score-badge',
                        style: {
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            background: mealsChartData.avgQualityScore >= 80 ? '#dcfce7' : mealsChartData.avgQualityScore >= 50 ? '#fef3c7' : '#fee2e2',
                            color: mealsChartData.avgQualityScore >= 80 ? '#166534' : mealsChartData.avgQualityScore >= 50 ? '#92400e' : '#991b1b',
                            fontWeight: '600',
                        },
                    }, 'средняя оценка ' + mealsChartData.avgQualityScore),
                    mealsChartData.yesterdayAvgScore > 0 && (() => {
                        const diff = mealsChartData.avgQualityScore - mealsChartData.yesterdayAvgScore;
                        if (Math.abs(diff) < 3) return null;
                        return React.createElement('span', {
                            style: {
                                fontSize: '10px',
                                color: diff > 0 ? '#16a34a' : '#dc2626',
                                fontWeight: '500',
                            },
                        }, diff > 0 ? '↑+' + diff : '↓' + diff);
                    })(),
                ),
            ),
            HEYS.dayDailySummary?.renderDailySummaryTable?.({
                React,
                day,
                pIndex,
                dayTot,
                normAbs,
                getDailyNutrientColor,
                getDailyNutrientTooltip,
            }),
            !mealChartHintShown && React.createElement('div', { className: 'meal-chart-hint' },
                React.createElement('span', null, '👆'),
                'Нажми на полоску для деталей',
            ),
            false && mealsChartData.meals.length > 1 && React.createElement('div', {
                className: 'meals-day-sparkline',
                style: {
                    position: 'relative',
                    height: '60px',
                    marginBottom: '12px',
                    padding: '8px 0 16px 0',
                },
            },
                (() => {
                    const meals = mealsChartData.meals;
                    const maxKcal = Math.max(...meals.map((m) => m.kcal), 200);
                    const svgW = 280;
                    const svgH = 40;
                    const padding = 10;

                    const parseTime = (t) => {
                        if (!t) return 0;
                        const [h, m] = t.split(':').map(Number);
                        return (h || 0) * 60 + (m || 0);
                    };

                    const times = meals.map((m) => parseTime(m.time)).filter((t) => t > 0);
                    const dataMinTime = times.length > 0 ? Math.min(...times) : 12 * 60;
                    const dataMaxTime = times.length > 0 ? Math.max(...times) : 20 * 60;
                    const minTime = dataMinTime - 30;
                    const maxTime = dataMaxTime + 30;
                    const timeRange = Math.max(maxTime - minTime, 60);

                    const bestIdx = mealsChartData.bestMealIndex;

                    const points = meals.map((m, idx) => {
                        const t = parseTime(m.time);
                        const x = padding + ((t - minTime) / timeRange) * (svgW - 2 * padding);
                        const y = svgH - padding - ((m.kcal / maxKcal) * (svgH - 2 * padding));
                        const r = 3 + Math.min(4, (m.kcal / 200));
                        const isBest = idx === bestIdx && m.quality && m.quality.score >= 70;
                        return { x, y, meal: m, idx, r, isBest };
                    }).sort((a, b) => a.x - b.x);

                    const linePath = points.length > 1
                        ? 'M ' + points.map((p) => `${p.x},${p.y}`).join(' L ')
                        : '';

                    const areaPath = points.length > 1
                        ? `M ${points[0].x},${svgH - padding} `
                        + points.map((p) => `L ${p.x},${p.y}`).join(' ')
                        + ` L ${points[points.length - 1].x},${svgH - padding} Z`
                        : '';

                    const yesterdayMeals = statsVm?.computed?.mealsChartMeta?.yesterdayMeals || [];
                    const yesterdayPath = (() => {
                        if (yesterdayMeals.length < 2) return '';
                        const yMaxKcal = Math.max(maxKcal, ...yesterdayMeals.map((p) => p.kcal));
                        const pts = yesterdayMeals.map((p) => {
                            const x = padding + ((p.t - minTime) / timeRange) * (svgW - 2 * padding);
                            const y = svgH - padding - ((p.kcal / yMaxKcal) * (svgH - 2 * padding));
                            return { x: Math.max(padding, Math.min(svgW - padding, x)), y };
                        }).sort((a, b) => a.x - b.x);
                        return 'M ' + pts.map((p) => `${p.x},${p.y}`).join(' L ');
                    })();

                    return React.createElement('svg', {
                        viewBox: `0 0 ${svgW} ${svgH + 12}`,
                        style: { width: '100%', height: '100%' },
                        preserveAspectRatio: 'xMidYMid meet',
                    },
                        React.createElement('defs', null,
                            React.createElement('linearGradient', { id: 'mealSparkGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#10b981', stopOpacity: '0.3' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#10b981', stopOpacity: '0.05' }),
                            ),
                            React.createElement('linearGradient', { id: 'goodZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#22c55e', stopOpacity: '0.12' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#22c55e', stopOpacity: '0.02' }),
                            ),
                            React.createElement('linearGradient', { id: 'snackZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#eab308', stopOpacity: '0.08' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#eab308', stopOpacity: '0.01' }),
                            ),
                            React.createElement('linearGradient', { id: 'badZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#ef4444', stopOpacity: '0.12' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#ef4444', stopOpacity: '0.02' }),
                            ),
                        ),
                        (() => {
                            const firstMealTime = times.length > 0 ? Math.min(...times) : 8 * 60;
                            const endOfDayMinutes = 27 * 60;
                            const slotDuration = (endOfDayMinutes - firstMealTime) / 6;

                            const zones = [
                                { start: firstMealTime - 30, end: firstMealTime + slotDuration * 0.3, gradient: 'url(#goodZoneGrad)' },
                                { start: firstMealTime + slotDuration * 0.8, end: firstMealTime + slotDuration * 1.5, gradient: 'url(#goodZoneGrad)' },
                                { start: firstMealTime + slotDuration * 2.8, end: firstMealTime + slotDuration * 3.5, gradient: 'url(#goodZoneGrad)' },
                                { start: firstMealTime + slotDuration * 4.5, end: endOfDayMinutes, gradient: 'url(#badZoneGrad)' },
                            ];

                            return zones.map((zone, i) => {
                                const x1 = padding + ((zone.start - minTime) / timeRange) * (svgW - 2 * padding);
                                const x2 = padding + ((zone.end - minTime) / timeRange) * (svgW - 2 * padding);
                                if (x2 < padding || x1 > svgW - padding) return null;
                                const clampedX1 = Math.max(padding, x1);
                                const clampedX2 = Math.min(svgW - padding, x2);
                                if (clampedX2 <= clampedX1) return null;
                                return React.createElement('rect', {
                                    key: 'zone-' + i,
                                    x: clampedX1,
                                    y: 0,
                                    width: clampedX2 - clampedX1,
                                    height: svgH,
                                    fill: zone.gradient,
                                    rx: 3,
                                });
                            });
                        })(),
                        yesterdayPath && React.createElement('path', {
                            d: yesterdayPath,
                            fill: 'none',
                            stroke: '#9ca3af',
                            strokeWidth: '1.5',
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            className: 'meal-sparkline-yesterday',
                        }),
                        areaPath && React.createElement('path', {
                            d: areaPath,
                            fill: 'url(#mealSparkGrad)',
                            className: 'meal-sparkline-area',
                        }),
                        linePath && React.createElement('path', {
                            d: linePath,
                            fill: 'none',
                            stroke: '#10b981',
                            strokeWidth: '2',
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            className: 'meal-sparkline-line',
                            style: { strokeDasharray: 500, strokeDashoffset: 500 },
                        }),
                        points.map((p, i) =>
                            React.createElement('g', {
                                key: i,
                                className: 'meal-sparkline-dot',
                                style: { '--dot-delay': (1 + i * 0.4) + 's' },
                            },
                                p.isBest && React.createElement('circle', {
                                    cx: p.x,
                                    cy: p.y,
                                    r: p.r + 4,
                                    fill: 'none',
                                    stroke: '#22c55e',
                                    strokeWidth: '2',
                                    opacity: 0.6,
                                    className: 'sparkline-pulse',
                                }),
                                React.createElement('circle', {
                                    cx: p.x,
                                    cy: p.y,
                                    r: p.r,
                                    fill: p.meal.quality ? p.meal.quality.color : '#10b981',
                                    stroke: p.isBest ? '#22c55e' : '#fff',
                                    strokeWidth: p.isBest ? 2 : 1.5,
                                    style: { cursor: 'pointer' },
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        const quality = p.meal.quality;
                                        if (!quality) return;
                                        const svg = e.target.closest('svg');
                                        const svgRect = svg.getBoundingClientRect();
                                        const viewBox = svg.viewBox.baseVal;
                                        const scaleX = svgRect.width / viewBox.width;
                                        const scaleY = svgRect.height / viewBox.height;
                                        const screenX = svgRect.left + p.x * scaleX;
                                        const screenY = svgRect.top + p.y * scaleY;
                                        if (!mealChartHintShown) {
                                            setMealChartHintShown(true);
                                            try {
                                                if (HEYS.store?.set) HEYS.store.set('heys_meal_hint_shown', '1');
                                                else if (utils.lsSet) utils.lsSet('heys_meal_hint_shown', '1');
                                                else localStorage.setItem('heys_meal_hint_shown', '1');
                                            } catch { }
                                        }
                                        if (quality.score >= 95) {
                                            setShowConfetti(true);
                                            setTimeout(() => setShowConfetti(false), 2000);
                                        }
                                        setMealQualityPopup({
                                            meal: p.meal,
                                            quality,
                                            mealTypeInfo: { label: p.meal.name, icon: p.meal.icon },
                                            x: screenX,
                                            y: screenY + 15,
                                        });
                                    },
                                }),
                            ),
                        ),
                        points.map((p, i) =>
                            React.createElement('text', {
                                key: 'time-' + i,
                                x: p.x,
                                y: svgH + 10,
                                fontSize: '8',
                                fill: '#9ca3af',
                                textAnchor: 'middle',
                            }, p.meal.time || ''),
                        ),
                    );
                })(),
            ),
            React.createElement('div', {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    position: 'relative',
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(148,163,184,0.28)',
                },
            },
                React.createElement('div', {
                    className: 'meals-target-line',
                    style: {
                        position: 'absolute',
                        left: 'calc(100px + 100%)',
                        top: 0,
                        bottom: 0,
                        width: '0',
                        borderLeft: '2px dashed rgba(16, 185, 129, 0.4)',
                        pointerEvents: 'none',
                        zIndex: 1,
                    },
                }),
                mealsChartData.meals.map((meal, i) => {
                    const originalIndex = i;
                    const widthPct = mealsChartData.targetKcal > 0
                        ? Math.min(100, (meal.kcal / mealsChartData.targetKcal) * 100)
                        : 0;
                    const barWidthPct = widthPct > 0 && widthPct < 12 ? 12 : widthPct;
                    const isOverTarget = mealsChartData.totalKcal > mealsChartData.targetKcal;
                    const quality = meal.quality;
                    const isBest = mealsChartData.bestMealIndex === originalIndex && quality && quality.score >= 70;
                    const barFill = quality
                        ? `linear-gradient(90deg, ${quality.color} 0%, ${quality.color}cc 100%)`
                        : (isOverTarget ? 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(90deg, #34d399 0%, #10b981 100%)');
                    const problemBadges = quality?.badges?.filter((b) => !b.ok).slice(0, 3) || [];
                    const openQualityModal = (e) => {
                        if (!quality) return;
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        if (!mealChartHintShown) {
                            setMealChartHintShown(true);
                            try {
                                if (HEYS.store?.set) HEYS.store.set('heys_meal_hint_shown', '1');
                                else if (utils.lsSet) utils.lsSet('heys_meal_hint_shown', '1');
                                else localStorage.setItem('heys_meal_hint_shown', '1');
                            } catch { }
                        }
                        if (quality.score >= 95) {
                            setShowConfetti(true);
                            setTimeout(() => setShowConfetti(false), 2000);
                        }
                        setMealQualityPopup({
                            meal,
                            quality,
                            mealTypeInfo: { label: meal.name, icon: meal.icon },
                            x: rect.left + rect.width / 2,
                            y: rect.bottom,
                        });
                    };

                    const scrollToMealCard = (e) => {
                        e.stopPropagation();
                        try {
                            let target = null;
                            if (meal?.id) {
                                target = document.querySelector(`[data-meal-id="${meal.id}"]`);
                            }
                            if (!target && meal?.time) {
                                target = document.querySelector(`[data-meal-time="${meal.time}"]`);
                            }
                            if (!target && Number.isFinite(originalIndex)) {
                                target = document.querySelector(`[data-meal-index="${originalIndex}"]`);
                            }
                            if (target && typeof target.scrollIntoView === 'function') {
                                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        } catch (err) {
                            console.warn('[HEYS.day] ⚠️ Scroll to meal failed:', err?.message || err);
                        }
                    };

                    const isLowScore = quality && quality.score < 50;
                    const isNewMeal = newMealAnimatingIndex === originalIndex;
                    const qualityBadgeStyle = quality ? (
                        quality.score >= 80
                            ? { background: 'rgba(34, 197, 94, 0.14)', color: '#16a34a', borderColor: 'rgba(34, 197, 94, 0.28)' }
                            : quality.score >= 50
                                ? { background: 'rgba(245, 158, 11, 0.14)', color: '#b45309', borderColor: 'rgba(245, 158, 11, 0.28)' }
                                : { background: 'rgba(239, 68, 68, 0.14)', color: '#dc2626', borderColor: 'rgba(239, 68, 68, 0.28)' }
                    ) : null;
                    return React.createElement('div', {
                        key: i,
                        className: 'meal-bar-row' + (isNewMeal ? ' meal-bar-new' : ''),
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 4px',
                            marginLeft: '-6px',
                            marginRight: '-6px',
                            borderRadius: '6px',
                            background: isLowScore ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                            transition: 'background 0.2s ease',
                        },
                    },
                        meal.time && React.createElement('span', {
                            style: {
                                width: '46px',
                                fontSize: '11px',
                                fontWeight: '600',
                                color: 'var(--text-primary, #374151)',
                                textAlign: 'left',
                                flexShrink: 0,
                            },
                        }, utils.formatMealTime ? utils.formatMealTime(meal.time) : meal.time),
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-start',
                                gap: '3px',
                                minWidth: '84px',
                                fontSize: '11px',
                                fontWeight: '600',
                                color: 'var(--text-primary, #1e293b)',
                                flexShrink: 0,
                                textAlign: 'left',
                            },
                        },
                            React.createElement('span', { style: { fontSize: '14px' } }, meal.icon),
                            React.createElement('button', {
                                type: 'button',
                                onClick: scrollToMealCard,
                                title: 'Прокрутить к этому приёму',
                                style: {
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '0',
                                    margin: '0',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    color: 'inherit',
                                    cursor: 'pointer',
                                    textDecoration: 'none',
                                    textAlign: 'left',
                                },
                            }, meal.name),
                        ),
                        React.createElement('div', {
                            className: 'meal-bar-container' + (isBest ? ' meal-bar-best' : '') + (quality && quality.score >= 80 ? ' meal-bar-excellent' : ''),
                            role: quality ? 'button' : undefined,
                            tabIndex: quality ? 0 : undefined,
                            onClick: openQualityModal,
                            onKeyDown: quality ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQualityModal(); } } : undefined,
                            style: {
                                flex: 1,
                                minWidth: 0,
                                height: '18px',
                                background: 'var(--meal-bar-track, rgba(148,163,184,0.24))',
                                borderRadius: '4px',
                                overflow: 'visible',
                                position: 'relative',
                                cursor: quality ? 'pointer' : 'default',
                                boxShadow: isBest ? '0 0 0 2px #fbbf24, 0 2px 8px rgba(251,191,36,0.3)' : undefined,
                            },
                        },
                            React.createElement('div', {
                                style: {
                                    width: barWidthPct + '%',
                                    height: '100%',
                                    background: barFill,
                                    borderRadius: '4px',
                                    transition: 'width 0.3s ease',
                                },
                            }),
                            meal.kcal > 0 && React.createElement('span', {
                                style: {
                                    position: 'absolute',
                                    left: `calc(${barWidthPct}% + 6px)`,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    fontSize: '9px',
                                    fontWeight: '600',
                                    color: 'var(--text-primary, #1f2937)',
                                    whiteSpace: 'nowrap',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                },
                            },
                                meal.kcal + ' ккал',
                                React.createElement('span', {
                                    style: {
                                        fontSize: '8px',
                                        color: 'var(--text-tertiary, #9ca3af)',
                                        fontWeight: '500',
                                    },
                                }, '(' + Math.round(widthPct) + '%)'),
                            ),
                            problemBadges.length > 0 && React.createElement('div', {
                                style: {
                                    position: 'absolute',
                                    right: '4px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    display: 'flex',
                                    gap: '2px',
                                },
                            },
                                problemBadges.map((b, idx) =>
                                    React.createElement('span', {
                                        key: idx,
                                        style: {
                                            fontSize: '8px',
                                            padding: '1px 3px',
                                            borderRadius: '3px',
                                            background: 'rgba(239,68,68,0.9)',
                                            color: '#fff',
                                            fontWeight: '600',
                                        },
                                    }, '!' + b.type),
                                ),
                            ),
                        ),
                        quality && React.createElement('span', {
                            className: 'meal-quality-score',
                            style: {
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                minWidth: '46px',
                                padding: '2px 6px',
                                borderRadius: '999px',
                                border: `1px solid ${qualityBadgeStyle?.borderColor || 'rgba(148,163,184,0.25)'}`,
                                background: qualityBadgeStyle?.background || 'rgba(148,163,184,0.12)',
                                color: qualityBadgeStyle?.color || quality.color,
                                fontWeight: 700,
                                fontSize: '11px',
                                lineHeight: 1,
                                flexShrink: 0,
                            },
                        },
                            React.createElement('span', { style: { fontSize: '12px' } }, '⭐'),
                            React.createElement('span', null, String(quality.score)),
                        ),
                    );
                }),
                mealsChartData.qualityStreak >= 3 && React.createElement('div', { className: 'meal-quality-streak-banner' },
                    React.createElement('span', { className: 'streak-fire' }, '🔥'),
                    React.createElement('span', { style: { fontWeight: '600', color: '#92400e' } }, mealsChartData.qualityStreak + ' отличных приёмов подряд!'),
                    React.createElement('span', { style: { fontSize: '16px' } }, '🏆'),
                ),
                showFirstPerfectAchievement && React.createElement('div', { className: 'first-perfect-meal-badge', style: { marginTop: '8px' } },
                    React.createElement('span', { className: 'trophy' }, '🏆'),
                    'Первый идеальный приём!',
                    React.createElement('span', null, '✨'),
                ),
            ),
        );
    };

    HEYS.dayMealsChartUI = MealsChartUI;

    // =========================
    // Meal expand state
    // =========================
    function useMealExpandState(params) {
        const { date } = params || {};
        if (!React) return {};

        const expandedMealsKey = 'heys_expandedMeals_' + date;

        const [manualExpandedStale, setManualExpandedStale] = React.useState({});
        const [expandedMeals, setExpandedMeals] = React.useState(() => {
            try {
                const cached = sessionStorage.getItem(expandedMealsKey);
                return cached ? JSON.parse(cached) : {};
            } catch (e) {
                return {};
            }
        });

        React.useEffect(() => {
            try {
                sessionStorage.setItem(expandedMealsKey, JSON.stringify(expandedMeals));
            } catch (e) { }
        }, [expandedMeals, expandedMealsKey]);

        const isMealStale = React.useCallback((meal) => {
            if (!meal || !meal.time) return false;
            const [hours, minutes] = meal.time.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) return false;
            const now = new Date();
            const mealDate = new Date();
            mealDate.setHours(hours, minutes, 0, 0);
            const diffMinutes = (now - mealDate) / (1000 * 60);
            return diffMinutes > 30;
        }, []);

        const toggleMealExpand = React.useCallback((mealIndex, meals) => {
            const meal = meals && meals[mealIndex];
            const isStale = meal && isMealStale(meal);

            if (isStale) {
                setManualExpandedStale((prev) => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
            } else {
                setExpandedMeals((prev) => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
            }
        }, [isMealStale]);

        const expandOnlyMeal = React.useCallback((mealIndex) => {
            const newState = {};
            newState[mealIndex] = true;
            setExpandedMeals(newState);
        }, []);

        const isMealExpanded = React.useCallback((mealIndex, totalMeals, meals, displayIndex = null) => {
            const meal = meals && meals[mealIndex];
            const isStale = meal && isMealStale(meal);

            if (isStale) {
                return manualExpandedStale[mealIndex] === true;
            }

            if (expandedMeals.hasOwnProperty(mealIndex)) {
                return expandedMeals[mealIndex];
            }

            if (displayIndex !== null) {
                return displayIndex === 0;
            }
            return mealIndex === totalMeals - 1;
        }, [expandedMeals, manualExpandedStale, isMealStale]);

        return {
            isMealStale,
            toggleMealExpand,
            expandOnlyMeal,
            isMealExpanded,
        };
    }

    HEYS.dayMealExpandState = {
        useMealExpandState,
    };

    // =========================
    // Meal handlers
    // =========================
    if (!HEYS.dayUtils) {
        trackError(new Error('[HEYS Day Meals] HEYS.dayUtils is required'), {
            source: 'day/_meals.js',
            type: 'missing_dependency',
        });
    }
    const { haptic, lsSet, lsGet, uid, timeToMinutes, MEAL_TYPES: MEAL_TYPES_HANDLER } = HEYS.dayUtils || {};

    function sortMealsByTime(meals) {
        if (!meals || meals.length <= 1) return meals;

        return [...meals].sort((a, b) => {
            const timeA = timeToMinutes ? timeToMinutes(a.time) : null;
            const timeB = timeToMinutes ? timeToMinutes(b.time) : null;

            if (timeA === null && timeB === null) return 0;
            if (timeA === null) return 1;
            if (timeB === null) return -1;

            return timeB - timeA;
        });
    }

    function createMealHandlers(deps) {
        const {
            setDay,
            expandOnlyMeal,
            date,
            products,
            day,
            prof,
            pIndex,
            getProductFromItem,
            isMobile,
            openTimePickerForNewMeal,
            scrollToDiaryHeading,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            newItemIds,
            setNewItemIds,
        } = deps;

        const addMeal = React.useCallback(async () => {
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast('Добавление приёма пищи недоступно');
                return;
            }

            if (isMobile && HEYS.MealStep) {
                HEYS.MealStep.showAddMeal({
                    dateKey: date,
                    meals: day.meals,
                    pIndex,
                    getProductFromItem,
                    trainings: day.trainings || [],
                    deficitPct: Number(day.deficitPct ?? prof?.deficitPctTarget ?? 0),
                    prof,
                    dayData: day,
                    onComplete: (newMeal) => {
                        const newMealId = newMeal.id;
                        const newUpdatedAt = Date.now();
                        lastLoadedUpdatedAtRef.current = newUpdatedAt;
                        blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                        setDay((prevDay) => {
                            const newMeals = sortMealsByTime([...(prevDay.meals || []), newMeal]);
                            const newDayData = { ...prevDay, meals: newMeals, updatedAt: newUpdatedAt };

                            const key = 'heys_dayv2_' + date;
                            try {
                                lsSet(key, newDayData);
                            } catch (e) {
                                trackError(e, { source: 'day/_meals.js', action: 'save_meal' });
                            }

                            return newDayData;
                        });

                        if (window.HEYS && window.HEYS.analytics) {
                            window.HEYS.analytics.trackDataOperation('meal-created');
                        }
                        HEYS.Toast?.success('Приём создан');
                        window.dispatchEvent(new CustomEvent('heysMealAdded', { detail: { meal: newMeal } }));

                        // 🆕 Стабильный флоу: lazy-вычисление индекса через HEYS.Day, retry через rAF
                        const savedMealName = (newMeal.name || '').toLowerCase();

                        const findMealIndex = () => {
                            const currentDay = HEYS.Day?.getDay?.();
                            if (!currentDay?.meals) return -1;
                            return currentDay.meals.findIndex((m) => m.id === newMealId);
                        };

                        const showFlowModal = (attempt) => {
                            const maxAttempts = 5;
                            const mealIndex = findMealIndex();

                            if (mealIndex < 0) {
                                if (attempt < maxAttempts) {
                                    // Retry: React ещё не применил state update
                                    requestAnimationFrame(() => showFlowModal(attempt + 1));
                                    return;
                                }
                                console.warn('[HEYS.Day] ⚠️ Flow modal skipped: meal not found after', maxAttempts, 'attempts', { newMealId });
                                return;
                            }

                            expandOnlyMeal(mealIndex);
                            const mealName = savedMealName || `приём ${mealIndex + 1}`;

                            // Функция открытия модалки добавления продукта
                            const openAddProductModal = (targetMealIndex, multiProductMode, dayOverride) => {
                                if (!window.HEYS?.AddProductStep?.show) return;

                                window.HEYS.AddProductStep.show({
                                    mealIndex: targetMealIndex,
                                    multiProductMode: multiProductMode,
                                    products: products,
                                    day: dayOverride || HEYS.Day?.getDay?.() || day,
                                    dateKey: date,
                                    onAdd: ({ product, grams, mealIndex: addMealIndex }) => {
                                        let finalProduct = product;
                                        if (product?._fromShared || product?._source === 'shared' || product?.is_shared) {
                                            const cloned = HEYS.products?.addFromShared?.(product);
                                            if (cloned) {
                                                finalProduct = cloned;
                                            }
                                        }

                                        const productId = finalProduct.id ?? finalProduct.product_id ?? finalProduct.name;
                                        // 🆕 v2.8.2: Трекаем использование для сортировки по популярности
                                        HEYS?.SmartSearchWithTypos?.trackProductUsage?.(String(productId));
                                        console.info('[HEYS.search] ✅ Product usage tracked:', { productId: String(productId), name: finalProduct.name });
                                        const computeTEFKcal100 = (p) => {
                                            const carbs = (+p.carbs100) || ((+p.simple100 || 0) + (+p.complex100 || 0));
                                            const fat = (+p.fat100) || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
                                            return Math.round((3 * (+p.protein100 || 0) + 4 * carbs + 9 * fat) * 10) / 10;
                                        };
                                        const newItem = {
                                            id: uid('it_'),
                                            product_id: finalProduct.id ?? finalProduct.product_id,
                                            name: finalProduct.name,
                                            grams: grams || 100,
                                            ...(finalProduct.kcal100 !== undefined && {
                                                kcal100: computeTEFKcal100(finalProduct),
                                                protein100: finalProduct.protein100,
                                                carbs100: finalProduct.carbs100,
                                                fat100: finalProduct.fat100,
                                                simple100: finalProduct.simple100,
                                                complex100: finalProduct.complex100,
                                                badFat100: finalProduct.badFat100,
                                                goodFat100: finalProduct.goodFat100,
                                                trans100: finalProduct.trans100,
                                                fiber100: finalProduct.fiber100,
                                                gi: finalProduct.gi,
                                                harm: HEYS.models?.normalizeHarm?.(finalProduct),  // Canonical harm field
                                            }),
                                        };

                                        const newUpdatedAt = Date.now();
                                        lastLoadedUpdatedAtRef.current = newUpdatedAt;
                                        blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                                        setDay((prevDay = {}) => {
                                            const updatedMeals = (prevDay.meals || []).map((m, i) =>
                                                i === addMealIndex
                                                    ? { ...m, items: [...(m.items || []), newItem] }
                                                    : m,
                                            );
                                            const newDayData = { ...prevDay, meals: updatedMeals, updatedAt: newUpdatedAt };

                                            const key = 'heys_dayv2_' + date;
                                            try {
                                                lsSet(key, newDayData);
                                            } catch (e) {
                                                trackError(e, { source: 'day/_meals.js', action: 'save_product' });
                                            }

                                            return newDayData;
                                        });

                                        try { navigator.vibrate?.(10); } catch (e) { }
                                        window.dispatchEvent(new CustomEvent('heysProductAdded', { detail: { product: finalProduct, grams } }));
                                        try {
                                            lsSet(`heys_last_grams_${productId}`, grams);
                                            const history = lsGet('heys_grams_history', {});
                                            if (!history[productId]) history[productId] = [];
                                            history[productId].push(grams);
                                            if (history[productId].length > 20) history[productId].shift();
                                            lsSet('heys_grams_history', history);
                                        } catch (e) { }
                                        if (multiProductMode && HEYS.dayAddProductSummary?.show) {
                                            requestAnimationFrame(() => {
                                                setTimeout(() => {
                                                    HEYS.dayAddProductSummary.show({
                                                        day: HEYS.Day?.getDay?.() || day || {},
                                                        mealIndex: addMealIndex,
                                                        pIndex,
                                                        getProductFromItem,
                                                        per100,
                                                        scale,
                                                        onAddMore: (updatedDay) => openAddProductModal(addMealIndex, true, updatedDay),
                                                    });
                                                }, 100);
                                            });
                                        }
                                        if (scrollToDiaryHeading) scrollToDiaryHeading();
                                    },
                                    onNewProduct: () => {
                                        if (window.HEYS?.products?.showAddModal) {
                                            window.HEYS.products.showAddModal();
                                        }
                                    },
                                });
                            };

                            // Показываем модалку выбора флоу
                            if (!window.HEYS?.ConfirmModal?.show) {
                                // Fallback: сразу открываем быстрый режим
                                openAddProductModal(mealIndex, false);
                                return;
                            }

                            window.HEYS.ConfirmModal.show({
                                icon: '🍽️',
                                title: `Добавить продукты в ${mealName}`,
                                text: React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        margin: '8px 0'
                                    }
                                },
                                    // Кнопка "Быстро добавить 1 продукт"
                                    React.createElement('button', {
                                        className: 'flow-selection-btn flow-selection-btn--quick',
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '14px 16px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '12px',
                                            background: '#fff',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease'
                                        },
                                        onClick: () => {
                                            window.HEYS.ConfirmModal.hide();
                                            // Lazy-вычисляем актуальный индекс на момент клика
                                            const actualIdx = findMealIndex();
                                            if (actualIdx >= 0) {
                                                setTimeout(() => openAddProductModal(actualIdx, false), 100);
                                            }
                                        }
                                    },
                                        React.createElement('span', {
                                            style: { fontSize: '28px' }
                                        }, '➕'),
                                        React.createElement('div', {
                                            style: { flex: 1 }
                                        },
                                            React.createElement('div', {
                                                style: { fontWeight: '600', color: '#1e293b', fontSize: '15px' }
                                            }, 'Быстро добавить 1 продукт'),
                                            React.createElement('div', {
                                                style: { fontSize: '12px', color: '#64748b', marginTop: '2px' }
                                            }, 'Выбрать продукт и сразу закрыть')
                                        )
                                    ),
                                    // Кнопка "Добавить несколько продуктов"
                                    React.createElement('button', {
                                        className: 'flow-selection-btn flow-selection-btn--multi',
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '14px 16px',
                                            border: '2px solid #3b82f6',
                                            borderRadius: '12px',
                                            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease'
                                        },
                                        onClick: () => {
                                            window.HEYS.ConfirmModal.hide();
                                            // Lazy-вычисляем актуальный индекс на момент клика
                                            const actualIdx = findMealIndex();
                                            if (actualIdx >= 0) {
                                                setTimeout(() => openAddProductModal(actualIdx, true), 100);
                                            }
                                        }
                                    },
                                        React.createElement('span', {
                                            style: { fontSize: '28px' }
                                        }, '📝'),
                                        React.createElement('div', {
                                            style: { flex: 1 }
                                        },
                                            React.createElement('div', {
                                                style: { fontWeight: '600', color: '#1e40af', fontSize: '15px' }
                                            }, 'Добавить несколько продуктов'),
                                            React.createElement('div', {
                                                style: { fontSize: '12px', color: '#3b82f6', marginTop: '2px' }
                                            }, 'Формировать приём пошагово')
                                        )
                                    )
                                ),
                                // Скрываем стандартную кнопку confirm — используем кастомные внутри text
                                confirmText: '',
                                cancelText: 'Отмена',
                                cancelStyle: 'primary',
                                cancelVariant: 'outline'
                            });
                        };

                        // Запускаем через rAF — ждём пока React применит state update
                        requestAnimationFrame(() => showFlowModal(1));
                    },
                });
            } else if (isMobile) {
                if (openTimePickerForNewMeal) openTimePickerForNewMeal();
            } else {
                const newMealId = uid('m_');
                const newMeal = { id: newMealId, name: 'Приём', time: '', mood: '', wellbeing: '', stress: '', items: [] };
                const newUpdatedAt = Date.now();
                let newMealIndex = 0;
                if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
                if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;
                setDay((prevDay) => {
                    const baseMeals = prevDay.meals || [];
                    const newMeals = [...baseMeals, newMeal];
                    newMealIndex = newMeals.length - 1;
                    const newDayData = { ...prevDay, meals: newMeals, updatedAt: newUpdatedAt };
                    const key = 'heys_dayv2_' + date;
                    try {
                        lsSet(key, newDayData);
                    } catch (e) {
                        trackError(e, { source: 'day/_meals.js', action: 'save_meal_desktop' });
                    }
                    return newDayData;
                });
                expandOnlyMeal(newMealIndex);
                if (window.HEYS && window.HEYS.analytics) {
                    window.HEYS.analytics.trackDataOperation('meal-created');
                }
                HEYS.Toast?.success('Приём создан');
                window.dispatchEvent(new CustomEvent('heysMealAdded', { detail: { meal: newMeal } }));
            }
        }, [date, expandOnlyMeal, isMobile, openTimePickerForNewMeal, products, setDay, day, prof, pIndex, getProductFromItem, scrollToDiaryHeading, lastLoadedUpdatedAtRef, blockCloudUpdatesUntilRef]);

        const updateMealTime = React.useCallback((mealIndex, newTime) => {
            setDay((prevDay) => {
                const updatedMeals = (prevDay.meals || []).map((m, i) =>
                    i === mealIndex ? { ...m, time: newTime } : m,
                );
                const sortedMeals = sortMealsByTime(updatedMeals);
                return { ...prevDay, meals: sortedMeals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const removeMeal = React.useCallback(async (i) => {
            const confirmed = await HEYS.ConfirmModal?.confirmDelete({
                icon: '🗑️',
                title: 'Удалить приём пищи?',
                text: 'Все продукты в этом приёме будут удалены. Это действие нельзя отменить.',
            });

            if (!confirmed) return;

            haptic('medium');
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).filter((_, idx) => idx !== i);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [haptic, setDay]);

        const addProductToMeal = React.useCallback((mi, p) => {
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast('Добавление продуктов недоступно');
                return;
            }

            haptic('light');

            console.info('[HEYS.day] ➕ addProductToMeal', {
                mealIndex: mi,
                productId: p?.id ?? p?.product_id ?? null,
                productName: p?.name || null,
                source: p?._source || (p?._fromShared ? 'shared' : 'personal')
            });

            let finalProduct = p;
            if (p?._fromShared || p?._source === 'shared' || p?.is_shared) {
                const cloned = HEYS.products?.addFromShared?.(p);
                if (cloned) {
                    finalProduct = cloned;
                }
            }

            // Use centralized harm normalization
            const harmVal = HEYS.models?.normalizeHarm?.(finalProduct);

            const item = {
                id: uid('it_'),
                product_id: finalProduct.id ?? finalProduct.product_id,
                name: finalProduct.name,
                grams: finalProduct.grams || 100,
                kcal100: finalProduct.kcal100,
                protein100: finalProduct.protein100,
                fat100: finalProduct.fat100,
                simple100: finalProduct.simple100,
                complex100: finalProduct.complex100,
                badFat100: finalProduct.badFat100,
                goodFat100: finalProduct.goodFat100,
                trans100: finalProduct.trans100,
                fiber100: finalProduct.fiber100,
                gi: finalProduct.gi ?? finalProduct.gi100,
                harm: harmVal,  // Normalized harm (0-10)
            };
            const newUpdatedAt = Date.now();
            if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
            if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;
            setDay((prevDay) => {
                const mealsList = prevDay.meals || [];
                if (!mealsList[mi]) {
                    console.warn('[HEYS.day] ❌ Meal index not found for addProductToMeal', {
                        mealIndex: mi,
                        mealsCount: mealsList.length,
                        productName: finalProduct?.name || null
                    });
                }
                const meals = mealsList.map((m, i) => i === mi ? { ...m, items: [...(m.items || []), item] } : m);
                const newDayData = { ...prevDay, meals, updatedAt: newUpdatedAt };
                const key = 'heys_dayv2_' + date;
                try {
                    lsSet(key, newDayData);
                } catch (e) {
                    trackError(e, { source: 'day/_meals.js', action: 'save_product_quick' });
                }
                return newDayData;
            });

            if (setNewItemIds) {
                setNewItemIds((prev) => new Set([...prev, item.id]));
                setTimeout(() => {
                    setNewItemIds((prev) => {
                        const next = new Set(prev);
                        next.delete(item.id);
                        return next;
                    });
                }, 500);
            }

            window.dispatchEvent(new CustomEvent('heysProductAdded'));
        }, [haptic, setDay, setNewItemIds, date]);

        const setGrams = React.useCallback((mi, itId, g) => {
            const grams = +g || 0;
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => i === mi ? { ...m, items: (m.items || []).map((it) => it.id === itId ? { ...it, grams } : it) } : m);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const removeItem = React.useCallback((mi, itId) => {
            haptic('medium');
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => i === mi ? { ...m, items: (m.items || []).filter((it) => it.id !== itId) } : m);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
            setTimeout(() => {
                if (window.HEYS?.orphanProducts?.recalculate) {
                    window.HEYS.orphanProducts.recalculate();
                }
            }, 100);
        }, [haptic, setDay]);

        const updateMealField = React.useCallback((mealIndex, field, value) => {
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => i === mealIndex ? { ...m, [field]: value } : m);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const changeMealMood = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'mood', value), [updateMealField]);
        const changeMealWellbeing = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'wellbeing', value), [updateMealField]);
        const changeMealStress = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'stress', value), [updateMealField]);

        const changeMealType = React.useCallback((mealIndex, newType) => {
            const newUpdatedAt = Date.now();
            if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
            if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => {
                    if (i !== mealIndex) return m;
                    const newName = newType && MEAL_TYPES_HANDLER && MEAL_TYPES_HANDLER[newType]
                        ? MEAL_TYPES_HANDLER[newType].name
                        : m.name;
                    return { ...m, mealType: newType, name: newName };
                });
                return { ...prevDay, meals, updatedAt: newUpdatedAt };
            });
            haptic('light');
        }, [setDay, lastLoadedUpdatedAtRef, blockCloudUpdatesUntilRef]);

        const isNewItem = React.useCallback((itemId) => newItemIds && newItemIds.has(itemId), [newItemIds]);

        return {
            addMeal,
            updateMealTime,
            removeMeal,
            addProductToMeal,
            setGrams,
            removeItem,
            updateMealField,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            changeMealType,
            isNewItem,
            sortMealsByTime,
        };
    }

    HEYS.dayMealHandlers = {
        createMealHandlers,
        sortMealsByTime,
    };

})(window);
// ===== End day/_meals.js =====

// ===== Begin heys_day_diary_section.js =====
;(function (HEYS) {
    'use strict';

    const renderDiarySection = (params) => {

        const {
            React,
            isMobile,
            mobileSubTab,
            goalProgressBar,
            mealsChart,
            insulinWaveData,
            insulinExpanded,
            setInsulinExpanded,
            openExclusivePopup,
            addMeal,
            day,
            mealsUI,
            daySummary,
            caloricDebt,
            eatenKcal,
            optimum,
            displayOptimum,
            date,
            prof,
            pIndex,
            dayTot,
            normAbs,
            HEYS: rootHEYs
        } = params || {};

        if (!React) {
            console.warn('[HEYS.diary] ❌ No React provided, returning null');
            return null;
        }

        const app = rootHEYs || HEYS;
        const showDiary = !isMobile || mobileSubTab === 'diary';

        const ensureSupplementsModule = () => {
            if (app.Supplements?.renderCard) return true;
            if (typeof document === 'undefined') return false;
            if (window.__heysSupplementsLoading) return false;

            window.__heysSupplementsLoading = true;
            const script = document.createElement('script');
            script.src = 'heys_supplements_v1.js?v=1';
            script.async = true;
            script.onload = () => {
                window.__heysSupplementsLoading = false;
                window.dispatchEvent(new CustomEvent('heys-deferred-module-loaded', {
                    detail: { module: 'supplements' }
                }));
            };
            script.onerror = () => {
                window.__heysSupplementsLoading = false;
            };
            document.head.appendChild(script);
            return false;
        };

        const insulinIndicator = app.dayInsulinWaveUI?.renderInsulinWaveIndicator?.({
            React,
            insulinWaveData,
            insulinExpanded,
            setInsulinExpanded,
            mobileSubTab,
            isMobile,
            openExclusivePopup,
            HEYS: app
        }) || null;

        const refeedCard = app.Refeed?.renderRefeedCard?.({
            isRefeedDay: day?.isRefeedDay,
            refeedReason: day?.refeedReason,
            caloricDebt,
            eatenKcal,
            optimum
        }) || null;


        // PERF v8.0: Separate module readiness from content — enables skeleton UX
        const cascadeReady = !!app.CascadeCard?.renderCard;
        const cascadeCard = cascadeReady ? (app.CascadeCard.renderCard({
            React, day, prof, pIndex, dayTot, normAbs
        }) || null) : null;

        const mealRecReady = !!app.MealRecCard?.renderCard && !!app.InsightsPI?.mealRecommender?.recommend;
        const mealRecCard = mealRecReady ? (app.MealRecCard.renderCard({
            React,
            day,
            prof,
            pIndex,
            dayTot,
            normAbs,
            optimum: displayOptimum || optimum
        }) || null) : null;

        if (mealRecCard) {
            if (!window.__heysLoggedMealRecRendered) {
                window.__heysLoggedMealRecRendered = true;
                console.info('[HEYS.diary] ✅ Meal rec card rendered');
            }
        } else if (mealRecReady) {
            // Only log when module loaded but no recommendation (not when still loading)
            if (!window.__heysLoggedMealRecNull) {
                window.__heysLoggedMealRecNull = true;
                console.info('[HEYS.diary] ℹ️ Meal rec card: no recommendation');
            }
        }

        const dateKey = date
            || day?.date
            || app.models?.todayISO?.()
            || new Date().toISOString().slice(0, 10);
        const supplementsReady = !!app.Supplements?.renderCard;
        if (!supplementsReady) ensureSupplementsModule();
        const supplementsCard = supplementsReady && dateKey ? (app.Supplements.renderCard({
            dateKey,
            dayData: day,
            onForceUpdate: () => {
                window.dispatchEvent(new CustomEvent('heys:day-updated', {
                    detail: { date: dateKey, source: 'supplements-update', forceReload: true }
                }));
            }
        }) || null) : null;

        // PERF v8.3: Deferred card slot — skeleton only after postboot completes
        // If postboot is still loading scripts, return null (invisible).
        // Skeleton only shows if postboot finished but module is STILL not ready (abnormal).
        const DEFERRED_SKELETON_DELAY_MS = 260;
        const deferredSlotLoadSince = window.__heysDeferredSlotLoadSince = window.__heysDeferredSlotLoadSince || Object.create(null);
        const deferredSkeletonState = window.__heysDeferredSkeletonState = window.__heysDeferredSkeletonState || Object.create(null);
        const deferredPendingSlot = (slotKey) => React.createElement('div', {
            key: slotKey,
            className: 'deferred-card-slot deferred-card-slot--pending',
            'aria-hidden': 'true'
        });
        const deferredSlot = (ready, content, slotKey, skeletonH, skeletonIcon, skeletonLabel) => {
            const debugKey = slotKey || 'unknown-slot';
            if (!ready) {
                // Don't show skeleton while postboot is still loading scripts
                if (!window.__heysPostbootDone) {
                    if (deferredSkeletonState[debugKey] !== 'wait_postboot') {
                        console.info('[HEYS.sceleton] ⏳ wait_postboot', { slotKey: debugKey });
                        deferredSkeletonState[debugKey] = 'wait_postboot';
                    }
                    return deferredPendingSlot(slotKey); // Keep stable DOM slot, zero-height
                }

                // Anti-flicker: render skeleton only if module is still not ready after a small delay
                const now = Date.now();
                if (slotKey && !deferredSlotLoadSince[slotKey]) {
                    deferredSlotLoadSince[slotKey] = now;
                }
                const waitStart = slotKey ? deferredSlotLoadSince[slotKey] : now;
                if ((now - waitStart) < DEFERRED_SKELETON_DELAY_MS) {
                    if (deferredSkeletonState[debugKey] !== 'wait_delay') {
                        console.info('[HEYS.sceleton] ⏱️ wait_delay', {
                            slotKey: debugKey,
                            elapsedMs: now - waitStart,
                            delayMs: DEFERRED_SKELETON_DELAY_MS
                        });
                        deferredSkeletonState[debugKey] = 'wait_delay';
                    }
                    return deferredPendingSlot(slotKey);
                }

                if (deferredSkeletonState[debugKey] !== 'show_skeleton') {
                    console.info('[HEYS.sceleton] 🦴 show_skeleton', {
                        slotKey: debugKey,
                        elapsedMs: now - waitStart,
                        delayMs: DEFERRED_SKELETON_DELAY_MS
                    });
                    deferredSkeletonState[debugKey] = 'show_skeleton';
                }

                return React.createElement('div', { key: slotKey, className: 'deferred-card-slot deferred-card-slot--loading' },
                    React.createElement('div', {
                        className: 'deferred-card-skeleton',
                        style: { minHeight: skeletonH + 'px' }
                    },
                        React.createElement('div', { className: 'deferred-card-skeleton__shimmer' }),
                        React.createElement('div', { className: 'deferred-card-skeleton__content' },
                            skeletonIcon && React.createElement('div', { className: 'deferred-card-skeleton__icon' }, skeletonIcon),
                            skeletonLabel && React.createElement('div', { className: 'deferred-card-skeleton__label' }, skeletonLabel)
                        )
                    )
                );
            }

            if (slotKey && deferredSlotLoadSince[slotKey]) {
                delete deferredSlotLoadSince[slotKey];
            }

            if (!content) {
                if (deferredSkeletonState[debugKey] !== 'ready_empty') {
                    console.info('[HEYS.sceleton] ℹ️ ready_empty', { slotKey: debugKey });
                    deferredSkeletonState[debugKey] = 'ready_empty';
                }
                return React.createElement('div', { key: slotKey, className: 'deferred-card-slot deferred-card-slot--empty' });
            }
            if (deferredSkeletonState[debugKey] !== 'ready_content') {
                console.info('[HEYS.sceleton] ✅ ready_content', { slotKey: debugKey });
                deferredSkeletonState[debugKey] = 'ready_content';
            }
            const slotTypeClass = slotKey ? ('deferred-card-slot--' + String(slotKey).replace(/^slot-/, '')) : '';
            // PERF: skip unfold animation if user has cached local data (returning user)
            // Meal rec card always uses smooth unfold (loads late, needs visual transition)
            // v6.0: Adaptive Render Gate — when __heysGatedRender is true (full sync arrived
            // before DayTab unlock), ALL cards render instantly in one frame, no animation
            const animClass = window.__heysGatedRender
                ? 'no-animate'
                : ((window.__heysHasLocalData && slotKey !== 'slot-mealrec') ? 'no-animate' : 'animate-always');
            return React.createElement('div', {
                key: slotKey,
                className: ('deferred-card-slot deferred-card-slot--loaded ' + animClass + ' ' + slotTypeClass).trim()
            }, content);
        };

        if (!showDiary) return insulinIndicator;

        return React.createElement(React.Fragment, null,
            React.createElement('h2', {
                id: 'day-remaining-heading',
                style: {
                    fontSize: '24px',
                    fontWeight: '800',
                    color: 'var(--text, #1e293b)',
                    margin: '12px 0 16px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    textAlign: 'center',
                    scrollMarginTop: '150px'
                }
            }, 'ОСТАЛОСЬ НА СЕГОДНЯ'),
            goalProgressBar,
            deferredSlot(cascadeReady, cascadeCard, 'slot-cascade', 140, '🔬', 'Анализируем ваши данные, чтобы показать состояние поведенческого каскада'),
            refeedCard,
            deferredSlot(mealRecReady, mealRecCard, 'slot-mealrec', 72, '🍽️', 'Загружаем ваши данные, чтобы умный планировщик дал точные рекомендации на остаток дня'),
            deferredSlot(supplementsReady, supplementsCard, 'slot-supplements', 96, '💊', 'Подготавливаем план добавок на сегодня'),
            mealsChart,
            insulinIndicator,
            React.createElement('div', {
                className: 'diary-section-separator diary-section-separator--full-width',
                style: {
                    margin: '36px -18px 0 -18px',
                    padding: '16px 18px 18px 18px',
                    borderTop: '1px solid rgba(37, 99, 235, 0.24)'
                }
            },
                React.createElement('h2', {
                    id: 'diary-heading',
                    style: {
                        fontSize: '24px',
                        fontWeight: '800',
                        color: 'var(--text, #1e293b)',
                        margin: '12px 0 20px 0',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        textAlign: 'center',
                        scrollMarginTop: '150px'
                    }
                }, 'ДНЕВНИК ПИТАНИЯ'),
                React.createElement('button', {
                    className: 'add-meal-btn-full',
                    onClick: addMeal,
                    style: {
                        width: '100%',
                        padding: '18px 24px',
                        marginBottom: '20px',
                        fontSize: '17px',
                        fontWeight: '700',
                        color: '#fff',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        border: 'none',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                        transition: 'all 0.2s ease',
                        WebkitTapHighlightColor: 'transparent'
                    }
                },
                    React.createElement('span', { style: { fontSize: '22px' } }, '➕'),
                    'Добавить приём пищи'
                ),
                (!day?.meals || day.meals.length === 0) && React.createElement('div', { className: 'empty-state' },
                    React.createElement('div', { className: 'empty-state-icon' }, '🍽️'),
                    React.createElement('div', { className: 'empty-state-title' }, 'Пока нет приёмов пищи'),
                    React.createElement('div', { className: 'empty-state-text' }, 'Добавьте первый приём, чтобы начать отслеживание'),
                    React.createElement('button', {
                        className: 'btn btn-primary empty-state-btn',
                        onClick: addMeal,
                        style: {
                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)'
                        }
                    }, '+ Добавить приём')
                ),
                mealsUI,
                daySummary,
                React.createElement('div', { className: 'row desktop-only', style: { justifyContent: 'flex-start', marginTop: '8px' } },
                    React.createElement('button', { className: 'btn', onClick: addMeal }, '+ Приём')
                )
            ),
        );
    };

    HEYS.dayDiarySection = HEYS.dayDiarySection || {};
    HEYS.dayDiarySection.renderDiarySection = renderDiarySection;
})(window.HEYS = window.HEYS || {});
// ===== End heys_day_diary_section.js =====

// ===== Begin heys_day_orphan_alert.js =====
;// heys_day_orphan_alert.js — Orphan products alert component
// Phase 13A of HEYS Day v12 refactoring
// Extracted from heys_day_v12.js lines 11,923-12,012
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  /**
   * Render orphan products alert (products not found in database)
   * @param {Object} params - Parameters
   * @returns {React.Element|boolean} Alert element or false if no orphans
   */
  function renderOrphanAlert(params) {
    const { orphanCount } = params;
    
    if (!orphanCount || orphanCount === 0) {
      return false;
    }
    
    return React.createElement('div', {
      className: 'orphan-alert compact-card',
      style: {
        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
        border: '1px solid #f59e0b',
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }
    },
      React.createElement('span', { style: { fontSize: '20px' } }, '⚠️'),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { 
          style: { 
            fontWeight: 600, 
            color: '#92400e', 
            marginBottom: '4px',
            fontSize: '14px'
          } 
        }, `${orphanCount} продукт${orphanCount === 1 ? '' : orphanCount < 5 ? 'а' : 'ов'} не найден${orphanCount === 1 ? '' : 'о'} в базе`),
        React.createElement('div', { 
          style: { 
            color: '#a16207', 
            fontSize: '12px',
            lineHeight: '1.4'
          } 
        }, 'Калории считаются по сохранённым данным. Нажми чтобы увидеть список.'),
        // Список orphan-продуктов
        React.createElement('details', { 
          style: { marginTop: '8px' }
        },
          React.createElement('summary', { 
            style: { 
              cursor: 'pointer', 
              color: '#92400e',
              fontSize: '12px',
              fontWeight: 500
            } 
          }, 'Показать продукты'),
          React.createElement('ul', { 
            style: { 
              margin: '8px 0 0 0', 
              padding: '0 0 0 20px',
              fontSize: '12px',
              color: '#78350f'
            } 
          },
            (HEYS.orphanProducts?.getAll?.() || []).map((o, i) => 
              React.createElement('li', { key: o.name || i, style: { marginBottom: '4px' } },
                React.createElement('strong', null, o.name),
                ` — ${o.hasInlineData ? '✓ можно восстановить' : '⚠️ нет данных'}`,
                // Показываем даты использования
                o.usedInDays && o.usedInDays.length > 0 && React.createElement('div', {
                  style: { fontSize: '11px', color: '#92400e', marginTop: '2px' }
                }, `📅 ${o.usedInDays.slice(0, 5).join(', ')}${o.usedInDays.length > 5 ? ` и ещё ${o.usedInDays.length - 5}...` : ''}`)
              )
            )
          ),
          // Кнопка восстановления
          React.createElement('button', {
            style: {
              marginTop: '10px',
              padding: '8px 16px',
              background: '#f59e0b',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            },
            onClick: async () => {
              const result = await HEYS.orphanProducts?.restore?.();
              if (result?.success) {
                HEYS.Toast?.success(`Восстановлено ${result.count} продуктов! Обновите страницу для применения.`) || alert(`✅ Восстановлено ${result.count} продуктов!\nОбновите страницу для применения.`);
                window.location.reload();
              } else {
                HEYS.Toast?.warning('Не удалось восстановить — нет данных в штампах.') || alert('⚠️ Не удалось восстановить — нет данных в штампах.');
              }
            }
          }, '🔧 Восстановить в базу')
        )
      )
    );
  }
  
  // Export module
  HEYS.dayOrphanAlert = {
    renderOrphanAlert
  };
  
})(window);
// ===== End heys_day_orphan_alert.js =====
// ===== End heys_day_meals_bundle_v1.js =====


/* ===== heys_day_add_product.js ===== */
// heys_day_add_product.js — MealAddProduct and ProductRow components for DayTab
// Extracted from heys_day_v12.js (Phase 2.3)
// Contains: MealAddProduct component, ProductRow component

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // Import utilities from dayUtils
  const U = HEYS.dayUtils || {};
  const uid = U.uid || (() => 'id_' + Date.now());
  const buildProductIndex = U.buildProductIndex || (() => ({}));
  const getProductFromItem = U.getProductFromItem || (() => null);
  const per100 = U.per100 || ((p) => ({ kcal100: 0, carbs100: 0, prot100: 0, fat100: 0, simple100: 0, complex100: 0, bad100: 0, good100: 0, trans100: 0, fiber100: 0 }));
  const scale = U.scale || ((v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10);

  // ✅ Общий helper: summary-модалка для multiProductMode
  async function showMultiProductSummary({
    day,
    mealIndex,
    pIndex,
    getProductFromItem,
    per100,
    scale,
    onAddMore
  }) {
    if (!HEYS.ConfirmModal?.show) return;

    const currentDay = day || HEYS.Day?.getDay?.() || {};
    const currentMeal = currentDay?.meals?.[mealIndex];
    if (!currentMeal) return;

    const localPIndex = pIndex || HEYS.dayUtils?.buildProductIndex?.() || HEYS.products?.buildIndex?.() || {};
    const mealTotals = HEYS.models?.mealTotals?.(currentMeal, localPIndex) || {};
    const mealKcal = Math.round(mealTotals.kcal || 0);

    const optimumData = HEYS.dayUtils?.getOptimumForDay?.(currentDay) || {};
    const optimum = Math.round(optimumData.optimum || 2000);

    const dayTotals = HEYS.dayCalculations?.calculateDayTotals?.(currentDay, localPIndex) || {};
    const eatenKcal = Math.round(dayTotals.kcal || 0);
    const remainingKcal = optimum - eatenKcal;

    const mealScore = HEYS.mealScoring?.calcKcalScore?.(mealKcal, null, optimum, currentMeal.time, null);
    const mealQuality = HEYS.mealScoring?.getMealQualityScore?.(currentMeal, null, optimum, localPIndex, null);
    const mealKcalStatus = (() => {
      let status = 'good';
      if (mealScore?.ok === false) status = 'bad';
      else if ((mealScore?.issues || []).length > 0) status = 'warn';
      if (mealQuality?.score != null) {
        if (mealQuality.score < 50) status = 'bad';
        else if (mealQuality.score < 75 && status !== 'bad') status = 'warn';
      }
      return status;
    })();
    const mealKcalColor = mealKcalStatus === 'bad'
      ? '#ef4444'
      : mealKcalStatus === 'warn'
        ? '#eab308'
        : '#22c55e';

    const heroMetrics = HEYS.dayHeroMetrics?.computeHeroMetrics?.({
      day: currentDay,
      eatenKcal,
      optimum,
      dayTargetDef: currentDay?.deficitPct,
      factDefPct: currentDay?.deficitPct,
      r0: (v) => Math.round(v),
      ratioZones: HEYS.ratioZones
    });
    const remainingColor = heroMetrics?.remainCol?.text
      || (remainingKcal > 100 ? '#22c55e' : remainingKcal >= 0 ? '#eab308' : '#ef4444');

    const mealOverLimit = (mealScore?.issues || []).some((issue) =>
      String(issue).includes('переед') || String(issue).includes('много')
    ) || mealScore?.ok === false;

    const isGoalReached = remainingKcal <= 0;
    const mealName = currentMeal.name || `Приём ${mealIndex + 1}`;

    const mealItems = (currentMeal.items || []).map((item) => {
      const product = getProductFromItem(item, localPIndex) || { name: item.name || '?' };
      const grams = +item.grams || 0;
      const p100 = per100(product);
      const itemKcal = Math.round(scale(p100.kcal100, grams));
      let name = product.name || item.name || '?';
      if (name.length > 22) name = name.slice(0, 20) + '…';
      return { name, grams, kcal: itemKcal };
    });

    const ProductsList = mealItems.length > 0 ? React.createElement('div', {
      className: 'confirm-modal-products-list',
      style: {
        margin: '10px 0',
        padding: '8px 10px',
        background: 'var(--bg-secondary, #f8fafc)',
        borderRadius: '8px',
        fontSize: '13px'
      }
    },
      React.createElement('div', {
        style: {
          fontSize: '11px',
          fontWeight: '600',
          color: '#64748b',
          marginBottom: '6px',
          textTransform: 'uppercase',
          letterSpacing: '0.3px'
        }
      }, 'В приёме:'),
      mealItems.slice(0, 6).map((item, idx) =>
        React.createElement('div', {
          key: idx,
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '3px 0',
            borderBottom: idx < Math.min(mealItems.length, 6) - 1 ? '1px dotted #e2e8f0' : 'none'
          }
        },
          React.createElement('span', { style: { color: '#334155' } },
            item.name,
            ' ',
            React.createElement('span', { style: { color: '#94a3b8', fontSize: '11px' } }, item.grams + 'г')
          ),
          React.createElement('span', {
            style: { fontWeight: '600', color: '#475569', minWidth: '45px', textAlign: 'right' }
          }, item.kcal)
        )
      ),
      mealItems.length > 6 && React.createElement('div', {
        style: { fontSize: '11px', color: '#94a3b8', marginTop: '4px', textAlign: 'center' }
      }, '...и ещё ' + (mealItems.length - 6)),
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '6px',
          paddingTop: '6px',
          borderTop: '1px solid #cbd5e1',
          fontWeight: '700'
        }
      },
        React.createElement('span', { style: { color: '#334155' } }, 'Итого'),
        React.createElement('span', { style: { color: mealKcalColor } }, mealKcal + ' ккал')
      )
    ) : null;

    let modalResult = false;

    if (isGoalReached) {
      modalResult = await HEYS.ConfirmModal.show({
        icon: '🎉',
        title: 'Норма выполнена!',
        text: React.createElement('div', { className: 'confirm-modal-text-block' },
          React.createElement('div', null,
            'Отличная работа! В "',
            mealName,
            '" уже ',
            React.createElement('span', {
              className: 'confirm-modal-kcal',
              style: { color: mealKcalColor }
            }, mealKcal + ' ккал'),
            '.'
          ),
          ProductsList,
          React.createElement('div', { style: { marginTop: '8px' } },
            'Всего за день: ',
            React.createElement('span', {
              className: 'confirm-modal-kcal',
              style: { color: remainingColor }
            }, eatenKcal + ' ккал')
          )
        ),
        confirmText: 'Добавить ещё',
        cancelText: 'Завершить 🎊',
        confirmStyle: 'success',
        cancelStyle: 'primary',
        confirmVariant: 'fill',
        cancelVariant: 'fill'
      });

      if (!modalResult && HEYS.Confetti?.fire) {
        HEYS.Confetti.fire();
      }
    } else {
      modalResult = await HEYS.ConfirmModal.show({
        icon: '🍽️',
        title: `Добавить ещё в ${String(mealName).toLowerCase()}?`,
        text: React.createElement('div', { className: 'confirm-modal-text-block' },
          ProductsList,
          React.createElement('div', { style: { marginTop: ProductsList ? '8px' : '0' } },
            'До нормы сегодня осталось ',
            React.createElement('span', {
              className: 'confirm-modal-remaining',
              style: { color: remainingColor }
            }, Math.max(0, remainingKcal) + ' ккал'),
            '.'
          ),
          mealOverLimit && React.createElement('div', { className: 'confirm-modal-warning' },
            '⚠️ Похоже, приём уже тяжеловат.'
          )
        ),
        confirmText: 'Добавить ещё',
        cancelText: 'Завершить',
        confirmStyle: 'success',
        cancelStyle: 'primary',
        confirmVariant: 'fill',
        cancelVariant: 'fill'
      });
    }

    if (modalResult && onAddMore) {
      onAddMore(currentDay);
    }
  }

  HEYS.dayAddProductSummary = HEYS.dayAddProductSummary || {};
  HEYS.dayAddProductSummary.show = showMultiProductSummary;

  // === MealAddProduct Component (extracted for stable identity) ===
  const MealAddProduct = React.memo(function MealAddProduct({
    mi,
    products,
    date,
    day,
    setDay,
    isCurrentMeal = false,
    multiProductMode = false,
    buttonText = 'Добавить еще продукт',
    buttonIcon = '🔍',
    buttonClassName = '',
    highlightCurrent = true,
    ariaLabel = 'Добавить продукт'
  }) {
    const getLatestProducts = React.useCallback(() => {
      const fromHeys = HEYS.products?.getAll?.() || [];
      const fromStore = HEYS.store?.get?.('heys_products', []) || [];
      const fromLs = U.lsGet ? U.lsGet('heys_products', []) : [];

      if (fromHeys.length > 0) return fromHeys;
      if (fromStore.length > 0) return fromStore;
      if (fromLs.length > 0) return fromLs;
      return Array.isArray(products) ? products : [];
    }, [products]);

    const getLatestDay = React.useCallback(() => {
      return day || HEYS.Day?.getDay?.() || {};
    }, [day]);

    const handleOpenModal = React.useCallback(() => {
      try { navigator.vibrate?.(10); } catch (e) { }

      const handleAddPhoto = async ({ mealIndex, photo, filename, timestamp }) => {
        const activeDay = getLatestDay();
        const activeMeal = activeDay?.meals?.[mealIndex];

        // Проверяем лимит фото (10 на приём)
        const currentPhotos = activeMeal?.photos?.length || 0;
        if (currentPhotos >= PHOTO_LIMIT_PER_MEAL) {
          HEYS.Toast?.warning(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`) || alert(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`);
          return;
        }

        // Получаем данные для загрузки
        const clientId = HEYS.utils?.getCurrentClientId?.() || 'default';
        const mealId = activeMeal?.id || uid('meal_');
        const photoId = uid('photo_');

        // Пытаемся загрузить в облако
        let photoData = {
          id: photoId,
          data: photo,
          filename,
          timestamp,
          pending: true,
          uploading: true,
          uploaded: false
        };

        // Сначала добавляем в UI (для мгновенного отображения)
        setDay((prevDay = {}) => {
          const meals = (prevDay.meals || []).map((m, i) =>
            i === mealIndex
              ? {
                ...m,
                photos: [...(m.photos || []), photoData]
              }
              : m
          );
          return { ...prevDay, meals, updatedAt: Date.now() };
        });

        try { navigator.vibrate?.(10); } catch (e) { }

        // Асинхронно загружаем в облако
        if (HEYS.cloud?.uploadPhoto) {
          try {
            const result = await HEYS.cloud.uploadPhoto(photo, clientId, date, mealId);

            if (result?.uploaded && result?.url) {
              setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) => {
                  if (i !== mealIndex || !m.photos) return m;
                  return {
                    ...m,
                    photos: m.photos.map(p =>
                      p.id === photoId
                        ? { ...p, url: result.url, data: undefined, pending: false, uploading: false, uploaded: true }
                        : p
                    )
                  };
                });
                return { ...prevDay, meals, updatedAt: Date.now() };
              });
            } else if (result?.pending) {
              setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) => {
                  if (i !== mealIndex || !m.photos) return m;
                  return {
                    ...m,
                    photos: m.photos.map(p =>
                      p.id === photoId
                        ? { ...p, uploading: false }
                        : p
                    )
                  };
                });
                return { ...prevDay, meals, updatedAt: Date.now() };
              });
            }
          } catch (e) {
            setDay((prevDay = {}) => {
              const meals = (prevDay.meals || []).map((m, i) => {
                if (i !== mealIndex || !m.photos) return m;
                return {
                  ...m,
                  photos: m.photos.map(p =>
                    p.id === photoId
                      ? { ...p, uploading: false }
                      : p
                  )
                };
              });
              return { ...prevDay, meals, updatedAt: Date.now() };
            });
            console.warn('[HEYS] Photo upload failed, will retry later:', e);
          }
        }
      };

      const handleNewProduct = () => {
        if (window.HEYS?.products?.showAddModal) {
          window.HEYS.products.showAddModal();
        }
      };

      const openAddModal = (override = {}) => {
        const latestDay = override.day || getLatestDay();
        const latestMeal = latestDay?.meals?.[mi] || {};
        const latestProducts = getLatestProducts();

        if (window.HEYS?.AddProductStep?.show) {
          window.HEYS.AddProductStep.show({
            mealIndex: mi,
            mealPhotos: latestMeal.photos || [],
            products: latestProducts,
            day: latestDay,
            dateKey: date,
            multiProductMode,
            onAdd: handleAdd,
            onAddPhoto: handleAddPhoto,
            onNewProduct: handleNewProduct
          });
        } else {
          console.error('[HEYS] AddProductStep not loaded');
        }
      };

      const handleAdd = ({ product, grams, mealIndex }) => {
        console.info('[HEYS.day] ➕ Add product to meal (modal)', {
          mealIndex,
          grams,
          productId: product?.id ?? product?.product_id ?? null,
          productName: product?.name || null,
          source: product?._source || (product?._fromShared ? 'shared' : 'personal')
        });
        // 🌐 Если продукт из общей базы — автоматически клонируем в личную
        let finalProduct = product;
        if (product?._fromShared || product?._source === 'shared') {
          const cloned = window.HEYS?.products?.addFromShared?.(product);
          if (cloned) {
            finalProduct = cloned;
          }
        }

        // 🔍 DEBUG: Подробный лог при добавлении продукта в meal
        const hasNutrients = !!(finalProduct?.kcal100 || finalProduct?.protein100 || finalProduct?.carbs100);
        if (!hasNutrients) {
          console.error('🚨 [DayTab] CRITICAL: Received product with NO nutrients!', finalProduct);
        }

        const productId = finalProduct.id ?? finalProduct.product_id ?? finalProduct.name;
        const computeTEFKcal100 = (p) => {
          const carbs = (+p.carbs100) || ((+p.simple100 || 0) + (+p.complex100 || 0));
          const fat = (+p.fat100) || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
          // NET Atwater: protein 3 kcal/g (TEF 25% built-in: 4×0.75=3), carbs 4 kcal/g, fat 9 kcal/g
          return Math.round((3 * (+p.protein100 || 0) + 4 * carbs + 9 * fat) * 10) / 10;
        };
        const additivesList = Array.isArray(finalProduct.additives) ? finalProduct.additives : undefined;
        const novaGroup = finalProduct.nova_group ?? finalProduct.novaGroup;
        const nutrientDensity = finalProduct.nutrient_density ?? finalProduct.nutrientDensity;
        const newItem = {
          id: uid('it_'),
          product_id: finalProduct.id ?? finalProduct.product_id,
          name: finalProduct.name,
          fingerprint: finalProduct.fingerprint,
          grams: grams || 100,
          portions: Array.isArray(finalProduct.portions) ? finalProduct.portions : undefined,
          ...(finalProduct.kcal100 !== undefined && {
            kcal100: computeTEFKcal100(finalProduct),
            protein100: finalProduct.protein100,
            carbs100: finalProduct.carbs100,
            fat100: finalProduct.fat100,
            simple100: finalProduct.simple100,
            complex100: finalProduct.complex100,
            badFat100: finalProduct.badFat100,
            goodFat100: finalProduct.goodFat100,
            trans100: finalProduct.trans100,
            fiber100: finalProduct.fiber100,
            sodium100: finalProduct.sodium100,
            omega3_100: finalProduct.omega3_100,
            omega6_100: finalProduct.omega6_100,
            nova_group: novaGroup,
            additives: additivesList,
            nutrient_density: nutrientDensity,
            is_organic: finalProduct.is_organic,
            is_whole_grain: finalProduct.is_whole_grain,
            is_fermented: finalProduct.is_fermented,
            is_raw: finalProduct.is_raw,
            vitamin_a: finalProduct.vitamin_a,
            vitamin_c: finalProduct.vitamin_c,
            vitamin_d: finalProduct.vitamin_d,
            vitamin_e: finalProduct.vitamin_e,
            vitamin_k: finalProduct.vitamin_k,
            vitamin_b1: finalProduct.vitamin_b1,
            vitamin_b2: finalProduct.vitamin_b2,
            vitamin_b3: finalProduct.vitamin_b3,
            vitamin_b6: finalProduct.vitamin_b6,
            vitamin_b9: finalProduct.vitamin_b9,
            vitamin_b12: finalProduct.vitamin_b12,
            calcium: finalProduct.calcium,
            iron: finalProduct.iron,
            magnesium: finalProduct.magnesium,
            phosphorus: finalProduct.phosphorus,
            potassium: finalProduct.potassium,
            zinc: finalProduct.zinc,
            selenium: finalProduct.selenium,
            iodine: finalProduct.iodine,
            gi: finalProduct.gi,
            harm: HEYS.models?.normalizeHarm?.(finalProduct)
          })
        };

        const itemHasNutrients = !!(newItem.kcal100 || newItem.protein100 || newItem.carbs100);
        if (!itemHasNutrients) {
          console.error('🚨 [DayTab] CRITICAL: newItem has NO nutrients! Will be saved without data.', {
            newItem,
            finalProduct,
            spreadCondition: finalProduct.kcal100 !== undefined
          });
        }

        const newUpdatedAt = Date.now();
        if (HEYS.Day?.setBlockCloudUpdates) {
          HEYS.Day.setBlockCloudUpdates(newUpdatedAt + 3000);
        } else {
          console.warn('[HEYS.day] ⚠️ setBlockCloudUpdates missing');
        }
        if (HEYS.Day?.setLastLoadedUpdatedAt) {
          HEYS.Day.setLastLoadedUpdatedAt(newUpdatedAt);
        } else {
          console.warn('[HEYS.day] ⚠️ setLastLoadedUpdatedAt missing');
        }

        setDay((prevDay = {}) => {
          const mealsList = prevDay.meals || [];
          if (!mealsList[mealIndex]) {
            console.warn('[HEYS.day] ❌ Meal index not found for add', {
              mealIndex,
              mealsCount: mealsList.length,
              productName: finalProduct?.name || null
            });
          }
          const meals = mealsList.map((m, i) =>
            i === mealIndex
              ? { ...m, items: [...(m.items || []), newItem] }
              : m
          );
          return { ...prevDay, meals, updatedAt: newUpdatedAt };
        });

        requestAnimationFrame(() => {
          setTimeout(() => {
            if (HEYS.Day?.requestFlush) {
              HEYS.Day.requestFlush();
            }
          }, 50);
        });

        try { navigator.vibrate?.(10); } catch (e) { }

        window.dispatchEvent(new CustomEvent('heysProductAdded', {
          detail: { product, grams }
        }));

        try {
          if (HEYS.store?.set) {
            HEYS.store.set(`heys_last_grams_${productId}`, grams);
          } else if (U.lsSet) {
            U.lsSet(`heys_last_grams_${productId}`, grams);
          } else {
            localStorage.setItem(`heys_last_grams_${productId}`, JSON.stringify(grams));
          }

          const history = HEYS.store?.get
            ? HEYS.store.get('heys_grams_history', {})
            : (U.lsGet ? U.lsGet('heys_grams_history', {}) : {});
          if (!history[productId]) history[productId] = [];
          history[productId].push(grams);
          if (history[productId].length > 20) history[productId].shift();

          if (HEYS.store?.set) {
            HEYS.store.set('heys_grams_history', history);
          } else if (U.lsSet) {
            U.lsSet('heys_grams_history', history);
          } else {
            localStorage.setItem('heys_grams_history', JSON.stringify(history));
          }
        } catch (e) { }

        if (multiProductMode && HEYS.dayAddProductSummary?.show) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              HEYS.dayAddProductSummary.show({
                day: HEYS.Day?.getDay?.() || day || {},
                mealIndex,
                pIndex: HEYS.dayUtils?.buildProductIndex?.() || HEYS.products?.buildIndex?.() || {},
                getProductFromItem,
                per100,
                scale,
                onAddMore: (updatedDay) => openAddModal({ day: updatedDay })
              });
            }, 100);
          });
        }
      };

      openAddModal();
    }, [mi, date, day, setDay, getLatestDay, getLatestProducts, multiProductMode]);

    return React.createElement('button', {
      className: 'aps-open-btn'
        + ((highlightCurrent && isCurrentMeal) ? ' aps-open-btn--current' : '')
        + (buttonClassName ? ` ${buttonClassName}` : ''),
      onClick: handleOpenModal,
      'aria-label': ariaLabel
    },
      React.createElement('span', { className: 'aps-open-icon' }, buttonIcon),
      React.createElement('span', { className: 'aps-open-text' }, buttonText)
    );
  }, (prev, next) => {
    if (prev.mi !== next.mi) return false;
    if (prev.products !== next.products) return false;

    const prevItems = prev.day?.meals?.[prev.mi]?.items;
    const nextItems = next.day?.meals?.[next.mi]?.items;
    if (prevItems !== nextItems) return false;

    return true;
  });

  const MEAL_HEADER_META = [
    { label: '' },
    { label: 'г' },
    { label: 'ккал<br>/100', per100: true },
    { label: 'У<br>/100', per100: true },
    { label: 'Прост<br>/100', per100: true },
    { label: 'Сл<br>/100', per100: true },
    { label: 'Б<br>/100', per100: true },
    { label: 'Ж<br>/100', per100: true },
    { label: 'ВрЖ<br>/100', per100: true },
    { label: 'ПолЖ<br>/100', per100: true },
    { label: 'СупЖ<br>/100', per100: true },
    { label: 'Клет<br>/100', per100: true },
    { label: 'ккал' },
    { label: 'У' },
    { label: 'Прост' },
    { label: 'Сл' },
    { label: 'Б' },
    { label: 'Ж' },
    { label: 'ВрЖ' },
    { label: 'ПолЖ' },
    { label: 'СупЖ' },
    { label: 'Клет' },
    { label: 'ГИ' },
    { label: 'Вред' },
    { label: '' }
  ];

  function fmtVal(key, v) {
    if (v == null || v === '') return '-';
    const num = +v || 0;
    if (key === 'harm') return Math.round(num * 10) / 10; // вредность с одной десятичной
    if (!num) return '-';
    return Math.round(num); // всё остальное до целых
  }

  const harmMissingLogged = new Set();
  function logMissingHarm(name, item, source) {
    if (!HEYS.analytics?.trackDataOperation) return;
    const key = `${source || 'meal-table'}:${(name || 'unknown').toLowerCase()}`;
    if (harmMissingLogged.has(key)) return;
    harmMissingLogged.add(key);
    HEYS.analytics.trackDataOperation('harm_missing_in_meal_card', {
      source: source || 'meal-table',
      name: name || null,
      productId: item?.product_id ?? item?.productId ?? item?.id ?? null,
      hasItemHarm: HEYS.models?.normalizeHarm?.(item) != null,
    });
  }

  const ProductRow = React.memo(function ProductRow({
    item,
    mealIndex,
    isNew,
    pIndex,
    setGrams,
    removeItem
  }) {
    const p = getProductFromItem(item, pIndex) || { name: item.name || '?' };
    const grams = +item.grams || 0;
    const per = per100(p);
    const row = {
      kcal: scale(per.kcal100, grams),
      carbs: scale(per.carbs100, grams),
      simple: scale(per.simple100, grams),
      complex: scale(per.complex100, grams),
      prot: scale(per.prot100, grams),
      fat: scale(per.fat100, grams),
      bad: scale(per.bad100, grams),
      good: scale(per.good100, grams),
      trans: scale(per.trans100, grams),
      fiber: scale(per.fiber100, grams)
    };
    const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? item.gi;
    // Use centralized harm normalization with fallback to item
    const harmVal = HEYS.models?.normalizeHarm?.(p) ?? HEYS.models?.normalizeHarm?.(item);
    if (harmVal == null) {
      logMissingHarm(p.name, item, 'meal-table');
    }
    return React.createElement('tr', { 'data-new': isNew ? 'true' : 'false' },
      React.createElement('td', { 'data-cell': 'name' }, p.name),
      React.createElement('td', { 'data-cell': 'grams' }, React.createElement('input', {
        type: 'number',
        value: grams,
        'data-grams-input': true,
        'data-meal-index': mealIndex,
        'data-item-id': item.id,
        onChange: e => setGrams(mealIndex, item.id, e.target.value),
        onKeyDown: e => {
          if (e.key === 'Enter') {
            e.target.blur(); // Убрать фокус после подтверждения
          }
        },
        onFocus: e => e.target.select(), // Выделить текст при фокусе
        placeholder: 'грамм',
        style: { textAlign: 'center' }
      })),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('kcal100', per.kcal100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('carbs100', per.carbs100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('simple100', per.simple100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('complex100', per.complex100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('prot100', per.prot100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('fat100', per.fat100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('bad', per.bad100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('good100', per.good100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('trans100', per.trans100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('fiber100', per.fiber100)),
      React.createElement('td', { 'data-cell': 'kcal' }, fmtVal('kcal', row.kcal)),
      React.createElement('td', { 'data-cell': 'carbs' }, fmtVal('carbs', row.carbs)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('simple', row.simple)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('complex', row.complex)),
      React.createElement('td', { 'data-cell': 'prot' }, fmtVal('prot', row.prot)),
      React.createElement('td', { 'data-cell': 'fat' }, fmtVal('fat', row.fat)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('bad', row.bad)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('good', row.good)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('trans', row.trans)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('fiber', row.fiber)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('gi', giVal)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('harm', harmVal)),
      React.createElement('td', { 'data-cell': 'delete' }, React.createElement('button', { className: 'btn secondary', onClick: () => removeItem(mealIndex, item.id) }, '×'))
    );
  });

  // Export to HEYS namespace
  HEYS.dayComponents = HEYS.dayComponents || {};
  HEYS.dayComponents.MealAddProduct = MealAddProduct;
  HEYS.dayComponents.ProductRow = ProductRow;

})(window);


/* ===== heys_day_storage_v1.js ===== */
// heys_day_storage_v1.js — DayTab storage helpers (dynamic HEYS.utils)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    let warnedGet = false;
    let warnedSet = false;

    function trackOnce(message, context) {
        if (HEYS.analytics?.trackError) {
            HEYS.analytics.trackError(message, context);
        }
    }

    function fallbackGet(key, defaultValue) {
        try {
            const raw = localStorage.getItem(key);
            const parsed = raw == null ? null : JSON.parse(raw);
            return parsed == null ? defaultValue : parsed;
        } catch (e) {
            return defaultValue;
        }
    }

    function fallbackSet(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            // ignore storage errors
        }
    }

    function lsGet(key, defaultValue) {
        const utils = HEYS.utils || {};
        if (typeof utils.lsGet === 'function') {
            return utils.lsGet(key, defaultValue);
        }
        if (!warnedGet) {
            warnedGet = true;
            trackOnce('[heys_day_storage] HEYS.utils.lsGet not available', { key });
        }
        return fallbackGet(key, defaultValue);
    }

    function lsSet(key, value) {
        const utils = HEYS.utils || {};
        if (typeof utils.lsSet === 'function') {
            utils.lsSet(key, value);
            return;
        }
        if (!warnedSet) {
            warnedSet = true;
            trackOnce('[heys_day_storage] HEYS.utils.lsSet not available', { key });
        }
        fallbackSet(key, value);
    }

    HEYS.dayStorage = {
        lsGet,
        lsSet
    };
})(window);


/* ===== heys_day_sound_v1.js ===== */
// heys_day_sound_v1.js — DayTab sound effects (success chime)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function getLsGet() {
        if (HEYS.dayStorage?.lsGet) return HEYS.dayStorage.lsGet;
        if (HEYS.utils?.lsGet) return HEYS.utils.lsGet;
        return (key, defaultValue) => {
            try {
                const raw = localStorage.getItem(key);
                const parsed = raw == null ? null : JSON.parse(raw);
                return parsed == null ? defaultValue : parsed;
            } catch (e) {
                return defaultValue;
            }
        };
    }

    const playSuccessSound = (() => {
        let audioCtx = null;
        let lastPlayTime = 0;
        return () => {
            const lsGet = getLsGet();
            const soundEnabled = lsGet('heys_sound_enabled', true);
            if (!soundEnabled) return;

            const now = Date.now();
            if (now - lastPlayTime < 2000) return;
            lastPlayTime = now;

            try {
                if (!audioCtx) {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                const osc1 = audioCtx.createOscillator();
                const osc2 = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(audioCtx.destination);

                osc1.frequency.value = 880; // A5
                osc2.frequency.value = 1174.66; // D6
                osc1.type = 'sine';
                osc2.type = 'sine';

                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

                osc1.start(audioCtx.currentTime);
                osc2.start(audioCtx.currentTime + 0.1);
                osc1.stop(audioCtx.currentTime + 0.3);
                osc2.stop(audioCtx.currentTime + 0.4);
            } catch (e) {
                // ignore audio errors
            }
        };
    })();

    HEYS.daySound = {
        playSuccessSound
    };
})(window);


/* ===== heys_day_guards_v1.js ===== */
// heys_day_guards_v1.js — DayTab guard screens (logout/loading)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    if (!HEYS.dayMealExpandState?.useMealExpandState) {
        HEYS.dayMealExpandState = {
            useMealExpandState: function useMealExpandStateFallback() {
                const React = global.React || {};
                const { useCallback, useState } = React;
                if (!useState || !useCallback) {
                    return {
                        isMealStale: () => false,
                        toggleMealExpand: () => { },
                        expandOnlyMeal: () => { },
                        isMealExpanded: () => false,
                    };
                }

                const [expandedMeals, setExpandedMeals] = useState({});

                const isMealStale = useCallback(() => false, []);

                const toggleMealExpand = useCallback((mealIndex) => {
                    setExpandedMeals((prev) => ({
                        ...prev,
                        [mealIndex]: !prev[mealIndex],
                    }));
                }, []);

                const expandOnlyMeal = useCallback((mealIndex) => {
                    setExpandedMeals({ [mealIndex]: true });
                }, []);

                const isMealExpanded = useCallback((mealIndex, totalMeals) => {
                    if (expandedMeals.hasOwnProperty(mealIndex)) {
                        return expandedMeals[mealIndex];
                    }
                    return mealIndex === totalMeals - 1;
                }, [expandedMeals]);

                return {
                    isMealStale,
                    toggleMealExpand,
                    expandOnlyMeal,
                    isMealExpanded,
                };
            },
        };
    }

    function renderGuardScreen({ React, message }) {
        return React.createElement('div', {
            className: 'flex items-center justify-center h-screen bg-[var(--bg-primary)]'
        }, message);
    }

    function getLogoutScreen({ React, HEYSRef }) {
        if (HEYSRef?._isLoggingOut) {
            return renderGuardScreen({ React, message: 'Выход...' });
        }
        return null;
    }

    function getPropsGuardScreen({ React, props }) {
        if (!props || props._isLoggingOut) {
            return renderGuardScreen({ React, message: 'Загрузка...' });
        }
        return null;
    }

    function getMissingDayScreen({ React, day }) {
        if (!day) {
            return renderGuardScreen({ React, message: 'Загрузка...' });
        }
        return null;
    }

    HEYS.dayGuards = {
        renderGuardScreen,
        getLogoutScreen,
        getPropsGuardScreen,
        getMissingDayScreen
    };
})(window);


/* ===== heys_day_init_v1.js ===== */
// heys_day_init_v1.js — DayTab initial day state factory
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function getInitialDay(params) {
        const {
            date,
            prof,
            lsGet,
            ensureDay,
            normalizeTrainings,
            cleanEmptyTrainings
        } = params || {};

        const safeNormalize = typeof normalizeTrainings === 'function' ? normalizeTrainings : (t = []) => t;
        const safeClean = typeof cleanEmptyTrainings === 'function' ? cleanEmptyTrainings : (t = []) => t;

        const key = 'heys_dayv2_' + date;
        const v = lsGet(key, null);

        if (v && v.date) {
            const normalizedTrainings = safeNormalize(v.trainings);
            const cleanedTrainings = safeClean(normalizedTrainings);
            const migratedDay = { ...v, trainings: cleanedTrainings };
            return ensureDay(migratedDay, prof);
        }

        return ensureDay({
            date: date,
            meals: [],
            trainings: [],
            sleepStart: '',
            sleepEnd: '',
            sleepQuality: '',
            sleepNote: '',
            dayScore: '',
            moodAvg: '',
            wellbeingAvg: '',
            stressAvg: '',
            dayComment: ''
        }, prof);
    }

    HEYS.dayInit = {
        getInitialDay
    };
})(window);


/* ===== heys_day_sleep_effects_v1.js ===== */
// heys_day_sleep_effects_v1.js — DayTab sleep-related effects
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function useSleepHoursEffect(deps) {
        const { React, day, setDay, sleepHours } = deps || {};
        const sleepStart = day ? day.sleepStart : '';
        const sleepEnd = day ? day.sleepEnd : '';
        const daySleepMinutes = day ? day.daySleepMinutes : 0;

        React.useEffect(() => {
            if (!day) return;
            const nightSleepHours = sleepHours(sleepStart, sleepEnd);
            const napHours = (HEYS.dayUtils?.normalizeDaySleepMinutes?.(daySleepMinutes) || 0) / 60;
            const calculatedSleepH = HEYS.dayUtils?.getTotalSleepHours
                ? HEYS.dayUtils.getTotalSleepHours({ ...day, sleepHours: nightSleepHours, daySleepMinutes })
                : Math.round((nightSleepHours + napHours) * 10) / 10;
            if (calculatedSleepH !== day.sleepHours) {
                setDay(prevDay => ({
                    ...prevDay,
                    sleepHours: calculatedSleepH,
                    updatedAt: Date.now()
                }));
            }
        }, [sleepStart, sleepEnd, daySleepMinutes]);
    }

    HEYS.daySleepEffects = {
        useSleepHoursEffect
    };
})(window);


/* ===== heys_day_global_exports_v1.js ===== */
// heys_day_global_exports_v1.js — DayTab global exports (HEYS.Day)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function useDayGlobalExportsEffect(deps) {
        const { React, flush, blockCloudUpdatesUntilRef, lastLoadedUpdatedAtRef, dayRef } = deps || {};

        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.requestFlush = flush;
            HEYS.Day.isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;
            HEYS.Day.getBlockUntil = () => blockCloudUpdatesUntilRef.current;
            HEYS.Day.setBlockCloudUpdates = (until) => { blockCloudUpdatesUntilRef.current = until; };
            HEYS.Day.setLastLoadedUpdatedAt = (ts) => { lastLoadedUpdatedAtRef.current = ts; };
            HEYS.Day.getDay = () => dayRef?.current;

            return () => {
                if (HEYS.Day && HEYS.Day.requestFlush === flush) {
                    delete HEYS.Day.requestFlush;
                    delete HEYS.Day.isBlockingCloudUpdates;
                    delete HEYS.Day.getBlockUntil;
                    delete HEYS.Day.setBlockCloudUpdates;
                    delete HEYS.Day.setLastLoadedUpdatedAt;
                    delete HEYS.Day.getDay;
                }
            };
        }, [flush, dayRef]);
    }

    HEYS.dayGlobalExports = {
        useDayGlobalExportsEffect
    };
})(window);
