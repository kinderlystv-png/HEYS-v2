# Multi-user Perf Comparison (Baseline vs Rerun)

- Baseline report:
  `reports/performance/multi-user-perf-audit-2026-04-12T17-23-10-582Z.md`
- Rerun report:
  `reports/performance/multi-user-perf-audit-2026-04-12T17-26-10-515Z.md`
- Baseline raw:
  `reports/performance/multi-user-perf-audit-2026-04-12T17-23-10-582Z.json`
- Rerun raw:
  `reports/performance/multi-user-perf-audit-2026-04-12T17-26-10-515Z.json`

## Data volume check

- User A (`+7***6111`): `124` unique day dates in both runs.
- User B (`+7***7111`): `75` unique day dates in both runs.
- Difference between users remains stable: User A has `+49` more day dates.

## Key metrics delta

| User                          | Login ms | Scenario ms | LCP ms |     CLS | INP ms | LongTasks | Max LongTask ms | Slow interactions |
| ----------------------------- | -------: | ----------: | -----: | ------: | -----: | --------: | --------------: | ----------------: |
| User A baseline               |    11511 |       24509 |  11196 |  0.3196 |    144 |        24 |             306 |                19 |
| User A rerun                  |    13126 |       24400 |  12492 |  0.3666 |    128 |        29 |             567 |                19 |
| User A delta (rerun-baseline) |    +1615 |        -109 |  +1296 | +0.0470 |    -16 |        +5 |            +261 |                 0 |
| User B baseline               |    10512 |       24840 |  10200 |  0.3646 |    104 |        26 |             646 |                 2 |
| User B rerun                  |    10771 |       25247 |  10424 |  0.7337 |    152 |        30 |             411 |                39 |
| User B delta (rerun-baseline) |     +259 |        +407 |   +224 | +0.3691 |    +48 |        +4 |            -235 |               +37 |

## Observations

- LCP is consistently higher for User A (larger dataset), with additional
  degradation in rerun.
- CLS remains high for both users in both runs and worsened in rerun, especially
  for User B.
- User B rerun shows strong interaction volatility (`slow interactions` grows
  from `2` to `39`).
- Scroll jank rate stayed at `100%` in all runs, indicating persistent scroll
  smoothness issues under the current synthetic scenario.

## Next actions

- Stabilize CLS first (layout shifts in cards/sections after async data
  updates).
- Investigate interaction spikes for User B rerun (`event` and click-to-frame
  traces around tab/range switches).
- Add a longer scenario pass (2-5 minutes per user) to collect more robust
  percentiles for interaction metrics.
