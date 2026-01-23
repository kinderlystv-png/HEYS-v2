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
  
  console.warn('[DB-Pool] CA cert not found, SSL verification disabled');
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
    } : {
      rejectUnauthorized: false
    },
    
    // Connection pool settings
    max: 3,                      // Максимум 3 соединения (лимит для serverless)
    idleTimeoutMillis: 10000,    // 10 секунд до закрытия idle соединения
    connectionTimeoutMillis: 5000, // 5 секунд таймаут на подключение
    
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
 * @returns {Pool} PostgreSQL connection pool
 */
function getPool() {
  if (!pool) {
    const config = createPoolConfig();
    pool = new Pool(config);
    
    // Event handlers для мониторинга (только в debug режиме)
    const IS_DEBUG = process.env.LOG_LEVEL === 'debug';
    
    if (IS_DEBUG) {
      pool.on('connect', (client) => {
        console.log('[DB-Pool] New client connected');
      });
      
      pool.on('acquire', (client) => {
        console.log('[DB-Pool] Client acquired from pool');
      });
      
      pool.on('remove', (client) => {
        console.log('[DB-Pool] Client removed from pool');
      });
    }
    
    // Error handler всегда активен (критичные ошибки)
    pool.on('error', (err, client) => {
      console.error('[DB-Pool] Unexpected error on idle client:', err.message);
    });
    
    console.log('[DB-Pool] Pool initialized with max:', config.max);
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
async function withClient(callback) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

/**
 * Закрывает pool и все соединения
 * Используется при graceful shutdown
 */
async function closePool() {
  if (pool) {
    console.log('[DB-Pool] Closing pool...');
    await pool.end();
    pool = null;
    console.log('[DB-Pool] Pool closed');
  }
}

module.exports = {
  getPool,
  withClient,
  closePool
};
