import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_CLIENT_ALEX_ID = '11111111-1111-1111-1111-111111111111';
const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const PSQL_SCRIPT = path.join(PROJECT_ROOT, 'scripts/db/psql.sh');

export type MorningFixture = {
    today: string;
    yesterday: string;
    anchor: string;
    progressKey: string;
    runId: string;
};

function localDateKey(offsetDays: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function sqlLiteral(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

function encodedJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('hex');
}

function upsertSql(clientId: string, key: string, value: unknown): string {
    return `
        INSERT INTO public.client_kv_store (client_id, k, v)
        VALUES (
            ${sqlLiteral(clientId)}::uuid,
            ${sqlLiteral(key)},
            convert_from(decode(${sqlLiteral(encodedJson(value))}, 'hex'), 'UTF8')::jsonb
        )
        ON CONFLICT (client_id, k) DO UPDATE SET v = EXCLUDED.v;`;
}

export function seedMorningCheckinFixture(clientId: string): MorningFixture {
    if (clientId !== TEST_CLIENT_ALEX_ID) {
        throw new Error(`[morning-fixture] refusing non-E2E client ${clientId}`);
    }
    const today = localDateKey(0);
    const yesterday = localDateKey(-1);
    const anchor = localDateKey(-2);
    const progressKey = `heys_morning_checkin_progress_v1_${today}`;
    const runId = `morning-e2e-${Date.now()}`;
    const profile = {
        firstName: 'E2E TestAlex', lastName: 'Test', gender: 'Женский', age: 30,
        height: 165, weight: 60, birthDate: '1995-01-01', birthDay: 1,
        birthMonth: 1, birthYear: 1995, profileCompleted: true, desktopAllowed: true,
        defaultTab: 'diary', stepsGoal: 10000, sleepHours: 8, baseWeight: 60,
        weightGoal: 60, subscriptionStatus: 'active', updatedAt: Date.now(), _e2eRunId: runId,
    };
    const anchorDay = {
        date: anchor,
        meals: [{ id: `${runId}-meal`, name: 'E2E anchor', items: [{
            id: `${runId}-item`, name: 'E2E fixture', grams: 100, kcal100: 2200,
            protein100: 100, carbs100: 100, fat100: 100,
        }] }],
        updatedAt: Date.now(), _e2eRunId: runId,
    };
    const emptyDay = (date: string) => ({ date, meals: [], updatedAt: Date.now(), _e2eRunId: runId });
    const sql = `BEGIN;
        ${upsertSql(clientId, 'heys_profile', profile)}
        ${upsertSql(clientId, `heys_dayv2_${anchor}`, anchorDay)}
        ${upsertSql(clientId, `heys_dayv2_${yesterday}`, emptyDay(yesterday))}
        ${upsertSql(clientId, `heys_dayv2_${today}`, emptyDay(today))}
        DELETE FROM public.client_kv_store
        WHERE client_id = ${sqlLiteral(clientId)}::uuid AND k = ${sqlLiteral(progressKey)};
        COMMIT;`;
    execFileSync('bash', [PSQL_SCRIPT, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
        encoding: 'utf8',
    });
    return { today, yesterday, anchor, progressKey, runId };
}
