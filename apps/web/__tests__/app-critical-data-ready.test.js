import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const storageSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_storage_supabase_v1.js'),
  'utf8',
);
const authSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_app_auth_init_v1.js'),
  'utf8',
);
const rootSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_app_root_impl_v1.js'),
  'utf8',
);
const loadingSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_loading_progress_v1.js'),
  'utf8',
);

describe('stable first-frame readiness contract', () => {
  it('marks critical data ready for the client before dispatching Phase A', () => {
    const markerIndex = storageSource.indexOf('criticalSyncReadyClientId = client_id;');
    const phaseADispatchIndex = storageSource.indexOf(
      "detail: { clientId: client_id, phaseA: true }",
    );

    expect(markerIndex).toBeGreaterThan(-1);
    expect(phaseADispatchIndex).toBeGreaterThan(markerIndex);
    expect(storageSource).toContain('cloud.isCriticalSyncReady = function (clientId)');
  });

  it('resets client-scoped readiness on sign-out', () => {
    const signOutIndex = storageSource.indexOf('cloud.signOut = function ()');
    const readinessResetIndex = storageSource.indexOf(
      'criticalSyncReadyClientId = null;',
      signOutIndex,
    );

    expect(signOutIndex).toBeGreaterThan(-1);
    expect(readinessResetIndex).toBeGreaterThan(signOutIndex);
    // Границу берём по концу функции, а не окном в 3000 символов: комментарии
    // внутри signOut растут, и фиксированное окно однажды отрежет проверяемое.
    const signOutBody = storageSource.slice(
      signOutIndex,
      storageSource.indexOf('\n  };', signOutIndex),
    );
    expect(signOutBody).toContain('criticalSyncInFlight = null;');
  });

  it('hydrates critical keys before a persisted-cursor delta tail', () => {
    const deltaGateIndex = storageSource.indexOf(
      'await cloud.ensureCriticalSyncReady(client_id)',
    );
    const deltaLogIndex = storageSource.indexOf(
      '[DELTA FAST-PATH] Direct fetch',
      deltaGateIndex,
    );

    expect(deltaGateIndex).toBeGreaterThan(-1);
    expect(deltaLogIndex).toBeGreaterThan(deltaGateIndex);
    expect(storageSource).toContain("source: 'critical-first-frame'");
    expect(storageSource).toContain('activeClientId !== clientId');
  });

  it('does not use a persisted sync timestamp as a first-render readiness gate', () => {
    expect(authSource).toContain('cloudRef.isCriticalSyncReady?.(pinAuthClient)');
    expect(authSource).not.toContain('Optimistic mount (has prior sync, last_sync_ts present)');
    expect(authSource).toContain('}, 8000);');
  });

  it('keeps the boot loader until a real React screen is committed', () => {
    expect(rootSource).toContain("new CustomEvent('heys:app-content-ready'");
    expect(rootSource).toContain('isInitializing || (!clientId && !gate)');
    expect(loadingSource).toContain("global.addEventListener('heys:app-content-ready'");
    expect(loadingSource).toContain("state.message = 'Готово'");
    expect(loadingSource).toContain('const STALL_MS = 60000');
  });

  it('loads effective dayv2 keys in Phase A (night threshold, not calendar date only)', () => {
    expect(storageSource).toContain('function getEffectiveTodayISO()');
    expect(storageSource).toContain('function getSyncPriorityDayv2Keys()');
    expect(storageSource).toContain('...getSyncPriorityDayv2Keys()');
    const criticalFn = storageSource.slice(
      storageSource.indexOf('function getCriticalFirstFrameKeys()'),
      storageSource.indexOf('function getForegroundHotSyncKeys'),
    );
    expect(criticalFn).not.toContain('toISOString().slice(0, 10)');
  });
});
