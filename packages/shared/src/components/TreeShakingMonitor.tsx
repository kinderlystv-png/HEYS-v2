// filepath: packages/shared/src/components/TreeShakingMonitor.tsx

/**
 * Компонент для мониторинга и визуализации tree shaking анализа
 * Показывает неиспользуемые экспорты и рекомендации по оптимизации
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TreeShaker } from '../performance/TreeShaker';
import type { TreeShakingAnalysis, UnusedExport } from '../performance/TreeShaker';

interface TreeShakingMonitorProps {
  /** Путь к проекту для анализа */
  projectPath?: string;
  /** Автоматический запуск анализа при монтировании */
  autoAnalyze?: boolean;
  /** Интервал автообновления в секундах */
  refreshInterval?: number;
  /** Callback при завершении анализа */
  onAnalysisComplete?: (analysis: TreeShakingAnalysis) => void;
  /** Максимальное количество отображаемых экспортов */
  maxDisplayItems?: number;
  /** Показывать ли детальную информацию */
  showDetails?: boolean;
}

interface AnalysisStats {
  totalFiles: number;
  totalExports: number;
  unusedExports: number;
  unusedPercentage: number;
  potentialSavings: number;
}

export const TreeShakingMonitor: React.FC<TreeShakingMonitorProps> = ({
  projectPath = process.cwd(),
  autoAnalyze = false,
  refreshInterval = 0,
  onAnalysisComplete,
  maxDisplayItems = 20,
  showDetails = true,
}) => {
  const [analysis, setAnalysis] = useState<TreeShakingAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAnalysisTime, setLastAnalysisTime] = useState<Date | null>(null);
  const [treeShaker] = useState(() => new TreeShaker());

  /**
   * Выполняет анализ tree shaking
   */
  const performAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      console.log('🌲 Запуск анализа tree shaking для:', projectPath);
      const result = await treeShaker.analyzeProject(projectPath);
      
      setAnalysis(result);
      setLastAnalysisTime(new Date());
      
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(`Ошибка анализа: ${errorMessage}`);
      console.error('Ошибка tree shaking анализа:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [projectPath, treeShaker, onAnalysisComplete]);

  /**
   * Автоматический анализ при монтировании
   */
  useEffect(() => {
    if (autoAnalyze) {
      performAnalysis();
    }
  }, [autoAnalyze, performAnalysis]);

  /**
   * Автообновление анализа
   */
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        if (!isAnalyzing) {
          performAnalysis();
        }
      }, refreshInterval * 1000);

      return () => clearInterval(interval);
    }
  }, [refreshInterval, isAnalyzing, performAnalysis]);

  /**
   * Вычисляет статистику анализа
   */
  const getAnalysisStats = useCallback((): AnalysisStats => {
    if (!analysis) {
      return {
        totalFiles: 0,
        totalExports: 0,
        unusedExports: 0,
        unusedPercentage: 0,
        potentialSavings: 0,
      };
    }

    const totalExports = analysis.unusedExports.length + (analysis.totalFiles * 2); // Примерная оценка
    const unusedPercentage = totalExports > 0 ? (analysis.unusedExports.length / totalExports) * 100 : 0;

    return {
      totalFiles: analysis.totalFiles,
      totalExports,
      unusedExports: analysis.unusedExports.length,
      unusedPercentage,
      potentialSavings: analysis.potentialSavings,
    };
  }, [analysis]);

  /**
   * Группирует неиспользуемые экспорты по файлам
   */
  const getExportsByFile = useCallback(() => {
    if (!analysis) return new Map();

    const byFile = new Map<string, UnusedExport[]>();
    
    analysis.unusedExports.forEach(exp => {
      const fileName = exp.file.split('/').pop() || exp.file;
      if (!byFile.has(fileName)) {
        byFile.set(fileName, []);
      }
      byFile.get(fileName)!.push(exp);
    });

    // Сортируем по количеству неиспользуемых экспортов
    return new Map([...byFile.entries()].sort((a, b) => b[1].length - a[1].length));
  }, [analysis]);

  /**
   * Определяет цвет индикатора на основе процента неиспользуемых экспортов
   */
  const getHealthColor = (percentage: number): string => {
    if (percentage <= 10) return '#10b981'; // green
    if (percentage <= 25) return '#f59e0b'; // yellow
    if (percentage <= 50) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  /**
   * Форматирует размер в байтах
   */
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const stats = getAnalysisStats();
  const exportsByFile = getExportsByFile();
  const healthColor = getHealthColor(stats.unusedPercentage);

  return (
    <div style={{ 
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '20px',
      backgroundColor: '#f8fafc',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      {/* Заголовок */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px' 
      }}>
        <h2 style={{ 
          margin: 0, 
          fontSize: '24px', 
          fontWeight: 'bold',
          color: '#1e293b',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          🌲 Tree Shaking Monitor
        </h2>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {lastAnalysisTime && (
            <span style={{ 
              fontSize: '12px', 
              color: '#64748b',
              padding: '4px 8px',
              backgroundColor: '#f1f5f9',
              borderRadius: '6px'
            }}>
              Последний анализ: {lastAnalysisTime.toLocaleTimeString()}
            </span>
          )}
          
          <button
            onClick={performAnalysis}
            disabled={isAnalyzing}
            style={{
              padding: '8px 16px',
              backgroundColor: isAnalyzing ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isAnalyzing ? '🔄 Анализ...' : '▶️ Запустить анализ'}
          </button>
        </div>
      </div>

      {/* Ошибка */}
      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          marginBottom: '20px',
          color: '#dc2626'
        }}>
          ❌ {error}
        </div>
      )}

      {/* Загрузка */}
      {isAnalyzing && (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#f1f5f9',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>🔄</div>
          <div style={{ color: '#64748b' }}>Анализ tree shaking в процессе...</div>
        </div>
      )}

      {/* Статистика */}
      {analysis && (
        <>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '16px', 
            marginBottom: '24px' 
          }}>
            <div style={{
              padding: '16px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b' }}>
                {stats.totalFiles}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                📁 Файлов проанализировано
              </div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: healthColor }}>
                {stats.unusedExports}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                🔍 Неиспользуемых экспортов
              </div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: healthColor }}>
                {stats.unusedPercentage.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                📊 Процент неиспользуемых
              </div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>
                {formatBytes(stats.potentialSavings)}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                💾 Потенциальная экономия
              </div>
            </div>
          </div>

          {/* Индикатор здоровья */}
          <div style={{
            padding: '16px',
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            marginBottom: '24px'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '8px'
            }}>
              <span style={{ fontWeight: '500', color: '#1e293b' }}>
                Tree Shaking Health Score
              </span>
              <span style={{ 
                fontSize: '14px', 
                fontWeight: 'bold',
                color: healthColor 
              }}>
                {(100 - stats.unusedPercentage).toFixed(1)}%
              </span>
            </div>
            
            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#f1f5f9',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${100 - stats.unusedPercentage}%`,
                height: '100%',
                backgroundColor: healthColor,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>

          {/* Рекомендации */}
          {analysis.recommendations.length > 0 && (
            <div style={{
              padding: '16px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              marginBottom: '24px'
            }}>
              <h3 style={{ 
                margin: '0 0 12px 0', 
                fontSize: '18px', 
                fontWeight: '600',
                color: '#1e293b'
              }}>
                💡 Рекомендации по оптимизации
              </h3>
              
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {analysis.recommendations.slice(0, 10).map((recommendation, index) => (
                  <div key={index} style={{
                    padding: '8px 12px',
                    marginBottom: '4px',
                    backgroundColor: '#f8fafc',
                    borderLeft: '3px solid #3b82f6',
                    fontSize: '14px',
                    color: '#475569'
                  }}>
                    {recommendation}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Детальная информация по файлам */}
          {showDetails && exportsByFile.size > 0 && (
            <div style={{
              padding: '16px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}>
              <h3 style={{ 
                margin: '0 0 16px 0', 
                fontSize: '18px', 
                fontWeight: '600',
                color: '#1e293b'
              }}>
                📋 Неиспользуемые экспорты по файлам
              </h3>
              
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {Array.from(exportsByFile.entries()).slice(0, maxDisplayItems).map(([fileName, exports]) => (
                  <div key={fileName} style={{
                    marginBottom: '16px',
                    padding: '12px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px'
                    }}>
                      <span style={{ 
                        fontWeight: '500', 
                        color: '#1e293b',
                        fontSize: '14px'
                      }}>
                        📄 {fileName}
                      </span>
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: '#fef3c7',
                        color: '#92400e',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}>
                        {exports.length} экспортов
                      </span>
                    </div>
                    
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                      gap: '4px' 
                    }}>
                      {exports.slice(0, 8).map((exp, index) => (
                        <div key={index} style={{
                          padding: '4px 8px',
                          backgroundColor: 'white',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: '#64748b',
                          border: '1px solid #e2e8f0'
                        }}>
                          <span style={{ fontWeight: '500', color: '#ef4444' }}>
                            {exp.exportName}
                          </span>
                          <span style={{ color: '#9ca3af' }}> : {exp.line}</span>
                        </div>
                      ))}
                      {exports.length > 8 && (
                        <div style={{
                          padding: '4px 8px',
                          backgroundColor: '#f1f5f9',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: '#64748b',
                          textAlign: 'center'
                        }}>
                          +{exports.length - 8} еще
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bundler оптимизации */}
          {analysis.bundlerOptimizations.length > 0 && (
            <div style={{
              padding: '16px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              marginTop: '16px'
            }}>
              <h3 style={{ 
                margin: '0 0 12px 0', 
                fontSize: '18px', 
                fontWeight: '600',
                color: '#1e293b'
              }}>
                ⚙️ Оптимизации bundler
              </h3>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                gap: '8px' 
              }}>
                {analysis.bundlerOptimizations.map((optimization, index) => (
                  <div key={index} style={{
                    padding: '8px 12px',
                    backgroundColor: '#f0f9ff',
                    borderLeft: '3px solid #0ea5e9',
                    fontSize: '14px',
                    color: '#0c4a6e',
                    borderRadius: '4px'
                  }}>
                    {optimization}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Пустое состояние */}
      {!analysis && !isAnalyzing && !error && (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌲</div>
          <div style={{ fontSize: '18px', fontWeight: '500', color: '#1e293b', marginBottom: '8px' }}>
            Tree Shaking анализ не запущен
          </div>
          <div style={{ color: '#64748b', marginBottom: '20px' }}>
            Нажмите "Запустить анализ" для поиска неиспользуемого кода
          </div>
        </div>
      )}
    </div>
  );
};

export default TreeShakingMonitor;
