// filepath: apps/web/src/hooks/useLazyComponent.ts
// Lazy Component Hook - Performance Sprint Day 3

import { useState, useEffect, useCallback, useRef } from 'react';

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
export function useLazyComponent<T extends React.ComponentType<Record<string, unknown>>>(
  importFunction: () => Promise<{ default: T }>,
  options: LazyComponentOptions = {}
) {
  const {
    autoLoad = false,
    preloadOnHover = false,
    verbose = false,
    ...importOptions
  } = options;

  const [state, setState] = useState<LazyComponentState>({
    isLoaded: false,
    isLoading: false,
    error: null,
    loadTime: null,
    wasPreloaded: false
  });

  const componentRef = useRef<T | null>(null);
  const startTimeRef = useRef<number>(0);
  const preloadPromiseRef = useRef<Promise<{ default: T }> | null>(null);

  // Создаем lazy компонент
  const LazyComponent = useRef(
    createLazyComponent(importFunction, importOptions)
  ).current;

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

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    startTimeRef.current = performance.now();

    try {
      let componentModule: { default: T };

      // Используем preload promise если есть
      if (preloadPromiseRef.current) {
        if (verbose) {
          if (process.env.NODE_ENV === 'development') {

            // eslint-disable-next-line no-console

            console.log('🚀 Using preloaded component');
    }
        }
        componentModule = await preloadPromiseRef.current;
        setState(prev => ({ ...prev, wasPreloaded: true }));
      } else {
        if (verbose) {
          if (process.env.NODE_ENV === 'development') {

            // eslint-disable-next-line no-console

            console.log('📥 Loading component on demand');
    }
        }
        componentModule = await importFunction();
      }

      componentRef.current = componentModule.default;
      const loadTime = performance.now() - startTimeRef.current;

      setState(prev => ({
        ...prev,
        isLoaded: true,
        isLoading: false,
        loadTime,
        error: null
      }));

      if (verbose) {
        if (process.env.NODE_ENV === 'development') {

          // eslint-disable-next-line no-console

          console.log(`✅ Component loaded in ${loadTime.toFixed(2)}ms`);
    }
      }

      return componentRef.current;

    } catch (error) {
      const loadTime = performance.now() - startTimeRef.current;
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error as Error,
        loadTime
      }));

      if (verbose) {
        if (process.env.NODE_ENV === 'development') {

          // eslint-disable-next-line no-console

          console.error(`❌ Component failed to load after ${loadTime.toFixed(2)}ms:`, error);
    }
      }

      return null;
    }
  }, [state, importFunction, verbose]);

  // Preload функция
  const preloadComponent = useCallback(async (): Promise<void> => {
    if (preloadPromiseRef.current || state.isLoaded) {
      return;
    }

    if (verbose) {
      if (process.env.NODE_ENV === 'development') {

        // eslint-disable-next-line no-console

        console.log('🚀 Preloading component...');
    }
    }

    preloadPromiseRef.current = importFunction();
    
    try {
      await preloadPromiseRef.current;
      if (verbose) {
        if (process.env.NODE_ENV === 'development') {

          // eslint-disable-next-line no-console

          console.log('✅ Component preloaded successfully');
    }
      }
    } catch (error) {
      preloadPromiseRef.current = null;
      if (verbose) {
        if (process.env.NODE_ENV === 'development') {

          // eslint-disable-next-line no-console

          console.warn('⚠️ Component preload failed:', error);
    }
      }
    }
  }, [state.isLoaded, importFunction, verbose]);

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
      wasPreloaded: false
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
      errorMessage: state.error?.message
    })
  };
}

/**
 * Hook для управления группой lazy компонентов
 */
export function useLazyComponents<T extends Record<string, React.ComponentType<Record<string, unknown>>>>(
  components: Record<keyof T, () => Promise<{ default: T[keyof T] }>>,
  options: LazyComponentOptions = {}
) {
  const componentHooks = Object.entries(components).reduce((acc, [name, importFn]) => {
    acc[name] = useLazyComponent(importFn as any, options);
    return acc;
  }, {} as Record<string, ReturnType<typeof useLazyComponent>>);

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
      loadedCount: hooks.filter(h => h.isLoaded).length,
      loadingCount: hooks.filter(h => h.isLoading).length,
      errorCount: hooks.filter(h => h.error !== null).length,
      isAllLoaded: hooks.every(h => h.isLoaded),
      hasAnyErrors: hooks.some(h => h.error !== null),
      averageLoadTime: hooks
        .filter(h => h.loadTime !== null)
        .reduce((sum, h) => sum + (h.loadTime || 0), 0) / hooks.length || 0,
      preloadedCount: hooks.filter(h => h.wasPreloaded).length
    };
  }, [componentHooks]);

  // Reset всех компонентов
  const resetAll = useCallback(() => {
    Object.values(componentHooks).forEach(hook => hook.reset());
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
    preloadComponent: (name: string) => componentHooks[name]?.preload()
  };
}

/**
 * Hook для lazy loading с условиями
 */
export function useConditionalLazyComponent<T extends React.ComponentType<Record<string, unknown>>>(
  importFunction: () => Promise<{ default: T }>,
  condition: boolean,
  options: LazyComponentOptions = {}
) {
  const lazyHook = useLazyComponent(importFunction, {
    ...options,
    autoLoad: false // Отключаем autoLoad, контролируем вручную
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
    conditionalLoad: () => condition ? lazyHook.load() : Promise.resolve(null)
  };
}

/**
 * Hook для batch loading компонентов
 */
export function useBatchLazyLoading<T extends React.ComponentType<Record<string, unknown>>>(
  importFunctions: Array<() => Promise<{ default: T }>>,
  batchSize: number = 3,
  options: LazyComponentOptions = {}
) {
  const [currentBatch, setCurrentBatch] = useState(0);
  const componentHooks = importFunctions.map((importFn: unknown) => 
    useLazyComponent(importFn, { ...options, autoLoad: false })
  );

  // Загрузка батча
  const loadBatch = useCallback(async (batchIndex: number) => {
    const startIndex = batchIndex * batchSize;
    const endIndex = Math.min(startIndex + batchSize, componentHooks.length);
    
    const batchHooks = componentHooks.slice(startIndex, endIndex);
    const promises = batchHooks.map((hook: unknown) => hook.load());
    
    await Promise.allSettled(promises);
    
    if (process.env.NODE_ENV === 'development') {

    
      // eslint-disable-next-line no-console

    
      console.log(`✅ Batch ${batchIndex + 1} loaded (${batchHooks.length} components)`);
    }
  }, [componentHooks, batchSize]);

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
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }, [componentHooks.length, batchSize, loadBatch]);

  const getBatchInfo = useCallback(() => {
    const totalBatches = Math.ceil(componentHooks.length / batchSize);
    const loadedComponents = componentHooks.filter(h => h.isLoaded).length;
    
    return {
      currentBatch: currentBatch + 1,
      totalBatches,
      loadedComponents,
      totalComponents: componentHooks.length,
      progress: (loadedComponents / componentHooks.length) * 100,
      isComplete: loadedComponents === componentHooks.length
    };
  }, [currentBatch, componentHooks, batchSize]);

  return {
    components: componentHooks,
    loadBatch,
    loadNextBatch,
    loadAllBatches,
    getBatchInfo,
    hasNextBatch: currentBatch < Math.ceil(componentHooks.length / batchSize) - 1
  };
}
