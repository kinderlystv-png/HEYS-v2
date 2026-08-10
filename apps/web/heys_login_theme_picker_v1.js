// heys_login_theme_picker_v1.js — Login/onboarding theme picker (UI v4 stage 5)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    const COPY = Object.freeze({
        title: 'Оформление',
        paletteLabel: 'Палитра',
        modeLabel: 'Режим',
        familyClassic: 'Каноничная',
        familySoft: 'Мягкая',
        softSand: 'Бежево-зелёная',
        softBlue: 'Синяя',
        modeLight: 'Светлый',
        modeDark: 'Тёмный',
        modeAuto: 'Как в системе',
        hint: 'Выбор запоминается на этом устройстве',
        dotsLabel: 'Выбор оформления',
        collapse: 'Свернуть выбор оформления',
    });

    const SOFT_VARIANTS = Object.freeze([
        { id: 'sand', label: COPY.softSand, palette: 'sand', act: '#c67139', hero: '#efe3cf' },
        { id: 'blue', label: COPY.softBlue, palette: 'blue', act: '#2e7cc0', hero: '#e2edf7' },
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
        if (!themeApi) return 'classic';
        try {
            const id = themeApi.readStoredThemeId();
            return themeApi.getPalette(id);
        } catch (_) {
            return 'classic';
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

    function familyFromPalette(palette) {
        return palette === 'classic' ? 'canonical' : 'soft';
    }

    function softVariantFromPalette(palette) {
        return palette === 'blue' ? 'blue' : 'sand';
    }

    function applyPalette(themeApi, family, softVariant) {
        if (!themeApi || typeof themeApi.setPalette !== 'function') return;
        const palette = family === 'canonical' ? 'classic' : softVariant;
        themeApi.setPalette(palette);
    }

    function applyModePreference(themeApi, modePref) {
        if (!themeApi || typeof themeApi.setModePreference !== 'function') return;
        themeApi.setModePreference(modePref);
    }

    function dotStyle(palette, activePalette, kind) {
        const classicAct = '#2563eb';
        const sandAct = '#c67139';
        const blueAct = '#2e7cc0';
        const isActive = palette === activePalette;
        if (kind === 'classic') {
            if (isActive) {
                return {
                    background: 'var(--v4-bg, #ffffff)',
                    border: '2px solid var(--v4-ink-2, #64748b)',
                    boxShadow: 'none',
                };
            }
            return {
                background: classicAct,
                border: '2px solid transparent',
                boxShadow: 'none',
            };
        }
        if (kind === 'sand') {
            return {
                background: sandAct,
                border: isActive ? '2px solid var(--v4-ink, #111827)' : '2px solid transparent',
                boxShadow: isActive ? '0 0 0 2px var(--v4-bg, #fff)' : 'none',
            };
        }
        return {
            background: blueAct,
            border: isActive ? '2px solid var(--v4-ink-2, #64748b)' : '2px solid transparent',
            boxShadow: isActive ? '0 0 0 2px var(--v4-bg, #fff)' : 'none',
        };
    }

    function createDomPicker(options) {
        const opts = options || {};
        const themeApi = getThemeApi();
        let expanded = false;
        let dimmed = false;
        let palette = readPalette(themeApi);
        let family = familyFromPalette(palette);
        let softVariant = softVariantFromPalette(palette);
        let modePreference = readModePreference(themeApi);
        const listeners = new Set();

        const root = document.createElement('div');
        root.className = 'heys-login-theme';

        const dots = document.createElement('button');
        dots.type = 'button';
        dots.className = 'heys-login-theme__dots';
        dots.setAttribute('aria-label', COPY.dotsLabel);
        dots.setAttribute('aria-expanded', 'false');

        const dotEls = ['classic', 'sand', 'blue'].map((kind) => {
            const el = document.createElement('span');
            el.className = 'heys-login-theme__dot';
            el.setAttribute('aria-hidden', 'true');
            dots.appendChild(el);
            return { kind, el };
        });

        const panel = document.createElement('div');
        panel.className = 'heys-login-theme__panel';
        panel.hidden = true;

        const panelHead = document.createElement('div');
        panelHead.className = 'heys-login-theme__head';
        panelHead.textContent = COPY.title;

        const collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.className = 'heys-login-theme__collapse';
        collapseBtn.setAttribute('aria-label', COPY.collapse);
        collapseBtn.textContent = '×';

        const paletteLabel = document.createElement('div');
        paletteLabel.className = 'heys-login-theme__section-label';
        paletteLabel.textContent = COPY.paletteLabel;

        const familyRow = document.createElement('div');
        familyRow.className = 'heys-login-theme__row heys-login-theme__row--family';
        const familyButtons = {};

        [['canonical', COPY.familyClassic], ['soft', COPY.familySoft]].forEach(([id, label]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'heys-login-theme__chip';
            btn.dataset.family = id;
            btn.textContent = label;
            familyRow.appendChild(btn);
            familyButtons[id] = btn;
        });

        const softRow = document.createElement('div');
        softRow.className = 'heys-login-theme__row heys-login-theme__row--soft';
        const softButtons = {};
        SOFT_VARIANTS.forEach((variant) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'heys-login-theme__soft-card';
            btn.dataset.soft = variant.id;
            const swatch = document.createElement('span');
            swatch.className = 'heys-login-theme__soft-swatch';
            swatch.style.setProperty('--swatch-act', variant.act);
            swatch.style.setProperty('--swatch-hero', variant.hero);
            const text = document.createElement('span');
            text.className = 'heys-login-theme__soft-label';
            text.textContent = variant.label;
            btn.appendChild(swatch);
            btn.appendChild(text);
            softRow.appendChild(btn);
            softButtons[variant.id] = btn;
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
        panel.appendChild(familyRow);
        panel.appendChild(softRow);
        panel.appendChild(modeLabel);
        panel.appendChild(modeRow);
        panel.appendChild(hint);
        root.appendChild(panel);
        root.appendChild(dots);

        function notify() {
            listeners.forEach((fn) => {
                try { fn({ expanded, dimmed, palette, family, softVariant, modePreference }); } catch (_) { /* noop */ }
            });
            if (typeof opts.onStateChange === 'function') {
                opts.onStateChange({ expanded, dimmed, palette, family, softVariant, modePreference });
            }
        }

        function syncKeypadVisibility() {
            const keypad = opts.keypadEl;
            if (!keypad) return;
            const hideKeypad = expanded || dimmed;
            keypad.classList.toggle('is-hidden', hideKeypad);
            keypad.setAttribute('aria-hidden', hideKeypad ? 'true' : 'false');
        }

        function paint() {
            palette = readPalette(themeApi);
            family = familyFromPalette(palette);
            softVariant = softVariantFromPalette(palette);
            modePreference = readModePreference(themeApi);

            dotEls.forEach(({ kind, el }) => {
                const style = dotStyle(palette, palette, kind);
                el.style.background = style.background;
                el.style.border = style.border;
                el.style.boxShadow = style.boxShadow;
            });

            Object.keys(familyButtons).forEach((id) => {
                familyButtons[id].classList.toggle('is-active', family === id);
                familyButtons[id].setAttribute('aria-pressed', family === id ? 'true' : 'false');
            });

            softRow.hidden = family !== 'soft';
            Object.keys(softButtons).forEach((id) => {
                softButtons[id].classList.toggle('is-active', family === 'soft' && softVariant === id);
                softButtons[id].setAttribute('aria-pressed', family === 'soft' && softVariant === id ? 'true' : 'false');
            });

            Object.keys(modeButtons).forEach((id) => {
                modeButtons[id].classList.toggle('is-active', modePreference === id);
                modeButtons[id].setAttribute('aria-pressed', modePreference === id ? 'true' : 'false');
            });

            root.classList.toggle('is-expanded', expanded);
            root.classList.toggle('is-dimmed', dimmed);
            dots.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            panel.hidden = !expanded;
            dots.hidden = expanded;
            syncKeypadVisibility();
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

        Object.keys(familyButtons).forEach((id) => {
            familyButtons[id].addEventListener('click', () => {
                family = id;
                applyPalette(themeApi, family, softVariant);
                paint();
            });
        });

        Object.keys(softButtons).forEach((id) => {
            softButtons[id].addEventListener('click', () => {
                softVariant = id;
                family = 'soft';
                applyPalette(themeApi, family, softVariant);
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
        const { useState, useEffect, useCallback, useMemo } = React;

        return function LoginThemePicker(props) {
            const {
                keypadRef,
                phoneInputRef,
                dimmed = false,
                onExpandedChange,
            } = props || {};

            const themeApi = getThemeApi();
            const [expanded, setExpanded] = useState(false);
            const [palette, setPaletteState] = useState(() => readPalette(themeApi));
            const [modePreference, setModePreferenceState] = useState(() => readModePreference(themeApi));

            const family = useMemo(() => familyFromPalette(palette), [palette]);
            const softVariant = useMemo(() => softVariantFromPalette(palette), [palette]);

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
                const hideKeypad = expanded || dimmed;
                keypad.classList.toggle('is-hidden', hideKeypad);
                keypad.setAttribute('aria-hidden', hideKeypad ? 'true' : 'false');
            }, [expanded, dimmed, keypadRef]);

            const chooseFamily = useCallback((nextFamily) => {
                applyPalette(themeApi, nextFamily, softVariant);
                setPaletteState(readPalette(themeApi));
            }, [themeApi, softVariant]);

            const chooseSoft = useCallback((nextSoft) => {
                applyPalette(themeApi, 'soft', nextSoft);
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
                ['classic', 'sand', 'blue'].map((kind) => {
                    const style = dotStyle(palette, palette, kind);
                    return React.createElement('span', {
                        key: kind,
                        className: 'heys-login-theme__dot',
                        'aria-hidden': 'true',
                        style,
                    });
                }),
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
                            className: 'heys-login-theme__collapse',
                            'aria-label': COPY.collapse,
                            onClick: () => setExpanded(false),
                        },
                        '×',
                    ),
                ),
                React.createElement('div', { className: 'heys-login-theme__section-label' }, COPY.paletteLabel),
                React.createElement(
                    'div',
                    { className: 'heys-login-theme__row heys-login-theme__row--family' },
                    React.createElement('button', {
                        type: 'button',
                        className: 'heys-login-theme__chip' + (family === 'canonical' ? ' is-active' : ''),
                        'aria-pressed': family === 'canonical' ? 'true' : 'false',
                        onClick: () => chooseFamily('canonical'),
                    }, COPY.familyClassic),
                    React.createElement('button', {
                        type: 'button',
                        className: 'heys-login-theme__chip' + (family === 'soft' ? ' is-active' : ''),
                        'aria-pressed': family === 'soft' ? 'true' : 'false',
                        onClick: () => chooseFamily('soft'),
                    }, COPY.familySoft),
                ),
                family === 'soft' && React.createElement(
                    'div',
                    { className: 'heys-login-theme__row heys-login-theme__row--soft' },
                    SOFT_VARIANTS.map((variant) => React.createElement(
                        'button',
                        {
                            key: variant.id,
                            type: 'button',
                            className: 'heys-login-theme__soft-card' + (softVariant === variant.id ? ' is-active' : ''),
                            'aria-pressed': softVariant === variant.id ? 'true' : 'false',
                            onClick: () => chooseSoft(variant.id),
                        },
                        React.createElement('span', {
                            className: 'heys-login-theme__soft-swatch',
                            style: { '--swatch-act': variant.act, '--swatch-hero': variant.hero },
                        }),
                        React.createElement('span', { className: 'heys-login-theme__soft-label' }, variant.label),
                    )),
                ),
                React.createElement('div', { className: 'heys-login-theme__section-label' }, COPY.modeLabel),
                React.createElement(
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
                React.createElement('div', { className: 'heys-login-theme__hint' }, COPY.hint),
            );

            return React.createElement(
                'div',
                {
                    className: 'heys-login-theme' + (expanded ? ' is-expanded' : '') + (dimmed ? ' is-dimmed' : ''),
                },
                panel,
                dots,
            );
        };
    }

    HEYS.LoginThemePicker = {
        COPY,
        SOFT_VARIANTS,
        MODE_OPTIONS,
        mountDom: createDomPicker,
        createReactComponent: createReactPicker,
        familyFromPalette,
        softVariantFromPalette,
        dotStyle,
    };
}(typeof window !== 'undefined' ? window : globalThis));
