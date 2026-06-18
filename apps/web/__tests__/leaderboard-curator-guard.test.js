import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;

const modulePath = path.resolve(__dirname, '../heys_leaderboard_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');

function loadLeaderboard() {
  eval(moduleSource);
  return window.HEYS.leaderboard;
}

describe('HEYS.leaderboard curator guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.HEYS = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    window.HEYS = originalHEYS;
  });

  it('does not publish session snapshots for curator sessions', () => {
    localStorage.setItem('heys_curator_session', 'curator.jwt.token');
    localStorage.setItem('heys_leaderboard_sharing', 'true');

    const rpc = vi.fn().mockResolvedValue({ data: {} });
    window.HEYS = {
      YandexAPI: { rpc },
      _lastCrs: { events: [{ type: 'meal' }] },
      CascadeCard: {
        computeCEBMetaFromEvents: () => ({ score: 7.4, pct: 74 }),
      },
    };

    const leaderboard = loadLeaderboard();
    leaderboard.publishSnapshot();
    vi.advanceTimersByTime(6000);

    expect(rpc).not.toHaveBeenCalledWith(
      'publish_leaderboard_snapshot_by_session',
      expect.anything(),
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps sharing toggle local for curator sessions', async () => {
    localStorage.setItem('heys_curator_session', 'curator.jwt.token');

    const rpc = vi.fn().mockResolvedValue({ data: {} });
    window.HEYS = { YandexAPI: { rpc } };

    const leaderboard = loadLeaderboard();
    const result = await leaderboard.toggleSharing(true, 'Client A');

    expect(result).toEqual({ success: true, local_only: true, skipped: 'curator_session' });
    expect(localStorage.getItem('heys_leaderboard_sharing')).toBe('true');
    expect(rpc).not.toHaveBeenCalled();
  });
});
