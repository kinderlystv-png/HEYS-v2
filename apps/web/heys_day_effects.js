// heys_day_effects.js — DayTab side effects (sync, events)
// Phase 12 of HEYS Day v12 refactoring
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    // Phase B diagnostics: ring buffer of day-update apply/skip decisions, read by
    // the Sync Debug Snapshot (React-vs-LS divergence section). Helps explain why
    // the UI did/didn't accept an LS snapshot (render-desync hunting).
    function recordDayDecision(decision, source, reason) {
        try {
            const b = (global.HEYS._dayDiagBuffers = global.HEYS._dayDiagBuffers || { applyDecisions: [] });
            if (!Array.isArray(b.applyDecisions)) b.applyDecisions = [];
            b.applyDecisions.push({ ts: Date.now(), decision, source: source || '—', reason: reason || '' });
            if (b.applyDecisions.length > 100) b.applyDecisions.shift();
        } catch (_) { /* noop — diagnostics must never break the handler */ }
    }

    // Clock-skew reconcile probe (curator↔PIN incident 2026-06-05): returns true
    // when the remote (LS/cloud) day carries a strictly NEWER per-item edit than
    // the local (React) day for the SAME item id. The day-level updatedAt guard
    // (storageUpdatedAt < prevUpdatedAt) blindly keeps React when this device's
    // wall-clock ran ahead, freezing a genuine cross-device grams/content edit
    // that is newer by item.updatedAt. Edit-only (id present on both sides) to
    // stay conservative — does not trigger on adds/deletes, so it can't resurrect
    // a locally-deleted item or fight the existing count-down rollback guards.
    function hasNewerRemoteItem(localDay, remoteDay) {
        try {
            const localItemTs = new Map();
            ((localDay && localDay.meals) || []).forEach((m) =>
                ((m && m.items) || []).forEach((it) => {
                    if (it && it.id != null) localItemTs.set(String(it.id), Number(it.updatedAt) || 0);
                }));
            const remoteMeals = (remoteDay && remoteDay.meals) || [];
            for (const m of remoteMeals) {
                for (const it of ((m && m.items) || [])) {
                    if (!it || it.id == null) continue;
                    const rTs = Number(it.updatedAt) || 0;
                    if (rTs <= 0) continue;
                    const lTs = localItemTs.get(String(it.id));
                    if (lTs == null) continue; // not in local → add, handled elsewhere
                    if (rTs > lTs) return true; // genuine newer cross-device item edit
                }
            }
            return false;
        } catch (_) { return false; }
    }

    // PERF Foundation 2: in-memory cache для readDayV2 (TTL=200мс, no write-aware).
    // Покрывает повторные reads одного и того же date-key в одном render burst
    // (DayTab + sidebar + sparklines часто читают тот же день за < 16мс окно).
    // TTL короткий чтобы быстро отражать external writes (autosave, sync, cascade).
    // Конфликта с HEYS.store.invalidate ниже НЕТ: invalidate чистит HEYS.store кэш,
    // а наш _readDayV2Cache — независимая Map.
    const _readDayV2Cache = (HEYS.lruCache && typeof HEYS.lruCache.create === 'function')
        ? HEYS.lruCache.create({ name: 'readDayV2', max: 30, ttlMs: 200 })
        : null;

    // v69 FIX: Read from scoped dayv2 key first, fallback to unscoped for legacy
    function readDayV2(dateStr, lsGet) {
        const cid = HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '';

        const cacheKey = cid + '|' + dateStr;
        if (_readDayV2Cache) {
            const cached = _readDayV2Cache.get(cacheKey);
            if (cached) return cached;
        }

        let result;
        if (cid) {
            const scopedKey = 'heys_' + cid + '_dayv2_' + dateStr;
            HEYS?.store?.invalidate?.(scopedKey);
            const v = lsGet(scopedKey, null);
            if (v) {
                result = { key: scopedKey, value: v };
            }
        }
        if (!result) {
            const unscopedKey = 'heys_dayv2_' + dateStr;
            HEYS?.store?.invalidate?.(unscopedKey);
            const v = lsGet(unscopedKey, null);
            result = v ? { key: unscopedKey, value: v } : { key: unscopedKey, value: null };
        }

        if (_readDayV2Cache) _readDayV2Cache.set(cacheKey, result);
        return result;
    }

    function getReact() {
        const React = global.React;
        if (!React) {
            throw new Error('[heys_day_effects] React is required. Ensure React is loaded before heys_day_effects.js');
        }
        return React;
    }

    function useDaySyncEffects(deps) {
        const React = getReact();
        const {
            date,
            setIsHydrated,
            setDay,
            getProfile,
            ensureDay,
            loadMealsForDate,
            lsGet,
            lsSet,
            normalizeTrainings,
            cleanEmptyTrainings,
            prevDateRef,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            isSyncingRef
        } = deps || {};

        const isMeaningfulDayData = (data) => {
            if (!data || typeof data !== 'object') return false;
            const mealsCount = Array.isArray(data.meals) ? data.meals.length : 0;
            const trainingsCount = Array.isArray(data.trainings) ? data.trainings.length : 0;
            if (mealsCount > 0 || trainingsCount > 0) return true;
            if (data.isFastingDay || data.isIncomplete) return true;
            const hasMealLines = typeof HEYS.dayMealsIntegrity?.hasAnyMealLines === 'function'
                && HEYS.dayMealsIntegrity.hasAnyMealLines(data);
            if ((data.savedEatenKcal || 0) > 0 && hasMealLines) return true;
            if ((data.savedDisplayOptimum || 0) > 0 && hasMealLines) return true;
            if ((data.waterMl || 0) > 0) return true;
            if ((data.steps || 0) > 0) return true;
            if ((data.weightMorning || 0) > 0) return true;
            if (data.sleepStart || data.sleepEnd || data.sleepQuality || data.sleepNote) return true;
            if (data.dayScore || data.moodAvg || data.wellbeingAvg || data.stressAvg) return true;
            if (data.moodMorning || data.wellbeingMorning || data.stressMorning) return true;
            if (data.householdMin || (Array.isArray(data.householdActivities) && data.householdActivities.length > 0)) return true;
            if (data.isRefeedDay || data.refeedReason) return true;
            if (data.cycleDay !== null && data.cycleDay !== undefined) return true;
            if (data.deficitPct !== null && data.deficitPct !== undefined && data.deficitPct !== '') return true;
            if ((Array.isArray(data.supplementsPlanned) && data.supplementsPlanned.length > 0) ||
                (Array.isArray(data.supplementsTaken) && data.supplementsTaken.length > 0)) return true;
            return false;
        };

        // Подгружать данные дня из облака при смене даты
        React.useEffect(() => {
            let cancelled = false;

            // 🔴 КРИТИЧНО: Сохранить текущие данные ПЕРЕД сменой даты!
            // Иначе несохранённые изменения потеряются при переходе на другую дату
            const dateActuallyChanged = prevDateRef.current !== date;
            if (dateActuallyChanged && HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
                console.info(`[HEYS] 📅 Смена даты: ${prevDateRef.current} → ${date}, сохраняем предыдущий день...`);
                // Flush данные предыдущего дня синхронно
                // force=true — сохраняем предыдущий день даже если isHydrated=false
                HEYS.Day.requestFlush({ force: true });
            }
            prevDateRef.current = date;

            setIsHydrated(false); // Сброс: данные ещё не загружены для новой даты
            const clientId = global.HEYS?.utils?.getCurrentClientId?.()
                || global.HEYS?.currentClientId
                || (global.HEYS?.store?.get ? global.HEYS.store.get('heys_client_current', '') : '')
                || localStorage.getItem('heys_client_current') || '';
            const cloud = global.HEYS && global.HEYS.cloud;

            // Сбрасываем ref при смене даты
            lastLoadedUpdatedAtRef.current = 0;

            const doLocal = () => {
                if (cancelled) return;
                const profNow = getProfile();
                const dayRead = readDayV2(date, lsGet);
                const key = dayRead.key;
                const v = dayRead.value;
                const hasStoredData = !!(v && typeof v === 'object' && (
                    v.date ||
                    (Array.isArray(v.meals) && v.meals.length > 0) ||
                    (Array.isArray(v.trainings) && v.trainings.length > 0) ||
                    v.updatedAt || v.waterMl || v.steps || v.weightMorning
                ));

                // 🔬 [HEYS.day-trace] 7/8 boot LS read — what came back from localStorage on refresh.
                try {
                    const _meals = (v && Array.isArray(v.meals)) ? v.meals : [];
                    const _totalItems = _meals.reduce((acc, m) => acc + ((m && Array.isArray(m.items)) ? m.items.length : 0), 0);
                    console.info('[HEYS.day-trace] 7/8 boot LS read', {
                        date,
                        key,
                        hasStoredData,
                        mealsCount: _meals.length,
                        totalItems: _totalItems,
                        updatedAt: v && v.updatedAt,
                        sourceId: v && v._sourceId,
                    });
                } catch (_) { /* noop */ }

                if (hasStoredData) {
                    const normalizedDay = v?.date ? v : { ...v, date };
                    // ЗАЩИТА: не перезаписываем более свежие данные
                    // handleDayUpdated может уже загрузить sync данные
                    if (normalizedDay.updatedAt && lastLoadedUpdatedAtRef.current > 0 && normalizedDay.updatedAt < lastLoadedUpdatedAtRef.current) {
                        return;
                    }
                    lastLoadedUpdatedAtRef.current = normalizedDay.updatedAt || Date.now();

                    // Мигрируем оценки тренировок и очищаем пустые (только в памяти, НЕ сохраняем)
                    // Миграция сохранится автоматически при следующем реальном изменении данных
                    const normalizedTrainings = normalizeTrainings(normalizedDay.trainings);
                    const cleanedTrainings = cleanEmptyTrainings(normalizedTrainings);
                    const cleanedDay = {
                        ...normalizedDay,
                        trainings: cleanedTrainings
                    };
                    // 🔧 FIX: если meals пустые, пробуем подхватить legacy-ключи (heys_day_*, meals_*)
                    if (!Array.isArray(cleanedDay.meals) || cleanedDay.meals.length === 0) {
                        const legacyMeals = loadMealsForDate(date) || [];
                        if (legacyMeals.length > 0) {
                            cleanedDay.meals = legacyMeals;
                        }
                    }
                    // 🔒 НЕ сохраняем миграцию сразу — это вызывает DAY SAVE и мерцание UI
                    // Данные сохранятся при следующем изменении (добавление еды, воды и т.д.)
                    const newDay = ensureDay(cleanedDay, profNow);
                    // 🔒 Оптимизация: не вызываем setDay если данные идентичны (предотвращает мерцание)
                    try {
                        if (HEYS.perf && typeof HEYS.perf.markCommitHint === 'function') {
                            HEYS.perf.markCommitHint('date-effect:doLocal', {
                                date,
                                mealsCount: (cleanedDay.meals || []).length,
                                hasStoredData: true
                            });
                        }
                    } catch (_) { /* noop */ }
                    const _commitStored = function() {
                        setDay(prevDay => {
                            const eq = HEYS.dayUtils && typeof HEYS.dayUtils.isSameDayHydratedContent === 'function'
                                ? HEYS.dayUtils.isSameDayHydratedContent(prevDay, newDay)
                                : false;
                            if (eq) return prevDay;
                            return newDay;
                        });
                        setIsHydrated(true);
                    };
                    if (React.startTransition && window.HEYS?.flags?.isEnabled?.('boot_optimized_v1')) {
                        React.startTransition(_commitStored);
                    } else {
                        _commitStored();
                    }
                } else {
                    // create a clean default day for the selected date (don't inherit previous trainings)
                    try {
                        if (HEYS.perf && typeof HEYS.perf.markCommitHint === 'function') {
                            HEYS.perf.markCommitHint('date-effect:doLocal-default', { date });
                        }
                    } catch (_) { /* noop */ }
                    const defaultDay = ensureDay({
                        date: date,
                        meals: (loadMealsForDate(date) || []),
                        trainings: [],
                        // Явно устанавливаем пустые значения для полей сна и оценки
                        sleepStart: '',
                        sleepEnd: '',
                        sleepQuality: '',
                        sleepNote: '',
                        dayScore: '',
                        moodAvg: '',
                        wellbeingAvg: '',
                        stressAvg: '',
                        dayComment: ''
                    }, profNow);
                    const _commitDefault = function() {
                        setDay(defaultDay);
                        setIsHydrated(true);
                    };
                    if (React.startTransition && window.HEYS?.flags?.isEnabled?.('boot_optimized_v1')) {
                        React.startTransition(_commitDefault);
                    } else {
                        _commitDefault();
                    }
                }
            };

            // 🔙 ROLLBACK 2026-05-31: H1 fix откатан (вызывал регрессию — курaтор
            // видел 0 ккал на всех днях т.к. doLocal сразу читал пустой scoped LS
            // до завершения bootstrapClientSync). Возвращена оригинальная логика:
            // doLocal вызывается ТОЛЬКО ПОСЛЕ sync. Известный trade-off: UI lag
            // на смене даты пока sync не завершится. Будет решаться другим путём.
            if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
                if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true) {
                    // 🔒 Блокируем события heys:day-updated во время синхронизации
                    // Это предотвращает множественные setDay() и мерцание UI
                    isSyncingRef.current = true;
                    cloud.bootstrapClientSync(clientId)
                        .then(() => {
                            // После sync localStorage уже обновлён событиями heys:day-updated
                            // Просто загружаем финальные данные (без задержки!)
                            isSyncingRef.current = false;
                            doLocal();
                        })
                        .catch((err) => {
                            // Нет сети или ошибка — загружаем из локального кэша
                            isSyncingRef.current = false;
                            console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                            doLocal();
                        });
                } else {
                    doLocal();
                }
            } else {
                doLocal();
            }

            return () => {
                cancelled = true;
                isSyncingRef.current = false; // Сброс при смене даты или размонтировании
            };
        }, [date]);

        // Слушаем событие обновления данных дня (от Morning Check-in или внешних изменений)
        // НЕ слушаем heysSyncCompleted — это вызывает бесконечный цикл при каждом сохранении
        // 🔧 v3.19.1: Защита от дублирующихся событий fetchDays
        const lastProcessedEventRef = React.useRef({ date: null, source: null, timestamp: 0, fetchKey: '' });
        const dayUpdateLogBufferRef = React.useRef([]);
        const dayUpdateLogTimerRef = React.useRef(null);
        const pendingDayApplyRafRef = React.useRef(null);
        const pendingDayForceReloadRef = React.useRef(false);
        const lastDayApplySourceRef = React.useRef('unknown');
        const lastAppliedSignatureRef = React.useRef('');
        const lastAppliedAtRef = React.useRef(0);

        React.useEffect(() => {
            const flushDayUpdateLog = () => {
                if (!dayUpdateLogBufferRef.current.length) return;
                const batch = dayUpdateLogBufferRef.current.splice(0);
                const bySource = batch.reduce((acc, item) => {
                    acc[item.source] = (acc[item.source] || 0) + 1;
                    return acc;
                }, {});
                const sourcesSummary = Object.entries(bySource)
                    .map(([source, count]) => `${source}:${count}`)
                    .join(', ');
                const dates = [...new Set(batch.map(item => item.updatedDate).filter(Boolean))].slice(0, 6).join(', ');
                console.info('[HEYS.day] 🔄 heys:day-updated (batch)', {
                    count: batch.length,
                    sources: sourcesSummary,
                    dates: dates ? dates + (batch.length > 6 ? '…' : '') : undefined
                });
            };

            const scheduleDayUpdateLog = (payload) => {
                dayUpdateLogBufferRef.current.push(payload);
                if (dayUpdateLogTimerRef.current) return;
                dayUpdateLogTimerRef.current = setTimeout(() => {
                    dayUpdateLogTimerRef.current = null;
                    flushDayUpdateLog();
                }, 250);
            };

            const handleDayUpdated = (e) => {
                const updatedDate = e.detail?.date;
                const source = e.detail?.source || 'unknown';
                const forceReload = e.detail?.forceReload || false;
                const syncTimestampOnly = e.detail?.syncTimestampOnly || false;
                const updatedAt = e.detail?.updatedAt;
                const payloadData = e.detail?.data;

                // 🔬 [HEYS.day-trace] 8/8 day-updated event — fires only when the event
                // actually carries fresh data for the current day (not just a syncTimestamp ping).
                // Without this filter the trace floods on fetchDays bursts (10+ events for 1 day).
                try {
                    const isForCurrent = !updatedDate || updatedDate === date || (e.detail?.batch && Array.isArray(e.detail?.dates) && e.detail.dates.includes(date));
                    const _meals = (payloadData && Array.isArray(payloadData.meals)) ? payloadData.meals : null;
                    const hasMeaningfulPayload = !syncTimestampOnly && _meals != null;
                    if (isForCurrent && hasMeaningfulPayload) {
                        const _totalItems = _meals.reduce((acc, m) => acc + ((m && Array.isArray(m.items)) ? m.items.length : 0), 0);
                        console.info('[HEYS.day-trace] 8/8 day-updated event', {
                            currentDate: date,
                            updatedDate,
                            source,
                            forceReload,
                            blockedRemainingMs: blockCloudUpdatesUntilRef ? Math.max(0, blockCloudUpdatesUntilRef.current - Date.now()) : null,
                            eventMealsCount: _meals.length,
                            eventTotalItems: _totalItems,
                            eventUpdatedAt: payloadData && payloadData.updatedAt,
                            lastLoadedUpdatedAtRef: lastLoadedUpdatedAtRef.current,
                        });
                    }
                } catch (_) { /* noop */ }

                try {
                    if (HEYS.perf && typeof HEYS.perf.markCommitHint === 'function') {
                        HEYS.perf.markCommitHint('day-updated:recv', {
                            source: e.detail?.source || 'unknown',
                            updatedDate: e.detail?.date,
                            batch: !!e.detail?.batch,
                            forceReload: !!e.detail?.forceReload
                        });
                    }
                } catch (_) { /* noop */ }

                // PERF (2026-05-26): симметричный skip для :recv stage (см. парный fix в
                // heys_day_effects.js). Замер ?reactProfiler=1 показал :recv = 83.6ms
                // как отдельный source после :raf-apply fix. Kill switch shared.
                try {
                    const _eventUpdatedAt = (payloadData && payloadData.updatedAt) || e.detail?.updatedAt || 0;
                    if (!forceReload && _eventUpdatedAt > 0 && _eventUpdatedAt === lastLoadedUpdatedAtRef.current
                        && window.localStorage.getItem('heys_skip_noop_apply') !== '0') {
                        console.info('[HEYS.day] ⚡ Skip recv (no-op event, same updatedAt)', {
                            source,
                            eventUpdatedAt: _eventUpdatedAt
                        });
                        return;
                    }
                } catch (_) { /* localStorage недоступен — продолжаем */ }

                // v25.8.6.1: Handle timestamp-only sync (prevent fetchDays overwrite)
                if (syncTimestampOnly && updatedAt) {
                    const newTimestamp = Math.max(lastLoadedUpdatedAtRef.current || 0, updatedAt);
                    lastLoadedUpdatedAtRef.current = newTimestamp;
                    console.info(`[HEYS.day] ⏱️ Timestamp ref synced: ${newTimestamp} (source: ${source})`);
                    return; // Don't reload day, just updated timestamp ref
                }

                scheduleDayUpdateLog({
                    source,
                    updatedDate,
                    forceReload,
                    blockUntil: blockCloudUpdatesUntilRef.current
                });

                // 🔧 v3.19.1: Дедуп fetchDays — batch first date менялся между вызовами; ключ по полному списку дат.
                const now = Date.now();
                const last = lastProcessedEventRef.current;
                const fetchDaysKey = (source === 'fetchDays' && e.detail?.batch && Array.isArray(e.detail?.dates))
                    ? [...new Set(e.detail.dates.filter(Boolean).map(String))].sort().join(',')
                    : String(updatedDate || '');
                if (source === 'fetchDays' &&
                    last.source === source &&
                    last.fetchKey === fetchDaysKey &&
                    now - last.timestamp < 450) {
                    return; // Пропускаем дубликат / coalesced повтор
                }
                lastProcessedEventRef.current = { date: updatedDate, source, timestamp: now, fetchKey: fetchDaysKey };

                // 🔒 Игнорируем события во время начальной синхронизации
                // doLocal() в конце синхронизации загрузит все финальные данные
                if (isSyncingRef.current && (source === 'cloud' || source === 'merge')) {
                    return;
                }

                // 🔧 v4.9.0: Определяем внешние источники (cloud sync)
                // foreground-hot-sync тоже внешний — должен блокироваться blockCloudUpdatesUntilRef
                // иначе hot-sync → setDay → autosave → upload → hot-sync loop
                // 2026-06-03: server-merge добавлен — это ответ сервера на upload (round-trip),
                // тоже внешний; без него server-merge re-apply минул 3-сек окно и замыкал echo-петлю.
                const externalSources = ['cloud', 'cloud-sync', 'merge', 'fetchDays', 'foreground-hot-sync', 'server-merge'];
                const isExternalSource = externalSources.includes(source);

                // 🔒 Блокируем ЛЮБЫЕ внешние обновления (включая forceReload)
                // на 3 секунды после локального изменения.
                // Clock-skew defense (curator↔PIN incident 2026-06-05): the block is
                // armed as `<editUpdatedAt> + 3000` / restored via setBlockCloudUpdates,
                // so a future-skewed timestamp (clock-ahead device, or a stale saved
                // value restored on modal open) can push blockUntil minutes ahead and
                // FREEZE all incoming sync. The longest legitimate arm is
                // markUndoWindow(~5000); anything beyond MAX_LEGIT_BLOCK_MS is skew/stale,
                // not a real in-flight edit — clear it instead of freezing the curator.
                const blockRemainingMs = blockCloudUpdatesUntilRef.current - Date.now();
                const MAX_LEGIT_BLOCK_MS = 15000;
                if (isExternalSource && blockRemainingMs > MAX_LEGIT_BLOCK_MS) {
                    recordDayDecision('BLOCK_WINDOW_SKEW_CLEARED', source, 'remaining ' + blockRemainingMs + 'ms > ' + MAX_LEGIT_BLOCK_MS + 'ms cap — skew/stale, clearing');
                    console.warn('[HEYS.day] 🧹 Block-window too far in future (skew/stale) — clearing, not freezing sync', {
                        source,
                        remainingMs: blockRemainingMs
                    });
                    blockCloudUpdatesUntilRef.current = Date.now();
                } else if (isExternalSource && blockRemainingMs > 0) {
                    recordDayDecision('BLOCKED_BLOCK_WINDOW', source, 'remaining ' + blockRemainingMs + 'ms, forceReload=' + !!forceReload);
                    console.info('[HEYS.day] 🔒 External update blocked', {
                        source,
                        forceReload,
                        hasPayload: !!payloadData,
                        remainingMs: blockRemainingMs
                    });
                    return;
                }

                // v25.8.6.5: Если событие пришло с полным payload дня — применяем его напрямую.
                // Это обходит риск чтения устаревшего localStorage во время/после fetchDays.
                if (payloadData && (!updatedDate || updatedDate === date)) {
                    const profNow = getProfile();
                    const normalizedPayload = ensureDay(payloadData?.date ? payloadData : { ...payloadData, date }, profNow);
                    const payloadUpdatedAt = normalizedPayload.updatedAt || updatedAt || Date.now();
                    const payloadMealsCount = (normalizedPayload.meals || []).length;

                    try {
                        if (HEYS.perf && typeof HEYS.perf.markCommitHint === 'function') {
                            HEYS.perf.markCommitHint('day-updated:payload', {
                                source,
                                date: normalizedPayload?.date || date,
                                mealsCount: payloadMealsCount
                            });
                        }
                    } catch (_) { /* noop */ }

                    React.startTransition(() => {
                    setDay(prevDay => {
                        const prevUpdatedAt = prevDay?.updatedAt || 0;
                        const prevMealsCount = (prevDay?.meals || []).length;
                        const prevItemsCount = (prevDay?.meals || []).reduce((s, m) => s + (Array.isArray(m?.items) ? m.items.length : 0), 0);
                        const payloadItemsCount = (normalizedPayload.meals || []).reduce((s, m) => s + (Array.isArray(m?.items) ? m.items.length : 0), 0);

                        // Защита от отката: принимаем payload, если он не старее
                        // или если в нём больше приемов пищи (локальный прогресс).
                        if (!forceReload && payloadUpdatedAt < prevUpdatedAt && payloadMealsCount <= prevMealsCount) {
                            console.info('[HEYS.day] ⏭️ Payload skipped (older than current)', {
                                source,
                                payloadUpdatedAt,
                                prevUpdatedAt,
                                payloadMealsCount,
                                prevMealsCount
                            });
                            return prevDay;
                        }
                        if (isExternalSource && payloadUpdatedAt <= prevUpdatedAt && payloadItemsCount < prevItemsCount) {
                            console.warn('[HEYS.day] 🛡️ Payload skipped (external items rollback)', {
                                source,
                                payloadUpdatedAt,
                                prevUpdatedAt,
                                payloadMealsCount,
                                prevMealsCount,
                                payloadItemsCount,
                                prevItemsCount,
                                forceReload
                            });
                            return prevDay;
                        }

                        console.info('[HEYS.day] 📦 Applied day-updated payload', {
                            source,
                            payloadUpdatedAt,
                            payloadMealsCount,
                            payloadItemsCount,
                            forceReload
                        });
                        // MA persist/sync часто идёт сразу после добавления продукта: getFreshDayData может
                        // отстать от React на один item. forceReload обходит старый guard — не откатываем meals.
                        const maPayloadSources = (
                            source === 'morning-activation-followup' ||
                            source === 'morning-activation-sync' ||
                            source === 'morning-activation'
                        );
                        let nextDay = normalizedPayload;
                        // MA не редактирует приёмы: при **строго** большем числе строк в React — подменяем meals
                        // (payload отстал от LS). При **равенстве** оставляем payload: prevDay в этом кадре часто ещё
                        // без только что добавленной строки продукта — иначе теряем item.
                        if (maPayloadSources && prevDay && Array.isArray(prevDay.meals) && prevItemsCount > payloadItemsCount) {
                            console.info('[HEYS.day] 🛡️ MA payload: retain prev meals (React > payload lines)', {
                                source,
                                prevItemsCount,
                                payloadItemsCount
                            });
                            nextDay = { ...normalizedPayload, meals: prevDay.meals };
                        }
                        return nextDay;
                    });
                    });

                    lastLoadedUpdatedAtRef.current = Math.max(lastLoadedUpdatedAtRef.current || 0, payloadUpdatedAt);
                    return;
                }

                // Для внутренних источников (step-modal, training-step, morning-checkin)
                // forceReload обходит блокировку как раньше
                if (!isExternalSource && !forceReload && Date.now() < blockCloudUpdatesUntilRef.current) {
                    console.info('[HEYS.day] 🔒 Internal update blocked (no forceReload)');
                    return;
                }

                // Если date не указан, совпадает с текущим, или текущий есть в batch.dates — перезагружаем
                const isBatchForCurrentDate = e.detail?.batch && Array.isArray(e.detail?.dates) && e.detail.dates.includes(date);
                const matchesCurrent = !updatedDate || updatedDate === date || isBatchForCurrentDate;
                // ROOT of "PIN edits don't show on the curator while the tab is active"
                // (2026-06-05): the recurring fetchDays batch sometimes omits the viewed
                // date (batch[06-01..06-04] while the user is on 06-05), and a hot-sync
                // dayv2 write only dispatches a matching day-updated when it actually
                // wrote (skips on currentRaw===serialized / stale-guard). So the viewed
                // day's LS can advance with NO event that targets it → the screen froze
                // on stale grams. On ANY day-updated signal, also check whether the
                // CURRENT day's LS is newer than what React loaded, and refresh if so.
                // The apply guards below dedup true no-ops, so this can't cause churn.
                let currentDayLsNewer = false;
                if (!matchesCurrent) {
                    try {
                        if (_readDayV2Cache) _readDayV2Cache.invalidate((HEYS.currentClientId || '') + '|' + date);
                        const __lsDayVal = readDayV2(date, lsGet).value;
                        const __lsTs = (__lsDayVal && __lsDayVal.updatedAt) || 0;
                        currentDayLsNewer = __lsTs > (lastLoadedUpdatedAtRef.current || 0);
                    } catch (_) { /* noop */ }
                    if (!currentDayLsNewer) {
                        recordDayDecision('NOT_FOR_CURRENT', source, 'evt ' + (updatedDate || '∅') + ' vs tab ' + date
                            + (e.detail?.batch ? ' batch[' + ((e.detail?.dates || []).join(',')) + ']' : '') + ', LS not newer');
                    } else {
                        recordDayDecision('CURRENT_DAY_LS_NEWER', source, 'evt for other date, but ' + date + ' LS advanced — refreshing');
                    }
                }
                if (matchesCurrent || currentDayLsNewer) {
                    lastDayApplySourceRef.current = source;
                    pendingDayForceReloadRef.current = pendingDayForceReloadRef.current || !!forceReload;
                    if (pendingDayApplyRafRef.current != null) {
                        recordDayDecision('SKIP_RAF_PENDING', source, 'apply already queued (RAF not yet fired — bg-tab throttle?)');
                        return;
                    }
                    // iOS Safari fully pauses requestAnimationFrame while the tab/PWA is
                    // backgrounded or on another in-app view; a rAF queued then never
                    // fires, so pendingDayApplyRafRef stays non-null forever and every
                    // later day update is dropped at the guard above until a manual refresh
                    // (curator PIN→screen freeze, 2026-06-05: SKIP_RAF_PENDING for 354s).
                    // Schedule via rAF AND a setTimeout fallback — setTimeout still fires
                    // (throttled) in the background, so the apply always makes progress;
                    // whichever fires first runs once and cancels the other.
                    const runDayApply = () => {
                        if (pendingDayApplyRafRef.current == null) return; // already ran via the other scheduler
                        const __sched = pendingDayApplyRafRef.current;
                        pendingDayApplyRafRef.current = null;
                        try { if (__sched && __sched.raf != null) cancelAnimationFrame(__sched.raf); } catch (_) { /* noop */ }
                        try { if (__sched && __sched.timer != null) clearTimeout(__sched.timer); } catch (_) { /* noop */ }
                        const pendingSource = lastDayApplySourceRef.current;
                        const pendingForceReload = pendingDayForceReloadRef.current;
                        const applySignature = [String(date || ''), String(pendingSource || ''), pendingForceReload ? '1' : '0'].join('|');
                        const nowApply = Date.now();
                        const sigCooldownMs = (pendingSource === 'fetchDays' && pendingForceReload) ? 720 : 220;
                        if (lastAppliedSignatureRef.current === applySignature && (nowApply - lastAppliedAtRef.current) < sigCooldownMs) {
                            recordDayDecision('SKIP_SIG_COOLDOWN', pendingSource, applySignature + ' within ' + sigCooldownMs + 'ms');
                            pendingDayForceReloadRef.current = false;
                            return;
                        }
                        try {
                            if (HEYS.perf && typeof HEYS.perf.markCommitHint === 'function') {
                                HEYS.perf.markCommitHint('day-updated:raf-apply', {
                                    source: pendingSource,
                                    date,
                                    forceReload: pendingForceReload
                                });
                            }
                        } catch (_) { /* noop */ }
                        React.startTransition(() => {
                            const forceReload = pendingDayForceReloadRef.current;
                            pendingDayForceReloadRef.current = false;
                            const source = lastDayApplySourceRef.current;

                            const profNow = getProfile();
                            // Invalidate LRU cache before reading: hot-sync may have written fresh
                            // data to LS within the 200ms TTL window, so the cached entry could be
                            // stale (root cause of STALE-WRITER echo-loop 2026-06-02).
                            if (_readDayV2Cache) {
                                _readDayV2Cache.invalidate((HEYS.currentClientId || '') + '|' + date);
                            }
                            const dayRead = readDayV2(date, lsGet);
                    const key = dayRead.key;
                    const v = dayRead.value;
                    const hasStoredData = !!(v && typeof v === 'object' && (
                        v.date ||
                        (Array.isArray(v.meals) && v.meals.length > 0) ||
                        (Array.isArray(v.trainings) && v.trainings.length > 0) ||
                        v.updatedAt || v.waterMl || v.steps || v.weightMorning
                    ));
                    if (hasStoredData) {
                        const normalizedDay = v?.date ? v : { ...v, date };
                        const storageMeaningful = isMeaningfulDayData(normalizedDay);
                        // Проверяем: данные из storage новее текущих?
                        const storageUpdatedAt = normalizedDay.updatedAt || 0;
                        const currentUpdatedAt = lastLoadedUpdatedAtRef.current || 0;

                        const storageMealsCount = (normalizedDay.meals || []).length;
                        const storageItemsCount = (normalizedDay.meals || []).reduce((s, m) => s + (m?.items?.length || 0), 0);
                        console.info('[HEYS.day] 📥 storage snapshot', {
                            source,
                            storageUpdatedAt,
                            currentUpdatedAt,
                            storageMealsCount,
                            storageItemsCount,
                            forceReload
                        });

                        // Двойная защита: по timestamp И по количеству meals
                        // Не откатываем если в storage меньше meals чем в текущем state
                        const isStaleStorage = storageUpdatedAt < currentUpdatedAt;

                        // Пропускаем проверку timestamp если forceReload
                        // ВАЖНО: используем < вместо <= чтобы обрабатывать первую загрузку (когда оба = 0)
                        if (!forceReload && isStaleStorage) {
                            recordDayDecision('SKIP_STALE_STORAGE', source, 'LS ' + storageUpdatedAt + ' < lastLoaded ' + currentUpdatedAt);
                            console.info('[HEYS.day] ⏭️ Day update skipped (stale storage)', {
                                source,
                                updatedDate,
                                storageUpdatedAt,
                                currentUpdatedAt
                            });
                            return; // Не перезаписываем более новые данные старыми
                        }
                        // PERF (2026-05-26): skip heavy normalize/JSON work for no-op apply.
                        // См. парный fix в heys_day_effects.js (same line area).
                        // Замер ?reactProfiler=1 показал day-updated:raf-apply: 6 hits / avg 106ms / max 171ms.
                        // Kill switch: localStorage.setItem('heys_skip_noop_apply', '0').
                        try {
                            if (!forceReload && storageUpdatedAt > 0 && storageUpdatedAt === currentUpdatedAt
                                && window.localStorage.getItem('heys_skip_noop_apply') !== '0') {
                                // Same updatedAt does NOT guarantee same content: a server-merge /
                                // pollOnce / live-refresh can rewrite the day's items while keeping
                                // the max updatedAt. Skipping blindly left the React UI stale vs LS
                                // (render-desync, incident 2026-06-05 curator↔PIN). Only skip a TRUE
                                // no-op — compare content against the current React day. Pending-edit /
                                // block-window protection already ran above (external-source guard ~:417),
                                // so applying changed content here can't clobber a live local edit.
                                let sameContent = false;
                                try {
                                    const reactDay = (HEYS.Day && typeof HEYS.Day.getDay === 'function') ? HEYS.Day.getDay() : null;
                                    sameContent = !!reactDay
                                        && HEYS.dayUtils && typeof HEYS.dayUtils.isSameDayHydratedContent === 'function'
                                        && HEYS.dayUtils.isSameDayHydratedContent(reactDay, normalizedDay);
                                } catch (_) { sameContent = false; }
                                if (sameContent) {
                                    recordDayDecision('SKIP_SAME_CONTENT', source, 'identical updatedAt+content');
                                    console.info('[HEYS.day] ⚡ Skip apply (true no-op: same updatedAt + same content)', {
                                        source,
                                        storageUpdatedAt,
                                        mealsCount: storageMealsCount
                                    });
                                    return;
                                }
                                recordDayDecision('APPLY_SAME_TS_DIFF_CONTENT', source, 'render-desync fix');
                                console.info('[HEYS.day] 🔄 Same updatedAt, content differs — applying LS (render-desync fix)', {
                                    source,
                                    storageUpdatedAt
                                });
                                // fall through → normalize + setDay applies the changed content
                            }
                        } catch (_) { /* localStorage недоступен — продолжаем без skip */ }
                        const migratedTrainings = normalizeTrainings(normalizedDay.trainings);
                        const cleanedTrainings = cleanEmptyTrainings(migratedTrainings);
                        const migratedDay = { ...normalizedDay, trainings: cleanedTrainings };
                        // 🔧 FIX: если meals пустые, пробуем подхватить legacy-ключи (heys_day_*, meals_*)
                        if (!Array.isArray(migratedDay.meals) || migratedDay.meals.length === 0) {
                            const legacyMeals = loadMealsForDate(date) || [];
                            if (legacyMeals.length > 0) {
                                migratedDay.meals = legacyMeals;
                            }
                        }
                        // Сохраняем миграцию ТОЛЬКО если данные изменились
                        const trainingsChanged = JSON.stringify(normalizedDay.trainings) !== JSON.stringify(cleanedTrainings);
                        if (trainingsChanged) {
                            lsSet(key, migratedDay);
                        }
                        const newDay = ensureDay(migratedDay, profNow);

                        // 🔒 Оптимизация: не вызываем setDay если контент идентичен (предотвращает мерцание)
                        setDay(prevDay => {
                            if (!storageMeaningful && isMeaningfulDayData(prevDay)) {
                                return prevDay;
                            }
                            // React может быть новее LS (debounced autosave): ref ещё не поднят, тогда
                            // внешний heys:day-updated с «тем же» storageUpdatedAt откатывает UI (дневник силы).
                            const prevUpdatedAt = prevDay?.updatedAt || 0;
                            // Не откатывать по LS даже при forceReload: hot-sync может шлют forceReload
                            // со снимком до autosave и стирать дневник конструктора.
                            if (storageUpdatedAt < prevUpdatedAt) {
                                // Clock-skew rescue: the day-level stamp on THIS device ran ahead of
                                // the other device's edit, so by day.updatedAt the LS day looks
                                // "older" — but it may carry a strictly NEWER per-item edit (curator↔
                                // PIN incident 2026-06-05: React froze on Сироп 111@old while LS had
                                // 777@newer item ts). Reconcile by item.updatedAt instead of blindly
                                // keeping React. Block-window (~:417) already dropped any in-flight
                                // local edit, so this cannot revert a live grams change; the existing
                                // SKIP path stays for the no-newer-item case (workout builder / true
                                // stale snapshot).
                                const mergeApi = (HEYS.sync && typeof HEYS.sync.mergeDayData === 'function') ? HEYS.sync : null;
                                if (mergeApi && hasNewerRemoteItem(prevDay, normalizedDay)) {
                                    const reconciled = mergeApi.mergeDayData(prevDay, normalizedDay);
                                    if (reconciled && Array.isArray(reconciled.meals)) {
                                        recordDayDecision('APPLY_ITEM_MERGE_SKEW', source, 'LS ' + storageUpdatedAt + ' < React ' + prevUpdatedAt + ', newer item reconciled');
                                        console.info('[HEYS.day] 🔀 Clock-skew reconcile (LS day older but newer item) — merging by item.updatedAt', {
                                            source,
                                            storageUpdatedAt,
                                            prevUpdatedAt
                                        });
                                        lastLoadedUpdatedAtRef.current = Math.max(lastLoadedUpdatedAtRef.current || 0, reconciled.updatedAt || 0);
                                        return ensureDay(reconciled, profNow);
                                    }
                                }
                                recordDayDecision('SKIP_LS_OLDER_THAN_REACT', source, 'LS ' + storageUpdatedAt + ' < React ' + prevUpdatedAt);
                                console.info('[HEYS.day] ⏭️ Skip storage overlay (LS older than React; unpersisted edit)', {
                                    source,
                                    storageUpdatedAt,
                                    prevUpdatedAt
                                });
                                return prevDay;
                            }
                            // Равный updatedAt: overlay из LS может потерять workoutLog при том же timestamp.
                            // Нельзя считать «есть конструктор» только по strengthEntryMode — шаблон 1×пустая строка
                            // тоже workout_builder; hot-sync тогда не блокируется и затирает заполненный дневник.
                            var __dayHasStrengthBuilder = function (day) {
                                try {
                                    var dhwb = HEYS && HEYS.dayCalculations && typeof HEYS.dayCalculations.dayHasTrackableWorkoutBuilder === 'function'
                                        ? HEYS.dayCalculations.dayHasTrackableWorkoutBuilder
                                        : null;
                                    if (dhwb && dhwb(day)) return true;
                                } catch (eDhwb) { /* noop */ }
                                var tr = day && day.trainings;
                                if (!Array.isArray(tr)) return false;
                                for (var i2 = 0; i2 < tr.length; i2++) {
                                    var t2 = tr[i2];
                                    if (!t2 || String(t2.type) !== 'strength') continue;
                                    if (t2.strengthEntryMode === 'workout_builder') continue;
                                    var wl2 = t2.workoutLog;
                                    if (wl2 && Array.isArray(wl2.exercises) && wl2.exercises.length > 0) return true;
                                }
                                return false;
                            };
                            if (__dayHasStrengthBuilder(prevDay) && !__dayHasStrengthBuilder(newDay)) {
                                return prevDay;
                            }
                            /** Сумма длин workoutLog.exercises по слотам workout_builder (для анти-отката hot-sync). */
                            var __sumWbExerciseLengths = function (day) {
                                var tr = day && day.trainings;
                                if (!Array.isArray(tr)) return 0;
                                var s = 0;
                                for (var iw = 0; iw < tr.length; iw++) {
                                    var tw = tr[iw];
                                    if (!tw || String(tw.type) !== 'strength' || tw.strengthEntryMode !== 'workout_builder') continue;
                                    var wlw = tw.workoutLog;
                                    if (wlw && Array.isArray(wlw.exercises)) s += wlw.exercises.length;
                                }
                                return s;
                            };
                            var prevWbRows = __sumWbExerciseLengths(prevDay);
                            var newWbRows = __sumWbExerciseLengths(newDay);
                            /** Same tab date as patchTraining / LS; prevDay.date can lag right after reload. */
                            var dkGuard = (prevDay && prevDay.date) || date;
                            var lastCommitWb = HEYS && HEYS.Day && HEYS.Day._lastWbRowsByDate && dkGuard
                                ? HEYS.Day._lastWbRowsByDate[dkGuard]
                                : null;
                            var persistedWb = 0;
                            try {
                                if (dkGuard && typeof global.sessionStorage !== 'undefined' && global.sessionStorage) {
                                    var rawW = global.sessionStorage.getItem('heys_last_wbrows_' + dkGuard);
                                    if (rawW != null && rawW !== '') persistedWb = parseInt(rawW, 10) || 0;
                                }
                            } catch (eSs2) { /* noop */ }
                            var refWbRows = Math.max(
                                prevWbRows,
                                typeof lastCommitWb === 'number' ? lastCommitWb : 0,
                                persistedWb
                            );
                            /** Include foreground-hot-sync (not in externalSources[]) so WB rows are not rolled back. */
                            var wbOverlayFromRemoteish =
                                isExternalSource || source === 'foreground-hot-sync';
                            /** Only when snapshot is not strictly newer than React: allow cloud/other tab to win by updatedAt. */
                            var incomingUp = (newDay && newDay.updatedAt) || 0;
                            var prevUpWb = (prevDay && prevDay.updatedAt) || 0;
                            if (
                                wbOverlayFromRemoteish &&
                                refWbRows > newWbRows &&
                                incomingUp <= prevUpWb
                            ) {
                                return prevDay;
                            }
                            const prevMealsCount = (prevDay?.meals || []).length;
                            const prevItemsCount = (prevDay?.meals || []).reduce((s, m) => s + (m?.items?.length || 0), 0);
                            const mealsDown = storageMealsCount < prevMealsCount;
                            const itemsDown = storageItemsCount < prevItemsCount;
                            if (mealsDown || itemsDown) {
                                console.warn('[HEYS.day] ⚠️ Potential overwrite (meals/items count down)', {
                                    source,
                                    prevMealsCount,
                                    storageMealsCount,
                                    prevItemsCount,
                                    storageItemsCount,
                                    forceReload
                                });
                            }

                            const shouldSkipOverwrite = isStaleStorage && (mealsDown || itemsDown);
                            if (shouldSkipOverwrite) {
                                console.warn('[HEYS.day] 🛡️ Skip overwrite (stale + meals/items down)', {
                                    source,
                                    updatedDate,
                                    storageUpdatedAt,
                                    currentUpdatedAt,
                                    prevMealsCount,
                                    storageMealsCount,
                                    prevItemsCount,
                                    storageItemsCount,
                                    forceReload
                                });
                                return prevDay;
                            }

                            // v25.8.6.6+: Защита от cloud/fetchDays/hot-sync отката количества приёмов И продуктов.
                            // Внешние источники не должны уменьшать локально подтвержденные meals/items
                            // (кейс: продукт добавлен в существующий приём, meal count не изменился,
                            // но облако ещё не получило новый item — hot-sync перезаписывает и item пропадает).
                            // A genuine cross-device DELETE drops the item count AND carries an
                            // explicit deletedItemIds tombstone for the dropped item(s). That is not
                            // a "rollback to block" — it must show. Exempt it from the guard so the
                            // explicit-delete flow (removeItem → tombstone) propagates to the other
                            // device's UI. Plain count-drops with no tombstone stay blocked (stale-cloud
                            // anti-rollback protection unchanged).
                            const droppedItemsAllTombstoned = (() => {
                                try {
                                    const tomb = (normalizedDay.deletedItemIds && typeof normalizedDay.deletedItemIds === 'object')
                                        ? normalizedDay.deletedItemIds : null;
                                    if (!tomb) return false;
                                    const nextIds = new Set((normalizedDay.meals || [])
                                        .flatMap(m => (m?.items || []).map(it => String(it?.id))));
                                    const dropped = (prevDay?.meals || [])
                                        .flatMap(m => (m?.items || []).map(it => String(it?.id)))
                                        .filter(id => id && id !== 'undefined' && !nextIds.has(id));
                                    return dropped.length > 0 && dropped.every(id => Number(tomb[id]) > 0);
                                } catch (_) { return false; }
                            })();

                            const shouldSkipExternalMealsRollback =
                                isExternalSource &&
                                (mealsDown || itemsDown) &&
                                !droppedItemsAllTombstoned;

                            if (shouldSkipExternalMealsRollback) {
                                recordDayDecision('SKIP_EXTERNAL_ROLLBACK', source, `items ${storageItemsCount}<${prevItemsCount}, no tombstone`);
                                console.warn('[HEYS.day] 🛡️ Skip overwrite (external meals/items rollback)', {
                                    source,
                                    updatedDate,
                                    prevMealsCount,
                                    storageMealsCount,
                                    prevItemsCount,
                                    storageItemsCount,
                                    storageUpdatedAt,
                                    currentUpdatedAt,
                                    forceReload
                                });
                                return prevDay;
                            }

                            // Обновляем ref только если приняли данные из storage
                            recordDayDecision('APPLIED', source, 'updatedAt ' + storageUpdatedAt + ', items ' + storageItemsCount + ', forceReload=' + !!forceReload);
                            lastLoadedUpdatedAtRef.current = storageUpdatedAt;

                            // Равный updatedAt: снимок из LS/облака может отстать по waterMl на один тик
                            // (persist через Store + hot-sync с тем же timestamp).
                            var mergedForReturn = newDay;
                            if (storageUpdatedAt === prevUpdatedAt && prevDay && mergedForReturn) {
                                var prevWml = +(prevDay.waterMl || 0);
                                var nextWml = +(mergedForReturn.waterMl || 0);
                                if (prevWml > nextWml) {
                                    var prevLw = +(prevDay.lastWaterTime || 0);
                                    var nextLw = +(mergedForReturn.lastWaterTime || 0);
                                    mergedForReturn = {
                                        ...mergedForReturn,
                                        waterMl: prevWml,
                                        lastWaterTime: Math.max(prevLw, nextLw) || mergedForReturn.lastWaterTime
                                    };
                                }
                            }

                            if (prevDay && prevDay.date === mergedForReturn.date) {
                                const eq = HEYS.dayUtils && typeof HEYS.dayUtils.isSameDayStorageMergeContent === 'function'
                                    ? HEYS.dayUtils.isSameDayStorageMergeContent(prevDay, mergedForReturn)
                                    : false;
                                if (eq) {
                                    // Diagnostics: APPLIED was recorded above, but the reducer keeps
                                    // prevDay because isSameDayStorageMergeContent says content is equal.
                                    // If the screen is stale yet this fires, that equality check is the
                                    // false-positive masking PIN's change (records the prev/next stamps).
                                    recordDayDecision('SAME_STORAGE_MERGE_SKIP', source,
                                        'kept React updatedAt ' + (prevDay && prevDay.updatedAt) + ' over storage ' + storageUpdatedAt);
                                    return prevDay;
                                }
                            }
                            return mergedForReturn;
                        });
                        lastAppliedSignatureRef.current = applySignature;
                        lastAppliedAtRef.current = Date.now();
                    }
                        });
                    };
                    const __dayApplyRaf = requestAnimationFrame(runDayApply);
                    const __dayApplyTimer = setTimeout(runDayApply, 350);
                    pendingDayApplyRafRef.current = { raf: __dayApplyRaf, timer: __dayApplyTimer };
                }
            };

            // Слушаем явное событие обновления дня (от StepModal, Morning Check-in)
            global.addEventListener('heys:day-updated', handleDayUpdated);

            return () => {
                if (pendingDayApplyRafRef.current != null) {
                    const __sched = pendingDayApplyRafRef.current;
                    try { if (__sched && __sched.raf != null) cancelAnimationFrame(__sched.raf); } catch (_) { /* noop */ }
                    try { if (__sched && __sched.timer != null) clearTimeout(__sched.timer); } catch (_) { /* noop */ }
                    pendingDayApplyRafRef.current = null;
                }
                global.removeEventListener('heys:day-updated', handleDayUpdated);
                if (dayUpdateLogTimerRef.current) {
                    clearTimeout(dayUpdateLogTimerRef.current);
                    dayUpdateLogTimerRef.current = null;
                }
            };
        }, [date]);

        // 🛟 Periodic content reconciler (curator PIN→screen stall, 2026-06-05).
        // The event-driven apply path can stall on this device: the curator gets a
        // heys:data-saved {key:"day"} storm (~100/30s) that starves the
        // React.startTransition-wrapped apply, so the setDay reducer never commits
        // and the screen keeps showing stale grams while localStorage already holds
        // the new value. This is an independent safety net: every few seconds, while
        // the diary is visible and no local edit is in flight, compare the React day
        // to localStorage BY CONTENT (no timestamp games — clock skew made those
        // unreliable) and, if they differ, apply via a DIRECT setDay (urgent update,
        // commits even under the storm). Converges the screen to LS within one tick.
        React.useEffect(() => {
            const reconcile = () => {
                try {
                    if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'visible') return;
                    if (Date.now() < (blockCloudUpdatesUntilRef.current || 0)) return; // protect in-flight local edit
                    if (_readDayV2Cache) _readDayV2Cache.invalidate((HEYS.currentClientId || '') + '|' + date);
                    const lsDay = readDayV2(date, lsGet).value;
                    if (!lsDay || typeof lsDay !== 'object' || !isMeaningfulDayData(lsDay)) return;
                    const reactDay = (HEYS.Day && typeof HEYS.Day.getDay === 'function') ? HEYS.Day.getDay() : null;
                    if (!reactDay) return;
                    const same = (HEYS.dayUtils && typeof HEYS.dayUtils.isSameDayHydratedContent === 'function')
                        ? HEYS.dayUtils.isSameDayHydratedContent(reactDay, lsDay)
                        : false;
                    if (same) return; // screen already matches storage
                    // Content differs — reconcile by item.updatedAt (handles clock skew both ways),
                    // then commit urgently (not via startTransition, which is being starved).
                    const mergeApi = (HEYS.sync && typeof HEYS.sync.mergeDayData === 'function') ? HEYS.sync : null;
                    const merged = mergeApi ? mergeApi.mergeDayData(reactDay, lsDay) : null;
                    const finalDay = (merged && Array.isArray(merged.meals)) ? merged : lsDay;
                    const profNow = getProfile();
                    recordDayDecision('PERIODIC_RECONCILE', 'interval', 'React/LS content diff — direct apply');
                    lastLoadedUpdatedAtRef.current = Math.max(lastLoadedUpdatedAtRef.current || 0, finalDay.updatedAt || 0);
                    setDay(() => ensureDay(finalDay, profNow));
                } catch (_) { /* noop — reconciler must never break render */ }
            };
            const reconcileId = setInterval(reconcile, 3000);
            return () => clearInterval(reconcileId);
        }, [date]);

        // v25.8.6.7: Export addMealDirect — direct React state update for external callers
        // Used by meal rec card instead of unreliable event dispatch pipeline
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};

            /**
             * Add a meal directly to day state + localStorage (synchronous).
             * Mirrors the pattern from heys_day_meal_handlers.js addMeal onComplete.
             * @param {Object} newMeal - Meal object from MealStep.showAddMeal onComplete
             * @returns {boolean} success
             */
            HEYS.Day.addMealDirect = (newMeal) => {
                if (!newMeal || !newMeal.id) {
                    console.warn('[HEYS.Day.addMealDirect] ❌ Invalid meal:', newMeal);
                    return false;
                }

                const newUpdatedAt = Date.now();
                lastLoadedUpdatedAtRef.current = newUpdatedAt;
                blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                // 2026-05-29 anti-loop: lsSet НЕ внутри setDay reducer.
                // React 18 updateReducer повторно прогоняет updater'ы из очереди
                // при каждом рендере (особенно под StrictMode dev — ~2× amplification),
                // что приводило к 200+ повторных lsSet в курaторской сессии (см. snapshot 11:51).
                // Правильно: читаем live snapshot из LS, считаем newDayData, пишем СИНХРОННО
                // ОДИН раз, после этого setDay делает только pure state update.
                const _baseKeyAdd = 'heys_dayv2_' + date;
                let liveSnapshot = {};
                try {
                    liveSnapshot = (HEYS.utils && typeof HEYS.utils.lsGet === 'function')
                        ? (HEYS.utils.lsGet(_baseKeyAdd, {}) || {})
                        : {};
                } catch (_) { liveSnapshot = {}; }
                const safePrev = liveSnapshot && typeof liveSnapshot === 'object' ? liveSnapshot : {};
                const newMealsArr = [...(safePrev.meals || []), newMeal];
                const newDayData = {
                    ...safePrev,
                    date: safePrev.date || date,
                    meals: newMealsArr,
                    updatedAt: newUpdatedAt
                };

                try {
                    lsSet(_baseKeyAdd, newDayData);
                } catch (e) {
                    console.error('[HEYS.Day.addMealDirect] ❌ lsSet failed:', e);
                }

                setDay(prevDay => ({ ...prevDay, ...newDayData, meals: newMealsArr, updatedAt: newUpdatedAt }));

                console.info('[HEYS.Day.addMealDirect] ✅ Meal added:', newMeal.name, 'id=' + newMeal.id);
                return true;
            };

            return () => {
                if (HEYS.Day && HEYS.Day.addMealDirect) {
                    delete HEYS.Day.addMealDirect;
                }
            };
        }, [date]);
    }

    function useDayBootEffects() {
        const React = getReact();
        // Twemoji: reparse emoji on mount only (subsequent reparses handled by useTwemojiEffect on tab change)
        React.useEffect(() => {
            if (global.scheduleTwemojiParse) global.scheduleTwemojiParse();
        }, []); // eslint-disable-line react-hooks/exhaustive-deps

        // Трекинг просмотра дня (только один раз)
        React.useEffect(() => {
            if (global.HEYS && global.HEYS.analytics) {
                global.HEYS.analytics.trackDataOperation('day-viewed');
            }
        }, []);
    }

    function useDayCurrentMinuteEffect(deps) {
        const React = getReact();
        const { setCurrentMinute } = deps || {};
        React.useEffect(() => {
            if (typeof setCurrentMinute !== 'function') return undefined;
            const tick = () => setCurrentMinute(Math.floor(Date.now() / 60000));
            const intervalId = setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden) return;
                tick();
            }, 60000);
            const onVis = () => {
                if (typeof document !== 'undefined' && !document.hidden) tick();
            };
            document.addEventListener('visibilitychange', onVis);
            return () => {
                clearInterval(intervalId);
                document.removeEventListener('visibilitychange', onVis);
            };
        }, []);
    }

    function useDayThemeEffect(deps) {
        const React = getReact();
        const { theme, resolvedTheme } = deps || {};
        React.useEffect(() => {
            const nextTheme = theme === 'dark' || theme === 'light'
                ? theme
                : resolvedTheme === 'dark'
                    ? 'dark'
                    : 'light';

            document.documentElement.setAttribute('data-theme', nextTheme);
            try {
                const U = global.HEYS?.utils || {};
                if (global.HEYS?.store?.set) {
                    global.HEYS.store.set('heys_theme', nextTheme);
                } else if (U.lsSet) {
                    U.lsSet('heys_theme', nextTheme);
                } else {
                    localStorage.setItem('heys_theme', nextTheme);
                }
            } catch (e) {
                // QuotaExceeded — игнорируем, тема применится через data-theme
            }
        }, [theme, resolvedTheme]);
    }

    function useDayExportsEffects(deps) {
        const React = getReact();
        const {
            currentStreak,
            addMeal,
            addWater,
            addProductToMeal,
            day,
            pIndex,
            getMealType,
            getMealQualityScore,
            safeMeals
        } = deps || {};

        // Экспорт getStreak для использования в gamification модуле
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.getStreak = () => currentStreak;

            // Dispatch событие чтобы GamificationBar мог обновить streak
            window.dispatchEvent(new CustomEvent('heysDayStreakUpdated', {
                detail: { streak: currentStreak }
            }));

            // ✅ Проверяем streak-достижения при каждом обновлении streak
            // 🔒 v4.0: Не выдаём ачивки во время loading phase
            if (HEYS.game?.checkStreakAchievements && !HEYS.game?.isLoadingPhase) {
                HEYS.game.checkStreakAchievements(currentStreak);
            }

            // Confetti при streak 3, 5, 7
            // 🔒 v4.0: Не показываем конфетти при загрузке
            if ([3, 5, 7].includes(currentStreak) && HEYS.game && HEYS.game.celebrate && !HEYS.game?.isLoadingPhase) {
                HEYS.game.celebrate();
            }

            return () => {
                if (HEYS.Day && HEYS.Day.getStreak) {
                    delete HEYS.Day.getStreak;
                }
            };
        }, [currentStreak]);

        // Экспорт addMeal для PWA shortcuts и внешних вызовов
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addMeal = addMeal;
            return () => {
                if (HEYS.Day && HEYS.Day.addMeal === addMeal) {
                    delete HEYS.Day.addMeal;
                }
            };
        }, [addMeal]);

        // Экспорт addWater для внешних вызовов (например, FAB на вкладке Виджеты)
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addWater = addWater;
            return () => {
                if (HEYS.Day && HEYS.Day.addWater === addWater) {
                    delete HEYS.Day.addWater;
                }
            };
        }, [addWater]);

        // Экспорт addProductToMeal как публичный API
        // Позволяет добавлять продукт в приём извне: HEYS.Day.addProductToMeal(mealIndex, product, grams?)
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addProductToMeal = (mi, product, grams) => {
                // Валидация
                if (typeof mi !== 'number' || mi < 0) {
                    console.warn('[HEYS.Day.addProductToMeal] Invalid meal index:', mi);
                    return false;
                }
                if (!product || !product.name) {
                    console.warn('[HEYS.Day.addProductToMeal] Invalid product:', product);
                    return false;
                }
                // Добавляем продукт
                const productWithGrams = grams ? { ...product, grams } : product;
                addProductToMeal(mi, productWithGrams);
                return true;
            };
            return () => {
                if (HEYS.Day) delete HEYS.Day.addProductToMeal;
            };
        }, [addProductToMeal]);

        // Экспорт getMealQualityScore и getMealType как публичный API для advice модуля
        // getMealTypeByMeal — wrapper с текущим контекстом (meals и pIndex)
        React.useEffect(() => {
            HEYS.getMealQualityScore = getMealQualityScore;
            // Wrapper: принимает meal объект, находит его индекс и вызывает с полным контекстом
            HEYS.getMealType = (meal) => {
                if (!meal) return { type: 'snack', name: 'Перекус', icon: '🍎' };
                const allMeals = day.meals || [];
                // Если передали только time (string), находим meal по времени
                if (typeof meal === 'string') {
                    const foundMeal = allMeals.find(m => m.time === meal);
                    if (!foundMeal) return { type: 'snack', name: 'Перекус', icon: '🍎' };
                    const idx = allMeals.indexOf(foundMeal);
                    return getMealType(idx, foundMeal, allMeals, pIndex);
                }
                // Если передали meal объект
                const idx = allMeals.findIndex(m => m.id === meal.id || m.time === meal.time);
                if (idx === -1) return { type: 'snack', name: 'Перекус', icon: '🍎' };
                return getMealType(idx, meal, allMeals, pIndex);
            };
            return () => {
                delete HEYS.getMealQualityScore;
                delete HEYS.getMealType;
            };
        }, [safeMeals, pIndex]);
    }

    // PERF v8.1: Lightweight re-render trigger for deferred modules
    // When deferred modules (CascadeCard, MealRecCard, Supplements) finish loading,
    // they dispatch 'heys-deferred-module-loaded' instead of 'heys:day-updated'.
    // This avoids full day data reload (setDay) — just triggers UI re-render
    // so deferredSlot sees module readiness and swaps skeleton → content.
    function useDeferredModuleEffect() {
        const React = getReact();
        const [, setDeferredTick] = React.useState(0);

        React.useEffect(() => {
            const handleModuleLoaded = (e) => {
                const mod = e.detail?.module || 'unknown';
                console.info('[HEYS.day] 🧩 Deferred module loaded:', mod);
                setDeferredTick(c => c + 1);
            };
            window.addEventListener('heys-deferred-module-loaded', handleModuleLoaded);
            return () => window.removeEventListener('heys-deferred-module-loaded', handleModuleLoaded);
        }, []);
    }

    HEYS.dayEffects = {
        useDaySyncEffects,
        useDayBootEffects,
        useDeferredModuleEffect,
        useDayCurrentMinuteEffect,
        useDayThemeEffect,
        useDayExportsEffects
    };

})(window);
