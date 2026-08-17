'use strict';

/**
 * Парсинг строк `mcp_call` из экспорта Cloud Logging / yc logs.
 *
 * Hot path читает Postgres. Этот модуль — только `extractRecord` для тестов.
 */

const CALL_FILTER = 'json_payload.t = "mcp_call" OR message: "mcp_call"';

function extractRecord(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const payload = entry.jsonPayload || entry.json_payload;
  if (payload && payload.t === 'mcp_call') return payload;
  const raw = entry.message;
  if (typeof raw === 'string' && raw.includes('"mcp_call"')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.t === 'mcp_call') return parsed;
    } catch (_) { /* не наша строка */ }
    const start = raw.indexOf('{"t":"mcp_call"');
    if (start >= 0) {
      try {
        const parsed = JSON.parse(raw.slice(start));
        if (parsed && parsed.t === 'mcp_call') return parsed;
      } catch (_) { /* битая строка */ }
    }
  }
  return null;
}

module.exports = {
  CALL_FILTER,
  extractRecord,
};
