// heys_app_backup_export_v1.js — full-state backup export.
//
// Schema v2 (см. .claude/plans/misty-booping-quilt.md):
//   • Raw overlay (heys_products_overlay_v2) — источник правды для продуктов.
//   • Все dayv2_* без лимита 90 дней (cap 1825).
//   • Все user-state ключи из CLIENT_SPECIFIC_KEYS + heys_milestone_* + heys_last_grams_*.
//   • Auth deny-list (heys_supabase_auth_token, heys_pin_auth_client, sb-*).
//   • gzip через CompressionStream (fallback на raw JSON).
//   • clientId сверяется с auth.

; (function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppBackupExport = HEYS.AppBackupExport || {};

    const SCHEMA_VERSION = 2;
    const DAYS_CAP = 1825; // ~5 лет

    const FORBIDDEN_KEY_NAMES = new Set([
        'heys_supabase_auth_token',
        'heys_pin_auth_client',
    ]);
    function isForbiddenKey(k) {
        if (!k) return false;
        if (FORBIDDEN_KEY_NAMES.has(k)) return true;
        if (k.startsWith('sb-')) return true;
        return false;
    }
    HEYS.AppBackupExport._isForbiddenKey = isForbiddenKey;

    function readStoreSafe(key, fallback) {
        try {
            if (HEYS.store && typeof HEYS.store.get === 'function') {
                const v = HEYS.store.get(key, fallback);
                return v === undefined ? fallback : v;
            }
        } catch (e) {
            console.warn('[BACKUP] store.get failed for', key, e && e.message);
        }
        try {
            const raw = localStorage.getItem(key);
            if (raw == null) return fallback;
            return JSON.parse(raw);
        } catch (e) {
            console.warn('[BACKUP] raw read/parse failed for', key, e && e.message);
            return fallback;
        }
    }

    function readScopedProfileLike(plainKey, clientId) {
        // profile/norms/hrZones имеют scoped вариант heys_${cid}_${tail}.
        // Берём через store.get (даёт scoped+legacy fallback) — но дополнительно
        // явно читаем scoped, потому что store.get для глобального ключа может
        // не покрывать scoped storage.
        const direct = readStoreSafe(plainKey, null);
        if (direct) return direct;
        if (!clientId) return null;
        const scopedKey = 'heys_' + clientId + '_' + plainKey.replace(/^heys_/, '');
        const raw = localStorage.getItem(scopedKey);
        if (!raw) return null;
        try { return JSON.parse(raw); }
        catch (e) {
            console.warn('[BACKUP] scoped parse failed:', scopedKey, e && e.message);
            return null;
        }
    }

    function collectLsKeys(predicate) {
        const out = {};
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || isForbiddenKey(k)) continue;
                if (!predicate(k)) continue;
                const raw = localStorage.getItem(k);
                if (raw == null) continue;
                try {
                    // Используем store.get для декомпрессии если ключ известен.
                    const v = HEYS.store && HEYS.store.get ? HEYS.store.get(k, null) : null;
                    out[k] = v != null ? v : JSON.parse(raw);
                } catch (e) {
                    // Файл хранит сырое значение — лучше так, чем тереть.
                    out[k] = raw;
                }
            }
        } catch (e) {
            console.warn('[BACKUP] collectLsKeys failed', e && e.message);
        }
        return out;
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

            console.log('[BACKUP] Starting full-state export. clientId=' + clientId.slice(0, 8));

            try {
                HEYS.Toast?.info?.('Собираем бэкап…');

                const backup = {
                    schemaVersion: SCHEMA_VERSION,
                    exportedAt: new Date().toISOString(),
                    clientId: clientId,
                    appVersion: window.APP_VERSION || 'unknown',
                };

                // ─────────────────────────────────────────
                // Products: raw overlay (источник правды)
                // ─────────────────────────────────────────
                backup.overlayProducts = readStoreSafe('heys_products_overlay_v2', null);

                // Legacy snapshot (для импорта на старых клиентах без overlay flag).
                // Не источник правды — только fallback для совместимости.
                try {
                    if (HEYS.products && typeof HEYS.products.getAll === 'function') {
                        const merged = HEYS.products.getAll();
                        backup.legacyProductsSnapshot = Array.isArray(merged) ? merged : [];
                    } else {
                        backup.legacyProductsSnapshot = [];
                    }
                } catch (e) {
                    console.warn('[BACKUP] legacyProductsSnapshot failed:', e && e.message);
                    backup.legacyProductsSnapshot = [];
                }

                // Tombstones / hidden / removed
                backup.deletedIds = readStoreSafe('heys_deleted_ids', []);
                backup.removedFromMyList = readStoreSafe('heys_removed_from_my_list', []);
                backup.hiddenProducts = readStoreSafe('heys_hidden_products', []);

                // Граммовки
                backup.gramsHistory = readStoreSafe('heys_grams_history', null);
                backup.lastGramsByProduct = collectLsKeys(k => k.startsWith('heys_last_grams_'));

                // ─────────────────────────────────────────
                // User state (scoped + legacy fallback)
                // ─────────────────────────────────────────
                backup.profile = readScopedProfileLike('heys_profile', clientId);
                backup.norms = readScopedProfileLike('heys_norms', clientId);
                backup.hrZones = readScopedProfileLike('heys_hr_zones', clientId);
                backup.ratioZones = readStoreSafe('heys_ratio_zones', null);

                // ─────────────────────────────────────────
                // Days (все доступные, cap 1825)
                // ─────────────────────────────────────────
                const dayKeys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (!k) continue;
                    if (isForbiddenKey(k)) continue;
                    // Поддерживаем heys_dayv2_YYYY-MM-DD и scoped heys_{cid}_dayv2_YYYY-MM-DD.
                    if (k.indexOf('dayv2_') !== -1 && k.startsWith('heys_')) dayKeys.push(k);
                }
                backup.days = {};
                let daysFound = 0;
                let daysSkipped = 0;
                for (const k of dayKeys) {
                    if (daysFound >= DAYS_CAP) { daysSkipped++; continue; }
                    const v = readStoreSafe(k, null);
                    if (v != null) {
                        // Нормализуем ключ: всегда сохраняем как heys_dayv2_YYYY-MM-DD.
                        // Scoped имеют форму heys_{cid}_dayv2_YYYY-MM-DD; обрезаем prefix.
                        const m = k.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
                        const normKey = m ? 'heys_dayv2_' + m[1] : k;
                        backup.days[normKey] = v;
                        daysFound++;
                    }
                }
                if (daysSkipped > 0) {
                    HEYS.Toast?.warning?.(`Пропущено ${daysSkipped} дней (превышен лимит ${DAYS_CAP}).`);
                }

                // ─────────────────────────────────────────
                // Misc per-client
                // ─────────────────────────────────────────
                backup.water = readStoreSafe('heys_water_history', null);
                backup.scheduledAdvices = readStoreSafe('heys_scheduled_advices', null);
                backup.supplements = readStoreSafe('heys_supplements', null);
                backup.plannedSupplements = readStoreSafe('heys_planned_supplements', null);

                // ─────────────────────────────────────────
                // Gamification
                // ─────────────────────────────────────────
                backup.gamification = {
                    game: readStoreSafe('heys_game', null),
                    bestStreak: readStoreSafe('heys_best_streak', null),
                    weeklyWrapViewCount: readStoreSafe('heys_weekly_wrap_view_count', null),
                    milestones: collectLsKeys(k => k.startsWith('heys_milestone_')),
                };

                // ─────────────────────────────────────────
                // Planning
                // ─────────────────────────────────────────
                backup.planning = {
                    projects: readStoreSafe('heys_planning_projects', null),
                    tasks: readStoreSafe('heys_planning_tasks', null),
                    slots: readStoreSafe('heys_planning_slots', null),
                    links: readStoreSafe('heys_planning_links_v1', null),
                };

                // ─────────────────────────────────────────
                // Advice subsystem
                // ─────────────────────────────────────────
                backup.adviceSettings = readStoreSafe('heys_advice_settings', null);
                backup.adviceReadToday = readStoreSafe('heys_advice_read_today', null);
                backup.adviceHiddenToday = readStoreSafe('heys_advice_hidden_today', null);
                backup.adviceFlags = {
                    firstMealTip: readStoreSafe('heys_first_meal_tip', null),
                    bestDayLastCheck: readStoreSafe('heys_best_day_last_check', null),
                    eveningSnackerCheck: readStoreSafe('heys_evening_snacker_check', null),
                    morningSkipperCheck: readStoreSafe('heys_morning_skipper_check', null),
                    lastVisit: readStoreSafe('heys_last_visit', null),
                };

                // Insights feedback — может быть до 970 KB.
                const insightsFeedback = collectLsKeys(k => /insights_feedback/.test(k));
                const insightsFeedbackSize = JSON.stringify(insightsFeedback).length;
                backup.insightsFeedback = insightsFeedback;
                backup._warnLargeInsights = insightsFeedbackSize > 200 * 1024;

                // ─────────────────────────────────────────
                // Onboarding & tours
                // ─────────────────────────────────────────
                backup.onboardingFlags = {
                    tourCompleted: readStoreSafe('heys_tour_completed', null),
                    insightsTourCompleted: readStoreSafe('heys_insights_tour_completed', null),
                    tourInterruptedStep: readStoreSafe('heys_tour_interrupted_step', null),
                    onboardingComplete: readStoreSafe('heys_onboarding_complete', null),
                };

                backup.morningCheckin = collectLsKeys(k => k.startsWith('heys_morning_checkin'));

                // ─────────────────────────────────────────
                // Shared catalog hash (для проверки совместимости при import)
                // ─────────────────────────────────────────
                try {
                    const cachedShared = HEYS.cloud?.getCachedSharedProducts?.();
                    if (Array.isArray(cachedShared) && cachedShared.length > 0) {
                        const ids = cachedShared.map(p => String(p && p.id != null ? p.id : '')).filter(Boolean).sort().join('|');
                        backup.sharedCatalogHash = safeFnv1a(ids) + ':' + cachedShared.length;
                    } else {
                        backup.sharedCatalogHash = null;
                    }
                } catch (e) {
                    backup.sharedCatalogHash = null;
                }

                // ─────────────────────────────────────────
                // Финальная проверка: нет ли auth-токенов в собранных данных
                // ─────────────────────────────────────────
                const leakProbe = JSON.stringify(backup);
                if (/heys_supabase_auth_token|heys_pin_auth_client|"sb-[a-z0-9-]+"/.test(leakProbe)) {
                    console.error('[BACKUP] 🚨 SECURITY: auth-token-like substring detected in backup; aborting.');
                    HEYS.Toast?.error('Экспорт отменён: обнаружены auth-токены');
                    return { ok: false, error: 'auth_token_leak_protected' };
                }

                // ─────────────────────────────────────────
                // Compress + download
                // ─────────────────────────────────────────
                HEYS.Toast?.info?.('Сжимаем бэкап…');
                const json = JSON.stringify(backup);
                const { blob, compressed } = await compressIfPossible(json);

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
                const stats = {
                    overlayRows: Array.isArray(backup.overlayProducts) ? backup.overlayProducts.length : 0,
                    legacyProducts: backup.legacyProductsSnapshot.length,
                    days: Object.keys(backup.days).length,
                    insightsFeedbackKB: Math.round(insightsFeedbackSize / 1024),
                    rawJsonKB: Math.round(json.length / 1024),
                    blobKB: Math.round(blob.size / 1024),
                    compressed,
                    elapsedMs: Math.round(t1 - t0),
                };
                console.log('[BACKUP] ✅ Exported', fileName, stats);
                HEYS.Toast?.success?.(`✅ Бэкап сохранён (${stats.blobKB} КБ${compressed ? ', gzip' : ''})`);

                return {
                    ok: true,
                    fileName,
                    products: stats.overlayRows || stats.legacyProducts,
                    days: stats.days,
                    sharedProducts: 0,
                    stats,
                };
            } catch (err) {
                console.error('[BACKUP] Export failed:', err);
                HEYS.Toast?.error('Ошибка экспорта: ' + (err && err.message ? err.message : err))
                    || alert('Ошибка экспорта');
                return { ok: false, error: err && err.message ? err.message : String(err) };
            }
        };
    };

    HEYS.AppBackupExport.init();
})();
