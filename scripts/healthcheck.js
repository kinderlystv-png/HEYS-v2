#!/usr/bin/env node

/**
 * Health Check Script for HEYS Application
 * Проверяет состояние приложения для Docker health checks
 */

const http = require('http');
const process = require('process');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const HEALTH_ENDPOINT = '/health';

const checkHealth = () => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: HEALTH_ENDPOINT,
      method: 'GET',
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve({
          status: 'healthy',
          statusCode: res.statusCode,
          timestamp: new Date().toISOString(),
        });
      } else {
        reject(new Error(`Health check failed with status ${res.statusCode}`));
      }
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check timed out'));
    });

    req.on('error', (err) => {
      reject(new Error(`Health check error: ${err.message}`));
    });

    req.end();
  });
};

const main = async () => {
  try {
    console.log(`🔍 Checking health at http://${HOST}:${PORT}${HEALTH_ENDPOINT}`);
    
    const result = await checkHealth();
    
    console.log('✅ Health check passed:', result);
    process.exit(0);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    process.exit(1);
  }
};

// Если запущен напрямую
if (require.main === module) {
  main();
}

module.exports = { checkHealth };
