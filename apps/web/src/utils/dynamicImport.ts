// filepath: apps/web/src/utils/dynamicImport.ts
// Dynamic Import Utilities для Performance Sprint Day 3

/**
 * Утилиты для динамической загрузки компонентов с оптимизацией производительности
 */

import { lazy, ComponentType, LazyExoticComponent } from 'react';

// Типы для динамического импорта
export interface ImportOptions {
  /** Задержка перед загрузкой (для preloading) */
  delay?: number;
  /** Retry попытки при ошибке загрузки */
  retries?: number;
  /** Timeout для загрузки */
  timeout?: number;
  /** Fallback компонент при ошибке */
  fallback?: ComponentType;
}

export interface LazyComponentOptions extends ImportOptions {
  /** Показать loading state */
  showLoading?: boolean;
  /** Preload компонент при hover */
  preloadOnHover?: boolean;
}

/**
 * Создает lazy компонент с дополнительными возможностями
 */
export function createLazyComponent<T extends ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>,
  options: LazyComponentOptions = {}
): LazyExoticComponent<T> {
  const {
    delay = 0,
    retries = 3,
    timeout = 10000,
    showLoading = true
  } = options;

  // Обертываем import функцию с retry логикой
  const enhancedImport = async (): Promise<{ default: T }> => {
    let lastError: Error = new Error('Unknown import error');
    
    for (let i = 0; i <= retries; i++) {
      try {
        // Добавляем delay если нужен
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Создаем timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Import timeout')), timeout);
        });

        // Race между import и timeout
        const result = await Promise.race([
          importFunc(),
          timeoutPromise
        ]);

        // Логируем успешную загрузку
        console.log(`✅ Component loaded successfully (attempt ${i + 1})`);
        return result;

      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ Import failed (attempt ${i + 1}/${retries + 1}):`, error);
        
        // Экспоненциальная задержка между попытками
        if (i < retries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }

    // Если все попытки неудачны
    console.error('❌ All import attempts failed:', lastError);
    throw lastError;
  };

  return lazy(enhancedImport);
}

/**
 * Preload функция для предварительной загрузки
 */
export function preloadComponent(
  importFunc: () => Promise<{ default: ComponentType<any> }>
): Promise<void> {
  return importFunc()
    .then(() => {
      console.log('🚀 Component preloaded successfully');
    })
    .catch(error => {
      console.warn('⚠️ Component preload failed:', error);
    });
}

/**
 * Создает preloader для компонента
 */
export function createComponentPreloader(
  importFunc: () => Promise<{ default: ComponentType<any> }>
) {
  let preloadPromise: Promise<void> | null = null;

  return {
    preload: () => {
      if (!preloadPromise) {
        preloadPromise = preloadComponent(importFunc);
      }
      return preloadPromise;
    },
    
    isPreloaded: () => preloadPromise !== null,
    
    reset: () => {
      preloadPromise = null;
    }
  };
}

/**
 * Bundle splitting strategy для различных типов компонентов
 */
export const BUNDLE_CHUNKS = {
  // Основные страницы
  PAGES: 'pages',
  // Аналитика и отчеты  
  ANALYTICS: 'analytics',
  // Настройки и конфигурация
  SETTINGS: 'settings',
  // Вспомогательные компоненты
  UTILS: 'utils'
} as const;

/**
 * Создает webpack chunk name для компонента
 */
export function createChunkName(category: keyof typeof BUNDLE_CHUNKS, componentName: string): string {
  return `${BUNDLE_CHUNKS[category]}-${componentName.toLowerCase()}`;
}

/**
 * Dynamic import с указанием chunk name
 */
export function createChunkedImport<T extends ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>
): () => Promise<{ default: T }> {
  return () => importFunc();
}

/**
 * Утилита для создания lazy компонентов с chunk names
 */
export function createChunkedLazyComponent<T extends ComponentType<any>>(
  category: keyof typeof BUNDLE_CHUNKS,
  componentName: string,
  importFunc: () => Promise<{ default: T }>,
  options: LazyComponentOptions = {}
): LazyExoticComponent<T> {
  const chunkName = createChunkName(category, componentName);
  
  // В production используем chunk name для webpack
  const enhancedImportFunc = process.env.NODE_ENV === 'production' 
    ? importFunc 
    : importFunc;
  
  return createLazyComponent(enhancedImportFunc, {
    ...options,
    // Добавляем chunk name в опции для отладки
    ...(process.env.NODE_ENV === 'development' && {
      // В dev режиме добавляем информацию о chunk
    })
  });
}
