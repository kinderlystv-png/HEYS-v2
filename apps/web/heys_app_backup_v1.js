// heys_app_backup_v1.js — Backup helpers for App
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const CORE_BACKUP_KEYS = [
        'heys_products',
        'heys_profile',
        'heys_hr_zones',
        'heys_norms',
        'heys_dayv2_date',
        'heys_shared_products', // 🆕 Бэкап общих продуктов для восстановления
    ];

    const downloadBackupFile = (payload, activeClientId, timestamp) => {
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
            HEYS.analytics?.trackError?.(error, { context: 'downloadBackupFile' });
        }
    };

    const listDayKeysForClient = (clientId) => {
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
            HEYS.analytics?.trackError?.(error, { context: 'listDayKeysForClient' });
        }
        return Array.from(normalized);
    };

    const formatBackupTime = (meta) => {
        if (!meta || !meta.timestamp) return '—';
        try {
            return new Date(meta.timestamp).toLocaleString('ru-RU', { hour12: false });
        } catch (error) {
            return meta.timestamp;
        }
    };

    const createBackupHelpers = ({
        U,
        clientId,
        setProducts,
        setSyncVer,
        setBackupMeta,
    }) => {
        const backupAllKeys = (options = {}) => {
            if (!clientId) {
                if (!options.silent) HEYS.Toast?.warning('Сначала выберите клиента') || alert('Сначала выберите клиента');
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
                listDayKeysForClient(clientId).forEach((key) => keysToProcess.add(key));
            }
            const shouldDownload = Boolean(options.triggerDownload);
            const filePayload = shouldDownload
                ? { version: 1, clientId, generatedAt: timestamp, reason, items: [] }
                : null;
            let processed = 0;
            keysToProcess.forEach((key) => {
                let data = null;
                try {
                    data = (key === 'heys_products' && window.HEYS?.products?.getAll)
                        ? window.HEYS.products.getAll()
                        : (U && typeof U.lsGet === 'function' ? U.lsGet(key, null) : null);
                } catch (error) {
                    HEYS.analytics?.trackError?.(error, { context: 'backupAllKeys', key });
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
                } else if (window.HEYS?.store?.set) {
                    window.HEYS.store.set(`${key}_backup`, snapshot);
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
            } else if (window.HEYS?.store?.set) {
                window.HEYS.store.set('heys_backup_meta', meta);
            }
            setBackupMeta(meta);
            if (shouldDownload && filePayload && filePayload.items.length) {
                downloadBackupFile(filePayload, clientId, timestamp);
            }
            if (!options.silent) {
                (processed
                    ? HEYS.Toast?.success(`Бэкап готов: ${processed} разделов`)
                    : HEYS.Toast?.warning('Нет данных для резервного копирования')
                ) || alert(
                    processed
                        ? `Бэкап готов: ${processed} разделов`
                        : 'Нет данных для резервного копирования',
                );
            }
            if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackDataOperation('backup-save', processed);
            }
            return { ok: processed > 0, meta, processed };
        };

        const restoreFromBackup = (target = 'heys_products', options = {}) => {
            if (!clientId) {
                if (!options.silent) HEYS.Toast?.warning('Сначала выберите клиента') || alert('Сначала выберите клиента');
                return { ok: false, reason: 'no-client' };
            }
            const keysList =
                target === 'all'
                    ? Array.from(
                        new Set([
                            ...CORE_BACKUP_KEYS,
                            ...(options.includeDays === false
                                ? []
                                : listDayKeysForClient(clientId)),
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
                    HEYS.analytics?.trackError?.(error, { context: 'restoreFromBackup', key });
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
                    const restoredProducts = Array.isArray(snapshot.data) ? snapshot.data : [];
                    if (window.HEYS?.products?.setAll) {
                        window.HEYS.products.setAll(restoredProducts, { source: 'backup-restore' });
                    }
                    setProducts(restoredProducts);
                } else if (U && typeof U.lsSet === 'function') {
                    U.lsSet(key, snapshot.data);
                } else if (window.HEYS?.store?.set) {
                    window.HEYS.store.set(key, snapshot.data);
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
                (restored
                    ? HEYS.Toast?.success(`Восстановлено разделов: ${restored}`)
                    : HEYS.Toast?.warning('Не удалось найти подходящий бэкап')
                ) || alert(
                    restored
                        ? `Восстановлено разделов: ${restored}`
                        : 'Не удалось найти подходящий бэкап',
                );
            }
            return { ok: restored > 0, restored };
        };

        const restoreFromBackupFile = async (options = {}) => {
            if (!clientId) {
                if (!options.silent) HEYS.Toast?.warning('Сначала выберите клиента') || alert('Сначала выберите клиента');
                return { ok: false, reason: 'no-client' };
            }

            const openFile = HEYS.fileSystem?.openFile;
            if (typeof openFile !== 'function') {
                if (!options.silent) {
                    HEYS.Toast?.warning('Импорт недоступен в этом окружении') || alert('Импорт недоступен в этом окружении');
                }
                return { ok: false, reason: 'no-file-picker' };
            }

            const result = await openFile(['.json']);
            if (!result || !result.success || result.cancelled) {
                return { ok: false, reason: 'cancelled' };
            }

            const data = result.data;
            if (!data || typeof data !== 'object') {
                if (!options.silent) HEYS.Toast?.warning('Неверный формат бэкапа') || alert('Неверный формат бэкапа');
                return { ok: false, reason: 'invalid-format' };
            }

            const dates = Array.isArray(options.dates)
                ? options.dates
                : options.date
                    ? [options.date]
                    : null;
            const shouldOverwrite = options.overwrite !== false;
            const restoredDates = [];
            const skippedDates = [];

            const commitDay = (dateStr, dayData) => {
                if (!dateStr || !dayData) return;
                const key = dateStr.startsWith('heys_dayv2_')
                    ? dateStr
                    : `heys_dayv2_${dateStr}`;
                const existing = U && typeof U.lsGet === 'function' ? U.lsGet(key, null) : null;
                if (existing && !shouldOverwrite) {
                    skippedDates.push(dateStr);
                    return;
                }
                if (U && typeof U.lsSet === 'function') {
                    U.lsSet(key, dayData);
                } else if (window.HEYS?.store?.set) {
                    window.HEYS.store.set(key, dayData);
                }
                restoredDates.push(dateStr);
            };

            if (data.days && typeof data.days === 'object' && !Array.isArray(data.days)) {
                const available = Object.keys(data.days);
                const targetDates = dates || available;
                targetDates.forEach((dateStr) => {
                    const dayData = data.days[dateStr] || data.days[`heys_dayv2_${dateStr}`];
                    commitDay(dateStr, dayData);
                });
            } else if (Array.isArray(data.items)) {
                const dayItems = data.items.filter((item) => item && typeof item.key === 'string' && item.key.startsWith('heys_dayv2_'));
                const available = dayItems.map((item) => item.key.replace('heys_dayv2_', ''));
                const targetDates = dates || available;
                dayItems.forEach((item) => {
                    const dateStr = item.key.replace('heys_dayv2_', '');
                    if (targetDates && !targetDates.includes(dateStr)) return;
                    commitDay(dateStr, item.data);
                });
            } else {
                if (!options.silent) HEYS.Toast?.warning('В бэкапе нет данных дней') || alert('В бэкапе нет данных дней');
                return { ok: false, reason: 'no-days' };
            }

            if (options.restoreProducts && Array.isArray(data.products) && HEYS.products?.setAll) {
                const existing = HEYS.products.getAll?.() || [];
                const merged = Array.isArray(existing) ? [...existing] : [];
                let added = 0;
                data.products.forEach((product) => {
                    if (!product || !product.id) return;
                    if (merged.find((p) => p.id === product.id)) return;
                    merged.push(product);
                    added++;
                });
                if (added) {
                    HEYS.products.setAll(merged, { source: 'restore-backup-file' });
                }
            }

            if (restoredDates.length) {
                setSyncVer((v) => v + 1);
                if (options.sync !== false && HEYS.cloud?.syncClient) {
                    HEYS.cloud.syncClient(clientId).catch(() => { });
                }
            }

            if (!options.silent) {
                const msg = restoredDates.length
                    ? `Восстановлены дни: ${restoredDates.length}`
                    : 'Не найдено данных для восстановления';
                (restoredDates.length ? HEYS.Toast?.success(msg) : HEYS.Toast?.warning(msg)) || alert(msg);
            }

            return {
                ok: restoredDates.length > 0,
                restored: restoredDates.length,
                restoredDates,
                skippedDates,
                filename: result.filename,
            };
        };

        return {
            CORE_BACKUP_KEYS,
            downloadBackupFile,
            listDayKeysForClient,
            backupAllKeys,
            restoreFromBackup,
            restoreFromBackupFile,
            formatBackupTime,
        };
    };

    HEYS.AppBackup = {
        CORE_BACKUP_KEYS,
        downloadBackupFile,
        listDayKeysForClient,
        createBackupHelpers,
        formatBackupTime,
    };
})();
