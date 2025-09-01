import { defineConfig } from 'vitest/config';
import path from 'node:path';

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
      '@heys': path.resolve(__dirname, '../..') 
    } 
  }
});
