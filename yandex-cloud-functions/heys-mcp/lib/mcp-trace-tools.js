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
    'Связать блок стенограммы (после tasks_checkpoint) с цепочкой вызовов MCP по таймингам из Postgres. Зови, когда нужно понять «сколько кругов» или «почему долго» по конкретному обмену — не на каждый tasks_read. Первым вызовом иди без heading: одна реплика часто разъезжается на два соседних блока, и вызовы надо считать по их сумме, а фильтр по heading оставляет один блок и часть цепочки уводит в вероятные. Подтверждённые вызовы — session_id совпал с меткой стенограммы; вероятные — только попали в окно ±5 мин, и на холодном старте сессия меняется в середине обмена, поэтому свои вызовы там тоже бывают. В ответе: confirmed_ms (сумма HEYS), wall_span_ms (стена цепочки), gaps_ms (паузы агента между вызовами), дубли get_day/search и длинные паузы.',
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
        description: `Запас вокруг пинов при чтении телеметрии, мс. По умолчанию ${correlate.DEFAULT_WINDOW_MS}. Связку не меняет: вызов относится к первому обмену, чья запись случилась не раньше него.`,
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

function formatDurationBrief(ms) {
  const value = Number(ms) || 0;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, '')} s`;
  return `${value} ms`;
}

function formatFlowWarnings(row) {
  if (!row.flow_warnings || !row.flow_warnings.length) return '';
  const parts = [];
  if (row.duplicates && row.duplicates.length) {
    parts.push(`дубли: ${row.duplicates.map((d) => `${d.tool}×${d.count}`).join(', ')}`);
  }
  if (row.max_gap_ms >= correlate.FLOW_GAP_WARN_MS && row.max_gap_after_tool) {
    parts.push(`max gap ${formatDurationBrief(row.max_gap_ms)} после ${row.max_gap_after_tool}`);
  }
  return parts.length ? `\n  ⚠ ${parts.join('; ')}` : '';
}

function formatFlowSteps(row) {
  if (!row.flow_steps || row.flow_steps.length < 2) return '';
  const parts = row.flow_steps.map((step, index) => {
    const base = `${step.tool} ${step.duration_ms} ms`;
    if (index >= row.flow_steps.length - 1) return base;
    return `${base} + gap ${formatDurationBrief(step.gap_after_ms)}`;
  });
  return `\n  шаги: ${parts.join(' → ')}`;
}

function formatRowText(row) {
  const kin = row.kin ? ` «${row.kin.slice(0, 80)}${row.kin.length > 80 ? '…' : ''}»` : '';
  const confirmed = formatToolChain(row.confirmed_tools);
  const probable = row.probable_tools && row.probable_tools.length
    ? `\n  вероятные (${row.probable_ms} ms): ${formatToolChain(row.probable_tools)}`
    : '';
  const flowParts = [];
  if (row.wall_span_ms > 0) {
    flowParts.push(`wall ${formatDurationBrief(row.wall_span_ms)}`);
    flowParts.push(`gaps ${formatDurationBrief(row.gaps_ms)}`);
  }
  if (row.pre_chain_ms > 0) flowParts.push(`pre ${formatDurationBrief(row.pre_chain_ms)}`);
  if (row.post_chain_ms > 0) flowParts.push(`post ${formatDurationBrief(row.post_chain_ms)}`);
  const flow = flowParts.length ? `; ${flowParts.join(', ')}` : '';
  return `${row.heading || '??:??'}${kin}: подтверждённые ${row.confirmed_calls.length} вызовов, ${row.confirmed_ms} ms${flow} — ${confirmed}${probable}${formatFlowSteps(row)}${formatFlowWarnings(row)}`;
}

function excludeSelfCalls(calls, { sessionId, seq } = {}) {
  return (calls || []).filter((call) => {
    if (call.tool === TRACE_TOOL) return false;
    if (sessionId && call.session_id === sessionId && Number(call.seq) === Number(seq)) return false;
    return true;
  });
}

/**
 * Границы запроса к телеметрии.
 *
 * Нижняя — начало московских суток, а не первый пин минус окно. Связка теперь
 * направленная: вызовы принадлежат следующему чекпоинту, значит первый блок дня
 * отвечает за всё, что случилось до него. При прежней границе эти вызовы просто
 * не доезжали из базы, и починка одной корреляции ничего бы не дала.
 *
 * Верхняя — последний пин плюс запас: там же лежит собственная запись обмена.
 */
function narrowLogWindow(exchanges, windowMs, date) {
  if (!exchanges.length) return null;
  const pins = exchanges.map((e) => e.pinMs).filter((ms) => Number.isFinite(ms));
  if (!pins.length) return null;
  const max = Math.max(...pins);
  const dayStart = Date.parse(`${date}T00:00:00+03:00`);
  const floor = Number.isFinite(dayStart)
    ? Math.min(dayStart, Math.min(...pins) - windowMs - LOG_PADDING_MS)
    : Math.min(...pins) - windowMs - LOG_PADDING_MS;
  return {
    since: new Date(floor).toISOString(),
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

      const bounds = narrowLogWindow(selected, windowMs, date);
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
      });
      const sessionIds = correlate.knownSessionIds(selected);
      // Псевдоним подключения переживает смену инстанса, поэтому цепочка,
      // разорванная холодным стартом, остаётся подтверждённой целиком.
      const connIds = correlate.knownConnIds(selected);
      const enriched = correlate.enrichRowsWithAttribution(rows, sessionIds, { date, connIds });

      const lines = enriched.map((row) => formatRowText(row));
      const tail = [];
      if (blocksWithoutMark > 0) {
        tail.push(
          `Блоков ## ЧЧ:ММ без метки: ${blocksWithoutMark} — в отчёт вошли, но их вызовы только «вероятные».`,
        );
      }
      if (unattached.length > 0) {
        tail.push(`${unattached.length} вызовов позже последнего обмена — их заберёт следующий чекпоинт.`);
      }
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
            wall_span_ms: row.wall_span_ms,
            gaps_ms: row.gaps_ms,
            pre_chain_ms: row.pre_chain_ms,
            post_chain_ms: row.post_chain_ms,
            max_gap_ms: row.max_gap_ms,
            max_gap_after_tool: row.max_gap_after_tool,
            flow_steps: row.flow_steps,
            flow_warnings: row.flow_warnings,
            duplicates: row.duplicates,
            flow_confirmed: row.flow_confirmed,
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
