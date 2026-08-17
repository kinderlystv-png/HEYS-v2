#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..', '..');
const sqlPath = process.argv[2] || path.join(ROOT, 'database/2026-08-18_mcp_call_events.sql');

const raw = execFileSync('yc', [
  'lockbox', 'payload', 'get', '--id', 'e6qr1rm1hm2n9a2pmsnl', '--format', 'json',
], { encoding: 'utf8' });
const payload = JSON.parse(raw);
const entries = payload.entries || payload;
const entry = entries.find((e) => e.key === 'postgresql_password');
const password = entry?.textValue || entry?.text_value;
if (!password) {
  console.error('postgresql_password not found in lockbox');
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

async function main() {
  const client = new Client({
    host: 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: 6432,
    database: 'heys_production',
    user: 'heys_admin',
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });
  await client.connect();
  await client.query(sql);
  const check = await client.query("SELECT to_regclass('public.mcp_call_events') AS table_name");
  console.log('migration ok:', check.rows[0]);
  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
