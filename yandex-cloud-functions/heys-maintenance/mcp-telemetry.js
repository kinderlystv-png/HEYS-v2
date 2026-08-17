'use strict';

/**
 * Суточная агрегация телеметрии MCP (heys/8e2188).
 *
 * Сырьё — строки `{"t":"mcp_call",...}`, которые heys-mcp печатает в stdout, а
 * рантайм уносит в Cloud Logging. Здесь они читаются за прошедшие сутки и
 * сворачиваются в `mcp_call_daily` и `mcp_seq_daily`.
 *
 * Разделение в файле намеренное: разбор и агрегация — чистые функции без
 * сети и без БД, поэтому проверяются тестом на фикстурах; наружу торчат ровно
 * две функции, которые ходят в Logging и в Postgres.
 */

const http = require('node:http');
const https = require('node:https');

const LOGGING_READER_HOST = 'reader.logging.yandexcloud.net';

/**
 * Фильтр обязан ловить строку в обоих видах.
 *
 * Обычно рантайм разбирает наш JSON в `json_payload`, и хватило бы первого
 * условия. Но если строка приедет нераспарсенной — она лежит целиком в
 * `message`, и фильтр по `json_payload` её молча отсечёт. Разбор из `message`
 * в `extractRecord` тогда бесполезен: до него доходит только прошедшее фильтр.
 * Итог был бы худшего сорта — отчёт показал бы ноль вызовов, что читается как
 * «коннектором не пользовались», а не как сломанный сбор.
 */
const CALL_FILTER = 'json_payload.t = "mcp_call" OR message: "mcp_call"';
const METADATA_HOST = '169.254.169.254';
const PAGE_SIZE = 1000;
// Потолок страниц — защита от бесконечного пролистывания, если Logging начнёт
// отдавать непустой курсор на пустой выдаче. 100 × 1000 строк на сутки хватает
// с большим запасом; упёрлись — значит что-то не так, и об этом надо узнать.
const MAX_PAGES = 100;

/** IAM-токен сервисного аккаунта функции — тем же способом, что в heys-cron-security-alerts. */
function getIamToken() {
  return new Promise((resolve, reject) => {
    const req = http.get({
      host: METADATA_HOST,
      port: 80,
      path: '/computeMetadata/v1/instance/service-accounts/default/token',
      headers: { 'Metadata-Flavor': 'Google' },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(chunks);
          if (!parsed || !parsed.access_token) reject(new Error('No access_token from metadata'));
          else resolve(parsed.access_token);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('Metadata timeout')));
  });
}

function postJson(host, path, body, token) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      host,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${token}`,
      },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Logging read failed: HTTP ${res.statusCode} ${chunks.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(chunks)); }
        catch (e) { reject(new Error(`Invalid JSON from Logging: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('Logging read timeout')));
    req.write(payload);
    req.end();
  });
}

/** Границы суток по МСК — задачник и дневник живут в этой зоне, отчёт тоже. */
function dayBounds(day) {
  return {
    since: new Date(`${day}T00:00:00+03:00`).toISOString(),
    until: new Date(`${day}T23:59:59.999+03:00`).toISOString(),
  };
}

/** Вчерашняя дата по МСК: джоб гоняется ночью и сворачивает завершившиеся сутки. */
function previousDay(nowMs = Date.now()) {
  const msk = new Date(nowMs - 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000);
  return msk.toISOString().slice(0, 10);
}

/**
 * Достаёт полезную нагрузку из строки Logging. Рантайм кладёт разобранный JSON
 * в `jsonPayload`, но при перегрузке или обрезке строка может приехать текстом
 * в `message` — тогда разбираем сами, иначе потеряем часть суток молча.
 */
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
  }
  return null;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  // Ближайший ранг: на десятках вызовов в сутки интерполяция даёт ложную
  // точность, а порядковый элемент всегда соответствует реальному вызову.
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

function avg(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Сворачивает записи суток в две таблицы.
 *
 * Пары считаются внутри одного `session_id` по возрастанию `seq`: соседние по
 * счётчику вызовы и есть «инструмент → следующий инструмент». Пропуск в
 * нумерации не сшивается — если между вызовами потерялась строка, пара не
 * выдумывается.
 */
function aggregateRecords(records, { day } = {}) {
  const byTool = new Map();
  const bySession = new Map();

  for (const rec of records) {
    if (!rec || rec.t !== 'mcp_call' || typeof rec.tool !== 'string' || !rec.tool) continue;

    let bucket = byTool.get(rec.tool);
    if (!bucket) {
      bucket = { durations: [], respBytes: [], upstreamCalls: [], calls: 0, err: 0, rejected: 0, cold: 0 };
      byTool.set(rec.tool, bucket);
    }
    bucket.calls += 1;
    if (rec.status === 'error') bucket.err += 1;
    if (rec.status === 'rejected') bucket.rejected += 1;
    if (rec.cold_start === true) bucket.cold += 1;
    if (Number.isFinite(rec.duration_ms)) bucket.durations.push(rec.duration_ms);
    if (Number.isFinite(rec.resp_bytes)) bucket.respBytes.push(rec.resp_bytes);
    if (Number.isFinite(rec.upstream_calls)) bucket.upstreamCalls.push(rec.upstream_calls);

    if (rec.session_id && Number.isFinite(rec.seq)) {
      let seqList = bySession.get(rec.session_id);
      if (!seqList) { seqList = []; bySession.set(rec.session_id, seqList); }
      seqList.push({ seq: rec.seq, tool: rec.tool });
    }
  }

  const daily = [...byTool.entries()].map(([tool, b]) => {
    const sorted = [...b.durations].sort((a, x) => a - x);
    const avgUpstream = avg(b.upstreamCalls);
    return {
      day,
      tool,
      calls: b.calls,
      err_count: b.err,
      rejected_count: b.rejected,
      p50_ms: percentile(sorted, 50),
      p95_ms: percentile(sorted, 95),
      max_ms: sorted.length ? sorted[sorted.length - 1] : null,
      total_ms: sorted.reduce((sum, v) => sum + v, 0),
      avg_resp_bytes: b.respBytes.length ? Math.round(avg(b.respBytes)) : null,
      avg_upstream_calls: avgUpstream === null ? null : Number(avgUpstream.toFixed(2)),
      cold_starts: b.cold,
    };
  }).sort((a, b) => b.total_ms - a.total_ms);

  const pairs = new Map();
  for (const seqList of bySession.values()) {
    seqList.sort((a, b) => a.seq - b.seq);
    for (let i = 1; i < seqList.length; i += 1) {
      const prev = seqList[i - 1];
      const next = seqList[i];
      if (next.seq !== prev.seq + 1) continue;
      const key = `${prev.tool} ${next.tool}`;
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
  }

  const seq = [...pairs.entries()].map(([key, count]) => {
    const [tool_prev, tool_next] = key.split(' ');
    return { day, tool_prev, tool_next, count };
  }).sort((a, b) => b.count - a.count);

  return { daily, seq };
}

/** Читает сутки из Cloud Logging постранично. */
async function readDay({ day, logGroupId, token, fetchPage = null }) {
  const { since, until } = dayBounds(day);
  const request = fetchPage || ((body) => postJson(LOGGING_READER_HOST, '/v1/read', body, token));
  const records = [];
  let pageToken;
  let pages = 0;

  do {
    const body = {
      logGroupId,
      criteria: {
        logGroupId,
        since,
        until,
        pageSize: PAGE_SIZE,
        filter: CALL_FILTER,
      },
    };
    if (pageToken) body.pageToken = pageToken;

    const page = await request(body);
    for (const entry of (page && page.entries) || []) {
      const rec = extractRecord(entry);
      if (rec) records.push(rec);
    }
    pageToken = page && page.nextPageToken;
    pages += 1;
  } while (pageToken && pages < MAX_PAGES);

  return { records, pages, truncated: Boolean(pageToken) };
}

/**
 * Запись агрегата. Идемпотентна: повторный прогон за ту же дату переписывает
 * строки целиком, а не прибавляет к ним. Поэтому джоб можно гонять руками
 * сколько угодно раз, в том числе поверх уже посчитанных суток.
 */
async function upsertAggregates(client, { day, daily, seq }) {
  for (const row of daily) {
    await client.query(
      `INSERT INTO mcp_call_daily
         (day, tool, calls, err_count, rejected_count, p50_ms, p95_ms, max_ms,
          total_ms, avg_resp_bytes, avg_upstream_calls, cold_starts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (day, tool) DO UPDATE SET
         calls = EXCLUDED.calls,
         err_count = EXCLUDED.err_count,
         rejected_count = EXCLUDED.rejected_count,
         p50_ms = EXCLUDED.p50_ms,
         p95_ms = EXCLUDED.p95_ms,
         max_ms = EXCLUDED.max_ms,
         total_ms = EXCLUDED.total_ms,
         avg_resp_bytes = EXCLUDED.avg_resp_bytes,
         avg_upstream_calls = EXCLUDED.avg_upstream_calls,
         cold_starts = EXCLUDED.cold_starts`,
      [day, row.tool, row.calls, row.err_count, row.rejected_count, row.p50_ms, row.p95_ms,
        row.max_ms, row.total_ms, row.avg_resp_bytes, row.avg_upstream_calls, row.cold_starts],
    );
  }

  // Пары за пересчитываемые сутки снимаются целиком: если вчера пара была, а
  // при пересчёте исчезла, UPSERT сам по себе оставил бы её навсегда.
  await client.query('DELETE FROM mcp_seq_daily WHERE day = $1', [day]);
  for (const row of seq) {
    await client.query(
      `INSERT INTO mcp_seq_daily (day, tool_prev, tool_next, count)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (day, tool_prev, tool_next) DO UPDATE SET count = EXCLUDED.count`,
      [day, row.tool_prev, row.tool_next, row.count],
    );
  }

  return { tools: daily.length, pairs: seq.length };
}

/** Полный проход: Logging → агрегат → Postgres. */
async function runMcpTelemetryAggregation(client, { day, logGroupId, nowMs = Date.now(), deps = {} } = {}) {
  const targetDay = day || previousDay(nowMs);
  const group = logGroupId || process.env.MCP_LOG_GROUP_ID || null;
  if (!group) {
    return { skipped: true, reason: 'no_log_group', day: targetDay };
  }

  const token = deps.fetchPage ? null : await (deps.getIamToken || getIamToken)();
  const { records, truncated } = await readDay({
    day: targetDay, logGroupId: group, token, fetchPage: deps.fetchPage,
  });
  const { daily, seq } = aggregateRecords(records, { day: targetDay });
  const written = await upsertAggregates(client, { day: targetDay, daily, seq });

  return { day: targetDay, records: records.length, truncated, ...written };
}

module.exports = {
  CALL_FILTER,
  aggregateRecords,
  extractRecord,
  percentile,
  dayBounds,
  previousDay,
  readDay,
  upsertAggregates,
  runMcpTelemetryAggregation,
};
