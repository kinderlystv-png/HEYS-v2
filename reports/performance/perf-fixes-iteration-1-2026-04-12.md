# Performance Fixes Iteration 1 (P0)

- Date: 2026-04-12
- Scope: `apps/web/heys_storage_supabase_v1.js`
- Goal: снизить main-thread pressure и убрать тяжёлые storage/sync операции из
  hot path.

## Implemented Changes

1. Adaptive foreground hot-sync interval (instead of fixed 2s)
   - Replaced fixed loop with adaptive scheduling:
     - active: `3500ms`
     - idle streak: `7000ms`
     - low-end / save-data / slow network: up to `9000ms`
   - Updated loop implementation from fixed `setInterval` to adaptive
     `setTimeout` reschedule.
   - Reduced default min gap conflicts by raising baseline min-gap.

2. Removed expensive storage-size full scan from normal write path
   - Added cached storage size with TTL (`10s`).
   - `getStorageSize()` now supports cache and `forceRecalc` mode.
   - `safeSetItem()` now computes write meta lazily only on quota errors.
   - Cleanup paths use `forceRecalc` for accurate post-cleanup diagnostics.

3. Reduced heavy duplicate/diagnostic scans during sync
   - Added throttled duplicate cleanup guard (`5 min` min gap).
   - Replaced frequent `cleanupDuplicateKeys()` calls with
     `maybeCleanupDuplicateKeys()`.
   - Wrapped deep post-sync diagnostic scan under explicit gate:
     - enabled in dev, or when `localStorage.heys_sync_deep_diagnostics = '1'`.

## Validation

- Sync-critical tests:
  - Command: `pnpm test:web:sync-critical`
  - Result: `41/41 passed`.

- Legacy rebuild (runtime-sensitive change):
  - Command:
    `pnpm bundle:legacy:auto --files=apps/web/heys_storage_supabase_v1.js`
  - Updated boot-core hash: `boot-core.bundle.6b886ef2b502.js`
  - Manifest/index/sw verified:
    - `apps/web/bundle-manifest.json`
    - `apps/web/index.html`
    - `apps/web/public/sw.js`

- Browser verification:
  - Live loaded asset confirmed via network: `boot-core.bundle.6b886ef2b502.js`
    (status `200`).

## Before vs After (2-run average, per user)

Baseline runs:

- `multi-user-perf-audit-2026-04-12T17-23-10-582Z.json`
- `multi-user-perf-audit-2026-04-12T17-26-10-515Z.json`

Post-fix runs:

- `multi-user-perf-audit-2026-04-12T17-39-02-959Z.json`
- `multi-user-perf-audit-2026-04-12T17-40-22-253Z.json`

### User A (`124` days)

| Metric             | Pre Avg | Post Avg |      Delta |
| ------------------ | ------: | -------: | ---------: |
| Login ms           | 12318.5 |  11498.0 | **-820.5** |
| Scenario ms        | 24454.5 |  24358.5 |      -96.0 |
| LCP ms             | 11844.0 |  11136.0 | **-708.0** |
| CLS                |   0.343 |    0.323 | **-0.020** |
| INP ms             |   136.0 |    104.0 |  **-32.0** |
| Long tasks count   |    26.5 |     24.0 |   **-2.5** |
| Max long task ms   |   436.5 |    412.0 |      -24.5 |
| Slow interactions  |    19.0 |      2.0 |  **-17.0** |
| Scroll jank rate % |   100.0 |    100.0 |        0.0 |

### User B (`75` days)

| Metric             | Pre Avg | Post Avg |              Delta |
| ------------------ | ------: | -------: | -----------------: |
| Login ms           | 10641.5 |   9535.5 |        **-1106.0** |
| Scenario ms        | 25043.5 |  24925.0 |             -118.5 |
| LCP ms             | 10312.0 |   9304.0 |        **-1008.0** |
| CLS                |   0.549 |    0.733 | **+0.184** (worse) |
| INP ms             |   128.0 |    124.0 |               -4.0 |
| Long tasks count   |    28.0 |     28.0 |                0.0 |
| Max long task ms   |   528.5 |    353.0 |         **-175.5** |
| Slow interactions  |    20.5 |     10.5 |          **-10.0** |
| Scroll jank rate % |   100.0 |    100.0 |                0.0 |

## Conclusion

- P0 changes improved most latency-sensitive metrics across both users:
  - login latency, LCP, INP, slow interactions, peak long task duration.
- Remaining major issue:
  - `scroll jank rate` still `100%` in this scenario.
  - `CLS` remains unstable (and worsened for User B).

## Next Iteration Priority

1. CLS stabilization (fixed-height placeholders / async card mount order / tab
   transition layout locking).
2. Scroll path optimization in heavy day/month views (layout reads, list
   chunking/virtualization).
3. Reduce startup request duplication (`health`/prefetch/warmups) and tighten
   retry policy for first interactive flow.
