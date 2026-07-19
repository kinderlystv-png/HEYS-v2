import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appMorningSource = fs.readFileSync(path.resolve(__dirname, '../heys_app_morning_checkin_v1.js'), 'utf8');

const originalHEYS = window.HEYS;
const originalReact = window.React;

function loadAppMorningCheckin() {
    // eslint-disable-next-line no-eval
    (0, eval)(appMorningSource);
}

function createReactStub(setterSpy, cleanups) {
    return {
        useState: (initial) => [initial, setterSpy],
        useRef: (value) => ({ current: value }),
        useEffect: (fn) => {
            const cleanup = fn();
            if (typeof cleanup === 'function') cleanups.push(cleanup);
        },
    };
}

describe('morning check-in required module readiness', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        window.localStorage.clear();
        window.HEYS = {
            _consentsValid: true,
            utils: {
                getCurrentClientId: () => 'client-1',
                lsGet: () => ({}),
            },
            ProfileSteps: {
                isProfileIncomplete: () => false,
            },
            shouldShowMorningCheckin: vi.fn(() => true),
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        window.localStorage.clear();
        window.HEYS = originalHEYS;
        window.React = originalReact;
    });

    it('preserves an opened flow during a transient consent re-check', () => {
        const setter = vi.fn();
        const cleanups = [];
        const React = createReactStub(setter, cleanups);
        window.React = React;

        loadAppMorningCheckin();
        window.HEYS.AppMorningCheckin.useMorningCheckinSync({
            React,
            isInitializing: false,
            clientId: 'client-1',
        });

        window.HEYS._consentsValid = false;
        window.dispatchEvent(new CustomEvent('heys:consents-state-changed'));

        expect(setter).not.toHaveBeenCalled();
        cleanups.forEach((fn) => fn());
    });

    it('defers the shouldShow decision until YesterdayVerify is ready', () => {
        const setter = vi.fn();
        const cleanups = [];
        const React = createReactStub(setter, cleanups);
        window.React = React;

        loadAppMorningCheckin();
        window.HEYS.AppMorningCheckin.useMorningCheckinSync({
            React,
            isInitializing: false,
            clientId: 'client-1',
        });

        window.dispatchEvent(new CustomEvent('heysSyncCompleted', {
            detail: { clientId: 'client-1' },
        }));
        vi.advanceTimersByTime(250);

        expect(window.HEYS.shouldShowMorningCheckin).not.toHaveBeenCalled();
        expect(setter).not.toHaveBeenCalled();

        window.HEYS.YesterdayVerifyReady = true;
        window.HEYS.YesterdayVerify = { shouldShow: vi.fn(() => true), stepRegistered: true };
        window.dispatchEvent(new CustomEvent('heys-yesterday-verify-ready'));

        expect(window.HEYS.shouldShowMorningCheckin).toHaveBeenCalledTimes(1);
        expect(setter).toHaveBeenCalledTimes(1);

        cleanups.forEach((fn) => fn());
    });

    it('force-loads required lazy chunks instead of waiting for browser idle time', () => {
        const setter = vi.fn();
        const cleanups = [];
        const React = createReactStub(setter, cleanups);
        window.React = React;
        window.HEYS.shouldShowMorningCheckin = undefined;
        window.HEYS.__loadPostboot3Ui = vi.fn(() => Promise.resolve());
        window.HEYS.__loadPostboot1Game = vi.fn(() => Promise.resolve());

        loadAppMorningCheckin();
        window.HEYS.AppMorningCheckin.useMorningCheckinSync({
            React,
            isInitializing: false,
            clientId: 'client-1',
        });

        window.dispatchEvent(new CustomEvent('heysSyncCompleted', {
            detail: { clientId: 'client-1', phase: 'full' },
        }));
        vi.advanceTimersByTime(250);

        expect(window.HEYS.__loadPostboot3Ui).toHaveBeenCalledTimes(1);
        expect(window.HEYS.__loadPostboot1Game).toHaveBeenCalledTimes(1);
        expect(setter).not.toHaveBeenCalled();
        cleanups.forEach((fn) => fn());
    });

    it('does not build the plan from consents or Phase A before the full client sync', () => {
        const setter = vi.fn();
        const cleanups = [];
        const React = createReactStub(setter, cleanups);
        window.React = React;
        window.HEYS.YesterdayVerifyReady = true;
        window.HEYS.YesterdayVerify = { shouldShow: vi.fn(() => true), stepRegistered: true };

        loadAppMorningCheckin();
        window.HEYS.AppMorningCheckin.useMorningCheckinSync({
            React,
            isInitializing: false,
            clientId: 'client-1',
        });

        window.dispatchEvent(new CustomEvent('heys:consents-state-changed'));
        window.dispatchEvent(new CustomEvent('heysSyncCompleted', {
            detail: { clientId: 'client-1', phaseA: true },
        }));
        vi.advanceTimersByTime(250);
        expect(window.HEYS.shouldShowMorningCheckin).not.toHaveBeenCalled();

        window.dispatchEvent(new CustomEvent('heysSyncCompleted', {
            detail: { clientId: 'client-1', phase: 'full' },
        }));
        vi.advanceTimersByTime(250);

        expect(window.HEYS.shouldShowMorningCheckin).toHaveBeenCalledTimes(1);
        expect(setter).toHaveBeenCalledTimes(1);
        cleanups.forEach((fn) => fn());
    });

    it('resumes only an existing unfinished flow from the offline consent cache', () => {
        const setter = vi.fn();
        const cleanups = [];
        const React = createReactStub(setter, cleanups);
        window.React = React;
        window.HEYS.YesterdayVerifyReady = true;
        window.HEYS.YesterdayVerify = { shouldShow: vi.fn(() => true), stepRegistered: true };
        window.HEYS.MorningCheckinUtils = {
            getMorningCheckinStatus: vi.fn(() => ({
                flowId: 'flow-1',
                state: 'in_progress',
            })),
        };

        loadAppMorningCheckin();
        window.HEYS.AppMorningCheckin.useMorningCheckinSync({
            React,
            isInitializing: false,
            clientId: 'client-1',
        });

        window.dispatchEvent(new CustomEvent('heys:consents-state-changed', {
            detail: { source: 'offline-consent-cache' },
        }));
        vi.advanceTimersByTime(1);

        expect(window.HEYS.MorningCheckinUtils.getMorningCheckinStatus).toHaveBeenCalled();
        expect(window.HEYS.shouldShowMorningCheckin).toHaveBeenCalledTimes(1);
        expect(setter).toHaveBeenCalledWith(expect.any(Function));
        cleanups.forEach((fn) => fn());
    });
});
