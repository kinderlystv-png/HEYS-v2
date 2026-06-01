# HEYS-v2 — Bug post-mortems

Reference of past root-cause analyses. The architecture docs (
[ARCHITECTURE.md](ARCHITECTURE.md), [DEBUGGING.md](DEBUGGING.md)) describe
**current** invariants. This file describes **how we got there** — what was
broken, what was fixed, and the pattern to watch for.

---

## Curator-session pollution: курaтор затёр 11 KV-ключей клиента (2026-05-27)

Клиентка Александра (`4545ee50-4f5f-4fc0-b862-7ca45fa1bafc`). Курaтор
(`6d4dbb32…`) зашёл в её сессию в **18:36 MSK 27 мая**. После захода 11 ключей в
её `client_kv_store` оказались перезаписаны значениями со стороны курaтора
(включая курaтор-глобальные `heys_clients`, `heys_client_current` которых вообще
не должно быть в client_kv_store клиента).

### Что фактически потеряно

| Ключ                                                              | До (snapshot 04:00) | После курaтора | Дельта                                                       |
| ----------------------------------------------------------------- | ------------------- | -------------- | ------------------------------------------------------------ |
| `heys_advice_pending_outcomes_v1`                                 | 20.8 KB             | 0.7 KB         | **−20 KB** (очередь советов схлопнулась)                     |
| `heys_ews_trends_v1`                                              | 598 b               | 465 b          | −133 b                                                       |
| `heys_products`                                                   | 42 KB               | 382 KB         | **+340 KB** (курaтор затолкал свою products LS под clientId) |
| `heys_clients`, `heys_client_current`                             | (n/a)               | курaтор-LS     | курaтор-глобальные ключи в clientId Александры               |
| `heys_debug_events`, `heys_ews_snapshot`, `heys_ews_weekly_v1`    | меньше              | больше         | курaтор-side значения                                        |
| `heys_advice_outcomes_v1`, `heys_advice_stats`, `heys_dayv2_date` | byte-equal          | byte-equal     | без изменений                                                |

**`heys_dayv2_*` не пострадали.** Воспринятое в morning checkin как «затёрто
несколько дней» — это естественное отсутствие записей 24-26 мая (Александра эти
дни не вводила еду; в snapshot 27 мая dayv2 за эти даты тоже отсутствуют).

### Что НЕ сработало

- **`data_loss_audit`** (shrink-guard): последняя запись 23 мая, на этот
  инцидент **не сработал**. Гипотеза: shrink-guard срабатывает только на путях
  которые проверяют `existing_meals`/`new_meals` (overlay/dayv2). Перезапись
  `heys_advice_*`, `heys_ews_*`, `heys_products` идёт мимо shrink-guard.
- **`client_data_changelog`**: последняя запись 18 мая. Курaтор-action на захват
  сессии и автоматический sync не пишут в changelog (changelog — только для
  явных курaтор-actions типа `water_set`, `meal_added`).

### Root cause (первоначальная гипотеза — SUPERSEDED, см. Update 2026-05-28 ниже)

> ⚠ Эта секция оставлена как исторический record первого захода. Реальный root
> cause — `cloud.saveKey` ignores whitelist (см. Update). Не цитировать как
> факт.

Курaтор-страница имеет свои global LS keys (`heys_products`, `heys_clients`,
`heys_client_current`, `heys_advice_*`, `heys_ews_*`). При открытии клиента
Александры все эти ключи попадают в её `client_kv_store` через storage
interceptor — он не различает «это курaтор-глобальное» vs «это клиент-personal».
Когда курaтор просто проскроллил по UI / посмотрел статистику, любой
автоматический writeRaw отправил весь набор курaтор-LS под scope её clientId.

См. инвариант №3 в [ARCHITECTURE.md](ARCHITECTURE.md): «PIN and curator sessions
load products identically» — но `client_kv_store` write-path не описан так же
строго.

### Restore

```bash
cd yandex-cloud-functions/heys-client-daily-backup
# S3 + PG credentials из Lockbox
eval "$(yc lockbox payload get --id e6qnjm2ks2n1ubiaiki6 --format json | python3 -c "<exporter>")"
source scripts/db/get-pg-password.sh
export PG_PASSWORD="$PGPASSWORD"
node restore-client-backup.js --client-id 4545ee50-... --date 2026-05-27 --dry-run
node restore-client-backup.js --client-id 4545ee50-... --date 2026-05-27
```

Snapshot 27 мая 04:00 MSK (за ~14ч до инцидента) восстановил 11 ключей. Все 478
KV ключей до restore = unchanged + 11 changed → diff чистый, никаких потерь от
restore.

### Update 2026-05-28: deep dive + mitigation deployed

Расширенное расследование (см. `plans/toasty-sauteeing-porcupine.md` v5)
показало **каскад из 4 независимых проблем**, не одну:

1. **Bulk revoke 19.05 13:31:35** (87 sessions Александры разом, без
   audit-записи) → её iPhone не мог логиниться 9 дней, но UI показывал «sync ✓».
2. **Pre-existing whitelist gap**:
   `heys_advice_outcomes_v1`/`_pending`/`_stats`,
   `heys_ews_snapshot`/`_trends_v1`/`_weekly_v1`, `heys_cascade_dcs_v9` —
   client-specific по семантике, но НЕ в `CLIENT_SPECIFIC_KEYS`.
3. **`cloud.saveKey` ignores whitelist** (`heys_storage_supabase_v1.js:10657`):
   если есть `currentClientId` → пишет любой `k` в `client_kv_store/{clientId}`.
   Главный root cause курaтор-pollution.
4. **Server merge default `incomingValue` без shrink-guard** для
   не-dayv2/не-scalar ключей (`heys-api-rpc/index.js:1939`).

**Mitigation deployed 2026-05-28**:
[`database/2026-05-28_curator_write_lock.sql`](../../database/2026-05-28_curator_write_lock.sql)
— колонка `clients.curator_write_locked` + триггер
`trg_block_curator_write_on_locked`. Для Александры flag установлен в TRUE.
Любая попытка курaторского write (`user_id IS NOT NULL`) в её `client_kv_store`
теперь RAISE EXCEPTION на уровне БД. PIN-сессии не блокируются.

### Полный план фиксов (deployment status 2026-06-01)

См. `plans/toasty-sauteeing-porcupine.md` — Tickets I (whitelist), J (saveKey
fix), A (cloud shrink-guard), B (server blacklist + client defence), D (status
code + client invalid_session handler), F (audit trigger на revoke), G (fetch
wrapper).

**Deployed:**

- Ticket I — `CLIENT_SPECIFIC_KEYS` whitelist
  (`heys_storage_supabase_v1.js:232`)
- Ticket J — `isNonClientDataKey` gate в `saveClientKey`
  (`heys_storage_supabase_v1.js:10252`) + defence-in-depth в `cloud.upsert` для
  direct REST path (`:10699`)
- Ticket D — invalid_session detection (`:4035`)
- Ticket F — `database/2026-05-28_audit_session_revoke.sql`
- Migrations: `curator_write_lock.sql` + `_default_on.sql` (default-on для всех
  клиентов, не per-client opt-in) + `_unlock.sql` (per-client unlock когда нужен
  legitimate курaтор-write) + `fix_pin_path_user_id.sql`

**Follow-up incident 2026-05-31** (Poplanton ↔ Aleksandra) — после Tickets J
обнаружилось что direct REST путь в `client_kv_store` обходил
`isNonClientDataKey` check на верхних уровнях. Защитили на уровне `cloud.upsert`
(`heys_storage_supabase_v1.js:10695-10712`).

---

## Morning checkin: потерянный weight + cascade diagnosis (2026-05-26)

Клиент Poplanton (`ccfe6ea3…`), gap 2 дня (24-25 мая). Ввёл вес 91.3 на первом
шаге, подтвердил пресеты yesterdayVerify для 24/25, потом закрыл модалку
крестиком (skipReasonId="no_time" — явный выбор).

**Результат в БД:**

- `dayv2_2026-05-26.weightMorning=""` ❌ (введённое значение потеряно)
- `profile.weight=90.3` ❌ (старое значение, не 91.3)
- `dayv2_2026-05-25.weightMorning=90.4` ✅ (автосреднее lifestyleAvg)
- `morningActivation.status="missed"` — UI снова просит чекин

### Первоначальный (неверный) диагноз

«StepModal swipe пропускает save, потому что save живёт в handleNext, а swipe
зовёт goToStep напрямую» (`heys_step_modal_v1.js:734-739`). Формально верно —
save действительно в handleNext. Но не дочитали до конца: save фаерится
**только** в else-ветке handleNext (на финале flow,
`heys_step_modal_v1.js:628-637`). Для non-final шагов handleNext и swipe
одинаково идут через goToStep без save. Fix «swipe → handleNext» был бесполезен
— никакого save bypass'а через swipe нет, save просто deferred до конца для
**всех** путей.

### Реальный root cause

config.save deferred to flow completion — сознательный архитектурный контракт.
Крестик/onClose **по дизайну** не зовёт save (`heys_morning_checkin_v1.js:816` —
явный комментарий «закрытие без сохранения»). Поэтому когда пользователь дошёл
до weight, ввёл 91.3, и закрыл крестиком — save для weight-шага никогда не
вызывался.

yesterdayVerify устоял потому что он immediate-пишет через lsSet в
`saveYesterdayVerify` (`heys_yesterday_verify_v1.js:1419, 1444, 1470, 1493`), не
через deferred config.save. То есть pending дни записываются сразу при
подтверждении пресета, независимо от завершения flow.

### Fix (4aa1ead7)

1. **Порядок шагов**: pending дни ПЕРВЫМИ (conditional push через
   `HEYS.YesterdayVerify.shouldShow()`), потом weight. Прогресс-бар StepModal
   больше не показывает пустой слот yesterdayVerify когда нет pending. См.
   `heys_morning_checkin_v1.js:672-731`.
2. **Weight immediate-write**: `WeightStepComponent` пишет `day.weightMorning`
   через useEffect+debounce 500ms при изменении слайдера, с `initialRef` guard
   против автозаписи seed-значения из `getInitialData` (иначе при открытии шага
   без касания слайдера в day-snapshot записался бы прошлый вес из
   `getLastKnownWeight()`). `profile.weight` остаётся за финальным config.save —
   инвариант «профильный вес = подтверждённое взвешивание» сохранён. См.
   `heys_steps_v1.js:917-975`.

**НЕ делали:** swipe → handleNext (без эффекта, см. выше); правка onClose
контракта (сознательный архитектурный выбор, ломать точечно только для
критичного weight); фикс `morningActivation.status="missed"` — это по дизайну,
отдельная задача.

### Сопутствующее: RPC 500 `log_client_event_by_session`

Параллельно расследовали 500 на boot'е (POST
`/rpc?fn=log_client_event_by_session`). Гипотезы про SQL constraint / pgcrypto /
jsonb size / ts cast — **все основаны на «SQL exception доходит до Yandex
catch»**. Не дочитали
`EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM)`
в SQL функции (`database/2026-05-25_client_event_log.sql:110-113`). Этот
catch-all **физически блокирует** все exception'ы → клиент получил бы 200 OK с
`{error: SQLERRM}`, не 500. Реально 500 = JS-уровень exception в Yandex функции.
Изначально defer'нули (commit 48244ecf), но root cause найден через несколько
часов — см. POSTSCRIPT ниже.

#### POSTSCRIPT (через несколько часов): root cause найден — TYPE_HINTS

**Реальная причина** (нашёл пользователь, не я): в
`yandex-cloud-functions/heys-api-rpc/index.js` есть таблица `TYPE_HINTS` со
списком RPC функций, для которых JS-массивы сериализуются как `::jsonb` (через
`JSON.stringify` перед `client.query`). `log_client_event_by_session`
**отсутствовал** в этой таблице. Без hint pg-driver сериализовал JS-массив
объектов как Postgres array literal (`{1,2,3}` text), не как jsonb → pg-driver
throws JS-уровня **без SQLSTATE** → catch на index.js:2785 возвращает generic
`INTERNAL_ERROR` без detail → клиент видел 500.

За сутки с момента деплоя миграции (2026-05-25) **ни одно событие** не
записалось в `client_event_log` через RPC. Каждый flush батча падал
deterministic'ом. Подтверждено в БД: при первом запросе после deploy (commit
20000a69 = `fix(api-rpc): add jsonb type hint`) первое же событие
(sync-products) записалось с id=2.

#### Урок (4-й случай каскадной ошибки в этой же сессии)

Я после «catch-all глушит SQL → значит не SQL» пошёл **горизонтально** улучшать
диагностику (3 миграции: RAISE NOTICE → WARNING → GET STACKED DIAGNOSTICS), а не
**вверх** — в JS Yandex функции где формируются параметры запроса. Лечение
симптома, не root cause.

Правильный путь: **catch-all поймал → exception источник в одном слое ВЫШЕ,
читай call site**. Для SQL функции это JS код где `client.query(sql, params)`
вызывает её — там TYPE_HINTS, prepared statement build, connection pool.
**Большинство 500 от RPC начинается именно тут**, не в SQL.

См. `feedback_partial_reads_cascade.md` (user-memory) → раздел «Расширение
правила: один слой выше когда catch-all поймал» для полного паттерна.

**Бонус ценность диагностических миграций**: «горизонтальные» фиксы не пропали
зря — после следующего 500 в любой `log_*` функции pg server log получит полный
SQLSTATE/DETAIL/HINT (RAISE WARNING + GET STACKED DIAGNOSTICS) + Yandex CF log
получит detailed error info (needsDetailedLog whitelist расширен на `log_*`).
Root cause этого инцидента fixed, но улучшенная диагностика остаётся как safety
net для будущих похожих случаев.

### Урок 1: catch-all инвертирует exception-hypotheses

Для утверждений «X вызывает Y» — читать тело функции X **до конца** ДО
формулировки гипотезы. Если у X есть catch-all (`try/catch`,
`EXCEPTION WHEN OTHERS`, fallback chain, generic error handler) — он **физически
блокирует** все exception-based выводы «снизу-вверх». Помечать такие гипотезы
«невозможно по конструкции» прежде чем перебирать root causes.

Паттерн повторился дважды в одной сессии (swipe save + RPC 500). См. user-memory
`feedback_partial_reads_cascade.md`.

### Урок 2: `EXCEPTION WHEN OTHERS THEN RETURN` — системный паттерн

Grep по `database/*.sql` нашёл **~45 occurrences в 26 файлах**. Не каждое
использование — антипаттерн: для business RPC возврат `{success: false}` —
правильное поведение. Но для **debug/logging/audit** функций глушение SQLSTATE /
detail / hint / where делает диагностику из prod-логов Yandex невозможной (catch
на index.js:2760 видит только generic `error.message`).

Action items (записано в todo.md, 48244ecf):

- Расширить `needsDetailedLog` whitelist в
  `yandex-cloud-functions/heys-api-rpc/index.js:2745` на
  `log_client_event_by_session` (иронично — log-функция без полного prod-лога).
- Для debug-RPC (`log_client_event_by_session`, `*_audit_*`, `track_*`) —
  добавить `RAISE NOTICE` стек-trace перед `WHEN OTHERS THEN RETURN`. Логически
  эквивалентно, но pg-логи получат detail.
- Poison-pill detection в client-side `_flush` (`heys_event_log_v1.js`): если
  batch упал N раз подряд — drop'нуть head event и попробовать остаток. Иначе
  один битый event навсегда блокирует всю очередь.

### Урок 3: deferred config.save vs immediate writes — design tension

StepModal config.save фаерится только на финале — сознательный контракт
(«крестик = не сохранять»). Но для **критичных полей** (вес, замеры)
пользователь интуитивно ожидает «ввёл — сохранилось». Решение: immediate write в
day-snapshot (черновик), profile-level state (TDEE/BMR база) — только финалом.
Для других полей (sleep, mood, supplements) — оставлено deferred; если
аналогичные жалобы — применить точечно, не менять контракт глобально.

---

## Parallel worktree merge: bundle/allowlist drift (2026-05-24)

Не баг продакшена — урок разработки. Запустили **два параллельных subagent'a в
worktree isolation**: Wave 2 (shrink-guard в `heys_core_v12.js` +
`heys_products_overlay_v1.js`) и Wave 5.5 (unit-тесты для event log SDK). Оба
агента отработали успешно, оба закоммитили в свои ветки.

При попытке `git push` после merge — **pre-push hook упал дважды**:

1. **`lint-direct-localstorage-writes`** — Wave 2 добавил код в
   `heys_core_v12.js`, `heys_day_utils.js`, `heys_products_overlay_v1.js`, и
   строки 5174/5285, 421/423, 927/928/929/988 в
   `scripts/bootstrap-bypass-allowlist.txt` теперь указывали на неправильные
   места (нужны были 5253/5364, 425/427, 930/931/932/991). 8 violations.
2. **`prepare-release:check`** — `legacy-sync` пересобрал bundle с новым hash
   (`b55e7d83…` → `90eea2a4…`), но `whats-new.json` ссылался на старый. Нужен
   `chore(release): bump whats-new build hash`.

### Урок

Worktree isolation защищает агентов друг от друга **во время работы**, но при
merge в main срабатывают cross-cutting эффекты:

- **Line numbers** в allowlist привязаны к абсолютной позиции в файле —
  параллельные правки в верхней части файла сдвинут все entries из нижней части.
- **Bundle hashes** генерируются из контента — изменение в любом source-файле →
  новый hash → старая `whats-new.json` entry становится stale.
- **whats-new entries** в `releases[]` массиве — два агента могут добавить
  entries параллельно, git merge оставит оба, но порядок может быть неверный.

### Workflow для будущих parallel merges

После merge всех worktree, **до push**, последовательно:

1. `node scripts/lint-direct-localstorage-writes.mjs` — если ❌, вручную
   обновить line numbers в `scripts/bootstrap-bypass-allowlist.txt`.
2. `git log -1 --format=%h` — посчитать новый hash, добавить `whats-new.json`
   entry, commit `chore(release): bump whats-new build hash to <HASH>`.
3. `pnpm test && pnpm lint && pnpm tsc` — финальный gate.
4. `git push` — теперь pre-push hook пройдёт.

---

## Orphan-баннер + cleanup hardening (2026-05-24)

День `2026-05-23` (клиент `4545ee50…`) показывал баннер «1 продукт не найден в
базе» на штатной сессии без видимой причины. Расследование вскрыло **класс
проблем** одновременно:

### Что нашли

1. **Три product_id из meal-items вообще отсутствуют в personal overlay** —
   `p_1769271889662_72os3b`, `p_1769271889661_x9nqxy`, `p_1769271889661_ina83q`
   (хлеб, творожный сыр, твёрдый сыр). Формат `p_<timestamp>_<random6>` —
   typical для `restoreFromSharedBase`
   ([heys_core_v12.js:2780](heys_core_v12.js#L2780)), массового импорта shared →
   personal. Timestamp 1769271889661 = 24 января.
2. В overlay-снимке от 10 мая (backup-key) этих 3 id **уже не было** — значит
   удалены до 10 мая. **Tombstone не проставлен** (отсутствуют в
   `heys_deleted_ids`).
3. Имена точно совпадают с тремя записями в `shared_products`. Только 2 из 3
   успевают резолвиться через shared-кеш — один остаётся в orphan-tracker из-за
   race между `getDayData` inline-tracking (на каждый re-render) и
   `recalculate()` (запускается только на shared cache load /
   heysProductsUpdated / date change).
4. `renderOrphanAlert.trulyUnresolved` фильтр
   ([heys_day_orphan_alert.js:50](heys_day_orphan_alert.js#L50)) использует
   только `HEYS.products.getById()` без fallback в shared cache — поэтому баннер
   показывает даже разрешимых orphan'ов.

### Корневая причина исчезновения 3 продуктов

`cloud.cleanupProducts()`
([heys_storage_supabase_v1.js](heys_storage_supabase_v1.js)) и мёртвый
`cleanupProductRecord` использовали shape-inference filter
`.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0)` —
тот же класс бага, что снёс 366 → 28 продуктов в инциденте 2026-05-11 (cloud
cleanup destruction). Эти функции активно вызывались из `bootstrapSync`,
full-sync defer'ов и могли удалить любую запись с нестандартной shape (overlay
TypeA, transient import-pasted объекты), **не проставляя tombstone**.

### Fix (план rustling-dazzling-bentley.md, Wave 1)

- **F1**: `cloud.cleanupProducts()` → no-op + лог. Все 3 caller-а уже обёрнуты в
  try/catch.
- **F2**: `cloud.cleanupCloudProducts()` + `cleanupProductRecord()` (мёртвый
  код, callers закомментированы после 2026-05-11) → no-op. Уменьшение surface
  для случайной реактивации.

Дальнейшие волны (Wave 2-4): централизованный shrink-guard в
`HEYS.products.setAll()` + `OverlayStore.writeRaw()` (✅ **deployed** в
`heys_core_v12.js:4671-4791` с kill-switch `__heys_disable_shrink_guard__`);
shared-fallback в renderOrphanAlert; defensive re-check в getDayData; авто-clone
из shared при тихом resolve; tombstone-aware shrink-tolerance в cloud-sync
(закрывает live bug — раньше >5% shrink REJECT в infinite loop, теперь pass если
все исчезновения tombstoned).

### Урок

Cleanup-функции с shape-inference filter — **antipattern**. Форма данных в LS
эволюционирует (overlay TypeA, tombstone-only arrays, deserialization
transients), любое «удалить если поля X нет» неизбежно убивает legitimate
записи. Единственный безопасный путь — **явный tombstone-список** (или versioned
migration). См. также CLAUDE.md правило «Never write cleanup/garbage-collection
by shape inference».

---

## Серия архитектурных hack'ов (2026-05-23)

Один день — пять связанных багов, все с одним метакорнем: **то что код заявляет
о своём поведении и то что реально делает интерсептор — расходятся**.

### 1. `refreshProfileSubscription` race с Phase A

[heys_subscriptions_v1.js:1430](heys_subscriptions_v1.js#L1430). На
`heys:auth-changed` через 200ms читал legacy `heys_profile` через `lsGet`
(memory cache возвращал stale `{}`), спредил, через `lsSet` → `nsKey()` скоупил
в `heys_<cid>_profile` → затирал результат Phase A (32-полевый профиль из БД)
4-полевым subscription-only объектом.

`shouldShowMorningCheckin` видел «incomplete» профиль и открывал wizard с
регистрационными шагами повторно после каждого reload.

**Fix**: force-raw read scoped LS + guard на `hasPersonalMarkers` — не пишем
`heys_profile` пока cloud sync не приземлил personal-поля. Subscription portion
придёт сам из той же row.v.

### 2. `ack_curator_changelog` precision-mismatch JS↔PG

[heys-api-rpc/index.js:2130-2160](../../yandex-cloud-functions/heys-api-rpc/index.js#L2130).
`Date.toISOString()` режет timestamp до миллисекунд (`.566Z`), Postgres хранит
микросекунды (`.566961`). Сравнение `created_at <= untilTs` пропускало записи с
µs, `last_seen_at` обновлялся до ms-precision, следующий запрос возвращал ту же
запись → банер показывался повторно после каждого «Понял».

**Fix**: `+ INTERVAL '1 millisecond'` tolerance к обоим UPDATE.

### 3. `heys_xp_cache_<cid>` zombie mirror

[heys_gamification_v1.js:1508](heys_gamification_v1.js#L1508). Comment заявлял
«Local-only XP cache (not synced to cloud, survives cloud overwrites)», но ключ
начинался с `heys_*` → `isOurKey()` → mirror через interceptor. В БД у клиента
1.5-месяцев старая копия XP, на cold-start на новом устройстве она приземлялась
в LS через Phase A loop и UI 30+ сек показывала неправильное число.

**Fix**: добавлен `'heys_xp_cache_'` в `LOCAL_ONLY_STORAGE_PREFIXES`
([heys_storage_supabase_v1.js:1813](heys_storage_supabase_v1.js#L1813)). Comment
теперь правда.

### 4. `heys_products_overlay_v2_BACKUP_*` тот же gap

Аналогично п.3, но новый outlier: gap в
[`isLocalOnlyStorageKey`](heys_storage_supabase_v1.js#L1816) —
`includes('_products_BACKUP_')` ловил `heys_products_BACKUP_` и
`heys_hidden_products_BACKUP_`, но **не** `heys_products_overlay_v2_BACKUP_*`
(между `products` и `BACKUP` стоит `_overlay_v2_`).

**Fix**: добавлена явная regex-проверка `/_products_overlay_v2_BACKUP_/`.

### 5. Phase A не приземлял `heys_game` / `heys_subscription_status`

[heys_storage_supabase_v1.js:6555-6580](heys_storage_supabase_v1.js#L6555).
Critical keys list изначально содержал 5 ключей:
profile/norms/products/hr_zones/today.

- `heys_game` (XP/level/badges) не входил → gamification-bar на cold-start
  показывала default totalXP=0 или ~25 (event-based partial fallback) пока full
  sync через 5-20 сек не приземлит.
- `heys_subscription_status` тоже не входил → `paywall.canWriteSync()`
  fail-open: пользователь с истёкшим триалом мог сделать write до приземления.

**Fix**: оба добавлены в Phase A. Плюс `heys_widget_layout_v1` для устранения
flash дефолтной сетки виджетов.

### Общие уроки

1. **Comment-claim ≠ runtime behavior**. Любой
   `localStorage.setItem('heys_*', ...)` зеркалится в облако через interceptor —
   это **default**, локальность нужно ОБЪЯВЛЯТЬ через
   `LOCAL_ONLY_STORAGE_PREFIXES`/`SUFFIXES`/`EXACT_KEYS`. Если comment говорит
   «local-only», но имя key начинается с `heys_` и ничего не занесено в
   blocklist — comment врёт.

2. **Race `lsGet → mutate → lsSet`** — паттерн где module читает LS, добавляет
   одно поле и пишет обратно. Если LS не приземлён cloud sync'ом — write создаёт
   частичный объект. Защита: либо force-raw read из scoped LS, либо guard на
   необходимые поля, либо server-side `mergeScalarKv` (field-level merge
   сохраняет existing).

3. **JS↔PG timestamp precision**. `Date.toISOString()` режет до миллисекунд,
   Postgres хранит микросекунды. Любое сравнение `WHERE col <= $ts` где `$ts`
   пришёл от клиента — добавлять `+ INTERVAL '1 millisecond'` tolerance.

4. **Phase A critical keys** = быстрый UI cold-start. Если UI читает ключ
   синхронно при первом рендере (gamification-bar, paywall gate, widget layout)
   — он должен быть в Phase A. Сейчас в списке 9 base-keys (~80-100 KB payload),
   запас ещё есть.

5. **Inline-cid в имени key** = архитектурный outlier. Все scoped ключи должны
   иметь форму `heys_<cid>_<base>` (prefix scope). Если cid в суффиксе
   (`heys_xp_cache_<cid>`, `heys_insights_feedback_<cid>`) — это double-scope и
   потенциальный bug при Phase A loop'е. Лечить через rename или
   `LOCAL_ONLY_STORAGE_PREFIXES`.

**Pattern to watch**: ревью любого нового `localStorage.setItem('heys_*', ...)`
писателя должно отвечать на 3 вопроса:

- Это action user-initiated или background sync?
- Объявлен ли ключ как local-only явно через `LOCAL_ONLY_STORAGE_*`?
- Защищён ли writer от race с cloud sync (force-raw read + guard или server-side
  merge)?

---

## Day-write race fix (2026-04-26)

Symptom: adding a product to a meal silently disappeared after refresh.

**Double race condition**:

1. **`flush()` closure-drift** in `useDayAutosave`
   ([heys_day_core_bundle_v1.js:2286](heys_day_core_bundle_v1.js#L2286)). React
   `useCallback` captured `day` via closure with `[day, ...]` deps. After
   `setDay(prev → newDay)` `addProductToMeal` scheduled `flush()` via
   `requestAnimationFrame(setTimeout(.., 50ms))`, but React commit hadn't
   propagated to closure → flush saw stale `day` → exited via guard
   `freshestDaySnap === daySnap` without writing.

   **Fix**: flush now reads `HEYS.Day.getDay()` (ref-based via `dayRef.current`)
   and prefers it when newer, with `force = true` to bypass downstream guards.

2. **Gamification overwrite**
   ([heys_gamification_v1.js:2270, :2549](heys_gamification_v1.js)). On
   `heysProductAdded` → `addXP → updateDailyMission/getDailyMissions` read
   `dayv2` from LS (stale, without the freshly added product), patched
   `dailyMissions` field, then wrote the entire object back — clobbering the
   user's add.

   **Fix**: re-read LS immediately before each `setStoredValue(dayKey, ...)` and
   merge only `dailyMissions` field on top of the freshest snapshot.

Both fixes needed together — fixing only one leaves the other path open.

**Pattern to watch**: callbacks scheduled outside React's commit phase
(`setTimeout`/`requestAnimationFrame`) capture closures that may be stale by the
time they fire. Always prefer ref-based reads (`dayRef.current`,
`HEYS.Day.getDay()`) over closure-captured state for late-firing writes.

---

## State-sync clobber pattern (2026-05-08)

A recurring class of bug across multiple LS-backed user-state keys.

**The pattern**:

1. Module A explicitly writes a shared LS key (e.g. `saveProfileSafe` in
   supplements writing `heys_profile`).
2. Module A dispatches a NARROW event (e.g. `heys:supplements-updated`) but not
   the broader `heys:profile-updated`.
3. React component B (e.g. `UserTabBase` in
   [heys_user_v12.js](heys_user_v12.js)) holds the same key in React state and
   listens ONLY for the broader event.
4. Component B's stale state isn't refreshed.
5. User edits any field in component B → its debounced auto-save (300ms for
   norms, 1000ms for profile/zones) writes the ENTIRE stale state back, with a
   fresh `updatedAt` → uploaded to cloud, clobbering writer's changes.

Symptom: a setting silently reverts after the user touches an unrelated field in
the user tab — sometimes minutes later, sometimes after sync roundtrip from
another device.

**Confirmed via cloud audit** for `plannedSupplements`:
`profile.plannedSupplements: []` while
`dayv2.supplementsPlanned: ["omega3","b12"]` persisted in day data — the plan
was actively synced to days but the profile field was overwritten.

**Fix template** (applied to `heys_profile`, `heys_norms`, `heys_hr_zones`):

1. **Writer side** — every explicit writer dispatches the canonical event
   (`heys:<key>-updated`) immediately after LS write. Detail object:
   `{ field?, fields?, source }`.
2. **HOT-sync interceptor** — `dispatchForegroundHotSyncProfileEvents` in
   [heys_storage_supabase_v1.js](heys_storage_supabase_v1.js) automatically
   dispatches the event whenever HOT-sync writes the key — covers cross-device
   cloud sync without each writer having to know.
3. **Listener side** — every component holding the key in React state subscribes
   to `heys:<key>-updated` and refreshes via `updatedAt` timestamp compare
   (`prevTs > newTs ? prev : incoming`) so concurrent user edits don't get
   clobbered by older external writes.

**Adding a new shared LS-backed setting** — verify:

1. Search for `setTimeout` + `lsSet`/`writeStoredValue` near the new key —
   that's the auto-save site.
2. Confirm there's a paired `addEventListener('heys:<key>-updated')` that
   refreshes state.
3. Confirm every external writer dispatches `heys:<key>-updated`.
4. If HOT-sync syncs the key, extend `dispatchForegroundHotSyncProfileEvents`.

**Already-vulnerable spots** (audit 2026-05-08):

- `heys_grams_history` — multiple meal-module writers, no event dispatch. Safe
  today (no React-state holder) but track if a future component caches it.
- Legacy `heysAdviceSettingsChanged` event naming — should rename to
  `heys:advice-settings-updated` if a listener is ever added.

---

## Morning-checkin scoped profile race (2026-05-08)

Symptom: `shouldShowMorningCheckin`
([heys_morning_checkin_v1.js](heys_morning_checkin_v1.js) ~600) у давних
клиентов на холодной загрузке мог открывать регистрационный визард на долю
секунды, хотя профиль в облаке полный.

**Root cause — race в наполнении scoped LS**: на ранней стадии boot ключ
`heys_${clientId}_profile` содержит ТОЛЬКО subscription-секцию профиля
(`subscription_status`, `trial_started_at`, `trial_ends_at`,
`subscription_ends_at` — 4 поля, ~171 байт) ДО того как Phase A / full-sync
принесут полный профиль (12 полей, ~1192 байт с `firstName`, `age`, `weight`,
`height`, `profileCompleted: true`). `shouldShowMorningCheckin` срабатывает в
этом окне → `isProfileIncomplete` возвращает true → wizard открывается.

Кто пишет subscription-only snapshot — точно неизвестно (stack trace в
`cloud.saveClientKey` пустой, значит запись идёт мимо canonical save-path),
вероятно через `interceptSetItem` mirror logic или subscription/trial init. Это
open question, но фикс работает независимо.

**Защита (3 слоя)**:

1. **`readProfileForceRawScoped`**
   ([heys_morning_checkin_v1.js:44](heys_morning_checkin_v1.js#L44)) +
   inline-копия в
   [heys_app_morning_checkin_v1.js:10](heys_app_morning_checkin_v1.js#L10).
   Используют `isProfileShape()` критерий:
   `(p.age || p.weight || p.height || p.firstName || p.profileCompleted === true)`
   — идентичный HOT-sync guard в `cloud.saveClientKey` ~9893. Subscription-only
   возвращается как `null`, fallback на legacy `heys_profile`.

2. **`shouldShowMorningCheckin` defer-guard**
   ([heys_morning_checkin_v1.js:590](heys_morning_checkin_v1.js#L590)). Если
   scoped LS имеет subscription-маркеры но НЕ имеет personal-маркеров,
   возвращаем `false` (sync in progress) — wizard НЕ открывается. Time-based
   ограничение 8 секунд от `cloud._syncCompletedAt`: для новых клиентов без
   cloud-профиля subscription-only состояние permanent → после 8s defer не
   блокирует. Лог:
   `[MorningCheckin] 🛡️ partial subscription-only profile — sync in progress, deferring wizard`.

3. **Phase A / full-sync / delta-light guards** в
   [heys_storage_supabase_v1.js](heys_storage_supabase_v1.js) (~6397, ~6700,
   ~8174). Не клобберим валидный local профиль пустым `{}` из cloud при синке —
   симметрично с уже существующим guard в `cloud.saveClientKey` (~9893). Лог:
   `🛡️ [PHASE A]/[DELTA LIGHT]/[FULL SYNC] BLOCKED empty profile from cloud`.

**Если симптом возвращается** — раскомментировать debug-лог в
`readProfileForceRawScoped`:
`console.error('[MorningCheckin] readProfileForceRawScoped DIAG', ...)`. По
полям видно стадию race'а: `scopedKeys: 4` subscription-only / `scopedKeys: 12`
полный.

**Cleanup poisoned scoped LS** (если у пользователя застрял bad state):

```js
localStorage.removeItem(`heys_${HEYS.currentClientId}_profile`);
location.reload();
```

---

## Legacy `heys_products` retirement (2026-05-10 / 2026-05-11)

**Goal**: убрать второй ключ `heys_products` после rollout overlay v2 как
canonical source. Phase 1-2в выполнены.

**Phase 1** (commit `52386c97`): убраны fallback reads
`|| lsGet('heys_products', [])` в 11 файлах.

**Phase 1б** (commit `fabb56f7`): фикс orphan-recovery bug (читал из legacy
вместо overlay).

**Phase 2а** (commit `fabb56f7`): удалены dead `else lsSet` branches в 2 файлах.

**Phase 2б** (commit `4b78dcc8`): removed 13 dead `else lsSet` write cascade
branches across `heys_core_v12.js`, `heys_add_product_step_v1.js`. Atwater
migration switched to overlay API.

**Phase 2в** (commit `2796d4da`):

- `heys_app_auth_init_v1.js` — `heys_products` removed from PIN-auth
  `keysToMigrate`
- `heys_app_sync_effects_v1.js` — added `overlay_products_v2` flag guard around
  `saveClientKey('heys_products', ...)` debounced effect
- `heys_app_backup_v1.js` — backup read switched to `HEYS.products.getAll()`,
  restore goes through `setAll()`

**Seed-fix** (commit `f6415481`): `initLocalData` + sync rollback path stopped
seeding React state from legacy `heys_products` LS. This was the root cause of
curator/PIN tab showing 390/443 products when canonical was 367 — stale cloud
legacy mirror (last updated 2026-05-09) was hydrating React state at boot, then
overlay overwriting, then stale path firing again.

**Cloud cleanup 2026-05-11**:

- Удалены данные 48 orphan client_ids (3.2 MB) — заархивированы в
  `client_kv_store_archive_20260511`
- У 2-х активных клиентов удалён stale legacy `heys_products`
- У одного клиента `heys_hidden_products` (300 объектов, 433 KB — багованный
  формат) сконвертирован в правильный массив ID (289 строк, 7 KB)

**Pattern uncovered**: stale cloud data + interceptor that mirrors current →
legacy can recreate phantom "old version" for years after canonical migration.
Migrating code is not enough — need to clean source data too.

**Remaining (Phase 3)**: remove interceptor block in
`heys_storage_supabase_v1.js` (~lines 4022-4155), fix `initLocalData` to read
overlay LS key directly (before wrapper loads), retire `dual_write_legacy`
feature flag. See [todo.md](../../todo.md) «Legacy heys_products».

---

## Orphan data leak in `client_kv_store` (2026-05-11)

Symptom: 48 client_ids accumulated ~3.2 MB of data in cloud despite being
deleted from `clients` table months ago.

**Root cause #1**: `client_kv_store` was the only table referencing
`clients(id)` without a FK constraint. When curator deleted a client via UI, the
`clients` row was removed but kv_store data remained orphan. 10 other tables
(consents, payments, subscriptions, ...) had `ON DELETE CASCADE` — kv_store was
the asymmetric outlier.

**Root cause #2**: trigger `fn_bump_change_marker` on
`client_kv_store AFTER INSERT/DELETE/UPDATE FOR EACH ROW` blindly UPSERTed into
`client_change_markers` for every changed row. The marker's own FK to `clients`
(with CASCADE) made any cleanup of orphan kv_store rows impossible without admin
workarounds: trigger fires → INSERT into markers → FK violation because the
orphan client_id has no `clients` row.

**Fix** (migration `database/2026-05-11_kv_store_cascade.sql`, applied
2026-05-11):

1. Added EXISTS guard to `fn_bump_change_marker` — silently skip orphan
   client_id (defense in depth).
2. Added FK `client_kv_store_client_id_fkey` with `ON DELETE CASCADE`.

After migration:

- DELETE FROM clients automatically removes corresponding kv_store rows
- INSERT with non-existent client_id is rejected by FK validation
- Future orphans are structurally impossible

**Cleanup procedure used** (one-time, before adding the FK — preserved as DR
reference):

1. Backup orphan data to `client_kv_store_archive_20260511`
2. Insert temporary placeholder rows into `clients` for each orphan client_id
3. DELETE FROM client_kv_store WHERE client_id NOT IN (active list) — trigger
   now succeeds because clients row exists
4. DELETE FROM clients WHERE name LIKE '_garbage_cleanup_%' — CASCADE removes
   markers

**Pattern to watch**: when adding a new table that references `clients(id)`,
always include `ON DELETE CASCADE`. Audit other tables periodically — any
missing FK is a future orphan leak.

---

## Cloud cleanup destroying overlay data (2026-05-11)

Symptom: curator opened Poplanton client and table showed 139 products instead
of 366. Hard reload restored to 366. Logs revealed `[CLOUD CLEANUP]` silently
deleting valid data on every switch and once per boot.

**Root cause**: `cleanupProductRecord` in
[heys_storage_supabase_v1.js:5228](heys_storage_supabase_v1.js#L5228) decides
"valid vs invalid" by checking `.name` field:

```js
const cleaned = products.filter(
  (p) => p && typeof p.name === 'string' && p.name.trim().length > 0,
);
```

This logic predates the overlay v2 rollout. The breakage:

1. **Overlay TypeA rows** have shape
   `{id, shared_origin_id, overrides, in_my_list}` — `.name` lives in the shared
   catalog, denormalized at read time. Cleanup classifies all TypeA rows as
   garbage. Observed: 366 → 28 (338 rows wiped in single pass).
2. **`heys_hidden_products`** is an array of product IDs (strings). Strings have
   no `.name`. Cleanup deletes the whole key as "garbage".
3. **`heys_favorite_products`** — same shape, same fate.
4. **Backup keys** (`*_BACKUP_*`) get matched by the cleanup's regex and pruned
   too.

Affected for Poplanton (`ccfe6ea3`):

- `heys_hidden_products`: 289 IDs → deleted entirely
- `heys_favorite_products`: 4 IDs → deleted entirely
- `heys_products_overlay_v2`: temporarily 366 → 28 (LS restored on next sync)
- `heys_products_overlay_v2_BACKUP`: 433 → 139 (cleanup pruned the backup)

The overlay destruction was not permanent because LS still held the 366 rows and
pushed them back to cloud via auto-sync. If user had cleared LS first, data
would be lost.

**Fix** (commit `78d9136e`): disabled all three `cleanupProductRecord` /
`cleanupCloudProducts` call sites (bootstrap clientSync ~6516, full-sync
post-completion ~8714). Left explicit comments naming the breakage modes.
Restored `heys_hidden_products` for Poplanton from `_BACKUP_20260510` by
re-running the object→ID conversion that worked the day before.

**Pattern**: never write cleanup / GC functions that decide validity by **shape
inference** (presence of fields). Any future data shape evolution
(normalization, ID-only tombstones, schema version bump) makes the old shape
look like garbage to the cleanup. Use explicit tombstones, version numbers, or
migrations instead.

**Still owed** (see [todo.md](../../todo.md)): rewrite cleanup to handle overlay
v2 shape + pure-ID arrays + backup-key skip list. Until then, the function stays
disabled.
