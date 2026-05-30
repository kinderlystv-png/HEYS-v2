import { defineConfig } from 'vitest/config';

/**
 * Vitest config для DB-level тестов (TESTS/db/*.test.ts).
 *
 * Эти тесты делают real connections к prod Yandex Postgres через
 * `bash scripts/db/psql.sh`. Запускаются on-demand (`pnpm test:db`),
 * НЕ в pre-commit / pre-push и НЕ в default `pnpm test`.
 *
 * Safety: тесты используют только dedicated E2E test clients
 * (heys_test_e2e_client_*_id env vars). Не трогают real users.
 */
export default defineConfig({
    test: {
        include: ['TESTS/db/**/*.test.ts'],
        environment: 'node',
        testTimeout: 30_000,
        hookTimeout: 30_000,
        // No parallel: тесты UPDATE'ят shared clients row (curator_write_locked,
        // restriction_active) — последовательный run исключает race conditions.
        pool: 'forks',
        poolOptions: { forks: { singleFork: true } },
    },
});
