import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/push-agent.mjs');
const scriptUrl = pathToFileURL(SCRIPT_PATH).href;

const {
  buildItemsJsonFromOptions,
  buildPreflightCommandArgs,
  buildPrepareReleaseAutoArgs,
  collectBundleFiles,
  getDeployWatchConfig,
  getNonReleaseMetaStagedFiles,
  getStatusShortLines,
  isDeployedHashCompatible,
  parseCliArgs,
  shouldWatchDeploy,
  shouldRunPreflight,
} = await import(scriptUrl);

describe('push-agent CLI helpers', () => {
  it('refuses mutating runs without explicit confirmation', () => {
    const result = spawnSync(
      'node',
      [SCRIPT_PATH, '--title=x', '--item-title=y', '--item-description=z'],
      {
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('requires explicit --confirm-push');
  });

  it('normalizes pnpm -- separator and parses options', () => {
    const parsed = parseCliArgs([
      '--',
      '--dry-run',
      '--status',
      '--remote=upstream',
      '--branch=release/test',
      '--title=Sync fixes',
    ]);

    expect(parsed.raw).toEqual([
      '--dry-run',
      '--status',
      '--remote=upstream',
      '--branch=release/test',
      '--title=Sync fixes',
    ]);
    expect(parsed.flags.has('--dry-run')).toBe(true);
    expect(parsed.flags.has('--status')).toBe(true);
    expect(parsed.options.get('--remote')).toBe('upstream');
    expect(parsed.options.get('--branch')).toBe('release/test');
    expect(parsed.options.get('--title')).toBe('Sync fixes');
  });

  it('builds a single explicit release item from scalar options', () => {
    const json = buildItemsJsonFromOptions({
      itemType: 'fix',
      itemTitle: 'Удалённые активности больше не возвращаются',
      itemDescription: 'Правка на одном устройстве устойчивее применяется на другом.',
    });

    expect(JSON.parse(json)).toEqual([
      {
        type: 'fix',
        title: 'Удалённые активности больше не возвращаются',
        description: 'Правка на одном устройстве устойчивее применяется на другом.',
      },
    ]);
  });

  it('accepts explicit JSON items and preserves them', () => {
    const items = [
      {
        type: 'improvement',
        title: 'Экран обновляется спокойнее',
        description: 'Состояние быстрее приходит к одной версии между устройствами.',
      },
    ];

    expect(buildItemsJsonFromOptions({ items: JSON.stringify(items) })).toBe(JSON.stringify(items));
  });

  it('builds prepare-release auto args without interactive prompts', () => {
    const args = buildPrepareReleaseAutoArgs(
      'Синхронизация стала устойчивее',
      '[{"type":"fix","title":"A","description":"B"}]',
      { range: 'origin/main..HEAD', coveredCommits: 'auto' },
    );

    expect(args).toEqual([
      '--auto',
      '--allow-user-facing-auto',
      '--range=origin/main..HEAD',
      '--covered-commits=auto',
      '--title=Синхронизация стала устойчивее',
      '--items=[{"type":"fix","title":"A","description":"B"}]',
    ]);
  });

  it('defaults release coverage to auto for agent pushes', () => {
    const args = buildPrepareReleaseAutoArgs(
      'Синхронизация стала устойчивее',
      '[{"type":"fix","title":"A","description":"B"}]',
    );

    expect(args).toContain('--covered-commits=auto');
  });

  it('keeps only whats-new paths eligible for release follow-up commits', () => {
    const files = [
      'apps/web/public/whats-new.json',
      'apps/web/public/whats-new/screen.png',
      'apps/web/heys_storage_supabase_v1.js',
      'package.json',
    ];

    expect(getNonReleaseMetaStagedFiles(files)).toEqual([
      'apps/web/heys_storage_supabase_v1.js',
      'package.json',
    ]);
  });

  it('parses git status --short output into non-empty lines', () => {
    const lines = getStatusShortLines(`
 M scripts/push-agent.mjs
?? apps/web/public/new-bundle.js

`);

    expect(lines).toEqual([' M scripts/push-agent.mjs', '?? apps/web/public/new-bundle.js']);
  });

  it('watches deploys by default only for main pushes', () => {
    expect(shouldWatchDeploy('main')).toBe(true);
    expect(shouldWatchDeploy('feature/test')).toBe(false);
  });

  it('runs canonical preflight by default, including dry-run', () => {
    expect(shouldRunPreflight(new Set())).toBe(true);
    expect(shouldRunPreflight(new Set(['--preflight']))).toBe(true);
    expect(shouldRunPreflight(new Set(['--dry-run']))).toBe(true);
    expect(shouldRunPreflight(new Set(['--status']))).toBe(false);
  });

  it('passes an explicit dry-run baseline through to canonical preflight', () => {
    expect(
      buildPreflightCommandArgs({
        remote: 'origin',
        branch: 'main',
        baseRef: 'HEAD~1',
        full: false,
      }),
    ).toEqual(['push:preflight', '--', '--base=HEAD~1', '--ref=HEAD']);
  });

  it('collects only content-hashed legacy bundles from production manifest', () => {
    expect(
      collectBundleFiles({
        core: { file: 'boot-core.bundle.12345678abcd.js' },
        lazy: 'postboot-1-game-lazy.bundle.abcdef123456.js',
        unhashed: { file: 'react-bundle.js' },
      }),
    ).toEqual(['boot-core.bundle.12345678abcd.js', 'postboot-1-game-lazy.bundle.abcdef123456.js']);
  });

  it('accepts exact/short production hashes and a newer descendant only', () => {
    expect(isDeployedHashCompatible('12345678', '12345678abcdef')).toBe(true);
    expect(
      isDeployedHashCompatible(
        'abcdef12',
        '12345678',
        (head, deployed) => head === '12345678' && deployed === 'abcdef12',
      ),
    ).toBe(true);
    expect(isDeployedHashCompatible('deadbeef', '12345678', () => false)).toBe(false);
  });

  it('uses the Yandex deploy workflow as the default watch target', () => {
    expect(getDeployWatchConfig()).toMatchObject({
      workflow: 'Deploy to Yandex Cloud',
      waitSeconds: 5,
      lookupAttempts: 6,
      intervalSeconds: 20,
    });
  });
});
