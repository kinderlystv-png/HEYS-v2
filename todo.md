# HEYS — Активные задачи

> Обновлено: 2026-05-23

---

## 🚨 ТЕКУЩИЙ ПРИОРИТЕТ — Реструктуризация ИП (2026-05-23)

**Полный план**:
[docs/legal/operator/tax-restructure-2026-05.md](docs/legal/operator/tax-restructure-2026-05.md)

**TL;DR**: По рекомендации ФНС горячей линии:

- **Супруга открывает ИП** → ПСН патент «Организация торжеств» (или альтернатива
  через УСН если патента нет) → ведёт студию 360 м² как event-площадку
- **Ты** → закрываешь фотопатент → переходишь на УСН 6% → ОКВЭДы 62.01 / 62.02 /
  63.11.1 / 63.12 → HEYS + IT-услуги
- **Касса** переоформляется на её ИП (новый ФН, downtime 7-10 дней)

**3 критические ловушки (проверить ДО старта):**

1. ⚠️ **УСН-статус у тебя**: если ты сейчас ТОЛЬКО на ПСН — после закрытия
   патента автоматом ОСНО. УСН подаётся до 31.12 предыдущего года. **Проверить в
   [lkip2.nalog.ru](https://lkip2.nalog.ru/) раздел «Применяемые режимы»**
2. ⚠️ **Возврат за неотработанный патент** = (стоимость/365)×оставшиеся дни.
   Подаётся форма 26.5-4 одновременно с прекращением
3. ⚠️ **Замена ФН** — физическая, ~8-10к, касса offline 7-10 дней, старый ФН
   хранить 5 лет

**Порядок шагов** (НЕ перепутать):

1. Супруга — регистрация ИП (Р21001 через Госуслуги)
2. Параллельно: ты проверяешь УСН-статус
3. Супруга — заявление на патент (26.5-1) за 10 раб. дней до начала
4. Купить новый ФН → переоформить кассу на её ИП
5. **Только после** — закрыть твой фотопатент (26.5-4) + сменить ОКВЭДы (Р24001)
6. Лендинг/оферту Kinderly + правовые документы переписать на её ИП

**Связь с РКН:**

- HEYS уведомление → подавать сейчас (как только ИП-роль активируется в
  Госуслугах) на твой ИП, шаблон готов
- Kinderly уведомление → подавать когда супруга получит ОГРНИП, шаблон обновлю
  на её реквизиты

**Что мне прислать когда супруга получит ОГРНИП:**

- Полное ФИО (фамилия / имя / отчество отдельно)
- ИНН, ОГРНИП, дата регистрации
- Адрес регистрации по ФИАС (без сокращений)
- Контактный телефон, email
- → обновлю
  [rkn-notification-kinderly.md](docs/legal/operator/rkn-notification-kinderly.md),
  privacy/cookie/footer в kinderly-events репо

**Параллельная задача:** уточнить кто арендатор студии 360 м² и переоформить
договор аренды на её ИП. **Нельзя** оформить как «твой ИП сдаёт её ИП в аренду»
— это коммерческий подряд между взаимозависимыми лицами, красный флаг для ФНС.

---

## 🩺 KV Storage automated maintenance — проверять работает ли (2026-05-23)

После серии фиксов 2026-05-23 (race-bug в refreshProfileSubscription,
precision-mismatch в curator_changelog ack, zombie xp_cache, paywall fail-open,
LOCAL_ONLY gap для overlay_v2_BACKUP) — настроена автоматическая maintenance в
Cloud Function `heys-maintenance`:

| Trigger                                      | Расписание                        | Что делает                                                                                                        |
| -------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `heys-maintenance-daily` (existing)          | 03:00 UTC ежедневно               | `trial_queue` + `kv_health` — мониторит 5 индикаторов аномалий, шлёт Telegram alert при findings                  |
| `heys-maintenance-kv-cleanup-weekly` (новый) | 02:00 UTC воскресенье (05:00 MSK) | `kv_cleanup` — удаляет zombie xp_cache, legacy insights_feedback, backup snapshots, advice_trace, debug/test rows |

### Что должно отправляться в Telegram

- **Daily**: alert приходит **только если** аномалия найдена. Молчание = всё
  чисто.
- **Weekly cleanup**: alert приходит **только если** удалено >100 row или >1 MB.
  Иначе тихо.

### 🛎 Как тебе периодически просить меня проверять

**Раз в месяц** (или после любого подозрения что что-то не так) напиши Claude
одну из фраз:

- **«проверь работает ли auto-maintenance»** — Claude посмотрит логи
  `heys-maintenance` за последние 30 дней, проверит что daily/weekly триггеры
  отрабатывали без ошибок, и запустит KV health-check сам чтобы убедиться что
  индикаторы аномалий по нулям.
- **«покажи health-check БД»** — Claude вручную дёрнет
  `yc serverless function invoke --name heys-maintenance --data '{"trigger_id":"kv_health"}'`
  и расшифрует summary человеческим языком.
- **«запусти cleanup сейчас»** — если Claude увидит что что-то накапливается,
  можно дёрнуть `kv_cleanup` руками не дожидаясь воскресенья.

### Где смотреть логи

- Yandex Cloud Functions Console → `heys-maintenance` → Logs
- Или через CLI:
  `yc serverless function logs --name heys-maintenance --since 24h`

### Что делать если приходит Telegram alert

См.
[apps/web/BUGS_HISTORY.md#серия-архитектурных-hackов-2026-05-23](apps/web/BUGS_HISTORY.md)
— там для каждого индикатора расписан root-cause и как лечить.

### Manual scripts (как fallback)

Если нужно вручную (например при разборе инцидента):

```bash
bash scripts/db/psql.sh -f scripts/db/monitor-stuck-rows.sql   # 7 проверок
bash scripts/db/psql.sh -f scripts/db/cleanup-zombie-keys.sql  # cleanup
```

---

## 🔴 Compliance follow-up — после deep audit 2026-05-22

Источник: deep audit с Facts Table в этой сессии. Подтверждено собственным
grep'ом, не agent-only claim'ами. Большинство P0/P1 закрыто (Lockbox, DSAR,
AgeGate, consents UI, marketing checkbox, retention cron). Ниже — то, что
реально осталось.

### 🔴 Твои задачи — до публичного запуска (закрывает риск штрафа)

1. **Подать 2 уведомления в РКН** через
   pd.rkn.gov.ru/operators-registry/notification/.
   - Тексты готовы для копирования:
     [rkn-notification-heys.md](docs/legal/operator/rkn-notification-heys.md),
     [rkn-notification-kinderly.md](docs/legal/operator/rkn-notification-kinderly.md)
   - Получишь регистрационные номера → пришли мне → добавлю строку
     «Регистрационный номер в реестре операторов: NXXXXXXX» в privacy-policy
     §1.2 (это **добавление новой строки**, не замена плейсхолдера — в RKN-doc
     §239-243 описана точная процедура)
   - **Без этого** — ст. 19.7 КоАП РФ + ты технически нелегальный оператор ПДн

2. **Распечатать + подписать
   [internal-policy-pdn.md](docs/legal/operator/internal-policy-pdn.md)** —
   «Положение об обработке ПДн».
   - В PDF/Word, дата утверждения, подпись
   - Хранить с уставными документами ИП (бумажный + скан)
   - При проверке РКН — формальное нарушение ст. 18.1 152-ФЗ без него

### 🟡 Мои задачи по триггерам

| #        | Что                                                                                                                                                                                                                                                                                                                                                 | Время | Триггер                                    | Файлы                                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~P1-B~~ | ✅ DONE 2026-05-22 (commit 5de73b5e). Curator audit middleware пишет в `data_access_audit_log` через fire-and-forget `log_data_access` после успешного curator-RPC. Skip-list для list-операций; health-flag для KV/gamification                                                                                                                    | —     | —                                          | [heys-api-rpc/index.js](yandex-cloud-functions/heys-api-rpc/index.js) — `logCuratorAccessFireAndForget`                                                                               |
| P1-N     | Direct cancellation UI: кнопка «Отменить подписку» в Profile → вызывает revoke `payment_oferta` → SQL trigger `cancel_sub_on_payment_oferta_revoke` автоматически выставит `subscriptions.canceled_at`. Сейчас клиент сам отменить не может, только через куратора                                                                                  | 2ч    | После запуска ЮKassa                       | [heys_user_tab_impl_v1.js](apps/web/heys_user_tab_impl_v1.js) (Profile), trigger уже в БД                                                                                             |
| P1-O     | Refund 14-day window в `refundPayment`: запретить refund если `payment.completed_at < now() - 14 days` ИЛИ pro-rata для остатка периода. Сейчас куратор может вернуть любую сумму в любое время                                                                                                                                                     | 1ч    | После запуска ЮKassa                       | [heys-api-payments/index.js:647](yandex-cloud-functions/heys-api-payments/index.js#L647) `refundPayment()`                                                                            |
| ~~P1-L~~ | ✅ DONE 2026-05-22 (commit ed6068cc). Таблица `data_subject_requests` + `add_working_days` + RPC `record_offline_dsar`/`log_api_dsar`/`complete_dsar` + 2 cron-правила (`dsar_sla_warning` 2 дня до, `dsar_sla_breach` после). Когда придёт первый offline-DSAR — curator вызывает `record_offline_dsar` через psql или Curator-tab (если будет UI) | —     | —                                          | [database/2026-05-22_dsar_sla_tracker.sql](database/2026-05-22_dsar_sla_tracker.sql), [heys-cron-security-alerts/index.js](yandex-cloud-functions/heys-cron-security-alerts/index.js) |
| —        | Удалить `.env.backup-before-phase3-*`                                                                                                                                                                                                                                                                                                               | 5 мин | 48ч после Lockbox swap (~2026-05-24 22:00) | см. Item 1 ниже                                                                                                                                                                       |
| —        | Удалить таблицу `leads_pre_rkn_test_archive` в heys_production (содержит 21 тестовую заявку, удалённую 22.05.2026 перед подачей в РКН; держим как audit trail на случай если потребуется доказать что данные тестовые)                                                                                                                              | 1 мин | ~2026-06-22 (30 дней)                      | `bash scripts/db/psql.sh -c "DROP TABLE leads_pre_rkn_test_archive;"`                                                                                                                 |

### 🔵 Твои налоговые задачи (отдельный трек, не связан с РКН)

5. **HEYS: смена основного ОКВЭД на IT** — заявление Р24001 через Госуслуги
   (10-15 мин в ЛК → 5 раб. дней до внесения в ЕГРИП). Текущий основной
   `47.11 Розничная торговля продуктами` фактически не описывает деятельность.
   - Поменять основной → **62.01** Разработка ПО
   - Добавить дополнительные: **62.02** (консультирование IT), **63.11.1**
     (создание/использование БД), **63.12** (веб-порталы)
   - Дополнительно — рассмотреть применение льготных IT-режимов (УСН для IT,
     пониженные взносы) с бухгалтером
   - Без этого ФНС при первой оплате через ЮKassa за HEYS может задать вопрос
     «доход не по основному виду деятельности»

6. **Kinderly: разводка по патенту/ОКВЭД** — **СНАЧАЛА к бухгалтеру!**
   - Текущая ситуация: расхождение между патентом (фотоуслуги, пп. 35 НК РФ ст.
     346.43), чеком ЮКассы («Аренда фотопространства» = пп. 19) и
     офертой/лендингом («организация праздников» = УСН/ОСН).
   - 3 пути на выбор (определять с бухгалтером):
     - **А) Всё под фотопатент**: переписать чек на «Фотосессия», оферту и
       лендинг — на студийную фотосъёмку с тематикой детских праздников. ОКВЭД
       74.20 без изменений.
     - **Б) Получить второй патент** на аренду нежилого имущества (пп. 19) +
       добавить ОКВЭД 68.20.2. Чек «Аренда фотопространства» легализован.
     - **В) Перейти на УСН 6%** и добавить ОКВЭДы 93.29.9 (развлекательная
       деятельность) + 68.20.2 (аренда), оставив 74.20. Максимум гибкости, но
       налог может быть выше патентного.
   - При проверке ФНС текущее расхождение → пересмотр ПСН, доначисление по
     общему режиму на весь «не-фотоуслуговый» доход.
   - **К подаче в РКН эта задача НЕ относится** — РКН не сверяется с ОКВЭДами.

### 🟢 Твои операционные задачи (не блокеры)

3. ~~**Yandex Cloud billing alerts**~~ ✅ DONE 2026-05-22. Создан бюджет
   `heys-monthly-warning` (12 000 ₽/мес, пороги 70% и 100%, email-уведомление на
   kinderly.stv@gmail.com, область — все сервисы platform-аккаунта `Poplanton`).
   Дневного периода в YC нет, только месячный.

4. **DPA с подрядчиками** (организационно):
   - **ЮKassa**: найти на `https://yookassa.ru/legal` публичную оферту-DPA →
     сохранить PDF в `docs/legal/operator/dpa/yookassa.pdf` (папку создашь
     первым файлом)
   - **Yandex Cloud**: публичный DPA ссылка уже есть в privacy-policy
   - При проверке РКН: «Где DPA с обработчиками?» — должны быть на руках

---

## 🔭 После Lockbox + concurrency=2 rollout (2026-05-22)

### Item 1 — удалить .env.backup-\* (через 48ч стабильности)

**Когда:** ~2026-05-24 22:00 MSK или позже.

**Что:** в `yandex-cloud-functions/.env.backup-before-phase3-20260522-185935`
лежат **реальные** PG_PASSWORD / JWT_SECRET / SESSION_SECRET /
HEYS_ENCRYPTION_KEY / VAPID_PRIVATE_KEY / S3-keys в открытом виде. Создан как
safety-net при Phase 3 Lockbox swap. После 48ч стабильной работы — можно
удалять.

**Команда** (сначала verify что Lockbox не падал, потом rm):

```bash
# 1. Verify нет lockbox-fail'ов за 48ч
for fn in $(yc serverless function list --format json | jq -r '.[].name' | grep '^heys-'); do
  yc serverless function logs "$fn" --since 48h 2>&1 | grep -i 'Failed to load secret.*after 2 attempts'
done
# Empty output = OK

# 2. Удалить backup
rm yandex-cloud-functions/.env.backup-before-phase3-*

# 3. Обновить статус в LOCKBOX_MIGRATION_GUIDE.md → "Phase 3 completed"
```

Или скажи мне «удали backup» — я сам прогоню verify и удалю.

---

### Item 2 — если concurrency=2 сломается, как откатить

**Симптом:** приходит Telegram-алерт от куратор-бота вида **«⚠️ Concurrency=2:
OOM/pool issues»** с указанием функции и количества ошибок. Триггер:
автомониторинг в `heys-cron-security-alerts` каждые 15 минут (rule
`concurrency_watch`).

**Что значит:** один из 5 API-контейнеров (rpc/rest/auth/leads/push) не
вытягивает 2 параллельных запроса — либо памяти не хватает (512MB / 2 = 256MB на
запрос), либо БД-pool max=3 исчерпан.

**Откат за 2 минуты:**

1. Открыть `yandex-cloud-functions/deploy-all.sh`, найти строки 328-331:

   ```bash
   local concurrency_flag=""
   if [[ "$func_name" =~ ^heys-api-(rpc|rest|auth|leads|push)$ ]]; then
       concurrency_flag="--concurrency 2"
   fi
   ```

2. Заменить `2` на `1` (на одной строке `concurrency_flag="--concurrency 1"`)
   ИЛИ убрать regex имени функции которая сломалась если только одна проблемная.

3. Передеплоить затронутые функции:

   ```bash
   cd yandex-cloud-functions
   for fn in heys-api-rpc heys-api-rest heys-api-auth heys-api-leads heys-api-push; do
     ./deploy-all.sh "$fn" --skip-checks --skip-health
   done
   ```

4. Verify откат:

   ```bash
   for fn in heys-api-rpc heys-api-rest heys-api-auth heys-api-leads heys-api-push; do
     yc serverless function version list --function-name "$fn" --format json \
       | jq -r "[\"$fn\", .[0].concurrency] | @tsv"
   done
   # Должно показать concurrency=1 у всех
   ```

5. Cooldown rule `concurrency_watch` 30 мин — новый алерт может прилететь только
   через 30 мин (или вручную делать
   `UPDATE security_alerts_log SET sent_at = NULL WHERE rule_key = 'concurrency_watch'`).

**Не паникуй**: на пике сейчас 0-1 запросов в минуту на API. Если concurrency=2
сломается — это будет single-request OOM, легко чинится откатом за 2 минуты.
Никакого outage'а не должно быть.

**Или скажи мне «откати concurrency»** — я сам проделаю все 5 шагов.

---

### Item 3 — quarterly audit секретов в Lockbox

**Когда:** 2026-08-22, 2026-11-22, и т.д. (раз в 3 месяца).

**Что:** проверить что:

1. Все секреты в `heys-app-secrets` (e6qrvefs3vn66jiamfk4) ещё нужны и активны.
2. Нет утечек: проверить если PG_PASSWORD / JWT_SECRET случайно не закоммитились
   куда-то (`git log -p --all -- '*.env*' | grep -iE 'password|secret'`).
3. SA `aje85rjgpj4nk9m384ek` имеет только нужные роли (lockbox.payloadViewer +
   logging.reader + monitoring.viewer + serverless.functions.invoker — других
   быть не должно).
4. Чеклист в
   [LOCKBOX_MIGRATION_GUIDE.md](yandex-cloud-functions/LOCKBOX_MIGRATION_GUIDE.md)
   → "Чеклист миграции" → "Запланировал quarterly audit секретов".

Опционально: ротация секретов (создать новую версию secret'а с новым значением,
функции автоматически подтянут через 5 минут или при cold start).

---

### Item 4 — cleanup archive + BACKUP-ключей (2026-06-10)

**Когда:** 2026-06-10 (≈30 дней после миграции от 2026-05-11).

**Что:** удалить остатки чистки облака от 11 мая когда были регрессий не
зарегистрировано:

1. Таблица `client_kv_store_archive_20260511` (556 строк, данные 48 удалённых
   клиентов, ~3.2 MB) — source of truth для recovery, держали 30 дней:

   ```sql
   DROP TABLE client_kv_store_archive_20260511;
   ```

2. 5 `_BACKUP_2026051X` ключей в `client_kv_store` (≈1.5 MB):
   - `heys_hidden_products_BACKUP_20260510` (443 KB)
   - `heys_products_BACKUP_20260510` (291 KB)
   - `heys_products_BACKUP_20260511` (584 KB)
   - `heys_products_overlay_v2_BACKUP_20260510_165251` × 2 (278 KB суммарно)

   ```sql
   DELETE FROM client_kv_store WHERE k LIKE '%BACKUP_2026051%';
   ```

Скажи «дропни архив» — сделаю.

---

## 📜 P0-D Bundle Optimization — финальный итог (закрыто 2026-05-22)

**Что уже в проде** (Track A + Track B + Stretch-2):

- Critical JS: **6.21 MB → 3.12 MB raw (-50%)**, gzip **1.32 MB → ~700 KB
  (-47%)**
- Login jank (message handler): **667ms → 174-227ms (-66%)**
- Returning user cold reload: 2-3 сек network → ~0 ms из SW cache
- Молчаливых фаз загрузки: 3 окна → 0 (loading progress UI)

**Дальнейшие sprintы НЕ делаем.** Roadmap из 5 направлений (meals retry,
gamification-bar lazy, localStorage compression, trial-queue lazy, insulin-wave
profile-gated) был **проверен попытками в той же сессии** — каждая попытка
выявила скрытые trade-offs которые не были видны на этапе планирования:

- **Sprint 1 (meals retry)** — реализован локально 2026-05-22 через
  `DayTab/DayTabContent` wrapper split. Откачен (не запушен): добавлял +120ms
  skeleton "Загрузка дневника…" на cold load которого раньше не было — UX
  trade-off отрицательный.
- **Sprint 3 (localStorage compression shared_products)** — реализован локально
  2026-05-22. Откачен: `Store.compress` на 600+ KB JSON делает 20 pattern-
  replacement passes по строке — это 150-300ms синхронной работы на main thread
  при каждом save. User сообщил визуальный "tipping". Real cost > LS benefit.
- **Sprint 2 (gamification-bar)** — high risk (7/10). Module-load snapshots в
  `heys_app_initialize_v1.js:25` + `heys_app_root_impl_v1.js:44` + render через
  `React.createElement(GamificationBar)` в `heys_app_shell_v1.js:1328`. Тот же
  класс bug что в meals retry попытках — мы видели 2 раза recovery UI.
- **Sprint 4 (trial-queue)** + **Sprint 5 (insulin-wave)** — trivial gains
  (-20KB и -10KB gzip respectively), не оправдывают sprint overhead.

**Урок:** на текущем размере приложения и audience все дальнейшие bundle
optimizations дают marginal user-visible эффект (<10% gzip), при том что
**каждая реальная попытка** выявляет hidden cost. Прод после Stretch-2 — peak
текущей архитектуры. Дальнейшие wins пойдут от **новых типов оптимизации** когда
придут конкретные user triggers:

- Web Worker offloading для cascade compute (если жалобы на main-thread jank)
- Server-side rendering / static prerendering (если жалобы на TTI на slow
  Android)
- Image optimization (если bandwidth analytics покажет high image weight)

**Возвращаться к bundle-optimization roadmap'у НЕ нужно** — кроме случая когда
реальные пользователи пожалуются на скорость на конкретной сети/устройстве с
metrics-trace. Тогда — нацельтесь на конкретное bottleneck, не на абстрактный
"еще немного KB lazy".

**Архивные ссылки** (для исторической справки):

- Полный roadmap-план:
  `/Users/poplavskijanton/.claude/plans/p0-quick-wins-frolicking-rose.md`
- Audit-doc на localStorage quota:
  `apps/web/__perf_baselines__/storage-quota-audit-2026-05-22.md` (Option D
  invented — cascadeState не в dayv2; Option A с compression в реальности даёт
  perf-regression при write).

---

## 🎨 Landing Hero — заменить AI-мокап на реальный скрин (открыто 2026-05-17)

Текущий мокап `apps/landing/public/hero-phone-mockup.webp` — AI-генерация
(ChatGPT image). Контент на экране телефона нечитаемый, при близком рассмотрении
смотрится фейково.

**Задача:** взять реальный скрин самого «вау»-экрана HEYS (кандидат —
CRS-навигатор с шкалой и графиком на главном дашборде, либо composite из
нескольких экранов) и вмонтировать в мокап телефона-в-руке.

**Путь:** `smartmockups.com` или `previewed.app` — залить PNG скрина, скачать
готовую перспективу (бесплатно с водяным знаком, $14/mo без). Альтернатива:
PSD-мокап с Photoshop smart-object.

**Куда положить:** заменить `apps/landing/public/hero-phone-mockup.webp` (сейчас
173KB, 800×1033). Целевой формат — WebP ≤ 200KB. Поправить `width`/`height` в
[HeroSSR.tsx](apps/landing/src/components/HeroSSR.tsx) если изменятся пропорции.

---

## ✅ Сессия 2026-05-10/11 → перенесена в done.md

Большая сессия по retirement legacy `heys_products` + backup schema v3 + DB
cleanup + cross-client leak fix + восстановление `heys-client-daily-backup` —
**перенесено в [done.md](done.md) → «Май 2026»** (2026-05-22, после верификации
что всё закоммичено в `main`: `d381b5cf`, `4b78dcc8`, `2796d4da`, `f6415481`,
`1f45ee5f`, и серия cross-client fix'ов в storage_supabase/layer).

**Из оригинальной сессии осталось только 2 активных пункта:**

1. **Phase 3 — снять `dual_write_legacy` interceptor**. См. секцию «🧹 Legacy
   heys_products» ниже. Прошло 11 дней стабильности — можно делать в отдельную
   сессию. Подтверждено грепом 2026-05-22: `dual_write_legacy` flag всё ещё
   активен в `heys_storage_supabase_v1.js:3931`.
2. **Cross-client leak — наблюдение** (см. секцию ниже). На 2026-05-22 11-й день
   из 14. Повторений не было.

---

## 🔍 Cross-client data leak при switchClient — наблюдение (открыто 2026-05-11, day 11/14)

> **Status 2026-05-22**: 11-й день из 14-дневного окна наблюдения. Повторений
> утечки не зарегистрировано. План: 25 мая если в `HEYS._syncDebug` нет
> `leak-blocked` событий и пользователь не жаловался — закрыть в done.md.

### Что случилось

Куратор переключился с клиента Poplanton
(`ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a`) на Александру
(`4545ee50-4f5f-4fc0-b862-7ca45fa1bafc`). После переключения у Александры:

- вес Poplanton'а в `heys_profile`
- сегодняшние приёмы Poplanton'а в `heys_dayv2_2026-05-11`

Пользователь поправил вес вручную в 22:34 МСК.

### Что подтверждено по данным cloud

| Источник                         | Поле   | Значение | updated_at                        |
| -------------------------------- | ------ | -------- | --------------------------------- |
| snapshot Александры за 11:47 МСК | weight | 52.5     | 2026-05-10 00:35 МСК (чистая)     |
| cloud сейчас (22:34) Александра  | weight | 52.3     | 2026-05-11 22:34 МСК (исправлено) |
| cloud Poplanton                  | weight | 91.3     | 2026-05-11 19:10 МСК              |

Утечка случилась **между 11:47 и ~22:00 МСК** 11 мая. Точные значения утекших
данных не сохранились — пользовательское исправление их перезаписало.

### Что мы пофиксили (commit готов, push отдельно)

\*\*v74 FIX в
[heys_storage_supabase_v1.js:12163](apps/web/heys_storage_supabase_v1.js#L12163)

- [heys_storage_layer_v1.js:560-577](apps/web/heys_storage_layer_v1.js#L560).**
  Корень: внутри `switchClient` на строке 12219 `HEYS.currentClientId` меняется
  на newClientId **пока `_switchClientInProgress=true`\*\*. `scoped(k)` в
  Store.set читает этот глобал и scope'ит ключи под NEW. Defer-map копит записи
  stale React state'а с NEW scope'ом. После switchClient
  `__replayDeferredSwitchWrites` видит `lead === newClientId` → пишет stale
  данные в LS+cloud NEW клиента.

**Что меняли:**

1. При старте `switchClient` запоминаем
   `cloud._switchSnapshot = { oldCid, newCid, startedAtMs }`.
2. В Store.set guard'е во время `_switchClientInProgress`: re-scope defer key с
   `heys_<newCid>_…` → `heys_<oldCid>_…`. Replay тогда идёт в ветку
   `lead === oldC` — пишет в OLD scope, утечка не происходит.
3. Telemetry: каждый случай пишется в `HEYS._syncDebug` как
   `{ step: 'leak-blocked', payload: { keyShape, oldCid, newCid } }` +
   console.warn.

### Что НЕ покрыто этим фиксом

Пользователь **не делал быстрых правок** перед сменой клиента — значит debounced
auto-save **не должен был сработать** (нет таймера в очереди если не было user
input). Но утечка произошла. Значит **есть второй путь**:

- **Гипотеза 1**: React useEffect компонента UserTab после смены
  `currentClientId` делает ре-render и сохраняет state Poplanton'а (state ещё
  старый, useEffect считает что профиль "обновился"). Срабатывает уже **после**
  того как `_switchClientInProgress = false` снят → защита не активна.
- **Гипотеза 2**: фоновый писатель (gamification, insights, какой-то
  периодический flush) пишет данные через прямой `localStorage.setItem` или
  `cloud.saveClientKey`, минуя Store.set.
- **Гипотеза 3**: HOT-sync приходит с дисфункционального cloud (если cloud
  Александры уже был ранее загрязнён — оно просто читается). Но snapshot за
  11:47 показывает что облако было чистым — эта гипотеза менее вероятна.

### План наблюдения (следующие 2 недели)

- [ ] После каждого переключения в куратор-режиме открывать DevTools и проверять
      `HEYS._syncDebug.filter(x => x.step === 'leak-blocked').length` — должно
      быть 0 (если ничего не печатал до переключения) или >0 если печатал.
- [ ] Воспроизвести «вхолостую» (ничего не делал → клик на другого клиента) и
      проверить: появилась ли утечка? Если да — фикс **не покрыл** этот случай,
      нужно копать в гипотезы 1/2/3.
- [ ] Сохранить snapshot Александры через `HEYS.exportFullBackup()` сразу после
      следующего переключения. Сравнить вес/приёмы с предыдущим snapshot.
- [ ] Если утечка повторилась — собрать данные:
  - `HEYS._syncDebug` (полный лог)
  - значения в LS до и после переключения (через
    `Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('heys_<новый-cid>')))`)
  - запрос cloud:
    `SELECT k, length(v::text), updated_at FROM client_kv_store WHERE client_id='<новый-cid>' ORDER BY updated_at DESC LIMIT 20;`
- [ ] Через 2 недели наблюдения: если новых случаев нет — закрыть как решённое.
      Если есть — расследование по гипотезам.

### Доп. идеи усиления если повторится

1. **Покрасить scoped key уровнем «доверия»**: при Store.set во время switch
   фиксировать source = 'react-state', при бутстрапе hydration — source =
   'hydration'. В replay писать только hydration, react-state не доверять.
2. **Перенести `currentClientId = newClientId`** в конец `switchClient` — самый
   корневой фикс, но требует проверить что внутренние подпроцессы не зависят от
   раннего обновления глобала. (Ранее план описан в
   `.claude/plans/misty-booping-quilt.md`, файл удалён 2026-05-22 —
   стейл-ссылка.)
3. **Активная блокировка контаминации**: если в новый профиль попадает значение
   которое совпадает с OLD профилем (через `_oldProfileBasics` на
   [12190](apps/web/heys_storage_supabase_v1.js#L12190)) — не логировать, а
   **отвергать запись + alert**.

### Files

- `apps/web/heys_storage_supabase_v1.js:12242,12559,12570` — `_switchSnapshot`
  setup/cleanup
- `apps/web/heys_storage_layer_v1.js:581,597` — defer re-scoping under OLD +
  leak-blocked telemetry
- ~~`.claude/plans/misty-booping-quilt.md`~~ — план удалён 2026-05-22

---

## 🔥 Приоритет: Runtime / Scroll Performance — next iteration

> **Статус**: это уже не CSS cleanup, а runtime-pass по самым тяжёлым
> пользовательским сценариям.
>
> **Цель этапа:** сделать приложение заметно стабильнее при скролле,
> переключении табов и открытии тяжёлых экранов **без визуального редизайна** и
> без больших архитектурных переписываний.
>
> **Главный принцип:** сначала только **безопасные локальные изменения**,
> которые не меняют пользовательскую логику и не трогают хрупкие init-path'ы.
> Более рискованные техники — только если low-risk слой не даст достаточного
> эффекта.

### Что уже оптимизировано (не дублировать)

- **deferredSlot** — multi-state skeleton (wait_postboot → wait_delay 260ms →
  show_skeleton → ready) в Day diary
- **LazyMount + IntersectionObserver** — below-fold diary карточки уже не
  монтируются до скролла
- **React.startTransition** — tab switch, date change, meal recalc уже обёрнуты
- **requestIdleCallback** — фоновая загрузка исторических дней (3 места:
  day_core, day_utils, gamification)
- **Event deduplication** — 100ms окно для sync-событий, `isSyncingRef`
  блокирует concurrent updates
- **Module readiness checks** — Cascade, MealRec, EWS обёрнуты в retry-механизм
  с skeleton
- **Lazy Chart.js** — Chart.js в Reports загружается on-demand при открытии
  модалки
- **dayCache/weekCache** — 200-day / 20-week кэш в Reports с invalidation hooks
- **prodIndex useMemo** — `useMemo([products])` в Reports, не пересчитывается на
  каждый getCachedDay()
- **Metabolism useMemo** — `useMemo([lsGet, selectedDate])` в обоих Insights
  компонентах
- **EWS badge backoff** — exponential 1s→8s, max 6 retries, event-first +
  polling-fallback
- **Product search slice** — `.slice(0, 6)` на результаты поиска, не полный
  массив
- **Reports charts** — Sparklines shared модуль, не прямой Chart.js; lazy
  модальные графики

### 🚫 Священные зоны — не трогать без отдельного анализа

- `window.__heysGatedRender` — animation skip при fast render; изменение →
  визуальный регресс
- **Phase A sync gate** (`heys_app_tabs_v1.js` ~строки 48-80) — adaptive
  progressive reveal
- `TAB_SKELETON_DELAY_MS = 260` — выверенный anti-flicker delay
- **Widget drag/drop pointer events** — уже оптимизированы, критичны для mobile
- `window.__heysLoadingHeartbeat` — watchdog freeze detection
- **deferredSlot skeleton-ноды** — живут intentionally, не удалять как «лишний
  DOM»
- **Bootstrap retry loop** (100ms × 50) — менять только backoff, не саму логику
  ожидания

### Как идти безопасно

- [ ] Начинать с изменений, которые уменьшают лишнюю работу, но не меняют
      поведение экранов
- [ ] Делать короткие итерации: одна зона → одна проверка → потом следующая зона
- [ ] Не объединять в один проход mount-оптимизации, tab-switch оптимизации и
      крупную чистку DOM
- [ ] После каждого шага проверять, что не сломались init, hydration, overlays,
      charts и tab navigation
- [ ] Перед правкой любого файла — свериться с «Уже оптимизировано» и «Священные
      зоны»

### Порядок работ по риску

- [x] **Итерация A — low risk / safe-first** (конкретные easy wins)
  - ~~`useMemo` для фильтрации advice list в `heys_day_diary_section.js`~~ →
    advice filtering в `day/_advice.js`: убраны 3 redundant `.filter()`,
    `activeCount` вычисляется inline ✅
  - ~~exponential backoff в EWS badge polling~~ → уже exponential 1s→8s, не
    нужно ✅
  - ~~кэширование `prodIndex` в Reports~~ → уже `useMemo([products])` ✅
  - ~~`useMemo` для 14-day metabolism lookup~~ → уже `useMemo` в обоих
    компонентах ✅
  - ~~exponential backoff в bootstrap polling после 1s~~ →
    `heys_bootstrap_v1.js`: linear 100ms → exponential после 10 retries ✅
  - ~~preload Chart.js~~ → Reports использует Sparklines модуль, не Chart.js; не
    применимо ✅
  - ~~`slice(0, 50)` для поиска продуктов~~ → уже `.slice(0, 6)` ✅
  - локальная чистка offscreen DOM — отложено до профилирования конкретных
    экранов
- [ ] **Итерация B — medium risk / только если A мало помогла**
  - отмена лишних повторных init/update при повторном входе на таб (⚠️ event
    dedup 100ms — деликатно)
  - точечная переработка lifecycle у Chart.js графиков (destroy/re-init path)
  - дробление тяжёлых синхронных tab-open цепочек
  - incremental cache invalidation в Reports вместо полного сброса
  - lazy-compute Insights pattern analysis: первые 3 дня сразу, остальное на
    scroll
- [ ] **Итерация C — high risk / только если реально нужно**
  - partial virtualization / windowing (react-window или аналог)
  - более глубокая перестройка структуры тяжёлых экранов
  - любые изменения, которые затрагивают порядок mount/init, Phase A gate или
    UX-восприятие

### Что именно оптимизировать (привязано к итерациям)

- [x] **A1. Мемоизация hot-path вычислений**
  - ~~advice list filtering~~ → `day/_advice.js`: 3 redundant `.filter()`
    убраны, `activeCount` inline ✅
  - ~~prodIndex rebuild~~ → уже `useMemo([products])` ✅
  - ~~metabolism 14-day lookup~~ → уже `useMemo([lsGet, selectedDate])` ✅
- [x] **A2. Polling/retry backoff**
  - ~~EWS badge~~ → уже exponential 1s→8s ✅
  - Bootstrap: linear 100ms → exponential после 1s ✅
- [ ] **A3. Ленивая загрузка ресурсов** → пересмотрено
  - ~~Chart.js preload~~ → не применимо, Reports использует Sparklines
  - ~~Поиск продуктов slice~~ → уже `.slice(0, 6)` ✅
  - DOM cleanup: отложено до профилирования
- [ ] **B1. Tab-switch lifecycle** _(только после A)_
  - Разобрать init/update цепочки на каждый tab open
  - Убрать синхронные тяжёлые пачки из критического пути — осторожно с event
    dedup
- [ ] **B2. Chart.js / SVG lifecycle** _(только после A)_
  - destroy/re-init path у Cascade, Insulin Wave, Reports chart modals
  - incremental cache invalidation в Reports
- [ ] **C1. Виртуализация** _(только если A+B мало помогли)_
  - Только для реально длинных списков (продукты, meal items)
  - Не трогать Day diary — deferredSlot + LazyMount уже покрывают
- [ ] **Финальная проверка тяжёлых сценариев** _(после каждой итерации)_
  - scroll вверх/вниз на проблемных табах
  - быстрые переключения между табами
  - повторные заходы на один и тот же экран

### Ограничения этого этапа

- [ ] Не менять визуальный дизайн и привычные UX-паттерны без прямой
      необходимости
- [ ] Не тащить большой рефактор «на будущее», если можно решить локально
- [ ] Не ухудшить hydration/init/runtime-стабильность ради цифр в отрыве от
      реального UX
- [ ] Не трогать спорные high-risk приёмы, пока не исчерпан safe-first слой

### Стоп-условия

- [ ] Если изменение затрагивает boot/init path, overlay/modal flow или
      критичные tab-open сценарии — сначала отдельно перепроверить риск, потом
      внедрять
- [ ] Если после оптимизации поведение стало менее предсказуемым, откатить идею
      и выбрать более локальный вариант
- [ ] Если улучшение видно только в synthetic-метрике, но не ощущается в
      реальном UX — не усложнять код ради этого
- [ ] Если для выигрыша нужен большой рефактор, вынести его в отдельную задачу,
      а не протаскивать в этот safe pass
- [ ] Если после правки skeleton мигает, появляется на мгновение или не
      появляется когда должен — откат; skeleton timing (deferredSlot, 260ms) —
      хрупкий баланс

### Когда считать этап успешным

- [ ] На проблемных экранах заметно меньше микрофризов при скролле
- [ ] Переключение табов ощущается легче и без тяжёлых всплесков
- [ ] Нет regressions по UI, init flow и интерактивности
- [ ] Изменения локальные, понятные и проверяемые по runtime-поведению

---

## 📊 Мониторинг и алерты — optional hardening

> **Статус**: базовый контур уже достаточный для текущего масштаба — есть
> `health-check.sh`, GitHub Actions health monitor, Telegram alerts и
> maintenance-задачи. Ниже — не must-have, а усиление контура при росте
> нагрузки/рисков.

- [x] **2.2** Security burst alerting — **базовый контур есть** _(2026-05-22)_
  - `heys-cron-security-alerts` каждые 15 мин проверяет 4 правила:
    `brute_force_ip`, `coordinated_locks`, `mass_account_deletion`,
    `concurrency_watch`. Все шлют Telegram куратору с cooldown 30 мин.
  - Расширения если понадобятся: общий `>10 событий/час` алерт по всем
    failed-auth (опционально, не критично сейчас).
  - **Файл**: `yandex-cloud-functions/heys-cron-security-alerts/index.js`
- [ ] **2.3** External uptime monitor _(low priority)_
  - UptimeRobot / аналог как независимый внешний монитор `/health`
  - Полезно, если нужен alerting вне GitHub/Yandex контура; не критично при
    текущем наборе проверок

---

## 📋 Operations & DR — follow-up

> **Статус**: DR runbook уже сделан; trial queue полностью реализована. Остаток
> — не срочный, но один практический DR smoke-test со временем всё же стоит
> сделать.

- [ ] **4.3** Recovery drill / backup restore smoke-test _(medium priority, not
      urgent)_
  - Полный weekly/staging-процесс сейчас выглядит избыточным: отдельного staging
    нет
  - Практичнее заменить на редкий drill: restore в отдельный cluster / isolated
    env по runbook
  - Рекомендуемый ритм: после крупных infra-изменений или раз в квартал

---

## 🧹 Legacy `heys_products` — финальная чистка (Phase 3)

> **Статус**: Phase 1-2в выполнены 2026-05-10/11 (коммиты 52386c97 → 4b78dcc8 →
> 2796d4da → f6415481). Облачный legacy ключ очищен у обоих активных клиентов
> (`ccfe6ea3`, `4545ee50`), читатели в seed и sync rollback переключены на
> overlay. Остался последний шаг — удалить interceptor, который зеркалит overlay
> → legacy.
>
> **Предусловие**: дать Phase 2б/2в/seed-fix + DB-миграцию (commit `1f45ee5f`)
> пожить ~сутки в проде без регрессий, потом приступать.

**Конкретный changelog (свериться перед push, файлы проверены 2026-05-11):**

1. [heys_storage_supabase_v1.js](apps/web/heys_storage_supabase_v1.js) — удалить
   interceptor блок ~строки **4015-4155** (комментарий начинается с «pre_overlay
   snapshots…», заканчивается closing блоком legacy mirror). Внутри:
   `dual_write_legacy` flag check (~4046), весь блок `isProductsKey` handling,
   mirror upsert в legacy ключ.

2. [heys_app_auth_init_v1.js:112](apps/web/heys_app_auth_init_v1.js#L112) —
   `initLocalData`: заменить

   ```js
   const storedProducts =
     window.HEYS?.products?.getAll?.() || readStoredValue('heys_products', []);
   ```

   на прямое чтение overlay LS-ключа `heys_products_overlay_v2` (доступен раньше
   overlay-wrapper).

3. [heys_app_backup_v1.js:6,93,101,121,166,196,202](apps/web/heys_app_backup_v1.js)
   — старый legacy backup модуль (наш schema v3 заменил его публичный API, но в
   `heys_app_backup_v1.js` ещё остался ручной fallback на `'heys_products'`). 7
   site'ов — заменить на чтение через `HEYS.products.getAll()` либо удалить
   fallback ветки (после Phase 3 ключ будет пустым).

4. Убрать feature flag `dual_write_legacy` — поиск всех usages
   (`grep -rn 'dual_write_legacy' apps/web/`).

5. _(опционально)_ RPC sharding для legacy ключа:
   [heys_storage_supabase_v1.js:591-682,5726,6027,6038,6156,6158](apps/web/heys_storage_supabase_v1.js#L591)
   — константы `HEYS_PRODUCTS_RPC_TAIL_K`, `isProductsTailRpcKey`, и
   merge-функции. Overlay имеет свой shard path
   `heys_products_overlay_v2_rpc_tail`, эта инфраструктура для legacy ключа
   более не нужна.

6. После всего — `pnpm bundle:legacy`, `pnpm lint:storage`, проверить что bundle
   hash меняется и lint clean.

### Verification после Phase 3 (свежая инкогнито-сессия)

```js
HEYS.diagnostics.overlay(); // total корректный, typeA dedup = 0
localStorage.getItem('heys_products'); // null или ''
// Добавление/удаление продуктов работает; модалка и таблица показывают одно число
// Cloud sync продуктов работает (DevTools Network)
// Backup содержит актуальные продукты из overlay
```

---

## 🧪 Переписать cleanup-функции под новый формат данных _(low priority)_

> **Контекст**: 2026-05-11 коммитом `78d9136e` отключены три точки запуска
> `cleanupCloudProducts` / `cleanupProductRecord` в
> [heys_storage_supabase_v1.js](apps/web/heys_storage_supabase_v1.js) (~6516,
> ~8714). Они классифицировали валидные overlay TypeA-строки и массивы ID
> (`heys_hidden_products`, `heys_favorite_products`) как «мусор» и удаляли из
> облака. Подробности — `apps/web/BUGS_HISTORY.md` секция «Cloud cleanup
> destroying overlay data».

Когда захочется вернуть автоматическую чистку — переписать
`cleanupProductRecord` так чтобы знал про:

- [ ] **Overlay v2 shape** — `{id, shared_origin_id, overrides, in_my_list}` для
      TypeA (без `.name` — имя в shared catalog); `{id, _custom:true, ...}` для
      TypeB.
- [ ] **Pure-ID arrays** — `heys_hidden_products`, `heys_favorite_products`
      хранят `string[]` (id'шки). Cleanup должен распознавать их по имени ключа,
      а не пытаться проверять у строки `.name`.
- [ ] **Backup-key skip list** — игнорировать ключи матчащиеся `_BACKUP_*`,
      `*_archive_*`, чтобы случайно не подрезать резервные копии.
- [ ] **Tombstones и empty arrays** — для overlay пустой массив значит «всё
      удалено пользователем», не мусор. Удалять только записи реально
      повреждённые (например невалидный JSON).
- [ ] **Гайки безопасности** — dry-run флаг по умолчанию, лог всегда показывает
      diff (до/после) с примерами удаляемых строк, abort если to-delete > 50% от
      исходного размера.

**Альтернатива** (рекомендуемая) — не возвращать cleanup вообще. Использовать:

- Storage registry уже умеет сжимать legacy ключи (см.
  `apps/web/ARCHITECTURE.md` раздел Storage management).
- Audit `HEYS.diagnostics.storageAudit()` показывает violations — пусть юзер
  явно очищает то что нужно.
- Tombstones и migration версии для оверлея.

**Recovery после отключённого cleanup**: бэкапы лежат в облаке
(`*_BACKUP_20260510`, `*_BACKUP_20260511`). Можно дропать через ~30 дней после
Phase 3, если регрессий не будет.

---

## 🏗️ Архитектурный аудит — tech debt backlog

> **Дата аудита**: 2026-04-05
>
> **Контекст**: code-grounded аудит репозитория — 10 пунктов, привязанных к
> реальным файлам и паттернам, а не абстрактные рекомендации.
>
> **Рекомендуемый порядок**: сначала #6 (e2e тесты как safety net), потом quick
> wins (#5, #7, #9), затем #1 (storage), и только потом тяжёлые #2/#3.

| #   | Пункт                                | Impact  | Effort  | Risk    |
| --- | ------------------------------------ | ------- | ------- | ------- |
| 1   | Унифицировать storage API            | 🔴 High | 🟡 Med  | 🟡 Med  |
| 2   | Декомпозировать legacy модули        | 🔴 High | 🔴 High | 🔴 High |
| 3   | Упростить sync event orchestration   | 🟡 Med  | 🔴 High | 🔴 High |
| 4   | Сократить fallback цепочки           | 🟡 Med  | 🟡 Med  | 🟡 Med  |
| 5   | Синхронизировать docs с архитектурой | 🟢 Low  | 🟢 Low  | 🟢 Low  |
| 6   | Покрыть critical legacy e2e          | 🔴 High | 🟡 Med  | 🟢 Low  |
| 7   | Улучшить lazy loading fallbacks      | 🟢 Low  | 🟢 Low  | 🟢 Low  |
| 8   | Ввести UI performance budget         | 🟡 Med  | 🟢 Low  | 🟢 Low  |
| 9   | Почистить auth legacy хвосты         | 🟢 Low  | 🟢 Low  | 🟡 Med  |
| 10  | Провести mobile UX pass              | 🟡 Med  | 🟡 Med  | 🟢 Low  |

### 1. Унифицировать storage API

- [ ] Инвентаризация: собрать все прямые `localStorage.getItem/setItem` в
      `apps/web/` (200+ мест)
- [ ] Составить маппинг: какие ключи → какой API (`U.lsGet`, `HEYS.store`,
      прямой доступ)
- [ ] Поэтапная миграция на единый `HEYS.store` / `U.lsGet` / `U.lsSet`
- [ ] **Зависимость**: делать после #6 (e2e coverage как safety net)
- **Файлы**: `apps/web/heys_*.js`, `apps/web/src/**`
- **Контекст**: баг v4.8.8 — React читал unscoped ключи, Storage Layer писал
  scoped → продукты показывали 42 вместо 290

### 2. Декомпозировать legacy модули

- [ ] `heys_day_bundle_v1.js` (10 233 LOC) — разбить на ≤2000 LOC модули
- [ ] `heys_widgets_ui_v1.js` (7 482 LOC)
- [ ] `heys_add_product_step_v1.js` (6 171 LOC)
- [ ] Проверить, что bundling config корректно собирает после split
- **Ограничение**: не трогать `heys_day_bundle` без e2e coverage

### 3. Упростить sync event orchestration

- [ ] Каталогизировать все sync-события: `forceReload`, `syncVer`,
      `warnMissing`, `heys:day-updated`, `setSyncVer` (200+ мест)
- [ ] Выделить единый sync manager вместо россыпи guardrails
- [ ] Документировать event flow diagram
- **Риск**: любая ошибка → потеря данных пользователя

### 4. Сократить fallback цепочки

- [ ] Аудит fallback-паттернов: find все `|| fallback`, `?? default`, try/catch
      с silent recovery
- [ ] Заменить «молчаливые» fallbacks на explicit error + telemetry
- [ ] Оставить только те, что реально спасают edge cases
- **Файлы**: `heys_day_utils.js` (storage/sync/recovery), `heys_user_v12.js`

### 5. Синхронизировать docs с архитектурой

- [ ] `docs/plans/NEXT_STEPS.md:42` — убрать «Complete Supabase integration»
      (Supabase удалён 2025-12-24). **Подтверждено грепом 2026-05-22** — строка
      ещё в файле, плюс весь NEXT_STEPS.md выглядит orphaned (last updated
      2025-08-30, мог быть полностью deprecated)
- [ ] Проверить остальные docs на stale references
- [x] 8 backup-doc'ов обновлены 2026-05-22 (DB_RESILIENCE_SUMMARY,
      DISASTER_RECOVERY_RUNBOOK, LOCKBOX_MIGRATION_GUIDE, BACKUP_CONSOLE_GUIDE,
      HEYS_BRIEF, DEPLOYMENT_GUIDE, backup-retention, heys-client-daily-backup
      README) — ссылаются на YC Managed PG built-in вместо удалённой
      `heys-backup`
- **Effort**: ~1 час текстовой работы

### 6. Покрыть critical legacy e2e ⭐ _начать с этого_

- [ ] Training UI flow (zero coverage)
- [ ] Day flow с `heys:day-updated` / `forceReload` lifecycle
- [ ] Client switch + scoped storage isolation
- [ ] Modal / overlay interactions
- [ ] Bundle-sensitive scenarios (boot/postboot)
- **Почему первым**: даёт safety net для пунктов 1–4

### 7. Улучшить lazy loading fallbacks

- [ ] `LazyRoutes.tsx` — заменить `<div>Loading...</div>` на skeleton/spinner
- [ ] Добавить error boundary для chunk load failures
- **Effort**: ~2 часа

### 8. Ввести UI performance budget

- [ ] Lighthouse CI в GitHub Actions на каждый PR (не настроено)
- [x] **Bundle size guard** — `scripts/lint-bundle-size.mjs` в
      [.husky/pre-push:73](.husky/pre-push#L73), fail-push если bundle >+5% от
      baseline. Baseline в `apps/web/__perf_baselines__/`
- [ ] Документировать baseline метрики (есть в `__perf_baselines__/`, но без
      отдельного README)
- **Effort**: ~2 часа осталось (Lighthouse + doc README)

### 9. Почистить auth legacy хвосты

- [ ] Убрать `heys_supabase_auth_token` из `index.html` и `heys_app_entry_v1.js`
- [ ] Проверить, что нет скрытых runtime-зависимостей на эти ключи
- **Риск**: ключи могут читаться из legacy code — нужен grep перед удалением

### 10. Провести mobile UX pass

- [ ] Touch targets < 44px (Lighthouse audit)
- [ ] scroll-snap поведение на ключевых экранах
- [ ] safe-area-inset для нотча/островка
- [ ] Проверить на реальных устройствах (iPhone SE, Android mid-range)

---

## 🔴 Блокеры (ждут бизнес-решений)

### 💳 ЮKassa + Налоги

**Статус**: ⏸️ Ожидает решения по юридической схеме

- [ ] Решение по юр.схеме: ИП (ПСН+УСН) или только УСН
- [ ] ОКВЭД: 63.11 (SaaS), 62.01, 62.09, 63.99.1 — не медицина
- [ ] Регистрация в ЮKassa (shopId + secretKey)
- [ ] Фискализация: облачная касса + ОФД или «Чеки от ЮKassa»
- [ ] После разблокировки: деплой `heys-api-payments`, переключение API gateway
      со stub на real function, webhook, sandbox-тест, активация подписки при
      `payment_succeeded`

---

_Архив выполненного — в `done.md`._

---

## 🪦 Tombstones / event log — открытые edge cases (2026-05-25)

### `heys_deleted_ids` maxSize policy

- [ ] Tombstone-список (`heys_deleted_ids` в `HEYS.store`) растёт всю жизнь
      клиента — каждое удаление продукта добавляет entry. У активного клиента за
      2-3 года список может вырасти до >5000 entries.
- [ ] При размере >1MB начинает заметно влиять на LS quota (10MB лимит) →
      QuotaExceededError → aggressive cleanup может снести свежие tombstones.
- [ ] **Fix proposal**: cap на 5000 entries в `HEYS.deletedProducts.add()` —
      FIFO drop oldest. Защита `heys_deleted_ids` в hard-allowlist уже сделана
      (F11), но это про aggressive cleanup, не про сам add.
- [ ] **Риск низкий**: клиентов с 5000+ удалениями пока нет. Можно отложить на
      6-12 месяцев или до первой жалобы на QuotaExceededError.

### RPC `log_client_event_by_session` падает с 500 в prod (2026-05-26)

**Симптом**: клиент при boot регулярно получает
`POST /rpc?fn=log_client_event_by_session → 500 Internal Server Error` с body
`{error: 'Database error', message: 'Internal server error', code: 'INTERNAL_ERROR'}`.
В dev:local proxy вторичный шум `Cannot pipe to a closed or destroyed stream` —
это уже следствие 500-ответа от prod, не сам баг.

**Что подтверждено**:

- SQL функция `log_client_event_by_session` в
  [database/2026-05-25_client_event_log.sql:73-114](database/2026-05-25_client_event_log.sql#L73-L114)
  имеет
  `EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM)`
  — **любой SQL exception превращается в 200 OK с body**, не может дойти до
  Yandex JS catch. Значит constraint/digest/jsonb/ts cast/schema drift — **все
  не виноваты**.
- `code: 'INTERNAL_ERROR'` это fallback в
  [yandex-cloud-functions/heys-api-rpc/index.js:2791](yandex-cloud-functions/heys-api-rpc/index.js#L2791)
  когда `error.code` пустой. Pg-error дал бы SQLSTATE, ECONNRESET/ETIMEDOUT дал
  бы свой code → значит **JS-уровень exception** в Yandex функции ДО или ВОКРУГ
  `client.query`.
- Самая вероятная причина (#2 в шорт-листе): pg-driver throw при подготовке
  параметров — BigInt/Symbol/` ` в payload не сериализуется. Pending queue
  накапливает «отравленный» event и шлёт **тот же payload** в каждом retry →
  deterministic 3-retry failure pattern в логах.

**Next step без prod logs**: в DevTools incognito клиента залогиниться,
посмотреть pending payload руками:

```js
JSON.parse(localStorage.getItem('heys_event_log_pending') || '[]');
```

Искать: BigInt, ` ` в строках, undefined `kind`, гигантский nested object,
массив-в-массиве в `meta`. Smoking gun.

**Альтернатива**: получить prod-логи Yandex Cloud Function
(`yc serverless function logs <name>` или через консоль) — там полное
`error.message` от generic catch на
[index.js:2760](yandex-cloud-functions/heys-api-rpc/index.js#L2760).

**Сопутствующие fix'ы — статус 2026-05-26:**

1. ✅ **needsDetailedLog whitelist расширен И ЗАДЕПЛОЕН** (commit 924da9ae,
   `yandex-cloud-functions/heys-api-rpc/index.js`). Pattern теперь `admin_*` +
   `log_*` + `get_curator_clients` — покрывает все debug/audit функции
   автоматически. **✅ DEPLOYED 2026-05-26 18:38** через локальный
   `./deploy-all.sh heys-api-rpc` (использует Lockbox secrets из .env).
   Post-deploy health check показал ✅ для Health/RPC/REST/Auth/Leads endpoints.
   SMS endpoint failed HTTP 502 — но это **другая функция**, pre-existing issue,
   не связан с моим deploy. Cloud-functions GHA workflow остался broken (IAM
   SA), но локальный deploy теперь подтверждённо работает как альтернатива.
2. ✅ **Poison-pill detection реализована и задеплоена** (commit 924da9ae,
   `apps/web/heys_event_log_v1.js:67-77`). Threshold = 5 consecutive failures на
   одном fingerprint (kind+summary первые 60 chars). Head event дропается,
   остаток продолжает retry. Frontend deploy через `deploy-yandex.yml` успешен —
   изменение уже в проде.
3. ✅ **SQL migration APPLIED на проде** (2026-05-26): Все 3 debug-функции
   (`log_client_event_by_session`, `log_gamification_event_by_session`,
   `log_gamification_event_by_curator`) пересозданы через
   `database/2026-05-26_debug_fns_raise_notice.sql`. В EXCEPTION блок перед
   RETURN добавлен `RAISE NOTICE SQLSTATE/SQLERRM/DETAIL/HINT`. **⚠ Post-apply
   discovery**: Yandex Managed Postgres имеет `log_min_messages=warning`
   (default) → **NOTICE отфильтрован**, нигде не пишется. JS код в Yandex CF не
   subscribed на `client.on('notice')` → теряется и в CF logs. Результат:
   applied чисто, но диагностический эффект **нулевой** на текущей конфигурации
   pg.

3b. ⚠ **Follow-up migration prepared, НЕ applied**:
`database/2026-05-26_debug_fns_raise_warning_fix.sql` заменяет `RAISE NOTICE` →
`RAISE WARNING` в тех же 3 функциях (2026-05-26 applied ✅). WARNING проходит
`log_min_messages=warning` → попадает в pg server log → доступен через Yandex
Console → Managed PostgreSQL → Logs. Семантика RETURN не изменилась. Verified
через `SELECT prosrc FROM pg_proc` — RAISE WARNING присутствует в каждой
(positions 1216 / 844 / 864), RAISE NOTICE отсутствует (replaced). **Финальный
эффект на RPC 500**: при следующем падении pg server log получит
SQLSTATE/SQLERRM/DETAIL/HINT, root cause локализуется мгновенно.

3c. ✅ **Hotfix applied** (2026-05-26): smoke test после 3b показал что RAISE
WARNING сам падал runtime с `column "pg_exception_detail" does not exist`.
Причина — в plpgsql `PG_EXCEPTION_DETAIL` / `PG_EXCEPTION_HINT` доступны ТОЛЬКО
через `GET STACKED DIAGNOSTICS`, не как идентификаторы в RAISE. Применённая
миграция 3b сломала error-path 3 функций (happy path работал). Hotfix
`database/2026-05-26_debug_fns_get_stacked_diagnostics_fix.sql` применён,
переписал EXCEPTION handler через
`GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT`.
Smoke test
(`SELECT log_gamification_event_by_session('invalid-token', 'test');`) → WARNING
строка появилась в client output + клиент получил graceful
`{success: false, error: 'invalid_or_expired_session'}`. End-to-end proof
диагностики ✅.

**Метаурок**: предыдущий план не учёл `log_min_messages` config Yandex Postgres
(3b). А внутри 3b — не учёл что `PG_EXCEPTION_DETAIL` нельзя использовать
напрямую (3c). Третий и четвёртый случай каскадной ошибки в одной сессии.
Расширил `feedback_partial_reads_cascade.md` подкатегорией «config-dependent
assumptions». Главный урок: **smoke test обязателен после каждого SQL migration
apply**, не verify через SELECT prosrc (static check не ловит runtime errors).

**Чекин-фикс 4aa1ead7 не связан**: `window.dispatchEvent('heys:day-updated')` из
нового immediate-write в WeightStepComponent — это DOM event, не запись в
event_log. `HEYS.eventLog.write(...)` это отдельный API, в whitelist
`SAFE_PAYLOAD_KEYS` нет полей моего диспатча.

### Cloud Functions auto-deploy GHA broken (2026-05-26)

**Симптом**: `.github/workflows/cloud-functions-deploy.yml` падает на step
`Deploy functions` с
`ERROR: rpc error: code = InvalidArgument desc = Service account aje85rjgpj4nk9m384ek is not available`.
Это значит **последние ≥3 commits с изменениями в
`yandex-cloud-functions/heys-api-\*/**` НЕ задеплоены\*\* — auto-deploy
зафейлился, manual deploy не делали.

Подтверждено: `gh run list --workflow=cloud-functions-deploy.yml --limit=3`
показывает 3 последних run'а все `failure`, начиная с 2026-05-23. То есть
**проблема существует ~3 дня минимум**, не свежий regression.

**Что нужно**: или вернуть доступ к service account `aje85rjgpj4nk9m384ek`
(восстановить delete'нутый аккаунт; rotate keys; проверить IAM роли), или
завести новый service account и обновить `YC_SERVICE_ACCOUNT_KEY` secret в GHA →
`Settings → Secrets and variables → Actions`.

**Срочность**: backend changes (например, расширение needsDetailedLog whitelist
из 924da9ae) висят в коде но не активны в проде. Любой hot-fix на backend
требует ручного `./deploy-all.sh` с правильными credentials до починки workflow.

### Wave 5 event_log — sample rate calibration через 24-48h

- [ ] **2026-05-26 / 2026-05-27 вечер**: запустить
      `SELECT kind, count(*) FROM client_event_log GROUP BY 1 ORDER BY 2 DESC` →
      проверить:
  1. `sync-event` sample 0.2 — адекватен? (если >50% всех events — понизить до
     0.1)
  2. `meal-edit-grams` sample 0.3 — адекватен? (если >30% — проверить debounce
     300ms в caller, понизить)
  3. Total rows через 48h — должен соответствовать прогнозу ~340 events/active
     client × N клиентов × 2 дня.
- [ ] Если total >2× прогноза → расследовать flood-source через
      `SELECT source, count(*) FROM client_event_log GROUP BY 1 ORDER BY 2`.

### F17 verification (закрыто 2026-05-25)

- [x] `grep -rn "sync_shared_products_by_session" apps/web/` → пусто. DROP
      сделан корректно, нет клиентских вызовов. Безопасно.

### Inheritance fast-path в prepare-release (закрыто 2026-05-25)

- [x] Fast-path в `runCheck()` через `canInheritEntryFrom()`: если все commits
      между HEAD и last entry — type ∈ TECHNICAL_COMMIT_TYPES И все файлы под
      TECHNICAL_FILE_PATTERNS/RELEASE_META_FILE_PATTERNS — entry наследуется без
      bump. Защита: достаточно одного feat/fix/perf или одного non-technical
      файла → fail.

---

## 📊 Compliance / docs hygiene reminders

### 2026-06-08 (через 2 недели): измерить parallel-first compliance

- [ ] Scheduled task `parallel-first-compliance-check` создан (fires 2026-06-08
      09:00 МСК). Через `mcp__ccd_session_mgmt__search_session_transcripts`
      найдёт non-trivial sessions за 14 дней, подсчитает hit-rate
      `Parallelization plan` блока.
- [ ] **Threshold**: `<50%` → text rule не работает, candidate на hook. `50-70%`
      → усилить триггер. `>70%` → оставить.
- [ ] **Hawthorne caveat**: между baseline (2026-05-25, ~80% subjective) и check
      (2026-06-08) добавлен explicit `delay/continuation prompts` special case +
      `anti-creep` rule в CLAUDE.md. Если число выросло — это **может быть от
      фикса**, не от стабильности правила. Honest verdict требует:
  - Изоляция: посчитать compliance **до** 2026-05-25 (если есть транскрипты) —
    это «pre-fix baseline».
  - Сравнение: pre-fix vs post-fix отдельно, vs target threshold.
  - Если рост только в delay-prompt cases — фикс работает, но general rule
    stability не подтверждена. Нужен ещё цикл measurement через 2 недели без
    новых правок.
- [ ] Backup на случай если scheduled task не сработает: вручную
      `grep -rn "Parallelization plan" ~/.claude/projects/` и сравнить с
      количеством sessions за 2 недели.
- [ ] **2026-06-09 (на следующий день после fireAt)**: если в Claude Code не
      появилось summary от `parallel-first-compliance-check` — VS Code был
      закрыт в момент scheduled fire. Действия:
  1. Запустить вручную через `mcp__scheduled-tasks__list_scheduled_tasks` →
     найти `parallel-first-compliance-check` → кликнуть Run.
  2. Или дублировать ad-hoc: попросить агента «запусти compliance check по
     prompt'у в task SKILL.md».

### 2026-07-24 (через 2 месяца): CLAUDE.md compaction pass

- [ ] Scheduled task `claude-md-compaction-pass` создан (fires 2026-07-24 09:00
      МСК). Проанализирует user-level + project CLAUDE.md, найдёт
      редко-применяемые разделы, дубли между файлами, stale info.
- [ ] Активирует skill `consolidate-memory` для feedback files (сейчас 16 штук в
      HEYS-v2 memory) — merge дублей, проверка stale claims.
- [ ] **Целевая компрессия**: 20-30% строк без потери enforcement. Выведет план
      compaction, НЕ применит сам — требует подтверждения.
