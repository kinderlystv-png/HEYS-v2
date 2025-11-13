// filepath: apps/web/src/components/lazy/LazyAnalytics.tsx
// Lazy loaded Analytics Dashboard - Performance Sprint Day 3

import React, { Suspense } from 'react';

import { createChunkedLazyComponent } from '../../utils/dynamicImport';
import { AnalyticsSkeleton } from '../loading/ComponentSkeleton';
import { log } from '../../lib/browser-logger';

// Lazy load основного компонента аналитики
const AnalyticsDashboard = createChunkedLazyComponent(
  'ANALYTICS',
  'dashboard',
  () => Promise.resolve({ default: AnalyticsDashboardComponent }),
  {
    retries: 2,
    timeout: 8000,
    preloadOnHover: true,
  },
);

// Lazy load графиков
const AnalyticsCharts = createChunkedLazyComponent(
  'ANALYTICS',
  'charts',
  () => Promise.resolve({ default: AnalyticsChartsComponent }),
  {
    retries: 2,
    timeout: 5000,
  },
);

// Lazy load таблицы данных
const AnalyticsDataTable = createChunkedLazyComponent(
  'ANALYTICS',
  'data-table',
  () => Promise.resolve({ default: AnalyticsDataTableComponent }),
  {
    retries: 2,
    timeout: 5000,
  },
);

interface LazyAnalyticsProps {
  /** Тип отображения аналитики */
  view?: 'dashboard' | 'charts' | 'table' | 'full';
  /** Данные для отображения */
  data?: unknown;
  /** Колбэк при ошибке загрузки */
  onError?: (error: Error) => void;
}

/**
 * Lazy loaded Analytics компонент с прогрессивной загрузкой
 */
export const LazyAnalytics: React.FC<LazyAnalyticsProps> = ({ view = 'full', data, onError }) => {
  const [loadingComponent, setLoadingComponent] = React.useState<string | null>(null);

  // Error boundary для lazy компонентов
  const handleError = React.useCallback(
    (error: Error, componentName: string) => {
      log.error(`Lazy analytics component failed: ${componentName}`, { error });
      setLoadingComponent(null);
      onError?.(error);
    },
    [onError],
  );

  // Preload компонентов при hover
  const handlePreload = React.useCallback((componentName: string) => {
    setLoadingComponent(componentName);

    // Преждевременная загрузка при наведении
    setTimeout(() => {
      setLoadingComponent(null);
    }, 2000);
  }, []);

  if (view === 'dashboard') {
    return (
      <Suspense fallback={<AnalyticsSkeleton />}>
        <div onMouseEnter={() => handlePreload('dashboard')}>
          <AnalyticsDashboard
            data={data}
            onError={(error: Error) => handleError(error, 'AnalyticsDashboard')}
          />
        </div>
      </Suspense>
    );
  }

  if (view === 'charts') {
    return (
      <Suspense fallback={<AnalyticsSkeleton />}>
        <div onMouseEnter={() => handlePreload('charts')}>
          <AnalyticsCharts
            data={data}
            onError={(error: Error) => handleError(error, 'AnalyticsCharts')}
          />
        </div>
      </Suspense>
    );
  }

  if (view === 'table') {
    return (
      <Suspense fallback={<AnalyticsSkeleton />}>
        <div onMouseEnter={() => handlePreload('table')}>
          <AnalyticsDataTable
            data={data}
            onError={(error: Error) => handleError(error, 'AnalyticsDataTable')}
          />
        </div>
      </Suspense>
    );
  }

  // Full view - загружаем компоненты прогрессивно
  return (
    <div>
      {/* Dashboard компонент загружается первым */}
      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsDashboard
          data={data}
          onError={(error: Error) => handleError(error, 'AnalyticsDashboard')}
        />
      </Suspense>

      {/* Charts загружаются после dashboard */}
      <Suspense
        fallback={<div style={{ padding: '20px', textAlign: 'center' }}>Загрузка графиков...</div>}
      >
        <AnalyticsCharts
          data={data}
          onError={(error: Error) => handleError(error, 'AnalyticsCharts')}
        />
      </Suspense>

      {/* Data table загружается последним */}
      <Suspense
        fallback={
          <div style={{ padding: '20px', textAlign: 'center' }}>Загрузка таблицы данных...</div>
        }
      >
        <AnalyticsDataTable
          data={data}
          onError={(error: Error) => handleError(error, 'AnalyticsDataTable')}
        />
      </Suspense>

      {/* Индикатор загрузки */}
      {loadingComponent && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '8px 16px',
            backgroundColor: '#2563eb',
            color: 'white',
            borderRadius: '4px',
            fontSize: '12px',
            zIndex: 1000,
          }}
        >
          Предзагрузка {loadingComponent}...
        </div>
      )}
    </div>
  );
};

// Заглушки для компонентов (будут заменены реальными)
// Эти компоненты должны быть в отдельных файлах для оптимального splitting

const AnalyticsDashboardComponent: React.FC<Record<string, unknown>> = ({ data, onError }) => {
  React.useEffect(() => {
    // Симуляция возможной ошибки
    if (Math.random() < 0.01 && onError) {
      onError(new Error('Random analytics error'));
    }
  }, [onError]);

  return (
    <div
      style={{
        padding: '20px',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        marginBottom: '20px',
      }}
    >
      <h2>📊 Analytics Dashboard</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <div style={{ padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563eb' }}>1,234</div>
          <div style={{ fontSize: '14px', color: '#666' }}>Total Users</div>
        </div>
        <div style={{ padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>98.5%</div>
          <div style={{ fontSize: '14px', color: '#666' }}>Uptime</div>
        </div>
        <div style={{ padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626' }}>2.3s</div>
          <div style={{ fontSize: '14px', color: '#666' }}>Avg Response</div>
        </div>
      </div>
      {data && (
        <pre style={{ marginTop: '16px', fontSize: '12px' }}>
          {JSON.stringify(data, null, 2).slice(0, 200)}...
        </pre>
      )}
    </div>
  );
};

const AnalyticsChartsComponent: React.FC<Record<string, unknown>> = ({ data }) => {
  return (
    <div
      style={{
        padding: '20px',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        marginBottom: '20px',
      }}
    >
      <h3>📈 Performance Charts</h3>
      <div
        style={{
          height: '300px',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center', color: '#666' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>📊</div>
          <div>Charts component loaded</div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>Bundle: analytics-charts.js</div>
          {data && (
            <div style={{ fontSize: '10px', marginTop: '4px' }}>
              Data: {JSON.stringify(data).slice(0, 50)}...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AnalyticsDataTableComponent: React.FC<Record<string, unknown>> = ({ data }) => {
  return (
    <div style={{ padding: '20px', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
      <h3>📋 Data Table</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
              <th style={{ padding: '8px', textAlign: 'left' }}>ID</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Name</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Value</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }, (_, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '8px' }}>{i + 1}</td>
                <td style={{ padding: '8px' }}>Item {i + 1}</td>
                <td style={{ padding: '8px' }}>{Math.round(Math.random() * 1000)}</td>
                <td style={{ padding: '8px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      backgroundColor: i % 2 ? '#dcfdf7' : '#fef3c7',
                      color: i % 2 ? '#059669' : '#d97706',
                    }}
                  >
                    {i % 2 ? 'Active' : 'Pending'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
        Bundle: analytics-data-table.js {data && `(${Object.keys(data).length} data keys)`}
      </div>
    </div>
  );
};

// Экспорт компонентов для создания отдельных файлов
export { AnalyticsChartsComponent, AnalyticsDashboardComponent, AnalyticsDataTableComponent };
