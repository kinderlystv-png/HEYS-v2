# Regression Tests — per-incident coverage

Each закрытое incident получает dedicated test file который **fail'ит если bug re-introduced**. Progressive coverage built organically на каждый PR fixing bug.

## Convention

- File naming: `<commit-hash>-<short-desc>.test.ts` (e.g. `fc1ce544-curator-pollution.test.ts`)
- Test scope: только что fix актуально, не повторять existing coverage
- Length: ≤80 строк per file, focused assertion
- Runtime: <30s per test, <2min full suite

## Catalogue

| Commit | Date | Incident | Test file | Class |
|---|---|---|---|---|
| `b30796f6` | 2026-05-30 | `_runForegroundHotKeySyncLegacy` missing `reason` param → `ReferenceError` каждые 30с | `b30796f6-sync-reference-error.test.ts` | unit |
| `7fb8be2f` | 2026-05-30 | ews/lipolysis/meal-gaps писали unscoped → pollution на курaторском switch | `7fb8be2f-anti-pollution-scoping.test.ts` | unit |
| `468a2947` | 2026-05-30 | `audit_logs.created_at` default off by 3h (timezone naive coerced to server TZ) | `468a2947-audit-tz-fix.test.ts` | DB |
| `0afdc86a` | 2026-05-30 | `trigger_audit_log` писал `user_id=null` игнорируя `NEW.user_id` | (covered by `TESTS/db/triggers.test.ts`) | DB |
| `fc1ce544` | 2026-05-29 | Курaторский switch leak'ал `heys_profile` под нового client'a | (covered by `TESTS/e2e/curator-switch-pollution.spec.ts`) | e2e |

## Adding

1. Создай `<short-hash>-<desc>.test.ts` в этой папке
2. Шаблон:
   ```ts
   import { describe, it, expect } from 'vitest';
   describe('Regression <hash>: <description>', () => {
     it('should not <buggy behavior>', () => {
       // setup reproducing original conditions
       // assert correct behavior
     });
   });
   ```
3. Обнови catalogue выше
4. Verify: deliberately break fix (comment one line) → test fails. Revert.

## Convention reminder для PR

CLAUDE.md правило: bug fix PR должен включать regression test когда возможно. Если test не написан — TODO в PR description с reason.
