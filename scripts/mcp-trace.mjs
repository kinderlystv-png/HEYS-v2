#!/usr/bin/env node
'use strict';
/**
 * Локальный аналог tasks_mcp_trace: стенограмма из client_kv_store + mcp_call_events.
 *
 *   node scripts/mcp-trace.mjs
 *   node scripts/mcp-trace.mjs --heading 11:38
 *   node scripts/mcp-trace.mjs --date 2026-08-17
 *   node scripts/mcp-trace.mjs --json
 *
 * Нужны: yc (Lockbox), node_modules/pg. На Windows — pnpm db:setup:windows один раз.
 * Канонический runbook: docs/operations/MCP_TRACE_RUNBOOK.md
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MCP = path.join(ROOT, 'yandex-cloud-functions/heys-mcp');
const tasks = require(path.join(MCP, 'lib/tasks.js'));
const correlate = require(path.join(MCP, 'lib/mcp-correlate.js'));
const { createMcpTraceTools } = require(path.join(MCP, 'lib/mcp-trace-tools.js'));

const LOCKBOX_ID = process.env.HEYS_PG_LOCKBOX_ID || 'e6qr1rm1hm2n9a2pmsnl';
const DEFAULT_CLIENT = process.env.HEYS_TASKS_CLIENT_ID || 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';

function arg(name, fallback) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  const prefixed = argv.find((item) => item.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}

const jsonOut = process.argv.includes('--json');
const heading = arg('--heading');
const dateArg = arg('--date');
const clientId = arg('--client', DEFAULT_CLIENT);

class ToolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

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
  const certPath = path.join(ROOT, 'yandex-cloud-functions/certs/root.crt');
  return fs.existsSync(certPath) ? fs.readFileSync(certPath, 'utf8') : null;
}

async function createPool() {
  const { Pool } = await import('pg');
  const ca = loadCert();
  return new Pool({
    host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: Number(process.env.PG_PORT || 6432),
    database: process.env.PG_DATABASE || 'heys_production',
    user: process.env.PG_USER || 'heys_admin',
    password: lockboxPassword(),
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15000,
  });
}

async function main() {
  const pool = await createPool();
  const nowMs = Date.now();
  const date = dateArg || tasks.taskDay(nowMs);

  const api = {
    async getKVByCurator(_jwt, cid, key) {
      const { rows } = await pool.query(
        'SELECT v FROM client_kv_store WHERE client_id = $1 AND k = $2 LIMIT 1',
        [cid, key],
      );
      if (!rows.length) return { data: null, error: null };
      const v = rows[0].v;
      const text = typeof v === 'object' && v && typeof v.text === 'string' ? v.text : '';
      return { data: { text, rev: 1, updatedAt: nowMs }, error: null };
    },
  };

  const listMcpCallEventsImpl = async ({ since, until }) => {
    const { rows } = await pool.query(
      `SELECT t, ts, tool, session_id, seq, duration_ms, upstream_calls, upstream_ms,
              status, error_code, resp_bytes, arg_count, cold_start, uptime_ms, fn_version, role
       FROM mcp_call_events
       WHERE ts >= $1::timestamptz AND ts <= $2::timestamptz
       ORDER BY ts ASC
       LIMIT 5000`,
      [since, until],
    );
    const records = rows.map((row) => ({
      ...row,
      ts: row.ts instanceof Date ? row.ts.toISOString() : row.ts,
    }));
    return { records, truncated: records.length >= 5000, error: null };
  };

  const { tools } = createMcpTraceTools({
    api,
    curatorJwt: 'local-cli',
    clientId,
    ToolError,
    nowMs,
    listMcpCallEventsImpl,
  });

  const args = { date };
  if (heading) args.heading = heading;

  try {
    const result = await tools.tasks_mcp_trace(args);
    if (jsonOut) {
      console.log(JSON.stringify(result.structured, null, 2));
      if (result.text) console.error('\n--- text ---\n' + result.text);
    } else {
      console.log(result.text || '(пусто)');
    }
  } catch (error) {
    const code = error && error.code ? error.code : 'error';
    console.error(`[${code}] ${error.message || error}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
