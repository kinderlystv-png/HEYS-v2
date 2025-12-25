import path from 'node:path';

import { defineConfig } from 'vitest/config';

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
    // Reporter configuration for better output
    reporters: ['verbose', 'html', 'json'],
    outputFile: {
      html: './test-results/index.html',
      json: './test-results/results.json',
    },
  },
});
