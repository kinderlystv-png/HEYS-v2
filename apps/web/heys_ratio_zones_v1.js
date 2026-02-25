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
