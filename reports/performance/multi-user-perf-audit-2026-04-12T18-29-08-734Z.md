# Multi-user Performance Audit

- Run at: 2026-04-12T18:27:51.528Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    16185 |       24637 |              124 |  15896 | 0.3764 |        34 |               0 |
| User B (+7\*\*\*7111) |     ok |    10465 |       24889 |               75 |  10276 | 0.7337 |        28 |               0 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 16185 ms
- Scenario duration: 24637 ms
- Events total: 9, slow interactions: 37
- LCP: 15896 ms, CLS: 0.3764, INP: 144
- Long tasks: 34 (max 496 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 741, day-like keys: 125, unique day dates: 124
- Date range: 2025-12-07 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":39,"warning":1,"error":0}
- Request failures: 0

Top warnings/errors:

- [warning] [HEYS.sinhron] 🔀 dayv2 дедупликация: 1 дублей отброшено: 2025-12-08

### User B (+7\*\*\*7111)

- Status: ok
- Login duration: 10465 ms
- Scenario duration: 24889 ms
- Events total: 9, slow interactions: 2
- LCP: 10276 ms, CLS: 0.7337, INP: 112
- Long tasks: 28 (max 354 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 373, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":38,"warning":0,"error":0}
- Request failures: 0

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T18-29-08-734Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
