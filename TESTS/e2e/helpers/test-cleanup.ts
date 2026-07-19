import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Exact snapshot/restore for dedicated E2E clients.
 *
 * The old timestamp cleanup deleted every row changed by a test. That also
 * deleted pre-existing fixture rows (notably `heys_profile`) after a weight
 * step updated them. The replacement restores the complete KV snapshot and
 * removes only rows created under an allow-listed E2E client during the run.
 */
export type CleanupBaseline = {
    clientIds: string[];
    sinceISO: string;
    snapshots: Record<string, string[]>;
    snapshotOk: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const PSQL_SCRIPT = path.join(PROJECT_ROOT, 'scripts/db/psql.sh');
const ALLOWED_E2E_CLIENT_IDS = new Set([
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
]);

function assertAllowedClientId(clientId: string): void {
    if (!ALLOWED_E2E_CLIENT_IDS.has(clientId)) {
        throw new Error(`[test-cleanup] refusing non-E2E client ${clientId}`);
    }
}

function sqlLiteral(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

function runSql(args: string[]): string {
    return execFileSync('bash', [PSQL_SCRIPT, ...args], {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
        encoding: 'utf8',
    });
}

function captureClientRows(clientId: string): string[] {
    const sql = `
        SELECT encode(convert_to(jsonb_build_object(
            'user_id', user_id,
            'client_id', client_id,
            'k', k,
            'v', v,
            'key_version', key_version,
            'v_encrypted_hex', CASE WHEN v_encrypted IS NULL THEN NULL ELSE encode(v_encrypted, 'hex') END
        )::text, 'UTF8'), 'hex')
        FROM public.client_kv_store
        WHERE client_id = ${sqlLiteral(clientId)}::uuid
        ORDER BY k`;
    return runSql(['-At', '-c', sql]).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function captureCleanupBaseline(clientIds: (string | undefined)[]): CleanupBaseline {
    const filtered = Array.from(new Set(clientIds.filter((x): x is string => Boolean(x && x.trim()))));
    filtered.forEach(assertAllowedClientId);
    const baseline: CleanupBaseline = {
        clientIds: filtered,
        sinceISO: new Date().toISOString(),
        snapshots: {},
        snapshotOk: true,
    };
    try {
        filtered.forEach((clientId) => {
            baseline.snapshots[clientId] = captureClientRows(clientId);
        });
    } catch (error) {
        baseline.snapshotOk = false;
        console.warn('[test-cleanup] snapshot failed; destructive cleanup disabled:', (error as Error).message);
    }
    return baseline;
}

function restoreClientSnapshot(clientId: string, rows: string[]): void {
    assertAllowedClientId(clientId);
    const baselineKeys = rows.map((hex) => {
        const parsed = JSON.parse(Buffer.from(hex, 'hex').toString('utf8')) as { k: string };
        return parsed.k;
    });
    const deleteExtras = baselineKeys.length
        ? `DELETE FROM public.client_kv_store WHERE client_id = ${sqlLiteral(clientId)}::uuid AND k <> ALL(ARRAY[${baselineKeys.map(sqlLiteral).join(', ')}]::text[]);`
        : `DELETE FROM public.client_kv_store WHERE client_id = ${sqlLiteral(clientId)}::uuid;`;
    const restores = rows.map((hex) => `
        WITH payload AS (
            SELECT convert_from(decode(${sqlLiteral(hex)}, 'hex'), 'UTF8')::jsonb AS j
        )
        INSERT INTO public.client_kv_store (user_id, client_id, k, v, key_version, v_encrypted)
        SELECT
            NULLIF(j->>'user_id', '')::uuid,
            (j->>'client_id')::uuid,
            j->>'k',
            j->'v',
            NULLIF(j->>'key_version', '')::smallint,
            CASE WHEN j->>'v_encrypted_hex' IS NULL THEN NULL ELSE decode(j->>'v_encrypted_hex', 'hex') END
        FROM payload
        ON CONFLICT (client_id, k) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            v = EXCLUDED.v,
            key_version = EXCLUDED.key_version,
            v_encrypted = EXCLUDED.v_encrypted;`).join('\n');
    runSql(['-v', 'ON_ERROR_STOP=1', '-c', `BEGIN; ${deleteExtras} ${restores} COMMIT;`]);
}

export function cleanupTestClients(baseline: CleanupBaseline): void {
    if (!baseline.clientIds.length) {
        console.warn('[test-cleanup] no clientIds in baseline — skipping');
        return;
    }
    if (!baseline.snapshotOk) {
        console.warn('[test-cleanup] no complete snapshot — refusing cleanup');
        return;
    }
    try {
        baseline.clientIds.forEach((clientId) => restoreClientSnapshot(clientId, baseline.snapshots[clientId] || []));
        console.info(`[test-cleanup] restored exact snapshots for ${baseline.clientIds.length} E2E client(s)`);
    } catch (error) {
        console.warn('[test-cleanup] restore failed:', (error as Error).message);
    }
}
