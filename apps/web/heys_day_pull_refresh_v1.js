// heys_day_pull_refresh_v1.js — pull-to-refresh logic
(function () {
  if (!window.HEYS) window.HEYS = {};

  const MOD = {};

  MOD.usePullToRefresh = function usePullToRefresh({ React, date, lsGet, lsSet, HEYS }) {
    const { useState, useEffect, useRef } = React;
    const heys = HEYS || window.HEYS || {};
    const SYNC_TIMEOUT = Symbol('pull-refresh-sync-timeout');

    // === Pull-to-refresh (Enhanced) ===
    const [pullProgress, setPullProgress] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshStatus, setRefreshStatus] = useState('idle'); // idle | pulling | ready | syncing | success | error | timeout
    const pullStartY = useRef(0);
    const isPulling = useRef(false);
    const lastHapticRef = useRef(0);
    // 🔧 FIX: Use refs to avoid stale closures in event handlers
    const isRefreshingRef = useRef(false);
    const refreshInFlightRef = useRef(false);
    const refreshStatusRef = useRef('idle');
    const pullProgressRef = useRef(0);

    // Keep refs in sync with state
    useEffect(() => {
      isRefreshingRef.current = isRefreshing;
    }, [isRefreshing]);
    useEffect(() => {
      refreshStatusRef.current = refreshStatus;
    }, [refreshStatus]);
    useEffect(() => {
      pullProgressRef.current = pullProgress;
    }, [pullProgress]);

    // === Pull-to-refresh логика (Enhanced) ===
    const PULL_THRESHOLD = 80;
    const SYNC_TIMEOUT_MS = 8000;
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const shouldIgnoreTarget = (target) => {
      if (!target || typeof target.closest !== 'function') return false;
      return !!target.closest(
        'input, textarea, select, button, a, label, [role="button"], [contenteditable="true"], '
        + '.swipeable-container, table, .tab-switch-group, .advice-list-overlay, .macro-toast, '
        + '.no-swipe-zone, [type="range"], [data-no-pull-refresh]'
      );
    };

    // Haptic feedback helper
    const triggerHaptic = (intensity = 10) => {
      const now = Date.now();
      if (now - lastHapticRef.current > 50 && navigator.vibrate) {
        navigator.vibrate(intensity);
        lastHapticRef.current = now;
      }
    };

    const runSyncWithTimeout = async (cloud, clientId) => {
      const syncResult = await Promise.race([
        cloud.syncClient(clientId, { force: true }),
        delay(SYNC_TIMEOUT_MS).then(() => SYNC_TIMEOUT)
      ]);

      if (syncResult === SYNC_TIMEOUT) {
        console.warn('[PullRefresh] ⏱️ Sync timed out after', SYNC_TIMEOUT_MS, 'ms');
        return { ok: false, timedOut: true };
      }

      if (syncResult && syncResult.success === false) {
        throw new Error(syncResult.error || 'sync_failed');
      }

      return { ok: true, timedOut: false };
    };

    // ✅ Pull-to-refresh: sync из cloud (БЕЗ reload!)
    // Подтягивает изменения куратора, UI обновляется через события heys:day-updated
    const handleRefresh = async () => {
      if (refreshInFlightRef.current) {
        return;
      }

      refreshInFlightRef.current = true;
      setIsRefreshing(true);
      setRefreshStatus('syncing');
      triggerHaptic(15);

      const cloud = heys && heys.cloud;
      const U = heys && heys.utils;
      const clientId = U && U.getCurrentClientId ? U.getCurrentClientId() : '';

      try {
        // 1. Тихая проверка SW (без блокировки)
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.ready.then(reg => reg.update?.()).catch(() => { });
        }

        // 2. КРИТИЧНО: Flush pending данных в cloud ПЕРЕД загрузкой!
        // Используем публичное API getPendingCount() вместо приватной _clientUpsertQueue
        if (cloud?.flushPendingQueue && cloud?.getPendingCount) {
          const pendingCount = cloud.getPendingCount();
          if (pendingCount > 0) {
            console.info('[PullRefresh] ⏳ Flushing', pendingCount, 'pending items...');
            // 🔧 FIX: Увеличиваем таймаут до 5 сек и ЖДЁМ завершения
            const flushed = await cloud.flushPendingQueue(5000);
            if (flushed) {
              console.info('[PullRefresh] ✅ Flush completed');
            } else {
              console.warn('[PullRefresh] ⚠️ Flush timeout, continuing...');
            }
            // Даём серверу время обработать данные
            await delay(300);
          }
        }

        // 3. Sync данных из cloud (подтягиваем изменения куратора)
        // UI обновится автоматически через события heys:day-updated
        if (clientId && cloud && typeof cloud.syncClient === 'function') {
          console.info('[PullRefresh] 🔄 Starting sync...');
          const syncState = await runSyncWithTimeout(cloud, clientId);

          if (syncState.timedOut) {
            setRefreshStatus('timeout');
            await delay(1100);
            return;
          }

          console.info('[PullRefresh] ✅ Sync completed');
        }

        // 4. Показываем успех
        setRefreshStatus('success');
        triggerHaptic(20);

        // 5. Держим индикатор 600ms для UX, затем сбрасываем
        await delay(600);

      } catch (err) {
        console.warn('[PullRefresh] Error:', err.message);
        setRefreshStatus('error');
        await delay(800);
      } finally {
        // Сбрасываем состояние (без reload!)
        queueMicrotask(() => {
          refreshInFlightRef.current = false;
          setIsRefreshing(false);
          setRefreshStatus('idle');
          setPullProgress(0);
        });
      }
    };

    useEffect(() => {
      // 🔧 FIX: Event handlers use refs to avoid stale closures
      // This allows us to use [] deps and NOT re-register listeners on every state change
      const onTouchStart = (e) => {
        if (refreshInFlightRef.current || isRefreshingRef.current) {
          isPulling.current = false;
          return;
        }
        if (e.touches?.length !== 1 || shouldIgnoreTarget(e.target)) {
          isPulling.current = false;
          return;
        }
        // Начинаем pull только если скролл вверху страницы
        if (window.scrollY <= 0) {
          pullStartY.current = e.touches[0].clientY;
          isPulling.current = true;
          setRefreshStatus('pulling');
        }
      };

      const onTouchMove = (e) => {
        // Use refs for current values (avoids stale closure)
        if (!isPulling.current || isRefreshingRef.current) return;
        if (e.touches?.length !== 1 || shouldIgnoreTarget(e.target)) return;

        const y = e.touches[0].clientY;
        const diff = y - pullStartY.current;

        if (diff > 0 && window.scrollY <= 0) {
          // Resistance effect с elastic curve
          const resistance = 0.45;
          const progress = Math.min(diff * resistance, PULL_THRESHOLD * 1.2);
          setPullProgress(progress);

          // Haptic при достижении threshold
          if (progress >= PULL_THRESHOLD && refreshStatusRef.current !== 'ready') {
            setRefreshStatus('ready');
            triggerHaptic(12);
          } else if (progress < PULL_THRESHOLD && refreshStatusRef.current === 'ready') {
            setRefreshStatus('pulling');
          }

          if (diff > 10 && e.cancelable) {
            e.preventDefault(); // Предотвращаем обычный скролл
          }
        }
      };

      const onTouchEnd = () => {
        if (!isPulling.current) return;

        if (refreshInFlightRef.current || isRefreshingRef.current) {
          isPulling.current = false;
          return;
        }

        // Use ref for current pullProgress value
        if (pullProgressRef.current >= PULL_THRESHOLD) {
          handleRefresh();
        } else {
          // Elastic bounce back
          setPullProgress(0);
          setRefreshStatus('idle');
        }
        isPulling.current = false;
      };

      document.addEventListener('touchstart', onTouchStart, { passive: true });
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd, { passive: true });

      return () => {
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 🔧 Empty deps — handlers use refs, no re-registration needed

    return {
      pullProgress,
      isRefreshing,
      refreshStatus,
      pullThreshold: PULL_THRESHOLD
    };
  };

  window.HEYS.dayPullRefresh = MOD;
})();
