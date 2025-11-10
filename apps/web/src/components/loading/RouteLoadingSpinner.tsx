// filepath: apps/web/src/components/loading/RouteLoadingSpinner.tsx
// Route Loading Spinner для page transitions - Performance Sprint Day 3

import React from 'react';

interface RouteLoadingSpinnerProps {
  /** Показывать прогресс загрузки */
  showProgress?: boolean;
  /** Текст загрузки */
  loadingText?: string;
  /** Размер спиннера */
  size?: 'small' | 'medium' | 'large';
  /** Полноэкранный режим */
  fullscreen?: boolean;
}

/**
 * Спиннер для загрузки маршрутов с прогресс-баром
 */
export const RouteLoadingSpinner: React.FC<RouteLoadingSpinnerProps> = ({
  showProgress = true,
  loadingText = 'Загрузка...',
  size = 'medium',
  fullscreen = true,
}) => {
  const [progress, setProgress] = React.useState(0);

  // Анимация прогресса
  React.useEffect(() => {
    if (!showProgress) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        // Быстрый старт, затем замедление
        if (prev < 60) return prev + Math.random() * 15;
        if (prev < 90) return prev + Math.random() * 5;
        return Math.min(prev + Math.random() * 2, 95);
      });
    }, 100);

    return () => clearInterval(interval);
  }, [showProgress]);

  // Сброс прогресса при размонтировании
  React.useEffect(() => {
    return () => setProgress(0);
  }, []);

  const spinnerSizes = {
    small: { width: '24px', height: '24px', borderWidth: '2px' },
    medium: { width: '40px', height: '40px', borderWidth: '3px' },
    large: { width: '60px', height: '60px', borderWidth: '4px' },
  };

  const spinnerStyle: React.CSSProperties = {
    ...spinnerSizes[size],
    borderRadius: '50%',
    border: `${spinnerSizes[size].borderWidth} solid #f3f3f3`,
    borderTop: `${spinnerSizes[size].borderWidth} solid #2563eb`,
    animation: 'route-loading-spin 1s linear infinite',
  };

  const containerStyle: React.CSSProperties = fullscreen
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        zIndex: 9999,
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      };

  // Создаем CSS animation
  React.useEffect(() => {
    const styleId = 'route-loading-animation';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes route-loading-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .route-loading-fade-in {
          animation: route-loading-fade-in 0.3s ease-in;
        }
        
        @keyframes route-loading-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div style={containerStyle} className="route-loading-fade-in">
      {/* Spinner */}
      <div style={spinnerStyle} />

      {/* Loading text */}
      <div
        style={{
          marginTop: '16px',
          fontSize: '14px',
          color: '#666',
          fontWeight: '500',
        }}
      >
        {loadingText}
      </div>

      {/* Progress bar */}
      {showProgress && (
        <div
          style={{
            marginTop: '16px',
            width: fullscreen ? '300px' : '200px',
            height: '4px',
            backgroundColor: '#f0f0f0',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              backgroundColor: '#2563eb',
              transition: 'width 0.3s ease',
              borderRadius: '2px',
            }}
          />
        </div>
      )}

      {/* Progress percentage */}
      {showProgress && (
        <div
          style={{
            marginTop: '8px',
            fontSize: '12px',
            color: '#999',
          }}
        >
          {Math.round(progress)}%
        </div>
      )}
    </div>
  );
};

/**
 * Компактный спиннер для inline loading
 */
export const InlineLoadingSpinner: React.FC<{
  text?: string;
  size?: 'small' | 'medium';
}> = ({ text = 'Загрузка...', size = 'small' }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 0',
      }}
    >
      <RouteLoadingSpinner size={size} showProgress={false} loadingText="" fullscreen={false} />
      <span style={{ fontSize: '14px', color: '#666' }}>{text}</span>
    </div>
  );
};

/**
 * Loading state для кнопок
 */
export const ButtonLoadingSpinner: React.FC<{
  isLoading: boolean;
  children: React.ReactNode;
  disabled?: boolean;
}> = ({ isLoading, children, disabled = false }) => {
  return (
    <button
      disabled={isLoading || disabled}
      style={{
        position: 'relative',
        opacity: isLoading ? 0.7 : 1,
        cursor: isLoading ? 'not-allowed' : 'pointer',
      }}
    >
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <RouteLoadingSpinner
            size="small"
            showProgress={false}
            loadingText=""
            fullscreen={false}
          />
        </div>
      )}
      <div style={{ visibility: isLoading ? 'hidden' : 'visible' }}>{children}</div>
    </button>
  );
};
