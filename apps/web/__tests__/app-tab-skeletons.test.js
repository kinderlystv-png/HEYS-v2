import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import ReactDOM from 'react-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const originalReact = window.React;

function loadSkeletonModule() {
    const filePath = path.resolve(__dirname, '../heys_app_skeletons_v1.js');
    const source = fs.readFileSync(filePath, 'utf8');
    eval(source);
    return window.HEYS.AppSkeletons;
}

describe('HEYS tab-aware skeleton layouts', () => {
    beforeEach(() => {
        window.HEYS = {};
        window.React = React;
        window.localStorage.clear();
        document.body.innerHTML = '<div id="root"><div class="heys-skeleton" data-heys-boot-skeleton="true"></div></div>';
    });

    afterEach(() => {
        window.localStorage.clear();
        document.body.innerHTML = '';
        window.HEYS = originalHEYS;
        window.React = originalReact;
    });

    it('uses the current client scoped home tab for the boot skeleton', () => {
        window.localStorage.setItem('heys_client_current', JSON.stringify('client-1'));
        window.localStorage.setItem('heys_profile', JSON.stringify({ defaultTab: 'diary' }));
        window.localStorage.setItem('heys_client-1_profile', JSON.stringify({
            defaultTab: 'tasks',
            defaultTasksSubtab: 'chrono',
        }));

        const skeletons = loadSkeletonModule();
        const context = skeletons.readBootContext();
        const bootSkeleton = document.querySelector('.heys-tab-skeleton');

        expect(context).toEqual({ tab: 'tasks', tasksSubtab: 'chrono', hasClient: true });
        expect(bootSkeleton?.dataset.skeletonTab).toBe('tasks-chrono');
        expect(bootSkeleton?.querySelector('.heys-tab-skeleton__timer')).not.toBeNull();
        expect(bootSkeleton?.querySelectorAll('.heys-tab-skeleton__nav-item')).toHaveLength(7);
    });

    it('reads ?tab=board for the board client boot context', () => {
        const BOARD_CLIENT_ID = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
        window.localStorage.setItem('heys_client_current', JSON.stringify(BOARD_CLIENT_ID));
        window.localStorage.setItem('heys_profile', JSON.stringify({ defaultTab: 'diary' }));
        window.history.replaceState({}, '', '/?tab=board');

        const skeletons = loadSkeletonModule();

        expect(skeletons.readBootContext()).toEqual({
            tab: 'fallback',
            tasksSubtab: 'calendar',
            hasClient: true,
        });
    });

    it('keeps distinct compositions for the main loading tabs', () => {
        const skeletons = loadSkeletonModule();
        const tabs = ['diary', 'stats', 'activity', 'widgets', 'insights', 'ration', 'user'];
        const signatures = tabs.map((tab) => (
            skeletons.resolveLayout(tab).sections.map((section) => section.kind).join('|')
        ));

        expect(new Set(signatures).size).toBe(tabs.length);
        expect(skeletons.resolveLayout('diary').sections.at(-1)).toMatchObject({ kind: 'list', count: 6 });
        expect(skeletons.resolveLayout('widgets').sections[0]).toMatchObject({ kind: 'widget-grid' });
        expect(skeletons.resolveLayout('user').sections.filter((section) => section.kind === 'settings')).toHaveLength(3);
    });

    it('uses the requested tasks subtab and a safe full-page fallback', () => {
        const skeletons = loadSkeletonModule();

        expect(skeletons.resolveLayout('tasks', { tasksSubtab: 'gantt' })).toMatchObject({ key: 'tasks-gantt' });
        expect(skeletons.resolveLayout('tasks', { tasksSubtab: 'unknown' })).toMatchObject({ key: 'tasks-calendar' });
        expect(skeletons.resolveLayout('unknown')).toMatchObject({ key: 'fallback', tab: 'fallback' });

        const fallbackElement = skeletons.TabSkeleton({ tab: 'unknown', React });
        expect(fallbackElement.props['data-skeleton-tab']).toBe('fallback');
        expect(fallbackElement.props['aria-busy']).toBe('true');
    });

    it('embedded runtime skeleton skips duplicate shell chrome', () => {
        const skeletons = loadSkeletonModule();
        const mount = document.createElement('div');
        document.body.appendChild(mount);

        ReactDOM.render(
            React.createElement(skeletons.TabSkeleton, { tab: 'activity', embedded: true, React }),
            mount
        );

        expect(mount.querySelector('.heys-tab-skeleton--embedded')).not.toBeNull();
        expect(mount.querySelector('.heys-tab-skeleton__toolbar')).toBeNull();
        expect(mount.querySelector('.heys-tab-skeleton__dates')).toBeNull();
        expect(mount.querySelector('.heys-tab-skeleton__hero')).not.toBeNull();

        ReactDOM.unmountComponentAtNode(mount);
        mount.remove();
    });
});
