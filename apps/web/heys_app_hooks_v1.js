// heys_app_hooks_v1.js — App hooks extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const U = HEYS.utils || {};

    const tryParseStoredValue = (raw, fallback) => {
        if (raw === null || raw === undefined) return fallback;
        if (typeof raw === 'string') {
            let str = raw;
            if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
                try { str = HEYS.store.decompress(str); } catch (_) { }
            }
            try { return JSON.parse(str); } catch (_) { return str; }
        }
        return raw;
    };

    const readStoredValue = (key, fallback) => {
        try {
            if (HEYS.store?.get) {
                const stored = HEYS.store.get(key, null);
                if (stored !== null && stored !== undefined) {
                    return tryParseStoredValue(stored, fallback);
                }
            }
            if (U.lsGet) {
                const legacy = U.lsGet(key, fallback);
                if (legacy !== null && legacy !== undefined) return legacy;
            }
            const raw = localStorage.getItem(key);
            return tryParseStoredValue(raw, fallback);
        } catch {
            return fallback;
        }
    };

    const readGlobalValue = (key, fallback) => {
        try {
            if (HEYS.store?.get) {
                const stored = HEYS.store.get(key, null);
                if (stored !== null && stored !== undefined) {
                    return tryParseStoredValue(stored, fallback);
                }
            }
            const raw = localStorage.getItem(key);
            if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, fallback);
            if (U.lsGet) return U.lsGet(key, fallback);
            return fallback;
        } catch {
            return fallback;
        }
    };

    const writeStoredValue = (key, value) => {
        try {
            if (HEYS.store?.set) {
                HEYS.store.set(key, value);
                return;
            }
            if (U.lsSet) {
                U.lsSet(key, value);
                return;
            }
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, serialized);
        } catch { }
    };

    const writeGlobalValue = (key, value) => {
        try {
            if (HEYS.store?.set) {
                HEYS.store.set(key, value);
                return;
            }
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, serialized);
        } catch { }
    };

    const removeGlobalValue = (key) => {
        try {
            if (HEYS.store?.set) HEYS.store.set(key, null);
        } catch { }
        try { localStorage.removeItem(key); } catch { }
    };

    // NET Atwater migration: recompute kcal100 = 3×Б + 4×У + 9×Ж
    // Fixes product list saved with old protein×4 formula (v3.9.0 regression)
    const migrateProductsKcalNetAtwater = (list) => {
        if (!Array.isArray(list) || list.length === 0) return list;
        const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
        const round1 = (v) => Math.round(v * 10) / 10;
        let changed = 0;
        const result = list.map((p) => {
            if (!p || p._kcalNetAtwater) return p;
            const carbs = p.carbs100 != null
                ? toNum(p.carbs100)
                : toNum(p.simple100) + toNum(p.complex100);
            const fat = p.fat100 != null
                ? toNum(p.fat100)
                : toNum(p.badFat100) + toNum(p.goodFat100) + toNum(p.trans100);
            const newKcal = round1(3 * toNum(p.protein100) + 4 * carbs + 9 * fat);
            if (newKcal !== toNum(p.kcal100)) changed++;
            return { ...p, kcal100: newKcal, _kcalNetAtwater: true };
        });
        if (changed > 0) {
            console.info('[HEYS.migration] ✅ NET Atwater kcal migration:', { changed, total: list.length });
        }
        return result;
    };

    function useThemePreference() {
        const React = window.React;
        const { useState, useEffect, useMemo, useCallback } = React;
        const [theme, setTheme] = useState(() => {
            try {
                const saved = readGlobalValue('heys_theme', 'light');
                return ['light', 'dark', 'auto'].includes(saved) ? saved : 'light';
            } catch {
                return 'light';
            }
        });

        const resolvedTheme = useMemo(() => {
            if (theme === 'auto') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            return theme;
        }, [theme]);

        useEffect(() => {
            document.documentElement.setAttribute('data-theme', resolvedTheme);
            try {
                writeGlobalValue('heys_theme', theme);
            } catch { }

            if (theme !== 'auto') return;

            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = () => {
                document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
            };
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }, [theme, resolvedTheme]);

        const cycleTheme = useCallback(() => {
            setTheme(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'auto' : 'light');
        }, []);

        return { theme, resolvedTheme, cycleTheme };
    }

    function usePwaPrompts() {
        const React = window.React;
        const { useState, useEffect, useMemo, useCallback } = React;
        const [pwaInstallPrompt, setPwaInstallPrompt] = useState(null);
        const [showPwaBanner, setShowPwaBanner] = useState(false);
        const [showIosPwaBanner, setShowIosPwaBanner] = useState(false);

        // Определяем iOS Safari
        const isIosSafari = useMemo(() => {
            const ua = navigator.userAgent || '';
            const isIos = /iPhone|iPad|iPod/.test(ua);
            const isWebkit = /WebKit/.test(ua);
            const isChrome = /CriOS/.test(ua);
            const isFirefox = /FxiOS/.test(ua);
            // iOS Safari = iOS + WebKit + не Chrome + не Firefox
            return isIos && isWebkit && !isChrome && !isFirefox;
        }, []);

        // Слушаем beforeinstallprompt событие (Android/Desktop)
        useEffect(() => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                window.navigator.standalone === true;
            if (isStandalone) return;

            const dismissed = readGlobalValue('heys_pwa_banner_dismissed', null);
            if (dismissed) {
                const dismissedTime = parseInt(dismissed, 10);
                if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) return;
            }

            if (isIosSafari) {
                setTimeout(() => setShowIosPwaBanner(true), 3000);
                return;
            }

            const handler = (e) => {
                e.preventDefault();
                setPwaInstallPrompt(e);
                setTimeout(() => setShowPwaBanner(true), 3000);
            };

            window.addEventListener('beforeinstallprompt', handler);
            return () => window.removeEventListener('beforeinstallprompt', handler);
        }, [isIosSafari]);

        const handlePwaInstall = useCallback(async () => {
            if (!pwaInstallPrompt) return;
            pwaInstallPrompt.prompt();
            const { outcome } = await pwaInstallPrompt.userChoice;
            if (outcome === 'accepted') {
                setShowPwaBanner(false);
                writeGlobalValue('heys_pwa_installed', 'true');
            }
            setPwaInstallPrompt(null);
        }, [pwaInstallPrompt]);

        const dismissPwaBanner = useCallback(() => {
            setShowPwaBanner(false);
            writeGlobalValue('heys_pwa_banner_dismissed', Date.now().toString());
        }, []);

        const dismissIosPwaBanner = useCallback(() => {
            setShowIosPwaBanner(false);
            writeGlobalValue('heys_pwa_banner_dismissed', Date.now().toString());
        }, []);

        return { showPwaBanner, showIosPwaBanner, handlePwaInstall, dismissPwaBanner, dismissIosPwaBanner };
    }

    // === 📱 Screen Wake Lock API — предотвращение выключения экрана ===
    // Используется когда пользователь активно работает (таймер инсулиновой волны, готовка)
    function useWakeLock() {
        const React = window.React;
        const wakeLockRef = React.useRef(null);
        const [isWakeLockActive, setIsWakeLockActive] = React.useState(false);

        // Проверка поддержки
        const isSupported = React.useMemo(() => {
            return 'wakeLock' in navigator;
        }, []);

        // Запрос Wake Lock
        const requestWakeLock = React.useCallback(async () => {
            if (!isSupported) {
                console.warn('[WakeLock] Not supported in this browser');
                return false;
            }

            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                setIsWakeLockActive(true);
                console.log('[WakeLock] 🔆 Screen wake lock acquired');

                // Слушаем release (например, при сворачивании приложения)
                wakeLockRef.current.addEventListener('release', () => {
                    console.log('[WakeLock] Wake lock released');
                    setIsWakeLockActive(false);
                });

                // Haptic feedback
                if (navigator.vibrate) navigator.vibrate(10);

                return true;
            } catch (err) {
                console.warn('[WakeLock] Failed to acquire:', err.message);
                setIsWakeLockActive(false);
                return false;
            }
        }, [isSupported]);

        // Освобождение Wake Lock
        const releaseWakeLock = React.useCallback(async () => {
            if (wakeLockRef.current) {
                try {
                    await wakeLockRef.current.release();
                    wakeLockRef.current = null;
                    setIsWakeLockActive(false);
                    console.log('[WakeLock] 🔅 Screen wake lock released manually');
                } catch (err) {
                    console.warn('[WakeLock] Failed to release:', err.message);
                }
            }
        }, []);

        // Автоматическое перезапрашивание при возвращении на вкладку
        React.useEffect(() => {
            if (!isSupported || !isWakeLockActive) return;

            const handleVisibilityChange = async () => {
                if (document.visibilityState === 'visible' && !wakeLockRef.current) {
                    // Перезапрашиваем wake lock после возвращения на вкладку
                    await requestWakeLock();
                }
            };

            document.addEventListener('visibilitychange', handleVisibilityChange);
            return () => {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            };
        }, [isSupported, isWakeLockActive, requestWakeLock]);

        // Cleanup при unmount
        React.useEffect(() => {
            return () => {
                if (wakeLockRef.current) {
                    wakeLockRef.current.release().catch(() => { });
                }
            };
        }, []);

        return {
            isSupported,
            isWakeLockActive,
            requestWakeLock,
            releaseWakeLock
        };
    }

    function useCloudSyncStatus() {
        const React = window.React;
        const { useState, useRef, useCallback, useEffect } = React;
        const [cloudStatus, setCloudStatus] = useState(() => navigator.onLine ? 'idle' : 'offline');
        const [pendingCount, setPendingCount] = useState(0);
        const [pendingDetails, setPendingDetails] = useState({ days: 0, products: 0, profile: 0, other: 0 });
        const [showOfflineBanner, setShowOfflineBanner] = useState(false);
        const [showOnlineBanner, setShowOnlineBanner] = useState(false);
        const [syncProgress, setSyncProgress] = useState({ synced: 0, total: 0 });
        const [retryCountdown, setRetryCountdown] = useState(0);
        // 🆕 Время офлайн для улучшенного UX
        const [offlineDuration, setOfflineDuration] = useState(0);
        const offlineStartRef = useRef(null);
        const offlineDurationIntervalRef = useRef(null);

        const cloudSyncTimeoutRef = useRef(null);
        const pendingChangesRef = useRef(false);
        const syncingStartRef = useRef(null);
        const syncedTimeoutRef = useRef(null);
        const syncingDelayTimeoutRef = useRef(null);
        const initialCheckDoneRef = useRef(false);
        const retryIntervalRef = useRef(null);
        // � Debounce для auth_required toast
        const authErrorShownRef = useRef(false);
        const authErrorTimeoutRef = useRef(null);
        // �🔒 Cooldown после первого sync — не показываем "syncing" сразу после загрузки
        const initialSyncCompletedAtRef = useRef(0);
        const INITIAL_SYNC_COOLDOWN_MS = 3000; // 3 секунды после первого sync не показываем syncing

        const MIN_SYNCING_DURATION = 1500;
        const SYNCING_DELAY = 400;

        const showSyncedWithMinDuration = useCallback(() => {
            if (syncedTimeoutRef.current) return;

            const elapsed = syncingStartRef.current ? Date.now() - syncingStartRef.current : 0;
            const remaining = Math.max(0, MIN_SYNCING_DURATION - elapsed);

            syncedTimeoutRef.current = setTimeout(() => {
                syncedTimeoutRef.current = null;
                syncingStartRef.current = null;
                setCloudStatus('synced');
                // Звук синхронизации убран — теперь звуки только в геймификации
                setSyncProgress({ synced: 0, total: 0 });
                if (cloudSyncTimeoutRef.current) clearTimeout(cloudSyncTimeoutRef.current);
                cloudSyncTimeoutRef.current = setTimeout(() => {
                    setCloudStatus('idle');
                }, 2000);
            }, remaining);
        }, []);

        useEffect(() => {
            const handleSyncComplete = () => {
                // ⚡️ Первый heysSyncCompleted после инициализации не должен триггерить UI
                // если не было фактических локальных изменений/отложенных синков — иначе мерцание
                const hadPendingWork =
                    syncingStartRef.current ||
                    pendingChangesRef.current ||
                    (syncProgress.total > 0) ||
                    (pendingCount > 0);
                if (!hadPendingWork) {
                    // 🔒 Запоминаем время первого sync для cooldown
                    if (!initialSyncCompletedAtRef.current) {
                        initialSyncCompletedAtRef.current = Date.now();
                    }
                    return;
                }

                if (syncingDelayTimeoutRef.current) {
                    clearTimeout(syncingDelayTimeoutRef.current);
                    syncingDelayTimeoutRef.current = null;
                }
                if (cloudSyncTimeoutRef.current) {
                    clearTimeout(cloudSyncTimeoutRef.current);
                    cloudSyncTimeoutRef.current = null;
                }
                pendingChangesRef.current = false;
                if (navigator.onLine) {
                    showSyncedWithMinDuration();
                }
            };

            const handleDataSaved = () => {
                pendingChangesRef.current = true;

                if (!navigator.onLine) {
                    setCloudStatus('offline');
                    return;
                }

                if (syncedTimeoutRef.current) {
                    return;
                }

                // 🔒 Cooldown: не показываем "syncing" сразу после первого sync
                // Это предотвращает мерцание когда merged данные сохраняются обратно в облако
                const timeSinceInitialSync = initialSyncCompletedAtRef.current
                    ? Date.now() - initialSyncCompletedAtRef.current
                    : Infinity;
                if (timeSinceInitialSync < INITIAL_SYNC_COOLDOWN_MS) {
                    // Тихо сохраняем без UI-индикации
                    return;
                }

                if (cloudSyncTimeoutRef.current) {
                    clearTimeout(cloudSyncTimeoutRef.current);
                    cloudSyncTimeoutRef.current = null;
                }

                if (!syncingStartRef.current) {
                    syncingStartRef.current = Date.now();

                    if (!syncingDelayTimeoutRef.current) {
                        syncingDelayTimeoutRef.current = setTimeout(() => {
                            syncingDelayTimeoutRef.current = null;
                            if (syncingStartRef.current && !syncedTimeoutRef.current) {
                                setCloudStatus('syncing');
                            }
                        }, SYNCING_DELAY);
                    }
                }

                if (!cloudSyncTimeoutRef.current) {
                    cloudSyncTimeoutRef.current = setTimeout(() => {
                        pendingChangesRef.current = false;
                        showSyncedWithMinDuration();
                    }, 5000);
                }
            };

            const handlePendingChange = (e) => {
                const count = e.detail?.count || 0;
                const details = e.detail?.details || { days: 0, products: 0, profile: 0, other: 0 };
                setPendingCount(count);
                setPendingDetails(details);

                if (syncProgress.total > 0 && count < syncProgress.total) {
                    setSyncProgress(prev => ({ ...prev, synced: prev.total - count }));
                }

                if (count > 0 && !navigator.onLine) {
                    setCloudStatus('offline');
                }
            };

            const handleSyncProgress = (e) => {
                const { synced, total } = e.detail || {};
                if (typeof synced === 'number' && typeof total === 'number') {
                    setSyncProgress({ synced, total });
                }
            };

            const handleSyncError = (e) => {
                const code = e.detail?.error;
                const isPersistent = e.detail?.persistent || false;

                if (code === 'auth_required') {
                    setCloudStatus('offline');
                    setRetryCountdown(0);

                    // 🔥 Debounce: показываем toast и делаем logout только если не делали в последние 10 сек
                    if (!authErrorShownRef.current) {
                        authErrorShownRef.current = true;
                        try { HEYS.Toast?.error('Сессия истекла. Требуется повторный вход'); } catch (_) { }

                        // 🚪 FORCE LOGOUT: Dispatch события для автоматического выхода на экран логина
                        window.dispatchEvent(new CustomEvent('heys:force-logout', {
                            detail: { reason: 'auth_required' }
                        }));

                        // Сбрасываем флаг через 10 секунд
                        if (authErrorTimeoutRef.current) clearTimeout(authErrorTimeoutRef.current);
                        authErrorTimeoutRef.current = setTimeout(() => {
                            authErrorShownRef.current = false;
                        }, 10000);
                    }
                    return;
                }

                // 🔥 Если ошибка критическая (persistent), показываем тост
                if (isPersistent) {
                    try { HEYS.Toast?.error(`Ошибка синхронизации: ${code}`) || console.error(`Sync error: ${code}`); } catch (_) { }
                }

                const retryIn = e.detail?.retryIn || 5;
                setCloudStatus('error');
                setRetryCountdown(retryIn);

                if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
                retryIntervalRef.current = setInterval(() => {
                    setRetryCountdown(prev => {
                        if (prev <= 1) {
                            clearInterval(retryIntervalRef.current);
                            retryIntervalRef.current = null;
                            if (navigator.onLine && window.HEYS?.cloud?.retrySync) {
                                window.HEYS.cloud.retrySync();
                                setCloudStatus('syncing');
                            }
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
            };

            const handleNetworkRestored = (e) => {
                const count = e.detail?.pendingCount || 0;
                if (count > 0) {
                    if (!syncingStartRef.current) {
                        syncingStartRef.current = Date.now();
                    }
                    setCloudStatus('syncing');
                }
            };

            const handleOnline = () => {
                // 🆕 Остановить таймер офлайн
                if (offlineDurationIntervalRef.current) {
                    clearInterval(offlineDurationIntervalRef.current);
                    offlineDurationIntervalRef.current = null;
                }
                const wasOfflineFor = offlineStartRef.current ? Math.floor((Date.now() - offlineStartRef.current) / 1000) : 0;
                offlineStartRef.current = null;
                setOfflineDuration(0);

                setShowOfflineBanner(false);
                setShowOnlineBanner(true);

                // 🆕 Haptic feedback при восстановлении связи
                if ('vibrate' in navigator) {
                    navigator.vibrate([50, 30, 50]); // Два коротких вибро — "всё ок"
                }

                setTimeout(() => setShowOnlineBanner(false), 2000);

                if (pendingChangesRef.current || pendingCount > 0) {
                    if (!syncingStartRef.current) {
                        syncingStartRef.current = Date.now();
                    }
                    setCloudStatus('syncing');
                    if (cloudSyncTimeoutRef.current) clearTimeout(cloudSyncTimeoutRef.current);
                    cloudSyncTimeoutRef.current = setTimeout(() => {
                        pendingChangesRef.current = false;
                        showSyncedWithMinDuration();
                    }, 2000);
                } else {
                    setCloudStatus('idle');
                }

                // 🆕 Логируем время офлайн для аналитики
                if (wasOfflineFor > 5 && window.HEYS?.analytics?.trackDataOperation) {
                    window.HEYS.analytics.trackDataOperation('offline_session', 1, wasOfflineFor * 1000);
                }
            };

            const handleOffline = () => {
                // 🆕 Запустить таймер офлайн
                offlineStartRef.current = Date.now();
                setOfflineDuration(0);

                // Обновлять время каждую секунду
                if (offlineDurationIntervalRef.current) {
                    clearInterval(offlineDurationIntervalRef.current);
                }
                offlineDurationIntervalRef.current = setInterval(() => {
                    if (offlineStartRef.current) {
                        setOfflineDuration(Math.floor((Date.now() - offlineStartRef.current) / 1000));
                    }
                }, 1000);

                setShowOfflineBanner(true);
                setCloudStatus('offline');

                // 🆕 Haptic feedback при потере связи
                if ('vibrate' in navigator) {
                    navigator.vibrate(100); // Одна длинная вибрация — внимание
                }

                // Не скрываем баннер автоматически — он исчезнет когда связь вернётся
            };

            window.addEventListener('heysSyncCompleted', handleSyncComplete);
            window.addEventListener('heys:data-uploaded', handleSyncComplete);
            window.addEventListener('heys:data-saved', handleDataSaved);
            window.addEventListener('heys:pending-change', handlePendingChange);
            window.addEventListener('heys:network-restored', handleNetworkRestored);
            window.addEventListener('heys:sync-progress', handleSyncProgress);
            window.addEventListener('heys:sync-error', handleSyncError);
            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);

            if (!initialCheckDoneRef.current) {
                initialCheckDoneRef.current = true;
                if (!navigator.onLine) {
                    setCloudStatus('offline');
                    setShowOfflineBanner(true);
                    setTimeout(() => setShowOfflineBanner(false), 3000);
                } else {
                    setCloudStatus('idle');
                }
            }

            if (window.HEYS?.cloud?.getPendingCount) {
                setPendingCount(window.HEYS.cloud.getPendingCount());
            }
            if (window.HEYS?.cloud?.getPendingDetails) {
                setPendingDetails(window.HEYS.cloud.getPendingDetails());
            }

            return () => {
                window.removeEventListener('heysSyncCompleted', handleSyncComplete);
                window.removeEventListener('heys:data-uploaded', handleSyncComplete);
                window.removeEventListener('heys:data-saved', handleDataSaved);
                window.removeEventListener('heys:pending-change', handlePendingChange);
                window.removeEventListener('heys:network-restored', handleNetworkRestored);
                window.removeEventListener('heys:sync-progress', handleSyncProgress);
                window.removeEventListener('heys:sync-error', handleSyncError);
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
                if (cloudSyncTimeoutRef.current) clearTimeout(cloudSyncTimeoutRef.current);
                if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
                // 🆕 Очистка таймера офлайн
                if (offlineDurationIntervalRef.current) clearInterval(offlineDurationIntervalRef.current);
                // 🔥 Очистка таймера auth error debounce
                if (authErrorTimeoutRef.current) clearTimeout(authErrorTimeoutRef.current);
            };
        }, [pendingCount, showSyncedWithMinDuration, syncProgress.total]);

        const handleRetrySync = useCallback(() => {
            if (window.HEYS?.cloud?.retrySync) {
                window.HEYS.cloud.retrySync();
                syncingStartRef.current = Date.now();
                setCloudStatus('syncing');
            }
        }, []);

        return {
            cloudStatus,
            pendingCount,
            pendingDetails,
            showOfflineBanner,
            showOnlineBanner,
            syncProgress,
            retryCountdown,
            handleRetrySync,
            offlineDuration, // 🆕 Время офлайн в секундах
        };
    }

    function useClientState(cloud, U) {
        const React = window.React;
        const { useState } = React;
        const [status, setStatus] = useState(
            typeof cloud.getStatus === 'function' ? cloud.getStatus() : 'offline',
        );
        const [syncVer, setSyncVer] = useState(0);
        const [calendarVer, setCalendarVer] = useState(0); // 🗓️ Отдельный state для инвалидации календаря
        const [clients, setClients] = useState([]);
        const [clientsSource, setClientsSource] = useState(''); // 'cloud' | 'cache' | 'loading'
        const [clientId, setClientId] = useState('');
        const [newName, setNewName] = useState('');
        const [cloudUser, setCloudUser] = useState(null);
        const [isInitializing, setIsInitializing] = useState(true);
        const [products, setProducts] = useState([]);
        const [curatorTab, setCuratorTab] = useState('clients'); // 🆕 Tab: 'clients' | 'queue'
        const [needsConsent, setNeedsConsent] = useState(false); // 📋 Требуются ли согласия
        const [checkingConsent, setCheckingConsent] = useState(false); // 📋 Проверка согласий
        const [backupMeta, setBackupMeta] = useState(() => {
            return readStoredValue('heys_backup_meta', null);
        });
        const [backupBusy, setBackupBusy] = useState(false);

        return {
            status, setStatus,
            syncVer, setSyncVer,
            calendarVer, setCalendarVer,
            clients, setClients,
            clientsSource, setClientsSource,
            clientId, setClientId,
            needsConsent, setNeedsConsent,
            checkingConsent, setCheckingConsent,
            newName, setNewName,
            cloudUser, setCloudUser,
            isInitializing, setIsInitializing,
            products, setProducts,
            backupMeta, setBackupMeta,
            backupBusy, setBackupBusy,
            curatorTab, setCuratorTab, // 🆕
        };
    }

    function useCloudClients(cloud, U, {
        clients, setClients,
        clientsSource, setClientsSource,
        clientId, setClientId,
        cloudUser, setCloudUser,
        setProducts,
        setStatus,
        setSyncVer,
        setLoginError,
    }) {
        const React = window.React;
        const { useRef, useCallback, useEffect } = React;
        const ONE_CURATOR_MODE = false;
        const signInCooldownUntilRef = useRef(0);
        const fetchingClientsRef = useRef(false); // 🔧 FIX: Защита от дублирования запросов

        // Fallback если cloud.fetchWithRetry не доступен
        const defaultFetchWithRetry = async (fn, opts) => {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), opts.timeoutMs || 8000)
            );
            try {
                return await Promise.race([fn(), timeoutPromise]);
            } catch (e) {
                return { data: null, error: { message: e.message } };
            }
        };

        const fetchClientsFromCloud = useCallback(async (curatorId) => {
            if (!curatorId) {
                return { data: [], source: 'error' };
            }

            const curatorShortId = String(curatorId).slice(0, 8);
            const summarizeClients = (list) => {
                const now = Date.now();
                const statusCounts = {};
                let missingStatus = 0;
                let missingEndDate = 0;
                let expired = 0;
                const sample = [];

                (list || []).forEach((c, idx) => {
                    const status = c?.subscription_status || 'none';
                    statusCounts[status] = (statusCounts[status] || 0) + 1;
                    if (!c?.subscription_status) missingStatus += 1;
                    if (!c?.trial_ends_at) missingEndDate += 1;

                    if (c?.trial_ends_at) {
                        const endTs = new Date(c.trial_ends_at).getTime();
                        if (!Number.isNaN(endTs) && endTs < now) expired += 1;
                    }

                    if (idx < 5 && c?.id) {
                        sample.push({
                            clientId: String(c.id).slice(0, 8),
                            status,
                            hasEndDate: !!c?.trial_ends_at,
                        });
                    }
                });

                return {
                    total: (list || []).length,
                    statusCounts,
                    missingStatus,
                    missingEndDate,
                    expired,
                    sample,
                };
            };

            // 🔧 FIX: Пропускаем если уже загружаем
            if (fetchingClientsRef.current) {
                console.info('[HEYS.clients] ⏭️ Skip fetch (already in progress)', { curatorId: curatorShortId });
                return { data: [], source: 'skip' };
            }
            fetchingClientsRef.current = true;

            setClientsSource('loading');

            console.info('[HEYS.clients] 🔄 Fetch clients start', { curatorId: curatorShortId });

            try {
                // 🔄 Используем YandexAPI вместо Supabase
                const result = await HEYS.YandexAPI.getClients(curatorId);

                fetchingClientsRef.current = false;

                if (result.error) {
                    // 🏠 При ошибке — используем localStorage кэш
                    console.warn('[HEYS.clients] ⚠️ fetchClients error, using localStorage cache', {
                        curatorId: curatorShortId,
                        message: result.error?.message || 'unknown_error'
                    });
                    const cached = readGlobalValue('heys_clients', null);
                    if (cached) {
                        const data = Array.isArray(cached) ? cached : JSON.parse(cached);
                        const summary = summarizeClients(data);
                        console.info('[HEYS.clients] 📦 Loaded clients from cache', {
                            curatorId: curatorShortId,
                            source: 'local',
                            ...summary
                        });
                        setClientsSource('local');
                        return { data, source: 'local' };
                    }
                    setClientsSource('error');
                    return { data: [], source: 'error' };
                }

                const data = result.data;
                // Сохраняем в localStorage для кэширования
                if (data && data.length > 0) writeGlobalValue('heys_clients', data);
                const summary = summarizeClients(data);
                console.info('[HEYS.clients] ✅ Loaded clients from cloud', {
                    curatorId: curatorShortId,
                    source: 'cloud',
                    ...summary
                });
                setClientsSource('cloud');
                return { data: data || [], source: 'cloud' };
            } catch (e) {
                fetchingClientsRef.current = false;
                console.error('[HEYS.clients] ❌ fetchClientsFromCloud failed', {
                    curatorId: curatorShortId,
                    message: e.message || 'unknown_error'
                });
                // 🏠 При exception — тоже используем localStorage
                const cached = readGlobalValue('heys_clients', null);
                if (cached) {
                    try {
                        const data = Array.isArray(cached) ? cached : JSON.parse(cached);
                        const summary = summarizeClients(data);
                        console.info('[HEYS.clients] 📦 Loaded clients from cache after error', {
                            curatorId: curatorShortId,
                            source: 'local',
                            ...summary
                        });
                        setClientsSource('local');
                        return { data, source: 'local' };
                    } catch { }
                }
                setClientsSource('error');
                return { data: [], source: 'error' };
            }
        }, [cloud]);

        const addClientToCloud = useCallback(async (arg) => {
            const payload = typeof arg === 'string' ? { name: arg } : (arg || {});
            const clientName = (payload.name || '').trim() || `Клиент ${clients.length + 1}`;
            const clientPhone = (payload.phone || '').trim();
            const clientPin = (payload.pin || '').trim();

            if (!cloudUser || !cloudUser.id) {
                const newClient = {
                    id: `local-user-${Date.now()}`,
                    name: clientName,
                };
                const updatedClients = [...clients, newClient];
                setClients(updatedClients);
                writeGlobalValue('heys_clients', updatedClients);
                setClientId(newClient.id);
                writeGlobalValue('heys_client_current', newClient.id);
                return;
            }

            const userId = cloudUser.id;

            // 🧩 Если доступны RPC для phone+PIN — создаём клиента через них (кураторский флоу)
            // (Телефон/PIN опциональны: если не заполнены — fallback на старый insert)
            try {
                const auth = window.HEYS && window.HEYS.auth;
                const createWithPin = auth && auth.createClientWithPin;
                if (createWithPin && clientPhone && clientPin) {
                    const created = await createWithPin({ name: clientName, phone: clientPhone, pin: clientPin });
                    if (created && created.ok && created.clientId) {
                        const result = await fetchClientsFromCloud(userId);
                        setClients(result.data);
                        setClientId(created.clientId);
                        writeGlobalValue('heys_client_current', created.clientId);
                        // 🆕 Сохраняем имя для pre-fill в профиле (без namespace — напрямую в localStorage)
                        try {
                            writeGlobalValue('heys_pending_client_name', clientName);
                        } catch (_) { }
                        try {
                            HEYS.Toast?.success('Клиент создан! Телефон: ' + created.phone + ', PIN: ' + created.pin) || alert('✅ Клиент создан\n\nТелефон: ' + created.phone + '\nPIN: ' + created.pin);
                        } catch (_) { }
                        return;
                    }
                    if (created && created.error) {
                        HEYS.Toast?.error('Ошибка создания клиента: ' + created.error) || alert('Ошибка создания клиента: ' + created.error);
                        return;
                    }
                }
            } catch (e) {
                // Падаем в fallback insert ниже
            }

            // 🔄 Используем YandexAPI вместо Supabase
            try {
                const data = await HEYS.YandexAPI.createClient(clientName, userId);
                if (!data || !data.id) {
                    console.error('Ошибка создания клиента');
                    HEYS.Toast?.error('Ошибка создания клиента') || alert('Ошибка создания клиента');
                    return;
                }
                const result = await fetchClientsFromCloud(userId);
                setClients(result.data);
                setClientId(data.id);
                writeGlobalValue('heys_client_current', data.id);
            } catch (error) {
                console.error('Ошибка создания клиента:', error);
                HEYS.Toast?.error('Ошибка создания клиента: ' + error.message) || alert('Ошибка создания клиента: ' + error.message);
            }
        }, [clients, cloudUser, fetchClientsFromCloud, setClientId, setClients, U]);

        const renameClient = useCallback(async (id, name) => {
            if (!cloudUser || !cloudUser.id) {
                const updatedClients = clients.map((c) => (c.id === id ? { ...c, name } : c));
                setClients(updatedClients);
                writeGlobalValue('heys_clients', updatedClients);
                return;
            }

            const userId = cloudUser.id;
            // 🔄 Используем YandexAPI вместо Supabase
            await HEYS.YandexAPI.updateClient(id, { name });
            const result = await fetchClientsFromCloud(userId);
            setClients(result.data);
        }, [clients, cloudUser, fetchClientsFromCloud, setClients, U]);

        // Редактирование клиента: имя, телефон и/или PIN
        const editClient = useCallback(async (id, { name, phone, newPin } = {}) => {
            console.info('[HEYS.clients] ✅ editClient start:', { id, hasName: !!name, hasPhone: !!phone, hasPin: !!newPin });

            const updates = {};
            if (name) updates.name = name;
            if (phone) updates.phone = phone;

            if (!cloudUser || !cloudUser.id) {
                // Оффлайн — обновляем только имя локально
                if (updates.name) {
                    const updatedClients = clients.map((c) => (c.id === id ? { ...c, ...updates } : c));
                    setClients(updatedClients);
                    writeGlobalValue('heys_clients', updatedClients);
                }
                return;
            }

            try {
                // Обновляем имя и/или телефон через API
                if (Object.keys(updates).length > 0) {
                    await HEYS.YandexAPI.updateClient(id, updates);
                }

                // Обновляем PIN — отдельный RPC
                if (newPin) {
                    const pinResult = await HEYS.auth.resetClientPin({ clientId: id, newPin });
                    if (!pinResult.ok) {
                        throw new Error(pinResult.message || 'PIN update failed');
                    }
                }

                const result = await fetchClientsFromCloud(cloudUser.id);
                setClients(result.data);

                console.info('[HEYS.clients] ✅ editClient done:', { id, changedFields: Object.keys(updates), pinChanged: !!newPin });
            } catch (err) {
                console.error('[HEYS.clients] ❌ editClient error:', { id, error: err.message });
                throw err;
            }
        }, [clients, cloudUser, fetchClientsFromCloud, setClients, U]);

        const removeClient = useCallback(async (id) => {
            if (!cloudUser || !cloudUser.id) {
                const updatedClients = clients.filter((c) => c.id !== id);
                setClients(updatedClients);
                writeGlobalValue('heys_clients', updatedClients);
                if (clientId === id) {
                    setClientId('');
                    writeGlobalValue('heys_client_current', '');
                }
                return;
            }

            const userId = cloudUser.id;
            // 🔄 Используем YandexAPI вместо Supabase
            await HEYS.YandexAPI.deleteClient(id);
            const result = await fetchClientsFromCloud(userId);
            setClients(result.data);
            if (clientId === id) {
                setClientId('');
                writeGlobalValue('heys_client_current', '');
            }
        }, [clientId, clients, cloudUser, fetchClientsFromCloud, setClientId, setClients, U]);

        const cloudSignIn = useCallback(async (email, password, opts = {}) => {
            if (!email || !password) {
                setLoginError('Введите email и пароль');
                setStatus('offline');
                return { error: 'missing_credentials' };
            }

            const now = Date.now();
            if (now < signInCooldownUntilRef.current) {
                setLoginError('Слишком много попыток. Подождите 30 сек и попробуйте снова.');
                setStatus('offline');
                return { error: 'cooldown' };
            }

            const rememberMe = opts.rememberMe === true;
            if (!cloud || typeof cloud.signIn !== 'function') {
                HEYS.Toast?.warning('Облачный модуль не загружен') || alert('Облачный модуль не загружен');
                return;
            }

            try {
                setStatus('signin');
                setLoginError(null);

                if (rememberMe) {
                    writeGlobalValue('heys_remember_me', 'true');
                    writeGlobalValue('heys_remember_email', email || '');
                } else {
                    removeGlobalValue('heys_remember_me');
                    removeGlobalValue('heys_remember_email');
                }

                const res = await cloud.signIn(email, password);
                if (!res || res.error) {
                    const message = res?.error?.message || 'Ошибка подключения к серверу';
                    setLoginError(message);

                    // Примитивный backoff для 429
                    if (/Too Many Requests/i.test(message)) {
                        signInCooldownUntilRef.current = Date.now() + 30_000;
                    }
                    setStatus('offline');
                    return { error: message };
                }

                setCloudUser(res.user);
                setStatus(typeof cloud.getStatus === 'function' ? cloud.getStatus() : 'online');
                const loadedResult = await fetchClientsFromCloud(res.user.id);
                setClients(loadedResult.data);

                // Не автовыбираем клиента — куратор должен выбрать сам через модалку
                // clientId остаётся null → показывается модалка выбора клиента

                const rawProducts = Array.isArray(readStoredValue('heys_products', []))
                    ? readStoredValue('heys_products', [])
                    : [];
                const loadedProducts = migrateProductsKcalNetAtwater(rawProducts);
                if (loadedProducts !== rawProducts) writeStoredValue('heys_products', loadedProducts);
                setProducts(loadedProducts);
                setSyncVer((v) => v + 1);
            } catch (e) {
                setStatus('offline');
                setLoginError(e && e.message ? e.message : 'Ошибка подключения');
            }
        }, [cloud, fetchClientsFromCloud, setClientId, setClients, setCloudUser, setProducts, setStatus, setSyncVer, U]);

        const cloudSignOut = useCallback(async () => {
            try {
                if (cloud && typeof cloud.signOut === 'function') await cloud.signOut();
            } catch (_) { }
            if (window.HEYS) {
                window.HEYS.currentClientId = null;
                if (window.HEYS.store?.flushMemory) {
                    window.HEYS.store.flushMemory();
                }
            }
            // Важно: при выходе из аккаунта куратора сбрасываем “client mode”,
            // иначе на следующем запуске может открыться ConsentGate по старому clientId.
            removeGlobalValue('heys_client_current');
            removeGlobalValue('heys_pin_auth_client');
            removeGlobalValue('heys_client_phone');
            removeGlobalValue('heys_supabase_auth_token');
            // 🔧 v53 FIX: Очистка session_token для PIN auth
            removeGlobalValue('heys_session_token');
            setCloudUser(null);
            setClientId('');
            setClients([]);
            setProducts([]);
            setStatus('offline');
            setSyncVer((v) => v + 1);
            removeGlobalValue('heys_last_client_id');
        }, [cloud, setClientId, setClients, setCloudUser, setProducts, setStatus, setSyncVer]);

        // 🚪 FORCE LOGOUT: Слушаем событие и автоматически выходим на экран логина
        useEffect(() => {
            const handleForceLogout = (e) => {
                console.info('[HEYS] 🚪 Force logout triggered:', e.detail?.reason);
                // Полный logout — сбросит все состояния и покажет LoginScreen
                cloudSignOut();
            };

            window.addEventListener('heys:force-logout', handleForceLogout);
            return () => {
                window.removeEventListener('heys:force-logout', handleForceLogout);
            };
        }, [cloudSignOut]);

        return {
            ONE_CURATOR_MODE,
            fetchClientsFromCloud,
            addClientToCloud,
            renameClient,
            editClient,
            removeClient,
            cloudSignIn,
            cloudSignOut,
        };
    }

    HEYS.AppHooks = {
        useThemePreference,
        usePwaPrompts,
        useWakeLock,
        useCloudSyncStatus,
        useClientState,
        useCloudClients,
    };
})();
