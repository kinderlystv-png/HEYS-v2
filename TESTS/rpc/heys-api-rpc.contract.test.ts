/**
 * Phase 4 — RPC contract tests для heys-api-rpc.
 *
 * STATUS 2026-05-31: SCAFFOLD ONLY (skipped). Требует:
 *  1. Понимание API Gateway routing (curl manual showed 400 для missing fn,
 *     но `fetch()` через Node ловит 200 — гость может разные default headers
 *     или CORS-preflight behaviour). Нужен trace через actual app request
 *     pattern (см. apps/web/heys_yandex_api_v1.js:340+).
 *  2. PIN auth multi-step flow — нет single endpoint, multi-step pre-auth.
 *  3. ALLOWED_FUNCTIONS list дополнительно гейтится curator JWT vs session
 *     token логикой.
 *
 * Plan: ~/.claude/plans/cozy-hatching-minsky.md → Phase 4 (deferred).
 *
 * Manual smoke verify правильно:
 *   curl -X POST 'https://api.heyslab.ru/rpc' -d '{}'
 *     → 400 "Missing function name" ✅
 *   curl -X POST 'https://api.heyslab.ru/rpc?fn=getKV' -d '{}'
 *     → 403 если no auth, 200+row если auth headers OK
 */
import { describe, it } from 'vitest';

describe.skip('RPC contract: /rpc auth + whitelist gates [SCAFFOLD]', () => {
    it.skip('TODO: anon → 400 Missing fn (replicate curl behavior через fetch)', () => {});
    it.skip('TODO: unknown fn → 403', () => {});
    it.skip('TODO: PIN auth multi-step + authenticated getKV', () => {});
    it.skip('TODO: cross-client access → 403/empty', () => {});
});
