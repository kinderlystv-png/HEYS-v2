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
 * Вызов относится к первому обмену, чья запись случилась не раньше него:
 * работа копится, пока её кто-то не запишет. Два write за минуту поэтому не
 * спорят за одни и те же read — их разводит порядок, а не расстояние.
 */

const MARK_RE = /\[mcp session=([0-9a-f]+) seq=(\d+)(?: conn=([0-9a-f]+))?(?: ts=([^\]]+))?\]/;
/** `## 14:20`, `## ~14:20`, `## 14:20–15:00` — якорь по началу диапазона. */
const HEADING_RE = /^##\s*~?(\d{1,2}):(\d{2})(?:\s*[–—-]\s*~?\d{1,2}:\d{2})?\s*$/m;
const BLOCK_SPLIT_RE = /^##\s*~?\d{1,2}:\d{2}(?:\s*[–—-]\s*~?\d{1,2}:\d{2})?\s*$/m;
/** Ширина запроса к телеметрии вокруг пинов дня. Связку больше не решает. */
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
/** Допуск на собственные вызовы обмена — см. exchangeBounds. */
const WRITE_TAIL_MS = 30 * 1000;
/** Отрезок длиннее — повод усомниться в заголовке, а не молча им пользоваться. */
const SPAN_WARN_MS = 6 * 60 * 60 * 1000;
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
    // Псевдоним подключения. В отличие от session_id переживает смену
    // инстанса, поэтому по нему обмен собирается целиком даже когда часть
    // вызовов уехала на другой инстанс. Старые метки его не несут — тогда
    // остаётся прежняя связка по session_id.
    connId: match[3] || null,
    ts: match[4] || null,
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

/**
 * `## ЧЧ:ММ` стенограммы — московское время; с 2014 MSK = UTC+3 круглый год.
 *
 * Файл дня живёт по taskDay — сутки с 03:00 МСК (DAY_START_HOUR в lib/tasks.js,
 * тот же порог у tasks_checkpoint и у аргумента date этого инструмента).
 * Поэтому заголовок раньше трёх утра относится к следующему календарному
 * числу: `## 01:30` в transcript/2026-09-04.md случился ночью пятого. Пока
 * заголовок был только подписью в отчёте, промах в сутки ничего не портил;
 * с тех пор как он задаёт начало отрезка связки, он стал данными.
 */
const DAY_START_HOUR = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function headingToUtcMs(date, hours, minutes) {
  if (!date || !Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  const ms = Date.parse(`${date}T${pad(hours)}:${pad(minutes)}:00+03:00`);
  if (!Number.isFinite(ms)) return null;
  return hours < DAY_START_HOUR ? ms + DAY_MS : ms;
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
    // Блок без метки прежде выбрасывался целиком, и вызовы вокруг него уходили
    // соседям или в «вне всех окон». Заголовок ## ЧЧ:ММ — тоже якорь, пусть и
    // грубее метки: минута вместо секунды. Поэтому блок остаётся в отчёте, а
    // метка решает не участие, а доверие — его вызовы лягут в «вероятные».
    if (!mark) blocksWithoutMark += 1;
    const headingMs = headingToUtcMs(date, Number(heading[1]), Number(heading[2]));
    const markMs = mark && mark.ts ? Date.parse(mark.ts) : NaN;
    const pinMs = Number.isFinite(markMs) ? markMs : headingMs;
    if (pinMs == null) continue;
    exchanges.push({
      heading: `${pad(Number(heading[1]))}:${pad(Number(heading[2]))}`,
      kin: kinLine(block),
      mark: mark || null,
      // Обмен — это отрезок, а не точка: заголовок ## ЧЧ:ММ говорит, когда он
      // начался, метка — когда его записали. Между ними бывают часы, и внутрь
      // помещаются другие, более короткие обмены.
      headingMs,
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
      if (Number.isFinite(exchange.headingMs)
        && (!Number.isFinite(prev.headingMs) || exchange.headingMs < prev.headingMs)) {
        prev.headingMs = exchange.headingMs;
      }
      prev.marks.push(exchange.mark);
      prev.mark = exchange.mark;
      prev.merged_blocks += 1;
      continue;
    }
    merged.push({
      ...exchange,
      headingMs: exchange.headingMs,
      pins: [exchange.pinMs],
      marks: [exchange.mark],
      merged_blocks: 1,
    });
  }
  return merged;
}

function lastPinMs(exchange) {
  const pins = exchange.pins || [exchange.pinMs];
  return Math.max(...pins);
}

/**
 * Отрезки обменов.
 *
 * Начало — заголовок `## ЧЧ:ММ` (когда человек заговорил), конец — пин метки
 * (когда обмен записали) плюс короткий допуск: пин это момент begin() записи, а
 * строка mcp_call пишется в конце вызова, поэтому собственные вызовы обмена
 * ложатся в лог на свою длительность позже. Допуск режется началом следующего
 * обмена — иначе два чекпоинта за минуту снова начали бы спорить за одни и те
 * же вызовы.
 */
function exchangeBounds(exchanges) {
  const spans = (exchanges || []).map((exchange, index) => {
    const endMs = lastPinMs(exchange);
    const headingMs = Number.isFinite(exchange.headingMs) ? exchange.headingMs : endMs;
    // Заголовок ставит модель на глаз, и он больше не только подпись: теперь он
    // граница связки. Ошибка в нём тихо уводит чужие вызовы в отрезок, поэтому
    // два её вида называются вслух — перевёрнутый отрезок и слишком длинный.
    // Перевёрнутый схлопывается в точку записи: заведомо неверной границе
    // доверия меньше, чем её отсутствию.
    const inverted = headingMs > endMs;
    const startMs = Math.min(headingMs, endMs);
    return {
      exchange,
      index,
      startMs,
      endMs,
      unreliable: inverted || endMs - startMs > SPAN_WARN_MS,
    };
  });
  const byEnd = [...spans].sort((a, b) => a.endMs - b.endMs || a.index - b.index);
  for (let i = 0; i < byEnd.length; i += 1) {
    const tail = byEnd[i].endMs + WRITE_TAIL_MS;
    const next = byEnd[i + 1];
    byEnd[i].endMs = next ? Math.min(tail, next.endMs - 1) : tail;
  }
  return spans;
}

/**
 * Обмен, которому принадлежит вызов.
 *
 * 1. Отрезок, внутрь которого вызов попал. Если таких несколько — самый узкий,
 *    то есть начавшийся позже: короткий обмен, случившийся посреди длинного,
 *    забирает своё. Без этого разговор с 11:48 до 14:55, записанный одним
 *    чекпоинтом в 14:55, отдал бы всю свою первую половину соседнему блоку
 *    12:35, который записали раньше, — отчёт снова выглядел бы правдиво и снова
 *    был бы неверен.
 * 2. Иначе — первый обмен, начавшийся не раньше вызова: работа копится, пока её
 *    кто-то не запишет, и принадлежит следующей записи, а не предыдущей.
 * 3. Иначе — вызов позже всех обменов; его заберёт следующий чекпоинт.
 */
function ownerSpan(spans, byStart, ms) {
  let inner = null;
  for (const span of spans) {
    if (ms < span.startMs || ms > span.endMs) continue;
    if (!inner || span.startMs > inner.startMs) inner = span;
  }
  if (inner) return inner;
  for (const span of byStart) {
    if (span.startMs >= ms) return span;
  }
  return null;
}

/**
 * Обмены, узнаваемые по псевдониму вызова.
 *
 * Связка временная, и этого мало: пока идёт разговор здесь, тот же человек
 * может писать с телефона, и чужие вызовы лягут в чей-то отрезок молча. Если
 * вызов назвал сессию или подключение, стоящее в метке конкретного обмена, —
 * это прямое свидетельство, и оно сильнее времени.
 *
 * Псевдоним, встреченный у двух обменов, свидетельством не считается:
 * `conn_id` живёт сутки и переживает несколько обменов подряд.
 */
function ownersByAlias(spans) {
  const owners = new Map();
  for (const span of spans) {
    const marks = span.exchange.marks || (span.exchange.mark ? [span.exchange.mark] : []);
    for (const mark of marks) {
      for (const alias of [mark && mark.sessionId, mark && mark.connId]) {
        if (!alias) continue;
        if (!owners.has(alias)) owners.set(alias, span);
        else if (owners.get(alias) !== span) owners.set(alias, null);
      }
    }
  }
  return owners;
}

function correlate({ exchanges, calls }) {
  const timed = (calls || [])
    .map((call) => ({ call, ms: callTimeMs(call) }))
    .filter((row) => row.ms != null)
    .sort((a, b) => a.ms - b.ms);
  // Порядок в файле — порядок записи, но блок бывает вписан задним числом,
  // поэтому отрезки считаются по времени, а не по месту в файле.
  const spans = exchangeBounds(exchanges);
  const byStart = [...spans].sort((a, b) => a.startMs - b.startMs || a.index - b.index);
  const owners = ownersByAlias(spans);
  const buckets = new Map(spans.map((span) => [span.exchange, []]));
  const unattached = [];
  for (const row of timed) {
    const named = owners.get(row.call.session_id) || owners.get(row.call.conn_id) || null;
    const owner = named || ownerSpan(spans, byStart, row.ms);
    if (!owner) unattached.push(row.call);
    else buckets.get(owner.exchange).push(row.call);
  }
  const rows = (exchanges || []).map((exchange) => {
    const attached = buckets.get(exchange) || [];
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
      span_unreliable: Boolean((spans.find((s) => s.exchange === exchange) || {}).unreliable),
    };
  });
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

/**
 * Псевдонимы подключения из меток дня.
 *
 * `session_id` считается вместе с идентификатором инстанса, поэтому холодный
 * старт в середине обмена уводит остаток цепочки в «вероятные»: замер 18–20.08
 * дал 55–65% подтверждённых. `conn_id` от инстанса не зависит и живёт сутки —
 * по нему тот же обмен собирается целиком.
 */
function knownConnIds(exchanges) {
  const ids = new Set();
  for (const exchange of exchanges || []) {
    const marks = exchange.marks || (exchange.mark ? [exchange.mark] : []);
    for (const mark of marks) {
      if (mark && mark.connId) ids.add(mark.connId);
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
 * Подтверждённые — вызов назвал тот же псевдоним, что стоит в метке
 * стенограммы: подключение (`conn_id`, переживает смену инстанса) или сессию
 * (`session_id`, прежняя связка, работает для меток до 21.08). Вероятные —
 * только попали в окно.
 */
function splitCallsByConfidence(calls, sessionIds, connIds = null) {
  const confirmed = [];
  const probable = [];
  for (const call of calls || []) {
    const bySession = call.session_id && sessionIds && sessionIds.has(call.session_id);
    const byConn = call.conn_id && connIds && connIds.has(call.conn_id);
    if (bySession || byConn) confirmed.push(call);
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
      ...(Array.isArray(cur.arg_keys) && cur.arg_keys.length ? { arg_keys: cur.arg_keys } : {}),
    });
  }

  // Дубль — тот же инструмент С ТЕМИ ЖЕ аргументами. Счёт по одному имени
  // шумел: семь поисков семи разных продуктов помечались «дублями», а
  // настоящий повтор одного запроса ничем не выделялся. Записи без args_hash
  // (старые логи) считаются по-старому — только именем.
  const counts = {};
  for (const call of sorted) {
    if (!call.tool) continue;
    if (!FLOW_DUPLICATE_TOOLS.includes(call.tool)) continue;
    const key = `${call.tool}|${call.args_hash || ''}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  const duplicates = FLOW_DUPLICATE_TOOLS
    .map((tool) => {
      const repeated = Object.entries(counts)
        .filter(([key, n]) => key.startsWith(`${tool}|`) && n > 1)
        .reduce((sum, [, n]) => sum + n, 0);
      return { tool, count: repeated };
    })
    .filter((d) => d.count > 1);

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

function enrichRowsWithAttribution(rows, sessionIds, { date, connIds = null } = {}) {
  return (rows || []).map((row) => {
    const { confirmed, probable } = splitCallsByConfidence(row.calls, sessionIds, connIds);
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
  WRITE_TAIL_MS,
  DAY_START_HOUR,
  SPAN_WARN_MS,
  HEADING_RE,
  LOG_RETENTION_DAYS,
  TELEMETRY_RETENTION_DAYS,
  parseMark,
  headingToUtcMs,
  parseExchanges,
  mergeSameTurnExchanges,
  exchangeBounds,
  correlate,
  parseLogText,
  knownSessionIds,
  knownConnIds,
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
