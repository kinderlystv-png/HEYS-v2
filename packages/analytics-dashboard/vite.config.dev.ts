import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    open: true,
    host: true
  },
  resolve: {
    alias: {
      // Workspace aliases для dev режима
      '@heys/shared': resolve(__dirname, '../shared/src'),
      '@heys/threat-detection': resolve(__dirname, '../threat-detection/src'),
      '@heys/core': resolve(__dirname, '../core/src'),
      // Browser polyfills
      'events': 'eventemitter3',
      'buffer': 'buffer',
      'process': 'process/browser'
    }
  },
  define: {
    // Mock environment variables для demo
    'process.env.REACT_APP_SUPABASE_URL': '"https://demo.supabase.co"',
    'process.env.REACT_APP_SUPABASE_ANON_KEY': '"demo-key"',
    'global': 'window'
  },
  optimizeDeps: {
    include: ['eventemitter3', 'buffer', 'process']
  },
  build: {
    outDir: 'dist-demo',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  }
});
