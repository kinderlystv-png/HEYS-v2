# Multi-user Performance Audit

- Run at: 2026-04-12T17:24:55.387Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    13126 |       24400 |              124 |  12492 | 0.3666 |        29 |               0 |
| User B (+7\*\*\*7111) |     ok |    10771 |       25247 |               75 |  10424 | 0.7337 |        30 |               0 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 13126 ms
- Scenario duration: 24400 ms
- Events total: 9, slow interactions: 19
- LCP: 12492 ms, CLS: 0.3666, INP: 128
- Long tasks: 29 (max 567 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 741, day-like keys: 125, unique day dates: 124
- Date range: 2025-12-07 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":40,"warning":1,"error":0}
- Request failures: 0

Top warnings/errors:

- [warning] [HEYS.sinhron] 🔀 dayv2 дедупликация: 1 дублей отброшено: 2025-12-08

### User B (+7\*\*\*7111)

- Status: ok
- Login duration: 10771 ms
- Scenario duration: 25247 ms
- Events total: 9, slow interactions: 39
- LCP: 10424 ms, CLS: 0.7337, INP: 152
- Long tasks: 30 (max 411 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 373, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":40,"warning":1,"error":0}
- Request failures: 0

Top warnings/errors:

- [warning] [HEYS.sinhron] ⚠️ СЕГОДНЯ: есть meals=2 но dayTot ПУСТОЙ — UI может
  показать неверные данные до пересчёта

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T17-26-10-515Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
