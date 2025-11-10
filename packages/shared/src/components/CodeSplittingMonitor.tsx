// filepath: packages/shared/src/components/CodeSplittingMonitor.tsx

/**
 * React компонент для мониторинга и визуализации code splitting
 * Предоставляет интерфейс для анализа и отслеживания разделения кода
 */

import type { FC } from 'react';
import { useMemo, useState } from 'react';

// Типы для компонента
export interface CodeSplittingStats {
  totalFiles: number;
  totalSize: number;
  splitOpportunities: Array<{
    file: string;
    type: 'route' | 'component' | 'vendor' | 'dynamic';
    reason: string;
    priority: 'high' | 'medium' | 'low';
    size: number;
    sizeKB: number;
  }>;
  summary: {
    byType: Record<string, number>;
    byPriority: Record<string, number>;
    totalOpportunities: number;
    potentialSavings: {
      bytes: number;
      kb: number;
      percent: number;
    };
  };
}

export interface CodeSplittingMonitorProps {
  /** Данные анализа code splitting */
  analysisData?: CodeSplittingStats | null;
  /** Callback для запуска анализа */
  onRunAnalysis?: () => Promise<CodeSplittingStats>;
  /** Показывать ли детальную информацию */
  showDetails?: boolean;
  /** CSS класс для стилизации */
  className?: string;
  /** Заголовок компонента */
  title?: string;
}

/**
 * Основной компонент мониторинга Code Splitting
 */
export const CodeSplittingMonitor: FC<CodeSplittingMonitorProps> = ({
  analysisData,
  onRunAnalysis,
  showDetails = true,
  className = '',
  title = 'Code Splitting Analysis',
}) => {
  const [data, setData] = useState<CodeSplittingStats | null>(analysisData || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Запуск анализа
  const handleRunAnalysis = async () => {
    if (!onRunAnalysis) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await onRunAnalysis();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка анализа');
    } finally {
      setIsLoading(false);
    }
  };

  // Фильтрация возможностей по типу
  const filteredOpportunities = useMemo(() => {
    if (!data || !selectedType) return data?.splitOpportunities || [];
    return data.splitOpportunities.filter((op) => op.type === selectedType);
  }, [data, selectedType]);

  // Статистика по приоритетам
  const priorityStats = useMemo(() => {
    if (!data) return { high: 0, medium: 0, low: 0 };

    return data.splitOpportunities.reduce(
      (acc, op) => {
        acc[op.priority]++;
        return acc;
      },
      { high: 0, medium: 0, low: 0 },
    );
  }, [data]);

  // Цвета для типов
  const getTypeColor = (type: string): string => {
    const colors = {
      route: '#4CAF50',
      component: '#2196F3',
      vendor: '#FF9800',
      dynamic: '#9C27B0',
    };
    return colors[type as keyof typeof colors] || '#757575';
  };

  // Эмодзи для типов
  const getTypeEmoji = (type: string): string => {
    const emojis = {
      route: '🛣️',
      component: '🧩',
      vendor: '📦',
      dynamic: '⚡',
    };
    return emojis[type as keyof typeof emojis] || '📁';
  };

  // Цвет для приоритета
  const getPriorityColor = (priority: string): string => {
    const colors = {
      high: '#f44336',
      medium: '#ff9800',
      low: '#4caf50',
    };
    return colors[priority as keyof typeof colors] || '#757575';
  };

  return (
    <div className={`code-splitting-monitor ${className}`} style={{ fontFamily: 'sans-serif' }}>
      {/* Заголовок */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '2px solid #e0e0e0',
          paddingBottom: '10px',
        }}
      >
        <h2 style={{ margin: 0, color: '#333' }}>🚀 {title}</h2>
        {onRunAnalysis && (
          <button
            onClick={handleRunAnalysis}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              backgroundColor: isLoading ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
            }}
          >
            {isLoading ? 'Анализируем...' : 'Запустить анализ'}
          </button>
        )}
      </div>

      {/* Загрузка */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
          <div>Анализируем возможности code splitting...</div>
        </div>
      )}

      {/* Ошибка */}
      {error && (
        <div
          style={{
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '4px',
            padding: '12px',
            color: '#c62828',
            marginBottom: '20px',
          }}
        >
          <strong>❌ Ошибка:</strong> {error}
        </div>
      )}

      {/* Основные данные */}
      {data && !isLoading && (
        <>
          {/* Общая статистика */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                backgroundColor: '#f5f5f5',
                padding: '16px',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>
                {data.totalFiles}
              </div>
              <div style={{ color: '#666', fontSize: '14px' }}>Файлов проанализировано</div>
            </div>

            <div
              style={{
                backgroundColor: '#f5f5f5',
                padding: '16px',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>
                {Math.round(data.totalSize / 1024)} KB
              </div>
              <div style={{ color: '#666', fontSize: '14px' }}>Общий размер</div>
            </div>

            <div
              style={{
                backgroundColor: '#f5f5f5',
                padding: '16px',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>
                {data.summary.totalOpportunities}
              </div>
              <div style={{ color: '#666', fontSize: '14px' }}>Возможностей разделения</div>
            </div>

            <div
              style={{
                backgroundColor: '#e8f5e8',
                padding: '16px',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2e7d32' }}>
                {data.summary.potentialSavings.percent}%
              </div>
              <div style={{ color: '#2e7d32', fontSize: '14px' }}>Потенциальная экономия</div>
            </div>
          </div>

          {/* Статистика по типам */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ marginBottom: '12px', color: '#333' }}>📊 Разделение по типам</h3>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '16px',
              }}
            >
              <button
                onClick={() => setSelectedType(null)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: selectedType === null ? '#2196F3' : '#f5f5f5',
                  color: selectedType === null ? 'white' : '#333',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Все ({data.summary.totalOpportunities})
              </button>
              {Object.entries(data.summary.byType).map(([type, count]) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: selectedType === type ? getTypeColor(type) : '#f5f5f5',
                    color: selectedType === type ? 'white' : '#333',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {getTypeEmoji(type)} {type} ({count})
                </button>
              ))}
            </div>
          </div>

          {/* Приоритеты */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ marginBottom: '12px', color: '#333' }}>🎯 Приоритеты</h3>
            <div style={{ display: 'flex', gap: '16px' }}>
              {Object.entries(priorityStats).map(([priority, count]) => (
                <div
                  key={priority}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '4px',
                    border: `2px solid ${getPriorityColor(priority)}20`,
                  }}
                >
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: getPriorityColor(priority),
                    }}
                  />
                  <span style={{ fontSize: '14px', textTransform: 'capitalize' }}>
                    {priority}: {count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Детальный список */}
          {showDetails && (
            <div>
              <h3 style={{ marginBottom: '12px', color: '#333' }}>
                📋 Детальный анализ
                {selectedType && ` (${selectedType})`}
              </h3>
              <div
                style={{
                  maxHeight: '400px',
                  overflowY: 'auto',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                }}
              >
                {filteredOpportunities.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                    Нет данных для отображения
                  </div>
                ) : (
                  filteredOpportunities.map((opportunity, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '12px',
                        borderBottom:
                          index < filteredOpportunities.length - 1 ? '1px solid #f0f0f0' : 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '4px',
                          }}
                        >
                          <span style={{ fontSize: '16px' }}>{getTypeEmoji(opportunity.type)}</span>
                          <span
                            style={{
                              fontWeight: 'bold',
                              fontSize: '14px',
                              color: '#333',
                            }}
                          >
                            {opportunity.file}
                          </span>
                          <span
                            style={{
                              padding: '2px 6px',
                              backgroundColor: getPriorityColor(opportunity.priority),
                              color: 'white',
                              borderRadius: '10px',
                              fontSize: '10px',
                              textTransform: 'uppercase',
                            }}
                          >
                            {opportunity.priority}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#666',
                            marginBottom: '2px',
                          }}
                        >
                          {opportunity.reason}
                        </div>
                      </div>
                      <div
                        style={{
                          textAlign: 'right',
                          fontSize: '12px',
                          color: '#333',
                          fontWeight: 'bold',
                        }}
                      >
                        {opportunity.sizeKB} KB
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Рекомендации */}
          {data.summary.totalOpportunities > 0 && (
            <div
              style={{
                marginTop: '24px',
                padding: '16px',
                backgroundColor: '#e3f2fd',
                borderRadius: '8px',
                border: '1px solid #2196F3',
              }}
            >
              <h3
                style={{
                  margin: '0 0 12px 0',
                  color: '#1976d2',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                💡 Рекомендации
              </h3>
              <div style={{ fontSize: '14px', lineHeight: '1.5' }}>
                {(data.summary.byType.route ?? 0) > 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>🛣️ Route-based splitting:</strong> Используйте React.lazy() для{' '}
                    {data.summary.byType.route} страниц
                  </div>
                )}
                {(data.summary.byType.component ?? 0) > 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>🧩 Component splitting:</strong> Разделите{' '}
                    {data.summary.byType.component} больших компонентов
                  </div>
                )}
                {(data.summary.byType.vendor ?? 0) > 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>📦 Vendor splitting:</strong> Настройте manualChunks для внешних
                    библиотек
                  </div>
                )}
                {(data.summary.byType.dynamic ?? 0) > 0 && (
                  <div>
                    <strong>⚡ Dynamic imports:</strong> Реализуйте условную загрузку для{' '}
                    {data.summary.byType.dynamic} компонентов
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Пустое состояние */}
      {!data && !isLoading && !error && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#666',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <h3 style={{ margin: '0 0 8px 0' }}>Анализ code splitting</h3>
          <p style={{ margin: '0', fontSize: '14px' }}>
            Запустите анализ для получения рекомендаций по оптимизации
          </p>
        </div>
      )}
    </div>
  );
};

export default CodeSplittingMonitor;
