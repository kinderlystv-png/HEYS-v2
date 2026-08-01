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

  const tools = {
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
