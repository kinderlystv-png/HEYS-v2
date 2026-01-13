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

(function() {
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
        const VERSION_KEY = 'heys_app_version';
        const UPDATE_LOCK_KEY = 'heys_update_in_progress'; // Блокировка дублирования
        const UPDATE_LOCK_TIMEOUT = 30000; // 30 сек макс на обновление
        
        // === Update Attempt Tracking (защита от бесконечного цикла) ===
        const UPDATE_ATTEMPT_KEY = 'heys_update_attempt';
        const MAX_UPDATE_ATTEMPTS = 2;
        const UPDATE_COOLDOWN_MS = 60000; // 1 минута между попытками
        
        HEYS.version = APP_VERSION;
        
        // 🔍 PWA Debug helper — показать boot лог (вызвать в консоли или после загрузки)
        HEYS.showBootLog = function() {
          try {
            const log = JSON.parse(localStorage.getItem('heys_boot_log') || '[]');
            console.table(log);
            return log;
          } catch(e) {
            console.log('No boot log');
            return [];
          }
        };
        
        // 🔍 PWA Debug — включить/выключить vConsole
        HEYS.enableDebug = function(enabled = true) {
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
        
        // Проверка блокировки обновления
        function isUpdateLocked() {
          try {
            const lockData = localStorage.getItem(UPDATE_LOCK_KEY);
            if (!lockData) return false;
            const { timestamp } = JSON.parse(lockData);
            // Блокировка истекает через 30 сек
            if (Date.now() - timestamp > UPDATE_LOCK_TIMEOUT) {
              localStorage.removeItem(UPDATE_LOCK_KEY);
              return false;
            }
            return true;
          } catch {
            return false;
          }
        }
        
        function setUpdateLock() {
          localStorage.setItem(UPDATE_LOCK_KEY, JSON.stringify({ timestamp: Date.now() }));
        }
        
        function clearUpdateLock() {
          localStorage.removeItem(UPDATE_LOCK_KEY);
        }
        
        // === UPDATE AVAILABLE BADGE ===
        // Ненавязчивый индикатор "есть обновление" (как в топовых приложениях)
        let _updateAvailable = false;
        let _updateVersion = null;
        
        function showUpdateBadge(version) {
          _updateAvailable = true;
          _updateVersion = version;
          
          // Удаляем предыдущий badge если есть
          document.getElementById('heys-update-badge')?.remove();
          
          const badge = document.createElement('div');
          badge.id = 'heys-update-badge';
          badge.innerHTML = `
            <style>
              @keyframes heys-badge-pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
                50% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
              }
              @keyframes heys-badge-slide {
                from { transform: translateY(-100px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
              #heys-update-badge-btn:hover {
                transform: scale(1.02);
                box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
              }
              #heys-update-badge-btn:active {
                transform: scale(0.98);
              }
            </style>
            <button id="heys-update-badge-btn" onclick="window.HEYS?.installUpdate?.()" style="
              position: fixed;
              top: calc(env(safe-area-inset-top, 0px) + 12px);
              left: 50%;
              transform: translateX(-50%);
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              border: none;
              border-radius: 50px;
              padding: 10px 20px;
              font-family: system-ui, -apple-system, sans-serif;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              z-index: 99998;
              display: flex;
              align-items: center;
              gap: 8px;
              box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
              animation: heys-badge-slide 0.4s ease-out, heys-badge-pulse 2s ease-in-out infinite;
              transition: all 0.2s ease;
            ">
              <span style="font-size: 16px;">🆕</span>
              <span>Обновить HEYS</span>
              <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 20px; font-size: 11px;">v${version?.split('.').slice(0,3).join('.') || 'new'}</span>
            </button>
          `;
          document.body.appendChild(badge);
          
          // Вибрация если поддерживается (лёгкая)
          if (navigator.vibrate) navigator.vibrate(50);
        }
        
        function hideUpdateBadge() {
          _updateAvailable = false;
          _updateVersion = null;
          const badge = document.getElementById('heys-update-badge');
          if (badge) {
            badge.style.opacity = '0';
            badge.style.transform = 'translateY(-50px)';
            badge.style.transition = 'all 0.3s ease';
            setTimeout(() => badge.remove(), 300);
          }
        }
        
        // Экспорт для вызова из badge
        HEYS.installUpdate = async () => {
          hideUpdateBadge();
          showUpdateModal('found');
          setTimeout(() => updateModalStage('downloading'), 800);
          setTimeout(() => updateModalStage('installing'), 1600);
          setTimeout(() => {
            updateModalStage('reloading');
            forceUpdateAndReload(false);
          }, 2400);
        };
        
        // === NETWORK QUALITY INDICATOR ===
        // Определяем качество сети для адаптивных стратегий
        function getNetworkQuality() {
          const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
          if (!connection) return { type: 'unknown', quality: 'good' };
          
          const effectiveType = connection.effectiveType; // 'slow-2g', '2g', '3g', '4g'
          const downlink = connection.downlink; // Mbps
          const rtt = connection.rtt; // ms
          
          let quality = 'good';
          if (effectiveType === 'slow-2g' || effectiveType === '2g' || rtt > 500) {
            quality = 'poor';
          } else if (effectiveType === '3g' || rtt > 200 || downlink < 1) {
            quality = 'moderate';
          }
          
          return { type: effectiveType || 'unknown', downlink, rtt, quality, saveData: connection.saveData };
        }
        
        // === SMART PERIODIC CHECKS ===
        // Адаптивный интервал проверок с exponential backoff
        let _checkInterval = 30 * 60 * 1000; // Начинаем с 30 минут
        let _consecutiveFailures = 0;
        let _lastSuccessfulCheck = Date.now();
        
        async function smartVersionCheck() {
          const network = getNetworkQuality();
          
          // Не проверяем при плохой сети или режиме экономии трафика
          if (network.quality === 'poor' || network.saveData) {
            console.log('[PWA] ⏸️ Skipping check: poor network or save-data mode');
            return;
          }
          
          try {
            const hasUpdate = await checkServerVersion(true);
            
            if (hasUpdate) {
              // Показываем badge вместо модалки (ненавязчиво)
              showUpdateBadge(_updateVersion);
              _consecutiveFailures = 0;
            } else {
              _consecutiveFailures = 0;
              _lastSuccessfulCheck = Date.now();
            }
          } catch (e) {
            _consecutiveFailures++;
            // Exponential backoff при ошибках (max 2 часа)
            _checkInterval = Math.min(_checkInterval * 1.5, 2 * 60 * 60 * 1000);
            console.log('[PWA] Check failed, next interval:', _checkInterval / 60000, 'min');
          }
        }
        
        // === Update UI ===
        // Красивая модалка для показа процесса обновления
        function showUpdateModal(stage = 'checking') {
          // Удаляем предыдущую если есть
          document.getElementById('heys-update-modal')?.remove();
          
          const stages = {
            checking: { icon: '🔍', title: 'Проверка обновлений', subtitle: 'Подождите...', isSpinner: false },
            found: { icon: '🆕', title: 'Найдено обновление!', subtitle: 'Загружаем новую версию...', isSpinner: false },
            downloading: { icon: '📥', title: 'Загрузка', subtitle: 'Это займёт пару секунд...', isSpinner: false },
            installing: { icon: '⚙️', title: 'Установка', subtitle: 'Почти готово...', isSpinner: false },
            ready: { icon: '✨', title: 'Готово!', subtitle: 'Приложение обновлено', isSpinner: false },
            reloading: { icon: 'spinner', title: 'Перезагрузка', subtitle: 'Применяем изменения...', isSpinner: true }
          };
          
          const s = stages[stage] || stages.checking;
          
          const modal = document.createElement('div');
          modal.id = 'heys-update-modal';
          modal.innerHTML = `
            <style>
              @keyframes heys-update-pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.1); opacity: 0.8; }
              }
              @keyframes heys-update-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              @keyframes heys-update-progress {
                0% { width: 0%; }
                100% { width: 100%; }
              }
              @keyframes heys-update-fade-in {
                from { opacity: 0; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1); }
              }
              .heys-spinner {
                width: 48px;
                height: 48px;
                border: 4px solid rgba(255,255,255,0.2);
                border-top-color: #10b981;
                border-radius: 50%;
                animation: heys-update-spin 0.8s linear infinite;
                margin: 0 auto 20px;
              }
            </style>
            <div style="
              position: fixed; inset: 0;
              background: rgba(0, 0, 0, 0.7);
              backdrop-filter: blur(8px);
              display: flex; align-items: center; justify-content: center;
              z-index: 999999;
              animation: heys-update-fade-in 0.3s ease-out;
            ">
              <div style="
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border-radius: 24px;
                padding: 40px;
                text-align: center;
                max-width: 320px;
                margin: 20px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255,255,255,0.1);
              ">
                <div id="heys-update-icon" style="
                  font-size: 64px;
                  margin-bottom: 20px;
                  ${s.isSpinner ? '' : 'animation: heys-update-pulse 2s ease-in-out infinite;'}
                ">${s.isSpinner ? '<div class="heys-spinner"></div>' : s.icon}</div>
                
                <h2 id="heys-update-title" style="
                  color: white;
                  font-size: 22px;
                  font-weight: 600;
                  margin: 0 0 8px 0;
                  font-family: system-ui, -apple-system, sans-serif;
                ">${s.title}</h2>
                
                <p id="heys-update-subtitle" style="
                  color: rgba(255,255,255,0.7);
                  font-size: 14px;
                  margin: 0 0 24px 0;
                  font-family: system-ui, -apple-system, sans-serif;
                ">${s.subtitle}</p>
                
                <!-- Progress bar -->
                <div style="
                  background: rgba(255,255,255,0.1);
                  border-radius: 10px;
                  height: 6px;
                  overflow: hidden;
                  margin-bottom: 16px;
                ">
                  <div id="heys-update-progress" style="
                    height: 100%;
                    background: linear-gradient(90deg, #4285f4, #2563eb);
                    border-radius: 10px;
                    width: ${stage === 'checking' ? '20%' : stage === 'found' ? '40%' : stage === 'downloading' ? '60%' : stage === 'installing' ? '80%' : '100%'};
                    transition: width 0.5s ease-out;
                  "></div>
                </div>
                
                <p style="
                  color: rgba(255,255,255,0.4);
                  font-size: 11px;
                  margin: 0;
                ">Версия ${APP_VERSION}</p>
              </div>
            </div>
          `;
          
          document.body.appendChild(modal);
          return modal;
        }
        
        // Обновить стадию в модалке
        function updateModalStage(stage) {
          const stages = {
            checking: { icon: '🔍', title: 'Проверка обновлений', subtitle: 'Подождите...', progress: 20, isSpinner: false },
            found: { icon: '🆕', title: 'Найдено обновление!', subtitle: 'Загружаем новую версию...', progress: 40, isSpinner: false },
            downloading: { icon: '📥', title: 'Загрузка', subtitle: 'Это займёт пару секунд...', progress: 60, isSpinner: false },
            installing: { icon: '⚙️', title: 'Установка', subtitle: 'Почти готово...', progress: 80, isSpinner: false },
            ready: { icon: '✨', title: 'Готово!', subtitle: 'Приложение обновлено', progress: 100, isSpinner: false },
            reloading: { icon: 'spinner', title: 'Перезагрузка', subtitle: 'Применяем изменения...', progress: 100, isSpinner: true }
          };
          
          const s = stages[stage];
          if (!s) return;
          
          const icon = document.getElementById('heys-update-icon');
          const title = document.getElementById('heys-update-title');
          const subtitle = document.getElementById('heys-update-subtitle');
          const progress = document.getElementById('heys-update-progress');
          
          if (icon) {
            if (s.isSpinner) {
              icon.innerHTML = '<div class="heys-spinner"></div>';
              icon.style.animation = 'none';
            } else {
              icon.textContent = s.icon;
              icon.innerHTML = s.icon;
              icon.style.animation = 'heys-update-pulse 2s ease-in-out infinite';
            }
          }
          if (title) title.textContent = s.title;
          if (subtitle) subtitle.textContent = s.subtitle;
          if (progress) progress.style.width = s.progress + '%';
        }
        
        // Скрыть модалку
        function hideUpdateModal() {
          const modal = document.getElementById('heys-update-modal');
          if (modal) {
            modal.style.opacity = '0';
            modal.style.transition = 'opacity 0.3s';
            setTimeout(() => modal.remove(), 300);
          }
        }
        
        // === Ручной промпт обновления (когда автообновление застряло) ===
        function showManualRefreshPrompt(targetVersion) {
          document.getElementById('heys-update-modal')?.remove();
          
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          
          const modal = document.createElement('div');
          modal.id = 'heys-update-modal';
          modal.innerHTML = `
            <div style="
              position: fixed; inset: 0;
              background: rgba(0, 0, 0, 0.8);
              display: flex; align-items: center; justify-content: center;
              z-index: 999999;
            ">
              <div style="
                background: #1a1a2e;
                border-radius: 20px;
                padding: 32px;
                text-align: center;
                max-width: 320px;
                margin: 20px;
              ">
                <style>
                  .heys-prompt-spinner {
                    width: 48px;
                    height: 48px;
                    border: 4px solid rgba(255,255,255,0.2);
                    border-top-color: #10b981;
                    border-radius: 50%;
                    animation: heys-prompt-spin 0.8s linear infinite;
                    margin: 0 auto 16px;
                  }
                  @keyframes heys-prompt-spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                </style>
                <div class="heys-prompt-spinner"></div>
                <h2 style="color: white; margin: 0 0 8px; font-family: system-ui, sans-serif;">Требуется обновление</h2>
                <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin: 0 0 20px; font-family: system-ui, sans-serif;">
                  ${isIOS 
                    ? 'Закройте приложение и откройте заново для обновления до v' + targetVersion
                    : 'Нажмите кнопку для обновления до v' + targetVersion}
                </p>
                ${isIOS ? '' : `
                  <button id="heys-manual-update-btn" style="
                    background: linear-gradient(135deg, #4285f4, #2563eb);
                    color: white; border: none; padding: 12px 24px; border-radius: 12px;
                    font-size: 16px; cursor: pointer; width: 100%;
                    font-family: system-ui, sans-serif;
                  ">Обновить сейчас</button>
                `}
                <button id="heys-update-later-btn" style="
                  background: transparent; color: rgba(255,255,255,0.5); border: none;
                  padding: 12px; font-size: 14px; cursor: pointer; margin-top: 12px;
                  font-family: system-ui, sans-serif;
                ">Позже</button>
              </div>
            </div>
          `;
          document.body.appendChild(modal);
          
          // Event handlers
          const updateBtn = document.getElementById('heys-manual-update-btn');
          if (updateBtn) {
            updateBtn.addEventListener('click', () => {
              localStorage.removeItem(UPDATE_ATTEMPT_KEY);
              // Hard reload с cache-bust
              const url = new URL(window.location.href);
              url.searchParams.set('_v', Date.now().toString());
              window.location.href = url.toString();
            });
          }
          
          const laterBtn = document.getElementById('heys-update-later-btn');
          if (laterBtn) {
            laterBtn.addEventListener('click', () => {
              modal.remove();
            });
          }
        }

        // === Проверка версии с сервера (обход кэша) ===
        async function checkServerVersion(silent = true) {
          try {
            // Загружаем version.json который генерируется при каждом билде
            const cacheBust = Date.now();
            const response = await fetch(`/version.json?_cb=${cacheBust}`, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache' }
            });
            
            if (!response.ok) return false;
            
            const data = await response.json();
            
            // Сравниваем версии семантически (серверная должна быть НОВЕЕ)
            if (data.version && isNewerVersion(data.version, APP_VERSION)) {
              
              // === Защита от бесконечного цикла обновлений ===
              const attempt = JSON.parse(localStorage.getItem(UPDATE_ATTEMPT_KEY) || '{}');
              const now = Date.now();
              
              // Cooldown — не пытаться чаще чем раз в минуту
              if (attempt.timestamp && (now - attempt.timestamp) < UPDATE_COOLDOWN_MS) {
                return false;
              }
              
              // Счётчик попыток для этой версии
              if (attempt.targetVersion === data.version) {
                attempt.count = (attempt.count || 0) + 1;
              } else {
                attempt.targetVersion = data.version;
                attempt.count = 1;
              }
              attempt.timestamp = now;
              localStorage.setItem(UPDATE_ATTEMPT_KEY, JSON.stringify(attempt));
              
              // Если много попыток — показать ручной промпт
              if (attempt.count > MAX_UPDATE_ATTEMPTS) {
                console.warn('[HEYS] Update stuck after', attempt.count, 'attempts');
                showManualRefreshPrompt(data.version);
                return true;
              }
              
              // Предотвращаем дублирование обновления (надёжный флаг в localStorage)
              if (isUpdateLocked()) {
                return true;
              }
              setUpdateLock();
              
              // Показываем красивый UI обновления с полным flow этапов
              showUpdateModal('found');
              
              // 🎬 Полная анимация всех этапов: found → downloading → installing → reloading
              setTimeout(() => updateModalStage('downloading'), 1200);
              setTimeout(() => updateModalStage('installing'), 2400);
              setTimeout(() => {
                updateModalStage('reloading');
                forceUpdateAndReload(false);
              }, 3600);
              
              // 🔒 Fallback: если через 12 секунд reload не произошёл — убираем модалку
              setTimeout(() => {
                const modal = document.getElementById('heys-update-modal');
                if (modal) {
                  console.warn('[HEYS] Update modal timeout, hiding...');
                  hideUpdateModal();
                  clearUpdateLock();
                }
              }, 12000);
              
              return true;
            } else if (data.version && data.version !== APP_VERSION) {
              // Серверная версия отличается, но НЕ новее — пропускаем
              return false;
            } else {
              return false;
            }
          } catch (e) {
            // Логируем ошибку для диагностики, но не прерываем работу
            console.warn('[PWA] checkServerVersion failed:', e.message || e);
            return false;
          }
        }

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
    installUpdate: window.HEYS?.installUpdate,
    
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
    _updateAvailable: () => _updateAvailable,
    _updateVersion: () => _updateVersion
  };
  
  // Also export to window for backward compatibility
  window.isUpdateLocked = isUpdateLocked;
  window.setUpdateLock = setUpdateLock;
  window.clearUpdateLock = clearUpdateLock;
  window.showUpdateBadge = showUpdateBadge;
  window.hideUpdateModal = hideUpdateModal;
  window.showUpdateModal = showUpdateModal;
  window.updateModalStage = updateModalStage;
  window.getNetworkQuality = getNetworkQuality;
  window.showManualRefreshPrompt = showManualRefreshPrompt;
  window.checkServerVersion = checkServerVersion;
  
  // Performance tracking end
  HEYS.modulePerf?.endLoad('pwa_module', true);
  
  if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
    console.log('[PWA] ✅ Module loaded successfully');
  }
})();
