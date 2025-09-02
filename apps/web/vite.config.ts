import path from 'path';

import { defineConfig } from 'vite';
import compression from 'vite-plugin-compression';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    // Gzip/Brotli сжатие
    compression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
    // PWA поддержка
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'HEYS - Nutrition Tracker',
        short_name: 'HEYS',
        theme_color: '#4ade80',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 1 день
              },
            },
          },
        ],
      },
    }),
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
    // Оптимизация чанков
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['@heys/shared', '@heys/storage'],
          features: ['@heys/search', '@heys/analytics', '@heys/gaming'],
          core: ['@heys/core', '@heys/ui'],
        },
      },
    },
    // Минимизация
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
        passes: 2,
      },
      mangle: {
        safari10: true,
      },
      format: {
        comments: false,
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
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || '4001'}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // Предварительная оптимизация зависимостей
  optimizeDeps: {
    include: ['@heys/shared'],
    exclude: [
      '@heys/core',
      '@heys/ui',
      '@heys/search',
      '@heys/analytics',
      '@heys/gaming',
      '@heys/storage',
    ],
  },
});
