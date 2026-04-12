# Comprehensive Performance Investigation (HEYS)

- Date: 2026-04-12
- Goal: максимально широкое исследование источников задержек, фризов и
  «тормознутости по ощущениям».
- Scope: `apps/web` runtime + startup/network + storage/sync + two real users
  with different data volume.

## Test Matrix (what was executed)

1. Multi-user synthetic scenario run #1
   - Artifact:
     `reports/performance/multi-user-perf-audit-2026-04-12T17-23-10-582Z.md`
   - Raw:
     `reports/performance/multi-user-perf-audit-2026-04-12T17-23-10-582Z.json`

2. Multi-user synthetic scenario run #2 (rerun)
   - Artifact:
     `reports/performance/multi-user-perf-audit-2026-04-12T17-26-10-515Z.md`
   - Raw:
     `reports/performance/multi-user-perf-audit-2026-04-12T17-26-10-515Z.json`

3. Baseline vs rerun comparison
   - Artifact:
     `reports/performance/multi-user-perf-audit-comparison-2026-04-12.md`

4. Browser CPU profile (real app runtime flow)
   - Raw profile:
     `/Users/poplavskijanton/.cursor/browser-logs/cpu-profile-2026-04-12T17-30-48-117Z-aih5q3.json`
   - Summary:
     `/Users/poplavskijanton/.cursor/browser-logs/cpu-profile-2026-04-12T17-30-48-117Z-aih5q3-summary.md`

5. Very-thorough static audits (code-level hotspot mining)
   - UI/render pipeline audit
   - Storage/sync bottleneck audit
   - Network/auth/startup audit

## User Dataset Reality Check

- User A (`+7***6111`): `124` unique day dates.
- User B (`+7***7111`): `75` unique day dates.
- Stable across both runs: data volume gap `+49` days for User A.

## Runtime Results (two users, two runs)

| Metric             | User A Run1 | User A Run2 | User B Run1 | User B Run2 |
| ------------------ | ----------: | ----------: | ----------: | ----------: |
| Login ms           |       11511 |       13126 |       10512 |       10771 |
| Scenario ms        |       24509 |       24400 |       24840 |       25247 |
| LCP ms             |       11196 |       12492 |       10200 |       10424 |
| CLS                |      0.3196 |      0.3666 |      0.3646 |      0.7337 |
| INP ms             |         144 |         128 |         104 |         152 |
| Long tasks count   |          24 |          29 |          26 |          30 |
| Max long task ms   |         306 |         567 |         646 |         411 |
| Slow interactions  |          19 |          19 |           2 |          39 |
| Scroll jank rate % |         100 |         100 |         100 |         100 |
| Request failures   |           0 |           0 |           0 |           0 |

## CPU Profile Evidence (raw validated)

Raw profile validation:

- `profile.samples.length`: `36487`
- Top hit functions in raw:
  - `(idle)` hitCount `35962`
  - `(program)` hitCount `230`
  - `lsGet` hitCount `50` (`boot-core.bundle.8f2dac402865.js:8843`)
  - `getBoundingClientRect` hitCount `19`
  - `compress` hitCount `19` (`boot-core.bundle.8f2dac402865.js:29752`)
  - `getDayData` hitCount `11` (`boot-calc.bundle.0d65b6f48b8a.js:9229`)

Interpretation:

- Even in a short profile window, hotspots align with storage/layout paths:
  - frequent storage reads (`lsGet`)
  - layout reads (`getBoundingClientRect`)
  - storage serialization/compression (`compress`)
  - day data access path (`getDayData`)

## Broad Root-Cause Map (prioritized)

## P0 (most likely to drive perceived lag/freeze)

1. Foreground hot-sync loop every `2s` on visible tab
   (`heys_storage_supabase_v1.js`).
2. Repeated full `localStorage` scans + JSON parse/stringify in sync and quota
   paths (`heys_storage_supabase_v1.js`, `heys_storage_layer_v1.js`).
3. Post-sync diagnostic loops over all `dayv2_*` keys with repeated parse and
   duplicate checks (`heys_storage_supabase_v1.js`).
4. Large render surfaces without virtualization for heavy day/product content
   (`heys_day_bundle_v1.js` family).

## P1 (strong contributors under load / unstable network)

1. Multi-layer retries with escalating timeouts (up to `15s/20s/30s`) and
   additional cloud-level retry logic (`heys_yandex_api_v1.js`,
   `heys_storage_supabase_v1.js`).
2. Startup network duplication (`/health`, `shared_products` warmups in multiple
   places) competing with critical boot assets (`index.html`,
   `heys_app_cloud_init_v1.js`, `heys_app_initialize_v1.js`).
3. Polling-heavy sync UI path (`800ms` status interval + `1s` retry/offline
   intervals) causing continuous re-render pressure (`heys_app_hooks_v1.js`).
4. Planning/calendar layout reads and RAF loops during drag/auto-scroll
   (`heys_planning_schedule_v1.js`, `heys_planning_v1.js`).

## P2 (secondary but accumulative)

1. Analytics/perf collectors adding scroll/click observers (acceptable alone,
   but additive with other loops) (`heys_simple_analytics.js`).
2. Periodic loops in gamification/cascade/status widgets
   (`heys_cascade_card_v1.js`, `heys_gamification_bar_v1.js`).
3. SW background update checks and `index.html` hash checks adding
   startup/network noise (`public/sw.js`).

## Why it feels slow to users

- Not one giant blocker, but many overlapping periodic tasks and scans on main
  thread.
- Large-data users amplify every O(N) storage pass and every heavy day parse.
- Network retry layers create long-tail waits and “stuck” feeling when
  backend/network is shaky.
- Layout shift and long task spikes degrade interaction smoothness even when
  requests succeed.

## Priority Fix Plan (recommended order)

1. Reduce hot-sync pressure (adaptive interval/backoff when idle, stricter
   visibility gating).
2. Remove full LS scans from hot paths (size cache, indexed day key tracking,
   deferred diagnostics).
3. Slim post-sync diagnostics in production (debug-only heavy loops).
4. De-duplicate startup warmups (single coordinator for `/health` and probes).
5. Rework polling-heavy sync UI to event-driven updates where possible.
6. Add virtualization/chunked rendering for heavy day/product views.
7. Address CLS at critical sections (stable placeholders/heights for async
   cards/lists).

## Bottom Line

Current lag/freeze perception is explained by a combined profile:

- **data-size sensitivity** (more days -> heavier sync/storage/render),
- **main-thread periodic work** (sync/poll/layout),
- **retry-driven startup/network tail latency**.

The evidence is consistent across:

- two-user runs (different data volumes),
- rerun comparison,
- raw CPU profile,
- and code-level audits of all core subsystems.
