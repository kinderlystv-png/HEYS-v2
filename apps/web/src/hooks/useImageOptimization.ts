// filepath: apps/web/src/hooks/useImageOptimization.ts

import { useCallback, useEffect, useState } from 'react';

import { log } from '../lib/browser-logger';
import { ImageMetadata, ImageOptimizationOptions, imageOptimizer } from '../utils/image-optimizer';

interface UseImageOptimizationOptions extends ImageOptimizationOptions {
  enabled?: boolean;
  onSuccess?: (metadata: ImageMetadata) => void;
  onError?: (error: Error) => void;
}

interface UseImageOptimizationResult {
  optimizedSrc: string | null;
  metadata: ImageMetadata | null;
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
  preload: () => void;
}

/**
 * Hook для image optimization с advanced возможностями
 * Предоставляет programmatic control над оптимизацией изображений
 */
export function useImageOptimization(
  src: string,
  options: UseImageOptimizationOptions = {},
): UseImageOptimizationResult {
  const { enabled = true, onSuccess, onError, ...optimizationOptions } = options;

  const [state, setState] = useState<{
    optimizedSrc: string | null;
    metadata: ImageMetadata | null;
    isLoading: boolean;
    error: Error | null;
  }>({
    optimizedSrc: null,
    metadata: null,
    isLoading: false,
    error: null,
  });

  const [retryCount, setRetryCount] = useState(0);

  const optimizeImage = useCallback(async () => {
    if (!src || !enabled) return;

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const metadata = await imageOptimizer.optimizeImage(src, optimizationOptions);

      setState({
        optimizedSrc: metadata.src,
        metadata,
        isLoading: false,
        error: null,
      });

      onSuccess?.(metadata);
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error('Image optimization failed');

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorObj,
      }));

      onError?.(errorObj);
    }
  }, [src, enabled, optimizationOptions, onSuccess, onError]);

  // Автоматическая оптимизация при изменении параметров
  useEffect(() => {
    optimizeImage();
  }, [optimizeImage, retryCount]);

  // Retry функция
  const retry = useCallback(() => {
    setRetryCount((prev) => prev + 1);
  }, []);

  // Preload функция
  const preload = useCallback(async () => {
    if (!src) return;

    try {
      await imageOptimizer.optimizeImage(src, {
        ...optimizationOptions,
        preload: true,
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        log.warn('Image preload failed in development mode', {
          source: src,
          options: optimizationOptions,
          error,
        });
      }
    }
  }, [src, optimizationOptions]);

  return {
    optimizedSrc: state.optimizedSrc,
    metadata: state.metadata,
    isLoading: state.isLoading,
    error: state.error,
    retry,
    preload,
  };
}

/**
 * Hook для batch image optimization
 * Оптимизирует множество изображений с контролем concurrency
 */
export function useBatchImageOptimization(
  sources: string[],
  options: UseImageOptimizationOptions & {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {},
) {
  const { concurrency = 3, onProgress, ...optimizationOptions } = options;

  const [state, setState] = useState<{
    results: Map<string, ImageMetadata>;
    errors: Map<string, Error>;
    isLoading: boolean;
    completed: number;
  }>({
    results: new Map(),
    errors: new Map(),
    isLoading: false,
    completed: 0,
  });

  const optimizeBatch = useCallback(async () => {
    if (sources.length === 0) return;

    setState((prev) => ({
      ...prev,
      isLoading: true,
      completed: 0,
      results: new Map(),
      errors: new Map(),
    }));

    // Создаем batches для concurrency control
    const batches = [];
    for (let i = 0; i < sources.length; i += concurrency) {
      batches.push(sources.slice(i, i + concurrency));
    }

    let completed = 0;

    for (const batch of batches) {
      const promises = batch.map(async (src) => {
        try {
          const metadata = await imageOptimizer.optimizeImage(src, optimizationOptions);

          setState((prev) => ({
            ...prev,
            results: new Map(prev.results).set(src, metadata),
          }));

          return { src, success: true, metadata };
        } catch (error) {
          const errorObj = error instanceof Error ? error : new Error('Optimization failed');

          setState((prev) => ({
            ...prev,
            errors: new Map(prev.errors).set(src, errorObj),
          }));

          return { src, success: false, error: errorObj };
        }
      });

      await Promise.all(promises);
      completed += batch.length;

      setState((prev) => ({
        ...prev,
        completed,
      }));

      onProgress?.(completed, sources.length);
    }

    setState((prev) => ({
      ...prev,
      isLoading: false,
    }));
  }, [sources, concurrency, optimizationOptions, onProgress]);

  useEffect(() => {
    optimizeBatch();
  }, [optimizeBatch]);

  return {
    results: state.results,
    errors: state.errors,
    isLoading: state.isLoading,
    completed: state.completed,
    total: sources.length,
    progress: sources.length > 0 ? (state.completed / sources.length) * 100 : 0,
    retry: optimizeBatch,
  };
}

/**
 * Hook для image preloading стратегий
 * Предзагружает изображения на основе user behavior
 */
export function useImagePreloading(
  options: {
    strategy?: 'hover' | 'viewport' | 'idle' | 'immediate';
    delay?: number;
    priority?: boolean;
  } = {},
) {
  const { delay = 0, priority = false } = options;

  const preloadImage = useCallback(
    (src: string, imageOptions: ImageOptimizationOptions = {}) => {
      const execute = async () => {
        try {
          await imageOptimizer.optimizeImage(src, {
            ...imageOptions,
            preload: true,
            priority,
          });
        } catch (error) {
          log.warn('Image preload failed', {
            source: src,
            options: imageOptions,
            priority,
            error,
          });
        }
      };

      if (delay > 0) {
        setTimeout(execute, delay);
      } else {
        execute();
      }
    },
    [delay, priority],
  );

  const preloadOnHover = useCallback(
    (src: string, imageOptions?: ImageOptimizationOptions) => {
      return {
        onMouseEnter: () => preloadImage(src, imageOptions),
        onFocus: () => preloadImage(src, imageOptions),
      };
    },
    [preloadImage],
  );

  const preloadOnIdle = useCallback(
    (src: string, imageOptions?: ImageOptimizationOptions) => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => preloadImage(src, imageOptions));
      } else {
        // Fallback для браузеров без requestIdleCallback
        setTimeout(() => preloadImage(src, imageOptions), 100);
      }
    },
    [preloadImage],
  );

  return {
    preloadImage,
    preloadOnHover,
    preloadOnIdle,
  };
}

export default useImageOptimization;
