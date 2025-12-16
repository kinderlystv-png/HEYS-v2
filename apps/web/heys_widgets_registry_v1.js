/**
 * heys_widgets_registry_v1.js
 * Реестр типов виджетов
 * Version: 1.0.0
 * Created: 2025-12-15
 * 
 * Паттерн: Registry для регистрации и получения типов виджетов
 */
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.Widgets = HEYS.Widgets || {};
  
  // === Widget Categories ===
  const CATEGORIES = {
    nutrition: {
      id: 'nutrition',
      label: 'Питание',
      icon: '🍎',
      color: '#f97316'
    },
    health: {
      id: 'health',
      label: 'Здоровье',
      icon: '❤️',
      color: '#8b5cf6'
    },
    motivation: {
      id: 'motivation',
      label: 'Мотивация',
      icon: '🎯',
      color: '#10b981'
    },
    advanced: {
      id: 'advanced',
      label: 'Продвинутые',
      icon: '📊',
      color: '#3b82f6'
    },
    cycle: {
      id: 'cycle',
      label: 'Цикл',
      icon: '🌸',
      color: '#ec4899'
    }
  };
  
  // === Widget Size Presets ===
  // Legacy size-id aliases (обратная совместимость для сохранённых layout'ов).
  // ВАЖНО: наружу (UI) мы используем только формат NxM, но старые значения
  // могут жить в localStorage у пользователей.
  const LEGACY_SIZE_ALIASES = {
    // Старые имена
    mini: '1x1',
    short: '2x1',
    tall2: '1x2',
    compact: '2x2',
    medium: '3x2',
    wide: '4x2',
    tall3: '2x3',
    tall: '2x4',
    wide3: '4x3',
    large: '4x4'
  };

  const SIZES = {
    // ВАЖНО: сетка теперь 4 колонки (единица = 1 колонка/ряд).
    // Чтобы сохранить привычные пропорции старой 2-колоночной сетки,
    // размеры "классических" виджетов масштабированы ×2.
    // 4-колоночная сетка: 1 колонка/ряд = базовая единица.
    // iOS-like:
    // - compact = 2×2
    // - wide    = 4×2
    // - large   = 4×4
    // Дополнительно: mini = 1×1 (value-only виджет)
    // === Все размеры от 1×1 до 4×4 (16 вариантов) ===
    // Формат: 'NxM' где N=cols, M=rows
    // Row 1: height = 1
    '1x1': { cols: 1, rows: 1, label: '1×1', cssClass: 'widget--1x1' },
    '2x1': { cols: 2, rows: 1, label: '2×1', cssClass: 'widget--2x1' },
    '3x1': { cols: 3, rows: 1, label: '3×1', cssClass: 'widget--3x1' },
    '4x1': { cols: 4, rows: 1, label: '4×1', cssClass: 'widget--4x1' },
    // Row 2: height = 2
    '1x2': { cols: 1, rows: 2, label: '1×2', cssClass: 'widget--1x2' },
    '2x2': { cols: 2, rows: 2, label: '2×2', cssClass: 'widget--2x2' },
    '3x2': { cols: 3, rows: 2, label: '3×2', cssClass: 'widget--3x2' },
    '4x2': { cols: 4, rows: 2, label: '4×2', cssClass: 'widget--4x2' },
    // Row 3: height = 3
    '1x3': { cols: 1, rows: 3, label: '1×3', cssClass: 'widget--1x3' },
    '2x3': { cols: 2, rows: 3, label: '2×3', cssClass: 'widget--2x3' },
    '3x3': { cols: 3, rows: 3, label: '3×3', cssClass: 'widget--3x3' },
    '4x3': { cols: 4, rows: 3, label: '4×3', cssClass: 'widget--4x3' },
    // Row 4: height = 4
    '1x4': { cols: 1, rows: 4, label: '1×4', cssClass: 'widget--1x4' },
    '2x4': { cols: 2, rows: 4, label: '2×4', cssClass: 'widget--2x4' },
    '3x4': { cols: 3, rows: 4, label: '3×4', cssClass: 'widget--3x4' },
    '4x4': { cols: 4, rows: 4, label: '4×4', cssClass: 'widget--4x4' }
  };

  // Все размеры 1x1..4x4 (в порядке объявления в SIZES)
  const ALL_SIZES_4X4 = Object.keys(SIZES);
  
  // === Widget Type Definitions ===
  // 10 типов виджетов согласно ТЗ
  const WIDGET_TYPES = {
    // === Категория: Питание ===
    calories: {
      type: 'calories',
      name: 'Калории',
      category: 'nutrition',
      icon: '🔥',
      description: 'Текущие калории и норма',
      defaultSize: '2x2',
      availableSizes: ALL_SIZES_4X4,
      dataKeys: ['dayTot.kcal', 'optimum'],
      component: 'WidgetCalories',
      settings: {
        showPercentage: { type: 'boolean', default: true, label: 'Показывать %' },
        showRemaining: { type: 'boolean', default: true, label: 'Показывать остаток' }
      }
    },
    
    macros: {
      type: 'macros',
      name: 'БЖУ',
      category: 'nutrition',
      icon: '🥗',
      description: 'Баланс белков, жиров, углеводов',
      defaultSize: '4x2',
      availableSizes: ALL_SIZES_4X4,
      dataKeys: ['dayTot.prot', 'dayTot.fat', 'dayTot.carbs', 'normAbs'],
      component: 'WidgetMacros',
      settings: {
        showGrams: { type: 'boolean', default: true, label: 'Показывать граммы' },
        showPercentage: { type: 'boolean', default: true, label: 'Показывать %' }
      }
    },
    
    insulin: {
      type: 'insulin',
      name: 'Инсулин',
      category: 'nutrition',
      icon: '📈',
      description: 'Таймер инсулиновой волны',
      defaultSize: '2x2',
      availableSizes: ALL_SIZES_4X4,
      dataKeys: ['waveData'],
      component: 'WidgetInsulin',
      settings: {
        showTimer: { type: 'boolean', default: true, label: 'Показывать таймер' },
        showPhase: { type: 'boolean', default: true, label: 'Показывать фазу' }
      }
    },
    
    // === Категория: Здоровье ===
    sleep: {
      type: 'sleep',
      name: 'Сон',
      category: 'health',
      icon: '😴',
      description: 'Часы сна и качество',
      defaultSize: '2x2',
      availableSizes: ALL_SIZES_4X4,
      dataKeys: ['day.sleepHours', 'day.sleepQuality', 'prof.sleepHours'],
      component: 'WidgetSleep',
      settings: {
        showQuality: { type: 'boolean', default: true, label: 'Показывать качество' },
        showTarget: { type: 'boolean', default: true, label: 'Показывать норму' }
      }
    },
    
    water: {
      type: 'water',
      name: 'Вода',
      category: 'health',
      icon: '💧',
      description: 'Выпито воды и норма',
      defaultSize: '2x2',
      availableSizes: ALL_SIZES_4X4,
      dataKeys: ['day.waterMl', 'waterGoal'],
      component: 'WidgetWater',
      settings: {
        showMilliliters: { type: 'boolean', default: true, label: 'Показывать мл' },
        showGlasses: { type: 'boolean', default: false, label: 'Показывать стаканы' }
      }
    },
    
    weight: {
      type: 'weight',
      name: 'Вес',
      category: 'health',
      icon: '⚖️',
      description: 'Текущий вес и тренд',
      defaultSize: '4x2',
      availableSizes: ALL_SIZES_4X4,
      dataKeys: ['day.weightMorning', 'prof.weight', 'prof.weightGoal', 'weightTrend'],
      component: 'WidgetWeight',
      settings: {
        showTrend: { type: 'boolean', default: true, label: 'Показывать тренд' },
        showGoal: { type: 'boolean', default: true, label: 'Показывать цель' },
        periodDays: { type: 'number', default: 7, label: 'Период (дней)', min: 3, max: 30 }
      }
    },
    
    steps: {
      type: 'steps',
      name: 'Шаги',
      category: 'health',
      icon: '👟',
      description: 'Шаги за день',
      defaultSize: '2x2',
      availableSizes: ALL_SIZES_4X4,
      dataKeys: ['day.steps', 'prof.stepsGoal'],
      component: 'WidgetSteps',
      settings: {
        showGoal: { type: 'boolean', default: true, label: 'Показывать цель' },
        showKilometers: { type: 'boolean', default: false, label: 'Показывать км' }
      }
    },
    
    // === Категория: Мотивация ===
    streak: {
      type: 'streak',
      name: 'Streak',
      category: 'motivation',
      icon: '🔥',
      description: 'Серия дней в норме',
      defaultSize: '2x2',
      availableSizes: ALL_SIZES_4X4,
      dataKeys: ['currentStreak', 'maxStreak'],
      component: 'WidgetStreak',
      settings: {
        showMax: { type: 'boolean', default: true, label: 'Показывать рекорд' },
        showFlame: { type: 'boolean', default: true, label: 'Показывать огонь' }
      }
    },
    
    heatmap: {
      type: 'heatmap',
      name: 'Тепловая карта',
      category: 'motivation',
      icon: '📅',
      description: 'Активность за неделю/месяц',
      defaultSize: '4x2',
      availableSizes: ALL_SIZES_4X4,
      dataKeys: ['activeDays'],
      component: 'WidgetHeatmap',
      settings: {
        period: { type: 'select', default: 'week', label: 'Период', options: [
          { value: 'week', label: 'Неделя' },
          { value: 'month', label: 'Месяц' }
        ]}
      }
    },
    
    // === Категория: Цикл ===
    cycle: {
      type: 'cycle',
      name: 'Цикл',
      category: 'cycle',
      icon: '🌸',
      description: 'День менструального цикла',
      defaultSize: '2x2',
      availableSizes: ALL_SIZES_4X4,
      dataKeys: ['day.cycleDay', 'cyclePhase'],
      component: 'WidgetCycle',
      requiresCondition: () => {
        const prof = HEYS.utils?.lsGet?.('heys_profile', {}) || {};
        return prof.gender === 'Женский' && prof.cycleTrackingEnabled === true;
      },
      settings: {
        showPhase: { type: 'boolean', default: true, label: 'Показывать фазу' },
        showCorrections: { type: 'boolean', default: true, label: 'Показывать коррекции' }
      }
    }
  };
  
  // === Registry Implementation ===
  const registry = {
    /**
     * Нормализовать ID размера:
     * - поддерживает legacy имена (compact/wide/...) → NxM
     * - поддерживает формат sNxM (s4x3) → NxM
     * - поддерживает символ умножения × → x
     * @param {string} sizeId
     * @returns {string|null}
     */
    normalizeSizeId(sizeId) {
      if (!sizeId || typeof sizeId !== 'string') return null;

      // Уже в новом формате
      if (SIZES[sizeId]) return sizeId;

      // Legacy mapping
      if (LEGACY_SIZE_ALIASES[sizeId]) return LEGACY_SIZE_ALIASES[sizeId];

      // sNxM → NxM
      const m = sizeId.match(/^s([1-4])x([1-4])$/);
      if (m) {
        const norm = `${m[1]}x${m[2]}`;
        return SIZES[norm] ? norm : sizeId;
      }

      // 4×3 → 4x3
      if (sizeId.includes('×')) {
        const norm = sizeId.replace(/×/g, 'x');
        if (SIZES[norm]) return norm;
      }

      return sizeId;
    },

    /**
     * Получить определение типа виджета
     * @param {string} type - ID типа виджета
     * @returns {Object|null}
     */
    getType(type) {
      return WIDGET_TYPES[type] || null;
    },
    
    /**
     * Получить все типы виджетов
     * @returns {Object[]}
     */
    getAllTypes() {
      return Object.values(WIDGET_TYPES);
    },
    
    /**
     * Получить типы по категории
     * @param {string} categoryId - ID категории
     * @returns {Object[]}
     */
    getTypesByCategory(categoryId) {
      return Object.values(WIDGET_TYPES).filter(w => w.category === categoryId);
    },
    
    /**
     * Получить доступные типы (учитывая условия)
     * @returns {Object[]}
     */
    getAvailableTypes() {
      return Object.values(WIDGET_TYPES).filter(widgetType => {
        if (typeof widgetType.requiresCondition === 'function') {
          return widgetType.requiresCondition();
        }
        return true;
      });
    },
    
    /**
     * Получить все категории
     * @returns {Object[]}
     */
    getCategories() {
      return Object.values(CATEGORIES);
    },
    
    /**
     * Получить категорию по ID
     * @param {string} categoryId
     * @returns {Object|null}
     */
    getCategory(categoryId) {
      return CATEGORIES[categoryId] || null;
    },
    
    /**
     * Получить preset размера
     * @param {string} sizeId
     * @returns {Object|null}
     */
    getSize(sizeId) {
      const norm = this.normalizeSizeId(sizeId);
      return (norm && SIZES[norm]) ? SIZES[norm] : null;
    },
    
    /**
     * Получить все размеры
     * @returns {Object}
     */
    getSizes() {
      return { ...SIZES };
    },
    
    /**
     * Проверить, поддерживает ли виджет размер
     * @param {string} type - Тип виджета
     * @param {string} sizeId - ID размера
     * @returns {boolean}
     */
    supportsSize(type, sizeId) {
      const widgetType = WIDGET_TYPES[type];
      if (!widgetType) return false;
      const norm = this.normalizeSizeId(sizeId);
      return widgetType.availableSizes.includes(norm);
    },
    
    /**
     * Создать экземпляр виджета
     * @param {string} type - Тип виджета
     * @param {Object} options - Опции (id, size, settings, position)
     * @returns {Object} Widget instance
     */
    createWidget(type, options = {}) {
      const widgetType = WIDGET_TYPES[type];
      if (!widgetType) {
        console.error(`[Widgets Registry] Unknown widget type: ${type}`);
        return null;
      }
      
      const rawSize = options.size || widgetType.defaultSize;
      const size = this.normalizeSizeId(rawSize) || widgetType.defaultSize;
      const sizePreset = SIZES[size];
      
      if (!sizePreset) {
        console.error(`[Widgets Registry] Unknown size: ${rawSize}`);
        return null;
      }
      
      // Merge default settings with provided settings
      const defaultSettings = {};
      if (widgetType.settings) {
        Object.entries(widgetType.settings).forEach(([key, def]) => {
          defaultSettings[key] = def.default;
        });
      }
      
      return {
        id: options.id || `widget_${type}_${Date.now()}`,
        type: type,
        size: size,
        cols: sizePreset.cols,
        rows: sizePreset.rows,
        position: options.position || { col: 0, row: 0 },
        settings: { ...defaultSettings, ...(options.settings || {}) },
        createdAt: Date.now()
      };
    },
    
    /**
     * Валидировать экземпляр виджета
     * @param {Object} widget
     * @returns {boolean}
     */
    validateWidget(widget) {
      if (!widget || typeof widget !== 'object') return false;
      if (!widget.id || typeof widget.id !== 'string') return false;
      if (!widget.type || !WIDGET_TYPES[widget.type]) return false;
      const norm = this.normalizeSizeId(widget.size);
      if (!norm || !SIZES[norm]) return false;
      return true;
    },
    
    /**
     * Зарегистрировать кастомный тип виджета
     * @param {Object} widgetDef - Определение виджета
     */
    registerType(widgetDef) {
      if (!widgetDef.type) {
        console.error('[Widgets Registry] Widget definition must have a type');
        return false;
      }
      
      if (WIDGET_TYPES[widgetDef.type]) {
        console.warn(`[Widgets Registry] Overwriting existing widget type: ${widgetDef.type}`);
      }
      
      WIDGET_TYPES[widgetDef.type] = {
        ...widgetDef,
        defaultSize: widgetDef.defaultSize || '2x2',
        availableSizes: widgetDef.availableSizes || ['2x2'],
        category: widgetDef.category || 'advanced'
      };
      
      console.log(`[Widgets Registry] Registered widget type: ${widgetDef.type}`);
      return true;
    }
  };
  
  // === Exports ===
  HEYS.Widgets.registry = registry;
  HEYS.Widgets.CATEGORIES = CATEGORIES;
  HEYS.Widgets.SIZES = SIZES;
  HEYS.Widgets.LEGACY_SIZE_ALIASES = LEGACY_SIZE_ALIASES;
  HEYS.Widgets.WIDGET_TYPES = WIDGET_TYPES;
  
  console.log('[HEYS] Widgets Registry v1.0.0 loaded');
  
})(typeof window !== 'undefined' ? window : global);
