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
    const parsed = { dryRun: false, keys: null };

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
            case '--help':
                console.log(
                    'Usage: node restore-client-backup.js --client-id <UUID> --date <YYYY-MM-DD> [--dry-run] [--keys <k1,k2>]',
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
            'SELECT k, v, updated_at FROM client_kv_store WHERE client_id = $1 ORDER BY k',
            [clientId],
        );

        const currentMap = {};
        for (const row of rows) {
            currentMap[row.k] = { v: row.v, updated_at: row.updated_at };
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
                const snapshotJson = JSON.stringify(snapshotEntry.v);
                const currentJson = JSON.stringify(currentEntry.v);
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
            await client.query(
                `INSERT INTO client_kv_store (client_id, k, v, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (client_id, k) DO UPDATE SET
                   v = EXCLUDED.v,
                   updated_at = NOW()`,
                [clientId, key, JSON.stringify(entry.v)],
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

    // 2. Compute diff
    const dbPool = createPool();
    let diff, keysToRestore;
    try {
        ({ diff, keysToRestore } = await computeDiff(dbPool, args.clientId, snapshot.kvSnapshot, args.keys));
    } catch (err) {
        console.error(`\n❌ Failed to compute diff: ${err.message}`);
        await dbPool.end();
        process.exit(1);
    }

    // 3. Show diff
    console.log('\n══════════════ DIFF ══════════════');
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

    const actionKeys = [...diff.toInsert, ...diff.toUpdate];

    if (actionKeys.length === 0) {
        console.log('\n✅ Nothing to restore — all keys are already up-to-date.');
        await dbPool.end();
        process.exit(0);
    }

    // 4. Execute or skip
    if (args.dryRun) {
        console.log('\n🔍 DRY-RUN complete. No changes were made.');
        console.log(`   To apply: re-run without --dry-run`);
    } else {
        console.log(`\n⚡ Restoring ${actionKeys.length} key(s)...`);
        try {
            const restored = await executeRestore(dbPool, args.clientId, snapshot.kvSnapshot, actionKeys);
            console.log(`\n✅ Restore complete: ${restored} key(s) written to client_kv_store.`);
        } catch (err) {
            console.error(`\n❌ Restore FAILED (transaction rolled back): ${err.message}`);
            await dbPool.end();
            process.exit(1);
        }
    }

    await dbPool.end();
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
