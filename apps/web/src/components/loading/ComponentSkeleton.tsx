// filepath: apps/web/src/components/loading/ComponentSkeleton.tsx
// Loading Skeleton для lazy loaded components - Performance Sprint Day 3

import React from 'react';

interface SkeletonProps {
  /** Тип skeleton */
  variant?: 'text' | 'rectangular' | 'circular' | 'card';
  /** Ширина */
  width?: string | number;
  /** Высота */
  height?: string | number;
  /** CSS класс */
  className?: string;
  /** Количество строк для text variant */
  lines?: number;
}

/**
 * Универсальный компонент skeleton для loading states
 */
export const ComponentSkeleton: React.FC<SkeletonProps> = ({
  variant = 'rectangular',
  width = '100%',
  height = '20px',
  className = '',
  lines = 3,
}) => {
  const baseStyles: React.CSSProperties = {
    backgroundColor: '#f0f0f0',
    borderRadius: variant === 'circular' ? '50%' : '4px',
    animation: 'skeleton-pulse 1.5s ease-in-out infinite',
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  // Создаем CSS animation если не существует
  React.useEffect(() => {
    const styleId = 'skeleton-animation';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes skeleton-pulse {
          0% { opacity: 1; }
          50% { opacity: 0.6; }
          100% { opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  if (variant === 'text') {
    return (
      <div className={className}>
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            style={{
              ...baseStyles,
              width: index === lines - 1 ? '70%' : '100%',
              height: '16px',
              marginBottom: index < lines - 1 ? '8px' : '0',
            }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={className}
        style={{ padding: '16px', border: '1px solid #e0e0e0', borderRadius: '8px' }}
      >
        {/* Header */}
        <div style={{ ...baseStyles, height: '24px', marginBottom: '12px', width: '60%' }} />

        {/* Content lines */}
        <div style={{ ...baseStyles, height: '16px', marginBottom: '8px' }} />
        <div style={{ ...baseStyles, height: '16px', marginBottom: '8px', width: '80%' }} />
        <div style={{ ...baseStyles, height: '16px', width: '40%' }} />
      </div>
    );
  }

  return <div className={className} style={baseStyles} />;
};

/**
 * Специализированные skeleton компоненты
 */

export const DashboardSkeleton: React.FC = () => (
  <div style={{ padding: '20px' }}>
    {/* Header skeleton */}
    <ComponentSkeleton variant="rectangular" height="60px" className="mb-4" />

    {/* Cards grid skeleton */}
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '16px',
      }}
    >
      {Array.from({ length: 4 }, (_, index) => (
        <ComponentSkeleton key={index} variant="card" />
      ))}
    </div>
  </div>
);

export const AnalyticsSkeleton: React.FC = () => (
  <div style={{ padding: '20px' }}>
    {/* Charts area skeleton */}
    <ComponentSkeleton variant="rectangular" height="300px" className="mb-4" />

    {/* Stats grid */}
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginBottom: '20px',
      }}
    >
      {Array.from({ length: 3 }, (_, index) => (
        <ComponentSkeleton key={index} variant="rectangular" height="100px" />
      ))}
    </div>

    {/* Table skeleton */}
    <ComponentSkeleton variant="rectangular" height="200px" />
  </div>
);

export const ReportsSkeleton: React.FC = () => (
  <div style={{ padding: '20px' }}>
    {/* Filter bar skeleton */}
    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
      <ComponentSkeleton variant="rectangular" width="200px" height="40px" />
      <ComponentSkeleton variant="rectangular" width="150px" height="40px" />
      <ComponentSkeleton variant="rectangular" width="100px" height="40px" />
    </div>

    {/* Report list skeleton */}
    {Array.from({ length: 5 }, (_, index) => (
      <div
        key={index}
        style={{
          marginBottom: '16px',
          padding: '16px',
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
        }}
      >
        <ComponentSkeleton variant="text" lines={2} />
      </div>
    ))}
  </div>
);

export const SettingsSkeleton: React.FC = () => (
  <div style={{ padding: '20px' }}>
    {/* Settings sections */}
    {Array.from({ length: 3 }, (_, sectionIndex) => (
      <div key={sectionIndex} style={{ marginBottom: '32px' }}>
        {/* Section title */}
        <ComponentSkeleton variant="text" lines={1} width="200px" className="mb-3" />

        {/* Settings items */}
        {Array.from({ length: 4 }, (_, itemIndex) => (
          <div
            key={itemIndex}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <ComponentSkeleton variant="text" lines={1} width="250px" />
            <ComponentSkeleton variant="rectangular" width="60px" height="32px" />
          </div>
        ))}
      </div>
    ))}
  </div>
);
