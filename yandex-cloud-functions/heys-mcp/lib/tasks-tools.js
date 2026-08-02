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
    description: 'Всё по теме одним вызовом: подходящие задачи с вложенными строками, связанное явной ссылкой «см:», записи журнала, открытые вопросы и обязательства «ждём»/«при встрече». Это то, с чего начинается разбор вводной. Передавай его фразу ЦЕЛИКОМ, как он её сказал: значимые слова выделяются здесь, на сервере, и в ответе видно, по каким искали. Не разбивай на несколько вызовов по одному слову — это как раз тот перебор, ради отказа от которого фраза разбирается тут. Честная граница: находит то, что названо теми же словами или связано ссылкой «см:». Пересечения по времени он не видит вовсе — их считает tasks_slot при постановке события, и проверять расписание всё равно нужно.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Фраза человека целиком, тема, имя или адрес задачи с доски (kinderly/8e3572). Предлоги и «надо/давай/поставь» отбрасываются сами, имена, даты, времена и теги — нет.' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'tasks_list',
    description: 'Что в работе: просроченное, сроки на сегодня, задачи с #next и отдельно blocked — то, что висит в «Требует решения» и ждёт его ответа. Без аргументов — общая картина по всем проектам. У каждой задачи в ответе есть её адрес с доски (проект/хэш) — им же она правится через tasks_update и tasks_resolve.',
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

/**
 * Второй слой: то, чем доска управляется целиком, а не только задачами.
 * Каждый из них закрывает панель, которую generic-дописывание сломало бы —
 * привычки хранят списки дат, у операции обязателен контур, слоты умеют
 * пересекаться, а вложенную строку нужно уметь не только повесить, но и снять.
 */
const TASKS_BOARD_SCHEMAS = [
  {
    name: 'tasks_habit',
    description: 'Отметить привычку за день. Повторная отметка той же даты ничего не портит.',
    inputSchema: {
      type: 'object',
      properties: {
        habit: { type: 'string', description: 'Название привычки или его часть.' },
        date: { type: 'string', description: 'Дата YYYY-MM-DD. По умолчанию сегодня.' },
      },
      required: ['habit'],
    },
  },
  {
    name: 'tasks_slot',
    description: 'Поставить событие в день: время, место, что происходит. Пересечения с уже стоящими слотами возвращаются в ответе как conflicts — их считает та же логика, что и доска, так что ложных тревог не будет; уровень «конфликт» назови куратору, «вопрос» упомяни мимоходом.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Дата дня YYYY-MM-DD. По умолчанию сегодня.' },
        from: { type: 'string', description: 'Начало ЧЧ:ММ.' },
        to: { type: 'string', description: 'Конец ЧЧ:ММ.' },
        title: { type: 'string', description: 'Что происходит и где.' },
        presence: { type: 'boolean', description: 'true для крупного блока присутствия («дом у родителей»). Такие пишутся выше слотов задач и получают вид «фон»: кто ниже в файле, тот рисуется поверх, а работа внутри такого блока не считается конфликтом.' },
        kind: {
          type: 'string',
          description: 'Вид слота: «фокус» (по умолчанию) — требует полной головы, второй такой же слот встык это конфликт; «дело» — короткая врезка (позвонить, забрать, пробить чек), уживается внутри чего угодно; «привычка» — не занимает голову, но полезно не сталкивать со сборами; «фон» ставится сам через presence и вручную обычно не нужен.',
        },
        ref: { type: 'string', description: 'Адрес задачи, ради которой этот слот стоит в дне: kinderly/8e3572. Доска сделает слот кликабельным, а tasks_context покажет с той стороны, что под задачу уже выделено время.' },
      },
      required: ['from', 'to', 'title'],
    },
  },
  {
    name: 'tasks_money',
    description: 'Записать операцию в деньги месяца. Контур обязателен — без него операция не попадёт в разбивку на доске. Деньги это зона «спрашивай, а не действуй»: сумму и контур бери у куратора, не подставляй сам.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Сумма в рублях. Расход — положительное число, приход — отрицательное или укажи income: true.' },
        title: { type: 'string', description: 'На что.' },
        contour: { type: 'string', description: 'Контур: семья, дело, обязательства, инструменты, kinderly — как заведено в money/README.md.' },
        income: { type: 'boolean', description: 'true если это приход, а не трата.' },
        date: { type: 'string', description: 'Дата YYYY-MM-DD. По умолчанию сегодня.' },
      },
      required: ['amount', 'title', 'contour'],
    },
  },
  {
    name: 'tasks_subtask',
    description: 'Отметить или снять галочку у подпункта задачи. Подпункт называется текстом, а не номером. Галочки ставит только он: вызывай по прямой просьбе, а не по своему выводу, что шаг вроде бы сделан.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Проект задачи.' },
        hash: { type: 'string', description: 'Хэш задачи с доски.' },
        subtask: { type: 'string', description: 'Текст подпункта или его часть.' },
        done: { type: 'boolean', description: 'false — снять галочку. По умолчанию true.' },
      },
      required: ['project', 'hash', 'subtask'],
    },
  },
  {
    name: 'tasks_resolve',
    description: 'Снять вложенную строку у задачи: ответ на «открыто:» получен, ожидание «ждём:» закрылось. Снимай в том же ходе, когда пришёл ответ, — иначе вопрос всплывёт снова и его зададут второй раз.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Проект задачи.' },
        hash: { type: 'string', description: 'Хэш задачи с доски.' },
        needle: { type: 'string', description: 'Часть текста снимаемой строки.' },
        note: { type: 'string', description: 'Чем заменить: сам ответ, который теперь известен. Без него строка просто снимается.' },
      },
      required: ['project', 'hash', 'needle'],
    },
  },
  {
    name: 'tasks_decision',
    description: 'Положить на доску развилку, которую может решить только куратор: конфликт в расписании, выбор между вариантами, недостающий факт. Появляется в блоке «Требует решения», вопросы — в блоке «Открыто». Вызывай вместо того, чтобы держать вопрос в переписке: чат он закроет и забудет, доска останется. Один вызов — одна развилка.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Проект, к которому относится развилка: heys, kinderly, family, personal, mine2d, travel, someday.' },
        title: { type: 'string', description: 'Что решить — одной строкой, глаголом. «Выбрать день второго дзюдо», а не «дзюдо».' },
        questions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Вопросы, на которые нужен его ответ. Каждый — отдельной строкой, коротко и по сути. Ответ на вопрос должен менять то, что ты сделаешь дальше; иначе это не вопрос, а мысль вслух.',
        },
        context: {
          type: 'array',
          items: { type: 'string' },
          description: 'Факты, без которых вопрос не читается: что уже стоит в расписании, что с чем пересекается, какой вариант ты считаешь лучшим. Без пересказа очевидного.',
        },
        hash: { type: 'string', description: 'Хэш существующей задачи, если развилка относится к ней. Тогда вопросы лягут под неё, а не заведут вторую задачу про то же.' },
      },
      required: ['project', 'title', 'questions'],
    },
  },
  {
    name: 'tasks_move',
    description: 'Перенести задачу со всеми её вложенными строками в другой проект или в архив.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Откуда.' },
        hash: { type: 'string', description: 'Хэш задачи с доски.' },
        to: { type: 'string', description: 'Куда: имя проекта либо «archive» для переноса в архив текущего месяца.' },
      },
      required: ['project', 'hash', 'to'],
    },
  },
];

/**
 * Третий слой: агент, который не начинает каждый раз с нуля.
 *
 * Дельта даёт повод входить часто и дёшево — не во весь задачник, а в то, что
 * изменилось. Связи превращают набор файлов в сеть: задача, запись журнала и
 * человек связаны явной ссылкой, а не случайным совпадением слов. Обзор
 * замечает то, что методичка велит замечать самому, и помнит, что уже
 * предлагал, — без этой памяти он превращается в генератор шума.
 */
const TASKS_AGENT_SCHEMAS = [
  {
    name: 'tasks_delta',
    description: 'Что изменилось в задачнике с твоего прошлого прохода: новые и закрытые задачи, дописанное в журнал и дни, изменившиеся строки контекста. Вход дешёвый — читаются только изменившиеся файлы, — поэтому вызывать можно часто: в начале сессии, перед ритуалом, после паузы. Отпечаток прошлого прохода запоминается на сервере и переживает сессию.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'Смотреть с этого момента (YYYY-MM-DD или ISO-время), а не с прошлого прохода. При этом метка прохода не сдвигается.' },
        mark: { type: 'boolean', description: 'false — посмотреть, не запоминая: следующий вызов покажет то же самое. По умолчанию проход запоминается.' },
      },
    },
  },
  {
    name: 'tasks_link',
    description: 'Связать задачу с другой явной ссылкой «см: проект/хэш». Нужна там, где связь есть по смыслу, но не по словам: смета лежит в kinderly, а оплата — в family, и поиском они друг друга не находят. Ссылка хранится в одну сторону, а видна в обе: tasks_context по любой из двух задач покажет вторую.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Проект задачи, от которой ставится ссылка.' },
        hash: { type: 'string', description: 'Хэш этой задачи с доски.' },
        to: { type: 'string', description: 'Адрес второй задачи целиком: kinderly/8e3572.' },
        note: { type: 'string', description: 'Чем они связаны — коротко. «общая смета», «оплачивается отсюда».' },
      },
      required: ['project', 'hash', 'to'],
    },
  },
  {
    name: 'tasks_review',
    description: 'Обход задачника на предмет того, что видно только сверху: тема переросла проект, тема расползлась по трём проектам, обещание человеку висит третью неделю, проект пора схлопнуть, мысль ходит по журналу кругами. Отдаёт НЕ БОЛЬШЕ ТРЁХ находок за проход и по умолчанию кладёт их на доску через развилку. Помнит, что уже предлагал: отклонённое не поднимается месяц. Вызывай на ритуалах и на «что нового», а не после каждой реплики.',
    inputSchema: {
      type: 'object',
      properties: {
        post: { type: 'boolean', description: 'false — только показать находки, не класть на доску. По умолчанию кладёт: вопрос в переписке он закроет вместе с чатом.' },
        limit: { type: 'integer', description: 'Сколько находок вернуть, максимум 3. Больше нельзя: длинный список наблюдений перестают читать.' },
      },
    },
  },
  {
    name: 'tasks_proposal',
    description: 'Ответ на твоё же предложение: он сказал «нет» — запомни, чтобы не приставать месяц; сказал «да» — отметь принятым. Без аргументов показывает всё, что ты уже предлагал, и когда про это можно заговорить снова.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Ключ находки из tasks_review.' },
        answer: { type: 'string', description: '«нет» — отклонено (молчим месяц), «да» — принято, «позже» — вернуться через две недели.' },
        note: { type: 'string', description: 'Его формулировка ответа, если она объясняет отказ.' },
      },
    },
  },
  {
    name: 'tasks_focus',
    description: 'Что делать прямо сейчас: не больше трёх задач под место, время и состояние. «Есть час», «я в студии», «голова не варит» — это ситуация, а не просьба показать всё. Отбор идёт по подходящести, а не по возрасту задачи, и у каждой в ответе есть причина, почему она здесь.',
    inputSchema: {
      type: 'object',
      properties: {
        place: { type: 'string', description: 'Где он: студия, дом, ноут, город. Задачи с чужим местом не предлагаются вовсе — их физически не сделать.' },
        minutes: { type: 'integer', description: 'Сколько времени есть, в минутах. Задачи заведомо длиннее окна отсеиваются.' },
        mood: { type: 'string', description: '«устал» или «голова не варит» — тогда наверх идут короткие и понятные, а не самые важные.' },
        project: { type: 'string', description: 'Ограничить одним проектом, если он сам его назвал.' },
      },
    },
  },
];

function createTasksTools({ api, curatorJwt, clientId, nowMs = Date.now(), ToolError, writeContext = null }) {
  let indexPromise = null;
  let statePromise = null;

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

  /**
   * Память прохода. Лежит отдельным ключом и намеренно НЕ попадает в индекс
   * задачника: индекс — это список файлов, которые пуллер выкладывает на диск,
   * а память прохода файлом не является и на диске ей делать нечего.
   */
  async function loadState() {
    requireClient();
    if (!statePromise) {
      statePromise = (async () => {
        const { data, error } = await api.getKVByCurator(curatorJwt, clientId, tasks.STATE_KEY);
        if (error) throw new ToolError('upstream_error', `Не удалось прочитать память прохода: ${error.message}`);
        return tasks.ensureState(data);
      })();
      statePromise.catch(() => { statePromise = null; });
    }
    return statePromise;
  }

  async function writeState(next) {
    const value = { ...next, updatedAt: nowMs };
    const contextId = writeContext ? await writeContext(clientId) : null;
    const res = await api.upsertKVManyByCurator(curatorJwt, clientId, [{ k: tasks.STATE_KEY, v: value }], contextId);
    if (!res.ok) throw new ToolError('save_failed', `Не удалось сохранить память прохода: ${res.error}`);
    statePromise = Promise.resolve(value);
    return value;
  }

  /**
   * Задача с её адресом на доске. Всё читающее отдаёт задачи только так: без
   * адреса вызывающему пришлось бы считать хэш самому, повторив у себя разбор
   * заголовка, — и однажды разойтись с доской.
   */
  function withAddress(task) {
    return { ...task, ...tasks.taskAddress(task.path, task.title) };
  }

  const tools = {
    async tasks_read(args = {}) {
      const file = await readFile(args.path);
      if (!file.text) {
        return {
          text: `Файл ${file.path} пустой или ещё не заведён.`,
          structured: { path: file.path, rev: file.rev, text: '', tasks: [] },
        };
      }
      // Текст файла отдаётся как есть, а рядом — список задач с адресами:
      // в самом markdown хэша нет, и по прочитанному файлу править задачу
      // было бы нечем.
      const inFile = /^projects\//i.test(file.path)
        ? tasks.parseTasks(file).map((task) => {
          const { ref, hash, project } = tasks.taskAddress(file.path, task.title);
          return { ref, hash, project, title: task.title, line: task.line, done: task.done, waiting: task.waiting, due: task.due, priority: task.priority, tags: task.tags };
        })
        : [];
      return {
        text: `${file.path} (ревизия ${file.rev}):\n\n${file.text}`,
        structured: { path: file.path, rev: file.rev, text: file.text, tasks: inFile },
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
      const topic = String(args.topic || args.phrase || '').trim();
      if (!topic) throw new ToolError('invalid_topic', 'Нужна фраза или тема.');
      const files = await readAll({});

      // Адрес задачи с доски — самый точный вход: и когда он передан целиком,
      // и когда просто упомянут внутри фразы («что там по kinderly/8e3572»).
      const addresses = tasks.parseAddress(topic)
        ? [tasks.parseAddress(topic)]
        : tasks.findAddresses(topic);
      const seeds = addresses
        .map((address) => tasks.findTaskByAddress(files, address))
        .filter(Boolean);

      // Значимые слова выделяются здесь, а не моделью: решение «что искать» —
      // это ровно то место, где промахиваются и потом перебирают запросы по
      // одному. Фраза приходит целиком, разбор её делает код.
      const { terms, dropped } = tasks.topicTerms(topic);

      const matchingTasks = [...seeds];
      const scored = [];
      for (const file of files.filter((f) => f.path.startsWith('projects/'))) {
        for (const task of tasks.parseTasks(file)) {
          if (seeds.some((s) => s.path === task.path && s.line === task.line)) continue;
          const { score, hit } = tasks.matchTerms(`${task.title} ${task.children.join(' ')}`, terms);
          if (!score) continue;
          scored.push({ ...task, score, matched: hit });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      matchingTasks.push(...scored.slice(0, 12));
      // Адрес — у каждой найденной задачи: иначе снять по ней вопрос можно
      // только пересчитав хэш на своей стороне.
      const foundTasks = matchingTasks.map(withAddress);

      /**
       * Связанное по явной ссылке. Это главное отличие от поиска: совпадение
       * слов находит то, что похоже, а ссылка — то, что человек сам связал.
       * Смотрим в обе стороны: ссылку ставили один раз, и с той стороны, где
       * её не писали, связь всё равно должна быть видна.
       */
      const allLinks = tasks.collectLinks(files);
      const linked = [];
      const seenLink = new Set();
      for (const task of matchingTasks.slice(0, 8)) {
        const project = tasks.projectKeyForPath(task.path);
        const hash = tasks.taskHash(project, task.title);
        const { outgoing, incoming } = tasks.linksFor(files, { project, hash }, allLinks);
        for (const link of outgoing) {
          const id = `out:${project}/${hash}:${link.ref}`;
          if (seenLink.has(id)) continue;
          seenLink.add(id);
          linked.push({ direction: 'ссылается на', from: `${project}/${hash}`, from_title: task.title, ...link });
        }
        for (const link of incoming) {
          const id = `in:${project}/${hash}:${link.path}:${link.line}`;
          if (seenLink.has(id)) continue;
          seenLink.add(id);
          linked.push({ direction: 'ссылается сюда', to: `${project}/${hash}`, to_title: task.title, ...link });
        }
      }

      const journalHits = tasks.searchFiles(
        files.filter((f) => f.path.startsWith('journal/')),
        topic,
        { limit: 10, context: 3, terms, any: terms.length > 1 },
      );
      const open = tasks.collectOpenQuestions(files)
        .filter((q) => tasks.matchTerms(`${q.task} ${q.question}`, terms).score > 0);
      const people = tasks.collectPeopleThreads(files)
        .filter((p) => tasks.matchTerms(`${p.task} ${p.text}`, terms).score > 0);

      const parts = [];
      if (open.length) parts.push(`открытых вопросов: ${open.length}`);
      if (foundTasks.length) parts.push(`задач: ${foundTasks.length}`);
      if (linked.length) parts.push(`связанного по ссылкам: ${linked.length}`);
      if (journalHits.length) parts.push(`записей в журнале: ${journalHits.length}`);
      if (people.length) parts.push(`обязательств перед людьми: ${people.length}`);

      // Слова, по которым искали, возвращаются всегда. Без них непонятно,
      // почему контекст не нашёлся, и модель начинает гадать и перебирать
      // запросы — то самое поведение, от которого этот разбор и уводит.
      const words = terms.map((t) => t.word);
      const searchedBy = words.length ? ` Искал по словам: ${words.join(', ')}.` : '';

      return {
        text: parts.length
          ? `По «${topic}» — ${parts.join(', ')}.${searchedBy}`
          : `По «${topic}» в задачнике ничего не нашлось.${searchedBy}`,
        structured: {
          topic,
          terms: words,
          ignored: dropped,
          refs: addresses.map((a) => `${a.project}/${a.hash}`),
          open_questions: open,
          tasks: foundTasks,
          linked,
          journal: journalHits,
          people,
        },
      };
    },

    async tasks_list(args = {}) {
      const index = await loadIndex();
      const wanted = args.project
        ? [`projects/${String(args.project).toLowerCase().replace(/\.md$/i, '')}.md`]
        : projectPaths(index);
      const files = await readAll({ paths: wanted });

      const today = tasks.moscowDate(nowMs);
      const tag = args.tag ? String(args.tag).replace(/^#/, '').toLowerCase() : null;

      const all = files.flatMap((file) => tasks.parseTasks(file))
        .filter((task) => !task.done)
        .filter((task) => !tag || task.tags.some((t) => t.toLowerCase() === tag))
        .map(withAddress);

      const overdue = all.filter((task) => task.due && task.due < today);
      const dueToday = all.filter((task) => task.due === today);
      const next = all.filter((task) => task.tags.some((t) => t.toLowerCase() === 'next'));
      // «Требует решения» — то, что ждёт его ответа. Без отдельного списка эти
      // задачи не попадали никуда: срока у развилки обычно нет, #next тоже, —
      // и «покажи, что требует решения» приходилось закрывать чтением файлов
      // мимо инструмента.
      const blocked = all.filter((task) => task.tags.some((t) => t.toLowerCase() === 'blocked')
        || task.children.some((c) => /^открыто:/i.test(c)));

      return {
        text: `Просрочено: ${overdue.length}, на сегодня: ${dueToday.length}, в #next: ${next.length}, требует решения: ${blocked.length}, активных всего: ${all.length}.`,
        structured: {
          project: args.project || null,
          tag: tag || null,
          overdue,
          due_today: dueToday,
          next,
          blocked,
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

      const today = tasks.moscowDate(nowMs);
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

  /** Задача по хэшу: общий вход для инструментов, которые её правят. */
  async function locateTask(project, hash) {
    const key = String(project || '').toLowerCase().replace(/\.md$/i, '');
    if (!key) throw new ToolError('invalid_project', 'Нужен проект задачи.');
    if (!hash) throw new ToolError('invalid_hash', 'Нужен хэш задачи с доски.');
    const file = await readFile(`projects/${key}.md`);
    const found = tasks.findTaskByHash(file, hash);
    if (!found) {
      throw new ToolError('task_not_found', `В ${file.path} нет задачи с хэшем ${hash}. Возьми актуальный через tasks_list.`);
    }
    return { file, found, key };
  }

  // Дата по Москве, а не по UTC: задачник живёт по МСК, и с полуночи до трёх
  // ночи «сегодня» по серверу — это ещё вчера по его календарю.
  function today() {
    return tasks.moscowDate(nowMs);
  }

  Object.assign(tools, {
    async tasks_habit(args = {}) {
      const date = args.date || today();
      const file = await readFile('habits.md');
      let result;
      try {
        result = tasks.markHabit(file.text, args.habit, date);
      } catch (e) {
        throw new ToolError('habit_not_found', `Привычка «${args.habit}» не найдена в habits.md: ${e.message}`);
      }
      if (result.already) {
        return { text: `«${result.habit}» за ${date} уже отмечена.`, structured: { habit: result.habit, date, already: true } };
      }
      const saved = await writeFile(file, result.text);
      return {
        text: `Отметил «${result.habit}» за ${date}.`,
        structured: { habit: result.habit, date, already: false, rev: saved.rev },
      };
    },

    async tasks_slot(args = {}) {
      const date = args.date || today();
      const file = await readFile(`days/${date}.md`);

      let kind = args.kind ? String(args.kind).toLowerCase() : (args.presence ? 'фон' : 'фокус');
      if (!tasks.SLOT_KINDS.has(kind)) {
        throw new ToolError('invalid_kind', `Вид «${args.kind}» не из словаря доски: фон, дело, фокус, привычка.`);
      }

      let conflicts;
      try {
        conflicts = tasks.slotConflicts(file.text, args.from, args.to, kind);
      } catch (e) {
        throw new ToolError('invalid_time', `Время «${args.from}–${args.to}» не в формате ЧЧ:ММ.`);
      }

      // Тег пишется всегда, даже для «фокус» по умолчанию: без него доска
      // подставляет тот же смысл сама, но именно эта неявность и завела нас в
      // ложный конфликт — слот без тега и соседний слот без тега считались
      // «два дела требуют головы одновременно», хотя один из них был врезкой
      // на пятнадцать минут.
      // Привязка слота к задаче пишется тем же видом, который доска читает
      // сама: «… · kinderly/8e3572». Свой формат здесь был бы двойником уже
      // работающего, и доска перестала бы делать слот кликабельным.
      let ref = null;
      if (args.ref) {
        ref = tasks.parseAddress(args.ref);
        if (!ref) throw new ToolError('invalid_ref', `Ссылка «${args.ref}» не похожа на адрес с доски. Нужно «проект/хэш», например kinderly/8e3572.`);
        const refFile = await readFile(`projects/${ref.project}.md`);
        if (!tasks.findTaskByHash(refFile, ref.hash)) {
          throw new ToolError('ref_not_found', `В ${refFile.path} нет задачи ${ref.project}/${ref.hash}.`);
        }
      }
      const refTail = ref ? ` · ${ref.project}/${ref.hash}` : '';
      const line = `- ${args.from}–${args.to} ${String(args.title).trim()}${refTail} #${kind}`;
      // Крупные блоки присутствия идут выше слотов задач: доска рисует то, что
      // ниже в файле, поверх — иначе блок закроет собой всё, что внутри него.
      const nextText = args.presence
        ? [line, ...String(file.text || '').split('\n')].join('\n').replace(/^\n+/, '')
        : tasks.appendBlock(file.text, line);
      const saved = await writeFile(file, nextText);

      const real = conflicts.filter((c) => c.level === 'конфликт');
      const soft = conflicts.filter((c) => c.level === 'вопрос');
      let warn = '';
      if (real.length) warn += ` Конфликт с: ${real.map((c) => c.title).join('; ')} — скажи об этом куратору.`;
      if (soft.length) warn += ` Стоит уточнить: ${soft.map((c) => c.title).join('; ')}.`;

      return {
        text: `Поставил на ${date}: ${args.from}–${args.to} ${args.title} (${kind}).${warn}`,
        structured: { date, from: args.from, to: args.to, title: args.title, kind, ref: ref ? `${ref.project}/${ref.hash}` : null, conflicts, rev: saved.rev },
      };
    },

    async tasks_money(args = {}) {
      const contour = String(args.contour || '').trim();
      if (!contour) throw new ToolError('contour_required', 'У операции обязателен контур — без него она не попадёт в разбивку на доске.');
      const amount = Number(args.amount);
      if (!Number.isFinite(amount) || amount === 0) throw new ToolError('invalid_amount', 'Сумма должна быть числом и не нулём.');
      const date = args.date || today();
      const month = date.slice(0, 7);

      const file = await readFile(`money/${month}.md`);
      const sign = args.income ? '+' : '';
      const line = `- ${date} ${sign}${Math.abs(amount)} ₽ · ${String(args.title).trim()} · ${contour}`;
      const saved = await writeFile(file, tasks.appendBlock(file.text, line));
      return {
        text: `Записал в деньги за ${month}: ${sign}${Math.abs(amount)} ₽ · ${args.title} · ${contour}.`,
        structured: { date, amount, income: !!args.income, title: args.title, contour, path: saved.path, rev: saved.rev },
      };
    },

    async tasks_subtask(args = {}) {
      const { file, found, key } = await locateTask(args.project, args.hash);
      let result;
      try {
        result = tasks.toggleSubtask(file.text, found.line, args.subtask, args.done !== false);
      } catch (e) {
        throw new ToolError('subtask_not_found', `У задачи нет подпункта «${args.subtask}». Посмотри её через tasks_read.`);
      }
      const saved = await writeFile(file, result.text);
      return {
        text: `${key}/${args.hash} · ${found.parsed.title}: подпункт «${result.matched}» ${args.done === false ? 'снят' : 'отмечен'}.`,
        structured: { path: saved.path, rev: saved.rev, hash: args.hash, subtask: result.matched, done: args.done !== false },
      };
    },

    async tasks_resolve(args = {}) {
      const { file, found, key } = await locateTask(args.project, args.hash);
      let result;
      try {
        result = tasks.removeChild(file.text, found.line, args.needle);
      } catch (e) {
        throw new ToolError('child_not_found', `У задачи нет строки со словами «${args.needle}».`);
      }
      let nextText = args.note ? tasks.appendChild(result.text, found.line, String(args.note).trim()) : result.text;

      // Сняли последний «открыто:» — задача больше не ждёт решения, и тег
      // #blocked обязан уйти вместе с ним. Иначе блок «Требует решения»
      // копит уже решённое, перестаёт быть коротким и его перестают читать.
      const lines = nextText.split('\n');
      const stillOpen = tasks.parseTasks({ path: file.path, text: nextText })
        .find((t) => t.line - 1 === found.line)?.children
        .some((c) => /^открыто:/i.test(c));
      let unblocked = false;
      if (!stillOpen && /#blocked\b/.test(lines[found.line])) {
        lines[found.line] = tasks.applyTaskPatch(lines[found.line], { removeTags: ['blocked'] });
        nextText = lines.join('\n');
        unblocked = true;
      }

      const saved = await writeFile(file, nextText);
      return {
        text: `${key}/${args.hash} · ${found.parsed.title}: снял «${result.removed}»${args.note ? ', записал ответ' : ''}${unblocked ? '. Открытых вопросов больше нет — убрал из «Требует решения»' : ''}.`,
        structured: { path: saved.path, rev: saved.rev, hash: args.hash, removed: result.removed, note: args.note || null, unblocked },
      };
    },

    /**
     * Развилка на доску. Ничего нового в формате не изобретаем: доска уже
     * собирает блок «Требует решения» из задач с тегом #blocked, а панель
     * «Открыто» — из вложенных строк «открыто:». Инструмент просто пишет
     * развилку в этом виде, поэтому она видна там, где куратор её и ищет.
     *
     * Почему это нужно отдельным инструментом: вопрос, заданный в переписке,
     * живёт до конца разговора. Куратор закрывает чат, вопрос исчезает, а
     * решение так и не принято — и следующий проход начинается с того же
     * вопроса. На доске он лежит, пока на него не ответят.
     */
    async tasks_decision(args = {}) {
      const questions = (Array.isArray(args.questions) ? args.questions : [])
        .map((q) => String(q).trim())
        .filter(Boolean);
      if (!questions.length) throw new ToolError('questions_required', 'Нужен хотя бы один вопрос, ответ на который меняет твои дальнейшие действия.');

      const context = (Array.isArray(args.context) ? args.context : [])
        .map((c) => String(c).trim())
        .filter(Boolean);

      // Развилка по существующей задаче вешается на неё: вторая задача про то
      // же самое разводит контекст по двум местам, и отвечать приходится дважды.
      if (args.hash) {
        const { file, found, key } = await locateTask(args.project, args.hash);
        const lines = file.text.split('\n');
        const blocked = /#blocked\b/.test(lines[found.line])
          ? lines[found.line]
          : tasks.applyTaskPatch(lines[found.line], { addTags: ['blocked'] });
        let nextText = [...lines.slice(0, found.line), blocked, ...lines.slice(found.line + 1)].join('\n');
        for (const line of [...context, ...questions.map((q) => `открыто: ${q}`)]) {
          nextText = tasks.appendChild(nextText, found.line, line);
        }
        const saved = await writeFile(file, nextText);
        return {
          text: `${key}/${args.hash} · ${found.parsed.title}: развилка на доске, вопросов ${questions.length}.`,
          structured: { path: saved.path, rev: saved.rev, hash: args.hash, title: found.parsed.title, questions, attached: true },
        };
      }

      const project = String(args.project || '').toLowerCase().replace(/\.md$/i, '');
      if (!project) throw new ToolError('invalid_project', 'Нужен проект развилки.');
      const title = String(args.title || '').trim();
      if (!title) throw new ToolError('invalid_title', 'Нужно, что именно решить — одной строкой, глаголом.');

      const file = await readFile(`projects/${project}.md`);
      const today_ = today();
      // P2, а не P1: развилка ждёт ответа, но внешнего срока у неё нет. P1 без
      // названной даты или последствия пропуска ставит её в один ряд с
      // настоящей срочностью, и тогда «Требует решения» начинает соревноваться
      // с просрочкой — а читать перестают оба списка.
      const line = `- [ ] P2 ${title} #blocked ^${today_}`;
      let nextText = tasks.appendToSection(file.text, line, '## Задачи');

      // Строку задачи ищем после вставки: appendToSection кладёт её в конец
      // своего раздела, а не файла, поэтому номер строки заранее не известен.
      const taskLine = nextText.split('\n').findIndex((l) => l === line);
      for (const child of [...context, ...questions.map((q) => `открыто: ${q}`)]) {
        nextText = tasks.appendChild(nextText, taskLine, child);
      }
      const saved = await writeFile(file, nextText);

      const hash = tasks.taskHash(project, tasks.taskTitle(line));
      return {
        text: `Положил на доску: ${title}. Вопросов: ${questions.length}. Ссылка: ${project}/${hash}`,
        structured: { path: saved.path, rev: saved.rev, hash, title, questions, context, attached: false },
      };
    },

    async tasks_move(args = {}) {
      const { file, found, key } = await locateTask(args.project, args.hash);
      const target = String(args.to || '').toLowerCase().replace(/\.md$/i, '');
      if (!target) throw new ToolError('invalid_target', 'Нужно, куда переносить.');
      if (target === key) throw new ToolError('same_project', 'Задача уже в этом проекте.');

      const targetPath = target === 'archive'
        ? `archive/${today().slice(0, 7)}.md`
        : `projects/${target}.md`;

      const cut = tasks.cutTask(file.text, found.line);
      const targetFile = await readFile(targetPath);
      const nextTarget = target === 'archive'
        ? tasks.appendBlock(targetFile.text, cut.block)
        : tasks.appendToSection(targetFile.text, cut.block, '## Задачи');

      // Порядок важен: сначала кладём в приёмник, потом убираем из источника.
      // Обратный порядок при сбое между записями теряет задачу целиком.
      const savedTarget = await writeFile(targetFile, nextTarget);
      const savedSource = await writeFile(file, cut.text);

      const newHash = target === 'archive' ? null : tasks.taskHash(target, found.parsed.title);
      return {
        text: `Перенёс «${found.parsed.title}» из ${key} в ${target}.${newHash ? ` Новая ссылка: ${target}/${newHash}` : ''}`,
        structured: {
          from: savedSource.path,
          to: savedTarget.path,
          title: found.parsed.title,
          old_hash: args.hash,
          new_hash: newHash,
        },
      };
    },
  });

  // ── Агентский слой: дельта, связи, развитие контекстов ─────────────────

  function parseSince(value) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Date.parse(`${raw}T00:00:00+03:00`); // задачник живёт по МСК
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
    throw new ToolError('invalid_since', `Не понимаю момент «${value}». Нужна дата YYYY-MM-DD или ISO-время.`);
  }

  Object.assign(tools, {
    /**
     * Разница с прошлого прохода.
     *
     * Дешевизна здесь — не оптимизация, а условие работоспособности: обход,
     * который стоит как чтение всего задачника, делают раз в день и потому
     * никогда. По индексу видно, какие файлы трогали, и читаются только они.
     */
    async tasks_delta(args = {}) {
      const index = await loadIndex();
      const state = await loadState();
      const sinceMs = args.since ? parseSince(args.since) : null;
      const seen = state.seen.files;
      const known = Object.keys(index.files);
      const firstPass = !sinceMs && !Object.keys(seen).length;

      const changedPaths = known.filter((path) => {
        const meta = index.files[path] || {};
        if (sinceMs) return (Number(meta.updatedAt) || 0) > sinceMs;
        const was = seen[path];
        return !was || Number(was.rev) !== (Number(meta.rev) || 0);
      });
      const gonePaths = Object.keys(seen).filter((path) => !index.files[path]);

      // Явный `since` — это разовый взгляд назад, а не проход: двигать метку
      // по нему нельзя, иначе следующий обычный вызов промолчит про то, что
      // на самом деле ещё не видели.
      const mark = args.mark !== false && !sinceMs;
      const toRead = firstPass ? known : changedPaths;
      const files = toRead.length ? await readAll({ paths: toRead, max: firstPass ? known.length : 40 }) : [];

      const diffs = [];
      const snapshots = {};
      for (const file of files) {
        const { diff, snapshot } = tasks.diffFile(seen[file.path] || null, file);
        snapshots[file.path] = snapshot;
        if (!firstPass) diffs.push(diff);
      }
      // Файл с выросшей ревизией, но пустым текстом батч не возвращает. Такой
      // файл всё равно называем и всё равно запоминаем: без отпечатка он будет
      // числиться изменившимся в каждом следующем проходе.
      for (const path of (firstPass ? known : changedPaths)) {
        if (snapshots[path]) continue;
        const meta = index.files[path] || {};
        snapshots[path] = { rev: Number(meta.rev) || 0, updatedAt: Number(meta.updatedAt) || 0, lines: 0 };
        if (firstPass) continue;
        diffs.push({
          path, status: 'changed', rev_from: seen[path] ? seen[path].rev : 0,
          rev_to: Number(meta.rev) || 0,
          appended: [], added_tasks: [], closed_tasks: [], changed_tasks: [], gone_tasks: [],
        });
      }

      if (mark) {
        const nextSeen = { ...seen, ...snapshots };
        for (const path of gonePaths) delete nextSeen[path];
        await writeState({ ...state, seen: { at: nowMs, files: nextSeen } });
      }

      if (firstPass) {
        return {
          text: `Первый проход: запомнил отпечаток задачника, файлов ${Object.keys(snapshots).length}. Со следующего вызова показываю только разницу.`,
          structured: { first_pass: true, files: Object.keys(snapshots).length, changed: [], gone: [], marked: mark },
        };
      }

      const counts = diffs.reduce((acc, d) => ({
        added: acc.added + d.added_tasks.length,
        closed: acc.closed + d.closed_tasks.length,
        changed: acc.changed + d.changed_tasks.length,
      }), { added: 0, closed: 0, changed: 0 });

      const parts = [];
      if (diffs.length) parts.push(`файлов изменилось: ${diffs.length}`);
      if (counts.added) parts.push(`новых задач: ${counts.added}`);
      if (counts.closed) parts.push(`закрыто: ${counts.closed}`);
      if (counts.changed) parts.push(`правок в задачах: ${counts.changed}`);
      if (gonePaths.length) parts.push(`файлов пропало: ${gonePaths.length}`);

      return {
        text: parts.length
          ? `С прошлого прохода — ${parts.join(', ')}. Где: ${diffs.map((d) => d.path).join(', ')}.`
          : 'С прошлого прохода в задачнике ничего не изменилось.',
        structured: {
          first_pass: false,
          since: sinceMs ? new Date(sinceMs).toISOString() : null,
          seen_at: state.seen.at || null,
          changed: diffs,
          gone: gonePaths,
          marked: mark,
        },
      };
    },

    /**
     * Явная связь между задачами. Цель проверяется до записи: ссылка на
     * несуществующий хэш выглядит как связь, а ведёт в пустоту — и обнаружится
     * это ровно тогда, когда по ней захотят пройти.
     */
    async tasks_link(args = {}) {
      const address = tasks.parseAddress(args.to);
      if (!address) throw new ToolError('invalid_ref', `Ссылка «${args.to}» не похожа на адрес с доски. Нужно «проект/хэш», например kinderly/8e3572.`);
      const { file, found, key } = await locateTask(args.project, args.hash);
      if (address.project === key && address.hash === String(args.hash).toLowerCase()) {
        throw new ToolError('self_link', 'Задача не ссылается сама на себя.');
      }

      const targetFile = await readFile(`projects/${address.project}.md`);
      const target = tasks.findTaskByHash(targetFile, address.hash);
      if (!target) {
        throw new ToolError('ref_not_found', `В ${targetFile.path} нет задачи ${address.project}/${address.hash}. Возьми адрес с доски или из tasks_list.`);
      }

      const current = tasks.parseTasks(file).find((t) => t.line - 1 === found.line);
      const already = (current ? current.children : []).some((child) => {
        const parsed = tasks.parseRefLine(child);
        return parsed && parsed.refs.some((r) => r.project === address.project && r.hash === address.hash);
      });
      if (already) {
        return {
          text: `${key}/${args.hash} уже ссылается на ${address.project}/${address.hash} — второй раз не пишу.`,
          structured: { from: `${key}/${args.hash}`, to: `${address.project}/${address.hash}`, already: true },
        };
      }

      const note = String(args.note || '').trim();
      const line = `см: ${address.project}/${address.hash}${note ? ` — ${note}` : ''}`;
      const saved = await writeFile(file, tasks.appendChild(file.text, found.line, line));
      return {
        text: `${key}/${args.hash} · ${found.parsed.title} → ${address.project}/${address.hash} · ${target.parsed.title}. Связь видна с обеих сторон.`,
        structured: {
          path: saved.path, rev: saved.rev, already: false,
          from: `${key}/${args.hash}`, from_title: found.parsed.title,
          to: `${address.project}/${address.hash}`, to_title: target.parsed.title,
          note: note || null,
        },
      };
    },

    /**
     * Обход «что видно только сверху».
     *
     * Потолок в три находки и память об отклонённом — не украшение, а условие
     * пользы. Без них проход приносит десяток «наблюдений», их перестают
     * читать, и вместе с ними перестают читать блок «Требует решения», ради
     * которого всё и делалось.
     */
    async tasks_review(args = {}) {
      const index = await loadIndex();
      const files = await readAll({ max: 80 });
      const state = await loadState();

      const all = tasks.reviewFindings(files, { nowMs, index });
      const { picked, skipped, held_back } = tasks.pickFindings(state, all, { nowMs, limit: args.limit });
      const post = args.post !== false;

      let nextState = state;
      const out = [];
      for (const finding of picked) {
        // Находка без своего проекта (повторяющаяся мысль журнала) ложится в
        // personal: это его собственная голова, а не проектная развилка.
        const project = finding.project || 'personal';
        let ref = null;
        if (post) {
          const posted = await tools.tasks_decision({
            project,
            // Находка про конкретную задачу вешается на неё: вторая задача про
            // то же самое разводит ответ по двум местам.
            hash: finding.hash || undefined,
            title: finding.title,
            questions: finding.questions,
            context: finding.context,
          });
          ref = `${project}/${posted.structured.hash}`;
        }
        nextState = tasks.rememberProposal(nextState, finding, { nowMs, ref });
        out.push({ key: finding.key, kind: finding.kind, title: finding.title, questions: finding.questions, context: finding.context, project, ref });
      }
      if (picked.length) await writeState(nextState);

      const tail = [];
      if (held_back) tail.push(`придержал ещё ${held_back} — потолок три за проход`);
      if (skipped.length) tail.push(`молчу про ${skipped.length}: уже предлагал`);

      return {
        text: out.length
          ? `Нашёл ${out.length}: ${out.map((f) => f.title).join('; ')}.${post ? ' Положил на доску.' : ''}${tail.length ? ` (${tail.join(', ')})` : ''}`
          : `Ничего нового не вижу.${tail.length ? ` (${tail.join(', ')})` : ''}`,
        structured: {
          findings: out,
          posted: post,
          held_back,
          skipped: skipped.map((f) => ({ key: f.key, title: f.title, status: f.cooldown.status, days_left: f.cooldown.days_left })),
        },
      };
    },

    /**
     * Ответ на предложение. Отклонённое молчит месяц — ровно так написано в
     * методичке про выделение контекста, и это же правило спасает остальные
     * находки: агент, который каждый день предлагает одно и то же, обесценивает
     * и то, что предлагает впервые.
     */
    async tasks_proposal(args = {}) {
      const state = await loadState();
      const entries = Object.entries(state.proposals);

      if (!args.key) {
        const list = entries.map(([key, entry]) => {
          const cooldown = tasks.proposalCooldown(entry, nowMs);
          return { key, title: entry.title, kind: entry.kind, status: entry.status, ref: entry.ref || null, days_left: cooldown.days_left };
        });
        return {
          text: list.length
            ? `Уже предлагал ${list.length}: ${list.map((p) => `${p.title} — ${p.status}${p.days_left ? `, молчу ещё ${p.days_left} дн.` : ''}`).join('; ')}.`
            : 'Пока ничего не предлагал.',
          structured: { proposals: list },
        };
      }

      const raw = String(args.answer || 'нет').trim().toLowerCase();
      const status = /^(да|yes|accept|accepted|принят)/.test(raw) ? 'accepted'
        : /^(позже|later|потом)/.test(raw) ? 'proposed'
          : 'declined';

      const next = tasks.answerProposal(state, String(args.key), { status, nowMs, note: args.note || null });
      if (!next) {
        throw new ToolError('proposal_not_found', `Такого предложения не помню: ${args.key}. Список — tasks_proposal без аргументов.`);
      }
      await writeState(next);

      const entry = next.proposals[String(args.key)];
      const cooldown = tasks.proposalCooldown(entry, nowMs);
      return {
        text: status === 'accepted'
          ? `Записал: «${entry.title}» принято.`
          : `Записал: «${entry.title}» — ${status === 'declined' ? 'нет' : 'позже'}. Не подниму ещё ${cooldown.days_left} дн.`,
        structured: { key: args.key, status, days_left: cooldown.days_left, title: entry.title },
      };
    },

    /** Что делать прямо сейчас — под место, время и состояние, а не «всё». */
    async tasks_focus(args = {}) {
      const index = await loadIndex();
      const wanted = args.project
        ? [`projects/${String(args.project).toLowerCase().replace(/\.md$/i, '')}.md`]
        : projectPaths(index);
      const files = await readAll({ paths: wanted });

      const pool = files.flatMap((file) => {
        const project = tasks.projectKeyForPath(file.path);
        return tasks.parseTasks(file).map((task) => ({
          ...task,
          project,
          ref: `${project}/${tasks.taskHash(project, task.title)}`,
        }));
      });

      const moodRaw = String(args.mood || '').toLowerCase();
      const mood = /устал|не варит|низк|low|tired|туман/.test(moodRaw) ? 'low' : null;
      const place = args.place ? String(args.place).replace(/^#/, '').toLowerCase() : null;
      if (place && !tasks.PLACE_TAGS.has(place)) {
        throw new ToolError('invalid_place', `Место «${args.place}» не из словаря задачника: студия, дом, ноут, город.`);
      }

      const picked = tasks.pickFocus(pool, { place, minutes: args.minutes, mood, today: today(), limit: 3 });
      const situation = [place ? `#${place}` : null, args.minutes ? `${args.minutes} мин` : null, mood === 'low' ? 'голова не варит' : null]
        .filter(Boolean).join(', ');

      return {
        text: picked.length
          ? `${situation ? `${situation}: ` : ''}${picked.map((t) => `${t.ref} · ${t.title} (${t.reasons.join(', ') || 'ничего не мешает'})`).join('; ')}.`
          : `${situation ? `${situation}: ` : ''}под это ничего не подходит — либо всё занято местом, либо длиннее окна.`,
        structured: {
          situation: { place, minutes: args.minutes || null, mood },
          picked: picked.map((t) => ({
            ref: t.ref, project: t.project, title: t.title, priority: t.priority,
            due: t.due, tags: t.tags, reasons: t.reasons, blocked: t.blocked, score: t.score,
          })),
        },
      };
    },
  });

  return { tools, schemas: [...TASKS_TOOL_SCHEMAS, ...TASKS_WRITE_SCHEMAS, ...TASKS_BOARD_SCHEMAS, ...TASKS_AGENT_SCHEMAS] };
}

module.exports = { createTasksTools, TASKS_TOOL_SCHEMAS, TASKS_WRITE_SCHEMAS, TASKS_AGENT_SCHEMAS };
