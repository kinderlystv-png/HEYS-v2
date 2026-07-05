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
            setTimeout(function _heysShowAdviceDispatch() {
                try {
                    // Прямой вызов handler в обход event dispatch — надёжнее
                    // в курaторской сессии где event listener иногда не attached
                    // из-за race condition при mount/unmount DayTab.
                    if (typeof window.__heysShowAdviceHandler === 'function') {
                        try { window.__heysShowAdviceHandler(); } catch (_) { /* noop */ }
                    }
                    // Fallback dispatch — на случай других подписчиков на event.
                    window.dispatchEvent(new CustomEvent('heysShowAdvice'));
                } catch (_) { /* noop */ }
            }, 0);
        } catch (_) { /* noop */ }
    }, true);
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
        const [showOpsDashboard, setShowOpsDashboard] = React.useState(false);
        const [opsDashboard, setOpsDashboard] = React.useState(null);
        const [opsLoading, setOpsLoading] = React.useState(false);
        const [opsError, setOpsError] = React.useState('');
        const [opsLastCheck, setOpsLastCheck] = React.useState(null);
        const [opsCheckMessage, setOpsCheckMessage] = React.useState('');

        // Portal target: push-badge живёт в state app_shell, но рендерится слева от 🌙
        // в GamificationBar. См. heys_gamification_bar_v1.js → #push-badge-slot.
        const [pushBadgeSlot, setPushBadgeSlot] = React.useState(null);
        React.useEffect(() => {
            let cancelled = false;
            const find = () => {
                const el = document.getElementById('push-badge-slot');
                if (!cancelled) setPushBadgeSlot(el);
            };
            find();
            const t1 = setTimeout(find, 200);
            const t2 = setTimeout(find, 800);
            return () => { cancelled = true; clearTimeout(t1); clearTimeout(t2); };
        }, []);
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

        const loadOpsDashboard = React.useCallback(async () => {
            if (!window.HEYS?.YandexAPI?.rpc) {
                setOpsError('Ops API недоступен');
                return;
            }
            setOpsLoading(true);
            setOpsError('');
            setOpsCheckMessage('Загружаем текущий статус...');
            const startedAt = Date.now();
            try {
                console.info('[HEYS.ops.dashboard] request:start', { fn: 'admin_get_ops_status', refresh: false });
                const res = await window.HEYS.YandexAPI.rpc('admin_get_ops_status', {});
                if (res?.error) throw new Error(res.error.message || 'Ops API error');
                const data = res?.data?.admin_get_ops_status || res?.data || null;
                const tookMs = Date.now() - startedAt;
                setOpsDashboard(data);
                setOpsLastCheck({ at: Date.now(), fn: 'admin_get_ops_status', tookMs, ok: data?.ok === true });
                setOpsCheckMessage(`Статус загружен за ${tookMs} ms`);
                console.info('[HEYS.ops.dashboard] request:success', { fn: 'admin_get_ops_status', tookMs, ok: data?.ok === true, open: data?.counts?.open_incidents, backup: data?.backup?.status || null });
            } catch (e) {
                const tookMs = Date.now() - startedAt;
                setOpsError(e?.message || 'Не удалось загрузить ops статус');
                setOpsLastCheck({ at: Date.now(), fn: 'admin_get_ops_status', tookMs, ok: false, error: true });
                setOpsCheckMessage(`Проверка не завершилась: ${e?.message || 'ошибка'}`);
                console.error('[HEYS.ops.dashboard] request:error', { fn: 'admin_get_ops_status', tookMs, message: e?.message || String(e) });
            } finally {
                setOpsLoading(false);
            }
        }, []);

        const refreshOpsDashboard = React.useCallback(async () => {
            if (!window.HEYS?.YandexAPI?.rpc) {
                setOpsError('Ops API недоступен');
                return;
            }
            setOpsLoading(true);
            setOpsError('');
            setOpsCheckMessage('Запускаем серверную проверку...');
            const startedAt = Date.now();
            try {
                console.info('[HEYS.ops.dashboard] request:start', { fn: 'admin_refresh_ops_status', refresh: true });
                const res = await window.HEYS.YandexAPI.rpc('admin_refresh_ops_status', {});
                if (res?.error && /not allowed/i.test(res.error.message || '')) {
                    const fallback = await window.HEYS.YandexAPI.rpc('admin_get_ops_status', {});
                    if (fallback?.error) throw new Error(fallback.error.message || 'Ops API error');
                    const fallbackData = fallback?.data?.admin_get_ops_status || fallback?.data || null;
                    const tookMs = Date.now() - startedAt;
                    setOpsDashboard(fallbackData);
                    setOpsLastCheck({ at: Date.now(), fn: 'admin_get_ops_status', tookMs, ok: fallbackData?.ok === true, fallback: true });
                    setOpsCheckMessage(`Показан текущий статус за ${tookMs} ms`);
                    setOpsError('Refresh ещё не задеплоен на API; показан текущий статус');
                    console.info('[HEYS.ops.dashboard] request:fallback', { tookMs, open: fallbackData?.counts?.open_incidents, backup: fallbackData?.backup?.status || null });
                    return;
                }
                if (res?.error) throw new Error(res.error.message || 'Ops API error');
                const data = res?.data?.admin_refresh_ops_status || res?.data || null;
                const tookMs = Date.now() - startedAt;
                setOpsDashboard(data);
                setOpsLastCheck({ at: Date.now(), fn: 'admin_refresh_ops_status', tookMs, ok: data?.ok === true });
                setOpsCheckMessage(`Проверка завершена за ${tookMs} ms`);
                console.info('[HEYS.ops.dashboard] request:success', { fn: 'admin_refresh_ops_status', tookMs, ok: data?.ok === true, open: data?.counts?.open_incidents, backup: data?.backup?.status || null });
            } catch (e) {
                const tookMs = Date.now() - startedAt;
                setOpsError(e?.message || 'Не удалось проверить ops статус');
                setOpsLastCheck({ at: Date.now(), fn: 'admin_refresh_ops_status', tookMs, ok: false, error: true });
                setOpsCheckMessage(`Проверка не завершилась: ${e?.message || 'ошибка'}`);
                console.error('[HEYS.ops.dashboard] request:error', { fn: 'admin_refresh_ops_status', tookMs, message: e?.message || String(e) });
            } finally {
                setOpsLoading(false);
            }
        }, []);

        const openOpsDashboard = React.useCallback(() => {
            setShowOpsDashboard(true);
            void loadOpsDashboard();
        }, [loadOpsDashboard]);

        const opsLabelStyle = { fontSize: 12, color: 'var(--muted)', marginBottom: 6 };
        const opsValueStyle = { fontSize: 20, fontWeight: 750, marginBottom: 3 };
        const opsHintStyle = { fontSize: 12, color: 'var(--muted)' };
        const opsCardStyle = (ok) => ({
            padding: 14,
            borderRadius: 12,
            border: ok ? '1px solid #bbf7d0' : '1px solid #fecdd3',
            background: ok ? '#f0fdf4' : '#fff1f2',
            color: ok ? '#14532d' : '#991b1b'
        });

        const renderOpsDashboardModal = () => {
            if (!showOpsDashboard) return null;
            const statusOk = opsDashboard?.ok === true;
            const backup = opsDashboard?.backup || null;
            const heartbeats = Array.isArray(opsDashboard?.heartbeats) ? opsDashboard.heartbeats : [];
            const incidents = Array.isArray(opsDashboard?.incidents) ? opsDashboard.incidents : [];
            const deploys = Array.isArray(opsDashboard?.deploys) ? opsDashboard.deploys : [];
            const openIncidents = incidents.filter((item) => item.status === 'open');
            const staleHeartbeats = heartbeats.filter((item) => item.stale);
            const shortCommit = (value) => String(value || 'unknown').slice(0, 8);
            const lastCheckTime = opsLastCheck?.at ? new Date(opsLastCheck.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
            const renderRunbook = (item) => {
                const details = item?.details || {};
                const title = details.runbook_title;
                const command = details.runbook_command;
                const url = details.runbook_url;
                if (!title && !command && !url) return null;
                return React.createElement('div', {
                    style: {
                        marginTop: 8,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        alignItems: 'center',
                        fontSize: 12,
                        color: 'var(--muted)'
                    }
                },
                    title && React.createElement('span', null, title),
                    command && React.createElement('code', {
                        style: {
                            padding: '3px 6px',
                            borderRadius: 6,
                            background: 'rgba(15, 23, 42, 0.07)',
                            color: 'var(--text)',
                            fontSize: 12
                        }
                    }, command),
                    url && React.createElement('a', {
                        href: url,
                        target: '_blank',
                        rel: 'noreferrer',
                        style: { color: 'var(--accent)', textDecoration: 'none' }
                    }, 'runbook')
                );
            };

            return React.createElement('div', {
                className: 'ops-dashboard-backdrop',
                role: 'presentation',
                onClick: () => setShowOpsDashboard(false),
                style: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 2200,
                    background: 'rgba(15, 23, 42, 0.42)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16
                }
            },
                React.createElement('div', {
                    className: 'ops-dashboard-modal',
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': 'Ops dashboard',
                    onClick: (e) => e.stopPropagation(),
                    style: {
                        width: 'min(920px, calc(100vw - 32px))',
                        maxHeight: 'min(760px, calc(100vh - 32px))',
                        overflow: 'auto',
                        background: 'var(--card)',
                        color: 'var(--text)',
                        border: '1px solid var(--border)',
                        borderRadius: 16,
                        boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)'
                    }
                },
                    React.createElement('div', {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '18px 20px',
                            borderBottom: '1px solid var(--border)'
                        }
                    },
                        React.createElement('div', null,
                            React.createElement('div', {
                                style: { fontSize: 18, fontWeight: 700, marginBottom: 3 }
                            }, 'Ops dashboard'),
                            React.createElement('div', {
                                style: { fontSize: 13, color: 'var(--muted)' }
                            }, statusOk ? 'Серверные проверки без активных инцидентов' : 'Есть пункты, требующие внимания')
                        ),
                        React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                            React.createElement('button', {
                                type: 'button',
                                onClick: loadOpsDashboard,
                                disabled: opsLoading,
                                style: {
                                    minHeight: 36,
                                    padding: '8px 12px',
                                    borderRadius: 10,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg)',
                                    color: 'var(--text)',
                                    cursor: opsLoading ? 'default' : 'pointer'
                                }
                            }, opsLoading ? 'Обновляем' : 'Обновить'),
                            React.createElement('button', {
                                type: 'button',
                                onClick: refreshOpsDashboard,
                                disabled: opsLoading,
                                style: {
                                    minHeight: 36,
                                    padding: '8px 12px',
                                    borderRadius: 10,
                                    border: '1px solid #86efac',
	                                    background: '#f0fdf4',
	                                    color: '#14532d',
	                                    cursor: opsLoading ? 'default' : 'pointer',
                                        opacity: opsLoading ? 0.72 : 1
	                                }
	                            }, opsLoading ? 'Проверяем...' : 'Проверить сейчас'),
                            React.createElement('button', {
                                type: 'button',
                                'aria-label': 'Закрыть Ops dashboard',
                                onClick: () => setShowOpsDashboard(false),
                                style: {
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg)',
                                    color: 'var(--text)',
                                    cursor: 'pointer'
                                }
                            }, '×')
                        )
	                    ),
	                    React.createElement('div', { style: { padding: 20, display: 'grid', gap: 14 } },
	                        opsError && React.createElement('div', {
                            style: {
                                padding: 12,
                                borderRadius: 10,
                                background: '#fff1f2',
                                color: '#991b1b',
                                border: '1px solid #fecdd3',
                                fontSize: 13
	                            }
	                        }, opsError),
                            (opsLoading || opsCheckMessage || lastCheckTime) && React.createElement('div', {
                                role: 'status',
                                'aria-live': 'polite',
                                style: {
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    border: '1px solid var(--border)',
                                    background: opsLoading ? 'var(--bg)' : 'rgba(15, 23, 42, 0.04)',
                                    color: 'var(--text)',
                                    fontSize: 13,
                                    display: 'grid',
                                    gap: 2
                                }
                            },
                                React.createElement('div', { style: { fontWeight: 700 } }, opsLoading ? 'Проверка выполняется' : (opsLastCheck?.error ? 'Последняя проверка завершилась ошибкой' : 'Последняя проверка завершена')),
                                React.createElement('div', { style: { color: 'var(--muted)' } }, opsCheckMessage || (lastCheckTime ? `Обновлено в ${lastCheckTime}` : '')),
                                opsLastCheck && React.createElement('div', {
                                    style: {
                                        color: 'var(--muted)',
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                        overflowWrap: 'anywhere'
                                    }
                                }, `${opsLastCheck.fn || 'ops'} · ${lastCheckTime || '—'} · ${opsLastCheck.tookMs || 0} ms`)
                            ),
	                        React.createElement('div', {
                            style: {
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: 10
                            }
                        },
                            React.createElement('div', { className: 'ops-dashboard-card', style: opsCardStyle(statusOk) },
                                React.createElement('div', { style: opsLabelStyle }, 'Deploy / incidents'),
                                React.createElement('div', { style: opsValueStyle }, statusOk ? 'OK' : `${openIncidents.length} open`),
                                React.createElement('div', { style: opsHintStyle }, 'По данным БД timeline')
                            ),
                            React.createElement('div', { className: 'ops-dashboard-card', style: opsCardStyle(!backup || backup.status !== 'ok' || Number(backup.hours_ago || 999) > 30 ? false : true) },
                                React.createElement('div', { style: opsLabelStyle }, 'Backup'),
                                React.createElement('div', { style: opsValueStyle }, backup ? `${backup.status} · ${backup.hours_ago}h` : 'нет данных'),
                                React.createElement('div', { style: opsHintStyle }, backup ? `errors ${backup.error_count || 0}` : 'backup_run_log пуст')
                            ),
                            React.createElement('div', { className: 'ops-dashboard-card', style: opsCardStyle(staleHeartbeats.length === 0) },
                                React.createElement('div', { style: opsLabelStyle }, 'Heartbeats'),
                                React.createElement('div', { style: opsValueStyle }, staleHeartbeats.length ? `${staleHeartbeats.length} stale` : 'fresh'),
                                React.createElement('div', { style: opsHintStyle }, `${heartbeats.length} задач`)
                            )
                        ),
                        React.createElement('div', { style: { display: 'grid', gap: 8 } },
                            React.createElement('div', { style: { fontWeight: 700 } }, 'Активные инциденты'),
                            openIncidents.length === 0
                                ? React.createElement('div', { style: { color: 'var(--muted)', fontSize: 13 } }, 'Активных инцидентов нет')
                                : openIncidents.slice(0, 8).map((item) => React.createElement('div', {
                                    key: `${item.source}:${item.event_key}`,
                                    style: {
                                        padding: 12,
                                        borderRadius: 10,
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg)'
                                    }
                                },
                                    React.createElement('div', { style: { fontWeight: 650, marginBottom: 4 } }, item.title),
                                    React.createElement('div', { style: { fontSize: 12, color: 'var(--muted)' } },
                                        `${item.source} · ${item.severity} · ${item.occurrence_count || 1} раз`
                                    ),
                                    renderRunbook(item)
                                ))
                        ),
                        React.createElement('div', { style: { display: 'grid', gap: 8 } },
                            React.createElement('div', { style: { fontWeight: 700 } }, 'Deploy receipts'),
                            deploys.length === 0
                                ? React.createElement('div', { style: { color: 'var(--muted)', fontSize: 13 } }, 'Пока нет записей о deploy')
                                : deploys.slice(0, 5).map((item, index) => React.createElement('div', {
                                    key: `${item.deployed_at || index}:${item.deploy_group}`,
                                    style: {
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(120px, 1fr) minmax(90px, auto) minmax(80px, auto)',
                                        gap: 10,
                                        alignItems: 'center',
                                        padding: '8px 0',
                                        borderBottom: '1px solid var(--border)',
                                        fontSize: 13
                                    }
                                },
                                    React.createElement('span', null, `${item.deploy_group || 'unknown'} · ${shortCommit(item.deploy_commit)}`),
                                    React.createElement('span', { style: { color: item.status === 'ok' ? '#166534' : '#991b1b' } }, item.status || 'unknown'),
                                    React.createElement('span', { style: { color: item.canary_ok === false ? '#991b1b' : 'var(--muted)' } },
                                        item.canary_ok == null ? 'canary n/a' : (item.canary_ok ? 'canary ok' : 'canary failed')
                                    )
                                ))
                        ),
                        React.createElement('div', { style: { display: 'grid', gap: 8 } },
                            React.createElement('div', { style: { fontWeight: 700 } }, 'Heartbeats'),
                            heartbeats.slice(0, 10).map((item) => React.createElement('div', {
                                key: item.task,
                                style: {
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 10,
                                    padding: '8px 0',
                                    borderBottom: '1px solid var(--border)',
                                    fontSize: 13
                                }
                            },
                                React.createElement('span', null, item.task),
                                React.createElement('span', { style: { color: item.stale ? '#991b1b' : 'var(--muted)' } },
                                    item.stale ? `stale · ${item.minutes_ago}m` : `${item.minutes_ago}m`
                                )
                            ))
                        )
                    )
                )
            );
        };
        // Собирает полный отладочный отчёт о состоянии push-подписки.
        // Цель — пользователь может одним тапом скопировать всё в буфер и прислать.
        const buildPushDiagnostic = async (subscribeResult, exception) => {
            const lines = [];
            const safe = (fn, fallback = 'n/a') => { try { return fn(); } catch { return fallback; } };
            lines.push('=== HEYS Push Diagnostic ===');
            lines.push('Time: ' + new Date().toISOString());
            lines.push('URL: ' + safe(() => location.href));
            lines.push('UA: ' + safe(() => navigator.userAgent));
            lines.push('Standalone: ' + safe(() => window.matchMedia?.('(display-mode: standalone)').matches));
            lines.push('iOS standalone: ' + safe(() => navigator.standalone));
            lines.push('Notification API: ' + safe(() => 'Notification' in window));
            lines.push('Notification.permission: ' + safe(() => Notification?.permission));
            lines.push('ServiceWorker: ' + safe(() => 'serviceWorker' in navigator));
            lines.push('PushManager: ' + safe(() => 'PushManager' in window));
            lines.push('SW controller: ' + safe(() => !!navigator.serviceWorker?.controller));
            try {
                const reg = await navigator.serviceWorker?.ready;
                if (reg) {
                    const sub = await reg.pushManager.getSubscription();
                    lines.push('SW scope: ' + reg.scope);
                    lines.push('Subscription exists: ' + !!sub);
                    if (sub) lines.push('Subscription endpoint host: ' + new URL(sub.endpoint).host);
                }
            } catch (e) {
                lines.push('SW check error: ' + e?.message);
            }
            try {
                const status = await window.HEYS?.push?.getStatus?.();
                lines.push('HEYS.push.getStatus: ' + JSON.stringify(status));
            } catch (e) {
                lines.push('getStatus error: ' + e?.message);
            }
            lines.push('Cached pushStatus: ' + JSON.stringify(pushStatus));
            if (subscribeResult !== undefined) {
                lines.push('subscribe() returned: ' + JSON.stringify(subscribeResult));
            }
            if (exception) {
                lines.push('Exception: ' + exception?.message);
                if (exception?.stack) lines.push('Stack: ' + exception.stack.split('\n').slice(0, 3).join(' | '));
            }
            const cl = window.HEYS?.cloud;
            lines.push('Curator: ' + safe(() => !!cl?.currentCuratorId));
            lines.push('Client: ' + safe(() => window.HEYS?.currentClientId || 'none'));
            return lines.join('\n');
        };

        const copyToClipboard = async (text) => {
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                    return true;
                }
            } catch { /* fallthrough */ }
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                return ok;
            } catch { return false; }
        };

        const handlePushBadgeClick = async () => {
            // Если уже подписан и устройство, и сервер согласны — переходим на settings.
            if (pushStatus?.subscribed && window.HEYS?.push) {
                if (typeof haptic === 'function') haptic('light');
                switchTabWithUndoCommit('user', 'push-settings-badge');
                setTimeout(() => window.dispatchEvent(new CustomEvent('heys:scroll-to-push-settings')), 80);
                return;
            }

            // Иначе пробуем подписаться и в любом случае собираем диагностику
            setPushBusy(true);
            let subscribeResult, exception;
            try {
                if (window.HEYS?.push?.subscribe) {
                    subscribeResult = await window.HEYS.push.subscribe();
                }
                const s = await window.HEYS?.push?.getStatus?.();
                if (s) setPushStatus(s);
            } catch (e) {
                exception = e;
                console.warn('[push.badge] subscribe failed:', e?.message, e);
            } finally {
                setPushBusy(false);
            }

            const report = await buildPushDiagnostic(subscribeResult, exception);
            const copied = await copyToClipboard(report);

            // Короткий человеческий summary поверх + полный отчёт уже в буфере
            let summary;
            if (subscribeResult?.ok === true) {
                summary = '✅ Подписка успешно создана.';
            } else if (subscribeResult?.reason === 'ios_needs_install') {
                summary = 'iPhone Safari: нужно «Поделиться → На экран Домой» и запустить с иконки.';
            } else if (subscribeResult?.reason === 'permission_denied' || subscribeResult?.reason === 'permission_blocked') {
                summary = 'Браузер заблокировал. Site Settings → Notifications → Allow → перезагрузить.';
            } else if (subscribeResult?.reason === 'not_capable') {
                summary = 'Браузер не поддерживает Web Push.';
            } else if (exception) {
                summary = 'Ошибка: ' + (exception.message || 'unknown');
            } else if (subscribeResult?.ok === false) {
                summary = 'Не подписалось: ' + (subscribeResult.reason || 'unknown');
            } else {
                summary = 'Состояние не изменилось. Полный лог скопирован.';
            }
            alert(
              summary + '\n\n' +
              (copied ? '📋 Полный диагностический лог скопирован в буфер обмена — пришли в чат.' : '⚠ Не удалось скопировать в буфер. Лог в консоли DevTools.') +
              '\n\nКраткая выжимка:\n' + report
            );
            if (!copied) console.log(report);
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
        // MessengerAPI owns polling/backoff; shell only mirrors its cache.
        const [messengerInbox, setMessengerInbox] = React.useState({});
        React.useEffect(() => {
            if (isRpcMode) return; // только для куратора
            if (!showClientDropdown) return;
            let cancelled = false;
            const applyCache = (cache) => {
                if (cancelled) return;
                setMessengerInbox(cache && typeof cache === 'object' ? cache : {});
            };
            const refresh = () => {
                try {
                    applyCache(window.HEYS?.MessengerAPI?.getInboxCache?.() || {});
                } catch { /* ignore */ }
            };
            const onInboxUpdated = (event) => {
                applyCache(event?.detail || {});
            };
            refresh();
            window.addEventListener('heys:messenger-inbox-updated', onInboxUpdated);
            const onClientChanged = () => { refresh(); };
            window.addEventListener('heys:client-changed', onClientChanged);
            return () => {
                cancelled = true;
                window.removeEventListener('heys:messenger-inbox-updated', onInboxUpdated);
                window.removeEventListener('heys:client-changed', onClientChanged);
            };
        }, [isRpcMode, showClientDropdown]);
        const totalUnread = React.useMemo(() => {
            return Object.values(messengerInbox).reduce((s, v) => s + (v?.unread_count || 0), 0);
        }, [messengerInbox]);
        // ☁️ Cloud Sync Badge State (v2.0): auto-fade synced→idle, lastSyncedAt tracking
        const [displayStatus, setDisplayStatus] = React.useState(cloudStatus);
        const lastSyncedAtRef = React.useRef(null);
        const syncFadeTimerRef = React.useRef(null);
        const [checkinStatus, setCheckinStatus] = React.useState(null);

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
            let lastDetectAt = 0; // PERF v7.3: throttle post-sync re-detect (защита от secondary loop через heysSyncCompleted после cloud upload heys_ews_* ключей)
            // PERF v7.4: single-flight promise — boot fires mount() + 'heys-ews-ready' event +
            // 'heysSyncCompleted' near-concurrently; without dedup all three start a detect.
            let detectInFlight = null;
            const POST_SYNC_DETECT_MIN_GAP_MS = 30_000;

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

                    // PERF v7.4: single-flight dedup. If detect is already running, await
                    // the same promise — prevents triple concurrent detect at boot.
                    if (detectInFlight) {
                        console.info('ews / badge ⏭️ detect already in-flight, awaiting existing');
                        return detectInFlight;
                    }

                    console.info('ews / badge ✅ EWS module detected');

                    // PERF v7.4: stamp lastDetectAt BEFORE await so post-sync throttle
                    // (POST_SYNC_DETECT_MIN_GAP_MS) sees the in-flight call rather than
                    // lastDetectAt=0 → Infinity gap → bypass throttle.
                    lastDetectAt = Date.now();

                    detectInFlight = (async () => {
                        const _t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
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
                        lastDetectAt = Date.now();

                        const _t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        const _durMs = Math.round(_t1 - _t0);
                        if (result.available) {
                            setEWSData(result);
                            if (result.count > 0) {
                                console.info('ews / badge ✅ Badge data loaded:', {
                                    duration_ms: _durMs,
                                    count: result.count,
                                    high: result.highSeverityCount,
                                    medium: result.count - result.highSeverityCount,
                                    daysAnalyzed: days.length,
                                    daysRequested: 7,
                                    hasWarnings: Array.isArray(result.warnings) && result.warnings.length > 0,
                                });
                            } else {
                                console.info('ews / badge ✅ All OK (no warnings):', {
                                    duration_ms: _durMs,
                                    daysAnalyzed: days.length,
                                    daysRequested: 7,
                                    status: 'healthy'
                                });
                            }
                        } else {
                            setEWSData({ count: 0, highSeverityCount: 0, available: false, warnings: [] });
                            console.info('ews / badge ℹ️ EWS unavailable — showing neutral badge:', {
                                duration_ms: _durMs,
                                reason: result.reason || 'insufficient_data',
                                daysAnalyzed: days.length,
                                daysRequested: 7,
                            });
                        }
                    })();

                    try {
                        await detectInFlight;
                    } finally {
                        detectInFlight = null;
                    }
                } catch (err) {
                    console.warn('ews / badge ⚠️ Failed to load EWS data:', err.message);
                    setEWSData({ count: 0, highSeverityCount: 0, available: false, warnings: [] });
                    detectInFlight = null;
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
                        // PERF v7.3: throttle — heys_ews_* writes сами генерируют heysSyncCompleted
                        // через CLIENT_SPECIFIC_KEYS cloud upload, что без guard'а зацикливало бы
                        // detect → write → sync-complete → detect. Если < 30s от прошлого detect —
                        // skip, иначе сбрасываем ewsLoaded и перезапускаем.
                        const sinceLastDetect = lastDetectAt > 0 ? (Date.now() - lastDetectAt) : Infinity;
                        if (sinceLastDetect < POST_SYNC_DETECT_MIN_GAP_MS) {
                            console.info('ews / badge ⏭️ post-sync detect throttled', {
                                reason,
                                sinceLastDetectMs: Math.round(sinceLastDetect),
                                minGapMs: POST_SYNC_DETECT_MIN_GAP_MS
                            });
                            return;
                        }
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

            // Safety-net poll. Real updates already come via day-data-changed
            // and heysSyncCompleted events — 5min was wasteful (12 detects/hour
            // on idle sessions). 30min keeps the fallback without spamming.
            const interval = setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden) return;
                ewsLoaded = false;
                loadEWSData();
            }, 30 * 60 * 1000);

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

        React.useEffect(() => {
            const refresh = (event) => {
                try {
                    const status = event?.detail?.status || HEYS?.MorningCheckinDebug?.getStatus?.();
                    setCheckinStatus(status && typeof status === 'object' ? status : null);
                } catch (_) {
                    setCheckinStatus(null);
                }
            };
            refresh();
            window.addEventListener('heys:morning-checkin-status', refresh);
            window.addEventListener('heys:checkin-complete', refresh);
            window.addEventListener('heys:day-updated', refresh);
            window.addEventListener('heysSyncCompleted', refresh);
            return () => {
                window.removeEventListener('heys:morning-checkin-status', refresh);
                window.removeEventListener('heys:checkin-complete', refresh);
                window.removeEventListener('heys:day-updated', refresh);
                window.removeEventListener('heysSyncCompleted', refresh);
            };
        }, [clientIdValue, todayISO]);

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
            const rt = {};
            let currentCheckinStatus = null;
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
                const formatCheckinStatusLines = (status) => {
                    if (!status) return ['  (MorningCheckinDebug unavailable)'];
                    const lines = [];
                    const age = status.updatedAt ? `${Date.now() - status.updatedAt}ms ago` : '—';
                    lines.push(`  state: ${status.state} · ${status.label}`);
                    lines.push(`  date: ${status.dateKey}  flowId: ${status.flowId || '—'}  flowStatus: ${status.flowStatus || '—'}  updated: ${age}`);
                    lines.push(`  sessionDone: ${!!status.sessionDone}  counts: ${JSON.stringify(status.counts || {})}`);
                    lines.push(`  corePresence: ${JSON.stringify(status.corePresence || {})}`);
                    lines.push('  --- steps (id | status | data | error) ---');
                    (status.steps || []).forEach((step) => {
                        lines.push(`  ${String(step.id).padEnd(18)} | ${String(step.status || '—').padEnd(12)} | data=${step.completeByData ? 'Y' : 'N'} | ${step.error || '—'}`);
                    });
                    return lines;
                };
                currentCheckinStatus = (() => {
                    try { return HEYS?.MorningCheckinDebug?.getStatus?.() || checkinStatus || null; }
                    catch (_) { return checkinStatus || null; }
                })();
                // Runtime state
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
                    rt.queueDebug = HEYS?.cloud?.getQueueDebug?.() || null;
                    rt.retryDebug = HEYS?.cloud?.getRetryDebug?.() || null;
                    rt.yandexDebug = HEYS?.YandexAPI?._debug?.() || null;
                } catch (_) { }
                // Per-key sizing of pending queue + last upload error
                const fmtKB = (b) => b >= 0 ? (b / 1024).toFixed(1) + 'KB' : '?';
                const fmtAgo = (ts) => {
                    if (!ts) return '—';
                    const sec = Math.floor((Date.now() - ts) / 1000);
                    if (sec < 60) return `${sec}s ago`;
                    if (sec < 3600) return `${Math.floor(sec / 60)}m${sec % 60}s ago`;
                    return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m ago`;
                };
                let queueStateLines = [];
                try {
                    const q = rt.queueDebug;
                    const r = rt.retryDebug;
                    const y = rt.yandexDebug;
                    if (q) {
                        const hungWarn = (q.uploadInProgress && q.uploadStartedAt && (Date.now() - q.uploadStartedAt) > 30000) ? '  ⚠ HUNG?' : '';
                        queueStateLines.push(`upload:       inProgress=${q.uploadInProgress} ${q.uploadInProgress ? `(started ${fmtAgo(q.uploadStartedAt)}, ${q.uploadInFlightCount} items)` : '(idle)'}${hungWarn}`);
                        queueStateLines.push(`last ok:      ${fmtAgo(q.lastUploadOkAt)}`);
                        queueStateLines.push(`last fail:    ${fmtAgo(q.lastUploadFailAt)}`);
                        const noTimerWarn = (!q.clientUpsertTimerSet && q.clientQueueLen > 0 && !q.uploadInProgress) ? '  ⚠ NO TIMER but queue has items!' : '';
                        queueStateLines.push(`nextPush:     timer ${q.clientUpsertTimerSet ? `SET (scheduled ${fmtAgo(q.clientUpsertTimerSetAt)})` : 'OFF'}${noTimerWarn}`);
                    }
                    if (r) {
                        const capWarn = (r.retryAttempt >= r.maxRetryAttempts) ? '  ⚠ MAX CAP' : '';
                        queueStateLines.push(`retry:        attempt=${r.retryAttempt}/${r.maxRetryAttempts}  nextDelay=${r.retryDelayMs}ms${capWarn}`);
                        queueStateLines.push(`canSync:      rpcOnly=${r.rpcOnlyMode}  hasUser=${r.hasUser}  pin=${r.pinAuthClientId ? r.pinAuthClientId.slice(0, 8) + '***' : '—'}`);
                    }
                    if (y) {
                        queueStateLines.push(`yandexApi:    online=${y.isOnline}  lastError=${y.lastError ? `"${y.lastError}" (${fmtAgo(y.lastErrorAt)})` : '— (none)'}`);
                    }
                } catch (_) { /* noop */ }
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
                // 2026-05-29 deep diag: собираем дополнительные секции в текст для clipboard
                const extraLines = [];
                const pushKV = (label, val) => {
                    if (val === null || val === undefined) extraLines.push(`  ${label}: —`);
                    else if (typeof val === 'object') {
                        try { extraLines.push(`  ${label}: ${JSON.stringify(val)}`); }
                        catch (_) { extraLines.push(`  ${label}: <object>`); }
                    } else extraLines.push(`  ${label}: ${val}`);
                };
                const pushHeader = (h) => { extraLines.push(''); extraLines.push(`=== ${h} ===`); };
                try {
                    pushHeader('Cloud flags');
                    pushKV('_switchClientInProgress', HEYS?.cloud?._switchClientInProgress);
                    pushKV('_rpcOnlyMode', HEYS?.cloud?._rpcOnlyMode);
                    pushKV('_syncCompletedAt', HEYS?.cloud?._syncCompletedAt
                        ? `${HEYS.cloud._syncCompletedAt} (${Math.round((Date.now() - HEYS.cloud._syncCompletedAt) / 1000)}s ago)` : null);
                    pushKV('_curatorSession', !!HEYS?.auth?.isCuratorSession?.());
                    pushKV('_pinAuthClientId(isPinAuthClient)', typeof HEYS?.cloud?.isPinAuthClient === 'function'
                        ? HEYS.cloud.isPinAuthClient() : null);
                    pushKV('currentClientId', HEYS?.currentClientId);

                    pushHeader('Document state');
                    pushKV('visibilityState', typeof document !== 'undefined' ? document.visibilityState : null);
                    pushKV('hasFocus', typeof document !== 'undefined' && document.hasFocus ? document.hasFocus() : null);
                    pushKV('navigator.onLine', typeof navigator !== 'undefined' ? navigator.onLine : null);
                    pushKV('location', typeof location !== 'undefined' ? location.href : null);

                    pushHeader('Current day (LS lookup)');
                    const dayData = (() => {
                        try {
                            const lsRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem('heys_client_current') : null;
                            const cid = lsRaw ? String(lsRaw).replace(/^"|"$/g, '') : null;
                            const today = new Date().toISOString().slice(0, 10);
                            const key = cid ? ('heys_' + cid + '_dayv2_' + today) : ('heys_dayv2_' + today);
                            const raw = localStorage.getItem(key);
                            return raw ? JSON.parse(raw) : null;
                        } catch (_) { return null; }
                    })();
                    if (dayData) {
                        pushKV('date', dayData.date);
                        pushKV('updatedAt', dayData.updatedAt ? `${dayData.updatedAt} (${Date.now() - dayData.updatedAt}ms ago)` : null);
                        pushKV('savedDisplayOptimum', dayData.savedDisplayOptimum);
                        pushKV('savedEatenKcal', dayData.savedEatenKcal);
                        pushKV('mealsCount', Array.isArray(dayData.meals) ? dayData.meals.length : 0);
                        pushKV('weightMorning', dayData.weightMorning);
                        pushKV('sleepHours', dayData.sleepHours);
                    } else {
                        extraLines.push('  (no day data in LS)');
                    }

                    pushHeader('Morning check-in control');
                    formatCheckinStatusLines(currentCheckinStatus).forEach(line => extraLines.push(line));

                    // === Day React state vs LS divergence (render-desync diagnostics, Phase B) ===
                    pushHeader('Day React state vs LS divergence');
                    try {
                        const reactDay = (HEYS.Day && typeof HEYS.Day.getDay === 'function') ? HEYS.Day.getDay() : null;
                        const flatItems = (d) => {
                            const out = [];
                            (d && Array.isArray(d.meals) ? d.meals : []).forEach((m, mi) => {
                                (m && Array.isArray(m.items) ? m.items : []).forEach((it) => {
                                    if (it && it.id != null) out.push({ id: String(it.id), meal: mi, grams: it.grams, ts: it.updatedAt });
                                });
                            });
                            return out;
                        };
                        const rItems = flatItems(reactDay);
                        const lItems = flatItems(dayData);
                        const lById = new Map(lItems.map(i => [i.id, i]));
                        const rById = new Map(rItems.map(i => [i.id, i]));
                        const rTs = (reactDay && reactDay.updatedAt) || 0;
                        const lTs = (dayData && dayData.updatedAt) || 0;
                        pushKV('react_day_updatedAt', rTs);
                        pushKV('ls_day_updatedAt', lTs);
                        pushKV('ts_match', rTs === lTs);
                        pushKV('react_total_items', rItems.length);
                        pushKV('ls_total_items', lItems.length);
                        const onlyReact = rItems.filter(i => !lById.has(i.id)).map(i => i.id);
                        const onlyLs = lItems.filter(i => !rById.has(i.id)).map(i => i.id);
                        const diffGrams = rItems.filter(i => lById.has(i.id) && lById.get(i.id).grams !== i.grams)
                            .map(i => `${i.id}:R${i.grams}/L${lById.get(i.id).grams}`);
                        const diffTs = rItems.filter(i => lById.has(i.id) && (lById.get(i.id).ts || 0) !== (i.ts || 0))
                            .map(i => `${i.id}:R${i.ts}/L${lById.get(i.id).ts}`);
                        pushKV('items_only_in_react', onlyReact.length ? onlyReact.join(',') : '—');
                        pushKV('items_only_in_ls', onlyLs.length ? onlyLs.join(',') : '—');
                        pushKV('items_diff_grams', diffGrams.length ? diffGrams.join(', ') : '—');
                        pushKV('items_diff_ts', diffTs.length ? diffTs.join(', ') : '—');
                        const blockUntil = (HEYS.Day && typeof HEYS.Day.getBlockUntil === 'function') ? HEYS.Day.getBlockUntil() : 0;
                        pushKV('is_blocking_cloud_updates', (HEYS.Day && typeof HEYS.Day.isBlockingCloudUpdates === 'function') ? HEYS.Day.isBlockingCloudUpdates() : null);
                        pushKV('block_until_in_ms', blockUntil ? (blockUntil - Date.now()) : 0);
                        pushKV('last_loaded_updatedAt', (HEYS.Day && typeof HEYS.Day.getLastLoadedUpdatedAt === 'function') ? HEYS.Day.getLastLoadedUpdatedAt() : null);
                        // Pending-mutation registry (2026-06-08 curator add-item fix Phase 2)
                        try {
                            const pendings = (HEYS.Day && typeof HEYS.Day.listPendingMutations === 'function')
                                ? HEYS.Day.listPendingMutations() : [];
                            pushKV('pending_day_mutations', pendings.length
                                ? pendings.map(p => `${p.date}(${Math.round(p.ageMs / 100) / 10}s)`).join(', ')
                                : '—');
                        } catch (_) { pushKV('pending_day_mutations', '<error>'); }
                        const divergent = (rTs === lTs) && (onlyReact.length || onlyLs.length || diffGrams.length);
                        pushKV('VERDICT', divergent ? '⚠️ RENDER-DESYNC (same updatedAt, different content)'
                            : (rTs !== lTs ? 'updatedAt differs (sync in flight)' : 'in sync'));
                        const dec = (window.HEYS && window.HEYS._dayDiagBuffers && Array.isArray(window.HEYS._dayDiagBuffers.applyDecisions))
                            ? window.HEYS._dayDiagBuffers.applyDecisions : [];
                        if (dec.length) {
                            extraLines.push('  --- recent apply decisions (last 30: ago_ms | source | decision) ---');
                            dec.slice(-30).reverse().forEach(d => extraLines.push(
                                `  ${Date.now() - d.ts}ms | ${d.source} | ${d.decision}${d.reason ? ' (' + d.reason + ')' : ''}`));
                        } else {
                            extraLines.push('  (no apply decisions recorded — day-update handler did not reach any branch)');
                        }
                        // curator-batch dayv2 delivery trace (PIN↔curator asymmetry diag)
                        try {
                            const d2 = HEYS && HEYS.cloud && HEYS.cloud._lastCuratorDayv2Diag;
                            if (d2) {
                                extraLines.push('  --- curator hot-sync dayv2 trace (' + (Date.now() - d2.at) + 'ms ago) ---');
                                extraLines.push('    fetched: ' + (d2.fetched && d2.fetched.length ? d2.fetched.join(', ') : '∅ (NOT in keysToFetch)'));
                                extraLines.push('    server returned: ' + (d2.returned && d2.returned.length
                                    ? d2.returned.map(r => r.k + (r.hasV ? '✓' : '∅')).join(', ') : '∅ (server returned no dayv2)'));
                            }
                        } catch (_) { /* noop */ }
                    } catch (e) {
                        extraLines.push('  (diagnostics error: ' + (e && e.message ? e.message : e) + ')');
                    }

                    // === Write history ===
                    const wh = Array.isArray(HEYS?.cloud?._writeHistory) ? HEYS.cloud._writeHistory : [];
                    pushHeader(`Write history (last 50, total tracked: ${wh.length})`);
                    if (wh.length > 0) {
                        const now = Date.now();
                        const recent = wh.filter(w => (now - w.ts) < 30000);
                        const perKey = {};
                        recent.forEach(w => { perKey[w.k] = (perKey[w.k] || 0) + 1; });
                        const hot = Object.entries(perKey).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
                        if (hot.length > 0) {
                            extraLines.push('  🔥 HOT WRITES last 30s (≥3): ' + hot.map(([k, n]) => `${k}=${n}`).join(', '));
                        } else {
                            extraLines.push('  (no hot writes in last 30s)');
                        }
                        extraLines.push('  --- last 50 writes (ago_ms | key | caller) ---');
                        wh.slice(-50).forEach(w => {
                            const caller = (w.callers && w.callers[0]) ? w.callers[0].slice(0, 90) : '—';
                            extraLines.push(`  ${String(now - w.ts).padStart(5)}ms | ${String(w.k).padEnd(35)} | ${caller}`);
                        });
                    } else {
                        extraLines.push('  (empty — saveKey not called yet)');
                    }

                    // === Event history ===
                    const eh = Array.isArray(HEYS?._eventHistory) ? HEYS._eventHistory : [];
                    pushHeader(`Event history (last 50 heys:* / heysSyncCompleted, total: ${eh.length})`);
                    if (eh.length > 0) {
                        const now = Date.now();
                        const recent = eh.filter(e => (now - e.ts) < 30000);
                        const perType = {};
                        recent.forEach(e => { perType[e.type] = (perType[e.type] || 0) + 1; });
                        const hotEv = Object.entries(perType).filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]);
                        if (hotEv.length > 0) {
                            extraLines.push('  🔥 HOT EVENTS last 30s (≥5): ' + hotEv.map(([t, n]) => `${t}=${n}`).join(', '));
                        } else {
                            extraLines.push('  (no hot events in last 30s)');
                        }
                        extraLines.push('  --- last 50 events (ago_ms | type | detail) ---');
                        eh.slice(-50).forEach(e => {
                            extraLines.push(`  ${String(Date.now() - e.ts).padStart(5)}ms | ${String(e.type).padEnd(28)} | ${e.detail || ''}`);
                        });
                    } else {
                        extraLines.push('  (empty)');
                    }

                    // === Auth tokens ===
                    pushHeader('Auth tokens (LS presence)');
                    pushKV('heys_curator_session', !!(typeof localStorage !== 'undefined' && localStorage.getItem('heys_curator_session')));
                    pushKV('heys_session_token', !!(typeof localStorage !== 'undefined' && localStorage.getItem('heys_session_token')));
                    pushKV('heys_pin_auth_client', !!(typeof localStorage !== 'undefined' && localStorage.getItem('heys_pin_auth_client')));
                    pushKV('heys_supabase_auth_token', !!(typeof localStorage !== 'undefined' && localStorage.getItem('heys_supabase_auth_token')));

                    // === Sync config + retry ===
                    // NOTE (2026-06-03): значения ниже — СТАТИЧЕСКОЕ зеркало литералов из
                    // heys_storage_supabase_v1.js (PENDING_SAVE_DEBOUNCE_MS:3050,
                    // CASCADE_DCS_ENQUEUE_DEBOUNCE_MS:9661). Они НЕ читаются из источника —
                    // при изменении констант там это зеркало молча устареет.
                    // Фаза 2: заменить на live HEYS.cloud.getSyncConstants().
                    pushHeader('Sync config (static mirror — verify vs storage) + retry');
                    pushKV('PENDING_SAVE_DEBOUNCE_MS', 120);
                    pushKV('CASCADE_DCS_ENQUEUE_DEBOUNCE_MS', 380);
                    pushKV('SWITCH_DEBOUNCE_MS', 30000);
                    pushKV('MAX_RETRY_ATTEMPTS', 5);
                    pushKV('GRACE_PERIOD_MS', 10000);
                    pushKV('retryDebug', typeof HEYS?.cloud?.getRetryDebug === 'function' ? HEYS.cloud.getRetryDebug() : null);

                    // === Network ===
                    pushHeader('Network (Network Information API)');
                    const conn = (typeof navigator !== 'undefined') && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
                    pushKV('onLine', typeof navigator !== 'undefined' ? navigator.onLine : null);
                    pushKV('effectiveType', conn ? conn.effectiveType : null);
                    pushKV('downlink_Mbps', conn ? conn.downlink : null);
                    pushKV('downlinkMax', conn ? conn.downlinkMax : null);
                    pushKV('rtt_ms', conn ? conn.rtt : null);
                    pushKV('saveData', conn ? conn.saveData : null);
                    pushKV('userAgent', typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : null);

                    // === Storage (LS scan) ===
                    pushHeader('Storage — localStorage scan');
                    const lsInfo = (() => {
                        try {
                            if (typeof localStorage === 'undefined') return null;
                            let count = 0, totalBytes = 0;
                            const perPrefix = {};
                            for (let i = 0; i < localStorage.length; i++) {
                                const k = localStorage.key(i);
                                const v = localStorage.getItem(k) || '';
                                const sz = k.length + v.length;
                                count++;
                                totalBytes += sz;
                                const m = k.match(/^([^_]+_[^_]+)/);
                                const bucket = m ? m[1] : '(other)';
                                perPrefix[bucket] = (perPrefix[bucket] || 0) + sz;
                            }
                            const top = Object.entries(perPrefix).sort((a, b) => b[1] - a[1]).slice(0, 10);
                            return { keyCount: count, totalKB: Math.round(totalBytes / 1024), top };
                        } catch (_) { return null; }
                    })();
                    if (lsInfo) {
                        pushKV('keyCount', lsInfo.keyCount);
                        pushKV('totalKB', lsInfo.totalKB);
                        extraLines.push('  top 10 buckets by prefix (kb):');
                        lsInfo.top.forEach(([p, b]) => extraLines.push(`    ${p}: ${Math.round(b / 1024)}KB`));
                    } else {
                        extraLines.push('  (LS unavailable)');
                    }

                    // === Recent upload performance (60s) ===
                    pushHeader('Recent upload perf (last 60s, from sync log)');
                    try {
                        const log = typeof HEYS?.cloud?.getSyncLog === 'function' ? HEYS.cloud.getSyncLog() : [];
                        const now = Date.now();
                        const recent = log.filter(e => e && e.ts && (now - e.ts) < 60000);
                        const oks = recent.filter(e => e.type === 'upload_ok');
                        const fails = recent.filter(e => e.type === 'upload_fail' || e.type === 'upload_error');
                        const starts = recent.filter(e => e.type === 'upload_start');
                        const latencies = oks.map(e => Number(e?.details?.ms) || 0).filter(x => x > 0);
                        const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
                        const sorted = [...latencies].sort((a, b) => a - b);
                        const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
                        const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
                        const maxL = sorted[sorted.length - 1] || 0;
                        const successRate = (oks.length + fails.length) > 0
                            ? Math.round((oks.length / (oks.length + fails.length)) * 100) : null;
                        pushKV('starts', starts.length);
                        pushKV('oks', oks.length);
                        pushKV('fails', fails.length);
                        pushKV('successPct', successRate);
                        pushKV('avg_ms', avg);
                        pushKV('p50_ms', p50);
                        pushKV('p95_ms', p95);
                        pushKV('max_ms', maxL);
                        pushKV('uploadsPerMin', oks.length);
                        // last 5 min hot upload keys
                        const log5min = log.filter(e => e && e.ts && (now - e.ts) < 300000 && e.type === 'upload_start');
                        const perKey5m = {};
                        log5min.forEach(e => {
                            const keys = String(e?.details?.keys || '').split(',').map(s => s.trim()).filter(Boolean);
                            keys.forEach(k => { perKey5m[k] = (perKey5m[k] || 0) + 1; });
                        });
                        const hotUploadKeys = Object.entries(perKey5m).filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]).slice(0, 10);
                        if (hotUploadKeys.length > 0) {
                            extraLines.push('  🔥 HOT UPLOAD KEYS last 5min (≥5): ' + hotUploadKeys.map(([k, n]) => `${k}=${n}`).join(', '));
                        }
                        const lastOk = (typeof HEYS?.cloud?._lastUploadOkAt === 'number') ? HEYS.cloud._lastUploadOkAt : null;
                        pushKV('idleSinceLastOk_sec', lastOk ? Math.round((Date.now() - lastOk) / 1000) : null);
                        pushKV('backlogVsRate', (rt.pending > 0 && oks.length > 0)
                            ? Math.round(rt.pending / Math.max(oks.length / 60, 0.01)) + 's to drain'
                            : '—');
                    } catch (_) { /* noop */ }

                    // === Service Worker (sync part) ===
                    pushHeader('Service Worker (sync state)');
                    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
                        const sw = navigator.serviceWorker;
                        pushKV('controllerActive', !!sw.controller);
                        pushKV('controllerScriptURL', sw.controller ? sw.controller.scriptURL : null);
                        pushKV('controllerState', sw.controller ? sw.controller.state : null);
                    } else {
                        extraLines.push('  (navigator.serviceWorker unavailable)');
                    }

                    // === Network fetches (Resource Timing) ===
                    pushHeader('Network fetches (Performance Resource Timing, last 60s, /rpc|/rest|/api|client_kv_store|push|messages)');
                    try {
                        if (typeof performance !== 'undefined' && performance.getEntriesByType) {
                            const all = performance.getEntriesByType('resource');
                            const cutoff = (typeof performance.now === 'function') ? performance.now() - 60000 : 0;
                            const syncRe = /\/(rpc|rest|api|client_kv_store|push|messages)\b/i;
                            const matches = all.filter(r => r.startTime >= cutoff && syncRe.test(r.name)).slice(-30);
                            if (matches.length > 0) {
                                extraLines.push('  total_ms | TTFB | DNS | TCP | tx | size_kb | url');
                                matches.forEach(r => {
                                    const url = r.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 70);
                                    const totalMs = Math.round(r.duration);
                                    const ttfb = Math.round(r.responseStart - r.requestStart);
                                    const dns = Math.round(r.domainLookupEnd - r.domainLookupStart);
                                    const tcp = Math.round(r.connectEnd - r.connectStart);
                                    const tx = Math.round(r.responseEnd - r.responseStart);
                                    const sz = r.transferSize ? Math.round(r.transferSize / 1024) : '—';
                                    extraLines.push(`  ${String(totalMs).padStart(7)} | ${String(ttfb).padStart(4)} | ${String(dns).padStart(3)} | ${String(tcp).padStart(3)} | ${String(tx).padStart(3)} | ${String(sz).padStart(6)} | ${url}`);
                                });
                                const totals = matches.map(r => r.duration);
                                const sortedT = [...totals].sort((a, b) => a - b);
                                extraLines.push(`  --- ${matches.length} fetches: avg=${Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)}ms p50=${Math.round(sortedT[Math.floor(sortedT.length * 0.5)] || 0)}ms p95=${Math.round(sortedT[Math.floor(sortedT.length * 0.95)] || 0)}ms max=${Math.round(sortedT[sortedT.length - 1] || 0)}ms`);
                            } else {
                                extraLines.push('  (no matching fetches in last 60s)');
                            }
                        }
                    } catch (_) { /* noop */ }

                    // === Long tasks ===
                    pushHeader('Long tasks last 60s (PerformanceObserver longtask >50ms)');
                    try {
                        const lt = Array.isArray(HEYS?._longtaskHistory) ? HEYS._longtaskHistory : [];
                        const now = Date.now();
                        const recent = lt.filter(t => (now - t.ts) < 60000);
                        if (recent.length > 0) {
                            const total = recent.reduce((s, t) => s + t.dur_ms, 0);
                            extraLines.push(`  🐢 ${recent.length} long tasks in 60s, total ${total}ms blocked`);
                            extraLines.push('  --- last 20 (ago_ms | dur_ms | name | attribution) ---');
                            recent.slice(-20).forEach(t => {
                                extraLines.push(`  ${String(now - t.ts).padStart(5)}ms | ${String(t.dur_ms).padStart(5)}ms | ${String(t.name).padEnd(20)} | ${t.attribution.join(',')}`);
                            });
                        } else {
                            extraLines.push('  (no longtasks — main thread quiet or browser unsupported)');
                        }
                    } catch (_) { /* noop */ }

                    // === Memory ===
                    pushHeader('Memory (Chrome only)');
                    try {
                        if (typeof performance !== 'undefined' && performance.memory) {
                            const m = performance.memory;
                            pushKV('usedJSHeap_MB', Math.round(m.usedJSHeapSize / 1024 / 1024));
                            pushKV('totalJSHeap_MB', Math.round(m.totalJSHeapSize / 1024 / 1024));
                            pushKV('heapLimit_MB', Math.round(m.jsHeapSizeLimit / 1024 / 1024));
                            pushKV('usagePct', Math.round((m.usedJSHeapSize / m.jsHeapSizeLimit) * 100));
                        } else {
                            extraLines.push('  (performance.memory unavailable — non-Chrome)');
                        }
                    } catch (_) { /* noop */ }

                    // === Client upsert queue RAW ===
                    pushHeader('Client upsert queue raw (top 10 by size)');
                    try {
                        const raw = typeof HEYS?.cloud?.getClientQueueRaw === 'function' ? HEYS.cloud.getClientQueueRaw() : [];
                        if (raw.length > 0) {
                            extraLines.push('  bytes | key | client_id | user_id | updatedAt');
                            raw.forEach(it => {
                                extraLines.push(`  ${String(it.bytes).padStart(6)} | ${String(it.k || '?').padEnd(35)} | ${it.client_id || '—'} | ${it.user_id || '—'} | ${it.updatedAt || '—'}`);
                            });
                        } else {
                            extraLines.push('  (queue empty)');
                        }
                    } catch (_) { /* noop */ }

                    // === All cloud._* private flags ===
                    pushHeader('All cloud._* private flags (auto-enum)');
                    try {
                        if (HEYS?.cloud) {
                            // 2026-06-03: снапшот уходит в буфер обмена — редактируем секреты/PII.
                            // _anonKey (JWT) и подобные ключи режем целиком; UUID (clientId,
                            // curatorId, contextId) маскируем до 8 символов.
                            const SENSITIVE_KEY_RE = /key|token|secret|anon|jwt|password|auth/i;
                            const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
                            const maskUuids = (s) => String(s).replace(UUID_RE, m => m.slice(0, 8) + '***');
                            const keys = Object.keys(HEYS.cloud).filter(k => k.startsWith('_')).sort();
                            keys.forEach(k => {
                                const v = HEYS.cloud[k];
                                const t = typeof v;
                                if (t === 'function') return;
                                if (SENSITIVE_KEY_RE.test(k)) { extraLines.push(`  ${k}: <redacted ${t}>`); return; }
                                if (t === 'object' && v !== null) {
                                    if (Array.isArray(v)) {
                                        extraLines.push(`  ${k}: Array(${v.length})`);
                                    } else {
                                        try {
                                            const s = maskUuids(JSON.stringify(v));
                                            extraLines.push(`  ${k}: ${s.length > 120 ? s.slice(0, 120) + '…' : s}`);
                                        } catch (_) { extraLines.push(`  ${k}: <unstringifiable>`); }
                                    }
                                } else {
                                    extraLines.push(`  ${k}: ${maskUuids(v)}`);
                                }
                            });
                        }
                    } catch (_) { /* noop */ }

                    // === ECHO LOOP HYPOTHESIS — autosave ↔ hot-sync correlation ===
                    pushHeader('Echo-loop hypothesis (autosave ↔ hot-sync correlation)');
                    try {
                        // 2026-06-03: переписано на ЖИВЫЕ счётчики. Прошлая версия читала
                        // HEYS._autosaveFlushes — массив, который НИКТО не заполняет, поэтому
                        // секция всегда рапортовала "no echo" (в т.ч. во время реального
                        // dayv2-шторма 59/мин). Теперь сигнатура выводится из _saveClientKeyHistory
                        // (dayv2-writes) и _hotsyncApplies — оба заполняются боевым кодом.
                        const now = Date.now();
                        const sckh = Array.isArray(HEYS?.cloud?._saveClientKeyHistory) ? HEYS.cloud._saveClientKeyHistory : [];
                        const ha = Array.isArray(HEYS?._hotsyncApplies) ? HEYS._hotsyncApplies : [];
                        const dayWrites = sckh.filter(w => String(w.k || '').includes('dayv2_'));
                        const dayWrites30 = dayWrites.filter(w => (now - w.ts) < 30000);
                        const ha30 = ha.filter(h => (now - h.ts) < 30000);
                        pushKV('dayv2Writes_last30s', dayWrites30.length);
                        pushKV('hotsyncApplies_last30s', ha30.length);
                        pushKV('hotsyncAppliesTotal', ha.length);
                        // Storm-сигнатура: подряд идущие dayv2-writes с ОДИНАКОВЫМ размером,
                        // но РАЗНЫМ updatedAt = переписывание идентичного контента (то, что
                        // глушит content-hash dedup). Прямой индикатор петли.
                        let identicalChurn = 0;
                        for (let i = 1; i < dayWrites30.length; i++) {
                            const a = dayWrites30[i - 1], b = dayWrites30[i];
                            if (a.bytes === b.bytes && a.updatedAt !== b.updatedAt) identicalChurn++;
                        }
                        pushKV('identicalContentChurn_last30s', identicalChurn);
                        // Echo: dayv2-write, прилетевший <1500ms ПОСЛЕ hot-sync apply.
                        let echoWrites = 0;
                        dayWrites30.forEach(w => {
                            if (ha.some(h => h.ts <= w.ts && (w.ts - h.ts) < 1500)) echoWrites++;
                        });
                        pushKV('writesAfterHotsync_lt1500ms', echoWrites);
                        if (dayWrites30.length >= 20 && identicalChurn >= 5) {
                            extraLines.push(`  🔥 STORM/ECHO SUSPECT: ${dayWrites30.length} dayv2-writes/30s, ${identicalChurn} переписей идентичного контента (same bytes, new updatedAt). Сигнатура петли.`);
                        } else if (echoWrites >= 5) {
                            extraLines.push(`  ⚠ ${echoWrites} dayv2-writes прилетели <1500ms после hot-sync — возможный server-merge feedback cycle`);
                        } else {
                            extraLines.push('  (no storm/echo signature in last 30s)');
                        }
                        pushKV('interceptDedupHits', HEYS?._interceptDedupHits || 0);
                        pushKV('muteMirrorCurrent', HEYS?._muteMirrorCurrent);

                        extraLines.push('  --- last 12 dayv2 writes (ago_ms | bytes | updatedAt | mute) ---');
                        dayWrites.slice(-12).forEach(w => {
                            extraLines.push(`  ${String(now - w.ts).padStart(6)}ms | ${w.bytes}b | ${w.updatedAt || '—'} | mute=${w.muteMirror ? 'Y' : 'N'}`);
                        });
                        extraLines.push('  --- last 12 hot-sync applies (ago_ms | baseKey | bytes | source | updatedAt) ---');
                        ha.slice(-12).forEach(h => {
                            extraLines.push(`  ${String(now - h.ts).padStart(6)}ms | ${String(h.baseKey).padEnd(35)} | ${h.bytes}b | ${h.source} | ${h.updatedAt || '—'}`);
                        });
                    } catch (_) { /* noop */ }

                    // === Products/day hot-sync forensic snapshot ===
                    pushHeader('Products/day hot-sync forensic snapshot');
                    try {
                        const now = Date.now();
                        const cid = String(clientIdValue || HEYS?.currentClientId || HEYS?.cloud?.getCurrentClientId?.() || '').replace(/^"|"$/g, '');
                        const date = selectedDate || resolvedTodayISO || new Date().toISOString().slice(0, 10);
                        const scoped = (base) => cid ? `heys_${cid}_${base}` : base;
                        const safeParse = (raw, fallback) => {
                            try { return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
                        };
                        const readStored = (base, fallback) => {
                            try {
                                if (typeof HEYS?.store?.get === 'function') {
                                    const v = HEYS.store.get(base, null);
                                    if (v != null) return v;
                                }
                            } catch (_) { /* noop */ }
                            try {
                                const rawScoped = localStorage.getItem(scoped(base));
                                if (rawScoped != null) return safeParse(rawScoped, fallback);
                            } catch (_) { /* noop */ }
                            try {
                                const rawBase = localStorage.getItem(base);
                                if (rawBase != null) return safeParse(rawBase, fallback);
                            } catch (_) { /* noop */ }
                            return fallback;
                        };
                        const normName = (value) => String(value || '')
                            .trim()
                            .toLowerCase()
                            .replace(/[ё]/g, 'е')
                            .replace(/[«»"']/g, '')
                            .replace(/\s+/g, ' ');
                        const countItems = (day) => {
                            const meals = Array.isArray(day?.meals) ? day.meals : [];
                            return meals.reduce((sum, meal) => sum + (Array.isArray(meal?.items) ? meal.items.length : 0), 0);
                        };
                        const buildProductIndex = (list) => {
                            const byId = new Map();
                            const byName = new Map();
                            (Array.isArray(list) ? list : []).forEach((p) => {
                                if (!p) return;
                                [p.id, p.product_id, p.shared_origin_id].filter(v => v != null && v !== '').forEach((id) => byId.set(String(id), p));
                                const n = normName(p.name || p.title);
                                if (n) byName.set(n, p);
                            });
                            return { byId, byName };
                        };
                        const resolveItem = (item, personalIndex, sharedIndex) => {
                            if (!item) return { source: 'missing', name: '' };
                            const ids = [item.product_id, item.productId, item.productID, item.id].filter(v => v != null && v !== '').map(String);
                            for (const id of ids) {
                                const personal = personalIndex.byId.get(id);
                                if (personal) return { source: 'visible:id', name: personal.name || '' };
                                const shared = sharedIndex.byId.get(id);
                                if (shared) return { source: 'shared:id', name: shared.name || '' };
                            }
                            const name = normName(item.name || item.productName);
                            if (name) {
                                const personal = personalIndex.byName.get(name);
                                if (personal) return { source: 'visible:name', name: personal.name || '' };
                                const shared = sharedIndex.byName.get(name);
                                if (shared) return { source: 'shared:name', name: shared.name || '' };
                            }
                            const hasInline = item.kcal100 != null || item.protein100 != null || item.prot100 != null || item.fat100 != null || item.carbs100 != null;
                            return { source: hasInline ? 'inline-stamp' : 'missing', name: '' };
                        };
                        const listFingerprint = (list) => {
                            if (!Array.isArray(list) || list.length === 0) return '0:0';
                            let hash = 2166136261 >>> 0;
                            for (let i = 0; i < list.length; i++) {
                                const p = list[i] || {};
                                const token = `${p.id || ''}|${p.shared_origin_id || ''}|${p.name || ''}|${p.updatedAt || ''}|${p._custom ? 1 : 0}`;
                                for (let j = 0; j < token.length; j++) {
                                    hash ^= token.charCodeAt(j);
                                    hash = Math.imul(hash, 16777619) >>> 0;
                                }
                            }
                            return `${list.length}:${hash.toString(16)}`;
                        };
                        const dayKey = scoped(`dayv2_${date}`);
                        const overlayRows = readStored('heys_products_overlay_v2', []);
                        const legacyProducts = readStored('heys_products', []);
                        const visibleProducts = typeof HEYS?.products?.getAll === 'function' ? HEYS.products.getAll() : [];
                        const sharedProducts = typeof HEYS?.cloud?.getCachedSharedProducts === 'function' ? HEYS.cloud.getCachedSharedProducts() : [];
                        const personalIndex = buildProductIndex(visibleProducts);
                        const sharedIndex = buildProductIndex(sharedProducts);
                        const day = readStored(`heys_dayv2_${date}`, null) || readStored(`dayv2_${date}`, null);
                        const overlayTails = [];
                        for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i);
                            if (!k || !k.includes('products_overlay_v2_rpc_tail')) continue;
                            if (cid && !k.startsWith(`heys_${cid}_`)) continue;
                            const raw = localStorage.getItem(k) || '';
                            const arr = safeParse(raw, []);
                            overlayTails.push({ key: k.replace(cid, cid ? cid.slice(0, 8) + '***' : ''), bytes: raw.length, rows: Array.isArray(arr) ? arr.length : null });
                        }
                        const overlayTypeA = Array.isArray(overlayRows) ? overlayRows.filter(r => r && !r._custom).length : 0;
                        const overlayTypeB = Array.isArray(overlayRows) ? overlayRows.filter(r => r && r._custom === true).length : 0;
                        pushKV('client', cid ? cid.slice(0, 8) + '***' : '—');
                        pushKV('selectedDate', date);
                        pushKV('overlayDiag', typeof HEYS?.diagnostics?.overlay === 'function' ? HEYS.diagnostics.overlay() : null);
                        pushKV('overlayRows', Array.isArray(overlayRows) ? `${overlayRows.length} (TypeA=${overlayTypeA}, TypeB=${overlayTypeB}, fp=${listFingerprint(overlayRows)})` : 'not-array');
                        pushKV('legacyProducts', Array.isArray(legacyProducts) ? `${legacyProducts.length} (fp=${listFingerprint(legacyProducts)})` : 'not-array');
                        pushKV('visibleProducts', Array.isArray(visibleProducts) ? `${visibleProducts.length} (fp=${listFingerprint(visibleProducts)})` : 'not-array');
                        pushKV('sharedProducts', Array.isArray(sharedProducts) ? `${sharedProducts.length} (fp=${listFingerprint(sharedProducts)})` : 'not-array');
                        pushKV('overlayTailKeys', overlayTails);
                        if (day) {
                            const meals = Array.isArray(day.meals) ? day.meals : [];
                            pushKV('dayKey', dayKey.replace(cid, cid ? cid.slice(0, 8) + '***' : ''));
                            pushKV('dayUpdatedAt', day.updatedAt ? `${day.updatedAt} (${now - day.updatedAt}ms ago)` : null);
                            pushKV('dayMealsItems', `${meals.length} meals / ${countItems(day)} items`);
                            extraLines.push('  --- day meal items (meal | product_id | itemId | productName | grams | resolve) ---');
                            meals.forEach((meal, mealIdx) => {
                                const items = Array.isArray(meal?.items) ? meal.items : [];
                                items.forEach((item) => {
                                    const resolved = resolveItem(item, personalIndex, sharedIndex);
                                    const productId = item?.product_id || item?.productId || item?.productID || '—';
                                    const itemId = item?.id || '—';
                                    extraLines.push(`  ${meal?.name || meal?.title || mealIdx} | ${productId} | ${itemId} | ${String(item?.name || item?.productName || '—').slice(0, 80)} | ${item?.grams ?? item?.weight ?? '—'} | ${resolved.source}${resolved.name ? ':' + String(resolved.name).slice(0, 40) : ''}`);
                                });
                            });
                        } else {
                            pushKV('dayKey', dayKey.replace(cid, cid ? cid.slice(0, 8) + '***' : ''));
                            pushKV('day', 'missing');
                        }
                        pushKV('hotSyncStatus', typeof HEYS?.cloud?.hotSync?.status === 'function' ? HEYS.cloud.hotSync.status() : null);
                        pushKV('lastForegroundHotSync', HEYS?.cloud?._lastForegroundHotSync || null);
                        pushKV('recentHotSyncApplies', Array.isArray(HEYS?._hotsyncApplies) ? HEYS._hotsyncApplies.slice(-20) : []);
                        pushKV('recentDayv2Blocks', Array.isArray(HEYS?._hotsyncDayv2Blocks) ? HEYS._hotsyncDayv2Blocks.slice(-10) : []);
                        pushKV('recentPlanningBlocks', Array.isArray(HEYS?._hotsyncPlanningBlocks) ? HEYS._hotsyncPlanningBlocks.slice(-10) : []);
                        pushHeader('Planning sync parity');
                        const planningParity = typeof HEYS?.Planning?.Store?.getPlanningSyncParitySnapshot === 'function'
                            ? HEYS.Planning.Store.getPlanningSyncParitySnapshot()
                            : null;
                        if (planningParity && Array.isArray(planningParity.keys)) {
                            pushKV('clientId', planningParity.clientId);
                            pushKV('lastReadback', planningParity.lastReadback || null);
                            planningParity.keys.forEach((row) => {
                                const local = row.local || {};
                                const cloud = row.cloud || {};
                                const cloudAge = Number.isFinite(row.cloudAgeMs) ? ` cloudAge=${row.cloudAgeMs}ms` : '';
                                const persistAge = Number.isFinite(row.lastPersistAgeMs) ? ` lastPersistAge=${row.lastPersistAgeMs}ms` : '';
                                extraLines.push(`  ${row.key}: class=${row.class} status=${row.status} confirm=${row.confirmStatus || 'unknown'} local=${local.length ?? local.kind}:${local.hash || '—'} cloud=${cloud.length ?? cloud.kind ?? '—'}:${cloud.hash || '—'} localOnly=${row.localOnlyCount || 0} remoteOnly=${row.remoteOnlyCount || 0}${cloudAge}${persistAge}`);
                                if ((row.localOnlyCount || 0) > 0 || (row.remoteOnlyCount || 0) > 0) {
                                    extraLines.push(`    diff localOnlyIds=${(row.localOnlyIds || []).join(',') || '—'} remoteOnlyIds=${(row.remoteOnlyIds || []).join(',') || '—'}`);
                                }
                                if (row.lastPersist && ((row.localOnlyCount || 0) > 0 || row.confirmStatus === 'pending-readback')) {
                                    extraLines.push(`    lastPersist key=${row.lastPersist.key} status=${row.lastPersist.status || '—'} reason=${row.lastPersist.reason || '—'} sync=${row.lastPersist.sync ? 'Y' : 'N'}`);
                                }
                                if (row.key === 'heys_planning_chrono_timer') {
                                    extraLines.push('    note: localOnly=true (active stopwatch is not uploaded by design)');
                                }
                            });
                            pushKV('recentPersistHistory', planningParity.recentPersistHistory || []);
                        } else {
                            extraLines.push('  (Planning.Store parity snapshot unavailable)');
                        }
                    } catch (prodDiagErr) {
                        extraLines.push('  products/day forensic snapshot failed: ' + (prodDiagErr?.message || prodDiagErr));
                    }

                    // === saveClientKey history (second write path, parallel to saveKey) ===
                    pushHeader('saveClientKey history (last 50, dayv2 + client-specific keys path)');
                    try {
                        const sckh = Array.isArray(HEYS?.cloud?._saveClientKeyHistory) ? HEYS.cloud._saveClientKeyHistory : [];
                        pushKV('totalTracked', sckh.length);
                        if (sckh.length > 0) {
                            const now = Date.now();
                            const recent = sckh.filter(w => (now - w.ts) < 30000);
                            const perKey = {};
                            recent.forEach(w => { perKey[w.k] = (perKey[w.k] || 0) + 1; });
                            const hot = Object.entries(perKey).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
                            if (hot.length > 0) {
                                extraLines.push('  🔥 HOT saveClientKey last 30s (≥3): ' + hot.map(([k, n]) => `${k}=${n}`).join(', '));
                            }
                            extraLines.push('  --- last 50 (ago_ms | key | bytes | updatedAt | muteMirror | caller-chain top-7) ---');
                            sckh.slice(-50).forEach(w => {
                                const cs = Array.isArray(w.callers) ? w.callers : [];
                                const callerChain = cs.length
                                    ? cs.slice(0, 7).map(s => String(s || '').replace(/^at\s+/, '').replace(/\s+\(http[^)]+\)/, '').slice(0, 55)).join(' ← ')
                                    : '—';
                                extraLines.push(`  ${String(now - w.ts).padStart(5)}ms | ${String(w.k).padEnd(35)} | ${w.bytes}b | ${w.updatedAt || '—'} | mute=${w.muteMirror ? 'Y' : 'N'} | ${callerChain}`);
                            });
                        } else {
                            extraLines.push('  (empty — saveClientKey not called or instrumentation not loaded)');
                        }
                    } catch (_) { /* noop */ }

                    // === LSSET dayv2 dedup (anti-loop) ===
                    pushHeader('LSSET dayv2 dedup (anti-loop, suppress identical writes)');
                    try {
                        const ds = window.__heysLsSetDayv2Dedup;
                        if (ds) {
                            const now = Date.now();
                            const last30s = ds.suppressed.filter(s => (now - s.ts) < 30000).length;
                            const last5s = ds.suppressed.filter(s => (now - s.ts) < 5000).length;
                            pushKV('totalSuppressed', ds.totalSuppressed || 0);
                            pushKV('suppressed_last30s', last30s);
                            pushKV('suppressed_last5s', last5s);
                            pushKV('capturedAt', ds.capturedAt ? new Date(ds.capturedAt).toISOString() : '—');
                            if (ds.capturedStack) {
                                extraLines.push('  --- captured first-occurrence stack (un-truncated) ---');
                                ds.capturedStack.split('\n').slice(0, 20).forEach(line => {
                                    extraLines.push('  ' + line);
                                });
                            } else {
                                extraLines.push('  (no duplicates captured — loop ушёл или ещё не воспроизводился)');
                            }
                        } else {
                            extraLines.push('  (dedup instrumentation не загружен)');
                        }
                    } catch (_) { /* noop */ }

                    // === Cascade + EWS frequency ===
                    pushHeader('Cascade + EWS compute frequency (loop-trigger detection)');
                    try {
                        const cs = HEYS?._cascadeStats;
                        if (cs) {
                            const now = Date.now();
                            const last30s = cs.recent.filter(r => (now - r.ts) < 30000).length;
                            const last5s = cs.recent.filter(r => (now - r.ts) < 5000).length;
                            pushKV('cascadeTotal', cs.count);
                            pushKV('cascadeLast30s', last30s);
                            pushKV('cascadeLast5s', last5s);
                            pushKV('cascadeLastFireAgo_ms', cs.lastTs ? (now - cs.lastTs) : null);
                            if (last5s >= 3) {
                                extraLines.push(`  🔥 CASCADE COMPUTE HOT: ${last5s} раз за 5с (norm <1) — это loop trigger!`);
                            }
                        } else {
                            extraLines.push('  (cascade stats unavailable)');
                        }
                        const es = HEYS?._ewsStats;
                        if (es) {
                            const now = Date.now();
                            const last30s = es.recent.filter(r => (now - r.ts) < 30000).length;
                            const last5s = es.recent.filter(r => (now - r.ts) < 5000).length;
                            pushKV('ewsTotal', es.count);
                            pushKV('ewsLast30s', last30s);
                            pushKV('ewsLast5s', last5s);
                            pushKV('ewsLastFireAgo_ms', es.lastTs ? (now - es.lastTs) : null);
                            if (last5s >= 3) {
                                extraLines.push(`  🔥 EWS DETECT HOT: ${last5s} раз за 5с (norm <1) — это loop trigger!`);
                            }
                        } else {
                            extraLines.push('  (ews stats unavailable)');
                        }
                    } catch (_) { /* noop */ }

                    // === Session runtime ===
                    pushHeader('Session runtime');
                    pushKV('sessionAgeSec', typeof performance !== 'undefined' && performance.timeOrigin
                        ? Math.round((Date.now() - performance.timeOrigin) / 1000) : null);
                    pushKV('perfNow_ms', typeof performance !== 'undefined' ? Math.round(performance.now()) : null);

                } catch (deepErr) {
                    extraLines.push('');
                    extraLines.push('!! extra diag failed: ' + (deepErr?.message || deepErr));
                }

                const traceSnapshot = (() => {
                    try { return HEYS?.LogTrace?.exportSnapshot?.() || ''; }
                    catch (_) { return ''; }
                })();
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
                    `=== Queue State ===`,
                    ...(queueStateLines.length ? queueStateLines : ['(no queue debug)']),
                    '',
                    `=== Pending Queue Detail ===`,
                    ...(pendingDetailLines.length ? pendingDetailLines : ['(empty)']),
                    '',
                    `=== Last Upload Diag ===`,
                    ...lastErrLines,
                    ...extraLines,
                    '',
                    `=== Sync Log (${logLines.length} entries) ===`,
                    ...(logLines.length ? logLines : ['[HEYS.sync] (пусто)']),
                    '',
                    `=== Log Trace Snapshot ===`,
                    traceSnapshot || '(HEYS.LogTrace unavailable)',
                ];
                const text = lines.join('\n');
                if (navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(text).then(() => {
                        HEYS?.Toast?.success?.('Sync debug скопирован');
                    }).catch(() => { });
                }
            } catch (e) { /* noop */ }
            // 2026-05-29 extended diag mirror: дублируем некоторые async-only items в console
            // (clipboard уже содержит всё sync-доступное; async-results типа
            // navigator.storage.estimate() / sw.getRegistration() не могут попасть в clipboard).
            try {
                console.groupCollapsed('🔍 [HEYS.sync.debug] async-only');
                console.log('=== Cloud flags ===');
                console.log({
                    isAuth: rt.isAuth,
                    isPin: rt.isPin,
                    client: rt.client,
                    online: rt.online,
                    syncing: rt.syncing,
                    uploading: rt.uploading,
                    _switchClientInProgress: HEYS?.cloud?._switchClientInProgress,
                    _rpcOnlyMode: HEYS?.cloud?._rpcOnlyMode,
                    _syncCompletedAt: HEYS?.cloud?._syncCompletedAt,
                    _curatorSession: !!HEYS?.auth?.isCuratorSession?.(),
                    _pinAuthClientId: typeof HEYS?.cloud?.isPinAuthClient === 'function'
                        ? HEYS.cloud.isPinAuthClient() : null,
                    currentClientId: HEYS?.currentClientId,
                });
                console.log('=== Queue state ===');
                console.log({
                    pending: rt.pending,
                    pendingDet: rt.pendingDet,
                    clientQueue: rt.clientQueue,
                    inflight: rt.inflightQueue,
                    queueDebug: typeof HEYS?.cloud?.getQueueDebug === 'function'
                        ? HEYS.cloud.getQueueDebug() : null,
                });
                console.log('=== Document state ===');
                console.log({
                    visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
                    hasFocus: typeof document !== 'undefined' && document.hasFocus ? document.hasFocus() : null,
                    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
                    location: typeof location !== 'undefined' ? location.href : null,
                });
                console.log('=== Morning check-in control ===');
                console.log(currentCheckinStatus || '(MorningCheckinDebug unavailable)');
                console.log('=== Current day (DayTab state if accessible) ===');
                const dayDate = (() => {
                    try {
                        const lsRaw = (typeof localStorage !== 'undefined')
                            ? localStorage.getItem('heys_client_current') : null;
                        const cid = lsRaw ? String(lsRaw).replace(/^"|"$/g, '') : null;
                        const today = new Date().toISOString().slice(0, 10);
                        const key = cid ? ('heys_' + cid + '_dayv2_' + today) : ('heys_dayv2_' + today);
                        const raw = localStorage.getItem(key);
                        return raw ? JSON.parse(raw) : null;
                    } catch (_) { return null; }
                })();
                if (dayDate) {
                    console.log({
                        date: dayDate.date,
                        updatedAt: dayDate.updatedAt,
                        updatedAtAgo: dayDate.updatedAt ? (Date.now() - dayDate.updatedAt) + 'ms' : '—',
                        savedDisplayOptimum: dayDate.savedDisplayOptimum,
                        savedEatenKcal: dayDate.savedEatenKcal,
                        mealsCount: Array.isArray(dayDate.meals) ? dayDate.meals.length : 0,
                        weightMorning: dayDate.weightMorning,
                        sleepHours: dayDate.sleepHours,
                    });
                } else {
                    console.log('(no day data found in LS)');
                }
                // 2026-05-29: last 50 writes (via cloud._writeHistory ring buffer)
                console.log('=== Write history (last 50 saveKey calls) ===');
                const wh = Array.isArray(HEYS?.cloud?._writeHistory) ? HEYS.cloud._writeHistory : [];
                if (wh.length > 0) {
                    const now = Date.now();
                    const lastN = wh.slice(-50);
                    console.log('Total tracked: ' + wh.length + '  showing last ' + lastN.length);
                    // Count per key in last 30 sec — для loop detection
                    const recent = wh.filter(w => (now - w.ts) < 30000);
                    const perKey = {};
                    recent.forEach(w => { perKey[w.k] = (perKey[w.k] || 0) + 1; });
                    const hot = Object.entries(perKey)
                        .filter(([k, n]) => n >= 3)
                        .sort((a, b) => b[1] - a[1]);
                    if (hot.length > 0) {
                        console.warn('🔥 HOT WRITES last 30s (≥3 calls):', Object.fromEntries(hot));
                    }
                    console.table(lastN.map(w => ({
                        ago_ms: now - w.ts,
                        key: w.k,
                        caller: (w.callers && w.callers[0]) || '—',
                    })));
                } else {
                    console.log('(write history empty — saveKey not called yet)');
                }
                // 2026-05-29: last 50 heys:* events
                console.log('=== Event history (last 50 heys:* / heysSyncCompleted) ===');
                const eh = Array.isArray(HEYS?._eventHistory) ? HEYS._eventHistory : [];
                if (eh.length > 0) {
                    const now = Date.now();
                    const lastN = eh.slice(-50);
                    const recent = eh.filter(e => (now - e.ts) < 30000);
                    const perType = {};
                    recent.forEach(e => { perType[e.type] = (perType[e.type] || 0) + 1; });
                    const hotEv = Object.entries(perType)
                        .filter(([t, n]) => n >= 5)
                        .sort((a, b) => b[1] - a[1]);
                    if (hotEv.length > 0) {
                        console.warn('🔥 HOT EVENTS last 30s (≥5 dispatches):', Object.fromEntries(hotEv));
                    }
                    console.table(lastN.map(e => ({
                        ago_ms: now - e.ts,
                        type: e.type,
                        detail: e.detail,
                    })));
                } else {
                    console.log('(event history empty)');
                }
                console.log('=== Auth tokens ===');
                console.log({
                    heys_curator_session: !!(typeof localStorage !== 'undefined' && localStorage.getItem('heys_curator_session')),
                    heys_session_token: !!(typeof localStorage !== 'undefined' && localStorage.getItem('heys_session_token')),
                    heys_pin_auth_client: !!(typeof localStorage !== 'undefined' && localStorage.getItem('heys_pin_auth_client')),
                    heys_supabase_auth_token: !!(typeof localStorage !== 'undefined' && localStorage.getItem('heys_supabase_auth_token')),
                });

                // === Sync pipeline configuration & retry policy ===
                console.log('=== Sync config + retry debug ===');
                console.log({
                    // Hard-coded constants from heys_storage_supabase_v1.js
                    PENDING_SAVE_DEBOUNCE_MS: 120,
                    CASCADE_DCS_ENQUEUE_DEBOUNCE_MS: 380,
                    SWITCH_DEBOUNCE_MS: 30000,
                    MAX_RETRY_ATTEMPTS: 5,
                    GRACE_PERIOD_MS: 10000,
                    // Runtime retry/auth diag
                    retryDebug: typeof HEYS?.cloud?.getRetryDebug === 'function'
                        ? HEYS.cloud.getRetryDebug() : null,
                });

                // === Network context (Network Information API) ===
                console.log('=== Network ===');
                const conn = (typeof navigator !== 'undefined') && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
                console.log({
                    onLine: typeof navigator !== 'undefined' ? navigator.onLine : null,
                    effectiveType: conn ? conn.effectiveType : '—',
                    downlink_Mbps: conn ? conn.downlink : '—',
                    downlinkMax: conn ? conn.downlinkMax : '—',
                    rtt_ms: conn ? conn.rtt : '—',
                    saveData: conn ? conn.saveData : '—',
                    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : null,
                });

                // === Storage budget (LS scan) ===
                console.log('=== Storage (localStorage scan) ===');
                const lsInfo = (() => {
                    try {
                        if (typeof localStorage === 'undefined') return null;
                        let count = 0, totalBytes = 0;
                        const perPrefix = {};
                        for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i);
                            const v = localStorage.getItem(k) || '';
                            const sz = k.length + v.length;
                            count++;
                            totalBytes += sz;
                            // bucket by first 2 underscore-separated chunks (e.g. heys_4545ee50, heys_supabase)
                            const m = k.match(/^([^_]+_[^_]+)/);
                            const bucket = m ? m[1] : '(other)';
                            perPrefix[bucket] = (perPrefix[bucket] || 0) + sz;
                        }
                        const top = Object.entries(perPrefix)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 10)
                            .map(([p, b]) => ({ prefix: p, kb: Math.round(b / 1024) }));
                        return { keyCount: count, totalKB: Math.round(totalBytes / 1024), top10ByPrefix: top };
                    } catch (_) { return null; }
                })();
                console.log(lsInfo);

                // Async storage.estimate() — даёт квоту браузера + реальный usage
                if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
                    navigator.storage.estimate().then(est => {
                        console.log('[HEYS.sync.debug] navigator.storage.estimate (async):', {
                            quota_MB: est?.quota ? Math.round(est.quota / 1024 / 1024) : null,
                            usage_MB: est?.usage ? Math.round(est.usage / 1024 / 1024) : null,
                            usagePct: (est?.quota && est?.usage) ? Math.round((est.usage / est.quota) * 100) : null,
                            usageDetails: est?.usageDetails || null,
                        });
                    }).catch(() => {});
                }

                // === Recent upload performance (derived from sync log) ===
                console.log('=== Recent upload performance (last 60s, from sync log) ===');
                try {
                    const log = typeof HEYS?.cloud?.getSyncLog === 'function' ? HEYS.cloud.getSyncLog() : [];
                    const now = Date.now();
                    const recent = log.filter(e => e && e.ts && (now - e.ts) < 60000);
                    const oks = recent.filter(e => e.type === 'upload_ok');
                    const fails = recent.filter(e => e.type === 'upload_fail' || e.type === 'upload_error');
                    const starts = recent.filter(e => e.type === 'upload_start');
                    const latencies = oks.map(e => Number(e?.data?.ms) || 0).filter(x => x > 0);
                    const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
                    const sorted = [...latencies].sort((a, b) => a - b);
                    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
                    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
                    const max = sorted[sorted.length - 1] || 0;
                    const successRate = (oks.length + fails.length) > 0
                        ? Math.round((oks.length / (oks.length + fails.length)) * 100) : null;
                    console.log({
                        windowSec: 60,
                        starts: starts.length,
                        oks: oks.length,
                        fails: fails.length,
                        successPct: successRate,
                        avgLatencyMs: avg,
                        p50LatencyMs: p50,
                        p95LatencyMs: p95,
                        maxLatencyMs: max,
                        uploadsPerMin: oks.length,
                    });
                    // Last 5 minutes upload frequency per key
                    const log5min = log.filter(e => e && e.ts && (now - e.ts) < 300000 && e.type === 'upload_start');
                    const perKey5m = {};
                    log5min.forEach(e => {
                        const keys = String(e?.data?.keys || '').split(',').map(s => s.trim()).filter(Boolean);
                        keys.forEach(k => { perKey5m[k] = (perKey5m[k] || 0) + 1; });
                    });
                    const hotUploadKeys = Object.entries(perKey5m)
                        .filter(([_, n]) => n >= 5)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10);
                    if (hotUploadKeys.length > 0) {
                        console.warn('🔥 HOT UPLOAD KEYS last 5min (≥5):', Object.fromEntries(hotUploadKeys));
                    }
                    // Idle / activity health
                    const lastOk = (typeof HEYS?.cloud?._lastUploadOkAt === 'number') ? HEYS.cloud._lastUploadOkAt : null;
                    console.log({
                        idleSinceLastOk_sec: lastOk ? Math.round((now - lastOk) / 1000) : null,
                        backlogVsRate: (rt.pending > 0 && oks.length > 0)
                            ? Math.round(rt.pending / Math.max(oks.length / 60, 0.01)) + 's to drain at current rate'
                            : '—',
                    });
                } catch (_) { /* noop */ }

                // === Service Worker status ===
                console.log('=== Service Worker ===');
                if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
                    const sw = navigator.serviceWorker;
                    console.log({
                        controllerActive: !!sw.controller,
                        controllerScriptURL: sw.controller ? sw.controller.scriptURL : null,
                        controllerState: sw.controller ? sw.controller.state : null,
                    });
                    if (sw.getRegistration) {
                        sw.getRegistration().then(reg => {
                            console.log('[HEYS.sync.debug] SW registration (async):', {
                                scope: reg?.scope,
                                active: reg?.active?.state,
                                waiting: reg?.waiting?.state,
                                installing: reg?.installing?.state,
                                updateViaCache: reg?.updateViaCache,
                            });
                        }).catch(() => {});
                    }
                } else {
                    console.log('(navigator.serviceWorker unavailable)');
                }

                // === Deep layer: Performance Resource Timing (last 30 sync fetches) ===
                console.log('=== Network fetches (Performance Resource Timing, last 60s, /rpc|/rest|/api) ===');
                try {
                    if (typeof performance !== 'undefined' && performance.getEntriesByType) {
                        const all = performance.getEntriesByType('resource');
                        const cutoff = (typeof performance.now === 'function') ? performance.now() - 60000 : 0;
                        const syncRe = /\/(rpc|rest|api|client_kv_store|push|messages)\b/i;
                        const matches = all
                            .filter(r => r.startTime >= cutoff && syncRe.test(r.name))
                            .slice(-30);
                        if (matches.length > 0) {
                            console.table(matches.map(r => ({
                                url: r.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 60),
                                total_ms: Math.round(r.duration),
                                ttfb_ms: Math.round(r.responseStart - r.requestStart),
                                dns_ms: Math.round(r.domainLookupEnd - r.domainLookupStart),
                                tcp_ms: Math.round(r.connectEnd - r.connectStart),
                                tx_ms: Math.round(r.responseEnd - r.responseStart),
                                size_kb: r.transferSize ? Math.round(r.transferSize / 1024) : '—',
                                initiator: r.initiatorType,
                            })));
                            // Aggregate stats
                            const totals = matches.map(r => r.duration);
                            const sortedT = [...totals].sort((a, b) => a - b);
                            console.log({
                                fetches: matches.length,
                                avg_ms: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
                                p50_ms: Math.round(sortedT[Math.floor(sortedT.length * 0.5)] || 0),
                                p95_ms: Math.round(sortedT[Math.floor(sortedT.length * 0.95)] || 0),
                                max_ms: Math.round(sortedT[sortedT.length - 1] || 0),
                            });
                        } else {
                            console.log('(no matching fetches in last 60s)');
                        }
                    }
                } catch (_) { /* noop */ }

                // === Deep layer: Long tasks (main-thread blocks >50ms) ===
                console.log('=== Long tasks last 60s (PerformanceObserver) ===');
                try {
                    const lt = Array.isArray(HEYS?._longtaskHistory) ? HEYS._longtaskHistory : [];
                    const now = Date.now();
                    const recent = lt.filter(t => (now - t.ts) < 60000);
                    if (recent.length > 0) {
                        const total = recent.reduce((s, t) => s + t.dur_ms, 0);
                        console.warn(`🐢 ${recent.length} long tasks in 60s, total ${total}ms blocked`);
                        console.table(recent.slice(-20).map(t => ({
                            ago_ms: now - t.ts,
                            dur_ms: t.dur_ms,
                            name: t.name,
                            attribution: t.attribution.join(','),
                        })));
                    } else {
                        console.log('(no longtasks recorded — либо main thread спокоен либо browser не поддерживает PerformanceObserver longtask)');
                    }
                } catch (_) { /* noop */ }

                // === Deep layer: Memory (Chrome only) ===
                console.log('=== Memory ===');
                try {
                    if (typeof performance !== 'undefined' && performance.memory) {
                        const m = performance.memory;
                        console.log({
                            usedJSHeap_MB: Math.round(m.usedJSHeapSize / 1024 / 1024),
                            totalJSHeap_MB: Math.round(m.totalJSHeapSize / 1024 / 1024),
                            heapLimit_MB: Math.round(m.jsHeapSizeLimit / 1024 / 1024),
                            usagePct: Math.round((m.usedJSHeapSize / m.jsHeapSizeLimit) * 100),
                        });
                    } else {
                        console.log('(performance.memory unavailable — non-Chrome browser)');
                    }
                } catch (_) { /* noop */ }

                // === Deep layer: Raw queue contents (top by size) ===
                console.log('=== Client upsert queue raw (top 10 by size) ===');
                try {
                    const raw = typeof HEYS?.cloud?.getClientQueueRaw === 'function' ? HEYS.cloud.getClientQueueRaw() : [];
                    if (raw.length > 0) {
                        console.table(raw);
                    } else {
                        console.log('(queue empty or getter unavailable)');
                    }
                } catch (_) { /* noop */ }

                // === Deep layer: All cloud._* private state ===
                console.log('=== All cloud._* private flags ===');
                try {
                    if (HEYS?.cloud) {
                        const SENSITIVE_KEY_RE = /key|token|secret|anon|jwt|password|auth/i;
                        const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
                        const maskUuids = (s) => String(s).replace(UUID_RE, m => m.slice(0, 8) + '***');
                        const privs = {};
                        Object.keys(HEYS.cloud).forEach(k => {
                            if (k.startsWith('_')) {
                                const v = HEYS.cloud[k];
                                const t = typeof v;
                                if (t === 'function') return; // skip methods
                                if (SENSITIVE_KEY_RE.test(k)) { privs[k] = `<redacted ${t}>`; return; }
                                if (t === 'object' && v !== null) {
                                    if (Array.isArray(v)) {
                                        privs[k] = `Array(${v.length})`;
                                    } else {
                                        try {
                                            const s = maskUuids(JSON.stringify(v));
                                            privs[k] = s.length > 80 ? s.slice(0, 80) + '…' : s;
                                        } catch (_) { privs[k] = '<unstringifiable>'; }
                                    }
                                } else {
                                    privs[k] = maskUuids(v);
                                }
                            }
                        });
                        console.log(privs);
                    }
                } catch (_) { /* noop */ }

                // === Deep layer: Cascade / EWS compute counters ===
                console.log('=== Cascade + EWS compute frequency ===');
                try {
                    const cs = HEYS?._cascadeStats;
                    if (cs) {
                        const now = Date.now();
                        const last30s = cs.recent.filter(r => (now - r.ts) < 30000).length;
                        const last5s = cs.recent.filter(r => (now - r.ts) < 5000).length;
                        console.log({
                            cascadeTotal: cs.count,
                            cascadeLast30sCount: last30s,
                            cascadeLast5sCount: last5s,
                            cascadeLastFireAgo_ms: cs.lastTs ? (now - cs.lastTs) : null,
                        });
                        if (last5s >= 3) {
                            console.warn(`🔥 CASCADE COMPUTE HOT: ${last5s} раз за 5с (norm <1) — это loop trigger!`);
                        }
                    } else {
                        console.log('(cascade stats unavailable)');
                    }
                    const es = HEYS?._ewsStats;
                    if (es) {
                        const now = Date.now();
                        const last30s = es.recent.filter(r => (now - r.ts) < 30000).length;
                        const last5s = es.recent.filter(r => (now - r.ts) < 5000).length;
                        console.log({
                            ewsTotal: es.count,
                            ewsLast30sCount: last30s,
                            ewsLast5sCount: last5s,
                            ewsLastFireAgo_ms: es.lastTs ? (now - es.lastTs) : null,
                        });
                        if (last5s >= 3) {
                            console.warn(`🔥 EWS DETECT HOT: ${last5s} раз за 5с (norm <1) — это loop trigger!`);
                        }
                    } else {
                        console.log('(ews stats unavailable)');
                    }
                } catch (_) { /* noop */ }

                // === Session / runtime context ===
                console.log('=== Session runtime ===');
                console.log({
                    sessionAgeSec: typeof performance !== 'undefined' && performance.timeOrigin
                        ? Math.round((Date.now() - performance.timeOrigin) / 1000) : null,
                    perfNow_ms: typeof performance !== 'undefined' ? Math.round(performance.now()) : null,
                    bundleManifest: (() => {
                        try {
                            return window.__HEYS_BUNDLE_MANIFEST || '—';
                        } catch (_) { return '—'; }
                    })(),
                    syncDebug_recent: (() => {
                        try {
                            const sd = HEYS?._syncDebug;
                            if (!Array.isArray(sd)) return '—';
                            return sd.slice(-10);
                        } catch (_) { return '—'; }
                    })(),
                });
                console.groupEnd();
            } catch (e) {
                console.warn('[HEYS.sync.debug] extended dump failed:', e?.message || e);
            }
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

        React.useEffect(() => {
            if (!window.HEYS) window.HEYS = {};
            if (!window.HEYS.ui) window.HEYS.ui = {};
            window.HEYS.ui.setSelectedDate = (nextDate) => {
                if (typeof nextDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
                selectDateWithPrefetch(nextDate, { reason: 'curator-review-open-day' });
            };
            return () => {
                try {
                    if (window.HEYS?.ui?.setSelectedDate) delete window.HEYS.ui.setSelectedDate;
                } catch (_) {}
            };
        }, [selectDateWithPrefetch]);

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
                                                            // 🔒 2026-05-28 (curator anti-pollution): курaторский switch теперь идёт
                                                            // через полную перезагрузку страницы. Причина — in-memory state
                                                            // (React state, module caches, ews/profile/dayv2 buffers) переживала
                                                            // прежний плавный switch и засеивала storage следующего клиента
                                                            // курaторскими значениями. Reload — единственная 100% защита от
                                                            // всего класса cross-client memory carryover, не требующая
                                                            // патчить каждый модуль отдельно. Стоимость — ~1-2с белого flash'а,
                                                            // что для switch-action (по сути смены идентичности) приемлемо.
                                                            // Внутренние switches (бутстрап, восстановление сессии) reload НЕ
                                                            // используют — только этот UI-клик.
                                                            setTimeout(async () => {
                                                                try {
                                                                    commitPendingUndoBeforeContextChange('client-switch', {
                                                                        fromClientId: clientIdValue,
                                                                        toClientId: c.id,
                                                                    });
                                                                } catch (e) {
                                                                    console.warn('[HEYS.shell] commitPendingUndo failed before reload:', e?.message);
                                                                }

                                                                // Flush pending writes СТАРОГО клиента до reload — иначе последние
                                                                // 100-300мс курaторских действий (правка веса, добавление еды и т.п.)
                                                                // теряются. flushPendingQueue ждёт до 2с пока in-flight writes уйдут
                                                                // в облако. pagehide-handler в storage:2914 — second safety net.
                                                                try {
                                                                    if (HEYS.cloud && typeof HEYS.cloud.flushPendingQueue === 'function') {
                                                                        await HEYS.cloud.flushPendingQueue(2000);
                                                                    }
                                                                } catch (e) {
                                                                    console.warn('[HEYS.shell] flushPendingQueue failed before reload:', e?.message);
                                                                }

                                                                console.info(`[HEYS.shell] 🔄 Hard reload для switch'а на: ${c.name} (${c.id.slice(0, 8)}...)`);

                                                                // 2026-05-29 anti-pollution L1 defense (incident 21:16:40 Александра → Poplanton):
                                                                // unscoped legacy LS keys (heys_profile, heys_dayv2_*, heys_ews_*,
                                                                // heys_ceb_*, heys_meal_gaps_history) принадлежали СТАРОМУ клиенту,
                                                                // но после reload bootstrap/migration пути читают их и пишут под
                                                                // НОВЫЙ currentClientId → cloud pollution. Cleanup ПЕРЕД reload —
                                                                // default-on defence, закрывает класс bugs независимо от того
                                                                // fix'нуты ли individual migration paths. Scoped keys
                                                                // (heys_<old_cid>_*) НЕ трогаем — они correctly attributed.
                                                                try {
                                                                    const _legacyPatterns = [
                                                                        /^heys_profile$/,
                                                                        /^heys_dayv2_\d{4}-\d{2}-\d{2}$/,
                                                                        /^heys_ews_snapshot$/,
                                                                        /^heys_ews_trends_v1$/,
                                                                        /^heys_ews_weekly_v1$/,
                                                                        /^heys_ceb_v1$/,
                                                                        /^heys_ceb_d_\d{4}-\d{2}-\d{2}$/,
                                                                        /^heys_meal_gaps_history$/,
                                                                        /^heys_cascade_dcs_v\d+$/,
                                                                        /^heys_grams_history$/,
                                                                        /^heys_norms$/,
                                                                    ];
                                                                    const _toRemove = [];
                                                                    for (let i = 0; i < localStorage.length; i++) {
                                                                        const _k = localStorage.key(i);
                                                                        if (!_k) continue;
                                                                        if (_legacyPatterns.some(re => re.test(_k))) _toRemove.push(_k);
                                                                    }
                                                                    if (_toRemove.length > 0) {
                                                                        console.info(`[HEYS.shell] 🧹 Cleanup ${_toRemove.length} unscoped legacy keys перед switch (anti-pollution):`, _toRemove);
                                                                        _toRemove.forEach(_k => {
                                                                            try { localStorage.removeItem(_k); } catch (_) { /* noop */ }
                                                                        });
                                                                    }
                                                                } catch (e) {
                                                                    console.warn('[HEYS.shell] legacy cleanup failed:', e?.message);
                                                                }

                                                                // Сохраняем target в LS чтобы бутстрап подхватил после reload
                                                                writeGlobalValue('heys_last_client_id', c.id);
                                                                writeGlobalValue('heys_client_current', c.id);

                                                                // Полная перезагрузка — обнуляет всю in-memory state и кэши
                                                                window.location.reload();
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
                                            window.__heysLastDispatchedClientId = null;
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
	                !isRpcMode && cloudUser && React.createElement('button', {
	                    key: 'ops-dashboard',
	                    type: 'button',
	                    className: 'hdr-ops-dashboard-btn',
	                    title: 'Ops dashboard',
	                    onClick: openOpsDashboard,
	                    style: {
	                        minWidth: 36,
	                        height: 36,
	                        borderRadius: 10,
	                        border: '1px solid var(--border)',
	                        background: 'var(--card)',
	                        color: 'var(--text)',
	                        display: 'inline-flex',
	                        alignItems: 'center',
	                        justifyContent: 'center',
	                        fontSize: 15,
	                        cursor: 'pointer'
	                    }
	                }, 'Ops'),
	                // ☁️ Cloud sync indicator (v2.0: forceSync on click, auto-fade, relative time tooltip)
	                React.createElement('div', {
                    key: 'cloudsync',
                    className: 'cloud-sync-indicator ' + effectiveDisplayStatus + (effectiveDisplayStatus !== 'syncing' && effectiveDisplayStatus !== 'offline' && effectiveDisplayStatus !== 'session' ? ' cloud-sync-indicator--clickable' : ''),
                    title: (() => {
                        const routingMode = HEYS?.cloud?.getRoutingStatus?.()?.mode || 'unknown';
                        const modeLabel = routingMode === 'direct' ? '🔗 Direct' : routingMode === 'proxy' ? '🔀 Proxy' : '';
                        const checkinTitle = checkinStatus
                            ? `Чек-ин: ${checkinStatus.label}${checkinStatus.flowStatus ? ` (${checkinStatus.flowStatus})` : ''}`
                            : '';
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
                        if (checkinTitle) baseTitle += ` · ${checkinTitle}`;
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

                // 🔔 Push notifications indicator — рендерится через Portal в GamificationBar,
                // слева от 🌙 (heys_gamification_bar_v1.js → #push-badge-slot).
                pushStatus && pushStatus.capable !== false && pushBadgeSlot && window.ReactDOM?.createPortal && window.ReactDOM.createPortal(
                    React.createElement('div', {
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
                            cursor: pushBusy ? 'wait' : 'pointer',
                            opacity: pushBusy ? 0.6 : 1
                        }
                    }, pushStatus.subscribed ? '🔔' : '🔕'),
                    pushBadgeSlot
                ),

                                   // Кнопки "Вчера" + "Сегодня" + DatePicker
                (tab === 'stats' || tab === 'diary' || tab === 'activity' || tab === 'insights' || tab === 'widgets') && window.HEYS.DatePicker
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
	            ),
	            renderOpsDashboardModal()
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
            cloudUser,
        } = props;

        const [settingsMenuOpen, setSettingsMenuOpen] = React.useState(false);
        const settingsWrapRef = React.useRef(null);
        const keepSettingsMenuOpenOnNextTabRef = React.useRef(false);
        const [, tickCascadeNav] = React.useReducer((n) => n + 1, 0);
        React.useEffect(() => {
            if (tab === 'month') {
                setTab('stats');
            }
        }, [tab, setTab]);

        // Bulletproof fallback: document-level capture listener для tab-advice.
        // React synthetic events иногда не доходят до onClick после re-render'ов
        // shell'а (наблюдалось 2026-05-28). useRef + useEffect([]) тоже не помог
        // (ref ловит только initial node). Document.addEventListener в capture
        // phase ловит любой клик ПОВЕРХ React event system, фильтруем по closest.
        const adviceTabRef = React.useRef(null);
        React.useEffect(() => {
            const handler = (e) => {
                if (e.target && e.target.closest && e.target.closest('.tab.tab-advice')) {
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
                { key: 'stats', label: 'Отчёты', icon: '📊' },
                { key: 'diary', label: 'Питание', icon: '🍽️' },
                { key: 'activity', label: 'Актив', icon: '🏃' },
                { key: 'widgets', label: 'Виджеты', icon: '🧩' },
            ];
            if (canUseTasksAsHome) {
                options.push({ key: 'tasks', label: 'Задачи', icon: '☑️' });
            }
            options.push({ key: 'insights', label: 'Инсайты', icon: '🔮' });
            return options;
        }, [canUseTasksAsHome]);

        const TASKS_HOME_SUBTAB_OPTIONS = React.useMemo(() => {
            const fallbackItems = [
                { id: 'tasks', label: 'Список', shortLabel: 'Список', icon: '☑️' },
                { id: 'calendar', label: 'Календарь', shortLabel: 'Кален.', icon: '📅' },
                { id: 'gantt', label: 'Гант', shortLabel: 'Гант', icon: '📊' },
                { id: 'chrono', label: 'Хронометраж', shortLabel: 'Хроно', icon: '⏱️' },
                { id: 'checklists', label: 'Чеклисты', shortLabel: 'Чеклисты', icon: '📋' },
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
        const resolvedDefaultTasksSubtab = TASKS_HOME_SUBTAB_OPTIONS.some((option) => option.key === defaultTasksSubtab)
            ? defaultTasksSubtab
            : 'calendar';
        const currentTasksHomeOption = React.useMemo(() => {
            return TASKS_HOME_SUBTAB_OPTIONS.find((option) => option.key === resolvedDefaultTasksSubtab)
                || TASKS_HOME_SUBTAB_OPTIONS.find((option) => option.key === 'calendar')
                || TASKS_HOME_SUBTAB_OPTIONS[0]
                || null;
        }, [TASKS_HOME_SUBTAB_OPTIONS, resolvedDefaultTasksSubtab]);
        const DIARY_PANEL_VISIBILITY_OPTIONS = [
            {
                key: 'scoreRiskTrend',
                field: 'showDiaryScoreRiskTrendPanel',
                eventName: 'heys:diary-optional-panels-visibility-changed',
                label: 'Оценка, риск и тренд',
                enabledHint: 'Показывается над карточками дня',
                disabledHint: 'Скрыт из дневника',
                titleOn: 'Скрыть оценку дня, риск и тренд',
                titleOff: 'Показать оценку дня, риск и тренд',
            },
            {
                key: 'fiber',
                field: 'showDiaryFiberPanel',
                eventName: 'heys:diary-fiber-panel-visibility-changed',
                label: 'Карточка клетчатки',
                enabledHint: 'Показывается над остатком дня',
                disabledHint: 'Можно вернуть в любой момент',
                titleOn: 'Скрыть карточку клетчатки в дневнике',
                titleOff: 'Показать карточку клетчатки в дневнике',
            },
            {
                key: 'water',
                field: 'showDiaryWaterPanel',
                eventName: 'heys:diary-optional-panels-visibility-changed',
                label: 'Карточка воды',
                enabledHint: 'Показывает прогресс воды за день',
                disabledHint: 'Скрыта из дневника',
                titleOn: 'Скрыть карточку воды',
                titleOff: 'Показать карточку воды',
            },
            {
                key: 'insulinWave',
                field: 'showDiaryInsulinWavePanel',
                eventName: 'heys:diary-optional-panels-visibility-changed',
                label: 'Карточка волны',
                enabledHint: 'Показывает текущую инсулиновую волну',
                disabledHint: 'Скрыта из дневника',
                titleOn: 'Скрыть карточку текущей волны',
                titleOff: 'Показать карточку текущей волны',
            },
            {
                key: 'planner',
                field: 'showDiaryPlannerPanel',
                eventName: 'heys:diary-optional-panels-visibility-changed',
                label: 'Карточка планера',
                enabledHint: 'Планирует питание на остаток дня',
                disabledHint: 'Скрыта из дневника',
                titleOn: 'Скрыть карточку планера в дневнике',
                titleOff: 'Показать карточку планера в дневнике',
            },
            {
                key: 'supplements',
                field: 'showDiarySupplementsPanel',
                eventName: 'heys:diary-optional-panels-visibility-changed',
                label: 'Карточка витаминов',
                enabledHint: 'Показывается в дневнике',
                disabledHint: 'Скрыта из дневника',
                titleOn: 'Скрыть карточку витаминов в дневнике',
                titleOff: 'Показать карточку витаминов в дневнике',
            },
            {
                key: 'distribution',
                field: 'showDiaryDistributionPanel',
                eventName: 'heys:diary-optional-panels-visibility-changed',
                label: 'Карточка распределения',
                enabledHint: 'Показывает распределение приёмов',
                disabledHint: 'Скрыта из дневника',
                titleOn: 'Скрыть карточку распределения в дневнике',
                titleOff: 'Показать карточку распределения в дневнике',
            },
        ];
        const readDiaryPanelsVisibility = React.useCallback(() => {
            try {
                const profile = window.HEYS?.utils?.lsGet?.('heys_profile', {}) || {};
                return DIARY_PANEL_VISIBILITY_OPTIONS.reduce((acc, option) => {
                    acc[option.key] = profile[option.field] !== false;
                    return acc;
                }, {});
            } catch (_) {
                return DIARY_PANEL_VISIBILITY_OPTIONS.reduce((acc, option) => {
                    acc[option.key] = true;
                    return acc;
                }, {});
            }
        }, []);
        const [diaryPanelsVisibility, setDiaryPanelsVisibility] = React.useState(readDiaryPanelsVisibility);

        React.useEffect(() => {
            const handleVisibilitySync = (event) => {
                setDiaryPanelsVisibility(readDiaryPanelsVisibility());
            };
            window.addEventListener('heys:diary-fiber-panel-visibility-changed', handleVisibilitySync);
            window.addEventListener('heys:diary-optional-panels-visibility-changed', handleVisibilitySync);
            window.addEventListener('heys:profile-updated', handleVisibilitySync);
            return () => {
                window.removeEventListener('heys:diary-fiber-panel-visibility-changed', handleVisibilitySync);
                window.removeEventListener('heys:diary-optional-panels-visibility-changed', handleVisibilitySync);
                window.removeEventListener('heys:profile-updated', handleVisibilitySync);
            };
        }, [readDiaryPanelsVisibility]);

        const handleToggleDiaryPanel = (option, nextEnabled) => {
            try {
                const U = window.HEYS?.utils;
                const profile = U?.lsGet?.('heys_profile', {}) || {};
                const updatedProfile = {
                    ...profile,
                    [option.field]: nextEnabled !== false,
                };
                U?.lsSet?.('heys_profile', updatedProfile);
                setDiaryPanelsVisibility((prev) => ({
                    ...prev,
                    [option.key]: nextEnabled !== false,
                }));
                window.dispatchEvent(new CustomEvent(option.eventName, {
                    detail: {
                        field: option.field,
                        enabled: nextEnabled !== false,
                    }
                }));
                window.dispatchEvent(new CustomEvent('heys:profile-updated', {
                    detail: {
                        field: option.field,
                        fields: [option.field],
                        source: 'tab-settings',
                    }
                }));
                HEYS.dayUtils?.haptic?.('light');
            } catch (_) {
                // silent
            }
        };

        const handlePickHomeTab = (nextTab) => {
            try {
                if (nextTab === 'tasks') {
                    keepSettingsMenuOpenOnNextTabRef.current = true;
                    setDefaultTab('tasks', { tasksSubtab: resolvedDefaultTasksSubtab });
                    switchTabWithUndoCommit('tasks', 'home-picker-tasks-switch');
                    HEYS.dayUtils?.haptic?.('light');
                    return;
                }

                setDefaultTab(nextTab);
                switchTabWithUndoCommit(nextTab, `home-picker-${nextTab}-switch`);
                HEYS.dayUtils?.haptic?.('light');
                setSettingsMenuOpen(false);
            } catch (e) {
                // silent
            }
        };

        const handlePickTasksHomeSubtab = (nextSubtab) => {
            try {
                setDefaultTab(defaultTab, { tasksSubtab: nextSubtab });
                HEYS.dayUtils?.haptic?.('light');
                setSettingsMenuOpen(false);
            } catch (e) {
                // silent
            }
        };

        const primaryTabs = React.useMemo(() => {
            const items = [
                { key: 'stats', label: 'Отчёты', buttonLabel: 'Отчёты', icon: '📊', id: 'tour-stats-tab' },
                { key: 'diary', label: 'Питание', buttonLabel: 'Питание', icon: '🍴', id: 'tour-diary-tab' },
                { key: 'activity', label: 'Актив', shortLabel: 'Актив', buttonLabel: 'Актив', icon: '🏃', id: 'tour-activity-tab' },
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
            if (!settingsMenuOpen) return;
            if (keepSettingsMenuOpenOnNextTabRef.current) {
                keepSettingsMenuOpenOnNextTabRef.current = false;
                return;
            }
            setSettingsMenuOpen(false);
        }, [tab]);

        React.useEffect(() => {
            if (!settingsMenuOpen) return undefined;

            const handleOutsidePointer = (event) => {
                const wrap = settingsWrapRef.current;
                if (!wrap) return;
                const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
                if (path.includes(wrap) || wrap.contains(event.target)) return;
                setSettingsMenuOpen(false);
            };

            const handleEscape = (event) => {
                if (event.key === 'Escape') setSettingsMenuOpen(false);
            };

            document.addEventListener('pointerdown', handleOutsidePointer, true);
            document.addEventListener('keydown', handleEscape, true);
            return () => {
                document.removeEventListener('pointerdown', handleOutsidePointer, true);
                document.removeEventListener('keydown', handleEscape, true);
            };
        }, [settingsMenuOpen]);

        const warmCascadeCrsForNav = React.useCallback((reason) => {
            const lastCrs = window.HEYS?._lastCrs;
            const lastCrsHistoryCount = Array.isArray(lastCrs?.historicalDays)
                ? lastCrs.historicalDays.length
                : Number(lastCrs?.historicalDays || 0);
            if (
                lastCrs &&
                Number.isFinite(Number(lastCrs.crs)) &&
                lastCrsHistoryCount >= 1
            ) {
                return true;
            }
            if (!clientId) return false;
            if (!window.__heysCascadeBatchSyncReceived && !window.__heysCascadeAllowEmptyHistory) {
                return false;
            }
            if (!window.HEYS?.CascadeCard?.computeCascadeState) return false;

            try {
                // Нижняя линия каскада всегда показывает сегодняшний CRS. Если брать
                // selectedDate со стартовой вкладки, можно случайно посчитать прошлый
                // день в silent-режиме и оставить линию без целевой точки.
                const _todayISO = () => {
                    try {
                        if (typeof window.HEYS?.dayUtils?.todayISO === 'function') return window.HEYS.dayUtils.todayISO();
                        if (typeof window.HEYS?.models?.todayISO === 'function') return window.HEYS.models.todayISO();
                        if (typeof window.HEYS?.utils?.getTodayKey === 'function') return window.HEYS.utils.getTodayKey();
                    } catch (_) { /* fallthrough */ }
                    const d = new Date();
                    const pad = (n) => (n < 10 ? '0' + n : '' + n);
                    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
                };

                const readStored = (key, fallback) => {
                    try {
                        const raw = window.HEYS?.store?.get
                            ? window.HEYS.store.get(key, undefined)
                            : undefined;
                        if (raw !== undefined && raw !== null) {
                            return typeof raw === 'string' ? JSON.parse(raw) : raw;
                        }
                    } catch (_) { }
                    try {
                        return window.HEYS?.utils?.lsGet ? window.HEYS.utils.lsGet(key, fallback) : fallback;
                    } catch (_) {
                        return fallback;
                    }
                };

                const dateStr = _todayISO();
                const scopedPrefix = clientId ? `heys_${clientId}_` : 'heys_';
                const day = readStored(scopedPrefix + 'dayv2_' + dateStr, null)
                    || readStored('heys_dayv2_' + dateStr, {});
                const dayTot = readStored(scopedPrefix + 'dayTot_' + dateStr, null)
                    || readStored('heys_dayTot_' + dateStr, {});
                const prof = readStored(scopedPrefix + 'profile', null)
                    || readStored('heys_profile', {});
                // v3.5.1: compute normAbs properly (same as buildNutritionState in day tab)
                // heys_normAbs key is never written → was always {}, causing normKcal fallback
                // to 2000 and triggering false deficit_overshoot penalties for users eating
                // within their real TDEE-based goal.
                const normPerc = readStored(scopedPrefix + 'norms', null)
                    || readStored('heys_norms', {});
                const optimumInfo = window.HEYS.dayUtils?.getOptimumForDay?.(day, prof) || {};
                const normAbs = (window.HEYS.dayCalculations?.computeDailyNorms && optimumInfo.optimum)
                    ? window.HEYS.dayCalculations.computeDailyNorms(optimumInfo.optimum, normPerc)
                    : { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 };
                console.info('[HEYS.AppTabsNav] ✅ CRS nav warm-up:', {
                    reason,
                    date: dateStr,
                    optimum: optimumInfo.optimum,
                    normKcal: normAbs.kcal
                });
                const pIndex = window.HEYS.products?.getIndex ? window.HEYS.products.getIndex() : {};
                window.HEYS.CascadeCard.computeCascadeState(day, dayTot, normAbs, prof, pIndex, {
                    silent: false
                });
                return true;
            } catch (e) {
                console.warn('[HEYS.AppTabsNav] Failed to warm CRS:', e);
                return false;
            }
        }, [clientId]);

        // Инициализация CRS для прогресс-бара, если он еще не был вычислен.
        // На не-дневной стартовой вкладке CascadeCard может догрузиться позже nav,
        // поэтому слушаем готовность lazy-модуля и sync guard unlock.
        React.useEffect(() => {
            warmCascadeCrsForNav('mount');

            const handleCascadeReady = () => {
                tickCascadeNav();
                warmCascadeCrsForNav('cascade-ready');
            };
            const handlePostbootReady = (event) => {
                if (!event?.detail || event.detail.bundle === 'postboot-1-game') {
                    handleCascadeReady();
                }
            };
            const handleSyncReady = () => {
                warmCascadeCrsForNav('sync-ready');
            };
            const handleDayUpdated = (event) => {
                const source = event?.detail?.source;
                if (source === 'cascade-guard-unlock' || source === 'cloud-sync' || event?.detail?.batch) {
                    warmCascadeCrsForNav('day-updated');
                }
            };

            window.addEventListener('heys:cascade-ready', handleCascadeReady);
            window.addEventListener('heys:postboot-lazy-ready', handlePostbootReady);
            window.addEventListener('heysSyncCompleted', handleSyncReady);
            window.addEventListener('heys:day-updated', handleDayUpdated);

            return () => {
                window.removeEventListener('heys:cascade-ready', handleCascadeReady);
                window.removeEventListener('heys:postboot-lazy-ready', handlePostbootReady);
                window.removeEventListener('heysSyncCompleted', handleSyncReady);
                window.removeEventListener('heys:day-updated', handleDayUpdated);
            };
        }, [warmCascadeCrsForNav]);

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
                        // PERF R13 FIX G: defer heysShowAdvice dispatch to avoid sync React render in click handler.
                        // Дублирует module-level capture listener (в начале файла) — на случай если
                        // в каком-то браузере document.click capture не отрабатывает.
                        setTimeout(() => window.dispatchEvent(new CustomEvent('heysShowAdvice')), 0);
                    },
                },
                React.createElement('span', { className: 'tab-icon' }, '💡'),
                React.createElement('span', { className: 'tab-advice-badge', id: 'nav-advice-badge' }),
            ),
            // iOS Switch группа для stats/diary/widgets/insights/month/tasks — ПО ЦЕНТРУ + подписи
            (() => {
                const activeIdx = primaryTabs.findIndex(item => item.key === tab);
                const totalTabs = primaryTabs.length;
                const gliderStyle = activeIdx < 0
                    ? { opacity: 0, pointerEvents: 'none' }
                    : {
                        width: `calc((100% - 4px) / ${totalTabs})`,
                        transform: `translateX(${activeIdx * 100}%)`,
                    };
                return React.createElement(
                    'div',
                    { className: 'tab-switch-wrapper tab-switch-wrapper--' + primaryTabsVariant },
                    React.createElement(
                        'div',
                        {
                            className: 'tab-switch-group tab-switch-group--' + primaryTabsVariant + (activeIdx < 0 ? ' tab-switch-group--no-active' : ''),
                        },
                        React.createElement('div', { className: 'tab-switch-glider', 'aria-hidden': 'true', style: gliderStyle }),
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
                    }, item.shortLabel || item.label)),
                ),
            );
            })(),
            // Настройки — раскрывающееся меню вверх
            React.createElement(
                'div',
                { className: 'tab-settings-wrap', ref: settingsWrapRef },
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
                    { className: 'tab-settings-menu tab-settings-menu--with-home' + (defaultTab === 'tasks' ? ' tab-settings-menu--tasks-home' : '') },
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
                            className: 'widgets-home-tab-picker tab-settings-home-picker' + (defaultTab === 'tasks' ? ' tab-settings-home-picker--tasks-open' : ''),
                        },
                            React.createElement('div', { className: 'widgets-home-tab-picker__title' }, 'Домашняя вкладка'),
                            React.createElement('div', { className: 'widgets-home-tab-picker__hint' },
                                'С неё приложение откроется в следующий раз'
                            ),
                            defaultTab === 'tasks' && currentTasksHomeOption && React.createElement('div', {
                                className: 'widgets-home-tab-picker__current-subtab',
                            }, `Внутри задач откроется: ${currentTasksHomeOption.label}`),
                            React.createElement('div', { className: 'widgets-home-tab-picker__layout' },
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
                                canUseTasksAsHome && TASKS_HOME_SUBTAB_OPTIONS.length > 0 && React.createElement('div', {
                                    className: 'widgets-home-tab-picker__subtabs',
                                },
                                    React.createElement('div', { className: 'widgets-home-tab-picker__subtitle' }, 'Старт задач'),
                                    React.createElement('div', {
                                        className: 'widgets-home-tab-picker__hint widgets-home-tab-picker__hint--nested',
                                    }, 'Что открыть при входе в задачи'),
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
                    ),
                    React.createElement(
                        'div',
                        {
                            className: 'tab-settings-diary-wrap',
                            role: 'group',
                            'aria-label': 'Настройки дневника',
                            onClick: (e) => e.stopPropagation(),
                        },
                        React.createElement('div', { className: 'tab-settings-diary-card' },
                            React.createElement('div', { className: 'tab-settings-diary-card__head' },
                                React.createElement('span', { className: 'tab-settings-diary-card__title' }, 'Дневник'),
                                React.createElement('span', { className: 'tab-settings-diary-card__status' },
                                    DIARY_PANEL_VISIBILITY_OPTIONS.filter((option) => diaryPanelsVisibility[option.key] !== false).length
                                        + '/'
                                        + DIARY_PANEL_VISIBILITY_OPTIONS.length
                                        + ' включено'
                                )
                            ),
                            React.createElement('div', { className: 'tab-settings-diary-toggle-list' },
                                DIARY_PANEL_VISIBILITY_OPTIONS.map((option) => {
                                    const enabled = diaryPanelsVisibility[option.key] !== false;
                                    return React.createElement('button', {
                                        key: option.key,
                                        type: 'button',
                                        className: 'tab-settings-diary-toggle' + (enabled ? ' is-on' : ''),
                                        role: 'switch',
                                        'aria-checked': enabled ? 'true' : 'false',
                                        onClick: (e) => {
                                            e.stopPropagation();
                                            handleToggleDiaryPanel(option, !enabled);
                                        },
                                        title: enabled ? option.titleOn : option.titleOff,
                                    },
                                        React.createElement('span', { className: 'tab-settings-diary-toggle__copy' },
                                            React.createElement('span', { className: 'tab-settings-diary-toggle__label' }, option.label),
                                            React.createElement('span', { className: 'tab-settings-diary-toggle__hint' },
                                                enabled ? option.enabledHint : option.disabledHint
                                            )
                                        ),
                                        React.createElement('span', {
                                            className: 'tab-settings-diary-toggle__switch',
                                            'aria-hidden': 'true'
                                        },
                                            React.createElement('span', { className: 'tab-settings-diary-toggle__knob' })
                                        )
                                    );
                                })
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
    function _waitForLazyTabReady(loaderKey, getComp, options) {
        var timeoutMs = (options && options.timeoutMs) || 8000;
        var intervalMs = (options && options.intervalMs) || 50;
        var startedAt = Date.now();

        return new Promise(function (resolve, reject) {
            function tick() {
                try {
                    var comp = getComp();
                    if (comp) {
                        resolve(comp);
                        return;
                    }

                    var loadFn = window.HEYS && window.HEYS[loaderKey];
                    if (typeof loadFn === 'function') {
                        Promise.resolve(loadFn()).then(function () {
                            var loadedComp = getComp();
                            if (loadedComp) {
                                resolve(loadedComp);
                                return;
                            }
                            if (Date.now() - startedAt >= timeoutMs) {
                                reject(new Error('lazy component not registered: ' + loaderKey));
                                return;
                            }
                            setTimeout(tick, intervalMs);
                        }).catch(function (error) {
                            reject(error);
                        });
                        return;
                    }

                    if (Date.now() - startedAt >= timeoutMs) {
                        reject(new Error('lazy loader not registered: ' + loaderKey));
                        return;
                    }
                } catch (error) {
                    reject(error);
                    return;
                }

                setTimeout(tick, intervalMs);
            }

            tick();
        });
    }

    function _lazyTab(key, loaderKey, getComp) {
        if (!_lazyTabCache[key]) {
            _lazyTabCache[key] = React.lazy(function () {
                return _waitForLazyTabReady(loaderKey, getComp).then(function (comp) {
                    return { default: comp };
                }).catch(function () {
                    return {
                        default: function _LazyTabError() {
                            return tabFallbackSkeleton('⚠️', 'Модуль не загрузился. Обнови экран.', 0);
                        }
                    };
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
                { style: (tab === 'stats' || tab === 'diary' || tab === 'activity') ? undefined : { height: 0, overflow: 'hidden' } },
                wrapReactProfiler('DayTab', React.createElement(DayTabWithCloudSync, {
                    key: 'day_' + String(clientId || ''),
                    products,
                    clientId,
                    selectedDate,
                    setSelectedDate,
                    subTab: (tab === 'stats' || tab === 'diary' || tab === 'activity') ? tab : 'stats',
                }))
            ),
            (tab !== 'stats' && tab !== 'diary' && tab !== 'activity') && (
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
                        : (tab === 'stats' || tab === 'diary' || tab === 'activity')
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
