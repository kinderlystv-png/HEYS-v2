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
const day = require('./day');

/** Инструменты, которым не нужен целевой клиент. */
const CLIENTLESS_TOOLS = new Set(['heys_list_clients']);

const CLIENT_ARG = {
  type: 'string',
  description: 'Кому вносим: имя клиента или client_id из heys_list_clients. Обязательно, если у куратора больше одного клиента.',
};

function buildCuratorSchemas() {
  const schemas = TOOL_SCHEMAS.map((schema) => ({
    ...schema,
    description: `${schema.description} Работает с дневником выбранного клиента куратора.`,
    inputSchema: {
      ...schema.inputSchema,
      properties: { client: CLIENT_ARG, ...(schema.inputSchema.properties || {}) },
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
    '9. Не выдумывай нутриенты, которых не видно на фото: скажи, чего не хватает.',
    '',
    'Просьбы из мессенджера (heys_list_messages):',
    '10. Время приёма берётся из того, что написал клиент: «съела в 21:15» — приём на 21:15, а не на момент, когда ты это читаешь. Если клиент время НЕ назвал — спроси куратора, какое ставить. Не подставляй время сообщения и не бери текущее.',
    '11. Граммовку бери ровно ту, что назвал клиент. Если он её НЕ назвал — спроси куратора. Здесь нельзя брать привычную порцию из наборов или прошлых дней, даже если она очевидна: это данные клиента, а не твоя догадка.',
    '12. Внёс просьбу — сразу вызови heys_mark_message_done. Без этого при следующем чтении переписки та же еда будет внесена повторно.',
    '13. Отвечать клиенту через heys_reply_message — по решению куратора, а не автоматически: это его переписка с клиентом, и голос в ней принадлежит ему.',
  ].join('\n');
}

function createCuratorContext({ api, curatorJwt, curatorName = '', nowMs = Date.now() }) {
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
      intent: raw.intent_type ?? raw.intent ?? null,
    };
  }

  const tools = {
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

  return {
    tools,
    schemas: buildCuratorSchemas(),
    instructions: curatorInstructions(curatorName),
  };
}

module.exports = { createCuratorContext, buildCuratorSchemas, curatorInstructions, CLIENTLESS_TOOLS };
