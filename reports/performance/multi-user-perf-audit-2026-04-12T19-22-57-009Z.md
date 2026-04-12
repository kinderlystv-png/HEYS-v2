# Multi-user Performance Audit

- Run at: 2026-04-12T19:21:46.793Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    11278 |       24252 |              124 |  11024 | 0.3658 |        26 |               0 |
| User B (+7\*\*\*7111) |     ok |     8945 |       24411 |               75 |   8832 | 0.7331 |        15 |               0 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 11278 ms
- Scenario duration: 24252 ms
- Events total: 9, slow interactions: 2
- LCP: 11024 ms, CLS: 0.3658, INP: -
- Long tasks: 26 (max 340 ms)
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
- Login duration: 8945 ms
- Scenario duration: 24411 ms
- Events total: 9, slow interactions: 2
- LCP: 8832 ms, CLS: 0.7331, INP: -
- Long tasks: 15 (max 245 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 373, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":38,"warning":0,"error":0}
- Request failures: 0

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T19-22-57-009Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
