import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const MODULE_PATH = path.resolve(__dirname, '..', 'heys_app_client_state_manager_v1.js');
const MODULE_SOURCE = fs.readFileSync(MODULE_PATH, 'utf8');

function depsChanged(prevDeps, nextDeps) {
    if (!Array.isArray(prevDeps) || !Array.isArray(nextDeps)) {
        return true;
    }

    if (prevDeps.length !== nextDeps.length) {
        return true;
    }

    return nextDeps.some((dep, index) => !Object.is(dep, prevDeps[index]));
}

function createFakeReact() {
    const hookState = [];
    let hookIndex = 0;
    let pendingEffects = [];

    return {
        useRef(initialValue) {
            const currentIndex = hookIndex++;
            if (!hookState[currentIndex]) {
                hookState[currentIndex] = { current: initialValue };
            }
            return hookState[currentIndex];
        },
        useEffect(effect, deps) {
            const currentIndex = hookIndex++;
            const previous = hookState[currentIndex];
            const shouldRun = !previous || depsChanged(previous.deps, deps);
            if (!shouldRun) {
                return;
            }

            pendingEffects.push({
                index: currentIndex,
                effect,
                deps,
                cleanup: previous?.cleanup,
            });
        },
        render(renderFn) {
            hookIndex = 0;
            const result = renderFn();
            const effectsToRun = pendingEffects;
            pendingEffects = [];

            for (const entry of effectsToRun) {
                if (typeof entry.cleanup === 'function') {
                    entry.cleanup();
                }

                const cleanup = entry.effect();
                hookState[entry.index] = {
                    deps: entry.deps,
                    cleanup: typeof cleanup === 'function' ? cleanup : undefined,
                };
            }

            return result;
        },
    };
}

function loadHook() {
    const window = { HEYS: {} };
    const context = vm.createContext({
        window,
        console,
        setTimeout,
        clearTimeout,
    });

    new vm.Script(MODULE_SOURCE, { filename: MODULE_PATH }).runInContext(context);

    return {
        React: createFakeReact(),
        hook: window.HEYS.AppClientStateManager.useClientStateManager,
    };
}

function createProps(React, overrides = {}) {
    return {
        React,
        clientId: null,
        defaultTab: 'tasks',
        setTab: () => { },
        setTabImmediate: () => { },
        setProducts: () => { },
        setSyncVer: () => { },
        ...overrides,
    };
}

describe('HEYS AppClientStateManager defaultTab switching', () => {
    it('switches to default tab only when clientId changes', () => {
        const { React, hook } = loadHook();
        const tabSwitches = [];
        const props = createProps(React, {
            setTabImmediate: (tab) => tabSwitches.push(tab),
        });

        React.render(() => hook(props));
        expect(tabSwitches).toEqual([]);

        props.clientId = 'client-1';
        React.render(() => hook(props));
        expect(tabSwitches).toEqual(['tasks']);

        props.defaultTab = 'diary';
        React.render(() => hook(props));
        expect(tabSwitches).toEqual(['tasks']);

        props.clientId = 'client-2';
        React.render(() => hook(props));
        expect(tabSwitches).toEqual(['tasks', 'diary']);
    });

    it('does not auto-switch when defaultTab changes for the same client', () => {
        const { React, hook } = loadHook();
        const tabSwitches = [];
        const props = createProps(React, {
            clientId: 'client-42',
            defaultTab: 'tasks',
            setTabImmediate: (tab) => tabSwitches.push(tab),
        });

        React.render(() => hook(props));
        expect(tabSwitches).toEqual([]);

        props.defaultTab = 'widgets';
        React.render(() => hook(props));

        expect(tabSwitches).toEqual([]);
    });
});
