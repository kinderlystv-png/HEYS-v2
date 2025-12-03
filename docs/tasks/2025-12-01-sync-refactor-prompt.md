# Sync Quick Fix (Scope A) + опциональные B/C

Цель: закрыть реальные баги облачной синхронизации минимальными правками (A), опционально расширить (B/C).

## Контекст
- Основной код: `apps/web/heys_storage_supabase_v1.js`; нет `cloud.pushAll/fetchDays/isAuthenticated/getCurrentClientId`, дубль `retrySync`.
- UI слушает: `heys:data-saved`, `heysSyncCompleted`, `heys:data-uploaded`, `heys:pending-change`, `heys:sync-error`, `heys:sync-progress`, `heys:network-restored`.
- SW (apps/web/public/sw.js) простой: skipWaiting/getVersion/registerSync/forceSync → SYNC_START/COMPLETE клиентам.
- Manager/хуки шлют команды PRELOAD_RESOURCES/CLEAR_CACHE/GET_CACHE_STATUS/PERFORMANCE_REPORT, но PRELOAD/CLEAR в проде не используются.
- Очереди `upsertQueue`/`clientUpsertQueue` уже персистятся в localStorage (`heys_pending_sync_queue`, `heys_pending_client_sync_queue`).

## Scope A (30–40 мин, must-have)
1) Методы/алиасы (heys_storage_supabase_v1.js)
   - `cloud.sync = cloud.retrySync`
   - `cloud.pushAll = cloud.retrySync`
   - `cloud.isAuthenticated = () => status === 'online' && !!user`
   - `cloud.getCurrentClientId = () => localStorage.getItem('heys_client_current')`
   - `cloud.fetchDays = async (dates) => client.from('kv_store').select('k,v').in('k', dates.map(d => 'heys_dayv2_' + d))` с защитой: не затирать локальное непустое пустым ответом.
2) Удалить дубль `retrySync` (оставить финальную внизу) и починить `HEYS.SupabaseConnection.sync`.
3) События из существующих очередей:
   - `heys:pending-change` `{ count, details? }` при изменении очереди
   - `heys:sync-progress` `{ total, done }` (done = успешно отправлено)
   - `heys:sync-error` `{ error, retryIn? }` при ошибке push
   - `heysSyncCompleted` `{}` после drain обеих очередей
4) SW: оставить getVersion; GET_CACHE_STATUS может возвращать `{ version: CACHE_VERSION, caches: {}, timestamp: Date.now() }`. PRELOAD/CLEAR_CACHE не трогаем.

## Scope B/C (опционально, 2–4 ч после A)
- IndexedDB очередь (только если localStorage не хватает): дедуп по key+clientId+userId, backoff, формат хранения.
- Полный протокол SW: PRELOAD_RESOURCES, CLEAR_CACHE, PERFORMANCE_REPORT, SYNC_PROGRESS, Background Sync с очередью в SW.
- Fallback без BG Sync: retry на `online`/`visibilitychange`, приоритеты, батчи.

## Тест (для A)
1) offline → enqueue (добавить/изменить данные) → online → `heysSyncCompleted` и прогресс в UI.
2) GET_CACHE_STATUS отвечает; forceSync (если используется) дергает pushAll; прогресс/ошибки шлются.
3) Smart prefetch: `fetchDays` не затирает локальное непустым пустым ответом.

## Фаза 0 — краткая подготовка
- Подтвердить: IndexedDB не делаем, PRELOAD/CLEAR_CACHE остаются опциональными.
- Уточнить сервер: таблицы `kv_store`/`client_kv_store`, таймауты, auth; fetchDays через `.in()` по ключам.
- Зафиксировать контракт событий (см. выше) и единый источник регистрации SW (legacy index.html или manager — выбрать один).
- Учитывать: BG Sync нет в Safari/iOS → fallback на `online`/`visibilitychange`.
