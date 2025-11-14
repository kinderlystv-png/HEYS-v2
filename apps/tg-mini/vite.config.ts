import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@heys/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@heys/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@heys/logger': path.resolve(__dirname, '../../packages/logger/src/index.ts'),
    },
  },
  server: {
    port: 3002,
    host: true,
    strictPort: false,
    // Разрешаем доступ к dev-серверу через публичный ngrok-домен
    allowedHosts: ['tressy-cotyledonoid-vergie.ngrok-free.dev'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2020',
  },
});
