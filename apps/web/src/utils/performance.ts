// Performance utilities for HEYS web app

import { log } from '../lib/browser-logger';

// Preload критических ресурсов
export function preloadCriticalAssets() {
  const criticalAssets = ['/fonts/inter-var.woff2', '/icons/sprite.svg'];

  criticalAssets.forEach((asset) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = asset;
    link.as = asset.endsWith('.woff2') ? 'font' : 'image';
    if (asset.endsWith('.woff2')) {
      link.type = 'font/woff2';
      link.crossOrigin = 'anonymous';
    }
    document.head.appendChild(link);
  });
}

// Prefetch для следующих страниц
export function prefetchNextPage(url: string) {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = url;
  document.head.appendChild(link);
}

// Lazy load изображений
export function setupLazyLoading() {
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          img.src = img.dataset.src || '';
          img.classList.remove('lazy');
          imageObserver.unobserve(img);
        }
      });
    });

    document.querySelectorAll('img.lazy').forEach((img) => {
      imageObserver.observe(img);
    });
  }
}

// Web Vitals monitoring
interface Metric {
  name: string;
  value: number;
  id: string;
  delta?: number;
}

export function reportWebVitals(metric: Metric) {
  // Отправка метрик в аналитику
  if (typeof window !== 'undefined' && 'gtag' in window) {
    const gtag = (window as typeof window & { gtag: (...args: unknown[]) => void }).gtag;
    gtag('event', metric.name, {
      value: Math.round(metric.value),
      event_category: 'Web Vitals',
      event_label: metric.id,
      non_interaction: true,
    });
  }

  // Логирование в консоль для dev
  if (process.env.NODE_ENV === 'development') {
    log.debug('Web Vital metric', { name: metric.name, value: metric.value, id: metric.id });
  }
}

// Measure runtime performance
export function measurePerformance(name: string, fn: () => void | Promise<void>) {
  return async () => {
    const start = performance.now();
    await fn();
    const end = performance.now();
    const duration = end - start;

    log.info('Performance measurement', { name, duration: Number(duration.toFixed(2)) });

    // Report long tasks (>50ms)
    if (duration > 50) {
      log.warn('Performance: long task detected', {
        name,
        duration: Number(duration.toFixed(2)),
      });
    }

    return duration;
  };
}

// Resource loading optimization
export function optimizeResourceLoading() {
  // Preconnect to external domains
  const domains = ['https://fonts.googleapis.com', 'https://api.heys.app'];

  domains.forEach((domain) => {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = domain;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
}

// Memory usage monitoring
export function monitorMemoryUsage() {
  if ('memory' in performance) {
    const memory = (
      performance as Performance & {
        memory: {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
      }
    ).memory;
    const memoryInfo = {
      used: Math.round(memory.usedJSHeapSize / 1048576), // MB
      total: Math.round(memory.totalJSHeapSize / 1048576), // MB
      limit: Math.round(memory.jsHeapSizeLimit / 1048576), // MB
    };

    log.debug('Memory usage snapshot', memoryInfo);

    // Warn if memory usage is high
    if (memoryInfo.used / memoryInfo.limit > 0.8) {
      log.warn('Memory: high usage detected', memoryInfo);
    }

    return memoryInfo;
  }

  return null;
}

// Performance observer for monitoring
export function setupPerformanceObserver() {
  if ('PerformanceObserver' in window) {
    // Monitor Long Tasks
    const longTaskObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        log.warn('Performance observer: long task', {
          duration: Number(entry.duration.toFixed(2)),
        });
      });
    });

    try {
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // Longtask API not supported
    }

    // Monitor First Input Delay
    const fidObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        const fidEntry = entry as PerformanceEntry & {
          processingStart?: number;
          startTime: number;
        }; // First Input Delay entry
        if (fidEntry.processingStart) {
          const fid = fidEntry.processingStart - fidEntry.startTime;
          log.info('Performance observer: FID measured', {
            fid: Number(fid.toFixed(2)),
          });
        }
      });
    });

    try {
      fidObserver.observe({ entryTypes: ['first-input'] });
    } catch (e) {
      // First input API not supported
    }
  }
}
