import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const SRC = fs.readFileSync(path.resolve(__dirname, '../heys_curator_panel_v1.js'), 'utf8');

let persistDecision;

beforeEach(() => {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(SRC);
  persistDecision = window.HEYS.CuratorPanel.persistDecision;
});

function input(mergeSaveKV) {
  return {
    api: { mergeSaveKV },
    NC: { HISTORY_KEY: 'heys_norm_correction_history' },
    clientId: 'client-1',
    historyPatch: { '2026-W36': { factor: 0.95 } },
    profilePatch: { normCorrectionFactor: 0.95 }
  };
}

describe('CuratorPanel.persistDecision', () => {
  it.each([
    ['returns success:false', async () => ({ success: false, error: 'history rejected' })],
    ['throws', async () => { throw new Error('history unavailable'); }]
  ])('does not write the profile when the history write %s', async (_case, historyFailure) => {
    const mergeSaveKV = vi.fn(historyFailure);

    const result = await persistDecision(input(mergeSaveKV));

    expect(result).toMatchObject({ success: false, stage: 'history' });
    expect(mergeSaveKV).toHaveBeenCalledTimes(1);
    expect(mergeSaveKV).toHaveBeenCalledWith(
      'client-1',
      'heys_norm_correction_history',
      { '2026-W36': { factor: 0.95 } }
    );
  });

  it.each([
    ['returns success:false', async () => ({ success: false, error: 'profile rejected' })],
    ['throws', async () => { throw new Error('profile unavailable'); }]
  ])('returns a profile failure when the profile write %s', async (_case, profileFailure) => {
    const mergeSaveKV = vi.fn()
      .mockResolvedValueOnce({ success: true })
      .mockImplementationOnce(profileFailure);

    const result = await persistDecision(input(mergeSaveKV));

    expect(result).toMatchObject({ success: false, stage: 'profile' });
    expect(mergeSaveKV).toHaveBeenCalledTimes(2);
    expect(mergeSaveKV).toHaveBeenNthCalledWith(
      2,
      'client-1',
      'heys_profile',
      { normCorrectionFactor: 0.95 }
    );
  });

  it('returns success only after both writes succeed', async () => {
    const mergeSaveKV = vi.fn().mockResolvedValue({ success: true });

    const result = await persistDecision(input(mergeSaveKV));

    expect(result).toEqual({ success: true });
    expect(mergeSaveKV).toHaveBeenCalledTimes(2);
    expect(mergeSaveKV.mock.calls.map(([, key]) => key)).toEqual([
      'heys_norm_correction_history',
      'heys_profile'
    ]);
  });
});
