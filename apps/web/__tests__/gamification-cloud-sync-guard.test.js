// Regression coverage for fail-closed gamification cloud sync.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'heys_gamification_v1.js'), 'utf8');

const rpc = vi.fn();
const mergeSaveKV = vi.fn();

describe('gamification cloud sync guard', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    globalThis.window.HEYS = globalThis.HEYS = {
      utils: { getCurrentClientId: () => '11111111-1111-4111-8111-111111111111' },
      auth: {
        getSessionToken: () => 'session-token',
        isCuratorSession: () => false
      },
      YandexAPI: {
        rpc,
        mergeSaveKV,
        getCuratorToken: () => null
      }
    };
    // eslint-disable-next-line no-eval
    eval(SOURCE);
    globalThis.HEYS.game.cancelAllPendingFlushes();
  });

  beforeEach(() => {
    rpc.mockReset();
    mergeSaveKV.mockReset();
    globalThis.localStorage.clear();
    globalThis.HEYS.game.reset();
    globalThis.HEYS.game.cancelAllPendingFlushes();
    vi.clearAllTimers();
  });

  afterAll(() => {
    globalThis.HEYS.game.cancelAllPendingFlushes();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('blocks the write when cloud precheck returns an error', async () => {
    const localBefore = globalThis.localStorage.getItem('heys_game');
    rpc.mockResolvedValue({ error: { message: 'network_down' } });

    await expect(globalThis.HEYS.game.syncToCloud()).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mergeSaveKV).not.toHaveBeenCalled();
    expect(globalThis.localStorage.getItem('heys_game')).toBe(localBefore);
  });

  it('blocks the write when cloud precheck throws', async () => {
    rpc.mockRejectedValue(new Error('timeout'));

    await expect(globalThis.HEYS.game.syncToCloud()).resolves.toBe(false);
    expect(mergeSaveKV).not.toHaveBeenCalled();
  });

  it('writes through merge-save instead of direct upsert after a valid precheck', async () => {
    rpc.mockResolvedValue({ data: { success: true, found: false, value: null } });
    mergeSaveKV.mockImplementation(async (_clientId, _key, value) => ({
      success: true,
      v: value,
      outcome: 'incoming_wins'
    }));

    await expect(globalThis.HEYS.game.syncToCloud()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('get_client_kv_by_session');
    expect(mergeSaveKV).toHaveBeenCalledTimes(1);
    expect(mergeSaveKV.mock.calls[0][1]).toBe('heys_game');
  });

  it('keeps the merged local state for an explicit idempotent retry without a loop', async () => {
    const timerCountBefore = vi.getTimerCount();
    rpc.mockResolvedValue({
      data: {
        success: true,
        found: true,
        value: { totalXP: 0, updatedAt: 1 }
      }
    });
    mergeSaveKV.mockResolvedValue({
      success: true,
      v: { totalXP: 0, updatedAt: Date.now() + 1 },
      outcome: 'stale_write_blocked'
    });

    await expect(globalThis.HEYS.game.syncToCloud()).resolves.toBe(false);
    expect(mergeSaveKV).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(timerCountBefore);

    const mergedLocal = JSON.parse(globalThis.localStorage.getItem('heys_game'));
    rpc.mockResolvedValue({
      data: {
        success: true,
        found: true,
        value: mergedLocal
      }
    });
    mergeSaveKV.mockImplementation(async (_clientId, _key, value) => ({
      success: true,
      v: value,
      outcome: 'incoming_wins'
    }));

    await expect(globalThis.HEYS.game.syncToCloud()).resolves.toBe(true);
    expect(mergeSaveKV).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(timerCountBefore);
  });
});
