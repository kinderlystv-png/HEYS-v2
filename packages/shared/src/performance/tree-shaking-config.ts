// filepath: packages/shared/src/performance/tree-shaking-config.ts

/**
 * Конфигурации tree shaking для различных bundler
 * Предварительно настроенные оптимизации для популярных сборщиков
 */

import type { TreeShakingConfig } from './TreeShaker';

/**
 * Конфигурация Vite для максимального tree shaking
 */
export const viteTreeShakingConfig = {
  build: {
    rollupOptions: {
      // Включаем агрессивный tree shaking
      treeshake: {
        preset: 'recommended',
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        unknownGlobalSideEffects: false,
      },
      // Внешние зависимости (не включаем в bundle)
      external: ['react', 'react-dom', '@supabase/supabase-js', 'lodash'],
      output: {
        // Mangling для уменьшения размера
        manualChunks: {
          vendor: ['react', 'react-dom'],
          utils: ['lodash', 'date-fns'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
    // Минификация с tree shaking
    minify: 'terser',
    terserOptions: {
      compress: {
        dead_code: true,
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
    },
  },
  // Включаем анализ side effects
  define: {
    'process.env.NODE_ENV': '"production"',
  },
};

/**
 * Конфигурация Webpack для tree shaking
 */
export const webpackTreeShakingConfig = {
  mode: 'production',
  optimization: {
    // Включаем tree shaking
    usedExports: true,
    sideEffects: false,
    // Минификация с tree shaking
    minimize: true,
    minimizer: [
      // TerserPlugin с настройками для tree shaking
      {
        terserOptions: {
          compress: {
            dead_code: true,
            drop_console: true,
            drop_debugger: true,
            pure_funcs: ['console.log', 'console.info'],
          },
          mangle: true,
        },
      },
    ],
    // Разделение на chunks
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
  },
  // Настройки resolve для tree shaking
  resolve: {
    // Используем ES modules версии библиотек
    mainFields: ['module', 'main'],
    alias: {
      // Замена на ES modules версии
      lodash: 'lodash-es',
    },
  },
};

/**
 * Конфигурация Rollup для библиотек
 */
export const rollupTreeShakingConfig = {
  // Внешние зависимости
  external: ['react', 'react-dom', '@supabase/supabase-js'],
  output: {
    // ES modules для лучшего tree shaking
    format: 'es',
    // Preserve modules для лучшего tree shaking потребителями
    preserveModules: true,
    preserveModulesRoot: 'src',
  },
  treeshake: {
    // Агрессивные настройки tree shaking
    preset: 'recommended',
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    unknownGlobalSideEffects: false,
    // Пользовательские проверки
    pureExternalModules: true,
  },
  plugins: [
    // Плагины для лучшего tree shaking
    // resolve(), commonjs(), typescript()
  ],
};

/**
 * Конфигурация ESBuild
 */
export const esbuildTreeShakingConfig = {
  bundle: true,
  minify: true,
  treeShaking: true,
  format: 'esm',
  // Внешние зависимости
  external: ['react', 'react-dom', '@supabase/supabase-js'],
  // Настройки для tree shaking
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  // Удаление dead code
  drop: ['console', 'debugger'],
  // Лучшая поддержка ES modules
  platform: 'browser',
  target: 'es2020',
};

/**
 * Предустановленные конфигурации TreeShaker
 */
export const treeShakingPresets: Record<string, Partial<TreeShakingConfig>> = {
  // Агрессивная оптимизация для production
  aggressive: {
    bundler: 'vite',
    aggressive: true,
    preserveTypes: false,
    include: ['src/**/*.{ts,tsx,js,jsx}'],
    exclude: [
      '**/*.test.{ts,tsx,js,jsx}',
      '**/*.spec.{ts,tsx,js,jsx}',
      '**/*.stories.{ts,tsx,js,jsx}',
      '**/node_modules/**',
      '**/*.d.ts',
    ],
  },

  // Безопасная оптимизация с сохранением типов
  safe: {
    bundler: 'vite',
    aggressive: false,
    preserveTypes: true,
    include: ['src/**/*.{ts,tsx,js,jsx}'],
    exclude: ['**/*.test.{ts,tsx,js,jsx}', '**/*.spec.{ts,tsx,js,jsx}', '**/node_modules/**'],
  },

  // Для библиотек и компонентов
  library: {
    bundler: 'rollup',
    aggressive: false,
    preserveTypes: true,
    include: ['src/**/*.{ts,tsx}'],
    exclude: [
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/*.stories.{ts,tsx}',
      '**/node_modules/**',
    ],
  },

  // Для legacy проектов
  legacy: {
    bundler: 'webpack',
    aggressive: false,
    preserveTypes: true,
    include: ['src/**/*.{js,jsx,ts,tsx}'],
    exclude: ['**/*.test.{js,jsx,ts,tsx}', '**/*.spec.{js,jsx,ts,tsx}', '**/node_modules/**'],
  },
};

/**
 * Получает конфигурацию bundler по имени
 */
export function getBundlerConfig(bundler: string) {
  switch (bundler) {
    case 'vite':
      return viteTreeShakingConfig;
    case 'webpack':
      return webpackTreeShakingConfig;
    case 'rollup':
      return rollupTreeShakingConfig;
    case 'esbuild':
      return esbuildTreeShakingConfig;
    default:
      throw new Error(`Неподдерживаемый bundler: ${bundler}`);
  }
}

/**
 * Получает preset конфигурации TreeShaker
 */
export function getTreeShakingPreset(
  preset: keyof typeof treeShakingPresets,
): Partial<TreeShakingConfig> {
  const config = treeShakingPresets[preset];
  if (!config) {
    throw new Error(`Неизвестный preset: ${preset}`);
  }
  return config;
}

/**
 * Создает объединенную конфигурацию для конкретного случая
 */
export function createTreeShakingConfig(
  bundler: 'vite' | 'webpack' | 'rollup' | 'esbuild',
  preset: keyof typeof treeShakingPresets = 'safe',
  overrides: Partial<TreeShakingConfig> = {},
): TreeShakingConfig {
  const baseConfig = getTreeShakingPreset(preset);

  return {
    bundler,
    ...baseConfig,
    ...overrides,
  } as TreeShakingConfig;
}
