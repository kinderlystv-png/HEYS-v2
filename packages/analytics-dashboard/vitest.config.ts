import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['../../vitest.setup.ts'],
    // Исключаем Playwright тесты из vitest
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.visual.test.ts', '**/*.e2e.test.ts'],
  },
  resolve: {
    alias: {
      // Workspace package aliases для корректного импорта
      '@heys/shared': resolve(__dirname, '../shared/src'),
      '@heys/threat-detection': resolve(__dirname, '../threat-detection/src'),
      '@heys/core': resolve(__dirname, '../core/src'),
      '@heys/analytics': resolve(__dirname, '../analytics/src'),
      '@heys/storage': resolve(__dirname, '../storage/src'),
      '@heys/search': resolve(__dirname, '../search/src'),
      '@heys/gaming': resolve(__dirname, '../gaming/src'),
    },
  },
});
