// filepath: packages/web/vitest.config.ts

/**
 * HEYS EAP 3.0 - Vitest Configuration
 * 
 * Purpose: Test configuration for performance optimization system
 * Features: Unit tests, integration tests, coverage reporting
 */

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-utils/setupTests.ts'],
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.next'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/**/*.{js,ts,jsx,tsx}'
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{js,ts,jsx,tsx}',
        'src/**/*.spec.{js,ts,jsx,tsx}',
        'src/test-utils/**',
        'src/__tests__/**'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@heys/logger': path.resolve(__dirname, '../core/src/utils/logger'),
      '@heys/auth': path.resolve(__dirname, '../auth/src')
    }
  },
  define: {
    'process.env': process.env
  }
})
