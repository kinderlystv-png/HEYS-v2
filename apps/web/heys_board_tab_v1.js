// heys_board_tab_v1.js — board tab for curator PIN client (read + talk)
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;

    const TASKS_CLIENT_ID = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    const CACHE_KEY = 'heys_board_snapshot_v1';
    const COLLAPSE_KEY = 'heys_board_collapse_v1';
    const THEME_KEY = 'heys_board_theme_v1';

    function readBoardTheme() {
        try {
            if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
                const saved = HEYS.utils.lsGet(THEME_KEY, null);
                if (saved === 'light' || saved === 'dark') return saved;
            } else {
                const saved = localStorage.getItem(THEME_KEY);
                if (saved === 'light' || saved === 'dark') return saved;
            }
        } catch (_) { /* noop */ }
        return 'dark';
    }

    function writeBoardTheme(theme) {
        try {
            if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
                HEYS.utils.lsSet(THEME_KEY, theme);
            }
        } catch (_) { /* quota */ }
    }

    function boardApiUrl(view) {
        const host = typeof location !== 'undefined' ? location.hostname : '';
        const base = (host === 'localhost' || host === '127.0.0.1')
            ? '/api/mcp/board'
            : 'https://api.heyslab.ru/mcp/board';
        return `${base}?view=${encodeURIComponent(view)}`;
    }

    function boardTalkApiUrl() {
        const host = typeof location !== 'undefined' ? location.hostname : '';
        const base = (host === 'localhost' || host === '127.0.0.1')
            ? '/api/mcp/board/talk'
            : 'https://api.heyslab.ru/mcp/board/talk';
        return base;
    }

    function boardResolveApiUrl() {
        const host = typeof location !== 'undefined' ? location.hostname : '';
        const base = (host === 'localhost' || host === '127.0.0.1')
            ? '/api/mcp/board/resolve'
            : 'https://api.heyslab.ru/mcp/board/resolve';
        return base;
    }

    function boardSleepApiUrl() {
        const host = typeof location !== 'undefined' ? location.hostname : '';
        const base = (host === 'localhost' || host === '127.0.0.1')
            ? '/api/mcp/board/sleep'
            : 'https://api.heyslab.ru/mcp/board/sleep';
        return base;
    }

    function boardReslotApiUrl() {
        const host = typeof location !== 'undefined' ? location.hostname : '';
        const base = (host === 'localhost' || host === '127.0.0.1')
            ? '/api/mcp/board/reslot'
            : 'https://api.heyslab.ru/mcp/board/reslot';
        return base;
    }

    function boardCloseDayApiUrl() {
        const host = typeof location !== 'undefined' ? location.hostname : '';
        const base = (host === 'localhost' || host === '127.0.0.1')
            ? '/api/mcp/board/close-day'
            : 'https://api.heyslab.ru/mcp/board/close-day';
        return base;
    }

    function boardSlotDoneApiUrl() {
        const host = typeof location !== 'undefined' ? location.hostname : '';
        return (host === 'localhost' || host === '127.0.0.1')
            ? '/api/mcp/board/slot-done'
            : 'https://api.heyslab.ru/mcp/board/slot-done';
    }

    function boardHabitApiUrl() {
        const host = typeof location !== 'undefined' ? location.hostname : '';
        return (host === 'localhost' || host === '127.0.0.1')
            ? '/api/mcp/board/habit'
            : 'https://api.heyslab.ru/mcp/board/habit';
    }

    function refFromTitle(title) {
        const parts = String(title || '').split('·').map((p) => p.trim());
        const tail = parts[parts.length - 1] || '';
        return /^[\w\d-]+\/[0-9a-f]{6}$/i.test(tail) ? tail.toLowerCase() : null;
    }

    function parseTalkNotes(children) {
        return (children || [])
            .filter((c) => /^обсудить:/i.test(c) || /^для агента:/i.test(c))
            .map((c) => c.replace(/\s*\^\d{4}-\d{2}-\d{2}\s*$/i, '').trim());
    }

    async function submitTalk(payload) {
        const res = await fetch(boardTalkApiUrl(), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(
                (body && body.error && body.error.message) || (body && body.error) || `http_${res.status}`,
            );
            err.status = res.status;
            throw err;
        }
        return body;
    }

    async function submitResolve(payload) {
        const res = await fetch(boardResolveApiUrl(), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(
                (body && body.error && body.error.message) || (body && body.error) || `http_${res.status}`,
            );
            err.status = res.status;
            throw err;
        }
        return body;
    }

    async function submitCloseDay(payload) {
        const res = await fetch(boardCloseDayApiUrl(), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(
                (body && body.error && body.error.message) || (body && body.error) || `http_${res.status}`,
            );
            err.status = res.status;
            throw err;
        }
        return body;
    }

    async function submitSleep(payload) {
        const res = await fetch(boardSleepApiUrl(), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(
                (body && body.error && body.error.message) || (body && body.error) || `http_${res.status}`,
            );
            err.status = res.status;
            throw err;
        }
        return body;
    }

    async function submitReslot(payload) {
        const res = await fetch(boardReslotApiUrl(), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(
                (body && body.error && body.error.message) || (body && body.error) || `http_${res.status}`,
            );
            err.status = res.status;
            throw err;
        }
        return body;
    }

    async function submitSlotDone(payload) {
        const res = await fetch(boardSlotDoneApiUrl(), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(
                (body && body.error && body.error.message) || (body && body.error) || `http_${res.status}`,
            );
            err.status = res.status;
            throw err;
        }
        return body;
    }

    async function submitHabit(payload) {
        const res = await fetch(boardHabitApiUrl(), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(
                (body && body.error && body.error.message) || (body && body.error) || `http_${res.status}`,
            );
            err.status = res.status;
            throw err;
        }
        return body;
    }

    function timeToMinutes(hhmm) {
        const parts = String(hhmm || '').split(':');
        if (parts.length < 2) return 0;
        return Number(parts[0]) * 60 + Number(parts[1]);
    }

    function minutesToTime(mins) {
        const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
        const h = Math.floor(clamped / 60);
        const m = clamped % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function shiftSlotTime(from, to, deltaMins) {
        const span = Math.max(15, timeToMinutes(to) - timeToMinutes(from));
        const nextFrom = timeToMinutes(from) + deltaMins;
        const nextTo = nextFrom + span;
        if (nextFrom < 7 * 60 || nextTo > 25 * 60) return null;
        return { from: minutesToTime(nextFrom), to: minutesToTime(nextTo) };
    }

    function openQuestionsFromTask(task) {
        return (task.children || [])
            .filter((c) => /^открыто:/i.test(c))
            .map((c, i) => ({
                ref: task.ref,
                task: task.title,
                question: c.replace(/^открыто:\s*/i, '').trim(),
                key: `${task.ref || task.title}:${i}:${c}`,
            }));
    }

    function slotDoneKey(slot, index) {
        return `${slot.from || ''}::${slot.to || ''}::${slot.title || ''}::${index}`;
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
            }
        } catch (_) { /* quota */ }
    }

    function readCollapseState() {
        try {
            if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
                return HEYS.utils.lsGet(COLLAPSE_KEY, {}) || {};
            }
        } catch (_) { /* noop */ }
        return {};
    }

    function writeCollapseState(state) {
        try {
            if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
                HEYS.utils.lsSet(COLLAPSE_KEY, state);
            }
        } catch (_) { /* noop */ }
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
    HEYS.Board.readTheme = readBoardTheme;
    HEYS.Board.questionRowKey = questionRowKey;
    HEYS.Board.choiceToAnswer = choiceToAnswer;
    HEYS.Board.buildBatchResolveEntries = buildBatchResolveEntries;
    HEYS.Board.countSimpleSelections = countSimpleSelections;

    function useCollapse(sectionId, defaultOpen) {
        const [open, setOpen] = React.useState(() => {
            const saved = readCollapseState();
            if (Object.prototype.hasOwnProperty.call(saved, sectionId)) {
                return !!saved[sectionId];
            }
            return defaultOpen !== false;
        });

        const toggle = React.useCallback(() => {
            setOpen((prev) => {
                const next = !prev;
                const saved = readCollapseState();
                saved[sectionId] = next;
                writeCollapseState(saved);
                return next;
            });
        }, [sectionId]);

        return [open, toggle];
    }

    function dedupeSimpleQuestions(questions) {
        const seen = new Set();
        return (questions || []).filter((q) => {
            const ref = String(q.ref || q.task || '').trim().toLowerCase();
            if (!ref) return true;
            if (seen.has(ref)) return false;
            seen.add(ref);
            return true;
        });
    }

    function questionRowKey(question) {
        return question.key || question.ref;
    }

    function choiceToAnswer(choice) {
        if (choice === 'yes') return 'да';
        if (choice === 'no') return 'нет';
        return null;
    }

    function buildBatchResolveEntries(questions, selections) {
        return (questions || [])
            .map((q) => {
                const key = questionRowKey(q);
                const answer = choiceToAnswer(selections[key]);
                if (!key || !answer) return null;
                return { question: q, key, answer };
            })
            .filter(Boolean);
    }

    function countSimpleSelections(questions, selections) {
        return buildBatchResolveEntries(questions, selections).length;
    }

    function formatDayLabel(iso) {
        if (!iso) return '';
        try {
            const d = new Date(`${iso}T12:00:00`);
            return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
        } catch (_) {
            return iso;
        }
    }

    const RU_MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

    function shortDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
        if (!m) return String(iso || '');
        return `${Number(m[3])} ${RU_MONTHS[Number(m[2]) - 1] || ''}`.trim();
    }

    // Неточный срок показывается диапазоном: «10-12 авг». Слово «окно» здесь не
    // пишем — в этой же вкладке им уже названо свободное время дня, и две
    // разные вещи под одним словом на маленьком экране не разводятся.
    function dueLabel(item) {
        const win = item && item.window;
        if (!win || !win.from || !win.to) return null;
        const from = /^(\d{4})-(\d{2})-\d{2}$/.exec(win.from);
        const to = /^(\d{4})-(\d{2})-\d{2}$/.exec(win.to);
        // Окно не по формату лучше не показывать вовсе, чем показать как есть:
        // «нет-тоже нет» на месте срока читается как поломка всей карточки.
        if (!from || !to) return null;
        const sameMonth = from[1] === to[1] && from[2] === to[2];
        const left = sameMonth ? String(Number(/(\d{2})$/.exec(win.from)[1])) : shortDate(win.from);
        return `${left}-${shortDate(win.to)}`;
    }

    function orderMeta(item) {
        const parts = [];
        if (item.place) parts.push(item.place);
        if (item.price) parts.push(item.price);
        const range = dueLabel(item);
        if (item.overdue && item.due) parts.push(`просрочено ${range || item.due}`);
        else if (range) parts.push(range);
        else if (item.due) parts.push(`до ${item.due}`);
        return parts.join(' · ') || null;
    }

    function computeDecideCount(standup, list) {
        const questions = dedupeSimpleQuestions((standup && standup.simple_questions) || []);
        const blocked = (list && list.blocked) || [];
        const simpleRefs = new Set(
            questions.map((q) => String(q.ref || q.task || '').trim().toLowerCase()).filter(Boolean),
        );
        const extraBlocked = blocked.filter((t) => !simpleRefs.has(String(t.ref || '').trim().toLowerCase()));
        return questions.length + extraBlocked.length;
    }

    function computeTodayCount(day, list, closeDay) {
        let count = 0;
        if (day) {
            count += (day.slots || []).length;
            count += (day.due || []).length;
        }
        if (list && list.overdue) count += list.overdue.length;
        if (closeDay && !closeDay.closed && closeDay.open_count) count += closeDay.open_count;
        return count;
    }

    function computeDashboardCount(standup, list, orders, quick) {
        const decide = computeDecideCount(standup, list);
        const orderCount = (orders && orders.open && orders.open.length) || 0;
        const quickCount = (quick && quick.picked && quick.picked.length) || 0;
        return decide + orderCount + quickCount;
    }

    function BoardChips({ screen, setScreen, landscape, counts }) {
        const listRef = React.useRef(null);
        const items = [
            { key: 'today', label: 'Сегодня', count: counts.today },
            { key: 'dashboard', label: 'Дашборд', count: counts.dashboard },
        ];
        if (landscape) {
            items.push({ key: 'week', label: 'Неделя' });
        }

        React.useEffect(() => {
            const root = listRef.current;
            if (!root) return;
            const active = root.querySelector('.board-chip--active');
            if (active && typeof active.scrollIntoView === 'function') {
                active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        }, [screen, landscape]);

        return React.createElement('div', { className: 'board-chips', role: 'tablist', ref: listRef },
            items.map((item) => React.createElement('button', {
                key: item.key,
                type: 'button',
                role: 'tab',
                className: 'board-chip' + (screen === item.key ? ' board-chip--active' : ''),
                'aria-selected': screen === item.key,
                onClick: () => setScreen(item.key),
            },
            item.label,
            item.count != null && item.count > 0
                ? React.createElement('span', { className: 'board-chip__count' }, String(item.count))
                : null)));
    }

    function StaleBanner({ fetchedAt, offline }) {
        if (!fetchedAt) return null;
        const label = offline ? 'оффлайн · данные от ' : 'данные от ';
        return React.createElement('p', { className: 'board-stale' }, label + formatFetchedAt(fetchedAt));
    }

    function Section({ id, title, count, defaultOpen, children }) {
        const [open, toggle] = useCollapse(id, defaultOpen);
        const countLabel = count != null && count > 0 ? String(count) : null;
        return React.createElement('section', { className: 'board-section' },
            React.createElement('button', {
                type: 'button',
                className: 'board-section__head',
                'aria-expanded': open,
                onClick: toggle,
            },
            React.createElement('span', { className: 'board-section__chevron', 'aria-hidden': true }, open ? '▾' : '▸'),
            React.createElement('span', { className: 'board-section__title' }, title),
            countLabel ? React.createElement('span', { className: 'board-section__count' }, countLabel) : null),
            open ? React.createElement('div', { className: 'board-section__body' }, children) : null);
    }

    function TaskRow({ refId, title, meta, tone, notes, onTalk }) {
        const toneClass = tone ? ` board-task--${tone}` : '';
        const talkNotes = parseTalkNotes(notes);
        return React.createElement('li', { className: 'board-task' + toneClass },
            React.createElement('div', { className: 'board-task__head' },
                React.createElement('div', { className: 'board-task__main' },
                    refId ? React.createElement('span', { className: 'board-task__ref' }, refId) : null,
                    React.createElement('span', { className: 'board-task__title' }, title || '—'),
                    meta ? React.createElement('span', { className: 'board-task__meta' }, meta) : null),
                onTalk ? React.createElement('button', {
                    type: 'button',
                    className: 'board-talk-btn',
                    'aria-label': 'Комментарий',
                    onClick: (e) => { e.stopPropagation(); onTalk(); },
                }, '💬') : null),
            talkNotes.length
                ? React.createElement('ul', { className: 'board-talk-notes' },
                    talkNotes.map((n, i) => React.createElement('li', { key: i, className: 'board-talk-notes__item' }, n)))
                : null);
    }

    function SimpleQuestionRow({
        question, choice, onChoiceChange, onTalk, onSleep, sleeping, error, offline, disabled,
    }) {
        const rowKey = questionRowKey(question);
        const canAct = !!(question.question || question.ref || question.task) && !offline && !disabled;
        const busy = sleeping;

        return React.createElement('li', { className: 'board-task board-task--open board-simple-q' },
            React.createElement('div', { className: 'board-task__head' },
                React.createElement('div', { className: 'board-task__main' },
                    question.ref || question.task
                        ? React.createElement('span', { className: 'board-task__ref' }, question.ref || question.task)
                        : null,
                    React.createElement('span', { className: 'board-task__title' }, question.question || '—'),
                    dueLabel(question) || question.due
                        ? React.createElement('span', { className: 'board-task__meta' },
                            dueLabel(question) || `due ${question.due}`)
                        : null),
                onTalk && (question.ref || question.task)
                    ? React.createElement('button', {
                        type: 'button',
                        className: 'board-talk-btn',
                        'aria-label': 'Комментарий',
                        onClick: (e) => {
                            e.stopPropagation();
                            onTalk({ ref: question.ref || question.task, label: question.question });
                        },
                    }, '💬')
                    : null),
            React.createElement('p', { className: 'board-simple-q__hint' },
                'Вопрос останется на доске — просто не попадёт в вечернюю пятёрку.'),
            React.createElement('div', { className: 'board-simple-q__actions' },
                React.createElement('div', {
                    className: 'board-simple-q__toggle',
                    role: 'group',
                    'aria-label': 'Ответ да или нет',
                },
                React.createElement('button', {
                    type: 'button',
                    className: 'board-simple-q__opt board-simple-q__opt--yes'
                        + (choice === 'yes' ? ' board-simple-q__opt--active' : ''),
                    'aria-pressed': choice === 'yes',
                    disabled: !canAct || busy,
                    onClick: () => onChoiceChange && onChoiceChange(rowKey, 'yes'),
                }, 'Да'),
                React.createElement('button', {
                    type: 'button',
                    className: 'board-simple-q__opt board-simple-q__opt--no'
                        + (choice === 'no' ? ' board-simple-q__opt--active' : ''),
                    'aria-pressed': choice === 'no',
                    disabled: !canAct || busy,
                    onClick: () => onChoiceChange && onChoiceChange(rowKey, 'no'),
                }, 'Нет')),
                onSleep ? React.createElement('button', {
                    type: 'button',
                    className: 'board-simple-q__later',
                    disabled: !canAct || busy,
                    onClick: () => onSleep(question),
                }, sleeping ? '…' : 'Потом') : null),
            error
                ? React.createElement('p', { className: 'board-simple-q__error', role: 'alert' }, error)
                : null);
    }

    function SlotReslotPanel({ slot, dayDate, draft, setDraft, saving, error, onCancel, onSave, offline }) {
        return React.createElement('div', { className: 'board-reslot' },
            React.createElement('p', { className: 'board-reslot__label' }, 'Новое время'),
            React.createElement('div', { className: 'board-reslot__row' },
                React.createElement('button', {
                    type: 'button',
                    className: 'board-reslot__step',
                    disabled: saving || offline,
                    onClick: () => {
                        const next = shiftSlotTime(draft.from, draft.to, -15);
                        if (next) setDraft(next);
                    },
                }, '−15'),
                React.createElement('span', { className: 'board-reslot__time' }, `${draft.from}–${draft.to}`),
                React.createElement('button', {
                    type: 'button',
                    className: 'board-reslot__step',
                    disabled: saving || offline,
                    onClick: () => {
                        const next = shiftSlotTime(draft.from, draft.to, 15);
                        if (next) setDraft(next);
                    },
                }, '+15')),
            React.createElement('div', { className: 'board-reslot__actions' },
                React.createElement('button', {
                    type: 'button',
                    className: 'board-reslot__cancel',
                    disabled: saving,
                    onClick: onCancel,
                }, 'Отмена'),
                React.createElement('button', {
                    type: 'button',
                    className: 'board-reslot__save',
                    disabled: saving || offline,
                    onClick: () => onSave({ date: dayDate, at: slot.from, from: draft.from, to: draft.to, title: slot.title }),
                }, saving ? '…' : 'Сохранить')),
            error
                ? React.createElement('p', { className: 'board-reslot__error', role: 'alert' }, error)
                : null);
    }

    function SlotRow({
        slot, dayDate, slotKey, onTalk, onReslot, reslotting, reslotError, offline,
        onToggleDone, togglingDone, doneError,
    }) {
        const [open, setOpen] = React.useState(false);
        const [draft, setDraft] = React.useState({ from: slot.from, to: slot.to });
        const canToggle = onToggleDone && !slot.repeat;

        React.useEffect(() => {
            setDraft({ from: slot.from, to: slot.to });
            setOpen(false);
        }, [slotKey, slot.from, slot.to]);

        return React.createElement('li', {
            className: 'board-slot ' + slotKindClass(slot.kind)
                + (slot.done ? ' board-slot--done' : ''),
        },
        React.createElement('div', { className: 'board-slot__row' },
            React.createElement('span', { className: 'board-slot__time' }, `${slot.from}–${slot.to}`),
            React.createElement('div', { className: 'board-slot__actions' },
                slot.kind ? React.createElement('span', { className: 'board-slot__kind' }, slot.kind) : null,
                canToggle ? React.createElement('button', {
                    type: 'button',
                    className: 'board-slot__done-btn' + (slot.done ? ' board-slot__done-btn--on' : ''),
                    disabled: offline || togglingDone,
                    'aria-label': slot.done ? 'Снять отметку состоялось' : 'Отметить состоялось',
                    'aria-pressed': !!slot.done,
                    onClick: (e) => {
                        e.stopPropagation();
                        onToggleDone({
                            date: dayDate,
                            start: slot.from,
                            title: slot.title,
                            done: !slot.done,
                        });
                    },
                }, togglingDone ? '…' : '✓') : null,
                onReslot ? React.createElement('button', {
                    type: 'button',
                    className: 'board-slot__reslot-btn',
                    disabled: offline || reslotting,
                    onClick: (e) => {
                        e.stopPropagation();
                        setOpen((v) => !v);
                    },
                }, open ? 'Скрыть' : 'Перенести') : null,
                onTalk ? React.createElement('button', {
                    type: 'button',
                    className: 'board-talk-btn board-talk-btn--slot',
                    'aria-label': 'Комментарий',
                    onClick: (e) => { e.stopPropagation(); onTalk(); },
                }, '💬') : null)),
        React.createElement('span', { className: 'board-slot__title' }, slot.title),
        slot.takes && slot.takes.length
            ? React.createElement('span', { className: 'board-slot__meta' }, slot.takes.join(' · '))
            : null,
        doneError
            ? React.createElement('p', { className: 'board-slot__error', role: 'alert' }, doneError)
            : null,
        open && onReslot
            ? React.createElement(SlotReslotPanel, {
                slot,
                dayDate,
                draft,
                setDraft,
                saving: reslotting,
                error: reslotError,
                offline,
                onCancel: () => setOpen(false),
                onSave: async (payload) => {
                    await onReslot(payload);
                    setOpen(false);
                },
            })
            : null);
    }

    function slotKindClass(kind) {
        const k = String(kind || 'дело').toLowerCase();
        if (k === 'фокус') return 'board-slot--focus';
        if (k === 'встреча' || k === 'событие') return 'board-slot--event';
        return 'board-slot--default';
    }

    function TalkSheet({ target, text, setText, standup, setStandup, toAgent, setToAgent, saving, error, onClose, onSave }) {
        if (!target) return null;
        return React.createElement('div', { className: 'board-talk-sheet', role: 'dialog', 'aria-modal': true },
            React.createElement('button', {
                type: 'button',
                className: 'board-talk-sheet__backdrop',
                'aria-label': 'Закрыть',
                onClick: onClose,
            }),
            React.createElement('div', { className: 'board-talk-sheet__panel' },
                React.createElement('div', { className: 'board-talk-sheet__head' },
                    React.createElement('p', { className: 'board-talk-sheet__label' }, target.label || target.ref || 'Комментарий'),
                    React.createElement('button', {
                        type: 'button',
                        className: 'board-talk-sheet__close',
                        onClick: onClose,
                    }, '✕')),
                React.createElement('textarea', {
                    className: 'board-talk-sheet__input',
                    rows: 4,
                    placeholder: 'Мысль, вопрос, что обсудить…',
                    value: text,
                    onChange: (e) => setText(e.target.value),
                    autoFocus: true,
                }),
                React.createElement('div', { className: 'board-talk-sheet__toggles' },
                    React.createElement('label', { className: 'board-talk-sheet__option' },
                        React.createElement('input', {
                            type: 'checkbox',
                            className: 'board-talk-sheet__check',
                            checked: standup,
                            disabled: toAgent,
                            onChange: (e) => setStandup(e.target.checked),
                        }),
                        React.createElement('span', { className: 'board-talk-sheet__option-body' },
                            React.createElement('span', { className: 'board-talk-sheet__option-title' }, 'На планёрку'),
                            React.createElement('span', { className: 'board-talk-sheet__option-hint' },
                                'Обсудим утром вместе — приоритет, выбор, сомнение. Например: «перенести на сентябрь?» или «что важнее — релиз или PWA?»'))),
                    React.createElement('label', { className: 'board-talk-sheet__option' },
                        React.createElement('input', {
                            type: 'checkbox',
                            className: 'board-talk-sheet__check',
                            checked: toAgent,
                            onChange: (e) => {
                                setToAgent(e.target.checked);
                                if (e.target.checked) setStandup(false);
                            },
                        }),
                        React.createElement('span', { className: 'board-talk-sheet__option-body' },
                            React.createElement('span', { className: 'board-talk-sheet__option-title' }, 'Для агента (без планёрки)'),
                            React.createElement('span', { className: 'board-talk-sheet__option-hint' },
                                'Агент сделает сам, без обсуждения. Например: «найди цену на озоне» или «допиши тесты к этому»'))),
                ),
                error ? React.createElement('p', { className: 'board-talk-sheet__error', role: 'alert' }, error) : null,
                React.createElement('button', {
                    type: 'button',
                    className: 'board-talk-sheet__save',
                    disabled: saving || !String(text || '').trim(),
                    onClick: onSave,
                }, saving ? 'Сохраняю…' : 'Сохранить')));
    }

    function TodayView({
        day, list, habits, onTalk, onReslot, reslottingKey, reslotErrors, offline,
        onToggleSlot, togglingSlotKey, slotDoneErrors,
        onToggleHabit, togglingHabitKey, habitErrors,
    }) {
        if (!day) return React.createElement('p', { className: 'board-empty' }, 'Нет данных за сегодня.');

        const gaps = (day.free || []).map((g) => gapLabel(g.minutes)).filter(Boolean);
        const due = day.due || [];
        const overdue = (list && list.overdue) || [];
        const habitList = habits || [];
        const stats = [
            day.busy_minutes != null ? { label: 'занято', value: `${Math.round(day.busy_minutes / 60 * 10) / 10} ч` } : null,
            day.focus_minutes ? { label: 'фокус', value: `${Math.round(day.focus_minutes / 60 * 10) / 10} ч` } : null,
            gaps[0] ? { label: 'окно', value: gaps[0] } : null,
        ].filter(Boolean);

        return React.createElement('div', { className: 'board-today' },
            stats.length
                ? React.createElement('div', { className: 'board-stats' },
                    stats.map((s, i) => React.createElement('div', { key: i, className: 'board-stat' },
                        React.createElement('span', { className: 'board-stat__value' }, s.value),
                        React.createElement('span', { className: 'board-stat__label' }, s.label))))
                : null,
            habitList.length
                ? React.createElement(Section, {
                    id: 'today-habits',
                    title: 'Привычки',
                    count: habitList.length,
                    defaultOpen: true,
                },
                React.createElement('div', { className: 'board-habits' },
                    habitList.map((h, i) => {
                        const key = h.name;
                        const busy = togglingHabitKey === key;
                        return React.createElement('button', {
                            key: i,
                            type: 'button',
                            className: 'board-habit-chip' + (h.done ? ' board-habit-chip--done' : ''),
                            disabled: offline || busy || !onToggleHabit,
                            'aria-pressed': !!h.done,
                            onClick: () => onToggleHabit && onToggleHabit({
                                habit: h.name,
                                date: day.date,
                                done: !h.done,
                            }),
                        }, busy ? '…' : (h.done ? `✓ ${h.name}` : h.name));
                    })),
                Object.keys(habitErrors || {}).length
                    ? React.createElement('p', { className: 'board-slot__error', role: 'alert' },
                        Object.values(habitErrors)[0])
                    : null)
                : null,
            React.createElement(Section, {
                id: 'today-slots',
                title: 'Расписание',
                count: (day.slots || []).length,
                defaultOpen: true,
            },
            (day.slots || []).length
                ? React.createElement('ul', { className: 'board-slots' },
                    day.slots.map((slot, i) => {
                        const toggleKey = `${day.date}:${slot.from}:${slot.title}`;
                        return React.createElement(SlotRow, {
                            key: i,
                            slot,
                            dayDate: day.date,
                            slotKey: `${day.date}:${slot.from}:${slot.title}:${i}`,
                            offline,
                            reslotting: reslottingKey === toggleKey,
                            reslotError: reslotErrors[toggleKey] || '',
                            onReslot: onReslot && !offline ? onReslot : null,
                            togglingDone: togglingSlotKey === toggleKey,
                            doneError: (slotDoneErrors && slotDoneErrors[toggleKey]) || '',
                            onToggleDone: onToggleSlot && !offline ? onToggleSlot : null,
                            onTalk: onTalk ? () => {
                                const ref = refFromTitle(slot.title);
                                if (ref) {
                                    onTalk({ ref, label: slot.title });
                                } else {
                                    onTalk({
                                        entity: 'slot',
                                        date: day.date,
                                        start: slot.from,
                                        title: slot.title,
                                        label: slot.title,
                                    });
                                }
                            } : null,
                        });
                    }))
                : React.createElement('p', { className: 'board-empty board-empty--inset' }, 'Слотов нет — день свободен.')),
            due.length
                ? React.createElement(Section, {
                    id: 'today-due',
                    title: 'Дедлайны',
                    count: due.length,
                    defaultOpen: true,
                },
                React.createElement('ul', { className: 'board-task-list' },
                    due.map((d, i) => React.createElement(TaskRow, {
                        key: i,
                        refId: d.ref,
                        title: d.title,
                        tone: 'due',
                        onTalk: onTalk && d.ref ? () => onTalk({ ref: d.ref, label: d.title }) : null,
                    }))))
                : null,
            overdue.length
                ? React.createElement(Section, {
                    id: 'today-overdue',
                    title: 'Просрочено',
                    count: overdue.length,
                    defaultOpen: false,
                },
                React.createElement('ul', { className: 'board-task-list' },
                    overdue.slice(0, 8).map((t, i) => React.createElement(TaskRow, {
                        key: i,
                        refId: t.ref,
                        title: t.title,
                        notes: t.children,
                        tone: 'overdue',
                        onTalk: onTalk && t.ref ? () => onTalk({ ref: t.ref, label: t.title }) : null,
                    }))))
                : null);
    }

    function WeekView({ week }) {
        if (!week || !(week.days || []).length) {
            return React.createElement('p', { className: 'board-empty' }, 'Неделя пуста.');
        }
        const maxBusy = Math.max(...week.days.map((d) => d.busy_minutes || 0), 1);
        return React.createElement('div', { className: 'board-week' },
            week.days.map((day) => {
                const pct = Math.round(((day.busy_minutes || 0) / maxBusy) * 100);
                const gap = (day.free || [])[0];
                return React.createElement('div', { key: day.date, className: 'board-week__col' },
                    React.createElement('div', { className: 'board-week__head' }, day.date.slice(5)),
                    React.createElement('div', {
                        className: 'board-week__bar-wrap',
                        title: `${day.busy_minutes || 0} мин занято`,
                    },
                    React.createElement('div', {
                        className: 'board-week__bar',
                        style: { height: `${Math.max(8, pct)}%` },
                    })),
                    gap && gapLabel(gap.minutes)
                        ? React.createElement('div', { className: 'board-week__gap' }, gapLabel(gap.minutes))
                        : null);
            }));
    }

    function CloseSlotRow({ slot, choice, onChoice, disabled }) {
        const status = choice === 'yes'
            ? 'состоялось'
            : choice === 'no'
                ? 'не состоялось'
                : 'без отметки';
        const tone = choice === 'yes'
            ? ' board-close-slot--done'
            : choice === 'no'
                ? ' board-close-slot--missed'
                : '';
        return React.createElement('li', { className: 'board-close-slot' + tone },
            React.createElement('div', { className: 'board-close-slot__row' },
                React.createElement('span', { className: 'board-close-slot__time' }, `${slot.from}–${slot.to}`),
                React.createElement('span', {
                    className: 'board-close-slot__status',
                }, choice === 'yes' ? '✓' : choice === 'no' ? '✕' : '·')),
            React.createElement('span', { className: 'board-close-slot__title' }, slot.title),
            slot.kind ? React.createElement('span', { className: 'board-close-slot__kind' }, slot.kind) : null,
            React.createElement('div', {
                className: 'board-close-slot__toggle',
                role: 'group',
                'aria-label': 'Состоялось или нет',
            },
            React.createElement('button', {
                type: 'button',
                className: 'board-close-slot__opt' + (choice === 'yes' ? ' board-close-slot__opt--active board-close-slot__opt--yes' : ''),
                'aria-pressed': choice === 'yes',
                disabled,
                onClick: () => onChoice('yes'),
            }, 'Состоялось'),
            React.createElement('button', {
                type: 'button',
                className: 'board-close-slot__opt' + (choice === 'no' ? ' board-close-slot__opt--active board-close-slot__opt--no' : ''),
                'aria-pressed': choice === 'no',
                disabled,
                onClick: () => onChoice('no'),
            }, 'Нет')),
            React.createElement('span', { className: 'board-close-slot__hint' }, status));
    }

    function CloseDayView({ closeDay, offline, onSubmit, submitting, submitError }) {
        const slots = (closeDay && closeDay.slots) || [];
        const habits = (closeDay && closeDay.habits) || [];
        const dateKey = closeDay && closeDay.date;

        const [choices, setChoices] = React.useState({});
        const [note, setNote] = React.useState('');

        React.useEffect(() => {
            const next = {};
            slots.forEach((slot, i) => {
                next[slotDoneKey(slot, i)] = slot.done ? 'yes' : null;
            });
            setChoices(next);
            setNote('');
        }, [dateKey, closeDay && closeDay.fetched_at, closeDay && closeDay.closed, slots.length]);

        if (!closeDay) {
            return React.createElement('p', { className: 'board-empty' },
                'Нет данных для закрытия дня. Обнови доску после deploy моста.');
        }

        const undecided = slots.filter((slot, i) => !choices[slotDoneKey(slot, i)]).length;
        const noteTrim = String(note || '').trim();
        const canSubmit = !offline && !submitting && !!noteTrim
            && slots.every((slot, i) => !!choices[slotDoneKey(slot, i)]);

        const setSlotChoice = (key, value) => {
            setChoices((prev) => ({ ...prev, [key]: value }));
        };

        const handleSubmit = () => {
            if (!canSubmit || !onSubmit) return;
            const done = slots
                .map((slot, i) => ({ slot, key: slotDoneKey(slot, i) }))
                .filter(({ key }) => choices[key] === 'yes')
                .map(({ slot }) => String(slot.from || '').trim())
                .filter(Boolean);
            onSubmit({ date: closeDay.date, done, note: noteTrim });
        };

        return React.createElement('div', { className: 'board-close' },
            React.createElement('p', { className: 'board-close__lead' },
                `Вчера · ${formatDayLabel(closeDay.date)}`),
            closeDay.closed
                ? React.createElement('div', { className: 'board-close__closed' },
                    React.createElement('p', { className: 'board-close__closed-title' }, 'День уже закрыт'),
                    closeDay.note
                        ? React.createElement('p', { className: 'board-close__note' }, closeDay.note)
                        : null)
                : React.createElement('p', { className: 'board-muted' },
                    slots.length
                        ? (undecided
                            ? `Отметь каждый слот и одну фразу «как прошло» (${undecided} без отметки).`
                            : 'Слоты отмечены — осталась фраза «как прошло».')
                        : 'Слотов не было — достаточно одной фразы «как прошло».'),
            habits.length
                ? React.createElement(Section, {
                    id: 'close-habits',
                    title: 'Привычки',
                    count: habits.length,
                    defaultOpen: true,
                },
                React.createElement('div', { className: 'board-close-habits' },
                    habits.map((h, i) => React.createElement('span', {
                        key: i,
                        className: 'board-close-habit' + (h.done ? ' board-close-habit--done' : ''),
                    }, h.done ? `✓ ${h.name}` : h.name))))
                : null,
            closeDay.closed
                ? (slots.length
                    ? React.createElement(Section, {
                        id: 'close-slots',
                        title: 'Слоты',
                        count: slots.length,
                        defaultOpen: true,
                    },
                    React.createElement('ul', { className: 'board-close-slots' },
                        slots.map((slot, i) => React.createElement('li', {
                            key: i,
                            className: 'board-close-slot' + (slot.done ? ' board-close-slot--done' : ' board-close-slot--missed'),
                        },
                        React.createElement('div', { className: 'board-close-slot__row' },
                            React.createElement('span', { className: 'board-close-slot__time' }, `${slot.from}–${slot.to}`),
                            React.createElement('span', { className: 'board-close-slot__status' }, slot.done ? '✓' : '✕')),
                        React.createElement('span', { className: 'board-close-slot__title' }, slot.title),
                        React.createElement('span', { className: 'board-close-slot__hint' },
                            slot.done ? 'состоялось' : 'не состоялось')))))
                    : React.createElement('p', { className: 'board-empty board-empty--inset' }, 'Слотов в этом дне нет.'))
                : React.createElement(React.Fragment, null,
                    slots.length
                        ? React.createElement(Section, {
                            id: 'close-slots',
                            title: 'Слоты',
                            count: slots.length,
                            defaultOpen: true,
                        },
                        React.createElement('ul', { className: 'board-close-slots' },
                            slots.map((slot, i) => {
                                const key = slotDoneKey(slot, i);
                                return React.createElement(CloseSlotRow, {
                                    key,
                                    slot,
                                    choice: choices[key] || null,
                                    disabled: offline || submitting,
                                    onChoice: (value) => setSlotChoice(key, value),
                                });
                            })))
                        : React.createElement('p', { className: 'board-empty board-empty--inset' }, 'Слотов в этом дне нет.'),
                    React.createElement('label', { className: 'board-close__note-label' },
                        React.createElement('span', { className: 'board-close__note-title' }, 'Как прошло'),
                        React.createElement('textarea', {
                            className: 'board-close__note-input',
                            rows: 2,
                            placeholder: 'Одной фразой, своими словами…',
                            value: note,
                            disabled: offline || submitting,
                            onChange: (e) => setNote(e.target.value),
                        })),
                    offline
                        ? React.createElement('p', { className: 'board-close__hint' },
                            'Нужен интернет — закрытие дня только онлайн.')
                        : null,
                    submitError
                        ? React.createElement('p', { className: 'board-close__error', role: 'alert' }, submitError)
                        : null,
                    React.createElement('button', {
                        type: 'button',
                        className: 'board-close__submit',
                        disabled: !canSubmit,
                        onClick: handleSubmit,
                    }, submitting ? 'Закрываю…' : 'Подтвердить закрытие')));
    }

    function SimpleQuestionsBatchFooter({ count, submitting, offline, onConfirm }) {
        if (!count) return null;
        return React.createElement('div', { className: 'board-simple-q__footer', role: 'region', 'aria-label': 'Подтверждение ответов' },
            React.createElement('button', {
                type: 'button',
                className: 'board-simple-q__footer-btn',
                disabled: submitting || offline,
                onClick: onConfirm,
            }, submitting ? 'Сохраняю…' : `Подтвердить (${count})`));
    }

    function DecideView({
        standup, list, onTalk, onBatchResolve, onSleep, batchSubmitting, sleepingKey,
        resolveErrors, sleepErrors, resolvedKeys, sleptKeys, offline,
    }) {
        const [selections, setSelections] = React.useState({});

        const questions = dedupeSimpleQuestions((standup && standup.simple_questions) || [])
            .filter((q) => !resolvedKeys.has(q.key || q.ref) && !sleptKeys.has(q.key || q.ref));
        const blocked = (list && list.blocked) || [];
        const simpleRefs = new Set(
            questions.map((q) => String(q.ref || q.task || '').trim().toLowerCase()).filter(Boolean),
        );
        const extraBlocked = blocked.filter((t) => !simpleRefs.has(String(t.ref || '').trim().toLowerCase()));
        const extraOpenQuestions = extraBlocked.flatMap((t) => openQuestionsFromTask(t))
            .filter((q) => !resolvedKeys.has(q.key || q.ref) && !sleptKeys.has(q.key || q.ref));

        const activeQuestionKeys = new Set(
            [...questions, ...extraOpenQuestions].map((q) => questionRowKey(q)).filter(Boolean),
        );
        const activeKeysSig = [...activeQuestionKeys].sort().join('|');

        React.useEffect(() => {
            setSelections((prev) => {
                const next = {};
                Object.keys(prev).forEach((key) => {
                    if (!resolvedKeys.has(key) && !sleptKeys.has(key)) {
                        next[key] = prev[key];
                    }
                });
                return next;
            });
        }, [resolvedKeys, sleptKeys]);

        React.useEffect(() => {
            if (!activeKeysSig) {
                setSelections({});
                return;
            }
            const active = new Set(activeKeysSig.split('|'));
            setSelections((prev) => {
                const next = {};
                Object.keys(prev).forEach((key) => {
                    if (active.has(key)) next[key] = prev[key];
                });
                return next;
            });
        }, [activeKeysSig]);

        const batchQuestions = [...questions, ...extraOpenQuestions];
        const selectedCount = countSimpleSelections(batchQuestions, selections);
        const batchBusy = batchSubmitting || offline;

        const handleChoiceChange = React.useCallback((key, choice) => {
            if (!key || !choice) return;
            setSelections((prev) => {
                if (prev[key] === choice) return prev;
                return { ...prev, [key]: choice };
            });
        }, []);

        const handleBatchConfirm = React.useCallback(async () => {
            const entries = buildBatchResolveEntries(batchQuestions, selections);
            if (!entries.length || batchBusy || !onBatchResolve) return;
            const result = await onBatchResolve(entries);
            if (result && result.succeeded && result.succeeded.length) {
                setSelections((prev) => {
                    const next = { ...prev };
                    result.succeeded.forEach((key) => delete next[key]);
                    return next;
                });
            }
        }, [batchQuestions, selections, batchBusy, onBatchResolve]);

        if (!questions.length && !extraOpenQuestions.length && !extraBlocked.length) {
            return React.createElement('div', { className: 'board-decide board-decide--done' },
                React.createElement('p', { className: 'board-decide__done-title' }, 'Открытых вопросов нет'));
        }

        const renderQuestion = (q, i) => {
            const key = questionRowKey(q);
            return React.createElement(SimpleQuestionRow, {
                key: key || i,
                question: q,
                choice: selections[key] || null,
                onChoiceChange: handleChoiceChange,
                onTalk,
                onSleep,
                sleeping: sleepingKey === key,
                error: resolveErrors[key] || sleepErrors[key] || '',
                offline,
                disabled: batchSubmitting,
            });
        };

        return React.createElement('div', {
            className: 'board-decide' + (selectedCount ? ' board-decide--batch' : ''),
        },
            questions.length
                ? React.createElement('p', { className: 'board-decide__counter' },
                    `${questions.length} ${questions.length === 1 ? 'вопрос' : questions.length < 5 ? 'вопроса' : 'вопросов'}`
                    + (blocked.length ? ` · на доске ${blocked.length} открытых` : ''))
                : null,
            questions.length
                ? React.createElement(Section, {
                    id: 'decide-simple',
                    title: 'Простые вопросы',
                    count: questions.length,
                    defaultOpen: true,
                },
                React.createElement('ul', { className: 'board-task-list' },
                    questions.map(renderQuestion)))
                : null,
            extraOpenQuestions.length
                ? React.createElement(Section, {
                    id: 'decide-blocked',
                    title: 'Ещё открытые',
                    count: extraOpenQuestions.length,
                    defaultOpen: !questions.length,
                },
                React.createElement('ul', { className: 'board-task-list' },
                    extraOpenQuestions.map(renderQuestion)))
                : (extraBlocked.length
                    ? React.createElement(Section, {
                        id: 'decide-blocked',
                        title: 'Ещё открытые',
                        count: extraBlocked.length,
                        defaultOpen: !questions.length,
                    },
                    React.createElement('ul', { className: 'board-task-list' },
                        extraBlocked.map((t, i) => React.createElement(TaskRow, {
                            key: t.ref || i,
                            refId: t.ref,
                            title: t.title || t.question,
                            notes: t.children,
                            tone: 'open',
                            onTalk: onTalk && t.ref ? () => onTalk({ ref: t.ref, label: t.title || t.question }) : null,
                        }))))
                    : null),
            React.createElement(SimpleQuestionsBatchFooter, {
                count: selectedCount,
                submitting: batchSubmitting,
                offline,
                onConfirm: handleBatchConfirm,
            }));
    }

    function QuickView({ quick, onTalk }) {
        const items = (quick && quick.picked) || [];
        if (!items.length) return null;
        return React.createElement(Section, {
            id: 'dash-quick',
            title: 'Быстрые дела',
            count: items.length,
            defaultOpen: true,
        },
        React.createElement('p', { className: 'board-muted board-muted--inset' },
            quick.minutes ? `Короче ${quick.minutes} мин` : 'Короткие задачи'),
        React.createElement('ul', { className: 'board-task-list' },
            items.map((item, i) => React.createElement(TaskRow, {
                key: item.ref || i,
                refId: item.ref,
                title: item.title,
                meta: item.minutes ? `${item.minutes} мин` : null,
                tone: 'due',
                onTalk: onTalk && item.ref ? () => onTalk({ ref: item.ref, label: item.title }) : null,
            }))));
    }

    function TodayScreen({
        day, list, habits, closeDay, week, landscape, onTalk, offline,
        onCloseDay, closeDaySubmitting, closeDayError,
        onReslot, reslottingKey, reslotErrors,
        onToggleSlot, togglingSlotKey, slotDoneErrors,
        onToggleHabit, togglingHabitKey, habitErrors,
    }) {
        return React.createElement('div', { className: 'board-today-screen' },
            React.createElement(TodayView, {
                day, list, habits, onTalk, onReslot, reslottingKey, reslotErrors, offline,
                onToggleSlot, togglingSlotKey, slotDoneErrors,
                onToggleHabit, togglingHabitKey, habitErrors,
            }),
            React.createElement(Section, {
                id: 'today-close',
                title: 'Закрыть вчера',
                count: closeDay && !closeDay.closed && closeDay.open_count != null ? closeDay.open_count : null,
                defaultOpen: !!(closeDay && !closeDay.closed),
            },
            React.createElement(CloseDayView, {
                closeDay,
                offline,
                onSubmit: onCloseDay,
                submitting: closeDaySubmitting,
                submitError: closeDayError,
            })),
            !landscape && week && (week.days || []).length
                ? React.createElement(Section, {
                    id: 'today-week',
                    title: 'Неделя',
                    count: (week.days || []).length,
                    defaultOpen: false,
                },
                React.createElement(WeekView, { week }))
                : null);
    }

    function DashboardScreen({
        standup, list, orders, quick, onTalk, onBatchResolve, onSleep, batchSubmitting, sleepingKey,
        resolveErrors, sleepErrors, resolvedKeys, sleptKeys, offline,
    }) {
        return React.createElement('div', { className: 'board-dashboard' },
            React.createElement(DecideView, {
                standup,
                list,
                onTalk,
                onBatchResolve,
                onSleep,
                batchSubmitting,
                sleepingKey,
                resolveErrors,
                sleepErrors,
                resolvedKeys,
                sleptKeys,
                offline,
            }),
            React.createElement(QuickView, { quick, onTalk }),
            React.createElement(Section, {
                id: 'dash-orders',
                title: 'Купить',
                count: (orders && orders.open && orders.open.length) || 0,
                defaultOpen: !!(orders && orders.open && orders.open.length),
            },
            React.createElement(OrdersView, { orders, onTalk })));
    }

    function OrdersView({ orders, onTalk }) {
        const items = (orders && orders.open) || [];
        if (!items.length) {
            return React.createElement('div', { className: 'board-orders' },
                React.createElement('p', { className: 'board-empty' }, 'Заказывать нечего — под #заказ ничего не открыто.'),
                React.createElement('p', { className: 'board-orders__readonly' },
                    'Закрытие покупки с телефона — следующий заход. Сейчас только просмотр.'));
        }
        return React.createElement('div', { className: 'board-orders' },
            React.createElement('p', { className: 'board-orders__counter' },
                `${items.length} ${items.length === 1 ? 'покупка' : items.length < 5 ? 'покупки' : 'покупок'}`),
            React.createElement('p', { className: 'board-orders__readonly' },
                'Закрытие покупки с телефона — следующий заход. Сейчас только просмотр.'),
            React.createElement('ul', { className: 'board-task-list' },
                items.map((item, i) => React.createElement(TaskRow, {
                    key: item.ref || i,
                    refId: item.ref,
                    title: item.title,
                    meta: orderMeta(item),
                    tone: item.overdue ? 'overdue' : 'order',
                    onTalk: onTalk && item.ref ? () => onTalk({ ref: item.ref, label: item.title }) : null,
                }))));
    }

    function BoardTab() {
        const [screen, setScreen] = React.useState('today');
        const [landscape, setLandscape] = React.useState(false);
        const [data, setData] = React.useState(() => readCache());
        const [offline, setOffline] = React.useState(!navigator.onLine);
        const [loading, setLoading] = React.useState(!data);
        const [error, setError] = React.useState('');
        const [talkTarget, setTalkTarget] = React.useState(null);
        const [talkText, setTalkText] = React.useState('');
        const [talkStandup, setTalkStandup] = React.useState(true);
        const [talkAgent, setTalkAgent] = React.useState(false);
        const [talkSaving, setTalkSaving] = React.useState(false);
        const [talkError, setTalkError] = React.useState('');
        const [batchResolving, setBatchResolving] = React.useState(false);
        const [resolvedKeys, setResolvedKeys] = React.useState(() => new Set());
        const [resolveErrors, setResolveErrors] = React.useState({});
        const [sleepingKey, setSleepingKey] = React.useState(null);
        const [sleptKeys, setSleptKeys] = React.useState(() => new Set());
        const [sleepErrors, setSleepErrors] = React.useState({});
        const [reslottingKey, setReslottingKey] = React.useState(null);
        const [reslotErrors, setReslotErrors] = React.useState({});
        const [closeDaySubmitting, setCloseDaySubmitting] = React.useState(false);
        const [closeDayError, setCloseDayError] = React.useState('');
        const [togglingSlotKey, setTogglingSlotKey] = React.useState(null);
        const [slotDoneErrors, setSlotDoneErrors] = React.useState({});
        const [togglingHabitKey, setTogglingHabitKey] = React.useState(null);
        const [habitErrors, setHabitErrors] = React.useState({});
        const [boardTheme, setBoardTheme] = React.useState(() => readBoardTheme());

        const toggleBoardTheme = React.useCallback(() => {
            setBoardTheme((prev) => {
                const next = prev === 'dark' ? 'light' : 'dark';
                writeBoardTheme(next);
                return next;
            });
        }, []);

        React.useEffect(() => {
            try {
                window.dispatchEvent(new CustomEvent('heys:board-theme-change', { detail: { theme: boardTheme } }));
            } catch (_) { /* noop */ }
        }, [boardTheme]);

        const openTalk = React.useCallback((target) => {
            setTalkTarget(target);
            setTalkText('');
            setTalkStandup(true);
            setTalkAgent(false);
            setTalkError('');
        }, []);

        const closeTalk = React.useCallback(() => {
            if (talkSaving) return;
            setTalkTarget(null);
            setTalkText('');
            setTalkError('');
        }, [talkSaving]);

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

        const saveTalk = React.useCallback(async () => {
            if (!talkTarget || !String(talkText || '').trim()) return;
            setTalkSaving(true);
            setTalkError('');
            try {
                const payload = {
                    comment: talkText.trim(),
                    standup: talkStandup,
                    audience: talkAgent ? 'agent' : 'me',
                    label: talkTarget.label || '',
                };
                if (talkTarget.ref) payload.ref = talkTarget.ref;
                if (talkTarget.entity === 'slot') {
                    payload.entity = 'slot';
                    payload.date = talkTarget.date;
                    payload.start = talkTarget.start;
                    payload.title = talkTarget.title;
                }
                await submitTalk(payload);
                setTalkTarget(null);
                setTalkText('');
                await reload();
            } catch (e) {
                if (e && e.status === 404) {
                    setTalkError('Сохранение пока недоступно — нужен deploy heys-mcp.');
                } else {
                    setTalkError('Не удалось сохранить. Проверь связь.');
                }
            } finally {
                setTalkSaving(false);
            }
        }, [talkTarget, talkText, talkStandup, talkAgent, reload]);

        const confirmBatchResolve = React.useCallback(async (entries) => {
            if (!entries || !entries.length) return { succeeded: [], failed: {} };
            setBatchResolving(true);
            const keys = entries.map((e) => e.key);
            setResolveErrors((prev) => {
                const next = { ...prev };
                keys.forEach((key) => delete next[key]);
                return next;
            });
            const succeeded = [];
            const failed = {};
            for (const entry of entries) {
                const { question, key, answer } = entry;
                try {
                    await submitResolve({
                        ref: question.ref || question.task,
                        project: question.project,
                        question: question.question,
                        answer,
                    });
                    succeeded.push(key);
                    setResolvedKeys((prev) => new Set([...prev, key]));
                } catch (e) {
                    if (e && e.status === 404) {
                        failed[key] = 'Запись пока недоступна — нужен deploy heys-mcp.';
                    } else {
                        failed[key] = (e && e.message) || 'Не удалось сохранить. Проверь связь.';
                    }
                }
            }
            if (Object.keys(failed).length) {
                setResolveErrors((prev) => ({ ...prev, ...failed }));
            }
            if (succeeded.length) {
                await reload();
            }
            setBatchResolving(false);
            return { succeeded, failed };
        }, [reload]);

        const confirmSleep = React.useCallback(async (question) => {
            const rowKey = question.key || question.ref;
            const needle = String(question.question || '').trim();
            if (!rowKey || !needle) return;
            setSleepingKey(rowKey);
            setSleepErrors((prev) => {
                const next = { ...prev };
                delete next[rowKey];
                return next;
            });
            try {
                await submitSleep({ question: needle });
                setSleptKeys((prev) => new Set([...prev, rowKey]));
                await reload();
            } catch (e) {
                if (e && e.status === 404) {
                    setSleepErrors((prev) => ({
                        ...prev,
                        [rowKey]: 'Отложить пока недоступно — нужен deploy heys-mcp.',
                    }));
                } else {
                    setSleepErrors((prev) => ({
                        ...prev,
                        [rowKey]: (e && e.message) || 'Не удалось отложить. Проверь связь.',
                    }));
                }
            } finally {
                setSleepingKey(null);
            }
        }, [reload]);

        const confirmReslot = React.useCallback(async (payload) => {
            const key = `${payload.date}:${payload.at}:${payload.title || ''}`;
            setReslottingKey(key);
            setReslotErrors((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            try {
                await submitReslot(payload);
                await reload();
            } catch (e) {
                if (e && e.status === 404) {
                    setReslotErrors((prev) => ({
                        ...prev,
                        [key]: 'Перенос пока недоступен — нужен deploy heys-mcp.',
                    }));
                } else {
                    setReslotErrors((prev) => ({
                        ...prev,
                        [key]: (e && e.message) || 'Не удалось перенести. Проверь связь.',
                    }));
                }
                throw e;
            } finally {
                setReslottingKey(null);
            }
        }, [reload]);

        const confirmCloseDay = React.useCallback(async (payload) => {
            if (!payload || !payload.note) return;
            setCloseDaySubmitting(true);
            setCloseDayError('');
            try {
                await submitCloseDay(payload);
                await reload();
            } catch (e) {
                if (e && e.status === 404) {
                    setCloseDayError('Закрытие пока недоступно — нужен deploy heys-mcp.');
                } else {
                    setCloseDayError((e && e.message) || 'Не удалось закрыть день. Проверь связь.');
                }
            } finally {
                setCloseDaySubmitting(false);
            }
        }, [reload]);

        const confirmSlotDone = React.useCallback(async (payload) => {
            const key = `${payload.date}:${payload.start}:${payload.title || ''}`;
            const prevDone = !payload.done;
            setTogglingSlotKey(key);
            setSlotDoneErrors((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            setData((snap) => {
                if (!snap || !snap.today || !Array.isArray(snap.today.days)) return snap;
                const days = snap.today.days.map((d) => {
                    if (d.date !== payload.date) return d;
                    return {
                        ...d,
                        slots: (d.slots || []).map((s) => (
                            s.from === payload.start && s.title === payload.title
                                ? { ...s, done: !!payload.done }
                                : s
                        )),
                    };
                });
                return { ...snap, today: { ...snap.today, days } };
            });
            try {
                await submitSlotDone(payload);
                await reload();
            } catch (e) {
                setData((snap) => {
                    if (!snap || !snap.today || !Array.isArray(snap.today.days)) return snap;
                    const days = snap.today.days.map((d) => {
                        if (d.date !== payload.date) return d;
                        return {
                            ...d,
                            slots: (d.slots || []).map((s) => (
                                s.from === payload.start && s.title === payload.title
                                    ? { ...s, done: prevDone }
                                    : s
                            )),
                        };
                    });
                    return { ...snap, today: { ...snap.today, days } };
                });
                setSlotDoneErrors((prev) => ({
                    ...prev,
                    [key]: (e && e.status === 404)
                        ? 'Отметка пока недоступна — нужен deploy heys-mcp.'
                        : ((e && e.message) || 'Не удалось сохранить. Проверь связь.'),
                }));
            } finally {
                setTogglingSlotKey(null);
            }
        }, [reload]);

        const confirmHabit = React.useCallback(async (payload) => {
            const key = payload.habit;
            const prevDone = !payload.done;
            setTogglingHabitKey(key);
            setHabitErrors((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            setData((snap) => {
                if (!snap || !Array.isArray(snap.habits)) return snap;
                return {
                    ...snap,
                    habits: snap.habits.map((h) => (
                        h.name === payload.habit ? { ...h, done: !!payload.done } : h
                    )),
                };
            });
            try {
                await submitHabit(payload);
                await reload();
            } catch (e) {
                setData((snap) => {
                    if (!snap || !Array.isArray(snap.habits)) return snap;
                    return {
                        ...snap,
                        habits: snap.habits.map((h) => (
                            h.name === payload.habit ? { ...h, done: prevDone } : h
                        )),
                    };
                });
                setHabitErrors((prev) => ({
                    ...prev,
                    [key]: (e && e.status === 404)
                        ? 'Отметка пока недоступна — нужен deploy heys-mcp.'
                        : ((e && e.message) || 'Не удалось сохранить. Проверь связь.'),
                }));
            } finally {
                setTogglingHabitKey(null);
            }
        }, [reload]);

        React.useEffect(() => {
            const onOrient = () => {
                setLandscape(window.matchMedia('(orientation: landscape)').matches);
            };
            onOrient();
            window.addEventListener('resize', onOrient);
            return () => window.removeEventListener('resize', onOrient);
        }, []);

        React.useEffect(() => {
            if (!landscape && screen === 'week') setScreen('today');
        }, [landscape, screen]);

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
            setResolvedKeys(new Set());
            setResolveErrors({});
            setSleptKeys(new Set());
            setSleepErrors({});
            setReslotErrors({});
            setSlotDoneErrors({});
            setHabitErrors({});
            setCloseDayError('');
        }, [data && data.fetched_at]);

        React.useEffect(() => {
            const onVis = () => { if (document.visibilityState === 'visible') reload(); };
            document.addEventListener('visibilitychange', onVis);
            return () => document.removeEventListener('visibilitychange', onVis);
        }, [reload]);

        const todayDay = data && data.today && data.today.days && data.today.days[0];
        const week = data && data.week;
        const standup = data && data.standup;
        const list = data && data.list;
        const closeDay = data && data.close_day;
        const habits = data && data.habits;
        const orders = data && data.orders;
        const quick = data && data.quick;
        const chipCounts = {
            today: computeTodayCount(todayDay, list, closeDay),
            dashboard: computeDashboardCount(standup, list, orders, quick),
        };

        const tabClass = 'board-tab board-tab--' + boardTheme;
        const firstCloudWait = loading && !data;
        const bodyWait = firstCloudWait
            ? (window.HEYS?.WaitMark?.render?.(React, { mode: 'embedded', sr: 'Загружаем' })
                || React.createElement('div', { className: 'heys-wait-mark heys-wait-mark--embedded', role: 'status' }, 'Загружаем'))
            : null;

        return React.createElement('div', { className: tabClass },
            React.createElement('header', { className: 'board-header' },
                React.createElement('h1', { className: 'board-header__title' }, 'Доска'),
                React.createElement('div', { className: 'board-header__actions' },
                    React.createElement('button', {
                        type: 'button',
                        className: 'board-header__theme',
                        onClick: toggleBoardTheme,
                        'aria-label': boardTheme === 'dark' ? 'Светлая тема доски' : 'Тёмная тема доски',
                        title: boardTheme === 'dark' ? 'Светлая тема' : 'Тёмная тема',
                    }, boardTheme === 'dark' ? '☀️' : '🌙'),
                    React.createElement('button', {
                        type: 'button',
                        className: 'board-header__refresh',
                        disabled: loading,
                        onClick: reload,
                        'aria-label': 'Обновить',
                        title: 'Обновить',
                    }, '↻'))),
            React.createElement(StaleBanner, { fetchedAt: data && data.fetched_at, offline }),
            error ? React.createElement('p', { className: 'board-error', role: 'alert' }, error) : null,
            bodyWait || React.createElement(React.Fragment, null,
            React.createElement(BoardChips, {
                screen,
                setScreen,
                landscape,
                counts: chipCounts,
            }),
            screen === 'week'
                ? React.createElement(WeekView, { week })
                : screen === 'dashboard'
                    ? React.createElement(DashboardScreen, {
                        standup,
                        list,
                        orders,
                        quick,
                        onTalk: openTalk,
                        onBatchResolve: confirmBatchResolve,
                        onSleep: confirmSleep,
                        batchSubmitting: batchResolving,
                        sleepingKey,
                        resolveErrors,
                        sleepErrors,
                        resolvedKeys,
                        sleptKeys,
                        offline,
                    })
                    : React.createElement(TodayScreen, {
                        day: todayDay,
                        list,
                        habits,
                        closeDay,
                        week,
                        landscape,
                        onTalk: openTalk,
                        offline,
                        onCloseDay: confirmCloseDay,
                        closeDaySubmitting,
                        closeDayError,
                        onReslot: confirmReslot,
                        reslottingKey,
                        reslotErrors,
                        onToggleSlot: confirmSlotDone,
                        togglingSlotKey,
                        slotDoneErrors,
                        onToggleHabit: confirmHabit,
                        togglingHabitKey,
                        habitErrors,
                    }),
            React.createElement(TalkSheet, {
                target: talkTarget,
                text: talkText,
                setText: setTalkText,
                standup: talkStandup,
                setStandup: setTalkStandup,
                toAgent: talkAgent,
                setToAgent: setTalkAgent,
                saving: talkSaving,
                error: talkError,
                onClose: closeTalk,
                onSave: saveTalk,
            })));
    }

    HEYS.BoardTab = BoardTab;

    if (typeof document !== 'undefined' && !document.getElementById('heys-board-styles')) {
        const style = document.createElement('style');
        style.id = 'heys-board-styles';
        style.textContent = `
.board-tab--light{
  --card:#ffffff;
  --text:#111827;
  --muted:#6b7280;
  --border:#e5e7eb;
  --heys-primary:#434587;
  --board-bg:#f8fafc;
  --board-shadow:0 1px 3px rgba(67,69,135,.12);
  --board-shadow-lg:0 -4px 24px rgba(15,23,42,.12);
  --board-backdrop:rgba(15,23,42,.35);
  --board-error-bg:#fef2f2;
  --board-error-text:#b91c1c;
  --board-success-text:#15803d;
  --board-success-bg:rgba(34,197,94,.08);
  --board-success-border:rgba(34,197,94,.2);
  --board-warning-bg:color-mix(in srgb,var(--v4-warn-1,#d99a63) 6%,transparent);
  --board-warning-border:color-mix(in srgb,var(--v4-warn-soft,#c9922e) 25%,transparent);
  --board-readonly-bg:rgba(67,69,135,.05);
  --board-readonly-border:rgba(67,69,135,.15);
  --board-input-bg:#ffffff;
  --board-slot-muted:#94a3b8;
  background:var(--board-bg);
  color:var(--text);
}
html.board-dark-nav .tabs,
body.board-dark-nav .tabs{
  background:#0f172a;
  border-top:1px solid #475569;
  box-shadow:0 -1px 20px rgba(0,0,0,.35);
}
html.board-dark-nav .tab-switch-group,
body.board-dark-nav .tab-switch-group{
  background:#1e293b;
  border:1px solid #475569;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
}
html.board-dark-nav .tab.tab-switch,
body.board-dark-nav .tab.tab-switch{color:#94a3b8}
html.board-dark-nav .tab.tab-switch.active,
body.board-dark-nav .tab.tab-switch.active{
  background:color-mix(in srgb,#93c5fd 16%,#1e293b);
  color:#93c5fd;
  box-shadow:inset 0 0 0 1px rgba(147,197,253,.22);
}
html.board-dark-nav .tab-switch-label,
body.board-dark-nav .tab-switch-label{color:#64748b}
html.board-dark-nav .tab-switch-label.active,
body.board-dark-nav .tab-switch-label.active{color:#f1f5f9}
html.board-dark-nav .tab.tab-advice,
html.board-dark-nav .tab-settings-wrap>.tab,
body.board-dark-nav .tab.tab-advice,
body.board-dark-nav .tab-settings-wrap>.tab{color:#94a3b8}
html.board-dark-nav .tab.tab-advice:hover,
html.board-dark-nav .tab-settings-wrap>.tab:hover,
body.board-dark-nav .tab.tab-advice:hover,
body.board-dark-nav .tab-settings-wrap>.tab:hover{background:rgba(148,163,184,.08);color:#e2e8f0}
html.board-dark-nav .tab-settings-wrap>.tab.active,
body.board-dark-nav .tab-settings-wrap>.tab.active{color:#93c5fd}
html.board-dark-nav .crs-bar-container,
body.board-dark-nav .crs-bar-container{background:rgba(71,85,105,.35)}
.board-tab--dark{
  --card:#1e293b;
  --text:#f1f5f9;
  --muted:#94a3b8;
  --border:#475569;
  --heys-primary:#93c5fd;
  --board-bg:#0f172a;
  --board-shadow:0 1px 3px rgba(0,0,0,.35);
  --board-shadow-lg:0 -4px 24px rgba(0,0,0,.45);
  --board-backdrop:rgba(0,0,0,.55);
  --board-error-bg:rgba(239,68,68,.14);
  --board-error-text:#fca5a5;
  --board-success-text:#86efac;
  --board-success-bg:rgba(74,222,128,.12);
  --board-success-border:rgba(74,222,128,.28);
  --board-warning-bg:color-mix(in srgb,var(--v4-warn-1,#d99a63) 10%,transparent);
  --board-warning-border:color-mix(in srgb,var(--v4-warn-soft,#c9922e) 28%,transparent);
  --board-readonly-bg:rgba(96,165,250,.08);
  --board-readonly-border:rgba(96,165,250,.22);
  --board-input-bg:#334155;
  --board-slot-muted:#64748b;
  background:var(--board-bg);
  color:var(--text);
}
.board-tab{
  padding:10px 14px calc(88px + env(safe-area-inset-bottom,0px));
  max-width:520px;margin:0 auto;
  color:var(--text);
}
.wrap.wrap--no-header>.tab-content-swipeable>.board-tab{
  flex:1 1 auto;min-height:0;height:100%;
  overflow-y:auto;-webkit-overflow-scrolling:touch;
  max-width:none;margin:0;
  padding-top:calc(10px + env(safe-area-inset-top,0px));
}
.board-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;gap:8px}
.board-header__title{font-size:17px;font-weight:600;margin:0;letter-spacing:-0.02em;flex:1;min-width:0}
.board-header__actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
.board-header__theme,.board-header__refresh{
  border:1px solid var(--border);
  background:var(--card);
  font-size:15px;line-height:1;
  width:34px;height:34px;border-radius:10px;
  box-shadow:var(--board-shadow);
  color:var(--heys-primary);
  display:inline-flex;align-items:center;justify-content:center;
  padding:0;cursor:pointer;flex-shrink:0;
}
.board-header__theme{font-size:16px}
.board-header__refresh--spin{opacity:.6}
.board-stale{font-size:11px;color:var(--muted);margin:0 0 10px}
.board-chips{
  display:flex;gap:6px;overflow-x:auto;margin:0 -14px 12px;
  -webkit-overflow-scrolling:touch;scrollbar-width:none;
  padding:0 14px 2px;
}
.board-chips::-webkit-scrollbar{display:none}
.board-chip{
  flex-shrink:0;display:inline-flex;align-items:center;gap:5px;
  padding:6px 12px;border:1px solid var(--border);
  border-radius:999px;background:var(--card);
  font-size:12px;font-weight:500;color:var(--muted);
  white-space:nowrap;
}
.board-chip--active{
  border-color:var(--heys-primary);
  background:color-mix(in srgb,var(--heys-primary) 12%,transparent);
  color:var(--heys-primary);font-weight:600;
}
.board-chip__count{
  font-size:10px;font-weight:700;line-height:1;
  min-width:16px;padding:2px 5px;border-radius:999px;
  background:color-mix(in srgb,var(--heys-primary) 14%,transparent);
  color:var(--heys-primary);
}
.board-chip--active .board-chip__count{
  background:var(--heys-primary);color:var(--board-bg,#0f172a);
}
.board-tab--light .board-chip--active .board-chip__count{color:#fff}
.board-orders{padding:2px 0}
.board-orders__counter{font-size:12px;color:var(--muted);margin:0 0 8px}
.board-orders__readonly{
  font-size:11px;color:var(--muted);line-height:1.35;
  margin:0 0 10px;padding:8px 10px;border-radius:9px;
  background:var(--board-warning-bg);border:1px dashed var(--board-warning-border);
}
.board-stats{
  display:flex;gap:6px;margin-bottom:12px;
}
.board-stat{
  flex:1;background:var(--card);border-radius:10px;
  padding:8px 10px;border:1px solid var(--border);
  text-align:center;
}
.board-stat__value{display:block;font-size:13px;font-weight:600;color:var(--heys-primary)}
.board-stat__label{display:block;font-size:10px;color:var(--muted);margin-top:1px;text-transform:uppercase;letter-spacing:.04em}
.board-section{margin-bottom:10px}
.board-section__head{
  display:flex;align-items:center;gap:6px;width:100%;
  padding:8px 0;border:0;background:transparent;
  font:inherit;text-align:left;cursor:pointer;color:var(--text);
}
.board-section__chevron{font-size:11px;color:var(--muted);width:12px}
.board-section__title{font-size:13px;font-weight:600;flex:1}
.board-section__count{
  font-size:11px;font-weight:600;color:var(--heys-primary);
  background:color-mix(in srgb,var(--heys-primary) 12%,transparent);
  padding:1px 6px;border-radius:999px;
}
.board-section__body{padding-bottom:2px}
.board-slots{list-style:none;padding:0;margin:0}
.board-slot{
  padding:9px 11px;border-radius:10px;margin-bottom:6px;
  background:var(--card);
  border:1px solid var(--border);
  border-left:3px solid var(--board-slot-muted);
}
.board-slot--focus{border-left-color:var(--heys-primary);background:color-mix(in srgb,var(--heys-primary) 8%,transparent)}
.board-slot--event{border-left-color:#52A0D8}
.board-slot__row{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px}
.board-slot__actions{display:flex;align-items:center;gap:4px}
.board-slot__time{font-size:12px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
.board-slot__kind{font-size:10px;color:var(--heys-primary);background:color-mix(in srgb,var(--heys-primary) 12%,transparent);padding:1px 6px;border-radius:5px}
.board-slot__title{display:block;font-size:13px;line-height:1.3;font-weight:500;color:var(--text)}
.board-slot__meta{display:block;font-size:11px;color:var(--muted);margin-top:4px;line-height:1.25}
.board-task-list{list-style:none;padding:0;margin:0}
.board-task{
  padding:8px 10px;border-radius:9px;margin-bottom:5px;
  background:var(--card);border:1px solid var(--border);
}
.board-task__head{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}
.board-task__main{flex:1;min-width:0}
.board-task--due{border-left:3px solid var(--v4-warn-2,#c67139)}
.board-task--overdue{border-left:3px solid #f87171}
.board-task--open{border-left:3px solid #52A0D8}
.board-task--order{border-left:3px solid var(--v4-warn-soft,#c9922e);background:var(--board-warning-bg)}
.board-task__ref{
  display:block;font-size:10px;font-weight:600;color:var(--heys-primary);
  margin-bottom:2px;font-variant-numeric:tabular-nums;
}
.board-task__title{display:block;font-size:13px;line-height:1.3;color:var(--text)}
.board-task__meta{display:block;font-size:11px;color:var(--muted);margin-top:3px}
.board-talk-btn{
  flex-shrink:0;border:0;background:transparent;font-size:15px;line-height:1;
  padding:2px 4px;border-radius:6px;opacity:.85;color:var(--text);
}
.board-talk-btn:active{opacity:1;background:color-mix(in srgb,var(--heys-primary) 10%,transparent)}
.board-talk-btn--slot{font-size:14px}
.board-talk-notes{list-style:none;padding:0;margin:6px 0 0;font-size:11px;color:var(--muted)}
.board-talk-notes__item{padding:3px 0;border-top:1px solid var(--border);line-height:1.3}
.board-talk-sheet{
  position:fixed;inset:0;z-index:1200;
  display:flex;align-items:flex-end;justify-content:center;
}
.board-talk-sheet__backdrop{
  position:absolute;inset:0;border:0;background:var(--board-backdrop);
}
.board-talk-sheet__panel{
  position:relative;width:100%;max-width:520px;
  background:var(--card);border-radius:16px 16px 0 0;
  padding:14px 16px calc(16px + env(safe-area-inset-bottom,0px));
  box-shadow:var(--board-shadow-lg);
  border:1px solid var(--border);border-bottom:0;
}
.board-talk-sheet__head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px}
.board-talk-sheet__label{font-size:12px;font-weight:600;color:var(--muted);margin:0;line-height:1.35;flex:1}
.board-talk-sheet__close{border:0;background:transparent;font-size:16px;padding:4px;color:var(--muted)}
.board-talk-sheet__input{
  width:100%;box-sizing:border-box;border:1px solid var(--border);
  border-radius:10px;padding:10px 12px;font-size:14px;line-height:1.35;
  resize:vertical;min-height:88px;font-family:inherit;
  background:var(--board-input-bg);color:var(--text);
}
.board-talk-sheet__input::placeholder{color:var(--muted)}
.board-talk-sheet__toggles{margin-top:10px;display:flex;flex-direction:column;gap:10px}
.board-talk-sheet__option{
  display:flex;align-items:flex-start;gap:10px;
  width:100%;margin:0;padding:0;
  color:var(--text);cursor:pointer;user-select:none;
}
.board-talk-sheet__check{
  width:18px;height:18px;min-width:18px;min-height:18px;
  margin:2px 0 0;padding:0;flex-shrink:0;
  accent-color:var(--heys-primary);
  border-radius:4px;box-shadow:none;
}
.board-talk-sheet__option-body{display:flex;flex-direction:column;flex:1;min-width:0}
.board-talk-sheet__option-title{font-size:14px;line-height:1.35;font-weight:500}
.board-talk-sheet__option-hint{
  margin-top:3px;font-size:11px;line-height:1.4;
  color:var(--muted);font-weight:400;
}
.board-talk-sheet__error{font-size:12px;color:var(--board-error-text);margin:8px 0 0}
.board-talk-sheet__save{
  width:100%;margin-top:12px;padding:11px;border:0;border-radius:10px;
  background:var(--heys-primary);color:var(--board-bg,#0f172a);
  font-size:14px;font-weight:600;
}
.board-tab--light .board-talk-sheet__save{color:#fff}
.board-talk-sheet__save:disabled{opacity:.5}
.board-decide{padding:2px 0}
.board-decide--batch{padding-bottom:calc(64px + env(safe-area-inset-bottom,0px))}
.board-decide__counter{font-size:12px;color:var(--muted);margin:0 0 10px}
.board-decide__done-title{font-size:15px;font-weight:600;margin:0 0 6px;color:var(--text)}
.board-simple-q{padding-bottom:10px}
.board-simple-q__actions{
  display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;
}
.board-simple-q__toggle{
  display:flex;flex:1;min-width:0;border-radius:10px;
  border:1px solid var(--border);overflow:hidden;background:var(--board-input-bg,var(--card));
}
.board-simple-q__opt{
  flex:1;min-height:40px;padding:8px 10px;border:0;background:transparent;
  font-size:14px;font-weight:600;color:var(--muted);cursor:pointer;
}
.board-simple-q__opt--active{
  background:color-mix(in srgb,var(--heys-primary) 14%,transparent);
  color:var(--heys-primary);
}
.board-simple-q__opt--yes.board-simple-q__opt--active{
  background:var(--board-success-bg);
  color:var(--board-success-text);
}
.board-simple-q__opt--no.board-simple-q__opt--active{
  background:rgba(248,113,113,.14);
  color:#f87171;
}
.board-simple-q__opt:disabled{opacity:.45;cursor:not-allowed}
.board-simple-q__footer{
  position:fixed;left:0;right:0;bottom:0;z-index:110;
  padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));
  background:var(--board-bg);
  border-top:1px solid var(--border);
  box-shadow:0 -6px 20px rgba(15,23,42,.12);
}
.board-simple-q__footer-btn{
  display:block;width:100%;max-width:520px;margin:0 auto;
  min-height:48px;padding:12px 16px;border:0;border-radius:12px;
  background:var(--heys-primary);color:var(--board-bg,#0f172a);
  font-size:15px;font-weight:600;
}
.board-tab--light .board-simple-q__footer-btn{color:#fff}
.board-simple-q__footer-btn:disabled{opacity:.45;cursor:not-allowed}
.board-simple-q__hint{
  font-size:11px;color:var(--muted);margin:6px 0 0;line-height:1.35;
}
.board-simple-q__later{
  flex-shrink:0;min-height:40px;padding:8px 12px;border:1px solid var(--border);
  border-radius:10px;background:transparent;color:var(--muted);
  font-size:13px;font-weight:600;white-space:nowrap;
}
.board-simple-q__later:disabled{opacity:.45;cursor:not-allowed}
.board-simple-q__error{
  font-size:11px;color:var(--board-error-text);margin:6px 0 0;line-height:1.35;
}
.board-slot__reslot-btn{
  border:1px solid var(--border);background:transparent;
  font-size:10px;font-weight:600;color:var(--heys-primary);
  padding:2px 7px;border-radius:6px;white-space:nowrap;
}
.board-slot__reslot-btn:disabled{opacity:.45;cursor:not-allowed}
.board-reslot{
  margin-top:8px;padding:8px;border-radius:8px;
  background:color-mix(in srgb,var(--heys-primary) 6%,transparent);
  border:1px solid var(--border);
}
.board-reslot__label{font-size:11px;color:var(--muted);margin:0 0 6px}
.board-reslot__row{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px}
.board-reslot__step{
  min-width:44px;min-height:36px;border:1px solid var(--border);
  border-radius:8px;background:var(--card);font-size:13px;font-weight:600;color:var(--text);
}
.board-reslot__step:disabled{opacity:.45;cursor:not-allowed}
.board-reslot__time{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--text)}
.board-reslot__actions{display:flex;gap:8px}
.board-reslot__cancel,.board-reslot__save{
  flex:1;min-height:38px;border-radius:9px;font-size:13px;font-weight:600;
}
.board-reslot__cancel{border:1px solid var(--border);background:transparent;color:var(--muted)}
.board-reslot__save{border:0;background:var(--heys-primary);color:var(--board-bg,#0f172a)}
.board-tab--light .board-reslot__save{color:#fff}
.board-reslot__save:disabled,.board-reslot__cancel:disabled{opacity:.45;cursor:not-allowed}
.board-reslot__error{
  font-size:11px;color:var(--board-error-text);margin:6px 0 0;line-height:1.35;
}
.board-close{padding:2px 0}
.board-close__lead{font-size:13px;font-weight:600;margin:0 0 8px;color:var(--text)}
.board-close__closed{
  padding:10px 12px;border-radius:10px;margin-bottom:10px;
  background:var(--board-success-bg);border:1px solid var(--board-success-border);
}
.board-close__closed-title{font-size:12px;font-weight:600;margin:0 0 4px;color:var(--board-success-text)}
.board-close__note{font-size:13px;line-height:1.35;margin:0;color:var(--text);font-style:italic}
.board-close__readonly{
  font-size:11px;color:var(--muted);line-height:1.35;
  margin:0 0 10px;padding:8px 10px;border-radius:9px;
  background:var(--board-readonly-bg);border:1px dashed var(--board-readonly-border);
}
.board-close__note-label{display:block;margin:12px 0 8px}
.board-close__note-title{
  display:block;font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px;
}
.board-close__note-input{
  width:100%;box-sizing:border-box;min-height:64px;resize:vertical;
  padding:10px 12px;border-radius:10px;border:1px solid var(--border);
  background:var(--board-input-bg,var(--card));color:var(--text);
  font:inherit;font-size:14px;line-height:1.35;
}
.board-close__note-input:disabled{opacity:.55}
.board-close__hint{font-size:11px;color:var(--muted);margin:0 0 8px;line-height:1.35}
.board-close__error{
  font-size:11px;color:var(--board-error-text);margin:0 0 8px;line-height:1.35;
}
.board-close__submit{
  width:100%;min-height:44px;margin-top:4px;padding:10px 14px;border:0;border-radius:12px;
  background:var(--heys-primary);color:var(--board-bg,#0f172a);
  font-size:14px;font-weight:600;
}
.board-tab--light .board-close__submit{color:#fff}
.board-close__submit:disabled{opacity:.45;cursor:not-allowed}
.board-close-slots{list-style:none;padding:0;margin:0}
.board-close-slot{
  padding:9px 11px;border-radius:10px;margin-bottom:6px;
  background:var(--card);border:1px solid var(--border);
}
.board-close-slot--done{border-left:3px solid #4ade80;opacity:.92}
.board-close-slot--missed{border-left:3px solid #f87171;opacity:.92}
.board-close-slot:not(.board-close-slot--done):not(.board-close-slot--missed){border-left:3px solid var(--v4-warn-soft,#c9922e)}
.board-close-slot__row{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px}
.board-close-slot__time{font-size:12px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
.board-close-slot__status{font-size:13px;font-weight:700;color:var(--heys-primary);min-width:16px;text-align:right}
.board-close-slot--done .board-close-slot__status{color:var(--board-success-text)}
.board-close-slot--missed .board-close-slot__status{color:#f87171}
.board-close-slot__title{display:block;font-size:13px;line-height:1.3;font-weight:500;color:var(--text)}
.board-close-slot__kind{
  display:inline-block;font-size:10px;color:var(--heys-primary);
  background:color-mix(in srgb,var(--heys-primary) 12%,transparent);
  padding:1px 6px;border-radius:5px;margin-top:4px;
}
.board-close-slot__toggle{
  display:flex;gap:6px;margin-top:8px;
}
.board-close-slot__opt{
  flex:1;min-height:36px;padding:6px 8px;border-radius:9px;
  border:1px solid var(--border);background:transparent;color:var(--muted);
  font-size:12px;font-weight:600;
}
.board-close-slot__opt--active.board-close-slot__opt--yes{
  background:var(--board-success-bg);border-color:var(--board-success-border);
  color:var(--board-success-text);
}
.board-close-slot__opt--active.board-close-slot__opt--no{
  background:rgba(248,113,113,.12);border-color:rgba(248,113,113,.35);color:#f87171;
}
.board-close-slot__opt:disabled{opacity:.45;cursor:not-allowed}
.board-close-slot__hint{display:block;font-size:10px;color:var(--muted);margin-top:3px}
.board-slot--done{opacity:.72}
.board-slot__done-btn{
  min-width:32px;min-height:32px;padding:0 8px;border-radius:8px;
  border:1px solid var(--border);background:transparent;color:var(--muted);
  font-size:14px;font-weight:700;line-height:1;
}
.board-slot__done-btn--on{
  background:var(--board-success-bg);border-color:var(--board-success-border);
  color:var(--board-success-text);
}
.board-slot__done-btn:disabled{opacity:.45;cursor:not-allowed}
.board-slot__error{font-size:11px;color:var(--board-error-text);margin:4px 0 0;line-height:1.3}
.board-habits,.board-close-habits{display:flex;flex-wrap:wrap;gap:6px}
.board-habit-chip,.board-close-habit{
  font-size:12px;padding:5px 10px;border-radius:999px;
  background:var(--card);border:1px solid var(--border);
  color:var(--muted);
}
.board-habit-chip{cursor:pointer}
.board-habit-chip:disabled{opacity:.45;cursor:not-allowed}
.board-habit-chip--done,.board-close-habit--done{
  background:var(--board-success-bg);border-color:var(--board-success-border);
  color:var(--board-success-text);
}
.board-week{
  display:flex;gap:6px;overflow-x:auto;padding:6px 0 10px;
  min-height:150px;align-items:flex-end;
}
.board-week__col{flex:1;min-width:44px;text-align:center;display:flex;flex-direction:column;align-items:center}
.board-week__head{font-size:11px;font-weight:600;color:var(--muted);margin-bottom:6px}
.board-week__bar-wrap{
  width:28px;height:88px;background:var(--border);
  border-radius:7px;display:flex;align-items:flex-end;overflow:hidden;
}
.board-week__bar{
  width:100%;background:linear-gradient(180deg,#52A0D8,var(--heys-primary));
  border-radius:7px 7px 0 0;min-height:8px;transition:height .2s ease;
}
.board-week__gap{font-size:9px;color:var(--muted);line-height:1.2;margin-top:4px;max-width:52px}
.board-empty,.board-muted{font-size:13px;color:var(--muted);line-height:1.35}
.board-muted--inset{margin:0 0 8px}
.board-empty--inset{padding:6px 0 2px;margin:0}
.board-today-screen,.board-dashboard{padding:2px 0}
.board-error{
  font-size:13px;color:var(--board-error-text);background:var(--board-error-bg);
  padding:8px 10px;border-radius:9px;margin:0 0 10px;
  border:1px solid color-mix(in srgb,var(--board-error-text) 25%,transparent);
}
`;
        document.head.appendChild(style);
    }

    console.info('[HEYS.board] ✅ BoardTab registered');
})();
