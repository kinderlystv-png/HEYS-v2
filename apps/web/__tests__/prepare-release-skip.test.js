/**
 * Unit tests for prepare-release.mjs skip-logic (Phase A) and file classifier (Phase B).
 *
 * Tests pure functions in isolation:
 *  - parseConventionalCommitType — message → type extraction
 *  - classifyPushKind — aggregates user-facing / non-release-meta / non-technical flags
 *  - isReleaseMetaOnlyFile — pattern match for release-meta files
 *  - isTechnicalFile — pattern match for technical/infra files
 *
 * Range-iteration (getCommitsBeingPushed) and end-to-end skip behavior are
 * covered by the Phase A verify push (manual E2E in plan), not here, since they
 * depend on actual git state.
 */
import { describe, test, expect } from 'vitest';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

// Resolve path relative to THIS test file (not process.cwd()) — pre-push runs
// vitest from apps/web/ but the script lives at <repo>/scripts/.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/prepare-release.mjs');
const scriptUrl = pathToFileURL(SCRIPT_PATH).href;

const {
  parseConventionalCommitType,
  classifyPushKind,
  isReleaseMetaOnlyFile,
  isTechnicalFile,
} = await import(scriptUrl);

describe('parseConventionalCommitType', () => {
  test('extracts type from simple conventional commit', () => {
    expect(parseConventionalCommitType('feat: new modal')).toBe('feat');
    expect(parseConventionalCommitType('fix: typo')).toBe('fix');
    expect(parseConventionalCommitType('chore: cleanup')).toBe('chore');
  });

  test('extracts type with scope', () => {
    expect(parseConventionalCommitType('feat(meals): copy nav')).toBe('feat');
    expect(parseConventionalCommitType('chore(deploy-frontend): fix glob')).toBe('chore');
    expect(parseConventionalCommitType('ci(workflow): add detect job')).toBe('ci');
  });

  test('lowercases type', () => {
    expect(parseConventionalCommitType('FEAT: shout')).toBe('feat');
    expect(parseConventionalCommitType('Chore(scope): mixed')).toBe('chore');
  });

  test('returns null for non-conventional messages', () => {
    expect(parseConventionalCommitType('Merge pull request #123')).toBe(null);
    expect(parseConventionalCommitType('Initial commit')).toBe(null);
    expect(parseConventionalCommitType('')).toBe(null);
    expect(parseConventionalCommitType(null)).toBe(null);
    expect(parseConventionalCommitType(undefined)).toBe(null);
  });

  test('returns null for malformed conventional (missing colon)', () => {
    expect(parseConventionalCommitType('feat new modal')).toBe(null);
    expect(parseConventionalCommitType('feat()')).toBe(null);
  });
});

describe('isReleaseMetaOnlyFile', () => {
  test('matches whats-new.json + folder', () => {
    expect(isReleaseMetaOnlyFile('apps/web/public/whats-new.json')).toBe(true);
    expect(isReleaseMetaOnlyFile('apps/web/public/whats-new/screen-foo.png')).toBe(true);
  });

  test('matches build-meta.json (added in Phase A.1)', () => {
    expect(isReleaseMetaOnlyFile('apps/web/public/build-meta.json')).toBe(true);
  });

  test('matches prepare-release.mjs + release-prepare-and-commit.mjs', () => {
    expect(isReleaseMetaOnlyFile('scripts/prepare-release.mjs')).toBe(true);
    expect(isReleaseMetaOnlyFile('scripts/release-prepare-and-commit.mjs')).toBe(true);
  });

  test('matches whats-new-guard workflow', () => {
    expect(isReleaseMetaOnlyFile('.github/workflows/whats-new-guard.yml')).toBe(true);
  });

  test('rejects everything else', () => {
    expect(isReleaseMetaOnlyFile('apps/web/heys_storage_supabase_v1.js')).toBe(false);
    expect(isReleaseMetaOnlyFile('apps/web/public/sw.js')).toBe(false);
    expect(isReleaseMetaOnlyFile('apps/web/public/version.json')).toBe(false);
    expect(isReleaseMetaOnlyFile('.github/workflows/deploy-yandex.yml')).toBe(false);
    expect(isReleaseMetaOnlyFile('scripts/deploy-frontend.sh')).toBe(false);
  });
});

describe('isTechnicalFile', () => {
  test('matches infra paths', () => {
    expect(isTechnicalFile('scripts/deploy-frontend.sh')).toBe(true);
    expect(isTechnicalFile('.github/workflows/deploy-yandex.yml')).toBe(true);
    expect(isTechnicalFile('.husky/pre-push')).toBe(true);
    expect(isTechnicalFile('docs/architecture.md')).toBe(true);
    expect(isTechnicalFile('yandex-cloud-functions/heys-api-rpc/index.js')).toBe(true);
  });

  test('matches test files', () => {
    expect(isTechnicalFile('apps/web/__tests__/foo.test.js')).toBe(true);
    expect(isTechnicalFile('apps/web/tests/integration/bar.spec.js')).toBe(true);
  });

  test('matches config + sql + json + md', () => {
    expect(isTechnicalFile('package.json')).toBe(true);
    expect(isTechnicalFile('database/migrations/2026-05-17.sql')).toBe(true);
    expect(isTechnicalFile('apps/web/README.md')).toBe(true);
  });

  test('rejects runtime app code', () => {
    expect(isTechnicalFile('apps/web/heys_storage_supabase_v1.js')).toBe(false);
    expect(isTechnicalFile('apps/web/heys_day_diary_section.js')).toBe(false);
    expect(isTechnicalFile('apps/landing/src/components/HeroSSR.tsx')).toBe(false);
  });
});

describe('classifyPushKind', () => {
  // classifyPushKind reads commit messages and files via git — these tests
  // verify aggregation logic with mocked inputs. We can't easily mock module-
  // internal functions, so we test the LOGIC by injecting via shas that point
  // to real commits in the repo (HEAD) — but that's coupled to repo state.
  // For robust testing, we test only with empty input. Full behavior is
  // covered by Phase A E2E verify (push real commits and check pre-push).
  test('empty shas array → all flags false', () => {
    const result = classifyPushKind([]);
    expect(result.hasUserFacing).toBe(false);
    expect(result.hasNonReleaseMeta).toBe(false);
    expect(result.hasNonTechnical).toBe(false);
    expect(result.commitCount).toBe(0);
  });

  test('returns commitCount equal to input length', () => {
    // Use HEAD as a known-real sha; we don't care about content of HEAD here.
    const fakeShas = ['HEAD', 'HEAD~1'];
    const result = classifyPushKind(fakeShas);
    expect(result.commitCount).toBe(2);
  });
});
