// @vitest-environment node

import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const storageFile = path.resolve(__dirname, '..', 'heys_storage_supabase_v1.js');
const source = fs.readFileSync(storageFile, 'utf8');

function getRunForegroundHotKeySyncSource() {
  const start = source.indexOf('async function runForegroundHotKeySync');
  const end = source.indexOf('async function _runForegroundHotKeySyncLegacy');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Test setup: runForegroundHotKeySync block not found');
  }
  return source.slice(start, end);
}

describe('foreground hot-sync curator auth path', () => {
  const hotSyncSource = getRunForegroundHotKeySyncSource();

  it('treats heys_curator_session as explicit curator auth', () => {
    expect(hotSyncSource).toContain("global.localStorage.getItem('heys_curator_session')");
    expect(hotSyncSource).toContain('const isCuratorMode = hasCuratorSession || (!hasSessionToken && isCuratorLike);');
  });

  it('checks curator markers before session-token markers', () => {
    const curatorIndex = hotSyncSource.indexOf('YandexAPI.getChangeMarkersByCurator');
    // Match the call prefix (not the full arg list) so the L3c revision-checkpoint
    // arg added to getChangeMarkers(_lastMarkerCheckTs, _lastMarkerCheckRevision)
    // does not break the ordering assertion.
    const sessionIndex = hotSyncSource.indexOf('YandexAPI.getChangeMarkers(_lastMarkerCheckTs');

    expect(curatorIndex).toBeGreaterThanOrEqual(0);
    expect(sessionIndex).toBeGreaterThanOrEqual(0);
    expect(curatorIndex).toBeLessThan(sessionIndex);
  });

  it('checks curator batch before session-token batch', () => {
    const curatorIndex = hotSyncSource.indexOf('YandexAPI.getKVBatchByCurator');
    const sessionIndex = hotSyncSource.indexOf('YandexAPI.getKVBatch(clientId, keysToFetch)');

    expect(curatorIndex).toBeGreaterThanOrEqual(0);
    expect(sessionIndex).toBeGreaterThanOrEqual(0);
    expect(curatorIndex).toBeLessThan(sessionIndex);
  });
});

describe('foreground hot-sync overlay tail reassembly (incident 2026-06-03)', () => {
  // HOT-sync applies the main overlay shard but drops tail shards. A product that
  // lands in a tail shard then never reaches the device until a full bootstrap,
  // rendering as a nameless meal item (snapshot fallback). All three hot-sync
  // transports must fold tails into the main row via mergeOverlayRpcTailRawClientRows
  // before calling applyForegroundHotSyncValue.

  it('batch-RPC path reassembles overlay tails before applying', () => {
    expect(source).toContain('mergeOverlayRpcTailRawClientRows(batchResult.data, clientId)');
  });

  it('curator-REST path reassembles overlay tails before applying', () => {
    expect(source).toContain('mergeOverlayRpcTailRawClientRows(rows, clientId)');
  });

  it('legacy getKV path buffers overlay family and reassembles before applying', () => {
    // Overlay-family keys are buffered (they stream in one-by-one) then reassembled.
    expect(source).toContain('_overlayHotBuf.push({ k: key, v: payload.data })');
    expect(source).toContain('mergeOverlayRpcTailRawClientRows(_overlayHotBuf.splice(0), clientId)');
    // Buffer is flushed both within budget and for late arrivals.
    expect(source).toMatch(/updated \+= flushOverlayHotBuf\(\)/);
    expect(source).toMatch(/lateArrivals \+= flushOverlayHotBuf\(\)/);
  });
});

describe('foreground hot-sync server-revision gate', () => {
  it('requires remote revisions after a revision checkpoint is active', () => {
    expect(source).toContain('function isServerRevisionCheckpointActive()');
    expect(source).toContain('requireRemoteRevision: isServerRevisionCheckpointActive()');
  });

  it('records skipped no-revision pulls for diagnostics', () => {
    expect(source).toContain('_serverRevisionGateBlocks');
    expect(source).toContain('checkpoint: Number(_lastMarkerCheckRevision) || 0');
  });
});

describe('client-specific storage allowlist', () => {
  const keysStart = source.indexOf('const CLIENT_SPECIFIC_KEYS = [');
  if (keysStart < 0) {
    throw new Error('Test setup: CLIENT_SPECIFIC_KEYS block not found');
  }
  const keysArea = source.slice(keysStart, keysStart + 3000);

  it.each([
    'heys_meal_presets_v1',
    'heys_suggested_presets_v1',
    'heys_suggested_presets_dismissed_v1',
    'heys_advice_disclaimer_accepted_v1',
  ])('syncs %s as per-client storage', (key) => {
    expect(keysArea).toContain(`'${key}'`);
  });
});
