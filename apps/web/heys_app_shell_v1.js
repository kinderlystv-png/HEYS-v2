// heys_app_shell_v1.js — App header + navigation shell

// ═══════════════════════════════════════════════════════════════════
// BULLETPROOF advice tab click — document-level capture listener.
// ВНЕ React-IIFE специально: shell module делает `if (!React) return;` на
// раннем загрузе, и если React ещё не загружен — всё внутри IIFE skip'ается.
// Этот listener не зависит от React, должен зарегистрироваться при первом
// исполнении скрипта. Идемпотентен через флаг на window.
// ═══════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined' && window.document && !window.__heysAdviceTabCaptureInstalled) {
    window.__heysAdviceTabCaptureInstalled = true;
    window.document.addEventListener('click', function _heysAdviceTabCapture(e) {
        try {
            if (!e || !e.target || typeof e.target.closest !== 'function') return;
            const adviceTab = e.target.closest('.tab.tab-advice');
            if (!adviceTab) return;
            if (adviceTab.classList.contains('tab--disabled-home')) return;
            console.error('[advice-tab] module-level capture click fired, dispatching heysShowAdvice');
            setTimeout(function _heysShowAdviceDispatch() {
                try {
                    // Bypass: вызвать handler напрямую если он зарегистрирован
                    // через useAdviceState. Это надёжнее чем event dispatch
                    // потому что event listener иногда не attached в курaторе.
                    if (typeof window.__heysShowAdviceHandler === 'function') {
                        try {
                            console.error('[advice-tab] direct-call window.__heysShowAdviceHandler()');
                            window.__heysShowAdviceHandler();
                        } catch (directErr) {
                            console.error('[advice-tab] direct-call failed:', directErr && directErr.message);
                        }
                    } else {
                        console.error('[advice-tab] no __heysShowAdviceHandler, falling back to event dispatch');
                    }
                    // Также dispatch event на случай если есть другие слушатели.
                    window.dispatchEvent(new CustomEvent('heysShowAdvice'));
                } catch (errDispatch) {
                    console.error('[advice-tab] dispatch failed:', errDispatch && errDispatch.message);
                }
            }, 0);
        } catch (err) {
            console.error('[advice-tab] module-level handler error:', err && err.message);
        }
    }, true);
    console.error('[advice-tab] module-level capture listener INSTALLED at script load');
}

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;
    const U = HEYS.utils || {};

    HEYS.debug = HEYS.debug || {};
    HEYS.perf = HEYS.perf || {};
    const HEYS_PROFILER_RING = [];
    const HEYS_PROFILER_RING_MAX = 80;
    const HEYS_SLOW_COMMIT_SOURCE_STATS = {};
    let _heysProfilerLogTimer = null;
    let _heysProfilerBootLogged = false;

    const __HEYS_RP = (window.__HEYS_REACT_PROFILER__ = window.__HEYS_REACT_PROFILER__ || {
        onRenderCalls: 0,
        lastOnRenderAt: 0,
        wrappedIds: [],
        recordWrap(id) {
            const s = String(id || '');
            if (s && this.wrappedIds.indexOf(s) === -1) this.wrappedIds.push(s);
        },
        reset() {
            this.onRenderCalls = 0;
            this.lastOnRenderAt = 0;
            this.wrappedIds.length = 0;
        }
    });

    function heysReactProfilerFlagRaw() {
        try {
            const u = (typeof window.location !== 'undefined' && window.location && window.location.search)
                ? new URLSearchParams(window.location.search).get('reactProfiler')
                : null;
            if (u === '1' || u === 'true' || u === 'yes') return 'url';
            const ls = window.localStorage.getItem('heys_debug_react_profiler');
            if (ls != null && ls !== '') return ls;
        } catch (_) { /* noop */ }
        return null;
    }

    function heysReactProfilerEnabled() {
        try {
            if (HEYS.debug && HEYS.debug.reactProfiler === true) return true;
            const raw = heysReactProfilerFlagRaw();
            if (raw === 'url') return true;
            const s = String(raw || '').trim().toLowerCase();
            return s === 'true' || s === '1' || s === 'yes' || s === 'on';
        } catch (_) {
            return false;
        }
    }

    function heysProfilerOnRender(id, phase, actualDuration, baseDuration) {
        __HEYS_RP.onRenderCalls += 1;
        __HEYS_RP.lastOnRenderAt = Date.now();
        const ad = +actualDuration || 0;
        HEYS_PROFILER_RING.push({
            id: String(id || '?'),
            phase: String(phase || '?'),
            ms: Math.round(ad * 10) / 10,
            baseMs: Math.round((+baseDuration || 0) * 10) / 10,
            t: Date.now()
        });
        if (HEYS_PROFILER_RING.length > HEYS_PROFILER_RING_MAX) {
            HEYS_PROFILER_RING.splice(0, HEYS_PROFILER_RING.length - HEYS_PROFILER_RING_MAX);
        }
        if (_heysProfilerLogTimer) return;
        _heysProfilerLogTimer = setTimeout(() => {
            _heysProfilerLogTimer = null;
            const recent = HEYS_PROFILER_RING.slice(-40);
            const slow = recent.filter((r) => r.ms >= 8).sort((a, b) => b.ms - a.ms);
            if (slow.length) {
                console.info('[HEYS.sync] perf react-profiler slow commits (batched)', slow.slice(0, 14));
            }
        }, 450);
    }

    function heysSlowCommitThresholdMs() {
        try {
            const v = parseInt(window.localStorage.getItem('heys_debug_slow_commit_ms'), 10);
            return v > 0 ? v : 48;
        } catch (_) {
            return 48;
        }
    }

    function recordSlowCommitSource(id, ms, hint) {
        const tag = String(hint?.tag || 'unknown');
        const stat = HEYS_SLOW_COMMIT_SOURCE_STATS[tag] || {
            tag,
            hits: 0,
            maxMs: 0,
            sumMs: 0,
            lastAt: 0,
            tabs: {}
        };
        stat.hits += 1;
        stat.sumMs += ms;
        stat.maxMs = Math.max(stat.maxMs, ms);
        stat.lastAt = Date.now();
        const tab = String(id || '?');
        stat.tabs[tab] = (stat.tabs[tab] || 0) + 1;
        HEYS_SLOW_COMMIT_SOURCE_STATS[tag] = stat;
    }

    /** Измеряет время коммита поддерева (render → layout). Не зависит от React.Profiler.onRender — в некоторых сборках Profiler не вызывает колбэк. */
    function HeysReactSubtreeProbe(props) {
        const id = props.id;
        const children = props.children;
        const t0 = performance.now();
        React.useLayoutEffect(function () {
            const ms = performance.now() - t0;
            heysProfilerOnRender(String(id || '?'), 'commit-probe', ms, ms);
            const perf = HEYS.perf;
            if (perf && typeof perf.commitTraceEnabled === 'function' && perf.commitTraceEnabled()
                && ms >= heysSlowCommitThresholdMs()) {
                let hint = null;
                try {
                    hint = window.__HEYS_COMMIT_HINT__;
                } catch (_) { /* noop */ }
                recordSlowCommitSource(id, ms, hint);
                console.warn('[HEYS.sync] perf slow tab commit', {
                    tab: String(id || '?'),
                    ms: Math.round(ms * 10) / 10,
                    thresholdMs: heysSlowCommitThresholdMs(),
                    hint
                });
                try {
                    window.__HEYS_COMMIT_HINT__ = null;
                } catch (_) { /* noop */ }
            }
        });
        return children;
    }
    HeysReactSubtreeProbe.displayName = 'HeysReactSubtreeProbe';

    function dumpReactProfilerRingImpl(n) {
        const k = Math.min(Math.max((n | 0) || 40, 1), HEYS_PROFILER_RING_MAX);
        const slice = HEYS_PROFILER_RING.slice(-k);
        if (!slice.length) {
            console.warn('[HEYS.sync] perf react-profiler ring empty', {
                hint: 'Включите: localStorage.setItem("heys_debug_react_profiler","true") или ?reactProfiler=1 в URL, затем полный reload.',
                enabled: heysReactProfilerEnabled(),
                rawFlag: heysReactProfilerFlagRaw(),
                hasReactProfiler: !!React.Profiler,
                hasCommitProbe: typeof React.useLayoutEffect === 'function',
                sawBootLog: !!_heysProfilerBootLogged,
                wrappedIds: __HEYS_RP.wrappedIds.slice(),
                onRenderCalls: __HEYS_RP.onRenderCalls
            });
            return slice;
        }
        console.table(slice);
        return slice;
    }

    HEYS.debug.dumpReactProfilerRing = dumpReactProfilerRingImpl;
    HEYS.perf.dumpReactProfilerRing = dumpReactProfilerRingImpl;
    HEYS.perf.getSlowCommitSourceStats = function getSlowCommitSourceStats(limit) {
        const top = Object.values(HEYS_SLOW_COMMIT_SOURCE_STATS)
            .sort((a, b) => (b.sumMs - a.sumMs) || (b.hits - a.hits))
            .slice(0, Math.max((limit | 0) || 10, 1))
            .map((s) => ({
                tag: s.tag,
                hits: s.hits,
                avgMs: Math.round((s.sumMs / Math.max(s.hits, 1)) * 10) / 10,
                maxMs: Math.round(s.maxMs * 10) / 10,
                lastAt: s.lastAt,
                tabs: s.tabs
            }));
        console.table(top);
        return top;
    };
    HEYS.perf.clearSlowCommitSourceStats = function clearSlowCommitSourceStats() {
        Object.keys(HEYS_SLOW_COMMIT_SOURCE_STATS).forEach((k) => delete HEYS_SLOW_COMMIT_SOURCE_STATS[k]);
    };

    HEYS.debug.reactProfilerStatus = function reactProfilerStatus() {
        const st = {
            flagLs: (() => { try { return window.localStorage.getItem('heys_debug_react_profiler'); } catch (_) { return null; } })(),
            flagRaw: heysReactProfilerFlagRaw(),
            flagDebug: !!(HEYS.debug && HEYS.debug.reactProfiler === true),
            enabled: heysReactProfilerEnabled(),
            hasReactProfiler: !!React.Profiler,
            usesCommitProbe: true,
            commitTrace: !!(HEYS.perf && typeof HEYS.perf.commitTraceEnabled === 'function' && HEYS.perf.commitTraceEnabled()),
            slowCommitThresholdMs: (typeof heysSlowCommitThresholdMs === 'function' ? heysSlowCommitThresholdMs() : 48),
            ringLen: HEYS_PROFILER_RING.length,
            sawBootLog: !!_heysProfilerBootLogged,
            wrappedIds: __HEYS_RP.wrappedIds.slice(),
            onRenderCalls: __HEYS_RP.onRenderCalls,
            lastOnRenderAt: __HEYS_RP.lastOnRenderAt
        };
        st.slowCommitSources = Object.keys(HEYS_SLOW_COMMIT_SOURCE_STATS).length;
        console.info('[HEYS.sync] perf react-profiler status', st);
        return st;
    };
    HEYS.perf.reactProfilerStatus = HEYS.debug.reactProfilerStatus;

    let _heysProfilerMissingLogged = false;
    function wrapReactProfiler(id, node) {
        if (!node) return node;
        if (!heysReactProfilerEnabled()) return node;
        if (typeof React.useLayoutEffect !== 'function') {
            if (!_heysProfilerMissingLogged) {
                _heysProfilerMissingLogged = true;
                console.warn('[HEYS.sync] perf react-profiler: React.useLayoutEffect недоступен — сбор метрик невозможен.');
            }
            return node;
        }
        __HEYS_RP.recordWrap(id);
        if (!_heysProfilerBootLogged) {
            _heysProfilerBootLogged = true;
            console.info('[HEYS.sync] perf react-profiler: включено (commit-probe через useLayoutEffect). ' +
                'Медленные коммиты: console.warn «[HEYS.sync] perf slow tab commit» + hint. ' +
                'HOT: «[HEYS.sync] perf hot-sync finished» при heys_debug_commit_trace / react_profiler. ' +
                'dump: HEYS.perf.dumpReactProfilerRing(50) · status: HEYS.perf.reactProfilerStatus() · top sources: HEYS.perf.getSlowCommitSourceStats(10)');
        }
        return React.createElement(HeysReactSubtreeProbe, { id: String(id) }, node);
    }

    const tryParseStoredValue = (raw, fallback) => {
        if (raw === null || raw === undefined) return fallback;
        if (typeof raw === 'string') {
            let str = raw;
            if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
                try { str = HEYS.store.decompress(str); } catch (_) { }
            }
            try { return JSON.parse(str); } catch (_) { return str; }
        }
        return raw;
    };

    const readGlobalValue = (key, fallback) => {
        try {
            if (HEYS.store?.get) {
                const stored = HEYS.store.get(key, null);
                if (stored !== null && stored !== undefined) {
                    return tryParseStoredValue(stored, fallback);
                }
            }
            const raw = localStorage.getItem(key);
            if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, fallback);
            if (U.lsGet) return U.lsGet(key, fallback);
            return fallback;
        } catch {
            return fallback;
        }
    };

    const writeGlobalValue = (key, value) => {
        try {
            if (HEYS.store?.set) {
                HEYS.store.set(key, value);
                return;
            }
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, serialized);
        } catch { }
    };

    const removeGlobalValue = (key) => {
        try {
            if (HEYS.store?.set) HEYS.store.set(key, null);
        } catch { }
        try { localStorage.removeItem(key); } catch { }
    };

    // ── Leaderboard helpers (delegated to HEYS.LeaderboardSection) ──

    function getClientCEB(clientId, dateStr, options) {
        var lbs = HEYS.LeaderboardSection;
        return lbs && lbs.getClientCEB ? lbs.getClientCEB(clientId, dateStr, options) : null;
    }

    function normalizeWeekDates(weekDates, fallbackDateStr) {
        var lbs = HEYS.LeaderboardSection;
        return lbs && lbs.normalizeWeekDates ? lbs.normalizeWeekDates(weekDates, fallbackDateStr) : [];
    }

    function renderLeaderboardSection(weeklyData, options) {
        var lbs = HEYS.LeaderboardSection;
        return lbs && lbs.render ? lbs.render(weeklyData, options) : null;
    }

    function getClientCEBFromCompetitionData(clientId, dateStr, competitionData, options) {
        var lbs = HEYS.LeaderboardSection;
        return lbs && lbs.getClientCEBFromCompetitionData
            ? lbs.getClientCEBFromCompetitionData(clientId, dateStr, competitionData, options)
            : null;
    }

    function extractCompetitionDataFromKVRows(rows) {
        var lbs = HEYS.LeaderboardSection;
        return lbs && lbs.extractCompetitionDataFromKVRows
            ? lbs.extractCompetitionDataFromKVRows(rows)
            : { daysByDate: {}, profile: {} };
    }

    function shiftISODate(dateStr, delta) {
        if (!dateStr) return '';
        var base = new Date(dateStr + 'T12:00:00');
        if (Number.isNaN(base.getTime())) return '';
        base.setDate(base.getDate() + Number(delta || 0));
        return base.getFullYear() + '-' + String(base.getMonth() + 1).padStart(2, '0') + '-' + String(base.getDate()).padStart(2, '0');
    }

    const CURATOR_COMPETITION_CACHE_TTL_MS = 2 * 60 * 1000;

    function AppHeader(props) {
        const {
            clientId,
            tab,
            selectedDate,
            setSelectedDate,
            todayISO,
            datePickerActiveDays,
            products,
            cachedProfile,
            currentClientName,
            getAvatarColor,
            getClientInitials,
            getClientStats,
            formatLastActive,
            clients,
            clientIdValue,
            setClientId,
            showClientDropdown,
            setShowClientDropdown,
            isRpcMode,
            cloudUser,
            handleSignOut,
            U,
            cloudStatus,
            syncProgress,
            pendingCount,
            pendingDetails,
            pendingText,
            pendingActionItems,
            showPendingSyncBanner,
            retryCountdown,
            GamificationBar,
            setTab,
            setActiveTab,
        } = props;

        // 🚨 EWS Badge State (v1.0)
        const [ewsData, setEWSData] = React.useState(null);

        // 🔔 Push notifications badge — статус подписки и permission.
        // null = ещё не загрузили, { subscribed, permission, capable, needsInstall, busy }
        const [pushStatus, setPushStatus] = React.useState(null);
        const [pushBusy, setPushBusy] = React.useState(false);
        React.useEffect(() => {
            if (!window.HEYS?.push) return;
            // Синхронная проверка capable — показываем бейдж сразу, не ждём SW.ready
            const capable = window.HEYS.push.isCapable();
            if (capable) {
                const ios = window.HEYS.push.isIosSafari?.() ?? false;
                const standalone = window.HEYS.push.isStandalone?.() ?? false;
                setPushStatus({
                    capable: true,
                    subscribed: false,
                    permission: 'Notification' in window ? Notification.permission : 'unsupported',
                    needsInstall: ios && !standalone,
                    ios,
                    standalone,
                });
            }
            let cancelled = false;
            const refresh = async () => {
                try {
                    const s = await window.HEYS.push.getStatus();
                    if (!cancelled) setPushStatus(s);
                } catch { /* ignore */ }
            };
            void refresh();
            // Перепроверять при возврате фокуса (юзер мог изменить permission в браузере)
            const onFocus = () => { void refresh(); };
            window.addEventListener('focus', onFocus);
            return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
        }, []);
        const handlePushBadgeClick = async () => {
            if (!window.HEYS?.push) return;
            if (pushStatus?.subscribed) {
                // Уже включено — переходим на вкладку Профиль и скроллим к секции уведомлений
                if (typeof haptic === 'function') haptic('light');
                switchTabWithUndoCommit('user', 'push-settings-badge');
                setTimeout(() => window.dispatchEvent(new CustomEvent('heys:scroll-to-push-settings')), 80);
                return;
            }
            if (pushStatus?.permission === 'denied') {
                alert('Уведомления заблокированы в браузере. Разблокируй их в настройках сайта (значок замка рядом с адресом).');
                return;
            }
            if (pushStatus?.needsInstall) {
                alert('На iPhone уведомления работают только из установленного приложения. Поделиться → На экран Домой, потом запусти HEYS с домашнего экрана.');
                return;
            }
            if (!pushStatus?.capable) return;
            setPushBusy(true);
            try {
                const r = await window.HEYS.push.subscribe();
                if (r && r.ok === false && r.reason === 'permission_denied') {
                    alert('Без разрешения уведомления не работают. Можно включить позже из этого окна.');
                }
                const s = await window.HEYS.push.getStatus();
                setPushStatus(s);
            } catch (e) {
                console.warn('[push.badge] subscribe failed:', e?.message);
            } finally {
                setPushBusy(false);
            }
        };
        const clientDropdownAnchorRef = React.useRef(null);
        const [clientDropdownMaxHeight, setClientDropdownMaxHeight] = React.useState(320);
        const [clientDropdownWidth, setClientDropdownWidth] = React.useState(360);
        const [clientDropdownLeft, setClientDropdownLeft] = React.useState(-8);
        const [curatorCompetitionCache, setCuratorCompetitionCache] = React.useState({});
        const [curatorCompetitionLoading, setCuratorCompetitionLoading] = React.useState(false);
        const [weeklyLeaderboardLoading, setWeeklyLeaderboardLoading] = React.useState(false);
        const [leaderboardOpenSkeleton, setLeaderboardOpenSkeleton] = React.useState(false);
        const [leaderboardRefreshTick, bumpLeaderboardRefreshTick] = React.useReducer(function (value) {
            return value + 1;
        }, 0);
        const leaderboardRefreshRafRef = React.useRef(0);

        // 💬 Messenger inbox (curator-only): unread + preview per client.
        // Refresh on mount → каждые 30s + при heys:client-changed.
        const [messengerInbox, setMessengerInbox] = React.useState({});
        React.useEffect(() => {
            if (isRpcMode) return; // только для куратора
            let cancelled = false;
            let timer = null;
            const refresh = async () => {
                try {
                    const res = await window.HEYS?.MessengerAPI?.getInbox?.();
                    if (cancelled) return;
                    if (res?.success && Array.isArray(res.inbox)) {
                        const map = {};
                        for (const entry of res.inbox) {
                            if (entry?.client_id) map[entry.client_id] = entry;
                        }
                        setMessengerInbox(map);
                    }
                } catch { /* ignore */ }
            };
            void refresh();
            timer = setInterval(refresh, 30000);
            const onClientChanged = () => { void refresh(); };
            window.addEventListener('heys:client-changed', onClientChanged);
            return () => {
                cancelled = true;
                if (timer) clearInterval(timer);
                window.removeEventListener('heys:client-changed', onClientChanged);
            };
        }, [isRpcMode]);
        const totalUnread = React.useMemo(() => {
            return Object.values(messengerInbox).reduce((s, v) => s + (v?.unread_count || 0), 0);
        }, [messengerInbox]);
        // ☁️ Cloud Sync Badge State (v2.0): auto-fade synced→idle, lastSyncedAt tracking
        const [displayStatus, setDisplayStatus] = React.useState(cloudStatus);
        const lastSyncedAtRef = React.useRef(null);
        const syncFadeTimerRef = React.useRef(null);

        React.useEffect(() => {
            if (!showClientDropdown) return;

            const updateClientDropdownHeight = () => {
                try {
                    const anchorRect = clientDropdownAnchorRef.current?.getBoundingClientRect?.();
                    const headerRect = document.querySelector('.hdr')?.getBoundingClientRect?.();
                    const tabsRect = document.querySelector('.tabs')?.getBoundingClientRect?.();
                    const viewportHeight = window.visualViewport?.height || window.innerHeight || 800;
                    const viewportWidth = window.visualViewport?.width || window.innerWidth || 390;

                    const dropdownTop = (anchorRect?.bottom || 120) + 8;
                    const contentTop = Math.max(0, Math.floor(headerRect?.bottom || ((anchorRect?.bottom || 120) + 4)));
                    const tabsTop = Math.min(viewportHeight, Math.floor(tabsRect?.top || (viewportHeight - 68)));
                    const tabsHeight = Math.max(56, Math.ceil(tabsRect?.height || 0));
                    const backdropHeight = Math.max(0, tabsTop - contentTop);
                    const bottomGapAboveMenu = tabsHeight + 12;
                    const calculatedMaxHeight = Math.floor(viewportHeight - dropdownTop - bottomGapAboveMenu);
                    const clampedMaxHeight = Math.max(220, calculatedMaxHeight);
                    const desiredWidth = Math.min(460, Math.max(300, viewportWidth - 20));
                    const minOffset = 10 - (anchorRect?.left || 0);
                    const maxOffset = viewportWidth - 10 - desiredWidth - (anchorRect?.left || 0);
                    const resolvedLeft = Math.min(Math.max(0, minOffset), maxOffset);

                    setClientDropdownMaxHeight(clampedMaxHeight);
                    setClientDropdownWidth(desiredWidth);
                    setClientDropdownLeft(resolvedLeft);

                    console.info('[HEYS.header.clientDropdown] ✅ Calculated dropdown max height:', {
                        viewportHeight,
                        viewportWidth,
                        dropdownTop,
                        contentTop,
                        tabsTop,
                        tabsHeight,
                        backdropHeight,
                        bottomGapAboveMenu,
                        maxHeight: clampedMaxHeight,
                        dropdownWidth: desiredWidth,
                        dropdownLeft: resolvedLeft,
                        scrollAreaMaxHeight: Math.max(120, clampedMaxHeight - 128),
                        clientsCount: Array.isArray(clients) ? clients.length : 0,
                    });
                } catch (err) {
                    console.warn('[HEYS.header.clientDropdown] ⚠️ Failed to calculate dropdown max height:', err?.message);
                    setClientDropdownMaxHeight(320);
                    setClientDropdownWidth(360);
                    setClientDropdownLeft(-8);
                }
            };

            updateClientDropdownHeight();
            window.addEventListener('resize', updateClientDropdownHeight);
            window.visualViewport?.addEventListener?.('resize', updateClientDropdownHeight);

            return () => {
                window.removeEventListener('resize', updateClientDropdownHeight);
                window.visualViewport?.removeEventListener?.('resize', updateClientDropdownHeight);
            };
        }, [showClientDropdown, clients]);

        // �️ Body-level blur backdrop — imperatively mounted on document.body to escape
        // .hdr's will-change:transform containing block (which traps position:fixed children).
        // Backdrop click-overlay + blur-class on .wrap
        React.useEffect(function () {
            if (!showClientDropdown) return;

            var wrapEl = document.querySelector('.wrap');

            // Transparent click-overlay to close dropdown
            var backdropEl = document.createElement('button');
            backdropEl.type = 'button';
            backdropEl.className = 'client-dropdown-backdrop';
            backdropEl.setAttribute('aria-label', 'Закрыть меню аккаунта');
            backdropEl.addEventListener('click', function () { setShowClientDropdown(false); });

            var container = wrapEl || document.body;
            container.appendChild(backdropEl);

            // Toggle blur class — filter:blur applied via CSS to content/tabs/header children
            if (wrapEl) wrapEl.classList.add('dropdown-blur-active');

            return function () {
                if (wrapEl) wrapEl.classList.remove('dropdown-blur-active');
                if (backdropEl.parentNode) backdropEl.parentNode.removeChild(backdropEl);
            };
        }, [showClientDropdown, setShowClientDropdown]);

        // �🏆 Leaderboard: weekly cloud rankings
        const [weeklyLeaderboard, setWeeklyLeaderboard] = React.useState({ weekDates: [], entries: [] });
        const resolvedTodayISO = typeof todayISO === 'function' ? todayISO() : todayISO;
        const leaderboardData = React.useMemo(() => {
            if (!showClientDropdown) return { weekDates: [], entries: [] };

            var wl = weeklyLeaderboard;
            var weekDates = normalizeWeekDates(wl.weekDates || [], resolvedTodayISO);
            var cloudEntries = wl.entries || [];

            if (isRpcMode) {
                // Build entries from cloud weekly data
                var entries = [];
                for (var ci = 0; ci < cloudEntries.length; ci++) {
                    var cl = cloudEntries[ci];
                    var daily = cl.daily_scores;
                    if (typeof daily === 'string') {
                        try { daily = JSON.parse(daily); } catch (_) { daily = {}; }
                    }

                    // For the current user, merge accurate local CEB for every visible week day.
                    // This makes the weekly overlay immediately reflect cascade/per-date cache
                    // without waiting for cloud backfill round-trip.
                    var isSelf = !!cl.is_self;
                    if (isSelf && weekDates.length > 0) {
                        daily = Object.assign({}, daily || {});
                        for (var wk = 0; wk < weekDates.length; wk++) {
                            var dayIso = weekDates[wk];
                            var ceb = getClientCEB(clientIdValue, dayIso, { isCurrent: dayIso === resolvedTodayISO });
                            if (ceb) {
                                daily[dayIso] = Math.round(ceb.score * 10) / 10;
                            }
                        }
                    }

                    // Recalculate weekly total including live data
                    var total = 0;
                    for (var dk = 0; dk < weekDates.length; dk++) {
                        var sv = daily ? daily[weekDates[dk]] : undefined;
                        if (sv !== undefined && sv !== null) {
                            total += Number(sv);
                        }
                    }
                    var weekTotal = Math.round(total * 10) / 10;

                    entries.push({
                        id: isSelf ? (clientIdValue || '__self') : ('cloud_' + ci),
                        name: cl.display_name || (isSelf ? (currentClientName || 'Вы') : 'Участник'),
                        dailyScores: daily || {},
                        weekTotal: weekTotal,
                        isCurrent: isSelf
                    });
                }

                // If current user not in cloud data, add from live cascade
                var selfInCloud = entries.some(function (e) { return e.isCurrent; });
                if (!selfInCloud && weekDates.length > 0) {
                    var todayD = weekDates[weekDates.length - 1];
                    var liveCeb = getClientCEB(clientIdValue, todayD, { isCurrent: true });
                    if (liveCeb) {
                        var selfDaily = {};
                        selfDaily[todayD] = Math.round(liveCeb.score * 10) / 10;
                        entries.push({
                            id: clientIdValue || '__self',
                            name: currentClientName || 'Вы',
                            dailyScores: selfDaily,
                            weekTotal: Math.round(liveCeb.score * 10) / 10,
                            isCurrent: true
                        });
                    }
                }

                // Sort by weekly total descending
                entries.sort(function (a, b) { return (b.weekTotal || 0) - (a.weekTotal || 0); });
                console.info('[HEYS.leaderboard] 🏆 Weekly computed:', entries.length, 'entries (cloud+local)');
                return { weekDates: weekDates, entries: entries };

            } else if (Array.isArray(clients) && clients.length > 0) {
                // Curator mode: current client stays live from local storage, while other
                // clients are computed from curator-fetched KV cache. Relying on localStorage
                // alone hides everyone except the current client because switchClient()
                // intentionally purges old clients' scoped keys.
                var effectiveDateStr = selectedDate
                    || (typeof todayISO === 'function' ? todayISO() : todayISO)
                    || (HEYS?.utils?.getTodayStr?.())
                    || new Date().toISOString().slice(0, 10);
                var localWeekDates = normalizeWeekDates([], effectiveDateStr);
                var localEntries = [];
                for (var i = 0; i < clients.length; i++) {
                    var c = clients[i];
                    var cachedCompetitionData = curatorCompetitionCache[c.id] || null;
                    var ds = {};
                    var weekTotalLocal = 0;
                    var hasAnyScore = false;
                    for (var lw = 0; lw < localWeekDates.length; lw++) {
                        var localDayIso = localWeekDates[lw];
                        var isCurrentClientDay = c.id === clientIdValue && localDayIso === resolvedTodayISO;
                        var ceb = null;

                        if (c.id === clientIdValue) {
                            ceb = getClientCEB(c.id, localDayIso, {
                                isCurrent: isCurrentClientDay
                            });
                        }

                        if (!ceb && cachedCompetitionData) {
                            ceb = getClientCEBFromCompetitionData(c.id, localDayIso, cachedCompetitionData, {
                                isCurrent: isCurrentClientDay
                            });
                        }

                        if (!ceb) {
                            ceb = getClientCEB(c.id, localDayIso, {
                                isCurrent: isCurrentClientDay
                            });
                        }

                        if (ceb) {
                            var roundedScore = Math.round(ceb.score * 10) / 10;
                            ds[localDayIso] = roundedScore;
                            weekTotalLocal += roundedScore;
                            hasAnyScore = true;
                        }
                    }
                    if (hasAnyScore) {
                        localEntries.push({
                            id: c.id,
                            name: c.name,
                            dailyScores: ds,
                            weekTotal: Math.round(weekTotalLocal * 10) / 10,
                            isCurrent: c.id === clientIdValue
                        });
                    }
                }
                localEntries.sort(function (a, b) { return (b.weekTotal || 0) - (a.weekTotal || 0); });
                return { weekDates: localWeekDates, entries: localEntries };
            }

            return { weekDates: weekDates, entries: [] };
        }, [showClientDropdown, isRpcMode, clientIdValue, currentClientName, clients, selectedDate, resolvedTodayISO, weeklyLeaderboard, curatorCompetitionCache, leaderboardRefreshTick]);

        const leaderboardHasEntries = !!(leaderboardData && Array.isArray(leaderboardData.entries) && leaderboardData.entries.length > 0);
        const leaderboardLoading = showClientDropdown && (isRpcMode ? weeklyLeaderboardLoading : curatorCompetitionLoading);
        const shouldShowLeaderboardSkeleton = showClientDropdown && (
            isRpcMode
                ? (!leaderboardHasEntries && (leaderboardOpenSkeleton || leaderboardLoading))
                : (leaderboardOpenSkeleton || curatorCompetitionLoading)
        );

        React.useEffect(() => {
            if (!showClientDropdown) {
                setLeaderboardOpenSkeleton(false);
                return;
            }

            setLeaderboardOpenSkeleton(true);
            var hideSkeletonId = window.setTimeout(function () {
                setLeaderboardOpenSkeleton(false);
            }, 420);

            return () => {
                window.clearTimeout(hideSkeletonId);
            };
        }, [showClientDropdown, isRpcMode, clientIdValue, selectedDate, resolvedTodayISO]);

        React.useEffect(() => {
            if (!showClientDropdown || !leaderboardHasEntries) return;
            setLeaderboardOpenSkeleton(false);
        }, [showClientDropdown, leaderboardHasEntries]);

        // 🏆 Fetch weekly cloud leaderboard when dropdown opens (RPC mode only)
        React.useEffect(() => {
            if (!showClientDropdown || !isRpcMode) {
                setWeeklyLeaderboardLoading(false);
                return;
            }
            if (!HEYS?.leaderboard?.fetchWeeklyLeaderboard) return;

            var cancelled = false;
            setWeeklyLeaderboardLoading(true);

            HEYS.leaderboard.fetchWeeklyLeaderboard().then(function (result) {
                if (!cancelled && result && result.entries) {
                    setWeeklyLeaderboard(result);
                }
            }).catch(function () { /* graceful fail */ }).finally(function () {
                if (!cancelled) {
                    setWeeklyLeaderboardLoading(false);
                }
            });

            return () => {
                cancelled = true;
            };
        }, [showClientDropdown, isRpcMode]);

        React.useEffect(() => {
            // Combined curator dropdown always renders the competitions block,
            // so other clients' weekly data must warm up as soon as the menu opens.
            if (!showClientDropdown || isRpcMode) return;
            if (!Array.isArray(clients) || clients.length === 0) return;
            if (!HEYS?.YandexAPI?.getAllKVByCurator) return;

            var cancelled = false;
            var effectiveDateStr = selectedDate
                || (typeof todayISO === 'function' ? todayISO() : todayISO)
                || (HEYS?.utils?.getTodayStr?.())
                || new Date().toISOString().slice(0, 10);
            var localWeekDates = normalizeWeekDates([], effectiveDateStr);
            var requestedWeekAnchor = localWeekDates[0] || effectiveDateStr;
            var leaderboardKeys = ['heys_profile'];
            for (var dayOffset = -14; dayOffset < 7; dayOffset++) {
                var shifted = shiftISODate(requestedWeekAnchor, dayOffset);
                if (!shifted) continue;
                leaderboardKeys.push('heys_dayv2_' + shifted);
                leaderboardKeys.push('heys_ceb_d_' + shifted);
            }
            var staleBefore = Date.now() - CURATOR_COMPETITION_CACHE_TTL_MS;
            var clientsToFetch = clients.filter(function (client) {
                if (!client || !client.id) return false;
                if (client.id === clientIdValue) return false;
                var cached = curatorCompetitionCache[client.id];
                return !cached
                    || cached.weekAnchor !== requestedWeekAnchor
                    || !cached.fetchedAt
                    || cached.fetchedAt < staleBefore;
            });

            if (!clientsToFetch.length) return;

            setCuratorCompetitionLoading(true);

            (async function () {
                var nextCache = {};
                try {
                    for (var i = 0; i < clientsToFetch.length; i++) {
                        if (cancelled) return;

                        var client = clientsToFetch[i];
                        try {
                            var kvResult = await HEYS.YandexAPI.getAllKVByCurator(client.id, {
                                keys: leaderboardKeys
                            });
                            var rows = Array.isArray(kvResult && kvResult.data) ? kvResult.data : [];
                            nextCache[client.id] = Object.assign({}, extractCompetitionDataFromKVRows(rows), {
                                weekAnchor: requestedWeekAnchor,
                                fetchedAt: Date.now()
                            });
                            console.info('[HEYS.leaderboard] 👥 Curator competitions cache warmed', {
                                clientId: client.id.slice(0, 8),
                                clientName: client.name,
                                keysLoaded: rows.length
                            });
                        } catch (err) {
                            console.warn('[HEYS.leaderboard] ⚠️ Failed to load curator competition data:', client.name, err?.message || err);
                        }
                    }

                    if (cancelled || Object.keys(nextCache).length === 0) return;

                    setCuratorCompetitionCache(function (prev) {
                        return Object.assign({}, prev, nextCache);
                    });
                } finally {
                    if (!cancelled) {
                        setCuratorCompetitionLoading(false);
                    }
                }
            })();

            return () => {
                cancelled = true;
            };
        }, [showClientDropdown, isRpcMode, clients, clientIdValue, curatorCompetitionCache, selectedDate, resolvedTodayISO, todayISO]);

        React.useEffect(() => {
            if (!showClientDropdown) return;

            var cancelled = false;
            var effectiveDateStr = selectedDate
                || resolvedTodayISO
                || (HEYS?.utils?.getTodayStr?.())
                || new Date().toISOString().slice(0, 10);
            var watchedWeekDates = normalizeWeekDates([], effectiveDateStr);
            var watchedWeekLookup = {};
            for (var wi = 0; wi < watchedWeekDates.length; wi++) {
                watchedWeekLookup[watchedWeekDates[wi]] = true;
            }

            var scheduleLeaderboardRefresh = function (reason, meta) {
                if (leaderboardRefreshRafRef.current) return;
                leaderboardRefreshRafRef.current = window.requestAnimationFrame(function () {
                    leaderboardRefreshRafRef.current = 0;
                    if (cancelled) return;
                    bumpLeaderboardRefreshTick();
                    console.info('[HEYS.leaderboard] 🔄 Dropdown live refresh', Object.assign({
                        reason: reason,
                        mode: isRpcMode ? 'client' : 'curator',
                        clientId: clientIdValue ? String(clientIdValue).slice(0, 8) : null,
                        weekAnchor: watchedWeekDates[0] || effectiveDateStr
                    }, meta || {}));
                });
            };

            var handleCrsUpdated = function () {
                scheduleLeaderboardRefresh('crs-updated');
            };

            var handleDayUpdated = function (event) {
                var detail = event && event.detail ? event.detail : {};
                var changedDates = [];
                if (typeof detail.date === 'string' && detail.date) {
                    changedDates.push(detail.date);
                }
                if (Array.isArray(detail.dates)) {
                    for (var di = 0; di < detail.dates.length; di++) {
                        if (detail.dates[di]) changedDates.push(detail.dates[di]);
                    }
                }

                var isRelevant = !!detail.batch || !changedDates.length;
                if (!isRelevant) {
                    for (var ci = 0; ci < changedDates.length; ci++) {
                        if (watchedWeekLookup[changedDates[ci]]) {
                            isRelevant = true;
                            break;
                        }
                    }
                }
                if (!isRelevant && (detail.source === 'force-sync' || detail.source === 'cloud-sync' || detail.source === 'cascade-guard-unlock')) {
                    isRelevant = true;
                }
                if (!isRelevant) return;

                scheduleLeaderboardRefresh(detail.batch ? 'day-updated-batch' : 'day-updated', {
                    source: detail.source || null,
                    changedDates: changedDates.slice(0, 3)
                });
            };

            var handleSyncCompleted = function (event) {
                var detail = event && event.detail ? event.detail : {};
                scheduleLeaderboardRefresh('sync-completed', {
                    phaseA: !!detail.phaseA
                });
            };

            // Safety net for fast curator login flows: local data can arrive just after the
            // first open without another React state change, so re-check once automatically.
            var delayedRefreshId = window.setTimeout(function () {
                scheduleLeaderboardRefresh('dropdown-open-recheck');
            }, 350);

            window.addEventListener('heys:crs-updated', handleCrsUpdated);
            window.addEventListener('heys:day-updated', handleDayUpdated);
            window.addEventListener('heysSyncCompleted', handleSyncCompleted);

            return () => {
                cancelled = true;
                window.clearTimeout(delayedRefreshId);
                if (leaderboardRefreshRafRef.current) {
                    window.cancelAnimationFrame(leaderboardRefreshRafRef.current);
                    leaderboardRefreshRafRef.current = 0;
                }
                window.removeEventListener('heys:crs-updated', handleCrsUpdated);
                window.removeEventListener('heys:day-updated', handleDayUpdated);
                window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
            };
        }, [showClientDropdown, isRpcMode, clientIdValue, selectedDate, resolvedTodayISO]);

        // Load EWS data on mount and when date changes
        React.useEffect(() => {
            console.info('ews / badge 🔄 useEffect triggered');

            let retryTimeoutId = null;
            let ewsLoaded = false; // PERF v7.2: prevent duplicate detect calls

            const loadEWSData = async (retryCount = 0) => {
                try {
                    // PERF v7.2: skip if already loaded (prevents event + timer double-fire)
                    if (ewsLoaded && retryCount > 0) return;

                    if (!HEYS?.InsightsPI?.earlyWarning?.detect) {
                        // PERF v7.1: Event listener 'heys-ews-ready' is the primary mechanism; polling is fallback
                        if (retryCount < 6) {
                            const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
                            // PERF v7.2: only log first and last retry to reduce noise
                            if (retryCount === 0 || retryCount === 5) {
                                console.info(`ews / badge ⏳ EWS module not ready, retry ${retryCount + 1}/6 (delay ${delay}ms)`);
                            }
                            retryTimeoutId = setTimeout(() => loadEWSData(retryCount + 1), delay);
                            return;
                        }
                        console.info('ews / badge ℹ️ EWS polling exhausted — event listener still active');
                        setEWSData(null);
                        return;
                    }

                    // PERF v7.2: cancel pending retries — module is available
                    if (retryTimeoutId) {
                        clearTimeout(retryTimeoutId);
                        retryTimeoutId = null;
                    }
                    ewsLoaded = true;

                    console.info('ews / badge ✅ EWS module detected');

                    // Load 7 days of data (ACUTE mode: current state alerts only)
                    const days = [];
                    for (let i = 0; i < 7; i++) {
                        const d = new Date();
                        d.setDate(d.getDate() - i);
                        const dateStr = formatLocalISO(d);
                        const U = HEYS.utils || {};
                        const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${dateStr}`) : null;
                        if (dayData) days.push({ ...dayData, date: dateStr });
                    }

                    console.info('ews / badge 📦 Days loaded:', days.length);

                    if (days.length < 3) {
                        console.info('ews / badge ⏸️ Insufficient data:', days.length, 'days (need 3+) — showing neutral badge');
                        setEWSData({ count: 0, highSeverityCount: 0, available: false, warnings: [] });
                        return;
                    }

                    const profile = cachedProfile || HEYS.store?.get?.('heys_profile') || null;
                    const pIndex = products || HEYS.products?.getAll?.() || [];

                    console.info('ews / badge 📤 calling detect:', {
                        mode: 'acute',
                        daysCount: days.length,
                        hasProfile: !!profile,
                        pIndexCount: pIndex?.length || 0,
                        checksExpected: 10
                    });

                    const result = await HEYS.InsightsPI.earlyWarning.detect(days, profile, pIndex, {
                        mode: 'acute',
                        includeDetails: true
                    });

                    if (result.available) {
                        setEWSData(result);
                        if (result.count > 0) {
                            console.info('ews / badge ✅ Badge data loaded:', {
                                count: result.count,
                                high: result.highSeverityCount,
                                medium: result.count - result.highSeverityCount,
                                daysAnalyzed: days.length,
                                hasWarnings: Array.isArray(result.warnings) && result.warnings.length > 0,
                            });
                        } else {
                            console.info('ews / badge ✅ All OK (no warnings):', {
                                daysAnalyzed: days.length,
                                status: 'healthy'
                            });
                        }
                    } else {
                        setEWSData({ count: 0, highSeverityCount: 0, available: false, warnings: [] });
                        console.info('ews / badge ℹ️ EWS unavailable — showing neutral badge:', {
                            reason: result.reason || 'insufficient_data',
                            daysAnalyzed: days.length,
                        });
                    }
                } catch (err) {
                    console.warn('ews / badge ⚠️ Failed to load EWS data:', err.message);
                    setEWSData({ count: 0, highSeverityCount: 0, available: false, warnings: [] });
                }
            };

            // Listen for EWS module ready event (fired by pi_early_warning.js on load)
            const handleEWSReady = (event) => {
                console.info('ews / badge 📡 heys-ews-ready event received:', event.detail);
                // PERF v7.2: cancel pending retries to prevent duplicate detect
                if (retryTimeoutId) {
                    clearTimeout(retryTimeoutId);
                    retryTimeoutId = null;
                }
                ewsLoaded = false; // allow fresh load from event
                loadEWSData(); // Immediately load data when module becomes available
            };
            window.addEventListener('heys-ews-ready', handleEWSReady);

            loadEWSData();

            // Reload on day-data-changed event
            let postSyncHeavyTimer = null;
            let postSyncHeavyQuietTimer = null;
            let postSyncHeavyGen = 0;
            const schedulePostSyncHeavyWork = (reason) => {
                if (postSyncHeavyTimer) {
                    clearTimeout(postSyncHeavyTimer);
                }
                if (postSyncHeavyQuietTimer) {
                    clearTimeout(postSyncHeavyQuietTimer);
                    postSyncHeavyQuietTimer = null;
                }
                const gen = ++postSyncHeavyGen;
                postSyncHeavyTimer = setTimeout(() => {
                    postSyncHeavyTimer = null;
                    const QUIET_THRESHOLD = 10;
                    const STEP_MS = 450;
                    const MAX_STEPS = 56;

                    const waitThenRun = (step) => {
                        if (gen !== postSyncHeavyGen) return;
                        let pending = 0;
                        let uploading = false;
                        try {
                            pending = typeof HEYS?.cloud?.getPendingCount === 'function'
                                ? (HEYS.cloud.getPendingCount() || 0)
                                : 0;
                            uploading = typeof HEYS?.cloud?.isUploadInProgress === 'function'
                                ? !!HEYS.cloud.isUploadInProgress()
                                : false;
                        } catch (_) { /* noop */ }
                        const busy = pending > QUIET_THRESHOLD || (uploading && pending > 2);
                        if (busy && step < MAX_STEPS) {
                            postSyncHeavyQuietTimer = setTimeout(() => waitThenRun(step + 1), STEP_MS);
                            return;
                        }
                        postSyncHeavyQuietTimer = null;
                        if (gen !== postSyncHeavyGen) return;
                        const run = () => {
                            ewsLoaded = false;
                            loadEWSData();
                        };
                        if (typeof window.requestIdleCallback === 'function') {
                            window.requestIdleCallback(run, { timeout: 2000 });
                        } else {
                            setTimeout(run, 0);
                        }
                        try {
                            HEYS.perf?.markCommitHint?.('app-shell:post-sync-heavy', {
                                reason,
                                pendingAfterWait: pending,
                                quietSteps: step
                            });
                        } catch (_) { /* noop */ }
                    };
                    waitThenRun(0);
                }, 280);
            };

            const handleDayDataChanged = () => {
                schedulePostSyncHeavyWork('day-data-changed');
            };
            window.addEventListener('day-data-changed', handleDayDataChanged);

            // Reload after sync complete
            const handleSyncComplete = () => {
                schedulePostSyncHeavyWork('sync-complete');
            };
            window.addEventListener('heysSyncCompleted', handleSyncComplete);

            // Reload every 5 minutes (skip work while tab is in background)
            const interval = setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden) return;
                ewsLoaded = false;
                loadEWSData();
            }, 5 * 60 * 1000);

            return () => {
                postSyncHeavyGen++;
                if (retryTimeoutId) clearTimeout(retryTimeoutId);
                if (postSyncHeavyTimer) clearTimeout(postSyncHeavyTimer);
                if (postSyncHeavyQuietTimer) clearTimeout(postSyncHeavyQuietTimer);
                window.removeEventListener('heys-ews-ready', handleEWSReady);
                window.removeEventListener('day-data-changed', handleDayDataChanged);
                window.removeEventListener('heysSyncCompleted', handleSyncComplete);
                clearInterval(interval);
            };
        }, [selectedDate, clientId]);

        // ☁️ Auto-fade synced → idle after 2s + track last sync time (v2.0)
        React.useEffect(() => {
            if (cloudStatus === 'synced') {
                lastSyncedAtRef.current = Date.now();
                setDisplayStatus('synced');
                clearTimeout(syncFadeTimerRef.current);
                syncFadeTimerRef.current = setTimeout(() => setDisplayStatus('idle'), 2000);
            } else {
                clearTimeout(syncFadeTimerRef.current);
                setDisplayStatus(cloudStatus);
            }
            return () => clearTimeout(syncFadeTimerRef.current);
        }, [cloudStatus]);

        const isBackgroundQueuedState = showPendingSyncBanner && displayStatus === 'syncing';
        const effectiveDisplayStatus = isBackgroundQueuedState ? 'queued' : displayStatus;
        const haptic = HEYS?.haptic || (() => { });
        const formatSyncAge = (ts) => {
            if (!ts) return '';
            const s = Math.floor((Date.now() - ts) / 1000);
            if (s < 10) return 'только что';
            if (s < 60) return `${s} сек назад`;
            const m = Math.floor(s / 60);
            if (m < 60) return `${m} мин назад`;
            return `${Math.floor(m / 60)} ч назад`;
        };
        const handleSyncBadgeClick = () => {
            if (effectiveDisplayStatus === 'syncing' || effectiveDisplayStatus === 'offline' || effectiveDisplayStatus === 'session') return;
            haptic('light');
            // Build and copy comprehensive debug snapshot to clipboard
            try {
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
                const syncLog = HEYS?.cloud?.getSyncLog?.() || [];
                const logLines = syncLog.map(e => {
                    const t = e.ts ? new Date(e.ts).toISOString().replace('T', ' ').replace('Z', '') : '?';
                    const det = e.details ? ' ' + JSON.stringify(e.details) : '';
                    return `[HEYS.sync] ${t} ${e.type || ''}${det}`;
                });
                // Runtime state
                const rt = {};
                try {
                    const _rr = HEYS?.cloud?.getRoutingStatus?.();
                    rt.status = (_rr && typeof _rr === 'object') ? JSON.stringify(_rr) : (_rr || effectiveDisplayStatus);
                    rt.pending = HEYS?.cloud?.getPendingCount?.() || 0;
                    rt.pendingDet = HEYS?.cloud?.getPendingDetails?.();
                    rt.syncing = !!HEYS?.cloud?.isSyncing?.();
                    rt.uploading = !!HEYS?.cloud?.isUploadInProgress?.();
                    rt.isAuth = !!HEYS?.cloud?.isAuthenticated?.();
                    rt.isPin = !!HEYS?.cloud?.isPinAuthClient?.();
                    rt.client = (HEYS?.cloud?.getCurrentClientId?.() || clientIdValue || '').slice(0, 8);
                    rt.online = navigator.onLine;
                    const lsSyncTs = localStorage.getItem(`heys_${clientIdValue}_last_sync_ts`);
                    rt.lastSyncTs = lsSyncTs || null;
                    // Queues
                    const clientQ = localStorage.getItem('heys_pending_client_sync_queue');
                    const inflightQ = localStorage.getItem('heys_pending_client_sync_inflight_queue');
                    rt.clientQueue = clientQ ? JSON.parse(clientQ).length : 0;
                    rt.inflightQueue = inflightQ ? JSON.parse(inflightQ).length : 0;
                } catch (_) { }
                // Per-key sizing of pending queue + last upload error
                const fmtKB = (b) => b >= 0 ? (b / 1024).toFixed(1) + 'KB' : '?';
                let pendingDetailLines = [];
                try {
                    const det = HEYS?.cloud?.getPendingItemsDetail?.();
                    if (det) {
                        const fmtRow = (r) => `  ${r.k}: ${fmtKB(r.sizeBytes)} (${r.vKind}${r.compressed ? ' ¤Z¤' : ''})`;
                        if (det.queue.length > 0) {
                            pendingDetailLines.push(`-- queue (${det.queue.length}):`);
                            const sorted = [...det.queue].sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
                            sorted.forEach(r => pendingDetailLines.push(fmtRow(r)));
                        }
                        if (det.inflight.length > 0) {
                            pendingDetailLines.push(`-- inflight (${det.inflight.length}):`);
                            det.inflight.forEach(r => pendingDetailLines.push(fmtRow(r)));
                        }
                        pendingDetailLines.push(`-- total in pending: ${fmtKB(det.totalSizeBytes)}`);
                    }
                } catch (_) { /* noop */ }
                let lastErrLines = [];
                try {
                    const diag = HEYS?.cloud?.getLastUploadDiag?.();
                    if (diag) {
                        const ago = Math.floor((Date.now() - diag.ts) / 1000);
                        lastErrLines.push(`kind: ${diag.kind} code: ${diag.code || '—'} (${ago}s ago)`);
                        lastErrLines.push(`error: ${String(diag.error || '').slice(0, 240)}`);
                        lastErrLines.push(`failed chunk: ${fmtKB(diag.chunkBytes)} (${diag.chunkLen} items)`);
                        if (Array.isArray(diag.items)) {
                            const sorted = [...diag.items].sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
                            sorted.forEach(r => lastErrLines.push(`  ${r.k}: ${fmtKB(r.bytes)} (${r.kind})`));
                        }
                    } else {
                        lastErrLines.push('(no upload errors recorded)');
                    }
                } catch (_) { /* noop */ }
                const lines = [
                    `=== HEYS Sync Debug Snapshot @ ${ts} ===`,
                    `status:       ${rt.status}`,
                    `online:       ${rt.online}`,
                    `isAuth:       ${rt.isAuth}  isPin: ${rt.isPin}  client: ${rt.client}***`,
                    `syncing:      ${rt.syncing}  uploading: ${rt.uploading}`,
                    `pending:      ${rt.pending}  ${rt.pendingDet ? JSON.stringify(rt.pendingDet) : ''}`,
                    `clientQueue:  ${rt.clientQueue}  inflight: ${rt.inflightQueue}`,
                    `lastSyncTs:   ${rt.lastSyncTs || '—'}`,
                    '',
                    `=== Pending Queue Detail ===`,
                    ...(pendingDetailLines.length ? pendingDetailLines : ['(empty)']),
                    '',
                    `=== Last Upload Diag ===`,
                    ...lastErrLines,
                    '',
                    `=== Sync Log (${logLines.length} entries) ===`,
                    ...(logLines.length ? logLines : ['[HEYS.sync] (пусто)']),
                ];
                const text = lines.join('\n');
                if (navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(text).then(() => {
                        HEYS?.Toast?.success?.('Sync debug скопирован');
                    }).catch(() => { });
                }
            } catch (e) { /* noop */ }
            if (HEYS?.cloud?.syncClient && clientIdValue) {
                console.info('[HEYS.sync] 🔄 Manual force-sync triggered from badge');
                HEYS.cloud.syncClient(clientIdValue, { force: true });
            }
        };
        const pendingBreakdownText = pendingText || (() => {
            const details = pendingDetails || HEYS?.cloud?.getPendingDetails?.() || null;
            if (!details) return '';
            const parts = [];
            if (details.days > 0) parts.push(`${details.days} дн.`);
            if (details.products > 0) parts.push(`${details.products} прод.`);
            if (details.profile > 0) parts.push('профиль');
            if (details.other > 0) parts.push(`${details.other} др.`);
            return parts.join(', ');
        })();
        const visiblePendingActionItems = Array.isArray(pendingActionItems)
            ? pendingActionItems.slice(0, 4)
            : [];
        const shouldShowPendingSyncBanner = pendingCount > 0 && showPendingSyncBanner;
        const isBackgroundPendingSync = !!showPendingSyncBanner;
        const pendingSyncBannerEyebrow = isBackgroundPendingSync ? 'Сохранил локально' : 'Ждут отправки';
        const pendingSyncBannerTitle = isBackgroundPendingSync
            ? 'Можно продолжать — отправляю изменения в фоне'
            : pendingCount > 1
                ? `${pendingCount} изменений ждут синхронизации`
                : '1 изменение ждёт синхронизации';
        const pendingSyncBannerSummary = pendingBreakdownText
            ? (isBackgroundPendingSync
                ? `${pendingBreakdownText} · ничего не потеряется. Если включён VPN — попробуйте отключить, часто ускоряет синхронизацию.`
                : `${pendingBreakdownText} · можно нажать на облако`)
            : (isBackgroundPendingSync
                ? 'Если интернет тормозит — ничего не потеряется. Если включён VPN — попробуйте отключить, часто ускоряет синхронизацию.'
                : 'Нажми на облако, чтобы подтолкнуть отправку.');
        const pad2 = (n) => String(n).padStart(2, '0');
        const formatLocalISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        const shiftISO = (iso, delta) => {
            if (!iso) return null;
            const d = new Date(iso + 'T12:00:00');
            d.setDate(d.getDate() + delta);
            return formatLocalISO(d);
        };
        const getDefaultPrefetchDates = (nextDate) => {
            const dates = [nextDate, shiftISO(nextDate, -1), shiftISO(nextDate, 1)];
            return Array.from(new Set(dates.filter(Boolean)));
        };

        const selectDateWithPrefetch = (nextDate, options = {}) => {
            if (!nextDate) return;
            const prefetchDates = Array.isArray(options.prefetchDates) && options.prefetchDates.length
                ? options.prefetchDates
                : getDefaultPrefetchDates(nextDate);

            try {
                if (HEYS?.Day?.requestFlush) HEYS.Day.requestFlush({ force: true });
            } catch (e) { }

            try {
                if (HEYS?.Undo?.pending) {
                    console.info('[HEYS.header] 🧹 Commit pending undo before date switch', {
                        currentDate: selectedDate,
                        nextDate,
                        reason: options.reason || 'header-date-switch'
                    });
                    HEYS.Undo.commit('header-date-switch');
                }
            } catch (e) { }

            const applyDate = () => {
                setSelectedDate(nextDate);
                haptic('light');
            };

            if (HEYS?.cloud?.fetchDays && prefetchDates.length > 0) {
                HEYS.cloud.fetchDays(prefetchDates)
                    .then(() => applyDate())
                    .catch(() => applyDate());
                return;
            }

            applyDate();
        };

        const clientListMaxHeight = Math.max(120, clientDropdownMaxHeight - 128);
        const leaderboardSectionNode = renderLeaderboardSection(leaderboardData, {
            isLoading: shouldShowLeaderboardSkeleton,
            fallbackDateStr: selectedDate || resolvedTodayISO
        });

        const commitPendingUndoBeforeContextChange = (reason, meta) => {
            try {
                if (!HEYS?.Undo?.pending) return;
                console.info('[HEYS.header] 🧹 Commit pending undo before context switch', {
                    reason,
                    ...(meta || {})
                });
                HEYS.Undo.commit(reason);
            } catch (e) { }
        };

        if (!clientId) return null;

        return React.createElement(
            'div',
            { className: 'hdr' },
            // === ВЕРХНЯЯ ЛИНИЯ: Gamification Bar ===
            React.createElement(
                'div',
                { className: 'hdr-top hdr-gamification' },
                React.createElement(GamificationBar)
            ),
            // === НИЖНЯЯ ЛИНИЯ: Клиент + Действия ===
            React.createElement(
                'div',
                { className: 'hdr-bottom' },
                // Информация о клиенте + DatePicker
                React.createElement(
                    'div',
                    { className: 'hdr-client', 'data-dropdown': 'client', style: { position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }, ref: clientDropdownAnchorRef },
                    // Кликабельный блок для dropdown
                    React.createElement(
                        'div',
                        {
                            className: 'hdr-client-clickable',
                            onClick: () => setShowClientDropdown(!showClientDropdown),
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer',
                                padding: '4px 6px 4px 4px',
                                borderRadius: 10,
                                transition: 'background 0.2s'
                            }
                        },
                        React.createElement(
                            'div',
                            { className: 'hdr-client-info' },
                            // Единый источник имени: currentClientName
                            (() => {
                                const fullName = (currentClientName || '').trim();
                                const parts = fullName.split(' ').filter(Boolean);
                                return [
                                    React.createElement('span', { key: 'fn', className: 'hdr-client-firstname' }, parts[0] || ''),
                                    parts.length > 1 && React.createElement('span', { key: 'ln', className: 'hdr-client-lastname' }, parts.slice(1).join(' '))
                                ];
                            })()
                        ),
                        // Стрелка dropdown
                        React.createElement('span', {
                            style: {
                                fontSize: 10,
                                color: 'var(--muted)',
                                transition: 'transform 0.2s',
                                transform: showClientDropdown ? 'rotate(180deg)' : 'rotate(0)'
                            }
                        }, '▼')
                    ),
                    // Dropdown список клиентов
                    showClientDropdown && React.createElement(
                        'div',
                        {
                            className: 'client-dropdown' + (!isRpcMode ? ' client-dropdown--curator' : ''),
                            style: {
                                position: 'absolute',
                                top: '100%',
                                left: clientDropdownLeft,
                                marginTop: 8,
                                background: 'var(--card)',
                                borderRadius: 16,
                                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                                border: '1px solid var(--border)',
                                width: clientDropdownWidth,
                                maxWidth: 'calc(100vw - 20px)',
                                minWidth: 300,
                                maxHeight: clientDropdownMaxHeight,
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                zIndex: 1001,
                                animation: 'fadeSlideIn 0.2s ease'
                            }
                        },
                        React.createElement('button', {
                            key: 'close',
                            type: 'button',
                            className: 'client-dropdown__close',
                            'aria-label': 'Закрыть меню аккаунта',
                            onClick: () => setShowClientDropdown(false)
                        },
                            React.createElement('span', { className: 'client-dropdown__close-icon' }, '✕'),
                            React.createElement('span', { className: 'client-dropdown__close-label' }, 'Закрыть')
                        ),
                        // Проверяем режим: клиент (RPC) или куратор
                        isRpcMode
                            // === КЛИЕНТСКИЙ РЕЖИМ: только имя + кнопка выхода ===
                            ? [
                                // Заголовок "Мой аккаунт"
                                React.createElement('div', {
                                    key: 'header',
                                    className: 'client-dropdown-account__header'
                                },
                                    React.createElement('div', {
                                        className: 'client-dropdown-account__avatar',
                                        style: { background: getAvatarColor(currentClientName) }
                                    }, getClientInitials(currentClientName)),
                                    React.createElement('div', {
                                        className: 'client-dropdown-account__name'
                                    }, currentClientName)
                                ),
                                React.createElement('div', {
                                    key: 'actions',
                                    className: 'client-dropdown-account__actions'
                                },
                                    React.createElement('button', {
                                        type: 'button',
                                        key: 'settings',
                                        className: 'client-dropdown-account__action client-dropdown-account__action--settings',
                                        onClick: () => {
                                            setShowClientDropdown(false);
                                            if (setActiveTab) {
                                                setActiveTab('profile');
                                            }
                                        }
                                    },
                                        React.createElement('span', {
                                            className: 'client-dropdown-account__action-icon'
                                        }, '⚙️'),
                                        React.createElement('span', {
                                            className: 'client-dropdown-account__action-copy'
                                        },
                                            React.createElement('span', {
                                                className: 'client-dropdown-account__action-title'
                                            }, 'Настройки'),
                                            React.createElement('span', {
                                                className: 'client-dropdown-account__action-subtitle'
                                            }, 'Профиль и цели')
                                        )
                                    ),
                                    React.createElement('button', {
                                        type: 'button',
                                        key: 'logout',
                                        className: 'client-dropdown-account__action client-dropdown-account__action--logout',
                                        onClick: () => {
                                            setShowClientDropdown(false);
                                            handleSignOut();
                                        }
                                    },
                                        React.createElement('span', {
                                            className: 'client-dropdown-account__action-icon'
                                        }, '🚪'),
                                        React.createElement('span', {
                                            className: 'client-dropdown-account__action-copy'
                                        },
                                            React.createElement('span', {
                                                className: 'client-dropdown-account__action-title'
                                            }, 'Выйти'),
                                            React.createElement('span', {
                                                className: 'client-dropdown-account__action-subtitle'
                                            }, 'Сменить аккаунт')
                                        )
                                    )
                                ),
                                // Leaderboard
                                leaderboardSectionNode
                            ]
                            // === РЕЖИМ КУРАТОРА: клиенты + состязания на одной странице ===
                            : [
                                // Заголовок секции клиентов
                                React.createElement('div', {
                                    key: 'clients-header',
                                    className: 'curator-section-header'
                                },
                                    `👥 Клиенты (${clients.length})`,
                                    totalUnread > 0 && React.createElement('span', {
                                        className: 'curator-header-unread',
                                        style: {
                                            marginLeft: 8,
                                            padding: '2px 8px',
                                            borderRadius: 10,
                                            background: '#dc2626',
                                            color: '#fff',
                                            fontSize: 12,
                                            fontWeight: 600
                                        }
                                    }, `💬 ${totalUnread}`)
                                ),
                                // Список клиентов (скролл только для списка)
                                React.createElement(
                                    'div',
                                    {
                                        key: 'client-list-scroll',
                                        className: 'client-dropdown-scroll-list',
                                        style: {
                                            maxHeight: clientListMaxHeight,
                                            overflowY: 'auto',
                                            overflowX: 'hidden',
                                            overscrollBehavior: 'contain'
                                        }
                                    },
                                    [...clients]
                                        .sort((a, b) => {
                                            // 💬 Клиенты с непрочитанными сообщениями — наверх
                                            const unreadA = messengerInbox[a.id]?.unread_count || 0;
                                            const unreadB = messengerInbox[b.id]?.unread_count || 0;
                                            if (unreadA !== unreadB) return unreadB - unreadA;
                                            const lastA = readGlobalValue('heys_last_client_id', '') === a.id ? 1 : 0;
                                            const lastB = readGlobalValue('heys_last_client_id', '') === b.id ? 1 : 0;
                                            if (lastA !== lastB) return lastB - lastA;
                                            const statsA = getClientStats(a.id);
                                            const statsB = getClientStats(b.id);
                                            return (statsB.streak || 0) - (statsA.streak || 0);
                                        })
                                        .map((c) =>
                                            React.createElement(
                                                'div',
                                                {
                                                    key: c.id,
                                                    className: 'client-dropdown-item' + (c.id === clientIdValue ? ' active' : ''),
                                                    style: {
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        padding: '10px 16px',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.15s',
                                                        background: c.id === clientIdValue ? 'rgba(102, 126, 234, 0.1)' : 'transparent'
                                                    },
                                                    onClick: () => {
                                                        if (c.id !== clientIdValue) {
                                                            // 🔧 v69 FIX: async switch — НЕ меняем currentClientId до завершения switchClient
                                                            setTimeout(async () => {
                                                                commitPendingUndoBeforeContextChange('client-switch', {
                                                                    fromClientId: clientIdValue,
                                                                    toClientId: c.id,
                                                                });

                                                                const _prevClientId_shell = clientIdValue;
                                                                console.info(`[HEYS.shell] 🔄 Выбор клиента: ${c.name} (${c.id.slice(0, 8)}...)`);

                                                                // Блокируем запись пока switch не завершится
                                                                if (HEYS.cloud) {
                                                                    HEYS.cloud._switchClientInProgress = true;
                                                                }

                                                                // Уведомляем UI о начале переключения (без смены currentClientId)
                                                                window.dispatchEvent(new CustomEvent('heys:client-switching', { detail: { clientId: c.id } }));

                                                                if (HEYS.cloud && HEYS.cloud.switchClient) {
                                                                    try {
                                                                        await HEYS.cloud.switchClient(c.id, _prevClientId_shell);
                                                                    } catch (err) {
                                                                        console.error('[HEYS.shell] ❌ Ошибка sync, retry через 3с:', err);
                                                                        try {
                                                                            await new Promise(r => setTimeout(r, 3000));
                                                                            await HEYS.cloud.switchClient(c.id, _prevClientId_shell);
                                                                        } catch (err2) {
                                                                            console.error('[HEYS.shell] ❌ Retry failed:', err2);
                                                                        }
                                                                    }
                                                                }

                                                                // v69: switchClient завершился — безопасно обновляем ID
                                                                writeGlobalValue('heys_last_client_id', c.id);
                                                                writeGlobalValue('heys_client_current', c.id);
                                                                window.HEYS = window.HEYS || {};
                                                                window.HEYS.currentClientId = c.id;
                                                                setClientId(c.id);
                                                                console.info('[HEYS.shell] ✅ Клиент переключён (после sync)', { clientId: c.id });
                                                                window.dispatchEvent(new CustomEvent('heys:client-changed', { detail: { clientId: c.id } }));
                                                            }, 0);
                                                        }
                                                        setShowClientDropdown(false);
                                                    }
                                                },
                                                React.createElement('div', {
                                                    style: {
                                                        width: 32,
                                                        height: 32,
                                                        borderRadius: '50%',
                                                        background: getAvatarColor(c.name),
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#fff',
                                                        fontWeight: 600,
                                                        fontSize: 12,
                                                        flexShrink: 0
                                                    }
                                                }, getClientInitials(c.name)),
                                                React.createElement('div', {
                                                    style: {
                                                        flex: 1,
                                                        minWidth: 0,
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: 2
                                                    }
                                                },
                                                    React.createElement('div', {
                                                        style: {
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 6
                                                        }
                                                    },
                                                        React.createElement('span', {
                                                            style: {
                                                                fontWeight: c.id === clientIdValue ? 600 : 400,
                                                                color: c.id === clientIdValue ? '#4285f4' : 'var(--text)'
                                                            }
                                                        }, c.name),
                                                        (messengerInbox[c.id]?.unread_count || 0) > 0 && React.createElement('span', {
                                                            className: 'client-row-unread',
                                                            style: {
                                                                padding: '1px 7px',
                                                                borderRadius: 9,
                                                                background: '#dc2626',
                                                                color: '#fff',
                                                                fontSize: 11,
                                                                fontWeight: 700,
                                                                lineHeight: '14px'
                                                            }
                                                        }, String(messengerInbox[c.id].unread_count))
                                                    ),
                                                    messengerInbox[c.id]?.last_message_preview && React.createElement('div', {
                                                        className: 'client-row-preview',
                                                        style: {
                                                            fontSize: 12,
                                                            color: 'var(--text-secondary, #888)',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            maxWidth: '100%'
                                                        }
                                                    },
                                                        (messengerInbox[c.id].last_message_preview.sender_role === 'curator' ? 'Ты: ' : '') +
                                                        (messengerInbox[c.id].last_message_preview.body ||
                                                         (messengerInbox[c.id].last_message_preview.intent_type === 'meal' ? '🍽️ съел...' :
                                                          messengerInbox[c.id].last_message_preview.intent_type === 'training' ? '🏋️ тренировался' :
                                                          messengerInbox[c.id].last_message_preview.intent_type === 'weight' ? '⚖️ вес' : ''))
                                                    )
                                                ),
                                                c.id === clientIdValue && React.createElement('span', {
                                                    style: { color: '#4285f4' }
                                                }, '✓')
                                            )
                                        )
                                ),
                                // Кнопки действий (стиль карточек как у PIN-клиента)
                                React.createElement('div', {
                                    key: 'actions',
                                    className: 'client-dropdown-account__actions'
                                },
                                    React.createElement('button', {
                                        type: 'button',
                                        key: 'all-clients',
                                        className: 'client-dropdown-account__action client-dropdown-account__action--all-clients',
                                        onClick: () => {
                                            commitPendingUndoBeforeContextChange('all-clients-switch', {
                                                fromClientId: clientIdValue,
                                                toClientId: null,
                                            });
                                            if (window.HEYS) {
                                                window.HEYS.currentClientId = null;
                                                if (window.HEYS.store?.flushMemory) {
                                                    window.HEYS.store.flushMemory();
                                                }
                                            }
                                            removeGlobalValue('heys_client_current');
                                            setClientId('');
                                            window.dispatchEvent(new CustomEvent('heys:client-changed', { detail: { clientId: null } }));
                                            setShowClientDropdown(false);
                                        }
                                    },
                                        React.createElement('span', {
                                            className: 'client-dropdown-account__action-icon'
                                        }, '👥'),
                                        React.createElement('span', {
                                            className: 'client-dropdown-account__action-copy'
                                        },
                                            React.createElement('span', {
                                                className: 'client-dropdown-account__action-title'
                                            }, 'Все клиенты'),
                                            React.createElement('span', {
                                                className: 'client-dropdown-account__action-subtitle'
                                            }, 'Общий вид')
                                        )
                                    ),
                                    React.createElement('button', {
                                        type: 'button',
                                        key: 'logout',
                                        className: 'client-dropdown-account__action client-dropdown-account__action--logout',
                                        onClick: () => {
                                            setShowClientDropdown(false);
                                            handleSignOut();
                                        }
                                    },
                                        React.createElement('span', {
                                            className: 'client-dropdown-account__action-icon'
                                        }, '🚪'),
                                        React.createElement('span', {
                                            className: 'client-dropdown-account__action-copy'
                                        },
                                            React.createElement('span', {
                                                className: 'client-dropdown-account__action-title'
                                            }, 'Выйти'),
                                            React.createElement('span', {
                                                className: 'client-dropdown-account__action-subtitle'
                                            }, cloudUser?.email || 'Сменить аккаунт')
                                        )
                                    )
                                ),
                                // Разделитель
                                React.createElement('div', { key: 'divider', className: 'client-dropdown-divider' }),
                                // Секция состязаний
                                React.createElement('div', { key: 'competitions-section', className: 'curator-competitions-section' },
                                    curatorCompetitionLoading && !shouldShowLeaderboardSkeleton && React.createElement('div', {
                                        className: 'curator-competitions-loading'
                                    }, 'Подтягиваем данные других клиентов…'),
                                    leaderboardSectionNode || React.createElement('div', {
                                        className: 'curator-competitions-empty'
                                    }, curatorCompetitionLoading ? 'Загружаем состязания…' : 'Пока нет данных для состязаний')
                                )
                            ]
                    ),

                ),
                // ☁️ Cloud sync indicator (v2.0: forceSync on click, auto-fade, relative time tooltip)
                React.createElement('div', {
                    key: 'cloudsync',
                    className: 'cloud-sync-indicator ' + effectiveDisplayStatus + (effectiveDisplayStatus !== 'syncing' && effectiveDisplayStatus !== 'offline' && effectiveDisplayStatus !== 'session' ? ' cloud-sync-indicator--clickable' : ''),
                    title: (() => {
                        const routingMode = HEYS?.cloud?.getRoutingStatus?.()?.mode || 'unknown';
                        const modeLabel = routingMode === 'direct' ? '🔗 Direct' : routingMode === 'proxy' ? '🔀 Proxy' : '';
                        let baseTitle;
                        if (effectiveDisplayStatus === 'syncing') {
                            baseTitle = syncProgress?.total > 1
                                ? `Синхронизация... ${syncProgress.synced}/${syncProgress.total}`
                                : 'Синхронизация...';
                            if (pendingBreakdownText) baseTitle += ` · ${pendingBreakdownText}`;
                        } else if (effectiveDisplayStatus === 'queued') {
                            baseTitle = isBackgroundQueuedState
                                ? (pendingCount > 0
                                    ? `${pendingCount} изменений отправляются в фоне`
                                    : 'Изменения отправляются в фоне')
                                : (pendingCount > 0
                                    ? `${pendingCount} локальных изменений ждут отправки`
                                    : 'Локальные изменения ждут отправки');
                            if (pendingBreakdownText) baseTitle += ` · ${pendingBreakdownText}`;
                            baseTitle += isBackgroundQueuedState
                                ? ' — можно продолжать работу'
                                : ' — нажмите для синхронизации';
                        } else if (effectiveDisplayStatus === 'offline') {
                            baseTitle = pendingCount > 0
                                ? `Офлайн — ${pendingCount} изменений ожидают синхронизации`
                                : 'Офлайн — данные сохраняются локально';
                            if (pendingBreakdownText) baseTitle += ` · ${pendingBreakdownText}`;
                        } else if (effectiveDisplayStatus === 'session') {
                            baseTitle = 'Сессия истекла — войдите снова';
                        } else if (effectiveDisplayStatus === 'error') {
                            baseTitle = retryCountdown > 0
                                ? `Ошибка. Повтор через ${retryCountdown}с — нажмите для повтора`
                                : 'Ошибка синхронизации — нажмите для повтора';
                            if (pendingBreakdownText) baseTitle += ` · ${pendingBreakdownText}`;
                        } else if (lastSyncedAtRef.current) {
                            const age = formatSyncAge(lastSyncedAtRef.current);
                            baseTitle = `Сохранено ${age} — нажмите для синхронизации`;
                        } else {
                            baseTitle = 'Нажмите для синхронизации';
                        }
                        return modeLabel ? `${baseTitle} (${modeLabel})` : baseTitle;
                    })(),
                    onClick: handleSyncBadgeClick,
                },
                    effectiveDisplayStatus === 'syncing' ? [
                        React.createElement('div', { key: 'spin', className: 'sync-spinner' }),
                        syncProgress?.total > 1 && React.createElement('span', { key: 'prog', className: 'sync-progress' }, `${syncProgress.synced}/${syncProgress.total}`)
                    ]
                        : effectiveDisplayStatus === 'synced'
                            ? React.createElement('span', { key: 'ok', className: 'cloud-icon synced' }, '✓')
                            : effectiveDisplayStatus === 'offline' ? [
                                React.createElement('svg', { key: 'ic', className: 'cloud-icon offline', viewBox: '0 0 24 24', width: 16, height: 16, fill: 'currentColor' },
                                    React.createElement('path', { d: 'M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z' }),
                                    React.createElement('line', { x1: '1', y1: '1', x2: '23', y2: '23', stroke: 'currentColor', strokeWidth: '2' })
                                ),
                                pendingCount > 0 && React.createElement('span', { key: 'pb', className: 'pending-badge' }, pendingCount)
                            ]
                                : effectiveDisplayStatus === 'session' ? [
                                    React.createElement('span', { key: 'sess', className: 'cloud-icon session', 'aria-hidden': 'true' }, '🔑'),
                                ]
                                    : effectiveDisplayStatus === 'queued' ? [
                                        React.createElement('svg', { key: 'cloud', className: 'cloud-icon idle', viewBox: '0 0 24 24', width: 16, height: 16, fill: 'currentColor' },
                                            React.createElement('path', { d: 'M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z' })
                                        ),
                                        pendingCount > 0 && React.createElement('span', { key: 'pb', className: 'pending-badge' }, pendingCount)
                                    ]
                                        : effectiveDisplayStatus === 'error' ? [
                                            React.createElement('span', { key: 'warn', className: 'cloud-icon error' }, '⚠'),
                                            retryCountdown > 0 && React.createElement('span', { key: 'cd', className: 'retry-countdown' }, retryCountdown)
                                        ]
                                            : React.createElement('svg', { key: 'cloud', className: 'cloud-icon idle', viewBox: '0 0 24 24', width: 16, height: 16, fill: 'currentColor' },
                                                React.createElement('path', { d: 'M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z' })
                                            )
                ),
                // 🚨 EWS Badge (v1.3 - показывает актуальные предупреждения без ручного скрытия)
                ewsData && React.createElement('div', {
                    className: 'ews-badge' + (
                        ewsData.count === 0 ? ' ews-badge--ok' :
                            ewsData.highSeverityCount > 0 ? ' ews-badge--high' : ' ews-badge--medium'
                    ),
                    title: (() => {
                        if (ewsData.count === 0) {
                            return '✅ Early Warning System: все показатели в норме';
                        }
                        const high = ewsData.highSeverityCount || 0;
                        const medium = ewsData.count - high;
                        const parts = [];
                        if (high > 0) parts.push(`${high} критич.`);
                        if (medium > 0) parts.push(`${medium} предупр.`);
                        return `⚠️ Early Warning System: ${parts.join(', ')}`;
                    })(),
                    onClick: () => {
                        haptic('medium');
                        if (ewsData.count === 0) {
                            console.info('ews / badge ✅ Badge clicked (all ok) → opening panel globally');
                        } else {
                            console.info('ews / badge 🚨 Badge clicked → opening panel globally (acute mode)');
                        }
                        // Отправляем событие с warnings для глобального менеджера панели
                        window.dispatchEvent(new CustomEvent('heysShowEWSPanel', {
                            detail: {
                                warnings: ewsData.warnings || [],
                                mode: 'acute'
                            }
                        }));
                    }
                }, [
                    React.createElement('span', { className: 'ews-badge__icon' }, ewsData.count === 0 ? '✅' : '⚠️'),
                    ewsData.count > 0 && React.createElement('span', { className: 'ews-badge__count' }, ewsData.count)
                ]),

                // 🔔 Push notifications indicator (рядом с EWS, в одной строке шапки)
                // Не рендерим если браузер вообще не поддерживает push.
                pushStatus && pushStatus.capable !== false && React.createElement('div', {
                    key: 'pushbadge',
                    className: 'push-badge' + (
                        pushStatus.subscribed ? ' push-badge--on' :
                        (pushStatus.permission === 'denied' || pushStatus.needsInstall) ? ' push-badge--blocked' :
                        ' push-badge--off'
                    ),
                    title: pushStatus.subscribed
                        ? '🔔 Уведомления включены — тап для настроек'
                        : pushStatus.needsInstall
                            ? '📲 Добавь HEYS на главный экран чтобы включить уведомления'
                            : pushStatus.permission === 'denied'
                                ? '🔕 Уведомления заблокированы в браузере'
                                : '🔕 Уведомления выключены — тап чтобы включить',
                    onClick: pushBusy ? undefined : handlePushBadgeClick,
                    style: {
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '28px', height: '28px', borderRadius: '8px',
                        cursor: pushBusy ? 'wait' : 'pointer',
                        background: pushStatus.subscribed ? '#dcfce7'
                            : (pushStatus.permission === 'denied' || pushStatus.needsInstall) ? '#f4f4f5'
                                : '#fef3c7',
                        border: '1px solid ' + (pushStatus.subscribed ? '#86efac'
                            : (pushStatus.permission === 'denied' || pushStatus.needsInstall) ? '#d4d4d8'
                                : '#fcd34d'),
                        fontSize: '14px',
                        opacity: pushBusy ? 0.6 : 1,
                        marginLeft: '4px'
                    }
                }, pushStatus.subscribed ? '🔔' : '🔕'),

                                   // Кнопки "Вчера" + "Сегодня" + DatePicker
                (tab === 'stats' || tab === 'diary' || tab === 'insights' || tab === 'month' || tab === 'widgets') && window.HEYS.DatePicker
                    ? React.createElement('div', { className: 'hdr-date-group' },
                        // Кнопка вчера — скрываем когда мы НЕ в сегодняшнем дне
                        // (вернуться можно через капсулу «НЕ СЕГОДНЯ» слева или DatePicker).
                        selectedDate === todayISO() && React.createElement('button', {
                            className: 'yesterday-quick-btn' + (selectedDate === (() => {
                                const d = new Date();
                                if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                d.setDate(d.getDate() - 1);
                                // Локальное форматирование (не UTC!)
                                return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                            })() ? ' active' : ''),
                            onClick: () => {
                                const d = new Date();
                                if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                                d.setDate(d.getDate() - 1);
                                // Локальное форматирование (не UTC!)
                                const nextDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                                selectDateWithPrefetch(nextDate, { reason: 'quick-yesterday' });
                            },
                            title: 'Перейти на вчера'
                        }, (() => {
                            // До 3:00 — вчера = позавчера реально
                            const d = new Date();
                            if (d.getHours() < 3) d.setDate(d.getDate() - 1);
                            d.setDate(d.getDate() - 1);
                            return d.getDate();
                        })()),
                        // Кнопка «Перейти в сегодня» — показывается только когда
                        // выбран НЕ-сегодняшний день. На today она избыточна.
                        selectedDate !== todayISO() && React.createElement('button', {
                            className: 'today-quick-btn today-quick-btn--goto',
                            onClick: () => selectDateWithPrefetch(todayISO(), { reason: 'quick-today' }),
                            title: 'Перейти в сегодня'
                        },
                            React.createElement('span', { className: 'today-quick-btn__line1' }, 'Перейти в'),
                            React.createElement('span', { className: 'today-quick-btn__line2' }, 'сегодня')
                        ),
                        // DatePicker
                        React.createElement(window.HEYS.DatePicker, {
                            valueISO: selectedDate,
                            onSelect: (nextDate) => selectDateWithPrefetch(nextDate, { reason: 'date-picker' }),
                            onRemove: () => {
                                selectDateWithPrefetch(todayISO(), { reason: 'date-picker-clear' });
                            },
                            activeDays: datePickerActiveDays,
                            // Функция для загрузки данных при смене месяца
                            getActiveDaysForMonth: (year, month) => {
                                const getActiveDaysForMonthFn = window.HEYS.dayUtils && window.HEYS.dayUtils.getActiveDaysForMonth;
                                // Fallback chain для products
                                const effectiveProducts = (products && products.length > 0) ? products
                                    : (window.HEYS.products?.getAll?.() || []);
                                // Fallback chain для profile
                                const effectiveProfile = cachedProfile || (U && U.lsGet ? U.lsGet('heys_profile', {}) : {});
                                if (!getActiveDaysForMonthFn || !clientId || effectiveProducts.length === 0) {
                                    return new Map();
                                }
                                try {
                                    return getActiveDaysForMonthFn(year, month, effectiveProfile, effectiveProducts);
                                } catch (e) {
                                    return new Map();
                                }
                            }
                        }),
                    )
                    : null
            ),
            shouldShowPendingSyncBanner && React.createElement(
                'div',
                {
                    className: 'sync-pending-banner' + (isBackgroundPendingSync ? ' sync-pending-banner--background' : ' sync-pending-banner--queued'),
                    role: 'status',
                    'aria-live': 'polite'
                },
                React.createElement(
                    'div',
                    { className: 'sync-pending-banner__header' },
                    React.createElement(
                        'div',
                        { className: 'sync-pending-banner__copy' },
                        React.createElement('div', { className: 'sync-pending-banner__eyebrow' }, pendingSyncBannerEyebrow),
                        React.createElement('div', { className: 'sync-pending-banner__title' }, pendingSyncBannerTitle),
                        React.createElement('div', { className: 'sync-pending-banner__summary' }, pendingSyncBannerSummary)
                    ),
                    React.createElement('div', { className: 'sync-pending-banner__count', 'aria-hidden': 'true' }, pendingCount)
                ),
                visiblePendingActionItems.length > 0 && React.createElement(
                    'div',
                    { className: 'sync-pending-banner__items' },
                    visiblePendingActionItems.map((item) => React.createElement(
                        'div',
                        { key: item.id, className: 'sync-pending-banner__item' },
                        React.createElement('span', { className: 'sync-pending-banner__item-icon', 'aria-hidden': 'true' }, item.icon || '💾'),
                        React.createElement('span', { className: 'sync-pending-banner__item-label' }, item.title || 'Изменения'),
                        item.scopeLabel && React.createElement('span', { className: 'sync-pending-banner__item-scope' }, item.scopeLabel)
                    ))
                )
            )
        );
    }

    function AppTabsNav(props) {
        const {
            tab,
            setTab,
            widgetsEditMode,
            defaultTab,
            defaultTasksSubtab,
            setDefaultTab,
            clientId,
            selectedDate,
            cloudUser,
        } = props;

        const [settingsMenuOpen, setSettingsMenuOpen] = React.useState(false);

        // Bulletproof fallback: document-level capture listener для tab-advice.
        // React synthetic events иногда не доходят до onClick после re-render'ов
        // shell'а (наблюдалось 2026-05-28). useRef + useEffect([]) тоже не помог
        // (ref ловит только initial node). Document.addEventListener в capture
        // phase ловит любой клик ПОВЕРХ React event system, фильтруем по closest.
        const adviceTabRef = React.useRef(null);
        React.useEffect(() => {
            const handler = (e) => {
                if (e.target && e.target.closest && e.target.closest('.tab.tab-advice')) {
                    console.warn('[advice-diag] 0️⃣ document-level capture click on tab-advice');
                    setTimeout(() => window.dispatchEvent(new CustomEvent('heysShowAdvice')), 0);
                }
            };
            document.addEventListener('click', handler, true);
            return () => document.removeEventListener('click', handler, true);
        }, []);

        // 🔔 Бейдж модерации на ⚙️-иконке: показываем JWT-куратору количество pending-заявок.
        // Init из sessionStorage чтобы избежать flash 0→N при reload.
        const [pendingCount, setPendingCount] = React.useState(() => {
            try {
                const raw = sessionStorage.getItem('heys_pending_count_cache');
                const n = raw ? parseInt(raw, 10) : 0;
                return Number.isFinite(n) && n >= 0 ? n : 0;
            } catch (_) { return 0; }
        });
        const [isCuratorBadge, setIsCuratorBadge] = React.useState(false);

        // Detect curator (JWT login). Listen to heys:auth-changed для смены состояния.
        React.useEffect(() => {
            const recheck = () => {
                try {
                    const fn = window.HEYS?.auth?.isCuratorSession;
                    setIsCuratorBadge(typeof fn === 'function' ? !!fn() : !!window.HEYS?.cloud?.getUser?.());
                } catch (_) { setIsCuratorBadge(false); }
            };
            recheck();
            window.addEventListener('heys:auth-changed', recheck);
            return () => window.removeEventListener('heys:auth-changed', recheck);
        }, []);

        // Загружаем pending count при куратор-сессии: при mount, по событиям, polling 60s.
        React.useEffect(() => {
            if (!isCuratorBadge) {
                setPendingCount(0);
                try { sessionStorage.removeItem('heys_pending_count_cache'); } catch (_) { /* noop */ }
                return undefined;
            }
            let cancelled = false;
            const refresh = async () => {
                try {
                    const r = await window.HEYS?.cloud?.getPendingProducts?.();
                    if (cancelled) return;
                    const n = Array.isArray(r?.data) ? r.data.length : 0;
                    setPendingCount(n);
                    try { sessionStorage.setItem('heys_pending_count_cache', String(n)); } catch (_) { /* noop */ }
                } catch (_) { /* network errors silently ignored — bейдж лучше чем noop */ }
            };
            refresh();

            const onUpdate = () => refresh();
            window.addEventListener('heys:pending-product-created', onUpdate);
            window.addEventListener('heys:pending-products-updated', onUpdate);

            // Cross-tab: BroadcastChannel
            let bc = null;
            try {
                bc = new BroadcastChannel('heys_pending_products');
                bc.onmessage = onUpdate;
            } catch (_) { /* старые браузеры без BC */ }

            // Polling 60s — только когда вкладка видна и онлайн
            const id = setInterval(() => {
                if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
                if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
                refresh();
            }, 60_000);

            return () => {
                cancelled = true;
                clearInterval(id);
                window.removeEventListener('heys:pending-product-created', onUpdate);
                window.removeEventListener('heys:pending-products-updated', onUpdate);
                try { bc?.close?.(); } catch (_) { /* noop */ }
            };
        }, [isCuratorBadge]);

        const canUseTasksAsHome = !cloudUser && !!clientId;
        const HOME_TAB_OPTIONS = React.useMemo(() => {
            const options = [
                { key: 'widgets', label: 'Виджеты', icon: '🧩' },
                { key: 'stats', label: 'Отчёты', icon: '📊' },
                { key: 'diary', label: 'Дневник', icon: '🍽️' },
                { key: 'insights', label: 'Советы', icon: '💡' },
                { key: 'month', label: 'Месяц', icon: '🗓️' },
            ];
            if (canUseTasksAsHome) {
                options.push({ key: 'tasks', label: 'Задачи', icon: '☑️' });
            }
            return options;
        }, [canUseTasksAsHome]);

        const TASKS_HOME_SUBTAB_OPTIONS = React.useMemo(() => {
            const fallbackItems = [
                { id: 'tasks', label: 'Список', shortLabel: 'Список', icon: '☑️' },
                { id: 'calendar', label: 'Календарь', shortLabel: 'Кален.', icon: '📅' },
                { id: 'gantt', label: 'Гант', shortLabel: 'Гант', icon: '📊' },
                { id: 'context', label: 'Контекст', shortLabel: 'Конт.', icon: '🧠' },
            ];
            const sourceItems = Array.isArray(window.HEYS?.Planning?.SUBNAV_ITEMS) && window.HEYS.Planning.SUBNAV_ITEMS.length > 0
                ? window.HEYS.Planning.SUBNAV_ITEMS
                : fallbackItems;

            return sourceItems
                .map((item) => ({
                    key: item.id || item.key,
                    label: item.label || item.shortLabel || item.id || item.key,
                    icon: item.icon || '•',
                }))
                .filter((item) => typeof item.key === 'string' && item.key.length > 0);
        }, []);
        const resolvedDefaultTasksSubtab = typeof defaultTasksSubtab === 'string' && defaultTasksSubtab.length > 0
            ? defaultTasksSubtab
            : 'calendar';
        const currentTasksHomeOption = React.useMemo(() => {
            return TASKS_HOME_SUBTAB_OPTIONS.find((option) => option.key === resolvedDefaultTasksSubtab)
                || TASKS_HOME_SUBTAB_OPTIONS.find((option) => option.key === 'calendar')
                || TASKS_HOME_SUBTAB_OPTIONS[0]
                || null;
        }, [TASKS_HOME_SUBTAB_OPTIONS, resolvedDefaultTasksSubtab]);

        const handlePickHomeTab = (nextTab) => {
            try {
                if (nextTab === 'tasks') {
                    setDefaultTab('tasks', { tasksSubtab: resolvedDefaultTasksSubtab });
                    HEYS.dayUtils?.haptic?.('light');
                    return;
                }

                setDefaultTab(nextTab);
                HEYS.dayUtils?.haptic?.('light');
                setSettingsMenuOpen(false);
            } catch (e) {
                // silent
            }
        };

        const handlePickTasksHomeSubtab = (nextSubtab) => {
            try {
                setDefaultTab('tasks', { tasksSubtab: nextSubtab });
                HEYS.dayUtils?.haptic?.('light');
                setSettingsMenuOpen(false);
            } catch (e) {
                // silent
            }
        };

        const primaryTabs = React.useMemo(() => {
            const items = [
                { key: 'stats', label: 'Отчёты', buttonLabel: 'Итоги', icon: '📊', id: 'tour-stats-tab' },
                { key: 'diary', label: 'Дневник', buttonLabel: 'Еда', icon: '🍴', id: 'tour-diary-tab' },
                { key: 'widgets', label: 'Виджеты', buttonLabel: 'Виджеты', icon: '🎛️', id: 'tour-widgets-tab' },
            ];

            if (!cloudUser && clientId) {
                items.push({
                    key: 'tasks',
                    label: 'Задачи',
                    buttonLabel: 'Задачи',
                    icon: '✓',
                    iconClassName: 'tab-icon tab-icon--tasks',
                    id: 'tour-tasks-tab',
                });
            }

            items.push(
                { key: 'insights', label: 'Инсайты', buttonLabel: 'Инсайты', icon: '🔮', id: 'tour-insights-tab' },
                { key: 'month', label: 'Месяц', buttonLabel: 'Месяц', icon: '📅', id: 'tour-month-tab' },
            );

            return items;
        }, [cloudUser, clientId]);

        const primaryTabsVariant = primaryTabs.length >= 6
            ? 'sext'
            : (primaryTabs.length === 5 ? 'quint' : (primaryTabs.length === 4 ? 'quad' : 'triple'));

        const switchTabWithUndoCommit = (nextTab, reason) => {
            try {
                if (window.HEYS?.Undo?.pending) {
                    console.info('[HEYS.tabs] 🧹 Commit pending undo before tab switch', {
                        currentTab: tab,
                        nextTab,
                        reason,
                    });
                    window.HEYS.Undo.commit(reason || 'tab-switch');
                }
            } catch (e) { }
            setTab(nextTab);
        };

        const handlePrimaryTabClick = (nextTab) => {
            if (widgetsEditMode) {
                setDefaultTab(nextTab);
            } else if (nextTab === 'widgets') {
                window.HEYS?.debugPanel?.handleTap();
            }
            switchTabWithUndoCommit(nextTab, `tab-${nextTab}-switch`);
        };

        React.useEffect(() => {
            if (settingsMenuOpen) setSettingsMenuOpen(false);
        }, [tab]);

        // Инициализация CRS для прогресс-бара, если он еще не был вычислен
        React.useEffect(() => {
            if (!window.HEYS?._lastCrs && window.HEYS?.CascadeCard?.computeCascadeState && clientId) {
                try {
                    const dateStr = selectedDate || window.HEYS.utils.getTodayStr();
                    const day = window.HEYS.utils.lsGet('heys_dayv2_' + dateStr, {});
                    const dayTot = window.HEYS.utils.lsGet('heys_dayTot_' + dateStr, {});
                    const prof = window.HEYS.utils.lsGet('heys_profile', {});
                    // v3.5.1: compute normAbs properly (same as buildNutritionState in day tab)
                    // heys_normAbs key is never written → was always {}, causing normKcal fallback
                    // to 2000 and triggering false deficit_overshoot penalties for users eating
                    // within their real TDEE-based goal.
                    const normPerc = window.HEYS.utils.lsGet('heys_norms', {});
                    const optimumInfo = window.HEYS.dayUtils?.getOptimumForDay?.(day, prof) || {};
                    const normAbs = (window.HEYS.dayCalculations?.computeDailyNorms && optimumInfo.optimum)
                        ? window.HEYS.dayCalculations.computeDailyNorms(optimumInfo.optimum, normPerc)
                        : { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 };
                    console.info('[HEYS.AppTabsNav] ✅ CRS init normAbs:', {
                        optimum: optimumInfo.optimum, normKcal: normAbs.kcal
                    });
                    const pIndex = window.HEYS.products?.getIndex ? window.HEYS.products.getIndex() : {};
                    const todayStr = window.HEYS.utils.getTodayStr();
                    window.HEYS.CascadeCard.computeCascadeState(day, dayTot, normAbs, prof, pIndex, {
                        silent: dateStr !== todayStr
                    });
                } catch (e) {
                    console.warn('[HEYS.AppTabsNav] Failed to init CRS:', e);
                }
            }
        }, [clientId, selectedDate]);

        return React.createElement(
            'div',
            {
                className: 'tabs'
                    + (widgetsEditMode ? ' tabs--edit-mode' : '')
                    + (settingsMenuOpen ? ' tabs--settings-open' : '')
                    + (primaryTabsVariant === 'sext' ? ' tabs--dense-switch' : '')
            },
            // Подсказка в режиме редактирования (внутри tabs для абсолютного позиционирования)
            widgetsEditMode && React.createElement(
                'div',
                { className: 'default-tab-hint' },
                React.createElement('span', { className: 'default-tab-hint__icon' }, '🏠'),
                React.createElement('span', { className: 'default-tab-hint__text' }, 'Нажми на вкладку, чтобы сделать её домашней'),
            ),
            // Советы — первая кнопка в меню
            React.createElement(
                'div',
                {
                    ref: adviceTabRef,
                    className: 'tab tab-advice' + (widgetsEditMode ? ' tab--disabled-home' : ''),
                    onClick: () => {
                        // PERF R13 FIX G: defer heysShowAdvice dispatch to avoid sync React render in click handler
                        // DayTabWithCloudSync is always mounted, no tab switch needed
                        console.warn('[advice-diag] 1️⃣ tab.tab-advice clicked (React onClick), dispatching heysShowAdvice');
                        setTimeout(() => {
                            console.warn('[advice-diag] 2️⃣ dispatching heysShowAdvice CustomEvent now');
                            window.dispatchEvent(new CustomEvent('heysShowAdvice'));
                        }, 0);
                    },
                },
                React.createElement('span', { className: 'tab-icon' }, '💡'),
                React.createElement('span', { className: 'tab-advice-badge', id: 'nav-advice-badge' }),
            ),
            // iOS Switch группа для stats/diary/widgets/insights/month/tasks — ПО ЦЕНТРУ + подписи
            React.createElement(
                'div',
                { className: 'tab-switch-wrapper tab-switch-wrapper--' + primaryTabsVariant },
                React.createElement(
                    'div',
                    { className: 'tab-switch-group tab-switch-group--' + primaryTabsVariant },
                    primaryTabs.map((item) => React.createElement(
                        'div',
                        {
                            key: item.key,
                            className: 'tab tab-switch ' + (tab === item.key ? 'active' : '') + (widgetsEditMode && defaultTab === item.key ? ' default-tab-indicator' : '') + (widgetsEditMode ? ' tab--home-candidate' : ''),
                            id: item.id,
                            title: item.label,
                            onClick: () => handlePrimaryTabClick(item.key),
                        },
                        widgetsEditMode && defaultTab === item.key && React.createElement('span', { className: 'default-home-badge', title: 'Эта вкладка открывается по умолчанию' }, '🏠'),
                        React.createElement('span', { className: item.iconClassName || 'tab-icon' }, item.icon),
                        React.createElement('span', { className: 'tab-text' }, item.buttonLabel),
                    )),
                ),
                // Подписи под переключателем
                React.createElement(
                    'div',
                    { className: 'tab-switch-labels tab-switch-labels--' + primaryTabsVariant },
                    primaryTabs.map((item) => React.createElement('span', {
                        key: item.key,
                        className: 'tab-switch-label' + (tab === item.key ? ' active' : ''),
                        title: item.label,
                        onClick: () => switchTabWithUndoCommit(item.key, `tab-label-${item.key}-switch`)
                    }, item.label)),
                ),
            ),
            // Настройки — раскрывающееся меню вверх
            React.createElement(
                'div',
                { className: 'tab-settings-wrap' },
                settingsMenuOpen && React.createElement('div', {
                    className: 'tab-settings-backdrop',
                    onClick: () => setSettingsMenuOpen(false)
                }),
                React.createElement(
                    'div',
                    {
                        className: 'tab ' + (tab === 'user' ? 'active' : '') + (widgetsEditMode ? ' tab--disabled-home' : ''),
                        onClick: () => {
                            if (widgetsEditMode) return;
                            setSettingsMenuOpen(!settingsMenuOpen);
                        },
                    },
                    React.createElement(
                        'span',
                        { className: 'tab-icon', style: { position: 'relative' } },
                        '⚙️',
                        isCuratorBadge && pendingCount > 0 && React.createElement(
                            'span',
                            {
                                className: 'tab-pending-badge',
                                'aria-label': `${pendingCount} pending`,
                            },
                            pendingCount > 99 ? '99+' : String(pendingCount)
                        )
                    ),
                    React.createElement('span', { className: 'tab-text' }, 'Настройки'),
                ),
                settingsMenuOpen && React.createElement(
                    'div',
                    { className: 'tab-settings-menu tab-settings-menu--with-home' },
                    React.createElement(
                        'div',
                        {
                            className: 'tab-settings-item',
                            onClick: () => {
                                setSettingsMenuOpen(false);
                                switchTabWithUndoCommit('user', 'tab-settings-user-switch');
                            }
                        },
                        React.createElement('span', { className: 'tab-settings-icon' }, '⚙️'),
                        React.createElement('span', null, 'Настройки')
                    ),
                    React.createElement(
                        'div',
                        {
                            className: 'tab-settings-item',
                            onClick: () => {
                                setSettingsMenuOpen(false);
                                switchTabWithUndoCommit('ration', 'tab-settings-ration-switch');
                            }
                        },
                        React.createElement('span', { className: 'tab-settings-icon' }, '📦'),
                        React.createElement('span', null, 'Список продуктов')
                    ),
                    React.createElement(
                        'div',
                        {
                            className: 'tab-settings-home-wrap',
                            role: 'group',
                            'aria-label': 'Выбор домашней вкладки',
                            onClick: (e) => e.stopPropagation(),
                        },
                        React.createElement('div', {
                            className: 'widgets-home-tab-picker tab-settings-home-picker',
                        },
                            React.createElement('div', { className: 'widgets-home-tab-picker__title' }, 'Домашняя вкладка'),
                            React.createElement('div', { className: 'widgets-home-tab-picker__hint' },
                                'С неё приложение откроется в следующий раз'
                            ),
                            defaultTab === 'tasks' && currentTasksHomeOption && React.createElement('div', {
                                className: 'widgets-home-tab-picker__current-subtab',
                            }, `Внутри задач откроется: ${currentTasksHomeOption.label}`),
                            React.createElement('div', { className: 'widgets-home-tab-picker__options' },
                                HOME_TAB_OPTIONS.map((option) => React.createElement('button', {
                                    key: option.key,
                                    type: 'button',
                                    className: `widgets-home-tab-picker__option ${defaultTab === option.key ? 'active' : ''}`,
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        handlePickHomeTab(option.key);
                                    },
                                    'aria-pressed': defaultTab === option.key,
                                    title: `Сделать домашней вкладкой: ${option.label}`,
                                },
                                    React.createElement('span', { className: 'widgets-home-tab-picker__option-icon' }, option.icon),
                                    React.createElement('span', { className: 'widgets-home-tab-picker__option-label' }, option.label),
                                    defaultTab === option.key && React.createElement('span', {
                                        className: 'widgets-home-tab-picker__option-badge',
                                        'aria-hidden': 'true',
                                    }, '🏠')
                                ))
                            ),
                            defaultTab === 'tasks' && canUseTasksAsHome && TASKS_HOME_SUBTAB_OPTIONS.length > 0 && React.createElement('div', {
                                className: 'widgets-home-tab-picker__subtabs',
                            },
                                React.createElement('div', { className: 'widgets-home-tab-picker__subtitle' }, 'Подвкладка задач'),
                                React.createElement('div', {
                                    className: 'widgets-home-tab-picker__hint widgets-home-tab-picker__hint--nested',
                                }, 'Что открыть внутри задач по умолчанию'),
                                React.createElement('div', {
                                    className: 'widgets-home-tab-picker__options widgets-home-tab-picker__options--nested',
                                },
                                    TASKS_HOME_SUBTAB_OPTIONS.map((option) => React.createElement('button', {
                                        key: option.key,
                                        type: 'button',
                                        className: `widgets-home-tab-picker__option widgets-home-tab-picker__option--subtab ${resolvedDefaultTasksSubtab === option.key ? 'active' : ''}`,
                                        onClick: (e) => {
                                            e.stopPropagation();
                                            handlePickTasksHomeSubtab(option.key);
                                        },
                                        'aria-pressed': resolvedDefaultTasksSubtab === option.key,
                                        title: `Открывать внутри задач: ${option.label}`,
                                    },
                                        React.createElement('span', { className: 'widgets-home-tab-picker__option-icon' }, option.icon),
                                        React.createElement('span', { className: 'widgets-home-tab-picker__option-label' }, option.label),
                                        resolvedDefaultTasksSubtab === option.key && React.createElement('span', {
                                            className: 'widgets-home-tab-picker__option-badge',
                                            'aria-hidden': 'true',
                                        }, '🏠')
                                    ))
                                )
                            )
                        )
                    )
                )
            ),
            // CRS Progress Bar (v3.1.0)
            window.HEYS?.CascadeCard?.CrsProgressBar && React.createElement(window.HEYS.CascadeCard.CrsProgressBar)
        );
    }

    var _lazyTabCache = Object.create(null);
    function _lazyTab(key, loaderKey, getComp) {
        if (!_lazyTabCache[key]) {
            _lazyTabCache[key] = React.lazy(function () {
                var loadFn = window.HEYS && window.HEYS[loaderKey];
                var p = loadFn ? loadFn() : Promise.resolve();
                return p.then(function () {
                    var comp = getComp();
                    return { default: comp || function _LazyTabPlaceholder() { return null; } };
                }).catch(function () {
                    return { default: function _LazyTabError() { return null; } };
                });
            });
        }
        return _lazyTabCache[key];
    }

    function AppTabContent(props) {
        const {
            tab,
            slideDirection,
            edgeBounce,
            onTouchStart,
            onTouchEnd,
            clientId,
            setTab,
            products,
            setProducts,
            selectedDate,
            setSelectedDate,
            cloudUser,
            defaultTasksSubtab,
            DayTabWithCloudSync,
            RationTabWithCloudSync,
            UserTabWithCloudSync,
        } = props;

        const [, _tickPostboot] = React.useReducer(function(n) { return n + 1; }, 0);
        React.useEffect(function() {
            window.addEventListener('heys:postboot-lazy-ready', _tickPostboot);
            return function() { window.removeEventListener('heys:postboot-lazy-ready', _tickPostboot); };
        }, []);

        const TAB_SKELETON_DELAY_MS = 240;
        const tabSkeletonSince = window.__heysTabSkeletonSince = window.__heysTabSkeletonSince || Object.create(null);
        const tabSkeletonState = window.__heysTabSkeletonState = window.__heysTabSkeletonState || Object.create(null);
        const renderTabFallback = (fallbackKey, fallbackNode) => {
            const now = Date.now();
            if (!tabSkeletonSince[fallbackKey]) {
                tabSkeletonSince[fallbackKey] = now;
            }
            const elapsedMs = now - tabSkeletonSince[fallbackKey];

            if (elapsedMs < TAB_SKELETON_DELAY_MS) {
                if (tabSkeletonState[fallbackKey] !== 'wait_delay') {
                    console.info('[HEYS.sceleton] ⏱️ tab_wait_delay', {
                        key: fallbackKey,
                        elapsedMs,
                        delayMs: TAB_SKELETON_DELAY_MS,
                        tab,
                    });
                    tabSkeletonState[fallbackKey] = 'wait_delay';
                }
                return null;
            }

            if (tabSkeletonState[fallbackKey] !== 'show_skeleton') {
                console.info('[HEYS.sceleton] 🦴 tab_show_skeleton', {
                    key: fallbackKey,
                    elapsedMs,
                    delayMs: TAB_SKELETON_DELAY_MS,
                    tab,
                });
                tabSkeletonState[fallbackKey] = 'show_skeleton';
            }

            return fallbackNode;
        };

        const tabFallbackSkeleton = (icon, label, minHeight) => React.createElement('div',
            { className: 'deferred-card-slot deferred-card-slot--loading', style: { padding: 16 } },
            React.createElement('div',
                {
                    className: 'deferred-card-skeleton',
                    style: { minHeight: (minHeight || 240) + 'px' }
                },
                React.createElement('div', { className: 'deferred-card-skeleton__shimmer' }),
                React.createElement('div', { className: 'deferred-card-skeleton__content' },
                    React.createElement('div', { className: 'deferred-card-skeleton__icon' }, icon),
                    React.createElement('div', { className: 'deferred-card-skeleton__label' }, label)
                )
            )
        );

        return React.createElement(
            'div',
            {
                className: 'tab-content-swipeable' +
                    (slideDirection === 'out-left' ? ' slide-out-left' : '') +
                    (slideDirection === 'out-right' ? ' slide-out-right' : '') +
                    (slideDirection === 'in-left' ? ' slide-in-left' : '') +
                    (slideDirection === 'in-right' ? ' slide-in-right' : '') +
                    (edgeBounce === 'left' ? ' edge-bounce-left' : '') +
                    (edgeBounce === 'right' ? ' edge-bounce-right' : ''),
                onTouchStart: onTouchStart,
                onTouchEnd: onTouchEnd,
            },
            // Edge indicators
            edgeBounce && React.createElement('div', {
                className: 'edge-indicator ' + edgeBounce
            }),
            // DayTabWithCloudSync is always mounted so heysShowAdvice listener is always active.
            // Advice overlay is position:fixed — it appears over any tab regardless of which is active.
            // height:0 + overflow:hidden hides regular content; fixed children are unclipped by overflow.
            React.createElement(
                'div',
                { style: (tab === 'stats' || tab === 'diary') ? undefined : { height: 0, overflow: 'hidden' } },
                wrapReactProfiler('DayTab', React.createElement(DayTabWithCloudSync, {
                    key: 'day_' + String(clientId || ''),
                    products,
                    clientId,
                    selectedDate,
                    setSelectedDate,
                    subTab: (tab === 'stats' || tab === 'diary') ? tab : 'stats',
                }))
            ),
            (tab !== 'stats' && tab !== 'diary') && (
                tab === 'ration'
                    ? wrapReactProfiler('RationTab', React.createElement(RationTabWithCloudSync, {
                        key: 'ration_' + String(clientId || ''),
                        products,
                        setProducts,
                        clientId,
                    }))
                    : tab === 'insights'
                        ? React.createElement(React.Suspense, { fallback: tabFallbackSkeleton('🔮', 'Готовим инсайты…', 280) },
                            wrapReactProfiler('InsightsTab', React.createElement(
                                _lazyTab('insights', '__loadPostboot3Ui', function() { return window.HEYS?.PredictiveInsights?.components?.InsightsTab; }),
                                {
                                    key: 'insights_' + String(clientId || '') + '_' + selectedDate,
                                    lsGet: window.HEYS?.utils?.lsGet,
                                    profile: null,
                                    pIndex: null,
                                    optimum: null,
                                    selectedDate: selectedDate,
                                }
                            )))
                        : tab === 'month'
                            ? React.createElement(React.Suspense, { fallback: tabFallbackSkeleton('📊', 'Готовим отчёты…', 280) },
                                React.createElement(
                                    _lazyTab('month', '__loadPostboot3Ui', function() { return window.HEYS?.ReportsTab; }),
                                    {
                                        key: 'month_' + String(clientId || '') + '_' + selectedDate,
                                        selectedDate: selectedDate,
                                        setSelectedDate: setSelectedDate,
                                        clientId: clientId,
                                    }
                                ))
                            : (tab === 'stats' || tab === 'diary')
                                ? null
                                : tab === 'user'
                                    ? React.createElement(UserTabWithCloudSync, {
                                        // NOTE: syncVer intentionally removed from key.
                                        // UserTab persists its own local form state and subscriptions,
                                        // while a syncVer-based remount causes visible "refreshes" in settings.
                                        key: 'user_' + String(clientId || ''),
                                        clientId,
                                    })
                                    : tab === 'overview'
                                        ? React.createElement(React.Suspense, { fallback: tabFallbackSkeleton('📋', 'Готовим обзор…', 200) },
                                            React.createElement(
                                                _lazyTab('overview', '__loadPostboot3Ui', function() { return window.HEYS?.DataOverviewTab; }),
                                                {
                                                    key: 'overview_' + String(clientId || ''),
                                                    clientId: clientId,
                                                    setTab: setTab,
                                                    setSelectedDate: setSelectedDate,
                                                }
                                            ))
                                        : tab === 'widgets'
                                            ? React.createElement(React.Suspense, { fallback: tabFallbackSkeleton('🧩', 'Готовим виджеты…', 200) },
                                                React.createElement(
                                                    _lazyTab('widgets', '__loadPostboot3Ui', function() { return window.HEYS?.Widgets?.WidgetsTab; }),
                                                    {
                                                        // NOTE: syncVer намеренно убран из key — WidgetsTab подписан на
                                                        // data:updated/day:updated события и не нуждается в remount при синке.
                                                        // syncVer в key вызывает flash всего контента вкладки.
                                                        key: 'widgets_' + String(clientId || '') + '_' + selectedDate,
                                                        clientId: clientId,
                                                        cloudUser: cloudUser,
                                                        selectedDate: selectedDate,
                                                        setTab: setTab,
                                                        setSelectedDate: setSelectedDate,
                                                    }
                                                ))
                                            : tab === 'tasks'
                                                ? ((!cloudUser && clientId)
                                                    ? React.createElement(React.Suspense, { fallback: tabFallbackSkeleton('✅', 'Готовим задачи…', 280) },
                                                        React.createElement(
                                                            _lazyTab('tasks', '__loadPostboot3Ui', function() { return window.HEYS?.PlanningTab; }),
                                                            {
                                                                key: 'tasks_' + String(clientId || ''),
                                                                clientId: clientId,
                                                                defaultHomeScreen: defaultTasksSubtab,
                                                            }
                                                        ))
                                                    : null)
                                                : renderTabFallback('default_' + String(tab || 'unknown'), tabFallbackSkeleton('📂', 'Готовим вкладку…', 280))
            )
        );
    }

    // Memoize sub-components before AppShell uses them
    const MemoAppHeader = React.memo(AppHeader);
    MemoAppHeader.displayName = 'AppHeader';

    const MemoAppTabsNav = React.memo(AppTabsNav);
    MemoAppTabsNav.displayName = 'AppTabsNav';

    const MemoAppTabContent = React.memo(AppTabContent);
    MemoAppTabContent.displayName = 'AppTabContent';

    function AppShell(props) {
        const { hideContent, clientId, tab } = props;
        const shouldRenderContent = !!clientId;
        let profilerMountKey = 'p0';
        try {
            profilerMountKey = heysReactProfilerEnabled() ? 'p1' : 'p0';
        } catch (_) { /* noop */ }

        return React.createElement(
            'div',
            {
                className: 'wrap' + (tab === 'tasks' ? ' wrap--no-header' : ''),
                style: hideContent ? { display: 'none' } : undefined
            },
            shouldRenderContent && React.createElement(
                'div',
                {
                    className: 'app-header-wrapper',
                    style: tab === 'tasks' ? { display: 'none' } : null,
                    'aria-hidden': tab === 'tasks' ? 'true' : undefined,
                    inert: tab === 'tasks' ? '' : undefined
                },
                React.createElement(MemoAppHeader, props)
            ),
            shouldRenderContent && React.createElement(MemoAppTabsNav, props),
            shouldRenderContent && React.createElement(MemoAppTabContent, Object.assign({}, props, {
                key: 'appTabContent_' + String(clientId || '') + '_' + profilerMountKey
            }))
        );
    }

    const MemoAppShell = React.memo(AppShell);
    MemoAppShell.displayName = 'AppShell';

    HEYS.AppShell = {
        AppShell: MemoAppShell,
        AppHeader: MemoAppHeader,
        AppTabsNav: MemoAppTabsNav,
        AppTabContent: MemoAppTabContent,
    };
})();
