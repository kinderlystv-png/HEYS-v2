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
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@heys/shared': path.resolve(__dirname, '../shared/src'),
      '@heys/core': path.resolve(__dirname, './src'),
      '@heys': path.resolve(__dirname, '../..'),
      // Дополнительные workspace aliases
      '@heys/threat-detection': path.resolve(__dirname, '../threat-detection/src'),
      '@heys/analytics': path.resolve(__dirname, '../analytics/src'),
      '@heys/storage': path.resolve(__dirname, '../storage/src'),
      '@heys/search': path.resolve(__dirname, '../search/src'),
      '@heys/gaming': path.resolve(__dirname, '../gaming/src'),
    },
  },
});
