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
  const APP_VERSION = '2026.01.08.1630.tourfix17'; // v1.17: tooltip vertical boundary fix + scroll to top after InsightsTour

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
  function isNewerVersion(serverVersion, currentVersion) {
    if (!serverVersion || !currentVersion) return false;
    if (serverVersion === currentVersion) return false;

    // Извлекаем числовую часть: 2025.12.12.2113 → 202512122113
    const extractNumeric = (v) => {
      const parts = v.split('.');
      if (parts.length < 4) return 0;
      // YYYY.MM.DD.HHMM → concatenate
      return parseInt(parts.slice(0, 4).join(''), 10) || 0;
    };

    const serverNum = extractNumeric(serverVersion);
    const currentNum = extractNumeric(currentVersion);

    // Серверная версия новее только если её число БОЛЬШЕ
    return serverNum > currentNum;
  }

  const getUpdateHelpers = () => HEYS.PlatformAPIs || {};

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

  // Also export to window for backward compatibility
  window.isUpdateLocked = window.isUpdateLocked || isUpdateLocked;
  window.setUpdateLock = window.setUpdateLock || setUpdateLock;
  window.clearUpdateLock = window.clearUpdateLock || clearUpdateLock;
  window.showUpdateBadge = window.showUpdateBadge || showUpdateBadge;
  window.hideUpdateModal = window.hideUpdateModal || hideUpdateModal;
  window.showUpdateModal = window.showUpdateModal || showUpdateModal;
  window.updateModalStage = window.updateModalStage || updateModalStage;
  window.getNetworkQuality = window.getNetworkQuality || getNetworkQuality;
  window.showManualRefreshPrompt = window.showManualRefreshPrompt || showManualRefreshPrompt;
  window.checkServerVersion = window.checkServerVersion || checkServerVersion;

  // Performance tracking end
  HEYS.modulePerf?.endLoad('pwa_module', true);

  if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
    console.log('[PWA] ✅ Module loaded successfully');
  }
})();
