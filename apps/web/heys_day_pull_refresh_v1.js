// heys_day_pull_refresh_v1.js — pull-to-refresh logic
(function () {
  if (!window.HEYS) window.HEYS = {};

  const MOD = {};

  MOD.usePullToRefresh = function usePullToRefresh({ React, date, lsGet, lsSet, HEYS }) {
    const { useState, useEffect, useRef } = React;
    const heys = HEYS || window.HEYS || {};

    // === Pull-to-refresh (Enhanced) ===
    const [pullProgress, setPullProgress] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshStatus, setRefreshStatus] = useState('idle'); // idle | pulling | ready | syncing | success | error
    const pullStartY = useRef(0);
    const isPulling = useRef(false);
    const lastHapticRef = useRef(0);
    // 🔧 FIX: Use refs to avoid stale closures in event handlers
    const isRefreshingRef = useRef(false);
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

    // Haptic feedback helper
    const triggerHaptic = (intensity = 10) => {
      const now = Date.now();
      if (now - lastHapticRef.current > 50 && navigator.vibrate) {
        navigator.vibrate(intensity);
        lastHapticRef.current = now;
      }
    };

    const handleRefresh = async () => {
      setIsRefreshing(true);
      setRefreshStatus('syncing');
      triggerHaptic(15);

      const cloud = heys && heys.cloud;
      const U = heys && heys.utils;
      const clientId = U && U.getCurrentClientId ? U.getCurrentClientId() : '';

      // Timeout 15 секунд — если sync зависнет, индикатор не будет крутиться вечно
      const REFRESH_TIMEOUT = 15000;
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Refresh timeout')), REFRESH_TIMEOUT);
      });

      try {
        // 🆕 1. ПРИНУДИТЕЛЬНАЯ проверка версии PWA (очистка кэшей + reload если есть обновление)
        if (window.HEYS?.forceCheckAndUpdate) {
// console.log('[PullRefresh] 🔍 Checking for PWA updates...');
          const updateResult = await window.HEYS.forceCheckAndUpdate();

          if (updateResult.hasUpdate) {
// console.log('[PullRefresh] 🆕 PWA update found! Reloading...');
            setRefreshStatus('updating');
            triggerHaptic(30);

            // Небольшая задержка для показа статуса + cache invalidation
            await new Promise(r => setTimeout(r, 500));

            // Hard reload с cache-bust
            const url = new URL(window.location.href);
            url.searchParams.set('_v', Date.now().toString());
            window.location.href = url.toString();
            return; // Не продолжаем — страница перезагрузится
          }
        }

        // 1a. Тихая проверка/обновление SW (без reload если нет новой версии)
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.ready.then(reg => reg.update?.()).catch(() => {});
        }

        // 2. Реальная синхронизация с Supabase (с force=true для bypass throttling)
        const syncPromise = (async () => {
          if (clientId && cloud && typeof cloud.syncClient === 'function') {
// console.log('[PullRefresh] 🚀 Starting force sync for client:', clientId.substring(0, 8));

            // � ВАЖНО: Сначала отправляем pending изменения в cloud, потом скачиваем
            // Иначе race condition: cloud вернёт старые данные и перезапишет свежие локальные
            if (cloud.flushPendingQueue) {
              const pendingCount = (cloud._clientUpsertQueue?.length || 0);
              if (pendingCount > 0) {
// console.log(`[PullRefresh] 🔄 Flushing ${pendingCount} pending items before sync...`);
                await cloud.flushPendingQueue(5000);
// console.log('[PullRefresh] ✅ Pending items flushed');
              }
            }

            // �🔐 Универсальный sync — автоматически выбирает RPC для PIN auth
            const syncResult = await cloud.syncClient(clientId, { force: true });

            // 🚨 Проверяем нужна ли авторизация (токен истёк/отсутствует)
            if (syncResult?.authRequired) {
// console.log('[PullRefresh] 🔐 Auth required — triggering logout');

              // 🚨 CRITICAL: Устанавливаем глобальный флаг ПЕРЕД очисткой данных
              // Это предотвращает краш хуков при попытке React перерендерить компонент
              window.HEYS = window.HEYS || {};
              window.HEYS._isLoggingOut = true;
// console.log('[PullRefresh] 🚫 Set _isLoggingOut flag');

              // Сбрасываем ВСЁ состояние авторизации для показа экрана логина
              try {
                // 🔧 FIX: Используем lsSet для правильной очистки (включая memory cache)
                // и localStorage.removeItem для гарантии удаления сырого ключа
                localStorage.removeItem('heys_supabase_auth_token');
                localStorage.removeItem('heys_pin_auth_client');
                localStorage.removeItem('heys_client_current');
                localStorage.removeItem('heys_last_client_id');

                // Также очищаем через storage layer для сброса memory cache
                if (lsSet) {
                  lsSet('heys_client_current', null);
                }

                // Сбрасываем глобальный clientId
                if (window.HEYS) {
                  window.HEYS.currentClientId = null;
                }

                // Очищаем memory cache полностью
                if (window.HEYS?.store?.flushMemory) {
                  window.HEYS.store.flushMemory();
                }

// console.log('[PullRefresh] 🗑️ All auth keys cleared');
              } catch (e) {
                console.warn('[PullRefresh] Error clearing auth keys:', e);
              }
              // Задержка 100ms для гарантии записи + подавления React ошибок
              await new Promise(r => setTimeout(r, 100));
              // Перезагрузка покажет экран логина (gate сработает т.к. clientId = null)
              window.location.reload();
              return;
            }

            // 🔄 ГАРАНТИЯ: Явно инвалидируем кэш перед чтением (на случай если sync не вызвал)
            if (window.HEYS?.store?.flushMemory) {
              window.HEYS.store.flushMemory();
// console.log('[PullRefresh] 🧹 Memory cache flushed before reading');
            }

            // 🔄 ЯВНАЯ перезагрузка данных после sync (не полагаемся только на событие)
            const dayKey = 'heys_dayv2_' + date;

            // 🔍 DEBUG: Проверяем какой clientId используется при чтении
            const actualClientId = window.HEYS?.currentClientId ||
              (localStorage.getItem('heys_client_current') ? JSON.parse(localStorage.getItem('heys_client_current')) : 'none');
            const actualKey = actualClientId !== 'none' ? `heys_${actualClientId}_dayv2_${date}` : dayKey;
// console.log('[PullRefresh] 🔍 Reading with clientId:', actualClientId?.substring?.(0, 8) || actualClientId, '| actualKey:', actualKey);

            // 🔍 DEBUG: Читаем напрямую из localStorage для сравнения
            const rawValue = localStorage.getItem(actualKey);
            let rawDay = null;
            try { rawDay = rawValue ? JSON.parse(rawValue) : null; } catch (e) {}
// console.log('[PullRefresh] 🔍 RAW localStorage | meals:', rawDay?.meals?.length, '| updatedAt:', rawDay?.updatedAt);

            // ✅ НЕ вызываем setDay здесь — handleDayUpdated уже обработал обновление из syncClient
            // Этот дублирующий setDay вызывал мерцание экрана (double render)
            const freshDay = lsGet(dayKey, null);
// console.log('[PullRefresh] ✅ Sync complete | localStorage has meals:', freshDay?.meals?.length, '| updatedAt:', freshDay?.updatedAt ? new Date(freshDay.updatedAt).toISOString() : 'none');
            // Day state уже обновлён через событие heys:day-updated → handleDayUpdated
          } else {
// console.log('[PullRefresh] ⚠️ Sync not available | clientId:', clientId, '| cloud:', !!cloud);
          }
        })();

        await Promise.race([syncPromise, timeoutPromise]);
        clearTimeout(timeoutId);

        // Минимальная задержка для плавного UX
        await new Promise(r => setTimeout(r, 300));

        setRefreshStatus('success');
        triggerHaptic(20);

        // Показываем успех 600ms, затем сброс
        await new Promise(r => setTimeout(r, 600));

      } catch (err) {
        clearTimeout(timeoutId);
        setRefreshStatus('error');
        console.warn('[PullRefresh] Sync failed:', err.message);
        // Короткий показ ошибки
        await new Promise(r => setTimeout(r, 800));
      } finally {
        // 🔧 FIX: Batch setState calls to prevent multiple re-renders
        // React 18 auto-batches in event handlers but NOT in async/await
        // Using queueMicrotask ensures all updates happen in single render
        queueMicrotask(() => {
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
