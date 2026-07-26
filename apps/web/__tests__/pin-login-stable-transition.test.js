import fs from 'fs';
import path from 'path';
import vm from 'vm';

import { describe, expect, it } from 'vitest';

const gateSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_app_gate_flow_v1.js'),
  'utf8',
);
const initializerSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_app_initialize_v1.js'),
  'utf8',
);
const hooksSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_app_hooks_v1.js'),
  'utf8',
);
const storageSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_storage_supabase_v1.js'),
  'utf8',
);

const initializerWindow = { HEYS: {} };
vm.runInNewContext(initializerSource, { window: initializerWindow });
const resolveClientTreeKey = initializerWindow.HEYS.AppInitializer._test.resolveClientTreeKey;

describe('stable PIN-login transition', () => {
  it('keeps the login screen busy until critical data has set the client', () => {
    const promiseIndex = gateSource.indexOf('const criticalReadyPromise = new Promise');
    const setClientIndex = gateSource.indexOf('setClientId(targetClientId);', promiseIndex);
    const resolveIndex = gateSource.indexOf('resolveCriticalReady();', setClientIndex);
    const awaitIndex = gateSource.indexOf('await criticalReadyPromise;', resolveIndex);
    const returnIndex = gateSource.indexOf('return res;', awaitIndex);

    expect(promiseIndex).toBeGreaterThan(-1);
    expect(setClientIndex).toBeGreaterThan(promiseIndex);
    expect(resolveIndex).toBeGreaterThan(setClientIndex);
    expect(awaitIndex).toBeGreaterThan(resolveIndex);
    expect(returnIndex).toBeGreaterThan(awaitIndex);
  });

  it('does not remount the tree on anonymous-to-first-client activation', () => {
    expect(resolveClientTreeKey(null, 'client-a', '__no_client__')).toBe('__no_client__');
    expect(initializerSource).toContain('if (!previousClientId && nextClientId) return currentKey;');
  });

  it('still remounts for real client switches and logout', () => {
    expect(resolveClientTreeKey('client-a', 'client-b', 'client-a')).toBe('client-b');
    expect(resolveClientTreeKey('client-a', null, 'client-a')).toBe('__no_client__');
    expect(initializerSource).toContain('return nextClientId || \'__no_client__\';');
  });

  it('resets the tree and blocks first-activation optimization after logout', () => {
    const alexDayState = { weightMorning: 51.9, sleepStart: '03:30', sleepEnd: '11:10' };
    let currentKey = 'alexandra';
    let mountedDayState = alexDayState;

    const logoutKey = resolveClientTreeKey('alexandra', null, currentKey);
    if (logoutKey !== currentKey) mountedDayState = {};
    currentKey = logoutKey;

    expect(currentKey).toBe('__no_client__');
    expect(mountedDayState).toEqual({});
    expect(storageSource).toContain('if (previousClientId) cloud._clientActivatedThisPage = true;');
    expect(storageSource).toContain("detail: { clientId: null, previousClientId, source: 'logout' }");
    expect(hooksSource).toContain("source: 'logout-fallback'");
    expect(initializerSource).toContain('resolveClientTreeKey(previous, next, currentKey)');
  });
});
