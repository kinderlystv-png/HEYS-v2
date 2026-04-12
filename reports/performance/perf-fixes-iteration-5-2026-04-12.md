# Performance Fixes Iteration 5 (Progressive Meals Rendering)

- Date: 2026-04-12
- Scope: `apps/web/day/_meals.js`

## Implemented changes

1. Added progressive chunk rendering for long meals lists in `useMealsDisplay`.
   - Initial render shows first 8 meals.
   - Remaining meals mount in chunks of 6 via `requestIdleCallback` (or
     `setTimeout` fallback).
2. Keeps interaction path responsive on large days by shifting non-critical list
   mounts off immediate frame.

## Validation

- Rebuild: `pnpm bundle:legacy:auto --files=apps/web/day/_meals.js`
- Updated hashes:
  - `boot-calc.bundle.be5d65ce3feb.js`
  - `boot-day.bundle.4e7be4baa2d1.js`
- Browser verification:
  - `http://127.0.0.1:3001/boot-calc.bundle.be5d65ce3feb.js`
  - `http://127.0.0.1:3001/boot-day.bundle.4e7be4baa2d1.js`
- Audit:
  `reports/performance/multi-user-perf-audit-2026-04-12T18-11-09-044Z.json`

## Latest run snapshot

| User   | Login ms | Scenario ms | LCP ms |    CLS | INP ms | Long tasks | Slow interactions | Scroll jank % |
| ------ | -------: | ----------: | -----: | -----: | -----: | ---------: | ----------------: | ------------: |
| User A |    11357 |       24309 |  11128 | 0.3223 |    120 |         25 |                19 |           100 |
| User B |    10530 |       24915 |  10228 | 0.7324 |    128 |         30 |                19 |           100 |

## Notes

- This change is data-volume protective: worst-case mount cost now grows in
  deferred chunks instead of one synchronous burst.
- Scroll jank metric in current synthetic script is still saturated, so further
  work should target interaction mix and metric fidelity for real user paths.
