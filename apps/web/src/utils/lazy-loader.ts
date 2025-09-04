// filepath: apps/web/src/utils/lazy-loader.ts
/**
 * Enhanced Lazy Loading Utilities
 * Performance Sprint Day 3 - Component 1
 * Provides advanced lazy loading capabilities with error handling and preloading
 */

import { ComponentType, LazyExoticComponent, lazy } from 'react';

interface LazyLoadOptions {
  /** Preload the component after a delay (ms) */
  preloadDelay?: number;
  /** Retry failed loads */
  retryAttempts?: number;
  /** Custom error fallback */
  errorFallback?: ComponentType<{ error: Error; retry: () => void }>;
  /** Loading timeout (ms) */
  timeout?: number;
}

interface LazyComponentInfo {
  component: LazyExoticComponent<any>;
  preload: () => Promise<any>;
  isLoaded: boolean;
  isLoading: boolean;
}

// Глобальный реестр lazy компонентов
const lazyComponentRegistry = new Map<string, LazyComponentInfo>();

/**
 * Создаёт lazy компонент с расширенными возможностями
 */
export function createLazyComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  componentName: string,
  options: LazyLoadOptions = {}
): LazyExoticComponent<T> {
  const {
    preloadDelay = 0,
    retryAttempts = 3,
    timeout = 10000
  } = options;

  let loadPromise: Promise<{ default: T }> | null = null;
  let retryCount = 0;

  // Функция загрузки с retry логикой
  const loadWithRetry = async (): Promise<{ default: T }> => {
    try {
      // Timeout для загрузки
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Component ${componentName} load timeout`)), timeout);
      });

      const result = await Promise.race([importFn(), timeoutPromise]);
      retryCount = 0; // Сбрасываем счётчик при успехе
      
      // Обновляем статус в реестре
      const info = lazyComponentRegistry.get(componentName);
      if (info) {
        info.isLoaded = true;
        info.isLoading = false;
      }

      return result;
    } catch (error) {
      console.warn(`Failed to load component ${componentName}:`, error);
      
      if (retryCount < retryAttempts) {
        retryCount++;
        console.log(`Retrying ${componentName} (attempt ${retryCount}/${retryAttempts})`);
        
        // Экспоненциальная задержка для retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return loadWithRetry();
      }
      
      throw new Error(`Failed to load ${componentName} after ${retryAttempts} attempts: ${(error as Error).message || error}`);
    }
  };

  // Функция preload для ручной загрузки
  const preload = () => {
    if (!loadPromise) {
      loadPromise = loadWithRetry();
      
      // Обновляем статус
      const info = lazyComponentRegistry.get(componentName);
      if (info) {
        info.isLoading = true;
      }
    }
    return loadPromise;
  };

  // Создаём lazy компонент
  const LazyComponent = lazy(() => {
    return preload();
  });

  // Регистрируем компонент
  lazyComponentRegistry.set(componentName, {
    component: LazyComponent,
    preload,
    isLoaded: false,
    isLoading: false
  });

  // Автоматический preload с задержкой
  if (preloadDelay > 0) {
    setTimeout(() => {
      preload().catch(error => {
        console.warn(`Preload failed for ${componentName}:`, error);
      });
    }, preloadDelay);
  }

  return LazyComponent;
}

/**
 * Preload компонента по имени
 */
export function preloadComponent(componentName: string): Promise<any> | null {
  const info = lazyComponentRegistry.get(componentName);
  if (info && !info.isLoaded) {
    return info.preload();
  }
  return null;
}

/**
 * Preload нескольких компонентов
 */
export async function preloadComponents(componentNames: string[]): Promise<void> {
  const promises = componentNames
    .map(name => preloadComponent(name))
    .filter(Boolean);
    
  if (promises.length > 0) {
    try {
      await Promise.allSettled(promises);
      console.log(`Preloaded ${promises.length} components`);
    } catch (error) {
      console.warn('Some components failed to preload:', error);
    }
  }
}

/**
 * Получение статуса компонента
 */
export function getComponentStatus(componentName: string) {
  const info = lazyComponentRegistry.get(componentName);
  return info ? {
    isLoaded: info.isLoaded,
    isLoading: info.isLoading,
    isRegistered: true
  } : {
    isLoaded: false,
    isLoading: false,
    isRegistered: false
  };
}

/**
 * Получение всех зарегистрированных компонентов
 */
export function getAllComponentsStatus() {
  const status: Record<string, any> = {};
  lazyComponentRegistry.forEach((info, name) => {
    status[name] = {
      isLoaded: info.isLoaded,
      isLoading: info.isLoading
    };
  });
  return status;
}

/**
 * Создание HOC для lazy loading с intersection observer
 */
export function withLazyLoad<P extends object>(
  componentName: string,
  options: LazyLoadOptions & { rootMargin?: string } = {}
) {
  return function LazyLoadHOC(WrappedComponent: ComponentType<P>) {
    return createLazyComponent(
      () => Promise.resolve({ default: WrappedComponent }),
      componentName,
      options
    );
  };
}

/**
 * Utilities для route-based splitting
 */
export const RouteComponents = {
  // Создание lazy route компонента
  createLazyRoute: <T extends ComponentType<any>>(
    importFn: () => Promise<{ default: T }>,
    routeName: string
  ) => {
    return createLazyComponent(importFn, `route-${routeName}`, {
      preloadDelay: 2000, // Preload через 2 секунды
      retryAttempts: 3,
      timeout: 15000 // Больше времени для route компонентов
    });
  },

  // Preload маршрута при hover на ссылку
  preloadOnHover: (routeName: string) => {
    return {
      onMouseEnter: () => preloadComponent(`route-${routeName}`),
      onFocus: () => preloadComponent(`route-${routeName}`)
    };
  }
};

export default {
  createLazyComponent,
  preloadComponent,
  preloadComponents,
  getComponentStatus,
  getAllComponentsStatus,
  withLazyLoad,
  RouteComponents
};
