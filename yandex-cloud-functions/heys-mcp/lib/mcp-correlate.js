'use strict';

/**
 * Связка «блок стенограммы ↔ вызовы mcp_call».
 *
 * На редком трафике каждый tools/call садится на новый инстанс: `session_id`
 * каждый раз другой, `seq` всегда 1. Диапазон seq внутри сессии поэтому
 * Якорь — окно по времени вокруг `ts` в метке (или вокруг заголовка `## ЧЧ:ММ`
 * в зоне Москвы, если метка старая и без ts). `ts` в метке — момент `begin()`
 * (старт вызова), `ts` в строке `mcp_call` — момент записи лога (конец).
 * На окне ±5 мин разница незаметна; при сужении окна до секунд учитывать
 * `duration_ms` write.
 *
 * Вызов относится к ближайшему обмену, чей пин попадает в окно — иначе два
 * write за минуту забрали бы одни и те же read.
 */

const MARK_RE = /\[mcp session=([0-9a-f]+) seq=(\d+)(?: ts=([^\]]+))?\]/;
/** `## 14:20`, `## ~14:20`, `## 14:20–15:00` — якорь по началу диапазона. */
const HEADING_RE = /^##\s*~?(\d{1,2}):(\d{2})(?:\s*[–—-]\s*~?\d{1,2}:\d{2})?\s*$/m;
const BLOCK_SPLIT_RE = /^##\s*~?\d{1,2}:\d{2}(?:\s*[–—-]\s*~?\d{1,2}:\d{2})?\s*$/m;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const TELEMETRY_RETENTION_DAYS = 180;
/** @deprecated используйте TELEMETRY_RETENTION_DAYS */
const LOG_RETENTION_DAYS = TELEMETRY_RETENTION_DAYS;
/** Пауза между HEYS-вызовами длиннее — предупреждение в trace. */
const FLOW_GAP_WARN_MS = 10 * 1000;
/** Повтор того же read-tool в одном обмене — кандидат на оптимизацию промпта. */
const FLOW_DUPLICATE_TOOLS = ['heys_get_day', 'heys_search_products', 'heys_list_clients'];

function parseMark(line) {
  const match = MARK_RE.exec(String(line || ''));
  if (!match) return null;
  return {
    sessionId: match[1],
    seq: Number(match[2]),
    ts: match[3] || null,
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

/** `## ЧЧ:ММ` стенограммы — московское время; с 2014 MSK = UTC+3 круглый год. */
function headingToUtcMs(date, hours, minutes) {
  if (!date || !Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  const ms = Date.parse(`${date}T${pad(hours)}:${pad(minutes)}:00+03:00`);
  return Number.isFinite(ms) ? ms : null;
}

function callTimeMs(call) {
  const raw = call && (call.ts || call.timestamp);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function splitBlocks(text) {
  const src = String(text || '').replace(/\r\n/g, '\n');
  const parts = src.split(/^(?=##\s*~?\d{1,2}:\d{2}(?:\s*[–—-]\s*~?\d{1,2}:\d{2})?\s*$)/m);
  return parts.map((block) => block.trim()).filter(Boolean);
}

function kinLine(block) {
  const match = /^\*\*Кин:\*\*\s*(.*)$/m.exec(block);
  return match ? String(match[1] || '').trim() : '';
}

function parseExchanges(text, { date = null } = {}) {
  const exchanges = [];
  let blocksWithoutMark = 0;
  for (const block of splitBlocks(text)) {
    const heading = HEADING_RE.exec(block);
    if (!heading) continue;
    const mark = parseMark(block);
    if (!mark) {
      blocksWithoutMark += 1;
      continue;
    }
    const headingMs = headingToUtcMs(date, Number(heading[1]), Number(heading[2]));
    const markMs = mark.ts ? Date.parse(mark.ts) : NaN;
    const pinMs = Number.isFinite(markMs) ? markMs : headingMs;
    if (pinMs == null) continue;
    exchanges.push({
      heading: `${pad(Number(heading[1]))}:${pad(Number(heading[2]))}`,
      kin: kinLine(block),
      mark,
      pinMs,
    });
  }
  return { exchanges, blocksWithoutMark };
}

/**
 * Один ход куратора может дать несколько блоков стенограммы (чек-ин + вода с
 * одной репликой). Схлопываем подряд идущие блоки с одинаковыми heading+kin.
 */
function mergeSameTurnExchanges(exchanges) {
  const merged = [];
  for (const exchange of exchanges || []) {
    const prev = merged[merged.length - 1];
    if (prev && prev.heading === exchange.heading && prev.kin && prev.kin === exchange.kin) {
      prev.pins.push(exchange.pinMs);
      prev.marks.push(exchange.mark);
      prev.mark = exchange.mark;
      prev.merged_blocks += 1;
      continue;
    }
    merged.push({
      ...exchange,
      pins: [exchange.pinMs],
      marks: [exchange.mark],
      merged_blocks: 1,
    });
  }
  return merged;
}

function nearestPinDelta(exchange, callMs) {
  const pins = exchange.pins || [exchange.pinMs];
  return Math.min(...pins.map((pin) => Math.abs(callMs - pin)));
}

function correlate({ exchanges, calls, windowMs = DEFAULT_WINDOW_MS }) {
  const window = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS;
  const timed = (calls || [])
    .map((call) => ({ call, ms: callTimeMs(call) }))
    .filter((row) => row.ms != null);
  const used = new Set();
  const rows = (exchanges || []).map((exchange) => {
    const attached = [];
    for (const row of timed) {
      if (used.has(row)) continue;
      const delta = nearestPinDelta(exchange, row.ms);
      if (delta > window) continue;
      let nearest = exchange;
      let nearestDelta = delta;
      for (const other of exchanges) {
        if (other === exchange) continue;
        const otherDelta = nearestPinDelta(other, row.ms);
        if (otherDelta < nearestDelta) {
          nearest = other;
          nearestDelta = otherDelta;
        }
      }
      if (nearest !== exchange) continue;
      used.add(row);
      attached.push(row.call);
    }
    attached.sort((a, b) => (callTimeMs(a) || 0) - (callTimeMs(b) || 0));
    const totalMs = attached.reduce((sum, call) => sum + (Number(call.duration_ms) || 0), 0);
    return {
      heading: exchange.heading,
      kin: exchange.kin,
      mark: exchange.mark,
      pinMs: exchange.pinMs,
      calls: attached,
      tools: attached.map((call) => call.tool).filter(Boolean),
      total_ms: totalMs,
    };
  });
  const unattached = timed.filter((row) => !used.has(row)).map((row) => row.call);
  return { rows, unattached };
}

function knownSessionIds(exchanges) {
  const ids = new Set();
  for (const exchange of exchanges || []) {
    const marks = exchange.marks || (exchange.mark ? [exchange.mark] : []);
    for (const mark of marks) {
      if (mark && mark.sessionId) ids.add(mark.sessionId);
    }
  }
  return ids;
}

function isCuratorCall(call) {
  return call && call.role === 'curator';
}

function filterCuratorCalls(calls) {
  return (calls || []).filter(isCuratorCall);
}

/**
 * Подтверждённые — session_id совпал с меткой стенограммы; вероятные — только окно.
 */
function splitCallsByConfidence(calls, sessionIds) {
  const confirmed = [];
  const probable = [];
  for (const call of calls || []) {
    if (call.session_id && sessionIds.has(call.session_id)) confirmed.push(call);
    else probable.push(call);
  }
  return { confirmed, probable };
}

function sumDurationMs(calls) {
  return (calls || []).reduce((sum, call) => sum + (Number(call.duration_ms) || 0), 0);
}

function sortCallsByTime(calls) {
  return [...(calls || [])]
    .map((call) => ({ call, ms: callTimeMs(call) }))
    .filter((row) => row.ms != null)
    .sort((a, b) => a.ms - b.ms || (Number(a.call.seq) || 0) - (Number(b.call.seq) || 0))
    .map((row) => row.call);
}

function callEndMs(call) {
  const start = callTimeMs(call);
  if (start == null) return null;
  return start + (Number(call.duration_ms) || 0);
}

/**
 * Разложение обмена: wall (стена между первым и последним вызовом), gaps (паузы
 * агента между вызовами), дубли read-tools. Cursor «musing» сюда не входит —
 * только то, что видно по ts/duration_ms в mcp_call_events.
 */
function analyzeFlow(calls) {
  const sorted = sortCallsByTime(calls);
  if (!sorted.length) {
    return {
      wall_span_ms: 0,
      gaps_ms: 0,
      steps: [],
      max_gap_ms: 0,
      max_gap_after_tool: null,
      duplicates: [],
      warnings: [],
    };
  }

  const startMs = callTimeMs(sorted[0]);
  const endMs = Math.max(...sorted.map(callEndMs).filter((ms) => ms != null));
  const wall_span_ms = Math.max(0, endMs - startMs);

  const steps = [];
  let gaps_ms = 0;
  let max_gap_ms = 0;
  let max_gap_after_tool = null;

  for (let i = 0; i < sorted.length; i += 1) {
    const cur = sorted[i];
    const duration_ms = Number(cur.duration_ms) || 0;
    let gap_after_ms = 0;
    if (i < sorted.length - 1) {
      const endCur = callEndMs(cur);
      const startNext = callTimeMs(sorted[i + 1]);
      gap_after_ms = Math.max(0, startNext - endCur);
      gaps_ms += gap_after_ms;
      if (gap_after_ms > max_gap_ms) {
        max_gap_ms = gap_after_ms;
        max_gap_after_tool = cur.tool || null;
      }
    }
    steps.push({
      tool: cur.tool || null,
      duration_ms,
      gap_after_ms,
    });
  }

  const counts = {};
  for (const call of sorted) {
    if (!call.tool) continue;
    counts[call.tool] = (counts[call.tool] || 0) + 1;
  }
  const duplicates = FLOW_DUPLICATE_TOOLS
    .filter((tool) => (counts[tool] || 0) > 1)
    .map((tool) => ({ tool, count: counts[tool] }));

  const warnings = [];
  for (const dup of duplicates) {
    warnings.push(`duplicate:${dup.tool}`);
  }
  if (max_gap_ms >= FLOW_GAP_WARN_MS && max_gap_after_tool) {
    warnings.push(`long_gap_after:${max_gap_after_tool}`);
  }

  return {
    wall_span_ms,
    gaps_ms,
    steps,
    max_gap_ms,
    max_gap_after_tool,
    duplicates,
    warnings,
  };
}

function parseHeadingMs(date, heading) {
  if (!date || !heading) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(heading).trim());
  if (!match) return null;
  return headingToUtcMs(date, Number(match[1]), Number(match[2]));
}

/**
 * Якоря обмена: pre — от ## ЧЧ:ММ (начало минуты блока) до первого вызова;
 * post — от конца последнего вызова до ts метки write (begin checkpoint).
 * Если вызовы начались раньше заголовка минуты, pre=0.
 */
function analyzeFlowAnchors(calls, { date, heading, pinMs } = {}) {
  const flow = analyzeFlow(calls);
  const sorted = sortCallsByTime(calls);
  if (!sorted.length) {
    return { ...flow, pre_chain_ms: 0, post_chain_ms: 0 };
  }
  const firstStart = callTimeMs(sorted[0]);
  const lastEnd = callEndMs(sorted[sorted.length - 1]);
  const headingMs = parseHeadingMs(date, heading);
  const pre_chain_ms = headingMs != null && firstStart != null
    ? Math.max(0, firstStart - headingMs)
    : 0;
  const post_chain_ms = pinMs != null && lastEnd != null
    ? Math.max(0, pinMs - lastEnd)
    : 0;
  return { ...flow, pre_chain_ms, post_chain_ms };
}

function enrichRowsWithAttribution(rows, sessionIds, { date } = {}) {
  return (rows || []).map((row) => {
    const { confirmed, probable } = splitCallsByConfidence(row.calls, sessionIds);
    const flow_all = analyzeFlowAnchors(row.calls, {
      date,
      heading: row.heading,
      pinMs: row.pinMs,
    });
    const flow_confirmed = analyzeFlow(confirmed);
    return {
      ...row,
      confirmed_calls: confirmed,
      probable_calls: probable,
      confirmed_tools: confirmed.map((c) => c.tool).filter(Boolean),
      probable_tools: probable.map((c) => c.tool).filter(Boolean),
      confirmed_ms: sumDurationMs(confirmed),
      probable_ms: sumDurationMs(probable),
      flow_all,
      flow_confirmed,
      wall_span_ms: flow_all.wall_span_ms,
      gaps_ms: flow_all.gaps_ms,
      pre_chain_ms: flow_all.pre_chain_ms,
      post_chain_ms: flow_all.post_chain_ms,
      max_gap_ms: flow_all.max_gap_ms,
      max_gap_after_tool: flow_all.max_gap_after_tool,
      flow_steps: flow_all.steps,
      flow_warnings: flow_all.warnings,
      duplicates: flow_all.duplicates,
    };
  });
}

/** Дата старше retention сырья телеметрии (180 суток по МСК). */
function isOlderThanTelemetryRetention(date, nowMs = Date.now()) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const dayStart = Date.parse(`${date}T00:00:00+03:00`);
  if (!Number.isFinite(dayStart)) return false;
  const retentionMs = TELEMETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return dayStart < (nowMs - retentionMs);
}

/** @deprecated используйте isOlderThanTelemetryRetention */
function isOlderThanLogRetention(date, nowMs = Date.now()) {
  return isOlderThanTelemetryRetention(date, nowMs);
}

function mskToday(nowMs = Date.now()) {
  return new Date(nowMs + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseLogText(raw) {
  const text = String(raw || '');
  const records = [];
  const jsonArray = text.trim().startsWith('[') || text.trim().startsWith('{');
  if (jsonArray) {
    try {
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      for (const row of rows) {
        if (row && row.t === 'mcp_call') {
          records.push(row);
          continue;
        }
        const message = row && (row.message || (row.json_payload && row.json_payload.message));
        if (typeof message === 'string' && message.includes('"t":"mcp_call"')) {
          const start = message.indexOf('{');
          if (start >= 0) {
            try { records.push(JSON.parse(message.slice(start))); } catch (_) { /* битая строка */ }
          }
        }
      }
      if (records.length) return records;
    } catch (_) { /* не JSON — разбираем построчно */ }
  }
  for (const line of text.split(/\n/)) {
    const start = line.indexOf('{"t":"mcp_call"');
    if (start < 0) continue;
    try { records.push(JSON.parse(line.slice(start))); } catch (_) { /* битая строка */ }
  }
  return records;
}

module.exports = {
  BLOCK_SPLIT_RE,
  DEFAULT_WINDOW_MS,
  HEADING_RE,
  LOG_RETENTION_DAYS,
  TELEMETRY_RETENTION_DAYS,
  parseMark,
  headingToUtcMs,
  parseExchanges,
  mergeSameTurnExchanges,
  nearestPinDelta,
  correlate,
  parseLogText,
  knownSessionIds,
  isCuratorCall,
  filterCuratorCalls,
  splitCallsByConfidence,
  sumDurationMs,
  sortCallsByTime,
  callEndMs,
  analyzeFlow,
  analyzeFlowAnchors,
  parseHeadingMs,
  FLOW_GAP_WARN_MS,
  FLOW_DUPLICATE_TOOLS,
  enrichRowsWithAttribution,
  isOlderThanLogRetention,
  isOlderThanTelemetryRetention,
  mskToday,
};
