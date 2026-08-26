// heys_modal_dismiss_v1.js — закрытие модалок/подложек без «призрачного» клика под ними
(function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const GHOST_MS = 500;
    const BACKDROP_CLASS_RE = /(?:^|\s)(?:[\w-]*backdrop(?:--[\w-]+)?|paywall-overlay|widget-wd-sheet__scrim|mc-backdrop|hes-backdrop|confirm-modal-backdrop|ops-dashboard-backdrop|modal-backdrop|client-dropdown-backdrop)(?:\s|$)/;

    let swallowCleanup = null;

    function stopEvent(event) {
        if (!event) return;
        if (event.cancelable) event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    }

    function isBackdropLike(el) {
        if (!el || el.nodeType !== 1) return false;
        const className = el.className;
        return typeof className === 'string' && BACKDROP_CLASS_RE.test(className);
    }

    function installGhostClickSwallow(ms) {
        if (swallowCleanup) {
            swallowCleanup();
            swallowCleanup = null;
        }
        const duration = Number.isFinite(ms) ? ms : GHOST_MS;
        const swallow = (event) => stopEvent(event);
        document.addEventListener('pointerup', swallow, true);
        document.addEventListener('click', swallow, true);
        document.addEventListener('touchend', swallow, true);
        const timer = global.setTimeout(cleanup, duration);
        function cleanup() {
            global.clearTimeout(timer);
            document.removeEventListener('pointerup', swallow, true);
            document.removeEventListener('click', swallow, true);
            document.removeEventListener('touchend', swallow, true);
            if (swallowCleanup === cleanup) swallowCleanup = null;
        }
        swallowCleanup = cleanup;
        return cleanup;
    }

    function dismissFromBackdrop(event, onDismiss) {
        if (event) stopEvent(event);
        installGhostClickSwallow();
        if (typeof onDismiss === 'function') onDismiss();
    }

    function reactBackdropDismiss(onDismiss, options) {
        const onlyCurrentTarget = !options || options.onlyCurrentTarget !== false;
        return {
            onPointerDown: (event) => {
                if (onlyCurrentTarget && event.target !== event.currentTarget) return;
                dismissFromBackdrop(event, onDismiss);
            },
            onClick: (event) => stopEvent(event),
        };
    }

    function bindBackdropElement(el, onDismiss) {
        if (!el || typeof el.addEventListener !== 'function') return () => {};
        const onPointerDown = (event) => {
            if (event.target !== el) return;
            dismissFromBackdrop(event, onDismiss);
        };
        const onClick = (event) => stopEvent(event);
        el.addEventListener('pointerdown', onPointerDown);
        el.addEventListener('click', onClick);
        return () => {
            el.removeEventListener('pointerdown', onPointerDown);
            el.removeEventListener('click', onClick);
        };
    }

    function watchBackdropRemoval(backdrop) {
        if (!backdrop) return;
        const maybeSwallow = () => {
            if (!document.contains(backdrop)) installGhostClickSwallow();
        };
        global.queueMicrotask(maybeSwallow);
        const onPointerUp = () => {
            document.removeEventListener('pointerup', onPointerUp, true);
            maybeSwallow();
        };
        document.addEventListener('pointerup', onPointerUp, true);
    }

    function initGlobalBackdropGhostGuard() {
        if (global.__heysModalDismissGuardInstalled) return;
        global.__heysModalDismissGuardInstalled = true;
        document.addEventListener('pointerdown', (event) => {
            const backdrop = event.target;
            if (!isBackdropLike(backdrop)) return;
            watchBackdropRemoval(backdrop);
        }, true);
    }

    /**
     * Слой в истории браузера. Строка «аппаратная кнопка назад · правило
     * продукта» (home-widgets.v4.dc.html): «кнопка и жест назад закрывают
     * верхний слой, а не выходят из приложения: сначала раскрытая карточка или
     * лист, потом режим правки, потом модалка».
     *
     * Пока слой открыт, в историю кладётся запись; «назад» её снимает и зовёт
     * onBack вместо выхода из приложения. При обычном закрытии запись убирается
     * сама, чтобы «назад» не проглатывал лишний шаг.
     *
     * Приём был выписан вручную в трёх местах — быстрые действия, лист смены
     * вида, режим расстановки. Здесь он один на всех: контракт называет слоями
     * ещё и модалки, а четвёртая копия уже точно разъедется с остальными.
     *
     * @param {string} key — своё имя записи, чтобы чужую не снять.
     * @param {Function} onBack — что закрыть по «назад».
     * @returns {Function} снятие: вызывать при закрытии слоя другим путём.
     */
    function pushHistoryLayer(key, onBack) {
        if (typeof window === 'undefined' || !key) return () => {};
        const onPopState = () => { if (typeof onBack === 'function') onBack(); };
        window.addEventListener('popstate', onPopState);
        try {
            window.history.pushState({ [key]: true }, '');
        } catch (_e) { /* история недоступна — прочие пути закрытия работают */ }
        return () => {
            window.removeEventListener('popstate', onPopState);
            try {
                if (window.history.state && window.history.state[key]) window.history.back();
            } catch (_e) { /* ignore */ }
        };
    }

    HEYS.ModalDismiss = {
        GHOST_MS,
        stopEvent,
        isBackdropLike,
        installGhostClickSwallow,
        dismissFromBackdrop,
        reactBackdropDismiss,
        pushHistoryLayer,
        bindBackdropElement,
        initGlobalBackdropGhostGuard,
    };

    initGlobalBackdropGhostGuard();
})(typeof window !== 'undefined' ? window : globalThis);
