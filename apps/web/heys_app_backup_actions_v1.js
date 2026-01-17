// heys_app_backup_actions_v1.js — backup action handlers
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const useBackupActions = ({
        React,
        clientId,
        backupBusy,
        setBackupBusy,
        backupAllKeys,
        restoreFromBackup,
    }) => {
        const handleManualBackup = React.useCallback(async () => {
            if (!clientId) {
                HEYS.Toast?.warning('Сначала выберите клиента') || alert('Сначала выберите клиента');
                return;
            }
            if (backupBusy) return;
            setBackupBusy(true);
            try {
                await backupAllKeys({ reason: 'manual' });
            } finally {
                setBackupBusy(false);
            }
        }, [clientId, backupBusy, setBackupBusy, backupAllKeys]);

        const handleExportBackup = React.useCallback(async () => {
            if (!clientId) {
                HEYS.Toast?.warning('Сначала выберите клиента') || alert('Сначала выберите клиента');
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
                (result && result.processed
                    ? HEYS.Toast?.success(`Файл бэкапа скачан (${result.processed} разделов)`)
                    : HEYS.Toast?.warning('Нет данных для экспорта')
                ) || alert(
                    result && result.processed
                        ? `Файл бэкапа скачан (${result.processed} разделов)`
                        : 'Нет данных для экспорта',
                );
            } finally {
                setBackupBusy(false);
            }
        }, [clientId, backupBusy, setBackupBusy, backupAllKeys]);

        const handleRestoreProducts = React.useCallback(() => {
            if (!clientId) {
                HEYS.Toast?.warning('Сначала выберите клиента') || alert('Сначала выберите клиента');
                return;
            }
            if (!confirm('Восстановить список продуктов из последнего бэкапа?')) return;
            const result = restoreFromBackup('heys_products', { silent: true });
            (result && result.ok
                ? HEYS.Toast?.success('Продукты восстановлены.')
                : HEYS.Toast?.warning('Не найден бэкап продуктов.')
            ) || alert(result && result.ok ? 'Продукты восстановлены.' : 'Не найден бэкап продуктов.');
        }, [clientId, restoreFromBackup]);

        const handleRestoreAll = React.useCallback(() => {
            if (!clientId) {
                HEYS.Toast?.warning('Сначала выберите клиента') || alert('Сначала выберите клиента');
                return;
            }
            if (!confirm('Восстановить все доступные данные из бэкапа?')) return;
            const result = restoreFromBackup('all', { silent: true });
            (result && result.ok
                ? HEYS.Toast?.success(`Восстановлено разделов: ${result.restored}`)
                : HEYS.Toast?.warning('Не найдено подходящих бэкапов.')
            ) || alert(
                result && result.ok
                    ? `Восстановлено разделов: ${result.restored}`
                    : 'Не найдено подходящих бэкапов.',
            );
        }, [clientId, restoreFromBackup]);

        return {
            handleManualBackup,
            handleExportBackup,
            handleRestoreProducts,
            handleRestoreAll,
        };
    };

    HEYS.AppBackupActions = {
        useBackupActions,
    };
})();
