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
                    const stored =
                        (window.HEYS &&
                            window.HEYS.utils &&
                            window.HEYS.utils.lsGet &&
                            window.HEYS.utils.lsGet('heys_products', [])) ||
                        [];
                    if (Array.isArray(stored) && stored.length) setProducts(stored);
                } catch (e) { }
            }
        }, [products.length, setProducts]);

        React.useEffect(() => {
            if (clientId) {
                U.lsSet('heys_client_current', clientId);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = clientId;
                // 🔇 v4.7.1: Лог клиента отключён

                if (cloud && typeof cloud.syncClient === 'function') {
                    const productsBeforeSync = products.length > 0 ? products : window.HEYS.utils.lsGet('heys_products', []);

                    cloud.syncClient(clientId)
                        .then(() => {
                            const loadedProducts = Array.isArray(
                                window.HEYS.utils.lsGet('heys_products', []),
                            )
                                ? window.HEYS.utils.lsGet('heys_products', [])
                                : [];

                            if (loadedProducts.length === 0 && Array.isArray(productsBeforeSync) && productsBeforeSync.length > 0) {
                                // 🔇 v4.7.1: Лог отключён
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
                                setProducts(prev => {
                                    if (Array.isArray(prev) && prev.length === loadedProducts.length) return prev;
                                    return loadedProducts;
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
                setTimeout(() => {
                    initialSyncDoneRef.current = true;
                }, 1000);
            };
            window.addEventListener('heysSyncCompleted', markInitialSyncDone);
            return () => {
                window.removeEventListener('heysSyncCompleted', markInitialSyncDone);
            };
        }, []);

        React.useEffect(() => {
            const handleProductsUpdate = (event) => {
                const detail = event?.detail || {};
                const incoming = detail.products;
                const latest = Array.isArray(incoming)
                    ? incoming
                    : (window.HEYS?.products?.getAll?.() || window.HEYS?.utils?.lsGet?.('heys_products', []) || []);

                setProducts(latest);
                if (!initialSyncDoneRef.current) return;
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
