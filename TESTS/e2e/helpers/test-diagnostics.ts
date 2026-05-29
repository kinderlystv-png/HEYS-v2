/**
 * Diagnostic helpers для e2e suite курaторского pollution test'a.
 *
 * 5 слоёв:
 *   (A) Badge dump capture — программно generates тот же огромный sync state
 *       dump что генерирует тап на бэйдже синка в шапке (heys_app_shell_v1.js).
 *       Включает write history, event history, pending queue, cloud flags,
 *       saveClientKey history, cascade/ews counters, LS scan и т.д.
 *   (B) Console log capture — page.on('console') listener filtered по [HEYS.*]
 *       и обычным warn/error. Возвращает array messages с timestamps.
 *   (C) DB cross-check — запускает psql.sh с targeted query и attach'ит результат.
 *       Самое надёжное assertion: ground truth из облака после switch'а.
 *   (D) LS snapshots с full key listing + computed diff между точками теста.
 *   (E) Sync queue monitor — periodic snapshot cloud._pendingClientQueue
 *       + inflight + uploads в виде timeline.
 *
 * Все 5 attach'аются к TestInfo через testInfo.attach() — в HTML report
 * появляются как файлы рядом с failed test. Quick post-mortem без replay'a.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Page, type TestInfo } from '@playwright/test';

// ESM-safe __dirname replacement (проект имеет "type": "module").
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// (A) Badge dump capture
// ============================================================================

/**
 * Программно triggers тот же путь что click на sync badge в шапке —
 * читает все sync state variables (cloud._writeHistory, cloud._saveClientKeyHistory,
 * pending queue, hot-sync applies, etc.) и форматирует как text dump.
 *
 * Возвращает text identical to clipboard text который user'у appears когда
 * он тапает badge в шапке (heys_app_shell_v1.js syncBadge click handler).
 *
 * Fallback: если структуры не initialized (early in load), returns partial dump
 * с маркером "instrumentation not yet ready".
 */
export async function captureBadgeDump(page: Page): Promise<string> {
    return page.evaluate(() => {
        const w = window as typeof window & { HEYS?: any };
        const lines: string[] = [];
        const ts = new Date().toISOString();
        lines.push(`=== HEYS Sync Debug Snapshot @ ${ts} (e2e capture) ===`);

        try {
            const cloud = w.HEYS?.cloud;
            if (!cloud) {
                lines.push('cloud: <not initialized>');
                return lines.join('\n');
            }

            // Cloud flags + identity
            lines.push('');
            lines.push('=== Cloud flags ===');
            lines.push(`  _curatorSession: ${cloud._curatorSession}`);
            lines.push(`  _switchClientInProgress: ${cloud._switchClientInProgress}`);
            lines.push(`  _rpcOnlyMode: ${cloud._rpcOnlyMode}`);
            lines.push(`  _syncCompletedAt: ${cloud._syncCompletedAt}`);
            lines.push(`  currentClientId: ${w.HEYS?.currentClientId || '<none>'}`);
            lines.push(`  _pinAuthClientId: ${cloud._pinAuthClientId || '<none>'}`);
            lines.push(`  _lastClientSync: ${JSON.stringify(cloud._lastClientSync)}`);

            // Pending queue
            try {
                const pendingQueue = (typeof cloud.getClientQueueRaw === 'function')
                    ? cloud.getClientQueueRaw()
                    : (cloud._pendingClientQueue || []);
                lines.push('');
                lines.push('=== Pending Queue ===');
                lines.push(`  length: ${Array.isArray(pendingQueue) ? pendingQueue.length : 'n/a'}`);
                if (Array.isArray(pendingQueue) && pendingQueue.length > 0) {
                    pendingQueue.slice(0, 30).forEach((item: any, i: number) => {
                        const bytes = item?.v ? JSON.stringify(item.v).length : '?';
                        lines.push(`  [${i}] client=${(item?.client_id || '').slice(0, 8)} k=${item?.k} bytes=${bytes}`);
                    });
                }
            } catch (_) { /* noop */ }

            // Write history (last 50)
            try {
                const wh = cloud._writeHistory;
                if (Array.isArray(wh)) {
                    const now = Date.now();
                    const recent = wh.filter((w: any) => (now - w.ts) < 60000);
                    const perKey: Record<string, number> = {};
                    recent.forEach((w: any) => { perKey[w.k] = (perKey[w.k] || 0) + 1; });
                    const hot = Object.entries(perKey).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
                    lines.push('');
                    lines.push(`=== Write history (total ${wh.length}, recent60s ${recent.length}) ===`);
                    if (hot.length > 0) lines.push(`  HOT (>=3 in 60s): ${hot.map(([k, n]) => `${k}=${n}`).join(', ')}`);
                    wh.slice(-30).forEach((w: any) => {
                        lines.push(`  ${String(now - w.ts).padStart(6)}ms | ${w.k}`);
                    });
                }
            } catch (_) { /* noop */ }

            // saveClientKey history (with caller chain — крутится через нашу instrumentation)
            try {
                const sckh = cloud._saveClientKeyHistory;
                if (Array.isArray(sckh)) {
                    const now = Date.now();
                    const recent = sckh.filter((w: any) => (now - w.ts) < 60000);
                    const perKey: Record<string, number> = {};
                    recent.forEach((w: any) => { perKey[w.k] = (perKey[w.k] || 0) + 1; });
                    const hot = Object.entries(perKey).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
                    lines.push('');
                    lines.push(`=== saveClientKey history (total ${sckh.length}, recent60s ${recent.length}) ===`);
                    if (hot.length > 0) lines.push(`  HOT (>=3 in 60s): ${hot.map(([k, n]) => `${k}=${n}`).join(', ')}`);
                    sckh.slice(-30).forEach((w: any) => {
                        const callers = Array.isArray(w.callers)
                            ? w.callers.slice(0, 3).map((c: string) => String(c).replace(/^at\s+/, '').slice(0, 60)).join(' ← ')
                            : '—';
                        lines.push(
                            `  ${String(now - w.ts).padStart(6)}ms | client=${String(w.client_id || '').slice(0, 8)} | ` +
                            `k=${w.k} bytes=${w.bytes} updatedAt=${w.updatedAt} | ${callers}`
                        );
                    });
                }
            } catch (_) { /* noop */ }

            // Foreground hot-sync history (last 5 batches)
            try {
                const hsa = w.HEYS?._hotsyncApplies;
                if (Array.isArray(hsa)) {
                    const now = Date.now();
                    lines.push('');
                    lines.push(`=== Hot-sync applies (total ${hsa.length}) ===`);
                    hsa.slice(-20).forEach((h: any) => {
                        lines.push(`  ${String(now - h.ts).padStart(6)}ms | client=${(h.clientId || '').slice(0, 8)} | ${h.baseKey} (${h.bytes}b, source=${h.source})`);
                    });
                }
            } catch (_) { /* noop */ }

            // LS scan (size by prefix)
            try {
                const buckets: Record<string, number> = {};
                let keyCount = 0;
                let totalKb = 0;
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (!k) continue;
                    keyCount++;
                    const v = localStorage.getItem(k) || '';
                    const kb = Math.round(v.length / 1024);
                    totalKb += kb;
                    const m = k.match(/^(heys_[0-9a-f-]{8,36})/);
                    const prefix = m ? m[1].slice(0, 20) : (k.match(/^(heys_[a-z_]+)/i)?.[1] || '(other)');
                    buckets[prefix] = (buckets[prefix] || 0) + kb;
                }
                lines.push('');
                lines.push(`=== LocalStorage scan (${keyCount} keys, ~${totalKb}KB) ===`);
                Object.entries(buckets)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .forEach(([k, kb]) => lines.push(`  ${k}: ${kb}KB`));
            } catch (_) { /* noop */ }

            // Cascade/EWS compute frequency
            try {
                const cs = w.HEYS?._cascadeStats;
                if (cs) {
                    const now = Date.now();
                    const last30s = (cs.recent || []).filter((r: any) => (now - r.ts) < 30000).length;
                    lines.push('');
                    lines.push(`=== Cascade compute: total=${cs.count} last30s=${last30s} ===`);
                }
                const es = w.HEYS?._ewsStats;
                if (es) {
                    const now = Date.now();
                    const last30s = (es.recent || []).filter((r: any) => (now - r.ts) < 30000).length;
                    lines.push(`=== EWS compute: total=${es.count} last30s=${last30s} ===`);
                }
            } catch (_) { /* noop */ }

            // LSSET dayv2 dedup (anti-loop counter)
            try {
                const ds = w.__heysLsSetDayv2Dedup;
                if (ds) {
                    const now = Date.now();
                    const last30s = ds.suppressed.filter((s: any) => (now - s.ts) < 30000).length;
                    lines.push('');
                    lines.push(`=== LSSET dayv2 dedup: totalSuppressed=${ds.totalSuppressed} last30s=${last30s} ===`);
                }
            } catch (_) { /* noop */ }

        } catch (err) {
            lines.push(`(dump capture failed: ${err instanceof Error ? err.message : String(err)})`);
        }

        return lines.join('\n');
    });
}

// ============================================================================
// (B) Console log capture
// ============================================================================

type ConsoleEntry = { ts: number; type: string; text: string };

export function setupConsoleCapture(page: Page): { getMessages: () => ConsoleEntry[]; format: () => string } {
    const entries: ConsoleEntry[] = [];
    const interesting = /\[HEYS\.|⚠️|❌|🔄|LSSET|SHRINK|STALE|pollution|switch|reload/i;

    page.on('console', (msg) => {
        const text = msg.text();
        // Always capture warn/error; for log/info — only if matches interesting pattern.
        const type = msg.type();
        if (type === 'warning' || type === 'error') {
            entries.push({ ts: Date.now(), type, text });
        } else if (interesting.test(text)) {
            entries.push({ ts: Date.now(), type, text });
        }
    });

    page.on('pageerror', (err) => {
        entries.push({ ts: Date.now(), type: 'pageerror', text: err.message });
    });

    return {
        getMessages: () => entries,
        format: () => {
            if (entries.length === 0) return '(no captured console messages)';
            const t0 = entries[0].ts;
            return entries
                .map((e) => `+${String(e.ts - t0).padStart(7)}ms [${e.type}] ${e.text}`)
                .join('\n');
        },
    };
}

// ============================================================================
// (C) DB cross-check
// ============================================================================

const ROOT_DIR = path.resolve(__dirname, '../../..');
const PSQL_SCRIPT = path.join(ROOT_DIR, 'scripts/db/psql.sh');

export type DbCrossCheckResult = {
    success: boolean;
    output: string;
    rowCount?: number;
    error?: string;
};

/**
 * Запускает psql.sh с произвольным SQL query.
 * Используется для ground-truth verification после switch'a — мы видим что
 * РЕАЛЬНО лежит в client_kv_store для каждого клиента.
 */
export function dbQuery(sql: string, timeoutMs = 30_000): DbCrossCheckResult {
    try {
        const output = execFileSync('bash', [PSQL_SCRIPT, '-c', sql], {
            encoding: 'utf8',
            timeout: timeoutMs,
            maxBuffer: 10 * 1024 * 1024,
        });
        const rowMatch = output.match(/\((\d+) (rows?|строк[аи]?)\)/);
        const rowCount = rowMatch ? parseInt(rowMatch[1], 10) : undefined;
        return { success: true, output, rowCount };
    } catch (err) {
        return {
            success: false,
            output: '',
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * Targeted query: recent writes для клиента за last N seconds.
 * Используется для detection cross-client pollution: если после switch'а
 * на клиента Б появляются writes которые **только что** не должны были быть
 * (например, сразу после switch какой-то ключ из старого клиента mysteriously
 * появляется в новом) — это pollution.
 */
export function dbRecentWrites(clientUuid: string, secondsAgo = 60): DbCrossCheckResult {
    return dbQuery(`
        SELECT k, updated_at, LENGTH(v::text) as bytes
        FROM public.client_kv_store
        WHERE client_id = '${clientUuid}'::uuid
          AND updated_at > NOW() - INTERVAL '${secondsAgo} seconds'
        ORDER BY updated_at DESC
        LIMIT 50;
    `);
}

/**
 * Ищет клиента по имени и возвращает его UUID.
 */
export function dbClientIdByName(name: string): string | null {
    const escaped = name.replace(/'/g, "''");
    const result = dbQuery(`SELECT id FROM public.clients WHERE name = '${escaped}' LIMIT 1;`);
    if (!result.success) return null;
    // Parse first non-header line из psql output
    const lines = result.output.split('\n');
    // UUID strict format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (psql output rows
    // могут содержать row separator из дефисов, поэтому не [0-9a-f-]{36}).
    const UUID_RE = /^\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
    for (const line of lines) {
        const m = line.match(UUID_RE);
        if (m) return m[1];
    }
    return null;
}

// ============================================================================
// (D) LS snapshot with full key listing
// ============================================================================

export type LsSnapshot = {
    timestamp: number;
    currentClientId: string | null;
    pinAuthClient: string | null;
    keyCount: number;
    totalBytes: number;
    unscopedLegacyKeys: string[];
    scopedProfileBytes: number;
    scopedDayv2Count: number;
    /** Все ключи с size — для diff'а между snapshots. */
    allKeys: Array<{ k: string; bytes: number }>;
};

export async function captureFullLsSnapshot(page: Page): Promise<LsSnapshot> {
    return page.evaluate(() => {
        const w = window as typeof window & { HEYS?: any };
        const currentClientId = w.HEYS?.currentClientId || null;
        const legacy = [
            /^heys_profile$/,
            /^heys_dayv2_\d{4}-\d{2}-\d{2}$/,
            /^heys_ews_(snapshot|trends_v1|weekly_v1)$/,
            /^heys_ceb_v1$/,
            /^heys_ceb_d_\d{4}-\d{2}-\d{2}$/,
            /^heys_meal_gaps_history$/,
            /^heys_cascade_dcs_v\d+$/,
            /^heys_grams_history$/,
            /^heys_norms$/,
        ];
        const unscopedLegacyKeys: string[] = [];
        const allKeys: Array<{ k: string; bytes: number }> = [];
        let totalBytes = 0;
        let scopedDayv2Count = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            const v = localStorage.getItem(k) || '';
            const bytes = v.length;
            totalBytes += bytes;
            allKeys.push({ k, bytes });
            if (legacy.some((r) => r.test(k))) unscopedLegacyKeys.push(k);
            if (currentClientId && k.includes(`_${currentClientId}_dayv2_`)) scopedDayv2Count++;
        }
        let scopedProfileBytes = 0;
        if (currentClientId) {
            const raw = localStorage.getItem(`heys_${currentClientId}_profile`);
            scopedProfileBytes = raw ? raw.length : 0;
        }
        return {
            timestamp: Date.now(),
            currentClientId,
            pinAuthClient: localStorage.getItem('heys_pin_auth_client'),
            keyCount: allKeys.length,
            totalBytes,
            unscopedLegacyKeys,
            scopedProfileBytes,
            scopedDayv2Count,
            allKeys,
        };
    });
}

export function diffLsSnapshots(before: LsSnapshot, after: LsSnapshot): string {
    const beforeMap = new Map(before.allKeys.map((k) => [k.k, k.bytes]));
    const afterMap = new Map(after.allKeys.map((k) => [k.k, k.bytes]));
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    for (const [k, bytes] of afterMap) {
        if (!beforeMap.has(k)) added.push(`+ ${k} (${bytes}b)`);
        else if (beforeMap.get(k) !== bytes) changed.push(`~ ${k} (${beforeMap.get(k)}b → ${bytes}b)`);
    }
    for (const [k, bytes] of beforeMap) {
        if (!afterMap.has(k)) removed.push(`- ${k} (was ${bytes}b)`);
    }
    const lines = [
        `=== LS Diff ===`,
        `Before: client=${before.currentClientId} keys=${before.keyCount} (${Math.round(before.totalBytes / 1024)}KB) legacy=${before.unscopedLegacyKeys.length}`,
        `After:  client=${after.currentClientId} keys=${after.keyCount} (${Math.round(after.totalBytes / 1024)}KB) legacy=${after.unscopedLegacyKeys.length}`,
        ``,
        `Added (${added.length}):`,
        ...added.slice(0, 30),
        added.length > 30 ? `  ... +${added.length - 30} more` : '',
        ``,
        `Removed (${removed.length}):`,
        ...removed.slice(0, 30),
        removed.length > 30 ? `  ... +${removed.length - 30} more` : '',
        ``,
        `Changed (${changed.length}):`,
        ...changed.slice(0, 30),
        changed.length > 30 ? `  ... +${changed.length - 30} more` : '',
    ].filter(Boolean);
    return lines.join('\n');
}

// ============================================================================
// (E) Sync queue monitor — periodic timeline
// ============================================================================

type QueueSnapshot = { ts: number; pending: number; inflight: number; uploading: boolean };

export type SyncQueueMonitor = {
    stop: () => QueueSnapshot[];
    /** Format как human-readable timeline. */
    formatTimeline: () => string;
};

export function startSyncQueueMonitor(page: Page, intervalMs = 500): SyncQueueMonitor {
    const snapshots: QueueSnapshot[] = [];
    let stopped = false;

    const tick = async () => {
        if (stopped) return;
        try {
            const snap = await page.evaluate(() => {
                const w = window as typeof window & { HEYS?: any };
                const cloud = w.HEYS?.cloud;
                const pending = cloud?.getPendingCount?.() ?? 0;
                const queue = (typeof cloud?.getClientQueueRaw === 'function') ? cloud.getClientQueueRaw() : (cloud?._pendingClientQueue || []);
                const inflight = Array.isArray(queue) ? queue.length : 0;
                const uploading = Boolean(cloud?._uploadInProgress);
                return { ts: Date.now(), pending, inflight, uploading };
            });
            snapshots.push(snap);
        } catch (_) { /* page navigation in progress, skip */ }
        if (!stopped) setTimeout(tick, intervalMs);
    };
    tick();

    return {
        stop: () => {
            stopped = true;
            return snapshots;
        },
        formatTimeline: () => {
            if (snapshots.length === 0) return '(no snapshots — monitor was not running)';
            const t0 = snapshots[0].ts;
            const lines = [`=== Sync Queue Timeline (every ${intervalMs}ms) ===`];
            snapshots.forEach((s) => {
                const flag = s.uploading ? '⬆️' : '  ';
                lines.push(`  ${flag} +${String(s.ts - t0).padStart(7)}ms | pending=${s.pending} inflight=${s.inflight}`);
            });
            return lines.join('\n');
        },
    };
}

// ============================================================================
// Convenience: attach all diagnostics в TestInfo report
// ============================================================================

export async function attachDiagnostics(
    testInfo: TestInfo,
    label: string,
    data: {
        badgeDump?: string;
        lsSnapshot?: LsSnapshot;
        lsDiff?: string;
        consoleLog?: string;
        syncTimeline?: string;
        dbResult?: DbCrossCheckResult;
    }
): Promise<void> {
    const prefix = `${label}-`;
    if (data.badgeDump) {
        await testInfo.attach(`${prefix}badge-dump.txt`, { body: data.badgeDump, contentType: 'text/plain' });
    }
    if (data.lsSnapshot) {
        await testInfo.attach(`${prefix}ls-snapshot.json`, {
            body: JSON.stringify(data.lsSnapshot, null, 2),
            contentType: 'application/json',
        });
    }
    if (data.lsDiff) {
        await testInfo.attach(`${prefix}ls-diff.txt`, { body: data.lsDiff, contentType: 'text/plain' });
    }
    if (data.consoleLog) {
        await testInfo.attach(`${prefix}console.txt`, { body: data.consoleLog, contentType: 'text/plain' });
    }
    if (data.syncTimeline) {
        await testInfo.attach(`${prefix}sync-timeline.txt`, { body: data.syncTimeline, contentType: 'text/plain' });
    }
    if (data.dbResult) {
        await testInfo.attach(`${prefix}db-check.txt`, {
            body: data.dbResult.success
                ? data.dbResult.output
                : `DB check failed: ${data.dbResult.error}`,
            contentType: 'text/plain',
        });
    }
}
