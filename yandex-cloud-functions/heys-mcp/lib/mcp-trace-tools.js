'use strict';

/**
 * tasks_mcp_trace — связка блока стенограммы с цепочкой mcp_call по запросу.
 */

const tasks = require('./tasks');
const correlate = require('./mcp-correlate');
const callContext = require('./call-context');

const TRACE_TOOL = 'tasks_mcp_trace';
const LOG_PADDING_MS = 60 * 1000;
const TELEMETRY_READ_TIMEOUT_MS = 20000;

const MCP_TRACE_SCHEMA = {
  name: TRACE_TOOL,
  description:
    'Связать блок стенограммы (после tasks_checkpoint) с цепочкой вызовов MCP по таймингам из Postgres. Зови, когда нужно понять «сколько кругов» или «почему долго» по конкретному обмену — не на каждый tasks_read. Без heading — все размеченные обмены за день (медленнее). Подтверждённые вызовы — session_id совпал с меткой стенограммы; вероятные — только попали в окно ±5 мин.',
  inputSchema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description:
          'День стенограммы YYYY-MM-DD. По умолчанию — taskDay (сутки с 03:00 МСК, как у tasks_checkpoint), не календарное число.',
      },
      heading: {
        type: 'string',
        description:
          'Один обмен ЧЧ:ММ. При нескольких блоках с тем же временем — последний в файле. Без heading — все размеченные блоки за день.',
      },
      window_ms: {
        type: 'number',
        description: `Окно correlate в миллисекундах. По умолчанию ${correlate.DEFAULT_WINDOW_MS}.`,
      },
    },
  },
};

function padHeading(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  return `${String(match[1]).padStart(2, '0')}:${String(match[2]).padStart(2, '0')}`;
}

function formatToolChain(tools) {
  return tools && tools.length ? tools.join(' → ') : '(нет вызовов в окне)';
}

function formatRowText(row) {
  const kin = row.kin ? ` «${row.kin.slice(0, 80)}${row.kin.length > 80 ? '…' : ''}»` : '';
  const confirmed = formatToolChain(row.confirmed_tools);
  const probable = row.probable_tools && row.probable_tools.length
    ? `\n  вероятные (${row.probable_ms} мс): ${formatToolChain(row.probable_tools)}`
    : '';
  return `${row.heading || '??:??'}${kin}: подтверждённые ${row.confirmed_calls.length} вызовов, ${row.confirmed_ms} мс — ${confirmed}${probable}`;
}

function excludeSelfCalls(calls, { sessionId, seq } = {}) {
  return (calls || []).filter((call) => {
    if (call.tool === TRACE_TOOL) return false;
    if (sessionId && call.session_id === sessionId && Number(call.seq) === Number(seq)) return false;
    return true;
  });
}

function narrowLogWindow(exchanges, windowMs) {
  if (!exchanges.length) return null;
  const pins = exchanges.map((e) => e.pinMs).filter((ms) => Number.isFinite(ms));
  if (!pins.length) return null;
  const min = Math.min(...pins);
  const max = Math.max(...pins);
  return {
    since: new Date(min - windowMs - LOG_PADDING_MS).toISOString(),
    until: new Date(max + windowMs + LOG_PADDING_MS).toISOString(),
  };
}

function createMcpTraceTools({
  api,
  curatorJwt,
  clientId,
  ToolError,
  nowMs = Date.now(),
  listMcpCallEventsImpl = null,
} = {}) {
  const readEvents = listMcpCallEventsImpl || ((bounds) => api.listMcpCallEvents({
    since: bounds.since,
    until: bounds.until,
    bearer: curatorJwt,
    timeoutMs: TELEMETRY_READ_TIMEOUT_MS,
  }));

  async function readTranscript(date) {
    if (!clientId) {
      throw new ToolError('tasks_not_configured', 'Задачник не подключён: не задан HEYS_TASKS_CLIENT_ID.');
    }
    const path = tasks.transcriptPath(date);
    const key = tasks.keyForPath(path);
    const { data, error } = await api.getKVByCurator(curatorJwt, clientId, key);
    if (error) throw new ToolError('upstream_error', `Не удалось прочитать ${path}: ${error.message}`);
    const file = tasks.ensureFile(data, path);
    return { path, text: file.text || '' };
  }

  const tools = {
    async tasks_mcp_trace(args = {}) {
      const date = String(args.date || tasks.taskDay(nowMs)).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new ToolError('invalid_date', 'date должен быть YYYY-MM-DD.');
      }
      if (correlate.isOlderThanTelemetryRetention(date, nowMs)) {
        throw new ToolError(
          'telemetry_retention_exceeded',
          `Телеметрия хранится ${correlate.TELEMETRY_RETENTION_DAYS} суток — для ${date} данных уже нет.`,
        );
      }

      const windowMs = Number.isFinite(Number(args.window_ms)) && Number(args.window_ms) > 0
        ? Number(args.window_ms)
        : correlate.DEFAULT_WINDOW_MS;
      const headingFilter = args.heading ? padHeading(args.heading) : null;
      if (args.heading && !headingFilter) {
        throw new ToolError('invalid_heading', 'heading должен быть ЧЧ:ММ, например 22:04.');
      }

      const { text } = await readTranscript(date);
      if (!text.trim()) {
        throw new ToolError('transcript_empty', `Стенограмма transcript/${date}.md пуста — нечего связывать.`);
      }

      const { exchanges, blocksWithoutMark } = correlate.parseExchanges(text, { date });
      let selected = correlate.mergeSameTurnExchanges(exchanges);
      if (headingFilter) {
        const matches = selected.filter((row) => row.heading === headingFilter);
        if (!matches.length) {
          throw new ToolError(
            'heading_not_found',
            `В стенограмме за ${date} нет размеченного обмена ${headingFilter}.`,
          );
        }
        // heading — время, не уникальный ключ; при фильтре берём последний блок в файле.
        selected = [matches[matches.length - 1]];
      }
      if (!selected.length) {
        return {
          text: `В стенограмме за ${date} нет меток [mcp session=…].${blocksWithoutMark > 0 ? ` Блоков ## ЧЧ:ММ без метки: ${blocksWithoutMark}.` : ''}`,
          structured: {
            date,
            rows: [],
            unattached_count: 0,
            blocks_without_mark: blocksWithoutMark,
            telemetry_truncated: false,
          },
        };
      }

      const bounds = narrowLogWindow(selected, windowMs);
      let telemetryTruncated = false;
      let calls = [];
      try {
        const result = await readEvents(bounds);
        if (result.error) {
          const msg = String(result.error.message || result.error);
          const code = /timeout/i.test(msg)
            ? 'telemetry_db_timeout'
            : 'telemetry_db_read_failed';
          throw new ToolError(code, `[${code}] Не удалось прочитать телеметрию: ${msg}`);
        }
        telemetryTruncated = Boolean(result.truncated);
        calls = correlate.filterCuratorCalls(result.records);
      } catch (error) {
        if (error && error.code && String(error.message || '').startsWith('[')) throw error;
        const msg = String(error.message || error);
        const code = /timeout/i.test(msg)
          ? 'telemetry_db_timeout'
          : 'telemetry_db_read_failed';
        throw new ToolError(code, `[${code}] Не удалось прочитать телеметрию: ${msg}`);
      }

      const trace = callContext.current();
      calls = excludeSelfCalls(calls, trace || {});

      const { rows, unattached } = correlate.correlate({
        exchanges: selected,
        calls,
        windowMs,
      });
      const sessionIds = correlate.knownSessionIds(selected);
      const enriched = correlate.enrichRowsWithAttribution(rows, sessionIds);

      const lines = enriched.map((row) => formatRowText(row));
      const tail = [];
      if (blocksWithoutMark > 0) tail.push(`Блоков ## ЧЧ:ММ без метки: ${blocksWithoutMark} — не вошли в отчёт.`);
      if (unattached.length > 0) tail.push(`${unattached.length} вызовов вне всех окон.`);
      if (telemetryTruncated) tail.push('Выборка обрезана по лимиту — цепочка может быть неполной.');

      return {
        text: `${lines.join('\n')}${tail.length ? `\n\n${tail.join('\n')}` : ''}`,
        structured: {
          date,
          rows: enriched.map((row) => ({
            heading: row.heading,
            kin: row.kin,
            confirmed_tools: row.confirmed_tools,
            probable_tools: row.probable_tools,
            confirmed_ms: row.confirmed_ms,
            probable_ms: row.probable_ms,
          })),
          unattached_count: unattached.length,
          blocks_without_mark: blocksWithoutMark,
          telemetry_truncated: telemetryTruncated,
          log_truncated: telemetryTruncated,
        },
      };
    },
  };

  return { tools, schemas: [MCP_TRACE_SCHEMA] };
}

module.exports = { createMcpTraceTools, MCP_TRACE_SCHEMA, TRACE_TOOL };
