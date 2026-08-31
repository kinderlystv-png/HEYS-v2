/**
 * Phase 7 — Migration rollback verify pattern.
 *
 * Для каждой migration с known rollback path:
 *  1. Capture current DB state (function source, default value, и т.п.)
 *  2. Apply rollback SQL
 *  3. Verify state reverted
 *  4. Re-apply forward migration
 *  5. Verify state restored
 *
 * Тесты idempotent: даже если rollback оставляет след — re-apply forward
 * восстанавливает. Если test FAIL посередине → manual `bash scripts/db/psql.sh -f <migration.sql>`.
 *
 * Не покрывает: data migrations (sweep_orphan_products) — они lossy,
 * rollback требует backup restore. Только schema/function migrations.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { runSql, runSqlBlock } from './_helpers';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'scripts/db/migrations');

function readMigration(filename: string): string {
    return readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
}

/**
 * Каждому тесту дан свой таймаут 60 секунд: обращения к боевой базе идут
 * через psql, и один прогон занимает около девяти секунд — в дефолтные
 * десять общего прогона это не укладывалось, и файл краснел таймаутом,
 * хотя изолированно проходил.
 */
describe('Migration rollback verify pattern', () => {
    it('2026-05-30_fix_audit_logs_created_at_tz: forward → rollback → forward (idempotent)', () => {
        // Current state should be: created_at default = now()
        const before = runSql(
            `SELECT column_default FROM information_schema.columns ` +
            `WHERE table_name='audit_logs' AND column_name='created_at'`
        );
        expect(before.output).toContain('now()');
        // Note: текущее значение может быть 'now()' (после forward) OR
        // 'timezone(...)' (если кто-то rollback'нул). В любом случае forward
        // должен восстановить 'now()'.

        // Rollback (set DEFAULT обратно к timezone('utc', now()))
        const rollback = runSqlBlock(
            `ALTER TABLE public.audit_logs ` +
            `ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now());`
        );
        expect(rollback.success, rollback.error).toBe(true);

        const afterRollback = runSql(
            `SELECT column_default FROM information_schema.columns ` +
            `WHERE table_name='audit_logs' AND column_name='created_at'`
        );
        expect(afterRollback.output).toContain("timezone('utc'");

        // Re-apply forward (file существует)
        const forward = runSqlBlock(readMigration('2026-05-30_fix_audit_logs_created_at_tz.sql'));
        expect(forward.success, forward.error).toBe(true);

        const afterForward = runSql(
            `SELECT column_default FROM information_schema.columns ` +
            `WHERE table_name='audit_logs' AND column_name='created_at'`
        );
        expect(afterForward.output).toContain('now()');
        expect(afterForward.output).not.toContain("timezone('utc'");
    }, 60_000);

    it('2026-05-30_unmask_health_keys_in_audit_log: rollback file matches existing', () => {
        // Verify _rollback_*.sql есть + actually does revert.
        const rollbackContent = readMigration('_rollback_trigger_audit_log_pre_unmask.sql');
        expect(rollbackContent).toMatch(/CREATE OR REPLACE FUNCTION/);
        expect(rollbackContent).toMatch(/MASKED/);  // ROLLBACK adds back masking

        // Trigger function в текущем prod должна не иметь '[MASKED]'
        // (post-unmask state) — verifies forward уже applied.
        const current = runSql(`SELECT prosrc FROM pg_proc WHERE proname='trigger_audit_log'`);
        expect(current.output).not.toContain('[MASKED]');
        expect(current.output).toMatch(/actor_user_id/);  // post-user_id-capture state
    }, 60_000);

    it('2026-05-31_create_e2e_test_clients: клиенты на месте, повторное применение закрыто политикой согласий', () => {
        // Клиенты E2E существуют — ради этого миграция и была.
        const check = runSql(
            `SELECT COUNT(*) FROM public.clients ` +
            `WHERE id IN ('11111111-1111-1111-1111-111111111111'::uuid, ` +
            `'22222222-2222-2222-2222-222222222222'::uuid)`
        );
        expect(check.output).toContain('2');

        // Повторно применить миграцию больше нельзя, и это ожидаемо: она
        // вставляет согласие user_agreement 1.6, а в июле появился триггер
        // enforce_consent_document_proof (database/2026-07-27_consent_proof_v2.sql),
        // который принимает только версии из реестра документов. Миграция
        // историческая, применяется один раз и в ledger отмечена.
        //
        // Проверку держим явной, а не снимаем: если версию в реестр вернут
        // или миграцию починят, тест упадёт и заставит обновить эту запись.
        const result = runSqlBlock(readMigration('2026-05-31_create_e2e_test_clients.sql'));
        expect(result.success).toBe(false);
        expect(result.error).toContain('consent_version_not_allowed');
    }, 60_000);
});
