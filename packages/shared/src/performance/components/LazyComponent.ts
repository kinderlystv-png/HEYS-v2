// filepath: packages/shared/src/performance/components/LazyComponent.ts

import { logger as baseLogger } from '@heys/logger';

import { balancedLazyConfig } from '../lazy-loading-config';
import { LazyLoader } from '../LazyLoader';

interface LazyComponentConfig {
  selector: string;
  componentLoader: () => Promise<unknown>;
  placeholder?: string;
  errorPlaceholder?: string;
  config?: unknown; // LazyLoadingConfig
}

/**
 * Класс для ленивой загрузки компонентов
 */
export class LazyComponent {
  private lazyLoader: LazyLoader;
  private components: Map<Element, LazyComponentConfig>;
  private loadedComponents: Set<Element>;
  private readonly logger = baseLogger.child({ component: 'LazyComponent' });

  constructor(config = balancedLazyConfig) {
    this.lazyLoader = new LazyLoader(config);
    this.components = new Map();
    this.loadedComponents = new Set();
  }

  /**
   * Регистрация компонента для ленивой загрузки
   */
  register(config: LazyComponentConfig): void {
    const elements = document.querySelectorAll(config.selector);

    elements.forEach((element) => {
      this.components.set(element, config);
      this.setupPlaceholder(element, config.placeholder);
      this.lazyLoader.observe(element);
    });
  }

  /**
   * Загрузка компонента
   */
  async loadComponent(element: Element, config: LazyComponentConfig): Promise<void> {
    if (this.loadedComponents.has(element)) {
      return;
    }

    try {
      // Добавляем класс загрузки
      element.classList.add('lazy-component-loading');

      // Загружаем компонент
      const component = await config.componentLoader();

      // Рендерим компонент
      this.renderComponent(element, component);

      // Отмечаем как загруженный
      this.loadedComponents.add(element);
      element.classList.remove('lazy-component-loading');
      element.classList.add('lazy-component-loaded');
    } catch (error) {
      this.logger.error({ err: error as Error }, 'Failed to load lazy component');
      this.renderError(element, config.errorPlaceholder);
      element.classList.remove('lazy-component-loading');
      element.classList.add('lazy-component-error');
    }
  }

  /**
   * Установка placeholder для компонента
   */
  private setupPlaceholder(element: Element, placeholder?: string): void {
    if (placeholder) {
      element.innerHTML = placeholder;
    } else {
      element.innerHTML = this.getDefaultPlaceholder();
    }
    element.classList.add('lazy-component-placeholder');
  }

  /**
   * Рендеринг компонента
   */
  private renderComponent(element: Element, component: unknown): void {
    // Простая реализация рендеринга
    if (typeof component === 'string') {
      element.innerHTML = component;
    } else if (
      component &&
      typeof component === 'object' &&
      'render' in component &&
      typeof (component as { render: () => string }).render === 'function'
    ) {
      element.innerHTML = (component as { render: () => string }).render();
    } else if (component && typeof component === 'object' && 'template' in component) {
      element.innerHTML = String((component as { template: unknown }).template);
    } else {
      this.logger.warn({ component }, 'Unknown component format');
    }
  }

  /**
   * Рендеринг ошибки
   */
  private renderError(element: Element, errorPlaceholder?: string): void {
    const errorContent = errorPlaceholder || this.getDefaultErrorPlaceholder();
    element.innerHTML = errorContent;
  }

  /**
   * Получение дефолтного placeholder
   */
  private getDefaultPlaceholder(): string {
    return `
      <div class="lazy-component-default-placeholder">
        <div class="lazy-spinner"></div>
        <p>Loading component...</p>
      </div>
    `;
  }

  /**
   * Получение дефолтного error placeholder
   */
  private getDefaultErrorPlaceholder(): string {
    return `
      <div class="lazy-component-error-placeholder">
        <p>Failed to load component</p>
        <button onclick="location.reload()">Retry</button>
      </div>
    `;
  }

  /**
   * Автоматическое обнаружение и регистрация компонентов
   */
  autoRegister(): number {
    let registeredCount = 0;

    // Поиск элементов с data-lazy-component
    const lazyElements = document.querySelectorAll('[data-lazy-component]');

    lazyElements.forEach((element) => {
      const componentName = element.getAttribute('data-lazy-component');
      const componentPath = element.getAttribute('data-component-path');

      if (componentName && componentPath) {
        const placeholderAttr = element.getAttribute('data-placeholder');
        const errorPlaceholderAttr = element.getAttribute('data-error-placeholder');

        this.register({
          selector: `[data-lazy-component="${componentName}"]`,
          componentLoader: () => this.dynamicImport(componentPath),
          ...(placeholderAttr && { placeholder: placeholderAttr }),
          ...(errorPlaceholderAttr && { errorPlaceholder: errorPlaceholderAttr }),
        });
        registeredCount++;
      }
    });

    return registeredCount;
  }

  /**
   * Динамический импорт компонента
   */
  private async dynamicImport(componentPath: string): Promise<unknown> {
    try {
      const module = await import(componentPath);
      return module.default || module;
    } catch (error) {
      this.logger.error({ err: error as Error }, `Failed to import component from ${componentPath}`);
      throw error;
    }
  }

  /**
   * Получение метрик загрузки компонентов
   */
  getMetrics(): {
    totalComponents: number;
    loadedComponents: number;
    failedComponents: number;
    loadingComponents: number;
  } {
    const totalComponents = this.components.size;
    const loadedComponents = this.loadedComponents.size;
    const failedComponents = document.querySelectorAll('.lazy-component-error').length;
    const loadingComponents = document.querySelectorAll('.lazy-component-loading').length;

    return {
      totalComponents,
      loadedComponents,
      failedComponents,
      loadingComponents,
    };
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    this.lazyLoader.destroy();
    this.components.clear();
    this.loadedComponents.clear();
  }
}

/**
 * Фабрика для создания lazy компонентов
 */
export class LazyComponentFactory {
  /**
   * Создание lazy image компонента
   */
  static createImageComponent(
    src: string,
    alt: string,
    options: {
      placeholder?: string;
      className?: string;
      width?: number;
      height?: number;
    } = {},
  ): HTMLImageElement {
    const img = document.createElement('img');
    img.setAttribute('data-src', src);
    img.alt = alt;

    if (options.placeholder) {
      img.src = options.placeholder;
    }

    if (options.className) {
      img.className = options.className;
    }

    if (options.width) {
      img.width = options.width;
    }

    if (options.height) {
      img.height = options.height;
    }

    img.classList.add('lazy-image');
    return img;
  }

  /**
   * Создание lazy video компонента
   */
  static createVideoComponent(
    src: string,
    options: {
      poster?: string;
      controls?: boolean;
      autoplay?: boolean;
      muted?: boolean;
      loop?: boolean;
      className?: string;
    } = {},
  ): HTMLVideoElement {
    const video = document.createElement('video');
    video.setAttribute('data-src', src);

    if (options.poster) {
      video.poster = options.poster;
    }

    video.controls = options.controls ?? true;
    video.autoplay = options.autoplay ?? false;
    video.muted = options.muted ?? false;
    video.loop = options.loop ?? false;

    if (options.className) {
      video.className = options.className;
    }

    video.classList.add('lazy-video');
    return video;
  }

  /**
   * Создание lazy iframe компонента
   */
  static createIframeComponent(
    src: string,
    options: {
      width?: number | string;
      height?: number | string;
      title?: string;
      className?: string;
      sandbox?: string;
    } = {},
  ): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-src', src);

    if (options.width) {
      iframe.width = options.width.toString();
    }

    if (options.height) {
      iframe.height = options.height.toString();
    }

    if (options.title) {
      iframe.title = options.title;
    }

    if (options.className) {
      iframe.className = options.className;
    }

    if (options.sandbox) {
      iframe.sandbox.value = options.sandbox;
    }

    iframe.classList.add('lazy-iframe');
    return iframe;
  }
}

/**
 * Глобальный экземпляр для простого использования
 */
export const globalLazyComponent = new LazyComponent();
