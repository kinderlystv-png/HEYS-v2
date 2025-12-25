import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'vitest.config.ts',
      ],
    },
    // Inline workspace dependencies для vitest
    server: {
      deps: {
        inline: [/@heys\/.*/],
      },
    },
  },
  optimizeDeps: {
    exclude: ['@heys/logger'],
  },
  resolve: {
    conditions: ['development', 'import'],
    alias: {
      // Direct alias to source - takes priority over node_modules
      '@heys/logger': path.resolve(__dirname, '../logger/src/index.ts'),
      '@heys/shared': path.resolve(__dirname, './src'),
      '@heys/core': path.resolve(__dirname, '../core/src'),
      '@heys/storage': path.resolve(__dirname, '../storage/src'),
      '@heys/search': path.resolve(__dirname, '../search/src'),
    },
  },
});
