import { ComponentProps } from 'react';

interface ComponentSkeletonProps extends ComponentProps<'div'> {
  type?: 'card' | 'list-item' | 'table-row' | 'avatar' | 'text' | 'button' | 'chart';
  variant?: 'default' | 'compact' | 'detailed';
  animate?: boolean;
  rows?: number;
  width?: string | number;
  height?: string | number;
}

/**
 * Skeleton для отдельных компонентов
 * Используется для loading состояний на уровне компонентов
 */
export function ComponentSkeleton({
  type = 'card',
  variant = 'default',
  animate = true,
  rows = 3,
  width = '100%',
  height,
  className = '',
  ...props
}: ComponentSkeletonProps) {
  const baseClasses = `bg-gray-200 rounded ${animate ? 'animate-pulse' : ''}`;

  const renderSkeleton = () => {
    switch (type) {
      case 'avatar':
        return (
          <div
            className={`${baseClasses} rounded-full`}
            style={{
              width: typeof width === 'number' ? `${width}px` : width,
              height: typeof height === 'number' ? `${height}px` : height || width,
            }}
          />
        );

      case 'text':
        return (
          <div className="space-y-2">
            {Array.from({ length: rows }).map((_, i) => (
              <div
                key={i}
                className={`${baseClasses} h-4`}
                style={{
                  width: i === rows - 1 ? '75%' : '100%',
                }}
              />
            ))}
          </div>
        );

      case 'button':
        return (
          <div
            className={`${baseClasses} h-10`}
            style={{
              width: typeof width === 'number' ? `${width}px` : width,
            }}
          />
        );

      case 'list-item':
        return (
          <div className="flex items-center space-x-3 p-3">
            <div className={`${baseClasses} w-10 h-10 rounded-full`} />
            <div className="flex-1">
              <div className={`${baseClasses} h-4 w-3/4 mb-2`} />
              <div className={`${baseClasses} h-3 w-1/2`} />
            </div>
            {variant === 'detailed' && <div className={`${baseClasses} w-20 h-6`} />}
          </div>
        );

      case 'table-row': {
        const columns = variant === 'compact' ? 3 : variant === 'detailed' ? 6 : 4;
        return (
          <tr className="border-b">
            {Array.from({ length: columns }).map((_, i) => (
              <td key={i} className="p-3">
                <div className={`${baseClasses} h-4`} />
              </td>
            ))}
          </tr>
        );
      }

      case 'chart':
        return (
          <div
            className={`${baseClasses} rounded-lg flex items-end justify-center p-4`}
            style={{
              width: typeof width === 'number' ? `${width}px` : width,
              height: typeof height === 'number' ? `${height}px` : height || '200px',
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`${baseClasses} mx-1`}
                style={{
                  width: '12px',
                  height: `${20 + Math.random() * 80}%`,
                }}
              />
            ))}
          </div>
        );

      case 'card':
      default:
        return (
          <div className={`${baseClasses} p-4 rounded-lg`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className={`${baseClasses} h-6 w-1/3`} />
              {variant === 'detailed' && <div className={`${baseClasses} h-8 w-20`} />}
            </div>

            {/* Content */}
            <div className="space-y-3">
              {Array.from({ length: rows }).map((_, i) => (
                <div
                  key={i}
                  className={`${baseClasses} h-4`}
                  style={{
                    width: `${Math.random() * 40 + 60}%`,
                  }}
                />
              ))}
            </div>

            {/* Footer */}
            {variant !== 'compact' && (
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                <div className={`${baseClasses} h-4 w-20`} />
                <div className={`${baseClasses} h-8 w-24`} />
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className={`component-skeleton ${className}`} data-testid={`skeleton-${type}`} {...props}>
      <style>{`
        .component-skeleton .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.3;
          }
        }
      `}</style>

      {renderSkeleton()}
    </div>
  );
}

/**
 * Готовые компоненты для часто используемых skeleton
 */
export const SkeletonVariants = {
  UserCard: () => (
    <ComponentSkeleton type="card" variant="detailed" rows={2} className="max-w-sm" />
  ),

  DataTable: ({ rows = 5 }: { rows?: number }) => (
    <div className="w-full">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            {Array.from({ length: 4 }).map((_, i) => (
              <th key={i} className="p-3 text-left">
                <ComponentSkeleton type="text" rows={1} height={16} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <ComponentSkeleton key={i} type="table-row" />
          ))}
        </tbody>
      </table>
    </div>
  ),

  UserProfile: () => (
    <div className="flex items-start space-x-4 p-6">
      <ComponentSkeleton type="avatar" width={80} height={80} />
      <div className="flex-1">
        <ComponentSkeleton type="text" rows={1} height={24} className="mb-2" />
        <ComponentSkeleton type="text" rows={2} height={16} className="mb-4" />
        <div className="flex space-x-2">
          <ComponentSkeleton type="button" width={100} />
          <ComponentSkeleton type="button" width={80} />
        </div>
      </div>
    </div>
  ),

  Analytics: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <ComponentSkeleton type="chart" height={200} />
      <ComponentSkeleton type="chart" height={200} />
      <ComponentSkeleton type="chart" height={200} />
    </div>
  ),
};

export default ComponentSkeleton;
