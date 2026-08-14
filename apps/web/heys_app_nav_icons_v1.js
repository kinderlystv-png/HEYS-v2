// heys_app_nav_icons_v1.js — SVG icons for v4 bottom nav and header actions
(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;

    if (!React) {
        console.warn('[HEYS.AppNavIcons] React not loaded');
        return;
    }

    /** @type {Record<string, { paths: string[], fill?: boolean }>} */
    const ICON_SPECS = {
        home: {
            paths: ['M3 10l9-7 9 7v10H3z'],
        },
        diary: {
            paths: ['M6 3v18', 'M4 3v5a2 2 0 004 0V3', 'M16 3c-2 4-2 8 0 9v9'],
        },
        activity: {
            paths: ['M3 16l5-7 4 3 4-7 5 5'],
        },
        stats: {
            paths: ['M4 20V10', 'M10 20V4', 'M16 20v-7'],
        },
        insights: {
            paths: ['M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z'],
        },
        settings: {
            paths: [
                'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
                'M19.4 15a1.7 1.7 0 00.34 1.87l.05.05a2.12 2.12 0 01-3 3l-.05-.05A1.7 1.7 0 0015 19.4a1.7 1.7 0 00-1.87.34l-.05.05a2.12 2.12 0 01-3-3l.05-.05A1.7 1.7 0 008.6 15a1.7 1.7 0 00-1.87-.34l-.05-.05a2.12 2.12 0 013-3l.05.05A1.7 1.7 0 0012 8.6a1.7 1.7 0 001.87-.34l.05-.05a2.12 2.12 0 013 3l-.05.05A1.7 1.7 0 0019.4 15z',
            ],
        },
        sliders: {
            paths: [
                'M4 21v-7',
                'M4 10V3',
                'M12 21v-9',
                'M12 8V3',
                'M20 21v-5',
                'M20 12V3',
                'M2 14h4',
                'M10 12h4',
                'M18 16h4',
            ],
        },
        more: {
            paths: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
            fill: true,
        },
        advice: {
            paths: [
                'M9 18h6',
                'M10 22h4',
                'M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z',
            ],
        },
        moon: {
            paths: ['M21 12.8A9 9 0 1111.2 3a7 7 0 109.8 9.8z'],
        },
        sun: {
            paths: [
                'M12 18a6 6 0 100-12 6 6 0 000 12z',
                'M12 2v2',
                'M12 20v2',
                'M4.93 4.93l1.41 1.41',
                'M17.66 17.66l1.41 1.41',
                'M2 12h2',
                'M20 12h2',
                'M4.93 19.07l1.41-1.41',
                'M17.66 6.34l1.41-1.41',
            ],
        },
        tasks: {
            paths: ['M9 11l3 3L20 6', 'M4 4h7', 'M4 10h4', 'M4 16h7'],
        },
        board: {
            paths: ['M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2', 'M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'],
        },
        products: {
            paths: ['M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', 'M3.3 7l8.7 5 8.7-5', 'M12 22V12'],
        },
        bell: {
            paths: ['M12 3a6 6 0 016 6c0 5 2 6 2 6H4s2-1 2-6a6 6 0 016-6z'],
        },
        chat: {
            paths: ['M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'],
        },
        water: {
            paths: ['M12 3c-3.2 4.2-6 7.4-6 11.2a6 6 0 0012 0C18 10.4 15.2 7.2 12 3z'],
        },
        meal: {
            paths: ['M12 5v14', 'M5 12h14'],
        },
        person: {
            paths: [
                'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2',
                'M12 11a4 4 0 100-8 4 4 0 000 8z',
            ],
        },
        heart: {
            paths: ['M12 21s-6.5-4.35-6.5-10A4 4 0 0112 8a4 4 0 016.5 3c0 5.65-6.5 10-6.5 10z'],
        },
        lock: {
            paths: [
                'M8 11V8a4 4 0 018 0v3',
                'M6 11h12v10H6z',
            ],
        },
        document: {
            paths: [
                'M8 3h7l5 5v13H8z',
                'M15 3v5h5',
                'M11 13h6',
                'M11 17h6',
            ],
        },
        gem: {
            paths: [
                'M3 9l9 12 9-12-4.5-6h-9L3 9z',
                'M3 9h18',
                'M12 21V9',
            ],
        },
        speaker: {
            paths: [
                'M11 5L6 9H3v6h3l5 4V5z',
                'M16 9.5a3.2 3.2 0 010 5',
            ],
        },
        ruler: {
            paths: [
                'M4 20L20 4',
                'M8 16l2 2',
                'M12 12l2 2',
                'M16 8l2 2',
            ],
        },
        target: {
            paths: [
                'M12 21a9 9 0 100-18 9 9 0 000 18z',
                'M12 16a4 4 0 100-8 4 4 0 000 8z',
                'M12 12h.01',
            ],
        },
        phone: {
            paths: [
                'M8 3h8a1.5 1.5 0 011.5 1.5v15A1.5 1.5 0 0116 21H8a1.5 1.5 0 01-1.5-1.5v-15A1.5 1.5 0 018 3z',
                'M12 18h.01',
            ],
        },
        desktop: {
            paths: [
                'M3 5h18v12H3z',
                'M8 21h8',
                'M12 17v4',
            ],
        },
        cap: {
            paths: [
                'M22 10L12 5 2 10l10 5 10-5z',
                'M6 12v4.5c1.8 1.4 10.2 1.4 12 0V12',
            ],
        },
        trophy: {
            paths: [
                'M8 4h8v4a4 4 0 01-8 0V4z',
                'M8 4H5.5A2.5 2.5 0 008 8.5',
                'M16 4h2.5A2.5 2.5 0 0116 8.5',
                'M12 12v4',
                'M8 20h8',
            ],
        },
        palette: {
            paths: [
                'M12 3a9 9 0 108.2 12H15a3 3 0 01-3-3V3z',
                'M8 10h.01',
                'M10 7h.01',
                'M14 7h.01',
            ],
        },
        shield: {
            paths: [
                'M12 3l8 3.5v6.2c0 4.6-3.2 7.6-8 8.8-4.8-1.2-8-4.2-8-8.8V6.5L12 3z',
            ],
        },
    };

  /**
   * @param {{ name: keyof typeof ICON_SPECS, className?: string, size?: number, strokeWidth?: number, title?: string }} props
   */
    function NavIcon(props) {
        const spec = ICON_SPECS[props.name];
        if (!spec) return null;
        const size = props.size || 17;
        const strokeWidth = props.strokeWidth || (props.active ? 2.75 : 2.5);
        return React.createElement(
            'svg',
            {
                className: 'tab-icon-svg' + (props.className ? ` ${props.className}` : ''),
                width: size,
                height: size,
                viewBox: '0 0 24 24',
                fill: spec.fill ? 'currentColor' : 'none',
                stroke: spec.fill ? 'none' : 'currentColor',
                strokeWidth: spec.fill ? undefined : strokeWidth,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                'aria-hidden': props.title ? undefined : 'true',
                role: props.title ? 'img' : undefined,
            },
            spec.paths.map((d, index) => React.createElement('path', { key: `${props.name}-${index}`, d })),
        );
    }

    HEYS.AppNavIcons = {
        NavIcon,
        names: Object.keys(ICON_SPECS),
    };
})();
