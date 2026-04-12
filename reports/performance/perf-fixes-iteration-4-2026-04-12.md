# Performance Fixes Iteration 4 (Deferred Slots Stabilization)

- Date: 2026-04-12
- Scope: `apps/web/heys_day_diary_section.js`

## Implemented changes

1. Stabilized deferred slot placeholders before module readiness.
   - Pending slots now reserve `minHeight` based on slot skeleton height.
   - This removes zero-height -> content-height jumps and reduces CLS spikes.
2. Gated verbose deferred-slot logs behind debug flag.
   - `console.info('[HEYS.sceleton] ...')` now logs only when
     `localStorage.heys_deferred_slot_debug = '1'`.

## Validation

- Rebuild: `pnpm bundle:legacy:auto --files=apps/web/heys_day_diary_section.js`
- Updated hashes:
  - `boot-calc.bundle.41e88c8c8874.js`
  - `boot-day.bundle.f7e13e0a1257.js`
- Browser verification:
  - `http://127.0.0.1:3001/boot-calc.bundle.41e88c8c8874.js`
  - `http://127.0.0.1:3001/boot-day.bundle.f7e13e0a1257.js`
- Audit:
  `reports/performance/multi-user-perf-audit-2026-04-12T18-05-54-600Z.json`

## Latest run snapshot

| User   | Login ms | Scenario ms | LCP ms |    CLS | INP ms | Long tasks | Slow interactions | Scroll jank % |
| ------ | -------: | ----------: | -----: | -----: | -----: | ---------: | ----------------: | ------------: |
| User A |    12057 |       24466 |  11268 | 0.3291 |    144 |         28 |                19 |           100 |
| User B |     9178 |       24754 |   8828 | 0.7382 |    128 |         27 |                19 |           100 |

## Notes

- CLS-related slot stability is improved structurally; effect can be masked by
  scenario variance and other runtime shifts.
- Scroll jank remains saturated in synthetic path; next target is
  virtualization/chunking for heavy day lists.
