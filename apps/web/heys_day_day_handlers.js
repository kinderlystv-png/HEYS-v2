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
            showConfetti,
            setShowConfetti,
            waterGoal,
            setEditGramsTarget,
            setEditGramsValue,
            setGrams
        } = deps;

        function matchesDateKey(dayData, dateKey) {
            if (!dayData || typeof dayData !== 'object') return false;
            return !dayData.date || !dateKey || String(dayData.date) === String(dateKey);
        }

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
                    return matchesDateKey(v, dateKey) ? v : null;
                }
                // Нет client-scope (редко): unscoped как единственный путь
                const v = typeof lsGet === 'function' ? lsGet('heys_dayv2_' + dateKey, null) : null;
                return matchesDateKey(v, dateKey) ? v : null;
            } catch (_) {
                return null;
            }
        }

        function getLatestDaySnapshot() {
            const baseKey = 'heys_dayv2_' + date;
            const storedDay = typeof lsGet === 'function' ? lsGet(baseKey, null) : null;
            const runtimeDay = typeof HEYS?.Day?.getDay === 'function' ? HEYS.Day.getDay() : null;

            let snapshot = matchesDateKey(day, date) ? day : {};

            if (matchesDateKey(storedDay, date) && (storedDay.updatedAt || 0) > (snapshot.updatedAt || 0)) {
                snapshot = storedDay;
            }

            if (matchesDateKey(runtimeDay, date) && (runtimeDay.updatedAt || 0) >= (snapshot.updatedAt || 0)) {
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
            if (!matchesDateKey(nextDayData, date)) {
                console.warn('[HEYS.dayHandlers] persistDaySnapshotImmediately ABORT: date mismatch', {
                    date,
                    payloadDate: nextDayData.date
                });
                return;
            }

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
                        setDay(prev => {
                            const mutationAt = Math.max(Date.now(), (Number(prev.weightUpdatedAt) || 0) + 1);
                            return { ...prev, weightMorning: newWeight, weightUpdatedAt: mutationAt, updatedAt: mutationAt };
                        });
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
                        setDay(prev => {
                            const mutationAt = Math.max(Date.now(), (Number(prev.deficitUpdatedAt) || 0) + 1);
                            return { ...prev, deficitPct: deficitValue, deficitUpdatedAt: mutationAt, updatedAt: mutationAt };
                        });
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
                    playSound: optionsOrSkipScroll.playSound !== false
                };
            }

            return {
                skipScroll: !!optionsOrSkipScroll,
                source: 'water-action',
                sourceEl: null,
                playSound: true
            };
        }

        function ensureSharedWaterFeedback() {
            HEYS.waterFeedback = HEYS.waterFeedback || {};

            if (typeof HEYS.waterFeedback.playAddFeedback !== 'function') {
                // Канвас water-add v4: ответ на жест живёт там же, где результат.
                // Плитка «Вода» видна — анимирует себя сама (ветка В₃, капля и
                // круг внутри плитки). Не видна — слева от кнопки выезжает
                // мерный столбик. Полноэкранной заливки, летящей капли и бейджа
                // «+250 мл» больше нет: это язык другого жанра.
                const WATER_TILE_VISIBLE_RATIO = 0.5;
                const WATER_COLUMN_HOLD_MS = 1400;
                const WATER_COLUMN_OUT_MS = 160;
                const WATER_VOL_CHIP_MS = 180;

                let volumeChipsOpen = false;
                let volumeChipsDeferUntil = 0;
                let pendingColumnDetail = null;
                let volumeChipsCloseTimer = 0;

                function isVolumeChipsBlockingColumn() {
                    return volumeChipsOpen || Date.now() < volumeChipsDeferUntil;
                }

                function flushPendingColumn() {
                    if (isVolumeChipsBlockingColumn() || !pendingColumnDetail) return;
                    if (waterTileIsVisible()) {
                        pendingColumnDetail = null;
                        return;
                    }
                    const detail = pendingColumnDetail;
                    pendingColumnDetail = null;
                    showWaterColumn(detail);
                }

                function waterTileIsVisible() {
                    const cards = document.querySelectorAll('.widget--water');
                    if (!cards.length) return false;
                    const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
                    for (let i = 0; i < cards.length; i++) {
                        const card = cards[i];
                        if (!card || typeof card.getBoundingClientRect !== 'function') continue;
                        const rect = card.getBoundingClientRect();
                        if (!rect.height) continue;
                        const visible = Math.min(rect.bottom, viewportH) - Math.max(rect.top, 0);
                        if (visible / rect.height >= WATER_TILE_VISIBLE_RATIO) return true;
                    }
                    return false;
                }

                /** Якорь столбика: плитка на Главной → сама; иначе видимая кнопка «+». */
                function resolveWaterColumnAnchor() {
                    if (waterTileIsVisible()) return null;
                    const wraps = document.querySelectorAll('.widgets-quick-fab-wrap');
                    for (let i = 0; i < wraps.length; i++) {
                        const wrap = wraps[i];
                        if (wrap.getAttribute('aria-hidden') === 'true') continue;
                        const fab = wrap.querySelector('.widgets-quick-fab');
                        if (!fab) continue;
                        const rect = fab.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) return fab;
                    }
                    return null;
                }

                function formatWaterLiters(ml) {
                    return ((Number(ml) || 0) / 1000).toFixed(1).replace('.', ',');
                }

                function ensureWaterColumn(anchorEl) {
                    let col = document.getElementById('heys-water-column');
                    if (col) return col;
                    col = document.createElement('div');
                    col.id = 'heys-water-column';
                    // animate-always: столбик живёт в body, вне .widgets-grid, и
                    // без этого класса общий reduce-motion гасит ему длительности
                    // в ноль — как когда-то кольцам БЖУ и динамике веса. Он не
                    // украшение, а единственный ответ на жест вне Главной;
                    // собственную reduce-ветку (160 мс) он держит сам.
                    col.className = 'water-column animate-always';
                    col.setAttribute('aria-hidden', 'true');
                    col.innerHTML = '<span class="water-column__text">'
                        + '<span class="water-column__delta"></span>'
                        + '<span class="water-column__total"></span>'
                        + '<span class="water-column__target"></span>'
                        + '</span>'
                        + '<span class="water-column__bar">'
                        + '<span class="water-column__fill"></span></span>';
                    document.body.appendChild(col);
                    return col;
                }

                function showWaterColumn(detail) {
                    const anchor = resolveWaterColumnAnchor();
                    if (!anchor) return;
                    const rect = anchor.getBoundingClientRect();
                    if (!rect || (!rect.width && !rect.height)) return;

                    const target = Number(detail.targetMl)
                        || Number(HEYS.Widgets?.data?.getWaterData?.()?.target)
                        || 2000;
                    const total = Number(detail.total) || 0;
                    const pct = target > 0 ? Math.max(0, Math.min(100, (total / target) * 100)) : 0;

                    const col = ensureWaterColumn(anchor);
                    // Столбик не кнопка: касание проходит насквозь к тому, что под ним.
                    col.style.top = Math.round(rect.top + rect.height / 2) + 'px';
                    col.style.right = Math.round(window.innerWidth - rect.left + 10) + 'px';
                    col.style.left = '';
                    const deltaMl = Number(detail.ml) || 0;
                    col.querySelector('.water-column__delta').textContent = deltaMl < 0
                        ? '−' + Math.abs(deltaMl) + ' мл'
                        : '+' + deltaMl + ' мл';
                    col.querySelector('.water-column__total').textContent = formatWaterLiters(total) + ' л';
                    col.querySelector('.water-column__target').textContent = 'из ' + formatWaterLiters(target);
                    col.querySelector('.water-column__fill').style.height = pct + '%';

                    // Частые тапы не выводят второй столбик: он остаётся на месте,
                    // числа обновляются, таймер ухода перезапускается.
                    if (col._hideTimer) clearTimeout(col._hideTimer);
                    if (col._removeTimer) clearTimeout(col._removeTimer);
                    col.classList.remove('is-leaving');
                    requestAnimationFrame(() => col.classList.add('is-in'));
                    col._hideTimer = setTimeout(() => {
                        col.classList.add('is-leaving');
                        col._removeTimer = setTimeout(() => {
                            col.classList.remove('is-in', 'is-leaving');
                        }, WATER_COLUMN_OUT_MS);
                    }, WATER_COLUMN_HOLD_MS);
                }

                function waterCardIsVisible() {
                    const card = document.getElementById('water-card');
                    if (!card || typeof card.getBoundingClientRect !== 'function') return false;
                    const rect = card.getBoundingClientRect();
                    if (!rect.width || !rect.height) return false;
                    const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
                    const visible = Math.min(rect.bottom, viewportH) - Math.max(rect.top, 0);
                    return visible / rect.height >= WATER_TILE_VISIBLE_RATIO;
                }

                HEYS.waterFeedback.isTileVisible = waterTileIsVisible;
                HEYS.waterFeedback.isCardVisible = waterCardIsVisible;
                HEYS.waterFeedback.setVolumeChipsOpen = function setVolumeChipsOpen(open) {
                    volumeChipsOpen = !!open;
                    if (!open) flushPendingColumn();
                };
                HEYS.waterFeedback.markVolumeChipsClosing = function markVolumeChipsClosing(ms) {
                    const delay = Number(ms) || WATER_VOL_CHIP_MS;
                    volumeChipsOpen = false;
                    volumeChipsDeferUntil = Date.now() + delay;
                    if (volumeChipsCloseTimer) clearTimeout(volumeChipsCloseTimer);
                    volumeChipsCloseTimer = setTimeout(() => {
                        volumeChipsDeferUntil = 0;
                        volumeChipsCloseTimer = 0;
                        flushPendingColumn();
                    }, delay);
                };
                HEYS.waterFeedback.playAddFeedback = function playAddFeedback(detail) {
                    if (!detail || detail.ml == null || detail.ml === 0) return;
                    const isRemove = detail.ml < 0;
                    if (!isRemove) {
                        const playSound = () => {
                            // Отклик глотка целиком — через единственную политику:
                            // 10 мс (water-add «вибрация 10 мс на каждый глоток») и
                            // капля со своим переключателем. Прежде вибрации тут не
                            // было вовсе (`haptic: false`), а образец воды в модуле
                            // был тройным — 18/80/18.
                            if (detail.playSound !== false) {
                                HEYS.feedback?.emit?.('water.sip');
                            }
                        };
                        // Звук ждёт касания поверхности: при анимации плитки — 240 мс,
                        // при столбике и при reduced-motion — сразу (капли нет, ждать
                        // нечего; water-add «момент»). Подъём уровня — функциональный
                        // ярус и не гасится (docs/implementation/MOTION_POLICY.md).
                        const reducedMotion = (() => {
                            try {
                                if (HEYS.motionPolicy?.prefersReducedMotion) {
                                    return HEYS.motionPolicy.prefersReducedMotion();
                                }
                                return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
                            } catch (_error) {
                                return false;
                            }
                        })();
                        if (waterTileIsVisible() && !reducedMotion) {
                            setTimeout(playSound, 240);
                        } else {
                            playSound();
                        }
                    }
                    if (waterTileIsVisible() || waterCardIsVisible()) return;
                    if (isVolumeChipsBlockingColumn()) {
                        pendingColumnDetail = detail;
                        return;
                    }
                    showWaterColumn(detail);
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
         * Пишет глоток (или убавление) в журнал воды дня.
         *
         * Журнал — источник правды по воде: записи { id, ml, ts } сливаются
         * между устройствами по id, поэтому два глотка с двух устройств
         * складываются, а не превращаются в максимум двух чисел. waterMl
         * остаётся производным полем и всегда равен сумме журнала.
         *
         * Общие чистые помощники живут в heys_sync_merge_v1.js (HEYS.sync):
         * тот же код считает журнал и на слиянии, в том числе на сервере.
         * Если модуль ещё не поднялся — возвращаем null, и вызывающий считает
         * воду прежней арифметикой по числу. Хуже прежнего не станет.
         *
         * @returns {{waterEntries: Array, waterMl: number}|null}
         */
        function applyWaterJournalDelta(liveDay, ml, ts) {
            const append = HEYS.sync && HEYS.sync.appendWaterEntry;
            if (typeof append !== 'function') return null;
            try {
                return append(liveDay, ml, { ts });
            } catch (_error) {
                return null;
            }
        }

        /**
         * Push/shortcut entry: scroll to the water card without recording a sip.
         * Контракт water-add «уведомления и точки входа»: из уведомления глоток не пишется.
         */
        function focusWater() {
            const waterCardEl = document.getElementById('water-card');
            if (waterCardEl) {
                waterCardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        /**
         * Add water with animation
         * @param {number} ml - Milliliters to add
         * @param {boolean} skipScroll - Skip scroll to water card
         */
        function addWater(ml, optionsOrSkipScroll = false) {
            const options = normalizeAddWaterOptions(optionsOrSkipScroll);

            // 🔒 Read-only gating
            if (!HEYS.Paywall?.canWriteSync?.()) {
                HEYS.Paywall?.showBlockedToast?.('Добавление воды недоступно');
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
         * 🚀 PERF R10: DOM-based update — bypass React re-render entirely.
         * R9 showed animation setState alone costs ~426ms because ANY state change
         * triggers full DayTab re-render (2013-line monolith, ~30 useState).
         * Карточка воды обновляется напрямую через HEYS.dayWater.applyOptimistic,
         * React-состояние дня едет следом обычным setDay.
         */
        function runWaterAnimation(ml, options = {}) {
            const liveDay = getLatestDaySnapshot();
            const prevWater = liveDay.waterMl || 0;
            const newUpdatedAt = Math.max(Date.now(), (Number(liveDay.waterUpdatedAt) || 0) + 1);
            const journal = applyWaterJournalDelta(liveDay, ml, newUpdatedAt);
            const newWater = journal ? journal.waterMl : prevWater + ml;
            const hitGoal = waterGoal && newWater >= waterGoal && prevWater < waterGoal;
            const blockUntil = newUpdatedAt + 3000;
            const nextDaySnapshot = {
                ...liveDay,
                date,
                waterMl: newWater,
                ...(journal ? { waterEntries: journal.waterEntries } : null),
                lastWaterTime: newUpdatedAt,
                waterUpdatedAt: newUpdatedAt,
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
                ...(journal ? { waterEntries: journal.waterEntries } : null),
                lastWaterTime: newUpdatedAt,
                waterUpdatedAt: newUpdatedAt,
                updatedAt: newUpdatedAt
            }));

            // DOM-based visual update (no React state = no re-render):
            // карточка отвечает сама, когда она перед глазами (контракт 52).
            HEYS.dayWater?.applyOptimistic?.(document.getElementById('water-card'), newWater, waterGoal);

            scheduleDayFlush();

            haptic('light');
            if (hitGoal) haptic('success');

            // 🎮 XP: Dispatch для gamification
            const waterDetail = {
                ml,
                total: newWater,
                // Ключ дня, к которому относится действие (YYYY-MM-DD): гейт
                // геймификации на прошлый день смотрит именно сюда.
                date,
                source: options.source || 'day-water',
                sourceEl: options.sourceEl || null,
                playSound: options.playSound !== false,
                targetMl: Number(HEYS.Widgets?.data?.getWaterData?.()?.target) || 0
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
            // 🔒 Read-only gating — тот же гейт, что у addWater: убавление
            // тоже меняет данные дня (контракт nutrition-tab, «убрать воду»).
            if (!HEYS.Paywall?.canWriteSync?.()) {
                HEYS.Paywall?.showBlockedToast?.('Изменение воды недоступно');
                return;
            }

            const liveDay = getLatestDaySnapshot();
            const newUpdatedAt = Math.max(Date.now(), (Number(liveDay.waterUpdatedAt) || 0) + 1);
            // Убавление — такая же запись журнала, только с отрицательным ml.
            // Записи не удаляются: удалённую запись при слиянии не отличить от
            // «её нет на этом устройстве», а на старом дне удалять нечего.
            const journal = applyWaterJournalDelta(liveDay, -ml, newUpdatedAt);
            const newWater = journal ? journal.waterMl : Math.max(0, (liveDay.waterMl || 0) - ml);

            if (typeof HEYS?.Day?.setBlockCloudUpdates === 'function') {
                HEYS.Day.setBlockCloudUpdates(newUpdatedAt + 3000);
            }

            persistDaySnapshotImmediately({
                ...liveDay,
                date,
                waterMl: newWater,
                ...(journal ? { waterEntries: journal.waterEntries } : null),
                waterUpdatedAt: newUpdatedAt,
                updatedAt: newUpdatedAt
            });

            HEYS.dayWater?.applyOptimistic?.(document.getElementById('water-card'), newWater, waterGoal);

            setDay(prev => ({
                ...prev,
                waterMl: newWater,
                ...(journal ? { waterEntries: journal.waterEntries } : null),
                waterUpdatedAt: newUpdatedAt,
                updatedAt: newUpdatedAt
            }));

            scheduleDayFlush();

            haptic('light');

            const waterDetail = {
                ml: -ml,
                total: newWater,
                // Ключ дня, к которому относится действие (YYYY-MM-DD): гейт
                // геймификации на прошлый день смотрит именно сюда.
                date,
                source: 'day-water-remove',
                playSound: false,
                targetMl: Number(HEYS.Widgets?.data?.getWaterData?.()?.target) || 0
            };
            window.dispatchEvent(new CustomEvent('heysWaterAdded', { detail: waterDetail }));
            window.dispatchEvent(new CustomEvent('heys:day-updated', {
                detail: {
                    date,
                    dayData: {
                        ...liveDay,
                        waterMl: newWater,
                        ...(journal ? { waterEntries: journal.waterEntries } : null),
                        waterUpdatedAt: newUpdatedAt,
                        updatedAt: newUpdatedAt
                    },
                    source: 'water-remove'
                }
            }));
            if (typeof HEYS.events?.emit === 'function') {
                HEYS.events.emit('water:added', { ml: -ml, total: newWater });
            }
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
                            householdUpdatedAt: savedDay.householdUpdatedAt || prev.householdUpdatedAt,
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
            focusWater,
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
