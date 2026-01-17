// heys_app_backup_state_v1.js — backup helpers + actions state

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppBackupState = HEYS.AppBackupState || {};

    HEYS.AppBackupState.useBackupState = function ({
        React,
        AppBackup,
        AppBackupActions,
        U,
        clientId,
        setProducts,
        setSyncVer,
        setBackupMeta,
        backupBusy,
        setBackupBusy,
    }) {
        const { useMemo, useCallback } = React;

        const backupHelpers = useMemo(() => {
            if (!AppBackup?.createBackupHelpers) return null;
            return AppBackup.createBackupHelpers({
                U,
                clientId,
                setProducts,
                setSyncVer,
                setBackupMeta,
            });
        }, [AppBackup, U, clientId, setProducts, setSyncVer, setBackupMeta]);

        const backupAllKeys = backupHelpers?.backupAllKeys
            || ((options = {}) => ({ ok: false, reason: 'no-backup-helpers', options }));
        const restoreFromBackup = backupHelpers?.restoreFromBackup
            || ((target = 'heys_products', options = {}) => ({ ok: false, reason: 'no-backup-helpers', target, options }));
        const formatBackupTime = backupHelpers?.formatBackupTime || (() => '—');

        const useBackupActions = AppBackupActions?.useBackupActions
            || (({ React: HookReact }) => ({
                handleManualBackup: HookReact.useCallback(() => { }, []),
                handleExportBackup: HookReact.useCallback(() => { }, []),
                handleRestoreProducts: HookReact.useCallback(() => { }, []),
                handleRestoreAll: HookReact.useCallback(() => { }, []),
            }));
        const backupActions = useBackupActions({
            React,
            clientId,
            backupBusy,
            setBackupBusy,
            backupAllKeys,
            restoreFromBackup,
        });

        return {
            backupAllKeys,
            restoreFromBackup,
            formatBackupTime,
            backupActions,
        };
    };
})();
