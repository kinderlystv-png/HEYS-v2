# Multi-user Performance Audit

- Run at: 2026-04-12T17:49:21.674Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    11552 |       24294 |              124 |  11056 | 0.3216 |        24 |               0 |
| User B (+7\*\*\*7111) |     ok |     9674 |       25150 |               75 |   9284 | 0.7377 |        28 |               0 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 11552 ms
- Scenario duration: 24294 ms
- Events total: 9, slow interactions: 19
- LCP: 11056 ms, CLS: 0.3216, INP: 128
- Long tasks: 24 (max 518 ms)
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
- Login duration: 9674 ms
- Scenario duration: 25150 ms
- Events total: 9, slow interactions: 37
- LCP: 9284 ms, CLS: 0.7377, INP: 144
- Long tasks: 28 (max 405 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 373, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":38,"warning":0,"error":0}
- Request failures: 0

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T17-50-33-534Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
