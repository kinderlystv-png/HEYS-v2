'use strict';

/**
 * Срез исходников приложения: поиск и чтение кода прямо из разговора.
 *
 * Зачем это есть. На вопрос «как в приложении считается белок» отвечать по
 * пересказам нельзя: пересказ устаревает молча. Репозиторий приватный, а в
 * облачной сессии нет ни диска, ни ключей, поэтому источник кода — архив
 * текстовых исходников, который сборщик кладёт в приватный бакет при каждом
 * выкате (scripts/ci/build-source-index.mjs).
 *
 * Почему не GitHub API. Их поиск по коду не индексирует файлы больше 384 КБ,
 * а логика HEYS живёт ровно в таких: heys_day_bundle_v1.js (827 КБ),
 * heys_storage_supabase_v1.js (824 КБ), heys_fingers_bundle_v1.js (1,2 МБ).
 * Доступ был бы, а поиск в главных файлах — вслепую.
 *
 * Почему архив не распаковывается на диск. У функции 512 МБ и tmpfs, который
 * считается в ту же память: распакованный срез — около 75 МБ, и держать его
 * целиком незачем. Архив (14 МБ) лежит в памяти процесса между вызовами, а
 * каждый поиск проходит его потоком, разбирая tar на лету. Замер на боевом
 * срезе: полный проход 0,6 с при пике 127 МБ.
 *
 * Главный риск, ради которого здесь есть ранжирование. Поиск по «proteinPct»
 * первыми выдаёт фикстуры — .github/skills/.../examples и TESTS/*. В примере
 * белок делится на 4, а в боевом heys_day_calculations.js — на 3 (NET Atwater,
 * TEF уже внутри). Ответ по фикстуре выглядит подтверждённым кодом и при этом
 * неверен, поэтому каждая находка несёт вид файла, а боевые пути идут выше.
 */

const crypto = require('node:crypto');
const zlib = require('node:zlib');

const DEFAULT_ENDPOINT = 'https://storage.yandexcloud.net';
const DEFAULT_BUCKET = 'heys-backups';
const DEFAULT_PREFIX = 'source-index';
const REGION = 'ru-central1';

/** Потолки ответа: разговор не должен утонуть в выдаче. */
const MAX_HITS = 40;
const MAX_LINE_CHARS = 240;
/** Файлы крупнее в поиске не разбираются построчно — это собранные артефакты. */
const MAX_SCAN_FILE = 3 * 1024 * 1024;
/** Окно чтения по умолчанию и его потолок. */
const DEFAULT_READ_LINES = 80;
const MAX_READ_LINES = 400;

/**
 * Вид файла. Не украшение: по нему видно, боевой это код или фикстура, и он же
 * задаёт порядок выдачи. Порядок проверок важен — тест внутри apps/web должен
 * остаться тестом.
 */
function classifyPath(path) {
  const p = String(path || '');
  if (/(^|\/)(TESTS|__tests__|__mocks__)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p)) {
    return { kind: 'тест', rank: 2 };
  }
  if (/(^|\/)(examples|fixtures|__fixtures__)\//.test(p) || p.startsWith('.github/skills/')) {
    return { kind: 'пример', rank: 3 };
  }
  if (/\.md$/i.test(p)) return { kind: 'документация', rank: 2 };
  if (/\.(json|ya?ml|sh|toml|cfg|conf)$/i.test(p)) return { kind: 'конфигурация', rank: 2 };
  if (/\.(js|mjs|cjs|jsx|ts|tsx|sql|py|css|html)$/i.test(p)) return { kind: 'код', rank: 0 };
  return { kind: 'прочее', rank: 3 };
}

/**
 * Боевой код приложения важнее вспомогательного. Внутри одного вида порядок
 * задаётся этим: спрашивают про приложение — сначала показываем приложение.
 */
function areaRank(path) {
  const p = String(path || '');
  if (p.startsWith('apps/web/') || p.startsWith('apps/mobile/src/')) return 0;
  if (p.startsWith('packages/') || p.startsWith('apps/landing/')) return 1;
  if (p.startsWith('yandex-cloud-functions/') || p.startsWith('database/')) return 1;
  if (p.startsWith('scripts/') || p.startsWith('.github/')) return 3;
  return 2;
}

function sortHits(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.area !== b.area) return a.area - b.area;
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  return a.line - b.line;
}

/** Подпись запроса к Object Storage. Одна на GET, тело всегда пустое. */
function signedHeaders({ method = 'GET', host, path, accessKeyId, secretAccessKey, nowMs }) {
  const now = new Date(nowMs);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const emptyHash = crypto.createHash('sha256').update('').digest('hex');

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaderNames = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    method, path, '', canonicalHeaders, signedHeaderNames, emptyHash,
  ].join('\n');

  const scope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), REGION), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
    'x-amz-content-sha256': emptyHash,
    'x-amz-date': amzDate,
    Host: host,
  };
}

function defaultRequest({ url, headers }) {
  const https = require('node:https');
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request({
      method: 'GET',
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      headers,
      timeout: 25000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Разбор tar в потоке. Формат простой: заголовок 512 байт, имя в первых ста,
 * размер восьмеричным числом. Отдельная библиотека сюда не берётся сознательно:
 * у функции сейчас ноль зависимостей и образ 400 КБ, а холодный старт этого
 * коннектора виден в разговоре.
 */
function readTar(buffer, onEntry) {
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) { offset += 512; continue; }
    const sizeField = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = parseInt(sizeField || '0', 8);
    const type = String.fromCharCode(header[156]);
    offset += 512;
    if (!Number.isFinite(size) || size < 0) return;
    if (type === '0' || type === '\0') {
      const stop = onEntry(name, buffer.subarray(offset, offset + size));
      if (stop === true) return;
    }
    offset += Math.ceil(size / 512) * 512;
  }
}

function inflate(archive) {
  return zlib.gunzipSync(archive, { maxOutputLength: 256 * 1024 * 1024 });
}

function trimLine(line) {
  const clean = String(line).replace(/\s+$/, '');
  return clean.length > MAX_LINE_CHARS ? `${clean.slice(0, MAX_LINE_CHARS)}…` : clean;
}

/**
 * Поиск по срезу. Регулярка приходит уже собранной: строить её из пользо-
 * вательской строки здесь нельзя — кривая маска повесила бы функцию.
 */
function searchArchive(archive, { pattern, pathPrefix = '', maxHits = MAX_HITS } = {}) {
  const tar = inflate(archive);
  const hits = [];
  let scanned = 0;
  let skippedBig = 0;

  readTar(tar, (name, content) => {
    if (pathPrefix && !name.startsWith(pathPrefix)) return false;
    scanned += 1;
    if (content.length > MAX_SCAN_FILE) { skippedBig += 1; return false; }
    const text = content.toString('utf8');
    if (!pattern.test(text)) { pattern.lastIndex = 0; return false; }
    pattern.lastIndex = 0;

    const { kind, rank } = classifyPath(name);
    const area = areaRank(name);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      pattern.lastIndex = 0;
      if (!pattern.test(lines[i])) continue;
      hits.push({ path: name, line: i + 1, text: trimLine(lines[i]), kind, rank, area });
      if (hits.length > maxHits * 4) break;
    }
    return false;
  });

  hits.sort(sortHits);
  const shown = hits.slice(0, maxHits);
  return {
    hits: shown,
    total: hits.length,
    truncated: hits.length > shown.length,
    scanned,
    skipped_big: skippedBig,
  };
}

/** Чтение файла окном строк: целые файлы по 800 КБ в разговор не отдаются. */
function readFromArchive(archive, { path, fromLine = 1, lines = DEFAULT_READ_LINES } = {}) {
  const tar = inflate(archive);
  let found = null;
  readTar(tar, (name, content) => {
    if (name !== path) return false;
    found = content.toString('utf8');
    return true;
  });
  if (found === null) return null;

  const all = found.split('\n');
  const count = Math.min(Math.max(1, lines), MAX_READ_LINES);
  const start = Math.max(1, fromLine);
  const slice = all.slice(start - 1, start - 1 + count);
  return {
    path,
    kind: classifyPath(path).kind,
    from_line: start,
    to_line: Math.min(all.length, start - 1 + slice.length),
    total_lines: all.length,
    text: slice.map((l, i) => `${start + i}\t${l}`).join('\n'),
    truncated: start - 1 + slice.length < all.length,
  };
}

/** Список файлов по префиксу — чтобы понять устройство папки перед чтением. */
function listArchive(archive, { pathPrefix = '', limit = 200 } = {}) {
  const tar = inflate(archive);
  const files = [];
  readTar(tar, (name, content) => {
    if (pathPrefix && !name.startsWith(pathPrefix)) return false;
    files.push({ path: name, bytes: content.length, kind: classifyPath(name).kind });
    return false;
  });
  files.sort((a, b) => (areaRank(a.path) - areaRank(b.path)) || (a.path < b.path ? -1 : 1));
  return { files: files.slice(0, limit), total: files.length, truncated: files.length > limit };
}

/**
 * Клиент среза. Архив кэшируется в памяти процесса: пока контейнер жив,
 * повторный вопрос не тянет 14 МБ заново. Свежесть проверяется по манифесту —
 * он маленький, и по нему же в ответе видно, от какого коммита срез.
 */
function createSourceIndexClient({
  accessKeyId, secretAccessKey,
  endpoint = DEFAULT_ENDPOINT, bucket = DEFAULT_BUCKET, prefix = DEFAULT_PREFIX,
  request = defaultRequest, nowMs = () => Date.now(), cacheTtlMs = 5 * 60 * 1000,
} = {}) {
  let cache = null; // { commit, archive, manifest, checkedAt }

  async function get(key) {
    const url = `${endpoint}/${bucket}/${key}`;
    const target = new URL(url);
    const headers = signedHeaders({
      host: target.host,
      path: target.pathname,
      accessKeyId,
      secretAccessKey,
      nowMs: nowMs(),
    });
    const res = await request({ url, headers });
    return { status: Number(res && res.status) || 0, body: (res && res.body) || Buffer.alloc(0) };
  }

  async function loadManifest() {
    const res = await get(`${prefix}/latest.json`);
    if (res.status !== 200) {
      return { ok: false, status: res.status };
    }
    try {
      return { ok: true, manifest: JSON.parse(res.body.toString('utf8')) };
    } catch (e) {
      return { ok: false, status: 0, error: 'манифест среза повреждён' };
    }
  }

  /** Архив в памяти: свежесть перепроверяется не чаще раза в cacheTtlMs. */
  async function ensureArchive() {
    const now = nowMs();
    if (cache && now - cache.checkedAt < cacheTtlMs) return { ok: true, ...cache };

    const m = await loadManifest();
    if (!m.ok) {
      if (cache) return { ok: true, ...cache, stale: true };
      return { ok: false, status: m.status, error: m.error };
    }
    const commit = String(m.manifest.commit || '');
    if (cache && cache.commit === commit) {
      cache.checkedAt = now;
      cache.manifest = m.manifest;
      return { ok: true, ...cache };
    }
    const res = await get(`${prefix}/latest.tar.gz`);
    if (res.status !== 200) {
      if (cache) return { ok: true, ...cache, stale: true };
      return { ok: false, status: res.status };
    }
    cache = { commit, archive: res.body, manifest: m.manifest, checkedAt: now };
    return { ok: true, ...cache };
  }

  return {
    ensureArchive,
    async search(opts) {
      const state = await ensureArchive();
      if (!state.ok) return { ok: false, status: state.status, error: state.error };
      return { ok: true, manifest: state.manifest, ...searchArchive(state.archive, opts) };
    },
    async read(opts) {
      const state = await ensureArchive();
      if (!state.ok) return { ok: false, status: state.status, error: state.error };
      const found = readFromArchive(state.archive, opts);
      return found ? { ok: true, manifest: state.manifest, ...found } : { ok: true, manifest: state.manifest, missing: true };
    },
    async list(opts) {
      const state = await ensureArchive();
      if (!state.ok) return { ok: false, status: state.status, error: state.error };
      return { ok: true, manifest: state.manifest, ...listArchive(state.archive, opts) };
    },
  };
}

module.exports = {
  DEFAULT_ENDPOINT,
  DEFAULT_BUCKET,
  DEFAULT_PREFIX,
  MAX_HITS,
  MAX_READ_LINES,
  classifyPath,
  areaRank,
  signedHeaders,
  readTar,
  searchArchive,
  readFromArchive,
  listArchive,
  createSourceIndexClient,
};
