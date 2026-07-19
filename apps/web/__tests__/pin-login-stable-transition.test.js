import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const gateSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_app_gate_flow_v1.js'),
  'utf8',
);
const initializerSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_app_initialize_v1.js'),
  'utf8',
);

function decideReactKey({ previousClientId, currentKey, nextClientId }) {
  if (previousClientId === nextClientId) return currentKey;
  if (!previousClientId && nextClientId) return currentKey;
  return nextClientId || '__no_client__';
}

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
    expect(decideReactKey({
      previousClientId: null,
      currentKey: '__no_client__',
      nextClientId: 'client-a',
    })).toBe('__no_client__');
    expect(initializerSource).toContain('if (!previous && next) return;');
  });

  it('still remounts for real client switches and logout', () => {
    expect(decideReactKey({
      previousClientId: 'client-a',
      currentKey: 'client-a',
      nextClientId: 'client-b',
    })).toBe('client-b');
    expect(decideReactKey({
      previousClientId: 'client-a',
      currentKey: 'client-a',
      nextClientId: null,
    })).toBe('__no_client__');
    expect(initializerSource).toContain("setReactKey(next || '__no_client__')");
  });
});
