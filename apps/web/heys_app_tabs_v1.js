// heys_app_tabs_v1.js — Tab wrappers and skeletons for HEYS app

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

    const TAB_SKELETON_DELAY_MS = 260;

    // ──────────────────────────────────────────────────────────────────────
    // Phase 5C: one-shot cleanup of *_insights_feedback_default keys.
    // These are written before profile loads (no UUID → wrong key scope),
    // can reach 970 KB+, and are the main cause of localStorage overflow.
    // On cleanup: merge unique records into the per-client key, then delete.
    // ──────────────────────────────────────────────────────────────────────
    let _p5cRan = false;
    function _runDefaultFeedbackCleanup(cid) {
        if (_p5cRan) return;
        _p5cRan = true;
        try {
            const FEEDBACK_MAX_HISTORY = 30;
            const defaultKeys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.includes('_insights_feedback_') && k.endsWith('_default')) {
                    defaultKeys.push(k);
                }
            }
            if (defaultKeys.length === 0) return;
            for (const dk of defaultKeys) {
                try {
                    const raw = localStorage.getItem(dk);
                    if (!raw) { localStorage.removeItem(dk); continue; }
                    let arr;
                    try { arr = JSON.parse(raw); } catch (_) { localStorage.removeItem(dk); continue; }
                    if (!Array.isArray(arr)) { localStorage.removeItem(dk); continue; }
                    // Migrate into the per-client key when clientId is known.
                    if (cid) {
                        const clientKey = dk.replace(/_default$/, '_' + cid);
                        try {
                            const existingRaw = localStorage.getItem(clientKey);
                            const existing = (() => { try { return JSON.parse(existingRaw || '[]'); } catch (_) { return []; } })();
                            const byId = new Map();
                            for (const rec of [...arr, ...(Array.isArray(existing) ? existing : [])]) {
                                if (rec && rec.id && !byId.has(rec.id)) byId.set(rec.id, rec);
                            }
                            const merged = Array.from(byId.values())
                                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                                .slice(0, FEEDBACK_MAX_HISTORY);
                            if (window.HEYS && window.HEYS.store && typeof window.HEYS.store.set === 'function') {
                                window.HEYS.store.set(clientKey, merged);
                            } else {
                                localStorage.setItem(clientKey, JSON.stringify(merged));
                            }
                        } catch (_) { /* noop — merge failure must not prevent _default deletion */ }
                    }
                    localStorage.removeItem(dk);
                    console.info('[HEYS.p5c] Cleaned default feedback key', dk, '(' + arr.length + ' records)', cid ? '→ merged to per-client key' : '(no cid, deleted only)');
                } catch (_) { /* noop */ }
            }
        } catch (_) { /* noop */ }
    }

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
                    // boot_optimized_v1: defer the heavy App-tree render via startTransition
                    // so Header/Skeleton stay interactive while DayTab subtree commits in
                    // a deferred lane. Saves ~150-300ms perceived jank
                    // (plan gleaming-pondering-dewdrop.md, Phase 1.2).
                    if (React.startTransition && window.HEYS?.flags?.isEnabled?.('boot_optimized_v1')) {
                        React.startTransition(() => setLoading(false));
                    } else {
                        setLoading(false);
                    }
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

    // 🚀 PERF: Memoize DayTabWithCloudSync so it does NOT re-render when AppRoot re-renders
    // due to sync indicator state changes (useCloudSyncStatus updates pendingCount, cloudStatus, etc.
    // multiple times per second during sync). DayTab's relevant props (products, clientId,
    // selectedDate, subTab) are now signature-stable after the prof/products stabilization fixes.
    // Without memo, every sync event triggers full DayTab tree reconciliation (~300ms).
    DayTabWithCloudSync = React.memo(DayTabWithCloudSync, function dayTabPropsEqual(prev, next) {
        if (prev.clientId !== next.clientId) return false;
        if (prev.selectedDate !== next.selectedDate) return false;
        if (prev.subTab !== next.subTab) return false;
        // products ref is stabilized by signature in useProductsContext — ref equality is safe
        if (prev.products !== next.products) return false;
        // setSelectedDate from useState is stable; no check needed
        return true;
    });

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
            return window.HEYS?.products?.getAll?.() || [];
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

            // heys:products-updated removed — heysProductsUpdated always fires alongside it
            // (both dispatched together in applyForegroundHotSyncValue) so subscribing to both
            // caused handleProductsUpdated to run twice per HOT sync.
            window.addEventListener('heysProductsUpdated', handleProductsUpdated);
            window.addEventListener('heysSyncCompleted', handleProductsUpdated);

            return () => {
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

                // 🛡️ Curator gate: в кураторской сессии в LS лежат dayv2 нескольких
                // клиентов одновременно (см. _otherCount в storage_supabase). Даже с
                // scoping-fix в autoRecoverOnLoad самый безопасный режим — не запускать
                // автоматический recovery под куратором, чтобы не было путей косвенного
                // отравления legacy heys_products. Manual "restore-orphans" в UI
                // остаётся доступной для явного запуска. Overlay migration всё ещё
                // нужно триггернуть — у неё своя логика и idempotency-гейт.
                //
                // 🔧 fix 2026-05-08: реальный экспорт — HEYS.auth.isCuratorSession
                // (или window.isCuratorSession как fallback). Раньше код искал
                // window.HEYS.bootstrap.isCuratorSession (lowercase), которого нет
                // (есть HEYS.Bootstrap c capital B), поэтому гейт не срабатывал.
                const _isCurator =
                    (typeof window.HEYS?.auth?.isCuratorSession === 'function' && window.HEYS.auth.isCuratorSession())
                    || (typeof window.HEYS?.Bootstrap?.isCuratorSession === 'function' && window.HEYS.Bootstrap.isCuratorSession())
                    || (typeof window.isCuratorSession === 'function' && window.isCuratorSession())
                    || false;
                if (_isCurator === true) {
                    try { runOverlayMigrationOnce(clientId); } catch (_) { /* noop */ }
                    try { console.info('[HEYS.products] orphan-recovery skipped: curator session'); } catch (_) {}
                    return;
                }

                if (clientId && recoveryRunCache.has(clientId)) {
                    // Recovery already ran this session — but migration may still need to fire
                    // (e.g., recovery's first run failed, OR migration trigger missed).
                    try { runOverlayMigrationOnce(clientId); } catch (_) { /* noop */ }
                    return;
                }

                const currentProducts = getLatestProducts();
                const cachedShared = window.HEYS?.cloud?.getCachedSharedProducts?.() || [];
                const minReady = cachedShared.length > 0 ? 10 : 5;

                if (!Array.isArray(currentProducts) || currentProducts.length < minReady) {
                    recoveryAttempts += 1;
                    if (recoveryAttempts <= MAX_RECOVERY_ATTEMPTS) {
                        setTimeout(() => runOrphanRecovery(options), RECOVERY_RETRY_MS);
                    }
                    // Try migration anyway — it has its own gate (shared cache + idempotency).
                    // This ensures migration fires even if recovery never reaches threshold.
                    try { runOverlayMigrationOnce(clientId); } catch (_) { /* noop */ }
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
                        const updatedProducts = window.HEYS.products?.getAll?.() || [];
                        safeSetProducts(updatedProducts);
                        // Toast «Восстановлено N» убран: теперь продукты пишутся в overlay
                        // напрямую (TypeB) и синхронятся через cloud overlay → нет отдельного
                        // recovery-flow с in-memory кэшем.
                    }

                    // ──────────────────────────────────────────────────────────
                    // Phase β: one-shot overlay migration. Runs once per client
                    // per session (gated by recoveryRunCache + LS markers).
                    // Source = HEYS.products.getAll() post-self-heal (NOT raw LS).
                    // ──────────────────────────────────────────────────────────
                    try {
                        runOverlayMigrationOnce(clientId);
                    } catch (e) {
                        // Defensive: never let overlay migration break recovery flow.
                        if (window.console && window.console.warn) {
                            console.warn('[HEYS.overlay] migration error (non-fatal):', e && e.message);
                        }
                    }
                }).catch(() => { });
            };

            // Phase β: one-shot overlay migration (idempotent, gated by LS markers).
            const runOverlayMigrationOnce = (cid) => {
                if (!cid) return;
                if (typeof window === 'undefined' || !window.HEYS) return;
                const Overlay = window.HEYS.OverlayStore;
                const Products = window.HEYS.products;
                const cloud = window.HEYS.cloud;
                if (!Overlay || !Products || !cloud) return;

                // Idempotency: skip if migrated within last 7 days AND on current version,
                // unless aborted (then aborted gate wins).
                // CURRENT_MIGRATION_VERSION bumps when migrate() logic changes (e.g. fingerprint
                // fallback added). On version mismatch we re-run regardless of TTL.
                const CURRENT_MIGRATION_VERSION = 4; // v4: self-heal dedup TypeA overlay rows when overlay > legacy
                const ABORT_KEY = 'heys_overlay_migration_aborted';
                const TS_KEY = 'heys_overlay_migrated_at';
                const STATUS_KEY = 'heys_overlay_migration_status';
                const VERSION_KEY = 'heys_overlay_migration_version';
                const SEVEN_DAYS_MS = 7 * 86400 * 1000;
                let migratedAt = 0;
                let storedVersion = 0;
                try { migratedAt = parseInt(localStorage.getItem(TS_KEY) || '0', 10) || 0; } catch (_) { /* noop */ }
                try { storedVersion = parseInt(localStorage.getItem(VERSION_KEY) || '0', 10) || 0; } catch (_) { /* noop */ }
                if (localStorage.getItem(ABORT_KEY) === 'true') return;
                const onCurrentVersion = storedVersion >= CURRENT_MIGRATION_VERSION;
                if (onCurrentVersion && migratedAt > 0 && (Date.now() - migratedAt) < SEVEN_DAYS_MS) return;

                // Get shared snapshot. If empty, defer until heys:shared-products-updated event.
                const sharedById = cloud.getSharedIndex && cloud.getSharedIndex();
                if (!sharedById || sharedById.size === 0) {
                    // Defer: re-try once when shared cache populates.
                    const onSharedReady = () => {
                        window.removeEventListener('heys:shared-products-updated', onSharedReady);
                        try { runOverlayMigrationOnce(cid); } catch (_) { /* noop */ }
                    };
                    window.addEventListener('heys:shared-products-updated', onSharedReady, { once: true });
                    return;
                }

                // Source: HEYS.products.getAll() POST-SELF-HEAL via the LEGACY path.
                // CRITICAL: with overlay flag ON and overlay empty, wrapped getAll() goes
                // overlay → returns [] without falling back to legacy. Migration must read
                // legacy directly. Temporarily disable flag to force legacy read.
                const flagWasOn = window.HEYS.flags?.isEnabled?.('overlay_products_v2');
                if (flagWasOn) window.HEYS.flags.disable('overlay_products_v2');
                let flat = null;
                try {
                    flat = Products.getAll();
                } finally {
                    if (flagWasOn) window.HEYS.flags.enable('overlay_products_v2');
                }
                if (!Array.isArray(flat)) {
                    console.warn('[HEYS.products] migration source not an array; skipping');
                    return;
                }
                // Defer migration if legacy isn't populated yet (early boot before sync).
                // Re-trigger on heysSyncCompleted to catch the populated state.
                if (flat.length === 0) {
                    console.info('[HEYS.products] migration deferred — legacy is empty (sync not done)');
                    const onSyncDone = () => {
                        window.removeEventListener('heysSyncCompleted', onSyncDone);
                        try { runOverlayMigrationOnce(cid); } catch (_) { /* noop */ }
                    };
                    window.addEventListener('heysSyncCompleted', onSyncDone, { once: true });
                    return;
                }

                // Cloud-canonical principle: if overlay LS has ANY rows, cloud is the
                // source of truth — never repopulate from legacy heys_products. Legacy is
                // dead-data after overlay rollout (last seen update may be weeks-months old).
                // The previous TOP-UP path tried to repopulate overlay from legacy when
                // legacy >> overlay, but this consistently corrupted curator sessions: cloud
                // overlay was 297 rows, but each curator boot loaded fresh LS, then TOP-UP
                // replaced it with stale legacy 150 rows, push-back set cloud → 150, then
                // truncated to 12 (customs only) via secondary write paths.
                //
                // Now: if overlay LS is non-empty, trust it and skip migration.
                // First-time fresh-LS (existingOverlay=0) still goes through migrate to
                // bootstrap from legacy (legitimate one-time conversion).
                //
                // Exception: if overlay has 0 TypeA rows but legacy has many products,
                // orphan-recovery populated the overlay before migration could run.
                // Fall through to migrate so TypeA links get created (migration merges
                // result with existing TypeB customs via writeRaw).
                try {
                    const existingOverlay = Overlay.readRaw() || [];
                    if (existingOverlay.length > 0) {
                        const existingCustom = existingOverlay.filter(r => r && r._custom).length;
                        const existingTypeA = existingOverlay.filter(r => r && !r._custom && r.shared_origin_id).length;
                        // If orphan-recovery ran first and overlay is all TypeB with no TypeA,
                        // and legacy has real products to migrate — run migration anyway.
                        if (existingTypeA === 0 && flat.length > 10) {
                            console.info('[HEYS.products] migration: overlay is TypeB-only, falling through to create TypeA links', {
                                existingLen: existingOverlay.length,
                                existingCustom,
                                legacyLen: flat.length,
                            });
                            // fall through to migrate()
                        } else {
                            // Self-heal in-place: dedup TypeA by shared_origin_id (no migrate, no
                            // cloud-shaped repopulation). Saves users with already-poisoned overlay.
                            const seenSO = new Set();
                            const healedOverlay = existingOverlay.filter(r => {
                                if (r?._custom === true) return true;
                                const k = String(r?.shared_origin_id ?? r?.id ?? '');
                                if (!k || seenSO.has(k)) return false;
                                seenSO.add(k);
                                return true;
                            });
                            if (healedOverlay.length < existingOverlay.length) {
                                Overlay.writeRaw(healedOverlay);
                                console.warn('[HEYS.products] migration self-heal: deduped overlay TypeA rows', {
                                    before: existingOverlay.length,
                                    after: healedOverlay.length,
                                    existingCustom,
                                    legacyLen: flat.length,
                                });
                            } else {
                                console.info('[HEYS.products] migration skipped: overlay non-empty, cloud-canonical', {
                                    existingLen: existingOverlay.length,
                                    existingCustom,
                                    legacyLen: flat.length,
                                });
                            }
                            try {
                                localStorage.setItem(TS_KEY, String(Date.now()));
                                localStorage.setItem(STATUS_KEY, 'success');
                                localStorage.setItem(VERSION_KEY, String(CURRENT_MIGRATION_VERSION));
                                localStorage.removeItem(ABORT_KEY);
                            } catch (_) { /* noop */ }
                            return;
                        }
                    }
                } catch (_) { /* noop */ }

                // 🛡️ Anti-tiny-legacy guard: если migration уже была success на этом устройстве
                // (для любого клиента) и flat подозрительно мал (<= 3 продуктов), это почти наверняка
                // stale 1-row legacy snapshot из облака. Defer миграцию до прихода cloud overlay-v2
                // (heysSyncCompleted событие). Без этого guard cloud's stale heys_products (1 row)
                // мигрирует в 1-row overlay, затирая всё.
                try {
                    const wasMigratedBefore = (parseInt(localStorage.getItem(VERSION_KEY) || '0', 10) || 0) >= 1
                        || localStorage.getItem(STATUS_KEY) === 'success';
                    if (wasMigratedBefore && flat.length <= 3) {
                        console.warn('[HEYS.products] migration deferred: tiny legacy after prior success — likely stale cloud stub', {
                            legacyLen: flat.length,
                            existingOverlayLen: (Overlay.readRaw() || []).length,
                        });
                        const onSyncDone = () => {
                            window.removeEventListener('heysSyncCompleted', onSyncDone);
                            try { runOverlayMigrationOnce(cid); } catch (_) { /* noop */ }
                        };
                        window.addEventListener('heysSyncCompleted', onSyncDone, { once: true });
                        return;
                    }
                } catch (_) { /* noop */ }

                // Snapshot pre-migration for rollback safety (90-day retention; cleanup in phase ε).
                try {
                    const snapKey = `heys_products_pre_overlay_${Date.now()}`;
                    if (window.HEYS.utils && window.HEYS.utils.lsSet) {
                        window.HEYS.utils.lsSet(snapKey, flat);
                    }
                } catch (_) { /* noop */ }

                // Translate to overlay rows.
                const result = Overlay.migrate(flat, sharedById);
                if (!result.ok) {
                    console.warn('[HEYS.products] overlay migration aborted:', result.reason);
                    try {
                        localStorage.setItem(ABORT_KEY, 'true');
                        localStorage.setItem(STATUS_KEY, 'aborted');
                        window.__diag_overlay = { reason: result.reason, pre: flat, post: null };
                    } catch (_) { /* noop */ }
                    if (window.HEYS.Toast?.warning) {
                        window.HEYS.Toast.warning('Миграция продуктов прервана — работаем на legacy. Откройте __diag_overlay в консоли.');
                    }
                    return;
                }

                // β.6 sanity gate: if input has rows but migrate produced none
                // (every row had id == null), refuse to stamp success.
                if (flat.length > 0 && result.rows.length === 0) {
                    console.warn('[HEYS.products] overlay migration aborted: zero-rows from non-empty input', { flatLen: flat.length });
                    try {
                        localStorage.setItem(ABORT_KEY, 'true');
                        localStorage.setItem(STATUS_KEY, 'aborted');
                        window.__diag_overlay = { reason: 'zero-rows-from-nonempty-input', pre: flat, post: null };
                    } catch (_) { /* noop */ }
                    return;
                }

                // Verifier: id-set parity + nutrient field parity.
                // Capture previous overlay state BEFORE writing new rows — for safe rollback.
                const previousOverlayRows = Overlay.readRaw();
                Overlay.writeRaw(result.rows);
                const merged = Overlay.toMergedView(sharedById) || [];
                const verify = Overlay.verifyMigration(flat, merged);
                // 🛡️ Race-guard: если merged пуст при non-empty flat — это почти всегда
                // race-condition (store-scope ещё не переключился на клиента, либо shared
                // cache не успел инициализироваться). Откат overlay до [] делает только хуже:
                // UI получает 0 продуктов. Оставляем 150 свежих rows, не стэмпуем success —
                // на следующем boot migrate повторится в нормальном контексте и пройдёт.
                if (!verify.ok && Array.isArray(merged) && merged.length === 0 && flat.length > 0) {
                    try {
                        window.__diag_overlay = { errors: verify.errors, totalErrors: verify.totalErrors, pre: flat, post: merged, reason: 'race-empty-merged-keeping-overlay' };
                    } catch (_) { /* noop */ }
                    console.warn('[HEYS.products] overlay migration verifier: merged view is empty (likely store-context race). Keeping new overlay rows, deferring success stamp — will retry on heysSyncCompleted/heys:shared-products-updated.');
                    // НЕ откатываем, НЕ стэмпуем success — overlay остаётся с result.rows.
                    // 🛡️ Дополнительно: подписываемся на cloud-sync завершение чтобы перезапустить
                    // migration когда shared cache / overlay v2 наконец придут (важно для VPN/slow-net).
                    try {
                        if (!window.__overlayMigrationRetryArmed) {
                            window.__overlayMigrationRetryArmed = true;
                            const retry = () => {
                                window.removeEventListener('heysSyncCompleted', retry);
                                window.removeEventListener('heys:shared-products-updated', retry);
                                window.__overlayMigrationRetryArmed = false;
                                try { runOverlayMigrationOnce(cid); } catch (_) { /* noop */ }
                            };
                            window.addEventListener('heysSyncCompleted', retry, { once: true });
                            window.addEventListener('heys:shared-products-updated', retry, { once: true });
                        }
                    } catch (_) { /* noop */ }
                    return;
                }
                if (!verify.ok) {
                    // Roll back to previous overlay state — DO NOT clear to [].
                    // Empty overlay would cause UI to show no products when flag is on.
                    Overlay.writeRaw(previousOverlayRows);
                    try {
                        localStorage.setItem(ABORT_KEY, 'true');
                        localStorage.setItem(STATUS_KEY, 'aborted');
                        window.__diag_overlay = { errors: verify.errors, totalErrors: verify.totalErrors, pre: flat, post: merged, restoredRows: previousOverlayRows.length };
                    } catch (_) { /* noop */ }
                    console.warn('[HEYS.products] overlay migration verifier failed:', verify.totalErrors, 'errors. Sample:', verify.errors, 'Restored to previous overlay (', previousOverlayRows.length, 'rows)');
                    if (window.HEYS.Toast?.warning) {
                        window.HEYS.Toast.warning('Миграция продуктов прервана — несовпадение данных. Откройте __diag_overlay в консоли.');
                    }
                    return;
                }

                // Success: stamp markers + log.
                try {
                    localStorage.setItem(TS_KEY, String(Date.now()));
                    localStorage.setItem(STATUS_KEY, 'success');
                    localStorage.setItem(VERSION_KEY, String(CURRENT_MIGRATION_VERSION));
                    localStorage.removeItem(ABORT_KEY);
                } catch (_) { /* noop */ }
                console.info('[HEYS.products] overlay migration ok', {
                    version: CURRENT_MIGRATION_VERSION,
                    typeA: result.typeA,
                    typeAByFallback: result.typeAByFallback || 0,
                    typeB: result.typeB,
                    total: result.rows.length,
                });

                // ──────────────────────────────────────────────────────────
                // Phase 5C: delete *_default feedback keys (overflow keys
                // written before profile loaded — main source of 970 KB blobs).
                // Runs once per session; migrates records to per-client key.
                // ──────────────────────────────────────────────────────────
                _runDefaultFeedbackCleanup(clientId);

                // ──────────────────────────────────────────────────────────
                // Phase 2b: storage audit (enforce mode when flag on, else shadow).
                // Fires once after first overlay migration completes successfully;
                // re-fires on subsequent boots only if 6h gate has lapsed OR
                // audit version changed. With storage_audit_enforce:true, actually
                // prunes/wipes oversized keys; manual keys go through _mergeAndPrune.
                // ──────────────────────────────────────────────────────────
                try {
                    if (window.HEYS.storageRegistry && typeof window.HEYS.storageRegistry.runAuditOnce === 'function') {
                        window.HEYS.storageRegistry.runAuditOnce().catch((e) => {
                            console.warn('[HEYS.storageRegistry] audit error (non-fatal):', e && e.message);
                        });
                    }
                } catch (e) {
                    console.warn('[HEYS.storageRegistry] audit invocation failed (non-fatal):', e && e.message);
                }
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
                const tick = () => {
                    if (typeof document !== 'undefined' && document.hidden) return;
                    loadStats();
                };
                const interval = setInterval(tick, 5000);
                const onVis = () => {
                    if (typeof document !== 'undefined' && !document.hidden) loadStats();
                };
                document.addEventListener('visibilitychange', onVis);
                return () => {
                    clearInterval(interval);
                    document.removeEventListener('visibilitychange', onVis);
                };
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
