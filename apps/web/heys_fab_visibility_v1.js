// heys_fab_visibility_v1.js — видимость плавающих кнопок (еда, вода, голод, чат, активность)
(function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const STORAGE_KEY = 'heys_fab_visibility_v1';
    const EVENT = 'heys:fab-visibility-changed';
    const DRAFT_EVENT = 'heys:fab-visibility-draft-changed';
    const KEYS = ['water', 'hunger', 'message', 'activity', 'meal'];
    const DEFAULT = { water: true, hunger: true, message: true, activity: true, meal: true };

    // Строка контракта settings-system «что чипуется»: порядок чипов совпадает
    // с порядком в карточке быстрых действий снизу вверх — вода у самой
    // кнопки, мессенджер на макушке. Прежний порядок (вода, голод,
    // мессенджер, активность, еда) не совпадал ни с чем: человек включал
    // чипы в одном порядке, а получал список в другом.
    const OPTIONS = [
        { key: 'water', label: 'Вода', icon: 'water' },
        { key: 'meal', label: 'Еда', icon: 'meal' },
        { key: 'hunger', label: 'Голод и энергия', icon: 'hunger' },
        { key: 'activity', label: 'Активность', icon: 'activity' },
        { key: 'message', label: 'Мессенджер', icon: 'message' },
    ];

    let draftActive = false;
    let draft = null;

    function normalize(raw) {
        const out = { ...DEFAULT };
        if (!raw || typeof raw !== 'object') return out;
        KEYS.forEach((key) => {
            if (typeof raw[key] === 'boolean') out[key] = raw[key];
        });
        return out;
    }

    function readStorage() {
        try {
            const utils = HEYS.utils;
            const raw = utils && typeof utils.lsGet === 'function'
                ? utils.lsGet(STORAGE_KEY, null)
                : JSON.parse(global.localStorage.getItem(STORAGE_KEY) || 'null');
            return normalize(raw);
        } catch (_) {
            return { ...DEFAULT };
        }
    }

    function write(next) {
        const normalized = normalize(next);
        try {
            const utils = HEYS.utils;
            if (utils && typeof utils.lsSet === 'function') utils.lsSet(STORAGE_KEY, normalized);
            else global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        } catch (_) { /* ignore */ }
        return normalized;
    }

    function emitChanged(visibility, animated) {
        try {
            global.dispatchEvent(new CustomEvent(EVENT, {
                detail: { visibility, animated: !!animated },
            }));
        } catch (_) { /* ignore */ }
    }

    function emitDraft(visibility) {
        try {
            global.dispatchEvent(new CustomEvent(DRAFT_EVENT, {
                detail: { visibility },
            }));
        } catch (_) { /* ignore */ }
    }

    function read() {
        return readStorage();
    }

    function readSettingsDraft() {
        if (draftActive && draft) return normalize(draft);
        return read();
    }

    function beginSettingsEdit() {
        draftActive = true;
        draft = { ...read() };
        emitDraft(draft);
        return draft;
    }

    function setDraftVisible(key, visible) {
        if (!KEYS.includes(key)) return readSettingsDraft();
        if (!draftActive) {
            draftActive = true;
            draft = { ...read() };
        }
        draft = normalize({ ...draft, [key]: !!visible });
        emitDraft(draft);
        return draft;
    }

    function toggleDraftVisible(key) {
        const current = readSettingsDraft();
        return setDraftVisible(key, current[key] === false);
    }

    function commitSettingsEdit() {
        if (!draftActive) return null;
        const previous = read();
        const next = normalize(draft || previous);
        draftActive = false;
        draft = null;
        const changed = KEYS.some((key) => previous[key] !== next[key]);
        if (!changed) return null;
        write(next);
        emitChanged(next, true);
        return next;
    }

    function discardSettingsEdit() {
        draftActive = false;
        draft = null;
    }

    function setVisible(key, visible) {
        if (!KEYS.includes(key)) return read();
        const next = write({ ...read(), [key]: !!visible });
        emitChanged(next, false);
        return next;
    }

    function isVisible(key) {
        return read()[key] !== false;
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        const handler = (event) => {
            listener(
                event && event.detail && event.detail.visibility ? event.detail.visibility : read(),
                event && event.detail ? event.detail : {}
            );
        };
        global.addEventListener(EVENT, handler);
        return () => global.removeEventListener(EVENT, handler);
    }

    function subscribeDraft(listener) {
        if (typeof listener !== 'function') return () => {};
        const handler = (event) => {
            listener(
                event && event.detail && event.detail.visibility ? event.detail.visibility : readSettingsDraft(),
                event && event.detail ? event.detail : {}
            );
        };
        global.addEventListener(DRAFT_EVENT, handler);
        return () => global.removeEventListener(DRAFT_EVENT, handler);
    }

    HEYS.FabVisibility = {
        STORAGE_KEY,
        EVENT,
        DRAFT_EVENT,
        KEYS,
        OPTIONS,
        DEFAULT,
        read,
        readSettingsDraft,
        beginSettingsEdit,
        setDraftVisible,
        toggleDraftVisible,
        commitSettingsEdit,
        discardSettingsEdit,
        write,
        setVisible,
        isVisible,
        subscribe,
        subscribeDraft,
    };
})(typeof window !== 'undefined' ? window : globalThis);
