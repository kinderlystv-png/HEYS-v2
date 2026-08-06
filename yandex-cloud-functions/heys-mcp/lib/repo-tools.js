'use strict';

/**
 * Инструменты по исходникам приложения: найти, прочитать, посмотреть папку.
 *
 * Зачем. Куратор спрашивает «как в приложении считается белок» и ждёт ответа
 * по тому, как оно работает сейчас, а не по пересказу в документации. Ответ
 * должен опираться на строки кода, поэтому здесь только чтение и только
 * выложенного состояния главной ветки.
 *
 * Когда звать. Это узкий инструмент: вопрос про внутреннее устройство HEYS —
 * формула, порядок расчёта, где живёт правило, что делает функция. На вопросы
 * про клиентов, еду, задачи и переписку он не нужен, и правило про это лежит
 * в инструкциях сервера (lib/curator.js).
 */

const sourceIndex = require('./source-index');

const MAX_QUERY = 200;

const REPO_TOOL_SCHEMAS = [
  {
    name: 'heys_code_search',
    description: 'Найти в исходниках приложения HEYS, где и как что-то устроено: формула, константа, правило, имя функции. Зови только на вопросы о внутреннем устройстве приложения — «как считается», «откуда берётся», «где задано». Для вопросов про клиентов, дневники и задачи он не нужен. Каждая находка помечена видом файла: код, тест, пример, документация — боевой код идёт первым, и отвечать надо по нему, а не по фикстуре.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Что искать: имя переменной, кусок формулы, строка из интерфейса. По умолчанию ищется как есть, регистр не важен.' },
        path: { type: 'string', description: 'Сузить до папки или файла: apps/web/, yandex-cloud-functions/heys-mcp/. Без него ищется по всему приложению.' },
        regex: { type: 'boolean', description: 'Считать query регулярным выражением. По умолчанию false — обычный поиск подстроки.' },
        limit: { type: 'number', description: 'Сколько строк показать, по умолчанию 40.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'heys_code_read',
    description: 'Прочитать кусок файла исходников HEYS по пути и номеру строки — обычно после heys_code_search, чтобы увидеть формулу в контексте. Отдаёт окно строк с нумерацией, а не файл целиком.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Путь файла в репозитории, как его вернул поиск: apps/web/heys_day_calculations.js.' },
        from_line: { type: 'number', description: 'С какой строки читать. По умолчанию с первой.' },
        lines: { type: 'number', description: 'Сколько строк, по умолчанию 80, потолок 400.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'heys_code_tree',
    description: 'Показать, какие файлы лежат в папке исходников HEYS — когда непонятно, откуда начинать поиск. Не отдаёт содержимое.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Префикс пути: apps/web/, packages/. Без него — верхний уровень, что бывает бесполезно: файлов тысячи.' },
        limit: { type: 'number', description: 'Сколько путей показать, по умолчанию 200.' },
      },
    },
  },
];

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Защита от регулярки, которая займёт коннектор целиком.
 *
 * Выражение при regex:true приходит от модели и гоняется синхронно по ~64 МБ
 * текста. Конкурентность функции — одна: пока движок перебирает варианты, встают
 * ВСЕ вызовы коннектора, включая задачник, и так до таймаута в 60 секунд.
 *
 * Почему не «потолок по времени на поиск». Прервать уже начатый match изнутри
 * этого файла нечем: перебор синхронный, таймер не получит управления, пока
 * движок не закончит. Настоящий стоп-кран потребовал бы worker-потока с
 * terminate, а туда пришлось бы копировать архив на каждый поиск — дорого ради
 * редкого случая. Поэтому обе проверки стоят ДО запуска: отказ по форме
 * выражения и замер на короткой приманке. Обе ошибаются только в сторону отказа,
 * и это осознанный размен — лучше отклонить редкое законное выражение с
 * объяснением, чем на минуту повесить весь коннектор.
 */

/**
 * Длина квантификатора в позиции index, если он допускает больше одного повтора.
 * `?`, `{1}` и `{0,1}` повтора не дают и блоуапа не создают — их не считаем.
 */
function repeatQuantifierAt(source, index) {
  const c = source[index];
  if (c === '*' || c === '+') return 1;
  if (c !== '{') return 0;
  const m = /^\{(\d*)(,?)(\d*)\}/.exec(source.slice(index));
  if (!m || (!m[1] && !m[3])) return 0;
  const min = m[1] === '' ? 0 : Number(m[1]);
  const max = m[2] ? (m[3] === '' ? Infinity : Number(m[3])) : min;
  return max >= 2 ? m[0].length : 0;
}

/**
 * Повтор внутри повтора — `(\w+)+`, `(\s*\S+)*`, `((a+)b)+`. Классическая форма
 * экспоненциального отката: движок перебирает все способы поделить одну и ту же
 * подстроку между внутренним и внешним повтором. Разбор нарочно грубый: скобки
 * и классы символов, без анализа пересечения альтернатив. Ложное срабатывание
 * на честном `(a+b)+` возможно и допустимо — пользователю есть что сделать.
 */
function hasNestedRepeat(source) {
  const s = String(source);
  const stack = [];
  let inClass = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '\\') { i += 1; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c === '(') { stack.push(false); continue; }
    if (c === ')') {
      const bodyRepeats = stack.pop();
      const qLen = repeatQuantifierAt(s, i + 1);
      if (qLen && bodyRepeats) return true;
      if (stack.length && (bodyRepeats || qLen)) stack[stack.length - 1] = true;
      i += qLen;
      continue;
    }
    const qLen = repeatQuantifierAt(s, i);
    if (qLen) {
      if (stack.length) stack[stack.length - 1] = true;
      i += qLen - 1;
    }
  }
  return false;
}

/** Приманки: строка из одинаковых символов и обрыв в конце — на них и растёт откат. */
const PROBE_UNITS = ['a', '0', ' ', 'ab'];
const PROBE_BUDGET_MS = 50;

/**
 * Замер на короткой строке. Растим длину по чуть-чуть: у экспоненциального
 * выражения время удваивается с каждым шагом, поэтому оно вылезет за бюджет ещё
 * на длине в пару десятков символов, а честное выражение пройдёт все приманки за
 * доли миллисекунды. Ловит формы, которые не видит разбор по скобкам, например
 * `(a|a)*$`.
 */
function isSlowPattern(pattern) {
  const started = Date.now();
  for (const unit of PROBE_UNITS) {
    for (let n = 10; n <= 30; n += 2) {
      // Хвостом идёт символ, которого в приманке нет: на нём совпадение
      // срывается, и движок начинает перебирать все разбиения — это и есть
      // то место, где плохое выражение уходит в минуты.
      const probe = unit.repeat(Math.ceil(n / unit.length)).slice(0, n) + String.fromCharCode(1);
      pattern.lastIndex = 0;
      pattern.test(probe);
      if (Date.now() - started > PROBE_BUDGET_MS) return true;
    }
  }
  pattern.lastIndex = 0;
  return false;
}

/** Отметка среза: без неё непонятно, к какому состоянию приложения относится ответ. */
function stampOf(manifest) {
  if (!manifest) return '';
  const commit = String(manifest.commit || '').slice(0, 8);
  const built = String(manifest.built_at || '').slice(0, 16).replace('T', ' ');
  if (!commit && !built) return '';
  return ` (срез ${[commit, built].filter(Boolean).join(', ')})`;
}

/**
 * Срез мог приехать не из хранилища, а из памяти процесса: когда S3 не отвечает,
 * source-index отдаёт последний скачанный архив с пометкой stale. Промолчать про
 * это нельзя — ответ по вчерашнему коду звучит ровно так же уверенно, как по
 * свежему, а цена ошибки та же, что у пересказа в документации. Поэтому
 * предупреждение идёт первой строкой, до находок, а не хвостом после них.
 */
function staleNote(result) {
  if (!result || !result.stale) return '';
  return `Хранилище исходников сейчас недоступно — отвечаю по тому, что скачал раньше${stampOf(result.manifest)}: правки, сделанные после него, в срез не попали. Если вопрос про свежую доработку, скажи об этом в ответе.\n`;
}

function describeFailure(status) {
  if (status === 403) return 'Хранилище отказало в доступе к срезу исходников (403): ключи не подходят.';
  if (status === 404) return 'Среза исходников в хранилище нет (404): он ещё ни разу не собирался при выкате.';
  if (status >= 500) return `Хранилище временно недоступно (${status}).`;
  return `Не удалось получить срез исходников (${status || 'нет ответа'}).`;
}

function createRepoTools({ ToolError, env = process.env, client = null } = {}) {
  let cached = client;

  function requireClient() {
    if (cached) return cached;
    const accessKeyId = env && env.S3_ACCESS_KEY_ID;
    const secretAccessKey = env && env.S3_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new ToolError(
        'source_index_not_configured',
        'Доступ к срезу исходников не настроен: у коннектора нет ключей хранилища. Пока этого нет, отвечать по коду нельзя — и делать вид, что смотрел код, тоже нельзя.',
      );
    }
    cached = sourceIndex.createSourceIndexClient({
      accessKeyId,
      secretAccessKey,
      endpoint: (env && env.S3_ENDPOINT) || sourceIndex.DEFAULT_ENDPOINT,
      bucket: (env && env.SOURCE_INDEX_BUCKET) || sourceIndex.DEFAULT_BUCKET,
      prefix: (env && env.SOURCE_INDEX_PREFIX) || sourceIndex.DEFAULT_PREFIX,
    });
    return cached;
  }

  function fail(result) {
    throw new ToolError('source_index_unavailable', describeFailure(result.status));
  }

  const tools = {
    async heys_code_search(args = {}) {
      const raw = String(args.query || '').trim();
      if (!raw) throw new ToolError('invalid_query', 'Что искать? Пустой запрос по коду не выполняется.');
      if (raw.length > MAX_QUERY) throw new ToolError('invalid_query', `Запрос длиннее ${MAX_QUERY} символов — сузь его.`);

      let pattern;
      try {
        pattern = new RegExp(args.regex ? raw : escapeRegExp(raw), 'i');
      } catch (e) {
        throw new ToolError('invalid_query', `Регулярное выражение не разбирается: ${e.message}`);
      }

      // Обычный поиск проверять незачем: escapeRegExp оставляет от запроса голый
      // текст без повторов, откату там взяться неоткуда.
      if (args.regex && (hasNestedRepeat(raw) || isSlowPattern(pattern))) {
        throw new ToolError(
          'invalid_query',
          'Это выражение может считаться минутами, а поиск идёт по всему срезу и в один поток — на это время встанут все вызовы коннектора, включая задачник. Убери повтор внутри повтора: «(\\w+)+» пишется как «\\w+», «(\\s*\\S+)*» — как «\\S+». Если правило сложное, поищи опорное слово обычным поиском без regex и уточни глазами.',
        );
      }

      const limit = Math.min(Math.max(1, Number(args.limit) || sourceIndex.MAX_HITS), sourceIndex.MAX_HITS);
      const result = await requireClient().search({
        pattern,
        pathPrefix: String(args.path || '').replace(/^\/+/, ''),
        maxHits: limit,
      });
      if (!result.ok) fail(result);

      const stamp = stampOf(result.manifest);
      const note = staleNote(result);
      if (!result.hits.length) {
        return {
          text: `${note}По «${raw}» в исходниках ничего не нашлось${stamp}. Просмотрено файлов: ${result.scanned}.`,
          structured: { query: raw, hits: [], scanned: result.scanned, commit: result.manifest && result.manifest.commit, stale: Boolean(result.stale) },
        };
      }

      const lines = result.hits.map((h) => `${h.path}:${h.line} [${h.kind}] ${h.text}`);
      const tail = result.truncated ? `\nПоказаны ${result.hits.length} из ${result.total} — сузь запрос или папку.` : '';
      return {
        text: `${note}Нашёл по «${raw}»${stamp}:\n${lines.join('\n')}${tail}`,
        structured: {
          query: raw,
          stale: Boolean(result.stale),
          commit: result.manifest && result.manifest.commit,
          hits: result.hits.map(({ path, line, kind, text }) => ({ path, line, kind, text })),
          total: result.total,
          truncated: result.truncated,
        },
      };
    },

    async heys_code_read(args = {}) {
      const path = String(args.path || '').trim().replace(/^\/+/, '');
      if (!path) throw new ToolError('invalid_path', 'Какой файл читать? Путь не назван.');
      const result = await requireClient().read({
        path,
        fromLine: Number(args.from_line) || 1,
        lines: Number(args.lines) || undefined,
      });
      if (!result.ok) fail(result);

      const stamp = stampOf(result.manifest);
      const note = staleNote(result);
      if (result.missing) {
        return {
          text: `${note}Файла ${path} в срезе нет${stamp}. Проверь путь через heys_code_search или heys_code_tree — собранные бандлы в срез не входят.`,
          structured: { path, missing: true, stale: Boolean(result.stale) },
        };
      }
      const tail = result.truncated ? `\n… файл длиннее: строк всего ${result.total_lines}.` : '';
      return {
        text: `${note}${path} [${result.kind}], строки ${result.from_line}-${result.to_line} из ${result.total_lines}${stamp}:\n${result.text}${tail}`,
        structured: {
          path,
          stale: Boolean(result.stale),
          kind: result.kind,
          from_line: result.from_line,
          to_line: result.to_line,
          total_lines: result.total_lines,
          commit: result.manifest && result.manifest.commit,
          // heys_code_search кладёт найденный текст прямо в structured
          // (hits[].text) и это надёжно доходит до модели; здесь тот же
          // текст раньше был только в свободном content[].text — воспроизведён
          // случай (heys/5d42b0), где модели приходила ТОЛЬКО эта структура
          // без единой строки кода. Дублируем текст сюда же, а не полагаемся
          // на то, что клиент отрендерит оба канала ответа.
          text: result.text,
        },
      };
    },

    async heys_code_tree(args = {}) {
      const prefix = String(args.path || '').replace(/^\/+/, '');
      const limit = Math.min(Math.max(1, Number(args.limit) || 200), 500);
      const result = await requireClient().list({ pathPrefix: prefix, limit });
      if (!result.ok) fail(result);

      const stamp = stampOf(result.manifest);
      const note = staleNote(result);
      if (!result.files.length) {
        return {
          text: `${note}В срезе нет файлов по пути «${prefix || '/'}»${stamp}.`,
          structured: { path: prefix, files: [], stale: Boolean(result.stale) },
        };
      }
      const lines = result.files.map((f) => `${f.path} — ${Math.round(f.bytes / 1024)} КБ [${f.kind}]`);
      const tail = result.truncated ? `\nПоказаны ${result.files.length} из ${result.total}.` : '';
      return {
        text: `${note}Файлы по «${prefix || '/'}»${stamp}:\n${lines.join('\n')}${tail}`,
        structured: {
          path: prefix,
          stale: Boolean(result.stale),
          files: result.files,
          total: result.total,
          truncated: result.truncated,
          commit: result.manifest && result.manifest.commit,
        },
      };
    },
  };

  return { tools, schemas: REPO_TOOL_SCHEMAS };
}

module.exports = { createRepoTools, REPO_TOOL_SCHEMAS, escapeRegExp, stampOf, describeFailure };
