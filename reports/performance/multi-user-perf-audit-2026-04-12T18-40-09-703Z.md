# Multi-user Performance Audit

- Run at: 2026-04-12T18:38:53.758Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    14030 |       24751 |              124 |  13092 | 0.4201 |        36 |               0 |
| User B (+7\*\*\*7111) |     ok |    11069 |       24883 |               75 |  10512 | 0.7632 |        32 |               0 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 14030 ms
- Scenario duration: 24751 ms
- Events total: 9, slow interactions: 37
- LCP: 13092 ms, CLS: 0.4201, INP: 168
- Long tasks: 36 (max 634 ms)
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
- Login duration: 11069 ms
- Scenario duration: 24883 ms
- Events total: 9, slow interactions: 37
- LCP: 10512 ms, CLS: 0.7632, INP: 160
- Long tasks: 32 (max 392 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 373, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":38,"warning":0,"error":0}
- Request failures: 0

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T18-40-09-703Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
