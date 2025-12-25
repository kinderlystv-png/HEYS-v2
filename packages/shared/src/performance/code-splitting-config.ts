// filepath: packages/shared/src/performance/code-splitting-config.ts

/**
 * Конфигурации code splitting для различных бандлеров
 * Предоставляет готовые настройки для оптимального разделения кода
 */

/**
 * Конфигурация Vite для code splitting
 */
export const viteCodeSplittingConfig = {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Основные vendor библиотеки
          'vendor-react': ['react', 'react-dom'],
          'vendor-router': ['react-router-dom', '@reach/router'],
          'vendor-ui': ['@mui/material', '@emotion/react', '@emotion/styled'],
          'vendor-utils': ['lodash', 'moment', 'date-fns'],
          'vendor-charts': ['chart.js', 'react-chartjs-2', 'recharts'],

          // Специфичные для проекта chunks
          'core-auth': ['./src/auth/', './src/user/'],
          'core-api': ['./src/api/', './src/services/'],
          'features-dashboard': ['./src/dashboard/', './src/analytics/'],
          'features-admin': ['./src/admin/', './src/management/'],
        },
        // Настройка именования файлов
        chunkFileNames: (chunkInfo: { facadeModuleId?: string | null }) => {
          const facadeModuleId = chunkInfo.facadeModuleId
            ? chunkInfo.facadeModuleId.split('/').pop()?.replace('.tsx', '').replace('.ts', '')
            : 'chunk';
          return `chunks/${facadeModuleId}-[hash].js`;
        },
        entryFileNames: 'entries/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Настройки размера chunks
    chunkSizeWarningLimit: 500, // 500KB warning
    target: 'esnext',
    sourcemap: true,

    // Минификация с оптимизацией для chunks
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info'],
      },
      mangle: {
        safari10: true,
      },
    },
  },

  // Оптимизация dependency
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
    exclude: ['@vite/client', '@vite/env'],
  },
};

/**
 * Конфигурация Webpack для code splitting
 */
export const webpackCodeSplittingConfig = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        // Vendor chunks
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10,
          reuseExistingChunk: true,
        },

        // React ecosystem
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom|react-router)[\\/]/,
          name: 'react',
          chunks: 'all',
          priority: 20,
        },

        // UI libraries
        ui: {
          test: /[\\/]node_modules[\\/](@mui|@emotion|antd|bootstrap)[\\/]/,
          name: 'ui-libs',
          chunks: 'all',
          priority: 15,
        },

        // Utility libraries
        utils: {
          test: /[\\/]node_modules[\\/](lodash|moment|date-fns|uuid)[\\/]/,
          name: 'utils',
          chunks: 'all',
          priority: 12,
        },

        // Application specific
        common: {
          test: /[\\/]src[\\/](shared|common|utils)[\\/]/,
          name: 'common',
          chunks: 'all',
          priority: 8,
          minChunks: 2,
        },
      },

      // Настройки размеров
      maxInitialRequests: 20,
      maxAsyncRequests: 20,
      minSize: 20000, // 20KB
      maxSize: 250000, // 250KB

      // Автоматическое именование
      automaticNameDelimiter: '-',
      enforceSizeThreshold: 50000,
    },

    // Runtime chunk
    runtimeChunk: {
      name: 'runtime',
    },
  },
};

/**
 * Конфигурация Rollup для code splitting
 */
export const rollupCodeSplittingConfig = {
  output: {
    manualChunks: (id: string) => {
      // Node modules
      if (id.includes('node_modules')) {
        // React ecosystem
        if (id.includes('react') || id.includes('react-dom')) {
          return 'react';
        }

        // Router
        if (id.includes('router')) {
          return 'router';
        }

        // UI libraries
        if (id.includes('@mui') || id.includes('@emotion')) {
          return 'ui';
        }

        // Utilities
        if (id.includes('lodash') || id.includes('moment')) {
          return 'utils';
        }

        // Other vendors
        return 'vendor';
      }

      // Application code
      if (id.includes('src/auth') || id.includes('src/user')) {
        return 'auth';
      }

      if (id.includes('src/admin') || id.includes('src/management')) {
        return 'admin';
      }

      if (id.includes('src/dashboard') || id.includes('src/analytics')) {
        return 'dashboard';
      }

      // Default chunk
      return undefined;
    },

    chunkFileNames: 'chunks/[name]-[hash].js',
    entryFileNames: 'entries/[name]-[hash].js',
    assetFileNames: 'assets/[name]-[hash].[ext]',
  },
};

/**
 * Пресеты конфигураций для разных типов проектов
 */
export const codeSplittingPresets = {
  // Агрессивное разделение для больших приложений
  aggressive: {
    description: 'Максимальное разделение кода для больших приложений',
    chunkSizeWarningLimit: 300,
    maxChunks: 50,
    minChunkSize: 10000, // 10KB
    features: ['route-splitting', 'component-splitting', 'vendor-splitting', 'feature-splitting'],
  },

  // Сбалансированное разделение
  balanced: {
    description: 'Оптимальный баланс между количеством chunks и производительностью',
    chunkSizeWarningLimit: 500,
    maxChunks: 20,
    minChunkSize: 30000, // 30KB
    features: ['route-splitting', 'vendor-splitting'],
  },

  // Консервативное разделение
  conservative: {
    description: 'Минимальное разделение для небольших проектов',
    chunkSizeWarningLimit: 800,
    maxChunks: 10,
    minChunkSize: 100000, // 100KB
    features: ['vendor-splitting'],
  },

  // Оптимизация для мобильных устройств
  mobile: {
    description: 'Оптимизация для мобильных устройств с медленным интернетом',
    chunkSizeWarningLimit: 200,
    maxChunks: 15,
    minChunkSize: 15000, // 15KB
    features: ['route-splitting', 'lazy-loading', 'preload-critical'],
  },
};

/**
 * Фабричная функция для создания конфигурации на основе проекта
 */
export function createCodeSplittingConfig(
  bundler: 'vite' | 'webpack' | 'rollup',
  preset: keyof typeof codeSplittingPresets = 'balanced',
  customOptions: Record<string, unknown> = {},
) {
  const presetConfig = codeSplittingPresets[preset];

  switch (bundler) {
    case 'vite':
      return {
        ...viteCodeSplittingConfig,
        build: {
          ...viteCodeSplittingConfig.build,
          chunkSizeWarningLimit: presetConfig.chunkSizeWarningLimit,
          ...customOptions,
        },
      };

    case 'webpack':
      return {
        ...webpackCodeSplittingConfig,
        optimization: {
          ...webpackCodeSplittingConfig.optimization,
          splitChunks: {
            ...(webpackCodeSplittingConfig.optimization.splitChunks as object),
            maxAsyncRequests: presetConfig.maxChunks,
            minSize: presetConfig.minChunkSize,
            ...((customOptions.splitChunks as object) || {}),
          },
        },
      };

    case 'rollup':
      return {
        ...rollupCodeSplittingConfig,
        ...customOptions,
      };

    default:
      throw new Error(`Неподдерживаемый бандлер: ${bundler}`);
  }
}

/**
 * Хелперы для React code splitting
 * Примеры использования для создания lazy компонентов
 */
export const reactSplittingHelpers = {
  // Примеры создания lazy компонентов
  examples: {
    // Пример 1: Базовый lazy компонент
    basicLazy: `
const LazyComponent = React.lazy(() => import('./Component'));

function App() {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <LazyComponent />
    </React.Suspense>
  );
}`,

    // Пример 2: Route-based splitting
    routeSplitting: `
const HomePage = React.lazy(() => import('./pages/Home'));
const AboutPage = React.lazy(() => import('./pages/About'));

function App() {
  return (
    <Router>
      <React.Suspense fallback={<div>Loading page...</div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </React.Suspense>
    </Router>
  );
}`,

    // Пример 3: Условный lazy loading
    conditionalLazy: `
function FeatureComponent({ showAdvanced }: { showAdvanced: boolean }) {
  const [AdvancedComponent, setAdvancedComponent] = useState(null);
  
  useEffect(() => {
    if (showAdvanced) {
      import('./AdvancedComponent').then(module => {
        setAdvancedComponent(() => module.default);
      });
    }
  }, [showAdvanced]);
  
  return (
    <div>
      <BasicContent />
      {AdvancedComponent && <AdvancedComponent />}
    </div>
  );
}`,
  },

  // Утилиты для preloading
  preloadUtils: {
    // Preload критических компонентов
    preloadCritical: `
// Preload на hover или на основе пользовательского поведения
const preloadComponent = (importFn: () => Promise<any>) => {
  const componentImport = importFn();
  componentImport.catch(() => {}); // Предотвращение unhandled rejection
  return componentImport;
};

// Использование
onMouseEnter={() => preloadComponent(() => import('./ExpensiveComponent'))}`,

    // Intersection Observer для lazy loading
    intersectionObserver: `
const LazySection = ({ children }: { children: React.ReactNode }) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    
    if (ref.current) {
      observer.observe(ref.current);
    }
    
    return () => observer.disconnect();
  }, []);
  
  return (
    <div ref={ref}>
      {isVisible ? children : <div>Loading section...</div>}
    </div>
  );
};`,
  },
};

// Re-export всех конфигураций
export {
  rollupCodeSplittingConfig as rollup,
  viteCodeSplittingConfig as vite,
  webpackCodeSplittingConfig as webpack,
};
