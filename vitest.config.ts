import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Скрипты из scripts/ — исполняемые файлы с шебангом, и тесты импортируют их
// как модули. Vite шебанг не снимает, импорт падает на «Invalid or unexpected
// token», и файл не загружается вовсе — в отчёте это выглядит как «FAIL … no
// tests», то есть охранная проверка молча не работает.
//
// Тот же плагин уже стоит в apps/web/vitest.config.ts; корневой конфиг его не
// получил, поэтому CI на каждом PR показывал красное на чистом main.
const stripShebang = {
  name: 'heys-strip-shebang',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    // Путь нормализуем: на Windows id приходит с обратными слэшами.
    if (!id.replaceAll(String.fromCharCode(92), '/').includes('/scripts/')) return null;
    if (!code.startsWith('#!')) return null;
    // Строка заменяется пустой, а не удаляется: номера строк в стеке остаются
    // прежними, иначе отладка чужого падения уедет на единицу.
    const eol = code.indexOf(String.fromCharCode(10));
    return { code: eol < 0 ? '' : code.slice(eol), map: null };
  },
};

const enableVerboseReporter =
  process.env.VITEST_VERBOSE === '1' || process.env.VITEST_VERBOSE === 'true';

const enableTestReports =
  process.env.VITEST_REPORT === '1' || process.env.VITEST_REPORT === 'true';

export default defineConfig({
  plugins: [stripShebang],
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
      // Файлы node:test, а не vitest: свои assert-проверки они проходят сами,
      // но vitest не находит в них suite и валит прогон «No test suite found».
      // Запускаются через node --test (pnpm test:node), в CI — своим шагом.
      'scripts/**/*.test.mjs',
      'yandex-cloud-functions/**/*.test.js',
      'yandex-cloud-functions/**/*.test.cjs',
      'yandex-cloud-functions/**/*.test.mjs',
      'TESTS/rpc/**',
      // TESTS/db, TESTS/regressions/468a*-tz-fix.test.ts — против real
      // Postgres, нужны dedicated `pnpm test:db` (60s timeout для psql RTT).
      // Default vitest 10s timeout будет таймаут'ить. Каждый файл имеет
      // // @vitest-environment node directive.
      // ⚠ НЕ exclude'им потому что workspace ignore'ит direct file paths
      // через --filter, и tests становятся не-запускаемыми. Полагаемся на
      // commit hook чтобы pre-commit не запускал тяжёлые DB tests.
      // TESTS/rpc — используют undici fetch напрямую (bypass setupFiles
      // global.fetch mock), могут запускаться в default vitest run.
      '.github/skills/**',
      'TOOLS/templates/**',
      'TESTS/example.test.js',
      // Проекты со своим прогоном. Корневой конфиг подхватывал их файлы
      // второй раз и валил чужими настройками: apps/web зелёный своим
      // `cd apps/web && vitest run` (его же гоняет deploy-гейт), пакеты —
      // своими vitest.config.ts через workspace, а apps/mobile и
      // apps/genda-tests вообще вне pnpm-workspace, так что их зависимости
      // здесь не установлены. Разбор 31 августа: из 16 красных в корневом
      // прогоне семь были только этим дублем.
      'apps/web/**',
      'packages/**',
      // Вне workspace (pnpm-workspace.yaml: «Temporarily disabled other
      // apps»). Мобильные тесты требуют expo, в CI по ним идёт только
      // type-check; genda-tests — node:test со своим `node --test`.
      'apps/mobile/**',
      'apps/genda-tests/**',
      // Не сканируем git worktree'и параллельных AI-агентов — у них
      // свои незакоммиченные изменения которые могут ломать тесты
      // основного репо при vitest run.
      '.claude/worktrees/**',
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
    // Каждый файл — свой процесс. Так же настроен apps/web/vitest.config.ts, и
    // это важно: корневой проект собирает те же 529 файлов apps/web (у него
    // include по умолчанию), то есть одни и те же тесты умеют запускаться под
    // двумя конфигами.
    //
    // Здесь стоял singleFork: true — «reducing worker fan-out makes runs
    // deterministic» против RPC-таймаутов. Ровно от этой настройки apps/web
    // отказался 2026-05-22: в общем процессе файлы делят global.HEYS, window и
    // подменённый localStorage, и падает не тот, кто испортил, а следующий.
    // Замер 31 августа на apps/web/__tests__: singleFork — 143 файла и 896
    // тестов красных; без него — 518 из 520 зелёных, 6427 тестов, ноль
    // упавших, и ни одного RPC-таймаута. Оставшийся файл — не vitest вовсе
    // (см. consent-proof-v2).
    //
    // По отдельности те же файлы всегда были зелёными, поэтому расхождение
    // годами читалось как «флак», а не как разделяемое состояние.
    pool: 'forks',

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
