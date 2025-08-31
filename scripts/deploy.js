#!/usr/bin/env node

/**
 * Production Deployment Script for HEYS
 * Автоматизирует процесс деплоя в продакшн
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'deployment.log');

const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, logMessage);
};

const runCommand = (command, description) => {
  log(`🔄 ${description}...`);
  try {
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    log(`✅ ${description} completed`);
    return output;
  } catch (error) {
    log(`❌ ${description} failed: ${error.message}`);
    throw error;
  }
};

const checkPrerequisites = () => {
  log('🔍 Checking prerequisites...');
  
  // Проверяем Docker
  try {
    runCommand('docker --version', 'Docker version check');
  } catch (error) {
    throw new Error('Docker is not installed or not running');
  }

  // Проверяем git статус
  try {
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf-8' });
    if (gitStatus.trim()) {
      throw new Error('Working directory is not clean. Please commit or stash changes.');
    }
  } catch (error) {
    throw new Error('Git repository check failed');
  }

  log('✅ Prerequisites check passed');
};

const deploy = async () => {
  try {
    log('🚀 Starting HEYS production deployment...');
    
    // 1. Проверяем prerequisites
    checkPrerequisites();
    
    // 2. Обновляем код
    runCommand('git pull origin main', 'Pulling latest code');
    
    // 3. Устанавливаем зависимости
    runCommand('pnpm install --frozen-lockfile', 'Installing dependencies');
    
    // 4. Запускаем тесты
    runCommand('pnpm run test:all', 'Running all tests');
    
    // 5. Собираем Docker образ
    runCommand('docker build -t heys:latest .', 'Building Docker image');
    
    // 6. Тегируем для registry
    const version = require('../package.json').version;
    runCommand(`docker tag heys:latest heys:${version}`, 'Tagging Docker image');
    
    // 7. Останавливаем старый контейнер
    try {
      runCommand('docker-compose down', 'Stopping old containers');
    } catch (error) {
      log('⚠️ No existing containers to stop');
    }
    
    // 8. Запускаем новый контейнер
    runCommand('docker-compose up -d heys-web', 'Starting new container');
    
    // 9. Проверяем health check
    log('⏳ Waiting for application to start...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 секунд
    
    runCommand('pnpm run healthcheck', 'Running health check');
    
    log('🎉 Deployment completed successfully!');
    
  } catch (error) {
    log(`💥 Deployment failed: ${error.message}`);
    process.exit(1);
  }
};

// Если запущен напрямую
if (require.main === module) {
  deploy();
}

module.exports = { deploy };
