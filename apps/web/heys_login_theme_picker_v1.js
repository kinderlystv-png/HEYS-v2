// heys_login_theme_picker_v1.js — Login/onboarding theme picker (UI v4 stage 5)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    const COPY = Object.freeze({
        title: 'Оформление',
        paletteLabel: 'Палитра',
        modeLabel: 'Режим',
        softSand: 'Бежево-зелёная',
        softBlue: 'Синяя',
        modeLight: 'Светлый',
        modeDark: 'Тёмный',
        modeAuto: 'Как в системе',
        hint: 'Выбор запоминается на этом устройстве. «Как в системе» следит за настройкой телефона, пока вы не выберете режим руками.',
        dotsLabel: 'Выбор оформления',
        done: 'Готово',
        collapse: 'Свернуть выбор оформления',
    });

    const PALETTE_VARIANTS = Object.freeze([
        { id: 'sand', label: COPY.softSand, palette: 'sand', act: '#c67139', hero: '#efe3cf', ok: '#7a8a5e' },
        { id: 'blue', label: COPY.softBlue, palette: 'blue', act: '#2e7cc0', hero: '#e2edf7', ok: '#3e9a6b' },
    ]);

    const MODE_OPTIONS = Object.freeze([
        { id: 'light', label: COPY.modeLight },
        { id: 'dark', label: COPY.modeDark },
        { id: 'auto', label: COPY.modeAuto },
    ]);

    function getThemeApi() {
        return HEYS.Theme || null;
    }

    function readPalette(themeApi) {
        if (!themeApi) return 'sand';
        try {
            const id = themeApi.readStoredThemeId();
            return themeApi.getPalette(id);
        } catch (_) {
            return 'sand';
        }
    }

    function readModePreference(themeApi) {
        if (!themeApi || typeof themeApi.getModePreference !== 'function') return 'light';
        try {
            return themeApi.getModePreference();
        } catch (_) {
            return 'light';
        }
    }

    function applyPalette(themeApi, palette) {
        if (!themeApi || typeof themeApi.setPalette !== 'function') return;
        themeApi.setPalette(palette);
    }

    function applyModePreference(themeApi, modePref) {
        if (!themeApi || typeof themeApi.setModePreference !== 'function') return;
        themeApi.setModePreference(modePref);
    }

    // Строка «доступность»: выбор оформления — группа с подписью текущей
    // палитры; раньше скринридер слышал только «Выбор оформления» без неё.
    function paletteGroupLabel(palette) {
        const variant = PALETTE_VARIANTS.find((item) => item.id === palette) || PALETTE_VARIANTS[0];
        return COPY.title + ', ' + variant.label;
    }

    function paletteSwatch(palette) {
        if (palette === 'blue') return { act: '#2e7cc0', ok: '#3e9a6b' };
        return { act: '#c67139', ok: '#7a8a5e' };
    }

    function dotStyle(palette, _activePalette, kind) {
        const swatch = paletteSwatch(palette);
        if (kind === 'ok') {
            return { background: swatch.ok, border: '0', boxShadow: 'none' };
        }
        if (kind === 'ring') {
            return {
                background: 'transparent',
                border: '0',
                boxShadow: 'inset 0 0 0 1.5px var(--v4-ink-3, rgba(0, 0, 0, 0.42))',
            };
        }
        return { background: swatch.act, border: '0', boxShadow: 'none' };
    }

    function createDomPicker(options) {
        const opts = options || {};
        const loginOnly = opts.scope === 'login';
        const themeApi = getThemeApi();
        let expanded = false;
        let dimmed = false;
        let palette = readPalette(themeApi);
        let modePreference = readModePreference(themeApi);
        const listeners = new Set();

        const root = document.createElement('div');
        root.className = 'heys-login-theme';
        root.setAttribute('role', 'group');
        root.setAttribute('aria-label', paletteGroupLabel(palette));

        const dots = document.createElement('button');
        dots.type = 'button';
        dots.className = 'heys-login-theme__dots';
        dots.setAttribute('aria-label', COPY.dotsLabel);
        dots.setAttribute('aria-expanded', 'false');

        const dotEls = ['act', 'ok', 'ring'].map((kind) => {
            const el = document.createElement('span');
            el.className = 'heys-login-theme__dot' + (kind === 'ring' ? ' is-ring' : '');
            el.setAttribute('aria-hidden', 'true');
            return { kind, el };
        });
        const swatch = document.createElement('span');
        swatch.className = 'heys-login-theme__swatch';
        dotEls.forEach(({ el }) => swatch.appendChild(el));
        const caption = document.createElement('span');
        caption.className = 'heys-login-theme__caption';
        caption.textContent = COPY.title;
        dots.appendChild(swatch);
        dots.appendChild(caption);

        const panel = document.createElement('div');
        panel.className = 'heys-login-theme__panel';
        panel.hidden = true;

        const panelHead = document.createElement('div');
        panelHead.className = 'heys-login-theme__head';
        panelHead.textContent = COPY.title;

        const collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.className = loginOnly ? 'heys-login-theme__done' : 'heys-login-theme__collapse';
        collapseBtn.setAttribute('aria-label', loginOnly ? COPY.done : COPY.collapse);
        collapseBtn.textContent = loginOnly ? COPY.done : '×';

        const paletteLabel = document.createElement('div');
        paletteLabel.className = 'heys-login-theme__section-label';
        paletteLabel.textContent = COPY.paletteLabel;

        const paletteRow = document.createElement('div');
        paletteRow.className = 'heys-login-theme__row heys-login-theme__row--soft';
        const paletteButtons = {};
        PALETTE_VARIANTS.forEach((variant) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'heys-login-theme__soft-card';
            btn.dataset.palette = variant.id;
            const swatch = document.createElement('span');
            swatch.className = 'heys-login-theme__soft-swatch';
            swatch.style.setProperty('--swatch-act', variant.act);
            swatch.style.setProperty('--swatch-hero', variant.hero);
            swatch.style.setProperty('--swatch-ok', variant.ok);
            const text = document.createElement('span');
            text.className = 'heys-login-theme__soft-label';
            text.textContent = variant.label;
            btn.appendChild(swatch);
            btn.appendChild(text);
            paletteRow.appendChild(btn);
            paletteButtons[variant.id] = btn;
        });

        const modeLabel = document.createElement('div');
        modeLabel.className = 'heys-login-theme__section-label';
        modeLabel.textContent = COPY.modeLabel;

        const modeRow = document.createElement('div');
        modeRow.className = 'heys-login-theme__row heys-login-theme__row--mode';
        const modeButtons = {};
        MODE_OPTIONS.forEach((mode) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'heys-login-theme__chip heys-login-theme__chip--mode';
            btn.dataset.mode = mode.id;
            btn.textContent = mode.label;
            modeRow.appendChild(btn);
            modeButtons[mode.id] = btn;
        });

        const hint = document.createElement('div');
        hint.className = 'heys-login-theme__hint';
        hint.textContent = COPY.hint;

        panelHead.appendChild(collapseBtn);
        panel.appendChild(panelHead);
        panel.appendChild(paletteLabel);
        panel.appendChild(paletteRow);
        if (!loginOnly) {
            panel.appendChild(modeLabel);
            panel.appendChild(modeRow);
            panel.appendChild(hint);
        }
        root.className = 'heys-login-theme' + (loginOnly ? ' heys-login-theme--login-only' : '');
        root.appendChild(panel);
        root.appendChild(dots);

        function notify() {
            listeners.forEach((fn) => {
                try { fn({ expanded, dimmed, palette, modePreference }); } catch (_) { /* noop */ }
            });
            if (typeof opts.onStateChange === 'function') {
                opts.onStateChange({ expanded, dimmed, palette, modePreference });
            }
        }

        function applyKeypadVisibility(keypad, hideKeypad) {
            if (!keypad) return;
            if (hideKeypad) {
                const active = typeof document !== 'undefined' ? document.activeElement : null;
                if (active && keypad.contains(active)) {
                    try { active.blur(); } catch (_) { /* noop */ }
                }
            }
            keypad.classList.toggle('is-hidden', hideKeypad);
            keypad.setAttribute('aria-hidden', hideKeypad ? 'true' : 'false');
        }

        function syncKeypadVisibility() {
            applyKeypadVisibility(opts.keypadEl, expanded);
        }

        function syncPanelPlacement() {
            if (!opts.dockLayout || !opts.panelSlotEl) return;
            const slot = opts.panelSlotEl;
            if (expanded) {
                let slotRoot = slot.querySelector('.heys-login-theme');
                if (!slotRoot) {
                    slotRoot = document.createElement('div');
                    slot.appendChild(slotRoot);
                }
                slotRoot.className = root.className + ' is-expanded';
                slotRoot.setAttribute('role', 'group');
                slotRoot.setAttribute('aria-label', paletteGroupLabel(palette));
                slotRoot.classList.toggle('is-dimmed', dimmed);
                if (panel.parentNode !== slotRoot) slotRoot.appendChild(panel);
                root.classList.remove('is-expanded');
                root.classList.toggle('is-dimmed', dimmed);
            } else {
                slot.textContent = '';
                if (panel.parentNode !== root) root.insertBefore(panel, dots);
                root.classList.toggle('is-expanded', false);
                root.classList.toggle('is-dimmed', dimmed);
            }
        }

        function paint() {
            palette = readPalette(themeApi);
            modePreference = readModePreference(themeApi);

            dotEls.forEach(({ kind, el }) => {
                const style = dotStyle(palette, palette, kind);
                el.style.background = style.background;
                el.style.border = style.border;
                el.style.boxShadow = style.boxShadow;
            });

            Object.keys(paletteButtons).forEach((id) => {
                paletteButtons[id].classList.toggle('is-active', palette === id);
                paletteButtons[id].setAttribute('aria-pressed', palette === id ? 'true' : 'false');
            });

            Object.keys(modeButtons).forEach((id) => {
                modeButtons[id].classList.toggle('is-active', modePreference === id);
                modeButtons[id].setAttribute('aria-pressed', modePreference === id ? 'true' : 'false');
            });

            root.classList.toggle('is-expanded', expanded);
            root.classList.toggle('is-dimmed', dimmed);
            root.setAttribute('aria-label', paletteGroupLabel(palette));
            dots.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            panel.hidden = !expanded;
            dots.hidden = expanded;
            syncKeypadVisibility();
            syncPanelPlacement();
            notify();
        }

        function setExpanded(next) {
            expanded = !!next;
            paint();
        }

        function setDimmed(next) {
            dimmed = !!next;
            paint();
        }

        dots.addEventListener('click', () => setExpanded(true));
        collapseBtn.addEventListener('click', () => setExpanded(false));

        Object.keys(paletteButtons).forEach((id) => {
            paletteButtons[id].addEventListener('click', () => {
                applyPalette(themeApi, id);
                paint();
            });
        });

        Object.keys(modeButtons).forEach((id) => {
            modeButtons[id].addEventListener('click', () => {
                modePreference = id;
                applyModePreference(themeApi, modePreference);
                paint();
            });
        });

        if (opts.phoneInputEl) {
            const onPhoneFocus = () => setExpanded(false);
            opts.phoneInputEl.addEventListener('focus', onPhoneFocus);
        }

        let unsubscribe = null;
        if (themeApi && typeof themeApi.subscribeThemeChange === 'function') {
            unsubscribe = themeApi.subscribeThemeChange(() => paint());
        }

        paint();

        return {
            root,
            setExpanded,
            setDimmed,
            collapse: () => setExpanded(false),
            destroy() {
                if (unsubscribe) unsubscribe();
                root.remove();
            },
            subscribe(fn) {
                listeners.add(fn);
                return () => listeners.delete(fn);
            },
        };
    }

    function createReactPicker(React) {
        const { useState, useEffect, useCallback } = React;

        return function LoginThemePicker(props) {
            const {
                keypadRef,
                phoneInputRef,
                panelSlotEl = null,
                dockLayout = false,
                dimmed = false,
                scope = 'login',
                onExpandedChange,
            } = props || {};
            const loginOnly = scope === 'login';
            const ReactDOM = typeof window !== 'undefined' ? window.ReactDOM : null;

            const themeApi = getThemeApi();
            const [expanded, setExpanded] = useState(false);
            const [palette, setPaletteState] = useState(() => readPalette(themeApi));
            const [modePreference, setModePreferenceState] = useState(() => readModePreference(themeApi));

            useEffect(() => {
                const api = getThemeApi();
                if (!api || typeof api.subscribeThemeChange !== 'function') return undefined;
                return api.subscribeThemeChange(() => {
                    setPaletteState(readPalette(api));
                    setModePreferenceState(readModePreference(api));
                });
            }, []);

            useEffect(() => {
                if (typeof onExpandedChange === 'function') onExpandedChange(expanded);
            }, [expanded, onExpandedChange]);

            useEffect(() => {
                const input = phoneInputRef && phoneInputRef.current;
                if (!input) return undefined;
                const onFocus = () => setExpanded(false);
                input.addEventListener('focus', onFocus);
                return () => input.removeEventListener('focus', onFocus);
            }, [phoneInputRef]);

            useEffect(() => {
                const keypad = keypadRef && keypadRef.current;
                if (!keypad) return;
                const hideKeypad = expanded;
                if (hideKeypad) {
                    const active = typeof document !== 'undefined' ? document.activeElement : null;
                    if (active && keypad.contains(active)) {
                        try { active.blur(); } catch (_) { /* noop */ }
                    }
                }
                keypad.classList.toggle('is-hidden', hideKeypad);
                keypad.setAttribute('aria-hidden', hideKeypad ? 'true' : 'false');
            }, [expanded, dimmed, keypadRef]);

            const choosePalette = useCallback((nextPalette) => {
                applyPalette(themeApi, nextPalette);
                setPaletteState(readPalette(themeApi));
            }, [themeApi]);

            const chooseMode = useCallback((nextMode) => {
                applyModePreference(themeApi, nextMode);
                setModePreferenceState(readModePreference(themeApi));
            }, [themeApi]);

            const dots = React.createElement(
                'button',
                {
                    type: 'button',
                    className: 'heys-login-theme__dots',
                    'aria-label': COPY.dotsLabel,
                    'aria-expanded': expanded ? 'true' : 'false',
                    hidden: expanded,
                    onClick: () => setExpanded(true),
                },
                React.createElement(
                    'span',
                    { className: 'heys-login-theme__swatch' },
                    ['act', 'ok', 'ring'].map((kind) => {
                        const style = dotStyle(palette, palette, kind);
                        return React.createElement('span', {
                            key: kind,
                            className: 'heys-login-theme__dot' + (kind === 'ring' ? ' is-ring' : ''),
                            'aria-hidden': 'true',
                            style,
                        });
                    }),
                ),
                React.createElement('span', { className: 'heys-login-theme__caption' }, COPY.title),
            );

            const panel = React.createElement(
                'div',
                { className: 'heys-login-theme__panel', hidden: !expanded },
                React.createElement(
                    'div',
                    { className: 'heys-login-theme__head' },
                    COPY.title,
                    React.createElement(
                        'button',
                        {
                            type: 'button',
                            className: loginOnly ? 'heys-login-theme__done' : 'heys-login-theme__collapse',
                            'aria-label': loginOnly ? COPY.done : COPY.collapse,
                            onClick: () => setExpanded(false),
                        },
                        loginOnly ? COPY.done : '×',
                    ),
                ),
                React.createElement('div', { className: 'heys-login-theme__section-label' }, COPY.paletteLabel),
                React.createElement(
                    'div',
                    { className: 'heys-login-theme__row heys-login-theme__row--soft' },
                    PALETTE_VARIANTS.map((variant) => React.createElement(
                        'button',
                        {
                            key: variant.id,
                            type: 'button',
                            className: 'heys-login-theme__soft-card' + (palette === variant.id ? ' is-active' : ''),
                            'aria-pressed': palette === variant.id ? 'true' : 'false',
                            onClick: () => choosePalette(variant.id),
                        },
                        React.createElement('span', {
                            className: 'heys-login-theme__soft-swatch',
                            style: {
                                '--swatch-act': variant.act,
                                '--swatch-hero': variant.hero,
                                '--swatch-ok': variant.ok,
                            },
                        }),
                        React.createElement('span', { className: 'heys-login-theme__soft-label' }, variant.label),
                    )),
                ),
                !loginOnly && React.createElement('div', { className: 'heys-login-theme__section-label' }, COPY.modeLabel),
                !loginOnly && React.createElement(
                    'div',
                    { className: 'heys-login-theme__row heys-login-theme__row--mode' },
                    MODE_OPTIONS.map((mode) => React.createElement('button', {
                        key: mode.id,
                        type: 'button',
                        className: 'heys-login-theme__chip heys-login-theme__chip--mode' + (modePreference === mode.id ? ' is-active' : ''),
                        'aria-pressed': modePreference === mode.id ? 'true' : 'false',
                        onClick: () => chooseMode(mode.id),
                    }, mode.label)),
                ),
                !loginOnly && React.createElement('div', { className: 'heys-login-theme__hint' }, COPY.hint),
            );

            const rootClassName = 'heys-login-theme'
                + (loginOnly ? ' heys-login-theme--login-only' : '')
                + (expanded && !(dockLayout && panelSlotEl) ? ' is-expanded' : '')
                + (dimmed ? ' is-dimmed' : '');

            const dockRoot = React.createElement(
                'div',
                {
                    className: rootClassName,
                    role: 'group',
                    'aria-label': paletteGroupLabel(palette),
                },
                !(dockLayout && panelSlotEl) ? panel : null,
                dots,
            );

            if (dockLayout && panelSlotEl && expanded && ReactDOM && typeof ReactDOM.createPortal === 'function') {
                const slotRoot = React.createElement(
                    'div',
                    {
                        className: 'heys-login-theme'
                            + (loginOnly ? ' heys-login-theme--login-only' : '')
                            + ' is-expanded'
                            + (dimmed ? ' is-dimmed' : ''),
                        role: 'group',
                        'aria-label': paletteGroupLabel(palette),
                    },
                    panel,
                );
                return React.createElement(
                    React.Fragment,
                    null,
                    ReactDOM.createPortal(slotRoot, panelSlotEl),
                    dockRoot,
                );
            }

            return dockRoot;
        };
    }

    HEYS.LoginThemePicker = {
        COPY,
        PALETTE_VARIANTS,
        MODE_OPTIONS,
        mountDom: createDomPicker,
        createReactComponent: createReactPicker,
        dotStyle,
    };
}(typeof window !== 'undefined' ? window : globalThis));
