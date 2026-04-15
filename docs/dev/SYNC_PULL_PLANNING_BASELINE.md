# Baseline: sync / pull-to-refresh / planning (HEYS web)

Фиксация сценариев до правок плана «Sync Pull Planning» (2026).

## Ложные срабатывания pull-block

- Вкладка **Задачи** (`tasks`): `DayTabWithCloudSync` остаётся смонтированным с
  `height:0`, pull слушает `document`; при `window.scrollY === 0` (типично для
  `wrap--no-header`) и `pending > 0` — блокирующий UI при касании
  календаря/контента.
- Класс **`planning-tab-active`** на `body` не участвовал в фильтрации pull до
  фикса.

## Состояния sync в шапке

- `cloudStatus`: `idle` | `syncing` | `synced` | `queued` | `offline` | `error`
  (+ после фикса: `session` для истёкшей сессии).
- Долгий синк: `showSyncLockOverlay`, `showSlowInternetHint`, затем
  `showPendingSyncBanner` (fallback 15s).

## Известные расхождения (до фикса)

- `getSyncStatus()` в очереди — **per-key** (`pending` | `synced`), вызывался
  без ключа как «глобальный» статус → ложные ветки в poll.
- `auth_required` мапился в `offline` в UI статусе.
- Дубли hint: таймер 3s в `AppOverlays` + 5s в hooks.

## Реализованные правки (кратко)

- Pull: `body.heys-pull-refresh-day-active` только на `stats`/`diary`; игнор
  planning + cleanup rAF/timers; без второго хука на Widgets.
- Sync poll: без вызова `getSyncStatus()` без ключа; `session` для
  `auth_required`; дедуп `heysSyncCompleted` / `heys:data-uploaded`; один
  источник slow-internet hint; ослаблен guard `enterBackgroundPendingSync`.
