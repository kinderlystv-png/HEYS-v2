# Performance Fixes Iteration 2 (CLS + Sync Polling)

- Date: 2026-04-12
- Scope: `apps/web/heys_app_hooks_v1.js`,
  `apps/web/styles/modules/000-base-and-gamification.css`
- Changes:
  - Adaptive sync-status polling (`setTimeout`, 1.2s active / 2.2s idle / 4s
    hidden)
  - Lower-frequency pending-details reads (every 3rd poll when stable)
  - Removed offline banner layout push (`body:has(.offline-banner) .wrap`
    padding shift)

## Validation

- `pnpm test:web:sync-critical` → 41/41 passed
- Legacy rebuild:
  `pnpm bundle:legacy:auto --files=apps/web/heys_app_hooks_v1.js,apps/web/styles/modules/000-base-and-gamification.css`
- Updated boot-app hash: `boot-app.bundle.82fd9ecb1757.js`
- Browser verification: live loaded
  `http://127.0.0.1:3001/boot-app.bundle.82fd9ecb1757.js`

## Before vs After (2-run average, per user)

Baseline (after iteration 1):

- `multi-user-perf-audit-2026-04-12T17-39-02-959Z.json`
- `multi-user-perf-audit-2026-04-12T17-40-22-253Z.json`

Post-fix (iteration 2):

- `multi-user-perf-audit-2026-04-12T17-47-05-844Z.json`
- `multi-user-perf-audit-2026-04-12T17-48-20-987Z.json`

### User A (+7\*\*\*6111)

| Metric           | Pre Avg | Post Avg |  Delta |
| ---------------- | ------: | -------: | -----: |
| loginMs          | 11498.0 |  11808.5 |  310.5 |
| scenarioMs       | 24358.5 |  24559.5 |  201.0 |
| lcp              | 11136.0 |  11474.0 |  338.0 |
| cls              |   0.323 |    0.320 | -0.002 |
| inp              |   104.0 |    180.0 |     76 |
| longTasks        |      24 |   25.500 |  1.500 |
| slowInteractions |       2 |       28 |     26 |
| scrollJankRate   |   100.0 |    100.0 |      0 |

### User B (+7\*\*\*7111)

| Metric           | Pre Avg | Post Avg |  Delta |
| ---------------- | ------: | -------: | -----: |
| loginMs          |  9535.5 |  10787.5 | 1252.0 |
| scenarioMs       | 24925.0 |  25113.0 |  188.0 |
| lcp              |  9304.0 |  12748.0 | 3444.0 |
| cls              |   0.733 |    0.553 | -0.180 |
| inp              |   124.0 |    144.0 |     20 |
| longTasks        |      28 |   28.500 |  0.500 |
| slowInteractions |  10.500 |       19 |  8.500 |
| scrollJankRate   |   100.0 |    100.0 |      0 |

## Notes

- Main expected wins from this iteration are lower UI polling pressure and lower
  CLS from banner toggles.
- Scroll jank remains high in this synthetic scenario, so next step is
  render-path optimization in heavy views.
