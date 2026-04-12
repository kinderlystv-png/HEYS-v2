# Multi-user Performance Audit

- Run at: 2026-04-12T18:15:27.923Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    12354 |       24301 |              124 |  12124 | 0.3189 |        26 |               0 |
| User B (+7\*\*\*7111) |     ok |    10206 |       24955 |               75 |  10024 | 0.3567 |        26 |               0 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 12354 ms
- Scenario duration: 24301 ms
- Events total: 9, slow interactions: 19
- LCP: 12124 ms, CLS: 0.3189, INP: 120
- Long tasks: 26 (max 469 ms)
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
- Login duration: 10206 ms
- Scenario duration: 24955 ms
- Events total: 9, slow interactions: 19
- LCP: 10024 ms, CLS: 0.3567, INP: 136
- Long tasks: 26 (max 376 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 373, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":38,"warning":0,"error":0}
- Request failures: 0

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T18-16-40-752Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
