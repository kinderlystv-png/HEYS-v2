'use strict';

/**
 * Вложения задачника: файл из разговора кладётся в приватный репозиторий
 * `tasks-assets`, а в карточку на доске уходит одна вложенная строка со
 * ссылкой на него.
 *
 * Почему отдельный репозиторий и отдельный токен: решение владельца от
 * 2026-08-03 (`~/tasks/docs/вложения-в-доску.md`). Токен на заливку может
 * испортить только папку со скринами, а не весь задачник. Мак подтягивает
 * этот репозиторий в `assets/` и показывает файлы из клона — публичных ссылок
 * в карточке нет и быть не может, репозиторий приватный.
 *
 * Токен живёт в Lockbox и попадает сюда через process.env при cold start. Он
 * не принимается аргументом инструмента, не возвращается в ответе и не
 * попадает в текст ошибки: `scrubToken` — последняя страховка на случай, если
 * GitHub однажды вернёт его в теле ответа (так делают некоторые прокси).
 * Утечка секрета в переписку необратима: разговор уезжает в стенограмму и
 * дальше в git.
 */

const MOSCOW_TZ = 'Europe/Moscow';

const DEFAULT_REPO = 'kinderlystv-png/tasks-assets';
const DEFAULT_BRANCH = 'main';

/**
 * Картинки и документы обрабатываются по-разному, и разница честная, а не
 * косметическая. Сжимать картинку здесь нечем: функция работает без внешних
 * зависимостей, графических библиотек в ней нет, и «сжатие» на этой стороне
 * было бы заглушкой. Поэтому сжатие остаётся там, где лежат сами байты и есть
 * чем их жать, а сюда картинка обязана прийти уже ужатой — это проверяется
 * потолком и отказом с прямым указанием, до чего дожать.
 *
 * Документ жать нельзя вовсе: pdf со счётом или скан после пережатия
 * перестаёт быть документом. Он кладётся как есть, и потолок у него другой.
 */
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic']);
const DOC_EXTS = new Set([
  'pdf', 'md', 'txt', 'csv', 'json', 'xlsx', 'xls', 'docx', 'doc', 'pptx', 'rtf', 'ics', 'zip',
]);

/** Цель по документу — около 100 КБ; потолок с запасом на неудачное фото. */
const IMAGE_MAX_BYTES = 160 * 1024;
/** Потолок документа — предел полезной нагрузки функции, а не пожелание. */
const DOC_MAX_BYTES = 512 * 1024;

/** Строка вложения под задачей — тот же вид, что у `см:`. */
const ATTACH_LINE_RE = /^\s*(?:[-*]\s*)?вложение:\s*(\S+)\s*(?:—\s*(.*))?$/i;

/** Путь вложения внутри репозитория задачника. */
const ASSET_PATH_RE = /^assets\/\d{4}-\d{2}\/[a-z0-9][a-z0-9._-]*$/;

function moscowStamp(nowMs) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]),
  );
  // hour12:false в некоторых средах отдаёт «24» вместо «00» за полночь.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    month: `${parts.year}-${parts.month}`,
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}${parts.minute}`,
  };
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

/**
 * Слаг латиницей. Кириллица в пути пережила бы и git, и доску, но не любой
 * инструмент по дороге — от клиента S3 до чужого редактора. Цена
 * транслитерации — ноль, цена сломанного пути — потерянный файл.
 */
function slugify(text, { fallback = 'file' } = {}) {
  const lowered = String(text || '').toLowerCase();
  let out = '';
  for (const ch of lowered) {
    if (Object.prototype.hasOwnProperty.call(TRANSLIT, ch)) out += TRANSLIT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += '-';
  }
  out = out.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return out || fallback;
}

function extensionOf(filename) {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(String(filename || '').trim());
  return match ? match[1].toLowerCase() : '';
}

/** Картинка это или документ — по расширению; третьего варианта нет. */
function classifyKind(filename) {
  const ext = extensionOf(filename);
  if (IMAGE_EXTS.has(ext)) return { kind: 'image', ext, maxBytes: IMAGE_MAX_BYTES };
  if (DOC_EXTS.has(ext)) return { kind: 'document', ext, maxBytes: DOC_MAX_BYTES };
  return { kind: null, ext, maxBytes: 0 };
}

/**
 * Путь по соглашению: `assets/ГГГГ-ММ/ГГГГ-ММ-ДД-ЧЧММ-слаг.ext`. Раскладка по
 * месяцам сделана заранее под будущую чистку: срок жизни вложений пока не
 * назначен, но разгребать плоскую папку на тысячу файлов потом будет нечем.
 */
function assetPath({ filename, caption = '', nowMs = Date.now() }) {
  const { ext } = classifyKind(filename);
  const stamp = moscowStamp(nowMs);
  const base = String(filename || '').replace(/\.[A-Za-z0-9]{1,8}$/, '');
  const slug = slugify(caption || base, { fallback: 'file' });
  return `assets/${stamp.month}/${stamp.day}-${stamp.time}-${slug}${ext ? `.${ext}` : ''}`;
}

/**
 * Строка для карточки. Подпись идёт после пути и остаётся читаемой, даже если
 * файл потеряется: пункт «вложение: … — счёт от Ани» без файла всё ещё
 * говорит, что за файл там был, а голая ссылка — нет.
 */
function buildAttachLine({ path, caption = '' }) {
  const note = String(caption || '').replace(/\s+/g, ' ').trim();
  return `вложение: ${path}${note ? ` — ${note}` : ''}`;
}

function parseAttachLine(line) {
  const match = ATTACH_LINE_RE.exec(String(line || ''));
  if (!match) return null;
  const path = match[1];
  if (!ASSET_PATH_RE.test(path)) return null;
  const { kind } = classifyKind(path);
  return { path, caption: (match[2] || '').trim(), kind };
}

/**
 * Вырезать секрет из любого текста, который уходит наружу. Работает и по
 * куску токена: подстрока в 12 символов от боевого PAT уже достаточна, чтобы
 * считать его засвеченным.
 */
function scrubToken(text, token) {
  let out = String(text == null ? '' : text);
  const secret = String(token || '');
  if (secret.length >= 8) {
    out = out.split(secret).join('«токен скрыт»');
    for (let len = secret.length; len >= 12; len -= 1) {
      const part = secret.slice(0, len);
      if (out.includes(part)) out = out.split(part).join('«токен скрыт»');
    }
  }
  // Токены GitHub узнаваемы по префиксу — вырезаем и чужой, если он как-то
  // оказался в ответе постороннего прокси.
  return out.replace(/\b(gh[pousr]|github_pat)_[A-Za-z0-9_]{10,}/g, '«токен скрыт»');
}

function base64Bytes(base64) {
  const clean = String(base64 || '').replace(/\s+/g, '');
  if (!clean) return 0;
  const padding = (clean.match(/=+$/) || [''])[0].length;
  return Math.max(0, Math.floor(clean.length * 3 / 4) - padding);
}

function isValidBase64(base64) {
  const clean = String(base64 || '').replace(/\s+/g, '');
  return clean.length > 0 && clean.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(clean);
}

/**
 * Клиент GitHub Contents API. Транспорт приходит аргументом: тесты подставляют
 * свой и до сети не доходят вовсе — заливать проверочный мусор в боевой
 * репозиторий нельзя.
 */
function createAssetsClient({ token, repo = DEFAULT_REPO, branch = DEFAULT_BRANCH, request } = {}) {
  const doRequest = request || defaultRequest;

  function scrub(text) {
    return scrubToken(text, token);
  }

  async function putFile({ path, base64, message }) {
    const url = `https://api.github.com/repos/${repo}/contents/${encodeURI(path)}`;
    const res = await doRequest({
      method: 'PUT',
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'heys-mcp-tasks-assets',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, content: base64, branch }),
    });

    const status = Number(res && res.status) || 0;
    if (status === 201 || status === 200) {
      return { ok: true, status, path };
    }
    // Наружу уходит статус и своя формулировка, а не тело ответа GitHub: в теле
    // при некоторых ошибках эхом возвращается заголовок запроса.
    return { ok: false, status, error: scrub(describeFailure(status)) };
  }

  return { putFile, repo, branch, scrub };
}

function describeFailure(status) {
  if (status === 401) return 'GitHub не принял доступ к репозиторию вложений (401): токен просрочен или отозван.';
  if (status === 403) return 'GitHub отказал в записи (403): у токена нет прав Contents на этот репозиторий.';
  if (status === 404) return 'GitHub не нашёл репозиторий вложений (404): проверь имя репозитория и доступ токена.';
  if (status === 409 || status === 422) return `GitHub отклонил запись (${status}): такой файл уже есть или ветка не та.`;
  if (status >= 500) return `GitHub временно недоступен (${status}).`;
  return `GitHub отклонил заливку (${status || 'нет ответа'}).`;
}

function defaultRequest({ method, url, headers, body }) {
  const https = require('node:https');
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request({
      method,
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: 20000,
    }, (res) => {
      // Тело читаем и выбрасываем: в ответ оно не попадает никогда.
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => reject(new Error(scrubToken(err && err.message, headers && headers.Authorization))));
    req.end(body);
  });
}

module.exports = {
  DEFAULT_REPO,
  DEFAULT_BRANCH,
  IMAGE_EXTS,
  DOC_EXTS,
  IMAGE_MAX_BYTES,
  DOC_MAX_BYTES,
  ATTACH_LINE_RE,
  ASSET_PATH_RE,
  slugify,
  extensionOf,
  classifyKind,
  assetPath,
  buildAttachLine,
  parseAttachLine,
  scrubToken,
  base64Bytes,
  isValidBase64,
  createAssetsClient,
};
