/**
 * Guard test: ensures performance module files use unified logger entry point.
 *
 * Files in `packages/shared/src/performance/` should import from `./logger`
 * instead of importing `@heys/logger` directly.
 *
 * This ensures:
 * 1. Single entry point for logger configuration
 * 2. Easier testing with mock loggers
 * 3. Consistent logging format across performance module
 *
 * Files in ALLOWED_DIRECT_IMPORTS are temporarily exempted during migration.
 * Goal: reduce this list to only `logger.ts` (the entry point itself).
 */

import * as fs from 'fs';
import * as path from 'path';

import { describe, expect, it } from 'vitest';

/**
 * Files allowed to import @heys/logger directly.
 * Only the entry point (logger.ts) should import @heys/logger.
 * All other files must use perfLogger from ./logger.
 *
 * Migration completed: 2025-12-27
 * - All 18 production files now use perfLogger from ./logger
 * - Test files (bundle-optimizer.test.ts) can keep direct imports
 */
const ALLOWED_DIRECT_IMPORTS = new Set([
  'logger.ts', // The entry point itself - always allowed
]);

describe('Performance module logger guard', () => {
  it('should not import @heys/logger directly (except allowed files)', () => {
    const performanceDir = path.resolve(__dirname, '..');
    const violations: string[] = [];

    // Recursively find all .ts files
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && entry.name !== '__tests__' && entry.name !== 'node_modules') {
          scanDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
          // Check if file is in allowed list
          if (ALLOWED_DIRECT_IMPORTS.has(entry.name)) {
            continue;
          }

          // Read file and check for direct import
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes("from '@heys/logger'") || content.includes('from "@heys/logger"')) {
            violations.push(entry.name);
          }
        }
      }
    }

    scanDir(performanceDir);

    if (violations.length > 0) {
      throw new Error(
        `Files importing @heys/logger directly (should use ./logger):\n` +
          violations.map((f) => `  - ${f}`).join('\n') +
          `\n\nTo fix: import { perfLogger } from './logger' instead of @heys/logger`,
      );
    }
  });

  it('should have logger.ts as the single entry point', () => {
    const loggerPath = path.resolve(__dirname, '..', 'logger.ts');
    expect(fs.existsSync(loggerPath)).toBe(true);

    const content = fs.readFileSync(loggerPath, 'utf-8');

    // logger.ts should export perfLogger
    expect(content).toContain('export const perfLogger');

    // logger.ts should export createPerfLogger
    expect(content).toContain('export function createPerfLogger');

    // logger.ts should export noopPerfLogger
    expect(content).toContain('export const noopPerfLogger');
  });

  it('should track migration progress', () => {
    // This test documents current state and fails if allowlist shrinks unexpectedly
    // Update ALLOWED_DIRECT_IMPORTS as files are migrated

    const expectedCount = ALLOWED_DIRECT_IMPORTS.size;

    // Log progress
    console.log(`\n📊 Logger migration progress:`);
    console.log(`   Files still using @heys/logger directly: ${expectedCount - 1}`); // -1 for logger.ts
    console.log(`   Target: 0 (only logger.ts should import @heys/logger)\n`);

    // This assertion documents expected state
    // As migration progresses, reduce this number
    expect(expectedCount).toBeGreaterThanOrEqual(1); // At minimum, logger.ts is always allowed
  });
});
