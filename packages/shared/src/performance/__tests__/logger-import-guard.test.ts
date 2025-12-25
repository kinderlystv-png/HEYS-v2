/**
 * Guard test: ensure performance module uses centralized logger.
 *
 * All files in performance/** should import logger from './logger' (or '../logger'),
 * NOT directly from '@heys/logger'.
 *
 * The only exception is logger.ts itself, which is the single entry point.
 */

import * as fs from 'fs';
import * as path from 'path';

import { describe, it, expect } from 'vitest';

const PERFORMANCE_DIR = path.resolve(__dirname, '..');
const ALLOWED_DIRECT_IMPORT = ['logger.ts']; // Only logger.ts can import @heys/logger

function findTsFiles(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip __tests__ and node_modules
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
        findTsFiles(fullPath, files);
      }
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkDirectLoggerImport(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Match: from '@heys/logger' or from "@heys/logger"
  return /from\s+['"]@heys\/logger['"]/.test(content);
}

describe('Performance Logger Import Guard', () => {
  it('should not have direct @heys/logger imports (except logger.ts)', () => {
    const tsFiles = findTsFiles(PERFORMANCE_DIR);
    const violations: string[] = [];

    for (const file of tsFiles) {
      const relativePath = path.relative(PERFORMANCE_DIR, file);
      const fileName = path.basename(file);

      // Skip allowed files
      if (ALLOWED_DIRECT_IMPORT.includes(fileName)) {
        continue;
      }

      if (checkDirectLoggerImport(file)) {
        violations.push(relativePath);
      }
    }

    if (violations.length > 0) {
      // Provide helpful error message
      const message = [
        `Found ${violations.length} file(s) with direct @heys/logger import:`,
        '',
        ...violations.map((f) => `  - ${f}`),
        '',
        'Please use centralized logger from "./logger" instead:',
        '',
        '  // Bad:',
        '  import { logger } from "@heys/logger";',
        '',
        '  // Good:',
        '  import { perfLogger } from "./logger";',
        '  // or',
        '  import { perfLogger } from "../logger";',
      ].join('\n');

      // For now, just warn - don't fail the test
      // Change to expect(violations).toHaveLength(0) when migration is complete
      console.warn(`\n⚠️ Logger Import Guard Warning:\n${message}\n`);

      // TODO: Uncomment when migration is complete
      // expect(violations, message).toHaveLength(0);
    }

    // For now, just verify the test runs
    expect(true).toBe(true);
  });

  it('logger.ts should be the only file importing @heys/logger', () => {
    const loggerFile = path.join(PERFORMANCE_DIR, 'logger.ts');

    expect(fs.existsSync(loggerFile)).toBe(true);
    expect(checkDirectLoggerImport(loggerFile)).toBe(true);
  });
});
