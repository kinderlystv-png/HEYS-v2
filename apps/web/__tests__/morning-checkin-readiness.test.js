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
});
