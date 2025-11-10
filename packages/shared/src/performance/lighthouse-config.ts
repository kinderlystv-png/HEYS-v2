/**
 * @fileoverview Конфигурация для Lighthouse анализа
 * Модуль обеспечивает настройку анализа производительности
 *
 * @author AI Assistant
 * @version 1.0.0
 * @since 2024
 */

import type { LighthouseConfig, LighthouseResults } from './LighthouseOptimizer';

/**
 * Конфигурация для различных типов анализа
 */
export const LIGHTHOUSE_CONFIGS = {
  /**
   * Быстрый анализ для разработки
   */
  development: {
    targetScore: 85,
    categoryTargets: {
      performance: 80,
      accessibility: 90,
      bestPractices: 85,
      seo: 90,
      pwa: 80,
    },
    optimizations: {
      enableCriticalResourceOptimization: true,
      enableImageOptimization: true,
      enableScriptOptimization: true,
      enableCSSOptimization: true,
      enableCaching: false,
      enableCompression: true,
      enableServiceWorker: false,
    },
    performanceThresholds: {
      firstContentfulPaint: 2000,
      largestContentfulPaint: 3000,
      firstInputDelay: 150,
      cumulativeLayoutShift: 0.15,
      speedIndex: 4000,
      totalBlockingTime: 300,
    },
    analysis: {
      runCount: 1,
      device: 'desktop' as const,
      throttling: 'none' as const,
      enableSourceMaps: true,
    },
  },

  /**
   * Производственный анализ
   */
  production: {
    targetScore: 92,
    categoryTargets: {
      performance: 90,
      accessibility: 95,
      bestPractices: 90,
      seo: 95,
      pwa: 85,
    },
    optimizations: {
      enableCriticalResourceOptimization: true,
      enableImageOptimization: true,
      enableScriptOptimization: true,
      enableCSSOptimization: true,
      enableCaching: true,
      enableCompression: true,
      enableServiceWorker: true,
    },
    performanceThresholds: {
      firstContentfulPaint: 1500,
      largestContentfulPaint: 2500,
      firstInputDelay: 100,
      cumulativeLayoutShift: 0.1,
      speedIndex: 3000,
      totalBlockingTime: 200,
    },
    analysis: {
      runCount: 3,
      device: 'both' as const,
      throttling: 'simulated3G' as const,
      enableSourceMaps: false,
    },
  },

  /**
   * CI/CD анализ
   */
  ci: {
    targetScore: 88,
    categoryTargets: {
      performance: 85,
      accessibility: 90,
      bestPractices: 85,
      seo: 90,
      pwa: 75,
    },
    optimizations: {
      enableCriticalResourceOptimization: true,
      enableImageOptimization: true,
      enableScriptOptimization: true,
      enableCSSOptimization: true,
      enableCaching: true,
      enableCompression: true,
      enableServiceWorker: false,
    },
    performanceThresholds: {
      firstContentfulPaint: 1800,
      largestContentfulPaint: 2800,
      firstInputDelay: 120,
      cumulativeLayoutShift: 0.12,
      speedIndex: 3500,
      totalBlockingTime: 250,
    },
    analysis: {
      runCount: 2,
      device: 'mobile' as const,
      throttling: 'simulated4G' as const,
      enableSourceMaps: false,
    },
  },
} as const;

/**
 * Lighthouse CLI конфигурация
 */
export const LIGHTHOUSE_CLI_CONFIG = {
  /**
   * Настройки для Chrome
   */
  chrome: {
    chromeFlags: [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  },

  /**
   * Настройки аудитов
   */
  audits: {
    /**
     * Основные аудиты производительности
     */
    performance: [
      'first-contentful-paint',
      'largest-contentful-paint',
      'first-meaningful-paint',
      'speed-index',
      'total-blocking-time',
      'cumulative-layout-shift',
      'interactive',
      'user-timings',
      'critical-request-chains',
      'redirects',
      'uses-optimized-images',
      'uses-webp-images',
      'uses-text-compression',
      'unused-css-rules',
      'unused-javascript',
      'modern-image-formats',
      'offscreen-images',
      'render-blocking-resources',
      'unminified-css',
      'unminified-javascript',
      'efficient-animated-content',
      'duplicated-javascript',
      'legacy-javascript',
    ],

    /**
     * Аудиты доступности
     */
    accessibility: [
      'accesskeys',
      'aria-allowed-attr',
      'aria-hidden-body',
      'aria-hidden-focus',
      'aria-input-field-name',
      'aria-required-attr',
      'aria-roles',
      'aria-valid-attr',
      'aria-valid-attr-value',
      'button-name',
      'bypass',
      'color-contrast',
      'definition-list',
      'dlitem',
      'document-title',
      'duplicate-id-active',
      'duplicate-id-aria',
      'form-field-multiple-labels',
      'frame-title',
      'heading-order',
      'html-has-lang',
      'html-lang-valid',
      'image-alt',
      'input-image-alt',
      'label',
      'link-name',
      'list',
      'listitem',
      'meta-refresh',
      'meta-viewport',
      'object-alt',
      'tabindex',
      'td-headers-attr',
      'th-has-data-cells',
      'valid-lang',
      'video-caption',
    ],
  },

  /**
   * Настройки сбора данных
   */
  gathering: {
    /**
     * Сетевые условия
     */
    networkConditions: {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    },

    /**
     * CPU throttling
     */
    cpuSlowdownMultiplier: 4,

    /**
     * Таймауты
     */
    maxWaitForLoad: 45000,
    maxWaitForFcp: 30000,
    pauseAfterLoadMs: 1000,
    networkQuietThresholdMs: 1000,
    cpuQuietThresholdMs: 1000,
  },
};

/**
 * Пороговые значения для метрик
 */
export const PERFORMANCE_THRESHOLDS = {
  /**
   * Core Web Vitals
   */
  coreWebVitals: {
    lcp: { good: 2500, poor: 4000 }, // Largest Contentful Paint
    fid: { good: 100, poor: 300 }, // First Input Delay
    cls: { good: 0.1, poor: 0.25 }, // Cumulative Layout Shift
    fcp: { good: 1800, poor: 3000 }, // First Contentful Paint
    inp: { good: 200, poor: 500 }, // Interaction to Next Paint
  },

  /**
   * Другие важные метрики
   */
  other: {
    speedIndex: { good: 3400, poor: 5800 },
    totalBlockingTime: { good: 200, poor: 600 },
    timeToInteractive: { good: 3800, poor: 7300 },
  },

  /**
   * Размеры ресурсов
   */
  resources: {
    imageSize: { good: 500000, poor: 1000000 }, // 500KB / 1MB
    jsSize: { good: 200000, poor: 500000 }, // 200KB / 500KB
    cssSize: { good: 100000, poor: 200000 }, // 100KB / 200KB
    fontSize: { good: 100000, poor: 300000 }, // 100KB / 300KB
  },
};

/**
 * Стратегии оптимизации для разных типов проблем
 */
export const OPTIMIZATION_STRATEGIES = {
  /**
   * Оптимизация изображений
   */
  images: {
    formats: ['webp', 'avif'],
    compression: {
      jpeg: 80,
      png: 85,
      webp: 80,
    },
    lazy: {
      threshold: '200px',
      rootMargin: '50px',
    },
    responsive: {
      breakpoints: [320, 640, 768, 1024, 1280, 1536],
      sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
    },
  },

  /**
   * Оптимизация JavaScript
   */
  javascript: {
    minification: true,
    compression: 'gzip',
    splitting: {
      vendor: true,
      dynamic: true,
      maxSize: 244000, // ~244KB
    },
    treeshaking: true,
    deadCodeElimination: true,
  },

  /**
   * Оптимизация CSS
   */
  css: {
    minification: true,
    purging: true,
    critical: {
      inline: true,
      extract: true,
      dimensions: [
        { width: 1300, height: 900 },
        { width: 375, height: 667 },
      ],
    },
  },

  /**
   * Кэширование
   */
  caching: {
    staticAssets: '1y',
    dynamicContent: '1h',
    api: '5m',
    fonts: '1y',
    images: '1y',
  },
};

/**
 * Утилиты для работы с конфигурацией
 */
export class LighthouseConfigManager {
  /**
   * Получение конфигурации по окружению
   */
  static getConfig(environment: keyof typeof LIGHTHOUSE_CONFIGS): LighthouseConfig {
    return LIGHTHOUSE_CONFIGS[environment];
  }

  /**
   * Создание пользовательской конфигурации
   */
  static createCustomConfig(
    baseConfig: keyof typeof LIGHTHOUSE_CONFIGS,
    overrides: Partial<LighthouseConfig>,
  ): LighthouseConfig {
    const base = this.getConfig(baseConfig);
    return this.mergeConfigs(base, overrides);
  }

  /**
   * Слияние конфигураций
   */
  private static mergeConfigs(
    base: LighthouseConfig,
    overrides: Partial<LighthouseConfig>,
  ): LighthouseConfig {
    return {
      ...base,
      ...overrides,
      categoryTargets: { ...base.categoryTargets, ...overrides.categoryTargets },
      optimizations: { ...base.optimizations, ...overrides.optimizations },
      performanceThresholds: { ...base.performanceThresholds, ...overrides.performanceThresholds },
      analysis: { ...base.analysis, ...overrides.analysis },
    };
  }

  /**
   * Валидация конфигурации
   */
  static validateConfig(config: LighthouseConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Проверка targetScore
    if (config.targetScore < 0 || config.targetScore > 100) {
      errors.push('targetScore должен быть от 0 до 100');
    }

    // Проверка категорий
    for (const [category, score] of Object.entries(config.categoryTargets)) {
      if (score < 0 || score > 100) {
        errors.push(`Скор категории ${category} должен быть от 0 до 100`);
      }
    }

    // Проверка пороговых значений
    const thresholds = config.performanceThresholds;
    if (thresholds.firstContentfulPaint < 0 || thresholds.firstContentfulPaint > 10000) {
      errors.push('firstContentfulPaint должен быть от 0 до 10000 мс');
    }
    if (thresholds.largestContentfulPaint < 0 || thresholds.largestContentfulPaint > 20000) {
      errors.push('largestContentfulPaint должен быть от 0 до 20000 мс');
    }
    if (thresholds.cumulativeLayoutShift < 0 || thresholds.cumulativeLayoutShift > 1) {
      errors.push('cumulativeLayoutShift должен быть от 0 до 1');
    }

    // Проверка анализа
    if (config.analysis.runCount < 1 || config.analysis.runCount > 10) {
      errors.push('runCount должен быть от 1 до 10');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Получение рекомендуемой конфигурации на основе результатов
   */
  static getRecommendedConfig(results: LighthouseResults): LighthouseConfig {
    const currentScore = results.overallScore;

    if (currentScore < 50) {
      // Для очень низких скоров - фокус на критических оптимизациях
      return this.createCustomConfig('development', {
        targetScore: Math.min(75, currentScore + 25),
        optimizations: {
          enableCriticalResourceOptimization: true,
          enableImageOptimization: true,
          enableScriptOptimization: true,
          enableCSSOptimization: true,
          enableCaching: false,
          enableCompression: true,
          enableServiceWorker: false,
        },
      });
    } else if (currentScore < 75) {
      // Для средних скоров - сбалансированная оптимизация
      return this.createCustomConfig('development', {
        targetScore: Math.min(85, currentScore + 15),
      });
    } else {
      // Для высоких скоров - тонкая настройка
      return this.createCustomConfig('production', {
        targetScore: Math.min(95, currentScore + 10),
      });
    }
  }
}

/**
 * Экспорт по умолчанию
 */
export default LighthouseConfigManager;
