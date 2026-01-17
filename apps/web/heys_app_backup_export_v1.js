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

                // Fallback на localStorage если state пустой
                if (!backup.products || backup.products.length === 0) {
                    const productsKey = `heys_${clientId}_products`;
                    const productsRaw = localStorage.getItem(productsKey);
                    console.log('[BACKUP] Products key:', productsKey, '→', productsRaw ? 'found' : 'NOT FOUND');
                    if (productsRaw) {
                        try {
                            backup.products = JSON.parse(productsRaw);
                            console.log('[BACKUP] Products from localStorage:', backup.products.length);
                        } catch (e) {
                            console.warn('[BACKUP] ⚠️ Products JSON parse error:', e.message);
                        }
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

                // Вода
                const waterKey = `heys_${clientId}_water_history`;
                const waterRaw = localStorage.getItem(waterKey);
                console.log('[BACKUP] Water key:', waterKey, '→', waterRaw ? 'found' : 'NOT FOUND');
                if (waterRaw) {
                    try { backup.water = JSON.parse(waterRaw); } catch (e) { }
                }

                // Советы
                const advicesKey = `heys_${clientId}_scheduled_advices`;
                const advicesRaw = localStorage.getItem(advicesKey);
                if (advicesRaw) {
                    try { backup.scheduledAdvices = JSON.parse(advicesRaw); } catch (e) { }
                }

                // Дни (за последние 90 дней)
                const today = new Date();
                for (let i = 0; i < 90; i++) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);
                    const dateStr = d.toISOString().slice(0, 10);
                    const dayKey = `heys_${clientId}_dayv2_${dateStr}`;
                    const dayRaw = localStorage.getItem(dayKey);
                    if (dayRaw) {
                        try {
                            backup.days[dateStr] = JSON.parse(dayRaw);
                        } catch (e) { }
                    }
                }

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

                console.log(`[BACKUP] ✅ Exported: ${productsCount} products, ${daysCount} days`);
                return { ok: true, products: productsCount, days: daysCount, fileName };
            } catch (err) {
                console.error('[BACKUP] Export failed:', err);
                HEYS.Toast?.error('Ошибка экспорта: ' + err.message) || alert('Ошибка экспорта: ' + err.message);
                return { ok: false, error: err.message };
            }
        };
    };

    HEYS.AppBackupExport.init();
})();
