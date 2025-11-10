// filepath: packages/shared/src/components/PerformanceMonitor.tsx

import type { FC } from 'react';
import { useEffect, useState } from 'react';

import { getGlobalLogger } from '../monitoring/structured-logger';
import type { BundleAnalyzer } from '../performance/BundleAnalyzer';
import { BaselineMetrics, bundleAnalyzer, BundleMetrics } from '../performance/BundleAnalyzer';

type BundleReport = ReturnType<BundleAnalyzer['generateReport']>;
type BundleComparison = BundleReport['comparison'];

/**
 * PerformanceMonitor - React компонент для отображения метрик производительности
 * Показывает текущие метрики, сравнение с baseline и рекомендации
 */

interface PerformanceMonitorProps {
  showDetailed?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const performanceLogger = getGlobalLogger().child({ component: 'PerformanceMonitor' });

export const PerformanceMonitor: FC<PerformanceMonitorProps> = ({
  showDetailed = false,
  autoRefresh = false,
  refreshInterval = 30000, // 30 секунд
}) => {
  const [metrics, setMetrics] = useState<BundleMetrics | null>(null);
  const [baseline, setBaseline] = useState<BaselineMetrics | null>(null);
  const [comparison, setComparison] = useState<BundleComparison>(null);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Загружаем данные при монтировании
  useEffect(() => {
    loadPerformanceData();
    bundleAnalyzer.loadFromStorage();
  }, []);

  // Автообновление данных
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadPerformanceData();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  /**
   * Загружает данные о производительности
   */
  const loadPerformanceData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Измеряем текущие метрики
      const currentMetrics = await bundleAnalyzer.measureCurrentMetrics();

      // Генерируем отчет
      const report = bundleAnalyzer.generateReport();

      setMetrics(currentMetrics);
      setBaseline(report.baseline);
      setComparison(report.comparison);
      setRecommendations(report.recommendations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки данных');
      performanceLogger.error('Failed to load performance metrics', {
        metadata: { error: err instanceof Error ? err : String(err) },
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Сохраняет текущие метрики как новый baseline
   */
  const saveAsBaseline = () => {
    try {
      const version = prompt('Введите версию для baseline (например, v1.2.3):');
      if (!version) return;

      const lighthouseScore = parseFloat(prompt('Введите Lighthouse Score (0-100):') || '0');

      if (lighthouseScore < 0 || lighthouseScore > 100) {
        alert('Lighthouse Score должен быть от 0 до 100');
        return;
      }

      bundleAnalyzer.saveBaseline(version, lighthouseScore);
      loadPerformanceData(); // Обновляем данные
    } catch (err) {
      setError('Ошибка при сохранении baseline');
      performanceLogger.error('Failed to save baseline metrics', {
        metadata: { error: err instanceof Error ? err : String(err) },
      });
    }
  };

  /**
   * Форматирует байты в человеко-читаемый формат
   */
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  /**
   * Форматирует время в миллисекундах
   */
  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  /**
   * Получает цвет для метрики на основе значения
   */
  const getMetricColor = (value: number, thresholds: { good: number; poor: number }): string => {
    if (value <= thresholds.good) return '#4CAF50'; // Зеленый
    if (value <= thresholds.poor) return '#FF9800'; // Оранжевый
    return '#F44336'; // Красный
  };

  if (isLoading) {
    return (
      <div className="performance-monitor loading">
        <div className="loading-spinner"></div>
        <p>Анализ производительности...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="performance-monitor error">
        <h3>❌ Ошибка</h3>
        <p>{error}</p>
        <button onClick={loadPerformanceData}>Попробовать снова</button>
      </div>
    );
  }

  return (
    <div className="performance-monitor">
      <div className="performance-header">
        <h3>📊 Мониторинг производительности</h3>
        <div className="performance-actions">
          <button onClick={loadPerformanceData} className="refresh-btn">
            🔄 Обновить
          </button>
          <button onClick={saveAsBaseline} className="baseline-btn">
            📌 Сохранить baseline
          </button>
        </div>
      </div>

      {/* Основные метрики */}
      <div className="metrics-grid">
        {metrics && (
          <>
            <div className="metric-card">
              <h4>📦 Размер bundle</h4>
              <div
                className="metric-value"
                style={{
                  color: getMetricColor(metrics.totalSize, { good: 250000, poor: 500000 }),
                }}
              >
                {formatBytes(metrics.totalSize)}
              </div>
              <div className="metric-secondary">Gzip: {formatBytes(metrics.gzippedSize)}</div>
            </div>

            <div className="metric-card">
              <h4>⚡ First Contentful Paint</h4>
              <div
                className="metric-value"
                style={{
                  color: getMetricColor(metrics.firstContentfulPaint, { good: 1800, poor: 3000 }),
                }}
              >
                {formatTime(metrics.firstContentfulPaint)}
              </div>
            </div>

            <div className="metric-card">
              <h4>🎯 Largest Contentful Paint</h4>
              <div
                className="metric-value"
                style={{
                  color: getMetricColor(metrics.largestContentfulPaint, { good: 2500, poor: 4000 }),
                }}
              >
                {formatTime(metrics.largestContentfulPaint)}
              </div>
            </div>

            <div className="metric-card">
              <h4>⏱️ Time to Interactive</h4>
              <div
                className="metric-value"
                style={{
                  color: getMetricColor(metrics.timeToInteractive, { good: 3800, poor: 7300 }),
                }}
              >
                {formatTime(metrics.timeToInteractive)}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Сравнение с baseline */}
      {comparison && baseline && (
        <div className="comparison-section">
          <h4>📈 Сравнение с baseline (v{baseline.version})</h4>
          <div className="comparison-summary">
            <div
              className={`improvement-badge ${comparison.improvement ? 'positive' : 'negative'}`}
            >
              {comparison.improvement ? '✅ Улучшение' : '⚠️ Ухудшение'}
            </div>
            <pre className="comparison-details">{comparison.summary}</pre>
          </div>
        </div>
      )}

      {/* Рекомендации */}
      {recommendations.length > 0 && (
        <div className="recommendations-section">
          <h4>💡 Рекомендации по оптимизации</h4>
          <ul className="recommendations-list">
            {recommendations.map((rec, index) => (
              <li key={index} className="recommendation-item">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Детальная информация */}
      {showDetailed && metrics && (
        <div className="detailed-section">
          <h4>🔍 Детальная информация</h4>

          <div className="chunk-sizes">
            <h5>Размеры чанков:</h5>
            <div className="chunk-list">
              {Object.entries(metrics.chunkSizes).map(([name, size]) => (
                <div key={name} className="chunk-item">
                  <span className="chunk-name">{name}</span>
                  <span className="chunk-size">{formatBytes(size)}</span>
                </div>
              ))}
            </div>
          </div>

          {baseline && (
            <div className="baseline-info">
              <h5>Последний baseline:</h5>
              <div className="baseline-details">
                <p>
                  <strong>Версия:</strong> {baseline.version}
                </p>
                <p>
                  <strong>Дата:</strong> {new Date(baseline.timestamp).toLocaleDateString()}
                </p>
                <p>
                  <strong>Lighthouse Score:</strong> {baseline.lighthouseScore}
                </p>
                <p>
                  <strong>Оценка:</strong> {baseline.performanceGrade}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .performance-monitor {
          padding: 20px;
          border-radius: 8px;
          background: #f8f9fa;
          border: 1px solid #e9ecef;
        }

        .performance-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .performance-actions {
          display: flex;
          gap: 10px;
        }

        .refresh-btn, .baseline-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .refresh-btn {
          background: #007bff;
          color: white;
        }

        .baseline-btn {
          background: #28a745;
          color: white;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .metric-card {
          background: white;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #dee2e6;
          text-align: center;
        }

        .metric-card h4 {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: #6c757d;
        }

        .metric-value {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 4px;
        }

        .metric-secondary {
          font-size: 12px;
          color: #6c757d;
        }

        .comparison-section {
          background: white;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #dee2e6;
          margin-bottom: 20px;
        }

        .improvement-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 12px;
        }

        .improvement-badge.positive {
          background: #d4edda;
          color: #155724;
        }

        .improvement-badge.negative {
          background: #f8d7da;
          color: #721c24;
        }

        .comparison-details {
          background: #f8f9fa;
          padding: 12px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
          white-space: pre-line;
        }

        .recommendations-section {
          background: white;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #dee2e6;
          margin-bottom: 20px;
        }

        .recommendations-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .recommendation-item {
          padding: 8px 0;
          border-bottom: 1px solid #f0f0f0;
        }

        .recommendation-item:last-child {
          border-bottom: none;
        }

        .detailed-section {
          background: white;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #dee2e6;
        }

        .chunk-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .chunk-item {
          display: flex;
          justify-content: space-between;
          padding: 8px;
          background: #f8f9fa;
          border-radius: 4px;
        }

        .chunk-name {
          font-family: monospace;
          font-size: 12px;
        }

        .chunk-size {
          font-weight: bold;
          color: #007bff;
        }

        .baseline-details {
          background: #f8f9fa;
          padding: 12px;
          border-radius: 4px;
          margin-top: 8px;
        }

        .loading {
          text-align: center;
          padding: 40px;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .error {
          text-align: center;
          padding: 40px;
          color: #721c24;
          background: #f8d7da;
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
};

export default PerformanceMonitor;
