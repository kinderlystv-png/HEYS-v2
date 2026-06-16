// heys_app_backup_import_v1.js — full-state backup restore.
//
// Schema routing:
//   • v3 — allow-by-default scan: backup.kv{} + overlayProducts + days.
//   • v2 — full state с группировками (gamification, planning, etc.) — legacy.
//   • v1 / undefined / Array — products-only legacy.
//
// Schema v3 защиты:
//   • HOT-sync silence (60 sec) пока идёт restore.
//   • restore-in-progress LS marker для детекции crash на boot.
//   • Cloud queue bypass через cloud.writeLocalKvWithoutMirror — 800 ключей
//     не повесят сеть как при обычном Store.set.
//   • Финальный flush через cloud.flushPendingQueue(30000).
//   • EVENT_DISPATCH_MAP с правильными именами событий из grep'а кода.
//
// План: .claude/plans/misty-booping-quilt.md (Schema v3 — backup-v3).

; (function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppBackupImport = HEYS.AppBackupImport || {};

    const MAX_FILE_BYTES = 50 * 1024 * 1024;
    const MAX_OVERLAY_ROWS = 10000;
    const MAX_DAYS = 1825;
    const MAX_KV_KEYS = 5000;
    const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2, 3]);
    const HOT_SYNC_QUIET_MS = 60000;
    const RESTORE_PROGRESS_LS_KEY = 'heys_restore_in_progress';

    // Полный список из grep'а dispatchEvent('heys:*-updated') и addEventListener в коде.
    // ВНИМАНИЕ: дефис в hr-zones (не подчёркивание), planning-updated диспатчится
    // на ВСЕ planning-ключи одним общим событием, deleted_ids/removed → один общий event.
    const EVENT_DISPATCH_MAP = {
        heys_profile: 'heys:profile-updated',
        heys_norms: 'heys:norms-updated',
        heys_hr_zones: 'heys:hr-zones-updated',
        heys_supplements: 'heys:supplements-updated',
        heys_planning_projects: 'heys:planning-updated',
        heys_planning_tasks: 'heys:planning-updated',
        heys_planning_slots: 'heys:planning-updated',
        heys_planning_links_v1: 'heys:planning-updated',
        heys_planning_inbox_v1: 'heys:planning-updated',
        heys_deleted_ids: 'heys:deleted-products-changed',
        heys_removed_from_my_list: 'heys:deleted-products-changed',
        heys_widget_layout_v1: 'heys:widget-layout-updated',
    };

    function isForbiddenKey(k) {
        return HEYS.AppBackupExport && HEYS.AppBackupExport._isForbiddenKey
            ? HEYS.AppBackupExport._isForbiddenKey(k)
            : (k === 'heys_supabase_auth_token'
                || k === 'heys_pin_auth_client'
                || k === 'heys_session_token'
                || k === 'heys_curator_session'
                || k === 'heys_pin_cookie_session_hint'
                || k === 'heys_curator_cookie_session_hint'
                || (typeof k === 'string' && k.startsWith('sb-')));
    }
    function isDenied(k) {
        return HEYS.AppBackupExport && typeof HEYS.AppBackupExport._isDenied === 'function'
            ? HEYS.AppBackupExport._isDenied(k)
            : isForbiddenKey(k);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Чтение и парсинг файла (.json или .json.gz).
    // ─────────────────────────────────────────────────────────────────────
    async function readFileBytes(file) {
        if (file.size > MAX_FILE_BYTES) {
            throw new Error(`Файл слишком большой (${Math.round(file.size / 1024)} КБ, лимит ${Math.round(MAX_FILE_BYTES / 1024)} КБ)`);
        }
        const buf = await file.arrayBuffer();
        const u8 = new Uint8Array(buf);
        const isGzip = u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;
        if (!isGzip) {
            return new TextDecoder('utf-8').decode(u8);
        }
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('Файл сжат gzip, но браузер не поддерживает DecompressionStream');
        }
        const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(ds).text();
    }

    function parseSafe(text) {
        try { return JSON.parse(text); }
        catch (e) { throw new Error('Файл не является валидным JSON: ' + (e && e.message ? e.message : e)); }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Manual scoping для cloud.writeLocalKvWithoutMirror — он НЕ scope'ит сам.
    // Зеркалит логику scoped() из heys_storage_layer_v1.js.
    // ─────────────────────────────────────────────────────────────────────
    function scopeKey(k, clientId) {
        if (!clientId) return k;
        // Global keys — без scope.
        if (/^heys_(clients|client_current|sound_settings)$/i.test(k)) return k;
        // Уже scoped — не дублируем.
        if (k.indexOf(clientId) !== -1) return k;
        if (k.startsWith('heys_')) {
            return 'heys_' + clientId + '_' + k.substring(5);
        }
        return 'heys_' + clientId + '_' + k;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Validation
    // ─────────────────────────────────────────────────────────────────────
    function validateV3(data) {
        const errors = [];
        const counts = {};

        if (data.schemaVersion !== 3) errors.push('schemaVersion должна быть 3');
        if (!data.clientId || typeof data.clientId !== 'string') errors.push('clientId отсутствует или не строка');

        if (data.overlayProducts != null) {
            if (!Array.isArray(data.overlayProducts)) {
                errors.push('overlayProducts должен быть массивом');
            } else if (data.overlayProducts.length > MAX_OVERLAY_ROWS) {
                errors.push(`overlayProducts слишком много (${data.overlayProducts.length} > ${MAX_OVERLAY_ROWS})`);
            } else {
                for (const r of data.overlayProducts) {
                    if (!r || typeof r !== 'object') { errors.push('overlay: строка не объект'); break; }
                    if (r._custom !== true && r.shared_origin_id == null) {
                        errors.push('overlay: TypeA строка без shared_origin_id (' + (r.name || r.id) + ')');
                        break;
                    }
                }
                counts.overlayTotal = data.overlayProducts.length;
                counts.overlayTypeA = data.overlayProducts.filter(r => r && r._custom !== true).length;
                counts.overlayTypeB = data.overlayProducts.filter(r => r && r._custom === true).length;
            }
        }

        if (data.days != null && typeof data.days !== 'object') errors.push('days должен быть объектом');
        if (data.days && typeof data.days === 'object') {
            const dayKeys = Object.keys(data.days);
            if (dayKeys.length > MAX_DAYS) errors.push(`days слишком много (${dayKeys.length} > ${MAX_DAYS})`);
            counts.days = dayKeys.length;
            for (const k of dayKeys) {
                if (!/^heys_dayv2_\d{4}-\d{2}-\d{2}$/.test(k)) {
                    errors.push('days: некорректный ключ ' + k);
                    break;
                }
            }
        }

        if (data.kv != null && typeof data.kv !== 'object') errors.push('kv должен быть объектом');
        if (data.kv && typeof data.kv === 'object') {
            const kvKeys = Object.keys(data.kv);
            if (kvKeys.length > MAX_KV_KEYS) errors.push(`kv слишком много (${kvKeys.length} > ${MAX_KV_KEYS})`);
            counts.kvKeys = kvKeys.length;
            // Защита от malicious файла: проверяем deny-list на каждый ключ.
            let blockedCount = 0;
            for (const k of kvKeys) {
                if (isDenied(k)) blockedCount++;
            }
            if (blockedCount > 0) {
                console.warn('[IMPORT] ' + blockedCount + ' kv keys are denied (will be filtered)');
                counts.kvBlocked = blockedCount;
            }
        }

        return { ok: errors.length === 0, errors, counts };
    }

    // Legacy validators остаются для v2/v1 без изменений.
    function validateV2(data) {
        const errors = [];
        const counts = {};
        if (data.schemaVersion !== 2) errors.push('schemaVersion должна быть 2');
        if (!data.clientId || typeof data.clientId !== 'string') errors.push('clientId отсутствует');
        if (data.overlayProducts != null) {
            if (!Array.isArray(data.overlayProducts)) errors.push('overlayProducts должен быть массивом');
            else if (data.overlayProducts.length > MAX_OVERLAY_ROWS) errors.push('overlayProducts слишком много');
            else {
                counts.overlayTotal = data.overlayProducts.length;
                counts.overlayTypeA = data.overlayProducts.filter(r => r && r._custom !== true).length;
                counts.overlayTypeB = data.overlayProducts.filter(r => r && r._custom === true).length;
            }
        }
        if (data.days && typeof data.days === 'object') {
            counts.days = Object.keys(data.days).length;
            if (counts.days > MAX_DAYS) errors.push('days слишком много');
        }
        counts.profile = data.profile ? 1 : 0;
        counts.norms = data.norms ? 1 : 0;
        counts.hrZones = data.hrZones ? 1 : 0;
        counts.ratioZones = data.ratioZones ? 1 : 0;
        counts.lastGramsKeys = data.lastGramsByProduct ? Object.keys(data.lastGramsByProduct).length : 0;
        counts.insightsFeedbackKeys = data.insightsFeedback ? Object.keys(data.insightsFeedback).length : 0;
        return { ok: errors.length === 0, errors, counts };
    }

    // ─────────────────────────────────────────────────────────────────────
    // Preview сообщения.
    // ─────────────────────────────────────────────────────────────────────
    function buildPreviewV3(data, validation) {
        const c = validation.counts;
        const lines = [];
        const exported = data.exportedAt ? new Date(data.exportedAt).toLocaleString('ru-RU') : '—';
        lines.push(`📦 Будет восстановлено из бэкапа от ${exported}:`);
        lines.push('');
        if (c.overlayTotal) {
            lines.push(`• Продукты (overlay): ${c.overlayTotal} (TypeA: ${c.overlayTypeA}, custom: ${c.overlayTypeB})`);
        }
        if (c.days) lines.push(`• Дни дневника: ${c.days}`);
        if (c.kvKeys) lines.push(`• Хранилище данных: ${c.kvKeys} ключей`);
        if (c.kvBlocked) lines.push(`  (${c.kvBlocked} опасных ключей будут отфильтрованы)`);
        lines.push('');
        lines.push('⚠️ Текущие данные будут объединены с бэкапом.');
        lines.push('  Overlay merge не теряет локальные customs.');
        lines.push('  Дни и settings заменены там, где есть в бэкапе.');
        return lines.join('\n');
    }

    function buildPreviewV2(data, validation) {
        const c = validation.counts;
        const lines = [];
        lines.push(`📦 Будет восстановлено из бэкапа (формат v2) от ${new Date(data.exportedAt).toLocaleString('ru-RU')}:`);
        lines.push('');
        if (c.overlayTotal) lines.push(`• Продукты (overlay): ${c.overlayTotal}`);
        if (c.days) lines.push(`• Дни дневника: ${c.days}`);
        if (c.profile) lines.push(`• Профиль: ✓`);
        if (c.norms) lines.push(`• Нормы: ✓`);
        if (c.hrZones) lines.push(`• HR-зоны: ✓`);
        if (c.ratioZones) lines.push(`• Ratio-зоны: ✓`);
        if (c.lastGramsKeys) lines.push(`• История граммовок: ${c.lastGramsKeys}`);
        if (c.insightsFeedbackKeys) lines.push(`• Insights feedback: ${c.insightsFeedbackKeys} ключей`);
        lines.push('');
        lines.push('⚠️ Текущие данные будут объединены с бэкапом.');
        return lines.join('\n');
    }

    function dispatchUpdate(eventName, detail) {
        try { window.dispatchEvent(new CustomEvent(eventName, { detail: detail || {} })); }
        catch (_) { /* noop */ }
    }

    function notifyProductsContentBump() {
        try {
            if (HEYS.products) {
                HEYS.products.contentVersion = (HEYS.products.contentVersion || 0) + 1;
            }
        } catch (_) { /* noop */ }
    }

    async function applyOverlay(rows, source) {
        if (!Array.isArray(rows)) return { applied: false };
        if (!HEYS.OverlayStore || typeof HEYS.OverlayStore.applyCloudSnapshot !== 'function') {
            // Fallback: пишем в LS прямо. Scope не нужен (overlay key is global).
            try { HEYS.store?.set?.('heys_products_overlay_v2', rows); } catch (_) {}
            return { applied: true, fallback: true, after: rows.length };
        }
        return HEYS.OverlayStore.applyCloudSnapshot(rows, { source: source || 'restore-from-file' });
    }

    // ─────────────────────────────────────────────────────────────────────
    // Restore v3 — bypass cloud queue, batch flush, защитные механизмы.
    // ─────────────────────────────────────────────────────────────────────
    async function restoreV3(data) {
        const clientId = HEYS.currentClientId || data.clientId;
        const stats = {
            overlayApplied: 0,
            days: 0,
            kvKeys: 0,
            kvSkipped: 0,
            errors: [],
        };

        // ── Pre-restore safety ──────────────────────────────────────────
        // 1. HOT-sync silence: 60s окно. interceptForegroundHotSyncValue() в
        //    heys_storage_supabase_v1.js проверяет cloud._hotSyncQuietUntilMs.
        if (HEYS.cloud) {
            HEYS.cloud._hotSyncQuietUntilMs = Date.now() + HOT_SYNC_QUIET_MS;
            console.log('[IMPORT] HOT-sync silenced for ' + (HOT_SYNC_QUIET_MS / 1000) + 's');
        }

        // 2. Restore-in-progress LS marker (для детекции aborted restore на boot).
        const totalKeys = (data.kv ? Object.keys(data.kv).length : 0)
            + (data.days ? Object.keys(data.days).length : 0)
            + (Array.isArray(data.overlayProducts) && data.overlayProducts.length > 0 ? 1 : 0);
        const startedAt = Date.now();
        let completedKeys = 0;
        try {
            localStorage.setItem(RESTORE_PROGRESS_LS_KEY, JSON.stringify({
                startedAt,
                totalKeys,
                completedKeys: 0,
                schemaVersion: 3,
            }));
        } catch (_) { /* noop */ }

        function updateProgressMarker(done) {
            try {
                localStorage.setItem(RESTORE_PROGRESS_LS_KEY, JSON.stringify({
                    startedAt,
                    totalKeys,
                    completedKeys: done,
                    schemaVersion: 3,
                }));
            } catch (_) { /* noop */ }
        }

        // restoreSet: bypass cloud queue. Scoping вручную.
        // Сжимает большие values через Store.compress — без этого огромные
        // ключи (heys_insights_feedback_default ~970 KB, heys_advice_trace_day_v1
        // ~289 KB) попадут в LS несжатыми и могут не влезть в браузерную квоту
        // или вытеснить другие данные.
        // Возвращает true если запись прошла.
        function restoreSet(k, v) {
            if (v == null) return false;
            if (isDenied(k)) {
                stats.kvSkipped++;
                console.warn('[IMPORT] denied key in backup, skipping:', k);
                return false;
            }
            try {
                if (HEYS.cloud?.writeLocalKvWithoutMirror) {
                    const scoped = scopeKey(k, clientId);
                    // Сжимаем большие values (>4 KB) если есть Store.compress.
                    // Маленькие пропускаем — overhead сжатия больше выгоды.
                    let payload = v;
                    try {
                        const json = typeof v === 'string' ? v : JSON.stringify(v);
                        if (json.length > 4096 && typeof HEYS.store?.compress === 'function') {
                            payload = HEYS.store.compress(json); // returns '¤Z¤...' string
                        } else {
                            // writeLocalKvWithoutMirror сам сделает JSON.stringify
                            payload = v;
                        }
                    } catch (_) { payload = v; /* fallback */ }
                    HEYS.cloud.writeLocalKvWithoutMirror(scoped, payload);
                    return true;
                }
                // Fallback: Store.set (scope сам, но в cloud queue).
                if (HEYS.store?.set) {
                    HEYS.store.set(k, v);
                    return true;
                }
            } catch (e) {
                console.warn('[IMPORT] restoreSet failed:', k, e && e.message);
                stats.errors.push({ key: k, error: String(e && e.message || e) });
            }
            return false;
        }

        // ── 1. Profile-family первыми (с dispatch events) ───────────────
        const PRIORITY_KEYS = ['heys_profile', 'heys_norms', 'heys_hr_zones', 'heys_ratio_zones'];
        if (data.kv && typeof data.kv === 'object') {
            for (const k of PRIORITY_KEYS) {
                if (data.kv[k] == null) continue;
                if (restoreSet(k, data.kv[k])) {
                    stats.kvKeys++;
                    const ev = EVENT_DISPATCH_MAP[k];
                    if (ev) dispatchUpdate(ev, { source: 'restore-v3' });
                    completedKeys++;
                }
            }
        }

        // ── 2. Overlay через applyCloudSnapshot (dedup + tombstones) ───
        if (Array.isArray(data.overlayProducts) && data.overlayProducts.length > 0) {
            try {
                const r = await applyOverlay(data.overlayProducts, 'restore-v3');
                stats.overlayApplied = (r && r.after) || data.overlayProducts.length;
                completedKeys++;
                updateProgressMarker(completedKeys);
                dispatchUpdate('heys:products-updated', { source: 'restore-v3' });
            } catch (e) {
                console.error('[IMPORT] overlay restore failed:', e);
                stats.errors.push({ key: 'overlay', error: String(e && e.message || e) });
            }
        }

        // ── 3. Days batch ───────────────────────────────────────────────
        if (data.days && typeof data.days === 'object') {
            const dayKeys = Object.keys(data.days);
            const total = dayKeys.length;
            let done = 0;
            for (const k of dayKeys) {
                if (restoreSet(k, data.days[k])) {
                    stats.days++;
                    done++;
                    completedKeys++;
                    if (done % 25 === 0 || done === total) {
                        try { HEYS.Toast?.info?.(`Восстановление дней ${done}/${total}…`); } catch (_) { }
                        updateProgressMarker(completedKeys);
                    }
                }
            }
            if (total > 0) dispatchUpdate('heys:day-updated', { source: 'restore-v3', batch: true });
        }

        // ── 4. Все остальные kv ключи ───────────────────────────────────
        if (data.kv && typeof data.kv === 'object') {
            const dispatchedEvents = new Set();
            const kvKeys = Object.keys(data.kv);
            const total = kvKeys.length;
            let done = 0;
            for (const k of kvKeys) {
                if (PRIORITY_KEYS.indexOf(k) !== -1) continue; // already restored
                if (restoreSet(k, data.kv[k])) {
                    stats.kvKeys++;
                    completedKeys++;
                    done++;
                    // Defer event dispatch до конца batch — несколько ключей-членов
                    // одной группы (planning_projects + planning_tasks → planning-updated)
                    // одним событием.
                    const ev = EVENT_DISPATCH_MAP[k];
                    if (ev) dispatchedEvents.add(ev);
                    if (done % 50 === 0 || done === total) {
                        updateProgressMarker(completedKeys);
                    }
                }
            }
            for (const ev of dispatchedEvents) dispatchUpdate(ev, { source: 'restore-v3', batch: true });
        }

        // ── 5. Final flush cloud queue ──────────────────────────────────
        // writeLocalKvWithoutMirror НЕ ставит в очередь, но overlay restore через
        // applyCloudSnapshot может оставить debounced 2s sync. Дожидаемся.
        try {
            if (HEYS.cloud && typeof HEYS.cloud.flushPendingQueue === 'function') {
                HEYS.Toast?.info?.('Синхронизируем с облаком…');
                const flushResult = await HEYS.cloud.flushPendingQueue(30000);
                console.log('[IMPORT] flushPendingQueue result:', flushResult);
            }
        } catch (e) {
            console.warn('[IMPORT] flushPendingQueue failed (non-fatal):', e && e.message);
        }

        // ── 6. Cleanup ──────────────────────────────────────────────────
        try { localStorage.removeItem(RESTORE_PROGRESS_LS_KEY); } catch (_) {}
        // Hot-sync silence — позволяем естественно истечь (Date.now() уже прошёл
        // ~30s выше, осталось ~30s до окончания), либо явно снимаем.
        if (HEYS.cloud) HEYS.cloud._hotSyncQuietUntilMs = 0;

        notifyProductsContentBump();

        return stats;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Restore v2 (full-state legacy с группировками).
    // Сохранён без изменений для backward compat со старыми пользовательскими
    // backup'ами. Минимальный fix: heys:hr-zones-updated с дефисом.
    // ─────────────────────────────────────────────────────────────────────
    async function restoreV2(data) {
        const stats = { overlayApplied: 0, days: 0, lastGrams: 0, scalarKeys: 0, insightsKeys: 0, milestonesKeys: 0, errors: [] };
        async function safeSet(key, value, opts) {
            opts = opts || {};
            if (value == null && !opts.allowNull) return false;
            if (isForbiddenKey(key)) return false;
            if (!HEYS.store || typeof HEYS.store.set !== 'function') return false;
            try { HEYS.store.set(key, value); return true; }
            catch (e) { console.warn('[IMPORT v2] safeSet failed:', key, e && e.message); return false; }
        }

        if (data.profile) { await safeSet('heys_profile', data.profile); dispatchUpdate('heys:profile-updated', { source: 'restore-v2' }); stats.scalarKeys++; }
        if (data.norms) { await safeSet('heys_norms', data.norms); dispatchUpdate('heys:norms-updated', { source: 'restore-v2' }); stats.scalarKeys++; }
        if (data.hrZones) { await safeSet('heys_hr_zones', data.hrZones); dispatchUpdate('heys:hr-zones-updated', { source: 'restore-v2' }); stats.scalarKeys++; }
        if (data.ratioZones) { await safeSet('heys_ratio_zones', data.ratioZones); stats.scalarKeys++; }

        if (Array.isArray(data.overlayProducts) && data.overlayProducts.length > 0) {
            const r = await applyOverlay(data.overlayProducts, 'restore-v2');
            stats.overlayApplied = (r && r.after) || data.overlayProducts.length;
        }

        if (Array.isArray(data.deletedIds)) { await safeSet('heys_deleted_ids', data.deletedIds); stats.scalarKeys++; }
        if (Array.isArray(data.removedFromMyList)) { await safeSet('heys_removed_from_my_list', data.removedFromMyList); stats.scalarKeys++; }
        if (Array.isArray(data.hiddenProducts)) { await safeSet('heys_hidden_products', data.hiddenProducts); stats.scalarKeys++; }
        dispatchUpdate('heys:deleted-products-changed', { source: 'restore-v2' });

        if (data.gramsHistory != null) { await safeSet('heys_grams_history', data.gramsHistory); stats.scalarKeys++; }
        if (data.lastGramsByProduct && typeof data.lastGramsByProduct === 'object') {
            for (const k of Object.keys(data.lastGramsByProduct)) {
                if (!k.startsWith('heys_last_grams_')) continue;
                if (await safeSet(k, data.lastGramsByProduct[k])) stats.lastGrams++;
            }
        }

        if (data.days && typeof data.days === 'object') {
            const dayKeys = Object.keys(data.days);
            const total = dayKeys.length;
            let done = 0;
            for (const k of dayKeys) {
                if (data.days[k] == null) continue;
                if (await safeSet(k, data.days[k])) {
                    stats.days++; done++;
                    if (done % 25 === 0 || done === total) {
                        try { HEYS.Toast?.info?.(`Восстановление дней ${done}/${total}…`); } catch (_) { }
                    }
                }
            }
            dispatchUpdate('heys:day-updated', { source: 'restore-v2', batch: true });
        }

        if (data.water != null) { await safeSet('heys_water_history', data.water); stats.scalarKeys++; }
        if (data.scheduledAdvices != null) { await safeSet('heys_scheduled_advices', data.scheduledAdvices); stats.scalarKeys++; }
        if (data.supplements != null) { await safeSet('heys_supplements', data.supplements); dispatchUpdate('heys:supplements-updated', { source: 'restore-v2' }); stats.scalarKeys++; }
        if (data.plannedSupplements != null) { await safeSet('heys_planned_supplements', data.plannedSupplements); stats.scalarKeys++; }

        if (data.gamification && typeof data.gamification === 'object') {
            const g = data.gamification;
            if (g.game != null) { await safeSet('heys_game', g.game); stats.scalarKeys++; }
            if (g.bestStreak != null) { await safeSet('heys_best_streak', g.bestStreak); stats.scalarKeys++; }
            if (g.weeklyWrapViewCount != null) { await safeSet('heys_weekly_wrap_view_count', g.weeklyWrapViewCount); stats.scalarKeys++; }
            if (g.milestones && typeof g.milestones === 'object') {
                for (const k of Object.keys(g.milestones)) {
                    if (!k.startsWith('heys_milestone_')) continue;
                    if (await safeSet(k, g.milestones[k])) stats.milestonesKeys++;
                }
            }
        }
        if (data.planning && typeof data.planning === 'object') {
            const p = data.planning;
            if (p.projects != null) { await safeSet('heys_planning_projects', p.projects); stats.scalarKeys++; }
            if (p.tasks != null) { await safeSet('heys_planning_tasks', p.tasks); stats.scalarKeys++; }
            if (p.slots != null) { await safeSet('heys_planning_slots', p.slots); stats.scalarKeys++; }
            if (p.links != null) { await safeSet('heys_planning_links_v1', p.links); stats.scalarKeys++; }
            dispatchUpdate('heys:planning-updated', { source: 'restore-v2', batch: true });
        }
        if (data.adviceSettings != null) { await safeSet('heys_advice_settings', data.adviceSettings); stats.scalarKeys++; }
        if (data.adviceReadToday != null) { await safeSet('heys_advice_read_today', data.adviceReadToday); stats.scalarKeys++; }
        if (data.adviceHiddenToday != null) { await safeSet('heys_advice_hidden_today', data.adviceHiddenToday); stats.scalarKeys++; }
        if (data.adviceFlags && typeof data.adviceFlags === 'object') {
            const f = data.adviceFlags;
            if (f.firstMealTip != null) { await safeSet('heys_first_meal_tip', f.firstMealTip); stats.scalarKeys++; }
            if (f.bestDayLastCheck != null) { await safeSet('heys_best_day_last_check', f.bestDayLastCheck); stats.scalarKeys++; }
            if (f.eveningSnackerCheck != null) { await safeSet('heys_evening_snacker_check', f.eveningSnackerCheck); stats.scalarKeys++; }
            if (f.morningSkipperCheck != null) { await safeSet('heys_morning_skipper_check', f.morningSkipperCheck); stats.scalarKeys++; }
            if (f.lastVisit != null) { await safeSet('heys_last_visit', f.lastVisit); stats.scalarKeys++; }
        }
        if (data.insightsFeedback && typeof data.insightsFeedback === 'object') {
            for (const k of Object.keys(data.insightsFeedback)) {
                if (!/insights_feedback/.test(k)) continue;
                if (await safeSet(k, data.insightsFeedback[k])) stats.insightsKeys++;
            }
        }
        if (data.onboardingFlags && typeof data.onboardingFlags === 'object') {
            const o = data.onboardingFlags;
            if (o.tourCompleted != null) { await safeSet('heys_tour_completed', o.tourCompleted); stats.scalarKeys++; }
            if (o.insightsTourCompleted != null) { await safeSet('heys_insights_tour_completed', o.insightsTourCompleted); stats.scalarKeys++; }
            if (o.tourInterruptedStep != null) { await safeSet('heys_tour_interrupted_step', o.tourInterruptedStep); stats.scalarKeys++; }
            if (o.onboardingComplete != null) { await safeSet('heys_onboarding_complete', o.onboardingComplete); stats.scalarKeys++; }
        }
        if (data.morningCheckin && typeof data.morningCheckin === 'object') {
            for (const k of Object.keys(data.morningCheckin)) {
                if (!k.startsWith('heys_morning_checkin')) continue;
                if (await safeSet(k, data.morningCheckin[k])) stats.scalarKeys++;
            }
        }
        notifyProductsContentBump();
        return stats;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Legacy products-only (v1 / array / undefined schemaVersion).
    // ─────────────────────────────────────────────────────────────────────
    async function restoreLegacyProducts(data) {
        let incoming = [];
        if (Array.isArray(data)) incoming = data;
        else if (Array.isArray(data && data.products)) incoming = data.products;
        else throw new Error('Файл не содержит массива продуктов');

        const valid = incoming.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0)
            .map(p => Object.assign({}, p, { name: String(p.name).slice(0, 200) }));
        if (valid.length === 0) throw new Error('Не найдено валидных продуктов в файле');

        const ok = await (HEYS.ConfirmModal?.confirm?.({
            title: '📤 Импорт продуктов (legacy формат)',
            message: `В файле ${valid.length} продуктов. Старый формат — будет импортирован только список продуктов. Продолжить?`,
            confirmText: `Импортировать (${valid.length})`,
            cancelText: 'Отмена',
        }) ?? Promise.resolve(window.confirm(`В файле ${valid.length} продуктов. Импортировать?`)));
        if (!ok) return { ok: false, cancelled: true };

        if (!HEYS.products || typeof HEYS.products.setAll !== 'function' || typeof HEYS.products.getAll !== 'function') {
            throw new Error('HEYS.products API недоступен — нельзя импортировать legacy формат');
        }
        const current = HEYS.products.getAll() || [];
        const norm = (s) => String(s || '').trim().toLowerCase();
        const byName = new Map();
        current.forEach((p, i) => byName.set(norm(p.name), { p, i }));
        const merged = current.slice();
        let added = 0, updated = 0;
        for (const incomingP of valid) {
            const key = norm(incomingP.name);
            const existing = byName.get(key);
            if (existing) {
                merged[existing.i] = Object.assign({}, existing.p, incomingP, { id: existing.p.id });
                updated++;
            } else {
                merged.push(incomingP);
                byName.set(key, { p: incomingP, i: merged.length - 1 });
                added++;
            }
        }
        HEYS.products.setAll(merged, { source: 'restore-from-file-legacy' });
        notifyProductsContentBump();
        return { ok: true, added, updated, total: merged.length };
    }

    // ─────────────────────────────────────────────────────────────────────
    // Public entry
    // ─────────────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────
    // Boot-time aborted-restore detector.
    // Срабатывает один раз на load этого модуля. Если предыдущий restore
    // прервался (crash / refresh / close tab посреди записи) — LS содержит
    // heys_restore_in_progress marker. Показываем пользователю warning toast.
    // Не удаляем marker автоматически — пользователь решает сам (либо повторит
    // restore, либо явно очистит через DevTools).
    // ─────────────────────────────────────────────────────────────────────
    try {
        const raw = localStorage.getItem(RESTORE_PROGRESS_LS_KEY);
        if (raw) {
            const meta = JSON.parse(raw);
            const ageSec = Math.round((Date.now() - (meta.startedAt || 0)) / 1000);
            const done = meta.completedKeys || 0;
            const total = meta.totalKeys || 0;
            console.warn('[BACKUP] Aborted restore detected', {
                startedAt: meta.startedAt ? new Date(meta.startedAt).toISOString() : null,
                completedKeys: done,
                totalKeys: total,
                ageSec,
                schemaVersion: meta.schemaVersion,
            });
            // Defer toast slightly — Toast компонент монтируется в React,
            // на load этого модуля может ещё не быть готов.
            setTimeout(() => {
                try {
                    if (HEYS.Toast && typeof HEYS.Toast.warning === 'function') {
                        HEYS.Toast.warning(
                            `⚠️ Прошлое восстановление прервалось. Записано ${done}/${total} ключей. ` +
                            'Данные могут быть в смешанном состоянии — повторите восстановление.'
                        );
                    }
                } catch (_) { /* noop */ }
            }, 3000);
        }
    } catch (_) { /* noop — non-critical */ }

    HEYS.AppBackupImport.importFromFile = async function importFromFile(file) {
        if (!file) return { ok: false, error: 'no_file' };
        if (HEYS._restoringBackup) {
            HEYS.Toast?.warning?.('Восстановление уже выполняется');
            return { ok: false, error: 'already_restoring' };
        }
        HEYS._restoringBackup = true;
        const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        try {
            HEYS.Toast?.info?.('Читаем файл…');
            const text = await readFileBytes(file);
            const data = parseSafe(text);

            const ver = data && typeof data === 'object' ? data.schemaVersion : undefined;
            if (ver !== undefined && !SUPPORTED_SCHEMA_VERSIONS.has(ver)) {
                throw new Error(`Неподдерживаемый schemaVersion=${ver}. Обновите приложение.`);
            }

            if (ver === 3) {
                const validation = validateV3(data);
                if (!validation.ok) {
                    console.error('[IMPORT] validation v3 failed:', validation.errors);
                    throw new Error('Файл не прошёл валидацию: ' + validation.errors.slice(0, 3).join('; '));
                }
                const previewMsg = buildPreviewV3(data, validation);
                const ok = await (HEYS.ConfirmModal?.confirm?.({
                    title: '📤 Восстановление из бэкапа (v3)',
                    message: previewMsg,
                    confirmText: 'Восстановить',
                    cancelText: 'Отмена',
                }) ?? Promise.resolve(window.confirm(previewMsg)));
                if (!ok) return { ok: false, cancelled: true };

                HEYS.Toast?.info?.('Восстанавливаем…');
                const stats = await restoreV3(data);
                const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                stats.elapsedMs = Math.round(t1 - t0);
                console.log('[IMPORT] ✅ restore v3 complete', stats);
                HEYS.Toast?.success?.(`✅ Восстановлено: ${stats.overlayApplied} продуктов, ${stats.days} дней, ${stats.kvKeys} ключей`);
                HEYS.analytics?.trackDataOperation?.('backup-restore-v3', stats.overlayApplied);
                return { ok: true, schemaVersion: 3, stats };
            }

            if (ver === 2) {
                const validation = validateV2(data);
                if (!validation.ok) {
                    console.error('[IMPORT] validation v2 failed:', validation.errors);
                    throw new Error('Файл не прошёл валидацию: ' + validation.errors.slice(0, 3).join('; '));
                }
                if (data.sharedCatalogHash) {
                    try {
                        const cur = HEYS.cloud?.getCachedSharedProducts?.();
                        if (Array.isArray(cur) && cur.length > 0) {
                            const tail = String(data.sharedCatalogHash).split(':').pop();
                            if (tail && Number(tail) > cur.length * 1.5) {
                                HEYS.Toast?.warning?.('⚠️ Бэкап использовал более широкий shared-каталог; TypeA связки могут устареть.');
                            }
                        }
                    } catch (_) { /* noop */ }
                }
                const previewMsg = buildPreviewV2(data, validation);
                const ok = await (HEYS.ConfirmModal?.confirm?.({
                    title: '📤 Восстановление из бэкапа (v2)',
                    message: previewMsg,
                    confirmText: 'Восстановить',
                    cancelText: 'Отмена',
                }) ?? Promise.resolve(window.confirm(previewMsg)));
                if (!ok) return { ok: false, cancelled: true };

                HEYS.Toast?.info?.('Восстанавливаем (v2)…');
                const stats = await restoreV2(data);
                const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                stats.elapsedMs = Math.round(t1 - t0);
                console.log('[IMPORT] ✅ restore v2 complete', stats);
                HEYS.Toast?.success?.(`✅ Восстановлено: ${stats.overlayApplied} продуктов, ${stats.days} дней, ${stats.scalarKeys + stats.lastGrams + stats.milestonesKeys + stats.insightsKeys} ключей`);
                HEYS.analytics?.trackDataOperation?.('backup-restore-v2', stats.overlayApplied);
                return { ok: true, schemaVersion: 2, stats };
            }

            // Legacy: v1 or undefined or bare Array.
            const r = await restoreLegacyProducts(data);
            if (r.ok) HEYS.Toast?.success?.(`✅ Импорт (legacy): +${r.added}, ↻${r.updated}`);
            HEYS.analytics?.trackDataOperation?.('backup-restore-legacy', r.total || 0);
            return r;
        } catch (err) {
            console.error('[IMPORT] failed:', err);
            HEYS.Toast?.error?.('Ошибка восстановления: ' + (err && err.message ? err.message : err))
                || alert('Ошибка восстановления: ' + (err && err.message ? err.message : err));
            HEYS.analytics?.trackError?.(err, { context: 'backup-import' });
            // Не снимаем restore-in-progress marker — пользователь увидит на reload.
            return { ok: false, error: err && err.message ? err.message : String(err) };
        } finally {
            HEYS._restoringBackup = false;
        }
    };
})();
