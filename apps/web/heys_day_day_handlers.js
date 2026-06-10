// heys_day_day_handlers.js — Day-level handlers (water, weight, steps, date, training)
// Phase 10.3 of HEYS Day v12 refactoring
// Extracted from heys_day_v12.js
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // Dependencies - explicit check instead of silent fallbacks
    if (!HEYS.dayUtils) {
        throw new Error('[heys_day_day_handlers] HEYS.dayUtils is required. Ensure heys_day_utils.js is loaded first.');
    }
    const { haptic, lsGet, lsSet } = HEYS.dayUtils;

    /**
     * Create day-level handlers
     * @param {Object} deps - Dependencies
     * @returns {Object} Day handler functions
     */
    function createDayHandlers(deps) {
        const {
            setDay,
            day,
            date,
            prof,
            setShowWaterDrop,
            setWaterAddedAnim,
            showConfetti,
            setShowConfetti,
            waterGoal,
            setEditGramsTarget,
            setEditGramsValue,
            setGrams
        } = deps;

        /**
         * Свежий day из scoped LS текущего клиента (инв. №9 — только scoped, без
         * cross-client fallback на unscoped). Читаем после invalidate, чтобы поймать
         * запись шага чекина даже если она ещё не «остыла» в store-кэше.
         */
        function readFreshScopedDay(dateKey) {
            try {
                const cid = HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '';
                if (cid) {
                    const scopedKey = 'heys_' + cid + '_dayv2_' + dateKey;
                    try { HEYS.store?.invalidate?.(scopedKey); } catch (_) { /* noop */ }
                    const v = typeof lsGet === 'function' ? lsGet(scopedKey, null) : null;
                    return (v && typeof v === 'object') ? v : null;
                }
                // Нет client-scope (редко): unscoped как единственный путь
                const v = typeof lsGet === 'function' ? lsGet('heys_dayv2_' + dateKey, null) : null;
                return (v && typeof v === 'object') ? v : null;
            } catch (_) {
                return null;
            }
        }

        function getLatestDaySnapshot() {
            const baseKey = 'heys_dayv2_' + date;
            const storedDay = typeof lsGet === 'function' ? lsGet(baseKey, null) : null;
            const runtimeDay = typeof HEYS?.Day?.getDay === 'function' ? HEYS.Day.getDay() : null;

            let snapshot = day && typeof day === 'object' ? day : {};

            if (storedDay && typeof storedDay === 'object' && (storedDay.updatedAt || 0) > (snapshot.updatedAt || 0)) {
                snapshot = storedDay;
            }

            if (runtimeDay && typeof runtimeDay === 'object' && (runtimeDay.updatedAt || 0) >= (snapshot.updatedAt || 0)) {
                snapshot = runtimeDay;
            }

            let result = snapshot && typeof snapshot === 'object' ? { ...snapshot } : { date };

            // 🛡️ TASK-003 анти-клоббер: subjective-поля чекина (сон/самочувствие) могли
            // не доехать в React/выбранный снапшот (apply дропнут под троттлингом таба),
            // но присутствуют в свежем scoped LS. Добираем их, чтобы снапшот дня
            // (addWater и пр.) не зацементировал их отсутствие. Explicit-мёрж (инв. №7).
            if (HEYS.dayUtils && typeof HEYS.dayUtils.mergeSubjectiveFieldsPreferFresh === 'function') {
                result = HEYS.dayUtils.mergeSubjectiveFieldsPreferFresh(result, readFreshScopedDay(date));
            }

            return result;
        }

        function persistDaySnapshotImmediately(nextDayData) {
            if (!nextDayData || typeof nextDayData !== 'object') return;

            // 🛡️ TASK-003 анти-клоббер (последний рубеж): даже если caller собрал снапшот
            // мимо getLatestDaySnapshot, не теряем subjective-поля чекина, присутствующие
            // в свежем scoped LS, но отсутствующие в снапшоте. Fill-if-missing, инв. №7.
            if (HEYS.dayUtils && typeof HEYS.dayUtils.mergeSubjectiveFieldsPreferFresh === 'function') {
                nextDayData = HEYS.dayUtils.mergeSubjectiveFieldsPreferFresh(nextDayData, readFreshScopedDay(date));
            }

            const baseKey = 'heys_dayv2_' + date;

            if (typeof HEYS?.Day?.setLastLoadedUpdatedAt === 'function') {
                HEYS.Day.setLastLoadedUpdatedAt(nextDayData.updatedAt || Date.now());
            }

            try {
                if (typeof lsSet === 'function') {
                    lsSet(baseKey, nextDayData);
                } else if (HEYS.store && typeof HEYS.store.set === 'function') {
                    HEYS.store.set(baseKey, nextDayData);
                } else {
                    global.localStorage?.setItem(baseKey, JSON.stringify(nextDayData));
                    if (typeof global.dispatchEvent === 'function') {
                        global.dispatchEvent(new CustomEvent('heys:data-saved', {
                            detail: { key: baseKey, type: 'day' }
                        }));
                    }
                }
            } catch (_error) {
                // silent
            }
        }

        function scheduleDayFlush(delayMs = 50) {
            const raf = typeof global.requestAnimationFrame === 'function'
                ? global.requestAnimationFrame.bind(global)
                : (cb) => global.setTimeout(cb, 0);

            raf(() => {
                global.setTimeout(() => {
                    if (typeof HEYS?.Day?.requestFlush === 'function') {
                        HEYS.Day.requestFlush();
                    }
                }, delayMs);
            });
        }

        /**
         * Open weight picker modal
         */
        function openWeightPicker() {
            if (HEYS.showCheckin && HEYS.showCheckin.weight) {
                HEYS.showCheckin.weight(date, (weightData) => {
                    // Мгновенное обновление UI через setDay
                    if (weightData && (weightData.weightKg !== undefined || weightData.weightG !== undefined)) {
                        const newWeight = (weightData.weightKg || 70) + (weightData.weightG || 0) / 10;
                        setDay(prev => ({ ...prev, weightMorning: newWeight, updatedAt: Date.now() }));
                    }
                });
            }
        }

        /**
         * Open steps goal picker
         */
        function openStepsGoalPicker() {
            if (HEYS.showCheckin && HEYS.showCheckin.steps) {
                HEYS.showCheckin.steps();
            }
        }

        /**
         * Open deficit picker
         */
        function openDeficitPicker() {
            // Используем StepModal вместо старого пикера
            if (HEYS.showCheckin && HEYS.showCheckin.deficit) {
                HEYS.showCheckin.deficit(date, (stepData) => {
                    // Мгновенное обновление UI через setDay
                    // stepData = { deficit: { deficit: -15, dateKey: '...' } }
                    const deficitValue = stepData?.deficit?.deficit;
                    if (deficitValue !== undefined) {
                        setDay(prev => ({ ...prev, deficitPct: deficitValue, updatedAt: Date.now() }));
                    }
                });
            }
        }

        function normalizeAddWaterOptions(optionsOrSkipScroll) {
            if (optionsOrSkipScroll && typeof optionsOrSkipScroll === 'object' && !Array.isArray(optionsOrSkipScroll)) {
                return {
                    skipScroll: !!optionsOrSkipScroll.skipScroll,
                    source: optionsOrSkipScroll.source || 'water-action',
                    sourceEl: optionsOrSkipScroll.sourceEl || null,
                    playSound: optionsOrSkipScroll.playSound !== false,
                    showScreenFill: optionsOrSkipScroll.showScreenFill !== false,
                    pulseWaterWidget: optionsOrSkipScroll.pulseWaterWidget !== false,
                    showSourceBadge: optionsOrSkipScroll.showSourceBadge !== false,
                    showSourceDrop: optionsOrSkipScroll.showSourceDrop !== false
                };
            }

            return {
                skipScroll: !!optionsOrSkipScroll,
                source: 'water-action',
                sourceEl: null,
                playSound: true,
                showScreenFill: true,
                pulseWaterWidget: true,
                showSourceBadge: true,
                showSourceDrop: true
            };
        }

        function ensureSharedWaterFeedback() {
            HEYS.waterFeedback = HEYS.waterFeedback || {};

            if (typeof HEYS.waterFeedback.playAddFeedback !== 'function') {
                HEYS.waterFeedback.playAddFeedback = function playAddFeedback(detail) {
                    if (!detail || !detail.ml) return;

                    if (detail.playSound !== false && HEYS.audio?.play) {
                        HEYS.audio.play('waterAdded', { haptic: false });
                    }

                    if (detail.showSourceBadge !== false && detail.sourceEl && typeof detail.sourceEl.getBoundingClientRect === 'function') {
                        const rect = detail.sourceEl.getBoundingClientRect();
                        if (rect && (rect.width || rect.height)) {
                            const badge = document.createElement('div');
                            badge.textContent = '+' + detail.ml + 'мл';
                            badge.style.cssText = [
                                'position:fixed',
                                'left:' + Math.round(rect.left + rect.width / 2) + 'px',
                                'top:' + Math.round(rect.top - 8) + 'px',
                                'transform:translateX(-50%)',
                                'padding:6px 12px',
                                'border-radius:16px',
                                'background:linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                                'color:#fff',
                                'font-size:14px',
                                'font-weight:700',
                                'line-height:1',
                                'white-space:nowrap',
                                'box-shadow:0 4px 12px rgba(14, 165, 233, 0.4)',
                                'pointer-events:none',
                                'z-index:9999',
                                'animation:water-fab-pop 0.8s ease-out forwards'
                            ].join(';');
                            document.body.appendChild(badge);
                            setTimeout(() => { if (badge.parentNode) badge.parentNode.removeChild(badge); }, 900);
                        }
                    }

                    if (detail.showSourceDrop !== false && detail.sourceEl && typeof detail.sourceEl.getBoundingClientRect === 'function') {
                        const rect = detail.sourceEl.getBoundingClientRect();
                        if (rect && (rect.width || rect.height)) {
                            const drop = document.createElement('div');
                            drop.className = 'water-drop-container';
                            drop.style.cssText = [
                                'position:fixed',
                                'left:' + Math.round(rect.left + rect.width / 2) + 'px',
                                'top:' + Math.round(rect.top - 20) + 'px',
                                'z-index:9999',
                                'pointer-events:none',
                                'transform:translateX(-50%)'
                            ].join(';');
                            drop.innerHTML = '<div class="water-drop"></div><div class="water-splash"></div>';
                            document.body.appendChild(drop);
                            setTimeout(() => { if (drop.parentNode) drop.parentNode.removeChild(drop); }, 1200);
                        }
                    }

                    if (detail.showScreenFill !== false) {
                        const overlay = document.createElement('div');
                        overlay.className = 'water-screen-fill';
                        const body = document.createElement('div');
                        body.className = 'water-screen-fill__body';
                        const wave = document.createElement('div');
                        wave.className = 'water-screen-fill__wave';
                        const shimmer = document.createElement('div');
                        shimmer.className = 'water-screen-fill__shimmer';
                        body.appendChild(wave);
                        body.appendChild(shimmer);

                        for (let i = 0; i < 8; i++) {
                            const bubble = document.createElement('div');
                            bubble.className = 'water-screen-fill__bubble';
                            const size = 6 + Math.random() * 14;
                            const delay = Math.random() * 0.6;
                            const dur = 0.7 + Math.random() * 0.8;
                            bubble.style.cssText = [
                                'width:' + size + 'px',
                                'height:' + size + 'px',
                                'left:' + (5 + Math.random() * 90) + '%',
                                'bottom:' + (10 + Math.random() * 50) + '%',
                                'animation-duration:' + dur + 's',
                                'animation-delay:' + delay + 's'
                            ].join(';');
                            body.appendChild(bubble);
                        }

                        const amount = document.createElement('div');
                        amount.className = 'water-screen-fill__amount';
                        amount.textContent = '+' + detail.ml + '\u00a0мл';
                        overlay.appendChild(amount);

                        overlay.appendChild(body);
                        document.body.appendChild(overlay);

                        requestAnimationFrame(() => {
                            body.classList.add('rising');
                        });

                        setTimeout(() => {
                            body.classList.remove('rising');
                            body.classList.add('draining');
                            setTimeout(() => {
                                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                            }, 950);
                        }, 1050);
                    }

                    if (detail.pulseWaterWidget !== false) {
                        const waterWidgetCard = document.querySelector('.widget[data-widget-type="water"]');
                        if (waterWidgetCard) {
                            waterWidgetCard.classList.add('widget--water-pulse');
                            setTimeout(() => {
                                waterWidgetCard.classList.remove('widget--water-pulse');
                            }, 1800);

                            waterWidgetCard.style.transition = 'background 0.4s ease';
                            waterWidgetCard.style.background = 'linear-gradient(135deg, rgba(10,132,255,0.12) 0%, rgba(100,210,255,0.18) 50%, rgba(0,238,255,0.10) 100%)';
                            setTimeout(() => {
                                waterWidgetCard.style.background = '';
                                waterWidgetCard.style.transition = '';
                            }, 1400);
                        }
                    }
                };
            }

            if (!HEYS.waterFeedback._bound) {
                window.addEventListener('heysWaterAdded', (e) => {
                    try {
                        HEYS.waterFeedback.playAddFeedback(e?.detail || {});
                    } catch (_error) {
                        // silent
                    }
                });
                HEYS.waterFeedback._bound = true;
            }
        }

        ensureSharedWaterFeedback();

        /**
         * Add water with animation
         * @param {number} ml - Milliliters to add
         * @param {boolean} skipScroll - Skip scroll to water card
         */
        function addWater(ml, optionsOrSkipScroll = false) {
            const options = normalizeAddWaterOptions(optionsOrSkipScroll);

            // 🔒 Read-only gating
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast('Добавление воды недоступно');
                return;
            }

            // Сначала прокручиваем к карточке воды (если вызвано из FAB)
            const waterCardEl = document.getElementById('water-card');
            if (!options.skipScroll && waterCardEl) {
                waterCardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Задержка для завершения скролла перед анимацией
                setTimeout(() => runWaterAnimation(ml, options), 400);
                return;
            }
            runWaterAnimation(ml, options);
        }

        /**
         * Internal water animation runner
         * 🚀 PERF R10: DOM-based animations — bypass React re-render entirely.
         * R9 showed animation setState alone costs ~426ms because ANY state change
         * triggers full DayTab re-render (2013-line monolith, ~30 useState).
         * waterAddedAnim + showWaterDrop are in useMemo deps for waterCard —
         * changing them invalidates the memo and causes expensive reconciliation.
         * Direct DOM injection = 0ms React processing, same visual effect.
         * React reconciliation does NOT remove DOM nodes it doesn't manage.
         */
        function runWaterAnimation(ml, options = {}) {
            const liveDay = getLatestDaySnapshot();
            const prevWater = liveDay.waterMl || 0;
            const newWater = prevWater + ml;
            const hitGoal = waterGoal && newWater >= waterGoal && prevWater < waterGoal;
            const newUpdatedAt = Date.now();
            const blockUntil = newUpdatedAt + 3000;
            const nextDaySnapshot = {
                ...liveDay,
                date,
                waterMl: newWater,
                lastWaterTime: newUpdatedAt,
                updatedAt: newUpdatedAt
            };
            if (typeof HEYS?.Day?.setBlockCloudUpdates === 'function') {
                HEYS.Day.setBlockCloudUpdates(blockUntil);
            }

            persistDaySnapshotImmediately(nextDaySnapshot);

            // Сразу обновляем React state (без startTransition — иначе цифра воды может приехать через секунды под нагрузкой)
            setDay(prev => ({
                ...prev,
                waterMl: newWater,
                lastWaterTime: newUpdatedAt,
                updatedAt: newUpdatedAt
            }));

            // DOM-based visual animations (no React state = no re-render)
            const waterCard = document.getElementById('water-card');
            if (waterCard) {
                // Сразу обновляем цифру на кольце (React может отстать от LS / hot-sync)
                const goalRing = Math.max(1, Number(waterGoal) || 2000);
                const ringFill = waterCard.querySelector('.water-ring-fill');
                if (ringFill) {
                    ringFill.style.strokeDasharray = Math.min(100, ((newWater || 0) / goalRing) * 100) + ' 100';
                }
                const ringVal = waterCard.querySelector('.water-ring-value');
                const ringUnit = waterCard.querySelector('.water-ring-unit');
                if (ringVal) {
                    ringVal.textContent = (newWater || 0) >= 1000
                        ? String(((newWater || 0) / 1000).toFixed(1)).replace('.0', '')
                        : String(newWater || 0);
                }
                if (ringUnit) {
                    ringUnit.textContent = (newWater || 0) >= 1000 ? 'л' : 'мл';
                }

                // "+250" text animation above the ring
                const ringCont = waterCard.querySelector('.water-ring-container');
                if (ringCont) {
                    const animSpan = document.createElement('span');
                    animSpan.className = 'water-card-anim water-card-anim-above';
                    animSpan.textContent = '+' + ml;
                    ringCont.appendChild(animSpan);
                    setTimeout(() => { if (animSpan.parentNode) animSpan.remove(); }, 800);
                }

                // Water drop + splash in progress bar
                const progressBar = waterCard.querySelector('.water-progress-inline');
                if (progressBar) {
                    const dropCont = document.createElement('div');
                    dropCont.className = 'water-drop-container';
                    const drop = document.createElement('div');
                    drop.className = 'water-drop';
                    const splash = document.createElement('div');
                    splash.className = 'water-splash';
                    dropCont.appendChild(drop);
                    dropCont.appendChild(splash);
                    progressBar.insertBefore(dropCont, progressBar.firstChild);
                    setTimeout(() => { if (dropCont.parentNode) dropCont.remove(); }, 1200);
                }
            }

            scheduleDayFlush();

            haptic('light');
            if (hitGoal) haptic('success');

            // 🎮 XP: Dispatch для gamification
            const waterDetail = {
                ml,
                total: newWater,
                source: options.source || 'day-water',
                sourceEl: options.sourceEl || null,
                playSound: options.playSound !== false,
                showScreenFill: options.showScreenFill !== false,
                pulseWaterWidget: options.pulseWaterWidget !== false,
                showSourceBadge: options.showSourceBadge !== false,
                showSourceDrop: options.showSourceDrop !== false
            };
            window.dispatchEvent(new CustomEvent('heysWaterAdded', { detail: waterDetail }));

            // 🎊 Confetti on goal hit — DOM-based (no React state)
            if (hitGoal) {
                const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#3b82f6'];
                const confettiEl = document.createElement('div');
                confettiEl.className = 'confetti-container mood-confetti';
                confettiEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
                for (let i = 0; i < 20; i++) {
                    const piece = document.createElement('div');
                    piece.className = 'confetti-piece';
                    piece.style.left = (5 + Math.random() * 90) + '%';
                    piece.style.animationDelay = (Math.random() * 0.5) + 's';
                    piece.style.backgroundColor = colors[i % 5];
                    confettiEl.appendChild(piece);
                }
                document.body.appendChild(confettiEl);
                setTimeout(() => { if (confettiEl.parentNode) confettiEl.remove(); }, 2000);
            }
        }

        /**
         * Remove water (для исправления ошибок)
         */
        function removeWater(ml) {
            const liveDay = getLatestDaySnapshot();
            const newWater = Math.max(0, (liveDay.waterMl || 0) - ml);
            const newUpdatedAt = Date.now();

            if (typeof HEYS?.Day?.setBlockCloudUpdates === 'function') {
                HEYS.Day.setBlockCloudUpdates(newUpdatedAt + 3000);
            }

            persistDaySnapshotImmediately({
                ...liveDay,
                date,
                waterMl: newWater,
                updatedAt: newUpdatedAt
            });

            const waterCardRm = document.getElementById('water-card');
            if (waterCardRm) {
                const goalRing = Math.max(1, Number(waterGoal) || 2000);
                const ringFill = waterCardRm.querySelector('.water-ring-fill');
                if (ringFill) {
                    ringFill.style.strokeDasharray = Math.min(100, ((newWater || 0) / goalRing) * 100) + ' 100';
                }
                const ringVal = waterCardRm.querySelector('.water-ring-value');
                const ringUnit = waterCardRm.querySelector('.water-ring-unit');
                if (ringVal) {
                    ringVal.textContent = (newWater || 0) >= 1000
                        ? String(((newWater || 0) / 1000).toFixed(1)).replace('.0', '')
                        : String(newWater || 0);
                }
                if (ringUnit) {
                    ringUnit.textContent = (newWater || 0) >= 1000 ? 'л' : 'мл';
                }
            }

            setDay(prev => ({ ...prev, waterMl: newWater, updatedAt: newUpdatedAt }));

            scheduleDayFlush();

            haptic('light');
        }

        /**
         * Open household activity picker
         */
        function openHouseholdPicker(mode = 'add', editIndex = null) {
            const dateKey = date; // ключ дня (YYYY-MM-DD)
            if (HEYS.StepModal) {
                // Выбираем шаги в зависимости от режима
                let steps, title;
                if (mode === 'stats') {
                    steps = ['household_stats'];
                    title = '📊 Статистика активности';
                } else if (mode === 'edit' && editIndex !== null) {
                    steps = ['household_minutes'];
                    title = '🏠 Редактирование';
                } else {
                    steps = ['household_minutes'];
                    title = '🏠 Добавить активность';
                }

                HEYS.StepModal.show({
                    steps,
                    title,
                    showProgress: steps.length > 1,
                    showStreak: false,
                    showGreeting: false,
                    showTip: false,
                    finishLabel: 'Готово',
                    context: { dateKey, editIndex, mode },
                    onComplete: (stepData) => {
                        // Обновляем локальное состояние из сохранённых данных
                        const savedDay = lsGet(`heys_dayv2_${dateKey}`, {});
                        setDay(prev => ({
                            ...prev,
                            householdActivities: savedDay.householdActivities || [],
                            // Legacy fields для backward compatibility
                            householdMin: savedDay.householdMin || 0,
                            householdTime: savedDay.householdTime || '',
                            updatedAt: Date.now()
                        }));
                    }
                });
            }
        }

        /**
         * Open edit grams modal
         */
        function openEditGramsModal(mealIndex, itemId, currentGrams, product) {
            if (HEYS.AddProductStep?.showEditGrams) {
                HEYS.AddProductStep.showEditGrams({
                    product,
                    currentGrams: currentGrams || 100,
                    mealIndex,
                    itemId,
                    dateKey: date,
                    onSave: ({ mealIndex: mi, itemId: id, grams }) => {
                        if (setGrams) setGrams(mi, id, grams);
                    }
                });
            } else {
                // Fallback на старую модалку (если AddProductStep не загружен)
                if (setEditGramsTarget) setEditGramsTarget({ mealIndex, itemId, product });
                if (setEditGramsValue) setEditGramsValue(currentGrams || 100);
            }
        }

        /**
         * Confirm edit grams modal
         */
        function confirmEditGramsModal(editGramsTarget, editGramsValue) {
            if (editGramsTarget && editGramsValue > 0 && setGrams) {
                setGrams(editGramsTarget.mealIndex, editGramsTarget.itemId, editGramsValue);
            }
            if (setEditGramsTarget) setEditGramsTarget(null);
            if (setEditGramsValue) setEditGramsValue(100);
        }

        /**
         * Cancel edit grams modal
         */
        function cancelEditGramsModal() {
            if (setEditGramsTarget) setEditGramsTarget(null);
            if (setEditGramsValue) setEditGramsValue(100);
        }

        /**
         * Update training zone minutes
         */
        function updateTraining(i, zi, mins) {
            setDay(prevDay => {
                const arr = (prevDay.trainings || []).map((t, idx) => {
                    if (idx !== i) return t;
                    return {
                        ...t,  // сохраняем time, type и другие поля
                        z: t.z.map((v, j) => j === zi ? (+mins || 0) : v)
                    };
                });
                return { ...prevDay, trainings: arr, updatedAt: Date.now() };
            });
        }

        /**
         * Open training picker
         */
        function openTrainingPicker(mode = 'add', editIndex = null) {
            if (HEYS.TrainingStep) {
                const dateKey = date;
                HEYS.TrainingStep.show({
                    dateKey,
                    mode,
                    editIndex,
                    onComplete: (stepData) => {
                        // Обновляем локальное состояние из сохранённых данных
                        const savedDay = lsGet(`heys_dayv2_${dateKey}`, {});
                        setDay(prev => ({
                            ...prev,
                            trainings: savedDay.trainings || [],
                            updatedAt: Date.now()
                        }));
                    }
                });
            }
        }

        return {
            // Weight & Stats
            openWeightPicker,
            openStepsGoalPicker,
            openDeficitPicker,

            // Water
            addWater,
            removeWater,
            runWaterAnimation,

            // Household
            openHouseholdPicker,

            // Grams editing
            openEditGramsModal,
            confirmEditGramsModal,
            cancelEditGramsModal,

            // Training
            updateTraining,
            openTrainingPicker
        };
    }

    // Export module
    HEYS.dayDayHandlers = {
        createDayHandlers
    };

})(window);

