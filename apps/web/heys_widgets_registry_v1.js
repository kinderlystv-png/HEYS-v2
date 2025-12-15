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
  const SIZES = {
    compact: { cols: 1, rows: 1, label: 'Компактный', cssClass: 'widget--compact' },
    wide: { cols: 2, rows: 1, label: 'Широкий', cssClass: 'widget--wide' },
    tall: { cols: 1, rows: 2, label: 'Высокий', cssClass: 'widget--tall' },
    large: { cols: 2, rows: 2, label: 'Большой', cssClass: 'widget--large' }
  };
  
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
      defaultSize: 'compact',
      availableSizes: ['compact', 'wide'],
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
      defaultSize: 'wide',
      availableSizes: ['wide', 'large'],
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
      defaultSize: 'compact',
      availableSizes: ['compact', 'wide'],
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
      defaultSize: 'compact',
      availableSizes: ['compact', 'wide'],
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
      defaultSize: 'compact',
      availableSizes: ['compact', 'wide'],
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
      defaultSize: 'wide',
      availableSizes: ['compact', 'wide', 'large'],
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
      defaultSize: 'compact',
      availableSizes: ['compact', 'wide'],
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
      defaultSize: 'compact',
      availableSizes: ['compact', 'wide'],
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
      defaultSize: 'wide',
      availableSizes: ['wide', 'large'],
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
      defaultSize: 'compact',
      availableSizes: ['compact', 'wide'],
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
      return SIZES[sizeId] || null;
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
      return widgetType.availableSizes.includes(sizeId);
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
      
      const size = options.size || widgetType.defaultSize;
      const sizePreset = SIZES[size];
      
      if (!sizePreset) {
        console.error(`[Widgets Registry] Unknown size: ${size}`);
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
      if (!widget.size || !SIZES[widget.size]) return false;
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
        defaultSize: widgetDef.defaultSize || 'compact',
        availableSizes: widgetDef.availableSizes || ['compact'],
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
  HEYS.Widgets.WIDGET_TYPES = WIDGET_TYPES;
  
  console.log('[HEYS] Widgets Registry v1.0.0 loaded');
  
})(typeof window !== 'undefined' ? window : global);
