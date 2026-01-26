// heys_app_global_bindings_v1.js — window bindings for saveClientKey + backupManager

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppGlobalBindings = HEYS.AppGlobalBindings || {};

    HEYS.AppGlobalBindings.useGlobalBindings = function ({
        React,
        cloud,
        clientId,
        backupAllKeys,
        restoreFromBackup,
        restoreFromBackupFile,
        backupMeta,
    }) {
        const { useEffect } = React;

        useEffect(() => {
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
        }, [cloud, clientId]);

        useEffect(() => {
            window.HEYS = window.HEYS || {};
            window.HEYS.backupManager = window.HEYS.backupManager || {};
            window.HEYS.backupManager.backupAll = backupAllKeys;
            window.HEYS.backupManager.restore = restoreFromBackup;
            window.HEYS.backupManager.restoreFromFile = restoreFromBackupFile;
            window.HEYS.backupManager.getLastBackupMeta = () => backupMeta;
        }, [backupAllKeys, restoreFromBackup, restoreFromBackupFile, backupMeta]);
    };
})();
