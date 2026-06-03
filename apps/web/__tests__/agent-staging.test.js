import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/check-agent-staging.mjs');
const scriptUrl = pathToFileURL(SCRIPT_PATH).href;

const {
  assertAgentStaging,
  detectStagingMode,
  getForbiddenAgentStagedFiles,
  isGeneratedOrReleaseFile,
} = await import(scriptUrl);

describe('agent staging guard', () => {
  it('detects agent mode from codex branches and claude worktrees', () => {
    expect(detectStagingMode({ branchName: 'codex/sync-fix', repoRoot: '/repo', env: {} })).toBe('agent');
    expect(detectStagingMode({ branchName: 'main', repoRoot: '/repo/.claude/worktrees/a', env: {} })).toBe('agent');
  });

  it('keeps main and integration branches in integration mode', () => {
    expect(detectStagingMode({ branchName: 'main', repoRoot: '/repo', env: {} })).toBe('integration');
    expect(detectStagingMode({ branchName: 'integration/agent-batch', repoRoot: '/repo', env: {} })).toBe('integration');
  });

  it('is safe-by-default: unrecognized branches fall back to agent mode', () => {
    // copilot/* and arbitrary names previously defaulted to integration (no
    // bundle protection). Integration is now an allowlist; everything else is
    // source-only.
    expect(detectStagingMode({ branchName: 'copilot/whatsnew-trigger', repoRoot: '/repo', env: {} })).toBe('agent');
    expect(detectStagingMode({ branchName: 'feature/x', repoRoot: '/repo', env: {} })).toBe('agent');
    expect(detectStagingMode({ branchName: 'fix-sync', repoRoot: '/repo', env: {} })).toBe('agent');
    expect(detectStagingMode({ branchName: '', repoRoot: '/repo', env: {} })).toBe('agent');
  });

  it('honors explicit HEYS_STAGING_MODE override on any branch', () => {
    expect(detectStagingMode({ branchName: 'feature/x', repoRoot: '/repo', env: { HEYS_STAGING_MODE: 'integration' } })).toBe('integration');
  });

  it('allows source-only staged files in agent mode', () => {
    const result = assertAgentStaging({
      mode: 'agent',
      files: ['apps/web/heys_storage_supabase_v1.js', 'apps/web/__tests__/sync.test.js'],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects generated bundles and whats-new files in agent mode', () => {
    const files = [
      'apps/web/public/boot-core.bundle.123456789abc.js',
      'apps/web/public/whats-new.json',
      'apps/web/bundle-manifest.json',
      'apps/web/heys_storage_supabase_v1.js',
    ];

    expect(getForbiddenAgentStagedFiles(files)).toEqual(files.slice(0, 3));
    expect(isGeneratedOrReleaseFile('apps/web/public/whats-new/screen.png')).toBe(true);
  });

  it('rejects the raw react-bundle.js (not just the gzipped copy)', () => {
    // Regression: only public/react-bundle.js.gz was forbidden; the tracked
    // 142KB raw apps/web/react-bundle.js could slip into an agent commit.
    expect(isGeneratedOrReleaseFile('apps/web/react-bundle.js')).toBe(true);
    expect(isGeneratedOrReleaseFile('apps/web/public/react-bundle.js.gz')).toBe(true);
    expect(getForbiddenAgentStagedFiles([
      'apps/web/react-bundle.js',
      'apps/web/heys_fingers_constructor_v1.js',
    ])).toEqual(['apps/web/react-bundle.js']);
  });
});
