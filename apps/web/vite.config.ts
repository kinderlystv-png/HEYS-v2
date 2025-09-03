import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // Базовая конфигурация без дополнительных плагинов
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@heys/core': path.resolve(__dirname, '../../packages/core/src'),
      '@heys/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@heys/search': path.resolve(__dirname, '../../packages/search/src'),
      '@heys/storage': path.resolve(__dirname, '../../packages/storage/src'),
      '@heys/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@heys/analytics': path.resolve(__dirname, '../../packages/analytics/src'),
      '@heys/gaming': path.resolve(__dirname, '../../packages/gaming/src'),
    },
  },
  build: {
    // Advanced Tree Shaking Configuration - Performance Sprint Day 2
    rollupOptions: {
      // External dependencies bundling for Performance Sprint
      external: [],
      output: {
        manualChunks: {
          // React ecosystem в отдельный chunk
          react: ['react', 'react-dom'],
          // Vendor libraries
          vendor: ['@heys/shared', '@heys/storage'],
          // Feature modules
          features: ['@heys/search', '@heys/analytics', '@heys/gaming'],
          // Core functionality
          core: ['@heys/core', '@heys/ui'],
        },
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
    // Performance headers
    headers: {
      'Cache-Control': 'public, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || '4001'}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // Предварительная оптимизация зависимостей - Performance Sprint
  optimizeDeps: {
    include: [
      '@heys/shared',
      // React pre-bundling для лучшей производительности
      'react/jsx-runtime',
    ],
    exclude: [
      '@heys/core',
      '@heys/ui', 
      '@heys/search',
      '@heys/analytics',
      '@heys/gaming',
      '@heys/storage',
    ],
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
