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
 * - /public/build-meta.json — единый источник версии (SW + UI)
 * - /public/version.json — legacy fallback
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_FILE = path.join(__dirname, '..', 'heys_app_v12.js');
const PWA_MODULE_FILE = path.join(__dirname, '..', 'heys_pwa_module_v1.js');
const SW_FILE = path.join(__dirname, '..', 'public', 'sw.js');
const VERSION_JSON = path.join(__dirname, '..', 'public', 'version.json');
const BUILD_META_JSON = path.join(__dirname, '..', 'public', 'build-meta.json');

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

  // 1b. Обновляем APP_VERSION в heys_pwa_module_v1.js (источник HEYS.version у рантайма)
  if (fs.existsSync(PWA_MODULE_FILE)) {
    let pwaContent = fs.readFileSync(PWA_MODULE_FILE, 'utf8');
    const pwaVersionRegex = /const APP_VERSION = '[^']+'/;
    if (pwaVersionRegex.test(pwaContent)) {
      pwaContent = pwaContent.replace(pwaVersionRegex, `const APP_VERSION = '${newVersion}'`);
      fs.writeFileSync(PWA_MODULE_FILE, pwaContent);
      console.log(`✅ heys_pwa_module_v1.js APP_VERSION updated to: ${newVersion}`);
    } else {
      console.log('⚠️ APP_VERSION not found in heys_pwa_module_v1.js');
    }
  }

  // 2. Создаём build-meta.json (единый источник версии)
  const metaData = {
    version: newVersion,
    buildTime: new Date().toISOString(),
    hash: getGitHash() || 'unknown'
  };

  fs.writeFileSync(BUILD_META_JSON, JSON.stringify(metaData, null, 2));
  console.log(`✅ build-meta.json created: ${newVersion}`);

  // Legacy: version.json оставляем для обратной совместимости
  fs.writeFileSync(VERSION_JSON, JSON.stringify(metaData, null, 2));
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

  // 4. Обновляем cache-busting query string в index.html для heys_app_v12.js
  const INDEX_HTML = path.join(__dirname, '..', 'index.html');
  let htmlContent = fs.readFileSync(INDEX_HTML, 'utf8');
  // Регулярка: src="heys_app_v12.js?v=..." — только в атрибуте src, не в комментариях
  const scriptRegex = /src="heys_app_v12\.js\?v=[^"]+"/g;
  const newScriptSrc = `src="heys_app_v12.js?v=${newVersion}"`;

  const matches = htmlContent.match(scriptRegex);
  if (matches && matches.length > 0) {
    htmlContent = htmlContent.replace(scriptRegex, newScriptSrc);
    fs.writeFileSync(INDEX_HTML, htmlContent);
    console.log(`✅ index.html script src updated: heys_app_v12.js?v=${newVersion}`);
  } else {
    console.log('⚠️ heys_app_v12.js not found in index.html (looking for src="heys_app_v12.js?v=...")');
  }

  return newVersion;
}

updateVersion();
