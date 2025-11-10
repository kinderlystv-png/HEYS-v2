// filepath: packages/shared/src/performance/configs/vite-lazy-loading.config.ts

import { defineConfig, splitVendorChunkPlugin, UserConfig } from 'vite';

/**
 * Конфигурация Vite для оптимизации ленивой загрузки
 */
export function createLazyLoadingViteConfig(
  options: {
    /**
     * Включить агрессивное code splitting
     */
    enableAggressiveSplitting?: boolean;

    /**
     * Минимальный размер чанка для создания отдельного файла (в байтах)
     */
    minChunkSize?: number;

    /**
     * Максимальный размер чанка (в байтах)
     */
    maxChunkSize?: number;

    /**
     * Стратегия группировки vendor библиотек
     */
    vendorStrategy?: 'single' | 'multiple' | 'framework';

    /**
     * Включить preload для критических чанков
     */
    enablePreload?: boolean;

    /**
     * Настройки для анализа бандла
     */
    enableBundleAnalysis?: boolean;
  } = {},
): UserConfig {
  const {
    enableAggressiveSplitting = true,
    minChunkSize = 20000, // 20KB
    maxChunkSize = 500000, // 500KB
    vendorStrategy = 'framework',
    enablePreload = true,
    enableBundleAnalysis = false,
  } = options;

  return defineConfig({
    build: {
      // Базовые настройки для оптимизации
      target: 'es2015',
      minify: 'terser',
      sourcemap: true,

      // Настройки code splitting
      rollupOptions: {
        output: {
          // Стратегия именования чанков
          chunkFileNames: (chunkInfo) => {
            const facadeModuleId = chunkInfo.facadeModuleId;

            if (facadeModuleId) {
              // Создаем читаемые имена для чанков
              if (facadeModuleId.includes('node_modules')) {
                const packageName = extractPackageName(facadeModuleId);
                return `vendor-${packageName}-[hash].js`;
              }

              if (facadeModuleId.includes('pages/') || facadeModuleId.includes('routes/')) {
                const routeName = extractRouteName(facadeModuleId);
                return `page-${routeName}-[hash].js`;
              }

              if (facadeModuleId.includes('components/')) {
                const componentName = extractComponentName(facadeModuleId);
                return `component-${componentName}-[hash].js`;
              }
            }

            return 'chunk-[name]-[hash].js';
          },

          entryFileNames: 'entry-[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',

          // Настройка manual chunks для оптимизации
          manualChunks: enableAggressiveSplitting
            ? createManualChunks(vendorStrategy, minChunkSize)
            : undefined,
        },

        // Внешние зависимости (если нужно)
        external: (id) => {
          // Можно вынести тяжелые библиотеки во внешние зависимости
          return false;
        },
      },

      // Настройки Terser для оптимизации
      terserOptions: {
        compress: {
          drop_console: true, // Удаляем console.log в production
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info'], // Удаляем специфичные функции
          passes: 2, // Несколько проходов оптимизации
        },
        mangle: {
          properties: {
            regex: /^_/, // Mangling приватных свойств
          },
        },
        format: {
          comments: false, // Удаляем комментарии
        },
      },
    },

    // Оптимизация для разработки
    optimizeDeps: {
      // Предварительная сборка зависимостей
      include: [
        // Библиотеки которые стоит pre-bundle
        'lodash-es',
        'date-fns',
        'axios',
      ],

      // Исключения из pre-bundling
      exclude: [
        // Библиотеки с ESM
        '@vueuse/core',
      ],
    },

    // Настройки сервера для разработки
    server: {
      // Включаем HTTP/2 для better multiplexing
      https: false, // Поставить true для локального HTTPS

      // Настройки CORS если нужно
      cors: true,

      // Настройки прокси для API
      proxy: enablePreload
        ? {
            '/api': {
              target: 'http://localhost:3001',
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          }
        : undefined,
    },

    // Плагины для ленивой загрузки
    plugins: [
      // Базовый плагин для разделения vendor библиотек
      splitVendorChunkPlugin(),

      // Кастомный плагин для ленивой загрузки
      createLazyLoadingPlugin({
        enablePreload,
        enableBundleAnalysis,
      }),
    ],
  });
}

/**
 * Создание стратегии manual chunks
 */
function createManualChunks(strategy: 'single' | 'multiple' | 'framework', minChunkSize: number) {
  return (id: string) => {
    // Vendor библиотеки
    if (id.includes('node_modules')) {
      const packageName = extractPackageName(id);

      switch (strategy) {
        case 'single':
          return 'vendor';

        case 'framework':
          // Группируем по фреймворкам
          if (id.includes('react') || id.includes('react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('vue')) {
            return 'vendor-vue';
          }
          if (id.includes('angular')) {
            return 'vendor-angular';
          }
          if (id.includes('lodash') || id.includes('moment') || id.includes('date-fns')) {
            return 'vendor-utils';
          }
          return 'vendor-misc';

        case 'multiple':
          // Отдельный чанк для каждой крупной библиотеки
          const largeLibraries = ['react', 'vue', 'angular', 'lodash', 'moment', 'three', 'chart'];
          const foundLarge = largeLibraries.find((lib) => packageName.includes(lib));
          if (foundLarge) {
            return `vendor-${foundLarge}`;
          }
          return `vendor-${packageName}`;
      }
    }

    // Компоненты UI библиотек
    if (id.includes('components/ui/') || id.includes('@/components/ui/')) {
      return 'ui-components';
    }

    // Утилиты
    if (id.includes('utils/') || id.includes('@/utils/')) {
      return 'utils';
    }

    // Страницы/роуты
    if (id.includes('pages/') || id.includes('routes/') || id.includes('views/')) {
      const routeName = extractRouteName(id);
      return `page-${routeName}`;
    }

    // Компоненты
    if (id.includes('components/')) {
      const componentDir = extractComponentDirectory(id);
      if (componentDir) {
        return `components-${componentDir}`;
      }
    }

    return undefined;
  };
}

/**
 * Извлечение имени пакета из пути
 */
function extractPackageName(id: string): string {
  const match = id.match(/node_modules\/([^\/]+)/);
  if (match) {
    // Обработка scoped packages (@scope/package)
    if (match[1].startsWith('@')) {
      const nextMatch = id.match(/node_modules\/@[^\/]+\/([^\/]+)/);
      return nextMatch ? `${match[1]}-${nextMatch[1]}` : match[1];
    }
    return match[1];
  }
  return 'unknown';
}

/**
 * Извлечение имени роута из пути
 */
function extractRouteName(id: string): string {
  const match = id.match(/\/(?:pages|routes|views)\/([^\/]+)/);
  return match ? match[1].replace(/\.(vue|tsx?|jsx?)$/, '') : 'unknown';
}

/**
 * Извлечение имени компонента из пути
 */
function extractComponentName(id: string): string {
  const match = id.match(/\/components\/([^\/]+)/);
  return match ? match[1] : 'unknown';
}

/**
 * Извлечение директории компонентов
 */
function extractComponentDirectory(id: string): string | null {
  const match = id.match(/\/components\/([^\/]+)\//);
  return match ? match[1] : null;
}

/**
 * Создание кастомного плагина для ленивой загрузки
 */
function createLazyLoadingPlugin(options: {
  enablePreload: boolean;
  enableBundleAnalysis: boolean;
}) {
  return {
    name: 'lazy-loading-optimizer',

    generateBundle(outputOptions: any, bundle: any) {
      if (options.enableBundleAnalysis) {
        // Анализ размеров чанков
        const chunkSizes: Array<{ name: string; size: number }> = [];

        Object.entries(bundle).forEach(([fileName, chunk]: [string, any]) => {
          if (chunk.type === 'chunk') {
            const size = Buffer.byteLength(chunk.code, 'utf8');
            chunkSizes.push({ name: fileName, size });
          }
        });

        // Сортируем по размеру
        chunkSizes.sort((a, b) => b.size - a.size);

        console.log('\n📊 Анализ размеров чанков:');
        chunkSizes.slice(0, 10).forEach((chunk, index) => {
          const sizeKB = (chunk.size / 1024).toFixed(1);
          console.log(`   ${index + 1}. ${chunk.name}: ${sizeKB} KB`);
        });

        // Предупреждения о больших чанках
        const largeChunks = chunkSizes.filter((chunk) => chunk.size > 500000); // 500KB
        if (largeChunks.length > 0) {
          console.log('\n⚠️  Предупреждение: обнаружены большие чанки:');
          largeChunks.forEach((chunk) => {
            const sizeKB = (chunk.size / 1024).toFixed(1);
            console.log(`   • ${chunk.name}: ${sizeKB} KB`);
          });
          console.log('   Рассмотрите дополнительное разделение этих чанков.\n');
        }
      }
    },

    transformIndexHtml(html: string) {
      if (options.enablePreload) {
        // Добавляем preload теги для критических ресурсов
        const preloadTags = [
          '<link rel="preload" href="/fonts/main.woff2" as="font" type="font/woff2" crossorigin>',
          '<link rel="preload" href="/images/hero.webp" as="image">',
          // Добавьте другие критические ресурсы
        ].join('\n    ');

        return html.replace('<head>', `<head>\n    ${preloadTags}`);
      }
      return html;
    },
  };
}

/**
 * Конфигурация для React приложений
 */
export function createReactLazyConfig(options = {}) {
  return createLazyLoadingViteConfig({
    vendorStrategy: 'framework',
    enableAggressiveSplitting: true,
    ...options,
  });
}

/**
 * Конфигурация для Vue приложений
 */
export function createVueLazyConfig(options = {}) {
  return createLazyLoadingViteConfig({
    vendorStrategy: 'framework',
    enableAggressiveSplitting: true,
    ...options,
  });
}

/**
 * Конфигурация для больших приложений
 */
export function createEnterpriseLazyConfig(options = {}) {
  return createLazyLoadingViteConfig({
    enableAggressiveSplitting: true,
    minChunkSize: 10000, // 10KB - более агрессивное разделение
    maxChunkSize: 250000, // 250KB - меньшие чанки
    vendorStrategy: 'multiple',
    enablePreload: true,
    enableBundleAnalysis: true,
    ...options,
  });
}

/**
 * Экспорт всех конфигураций
 */
export default {
  createLazyLoadingViteConfig,
  createReactLazyConfig,
  createVueLazyConfig,
  createEnterpriseLazyConfig,
};
