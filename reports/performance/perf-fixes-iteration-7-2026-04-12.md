# Performance Fixes Iteration 7 (Meals Sorting Fast Path)

- Date: 2026-04-12
- Scope: `apps/web/day/_meals.js`

## Implemented changes

1. Added fast-path for already sorted meals arrays in `useMealsDisplay`.
   - If meals are already in desired order, skip clone+sort and reuse source
     array.
2. Added per-render WeakMap cache for parsed meal times during sort checks.
   - Avoids repeated `timeToMinutes(...)` parsing within same render cycle.

## Validation

- Rebuild: `pnpm bundle:legacy:auto --files=apps/web/day/_meals.js`
- Updated hashes:
  - `boot-calc.bundle.b63b0be9a2c8.js`
  - `boot-day.bundle.df2334f3c2eb.js`
- Browser verification:
  - `http://127.0.0.1:3001/boot-calc.bundle.b63b0be9a2c8.js`
  - `http://127.0.0.1:3001/boot-day.bundle.df2334f3c2eb.js`
- Audit:
  `reports/performance/multi-user-perf-audit-2026-04-12T18-23-54-190Z.json`

## Latest run snapshot

| User   | Login ms | Scenario ms | LCP ms |    CLS | INP ms | Long tasks | Slow interactions | Scroll jank % |
| ------ | -------: | ----------: | -----: | -----: | -----: | ---------: | ----------------: | ------------: |
| User A |    12457 |       24279 |  12088 | 0.3206 |    120 |         26 |                19 |           100 |
| User B |    12607 |       25639 |  16324 |  0.764 |    168 |         36 |                39 |           100 |

## Notes

- This optimization mainly reduces unnecessary CPU on rerenders where meal order
  is unchanged.
- The biggest remaining gains still require true viewport virtualization for
  very long meal/day content.
