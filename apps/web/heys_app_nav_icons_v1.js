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
