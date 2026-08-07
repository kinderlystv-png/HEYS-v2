// heys_board_tab_v1.js — read-only board tab for curator PIN client
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;

    const TASKS_CLIENT_ID = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    const CACHE_KEY = 'heys_board_snapshot_v1';

    function boardApiUrl(view) {
        const host = typeof location !== 'undefined' ? location.hostname : '';
        const base = (host === 'localhost' || host === '127.0.0.1')
            ? '/api/mcp/board'
            : 'https://api.heyslab.ru/mcp/board';
        return `${base}?view=${encodeURIComponent(view)}`;
    }

    function isBoardClient(clientId) {
        return String(clientId || '').toLowerCase() === TASKS_CLIENT_ID;
    }

    function formatFetchedAt(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        } catch (_) {
            return iso;
        }
    }

    function gapLabel(minutes) {
        if (!minutes || minutes < 45) return null;
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h && m) return `${h} ч ${m} мин свободно`;
        if (h) return `${h} ч свободно`;
        return `${m} мин свободно`;
    }

    function readCache() {
        try {
            if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
                return HEYS.utils.lsGet(CACHE_KEY, null);
            }
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    function writeCache(data) {
        try {
            if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
                HEYS.utils.lsSet(CACHE_KEY, data);
                return;
            }
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch (_) { /* quota */ }
    }

    async function fetchSnapshot({ view = 'all', signal } = {}) {
        const url = boardApiUrl(view);
        const res = await fetch(url, { method: 'GET', credentials: 'include', signal });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(body && body.error ? String(body.error) : `http_${res.status}`);
            err.status = res.status;
            throw err;
        }
        return body;
    }

    HEYS.Board = HEYS.Board || {};
    HEYS.Board.isBoardClient = isBoardClient;
    HEYS.Board.fetchSnapshot = fetchSnapshot;

    function BoardSubnav({ screen, setScreen, landscape }) {
        if (landscape) return null;
        const items = [
            { key: 'today', label: 'Сегодня' },
            { key: 'decide', label: 'Решить' },
        ];
        return React.createElement('div', { className: 'board-subnav', role: 'tablist' },
            items.map((item) => React.createElement('button', {
                key: item.key,
                type: 'button',
                role: 'tab',
                className: 'board-subnav__btn' + (screen === item.key ? ' board-subnav__btn--active' : ''),
                'aria-selected': screen === item.key,
                onClick: () => setScreen(item.key),
            }, item.label)));
    }

    function StaleBanner({ fetchedAt, offline }) {
        if (!fetchedAt) return null;
        const label = offline ? 'оффлайн · данные от ' : 'данные от ';
        return React.createElement('p', { className: 'board-stale' }, label + formatFetchedAt(fetchedAt));
    }

    function TodayView({ day, list }) {
        if (!day) return React.createElement('p', { className: 'board-empty' }, 'Нет данных за сегодня.');
        const gaps = (day.free || []).map((g) => gapLabel(g.minutes)).filter(Boolean);
        const header = [
            day.busy_minutes != null ? `занято ${Math.round(day.busy_minutes / 60 * 10) / 10} ч` : null,
            day.focus_minutes ? `фокус ${Math.round(day.focus_minutes / 60 * 10) / 10} ч` : null,
            gaps[0] || null,
        ].filter(Boolean).join(' · ');

        return React.createElement('div', { className: 'board-today' },
            header ? React.createElement('p', { className: 'board-summary' }, header) : null,
            (day.slots || []).length
                ? React.createElement('ul', { className: 'board-slots' },
                    day.slots.map((slot, i) => React.createElement('li', {
                        key: i,
                        className: 'board-slot board-slot--' + String(slot.kind || 'дело').replace(/\s+/g, '-'),
                    },
                    React.createElement('span', { className: 'board-slot__time' }, `${slot.from}–${slot.to}`),
                    React.createElement('span', { className: 'board-slot__title' }, slot.title),
                    slot.takes && slot.takes.length
                        ? React.createElement('span', { className: 'board-slot__meta' }, slot.takes.join(', '))
                        : null)))
                : React.createElement('p', { className: 'board-empty' }, 'Слотов нет — день свободен.'),
            (day.due || []).length
                ? React.createElement('div', { className: 'board-due' },
                    React.createElement('p', { className: 'board-due__title' }, 'Дедлайны'),
                    React.createElement('ul', null, day.due.map((d, i) => React.createElement('li', { key: i },
                        React.createElement('span', { className: 'board-due__ref' }, d.ref),
                        ' ',
                        d.title))))
                : null,
            list && (list.overdue || []).length
                ? React.createElement('div', { className: 'board-hot' },
                    React.createElement('p', { className: 'board-hot__title' }, 'Просрочено'),
                    React.createElement('ul', null, list.overdue.slice(0, 5).map((t, i) => React.createElement('li', { key: i }, t.title))))
                : null);
    }

    function WeekView({ week }) {
        if (!week || !(week.days || []).length) {
            return React.createElement('p', { className: 'board-empty' }, 'Неделя пуста.');
        }
        return React.createElement('div', { className: 'board-week' },
            week.days.map((day) => React.createElement('div', { key: day.date, className: 'board-week__col' },
                React.createElement('div', { className: 'board-week__head' }, day.date.slice(5)),
                React.createElement('div', {
                    className: 'board-week__bar',
                    style: { height: `${Math.min(100, Math.round((day.busy_minutes || 0) / 6))}px` },
                    title: `${day.busy_minutes || 0} мин`,
                }),
                (day.free || []).slice(0, 1).map((g, i) => React.createElement('div', {
                    key: i,
                    className: 'board-week__gap',
                }, gapLabel(g.minutes) || '')))));
    }

    function DecideView({ standup, list, cardIndex, setCardIndex }) {
        const questions = (standup && standup.simple_questions) || [];
        const totalOpen = (list && list.blocked && list.blocked.length) || 0;
        const q = questions[cardIndex];

        if (!q) {
            return React.createElement('div', { className: 'board-decide board-decide--done' },
                React.createElement('p', null, 'Простых вопросов сейчас нет.'),
                totalOpen ? React.createElement('p', { className: 'board-muted' }, `На доске ещё ${totalOpen} открытых.`) : null);
        }

        return React.createElement('div', { className: 'board-decide' },
            React.createElement('p', { className: 'board-decide__counter' },
                `${cardIndex + 1} из ${questions.length}${totalOpen ? ` · открыто ${totalOpen}` : ''}`),
            React.createElement('p', { className: 'board-decide__task' }, q.task || q.ref),
            React.createElement('p', { className: 'board-decide__question' }, q.question),
            React.createElement('div', { className: 'board-decide__actions' },
                React.createElement('button', {
                    type: 'button',
                    className: 'board-decide__btn',
                    onClick: () => setCardIndex((i) => Math.min(questions.length - 1, i + 1)),
                }, 'Потом'),
                React.createElement('button', {
                    type: 'button',
                    className: 'board-decide__btn board-decide__btn--primary',
                    onClick: () => setCardIndex((i) => Math.min(questions.length - 1, i + 1)),
                }, 'Дальше')));
    }

    function BoardTab() {
        const [screen, setScreen] = React.useState('today');
        const [landscape, setLandscape] = React.useState(false);
        const [data, setData] = React.useState(() => readCache());
        const [offline, setOffline] = React.useState(!navigator.onLine);
        const [loading, setLoading] = React.useState(false);
        const [error, setError] = React.useState('');
        const [cardIndex, setCardIndex] = React.useState(0);

        const reload = React.useCallback(async () => {
            if (!navigator.onLine) {
                setOffline(true);
                return;
            }
            setLoading(true);
            setError('');
            try {
                const snap = await fetchSnapshot({ view: 'all' });
                writeCache(snap);
                setData(snap);
                setOffline(false);
                setCardIndex(0);
            } catch (e) {
                if (e && e.status === 403) {
                    setError('Доска недоступна для этого клиента.');
                } else if (!readCache()) {
                    setError('Не удалось загрузить доску. Проверьте связь.');
                }
                setOffline(!navigator.onLine || (e && e.status !== 403));
            } finally {
                setLoading(false);
            }
        }, []);

        React.useEffect(() => {
            const onOrient = () => {
                const ls = window.matchMedia('(orientation: landscape)').matches;
                setLandscape(ls);
                if (ls) setScreen('week');
            };
            onOrient();
            window.addEventListener('resize', onOrient);
            return () => window.removeEventListener('resize', onOrient);
        }, []);

        React.useEffect(() => {
            const onOnline = () => { setOffline(false); reload(); };
            const onOffline = () => setOffline(true);
            window.addEventListener('online', onOnline);
            window.addEventListener('offline', onOffline);
            return () => {
                window.removeEventListener('online', onOnline);
                window.removeEventListener('offline', onOffline);
            };
        }, [reload]);

        React.useEffect(() => {
            reload();
        }, [reload]);

        React.useEffect(() => {
            const onVis = () => { if (document.visibilityState === 'visible') reload(); };
            document.addEventListener('visibilitychange', onVis);
            return () => document.removeEventListener('visibilitychange', onVis);
        }, [reload]);

        const todayDay = data && data.today && data.today.days && data.today.days[0];
        const week = data && data.week;
        const standup = data && data.standup;
        const list = data && data.list;
        const activeScreen = landscape ? 'week' : screen;

        return React.createElement('div', { className: 'board-tab' },
            React.createElement('header', { className: 'board-header' },
                React.createElement('h1', { className: 'board-header__title' }, landscape ? 'Неделя' : 'Доска'),
                React.createElement('button', {
                    type: 'button',
                    className: 'board-header__refresh',
                    disabled: loading,
                    onClick: reload,
                    'aria-label': 'Обновить',
                }, loading ? '…' : '↻')),
            React.createElement(StaleBanner, { fetchedAt: data && data.fetched_at, offline }),
            error ? React.createElement('p', { className: 'board-error', role: 'alert' }, error) : null,
            React.createElement(BoardSubnav, { screen, setScreen, landscape }),
            activeScreen === 'today'
                ? React.createElement(TodayView, { day: todayDay, list })
                : activeScreen === 'week'
                    ? React.createElement(WeekView, { week })
                    : React.createElement(DecideView, {
                        standup,
                        list,
                        cardIndex,
                        setCardIndex,
                    }));
    }

    HEYS.BoardTab = BoardTab;

    if (typeof document !== 'undefined' && !document.getElementById('heys-board-styles')) {
        const style = document.createElement('style');
        style.id = 'heys-board-styles';
        style.textContent = `
.board-tab{padding:12px 14px 24px;max-width:520px;margin:0 auto}
.board-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.board-header__title{font-size:18px;font-weight:600;margin:0}
.board-header__refresh{border:0;background:transparent;font-size:20px;padding:4px 8px}
.board-stale{font-size:12px;color:var(--muted,#6b7280);margin:0 0 12px}
.board-subnav{display:flex;gap:8px;margin-bottom:14px}
.board-subnav__btn{flex:1;padding:10px;border:1px solid var(--border,#e5e7eb);border-radius:10px;background:var(--card,#fff)}
.board-subnav__btn--active{border-color:var(--primary,#2563eb);font-weight:600}
.board-summary{font-size:14px;margin:0 0 12px}
.board-slots{list-style:none;padding:0;margin:0}
.board-slot{padding:10px 12px;border-radius:10px;margin-bottom:8px;background:var(--card,#f9fafb);border-left:4px solid #94a3b8}
.board-slot--фокус{border-left-color:#2563eb;background:#eff6ff}
.board-slot__time{display:block;font-size:12px;color:#6b7280}
.board-slot__title{display:block;font-size:15px;margin-top:2px}
.board-slot__meta{display:block;font-size:12px;color:#9ca3af;margin-top:4px}
.board-week{display:flex;gap:6px;overflow-x:auto;padding-bottom:8px}
.board-week__col{flex:1;min-width:44px;text-align:center}
.board-week__head{font-size:11px;color:#6b7280;margin-bottom:6px}
.board-week__bar{background:#2563eb;border-radius:4px;margin:0 auto 4px;width:28px;min-height:4px}
.board-week__gap{font-size:10px;color:#6b7280;line-height:1.2}
.board-decide__counter{font-size:13px;color:#6b7280}
.board-decide__task{font-size:13px;color:#6b7280;margin:8px 0}
.board-decide__question{font-size:20px;font-weight:600;line-height:1.35;margin:0 0 20px}
.board-decide__actions{display:flex;gap:10px}
.board-decide__btn{flex:1;padding:12px;border-radius:10px;border:1px solid #e5e7eb;background:#fff}
.board-decide__btn--primary{background:#2563eb;color:#fff;border-color:#2563eb}
.board-empty,.board-error,.board-muted{font-size:14px;color:#6b7280}
.board-error{color:#b91c1c}
.board-due,.board-hot{margin-top:16px}
.board-due__title,.board-hot__title{font-size:13px;font-weight:600;margin:0 0 6px}
`;
        document.head.appendChild(style);
    }

    console.info('[HEYS.board] ✅ BoardTab registered');
})();
