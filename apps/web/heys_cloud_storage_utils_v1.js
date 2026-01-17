// heys_cloud_storage_utils_v1.js — localStorage helpers and cleanup
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const cloud = HEYS.cloud = HEYS.cloud || {};

  function getLogger() {
    const logger = cloud._log || {};
    return {
      log: logger.log || function () { },
      logCritical: logger.logCritical || function () { },
      err: logger.err || function () { }
    };
  }

  HEYS.CloudStorageUtils = HEYS.CloudStorageUtils || {};

  HEYS.CloudStorageUtils.init = function (options = {}) {
    const MAX_STORAGE_MB = options.maxStorageMb || 4.5;
    const OLD_DATA_DAYS = options.oldDataDays || 90;
    const PENDING_QUEUE_KEY = options.pendingQueueKey || 'heys_pending_sync_queue';
    const PENDING_CLIENT_QUEUE_KEY = options.pendingClientQueueKey || 'heys_pending_client_sync_queue';
    const SYNC_LOG_KEY = options.syncLogKey || 'heys_sync_log';

    const { log, logCritical, err } = getLogger();

    function getStorageSize() {
      try {
        let total = 0;
        for (let key in global.localStorage) {
          if (global.localStorage.hasOwnProperty(key)) {
            total += (global.localStorage.getItem(key) || '').length * 2;
          }
        }
        return total / 1024 / 1024;
      } catch (e) {
        return 0;
      }
    }

    function getDateFromDayKey(key) {
      const match = key.match(/dayv2_(\d{4}-\d{2}-\d{2})/);
      if (match) {
        return new Date(match[1]);
      }
      return null;
    }

    function cleanupOldData(daysToKeep = OLD_DATA_DAYS) {
      try {
        const now = new Date();
        const cutoff = new Date(now.getTime() - daysToKeep * 24 * 60 * 60 * 1000);
        let cleaned = 0;

        const keysToRemove = [];
        for (let i = 0; i < global.localStorage.length; i++) {
          const key = global.localStorage.key(i);
          if (key && key.includes('dayv2_')) {
            const date = getDateFromDayKey(key);
            if (date && date < cutoff) {
              keysToRemove.push(key);
            }
          }
        }

        keysToRemove.forEach(key => {
          global.localStorage.removeItem(key);
          cleaned++;
        });

        if (cleaned > 0) {
          logCritical(`🧹 Очищено ${cleaned} старых записей (>${daysToKeep} дней)`);
        }

        return cleaned;
      } catch (e) {
        return 0;
      }
    }

    function aggressiveCleanup() {
      logCritical('🚨 Агрессивная очистка storage...');

      cleanupOldData(14);

      const tempKeys = [];
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (key && (key.includes('_debug') || key.includes('_temp') || key.includes('_cache') || key.includes('_log'))) {
          tempKeys.push(key);
        }
      }
      tempKeys.forEach(k => global.localStorage.removeItem(k));

      global.localStorage.removeItem(PENDING_QUEUE_KEY);
      global.localStorage.removeItem(PENDING_CLIENT_QUEUE_KEY);
      global.localStorage.removeItem(SYNC_LOG_KEY);

      const sizeMB = getStorageSize();
      logCritical(`📊 Размер после очистки: ${sizeMB.toFixed(2)} MB`);

      if (sizeMB > 4) {
        cleanupOldData(7);
        logCritical(`📊 После удаления >7 дней: ${getStorageSize().toFixed(2)} MB`);
      }
    }

    function safeSetItem(key, value, originalSetItem) {
      const setFn = originalSetItem || global.localStorage.setItem.bind(global.localStorage);

      try {
        setFn(key, value);
        return true;
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          logCritical('⚠️ localStorage переполнен, очищаем старые данные...');
          cleanupOldData();

          try {
            setFn(key, value);
            return true;
          } catch (e2) {
            global.localStorage.removeItem(PENDING_QUEUE_KEY);
            global.localStorage.removeItem(PENDING_CLIENT_QUEUE_KEY);
            global.localStorage.removeItem(SYNC_LOG_KEY);

            try {
              setFn(key, value);
              return true;
            } catch (e3) {
              aggressiveCleanup();
              try {
                setFn(key, value);
                return true;
              } catch (e4) {
                logCritical('❌ Не удалось сохранить данные: storage критически переполнен');
                return false;
              }
            }
          }
        }
        return false;
      }
    }

    function loadPendingQueue(key) {
      try {
        const data = global.localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      } catch (e) {
        return [];
      }
    }

    function savePendingQueue(key, queue) {
      try {
        if (queue.length > 0) {
          safeSetItem(key, JSON.stringify(queue));
        } else {
          global.localStorage.removeItem(key);
        }
      } catch (e) { }
    }

    function cleanupDuplicateKeys() {
      const keysToRemove = [];
      const currentClientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;

      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (!key) continue;

        if (key.match(/[a-f0-9-]{36}_[a-f0-9-]{36}_/)) {
          keysToRemove.push(key);
          continue;
        }

        if (key.includes('_heys_products')) {
          keysToRemove.push(key);
          continue;
        }

        if (key.includes('_products_backup') && currentClientId && key.includes(currentClientId)) {
          const normalKey = key.replace('_products_backup', '_products');
          if (global.localStorage.getItem(normalKey)) {
            keysToRemove.push(key);
          }
        }
      }

      if (keysToRemove.length > 0) {
        keysToRemove.forEach(k => global.localStorage.removeItem(k));
        log(`🧹 Очищено ${keysToRemove.length} дублирующихся ключей`);
      }

      return keysToRemove.length;
    }

    function diagnoseStorage() {
      const items = [];
      let total = 0;

      for (let key in global.localStorage) {
        if (global.localStorage.hasOwnProperty(key)) {
          const value = global.localStorage.getItem(key) || '';
          const sizeKB = (value.length * 2) / 1024;
          total += sizeKB;
          items.push({ key, sizeKB: sizeKB.toFixed(2), chars: value.length });
        }
      }

      items.sort((a, b) => parseFloat(b.sizeKB) - parseFloat(a.sizeKB));

      console.log('📊 localStorage диагностика:');
      console.log(`Общий размер: ${(total / 1024).toFixed(2)} MB`);
      console.log('Топ-10 по размеру:');
      console.table(items.slice(0, 10));

      return { totalMB: (total / 1024).toFixed(2), items: items.slice(0, 20) };
    }

    function clearClientData(keepDays = 30) {
      const clientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
      const prefix = clientId ? clientId + '_' : '';
      let cleaned = 0;

      const keysToRemove = [];
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (key && key.startsWith('heys_') && key.includes(prefix) && key.includes('dayv2_')) {
          const match = key.match(/dayv2_(\d{4}-\d{2}-\d{2})/);
          if (match) {
            const date = new Date(match[1]);
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - keepDays);
            if (date < cutoff) {
              keysToRemove.push(key);
            }
          }
        }
      }

      keysToRemove.forEach(k => {
        global.localStorage.removeItem(k);
        cleaned++;
      });

      console.log(`🧹 Очищено ${cleaned} записей старше ${keepDays} дней`);
      diagnoseStorage();
      return cleaned;
    }

    function cleanupOtherClientsProducts() {
      const currentClientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
      if (!currentClientId) {
        console.log('❌ Нет текущего клиента');
        return 0;
      }

      const keysToRemove = [];
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (key && key.includes('_products') && !key.includes(currentClientId)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(k => global.localStorage.removeItem(k));
      console.log(`🧹 Удалено ${keysToRemove.length} ключей продуктов других клиентов`);
      diagnoseStorage();
      return keysToRemove.length;
    }

    cloud._storageUtils = {
      getStorageSize,
      getDateFromDayKey,
      cleanupOldData,
      aggressiveCleanup,
      safeSetItem,
      loadPendingQueue,
      savePendingQueue,
      cleanupDuplicateKeys,
      diagnoseStorage,
      clearClientData,
      cleanupOtherClientsProducts,
      maxStorageMb: MAX_STORAGE_MB
    };

    cloud.getStorageInfo = function () {
      const sizeMB = getStorageSize();
      const usedPercent = Math.round((sizeMB / MAX_STORAGE_MB) * 100);
      return {
        sizeMB: sizeMB.toFixed(2),
        maxMB: MAX_STORAGE_MB,
        usedPercent,
        isNearLimit: usedPercent > 80
      };
    };

    cloud.cleanupStorage = cleanupOldData;
    cloud.diagnoseStorage = diagnoseStorage;
    cloud.clearClientData = clearClientData;
    cloud.cleanupDuplicates = cleanupDuplicateKeys;
    cloud.cleanupOtherClientsProducts = cleanupOtherClientsProducts;
  };
})(window);
