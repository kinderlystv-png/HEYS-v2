// heys_app_skeletons_v1.js — shared boot/runtime skeleton layouts for app tabs
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    if (HEYS.AppSkeletons?.version) return;

    const HOME_TABS = ['widgets', 'stats', 'diary', 'activity', 'insights', 'tasks', 'ration', 'user', 'overview'];
    const TASKS_SUBTABS = ['tasks', 'goals', 'calendar', 'gantt', 'chrono', 'checklists', 'reading'];

    // This registry mirrors the stable composition of each tab. The renderers below
    // consume the same data for the pre-React boot frame and React Suspense fallbacks.
    const TAB_LAYOUTS = Object.freeze({
        diary: {
            date: true,
            sections: [
                { kind: 'rings', count: 3 },
                { kind: 'progress' },
                { kind: 'list', count: 6, tone: 'meal' },
            ],
        },
        stats: {
            date: true,
            sections: [
                { kind: 'metrics', count: 4 },
                { kind: 'chart', height: 'lg' },
                { kind: 'cards', count: 2 },
                { kind: 'list', count: 3 },
            ],
        },
        activity: {
            date: true,
            sections: [
                { kind: 'hero' },
                { kind: 'metrics', count: 3 },
                { kind: 'chart', height: 'sm' },
                { kind: 'list', count: 4, tone: 'activity' },
            ],
        },
        widgets: {
            date: true,
            sections: [
                { kind: 'widget-grid', tiles: ['xl', 'xl', 'wide', 'square', 'square', 'wide', 'square', 'square', 'square', 'square'] },
            ],
        },
        insights: {
            date: true,
            sections: [
                { kind: 'insight-hero' },
                { kind: 'metrics', count: 3 },
                { kind: 'list', count: 5, tone: 'insight' },
            ],
        },
        ration: {
            date: false,
            sections: [
                { kind: 'search' },
                { kind: 'chips', count: 4 },
                { kind: 'list', count: 8, tone: 'product' },
            ],
        },
        user: {
            date: false,
            sections: [
                { kind: 'profile' },
                { kind: 'settings', rows: 3 },
                { kind: 'settings', rows: 4 },
                { kind: 'settings', rows: 3 },
            ],
        },
        overview: {
            date: false,
            sections: [
                { kind: 'metrics', count: 4 },
                { kind: 'chart', height: 'lg' },
                { kind: 'list', count: 5 },
            ],
        },
        fallback: {
            date: false,
            sections: [
                { kind: 'hero' },
                { kind: 'cards', count: 2 },
                { kind: 'list', count: 5 },
            ],
        },
    });

    const TASK_LAYOUTS = Object.freeze({
        calendar: [{ kind: 'subnav', count: 7 }, { kind: 'calendar' }, { kind: 'timeline', count: 5 }],
        gantt: [{ kind: 'subnav', count: 7 }, { kind: 'gantt' }, { kind: 'list', count: 4 }],
        chrono: [{ kind: 'subnav', count: 7 }, { kind: 'timer' }, { kind: 'list', count: 6 }],
        reading: [{ kind: 'subnav', count: 7 }, { kind: 'search' }, { kind: 'cards', count: 2 }, { kind: 'list', count: 5 }],
        checklists: [{ kind: 'subnav', count: 7 }, { kind: 'cards', count: 2 }, { kind: 'list', count: 6 }],
        goals: [{ kind: 'subnav', count: 7 }, { kind: 'hero' }, { kind: 'cards', count: 2 }, { kind: 'list', count: 4 }],
        tasks: [{ kind: 'subnav', count: 7 }, { kind: 'chips', count: 4 }, { kind: 'list', count: 7, tone: 'task' }],
    });

    function tryParse(raw, fallback) {
        if (raw == null) return fallback;
        if (typeof raw !== 'string') return raw;
        try { return JSON.parse(raw); } catch (_) { return raw; }
    }

    function normalizeTab(tab) {
        if (tab === 'month') return 'stats';
        return HOME_TABS.includes(tab) ? tab : 'fallback';
    }

    function normalizeTasksSubtab(subtab) {
        return TASKS_SUBTABS.includes(subtab) ? subtab : 'calendar';
    }

    function readBootTabParam() {
        try {
            const params = new global.URLSearchParams(global.location.search);
            const urlTab = params.get('tab') || params.get('view') || params.get('defaultTab');
            if (urlTab === 'day') return 'stats';
            if (urlTab) return String(urlTab);
        } catch (_) { /* noop */ }
        return null;
    }

    function isBoardBootClient(clientId) {
        const id = String(clientId || '').toLowerCase();
        return id === 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    }

    function readBootContext(storage) {
        const store = storage || global.localStorage;
        let clientId = '';
        let profile = {};

        try {
            clientId = tryParse(store?.getItem?.('heys_client_current'), '')
                || tryParse(store?.getItem?.('heys_pin_auth_client'), '')
                || '';
            const scoped = clientId ? tryParse(store?.getItem?.(`heys_${clientId}_profile`), null) : null;
            profile = scoped && typeof scoped === 'object'
                ? scoped
                : (tryParse(store?.getItem?.('heys_profile'), {}) || {});
        } catch (_) {
            profile = {};
        }

        const demoTab = global.__HEYS_DEMO_MODE__?.enabled === true
            ? global.__HEYS_DEMO_MODE__.defaultTab
            : null;
        const urlTab = readBootTabParam();
        const profileTab = profile.defaultTab || 'diary';
        let rawTab = demoTab || urlTab || profileTab;
        if (rawTab === 'board' && !isBoardBootClient(clientId)) {
            rawTab = profileTab === 'board' ? 'diary' : profileTab;
        }
        const tab = normalizeTab(rawTab);
        return {
            tab,
            tasksSubtab: normalizeTasksSubtab(profile.defaultTasksSubtab),
            hasClient: !!clientId,
        };
    }

    function resolveLayout(tab, options) {
        const normalizedTab = normalizeTab(tab);
        if (normalizedTab === 'tasks') {
            const tasksSubtab = normalizeTasksSubtab(options?.tasksSubtab);
            return {
                key: `tasks-${tasksSubtab}`,
                tab: 'tasks',
                date: false,
                sections: TASK_LAYOUTS[tasksSubtab] || TASK_LAYOUTS.calendar,
            };
        }
        const layout = TAB_LAYOUTS[normalizedTab] || TAB_LAYOUTS.fallback;
        return { key: normalizedTab, tab: normalizedTab, ...layout };
    }

    function repeat(count, render) {
        return Array.from({ length: count }, (_, index) => render(index));
    }

    function renderSection(h, section, index) {
        const key = `${section.kind}-${index}`;
        const block = (className, children) => h('div', { key, className: `heys-tab-skeleton__section ${className}` }, children);

        if (section.kind === 'rings') {
            return block('heys-tab-skeleton__rings', repeat(section.count || 3, (itemIndex) =>
                h('div', { key: itemIndex, className: 'heys-tab-skeleton__ring-item' },
                    h('div', { className: 'heys-tab-skeleton__ring' }),
                    h('div', { className: 'heys-tab-skeleton__line heys-tab-skeleton__line--short' })
                )
            ));
        }

        if (section.kind === 'metrics') {
            return block('heys-tab-skeleton__metrics', repeat(section.count || 3, (itemIndex) =>
                h('div', { key: itemIndex, className: 'heys-tab-skeleton__metric' },
                    h('div', { className: 'heys-tab-skeleton__line heys-tab-skeleton__line--tiny' }),
                    h('div', { className: 'heys-tab-skeleton__line heys-tab-skeleton__line--medium' })
                )
            ));
        }

        if (section.kind === 'list' || section.kind === 'timeline') {
            const tone = section.tone ? ` heys-tab-skeleton__list--${section.tone}` : '';
            return block(`heys-tab-skeleton__list${tone}`, repeat(section.count || 4, (itemIndex) =>
                h('div', { key: itemIndex, className: 'heys-tab-skeleton__list-row' + (section.kind === 'timeline' ? ' heys-tab-skeleton__list-row--timeline' : '') },
                    h('div', { className: 'heys-tab-skeleton__row-icon' }),
                    h('div', { className: 'heys-tab-skeleton__row-copy' },
                        h('div', { className: 'heys-tab-skeleton__line', 'data-width': itemIndex % 3 === 0 ? 'long' : 'medium' }),
                        h('div', { className: 'heys-tab-skeleton__line heys-tab-skeleton__line--muted', 'data-width': itemIndex % 2 === 0 ? 'medium' : 'short' })
                    ),
                    h('div', { className: 'heys-tab-skeleton__row-tail' })
                )
            ));
        }

        if (section.kind === 'cards' || section.kind === 'settings') {
            const count = section.rows || section.count || 2;
            return block(section.kind === 'settings' ? 'heys-tab-skeleton__settings' : 'heys-tab-skeleton__cards',
                repeat(count, (itemIndex) => h('div', { key: itemIndex, className: 'heys-tab-skeleton__card' },
                    h('div', { className: 'heys-tab-skeleton__line', 'data-width': itemIndex % 2 ? 'medium' : 'long' }),
                    h('div', { className: 'heys-tab-skeleton__line heys-tab-skeleton__line--muted', 'data-width': 'short' })
                ))
            );
        }

        if (section.kind === 'widget-grid') {
            return block('heys-tab-skeleton__widget-grid', (section.tiles || []).map((size, itemIndex) =>
                h('div', { key: itemIndex, className: `heys-tab-skeleton__widget heys-tab-skeleton__widget--${size}` })
            ));
        }

        if (section.kind === 'chips' || section.kind === 'subnav') {
            return block(section.kind === 'subnav' ? 'heys-tab-skeleton__subnav' : 'heys-tab-skeleton__chips',
                repeat(section.count || 4, (itemIndex) => h('div', { key: itemIndex, className: 'heys-tab-skeleton__chip' }))
            );
        }

        if (section.kind === 'profile' || section.kind === 'insight-hero') {
            return block(`heys-tab-skeleton__${section.kind}`,
                h('div', { className: section.kind === 'profile' ? 'heys-tab-skeleton__avatar' : 'heys-tab-skeleton__large-ring' }),
                h('div', { className: 'heys-tab-skeleton__hero-copy' },
                    h('div', { className: 'heys-tab-skeleton__line', 'data-width': 'medium' }),
                    h('div', { className: 'heys-tab-skeleton__line heys-tab-skeleton__line--muted', 'data-width': 'long' }),
                    h('div', { className: 'heys-tab-skeleton__line heys-tab-skeleton__line--muted', 'data-width': 'short' })
                )
            );
        }

        if (section.kind === 'search') {
            return block('heys-tab-skeleton__search', h('div', { className: 'heys-tab-skeleton__search-icon' }), h('div', { className: 'heys-tab-skeleton__line', 'data-width': 'long' }));
        }

        if (section.kind === 'calendar') {
            return block('heys-tab-skeleton__calendar',
                h('div', { className: 'heys-tab-skeleton__calendar-head' }, repeat(7, (itemIndex) => h('div', { key: itemIndex, className: 'heys-tab-skeleton__calendar-day' }))),
                h('div', { className: 'heys-tab-skeleton__calendar-grid' }, repeat(14, (itemIndex) => h('div', { key: itemIndex, className: 'heys-tab-skeleton__calendar-cell' })))
            );
        }

        if (section.kind === 'gantt') {
            return block('heys-tab-skeleton__gantt', repeat(5, (itemIndex) => h('div', { key: itemIndex, className: 'heys-tab-skeleton__gantt-row' }, h('div', { className: 'heys-tab-skeleton__gantt-label' }), h('div', { className: 'heys-tab-skeleton__gantt-bar', 'data-offset': String(itemIndex % 3) }))));
        }

        if (section.kind === 'timer') {
            return block('heys-tab-skeleton__timer', h('div', { className: 'heys-tab-skeleton__large-ring' }), h('div', { className: 'heys-tab-skeleton__timer-actions' }, h('div', { className: 'heys-tab-skeleton__button' }), h('div', { className: 'heys-tab-skeleton__button' })));
        }

        if (section.kind === 'progress') {
            return block('heys-tab-skeleton__progress', h('div', { className: 'heys-tab-skeleton__progress-fill' }));
        }

        if (section.kind === 'chart') {
            return block(`heys-tab-skeleton__chart heys-tab-skeleton__chart--${section.height || 'sm'}`,
                repeat(7, (itemIndex) => h('div', { key: itemIndex, className: 'heys-tab-skeleton__chart-bar', 'data-height': String((itemIndex % 4) + 1) }))
            );
        }

        return block('heys-tab-skeleton__hero', h('div', { className: 'heys-tab-skeleton__large-ring' }), h('div', { className: 'heys-tab-skeleton__hero-copy' }, h('div', { className: 'heys-tab-skeleton__line', 'data-width': 'medium' }), h('div', { className: 'heys-tab-skeleton__line heys-tab-skeleton__line--muted', 'data-width': 'long' })));
    }

    function buildSkeleton(h, tab, options) {
        const opts = options || {};
        const layout = resolveLayout(tab, opts);
        const embedded = !!opts.embedded;
        const navCount = opts.hasClient ? 7 : 6;
        const classes = [
            'heys-tab-skeleton',
            `heys-tab-skeleton--${layout.tab}`,
            opts.boot ? 'heys-skeleton heys-tab-skeleton--boot' : 'heys-tab-skeleton--runtime',
            embedded ? 'heys-tab-skeleton--embedded' : '',
            opts.className || '',
        ].filter(Boolean).join(' ');

        return h('div', {
            className: classes,
            'data-skeleton-tab': layout.key,
            role: 'status',
            'aria-label': 'Загружаем содержимое вкладки',
            'aria-busy': 'true',
        },
            h('div', { className: 'heys-tab-skeleton__page' },
                !embedded && h('div', { className: 'heys-tab-skeleton__toolbar' },
                    h('div', { className: 'heys-tab-skeleton__brand-line' }),
                    h('div', { className: 'heys-tab-skeleton__toolbar-actions' }, h('div', { className: 'heys-tab-skeleton__toolbar-button' }), h('div', { className: 'heys-tab-skeleton__toolbar-button' }))
                ),
                !embedded && layout.date && h('div', { className: 'heys-tab-skeleton__dates' }, repeat(5, (itemIndex) => h('div', { key: itemIndex, className: 'heys-tab-skeleton__date' + (itemIndex === 2 ? ' is-active' : '') }))),
                h('div', { className: 'heys-tab-skeleton__body' }, layout.sections.map((section, index) => renderSection(h, section, index)))
            ),
            opts.withNav && h('div', { className: 'heys-tab-skeleton__nav', 'aria-hidden': 'true' }, repeat(navCount, (itemIndex) => h('div', { key: itemIndex, className: 'heys-tab-skeleton__nav-item' }, h('div', { className: 'heys-tab-skeleton__nav-icon' }), h('div', { className: 'heys-tab-skeleton__nav-label' }))))
        );
    }

    function createDomFactory(doc) {
        return function domElement(tag, props) {
            const element = doc.createElement(tag);
            const children = Array.prototype.slice.call(arguments, 2).flat(Infinity);
            Object.entries(props || {}).forEach(([name, value]) => {
                if (name === 'key' || value == null || value === false) return;
                if (name === 'className') element.className = value;
                else element.setAttribute(name, value === true ? '' : String(value));
            });
            children.forEach((child) => {
                if (child == null || child === false) return;
                element.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
            });
            return element;
        };
    }

    function renderBootSkeleton(target, context) {
        if (!target || !target.ownerDocument) return null;
        const bootContext = context || readBootContext();
        const node = buildSkeleton(createDomFactory(target.ownerDocument), bootContext.tab, {
            boot: true,
            withNav: true,
            hasClient: bootContext.hasClient,
            tasksSubtab: bootContext.tasksSubtab,
        });
        target.replaceWith(node);
        return node;
    }

    function TabSkeleton(props) {
        const React = props?.React || global.React;
        if (!React?.createElement) return null;
        return buildSkeleton(React.createElement, props?.tab, props);
    }

    function hydrateBootSkeleton() {
        const target = global.document?.querySelector?.('.heys-skeleton[data-heys-boot-skeleton]');
        if (!target || target.dataset.heysSkeletonHydrated === 'true') return null;
        target.dataset.heysSkeletonHydrated = 'true';
        const bootTheme = global.__HEYS_BOOT_THEME__;
        if (bootTheme?.boardDarkNav && global.HEYS?.BootTheme?.syncBodyBoardNav) {
            global.HEYS.BootTheme.syncBodyBoardNav();
        }
        return renderBootSkeleton(target);
    }

    HEYS.AppSkeletons = {
        version: '1.0.0',
        TAB_LAYOUTS,
        TASK_LAYOUTS,
        normalizeTab,
        normalizeTasksSubtab,
        readBootContext,
        resolveLayout,
        buildSkeleton,
        renderBootSkeleton,
        hydrateBootSkeleton,
        TabSkeleton,
    };

    if (global.document) {
        if (global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', hydrateBootSkeleton, { once: true });
        } else {
            hydrateBootSkeleton();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
