// filepath: packages/shared/src/performance/LazyLoader.ts

import { performance } from 'perf_hooks';

import { perfLogger } from './logger';

const logger = perfLogger;

type PerformanceMemory = {
  usedJSHeapSize: number;
};

/**
 * Интерфейс для конфигурации ленивой загрузки
 */
export interface LazyLoadingConfig {
  /** Корневой элемент для Intersection Observer */
  root?: Element | null;
  /** Отступы для root (CSS margin syntax) */
  rootMargin?: string;
  /** Пороговые значения видимости (0-1) */
  threshold?: number | number[];
  /** Включить предзагрузку критических ресурсов */
  enablePreloading?: boolean;
  /** Максимальное количество одновременных загрузок */
  maxConcurrentLoads?: number;
  /** Таймаут для загрузки (мс) */
  loadTimeout?: number;
  /** Включить метрики производительности */
  enableMetrics?: boolean;
  /** Дебаунс для обработки событий (мс) */
  debounceDelay?: number;
}

/**
 * Интерфейс для метрик ленивой загрузки
 */
export interface LazyLoadingMetrics {
  totalItems: number;
  loadedItems: number;
  failedItems: number;
  averageLoadTime: number;
  totalLoadTime: number;
  memoryUsage: number;
  observerInstances: number;
  performanceScore: number;
}

/**
 * Интерфейс для элемента ленивой загрузки
 */
export interface LazyLoadableElement {
  element: Element;
  src?: string;
  callback?: () => Promise<void> | void;
  loaded?: boolean;
  loading?: boolean;
  error?: boolean;
  loadStartTime?: number;
  loadEndTime?: number;
  priority?: 'high' | 'medium' | 'low';
  preload?: boolean;
}

/**
 * Стратегии ленивой загрузки
 */
export enum LazyLoadingStrategy {
  INTERSECTION_OBSERVER = 'intersection-observer',
  SCROLL_BASED = 'scroll-based',
  TIME_BASED = 'time-based',
  USER_INTERACTION = 'user-interaction',
  NETWORK_BASED = 'network-based',
}

/**
 * Типы загружаемых ресурсов
 */
export enum ResourceType {
  IMAGE = 'image',
  COMPONENT = 'component',
  SCRIPT = 'script',
  STYLE = 'style',
  DATA = 'data',
  IFRAME = 'iframe',
}

/**
 * Основной класс для управления ленивой загрузкой ресурсов
 * Поддерживает различные стратегии и типы ресурсов
 */
export class LazyLoader {
  private config: Required<LazyLoadingConfig>;
  private observer: IntersectionObserver | null = null;
  private loadQueue: LazyLoadableElement[] = [];
  private loadedElements = new Set<Element>();
  private loadingElements = new Set<Element>();
  private errorElements = new Set<Element>();
  private metrics: LazyLoadingMetrics;
  private loadPromises = new Map<Element, Promise<void>>();
  private currentLoads = 0;
  private preloadedItems = new Set<string>();
  private static readonly baseLogger = logger.child({ component: 'LazyLoader' });
  private readonly logger = LazyLoader.baseLogger;

  constructor(config: LazyLoadingConfig = {}) {
    this.config = {
      root: null,
      rootMargin: '50px',
      threshold: [0, 0.1, 0.5, 1],
      enablePreloading: true,
      maxConcurrentLoads: 5,
      loadTimeout: 10000,
      enableMetrics: true,
      debounceDelay: 100,
      ...config,
    };

    this.metrics = {
      totalItems: 0,
      loadedItems: 0,
      failedItems: 0,
      averageLoadTime: 0,
      totalLoadTime: 0,
      memoryUsage: 0,
      observerInstances: 1,
      performanceScore: 100,
    };

    this.initializeObserver();
  }

  /**
   * Инициализация Intersection Observer
   */
  private initializeObserver(): void {
    if (!('IntersectionObserver' in window)) {
      this.logger.warn('IntersectionObserver не поддерживается, используется fallback');
      return;
    }

    this.observer = new IntersectionObserver(
      this.debounce(this.handleIntersection.bind(this), this.config.debounceDelay),
      {
        root: this.config.root,
        rootMargin: this.config.rootMargin,
        threshold: this.config.threshold,
      },
    );
  }

  /**
   * Обработка пересечений элементов
   */
  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const element = entry.target;
        this.loadElement(element);
        this.observer?.unobserve(element);
      }
    });
  }

  /**
   * Добавление элемента для ленивой загрузки
   */
  observe(element: Element, options: Partial<LazyLoadableElement> = {}): void {
    // Проверка на null или undefined
    if (!element) {
      this.logger.warn('LazyLoader: Cannot observe null or undefined element');
      return;
    }

    if (this.loadedElements.has(element) || this.loadingElements.has(element)) {
      return;
    }

    const lazyElement: LazyLoadableElement = {
      element,
      src: options.src || this.extractSource(element) || undefined,
      callback: options.callback,
      priority: options.priority || 'medium',
      preload: options.preload || false,
      loaded: false,
      loading: false,
      error: false,
    };

    // Предзагрузка для высокоприоритетных элементов
    if (lazyElement.preload && this.config.enablePreloading) {
      this.preloadResource(lazyElement);
    }

    this.loadQueue.push(lazyElement);
    this.metrics.totalItems++;

    if (this.observer) {
      this.observer.observe(element);
    } else {
      // Fallback для браузеров без IntersectionObserver
      this.loadElement(element);
    }
  }

  /**
   * Загрузка элемента
   */
  private async loadElement(element: Element): Promise<void> {
    if (this.loadingElements.has(element) || this.loadedElements.has(element)) {
      return;
    }

    // Проверка лимита одновременных загрузок
    if (this.currentLoads >= this.config.maxConcurrentLoads) {
      await this.waitForSlot();
    }

    const lazyElement = this.loadQueue.find((item) => item.element === element);
    if (!lazyElement) return;

    this.loadingElements.add(element);
    this.currentLoads++;

    const startTime = this.config.enableMetrics ? performance.now() : 0;
    lazyElement.loadStartTime = startTime;
    lazyElement.loading = true;

    try {
      const loadPromise = this.performLoad(lazyElement);
      this.loadPromises.set(element, loadPromise);

      // Таймаут для загрузки
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Load timeout')), this.config.loadTimeout);
      });

      await Promise.race([loadPromise, timeoutPromise]);

      // Успешная загрузка
      this.loadedElements.add(element);
      lazyElement.loaded = true;
      lazyElement.loading = false;

      if (this.config.enableMetrics) {
        const endTime = performance.now();
        lazyElement.loadEndTime = endTime;
        const loadTime = endTime - startTime;
        this.updateMetrics(loadTime, true);
      }

      this.metrics.loadedItems++;
    } catch (error) {
      // Ошибка загрузки
      this.errorElements.add(element);
      lazyElement.error = true;
      lazyElement.loading = false;
      this.metrics.failedItems++;

      this.logger.warn({ err: error as Error }, 'Ошибка ленивой загрузки');
    } finally {
      this.loadingElements.delete(element);
      this.loadPromises.delete(element);
      this.currentLoads--;
    }
  }

  /**
   * Выполнение загрузки в зависимости от типа ресурса
   */
  private async performLoad(lazyElement: LazyLoadableElement): Promise<void> {
    const { element, src, callback } = lazyElement;

    // Пользовательский callback
    if (callback) {
      await callback();
      return;
    }

    // Определение типа ресурса и загрузка
    const resourceType = this.getResourceType(element);

    switch (resourceType) {
      case ResourceType.IMAGE:
        await this.loadImage(element as HTMLImageElement, src);
        break;

      case ResourceType.IFRAME:
        await this.loadIframe(element as HTMLIFrameElement, src);
        break;

      case ResourceType.SCRIPT:
        await this.loadScript(element as HTMLScriptElement, src);
        break;

      case ResourceType.STYLE:
        await this.loadStyle(element as HTMLLinkElement, src);
        break;

      case ResourceType.COMPONENT:
        await this.loadComponent(element, src);
        break;

      default:
        // Универсальная загрузка атрибута src
        if (src) {
          if (element instanceof HTMLImageElement || element instanceof HTMLIFrameElement) {
            element.src = src;
          } else if (element instanceof HTMLScriptElement) {
            element.src = src;
          }
        }
    }
  }

  /**
   * Загрузка изображения
   */
  private loadImage(img: HTMLImageElement, src?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const newImg = new Image();

      newImg.onload = () => {
        img.src = newImg.src;
        img.classList.add('lazy-loaded');
        resolve();
      };

      newImg.onerror = () => {
        img.classList.add('lazy-error');
        reject(new Error('Image load failed'));
      };

      const imageSrc = src || img.dataset.src || img.dataset.lazySrc;
      if (imageSrc) {
        newImg.src = imageSrc;
      } else {
        reject(new Error('No image source found'));
      }
    });
  }

  /**
   * Загрузка iframe
   */
  private loadIframe(iframe: HTMLIFrameElement, src?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const iframeSrc = src || iframe.dataset.src || iframe.dataset.lazySrc;

      if (!iframeSrc) {
        reject(new Error('No iframe source found'));
        return;
      }

      iframe.onload = () => {
        iframe.classList.add('lazy-loaded');
        resolve();
      };

      iframe.onerror = () => {
        iframe.classList.add('lazy-error');
        reject(new Error('Iframe load failed'));
      };

      iframe.src = iframeSrc;
    });
  }

  /**
   * Загрузка скрипта
   */
  private loadScript(script: HTMLScriptElement, src?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptSrc = src || script.dataset.src || script.dataset.lazySrc;

      if (!scriptSrc) {
        reject(new Error('No script source found'));
        return;
      }

      const newScript = document.createElement('script');
      newScript.onload = () => {
        script.classList.add('lazy-loaded');
        resolve();
      };

      newScript.onerror = () => {
        script.classList.add('lazy-error');
        reject(new Error('Script load failed'));
      };

      newScript.src = scriptSrc;
      newScript.async = true;
      document.head.appendChild(newScript);
    });
  }

  /**
   * Загрузка стилей
   */
  private loadStyle(link: HTMLLinkElement, src?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const styleSrc = src || link.dataset.href || link.dataset.lazySrc;

      if (!styleSrc) {
        reject(new Error('No style source found'));
        return;
      }

      link.onload = () => {
        link.classList.add('lazy-loaded');
        resolve();
      };

      link.onerror = () => {
        link.classList.add('lazy-error');
        reject(new Error('Style load failed'));
      };

      link.href = styleSrc;
    });
  }

  /**
   * Загрузка компонента (для React/Vue и др.)
   */
  private async loadComponent(element: Element, src?: string): Promise<void> {
    // Базовая реализация для загрузки компонентов
    // Может быть расширена для конкретных фреймворков

    const componentName = (element as HTMLElement).dataset?.component;
    const componentSrc = src || (element as HTMLElement).dataset?.src;

    if (componentName && componentSrc) {
      try {
        const module = await import(componentSrc);
        const Component = module.default || module[componentName];

        if (Component) {
          element.classList.add('lazy-loaded');
          // Здесь можно добавить рендеринг компонента
        }
      } catch (error) {
        element.classList.add('lazy-error');
        throw error;
      }
    }
  }

  /**
   * Предзагрузка ресурса
   */
  private preloadResource(lazyElement: LazyLoadableElement): void {
    const { element, src } = lazyElement;

    if (!src || this.preloadedItems.has(src)) return;

    const resourceType = this.getResourceType(element);

    switch (resourceType) {
      case ResourceType.IMAGE:
        this.preloadImage(src);
        break;

      case ResourceType.SCRIPT:
        this.preloadScript(src);
        break;

      case ResourceType.STYLE:
        this.preloadStyle(src);
        break;
    }

    this.preloadedItems.add(src);
  }

  /**
   * Предзагрузка изображения
   */
  private preloadImage(src: string): void {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = src;
    document.head.appendChild(link);
  }

  /**
   * Предзагрузка скрипта
   */
  private preloadScript(src: string): void {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'script';
    link.href = src;
    document.head.appendChild(link);
  }

  /**
   * Предзагрузка стилей
   */
  private preloadStyle(src: string): void {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'style';
    link.href = src;
    document.head.appendChild(link);
  }

  /**
   * Определение типа ресурса
   */
  private getResourceType(element: Element): ResourceType {
    const tagName = element.tagName.toLowerCase();

    switch (tagName) {
      case 'img':
        return ResourceType.IMAGE;
      case 'iframe':
        return ResourceType.IFRAME;
      case 'script':
        return ResourceType.SCRIPT;
      case 'link':
        return ResourceType.STYLE;
      default:
        return (element as HTMLElement).dataset?.component
          ? ResourceType.COMPONENT
          : ResourceType.DATA;
    }
  }

  /**
   * Извлечение источника из элемента
   */
  private extractSource(element: Element): string | undefined {
    const dataset = element instanceof HTMLElement ? element.dataset : undefined;
    return (
      element.getAttribute('data-src') ||
      element.getAttribute('data-lazy-src') ||
      element.getAttribute('data-original') ||
      dataset?.src ||
      dataset?.lazySrc
    );
  }

  /**
   * Ожидание освобождения слота для загрузки
   */
  private waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      const checkSlot = () => {
        if (this.currentLoads < this.config.maxConcurrentLoads) {
          resolve();
        } else {
          setTimeout(checkSlot, 50);
        }
      };
      checkSlot();
    });
  }

  /**
   * Обновление метрик
   */
  private updateMetrics(loadTime: number, _success: boolean): void {
    if (!this.config.enableMetrics) return;

    this.metrics.totalLoadTime += loadTime;
    this.metrics.averageLoadTime = this.metrics.totalLoadTime / this.metrics.loadedItems;

    // Расчет производительности
    const successRate =
      this.metrics.loadedItems / (this.metrics.loadedItems + this.metrics.failedItems);
    const avgTimeScore = Math.max(0, 100 - this.metrics.averageLoadTime / 100);

    this.metrics.performanceScore = Math.round(successRate * 70 + avgTimeScore * 30);

    // Обновление использования памяти (приблизительно)
    const memory = (performance as unknown as Performance & { memory?: PerformanceMemory }).memory;
    if (memory) {
      this.metrics.memoryUsage = memory.usedJSHeapSize;
    }
  }

  /**
   * Дебаунс функция
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private debounce<T extends (...args: any[]) => void>(
    func: T,
    delay: number,
  ): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    return (...args: Parameters<T>) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  /**
   * Принудительная загрузка элемента
   */
  async forceLoad(element: Element): Promise<void> {
    await this.loadElement(element);
  }

  /**
   * Принудительная загрузка всех элементов
   */
  async loadAll(): Promise<void> {
    const loadPromises = this.loadQueue
      .filter((item) => !item.loaded && !item.loading)
      .map((item) => this.loadElement(item.element));

    await Promise.allSettled(loadPromises);
  }

  /**
   * Получение метрик
   */
  getMetrics(): LazyLoadingMetrics {
    return { ...this.metrics };
  }

  /**
   * Получение статистики элементов
   */
  getElementStats() {
    return {
      total: this.loadQueue.length,
      loaded: this.loadedElements.size,
      loading: this.loadingElements.size,
      error: this.errorElements.size,
      pending:
        this.loadQueue.length -
        this.loadedElements.size -
        this.loadingElements.size -
        this.errorElements.size,
    };
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.loadQueue = [];
    this.loadedElements.clear();
    this.loadingElements.clear();
    this.errorElements.clear();
    this.loadPromises.clear();
    this.preloadedItems.clear();
  }

  /**
   * Проверка поддержки браузера
   */
  static isSupported(): boolean {
    return 'IntersectionObserver' in window && 'Promise' in window && 'performance' in window;
  }
}

/**
 * Экспорт экземпляра по умолчанию
 */
export const defaultLazyLoader = new LazyLoader();

export default LazyLoader;
