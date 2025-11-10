// filepath: packages/shared/src/performance/components/LazyImage.tsx

import React, { memo, useEffect, useRef, useState } from 'react';
import { LazyLoader } from '../LazyLoader';
import { balancedLazyConfig } from '../lazy-loading-config';

interface LazyImageProps {
  src: string;
  alt: string;
  srcSet?: string;
  sizes?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  width?: number | string;
  height?: number | string;
  loading?: 'lazy' | 'eager';
  onLoad?: () => void;
  onError?: () => void;
  config?: any; // LazyLoadingConfig
}

/**
 * Компонент для ленивой загрузки изображений
 */
export const LazyImage: React.FC<LazyImageProps> = memo(
  ({
    src,
    alt,
    srcSet,
    sizes,
    placeholder = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNGNUY1RjUiLz48L3N2Zz4=',
    className = '',
    style = {},
    width,
    height,
    loading = 'lazy',
    onLoad,
    onError,
    config = balancedLazyConfig,
  }) => {
    const imgRef = useRef<HTMLImageElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [lazyLoader] = useState(() => new LazyLoader(config));

    useEffect(() => {
      if (imgRef.current && loading === 'lazy') {
        lazyLoader.observe(imgRef.current);

        // Обработчики событий
        const handleLoad = () => {
          setIsLoaded(true);
          onLoad?.();
        };

        const handleError = () => {
          setHasError(true);
          onError?.();
        };

        const imgElement = imgRef.current;
        imgElement.addEventListener('load', handleLoad);
        imgElement.addEventListener('error', handleError);

        return () => {
          imgElement.removeEventListener('load', handleLoad);
          imgElement.removeEventListener('error', handleError);
        };
      }
    }, [src, loading, lazyLoader, onLoad, onError]);

    useEffect(() => {
      // Если loading = 'eager', загружаем сразу
      if (loading === 'eager' && imgRef.current) {
        imgRef.current.src = src;
        if (srcSet) {
          imgRef.current.srcset = srcSet;
        }
      }
    }, [src, srcSet, loading]);

    useEffect(() => {
      return () => {
        lazyLoader.destroy();
      };
    }, [lazyLoader]);

    const imageClasses = [
      'lazy-image',
      className,
      isLoaded ? 'lazy-loaded' : '',
      hasError ? 'lazy-error' : '',
      !isLoaded && !hasError ? 'lazy-loading' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const imageStyle = {
      transition: 'opacity 0.3s ease-in-out',
      opacity: isLoaded ? 1 : 0.7,
      ...style,
    };

    return (
      <img
        ref={imgRef}
        src={loading === 'eager' ? src : placeholder}
        srcSet={loading === 'eager' ? srcSet : undefined}
        sizes={sizes}
        alt={alt}
        className={imageClasses}
        style={imageStyle}
        width={width}
        height={height}
        data-src={loading === 'lazy' ? src : undefined}
        data-srcset={loading === 'lazy' ? srcSet : undefined}
        loading={loading}
      />
    );
  },
);

LazyImage.displayName = 'LazyImage';
