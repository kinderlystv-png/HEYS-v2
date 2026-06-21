import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;

function depsChanged(prevDeps, nextDeps) {
    if (!prevDeps || !nextDeps) return true;
    if (prevDeps.length !== nextDeps.length) return true;
    return nextDeps.some((dep, index) => dep !== prevDeps[index]);
}

function createFakeReact() {
    const state = [];
    const effects = [];
    const memos = [];
    let stateCursor = 0;
    let effectCursor = 0;
    let memoCursor = 0;

    return {
        beginRender() {
            stateCursor = 0;
            effectCursor = 0;
            memoCursor = 0;
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
        useMemo(factory, deps) {
            const index = memoCursor++;
            const prev = memos[index];
            if (!prev || depsChanged(prev.deps, deps)) {
                const value = factory();
                memos[index] = {
                    deps: Array.isArray(deps) ? [...deps] : null,
                    value,
                };
                return value;
            }
            return prev.value;
        },
        cleanup() {
            effects.forEach((entry) => entry?.cleanup?.());
            effects.length = 0;
        },
    };
}

function createProfileStore(initialProfile) {
    let profile = { ...initialProfile };
    return {
        utils: {
            lsGet: vi.fn((key, fallback) => {
                if (key === 'heys_profile') return { ...profile };
                return fallback;
            }),
        },
        setProfile(nextProfile) {
            profile = { ...nextProfile };
        },
    };
}

function loadDerivedStateModule() {
    const filePath = path.resolve(__dirname, '../heys_app_derived_state_v1.js');
    const source = fs.readFileSync(filePath, 'utf8');
    eval(source);
}

function renderDerivedState(fakeReact, profileStore) {
    fakeReact.beginRender();
    return window.HEYS.AppDerivedState.useAppDerivedState({
        React: fakeReact,
        pendingDetails: null,
        clients: [],
        clientId: 'client-1',
        needsConsent: false,
        checkingConsent: false,
        complianceState: null,
        showMorningCheckin: false,
        U: profileStore.utils,
        cloud: { isPinAuthClient: () => true },
    });
}

describe('HEYS app derived state profile name sync', () => {
    let fakeReact;
    let profileStore;

    beforeEach(() => {
        fakeReact = createFakeReact();
        profileStore = createProfileStore({ firstName: 'Пупс', lastName: '' });
        window.HEYS = {
            utils: profileStore.utils,
        };
        loadDerivedStateModule();
    });

    afterEach(() => {
        fakeReact.cleanup();
        window.HEYS = originalHEYS;
        vi.restoreAllMocks();
    });

    it('re-reads profile name for the header when profile-updated fires', () => {
        let derived = renderDerivedState(fakeReact, profileStore);
        expect(derived.currentClientName).toBe('Пупс');

        profileStore.setProfile({ firstName: 'Пупсик', lastName: 'тестовый' });
        window.dispatchEvent(new CustomEvent('heys:profile-updated', {
            detail: { clientId: 'client-1', fields: ['firstName', 'lastName'] },
        }));

        derived = renderDerivedState(fakeReact, profileStore);
        expect(derived.currentClientName).toBe('Пупсик тестовый');
    });
});
