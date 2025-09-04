// filepath: packages/shared/src/performance/LazyLoader.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LazyLoader, LazyLoadingStrategy } from './LazyLoader';
import { aggressiveLazyConfig, balancedLazyConfig } from './lazy-loading-config';

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn();
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

mockIntersectionObserver.mockReturnValue({
  observe: mockObserve,
  unobserve: mockUnobserve,
  disconnect: mockDisconnect,
});

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: mockIntersectionObserver,
});

Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: mockIntersectionObserver,
});

// Mock performance API
Object.defineProperty(window, 'performance', {
  writable: true,
  value: {
    now: vi.fn(() => 1000),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByType: vi.fn(() => []),
    memory: {
      usedJSHeapSize: 1000000,
      totalJSHeapSize: 2000000,
      jsHeapSizeLimit: 4000000
    }
  }
});

// Создаем mock для полного IntersectionObserverEntry
function createMockEntry(target: Element, isIntersecting: boolean = true): IntersectionObserverEntry {
  return {
    target,
    isIntersecting,
    boundingClientRect: new DOMRect(0, 0, 100, 100),
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: new DOMRect(0, 0, 100, 100),
    rootBounds: new DOMRect(0, 0, 1000, 1000),
    time: performance.now()
  } as IntersectionObserverEntry;
}

describe('LazyLoader', () => {
  let lazyLoader: LazyLoader;
  let mockElement: HTMLElement;

  beforeEach(() => {
    lazyLoader = new LazyLoader(balancedLazyConfig);
    
    // Создаем mock элемент
    mockElement = document.createElement('img');
    mockElement.setAttribute('data-src', 'test-image.jpg');
    document.body.appendChild(mockElement);

    // Очищаем все mock функции
    vi.clearAllMocks();
  });

  afterEach(() => {
    lazyLoader.destroy();
    document.body.removeChild(mockElement);
  });

  describe('Инициализация', () => {
    it('должен создавать экземпляр с корректной конфигурацией', () => {
      expect(lazyLoader).toBeInstanceOf(LazyLoader);
      expect(mockIntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          root: balancedLazyConfig.root,
          rootMargin: balancedLazyConfig.rootMargin,
          threshold: balancedLazyConfig.threshold
        })
      );
    });

    it('должен инициализировать метрики если включены', () => {
      const loader = new LazyLoader({
        ...balancedLazyConfig,
        enableMetrics: true
      });
      
      const metrics = loader.getMetrics();
      expect(metrics).toEqual({
        totalElements: 0,
        loadedElements: 0,
        failedElements: 0,
        averageLoadTime: 0,
        memoryUsage: expect.any(Number)
      });
    });
  });

  describe('Наблюдение за элементами', () => {
    it('должен добавлять элементы для наблюдения', () => {
      lazyLoader.observe(mockElement);
      
      expect(mockObserve).toHaveBeenCalledWith(mockElement);
    });

    it('должен удалять элементы из наблюдения', () => {
      lazyLoader.observe(mockElement);
      lazyLoader.unobserve(mockElement);
      
      expect(mockUnobserve).toHaveBeenCalledWith(mockElement);
    });

    it('должен автоматически обнаруживать элементы с атрибутами lazy loading', () => {
      const img = document.createElement('img');
      img.setAttribute('data-src', 'auto-detected.jpg');
      document.body.appendChild(img);

      const lazyCount = lazyLoader.observeAll();
      
      expect(lazyCount).toBeGreaterThan(0);
      expect(mockObserve).toHaveBeenCalled();
      
      document.body.removeChild(img);
    });
  });

  describe('Загрузка ресурсов', () => {
    it('должен определять тип ресурса по URL', () => {
      const imageElement = document.createElement('img');
      imageElement.setAttribute('data-src', 'image.jpg');
      
      const componentElement = document.createElement('div');
      componentElement.setAttribute('data-component', 'LazyComponent');
      
      const scriptElement = document.createElement('script');
      scriptElement.setAttribute('data-src', 'script.js');

      // Эмулируем intersection
      const entries = [
        { target: imageElement, isIntersecting: true },
        { target: componentElement, isIntersecting: true },
        { target: scriptElement, isIntersecting: true }
      ] as IntersectionObserverEntry[];

      lazyLoader.observe(imageElement);
      lazyLoader.observe(componentElement);
      lazyLoader.observe(scriptElement);

      // Получаем callback из mock
      const callback = mockIntersectionObserver.mock.calls[0][0];
      callback(entries);

      // Проверяем что элементы были обработаны
      expect(imageElement.classList.contains('lazy-loading')).toBe(true);
      expect(componentElement.classList.contains('lazy-loading')).toBe(true);
      expect(scriptElement.classList.contains('lazy-loading')).toBe(true);
    });

    it('должен загружать изображения', async () => {
      const img = document.createElement('img');
      img.setAttribute('data-src', 'test.jpg');
      img.setAttribute('data-srcset', 'test-small.jpg 480w, test-large.jpg 800w');
      
      // Мокаем успешную загрузку изображения
      Object.defineProperty(img, 'complete', { value: false, writable: true });
      Object.defineProperty(img, 'naturalWidth', { value: 0, writable: true });

      const loadPromise = new Promise<void>((resolve) => {
        img.addEventListener('load', () => {
          Object.defineProperty(img, 'complete', { value: true });
          Object.defineProperty(img, 'naturalWidth', { value: 800 });
          resolve();
        });
      });

      lazyLoader.observe(img);

      // Эмулируем intersection
      const entries = [{ target: img, isIntersecting: true }] as IntersectionObserverEntry[];
      const callback = mockIntersectionObserver.mock.calls[0][0];
      callback(entries);

      // Эмулируем загрузку изображения
      setTimeout(() => {
        img.dispatchEvent(new Event('load'));
      }, 10);

      await loadPromise;

      expect(img.src).toContain('test.jpg');
      expect(img.srcset).toContain('test-small.jpg 480w, test-large.jpg 800w');
      expect(img.classList.contains('lazy-loaded')).toBe(true);
    });

    it('должен обрабатывать ошибки загрузки', async () => {
      const img = document.createElement('img');
      img.setAttribute('data-src', 'invalid-image.jpg');
      
      const errorPromise = new Promise<void>((resolve) => {
        img.addEventListener('error', resolve);
      });

      lazyLoader.observe(img);

      // Эмулируем intersection
      const entries = [{ target: img, isIntersecting: true }] as IntersectionObserverEntry[];
      const callback = mockIntersectionObserver.mock.calls[0][0];
      callback(entries);

      // Эмулируем ошибку загрузки
      setTimeout(() => {
        img.dispatchEvent(new Event('error'));
      }, 10);

      await errorPromise;

      expect(img.classList.contains('lazy-error')).toBe(true);
      
      const metrics = lazyLoader.getMetrics();
      expect(metrics.failedElements).toBe(1);
    });
  });

  describe('Предзагрузка', () => {
    beforeEach(() => {
      lazyLoader = new LazyLoader({
        ...balancedLazyConfig,
        enablePreloading: true
      });
    });

    it('должен предзагружать ресурсы', () => {
      const urls = ['image1.jpg', 'image2.jpg', 'script.js'];
      
      lazyLoader.preload(urls);

      // Проверяем что создались link элементы для предзагрузки
      const preloadLinks = document.querySelectorAll('link[rel="preload"]');
      expect(preloadLinks.length).toBe(urls.length);
    });

    it('должен предзагружать критические ресурсы', () => {
      const criticalResources = ['critical.css', 'critical.js'];
      
      lazyLoader.preloadCritical(criticalResources);

      const preloadLinks = document.querySelectorAll('link[rel="preload"]');
      expect(preloadLinks.length).toBe(criticalResources.length);
      
      // Проверяем что у критических ресурсов есть высокий приоритет
      preloadLinks.forEach(link => {
        expect(link.getAttribute('importance')).toBe('high');
      });
    });
  });

  describe('Управление конкурентностью', () => {
    it('должен ограничивать количество одновременных загрузок', async () => {
      const loader = new LazyLoader({
        ...balancedLazyConfig,
        maxConcurrentLoads: 2
      });

      const elements = Array.from({ length: 5 }, (_, i) => {
        const img = document.createElement('img');
        img.setAttribute('data-src', `image${i}.jpg`);
        return img;
      });

      elements.forEach(el => loader.observe(el));

      // Эмулируем intersection для всех элементов
      const entries = elements.map(target => ({ target, isIntersecting: true })) as IntersectionObserverEntry[];
      const callback = mockIntersectionObserver.mock.calls[0][0];
      callback(entries);

      // Проверяем что одновременно загружается не больше maxConcurrentLoads
      const loadingElements = elements.filter(el => el.classList.contains('lazy-loading'));
      expect(loadingElements.length).toBeLessThanOrEqual(2);
    });

    it('должен ставить загрузки в очередь при превышении лимита', () => {
      const loader = new LazyLoader({
        ...aggressiveLazyConfig,
        maxConcurrentLoads: 1
      });

      const img1 = document.createElement('img');
      img1.setAttribute('data-src', 'image1.jpg');
      
      const img2 = document.createElement('img');
      img2.setAttribute('data-src', 'image2.jpg');

      loader.observe(img1);
      loader.observe(img2);

      // Эмулируем intersection
      const entries = [
        { target: img1, isIntersecting: true },
        { target: img2, isIntersecting: true }
      ] as IntersectionObserverEntry[];
      
      const callback = mockIntersectionObserver.mock.calls[0][0];
      callback(entries);

      // Проверяем что только одно изображение загружается
      const loadingElements = [img1, img2].filter(el => el.classList.contains('lazy-loading'));
      expect(loadingElements.length).toBe(1);
    });
  });

  describe('Метрики и мониторинг', () => {
    beforeEach(() => {
      lazyLoader = new LazyLoader({
        ...balancedLazyConfig,
        enableMetrics: true
      });
    });

    it('должен собирать метрики производительности', () => {
      const img = document.createElement('img');
      img.setAttribute('data-src', 'test.jpg');
      
      lazyLoader.observe(img);

      const metrics = lazyLoader.getMetrics();
      expect(metrics).toEqual({
        totalElements: 1,
        loadedElements: 0,
        failedElements: 0,
        averageLoadTime: 0,
        memoryUsage: expect.any(Number)
      });
    });

    it('должен обновлять метрики после загрузки', async () => {
      const img = document.createElement('img');
      img.setAttribute('data-src', 'test.jpg');
      
      lazyLoader.observe(img);

      // Эмулируем successful загрузку
      const entries = [{ target: img, isIntersecting: true }] as IntersectionObserverEntry[];
      const callback = mockIntersectionObserver.mock.calls[0][0];
      callback(entries);

      // Эмулируем завершение загрузки
      setTimeout(() => {
        img.classList.add('lazy-loaded');
        img.dispatchEvent(new Event('load'));
      }, 10);

      await new Promise(resolve => setTimeout(resolve, 20));

      const metrics = lazyLoader.getMetrics();
      expect(metrics.loadedElements).toBe(1);
    });

    it('должен экспортировать метрики в нужном формате', () => {
      const img = document.createElement('img');
      img.setAttribute('data-src', 'test.jpg');
      
      lazyLoader.observe(img);

      const exportedMetrics = lazyLoader.exportMetrics();
      
      expect(exportedMetrics).toEqual({
        timestamp: expect.any(Number),
        metrics: expect.objectContaining({
          totalElements: expect.any(Number),
          loadedElements: expect.any(Number),
          failedElements: expect.any(Number),
          averageLoadTime: expect.any(Number),
          memoryUsage: expect.any(Number)
        }),
        config: expect.any(Object)
      });
    });
  });

  describe('Различные стратегии загрузки', () => {
    it('должен использовать стратегию USER_INTERACTION', () => {
      const loader = new LazyLoader({
        ...balancedLazyConfig,
        strategy: LazyLoadingStrategy.USER_INTERACTION
      });

      const video = document.createElement('video');
      video.setAttribute('data-src', 'video.mp4');
      
      loader.observe(video);

      // Проверяем что элемент не загружается сразу
      expect(video.classList.contains('lazy-loading')).toBe(false);

      // Эмулируем клик пользователя
      video.dispatchEvent(new Event('click'));

      // Теперь должна начаться загрузка
      expect(video.classList.contains('lazy-loading')).toBe(true);
    });

    it('должен использовать стратегию TIME_BASED', async () => {
      const loader = new LazyLoader({
        ...balancedLazyConfig,
        strategy: LazyLoadingStrategy.TIME_BASED,
        loadDelay: 100
      });

      const script = document.createElement('script');
      script.setAttribute('data-src', 'script.js');
      
      loader.observe(script);

      // Проверяем что загрузка не началась сразу
      expect(script.classList.contains('lazy-loading')).toBe(false);

      // Ждем задержку
      await new Promise(resolve => setTimeout(resolve, 150));

      // Теперь должна начаться загрузка
      expect(script.classList.contains('lazy-loading')).toBe(true);
    });
  });

  describe('Очистка ресурсов', () => {
    it('должен корректно очищать все ресурсы при уничтожении', () => {
      const img = document.createElement('img');
      img.setAttribute('data-src', 'test.jpg');
      
      lazyLoader.observe(img);
      
      expect(mockObserve).toHaveBeenCalledWith(img);

      lazyLoader.destroy();

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('должен удалять event listeners', () => {
      const img = document.createElement('img');
      img.setAttribute('data-src', 'test.jpg');
      
      lazyLoader.observe(img);
      lazyLoader.destroy();

      // После destroy элемент не должен реагировать на события
      img.dispatchEvent(new Event('click'));
      expect(img.classList.contains('lazy-loading')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('должен обрабатывать элементы без атрибутов lazy loading', () => {
      const div = document.createElement('div');
      // Элемент без data-src, data-component и других атрибутов
      
      lazyLoader.observe(div);

      const entries = [{ target: div, isIntersecting: true }] as IntersectionObserverEntry[];
      const callback = mockIntersectionObserver.mock.calls[0][0];
      
      // Не должно бросать ошибку
      expect(() => callback(entries)).not.toThrow();
    });

    it('должен обрабатывать невалидные URL', () => {
      const img = document.createElement('img');
      img.setAttribute('data-src', '');
      
      lazyLoader.observe(img);

      const entries = [{ target: img, isIntersecting: true }] as IntersectionObserverEntry[];
      const callback = mockIntersectionObserver.mock.calls[0][0];
      
      expect(() => callback(entries)).not.toThrow();
    });

    it('должен обрабатывать загрузку элементов которые уже не в DOM', () => {
      const img = document.createElement('img');
      img.setAttribute('data-src', 'test.jpg');
      document.body.appendChild(img);
      
      lazyLoader.observe(img);
      
      // Удаляем элемент из DOM
      document.body.removeChild(img);

      const entries = [{ target: img, isIntersecting: true }] as IntersectionObserverEntry[];
      const callback = mockIntersectionObserver.mock.calls[0][0];
      
      // Не должно бросать ошибку
      expect(() => callback(entries)).not.toThrow();
    });
  });

  describe('Интеграция с производительностью', () => {
    it('должен работать с Performance Observer API', () => {
      // Mock Performance Observer
      const mockPerformanceObserver = vi.fn();
      const mockObservePerf = vi.fn();
      const mockDisconnectPerf = vi.fn();

      mockPerformanceObserver.mockReturnValue({
        observe: mockObservePerf,
        disconnect: mockDisconnectPerf,
      });

      Object.defineProperty(window, 'PerformanceObserver', {
        writable: true,
        value: mockPerformanceObserver,
      });

      const loader = new LazyLoader({
        ...balancedLazyConfig,
        enableMetrics: true
      });

      // Проверяем что Performance Observer был создан для мониторинга
      expect(mockPerformanceObserver).toHaveBeenCalled();
    });

    it('должен корректно измерять время загрузки', async () => {
      const img = document.createElement('img');
      img.setAttribute('data-src', 'test.jpg');
      
      const startTime = performance.now();
      
      lazyLoader.observe(img);

      // Эмулируем intersection
      const entries = [{ target: img, isIntersecting: true }] as IntersectionObserverEntry[];
      const callback = mockIntersectionObserver.mock.calls[0][0];
      callback(entries);

      // Эмулируем загрузку
      setTimeout(() => {
        img.dispatchEvent(new Event('load'));
      }, 100);

      await new Promise(resolve => setTimeout(resolve, 150));

      const metrics = lazyLoader.getMetrics();
      expect(metrics.averageLoadTime).toBeGreaterThan(0);
    });
  });
});
