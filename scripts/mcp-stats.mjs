#!/usr/bin/env node
'use strict';

/**
 * Отчёт по телеметрии MCP-коннектора (heys/8e2188).
 *
 *   node scripts/mcp-stats.mjs --days 7
 *
 * Читает агрегаты `mcp_call_daily` и `mcp_seq_daily`, которые суточный джоб
 * heys-maintenance сворачивает из Cloud Logging.
 *
 * Сортировка по СУММАРНОМУ времени, а не по среднему: оптимизировать надо то,
 * что съедает больше всего за период. Инструмент со средним в две секунды, но
 * тремя вызовами в неделю, стоит дешевле, чем стомиллисекундный, который
 * дёргается тысячу раз.
 *
 * Второй блок — пары «инструмент → следующий инструмент». Главная потеря в
 * MCP не медленный вызов, а лишний круг: модель идёт за контекстом и списком
 * клиентов там, где хватало прямой записи по алиасу. На одиночных вызовах это
 * не видно вовсе.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PSQL_WRAPPER = path.join(ROOT, 'scripts/db/psql.sh');
const SEPARATOR = '';

function parseArgs(argv) {
  let days = 7;
  let limit = 15;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--days' || arg === '-d') days = Number(argv[i + 1]);
    else if (arg.startsWith('--days=')) days = Number(arg.slice('--days='.length));
    else if (arg === '--limit' || arg === '-l') limit = Number(argv[i + 1]);
    else if (arg.startsWith('--limit=')) limit = Number(arg.slice('--limit='.length));
  }
  if (!Number.isFinite(days) || days < 1) days = 7;
  if (!Number.isFinite(limit) || limit < 1) limit = 15;
  return { days, limit };
}

function query(sql) {
  const result = spawnSync(PSQL_WRAPPER, ['-X', '-qAt', '-F', SEPARATOR, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    console.error('Не удалось прочитать телеметрию из базы.');
    if (stderr) console.error(stderr.split('\n').slice(0, 5).join('\n'));
    process.exit(1);
  }
  return String(result.stdout || '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(SEPARATOR));
}

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function fmtMs(ms) {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} мин`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} с`;
  return `${Math.round(ms)} мс`;
}

function table(headers, rows, align = []) {
  const widths = headers.map((h, i) => Math.max(
    [...h].length,
    ...rows.map((r) => [...String(r[i] ?? '')].length),
  ));
  const line = (cells) => cells
    .map((cell, i) => (align[i] === 'right'
      ? String(cell ?? '').padStart(widths[i])
      : String(cell ?? '').padEnd(widths[i])))
    .join('  ')
    .trimEnd();
  return [line(headers), widths.map((w) => '─'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}

const { days, limit } = parseArgs(process.argv.slice(2));

const callsSql = `
  SELECT tool,
         sum(calls)::bigint,
         sum(total_ms)::bigint,
         max(p50_ms)::int,
         max(p95_ms)::int,
         max(max_ms)::int,
         sum(err_count)::bigint,
         sum(rejected_count)::bigint,
         sum(cold_starts)::bigint,
         round(avg(avg_upstream_calls), 2)
    FROM mcp_call_daily
   WHERE day >= current_date - ${days}
   GROUP BY tool
   ORDER BY sum(total_ms) DESC
`;

const seqSql = `
  SELECT tool_prev, tool_next, sum(count)::bigint
    FROM mcp_seq_daily
   WHERE day >= current_date - ${days}
   GROUP BY tool_prev, tool_next
   ORDER BY sum(count) DESC
   LIMIT ${limit}
`;

const callRows = query(callsSql);

if (!callRows.length) {
  console.log(`За последние ${days} дн. записей телеметрии нет.`);
  console.log('Если коннектор работал — проверь, что суточный джоб mcp_telemetry отработал');
  console.log('и что у heys-maintenance задан MCP_LOG_GROUP_ID.');
  process.exit(0);
}

const totalCalls = callRows.reduce((sum, r) => sum + num(r[1]), 0);
const totalMs = callRows.reduce((sum, r) => sum + num(r[2]), 0);
const totalErr = callRows.reduce((sum, r) => sum + num(r[6]), 0);

console.log(`\nТелеметрия MCP за ${days} дн.`);
console.log(`Вызовов: ${totalCalls} · суммарно ${fmtMs(totalMs)} · ошибок ${totalErr}` +
  ` (${totalCalls ? ((totalErr / totalCalls) * 100).toFixed(1) : '0.0'}%)\n`);

console.log(table(
  ['инструмент', 'вызовов', 'сумма', 'доля', 'p50', 'p95', 'max', 'ошибок', 'отказов', 'холодных', 'API/вызов'],
  callRows.map((r) => {
    const calls = num(r[1]);
    const sum = num(r[2]);
    return [
      r[0],
      calls,
      fmtMs(sum),
      totalMs ? `${((sum / totalMs) * 100).toFixed(1)}%` : '—',
      `${num(r[3])} мс`,
      `${num(r[4])} мс`,
      `${num(r[5])} мс`,
      num(r[6]) || '',
      num(r[7]) || '',
      num(r[8]) || '',
      r[9] || '',
    ];
  }),
  ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
));

const seqRows = query(seqSql);
console.log(`\nПоследовательности вызовов (топ ${limit})`);
if (!seqRows.length) {
  console.log('Пар нет: за период не было двух вызовов подряд в одном подключении.');
} else {
  console.log(table(
    ['предыдущий', '→', 'следующий', 'раз'],
    seqRows.map((r) => [r[0], '→', r[1], num(r[2])]),
    ['left', 'left', 'left', 'right'],
  ));
  console.log('\nЧастая пара — кандидат на лишний круг: если следующий вызов всегда идёт');
  console.log('за предыдущим, эти два шага стоит закрывать одним.');
}
console.log('');
