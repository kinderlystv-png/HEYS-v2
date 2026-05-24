// heys_app_sync_effects_v1.js — client sync & persistence effects
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    // 🪦 F10 (plan 2026-05-24): multi-tab tombstone listener.
    // Когда в одном табе пользователь удалил продукт (или восстановил), оба tombstone-store
    // записывают в LS (heys_deleted_ids через HEYS.store + heys_deleted_products_ignore_list
    // через saveDeletedProductsData), но у других табов нет триггера на это. До F10 второй таб узнавал об изменении
    // только при следующем cloud-sync (могло занять секунды-минуты), в этом окне
    // второй таб мог автоматически восстановить продукт из shared (F8). Слушаем
    // оба key — они синхронизированы через HEYS.deletedProducts.add.
    // Storage event срабатывает кросс-табно (НЕ в табе-инициаторе) — это правильно:
    // инициатор уже в курсе изменений через прямой setItem.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        try {
            const TOMBSTONE_LS_KEYS = new Set([
                'heys_deleted_ids',
                'heys_deleted_products_ignore_list',
            ]);
            window.addEventListener('storage', (e) => {
                if (!e || !TOMBSTONE_LS_KEYS.has(e.key)) return;
                try {
                    if (typeof window.HEYS?.deletedProducts?._reloadFromStorage === 'function') {
                        window.HEYS.deletedProducts._reloadFromStorage();
                    }
                    if (typeof window.HEYS?.orphanProducts?.recalculate === 'function') {
                        window.HEYS.orphanProducts.recalculate();
                    }
                    console.info('[HEYS.sync] 🪦 multi-tab tombstone reload: ' + e.key + ' changed in another tab');
                } catch (err) {
                    console.warn('[HEYS.sync] multi-tab tombstone handler failed:', err?.message || err);
                }
            });
        } catch (_) { /* noop */ }
    }

    function buildProductsFingerprint(list) {
        if (!Array.isArray(list) || list.length === 0) return '0:0';
        let hash = 2166136261 >>> 0;
        for (let i = 0; i < list.length; i++) {
            const p = list[i] || {};
            const token = `${p.id || p.name || ''}|${p.updatedAt || ''}|${p.iron || ''}`;
            for (let j = 0; j < token.length; j++) {
                hash ^= token.charCodeAt(j);
                hash = Math.imul(hash, 16777619) >>> 0;
            }
        }
        return `${list.length}:${hash}`;
    }

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

        // 🚀 PERF v7.0: Track last dispatched clientId to avoid duplicate heys:client-changed events
        // Gate flow (heys_app_gate_flow_v1.js) already dispatches this event on click
        const _lastDispatchedClientRef = React.useRef(null);

        React.useEffect(() => {
            if (clientId) {
                U.lsSet('heys_client_current', clientId);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = clientId;
                // 🚀 PERF v7.0: Only dispatch if this is a NEW clientId (not already dispatched by gate flow)
                if (_lastDispatchedClientRef.current !== clientId) {
                    _lastDispatchedClientRef.current = clientId;
                    window.dispatchEvent(new CustomEvent('heys:client-changed', { detail: { clientId } }));
                }
                // 🔇 v4.7.1: Лог клиента отключён

                if (cloud && typeof cloud.syncClient === 'function') {
                    // 🔧 v63 FIX #1+#7: Если switchClient уже управляет sync для этого клиента,
                    // не запускаем дублирующий syncClient из useEffect — он проиграет race
                    // и/или заблокируется cooldown'ом, создавая бесполезный overhead.
                    if (cloud._switchClientInProgress) {
                        console.info('[HEYS.sync] ⏭️ useEffect: switchClient in progress, skipping duplicate sync');
                        return;
                    }
                    const productsBeforeSync = products.length > 0
                        ? products
                        : (window.HEYS?.products?.getAll?.() || []);

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

                            // 📝 Event log (plan Wave 5.3, F-EL Batch D): sync-products — sample 0.5
                            try {
                                const _beforeLen = Array.isArray(productsBeforeSync) ? productsBeforeSync.length : 0;
                                window.HEYS?.eventLog?.write(
                                    'sync-products',
                                    `Cloud merge: was=${_beforeLen} loaded=${loadedProducts.length} after_tombstone=${filteredProducts.length}`,
                                    { before: _beforeLen, after: filteredProducts.length, count: filteredProducts.length - _beforeLen },
                                    'handleProductsUpdate'
                                );
                            } catch (_) { /* noop */ }

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
                                window.HEYS.products.setAll(productsBeforeSync, {
                                    source: 'cloud-sync-fallback',
                                    skipNotify: true,
                                    skipCloud: true
                                });
                            } else {
                                // 🔄 v4.8.7: Проверяем качество данных вместо длины
                                // Сравниваем количество продуктов с микронутриентами (iron) вместо общей длины
                                setProducts(prev => {
                                    const prevIron = Array.isArray(prev) ? prev.filter(p => p?.iron && +p.iron > 0).length : 0;
                                    const loadedIron = filteredProducts.filter(p => p?.iron && +p.iron > 0).length;
                                    const prevFp = buildProductsFingerprint(prev);
                                    const loadedFp = buildProductsFingerprint(filteredProducts);

                                    // 🔍 v4.8.7: DEBUG — какое состояние пытаемся обновить
                                    console.info(`[HEYS.sync] 🔍 setProducts callback: prev.length=${prev.length}, prevIron=${prevIron}, loadedIron=${loadedIron}`);

                                    // Если данные реально совпадают по содержимому — можно не трогать state.
                                    // Одной проверки length/withIron недостаточно: другой клиент или другой набор
                                    // может иметь те же метрики, из-за чего UI оставался на старой версии.
                                    if (Array.isArray(prev) && prev.length === filteredProducts.length && prevIron === loadedIron && prevFp === loadedFp) {
                                        console.info(`[HEYS.sync] 🚫 React state NOT updated (same fingerprint)`);
                                        return prev;
                                    }

                                    console.info(`[HEYS.sync] 🔄 React state updated: ${prev.length}→${filteredProducts.length} products, ${prevIron}→${loadedIron} with iron, fpChanged=${prevFp !== loadedFp}`);
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
                // 🆕 PERF v9.2: React-слушатель поймал heysSyncCompleted
                window.__heysPerfMark && window.__heysPerfMark('markInitialSyncDone: React listener fired');
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
                if (!initialSyncDoneRef.current) {
                    return;
                }

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
                'cloud', 'merge', 'step-modal', 'fetchDays',
                'deficit-step', 'household-step', 'training-step', 'steps-step',
                'measurements-step', 'cold-exposure-step',
                'cycle-auto', 'cycle-clear', 'cycle-save', 'cycle-step',
                'cascade-batch'
            ];

            const handleDayUpdate = (detail) => {
                const source = detail?.source;
                const field = detail?.field;

                if (field === 'cycleDay') return;
                if (source && IGNORED_SOURCES.includes(source)) {
                    return;
                }
                if (!initialSyncDoneRef.current) {
                    return;
                }

                if (React.startTransition && window.HEYS?.flags?.isEnabled?.('boot_optimized_v1')) {
                    React.startTransition(() => setSyncVer((v) => v + 1));
                } else {
                    setSyncVer((v) => v + 1);
                }
            };

            // PERF NEW-1: миграция на dispatcher next-frame lane.
            // setSyncVer триггерит React tree re-render — defer на следующий кадр через
            // dispatcher батчит несколько эвентов в один setSyncVer per frame, не блокируя текущий.
            // Fallback на window event если dispatcher не загружен.
            const dispatcher = window.HEYS?.events?.dayUpdated;
            if (dispatcher && typeof dispatcher.subscribe === 'function') {
                return dispatcher.subscribe(handleDayUpdate, { priority: 'next-frame' });
            }
            const wrap = (e) => handleDayUpdate(e?.detail || {});
            window.addEventListener('heys:day-updated', wrap);
            return () => window.removeEventListener('heys:day-updated', wrap);
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
                    // overlay clients: writeRaw handles cloud sync; skip redundant legacy save
                    if (window.HEYS?.flags?.isEnabled?.('overlay_products_v2')) return;
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
