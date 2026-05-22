import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    // setupFiles: ['./vitest.setup.ts'], // Отключено - импорт в тестах
    include: ['src/**/*.{test,spec}.{ts,tsx}', '__tests__/**/*.{test,spec}.{ts,tsx,js}'],
    // Каждый файл — свой fork (default vitest), isolate:true → чистые globals.
    // Раньше было isolate:false / singleFork:true как preventive OOM mitigation,
    // но это вызывало flake-тесты из-за shared global.HEYS между файлами
    // (восстановлено 2026-05-22, см. plan 1-5-cheeky-micali.md → Item 3).
    pool: 'forks',
    // Доп. ограничения
    passWithNoTests: true,
    reporters: ['basic'],
    coverage: {
      enabled: false, // Отключаем в CI
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.{test,spec}.{ts,tsx}',
        '**/*.config.{ts,js}',
        '**/dist/**',
      ],
    },
  },
});
