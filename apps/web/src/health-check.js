#!/usr/bin/env node
/**
 * Health check script для HEYS веб-приложения
 */

import { createServer } from 'http';

import { log } from '@heys/logger';

const HEALTH_PORT = process.env.HEALTH_PORT || 3001;
const APP_PORT = process.env.PORT || 3000;

async function healthCheck() {
  try {
    // Проверяем основное приложение
    const appCheck = await fetch(`http://localhost:${APP_PORT}/`);
    if (!appCheck.ok) {
      throw new Error(`App not responding: ${appCheck.status}`);
    }

    // Проверяем системные ресурсы
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };

    log.debug('Health check passed', healthData);
    return healthData;
  } catch (error) {
    log.error('Health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// CLI режим для Docker health check
if (import.meta.url === `file://${process.argv[1]}`) {
  healthCheck()
    .then(() => {
      log.info('✅ Health check passed');
      process.exit(0);
    })
    .catch((error) => {
      log.error('❌ Health check failed:', { error: error.message });
      process.exit(1);
    });
}

// HTTP сервер режим для продакшена
if (process.env.HEALTH_SERVER === 'true') {
  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      try {
        const healthData = await healthCheck();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthData, null, 2));
      } catch (error) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'unhealthy',
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }),
        );
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(HEALTH_PORT, () => {
    log.info(`Health check server running on port ${HEALTH_PORT}`);
  });
}

export { healthCheck };
