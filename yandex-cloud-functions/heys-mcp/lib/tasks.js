'use strict';

/**
 * Задачник в KV: markdown-файлы репозитория `~/tasks` как ключи клиента.
 *
 * Зачем это здесь. Задачник жил в git, и запись в него требовала доступа к
 * папке на маке. С телефона такого доступа нет никогда, поэтому правки
 * складывались в очередь и ждали, пока откроют ноут. Перенос хранилища в
 * client_kv_store снимает это: писать можно из любой сессии тем же путём,
 * которым куратор ведёт дневники клиентов.
 *
 * Что осталось прежним: формат markdown, структура папок, доска. Файлы на
 * диске становятся зеркалом, которое выкладывает пуллер, а источник правды —
 * значение ключа здесь.
 *
 * Главный инвариант: инструмент никогда не принимает текст файла целиком.
 * Только операция — дописать строку, заменить блок по якорю. Целиковая запись
 * — единственный способ молча затереть правку соседней сессии, и он закрыт
 * тем, что такого аргумента у инструментов просто нет.
 *
 * Модуль не делает сетевых вызовов: всё тестируется без прод-доступа.
 */

const KEY_PREFIX = 'heys_tasks_';
const INDEX_KEY = `${KEY_PREFIX}index`;

/** Папки задачника, у которых файл именуется датой или месяцем. */
const DATED_DIRS = new Set(['days', 'journal', 'transcript', 'money', 'archive']);

/** Файлы в корне репозитория, которые входят в задачник. */
const ROOT_FILES = new Set(['NOW.md', 'INBOX.md', 'GOALS.md', 'README.md', 'CLAUDE.md', 'habits.md']);

/**
 * Путь → ключ. Разделитель пути превращается в подчёркивание, регистр
 * опускается: ключи KV живут в одном плоском пространстве, и `Projects/HEYS.md`
 * с `projects/heys.md` обязаны попадать в один и тот же ключ, иначе появится
 * второй файл-двойник, которого нет на диске.
 */
function keyForPath(path) {
  const clean = normalizePath(path);
  if (!clean) return null;
  const withoutExt = clean.replace(/\.md$/i, '');
  return `${KEY_PREFIX}${withoutExt.replace(/[/\\]+/g, '_').toLowerCase()}`;
}

/** Обратное преобразование: ключ → путь. Нужно пуллеру и выдаче поиска. */
function pathForKey(key) {
  if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX)) return null;
  const tail = key.slice(KEY_PREFIX.length);
  if (!tail || tail === 'index') return null;

  const parts = tail.split('_');
  const dir = parts[0];
  if (DATED_DIRS.has(dir) || dir === 'projects' || dir === 'docs') {
    return `${dir}/${parts.slice(1).join('_')}.md`;
  }
  const root = [...ROOT_FILES].find((name) => name.replace(/\.md$/i, '').toLowerCase() === tail);
  return root || `${tail}.md`;
}

/**
 * Нормализация пути. Отсекаем всё, что уводит за пределы задачника: абсолютные
 * пути, `..`, ведущие слеши. Инструмент получает путь от модели, а не от
 * файловой системы, поэтому проверять его обязательно.
 */
function normalizePath(path) {
  const raw = String(path || '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (raw.startsWith('/') || /^[a-z]:/i.test(raw)) return null;
  const segments = [];
  for (const segment of raw.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') return null;
    segments.push(segment);
  }
  if (!segments.length) return null;
  const joined = segments.join('/');
  return /\.md$/i.test(joined) ? joined : `${joined}.md`;
}

/**
 * Сегодняшняя дата по Москве.
 *
 * Задачник живёт по МСК: слоты в `days/`, метки `^` и операции в деньгах.
 * `toISOString()` считает по UTC, и с полуночи до трёх часов ночи по Москве
 * такая «сегодняшняя» дата молча уезжает на вчера — прямо в файл дня, где
 * ошибку на сутки уже никто не заметит. Поэтому дата всегда берётся с
 * указанием пояса, а не из смещения сервера.
 */
const MOSCOW_TZ = 'Europe/Moscow';

function moscowDate(nowMs = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Пустой файл — валидное состояние: месяц журнала мог ещё не начаться. */
function emptyFile(path) {
  return { path: normalizePath(path), text: '', rev: 0, updatedAt: 0 };
}

/**
 * Значение ключа приводится к одной форме независимо от того, что там лежит.
 * Старые записи могли быть простой строкой — принимаем и её, чтобы миграция
 * формата не требовала одномоментной перезаписи всего задачника.
 */
function ensureFile(raw, path) {
  if (typeof raw === 'string') {
    return { path: normalizePath(path), text: raw, rev: 1, updatedAt: 0 };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyFile(path);
  return {
    path: normalizePath(raw.path || path),
    text: typeof raw.text === 'string' ? raw.text : '',
    rev: Number(raw.rev) || 0,
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

/** Следующая ревизия файла. На ней держится отказ при устаревшем якоре. */
function bumpFile(file, text, nowMs) {
  return {
    path: file.path,
    text,
    rev: (Number(file.rev) || 0) + 1,
    updatedAt: nowMs,
  };
}

/**
 * Индекс задачника: путь → ревизия и время правки. Нужен, чтобы пуллер знал,
 * что перекачивать, а поиск — какие ключи читать, не вычитывая весь задачник
 * ради одного слова.
 */
function ensureIndex(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { files: {}, updatedAt: 0 };
  const files = (raw.files && typeof raw.files === 'object' && !Array.isArray(raw.files)) ? raw.files : {};
  const out = {};
  for (const [path, meta] of Object.entries(files)) {
    const normalized = normalizePath(path);
    if (!normalized || !meta || typeof meta !== 'object') continue;
    out[normalized] = { rev: Number(meta.rev) || 0, updatedAt: Number(meta.updatedAt) || 0 };
  }
  return { files: out, updatedAt: Number(raw.updatedAt) || 0 };
}

function withIndexEntry(index, file, nowMs) {
  return {
    files: { ...index.files, [file.path]: { rev: file.rev, updatedAt: file.updatedAt } },
    updatedAt: nowMs,
  };
}

/**
 * Основа слова: у длинных слов отбрасываются два последних символа.
 *
 * Это нужно для русского. Человек ищет «версия», а в журнале записано
 * «версию»; точное вхождение такую запись не найдёт, и поиск честно ответит
 * «ничего нет» там, где ответ есть. Полноценная лемматизация здесь избыточна —
 * задачник ищется по своим же формулировкам, а не по чужим текстам.
 */
function stemWord(word) {
  return word.length > 5 ? word.slice(0, word.length - 2) : word;
}

function lineMatchesTerm(line, term) {
  if (line.includes(term)) return true;
  const stem = stemWord(term);
  if (stem.length < 4) return false;
  return line.split(/[^\p{L}\p{N}]+/u).some((word) => word && stemWord(word).startsWith(stem));
}

/**
 * Значимые слова из живой фразы.
 *
 * Зачем это на сервере. Инструмент, который просит «тему», перекладывает на
 * модель решение «что искать» — и ровно на этом шаге она промахивается: ищет
 * по «поставь» и «надо», не находит ничего и начинает перебирать запросы по
 * одному. Разбор фразы здесь делает этот шаг детерминированным: модель отдаёт
 * то, что услышала, а какие слова значимы — решает код.
 *
 * Имена, даты, времена и теги весят больше обычных слов: именно они привязывают
 * фразу к конкретной задаче, а не к десятку похожих.
 */
const TOPIC_STOP_WORDS = new Set([
  'в', 'во', 'на', 'и', 'а', 'но', 'с', 'со', 'к', 'ко', 'по', 'за', 'из', 'от', 'до',
  'для', 'у', 'о', 'об', 'про', 'при', 'что', 'чтобы', 'как', 'так', 'это', 'этот',
  'эта', 'эти', 'том', 'тот', 'там', 'тут', 'здесь', 'я', 'ты', 'он', 'она', 'они',
  'мы', 'вы', 'мне', 'меня', 'мой', 'моя', 'мои', 'твой', 'наш', 'его', 'её', 'их',
  'себе', 'себя', 'ну', 'же', 'ли', 'бы', 'вот', 'ещё', 'еще', 'уже', 'только',
  'очень', 'потом', 'сейчас', 'надо', 'нужно', 'хочу', 'хочет', 'давай', 'давайте',
  'сделай', 'сделать', 'поставь', 'поставить', 'запиши', 'записать', 'добавь',
  'добавить', 'посмотри', 'посмотреть', 'скажи', 'сказать', 'напомни', 'напомнить',
  'найди', 'найти', 'покажи', 'показать', 'глянь', 'проверь', 'проверить',
  // Формы «мы»: «давай посмотрим», «поставим на понедельник». Перечислены
  // списком, а не отсечены основой: основа «сдела» съела бы «сделку», а
  // «показ» — настоящий показ в студии.
  'посмотрим', 'посмотрю', 'поставим', 'поставлю', 'запишем', 'добавим',
  'проверим', 'напомним', 'скажем', 'найдём', 'найдем', 'покажем', 'сделаем',
  'будет', 'было', 'был', 'была', 'быть', 'есть', 'нет', 'не', 'да', 'или', 'если',
  'когда', 'где', 'куда', 'кто', 'какой', 'какая', 'какие', 'сколько', 'можно',
  'может', 'вообще', 'просто', 'типа', 'значит',
]);

const DATE_TIME_RE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}\b/g;

/** Адреса задач, встреченные прямо в тексте фразы. */
function findAddresses(text) {
  return [...String(text || '').matchAll(ADDRESS_IN_TEXT_RE)]
    .map((m) => ({ project: m[1].toLowerCase(), hash: m[2].toLowerCase() }));
}

function topicTerms(phrase) {
  const raw = String(phrase || '').trim();
  const terms = [];
  const dropped = [];
  const seen = new Set();
  const push = (word, kind) => {
    const key = String(word).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    terms.push({ word: key, kind });
  };

  for (const match of raw.matchAll(DATE_TIME_RE)) push(match[0], match[0].includes(':') ? 'time' : 'date');
  let rest = raw.replace(DATE_TIME_RE, ' ').replace(ADDRESS_IN_TEXT_RE, ' ');
  for (const match of rest.matchAll(/#([\p{L}\p{N}]+)/gu)) push(match[1], 'tag');
  rest = rest.replace(/#[\p{L}\p{N}]+/gu, ' ');

  const words = rest.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  words.forEach((word, i) => {
    const lower = word.toLowerCase();
    // Заглавная буква не в начале фразы — почти всегда имя или название, и
    // терять его нельзя: по нему находится и человек, и его обязательства.
    const looksLikeName = i > 0 && /^\p{Lu}/u.test(word) && word.length > 2;
    if (!looksLikeName && (TOPIC_STOP_WORDS.has(lower) || lower.length < 3 || /^\d+$/.test(lower))) {
      dropped.push(lower);
      return;
    }
    push(lower, looksLikeName ? 'name' : 'word');
  });

  return { terms, dropped };
}

const TERM_WEIGHT = { name: 2, date: 2, time: 2, tag: 2, word: 1 };

/** Насколько строка отвечает фразе: сколько значимых слов в ней встретилось. */
function matchTerms(haystack, terms) {
  const text = String(haystack || '').toLowerCase();
  let score = 0;
  const hit = [];
  for (const term of terms) {
    if (!lineMatchesTerm(text, term.word)) continue;
    score += TERM_WEIGHT[term.kind] || 1;
    hit.push(term.word);
  }
  return { score, hit };
}

/**
 * Поиск по задачнику. Возвращает совпадения со строками вокруг: запись журнала
 * без соседних строк бесполезна — по ней не видно, о чём шла речь.
 *
 * Регистр игнорируется, запрос разбивается на слова, и строка считается
 * совпавшей, когда содержит их все. Это ближе к тому, как человек ищет
 * («лендинг версия D»), чем точное вхождение фразы.
 */
function searchFiles(files, query, { context = 2, limitPerFile = 5, limit = 40, terms: given = null, any = false } = {}) {
  // `terms` приходит из разбора живой фразы; `any` нужен там же: у фразы из
  // пяти слов строки, где встретились все пять, не бывает, а строка с двумя
  // самыми весомыми — ровно то, что искали.
  const terms = (given && given.length)
    ? given.map((t) => (typeof t === 'string' ? { word: t.toLowerCase(), kind: 'word' } : t))
    : String(query || '').toLowerCase().split(/\s+/).filter(Boolean).map((word) => ({ word, kind: 'word' }));
  if (!terms.length) return [];

  const results = [];
  for (const file of files) {
    if (!file || typeof file.text !== 'string' || !file.text) continue;
    const lines = file.text.split('\n');
    let found = 0;
    for (let i = 0; i < lines.length && found < limitPerFile; i += 1) {
      const { score, hit } = matchTerms(lines[i], terms);
      if (any ? !hit.length : hit.length !== terms.length) continue;
      found += 1;
      results.push({
        path: file.path,
        line: i + 1,
        text: lines[i].trim(),
        score,
        matched: hit,
        context: lines
          .slice(Math.max(0, i - context), Math.min(lines.length, i + context + 1))
          .join('\n'),
      });
      if (!any && results.length >= limit) return results;
    }
  }
  return any ? results.sort((a, b) => b.score - a.score).slice(0, limit) : results;
}

/**
 * Заголовок задачи. Алгоритм повторяет `parse_task` из `~/tasks/build_board.py`
 * буква в букву, и отступать от него нельзя.
 *
 * Причина жёсткая: доска считает идентификатор задачи как
 * `md5("<проект>|<заголовок>")[:6]`, и по этому хэшу пользователь ссылается на
 * задачу в разговоре («heys/0765d3 · …»). Разойдись разбор на один пробел или
 * на срезанное тире — хэш станет другим, ссылка перестанет находить задачу, и
 * правка уедет не туда или не уедет вовсе. Порядок замен, схлопывание пробелов
 * и обрезка тире по краям — часть контракта, а не стиль.
 */
const PRIORITY_RE = /\bP([123])\b/g;
const DUE_RE = /\bdue:(\d{4}-\d{2}-\d{2})/g;
const CREATED_RE = /\^(\d{4}-\d{2}-\d{2})/g;
const TAG_RE = /#([\w\dа-яА-Я]+)/g;

function taskTitle(body) {
  let title = String(body || '').replace(/^\s*-\s*\[[ x>~]\]\s*/i, '');
  for (const rx of [PRIORITY_RE, DUE_RE, CREATED_RE, TAG_RE]) {
    title = title.replace(rx, '');
  }
  return title.replace(/\s{2,}/g, ' ').replace(/^[\s\-–—]+|[\s\-–—]+$/g, '');
}

/** Идентификатор задачи, как его считает доска: md5("<проект>|<заголовок>")[:6]. */
function taskHash(projectKey, title) {
  return require('node:crypto')
    .createHash('md5')
    .update(`${projectKey}|${title}`, 'utf8')
    .digest('hex')
    .slice(0, 6);
}

/** Ключ проекта из пути: `projects/heys.md` → `heys`. Им же хэшируется задача. */
function projectKeyForPath(path) {
  const normalized = normalizePath(path);
  if (!normalized) return null;
  const match = /^projects\/(.+)\.md$/i.exec(normalized);
  return match ? match[1].toLowerCase() : normalized.replace(/\.md$/i, '').toLowerCase();
}

/**
 * Разбор строки задачи в формате задачника:
 * `- [ ] P1 Текст due:2026-08-05 #next #ноут ^2026-08-01`
 */
function parseTaskLine(line) {
  const match = /^(\s*)-\s*\[([ x>~-])\]\s*(.*)$/i.exec(String(line || ''));
  if (!match) return null;
  const body = match[3];
  const priority = /(^|\s)(P[0-9])(\s|$)/.exec(body);
  const due = /(?:^|\s)due:(\S+)/.exec(body);
  const created = /(?:^|\s)\^(\S+)/.exec(body);
  const tags = [...body.matchAll(/(?:^|\s)#([^\s]+)/g)].map((m) => m[1]);
  return {
    indent: match[1].length,
    done: match[2].toLowerCase() === 'x',
    waiting: match[2] === '>',
    priority: priority ? priority[2] : null,
    due: due ? due[1] : null,
    created: created ? created[1] : null,
    tags,
    title: taskTitle(body),
    raw: line,
  };
}

/**
 * Задачи файла вместе с вложенными строками. Вложенное — это контекст задачи
 * (`ждём:`, `при встрече:`, `открыто:`, подпункты), и без него задача читается
 * неверно: половина смысла живёт именно там.
 */
function parseTasks(file) {
  const lines = String((file && file.text) || '').split('\n');
  const tasks = [];
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseTaskLine(lines[i]);
    if (parsed && parsed.indent === 0) {
      current = { ...parsed, path: file.path, line: i + 1, children: [] };
      tasks.push(current);
      continue;
    }
    if (!current) continue;
    const text = lines[i].trim();
    if (!text) { current = null; continue; }
    // Маркер списка снимается: `ждём:`, `при встрече:` и `открыто:` ищутся по
    // началу строки, и оставленный дефис прятал бы их от всех разборов.
    if (lines[i].startsWith(' ') || lines[i].startsWith('\t')) {
      current.children.push(text.replace(/^[-*]\s+/, ''));
    }
  }
  return tasks;
}

/**
 * Адрес задачи — тот же, которым она адресуется на доске.
 *
 * Возвращается из всего, что читает задачи, и это не удобство: без него
 * каждый, кто хочет потом снять вопрос или поправить срок, обязан повторить у
 * себя разбор заголовка и подсчёт хэша — и рано или поздно разойтись с доской
 * на один пробел. Один раз мы это уже чинили.
 */
function taskAddress(path, title) {
  if (!/^projects\//i.test(String(path || ''))) return { project: null, hash: null, ref: null };
  const project = projectKeyForPath(path);
  const hash = taskHash(project, title);
  return { project, hash, ref: `${project}/${hash}` };
}

/** Открытые вопросы задачника: вложенные строки `открыто:` под задачами. */
function collectOpenQuestions(files) {
  const out = [];
  for (const file of files) {
    for (const task of parseTasks(file)) {
      for (const child of task.children) {
        if (/^открыто:/i.test(child)) {
          out.push({
            path: file.path,
            ...taskAddress(file.path, task.title),
            task: task.title,
            question: child.replace(/^открыто:\s*/i, ''),
          });
        }
      }
    }
  }
  return out;
}

/** Ожидания от людей: вложенные строки `ждём:` и `при встрече:`. */
function collectPeopleThreads(files) {
  const out = [];
  for (const file of files) {
    for (const task of parseTasks(file)) {
      for (const child of task.children) {
        const match = /^(ждём|при встрече):\s*(.*)$/i.exec(child);
        if (match) {
          out.push({
            path: file.path,
            ...taskAddress(file.path, task.title),
            task: task.title,
            kind: match[1].toLowerCase(),
            text: match[2],
          });
        }
      }
    }
  }
  return out;
}

// ── Связи: явная ссылка вместо случайного совпадения слов ────────────────
//
// До этого задача, запись журнала, слот дня и человек были связаны только
// словами: пересечение находилось поиском, то есть случайно. Явная ссылка —
// вложенная строка `см: kinderly/8e3572`, где адрес тот же, которым задача
// адресуется на доске. Формат читается человеком в markdown, доска рисует его
// как обычную вложенную строку и ничего не ломает.
//
// Ссылка хранится в одну сторону, а читается в обе: если А сослался на Б, то
// при разборе Б надо видеть А. Хранить обе стороны — значит держать их в
// согласии при каждой правке, а это лишний способ развести файлы.

/** Адрес задачи: `проект/хэш`. Строгая форма — для аргумента инструмента. */
function parseAddress(value) {
  const match = /^\s*([a-zа-яё0-9][a-zа-яё0-9_-]*)\s*\/\s*([0-9a-f]{6})\s*$/i.exec(String(value || ''));
  return match ? { project: match[1].toLowerCase(), hash: match[2].toLowerCase() } : null;
}

const ADDRESS_IN_TEXT_RE = /([a-zа-яё0-9][a-zа-яё0-9_-]*)\/([0-9a-f]{6})\b/gi;
const REF_LINE_RE = /^\s*(?:[-*]\s*)?см:\s*(.*)$/i;

/**
 * Разбор строки-ссылки. В одной строке может стоять несколько адресов и
 * пояснение словами: `см: kinderly/8e3572, heys/0765d3 — общая смета`.
 */
function parseRefLine(line) {
  const match = REF_LINE_RE.exec(String(line || ''));
  if (!match) return null;
  const refs = [...match[1].matchAll(ADDRESS_IN_TEXT_RE)]
    .map((m) => ({ project: m[1].toLowerCase(), hash: m[2].toLowerCase() }));
  if (!refs.length) return null;
  const note = match[1]
    .replace(ADDRESS_IN_TEXT_RE, '')
    .replace(/^[\s,;·—–-]+|[\s,;·—–-]+$/g, '')
    .trim();
  return { refs, note };
}

/**
 * Ссылка слота дня на задачу. Формат не наш: доска давно читает
 * `- 15:00–17:00 Съёмка · kinderly/8e3572 #фокус` и рисует такой слот
 * кликабельным. Второй способ связать слот с задачей был бы форматом-двойником,
 * поэтому здесь мы просто читаем существующий.
 */
const SLOT_LINE_RE = /^-\s*(?:\[[ x]\]\s*)?(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s+(.+?)\s*$/;

function parseSlotRef(line) {
  const match = SLOT_LINE_RE.exec(String(line || '').trim());
  if (!match) return null;
  // `\b` здесь ставить нельзя: граница слова считается по ASCII, и после
  // кириллического «#фокус» её просто нет — тег оставался бы в строке и ломал
  // разбор адреса.
  const body = match[3].replace(/\s*#[\p{L}\d]+/gu, '').replace(/\s*@[\p{L}\d-]+/gu, '').trim();
  if (!body.includes('·')) return null;
  const tail = body.slice(body.lastIndexOf('·') + 1).trim();
  const ref = parseAddress(tail);
  if (!ref) return null;
  return { ref, title: body.slice(0, body.lastIndexOf('·')).trim(), from: match[1], to: match[2] };
}

/** Ближайший заголовок выше строки — им подписывается ссылка из журнала или дня. */
function nearestHeading(lines, at) {
  for (let i = at; i >= 0; i -= 1) {
    if (/^#{1,6}\s/.test(lines[i])) return lines[i].replace(/^#{1,6}\s*/, '').trim();
  }
  return null;
}

/** Все ссылки задачника: откуда, куда и с каким пояснением. */
function collectLinks(files) {
  const links = [];
  for (const file of files) {
    if (!file || typeof file.text !== 'string' || !file.text) continue;
    const isProject = /^projects\//i.test(file.path || '');
    const projectKey = isProject ? projectKeyForPath(file.path) : null;

    if (isProject) {
      for (const task of parseTasks(file)) {
        for (const child of task.children) {
          const parsed = parseRefLine(child);
          if (!parsed) continue;
          const from = {
            path: file.path,
            line: task.line,
            project: projectKey,
            hash: taskHash(projectKey, task.title),
            title: task.title,
          };
          for (const to of parsed.refs) links.push({ from, to, note: parsed.note });
        }
      }
    }

    // Ссылка вне задачи: запись журнала, слот дня, операция в деньгах.
    const isDay = /^days\//i.test(file.path || '');
    const lines = file.text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (isDay) {
        const slot = parseSlotRef(lines[i]);
        if (slot) {
          links.push({
            from: { path: file.path, line: i + 1, project: null, hash: null, title: `${slot.from}–${slot.to} ${slot.title}` },
            to: slot.ref,
            note: 'слот дня',
          });
          continue;
        }
      }
      if (!REF_LINE_RE.test(lines[i])) continue;
      if (isProject && /^\s/.test(lines[i])) continue; // уже учтена как вложенная строка задачи
      const parsed = parseRefLine(lines[i]);
      if (!parsed) continue;
      const from = {
        path: file.path,
        line: i + 1,
        project: null,
        hash: null,
        title: nearestHeading(lines, i) || (lines[i - 1] || '').trim() || file.path,
      };
      for (const to of parsed.refs) links.push({ from, to, note: parsed.note });
    }
  }
  return links;
}

/** Задача по адресу с доски. Возвращает задачу вместе с её файлом. */
function findTaskByAddress(files, address) {
  if (!address) return null;
  const wanted = `projects/${address.project}.md`.toLowerCase();
  const file = files.find((f) => String(f.path || '').toLowerCase() === wanted);
  if (!file) return null;
  for (const task of parseTasks(file)) {
    if (taskHash(address.project, task.title) === address.hash) {
      return { ...task, project: address.project, hash: address.hash };
    }
  }
  return null;
}

/**
 * Связи задачи в обе стороны. Исходящие идут с разрешённой целью: ссылка на
 * задачу, которой больше нет, — это не связь, а мусор, и он должен быть видно
 * помечен `missing`, а не молча пропущен.
 */
function linksFor(files, address, links = null) {
  const all = links || collectLinks(files);
  const key = `${address.project}/${address.hash}`;
  const outgoing = all
    .filter((l) => l.from.project === address.project && l.from.hash === address.hash)
    .map((l) => {
      const target = findTaskByAddress(files, l.to);
      return {
        ref: `${l.to.project}/${l.to.hash}`,
        note: l.note,
        title: target ? target.title : null,
        path: target ? target.path : null,
        done: target ? target.done : null,
        children: target ? target.children : [],
        missing: !target,
      };
    });
  const incoming = all
    .filter((l) => `${l.to.project}/${l.to.hash}` === key)
    .map((l) => ({
      ref: l.from.project && l.from.hash ? `${l.from.project}/${l.from.hash}` : null,
      path: l.from.path,
      line: l.from.line,
      title: l.from.title,
      note: l.note,
    }));
  return { outgoing, incoming };
}

// ── Дельта: что изменилось с прошлого прохода ────────────────────────────
//
// У каждого файла в индексе есть ревизия, и по ней видно, что файл трогали.
// Но «файл изменился» — слишком грубо, чтобы на этом что-то решать: в проекте
// на полсотни строк это может быть и новая задача, и снятая галочка. Поэтому
// прошлый проход запоминается отпечатком: ревизия, число строк и по задаче —
// её состояние и слепок вложенных строк. Тогда разница читается словами:
// «добавилась задача», «закрылась», «появилась строка ждём:».

const DAY_MS = 24 * 60 * 60 * 1000;

function shortDigest(value) {
  return require('node:crypto').createHash('md5').update(String(value), 'utf8').digest('hex').slice(0, 4);
}

function taskMark(task) {
  if (task.done) return 'x';
  if (task.waiting) return '>';
  return ' ';
}

/** Отпечаток файла — то, что кладётся в память прохода. */
function fileSnapshot(file) {
  const text = String((file && file.text) || '');
  // Считаем непустые строки: пустая строка в конце файла то появляется, то
  // исчезает от разных операций записи, и на счёте всех строк хвост дописанного
  // уезжал бы на строку.
  const snapshot = {
    rev: Number(file.rev) || 0,
    updatedAt: Number(file.updatedAt) || 0,
    lines: text ? text.split('\n').filter((l) => l.trim()).length : 0,
  };
  if (/^projects\//i.test(file.path || '')) {
    const projectKey = projectKeyForPath(file.path);
    snapshot.tasks = {};
    for (const task of parseTasks(file)) {
      snapshot.tasks[taskHash(projectKey, task.title)] = `${taskMark(task)}${shortDigest(task.children.join('\n'))}`;
    }
  }
  return snapshot;
}

const MARK_WORD = { ' ': 'открыта', x: 'закрыта', '>': 'ждёт', '~': 'в работе' };

/**
 * Разница между отпечатком прошлого прохода и текущим файлом.
 *
 * Хвост дописанных строк берётся по числу строк: журнал, день и деньги всегда
 * дописываются в конец, и это самый дешёвый способ показать «что нового», не
 * храня прошлый текст целиком. Строк стало меньше — значит правили середину, и
 * тогда честнее сказать «изменился», чем показать неверный хвост.
 */
function diffFile(prev, file, { tailLimit = 12 } = {}) {
  const next = fileSnapshot(file);
  const out = {
    path: file.path,
    status: prev ? 'changed' : 'added',
    rev_from: prev ? prev.rev : 0,
    rev_to: next.rev,
    appended: [],
    added_tasks: [],
    closed_tasks: [],
    changed_tasks: [],
    gone_tasks: [],
  };

  const filled = String(file.text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const prevLines = prev ? Number(prev.lines) || 0 : 0;
  if (filled.length > prevLines) out.appended = filled.slice(prevLines).slice(0, tailLimit);

  if (next.tasks) {
    const projectKey = projectKeyForPath(file.path);
    const before = (prev && prev.tasks) || null;
    const byHash = new Map();
    for (const task of parseTasks(file)) byHash.set(taskHash(projectKey, task.title), task);

    for (const [hash, task] of byHash) {
      const was = before ? before[hash] : undefined;
      const now = next.tasks[hash];
      const entry = {
        hash,
        ref: `${projectKey}/${hash}`,
        title: task.title,
        state: MARK_WORD[taskMark(task)] || 'открыта',
        due: task.due,
        priority: task.priority,
        children: task.children,
      };
      if (!before) continue;              // прошлого слепка задач нет — деталей не выдумываем
      if (was === undefined) { out.added_tasks.push(entry); continue; }
      if (was === now) continue;
      if (was[0] !== now[0] && task.done) { out.closed_tasks.push(entry); continue; }
      out.changed_tasks.push({ ...entry, was: MARK_WORD[was[0]] || 'открыта' });
    }
    if (before) {
      for (const hash of Object.keys(before)) {
        if (!byHash.has(hash)) out.gone_tasks.push({ hash, ref: `${projectKey}/${hash}` });
      }
    }
  }

  return { diff: out, snapshot: next };
}

// ── Развитие контекстов: что заметить самому ─────────────────────────────
//
// Здесь считаются наблюдения, которые методичка задачника («Гибкость
// контекстов», «Люди», «Журнал») велит замечать самому: тема переросла проект,
// тема расползлась по проектам, обещание висит без движения, проект пора
// схлопнуть, мысль ходит по журналу кругами.
//
// Всё это — эвристики, и они обязаны быть скупыми. Потолок в три находки за
// проход стоит не здесь, а в инструменте, но правила подбора настроены так,
// чтобы кандидатов было единицы, а не десятки: длинный список наблюдений
// перестают читать, и тогда вся затея работает в минус.

const THEME_STOP_WORDS = [
  'сделать', 'купить', 'написать', 'позвонить', 'отправить', 'забрать', 'найти',
  'проверить', 'добавить', 'обновить', 'поставить', 'решить', 'разобрать',
  'посмотреть', 'узнать', 'сходить', 'съездить', 'привезти', 'доделать',
  'собрать', 'закрыть', 'спросить', 'договориться', 'который', 'которая',
  'чтобы', 'нужно', 'потом', 'после', 'перед', 'через', 'вместе', 'сейчас',
  'самый', 'самое', 'ещё', 'если', 'когда', 'может', 'можно', 'вообще',
  'todo', 'задача', 'задачи', 'вопрос', 'вариант',
];
/**
 * Основа слова для темы — первые пять букв.
 *
 * `stemWord` для поиска отрезает два символа, и этого хватает, пока рядом есть
 * сравнение по началу слова. Здесь сравниваются сами основы, и такая обрезка
 * разводит «праздник» и «праздника» в разные темы — то есть ровно ту тему, из-за
 * которой стоило бы завести отдельный контекст, никто и не заметит.
 */
function themeStem(word) {
  return word.length > 5 ? word.slice(0, 5) : word;
}

const THEME_STOP_STEMS = new Set(THEME_STOP_WORDS.map((w) => themeStem(w)));

/** Слова темы: основа → самое короткое написание, им тему и называем. */
function themeTokens(text) {
  const out = new Map();
  for (const word of String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 5 || /^\d+$/.test(word)) continue;
    const stem = themeStem(word);
    if (THEME_STOP_STEMS.has(stem)) continue;
    const prev = out.get(stem);
    if (!prev || word.length < prev.length) out.set(stem, word);
  }
  return out;
}

function dateToMs(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function projectFiles(files) {
  return files.filter((f) => /^projects\//i.test(f.path || ''));
}

/**
 * Находки по задачнику. Возвращает всех кандидатов без потолка и без памяти:
 * и то и другое — дело инструмента, а функция должна оставаться проверяемой.
 */
function reviewFindings(files, { nowMs = Date.now(), index = null, minTheme = 5, staleDays = 14, quietDays = 30 } = {}) {
  const findings = [];
  const projects = projectFiles(files);
  const themeByProject = new Map(); // stem → { word, projects: Map<project, tasks[]> }

  for (const file of projects) {
    const projectKey = projectKeyForPath(file.path);
    if (projectKey === 'someday') continue; // отложенное лежит кучей по замыслу
    const open = parseTasks(file).filter((t) => !t.done);

    const byStem = new Map();
    for (const task of open) {
      for (const [stem, word] of themeTokens(task.title)) {
        if (!byStem.has(stem)) byStem.set(stem, { word, tasks: [] });
        byStem.get(stem).tasks.push(task);
        if (!themeByProject.has(stem)) themeByProject.set(stem, { word, projects: new Map() });
        const across = themeByProject.get(stem);
        if (word.length > across.word.length) across.word = word;
        if (!across.projects.has(projectKey)) across.projects.set(projectKey, []);
        across.projects.get(projectKey).push(task);
      }
    }

    // 1. Тема переросла проект: задач по ней много, но это не весь проект.
    for (const [stem, group] of byStem) {
      if (group.tasks.length < minTheme) continue;
      if (group.tasks.length >= open.length) continue; // это и есть сам проект, делить нечего
      findings.push({
        kind: 'split_context',
        key: `split_context:${projectKey}:${stem}`,
        project: projectKey,
        rank: 2,
        weight: group.tasks.length,
        subject: group.word,
        title: `Выделить «${group.word}» из ${projectKey} в отдельный контекст`,
        questions: [
          `В ${projectKey} набралось ${group.tasks.length} задач про «${group.word}» — выделяем в отдельный контекст, и как тогда назовём файл в projects/?`,
        ],
        context: [
          `задач по теме: ${group.tasks.length} из ${open.length} открытых в проекте`,
          ...group.tasks.slice(0, 4).map((t) => `— ${t.title}`),
        ],
      });
    }

    // 2. Проект без движения и почти пустой — кандидат на схлопывание.
    const meta = index && index.files ? index.files[file.path] : null;
    const lastTouch = Math.max(
      Number(meta && meta.updatedAt) || 0,
      ...open.map((t) => dateToMs(t.created) || 0),
      ...parseTasks(file).map((t) => dateToMs(t.due) || 0),
    );
    if (open.length > 0 && open.length < 3 && lastTouch && nowMs - lastTouch >= quietDays * DAY_MS) {
      const days = Math.floor((nowMs - lastTouch) / DAY_MS);
      findings.push({
        kind: 'collapse_project',
        key: `collapse_project:${projectKey}`,
        project: projectKey,
        rank: 4,
        weight: days,
        subject: projectKey,
        title: `Схлопнуть проект ${projectKey}`,
        questions: [
          `${projectKey} стоит без движения ${days} дней, в нём ${open.length} задач${open.length === 1 ? 'а' : 'и'} — вернуть их в родительский контекст или в someday.md?`,
        ],
        context: open.map((t) => `— ${t.title}`),
      });
    }

    // 3. Обещание человеку висит без движения.
    for (const task of parseTasks(file).filter((t) => !t.done)) {
      for (const child of task.children) {
        const match = /^ждём:\s*(.*)$/i.exec(child);
        if (!match) continue;
        const body = match[1];
        const person = body.split(/[—–-]/)[0].trim();
        // Имя и дату из текста ожидания убираем: вопрос и так начинается с
        // имени, а «Даня — привезёт зеркало, с 2026-07-05» внутри вопроса
        // читается как заикание.
        const what = body.slice(person.length).replace(/^[\s—–-]+/, '').replace(/,?\s*с\s+\d{4}-\d{2}-\d{2}\s*$/, '').trim() || body;
        const since = dateToMs((/(?:^|\s)с\s+(\d{4}-\d{2}-\d{2})/.exec(body) || [])[1]) || dateToMs(task.created);
        if (!since) continue;
        const days = Math.floor((nowMs - since) / DAY_MS);
        if (days < staleDays) continue;
        findings.push({
          kind: 'stale_promise',
          key: `stale_promise:${projectKey}:${shortDigest(`${person}|${body}`)}`,
          project: projectKey,
          // Ожидание уже висит на своей задаче — вопрос должен лечь под неё, а
          // не завести вторую задачу про то же самое.
          hash: taskHash(projectKey, task.title),
          rank: 1,
          weight: days,
          subject: person,
          title: `Зависло ожидание: ${person} — ${what}`,
          questions: [
            `${person}: «${what}» — ждём ${days} дней. Напомнить или снять ожидание?`,
          ],
          context: [`задача: ${task.title}`, `ждём с ${new Date(since).toISOString().slice(0, 10)}, это ${days} дней`],
        });
      }
    }
  }

  // 4. Тема всплывает в разных проектах — каждый раз ложится в новый.
  for (const [stem, across] of themeByProject) {
    if (across.projects.size < 3) continue;
    const total = [...across.projects.values()].reduce((sum, list) => sum + list.length, 0);
    findings.push({
      kind: 'scattered_theme',
      key: `scattered_theme:${stem}`,
      project: [...across.projects.keys()][0],
      rank: 3,
      weight: total,
      subject: across.word,
      title: `Свести «${across.word}» в один контекст`,
      questions: [
        `«${across.word}» лежит в ${[...across.projects.keys()].join(', ')} — держим в одном месте или так и оставляем?`,
      ],
      context: [...across.projects.entries()].map(([p, list]) => `${p}: ${list.length} — ${list[0].title}`),
    });
  }

  // 5. Мысль ходит по журналу кругами.
  findings.push(...repeatedThoughts(files, { nowMs }));

  return findings;
}

/** Повторяющиеся мысли журнала: одна и та же фраза в разные дни. */
function repeatedThoughts(files, { minTimes = 3, minDates = 2 } = {}) {
  const groups = new Map();
  for (const file of files.filter((f) => /^journal\//i.test(f.path || ''))) {
    const lines = String(file.text || '').split('\n');
    let date = null;
    for (let i = 0; i < lines.length; i += 1) {
      const heading = /^#{1,6}\s*(\d{4}-\d{2}-\d{2})/.exec(lines[i]);
      if (heading) { date = heading[1]; continue; }
      const line = lines[i].trim();
      if (line.length < 25 || /^#/.test(line)) continue;
      // Отпечаток мысли — четыре самых длинных слова строки. Первые попавшиеся
      // слова не годятся: «опять думаю про …» и «снова думаю про …» — это одна
      // мысль, а по началу строки они разные. Длинные слова в русской фразе и
      // есть то, о чём она.
      const tokens = [...themeTokens(line).entries()];
      if (tokens.length < 3) continue;
      const signature = tokens
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 4)
        .map(([stem]) => stem)
        .sort()
        .join('+');
      if (!groups.has(signature)) groups.set(signature, { lines: [], dates: new Set(), words: themeTokens(line) });
      const group = groups.get(signature);
      group.lines.push({ path: file.path, line: i + 1, text: line, date });
      if (date) group.dates.add(date);
    }
  }

  const out = [];
  for (const [signature, group] of groups) {
    if (group.lines.length < minTimes || group.dates.size < minDates) continue;
    // Мысль называем её же словами, а не набором основ: «расползаются
    // праздники» человек в своей записи не узнает, а свою фразу — узнает сразу.
    const sample = group.lines.map((l) => l.text).sort((a, b) => a.length - b.length)[0];
    const label = sample.length > 70 ? `${sample.slice(0, 70).trim()}…` : sample;
    out.push({
      kind: 'repeating_thought',
      key: `repeating_thought:${shortDigest(signature)}`,
      project: null,
      rank: 5,
      weight: group.lines.length,
      subject: label,
      title: `Мысль повторяется в журнале: «${label}»`,
      questions: [
        `Ты возвращаешься к этому ${group.lines.length}-й раз (${[...group.dates].join(', ')}) — заводим задачу или отпускаем?`,
      ],
      context: group.lines.slice(0, 3).map((l) => `${l.date || l.path}: ${l.text.slice(0, 120)}`),
    });
  }
  return out;
}

// ── Память прохода ───────────────────────────────────────────────────────
//
// Без памяти всё вышенаписанное вредно: агент, который каждый проход заново
// «замечает» одно и то же, превращается в генератор шума, и его перестают
// читать вместе со всем остальным. Поэтому проход помнит две вещи: отпечаток
// задачника (чтобы входить в разницу, а не во весь файлопад) и то, что уже
// предлагал — вместе с ответом.
//
// Отказ держится месяц: ровно так написано в методичке про выделение
// контекста («повторно с ней не приставать раньше месяца»). Предложение без
// ответа не поднимается две недели — оно и так висит на доске.

const STATE_KEY = `${KEY_PREFIX}agent_state`;
const PROPOSAL_COOLDOWN_DAYS = { proposed: 14, declined: 30, accepted: 90 };

function ensureState(raw) {
  const base = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const seen = (base.seen && typeof base.seen === 'object' && !Array.isArray(base.seen)) ? base.seen : {};
  const files = (seen.files && typeof seen.files === 'object' && !Array.isArray(seen.files)) ? seen.files : {};
  const proposals = (base.proposals && typeof base.proposals === 'object' && !Array.isArray(base.proposals))
    ? base.proposals
    : {};
  return {
    version: 1,
    seen: { at: Number(seen.at) || 0, files: { ...files } },
    proposals: { ...proposals },
    updatedAt: Number(base.updatedAt) || 0,
  };
}

/** Сколько ещё молчать про это предложение. */
function proposalCooldown(entry, nowMs) {
  if (!entry) return { blocked: false, days_left: 0, status: null };
  const days = PROPOSAL_COOLDOWN_DAYS[entry.status] ?? PROPOSAL_COOLDOWN_DAYS.proposed;
  const since = Number(entry.answeredAt) || Number(entry.proposedAt) || 0;
  const left = Math.ceil((since + days * DAY_MS - nowMs) / DAY_MS);
  return { blocked: left > 0, days_left: Math.max(0, left), status: entry.status };
}

/**
 * Что из найденного вообще можно поднимать. Потолок жёсткий: не больше трёх за
 * проход, независимо от того, сколько нашлось. Это не настройка — без него
 * длинный список наблюдений перестают читать, и вместе с ним перестают читать
 * блок «Требует решения».
 */
function pickFindings(state, findings, { nowMs = Date.now(), limit = 3 } = {}) {
  const cap = Math.max(0, Math.min(Number(limit) || 3, 3));
  const skipped = [];
  const fresh = [];
  for (const finding of findings) {
    const cooldown = proposalCooldown(state.proposals[finding.key], nowMs);
    if (cooldown.blocked) { skipped.push({ ...finding, cooldown }); continue; }
    fresh.push(finding);
  }
  fresh.sort((a, b) => (a.rank - b.rank) || (b.weight - a.weight) || a.key.localeCompare(b.key));
  return { picked: fresh.slice(0, cap), skipped, held_back: Math.max(0, fresh.length - cap) };
}

function rememberProposal(state, finding, { nowMs = Date.now(), ref = null } = {}) {
  const prev = state.proposals[finding.key] || {};
  return {
    ...state,
    proposals: {
      ...state.proposals,
      [finding.key]: {
        kind: finding.kind,
        subject: finding.subject,
        project: finding.project,
        title: finding.title,
        status: 'proposed',
        proposedAt: nowMs,
        answeredAt: 0,
        ref: ref || prev.ref || null,
        note: prev.note || null,
      },
    },
    updatedAt: nowMs,
  };
}

function answerProposal(state, key, { status = 'declined', nowMs = Date.now(), note = null } = {}) {
  const prev = state.proposals[key];
  if (!prev) return null;
  return {
    ...state,
    proposals: {
      ...state.proposals,
      [key]: { ...prev, status, answeredAt: nowMs, note: note || prev.note || null },
    },
    updatedAt: nowMs,
  };
}

// ── Эксперимент «два ответа» ─────────────────────────────────────────────
//
// Недельная проверка (решение пользователя 2026-08-03): на содержательный
// вопрос агент даёт два ответа — процедурный и свободный, — а пользователь
// выбирает. Голоса копятся здесь, обычным файлом задачника: статистика,
// которую нельзя прочитать глазами, не статистика.

const VOTES_PATH = 'docs/experiment-two-answers.md';
const VOTES_SECTION = '## Голоса';

/** Во что превратился голос: процедурный / свободный / ничья. */
function voteWinner(choice, procedural) {
  const c = String(choice).trim();
  if (c === 'ничья') return 'ничья';
  return c === String(procedural).trim() ? 'процедурный' : 'свободный';
}

function voteLine({ date, winner, question, note }) {
  return `- ${date} · ${winner} · ${question}${note ? ` — ${note}` : ''}`;
}

function parseVotes(file) {
  const counts = { 'процедурный': 0, 'свободный': 0, 'ничья': 0 };
  const votes = [];
  for (const raw of String((file && file.text) || '').split('\n')) {
    const match = /^-\s*(\d{4}-\d{2}-\d{2})\s*·\s*(процедурный|свободный|ничья)\s*·\s*(.+)$/.exec(raw.trim());
    if (!match) continue;
    counts[match[2]] += 1;
    votes.push({ date: match[1], winner: match[2], question: match[3] });
  }
  return { counts, votes, total: votes.length };
}

// ── Деньги ───────────────────────────────────────────────────────────────
//
// Формат строки задан в money/README.md и читается доской:
//   - ДД -СУММА категория ~контур · счёт · комментарий
// День — две цифры, месяц берётся из имени файла. Второго формата тут быть не
// может: доска разбирает строки одним выражением, и всё, что в него не попало,
// молча выпадает из всех подсчётов — операция вроде записана, а её нигде нет.

const MONEY_OP_RE = /^-\s+(\d{1,2})\s+([+-]\d+(?:\.\d+)?)\s+([^\s~·]+)\s*(?:~(\S+))?\s*(?:·\s*(.*))?$/;
const MONEY_BALANCE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s*·\s*остаток\s+([\d.]+)/;

function moneyLine({ date, amount, income = false, category, contour, account = null, comment = null }) {
  const day = String(date).slice(8, 10);
  const sum = `${income ? '+' : '-'}${Math.abs(Number(amount))}`;
  const tail = [account, comment].filter(Boolean).join(' · ');
  return `- ${day} ${sum} ${category} ~${contour}${tail ? ` · ${tail}` : ''}`;
}

function parseMoneyOps(text, month) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const match = MONEY_OP_RE.exec(raw.trim());
    if (!match) continue;
    out.push({
      date: `${month}-${match[1].padStart(2, '0')}`,
      amount: Number(match[2]),
      category: match[3],
      contour: match[4] || null,
    });
  }
  return out;
}

/** Последний известный остаток на счетах — из того же файла месяца. */
function lastBalance(text) {
  let found = null;
  for (const raw of String(text || '').split('\n')) {
    const match = MONEY_BALANCE_RE.exec(raw.trim());
    if (match) found = { date: match[1], amount: Number(match[2]) };
  }
  return found;
}

/**
 * Картина месяца после записи. Смысл тот же, что у day_after в дневниках: не
 * «записал», а «вот что теперь». Без этого каждая трата обсуждается вслепую.
 *
 * Оценок и советов тут нет намеренно: лимиты в budget.md на август стоят «?»
 * по его же решению — не выдумывать нормы до первого честного месяца.
 */
function monthAfter(text, { month, today = null, contour = null, recurring = null } = {}) {
  const ops = parseMoneyOps(text, month);
  const spent = ops.filter((o) => o.amount < 0).reduce((n, o) => n + Math.abs(o.amount), 0);
  const income = ops.filter((o) => o.amount > 0).reduce((n, o) => n + o.amount, 0);
  const byContour = {};
  for (const op of ops) {
    if (op.amount >= 0) continue;
    const key = op.contour || '_';
    byContour[key] = (byContour[key] || 0) + Math.abs(op.amount);
  }
  const todaySpent = today
    ? ops.filter((o) => o.date === today && o.amount < 0).reduce((n, o) => n + Math.abs(o.amount), 0)
    : null;

  // Что ещё спишется само до конца месяца: строки recurring, чей день позже
  // сегодняшнего. Это прогноз, а не обязательство, — так и подписано в файле.
  let ahead = null;
  if (recurring && today) {
    const day = Number(today.slice(8, 10));
    ahead = parseMoneyOps(recurring, month)
      .filter((o) => o.amount < 0 && Number(o.date.slice(8, 10)) > day)
      .reduce((n, o) => n + Math.abs(o.amount), 0);
  }

  return {
    month,
    spent: Math.round(spent * 100) / 100,
    income: Math.round(income * 100) / 100,
    today_spent: todaySpent === null ? null : Math.round(todaySpent * 100) / 100,
    contour: contour ? { key: contour, spent: Math.round((byContour[contour] || 0) * 100) / 100 } : null,
    by_contour: byContour,
    balance: lastBalance(text),
    recurring_ahead: ahead,
    operations: ops.length,
  };
}

/**
 * Лимиты из `money/budget.md`. `?` и пустое значение — это НЕ ноль и не
 * «неизвестно потом посчитаем»: в файле прямо написано, что месяц идёт без
 * лимитов по его решению. Поэтому здесь `null`, и всё, что считает отклонение,
 * обязано этот `null` увидеть и промолчать, а не подставить своё число.
 */
function parseBudget(text) {
  const limits = {};
  const cushion = { goal: null, monthly: null, deadline: null };
  let section = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('##')) {
      const head = line.replace(/^#+\s*/, '').toLowerCase();
      section = head.includes('подушк') ? 'cushion' : (head.includes('лимит') ? 'limits' : null);
      continue;
    }
    const match = /^-\s*([^|]+?)\s*\|\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const rawValue = match[2].trim();
    const number = /^-?\d+(?:\.\d+)?$/.test(rawValue) ? Number(rawValue) : null;
    if (section === 'cushion') {
      if (key.startsWith('цел')) cushion.goal = number;
      else if (key.includes('месяц')) cushion.monthly = number;
      else if (key.startsWith('срок')) cushion.deadline = rawValue && rawValue !== '?' ? rawValue : null;
      continue;
    }
    if (section === 'limits') limits[key] = number;
  }
  return { limits, cushion };
}

/**
 * Картина денег месяца — то, чего не хватало, чтобы вообще что-то сказать про
 * «хватит ли на поездку». Оценок тут по-прежнему нет: они появляются только
 * там, где есть лимит-число. Где лимита нет, где нет доходов — так и написано,
 * потому что молчаливая подстановка нуля здесь врёт сильнее пустоты.
 */
function budgetPicture({
  month, text, budget = null, recurring = null, today = null, contour = null, months = [],
} = {}) {
  const base = monthAfter(text, { month, today, contour, recurring });
  const parsed = parseBudget(budget);
  const ops = parseMoneyOps(text, month);

  const net = (key) => ops
    .filter((o) => o.contour === key)
    .reduce((n, o) => n + (o.amount < 0 ? Math.abs(o.amount) : -o.amount), 0);
  const cushionMonth = Math.round(net('cushion') * 100) / 100;
  const travelMonth = Math.round(net('travel') * 100) / 100;
  const debtMonth = Math.round((base.by_contour.debt || 0) * 100) / 100;
  // Для разбивки расходов нужна расходная сторона подушки, а не итог месяца:
  // снятие из подушки итог уменьшает, но потреблением от этого не становится —
  // иначе «потребление» распухало бы ровно на снятую сумму.
  const cushionSpent = Math.round((base.by_contour.cushion || 0) * 100) / 100;

  // Подушка копится не месяцем: складываем взносы по всем месяцам, которые
  // вообще есть в задачнике. Если месяц один — так и будет один.
  const cushionTotal = Math.round(months
    .reduce((n, m) => n + parseMoneyOps(m.text, m.month)
      .filter((o) => o.contour === 'cushion')
      .reduce((s, o) => s + (o.amount < 0 ? Math.abs(o.amount) : -o.amount), 0), 0) * 100) / 100;

  const keys = [...new Set([...Object.keys(parsed.limits), ...Object.keys(base.by_contour)])]
    .filter((k) => k !== '_')
    .sort();
  const limits = keys.map((key) => {
    const spent = Math.round((base.by_contour[key] || 0) * 100) / 100;
    const limit = Object.prototype.hasOwnProperty.call(parsed.limits, key) ? parsed.limits[key] : null;
    return limit === null
      ? { contour: key, spent, limit: null, over: null, measurable: false }
      : { contour: key, spent, limit, over: Math.round((spent - limit) * 100) / 100, measurable: true };
  });
  const unmeasured = limits.filter((l) => !l.measurable).map((l) => l.contour);

  return {
    ...base,
    // «Взнос в подушку» и «погашение кредита» — не потребление; свести их в одну
    // строку расходов значит каждый месяц пугать человека собственными
    // сбережениями. Разводим явно, но исходный `spent` не трогаем.
    split: {
      consumption: Math.round((base.spent - cushionSpent - debtMonth) * 100) / 100,
      debt: debtMonth,
      cushion: cushionSpent,
    },
    limits,
    unmeasured,
    // Доходы за месяц не записаны — вывод односторонний. Это его решение, а не
    // дыра в данных: так и записано в money/2026-08.md, раздел «Открыто».
    income_present: base.income > 0,
    one_sided: base.income <= 0,
    cushion: {
      month: cushionMonth,
      total: cushionTotal,
      goal: parsed.cushion.goal,
      monthly: parsed.cushion.monthly,
      deadline: parsed.cushion.deadline,
    },
    travel: { month: travelMonth },
  };
}

// ── Как он решает ────────────────────────────────────────────────────────
//
// Дообучить модель на этом задачнике нельзя: такого в API нет, да и данных на
// два порядка мало. То, что человек называет «обучением на моём контексте»,
// получается иначе — накоплением его решений в одном коротком месте, которое
// читается всегда. Это обычный markdown в задачнике, а не скрытое состояние:
// он должен уметь прочитать это глазами и вычеркнуть неверное.
//
// Записывается только подтверждённое: его слова, его выбор. Догадка агента
// про то, «как он, наверное, любит», — это ровно тот мусор, из-за которого
// такую память перестают читать.

const PREFS_PATH = 'docs/preferences.md';
const PREFS_SECTION = '## Как он решает';
const PREFS_SOFT_LIMIT = 60;

/** Строки памяти предпочтений: дата, вид, сама формулировка, откуда известно. */
function parsePreferences(file) {
  const out = [];
  const lines = String((file && file.text) || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^-\s*(\d{4}-\d{2}-\d{2})\s*·\s*([^·]+?)\s*·\s*(.+)$/.exec(lines[i].trim());
    if (!match) continue;
    const body = match[3];
    const split = body.lastIndexOf(' — ');
    out.push({
      line: i,
      date: match[1],
      kind: match[2].trim(),
      note: (split === -1 ? body : body.slice(0, split)).trim(),
      evidence: split === -1 ? null : body.slice(split + 3).trim(),
    });
  }
  return out;
}

/**
 * Уже записано ли то же самое. Дословного совпадения мало: одна и та же мысль
 * записывается разными словами, и память быстро зарастает повторами.
 */
function knownPreference(existing, note, { threshold = DECISION_SIMILARITY } = {}) {
  let best = null;
  for (const entry of existing) {
    const score = questionSimilarity(note, entry.note);
    if (score >= threshold && (!best || score > best.score)) best = { ...entry, score: Math.round(score * 100) / 100 };
  }
  return best;
}

function preferenceLine({ date, kind, note, evidence }) {
  return `- ${date} · ${kind} · ${note}${evidence ? ` — ${evidence}` : ''}`;
}

// ── Окружение находки ────────────────────────────────────────────────────
//
// Поиск по словам возвращает обрывки строк, и дальше модель додумывает, что
// вокруг них. Между тем весь задачник — проценты окна модели, экономить не на
// чем. Поэтому к найденному прикладывается его окружение: проект целиком (он
// маленький) и время, которое уже выделено под эти задачи в днях.
//
// Время — отдельный смысл: пересечение по часам поиск по словам не находит
// никогда, у «дзюдо в понедельник» и «уборки 15:30» нет общих слов.

/**
 * Проекты найденных задач — целиком, коротким списком открытых задач.
 * @param {Array} files все файлы задачника
 * @param {Array} matched найденные задачи
 */
function projectNeighborhood(files, matched, { limit = 3, perProject = 12 } = {}) {
  const order = [];
  for (const task of matched) {
    const key = projectKeyForPath(task.path);
    if (key && !order.includes(key)) order.push(key);
    if (order.length >= limit) break;
  }
  const out = [];
  for (const key of order) {
    const file = files.find((f) => projectKeyForPath(f.path) === key);
    if (!file) continue;
    const all = parseTasks(file);
    const open = all.filter((t) => !t.done);
    out.push({
      project: key,
      open_count: open.length,
      done_count: all.length - open.length,
      tasks: open.slice(0, perProject).map((t) => ({
        ...taskAddress(file.path, t.title),
        title: t.title,
        pri: t.pri,
        due: t.due || null,
        tags: t.tags,
        waiting: t.children.filter((c) => /^(открыто|ждём|при встрече):/i.test(c)),
      })),
      truncated: Math.max(0, open.length - perProject),
    });
  }
  return out;
}

/**
 * Время в днях, относящееся к найденному: слоты со ссылкой на эти задачи и
 * слоты, названные теми же словами. Отвечает на «когда это стоит» — вопрос, на
 * который список задач не отвечает вовсе.
 */
function slotsAround(files, refs, terms, { from = null, limit = 20 } = {}) {
  const wanted = new Set(refs.map((r) => String(r).toLowerCase()));
  const out = [];
  for (const file of files) {
    if (!/^days\//i.test(String(file.path || ''))) continue;
    const date = /days\/(\d{4}-\d{2}-\d{2})/i.exec(file.path)?.[1] || null;
    if (from && date && date < from) continue;
    for (const line of String(file.text || '').split('\n')) {
      const slot = SLOT_LINE_RE.exec(line.trim());
      if (!slot) continue;
      const linked = parseSlotRef(line);
      const ref = linked ? `${linked.ref.project}/${linked.ref.hash}` : null;
      const byRef = ref && wanted.has(ref.toLowerCase());
      const byWord = !byRef && terms.length ? matchTerms(slot[3], terms).score > 0 : false;
      if (!byRef && !byWord) continue;
      out.push({
        date,
        from: slot[1],
        to: slot[2],
        title: (linked ? linked.title : slot[3].replace(/\s*#[\p{L}\d]+/gu, '')).trim(),
        ref,
        why: byRef ? 'под эту задачу' : 'названо теми же словами',
      });
    }
  }
  out.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.from.localeCompare(b.from));
  return out.slice(0, limit);
}

// ── Потолок и дубли развилок ─────────────────────────────────────────────
//
// Потолок в три находки за проход стоит на автоматическом обходе, но развилку
// можно положить и напрямую, в любом разговоре. Без такой же проверки здесь
// потолок не значит ничего: тот же вопрос ложится вторым, третьим, и блок
// «Требует решения» перестают читать целиком — вместе с тем, что там важно.
//
// Порог схожести 0.6 взят тот же, что в ритуальном контуре: два разных числа
// для одного и того же решения — способ получить два разных поведения.

const OPEN_DECISIONS_CAP = 5;
const DECISION_SIMILARITY = 0.6;

/** Значимые слова фразы, приведённые к основе: «встречу» и «встреча» — одно. */
function questionStems(text) {
  return new Set(topicTerms(text).terms.map((t) => stemWord(t.word)).filter((w) => w.length >= 3));
}

/**
 * Насколько два вопроса про одно и то же: доля общих значимых слов.
 * Точного совпадения строк мало — один и тот же вопрос человек и модель
 * формулируют по-разному, и дубль проходит мимо проверки.
 */
function questionSimilarity(a, b) {
  const first = questionStems(a);
  const second = questionStems(b);
  if (!first.size || !second.size) return 0;
  let shared = 0;
  for (const word of first) if (second.has(word)) shared += 1;
  return shared / (first.size + second.size - shared);
}

/**
 * Что мешает положить развилку: такой вопрос уже висит открытым, или доска
 * уже держит столько нерешённого, что новое просто не прочитают.
 *
 * @param {Array} openQuestions результат collectOpenQuestions
 * @param {string[]} questions что собираемся спросить
 */
function decisionGuard(openQuestions, questions, { cap = OPEN_DECISIONS_CAP, threshold = DECISION_SIMILARITY } = {}) {
  const duplicates = [];
  const fresh = [];
  for (const question of questions) {
    let best = null;
    for (const open of openQuestions) {
      const score = questionSimilarity(question, open.question);
      if (score >= threshold && (!best || score > best.score)) {
        best = { asked: question, same_as: open.question, ref: open.ref, task: open.task, score: Math.round(score * 100) / 100 };
      }
    }
    if (best) duplicates.push(best);
    else fresh.push(question);
  }
  const openTasks = [...new Set(openQuestions.map((q) => q.ref).filter(Boolean))];
  return { fresh, duplicates, open_refs: openTasks, open_count: openTasks.length, cap, over_cap: openTasks.length >= cap };
}

// ── «Что делать прямо сейчас» ────────────────────────────────────────────
//
// «Есть час», «я в студии», «голова не варит» — это ситуация, а не просьба
// показать всё. Отбор идёт по месту, времени и состоянию, а не по возрасту
// задачи: самая старая задача почти никогда не бывает самой подходящей.

const PLACE_TAGS = new Set(['студия', 'дом', 'ноут', 'город']);
const TIME_TAGS = { '15min': 15, '30min': 30, '45min': 45, '1h': 60, '2h': 120 };

function taskPlace(task) {
  return (task.tags || []).map((t) => t.toLowerCase()).find((t) => PLACE_TAGS.has(t)) || null;
}

function taskMinutes(task) {
  for (const tag of (task.tags || [])) {
    const minutes = TIME_TAGS[String(tag).toLowerCase()];
    if (minutes) return minutes;
  }
  return null;
}

/**
 * Подбор задач под ситуацию. Возвращает не больше `limit` штук, каждая — с
 * причиной, по которой она здесь: без причины список читается как «покажи всё»,
 * а именно от этого методичка и уводит.
 */
function pickFocus(tasks_, { place = null, minutes = null, mood = null, today = null, limit = 3 } = {}) {
  const wantedPlace = place ? String(place).replace(/^#/, '').toLowerCase() : null;
  const budget = Number(minutes) || null;
  const low = mood === 'low';

  const scored = [];
  for (const task of tasks_) {
    if (task.done || task.waiting) continue;
    const tags = (task.tags || []).map((t) => t.toLowerCase());
    const blocked = tags.includes('blocked') || task.children.some((c) => /^открыто:/i.test(c));
    const taskPlaceTag = taskPlace(task);
    const taskTime = taskMinutes(task);

    // Место: задача с чужим местом сюда не подходит вовсе — её физически не
    // сделать. Задача без места подходит везде.
    if (wantedPlace && taskPlaceTag && taskPlaceTag !== wantedPlace) continue;
    // Время: задача, которая заведомо длиннее окна, — не вариант.
    if (budget && taskTime && taskTime > budget) continue;

    const reasons = [];
    let score = 0;
    if (wantedPlace && taskPlaceTag === wantedPlace) { score += 40; reasons.push(`место: #${taskPlaceTag}`); }
    if (budget && taskTime) { score += 25; reasons.push(`влезает в ${budget} мин (#${Object.keys(TIME_TAGS).find((k) => TIME_TAGS[k] === taskTime)})`); }
    if (task.due && today) {
      if (task.due < today) { score += 50; reasons.push(`просрочено с ${task.due}`); }
      else if (task.due === today) { score += 45; reasons.push('срок сегодня'); }
      else if (dateToMs(task.due) - dateToMs(today) <= 3 * DAY_MS) { score += 20; reasons.push(`срок ${task.due}`); }
    }
    if (task.priority === 'P1') { score += 30; reasons.push('P1'); }
    else if (task.priority === 'P2') score += 15;
    else if (task.priority === 'P3') score += 5;
    if (tags.includes('next')) { score += 20; reasons.push('#next'); }

    // Состояние. «Голова не варит» — это про короткое и понятное: длинная
    // задача с подпунктами в таком состоянии не делается, а откладывается.
    if (low) {
      if (taskTime && taskTime <= 15) { score += 35; reasons.push('короткая, под «голова не варит»'); }
      if (task.children.filter((c) => /^-?\s*\[[ x]\]/.test(c)).length >= 2) score -= 25;
      if (task.title.length > 60) score -= 15;
      if (task.priority === 'P1') score -= 10;
    }
    if (blocked) { score -= 60; reasons.push('ждёт твоего решения'); }

    scored.push({ ...task, score, blocked, reasons });
  }

  return scored
    .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title)))
    .slice(0, limit);
}

// ── Операции записи ──────────────────────────────────────────────────────
//
// Все они принимают текст файла и возвращают новый текст. Целиковой замены
// среди них нет намеренно: инструмент не умеет сказать «вот новое содержимое»,
// он умеет только «вставь строку сюда» и «замени вот этот блок». Это и есть
// защита от молчаливого затирания правки соседней сессии.

/** Номер строки с заголовком раздела (`## Задачи`), или -1. */
function findSectionLine(lines, section) {
  const wanted = String(section || '').trim().toLowerCase();
  return lines.findIndex((line) => line.trim().toLowerCase() === wanted);
}

/**
 * Вставка задачи в раздел. Строка встаёт в конец раздела, а не в конец файла:
 * ниже по файлу живут «## Идеи» и другие разделы, и дописанная вслепую задача
 * оказалась бы в чужом.
 */
/**
 * Вставить строку первой в разделе. Нужно там, где файл читается сверху вниз
 * как лента свежего: операции месяца лежат новыми вверх, и дописанная в конец
 * строка выглядела бы как самая старая.
 */
function prependToSection(text, line, section) {
  const lines = String(text || '').split('\n');
  const start = findSectionLine(lines, section);
  if (start === -1) return appendToSection(text, line, section);
  let at = start + 1;
  while (at < lines.length && lines[at].trim() === '') at += 1;
  return [...lines.slice(0, at), line, ...lines.slice(at)].join('\n');
}

function appendToSection(text, line, section = '## Задачи') {
  const lines = String(text || '').split('\n');
  const start = findSectionLine(lines, section);
  if (start === -1) {
    // Раздела нет — заводим его в конце файла, а не молча кладём строку абы куда.
    const tail = lines.length && lines[lines.length - 1].trim() === '' ? lines.slice(0, -1) : lines;
    return [...tail, '', section, '', line, ''].join('\n');
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) { end = i; break; }
  }
  while (end > start + 1 && lines[end - 1].trim() === '') end -= 1;
  return [...lines.slice(0, end), line, ...lines.slice(end)].join('\n');
}

/** Дописать блок в конец файла — для журнала, стенограммы и инбокса. */
function appendBlock(text, block) {
  const base = String(text || '').replace(/\s+$/, '');
  return base ? `${base}\n\n${block}\n` : `${block}\n`;
}

/** Найти задачу по хэшу доски. Возвращает индекс строки и разбор, либо null. */
function findTaskByHash(file, hash) {
  const projectKey = projectKeyForPath(file.path);
  const lines = String(file.text || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseTaskLine(lines[i]);
    if (!parsed || parsed.indent !== 0) continue;
    if (taskHash(projectKey, parsed.title) === String(hash).toLowerCase()) {
      return { line: i, parsed, projectKey };
    }
  }
  return null;
}

/**
 * Правка полей задачи прямо в строке. Меняются только названные поля;
 * остальное — включая порядок слов и авторскую формулировку — остаётся как
 * было. Заголовок не трогаем: от него зависит хэш, по которому на задачу
 * ссылаются с доски.
 */
function applyTaskPatch(rawLine, patch = {}) {
  let line = rawLine;

  if (patch.state) {
    const mark = { new: ' ', doing: '~', done: 'x', wait: '>' }[patch.state];
    if (!mark) throw new Error(`invalid_state:${patch.state}`);
    line = line.replace(/^(\s*-\s*\[)[ x>~](\])/i, `$1${mark}$2`);
  }

  if (patch.due !== undefined) {
    const next = patch.due ? `due:${patch.due}` : '';
    if (patch.due && !/^\d{4}-\d{2}-\d{2}$/.test(patch.due)) throw new Error(`invalid_due:${patch.due}`);
    line = /\bdue:\d{4}-\d{2}-\d{2}/.test(line)
      ? line.replace(/\s*\bdue:\d{4}-\d{2}-\d{2}/, next ? ` ${next}` : '')
      : (next ? `${line} ${next}` : line);
  }

  if (patch.priority) {
    if (!/^P[123]$/.test(patch.priority)) throw new Error(`invalid_priority:${patch.priority}`);
    line = /\bP[123]\b/.test(line)
      ? line.replace(/\bP[123]\b/, patch.priority)
      : line.replace(/^(\s*-\s*\[[ x>~]\]\s*)/i, `$1${patch.priority} `);
  }

  // Конец тега проверяем через «дальше не буква и не цифра», а не через `\b`:
  // граница слова в JS считается по ASCII, и у кириллического `#ноут` её в
  // конце строки просто нет. С `\b` тот же тег добавлялся вторым, а снять его
  // было нельзя вовсе — молча, на самых частых тегах места.
  const tagEnd = '(?![\\p{L}\\d_])';
  for (const tag of (patch.addTags || [])) {
    const clean = String(tag).replace(/^#/, '');
    if (!new RegExp(`#${clean}${tagEnd}`, 'u').test(line)) line = `${line} #${clean}`;
  }
  for (const tag of (patch.removeTags || [])) {
    const clean = String(tag).replace(/^#/, '');
    line = line.replace(new RegExp(`\\s*#${clean}${tagEnd}`, 'u'), '');
  }

  return line.replace(/\s{2,}/g, ' ').replace(/\s+$/, '');
}

/** Вложенная строка под задачей: контекст, `ждём:`, `при встрече:`, `открыто:`. */
function appendChild(text, taskLine, childLine) {
  const lines = String(text || '').split('\n');
  let insertAt = taskLine + 1;
  while (insertAt < lines.length) {
    const line = lines[insertAt];
    if (!line.trim()) break;
    if (!/^\s/.test(line)) break;
    insertAt += 1;
  }
  return [...lines.slice(0, insertAt), `  - ${childLine}`, ...lines.slice(insertAt)].join('\n');
}

/**
 * Замена блока по якорям — для переработок вроде «перегруппируй раздел».
 * Якорь ищется как точная строка; блок заменяется вместе с ограничивающей
 * строкой `from`, но без `to`. Не нашли якорь — это ошибка, а не повод
 * дописать текст куда-нибудь.
 */
function patchBlock(text, { from, to = null, replacement = '' }) {
  const lines = String(text || '').split('\n');
  const start = lines.findIndex((line) => line.trim() === String(from || '').trim());
  if (start === -1) throw new Error(`anchor_not_found:${from}`);
  let end = lines.length;
  if (to) {
    const rel = lines.slice(start + 1).findIndex((line) => line.trim() === String(to).trim());
    if (rel === -1) throw new Error(`anchor_not_found:${to}`);
    end = start + 1 + rel;
  }
  const body = String(replacement).split('\n');
  return [...lines.slice(0, start), ...body, ...lines.slice(end)].join('\n');
}

/**
 * Отметить или снять галочку у подпункта задачи. Подпункт ищется по тексту, а
 * не по номеру: номер меняется от любой вставки выше, а текст — это то, что
 * человек называет вслух.
 */
function toggleSubtask(text, taskLine, subtaskText, done = true) {
  const lines = String(text || '').split('\n');
  const needle = String(subtaskText || '').trim().toLowerCase();
  if (!needle) throw new Error('empty_subtask');
  for (let i = taskLine + 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) break;
    if (!/^\s/.test(lines[i])) break;
    const match = /^(\s*-\s*\[)([ x])(\]\s*)(.*)$/i.exec(lines[i]);
    if (!match) continue;
    if (!match[4].trim().toLowerCase().includes(needle)) continue;
    lines[i] = `${match[1]}${done ? 'x' : ' '}${match[3]}${match[4]}`;
    return { text: lines.join('\n'), matched: match[4].trim() };
  }
  throw new Error(`subtask_not_found:${subtaskText}`);
}

/**
 * Снять вложенную строку у задачи — ответ получен, ожидание закрылось.
 *
 * Методичка задачника требует снимать `открыто:` и `ждём:` в том же ходе, в
 * котором пришёл ответ: вопрос, оставшийся висеть после ответа, всплывает
 * снова и заставляет спрашивать второй раз.
 */
function removeChild(text, taskLine, needle) {
  const lines = String(text || '').split('\n');
  const wanted = String(needle || '').trim().toLowerCase();
  if (!wanted) throw new Error('empty_needle');
  for (let i = taskLine + 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) break;
    if (!/^\s/.test(lines[i])) break;
    if (!lines[i].toLowerCase().includes(wanted)) continue;
    const removed = lines[i].trim().replace(/^[-*]\s+/, '');
    lines.splice(i, 1);
    return { text: lines.join('\n'), removed };
  }
  throw new Error(`child_not_found:${needle}`);
}

/** Перенос задачи со всеми вложенными строками из одного файла в другой. */
function cutTask(text, taskLine) {
  const lines = String(text || '').split('\n');
  let end = taskLine + 1;
  while (end < lines.length && lines[end].trim() && /^\s/.test(lines[end])) end += 1;
  const block = lines.slice(taskLine, end).join('\n');
  return { text: [...lines.slice(0, taskLine), ...lines.slice(end)].join('\n'), block };
}

/**
 * Строка слота. Галочка в начале — часть формата, а не украшение: доска пишет
 * закрытый слот как `- [x] 15:00-17:00 Kinderly` и продолжает считать его
 * занятым временем. Без этой группы такой слот выпадал из разбора целиком, и
 * прошедший рабочий день выглядел бы отсюда полностью свободным.
 */
const SLOT_RE = /^-?\s*(?:\[([ xX])\]\s*)?(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})\s+(.*)$/;

/**
 * Тег вида слота — тот же словарь, что в build_board.py (KIND_RE).
 *
 * Границу слова здесь пришлось написать руками: `\b` в JS считает словом только
 * латиницу, поэтому после кириллического «фокус» границы не возникает никогда и
 * тег не находился вовсе. Всё подряд оказывалось «фокусом», а сам `#фокус`
 * оставался висеть в заголовке слота. В Python `\b` знает про кириллицу, из-за
 * чего доска разбирала те же строки правильно, а здесь — молча нет.
 */
const SLOT_KIND_RE = /\s*#(фон|дело|фокус|привычка)(?![\wа-яё])/i;
const SLOT_KINDS = new Set(['фон', 'дело', 'фокус', 'привычка']);

/** Вид слота из текста строки и заголовок без тега. Тег может стоять где угодно в строке. */
function slotKindAndTitle(rawTitle) {
  const match = SLOT_KIND_RE.exec(rawTitle);
  const kind = match ? match[1].toLowerCase() : 'фокус'; // доска подставляет тот же дефолт
  return { kind, title: rawTitle.replace(SLOT_KIND_RE, '').trim() };
}

/**
 * Смысл пересечения двух слотов — зеркало clash_kind() из build_board.py.
 * Расходиться с доской нельзя: инструмент и так столкнулся с этим один раз —
 * писал слоты без тега, доска подставляла «фокус» по умолчанию, и пятнадцать
 * минут на дела в кассе доска честно посчитала «два дела требуют головы
 * одновременно», хотя по смыслу это была врезка внутри вечера с родителями.
 */
function slotClashLevel(kindA, kindB) {
  const pair = new Set([kindA, kindB]);
  if (pair.has('дело')) return null; // врезка живёт внутри чего угодно
  if (pair.size === 2 && pair.has('фон') && pair.has('фокус')) return null; // работать внутри события — норма
  if (pair.size === 1 && pair.has('фон')) return 'вопрос'; // без адреса не различить один это блок или два
  if (pair.has('привычка')) return 'вопрос';
  return 'конфликт';
}

/** Минуты от полуночи. Свой разбор: модуль намеренно ни от чего не зависит. */
function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * Сутки задачника кончаются не в полночь. Слот `00:00–03:00` в файле дня — это
 * ночь ПОСЛЕ него, и доска рисует его внизу, после 23:00. Поэтому всё, что
 * начинается раньше пяти утра, считается продолжением тех же суток: иначе
 * ночной слот численно оказывается «раньше» вечернего, и пересечение с ним
 * не находится вовсе.
 */
const DAY_TAIL_BEFORE = 5 * 60;

function slotMinutes(from, to, dayStart = DAY_TAIL_BEFORE) {
  let start = timeToMinutes(from);
  let end = timeToMinutes(to);
  if (start === null || end === null) return null;
  if (start < dayStart) start += 24 * 60;
  if (end < dayStart) end += 24 * 60;
  if (end <= start) end += 24 * 60;
  return { start, end };
}

/**
 * Слоты дня как интервалы — чтобы видеть пересечения до записи, а не после.
 *
 * `dayStart` двигает границу «где кончаются сутки»: для пересечений хватает
 * пяти утра, а свободное время считается от той же семи утра, что и на доске
 * (H0 в build_board.py). Разойтись тут нельзя — иначе окно, которое доска
 * рисует свободным, инструмент назовёт занятым.
 */
function parseSlots(text, { dayStart = DAY_TAIL_BEFORE } = {}) {
  const out = [];
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = SLOT_RE.exec(lines[i].trim());
    if (!match) continue;
    const span = slotMinutes(match[2], match[3], dayStart);
    if (!span) continue;
    const { kind, title } = slotKindAndTitle(match[4].trim());
    out.push({
      line: i, from: span.start, to: span.end, kind, title, raw: lines[i],
      start: match[2], end: match[3], done: String(match[1] || '').toLowerCase() === 'x',
    });
  }
  return out;
}

/**
 * Пересечения нового слота с уже стоящими. Доска рисует слоты друг поверх
 * друга и о конфликте не скажет, а методичка требует называть его сразу —
 * поэтому считаем здесь и возвращаем инструменту, чтобы тот сказал вслух.
 */
function slotConflicts(text, from, to, kind = 'фокус') {
  const span = slotMinutes(from, to);
  if (!span) throw new Error(`invalid_time:${from}-${to}`);
  return parseSlots(text)
    // Закрытый слот конфликтом не считается — так же его пропускает
    // mark_clashes() на доске: время уже прошло, двигать нечего.
    .filter((slot) => !slot.done)
    .filter((slot) => span.start < slot.to && span.end > slot.from)
    .map((slot) => ({ ...slot, level: slotClashLevel(kind, slot.kind) }))
    .filter((slot) => slot.level) // «дело» и «фон+фокус» — законное совмещение, не показываем как проблему
    .map((slot) => ({ title: slot.title, raw: slot.raw.trim(), level: slot.level }));
}

// ── Загруженность вперёд ─────────────────────────────────────────────────
//
// «Когда можно уехать» — вопрос не про поиск по словам. Поиск находит то, что
// названо теми же словами; свободная неделя не названа никак. Поэтому здесь
// считается ровно то, что человек видит на доске: занятость дня, свободные
// окна и то, что повторяется из недели в неделю.
//
// Числа перенесены из build_board.py, а не выбраны заново. Своя арифметика
// свободного времени — это гарантированное расхождение: инструмент сказал бы
// «вторник свободен», а на доске там стоит зарядка.

/** H0 в build_board.py: раньше семи утра доска день не рисует. */
const BOARD_DAY_START = 7 * 60;
/** NIGHT: после часа ночи «свободно» не рисуем. */
const BOARD_DAY_END = 25 * 60;
/** SNAP: слот короче четверти часа всё равно занимает четверть часа. */
const BOARD_SNAP = 15;
/** Порог годного окна. Меньше — это не «свободно», а щель между делами. */
const FREE_GAP_MIN = 45;

/** Минуты → ЧЧ:ММ. Хвост суток остаётся хвостом: 25:00 показывается как 01:00. */
function minutesToTime(value) {
  const total = ((Math.round(Number(value)) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Свободные окна дня — зеркало freeGaps() из build_board.py, строка в строку.
 * Вход — интервалы в минутах от полуночи с той же разверткой суток (07:00…01:00).
 */
function freeGaps(spans) {
  const busy = spans
    .map((s) => [s.from, Math.max(s.to, s.from + BOARD_SNAP)])
    .sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cur = BOARD_DAY_START;
  for (const [a, b] of busy) {
    if (a - cur >= FREE_GAP_MIN) gaps.push({ from: cur, to: a });
    cur = Math.max(cur, b);
  }
  if (BOARD_DAY_END - cur >= FREE_GAP_MIN) gaps.push({ from: cur, to: BOARD_DAY_END });
  return gaps.map((g) => ({
    from: minutesToTime(g.from), to: minutesToTime(g.to), minutes: g.to - g.from,
  }));
}

/**
 * Занято минут — это объединение интервалов, а не их сумма. Сумма врёт ровно
 * там, где на доске всё и живёт: врезка «забрать торт» стоит внутри вечера у
 * родителей, и сложение выдало бы «занято 26 часов». Объединение к тому же
 * сходится со свободными окнами: занято + свободно = длина суток доски.
 */
function busyMinutes(spans) {
  const clipped = spans
    .map((s) => [s.from, Math.max(s.to, s.from + BOARD_SNAP)])
    .map(([a, b]) => [Math.max(a, BOARD_DAY_START), Math.min(b, BOARD_DAY_END)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur = null;
  for (const [a, b] of clipped) {
    if (!cur) { cur = [a, b]; continue; }
    if (a <= cur[1]) cur[1] = Math.max(cur[1], b);
    else { total += cur[1] - cur[0]; cur = [a, b]; }
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

const RU_WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const RU_WEEKDAY_INDEX = Object.fromEntries(RU_WEEKDAYS.map((w, i) => [w, i]));
const RECURRING_LINE_RE = /^([\wа-яё,-]+)\s+(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s+(.+?)\s*$/i;

/** Дни недели повтора — тот же словарь, что rec_weekdays() на доске. */
function recurringWeekdays(spec) {
  const raw = String(spec || '').toLowerCase().trim();
  if (['ежедневно', 'каждый', 'всегда'].includes(raw)) return [0, 1, 2, 3, 4, 5, 6];
  if (['будни', 'будние'].includes(raw)) return [0, 1, 2, 3, 4];
  if (raw === 'выходные') return [5, 6];
  const out = new Set();
  for (const part of raw.split(',')) {
    const item = part.trim();
    if (item.includes('-')) {
      const [a, b] = item.split('-', 2).map((x) => x.trim());
      if (!(a in RU_WEEKDAY_INDEX) || !(b in RU_WEEKDAY_INDEX)) continue;
      const i = RU_WEEKDAY_INDEX[a];
      const j = RU_WEEKDAY_INDEX[b];
      const range = i <= j
        ? Array.from({ length: j - i + 1 }, (_, k) => i + k)
        : [...Array.from({ length: 7 - i }, (_, k) => i + k), ...Array.from({ length: j + 1 }, (_, k) => k)];
      range.forEach((d) => out.add(d));
    } else if (item in RU_WEEKDAY_INDEX) {
      out.add(RU_WEEKDAY_INDEX[item]);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * `days/recurring.md` — слоты, которые доска подставляет сама. В файлах дней
 * их нет вовсе, поэтому без разбора этого файла зарядка и понедельничный
 * разбор пропали бы из занятости, а окно под них оказалось бы «свободным».
 */
function parseRecurringSlots(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('Дни:') || line.startsWith('Строка')) continue;
    const match = RECURRING_LINE_RE.exec(line);
    if (!match) continue;
    const days = recurringWeekdays(match[1]);
    if (!days.length) continue;
    const raw4 = match[4].trim();
    const { kind, title } = slotKindAndTitle(raw4);
    // Повтор без тега — привычка, а не фокус: ровно так его помечает parse_day()
    // на доске. Иначе зарядка и дзюдо попадали бы в «время, которое требует
    // головы», и полчаса разминки читались бы как полчаса работы.
    out.push({ days, start: match[2], end: match[3], title, kind: SLOT_KIND_RE.test(raw4) ? kind : 'привычка' });
  }
  return out;
}

/** Понедельник = 0, как в build_board.py и в `days/recurring.md`. */
function weekdayIndex(date) {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return (d.getUTCDay() + 6) % 7;
}

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

/** Понедельник недели, в которую попадает дата, — ключ недельной сводки. */
function weekStart(date) {
  const wd = weekdayIndex(date);
  return wd === null ? null : shiftDate(date, -wd);
}

/**
 * Заголовок слота без служебных хвостов: ссылки на задачу и метки места.
 * Нужен только для того, чтобы узнать повтор: `Дзюдо @ЮЗР` и `Дзюдо` — одно
 * и то же событие, а по сырой строке они выглядят разными.
 */
function slotCoreTitle(title) {
  let out = String(title || '').trim();
  const parts = out.split('·').map((p) => p.trim());
  if (parts.length > 1 && parseAddress(parts[parts.length - 1])) {
    out = parts.slice(0, -1).join(' · ').trim();
  }
  out = out.replace(/@\S+/g, '').replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * Загруженность одного дня. Дня без файла не существует как ошибки: это
 * просто свободный день, и показывать его надо именно так — иначе «уехать
 * можно» превращается в «данных нет».
 */
function dayLoad({ date, text = '', recurring = [] } = {}) {
  const own = parseSlots(text, { dayStart: BOARD_DAY_START })
    .map((s) => ({ start: s.start, end: s.end, from: s.from, to: s.to, kind: s.kind, title: s.title, repeat: false }));
  const wd = weekdayIndex(date);
  const have = new Set(own.map((s) => `${s.start}|${slotCoreTitle(s.title)}`));
  const added = [];
  for (const rec of recurring) {
    if (wd === null || !rec.days.includes(wd)) continue;
    if (have.has(`${rec.start}|${slotCoreTitle(rec.title)}`)) continue;
    const span = slotMinutes(rec.start, rec.end, BOARD_DAY_START);
    if (!span) continue;
    added.push({
      start: rec.start, end: rec.end, from: span.start, to: span.end,
      kind: rec.kind || 'привычка', title: rec.title, repeat: true,
    });
  }
  const slots = [...own, ...added].sort((a, b) => a.from - b.from);
  const busy = busyMinutes(slots);
  const focus = busyMinutes(slots.filter((s) => s.kind === 'фокус'));
  return {
    date,
    weekday: wd === null ? null : RU_WEEKDAYS[wd],
    has_file: !!String(text || '').trim(),
    busy_minutes: busy,
    focus_minutes: focus,
    slots: slots.map((s) => ({ from: s.start, to: s.end, title: s.title, kind: s.kind, repeat: s.repeat })),
    free: freeGaps(slots),
  };
}

/**
 * Якоря — то, что повторяется из недели в неделю. Опознаются повторением, а не
 * названием: списка «дзюдо, футбол, зарядка» здесь нет и быть не должно, иначе
 * инструмент знал бы только те якоря, которые кто-то однажды перечислил.
 */
function anchorSlots(days, { minTimes = 2, minWeeks = 2 } = {}) {
  const groups = new Map();
  for (const day of days) {
    for (const slot of day.slots || []) {
      const key = slotCoreTitle(slot.title).toLowerCase();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { title: slotCoreTitle(slot.title), hits: [] });
      groups.get(key).hits.push({ date: day.date, weekday: day.weekday, from: slot.from, to: slot.to, repeat: slot.repeat });
    }
  }
  const out = [];
  for (const group of groups.values()) {
    const dates = [...new Set(group.hits.map((h) => h.date))];
    const weeks = new Set(dates.map((d) => weekStart(d)));
    const fromRecurring = group.hits.some((h) => h.repeat);
    if (!fromRecurring && (dates.length < minTimes || weeks.size < minWeeks)) continue;
    const times = {};
    for (const hit of group.hits) {
      const key = `${hit.from}–${hit.to}`;
      times[key] = (times[key] || 0) + 1;
    }
    const usual = Object.entries(times).sort((a, b) => b[1] - a[1])[0][0];
    out.push({
      title: group.title,
      times: dates.length,
      weeks: weeks.size,
      weekdays: [...new Set(group.hits.map((h) => h.weekday))].filter(Boolean)
        .sort((a, b) => RU_WEEKDAY_INDEX[a] - RU_WEEKDAY_INDEX[b]),
      usual_time: usual,
      source: fromRecurring ? 'days/recurring.md' : 'повтор в днях',
    });
  }
  return out.sort((a, b) => b.times - a.times || a.title.localeCompare(b.title, 'ru'));
}

/**
 * Сводка по неделям: где плотно, где пусто и сколько дней свободны совсем.
 * Именно она отвечает на «в каком месяце уезжать», а не список из тридцати дней.
 */
function weekLoad(days) {
  const byWeek = new Map();
  for (const day of days) {
    const key = weekStart(day.date);
    if (!key) continue;
    if (!byWeek.has(key)) byWeek.set(key, { start: key, days: [], busy_minutes: 0, focus_minutes: 0, free_days: 0 });
    const week = byWeek.get(key);
    week.days.push(day.date);
    week.busy_minutes += day.busy_minutes;
    week.focus_minutes += day.focus_minutes;
    if (day.busy_minutes === 0) week.free_days += 1;
  }
  const weeks = [...byWeek.values()].sort((a, b) => a.start.localeCompare(b.start));
  for (const week of weeks) {
    week.end = week.days[week.days.length - 1];
    // Крайние недели окна почти всегда обрезаны: у первой видно два дня, у
    // последней — четыре. Сравнивать их с целыми по сумме минут нельзя, иначе
    // «свободнее всего» достаётся огрызку недели просто потому, что в кадр
    // попало полтора дня. Полнота недели отдаётся явно, чтобы это было видно.
    week.days_count = week.days.length;
    week.full = week.days.length === 7;
  }
  return weeks;
}

/**
 * Отрезки подряд идущих полностью свободных дней. Это прямой ответ на «когда
 * можно уехать»: не «вторник свободен», а «с 11 по 14 не занято ничего».
 */
function freeStretches(days, { minDays = 2 } = {}) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length >= minDays) out.push({ from: run[0], to: run[run.length - 1], days: run.length });
    run = [];
  };
  for (const day of days) {
    if (day.busy_minutes === 0) run.push(day.date);
    else flush();
  }
  flush();
  return out;
}

/**
 * Отметка привычки. Формат строки — `- Название | дата, дата` — и его нельзя
 * выдумывать: ровно так его читает `parse_habits` и пишет `toggle` в
 * `board_server.py`. Разойдись на разделитель, и доска перестанет видеть
 * отметку, сделанную из чата, а тап по ячейке затрёт её своим форматом.
 */
function markHabit(text, habit, date) {
  const lines = String(text || '').split('\n');
  const needle = String(habit || '').trim().toLowerCase();
  if (!needle) throw new Error('empty_habit');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('- ') || !line.includes('|')) continue;
    const cut = line.slice(2).indexOf('|') + 2;
    const title = line.slice(2, cut).trim();
    if (!title.toLowerCase().includes(needle)) continue;
    const dates = line.slice(cut + 1).split(',').map((d) => d.trim()).filter(Boolean);
    if (dates.includes(date)) return { text: String(text), habit: title, already: true };
    const next = [...new Set([...dates, date])].sort();
    lines[i] = `- ${title} | ${next.join(', ')}`;
    return { text: lines.join('\n'), habit: title, already: false };
  }
  throw new Error(`habit_not_found:${habit}`);
}

module.exports = {
  KEY_PREFIX,
  INDEX_KEY,
  moscowDate,
  SLOT_KINDS,
  slotKindAndTitle,
  slotClashLevel,
  toggleSubtask,
  removeChild,
  cutTask,
  parseSlots,
  slotConflicts,
  markHabit,
  // загруженность вперёд
  BOARD_DAY_START,
  BOARD_DAY_END,
  BOARD_SNAP,
  FREE_GAP_MIN,
  RU_WEEKDAYS,
  minutesToTime,
  freeGaps,
  busyMinutes,
  recurringWeekdays,
  parseRecurringSlots,
  weekdayIndex,
  shiftDate,
  weekStart,
  slotCoreTitle,
  dayLoad,
  anchorSlots,
  weekLoad,
  freeStretches,
  taskHash,
  projectKeyForPath,
  appendToSection,
  prependToSection,
  appendBlock,
  findTaskByHash,
  applyTaskPatch,
  appendChild,
  patchBlock,
  findSectionLine,
  keyForPath,
  pathForKey,
  normalizePath,
  emptyFile,
  ensureFile,
  bumpFile,
  ensureIndex,
  withIndexEntry,
  searchFiles,
  parseTaskLine,
  parseTasks,
  taskTitle,
  taskAddress,
  collectOpenQuestions,
  collectPeopleThreads,
  // разбор фразы
  topicTerms,
  matchTerms,
  findAddresses,
  TOPIC_STOP_WORDS,
  // связи
  parseAddress,
  parseRefLine,
  parseSlotRef,
  collectLinks,
  findTaskByAddress,
  linksFor,
  // дельта
  fileSnapshot,
  diffFile,
  // развитие контекстов
  reviewFindings,
  repeatedThoughts,
  themeTokens,
  // память прохода
  STATE_KEY,
  PROPOSAL_COOLDOWN_DAYS,
  ensureState,
  proposalCooldown,
  pickFindings,
  rememberProposal,
  answerProposal,
  // эксперимент «два ответа»
  VOTES_PATH,
  VOTES_SECTION,
  voteWinner,
  voteLine,
  parseVotes,
  // деньги
  moneyLine,
  parseMoneyOps,
  lastBalance,
  monthAfter,
  parseBudget,
  budgetPicture,
  // как он решает
  PREFS_PATH,
  PREFS_SECTION,
  PREFS_SOFT_LIMIT,
  parsePreferences,
  knownPreference,
  preferenceLine,
  // окружение находки
  projectNeighborhood,
  slotsAround,
  // потолок развилок
  OPEN_DECISIONS_CAP,
  DECISION_SIMILARITY,
  questionSimilarity,
  decisionGuard,
  // что делать сейчас
  PLACE_TAGS,
  TIME_TAGS,
  pickFocus,
};
