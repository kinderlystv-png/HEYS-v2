# Multi-user Performance Audit

- Run at: 2026-04-12T17:37:50.497Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    12061 |       24264 |              124 |  11832 | 0.3191 |        24 |               0 |
| User B (+7\*\*\*7111) |     ok |     9771 |       24834 |               75 |   9520 | 0.7323 |        27 |               0 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 12061 ms
- Scenario duration: 24264 ms
- Events total: 9, slow interactions: 2
- LCP: 11832 ms, CLS: 0.3191, INP: 104
- Long tasks: 24 (max 398 ms)
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
- Login duration: 9771 ms
- Scenario duration: 24834 ms
- Events total: 9, slow interactions: 19
- LCP: 9520 ms, CLS: 0.7323, INP: 136
- Long tasks: 27 (max 352 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 373, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":38,"warning":0,"error":0}
- Request failures: 0

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T17-39-02-959Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
