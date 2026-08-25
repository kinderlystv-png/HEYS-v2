import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Скрипты из scripts/ — исполняемые файлы с шебангом, и тесты импортируют их
// как модули, чтобы проверить экспортированные помощники. Vite шебанг не
// снимает, и импорт падает с «Invalid or unexpected token» — из-за этого пять
// тестов, охраняющих публикацию, молча не загружались вовсе (проверено: файл
// с одним лишь шебангом не импортируется, без него импортируется).
//
// Снимаем шебанг на лету, а не из семидесяти одного файла: он там по делу —
// помечает точку входа, и правка каждого была бы подметанием ради теста.
const stripShebang = {
  name: 'heys-strip-shebang',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    // Путь нормализуем: на Windows id приходит с обратными слэшами.
    if (!id.replace(/\\/g, '/').includes('/scripts/')) return null;
    if (!code.startsWith('#!')) return null;
    // Строка заменяется пустой, а не удаляется: номера строк в стеке остаются
    // прежними, иначе отладка чужого падения уедет на единицу.
    const eol = code.indexOf('\n');
    return { code: eol < 0 ? '' : code.slice(eol), map: null };
  },
};

export default defineConfig({
  plugins: [react(), stripShebang],
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
