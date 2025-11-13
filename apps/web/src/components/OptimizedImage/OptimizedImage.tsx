// filepath: apps/web/src/components/OptimizedImage/OptimizedImage.tsx

import { ImgHTMLAttributes, useEffect, useRef, useState } from 'react';

import { log } from '../../lib/browser-logger';
import { useLazyLoad } from '../../hooks/useLazyLoad';
import { usePerformanceMetrics } from '../../hooks/useServiceWorker';
import {
  ImageMetadata,
  ImageOptimizationOptions,
  imageOptimizer,
} from '../../utils/image-optimizer';

interface OptimizedImageProps
  extends Omit<
    ImgHTMLAttributes<HTMLImageElement>,
    'src' | 'width' | 'height' | 'onLoad' | 'onError'
  > {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  optimization?: ImageOptimizationOptions;
  lazy?: boolean;
  priority?: boolean;
  placeholder?: 'blur' | 'empty' | string;
  fallback?: string;
  onLoad?: (metadata: ImageMetadata) => void;
  onError?: (error: Error) => void;
  className?: string;
}

/**
 * OptimizedImage Component для intelligent image loading
 * Автоматически оптимизирует изображения и обеспечивает lazy loading
 */
export function OptimizedImage({
  src,
  alt,
  width,
  height,
  optimization = {},
  lazy = true,
  priority = false,
  placeholder = 'blur',
  fallback,
  onLoad,
  onError,
  className = '',
  ...imgProps
}: OptimizedImageProps) {
  const { sendImageLoadMetrics, sendErrorMetrics } = usePerformanceMetrics();

  const [imageState, setImageState] = useState<{
    src: string;
    metadata?: ImageMetadata;
    isLoading: boolean;
    hasError: boolean;
    isOptimized: boolean;
  }>({
    src: placeholder === 'blur' ? generateBlurDataURL(width, height) : placeholder || '',
    isLoading: true,
    hasError: false,
    isOptimized: false,
  });

  const imgRef = useRef<HTMLImageElement>(null);
  const [shouldLoad, setShouldLoad] = useState(!lazy || priority);

  // Lazy loading с intersection observer
  const { ref: intersectionRef } = useLazyLoad({
    threshold: 0.1,
    rootMargin: '100px',
    triggerOnce: true,
    onIntersect: () => {
      if (lazy && !priority) {
        setShouldLoad(true);
      }
    },
  });

  // Устанавливаем ref для intersection observer
  useEffect(() => {
    if (imgRef.current && intersectionRef) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (intersectionRef as any).current = imgRef.current;
    }
  }, [intersectionRef]);

  // Загрузка и оптимизация изображения
  useEffect(() => {
    if (!shouldLoad || !src) return;

    let isCancelled = false;

    const loadOptimizedImage = async () => {
      try {
        setImageState((prev) => ({ ...prev, isLoading: true, hasError: false }));

        // Применяем размеры из props к optimization options
        const optimizationOptions: ImageOptimizationOptions = {
          ...optimization,
          ...(width && { width }),
          ...(height && { height }),
          priority,
          preload: priority,
          lazy: lazy && !priority,
        };

        // Получаем оптимизированное изображение
        const metadata = await imageOptimizer.optimizeImage(src, optimizationOptions);

        if (isCancelled) return;

        // Создаем новый Image для предзагрузки
        const img = new Image();

        img.onload = () => {
          if (isCancelled) return;

          const loadEndTime = performance.now();
          const loadTime = loadEndTime - loadStartTime;

          setImageState({
            src: metadata.src,
            metadata,
            isLoading: false,
            hasError: false,
            isOptimized: metadata.optimized,
          });

          // Отправляем метрики производительности в Service Worker
          sendImageLoadMetrics(
            src,
            loadTime,
            loadTime < 50, // Предполагаем кэш если загрузка быстрая
            metadata.size,
          );

          onLoad?.(metadata);
        };

        img.onerror = () => {
          if (isCancelled) return;

          // Отправляем метрики об ошибке
          sendErrorMetrics('image_load_failed');

          // Fallback к оригинальному изображению
          handleImageError(new Error('Optimized image failed to load'));
        };

        const loadStartTime = performance.now();

        img.src = metadata.src;
      } catch (error) {
        if (isCancelled) return;
        handleImageError(error as Error);
      }
    };

    const handleImageError = (error: Error) => {
      // Отправляем метрики об ошибке оптимизации
      sendErrorMetrics('image_optimization_failed');

      if (process.env.NODE_ENV === 'development') {
        log.warn('Optimized image fallback triggered', {
          source: src,
          fallback: fallback || src,
          priority,
          error,
        });
      }

      // Пробуем fallback или оригинальное изображение
      const fallbackSrc = fallback || src;

      const img = new Image();
      img.onload = () => {
        if (isCancelled) return;

        setImageState({
          src: fallbackSrc,
          isLoading: false,
          hasError: false,
          isOptimized: false,
        });
      };

      img.onerror = () => {
        if (isCancelled) return;

        setImageState((prev) => ({
          ...prev,
          isLoading: false,
          hasError: true,
        }));

        onError?.(error);
      };

      img.src = fallbackSrc;
    };

    loadOptimizedImage();

    return () => {
      isCancelled = true;
    };
  }, [shouldLoad, src, width, height, optimization, priority, lazy, fallback, onLoad, onError]);

  // Устанавливаем приоритет для critical images
  useEffect(() => {
    if (priority && imageState.metadata?.src) {
      // Добавляем fetchpriority для critical images
      if (imgRef.current) {
        imgRef.current.setAttribute('fetchpriority', 'high');
      }
    }
  }, [priority, imageState.metadata?.src]);

  // Рендеринг состояний загрузки
  if (imageState.hasError) {
    return (
      <div
        className={`optimized-image-error ${className}`}
        style={{ width, height }}
        role="img"
        aria-label={`Failed to load image: ${alt}`}
      >
        <div className="error-content">
          <span>⚠️ Image failed to load</span>
          <small>{alt}</small>
        </div>

        <style>{`
          .optimized-image-error {
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #f3f4f6;
            border: 1px dashed #d1d5db;
            border-radius: 4px;
            color: #6b7280;
          }
          
          .error-content {
            text-align: center;
            padding: 1rem;
          }
          
          .error-content span {
            display: block;
            font-size: 0.875rem;
            margin-bottom: 0.25rem;
          }
          
          .error-content small {
            font-size: 0.75rem;
            opacity: 0.7;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`optimized-image-container ${className}`}>
      <img
        ref={imgRef}
        src={imageState.src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        className={`
          optimized-image
          ${imageState.isLoading ? 'loading' : 'loaded'}
          ${imageState.isOptimized ? 'optimized' : 'fallback'}
        `}
        {...imgProps}
      />

      {/* Loading overlay */}
      {imageState.isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
        </div>
      )}

      {/* Optimization indicator для development */}
      {process.env.NODE_ENV === 'development' && imageState.metadata && (
        <div className="optimization-info">
          <small>
            {imageState.metadata.format.toUpperCase()} •
            {imageState.metadata.optimized ? ' Optimized' : ' Original'} •
            {formatBytes(imageState.metadata.size)}
          </small>
        </div>
      )}

      <style>{`
        .optimized-image-container {
          position: relative;
          display: inline-block;
        }
        
        .optimized-image {
          transition: opacity 0.3s ease;
          max-width: 100%;
          height: auto;
        }
        
        .optimized-image.loading {
          opacity: 0.7;
        }
        
        .optimized-image.loaded {
          opacity: 1;
        }
        
        .optimized-image.optimized {
          box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.2);
        }
        
        .loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(1px);
        }
        
        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #e5e7eb;
          border-top: 2px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .optimization-info {
          position: absolute;
          top: 4px;
          right: 4px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
          font-family: monospace;
          opacity: 0;
          transition: opacity 0.2s;
        }
        
        .optimized-image-container:hover .optimization-info {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}

/**
 * Генерирует blur placeholder data URL
 */
function generateBlurDataURL(width?: number, height?: number): string {
  const w = width || 400;
  const h = height || 300;

  // Простой blur placeholder
  const svg = `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#f3f4f6;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#e5e7eb;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)" />
      <circle cx="${w / 2}" cy="${h / 2}" r="20" fill="#d1d5db" opacity="0.5" />
    </svg>
  `.trim();

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Форматирует размер файла для отображения
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default OptimizedImage;
