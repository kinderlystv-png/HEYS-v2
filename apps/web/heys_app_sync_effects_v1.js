// heys_app_sync_effects_v1.js — client sync & persistence effects
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const useSyncEffects = ({
        React,
        U,
        cloud,
        clientId,
        products,
        setProducts,
        setSyncVer,
        setBackupMeta,
    }) => {
        const clientSyncDoneRef = React.useRef(false);
        const initialSyncDoneRef = React.useRef(false);
        const saveTimerRef = React.useRef(null);

        React.useEffect(() => {
            if (products.length === 0) {
                try {
                    // 🔄 v4.8.8: FIX — читаем из Store API вместо utils.lsGet
                    // Единый источник истины для products — HEYS.products.getAll()
                    const stored = window.HEYS?.products?.getAll?.() || [];
                    if (Array.isArray(stored) && stored.length) setProducts(stored);
                } catch (e) { }
            }
        }, [products.length, setProducts]);

        React.useEffect(() => {
            if (clientId) {
                U.lsSet('heys_client_current', clientId);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = clientId;
                window.dispatchEvent(new CustomEvent('heys:client-changed', { detail: { clientId } }));
                // 🔇 v4.7.1: Лог клиента отключён

                if (cloud && typeof cloud.syncClient === 'function') {
                    const productsBeforeSync = products.length > 0 ? products : window.HEYS.utils.lsGet('heys_products', []);

                    cloud.syncClient(clientId)
                        .then(() => {
                            // 🔄 v4.8.8: FIX — читаем из Store API, не напрямую из localStorage
                            // Store.set пишет в scoped ключ, utils.lsGet читает из другого → несоответствие
                            // Правильно: sync → setAll → Store.set → products.getAll() (единый источник истины)
                            const loadedProducts = Array.isArray(window.HEYS?.products?.getAll?.())
                                ? window.HEYS.products.getAll()
                                : [];

                            // 🪦 FIX v4.8.9: применяем tombstone filter после cloud sync.
                            // Без этого mergeProductsData возвращала deleted products (merge = union remote+local),
                            // и setProducts устанавливал их обратно в React state → resurrection при page refresh.
                            const _tombstones = window.HEYS?.store?.get?.('heys_deleted_ids') || [];
                            const filteredProducts = (() => {
                                if (!Array.isArray(_tombstones) || _tombstones.length === 0) return loadedProducts;
                                const _deletedIds = new Set(_tombstones.map(t => t.id).filter(Boolean));
                                const _deletedNames = new Set(_tombstones.map(t => (t.name || '').trim().toLowerCase()).filter(Boolean));
                                const _result = loadedProducts.filter(p =>
                                    !_deletedIds.has(p.id) &&
                                    !_deletedNames.has((p.name || '').trim().toLowerCase())
                                );
                                if (_result.length < loadedProducts.length) {
                                    console.info(`[HEYS.sync] 🪦 tombstone filter: убрано ${loadedProducts.length - _result.length} resurrection product(s) после sync`);
                                }
                                return _result;
                            })();

                            // 🔍 v4.8.7: DEBUG — что загрузилось из Store после sync
                            const loadedIron = filteredProducts.filter(p => p?.iron && +p.iron > 0).length;
                            console.info(`[HEYS.sync] 🔍 After sync: loadedProducts.length=${loadedProducts.length} (${filteredProducts.length} after tombstone filter), withIron=${loadedIron}`);

                            if (filteredProducts.length === 0 && Array.isArray(productsBeforeSync) && productsBeforeSync.length > 0) {
                                // 🔇 v4.7.1: Лог отключён
                                // 🛡️ v4.7.2: Перед fallback проверяем что productsBeforeSync не меньше текущих
                                // Это предотвращает race condition когда новые продукты добавлены во время sync
                                const currentProducts = window.HEYS?.products?.getAll?.() || [];
                                const currentCount = currentProducts.length;
                                const fallbackCount = productsBeforeSync.length;

                                // Если текущие продукты больше — НЕ откатываем на старые
                                if (currentCount > fallbackCount) {
                                    // 🔇 Молчим — защита в setAll всё равно заблокирует
                                    return;
                                }

                                setProducts(prev => {
                                    if (Array.isArray(prev) && prev.length === productsBeforeSync.length) return prev;
                                    return productsBeforeSync;
                                });
                                if (window.HEYS?.products?.setAll) {
                                    window.HEYS.products.setAll(productsBeforeSync, {
                                        source: 'cloud-sync-fallback',
                                        skipNotify: true,
                                        skipCloud: true
                                    });
                                } else {
                                    window.HEYS.utils.lsSet('heys_products', productsBeforeSync);
                                }
                            } else {
                                // 🔄 v4.8.7: Проверяем качество данных вместо длины
                                // Сравниваем количество продуктов с микронутриентами (iron) вместо общей длины
                                setProducts(prev => {
                                    const prevIron = Array.isArray(prev) ? prev.filter(p => p?.iron && +p.iron > 0).length : 0;
                                    const loadedIron = filteredProducts.filter(p => p?.iron && +p.iron > 0).length;

                                    // 🔍 v4.8.7: DEBUG — какое состояние пытаемся обновить
                                    console.info(`[HEYS.sync] 🔍 setProducts callback: prev.length=${prev.length}, prevIron=${prevIron}, loadedIron=${loadedIron}`);

                                    // Если качество одинаковое — не обновляем (оптимизация)
                                    // Если качество разное — ВСЕГДА обновляем (42 Fe → 290 Fe)
                                    if (Array.isArray(prev) && prev.length === filteredProducts.length && prevIron === loadedIron) {
                                        console.info(`[HEYS.sync] 🚫 React state NOT updated (same quality)`);
                                        return prev;
                                    }

                                    console.info(`[HEYS.sync] 🔄 React state updated: ${prev.length}→${filteredProducts.length} products, ${prevIron}→${loadedIron} with iron`);
                                    return filteredProducts;
                                });
                            }
                            if (!clientSyncDoneRef.current) {
                                clientSyncDoneRef.current = true;
                                return;
                            }
                            setSyncVer((v) => v + 1);
                        })
                        .catch((err) => {
                            console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                            if (Array.isArray(productsBeforeSync) && productsBeforeSync.length > 0) {
                                setProducts(prev => {
                                    if (Array.isArray(prev) && prev.length === productsBeforeSync.length) return prev;
                                    return productsBeforeSync;
                                });
                            }
                            if (!clientSyncDoneRef.current) {
                                clientSyncDoneRef.current = true;
                                return;
                            }
                            setSyncVer((v) => v + 1);
                        });
                } else {
                    if (!clientSyncDoneRef.current) {
                        clientSyncDoneRef.current = true;
                        return;
                    }
                    setSyncVer((v) => v + 1);
                }
            }
        }, [clientId]);

        React.useEffect(() => {
            if (!clientId) {
                setBackupMeta(null);
                return;
            }
            try {
                const meta = U && typeof U.lsGet === 'function' ? U.lsGet('heys_backup_meta', null) : null;
                setBackupMeta(meta || null);
            } catch (error) {
            }
        }, [clientId, setBackupMeta, U]);

        React.useEffect(() => {
            const markInitialSyncDone = () => {
                if (window.HEYS) window.HEYS.syncCompletedAt = Date.now();
                setTimeout(() => {
                    initialSyncDoneRef.current = true;
                    if (window.HEYS) window.HEYS.initialSyncDone = true;
                }, 1000);
            };
            window.addEventListener('heysSyncCompleted', markInitialSyncDone);
            return () => {
                window.removeEventListener('heysSyncCompleted', markInitialSyncDone);
            };
        }, []);

        React.useEffect(() => {
            // v5.0.2: Дедупликация — heys_storage_supabase диспатчит оба события
            // (heys:products-updated + heysProductsUpdated) последовательно.
            // Без дедупликации setSyncVer вызывается дважды → 2 React-рендера на каждый sync.
            let _lastProductsVerTs = 0;

            const handleProductsUpdate = (event) => {
                const detail = event?.detail || {};
                const incoming = detail.products;
                // 🔄 v4.8.8: Единый источник истины — Store API
                const latest = Array.isArray(incoming)
                    ? incoming
                    : (window.HEYS?.products?.getAll?.() || []);

                // 🪦 v4.8.10: Tombstone filter — предотвращает resurrection через event dispatch
                const _ts = window.HEYS?.store?.get?.('heys_deleted_ids') || [];
                let filtered = latest;
                if (Array.isArray(_ts) && _ts.length > 0) {
                    const _dIds = new Set(_ts.map(t => t.id).filter(Boolean));
                    const _dNames = new Set(_ts.map(t => (t.name || '').trim().toLowerCase()).filter(Boolean));
                    filtered = latest.filter(p =>
                        !_dIds.has(p.id) &&
                        !_dNames.has((p.name || '').trim().toLowerCase())
                    );
                }

                setProducts(filtered);
                if (!initialSyncDoneRef.current) return;

                // Дедупликация: пропускаем если уже отреагировали в течение 300мс
                const now = Date.now();
                if (now - _lastProductsVerTs < 300) return;
                _lastProductsVerTs = now;
                setSyncVer((v) => v + 1);
            };

            window.addEventListener('heys:products-updated', handleProductsUpdate);
            window.addEventListener('heysProductsUpdated', handleProductsUpdate);
            return () => {
                window.removeEventListener('heys:products-updated', handleProductsUpdate);
                window.removeEventListener('heysProductsUpdated', handleProductsUpdate);
            };
        }, [setProducts, setSyncVer]);

        React.useEffect(() => {
            const IGNORED_SOURCES = [
                'cloud', 'merge', 'step-modal',
                'deficit-step', 'household-step', 'training-step', 'steps-step',
                'measurements-step', 'cold-exposure-step',
                'cycle-auto', 'cycle-clear', 'cycle-save', 'cycle-step'
            ];

            const handleDayUpdate = (e) => {
                const source = e.detail?.source;
                const field = e.detail?.field;

                if (field === 'cycleDay') return;
                if (source && IGNORED_SOURCES.includes(source)) {
                    return;
                }
                if (!initialSyncDoneRef.current) return;

                setSyncVer((v) => v + 1);
            };

            window.addEventListener('heys:day-updated', handleDayUpdate);
            return () => window.removeEventListener('heys:day-updated', handleDayUpdate);
        }, [setSyncVer]);

        React.useEffect(() => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            // 🚀 PERF v2.5: Don't re-upload products that were just downloaded from cloud
            // After sync, React state updates → this effect fires → 405KB upload back to cloud
            // Grace period check: skip if sync completed within last 10 seconds
            const cloud = window.HEYS?.cloud;
            if (cloud?._syncCompletedAt && (Date.now() - cloud._syncCompletedAt) < 10000) {
                return;
            }
            saveTimerRef.current = setTimeout(() => {
                try {
                    window.HEYS.saveClientKey('heys_products', products);
                } catch (e) {
                    console.error('Error saving products:', e);
                }
            }, 300);
            return () => {
                if (saveTimerRef.current) {
                    clearTimeout(saveTimerRef.current);
                    saveTimerRef.current = null;
                }
            };
        }, [products]);
    };

    HEYS.AppSyncEffects = {
        useSyncEffects,
    };
})();
