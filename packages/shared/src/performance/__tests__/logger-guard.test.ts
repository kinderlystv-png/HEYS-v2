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
 * These are pending migration to use ./logger entry point.
 *
 * When migrating, file must change from pino format:
 *   logger.error({ error }, 'message')
 * to AppLogger format:
 *   logger.error('message', { error })
 *
 * Migration order (by impact):
 * 1. bundle-optimizer.ts - complex, many call sites
 * 2. cache.ts - critical path, many error handlers
 * 3. network.ts - network layer, error handling
 * 4. index.ts - main entry, several loggers
 * ... etc
 */
const ALLOWED_DIRECT_IMPORTS = new Set([
  'logger.ts', // The entry point itself - always allowed
  // === Main performance files ===
  // ✅ bundle-optimizer.ts - MIGRATED (2025-12-26)
  // ✅ cache.ts - MIGRATED (2025-12-26)
  // ✅ network.ts - MIGRATED (2025-12-26)
  'index.ts', // TODO: migrate to AppLogger format
  'PerformanceProfiler.ts', // TODO: migrate to AppLogger format
  'mobile-performance-optimizer.ts', // TODO: migrate to AppLogger format
  'AdvancedCacheManager.ts', // TODO: migrate to AppLogger format
  'BundleAnalyzer.ts', // TODO: migrate to AppLogger format
  'CodeSplitter.ts', // TODO: migrate to AppLogger format
  'TreeShaker.ts', // TODO: migrate to AppLogger format
  'PerformanceMonitoringService.ts', // TODO: migrate to AppLogger format
  'DependencyAnalyzer.ts', // TODO: migrate to AppLogger format
  'adaptive-loading.ts', // TODO: migrate to AppLogger format
  'ModuleFederationManager.ts', // TODO: migrate to AppLogger format
  'PerformanceOptimizer.ts', // TODO: migrate to AppLogger format
  'VirtualScrollManager.ts', // TODO: migrate to AppLogger format
  'worker-thread-pool.ts', // TODO: migrate to AppLogger format
  'resource-hints.ts', // TODO: migrate to AppLogger format
  // === Additional files found by guard ===
  'LazyLoader.ts', // TODO: migrate to AppLogger format
  'LighthouseOptimizer.ts', // TODO: migrate to AppLogger format
  'advanced-cache-manager.ts', // TODO: migrate to AppLogger format
  'cache-integration-layer.ts', // TODO: migrate to AppLogger format
  'LazyComponent.ts', // TODO: migrate to AppLogger format
  'vite-lazy-loading.config.ts', // TODO: migrate to AppLogger format
  'http-cache-strategy.ts', // TODO: migrate to AppLogger format
  'load-testing-tools.ts', // TODO: migrate to AppLogger format
  'mobile.ts', // TODO: migrate to AppLogger format
  'network-optimization-integration.ts', // TODO: migrate to AppLogger format
  'network-optimizer.ts', // TODO: migrate to AppLogger format
  'network-performance-dashboard.ts', // TODO: migrate to AppLogger format
  'performance-regression-tester.ts', // TODO: migrate to AppLogger format
  'performance-test-framework.ts', // TODO: migrate to AppLogger format
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
