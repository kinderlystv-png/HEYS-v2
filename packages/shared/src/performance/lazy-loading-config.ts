// filepath: packages/shared/src/performance/lazy-loading-config.ts

import { LazyLoadingConfig, LazyLoadingStrategy } from './LazyLoader';

type NavigatorConnection = { effectiveType?: string };
type NavigatorWithPerformance = Navigator & {
  connection?: NavigatorConnection;
  deviceMemory?: number;
};

/**
 * Предустановленные конфигурации для различных сценариев ленивой загрузки
 */

/**
 * Агрессивная ленивая загрузка - максимальная производительность
 */
export const aggressiveLazyConfig: LazyLoadingConfig = {
  root: null,
  rootMargin: '0px',
  threshold: 0.01, // Загружаем сразу при появлении в viewport
  enablePreloading: true,
  maxConcurrentLoads: 10,
  loadTimeout: 5000,
  enableMetrics: true,
  debounceDelay: 50,
};

/**
 * Сбалансированная ленивая загрузка - оптимальный баланс
 */
export const balancedLazyConfig: LazyLoadingConfig = {
  root: null,
  rootMargin: '50px',
  threshold: [0, 0.25, 0.5, 0.75, 1],
  enablePreloading: true,
  maxConcurrentLoads: 5,
  loadTimeout: 10000,
  enableMetrics: true,
  debounceDelay: 100,
};

/**
 * Консервативная ленивая загрузка - минимальное потребление ресурсов
 */
export const conservativeLazyConfig: LazyLoadingConfig = {
  root: null,
  rootMargin: '20px',
  threshold: 0.5, // Загружаем только когда элемент наполовину виден
  enablePreloading: false,
  maxConcurrentLoads: 2,
  loadTimeout: 15000,
  enableMetrics: false,
  debounceDelay: 200,
};

/**
 * Мобильная оптимизация - экономия трафика и батареи
 */
export const mobileLazyConfig: LazyLoadingConfig = {
  root: null,
  rootMargin: '30px',
  threshold: 0.3,
  enablePreloading: false,
  maxConcurrentLoads: 3,
  loadTimeout: 20000,
  enableMetrics: true,
  debounceDelay: 150,
};

/**
 * Медленное соединение - оптимизация для слабого интернета
 */
export const slowNetworkLazyConfig: LazyLoadingConfig = {
  root: null,
  rootMargin: '10px',
  threshold: 0.8, // Загружаем только когда почти полностью видно
  enablePreloading: false,
  maxConcurrentLoads: 1,
  loadTimeout: 30000,
  enableMetrics: true,
  debounceDelay: 300,
};

/**
 * Премиум опыт - максимальная отзывчивость
 */
export const premiumLazyConfig: LazyLoadingConfig = {
  root: null,
  rootMargin: '200px',
  threshold: 0,
  enablePreloading: true,
  maxConcurrentLoads: 15,
  loadTimeout: 3000,
  enableMetrics: true,
  debounceDelay: 25,
};

/**
 * Стратегии ленивой загрузки для разных типов контента
 */
export const lazyLoadingStrategies = {
  /**
   * Стратегия для изображений
   */
  images: {
    strategy: LazyLoadingStrategy.INTERSECTION_OBSERVER,
    config: {
      rootMargin: '50px',
      threshold: 0.1,
      enablePreloading: true,
      maxConcurrentLoads: 6,
    },
    fallbackSizes: ['small', 'medium', 'large'],
    formats: ['webp', 'avif', 'jpg', 'png'],
    placeholder:
      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNGNUY1RjUiLz48L3N2Zz4=',
  },

  /**
   * Стратегия для видео
   */
  videos: {
    strategy: LazyLoadingStrategy.USER_INTERACTION,
    config: {
      rootMargin: '100px',
      threshold: 0.5,
      enablePreloading: false,
      maxConcurrentLoads: 2,
    },
    autoplay: false,
    preload: 'metadata',
  },

  /**
   * Стратегия для компонентов
   */
  components: {
    strategy: LazyLoadingStrategy.INTERSECTION_OBSERVER,
    config: {
      rootMargin: '150px',
      threshold: 0.1,
      enablePreloading: true,
      maxConcurrentLoads: 8,
    },
    chunkPriority: ['critical', 'important', 'normal', 'low'],
  },

  /**
   * Стратегия для iframe (карты, виджеты)
   */
  iframes: {
    strategy: LazyLoadingStrategy.USER_INTERACTION,
    config: {
      rootMargin: '50px',
      threshold: 0.3,
      enablePreloading: false,
      maxConcurrentLoads: 3,
    },
    placeholder: true,
    sandboxAttributes: ['allow-scripts', 'allow-same-origin'],
  },

  /**
   * Стратегия для скриптов
   */
  scripts: {
    strategy: LazyLoadingStrategy.TIME_BASED,
    config: {
      enablePreloading: true,
      maxConcurrentLoads: 4,
      loadTimeout: 15000,
    },
    defer: true,
    async: true,
    priority: ['critical', 'analytics', 'features', 'optional'],
  },
};

/**
 * Конфигурации для разных устройств и условий
 */
export const deviceSpecificConfigs = {
  /**
   * Конфигурация для desktop
   */
  desktop: {
    ...balancedLazyConfig,
    rootMargin: '100px',
    maxConcurrentLoads: 8,
    loadTimeout: 8000,
  },

  /**
   * Конфигурация для планшетов
   */
  tablet: {
    ...balancedLazyConfig,
    rootMargin: '75px',
    maxConcurrentLoads: 6,
    loadTimeout: 12000,
  },

  /**
   * Конфигурация для мобильных устройств
   */
  mobile: mobileLazyConfig,

  /**
   * Конфигурация для медленных соединений
   */
  slowConnection: slowNetworkLazyConfig,

  /**
   * Конфигурация для быстрых соединений
   */
  fastConnection: premiumLazyConfig,
};

/**
 * Утилиты для определения конфигурации
 */
export class LazyConfigDetector {
  /**
   * Автоматическое определение оптимальной конфигурации
   */
  static detectOptimalConfig(): LazyLoadingConfig {
    const connectionSpeed = this.getConnectionSpeed();
    const deviceType = this.getDeviceType();
    const batteryLevel = this.getBatteryLevel();

    // Логика выбора конфигурации
    if (connectionSpeed === 'slow' || batteryLevel === 'low') {
      return conservativeLazyConfig;
    }

    if (connectionSpeed === 'fast' && deviceType === 'desktop') {
      return premiumLazyConfig;
    }

    if (deviceType === 'mobile') {
      return mobileLazyConfig;
    }

    return balancedLazyConfig;
  }

  /**
   * Определение скорости соединения
   */
  private static getConnectionSpeed(): 'slow' | 'medium' | 'fast' {
    if ('connection' in navigator) {
      const connection = (navigator as NavigatorWithPerformance).connection;
      const effectiveType = connection?.effectiveType;

      switch (effectiveType) {
        case 'slow-2g':
        case '2g':
          return 'slow';
        case '3g':
          return 'medium';
        case '4g':
          return 'fast';
        default:
          return 'medium';
      }
    }

    return 'medium';
  }

  /**
   * Определение типа устройства
   */
  private static getDeviceType(): 'desktop' | 'tablet' | 'mobile' {
    const userAgent = navigator.userAgent.toLowerCase();

    if (/tablet|ipad/.test(userAgent)) {
      return 'tablet';
    }

    if (/mobile|android|iphone/.test(userAgent)) {
      return 'mobile';
    }

    return 'desktop';
  }

  /**
   * Определение уровня батареи
   */
  private static getBatteryLevel(): 'low' | 'medium' | 'high' {
    // Простая эмуляция, так как Battery API устарел
    return 'medium';
  }

  /**
   * Проверка поддержки современных форматов изображений
   */
  static checkImageFormatSupport() {
    return {
      webp: this.canUseWebP(),
      avif: this.canUseAVIF(),
      jp2: this.canUseJP2(),
    };
  }

  /**
   * Проверка поддержки WebP
   */
  private static canUseWebP(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  }

  /**
   * Проверка поддержки AVIF
   */
  private static canUseAVIF(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    try {
      return canvas.toDataURL('image/avif').indexOf('data:image/avif') === 0;
    } catch {
      return false;
    }
  }

  /**
   * Проверка поддержки JPEG 2000
   */
  private static canUseJP2(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    try {
      return canvas.toDataURL('image/jp2').indexOf('data:image/jp2') === 0;
    } catch {
      return false;
    }
  }
}

/**
 * Хелперы для создания оптимизированных lazy loading стратегий
 */
export class LazyLoadingHelpers {
  /**
   * Создание адаптивной конфигурации изображений
   */
  static createResponsiveImageConfig(
    breakpoints: Record<string, number> = {
      mobile: 768,
      tablet: 1024,
      desktop: 1200,
    },
  ) {
    const currentWidth = window.innerWidth;

    let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';

    if (currentWidth <= (breakpoints.mobile ?? 768)) {
      deviceType = 'mobile';
    } else if (currentWidth <= (breakpoints.tablet ?? 1024)) {
      deviceType = 'tablet';
    }

    return {
      ...deviceSpecificConfigs[deviceType],
      rootMargin: deviceType === 'mobile' ? '30px' : '50px',
      threshold: deviceType === 'mobile' ? 0.2 : 0.1,
    };
  }

  /**
   * Создание конфигурации на основе производительности устройства
   */
  static createPerformanceBasedConfig() {
    const performanceScore = this.calculateDevicePerformance();

    if (performanceScore < 30) {
      return conservativeLazyConfig;
    } else if (performanceScore > 70) {
      return premiumLazyConfig;
    } else {
      return balancedLazyConfig;
    }
  }

  /**
   * Расчет производительности устройства
   */
  private static calculateDevicePerformance(): number {
    let score = 50; // Базовый score

    // Количество ядер процессора
    const cores = navigator.hardwareConcurrency || 4;
    score += Math.min(cores * 5, 25);

    // Объем памяти
    if ('deviceMemory' in navigator) {
      const memory = (navigator as NavigatorWithPerformance).deviceMemory;
      score += Math.min((memory ?? 4) * 10, 25);
    }

    // Тип соединения
    if ('connection' in navigator) {
      const connection = (navigator as NavigatorWithPerformance).connection;
      if (connection?.effectiveType === '4g') {
        score += 15;
      } else if (connection?.effectiveType === '3g') {
        score += 5;
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Создание placeholder для изображений
   */
  static createImagePlaceholder(width: number, height: number, color: string = '#f0f0f0'): string {
    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="${color}"/>
        <circle cx="${width / 2}" cy="${height / 2}" r="20" fill="#ccc"/>
      </svg>
    `;

    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  /**
   * Создание placeholder для видео
   */
  static createVideoPlaceholder(
    width: number,
    height: number,
    title: string = 'Click to play',
  ): string {
    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="#000" opacity="0.8"/>
        <circle cx="${width / 2}" cy="${height / 2}" r="30" fill="#fff" opacity="0.9"/>
        <polygon points="${width / 2 - 10},${height / 2 - 12} ${width / 2 - 10},${height / 2 + 12} ${width / 2 + 15},${height / 2}" fill="#000"/>
        <text x="${width / 2}" y="${height * 0.8}" text-anchor="middle" fill="#fff" font-size="14">${title}</text>
      </svg>
    `;

    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }
}

/**
 * Экспорт всех конфигураций
 */
export const lazyLoadingConfigs = {
  aggressive: aggressiveLazyConfig,
  balanced: balancedLazyConfig,
  conservative: conservativeLazyConfig,
  mobile: mobileLazyConfig,
  slowNetwork: slowNetworkLazyConfig,
  premium: premiumLazyConfig,
};

/**
 * Фабрика для создания кастомных конфигураций
 */
export function createLazyConfig(
  preset: keyof typeof lazyLoadingConfigs = 'balanced',
  overrides: Partial<LazyLoadingConfig> = {},
): LazyLoadingConfig {
  return {
    ...lazyLoadingConfigs[preset],
    ...overrides,
  };
}
