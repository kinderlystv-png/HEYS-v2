# Multi-user Performance Audit

- Run at: 2026-04-12T19:43:11.409Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    18303 |       25755 |              124 |  19672 |  0.366 |        35 |               0 |
| User B (+7\*\*\*7111) |     ok |    14707 |       27638 |               75 |   1964 | 0.0002 |        15 |               2 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 18303 ms
- Scenario duration: 25755 ms
- Events total: 9, slow interactions: 41
- LCP: 19672 ms, CLS: 0.366, INP: 456
- Long tasks: 35 (max 945 ms)
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
- Login duration: 14707 ms
- Scenario duration: 27638 ms
- Events total: 8, slow interactions: 0
- LCP: 1964 ms, CLS: 0.0002, INP: -
- Long tasks: 15 (max 580 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 373, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 0
- Console summary: {"log":2,"info":75,"warning":0,"error":2}
- Request failures: 2

Top warnings/errors:

- [error] [HEYS.api] ❌ Attempt 1/3 failed (timeout=15000ms): Failed to fetch
- [error] [HEYS.api] ❌ Attempt 1/3 failed (timeout=15000ms): Failed to fetch

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T19-44-40-527Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
