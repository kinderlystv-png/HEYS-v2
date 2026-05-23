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
    const blockedNoticeAtRef = useRef(0);
    /** Ephemeral sync-style overlay (same visual language as sync-lock-overlay) when pull is blocked by pending queue */
    const pullHoldOverlayRootRef = useRef(null);
    const pullHoldAutoDismissRef = useRef(null);
    const pullHoldFadeTimeoutRef = useRef(null);

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
    const READY_SETTLE_MS = 180;
    const MIN_SYNCING_MS = 640;
    const SUCCESS_HOLD_MS = 920;
    const ERROR_HOLD_MS = 1080;
    const TIMEOUT_HOLD_MS = 1240;
    const EXIT_COLLAPSE_MS = 320;
    const READY_LOCK_HEIGHT = 52;
    const SYNCING_LOCK_HEIGHT = 56;
    const EXIT_COLLAPSE_HEIGHT = 40;
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const ensureMinimumPhase = async (startedAt, minMs) => {
      const elapsed = Date.now() - startedAt;
      const remaining = minMs - elapsed;
      if (remaining > 0) {
        await delay(remaining);
      }
    };

    const finishRefreshFlow = async (status, holdMs) => {
      setRefreshStatus(status);
      if (status === 'success') {
        triggerHaptic(20);
      }

      await delay(holdMs);

      setPullProgress(EXIT_COLLAPSE_HEIGHT);
      setIsRefreshing(false);
      await delay(16);
      setPullProgress(0);
      await delay(EXIT_COLLAPSE_MS);
      setRefreshStatus('idle');
    };

    const shouldIgnoreTarget = (target) => {
      if (!target || typeof target.closest !== 'function') return false;
      return !!target.closest(
        'input, textarea, select, button, a, label, [role="button"], [contenteditable="true"], '
        + '.swipeable-container, table, .tab-switch-group, .advice-list-overlay, .macro-toast, '
        + '.no-swipe-zone, [type="range"], [data-no-pull-refresh], '
        + '.planning-tab, .planning-content, .planning-subnav, .planning-subnav-shell, '
        + '.date-picker-backdrop, .time-picker-backdrop, .zone-formula-backdrop, '
        // Morning checkin wheel pickers (вес, часы/минуты сна и т.д.) — крутятся как
        // scroll-container, без этого их свайп ловит pull-refresh.
        + '.mc-wheel-picker, .mc-wheel-values, .mc-time-pickers, .mood-rating-card, '
        + '.mc-quality-slider, '
        // 🚀 PERF R49: ignore tab bar touches — pull-refresh setState triggers re-render cascade (95ms)
        + '.tabs'
      );
    };

    /** Pull разрешён только на дневных вкладках (body.heys-pull-refresh-day-active) и вне planning. */
    const isPullRefreshEnvironmentActive = () => {
      try {
        if (typeof document === 'undefined' || !document.body) return false;
        if (document.body.classList.contains('planning-tab-active')) return false;
        return document.body.classList.contains('heys-pull-refresh-day-active');
      } catch (e) {
        return false;
      }
    };

    const isMainSyncLockVisible = () => {
      try {
        return !!document.querySelector('.sync-lock-overlay:not(.sync-lock-overlay--ephemeral)');
      } catch (e) {
        return false;
      }
    };

    // Haptic feedback helper
    const triggerHaptic = (intensity = 10) => {
      const now = Date.now();
      if (now - lastHapticRef.current > 50 && navigator.vibrate) {
        navigator.vibrate(intensity);
        lastHapticRef.current = now;
      }
    };

    const getRuntimePendingCount = () => {
      try {
        return heys?.cloud?.getPendingCount?.() || 0;
      } catch (e) {
        return 0;
      }
    };

    const PULL_HOLD_OVERLAY_MS = 2200;
    const PULL_HOLD_OVERLAY_ID = 'heys-pull-hold-overlay';

    const clearPullHoldBlockOverlay = () => {
      if (pullHoldAutoDismissRef.current) {
        clearTimeout(pullHoldAutoDismissRef.current);
        pullHoldAutoDismissRef.current = null;
      }
      if (pullHoldFadeTimeoutRef.current) {
        clearTimeout(pullHoldFadeTimeoutRef.current);
        pullHoldFadeTimeoutRef.current = null;
      }
      const root = pullHoldOverlayRootRef.current;
      if (root && root.parentNode) {
        try {
          root.parentNode.removeChild(root);
        } catch (e) { }
      }
      pullHoldOverlayRootRef.current = null;
    };

    const dismissPullHoldBlockOverlayWithFade = () => {
      const root = pullHoldOverlayRootRef.current;
      if (!root) return;
      if (root.classList.contains('sync-lock-overlay--ephemeral-out')) return;
      root.classList.add('sync-lock-overlay--ephemeral-out');
      const finish = () => {
        clearPullHoldBlockOverlay();
      };
      root.addEventListener('animationend', finish, { once: true });
      if (pullHoldFadeTimeoutRef.current) clearTimeout(pullHoldFadeTimeoutRef.current);
      pullHoldFadeTimeoutRef.current = setTimeout(finish, 380);
    };

    const showPullRefreshHoldOverlay = () => {
      if (isMainSyncLockVisible()) {
        return;
      }
      clearPullHoldBlockOverlay();

      const root = document.createElement('div');
      root.id = PULL_HOLD_OVERLAY_ID;
      root.className = 'sync-lock-overlay sync-lock-overlay--ephemeral';
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('aria-busy', 'true');

      const card = document.createElement('div');
      card.className = 'sync-lock-overlay__card';

      const spin = document.createElement('div');
      spin.className = 'sync-lock-overlay__spinner sync-lock-overlay__spinner--hold';
      spin.setAttribute('aria-hidden', 'true');
      const cloud = document.createElement('span');
      cloud.className = 'sync-lock-overlay__cloud';
      cloud.textContent = '☁';
      spin.appendChild(cloud);

      const title = document.createElement('div');
      title.className = 'sync-lock-overlay__title';
      title.id = 'heys-pull-hold-overlay-title';
      title.textContent = 'Подождите';

      const subtitle = document.createElement('div');
      subtitle.className = 'sync-lock-overlay__subtitle';
      subtitle.textContent = 'Сначала дождитесь завершения синхронизации';

      card.appendChild(spin);
      card.appendChild(title);
      card.appendChild(subtitle);
      root.appendChild(card);

      root.addEventListener('click', () => {
        dismissPullHoldBlockOverlayWithFade();
      });

      document.body.appendChild(root);
      pullHoldOverlayRootRef.current = root;
      pullHoldAutoDismissRef.current = setTimeout(dismissPullHoldBlockOverlayWithFade, PULL_HOLD_OVERLAY_MS);
    };

    const notifyPullRefreshBlocked = (pendingCount) => {
      const now = Date.now();
      if (now - blockedNoticeAtRef.current < 1500) return;

      blockedNoticeAtRef.current = now;
      triggerHaptic(20);
      console.info('[HEYS.pullRefresh] 🚫 Pull-to-refresh blocked while sync is pending', {
        pendingCount,
      });
      try {
        showPullRefreshHoldOverlay();
      } catch (e) { }
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

    const performRefreshSync = async (cloud) => {
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
          return { ok: false, timedOut: true };
        }

        if (result?.status === 'offline') {
          console.info('[PullRefresh] 📴 Offline — local data active');
        } else if (result?.status === 'no-changes') {
          console.info('[PullRefresh] ✅ No changes (' + (result.totalMs || '?') + 'ms)');
        } else {
          console.info('[PullRefresh] ✅ Synced', result?.keys || 0, 'keys in', result?.totalMs || '?', 'ms');
        }

        return { ok: true, timedOut: false };
      }

      if (cloud?.syncClient) {
        // Fallback: legacy path without pullRefresh
        const U = heys && heys.utils;
        const clientId = U && U.getCurrentClientId ? U.getCurrentClientId() : '';
        if (clientId) {
          console.info('[PullRefresh] 🔄 Starting sync (legacy)...');
          return await runSyncWithTimeout(cloud, clientId);
        }
      }

      return { ok: true, timedOut: false };
    };

    // ✅ Pull-to-refresh: sync из cloud (БЕЗ reload!)
    // Подтягивает изменения куратора, UI обновляется через события heys:day-updated
    // Вся orchestration (flush + sync) делегирована cloud.pullRefresh() —
    // UI-слой только запускает action и показывает статус.
    const handleRefresh = async () => {
      if (!isPullRefreshEnvironmentActive()) {
        return;
      }
      if (refreshInFlightRef.current) {
        return;
      }

      const pendingCount = getRuntimePendingCount();
      if (pendingCount > 0) {
        notifyPullRefreshBlocked(pendingCount);
        setPullProgress(0);
        setRefreshStatus('idle');
        return;
      }

      refreshInFlightRef.current = true;
      setIsRefreshing(true);
      setPullProgress(Math.max(pullProgressRef.current, READY_LOCK_HEIGHT));
      setRefreshStatus('ready');
      triggerHaptic(15);

      const cloud = heys && heys.cloud;
      const syncTask = performRefreshSync(cloud);
      let syncingStartedAt = 0;

      try {
        // 3. Даже если sync уже завершился, пользователь должен успеть почувствовать
        // подтверждённый release → syncing как отдельные контролируемые этапы.
        await delay(READY_SETTLE_MS);
        setPullProgress(SYNCING_LOCK_HEIGHT);
        setRefreshStatus('syncing');
        syncingStartedAt = Date.now();
        const syncState = await syncTask;

        if (syncState.timedOut) {
          await ensureMinimumPhase(syncingStartedAt, MIN_SYNCING_MS);
          await finishRefreshFlow('timeout', TIMEOUT_HOLD_MS);
          return;
        }

        // 4. Даже при супер-быстром no-changes показываем минимальный smooth flow
        await ensureMinimumPhase(syncingStartedAt, MIN_SYNCING_MS);
        await finishRefreshFlow('success', SUCCESS_HOLD_MS);

      } catch (err) {
        console.warn('[PullRefresh] Error:', err.message);
        if (!syncingStartedAt) {
          await delay(Math.max(0, READY_SETTLE_MS - 16));
          setPullProgress(SYNCING_LOCK_HEIGHT);
          setRefreshStatus('syncing');
          syncingStartedAt = Date.now();
        }
        await ensureMinimumPhase(syncingStartedAt, MIN_SYNCING_MS);
        await finishRefreshFlow('error', ERROR_HOLD_MS);
      } finally {
        // Сбрасываем состояние (без reload!)
        queueMicrotask(() => {
          refreshInFlightRef.current = false;
          setPullProgress(0);
        });
      }
    };

    useEffect(() => {
      // 🔧 FIX: Event handlers use refs to avoid stale closures
      // This allows us to use [] deps and NOT re-register listeners on every state change
      const onTouchStart = (e) => {
        if (!isPullRefreshEnvironmentActive()) {
          isPulling.current = false;
          return;
        }
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
          const pendingCount = getRuntimePendingCount();
          if (pendingCount > 0) {
            isPulling.current = false;
            notifyPullRefreshBlocked(pendingCount);
            return;
          }

          pullStartY.current = e.touches[0].clientY;
          isPulling.current = true;
          lastProgressSyncRef.current = 0; // 🚀 PERF: reset throttle so first touchmove syncs immediately
          setRefreshStatus('pulling');
        }
      };

      const onTouchMove = (e) => {
        if (!isPullRefreshEnvironmentActive()) {
          isPulling.current = false;
          return;
        }
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
            const rafId = requestAnimationFrame(() => {
              pullRafRef.current = null;
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
            });
            pullRafRef.current = rafId;
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
        if (!isPullRefreshEnvironmentActive()) {
          isPulling.current = false;
          return;
        }
        if (!isPulling.current) return;

        if (refreshInFlightRef.current || isRefreshingRef.current) {
          isPulling.current = false;
          return;
        }

        const pendingCount = getRuntimePendingCount();
        if (pendingCount > 0) {
          notifyPullRefreshBlocked(pendingCount);
          setPullProgress(0);
          setRefreshStatus('idle');
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
        if (pullRafRef.current != null) {
          cancelAnimationFrame(pullRafRef.current);
          pullRafRef.current = null;
        }
        clearPullHoldBlockOverlay();
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
