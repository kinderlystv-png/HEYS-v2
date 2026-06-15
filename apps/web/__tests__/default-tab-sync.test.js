import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalDEV = window.DEV;

function depsChanged(prevDeps, nextDeps) {
    if (!prevDeps || !nextDeps) return true;
    if (prevDeps.length !== nextDeps.length) return true;
    return nextDeps.some((dep, index) => dep !== prevDeps[index]);
}

function createFakeReact() {
    const state = [];
    const refs = [];
    const effects = [];
    let stateCursor = 0;
    let refCursor = 0;
    let effectCursor = 0;

    return {
        beginRender() {
            stateCursor = 0;
            refCursor = 0;
            effectCursor = 0;
        },
        startTransition(fn) {
            fn();
        },
        useState(initialValue) {
            const index = stateCursor++;
            if (!(index in state)) {
                state[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
            }
            const setState = (nextValue) => {
                state[index] = typeof nextValue === 'function' ? nextValue(state[index]) : nextValue;
            };
            return [state[index], setState];
        },
        useRef(initialValue) {
            const index = refCursor++;
            if (!(index in refs)) {
                refs[index] = { current: initialValue };
            }
            return refs[index];
        },
        useEffect(effect, deps) {
            const index = effectCursor++;
            const prev = effects[index];
            if (!prev || depsChanged(prev.deps, deps)) {
                if (prev?.cleanup) prev.cleanup();
                const cleanup = effect() || undefined;
                effects[index] = {
                    deps: Array.isArray(deps) ? [...deps] : null,
                    cleanup,
                };
            }
        },
        useCallback(fn) {
            return fn;
        },
        cleanup() {
            effects.forEach((entry) => entry?.cleanup?.());
            effects.length = 0;
        },
    };
}

function createProfileUtils(initialProfile = {}) {
    let profile = { ...initialProfile };

    return {
        utils: {
            lsGet: vi.fn((key, fallback) => {
                if (key === 'heys_profile') return { ...profile };
                return fallback;
            }),
            lsSet: vi.fn((key, value) => {
                if (key === 'heys_profile') {
                    profile = { ...value };
                }
            }),
        },
        getProfile: () => ({ ...profile }),
        setProfile: (nextProfile) => {
            profile = { ...nextProfile };
        },
    };
}

function loadTabStateModule() {
    const filePath = path.resolve(__dirname, '../heys_app_tab_state_v1.js');
    const source = fs.readFileSync(filePath, 'utf8');
    eval(source);
}

function renderTabState(fakeReact) {
    fakeReact.beginRender();
    return window.HEYS.AppTabState.useTabState({ React: fakeReact });
}

function mountTabState(fakeReact) {
    renderTabState(fakeReact);
    return renderTabState(fakeReact);
}

describe('HEYS default tab sync regression', () => {
    let fakeReact;
    let profileStore;

    beforeEach(() => {
        fakeReact = createFakeReact();
        profileStore = createProfileUtils({ defaultTab: 'tasks', defaultTasksSubtab: 'calendar' });

        window.DEV = {};
        window.HEYS = {
            utils: profileStore.utils,
            cloud: {},
        };
        window.React = fakeReact;

        loadTabStateModule();
    });

    afterEach(() => {
        fakeReact?.cleanup?.();
        window.HEYS = originalHEYS;
        window.React = originalReact;
        window.DEV = originalDEV;
        vi.restoreAllMocks();
    });

    it('marks pending sync flag and stores defaultTab when widgets change home tab', () => {
        let tabState = mountTabState(fakeReact);

        tabState.setDefaultTab('diary');
        tabState = renderTabState(fakeReact);

        expect(profileStore.utils.lsSet).toHaveBeenCalledWith('heys_profile', expect.objectContaining({ defaultTab: 'diary' }));
        expect(window.HEYS._pendingProfileSyncFlags?.defaultTab).toEqual(expect.objectContaining({ requestedTab: 'diary' }));
        expect(tabState.defaultTab).toBe('diary');
    });

    it('stores defaultTasksSubtab when tasks are chosen as home with a nested target', () => {
        let tabState = mountTabState(fakeReact);

        tabState.setDefaultTab('tasks', { tasksSubtab: 'checklists' });
        tabState = renderTabState(fakeReact);

        expect(profileStore.utils.lsSet).toHaveBeenCalledWith('heys_profile', expect.objectContaining({
            defaultTab: 'tasks',
            defaultTasksSubtab: 'checklists',
        }));
        expect(window.HEYS._pendingProfileSyncFlags?.defaultTab).toEqual(expect.objectContaining({
            requestedTab: 'tasks',
            requestedTasksSubtab: 'checklists',
        }));
        expect(tabState.defaultTasksSubtab).toBe('checklists');
        expect(window.HEYS.App.getDefaultTasksSubtab()).toBe('checklists');
    });

    it('follows synced defaultTab when current tab still matches stale startup tab', () => {
        let tabState = mountTabState(fakeReact);

        expect(tabState.defaultTab).toBe('tasks');
        expect(tabState.tab).toBe('tasks');

        profileStore.setProfile({ defaultTab: 'diary' });
        window.dispatchEvent(new CustomEvent('heys:profile-updated', {
            detail: {
                field: 'defaultTab',
                fields: ['defaultTab'],
                source: 'foreground-hot-sync',
            },
        }));

        tabState = renderTabState(fakeReact);

        expect(tabState.defaultTab).toBe('diary');
        expect(tabState.tab).toBe('diary');
    });

    it('re-reads defaultTasksSubtab from profile updates', () => {
        let tabState = mountTabState(fakeReact);

        expect(tabState.defaultTab).toBe('tasks');
        expect(tabState.defaultTasksSubtab).toBe('calendar');

        profileStore.setProfile({ defaultTab: 'tasks', defaultTasksSubtab: 'context' });
        window.dispatchEvent(new CustomEvent('heys:profile-updated', {
            detail: {
                field: 'defaultTasksSubtab',
                fields: ['defaultTasksSubtab'],
                source: 'foreground-hot-sync',
            },
        }));

        tabState = renderTabState(fakeReact);

        expect(tabState.defaultTab).toBe('tasks');
        expect(tabState.defaultTasksSubtab).toBe('calendar');
        expect(tabState.tab).toBe('tasks');
    });

    it('does not override manually switched tab on synced defaultTab update', () => {
        let tabState = mountTabState(fakeReact);

        tabState.setTab('stats');
        tabState = renderTabState(fakeReact);

        expect(tabState.tab).toBe('stats');
        expect(tabState.defaultTab).toBe('tasks');

        profileStore.setProfile({ defaultTab: 'diary' });
        window.dispatchEvent(new CustomEvent('heys:profile-updated', {
            detail: {
                field: 'defaultTab',
                fields: ['defaultTab'],
                source: 'foreground-hot-sync',
            },
        }));

        tabState = renderTabState(fakeReact);

        expect(tabState.defaultTab).toBe('diary');
        expect(tabState.tab).toBe('stats');
    });
});
