/**
 * HEYS Client Daily Backup Cloud Function
 *
 * Ежедневный бэкап всех клиентов из client_kv_store в Yandex Object Storage.
 * Каждый клиент получает собственный JSON-snapshot (gzip), хранение 365 дней.
 *
 * Trigger: Yandex Cloud Functions Timer Trigger
 *   cron: 0 1 * * ? *  (01:00 UTC = 04:00 MSK, после закрытия HEYS-дня в 03:00)
 *
 * Environment variables:
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD — PostgreSQL
 *   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY — Yandex Object Storage credentials
 *   S3_BUCKET          — bucket name (default: heys-backups)
 *   S3_ENDPOINT         — endpoint  (default: https://storage.yandexcloud.net)
 *   S3_PREFIX           — object key prefix (default: client-daily)
 *   RETENTION_DAYS      — days to keep snapshots (default: 365)
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — error alerts (no PII)
 */

'use strict';

const crypto = require('crypto');
const { initSecrets } = require('./secrets');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { gzipSync } = require('zlib');

const {
    S3Client,
    PutObjectCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { Pool } = require('pg');

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

// CONFIG: только non-secret константы. Секреты читаются из process.env лениво
// в getPool/getS3/sendAlert ниже, так как initSecrets() (Lockbox overlay)
// выполняется ВНУТРИ handler, а CONFIG раньше захватывал значения при require
// модуля — до того как Lockbox-значения попадут в process.env.
const CONFIG = {
    s3Endpoint: process.env.S3_ENDPOINT || 'https://storage.yandexcloud.net',
    s3Region: 'ru-central1',
    s3Bucket: process.env.S3_BUCKET || 'heys-backups',
    s3Prefix: process.env.S3_PREFIX || 'client-daily',
    retentionDays: parseInt(process.env.RETENTION_DAYS || '365', 10),
};

// ═══════════════════════════════════════════════════════════════════
// PostgreSQL pool (own instance — longer timeouts for backup)
// ═══════════════════════════════════════════════════════════════════

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

let pool = null;

function getPool() {
    if (pool) return pool;

    const ca = loadCACert();
    pool = new Pool({
        host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
        port: parseInt(process.env.PG_PORT || '6432', 10),
        database: process.env.PG_DATABASE || 'heys_production',
        user: process.env.PG_USER || 'heys_admin',
        password: process.env.PG_PASSWORD,
        ssl: ca
            ? { rejectUnauthorized: true, ca }
            : { rejectUnauthorized: true },
        max: 2,
        idleTimeoutMillis: 15000,
        connectionTimeoutMillis: 10000,
        query_timeout: 30000,       // 30 s — large KV reads
        allowExitOnIdle: true,
    });

    pool.on('error', (err) => {
        console.error('[ClientBackup:Pool] idle error:', err.message);
    });

    return pool;
}

// ═══════════════════════════════════════════════════════════════════
// S3 client singleton
// ═══════════════════════════════════════════════════════════════════

let s3 = null;

function getS3() {
    if (s3) return s3;
    s3 = new S3Client({
        endpoint: CONFIG.s3Endpoint,
        region: CONFIG.s3Region,
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        },
    });
    return s3;
}

// ═══════════════════════════════════════════════════════════════════
// Telegram alerts (no PII)
// ═══════════════════════════════════════════════════════════════════

async function sendAlert(message, isError = true) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    const emoji = isError ? '🚨' : '✅';
    const text = `${emoji} *HEYS Client Backup*\n\n${message}`;

    try {
        const res = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: 'Markdown',
                }),
            },
        );
        if (!res.ok) console.warn('[ClientBackup:TG] send failed:', res.status);
    } catch (err) {
        console.error('[ClientBackup:TG] error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════════
// Business date helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute the HEYS "business date" that just ended.
 * HEYS day boundary = 03:00 Moscow time.
 * The function runs at 04:00 MSK → the business date is the calendar day
 * that contained the 03:00 boundary, i.e. current MSK date.
 * But if the function fires slightly before 03:00 MSK (edge case),
 * we subtract one day to be safe.
 */
function getBusinessDate() {
    // Current time in Moscow
    const now = new Date();
    const msk = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    const mskHour = msk.getHours();

    // If before 03:00 MSK, the just-ended HEYS day belongs to the previous calendar day
    if (mskHour < 3) {
        msk.setDate(msk.getDate() - 1);
    }

    const yyyy = msk.getFullYear();
    const mm = String(msk.getMonth() + 1).padStart(2, '0');
    const dd = String(msk.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// ═══════════════════════════════════════════════════════════════════
// Snapshot builder
// ═══════════════════════════════════════════════════════════════════

/**
 * Read all KV entries for a single client inside a REPEATABLE READ txn.
 * Returns { keyCount, kvSnapshot: { key: { v, v_encrypted, key_version, updated_at } } }
 */
async function snapshotClient(dbClient, clientId) {
    await dbClient.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    try {
        const { rows } = await dbClient.query(
            `SELECT k, v, v_encrypted, key_version, updated_at
         FROM client_kv_store
        WHERE client_id = $1
        ORDER BY k`,
            [clientId],
        );
        await dbClient.query('COMMIT');

        const kvSnapshot = {};
        for (const row of rows) {
            kvSnapshot[row.k] = {
                v: row.v,
                updated_at: row.updated_at,
            };
            // Preserve encrypted payload if present (binary → base64 for JSON)
            if (row.v_encrypted != null) {
                kvSnapshot[row.k].v_encrypted_b64 = row.v_encrypted.toString('base64');
                kvSnapshot[row.k].key_version = row.key_version;
            }
        }

        return { keyCount: rows.length, kvSnapshot };
    } catch (err) {
        await dbClient.query('ROLLBACK');
        throw err;
    }
}

/**
 * Read non-KV account tables for a single client.
 * Excludes security-sensitive fields (pin_hash, pin_salt, token_hash).
 * Runs inside a REPEATABLE READ txn for consistency.
 */
async function snapshotClientAccount(dbClient, clientId) {
    await dbClient.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    try {
        // clients — exclude pin_hash, pin_salt (auth secrets)
        const { rows: clientRows } = await dbClient.query(
            `SELECT id, curator_id, name, phone, phone_normalized,
                    pin_updated_at, pin_failed_attempts, pin_locked_until,
                    subscription_status, subscription_plan,
                    subscription_started_at, subscription_expires_at,
                    trial_started_at, trial_ends_at, updated_at
               FROM clients WHERE id = $1`,
            [clientId],
        );

        // consents
        const { rows: consentRows } = await dbClient.query(
            `SELECT id, client_id, consent_type, document_version,
                    granted, signature_method, ip_address, user_agent,
                    created_at, revoked_at
               FROM consents WHERE client_id = $1 ORDER BY created_at`,
            [clientId],
        );

        // subscriptions
        const { rows: subRows } = await dbClient.query(
            `SELECT id, client_id, trial_started_at, trial_ends_at,
                    active_until, canceled_at, created_at, updated_at
               FROM subscriptions WHERE client_id = $1`,
            [clientId],
        );

        // trial_queue
        const { rows: trialRows } = await dbClient.query(
            `SELECT id, client_id, curator_id, status,
                    queued_at, offer_sent_at, offer_expires_at,
                    assigned_at, canceled_at, source, priority,
                    notification_channel, created_at, updated_at
               FROM trial_queue WHERE client_id = $1`,
            [clientId],
        );

        // payments
        const { rows: paymentRows } = await dbClient.query(
            `SELECT id, client_id, external_payment_id, external_status,
                    payment_provider, amount, currency, plan,
                    period_start, period_end, status,
                    created_at, updated_at, metadata
               FROM payments WHERE client_id = $1 ORDER BY created_at`,
            [clientId],
        );

        await dbClient.query('COMMIT');

        return {
            client: clientRows[0] || null,
            consents: consentRows,
            subscriptions: subRows,
            trial_queue: trialRows,
            payments: paymentRows,
        };
    } catch (err) {
        await dbClient.query('ROLLBACK');
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════════
// S3 upload
// ═══════════════════════════════════════════════════════════════════

/**
 * Build the S3 object key.
 * Layout: <prefix>/YYYY-MM-DD/<clientId>.json.gz
 */
function objectKey(businessDate, clientId) {
    return `${CONFIG.s3Prefix}/${businessDate}/${clientId}.json.gz`;
}

async function uploadSnapshot(key, gzippedBuffer) {
    const cmd = new PutObjectCommand({
        Bucket: CONFIG.s3Bucket,
        Key: key,
        Body: gzippedBuffer,
        ContentType: 'application/gzip',
        StorageClass: 'COLD',
    });
    await getS3().send(cmd);
}

// ═══════════════════════════════════════════════════════════════════
// Cleanup (rotate objects older than RETENTION_DAYS)
// ═══════════════════════════════════════════════════════════════════

async function cleanupOldSnapshots() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CONFIG.retentionDays);

    const client = getS3();
    let continuationToken;
    let deleted = 0;

    do {
        const list = await client.send(
            new ListObjectsV2Command({
                Bucket: CONFIG.s3Bucket,
                Prefix: CONFIG.s3Prefix + '/',
                ContinuationToken: continuationToken,
            }),
        );

        if (!list.Contents || list.Contents.length === 0) break;

        // Collect keys older than cutoff
        const toDelete = list.Contents
            .filter((obj) => obj.LastModified < cutoff)
            .map((obj) => ({ Key: obj.Key }));

        if (toDelete.length > 0) {
            // DeleteObjects supports up to 1000 keys per call
            await client.send(
                new DeleteObjectsCommand({
                    Bucket: CONFIG.s3Bucket,
                    Delete: { Objects: toDelete, Quiet: true },
                }),
            );
            deleted += toDelete.length;
        }

        continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);

    return deleted;
}

// ═══════════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════════

module.exports.handler = async function handler(_event, _context) {
  await initSecrets();
    const startTime = Date.now();
    console.log('[ClientBackup] Starting daily client backup...');

    // ── Validate config ──────────────────────────────────────────────
    if (!process.env.PG_PASSWORD) {
        const msg = 'PG_PASSWORD not configured';
        console.error('[ClientBackup]', msg);
        await sendAlert(msg);
        return { statusCode: 500, body: JSON.stringify({ error: msg }) };
    }
    if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
        const msg = 'S3 credentials not configured';
        console.error('[ClientBackup]', msg);
        await sendAlert(msg);
        return { statusCode: 500, body: JSON.stringify({ error: msg }) };
    }

    const businessDate = getBusinessDate();
    console.log('[ClientBackup] Business date:', businessDate);

    const dbPool = getPool();
    let dbClient;

    // ── Fetch client list ────────────────────────────────────────────
    let clients;
    try {
        dbClient = await dbPool.connect();
        const { rows } = await dbClient.query(
            'SELECT id FROM clients ORDER BY id',
        );
        clients = rows.map((r) => r.id);
        console.log(`[ClientBackup] Found ${clients.length} client(s)`);
    } catch (err) {
        const msg = `Failed to list clients: ${err.message}`;
        console.error('[ClientBackup]', msg);
        await sendAlert(msg);
        return { statusCode: 500, body: JSON.stringify({ error: msg }) };
    } finally {
        if (dbClient) dbClient.release();
        dbClient = null;
    }

    if (clients.length === 0) {
        console.log('[ClientBackup] No clients found, skipping');
        return { statusCode: 200, body: JSON.stringify({ success: true, clients: 0 }) };
    }

    // ── Process each client ──────────────────────────────────────────
    const results = { total: clients.length, success: 0, failed: 0, errors: [] };

    for (const clientId of clients) {
        try {
            dbClient = await dbPool.connect();
            const { keyCount, kvSnapshot } = await snapshotClient(dbClient, clientId);

            // Snapshot non-KV account tables in a separate txn
            const accountData = await snapshotClientAccount(dbClient, clientId);
            dbClient.release();
            dbClient = null;

            if (keyCount === 0 && !accountData.client) {
                console.log(`[ClientBackup] ${clientId}: 0 keys, no account data, skipping`);
                results.success++;
                continue;
            }

            // Build JSON payload
            const snapshot = {
                schemaVersion: 2,
                source: 'server-daily-backup',
                exportedAt: new Date().toISOString(),
                businessDate,
                timezone: 'Europe/Moscow',
                dayBoundaryHour: 3,
                clientId,
                keyCount,
                kvSnapshot,
                accountData,
            };

            const jsonStr = JSON.stringify(snapshot);
            const checksum = crypto.createHash('sha256').update(jsonStr).digest('hex');
            snapshot.checksum = checksum;

            // Re-serialize with checksum included
            const finalJson = JSON.stringify(snapshot);
            const gzipped = gzipSync(Buffer.from(finalJson, 'utf8'), { level: 9 });

            const key = objectKey(businessDate, clientId);
            await uploadSnapshot(key, gzipped);

            console.log(
                `[ClientBackup] ${clientId}: ${keyCount} keys, ` +
                `${(gzipped.length / 1024).toFixed(1)} KB → s3://${CONFIG.s3Bucket}/${key}`,
            );
            results.success++;
        } catch (err) {
            if (dbClient) { dbClient.release(); dbClient = null; }
            console.error(`[ClientBackup] ${clientId}: FAILED —`, err.message);
            results.failed++;
            // Store truncated error without PII
            results.errors.push({
                clientId,
                error: err.message.slice(0, 120),
            });
            // Continue with next client — don't let one failure stop the batch
        }
    }

    // ── Cleanup old snapshots ────────────────────────────────────────
    let cleaned = 0;
    try {
        cleaned = await cleanupOldSnapshots();
        if (cleaned > 0) {
            console.log(`[ClientBackup] Cleaned up ${cleaned} old object(s)`);
        }
    } catch (err) {
        console.error('[ClientBackup] Cleanup error:', err.message);
    }

    // ── Summary ──────────────────────────────────────────────────────
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
    const summary = {
        success: true,
        businessDate,
        ...results,
        cleaned,
        durationSec,
        timestamp: new Date().toISOString(),
    };

    console.log('[ClientBackup] Done:', JSON.stringify(summary));

    // Alert on failures
    if (results.failed > 0) {
        await sendAlert(
            `Partial failure: ${results.failed}/${results.total} client(s) failed\n` +
            `Business date: ${businessDate}\n` +
            `Duration: ${durationSec}s\n` +
            `Errors: ${results.errors.map((e) => e.error).join('; ').slice(0, 300)}`,
        );
    }

    // Weekly success summary (Sundays)
    if (results.failed === 0 && new Date().getDay() === 0) {
        await sendAlert(
            `Weekly OK: ${results.success} client(s) backed up\n` +
            `Business date: ${businessDate}\n` +
            `Duration: ${durationSec}s\n` +
            `Old objects cleaned: ${cleaned}`,
            false,
        );
    }

    return { statusCode: 200, body: JSON.stringify(summary) };
};
