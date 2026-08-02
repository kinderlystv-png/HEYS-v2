'use strict';

/**
 * Кураторский режим: один коннектор — все клиенты куратора.
 *
 * Архитектура намеренно не трогает createTools: для каждого целевого клиента
 * собирается адаптер с интерфейсом клиентского API (getKV/mergeSaveKV/
 * upsertKV/getSharedProducts), внутри которого вызовы уходят кураторскими
 * путями (`*_by_curator`, REST с Bearer JWT). Вся логика инструментов —
 * приёмы, наборы, продукты, поиск — остаётся одной на оба режима.
 *
 * Главный риск режима — записать не тому клиенту. Он же главный исторический
 * инцидент этого проекта. Поэтому:
 *  - параметр `client` обязателен в каждом инструменте, пока у куратора
 *    больше одного клиента; неоднозначное имя не угадывается, а возвращает
 *    кандидатов;
 *  - каждый ответ начинается с имени клиента;
 *  - перед записью выдаётся write-context на конкретного клиента — сервер
 *    привязывает цель записи независимо от того, что прислал вызов.
 */

const { createTools, TOOL_SCHEMAS, ToolError } = require('./tools');
const products = require('./products');
const admin = require('./admin');
const day = require('./day');

/** Инструменты, которым не нужен целевой клиент. */
const CLIENTLESS_TOOLS = new Set([
  'heys_list_clients',
  'heys_list_inbox',
  'heys_moderate_products',
  'heys_create_client',
  'heys_leads',
]);

const CLIENT_ARG = {
  type: 'string',
  description: 'Кому вносим: имя клиента или client_id из heys_list_clients. Обязательно, если у куратора больше одного клиента.',
};

/**
 * Публикация в общую базу — кураторская возможность, поэтому параметр живёт
 * только в кураторской схеме: у клиента прав на общий каталог нет.
 */
const SHARE_ARG = {
  type: 'boolean',
  description: 'Публиковать ли продукт в общую базу, доступную всем клиентам. По умолчанию публикуется всё промышленное — то, у чего есть бренд или штрихкод. Домашние блюда и авторские рецепты не публикуются: ставь true только если куратор прямо просит, и false — чтобы не публиковать промышленный продукт.',
};

const CURATOR_EXTRA_ARGS = {
  heys_create_product: { share: SHARE_ARG },
};

function buildCuratorSchemas() {
  const schemas = TOOL_SCHEMAS.map((schema) => ({
    ...schema,
    description: schema.name === 'heys_create_product'
      ? `${schema.description} Работает со списком выбранного клиента куратора; промышленный продукт заодно уезжает в общую базу.`
      : `${schema.description} Работает с дневником выбранного клиента куратора.`,
    inputSchema: {
      ...schema.inputSchema,
      properties: {
        client: CLIENT_ARG,
        ...(schema.inputSchema.properties || {}),
        ...(CURATOR_EXTRA_ARGS[schema.name] || {}),
      },
    },
  }));
  schemas.unshift({
    name: 'heys_reply_message',
    description: 'Ответить клиенту в мессенджере приложения. Используй после того, как внёс просьбу в дневник: клиент должен видеть, что его сообщение обработано.',
    inputSchema: {
      type: 'object',
      properties: { client: CLIENT_ARG, text: { type: 'string', description: 'Текст ответа клиенту.' } },
      required: ['text'],
    },
  });
  schemas.unshift({
    name: 'heys_mark_message_done',
    description: 'Пометить сообщение обработанным. Вызывай сразу после того, как внёс просьбу клиента в дневник, — иначе при следующем чтении переписки та же еда будет внесена повторно.',
    inputSchema: {
      type: 'object',
      properties: {
        client: CLIENT_ARG,
        message_id: { type: 'string', description: 'Идентификатор сообщения из heys_list_messages.' },
        done: { type: 'boolean', description: 'false — снять отметку. По умолчанию true.' },
      },
      required: ['message_id'],
    },
  });
  schemas.unshift({
    name: 'heys_get_photo',
    description: 'Открыть фото, которое клиент прислал в мессенджер: возвращает само изображение, и его видно прямо в ответе. Вызывай сразу, когда у сообщения есть вложение с фото — по снимку видно и еду, и этикетку, и весы. Путь берётся из attachments сообщения в heys_list_messages. Не проси куратора описать фото словами: открой его сам.',
    inputSchema: {
      type: 'object',
      properties: {
        client: CLIENT_ARG,
        path: { type: 'string', description: 'Путь вложения из attachments[].path сообщения.' },
      },
      required: ['path'],
    },
  });
  schemas.unshift({
    name: 'heys_list_messages',
    description: 'Прочитать переписку с клиентом в мессенджере приложения: текст сообщений, время отправки, отметка «обработано». Здесь же оказываются расшифровки голосовых. Вызывай, когда куратор спрашивает, что писал клиент, или просит внести то, о чём клиент написал.',
    inputSchema: {
      type: 'object',
      properties: {
        client: CLIENT_ARG,
        limit: { type: 'integer', description: 'Сколько сообщений вернуть, до 200. По умолчанию 100.' },
        before: { type: 'string', description: 'Читать сообщения старше этой метки времени — для листания вглубь истории.' },
      },
    },
  });
  schemas.unshift({
    name: 'heys_get_client_health',
    description: 'Диагностика клиента: сессии и входы за последние часы, включая неудачные попытки. Вызывай на жалобы «не заходит», «не синхронизируется», «пропали данные» — прежде чем гадать о причине.',
    inputSchema: {
      type: 'object',
      properties: {
        client: CLIENT_ARG,
        hours: { type: 'integer', description: 'За сколько последних часов смотреть. По умолчанию 24, максимум 720.' },
      },
    },
  });
  schemas.unshift({
    name: 'heys_leads',
    description: 'Заявки с лендинга: список и смена статуса. Без аргументов — весь список; с action «update» меняет статус конкретного лида.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '«list» (по умолчанию) или «update».' },
        status: { type: 'string', description: 'Для списка — фильтр по статусу; для update — новый статус, например «rejected».' },
        lead_id: { type: 'string', description: 'Идентификатор лида для update.' },
        reason: { type: 'string', description: 'Причина смены статуса.' },
      },
    },
  });
  schemas.unshift({
    name: 'heys_trial_queue',
    description: 'Очередь заявок на пробный период: показать список со статистикой, активировать триал клиенту или отклонить заявку с причиной.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '«list» (по умолчанию), «activate» или «reject».' },
        client: CLIENT_ARG,
        start_date: { type: 'string', description: 'Дата старта триала YYYY-MM-DD. По умолчанию — сегодня.' },
        queue_id: { type: 'string', description: 'Идентификатор заявки для отказа.' },
        reason: { type: 'string', description: 'Причина отказа — попадёт в карточку заявки.' },
      },
    },
  });
  schemas.unshift({
    name: 'heys_manage_subscription',
    description: 'Подписка клиента: продлить на несколько месяцев или сбросить. Сброс закрывает доступ сразу и требует подтверждения.',
    inputSchema: {
      type: 'object',
      properties: {
        client: CLIENT_ARG,
        action: { type: 'string', description: '«extend» или «cancel».' },
        months: { type: 'integer', description: 'На сколько месяцев продлить, 1–24.' },
        confirm: { type: 'boolean', description: 'Подтверждение сброса подписки.' },
      },
      required: ['action'],
    },
  });
  schemas.unshift({
    name: 'heys_client_access',
    description: 'Доступ клиента в приложение: получить действующую ссылку входа или выпустить новый PIN. ВАЖНО: и ссылка, и PIN — секреты, они появятся в переписке. Вызывай только когда куратор прямо об этом попросил, и предупреди, что значение осталось в чате.',
    inputSchema: {
      type: 'object',
      properties: {
        client: CLIENT_ARG,
        action: { type: 'string', description: '«link» (по умолчанию) или «reset_pin».' },
        pin: { type: 'string', description: 'Конкретный PIN из четырёх цифр. Без него сгенерируется случайный — так лучше.' },
        confirm: { type: 'boolean', description: 'Подтверждение смены PIN: старый перестанет работать сразу.' },
      },
    },
  });
  schemas.unshift({
    name: 'heys_create_client',
    description: 'Завести нового клиента куратора: имя и телефон. PIN генерируется сам и возвращается в ответе, поэтому вызов требует confirm: true — значение останется в истории чата.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Имя клиента.' },
        phone: { type: 'string', description: 'Телефон, российский номер в любом формате.' },
        pin: { type: 'string', description: 'Свой PIN из четырёх цифр. Обычно не нужен: без него PIN сгенерируется.' },
        confirm: { type: 'boolean', description: 'Подтверждение создания.' },
      },
      required: ['name', 'phone'],
    },
  });
  schemas.unshift({
    name: 'heys_moderate_products',
    description: 'Очередь продуктов, которые клиенты прислали в общую базу, и исправление ошибочной публикации. Без аргументов показывает список на модерации; с pending_id и action одобряет или отклоняет заявку; с product_id и action «hide» убирает из выдачи уже опубликованный продукт (например, домашнее блюдо, случайно ушедшее в общую базу), «unhide» возвращает. Отклонение требует причины — её увидит приславший клиент.',
    inputSchema: {
      type: 'object',
      properties: {
        pending_id: { type: 'string', description: 'Идентификатор заявки из списка.' },
        product_id: { type: 'string', description: 'Идентификатор продукта общей базы — для hide/unhide.' },
        action: { type: 'string', description: '«approve», «reject», «hide» или «unhide».' },
        reason: { type: 'string', description: 'Причина отклонения.' },
        limit: { type: 'integer', description: 'Сколько заявок показать, по умолчанию 50.' },
      },
    },
  });
  schemas.unshift({
    name: 'heys_list_inbox',
    description: 'Кто из клиентов написал и сколько сообщений ждёт ответа — по всем клиентам сразу. Вызывай на «что нового», «кто мне писал», «есть непрочитанные»: отсюда видно, к кому идти с heys_list_messages, без перебора клиентов по одному.',
    inputSchema: { type: 'object', properties: {} },
  });
  schemas.unshift({
    name: 'heys_list_clients',
    description: 'Список клиентов куратора: client_id, имя, статус подписки. Вызывай, когда непонятно, кому вносить, или когда пользователь спрашивает про «клиентов», «кого я веду».',
    inputSchema: { type: 'object', properties: {} },
  });
  return schemas;
}

function curatorInstructions(curatorName) {
  return [
    `Дневники питания, воды, сна и тренировок HEYS. Ты помогаешь куратору${curatorName ? ` (${curatorName})` : ''} вести дневники его клиентов.`,
    '',
    'КРИТИЧЕСКОЕ ПРАВИЛО РЕЖИМА: каждая запись адресная. Прежде чем внести что-либо, ты обязан знать, КОМУ. Если из сообщения не ясно, какому клиенту вносить, — вызови heys_list_clients и уточни у куратора. Никогда не выбирай клиента по догадке: запись в чужой дневник — худшая ошибка этого инструмента.',
    'В каждом ответе называй клиента, которому внёс данные, — так куратор сразу заметит промах.',
    'Если куратор в диалоге явно сказал «сейчас работаем с <имя>» — используй этого клиента для последующих записей, пока он не переключится.',
    '',
    'Правила работы с дневником:',
    '1. Составной напиток или блюдо вносится компонентами, а не одним «итоговым» продуктом. Капучино — это кофе + молоко + сироп, а не строка «капучино».',
    '2. Сначала вызывай heys_list_meal_presets для этого клиента. Если есть подходящий сохранённый набор, вноси приём через preset: набор хранит граммовки клиента.',
    '3. Граммовку, не названную явно, бери из привычной порции клиента — из набора или из его прошлых дней (heys_get_day). Дни вида «Обед · оценочно N%» — заглушки автооценки, из них граммовки не брать.',
    '4. Продукты из личного списка клиента приоритетнее одноимённых из общей базы. У каждого клиента свой список.',
    '5. Если продукт определяется неоднозначно, инструмент вернёт кандидатов — уточни, а не угадывай. Штуки требуют веса штуки из карточки; названный куратором вес запоминается.',
    '6. Перед правкой или удалением приёма вызывай heys_get_day этого клиента, чтобы взять актуальный meal_id. Для «добавь туда ещё» используй heys_update_meal, а не delete+create.',
    '7. Время приёма по умолчанию — текущее московское.',
    '8. Если продукта нет в базе, а куратор прислал фото упаковки — сними состав и создай продукт через heys_create_product в списке ЭТОГО клиента. Значения приводи к 100 г; калорийность HEYS считает сам.',
    '8б. Если продукт ушёл в общую базу по ошибке (домашнее блюдо с брендом в названии), убери его из выдачи: heys_moderate_products с product_id и action hide. Из базы он не удаляется — уже записанные приёмы не пострадают, — и вернуть его можно через unhide.',
    '8а. Продукт с брендом или штрихкодом уезжает и в общую базу автоматически — второй раз его никому заводить не придётся. Домашнее блюдо туда не попадает; если куратор хочет опубликовать именно его, передай share: true, а чтобы промышленный остался только у клиента — share: false.',
    '9. Не выдумывай нутриенты, которых не видно на фото: скажи, чего не хватает.',
    '10. Вопросы про неделю, месяц, динамику веса и пробелы в дневнике закрывает heys_get_period одним вызовом. Не перебирай дни через heys_get_day: в период не попадают позиции приёмов, но именно они для такого вопроса и не нужны.',
    '',
    'Настройки клиента (heys_get_profile / heys_update_profile / heys_update_norms / heys_update_hr_zones):',
    '11. Перед правкой профиля, норм или пульсовых зон читай heys_get_profile: по нему видно текущие значения и то, что менять ничего не нужно.',
    '12. Меняй только те поля, которые куратор назвал. Рост, вес, цели и нормы — это то, из чего считается весь рацион клиента, и «заодно поправить» здесь недопустимо.',
    '13. Утренний вес конкретного дня — это heys_update_day, а не профиль. В профиле вес — базовая настройка, а не измерение.',
    '',
    'Каталог продуктов:',
    '14. Ошибку в карточке продукта исправляй через heys_update_product, а не создавай второй продукт с тем же названием: дубль потом тянется в дневник, наборы и отчёты. heys_create_product — только для действительно нового продукта.',
    '15. Продукт общей базы правится лично для этого клиента; общая карточка меняется только через очередь модерации (heys_moderate_products).',
    '',
    'Администрирование (клиенты, доступ, подписки, заявки):',
    '16. Необратимое действие — создание клиента, смена PIN, сброс подписки — выполняется только после confirm: true. Сначала назови куратору, что именно произойдёт, и дождись ответа.',
    '17. PIN и ссылка доступа — секреты. Они появятся прямо в переписке, поэтому вызывай heys_client_access и heys_create_client только по прямой просьбе куратора и всегда предупреждай, что значение осталось в истории чата.',
    '18. Отказ — по заявке на триал, лиду или продукту на модерации — всегда с причиной: её видит человек по ту сторону.',
    '19. Задачи клиента (heys_get_planning) и тренировочные модули (heys_get_training_status) доступны только на чтение. Если куратор просит что-то там изменить — скажи, что это делается в приложении, и не пытайся обойти.',
    '',
    'Просьбы из мессенджера (heys_list_inbox / heys_list_messages):',
    '20. На вопрос «что нового» или «кто писал» начинай с heys_list_inbox — он показывает всех клиентов с непрочитанными сразу.',
    '21. Если у сообщения есть вложение с фото — открой его через heys_get_photo и смотри сам. Не проси куратора описать снимок словами и не пропускай сообщение как непонятное: на фото обычно и есть ответ, что именно съел клиент.',
    '21а. Открывай только те фото, которые нужны для текущей записи, и не больше трёх-четырёх подряд. Не листай ими весь тред «на всякий случай»: каждое изображение занимает место в разговоре, и на длинной переписке ты просто перестанешь видеть начало. Нужно больше — скажи куратору, что смотришь дальше, и продолжай следующим шагом.',
    '22. Время приёма берётся из того, что написал клиент: «съела в 21:15» — приём на 21:15, а не на момент, когда ты это читаешь. Если клиент время НЕ назвал — спроси куратора, какое ставить. Не подставляй время сообщения и не бери текущее.',
    '23. Граммовку бери ровно ту, что назвал клиент. Если он её НЕ назвал — спроси куратора. Здесь нельзя брать привычную порцию из наборов или прошлых дней, даже если она очевидна: это данные клиента, а не твоя догадка.',
    '24. Внёс просьбу — сразу вызови heys_mark_message_done. Без этого при следующем чтении переписки та же еда будет внесена повторно.',
    '25. Отвечать клиенту через heys_reply_message — по решению куратора, а не автоматически: это его переписка с клиентом, и голос в ней принадлежит ему.',
  ].join('\n');
}

function createCuratorContext({ api, curatorJwt, curatorId = null, curatorName = '', nowMs = Date.now() }) {
  let clientsPromise = null;
  const toolsByClient = new Map();
  const contextByClient = new Map();

  async function loadClients() {
    if (!clientsPromise) {
      clientsPromise = (async () => {
        const { data, error } = await api.listClients(curatorJwt);
        if (error) {
          const expired = /jwt|token|unauthorized|401/i.test(String(error.message)) || error.status === 401;
          throw new ToolError(
            expired ? 'curator_session_expired' : 'upstream_error',
            expired
              ? 'Кураторская сессия истекла. Отключи и заново подключи коннектор HEYS.'
              : `Не удалось получить список клиентов: ${error.message}`,
          );
        }
        return data || [];
      })();
      clientsPromise.catch(() => { clientsPromise = null; });
    }
    return clientsPromise;
  }

  async function resolveTarget(clientArg) {
    const clients = await loadClients();
    if (!clients.length) throw new ToolError('no_clients', 'У куратора нет клиентов.');

    const raw = String(clientArg || '').trim();
    if (!raw) {
      if (clients.length === 1) return clients[0];
      throw new ToolError(
        'client_required',
        'Не указан клиент. Уточни у куратора, кому вносить.',
        { clients: clients.map((c) => ({ client_id: c.client_id, name: c.name })) },
      );
    }

    const byId = clients.find((c) => String(c.client_id) === raw);
    if (byId) return byId;

    const norm = products.normalizeText(raw);
    const exact = clients.filter((c) => products.normalizeText(c.name) === norm);
    if (exact.length === 1) return exact[0];
    const partial = clients.filter((c) => products.normalizeText(c.name).includes(norm));
    if (partial.length === 1) return partial[0];

    throw new ToolError(
      partial.length ? 'client_ambiguous' : 'client_not_found',
      partial.length
        ? `Под «${raw}» подходит несколько клиентов — уточни у куратора, какой именно.`
        : `Клиент «${raw}» не найден. Список — heys_list_clients.`,
      { clients: (partial.length ? partial : clients).map((c) => ({ client_id: c.client_id, name: c.name })) },
    );
  }

  /** Write-context на клиента: один на вызов функции, ошибки не блокируют. */
  async function writeContextFor(clientId) {
    if (!contextByClient.has(clientId)) {
      contextByClient.set(clientId, api.issueWriteContext(curatorJwt, clientId).catch(() => null));
    }
    return contextByClient.get(clientId);
  }

  /** Адаптер клиентского API: те же методы, но кураторскими путями к данным конкретного клиента. */
  function apiForClient(clientId) {
    return {
      stats: api.stats,
      async getKV(_session, key) {
        return api.getKVByCurator(curatorJwt, clientId, key);
      },
      async getKVMany(_session, keys) {
        return api.getKVManyByCurator(curatorJwt, clientId, keys);
      },
      async mergeSaveKV(_session, key, value, lastSeenUpdatedAt) {
        const contextId = await writeContextFor(clientId);
        return api.mergeSaveKVByCurator(curatorJwt, clientId, key, value, lastSeenUpdatedAt, contextId);
      },
      async upsertKV(_session, key, value) {
        const contextId = await writeContextFor(clientId);
        return api.upsertKVByCurator(curatorJwt, clientId, key, value, contextId);
      },
      async getSharedProducts(options) {
        return api.getSharedProducts(options || {});
      },
    };
  }

  function toolsFor(target) {
    if (!toolsByClient.has(target.client_id)) {
      toolsByClient.set(target.client_id, createTools({
        api: apiForClient(target.client_id),
        sessionToken: '__curator__',
        clientId: target.client_id,
        nowMs,
      }).tools);
    }
    return toolsByClient.get(target.client_id);
  }

  /**
   * Форма сообщения задаётся SQL-функцией и может отличаться по именам полей.
   * Поэтому вытаскиваем ключевое по нескольким вариантам, а не жёстко по одному:
   * промах здесь означал бы «сообщений нет» там, где они есть.
   */
  /** Вложения приходят JSONB-массивом; форма элемента может отличаться по версии. */
  function describeAttachments(raw) {
    const list = Array.isArray(raw.attachments) ? raw.attachments : [];
    return list.map((item) => {
      if (!item || typeof item !== 'object') return { kind: 'file' };
      return {
        kind: item.kind || item.type || (item.transcript_text ? 'audio' : 'photo'),
        path: item.path || item.object_path || null,
        transcript: item.transcript_text || item.transcript || null,
      };
    });
  }

  function describeMessage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const text = raw.body ?? raw.text ?? raw.message ?? raw.content ?? '';
    const sentAt = raw.created_at ?? raw.createdAt ?? raw.sent_at ?? raw.ts ?? null;
    const author = raw.sender ?? raw.author ?? raw.from ?? raw.direction ?? null;
    return {
      message_id: raw.id ?? raw.message_id ?? null,
      text: String(text || ''),
      sent_at: sentAt,
      // Время в московской зоне — в нём же ассистент ставит приём, если клиент
      // не назвал время явно… но по правилу куратора он всё равно спросит.
      sent_local: sentAt ? new Date(sentAt).toLocaleString('ru-RU', { timeZone: day.MOSCOW_TZ }) : null,
      from_client: author == null ? null : !/curator/i.test(String(author)),
      done: raw.is_done ?? raw.done ?? false,
      has_attachment: !!(raw.attachment || raw.attachments || raw.photo_id),
      // Сами файлы коннектор не отдаёт: он умеет только текст, а фото клиент
      // и куратор смотрят в приложении. Но знать, что к сообщению приложено
      // фото, ассистенту нужно — иначе «внеси, что на фото» выглядит как
      // сообщение без содержания.
      attachments: describeAttachments(raw),
      intent: raw.intent_type ?? raw.intent ?? null,
      applied_at: raw.applied_at ?? null,
    };
  }

  const tools = {
    /**
     * Сводка по всем перепискам сразу. Имена клиентов приходят не отсюда:
     * SQL-функция считает счётчики по client_id, поэтому подписи берутся из
     * списка клиентов — иначе куратор увидел бы «3 непрочитанных у cid-…».
     */
    async heys_list_inbox() {
      const [clients, res] = await Promise.all([loadClients(), api.getMessagesInbox(curatorJwt)]);
      if (res.error) throw new ToolError('upstream_error', `Не удалось прочитать входящие: ${res.error.message}`);
      const rows = Array.isArray(res.data && res.data.inbox) ? res.data.inbox : [];
      const nameById = new Map(clients.map((c) => [String(c.client_id), c.name || '']));

      const threads = rows.map((row) => {
        const preview = (row && row.last_message_preview) || null;
        const lastAt = row && row.last_message_at;
        return {
          client_id: row && row.client_id,
          name: nameById.get(String(row && row.client_id)) || '',
          unread: Number(row && row.unread_count) || 0,
          last_message_at: lastAt || null,
          last_message_local: lastAt ? new Date(lastAt).toLocaleString('ru-RU', { timeZone: day.MOSCOW_TZ }) : null,
          last_message_from_client: preview ? !/curator/i.test(String(preview.sender_role || '')) : null,
          last_message_text: preview ? String(preview.body || '') : '',
        };
      });

      const waiting = threads.filter((t) => t.unread > 0);
      const text = waiting.length
        ? `Ждут ответа: ${waiting.map((t) => `${t.name || t.client_id} — ${t.unread}`).join('; ')}.`
        : 'Необработанных сообщений нет.';
      return { text, structured: { threads, total_unread: waiting.reduce((sum, t) => sum + t.unread, 0) } };
    },

    async heys_list_messages(args = {}) {
      const target = await resolveTarget(args.client);
      const res = await api.getMessagesThread(curatorJwt, target.client_id, {
        limit: args.limit || 100,
        before: args.before || null,
      });
      if (res.error) {
        throw new ToolError('upstream_error', `Не удалось прочитать переписку: ${res.error.message}`);
      }
      const raw = Array.isArray(res.data && res.data.messages) ? res.data.messages : [];
      const messages = raw.map(describeMessage).filter(Boolean);
      const pending = messages.filter((m) => m.from_client !== false && !m.done).length;
      const label = target.name || target.client_id;
      return {
        text: messages.length
          ? `[${label}] Сообщений: ${messages.length}, из них необработанных от клиента: ${pending}.`
          : `[${label}] Переписки нет.`,
        structured: {
          client: { client_id: target.client_id, name: target.name },
          messages,
        },
      };
    },

    /**
     * Фото из переписки — картинкой в ответ, а не ссылкой.
     *
     * Ссылку модель открыть не может, поэтому «клиент прислал фото» без этого
     * инструмента заканчивалось просьбой к куратору пересказать снимок словами.
     * Путь берётся из вложения сообщения; сервер сам проверяет, что он
     * действительно принадлежит переписке с этим клиентом.
     */
    async heys_get_photo(args = {}) {
      const target = await resolveTarget(args.client);
      const label = target.name || target.client_id;
      const path = String(args.path || '').trim();
      if (!path) {
        throw new ToolError('invalid_path', 'Нужен path вложения — он приходит в attachments сообщения из heys_list_messages.');
      }

      const res = await api.readAttachment(curatorJwt, path);
      if (!res.ok) {
        const known = {
          attachment_not_found: 'Такого вложения нет — возможно, сообщение удалили.',
          curator_does_not_own_client: 'Это вложение принадлежит переписке другого куратора.',
          attachment_not_owned: 'Это вложение принадлежит другому клиенту.',
          invalid_attachment_path: 'Путь не похож на вложение переписки.',
          too_large: 'Фото слишком большое, чтобы показать его здесь. Открой его в приложении.',
          unsupported_image_type: 'Такой формат изображения показать нельзя.',
        };
        throw new ToolError('photo_unavailable', `[${label}] ${known[res.error] || `Не удалось открыть фото: ${res.error}`}`);
      }

      return {
        text: `[${label}] Фото из переписки (${Math.round(res.bytes / 1024)} КБ). Смотри изображение и вноси по нему; если на снимке этикетка — снимай состав на 100 г.`,
        images: [{ data: res.data, mimeType: res.mimeType }],
        structured: {
          client: { client_id: target.client_id, name: target.name },
          path,
          mime_type: res.mimeType,
          bytes: res.bytes,
        },
      };
    },

    async heys_mark_message_done(args = {}) {
      const target = await resolveTarget(args.client);
      if (!args.message_id) throw new ToolError('invalid_message_id', 'Нужен message_id из heys_list_messages.');
      const res = await api.setMessageDone(curatorJwt, String(args.message_id), args.done !== false);
      if (res.error) throw new ToolError('upstream_error', `Не удалось изменить статус сообщения: ${res.error.message}`);
      const label = target.name || target.client_id;
      return {
        text: `[${label}] Сообщение ${args.message_id} помечено как ${args.done === false ? 'необработанное' : 'обработанное'}.`,
        structured: { client: { client_id: target.client_id, name: target.name }, message_id: args.message_id, done: args.done !== false },
      };
    },

    async heys_reply_message(args = {}) {
      const target = await resolveTarget(args.client);
      const text = String(args.text || '').trim();
      if (!text) throw new ToolError('invalid_text', 'Нужен текст ответа.');
      const res = await api.sendMessageToClient(curatorJwt, target.client_id, text);
      if (res.error) throw new ToolError('upstream_error', `Не удалось отправить сообщение: ${res.error.message}`);
      const label = target.name || target.client_id;
      return {
        text: `[${label}] Отправил: «${text}»`,
        structured: { client: { client_id: target.client_id, name: target.name }, sent: text },
      };
    },

    /**
     * Очередь модерации общей базы. Список и решение — один инструмент:
     * решение без предварительного списка невозможно (нужен pending_id), а
     * разносить их по двум инструментам значит удвоить шанс промаха моделью.
     */
    async heys_moderate_products(args = {}) {
      // Исправление ошибочной публикации. Удаления из общего каталога нет ни
      // здесь, ни в приложении: строку могли уже записать в приёмы у других
      // клиентов. Blocklist убирает продукт из выдачи и снимается обратно.
      if (args.product_id) {
        const action = String(args.action || 'hide').toLowerCase();
        if (action !== 'hide' && action !== 'unhide') {
          throw new ToolError('invalid_action', 'Для продукта общей базы action — «hide» (убрать из выдачи) или «unhide» (вернуть).');
        }
        if (!curatorId) throw new ToolError('no_curator_id', 'Не удалось определить куратора — переподключи коннектор.');
        const res = await api.setSharedProductHidden(curatorJwt, curatorId, args.product_id, action === 'hide');
        if (!res.ok) throw new ToolError('blocklist_failed', `Не удалось изменить видимость продукта: ${res.error}`);
        return {
          text: action === 'hide'
            ? `Продукт ${args.product_id} убран из общей выдачи у твоих клиентов. Из базы он не удалён — уже записанные приёмы не пострадали, и вернуть его можно через action «unhide».`
            : `Продукт ${args.product_id} снова виден твоим клиентам.`,
          structured: { product_id: args.product_id, hidden: action === 'hide' },
        };
      }

      if (!args.pending_id) {
        if (!curatorId) throw new ToolError('no_curator_id', 'Не удалось определить куратора — переподключи коннектор.');
        const res = await api.getPendingSharedProducts(curatorJwt, curatorId, { limit: args.limit || 50 });
        if (res.error) throw new ToolError('upstream_error', `Не удалось прочитать очередь модерации: ${res.error.message}`);
        const items = (res.data || []).map((row) => {
          const data = (row && row.product_data) || {};
          return {
            pending_id: row.id,
            name: data.name || '(без названия)',
            brand: data.brand || null,
            kcal100: data.kcal100 ?? null,
            barcode: row.barcode || data.barcode || null,
            client_id: row.client_id || null,
            created_at: row.created_at || null,
          };
        });
        return {
          text: items.length
            ? `На модерации ${items.length}: ${items.map((i) => `«${i.name}»${i.brand ? ` (${i.brand})` : ''}`).join('; ')}.`
            : 'Очередь модерации пуста.',
          structured: { pending: items },
        };
      }

      const action = String(args.action || '').toLowerCase();
      if (action !== 'approve' && action !== 'reject') {
        throw new ToolError('invalid_action', 'action — «approve» или «reject». Чтобы убрать из выдачи уже опубликованный продукт, вызови с product_id и action «hide».');
      }
      if (action === 'reject' && !String(args.reason || '').trim()) {
        throw new ToolError('reason_required', 'Для отклонения нужна причина: её увидит клиент, приславший продукт.');
      }

      const res = await api.moderatePendingProduct(curatorJwt, args.pending_id, action, args.reason);
      if (res.race) {
        throw new ToolError('already_moderated', 'Эту заявку уже разобрали — обнови список через heys_moderate_products без аргументов.');
      }
      if (!res.ok) throw new ToolError('moderation_failed', `Не удалось обработать заявку: ${res.error}`);
      return {
        text: action === 'approve'
          ? `Продукт ${args.pending_id} одобрен и добавлен в общую базу.`
          : `Продукт ${args.pending_id} отклонён: ${args.reason}.`,
        structured: { pending_id: args.pending_id, action, reason: args.reason || null },
      };
    },

    /**
     * Новый клиент. PIN возвращается в ответе — иначе клиенту нечем войти, —
     * поэтому инструмент требует подтверждения: значение осядет в переписке.
     */
    async heys_create_client(args = {}) {
      const name = String(args.name || '').trim();
      if (!name) throw new ToolError('invalid_name', 'Нужно имя клиента.');
      if (!admin.isValidPhone(args.phone)) {
        throw new ToolError('invalid_phone', `Телефон «${args.phone || ''}» не похож на российский номер. Ожидается 11 цифр, например +7 999 123-45-67.`);
      }
      if (args.confirm !== true) {
        throw new ToolError('confirm_required', `Создать клиента «${name}» с номером ${admin.formatPhone(args.phone)}? PIN придёт в ответе и останется в истории чата. Подтверди вызовом с confirm: true.`);
      }

      const pin = args.pin ? String(args.pin) : admin.generatePin();
      if (!admin.validatePinStrict(pin)) {
        throw new ToolError('invalid_pin', 'PIN — четыре цифры, и не из очевидных вроде 1234 или 0000. Не передавай pin вовсе, чтобы он сгенерировался сам.');
      }

      const salt = admin.generateSalt();
      const res = await api.createClientWithPin(curatorJwt, {
        name,
        phone: admin.normalizePhone(args.phone),
        pinSalt: salt,
        pinHash: admin.hashPin(pin, salt),
      });
      if (!res.ok) throw new ToolError('create_failed', `Не удалось создать клиента: ${res.error}`);
      clientsPromise = null; // список клиентов устарел

      const created = res.data || {};
      return {
        text: `Создал клиента «${name}» (${admin.formatPhone(args.phone)}). PIN: ${pin}. ${admin.SECRET_WARNING}`,
        structured: {
          client_id: created.client_id || created.id || null,
          name,
          phone: admin.normalizePhone(args.phone),
          pin,
          contains_secret: true,
        },
      };
    },

    /**
     * Доступ клиента: перевыпуск PIN и текущая ссылка входа. Оба значения —
     * секреты, поэтому оба требуют подтверждения и оба помечены в ответе.
     */
    async heys_client_access(args = {}) {
      const target = await resolveTarget(args.client);
      const label = target.name || target.client_id;
      const action = String(args.action || 'link').toLowerCase();

      if (action === 'link') {
        const res = await api.getClientAccessLink(curatorJwt, target.client_id);
        if (!res.ok) throw new ToolError('access_link_failed', `[${label}] Не удалось получить ссылку доступа: ${res.error}`);
        const data = res.data || {};
        const link = data.link || data.url || data.access_link || null;
        if (!link) {
          return { text: `[${label}] Ссылки доступа сейчас нет — клиент ещё не привязан.`, structured: { client: { client_id: target.client_id, name: target.name }, link: null } };
        }
        return {
          text: `[${label}] Ссылка доступа: ${link}. ${admin.SECRET_WARNING}`,
          structured: { client: { client_id: target.client_id, name: target.name }, link, contains_secret: true },
        };
      }

      if (action !== 'reset_pin') throw new ToolError('invalid_action', 'action — «link» (получить ссылку) или «reset_pin» (сменить PIN).');
      if (args.confirm !== true) {
        throw new ToolError('confirm_required', `[${label}] Сменить PIN клиента? Старый перестанет работать сразу, новый придёт в ответе и останется в истории чата. Подтверди вызовом с confirm: true.`);
      }

      const pin = args.pin ? String(args.pin) : admin.generatePin();
      if (!admin.validatePinStrict(pin)) {
        throw new ToolError('invalid_pin', 'PIN — четыре цифры, и не из очевидных вроде 1234 или 0000.');
      }
      const res = await api.setClientPin(curatorJwt, target.client_id, pin);
      if (!res.ok) throw new ToolError('pin_reset_failed', `[${label}] Не удалось сменить PIN: ${res.error}`);
      return {
        text: `[${label}] Новый PIN: ${pin}. Старый больше не действует. ${admin.SECRET_WARNING}`,
        structured: { client: { client_id: target.client_id, name: target.name }, pin, contains_secret: true },
      };
    },

    /** Подписка клиента: продление на месяцы или сброс. */
    async heys_manage_subscription(args = {}) {
      const target = await resolveTarget(args.client);
      const label = target.name || target.client_id;
      const action = String(args.action || '').toLowerCase();
      if (!curatorId) throw new ToolError('no_curator_id', 'Не удалось определить куратора — переподключи коннектор.');

      if (action === 'extend') {
        const months = Number(args.months);
        if (!Number.isInteger(months) || months < 1 || months > 24) {
          throw new ToolError('invalid_months', 'months — целое число от 1 до 24.');
        }
        const res = await api.extendSubscription(curatorJwt, curatorId, target.client_id, months);
        if (!res.ok) throw new ToolError('subscription_failed', `[${label}] Не удалось продлить подписку: ${res.error}`);
        const sub = admin.describeSubscription(res.data) || {};
        return {
          text: `[${label}] Подписка продлена на ${months} мес.${sub.active_until ? ` — до ${sub.active_until}` : ''}`,
          structured: { client: { client_id: target.client_id, name: target.name }, ...sub },
        };
      }

      if (action !== 'cancel') throw new ToolError('invalid_action', 'action — «extend» (продлить, нужны months) или «cancel» (сбросить).');
      if (args.confirm !== true) {
        throw new ToolError('confirm_required', `[${label}] Сбросить подписку? Клиент потеряет доступ сразу. Подтверди вызовом с confirm: true.`);
      }
      const res = await api.cancelSubscription(curatorJwt, curatorId, target.client_id);
      if (!res.ok) throw new ToolError('subscription_failed', `[${label}] Не удалось сбросить подписку: ${res.error}`);
      return {
        text: `[${label}] Подписка сброшена, доступ закрыт.`,
        structured: { client: { client_id: target.client_id, name: target.name }, status: 'none' },
      };
    },

    /** Очередь заявок на триал: список, активация, отказ. */
    async heys_trial_queue(args = {}) {
      const action = String(args.action || 'list').toLowerCase();

      if (action === 'list') {
        const [queue, stats] = await Promise.all([api.getTrialQueue(curatorJwt), api.getQueueStats(curatorJwt)]);
        if (!queue.ok) throw new ToolError('upstream_error', `Не удалось прочитать очередь: ${queue.error}`);
        const payload = queue.data || {};
        const items = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload) ? payload : []);
        return {
          text: items.length
            ? `В очереди ${items.length}: ${items.slice(0, 10).map((i) => `${i.name || i.client_name || i.phone || i.id}${i.status ? ` (${i.status})` : ''}`).join('; ')}${items.length > 10 ? '…' : ''}`
            : 'Очередь на триал пуста.',
          structured: { queue: items, stats: stats.ok ? stats.data : null },
        };
      }

      if (action === 'activate') {
        const target = await resolveTarget(args.client);
        const label = target.name || target.client_id;
        const res = await api.activateTrial(curatorJwt, target.client_id, args.start_date || null);
        if (!res.ok) throw new ToolError('trial_failed', `[${label}] Не удалось активировать триал: ${res.error}`);
        const data = res.data || {};
        return {
          text: `[${label}] Триал активирован${data.trial_ends_at ? ` до ${data.trial_ends_at}` : ''}.`,
          structured: { client: { client_id: target.client_id, name: target.name }, ...data },
        };
      }

      if (action !== 'reject') throw new ToolError('invalid_action', 'action — «list», «activate» (нужен client) или «reject» (нужны queue_id и reason).');
      if (!args.queue_id) throw new ToolError('invalid_queue_id', 'Нужен queue_id из списка очереди.');
      const reason = String(args.reason || '').trim();
      if (!reason) throw new ToolError('reason_required', 'Для отказа нужна причина — она уходит в карточку заявки.');
      const res = await api.rejectTrialRequest(curatorJwt, args.queue_id, reason);
      if (!res.ok) throw new ToolError('trial_failed', `Не удалось отклонить заявку: ${res.error}`);
      return {
        text: `Заявка ${args.queue_id} отклонена: ${reason}.`,
        structured: { queue_id: args.queue_id, rejected: true, reason },
      };
    },

    /** Лиды с лендинга: список и смена статуса. */
    async heys_leads(args = {}) {
      const action = String(args.action || 'list').toLowerCase();

      if (action === 'list') {
        const res = await api.getLeads(curatorJwt, args.status || null);
        if (!res.ok) throw new ToolError('upstream_error', `Не удалось прочитать лиды: ${res.error}`);
        const rows = Array.isArray(res.data) ? res.data : (res.data && Array.isArray(res.data.leads) ? res.data.leads : []);
        return {
          text: rows.length
            ? `Лидов${args.status ? ` со статусом «${args.status}»` : ''}: ${rows.length}. Последние: ${rows.slice(0, 10).map((l) => `${l.name || l.phone || l.id}${l.status ? ` (${l.status})` : ''}`).join('; ')}`
            : `Лидов${args.status ? ` со статусом «${args.status}»` : ''} нет.`,
          structured: { leads: rows },
        };
      }

      if (action !== 'update') throw new ToolError('invalid_action', 'action — «list» или «update» (нужны lead_id и status).');
      if (!args.lead_id) throw new ToolError('invalid_lead_id', 'Нужен lead_id из списка.');
      const status = String(args.status || '').trim();
      if (!status) throw new ToolError('invalid_status', 'Нужен новый статус лида, например «rejected».');
      const res = await api.updateLeadStatus(curatorJwt, args.lead_id, status, args.reason);
      if (!res.ok) throw new ToolError('lead_update_failed', `Не удалось обновить лид: ${res.error}`);
      return {
        text: `Лид ${args.lead_id} → статус «${status}»${args.reason ? ` (${args.reason})` : ''}.`,
        structured: { lead_id: args.lead_id, status, reason: args.reason || null },
      };
    },

    /**
     * Диагностика клиента: сессии и входы. Отвечает на «у неё не
     * синхронизируется» до того, как куратор пойдёт смотреть логи руками.
     */
    async heys_get_client_health(args = {}) {
      const target = await resolveTarget(args.client);
      const label = target.name || target.client_id;
      const hours = Math.min(Math.max(Number(args.hours) || 24, 1), 24 * 30);
      const since = new Date(nowMs - hours * 3600000).toISOString();

      const res = await api.getClientObservability(curatorJwt, target.client_id, { since, limit: 100 });
      if (!res.ok) throw new ToolError('upstream_error', `[${label}] Не удалось прочитать диагностику: ${res.error}`);
      const data = res.data || {};
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      const logins = Array.isArray(data.logins) ? data.logins : [];
      const failed = logins.filter((l) => l && /fail|error|denied/i.test(String(l.type || ''))).length;

      return {
        text: `[${label}] За ${hours} ч: сессий ${sessions.length}, входов ${logins.length}${failed ? `, из них неудачных ${failed}` : ''}.`,
        structured: {
          client: { client_id: target.client_id, name: target.name },
          since,
          sessions,
          logins,
          failed_logins: failed,
        },
      };
    },

    async heys_list_clients() {
      const clients = await loadClients();
      const text = clients.length
        ? `Клиенты: ${clients.map((c) => `${c.name || c.client_id}${c.status ? ` (${c.status})` : ''}`).join('; ')}`
        : 'У куратора нет клиентов.';
      return { text, structured: { clients } };
    },
  };

  for (const schema of TOOL_SCHEMAS) {
    tools[schema.name] = async (args = {}) => {
      const { client, ...rest } = args;
      const target = await resolveTarget(client);
      const result = await toolsFor(target)[schema.name](rest);
      const label = target.name || target.client_id;
      return {
        text: `[${label}] ${result.text}`,
        structured: { client: { client_id: target.client_id, name: target.name }, ...result.structured },
      };
    };
  }

  /**
   * Создание продукта у куратора — это ещё и пополнение общей базы.
   *
   * Куратор владеет общим каталогом, и заводить одну и ту же пачку творога
   * заново каждому клиенту бессмысленно. Но лить туда всё подряд нельзя:
   * домашнее блюдо имеет уникальный состав, дедупликация его не отсечёт, и
   * каталог замусорится чужими рецептами. Поэтому по умолчанию публикуется
   * только промышленное — то, у чего есть бренд или штрихкод, — а решение
   * куратора (`share`) сильнее этого правила в обе стороны.
   *
   * Дубликат общей базы не считается сбоем: карточка клиента уже создана, а
   * «такой продукт там уже есть» — ровно то, ради чего дедупликация и нужна.
   */
  const createProductForClient = tools.heys_create_product;
  tools.heys_create_product = async (args = {}) => {
    const { share, ...rest } = args;
    const result = await createProductForClient(rest);
    const row = result.structured && result.structured.created_row;
    if (!row) return result;

    const wanted = share === undefined || share === null ? products.looksIndustrial(row) : !!share;
    if (!wanted) {
      const why = share === false ? 'по твоему решению' : 'нет бренда и штрихкода, похоже на домашнее блюдо';
      return {
        ...result,
        text: `${result.text} В общую базу не публиковал — ${why}.`,
        structured: { ...result.structured, shared: false, shared_reason: why },
      };
    }
    if (!curatorId) {
      return {
        ...result,
        text: `${result.text} В общую базу опубликовать не смог: не определён куратор — переподключи коннектор.`,
        structured: { ...result.structured, shared: false, shared_reason: 'no_curator_id' },
      };
    }

    const payload = {
      ...row,
      fingerprint: products.computeProductFingerprint(row),
      brand_fingerprint: products.computeProductBrandFingerprint(row) || null,
    };
    const published = await api.publishSharedProduct(curatorJwt, curatorId, payload);

    if (published.duplicate) {
      return {
        ...result,
        text: `${result.text} В общей базе такой продукт уже есть — публиковать второй раз не стал.`,
        structured: { ...result.structured, shared: false, shared_reason: 'duplicate' },
      };
    }
    if (!published.ok) {
      return {
        ...result,
        text: `${result.text} В личный список продукт добавлен, но в общую базу не уехал: ${published.error}.`,
        structured: { ...result.structured, shared: false, shared_reason: published.error },
      };
    }
    return {
      ...result,
      text: `${result.text} Опубликовал и в общую базу — теперь он найдётся у всех клиентов.`,
      structured: { ...result.structured, shared: true },
    };
  };

  return {
    tools,
    schemas: buildCuratorSchemas(),
    instructions: curatorInstructions(curatorName),
  };
}

module.exports = { createCuratorContext, buildCuratorSchemas, curatorInstructions, CLIENTLESS_TOOLS };
