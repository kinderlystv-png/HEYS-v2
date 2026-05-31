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

(function () {
  'use strict';

  const HEYS = window.HEYS = window.HEYS || {};
  const devLog = (...args) => window.DEV?.log?.(...args);
  const devWarn = (...args) => window.DEV?.warn?.(...args);

  // Storage key для флагов
  const FLAGS_KEY = 'heys_feature_flags';

  // γ.1: dispatch on flag change so subsystems (e.g. OverlayStore memo) can invalidate.
  function _dispatchFlagChange(flagName, value) {
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:flag-changed', {
          detail: { name: flagName, value: !!value },
        }));
      }
    } catch (_) { /* noop */ }
  }

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

    // === Products Overlay v2 (architectural refactor, see plan structured-mixing-stallman.md) ===
    'overlay_products_v2': true,        // canonical reader (Phase γ rollout 2026-04-25)
    'dual_write_legacy': true,          // keep writing legacy heys_products for backward-compat

    // === Boot performance optimization (plan gleaming-pondering-dewdrop.md) ===
    'boot_optimized_v1': true,          // master gate for boot perf changes; disable for instant rollback
    'calendar_diag': false,             // enable verbose 30-day LS scan in useDatePickerActiveDays

    // === Storage audit enforcement (plan structured-mixing-stallman.md Phase 2b) ===
    // Phase 5: enforcement ON by default. Boot audit prunes oversized keys per registry policies;
    // cloudSync:'merge' keys (insights_feedback, hidden_products) go through _mergeAndPrune.
    'storage_audit_enforce': true,

    // === Gantt v2 — mobile-native rebuild (plan prancy-frolicking-anchor.md) ===
    // Default OFF. Enable via HEYS.featureFlags.enable('gantt_v2') after smoke-test.
    // Disable mid-flight to revert to legacy GanttScreen instantly.
    'gantt_v2': false,

    // === Curator namespace isolation (plan curried-stirring-shell.md Wave A) ===
    // Default OFF. Когда ON: setItem('heys_curator__*') в курaторской сессии идёт в
    // curator_kv_store (cross-device), bypass-я client_kv_store. Архитектурная
    // замена NON_CLIENT_DATA_BLACKLIST denylist. Rollback: instant disable.
    'curator_namespace_isolation': false,
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
      devWarn('[FeatureFlags] Failed to load flags:', e);
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
      devWarn('[FeatureFlags] Failed to save flags:', e);
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
        devWarn(`[FeatureFlags] Unknown flag: ${flagName}`);
        return;
      }
      currentFlags[flagName] = true;
      saveFlags(currentFlags);
      devLog(`[FeatureFlags] Enabled: ${flagName}`);
      _dispatchFlagChange(flagName, true);
    },

    /**
     * Выключить флаг
     * @param {string} flagName - Имя флага
     */
    disable(flagName) {
      if (!(flagName in DEFAULT_FLAGS)) {
        devWarn(`[FeatureFlags] Unknown flag: ${flagName}`);
        return;
      }
      currentFlags[flagName] = false;
      saveFlags(currentFlags);
      devLog(`[FeatureFlags] Disabled: ${flagName}`);
      _dispatchFlagChange(flagName, false);
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
      devLog('[FeatureFlags] Reset to defaults');
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
      devLog('[FeatureFlags] Enabled all modules');
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
      devLog('[FeatureFlags] Rolled back to legacy monolith');
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
      devLog(`[FeatureFlags] Enabled phase ${phase}`);
    }
  };

  // Алиас для краткости
  HEYS.flags = HEYS.featureFlags;

  // Логирование инициализации (только в dev режиме)
  if (window.DEV?.isDev?.()) {
    devLog('[FeatureFlags] Initialized with flags:', currentFlags);
  }
})();
