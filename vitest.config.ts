import path from 'node:path';

import { defineConfig } from 'vitest/config';

const enableVerboseReporter =
  process.env.VITEST_VERBOSE === '1' || process.env.VITEST_VERBOSE === 'true';

const enableTestReports =
  process.env.VITEST_REPORT === '1' || process.env.VITEST_REPORT === 'true';

export default defineConfig({
  resolve: {
    alias: {
      '@heys/logger': path.resolve(__dirname, './packages/logger/src'),
      '@heys/shared': path.resolve(__dirname, './packages/shared/src'),
      '@heys/core': path.resolve(__dirname, './packages/core/src'),
      '@heys/storage': path.resolve(__dirname, './packages/storage/src'),
      '@heys/search': path.resolve(__dirname, './packages/search/src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'TESTS/e2e/**',
      '.github/skills/**',
      'TOOLS/templates/**',
      'TESTS/example.test.js',
    ],
    // Setup files for mocking browser APIs
    setupFiles: ['./vitest.setup.ts'],
    // Increase timeout for performance tests
    testTimeout: 10000,
    // Inline workspace dependencies для vitest
    server: {
      deps: {
        inline: [/@heys\/.*/],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.{test,spec}.{ts,tsx}',
        'vitest.config.ts',
        'vitest.setup.ts',
      ],
      reportsDirectory: './coverage',
      // Coverage thresholds for PHASE 1 DAY 4
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        // Per-package thresholds
        'packages/core/': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
        'packages/shared/': {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75,
        },
      },
    },
    // Pool configuration for stability.
    // NOTE: In large suites we occasionally see vitest RPC timeouts:
    //   "Error: [vitest-worker]: Timeout calling \"onTaskUpdate\""
    // Reducing worker/process fan-out and heavy reporting makes runs deterministic.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Reporter configuration for better output.
    // - verbose: opt-in (can generate a lot of task updates)
    // - html/json reports: opt-in (can be slow and memory-heavy in big suites)
    reporters: (() => {
      const base = enableVerboseReporter ? 'verbose' : 'default';
      if (enableTestReports) return [base, 'html', 'json'];
      return [base];
    })(),
    ...(enableTestReports
      ? {
        outputFile: {
          html: './test-results/index.html',
          json: './test-results/results.json',
        },
      }
      : {}),
  },
});
