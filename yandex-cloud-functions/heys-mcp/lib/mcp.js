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
function toolFailure(message, code, details) {
  const payload = { ok: false, error: code || 'tool_error', message };
  if (details) Object.assign(payload, details);
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: payload,
    isError: true,
  };
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
        instructions: [
          'Дневник питания, воды, сна и тренировок HEYS. Пользователь описывает съеденное свободным текстом, а ты вносишь это за него.',
          '',
          'Правила работы:',
          '1. Составной напиток или блюдо вносится компонентами, а не одним «итоговым» продуктом. Капучино — это кофе + молоко + сироп, а не строка «капучино».',
          '2. Сначала вызывай heys_list_meal_presets. Если у пользователя есть подходящий сохранённый набор, вноси приём через preset: набор хранит его собственные граммовки, и дневник остаётся однородным.',
          '3. Граммовку, не названную явно, бери из привычной для пользователя порции — из набора или из того, как этот продукт вносился раньше (heys_get_day за прошлые даты). Не подставляй «круглые» значения от себя.',
          '4. Продукты из личного списка пользователя приоритетнее одноимённых из общей базы.',
          '5. Если продукт определяется неоднозначно, инструмент вернёт кандидатов — уточни у пользователя, а не угадывай. Уверен — вноси сам, не переспрашивая.',
          '6. Перед правкой или удалением приёма вызывай heys_get_day, чтобы взять актуальный meal_id.',
          '7. Время приёма по умолчанию — текущее московское. Если пользователь говорит «утром», «за обедом», уточни время или поставь правдоподобное и назови его в ответе.',
        ].join('\n'),
      });
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return isNotification ? null : rpcResult(id, {});

    case 'tools/list':
      return rpcResult(id, { tools: TOOL_SCHEMAS });

    case 'tools/call': {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      const handler = ctx.tools && ctx.tools[name];
      if (!handler) {
        return rpcError(id, JSONRPC_ERRORS.INVALID_PARAMS, `Unknown tool: ${name}`);
      }
      try {
        const result = await handler(args);
        return rpcResult(id, {
          content: [{ type: 'text', text: result.text }],
          structuredContent: { ok: true, ...result.structured },
        });
      } catch (e) {
        if (e && e.code) {
          return rpcResult(id, toolFailure(e.message, e.code, e.details));
        }
        ctx.logError?.('tool_failed', { tool: name, message: e && e.message });
        return rpcResult(id, toolFailure('Внутренняя ошибка HEYS при выполнении инструмента.', 'internal_error'));
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
};
