#!/usr/bin/env node

/**
 * Application Monitoring Script for HEYS
 * Мониторинг состояния приложения в продакшн
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const MONITORING_CONFIG = {
  interval: 30000, // 30 секунд
  retries: 3,
  timeout: 5000,
  endpoints: [
    { path: '/health', name: 'Health Check' },
    { path: '/api/status', name: 'API Status' },
  ],
  alerts: {
    email: process.env.ALERT_EMAIL,
    webhook: process.env.ALERT_WEBHOOK,
  },
};

const METRICS_FILE = path.join(__dirname, '..', 'metrics.json');
const LOG_FILE = path.join(__dirname, '..', 'monitoring.log');

class HealthMonitor {
  constructor() {
    this.metrics = this.loadMetrics();
    this.isRunning = false;
  }

  loadMetrics() {
    try {
      return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
    } catch (error) {
      return {
        uptime: Date.now(),
        checks: [],
        errors: [],
        lastCheck: null,
      };
    }
  }

  saveMetrics() {
    fs.writeFileSync(METRICS_FILE, JSON.stringify(this.metrics, null, 2));
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

    console.log(`[${level.toUpperCase()}] ${message}`);
    fs.appendFileSync(LOG_FILE, logMessage);
  }

  async checkEndpoint(endpoint) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: process.env.PORT || 3000,
        path: endpoint.path,
        method: 'GET',
        timeout: MONITORING_CONFIG.timeout,
      };

      const req = http.request(options, (res) => {
        const responseTime = Date.now() - startTime;

        if (res.statusCode === 200) {
          resolve({
            endpoint: endpoint.name,
            status: 'success',
            responseTime,
            statusCode: res.statusCode,
            timestamp: new Date().toISOString(),
          });
        } else {
          reject(new Error(`${endpoint.name} returned status ${res.statusCode}`));
        }
      });

      const startTime = Date.now();

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`${endpoint.name} timed out`));
      });

      req.on('error', (err) => {
        reject(new Error(`${endpoint.name} error: ${err.message}`));
      });

      req.end();
    });
  }

  async performHealthCheck() {
    const checkResults = [];

    for (const endpoint of MONITORING_CONFIG.endpoints) {
      let result;
      let attempts = 0;

      while (attempts < MONITORING_CONFIG.retries) {
        try {
          result = await this.checkEndpoint(endpoint);
          break;
        } catch (error) {
          attempts++;
          if (attempts === MONITORING_CONFIG.retries) {
            result = {
              endpoint: endpoint.name,
              status: 'error',
              error: error.message,
              attempts,
              timestamp: new Date().toISOString(),
            };
          } else {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }

      checkResults.push(result);
    }

    return checkResults;
  }

  analyzeResults(results) {
    const healthyCount = results.filter((r) => r.status === 'success').length;
    const totalCount = results.length;
    const healthPercentage = (healthyCount / totalCount) * 100;

    const status =
      healthPercentage === 100 ? 'healthy' : healthPercentage >= 50 ? 'degraded' : 'unhealthy';

    return {
      status,
      healthPercentage,
      healthyEndpoints: healthyCount,
      totalEndpoints: totalCount,
      results,
    };
  }

  async sendAlert(analysis) {
    if (analysis.status === 'healthy') return;

    const alertMessage = `
🚨 HEYS Health Alert
Status: ${analysis.status.toUpperCase()}
Health: ${analysis.healthPercentage}% (${analysis.healthyEndpoints}/${analysis.totalEndpoints})
Time: ${new Date().toISOString()}

Failed Endpoints:
${analysis.results
  .filter((r) => r.status === 'error')
  .map((r) => `- ${r.endpoint}: ${r.error}`)
  .join('\n')}
    `.trim();

    this.log(`Sending alert: ${analysis.status}`, 'warn');

    // В реальной системе здесь был бы код для отправки email/webhook
    console.log(alertMessage);
  }

  async runCheck() {
    try {
      this.log('Starting health check cycle');

      const results = await this.performHealthCheck();
      const analysis = this.analyzeResults(results);

      // Сохраняем метрики
      this.metrics.lastCheck = analysis;
      this.metrics.checks.push({
        timestamp: new Date().toISOString(),
        status: analysis.status,
        results,
      });

      // Ограничиваем историю (последние 100 проверок)
      if (this.metrics.checks.length > 100) {
        this.metrics.checks = this.metrics.checks.slice(-100);
      }

      this.saveMetrics();

      // Логируем результат
      this.log(
        `Health check completed: ${analysis.status} (${analysis.healthPercentage}%)`,
        analysis.status === 'healthy' ? 'info' : 'warn',
      );

      // Отправляем алерт если нужно
      await this.sendAlert(analysis);
    } catch (error) {
      this.log(`Health check failed: ${error.message}`, 'error');
      this.metrics.errors.push({
        timestamp: new Date().toISOString(),
        error: error.message,
      });
      this.saveMetrics();
    }
  }

  start() {
    if (this.isRunning) {
      this.log('Monitor is already running', 'warn');
      return;
    }

    this.isRunning = true;
    this.log('Starting HEYS health monitor');

    // Первая проверка сразу
    this.runCheck();

    // Периодические проверки
    this.interval = setInterval(() => {
      this.runCheck();
    }, MONITORING_CONFIG.interval);

    // Graceful shutdown
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
  }

  stop() {
    if (!this.isRunning) return;

    this.log('Stopping HEYS health monitor');
    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
    }

    process.exit(0);
  }

  getMetrics() {
    return this.metrics;
  }
}

// CLI interface
if (require.main === module) {
  const monitor = new HealthMonitor();

  const command = process.argv[2];

  switch (command) {
    case 'start':
      monitor.start();
      break;
    case 'check':
      monitor.runCheck().then(() => process.exit(0));
      break;
    case 'metrics':
      console.log(JSON.stringify(monitor.getMetrics(), null, 2));
      break;
    default:
      console.log('Usage: node monitoring.js [start|check|metrics]');
      process.exit(1);
  }
}

module.exports = { HealthMonitor };
