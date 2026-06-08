// heys_day_hooks.js — React hooks for Day component

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // Импортируем утилиты из dayUtils
    const getDayUtils = () => HEYS.dayUtils || {};

    // Глобальный дедуп логов: несколько экземпляров useDayAutosave (разные даты) иначе спамят одинаковым HIT.
    const __heysDayv2FlushGuardLogState = { updatedAt: null, at: 0 };

    // Хук для централизованного автосохранения дня с учётом гонок и межвкладочной синхронизации
    // Поддерживает ночную логику: приёмы 00:00-02:59 сохраняются под следующий календарный день
    function useDayAutosave({
        day,
        date,
        lsSet,
        lsGetFn,
        keyPrefix = 'heys_dayv2_',
        debounceMs = 500,
        now = () => Date.now(),
        disabled = false, // ЗАЩИТА: не сохранять пока данные не загружены
    }) {
        const utils = getDayUtils();
        // ВАЖНО: Используем динамический вызов чтобы всегда брать актуальный HEYS.utils.lsSet
        // Это нужно для синхронизации с облаком (диспатч события heys:data-saved)
        const lsSetFn = React.useCallback((key, val) => {
            const storeSet = global.HEYS?.store?.set;
            if (storeSet) {
                storeSet(key, val);
                return;
            }
            const actualLsSet = global.HEYS?.utils?.lsSet || lsSet || utils.lsSet;
            if (actualLsSet) {
                actualLsSet(key, val);
            } else {
                // Fallback
                try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { }
            }
        }, [lsSet, utils.lsSet]);
        const lsGetFunc = lsGetFn || utils.lsGet;

        const timerRef = React.useRef(null);
        const prevStoredSnapRef = React.useRef(null);
        const prevDaySnapRef = React.useRef(null);
        const sourceIdRef = React.useRef((global.crypto && typeof global.crypto.randomUUID === 'function') ? global.crypto.randomUUID() : String(Math.random()));
        const channelRef = React.useRef(null);
        const isUnmountedRef = React.useRef(false);

        React.useEffect(() => {
            isUnmountedRef.current = false;
            if ('BroadcastChannel' in global) {
                const channel = new BroadcastChannel('heys_day_updates');
                channelRef.current = channel;
                return () => {
                    isUnmountedRef.current = true;
                    channel.close();
                    channelRef.current = null;
                };
            }
            channelRef.current = null;
        }, []);

        const getKey = React.useCallback((dateStr) => keyPrefix + dateStr, [keyPrefix]);

        const stripMeta = React.useCallback((payload) => {
            if (!payload) return payload;
            const { updatedAt, _sourceId, ...rest } = payload;
            return rest;
        }, []);

        // PERF Foundation 0: content-hash вместо JSON.stringify(stripMeta(day)).
        // На дне с 200+ meal items — JSON.stringify ~100мс. Hash через cached _h полей — ~0.3мс.
        // Fallback на stringify если contentHash не загружен (редкий load-order edge case).
        const computeDaySnap = React.useCallback((payload) => {
            if (!payload) return '';
            const ch = global.HEYS?.contentHash;
            if (ch && typeof ch.hashDay === 'function') {
                return ch.hashDay(payload);
            }
            return JSON.stringify(stripMeta(payload));
        }, [stripMeta]);

        const readExisting = React.useCallback((key) => {
            if (!key) return null;
            try {
                if (global.HEYS?.store?.invalidate) {
                    global.HEYS.store.invalidate(key);
                }
                const stored = lsGetFunc ? lsGetFunc(key, null) : null;
                if (stored && typeof stored === 'object') return stored;
                if (typeof stored === 'string') {
                    return JSON.parse(stored);
                }
            } catch (e) { }

            const readRawLocal = (rawKey) => {
                if (!rawKey) return null;
                try {
                    const raw = global.localStorage?.getItem(rawKey);
                    if (!raw) return null;
                    if (raw.startsWith('¤Z¤') && global.HEYS?.store?.decompress) {
                        return global.HEYS.store.decompress(raw);
                    }
                    return JSON.parse(raw);
                } catch (e) {
                    return null;
                }
            };

            try {
                const cid = global.HEYS?.currentClientId;
                const isScoped = cid && key.startsWith('heys_') && !key.includes(cid);
                const scopedKey = isScoped ? ('heys_' + cid + '_' + key.substring('heys_'.length)) : key;
                const scopedVal = readRawLocal(scopedKey);
                if (scopedVal && typeof scopedVal === 'object') return scopedVal;
                const rawVal = readRawLocal(key);
                if (rawVal && typeof rawVal === 'object') return rawVal;
            } catch (e) { }
            return null;
        }, [lsGetFunc]);

        const isMeaningfulDayData = React.useCallback((data) => {
            if (!data || typeof data !== 'object') return false;
            try {
                const dc = HEYS.dayCalculations && typeof HEYS.dayCalculations.dayHasTrackableWorkoutBuilder === 'function'
                    ? HEYS.dayCalculations.dayHasTrackableWorkoutBuilder(data)
                    : false;
                if (dc) return true;
            } catch (e) { /* noop */ }
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
        }, []);

        // Очистка фото от base64 данных перед сохранением (экономия localStorage)
        const stripPhotoData = React.useCallback((payload) => {
            if (!payload?.meals) return payload;
            return {
                ...payload,
                meals: payload.meals.map(meal => {
                    if (!meal?.photos?.length) return meal;
                    return {
                        ...meal,
                        photos: meal.photos.map(photo => {
                            // Если есть URL — удаляем data (base64)
                            // Если нет URL (pending) — сохраняем data для offline
                            if (photo.url) {
                                const { data, ...rest } = photo;
                                return rest;
                            }
                            // Pending фото: сохраняем, но ограничиваем размер
                            // Если data > 100KB — не сохраняем в localStorage (только в pending queue)
                            if (photo.data && photo.data.length > 100000) {
                                console.warn('[AUTOSAVE] Photo too large for localStorage, skipping data');
                                const { data, ...rest } = photo;
                                return { ...rest, dataSkipped: true };
                            }
                            return photo;
                        })
                    };
                })
            };
        }, []);

        // Сохранение данных дня под конкретную дату
        const saveToDate = React.useCallback((dateStr, payload) => {
            if (!dateStr || !payload) return;
            // 🛡️ 2026-05-31: H2 fix — hard invariant: dateStr ДОЛЖНА совпадать с
            // payload.date. Иначе сохраняем blob с meals/trainings одного дня
            // под key другого дня + saveToDate переписывает payload.date на
            // dateStr → silent data corruption невидим на чтении.
            // Incident 2026-05-31 07:55: Александры 30 мая (888 ккал, 4 meals)
            // был затёрт today data (174 ккал, 1 meal, payload.date=31 мая).
            // Без этого guard'а кто-то (cloud event handler? live-refresh?) ещё
            // продолжит переписывать чужие даты. Защищаем data integrity на
            // нижнем слое — даже если bug в caller'е, корруптной записи не будет.
            if (payload.date && payload.date !== dateStr) {
                console.warn('[HEYS.dayHooks] 🛡️ saveToDate ABORT: payload.date mismatch', {
                    dateStr,
                    payloadDate: payload.date,
                    mealsCount: Array.isArray(payload.meals) ? payload.meals.length : 0,
                });
                return;
            }
            const key = getKey(dateStr);
            const current = readExisting(key);
            const incomingUpdatedAt = payload.updatedAt != null ? payload.updatedAt : now();

            if (current && current.updatedAt > incomingUpdatedAt) return;
            if (current && current.updatedAt === incomingUpdatedAt && current._sourceId && current._sourceId > sourceIdRef.current) return;

            if (current && isMeaningfulDayData(current) && !isMeaningfulDayData(payload)) return;

            // 🔍 DEBUG: Проверка на продукты без нутриентов в meals
            // Synthetic estimated items (morning-checkin quickfill, virtual products) легитимно
            // не имеют нутриентов — пропускаем, чтобы не засорять signal от настоящих empty items.
            const isSynthetic = HEYS.dayUtils?.isSyntheticEstimatedItem;
            const emptyItems = [];
            (payload.meals || []).forEach((meal, mi) => {
                (meal.items || []).forEach((item, ii) => {
                    if (!item.kcal100 && !item.protein100 && !item.carbs100 && !isSynthetic?.(item)) {
                        emptyItems.push({
                            mealIndex: mi,
                            itemIndex: ii,
                            name: item.name,
                            id: item.id,
                            product_id: item.product_id,
                            grams: item.grams
                        });
                    }
                });
            });
            if (emptyItems.length > 0) {
                console.warn('⚠️ [AUTOSAVE] Items WITHOUT nutrients being saved:', emptyItems);
                // Попробуем найти продукт в базе для этого item
                emptyItems.forEach(item => {
                    const products = HEYS?.products?.getAll?.() || [];
                    const found = products.find(p =>
                        p.name?.toLowerCase() === item.name?.toLowerCase() ||
                        String(p.id) === String(item.product_id)
                    );
                    if (found) {
                        console.log('🔍 [AUTOSAVE] Found product in DB for empty item:', item.name, {
                            dbHasNutrients: !!(found.kcal100 || found.protein100),
                            dbKcal100: found.kcal100,
                            dbProtein100: found.protein100
                        });
                    } else {
                        console.error('🚨 [AUTOSAVE] Product NOT FOUND in DB for:', item.name);
                    }
                });
            }

            // Очищаем фото от base64 перед сохранением
            const cleanedPayload = stripPhotoData(payload);

            const toStore = {
                ...cleanedPayload,
                date: dateStr,
                schemaVersion: payload.schemaVersion != null ? payload.schemaVersion : 3,
                updatedAt: incomingUpdatedAt,
                _sourceId: sourceIdRef.current,
            };

            try {
                // 🔬 [HEYS.day-trace] 5/8 LS write — about to persist day via flush().
                try {
                    const _meals = toStore.meals || [];
                    const _totalItems = _meals.reduce((acc, m) => acc + ((m.items || []).length), 0);
                    console.info('[HEYS.day-trace] 5/8 LS write (saveToDate)', {
                        key,
                        date: dateStr,
                        mealsCount: _meals.length,
                        totalItems: _totalItems,
                        updatedAt: toStore.updatedAt,
                        sourceId: toStore._sourceId,
                    });
                } catch (_) { /* noop */ }
                lsSetFn(key, toStore);
                if (channelRef.current && !isUnmountedRef.current) {
                    try {
                        channelRef.current.postMessage({ type: 'day:update', date: dateStr, payload: toStore });
                    } catch (e) { }
                }
            } catch (error) {
                console.error('[AUTOSAVE] localStorage write failed:', error);
            }
        }, [getKey, lsSetFn, now, readExisting, stripPhotoData, isMeaningfulDayData]);

        const getFreshestPersistedDay = React.useCallback((dateStr) => {
            if (!dateStr) return null;

            const key = getKey(dateStr);
            const existing = readExisting(key);
            const runtimeDay = typeof global.HEYS?.Day?.getDay === 'function'
                ? global.HEYS.Day.getDay()
                : null;

            let freshest = null;

            if (existing && typeof existing === 'object' && existing.date === dateStr) {
                freshest = existing;
            }

            if (runtimeDay && typeof runtimeDay === 'object' && runtimeDay.date === dateStr) {
                const runtimeUpdatedAt = runtimeDay.updatedAt || 0;
                const freshestUpdatedAt = freshest?.updatedAt || 0;
                if (runtimeUpdatedAt > freshestUpdatedAt) {
                    freshest = { ...runtimeDay };
                }
            }

            return freshest;
        }, [getKey, readExisting]);

        const flush = React.useCallback((options = {}) => {
            let force = options && options.force === true;
            // 🛡️ Pending-mutation / block-window override (incident 2026-06-08
            // curator add-item silently dropped). Checked BEFORE disabled guard:
            // disabled может временно стать true при re-bootstrap / visibility-visible,
            // и debounced flush() в эту секунду провалится без записи. Если есть
            // явная pending user-mutation — нужно записать в любом случае.
            //
            // Два независимых сигнала "user editing":
            //  (1) blockCloudUpdates window — короткое таймерное окно (3-15с).
            //      Защищает от live-refresh / hot-sync которые стампят LS с
            //      Math.max(cloud, local, Date.now()) > React.updatedAt
            //      (heys_sync_merge_v1.js:558), что иначе бы trigger'ило
            //      shouldPreserveFreshestPersistedDay bail-guard ниже.
            //  (2) pendingDayMutation flag — живёт пока flush явно не очистит.
            //      Закрывает зазор когда block истёк (skew-clear / 3s timeout) но
            //      flush ещё не успел записать LS (long-task 22с на медленном
            //      Android Chrome пожирал debounce setTimeout).
            const _dayDateForPending = (day && day.date) || null;
            let _hasPending = false;
            try {
                if (_dayDateForPending && global.HEYS?.Day?.hasPendingMutation) {
                    _hasPending = global.HEYS.Day.hasPendingMutation(_dayDateForPending) === true;
                }
            } catch (_) { /* noop */ }
            let _isBlocking = false;
            try {
                _isBlocking = global.HEYS?.Day?.isBlockingCloudUpdates?.() === true;
            } catch (_) { /* noop */ }
            if (!force && (_hasPending || _isBlocking)) {
                force = true;
            }
            if (!force && (disabled || isUnmountedRef.current)) return;
            // 🔧 RACE FIX: prefer ref-based day if it's newer than the closure-day.
            // flush() is invoked via RAF+setTimeout from addProductToMeal, which can
            // fire before React has committed the setDay state update — meaning the
            // closure-`day` is stale (still has 2 items while user just added the 3rd).
            // HEYS.Day.getDay() reads from the ref kept in sync via setDayRaw, so it
            // always has the freshest snapshot. This fix prevents the silent
            // "product disappears after refresh" bug.
            const _closureDay = day;
            let _effDay = _closureDay;
            try {
                const _refDay = global.HEYS && global.HEYS.Day && typeof global.HEYS.Day.getDay === 'function'
                    ? global.HEYS.Day.getDay()
                    : null;
                if (_refDay && _refDay.date === (_closureDay && _closureDay.date)
                    && (_refDay.updatedAt || 0) > ((_closureDay && _closureDay.updatedAt) || 0)) {
                    _effDay = _refDay;
                    // Force the write — the closure-`day` is stale, so guards downstream
                    // (which compare effDay snap vs freshestPersisted snap derived from
                    // the same ref) would incorrectly say "nothing changed". Without
                    // force, flush exits early and the user's add disappears on refresh.
                    force = true;
                    try {
                        const _cm = (_closureDay && _closureDay.meals) || [];
                        const _rm = _refDay.meals || [];
                        const _cItems = _cm.reduce((a, m) => a + ((m.items || []).length), 0);
                        const _rItems = _rm.reduce((a, m) => a + ((m.items || []).length), 0);
                        if (_cItems !== _rItems) {
                            console.info('[HEYS.day-trace] 4d/8 flush picked ref over closure (race-recovery, force=true)', {
                                closureItems: _cItems,
                                refItems: _rItems,
                                closureUpdatedAt: _closureDay && _closureDay.updatedAt,
                                refUpdatedAt: _refDay.updatedAt,
                            });
                        }
                    } catch (_) { /* noop */ }
                }
            } catch (_) { /* noop */ }
            if (!_effDay || !_effDay.date) return;

            if (force) {
                const key = getKey(_effDay.date);
                const existing = readExisting(key);
                if (isMeaningfulDayData(existing) && !isMeaningfulDayData(_effDay)) return;
            }

            const freshestPersistedDay = getFreshestPersistedDay(_effDay.date);
            const freshestUpdatedAt = freshestPersistedDay?.updatedAt || 0;
            let daySnap;
            let freshestDaySnap = null;
            const measureSnaps = () => {
                daySnap = computeDaySnap(_effDay);
                freshestDaySnap = freshestPersistedDay
                    ? computeDaySnap(freshestPersistedDay)
                    : null;
            };
            const pmFlush = global.HEYS?.perfMainThread;
            if (pmFlush && typeof pmFlush.measureSync === 'function') {
                pmFlush.measureSync('useDayAutosave:flushSnaps', measureSnaps, { threshold: 14 });
            } else {
                measureSnaps();
            }
            const updatedAt = _effDay.updatedAt != null ? _effDay.updatedAt : now();

            const shouldPreserveFreshestPersistedDay = !!(
                freshestPersistedDay &&
                freshestPersistedDay.date === _effDay.date &&
                (
                    freshestUpdatedAt > updatedAt ||
                    (
                        freshestUpdatedAt === updatedAt &&
                        freshestDaySnap &&
                        freshestDaySnap !== daySnap &&
                        isMeaningfulDayData(freshestPersistedDay)
                    )
                )
            );

            if (shouldPreserveFreshestPersistedDay) {
                prevStoredSnapRef.current = JSON.stringify(freshestPersistedDay);
                prevDaySnapRef.current = freshestDaySnap;
                return;
            }

            // Hot-sync loop protection: если content localStorage идентичен current state
            // (сравнение без updatedAt через stripMeta) — skip, чтобы не создавать upload loop.
            // hot-sync может получить dayv2 из облака → setDay → autosave → upload → hot-sync → ...
            if (!force && freshestDaySnap && freshestDaySnap === daySnap) {
                const t = Date.now();
                const r = __heysDayv2FlushGuardLogState;
                // Один лог на окно времени: updatedAt дёргается часто, несколько инстансов хука — иначе простыня HIT.
                if (t - r.at < 8000) return;
                r.updatedAt = updatedAt;
                r.at = t;
                if (typeof console !== 'undefined' && (
                    global?.localStorage?.getItem('heys_debug_sync') === 'true' ||
                    global?.localStorage?.getItem('heys_debug_ind') === 'true'
                )) {
                    console.info('[HEYS.sync] [IND] flush: dayv2 content guard HIT (freshest===current, skip write) updatedAt=' + updatedAt);
                }
                return;
            }
            if (!force && freshestDaySnap) {
                if (typeof console !== 'undefined' && (
                    global?.localStorage?.getItem('heys_debug_sync') === 'true' ||
                    global?.localStorage?.getItem('heys_debug_ind') === 'true'
                )) console.info('[HEYS.sync] [IND] flush: dayv2 content guard MISS (content differs) updatedAt=' + updatedAt + ' freshestUpdatedAt=' + freshestUpdatedAt);
            }

            // force: всегда пишем в storage — иначе MA/модалки читают LS без последнего debounced-патча приёмов.
            if (!force && prevDaySnapRef.current === daySnap) return;

            // 🔬 [HEYS.day-trace] 4c/8 inside flush — confirm we're using freshest day snapshot.
            try {
                const _meals = _effDay.meals || [];
                const _totalItems = _meals.reduce((acc, m) => acc + ((m.items || []).length), 0);
                console.info('[HEYS.day-trace] 4c/8 inside flush about to write', {
                    effMealsCount: _meals.length,
                    effTotalItems: _totalItems,
                    effUpdatedAt: _effDay.updatedAt,
                    pickedFromRef: _effDay !== _closureDay,
                });
            } catch (_) { /* noop */ }

            // Просто сохраняем все приёмы под текущую дату
            // Ночная логика теперь в todayISO() — до 3:00 "сегодня" = вчера
            const payload = {
                ..._effDay,
                updatedAt,
            };
            saveToDate(_effDay.date, payload);
            prevStoredSnapRef.current = JSON.stringify(payload);
            prevDaySnapRef.current = daySnap;
            // 🛡️ Pending mutation written through LS path → cleared so reconciler /
            // hot-sync / live-refresh могут снова свободно применять облако.
            // saveToDate сам имеет внутренние guards (updatedAt/sourceId order, payload.date
            // mismatch); если он silent-returned, очистка флага «забывает» pending edit и
            // следующий cycle reconciler перезатрёт React. Trade-off: при auto-clear
            // через 30s то же самое произойдёт — нет регрессии, но раньше.
            try {
                if (_effDay && _effDay.date && global.HEYS?.Day?.clearPendingMutation) {
                    global.HEYS.Day.clearPendingMutation(_effDay.date);
                }
            } catch (_) { /* noop */ }
        }, [day, now, saveToDate, stripMeta, disabled, getKey, readExisting, isMeaningfulDayData, getFreshestPersistedDay, computeDaySnap]);

        React.useEffect(() => {
            // 🔒 ЗАЩИТА: Не инициализируем prevDaySnapRef до гидратации!
            // Иначе после sync данные изменятся, а ref будет содержать старую версию
            if (disabled) return;
            if (!day || !day.date) return;
            // ✅ FIX: getKey ожидает dateStr, а не объект day
            // Иначе получаем ключ вида "heys_dayv2_[object Object]" и ломаем init снапов.
            const key = getKey(day.date);
            const current = readExisting(key);
            if (current) {
                prevStoredSnapRef.current = JSON.stringify(current);
                prevDaySnapRef.current = computeDaySnap(current);
            } else {
                prevDaySnapRef.current = computeDaySnap(day);
            }
        }, [day && day.date, getKey, readExisting, stripMeta, disabled, computeDaySnap]);

        React.useEffect(() => {
            if (disabled) return; // ЗАЩИТА: не запускать таймер до гидратации
            if (!day || !day.date) return;

            // 🔒 ЗАЩИТА: Инициализируем prevDaySnapRef при первом включении
            // Это предотвращает ложный save сразу после isHydrated=true
            let daySnap;
            const pmCmp = global.HEYS?.perfMainThread;
            if (pmCmp && typeof pmCmp.measureSync === 'function') {
                pmCmp.measureSync('useDayAutosave:daySnap', () => {
                    daySnap = computeDaySnap(day);
                }, { threshold: 14 });
            } else {
                daySnap = computeDaySnap(day);
            }

            if (prevDaySnapRef.current === null) {
                // Первый запуск после гидратации — просто запоминаем состояние без save
                prevDaySnapRef.current = daySnap;
                return;
            }

            if (prevDaySnapRef.current === daySnap) return;

            // ☁️ Сразу показать что данные изменились (до debounce)
            // Это запустит анимацию синхронизации в облачном индикаторе
            if (typeof global.dispatchEvent === 'function') {
                global.dispatchEvent(new CustomEvent('heys:data-saved', { detail: { key: 'day', type: 'data' } }));
            }

            global.clearTimeout(timerRef.current);
            timerRef.current = global.setTimeout(flush, debounceMs);
            return () => { global.clearTimeout(timerRef.current); };
        }, [day, debounceMs, flush, stripMeta, disabled, computeDaySnap]);

        React.useEffect(() => {
            return () => {
                global.clearTimeout(timerRef.current);
                if (!disabled) flush(); // ЗАЩИТА: не сохранять при unmount если не гидратировано
            };
        }, [flush, disabled]);

        React.useEffect(() => {
            const onVisChange = () => {
                if (!disabled && global.document.visibilityState !== 'visible') flush();
            };
            global.document.addEventListener('visibilitychange', onVisChange);
            global.addEventListener('pagehide', flush);
            return () => {
                global.document.removeEventListener('visibilitychange', onVisChange);
                global.removeEventListener('pagehide', flush);
            };
        }, [flush]);

        return { flush };
    }

    // Хук для централизованной детекции мобильных устройств с поддержкой ротации
    function useMobileDetection(breakpoint = 768) {
        const [isMobile, setIsMobile] = React.useState(() => {
            if (typeof window === 'undefined') return false;
            return window.innerWidth <= breakpoint;
        });

        React.useEffect(() => {
            if (typeof window === 'undefined' || !window.matchMedia) return;

            const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);

            const handleChange = (e) => {
                setIsMobile(e.matches);
            };

            // Начальное значение
            setIsMobile(mediaQuery.matches);

            // Подписка на изменения (поддержка ротации экрана)
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', handleChange);
                return () => mediaQuery.removeEventListener('change', handleChange);
            } else {
                // Fallback для старых браузеров
                mediaQuery.addListener(handleChange);
                return () => mediaQuery.removeListener(handleChange);
            }
        }, [breakpoint]);

        return isMobile;
    }

    // 🔧 v3.19.2: Глобальный кэш prefetch для предотвращения повторных запросов
    // Сохраняется между размонтированиями компонента
    const globalPrefetchCache = {
        prefetched: new Set(),
        lastPrefetchTime: 0,
        PREFETCH_COOLDOWN: 5000 // 5 секунд между prefetch
    };

    // Хук для Smart Prefetch — предзагрузка данных ±N дней при наличии интернета
    function useSmartPrefetch({
        currentDate,
        daysRange = 7,  // ±7 дней
        enabled = true
    }) {
        // 🔧 v3.19.2: Используем глобальный кэш вместо локального ref
        const prefetchedRef = React.useRef(globalPrefetchCache.prefetched);
        const utils = getDayUtils();
        const lsGet = utils.lsGet || HEYS.utils?.lsGet;

        // Генерация списка дат для prefetch
        const getDatesToPrefetch = React.useCallback((centerDate) => {
            const dates = [];
            const center = new Date(centerDate);

            for (let i = -daysRange; i <= daysRange; i++) {
                const d = new Date(center);
                d.setDate(d.getDate() + i);
                dates.push(d.toISOString().slice(0, 10));
            }

            return dates;
        }, [daysRange]);

        // Prefetch данных через Supabase (если доступно)
        const prefetchFromCloud = React.useCallback(async (dates) => {
            if (!navigator.onLine) return;
            if (!HEYS.cloud?.isAuthenticated?.()) return;

            // 🔧 v3.19.2: Cooldown защита от частых вызовов
            const now = Date.now();
            if (now - globalPrefetchCache.lastPrefetchTime < globalPrefetchCache.PREFETCH_COOLDOWN) {
                return; // Слишком частые вызовы — пропускаем
            }

            const toFetch = dates.filter(d => !prefetchedRef.current.has(d));
            if (toFetch.length === 0) return;

            try {
                // 🔧 v3.19.2: Обновляем время последнего prefetch
                globalPrefetchCache.lastPrefetchTime = now;

                // Пометим как "в процессе" чтобы избежать дублирования
                toFetch.forEach(d => prefetchedRef.current.add(d));

                // Загружаем данные через cloud sync
                if (HEYS.cloud?.fetchDays) {
                    await HEYS.cloud.fetchDays(toFetch);
                }
            } catch (error) {
                // Откатываем пометки при ошибке
                toFetch.forEach(d => prefetchedRef.current.delete(d));
            }
        }, []);

        // Prefetch при смене даты или восстановлении соединения
        React.useEffect(() => {
            if (!enabled || !currentDate) return;

            const dates = getDatesToPrefetch(currentDate);
            prefetchFromCloud(dates);

            // Подписка на восстановление соединения
            const handleOnline = () => {
                prefetchFromCloud(getDatesToPrefetch(currentDate));
            };

            window.addEventListener('online', handleOnline);
            return () => window.removeEventListener('online', handleOnline);
        }, [currentDate, enabled, getDatesToPrefetch, prefetchFromCloud]);

        // Ручной триггер prefetch
        const triggerPrefetch = React.useCallback(() => {
            if (!currentDate) return;
            prefetchedRef.current.clear();
            prefetchFromCloud(getDatesToPrefetch(currentDate));
        }, [currentDate, getDatesToPrefetch, prefetchFromCloud]);

        return { triggerPrefetch };
    }

    // === Exports ===
    HEYS.dayHooks = {
        useDayAutosave,
        useMobileDetection,
        useSmartPrefetch
    };

})(window);

