// heys_app_tabs_v1.js — Tab wrappers and skeletons for HEYS app

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

    const TAB_SKELETON_DELAY_MS = 260;

    function useDelayedSkeleton(shouldShow, key) {
        const [visible, setVisible] = React.useState(false);

        React.useEffect(() => {
            if (!shouldShow) {
                if (window.__heysTabWrapSkeletonState?.[key] !== 'ready') {
                    window.__heysTabWrapSkeletonState = window.__heysTabWrapSkeletonState || Object.create(null);
                    window.__heysTabWrapSkeletonState[key] = 'ready';
                    console.info('[HEYS.sceleton] ✅ tabwrap_ready', { key });
                }
                setVisible(false);
                return;
            }

            window.__heysTabWrapSkeletonState = window.__heysTabWrapSkeletonState || Object.create(null);
            if (window.__heysTabWrapSkeletonState[key] !== 'wait_delay') {
                window.__heysTabWrapSkeletonState[key] = 'wait_delay';
                console.info('[HEYS.sceleton] ⏱️ tabwrap_wait_delay', {
                    key,
                    delayMs: TAB_SKELETON_DELAY_MS
                });
            }

            const t = setTimeout(() => {
                setVisible(true);
                if (window.__heysTabWrapSkeletonState[key] !== 'show_skeleton') {
                    window.__heysTabWrapSkeletonState[key] = 'show_skeleton';
                    console.info('[HEYS.sceleton] 🦴 tabwrap_show_skeleton', { key });
                }
            }, TAB_SKELETON_DELAY_MS);

            return () => clearTimeout(t);
        }, [shouldShow, key]);

        return visible;
    }

    // Skeleton для DayTab — показываем пока грузится
    function DayTabSkeleton() {
        return React.createElement('div', { className: 'day-tab-skeleton', style: { padding: 16 } },
            // Sparkline skeleton
            React.createElement('div', {
                className: 'skeleton-sparkline',
                style: { height: 80, marginBottom: 16, borderRadius: 12 }
            }),
            // Cards skeleton
            React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
                React.createElement('div', { className: 'skeleton-card', style: { flex: 1, height: 60 } }),
                React.createElement('div', { className: 'skeleton-card', style: { flex: 1, height: 60 } })
            ),
            // Progress skeleton
            React.createElement('div', { className: 'skeleton-progress', style: { height: 48, marginBottom: 16 } }),
            // Macros skeleton
            React.createElement('div', { className: 'skeleton-macros', style: { marginBottom: 16 } },
                React.createElement('div', { className: 'skeleton-ring' }),
                React.createElement('div', { className: 'skeleton-ring' }),
                React.createElement('div', { className: 'skeleton-ring' })
            )
        );
    }

    // v9.7: Phase A Immediate Render — DayTab appears as soon as today's data ready (~4s on cold login)
    // Previously v6.0–v9.3: Adaptive Gate waited up to 2500ms after Phase A for full sync (gated=true)
    // Now: render immediately on Phase A (gated=false) → cascade/planner show skeleton → fill in via
    // heys:day-updated batch:true when full sync arrives. On refresh sync is not needed (cooldown) →
    // fast path gated=true → instant render unchanged.
    const DAYTAB_SYNC_FALLBACK_MS = 5000;
    // DAYTAB_GATE_AFTER_PHASE_A_MS removed — Phase A triggers immediate render (gated=false)

    function DayTabWithCloudSync(props) {
        const { clientId, products, selectedDate, setSelectedDate, subTab } = props;
        const [loading, setLoading] = React.useState(true);
        const needsSkeleton = !clientId || loading || !window.HEYS || !window.HEYS.DayTab;
        const showSkeleton = useDelayedSkeleton(needsSkeleton, 'daytab');

        // Mount/remount diagnostic log
        React.useEffect(() => {
            console.info('[HEYS.sceleton] 🔁 DayTabWithCloudSync MOUNTED', {
                clientId: clientId ? String(clientId).slice(0, 8) : null,
                selectedDate,
                subTab,
            });
            return () => {
                console.info('[HEYS.sceleton] 💀 DayTabWithCloudSync UNMOUNTED');
            };
        }, []);

        React.useEffect(() => {
            let cancelled = false;
            let fallbackTimer = null;
            let gateTimer = null;
            let phaseAReceived = false;
            const cloud = window.HEYS && window.HEYS.cloud;

            const finish = (reason, gated) => {
                if (cancelled) return;
                // Немедленно помечаем как завершённый чтобы не вызвать дважды
                // (например Phase A + full sync конкурируют)
                cancelled = true;

                // v9.8: CSS Gate — не показываем DayTab пока main.css не загружен.
                // При throttling Phase A может сработать до окончания загрузки CSS →
                // DayTab рендерится без стилей, выглядит некрасиво.
                // Решение: если CSS ещё не загружен — ждём событие heysMainCSSLoaded,
                // скелетон при этом остаётся видимым.
                const unlock = () => {
                    if (fallbackTimer) clearTimeout(fallbackTimer);
                    if (gateTimer) clearTimeout(gateTimer);
                    window.removeEventListener('heysSyncCompleted', onSyncCompleted);
                    // v6.0: Mark gated render — deferredSlot uses this to skip unfold animation
                    if (gated) {
                        window.__heysGatedRender = true;
                        console.info('[HEYS.gate] 🚀 Gated render: all data ready, rendering DayTab + cards in one frame');
                    } else {
                        window.__heysGatedRender = false;
                    }
                    console.info('[HEYS.sceleton] ✅ DayTab unlocked:', reason);
                    setLoading(false);
                };

                // v9.9: CSS Gate #2 removed — CSS Gate #1 (heys_app_initialize_v1.js)
                // already ensures main.css is loaded before React mounts.
                // Duplicate gate here caused cumulative 20s delay on PWA cache clear.
                unlock();
            };

            // v6.0: Adaptive Gate — listen for Phase A AND full sync separately
            const onSyncCompleted = (event) => {
                const evClientId = event?.detail?.clientId;
                if (!evClientId) return;
                if (evClientId !== clientId && !clientId.startsWith(evClientId)) return;

                const phase = event?.detail?.phase || (event?.detail?.phaseA ? 'A' : 'unknown');

                if (phase === 'full') {
                    if (gateTimer) clearTimeout(gateTimer);
                    finish('full sync completed (gated)', true);
                    return;
                }

                if (!phaseAReceived) {
                    phaseAReceived = true;
                    // v9.7: Render immediately at Phase A — today's data (profile+products+dayv2) is ready.
                    // Cascade/planner will use skeleton → fill in via heys:day-updated batch:true when full sync arrives (~2s later).
                    console.info('[HEYS.gate] ⚡ Phase A received — rendering DayTab immediately (progressive reveal)');
                    finish('Phase A — immediate render', false);
                }
            };

            if (!clientId || !cloud || typeof cloud.syncClient !== 'function') {
                finish('no cloud or clientId', false);
                return;
            }

            const need =
                typeof cloud.shouldSyncClient === 'function'
                    ? cloud.shouldSyncClient(clientId, 4000)
                    : true;

            // Fast path: sync not needed (completed < 4s ago)
            if (!need) {
                finish('sync not needed (cooldown)', true);
                return;
            }

            // Quick check: sync already completed for this client
            if (cloud._lastClientSync && cloud._lastClientSync.clientId === clientId) {
                finish('sync already completed', true);
                return;
            }

            setLoading(true);
            window.addEventListener('heysSyncCompleted', onSyncCompleted);

            // Fallback: don't block forever — show DayTab with local data after timeout
            fallbackTimer = setTimeout(() => finish('fallback timeout (' + DAYTAB_SYNC_FALLBACK_MS + 'ms)', false), DAYTAB_SYNC_FALLBACK_MS);

            // Fire sync non-blocking (switchClient may already have started it via bootstrapClientSync)
            cloud.syncClient(clientId).catch((err) => {
                console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                finish('sync error', false);
            });

            return () => {
                if (!cancelled) {
                    cancelled = true;
                    if (fallbackTimer) clearTimeout(fallbackTimer);
                    if (gateTimer) clearTimeout(gateTimer);
                    window.removeEventListener('heysSyncCompleted', onSyncCompleted);
                }

            };
        }, [clientId]);

        // 🔐 Не рендерим DayTab пока нет клиента — иначе advice показываются до входа!
        if (!clientId) {
            return showSkeleton ? React.createElement(DayTabSkeleton) : null;
        }

        if (loading || !window.HEYS || !window.HEYS.DayTab) {
            return showSkeleton ? React.createElement(DayTabSkeleton) : null;
        }
        return React.createElement(window.HEYS.DayTab, {
            key: `daytab-${clientId || 'none'}`,
            clientId,
            products,
            selectedDate,
            setSelectedDate,
            subTab
        });
    }

    // Skeleton для Ration/Products
    function RationSkeleton() {
        return React.createElement('div', { style: { padding: 16 } },
            React.createElement('div', { className: 'skeleton-header', style: { width: 150, marginBottom: 16 } }),
            ...Array.from({ length: 5 }, (_, i) =>
                React.createElement('div', {
                    key: i,
                    className: 'skeleton-block',
                    style: { height: 56, marginBottom: 8 }
                })
            )
        );
    }

    // Кэш синхронизированных клиентов (в рамках сессии) — обычная переменная модуля
    const syncedClientsCache = new Set();
    const recoveryRunCache = new Set();

    function RationTabWithCloudSync(props) {
        const { clientId, setProducts, products } = props;
        // Проверяем был ли sync для ЭТОГО клиента
        const alreadySynced = clientId && syncedClientsCache.has(clientId);
        const [loading, setLoading] = React.useState(!alreadySynced);
        const needsSkeleton = !clientId || loading || !window.HEYS || !window.HEYS.Ration;
        const showSkeleton = useDelayedSkeleton(needsSkeleton, 'rationtab');
        const getLatestProducts = (event) => {
            const fromEvent = event?.detail?.products;
            if (Array.isArray(fromEvent)) return fromEvent;
            const fromService = window.HEYS?.products?.getAll?.();
            if (Array.isArray(fromService)) return fromService;
            const fromStore = window.HEYS.store?.get?.('heys_products', []);
            if (Array.isArray(fromStore)) return fromStore;
            const fromLs = window.HEYS.utils?.lsGet?.('heys_products', []);
            return Array.isArray(fromLs) ? fromLs : [];
        };

        // 🔐 Не рендерим Ration пока нет клиента
        if (!clientId) {
            return showSkeleton ? React.createElement(RationSkeleton) : null;
        }

        // 📦 Слушатель событий для гарантированного обновления продуктов
        // 🔒 Флаг для предотвращения обновления при первой синхронизации
        const initialProductsSyncDoneRef = React.useRef(false);

        React.useEffect(() => {
            const handleProductsUpdated = (e) => {
                // 🔒 Игнорируем heysSyncCompleted при ПЕРВОЙ загрузке — products уже загружены
                // Это предотвращает лишний ре-рендер и мерцание UI
                if (e.type === 'heysSyncCompleted') {
                    if (!initialProductsSyncDoneRef.current) {
                        initialProductsSyncDoneRef.current = true;
                        // console.log('[HEYS] ⏭️ Products update skipped: initial sync');
                        return;
                    }
                }

                const latest = getLatestProducts(e);
                if (Array.isArray(latest) && latest.length > 0) {
                    // 🛡️ ЗАЩИТА: не уменьшаем количество продуктов в UI
                    // Это предотвращает "мерцание" когда приходят разные ключи из облака
                    setProducts(prev => {
                        if (Array.isArray(prev) && prev.length > latest.length) {
                            // 🔇 v4.7.0: Лог отключён
                            return prev;
                        }
                        // 🔒 Оптимизация: не обновляем если количество одинаковое (скорее всего те же данные)
                        if (Array.isArray(prev) && prev.length === latest.length) {
                            return prev;
                        }
                        return latest;
                    });

                    // 🔄 Пересчитываем orphan-продукты — теперь база загружена
                    if (window.HEYS?.orphanProducts?.recalculate) {
                        window.HEYS.orphanProducts.recalculate();
                    }
                }
            };

            window.addEventListener('heys:products-updated', handleProductsUpdated);
            window.addEventListener('heysProductsUpdated', handleProductsUpdated);
            window.addEventListener('heysSyncCompleted', handleProductsUpdated);

            return () => {
                window.removeEventListener('heys:products-updated', handleProductsUpdated);
                window.removeEventListener('heysProductsUpdated', handleProductsUpdated);
                window.removeEventListener('heysSyncCompleted', handleProductsUpdated);
            };
        }, [setProducts]);

        React.useEffect(() => {
            let cancelled = false;
            let recoveryScheduled = false; // 🔒 Флаг: recovery уже запланировано (debounce)
            let recoveryAttempts = 0;
            const MAX_RECOVERY_ATTEMPTS = 6;
            const RECOVERY_RETRY_MS = 600;

            // 🛡️ Хелпер: безопасное обновление продуктов (не уменьшаем количество)
            const safeSetProducts = (newProducts) => {
                if (!Array.isArray(newProducts)) return;
                setProducts(prev => {
                    if (Array.isArray(prev) && prev.length > newProducts.length) {
                        // 🔇 v4.7.0: Лог отключён
                        return prev;
                    }
                    // 🔒 Не ре-рендерим если количество одинаковое
                    if (Array.isArray(prev) && prev.length === newProducts.length) {
                        return prev;
                    }
                    return newProducts;
                });
            };

            // 🔄 Хелпер: запуск orphan recovery (с debounce через флаг)
            const runOrphanRecovery = (options = {}) => {
                if (recoveryScheduled || cancelled) return;
                if (!window.HEYS.orphanProducts?.autoRecoverOnLoad) return;

                if (clientId && recoveryRunCache.has(clientId)) return;

                const currentProducts = getLatestProducts();
                const cachedShared = window.HEYS?.cloud?.getCachedSharedProducts?.() || [];
                const minReady = cachedShared.length > 0 ? 10 : 5;

                if (!Array.isArray(currentProducts) || currentProducts.length < minReady) {
                    recoveryAttempts += 1;
                    if (recoveryAttempts <= MAX_RECOVERY_ATTEMPTS) {
                        setTimeout(() => runOrphanRecovery(options), RECOVERY_RETRY_MS);
                    }
                    return;
                }

                recoveryScheduled = true;
                if (clientId) recoveryRunCache.add(clientId);
                const isFirstLoad = !syncedClientsCache.has(clientId);

                window.HEYS.orphanProducts.autoRecoverOnLoad({
                    verbose: isFirstLoad,
                    ...options
                }).then(result => {
                    if (result.recovered > 0 && !cancelled) {
                        const updatedProducts = window.HEYS.utils.lsGet('heys_products', []);
                        safeSetProducts(Array.isArray(updatedProducts) ? updatedProducts : []);

                        if (window.HEYS.Toast?.success) {
                            const msg = result.recovered === 1
                                ? '🔄 Восстановлен 1 продукт из истории'
                                : `🔄 Восстановлено ${result.recovered} продуктов из истории`;
                            window.HEYS.Toast.success(msg);
                        }
                    }
                }).catch(() => { });
            };

            // Если sync для этого клиента уже был — сразу загружаем продукты
            if (syncedClientsCache.has(clientId)) {
                const loadedProducts = getLatestProducts();
                safeSetProducts(Array.isArray(loadedProducts) ? loadedProducts : []);
                setLoading(false);

                // 🔄 Автоматическое восстановление orphan-продуктов (в фоне)
                runOrphanRecovery();
                return;
            }

            if (
                clientId &&
                window.HEYS.cloud &&
                typeof window.HEYS.cloud.syncClient === 'function'
            ) {
                setLoading(true);

                // v9.4: Non-blocking sync for Ration tab — filter by clientId
                const onSyncDone = (event) => {
                    const evClientId = event?.detail?.clientId;
                    if (!evClientId) return; // synthetic event — skip
                    if (evClientId !== clientId && !clientId.startsWith(evClientId)) return;
                    if (!cancelled) {
                        syncedClientsCache.add(clientId);
                        const loadedProducts = getLatestProducts();
                        safeSetProducts(loadedProducts);
                        setLoading(false);
                        runOrphanRecovery();
                        window.removeEventListener('heysSyncCompleted', onSyncDone);
                        clearTimeout(rationFallback);
                    }
                };

                window.addEventListener('heysSyncCompleted', onSyncDone);

                const rationFallback = setTimeout(() => {
                    if (!cancelled) {
                        console.info('[HEYS.sceleton] ⏱️ RationTab fallback timeout — showing with local data');
                        syncedClientsCache.add(clientId);
                        const loadedProducts = getLatestProducts();
                        safeSetProducts(Array.isArray(loadedProducts) ? loadedProducts : []);
                        setLoading(false);
                        runOrphanRecovery({ tryShared: false });
                        window.removeEventListener('heysSyncCompleted', onSyncDone);
                    }
                }, DAYTAB_SYNC_FALLBACK_MS);

                window.HEYS.cloud.syncClient(clientId)
                    .catch((err) => {
                        console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                        if (!cancelled) {
                            clearTimeout(rationFallback);
                            window.removeEventListener('heysSyncCompleted', onSyncDone);
                            const loadedProducts = getLatestProducts();
                            safeSetProducts(Array.isArray(loadedProducts) ? loadedProducts : []);
                            setLoading(false);
                            runOrphanRecovery({ tryShared: false });
                        }
                    });
            } else {
                // Нет cloud — загружаем локально
                const loadedProducts = getLatestProducts();
                safeSetProducts(Array.isArray(loadedProducts) ? loadedProducts : []);
                setLoading(false);

                // 🔄 Автоматическое восстановление orphan-продуктов (в фоне, без shared)
                runOrphanRecovery({ tryShared: false });
            }
            return () => {
                cancelled = true;
            };
        }, [clientId]);
        if (loading || !window.HEYS || !window.HEYS.Ration) {
            return showSkeleton ? React.createElement(RationSkeleton) : null;
        }
        return React.createElement(window.HEYS.Ration, { products, setProducts });
    }

    // Skeleton для UserTab
    function UserSkeleton() {
        return React.createElement('div', { style: { padding: 16 } },
            React.createElement('div', { className: 'skeleton-header', style: { width: 120, marginBottom: 16 } }),
            React.createElement('div', { className: 'skeleton-block', style: { height: 100, marginBottom: 12 } }),
            React.createElement('div', { className: 'skeleton-block', style: { height: 80, marginBottom: 12 } }),
            React.createElement('div', { className: 'skeleton-block', style: { height: 80 } })
        );
    }

    function UserTabWithCloudSync(props) {
        const { clientId } = props;
        const [loading, setLoading] = React.useState(true);
        const needsSkeleton = !clientId || loading || !window.HEYS || !window.HEYS.UserTab;
        const showSkeleton = useDelayedSkeleton(needsSkeleton, 'usertab');

        // 🔐 Не рендерим UserTab пока нет клиента
        if (!clientId) {
            return showSkeleton ? React.createElement(UserSkeleton) : null;
        }

        React.useEffect(() => {
            let cancelled = false;
            if (
                clientId &&
                window.HEYS.cloud &&
                typeof window.HEYS.cloud.syncClient === 'function'
            ) {
                setLoading(true);

                // v9.4: Non-blocking sync for UserTab — filter by clientId
                const onSyncDone = (event) => {
                    const evClientId = event?.detail?.clientId;
                    if (!evClientId) return; // synthetic event — skip
                    if (evClientId !== clientId && !clientId.startsWith(evClientId)) return;
                    if (!cancelled) {
                        cancelled = true;
                        setLoading(false);
                        window.removeEventListener('heysSyncCompleted', onSyncDone);
                        clearTimeout(userFallback);
                    }
                };

                window.addEventListener('heysSyncCompleted', onSyncDone);

                const userFallback = setTimeout(() => {
                    if (!cancelled) {
                        console.info('[HEYS.sceleton] ⏱️ UserTab fallback timeout — showing with local data');
                        cancelled = true;
                        setLoading(false);
                        window.removeEventListener('heysSyncCompleted', onSyncDone);
                    }
                }, DAYTAB_SYNC_FALLBACK_MS);

                window.HEYS.cloud.syncClient(clientId)
                    .catch((err) => {
                        console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                        if (!cancelled) {
                            cancelled = true;
                            clearTimeout(userFallback);
                            window.removeEventListener('heysSyncCompleted', onSyncDone);
                            setLoading(false);
                        }
                    });
            } else {
                setLoading(false);
            }
            return () => {
                if (!cancelled) {
                    cancelled = true;
                    // cleanup listeners if still active
                }
            };
        }, [clientId]);
        if (loading || !window.HEYS || !window.HEYS.UserTab) {
            return showSkeleton ? React.createElement(UserSkeleton) : null;
        }
        return React.createElement(window.HEYS.UserTab, {});
    }

    // Вкладка аналитики производительности (heys_simple_analytics.js)
    function AnalyticsTab() {
        const [stats, setStats] = React.useState(null);
        const [autoRefresh, setAutoRefresh] = React.useState(true);

        const loadStats = () => {
            if (window.HEYS && window.HEYS.analytics) {
                const data = window.HEYS.analytics.getStats();
                setStats(data);
            }
        };

        React.useEffect(() => {
            loadStats();
            if (autoRefresh) {
                const interval = setInterval(loadStats, 5000); // Обновление каждые 5 сек
                return () => clearInterval(interval);
            }
        }, [autoRefresh]);

        if (!stats) {
            return React.createElement('div', { style: { padding: 16 } },
                React.createElement('div', { className: 'skeleton-header', style: { width: 180, marginBottom: 16 } }),
                React.createElement('div', { className: 'skeleton-block', style: { height: 60, marginBottom: 12 } }),
                React.createElement('div', { className: 'skeleton-block', style: { height: 120 } })
            );
        }

        return React.createElement(
            'div',
            { style: { padding: 24, maxWidth: 900 } },
            // Заголовок
            React.createElement(
                'div',
                {
                    style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 24,
                    },
                },
                React.createElement('h2', { style: { margin: 0 } }, '📊 Аналитика сессии'),
                React.createElement(
                    'div',
                    { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                    React.createElement(
                        'label',
                        null,
                        React.createElement('input', {
                            type: 'checkbox',
                            checked: autoRefresh,
                            onChange: (e) => setAutoRefresh(e.target.checked),
                            style: { marginRight: 4 },
                        }),
                        'Автообновление',
                    ),
                    React.createElement(
                        'button',
                        { className: 'btn', onClick: loadStats },
                        '🔄 Обновить',
                    ),
                ),
            ),

            // Время сессии
            React.createElement(
                'div',
                {
                    style: { marginBottom: 24, padding: 16, background: '#f8f9fa', borderRadius: 8 },
                },
                React.createElement(
                    'div',
                    { style: { fontSize: 14, color: '#666', marginBottom: 4 } },
                    'Время сессии',
                ),
                React.createElement(
                    'div',
                    { style: { fontSize: 24, fontWeight: 600 } },
                    stats.session.duration,
                ),
            ),

            // Поисковые запросы
            React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '🔍 Поисковые запросы'),
                React.createElement(
                    'div',
                    { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 } },
                    React.createElement(
                        'div',
                        { style: { padding: 16, background: '#e3f2fd', borderRadius: 8 } },
                        React.createElement('div', { style: { fontSize: 12, color: '#666' } }, 'Всего'),
                        React.createElement(
                            'div',
                            { style: { fontSize: 20, fontWeight: 600 } },
                            stats.searches.total,
                        ),
                    ),
                    React.createElement(
                        'div',
                        { style: { padding: 16, background: '#fff3e0', borderRadius: 8 } },
                        React.createElement(
                            'div',
                            { style: { fontSize: 12, color: '#666' } },
                            'Медленных (>1s)',
                        ),
                        React.createElement(
                            'div',
                            { style: { fontSize: 20, fontWeight: 600 } },
                            stats.searches.slow,
                        ),
                    ),
                    React.createElement(
                        'div',
                        {
                            style: {
                                padding: 16,
                                background: stats.searches.slowRate === '0%' ? '#e8f5e9' : '#ffebee',
                                borderRadius: 8,
                            },
                        },
                        React.createElement(
                            'div',
                            { style: { fontSize: 12, color: '#666' } },
                            'Slow Rate',
                        ),
                        React.createElement(
                            'div',
                            { style: { fontSize: 20, fontWeight: 600 } },
                            stats.searches.slowRate,
                        ),
                    ),
                ),
            ),

            // API вызовы
            React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '🌐 API вызовы'),
                React.createElement(
                    'div',
                    { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 } },
                    React.createElement(
                        'div',
                        { style: { padding: 16, background: '#e3f2fd', borderRadius: 8 } },
                        React.createElement('div', { style: { fontSize: 12, color: '#666' } }, 'Всего'),
                        React.createElement(
                            'div',
                            { style: { fontSize: 20, fontWeight: 600 } },
                            stats.apiCalls.total,
                        ),
                    ),
                    React.createElement(
                        'div',
                        { style: { padding: 16, background: '#fff3e0', borderRadius: 8 } },
                        React.createElement(
                            'div',
                            { style: { fontSize: 12, color: '#666' } },
                            'Медленных (>2s)',
                        ),
                        React.createElement(
                            'div',
                            { style: { fontSize: 20, fontWeight: 600 } },
                            stats.apiCalls.slow,
                        ),
                    ),
                    React.createElement(
                        'div',
                        {
                            style: {
                                padding: 16,
                                background: stats.apiCalls.failed > 0 ? '#ffebee' : '#e8f5e9',
                                borderRadius: 8,
                            },
                        },
                        React.createElement(
                            'div',
                            { style: { fontSize: 12, color: '#666' } },
                            'Ошибок',
                        ),
                        React.createElement(
                            'div',
                            { style: { fontSize: 20, fontWeight: 600 } },
                            stats.apiCalls.failed,
                        ),
                    ),
                    React.createElement(
                        'div',
                        { style: { padding: 16, background: '#f3e5f5', borderRadius: 8 } },
                        React.createElement(
                            'div',
                            { style: { fontSize: 12, color: '#666' } },
                            'Slow Rate',
                        ),
                        React.createElement(
                            'div',
                            { style: { fontSize: 20, fontWeight: 600 } },
                            stats.apiCalls.slowRate,
                        ),
                    ),
                ),
            ),

            // Cache эффективность
            React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '💾 Cache эффективность'),
                React.createElement(
                    'div',
                    { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 } },
                    React.createElement(
                        'div',
                        { style: { padding: 16, background: '#e8f5e9', borderRadius: 8 } },
                        React.createElement('div', { style: { fontSize: 12, color: '#666' } }, 'Hits'),
                        React.createElement(
                            'div',
                            { style: { fontSize: 20, fontWeight: 600 } },
                            stats.cache.hits,
                        ),
                    ),
                    React.createElement(
                        'div',
                        { style: { padding: 16, background: '#ffebee', borderRadius: 8 } },
                        React.createElement(
                            'div',
                            { style: { fontSize: 12, color: '#666' } },
                            'Misses',
                        ),
                        React.createElement(
                            'div',
                            { style: { fontSize: 20, fontWeight: 600 } },
                            stats.cache.misses,
                        ),
                    ),
                    React.createElement(
                        'div',
                        { style: { padding: 16, background: '#e1f5fe', borderRadius: 8 } },
                        React.createElement(
                            'div',
                            { style: { fontSize: 12, color: '#666' } },
                            'Hit Rate',
                        ),
                        React.createElement(
                            'div',
                            { style: { fontSize: 20, fontWeight: 600 } },
                            stats.cache.hitRate,
                        ),
                    ),
                ),
            ),

            // Ошибки
            React.createElement(
                'div',
                { style: { marginBottom: 24 } },
                React.createElement('h3', null, '🐛 Ошибки'),
                React.createElement(
                    'div',
                    {
                        style: {
                            padding: 16,
                            background: stats.errors.total > 0 ? '#ffebee' : '#e8f5e9',
                            borderRadius: 8,
                        },
                    },
                    React.createElement(
                        'div',
                        { style: { fontSize: 12, color: '#666' } },
                        'Всего ошибок в сессии',
                    ),
                    React.createElement(
                        'div',
                        { style: { fontSize: 24, fontWeight: 600 } },
                        stats.errors.total,
                    ),
                ),
            ),

            // Кнопка сброса
            React.createElement(
                'div',
                { style: { marginTop: 32, paddingTop: 24, borderTop: '1px solid #eee' } },
                React.createElement(
                    'button',
                    {
                        className: 'btn secondary',
                        onClick: () => {
                            if (window.HEYS && window.HEYS.analytics && window.HEYS.analytics.reset) {
                                if (confirm('Сбросить всю статистику сессии?')) {
                                    window.HEYS.analytics.reset();
                                    loadStats();
                                }
                            }
                        },
                    },
                    '🗑️ Сбросить статистику',
                ),
            ),
        );
    }

    HEYS.AppTabs = {
        DayTabWithCloudSync,
        RationTabWithCloudSync,
        UserTabWithCloudSync,
        AnalyticsTab,
    };
})();
