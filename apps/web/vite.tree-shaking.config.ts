// filepath: apps/web/vite.tree-shaking.config.ts

/**
 * Vite конфигурация с оптимизированным tree shaking
 * Основана на результатах анализа TreeShaker
 */

import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Импорт конфигураций tree shaking
import { viteTreeShakingConfig } from '../../packages/shared/src/performance/tree-shaking-config';

export default defineConfig({
  plugins: [
    react({
      // Включаем tree shaking для React компонентов
      babel: {
        plugins: [
          // Удаление неиспользуемых импортов
          ['babel-plugin-transform-remove-console', { exclude: ['error', 'warn'] }],
        ],
      },
    }),
  ],

  // Применяем оптимизированные настройки tree shaking
  ...viteTreeShakingConfig,

  build: {
    ...viteTreeShakingConfig.build,

    // Дополнительные оптимизации для tree shaking
    rollupOptions: {
      ...viteTreeShakingConfig.build.rollupOptions,

      // Более агрессивный tree shaking
      treeshake: {
        preset: 'recommended',
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        unknownGlobalSideEffects: false,
        // Дополнительные настройки на основе анализа
        manualPureFunctions: ['console.log', 'console.info', 'console.debug', 'console.trace'],
      },

      // Внешние зависимости на основе анализа
      external: [
        'react',
        'react-dom',
        '@supabase/supabase-js',
        // Добавляем библиотеки, которые должны оставаться внешними
        'lodash',
        'date-fns',
        'uuid',
      ],

      output: {
        // Оптимизированное разделение chunks
        manualChunks: {
          // Vendor chunks
          vendor: ['react', 'react-dom'],
          utils: ['lodash', 'date-fns', 'uuid'],
          supabase: ['@supabase/supabase-js'],

          // App chunks на основе анализа
          performance: ['packages/shared/src/performance'],
          security: ['packages/shared/src/security'],
          storage: ['packages/shared/src/storage'],
        },

        // Оптимизация имен для лучшего tree shaking
        chunkFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'vendor') return 'assets/vendor.[hash].js';
          if (chunkInfo.name === 'utils') return 'assets/utils.[hash].js';
          return 'assets/[name].[hash].js';
        },

        // Минификация с удалением dead code
        compact: true,
      },
    },

    // Дополнительная минификация
    minify: 'terser',
    terserOptions: {
      ...viteTreeShakingConfig.build.terserOptions,
      compress: {
        ...viteTreeShakingConfig.build.terserOptions.compress,
        // Более агрессивное удаление неиспользуемого кода
        dead_code: true,
        drop_console: true,
        drop_debugger: true,
        pure_funcs: [
          'console.log',
          'console.info',
          'console.debug',
          'console.trace',
          // Функции, выявленные анализатором как чистые
          'measurePerformance',
          'logDebug',
        ],
        // Удаление неиспользуемых переменных
        unused: true,
        // Встраивание констант
        evaluate: true,
        // Удаление неиспользуемых функций
        pure_getters: true,
        // Оптимизация условных выражений
        conditionals: true,
      },
      mangle: {
        // Сохраняем некоторые имена для отладки
        keep_classnames: false,
        keep_fnames: false,
        reserved: ['__webpack_require__', '__webpack_exports__'],
      },
    },

    // Анализ bundle size
    reportCompressedSize: true,

    // Предупреждения о размере chunks
    chunkSizeWarningLimit: 500,

    // Sourcemaps только для production debug
    sourcemap: process.env.NODE_ENV === 'development' ? true : 'hidden',
  },

  // Оптимизации для разработки
  optimizeDeps: {
    // Предварительная сборка зависимостей
    include: ['react', 'react-dom', '@supabase/supabase-js'],

    // Исключаем из предварительной сборки
    exclude: [
      // Локальные пакеты
      '@heys/shared',
      '@heys/core',
    ],

    // Принудительная пересборка при изменениях
    force: process.env.FORCE_OPTIMIZE === 'true',
  },

  // Resolve конфигурация для tree shaking
  resolve: {
    alias: {
      // Алиасы для лучшего tree shaking
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@core': path.resolve(__dirname, '../../packages/core/src'),

      // Замена на ES modules версии для лучшего tree shaking
      lodash: 'lodash-es',
    },

    // Приоритет ES modules для tree shaking
    mainFields: ['module', 'browser', 'main'],

    // Расширения файлов в порядке приоритета
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },

  // Переменные окружения для условной компиляции
  define: {
    ...viteTreeShakingConfig.define,

    // Дополнительные флаги для tree shaking
    __DEV__: process.env.NODE_ENV === 'development',
    __PROD__: process.env.NODE_ENV === 'production',
    __TEST__: process.env.NODE_ENV === 'test',

    // Флаги для удаления debug кода
    __DEBUG_PERFORMANCE__: process.env.DEBUG_PERFORMANCE === 'true',
    __DEBUG_SECURITY__: process.env.DEBUG_SECURITY === 'true',

    // Версия для cache busting
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },

  // CSS tree shaking
  css: {
    // Модули CSS с tree shaking
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]___[hash:base64:5]',
    },

    // PostCSS оптимизации
    postcss: {
      plugins: [
        // Удаление неиспользуемых CSS правил
        require('@fullhuman/postcss-purgecss')({
          content: ['./src/**/*.{html,js,jsx,ts,tsx}'],
          defaultExtractor: (content) => content.match(/[\w-/:]+(?<!:)/g) || [],
          safelist: [
            // Сохраняем важные классы
            /^tooltip/,
            /^modal/,
            /^dropdown/,
          ],
        }),
      ],
    },
  },

  // Экспериментальные возможности
  experimental: {
    // RenderBuiltUrl для оптимизации ресурсов
    renderBuiltUrl(filename: string) {
      // Возвращаем оптимизированные пути для статических ресурсов
      if (filename.includes('vendor')) {
        return `/assets/vendor/${filename}`;
      }
      return `/assets/${filename}`;
    },
  },
});
