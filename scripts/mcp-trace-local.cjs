#!/usr/bin/env node
'use strict';
/**
 * Локальный trace-helper: Postgres mcp_call_events + подсказка heading.
 * Пароль — из Lockbox через yc (как scripts/db/get-pg-password.sh).
 */
const { execFileSync } = require('node:child_process');
const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

const LOCKBOX_ID = process.env.HEYS_PG_LOCKBOX_ID || 'e6qr1rm1hm2n9a2pmsnl';
const minutes = Number(process.argv[2] || 60);

function lockboxPassword() {
  const raw = execFileSync('yc', ['lockbox', 'payload', 'get', '--id', LOCKBOX_ID, '--format', 'json'], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  const payload = JSON.parse(raw);
  const entry = (payload.entries || []).find((e) => e.key === 'postgresql_password');
  if (!entry?.text_value) throw new Error('postgresql_password not in Lockbox');
  return entry.text_value;
}

function loadCert() {
  const certPath = path.join(__dirname, '../yandex-cloud-functions/certs/root.crt');
  return fs.existsSync(certPath) ? fs.readFileSync(certPath, 'utf8') : null;
}

async function main() {
  const ca = loadCert();
  const pool = new Pool({
    host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: Number(process.env.PG_PORT || 6432),
    database: process.env.PG_DATABASE || 'heys_production',
    user: process.env.PG_USER || 'heys_admin',
    password: lockboxPassword(),
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { rows } = await pool.query(
    `SELECT ts, tool, session_id, seq, duration_ms, status, role
     FROM mcp_call_events
     WHERE ts >= $1::timestamptz
     ORDER BY ts ASC`,
    [since],
  );
  const bySession = new Map();
  for (const row of rows) {
    const key = row.session_id || '(null)';
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(row);
  }
  const sessions = [...bySession.entries()]
    .map(([sid, calls]) => ({
      session_id: sid,
      calls: calls.length,
      total_ms: calls.reduce((s, c) => s + (Number(c.duration_ms) || 0), 0),
      tools: calls.map((c) => c.tool),
      first_ts: calls[0]?.ts,
      last_ts: calls[calls.length - 1]?.ts,
      detail: calls,
    }))
    .sort((a, b) => b.calls - a.calls);

  console.log(JSON.stringify({
    since,
    total_calls: rows.length,
    sessions,
    meal_chain: rows.filter((r) => /^heys_(get_day|search_products|create_product|log_meal)/.test(r.tool)),
  }, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
