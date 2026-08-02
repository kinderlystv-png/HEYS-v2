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
 * Поиск по задачнику. Возвращает совпадения со строками вокруг: запись журнала
 * без соседних строк бесполезна — по ней не видно, о чём шла речь.
 *
 * Регистр игнорируется, запрос разбивается на слова, и строка считается
 * совпавшей, когда содержит их все. Это ближе к тому, как человек ищет
 * («лендинг версия D»), чем точное вхождение фразы.
 */
function searchFiles(files, query, { context = 2, limitPerFile = 5, limit = 40 } = {}) {
  const terms = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return [];

  const results = [];
  for (const file of files) {
    if (!file || typeof file.text !== 'string' || !file.text) continue;
    const lines = file.text.split('\n');
    let found = 0;
    for (let i = 0; i < lines.length && found < limitPerFile; i += 1) {
      const haystack = lines[i].toLowerCase();
      if (!terms.every((term) => lineMatchesTerm(haystack, term))) continue;
      found += 1;
      results.push({
        path: file.path,
        line: i + 1,
        text: lines[i].trim(),
        context: lines
          .slice(Math.max(0, i - context), Math.min(lines.length, i + context + 1))
          .join('\n'),
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
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

/** Открытые вопросы задачника: вложенные строки `открыто:` под задачами. */
function collectOpenQuestions(files) {
  const out = [];
  for (const file of files) {
    for (const task of parseTasks(file)) {
      for (const child of task.children) {
        if (/^открыто:/i.test(child)) {
          out.push({ path: file.path, task: task.title, question: child.replace(/^открыто:\s*/i, '') });
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
          out.push({ path: file.path, task: task.title, kind: match[1].toLowerCase(), text: match[2] });
        }
      }
    }
  }
  return out;
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

  for (const tag of (patch.addTags || [])) {
    const clean = String(tag).replace(/^#/, '');
    if (!new RegExp(`#${clean}\\b`).test(line)) line = `${line} #${clean}`;
  }
  for (const tag of (patch.removeTags || [])) {
    const clean = String(tag).replace(/^#/, '');
    line = line.replace(new RegExp(`\\s*#${clean}\\b`), '');
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

module.exports = {
  KEY_PREFIX,
  INDEX_KEY,
  taskHash,
  projectKeyForPath,
  appendToSection,
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
  collectOpenQuestions,
  collectPeopleThreads,
};
