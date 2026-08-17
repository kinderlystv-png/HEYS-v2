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
const LOG_RETENTION_DAYS = 3;

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

function enrichRowsWithAttribution(rows, sessionIds) {
  return (rows || []).map((row) => {
    const { confirmed, probable } = splitCallsByConfidence(row.calls, sessionIds);
    return {
      ...row,
      confirmed_calls: confirmed,
      probable_calls: probable,
      confirmed_tools: confirmed.map((c) => c.tool).filter(Boolean),
      probable_tools: probable.map((c) => c.tool).filter(Boolean),
      confirmed_ms: sumDurationMs(confirmed),
      probable_ms: sumDurationMs(probable),
    };
  });
}

/** Дата старше retention лог-группы (3 суток по МСК). */
function isOlderThanLogRetention(date, nowMs = Date.now()) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const dayStart = Date.parse(`${date}T00:00:00+03:00`);
  if (!Number.isFinite(dayStart)) return false;
  const retentionMs = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return dayStart < (nowMs - retentionMs);
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
  enrichRowsWithAttribution,
  isOlderThanLogRetention,
  mskToday,
};
