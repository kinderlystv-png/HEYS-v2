/**
 * HEYS App Initialization (Bootstrap) v1.0
 * =========================================
 * Application initialization utilities and dependency management
 * 
 * Features:
 * - Dependency waiting and detection
 * - React and HEYS core readiness checks
 * - Initialization retry logic with exponential backoff
 * - Loading UI management
 * - Error handling and timeout protection
 * - Client authorization utilities
 * - Curator session detection
 * 
 * Scientific Foundation:
 * - Progressive Enhancement (Aaron Gustafson, 2008)
 * - Defensive Programming
 * - Circuit Breaker Pattern (Michael Nygard)
 * 
 * @version 1.0.0
 * @feature-flag modular_bootstrap
 */

(function () {
  'use strict';

  const HEYS = window.HEYS = window.HEYS || {};

  // Default feature flags (safe, local-only)
  HEYS.features = HEYS.features || {
    unifiedTables: true,
    extendedNutrients: true
  };

  // Check feature flag - если используется legacy mode, пропускаем модуль
  if (HEYS.featureFlags?.isEnabled('use_legacy_monolith')) {
    if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
      console.log('[Bootstrap] ⏭️ Skipped (legacy monolith mode)');
    }
    return;
  }

  // Performance tracking start
  HEYS.modulePerf?.startLoad('bootstrap');

  if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
    console.log('[Bootstrap] 📦 Loading module...');
  }

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  const INIT_RETRY_DELAY = 100; // ms between dependency checks
  const MAX_INIT_RETRIES = 50; // max 50 retries = 5 seconds

  let reactCheckCount = 0;

  // ==========================================================================
  // STORAGE HELPERS (store-first + ¤Z¤)
  // ==========================================================================

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

  const readGlobalValue = (key, fallback) => {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(key, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, fallback);
        }
      }
      const raw = localStorage.getItem(key);
      if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, fallback);
      return fallback;
    } catch {
      return fallback;
    }
  };

  // ============================================================================
  // DEPENDENCY DETECTION
  // ============================================================================

  /**
   * Check if React is loaded and ready
   * @returns {boolean} true if React and ReactDOM are available
   */
  function isReactReady() {
    return !!(window.React && window.ReactDOM);
  }

  /**
   * Check if HEYS core modules are ready
   * @returns {boolean} true if required HEYS modules are loaded
   */
  function isHeysReady() {
    return !!(
      window.HEYS &&
      window.HEYS.core &&
      window.HEYS.store &&
      window.HEYS.YandexAPI
    );
  }

  // ============================================================================
  // LOADING UI
  // ============================================================================

  /**
   * Show minimal loading spinner
   */
  function showInitLoader() {
    if (document.getElementById('heys-init-loader')) return;

    const bootLog = (msg) => window.__heysLog && window.__heysLog('[DEPS] ' + msg);
    bootLog('showing loader (waiting for deps)');

    const loader = document.createElement('div');
    loader.id = 'heys-init-loader';
    loader.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#fff;z-index:99999';
    loader.innerHTML = '<div style="width:40px;height:40px;border:3px solid #e5e7eb;border-top-color:#10b981;border-radius:50%;animation:spin 0.8s linear infinite"></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(loader);
  }

  /**
   * Hide loading spinner
   */
  function hideInitLoader() {
    document.getElementById('heys-init-loader')?.remove();
  }

  /**
   * Show error message when initialization fails
   */
  function showInitError() {
    hideInitLoader();
    document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:system-ui"><h1>⚠️ Ошибка загрузки</h1><p>Не удалось загрузить приложение. Обновите страницу.</p><button onclick="location.reload()" style="margin-top:20px;padding:12px 24px;background:#10b981;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer">Обновить</button></div>';
  }

  // ============================================================================
  // DEPENDENCY WAITING
  // ============================================================================

  /**
   * Wait for dependencies with retry logic
   * @param {Function} onReady - Callback to execute when ready
   */
  function waitForDependencies(onReady) {
    const bootLog = (msg) => window.__heysLog && window.__heysLog('[DEPS] ' + msg);

    // Show loader after 200ms (2 checks)
    if (reactCheckCount === 2) {
      showInitLoader();
    }

    // Check if all dependencies are ready
    if (isReactReady() && isHeysReady()) {
      bootLog('deps ready, init app');
      hideInitLoader();
      reactCheckCount = 0; // Reset counter
      onReady();
      return;
    }

    reactCheckCount++;
    bootLog('waiting #' + reactCheckCount + ' React:' + isReactReady() + ' HEYS:' + isHeysReady());

    // Timeout protection - max 50 attempts (5 seconds)
    if (reactCheckCount > MAX_INIT_RETRIES) {
      console.error('[Bootstrap] ❌ Timeout waiting for dependencies!');
      console.error('[Bootstrap] React ready:', isReactReady());
      console.error('[Bootstrap] HEYS ready:', isHeysReady());
      bootLog('TIMEOUT! React:' + isReactReady() + ' HEYS:' + isHeysReady());

      showInitError();
      return;
    }

    // Retry after delay
    setTimeout(() => waitForDependencies(onReady), INIT_RETRY_DELAY);
  }

  // ============================================================================
  // AUTHORIZATION UTILITIES
  // ============================================================================

  /**
   * Check if current session is curator (vs client)
   * @returns {boolean} true if curator session
   */
  function isCuratorSession() {
    if (HEYS.auth?.isCuratorSession) return HEYS.auth.isCuratorSession();
    const curatorSession = readGlobalValue('heys_curator_session', null);
    if (curatorSession && curatorSession.length > 10) return true;
    const legacy = readGlobalValue('heys_supabase_auth_token', null);
    if (legacy?.access_token) return true;
    return !!HEYS.cloud?.getUser?.();
  }

  /**
   * Check if user is authorized as CLIENT (not curator, not guest)
   * @returns {boolean} true if client is authorized
   */
  function isClientAuthorized() {
    let clientId = null;

    // 1. Try heys_pin_auth_client first (for PIN auth)
    const pinAuthClient = readGlobalValue('heys_pin_auth_client', null);
    if (pinAuthClient && pinAuthClient.length > 10) {
      clientId = pinAuthClient;
    }

    // 2. Then try heys_client_current (for curator-managed clients)
    if (!clientId) {
      const raw = readGlobalValue('heys_client_current', null);
      if (raw) clientId = raw;
    }

    const isCurator = isCuratorSession();
    const result = clientId && clientId.length > 10 && !isCurator;

    if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
      console.log('[Bootstrap] isClientAuthorized:', {
        clientId: clientId ? 'present' : 'missing',
        length: clientId?.length,
        isCurator,
        result
      });
    }

    return result;
  }

  // ============================================================================
  // MODULE EXPORTS
  // ============================================================================

  // Export Bootstrap API to HEYS namespace
  HEYS.Bootstrap = {
    // Dependency detection
    isReactReady: isReactReady,
    isHeysReady: isHeysReady,

    // Initialization
    waitForDependencies: waitForDependencies,

    // Authorization
    isCuratorSession: isCuratorSession,
    isClientAuthorized: isClientAuthorized,

    // UI
    showInitLoader: showInitLoader,
    hideInitLoader: hideInitLoader,
    showInitError: showInitError,

    // Constants
    INIT_RETRY_DELAY: INIT_RETRY_DELAY,
    MAX_INIT_RETRIES: MAX_INIT_RETRIES
  };

  // Export to window for backward compatibility
  window.waitForDependencies = waitForDependencies;
  window.isReactReady = isReactReady;
  window.isHeysReady = isHeysReady;
  window.isCuratorSession = isCuratorSession;
  window.isClientAuthorized = isClientAuthorized;

  // Also export to legacy _tour namespace if it exists
  if (window.HEYS._tour) {
    window.HEYS._tour.isCuratorSession = isCuratorSession;
    window.HEYS._tour.isClientAuthorized = isClientAuthorized;
  }

  // Performance tracking end
  HEYS.modulePerf?.endLoad('bootstrap', true);

  if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
    console.log('[Bootstrap] ✅ Module loaded successfully');
  }
})();
