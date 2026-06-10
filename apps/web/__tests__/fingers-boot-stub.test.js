import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../heys_fingers_boot_stub_v1.js'),
  'utf8'
);

const CID = '12345678-aaaa-bbbb-cccc-1234567890ab';
const OTHER_CID = '87654321-aaaa-bbbb-cccc-1234567890ab';

function evalStub(currentClientId = CID) {
  window.HEYS = {
    currentClientId,
    Fingers: {},
  };
  // eslint-disable-next-line no-new-func
  new Function(SRC)();
  return window.HEYS.Fingers;
}

describe('Fingers boot stub active-session scan', () => {
  let appendSpy;
  let appended;

  beforeEach(() => {
    appended = [];
    window.localStorage.clear();
    delete window.HEYS;
    delete window.__heysSyncCompletedFired;
    appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      appended.push(node);
      return node;
    });
  });

  afterEach(() => {
    appendSpy.mockRestore();
    window.localStorage.clear();
    delete window.HEYS;
    delete window.__heysSyncCompletedFired;
  });

  it('does not lazy-load bundle for another client active-session key', () => {
    window.localStorage.setItem(`heys_${OTHER_CID}_finger_active_session`, '{}');
    evalStub(CID);

    window.dispatchEvent(new Event('heysSyncCompleted'));

    expect(appendSpy).not.toHaveBeenCalled();
    expect(appended).toHaveLength(0);
  });

  it('lazy-loads bundle for current client active-session key', () => {
    window.localStorage.setItem(`heys_${CID}_finger_active_session`, '{}');
    evalStub(CID);

    window.dispatchEvent(new Event('heysSyncCompleted'));

    expect(appended).toHaveLength(1);
    expect(appended[0].src).toContain('heys_fingers_bundle_v1.js');
  });

  it('anonymous context ignores scoped active-session keys', () => {
    window.localStorage.setItem(`heys_${OTHER_CID}_finger_active_session`, '{}');
    evalStub('');

    window.dispatchEvent(new Event('heysSyncCompleted'));

    expect(appended).toHaveLength(0);
  });

  it('anonymous context lazy-loads bundle for the unscoped active-session key', () => {
    window.localStorage.setItem('heys_finger_active_session', '{}');
    evalStub('');

    window.dispatchEvent(new Event('heysSyncCompleted'));

    expect(appended).toHaveLength(1);
  });
});
