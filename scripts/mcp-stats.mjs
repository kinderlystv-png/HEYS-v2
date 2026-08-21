#!/usr/bin/env node
'use strict';

/**
 * Отчёт по телеметрии MCP-коннектора (heys/8e2188).
 *
 *   node scripts/mcp-stats.mjs --days 7
 *
 * Читает агрегаты `mcp_call_daily` и `mcp_seq_daily`, которые суточный джоб
 * heys-maintenance сворачивает из `mcp_call_events`.
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
const IS_WIN = process.platform === 'win32';
const PSQL_PS1 = path.join(ROOT, 'scripts/db/psql.ps1');
const PSQL_SH = path.join(ROOT, 'scripts/db/psql.sh');
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

function runPsql(runner, psqlArgs) {
  const options = { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  return runner === 'powershell'
    ? spawnSync('powershell', ['-NoProfile', '-File', PSQL_PS1, ...psqlArgs], options)
    : spawnSync('bash', [PSQL_SH, ...psqlArgs], options);
}

function query(sql) {
  const psqlArgs = ['-X', '-qAt', '-F', SEPARATOR, '-v', 'ON_ERROR_STOP=1', '-c', sql];
  let result = runPsql(IS_WIN ? 'powershell' : 'bash', psqlArgs);
  // На Windows политика запуска скриптов часто закрыта, и psql.ps1 не стартует
  // вовсе. Рядом лежит тот же psql.sh, а bash в этом окружении есть (Git for
  // Windows) — отчёт не должен упираться в выбор оболочки.
  if (result.status !== 0 && IS_WIN && /ExecutionPolicy|about_Execution_Policies|UnauthorizedAccess/i.test(String(result.stderr || ''))) {
    result = runPsql('bash', psqlArgs);
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    // Отсутствие таблиц и недоступность базы лечатся по-разному, а psql
    // сообщает о них одинаково невнятно. Отправить за проверкой джоба, когда
    // на деле не применена миграция, — потерянный час.
    if (/does not exist|не существует/i.test(stderr)) {
      console.error('Таблиц телеметрии нет — миграция не применена.');
      console.error('  bash scripts/db/psql.sh -f database/2026-08-17_mcp_telemetry.sql');
    } else {
      console.error('Не удалось прочитать телеметрию из базы.');
      if (stderr) console.error(stderr.split('\n').slice(0, 5).join('\n'));
    }
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

/**
 * Круги и подсказки — блок из сырья, а не из агрегата.
 *
 * Отвечает ровно на один вопрос: подсказка про лишний круг меняет поведение
 * модели или её игнорируют. «Стало меньше вызовов» само по себе ничего не
 * доказывает — трафик по дням разный, поэтому считаем доли.
 *
 * «В серии» — у вызова был такой же вызов того же инструмента в том же
 * подключении не раньше чем за минуту до него. «Проигнорировано» — после
 * выданной подсказки тот же инструмент позвали снова в ту же минуту.
 *
 * Окно 60 с совпадает с окном подсказки на сервере (SERIES_WINDOW_MS в
 * heys-mcp/index.js): считать эффект по другому окну — значит мерить не то,
 * что показывали модели.
 */
const seriesSql = `
  WITH src AS (
    SELECT ts::date AS day,
           ts,
           hint,
           lag(ts) OVER w AS prev_ts,
           lead(ts) OVER w AS next_ts
      FROM mcp_call_events
     WHERE ts >= current_date - ${days}
       AND coalesce(conn_id, session_id) IS NOT NULL
    WINDOW w AS (PARTITION BY coalesce(conn_id, session_id), tool ORDER BY ts)
  )
  SELECT day,
         count(*)::bigint AS calls,
         count(*) FILTER (WHERE prev_ts > ts - interval '60 seconds')::bigint AS in_series,
         count(*) FILTER (WHERE hint IS NOT NULL)::bigint AS hinted,
         count(*) FILTER (WHERE hint = 'repeat')::bigint AS repeats,
         count(*) FILTER (WHERE hint IS NOT NULL AND next_ts < ts + interval '60 seconds')::bigint AS ignored
    FROM src
   GROUP BY day
   ORDER BY day
`;

const seriesRows = query(seriesSql);
console.log('\nЛишние круги и подсказки (по сырью, окно 60 с)');
if (!seriesRows.length) {
  console.log('Сырья за период нет.');
} else {
  console.log(table(
    ['день', 'вызовов', 'в серии', 'доля', 'подсказок', 'повторов', 'проигнорировано'],
    seriesRows.map((r) => {
      const calls = num(r[1]);
      const inSeries = num(r[2]);
      const hinted = num(r[3]);
      return [
        r[0],
        calls,
        inSeries,
        calls ? `${((inSeries / calls) * 100).toFixed(1)}%` : '—',
        hinted || '',
        num(r[4]) || '',
        hinted ? `${num(r[5])} (${((num(r[5]) / hinted) * 100).toFixed(0)}%)` : '',
      ];
    }),
    ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
  ));
  console.log('\nЧитается так: «в серии» должна падать, «проигнорировано» — тоже.');
  console.log('Подсказки появились 21.08; до этого дня столбцы пусты, а «в серии»');
  console.log('за те дни занижена — conn_id тогда не писался, и серия рвалась на');
  console.log('каждом холодном старте. Сравнение с 18–20.08 честнее делать через');
  console.log('tasks_mcp_trace: там счёт идёт по репликам, а не по вызовам.');
}
console.log('');
