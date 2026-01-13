/**
 * HEYS Feature Flags v1.0
 * =======================
 * Система управления feature flags для безопасного постепенного внедрения модулей
 * 
 * Паттерн использования:
 *   HEYS.featureFlags.isEnabled('newModularApp') // boolean
 *   HEYS.featureFlags.enable('newModularApp')
 *   HEYS.featureFlags.disable('newModularApp')
 * 
 * Научная основа: Feature Toggles (Martin Fowler 2017)
 */

(function() {
  'use strict';

  const HEYS = window.HEYS = window.HEYS || {};
  
  // Storage key для флагов
  const FLAGS_KEY = 'heys_feature_flags';
  
  // Значения по умолчанию для всех флагов
  const DEFAULT_FLAGS = {
    // === App Refactoring Flags ===
    'modular_platform_apis': false,     // Новый модуль Platform APIs
    'modular_pwa': false,               // Новый модуль PWA
    'modular_auth': false,              // Новый модуль Auth Integration
    'modular_navigation': false,        // Новый модуль Navigation
    'modular_sync': false,              // Новый модуль Sync State Machine
    'modular_bootstrap': false,         // Новый модуль Bootstrap (инициализация)
    
    // === Режим разработки ===
    'dev_module_logging': false,        // Детальное логирование загрузки модулей
    'dev_performance_tracking': false,  // Трекинг производительности модулей
    
    // === Rollback флаг ===
    'use_legacy_monolith': false,       // true = старый код, false = новые модули
  };
  
  /**
   * Загрузить флаги из localStorage
   * @returns {Object} Объект с флагами
   */
  function loadFlags() {
    try {
      const stored = localStorage.getItem(FLAGS_KEY);
      if (!stored) return { ...DEFAULT_FLAGS };
      
      const parsed = JSON.parse(stored);
      // Мержим с дефолтами на случай новых флагов
      return { ...DEFAULT_FLAGS, ...parsed };
    } catch (e) {
      console.warn('[FeatureFlags] Failed to load flags:', e);
      return { ...DEFAULT_FLAGS };
    }
  }
  
  /**
   * Сохранить флаги в localStorage
   * @param {Object} flags - Объект с флагами
   */
  function saveFlags(flags) {
    try {
      localStorage.setItem(FLAGS_KEY, JSON.stringify(flags));
    } catch (e) {
      console.error('[FeatureFlags] Failed to save flags:', e);
    }
  }
  
  // Текущее состояние флагов
  let currentFlags = loadFlags();
  
  /**
   * Feature Flags API
   */
  HEYS.featureFlags = {
    /**
     * Проверить, включен ли флаг
     * @param {string} flagName - Имя флага
     * @returns {boolean} true если флаг включен
     */
    isEnabled(flagName) {
      return currentFlags[flagName] === true;
    },
    
    /**
     * Включить флаг
     * @param {string} flagName - Имя флага
     */
    enable(flagName) {
      if (!(flagName in DEFAULT_FLAGS)) {
        console.warn(`[FeatureFlags] Unknown flag: ${flagName}`);
        return;
      }
      currentFlags[flagName] = true;
      saveFlags(currentFlags);
      console.log(`[FeatureFlags] Enabled: ${flagName}`);
    },
    
    /**
     * Выключить флаг
     * @param {string} flagName - Имя флага
     */
    disable(flagName) {
      if (!(flagName in DEFAULT_FLAGS)) {
        console.warn(`[FeatureFlags] Unknown flag: ${flagName}`);
        return;
      }
      currentFlags[flagName] = false;
      saveFlags(currentFlags);
      console.log(`[FeatureFlags] Disabled: ${flagName}`);
    },
    
    /**
     * Получить все флаги (для отладки)
     * @returns {Object} Объект с состоянием всех флагов
     */
    getAll() {
      return { ...currentFlags };
    },
    
    /**
     * Сбросить все флаги к дефолтам
     */
    reset() {
      currentFlags = { ...DEFAULT_FLAGS };
      saveFlags(currentFlags);
      console.log('[FeatureFlags] Reset to defaults');
    },
    
    /**
     * Включить все модульные флаги (для тестирования полного перехода)
     */
    enableAllModules() {
      currentFlags.modular_platform_apis = true;
      currentFlags.modular_pwa = true;
      currentFlags.modular_auth = true;
      currentFlags.modular_navigation = true;
      currentFlags.modular_sync = true;
      currentFlags.modular_bootstrap = true;
      currentFlags.use_legacy_monolith = false;
      saveFlags(currentFlags);
      console.log('[FeatureFlags] Enabled all modules');
    },
    
    /**
     * Вернуться к legacy монолиту (откат)
     */
    rollbackToLegacy() {
      currentFlags.modular_platform_apis = false;
      currentFlags.modular_pwa = false;
      currentFlags.modular_auth = false;
      currentFlags.modular_navigation = false;
      currentFlags.modular_sync = false;
      currentFlags.modular_bootstrap = false;
      currentFlags.use_legacy_monolith = true;
      saveFlags(currentFlags);
      console.log('[FeatureFlags] Rolled back to legacy monolith');
    },
    
    /**
     * Постепенное включение модулей (фазированный rollout)
     * @param {number} phase - Номер фазы (1-6)
     */
    enablePhase(phase) {
      // Фаза 1: Platform APIs
      if (phase >= 1) {
        currentFlags.modular_platform_apis = true;
      }
      // Фаза 2: PWA
      if (phase >= 2) {
        currentFlags.modular_pwa = true;
      }
      // Фаза 3: Bootstrap (инициализация)
      if (phase >= 3) {
        currentFlags.modular_bootstrap = true;
      }
      // Фаза 4: Auth
      if (phase >= 4) {
        currentFlags.modular_auth = true;
      }
      // Фаза 5: Navigation
      if (phase >= 5) {
        currentFlags.modular_navigation = true;
      }
      // Фаза 6: Sync + отключение legacy
      if (phase >= 6) {
        currentFlags.modular_sync = true;
        currentFlags.use_legacy_monolith = false;
      }
      
      saveFlags(currentFlags);
      console.log(`[FeatureFlags] Enabled phase ${phase}`);
    }
  };
  
  // Алиас для краткости
  HEYS.flags = HEYS.featureFlags;
  
  // Логирование инициализации (только в dev режиме)
  if (window.DEV?.isDev?.()) {
    console.log('[FeatureFlags] Initialized with flags:', currentFlags);
  }
})();
