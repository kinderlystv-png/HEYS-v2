/**
 * update-version.cjs — Автоматическое обновление APP_VERSION при билде
 * 
 * Запускается в prebuild, генерирует уникальную версию на основе:
 * - Даты билда
 * - Git commit hash (если доступен)
 * 
 * Формат: YYYY.MM.DD.HHMM или git short hash
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_FILE = path.join(__dirname, '..', 'heys_app_v12.js');

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
  
  let content = fs.readFileSync(APP_FILE, 'utf8');
  
  // Заменяем APP_VERSION = 'xxx' на новую версию
  const versionRegex = /const APP_VERSION = '[^']+'/;
  
  if (versionRegex.test(content)) {
    content = content.replace(versionRegex, `const APP_VERSION = '${newVersion}'`);
    fs.writeFileSync(APP_FILE, content);
    console.log(`✅ APP_VERSION updated to: ${newVersion}`);
  } else {
    console.log('⚠️ APP_VERSION not found in file');
  }
  
  return newVersion;
}

updateVersion();
