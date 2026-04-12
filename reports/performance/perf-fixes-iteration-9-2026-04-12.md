# Performance Fixes Iteration 9 (Bounded Window Meals DOM)

- Date: 2026-04-12
- Scope: `apps/web/day/_meals.js`

## Implemented changes

1. Added bounded rendered window over currently loaded meals.
   - Caps concurrently rendered meal cards (`MAX_RENDERED_MEALS_WINDOW = 24`).
   - Keeps list responsive while loaded range grows.
2. Added explicit recovery control for hidden top part of window.
   - `Показать верхние N` reveals clipped upper segment on demand.
3. Preserved lazy bottom loading + manual fallback (`Показать ещё`).

## Validation

- Rebuild: `pnpm bundle:legacy:auto --files=apps/web/day/_meals.js`
- Updated hashes:
  - `boot-calc.bundle.50002f800bc6.js`
  - `boot-day.bundle.b2f3424b6e3b.js`
- Browser verification:
  - `http://127.0.0.1:3001/boot-calc.bundle.50002f800bc6.js`
  - `http://127.0.0.1:3001/boot-day.bundle.b2f3424b6e3b.js`
- Audit:
  `reports/performance/multi-user-perf-audit-2026-04-12T18-40-09-703Z.json`

## Latest run snapshot

| User   | Login ms | Scenario ms | LCP ms |    CLS | INP ms | Long tasks | Slow interactions | Scroll jank % |
| ------ | -------: | ----------: | -----: | -----: | -----: | ---------: | ----------------: | ------------: |
| User A |    14030 |       24751 |  13092 | 0.4201 |    168 |         36 |                37 |           100 |
| User B |    11069 |       24883 |  10512 | 0.7632 |    160 |         32 |                37 |           100 |

## Notes

- This step bounds live DOM size in long-list flows instead of only delaying
  growth.
- For stronger signal, next audits should include deeper down-scroll in diary
  list to stress window mechanics directly.
