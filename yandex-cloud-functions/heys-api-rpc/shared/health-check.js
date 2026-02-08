/**
 * HEYS Health Check Endpoint
 * 
 * Provides comprehensive health checks for Cloud Functions
 * including connection pool status, database connectivity, and system metrics.
 * 
 * Usage in Cloud Function:
 *   const { getHealthStatus } = require('./shared/health-check');
 *   
 *   // In your handler:
 *   if (event.path === '/health') {
 *     return getHealthStatus();
 *   }
 */

const { getPoolHealthCheck, getPoolMetrics } = require('./pool-metrics');
const { getPool } = require('./db-pool');

/**
 * Выполняет проверку подключения к БД
 * 
 * @returns {Promise<Object>} Database health status
 */
async function checkDatabaseConnection() {
  const pool = getPool();
  
  try {
    const client = await pool.connect();
    const start = Date.now();
    
    try {
      // Простой запрос для проверки соединения
      await client.query('SELECT 1 as health');
      const latency = Date.now() - start;
      
      return {
        healthy: true,
        latency: `${latency}ms`,
        status: 'connected'
      };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      healthy: false,
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Возвращает информацию о версии и окружении
 * 
 * @returns {Object} Version information
 */
function getVersionInfo() {
  return {
    node_version: process.version,
    env: process.env.NODE_ENV || 'production',
    function_name: process.env.FUNCTION_NAME || 'unknown',
    uptime: process.uptime()
  };
}

/**
 * Возвращает полный health status для функции
 * 
 * @returns {Promise<Object>} Complete health status
 */
async function getHealthStatus() {
  const poolHealth = getPoolHealthCheck();
  const dbHealth = await checkDatabaseConnection();
  const versionInfo = getVersionInfo();
  const poolMetrics = getPoolMetrics();
  
  // Общий статус: healthy только если все компоненты healthy
  const isHealthy = poolHealth.healthy && dbHealth.healthy;
  
  const status = {
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      pool: poolHealth,
      database: dbHealth
    },
    metrics: {
      pool: {
        utilization: poolMetrics.utilization,
        active: poolMetrics.activeCount,
        idle: poolMetrics.idleCount,
        waiting: poolMetrics.waitingCount
      },
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
      }
    },
    version: versionInfo
  };
  
  // HTTP status code
  const statusCode = isHealthy ? 200 : 503;
  
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    },
    body: JSON.stringify(status, null, 2)
  };
}

/**
 * Простая версия health check (только up/down)
 * Быстрая проверка без детальных метрик
 * 
 * @returns {Promise<Object>} Simple health response
 */
async function getSimpleHealthStatus() {
  try {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      await client.query('SELECT 1');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ok' })
      };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'error', error: error.message })
    };
  }
}

/**
 * Readiness probe - проверяет готовность к обработке запросов
 * Возвращает 200 только если пул готов принимать запросы
 * 
 * @returns {Object} Readiness status
 */
function getReadinessStatus() {
  const poolMetrics = getPoolMetrics();
  
  // Ready если:
  // - Есть хотя бы 1 idle соединение
  // - Утилизация < 100%
  // - Не слишком много ожидающих (< 5)
  const isReady = poolMetrics.idleCount > 0 
                  && poolMetrics.utilization < 100 
                  && poolMetrics.waitingCount < 5;
  
  return {
    statusCode: isReady ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ready: isReady,
      idle_connections: poolMetrics.idleCount,
      waiting_requests: poolMetrics.waitingCount
    })
  };
}

/**
 * Liveness probe - проверяет что приложение живо
 * Простая проверка без внешних зависимостей
 * 
 * @returns {Object} Liveness status
 */
function getLivenessStatus() {
  // Всегда возвращаем 200 если процесс запущен
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      alive: true,
      uptime: process.uptime()
    })
  };
}

module.exports = {
  getHealthStatus,
  getSimpleHealthStatus,
  getReadinessStatus,
  getLivenessStatus,
  checkDatabaseConnection
};
