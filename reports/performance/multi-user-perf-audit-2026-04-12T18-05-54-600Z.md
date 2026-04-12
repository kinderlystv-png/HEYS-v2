# Multi-user Performance Audit

- Run at: 2026-04-12T18:04:43.350Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    12057 |       24466 |              124 |  11268 | 0.3291 |        28 |               0 |
| User B (+7\*\*\*7111) |     ok |     9178 |       24754 |               75 |   8828 | 0.7382 |        27 |               0 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 12057 ms
- Scenario duration: 24466 ms
- Events total: 9, slow interactions: 19
- LCP: 11268 ms, CLS: 0.3291, INP: 144
- Long tasks: 28 (max 534 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 740, day-like keys: 125, unique day dates: 124
- Date range: 2025-12-07 .. 2026-04-12
- Sync status: synced, pending count: 0
- Console summary: {"log":2,"info":40,"warning":1,"error":0}
- Request failures: 0

Top warnings/errors:

- [warning] [HEYS.sinhron] 🔀 dayv2 дедупликация: 1 дублей отброшено: 2025-12-08

### User B (+7\*\*\*7111)

- Status: ok
- Login duration: 9178 ms
- Scenario duration: 24754 ms
- Events total: 9, slow interactions: 19
- LCP: 8828 ms, CLS: 0.7382, INP: 128
- Long tasks: 27 (max 369 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 373, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":38,"warning":0,"error":0}
- Request failures: 0

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T18-05-54-600Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
