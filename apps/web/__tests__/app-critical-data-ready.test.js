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
    expect(storageSource.slice(signOutIndex, signOutIndex + 3000)).toContain(
      'criticalSyncInFlight = null;',
    );
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
    expect(loadingSource).toContain(
      "global.addEventListener('heys:app-content-ready', onAppContentReady, { once: true })",
    );
    expect(loadingSource).toContain("percent: 100, message: 'Готово'");
    expect(loadingSource).toContain("d.phase === 'ready' ? Math.min(99, d.percent)");
  });
});
