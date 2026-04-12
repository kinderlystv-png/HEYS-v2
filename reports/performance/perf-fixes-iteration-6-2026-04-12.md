# Performance Fixes Iteration 6 (Meal Stale Check Fast Path)

- Date: 2026-04-12
- Scope: `apps/web/day/_meals.js`

## Implemented changes

1. Optimized stale-meal checks for render path.
   - Replaced per-call Date object pair creation with minute-based math.
   - Added optional `nowMinutes` parameter to reuse one current-time snapshot
     across list render.
2. `renderMealsList` now computes `nowMinutes` once and reuses it for
   current-meal labeling.

## Validation

- Rebuild: `pnpm bundle:legacy:auto --files=apps/web/day/_meals.js`
- Updated hashes:
  - `boot-calc.bundle.70281f2179a2.js`
  - `boot-day.bundle.1eb290b73b3d.js`
- Browser verification:
  - `http://127.0.0.1:3001/boot-calc.bundle.70281f2179a2.js`
  - `http://127.0.0.1:3001/boot-day.bundle.1eb290b73b3d.js`
- Audit:
  `reports/performance/multi-user-perf-audit-2026-04-12T18-16-40-752Z.json`

## Latest run snapshot

| User   | Login ms | Scenario ms | LCP ms |    CLS | INP ms | Long tasks | Slow interactions | Scroll jank % |
| ------ | -------: | ----------: | -----: | -----: | -----: | ---------: | ----------------: | ------------: |
| User A |    12354 |       24301 |  12124 | 0.3189 |    120 |         26 |                19 |           100 |
| User B |    10206 |       24955 |  10024 | 0.3567 |    136 |         26 |                19 |           100 |

## Notes

- This is a micro-hotpath optimization, most visible under frequent parent
  rerenders and larger meal lists.
- Next major gain likely requires true list virtualization for very large day
  timelines.
