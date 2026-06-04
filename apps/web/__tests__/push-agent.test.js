import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/push-agent.mjs');
const scriptUrl = pathToFileURL(SCRIPT_PATH).href;

const {
  buildItemsJsonFromOptions,
  buildPrepareReleaseAutoArgs,
  getDeployWatchConfig,
  getNonReleaseMetaStagedFiles,
  getStatusShortLines,
  parseCliArgs,
  shouldWatchDeploy,
} = await import(scriptUrl);

describe('push-agent CLI helpers', () => {
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

  it('uses the Yandex deploy workflow as the default watch target', () => {
    expect(getDeployWatchConfig()).toMatchObject({
      workflow: 'Deploy to Yandex Cloud',
      waitSeconds: 5,
      lookupAttempts: 6,
      intervalSeconds: 20,
    });
  });
});
