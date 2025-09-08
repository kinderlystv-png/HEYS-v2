import { log } from '@heys/logger';

// Логирование на клиентской стороне
log.info('HEYS SvelteKit client initialized');

// Обработка ошибок на клиенте
window.addEventListener('error', (event) => {
  log.error('Client JavaScript error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack,
  });
});

// Обработка неперехваченных промисов
window.addEventListener('unhandledrejection', (event) => {
  log.error('Unhandled promise rejection', {
    reason: event.reason instanceof Error ? {
      name: event.reason.name,
      message: event.reason.message,
      stack: event.reason.stack,
    } : String(event.reason),
  });
});

// Performance monitoring
if (typeof performance !== 'undefined') {
  window.addEventListener('load', () => {
    // Логируем основные метрики производительности
    setTimeout(() => {
      const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (perfData) {
        log.info('Page performance metrics', {
          loadTime: perfData.loadEventEnd - perfData.loadEventStart,
          domContentLoaded: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
          firstByte: perfData.responseStart - perfData.requestStart,
          domComplete: perfData.domComplete - perfData.fetchStart,
        });
      }
    }, 0);
  });
}
