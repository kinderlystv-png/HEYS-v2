import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertMultiZoneStaging,
  assertUiV4CoordinationStaging,
  getMultiZoneInfo,
  isUiV4CoordinationFile,
  mirrorSourceOf,
} from './check-agent-staging.mjs';
import {
  assertStagedHygiene,
  getDeletedWorkspaceManifests,
  getPartiallyStagedFiles,
  parsePorcelainLines,
} from './check-staged-hygiene.mjs';
import { assertWorkspaceRuntime, REQUIRED_RUNTIME_PACKAGES } from './check-workspace-runtime.mjs';

test('parsePorcelainLines normalizes paths', () => {
  assert.deepEqual(parsePorcelainLines('MM yandex-cloud-functions/heys-mcp/lib/tools.js'), [
    { xy: 'MM', path: 'yandex-cloud-functions/heys-mcp/lib/tools.js' },
  ]);
});

test('getPartiallyStagedFiles detects MM lines', () => {
  const porcelain = [
    'MM yandex-cloud-functions/heys-mcp/lib/tools.js',
    'M  apps/web/heys_day_norm_v1.js',
    ' M apps/web/heys_core_v12.js',
  ].join('\n');
  assert.deepEqual(getPartiallyStagedFiles({ porcelain }), [
    'yandex-cloud-functions/heys-mcp/lib/tools.js',
  ]);
});

test('assertStagedHygiene blocks partial stage on hot MCP files', () => {
  const result = assertStagedHygiene({
    env: {},
    partiallyStaged: ['yandex-cloud-functions/heys-mcp/lib/tools.js'],
    deletedManifests: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.hotPartial.length, 1);
});

test('assertStagedHygiene allows partial stage with override', () => {
  const result = assertStagedHygiene({
    env: { HEYS_ALLOW_PARTIAL_STAGE: '1' },
    partiallyStaged: ['yandex-cloud-functions/heys-mcp/lib/tools.js'],
    deletedManifests: [],
  });
  assert.equal(result.ok, true);
});

test('getDeletedWorkspaceManifests detects deleted package manifests', () => {
  const porcelain = ' D packages/core/package.json\n M package.json';
  assert.deepEqual(getDeletedWorkspaceManifests({ porcelain }), ['packages/core/package.json']);
});

test('assertStagedHygiene blocks deleted workspace manifests', () => {
  const result = assertStagedHygiene({
    env: {},
    partiallyStaged: [],
    deletedManifests: ['packages/shared/package.json'],
  });
  assert.equal(result.ok, false);
  assert.equal(result.deletedBlocked, true);
});

test('assertMultiZoneStaging blocks multiple zones by default', () => {
  const multiZone = {
    zones: ['day', 'security'],
    byZone: [],
  };
  assert.equal(assertMultiZoneStaging({ multiZone, env: {} }).ok, false);
  assert.equal(assertMultiZoneStaging({ multiZone, env: { HEYS_ALLOW_MULTI_ZONE: '1' } }).ok, true);
  assert.equal(assertMultiZoneStaging({ multiZone, env: { HEYS_SHIP: '1' } }).ok, true);
});

test('UI v4 coordination files are blocked in agent mode', () => {
  const files = [
    'apps/web/heys_day_norm_v1.js',
    'docs/ui/UI_V4_FINDINGS.md',
    'scripts/lib/ui-v4-verdicts.mjs',
  ];
  const result = assertUiV4CoordinationStaging({ mode: 'agent', files });
  assert.equal(result.ok, false);
  assert.deepEqual(result.forbidden, [
    'docs/ui/UI_V4_FINDINGS.md',
    'scripts/lib/ui-v4-verdicts.mjs',
  ]);
});

test('UI v4 coordination files are allowed only in integration mode', () => {
  const files = ['docs/implementation/UI_V4_FULL_CONVERGENCE_PROTOCOL.md', 'package.json'];
  assert.equal(assertUiV4CoordinationStaging({ mode: 'integration', files }).ok, true);
  assert.equal(isUiV4CoordinationFile('docs/ui/verdicts/norm-correction.json'), false);
  assert.equal(isUiV4CoordinationFile('docs/implementation/UI_V4_NORM_CORRECTION_HANDOFF.md'), false);
});

function writeFakeRuntimeRoot(rootDir) {
  for (const name of REQUIRED_RUNTIME_PACKAGES) {
    const relative = name.startsWith('@')
      ? path.join('node_modules', name.split('/')[0], name.split('/')[1], 'package.json')
      : path.join('node_modules', name, 'package.json');
    const absolute = path.join(rootDir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, '{}');
  }
  const binDir = path.join(rootDir, 'node_modules', '.bin');
  fs.mkdirSync(binDir, { recursive: true });
  for (const name of ['lint-staged', 'vitest']) {
    fs.writeFileSync(path.join(binDir, name), '');
  }
}

test('assertWorkspaceRuntime passes when required packages exist', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'heys-runtime-'));
  try {
    writeFakeRuntimeRoot(tmp);
    const result = assertWorkspaceRuntime({ rootDir: tmp });
    assert.equal(result.ok, true, JSON.stringify(result));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('assertWorkspaceRuntime reflects broken real tree when packages are missing', () => {
  const result = assertWorkspaceRuntime({ requiredPackages: REQUIRED_RUNTIME_PACKAGES });
  if (result.ok) return;
  assert.ok(result.missingPackages.length > 0 || result.missingBins.length > 0);
});

test('assertWorkspaceRuntime reports missing packages', () => {
  const result = assertWorkspaceRuntime({
    rootDir: process.cwd(),
    env: { HEYS_SKIP_WORKSPACE_RUNTIME: '0' },
    requiredPackages: ['__definitely_missing_package__'],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingPackages, ['__definitely_missing_package__']);
});

test('getMultiZoneInfo returns null for single-zone staged set', async () => {
  const info = await getMultiZoneInfo(['apps/web/heys_day_norm_v1.js']);
  assert.equal(info, null);
});

test('mirrorSourceOf возвращает источник зеркала и null для обычного файла', () => {
  assert.equal(
    mirrorSourceOf('yandex-cloud-functions/heys-mcp/lib/web-mirror/heys_tdee_v1.js'),
    'apps/web/heys_tdee_v1.js',
  );
  assert.equal(
    mirrorSourceOf('yandex-cloud-functions/heys-api-rest/lib/heys_sync_merge_v1.cjs'),
    'apps/web/heys_sync_merge_v1.js',
  );
  assert.equal(mirrorSourceOf('yandex-cloud-functions/heys-api-rpc/index.js'), null);
});

test('зеркало не заводит вторую зону: источник и его копии — один коммит', async () => {
  // Хук зеркал требует их одним коммитом с источником, хук зон запрещал —
  // коммита, проходящего оба, не существовало (29 августа снимали вручную).
  const info = await getMultiZoneInfo([
    'apps/web/heys_sync_merge_v1.js',
    'yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs',
    'yandex-cloud-functions/heys-api-rest/lib/heys_sync_merge_v1.cjs',
  ]);
  assert.equal(info, null);
});

test('getMultiZoneInfo groups multiple zones', async () => {
  const info = await getMultiZoneInfo([
    'apps/web/heys_day_norm_v1.js',
    'yandex-cloud-functions/heys-mcp/lib/tools.js',
  ]);
  assert.ok(info);
  assert.ok(info.zones.includes('day'));
  assert.ok(info.zones.includes('security'));
});
