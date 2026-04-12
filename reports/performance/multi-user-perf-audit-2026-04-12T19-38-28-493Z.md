# Multi-user Performance Audit

- Run at: 2026-04-12T19:37:18.260Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    10100 |       24269 |              124 |   9916 | 0.3825 |        21 |               0 |
| User B (+7\*\*\*7111) |     ok |     9910 |       25038 |               75 |   9712 | 0.7341 |        27 |               0 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 10100 ms
- Scenario duration: 24269 ms
- Events total: 9, slow interactions: 2
- LCP: 9916 ms, CLS: 0.3825, INP: -
- Long tasks: 21 (max 302 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 741, day-like keys: 125, unique day dates: 124
- Date range: 2025-12-07 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":38,"warning":1,"error":0}
- Request failures: 0

Top warnings/errors:

- [warning] [HEYS.sinhron] 🔀 dayv2 дедупликация: 1 дублей отброшено: 2025-12-08

### User B (+7\*\*\*7111)

- Status: ok
- Login duration: 9910 ms
- Scenario duration: 25038 ms
- Events total: 9, slow interactions: 19
- LCP: 9712 ms, CLS: 0.7341, INP: 136
- Long tasks: 27 (max 379 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 372, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":38,"warning":0,"error":0}
- Request failures: 0

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T19-38-28-493Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
