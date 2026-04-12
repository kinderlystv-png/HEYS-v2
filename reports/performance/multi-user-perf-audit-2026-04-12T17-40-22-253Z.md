# Multi-user Performance Audit

- Run at: 2026-04-12T17:39:11.662Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    10935 |       24453 |              124 |  10440 | 0.3262 |        24 |               0 |
| User B (+7\*\*\*7111) |     ok |     9300 |       25016 |               75 |   9088 | 0.7338 |        29 |               0 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 10935 ms
- Scenario duration: 24453 ms
- Events total: 9, slow interactions: 2
- LCP: 10440 ms, CLS: 0.3262, INP: 104
- Long tasks: 24 (max 426 ms)
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
- Login duration: 9300 ms
- Scenario duration: 25016 ms
- Events total: 9, slow interactions: 2
- LCP: 9088 ms, CLS: 0.7338, INP: 112
- Long tasks: 29 (max 354 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 373, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":38,"warning":0,"error":0}
- Request failures: 0

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T17-40-22-253Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
