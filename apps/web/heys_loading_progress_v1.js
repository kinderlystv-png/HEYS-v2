/**
 * heys_loading_progress_v1.js
 *
 * Холодный старт: ступени знака 56 (канвас «Спиннеры»).
 * До 15 с — молчит. На 15 с — «Медленная сеть» + Повторить (reload, без сброса кэша).
 * Отказ — прерванная загрузка или 60 с без прироста байтов boot-бандлов.
 * Под формой входа не работает. Галочка на старте не ставится.
 */
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    const WAIT_SHOW_MS = 300;
    const WAIT_LABEL_MS = 2000;
    // Контракт «дольше 2 с»: сначала подпись, «ещё позже» — причина задержки.
    // Числа для второй ступени контракт не называет; берём 5 с — заголовок
    // успевает прочитаться, а причина приходит там, где ожидание уже заметное.
    const WAIT_REASON_MS = 5000;
    const WAIT_MIN_VISIBLE_MS = 400;

    // Контракт «вид знака»: дуга 26 обводкой 2,75. В кнопке — 18 и 2,5
    // (контракт «вид знака в кнопке»); кадр «Спиннер · в кнопке» рисует 15/3,
    // контракт старше кадра.
    const WAIT_GLYPH_PX = 26;
    const WAIT_GLYPH_BUTTON_PX = 18;
    function waitStroke(size) {
        return size <= WAIT_GLYPH_BUTTON_PX ? '2.5' : '2.75';
    }

    function waitGlyph(h, size, phase) {
        const sw = waitStroke(size);
        const paths = [
            h('path', { d: 'M21 12a9 9 0 11-9-9', opacity: '.22' }),
            h('path', { d: 'M12 3a9 9 0 019 9' }),
        ];
        const spinSvg = h('svg', {
            width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
            stroke: 'currentColor', strokeWidth: sw,
            strokeLinecap: 'round', strokeLinejoin: 'round',
        }, ...paths);
        if (phase === 'ok') {
            return h('svg', {
                className: 'heys-wait-mark__glyph',
                width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: sw,
                strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
            },
                h('g', { className: 'heys-wait-mark__spin animate-always' }, ...paths),
                h('circle', { className: 'heys-wait-mark__close', cx: '12', cy: '12', r: '9' }),
                h('path', { className: 'heys-wait-mark__check', d: 'M5 13l4 4L19 7' })
            );
        }
        return h('span', { className: 'heys-wait-mark__spin animate-always', 'aria-hidden': 'true' }, spinSvg);
    }

    function waitFailSvg(h, size) {
        return h('svg', {
            className: 'heys-wait-mark__icon',
            width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
            stroke: 'currentColor', strokeWidth: waitStroke(size), strokeLinecap: 'round',
            'aria-hidden': 'true',
        }, h('path', { d: 'M12 7v6M12 17h.01' }), h('circle', { cx: '12', cy: '12', r: '9' }));
    }

    function renderWaitMarkStatic(React, opts) {
        if (!React || !React.createElement) return null;
        const h = React.createElement;
        const mode = (opts && opts.mode) || 'embedded';
        const state = (opts && opts.state) || 'wait';
        const title = opts && opts.title;
        const text = opts && opts.text;
        const label = opts && opts.label;
        const sr = (opts && opts.sr) || 'Загружаем';
        const phase = state === 'ok' ? 'ok' : state === 'fail' ? 'fail' : 'wait';
        const glyphPx = mode === 'button' ? WAIT_GLYPH_BUTTON_PX : WAIT_GLYPH_PX;
        const glyph = phase === 'fail'
            ? waitFailSvg(h, glyphPx)
            : waitGlyph(h, glyphPx, phase === 'ok' ? 'ok' : 'wait');
        if (mode === 'button') {
            // silent — знак встаёт внутрь чужой живой области (её role='status'
            // уже озвучивает стадию). Вложенный второй role='status' даёт
            // двойное объявление, поэтому здесь его не ставим.
            const attrs = { className: 'heys-wait-mark heys-wait-mark--button is-' + phase };
            if (!(opts && opts.silent)) attrs.role = 'status';
            return h('span', attrs, glyph, label || null);
        }
        const showCaption = !!(title || text);
        return h('div', {
            className: 'heys-wait-mark heys-wait-mark--' + mode + ' is-' + phase,
            role: 'status',
            'aria-live': 'polite',
            'aria-busy': phase === 'wait' ? 'true' : 'false',
        },
            h('div', { className: 'heys-wait-mark__sign' },
                h('span', { className: 'heys-wait-mark__disc', 'aria-hidden': 'true' }, glyph),
                !showCaption && h('span', { className: 'heys-wait-mark__sr' }, sr),
                title && h('div', { className: 'heys-wait-mark__title' }, title),
                text && h('div', { className: 'heys-wait-mark__text' }, text),
                opts && opts.actions
                    ? h('div', { className: 'heys-wait-mark__actions' }, opts.actions)
                    : null
            )
        );
    }

    let waitMarkHost = null;

    function getWaitMarkHost(React) {
        if (waitMarkHost) return waitMarkHost;
        const { useState, useEffect, useRef } = React;

        function useWaitPhases(waiting) {
            const [phase, setPhase] = useState('idle');
            const glyphAt = useRef(0);
            const timers = useRef([]);

            useEffect(() => {
                timers.current.forEach(clearTimeout);
                timers.current = [];
                if (waiting) {
                    setPhase('idle');
                    glyphAt.current = 0;
                    timers.current.push(setTimeout(() => {
                        glyphAt.current = Date.now();
                        setPhase('glyph');
                    }, WAIT_SHOW_MS));
                    timers.current.push(setTimeout(() => setPhase('labeled'), WAIT_LABEL_MS));
                    timers.current.push(setTimeout(() => setPhase('reasoned'), WAIT_REASON_MS));
                } else if (glyphAt.current) {
                    const remain = Math.max(0, WAIT_MIN_VISIBLE_MS - (Date.now() - glyphAt.current));
                    timers.current.push(setTimeout(() => {
                        setPhase('idle');
                        glyphAt.current = 0;
                    }, remain));
                } else {
                    setPhase('idle');
                }
                return () => {
                    timers.current.forEach(clearTimeout);
                    timers.current = [];
                };
            }, [waiting]);

            return { phase, glyphAt };
        }

        // Контракт «дольше 2 с»: заголовок приходит на 2 с, причина — позже.
        // Раньше оба приезжали одним порогом.
        const hasTitle = (phase) => phase === 'labeled' || phase === 'reasoned';
        const hasReason = (phase) => phase === 'reasoned';

        function useDeferredResult(result, waiting, glyphAt) {
            const [shown, setShown] = useState(false);
            useEffect(() => {
                if (!result) {
                    setShown(false);
                    return;
                }
                const since = glyphAt.current;
                if (!since) {
                    setShown(true);
                    return;
                }
                const remain = Math.max(0, WAIT_MIN_VISIBLE_MS - (Date.now() - since));
                const t = setTimeout(() => setShown(true), remain);
                return () => clearTimeout(t);
            }, [result, waiting]);
            return shown;
        }

        function WaitMarkButton(props) {
            const waiting = !!(props.busy && !props.ok && !props.fail);
            const { phase, glyphAt } = useWaitPhases(waiting);
            const showOk = useDeferredResult(!!props.ok, waiting, glyphAt);
            const showFail = useDeferredResult(!!props.fail, waiting, glyphAt);

            if (!waiting && !showOk && !showFail) return props.idle || '';

            let state = 'wait';
            let label = null;
            if (showFail) {
                state = 'fail';
                label = props.failLabel || props.idle;
            } else if (showOk) {
                state = 'ok';
                label = props.okLabel || props.idle;
            } else if (hasTitle(phase)) {
                label = props.busyLabel || props.idle;
            } else if (phase === 'idle' && waiting) {
                return props.idle || '';
            }

            return renderWaitMarkStatic(React, { mode: 'button', state, label });
        }

        function WaitMarkScreen(props) {
            const waiting = props.state === 'wait';
            const hasCaption = !!(props.title || props.text);
            const { phase, glyphAt } = useWaitPhases(waiting);
            const showOk = useDeferredResult(props.state === 'ok', waiting, glyphAt);
            const showFail = useDeferredResult(props.state === 'fail', waiting, glyphAt);

            if (waiting && hasCaption) {
                if (phase === 'idle') return null;
                return renderWaitMarkStatic(React, {
                    mode: 'screen',
                    state: 'wait',
                    sr: props.sr,
                    title: hasTitle(phase) ? props.title : null,
                    text: hasReason(phase) ? props.text : null,
                    actions: null,
                });
            }

            if (waiting) {
                return renderWaitMarkStatic(React, props);
            }

            const state = showFail ? 'fail' : showOk ? 'ok' : props.state;
            if ((props.state === 'ok' && !showOk) || (props.state === 'fail' && !showFail)) {
                if (phase === 'idle') return null;
                return renderWaitMarkStatic(React, {
                    mode: 'screen',
                    state: 'wait',
                    sr: props.sr,
                    title: hasTitle(phase) ? props.title : null,
                    text: hasReason(phase) ? props.text : null,
                    actions: null,
                });
            }

            return renderWaitMarkStatic(React, Object.assign({}, props, { state }));
        }

        waitMarkHost = { WaitMarkButton, WaitMarkScreen };
        return waitMarkHost;
    }

    function renderWaitMark(React, opts) {
        if (!React || !React.createElement) return null;
        const mode = (opts && opts.mode) || 'embedded';
        if (mode === 'screen' && typeof React.useState === 'function') {
            const Host = getWaitMarkHost(React);
            return React.createElement(Host.WaitMarkScreen, opts || {});
        }
        return renderWaitMarkStatic(React, opts);
    }

    HEYS.WaitMark = {
        thresholds: {
            showMs: WAIT_SHOW_MS,
            labelMs: WAIT_LABEL_MS,
            reasonMs: WAIT_REASON_MS,
            minVisibleMs: WAIT_MIN_VISIBLE_MS,
        },
        render: renderWaitMark,
        button(React, opts) {
            const busy = !!(opts && opts.busy);
            const ok = !!(opts && opts.ok);
            const fail = !!(opts && opts.fail);
            if (!busy && !ok && !fail) return (opts && opts.idle) || '';
            if (!React || !React.createElement || typeof React.useState !== 'function') {
                const state = fail ? 'fail' : ok ? 'ok' : 'wait';
                const label = fail ? (opts.failLabel || opts.idle)
                    : ok ? (opts.okLabel || opts.idle)
                        : (opts.busyLabel || opts.idle);
                return renderWaitMarkStatic(React, { mode: 'button', state, label });
            }
            const Host = getWaitMarkHost(React);
            return React.createElement(Host.WaitMarkButton, opts || {});
        },
    };

    if (global.__heysLoadingProgress) return;

    if (global.__HEYS_DEMO_MODE__ && global.__HEYS_DEMO_MODE__.enabled === true) {
        return;
    }

    const SLOW_MS = 15000;
    const STALL_MS = 60000;
    const HIDE_FADE_MS = 120;
    const BOOT_RES = /\/(react-bundle|boot-(init|core|calc|day|app)\.bundle\.)/;
    const FAIL_COUNT_KEY = 'heys_boot_fail_count';
    const SUPPORT_URL = 'https://t.me/heyslab_support_bot';
    const FAIL_COPY = {
        first: {
            title: 'Не удалось загрузить приложение',
            text: 'Похоже, нет связи. Ваши данные на месте — они хранятся на устройстве.',
        },
        again: {
            title: 'Всё ещё не получается',
            text: 'Данные на месте. Если связь есть, а приложение не открывается — напишите куратору, он посмотрит.',
        },
    };

    const state = {
        phase: 'html-parse',
        percent: 0,
        message: 'Загружаем',
        hidden: false,
        destroyed: false,
        startedAt: Date.now(),
        lastBytes: -1,
        lastByteAt: Date.now(),
        slowShown: false,
        failShown: false,
    };

    let slowTimer = null;
    let stallTimer = null;

    function hasSession() {
        try {
            return document.documentElement.getAttribute('data-heys-session') === '1'
                || global.__heysHasSession === true;
        } catch (_) {
            return false;
        }
    }

    function marks() {
        return Array.from(document.querySelectorAll('.heys-boot-mark'));
    }

    function readBootBytes() {
        if (typeof performance === 'undefined' || !performance.getEntriesByType) return 0;
        let total = 0;
        try {
            const resources = performance.getEntriesByType('resource');
            for (const r of resources) {
                if (!BOOT_RES.test(r.name || '')) continue;
                const size = r.transferSize || r.encodedBodySize || 0;
                total += size > 0 ? size : 1;
            }
        } catch (_) { /* noop */ }
        return total;
    }

    function readFailCount() {
        try { return parseInt(sessionStorage.getItem(FAIL_COUNT_KEY) || '0', 10) || 0; } catch (_) { return 0; }
    }

    function writeFailCount(n) {
        try { sessionStorage.setItem(FAIL_COUNT_KEY, String(n)); } catch (_) { /* noop */ }
    }

    function clearFailCount() {
        try { sessionStorage.removeItem(FAIL_COUNT_KEY); } catch (_) { /* noop */ }
    }

    function enableOverlayClicks() {
        const overlay = document.getElementById('heys-boot-visual-guard');
        if (overlay) overlay.style.pointerEvents = 'auto';
    }

    function applySlow() {
        if (state.destroyed || state.hidden || state.failShown || state.slowShown) return;
        if (!hasSession()) return;
        state.slowShown = true;
        state.phase = 'slow';
        state.message = 'Медленная сеть, продолжаем загружать';
        marks().forEach((el) => {
            el.classList.add('is-slow');
            el.classList.remove('is-fail', 'is-fail-again');
        });
        enableOverlayClicks();
    }

    function applyFail() {
        if (state.destroyed || state.failShown) return;
        state.failShown = true;
        state.hidden = true;
        state.phase = 'fail';
        const nextCount = readFailCount() + 1;
        writeFailCount(nextCount);
        const again = nextCount >= 2;
        const copy = again ? FAIL_COPY.again : FAIL_COPY.first;
        state.message = copy.title;
        marks().forEach((el) => {
            el.classList.remove('is-slow');
            el.classList.add('is-fail');
            el.classList.toggle('is-fail-again', again);
            el.setAttribute('role', 'alert');
            el.setAttribute('aria-busy', 'false');
            const title = el.querySelector('.heys-boot-mark__title');
            const text = el.querySelector('.heys-boot-mark__text');
            if (title) title.textContent = copy.title;
            if (text) text.textContent = copy.text;
            const sr = el.querySelector('.heys-boot-mark__sr');
            if (sr) sr.textContent = copy.title;
        });
        enableOverlayClicks();
        if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
        if (stallTimer) { clearInterval(stallTimer); stallTimer = null; }
    }

    function hideMarks() {
        if (state.destroyed || state.failShown) return;
        state.hidden = true;
        state.phase = 'ready';
        state.percent = 100;
        state.message = 'Готово';
        clearFailCount();
        marks().forEach((el) => {
            el.style.transition = 'opacity ' + HIDE_FADE_MS + 'ms ease-out';
            el.style.opacity = '0';
            el.setAttribute('aria-busy', 'false');
        });
        if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
        if (stallTimer) { clearInterval(stallTimer); stallTimer = null; }
        setTimeout(destroy, HIDE_FADE_MS + 40);
    }

    function pollBytes() {
        if (state.destroyed || state.hidden || state.failShown) return;
        const bytes = readBootBytes();
        if (bytes > state.lastBytes) {
            state.lastBytes = bytes;
            state.lastByteAt = Date.now();
        }
        if (Date.now() - state.lastByteAt >= STALL_MS) {
            applyFail();
        }
    }

    function onAppContentReady() {
        if (document.getElementById('heys-boot-visual-guard')) return;
        hideMarks();
    }

    function onRetryClick(ev) {
        const btn = ev.target && ev.target.closest && ev.target.closest('.heys-boot-mark__retry');
        if (!btn) return;
        ev.preventDefault();
        location.reload();
    }

    function destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
        if (stallTimer) { clearInterval(stallTimer); stallTimer = null; }
        document.removeEventListener('click', onRetryClick);
    }

    function boot() {
        if (state.destroyed) return;
        if (!hasSession()) {
            global.addEventListener('heys-auth-ready', boot, { once: true });
            return;
        }
        document.addEventListener('click', onRetryClick);
        if (!slowTimer) slowTimer = setTimeout(applySlow, SLOW_MS);
        if (!stallTimer) stallTimer = setInterval(pollBytes, 1000);
        pollBytes();
        global.addEventListener('heys:app-content-ready', onAppContentReady, { once: true });
        if (global.__heysContentReady === true) onAppContentReady();
        global.addEventListener('heys:force-logout', () => destroy(), { once: true });
    }

    global.__heysLoadingProgress = {
        getState: () => ({ ...state }),
        forceHide: () => hideMarks(),
        forceDestroy: () => destroy(),
    };
    global.__heysBootWait = {
        ownsWatchdog: true,
        showFail: applyFail,
        showSlow: applySlow,
        hide: hideMarks,
        supportUrl: SUPPORT_URL,
    };

    if (document.body) boot();
    else global.addEventListener('DOMContentLoaded', boot, { once: true });
})(typeof window !== 'undefined' ? window : globalThis);
