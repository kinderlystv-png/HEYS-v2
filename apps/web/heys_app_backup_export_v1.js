// heys_app_backup_export_v1.js — export backup helper extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppBackupExport = HEYS.AppBackupExport || {};

    HEYS.AppBackupExport.init = function () {
        // === Экспорт бэкапа всех данных в JSON ===
        // Используется из DayTab для кнопки "Скачать бэкап"
        HEYS.exportFullBackup = async function () {
            let clientId = localStorage.getItem('heys_client_current');
            if (!clientId) {
                HEYS.Toast?.warning('Нет активного клиента') || alert('Нет активного клиента');
                return { ok: false, error: 'no_client' };
            }

            // Убираем лишние кавычки если есть (legacy bug)
            if (clientId.startsWith('"') && clientId.endsWith('"')) {
                clientId = clientId.slice(1, -1);
            }

            console.log('[BACKUP] Client ID:', clientId);

            // Debug: показать все ключи localStorage для этого клиента
            const allKeys = Object.keys(localStorage);
            const clientKeys = allKeys.filter(k => k.includes(clientId) || k.includes('heys_'));
            console.log('[BACKUP] Found localStorage keys:', clientKeys);

            try {
                // Собираем все данные клиента
                const backup = {
                    exportedAt: new Date().toISOString(),
                    clientId: clientId,
                    appVersion: window.APP_VERSION || 'unknown',
                    products: [],
                    sharedProducts: [],
                    profile: null,
                    norms: null,
                    hrZones: null,
                    days: {},
                    water: null,
                    scheduledAdvices: null,
                };

                // Продукты — сначала из React state, потом localStorage
                // React state приоритетнее т.к. localStorage может быть повреждён
                if (HEYS.products && typeof HEYS.products.getAll === 'function') {
                    const stateProducts = HEYS.products.getAll();
                    if (Array.isArray(stateProducts) && stateProducts.length > 0) {
                        backup.products = stateProducts;
                        console.log('[BACKUP] Products from HEYS.products.getAll():', stateProducts.length);
                    }
                }

                // Fallback на HEYS.store.get (корректно декомпрессирует данные)
                if (!backup.products || backup.products.length === 0) {
                    if (HEYS.store && typeof HEYS.store.get === 'function') {
                        backup.products = HEYS.store.get('heys_products', []);
                        console.log('[BACKUP] Products from HEYS.store.get:', backup.products.length);
                    }
                }

                // Профиль — через HEYS.store.get (учитывает memory cache и scoped keys)
                if (HEYS.store && typeof HEYS.store.get === 'function') {
                    backup.profile = HEYS.store.get('heys_profile', null);
                    console.log('[BACKUP] Profile from HEYS.store.get:', backup.profile ? 'found' : 'NOT FOUND');
                }
                // Fallback на прямой localStorage
                if (!backup.profile) {
                    let profileKey = `heys_${clientId}_profile`;
                    let profileRaw = localStorage.getItem(profileKey);
                    if (!profileRaw) {
                        profileKey = 'heys_profile';
                        profileRaw = localStorage.getItem(profileKey);
                    }
                    console.log('[BACKUP] Profile key:', profileKey, '→', profileRaw ? 'found' : 'NOT FOUND');
                    if (profileRaw) {
                        try { backup.profile = JSON.parse(profileRaw); } catch (e) { }
                    }
                }

                // Нормы — через HEYS.store.get
                if (HEYS.store && typeof HEYS.store.get === 'function') {
                    backup.norms = HEYS.store.get('heys_norms', null);
                    console.log('[BACKUP] Norms from HEYS.store.get:', backup.norms ? 'found' : 'NOT FOUND');
                }
                if (!backup.norms) {
                    let normsKey = `heys_${clientId}_norms`;
                    let normsRaw = localStorage.getItem(normsKey);
                    if (!normsRaw) {
                        normsKey = 'heys_norms';
                        normsRaw = localStorage.getItem(normsKey);
                    }
                    console.log('[BACKUP] Norms key:', normsKey, '→', normsRaw ? 'found' : 'NOT FOUND');
                    if (normsRaw) {
                        try { backup.norms = JSON.parse(normsRaw); } catch (e) { }
                    }
                }

                // Пульсовые зоны — через HEYS.store.get
                if (HEYS.store && typeof HEYS.store.get === 'function') {
                    backup.hrZones = HEYS.store.get('heys_hr_zones', null);
                    console.log('[BACKUP] HR Zones from HEYS.store.get:', backup.hrZones ? 'found' : 'NOT FOUND');
                }
                if (!backup.hrZones) {
                    let hrKey = `heys_${clientId}_hr_zones`;
                    let hrRaw = localStorage.getItem(hrKey);
                    if (!hrRaw) {
                        hrKey = 'heys_hr_zones';
                        hrRaw = localStorage.getItem(hrKey);
                    }
                    console.log('[BACKUP] HR Zones key:', hrKey, '→', hrRaw ? 'found' : 'NOT FOUND');
                    if (hrRaw) {
                        try { backup.hrZones = JSON.parse(hrRaw); } catch (e) { }
                    }
                }

                // Вода (используем HEYS.store.get для декомпрессии)
                if (HEYS.store && typeof HEYS.store.get === 'function') {
                    backup.water = HEYS.store.get('heys_water_history', null);
                    console.log('[BACKUP] Water from HEYS.store.get:', backup.water ? 'found' : 'NOT FOUND');
                }

                // Советы (используем HEYS.store.get для декомпрессии)
                if (HEYS.store && typeof HEYS.store.get === 'function') {
                    backup.scheduledAdvices = HEYS.store.get('heys_scheduled_advices', []);
                }

                // Shared products — хранятся в памяти (кэш из PostgreSQL), не в localStorage!
                backup.sharedProducts = HEYS.cloud?.getCachedSharedProducts?.() || [];
                console.log('[BACKUP] Shared products (from cache):', backup.sharedProducts?.length || 0);

                // Fallback: если кэш ещё не прогрузился — забираем напрямую из API
                if ((!backup.sharedProducts || backup.sharedProducts.length === 0) && HEYS.YandexAPI?.rest) {
                    HEYS.Toast?.info('Загружаем общие продукты…');
                    try {
                        const { data, error } = await HEYS.YandexAPI.rest('shared_products');
                        if (error) {
                            console.log('[BACKUP] Shared products API error:', error);
                            HEYS.Toast?.warning('Не удалось загрузить общие продукты. Попробуй экспорт ещё раз.');
                        } else if (Array.isArray(data) && data.length > 0) {
                            backup.sharedProducts = data;
                            console.log('[BACKUP] Shared products (from API):', data.length);
                            HEYS.Toast?.success?.('Общие продукты загружены. Экспортируем…');
                        } else {
                            HEYS.Toast?.warning('Общие продукты ещё не готовы. Повтори экспорт через пару секунд.');
                        }
                    } catch (e) {
                        console.log('[BACKUP] Shared products API failed:', e?.message || e);
                        HEYS.Toast?.warning('Не удалось загрузить общие продукты. Попробуй экспорт ещё раз.');
                    }
                }

                // Дни (за последние 90 дней) - используем HEYS.store.get для декомпрессии
                const today = new Date();
                console.log('[BACKUP] Starting days collection for 90 days from:', today.toISOString().slice(0, 10));
                console.log('[BACKUP] HEYS.store available:', !!HEYS.store, 'HEYS.store.get:', typeof HEYS.store?.get);
                console.log('[BACKUP] currentClientId:', HEYS.currentClientId);

                // Debug: показать какие ключи есть в localStorage с dayv2
                const dayv2Keys = Object.keys(localStorage).filter(k => k.includes('dayv2_'));
                console.log('[BACKUP] Found dayv2 keys in localStorage:', dayv2Keys.slice(0, 10));

                let daysFound = 0;
                let daysChecked = 0;
                for (let i = 0; i < 90; i++) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);
                    const dateStr = d.toISOString().slice(0, 10);
                    daysChecked++;

                    if (HEYS.store && typeof HEYS.store.get === 'function') {
                        const dayData = HEYS.store.get('heys_dayv2_' + dateStr, null);
                        if (dayData) {
                            backup.days[dateStr] = dayData;
                            daysFound++;
                            if (daysFound <= 3) {
                                console.log(`[BACKUP] ✅ Found day ${dateStr}:`, typeof dayData, dayData?.meals?.length || 0, 'meals');
                            }
                        }
                    }
                }
                console.log(`[BACKUP] Days scan complete: checked ${daysChecked}, found ${daysFound}`);

                // Статистика
                const daysCount = Object.keys(backup.days).length;
                const productsCount = backup.products?.length || 0;

                // Скачиваем файл
                const fileName = `heys-backup-${clientId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
                const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                const sharedCount = backup.sharedProducts?.length || 0;
                console.log(`[BACKUP] ✅ Exported: ${productsCount} products, ${sharedCount} shared, ${daysCount} days`);
                return { ok: true, products: productsCount, sharedProducts: sharedCount, days: daysCount, fileName };
            } catch (err) {
                console.error('[BACKUP] Export failed:', err);
                HEYS.Toast?.error('Ошибка экспорта: ' + err.message) || alert('Ошибка экспорта: ' + err.message);
                return { ok: false, error: err.message };
            }
        };
    };

    HEYS.AppBackupExport.init();
})();
