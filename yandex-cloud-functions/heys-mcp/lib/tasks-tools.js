'use strict';

/**
 * Инструменты задачника: сетевой слой поверх чистого `lib/tasks.js`.
 *
 * Читающие идут первыми и намеренно щедры на контекст. Методичка задачника
 * (`~/tasks/CLAUDE.md`) требует перед каждым разбором поднять прошлые записи по
 * теме и пройти смежные открытые вопросы — без этого ассистент превращается в
 * пишущую машинку. Поэтому `tasks_search` отдаёт совпадения с окружением, а
 * `tasks_context` собирает по теме сразу всё: задачи, записи журнала, открытые
 * вопросы и обязательства перед людьми.
 *
 * Адресат фиксирован. Задачник принадлежит одному человеку, поэтому клиент
 * берётся из конфигурации, а не из аргумента вызова: лишний параметр здесь —
 * это лишний способ записать не туда.
 */

const tasks = require('./tasks');

const TASKS_TOOL_SCHEMAS = [
  {
    name: 'tasks_read',
    description: 'Прочитать файл задачника целиком: проект, день, месяц журнала, NOW, GOALS, INBOX. Путь такой же, как в репозитории: projects/heys.md, days/2026-08-02.md, journal/2026-08.md.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Путь файла в задачнике, например projects/heys.md.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'tasks_search',
    description: 'Поиск по всему задачнику сразу — задачи, журнал, дни, деньги. Возвращает найденные строки вместе с соседними, чтобы было видно контекст. Вызывай ПЕРЕД разбором новой вводной: в журнале почти всегда уже есть прошлый разговор по этой теме.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Слова для поиска. Строка считается найденной, если содержит все слова.' },
        limit: { type: 'integer', description: 'Сколько совпадений вернуть, по умолчанию 40.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'tasks_context',
    description: 'Всё по теме одним вызовом: подходящие задачи с вложенными строками, записи журнала, открытые вопросы и обязательства «ждём»/«при встрече». Это то, с чего начинается разбор вводной.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Тема: слово, имя человека, название проекта.' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'tasks_list',
    description: 'Что в работе: просроченное, сроки на сегодня и ближайшие дни, задачи с #next. Без аргументов — общая картина по всем проектам.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Имя проекта: heys, kinderly, family, personal, mine2d, travel, someday.' },
        tag: { type: 'string', description: 'Фильтр по тегу без решётки: next, ноут, студия, 15min.' },
      },
    },
  },
];

const TASKS_WRITE_SCHEMAS = [
  {
    name: 'tasks_capture',
    description: 'Положить мысль в задачник: строка в проект или, если проект неясен, в INBOX.md. Это захват — быстрый и без разбора.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Текст задачи. Формулируй глаголом, авторскую формулировку сохраняй.' },
        project: { type: 'string', description: 'heys, kinderly, family, personal, mine2d, travel, someday. Не указан — уходит в INBOX.' },
        priority: { type: 'string', description: 'P1 только если названа внешняя дата или последствие пропуска, иначе P2.' },
        due: { type: 'string', description: 'Срок YYYY-MM-DD.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Теги без решётки: next, ноут, студия, 15min.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'tasks_update',
    description: 'Поменять у задачи срок, приоритет, теги или состояние. Задача адресуется хэшем с доски (heys/0765d3). Заголовок не меняется: на нём держится этот же хэш.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Проект задачи.' },
        hash: { type: 'string', description: 'Шесть символов хэша задачи с доски.' },
        due: { type: 'string', description: 'Новый срок YYYY-MM-DD; пустая строка снимает срок.' },
        priority: { type: 'string', description: 'P1, P2 или P3.' },
        state: { type: 'string', description: 'new, doing, wait или done. Закрывать задачу — только по прямой просьбе.' },
        add_tags: { type: 'array', items: { type: 'string' }, description: 'Теги добавить.' },
        remove_tags: { type: 'array', items: { type: 'string' }, description: 'Теги убрать.' },
        note: { type: 'string', description: 'Вложенная строка контекста: «ждём: Имя — что», «при встрече: …», «открыто: …».' },
      },
      required: ['project', 'hash'],
    },
  },
  {
    name: 'tasks_append',
    description: 'Дописать блок в конец файла: запись в журнал, стенограмму, слот в день, операцию в деньги. Для задач используй tasks_capture.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Файл: journal/2026-08.md, days/2026-08-02.md, money/2026-08.md.' },
        block: { type: 'string', description: 'Текст блока целиком, уже в формате этого файла.' },
      },
      required: ['path', 'block'],
    },
  },
  {
    name: 'tasks_patch',
    description: 'Заменить блок файла между якорями — для переработок вроде «перегруппируй раздел». Требует ревизию файла из tasks_read: если файл с тех пор изменился, правка отклоняется, а не затирает чужое.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Файл задачника.' },
        rev: { type: 'integer', description: 'Ревизия из tasks_read, прочитанная перед правкой.' },
        from: { type: 'string', description: 'Строка-якорь, с которой начинается заменяемый блок (включительно).' },
        to: { type: 'string', description: 'Строка-якорь, до которой идёт блок (не включается). Без неё — до конца файла.' },
        replacement: { type: 'string', description: 'Новый текст блока.' },
      },
      required: ['path', 'rev', 'from', 'replacement'],
    },
  },
];

function createTasksTools({ api, curatorJwt, clientId, nowMs = Date.now(), ToolError, writeContext = null }) {
  let indexPromise = null;

  function requireClient() {
    if (!clientId) {
      throw new ToolError(
        'tasks_not_configured',
        'Задачник не подключён: не задан клиент, под которым он живёт (HEYS_TASKS_CLIENT_ID).',
      );
    }
  }

  async function loadIndex() {
    requireClient();
    if (!indexPromise) {
      indexPromise = (async () => {
        const { data, error } = await api.getKVByCurator(curatorJwt, clientId, tasks.INDEX_KEY);
        if (error) throw new ToolError('upstream_error', `Не удалось прочитать индекс задачника: ${error.message}`);
        return tasks.ensureIndex(data);
      })();
      indexPromise.catch(() => { indexPromise = null; });
    }
    return indexPromise;
  }

  async function readFile(path) {
    requireClient();
    const normalized = tasks.normalizePath(path);
    if (!normalized) throw new ToolError('invalid_path', `Путь «${path}» не похож на файл задачника.`);
    const key = tasks.keyForPath(normalized);
    const { data, error } = await api.getKVByCurator(curatorJwt, clientId, key);
    if (error) throw new ToolError('upstream_error', `Не удалось прочитать ${normalized}: ${error.message}`);
    return tasks.ensureFile(data, normalized);
  }

  /**
   * Чтение пачкой по индексу. Батч ограничен: задачник целиком — это десятки
   * килобайт текста, и тащить их в каждый поиск незачем. Приоритет отдаётся
   * файлам, где ответ вероятнее: проекты, журнал, дни.
   */
  async function readAll({ paths = null, max = 60 } = {}) {
    const index = await loadIndex();
    const known = paths && paths.length ? paths : Object.keys(index.files);
    if (!known.length) return [];
    const selected = known.slice(0, max);
    const keys = selected.map((path) => tasks.keyForPath(path)).filter(Boolean);
    const { data, error } = await api.getKVManyByCurator(curatorJwt, clientId, keys);
    if (error) throw new ToolError('upstream_error', `Не удалось прочитать задачник: ${error.message}`);
    const byKey = data || {};
    return selected
      .map((path) => tasks.ensureFile(byKey[tasks.keyForPath(path)], path))
      .filter((file) => file.text);
  }

  function projectPaths(index) {
    return Object.keys(index.files).filter((path) => path.startsWith('projects/'));
  }

  /**
   * Запись файла: значение и индекс обновляются одним вызовом. Индекс без
   * файла или файл без индекса — расхождение, из-за которого пуллер либо не
   * заберёт правку, либо будет считать её потерянной.
   */
  async function writeFile(file, text) {
    const next = tasks.bumpFile(file, text, nowMs);
    const index = await loadIndex();
    const nextIndex = tasks.withIndexEntry(index, next, nowMs);

    const contextId = writeContext ? await writeContext(clientId) : null;
    const res = await api.upsertKVManyByCurator(curatorJwt, clientId, [
      { k: tasks.keyForPath(next.path), v: next },
      { k: tasks.INDEX_KEY, v: nextIndex },
    ], contextId);
    if (!res.ok) throw new ToolError('save_failed', `Сервер отклонил запись ${next.path}: ${res.error}`);
    indexPromise = Promise.resolve(nextIndex);
    return next;
  }

  const tools = {
    async tasks_read(args = {}) {
      const file = await readFile(args.path);
      if (!file.text) {
        return {
          text: `Файл ${file.path} пустой или ещё не заведён.`,
          structured: { path: file.path, rev: file.rev, text: '' },
        };
      }
      return {
        text: `${file.path} (ревизия ${file.rev}):\n\n${file.text}`,
        structured: { path: file.path, rev: file.rev, text: file.text },
      };
    },

    async tasks_search(args = {}) {
      const query = String(args.query || '').trim();
      if (!query) throw new ToolError('invalid_query', 'Нужны слова для поиска.');
      const files = await readAll({});
      const matches = tasks.searchFiles(files, query, { limit: args.limit || 40 });
      return {
        text: matches.length
          ? `Нашёл ${matches.length} совпадений по «${query}»: ${[...new Set(matches.map((m) => m.path))].join(', ')}.`
          : `По «${query}» в задачнике ничего нет.`,
        structured: { query, matches },
      };
    },

    /**
     * Сборка контекста темы. Открытые вопросы и обязательства идут первыми:
     * методичка требует поднимать их до собственных новых вопросов, иначе
     * ассистент второй раз спрашивает то, что уже висит с прошлой недели.
     */
    async tasks_context(args = {}) {
      const topic = String(args.topic || '').trim();
      if (!topic) throw new ToolError('invalid_topic', 'Нужна тема.');
      const files = await readAll({});
      const normalized = topic.toLowerCase();

      const matchingTasks = [];
      for (const file of files.filter((f) => f.path.startsWith('projects/'))) {
        for (const task of tasks.parseTasks(file)) {
          const haystack = `${task.title} ${task.children.join(' ')}`.toLowerCase();
          if (haystack.includes(normalized)) matchingTasks.push(task);
        }
      }

      const journalHits = tasks.searchFiles(
        files.filter((f) => f.path.startsWith('journal/')),
        topic,
        { limit: 10, context: 3 },
      );
      const open = tasks.collectOpenQuestions(files)
        .filter((q) => `${q.task} ${q.question}`.toLowerCase().includes(normalized));
      const people = tasks.collectPeopleThreads(files)
        .filter((p) => `${p.task} ${p.text}`.toLowerCase().includes(normalized));

      const parts = [];
      if (open.length) parts.push(`открытых вопросов: ${open.length}`);
      if (matchingTasks.length) parts.push(`задач: ${matchingTasks.length}`);
      if (journalHits.length) parts.push(`записей в журнале: ${journalHits.length}`);
      if (people.length) parts.push(`обязательств перед людьми: ${people.length}`);

      return {
        text: parts.length
          ? `По теме «${topic}» — ${parts.join(', ')}.`
          : `По теме «${topic}» в задачнике ничего не нашлось.`,
        structured: { topic, open_questions: open, tasks: matchingTasks, journal: journalHits, people },
      };
    },

    async tasks_list(args = {}) {
      const index = await loadIndex();
      const wanted = args.project
        ? [`projects/${String(args.project).toLowerCase().replace(/\.md$/i, '')}.md`]
        : projectPaths(index);
      const files = await readAll({ paths: wanted });

      const today = new Date(nowMs).toISOString().slice(0, 10);
      const tag = args.tag ? String(args.tag).replace(/^#/, '').toLowerCase() : null;

      const all = files.flatMap((file) => tasks.parseTasks(file))
        .filter((task) => !task.done)
        .filter((task) => !tag || task.tags.some((t) => t.toLowerCase() === tag));

      const overdue = all.filter((task) => task.due && task.due < today);
      const dueToday = all.filter((task) => task.due === today);
      const next = all.filter((task) => task.tags.some((t) => t.toLowerCase() === 'next'));

      return {
        text: `Просрочено: ${overdue.length}, на сегодня: ${dueToday.length}, в #next: ${next.length}, активных всего: ${all.length}.`,
        structured: {
          project: args.project || null,
          tag: tag || null,
          overdue,
          due_today: dueToday,
          next,
          total_active: all.length,
        },
      };
    },
  };

  Object.assign(tools, {
    async tasks_capture(args = {}) {
      const text = String(args.text || '').trim();
      if (!text) throw new ToolError('invalid_text', 'Нужен текст задачи.');

      const project = args.project ? String(args.project).toLowerCase().replace(/\.md$/i, '') : null;
      const path = project ? `projects/${project}.md` : 'INBOX.md';
      const file = await readFile(path);

      const priority = args.priority ? String(args.priority).toUpperCase() : 'P2';
      if (!/^P[123]$/.test(priority)) throw new ToolError('invalid_priority', 'Приоритет — P1, P2 или P3.');
      if (args.due && !/^\d{4}-\d{2}-\d{2}$/.test(args.due)) {
        throw new ToolError('invalid_due', `Срок «${args.due}» не в формате YYYY-MM-DD.`);
      }

      const today = new Date(nowMs).toISOString().slice(0, 10);
      const tags = (args.tags || []).map((t) => `#${String(t).replace(/^#/, '')}`);
      const parts = [`- [ ] ${priority} ${text}`];
      if (args.due) parts.push(`due:${args.due}`);
      parts.push(...tags, `^${today}`);
      const line = parts.join(' ');

      const nextText = project
        ? tasks.appendToSection(file.text, line, '## Задачи')
        : tasks.appendBlock(file.text, line);
      const saved = await writeFile(file, nextText);

      const title = tasks.taskTitle(line);
      const hash = tasks.taskHash(tasks.projectKeyForPath(path), title);
      return {
        text: `Положил в ${saved.path}: ${priority} ${title}${args.due ? `, срок ${args.due}` : ''}. Ссылка: ${tasks.projectKeyForPath(path)}/${hash}`,
        structured: { path: saved.path, rev: saved.rev, hash, title, priority, due: args.due || null, tags },
      };
    },

    async tasks_update(args = {}) {
      const project = String(args.project || '').toLowerCase().replace(/\.md$/i, '');
      if (!project) throw new ToolError('invalid_project', 'Нужен проект задачи.');
      if (!args.hash) throw new ToolError('invalid_hash', 'Нужен хэш задачи с доски.');

      const file = await readFile(`projects/${project}.md`);
      const found = tasks.findTaskByHash(file, args.hash);
      if (!found) {
        throw new ToolError('task_not_found', `В ${file.path} нет задачи с хэшем ${args.hash}. Возьми актуальный через tasks_list.`);
      }

      const lines = file.text.split('\n');
      let patched;
      try {
        patched = tasks.applyTaskPatch(lines[found.line], {
          state: args.state,
          due: args.due,
          priority: args.priority ? String(args.priority).toUpperCase() : undefined,
          addTags: args.add_tags,
          removeTags: args.remove_tags,
        });
      } catch (e) {
        throw new ToolError('invalid_field', `Не могу применить правку: ${e.message}`);
      }

      let nextText = [...lines.slice(0, found.line), patched, ...lines.slice(found.line + 1)].join('\n');
      if (args.note) nextText = tasks.appendChild(nextText, found.line, String(args.note).trim());
      if (nextText === file.text) throw new ToolError('nothing_to_update', 'Не передано ни одного изменения.');

      const saved = await writeFile(file, nextText);
      const changed = [];
      if (args.state) changed.push(`состояние → ${args.state}`);
      if (args.due !== undefined) changed.push(args.due ? `срок → ${args.due}` : 'срок снят');
      if (args.priority) changed.push(`приоритет → ${args.priority}`);
      if (args.add_tags?.length) changed.push(`теги +${args.add_tags.join(', ')}`);
      if (args.remove_tags?.length) changed.push(`теги −${args.remove_tags.join(', ')}`);
      if (args.note) changed.push('добавлена строка контекста');

      return {
        text: `${project}/${args.hash} · ${found.parsed.title}: ${changed.join('; ')}.`,
        structured: { path: saved.path, rev: saved.rev, hash: args.hash, title: found.parsed.title, changed },
      };
    },

    async tasks_append(args = {}) {
      const block = String(args.block || '').trim();
      if (!block) throw new ToolError('invalid_block', 'Нужен текст блока.');
      const file = await readFile(args.path);
      const saved = await writeFile(file, tasks.appendBlock(file.text, block));
      return {
        text: `Дописал в ${saved.path} (${block.split('\n').length} строк).`,
        structured: { path: saved.path, rev: saved.rev, lines: block.split('\n').length },
      };
    },

    /**
     * Единственная операция, которая переписывает кусок файла. Ревизия здесь
     * обязательна: без неё переработка раздела превращается в ту самую
     * целиковую запись, ради отказа от которой всё и затевалось.
     */
    async tasks_patch(args = {}) {
      const file = await readFile(args.path);
      const rev = Number(args.rev);
      if (!Number.isInteger(rev)) throw new ToolError('invalid_rev', 'Нужна ревизия файла из tasks_read.');
      if (rev !== file.rev) {
        throw new ToolError(
          'stale_rev',
          `Файл ${file.path} изменился с момента чтения (была ревизия ${rev}, сейчас ${file.rev}). Перечитай его и повтори правку — иначе затрёшь чужое.`,
          { path: file.path, current_rev: file.rev },
        );
      }
      let nextText;
      try {
        nextText = tasks.patchBlock(file.text, { from: args.from, to: args.to || null, replacement: args.replacement });
      } catch (e) {
        throw new ToolError('anchor_not_found', `Якорь не найден: ${e.message}. Перечитай файл и возьми точную строку.`);
      }
      const saved = await writeFile(file, nextText);
      return {
        text: `Заменил блок в ${saved.path} (ревизия ${saved.rev}).`,
        structured: { path: saved.path, rev: saved.rev },
      };
    },
  });

  return { tools, schemas: [...TASKS_TOOL_SCHEMAS, ...TASKS_WRITE_SCHEMAS] };
}

module.exports = { createTasksTools, TASKS_TOOL_SCHEMAS, TASKS_WRITE_SCHEMAS };
