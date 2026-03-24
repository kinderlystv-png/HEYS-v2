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
    // 🚀 PERF: Throttle React re-renders during pull — use rAF + direct DOM for smooth visual
    const pullRafRef = useRef(null);
    const lastProgressSyncRef = useRef(0);

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
        + '.no-swipe-zone, [type="range"], [data-no-pull-refresh], '
        // 🚀 PERF R49: ignore tab bar touches — pull-refresh setState triggers re-render cascade (95ms)
        + '.tabs'
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
    // Вся orchestration (flush + sync) делегирована cloud.pullRefresh() —
    // UI-слой только запускает action и показывает статус.
    const handleRefresh = async () => {
      if (refreshInFlightRef.current) {
        return;
      }

      refreshInFlightRef.current = true;
      setIsRefreshing(true);
      setRefreshStatus('syncing');
      triggerHaptic(15);

      const cloud = heys && heys.cloud;

      try {
        // 1. SW update — background, non-blocking
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.ready.then(reg => reg.update?.()).catch(() => { });
        }

        // 2. Unified pull-refresh: flush + delta sync + structured result
        if (cloud?.pullRefresh) {
          console.info('[PullRefresh] 🔄 Starting pull refresh...');
          const result = await Promise.race([
            cloud.pullRefresh(),
            delay(SYNC_TIMEOUT_MS).then(() => SYNC_TIMEOUT)
          ]);

          if (result === SYNC_TIMEOUT) {
            console.warn('[PullRefresh] ⏱️ Timed out after', SYNC_TIMEOUT_MS, 'ms');
            setRefreshStatus('timeout');
            await delay(1100);
            return;
          }

          if (result?.status === 'offline') {
            console.info('[PullRefresh] 📴 Offline — local data active');
          } else if (result?.status === 'no-changes') {
            console.info('[PullRefresh] ✅ No changes (' + (result.totalMs || '?') + 'ms)');
          } else {
            console.info('[PullRefresh] ✅ Synced', result?.keys || 0, 'keys in', result?.totalMs || '?', 'ms');
          }
        } else if (cloud?.syncClient) {
          // Fallback: legacy path without pullRefresh
          const U = heys && heys.utils;
          const clientId = U && U.getCurrentClientId ? U.getCurrentClientId() : '';
          if (clientId) {
            console.info('[PullRefresh] 🔄 Starting sync (legacy)...');
            const syncState = await runSyncWithTimeout(cloud, clientId);
            if (syncState.timedOut) {
              setRefreshStatus('timeout');
              await delay(1100);
              return;
            }
          }
        }

        // 3. Показываем успех
        setRefreshStatus('success');
        triggerHaptic(20);

        // 4. Держим индикатор 600ms для UX, затем сбрасываем
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
          lastProgressSyncRef.current = 0; // 🚀 PERF: reset throttle so first touchmove syncs immediately
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
          pullProgressRef.current = progress;

          // 🚀 PERF: Direct DOM update for smooth 60fps visual (no React re-render)
          if (!pullRafRef.current) {
            pullRafRef.current = requestAnimationFrame(() => {
              const el = document.querySelector('.pull-indicator');
              if (el) {
                const p = pullProgressRef.current;
                el.style.height = Math.max(p, 0) + 'px';
                el.style.opacity = String(Math.min(p / 35, 1));
                const ring = el.querySelector('.pull-spinner-ring');
                if (ring) {
                  ring.style.transform = 'rotate(' + (-90 + Math.min(p / PULL_THRESHOLD, 1) * 180) + 'deg)';
                  const circle = ring.querySelector('circle');
                  if (circle) circle.setAttribute('stroke-dashoffset', String(63 - (Math.min(p / PULL_THRESHOLD, 1) * 63)));
                }
              }
              pullRafRef.current = null;
            });
          }

          // 🚀 PERF: Sync React state only every 200ms (for conditional rendering)
          // But ALWAYS sync on first touchmove to mount the pull indicator element
          const now = Date.now();
          if (lastProgressSyncRef.current === 0 || now - lastProgressSyncRef.current >= 200) {
            setPullProgress(progress);
            lastProgressSyncRef.current = now;
          }

          // Haptic при достижении threshold
          if (progress >= PULL_THRESHOLD && refreshStatusRef.current !== 'ready') {
            setRefreshStatus('ready');
            triggerHaptic(12);
          } else if (progress < PULL_THRESHOLD && refreshStatusRef.current === 'ready') {
            setRefreshStatus('pulling');
          }

          // 🚀 PERF R6: overscroll-behavior-y:none on body handles native overscroll,
          // so we no longer need e.preventDefault() here — lets us use passive:true
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
      // 🚀 PERF R6: passive:true unblocks scroll compositor — overscroll-behavior-y:none on body
      // prevents native pull-to-refresh, so e.preventDefault() is not needed
      document.addEventListener('touchmove', onTouchMove, { passive: true });
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
