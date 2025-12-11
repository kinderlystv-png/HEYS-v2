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

// Генерируем версию
function generateVersion() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '.'); // 2025.12.03
  const time = now.toTimeString().slice(0, 5).replace(':', ''); // 1423
  const hash = getGitHash();
  
  // Формат: 2025.12.03.1423 или 2025.12.03.abc1234
  return hash ? `${date}.${hash}` : `${date}.${time}`;
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
