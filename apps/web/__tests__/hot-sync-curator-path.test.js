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
    const sessionIndex = hotSyncSource.indexOf('YandexAPI.getChangeMarkers(_lastMarkerCheckTs)');

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
