// filepath: apps/web/src/utils/dynamic-imports.ts
/**
 * Dynamic Imports Utilities
 * Performance Sprint Day 3 - Component 1B
 * Handles dynamic imports with intelligent preloading and caching
 */

import { useCallback, useEffect, useState } from 'react';

import { log } from '../lib/browser-logger';

interface ImportCache {
  [key: string]: {
    promise: Promise<any>;
    result?: any;
    timestamp: number;
    error?: Error;
  };
}

// Кэш для динамических импортов
const importCache: ImportCache = {};

// Настройки кэширования
const CACHE_DURATION = 5 * 60 * 1000; // 5 минут
const MAX_CACHE_SIZE = 50; // Максимум 50 модулей в кэше

/**
 * Динамический импорт с кэшированием
 */
export async function dynamicImport<T = any>(
  importPath: string,
  options: {
    timeout?: number;
    retries?: number;
    cacheable?: boolean;
  } = {},
): Promise<T> {
  const { timeout = 10000, retries = 2, cacheable = true } = options;

  // Проверяем кэш
  if (cacheable && importCache[importPath]) {
    const cached = importCache[importPath];

    // Проверяем актуальность кэша
    if (Date.now() - cached.timestamp < CACHE_DURATION) {
      if (cached.result) {
        return cached.result;
      }
      if (cached.error) {
        throw cached.error;
      }
      // Если импорт в процессе, возвращаем существующий promise
      return cached.promise;
    } else {
      // Кэш устарел, удаляем
      delete importCache[importPath];
    }
  }

  // Функция импорта с retry
  const performImport = async (attempt: number = 1): Promise<T> => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Import timeout: ${importPath}`)), timeout);
      });

      // Динамический импорт (webpack/vite magic comments support)
      const importPromise = import(/* webpackChunkName: "[request]" */ importPath);

      const result = await Promise.race([importPromise, timeoutPromise]);

      // Кэшируем результат
      if (cacheable) {
        importCache[importPath] = {
          promise: Promise.resolve(result),
          result,
          timestamp: Date.now(),
        };

        // Очищаем кэш если он слишком большой
        cleanupCache();
      }

      log.debug('Dynamic import completed', {
        importPath,
        cacheable,
        cached: cacheable ? !!importCache[importPath] : false,
      });

      return result as T;
    } catch (error) {
      log.warn('Dynamic import attempt failed', {
        importPath,
        attempt,
        retries,
        error,
      });

      if (attempt <= retries) {
        // Экспоненциальная задержка
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 500));
        return performImport(attempt + 1);
      }

      // Кэшируем ошибку
      const finalError = new Error(`Failed to import ${importPath}: ${(error as Error).message}`);
      if (cacheable) {
        importCache[importPath] = {
          promise: Promise.reject(finalError),
          error: finalError,
          timestamp: Date.now(),
        };
      }

      throw finalError;
    }
  };

  const importPromise = performImport();

  // Кэшируем promise
  if (cacheable) {
    importCache[importPath] = {
      promise: importPromise,
      timestamp: Date.now(),
    };
  }

  return importPromise;
}

/**
 * Очистка устаревшего кэша
 */
function cleanupCache(): void {
  const entries = Object.entries(importCache);

  // Удаляем устаревшие записи
  const now = Date.now();
  entries.forEach(([path, cached]) => {
    if (now - cached.timestamp > CACHE_DURATION) {
      delete importCache[path];
    }
  });

  // Если кэш всё ещё слишком большой, удаляем самые старые
  const remaining = Object.entries(importCache);
  if (remaining.length > MAX_CACHE_SIZE) {
    remaining
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, remaining.length - MAX_CACHE_SIZE)
      .forEach(([path]) => delete importCache[path]);
  }
}

/**
 * Preload модулей по приоритету
 */
export class ModulePreloader {
  private preloadQueue: Array<{
    path: string;
    priority: number;
    options?: any;
  }> = [];

  private isProcessing = false;

  /**
   * Добавить модуль в очередь preload
   */
  add(path: string, priority: number = 1, options?: any): void {
    // Проверяем, что модуль не загружен и не в очереди
    if (importCache[path]?.result) return;

    const existing = this.preloadQueue.findIndex((item) => item.path === path);
    if (existing !== -1) {
      // Обновляем приоритет если он выше
      const existingItem = this.preloadQueue[existing];
      if (existingItem && existingItem.priority < priority) {
        existingItem.priority = priority;
        this.sortQueue();
      }
      return;
    }

    this.preloadQueue.push({ path, priority, options });
    this.sortQueue();

    // Запускаем обработку очереди
    this.processQueue();
  }

  /**
   * Preload модулей по массиву путей
   */
  addMultiple(paths: Array<{ path: string; priority?: number; options?: any }>): void {
    paths.forEach(({ path, priority = 1, options }) => {
      this.add(path, priority, options);
    });
  }

  /**
   * Сортировка очереди по приоритету
   */
  private sortQueue(): void {
    this.preloadQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Обработка очереди preload
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.preloadQueue.length === 0) return;

    this.isProcessing = true;

    while (this.preloadQueue.length > 0) {
      const item = this.preloadQueue.shift()!;

      try {
        await dynamicImport(item.path, {
          cacheable: true,
          ...item.options,
        });
        log.info('Module preloaded', {
          importPath: item.path,
          queueLength: this.preloadQueue.length,
        });
      } catch (error) {
        log.warn('Failed to preload module', {
          importPath: item.path,
          queueLength: this.preloadQueue.length,
          error,
        });
      }

      // Небольшая задержка между загрузками чтобы не блокировать UI
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
  }

  /**
   * Очистить очередь
   */
  clear(): void {
    this.preloadQueue = [];
  }

  /**
   * Получить статус очереди
   */
  getStatus() {
    return {
      queueLength: this.preloadQueue.length,
      isProcessing: this.isProcessing,
      cacheSize: Object.keys(importCache).length,
    };
  }
}

// Глобальный экземпляр preloader
export const modulePreloader = new ModulePreloader();

/**
 * Создание группы связанных модулей для совместной загрузки
 */
export class ModuleGroup {
  private modules: string[] = [];
  private loaded = new Set<string>();

  constructor(private name: string) {}

  /**
   * Добавить модуль в группу
   */
  add(modulePath: string): this {
    this.modules.push(modulePath);
    return this;
  }

  /**
   * Загрузить всю группу
   */
  async loadAll(): Promise<any[]> {
    const promises = this.modules.map(async (path) => {
      try {
        const result = await dynamicImport(path);
        this.loaded.add(path);
        log.info('Module preloaded', {
          importPath: path,
          group: this.name,
        });
        return result;
      } catch (error) {
        log.warn('Failed to load module from group', {
          group: this.name,
          importPath: path,
          error,
        });
        throw error;
      }
    });

    return Promise.allSettled(promises);
  }

  /**
   * Preload всей группы
   */
  preloadAll(priority: number = 1): void {
    this.modules.forEach((path) => {
      modulePreloader.add(path, priority);
    });
  }

  /**
   * Проверить статус загрузки группы
   */
  getLoadStatus() {
    return {
      total: this.modules.length,
      loaded: this.loaded.size,
      pending: this.modules.filter((path) => !this.loaded.has(path)),
      isComplete: this.loaded.size === this.modules.length,
    };
  }
}

/**
 * Утилиты для feature-based импортов
 */
export const FeatureImports = {
  // Аналитика
  analytics: new ModuleGroup('analytics')
    .add('@heys/analytics')
    .add('../components/Analytics/Dashboard'),

  // Поиск
  search: new ModuleGroup('search').add('@heys/search').add('../components/Search/SearchInterface'),

  // Игры
  gaming: new ModuleGroup('gaming').add('@heys/gaming').add('../components/Gaming/GameInterface'),

  // Отчёты
  reports: new ModuleGroup('reports')
    .add('../components/Reports/ReportGenerator')
    .add('../components/Reports/Charts'),
};

/**
 * Hook для использования в React компонентах
 */
export function useDynamicImport<T = any>(
  importPath: string,
  options?: {
    immediate?: boolean;
    timeout?: number;
    retries?: number;
  },
) {
  const { immediate = false } = options || {};

  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>({
    data: null,
    loading: immediate,
    error: null,
  });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await dynamicImport<T>(importPath, options);
      setState({ data: result, loading: false, error: null });
      return result;
    } catch (error) {
      setState({ data: null, loading: false, error: error as Error });
      throw error;
    }
  }, [importPath]);

  useEffect(() => {
    if (immediate) {
      load().catch(() => {}); // Ошибка уже обработана в setState
    }
  }, [immediate, load]);

  return {
    ...state,
    load,
  };
}

// Re-export для удобства
export { cleanupCache, importCache };

export default {
  dynamicImport,
  modulePreloader,
  ModuleGroup,
  FeatureImports,
  useDynamicImport,
};
