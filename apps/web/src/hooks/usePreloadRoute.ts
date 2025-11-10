// filepath: apps/web/src/hooks/usePreloadRoute.ts
// Route Preloading Hook - Performance Sprint Day 3

import { useCallback, useEffect, useRef } from 'react';
import { preloadComponent } from '../utils/dynamicImport';

interface PreloadOptions {
  /** Задержка перед preload (ms) */
  delay?: number;
  /** Preload при hover */
  onHover?: boolean;
  /** Preload при idle состоянии */
  onIdle?: boolean;
  /** Preload в viewport */
  onVisible?: boolean;
  /** Приоритет preload */
  priority?: 'high' | 'medium' | 'low';
}

interface PreloadState {
  isPreloaded: boolean;
  isPreloading: boolean;
  error: Error | null;
  preloadedAt: number | null;
}

/**
 * Hook для preloading маршрутов и компонентов
 */
export function usePreloadRoute(
  importFunction: () => Promise<{ default: unknown }>,
  options: PreloadOptions = {},
) {
  const {
    delay = 0,
    onHover = false,
    onIdle = true,
    onVisible = false,
    priority = 'medium',
  } = options;

  const preloadRef = useRef<{
    promise: Promise<void> | null;
    state: PreloadState;
  }>({
    promise: null,
    state: {
      isPreloaded: false,
      isPreloading: false,
      error: null,
      preloadedAt: null,
    },
  });

  // Функция preload
  const preload = useCallback(
    async (force = false): Promise<void> => {
      const current = preloadRef.current;

      // Если уже preloaded или preloading, возвращаем существующий promise
      if ((current.state.isPreloaded || current.state.isPreloading) && !force) {
        return current.promise || Promise.resolve();
      }

      // Устанавливаем состояние preloading
      current.state.isPreloading = true;
      current.state.error = null;

      try {
        // Добавляем delay если нужен
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        // Создаем promise для preload
        const preloadPromise = preloadComponent(importFunction);
        current.promise = preloadPromise;

        await preloadPromise;

        // Успешный preload
        current.state.isPreloaded = true;
        current.state.isPreloading = false;
        current.state.preloadedAt = Date.now();

        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console

          console.log(`✅ Route preloaded successfully (priority: ${priority})`);
        }
      } catch (error) {
        // Ошибка preload
        current.state.isPreloading = false;
        current.state.error = error as Error;

        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console

          console.warn(`⚠️ Route preload failed (priority: ${priority}):`, error);
        }
      }
    },
    [importFunction, delay, priority],
  );

  // Preload при idle состоянии
  useEffect(() => {
    if (!onIdle) return;

    const handleIdle = () => {
      // Используем requestIdleCallback если доступен
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(
          () => {
            preload();
          },
          { timeout: 5000 },
        );
      } else {
        // Fallback для браузеров без requestIdleCallback
        setTimeout(() => {
          preload();
        }, 1000);
      }
    };

    // Запускаем после монтирования
    const timer = setTimeout(handleIdle, 100);

    return () => clearTimeout(timer);
  }, [onIdle, preload]);

  // Preload handlers для событий
  const preloadHandlers = {
    onMouseEnter: onHover ? () => preload() : undefined,
    onFocus: onHover ? () => preload() : undefined,
  };

  // Intersection Observer для onVisible
  const visibilityRef = useCallback(
    (node: HTMLElement | null) => {
      if (!onVisible || !node) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              preload();
              observer.disconnect(); // Preload только один раз
            }
          });
        },
        { threshold: 0.1 },
      );

      observer.observe(node);

      return () => observer.disconnect();
    },
    [onVisible, preload],
  );

  return {
    preload,
    preloadHandlers,
    visibilityRef,
    state: preloadRef.current.state,
    // Utility methods
    reset: () => {
      preloadRef.current.promise = null;
      preloadRef.current.state = {
        isPreloaded: false,
        isPreloading: false,
        error: null,
        preloadedAt: null,
      };
    },
    isReady: preloadRef.current.state.isPreloaded,
    hasError: preloadRef.current.state.error !== null,
  };
}

/**
 * Hook для preloading группы маршрутов
 */
export function usePreloadRoutes(
  routes: Array<{
    name: string;
    importFunction: () => Promise<{ default: unknown }>;
    options?: PreloadOptions;
  }>,
) {
  const preloaders = routes.map((route: unknown) =>
    usePreloadRoute(route.importFunction, route.options),
  );

  const preloadAll = useCallback(async () => {
    const promises = preloaders.map((preloader: unknown) => preloader.preload());
    await Promise.allSettled(promises);
  }, [preloaders]);

  const preloadByPriority = useCallback(async () => {
    // Группируем по приоритету
    const priorityGroups = {
      high: [] as Array<{ preload: () => Promise<void> }>,
      medium: [] as Array<{ preload: () => Promise<void> }>,
      low: [] as Array<{ preload: () => Promise<void> }>,
    };

    routes.forEach((route, index) => {
      const priority = route.options?.priority || 'medium';
      const preloader = preloaders[index];
      if (preloader) {
        priorityGroups[priority].push(preloader);
      }
    });

    // Preload по приоритету с задержками
    for (const [priority, group] of Object.entries(priorityGroups)) {
      if (group.length > 0) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console

          console.log(`🚀 Preloading ${priority} priority routes (${group.length} routes)`);
        }

        await Promise.allSettled(group.map((preloader: unknown) => preloader.preload()));

        // Задержка между группами приоритета
        if (priority === 'high') {
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else if (priority === 'medium') {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
  }, [routes, preloaders]);

  const getOverallState = () => {
    const states = preloaders.map((p: unknown) => p.state);

    return {
      totalRoutes: routes.length,
      preloadedCount: states.filter((s) => s.isPreloaded).length,
      preloadingCount: states.filter((s) => s.isPreloading).length,
      errorCount: states.filter((s) => s.error !== null).length,
      isAllPreloaded: states.every((s) => s.isPreloaded),
      hasAnyErrors: states.some((s) => s.error !== null),
      progress: (states.filter((s) => s.isPreloaded).length / routes.length) * 100,
    };
  };

  return {
    preloaders,
    preloadAll,
    preloadByPriority,
    state: getOverallState(),
    // Individual route access
    getPreloader: (routeName: string) => {
      const index = routes.findIndex((r) => r.name === routeName);
      return index >= 0 ? preloaders[index] : null;
    },
  };
}

/**
 * Hook для мониторинга performance preloading
 */
export function usePreloadPerformance() {
  const performanceRef = useRef<{
    preloadTimes: Array<{
      name: string;
      startTime: number;
      endTime: number;
      duration: number;
      success: boolean;
    }>;
    totalPreloaded: number;
    totalErrors: number;
  }>({
    preloadTimes: [],
    totalPreloaded: 0,
    totalErrors: 0,
  });

  const recordPreload = useCallback(
    (name: string, startTime: number, endTime: number, success: boolean) => {
      const duration = endTime - startTime;

      performanceRef.current.preloadTimes.push({
        name,
        startTime,
        endTime,
        duration,
        success,
      });

      if (success) {
        performanceRef.current.totalPreloaded++;
      } else {
        performanceRef.current.totalErrors++;
      }

      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console

        console.log(`📊 Preload ${name}: ${duration}ms (${success ? 'success' : 'error'})`);
      }
    },
    [],
  );

  const getPerformanceReport = useCallback(() => {
    const { preloadTimes, totalPreloaded, totalErrors } = performanceRef.current;

    if (preloadTimes.length === 0) {
      return {
        totalPreloads: 0,
        averageDuration: 0,
        fastestPreload: null,
        slowestPreload: null,
        successRate: 0,
        totalPreloaded,
        totalErrors,
      };
    }

    const successfulPreloads = preloadTimes.filter((p) => p.success);
    const durations = successfulPreloads.map((p: unknown) => p.duration);

    return {
      totalPreloads: preloadTimes.length,
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length || 0,
      fastestPreload: successfulPreloads.reduce((fastest, current) =>
        current.duration < fastest.duration ? current : fastest,
      ),
      slowestPreload: successfulPreloads.reduce((slowest, current) =>
        current.duration > slowest.duration ? current : slowest,
      ),
      successRate: (successfulPreloads.length / preloadTimes.length) * 100,
      totalPreloaded,
      totalErrors,
    };
  }, []);

  const reset = useCallback(() => {
    performanceRef.current = {
      preloadTimes: [],
      totalPreloaded: 0,
      totalErrors: 0,
    };
  }, []);

  return {
    recordPreload,
    getPerformanceReport,
    reset,
    getPreloadHistory: () => performanceRef.current.preloadTimes,
  };
}
