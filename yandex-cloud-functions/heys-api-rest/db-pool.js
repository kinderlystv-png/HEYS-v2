/**
 * HEYS Shared Database Connection Pool
 * 
 * Решает проблему исчерпания DB соединений в Yandex Cloud Functions
 * через использование единого connection pool для всех функций.
 * 
 * Configuration:
 *   - max: 3 соединения (лимит Yandex Managed PostgreSQL для serverless)
 *   - idleTimeoutMillis: 10000 (10 секунд — быстро освобождаем неактивные)
 *   - connectionTimeoutMillis: 5000 (5 секунд на подключение)
 * 
 * Usage:
 *   const { getPool, withClient } = require('./shared/db-pool');
 *   
 *   // Option 1: Manual connection management
 *   const pool = getPool();
 *   const client = await pool.connect();
 *   try {
 *     const result = await client.query('SELECT * FROM ...');
 *   } finally {
 *     client.release();
 *   }
 *   
 *   // Option 2: Auto-release with withClient helper
 *   const result = await withClient(async (client) => {
 *     return await client.query('SELECT * FROM ...');
 *   });
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Singleton pool instance
let pool = null;

// Per-function pool instances for separate metrics tracking
const poolsByFunction = new Map();

/**
 * Загрузка CA сертификата Yandex Cloud
 */
function loadCACert() {
  // Пытаемся найти сертификат в нескольких местах
  const possiblePaths = [
    path.join(__dirname, '..', 'certs', 'root.crt'),
    path.join(__dirname, 'certs', 'root.crt'),
    path.join(process.cwd(), 'certs', 'root.crt')
  ];

  for (const certPath of possiblePaths) {
    if (fs.existsSync(certPath)) {
      try {
        return fs.readFileSync(certPath, 'utf8');
      } catch (e) {
        console.warn(`[DB-Pool] Failed to read cert at ${certPath}:`, e.message);
      }
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn('[DB-Pool] CA cert not found, SSL verification disabled (development mode)');
  } else {
    console.error(
      '[DB-Pool] CA cert not found! SSL verification will be enforced but may fail without proper cert. ' +
      'Please ensure certs/root.crt is available.'
    );
  }
  return null;
}

/**
 * Создаёт конфигурацию PostgreSQL из env переменных
 */
function createPoolConfig() {
  const CA_CERT = loadCACert();

  return {
    host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: parseInt(process.env.PG_PORT || '6432'),
    database: process.env.PG_DATABASE || 'heys_production',
    user: process.env.PG_USER || 'heys_admin',
    password: process.env.PG_PASSWORD,

    // SSL configuration
    ssl: CA_CERT ? {
      rejectUnauthorized: true,
      ca: CA_CERT
    } : (process.env.NODE_ENV === 'development' ? {
      rejectUnauthorized: false  // Only for development
    } : {
      rejectUnauthorized: true  // Production: fail if no cert (secure by default)
    }),

    // Connection pool settings
    max: 3,                      // Максимум 3 соединения (лимит для serverless)
    idleTimeoutMillis: 3000,     // 3 секунды — быстро освобождаем (pgBouncer-friendly)
    connectionTimeoutMillis: 5000, // 5 секунд таймаут на подключение

    // Keep-alive для предотвращения stale connections в serverless
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,

    // Query settings
    query_timeout: 10000,        // 10 секунд таймаут на запрос

    // Error handling
    allowExitOnIdle: true        // Позволяет процессу завершиться если все соединения idle
  };
}

/**
 * Возвращает singleton экземпляр Pool
 * Создаёт pool при первом вызове, последующие вызовы возвращают тот же экземпляр
 * 
 * @param {string} functionName - Опциональное имя функции для per-function метрик
 * @returns {Pool} PostgreSQL connection pool
 */
function getPool(functionName = null) {
  // Если задано имя функции, используем отдельный pool для метрик
  if (functionName && process.env.POOL_PER_FUNCTION_METRICS === 'true') {
    if (!poolsByFunction.has(functionName)) {
      const config = createPoolConfig();
      const funcPool = new Pool(config);

      // Tag pool с именем функции для метрик
      funcPool._functionName = functionName;

      const IS_DEBUG = process.env.LOG_LEVEL === 'debug';

      if (IS_DEBUG) {
        funcPool.on('connect', (client) => {
          console.info(`[DB-Pool:${functionName}] ℹ️ New client connected`);
        });

        funcPool.on('acquire', (client) => {
          console.info(`[DB-Pool:${functionName}] ℹ️ Client acquired from pool`);
        });

        funcPool.on('remove', (client) => {
          console.info(`[DB-Pool:${functionName}] ℹ️ Client removed from pool`);
        });
      }

      funcPool.on('error', (err, client) => {
        console.error(`[DB-Pool:${functionName}] Unexpected error on idle client:`, err.message);
      });

      console.info(`[DB-Pool:${functionName}] ℹ️ Pool initialized with max:`, config.max);
      poolsByFunction.set(functionName, funcPool);
    }

    return poolsByFunction.get(functionName);
  }

  // Иначе используем общий pool
  if (!pool) {
    const config = createPoolConfig();
    pool = new Pool(config);

    // Event handlers для мониторинга (только в debug режиме)
    const IS_DEBUG = process.env.LOG_LEVEL === 'debug';

    if (IS_DEBUG) {
      pool.on('connect', (client) => {
        console.info('[DB-Pool] ℹ️ New client connected');
      });

      pool.on('acquire', (client) => {
        console.info('[DB-Pool] ℹ️ Client acquired from pool');
      });

      pool.on('remove', (client) => {
        console.info('[DB-Pool] ℹ️ Client removed from pool');
      });
    }

    // Error handler всегда активен — при fatal ошибках пересоздаём pool
    pool.on('error', (err, client) => {
      console.error('[DB-Pool] ❌ Unexpected error on idle client:', err.message);

      // Пересоздаём pool при fatal ошибках (stale connections после freeze/thaw)
      const isFatal =
        err.message?.includes('Connection terminated') ||
        err.message?.includes('connection') ||
        err.code === 'ECONNRESET' ||
        err.code === 'EPIPE' ||
        err.code === 'ECONNREFUSED';

      if (isFatal) {
        console.warn('[DB-Pool] ⚠️ Fatal connection error, destroying pool for recreation...');
        pool.end().catch(e => console.error('[DB-Pool] Error ending pool:', e.message));
        pool = null;
      }
    });

    console.info('[DB-Pool] ℹ️ Pool initialized with max:', config.max);
  }

  return pool;
}

/**
 * Helper функция для автоматического управления клиентом
 * Получает клиент из pool, выполняет callback, и автоматически освобождает клиент
 * 
 * @param {Function} callback - async функция которая принимает client и возвращает результат
 * @returns {Promise<any>} результат выполнения callback
 * @throws {Error} если произошла ошибка в callback
 */
async function withClient(callback, maxRetries = 2) {
  const pool = getPool();
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let client = null;

    try {
      client = await pool.connect();

      // Проверяем живость соединения при повторной попытке
      if (attempt > 0) {
        try {
          await client.query('SELECT 1');
        } catch (pingErr) {
          console.warn('[DB-Pool] Connection stale, releasing and retrying...');
          client.release(true); // true = destroy this client
          client = null;
          continue;
        }
      }

      return await callback(client);
    } catch (err) {
      lastError = err;

      // При ошибках соединения — пробуем ещё раз
      const isConnectionError =
        err.message?.includes('Connection terminated') ||
        err.message?.includes('connection') ||
        err.code === 'ECONNRESET' ||
        err.code === 'EPIPE';

      if (isConnectionError && attempt < maxRetries) {
        console.warn(`[DB-Pool] ⚠️ Connection error (attempt ${attempt + 1}/${maxRetries + 1}):`, err.message);
        if (client) {
          client.release(true);
          client = null;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      throw err;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  throw lastError || new Error('Unknown error in withClient');
}

/**
 * Закрывает pool и все соединения
 * Используется при graceful shutdown
 */
async function closePool() {
  if (pool) {
    console.info('[DB-Pool] ℹ️ Closing pool...');
    await pool.end();
    pool = null;
    console.info('[DB-Pool] ℹ️ Pool closed');
  }

  // Закрываем все per-function pools
  for (const [funcName, funcPool] of poolsByFunction.entries()) {
    console.info(`[DB-Pool:${funcName}] ℹ️ Closing pool...`);
    await funcPool.end();
  }
  poolsByFunction.clear();
}

/**
 * Возвращает список всех активных pools (для мониторинга)
 * 
 * @returns {Array} Массив объектов с информацией о pools
 */
function getAllPools() {
  const pools = [];

  if (pool) {
    pools.push({
      name: 'shared',
      pool: pool,
      metrics: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      }
    });
  }

  for (const [funcName, funcPool] of poolsByFunction.entries()) {
    pools.push({
      name: funcName,
      pool: funcPool,
      metrics: {
        total: funcPool.totalCount,
        idle: funcPool.idleCount,
        waiting: funcPool.waitingCount
      }
    });
  }

  return pools;
}

module.exports = {
  getPool,
  withClient,
  closePool,
  getAllPools
};
