// filepath: apps/web/src/utils/service-worker-manager.ts
// Service Worker Manager для Performance Sprint Day 7
// Регистрация, управление и интеграция с image optimization

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
      console.warn('⚠️ SW Manager: Service Workers not supported');
      return null;
    }

    try {
      console.log('🔧 SW Manager: Registering Service Worker...');
      
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none' // Всегда проверяем обновления
      });

      console.log('✅ SW Manager: Service Worker registered:', this.registration.scope);

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
      console.error('❌ SW Manager: Registration failed:', error);
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
      console.log('🗑️ SW Manager: Service Worker unregistered:', result);
      this.registration = null;
      return result;
    } catch (error) {
      console.error('❌ SW Manager: Unregistration failed:', error);
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
      console.log('🔄 SW Manager: Checking for updates...');
      await this.registration.update();
      
      if (this.registration.waiting) {
        this.sendMessage({ type: 'SKIP_WAITING' });
      }
    } catch (error) {
      console.error('❌ SW Manager: Update failed:', error);
      throw error;
    }
  }

  /**
   * Предзагрузка ресурсов через Service Worker
   */
  async preloadResources(urls: string[]): Promise<void> {
    if (!this.isServiceWorkerReady()) {
      console.warn('⚠️ SW Manager: Service Worker not ready for preloading');
      return;
    }

    try {
      console.log('🚀 SW Manager: Preloading resources:', urls.length);
      
      this.sendMessage({
        type: 'PRELOAD_RESOURCES',
        data: { urls }
      });
    } catch (error) {
      console.error('❌ SW Manager: Preload failed:', error);
      throw error;
    }
  }

  /**
   * Очистка кэша по паттерну
   */
  async clearCache(pattern = ''): Promise<void> {
    if (!this.isServiceWorkerReady()) {
      console.warn('⚠️ SW Manager: Service Worker not ready for cache cleanup');
      return;
    }

    try {
      console.log('🧹 SW Manager: Clearing cache with pattern:', pattern);
      
      this.sendMessage({
        type: 'CLEAR_CACHE',
        data: { pattern }
      });
    } catch (error) {
      console.error('❌ SW Manager: Cache clear failed:', error);
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
            type: 'GET_CACHE_STATUS'
          },
          [channel.port2]
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
        data: metrics
      });

      console.log('📊 SW Manager: Performance metrics sent:', metrics);
    } catch (error) {
      console.error('❌ SW Manager: Failed to send metrics:', error);
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
  private sendMessage(message: Record<string, unknown>, transfer?: Transferable[]): void {
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
    if (!this.registration) return;

    this.registration.addEventListener('updatefound', () => {
      const newWorker = this.registration!.installing;
      
      if (newWorker) {
        console.log('🔄 SW Manager: New Service Worker installing...');
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('✅ SW Manager: New Service Worker installed, refresh to activate');
            
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
          console.log('📦 SW Manager: Cache updated for:', data?.url);
          break;
          
        case 'OFFLINE_FALLBACK':
          console.log('📱 SW Manager: Offline fallback activated');
          this.showOfflineNotification();
          break;
          
        case 'PERFORMANCE_UPDATE':
          console.log('📊 SW Manager: Performance update:', data);
          break;
          
        default:
          console.log('💬 SW Manager: Message from SW:', event.data);
      }
    });
  }

  /**
   * Показ уведомления об обновлении (заглушка для UI integration)
   */
  private showUpdateNotification(): void {
    // Интеграция с notification system
    console.log('🔔 SW Manager: App update available');
    
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
    console.log('📱 SW Manager: App running in offline mode');
    
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
export type { ServiceWorkerManager, CacheStatus, PerformanceMetrics };

// Auto-register в development и production
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  // Регистрируем после загрузки страницы
  window.addEventListener('load', () => {
    serviceWorkerManager.register().catch(console.error);
  });
}
