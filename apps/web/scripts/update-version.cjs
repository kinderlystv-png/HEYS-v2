/**
 * update-version.cjs — Автоматическое обновление APP_VERSION при билде
 * 
 * Запускается в prebuild, генерирует уникальную версию на основе:
 * - Даты билда
 * - Git commit hash (если доступен)
 * 
 * Формат: YYYY.MM.DD.HHMM или git short hash
 * 
 * Также создаёт:
 * - /public/version.json — для проверки версии с сервера (PWA forced update)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_FILE = path.join(__dirname, '..', 'heys_app_v12.js');
const SW_FILE = path.join(__dirname, '..', 'public', 'sw.js');
const VERSION_JSON = path.join(__dirname, '..', 'public', 'version.json');

// Получаем git short hash если доступен
function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

// Генерируем версию (всегда по Москве UTC+3)
function generateVersion() {
  // Получаем время в Москве
  const now = new Date();
  const moscowDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  
  const year = moscowDate.getFullYear();
  const month = String(moscowDate.getMonth() + 1).padStart(2, '0');
  const day = String(moscowDate.getDate()).padStart(2, '0');
  const hour = String(moscowDate.getHours()).padStart(2, '0');
  const minute = String(moscowDate.getMinutes()).padStart(2, '0');
  
  const date = `${year}.${month}.${day}`;
  const time = `${hour}${minute}`;
  const hash = getGitHash();
  
  // Формат: 2025.12.12.1423.abc1234 (всегда дата + время + hash если есть)
  return hash ? `${date}.${time}.${hash}` : `${date}.${time}`;
}

// Обновляем версию в файле
function updateVersion() {
  const newVersion = generateVersion();
  
  // 1. Обновляем APP_VERSION в heys_app_v12.js
  let content = fs.readFileSync(APP_FILE, 'utf8');
  const versionRegex = /const APP_VERSION = '[^']+'/;
  
  if (versionRegex.test(content)) {
    content = content.replace(versionRegex, `const APP_VERSION = '${newVersion}'`);
    fs.writeFileSync(APP_FILE, content);
    console.log(`✅ APP_VERSION updated to: ${newVersion}`);
  } else {
    console.log('⚠️ APP_VERSION not found in file');
  }
  
  // 2. Создаём version.json для проверки с сервера (PWA forced update)
  const versionData = {
    version: newVersion,
    buildTime: new Date().toISOString(),
    hash: getGitHash() || 'unknown'
  };
  
  fs.writeFileSync(VERSION_JSON, JSON.stringify(versionData, null, 2));
  console.log(`✅ version.json created: ${newVersion}`);
  
  // 3. Обновляем CACHE_VERSION в sw.js (критично для инвалидации SW кэша!)
  let swContent = fs.readFileSync(SW_FILE, 'utf8');
  const cacheVersionRegex = /const CACHE_VERSION = '[^']+'/;
  const newCacheVersion = `heys-${Date.now()}`;
  
  if (cacheVersionRegex.test(swContent)) {
    swContent = swContent.replace(cacheVersionRegex, `const CACHE_VERSION = '${newCacheVersion}'`);
    fs.writeFileSync(SW_FILE, swContent);
    console.log(`✅ SW CACHE_VERSION updated to: ${newCacheVersion}`);
  } else {
    console.log('⚠️ CACHE_VERSION not found in sw.js');
  }
  
  return newVersion;
}

updateVersion();
