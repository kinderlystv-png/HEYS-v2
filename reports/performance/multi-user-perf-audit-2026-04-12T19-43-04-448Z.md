# Multi-user Performance Audit

- Run at: 2026-04-12T19:41:36.339Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    19483 |       26289 |              124 |  22148 | 0.3748 |        39 |               0 |
| User B (+7\*\*\*7111) |     ok |    12510 |       27087 |               75 |  12060 | 0.3203 |        34 |               0 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 19483 ms
- Scenario duration: 26289 ms
- Events total: 9, slow interactions: 45
- LCP: 22148 ms, CLS: 0.3748, INP: 376
- Long tasks: 39 (max 780 ms)
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
- Login duration: 12510 ms
- Scenario duration: 27087 ms
- Events total: 9, slow interactions: 25
- LCP: 12060 ms, CLS: 0.3203, INP: 384
- Long tasks: 34 (max 551 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 373, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":38,"warning":0,"error":0}
- Request failures: 0

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T19-43-04-448Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
