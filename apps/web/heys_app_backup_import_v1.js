// heys_app_backup_import_v1.js — full-state backup restore.
//
// Поддерживает:
//   • schemaVersion=2 — full state (overlay + days + profile + ...): новый путь.
//   • schemaVersion=1 или undefined — legacy products-only: совместимость со старыми бэкапами.
//   • .json и .json.gz (через DecompressionStream).
//
// Public API: HEYS.AppBackupImport.importFromFile(file).
// План: .claude/plans/misty-booping-quilt.md (Phase B).

; (function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppBackupImport = HEYS.AppBackupImport || {};

    const MAX_FILE_BYTES = 50 * 1024 * 1024;       // 50 MB raw input
    const MAX_OVERLAY_ROWS = 10000;
    const MAX_DAYS = 1825;
    const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2]);

    function isForbiddenKey(k) {
        return HEYS.AppBackupExport && HEYS.AppBackupExport._isForbiddenKey
            ? HEYS.AppBackupExport._isForbiddenKey(k)
            : (k === 'heys_supabase_auth_token' || k === 'heys_pin_auth_client' || (typeof k === 'string' && k.startsWith('sb-')));
    }

    async function readFileBytes(file) {
        if (file.size > MAX_FILE_BYTES) {
            throw new Error(`Файл слишком большой (${Math.round(file.size / 1024)} КБ, лимит ${Math.round(MAX_FILE_BYTES / 1024)} КБ)`);
        }
        const buf = await file.arrayBuffer();
        const u8 = new Uint8Array(buf);
        // gzip magic: 1f 8b
        const isGzip = u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;
        if (!isGzip) {
            return new TextDecoder('utf-8').decode(u8);
        }
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('Файл сжат gzip, но браузер не поддерживает DecompressionStream');
        }
        const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
        const text = await new Response(ds).text();
        return text;
    }

    function parseSafe(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error('Файл не является валидным JSON: ' + (e && e.message ? e.message : e));
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Pre-validation (RAM-only; ничего не пишет в LS)
    // ─────────────────────────────────────────────────────────────────────
    function validateV2(data) {
        const errors = [];
        const counts = {};

        if (data.schemaVersion !== 2) errors.push('schemaVersion должна быть 2');
        if (!data.clientId || typeof data.clientId !== 'string') errors.push('clientId отсутствует или не строка');

        // overlay
        if (data.overlayProducts != null) {
            if (!Array.isArray(data.overlayProducts)) {
                errors.push('overlayProducts должен быть массивом');
            } else if (data.overlayProducts.length > MAX_OVERLAY_ROWS) {
                errors.push(`overlayProducts слишком много (${data.overlayProducts.length} > ${MAX_OVERLAY_ROWS})`);
            } else {
                for (const r of data.overlayProducts) {
                    if (!r || typeof r !== 'object') { errors.push('overlay: строка не объект'); break; }
                    if (r._custom !== true && r.shared_origin_id == null) {
                        // TypeA должен иметь shared_origin_id; иначе это плохая запись
                        errors.push('overlay: TypeA строка без shared_origin_id (' + (r.name || r.id) + ')');
                        break;
                    }
                }
                counts.overlayTotal = data.overlayProducts.length;
                counts.overlayTypeA = data.overlayProducts.filter(r => r && r._custom !== true).length;
                counts.overlayTypeB = data.overlayProducts.filter(r => r && r._custom === true).length;
            }
        }

        // days
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

        counts.profile = data.profile ? 1 : 0;
        counts.norms = data.norms ? 1 : 0;
        counts.hrZones = data.hrZones ? 1 : 0;
        counts.ratioZones = data.ratioZones ? 1 : 0;
        counts.supplements = data.supplements ? 1 : 0;
        counts.plannedSupplements = Array.isArray(data.plannedSupplements) ? data.plannedSupplements.length : (data.plannedSupplements ? 1 : 0);
        counts.hiddenProducts = Array.isArray(data.hiddenProducts) ? data.hiddenProducts.length : 0;
        counts.deletedIds = Array.isArray(data.deletedIds) ? data.deletedIds.length : 0;
        counts.lastGramsKeys = data.lastGramsByProduct ? Object.keys(data.lastGramsByProduct).length : 0;
        counts.gamification = data.gamification && (data.gamification.game || data.gamification.bestStreak) ? 1 : 0;
        counts.planning = data.planning && (data.planning.projects || data.planning.tasks) ? 1 : 0;
        counts.adviceSettings = data.adviceSettings ? 1 : 0;
        counts.insightsFeedbackKeys = data.insightsFeedback ? Object.keys(data.insightsFeedback).length : 0;

        return { ok: errors.length === 0, errors, counts };
    }

    function buildPreviewMessage(data, validation) {
        const c = validation.counts;
        const lines = [];
        lines.push(`📦 Будет восстановлено из бэкапа от ${new Date(data.exportedAt).toLocaleString('ru-RU')}:`);
        lines.push('');
        if (c.overlayTotal) {
            lines.push(`• Продукты (overlay): ${c.overlayTotal} (TypeA: ${c.overlayTypeA}, custom: ${c.overlayTypeB})`);
        }
        if (c.days) lines.push(`• Дни дневника: ${c.days}`);
        if (c.profile) lines.push(`• Профиль: ✓`);
        if (c.norms) lines.push(`• Нормы: ✓`);
        if (c.hrZones) lines.push(`• HR-зоны: ✓`);
        if (c.ratioZones) lines.push(`• Ratio-зоны: ✓`);
        if (c.supplements || c.plannedSupplements) lines.push(`• Добавки: ${c.plannedSupplements || 0} запланированных`);
        if (c.hiddenProducts) lines.push(`• Скрытые продукты: ${c.hiddenProducts}`);
        if (c.deletedIds) lines.push(`• Tombstones: ${c.deletedIds}`);
        if (c.lastGramsKeys) lines.push(`• История граммовок: ${c.lastGramsKeys}`);
        if (c.gamification) lines.push(`• Gamification (XP, achievements): ✓`);
        if (c.planning) lines.push(`• Planning (проекты/задачи): ✓`);
        if (c.adviceSettings) lines.push(`• Advice settings: ✓`);
        if (c.insightsFeedbackKeys) lines.push(`• Insights feedback: ${c.insightsFeedbackKeys} ключей`);
        lines.push('');
        lines.push('⚠️ Текущие данные будут объединены с бэкапом (overlay-merge не теряет локальные customs).');
        lines.push('Дни и settings будут перезаписаны там, где они есть в бэкапе.');
        return lines.join('\n');
    }

    function dispatchUpdate(eventName, detail) {
        try {
            window.dispatchEvent(new CustomEvent(eventName, { detail: detail || {} }));
        } catch (_) { /* noop */ }
    }

    async function safeSet(key, value, opts) {
        opts = opts || {};
        if (value == null && !opts.allowNull) return false;
        if (isForbiddenKey(key)) return false;
        if (!HEYS.store || typeof HEYS.store.set !== 'function') {
            console.warn('[IMPORT] HEYS.store.set unavailable; skipping', key);
            return false;
        }
        try {
            HEYS.store.set(key, value);
            return true;
        } catch (e) {
            console.warn('[IMPORT] safeSet failed:', key, e && e.message);
            return false;
        }
    }

    async function applyOverlay(rows) {
        if (!Array.isArray(rows)) return { applied: false };
        if (!HEYS.OverlayStore || typeof HEYS.OverlayStore.applyCloudSnapshot !== 'function') {
            // Fallback: пишем напрямую в LS под нужным ключом.
            await safeSet('heys_products_overlay_v2', rows);
            return { applied: true, fallback: true, after: rows.length };
        }
        return HEYS.OverlayStore.applyCloudSnapshot(rows, { source: 'restore-from-file' });
    }

    function notifyProductsContentBump() {
        try {
            if (HEYS.products) {
                HEYS.products.contentVersion = (HEYS.products.contentVersion || 0) + 1;
            }
        } catch (_) { /* noop */ }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Restore v2 (full-state)
    // ─────────────────────────────────────────────────────────────────────
    async function restoreV2(data, validation) {
        const stats = {
            overlayApplied: 0, days: 0, lastGrams: 0,
            scalarKeys: 0, insightsKeys: 0, milestonesKeys: 0,
            errors: [],
        };

        // 1. Profile-family (с dispatch events для React-listener'ов).
        if (data.profile) {
            await safeSet('heys_profile', data.profile);
            dispatchUpdate('heys:profile-updated', { source: 'restore' });
            stats.scalarKeys++;
        }
        if (data.norms) {
            await safeSet('heys_norms', data.norms);
            dispatchUpdate('heys:norms-updated', { source: 'restore' });
            stats.scalarKeys++;
        }
        if (data.hrZones) {
            await safeSet('heys_hr_zones', data.hrZones);
            dispatchUpdate('heys:hr_zones-updated', { source: 'restore' });
            stats.scalarKeys++;
        }
        if (data.ratioZones) {
            await safeSet('heys_ratio_zones', data.ratioZones);
            dispatchUpdate('heys:ratio-zones-updated', { source: 'restore' });
            stats.scalarKeys++;
        }

        // 2. Overlay (единая точка через OverlayStore).
        if (Array.isArray(data.overlayProducts) && data.overlayProducts.length > 0) {
            const r = await applyOverlay(data.overlayProducts);
            stats.overlayApplied = (r && r.after) || data.overlayProducts.length;
        }

        // 3. Tombstones / hidden / removed.
        if (Array.isArray(data.deletedIds))         { await safeSet('heys_deleted_ids', data.deletedIds); stats.scalarKeys++; }
        if (Array.isArray(data.removedFromMyList))  { await safeSet('heys_removed_from_my_list', data.removedFromMyList); stats.scalarKeys++; }
        if (Array.isArray(data.hiddenProducts))     { await safeSet('heys_hidden_products', data.hiddenProducts); stats.scalarKeys++; }

        // 4. Grams history.
        if (data.gramsHistory != null) { await safeSet('heys_grams_history', data.gramsHistory); stats.scalarKeys++; }
        if (data.lastGramsByProduct && typeof data.lastGramsByProduct === 'object') {
            for (const k of Object.keys(data.lastGramsByProduct)) {
                if (!k.startsWith('heys_last_grams_')) continue;
                if (await safeSet(k, data.lastGramsByProduct[k], { allowNull: false })) stats.lastGrams++;
            }
        }

        // 5. Days (нормализованные ключи heys_dayv2_YYYY-MM-DD; Store.set применит scoping автоматически).
        if (data.days && typeof data.days === 'object') {
            const dayKeys = Object.keys(data.days);
            const total = dayKeys.length;
            let done = 0;
            for (const k of dayKeys) {
                const v = data.days[k];
                if (v == null) continue;
                if (await safeSet(k, v)) {
                    stats.days++;
                    done++;
                    if (done % 25 === 0 || done === total) {
                        try { HEYS.Toast?.info?.(`Восстановление дней ${done}/${total}…`); } catch (_) { }
                    }
                }
            }
            // Trigger React subscribers для текущего открытого дня.
            dispatchUpdate('heys:day-updated', { source: 'restore', batch: true });
        }

        // 6. Misc.
        if (data.water != null) { await safeSet('heys_water_history', data.water); stats.scalarKeys++; }
        if (data.scheduledAdvices != null) { await safeSet('heys_scheduled_advices', data.scheduledAdvices); stats.scalarKeys++; }
        if (data.supplements != null) {
            await safeSet('heys_supplements', data.supplements);
            dispatchUpdate('heys:supplements-updated', { source: 'restore' });
            stats.scalarKeys++;
        }
        if (data.plannedSupplements != null) {
            await safeSet('heys_planned_supplements', data.plannedSupplements);
            stats.scalarKeys++;
        }

        // 7. Gamification.
        if (data.gamification && typeof data.gamification === 'object') {
            const g = data.gamification;
            if (g.game != null)                 { await safeSet('heys_game', g.game); stats.scalarKeys++; }
            if (g.bestStreak != null)           { await safeSet('heys_best_streak', g.bestStreak); stats.scalarKeys++; }
            if (g.weeklyWrapViewCount != null)  { await safeSet('heys_weekly_wrap_view_count', g.weeklyWrapViewCount); stats.scalarKeys++; }
            if (g.milestones && typeof g.milestones === 'object') {
                for (const k of Object.keys(g.milestones)) {
                    if (!k.startsWith('heys_milestone_')) continue;
                    if (await safeSet(k, g.milestones[k])) stats.milestonesKeys++;
                }
            }
        }

        // 8. Planning.
        if (data.planning && typeof data.planning === 'object') {
            const p = data.planning;
            if (p.projects != null) { await safeSet('heys_planning_projects', p.projects); stats.scalarKeys++; }
            if (p.tasks != null)    { await safeSet('heys_planning_tasks', p.tasks); stats.scalarKeys++; }
            if (p.slots != null)    { await safeSet('heys_planning_slots', p.slots); stats.scalarKeys++; }
            if (p.links != null)    { await safeSet('heys_planning_links_v1', p.links); stats.scalarKeys++; }
        }

        // 9. Advice.
        if (data.adviceSettings != null) {
            await safeSet('heys_advice_settings', data.adviceSettings);
            dispatchUpdate('heys:advice-settings-updated', { source: 'restore' });
            stats.scalarKeys++;
        }
        if (data.adviceReadToday != null)   { await safeSet('heys_advice_read_today', data.adviceReadToday); stats.scalarKeys++; }
        if (data.adviceHiddenToday != null) { await safeSet('heys_advice_hidden_today', data.adviceHiddenToday); stats.scalarKeys++; }
        if (data.adviceFlags && typeof data.adviceFlags === 'object') {
            const f = data.adviceFlags;
            if (f.firstMealTip != null)         { await safeSet('heys_first_meal_tip', f.firstMealTip); stats.scalarKeys++; }
            if (f.bestDayLastCheck != null)     { await safeSet('heys_best_day_last_check', f.bestDayLastCheck); stats.scalarKeys++; }
            if (f.eveningSnackerCheck != null)  { await safeSet('heys_evening_snacker_check', f.eveningSnackerCheck); stats.scalarKeys++; }
            if (f.morningSkipperCheck != null)  { await safeSet('heys_morning_skipper_check', f.morningSkipperCheck); stats.scalarKeys++; }
            if (f.lastVisit != null)            { await safeSet('heys_last_visit', f.lastVisit); stats.scalarKeys++; }
        }

        // 10. Insights feedback (cloudSync='merge' — пишем сырыми ключами).
        if (data.insightsFeedback && typeof data.insightsFeedback === 'object') {
            for (const k of Object.keys(data.insightsFeedback)) {
                if (!/insights_feedback/.test(k)) continue;
                if (await safeSet(k, data.insightsFeedback[k])) stats.insightsKeys++;
            }
        }

        // 11. Onboarding / morning checkin.
        if (data.onboardingFlags && typeof data.onboardingFlags === 'object') {
            const o = data.onboardingFlags;
            if (o.tourCompleted != null)         { await safeSet('heys_tour_completed', o.tourCompleted); stats.scalarKeys++; }
            if (o.insightsTourCompleted != null) { await safeSet('heys_insights_tour_completed', o.insightsTourCompleted); stats.scalarKeys++; }
            if (o.tourInterruptedStep != null)   { await safeSet('heys_tour_interrupted_step', o.tourInterruptedStep); stats.scalarKeys++; }
            if (o.onboardingComplete != null)    { await safeSet('heys_onboarding_complete', o.onboardingComplete); stats.scalarKeys++; }
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
    // Legacy restore (schemaVersion=1 / undefined): products-only через
    // HEYS.products.setAll, чтобы сохранить совместимость со старыми бэкапами.
    // ─────────────────────────────────────────────────────────────────────
    async function restoreLegacyProducts(data) {
        let incoming = [];
        if (Array.isArray(data)) incoming = data;
        else if (Array.isArray(data && data.products)) incoming = data.products;
        else throw new Error('Файл не содержит массива продуктов');

        // Минимальная валидация name.
        const valid = incoming.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0)
            .map(p => Object.assign({}, p, { name: String(p.name).slice(0, 200) }));
        if (valid.length === 0) throw new Error('Не найдено валидных продуктов в файле');

        // Подтверждение.
        const ok = await (HEYS.ConfirmModal?.confirm?.({
            title: '📤 Импорт продуктов (legacy формат)',
            message: `В файле ${valid.length} продуктов. Старый формат — будет импортирован только список продуктов (профиль/дни/настройки в файле отсутствуют). Продолжить?`,
            confirmText: `Импортировать (${valid.length})`,
            cancelText: 'Отмена',
        }) ?? Promise.resolve(window.confirm(`В файле ${valid.length} продуктов. Импортировать?`)));
        if (!ok) return { ok: false, cancelled: true };

        // Merge через HEYS.products.setAll (use existing API).
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

            // Routing по schemaVersion.
            const ver = data && typeof data === 'object' ? data.schemaVersion : undefined;
            const isV2 = ver === 2;
            const isLegacy = (ver === undefined || ver === 1) || Array.isArray(data);

            if (ver !== undefined && !SUPPORTED_SCHEMA_VERSIONS.has(ver) && ver !== 2) {
                throw new Error(`Неподдерживаемый schemaVersion=${ver}. Обновите приложение.`);
            }

            if (isV2) {
                const validation = validateV2(data);
                if (!validation.ok) {
                    console.error('[IMPORT] validation failed', validation.errors);
                    throw new Error('Файл не прошёл валидацию: ' + validation.errors.slice(0, 3).join('; '));
                }
                // sharedCatalogHash compatibility hint.
                if (data.sharedCatalogHash) {
                    try {
                        const cur = HEYS.cloud?.getCachedSharedProducts?.();
                        if (Array.isArray(cur) && cur.length > 0) {
                            const ids = cur.map(p => String(p && p.id != null ? p.id : '')).filter(Boolean).sort().join('|');
                            // Хеш считается так же как в export, но мы не вызываем _safeFnv1a здесь —
                            // достаточно сравнить хвост ":count" для приблизительной проверки совместимости.
                            const tail = String(data.sharedCatalogHash).split(':').pop();
                            if (tail && Number(tail) > cur.length * 1.5) {
                                HEYS.Toast?.warning?.('⚠️ Бэкап использовал более широкий shared-каталог; TypeA связки могут устареть.');
                            }
                        }
                    } catch (_) { /* noop */ }
                }
                const previewMsg = buildPreviewMessage(data, validation);
                const ok = await (HEYS.ConfirmModal?.confirm?.({
                    title: '📤 Восстановление из бэкапа',
                    message: previewMsg,
                    confirmText: 'Восстановить',
                    cancelText: 'Отмена',
                }) ?? Promise.resolve(window.confirm(previewMsg)));
                if (!ok) {
                    console.log('[IMPORT] cancelled by user');
                    return { ok: false, cancelled: true };
                }
                HEYS.Toast?.info?.('Восстанавливаем…');
                const stats = await restoreV2(data, validation);
                const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                stats.elapsedMs = Math.round(t1 - t0);
                console.log('[IMPORT] ✅ restore v2 complete', stats);
                HEYS.Toast?.success?.(`✅ Восстановлено: ${stats.overlayApplied} продуктов, ${stats.days} дней, ${stats.scalarKeys + stats.lastGrams + stats.milestonesKeys + stats.insightsKeys} ключей`);
                HEYS.analytics?.trackDataOperation?.('backup-restore-v2', stats.overlayApplied);
                return { ok: true, schemaVersion: 2, stats };
            }

            if (isLegacy) {
                const r = await restoreLegacyProducts(data);
                if (r.ok) HEYS.Toast?.success?.(`✅ Импорт (legacy): +${r.added}, ↻${r.updated}`);
                HEYS.analytics?.trackDataOperation?.('backup-restore-legacy', r.total || 0);
                return r;
            }

            throw new Error('Неизвестный формат файла');
        } catch (err) {
            console.error('[IMPORT] failed:', err);
            HEYS.Toast?.error?.('Ошибка восстановления: ' + (err && err.message ? err.message : err))
                || alert('Ошибка восстановления: ' + (err && err.message ? err.message : err));
            HEYS.analytics?.trackError?.(err, { context: 'backup-import' });
            return { ok: false, error: err && err.message ? err.message : String(err) };
        } finally {
            HEYS._restoringBackup = false;
        }
    };
})();
