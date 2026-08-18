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

    HEYS.ModalDismiss = {
        GHOST_MS,
        stopEvent,
        isBackdropLike,
        installGhostClickSwallow,
        dismissFromBackdrop,
        reactBackdropDismiss,
        bindBackdropElement,
        initGlobalBackdropGhostGuard,
    };

    initGlobalBackdropGhostGuard();
})(typeof window !== 'undefined' ? window : globalThis);
