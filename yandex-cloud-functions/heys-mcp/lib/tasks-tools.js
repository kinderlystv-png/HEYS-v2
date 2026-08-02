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
    description: 'Прочитать файл задачника: проект, день, месяц журнала, NOW, GOALS, INBOX. Путь такой же, как в репозитории: projects/heys.md, days/2026-08-02.md, journal/2026-08.md. Файл длиннее окна чтения отдаётся хвостом — свежая часть нужнее, — и об обрезке говорится прямо: «в журнале про это ничего нет» по обрезанному куску выводить нельзя, для этого есть tasks_search. Задачи проекта в ответе перечислены все, даже если сам текст обрезан.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Путь файла в задачнике, например projects/heys.md.' },
        from_line: { type: 'integer', description: 'Читать с этой строки и вперёд — так достаётся начало длинного журнала. Номера строк отдаёт сам ответ и tasks_search.' },
        max_chars: { type: 'integer', description: 'Размер окна в символах. По умолчанию около 24 тысяч — этого хватает на любой проект и на несколько дней журнала. Больше просить стоит только под конкретную задачу.' },
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
  {
    name: 'tasks_calendar',
    description: 'Загруженность вперёд: по каждому дню — сколько занято, сколько из этого требует головы, свободные окна от 45 минут и дедлайны задач, попадающие на этот день. Плюс якоря (то, что повторяется из недели в неделю) и сводка по неделям: где плотно, где пусто, сколько дней свободны целиком. Это единственный способ ответить на «когда можно уехать» и «что придётся подвинуть»: поиском по словам свободная неделя не находится, у неё нет слов. Свободные окна считаются той же арифметикой, что рисует доска, — расхождения с тем, что он видит, не будет. День без файла — не ошибка, а свободный день, так и отдаётся.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'С какой даты смотреть, YYYY-MM-DD. По умолчанию сегодня.' },
        days: { type: 'integer', description: 'Сколько дней вперёд, по умолчанию 30, максимум 60.' },
      },
    },
  },
  {
    name: 'tasks_budget',
    description: 'Картина денег месяца: расходы всего и по контурам, доходы, остаток на счетах, сколько ещё спишется само по recurring.md, лимиты из budget.md и отклонение от них. Отдельно — взносы в подушку и траты по ~travel. Отвечает на «есть ли деньги на это» ровно настолько, насколько есть данные: где лимит стоит «?», отклонение не считается вовсе, а месяц без записанных доходов помечается как односторонний. Оценок «много/мало» инструмент не даёт и тебе не даёт права их выдумывать.',
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'Месяц YYYY-MM. По умолчанию текущий.' },
        contour: { type: 'string', description: 'Показать отдельной строкой один контур: family, kinderly, heys, mine2d, personal, travel, dev, debt, cushion.' },
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
    name: 'tasks_unslot',
    description: 'Снять слот с дня: событие отменилось, договорённость отпала, поставили по ошибке. Без этого «отменил праздник» остаётся только словами — строка в дне живёт дальше, и загруженность продолжает считать день занятым. Слот адресуется временем начала, словами из названия или и тем и другим; подойдёт несколько — инструмент откажет и перечислит их, выбирать за куратора нельзя. Задачу, ради которой слот стоял, снятие не трогает: вытащить событие из календаря — значит снять с плана, а не сделать или бросить.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Дата дня ГГГГ-ММ-ДД. По умолчанию сегодня.' },
        at: { type: 'string', description: 'Время начала слота ЧЧ:ММ — самый точный адрес.' },
        title: { type: 'string', description: 'Слова из названия слота. Ищутся все и в любом порядке, регистр не важен.' },
        slot: { type: 'string', description: 'Одной строкой, как сказал куратор: «15:00», «праздник Ксении», «15:00 уборка». Разбирается на время и слова здесь.' },
      },
    },
  },
  {
    name: 'tasks_reslot',
    description: 'Перенести слот: на другое время того же дня или на другую дату. Адресуется так же, как в tasks_unslot. Назови только новое начало — длительность сохранится сама; назови только to_date — событие уедет на ту же пору другого дня. Пересечения на новом месте считаются той же логикой, что и при постановке, и возвращаются в conflicts: «конфликт» назови куратору сразу, «вопрос» упомяни мимоходом. Перенос — не отмена: строка уезжает целиком, вместе со ссылкой на задачу и видом слота.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Где слот стоит сейчас, ГГГГ-ММ-ДД. По умолчанию сегодня.' },
        at: { type: 'string', description: 'Время начала слота сейчас, ЧЧ:ММ.' },
        title: { type: 'string', description: 'Слова из названия слота.' },
        slot: { type: 'string', description: 'Одной строкой, как сказал куратор: «15:00 уборка».' },
        to_date: { type: 'string', description: 'На какую дату переносим, ГГГГ-ММ-ДД. Не указана — остаётся тот же день.' },
        from: { type: 'string', description: 'Новое начало ЧЧ:ММ. Не указано — время не меняется, меняется только дата.' },
        to: { type: 'string', description: 'Новый конец ЧЧ:ММ. Не указан — длительность берётся прежняя.' },
      },
    },
  },
  {
    name: 'tasks_close_day',
    description: 'Закрыть день: отметить, что из запланированного состоялось, и записать одну фразу «как прошло» строкой «> …» — так это описано в days/README.md. Без закрытия в задачнике остаётся один план: слот без галочки в незакрытом дне значит «неизвестно», а не «не состоялось», и на «как прошла неделя», «что я забросил», «сколько реально ушло на kinderly» отвечать нечем. Отмечай только то, что он сам назвал состоявшимся — галочка это его слово, а не твой вывод. Что осталось без отметки, инструмент перечислит в ответе: перенести, снять или оставить — решает он.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Какой день закрываем, ГГГГ-ММ-ДД. По умолчанию сегодня.' },
        done: {
          type: 'array',
          items: { type: 'string' },
          description: 'Что состоялось. Каждый слот — строкой, как назвал его куратор: «10:00», «лендинг», «14:00 студия». Неоднозначное описание инструмент не угадывает, а переспрашивает.',
        },
        note: { type: 'string', description: 'Одна фраза «как прошло», его словами. Обязательна: она же отметка, что день закрывали. Второе закрытие переписывает её, а не заводит вторую.' },
      },
      required: ['note'],
    },
  },
  {
    name: 'tasks_money',
    description: 'Записать операцию в деньги месяца в формате money/README.md. После записи возвращает картину месяца: сколько ушло в этом контуре, сколько всего, сколько сегодня, остаток на счетах и сколько ещё спишется само. Обычный вход — сводка из приложения: разбирай её в строки и вноси сам, не переспрашивая; категорию бери из приложения, контур ставь сам, а спорный назови в ответе. Спрашивают здесь про другое: движение лимитов, отнесение крупной траты к контуру и любые оценки «дорого/дёшево» — через него.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Сумма в рублях, положительным числом. Приход помечается отдельно через income.' },
        category: { type: 'string', description: 'Категория как в Zenmoney, одним словом: продукты, связь, зарплаты, инструменты, кредит, транспорт. Не выдумывай свою — посмотри, какие уже есть в money месяца.' },
        contour: { type: 'string', description: 'Чей это рубль: family, kinderly, heys, mine2d, personal, travel, dev (общие инструменты разработки), debt (кредиты и рассрочки), cushion (взнос в подушку). Без контура операция уедет в «прочее» и испортит любой вывод.' },
        title: { type: 'string', description: 'Комментарий для человека: что именно купили. Парсер его не разбирает.' },
        account: { type: 'string', description: 'С какого счёта, как он их называет. Необязательно, но без него в выписке потом не сойтись.' },
        income: { type: 'boolean', description: 'true если это приход, а не трата.' },
        date: { type: 'string', description: 'Дата YYYY-MM-DD. По умолчанию сегодня.' },
      },
      required: ['amount', 'category', 'contour'],
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
        key: { type: 'string', description: 'Ключ находки из tasks_review, если развилка выросла из обхода. Тогда обзор запомнит, что уже спрашивал, и не поднимет то же самое второй раз.' },
      },
      required: ['project', 'title', 'questions'],
    },
  },
  {
    name: 'tasks_vote',
    description: 'Записать выбор куратора в эксперименте «два ответа»: какой из двух ответов он назвал полезнее. Вызывай сразу после его ответа на «какой полезнее — 1 или 2?». Возвращает текущий счёт. Не записанный выбор для эксперимента не существует.',
    inputSchema: {
      type: 'object',
      properties: {
        choice: { type: 'string', description: 'Что он выбрал: «1», «2» или «ничья».' },
        procedural: { type: 'string', description: 'Какой из ответов был собран по правилам задачника, а не свободно: «1» или «2». Это знаешь только ты — не спрашивай его.' },
        question: { type: 'string', description: 'Суть вопроса одной короткой строкой, чтобы потом было видно, на каких вопросах что побеждает.' },
        note: { type: 'string', description: 'Его комментарий к выбору, если был. Дословно и коротко.' },
      },
      required: ['choice', 'procedural', 'question'],
    },
  },
  {
    name: 'tasks_learn',
    description: 'Запомнить, как куратор решает: повторяющийся выбор, порог, правило, которое он назвал сам. Хранится обычным файлом задачника, который он может прочитать и поправить, и возвращается в каждом tasks_context. Без аргументов — показать всё, что уже записано. Записывай только то, что он подтвердил словами; догадка «ему, наверное, так удобнее» эту память обесценивает.',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Как он решает — одной строкой, без пересказа разговора. «Развилки по деньгам решает сам, не делегирует», а не «мы обсудили деньги».' },
        evidence: { type: 'string', description: 'Откуда это известно: его слова цитатой, дата разговора или адрес задачи. Обязательно — без опоры запись не отличить от догадки.' },
        kind: { type: 'string', description: 'Вид: «предпочтение» (по умолчанию), «порог» (названное им число или граница), «решение» (разовый выбор с последствиями).' },
      },
      required: [],
    },
  },
  {
    name: 'tasks_move',
    description: 'Перенести задачу со всеми её вложенными строками в другой проект или в архив. Хэш задачи после переноса меняется — он считается от проекта и названия; новый вернётся в ответе, назови его куратору, иначе прежняя ссылка с доски перестанет находить задачу.',
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
    // Порядок — по смыслу, а не по алфавиту: иначе растущая папка дней
    // вытеснит из чтения сами задачи, и поиск начнёт молча «не находить».
    const selected = tasks.rankPaths(known, { today: today() }).slice(0, max);
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
    // Единственная дверь наружу для всех пишущих инструментов, поэтому запрет
    // на чужие файлы стоит здесь, а не в каждом обработчике по отдельности.
    const guarded = tasks.ownerOnlyFile(file.path);
    if (guarded) {
      throw new ToolError('owner_only_file', tasks.ownerOnlyRefusal(guarded), { path: guarded });
    }
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
      // было бы нечем. Разбор идёт по ПОЛНОМУ тексту, даже когда наружу уходит
      // только хвост: иначе у обрезанного файла половина задач просто исчезнет
      // из ответа, и править их будет нечем.
      const inFile = /^projects\//i.test(file.path)
        ? tasks.parseTasks(file).map((task) => {
          const { ref, hash, project } = tasks.taskAddress(file.path, task.title);
          return { ref, hash, project, title: task.title, line: task.line, done: task.done, waiting: task.waiting, due: task.due, priority: task.priority, tags: task.tags };
        })
        : [];

      const view = tasks.fileWindow(file.text, { maxChars: args.max_chars, fromLine: args.from_line });
      const head = `${file.path} (ревизия ${file.rev}${view.truncated ? `, показаны строки ${view.from_line}–${view.to_line} из ${view.total_lines}` : ''}):`;
      const tail = view.truncated
        ? `\n\n[Отдана только часть файла: ${view.shown_chars} символов из ${view.total_chars}. Дальше вверх — начало, его тут нет. Нужен кусок оттуда: tasks_search по словам из него или tasks_read с from_line.]`
        : '';
      return {
        text: `${head}\n\n${view.text}${tail}`,
        structured: {
          path: file.path,
          rev: file.rev,
          text: view.text,
          tasks: inFile,
          truncated: view.truncated,
          from_line: view.from_line,
          to_line: view.to_line,
          total_lines: view.total_lines,
          total_chars: view.total_chars,
        },
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

      // Окружение найденного: проект целиком и время в днях. Без него ответ
      // строится по обрывкам строк, и остальное приходится домысливать.
      const projects = tasks.projectNeighborhood(files, matchingTasks);
      const slots = tasks.slotsAround(
        files,
        foundTasks.map((t) => t.ref).filter(Boolean),
        terms,
        { from: tasks.moscowDate(nowMs) },
      );

      // Как он решает — возвращается всегда и целиком. Смысл этой памяти в
      // том, что её не надо вспоминать отдельным вызовом: правило, о котором
      // помнят через раз, хуже отсутствующего.
      const preferences = tasks.parsePreferences(
        files.find((f) => f.path === tasks.PREFS_PATH) || null,
      );

      const parts = [];
      if (open.length) parts.push(`открытых вопросов: ${open.length}`);
      if (foundTasks.length) parts.push(`задач: ${foundTasks.length}`);
      if (slots.length) parts.push(`уже стоит в днях: ${slots.length}`);
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
          projects,
          slots,
          preferences,
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

    /**
     * Загруженность вперёд. Это второе из двух чтений, без которых на вопрос
     * «когда уехать» можно было ответить только ощущением: поиск по словам
     * находит названное теми же словами, а свободная неделя никак не названа.
     *
     * Дни, повторы и проекты читаются одной пачкой: тридцать дней по одному
     * ключу — это тридцать сетевых вызовов на каждый такой вопрос.
     */
    async tasks_calendar(args = {}) {
      const from = args.from ? String(args.from).trim() : today();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        throw new ToolError('invalid_from', `Дата «${args.from}» не в формате YYYY-MM-DD.`);
      }
      const raw = args.days === undefined || args.days === null ? 30 : Number(args.days);
      if (!Number.isFinite(raw) || raw < 1) throw new ToolError('invalid_days', 'Сколько дней вперёд — целое число от 1.');
      const span = Math.min(Math.round(raw), 60);
      const dates = Array.from({ length: span }, (_, i) => tasks.shiftDate(from, i));
      const till = dates[dates.length - 1];

      const index = await loadIndex();
      const dayPaths = dates.map((date) => `days/${date}.md`);
      const projects = projectPaths(index);
      const wanted = [...dayPaths, 'days/recurring.md', ...projects];
      const files = await readAll({ paths: wanted, max: wanted.length });
      const byPath = new Map(files.map((file) => [file.path, file]));

      const recurring = tasks.parseRecurringSlots((byPath.get('days/recurring.md') || {}).text || '');

      // Дедлайны — это то, что придётся двигать вместе с датами поездки, поэтому
      // они висят прямо на дне, а не отдельным списком «где-то в проектах».
      const dueByDate = new Map();
      for (const path of projects) {
        const file = byPath.get(path);
        if (!file) continue;
        for (const task of tasks.parseTasks(file)) {
          if (task.done || !task.due || task.due < from || task.due > till) continue;
          if (!dueByDate.has(task.due)) dueByDate.set(task.due, []);
          const withRef = withAddress(task);
          dueByDate.get(task.due).push({
            ref: withRef.ref, project: withRef.project, title: task.title, priority: task.priority,
          });
        }
      }

      const days = dates.map((date) => {
        const load = tasks.dayLoad({ date, text: (byPath.get(`days/${date}.md`) || {}).text || '', recurring });
        return { ...load, due: dueByDate.get(date) || [] };
      });

      const weeks = tasks.weekLoad(days);
      const anchors = tasks.anchorSlots(days);
      const freeDays = days.filter((d) => d.busy_minutes === 0 && !d.due.length).map((d) => d.date);
      // День с дедлайном свободным не считается, даже если слотов в нём нет:
      // именно он и окажется тем, что «придётся подвинуть».
      const stretches = tasks.freeStretches(days.map((d) => ({
        date: d.date, busy_minutes: d.due.length ? Math.max(d.busy_minutes, 1) : d.busy_minutes,
      })));
      // «Плотнее/свободнее всего» сравнивается только между целыми неделями:
      // первая и последняя недели окна почти всегда обрезаны, и обрезок вида
      // «одно воскресенье» выигрывал бы звание самой свободной недели всегда.
      // Целых недель может не быть вовсе (окно короче) — тогда сравниваем что есть.
      const full = weeks.filter((w) => w.full);
      const sorted = [...(full.length ? full : weeks)].sort((a, b) => b.busy_minutes - a.busy_minutes);
      const busiest = sorted[0] || null;
      const quietest = sorted[sorted.length - 1] || null;

      const hours = (m) => Math.round((m / 60) * 10) / 10;
      const summary = [
        `${from}…${till}: свободных дней ${freeDays.length} из ${span}`,
        stretches.length ? `подряд: ${stretches.map((s) => `${s.from}…${s.to} (${s.days} дн.)`).join(', ')}` : 'подряд свободных дней нет',
        busiest ? `плотнее всего неделя с ${busiest.start} (${hours(busiest.busy_minutes)} ч)` : null,
        quietest && busiest && quietest.start !== busiest.start ? `свободнее всего с ${quietest.start} (${hours(quietest.busy_minutes)} ч)` : null,
        anchors.length ? `якоря: ${anchors.slice(0, 5).map((a) => `${a.title} (${a.weekdays.join(',') || '—'})`).join('; ')}` : 'повторяющегося ничего не видно',
        dueByDate.size ? `дедлайнов в окне: ${[...dueByDate.values()].reduce((n, x) => n + x.length, 0)}` : 'дедлайнов в окне нет',
      ].filter(Boolean).join('. ');

      return {
        text: `${summary}.`,
        structured: {
          from, to: till, days, weeks, anchors,
          free_days: freeDays,
          free_stretches: stretches,
          busiest_week: busiest ? busiest.start : null,
          quietest_week: quietest ? quietest.start : null,
        },
      };
    },

    /**
     * Картина денег. Честность здесь важнее полноты: лимит «?» не превращается
     * в число, месяц без доходов помечается односторонним, а взносы в подушку
     * не выдаются за «доступно на поездку» — он свою подушку так не определял.
     */
    async tasks_budget(args = {}) {
      const month = args.month ? String(args.month).trim() : today().slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new ToolError('invalid_month', `Месяц «${args.month}» не в формате YYYY-MM.`);
      }
      const contour = args.contour ? String(args.contour).replace(/^~/, '').trim().toLowerCase() : null;

      const index = await loadIndex();
      const monthPaths = [...new Set([
        `money/${month}.md`,
        ...Object.keys(index.files).filter((path) => /^money\/\d{4}-\d{2}\.md$/i.test(path)),
      ])];
      const wanted = [...monthPaths, 'money/budget.md', 'money/recurring.md'];
      const files = await readAll({ paths: wanted, max: wanted.length });
      const byPath = new Map(files.map((file) => [file.path, file.text]));

      const text = byPath.get(`money/${month}.md`) || '';
      const isCurrent = month === today().slice(0, 7);
      const picture = tasks.budgetPicture({
        month,
        text,
        budget: byPath.get('money/budget.md') || '',
        recurring: byPath.get('money/recurring.md') || '',
        // «Ещё спишется до конца месяца» имеет смысл только для текущего
        // месяца: в прошедшем всё уже списалось, и прогноз там был бы враньём.
        today: isCurrent ? today() : null,
        contour,
        months: monthPaths.map((path) => ({ month: path.slice(6, 13), text: byPath.get(path) || '' })),
      });

      const over = picture.limits.filter((l) => l.measurable && l.over > 0);
      const parts = [
        `${month}: расходов ${picture.spent} ₽`,
        `из них потребление ${picture.split.consumption} ₽, кредиты ${picture.split.debt} ₽, в подушку ${picture.split.cushion} ₽`,
        `доходов ${picture.income} ₽`,
        contour ? `по ~${contour} ${picture.contour.spent} ₽` : null,
        picture.balance ? `остаток на ${picture.balance.date} — ${picture.balance.amount} ₽` : 'остаток на счетах не замерян',
        picture.recurring_ahead ? `до конца месяца спишется само ещё ~${picture.recurring_ahead} ₽` : null,
        picture.travel.month ? `по ~travel за месяц ${picture.travel.month} ₽` : 'по ~travel в этом месяце ничего',
        picture.cushion.monthly !== null
          ? `в подушку ${picture.cushion.month} из ${picture.cushion.monthly} ₽ за месяц, накоплено ${picture.cushion.total} ₽${picture.cushion.goal !== null ? ` из цели ${picture.cushion.goal} ₽` : ''}`
          : `в подушку ${picture.cushion.month} ₽ за месяц`,
      ].filter(Boolean);

      // Дальше — ровно то, чего в данных нет. Это не оговорки для приличия: без
      // них вывод по бюджету читается как полный, хотя половины входа не было.
      const gaps = [
        picture.one_sided
          ? 'Доходов за месяц в записях нет — вывод односторонний, «хватает или нет» отсюда не следует.'
          : null,
        picture.unmeasured.length
          ? `Лимит не задан (${picture.unmeasured.join(', ')}) — отклонение мерить нечем, это его решение, а не пропуск.`
          : null,
        over.length
          ? `Сверх лимита: ${over.map((l) => `${l.contour} на ${l.over} ₽`).join(', ')}.`
          : null,
        'Подушка — сбережения, а не бюджет поездки: называть её «доступно на поездку» нельзя, он так её не определял.',
      ].filter(Boolean);

      return {
        text: `${parts.join(', ')}. ${gaps.join(' ')}`,
        structured: { ...picture, contour_key: contour, gaps },
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

  /**
   * Как адресуется слот, который надо снять или подвинуть.
   *
   * По времени начала, по словам заголовка или по обоим сразу. Одного времени
   * человеку мало («отмени праздник» — он не помнит, с которого часа), одних
   * слов тоже: «уборка» может стоять дважды. Поэтому принимаем и то и другое,
   * а строку вида «15:00 уборка» разбираем сами — модель всё равно перескажет
   * его слова как есть.
   */
  function splitSlotQuery(entry) {
    if (entry && typeof entry === 'object') return { at: entry.at || null, title: entry.title || null };
    const raw = String(entry || '').trim();
    const match = /^(\d{1,2}:\d{2})\s*(?:[-–—]\s*\d{1,2}:\d{2})?\s*(.*)$/.exec(raw);
    if (match) return { at: match[1], title: match[2].trim() || null };
    return { at: null, title: raw || null };
  }

  /**
   * Один слот дня по описанию — или внятный отказ.
   *
   * Молча взять первый подходящий нельзя: снятый не тот слот выглядит ровно
   * как выполненная просьба, и расхождение всплывёт через неделю. Поэтому при
   * нескольких совпадениях инструмент отказывается и перечисляет кандидатов —
   * уточнить время дешевле, чем чинить день задним числом.
   */
  function locateSlotIn(file, { at, title }, date) {
    const all = tasks.parseSlots(file.text);
    const listing = all.length
      ? all.map((s) => `${s.start}–${s.end} ${s.title}`).join('; ')
      : 'в этом дне вообще ничего не стоит';
    if (!at && !title) {
      throw new ToolError('slot_query_required', `Скажи, какой слот: время начала, слова из названия или и то и другое. В ${date}: ${listing}.`);
    }
    let found;
    try {
      found = tasks.findSlotsIn(file.text, { at, title });
    } catch (e) {
      throw new ToolError('invalid_time', `Время «${at}» не в формате ЧЧ:ММ.`);
    }
    if (!found.length) {
      throw new ToolError(
        'slot_not_found',
        `В ${date} нет слота «${[at, title].filter(Boolean).join(' ')}». Что там стоит: ${listing}.`,
        { date, slots: all.map((s) => ({ from: s.start, to: s.end, title: s.title })) },
      );
    }
    if (found.length > 1) {
      throw new ToolError(
        'slot_ambiguous',
        `Под «${[at, title].filter(Boolean).join(' ')}» в ${date} подходит ${found.length}: ${found.map((s) => `${s.start}–${s.end} ${s.title}`).join('; ')}. Спроси у него, какой именно, и передай время начала — сам я выбрать не могу.`,
        { date, candidates: found.map((s) => ({ from: s.start, to: s.end, title: s.title })) },
      );
    }
    return found[0];
  }

  async function locateSlot(date, args) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      throw new ToolError('invalid_date', `Дата «${date}» не в формате ГГГГ-ММ-ДД.`);
    }
    const file = await readFile(`days/${date}.md`);
    const query = args.at || args.title
      ? { at: args.at || null, title: args.title || null }
      : splitSlotQuery(args.slot);
    return { file, slot: locateSlotIn(file, query, date) };
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

    async tasks_unslot(args = {}) {
      const date = args.date || today();
      const { file, slot } = await locateSlot(date, args);
      const next = tasks.removeSlotLine(file.text, slot.line);
      const saved = await writeFile(file, next);
      // Слот и задача — разные вещи: «вытащил слот из календаря» значит снят с
      // плана, а не сделан или брошен. Задача остаётся там, где лежала, и
      // сказать об этом надо вслух, иначе следующий шаг будет «а куда делось».
      const link = tasks.parseSlotRef(slot.raw);
      const kept = link ? ` Задача ${link.ref.project}/${link.ref.hash} осталась на месте — снят только слот в дне.` : '';
      return {
        text: `Снял с ${date}: ${slot.start}–${slot.end} ${slot.title}.${kept}`,
        structured: {
          date, from: slot.start, to: slot.end, title: slot.title, kind: slot.kind,
          ref: link ? `${link.ref.project}/${link.ref.hash}` : null, rev: saved.rev,
        },
      };
    },

    async tasks_reslot(args = {}) {
      const date = args.date || today();
      const { file, slot } = await locateSlot(date, args);
      const toDate = args.to_date || date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        throw new ToolError('invalid_date', `Дата «${args.to_date}» не в формате ГГГГ-ММ-ДД.`);
      }

      // Длительность сохраняется сама: «перенеси на 16:00» — это про начало,
      // а не про то, что событие теперь длится до конца суток.
      const span = slot.to - slot.from;
      let from;
      let to;
      try {
        from = args.from ? tasks.padTime(args.from) : slot.start;
        to = args.to
          ? tasks.padTime(args.to)
          : (args.from ? tasks.minutesToTime(tasks.timeToMinutes(from) + span) : slot.end);
      } catch (e) {
        throw new ToolError('invalid_time', `Время «${args.from || ''}–${args.to || ''}» не в формате ЧЧ:ММ.`);
      }

      if (toDate === date && tasks.padTime(from) === tasks.padTime(slot.start) && tasks.padTime(to) === tasks.padTime(slot.end)) {
        return {
          text: `${slot.start}–${slot.end} ${slot.title} и так стоит на ${date} — не трогал.`,
          structured: { moved: false, date, from: slot.start, to: slot.end, title: slot.title, conflicts: [] },
        };
      }

      // Пересечения считаются на новом месте той же логикой, что и постановка,
      // и обязательно БЕЗ самого переносимого слота: иначе он найдёт конфликт
      // сам с собой и остановит перенос на пустом месте.
      const sourceWithout = tasks.removeSlotLine(file.text, slot.line);
      const targetFile = toDate === date ? null : await readFile(`days/${toDate}.md`);
      const targetText = toDate === date ? sourceWithout : (targetFile.text || '');
      let conflicts;
      try {
        conflicts = tasks.slotConflicts(targetText, from, to, slot.kind);
      } catch (e) {
        throw new ToolError('invalid_time', `Время «${from}–${to}» не в формате ЧЧ:ММ.`);
      }

      let rev;
      if (toDate === date) {
        const saved = await writeFile(file, tasks.retimeSlotLine(file.text, slot.line, from, to));
        rev = saved.rev;
      } else {
        // Сначала пишем туда, потом убираем отсюда. Порядок не косметический:
        // упади вторая запись — слот окажется в двух днях, и это видно и
        // чинится; упади первая при обратном порядке — он исчезнет молча.
        const parts = tasks.splitSlotLine(slot.raw);
        const line = tasks.buildSlotLine({ ...parts, from, to });
        const nextTarget = slot.kind === 'фон'
          ? [line, ...String(targetFile.text || '').split('\n')].join('\n').replace(/^\n+/, '')
          : tasks.appendBlock(targetFile.text, line);
        const saved = await writeFile(targetFile, nextTarget);
        rev = saved.rev;
        await writeFile(file, sourceWithout);
      }

      const real = conflicts.filter((c) => c.level === 'конфликт');
      const soft = conflicts.filter((c) => c.level === 'вопрос');
      let warn = '';
      if (real.length) warn += ` Конфликт с: ${real.map((c) => c.title).join('; ')} — скажи об этом куратору.`;
      if (soft.length) warn += ` Стоит уточнить: ${soft.map((c) => c.title).join('; ')}.`;

      return {
        text: `Перенёс: ${slot.title} — было ${date} ${slot.start}–${slot.end}, стало ${toDate} ${from}–${to}.${warn}`,
        structured: {
          moved: true, date, to_date: toDate, from, to, title: slot.title, kind: slot.kind,
          was: { date, from: slot.start, to: slot.end }, conflicts, rev,
        },
      };
    },

    /**
     * Закрытие дня. Без него вся ретроспектива слепая: в файлах остаётся один
     * план, и «как прошла неделя», «что я забросил», «сколько реально ушло на
     * kinderly» отвечать нечем — слот без галочки в незакрытом дне значит
     * «неизвестно», а не «не состоялось».
     *
     * Формат не наш: галочка `- [x]` и строка `> …` внизу — это то, что уже
     * описано в days/README.md и что рисует доска.
     */
    async tasks_close_day(args = {}) {
      const date = args.date || today();
      const note = String(args.note || '').trim();
      if (!note) {
        throw new ToolError(
          'note_required',
          'Нужна одна фраза «как прошло» — она же отметка того, что день закрывали. Без неё слот без галочки не отличить от «ещё не смотрели».',
        );
      }
      const file = await readFile(`days/${date}.md`);
      const before = tasks.dayNote(file.text);

      // Сначала находим всё, потом пишем: половина отмеченных галочек и
      // ошибка на третьей — это день, про который непонятно, закрыт он или нет.
      const asked = Array.isArray(args.done) ? args.done : (args.done ? [args.done] : []);
      const picked = [];
      for (const entry of asked) {
        const { at, title } = splitSlotQuery(entry);
        const slot = locateSlotIn(file, { at, title }, date);
        // Один слот, названный дважды («10:00» и «лендинг»), — это один слот,
        // а не два состоявшихся дела: иначе «состоялось 3 из 2».
        if (!picked.some((s) => s.line === slot.line)) picked.push(slot);
      }

      let text = file.text;
      const marked = [];
      for (const slot of picked) {
        if (slot.done) { marked.push({ ...slot, already: true }); continue; }
        text = tasks.markSlotDone(text, slot.line, true);
        marked.push({ ...slot, already: false });
      }
      text = tasks.setDayNote(text, note);
      const saved = await writeFile(file, text);

      const doneLines = new Set(marked.map((s) => s.line));
      const open = tasks.parseSlots(text)
        .filter((slot) => !slot.done && !doneLines.has(slot.line))
        .map((slot) => ({ from: slot.start, to: slot.end, title: slot.title, kind: slot.kind }));

      const tail = open.length
        ? ` Без отметки осталось ${open.length}: ${open.map((s) => `${s.from} ${s.title}`).join('; ')} — перенести (tasks_reslot), снять (tasks_unslot) или оставить как есть, решает он.`
        : '';
      return {
        text: `${before ? 'Переписал закрытие' : 'Закрыл день'} ${date}: состоялось ${marked.length} из ${marked.length + open.length}. Заметка: «${note}».${tail}`,
        structured: {
          date, note, rev: saved.rev,
          already_closed: !!before,
          previous_note: before ? before.text : null,
          done: marked.map((s) => ({ from: s.start, to: s.end, title: s.title, already: s.already })),
          open,
        },
      };
    },

    async tasks_money(args = {}) {
      const contour = String(args.contour || '').trim();
      if (!contour) throw new ToolError('contour_required', 'У операции обязателен контур — без него она не попадёт в разбивку на доске.');
      const amount = Number(args.amount);
      if (!Number.isFinite(amount) || amount === 0) throw new ToolError('invalid_amount', 'Сумма должна быть числом и не нулём.');
      const date = args.date || today();
      const month = date.slice(0, 7);

      const category = String(args.category || '').trim().replace(/\s+/g, '-');
      if (!category) {
        throw new ToolError(
          'category_required',
          'Нужна категория, как в Zenmoney: продукты, связь, зарплаты, инструменты, кредит. Без неё строка не попадёт в разбивку по категориям на доске.',
        );
      }

      const file = await readFile(`money/${month}.md`);
      const line = tasks.moneyLine({
        date, amount, income: !!args.income, category, contour,
        account: args.account ? String(args.account).trim() : null,
        comment: args.title ? String(args.title).trim() : null,
      });
      const saved = await writeFile(file, tasks.prependToSection(file.text, line, '## Операции'));

      // Картина месяца после записи — тот же смысл, что у day_after в
      // дневниках: не «записал», а «вот что теперь». Оценок не даём: лимиты в
      // budget.md стоят «?» по его решению не выдумывать нормы раньше времени.
      let recurring = null;
      try {
        recurring = (await readFile('money/recurring.md')).text;
      } catch (_) { /* нет файла регулярных — прогноз просто не покажем */ }
      const month_after = tasks.monthAfter(saved.text, { month, today: date, contour, recurring });

      const sign = args.income ? '+' : '-';
      const picture = [
        `в ${contour} за месяц ${month_after.contour.spent} ₽`,
        `всего расходов ${month_after.spent} ₽`,
        month_after.today_spent ? `сегодня ${month_after.today_spent} ₽` : null,
        month_after.balance ? `остаток на ${month_after.balance.date} — ${month_after.balance.amount} ₽` : null,
        month_after.recurring_ahead ? `до конца месяца спишется само ещё ~${month_after.recurring_ahead} ₽` : null,
      ].filter(Boolean).join(', ');

      return {
        text: `Записал: ${sign}${Math.abs(amount)} ₽ · ${category} · ~${contour}. Теперь ${picture}.`,
        structured: {
          date, amount, income: !!args.income, category, contour,
          account: args.account || null, comment: args.title || null,
          path: saved.path, rev: saved.rev, month_after,
        },
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

      // Исход находки: до сих пор нигде не оставалось следа, что человек
      // ответил. Без этого нельзя отличить полезный обход от генератора шума —
      // и нечем оправдать ни один порог. Пишем ответ туда же, где лежит
      // предложение, по ссылке на задачу.
      let remembered = null;
      if (unblocked) {
        const state = await loadState();
        const ref = `${key}/${args.hash}`;
        const entry = Object.entries(state.proposals).find(([, p]) => p && p.ref === ref && p.status === 'proposed');
        if (entry) {
          const next = tasks.answerProposal(state, entry[0], {
            status: 'accepted', nowMs, note: args.note ? String(args.note).trim() : result.removed,
          });
          if (next) { await writeState(next); remembered = entry[0]; }
        }
      }

      return {
        text: `${key}/${args.hash} · ${found.parsed.title}: снял «${result.removed}»${args.note ? ', записал ответ' : ''}${unblocked ? '. Открытых вопросов больше нет — убрал из «Требует решения»' : ''}.`,
        structured: { path: saved.path, rev: saved.rev, hash: args.hash, removed: result.removed, note: args.note || null, unblocked, remembered },
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

      // Сначала смотрим, что уже висит открытым. Дубль вопроса и переполненная
      // доска — две причины не писать; обе дешевле поймать до записи.
      const openIndex = await loadIndex();
      const openFiles = await readAll({ paths: projectPaths(openIndex) });
      const openQuestions = tasks.collectOpenQuestions(openFiles);
      const guard = tasks.decisionGuard(openQuestions, questions);

      if (!guard.fresh.length) {
        const where = [...new Set(guard.duplicates.map((d) => d.ref).filter(Boolean))].join(', ');
        return {
          text: `Не стал дублировать: такой вопрос уже открыт${where ? ` — ${where}` : ''}. Ответа на него всё ещё нет.`,
          structured: { created: false, reason: 'duplicate', duplicates: guard.duplicates, open_count: guard.open_count },
        };
      }

      // Развилка по существующей задаче вешается на неё: вторая задача про то
      // же самое разводит контекст по двум местам, и отвечать приходится дважды.
      if (args.hash) {
        const { file, found, key } = await locateTask(args.project, args.hash);
        const lines = file.text.split('\n');
        const blocked = /#blocked\b/.test(lines[found.line])
          ? lines[found.line]
          : tasks.applyTaskPatch(lines[found.line], { addTags: ['blocked'] });
        let nextText = [...lines.slice(0, found.line), blocked, ...lines.slice(found.line + 1)].join('\n');
        for (const line of [...context, ...guard.fresh.map((q) => `открыто: ${q}`)]) {
          nextText = tasks.appendChild(nextText, found.line, line);
        }
        const saved = await writeFile(file, nextText);
        const skipped = guard.duplicates.length ? `, ${guard.duplicates.length} уже были открыты` : '';
        return {
          text: `${key}/${args.hash} · ${found.parsed.title}: развилка на доске, вопросов ${guard.fresh.length}${skipped}.`,
          structured: {
            path: saved.path, rev: saved.rev, hash: args.hash, title: found.parsed.title,
            questions: guard.fresh, duplicates: guard.duplicates, attached: true, created: true,
          },
        };
      }

      // Потолок: доска, на которой уже висит пять нерешённых развилок, не станет
      // полезнее от шестой — её просто не прочитают вместе с остальными. Это
      // отказ, а не предупреждение: предупреждение агент проигнорирует.
      // Привязка к существующей задаче (выше) под потолок не попадает — она не
      // добавляет новую строку в «Требует решения».
      if (guard.over_cap) {
        throw new ToolError(
          'too_many_open_decisions',
          `На доске уже ${guard.open_count} нерешённых развилок (потолок ${guard.cap}): ${guard.open_refs.join(', ')}. `
          + 'Новую не завожу. Либо привяжи вопрос к одной из них через hash, либо скажи куратору, что сначала нужно закрыть висящее.',
        );
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
      for (const child of [...context, ...guard.fresh.map((q) => `открыто: ${q}`)]) {
        nextText = tasks.appendChild(nextText, taskLine, child);
      }
      const saved = await writeFile(file, nextText);

      const hash = tasks.taskHash(project, tasks.taskTitle(line));
      // Развилка, выросшая из находки обхода, записывается в память прохода:
      // иначе обзор через две недели поднимет то же самое второй задачей —
      // одна память будет молчать, другая повторяться.
      if (args.key) {
        const state = await loadState();
        await writeState(tasks.rememberProposal(
          state,
          { key: String(args.key), kind: 'decision', subject: title, title, project },
          { nowMs, ref: `${project}/${hash}` },
        ));
      }
      const skipped = guard.duplicates.length ? ` ${guard.duplicates.length} вопрос(а) уже были открыты — не повторял.` : '';
      return {
        text: `Положил на доску: ${title}. Вопросов: ${guard.fresh.length}. Ссылка: ${project}/${hash}.${skipped}`,
        structured: {
          path: saved.path, rev: saved.rev, hash, title, created: true,
          questions: guard.fresh, duplicates: guard.duplicates, context, attached: false,
          open_count: guard.open_count + 1, cap: guard.cap,
        },
      };
    },

    /**
     * Память о том, как он решает. Не скрытое состояние, а обычный файл
     * задачника: он должен уметь прочитать это глазами и вычеркнуть неверное.
     * Записывается только подтверждённое — его слова, его выбор.
     */
    /** Голос эксперимента «два ответа». Копится обычным файлом задачника. */
    async tasks_vote(args = {}) {
      const choice = String(args.choice || '').trim();
      if (!['1', '2', 'ничья'].includes(choice)) {
        throw new ToolError('invalid_choice', 'Выбор — «1», «2» или «ничья».');
      }
      const procedural = String(args.procedural || '').trim();
      if (!['1', '2'].includes(procedural)) {
        throw new ToolError('invalid_procedural', 'Нужен номер процедурного ответа: «1» или «2».');
      }
      const question = String(args.question || '').trim();
      if (!question) throw new ToolError('invalid_question', 'Нужна суть вопроса одной строкой.');

      const file = await readFile(tasks.VOTES_PATH);
      const winner = tasks.voteWinner(choice, procedural);
      const line = tasks.voteLine({
        date: today(), winner, question,
        note: args.note ? String(args.note).trim() : null,
      });
      const saved = await writeFile(file, tasks.appendToSection(file.text, line, tasks.VOTES_SECTION));
      const { counts, total } = tasks.parseVotes(saved);
      return {
        text: `Записал: ${winner}. Счёт после ${total}: процедурный ${counts['процедурный']} · свободный ${counts['свободный']} · ничьи ${counts['ничья']}.`,
        structured: { winner, counts, total, path: saved.path, rev: saved.rev },
      };
    },

    async tasks_learn(args = {}) {
      const file = await readFile(tasks.PREFS_PATH);
      const existing = tasks.parsePreferences(file);

      const note = String(args.note || '').trim();
      if (!note) {
        return {
          text: existing.length
            ? `Про то, как он решает, записано ${existing.length}: ${existing.slice(-8).map((e) => e.note).join('; ')}.`
            : 'Пока ничего не записано про то, как он решает.',
          structured: { preferences: existing, path: tasks.PREFS_PATH },
        };
      }

      const evidence = String(args.evidence || '').trim();
      if (!evidence) {
        throw new ToolError(
          'evidence_required',
          'Нужно, откуда это известно: его слова, дата разговора или ссылка на задачу. Без опоры это твоя догадка, а догадки такую память и обесценивают.',
        );
      }

      const known = tasks.knownPreference(existing, note);
      if (known) {
        return {
          text: `Уже записано ${known.date}: «${known.note}». Второй раз не пишу.`,
          structured: { created: false, reason: 'duplicate', same_as: known, path: tasks.PREFS_PATH },
        };
      }

      const kind = ['предпочтение', 'порог', 'решение'].includes(String(args.kind))
        ? String(args.kind)
        : 'предпочтение';
      const line = tasks.preferenceLine({ date: today(), kind, note, evidence });
      const saved = await writeFile(file, tasks.appendToSection(file.text, line, tasks.PREFS_SECTION));

      const total = existing.length + 1;
      const crowded = total > tasks.PREFS_SOFT_LIMIT
        ? ` Записей уже ${total} — их стало больше, чем читают за раз; предложи ему вычистить устаревшее.`
        : '';
      return {
        text: `Запомнил: ${note}.${crowded}`,
        structured: { created: true, path: saved.path, rev: saved.rev, kind, note, evidence, total },
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
