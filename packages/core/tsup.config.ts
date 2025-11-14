import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'server/router': 'src/server/router.ts',
  },
  format: ['cjs', 'esm'],
  dts: false, // Временно отключаем для теста
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: true,
  external: ['react', 'react-dom', 'express'],
  esbuildOptions(options) {
    options.drop = ['console', 'debugger'];
  },
});
