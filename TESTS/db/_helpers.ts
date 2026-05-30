import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Shared helpers для DB-level тестов.
 *
 * Все тесты идут через bash scripts/db/psql.sh — он подгружает PGPASSWORD из
 * Lockbox автоматически (см. scripts/db/get-pg-password.sh).
 *
 * Safety invariant: каждый тест с побочными эффектами должен быть обёрнут в
 * BEGIN; ... ROLLBACK; (см. runSqlTransactional). Если тест UPSERT'ит в
 * client_kv_store без транзакции — должен использовать test client UUIDs
 * (HEYS_TEST_E2E_CLIENT_*_ID) и иметь cleanup.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PSQL_SCRIPT = path.join(PROJECT_ROOT, 'scripts/db/psql.sh');

export const TEST_CLIENT_ALEX_ID = process.env.HEYS_TEST_E2E_CLIENT_ALEX_ID
    || '11111111-1111-1111-1111-111111111111';
export const TEST_CLIENT_POPL_ID = process.env.HEYS_TEST_E2E_CLIENT_POPL_ID
    || '22222222-2222-2222-2222-222222222222';

export type PsqlResult = {
    success: boolean;
    output: string;
    error?: string;
};

/**
 * Запускает SQL через `bash scripts/db/psql.sh -c "..."`. Возвращает stdout/stderr.
 * Single-line SQL preferred — для multi-line используй runSqlFile.
 */
export function runSql(sql: string): PsqlResult {
    const safe = sql.replace(/"/g, '\\"').replace(/\n+/g, ' ');
    try {
        const out = execSync(`bash ${PSQL_SCRIPT} -c "${safe}"`, {
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 30_000,
            encoding: 'utf8',
        });
        return { success: true, output: String(out || '') };
    } catch (err: any) {
        return {
            success: false,
            output: String(err.stdout || ''),
            error: String(err.stderr || err.message || ''),
        };
    }
}

/**
 * Запускает SQL через stdin (для multi-line / DO blocks). ROLLBACK-friendly.
 */
export function runSqlBlock(sql: string): PsqlResult {
    try {
        const out = execSync(`bash ${PSQL_SCRIPT} -v ON_ERROR_STOP=1`, {
            input: sql,
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 30_000,
            encoding: 'utf8',
        });
        return { success: true, output: String(out || '') };
    } catch (err: any) {
        return {
            success: false,
            output: String(err.stdout || ''),
            error: String(err.stderr || err.message || ''),
        };
    }
}

/**
 * Парсит вывод psql `\COPY ... TO STDOUT (FORMAT csv, HEADER false)` стиля
 * в массив строк. Простая реализация, достаточная для single-column queries.
 */
export function extractValues(result: PsqlResult): string[] {
    if (!result.success) return [];
    return result.output
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('-') && !l.includes('(') && !l.includes('|'))
        .map(l => l.replace(/^\s+|\s+$/g, ''));
}

/**
 * Verify что pg_proc.proname содержит указанную подстроку (для checking
 * что trigger function существует и имеет ожидаемый код).
 */
export function functionContains(funcName: string, needle: string): boolean {
    const r = runSql(`SELECT 1 FROM pg_proc WHERE proname='${funcName}' AND prosrc ILIKE '%${needle.replace(/'/g, "''")}%'`);
    return r.success && r.output.includes('(1 строка)');
}
