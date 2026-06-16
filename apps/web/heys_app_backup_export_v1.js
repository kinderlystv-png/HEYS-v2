// heys_app_backup_export_v1.js — full-state backup export (schema v3).
//
// Schema v3 (allow-by-default + deny-list):
//   • Сканируем localStorage, исключаем явный чёрный список (auth, debug,
//     transient, caches, migration markers, test fixtures).
//   • Новые фичи автоматически попадают в backup без обновления whitelist.
//   • Специальные секции (overlay, days) выходят из общего kv{} — у них своя
//     обработка при restore (applyCloudSnapshot, batch).
//   • Auth-tokens отдельным leak-probe на финальном JSON.
//   • Foreign-client scoped ключи отфильтровываются (защита у curator).
//   • gzip через CompressionStream (fallback на raw JSON).
//   • Storage-registry signal: если ключ registered c cloudSync='never' или
//     maxSize=0 — исключаем дополнительно (защита на будущее).
//
// План: .claude/plans/misty-booping-quilt.md (Schema v3).

; (function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppBackupExport = HEYS.AppBackupExport || {};

    const SCHEMA_VERSION = 3;
    const DENY_LIST_VERSION = '2026-05-11';
    const DAYS_CAP = 1825;        // ~5 лет
    const KV_CAP = 5000;          // safety threshold для k/v секции
    const MAX_RAW_BYTES = 5 * 1024 * 1024; // 5 MB до gzip — порог предупреждения

    // ─────────────────────────────────────────────────────────────────────
    // Deny-list — что НЕ попадает в backup.
    //
    // 1. Auth/security: токены и сессии (нельзя выгружать никогда).
    // 2. Boot/session/debug: state ранней загрузки, лог-каналы, ID-мэппинги.
    // 3. PWA / update / what's new: lifecycle managed by app, не пользовательские.
    // 4. Subscription/trial: source of truth — сервер, локально только snapshot.
    // 5. Caches: переразвернутся сами после restore.
    // 6. Migration markers: одноразовые stamp'ы.
    // 7. Test fixtures.
    // 8. Special section duplicates: overlay/days обрабатываются отдельно.
    // ─────────────────────────────────────────────────────────────────────
    const BACKUP_DENY_PATTERNS = [
        // 1. Auth/security
        /^heys_supabase_auth_token$/,
        /^heys_pin_auth_client$/,
        /^heys_session_token$/,
        /^heys_curator_session$/,
        /^heys_pin_cookie_session_hint$/,
        /^heys_curator_cookie_session_hint$/,
        /^sb-/,

        // 2. Boot/session/debug
        /^heys_debug_/,
        /^heys_boot_/,
        /^heys_sync_log$/,
        /^heys_sync_deep_diagnostics$/,
        /^heys_pending_sync_/,
        /^heys_last_(visit|sync_ts|client_id|user_client_id)$/i,
        /^heys_lastUserClientId$/,
        /^heys_client_(current|phone)$/,
        /^heys_clients$/,
        /^heys_ab_variant$/,
        /^heys_remember_/,
        /^heys_app_version$/,
        /^heys_connection_mode$/,
        /^heys_registration_in_progress$/,
        /^heys_disable_(hot_sync|batch|markers|screen_aware)$/,
        /^heys_log_groups_v1$/,
        /^heys_log_verbose$/,

        // 3. PWA / update / what's new
        /^heys_pwa_/,
        /^heys_update_/,
        /^heys_whats_new_/,

        // 4. Subscription / trial (server-managed)
        /^heys_subscription_status$/,
        /^heys_trial_/,

        // 5. Caches (re-derived after restore)
        /^heys_xp_cache_/,
        /^heys_iw_config_cache/,
        /^heys_perf_log/,
        /^heys_dayv2_cache_v1$/,
        /^heys_lru_cache_v1$/,
        /^heys_shared_products_cache_v1$/,
        /^heys_insights_cache$/,
        /^heys_pending_count_cache$/,
        /^heys_docs_cache_version$/,

        // 6. Migration markers / audit infra
        /^heys_overlay_(migrated_at|migration_status|migration_version|migration_aborted|migration_lock|health|phase_alpha_perf|self_healed_at)$/,
        /^heys_storage_audit_/,
        /^heys_storage_cleanup_active$/,
        /_migrated$/,
        /^heys_restore_in_progress$/, // marker для aborted-restore detection — runtime only

        // 7. Test fixtures
        /^test_/,

        // 8. Special sections (handled separately as overlayProducts/days)
        /^heys_products_overlay_v2$/,
        /^heys_dayv2_/,
    ];

    // Hard never-touch: всегда блокируется, даже если паттерн пропустил.
    const FORBIDDEN_KEY_NAMES = new Set([
        'heys_supabase_auth_token',
        'heys_pin_auth_client',
        'heys_session_token',
        'heys_curator_session',
        'heys_pin_cookie_session_hint',
        'heys_curator_cookie_session_hint',
    ]);

    function isForbiddenKey(k) {
        if (!k) return false;
        if (FORBIDDEN_KEY_NAMES.has(k)) return true;
        if (k.startsWith('sb-')) return true;
        return false;
    }
    HEYS.AppBackupExport._isForbiddenKey = isForbiddenKey;

    function isDenied(k) {
        if (isForbiddenKey(k)) return true;
        for (const re of BACKUP_DENY_PATTERNS) {
            if (re.test(k)) return true;
        }
        return false;
    }
    HEYS.AppBackupExport._isDenied = isDenied;
    HEYS.AppBackupExport._denyPatterns = BACKUP_DENY_PATTERNS;

    // Storage-registry signal — дополнительная защита: если ключ зарегистрирован
    // и явно помечен как 'never' sync'нуть или maxSize=0 (forbidden) — исключаем.
    function isRegistryExcluded(k) {
        try {
            const reg = HEYS.storageRegistry;
            if (!reg || typeof reg.match !== 'function') return false;
            const policy = reg.match(k);
            if (!policy) return false;
            if (policy.cloudSync === 'never') return true;
            if (policy.maxSize === 0) return true;
            return false;
        } catch (_) { return false; }
    }

    // Foreign-client scoped — защита у curator: ключи другого клиента не попадают.
    function isForeignClientKey(k, currentClientId) {
        if (!currentClientId) return false;
        // Pattern: heys_<other-cid>_*. UUIDs ~36 chars but accept flexible.
        const m = /^heys_([0-9a-f-]{8,})_/i.exec(k);
        if (!m) return false;
        const scoped = m[1].toLowerCase();
        return scoped !== currentClientId.toLowerCase();
    }

    // Безопасное чтение значения по ключу через Store.readSafe (декомпрессия ¤Z¤).
    // Возвращает fallback при ошибках или null.
    function readStoreSafe(key, fallback) {
        try {
            if (HEYS.store && typeof HEYS.store.readSafe === 'function') {
                const v = HEYS.store.readSafe(key, fallback);
                return v === undefined ? fallback : v;
            }
            // Fallback (старая логика на случай если readSafe не загружен).
            if (HEYS.store && typeof HEYS.store.get === 'function') {
                const v = HEYS.store.get(key, fallback);
                return v === undefined ? fallback : v;
            }
        } catch (e) {
            console.warn('[BACKUP] readStoreSafe failed for', key, e && e.message);
        }
        // Last-resort: raw read. НЕ парсим ¤Z¤ — отдаём fallback, иначе мусор.
        try {
            const raw = localStorage.getItem(key);
            if (raw == null) return fallback;
            if (typeof raw === 'string' && raw.startsWith('¤Z¤')) return fallback;
            return JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    }

    function safeFnv1a(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return h.toString(16);
    }

    async function compressIfPossible(json) {
        if (typeof CompressionStream === 'undefined') {
            return { blob: new Blob([json], { type: 'application/json' }), compressed: false };
        }
        try {
            const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
            const blob = await new Response(stream).blob();
            return { blob: new Blob([blob], { type: 'application/gzip' }), compressed: true };
        } catch (e) {
            console.warn('[BACKUP] gzip failed, falling back to raw JSON:', e && e.message);
            return { blob: new Blob([json], { type: 'application/json' }), compressed: false };
        }
    }

    // Нормализация day key: scoped → unscoped, для стабильного восстановления.
    function normalizeDayKey(k) {
        const m = k.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
        return m ? 'heys_dayv2_' + m[1] : null;
    }

    HEYS.AppBackupExport.init = function () {
        HEYS.exportFullBackup = async function () {
            const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

            let lsClientId = localStorage.getItem('heys_client_current');
            if (lsClientId && lsClientId.startsWith('"') && lsClientId.endsWith('"')) {
                lsClientId = lsClientId.slice(1, -1);
            }
            const authClientId = HEYS.currentClientId
                || (HEYS.auth && typeof HEYS.auth.getClientId === 'function' ? HEYS.auth.getClientId() : null);
            const clientId = authClientId || lsClientId;

            if (!clientId) {
                HEYS.Toast?.warning('Нет активного клиента') || alert('Нет активного клиента');
                return { ok: false, error: 'no_client' };
            }
            if (lsClientId && authClientId && lsClientId !== authClientId) {
                console.warn('[BACKUP] clientId mismatch — auth=' + authClientId + ' ls=' + lsClientId + ' (using auth)');
            }

            console.log('[BACKUP] Starting export schema v3. clientId=' + clientId.slice(0, 8));

            try {
                HEYS.Toast?.info?.('Собираем бэкап…');

                const backup = {
                    schemaVersion: SCHEMA_VERSION,
                    denyListVersion: DENY_LIST_VERSION,
                    exportedAt: new Date().toISOString(),
                    clientId: clientId,
                    appVersion: window.APP_VERSION || 'unknown',
                    overlayProducts: null,
                    days: {},
                    kv: {},
                    sharedCatalogHash: null,
                    stats: null,
                };

                // ─────────────────────────────────────────
                // Scan localStorage (один проход).
                // ─────────────────────────────────────────
                const allKeys = [];
                try {
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k) allKeys.push(k);
                    }
                } catch (e) {
                    console.warn('[BACKUP] localStorage.key() iteration failed:', e && e.message);
                }

                const seenStats = {
                    total: allKeys.length,
                    deniedCount: 0,
                    foreignCount: 0,
                    registryExcluded: 0,
                    daysCount: 0,
                    kvCount: 0,
                };

                for (const k of allKeys) {
                    // Только heys_ префикс — всё остальное (sb-, test_, vite-, _next-) пропускаем.
                    if (!k.startsWith('heys_')) {
                        // Auth deny-list ловит sb-* отдельно — это блокировка, не пропуск.
                        if (isForbiddenKey(k)) seenStats.deniedCount++;
                        continue;
                    }

                    // 1. Foreign-client scoped (heys_<other-cid>_*) — пропускаем.
                    if (isForeignClientKey(k, clientId)) {
                        seenStats.foreignCount++;
                        continue;
                    }

                    // 2. Deny-list.
                    if (isDenied(k)) {
                        seenStats.deniedCount++;
                        continue;
                    }

                    // 3. Registry signal.
                    if (isRegistryExcluded(k)) {
                        seenStats.registryExcluded++;
                        continue;
                    }

                    // 4. Special section: overlay (handled separately).
                    if (k === 'heys_products_overlay_v2'
                        || k.endsWith('_heys_products_overlay_v2')) {
                        // Handled below by direct read.
                        continue;
                    }

                    // 5. Special section: days.
                    if (k.indexOf('dayv2_') !== -1) {
                        if (seenStats.daysCount >= DAYS_CAP) {
                            // soft cap — пропускаем лишние, warn в конце.
                            continue;
                        }
                        const normKey = normalizeDayKey(k);
                        if (!normKey) continue;
                        const v = readStoreSafe(k, null);
                        if (v != null) {
                            backup.days[normKey] = v;
                            seenStats.daysCount++;
                        }
                        continue;
                    }

                    // 6. Regular kv. Unscope для нормализации (стабильный формат файла).
                    let normalizedKey = k;
                    const scopedPrefix = 'heys_' + clientId + '_';
                    if (k.startsWith(scopedPrefix)) {
                        normalizedKey = 'heys_' + k.substring(scopedPrefix.length);
                    }

                    const v = readStoreSafe(k, null);
                    if (v == null) continue;
                    backup.kv[normalizedKey] = v;
                    seenStats.kvCount++;
                    if (seenStats.kvCount > KV_CAP) {
                        console.warn('[BACKUP] KV cap exceeded (' + KV_CAP + '); stopping kv collection');
                        break;
                    }
                }

                // ─────────────────────────────────────────
                // Overlay (raw heys_products_overlay_v2 — source of truth).
                // Также читаем scoped вариант, если есть.
                // ─────────────────────────────────────────
                backup.overlayProducts = readStoreSafe('heys_products_overlay_v2', null);
                if (!Array.isArray(backup.overlayProducts) || backup.overlayProducts.length === 0) {
                    // Попробуем scoped (heys_<cid>_products_overlay_v2).
                    const scopedOverlayKey = 'heys_' + clientId + '_products_overlay_v2';
                    const scoped = readStoreSafe(scopedOverlayKey, null);
                    if (Array.isArray(scoped)) backup.overlayProducts = scoped;
                }

                // ─────────────────────────────────────────
                // Shared catalog hash (для compat-hint при import).
                // ─────────────────────────────────────────
                try {
                    const cachedShared = HEYS.cloud?.getCachedSharedProducts?.();
                    if (Array.isArray(cachedShared) && cachedShared.length > 0) {
                        const ids = cachedShared.map(p => String(p && p.id != null ? p.id : '')).filter(Boolean).sort().join('|');
                        backup.sharedCatalogHash = safeFnv1a(ids) + ':' + cachedShared.length;
                    }
                } catch (_) { /* noop */ }

                // ─────────────────────────────────────────
                // Leak-probe: финальная проверка перед сериализацией.
                // ─────────────────────────────────────────
                const leakProbe = JSON.stringify(backup);
                if (/heys_supabase_auth_token|heys_pin_auth_client|heys_session_token|heys_curator_session|heys_pin_cookie_session_hint|heys_curator_cookie_session_hint|"sb-[a-z0-9-]+"/.test(leakProbe)) {
                    console.error('[BACKUP] 🚨 SECURITY: auth-token-like substring detected in backup; aborting.');
                    HEYS.Toast?.error?.('Экспорт отменён: обнаружены auth-токены');
                    return { ok: false, error: 'auth_token_leak_protected' };
                }

                // ─────────────────────────────────────────
                // Stats + compress + download.
                // ─────────────────────────────────────────
                const rawBytes = leakProbe.length;
                if (rawBytes > MAX_RAW_BYTES) {
                    console.warn('[BACKUP] raw size ' + Math.round(rawBytes / 1024) + ' KB exceeds threshold');
                }

                HEYS.Toast?.info?.('Сжимаем бэкап…');
                const { blob, compressed } = await compressIfPossible(leakProbe);

                backup.stats = {
                    overlayRows: Array.isArray(backup.overlayProducts) ? backup.overlayProducts.length : 0,
                    daysCount: seenStats.daysCount,
                    kvKeys: seenStats.kvCount,
                    foreignSkipped: seenStats.foreignCount,
                    deniedSkipped: seenStats.deniedCount,
                    registrySkipped: seenStats.registryExcluded,
                    rawJsonBytes: rawBytes,
                    gzippedBytes: blob.size,
                };

                const ext = compressed ? '.json.gz' : '.json';
                const fileName = `heys-backup-${clientId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}${ext}`;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                const stats = Object.assign({}, backup.stats, {
                    compressed,
                    rawKB: Math.round(rawBytes / 1024),
                    blobKB: Math.round(blob.size / 1024),
                    elapsedMs: Math.round(t1 - t0),
                });
                console.log('[BACKUP] ✅ Exported', fileName, stats);
                HEYS.Toast?.success?.(`✅ Бэкап сохранён (${stats.blobKB} КБ${compressed ? ', gzip' : ''}, ${stats.kvKeys} ключей + ${stats.daysCount} дней + ${stats.overlayRows} продуктов)`);

                return {
                    ok: true,
                    fileName,
                    schemaVersion: SCHEMA_VERSION,
                    products: stats.overlayRows,
                    days: stats.daysCount,
                    kvKeys: stats.kvKeys,
                    stats,
                };
            } catch (err) {
                console.error('[BACKUP] Export failed:', err);
                HEYS.Toast?.error?.('Ошибка экспорта: ' + (err && err.message ? err.message : err))
                    || alert('Ошибка экспорта');
                return { ok: false, error: err && err.message ? err.message : String(err) };
            }
        };
    };

    HEYS.AppBackupExport.init();
})();
