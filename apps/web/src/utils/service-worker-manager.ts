// filepath: apps/web/src/utils/service-worker-manager.ts
// Service Worker Manager для Performance Sprint Day 7
// Регистрация, управление и интеграция с image optimization

import { log } from '../lib/browser-logger';

type TransferableItem = ArrayBuffer | MessagePort | ImageBitmap;

interface ServiceWorkerManager {
  register(): Promise<ServiceWorkerRegistration | null>;
  unregister(): Promise<boolean>;
  update(): Promise<void>;
  preloadResources(urls: string[]): Promise<void>;
  clearCache(pattern?: string): Promise<void>;
  getCacheStatus(): Promise<CacheStatus>;
  sendPerformanceMetrics(metrics: PerformanceMetrics): void;
}

interface CacheStatus {
  caches: Record<string, number>;
  version: string;
  timestamp: number;
}

interface PerformanceMetrics {
  bundleSize: number;
  loadTime: number;
  imageLoadTime: number;
  cacheHitRate: number;
  errorCount: number;
}

class ServiceWorkerManagerImpl implements ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private isSupported: boolean;

  constructor() {
    this.isSupported = 'serviceWorker' in navigator;
  }

  /**
   * Регистрация Service Worker с error handling
   */
  async register(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isSupported) {
      log.warn('SW Manager: Service Workers not supported');
      return null;
    }

    try {
      log.info('SW Manager: Registering Service Worker');

      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none', // Всегда проверяем обновления
      });

      log.info('SW Manager: Service Worker registered', { scope: this.registration.scope });

      // Слушаем обновления Service Worker
      this.setupUpdateListener();

      // Слушаем сообщения от Service Worker
      this.setupMessageListener();

      // Принудительное обновление существующего SW
      if (this.registration.waiting) {
        this.sendMessage({ type: 'SKIP_WAITING' });
      }

      return this.registration;
    } catch (error) {
      log.error('SW Manager: Registration failed', { error });
      return null;
    }
  }

  /**
   * Отмена регистрации Service Worker
   */
  async unregister(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }

    try {
      const result = await this.registration.unregister();
      log.info('SW Manager: Service Worker unregistered', { result });
      this.registration = null;
      return result;
    } catch (error) {
      log.error('SW Manager: Unregistration failed', { error });
      return false;
    }
  }

  /**
   * Принудительное обновление Service Worker
   */
  async update(): Promise<void> {
    if (!this.registration) {
      throw new Error('Service Worker not registered');
    }

    try {
      log.debug('SW Manager: Checking for updates');
      await this.registration.update();

      if (this.registration.waiting) {
        this.sendMessage({ type: 'SKIP_WAITING' });
      }
    } catch (error) {
      log.error('SW Manager: Update failed', { error });
      throw error;
    }
  }

  /**
   * Предзагрузка ресурсов через Service Worker
   */
  async preloadResources(urls: string[]): Promise<void> {
    if (!this.isServiceWorkerReady()) {
      log.warn('SW Manager: Service Worker not ready for preloading');
      return;
    }

    try {
      log.info('SW Manager: Preloading resources', { count: urls.length });

      this.sendMessage({
        type: 'PRELOAD_RESOURCES',
        data: { urls },
      });
    } catch (error) {
      log.error('SW Manager: Preload failed', { error, urls });
      throw error;
    }
  }

  /**
   * Очистка кэша по паттерну
   */
  async clearCache(pattern = ''): Promise<void> {
    if (!this.isServiceWorkerReady()) {
      log.warn('SW Manager: Service Worker not ready for cache cleanup');
      return;
    }

    try {
      log.info('SW Manager: Clearing cache', { pattern });

      this.sendMessage({
        type: 'CLEAR_CACHE',
        data: { pattern },
      });
    } catch (error) {
      log.error('SW Manager: Cache clear failed', { error, pattern });
      throw error;
    }
  }

  /**
   * Получение статуса кэша
   */
  async getCacheStatus(): Promise<CacheStatus> {
    if (!this.isServiceWorkerReady()) {
      throw new Error('Service Worker not ready');
    }

    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port1.onmessage = (event) => {
        resolve(event.data);
      };

      try {
        this.sendMessage(
          {
            type: 'GET_CACHE_STATUS',
          },
          [channel.port2],
        );

        // Таймаут через 5 секунд
        setTimeout(() => {
          reject(new Error('Cache status request timeout'));
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Отправка метрик производительности в Service Worker
   */
  sendPerformanceMetrics(metrics: PerformanceMetrics): void {
    if (!this.isServiceWorkerReady()) {
      return;
    }

    try {
      this.sendMessage({
        type: 'PERFORMANCE_REPORT',
        data: metrics,
      });

      log.debug('SW Manager: Performance metrics sent', { metrics });
    } catch (error) {
      log.error('SW Manager: Failed to send metrics', { error, metrics });
    }
  }

  /**
   * Проверка готовности Service Worker
   */
  private isServiceWorkerReady(): boolean {
    return !!(this.registration && navigator.serviceWorker.controller);
  }

  /**
   * Отправка сообщения в Service Worker
   */
  private sendMessage(message: Record<string, unknown>, transfer?: TransferableItem[]): void {
    if (!navigator.serviceWorker.controller) {
      throw new Error('No service worker controller available');
    }

    if (transfer && transfer.length > 0) {
      navigator.serviceWorker.controller.postMessage(message, { transfer });
    } else {
      navigator.serviceWorker.controller.postMessage(message);
    }
  }

  /**
   * Настройка слушателя обновлений Service Worker
   */
  private setupUpdateListener(): void {
    const registration = this.registration;
    if (!registration) return;

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;

      if (newWorker) {
        log.info('SW Manager: New Service Worker installing');

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            log.info('SW Manager: New Service Worker installed');

            // Можно показать пользователю уведомление об обновлении
            this.showUpdateNotification();
          }
        });
      }
    });
  }

  /**
   * Настройка слушателя сообщений от Service Worker
   */
  private setupMessageListener(): void {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, data } = event.data || {};

      switch (type) {
        case 'CACHE_UPDATED':
          log.debug('SW Manager: Cache updated', { url: data?.url });
          break;

        case 'OFFLINE_FALLBACK':
          log.warn('SW Manager: Offline fallback activated');
          this.showOfflineNotification();
          break;

        case 'PERFORMANCE_UPDATE':
          log.debug('SW Manager: Performance update', { data });
          break;

        default:
          log.debug('SW Manager: Message from Service Worker', { payload: event.data });
      }
    });
  }

  /**
   * Показ уведомления об обновлении (заглушка для UI integration)
   */
  private showUpdateNotification(): void {
    // Интеграция с notification system
    log.info('SW Manager: App update available');

    // Можно интегрировать с toast notifications:
    // showToast({
    //   title: 'App Update Available',
    //   message: 'Refresh to get the latest version',
    //   type: 'info',
    //   actions: [{ text: 'Refresh', onClick: () => window.location.reload() }]
    // });
  }

  /**
   * Показ уведомления об offline режиме (заглушка для UI integration)
   */
  private showOfflineNotification(): void {
    log.info('SW Manager: App running in offline mode');

    // Можно интегрировать с notification system:
    // showToast({
    //   title: 'Offline Mode',
    //   message: 'Some features may be limited',
    //   type: 'warning',
    //   persistent: true
    // });
  }
}

// Singleton instance
const serviceWorkerManager = new ServiceWorkerManagerImpl();

export { serviceWorkerManager };
export type { CacheStatus, PerformanceMetrics, ServiceWorkerManager };

// Auto-register только в production (локальную разработку не кэшируем)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (!isLocalhost) {
    // Регистрируем после загрузки страницы
    window.addEventListener('load', () => {
      serviceWorkerManager.register().catch((error) => {
        log.error('SW Manager: Auto registration failed', { error });
      });
    });
  }
}
