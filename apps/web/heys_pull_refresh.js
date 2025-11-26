// heys_pull_refresh.js — Pull-to-refresh component for mobile

;(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // Параметры
  const PULL_THRESHOLD = 80; // px для активации
  const MAX_PULL = 120; // максимальная высота

  function PullToRefresh({ onRefresh, children }) {
    const { useState, useRef, useCallback, useEffect } = React;
    
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const containerRef = useRef(null);
    const startYRef = useRef(0);
    const isPullingRef = useRef(false);
    
    // Haptic feedback
    const vibrate = useCallback((ms) => {
      if (navigator.vibrate) navigator.vibrate(ms);
    }, []);
    
    const handleTouchStart = useCallback((e) => {
      // Только если скролл в начале
      if (containerRef.current && containerRef.current.scrollTop === 0) {
        startYRef.current = e.touches[0].clientY;
        isPullingRef.current = true;
      }
    }, []);
    
    const handleTouchMove = useCallback((e) => {
      if (!isPullingRef.current || isRefreshing) return;
      
      const currentY = e.touches[0].clientY;
      const diff = currentY - startYRef.current;
      
      if (diff > 0) {
        // Используем easing для более нативного ощущения
        const easedDiff = Math.min(MAX_PULL, diff * 0.4);
        setPullDistance(easedDiff);
        
        // Haptic при достижении threshold
        if (easedDiff >= PULL_THRESHOLD && pullDistance < PULL_THRESHOLD) {
          vibrate(10);
        }
        
        // Предотвращаем скролл браузера
        if (diff > 10) {
          e.preventDefault();
        }
      }
    }, [isRefreshing, pullDistance, vibrate]);
    
    const handleTouchEnd = useCallback(() => {
      isPullingRef.current = false;
      
      if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
        setIsRefreshing(true);
        vibrate(20);
        
        // Вызываем onRefresh
        if (onRefresh) {
          Promise.resolve(onRefresh()).finally(() => {
            setIsRefreshing(false);
            setPullDistance(0);
          });
        } else {
          // Без onRefresh — просто ресет
          setTimeout(() => {
            setIsRefreshing(false);
            setPullDistance(0);
          }, 1000);
        }
      } else {
        setPullDistance(0);
      }
    }, [pullDistance, isRefreshing, onRefresh, vibrate]);
    
    // Touch event listeners
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
      
      return () => {
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
      };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd]);
    
    // Прогресс (0-1)
    const progress = Math.min(1, pullDistance / PULL_THRESHOLD);
    const isReady = pullDistance >= PULL_THRESHOLD;
    
    return React.createElement('div', {
      ref: containerRef,
      className: 'pull-refresh-container',
      style: { 
        position: 'relative',
        overflow: 'auto',
        height: '100%'
      }
    },
      // Индикатор
      React.createElement('div', {
        className: 'pull-refresh-indicator',
        style: {
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: `translateX(-50%) translateY(${pullDistance - 40}px)`,
          opacity: progress,
          transition: isRefreshing ? 'none' : 'opacity 0.2s',
          zIndex: 100
        }
      },
        React.createElement('div', {
          className: 'pull-refresh-spinner' + (isRefreshing ? ' spinning' : ''),
          style: {
            width: '24px',
            height: '24px',
            border: '2px solid #e0e0e0',
            borderTopColor: isReady || isRefreshing ? '#4CAF50' : '#2196F3',
            borderRadius: '50%',
            transform: `rotate(${progress * 180}deg)`,
            animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none'
          }
        })
      ),
      
      // Контент с отступом при pull
      React.createElement('div', {
        style: {
          transform: `translateY(${pullDistance}px)`,
          transition: isPullingRef.current ? 'none' : 'transform 0.3s ease-out'
        }
      }, children)
    );
  }

  HEYS.PullToRefresh = PullToRefresh;

})(window);
