// heys_day_offline_sync_v1.js — offline/sync indicator logic
(function () {
  if (!window.HEYS) window.HEYS = {};

  const MOD = {};

  MOD.useOfflineSyncIndicator = function useOfflineSyncIndicator({ React, HEYS }) {
    const { useState, useEffect } = React;
    const heys = HEYS || window.HEYS || {};

    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingChanges, setPendingChanges] = useState(false);
    const [syncMessage, setSyncMessage] = useState(''); // '' | 'offline' | 'pending' | 'syncing' | 'synced'
    const [pendingQueue, setPendingQueue] = useState([]); // Очередь изменений для Optimistic UI

    // Слушаем online/offline события
    useEffect(() => {
      const handleOnline = async () => {
        setIsOnline(true);
        // Автоматическая синхронизация при восстановлении сети
        if (pendingChanges) {
          setSyncMessage('syncing');
          const cloud = heys.cloud;
          const U = heys.utils;
          const clientId = U && U.getCurrentClientId ? U.getCurrentClientId() : '';
          try {
            if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
              await cloud.bootstrapClientSync(clientId);
            }
            setSyncMessage('synced');
            setPendingChanges(false);
            // Скрываем через 2 сек
            setTimeout(() => setSyncMessage(''), 2000);
          } catch (e) {
            setSyncMessage('pending');
          }
        }
      };

      const handleOffline = () => {
        setIsOnline(false);
        setSyncMessage('offline');
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Начальная проверка
      if (!navigator.onLine) {
        setSyncMessage('offline');
      }

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }, [pendingChanges]);

    // Отслеживаем изменения данных (для pendingChanges)
    useEffect(() => {
      const handleDataChange = (e) => {
        if (!navigator.onLine) {
          setPendingChanges(true);
          setSyncMessage('pending');

          // Добавляем в очередь (если есть детали)
          if (e.detail && e.detail.type) {
            setPendingQueue(prev => {
              const newItem = {
                id: Date.now(),
                type: e.detail.type,
                time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              };
              // Максимум 5 последних изменений
              return [...prev, newItem].slice(-5);
            });
          }
        }
      };

      // Слушаем события сохранения
      window.addEventListener('heys:data-saved', handleDataChange);
      return () => window.removeEventListener('heys:data-saved', handleDataChange);
    }, []);

    // Очистка очереди при успешной синхронизации
    useEffect(() => {
      if (syncMessage === 'synced') {
        setPendingQueue([]);
      }
    }, [syncMessage]);

    return {
      isOnline,
      pendingChanges,
      syncMessage,
      pendingQueue
    };
  };

  window.HEYS.dayOfflineSync = MOD;
})();
