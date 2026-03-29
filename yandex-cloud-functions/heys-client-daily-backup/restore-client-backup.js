#!/usr/bin/env node

/**
 * HEYS Client Backup — Admin Restore Script
 *
 * Скачивает snapshot клиента из Yandex Object Storage и восстанавливает
 * данные в client_kv_store. Поддерживает dry-run diff.
 *
 * Usage:
 *   node restore-client-backup.js --client-id <UUID> --date <YYYY-MM-DD> [--dry-run] [--keys <key1,key2>]
 *
 * Examples:
 *   # Dry-run: показать что будет восстановлено
 *   node restore-client-backup.js --client-id ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a --date 2026-03-29 --dry-run
 *
 *   # Восстановить всё
 *   node restore-client-backup.js --client-id ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a --date 2026-03-29
 *
 *   # Восстановить только определённые ключи
 *   node restore-client-backup.js --client-id ccfe6ea3-... --date 2026-03-29 --keys heys_profile,heys_norms
 *
 *   # Восстановить только account-таблицы (без KV)
 *   node restore-client-backup.js --client-id ccfe6ea3-... --date 2026-03-29 --account-only
 *
 *   # Восстановить только KV (без account-таблиц)
 *   node restore-client-backup.js --client-id ccfe6ea3-... --date 2026-03-29 --kv-only
 *
 * Environment variables:
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD — PostgreSQL
 *   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY — Object Storage credentials
 *   S3_BUCKET (default: heys-backups)
 *   S3_PREFIX (default: client-daily)
 */

'use strict';

const crypto = require('crypto');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { gunzipSync } = require('zlib');

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');

// ═══════════════════════════════════════════════════════════════════
// Parse CLI arguments
// ═══════════════════════════════════════════════════════════════════

function parseArgs() {
    const args = process.argv.slice(2);
    const parsed = { dryRun: false, keys: null, accountOnly: false, kvOnly: false };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--client-id':
                parsed.clientId = args[++i];
                break;
            case '--date':
                parsed.date = args[++i];
                break;
            case '--dry-run':
                parsed.dryRun = true;
                break;
            case '--keys':
                parsed.keys = args[++i].split(',').map((k) => k.trim());
                break;
            case '--account-only':
                parsed.accountOnly = true;
                break;
            case '--kv-only':
                parsed.kvOnly = true;
                break;
            case '--help':
                console.log(
                    'Usage: node restore-client-backup.js --client-id <UUID> --date <YYYY-MM-DD> [--dry-run] [--keys <k1,k2>] [--account-only] [--kv-only]',
                );
                process.exit(0);
                break;
            default:
                console.error(`Unknown argument: ${args[i]}`);
                process.exit(1);
        }
    }

    if (!parsed.clientId || !parsed.date) {
        console.error('Error: --client-id and --date are required.');
        console.error('Run with --help for usage.');
        process.exit(1);
    }

    // Basic UUID format validation
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(parsed.clientId)) {
        console.error('Error: --client-id must be a valid UUID.');
        process.exit(1);
    }

    // Date format validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
        console.error('Error: --date must be YYYY-MM-DD.');
        process.exit(1);
    }

    return parsed;
}

// ═══════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════

const S3_CONFIG = {
    endpoint: process.env.S3_ENDPOINT || 'https://storage.yandexcloud.net',
    region: 'ru-central1',
    bucket: process.env.S3_BUCKET || 'heys-backups',
    prefix: process.env.S3_PREFIX || 'client-daily',
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
};

function loadCACert() {
    const paths = [
        join(__dirname, '..', 'certs', 'root.crt'),
        join(__dirname, 'certs', 'root.crt'),
    ];
    for (const p of paths) {
        if (existsSync(p)) {
            try { return readFileSync(p, 'utf8'); } catch { /* skip */ }
        }
    }
    return null;
}

function createPool() {
    const ca = loadCACert();
    return new Pool({
        host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
        port: parseInt(process.env.PG_PORT || '6432', 10),
        database: process.env.PG_DATABASE || 'heys_production',
        user: process.env.PG_USER || 'heys_admin',
        password: process.env.PG_PASSWORD,
        ssl: ca
            ? { rejectUnauthorized: true, ca }
            : { rejectUnauthorized: true },
        max: 1,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 10000,
        query_timeout: 30000,
    });
}

function normalizeTimestamp(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function snapshotEntrySignature(entry) {
    return JSON.stringify({
        v: entry?.v ?? null,
        v_encrypted_b64: entry?.v_encrypted_b64 ?? null,
        key_version: entry?.key_version ?? null,
        updated_at: normalizeTimestamp(entry?.updated_at),
    });
}

function dbEntrySignature(entry) {
    return JSON.stringify({
        v: entry?.v ?? null,
        v_encrypted_b64: entry?.v_encrypted
            ? Buffer.from(entry.v_encrypted).toString('base64')
            : null,
        key_version: entry?.key_version ?? null,
        updated_at: normalizeTimestamp(entry?.updated_at),
    });
}

// ═══════════════════════════════════════════════════════════════════
// Download snapshot from S3
// ═══════════════════════════════════════════════════════════════════

async function downloadSnapshot(clientId, date) {
    const s3 = new S3Client({
        endpoint: S3_CONFIG.endpoint,
        region: S3_CONFIG.region,
        credentials: {
            accessKeyId: S3_CONFIG.accessKeyId,
            secretAccessKey: S3_CONFIG.secretAccessKey,
        },
    });

    const key = `${S3_CONFIG.prefix}/${date}/${clientId}.json.gz`;
    console.log(`\n📦 Downloading: s3://${S3_CONFIG.bucket}/${key}`);

    const cmd = new GetObjectCommand({
        Bucket: S3_CONFIG.bucket,
        Key: key,
    });

    const response = await s3.send(cmd);

    // Read stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
        chunks.push(chunk);
    }
    const gzipped = Buffer.concat(chunks);
    const jsonBuf = gunzipSync(gzipped);
    const snapshot = JSON.parse(jsonBuf.toString('utf8'));

    console.log(`✅ Downloaded: ${(gzipped.length / 1024).toFixed(1)} KB compressed`);
    console.log(`   Schema version: ${snapshot.schemaVersion}`);
    console.log(`   Business date:  ${snapshot.businessDate}`);
    console.log(`   Exported at:    ${snapshot.exportedAt}`);
    console.log(`   Key count:      ${snapshot.keyCount}`);
    if (snapshot.schemaVersion >= 2 && snapshot.accountData) {
        const ad = snapshot.accountData;
        console.log(`   Account data:   client=${ad.client ? '✅' : '❌'}, ` +
            `consents=${ad.consents?.length ?? 0}, ` +
            `subscriptions=${ad.subscriptions?.length ?? 0}, ` +
            `trial_queue=${ad.trial_queue?.length ?? 0}, ` +
            `payments=${ad.payments?.length ?? 0}`);
    }

    // Verify checksum
    if (snapshot.checksum) {
        const stored = snapshot.checksum;
        const copy = { ...snapshot };
        delete copy.checksum;
        const computed = crypto.createHash('sha256').update(JSON.stringify(copy)).digest('hex');
        if (computed === stored) {
            console.log(`   Checksum:       ✅ valid`);
        } else {
            console.error(`   Checksum:       ❌ MISMATCH (stored=${stored.slice(0, 16)}… computed=${computed.slice(0, 16)}…)`);
            console.error('   ⚠️  Snapshot integrity check failed! Aborting.');
            process.exit(1);
        }
    }

    return snapshot;
}

// ═══════════════════════════════════════════════════════════════════
// Compare snapshot with current DB state (dry-run diff)
// ═══════════════════════════════════════════════════════════════════

async function computeDiff(pool, clientId, kvSnapshot, filterKeys) {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            'SELECT k, v, v_encrypted, key_version, updated_at FROM client_kv_store WHERE client_id = $1 ORDER BY k',
            [clientId],
        );

        const currentMap = {};
        for (const row of rows) {
            currentMap[row.k] = {
                v: row.v,
                v_encrypted: row.v_encrypted,
                key_version: row.key_version,
                updated_at: row.updated_at,
            };
        }

        const snapshotKeys = Object.keys(kvSnapshot);
        const keysToRestore = filterKeys
            ? snapshotKeys.filter((k) => filterKeys.includes(k))
            : snapshotKeys;

        const diff = {
            toInsert: [],   // Keys in snapshot but not in DB
            toUpdate: [],   // Keys in both but different value
            unchanged: [],  // Keys in both with same value
            skipped: [],    // Keys filtered out
        };

        for (const key of snapshotKeys) {
            if (filterKeys && !filterKeys.includes(key)) {
                diff.skipped.push(key);
                continue;
            }

            const snapshotEntry = kvSnapshot[key];
            const currentEntry = currentMap[key];

            if (!currentEntry) {
                diff.toInsert.push(key);
            } else {
                const snapshotJson = snapshotEntrySignature(snapshotEntry);
                const currentJson = dbEntrySignature(currentEntry);
                if (snapshotJson === currentJson) {
                    diff.unchanged.push(key);
                } else {
                    diff.toUpdate.push(key);
                }
            }
        }

        return { diff, keysToRestore };
    } finally {
        client.release();
    }
}

// ═══════════════════════════════════════════════════════════════════
// Execute restore (transactional upsert)
// ═══════════════════════════════════════════════════════════════════

async function executeRestore(pool, clientId, kvSnapshot, keysToRestore) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let restored = 0;
        for (const key of keysToRestore) {
            const entry = kvSnapshot[key];
            const encryptedBuffer = entry?.v_encrypted_b64
                ? Buffer.from(entry.v_encrypted_b64, 'base64')
                : null;
            const restoredAt = normalizeTimestamp(entry?.updated_at) || new Date().toISOString();

            await client.query(
                `INSERT INTO client_kv_store (client_id, k, v, v_encrypted, key_version, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (client_id, k) DO UPDATE SET
                   v = EXCLUDED.v,
                   v_encrypted = EXCLUDED.v_encrypted,
                   key_version = EXCLUDED.key_version,
                   updated_at = EXCLUDED.updated_at`,
                [
                    clientId,
                    key,
                    JSON.stringify(entry.v),
                    encryptedBuffer,
                    entry?.key_version ?? null,
                    restoredAt,
                ],
            );
            restored++;
        }

        await client.query('COMMIT');
        return restored;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ═══════════════════════════════════════════════════════════════════
// Account data diff and restore (schemaVersion >= 2)
// ═══════════════════════════════════════════════════════════════════

/**
 * Compare a single table's snapshot rows with current DB rows by primary key.
 * Returns { toInsert: [], toUpdate: [], unchanged: [] }.
 */
function diffTableRows(snapshotRows, dbRows, pkField = 'id') {
    const dbMap = new Map();
    for (const row of dbRows) {
        dbMap.set(String(row[pkField]), JSON.stringify(row));
    }

    const result = { toInsert: [], toUpdate: [], unchanged: [] };
    for (const sRow of snapshotRows) {
        const pk = String(sRow[pkField]);
        const dbJson = dbMap.get(pk);
        if (!dbJson) {
            result.toInsert.push(sRow);
        } else if (dbJson !== JSON.stringify(sRow)) {
            result.toUpdate.push(sRow);
        } else {
            result.unchanged.push(sRow);
        }
    }
    return result;
}

async function computeAccountDiff(pool, clientId, accountData) {
    if (!accountData) return null;

    const client = await pool.connect();
    try {
        const tableDiffs = {};

        // clients
        if (accountData.client) {
            const { rows } = await client.query(
                `SELECT id, curator_id, name, phone, phone_normalized,
                        pin_updated_at, pin_failed_attempts, pin_locked_until,
                        subscription_status, subscription_plan,
                        subscription_started_at, subscription_expires_at,
                        trial_started_at, trial_ends_at, updated_at
                   FROM clients WHERE id = $1`,
                [clientId],
            );
            tableDiffs.clients = diffTableRows([accountData.client], rows);
        }

        // consents
        if (accountData.consents?.length > 0) {
            const { rows } = await client.query(
                `SELECT id, client_id, consent_type, document_version,
                        granted, signature_method, ip_address, user_agent,
                        created_at, revoked_at
                   FROM consents WHERE client_id = $1 ORDER BY created_at`,
                [clientId],
            );
            tableDiffs.consents = diffTableRows(accountData.consents, rows);
        }

        // subscriptions
        if (accountData.subscriptions?.length > 0) {
            const { rows } = await client.query(
                `SELECT id, client_id, trial_started_at, trial_ends_at,
                        active_until, canceled_at, created_at, updated_at
                   FROM subscriptions WHERE client_id = $1`,
                [clientId],
            );
            tableDiffs.subscriptions = diffTableRows(accountData.subscriptions, rows);
        }

        // trial_queue
        if (accountData.trial_queue?.length > 0) {
            const { rows } = await client.query(
                `SELECT id, client_id, curator_id, status,
                        queued_at, offer_sent_at, offer_expires_at,
                        assigned_at, canceled_at, source, priority,
                        notification_channel, created_at, updated_at
                   FROM trial_queue WHERE client_id = $1`,
                [clientId],
            );
            tableDiffs.trial_queue = diffTableRows(accountData.trial_queue, rows);
        }

        // payments
        if (accountData.payments?.length > 0) {
            const { rows } = await client.query(
                `SELECT id, client_id, external_payment_id, external_status,
                        payment_provider, amount, currency, plan,
                        period_start, period_end, status,
                        created_at, updated_at, metadata
                   FROM payments WHERE client_id = $1 ORDER BY created_at`,
                [clientId],
            );
            tableDiffs.payments = diffTableRows(accountData.payments, rows);
        }

        return tableDiffs;
    } finally {
        client.release();
    }
}

/**
 * Print account diff summary.
 */
function printAccountDiff(tableDiffs) {
    if (!tableDiffs || Object.keys(tableDiffs).length === 0) {
        console.log('\n  📋 Account data: (none in snapshot)');
        return 0;
    }

    console.log('\n══════════ ACCOUNT DIFF ══════════');
    let totalActions = 0;

    for (const [table, diff] of Object.entries(tableDiffs)) {
        const actions = diff.toInsert.length + diff.toUpdate.length;
        totalActions += actions;
        const marker = actions > 0 ? '⚡' : '✅';
        console.log(`  ${marker} ${table}: +${diff.toInsert.length} insert, ~${diff.toUpdate.length} update, =${diff.unchanged.length} unchanged`);
    }

    return totalActions;
}

/**
 * Build a parameterised UPSERT for a given table and columns.
 * Columns must match the snapshot field names exactly.
 */
function buildUpsert(table, columns, pkField = 'id') {
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const setClauses = columns
        .filter((c) => c !== pkField)
        .map((c) => `${c} = EXCLUDED.${c}`)
        .join(', ');
    return `INSERT INTO ${table} (${columns.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT (${pkField}) DO UPDATE SET ${setClauses}`;
}

async function executeAccountRestore(pool, accountData, tableDiffs) {
    if (!tableDiffs || Object.keys(tableDiffs).length === 0) return 0;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let restored = 0;

        const tableConfigs = {
            clients: {
                columns: [
                    'id', 'curator_id', 'name', 'phone', 'phone_normalized',
                    'pin_updated_at', 'pin_failed_attempts', 'pin_locked_until',
                    'subscription_status', 'subscription_plan',
                    'subscription_started_at', 'subscription_expires_at',
                    'trial_started_at', 'trial_ends_at', 'updated_at',
                ],
                pk: 'id',
            },
            consents: {
                columns: [
                    'id', 'client_id', 'consent_type', 'document_version',
                    'granted', 'signature_method', 'ip_address', 'user_agent',
                    'created_at', 'revoked_at',
                ],
                pk: 'id',
            },
            subscriptions: {
                columns: [
                    'id', 'client_id', 'trial_started_at', 'trial_ends_at',
                    'active_until', 'canceled_at', 'created_at', 'updated_at',
                ],
                pk: 'id',
            },
            trial_queue: {
                columns: [
                    'id', 'client_id', 'curator_id', 'status',
                    'queued_at', 'offer_sent_at', 'offer_expires_at',
                    'assigned_at', 'canceled_at', 'source', 'priority',
                    'notification_channel', 'created_at', 'updated_at',
                ],
                pk: 'id',
            },
            payments: {
                columns: [
                    'id', 'client_id', 'external_payment_id', 'external_status',
                    'payment_provider', 'amount', 'currency', 'plan',
                    'period_start', 'period_end', 'status',
                    'created_at', 'updated_at', 'metadata',
                ],
                pk: 'id',
            },
        };

        for (const [table, diff] of Object.entries(tableDiffs)) {
            const cfg = tableConfigs[table];
            if (!cfg) continue;

            const rows = [...diff.toInsert, ...diff.toUpdate];
            if (rows.length === 0) continue;

            const sql = buildUpsert(table, cfg.columns, cfg.pk);
            for (const row of rows) {
                const values = cfg.columns.map((col) => {
                    const val = row[col];
                    // Convert metadata JSONB to string if needed
                    if (col === 'metadata' && val && typeof val === 'object') {
                        return JSON.stringify(val);
                    }
                    return val ?? null;
                });
                await client.query(sql, values);
                restored++;
            }
        }

        await client.query('COMMIT');
        return restored;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

async function main() {
    const args = parseArgs();

    // Validate credentials
    if (!S3_CONFIG.accessKeyId || !S3_CONFIG.secretAccessKey) {
        console.error('Error: S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set.');
        process.exit(1);
    }
    if (!process.env.PG_PASSWORD) {
        console.error('Error: PG_PASSWORD must be set.');
        process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('  HEYS Client Backup — Restore');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Client ID:  ${args.clientId}`);
    console.log(`  Date:       ${args.date}`);
    console.log(`  Mode:       ${args.dryRun ? '🔍 DRY-RUN (no changes)' : '⚡ LIVE RESTORE'}`);
    if (args.accountOnly) console.log('  Scope:      account-only (no KV)');
    else if (args.kvOnly) console.log('  Scope:      kv-only (no account)');
    if (args.keys) {
        console.log(`  Keys filter: ${args.keys.join(', ')}`);
    }

    // 1. Download snapshot
    let snapshot;
    try {
        snapshot = await downloadSnapshot(args.clientId, args.date);
    } catch (err) {
        if (err.name === 'NoSuchKey') {
            console.error(`\n❌ Snapshot not found for client ${args.clientId} on ${args.date}`);
            console.error(`   Expected: s3://${S3_CONFIG.bucket}/${S3_CONFIG.prefix}/${args.date}/${args.clientId}.json.gz`);
        } else {
            console.error(`\n❌ Failed to download snapshot: ${err.message}`);
        }
        process.exit(1);
    }

    // Verify clientId matches
    if (snapshot.clientId !== args.clientId) {
        console.error(`\n❌ Client ID mismatch! Snapshot contains ${snapshot.clientId}, expected ${args.clientId}`);
        process.exit(1);
    }

    // 2. Compute KV diff
    const dbPool = createPool();
    let diff, keysToRestore;

    const restoreKv = !args.accountOnly;
    const restoreAccount = !args.kvOnly && snapshot.schemaVersion >= 2 && !!snapshot.accountData;

    if (restoreKv) {
        try {
            ({ diff, keysToRestore } = await computeDiff(dbPool, args.clientId, snapshot.kvSnapshot, args.keys));
        } catch (err) {
            console.error(`\n❌ Failed to compute KV diff: ${err.message}`);
            await dbPool.end();
            process.exit(1);
        }
    }

    // 3. Compute account diff
    let tableDiffs = null;
    if (restoreAccount) {
        try {
            tableDiffs = await computeAccountDiff(dbPool, args.clientId, snapshot.accountData);
        } catch (err) {
            console.error(`\n❌ Failed to compute account diff: ${err.message}`);
            await dbPool.end();
            process.exit(1);
        }
    }

    // 4. Show diffs
    let kvActionCount = 0;
    if (restoreKv) {
        console.log('\n══════════════ KV DIFF ══════════════');
        console.log(`  Insert (new):    ${diff.toInsert.length} key(s)`);
        console.log(`  Update (changed):${diff.toUpdate.length} key(s)`);
        console.log(`  Unchanged:       ${diff.unchanged.length} key(s)`);
        if (diff.skipped.length > 0) {
            console.log(`  Skipped (filter):${diff.skipped.length} key(s)`);
        }

        if (diff.toInsert.length > 0) {
            console.log('\n  🆕 TO INSERT:');
            for (const k of diff.toInsert) console.log(`     + ${k}`);
        }
        if (diff.toUpdate.length > 0) {
            console.log('\n  ✏️  TO UPDATE:');
            for (const k of diff.toUpdate) console.log(`     ~ ${k}`);
        }
        kvActionCount = diff.toInsert.length + diff.toUpdate.length;
    }

    const accountActionCount = printAccountDiff(tableDiffs);
    const totalActions = kvActionCount + accountActionCount;

    if (totalActions === 0) {
        console.log('\n✅ Nothing to restore — everything is already up-to-date.');
        await dbPool.end();
        process.exit(0);
    }

    // 5. Execute or skip
    if (args.dryRun) {
        console.log('\n🔍 DRY-RUN complete. No changes were made.');
        console.log(`   Total actionable: ${totalActions} (KV: ${kvActionCount}, Account: ${accountActionCount})`);
        console.log('   To apply: re-run without --dry-run');
    } else {
        let kvRestored = 0;
        let accountRestored = 0;

        // Restore KV
        if (restoreKv && kvActionCount > 0) {
            const actionKeys = [...diff.toInsert, ...diff.toUpdate];
            console.log(`\n⚡ Restoring ${actionKeys.length} KV key(s)...`);
            try {
                kvRestored = await executeRestore(dbPool, args.clientId, snapshot.kvSnapshot, actionKeys);
            } catch (err) {
                console.error(`\n❌ KV restore FAILED (transaction rolled back): ${err.message}`);
                await dbPool.end();
                process.exit(1);
            }
        }

        // Restore account tables
        if (restoreAccount && accountActionCount > 0) {
            console.log(`\n⚡ Restoring ${accountActionCount} account row(s)...`);
            try {
                accountRestored = await executeAccountRestore(dbPool, snapshot.accountData, tableDiffs);
            } catch (err) {
                console.error(`\n❌ Account restore FAILED (transaction rolled back): ${err.message}`);
                await dbPool.end();
                process.exit(1);
            }
        }

        console.log(`\n✅ Restore complete: ${kvRestored} KV key(s) + ${accountRestored} account row(s) written.`);
    }

    await dbPool.end();
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
