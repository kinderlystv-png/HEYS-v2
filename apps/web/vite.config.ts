import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    // Bundle analyzer отключен из-за конфликта версий rollup
    // Используем отдельный скрипт для анализа
    // Копирование CSS модулей в dist для production
    viteStaticCopy({
      targets: [
        {
          src: 'styles/modules',
          dest: 'styles'
        },
        // Юридические документы для ConsentScreen
        {
          src: '../../docs/legal',
          dest: 'docs'
        },
        // Виджеты для InsightsTab
        {
          src: 'widgets',
          dest: '.'
        },
        // Modular Predictive Insights (15 pi_*.js files)
        {
          src: 'insights',
          dest: '.'
        }
      ]
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Advanced Tree Shaking Configuration - Performance Sprint Day 2
    rollupOptions: {
      // External: workspace packages не используются в legacy web app
      // React загружается через CDN, legacy JS файлы не импортируют packages
      external: [
        '@heys/shared',
        '@heys/storage', 
        '@heys/search',
        '@heys/core',
        '@heys/ui',
        '@heys/logger',
      ],
      output: {
        // manualChunks отключены — legacy app использует vanilla JS + React CDN
        // Packages билдятся отдельно для других apps (tg-mini, mobile)
        // Оптимизируем имена файлов
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
      // Enhanced Tree shaking configuration - Performance Sprint Day 2
      treeshake: {
        preset: 'recommended',
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
        unknownGlobalSideEffects: false,
        // Агрессивная оптимизация для Performance Sprint
        annotations: true,
        correctVarValueBeforeDeclaration: false,
      },
    },
    // Enhanced minification - Performance Sprint Day 2
    minify: 'terser',
    terserOptions: {
      compress: {
        // Удаляем все console логи
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        // Агрессивная оптимизация
        passes: 3,
        unsafe: true,
        unsafe_comps: true,
        unsafe_Function: true,
        unsafe_math: true,
        unsafe_symbols: true,
        unsafe_methods: true,
        unsafe_proto: true,
        unsafe_regexp: true,
        // Удаляем мертвый код
        dead_code: true,
        unused: true,
        // Встраивание функций
        inline: 2,
      },
      mangle: {
        safari10: true,
        // Мангл всех имен включая топ-левел
        toplevel: true,
      },
      format: {
        comments: false,
        // Экономим байты
        ascii_only: true,
        wrap_iife: true,
      },
    },
    // Размер чанков
    chunkSizeWarningLimit: 500,
    // Source maps для production
    sourcemap: 'hidden',
    // Оптимизация CSS
    cssCodeSplit: true,
    cssMinify: true,
    // Target
    target: 'es2020',
    // Поддержка legacy браузеров
    polyfillModulePreload: true,
  },
  // Оптимизация для dev
  server: {
    port: parseInt(process.env.PORT || '3001'),
    host: true,
    strictPort: true,
    // Performance headers
    headers: {
      'Cache-Control': 'public, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
    // HMR configuration
    hmr: {
      port: parseInt(process.env.PORT || '3001'),
    },
    proxy: {
      '/api/sms': {
        target: `http://localhost:${process.env.API_PORT || '4001'}`,
        changeOrigin: true,
      },
      '/api': {
        target: `http://localhost:${process.env.API_PORT || '4001'}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    // Static files из корня проекта (для docs/legal)
    fs: {
      allow: ['..', '../..', '../../docs'],
    },
  },
  // Предварительная оптимизация зависимостей - Performance Sprint
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime'],
    // Force re-optimization
    force: process.env.NODE_ENV === 'development',
  },
  // Performance optimizations для Production
  esbuild: {
    // Drop console в production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    // Минификация имен
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
    // Оптимизация для современных браузеров
    target: 'es2020',
  },
});
