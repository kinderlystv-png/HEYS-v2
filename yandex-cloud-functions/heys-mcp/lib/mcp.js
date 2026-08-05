'use strict';

/**
 * Транспорт MCP: Streamable HTTP в stateless-режиме.
 *
 * Спека разрешает отвечать на POST обычным `application/json`, если сервер не
 * открывает поток. Cloud Function живёт запросом и не держит соединение, поэтому
 * SSE и Mcp-Session-Id не используются — это осознанно, а не упрощение.
 */

const { TOOL_SCHEMAS } = require('./tools');

const SERVER_INFO = { name: 'heys-mcp', title: 'HEYS', version: '1.0.0' };
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

const JSONRPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error };
}

function negotiateProtocolVersion(requested) {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION;
}

/**
 * Ошибка инструмента возвращается не как JSON-RPC error, а как результат с
 * isError: по спеке это ошибка выполнения, которую модель должна увидеть и
 * исправить сама (уточнить продукт, поправить дату), а не сбой протокола.
 */
function toolFailure(message, code, details, meta) {
  const payload = { ok: false, error: code || 'tool_error', message };
  if (details) Object.assign(payload, details);
  const result = {
    content: [{ type: 'text', text: message }],
    structuredContent: payload,
    isError: true,
  };
  if (meta) result._meta = meta;
  return result;
}

/**
 * Контент результата: текст всегда, картинки — если инструмент их вернул.
 *
 * Фото из переписки отдаётся именно image-блоком, а не ссылкой: у модели нет
 * доступа к нашему хранилищу, и ссылка означала бы «посмотри сам в
 * приложении» — ровно то, ради отмены чего инструмент и делался.
 */
function toolContent(result) {
  const content = [{ type: 'text', text: result.text }];
  for (const image of (Array.isArray(result.images) ? result.images : [])) {
    if (!image || !image.data) continue;
    content.push({ type: 'image', data: image.data, mimeType: image.mimeType || 'image/jpeg' });
  }
  return content;
}

async function handleMessage(message, ctx) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return rpcError(null, JSONRPC_ERRORS.INVALID_REQUEST, 'Invalid JSON-RPC message');
  }
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  // Ответы клиента на наши запросы нам не нужны — сервер их не инициирует.
  if (!method) return null;

  switch (method) {
    case 'initialize': {
      const requested = params && params.protocolVersion;
      return rpcResult(id, {
        protocolVersion: negotiateProtocolVersion(requested),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        // Кураторский коннектор присылает свои инструкции через ctx —
        // базовый текст ниже относится к клиентскому режиму.
        instructions: ctx.instructions || [
          'Дневник питания, воды, сна и тренировок HEYS. Пользователь описывает съеденное свободным текстом, а ты вносишь это за него.',
          '',
          'Правила работы:',
          '1. Составной напиток или блюдо вносится компонентами, а не одним «итоговым» продуктом. Капучино — это кофе + молоко + сироп, а не строка «капучино».',
          '2. Сначала вызывай heys_list_meal_presets. Если у пользователя есть подходящий сохранённый набор, вноси приём через preset: набор хранит его собственные граммовки, и дневник остаётся однородным.',
          '3. Граммовку, не названную явно, бери из привычной для пользователя порции — из набора или из того, как этот продукт вносился раньше (heys_get_day за прошлые даты). Не подставляй «круглые» значения от себя. Приёмы с названием вида «Обед · оценочно 155%» — заглушки автооценки, а не реальная еда: граммовки из них не бери.',
          '4. Продукты из личного списка пользователя приоритетнее одноимённых из общей базы.',
          '5. Если продукт определяется неоднозначно, инструмент вернёт кандидатов — уточни у пользователя, а не угадывай. Уверен — вноси сам, не переспрашивая.',
          '6. Перед правкой или удалением приёма вызывай heys_get_day, чтобы взять актуальный meal_id.',
          '7. Добавить еду в уже записанный приём — heys_update_meal. Не удаляй и не пересоздавай приём ради этого: он получит новый id и потеряет оценки самочувствия.',
          '8. Штуки вноси через pieces, а не пересчитывай в граммы сам. Вес одной штуки инструмент возьмёт из карточки продукта; если его там нет — спросит, и названное пользователем значение сохранит в карточку.',
          '9. Время приёма по умолчанию — текущее московское. Сказал «утром» или «за обедом» — поставь правдоподобное время и назови его в ответе, чтобы он поправил одним словом. Не спрашивай: переспрос ради минут дороже самой правки.',
          '10. Если продукта нет в базе, а пользователь прислал фотографию упаковки — сними с неё состав и пищевую ценность и создай продукт через heys_create_product, затем вноси приём. Все значения приводи к 100 г. Калорийность HEYS считает сам, с упаковки её не переноси.',
          '11. Не выдумывай нутриенты, которых не видно на фото: если данных не хватает даже для обязательных полей, скажи, чего именно не хватает, и попроси снимок нужной части упаковки.',
          '12. Вопросы про неделю, месяц и динамику веса закрывает heys_get_period одним вызовом — не перебирай дни через heys_get_day.',
          '13. Рост, вес, целевой вес, норму сна и шагов, целевой дефицит и нормы рациона показывает heys_get_profile, а меняют heys_update_profile и heys_update_norms. Утренний вес конкретного дня — это heys_update_day, а не профиль.',
          '14. У напитков пищевая ценность на упаковке обычно дана на 100 мл, а не на 100 г — скажи об этом пользователю, если вносишь напиток по этикетке. Сходимость проверяй так: белки×4 + углеводы×4 + жиры×9 должно примерно совпасть с ккал на упаковке. Совпало без белков и жиров — значит их там действительно нет, а не «не поместились на этикетку».',
        ].join('\n'),
      });
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return isNotification ? null : rpcResult(id, {});

    case 'tools/list':
      return rpcResult(id, { tools: ctx.toolSchemas || TOOL_SCHEMAS });

    case 'tools/call': {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      if (ctx.authRequired) {
        return rpcResult(id, toolFailure(
          'Подключи HEYS через OAuth, чтобы использовать этот инструмент.',
          'authentication_required',
          null,
          { 'mcp/www_authenticate': [ctx.authRequired] },
        ));
      }
      const handler = ctx.tools && ctx.tools[name];
      if (!handler) {
        return rpcError(id, JSONRPC_ERRORS.INVALID_PARAMS, `Unknown tool: ${name}`);
      }

      // Каждый вызов измеряется: и полное время, и та его часть, что ушла на
      // обращения к API. Без этого непонятно, что дорожает — логика инструмента
      // или количество round-trip'ов, и какой из сценариев записи оптимизировать.
      const startedAt = Date.now();
      const upstreamBefore = ctx.upstream ? ctx.upstream() : null;
      const measure = () => {
        const upstreamAfter = ctx.upstream ? ctx.upstream() : null;
        return {
          ms: Date.now() - startedAt,
          upstream: upstreamBefore && upstreamAfter
            ? { calls: upstreamAfter.calls - upstreamBefore.calls, ms: upstreamAfter.ms - upstreamBefore.ms }
            : null,
        };
      };

      try {
        const result = await handler(args);
        const timing = measure();
        ctx.logMetric?.({ tool: name, ok: true, ...timing });
        return rpcResult(id, {
          content: toolContent(result),
          structuredContent: { ok: true, ...result.structured, duration_ms: timing.ms },
        });
      } catch (e) {
        const timing = measure();
        if (e && e.code) {
          ctx.logMetric?.({ tool: name, ok: false, error: e.code, ...timing });
          return rpcResult(id, toolFailure(e.message, e.code, { ...e.details, duration_ms: timing.ms }));
        }
        ctx.logMetric?.({ tool: name, ok: false, error: 'internal_error', ...timing });
        ctx.logError?.('tool_failed', { tool: name, message: e && e.message });
        return rpcResult(id, toolFailure('Внутренняя ошибка HEYS при выполнении инструмента.', 'internal_error', { duration_ms: timing.ms }));
      }
    }

    default:
      return isNotification ? null : rpcError(id, JSONRPC_ERRORS.METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

/** Батч по JSON-RPC 2.0: пустой массив невалиден, ответы только на запросы с id. */
async function handlePayload(payload, ctx) {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return [rpcError(null, JSONRPC_ERRORS.INVALID_REQUEST, 'Empty batch')];
    }
    const responses = [];
    for (const message of payload) {
      const response = await handleMessage(message, ctx);
      if (response) responses.push(response);
    }
    return responses.length ? responses : null;
  }
  return handleMessage(payload, ctx);
}

module.exports = {
  SERVER_INFO,
  SUPPORTED_PROTOCOL_VERSIONS,
  LATEST_PROTOCOL_VERSION,
  JSONRPC_ERRORS,
  negotiateProtocolVersion,
  handleMessage,
  handlePayload,
  rpcResult,
  rpcError,
  toolFailure,
  toolContent,
};
