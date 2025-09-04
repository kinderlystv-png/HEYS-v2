import { useEffect, useState, useRef, RefObject } from 'react';

interface UseLazyLoadOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
  fallbackDelay?: number;
  onIntersect?: () => void;
  onLeave?: () => void;
}

interface UseLazyLoadReturn {
  ref: RefObject<HTMLElement>;
  isVisible: boolean;
  isIntersecting: boolean;
  hasIntersected: boolean;
}

/**
 * Hook для lazy loading с Intersection Observer
 * Оптимизированный для performance и accessibility
 */
export function useLazyLoad(options: UseLazyLoadOptions = {}): UseLazyLoadReturn {
  const {
    threshold = 0.1,
    rootMargin = '50px',
    triggerOnce = true,
    fallbackDelay = 300,
    onIntersect,
    onLeave
  } = options;

  const [isVisible, setIsVisible] = useState(false);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [hasIntersected, setHasIntersected] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Fallback для браузеров без Intersection Observer
    if (typeof IntersectionObserver === 'undefined') {
      console.warn('IntersectionObserver not supported, using fallback');
      const fallbackTimer = setTimeout(() => {
        setIsVisible(true);
        setIsIntersecting(true);
        setHasIntersected(true);
        onIntersect?.();
      }, fallbackDelay);

      return () => clearTimeout(fallbackTimer);
    }

    // Создание observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const isCurrentlyIntersecting = entry.isIntersecting;
          
          setIsIntersecting(isCurrentlyIntersecting);
          
          if (isCurrentlyIntersecting) {
            setIsVisible(true);
            setHasIntersected(true);
            onIntersect?.();
            
            // Если triggerOnce = true, отключаем observer после первого пересечения
            if (triggerOnce && observerRef.current) {
              observerRef.current.unobserve(element);
            }
          } else if (!triggerOnce) {
            setIsVisible(false);
            onLeave?.();
          }
        });
      },
      {
        threshold,
        rootMargin
      }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current && element) {
        observerRef.current.unobserve(element);
      }
    };
  }, [threshold, rootMargin, triggerOnce, fallbackDelay, onIntersect, onLeave]);

  // Cleanup observer при unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return {
    ref,
    isVisible,
    isIntersecting,
    hasIntersected
  };
}

/**
 * Hook для preloading компонентов на основе scroll position
 * Загружает компоненты заранее для smooth UX
 */
export function usePreloadOnScroll(
  preloadDistance = 200,
  onPreload?: () => void
) {
  const [shouldPreload, setShouldPreload] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!ref.current || shouldPreload) return;

      const element = ref.current;
      const rect = element.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      // Preload если элемент приближается к viewport
      if (rect.top <= windowHeight + preloadDistance) {
        setShouldPreload(true);
        onPreload?.();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    
    // Проверяем сразу при mount
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [preloadDistance, onPreload, shouldPreload]);

  return { ref, shouldPreload };
}

/**
 * Hook для intersection-based image lazy loading
 * Специально для изображений с placeholder и progressive loading
 */
export function useLazyImage(src: string, placeholder?: string) {
  const [imageSrc, setImageSrc] = useState(placeholder || '');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  const { ref, isVisible } = useLazyLoad({
    threshold: 0.1,
    rootMargin: '100px',
    triggerOnce: true
  });

  useEffect(() => {
    if (!isVisible || !src) return;

    setIsLoading(true);
    setHasError(false);

    const img = new Image();
    
    img.onload = () => {
      setImageSrc(src);
      setIsLoading(false);
    };
    
    img.onerror = () => {
      setHasError(true);
      setIsLoading(false);
    };
    
    img.src = src;
  }, [isVisible, src]);

  return {
    ref,
    src: imageSrc,
    isLoading,
    hasError,
    isVisible
  };
}

/**
 * Hook для батчинга lazy load операций
 * Группирует операции для лучшей производительности
 */
export function useBatchedLazyLoad<T>(
  items: T[],
  batchSize = 5,
  delay = 100
) {
  const [loadedBatches, setLoadedBatches] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  const loadNextBatch = () => {
    if (isLoading || loadedBatches * batchSize >= items.length) return;
    
    setIsLoading(true);
    
    setTimeout(() => {
      setLoadedBatches(prev => prev + 1);
      setIsLoading(false);
    }, delay);
  };

  const visibleItems = items.slice(0, loadedBatches * batchSize);
  const hasMore = loadedBatches * batchSize < items.length;

  return {
    visibleItems,
    hasMore,
    isLoading,
    loadNextBatch,
    progress: items.length > 0 ? (visibleItems.length / items.length) * 100 : 0
  };
}

export default useLazyLoad;
