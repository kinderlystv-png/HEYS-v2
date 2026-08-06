import assert from 'node:assert/strict';
import test from 'node:test';

import {
  affectedBundlesFromSources,
  bundleNameFromGeneratedPath,
  classifyDirtyGenerated,
} from './legacy-generated-baseline.mjs';
import { parseCommitMessage } from './ship.mjs';

test('bundleNameFromGeneratedPath reads hashed public bundles', () => {
  assert.equal(
    bundleNameFromGeneratedPath('apps/web/public/boot-core.bundle.c10a1eb60f3a.js'),
    'boot-core',
  );
  assert.equal(
    bundleNameFromGeneratedPath('apps/web/public/boot-core.bundle.c10a1eb60f3a.js.gz'),
    'boot-core',
  );
  assert.equal(bundleNameFromGeneratedPath('apps/web/index.html'), null);
});

test('classifyDirtyGenerated owns only rebuild scope of staged sources', () => {
  const staged = ['apps/web/heys_storage_supabase_v1.js', 'apps/web/heys_sync_merge_v1.js'];
  const dirty = [
    'apps/web/public/boot-core.bundle.aaaaaaaaaaaa.js',
    'apps/web/public/boot-core.bundle.aaaaaaaaaaaa.js.gz',
    'apps/web/bundle-manifest.json',
    'apps/web/index.html',
    'apps/web/public/postboot-1-game-lazy.bundle.bbbbbbbbbbbb.js',
  ];

  const { owned, foreign, bundles } = classifyDirtyGenerated(dirty, staged);
  assert.ok(bundles.includes('boot-core'));
  assert.deepEqual(
    owned.sort(),
    [
      'apps/web/bundle-manifest.json',
      'apps/web/index.html',
      'apps/web/public/boot-core.bundle.aaaaaaaaaaaa.js',
      'apps/web/public/boot-core.bundle.aaaaaaaaaaaa.js.gz',
    ].sort(),
  );
  assert.deepEqual(foreign, ['apps/web/public/postboot-1-game-lazy.bundle.bbbbbbbbbbbb.js']);
});

test('classifyDirtyGenerated does not claim companions without a bundle rebuild', () => {
  const staged = ['yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs'];
  const dirty = ['apps/web/index.html', 'apps/web/public/sw.js'];
  const { owned, foreign } = classifyDirtyGenerated(dirty, staged);
  assert.deepEqual(owned, []);
  assert.deepEqual(foreign.sort(), dirty.sort());
});

test('full rebuild trigger owns every dirty generated path', () => {
  const staged = ['scripts/legacy-bundle-config.mjs'];
  const dirty = [
    'apps/web/public/boot-core.bundle.aaaaaaaaaaaa.js',
    'apps/web/public/postboot-1-game-lazy.bundle.bbbbbbbbbbbb.js',
  ];
  const { owned, foreign } = classifyDirtyGenerated(dirty, staged);
  assert.deepEqual(owned.sort(), dirty.sort());
  assert.deepEqual(foreign, []);
  assert.ok(affectedBundlesFromSources(staged).has('boot-core'));
});

test('parseCommitMessage splits subject/body and rejects long headers', () => {
  const ok = parseCommitMessage(
    'fix(sync): short subject\\n\\nBody line one.\\nBody line two.',
  );
  assert.equal(ok.subjectLine, 'fix(sync): short subject');
  assert.equal(ok.type, 'fix');
  assert.equal(ok.body, 'Body line one.\nBody line two.');
  assert.equal(ok.isUserFacing, true);

  assert.throws(
    () =>
      parseCommitMessage(
        'fix(sync): ' + 'x'.repeat(120),
      ),
    /≤100 chars/,
  );
});
