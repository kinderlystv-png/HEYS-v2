// filepath: apps/web/src/utils/image-optimizer.ts

/**
 * Advanced Image Optimization System для Days 5-6 Performance Sprint
 * Обеспечивает intelligent image loading, format conversion, и caching
 */

interface ImageOptimizationOptions {
  quality?: number;
  format?: 'webp' | 'avif' | 'jpg' | 'png' | 'auto';
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  blur?: boolean;
  placeholder?: 'blur' | 'empty' | string;
  priority?: boolean;
  preload?: boolean;
  lazy?: boolean;
}

interface ImageMetadata {
  src: string;
  width: number;
  height: number;
  format: string;
  size: number;
  optimized: boolean;
  cached: boolean;
  timestamp: number;
}

class ImageOptimizer {
  private cache = new Map<string, ImageMetadata>();
  private loadingPromises = new Map<string, Promise<ImageMetadata>>();
  private supportedFormats: Set<string> = new Set();

  constructor() {
    this.detectSupportedFormats();
    this.setupCacheCleanup();
  }

  /**
   * Основной метод оптимизации изображения
   */
  async optimizeImage(src: string, options: ImageOptimizationOptions = {}): Promise<ImageMetadata> {
    const {
      quality = 85,
      format = 'auto',
      width,
      height,
      fit = 'cover',
      blur = false,
      priority = false,
      preload = false,
    } = options;

    // Создаем уникальный ключ для кэширования
    const cacheKey = this.generateCacheKey(src, options);

    // Проверяем кэш
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      // Обновляем timestamp для LRU
      cached.timestamp = Date.now();
      return cached;
    }

    // Если уже загружается, возвращаем существующий Promise
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!;
    }

    // Запускаем оптимизацию
    const optimizationPromise = this.performOptimization(src, {
      quality,
      format,
      width: width || 0,
      height: height || 0,
      fit,
      blur,
      priority,
      preload,
    });

    this.loadingPromises.set(cacheKey, optimizationPromise);

    try {
      const result = await optimizationPromise;

      // Кэшируем результат
      this.cache.set(cacheKey, result);

      // Preload если требуется
      if (preload || priority) {
        this.preloadImage(result.src);
      }

      return result;
    } finally {
      this.loadingPromises.delete(cacheKey);
    }
  }

  /**
   * Выполняет актуальную оптимизацию изображения
   */
  private async performOptimization(
    src: string,
    options: Required<Omit<ImageOptimizationOptions, 'placeholder' | 'lazy'>>,
  ): Promise<ImageMetadata> {
    try {
      // Определяем оптимальный формат
      const targetFormat = this.selectOptimalFormat(options.format);

      // Создаем optimized URL
      const optimizedSrc = this.buildOptimizedUrl(src, {
        ...options,
        format: targetFormat as any,
      });

      // Получаем метаданные изображения
      const metadata = await this.getImageMetadata(optimizedSrc);

      return {
        src: optimizedSrc,
        width: metadata.width,
        height: metadata.height,
        format: targetFormat,
        size: metadata.size,
        optimized: true,
        cached: false,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.warn('Image optimization failed, falling back to original:', error);

      // Fallback к оригинальному изображению
      const fallbackMetadata = await this.getImageMetadata(src);

      return {
        src,
        width: fallbackMetadata.width,
        height: fallbackMetadata.height,
        format: this.getImageFormat(src),
        size: fallbackMetadata.size,
        optimized: false,
        cached: false,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Определяет оптимальный формат изображения
   */
  private selectOptimalFormat(requestedFormat: string): string {
    if (requestedFormat !== 'auto') {
      return this.supportedFormats.has(requestedFormat) ? requestedFormat : 'jpg';
    }

    // Auto selection logic
    if (this.supportedFormats.has('avif')) {
      return 'avif'; // Лучшая компрессия
    } else if (this.supportedFormats.has('webp')) {
      return 'webp'; // Хорошая компрессия и поддержка
    } else {
      return 'jpg'; // Универсальная поддержка
    }
  }

  /**
   * Строит URL для оптимизированного изображения
   */
  private buildOptimizedUrl(
    src: string,
    options: Required<Omit<ImageOptimizationOptions, 'placeholder' | 'lazy'>>,
  ): string {
    // Если это уже оптимизированный URL, возвращаем как есть
    if (src.includes('_optimized') || src.includes('w_') || src.includes('f_')) {
      return src;
    }

    const url = new URL(src, window.location.origin);
    const params = new URLSearchParams();

    // Добавляем параметры оптимизации
    if (options.width && options.width > 0) params.set('w', options.width.toString());
    if (options.height && options.height > 0) params.set('h', options.height.toString());
    if (options.quality) params.set('q', options.quality.toString());
    if (options.format) params.set('f', options.format);
    if (options.fit) params.set('fit', options.fit);
    if (options.blur) params.set('blur', '5');

    // Добавляем маркер оптимизации
    params.set('opt', '1');

    return `${url.pathname}?${params.toString()}`;
  }

  /**
   * Получает метаданные изображения
   */
  private async getImageMetadata(src: string): Promise<{
    width: number;
    height: number;
    size: number;
  }> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        // Приблизительная оценка размера файла
        const estimatedSize = this.estimateImageSize(img.naturalWidth, img.naturalHeight);

        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
          size: estimatedSize,
        });
      };

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${src}`));
      };

      img.src = src;
    });
  }

  /**
   * Preload изображения для улучшения UX
   */
  private preloadImage(src: string): void {
    // Используем link preload для critical images
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = src;

    // Добавляем в head если еще не существует
    const existing = document.querySelector(`link[href="${src}"]`);
    if (!existing) {
      document.head.appendChild(link);
    }
  }

  /**
   * Определяет поддерживаемые форматы браузером
   */
  private detectSupportedFormats(): void {
    // Базовые форматы всегда поддерживаются
    this.supportedFormats.add('jpg');
    this.supportedFormats.add('png');

    // Проверка WebP
    const webpCanvas = document.createElement('canvas');
    webpCanvas.width = 1;
    webpCanvas.height = 1;
    const webpData = webpCanvas.toDataURL('image/webp');
    if (webpData.indexOf('data:image/webp') === 0) {
      this.supportedFormats.add('webp');
    }

    // Проверка AVIF (более новый и эффективный формат)
    this.checkAVIFSupport();
  }

  /**
   * Асинхронная проверка поддержки AVIF
   */
  private checkAVIFSupport(): void {
    const avif = new Image();
    avif.onload = () => {
      this.supportedFormats.add('avif');
    };
    avif.onerror = () => {
      // AVIF не поддерживается
    };
    // Tiny AVIF image data URL
    avif.src =
      'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEAwgMg8f8D///8WfhwB8+ErK42A=';
  }

  /**
   * Получает формат изображения из URL
   */
  private getImageFormat(src: string): string {
    const extension = src.split('.').pop()?.toLowerCase();
    return extension || 'jpg';
  }

  /**
   * Приблизительная оценка размера изображения
   */
  private estimateImageSize(width: number, height: number, quality = 85): number {
    // Примерный расчет для JPEG с заданным качеством
    const pixels = width * height;
    const bytesPerPixel = (quality / 100) * 3; // RGB
    return Math.round(pixels * bytesPerPixel);
  }

  /**
   * Генерирует ключ для кэширования
   */
  private generateCacheKey(src: string, options: ImageOptimizationOptions): string {
    const optionsStr = JSON.stringify(options, Object.keys(options).sort());
    return `${src}_${btoa(optionsStr)}`;
  }

  /**
   * Настройка автоматической очистки кэша
   */
  private setupCacheCleanup(): void {
    // Очистка кэша каждые 30 минут
    setInterval(
      () => {
        this.cleanupCache();
      },
      30 * 60 * 1000,
    );

    // Очистка при превышении лимита памяти
    if ('memory' in performance) {
      setInterval(() => {
        // @ts-ignore - экспериментальное API
        const memInfo = (performance as any).memory;
        if (memInfo && memInfo.usedJSHeapSize > 50 * 1024 * 1024) {
          // 50MB
          this.cleanupCache(true);
        }
      }, 60 * 1000);
    }
  }

  /**
   * Очистка устаревших записей из кэша
   */
  private cleanupCache(aggressive = false): void {
    const now = Date.now();
    const maxAge = aggressive ? 5 * 60 * 1000 : 30 * 60 * 1000; // 5 или 30 минут

    for (const [key, metadata] of this.cache.entries()) {
      if (now - metadata.timestamp > maxAge) {
        this.cache.delete(key);
      }
    }

    // Если кэш все еще большой, удаляем самые старые
    if (this.cache.size > 100) {
      const entries = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp,
      );

      const toDelete = entries.slice(0, this.cache.size - 100);
      toDelete.forEach(([key]) => this.cache.delete(key));
    }
  }

  /**
   * Получение статистики кэша
   */
  getCacheStats(): {
    size: number;
    totalSize: number;
    hitRate: number;
    oldestEntry: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const oldestEntry =
      entries.length > 0 ? Math.min(...entries.map((e) => e.timestamp)) : Date.now();

    return {
      size: this.cache.size,
      totalSize,
      hitRate: 0, // TODO: implement hit rate tracking
      oldestEntry,
    };
  }

  /**
   * Очистка всего кэша
   */
  clearCache(): void {
    this.cache.clear();
    this.loadingPromises.clear();
  }
}

// Singleton instance
export const imageOptimizer = new ImageOptimizer();

// Export types
export type { ImageMetadata, ImageOptimizationOptions };
export default ImageOptimizer;
