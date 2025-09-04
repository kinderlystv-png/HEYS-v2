// filepath: apps/web/src/components/OptimizedImage/LazyImage.tsx

import { ComponentProps } from 'react';
import OptimizedImage from './OptimizedImage';

interface LazyImageProps extends ComponentProps<typeof OptimizedImage> {
  threshold?: number;
  rootMargin?: string;
  fadeIn?: boolean;
  blurUp?: boolean;
}

/**
 * LazyImage - обертка для OptimizedImage с расширенными lazy loading возможностями
 * Автоматически применяет оптимальные настройки для lazy loading
 */
export function LazyImage({
  threshold = 0.1,
  rootMargin = '50px',
  fadeIn = true,
  blurUp = true,
  placeholder = 'blur',
  lazy = true,
  className = '',
  ...props
}: LazyImageProps) {
  const containerClass = `
    lazy-image-wrapper
    ${fadeIn ? 'fade-in' : ''}
    ${blurUp ? 'blur-up' : ''}
    ${className}
  `.trim();

  return (
    <div className={containerClass}>
      <OptimizedImage
        {...props}
        lazy={lazy}
        placeholder={blurUp ? placeholder : 'empty'}
        className="lazy-image"
      />
      
      <style>{`
        .lazy-image-wrapper {
          position: relative;
          overflow: hidden;
        }
        
        .lazy-image-wrapper.fade-in .lazy-image {
          transition: opacity 0.3s ease-in-out;
        }
        
        .lazy-image-wrapper.blur-up .lazy-image.loading {
          filter: blur(2px);
          transform: scale(1.02);
        }
        
        .lazy-image-wrapper.blur-up .lazy-image.loaded {
          filter: blur(0);
          transform: scale(1);
          transition: filter 0.3s ease, transform 0.3s ease;
        }
        
        .lazy-image {
          width: 100%;
          height: auto;
          display: block;
        }
      `}</style>
    </div>
  );
}

export default LazyImage;
