import { defineConfig } from 'vite';

export default defineConfig({
  // Опции сервера разработки
  server: {
    port: 3002,
    host: true,
    fs: {
      allow: ['..'],
    },
    // Исправление WebSocket проблем для HMR
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 3002,
      clientPort: 3002
    },
    // Настройки прокси для API
    proxy: {
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    },
    // Решение проблем с CORS
    cors: true
  },

  // Настройки сборки
  build: {
    target: 'es2022',
    minify: 'terser',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          utils: ['@heys/shared', '@heys/core'],
          ui: ['@heys/ui'],
        },
      },
    },
  },

  // Оптимизация зависимостей
  optimizeDeps: {
    include: [
      '@heys/logger',
      '@heys/shared',
      '@heys/core',
      '@heys/ui',
    ],
  },

  // Переменные окружения
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
