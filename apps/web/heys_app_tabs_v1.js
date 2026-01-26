// heys_app_tabs_v1.js — Tab wrappers and skeletons for HEYS app

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

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

    function DayTabWithCloudSync(props) {
        const { clientId, products, selectedDate, setSelectedDate, subTab } = props;
        const [loading, setLoading] = React.useState(true);

        React.useEffect(() => {
            let cancelled = false;
            const cloud = window.HEYS && window.HEYS.cloud;
            const finish = () => {
                if (!cancelled) setLoading(false);
            };
            if (clientId && cloud && typeof cloud.syncClient === 'function') {
                const need =
                    typeof cloud.shouldSyncClient === 'function'
                        ? cloud.shouldSyncClient(clientId, 4000)
                        : true;
                if (need) {
                    setLoading(true);
                    cloud.syncClient(clientId)
                        .then(finish)
                        .catch((err) => {
                            console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                            finish();
                        });
                } else finish();
            } else {
                finish();
            }
            return () => {
                cancelled = true;
            };
        }, [clientId]);

        // 🔐 Не рендерим DayTab пока нет клиента — иначе advice показываются до входа!
        if (!clientId) {
            return React.createElement(DayTabSkeleton);
        }

        if (loading || !window.HEYS || !window.HEYS.DayTab) {
            return React.createElement(DayTabSkeleton);
        }
        return React.createElement(window.HEYS.DayTab, { products, selectedDate, setSelectedDate, subTab });
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
            return React.createElement(RationSkeleton);
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
                window.HEYS.cloud.syncClient(clientId)
                    .then(() => {
                        if (!cancelled) {
                            syncedClientsCache.add(clientId);
                            const loadedProducts = getLatestProducts();
                            safeSetProducts(loadedProducts);
                            setLoading(false);

                            // 🔄 Автоматическое восстановление orphan-продуктов (в фоне)
                            runOrphanRecovery();
                        }
                    })
                    .catch((err) => {
                        console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                        if (!cancelled) {
                            const loadedProducts = getLatestProducts();
                            safeSetProducts(Array.isArray(loadedProducts) ? loadedProducts : []);
                            setLoading(false);

                            // 🔄 Автоматическое восстановление orphan-продуктов (в фоне)
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
            return React.createElement(RationSkeleton);
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

        // 🔐 Не рендерим UserTab пока нет клиента
        if (!clientId) {
            return React.createElement(UserSkeleton);
        }

        React.useEffect(() => {
            let cancelled = false;
            if (
                clientId &&
                window.HEYS.cloud &&
                typeof window.HEYS.cloud.syncClient === 'function'
            ) {
                setLoading(true);
                window.HEYS.cloud.syncClient(clientId)
                    .then(() => {
                        if (!cancelled) setLoading(false);
                    })
                    .catch((err) => {
                        console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                        if (!cancelled) setLoading(false);
                    });
            } else {
                setLoading(false);
            }
            return () => {
                cancelled = true;
            };
        }, [clientId]);
        if (loading || !window.HEYS || !window.HEYS.UserTab) {
            return React.createElement(UserSkeleton);
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
