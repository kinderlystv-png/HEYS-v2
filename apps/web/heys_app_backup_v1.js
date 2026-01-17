// heys_app_backup_v1.js — Backup helpers for App
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const CORE_BACKUP_KEYS = [
        'heys_products',
        'heys_profile',
        'heys_hr_zones',
        'heys_norms',
        'heys_dayv2_date',
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
                    data = U && typeof U.lsGet === 'function' ? U.lsGet(key, null) : null;
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
                } else {
                    try {
                        localStorage.setItem(`${key}_backup`, JSON.stringify(snapshot));
                    } catch (error) {
                        HEYS.analytics?.trackError?.(error, { context: 'backupAllKeys', key });
                    }
                    if (window.HEYS && typeof window.HEYS.saveClientKey === 'function') {
                        try {
                            window.HEYS.saveClientKey(`${key}_backup`, snapshot);
                        } catch (error) {
                            HEYS.analytics?.trackError?.(error, { context: 'backupAllKeys:saveClientKey', key });
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
                } catch (error) { }
                if (window.HEYS && typeof window.HEYS.saveClientKey === 'function') {
                    try {
                        window.HEYS.saveClientKey('heys_backup_meta', meta);
                    } catch (error) {
                        HEYS.analytics?.trackError?.(error, { context: 'backupAllKeys:saveClientKey', key: 'heys_backup_meta' });
                    }
                }
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
                    setProducts(Array.isArray(snapshot.data) ? snapshot.data : []);
                } else if (U && typeof U.lsSet === 'function') {
                    U.lsSet(key, snapshot.data);
                } else {
                    try {
                        localStorage.setItem(key, JSON.stringify(snapshot.data));
                    } catch (error) { }
                    if (window.HEYS && typeof window.HEYS.saveClientKey === 'function') {
                        try {
                            window.HEYS.saveClientKey(key, snapshot.data);
                        } catch (error) {
                            HEYS.analytics?.trackError?.(error, { context: 'restoreFromBackup:saveClientKey', key });
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

        return {
            CORE_BACKUP_KEYS,
            downloadBackupFile,
            listDayKeysForClient,
            backupAllKeys,
            restoreFromBackup,
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
