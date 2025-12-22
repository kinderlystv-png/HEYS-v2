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
    // OOM prevention: один процесс, без параллелизма
    threads: false,
    isolate: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
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
