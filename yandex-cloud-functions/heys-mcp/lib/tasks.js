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

const SLOT_RE = /^-?\s*(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})\s+(.*)$/;

/** Тег вида слота — тот же словарь, что в build_board.py (KIND_RE). */
const SLOT_KIND_RE = /\s*#(фон|дело|фокус|привычка)\b/i;
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

function slotMinutes(from, to) {
  let start = timeToMinutes(from);
  let end = timeToMinutes(to);
  if (start === null || end === null) return null;
  if (start < DAY_TAIL_BEFORE) start += 24 * 60;
  if (end < DAY_TAIL_BEFORE) end += 24 * 60;
  if (end <= start) end += 24 * 60;
  return { start, end };
}

/** Слоты дня как интервалы — чтобы видеть пересечения до записи, а не после. */
function parseSlots(text) {
  const out = [];
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = SLOT_RE.exec(lines[i].trim());
    if (!match) continue;
    const span = slotMinutes(match[1], match[2]);
    if (!span) continue;
    const { kind, title } = slotKindAndTitle(match[3].trim());
    out.push({ line: i, from: span.start, to: span.end, kind, title, raw: lines[i] });
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
    .filter((slot) => span.start < slot.to && span.end > slot.from)
    .map((slot) => ({ ...slot, level: slotClashLevel(kind, slot.kind) }))
    .filter((slot) => slot.level) // «дело» и «фон+фокус» — законное совмещение, не показываем как проблему
    .map((slot) => ({ title: slot.title, raw: slot.raw.trim(), level: slot.level }));
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
  SLOT_KINDS,
  slotKindAndTitle,
  slotClashLevel,
  toggleSubtask,
  removeChild,
  cutTask,
  parseSlots,
  slotConflicts,
  markHabit,
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
