// filepath: apps/web/src/hooks/useServiceWorker.ts
// React hook для интеграции Service Worker с image optimization
// Performance Sprint Day 7

import { useCallback, useEffect, useState } from 'react';

import { log } from '../lib/browser-logger';
import {
  serviceWorkerManager,
  type CacheStatus,
  type PerformanceMetrics,
} from '../utils/service-worker-manager';

interface ServiceWorkerState {
  isRegistered: boolean;
  isOnline: boolean;
  cacheStatus: CacheStatus | null;
  lastUpdate: Date | null;
  error: string | null;
}

interface ServiceWorkerActions {
  register: () => Promise<void>;
  unregister: () => Promise<void>;
  update: () => Promise<void>;
  preloadImages: (urls: string[]) => Promise<void>;
  clearImageCache: () => Promise<void>;
  sendMetrics: (metrics: PerformanceMetrics) => void;
  refreshCacheStatus: () => Promise<void>;
}

/**
 * Hook для управления Service Worker и интеграции с image optimization
 */
export function useServiceWorker(): ServiceWorkerState & ServiceWorkerActions {
  const [state, setState] = useState<ServiceWorkerState>({
    isRegistered: false,
    isOnline: navigator.onLine,
    cacheStatus: null,
    lastUpdate: null,
    error: null,
  });

  // Регистрация Service Worker
  const register = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      const registration = await serviceWorkerManager.register();

      setState((prev) => ({
        ...prev,
        isRegistered: !!registration,
        lastUpdate: new Date(),
      }));

      log.info('useServiceWorker: Service Worker registered');
    } catch (error) {
      log.error('useServiceWorker: Registration failed', { error });
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Registration failed',
      }));
    }
  }, []);

  // Отмена регистрации
  const unregister = useCallback(async () => {
    try {
      const success = await serviceWorkerManager.unregister();

      setState((prev) => ({
        ...prev,
        isRegistered: !success,
        cacheStatus: null,
        lastUpdate: success ? new Date() : prev.lastUpdate,
      }));

      log.info('useServiceWorker: Service Worker unregistered');
    } catch (error) {
      log.error('useServiceWorker: Unregistration failed', { error });
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unregistration failed',
      }));
    }
  }, []);

  // Обновление Service Worker
  const update = useCallback(async () => {
    try {
      await serviceWorkerManager.update();
      setState((prev) => ({ ...prev, lastUpdate: new Date() }));
      log.info('useServiceWorker: Service Worker updated');
    } catch (error) {
      log.error('useServiceWorker: Update failed', { error });
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Update failed',
      }));
    }
  }, []);

  // Предзагрузка изображений через Service Worker
  const preloadImages = useCallback(
    async (urls: string[]) => {
      if (!state.isRegistered) {
        log.warn('useServiceWorker: Cannot preload - SW not registered');
        return;
      }

      try {
        await serviceWorkerManager.preloadResources(urls);
        log.info('useServiceWorker: Preloaded images', { count: urls.length });
      } catch (error) {
        log.error('useServiceWorker: Image preload failed', { error, urls });
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Preload failed',
        }));
      }
    },
    [state.isRegistered],
  );

  // Обновление статуса кэша (перемещено выше clearImageCache)
  const refreshCacheStatus = useCallback(async () => {
    if (!state.isRegistered) {
      return;
    }

    try {
      const cacheStatus = await serviceWorkerManager.getCacheStatus();
      setState((prev) => ({ ...prev, cacheStatus }));
      log.debug('useServiceWorker: Cache status updated', { cacheStatus });
    } catch (error) {
      log.error('useServiceWorker: Failed to get cache status', { error });
    }
  }, [state.isRegistered]);

  // Очистка кэша изображений
  const clearImageCache = useCallback(async () => {
    if (!state.isRegistered) {
      log.warn('useServiceWorker: Cannot clear cache - SW not registered');
      return;
    }

    try {
      // Очищаем кэш изображений по паттернам
      await serviceWorkerManager.clearCache('.jpg');
      await serviceWorkerManager.clearCache('.png');
      await serviceWorkerManager.clearCache('.webp');
      await serviceWorkerManager.clearCache('.avif');

      // Обновляем статус кэша
      await refreshCacheStatus();

      log.info('useServiceWorker: Image cache cleared');
    } catch (error) {
      log.error('useServiceWorker: Cache clear failed', { error });
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Cache clear failed',
      }));
    }
  }, [state.isRegistered, refreshCacheStatus]);

  // Отправка метрик производительности
  const sendMetrics = useCallback(
    (metrics: PerformanceMetrics) => {
      if (!state.isRegistered) {
        log.warn('useServiceWorker: Cannot send metrics - SW not registered');
        return;
      }

      try {
        serviceWorkerManager.sendPerformanceMetrics(metrics);
        log.debug('useServiceWorker: Metrics sent', { metrics });
      } catch (error) {
        log.error('useServiceWorker: Failed to send metrics', { error, metrics });
      }
    },
    [state.isRegistered],
  );

  // Слушаем изменения online/offline статуса
  useEffect(() => {
    const handleOnline = () => {
      setState((prev) => ({ ...prev, isOnline: true }));
      log.info('useServiceWorker: Back online');
    };

    const handleOffline = () => {
      setState((prev) => ({ ...prev, isOnline: false }));
      log.warn('useServiceWorker: Gone offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Автоматическая регистрация при монтировании компонента
  useEffect(() => {
    // Проверяем, уже ли зарегистрирован Service Worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      setState((prev) => ({ ...prev, isRegistered: true }));

      // Сразу получаем статус кэша
      refreshCacheStatus();
    }
  }, [refreshCacheStatus]);

  // Периодическое обновление статуса кэша
  useEffect(() => {
    if (!state.isRegistered) return;

    const interval = setInterval(() => {
      refreshCacheStatus();
    }, 30000); // Каждые 30 секунд

    return () => clearInterval(interval);
  }, [state.isRegistered, refreshCacheStatus]);

  return {
    ...state,
    register,
    unregister,
    update,
    preloadImages,
    clearImageCache,
    sendMetrics,
    refreshCacheStatus,
  };
}

/**
 * Hook для автоматической отправки метрик производительности
 */
export function usePerformanceMetrics() {
  const { sendMetrics, isRegistered } = useServiceWorker();

  const sendImageLoadMetrics = useCallback(
    (imageUrl: string, loadTime: number, fromCache: boolean, size?: number) => {
      if (!isRegistered) return;

      const metrics: PerformanceMetrics = {
        bundleSize: size || 0,
        loadTime,
        imageLoadTime: loadTime,
        cacheHitRate: fromCache ? 1 : 0,
        errorCount: 0,
      };

      sendMetrics(metrics);

      log.debug('Performance: Image loaded', {
        imageUrl,
        loadTime,
        fromCache,
      });
    },
    [sendMetrics, isRegistered],
  );

  const sendErrorMetrics = useCallback(
    (errorType: string, errorCount = 1) => {
      if (!isRegistered) return;

      const metrics: PerformanceMetrics = {
        bundleSize: 0,
        loadTime: 0,
        imageLoadTime: 0,
        cacheHitRate: 0,
        errorCount,
      };

      sendMetrics(metrics);

      log.warn('Performance: Error reported', { errorType, errorCount });
    },
    [sendMetrics, isRegistered],
  );

  return {
    sendImageLoadMetrics,
    sendErrorMetrics,
  };
}

/**
 * Hook для предзагрузки критических изображений
 */
export function useImagePreloading() {
  const { preloadImages, isRegistered } = useServiceWorker();

  const preloadCriticalImages = useCallback(
    async (urls: string[]) => {
      if (!isRegistered || urls.length === 0) return;

      // Фильтруем только изображения
      const imageUrls = urls.filter((url) => /\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(url));

      if (imageUrls.length === 0) return;

      try {
        await preloadImages(imageUrls);
        log.info('Image Preloading: images queued for preload', { count: imageUrls.length });
      } catch (error) {
        log.error('Image Preloading: preload failed', { error, imageUrls });
      }
    },
    [preloadImages, isRegistered],
  );

  const preloadImagesOnHover = useCallback(
    async (urls: string[]) => {
      // Предзагрузка с меньшим приоритетом для hover events
      if (!isRegistered) return;

      const imageUrls = urls.filter((url) => /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(url));

      if (imageUrls.length === 0) return;

      // Добавляем небольшую задержку для hover preloading
      setTimeout(() => {
        preloadImages(imageUrls).catch((error) =>
          log.error('Image Preloading: hover preload failed', { error, imageUrls }),
        );
      }, 100);
    },
    [preloadImages, isRegistered],
  );

  return {
    preloadCriticalImages,
    preloadImagesOnHover,
  };
}
