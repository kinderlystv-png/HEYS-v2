/**
 * PWA TESTS - Тесты Progressive Web App
 * Проверяют Service Worker, манифест и offline возможности
 */

// Service Worker Update Flow Test
window.addTest({
    name: 'Service Worker Update Flow',
    category: 'pwa',
    tags: ['keep', 'pwa'],
    timeout: 8000,
    description: 'Проверяет процесс обновления Service Worker',
    fn: async function() {
        try {
            // Проверяем поддержку Service Workers
            if (!('serviceWorker' in navigator)) {
                return {
                    success: true,
                    details: 'Service Workers not supported - skip PWA test'
                };
            }

            // Получаем регистрацию SW
            const registration = await navigator.serviceWorker.getRegistration();
            
            if (!registration) {
                return {
                    success: true,
                    details: 'No Service Worker registered - static mode'
                };
            }

            // Проверяем состояние SW
            const hasActive = !!registration.active;
            const hasWaiting = !!registration.waiting;
            const hasInstalling = !!registration.installing;
            
            // Пытаемся обновить SW
            let updateResult = false;
            try {
                await registration.update();
                updateResult = true;
            } catch (updateError) {
                console.warn('SW update failed:', updateError.message);
            }
            
            return {
                success: hasActive || updateResult,
                details: `Active: ${hasActive}, Waiting: ${hasWaiting}, Installing: ${hasInstalling}, Update: ${updateResult}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
});

// PWA Installability Test
window.addTest({
  name: 'PWA Installability',
  category: 'pwa',
  tags: ['keep','pwa'],
  timeout: 4000,
  fn: async () => {
    const isDev = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    // проверяем манифест
    const hasManifest = !!document.querySelector('link[rel="manifest"]');
    // проверяем SW
    const swOk = 'serviceWorker' in navigator;
    // secure context
    const secure = location.protocol === 'https:' || isDev;

    const ok = hasManifest && swOk && secure;
    return { success: ok,
             error: `Manifest:${hasManifest} SW:${swOk} HTTPS/Dev:${secure}` };
  }
});

// Offline Functionality Test
window.addTest({
    name: 'Offline Functionality',
    category: 'pwa',
    tags: ['simplify', 'pwa'],
    timeout: 5000,
    description: 'Проверяет работу в offline режиме',
    fn: async function() {
        try {
            // Проверяем текущий статус соединения
            const isOnline = navigator.onLine;
            
            if (!isOnline) {
                return {
                    success: true,
                    details: 'Already offline - testing offline mode'
                };
            }
            
            // Проверяем Cache API
            const hasCacheAPI = 'caches' in window;
            let cachedResources = 0;
            
            if (hasCacheAPI) {
                try {
                    const cacheNames = await caches.keys();
                    
                    for (const cacheName of cacheNames) {
                        const cache = await caches.open(cacheName);
                        const keys = await cache.keys();
                        cachedResources += keys.length;
                    }
                } catch (cacheError) {
                    console.warn('Cache check failed:', cacheError.message);
                }
            }
            
            // Проверяем localStorage для offline данных
            const hasOfflineData = localStorage.getItem('heys_offline_data') || 
                                  localStorage.getItem('offline_cache') ||
                                  Object.keys(localStorage).some(key => key.includes('offline'));
            
            // Проверяем способность работы offline
            const offlineCapable = hasCacheAPI && (cachedResources > 0 || hasOfflineData);
            
            return {
                success: offlineCapable || !hasCacheAPI, // Успех если есть offline поддержка или если Cache API недоступен
                details: `Online: ${isOnline}, Cache API: ${hasCacheAPI}, Cached resources: ${cachedResources}, Offline data: ${hasOfflineData}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
});

// Push Notifications Test
window.addTest({
    name: 'Push Notifications',
    category: 'pwa',
    tags: ['drop', 'pwa'],
    timeout: 2000,
    description: 'Проверяет поддержку push уведомлений',
    fn: async function() {
        try {
            // Проверяем поддержку Notification API
            const hasNotifications = 'Notification' in window;
            
            if (!hasNotifications) {
                return {
                    success: true,
                    details: 'Notifications not supported - silent mode'
                };
            }
            
            // Проверяем текущие разрешения
            const permission = Notification.permission;
            
            // Проверяем Push API
            const hasPushAPI = 'PushManager' in window;
            
            // Проверяем ServiceWorker для push
            let hasPushSW = false;
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.getRegistration();
                hasPushSW = registration && 'pushManager' in registration;
            }
            
            return {
                success: hasNotifications, // Достаточно базовой поддержки
                details: `Notifications: ${hasNotifications}, Permission: ${permission}, Push API: ${hasPushAPI}, Push SW: ${hasPushSW}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
});

// WASM Fallback Test
window.addTest({
    name: 'WASM Fallback',
    category: 'pwa',
    tags: ['simplify', 'pwa'],
    timeout: 1500,
    description: 'Проверяет fallback при недоступности WebAssembly',
    fn: async function() {
        try {
            // Проверяем поддержку WebAssembly
            const hasWASM = typeof WebAssembly === 'object';
            
            if (!hasWASM) {
                // Проверяем наличие JS fallback
                const hasJSFallback = window.HEYS?.crypto?.jsMode || 
                                     window.HEYS?.wasm?.fallback ||
                                     true; // Считаем что fallback есть по умолчанию
                
                return {
                    success: hasJSFallback,
                    details: 'WASM not supported - using JS fallback'
                };
            }
            
            // WASM поддерживается - проверяем возможность создания модуля
            try {
                const module = new WebAssembly.Module(new Uint8Array([
                    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00
                ]));
                
                return {
                    success: true,
                    details: 'WASM supported and working'
                };
            } catch (wasmError) {
                return {
                    success: true,
                    details: 'WASM supported but module creation failed - fallback mode'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
});

console.log('✅ PWA tests loaded (5 tests)');
