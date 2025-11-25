// filepath: apps/web/src/components/lazy/LazyReports.tsx
// Lazy loaded Reports Section - Performance Sprint Day 3

import React, { Suspense } from 'react';

import { log } from '../../lib/browser-logger';
import { createChunkedLazyComponent } from '../../utils/dynamicImport';
import { ReportsSkeleton } from '../loading/ComponentSkeleton';

const reportsTabs = [
  { key: 'generator', label: '📊 Генератор', icon: '⚡' },
  { key: 'viewer', label: '👁️ Просмотр', icon: '🔍' },
  { key: 'exporter', label: '📤 Экспорт', icon: '💾' },
  { key: 'history', label: '📚 История', icon: '⏰' },
] as const;

type ReportsTabKey = (typeof reportsTabs)[number]['key'];

interface ReportConfig {
  type: string;
  range: string;
  filters?: Record<string, unknown>;
}

interface ReportEntry {
  id: number;
  name: string;
  date: string;
  status: string;
  size: string;
}

type ExportFormat = 'pdf' | 'excel' | 'csv' | 'json';

// Lazy load отчетов с разными типами
const ReportsGenerator = createChunkedLazyComponent(
  'PAGES',
  'reports-generator',
  () => Promise.resolve({ default: ReportsGeneratorComponent }),
  {
    retries: 3,
    timeout: 10000,
    preloadOnHover: true,
  },
);

const ReportsViewer = createChunkedLazyComponent(
  'PAGES',
  'reports-viewer',
  () => Promise.resolve({ default: ReportsViewerComponent }),
  {
    retries: 2,
    timeout: 8000,
  },
);

const ReportsExporter = createChunkedLazyComponent(
  'PAGES',
  'reports-exporter',
  () => Promise.resolve({ default: ReportsExporterComponent }),
  {
    retries: 2,
    timeout: 6000,
  },
);

const ReportsHistory = createChunkedLazyComponent(
  'PAGES',
  'reports-history',
  () => Promise.resolve({ default: ReportsHistoryComponent }),
  {
    retries: 2,
    timeout: 5000,
  },
);

interface LazyReportsProps {
  /** Режим отображения отчетов */
  mode?: 'generator' | 'viewer' | 'exporter' | 'history' | 'full';
  /** Данные отчетов */
  reportsData?: ReportEntry[];
  /** Фильтры для отчетов */
  filters?: Record<string, unknown>;
  /** Колбэк при генерации отчета */
  onGenerate?: (reportConfig: ReportConfig) => void;
  /** Колбэк при экспорте */
  onExport?: (format: ExportFormat, data?: ReportEntry[]) => void;
  /** Колбэк при ошибке */
  onError?: (error: Error) => void;
}

/**
 * Lazy loaded Reports компонент с модульной архитектурой
 */
export const LazyReports: React.FC<LazyReportsProps> = ({
  mode = 'full',
  reportsData,
  filters,
  onGenerate,
  onExport,
  onError,
}) => {
  const initialTab: ReportsTabKey = mode === 'full' ? 'generator' : mode;
  const [activeTab, setActiveTab] = React.useState<ReportsTabKey>(initialTab);
  const [preloadedComponents, setPreloadedComponents] = React.useState<Set<ReportsTabKey>>(
    new Set(),
  );

  // Error handling
  const handleComponentError = React.useCallback(
    (error: Error, componentName: string) => {
      log.error(`Lazy reports component failed: ${componentName}`, { error });
      onError?.(error);
    },
    [onError],
  );

  // Preload при переключении табов
  const handleTabHover = React.useCallback((tabName: ReportsTabKey) => {
    setPreloadedComponents((prev) => {
      if (prev.has(tabName)) {
        return prev;
      }

      const updated = new Set(prev);
      updated.add(tabName);
      log.info('Preloading reports component', { tabName });
      return updated;
    });
  }, []);

  // Single mode rendering
  if (mode !== 'full') {
    const renderSingleMode = () => {
      switch (mode) {
        case 'generator':
          return (
            <Suspense fallback={<ReportsSkeleton />}>
              <ReportsGenerator
                onGenerate={onGenerate}
                filters={filters}
                onError={(error: Error) => handleComponentError(error, 'Generator')}
              />
            </Suspense>
          );

        case 'viewer':
          return (
            <Suspense fallback={<ReportsSkeleton />}>
              <ReportsViewer
                data={reportsData}
                filters={filters}
                onError={(error: Error) => handleComponentError(error, 'Viewer')}
              />
            </Suspense>
          );

        case 'exporter':
          return (
            <Suspense fallback={<ReportsSkeleton />}>
              <ReportsExporter
                data={reportsData}
                onExport={onExport}
                onError={(error: Error) => handleComponentError(error, 'Exporter')}
              />
            </Suspense>
          );

        case 'history':
          return (
            <Suspense fallback={<ReportsSkeleton />}>
              <ReportsHistory onError={(error: Error) => handleComponentError(error, 'History')} />
            </Suspense>
          );

        default:
          return <div>Unknown reports mode: {mode}</div>;
      }
    };

    return <div className="lazy-reports-single">{renderSingleMode()}</div>;
  }

  // Full mode with tabs
  return (
    <div className="lazy-reports-full">
      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #e0e0e0',
          marginBottom: '20px',
          gap: '8px',
        }}
      >
        {reportsTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            onMouseEnter={() => handleTabHover(tab.key)}
            style={{
              padding: '12px 20px',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
              backgroundColor: activeTab === tab.key ? '#f8fafc' : 'transparent',
              color: activeTab === tab.key ? '#2563eb' : '#666',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {preloadedComponents.has(tab.key) && (
              <span style={{ fontSize: '10px', color: '#059669' }}>✓</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="reports-tab-content">
        {activeTab === 'generator' && (
          <Suspense fallback={<ReportsSkeleton />}>
            <ReportsGenerator
              onGenerate={onGenerate}
              filters={filters}
              onError={(error: Error) => handleComponentError(error, 'Generator')}
            />
          </Suspense>
        )}

        {activeTab === 'viewer' && (
          <Suspense fallback={<ReportsSkeleton />}>
            <ReportsViewer
              data={reportsData}
              filters={filters}
              onError={(error: Error) => handleComponentError(error, 'Viewer')}
            />
          </Suspense>
        )}

        {activeTab === 'exporter' && (
          <Suspense fallback={<ReportsSkeleton />}>
            <ReportsExporter
              data={reportsData}
              onExport={onExport}
              onError={(error: Error) => handleComponentError(error, 'Exporter')}
            />
          </Suspense>
        )}

        {activeTab === 'history' && (
          <Suspense fallback={<ReportsSkeleton />}>
            <ReportsHistory onError={(error: Error) => handleComponentError(error, 'History')} />
          </Suspense>
        )}
      </div>

      {/* Preload indicator */}
      {preloadedComponents.size > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            padding: '8px 12px',
            backgroundColor: '#059669',
            color: 'white',
            borderRadius: '4px',
            fontSize: '12px',
            zIndex: 1000,
          }}
        >
          🚀 Preloaded: {Array.from(preloadedComponents).join(', ')}
        </div>
      )}
    </div>
  );
};

// Компоненты-заглушки для демонстрации lazy loading
// В production это должны быть отдельные файлы

interface ReportsGeneratorProps {
  onGenerate?: (config: ReportConfig) => void;
  filters?: Record<string, unknown>;
  onError?: (error: Error) => void;
}

const ReportsGeneratorComponent: React.FC<ReportsGeneratorProps> = ({
  onGenerate,
  filters,
  onError,
}) => {
  const [reportType, setReportType] = React.useState('analytics');
  const [dateRange, setDateRange] = React.useState('week');
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleGenerate = React.useCallback(async () => {
    setIsGenerating(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Симуляция генерации
      const reportConfig = { type: reportType, range: dateRange, filters };
      onGenerate?.(reportConfig);
      log.info('Report generated', reportConfig);
    } catch (error) {
      if (error instanceof Error) {
        onError?.(error);
      } else {
        onError?.(new Error('Report generation failed'));
      }
    } finally {
      setIsGenerating(false);
    }
  }, [reportType, dateRange, filters, onGenerate, onError]);

  return (
    <div style={{ padding: '20px', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
      <h2>📊 Генератор отчетов</h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
            Тип отчета:
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
            }}
          >
            <option value="analytics">Analytics Report</option>
            <option value="performance">Performance Report</option>
            <option value="users">Users Report</option>
            <option value="revenue">Revenue Report</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
            Период:
          </label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
            }}
          >
            <option value="day">За день</option>
            <option value="week">За неделю</option>
            <option value="month">За месяц</option>
            <option value="quarter">За квартал</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        style={{
          padding: '12px 24px',
          backgroundColor: isGenerating ? '#9ca3af' : '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isGenerating ? 'not-allowed' : 'pointer',
          fontWeight: '500',
        }}
      >
        {isGenerating ? '⏳ Генерация...' : '🚀 Сгенерировать отчет'}
      </button>

      <div style={{ fontSize: '12px', color: '#666', marginTop: '16px' }}>
        Bundle: reports-generator.js | Filters: {JSON.stringify(filters ?? {})}
      </div>
    </div>
  );
};

interface ReportsViewerProps {
  data?: ReportEntry[];
  filters?: Record<string, unknown>;
  onError?: (error: Error) => void;
}

const ReportsViewerComponent: React.FC<ReportsViewerProps> = ({ data, filters, onError }) => {
  const [viewMode, setViewMode] = React.useState<'table' | 'cards'>('table');

  const fallbackData: ReportEntry[] = React.useMemo(
    () => [
      {
        id: 1,
        name: 'Performance Report',
        date: '2025-09-04',
        status: 'Completed',
        size: '2.3MB',
      },
      {
        id: 2,
        name: 'Analytics Report',
        date: '2025-09-03',
        status: 'In Progress',
        size: '1.8MB',
      },
      {
        id: 3,
        name: 'Users Report',
        date: '2025-09-02',
        status: 'Completed',
        size: '945KB',
      },
    ],
    [],
  );

  const sampleData = data ?? fallbackData;

  React.useEffect(() => {
    if (data && data.length === 0) {
      onError?.(new Error('Нет данных для отображения отчетов'));
    }
  }, [data, onError]);

  return (
    <div style={{ padding: '20px', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <h2>👁️ Просмотр отчетов</h2>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setViewMode('table')}
            style={{
              padding: '6px 12px',
              backgroundColor: viewMode === 'table' ? '#2563eb' : 'transparent',
              color: viewMode === 'table' ? 'white' : '#666',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            📊 Таблица
          </button>
          <button
            onClick={() => setViewMode('cards')}
            style={{
              padding: '6px 12px',
              backgroundColor: viewMode === 'cards' ? '#2563eb' : 'transparent',
              color: viewMode === 'cards' ? 'white' : '#666',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            🗃️ Карточки
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                <th style={{ padding: '12px 8px', textAlign: 'left' }}>ID</th>
                <th style={{ padding: '12px 8px', textAlign: 'left' }}>Название</th>
                <th style={{ padding: '12px 8px', textAlign: 'left' }}>Дата</th>
                <th style={{ padding: '12px 8px', textAlign: 'left' }}>Статус</th>
                <th style={{ padding: '12px 8px', textAlign: 'left' }}>Размер</th>
                <th style={{ padding: '12px 8px', textAlign: 'left' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {sampleData.map((report) => (
                <tr key={report.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '12px 8px' }}>{report.id}</td>
                  <td style={{ padding: '12px 8px' }}>{report.name}</td>
                  <td style={{ padding: '12px 8px' }}>{report.date}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        backgroundColor: report.status === 'Completed' ? '#dcfdf7' : '#fef3c7',
                        color: report.status === 'Completed' ? '#059669' : '#d97706',
                      }}
                    >
                      {report.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px' }}>{report.size}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <button
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      📥 Скачать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '16px',
          }}
        >
          {sampleData.map((report) => (
            <div
              key={report.id}
              style={{
                padding: '16px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                backgroundColor: '#f8f9fa',
              }}
            >
              <h4>{report.name}</h4>
              <p style={{ color: '#666', marginBottom: '8px' }}>Дата: {report.date}</p>
              <p style={{ color: '#666', marginBottom: '8px' }}>Размер: {report.size}</p>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    backgroundColor: report.status === 'Completed' ? '#dcfdf7' : '#fef3c7',
                    color: report.status === 'Completed' ? '#059669' : '#d97706',
                  }}
                >
                  {report.status}
                </span>
                <button
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  📥 Скачать
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: '12px', color: '#666', marginTop: '16px' }}>
        Bundle: reports-viewer.js | Active filters: {Object.keys(filters ?? {}).length}
      </div>
    </div>
  );
};

interface ReportsExporterProps {
  data?: ReportEntry[];
  onExport?: (format: ExportFormat, data?: ReportEntry[]) => void;
  onError?: (error: Error) => void;
}

const ReportsExporterComponent: React.FC<ReportsExporterProps> = ({ data, onExport, onError }) => {
  const [exportFormat, setExportFormat] = React.useState<ExportFormat>('pdf');
  const [isExporting, setIsExporting] = React.useState(false);

  const exportFormats: ExportFormat[] = React.useMemo(
    () => ['pdf', 'excel', 'csv', 'json'],
    [],
  );

  const handleExport = React.useCallback(async () => {
    setIsExporting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Симуляция экспорта
      onExport?.(exportFormat, data);
      log.info(`Report exported as ${exportFormat.toUpperCase()}`, { format: exportFormat, data });
    } catch (error) {
      if (error instanceof Error) {
        onError?.(error);
      } else {
        onError?.(new Error('Report export failed'));
      }
    } finally {
      setIsExporting(false);
    }
  }, [exportFormat, data, onExport, onError]);

  return (
    <div style={{ padding: '20px', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
      <h2>📤 Экспорт отчетов</h2>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
          Формат экспорта:
        </label>
        <div style={{ display: 'flex', gap: '12px' }}>
          {exportFormats.map((format) => (
            <label key={format} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="radio"
                value={format}
                checked={exportFormat === format}
                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              />
              <span style={{ textTransform: 'uppercase' }}>{format}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={handleExport}
        disabled={isExporting}
        style={{
          padding: '12px 24px',
          backgroundColor: isExporting ? '#9ca3af' : '#059669',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isExporting ? 'not-allowed' : 'pointer',
          fontWeight: '500',
        }}
      >
        {isExporting ? '⏳ Экспорт...' : `📤 Экспорт в ${exportFormat.toUpperCase()}`}
      </button>

      <div style={{ fontSize: '12px', color: '#666', marginTop: '16px' }}>
        Bundle: reports-exporter.js | Data size: {JSON.stringify(data ?? []).length} bytes
      </div>
    </div>
  );
};

interface ReportsHistoryProps {
  onError?: (error: Error) => void;
}

interface ReportHistoryEntry {
  id: number;
  action: string;
  user: string;
  timestamp: string;
  status: 'success' | 'error';
}

const ReportsHistoryComponent: React.FC<ReportsHistoryProps> = ({ onError }) => {
  const historyData = React.useMemo<ReportHistoryEntry[]>(
    () => [
      {
        id: 1,
        action: 'Generated Analytics Report',
        user: 'admin',
        timestamp: '2025-09-04 10:30:00',
        status: 'success',
      },
      {
        id: 2,
        action: 'Exported Performance Report',
        user: 'manager',
        timestamp: '2025-09-04 09:15:00',
        status: 'success',
      },
      {
        id: 3,
        action: 'Failed to generate Users Report',
        user: 'analyst',
        timestamp: '2025-09-04 08:45:00',
        status: 'error',
      },
      {
        id: 4,
        action: 'Generated Revenue Report',
        user: 'admin',
        timestamp: '2025-09-03 16:20:00',
        status: 'success',
      },
    ],
    [],
  );

  React.useEffect(() => {
    if (historyData.length === 0) {
      onError?.(new Error('История отчетов пуста'));
    }
  }, [historyData, onError]);

  return (
    <div style={{ padding: '20px', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
      <h2>📚 История отчетов</h2>

      <div style={{ marginBottom: '20px' }}>
        {historyData.map((item) => (
          <div
            key={item.id}
            style={{
              padding: '12px',
              border: '1px solid #f0f0f0',
              borderRadius: '4px',
              marginBottom: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: '500', marginBottom: '4px' }}>{item.action}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                {`${item.user} • ${item.timestamp}`}
              </div>
            </div>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '12px',
                backgroundColor: item.status === 'success' ? '#dcfdf7' : '#fef2f2',
                color: item.status === 'success' ? '#059669' : '#dc2626',
              }}
            >
              {item.status === 'success' ? '✅ Success' : '❌ Error'}
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '12px', color: '#666' }}>
        Bundle: reports-history.js | History entries: {historyData.length}
      </div>
    </div>
  );
};

// Экспорт компонентов для testing
export {
  ReportsExporterComponent,
  ReportsGeneratorComponent,
  ReportsHistoryComponent,
  ReportsViewerComponent,
};
