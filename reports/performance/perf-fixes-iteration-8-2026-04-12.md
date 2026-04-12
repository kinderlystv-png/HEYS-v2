# Performance Fixes Iteration 8 (Windowed Meals Loading)

- Date: 2026-04-12
- Scope: `apps/web/day/_meals.js`

## Implemented changes

1. Switched from eager full auto-mount to windowed on-demand meals loading.
   - Keeps initial list at a limited slice (`INITIAL_VISIBLE_MEALS`).
   - Additional slices load when a bottom anchor enters viewport
     (IntersectionObserver).
2. Added explicit user fallback control for chunk expansion.
   - `Показать ещё (N)` button appends the next chunk if observer is unavailable
     or slow.

## Validation

- Rebuild: `pnpm bundle:legacy:auto --files=apps/web/day/_meals.js`
- Updated hashes:
  - `boot-calc.bundle.6da65172c9a9.js`
  - `boot-day.bundle.419507784ba3.js`
- Browser verification:
  - `http://127.0.0.1:3001/boot-calc.bundle.6da65172c9a9.js`
  - `http://127.0.0.1:3001/boot-day.bundle.419507784ba3.js`
- Audit:
  `reports/performance/multi-user-perf-audit-2026-04-12T18-29-08-734Z.json`

## Latest run snapshot

| User   | Login ms | Scenario ms | LCP ms |    CLS | INP ms | Long tasks | Slow interactions | Scroll jank % |
| ------ | -------: | ----------: | -----: | -----: | -----: | ---------: | ----------------: | ------------: |
| User A |    16185 |       24637 |  15896 | 0.3764 |    144 |         34 |                37 |           100 |
| User B |    10465 |       24889 |  10276 | 0.7337 |    112 |         28 |                 2 |           100 |

## Notes

- This is the first windowed behavior in meals list path and should cap
  immediate DOM growth under large datasets.
- Results still fluctuate run-to-run; more deterministic scroll-jank evidence
  likely requires scenario tuning to stress long-list scroll area directly.
