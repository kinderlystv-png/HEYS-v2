# PWA, offline, Service Worker и Web Push

> **Статус:** core-контракты проверены 2026-07-17<br> **Охват:** SW
> registration/update, cache routing, offline banner, background sync bridge,
> push subscribe/delivery/click и server identity<br> **Не подтверждено:**
> фактическая browser compatibility по устройствам, production VAPID/env и
> delivery rate

## Граница системы

В контуре три владельца:

- `HEYS.PlatformAPIs` регистрирует SW и управляет update lifecycle;
- `public/sw.js` владеет network/cache routing и background events;
- `HEYS.push` + `heys-api-push` владеют Web Push subscription и preferences.

`HEYS.PWA` — тонкий compatibility facade над update helpers, а не отдельный
service-worker engine.

## Service Worker lifecycle

1. `registerServiceWorker()` не регистрирует SW на localhost и в demo mode;
   существующие registrations там удаляются.
2. В production `/sw.js` регистрируется только после завершения postboot, чтобы
   активация worker не обрывала стартовые lazy bundle-запросы. Registration
   сохраняется, подключаются update/message/controller listeners.
3. `updatefound` показывает update flow только при существующем
   controller/active worker; первая установка не считается обновлением.
4. Update lock, state machine и fallback timers защищают от параллельных reload.
5. Install handler не вызывает `skipWaiting` сам: обновление активируется только
   явным page-side update lifecycle. `controllerchange` перезагружает страницу,
   только если есть pending/lock/non-idle update state; незапрошенная смена
   controller во время boot не прерывает текущую страницу.
6. Online/offline events управляют системным banner; данные при offline
   продолжают писаться local-first через общий storage/sync слой.
7. `What's New` временно полностью выключен центральным
   `HEYS.ReleaseFeatures.whatsNewEnabled = false`: нет fetch, retry-таймеров,
   модалки и изменения seen-state. Реализация и история сохранены.
8. Подтверждение модалки правок куратора сначала попадает в browser-global
   runtime/local/session очередь, затем отправляется на сервер по entry id.
   Pending entry id скрывается из повторного ответа до успешного ack, поэтому
   отказ browser storage или временная ошибка RPC не открывает модалку по кругу.

## Cache routing

| Запрос                                            | Стратегия                                          |
| ------------------------------------------------- | -------------------------------------------------- |
| `build-meta.json`, `version.json`, legal Markdown | network/no-store                                   |
| auth/payments/sms/leads API                       | network no-store                                   |
| RPC                                               | network-first                                      |
| GET client KV                                     | stale-while-revalidate со специальной инвалидацией |
| HTML                                              | network-first/no-store                             |
| hash bundle                                       | cache-first                                        |
| прочий JS                                         | stale-while-revalidate                             |
| CDN/static assets                                 | cache-first или профильная static strategy         |

KV SWR cache требует client isolation. При curator switch страница отправляет
`CLIENT_SWITCH`/`CLEAR_API_KV`, а SW инвалидирует cache до загрузки нового
клиента. Этот контракт связан с `cloud.switchClient` и не должен меняться
изолированно.

## Background sync

Browser page регистрирует tag `heys-sync`. SW при событии не хранит собственную
durable data queue: он посылает открытым client windows `SYNC_START`, ждёт одну
секунду и затем посылает `SYNC_COMPLETE`. Page-side `SYNC_START` вызывает cloud
sync, если приложение открыто.

Client observability фиксирует один набор событий на реальный цикл, а не на
каждый ключ: `sync_cycle_started/completed/failed`, `sync_recovered` и
`write_queued/uploaded/failed`. Контекст содержит только агрегаты (`count`,
`queue_size`, безопасную `key_group`) и нормализованную причину; storage keys и
значения дневника в telemetry не уходят.

Следствие: это **wake-up bridge**, а не автономная background upload гарантия.
Без открытого client window он ничего не отправляет; `SYNC_COMPLETE` означает
окончание фиксированной задержки, а не подтверждённый drain cloud queue.

## Push subscription

1. `HEYS.push.getStatus()` проверяет browser capability, permission,
   subscription и iOS standalone requirement.
2. `subscribe()` запрашивает permission только из пользовательского flow,
   получает VAPID public key и создаёт browser PushSubscription.
3. Endpoint + `p256dh/auth` отправляются в `/push/subscribe`.
4. Backend server-side резолвит identity из curator JWT или client session
   (Bearer/HttpOnly cookie) и upsert-ит отдельную client/curator таблицу.
5. `unsubscribe()` сначала удаляет server row, затем browser subscription.
6. `pushsubscriptionchange` может только уведомить открытые окна; стартовая
   auto-resubscribe ветка восстанавливает subscription при следующем визите,
   если permission и onboarded state позволяют.

VAPID public key endpoint публичный; subscribe/unsubscribe/prefs/test требуют
auth. Gateway routes подключены в основном `api-gateway-spec.yaml`.

## Доставка и click

Backend выбирает subscriptions по resolved identity, отправляет через `web-push`
и удаляет dead endpoints после delivery errors. SW показывает notification с
payload title/body/tag/url. Click фокусирует существующую вкладку и навигирует
её либо открывает новое окно.

Messenger push использует приватный generic preview: «Новое сообщение от
клиента/куратора» и «Открыть диалог». Текст, intent payload, продукты, граммы,
имена файлов и transcript остаются внутри авторизованного messenger и в push не
передаются. Idempotency replay уже сохранённого send не создаёт повторный push.

## Инварианты

1. Auth/payment responses и legal/version документы не кэшируются как обычные
   assets.
2. Hash bundles immutable; HTML всегда должен иметь путь к свежей версии.
3. Client switch инвалидирует KV API cache до первого fetch нового клиента.
4. Update reload не должен обрывать активную auth sync.
5. Push subscription всегда принадлежит server-resolved identity.
6. iOS Safari push требует installed standalone PWA.
7. Permission prompt вызывается только из понятного user flow.
8. Push payload URL не должен обходить допустимую navigation policy.
9. Messenger push не содержит пользовательский текст или attachment metadata.
10. Отказ `localStorage` не должен превращать закрытие `What's New` в цикл.
11. «Ознакомился» в модалке правок куратора не зависит от client-scoped `lsSet`:
    ack должен уйти из runtime-очереди даже при отказе browser storage.

## Подтверждённые слабые места и пробелы

- Background Sync не является реальным queue processor: нет SW-owned durable
  queue, нет ожидания upload promise, а `SYNC_COMPLETE` отправляется через 1 с.
- `pushsubscriptionchange` не может восстановить подписку без открытой страницы;
  восстановление откладывается до следующего запуска.
- PWA update logic распределена между крупным `PlatformAPIs`, facade и SW;
  изменение message type требует проверять обе стороны.
- `pwa-update-logic.test.js` моделирует часть алгоритма отдельно, а не исполняет
  реальный `PlatformAPIs`/SW lifecycle; это полезный unit contract, но не
  browser smoke.
- Production VAPID keys, permissions и реальная доставка не проверены этим
  аудитом.
- SW push click принимает `data.url`; backend producers должны гарантировать
  безопасный same-app URL. В самом click handler allowlist не виден.

## Ключевые точки и тесты

- `apps/web/heys_platform_apis_v1.js` — registration/update/offline coordinator.
- `apps/web/heys_pwa_module_v1.js` — facade.
- `apps/web/public/sw.js` — runtime SW source.
- `apps/web/heys_push_v1.js` — browser push API.
- `yandex-cloud-functions/heys-api-push/index.js` — push backend.
- `apps/web/__tests__/pwa-update-logic.test.js` — update guards.
- `apps/web/__tests__/client-switch-reload-guard.test.js` — switch/reload guard.
- `apps/web/__tests__/push-agent.test.js` — push-related agent behavior (не Web
  Push delivery E2E).
- `apps/web/__tests__/curator-actions-banner.test.js` — очередь и retry
  подтверждения модалки правок куратора.

SW update state machine публикует структурированные события
`sw_update_detected/downloading/ready/activating`, `sw_reload_requested` и
`sw_reload_suppressed`. Они входят в один `boot_id` с событиями What's New и
позволяют отличить штатное обновление PWA от повторного reload-цикла.

Обязательный утренний check-in загружает StepModal и проверку пропущенных дней
из независимых lazy chunks. Если проверка дней загрузилась раньше и исчерпала
короткие retry, она повторно регистрирует шаг по `heys-stepmodal-ready`; пока
конфигурация шага ещё не готова, блокирующая модалка показывает статус загрузки,
а не скрывает приложение пустым экраном.

## Канонический source-push

1. Закоммить только согласованные source/test/docs/migration-файлы;
   generated/release-файлы source-only guard не пропускает.
2. Запустить `pnpm push:agent -- --dry-run --no-push` для быстрой проверки
   scope, secrets, migration safety, auth/ownership, static guards и релевантных
   тестов.
3. При нужности локального full suite отдельно запустить
   `pnpm push:preflight -- --full`; обычный push его не дублирует.
4. Запустить `pnpm push:agent -- --confirm-push`; команда не создаёт
   release-entry и не подхватывает dirty generated-файлы.
5. Deploy CI на том же source SHA запускает full Vitest, чистую legacy-сборку и
   manifest/index/hash verification; любая ошибка блокирует deploy.
6. После зелёного workflow `push:agent` сверяет production `build-meta.json` с
   pushed SHA и проверяет доступность всех hash-bundles.

## Повторное включение What's New

1. Изменить единственный флаг в `apps/web/heys_release_features_v1.js` на
   `whatsNewEnabled: true`.
2. Обновить верхнюю запись `apps/web/public/whats-new.json` для целевого source
   SHA; историю и seen-ключи не сбрасывать.
3. Запустить тесты `release-features`, `prepare-release-skip`,
   `whats-new-display`, `whats-new-seen-flag-preserved` и `push-agent`.
4. Проверить на iPhone/PWA один показ, явное закрытие, сохранение ack и
   отсутствие retry/reload-цикла.
5. После deploy проверить `build-meta.json`, hash-bundles и телеметрию
   `whats_new_shown` → `whats_new_acknowledged` без повтора в одном `boot_id`.

## Facts Table

| ID  | Утверждение                                                                  | Проверка                                                                                                                                                           | Статус               |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| W1  | SW пропускается и unregister-ится на localhost/demo                          | `sed -n '720,755p' apps/web/heys_platform_apis_v1.js`                                                                                                              | проверено 2026-07-17 |
| W2  | SW регистрируется как `/sw.js` и обрабатывает controllerchange               | `rg -n -F -e "register('/sw.js')" -e "addEventListener('controllerchange'" apps/web/heys_platform_apis_v1.js`                                                      | проверено 2026-07-17 |
| W3  | API cache routing различает no-store auth, RPC и KV SWR                      | `sed -n '266,335p' apps/web/public/sw.js`                                                                                                                          | проверено 2026-07-17 |
| W4  | Client switch инвалидирует SW KV cache                                       | `rg -n -e 'CLIENT_SWITCH' -e 'CLEAR_API_KV' apps/web/public/sw.js apps/web/heys_storage_supabase_v1.js`                                                            | проверено 2026-07-17 |
| W5  | Background sync лишь postMessage-ит START, ждёт 1 с и COMPLETE               | `sed -n '745,770p' apps/web/public/sw.js`                                                                                                                          | проверено 2026-07-17 |
| W6  | Browser push требует capability/permission и iOS standalone                  | `sed -n '120,180p' apps/web/heys_push_v1.js`                                                                                                                       | проверено 2026-07-17 |
| W7  | Push backend резолвит client/curator identity и auth-гейтит private actions  | `sed -n '90,175p' yandex-cloud-functions/heys-api-push/index.js && sed -n '380,445p' yandex-cloud-functions/heys-api-push/index.js`                                | проверено 2026-07-17 |
| W8  | SW показывает notification, обрабатывает click и subscription change         | `rg -n -F -e "addEventListener('push'" -e "addEventListener('notificationclick'" -e "addEventListener('pushsubscriptionchange'" apps/web/public/sw.js`             | проверено 2026-07-17 |
| W9  | Gateway содержит все пять push routes                                        | `sed -n '430,505p' yandex-cloud-functions/api-gateway-spec.yaml`                                                                                                   | проверено 2026-07-17 |
| W10 | `What's New` переживает отказ `localStorage` без повторного открытия         | `rg -n "SESSION_ACK_KEY\|runtimeAcknowledgedVersion" apps/web/heys_whats_new_modal_v1.js apps/web/__tests__/whats-new-display.test.js`                             | проверено 2026-07-23 |
| W11 | Ack правок куратора переживает отказ storage и не открывает pending повторно | `pnpm vitest run apps/web/__tests__/curator-actions-banner.test.js`                                                                                                | проверено 2026-07-23 |
| W12 | SW lifecycle и reload suppression входят в структурированный boot timeline   | `npx vitest run apps/web/__tests__/client-session-observability.test.js`                                                                                           | проверено 2026-07-24 |
| W13 | Sync/write telemetry агрегирована по циклу/пакету и не содержит значений     | `npx vitest run apps/web/__tests__/client-session-observability.test.js`                                                                                           | проверено 2026-07-24 |
| W14 | Lazy race StepModal/yesterdayVerify восстанавливает обязательный первый шаг  | `npx vitest run apps/web/__tests__/morning-checkin-flow-resume.test.js`                                                                                            | проверено 2026-07-24 |
| W15 | Центральный флаг выключает modal/fetch/retry и не меняет seen-state          | `pnpm exec vitest run apps/web/__tests__/release-features.test.js apps/web/__tests__/whats-new-display.test.js`                                                    | проверено 2026-07-24 |
| W16 | Deploy CI сам собирает и верифицирует legacy artifact перед upload           | `rg -n -e "Rebuild and verify legacy bundles" -e "verify-legacy-bundles" .github/workflows/deploy-yandex.yml`                                                      | проверено 2026-07-24 |
| W17 | Migration safety остаётся обязательной локально для SQL diff и всегда в CI   | `node --test scripts/db/migrate.test.mjs && rg -n -e "Migration safety" -e "migration safety gate" scripts/push-preflight.mjs .github/workflows/deploy-yandex.yml` | проверено 2026-07-24 |
