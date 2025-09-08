import { defineConfig } from 'vite';

export default defineConfig({
  // Опции сервера разработки
  server: {
    port: 3000,
    host: true,
    fs: {
      allow: ['..'],
    },
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
