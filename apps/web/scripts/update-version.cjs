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
const {
  isBuildArtifactOnlyFile: isReleaseMetaOnlyFile,
} = require('../../../scripts/build-meta-target.cjs');

let cachedReleaseTarget = null;

const APP_FILE = path.join(__dirname, '..', 'heys_app_v12.js');
const PWA_MODULE_FILE = path.join(__dirname, '..', 'heys_pwa_module_v1.js');
const SW_FILE = path.join(__dirname, '..', 'public', 'sw.js');
const VERSION_JSON = path.join(__dirname, '..', 'public', 'version.json');
const BUILD_META_JSON = path.join(__dirname, '..', 'public', 'build-meta.json');

function runGit(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (e) {
    return '';
  }
}

function getGitHash(ref = 'HEAD') {
  return runGit(`git rev-parse --short=8 ${ref}`) || null;
}

function getGitCommitTimestamp(ref = 'HEAD') {
  const raw = runGit(`git show -s --format=%ct ${ref}`);
  const timestampSeconds = Number(raw);
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
    return null;
  }
  return timestampSeconds * 1000;
}

function getCommitFiles(ref = 'HEAD') {
  const output = runGit(`git diff-tree --no-commit-id --name-only -r ${ref}`);
  if (!output) return [];
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolveReleaseTargetRef() {
  if (cachedReleaseTarget) return cachedReleaseTarget;

  const currentHeadHash = getGitHash('HEAD');
  const historyOutput = runGit('git rev-list --max-count=20 HEAD');

  if (!historyOutput) {
    cachedReleaseTarget = {
      targetRef: 'HEAD',
      targetHash: currentHeadHash,
      currentHeadHash,
    };
    return cachedReleaseTarget;
  }

  const revisions = historyOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const revision of revisions) {
    const files = getCommitFiles(revision);
    if (files.length === 0) continue;

    const hasNonReleaseMetaFiles = files.some((filePath) => !isReleaseMetaOnlyFile(filePath));
    if (hasNonReleaseMetaFiles) {
      cachedReleaseTarget = {
        targetRef: revision,
        targetHash: getGitHash(revision),
        targetCommitTimestamp: getGitCommitTimestamp(revision),
        currentHeadHash,
      };
      return cachedReleaseTarget;
    }
  }

  cachedReleaseTarget = {
    targetRef: 'HEAD',
    targetHash: currentHeadHash,
    targetCommitTimestamp: getGitCommitTimestamp('HEAD'),
    currentHeadHash,
  };
  return cachedReleaseTarget;
}

// Генерируем версию (всегда по Москве UTC+3)
function generateVersion(releaseTarget) {
  // Используем timestamp meaningful commit, чтобы локальный rebuild и CI
  // давали одинаковую runtime-версию и одинаковые hashed bundles.
  const sourceDate = releaseTarget?.targetCommitTimestamp
    ? new Date(releaseTarget.targetCommitTimestamp)
    : new Date();
  const moscowDate = new Date(sourceDate.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));

  const year = moscowDate.getFullYear();
  const month = String(moscowDate.getMonth() + 1).padStart(2, '0');
  const day = String(moscowDate.getDate()).padStart(2, '0');
  const hour = String(moscowDate.getHours()).padStart(2, '0');
  const minute = String(moscowDate.getMinutes()).padStart(2, '0');

  const date = `${year}.${month}.${day}`;
  const time = `${hour}${minute}`;
  const hash = releaseTarget?.targetHash;

  // Формат: 2025.12.12.1423.abc1234 (всегда дата + время + hash если есть)
  return hash ? `${date}.${time}.${hash}` : `${date}.${time}`;
}

// Обновляем версию в файле
function updateVersion() {
  const releaseTarget = resolveReleaseTargetRef();
  const newVersion = generateVersion(releaseTarget);

  if (
    releaseTarget.targetHash &&
    releaseTarget.currentHeadHash &&
    releaseTarget.targetHash !== releaseTarget.currentHeadHash
  ) {
    console.log(
      `ℹ️ Using meaningful release commit ${releaseTarget.targetHash} instead of meta-only HEAD ${releaseTarget.currentHeadHash}`,
    );
  }

  // 1. Обновляем APP_VERSION в heys_app_v12.js
  let content = fs.readFileSync(APP_FILE, 'utf8');
  const versionRegex = /const APP_VERSION = '[^']+'/;

  if (versionRegex.test(content)) {
    content = content.replace(versionRegex, `const APP_VERSION = '${newVersion}'`);
    fs.writeFileSync(APP_FILE, content);
    console.log(`✅ APP_VERSION updated to: ${newVersion}`);
  } else {
    console.log('ℹ️ APP_VERSION not found in heys_app_v12.js — legacy standalone entry skipped');
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
    hash: releaseTarget.targetHash || 'unknown'
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
    console.log('ℹ️ heys_app_v12.js not referenced in index.html — legacy cache-busting skipped');
  }

  return newVersion;
}

updateVersion();
