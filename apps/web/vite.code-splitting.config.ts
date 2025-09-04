// filepath: apps/web/vite.code-splitting.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Оптимизированная конфигурация Vite с advanced code splitting
 * Основана на анализе code splitting возможностей проекта
 * 
 * Особенности:
 * - Route-based splitting для всех страниц
 * - Vendor chunks для популярных библиотек
 * - Feature-based splitting для модулей
 * - Оптимизация загрузки и кеширования
 */
export default defineConfig({
  plugins: [
    react({
      // Включаем автоматическое разделение React компонентов
      babel: {
        plugins: [
          // Автоматическое добавление React.lazy для больших компонентов
          ['babel-plugin-import', {
            libraryName: 'antd',
            libraryDirectory: 'es',
            style: true,
          }],
        ],
      },
    }),
  ],

  // Разрешение путей
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@features': resolve(__dirname, 'src/features'),
    },
  },

  // Основные настройки сборки с code splitting
  build: {
    // Целевая платформа
    target: 'esnext',
    
    // Включение sourcemap для production debugging
    sourcemap: true,
    
    // Предупреждение о размере chunks (300KB)
    chunkSizeWarningLimit: 300,
    
    // Минификация с оптимизацией для chunks
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.warn'],
        // Удаляем неиспользуемые функции
        pure_getters: true,
        unsafe_comps: true,
        unsafe_math: true,
      },
      mangle: {
        safari10: true,
      },
      format: {
        comments: false,
      },
    },

    // Rollup настройки для advanced code splitting
    rollupOptions: {
      // Точки входа
      input: {
        main: resolve(__dirname, 'index.html'),
      },

      // Настройки вывода с intelligent chunking
      output: {
        // Стратегия именования chunks
        chunkFileNames: (chunkInfo) => {
          // Определяем тип chunk по содержимому
          const facadeModuleId = chunkInfo.facadeModuleId;
          
          if (facadeModuleId) {
            // Route chunks
            if (facadeModuleId.includes('/pages/') || facadeModuleId.includes('/routes/')) {
              const pageName = facadeModuleId.split('/').pop()?.replace(/\.(tsx?|jsx?)$/, '') || 'page';
              return `pages/${pageName}-[hash].js`;
            }
            
            // Feature chunks
            if (facadeModuleId.includes('/features/')) {
              const featureName = facadeModuleId.split('/features/')[1]?.split('/')[0] || 'feature';
              return `features/${featureName}-[hash].js`;
            }
            
            // Component chunks
            if (facadeModuleId.includes('/components/')) {
              return `components/[name]-[hash].js`;
            }
          }
          
          // Default chunk naming
          return `chunks/[name]-[hash].js`;
        },
        
        entryFileNames: 'entries/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Группировка ассетов по типам
          const extType = assetInfo.name?.split('.').pop() || '';
          
          if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(extType)) {
            return 'images/[name]-[hash].[ext]';
          }
          
          if (['css', 'scss', 'sass', 'less'].includes(extType)) {
            return 'styles/[name]-[hash].[ext]';
          }
          
          if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(extType)) {
            return 'fonts/[name]-[hash].[ext]';
          }
          
          return 'assets/[name]-[hash].[ext]';
        },

        // Manual chunks для оптимального разделения
        manualChunks: (id) => {
          // 1. Node modules (vendor libraries)
          if (id.includes('node_modules')) {
            // Core React ecosystem
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            
            // Routing
            if (id.includes('react-router') || id.includes('@reach/router')) {
              return 'vendor-router';
            }
            
            // UI frameworks
            if (id.includes('@mui/') || id.includes('@emotion/') || id.includes('@mantine/')) {
              return 'vendor-ui';
            }
            
            // State management
            if (id.includes('redux') || id.includes('zustand') || id.includes('jotai')) {
              return 'vendor-state';
            }
            
            // Utility libraries
            if (id.includes('lodash') || id.includes('ramda') || id.includes('date-fns')) {
              return 'vendor-utils';
            }
            
            // Charts and visualization
            if (id.includes('chart') || id.includes('d3') || id.includes('recharts')) {
              return 'vendor-charts';
            }
            
            // HTTP clients
            if (id.includes('axios') || id.includes('fetch') || id.includes('swr')) {
              return 'vendor-http';
            }
            
            // Forms and validation
            if (id.includes('formik') || id.includes('react-hook-form') || id.includes('yup')) {
              return 'vendor-forms';
            }
            
            // Testing utilities (обычно не включаются в production)
            if (id.includes('testing-library') || id.includes('jest')) {
              return 'vendor-testing';
            }
            
            // Other vendor libraries
            return 'vendor-misc';
          }

          // 2. Application code
          // Auth module
          if (id.includes('/src/auth/') || id.includes('/src/user/') || id.includes('/src/login/')) {
            return 'app-auth';
          }
          
          // Admin features
          if (id.includes('/src/admin/') || id.includes('/src/management/')) {
            return 'app-admin';
          }
          
          // Dashboard and analytics
          if (id.includes('/src/dashboard/') || id.includes('/src/analytics/')) {
            return 'app-dashboard';
          }
          
          // Settings and configuration
          if (id.includes('/src/settings/') || id.includes('/src/config/')) {
            return 'app-settings';
          }
          
          // Shared utilities and components
          if (id.includes('/src/shared/') || id.includes('/src/common/')) {
            return 'app-shared';
          }
          
          // API and services
          if (id.includes('/src/api/') || id.includes('/src/services/')) {
            return 'app-api';
          }

          // 3. Feature-based chunks
          if (id.includes('/src/features/')) {
            const featureName = id.split('/src/features/')[1]?.split('/')[0];
            return featureName ? `feature-${featureName}` : 'features';
          }

          // Default: не группируем
          return undefined;
        },
      },

      // Внешние зависимости (не включаем в bundle)
      external: [
        // Исключаем большие библиотеки, которые лучше загружать через CDN
        // 'react',
        // 'react-dom',
      ],
    },

    // Оптимизация CSS
    cssCodeSplit: true,
    cssMinify: true,
  },

  // Dependency optimization
  optimizeDeps: {
    // Предварительная обработка больших зависимостей
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@emotion/react',
      '@emotion/styled',
    ],
    
    // Исключаем из предварительной обработки
    exclude: [
      '@vite/client',
      '@vite/env',
    ],
    
    // Принудительная оптимизация для ESM модулей
    force: false,
  },

  // Настройки dev сервера (только для разработки)
  server: {
    // Включаем HMR для лучшего DX
    hmr: true,
    
    // Порт для dev сервера
    port: 3001,
    
    // Автоматическое открытие браузера
    open: false,
    
    // CORS настройки
    cors: true,
  },

  // Preview настройки (для production preview)
  preview: {
    port: 3001,
    strictPort: true,
  },

  // Экспериментальные функции
  experimental: {
    // Включаем renderBuiltUrl для кастомизации URL ассетов
    renderBuiltUrl(filename, { hostType }) {
      if (hostType === 'js') {
        // Для JS chunks можем добавить CDN префикс
        return `${filename}`;
      } else {
        // Для ассетов используем относительные пути
        return `./${filename}`;
      }
    },
  },

  // Define глобальные константы
  define: {
    __CODE_SPLITTING_ENABLED__: true,
    __CHUNK_STRATEGY__: JSON.stringify('aggressive'),
    __BUILD_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },
});

/**
 * Дополнительные настройки для production
 */
export const productionConfig = defineConfig({
  // Наследуем базовую конфигурацию
  ...module.exports.default,
  
  build: {
    ...module.exports.default.build,
    
    // Более агрессивная минификация для production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.warn', 'console.error'],
        passes: 2, // Два прохода минификации
      },
    },
    
    // Отключаем sourcemap для production
    sourcemap: false,
    
    // Строгая проверка размера chunks
    chunkSizeWarningLimit: 250,
  },
});
