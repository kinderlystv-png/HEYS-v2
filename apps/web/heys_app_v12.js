// heys_app_v12.js — Main app entry, React root, tab navigation, Supabase integration

      (function () {
        const HEYS = window.HEYS = window.HEYS || {};
        
        // === App Version & Auto-logout on Update ===
        const APP_VERSION = '2025.12.08.7d720af'; // Инкрементируй при важных изменениях
        const VERSION_KEY = 'heys_app_version';
        const UPDATE_LOCK_KEY = 'heys_update_in_progress'; // Блокировка дублирования
        const UPDATE_LOCK_TIMEOUT = 30000; // 30 сек макс на обновление
        
        // === Update Attempt Tracking (защита от бесконечного цикла) ===
        const UPDATE_ATTEMPT_KEY = 'heys_update_attempt';
        const MAX_UPDATE_ATTEMPTS = 2;
        const UPDATE_COOLDOWN_MS = 60000; // 1 минута между попытками
        
        HEYS.version = APP_VERSION;
        
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
        
        // === Update UI ===
        // Красивая модалка для показа процесса обновления
        function showUpdateModal(stage = 'checking') {
          // Удаляем предыдущую если есть
          document.getElementById('heys-update-modal')?.remove();
          
          const stages = {
            checking: { icon: '🔍', title: 'Проверка обновлений', subtitle: 'Подождите...' },
            found: { icon: '🆕', title: 'Найдено обновление!', subtitle: 'Загружаем новую версию...' },
            downloading: { icon: '📥', title: 'Загрузка', subtitle: 'Это займёт пару секунд...' },
            installing: { icon: '⚙️', title: 'Установка', subtitle: 'Почти готово...' },
            ready: { icon: '✨', title: 'Готово!', subtitle: 'Приложение обновлено' },
            reloading: { icon: '🔄', title: 'Перезагрузка', subtitle: 'Применяем изменения...' }
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
                  animation: ${stage === 'reloading' ? 'heys-update-spin 1s linear infinite' : 'heys-update-pulse 2s ease-in-out infinite'};
                ">${s.icon}</div>
                
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
                    background: linear-gradient(90deg, #667eea, #764ba2);
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
            checking: { icon: '🔍', title: 'Проверка обновлений', subtitle: 'Подождите...', progress: 20 },
            found: { icon: '🆕', title: 'Найдено обновление!', subtitle: 'Загружаем новую версию...', progress: 40 },
            downloading: { icon: '📥', title: 'Загрузка', subtitle: 'Это займёт пару секунд...', progress: 60 },
            installing: { icon: '⚙️', title: 'Установка', subtitle: 'Почти готово...', progress: 80 },
            ready: { icon: '✨', title: 'Готово!', subtitle: 'Приложение обновлено', progress: 100 },
            reloading: { icon: '🔄', title: 'Перезагрузка', subtitle: 'Применяем изменения...', progress: 100 }
          };
          
          const s = stages[stage];
          if (!s) return;
          
          const icon = document.getElementById('heys-update-icon');
          const title = document.getElementById('heys-update-title');
          const subtitle = document.getElementById('heys-update-subtitle');
          const progress = document.getElementById('heys-update-progress');
          
          if (icon) {
            icon.textContent = s.icon;
            icon.style.animation = stage === 'reloading' 
              ? 'heys-update-spin 1s linear infinite' 
              : 'heys-update-pulse 2s ease-in-out infinite';
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
                <div style="font-size: 48px; margin-bottom: 16px;">🔄</div>
                <h2 style="color: white; margin: 0 0 8px; font-family: system-ui, sans-serif;">Требуется обновление</h2>
                <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin: 0 0 20px; font-family: system-ui, sans-serif;">
                  ${isIOS 
                    ? 'Закройте приложение и откройте заново для обновления до v' + targetVersion
                    : 'Нажмите кнопку для обновления до v' + targetVersion}
                </p>
                ${isIOS ? '' : `
                  <button id="heys-manual-update-btn" style="
                    background: linear-gradient(135deg, #667eea, #764ba2);
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

        // === Service Worker Registration (Production only) ===
        function registerServiceWorker() {
          if (!('serviceWorker' in navigator)) return;
          
          // ❌ НЕ регистрируем SW на localhost — мешает разработке (HMR, updatefound и т.д.)
          if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('[SW] ⏭️ Skipped on localhost (dev mode)');
            // Удаляем существующий SW если есть (чтобы не мешал разработке)
            navigator.serviceWorker.getRegistrations().then(registrations => {
              registrations.forEach(reg => {
                reg.unregister().then(() => {
                  console.log('[SW] 🗑️ Unregistered SW on localhost');
                });
              });
            });
            return;
          }
          
          navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
              console.log('[SW] ✅ Registered successfully');
              
              // Сохраняем регистрацию для Background Sync
              window.swRegistration = registration;
              
              // Background Sync — регистрируем при изменениях данных
              window.requestBackgroundSync = function() {
                if ('sync' in registration) {
                  registration.sync.register('heys-sync')
                    .then(function() { console.log('[SW] Background sync scheduled'); })
                    .catch(function() { /* Background sync not available */ });
                }
              };
              
              // Проверяем обновления каждые 60 секунд
              setInterval(() => {
                registration.update().catch(() => {});
              }, 60000);
              
              // Слушаем обновления
              registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('[SW] 🔄 New version downloading...');
                
                // 🔒 Показываем модалку ТОЛЬКО если это реальное обновление (есть предыдущий SW)
                // При первичной регистрации SW — controller = null, модалку не показываем
                if (!navigator.serviceWorker.controller) {
                  console.log('[SW] First-time install, no update modal needed');
                  return;
                }
                
                // Предотвращаем дублирование обновления (надёжный флаг в localStorage)
                if (isUpdateLocked()) {
                  console.log('[SW] Update already in progress (locked), skipping');
                  return;
                }
                setUpdateLock();
                
                // Показываем UI обновления
                showUpdateModal('downloading');
                
                // 🔒 Fallback: если через 10 секунд модалка ещё на экране — убираем
                const swUpdateTimeout = setTimeout(() => {
                  const modal = document.getElementById('heys-update-modal');
                  if (modal) {
                    console.warn('[SW] Update modal timeout, hiding...');
                    hideUpdateModal();
                    clearUpdateLock();
                  }
                }, 10000);
                
                newWorker?.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed') {
                    console.log('[SW] 🎉 New version ready!');
                    clearTimeout(swUpdateTimeout); // Отменяем fallback
                    // Упрощённая анимация: ready → reloading → reload
                    updateModalStage('ready');
                    setTimeout(() => {
                      updateModalStage('reloading');
                      forceUpdateAndReload(false);
                    }, 800);
                  }
                });
              });
            })
            .catch((error) => {
              console.log('[SW] ❌ Registration failed', error);
            });
          
          // Слушаем сообщения от SW
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'SYNC_START' && window.HEYS?.cloud?.sync) {
              window.HEYS.cloud.sync();
            }
            if (event.data?.type === 'SYNC_COMPLETE') {
              window.dispatchEvent(new CustomEvent('heys:sync-complete'));
            }
          });
          
          // Слушаем контроллер изменений (когда SW взял контроль)
          // НЕ делаем автоматический reload! Это вызывает потерю сессии.
          // Reload только при явном запросе обновления (флаг heys_pending_update).
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[SW] Controller changed');
            // Проверяем, было ли это явное обновление (с новой версией)
            if (sessionStorage.getItem('heys_pending_update') === 'true') {
              sessionStorage.removeItem('heys_pending_update');
              console.log('[SW] Pending update confirmed, reloading...');
              window.location.reload();
            } else {
              console.log('[SW] Controller changed but no pending update, skipping reload');
            }
          });
        }
        
        // === Принудительное обновление ===
        function forceUpdateAndReload(showModal = true) {
          console.log('[HEYS] 🔄 Forcing update and reload...');
          
          if (showModal) {
            showUpdateModal('reloading');
          }
          
          // Устанавливаем флаг что это явное обновление (не случайная перезагрузка)
          sessionStorage.setItem('heys_pending_update', 'true');
          
          // Запоминаем старую версию, чтобы после перезагрузки runVersionGuard увидел рассинхрон
          // и выполнил auto-logout + баннер об обновлении
          localStorage.setItem(VERSION_KEY, APP_VERSION);
          
          // Отправляем skipWaiting — новый SW должен активироваться
          // После активации глобальный controllerchange listener (выше) сделает reload
          if (navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage('skipWaiting');
          }
          
          // ✅ НЕ делаем reload здесь сразу!
          // Глобальный controllerchange listener сделает reload когда новый SW реально активируется.
          
          // Fallback: если controllerchange не сработал за 5 секунд
          setTimeout(() => {
            // Проверяем, не сделал ли уже controllerchange reload
            if (sessionStorage.getItem('heys_pending_update') === 'true') {
              console.warn('[HEYS] controllerchange timeout, forcing reload with cache-bust');
              sessionStorage.removeItem('heys_pending_update');
              // Hard reload с cache-bust параметром
              const url = new URL(window.location.href);
              url.searchParams.set('_v', Date.now().toString());
              window.location.href = url.toString();
            }
          }, 5000);
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
            
            if (data.version && data.version !== APP_VERSION) {
              console.log(`[HEYS] 🆕 Server has new version: ${data.version} (current: ${APP_VERSION})`);
              
              // === Защита от бесконечного цикла обновлений ===
              const attempt = JSON.parse(localStorage.getItem(UPDATE_ATTEMPT_KEY) || '{}');
              const now = Date.now();
              
              // Cooldown — не пытаться чаще чем раз в минуту
              if (attempt.timestamp && (now - attempt.timestamp) < UPDATE_COOLDOWN_MS) {
                console.log('[HEYS] Update cooldown active, skipping');
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
                console.log('[HEYS] Update already in progress (locked), skipping');
                return true;
              }
              setUpdateLock();
              
              // Показываем красивый UI обновления
              showUpdateModal('found');
              
              // Упрощённая анимация: found → reloading → reload
              setTimeout(() => {
                updateModalStage('reloading');
                forceUpdateAndReload(false);
              }, 1500);
              
              // 🔒 Fallback: если через 8 секунд reload не произошёл — убираем модалку
              // Это предотвращает "застревание" на blur экране
              setTimeout(() => {
                const modal = document.getElementById('heys-update-modal');
                if (modal) {
                  console.warn('[HEYS] Update modal timeout, hiding...');
                  hideUpdateModal();
                  clearUpdateLock();
                }
              }, 8000);
              
              return true;
            } else {
              console.log(`[HEYS] ✅ Version up-to-date: ${APP_VERSION}`);
              return false;
            }
          } catch (e) {
            console.log('[HEYS] ⚠️ Version check failed (offline?)');
            return false;
          }
        }
        
        function runVersionGuard() {
          // === Убираем ?_v= параметр из URL (косметика) ===
          if (window.location.search.includes('_v=')) {
            const url = new URL(window.location.href);
            url.searchParams.delete('_v');
            window.history.replaceState({}, '', url.toString());
          }
          
          const storedVersion = localStorage.getItem(VERSION_KEY);
          const hadPendingUpdate = sessionStorage.getItem('heys_pending_update') === 'true';
          const attempt = JSON.parse(localStorage.getItem(UPDATE_ATTEMPT_KEY) || '{}');
          
          // Убираем флаги
          sessionStorage.removeItem('heys_pending_update');
          clearUpdateLock(); // Сбрасываем блокировку после перезагрузки
          
          // Проверяем реальное изменение версии
          const isRealVersionChange = storedVersion && storedVersion !== APP_VERSION;
          
          // === Сброс счётчика попыток при успешном обновлении ===
          if (isRealVersionChange || attempt.targetVersion === APP_VERSION) {
            console.log('[HEYS] ✅ Update target reached, clearing attempts');
            localStorage.removeItem(UPDATE_ATTEMPT_KEY);
          }
          
          if (isRealVersionChange && hadPendingUpdate) {
            console.log(`[HEYS] ✅ Updated: ${storedVersion} → ${APP_VERSION}`);
            
            // НЕ выходим из системы — это плохой UX!
            // Пользователь не должен терять сессию при обновлении.
            
            // Показать баннер об успешном обновлении
            setTimeout(() => {
              const banner = document.createElement('div');
              banner.id = 'heys-update-banner';
              banner.innerHTML = `
                <div style="
                  position: fixed; top: 0; left: 0; right: 0;
                  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                  color: white; padding: 12px 16px;
                  display: flex; align-items: center; justify-content: space-between;
                  z-index: 99999; font-family: system-ui, sans-serif;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                  animation: slideDown 0.3s ease-out;
                ">
                  <style>
                    @keyframes slideDown {
                      from { transform: translateY(-100%); }
                      to { transform: translateY(0); }
                    }
                  </style>
                  <div>
                    <strong>✨ HEYS обновлён!</strong>
                    <span style="font-size: 12px; opacity: 0.9; margin-left: 8px;">v${APP_VERSION}</span>
                  </div>
                  <button onclick="this.parentElement.style.transform='translateY(-100%)'; setTimeout(() => document.getElementById('heys-update-banner').remove(), 300)" 
                    style="background: rgba(255,255,255,0.2); border: none; color: white; 
                    padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 14px;">
                    ✕
                  </button>
                </div>
              `;
              document.body.prepend(banner);
              
              // Автоскрытие через 5 секунд
              setTimeout(() => {
                const b = document.getElementById('heys-update-banner');
                if (b) {
                  b.querySelector('div').style.transform = 'translateY(-100%)';
                  b.querySelector('div').style.transition = 'transform 0.3s';
                  setTimeout(() => b.remove(), 300);
                }
              }, 5000);
            }, 500);
          }
          
          localStorage.setItem(VERSION_KEY, APP_VERSION);
          
          // Регистрируем SW (только на production)
          registerServiceWorker();
          
          // Проверяем версию с сервера (только на production)
          // На localhost это не нужно — мешает разработке
          if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            setTimeout(checkServerVersion, 3000);
          }
        }
        
        // Экспорт для ручного вызова
        HEYS.checkForUpdates = () => {
          showUpdateModal('checking');
          setTimeout(async () => {
            const hasUpdate = await checkServerVersion(false);
            if (!hasUpdate) {
              updateModalStage('ready');
              document.getElementById('heys-update-title').textContent = 'Всё актуально!';
              document.getElementById('heys-update-subtitle').textContent = 'У вас последняя версия';
              document.getElementById('heys-update-icon').textContent = '✅';
              setTimeout(hideUpdateModal, 1500);
            }
          }, 800);
        };
        
        // === Mobile Debug Panel ===
        // Тройной тап на заголовок покажет дебаг-панель (для отладки на телефоне)
        function bootstrapGlobals() {
          runVersionGuard();
          HEYS.debugPanel = createDebugPanel();
          HEYS.badge = createBadgeApi();
        }
        bootstrapGlobals();
        
        function createDebugPanel() {
          return {
            _tapCount: 0,
            _tapTimer: null,
            _visible: false,
            _el: null,
            
            handleTap() {
              this._tapCount++;
              clearTimeout(this._tapTimer);
              
              if (this._tapCount >= 3) {
                this._tapCount = 0;
                this.toggle();
              } else {
                this._tapTimer = setTimeout(() => { this._tapCount = 0; }, 500);
              }
            },
            
            toggle() {
              this._visible ? this.hide() : this.show();
            },
            
            show() {
              if (this._el) this.hide();
              
              const syncLog = HEYS?.cloud?.getSyncLog?.() || [];
              const pending = HEYS?.cloud?.getPendingCount?.() || 0;
              const status = HEYS?.cloud?.getStatus?.() || 'unknown';
              const cloudClientId = HEYS?.cloud?.getClientId?.() || '';
              
              // Получаем clientId из разных источников
              const lsClientId = localStorage.getItem('heys_client_current') || '';
              const clientId = cloudClientId || lsClientId || 'none';
              
              // Данные текущего дня — ищем с clientId prefix
              const today = new Date().toISOString().slice(0, 10);
              let dayData = null;
              let dayKey = '';
              
              // Пробуем разные варианты ключей
              const possibleKeys = [
                `heys_${clientId}_dayv2_${today}`,
                `heys_dayv2_${today}`,
              ];
              
              // Также ищем по паттерну в localStorage
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.includes(`dayv2_${today}`) && !k.includes('backup')) {
                  possibleKeys.unshift(k);
                  break;
                }
              }
              
              for (const key of possibleKeys) {
                try {
                  const raw = localStorage.getItem(key);
                  if (raw) {
                    dayData = JSON.parse(raw);
                    dayKey = key;
                    break;
                  }
                } catch(e) {}
              }
              
              // Считаем все ключи в localStorage
              const allKeys = [];
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('heys_')) allKeys.push(k);
              }
              
              const html = `
              <div id="heys-debug-panel" style="
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.95); color: #0f0; font-family: monospace;
                font-size: 11px; padding: 16px; overflow: auto; z-index: 99999;
              ">
                <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
                  <b style="color:#fff;font-size:14px;">🔧 HEYS Debug Panel <span style="color:#888;font-size:11px;">v${window.HEYS?.version || '?'}</span></b>
                  <button onclick="HEYS.debugPanel.hide()" style="background:#f00;color:#fff;border:none;padding:4px 12px;border-radius:4px;">✕ Close</button>
                </div>
                
                <div style="background:#111;padding:8px;border-radius:4px;margin-bottom:8px;">
                  <b style="color:#0ff;">📡 Sync Status</b><br>
                  Status: <span style="color:${status === 'online' ? '#0f0' : '#f00'}">${status}</span><br>
                  Pending: ${pending}<br>
                  Cloud Client: ${cloudClientId ? cloudClientId.slice(0, 8) + '...' : '<span style="color:#f00">NOT SET</span>'}<br>
                  LS Client: ${lsClientId ? lsClientId.slice(0, 8) + '...' : '<span style="color:#f00">NOT SET</span>'}<br>
                  Total LS keys: ${allKeys.length}
                </div>
                
                <div style="background:#111;padding:8px;border-radius:4px;margin-bottom:8px;">
                  <b style="color:#0ff;">📅 Today (${today})</b><br>
                  Key: <span style="color:#888;font-size:9px;">${dayKey || 'NOT FOUND'}</span><br>
                  ${dayData ? `
                    Weight: ${dayData.weightMorning || '—'}<br>
                    Meals: ${dayData.meals?.length || 0}<br>
                    Steps: ${dayData.steps || 0}<br>
                    Water: ${dayData.waterMl || 0}ml<br>
                    Updated: ${dayData.updatedAt ? new Date(dayData.updatedAt).toLocaleTimeString() : '—'}
                  ` : '<span style="color:#f00">No data in localStorage!</span>'}
                </div>
                
                <div style="background:#111;padding:8px;border-radius:4px;margin-bottom:8px;">
                  <b style="color:#0ff;">📜 Sync Log (last 10)</b><br>
                  ${syncLog.slice(0, 10).map(e => 
                    `<div style="border-bottom:1px solid #333;padding:2px 0;">
                      ${e.time ? new Date(e.time).toLocaleTimeString() : '?'} | <b>${e.type}</b> | ${JSON.stringify(e.details || {}).slice(0, 50)}
                    </div>`
                  ).join('') || '<span style="color:#888">Empty</span>'}
                </div>
                
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <button onclick="HEYS.cloud?.forceSync?.();HEYS.debugPanel.refresh();" 
                    style="background:#00f;color:#fff;border:none;padding:8px 16px;border-radius:4px;">
                    🔄 Force Sync
                  </button>
                  <button onclick="navigator.clipboard?.writeText(JSON.stringify(HEYS.cloud?.getSyncLog?.(),null,2));alert('Copied!');" 
                    style="background:#555;color:#fff;border:none;padding:8px 16px;border-radius:4px;">
                    📋 Copy Log
                  </button>
                  <button onclick="HEYS.debugPanel.showDayData();" 
                    style="background:#555;color:#fff;border:none;padding:8px 16px;border-radius:4px;">
                    📅 Show Day JSON
                  </button>
                  <button onclick="HEYS.debugPanel.showAllKeys();" 
                    style="background:#555;color:#fff;border:none;padding:8px 16px;border-radius:4px;">
                    🗂️ All LS Keys
                  </button>
                </div>
              </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', html);
            this._el = document.getElementById('heys-debug-panel');
            this._visible = true;
          },
          
          hide() {
            if (this._el) {
              this._el.remove();
              this._el = null;
            }
            this._visible = false;
          },
          
          refresh() {
            if (this._visible) {
              this.hide();
              setTimeout(() => this.show(), 100);
            }
          },
          
          showDayData() {
            const today = new Date().toISOString().slice(0, 10);
            // Ищем день с любым clientId
            let dayData = null;
            let dayKey = '';
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.includes(`dayv2_${today}`) && !k.includes('backup')) {
                dayKey = k;
                try {
                  dayData = localStorage.getItem(k);
                } catch(e) {}
                break;
              }
            }
            alert(dayData ? `Key: ${dayKey}\n\n${JSON.stringify(JSON.parse(dayData), null, 2).slice(0, 1500)}` : `No day data found for ${today}`);
          },
          
          showAllKeys() {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith('heys_')) {
                const size = (localStorage.getItem(k) || '').length;
                keys.push(`${k} (${size}b)`);
              }
            }
            alert(`HEYS keys (${keys.length}):\n\n${keys.slice(0, 30).join('\n')}${keys.length > 30 ? '\n...' : ''}`);
          }
        };
        }
        
        // === Badge API Module ===
        // Показывает streak на иконке приложения (Android Chrome PWA)
        function createBadgeApi() {
          return {
            update(count) {
              if (!('setAppBadge' in navigator)) return;
              
              try {
                if (count > 0) {
                  navigator.setAppBadge(count);
                } else {
                  navigator.clearAppBadge();
                }
              } catch (e) {
                // Silently fail — badge не критичен
              }
            },
            
            updateFromStreak() {
              const streak = HEYS?.Day?.getStreak?.() || 0;
              this.update(streak);
            },
            
            clear() {
              if ('clearAppBadge' in navigator) {
                navigator.clearAppBadge().catch(() => {});
              }
            }
          };
        }
        
        // Wait for React and HEYS components to load
        const INIT_RETRY_DELAY = 100;
        let reactCheckCount = 0;
        const isReactReady = () => Boolean(window.React && window.ReactDOM);
        const isHeysReady = () => Boolean(
          HEYS &&
          HEYS.DayTab &&
          HEYS.Ration &&
          HEYS.UserTab &&
          HEYS.ReportsTab
        );
        const retryInit = () => {
          reactCheckCount++;
          setTimeout(initializeApp, INIT_RETRY_DELAY);
        };
        const waitForDependencies = (onReady) => {
          if (isReactReady() && isHeysReady()) {
            onReady();
            return;
          }
          reactCheckCount++;
          setTimeout(() => waitForDependencies(onReady), INIT_RETRY_DELAY);
        };
        
        function initializeApp() {
          if (!isReactReady()) {
            retryInit();
            return;
          }
          if (!isHeysReady()) {
            retryInit();
            return;
          }

          // Логи инициализации отключены для чистой консоли
          const React = window.React,
            ReactDOM = window.ReactDOM;
          const { useState, useEffect, useRef, useCallback, useMemo } = React;

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 🛡️ КОМПОНЕНТ: ErrorBoundary — Защита от ошибок рендеринга
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          class ErrorBoundary extends React.Component {
            constructor(props) {
              super(props);
              this.state = { hasError: false, error: null };
            }
            static getDerivedStateFromError(error) {
              return { hasError: true, error };
            }
            componentDidCatch(error, info) {
              console.error('[HEYS] ErrorBoundary caught:', error, info);
            }
            render() {
              if (this.state.hasError) {
                return React.createElement('div', { 
                  className: 'error-boundary-fallback',
                  style: {
                    padding: '32px 24px',
                    textAlign: 'center',
                    background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                    borderRadius: '16px',
                    margin: '16px',
                    border: '1px solid #fecaca'
                  }
                },
                  React.createElement('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '😔'),
                  React.createElement('h2', { style: { color: '#dc2626', marginBottom: '8px', fontSize: '18px' } }, 'Что-то пошло не так'),
                  React.createElement('p', { style: { color: '#7f1d1d', marginBottom: '16px', fontSize: '14px' } }, 
                    'Попробуйте обновить страницу'
                  ),
                  React.createElement('button', {
                    onClick: () => window.location.reload(),
                    style: {
                      background: '#dc2626',
                      color: '#fff',
                      border: 'none',
                      padding: '12px 24px',
                      borderRadius: '8px',
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }
                  }, '🔄 Обновить')
                );
              }
              return this.props.children;
            }
          }

          // Экспортируем для использования в других модулях
          window.HEYS.ErrorBoundary = ErrorBoundary;

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 🎨 КОМПОНЕНТ: AppLoader — Красивый скелетон-прелоадер
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          function AppLoader({ message = 'Загрузка...', subtitle = 'Подключение к серверу' }) {
            return React.createElement('div', { className: 'app-loader' },
              // Лого и сообщение
              React.createElement('div', { className: 'app-loader-header' },
                React.createElement('div', { className: 'app-loader-logo' }, '🥗'),
                React.createElement('div', { className: 'app-loader-title' }, message),
                React.createElement('div', { className: 'app-loader-subtitle' }, subtitle)
              ),
              // Скелетон UI
              React.createElement('div', { className: 'app-loader-skeleton' },
                // Header skeleton
                React.createElement('div', { className: 'skeleton-header' },
                  React.createElement('div', { className: 'skeleton-bar skeleton-bar-xp' }),
                  React.createElement('div', { className: 'skeleton-nav' },
                    React.createElement('div', { className: 'skeleton-circle' }),
                    React.createElement('div', { className: 'skeleton-rect skeleton-client' }),
                    React.createElement('div', { className: 'skeleton-circle' })
                  )
                ),
                // Content skeleton - sparkline
                React.createElement('div', { className: 'skeleton-content' },
                  React.createElement('div', { className: 'skeleton-sparkline' },
                    // Имитация точек графика
                    ...Array.from({ length: 14 }, (_, i) => 
                      React.createElement('div', { 
                        key: i,
                        className: 'skeleton-dot',
                        style: { 
                          height: `${20 + Math.random() * 60}%`,
                          animationDelay: `${i * 0.05}s`
                        }
                      })
                    )
                  ),
                  // Cards skeleton
                  React.createElement('div', { className: 'skeleton-cards' },
                    React.createElement('div', { className: 'skeleton-card' }),
                    React.createElement('div', { className: 'skeleton-card' }),
                    React.createElement('div', { className: 'skeleton-card skeleton-card-wide' })
                  )
                ),
                // Bottom nav skeleton
                React.createElement('div', { className: 'skeleton-tabs' },
                  ...Array.from({ length: 5 }, (_, i) => 
                    React.createElement('div', { 
                      key: i,
                      className: `skeleton-tab ${i === 1 ? 'skeleton-tab-active' : ''}`
                    })
                  )
                )
              ),
              // Spinner
              React.createElement('div', { className: 'app-loader-spinner' })
            );
          }

          // Экспортируем AppLoader
          window.HEYS.AppLoader = AppLoader;

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 🎮 КОМПОНЕНТ: GamificationBar — XP, уровень, streak, достижения
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          function GamificationBar() {
            const [stats, setStats] = useState(() => {
              return HEYS.game ? HEYS.game.getStats() : {
                totalXP: 0,
                level: 1,
                title: { icon: '🌱', title: 'Новичок', color: '#94a3b8' },
                progress: { current: 0, required: 100, percent: 0 },
                unlockedCount: 0,
                totalAchievements: 25
              };
            });
            const [streak, setStreak] = useState(() => {
              return HEYS.Day && HEYS.Day.getStreak ? HEYS.Day.getStreak() : 0;
            });
            const [streakJustGrew, setStreakJustGrew] = useState(false);
            const prevStreakRef = useRef(streak);
            const [expanded, setExpanded] = useState(false);
            const [notification, setNotification] = useState(null);
            const [isXPCounting, setIsXPCounting] = useState(false);
            const [isLevelUpFlash, setIsLevelUpFlash] = useState(false);
            const [dailyBonusAvailable, setDailyBonusAvailable] = useState(() => {
              return HEYS.game ? HEYS.game.canClaimDailyBonus() : false;
            });
            const [justUnlockedAch, setJustUnlockedAch] = useState(null);
            const [dailyMultiplier, setDailyMultiplier] = useState(() => {
              return HEYS.game ? HEYS.game.getDailyMultiplier() : { multiplier: 1, actions: 0, label: '' };
            });
            const [weeklyChallenge, setWeeklyChallenge] = useState(() => {
              return HEYS.game ? HEYS.game.getWeeklyChallenge() : { earned: 0, target: 500, percent: 0, completed: false };
            });
            const [xpHistory, setXpHistory] = useState(() => {
              return HEYS.game && HEYS.game.getXPHistory ? HEYS.game.getXPHistory() : [];
            });
            const prevLevelRef = useRef(stats.level);
            
            // Проверяем daily bonus и streak при монтировании + слушаем инициализацию Day
            useEffect(() => {
              const updateStreak = () => {
                if (HEYS.Day && HEYS.Day.getStreak) {
                  setStreak(HEYS.Day.getStreak());
                }
              };
              
              const handleStreakEvent = (e) => {
                if (e.detail && typeof e.detail.streak === 'number') {
                  setStreak(e.detail.streak);
                }
              };
              
              if (HEYS.game) {
                setDailyBonusAvailable(HEYS.game.canClaimDailyBonus());
              }
              
              // Пробуем сразу
              updateStreak();
              
              // Слушаем событие обновления streak из DayTab
              window.addEventListener('heysDayStreakUpdated', handleStreakEvent);
              
              return () => {
                window.removeEventListener('heysDayStreakUpdated', handleStreakEvent);
              };
            }, []);

            // Слушаем обновления XP
            useEffect(() => {
              const handleUpdate = (e) => {
                if (HEYS.game) {
                  const newStats = HEYS.game.getStats();
                  
                  // XP counting animation
                  if (e.detail && e.detail.xpGained > 0) {
                    setIsXPCounting(true);
                    setTimeout(() => setIsXPCounting(false), 400);
                  }
                  
                  // Level up flash
                  if (newStats.level > prevLevelRef.current) {
                    setIsLevelUpFlash(true);
                    setTimeout(() => setIsLevelUpFlash(false), 1000);
                    prevLevelRef.current = newStats.level;
                  }
                  
                  // 🔒 Оптимизация: не обновляем stats если они идентичны (предотвращает мерцание)
                  setStats(prevStats => {
                    if (prevStats && 
                        prevStats.xp === newStats.xp && 
                        prevStats.level === newStats.level &&
                        prevStats.streak === newStats.streak) {
                      return prevStats; // Без ре-рендера
                    }
                    return newStats;
                  });
                }
                // Обновляем streak
                if (HEYS.Day && HEYS.Day.getStreak) {
                  setStreak(prevStreak => {
                    const newStreak = HEYS.Day.getStreak();
                    // Pulse анимация при росте streak
                    if (newStreak > prevStreakRef.current) {
                      setStreakJustGrew(true);
                      setTimeout(() => setStreakJustGrew(false), 700);
                    }
                    prevStreakRef.current = newStreak;
                    return prevStreak === newStreak ? prevStreak : newStreak;
                  });
                }
              };

              const handleNotification = (e) => {
                setNotification(e.detail);
                setTimeout(() => setNotification(null), e.detail.type === 'level_up' ? 4000 : 3000);
                
                // Achievement unlock animation
                if (e.detail.type === 'achievement') {
                  setJustUnlockedAch(e.detail.data.achievement.id);
                  setTimeout(() => setJustUnlockedAch(null), 1000);
                }
              };

              const handleDailyMultiplierUpdate = (e) => {
                setDailyMultiplier(e.detail);
              };

              const handleWeeklyUpdate = () => {
                if (HEYS.game) {
                  // 🔒 Оптимизация: используем functional updates для предотвращения лишних ре-рендеров
                  const newChallenge = HEYS.game.getWeeklyChallenge();
                  setWeeklyChallenge(prev => {
                    if (prev && newChallenge && 
                        prev.type === newChallenge.type && 
                        prev.progress === newChallenge.progress) {
                      return prev;
                    }
                    return newChallenge;
                  });
                  
                  const newMultiplier = HEYS.game.getDailyMultiplier();
                  setDailyMultiplier(prev => prev === newMultiplier ? prev : newMultiplier);
                  
                  if (HEYS.game.getXPHistory) {
                    const newHistory = HEYS.game.getXPHistory();
                    setXpHistory(prev => {
                      // Сравниваем по длине и последнему элементу
                      if (prev && newHistory && 
                          prev.length === newHistory.length &&
                          JSON.stringify(prev[prev.length - 1]) === JSON.stringify(newHistory[newHistory.length - 1])) {
                        return prev;
                      }
                      return newHistory;
                    });
                  }
                }
              };

              window.addEventListener('heysGameUpdate', handleUpdate);
              window.addEventListener('heysGameNotification', handleNotification);
              window.addEventListener('heysProductAdded', handleUpdate);
              window.addEventListener('heysWaterAdded', handleUpdate);
              window.addEventListener('heysDailyMultiplierUpdate', handleDailyMultiplierUpdate);
              window.addEventListener('heysGameUpdate', handleWeeklyUpdate);

              return () => {
                window.removeEventListener('heysGameUpdate', handleUpdate);
                window.removeEventListener('heysGameNotification', handleNotification);
                window.removeEventListener('heysProductAdded', handleUpdate);
                window.removeEventListener('heysWaterAdded', handleUpdate);
                window.removeEventListener('heysDailyMultiplierUpdate', handleDailyMultiplierUpdate);
                window.removeEventListener('heysGameUpdate', handleWeeklyUpdate);
              };
            }, []);

            // Периодическое обновление streak (каждые 30 сек)
            useEffect(() => {
              const interval = setInterval(() => {
                if (HEYS.Day && HEYS.Day.getStreak) {
                  setStreak(HEYS.Day.getStreak());
                }
              }, 30000);
              return () => clearInterval(interval);
            }, []);

            const toggleExpanded = () => setExpanded(!expanded);

            const { title, progress } = stats;
            const progressPercent = Math.max(5, progress.percent); // Minimum 5% для визуального feedback

            // Эффекты по уровню прогресса
            const isShimmering = progress.percent >= 80; // Блик при >80%
            const isPulsing = progress.percent >= 90;    // Пульсация при >90%
            const isGlowing = progress.percent >= 90;

            // Streak класс по уровню
            const getStreakClass = (s) => {
              if (s >= 30) return 'streak-legendary';  // 30+ дней — радужный
              if (s >= 14) return 'streak-epic';       // 14+ дней — золотой
              if (s >= 7) return 'streak-high';        // 7+ дней — яркий
              if (s >= 3) return 'streak-mid';         // 3+ дней — мерцающий
              return 'streak-low';                     // 1-2 дня — статичный
            };

            // Ripple эффект на тапе по progress bar
            const handleProgressClick = (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ripple = document.createElement('span');
              ripple.className = 'ripple';
              ripple.style.left = `${e.clientX - rect.left}px`;
              ripple.style.top = `${e.clientY - rect.top}px`;
              e.currentTarget.appendChild(ripple);
              setTimeout(() => ripple.remove(), 600);
            };

            // Динамический золотой градиент — чем ближе к 100%, тем ярче золото
            const getProgressGradient = (percent) => {
              // От приглушённого (#b8860b / darkgoldenrod) до яркого (#ffd700 / gold)
              const t = percent / 100; // 0..1
              // Интерполяция RGB: darkgoldenrod(184,134,11) → gold(255,215,0)
              const r = Math.round(184 + (255 - 184) * t);
              const g = Math.round(134 + (215 - 134) * t);
              const b = Math.round(11 + (0 - 11) * t);
              const brightColor = `rgb(${r}, ${g}, ${b})`;
              // Начальный цвет ещё темнее
              const startR = Math.round(140 + (184 - 140) * t);
              const startG = Math.round(100 + (134 - 100) * t);
              const startB = Math.round(20 + (11 - 20) * t);
              const startColor = `rgb(${startR}, ${startG}, ${startB})`;
              return `linear-gradient(90deg, ${startColor} 0%, ${brightColor} 100%)`;
            };

            return React.createElement('div', { 
              className: `game-bar-container ${isLevelUpFlash ? 'level-up-flash' : ''}`
            },
              // Main bar — одна строка
              React.createElement('div', { 
                className: 'game-bar',
                onClick: toggleExpanded
              },
                // Level + Rank Badge (горизонтально, компактно)
                React.createElement('div', { 
                  className: 'game-level-group',
                  style: { color: title.color }
                }, 
                  React.createElement('span', { className: 'game-level-text' }, `${title.icon} ${stats.level}`),
                  HEYS.game && React.createElement('span', {
                    className: 'game-rank-badge',
                    style: { 
                      background: `linear-gradient(135deg, ${HEYS.game.getRankBadge(stats.level).color}66 0%, ${HEYS.game.getRankBadge(stats.level).color} 100%)`,
                      color: stats.level >= 10 ? '#000' : '#fff'
                    }
                  }, HEYS.game.getRankBadge(stats.level).rank),
                  // Level Roadmap Tooltip — все звания
                  HEYS.game && HEYS.game.getAllTitles && React.createElement('div', { 
                    className: 'game-level-roadmap' 
                  },
                    React.createElement('div', { className: 'roadmap-title' }, '🎮 Путь развития'),
                    HEYS.game.getAllTitles().map((t, i) => {
                      const isCurrent = stats.level >= t.min && stats.level <= t.max;
                      const isAchieved = stats.level > t.max;
                      const isFuture = stats.level < t.min;
                      return React.createElement('div', {
                        key: i,
                        className: `roadmap-item ${isCurrent ? 'current' : ''} ${isAchieved ? 'achieved' : ''} ${isFuture ? 'future' : ''}`
                      },
                        React.createElement('span', { className: 'roadmap-icon' }, t.icon),
                        React.createElement('span', { className: 'roadmap-name' }, t.title),
                        React.createElement('span', { 
                          className: 'roadmap-levels',
                          style: { color: t.color }
                        }, `ур.${t.min}-${t.max}`),
                        isCurrent && React.createElement('span', { className: 'roadmap-you' }, '← ты'),
                        isAchieved && React.createElement('span', { className: 'roadmap-check' }, '✓')
                      );
                    })
                  )
                ),
                
                // Progress bar
                React.createElement('div', { 
                  className: `game-progress ${isGlowing ? 'glowing' : ''} ${isShimmering ? 'shimmer' : ''} ${isPulsing ? 'pulse' : ''} ${progress.percent >= 85 && progress.percent < 100 ? 'near-goal' : ''}`,
                  onClick: handleProgressClick
                },
                  React.createElement('div', { 
                    className: 'game-progress-fill',
                    style: { 
                      width: `${progressPercent}%`,
                      background: getProgressGradient(progress.percent)
                    }
                  }),
                  // Tooltip
                  React.createElement('span', { className: 'game-progress-tooltip' },
                    `Ещё ${progress.required - progress.current} XP до ур.${stats.level + 1}`
                  )
                ),
                
                // Daily Multiplier
                dailyMultiplier.actions > 0 && React.createElement('span', {
                  className: `game-daily-mult ${dailyMultiplier.multiplier >= 2 ? 'high' : dailyMultiplier.multiplier > 1 ? 'active' : ''}`,
                  title: dailyMultiplier.nextThreshold 
                    ? `${dailyMultiplier.actions} действий сегодня. Ещё ${dailyMultiplier.nextThreshold - dailyMultiplier.actions} до ${dailyMultiplier.nextMultiplier}x!`
                    : `${dailyMultiplier.actions} действий сегодня. Максимальный бонус!`
                },
                  dailyMultiplier.multiplier > 1 
                    ? React.createElement('span', { className: 'game-daily-mult-value' }, `${dailyMultiplier.multiplier}x`)
                    : `⚡${dailyMultiplier.actions}`
                ),
                
                // Streak
                streak > 0 && React.createElement('span', { 
                  className: `game-streak ${getStreakClass(streak)}${streakJustGrew ? ' just-grew' : ''}`,
                  title: `${streak} дней подряд в норме!`
                }, `🔥${streak}`),
                
                // Personal Best
                HEYS.game && HEYS.game.isNewStreakRecord() && streak > 0 && React.createElement('span', {
                  className: 'game-personal-best',
                  title: 'Новый рекорд streak!'
                }, '🏆'),
                
                // Daily Bonus
                dailyBonusAvailable && React.createElement('button', {
                  className: 'game-daily-bonus',
                  onClick: (e) => {
                    e.stopPropagation();
                    if (HEYS.game && HEYS.game.claimDailyBonus()) {
                      setDailyBonusAvailable(false);
                    }
                  },
                  title: 'Забрать ежедневный бонус!'
                }, '🎁'),
                
                // XP counter
                React.createElement('span', { 
                  className: `game-xp ${isXPCounting ? 'counting' : ''}`
                }, `${progress.current}/${progress.required}`),
                
                // Expand button
                React.createElement('button', { 
                  className: `game-expand-btn ${expanded ? 'expanded' : ''}`,
                  title: expanded ? 'Свернуть' : 'Подробнее'
                }, expanded ? '▲' : '▼'),
                
                // Theme toggle button
                React.createElement('button', {
                  className: 'hdr-theme-btn',
                  onClick: (e) => {
                    e.stopPropagation();
                    if (HEYS.cycleTheme) {
                      HEYS.cycleTheme();
                      return;
                    }
                    const html = document.documentElement;
                    const current = html.getAttribute('data-theme') || 'light';
                    const next = current === 'dark' ? 'light' : 'dark';
                    html.setAttribute('data-theme', next);
                    localStorage.setItem('heys_theme', next);
                  },
                  title: 'Сменить тему'
                }, document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙')
              ),

              // Notification (level up / achievement / streak_shield)
              notification && React.createElement('div', {
                className: `game-notification ${notification.type}${notification.type === 'achievement' && notification.data.achievement?.rarity ? ' rarity-' + notification.data.achievement.rarity : ''}`,
                onClick: () => setNotification(null),
                onTouchStart: (e) => { e.currentTarget._touchStartY = e.touches[0].clientY; },
                onTouchMove: (e) => {
                  const deltaY = e.currentTarget._touchStartY - e.touches[0].clientY;
                  if (deltaY > 50) { setNotification(null); } // swipe up to dismiss
                }
              },
                notification.type === 'level_up' 
                  ? React.createElement(React.Fragment, null,
                      React.createElement('span', { className: 'notif-icon' }, notification.data.icon),
                      React.createElement('div', { className: 'notif-content' },
                        React.createElement('div', { className: 'notif-title' }, `🎉 Уровень ${notification.data.newLevel}!`),
                        React.createElement('div', { className: 'notif-subtitle' }, `Ты теперь ${notification.data.title}`)
                      )
                    )
                  : notification.type === 'achievement'
                    ? React.createElement(React.Fragment, null,
                        React.createElement('span', { className: 'notif-icon' }, notification.data.achievement.icon),
                        React.createElement('div', { className: 'notif-content' },
                          React.createElement('div', { className: 'notif-title' }, notification.data.achievement.name),
                          React.createElement('div', { className: 'notif-subtitle' }, `+${notification.data.achievement.xp} XP`)
                        )
                      )
                    : notification.type === 'daily_bonus'
                      ? React.createElement(React.Fragment, null,
                          React.createElement('span', { className: 'notif-icon' }, '🎁'),
                          React.createElement('div', { className: 'notif-content' },
                            React.createElement('div', { className: 'notif-title' }, 'Ежедневный бонус!'),
                            React.createElement('div', { className: 'notif-subtitle' }, 
                              notification.data.multiplier > 1 
                                ? `+${notification.data.xp} XP (${notification.data.multiplier}x бонус!)` 
                                : `+${notification.data.xp} XP`
                            )
                          )
                        )
                      : notification.type === 'weekly_complete'
                        ? React.createElement(React.Fragment, null,
                            React.createElement('span', { className: 'notif-icon' }, '🎯'),
                            React.createElement('div', { className: 'notif-content' },
                              React.createElement('div', { className: 'notif-title' }, '🎉 Недельный челлендж!'),
                              React.createElement('div', { className: 'notif-subtitle' }, `+100 XP бонус!`)
                            )
                          )
                        : notification.type === 'streak_shield'
                          ? React.createElement(React.Fragment, null,
                              React.createElement('span', { className: 'notif-icon' }, '🛡️'),
                              React.createElement('div', { className: 'notif-content' },
                                React.createElement('div', { className: 'notif-title' }, 'Streak спасён!'),
                                React.createElement('div', { className: 'notif-subtitle' }, notification.data.message || 'Щит защитил твою серию')
                              )
                            )
                          : null
              ),

              // Expanded panel (backdrop + content)
              expanded && React.createElement(React.Fragment, null,
                // Backdrop
                React.createElement('div', { 
                  className: 'game-panel-backdrop',
                  onClick: () => setExpanded(false)
                }),
                // Panel content
                React.createElement('div', { className: 'game-panel-expanded' },
                  // Weekly Challenge Section (красивая карточка)
                  React.createElement('div', { 
                    className: `game-weekly-card ${weeklyChallenge.completed ? 'completed' : ''}`
                  },
                    React.createElement('div', { className: 'weekly-header' },
                      React.createElement('span', { className: 'weekly-icon' }, weeklyChallenge.completed ? '🏆' : '🎯'),
                      React.createElement('div', { className: 'weekly-title-group' },
                        React.createElement('span', { className: 'weekly-title' }, 'Недельный челлендж'),
                        React.createElement('span', { className: 'weekly-subtitle' }, 
                          weeklyChallenge.completed 
                            ? '✨ Выполнено! +100 XP бонус' 
                            : `Заработай ${weeklyChallenge.target} XP за неделю`
                        )
                      )
                    ),
                    React.createElement('div', { className: 'weekly-progress-container' },
                      React.createElement('div', { className: 'weekly-progress-bar' },
                        React.createElement('div', { 
                          className: 'weekly-progress-fill',
                          style: { width: `${weeklyChallenge.percent}%` }
                        }),
                        React.createElement('div', { className: 'weekly-progress-glow' })
                      ),
                      React.createElement('div', { className: 'weekly-progress-labels' },
                        React.createElement('span', { className: 'weekly-earned' }, `${weeklyChallenge.earned} XP`),
                        React.createElement('span', { className: 'weekly-target' }, `${weeklyChallenge.target} XP`)
                      )
                    ),
                    React.createElement('div', { className: 'weekly-percent' }, 
                      weeklyChallenge.completed 
                        ? '100%' 
                        : `${weeklyChallenge.percent}%`
                    )
                  ),
                  
                  // XP History — мини-график за 7 дней
                  xpHistory?.length > 0 && React.createElement('div', { className: 'xp-history-section' },
                    React.createElement('div', { className: 'xp-history-title' }, '📊 XP за неделю'),
                    React.createElement('div', { className: 'xp-history-chart' },
                      (() => {
                        const maxXP = Math.max(...xpHistory.map(d => d.xp), 1);
                        return xpHistory.map((day, i) => 
                          React.createElement('div', { 
                            key: i, 
                            className: `xp-history-bar ${i === 6 ? 'today' : ''}`,
                            title: `${day.date}: ${day.xp} XP`
                          },
                            React.createElement('div', { 
                              className: 'xp-bar-fill',
                              style: { height: `${(day.xp / maxXP) * 100}%` }
                            }),
                            React.createElement('span', { className: 'xp-bar-day' }, day.day),
                            day.xp > 0 && React.createElement('span', { className: 'xp-bar-value' }, day.xp)
                          )
                        );
                      })()
                    )
                  ),
                  
                  // Stats section
                  React.createElement('div', { className: 'game-stats-section' },
                    React.createElement('div', { className: 'game-stat' },
                      React.createElement('span', { className: 'stat-value' }, stats.totalXP),
                      React.createElement('span', { className: 'stat-label' }, 'Всего XP')
                    ),
                    React.createElement('div', { className: 'game-stat' },
                      React.createElement('span', { className: 'stat-value' }, `${stats.level}`),
                      React.createElement('span', { className: 'stat-label' }, 'Уровень')
                    ),
                    React.createElement('div', { className: 'game-stat' },
                      React.createElement('span', { className: 'stat-value' }, streak || 0),
                      React.createElement('span', { className: 'stat-label' }, 'Streak')
                    ),
                    React.createElement('div', { className: 'game-stat' },
                      React.createElement('span', { className: 'stat-value' }, `${stats.unlockedCount}/${stats.totalAchievements}`),
                      React.createElement('span', { className: 'stat-label' }, 'Достижения')
                    )
                  ),

                  // Title & next level
                  React.createElement('div', { className: 'game-title-section' },
                    React.createElement('div', { 
                      className: 'current-title',
                      style: { color: title.color }
                    }, `${title.icon} ${title.title}`),
                    React.createElement('div', { className: 'next-level-hint' },
                      `До уровня ${stats.level + 1}: ${progress.required - progress.current} XP`
                    )
                  ),

                  // Achievements grid
                  React.createElement('div', { className: 'game-achievements-section' },
                    React.createElement('h4', null, '🏆 Достижения'),
                    HEYS.game && HEYS.game.getAchievementCategories().map(cat =>
                      React.createElement('div', { key: cat.id, className: 'achievement-category' },
                        React.createElement('div', { className: 'category-name' }, cat.name),
                        React.createElement('div', { className: 'achievements-row' },
                          cat.achievements.map(achId => {
                            const ach = HEYS.game.ACHIEVEMENTS[achId];
                            const unlocked = HEYS.game.isAchievementUnlocked(achId);
                            const isJustUnlocked = justUnlockedAch === achId;
                            const rarityClass = unlocked ? `rarity-${ach.rarity}` : '';
                            return React.createElement('div', {
                              key: achId,
                              className: `achievement-badge ${unlocked ? 'unlocked' : 'locked'} ${rarityClass} ${isJustUnlocked ? 'just-unlocked' : ''}`,
                              title: `${ach.name}: ${ach.desc}`,
                              style: unlocked ? { borderColor: HEYS.game.RARITY_COLORS[ach.rarity] } : {}
                            },
                              React.createElement('span', { className: 'badge-icon' }, unlocked ? ach.icon : '🔒'),
                              React.createElement('span', { className: 'badge-xp' }, `+${ach.xp}`)
                            );
                          })
                        )
                      )
                    )
                  )
                )
              )
            );
          }

          // Экспортируем GamificationBar
          window.HEYS.GamificationBar = GamificationBar;

          // init cloud (safe if no cloud module)
          // 🌐 Используем proxy через Vercel для обхода блокировок Supabase в РФ
          // В production: /api/supabase → ukqolcziqcuplqfgrmsh.supabase.co (через Vercel Edge Function)
          // 🔄 Выбор URL для Supabase
          // На production: всегда через proxy (обход блокировки РФ)
          // На localhost: пробуем direct, но если заблокировано — proxy через production
          if (window.HEYS.cloud && typeof HEYS.cloud.init === 'function') {
            const isProduction = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');
            
            // На localhost: direct к Supabase (если работает), fallback на production proxy
            // На production: через наш proxy
            const supabaseUrl = isProduction 
              ? `${window.location.origin}/api/supabase`  // Production — через proxy
              : 'https://ukqolcziqcuplqfgrmsh.supabase.co';  // Dev — пробуем direct
            
            // Для localhost: сохраняем production proxy URL для fallback
            const localhostProxyUrl = 'https://heys-v2-web.vercel.app/api/supabase';
            
            // 🔥 Warm-up ping — прогреваем Vercel serverless до первого реального запроса
            if (isProduction) {
              fetch(`${window.location.origin}/api/health`, { method: 'GET' })
                .then(() => console.log('[HEYS] 🔥 Proxy warm-up OK'))
                .catch(() => {}); // Игнорируем ошибки warm-up
            }
            
            HEYS.cloud.init({
              url: supabaseUrl,
              anonKey:
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrcW9sY3ppcWN1cGxxZmdybXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNTE1NDUsImV4cCI6MjA3MDgyNzU0NX0.Nzd8--PyGMJvIHqFoCQKNUOwpxnrAZuslQHtAjcE1Ds',
              // Для localhost: передаём production proxy как fallback
              localhostProxyUrl: !isProduction ? localhostProxyUrl : undefined
            });
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 📅 КОМПОНЕНТ: DayTabWithCloudSync (строки 142-181)
           * ───────────────────────────────────────────────────────────────────────────────
           * Обёртка для heys_day_v12.js с синхронизацией из облака
           * Props: { clientId, products, selectedDate, setSelectedDate }
           * Dependencies: window.HEYS.cloud.bootstrapClientSync, window.HEYS.DayTab
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          
          // Skeleton для DayTab — показываем пока грузится
          function DayTabSkeleton() {
            return React.createElement('div', { className: 'day-tab-skeleton', style: { padding: 16 } },
              // Sparkline skeleton
              React.createElement('div', { 
                className: 'skeleton-sparkline',
                style: { height: 80, marginBottom: 16, borderRadius: 12 }
              }),
              // Cards skeleton
              React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
                React.createElement('div', { className: 'skeleton-card', style: { flex: 1, height: 60 } }),
                React.createElement('div', { className: 'skeleton-card', style: { flex: 1, height: 60 } })
              ),
              // Progress skeleton  
              React.createElement('div', { className: 'skeleton-progress', style: { height: 48, marginBottom: 16 } }),
              // Macros skeleton
              React.createElement('div', { className: 'skeleton-macros', style: { marginBottom: 16 } },
                React.createElement('div', { className: 'skeleton-ring' }),
                React.createElement('div', { className: 'skeleton-ring' }),
                React.createElement('div', { className: 'skeleton-ring' })
              )
            );
          }
          
          function DayTabWithCloudSync(props) {
            const { clientId, products, selectedDate, setSelectedDate, subTab } = props;
            const [loading, setLoading] = React.useState(true);
            
            React.useEffect(() => {
              let cancelled = false;
              const cloud = window.HEYS && window.HEYS.cloud;
              const finish = () => {
                if (!cancelled) setLoading(false);
              };
              if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
                const need =
                  typeof cloud.shouldSyncClient === 'function'
                    ? cloud.shouldSyncClient(clientId, 4000)
                    : true;
                if (need) {
                  setLoading(true);
                  cloud.bootstrapClientSync(clientId)
                    .then(finish)
                    .catch((err) => {
                      console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                      finish();
                    });
                } else finish();
              } else {
                finish();
              }
              return () => {
                cancelled = true;
              };
            }, [clientId]);
            
            // 🔐 Не рендерим DayTab пока нет клиента — иначе advice показываются до входа!
            if (!clientId) {
              return React.createElement(DayTabSkeleton);
            }
            
            if (loading || !window.HEYS || !window.HEYS.DayTab) {
              return React.createElement(DayTabSkeleton);
            }
            return React.createElement(window.HEYS.DayTab, { products, selectedDate, setSelectedDate, subTab });
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 🍽️ КОМПОНЕНТ: RationTabWithCloudSync (строки 185-227)
           * ───────────────────────────────────────────────────────────────────────────────
           * Обёртка для heys_core_v12.js (Ration) с синхронизацией продуктов
           * Props: { clientId, setProducts, products }
           * Dependencies: window.HEYS.cloud.bootstrapClientSync, window.HEYS.Ration
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          
          // Skeleton для Ration/Products
          function RationSkeleton() {
            return React.createElement('div', { style: { padding: 16 } },
              React.createElement('div', { className: 'skeleton-header', style: { width: 150, marginBottom: 16 } }),
              ...Array.from({ length: 5 }, (_, i) => 
                React.createElement('div', { 
                  key: i,
                  className: 'skeleton-block',
                  style: { height: 56, marginBottom: 8 }
                })
              )
            );
          }
          
          // Кэш синхронизированных клиентов (в рамках сессии) — обычная переменная модуля
          const syncedClientsCache = new Set();
          
          function RationTabWithCloudSync(props) {
            const { clientId, setProducts, products } = props;
            // Проверяем был ли sync для ЭТОГО клиента
            const alreadySynced = clientId && syncedClientsCache.has(clientId);
            const [loading, setLoading] = React.useState(!alreadySynced);
            
            // 🔐 Не рендерим Ration пока нет клиента
            if (!clientId) {
              return React.createElement(RationSkeleton);
            }
            
            // 📦 Слушатель событий для гарантированного обновления продуктов
            // 🔒 Флаг для предотвращения обновления при первой синхронизации
            const initialProductsSyncDoneRef = React.useRef(false);
            
            React.useEffect(() => {
              const handleProductsUpdated = (e) => {
                // 🔒 Игнорируем heysSyncCompleted при ПЕРВОЙ загрузке — products уже загружены
                // Это предотвращает лишний ре-рендер и мерцание UI
                if (e.type === 'heysSyncCompleted') {
                  if (!initialProductsSyncDoneRef.current) {
                    initialProductsSyncDoneRef.current = true;
                    // console.log('[HEYS] ⏭️ Products update skipped: initial sync');
                    return;
                  }
                }
                
                const latest = window.HEYS.utils?.lsGet?.('heys_products', []) || 
                              window.HEYS.store?.get?.('heys_products', []) || [];
                if (Array.isArray(latest) && latest.length > 0) {
                  // 🛡️ ЗАЩИТА: не уменьшаем количество продуктов в UI
                  // Это предотвращает "мерцание" когда приходят разные ключи из облака
                  setProducts(prev => {
                    if (Array.isArray(prev) && prev.length > latest.length) {
                      console.log(`[HEYS] ⚠️ Products update blocked: ${prev.length} > ${latest.length}`);
                      return prev;
                    }
                    // 🔒 Оптимизация: не обновляем если количество одинаковое (скорее всего те же данные)
                    if (Array.isArray(prev) && prev.length === latest.length) {
                      return prev;
                    }
                    return latest;
                  });
                  
                  // 🔄 Пересчитываем orphan-продукты — теперь база загружена
                  if (window.HEYS?.orphanProducts?.recalculate) {
                    window.HEYS.orphanProducts.recalculate();
                  }
                }
              };
              
              window.addEventListener('heysProductsUpdated', handleProductsUpdated);
              window.addEventListener('heysSyncCompleted', handleProductsUpdated);
              
              return () => {
                window.removeEventListener('heysProductsUpdated', handleProductsUpdated);
                window.removeEventListener('heysSyncCompleted', handleProductsUpdated);
              };
            }, [setProducts]);
            
            React.useEffect(() => {
              let cancelled = false;
              
              // 🛡️ Хелпер: безопасное обновление продуктов (не уменьшаем количество)
              const safeSetProducts = (newProducts) => {
                if (!Array.isArray(newProducts)) return;
                setProducts(prev => {
                  if (Array.isArray(prev) && prev.length > newProducts.length) {
                    console.log(`[HEYS] ⚠️ RationTab BLOCKED: ${prev.length} > ${newProducts.length}`);
                    return prev;
                  }
                  // 🔒 Не ре-рендерим если количество одинаковое
                  if (Array.isArray(prev) && prev.length === newProducts.length) {
                    return prev;
                  }
                  return newProducts;
                });
              };
              
              // Если sync для этого клиента уже был — сразу загружаем продукты
              if (syncedClientsCache.has(clientId)) {
                const loadedProducts = window.HEYS.utils.lsGet('heys_products', []);
                safeSetProducts(Array.isArray(loadedProducts) ? loadedProducts : []);
                setLoading(false);
                return;
              }
              
              if (
                clientId &&
                window.HEYS.cloud &&
                typeof window.HEYS.cloud.bootstrapClientSync === 'function'
              ) {
                setLoading(true);
                window.HEYS.cloud.bootstrapClientSync(clientId)
                  .then(() => {
                    if (!cancelled) {
                      syncedClientsCache.add(clientId);
                      const loadedProducts = Array.isArray(
                        window.HEYS.utils.lsGet('heys_products', []),
                      )
                        ? window.HEYS.utils.lsGet('heys_products', [])
                        : [];
                      safeSetProducts(loadedProducts);
                      setLoading(false);
                    }
                  })
                  .catch((err) => {
                    console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                    if (!cancelled) {
                      const loadedProducts = window.HEYS.utils.lsGet('heys_products', []);
                      safeSetProducts(Array.isArray(loadedProducts) ? loadedProducts : []);
                      setLoading(false);
                    }
                  });
              } else {
                // Нет cloud — загружаем локально
                const loadedProducts = window.HEYS.utils.lsGet('heys_products', []);
                safeSetProducts(Array.isArray(loadedProducts) ? loadedProducts : []);
                setLoading(false);
              }
              return () => {
                cancelled = true;
              };
            }, [clientId]);
            if (loading || !window.HEYS || !window.HEYS.Ration) {
              return React.createElement(RationSkeleton);
            }
            return React.createElement(window.HEYS.Ration, { products, setProducts });
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 👤 КОМПОНЕНТ: UserTabWithCloudSync (строки 230-266)
           * ───────────────────────────────────────────────────────────────────────────────
           * Обёртка для heys_user_v12.js с синхронизацией профиля и зон
           * Props: { clientId }
           * Dependencies: window.HEYS.cloud.bootstrapClientSync, window.HEYS.UserTab
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          
          // Skeleton для UserTab
          function UserSkeleton() {
            return React.createElement('div', { style: { padding: 16 } },
              React.createElement('div', { className: 'skeleton-header', style: { width: 120, marginBottom: 16 } }),
              React.createElement('div', { className: 'skeleton-block', style: { height: 100, marginBottom: 12 } }),
              React.createElement('div', { className: 'skeleton-block', style: { height: 80, marginBottom: 12 } }),
              React.createElement('div', { className: 'skeleton-block', style: { height: 80 } })
            );
          }
          
          function UserTabWithCloudSync(props) {
            const { clientId } = props;
            const [loading, setLoading] = React.useState(true);
            
            // 🔐 Не рендерим UserTab пока нет клиента
            if (!clientId) {
              return React.createElement(UserSkeleton);
            }
            
            React.useEffect(() => {
              let cancelled = false;
              if (
                clientId &&
                window.HEYS.cloud &&
                typeof window.HEYS.cloud.bootstrapClientSync === 'function'
              ) {
                setLoading(true);
                window.HEYS.cloud.bootstrapClientSync(clientId)
                  .then(() => {
                    if (!cancelled) setLoading(false);
                  })
                  .catch((err) => {
                    console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                    if (!cancelled) setLoading(false);
                  });
              } else {
                setLoading(false);
              }
              return () => {
                cancelled = true;
              };
            }, [clientId]);
            if (loading || !window.HEYS || !window.HEYS.UserTab) {
              return React.createElement(UserSkeleton);
            }
            return React.createElement(window.HEYS.UserTab, {});
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 📊 КОМПОНЕНТ: AnalyticsTab (строки 269-450)
           * ───────────────────────────────────────────────────────────────────────────────
           * Вкладка аналитики производительности (heys_simple_analytics.js)
           * Props: none
           * Dependencies: window.HEYS.analytics, window.HEYS.analyticsUI
           * Features: Auto-refresh каждые 30 сек, экспорт данных, очистка истории
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          function AnalyticsTab() {
            const [stats, setStats] = useState(null);
            const [autoRefresh, setAutoRefresh] = useState(true);

            const loadStats = () => {
              if (window.HEYS && window.HEYS.analytics) {
                const data = window.HEYS.analytics.getStats();
                setStats(data);
              }
            };

            useEffect(() => {
              loadStats();
              if (autoRefresh) {
                const interval = setInterval(loadStats, 5000); // Обновление каждые 5 сек
                return () => clearInterval(interval);
              }
            }, [autoRefresh]);

            if (!stats) {
              return React.createElement('div', { style: { padding: 16 } },
                React.createElement('div', { className: 'skeleton-header', style: { width: 180, marginBottom: 16 } }),
                React.createElement('div', { className: 'skeleton-block', style: { height: 60, marginBottom: 12 } }),
                React.createElement('div', { className: 'skeleton-block', style: { height: 120 } })
              );
            }

            return React.createElement(
              'div',
              { style: { padding: 24, maxWidth: 900 } },
              // Заголовок
              React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 24,
                  },
                },
                React.createElement('h2', { style: { margin: 0 } }, '📊 Аналитика сессии'),
                React.createElement(
                  'div',
                  { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                  React.createElement(
                    'label',
                    null,
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: autoRefresh,
                      onChange: (e) => setAutoRefresh(e.target.checked),
                      style: { marginRight: 4 },
                    }),
                    'Автообновление',
                  ),
                  React.createElement(
                    'button',
                    { className: 'btn', onClick: loadStats },
                    '🔄 Обновить',
                  ),
                ),
              ),

              // Время сессии
              React.createElement(
                'div',
                {
                  style: { marginBottom: 24, padding: 16, background: '#f8f9fa', borderRadius: 8 },
                },
                React.createElement(
                  'div',
                  { style: { fontSize: 14, color: '#666', marginBottom: 4 } },
                  'Время сессии',
                ),
                React.createElement(
                  'div',
                  { style: { fontSize: 24, fontWeight: 600 } },
                  stats.session.duration,
                ),
              ),

              // Поисковые запросы
              React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '🔍 Поисковые запросы'),
                React.createElement(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 } },
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#e3f2fd', borderRadius: 8 } },
                    React.createElement('div', { style: { fontSize: 12, color: '#666' } }, 'Всего'),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.searches.total,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#fff3e0', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Медленных (>1s)',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.searches.slow,
                    ),
                  ),
                  React.createElement(
                    'div',
                    {
                      style: {
                        padding: 16,
                        background: stats.searches.slowRate === '0%' ? '#e8f5e9' : '#ffebee',
                        borderRadius: 8,
                      },
                    },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Slow Rate',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.searches.slowRate,
                    ),
                  ),
                ),
              ),

              // API вызовы
              React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '🌐 API вызовы'),
                React.createElement(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 } },
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#e3f2fd', borderRadius: 8 } },
                    React.createElement('div', { style: { fontSize: 12, color: '#666' } }, 'Всего'),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.apiCalls.total,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#fff3e0', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Медленных (>2s)',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.apiCalls.slow,
                    ),
                  ),
                  React.createElement(
                    'div',
                    {
                      style: {
                        padding: 16,
                        background: stats.apiCalls.failed > 0 ? '#ffebee' : '#e8f5e9',
                        borderRadius: 8,
                      },
                    },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Ошибок',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.apiCalls.failed,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#f3e5f5', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Slow Rate',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.apiCalls.slowRate,
                    ),
                  ),
                ),
              ),

              // Cache эффективность
              React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '💾 Cache эффективность'),
                React.createElement(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 } },
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#e8f5e9', borderRadius: 8 } },
                    React.createElement('div', { style: { fontSize: 12, color: '#666' } }, 'Hits'),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.cache.hits,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#ffebee', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Misses',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.cache.misses,
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { padding: 16, background: '#e1f5fe', borderRadius: 8 } },
                    React.createElement(
                      'div',
                      { style: { fontSize: 12, color: '#666' } },
                      'Hit Rate',
                    ),
                    React.createElement(
                      'div',
                      { style: { fontSize: 20, fontWeight: 600 } },
                      stats.cache.hitRate,
                    ),
                  ),
                ),
              ),

              // Ошибки
              React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '🐛 Ошибки'),
                React.createElement(
                  'div',
                  {
                    style: {
                      padding: 16,
                      background: stats.errors.total > 0 ? '#ffebee' : '#e8f5e9',
                      borderRadius: 8,
                    },
                  },
                  React.createElement(
                    'div',
                    { style: { fontSize: 12, color: '#666' } },
                    'Всего ошибок в сессии',
                  ),
                  React.createElement(
                    'div',
                    { style: { fontSize: 24, fontWeight: 600 } },
                    stats.errors.total,
                  ),
                ),
              ),

              // Кнопка сброса
              React.createElement(
                'div',
                { style: { marginTop: 32, paddingTop: 24, borderTop: '1px solid #eee' } },
                React.createElement(
                  'button',
                  {
                    className: 'btn secondary',
                    onClick: () => {
                      if (window.HEYS && window.HEYS.analytics && window.HEYS.analytics.reset) {
                        if (confirm('Сбросить всю статистику сессии?')) {
                          window.HEYS.analytics.reset();
                          loadStats();
                        }
                      }
                    },
                  },
                  '🗑️ Сбросить статистику',
                ),
              ),
            );
          }

          /* ═══════════════════════════════════════════════════════════════════════════════
           * 🚀 ГЛАВНЫЙ КОМПОНЕНТ: App (строки 482-1140)
           * ───────────────────────────────────────────────────────────────────────────────
           * Корневой компонент приложения с управлением состоянием
           *
           * STATE MANAGEMENT:
           *   - tab: текущая активная вкладка ('day'|'ration'|'reports'|'user'|'analytics')
           *   - products: массив продуктов для текущего клиента
           *   - clients: список клиентов куратора
           *   - clientId: ID выбранного клиента
           *   - cloudUser: авторизованный пользователь Supabase
           *   - status: состояние подключения ('online'|'offline')
           *
           * MAIN FEATURES:
           *   - Автологин в Supabase (ONE_CURATOR_MODE)
           *   - Модальное окно выбора клиента
           *   - Синхронизация данных с облаком
           *   - Локальный режим (localStorage fallback)
           *
           * DEPENDENCIES: window.HEYS.cloud, window.HEYS.utils
           * ═══════════════════════════════════════════════════════════════════════════════
           */
          const CORE_BACKUP_KEYS = [
            'heys_products',
            'heys_profile',
            'heys_hr_zones',
            'heys_norms',
            'heys_dayv2_date',
          ];

          // Тема: light / dark / auto
          function useThemePreference() {
            const [theme, setTheme] = useState(() => {
              const saved = localStorage.getItem('heys_theme');
              return ['light', 'dark', 'auto'].includes(saved) ? saved : 'light';
            });
            
            const resolvedTheme = useMemo(() => {
              if (theme === 'auto') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
              }
              return theme;
            }, [theme]);
            
            useEffect(() => {
              document.documentElement.setAttribute('data-theme', resolvedTheme);
              localStorage.setItem('heys_theme', theme);
              
              if (theme !== 'auto') return;
              
              const mq = window.matchMedia('(prefers-color-scheme: dark)');
              const handler = () => {
                document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
              };
              mq.addEventListener('change', handler);
              return () => mq.removeEventListener('change', handler);
            }, [theme, resolvedTheme]);
            
            const cycleTheme = useCallback(() => {
              setTheme(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'auto' : 'light');
            }, []);
            
            return { theme, resolvedTheme, cycleTheme };
          }

          function usePwaPrompts() {
            const [pwaInstallPrompt, setPwaInstallPrompt] = useState(null);
            const [showPwaBanner, setShowPwaBanner] = useState(false);
            const [showIosPwaBanner, setShowIosPwaBanner] = useState(false);
            
            // Определяем iOS Safari
            const isIosSafari = useMemo(() => {
              const ua = navigator.userAgent || '';
              const isIos = /iPhone|iPad|iPod/.test(ua);
              const isWebkit = /WebKit/.test(ua);
              const isChrome = /CriOS/.test(ua);
              const isFirefox = /FxiOS/.test(ua);
              // iOS Safari = iOS + WebKit + не Chrome + не Firefox
              return isIos && isWebkit && !isChrome && !isFirefox;
            }, []);
            
            // Слушаем beforeinstallprompt событие (Android/Desktop)
            useEffect(() => {
              const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                                   window.navigator.standalone === true;
              if (isStandalone) return;
              
              const dismissed = localStorage.getItem('heys_pwa_banner_dismissed');
              if (dismissed) {
                const dismissedTime = parseInt(dismissed, 10);
                if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) return;
              }
              
              if (isIosSafari) {
                setTimeout(() => setShowIosPwaBanner(true), 3000);
                return;
              }
              
              const handler = (e) => {
                e.preventDefault();
                setPwaInstallPrompt(e);
                setTimeout(() => setShowPwaBanner(true), 3000);
              };
              
              window.addEventListener('beforeinstallprompt', handler);
              return () => window.removeEventListener('beforeinstallprompt', handler);
            }, [isIosSafari]);
            
            const handlePwaInstall = useCallback(async () => {
              if (!pwaInstallPrompt) return;
              pwaInstallPrompt.prompt();
              const { outcome } = await pwaInstallPrompt.userChoice;
              if (outcome === 'accepted') {
                setShowPwaBanner(false);
                localStorage.setItem('heys_pwa_installed', 'true');
              }
              setPwaInstallPrompt(null);
            }, [pwaInstallPrompt]);
            
            const dismissPwaBanner = useCallback(() => {
              setShowPwaBanner(false);
              localStorage.setItem('heys_pwa_banner_dismissed', Date.now().toString());
            }, []);
            
            const dismissIosPwaBanner = useCallback(() => {
              setShowIosPwaBanner(false);
              localStorage.setItem('heys_pwa_banner_dismissed', Date.now().toString());
            }, []);
            
            return { showPwaBanner, showIosPwaBanner, handlePwaInstall, dismissPwaBanner, dismissIosPwaBanner };
          }

          function useCloudSyncStatus() {
            const [cloudStatus, setCloudStatus] = useState(() => navigator.onLine ? 'idle' : 'offline');
            const [pendingCount, setPendingCount] = useState(0);
            const [pendingDetails, setPendingDetails] = useState({ days: 0, products: 0, profile: 0, other: 0 });
            const [showOfflineBanner, setShowOfflineBanner] = useState(false);
            const [showOnlineBanner, setShowOnlineBanner] = useState(false);
            const [syncProgress, setSyncProgress] = useState({ synced: 0, total: 0 });
            const [retryCountdown, setRetryCountdown] = useState(0);
            
            const cloudSyncTimeoutRef = useRef(null);
            const pendingChangesRef = useRef(false);
            const syncingStartRef = useRef(null);
            const syncedTimeoutRef = useRef(null);
            const syncingDelayTimeoutRef = useRef(null);
            const initialCheckDoneRef = useRef(false);
            const retryIntervalRef = useRef(null);
            // 🔒 Cooldown после первого sync — не показываем "syncing" сразу после загрузки
            const initialSyncCompletedAtRef = useRef(0);
            const INITIAL_SYNC_COOLDOWN_MS = 3000; // 3 секунды после первого sync не показываем syncing
            
            const MIN_SYNCING_DURATION = 1500;
            const SYNCING_DELAY = 400;
            
            const showSyncedWithMinDuration = useCallback(() => {
              if (syncedTimeoutRef.current) return;
              
              const elapsed = syncingStartRef.current ? Date.now() - syncingStartRef.current : 0;
              const remaining = Math.max(0, MIN_SYNCING_DURATION - elapsed);
              
              syncedTimeoutRef.current = setTimeout(() => {
                syncedTimeoutRef.current = null;
                syncingStartRef.current = null;
                setCloudStatus('synced');
                // Звук синхронизации убран — теперь звуки только в геймификации
                setSyncProgress({ synced: 0, total: 0 });
                if (cloudSyncTimeoutRef.current) clearTimeout(cloudSyncTimeoutRef.current);
                cloudSyncTimeoutRef.current = setTimeout(() => {
                  setCloudStatus('idle');
                }, 2000);
              }, remaining);
            }, []);
            
            useEffect(() => {
              const handleSyncComplete = () => {
                // ⚡️ Первый heysSyncCompleted после инициализации не должен триггерить UI
                // если не было фактических локальных изменений/отложенных синков — иначе мерцание
                const hadPendingWork =
                  syncingStartRef.current ||
                  pendingChangesRef.current ||
                  (syncProgress.total > 0) ||
                  (pendingCount > 0);
                if (!hadPendingWork) {
                  // 🔒 Запоминаем время первого sync для cooldown
                  if (!initialSyncCompletedAtRef.current) {
                    initialSyncCompletedAtRef.current = Date.now();
                  }
                  return;
                }

                if (syncingDelayTimeoutRef.current) {
                  clearTimeout(syncingDelayTimeoutRef.current);
                  syncingDelayTimeoutRef.current = null;
                }
                if (cloudSyncTimeoutRef.current) {
                  clearTimeout(cloudSyncTimeoutRef.current);
                  cloudSyncTimeoutRef.current = null;
                }
                pendingChangesRef.current = false;
                if (navigator.onLine) {
                  showSyncedWithMinDuration();
                }
              };
              
              const handleDataSaved = () => {
                pendingChangesRef.current = true;
                
                if (!navigator.onLine) {
                  setCloudStatus('offline');
                  return;
                }
                
                if (syncedTimeoutRef.current) {
                  return;
                }
                
                // 🔒 Cooldown: не показываем "syncing" сразу после первого sync
                // Это предотвращает мерцание когда merged данные сохраняются обратно в облако
                const timeSinceInitialSync = initialSyncCompletedAtRef.current 
                  ? Date.now() - initialSyncCompletedAtRef.current 
                  : Infinity;
                if (timeSinceInitialSync < INITIAL_SYNC_COOLDOWN_MS) {
                  // Тихо сохраняем без UI-индикации
                  return;
                }
                
                if (cloudSyncTimeoutRef.current) {
                  clearTimeout(cloudSyncTimeoutRef.current);
                  cloudSyncTimeoutRef.current = null;
                }
                
                if (!syncingStartRef.current) {
                  syncingStartRef.current = Date.now();
                  
                  if (!syncingDelayTimeoutRef.current) {
                    syncingDelayTimeoutRef.current = setTimeout(() => {
                      syncingDelayTimeoutRef.current = null;
                      if (syncingStartRef.current && !syncedTimeoutRef.current) {
                        setCloudStatus('syncing');
                      }
                    }, SYNCING_DELAY);
                  }
                }
                
                if (!cloudSyncTimeoutRef.current) {
                  cloudSyncTimeoutRef.current = setTimeout(() => {
                    pendingChangesRef.current = false;
                    showSyncedWithMinDuration();
                  }, 5000);
                }
              };
              
              const handlePendingChange = (e) => {
                const count = e.detail?.count || 0;
                const details = e.detail?.details || { days: 0, products: 0, profile: 0, other: 0 };
                setPendingCount(count);
                setPendingDetails(details);
                
                if (syncProgress.total > 0 && count < syncProgress.total) {
                  setSyncProgress(prev => ({ ...prev, synced: prev.total - count }));
                }
                
                if (count > 0 && !navigator.onLine) {
                  setCloudStatus('offline');
                }
              };
              
              const handleSyncProgress = (e) => {
                const { synced, total } = e.detail || {};
                if (typeof synced === 'number' && typeof total === 'number') {
                  setSyncProgress({ synced, total });
                }
              };
              
              const handleSyncError = (e) => {
                const code = e.detail?.error;
                if (code === 'auth_required') {
                  setCloudStatus('offline');
                  setRetryCountdown(0);
                  try { window.alert('Требуется повторный вход для синхронизации'); } catch (_) {}
                  return;
                }
                
                const retryIn = e.detail?.retryIn || 5;
                setCloudStatus('error');
                setRetryCountdown(retryIn);
                
                if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
                retryIntervalRef.current = setInterval(() => {
                  setRetryCountdown(prev => {
                    if (prev <= 1) {
                      clearInterval(retryIntervalRef.current);
                      retryIntervalRef.current = null;
                      if (navigator.onLine && window.HEYS?.cloud?.retrySync) {
                        window.HEYS.cloud.retrySync();
                        setCloudStatus('syncing');
                      }
                      return 0;
                    }
                    return prev - 1;
                  });
                }, 1000);
              };
              
              const handleNetworkRestored = (e) => {
                const count = e.detail?.pendingCount || 0;
                if (count > 0) {
                  if (!syncingStartRef.current) {
                    syncingStartRef.current = Date.now();
                  }
                  setCloudStatus('syncing');
                }
              };
              
              const handleOnline = () => {
                setShowOfflineBanner(false);
                setShowOnlineBanner(true);
                setTimeout(() => setShowOnlineBanner(false), 2000);
                
                if (pendingChangesRef.current || pendingCount > 0) {
                  if (!syncingStartRef.current) {
                    syncingStartRef.current = Date.now();
                  }
                  setCloudStatus('syncing');
                  if (cloudSyncTimeoutRef.current) clearTimeout(cloudSyncTimeoutRef.current);
                  cloudSyncTimeoutRef.current = setTimeout(() => {
                    pendingChangesRef.current = false;
                    showSyncedWithMinDuration();
                  }, 2000);
                } else {
                  setCloudStatus('idle');
                }
              };
              
              const handleOffline = () => {
                setShowOfflineBanner(true);
                setCloudStatus('offline');
                setTimeout(() => {
                  setShowOfflineBanner(false);
                }, 3000);
              };
              
              window.addEventListener('heysSyncCompleted', handleSyncComplete);
              window.addEventListener('heys:data-uploaded', handleSyncComplete);
              window.addEventListener('heys:data-saved', handleDataSaved);
              window.addEventListener('heys:pending-change', handlePendingChange);
              window.addEventListener('heys:network-restored', handleNetworkRestored);
              window.addEventListener('heys:sync-progress', handleSyncProgress);
              window.addEventListener('heys:sync-error', handleSyncError);
              window.addEventListener('online', handleOnline);
              window.addEventListener('offline', handleOffline);
              
              if (!initialCheckDoneRef.current) {
                initialCheckDoneRef.current = true;
                if (!navigator.onLine) {
                  setCloudStatus('offline');
                  setShowOfflineBanner(true);
                  setTimeout(() => setShowOfflineBanner(false), 3000);
                } else {
                  setCloudStatus('idle');
                }
              }
              
              if (window.HEYS?.cloud?.getPendingCount) {
                setPendingCount(window.HEYS.cloud.getPendingCount());
              }
              if (window.HEYS?.cloud?.getPendingDetails) {
                setPendingDetails(window.HEYS.cloud.getPendingDetails());
              }
              
              return () => {
                window.removeEventListener('heysSyncCompleted', handleSyncComplete);
                window.removeEventListener('heys:data-uploaded', handleSyncComplete);
                window.removeEventListener('heys:data-saved', handleDataSaved);
                window.removeEventListener('heys:pending-change', handlePendingChange);
                window.removeEventListener('heys:network-restored', handleNetworkRestored);
                window.removeEventListener('heys:sync-progress', handleSyncProgress);
                window.removeEventListener('heys:sync-error', handleSyncError);
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
                if (cloudSyncTimeoutRef.current) clearTimeout(cloudSyncTimeoutRef.current);
                if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
              };
            }, [pendingCount, showSyncedWithMinDuration, syncProgress.total]);
            
            const handleRetrySync = useCallback(() => {
              if (window.HEYS?.cloud?.retrySync) {
                window.HEYS.cloud.retrySync();
                syncingStartRef.current = Date.now();
                setCloudStatus('syncing');
              }
            }, []);
            
            return {
              cloudStatus,
              pendingCount,
              pendingDetails,
              showOfflineBanner,
              showOnlineBanner,
              syncProgress,
              retryCountdown,
              handleRetrySync,
            };
          }

          function useClientState(cloud, U) {
            const [status, setStatus] = useState(
              typeof cloud.getStatus === 'function' ? cloud.getStatus() : 'offline',
            );
            const [syncVer, setSyncVer] = useState(0);
            const [calendarVer, setCalendarVer] = useState(0); // 🗓️ Отдельный state для инвалидации календаря
            const [clients, setClients] = useState([]);
            const [clientsSource, setClientsSource] = useState(''); // 'cloud' | 'cache' | 'loading'
            const [clientId, setClientId] = useState('');
            const [newName, setNewName] = useState('');
            const [cloudUser, setCloudUser] = useState(null);
            const [isInitializing, setIsInitializing] = useState(true);
            const [products, setProducts] = useState([]);
            const [backupMeta, setBackupMeta] = useState(() => {
              if (U && typeof U.lsGet === 'function') {
                try {
                  return U.lsGet('heys_backup_meta', null);
                } catch (_) {}
              }
              return null;
            });
            const [backupBusy, setBackupBusy] = useState(false);
            
            return {
              status, setStatus,
              syncVer, setSyncVer,
              calendarVer, setCalendarVer,
              clients, setClients,
              clientsSource, setClientsSource,
              clientId, setClientId,
              newName, setNewName,
              cloudUser, setCloudUser,
              isInitializing, setIsInitializing,
              products, setProducts,
              backupMeta, setBackupMeta,
              backupBusy, setBackupBusy,
            };
          }

          function useCloudClients(cloud, U, {
            clients, setClients,
            clientsSource, setClientsSource,
            clientId, setClientId,
            cloudUser, setCloudUser,
            setProducts,
            setStatus,
            setSyncVer,
            setLoginError,
          }) {
            const ONE_CURATOR_MODE = true;
            const signInCooldownUntilRef = useRef(0);
            const fetchingClientsRef = useRef(false); // 🔧 FIX: Защита от дублирования запросов
            
            // Fallback если cloud.fetchWithRetry не доступен
            const defaultFetchWithRetry = async (fn, opts) => {
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), opts.timeoutMs || 8000)
              );
              try {
                return await Promise.race([fn(), timeoutPromise]);
              } catch (e) {
                return { data: null, error: { message: e.message } };
              }
            };
            
            const fetchClientsFromCloud = useCallback(async (curatorId) => {
              if (!cloud.client || !curatorId) {
                return { data: [], source: 'error' };
              }
              
              // 🔧 FIX: Пропускаем если уже загружаем
              if (fetchingClientsRef.current) {
                return { data: [], source: 'skip' };
              }
              fetchingClientsRef.current = true;
              
              setClientsSource('loading');
              
              try {
                // 🔄 Используем fetchWithRetry с retry + fallback routing
                const result = await (cloud.fetchWithRetry || defaultFetchWithRetry)(
                  () => cloud.client
                    .from('clients')
                    .select('id, name')
                    .eq('curator_id', curatorId)
                    .order('updated_at', { ascending: true }),
                  { label: 'fetchClients', maxRetries: 2, timeoutMs: 8000 }
                );
                
                fetchingClientsRef.current = false;
                
                if (result.error) {
                  console.error('Ошибка загрузки клиентов:', result.error.message);
                  setClientsSource('error');
                  return { data: [], source: 'error' };
                }
                
                const data = result.data;
                // Сохраняем в localStorage для кэширования
                if (data && data.length > 0) {
                  localStorage.setItem('heys_clients', JSON.stringify(data));
                }
                setClientsSource('cloud');
                return { data: data || [], source: 'cloud' };
              } catch (e) {
                fetchingClientsRef.current = false;
                console.error('[HEYS] ❌ fetchClientsFromCloud failed:', e.message);
                setClientsSource('error');
                return { data: [], source: 'error' };
              }
            }, [cloud]);
            
            const addClientToCloud = useCallback(async (name) => {
              const clientName = (name || '').trim() || `Клиент ${clients.length + 1}`;

              if (!cloud.client || !cloudUser || !cloudUser.id) {
                const newClient = {
                  id: `local-user-${Date.now()}`,
                  name: clientName,
                };
                const updatedClients = [...clients, newClient];
                setClients(updatedClients);
                U.lsSet('heys_clients', updatedClients);
                setClientId(newClient.id);
                U.lsSet('heys_client_current', newClient.id);
                return;
              }

              const userId = cloudUser.id;
              const { data, error } = await cloud.client
                .from('clients')
                .insert([{ name: clientName, curator_id: userId }])
                .select('id, name')
                .single();
              if (error) {
                console.error('Ошибка создания клиента:', error);
                alert('Ошибка создания клиента: ' + error.message);
                return;
              }
              const result = await fetchClientsFromCloud(userId);
              setClients(result.data);
              setClientId(data.id);
              U.lsSet('heys_client_current', data.id);
            }, [clients, cloud, cloudUser, fetchClientsFromCloud, setClientId, setClients, U]);
            
            const renameClient = useCallback(async (id, name) => {
              if (!cloud.client || !cloudUser || !cloudUser.id) {
                const updatedClients = clients.map((c) => (c.id === id ? { ...c, name } : c));
                setClients(updatedClients);
                U.lsSet('heys_clients', updatedClients);
                return;
              }

              const userId = cloudUser.id;
              await cloud.client.from('clients').update({ name }).eq('id', id);
              const result = await fetchClientsFromCloud(userId);
              setClients(result.data);
            }, [clients, cloud, cloudUser, fetchClientsFromCloud, setClients, U]);
            
            const removeClient = useCallback(async (id) => {
              if (!cloud.client || !cloudUser || !cloudUser.id) {
                const updatedClients = clients.filter((c) => c.id !== id);
                setClients(updatedClients);
                U.lsSet('heys_clients', updatedClients);
                if (clientId === id) {
                  setClientId('');
                  U.lsSet('heys_client_current', '');
                }
                return;
              }

              const userId = cloudUser.id;
              await cloud.client.from('clients').delete().eq('id', id);
              const result = await fetchClientsFromCloud(userId);
              setClients(result.data);
              if (clientId === id) {
                setClientId('');
                U.lsSet('heys_client_current', '');
              }
            }, [clientId, clients, cloud, cloudUser, fetchClientsFromCloud, setClientId, setClients, U]);
            
            const cloudSignIn = useCallback(async (email, password, opts = {}) => {
              if (!email || !password) {
                setLoginError('Введите email и пароль');
                setStatus('offline');
                return { error: 'missing_credentials' };
              }
              
              const now = Date.now();
              if (now < signInCooldownUntilRef.current) {
                setLoginError('Слишком много попыток. Подождите 30 сек и попробуйте снова.');
                setStatus('offline');
                return { error: 'cooldown' };
              }
              
              const rememberMe = opts.rememberMe === true;
              if (!cloud || typeof cloud.signIn !== 'function') {
                alert('Облачный модуль не загружен');
                return;
              }
              
              try {
                setStatus('signin');
                setLoginError(null);
                
                if (rememberMe) {
                  localStorage.setItem('heys_remember_me', 'true');
                  localStorage.setItem('heys_remember_email', email || '');
                } else {
                  localStorage.removeItem('heys_remember_me');
                  localStorage.removeItem('heys_remember_email');
                }
                
                const res = await cloud.signIn(email, password);
                if (!res || res.error) {
                  const message = res?.error?.message || 'Ошибка подключения к серверу';
                  setLoginError(message);
                  
                  // Примитивный backoff для 429
                  if (/Too Many Requests/i.test(message)) {
                    signInCooldownUntilRef.current = Date.now() + 30_000;
                  }
                  setStatus('offline');
                  return { error: message };
                }
                
                setCloudUser(res.user);
                setStatus(typeof cloud.getStatus === 'function' ? cloud.getStatus() : 'online');
                const loadedResult = await fetchClientsFromCloud(res.user.id);
                setClients(loadedResult.data);
                
                // Не автовыбираем клиента — куратор должен выбрать сам через модалку
                // clientId остаётся null → показывается модалка выбора клиента
                
                const loadedProducts = Array.isArray(U.lsGet('heys_products', []))
                  ? U.lsGet('heys_products', [])
                  : [];
                setProducts(loadedProducts);
                setSyncVer((v) => v + 1);
              } catch (e) {
                setStatus('offline');
                setLoginError(e && e.message ? e.message : 'Ошибка подключения');
              }
            }, [cloud, fetchClientsFromCloud, setClientId, setClients, setCloudUser, setProducts, setStatus, setSyncVer, U]);
            
            const cloudSignOut = useCallback(async () => {
              try {
                if (cloud && typeof cloud.signOut === 'function') await cloud.signOut();
              } catch (_) {}
              setCloudUser(null);
              setClientId(null);
              setClients([]);
              setProducts([]);
              setStatus('offline');
              setSyncVer((v) => v + 1);
              try { localStorage.removeItem('heys_last_client_id'); } catch (_) {}
            }, [cloud, setClientId, setClients, setCloudUser, setProducts, setStatus, setSyncVer]);
            
            return {
              ONE_CURATOR_MODE,
              fetchClientsFromCloud,
              addClientToCloud,
              renameClient,
              removeClient,
              cloudSignIn,
              cloudSignOut,
            };
          }

          function renderRoot(AppComponent) {
            const root = ReactDOM.createRoot(document.getElementById('root'));
            root.render(React.createElement(ErrorBoundary, null, React.createElement(AppComponent)));
          }

          function App() {
            const [tab, setTab] = useState('stats');
            
            // Экспортируем setTab для доступа из DayTab (FAB)
            useEffect(() => {
              window.HEYS = window.HEYS || {};
              window.HEYS.App = window.HEYS.App || {};
              window.HEYS.App.setTab = setTab;
              window.HEYS.App.getTab = () => tab;
              return () => {
                if (window.HEYS?.App) {
                  delete window.HEYS.App.setTab;
                  delete window.HEYS.App.getTab;
                }
              };
            }, [tab, setTab]);
            
            const { theme, resolvedTheme, cycleTheme } = useThemePreference();
            useEffect(() => {
              HEYS.cycleTheme = cycleTheme;
            }, [cycleTheme]);
            
            // Twemoji: reparse emoji on mount and tab change
            useEffect(() => {
              // console.log('[App] 🎨 Twemoji effect triggered', {...});
              if (window.applyTwemoji) {
                // Immediate + delayed to catch React render
                window.applyTwemoji();
                setTimeout(() => {
                  // console.log('[App] 🎨 Twemoji delayed parse (50ms)');
                  window.applyTwemoji();
                }, 50);
                setTimeout(() => {
                  // console.log('[App] 🎨 Twemoji delayed parse (150ms)');
                  window.applyTwemoji();
                }, 150);
              } else {
                console.warn('[App] ⚠️ applyTwemoji not available');
              }
            }, [tab]);
            
            const U = window.HEYS.utils || { lsGet: (k, d) => d, lsSet: () => {} };
            const cloud = window.HEYS.cloud || {};
            const {
              status, setStatus,
              syncVer, setSyncVer,
              calendarVer, setCalendarVer,
              clients, setClients,
              clientsSource, setClientsSource,
              clientId, setClientId,
              newName, setNewName,
              cloudUser, setCloudUser,
              isInitializing, setIsInitializing,
              products, setProducts,
              backupMeta, setBackupMeta,
              backupBusy, setBackupBusy,
            } = useClientState(cloud, U);
            const [loginError, setLoginError] = useState('');
            const {
              ONE_CURATOR_MODE,
              fetchClientsFromCloud,
              addClientToCloud,
              renameClient,
              removeClient,
              cloudSignIn,
              cloudSignOut,
            } = useCloudClients(cloud, U, {
              clients, setClients,
              clientsSource, setClientsSource,
              clientId, setClientId,
              cloudUser, setCloudUser,
              setProducts,
              setStatus,
              setSyncVer,
              setLoginError,
            });
            // ...все остальные useState...
            // useEffect автосмены клиента — ниже всех useState!
            
            // === SWIPE NAVIGATION ===
            const TABS_ORDER = ['ration', 'stats', 'diary', 'reports', 'overview', 'user'];
            const touchRef = React.useRef({ startX: 0, startY: 0, startTime: 0 });
            const MIN_SWIPE_DISTANCE = 60;
            const MAX_SWIPE_TIME = 500; // ms — увеличено для более плавного свайпа
            
            // Slide animation state
            const [slideDirection, setSlideDirection] = useState(null); // 'left' | 'right' | null
            const [edgeBounce, setEdgeBounce] = useState(null); // 'left' | 'right' | null
            
            const onTouchStart = React.useCallback((e) => {
              // Игнорируем свайпы на интерактивных элементах, модалках, слайдерах и тостах
              const target = e.target;
              if (target.closest('input, textarea, select, button, .swipeable-container, table, .tab-switch-group, .advice-list-overlay, .macro-toast, .no-swipe-zone, [type="range"]')) {
                return;
              }
              const touch = e.touches[0];
              touchRef.current = {
                startX: touch.clientX,
                startY: touch.clientY,
                startTime: Date.now()
              };
            }, []);
            
            const onTouchEnd = React.useCallback((e) => {
              if (!touchRef.current.startTime) return; // Не было валидного touchStart
              
              const touch = e.changedTouches[0];
              const deltaX = touch.clientX - touchRef.current.startX;
              const deltaY = touch.clientY - touchRef.current.startY;
              const deltaTime = Date.now() - touchRef.current.startTime;
              
              // Сбрасываем для следующего свайпа
              const startTime = touchRef.current.startTime;
              touchRef.current.startTime = 0;
              
              // Игнорируем если:
              // - свайп слишком медленный
              // - вертикальный скролл больше горизонтального
              // - расстояние слишком маленькое
              if (deltaTime > MAX_SWIPE_TIME) return;
              if (Math.abs(deltaY) > Math.abs(deltaX) * 0.7) return; // Более мягкое условие
              if (Math.abs(deltaX) < MIN_SWIPE_DISTANCE) return;
              
              // Свайп между stats и diary обрабатывается глобально
              // (больше нет отдельной вкладки 'day')
              
              const currentIndex = TABS_ORDER.indexOf(tab);
              
              if (deltaX < 0 && currentIndex < TABS_ORDER.length - 1) {
                // Свайп влево → следующая вкладка
                const nextTab = TABS_ORDER[currentIndex + 1];
                if (nextTab === 'reports' && window.HEYS?.Day?.requestFlush) {
                  try { window.HEYS.Day.requestFlush(); } catch (e) {}
                  setReportsRefresh(Date.now());
                }
                setSlideDirection('left');
                setTimeout(() => {
                  setTab(nextTab);
                  setSlideDirection(null);
                }, 150);
                if (navigator.vibrate) navigator.vibrate(10);
              } else if (deltaX > 0 && currentIndex > 0) {
                // Свайп вправо → предыдущая вкладка
                setSlideDirection('right');
                setTimeout(() => {
                  setTab(TABS_ORDER[currentIndex - 1]);
                  setSlideDirection(null);
                }, 150);
                if (navigator.vibrate) navigator.vibrate(10);
              } else if (deltaX < 0 && currentIndex === TABS_ORDER.length - 1) {
                // Край справа — показываем bounce
                setEdgeBounce('right');
                if (navigator.vibrate) navigator.vibrate([5, 30, 5]);
                setTimeout(() => setEdgeBounce(null), 300);
              } else if (deltaX > 0 && currentIndex === 0) {
                // Край слева — показываем bounce
                setEdgeBounce('left');
                if (navigator.vibrate) navigator.vibrate([5, 30, 5]);
                setTimeout(() => setEdgeBounce(null), 300);
              }
            }, [tab]);
            const [reportsRefresh, setReportsRefresh] = useState(0);
            
            // Дата для DayTab (поднятый state для DatePicker в шапке)
            // До 3:00 — "сегодня" = вчера (день ещё не закончился)
            const todayISO = () => {
              const d = new Date();
              const hour = d.getHours();
              if (hour < 3) {
                d.setDate(d.getDate() - 1);
              }
              return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            };
            const [selectedDate, setSelectedDate] = useState(todayISO());
            
            // === PWA Install Banner ===
            const {
              showPwaBanner,
              showIosPwaBanner,
              handlePwaInstall,
              dismissPwaBanner,
              dismissIosPwaBanner,
            } = usePwaPrompts();
            const {
              cloudStatus,
              pendingCount,
              pendingDetails,
              showOfflineBanner,
              showOnlineBanner,
              syncProgress,
              retryCountdown,
              handleRetrySync,
            } = useCloudSyncStatus();
            
            // === Update Toast (новая версия доступна) ===
            const [showUpdateToast, setShowUpdateToast] = useState(false);
            
            // Регистрируем глобальный хук для SW
            React.useEffect(() => {
              window.HEYS = window.HEYS || {};
              window.HEYS.showUpdateToast = () => {
                setShowUpdateToast(true);
              };
              return () => {
                if (window.HEYS) delete window.HEYS.showUpdateToast;
              };
            }, []);
            
            const handleUpdate = () => {
              // Принудительно активируем новый SW
              if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage('skipWaiting');
              }
              // Перезагрузка через 300ms для завершения активации
              setTimeout(() => window.location.reload(), 300);
            };
            
            const dismissUpdateToast = () => {
              setShowUpdateToast(false);
              // Напоминаем через 24 часа
              localStorage.setItem('heys_update_dismissed', Date.now().toString());
            };

            // === Badge API: обновление streak на иконке ===
            useEffect(() => {
              // Обновляем badge при загрузке (с задержкой пока DayTab загрузится)
              const initialUpdate = setTimeout(() => {
                window.HEYS?.badge?.updateFromStreak();
              }, 2000);
              
              // Обновляем при изменении данных
              const handleDataChange = () => {
                // Небольшая задержка чтобы streak успел пересчитаться
                setTimeout(() => {
                  window.HEYS?.badge?.updateFromStreak();
                }, 500);
              };
              
              window.addEventListener('heysSyncCompleted', handleDataChange);
              window.addEventListener('heys:data-saved', handleDataChange);
              
              return () => {
                clearTimeout(initialUpdate);
                window.removeEventListener('heysSyncCompleted', handleDataChange);
                window.removeEventListener('heys:data-saved', handleDataChange);
              };
            }, []);
            
            // 🗓️ Отдельный debounced handler для обновления календаря при cycleDay
            // Используем отдельный calendarVer чтобы не вызывать полный ре-рендер App
            const calendarDebounceRef = useRef(null);
            useEffect(() => {
              const handleCycleUpdate = (e) => {
                const source = e.detail?.source;
                const field = e.detail?.field;
                
                // Реагируем только на изменения cycleDay
                if (field !== 'cycleDay' && !source?.startsWith('cycle')) return;
                
                // Debounce 500ms — если несколько изменений подряд, обновляем только один раз
                if (calendarDebounceRef.current) {
                  clearTimeout(calendarDebounceRef.current);
                }
                calendarDebounceRef.current = setTimeout(() => {
                  setCalendarVer(v => v + 1);
                  calendarDebounceRef.current = null;
                }, 500);
              };
              
              window.addEventListener('heys:day-updated', handleCycleUpdate);
              return () => {
                window.removeEventListener('heys:day-updated', handleCycleUpdate);
                if (calendarDebounceRef.current) {
                  clearTimeout(calendarDebounceRef.current);
                }
              };
            }, []);
            
            // Вычисляем activeDays для DatePicker (после объявления clientId и products)
            // 🔒 ОПТИМИЗАЦИЯ: Используем calendarVer вместо syncVer — он меняется только при cycleDay
            // Пересчитывается когда: меняется месяц, клиент, продукты, или cycleDay (через calendarVer)
            const datePickerActiveDays = React.useMemo(() => {
              // Fallback chain для products: props → HEYS.products.getAll() → localStorage
              const effectiveProducts = (products && products.length > 0) ? products
                : (window.HEYS.products?.getAll?.() || [])
                .length > 0 ? window.HEYS.products.getAll()
                : (U.lsGet?.('heys_products', []) || []);
              
              // Не вычисляем пока идёт инициализация или нет продуктов
              if (isInitializing || effectiveProducts.length === 0) {
                return new Map();
              }
              
              const getActiveDaysForMonth = window.HEYS.dayUtils && window.HEYS.dayUtils.getActiveDaysForMonth;
              if (!getActiveDaysForMonth || !clientId) {
                return new Map();
              }
              
              // Получаем profile из localStorage
              const profile = U && U.lsGet ? U.lsGet('heys_profile', {}) : {};
              
              // Парсим selectedDate для определения месяца
              const parts = selectedDate.split('-');
              const year = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
              
              try {
                // Передаём effectiveProducts (с fallback) в функцию
                return getActiveDaysForMonth(year, month, profile, effectiveProducts);
              } catch (e) {
                // Тихий fallback — activeDays для календаря не критичны
                return new Map();
              }
            }, [selectedDate, clientId, products, isInitializing, calendarVer]);

            const downloadBackupFile = React.useCallback((payload, activeClientId, timestamp) => {
              try {
                const blob = new Blob([JSON.stringify(payload, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const safeTs = (timestamp || '').replace(/[:]/g, '-');
                a.download = `heys-backup-${activeClientId || 'client'}-${safeTs || Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 0);
              } catch (error) {
                console.error('Не удалось выгрузить файл резервной копии:', error);
              }
            }, []);

            const listDayKeysForClient = React.useCallback(() => {
              if (!clientId) return [];
              const normalized = new Set();
              try {
                const heysPrefix = `heys_${clientId}_`;
                const legacyDayPrefix = `day_${clientId}_`;
                for (let i = 0; i < localStorage.length; i++) {
                  const rawKey = localStorage.key(i);
                  if (!rawKey) continue;
                  if (rawKey.startsWith(`${heysPrefix}dayv2_`)) {
                    normalized.add('heys_' + rawKey.slice(heysPrefix.length));
                  } else if (rawKey.startsWith(legacyDayPrefix)) {
                    normalized.add('day_' + rawKey.slice(legacyDayPrefix.length));
                  }
                }
              } catch (error) {
                // Тихий fallback — backup ключи не критичны
              }
              return Array.from(normalized);
            }, [clientId]);

            const backupAllKeys = React.useCallback(
              (options = {}) => {
                if (!clientId) {
                  if (!options.silent) alert('Сначала выберите клиента');
                  return { ok: false, reason: 'no-client' };
                }
                const timestamp = new Date().toISOString();
                const reason = options.reason || 'manual';
                const includeDays = options.includeDays !== false;
                const baseKeys = Array.isArray(options.keys) && options.keys.length
                  ? options.keys
                  : CORE_BACKUP_KEYS;
                const keysToProcess = new Set(baseKeys);
                if (includeDays) {
                  listDayKeysForClient().forEach((key) => keysToProcess.add(key));
                }
                const shouldDownload = Boolean(options.triggerDownload);
                const filePayload = shouldDownload
                  ? { version: 1, clientId, generatedAt: timestamp, reason, items: [] }
                  : null;
                let processed = 0;
                keysToProcess.forEach((key) => {
                  let data = null;
                  try {
                    data = U && typeof U.lsGet === 'function' ? U.lsGet(key, null) : null;
                  } catch (error) {
                    console.warn('[HEYS] Ошибка чтения ключа для бэкапа:', key, error);
                    data = null;
                  }
                  if (data === null || data === undefined) return;
                  if (key === 'heys_products' && Array.isArray(data) && data.length === 0) {
                    if (window.DEV) {
                      window.DEV.log(
                        '[BACKUP] SKIP heys_products_backup: source array is empty, keep previous snapshot',
                      );
                    }
                    return;
                  }
                  const snapshot = {
                    key,
                    clientId,
                    backupAt: timestamp,
                    reason,
                    data,
                    itemsCount: Array.isArray(data)
                      ? data.length
                      : data && typeof data === 'object'
                        ? Object.keys(data).length
                        : 1,
                  };
                  if (window.DEV && key === 'heys_products') {
                    window.DEV.log('[BACKUP] heys_products_backup items:', snapshot.itemsCount);
                  }
                  if (U && typeof U.lsSet === 'function') {
                    U.lsSet(`${key}_backup`, snapshot);
                  } else {
                    try {
                      localStorage.setItem(`${key}_backup`, JSON.stringify(snapshot));
                    } catch (error) {
                      console.warn('[HEYS] Ошибка сохранения бэкапа в localStorage:', error);
                    }
                    if (window.HEYS && typeof window.HEYS.saveClientKey === 'function') {
                      try {
                        window.HEYS.saveClientKey(`${key}_backup`, snapshot);
                      } catch (error) {
                        console.warn('[HEYS] Ошибка отправки бэкапа в облако:', error);
                      }
                    }
                  }
                  if (filePayload) {
                    filePayload.items.push(snapshot);
                  }
                  processed++;
                });
                const meta = {
                  timestamp,
                  clientId,
                  reason,
                  processed,
                  keys: Array.from(keysToProcess),
                };
                if (U && typeof U.lsSet === 'function') {
                  U.lsSet('heys_backup_meta', meta);
                } else {
                  try {
                    localStorage.setItem('heys_backup_meta', JSON.stringify(meta));
                  } catch (error) {}
                  if (window.HEYS && typeof window.HEYS.saveClientKey === 'function') {
                    try {
                      window.HEYS.saveClientKey('heys_backup_meta', meta);
                    } catch (error) {
                      console.warn('[HEYS] Ошибка синхронизации метаданных бэкапа:', error);
                    }
                  }
                }
                setBackupMeta(meta);
                if (shouldDownload && filePayload && filePayload.items.length) {
                  downloadBackupFile(filePayload, clientId, timestamp);
                }
                if (!options.silent) {
                  alert(
                    processed
                      ? `Бэкап готов: ${processed} разделов`
                      : 'Нет данных для резервного копирования',
                  );
                }
                if (window.HEYS && window.HEYS.analytics) {
                  window.HEYS.analytics.trackDataOperation('backup-save', processed);
                }
                return { ok: processed > 0, meta, processed };
              },
              [clientId, downloadBackupFile, listDayKeysForClient, setBackupMeta],
            );

            const restoreFromBackup = React.useCallback(
              (target = 'heys_products', options = {}) => {
                if (!clientId) {
                  if (!options.silent) alert('Сначала выберите клиента');
                  return { ok: false, reason: 'no-client' };
                }
                const keysList =
                  target === 'all'
                    ? Array.from(
                        new Set([
                          ...CORE_BACKUP_KEYS,
                          ...(options.includeDays === false
                            ? []
                            : listDayKeysForClient()),
                        ]),
                      )
                    : Array.isArray(target)
                      ? target
                      : [target];
                let restored = 0;
                keysList.forEach((key) => {
                  let snapshot = null;
                  try {
                    snapshot = U && typeof U.lsGet === 'function' ? U.lsGet(`${key}_backup`, null) : null;
                  } catch (error) {
                    console.warn('[HEYS] Ошибка чтения бэкапа перед восстановлением:', key, error);
                    snapshot = null;
                  }
                  if (!snapshot || typeof snapshot !== 'object' || !('data' in snapshot)) {
                    return;
                  }
                  if (key === 'heys_products' && Array.isArray(snapshot.data) && snapshot.data.length === 0) {
                    if (window.DEV) {
                      window.DEV.log('[RESTORE] Empty heys_products_backup, treating as no backup');
                    }
                    return;
                  }
                  if (key === 'heys_products') {
                    setProducts(Array.isArray(snapshot.data) ? snapshot.data : []);
                  } else if (U && typeof U.lsSet === 'function') {
                    U.lsSet(key, snapshot.data);
                  } else {
                    try {
                      localStorage.setItem(key, JSON.stringify(snapshot.data));
                    } catch (error) {}
                    if (window.HEYS && typeof window.HEYS.saveClientKey === 'function') {
                      try {
                        window.HEYS.saveClientKey(key, snapshot.data);
                      } catch (error) {
                        console.warn('[HEYS] Ошибка синхронизации восстановленных данных:', error);
                      }
                    }
                  }
                  restored++;
                });
                if (restored) {
                  setSyncVer((v) => v + 1);
                  if (window.HEYS && window.HEYS.analytics) {
                    window.HEYS.analytics.trackDataOperation('backup-restore', restored);
                  }
                }
                if (!options.silent) {
                  alert(
                    restored
                      ? `Восстановлено разделов: ${restored}`
                      : 'Не удалось найти подходящий бэкап',
                  );
                }
                return { ok: restored > 0, restored };
              },
              [clientId, listDayKeysForClient, setProducts, setSyncVer],
            );

            // Автопереключение на вкладку статистики дня при выборе клиента
            // (пропускаем если это PWA shortcut action)
            const skipTabSwitchRef = useRef(false);
            useEffect(() => {
              if (clientId && !skipTabSwitchRef.current) setTab('stats');
            }, [clientId]);

            // === PWA Shortcut: обработка ?action=add-meal ===
            useEffect(() => {
              const params = new URLSearchParams(window.location.search);
              const action = params.get('action');
              
              if (action === 'add-meal') {
                // Блокируем переключение вкладки при смене clientId
                skipTabSwitchRef.current = true;
                
                // Очищаем URL чтобы не триггерить повторно
                const url = new URL(window.location.href);
                url.searchParams.delete('action');
                window.history.replaceState({}, '', url.pathname + url.search);
                
                // Переключаемся на вкладку stats (там DayTab)
                setTab('stats');
                
                // Ждём пока DayTab смонтируется и вызываем addMeal
                const tryAddMeal = () => {
                  if (window.HEYS?.Day?.addMeal) {
                    window.HEYS.Day.addMeal();
                    // Вибрация при успешном открытии
                    if (navigator.vibrate) navigator.vibrate(15);
                    // Сбрасываем флаг после небольшой задержки
                    setTimeout(() => { skipTabSwitchRef.current = false; }, 500);
                  } else {
                    // Повторяем через 100ms если DayTab ещё не готов
                    setTimeout(tryAddMeal, 100);
                  }
                };
                // Даём время на рендер
                setTimeout(tryAddMeal, 150);
              }
            }, []);

            // Fallback: если после входа продукты пустые, пробуем взять из localStorage через utils
            useEffect(() => {
              if (products.length === 0) {
                try {
                  const stored =
                    (window.HEYS &&
                      window.HEYS.utils &&
                      window.HEYS.utils.lsGet &&
                      window.HEYS.utils.lsGet('heys_products', [])) ||
                    [];
                  if (Array.isArray(stored) && stored.length) setProducts(stored);
                } catch (e) {}
              }
            }, [products.length]);

            // При смене клиента сохраняем в localStorage (для совместимости)
            // 🔒 Ref для отслеживания первой инициализации (чтобы не дублировать ре-рендер)
            const clientSyncDoneRef = React.useRef(false);
            useEffect(() => {
              if (clientId) {
                U.lsSet('heys_client_current', clientId);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = clientId;
                
                // Критический лог: переключение клиента
                console.info('[HEYS] 👤 Клиент:', clientId.substring(0,8) + '...');
                
                // Подгружаем данные клиента из Supabase и обновляем продукты
                if (cloud && typeof cloud.bootstrapClientSync === 'function') {
                  // КРИТИЧНО: Сохраняем текущие продукты перед синхронизацией
                  const productsBeforeSync = products.length > 0 ? products : window.HEYS.utils.lsGet('heys_products', []);
                  
                  cloud.bootstrapClientSync(clientId)
                    .then(() => {
                      // всегда используем HEYS.utils.lsGet для clientId-специфичного ключа
                      const loadedProducts = Array.isArray(
                        window.HEYS.utils.lsGet('heys_products', []),
                      )
                        ? window.HEYS.utils.lsGet('heys_products', [])
                        : [];
                      
                      // ЗАЩИТА: если синхронизация вернула пустой массив, а у нас были продукты - не затираем
                      if (loadedProducts.length === 0 && Array.isArray(productsBeforeSync) && productsBeforeSync.length > 0) {
                        console.info(`ℹ️ [SYNC] Kept ${productsBeforeSync.length} local products (cloud empty)`);
                        // 🔒 Functional update: не ре-рендерим если продукты не изменились
                        setProducts(prev => {
                          if (Array.isArray(prev) && prev.length === productsBeforeSync.length) return prev;
                          return productsBeforeSync;
                        });
                        // Восстанавливаем в localStorage
                        window.HEYS.utils.lsSet('heys_products', productsBeforeSync);
                      } else {
                        // 🔒 Functional update: не ре-рендерим если продукты не изменились
                        setProducts(prev => {
                          if (Array.isArray(prev) && prev.length === loadedProducts.length) return prev;
                          return loadedProducts;
                        });
                      }
                      // 🔒 При ПЕРВОЙ загрузке НЕ инкрементим syncVer — heysSyncCompleted уже обновил UI
                      // Это предотвращает лишний ре-рендер и мерцание
                      if (!clientSyncDoneRef.current) {
                        clientSyncDoneRef.current = true;
                        return;
                      }
                      setSyncVer((v) => v + 1);
                    })
                    .catch((err) => {
                      console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                      // Используем локальные продукты
                      if (Array.isArray(productsBeforeSync) && productsBeforeSync.length > 0) {
                        setProducts(prev => {
                          if (Array.isArray(prev) && prev.length === productsBeforeSync.length) return prev;
                          return productsBeforeSync;
                        });
                      }
                      if (!clientSyncDoneRef.current) {
                        clientSyncDoneRef.current = true;
                        return;
                      }
                      setSyncVer((v) => v + 1);
                    });
                } else {
                  if (!clientSyncDoneRef.current) {
                    clientSyncDoneRef.current = true;
                    return;
                  }
                  setSyncVer((v) => v + 1);
                }
              }
            }, [clientId]);

            useEffect(() => {
              if (!clientId) {
                setBackupMeta(null);
                return;
              }
              try {
                const meta = U && typeof U.lsGet === 'function' ? U.lsGet('heys_backup_meta', null) : null;
                setBackupMeta(meta || null);
              } catch (error) {
                // Тихий fallback — метаданные backup не критичны
              }
            }, [clientId]);

            // Слушаем событие обновления продуктов из облака
            // 🔒 Пропускаем первый sync чтобы избежать мерцания при загрузке
            const initialSyncDoneRef = React.useRef(false);
            
            useEffect(() => {
              const markInitialSyncDone = () => {
                // Через 1 секунду после heysSyncCompleted считаем что initial sync прошёл
                setTimeout(() => {
                  initialSyncDoneRef.current = true;
                }, 1000);
              };
              window.addEventListener('heysSyncCompleted', markInitialSyncDone);
              return () => {
                window.removeEventListener('heysSyncCompleted', markInitialSyncDone);
              };
            }, []);
            
            useEffect(() => {
              const handleProductsUpdate = (event) => {
                const { products } = event.detail;
                setProducts(products);
                // 🔒 Пропускаем setSyncVer при первом sync — UI уже показывает актуальные данные
                if (!initialSyncDoneRef.current) return;
                setSyncVer((v) => v + 1);
              };

              window.addEventListener('heysProductsUpdated', handleProductsUpdate);
              return () => window.removeEventListener('heysProductsUpdated', handleProductsUpdate);
            }, []);

            // Слушаем событие обновления данных дня (cycleDay, meals, etc.)
            // ⚠️ Этот handler НЕ обрабатывает cycleDay — для него есть отдельный debounced handler выше
            useEffect(() => {
              // Источники которые НЕ требуют ре-рендера App:
              // - cloud/merge: данные из облака, UI обновляется отдельно
              // - *-step: локальные модалки, данные уже применены через setDay в DayTab
              // - cycle-*: обрабатываются отдельным debounced handler'ом (calendarVer)
              const IGNORED_SOURCES = [
                'cloud', 'merge', 'step-modal',
                'deficit-step', 'household-step', 'training-step', 'steps-step',
                'measurements-step', 'cold-exposure-step',
                'cycle-auto', 'cycle-clear', 'cycle-save', 'cycle-step'
              ];
              
              const handleDayUpdate = (e) => {
                const source = e.detail?.source;
                const field = e.detail?.field;
                
                // 🔒 Игнорируем cycleDay изменения — для них есть отдельный debounced handler
                if (field === 'cycleDay') return;
                
                // 🔒 Игнорируем локальные источники — данные уже применены через setDay
                // Это предотвращает мерцание UI при редактировании
                if (source && IGNORED_SOURCES.includes(source)) {
                  return;
                }
                
                // 🔒 Пропускаем setSyncVer при первом sync — UI уже показывает актуальные данные
                if (!initialSyncDoneRef.current) return;
                
                setSyncVer((v) => v + 1);
              };

              window.addEventListener('heys:day-updated', handleDayUpdate);
              return () => window.removeEventListener('heys:day-updated', handleDayUpdate);
            }, []);

            // Обертка для сохранения данных клиента в облако
            // ВАЖНО: Поддерживает ДВА формата вызова:
            //   - saveClientKey(key, value) — старый формат, 2 аргумента
            //   - saveClientKey(clientId, key, value) — новый формат, 3 аргумента (из Store.set)
            window.HEYS = window.HEYS || {};
            window.HEYS.saveClientKey = function (...args) {
              if (cloud && typeof cloud.saveClientKey === 'function') {
                if (args.length === 3) {
                  // Новый формат: (clientId, key, value)
                  const [cid, k, v] = args;
                  cloud.saveClientKey(cid, k, v);
                } else if (args.length === 2) {
                  // Старый формат: (key, value) — используем clientId из замыкания
                  const [k, v] = args;
                  if (clientId) {
                    cloud.saveClientKey(clientId, k, v);
                  }
                }
              }
            };
            useEffect(() => {
              window.HEYS = window.HEYS || {};
              window.HEYS.backupManager = window.HEYS.backupManager || {};
              window.HEYS.backupManager.backupAll = backupAllKeys;
              window.HEYS.backupManager.restore = restoreFromBackup;
              window.HEYS.backupManager.getLastBackupMeta = () => backupMeta;
            }, [backupAllKeys, restoreFromBackup, backupMeta]);
            // overlay (no early return, to keep hooks order stable)
            // После входа — загрузить клиентов куратора (без автовыбора)
            useEffect(() => {
              if (cloudUser && cloudUser.id) {
                fetchClientsFromCloud(cloudUser.id)
                  .then((result) => {
                    if (result.data && result.data.length > 0) {
                      setClients(result.data);
                    }
                    // Не автовыбираем клиента — куратор должен выбрать сам через модалку
                  })
                  .catch((err) => {
                    console.warn('[HEYS] Failed to fetch clients:', err?.message || err);
                    // Пробуем использовать локальный список клиентов
                    const localClients = U.lsGet('heys_clients_cache', []);
                    if (localClients.length > 0) {
                      setClients(localClients);
                    }
                  });
              }
            }, [cloudUser]);

            // Подписка на событие обновления списка клиентов (из profile wizard)
            useEffect(() => {
              const handleClientsUpdated = (e) => {
                if (e.detail && e.detail.clients) {
                  console.log('[HEYS] Clients updated from:', e.detail.source);
                  setClients(e.detail.clients);
                }
              };
              window.addEventListener('heys:clients-updated', handleClientsUpdated);
              return () => window.removeEventListener('heys:clients-updated', handleClientsUpdated);
            }, [setClients]);

            // Создать тестовых клиентов
            async function createTestClients() {
              if (!cloud.client || !cloudUser || !cloudUser.id) return;
              const userId = cloudUser.id; // Сохраняем локально
              const testClients = [{ name: 'Иван Петров' }, { name: 'Анна Сидорова' }];

              for (const testClient of testClients) {
                try {
                  await cloud.client
                    .from('clients')
                    .insert([{ name: testClient.name, curator_id: userId }]);
                } catch (error) {
                  console.error('Ошибка создания тестового клиента:', error);
                }
              }

              // Обновить список клиентов
              const result = await fetchClientsFromCloud(userId);
              setClients(result.data);
            }

            function formatBackupTime(meta) {
              if (!meta || !meta.timestamp) return '—';
              try {
                return new Date(meta.timestamp).toLocaleString('ru-RU', { hour12: false });
              } catch (error) {
                return meta.timestamp;
              }
            }

            async function handleManualBackup() {
              if (!clientId) {
                alert('Сначала выберите клиента');
                return;
              }
              if (backupBusy) return;
              setBackupBusy(true);
              try {
                await backupAllKeys({ reason: 'manual' });
              } finally {
                setBackupBusy(false);
              }
            }

            async function handleExportBackup() {
              if (!clientId) {
                alert('Сначала выберите клиента');
                return;
              }
              if (backupBusy) return;
              setBackupBusy(true);
              try {
                const result = await backupAllKeys({
                  reason: 'manual-export',
                  triggerDownload: true,
                  includeDays: true,
                  silent: true,
                });
                alert(
                  result && result.processed
                    ? `Файл бэкапа скачан (${result.processed} разделов)`
                    : 'Нет данных для экспорта',
                );
              } finally {
                setBackupBusy(false);
              }
            }

            function handleRestoreProducts() {
              if (!clientId) {
                alert('Сначала выберите клиента');
                return;
              }
              if (!confirm('Восстановить список продуктов из последнего бэкапа?')) return;
              const result = restoreFromBackup('heys_products', { silent: true });
              alert(result && result.ok ? 'Продукты восстановлены.' : 'Не найден бэкап продуктов.');
            }

            function handleRestoreAll() {
              if (!clientId) {
                alert('Сначала выберите клиента');
                return;
              }
              if (!confirm('Восстановить все доступные данные из бэкапа?')) return;
              const result = restoreFromBackup('all', { silent: true });
              alert(
                result && result.ok
                  ? `Восстановлено разделов: ${result.restored}`
                  : 'Не найдено подходящих бэкапов.',
              );
            }

            // Login form state (нужно до gate!)
            // DEV: дефолтные данные для тестирования — убрать перед продакшеном!
            const [email, setEmail] = useState('poplanton@mail.ru');
            const [pwd, setPwd] = useState('007670');
            const [rememberMe, setRememberMe] = useState(() => {
              // Восстанавливаем checkbox из localStorage
              return localStorage.getItem('heys_remember_me') === 'true';
            });
            const handleSignIn = useCallback(() => {
              return cloudSignIn(email, pwd, { rememberMe });
            }, [cloudSignIn, email, pwd, rememberMe]);
            const handleSignOut = cloudSignOut;
            const [clientSearch, setClientSearch] = useState(''); // Поиск клиентов
            const [showClientDropdown, setShowClientDropdown] = useState(false); // Dropdown в шапке
            
            // Morning Check-in — показываем ПОСЛЕ синхронизации, если нет веса за сегодня
            // ВАЖНО: НЕ проверяем сразу при смене clientId! Ждём ТОЛЬКО heysSyncCompleted,
            // потому что данные нового клиента загружаются асинхронно в switchClient
            const [showMorningCheckin, setShowMorningCheckin] = useState(false);
            
            // Ref для актуального clientId (избегаем проблемы closure)
            const clientIdRef = React.useRef(clientId);
            React.useEffect(() => { clientIdRef.current = clientId; }, [clientId]);
            
            // 🔄 Sync Settling — ОТКЛЮЧЕНО
            // Скелетон при sync вызывал "моргание" — появление/исчезновение overlay хуже чем ререндер контента
            // Пусть контент обновляется на месте — это менее заметно для глаза
            
            // Проверяем ТОЛЬКО после события heysSyncCompleted (когда данные точно загружены)
            useEffect(() => {
              // Слушаем событие завершения синхронизации
              const handleSyncCompleted = (e) => {
                const eventClientId = e?.detail?.clientId;
                const currentClientId = clientIdRef.current;
                
                // console.log('[App] 🌅 heysSyncCompleted', { eventClientId, currentClientId, isInitializing });
                
                // Пропускаем если нет clientId в событии
                if (!eventClientId) {
                  // console.log('[App] 🌅 MorningCheckin skip: no eventClientId');
                  return;
                }
                
                // Небольшая задержка чтобы:
                // 1. React state (setClientId) успел обновиться
                // 2. localStorage точно содержит данные нового клиента
                setTimeout(() => {
                  if (isInitializing) return;
                  
                  // Проверяем что clientId из события совпадает с текущим в localStorage
                  // (React state может ещё не обновиться, но localStorage уже правильный)
                  const lsClientId = HEYS.utils?.getCurrentClientId?.() || '';
                  if (eventClientId !== lsClientId) {
                    // console.log('[App] 🌅 MorningCheckin skip: eventClientId !== localStorage clientId', { eventClientId, lsClientId });
                    return;
                  }
                  
                  if (HEYS.shouldShowMorningCheckin) {
                    const shouldShow = HEYS.shouldShowMorningCheckin();
                    // console.log('[App] 🌅 MorningCheckin check | shouldShow:', shouldShow);
                    // 🔒 Не обновляем если значение то же (предотвращает ре-рендер)
                    setShowMorningCheckin(prev => prev === shouldShow ? prev : shouldShow);
                  }
                }, 200);
              };
              
              window.addEventListener('heysSyncCompleted', handleSyncCompleted);
              return () => window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
            }, [isInitializing]); // clientId убран из зависимостей — используем ref

            // Закрытие dropdown по Escape
            useEffect(() => {
              const handleEscape = (e) => {
                if (e.key === 'Escape' && showClientDropdown) {
                  setShowClientDropdown(false);
                }
              };
              if (showClientDropdown) {
                document.addEventListener('keydown', handleEscape);
                return () => document.removeEventListener('keydown', handleEscape);
              }
            }, [showClientDropdown]);

            // Получаем инициалы клиента для аватара
            const getClientInitials = (name) => {
              if (!name) return '?';
              const parts = name.trim().split(' ');
              if (parts.length >= 2) {
                return (parts[0][0] + parts[1][0]).toUpperCase();
              }
              return name.slice(0, 2).toUpperCase();
            };

            // Цветные аватары по первой букве имени
            const AVATAR_COLORS = [
              'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // А, К, Ф — фиолетовый
              'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', // Б, Л, Х — розовый
              'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', // В, М, Ц — голубой
              'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', // Г, Н, Ч — зелёный
              'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', // Д, О, Ш — оранжевый
              'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', // Е, П, Щ — мятный
              'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', // Ж, Р, Ы — персиковый
              'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', // З, С, Э — кремовый
              'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)', // И, Т, Ю — светло-синий
              'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)', // Й, У, Я — лаймовый
            ];
            
            const getAvatarColor = (name) => {
              if (!name) return AVATAR_COLORS[0];
              const firstChar = name.trim()[0]?.toUpperCase() || 'А';
              const code = firstChar.charCodeAt(0);
              let index = 0;
              if (code >= 1040 && code <= 1071) { // Русский
                index = (code - 1040) % AVATAR_COLORS.length;
              } else if (code >= 65 && code <= 90) { // Английский
                index = (code - 65) % AVATAR_COLORS.length;
              } else {
                index = code % AVATAR_COLORS.length;
              }
              return AVATAR_COLORS[index];
            };

            // Получаем статистику клиента (последний визит, streak)
            const getClientStats = (cId) => {
              try {
                const today = new Date();
                let lastActiveDate = null;
                let streak = 0;
                
                for (let i = 0; i < 30; i++) {
                  const d = new Date(today);
                  d.setDate(d.getDate() - i);
                  const key = `heys_dayv2_${d.toISOString().slice(0, 10)}`;
                  const fullKey = `${cId}_${key}`;
                  const data = localStorage.getItem(fullKey);
                  if (data) {
                    try {
                      const parsed = JSON.parse(data);
                      if (parsed && parsed.meals && parsed.meals.length > 0) {
                        if (!lastActiveDate) lastActiveDate = d;
                        if (i === streak) streak++;
                      } else if (streak > 0) break;
                    } catch (e) {}
                  } else if (streak > 0) break;
                }
                
                return { lastActiveDate, streak };
              } catch (e) {
                return { lastActiveDate: null, streak: 0 };
              }
            };

            // Форматируем "последний визит"
            const formatLastActive = (date) => {
              if (!date) return '';
              const now = new Date();
              const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
              if (diff === 0) return 'Сегодня';
              if (diff === 1) return 'Вчера';
              if (diff < 7) return `${diff} дн. назад`;
              return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            };

            const gate = !clientId
              ? (isInitializing
                  // Красивый полноэкранный лоадер
                  ? React.createElement(AppLoader, { 
                      message: 'Загрузка...', 
                      subtitle: 'Подключение к серверу' 
                    })
                  // Если не залогинен — показать красивую форму входа
                  : !cloudUser
                    ? React.createElement(
                        'div',
                        { className: 'modal-backdrop', style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' } },
                        React.createElement(
                          'div',
                          { 
                            className: 'modal login-modal', 
                            style: { 
                              maxWidth: 360, 
                              padding: '32px 28px',
                              borderRadius: 20,
                              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                            } 
                          },
                          // Логотип
                          React.createElement('div', { 
                            style: { 
                              textAlign: 'center', 
                              marginBottom: 24 
                            } 
                          },
                            React.createElement('div', { 
                              style: { 
                                fontSize: 48, 
                                marginBottom: 8,
                                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                              } 
                            }, '🍎'),
                            React.createElement('div', { 
                              style: { 
                                fontSize: 28, 
                                fontWeight: 700, 
                                color: 'var(--text)',
                                letterSpacing: '-0.5px'
                              } 
                            }, 'HEYS'),
                            React.createElement('div', { 
                              style: { 
                                fontSize: 14, 
                                color: 'var(--muted)',
                                marginTop: 4
                              } 
                            }, 'Умный дневник питания')
                          ),
                          // Email поле
                          React.createElement('div', { style: { marginBottom: 12 } },
                            React.createElement('input', {
                              type: 'email',
                              placeholder: '📧  Email',
                              value: email,
                              onChange: (e) => { setEmail(e.target.value); setLoginError(''); },
                              onKeyDown: (e) => e.key === 'Enter' && handleSignIn(),
                              style: { 
                                width: '100%', 
                                padding: '14px 16px', 
                                borderRadius: 12, 
                                border: '2px solid var(--border)', 
                                fontSize: 16,
                                transition: 'border-color 0.2s, box-shadow 0.2s',
                                outline: 'none'
                              }
                            })
                          ),
                          // Пароль поле
                          React.createElement('div', { style: { marginBottom: 16 } },
                            React.createElement('input', {
                              type: 'password',
                              placeholder: '🔒  Пароль',
                              value: pwd,
                              onChange: (e) => { setPwd(e.target.value); setLoginError(''); },
                              onKeyDown: (e) => e.key === 'Enter' && handleSignIn(),
                              style: { 
                                width: '100%', 
                                padding: '14px 16px', 
                                borderRadius: 12, 
                                border: '2px solid var(--border)', 
                                fontSize: 16,
                                transition: 'border-color 0.2s, box-shadow 0.2s',
                                outline: 'none'
                              }
                            })
                          ),
                          // TODO: Checkbox "Запомнить меня" — временно скрыт, так как Supabase всегда сохраняет сессию
                          // React.createElement('label', { 
                          //   style: { 
                          //     display: 'flex', 
                          //     alignItems: 'center', 
                          //     gap: 8, 
                          //     marginBottom: 20,
                          //     cursor: 'pointer',
                          //     fontSize: 14,
                          //     color: 'var(--muted)'
                          //   } 
                          // },
                          //   React.createElement('input', {
                          //     type: 'checkbox',
                          //     checked: rememberMe,
                          //     onChange: (e) => setRememberMe(e.target.checked),
                          //     style: { 
                          //       width: 18, 
                          //       height: 18, 
                          //       accentColor: '#667eea',
                          //       cursor: 'pointer'
                          //     }
                          //   }),
                          //   'Запомнить меня'
                          // ),
                          // Ошибка входа
                          loginError && React.createElement('div', { 
                            style: { 
                              padding: '10px 14px', 
                              marginBottom: 16, 
                              background: '#fee2e2', 
                              color: '#dc2626', 
                              borderRadius: 10,
                              fontSize: 14,
                              textAlign: 'center'
                            } 
                          }, loginError),
                          // Кнопка входа
                          React.createElement(
                            'button',
                            { 
                              className: 'btn acc', 
                              onClick: handleSignIn,
                              style: { 
                                width: '100%', 
                                padding: '14px', 
                                fontSize: 16,
                                fontWeight: 600,
                                borderRadius: 12,
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                border: 'none',
                                color: '#fff',
                                cursor: status === 'signin' ? 'wait' : 'pointer',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                                boxShadow: '0 4px 14px rgba(102, 126, 234, 0.4)'
                              },
                              disabled: status === 'signin'
                            },
                            status === 'signin' 
                              ? React.createElement('span', null, '⏳ Вход...')
                              : React.createElement('span', null, 'Войти →')
                          ),
                          // Подсказка
                          React.createElement(
                            'div',
                            { style: { marginTop: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 } },
                            !navigator.onLine
                              ? '📡 Нет подключения к сети'
                              : (() => {
                                  const hour = new Date().getHours();
                                  if (hour >= 5 && hour < 12) return '🌅 Доброе утро!';
                                  if (hour >= 12 && hour < 18) return '☀️ Добрый день!';
                                  if (hour >= 18 && hour < 23) return '🌆 Добрый вечер!';
                                  return '🌙 Доброй ночи!';
                                })()
                          )
                        )
                      )
                    // Модалка выбора клиента (только после логина)
                  : React.createElement(
                  'div',
                  { className: 'modal-backdrop', style: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' } },
                  React.createElement(
                    'div',
                    { 
                      className: 'modal client-select-modal', 
                      style: { 
                        maxWidth: 420,
                        padding: '28px 24px',
                        borderRadius: 20,
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                      } 
                    },
                          React.createElement(
                          React.Fragment,
                          null,
                          // Заголовок
                          React.createElement(
                            'div',
                            { style: { textAlign: 'center', marginBottom: 20 } },
                            React.createElement('div', { 
                              style: { fontSize: 32, marginBottom: 8 } 
                            }, '👥'),
                            React.createElement(
                              'div',
                              { style: { fontSize: 20, fontWeight: 700, color: 'var(--text)' } },
                              'Выберите клиента'
                            ),
                            React.createElement(
                              'div',
                              { style: { fontSize: 14, color: 'var(--muted)', marginTop: 4 } },
                              clientsSource === 'loading' 
                                ? '⏳ Загрузка...'
                                : clientsSource === 'error'
                                  ? '⚠️ Ошибка загрузки'
                                  : clientsSource === 'cache'
                                    ? `${clients.length} клиентов (из кэша)`
                                    : clients.length 
                                      ? `${clients.length} клиентов` 
                                      : 'Пока нет клиентов'
                            ),
                            // Предупреждение если из кэша
                            clientsSource === 'cache' && React.createElement(
                              'div',
                              { 
                                style: { 
                                  fontSize: 12, 
                                  color: '#f59e0b', 
                                  marginTop: 8,
                                  padding: '6px 12px',
                                  background: 'rgba(245, 158, 11, 0.1)',
                                  borderRadius: 8
                                } 
                              },
                              '☁️ Синхронизация с облаком...'
                            ),
                            clientsSource === 'error' && React.createElement(
                              'div',
                              { 
                                style: { 
                                  fontSize: 12, 
                                  color: '#ef4444', 
                                  marginTop: 8,
                                  padding: '6px 12px',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  borderRadius: 8
                                } 
                              },
                              '❌ Не удалось загрузить клиентов из облака'
                            )
                          ),
                          // Поиск клиентов (если > 3)
                          clients.length > 3 && React.createElement('div', { 
                            style: { position: 'relative', marginBottom: 16 } 
                          },
                            React.createElement('span', { 
                              style: { 
                                position: 'absolute', 
                                left: 14, 
                                top: '50%', 
                                transform: 'translateY(-50%)',
                                fontSize: 16,
                                opacity: 0.5
                              } 
                            }, '🔍'),
                            React.createElement('input', {
                              type: 'text',
                              placeholder: 'Поиск клиента...',
                              value: clientSearch || '',
                              onChange: (e) => setClientSearch(e.target.value),
                              style: { 
                                width: '100%', 
                                padding: '12px 12px 12px 42px', 
                                borderRadius: 12, 
                                border: '2px solid var(--border)', 
                                fontSize: 15,
                                outline: 'none'
                              }
                            })
                          ),
                          // Список клиентов
                          React.createElement(
                            'div',
                            { 
                              style: { 
                                maxHeight: 320, 
                                overflow: 'auto', 
                                marginBottom: 16,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8
                              } 
                            },
                            clients.length
                              ? clients
                                  .filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                                  .map((c, idx) => {
                                    const stats = getClientStats(c.id);
                                    const isLast = localStorage.getItem('heys_last_client_id') === c.id;
                                    return React.createElement(
                                    'div',
                                    {
                                      key: c.id,
                                      className: 'client-card',
                                      style: { 
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: '12px 14px',
                                        borderRadius: 14,
                                        background: 'var(--card)',
                                        border: isLast ? '2px solid #667eea' : '2px solid var(--border)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        animation: `fadeSlideIn 0.3s ease ${idx * 0.05}s both`
                                      },
                                      onClick: async () => {
                                        // Безопасное переключение с синхронизацией
                                        if (HEYS.cloud && HEYS.cloud.switchClient) {
                                          await HEYS.cloud.switchClient(c.id);
                                        } else {
                                          U.lsSet('heys_client_current', c.id);
                                        }
                                        // Сохраняем как последнего выбранного
                                        localStorage.setItem('heys_last_client_id', c.id);
                                        setClientId(c.id);
                                      }
                                    },
                                    // Аватар с цветом по букве
                                    React.createElement(
                                      'div',
                                      { 
                                        style: { 
                                          width: 48, 
                                          height: 48, 
                                          borderRadius: '50%',
                                          background: getAvatarColor(c.name),
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          color: '#fff',
                                          fontWeight: 700,
                                          fontSize: 18,
                                          flexShrink: 0,
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                                        } 
                                      },
                                      getClientInitials(c.name)
                                    ),
                                    // Инфо + статистика
                                    React.createElement(
                                      'div',
                                      { style: { flex: 1, minWidth: 0 } },
                                      React.createElement(
                                        'div',
                                        { style: { fontWeight: 600, fontSize: 15, color: 'var(--text)' } },
                                        c.name
                                      ),
                                      React.createElement(
                                        'div', 
                                        { style: { fontSize: 12, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' } },
                                        // Последний визит
                                        stats.lastActiveDate && React.createElement('span', null, 
                                          '📅 ' + formatLastActive(stats.lastActiveDate)
                                        ),
                                        // Streak
                                        stats.streak > 0 && React.createElement('span', { 
                                          style: { color: stats.streak >= 3 ? '#22c55e' : 'var(--muted)' } 
                                        }, 
                                          '🔥 ' + stats.streak + ' дн.'
                                        ),
                                        // Метка "Последний"
                                        isLast && React.createElement('span', { 
                                          style: { color: '#667eea', fontWeight: 500 } 
                                        }, '✓')
                                      )
                                    ),
                                    // Кнопки действий
                                    React.createElement(
                                      'div',
                                      { 
                                        style: { display: 'flex', gap: 4 },
                                        onClick: (e) => e.stopPropagation() // Не срабатывать на родителе
                                      },
                                      React.createElement(
                                        'button',
                                        {
                                          className: 'btn-icon',
                                          title: 'Переименовать',
                                          onClick: () => {
                                            const nm = prompt('Новое имя', c.name) || c.name;
                                            renameClient(c.id, nm);
                                          },
                                          style: {
                                            width: 32,
                                            height: 32,
                                            borderRadius: 8,
                                            border: 'none',
                                            background: 'var(--border)',
                                            cursor: 'pointer',
                                            fontSize: 14,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                          }
                                        },
                                        '✏️'
                                      ),
                                      React.createElement(
                                        'button',
                                        {
                                          className: 'btn-icon',
                                          title: 'Удалить',
                                          onClick: () => {
                                            if (confirm(`Удалить клиента "${c.name}"?`)) removeClient(c.id);
                                          },
                                          style: {
                                            width: 32,
                                            height: 32,
                                            borderRadius: 8,
                                            border: 'none',
                                            background: '#fee2e2',
                                            cursor: 'pointer',
                                            fontSize: 14,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                          }
                                        },
                                        '🗑️'
                                      )
                                    )
                                  );
                                  })
                              : React.createElement(
                                  'div',
                                  { 
                                    style: { 
                                      textAlign: 'center', 
                                      padding: '40px 20px',
                                      color: 'var(--muted)'
                                    } 
                                  },
                                  React.createElement('div', { style: { fontSize: 48, marginBottom: 12 } }, '📋'),
                                  React.createElement('div', { style: { fontSize: 15 } }, 'Пока нет клиентов'),
                                  React.createElement('div', { style: { fontSize: 13, marginTop: 4 } }, 'Создайте первого клиента ниже')
                                ),
                          ),
                          // Разделитель
                          React.createElement('div', { 
                            style: { 
                              height: 1, 
                              background: 'var(--border)', 
                              margin: '16px 0' 
                            } 
                          }),
                          // Создание нового клиента
                          React.createElement(
                            'div',
                            { style: { display: 'flex', gap: 10 } },
                            React.createElement('input', {
                              placeholder: '+ Новый клиент...',
                              value: newName,
                              onChange: (e) => setNewName(e.target.value),
                              onKeyDown: (e) => e.key === 'Enter' && newName.trim() && addClientToCloud(newName),
                              style: { 
                                flex: 1,
                                padding: '12px 14px',
                                borderRadius: 12,
                                border: '2px solid var(--border)',
                                fontSize: 15,
                                outline: 'none'
                              }
                            }),
                            React.createElement(
                              'button',
                              { 
                                className: 'btn acc', 
                                onClick: () => addClientToCloud(newName),
                                disabled: !newName.trim(),
                                style: {
                                  padding: '12px 20px',
                                  borderRadius: 12,
                                  background: newName.trim() 
                                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                                    : 'var(--border)',
                                  border: 'none',
                                  color: newName.trim() ? '#fff' : 'var(--muted)',
                                  fontWeight: 600,
                                  cursor: newName.trim() ? 'pointer' : 'not-allowed',
                                  transition: 'all 0.2s'
                                }
                              },
                              'Создать'
                            )
                          ),
                          // Выход
                          React.createElement(
                            'button',
                            { 
                              onClick: handleSignOut,
                              style: {
                                width: '100%',
                                marginTop: 16,
                                padding: '10px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--muted)',
                                fontSize: 14,
                                cursor: 'pointer'
                              }
                            },
                            '← Выйти из аккаунта'
                          )
                        ), // ← Закрываем React.Fragment
                  ) // ← Закрываем modal
                )) // ← Закрываем modal-backdrop и тернарный isInitializing
              : null;

            useEffect(() => {
              // Минимальная инициализация — только загрузка из localStorage
              const initLocalData = () => {
                // Загружаем продукты из localStorage
                const storedProducts = U.lsGet('heys_products', []);
                if (Array.isArray(storedProducts)) {
                  setProducts(storedProducts);
                }

                // Загружаем клиентов из localStorage (без создания тестовых!)
                const storedClients = U.lsGet('heys_clients', []);
                if (Array.isArray(storedClients) && storedClients.length > 0) {
                  // Фильтруем тестовых клиентов
                  const realClients = storedClients.filter(c => !c.id?.startsWith('local-user'));
                  if (realClients.length > 0) {
                    setClients(realClients);
                    setClientsSource('cache'); // Помечаем что это из кэша
                  }
                }

                // Проверяем есть ли сохраненный клиент
                const currentClient = U.lsGet('heys_client_current');
                const storedClientsArray = U.lsGet('heys_clients', []);
                if (currentClient && storedClientsArray.some((c) => c.id === currentClient)) {
                  setClientId(currentClient);
                  window.HEYS = window.HEYS || {};
                  window.HEYS.currentClientId = currentClient;
                }

                setSyncVer((v) => v + 1);
              };

              // Проверка сети
              if (!navigator.onLine) {
                // Нет сети — загружаем локальные данные и показываем предупреждение
                initLocalData();
                setIsInitializing(false);
                setStatus('offline');
                // Показываем alert только если нет сохранённых данных
                if (!U.lsGet('heys_client_current')) {
                  setTimeout(() => {
                    alert('Нет подключения к интернету. Для первого входа нужна сеть.');
                  }, 100);
                }
                return;
              }

              // Есть сеть — проверяем "Запомнить меня"
              const shouldRemember = localStorage.getItem('heys_remember_me') === 'true';
              const savedEmail = localStorage.getItem('heys_saved_email');
              
              if (shouldRemember && savedEmail) {
                // Пробуем восстановить сессию Supabase
                setEmail(savedEmail);
                initLocalData();
                
                // Supabase автоматически восстанавливает сессию из localStorage
                if (cloud && cloud.client && cloud.client.auth) {
                  cloud.client.auth.getSession().then(async ({ data }) => {
                    const session = data?.session;
                    const sessionUser = session?.user;
                    
                    // Проверяем что сессия существует и не истекла
                    if (sessionUser && session.expires_at) {
                      const expiresAt = session.expires_at * 1000; // в миллисекундах
                      const now = Date.now();
                      const bufferMs = 60 * 1000; // 1 минута буфер
                      
                      if (expiresAt > now + bufferMs) {
                        // Сессия валидна — делаем тестовый запрос чтобы убедиться
                        try {
                          const { error: testError } = await cloud.client.from('clients').select('id').limit(1);
                          if (!testError) {
                            // Всё OK — используем сессию
                            setCloudUser(sessionUser);
                            setStatus('online');
                            console.log('[HEYS] ✅ Сессия восстановлена:', sessionUser.email);
                          } else {
                            // Ошибка — сессия невалидна, показываем форму входа
                            console.log('[HEYS] ⚠️ Сессия невалидна (test failed), требуется вход');
                            cloud.signOut();
                          }
                        } catch (e) {
                          console.log('[HEYS] ⚠️ Сессия невалидна (exception), требуется вход');
                          cloud.signOut();
                        }
                      } else {
                        // Сессия истекла — показываем форму входа
                        console.log('[HEYS] ⚠️ Сессия истекла, требуется вход');
                        cloud.signOut();
                      }
                    }
                    setIsInitializing(false);
                  }).catch(() => {
                    setIsInitializing(false);
                  });
                } else {
                  setIsInitializing(false);
                }
              } else {
                // Нет "Запомнить меня" — показываем форму входа
                if (cloud && cloud.signOut) {
                  cloud.signOut();
                }
                initLocalData();
                setIsInitializing(false);
              }
            }, []);

            // Обновление products при смене clientId (без bootstrap — его делают wrapper'ы)
            useEffect(() => {
              if (clientId) {
                const loadedProducts = Array.isArray(window.HEYS.utils.lsGet('heys_products', []))
                  ? window.HEYS.utils.lsGet('heys_products', [])
                  : [];
                setProducts(loadedProducts);
                setSyncVer((v) => v + 1);
              }
            }, [clientId]);

            // Загрузка клиентов из облака при получении cloudUser
            useEffect(() => {
              if (cloudUser && cloudUser.id && clientsSource === 'cache') {
                // Есть юзер и клиенты из кэша — обновляем из облака
                fetchClientsFromCloud(cloudUser.id).then(result => {
                  if (result.data && result.data.length > 0) {
                    setClients(result.data);
                  }
                }).catch(e => {
                  console.error('[HEYS] Ошибка обновления клиентов из облака:', e);
                });
              }
            }, [cloudUser, clientsSource, fetchClientsFromCloud, setClients]);

            // debounced save products
            const saveTimerRef = React.useRef(null);
            useEffect(() => {
              if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
              saveTimerRef.current = setTimeout(() => {
                try {
                  window.HEYS.saveClientKey('heys_products', products);
                } catch (e) {
                  console.error('Error saving products:', e);
                }
              }, 300);
              return () => {
                if (saveTimerRef.current) {
                  clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = null;
                }
              };
            }, [products]);

            // auto sign-in in single-curator mode
            // ВАЖНО: НЕ включаем handleSignIn в зависимости — это вызовет бесконечный цикл!
            // handleSignIn пересоздаётся при изменении email/pwd, что триггерит useEffect снова.
            const hasTriedAutoSignInRef = React.useRef(false);
            useEffect(() => {
              // Пытаемся залогиниться только ОДИН раз при старте
              // И только если НЕТ активной сессии (чтобы не конфликтовать с восстановлением)
              if (ONE_CURATOR_MODE && status !== 'online' && !hasTriedAutoSignInRef.current) {
                hasTriedAutoSignInRef.current = true;
                
                // Проверяем, нет ли уже активной сессии
                const cloud = window.HEYS?.cloud;
                if (cloud?.client?.auth?.getSession) {
                  cloud.client.auth.getSession().then(({ data }) => {
                    if (data?.session?.user) {
                      // Сессия уже есть — не делаем signIn
                      // console.log('[App] Session already exists, skipping auto signIn');
                    } else {
                      // Сессии нет — делаем signIn
                      handleSignIn();
                    }
                  }).catch(() => {
                    // Ошибка getSession — пробуем signIn
                    handleSignIn();
                  });
                } else {
                  handleSignIn();
                }
              }
              // Сбрасываем флаг если вышли из аккаунта (status изменился на offline)
              if (status === 'offline') {
                hasTriedAutoSignInRef.current = false;
              }
              // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [ONE_CURATOR_MODE, status]); // handleSignIn исключён намеренно!
            
            // Формируем текст для pending details
            const getPendingText = () => {
              const parts = [];
              if (pendingDetails.days > 0) parts.push(`${pendingDetails.days} дн.`);
              if (pendingDetails.products > 0) parts.push(`${pendingDetails.products} прод.`);
              if (pendingDetails.profile > 0) parts.push('профиль');
              if (pendingDetails.other > 0) parts.push(`${pendingDetails.other} др.`);
              return parts.length > 0 ? parts.join(', ') : '';
            };

            const currentClientName = Array.isArray(clients) 
              ? (clients.find((c) => c.id === clientId)?.name || 'Выберите клиента')
              : 'Выберите клиента';
            
            // Morning Check-in блокирует основной контент (показывается ДО загрузки)
            const isMorningCheckinBlocking = showMorningCheckin === true && HEYS.MorningCheckin;

            return React.createElement(
              React.Fragment,
              null,
              gate,
              // === MORNING CHECK-IN (вес, сон, шаги — показывается ВМЕСТО контента) ===
              isMorningCheckinBlocking && React.createElement(HEYS.MorningCheckin, {
                onComplete: (data) => {
                  // console.log('[App] 🎉 MorningCheckin onComplete вызван');
                  // НЕ инкрементим syncVer — данные обновляются через событие 'heys:day-updated'
                  // Это предотвращает пересоздание DayTab и показ скелетонов
                  // console.log('[App] 👁️ Скрываю MorningCheckin');
                  setShowMorningCheckin(false);
                }
              }),
              // === OFFLINE BANNER (показывается 3 сек при потере сети) ===
              !isMorningCheckinBlocking && showOfflineBanner && React.createElement(
                'div',
                { className: 'offline-banner' },
                React.createElement('span', { className: 'offline-banner-icon' }, '📡'),
                React.createElement('span', { className: 'offline-banner-text' }, 
                  'Нет сети — данные сохраняются локально'
                )
              ),
              // === ONLINE BANNER (показывается 2 сек при восстановлении сети) ===
              !isMorningCheckinBlocking && showOnlineBanner && React.createElement(
                'div',
                { className: 'online-banner' },
                React.createElement('span', { className: 'online-banner-icon' }, '✓'),
                React.createElement('span', { className: 'online-banner-text' }, 
                  pendingCount > 0 ? 'Сеть восстановлена — синхронизация...' : 'Сеть восстановлена'
                )
              ),
              // Toast убран — отвлекает
              // Основной контент — скрыт во время Morning Check-in или когда показывается gate (login/client select)
              React.createElement(
                'div',
                { 
                  className: 'wrap',
                  style: (isMorningCheckinBlocking || !clientId) ? { display: 'none' } : undefined
                },
                React.createElement(
                  'div',
                  { className: 'hdr' },
                  // === ВЕРХНЯЯ ЛИНИЯ: Gamification Bar ===
                  React.createElement(
                    'div',
                    { className: 'hdr-top hdr-gamification' },
                    // Live GamificationBar component
                    React.createElement(GamificationBar)
                  ),
                  // === НИЖНЯЯ ЛИНИЯ: Клиент + Действия ===
                  clientId
                    ? React.createElement(
                        'div',
                        { className: 'hdr-bottom' },
                        // Информация о клиенте + DatePicker
                        React.createElement(
                          'div',
                          { className: 'hdr-client', style: { position: 'relative' } },
                          // Кликабельный блок для dropdown
                          React.createElement(
                            'div',
                            {
                              className: 'hdr-client-clickable',
                              onClick: () => setShowClientDropdown(!showClientDropdown),
                              style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                cursor: 'pointer',
                                padding: '4px 8px 4px 4px',
                                borderRadius: 12,
                                transition: 'background 0.2s'
                              }
                            },
                            React.createElement(
                              'div',
                              {
                                className: 'hdr-client-avatar',
                                style: { background: getAvatarColor(currentClientName) }
                              },
                              getClientInitials(currentClientName)
                            ),
                            React.createElement(
                              'div',
                              { className: 'hdr-client-info' },
                              // Имя и фамилия в 2 строки из профиля
                              (() => {
                                const U = window.HEYS && window.HEYS.utils;
                                const profile = U && U.lsGet ? U.lsGet('heys_profile', {}) : {};
                                const firstName = profile.firstName || '';
                                const lastName = profile.lastName || '';
                                // Если профиль пустой — fallback на имя клиента
                                if (!firstName && !lastName) {
                                  const parts = currentClientName.split(' ');
                                  return [
                                    React.createElement('span', { key: 'fn', className: 'hdr-client-firstname' }, parts[0] || ''),
                                    parts[1] && React.createElement('span', { key: 'ln', className: 'hdr-client-lastname' }, parts.slice(1).join(' '))
                                  ];
                                }
                                return [
                                  React.createElement('span', { key: 'fn', className: 'hdr-client-firstname' }, firstName),
                                  lastName && React.createElement('span', { key: 'ln', className: 'hdr-client-lastname' }, lastName)
                                ];
                              })()
                            ),
                            // Стрелка dropdown
                            React.createElement('span', { 
                              style: { 
                                fontSize: 10, 
                                color: 'var(--muted)',
                                transition: 'transform 0.2s',
                                transform: showClientDropdown ? 'rotate(180deg)' : 'rotate(0)'
                              } 
                            }, '▼')
                          ),
                          // Dropdown список клиентов
                          showClientDropdown && React.createElement(
                            'div',
                            {
                              className: 'client-dropdown',
                              style: {
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: 8,
                                background: 'var(--card)',
                                borderRadius: 16,
                                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                                border: '1px solid var(--border)',
                                minWidth: 260,
                                maxHeight: 320,
                                overflow: 'auto',
                                zIndex: 1000,
                                animation: 'fadeSlideIn 0.2s ease'
                              }
                            },
                            // Заголовок
                            React.createElement('div', { 
                              style: { 
                                padding: '12px 16px 8px', 
                                fontSize: 12, 
                                color: 'var(--muted)',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                              } 
                            }, `Быстрый выбор (${clients.length})`),
                            // Список клиентов (сортировка: последний использованный сверху)
                            [...clients]
                              .sort((a, b) => {
                                const lastA = localStorage.getItem('heys_last_client_id') === a.id ? 1 : 0;
                                const lastB = localStorage.getItem('heys_last_client_id') === b.id ? 1 : 0;
                                if (lastA !== lastB) return lastB - lastA;
                                // Затем по активности (streak)
                                const statsA = getClientStats(a.id);
                                const statsB = getClientStats(b.id);
                                return (statsB.streak || 0) - (statsA.streak || 0);
                              })
                              .map((c) => 
                              React.createElement(
                                'div',
                                {
                                  key: c.id,
                                  className: 'client-dropdown-item' + (c.id === clientId ? ' active' : ''),
                                  style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 16px',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s',
                                    background: c.id === clientId ? 'rgba(102, 126, 234, 0.1)' : 'transparent'
                                  },
                                  onClick: async () => {
                                    if (c.id !== clientId) {
                                      if (HEYS.cloud && HEYS.cloud.switchClient) {
                                        await HEYS.cloud.switchClient(c.id);
                                      } else {
                                        U.lsSet('heys_client_current', c.id);
                                      }
                                      localStorage.setItem('heys_last_client_id', c.id);
                                      setClientId(c.id);
                                    }
                                    setShowClientDropdown(false);
                                  }
                                },
                                // Мини-аватар
                                React.createElement('div', { 
                                  style: { 
                                    width: 32, 
                                    height: 32, 
                                    borderRadius: '50%',
                                    background: getAvatarColor(c.name),
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontWeight: 600,
                                    fontSize: 12,
                                    flexShrink: 0
                                  } 
                                }, getClientInitials(c.name)),
                                // Имя
                                React.createElement('span', { 
                                  style: { 
                                    flex: 1,
                                    fontWeight: c.id === clientId ? 600 : 400,
                                    color: c.id === clientId ? '#667eea' : 'var(--text)'
                                  } 
                                }, c.name),
                                // Галочка для выбранного
                                c.id === clientId && React.createElement('span', { 
                                  style: { color: '#667eea' } 
                                }, '✓')
                              )
                            ),
                            // Разделитель
                            React.createElement('div', { 
                              style: { height: 1, background: 'var(--border)', margin: '8px 0' } 
                            }),
                            // Кнопка "Все клиенты"
                            React.createElement(
                              'div',
                              {
                                style: {
                                  padding: '10px 16px 12px',
                                  textAlign: 'center',
                                  color: '#667eea',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                  fontSize: 14
                                },
                                onClick: () => {
                                  localStorage.removeItem('heys_client_current');
                                  window.HEYS.currentClientId = null;
                                  setClientId('');
                                  setShowClientDropdown(false);
                                }
                              },
                              '👥 Все клиенты'
                            ),
                            // Кнопка Выход с email
                            React.createElement(
                              'div',
                              {
                                style: {
                                  padding: '8px 16px 12px',
                                  textAlign: 'center',
                                  cursor: 'pointer',
                                  fontSize: 13
                                },
                                onClick: () => {
                                  setShowClientDropdown(false);
                handleSignOut();
                                }
                              },
                              React.createElement('div', { 
                                style: { color: 'var(--muted)', fontSize: 11, marginBottom: 4 } 
                              }, cloudUser?.email || ''),
                              React.createElement('span', { 
                                style: { color: '#ef4444' } 
                              }, '🚪 Выйти')
                            )
                          ),
                          // Overlay для закрытия dropdown при клике вне
                          showClientDropdown && React.createElement('div', {
                            style: {
                              position: 'fixed',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              zIndex: 999
                            },
                            onClick: () => setShowClientDropdown(false)
                          }),
                          // Cloud sync indicator
                          React.createElement('div', {
                            key: 'cloud-' + cloudStatus, // Force re-render on status change
                            className: 'cloud-sync-indicator ' + cloudStatus,
                            title: (() => {
                              const routingMode = HEYS?.cloud?.getRoutingStatus?.()?.mode || 'unknown';
                              const modeLabel = routingMode === 'direct' ? '🔗 Direct' : routingMode === 'proxy' ? '🔀 Proxy' : '';
                              const baseTitle = cloudStatus === 'syncing' 
                                ? (syncProgress.total > 1 
                                    ? `Синхронизация... ${syncProgress.synced}/${syncProgress.total}`
                                    : 'Синхронизация...') 
                                : cloudStatus === 'synced' ? 'Сохранено в облако'
                                : cloudStatus === 'offline' 
                                  ? (pendingCount > 0 
                                      ? `Офлайн — ${pendingCount} изменений ожидают синхронизации`
                                      : 'Офлайн — данные сохраняются локально')
                                : cloudStatus === 'error' 
                                  ? (retryCountdown > 0 ? `Ошибка. Повтор через ${retryCountdown}с` : 'Ошибка синхронизации')
                                : 'Подключено к облаку';
                              return modeLabel ? `${baseTitle} (${modeLabel})` : baseTitle;
                            })(),
                            // Синее облако — сеть есть, зелёная галочка — синхронизировано
                            dangerouslySetInnerHTML: {
                              __html: cloudStatus === 'syncing' 
                                ? '<div class="sync-spinner"></div>' + (syncProgress.total > 1 ? '<span class="sync-progress">' + syncProgress.synced + '/' + syncProgress.total + '</span>' : '')
                                : cloudStatus === 'synced' 
                                ? '<span class="cloud-icon synced">✓</span>'
                                : cloudStatus === 'offline' 
                                ? '<svg class="cloud-icon offline" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2"/></svg>' + (pendingCount > 0 ? '<span class="pending-badge">' + pendingCount + '</span>' : '')
                                : cloudStatus === 'error' 
                                ? '<span class="cloud-icon error">⚠</span>' + (retryCountdown > 0 ? '<span class="retry-countdown">' + retryCountdown + '</span>' : '')
                                : '<svg class="cloud-icon idle" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>'
                            }
                          }),
                          // Кнопки "Вчера" + "Сегодня" + DatePicker
                          (tab === 'stats' || tab === 'diary' || tab === 'reports') && window.HEYS.DatePicker
                            ? React.createElement('div', { className: 'hdr-date-group' },
                                // Кнопка быстрого перехода на вчера
                                React.createElement('button', {
                                  className: 'yesterday-quick-btn' + (selectedDate === (() => {
                                    const d = new Date();
                                    if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                    d.setDate(d.getDate() - 1);
                                    // Локальное форматирование (не UTC!)
                                    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                                  })() ? ' active' : ''),
                                  onClick: () => {
                                    const d = new Date();
                                    if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                    d.setDate(d.getDate() - 1);
                                    // Локальное форматирование (не UTC!)
                                    setSelectedDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
                                  },
                                  title: 'Перейти на вчера'
                                }, (() => {
                                  // До 3:00 — вчера = позавчера реально
                                  const d = new Date();
                                  if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                  d.setDate(d.getDate() - 1);
                                  return d.getDate();
                                })()),
                                // Кнопка быстрого перехода на сегодня (учитываем ночной порог)
                                React.createElement('button', {
                                  className: 'today-quick-btn' + (selectedDate === todayISO() ? ' active' : ''),
                                  onClick: () => setSelectedDate(todayISO()),
                                  title: 'Перейти на сегодня'
                                }, (() => {
                                  // До 3:00 — показываем вчерашнее число
                                  const d = new Date();
                                  if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                  return d.getDate();
                                })()),
                                // DatePicker
                                React.createElement(window.HEYS.DatePicker, {
                                  valueISO: selectedDate,
                                  onSelect: setSelectedDate,
                                  onRemove: () => {
                                    setSelectedDate(todayISO());
                                  },
                                  activeDays: datePickerActiveDays,
                                  // Функция для загрузки данных при смене месяца
                                  getActiveDaysForMonth: (year, month) => {
                                    const getActiveDaysForMonthFn = window.HEYS.dayUtils && window.HEYS.dayUtils.getActiveDaysForMonth;
                                    // Fallback chain для products
                                    const effectiveProducts = (products && products.length > 0) ? products
                                      : (window.HEYS.products?.getAll?.() || [])
                                      .length > 0 ? window.HEYS.products.getAll()
                                      : (U.lsGet?.('heys_products', []) || []);
                                    if (!getActiveDaysForMonthFn || !clientId || effectiveProducts.length === 0) {
                                      return new Map();
                                    }
                                    const profile = U && U.lsGet ? U.lsGet('heys_profile', {}) : {};
                                    try {
                                      return getActiveDaysForMonthFn(year, month, profile, effectiveProducts);
                                    } catch (e) {
                                      return new Map();
                                    }
                                  }
                                }),
                              )
                            : null,
                        ),
                      )
                    : null,
                ),
                React.createElement(
                  'div',
                  { className: 'tabs' },
                  // Рацион — доступен на всех устройствах
                  React.createElement(
                    'div',
                    {
                      className: 'tab ' + (tab === 'ration' ? 'active' : ''),
                      onClick: () => setTab('ration'),
                    },
                    React.createElement('span', { className: 'tab-icon' }, '📦'),
                    React.createElement('span', { className: 'tab-text' }, 'База'),
                  ),
                  // Обзор — слева (тройной тап = debug panel)
                  React.createElement(
                    'div',
                    {
                      className: 'tab ' + (tab === 'overview' ? 'active' : ''),
                      onClick: () => {
                        window.HEYS?.debugPanel?.handleTap();
                        setTab('overview');
                      },
                    },
                    React.createElement('span', { className: 'tab-icon' }, '📋'),
                    React.createElement('span', { className: 'tab-text' }, 'Обзор'),
                  ),
                  // iOS Switch группа для stats/diary — ПО ЦЕНТРУ + подписи
                  React.createElement(
                    'div',
                    { className: 'tab-switch-wrapper' },
                    React.createElement(
                      'div',
                      { 
                        className: 'tab-switch-group',
                        onClick: () => setTab(tab === 'stats' ? 'diary' : 'stats'),
                      },
                      React.createElement(
                        'div',
                        {
                          className: 'tab tab-switch ' + (tab === 'stats' ? 'active' : ''),
                        },
                        React.createElement('span', { className: 'tab-icon' }, '📊'),
                        React.createElement('span', { className: 'tab-text' }, 'Итоги'),
                      ),
                      React.createElement(
                        'div',
                        {
                          className: 'tab tab-switch ' + (tab === 'diary' ? 'active' : ''),
                        },
                        React.createElement('span', { className: 'tab-icon' }, '🍴'),
                        React.createElement('span', { className: 'tab-text' }, 'Еда'),
                      ),
                    ),
                    // Подписи под переключателем
                    React.createElement(
                      'div',
                      { className: 'tab-switch-labels' },
                      React.createElement('span', { className: 'tab-switch-label' + (tab === 'stats' ? ' active' : '') }, 'Отчёты'),
                      React.createElement('span', { className: 'tab-switch-label' + (tab === 'diary' ? ' active' : '') }, 'Дневник'),
                    ),
                  ),
                  // Графики — только для десктопа
                  React.createElement(
                    'div',
                    {
                      className: 'tab tab-desktop-only ' + (tab === 'reports' ? 'active' : ''),
                      onClick: () => {
                        if (
                          window.HEYS &&
                          window.HEYS.Day &&
                          typeof window.HEYS.Day.requestFlush === 'function'
                        ) {
                          try {
                            window.HEYS.Day.requestFlush();
                          } catch (error) {}
                        }
                        setTab('reports');
                        setReportsRefresh(Date.now());
                      },
                    },
                    React.createElement('span', { className: 'tab-icon' }, '📈'),
                    React.createElement('span', { className: 'tab-text' }, 'Графики'),
                  ),
                  // Советы — кнопка между переключателем и настройками
                  React.createElement(
                    'div',
                    {
                      className: 'tab tab-advice',
                      onClick: () => {
                        // Переключаемся на stats если не там, и показываем советы
                        if (tab !== 'stats' && tab !== 'diary') {
                          setTab('stats');
                        }
                        // Триггерим показ советов через глобальный event
                        window.dispatchEvent(new CustomEvent('heysShowAdvice'));
                      },
                    },
                    React.createElement('span', { className: 'tab-icon' }, '💡'),
                    React.createElement('span', { className: 'tab-advice-badge', id: 'nav-advice-badge' }),
                  ),
                  // Настройки — справа
                  React.createElement(
                    'div',
                    {
                      className: 'tab ' + (tab === 'user' ? 'active' : ''),
                      onClick: () => setTab('user'),
                    },
                    React.createElement('span', { className: 'tab-icon' }, '⚙️'),
                    React.createElement('span', { className: 'tab-text' }, 'Настройки'),
                  ),
                ),
                // === SWIPEABLE TAB CONTENT ===
                React.createElement(
                  'div',
                  {
                    className: 'tab-content-swipeable' + 
                      (slideDirection === 'left' ? ' slide-out-left' : '') +
                      (slideDirection === 'right' ? ' slide-out-right' : '') +
                      (edgeBounce === 'left' ? ' edge-bounce-left' : '') +
                      (edgeBounce === 'right' ? ' edge-bounce-right' : ''),
                    onTouchStart: onTouchStart,
                    onTouchEnd: onTouchEnd,
                  },
                  // Edge indicators
                  edgeBounce && React.createElement('div', { 
                    className: 'edge-indicator ' + edgeBounce 
                  }),
                  tab === 'ration'
                    ? React.createElement(RationTabWithCloudSync, {
                        key: 'ration' + syncVer + '_' + String(clientId || ''),
                        products,
                        setProducts,
                        clientId,
                      })
                    : (tab === 'stats' || tab === 'diary')
                      ? React.createElement(DayTabWithCloudSync, {
                          key: 'day' + syncVer + '_' + String(clientId || '') + '_' + selectedDate,
                          products,
                          clientId,
                          selectedDate,
                          setSelectedDate,
                          subTab: tab,
                        })
                      : tab === 'user'
                        ? React.createElement(UserTabWithCloudSync, {
                            key: 'user' + syncVer + '_' + String(clientId || ''),
                            clientId,
                          })
                        : tab === 'overview'
                          ? (window.HEYS && window.HEYS.DataOverviewTab
                              ? React.createElement(window.HEYS.DataOverviewTab, {
                                  key: 'overview' + syncVer + '_' + String(clientId || ''),
                                  clientId,
                                  setTab,
                                  setSelectedDate,
                                })
                              : React.createElement('div', { style: { padding: 16 } },
                                  React.createElement('div', { className: 'skeleton-sparkline', style: { height: 80, marginBottom: 16 } }),
                                  React.createElement('div', { className: 'skeleton-block', style: { height: 100 } })
                                ))
                          : window.HEYS && window.HEYS.ReportsTab
                            ? React.createElement(window.HEYS.ReportsTab, {
                                key:
                                  'reports' +
                                  syncVer +
                                  '_' +
                                  String(clientId || '') +
                                  '_' +
                                  reportsRefresh,
                                products,
                              })
                            : React.createElement('div', { style: { padding: 16 } },
                                React.createElement('div', { className: 'skeleton-header', style: { width: 150, marginBottom: 16 } }),
                                React.createElement('div', { className: 'skeleton-block', style: { height: 200 } })
                              ),
                ),
              ),
              // === PWA Install Banner for Android/Desktop (только после Morning Check-in) ===
              !isMorningCheckinBlocking && showPwaBanner && React.createElement(
                'div',
                { className: 'pwa-install-banner' },
                React.createElement('div', { className: 'pwa-banner-content' },
                  React.createElement('div', { className: 'pwa-banner-icon' }, '📱'),
                  React.createElement('div', { className: 'pwa-banner-text' },
                    React.createElement('div', { className: 'pwa-banner-title' }, 'Установить HEYS'),
                    React.createElement('div', { className: 'pwa-banner-desc' }, 'Быстрый доступ с главного экрана')
                  ),
                  React.createElement('div', { className: 'pwa-banner-actions' },
                    React.createElement('button', { 
                      className: 'pwa-banner-install',
                      onClick: handlePwaInstall
                    }, 'Установить'),
                    React.createElement('button', { 
                      className: 'pwa-banner-dismiss',
                      onClick: dismissPwaBanner
                    }, '✕')
                  )
                )
              ),
              // === iOS Safari PWA Banner ===
              !isMorningCheckinBlocking && showIosPwaBanner && React.createElement(
                'div',
                { className: 'pwa-install-banner ios-pwa-banner' },
                React.createElement('div', { className: 'pwa-banner-content ios-banner-content' },
                  React.createElement('div', { className: 'pwa-banner-icon' }, '📲'),
                  React.createElement('div', { className: 'pwa-banner-text' },
                    React.createElement('div', { className: 'pwa-banner-title' }, 'Установить HEYS'),
                    React.createElement('div', { className: 'ios-benefit-hint' }, 
                      '✨ Полный экран • Быстрый доступ • Работа offline'
                    ),
                    React.createElement('div', { className: 'ios-steps' },
                      React.createElement('div', { className: 'ios-step' },
                        React.createElement('span', { className: 'ios-step-num' }, '1'),
                        'Нажмите ',
                        React.createElement('span', { className: 'ios-share-icon' }, 
                          React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
                            React.createElement('path', { d: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8' }),
                            React.createElement('polyline', { points: '16 6 12 2 8 6' }),
                            React.createElement('line', { x1: 12, y1: 2, x2: 12, y2: 15 })
                          )
                        ),
                        ' внизу'
                      ),
                      React.createElement('div', { className: 'ios-step' },
                        React.createElement('span', { className: 'ios-step-num' }, '2'),
                        '«На экран Домой»'
                      )
                    )
                  ),
                  React.createElement('button', { 
                    className: 'ios-got-it-btn',
                    onClick: dismissIosPwaBanner
                  }, 'Понял')
                ),
                React.createElement('div', { className: 'ios-arrow-hint' },
                  React.createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'currentColor' },
                    React.createElement('path', { d: 'M12 16l-6-6h12l-6 6z' })
                  )
                )
              ),
              // === Update Toast (только после Morning Check-in) ===
              !isMorningCheckinBlocking && showUpdateToast && React.createElement(
                'div',
                { className: 'update-toast' },
                React.createElement('div', { className: 'update-toast-content' },
                  React.createElement('span', { className: 'update-toast-icon' }, '🚀'),
                  React.createElement('span', { className: 'update-toast-text' }, 'Доступна новая версия!'),
                  React.createElement('button', { 
                    className: 'update-toast-btn',
                    onClick: handleUpdate
                  }, 'Обновить'),
                  React.createElement('button', { 
                    className: 'update-toast-dismiss',
                    onClick: dismissUpdateToast
                  }, '✕')
                )
              ),
            );
          }
          renderRoot(App);
        }

        // Start initialization
        waitForDependencies(initializeApp);
      })();
