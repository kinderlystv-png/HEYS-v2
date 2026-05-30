import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Cleanup baseline для e2e тестов.
 *
 * Captures стартовый timestamp + список dedicated test client UUIDs.
 * afterAll hook вызывает cleanupTestClients(baseline) → DELETE rows
 * which появились во время run.
 *
 * Safety invariants:
 *  - filtered by client_id IN (test_uuids) — нельзя удалить real client
 *  - filtered by updated_at > sinceISO — нельзя удалить pre-existing test data
 *  - non-fatal: cleanup failure не fail'ит test runs
 */
export type CleanupBaseline = {
    clientIds: string[];
    sinceISO: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const PSQL_SCRIPT = path.join(PROJECT_ROOT, 'scripts/db/psql.sh');

export function captureCleanupBaseline(clientIds: (string | undefined)[]): CleanupBaseline {
    const filtered = clientIds.filter((x): x is string => Boolean(x && x.trim()));
    return {
        clientIds: filtered,
        sinceISO: new Date().toISOString(),
    };
}

export function cleanupTestClients(baseline: CleanupBaseline): void {
    if (!baseline.clientIds.length) {
        console.warn('[test-cleanup] no clientIds in baseline — skipping');
        return;
    }
    const idsLiteral = baseline.clientIds.map((id) => `'${id}'::uuid`).join(', ');
    const sql =
        `DELETE FROM public.client_kv_store ` +
        `WHERE client_id IN (${idsLiteral}) AND updated_at > '${baseline.sinceISO}'::timestamptz`;
    try {
        const out = execSync(`bash ${PSQL_SCRIPT} -c "${sql}"`, {
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 30_000,
            encoding: 'utf8',
        });
        console.info('[test-cleanup] OK:', String(out || '').trim().split('\n').slice(-1)[0]);
    } catch (err) {
        // Non-fatal — test result still valid.
        console.warn('[test-cleanup] DELETE failed:', (err as Error).message);
    }
}
