# Multi-user Performance Audit

- Run at: 2026-04-12T21:37:54.189Z
- Base URL: http://127.0.0.1:3001/?perf-audit=multi-user
- Users: 2
- Scenario target duration hint: 300s

## Summary

| User                  | Status | Login ms | Scenario ms | Unique day dates | LCP ms |    CLS | LongTasks | Failed requests |
| --------------------- | -----: | -------: | ----------: | ---------------: | -----: | -----: | --------: | --------------: |
| User A (+7\*\*\*6111) |     ok |    13067 |       26524 |              124 |  11740 | 0.3116 |        33 |               0 |
| User B (+7\*\*\*7111) |     ok |    12355 |       24942 |               75 |  12412 | 0.2289 |        22 |               3 |

## Per User Details

### User A (+7\*\*\*6111)

- Status: ok
- Login duration: 13067 ms
- Scenario duration: 26524 ms
- Events total: 9, slow interactions: 35
- LCP: 11740 ms, CLS: 0.3116, INP: 424
- Long tasks: 33 (max 881 ms)
- Scroll sessions: 1, jank rate: 0%
- Storage keys: 740, day-like keys: 125, unique day dates: 124
- Date range: 2025-12-07 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":2,"info":39,"warning":1,"error":0}
- Request failures: 0

Top warnings/errors:

- [warning] [HEYS.sinhron] 🔀 dayv2 дедупликация: 1 дублей отброшено: 2025-12-08

### User B (+7\*\*\*7111)

- Status: ok
- Login duration: 12355 ms
- Scenario duration: 24942 ms
- Events total: 9, slow interactions: 21
- LCP: 12412 ms, CLS: 0.2289, INP: 232
- Long tasks: 22 (max 492 ms)
- Scroll sessions: 1, jank rate: 100%
- Storage keys: 364, day-like keys: 76, unique day dates: 75
- Date range: 2025-12-15 .. 2026-04-12
- Sync status: synced, pending count: 1
- Console summary: {"log":0,"info":37,"warning":0,"error":6}
- Request failures: 3

Top warnings/errors:

- [error] Failed to load resource: the server responded with a status of 404
  (Not Found)
- [error] [HEYS.postboot] ❌ Failed to load:
  postboot-1-game.bundle.bd76e41e6ef0.js
- [error] Failed to load resource: the server responded with a status of 404
  (Not Found)
- [error] [HEYS.postboot] ❌ Failed to load:
  postboot-2-insights.bundle.ecdcc4a9d589.js
- [error] Failed to load resource: the server responded with a status of 404
  (Not Found)
- [error] [HEYS.postboot] ❌ Failed to load:
  postboot-3-ui.bundle.9bd47fd332d0.js

## Raw Artifacts

- JSON:
  `reports/performance/multi-user-perf-audit-2026-04-12T21-39-13-609Z.json`
- Script: `scripts/run-heys-multi-user-perf-audit.mjs`
