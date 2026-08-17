'use strict';

/**
 * Связка «блок стенограммы ↔ вызовы mcp_call».
 *
 * На редком трафике каждый tools/call садится на новый инстанс: `session_id`
 * каждый раз другой, `seq` всегда 1. Диапазон seq внутри сессии поэтому
 * собирает пустоту. Якорь — окно по времени вокруг `ts` в метке (или вокруг
 * заголовка `## ЧЧ:ММ` в зоне Москвы, если метка старая и без ts).
 *
 * Вызов относится к ближайшему обмену, чей пин попадает в окно — иначе два
 * write за минуту забрали бы одни и те же read.
 */

const MARK_RE = /\[mcp session=([0-9a-f]+) seq=(\d+)(?: ts=([^\]]+))?\]/;
const HEADING_RE = /^##\s+(\d{1,2}):(\d{2})\b/m;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

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
  const parts = src.split(/^(?=##\s+\d{1,2}:\d{2}\b)/m);
  return parts.map((block) => block.trim()).filter(Boolean);
}

function kinLine(block) {
  const match = /^\*\*Кин:\*\*\s*(.*)$/m.exec(block);
  return match ? String(match[1] || '').trim() : '';
}

function parseExchanges(text, { date = null } = {}) {
  const exchanges = [];
  for (const block of splitBlocks(text)) {
    const mark = parseMark(block);
    if (!mark) continue;
    const heading = HEADING_RE.exec(block);
    const headingMs = heading
      ? headingToUtcMs(date, Number(heading[1]), Number(heading[2]))
      : null;
    const markMs = mark.ts ? Date.parse(mark.ts) : NaN;
    const pinMs = Number.isFinite(markMs) ? markMs : headingMs;
    if (pinMs == null) continue;
    exchanges.push({
      heading: heading ? `${pad(Number(heading[1]))}:${pad(Number(heading[2]))}` : null,
      kin: kinLine(block),
      mark,
      pinMs,
    });
  }
  return exchanges;
}

function correlate({ exchanges, calls, windowMs = DEFAULT_WINDOW_MS }) {
  const window = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS;
  const timed = (calls || [])
    .map((call) => ({ call, ms: callTimeMs(call) }))
    .filter((row) => row.ms != null);
  const used = new Set();
  return (exchanges || []).map((exchange) => {
    const attached = [];
    for (const row of timed) {
      if (used.has(row)) continue;
      const delta = Math.abs(row.ms - exchange.pinMs);
      if (delta > window) continue;
      let nearest = exchange;
      let nearestDelta = delta;
      for (const other of exchanges) {
        if (other === exchange) continue;
        const otherDelta = Math.abs(row.ms - other.pinMs);
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
  DEFAULT_WINDOW_MS,
  parseMark,
  headingToUtcMs,
  parseExchanges,
  correlate,
  parseLogText,
};
