# Multi-user Performance Audit

- Run at: 2026-04-12T21:30:46.238Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    10511 |       24685 |              124 |  10372 | 0.2918 |        22 |               0 |
| User B (+7\*\*\*7111) |     ok |     8771 |       24750 |               75 |   8616 | 0.5833 |        21 |               0 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 10511 ms
- Scenario duration: 24685 ms
- Events total: 9, slow interactions: 35
- LCP: 10372 ms, CLS: 0.2918, INP: 152
- Long tasks: 22 (max 400 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 740, day-like keys: 125, unique day dates: 124
- Date range: 2025-12-07 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":39,"warning":1,"error":0}
- Request failures: 0

Top warnings/errors:

- [warning] [HEYS.sinhron] 🔀 dayv2 дедупликация: 1 дублей отброшено: 2025-12-08

### User B (+7\*\*\*7111)

- Status: ok
- Login duration: 8771 ms
- Scenario duration: 24750 ms
- Events total: 9, slow interactions: 2
- LCP: 8616 ms, CLS: 0.5833, INP: 104
- Long tasks: 21 (max 268 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 371, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":38,"warning":0,"error":0}
- Request failures: 0

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T21-31-56-695Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
