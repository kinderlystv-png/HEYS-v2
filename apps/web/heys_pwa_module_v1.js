/**
 * HEYS PWA Update Manager v1.0
 * =============================
 * Progressive Web App update management and version control
 * 
 * Features:
 * - Version tracking & semantic comparison
 * - Update badge notification (non-intrusive)
 * - Update modal with progress stages
 * - Network quality detection
 * - Smart periodic version checks
 * - Manual refresh prompts (iOS fallback)
 * - Update lock/unlock mechanisms
 * - Exponential backoff for failed checks
 * 
 * Scientific Foundation:
 * - Progressive Enhancement (Aaron Gustafson, 2008)
 * - User-Centric Performance Metrics (Google Web Vitals)
 * - Service Worker Lifecycle (W3C)
 * 
 * @version 1.0.0
 * @feature-flag modular_pwa
 */

(function () {
  'use strict';

  const HEYS = window.HEYS = window.HEYS || {};

  // Check feature flag - если используется legacy mode, пропускаем модуль
  if (HEYS.featureFlags?.isEnabled('use_legacy_monolith')) {
    if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
      console.log('[PWA] ⏭️ Skipped (legacy monolith mode)');
    }
    return;
  }

  // Performance tracking start
  HEYS.modulePerf?.startLoad('pwa_module');

  if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
    console.log('[PWA] 📦 Loading module...');
  }

  // ============================================================================
  // EXTRACTED CODE FROM heys_app_v12.js (lines 18-479)
  // ============================================================================

  // === App Version & Auto-logout on Update ===
  const APP_VERSION = '2026.02.28.0012.1ca916fe'; // synced with build-meta.json on 2026-02-26

  HEYS.version = APP_VERSION;

  // 🔍 PWA Debug helper — показать boot лог (вызвать в консоли или после загрузки)
  HEYS.showBootLog = function () {
    try {
      const log = JSON.parse(localStorage.getItem('heys_boot_log') || '[]');
      console.table(log);
      return log;
    } catch (e) {
      console.log('No boot log');
      return [];
    }
  };

  // 🔍 PWA Debug — включить/выключить vConsole
  HEYS.enableDebug = function (enabled = true) {
    localStorage.setItem('heys_debug', enabled ? '1' : '0');
    console.log('Debug mode:', enabled ? 'ON (reload to see vConsole)' : 'OFF');
  };

  // === Семантическое сравнение версий ===
  // Версия: YYYY.MM.DD.HHMM.hash → сравниваем числовую часть
  const getUpdateHelpers = () => HEYS.PlatformAPIs || {};

  const isNewerVersion = (serverVersion, currentVersion) => {
    return HEYS.PlatformAPIs?.isNewerVersion?.(serverVersion, currentVersion) ?? false;
  };

  const isUpdateLocked = () => getUpdateHelpers().isUpdateLocked?.() ?? false;
  const setUpdateLock = () => getUpdateHelpers().setUpdateLock?.();
  const clearUpdateLock = () => getUpdateHelpers().clearUpdateLock?.();
  const showUpdateBadge = (version) => getUpdateHelpers().showUpdateBadge?.(version);
  const hideUpdateBadge = () => getUpdateHelpers().hideUpdateBadge?.();
  const showUpdateModal = (stage) => getUpdateHelpers().showUpdateModal?.(stage);
  const updateModalStage = (stage) => getUpdateHelpers().updateModalStage?.(stage);
  const hideUpdateModal = () => getUpdateHelpers().hideUpdateModal?.();
  const showManualRefreshPrompt = (version) => getUpdateHelpers().showManualRefreshPrompt?.(version);
  const checkServerVersion = (silent = true) => getUpdateHelpers().checkServerVersion?.(silent);
  const getNetworkQuality = () => getUpdateHelpers().getNetworkQuality?.() || { type: 'unknown', quality: 'good' };
  const smartVersionCheck = () => getUpdateHelpers().smartVersionCheck?.();

  HEYS.installUpdate = async () => {
    return getUpdateHelpers().installUpdate?.();
  };

  // ============================================================================
  // MODULE EXPORTS
  // ============================================================================

  // Экспортируем PWA API в namespace
  HEYS.PWA = {
    // Version
    version: APP_VERSION,
    isNewerVersion: isNewerVersion,

    // Update lock
    isUpdateLocked: isUpdateLocked,
    setUpdateLock: setUpdateLock,
    clearUpdateLock: clearUpdateLock,

    // Update badge
    showUpdateBadge: showUpdateBadge,
    hideUpdateBadge: hideUpdateBadge,
    installUpdate: HEYS.installUpdate,

    // Network quality
    getNetworkQuality: getNetworkQuality,

    // Smart checks
    smartVersionCheck: smartVersionCheck,
    checkServerVersion: checkServerVersion,

    // Update modal
    showUpdateModal: showUpdateModal,
    updateModalStage: updateModalStage,
    hideUpdateModal: hideUpdateModal,

    // Manual refresh
    showManualRefreshPrompt: showManualRefreshPrompt,

    // Expose globals for backward compatibility
    _updateAvailable: () => (HEYS.PlatformAPIs?.getUpdateState?.().available ?? false),
    _updateVersion: () => (HEYS.PlatformAPIs?.getUpdateState?.().version ?? null)
  };

  // Performance tracking end
  HEYS.modulePerf?.endLoad('pwa_module', true);

  if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
    console.log('[PWA] ✅ Module loaded successfully');
  }
})();
