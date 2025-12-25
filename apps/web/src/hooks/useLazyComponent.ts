// filepath: apps/web/src/hooks/useLazyComponent.ts
// Lazy Component Hook - Performance Sprint Day 3

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';

import { log } from '../lib/browser-logger';
import { createLazyComponent, ImportOptions } from '../utils/dynamicImport';

interface LazyComponentState {
  /** Компонент загружен */
  isLoaded: boolean;
  /** Компонент загружается */
  isLoading: boolean;
  /** Ошибка загрузки */
  error: Error | null;
  /** Время загрузки */
  loadTime: number | null;
  /** Компонент был предзагружен */
  wasPreloaded: boolean;
}

interface LazyComponentOptions extends ImportOptions {
  /** Автоматическая загрузка при монтировании */
  autoLoad?: boolean;
  /** Preload при hover */
  preloadOnHover?: boolean;
  /** Показать детальные логи */
  verbose?: boolean;
}

/**
 * Hook для управления lazy loading компонентов
 */
export function useLazyComponent<T extends ComponentType<unknown>>(
  importFunction: () => Promise<{ default: T }>,
  options: LazyComponentOptions = {},
) {
  const { autoLoad = false, preloadOnHover = false, verbose = false, ...importOptions } = options;

  const [state, setState] = useState<LazyComponentState>({
    isLoaded: false,
    isLoading: false,
    error: null,
    loadTime: null,
    wasPreloaded: false,
  });

  const componentRef = useRef<T | null>(null);
  const startTimeRef = useRef<number>(0);
  const preloadPromiseRef = useRef<Promise<{ default: T }> | null>(null);

  // Создаем lazy компонент
  const LazyComponent = useRef(createLazyComponent(importFunction, importOptions)).current;

  const logContextBase = useMemo(
    () => ({
      delay: importOptions.delay,
      retries: importOptions.retries,
      timeout: importOptions.timeout,
      autoLoad,
      preloadOnHover,
      verbose,
    }),
    [importOptions.delay, importOptions.retries, importOptions.timeout, autoLoad, preloadOnHover, verbose],
  );

  // Функция загрузки компонента
  const loadComponent = useCallback(async (): Promise<T | null> => {
    if (state.isLoaded && componentRef.current) {
      return componentRef.current;
    }

    if (state.isLoading) {
      // Ждем завершения текущей загрузки
      return new Promise((resolve) => {
        const checkLoaded = () => {
          if (state.isLoaded && componentRef.current) {
            resolve(componentRef.current);
          } else if (!state.isLoading) {
            resolve(null);
          } else {
            setTimeout(checkLoaded, 50);
          }
        };
        checkLoaded();
      });
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    startTimeRef.current = performance.now();

    try {
      let componentModule: { default: T };

      // Используем preload promise если есть
      if (preloadPromiseRef.current) {
        if (verbose && process.env.NODE_ENV === 'development') {
          log.debug('Using preloaded lazy component', {
            ...logContextBase,
            wasPreloaded: true,
          });
        }
        componentModule = await preloadPromiseRef.current;
        setState((prev) => ({ ...prev, wasPreloaded: true }));
      } else {
        if (verbose && process.env.NODE_ENV === 'development') {
          log.debug('Loading lazy component on demand', {
            ...logContextBase,
            wasPreloaded: false,
          });
        }
        componentModule = await importFunction();
      }

      componentRef.current = componentModule.default;
      const loadTime = performance.now() - startTimeRef.current;

      setState((prev) => ({
        ...prev,
        isLoaded: true,
        isLoading: false,
        loadTime,
        error: null,
      }));

      if (verbose && process.env.NODE_ENV === 'development') {
        log.info('Lazy component loaded', {
          ...logContextBase,
          loadTimeMs: loadTime,
          wasPreloaded: state.wasPreloaded,
        });
      }

      return componentRef.current;
    } catch (error) {
      const loadTime = performance.now() - startTimeRef.current;

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error as Error,
        loadTime,
      }));

      if (verbose && process.env.NODE_ENV === 'development') {
        log.error('Lazy component failed to load', {
          ...logContextBase,
          loadTimeMs: loadTime,
          error,
        });
      }

      return null;
    }
  }, [state, importFunction, verbose, logContextBase]);

  // Preload функция
  const preloadComponent = useCallback(async (): Promise<void> => {
    if (preloadPromiseRef.current || state.isLoaded) {
      return;
    }

    if (verbose && process.env.NODE_ENV === 'development') {
      log.debug('Preloading lazy component', logContextBase);
    }

    preloadPromiseRef.current = importFunction();

    try {
      await preloadPromiseRef.current;
      if (verbose && process.env.NODE_ENV === 'development') {
        log.info('Lazy component preloaded', logContextBase);
      }
    } catch (error) {
      preloadPromiseRef.current = null;
      if (verbose && process.env.NODE_ENV === 'development') {
        log.warn('Lazy component preload failed', {
          ...logContextBase,
          error,
        });
      }
    }
  }, [state.isLoaded, importFunction, verbose, logContextBase]);

  // Auto load при монтировании
  useEffect(() => {
    if (autoLoad) {
      loadComponent();
    }
  }, [autoLoad, loadComponent]);

  // Event handlers
  const eventHandlers = {
    onMouseEnter: preloadOnHover ? preloadComponent : undefined,
    onFocus: preloadOnHover ? preloadComponent : undefined,
  };

  // Reset функция
  const reset = useCallback(() => {
    setState({
      isLoaded: false,
      isLoading: false,
      error: null,
      loadTime: null,
      wasPreloaded: false,
    });
    componentRef.current = null;
    preloadPromiseRef.current = null;
    startTimeRef.current = 0;
  }, []);

  return {
    // State
    ...state,

    // Component
    LazyComponent,
    Component: componentRef.current,

    // Actions
    load: loadComponent,
    preload: preloadComponent,
    reset,

    // Event handlers
    eventHandlers,

    // Utilities
    isReady: state.isLoaded && !state.error,
    isPending: state.isLoading || preloadPromiseRef.current !== null,
    getPerformanceInfo: () => ({
      loadTime: state.loadTime,
      wasPreloaded: state.wasPreloaded,
      hasError: state.error !== null,
      errorMessage: state.error?.message,
    }),
  };
}

/**
 * Hook для управления группой lazy компонентов
 */
export function useLazyComponents<
  T extends Record<string, ComponentType<Record<string, unknown>>>,
>(
  components: Record<keyof T, () => Promise<{ default: T[keyof T] }>>,
  options: LazyComponentOptions = {},
) {
  const entries = Object.entries(components) as Array<
    [string, () => Promise<{ default: T[keyof T] }>]
  >;
  const componentHooks = entries.reduce(
    (acc, [name, importFn]) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      acc[name] = useLazyComponent(importFn, options);
      return acc;
    },
    {} as Record<string, ReturnType<typeof useLazyComponent>>,
  );

  // Загрузка всех компонентов
  const loadAll = useCallback(async () => {
    const promises = Object.values(componentHooks).map((hook: unknown) => hook.load());
    await Promise.allSettled(promises);
  }, [componentHooks]);

  // Preload всех компонентов
  const preloadAll = useCallback(async () => {
    const promises = Object.values(componentHooks).map((hook: unknown) => hook.preload());
    await Promise.allSettled(promises);
  }, [componentHooks]);

  // Общее состояние
  const getOverallState = useCallback(() => {
    const hooks = Object.values(componentHooks);

    return {
      totalComponents: hooks.length,
      loadedCount: hooks.filter((h) => h.isLoaded).length,
      loadingCount: hooks.filter((h) => h.isLoading).length,
      errorCount: hooks.filter((h) => h.error !== null).length,
      isAllLoaded: hooks.every((h) => h.isLoaded),
      hasAnyErrors: hooks.some((h) => h.error !== null),
      averageLoadTime:
        hooks.filter((h) => h.loadTime !== null).reduce((sum, h) => sum + (h.loadTime || 0), 0) /
          hooks.length || 0,
      preloadedCount: hooks.filter((h) => h.wasPreloaded).length,
    };
  }, [componentHooks]);

  // Reset всех компонентов
  const resetAll = useCallback(() => {
    Object.values(componentHooks).forEach((hook) => hook.reset());
  }, [componentHooks]);

  return {
    components: componentHooks,
    loadAll,
    preloadAll,
    resetAll,
    getOverallState,

    // Доступ к отдельным компонентам
    getComponent: (name: string) => componentHooks[name],
    isComponentLoaded: (name: string) => componentHooks[name]?.isLoaded || false,
    loadComponent: (name: string) => componentHooks[name]?.load(),
    preloadComponent: (name: string) => componentHooks[name]?.preload(),
  };
}

/**
 * Hook для lazy loading с условиями
 */
export function useConditionalLazyComponent<T extends ComponentType<Record<string, unknown>>>(
  importFunction: () => Promise<{ default: T }>,
  condition: boolean,
  options: LazyComponentOptions = {},
) {
  const lazyHook = useLazyComponent(importFunction, {
    ...options,
    autoLoad: false, // Отключаем autoLoad, контролируем вручную
  });

  // Загружаем только при выполнении условия
  useEffect(() => {
    if (condition && !lazyHook.isLoaded && !lazyHook.isLoading) {
      lazyHook.load();
    }
  }, [condition, lazyHook]);

  return {
    ...lazyHook,
    shouldLoad: condition,
    conditionalLoad: () => (condition ? lazyHook.load() : Promise.resolve(null)),
  };
}

/**
 * Hook для batch loading компонентов
 */
export function useBatchLazyLoading<T extends ComponentType<Record<string, unknown>>>(
  importFunctions: Array<() => Promise<{ default: T }>>,
  batchSize: number = 3,
  options: LazyComponentOptions = {},
) {
  const [currentBatch, setCurrentBatch] = useState(0);
  const componentHooks = importFunctions.map((importFn: unknown) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useLazyComponent(importFn, { ...options, autoLoad: false });
  });
  const logContextBase = useMemo(
    () => ({
      autoLoad: options.autoLoad,
      preloadOnHover: options.preloadOnHover,
      verbose: options.verbose,
      delay: options.delay,
      retries: options.retries,
      timeout: options.timeout,
    }),
    [
      options.autoLoad,
      options.preloadOnHover,
      options.verbose,
      options.delay,
      options.retries,
      options.timeout,
    ],
  );

  // Загрузка батча
  const loadBatch = useCallback(
    async (batchIndex: number) => {
      const startIndex = batchIndex * batchSize;
      const endIndex = Math.min(startIndex + batchSize, componentHooks.length);

      const batchHooks = componentHooks.slice(startIndex, endIndex);
      const promises = batchHooks.map((hook: unknown) => hook.load());

      await Promise.allSettled(promises);

      if (process.env.NODE_ENV === 'development') {
        log.info('Lazy component batch loaded', {
          ...logContextBase,
          batch: batchIndex + 1,
          batchSize: batchHooks.length,
          totalComponents: componentHooks.length,
        });
      }
    },
    [componentHooks, batchSize, logContextBase],
  );

  // Загрузка следующего батча
  const loadNextBatch = useCallback(async () => {
    const totalBatches = Math.ceil(componentHooks.length / batchSize);

    if (currentBatch < totalBatches - 1) {
      const nextBatch = currentBatch + 1;
      await loadBatch(nextBatch);
      setCurrentBatch(nextBatch);
    }
  }, [currentBatch, componentHooks.length, batchSize, loadBatch]);

  // Загрузка всех батчей
  const loadAllBatches = useCallback(async () => {
    const totalBatches = Math.ceil(componentHooks.length / batchSize);

    for (let i = 0; i < totalBatches; i++) {
      await loadBatch(i);
      setCurrentBatch(i);

      // Небольшая задержка между батчами
      if (i < totalBatches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }, [componentHooks.length, batchSize, loadBatch]);

  const getBatchInfo = useCallback(() => {
    const totalBatches = Math.ceil(componentHooks.length / batchSize);
    const loadedComponents = componentHooks.filter((h) => h.isLoaded).length;

    return {
      currentBatch: currentBatch + 1,
      totalBatches,
      loadedComponents,
      totalComponents: componentHooks.length,
      progress: (loadedComponents / componentHooks.length) * 100,
      isComplete: loadedComponents === componentHooks.length,
    };
  }, [currentBatch, componentHooks, batchSize]);

  return {
    components: componentHooks,
    loadBatch,
    loadNextBatch,
    loadAllBatches,
    getBatchInfo,
    hasNextBatch: currentBatch < Math.ceil(componentHooks.length / batchSize) - 1,
  };
}
