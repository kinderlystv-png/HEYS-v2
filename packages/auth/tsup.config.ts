import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  minify: false,
  external: [
    'react', 
    'react-dom', 
    '@supabase/supabase-js',
    'next',
    'next/router',
  ],
  treeshake: true,
  target: 'es2020',
  outDir: 'dist',
});
