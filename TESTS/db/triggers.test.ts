/**
 * DB trigger automated tests.
 *
 * Покрывают server-side guards на public.client_kv_store:
 *  - trigger_audit_log (audit_logs row INSERT после I/U/D, с user_id capture
 *    + unmask'нутыми values, после 2026-05-30 миграций)
 *  - block_curator_write_if_locked (clients.curator_write_locked=true → block
 *    курaторских writes к этому client'у)
 *  - block_kv_under_restriction (clients.restriction_active=true → block ВСЕХ
 *    writes к client_kv_store этого client'a, 152-ФЗ compliance)
 *
 * Pattern: каждый test использует test client UUID (E2E-TestAlex 11111111-...),
 * вносит controlled change, проверяет результат, cleanup'ит за собой.
 * UPSERT'ы не транзакционные потому что нужен real trigger execution; вместо
 * этого explicit DELETE в конце.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { runSql, runSqlBlock, TEST_CLIENT_ALEX_ID } from './_helpers';

const TEST_KEY_PREFIX = 'heys_db_trigger_test_';
const TEST_USER_ID = '00000000-0000-0000-0000-000000099999'; // fake actor (not real curator)

function cleanup(testKeySuffix: string) {
    runSql(
        `DELETE FROM public.client_kv_store WHERE client_id='${TEST_CLIENT_ALEX_ID}'::uuid AND k='${TEST_KEY_PREFIX}${testKeySuffix}'`
    );
    // reset clients flags if they were set
    runSql(
        `UPDATE public.clients SET curator_write_locked=false, restriction_active=false WHERE id='${TEST_CLIENT_ALEX_ID}'::uuid`
    );
}

describe('DB trigger: trigger_audit_log (after 2026-05-30 unmask + user_id capture)', () => {
    afterEach(() => cleanup('audit'));

    it('writes audit_logs row on INSERT with full value (not [MASKED]) and actor user_id', () => {
        const sql = `
INSERT INTO public.client_kv_store (client_id, k, v, updated_at, user_id)
VALUES ('${TEST_CLIENT_ALEX_ID}'::uuid, '${TEST_KEY_PREFIX}audit',
        '{"test": "audit_insert_value"}'::jsonb, now(), '${TEST_USER_ID}'::uuid);
`;
        const ins = runSqlBlock(sql);
        expect(ins.success, ins.error).toBe(true);

        const audit = runSql(
            `SELECT user_id::text, new_values->>'v' AS new_v ` +
            `FROM public.audit_logs ` +
            `WHERE resource_type='client_kv_store' ` +
            `AND resource_id='${TEST_CLIENT_ALEX_ID}'::uuid ` +
            `AND (new_values->>'k')='${TEST_KEY_PREFIX}audit' ` +
            `ORDER BY created_at DESC LIMIT 1`
        );
        expect(audit.success, audit.error).toBe(true);
        expect(audit.output).toContain(TEST_USER_ID);
        expect(audit.output).toContain('audit_insert_value');
        expect(audit.output).not.toContain('[MASKED]');
    });

    it('writes audit_logs row on DELETE with old_values preserved', () => {
        // setup
        runSqlBlock(
            `INSERT INTO public.client_kv_store (client_id, k, v, updated_at, user_id) ` +
            `VALUES ('${TEST_CLIENT_ALEX_ID}'::uuid, '${TEST_KEY_PREFIX}audit', ` +
            `'{"v": "before_delete"}'::jsonb, now(), '${TEST_USER_ID}'::uuid);`
        );
        // delete
        runSqlBlock(
            `DELETE FROM public.client_kv_store WHERE client_id='${TEST_CLIENT_ALEX_ID}'::uuid ` +
            `AND k='${TEST_KEY_PREFIX}audit';`
        );

        const audit = runSql(
            `SELECT action, old_values->>'v' AS old_v ` +
            `FROM public.audit_logs ` +
            `WHERE resource_type='client_kv_store' ` +
            `AND resource_id='${TEST_CLIENT_ALEX_ID}'::uuid ` +
            `AND (old_values->>'k')='${TEST_KEY_PREFIX}audit' ` +
            `AND action='delete' ORDER BY created_at DESC LIMIT 1`
        );
        expect(audit.output).toContain('delete');
        expect(audit.output).toContain('before_delete');
    });
});

describe('DB trigger: block_curator_write_if_locked', () => {
    afterEach(() => cleanup('lock'));

    it('blocks курaторский write (user_id IS NOT NULL) when curator_write_locked=true', () => {
        // lock the client
        runSql(`UPDATE public.clients SET curator_write_locked=true WHERE id='${TEST_CLIENT_ALEX_ID}'::uuid`);

        // attempt курaторский write (user_id set)
        const result = runSqlBlock(
            `INSERT INTO public.client_kv_store (client_id, k, v, updated_at, user_id) ` +
            `VALUES ('${TEST_CLIENT_ALEX_ID}'::uuid, '${TEST_KEY_PREFIX}lock', ` +
            `'"x"'::jsonb, now(), '${TEST_USER_ID}'::uuid);`
        );

        expect(result.success, 'expected EXCEPTION but write succeeded').toBe(false);
        expect(result.error || '').toMatch(/curator_write_locked|insufficient_privilege/);
    });

    it('allows PIN write (user_id IS NULL) even when curator_write_locked=true', () => {
        runSql(`UPDATE public.clients SET curator_write_locked=true WHERE id='${TEST_CLIENT_ALEX_ID}'::uuid`);

        const result = runSqlBlock(
            `INSERT INTO public.client_kv_store (client_id, k, v, updated_at, user_id) ` +
            `VALUES ('${TEST_CLIENT_ALEX_ID}'::uuid, '${TEST_KEY_PREFIX}lock', ` +
            `'"x"'::jsonb, now(), NULL);`
        );

        expect(result.success, result.error).toBe(true);
    });

    it('allows курaторский write when curator_write_locked=false (default)', () => {
        runSql(`UPDATE public.clients SET curator_write_locked=false WHERE id='${TEST_CLIENT_ALEX_ID}'::uuid`);

        const result = runSqlBlock(
            `INSERT INTO public.client_kv_store (client_id, k, v, updated_at, user_id) ` +
            `VALUES ('${TEST_CLIENT_ALEX_ID}'::uuid, '${TEST_KEY_PREFIX}lock', ` +
            `'"x"'::jsonb, now(), '${TEST_USER_ID}'::uuid);`
        );

        expect(result.success, result.error).toBe(true);
    });
});

describe('DB trigger: block_kv_under_restriction (152-FZ compliance)', () => {
    afterEach(() => cleanup('restrict'));

    it('blocks ALL writes (both курaторский AND PIN) when restriction_active=true', () => {
        runSql(`UPDATE public.clients SET restriction_active=true WHERE id='${TEST_CLIENT_ALEX_ID}'::uuid`);

        // курaторский write
        const curator = runSqlBlock(
            `INSERT INTO public.client_kv_store (client_id, k, v, updated_at, user_id) ` +
            `VALUES ('${TEST_CLIENT_ALEX_ID}'::uuid, '${TEST_KEY_PREFIX}restrict', ` +
            `'"x"'::jsonb, now(), '${TEST_USER_ID}'::uuid);`
        );
        expect(curator.success).toBe(false);
        expect(curator.error || '').toMatch(/restriction|152-FZ|insufficient_privilege/);

        // PIN write
        const pin = runSqlBlock(
            `INSERT INTO public.client_kv_store (client_id, k, v, updated_at, user_id) ` +
            `VALUES ('${TEST_CLIENT_ALEX_ID}'::uuid, '${TEST_KEY_PREFIX}restrict', ` +
            `'"x"'::jsonb, now(), NULL);`
        );
        expect(pin.success).toBe(false);
        expect(pin.error || '').toMatch(/restriction|152-FZ|insufficient_privilege/);
    });
});
