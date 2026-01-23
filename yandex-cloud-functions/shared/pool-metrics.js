/**
 * HEYS Connection Pool Metrics Module
 * 
 * Provides real-time metrics for PostgreSQL connection pool monitoring.
 * Exports pool statistics for monitoring dashboards and alerting.
 * 
 * Usage:
 *   const { getPoolMetrics, logPoolMetrics } = require('./shared/pool-metrics');
 *   
 *   // Get current metrics
 *   const metrics = getPoolMetrics();
 *   console.log(`Active connections: ${metrics.totalCount}`);
 *   
 *   // Log metrics periodically
 *   setInterval(logPoolMetrics, 60000); // Every minute
 */

const { getPool } = require('./db-pool');

/**
 * Получает текущие метрики пула соединений
 * 
 * @returns {Object} Metrics object with pool statistics
 */
function getPoolMetrics() {
  const pool = getPool();
  
  return {
    // Общее количество клиентов в пуле (активные + ожидающие)
    totalCount: pool.totalCount,
    
    // Количество активных клиентов (выданных из пула)
    activeCount: pool.totalCount - pool.idleCount,
    
    // Количество idle клиентов (доступных в пуле)
    idleCount: pool.idleCount,
    
    // Количество запросов, ожидающих клиента
    waitingCount: pool.waitingCount,
    
    // Максимальное количество соединений
    maxConnections: pool.options.max,
    
    // Утилизация пула (процент использования)
    utilization: pool.options.max > 0 
      ? Math.round(((pool.totalCount - pool.idleCount) / pool.options.max) * 100) 
      : 0,
    
    // Timestamp метрики
    timestamp: new Date().toISOString()
  };
}

/**
 * Логирует метрики пула в structured формате
 * Использовать для периодического мониторинга
 */
function logPoolMetrics() {
  const metrics = getPoolMetrics();
  
  console.log('[Pool-Metrics]', JSON.stringify({
    active: metrics.activeCount,
    idle: metrics.idleCount,
    waiting: metrics.waitingCount,
    total: metrics.totalCount,
    max: metrics.maxConnections,
    utilization: `${metrics.utilization}%`,
    timestamp: metrics.timestamp
  }));
  
  // Предупреждение если утилизация > 80%
  if (metrics.utilization > 80) {
    console.warn('[Pool-Metrics] WARNING: Pool utilization > 80%', {
      utilization: metrics.utilization,
      active: metrics.activeCount,
      max: metrics.maxConnections
    });
  }
  
  // Предупреждение если есть ожидающие запросы
  if (metrics.waitingCount > 0) {
    console.warn('[Pool-Metrics] WARNING: Requests waiting for connections', {
      waiting: metrics.waitingCount,
      active: metrics.activeCount
    });
  }
}

/**
 * Возвращает health check объект для pool
 * Для использования в /health endpoints
 * 
 * @returns {Object} Health check result
 */
function getPoolHealthCheck() {
  const metrics = getPoolMetrics();
  
  // Критерии здоровья:
  // - Утилизация < 90%
  // - Нет ожидающих запросов
  // - Есть хотя бы 1 idle соединение
  
  const isHealthy = metrics.utilization < 90 
                    && metrics.waitingCount === 0 
                    && metrics.idleCount > 0;
  
  return {
    healthy: isHealthy,
    status: isHealthy ? 'ok' : 'degraded',
    metrics: {
      utilization: `${metrics.utilization}%`,
      active: metrics.activeCount,
      idle: metrics.idleCount,
      waiting: metrics.waitingCount
    },
    message: isHealthy 
      ? 'Connection pool healthy' 
      : `Pool degraded: ${metrics.utilization}% utilization, ${metrics.waitingCount} waiting`
  };
}

/**
 * Middleware для Express/Cloud Functions для автоматического логирования метрик
 * Логирует метрики до и после обработки запроса
 * 
 * @param {Function} handler - Основной handler функции
 * @returns {Function} Wrapped handler с метриками
 */
function withPoolMetrics(handler) {
  return async function(event, context) {
    const startMetrics = getPoolMetrics();
    console.log('[Pool-Metrics] Request start:', {
      active: startMetrics.activeCount,
      idle: startMetrics.idleCount
    });
    
    try {
      const result = await handler(event, context);
      return result;
    } finally {
      const endMetrics = getPoolMetrics();
      console.log('[Pool-Metrics] Request end:', {
        active: endMetrics.activeCount,
        idle: endMetrics.idleCount,
        delta: endMetrics.activeCount - startMetrics.activeCount
      });
    }
  };
}

module.exports = {
  getPoolMetrics,
  logPoolMetrics,
  getPoolHealthCheck,
  withPoolMetrics
};
