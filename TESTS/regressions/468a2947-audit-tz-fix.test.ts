/**
 * Regression test для commit 468a2947.
 *
 * Bug: `audit_logs.created_at` имел default `timezone('utc', now())` который
 * возвращает naive timestamp. При вставке в TIMESTAMPTZ Postgres интерпретировал
 * его как server TZ (MSK +03) → stored UTC value off by 3h.
 *
 * Fix: `ALTER TABLE public.audit_logs ALTER COLUMN created_at SET DEFAULT now()`.
 *
 * Test verifies через DB: текущий column_default корректный.
 */
import { describe, it, expect } from 'vitest';
import { runSql } from '../db/_helpers';

describe('Regression 468a2947: audit_logs.created_at TZ fix', () => {
    it('column_default должен быть `now()` (не timezone wrapper)', () => {
        const result = runSql(
            `SELECT column_default FROM information_schema.columns ` +
            `WHERE table_name='audit_logs' AND column_name='created_at'`
        );
        expect(result.success, result.error).toBe(true);
        expect(result.output).toContain('now()');
        // Bug pattern не должен присутствовать
        expect(result.output).not.toContain("timezone('utc'");
    });
});
