# Протокол реализации trial-intake v2

> **Статус:** source реализован локально 2026-07-27. Migration, commit, push и
> production deploy не выполнялись.

## Цель и UI-гейт

Довести переходы между короткой заявкой, защищённой анкетой и ручным решением
куратора, не создавая отдельную авторизацию кандидата.

**UI-гейт:** цель — провести человека до понятного решения; главное действие —
одно действие текущего этапа; слой 1 — статус, обязательные вопросы и следующий
шаг; слой 2 — полные ответы, внутренняя заметка и детали решения; критическое не
скрывать — safety-вопросы, запрос уточнений, ожидание места и последствия
отказа.

## Канонический поток

```text
короткая заявка
  → первичный контакт в мессенджере
  → invite_prepared
  → куратор вручную подтверждает отправку → invite_sent
  → существующая PIN-сессия + обязательные согласия
  → in_progress → completed
  → ручной decision sheet куратора
      ├─ needs_clarification → зашифрованный вопрос + разделы → completed
      ├─ approved
      ├─ approved_waiting_slot → дата старта → approved → trial
      └─ rejected → удаление через 30 дней
```

Ссылка остаётся универсальной `/?intake=1`: credential — только существующая
PIN-сессия. Решение принимает куратор; safety-ответы подсвечивают контекст, но
не запускают автоматический отказ.

## Данные и состояния

- `invite_prepared` означает, что PIN и текст приглашения созданы.
- Конвертация lead и создание `invite_prepared` выполняются одной атомарной RPC.
  Прямой legacy `admin_convert_lead` закрыт для runtime-ролей.
- `invite_sent` ставится только отдельным действием куратора после фактической
  отправки; копирование текста само статус не меняет.
- `clarification_request_encrypted` содержит только вопрос клиенту,
  `review_note_encrypted` — внутреннюю заметку и decision checklist.
- `clarification_sections` содержит только идентификаторы шести существующих
  разделов и позволяет клиенту перейти к первому нужному разделу.
- `approved_waiting_slot` не является отказом из-за capacity. При выборе даты
  штатная активация принимает этот статус и переводит intake в `approved`.
- Неактивные `invite_prepared`, `invite_sent`, legacy `invited`, `in_progress` и
  `needs_clarification` удаляются через 30 дней без клиентской активности.
  `completed` не удаляется как «брошенный»: он ожидает действия куратора.
- Purge и настоящий отзыв health consent оставляют в очереди технический
  tombstone. Клиент без intake, но с таким marker не может попасть в legacy
  activation path.

## Pre-release hardening

- Клиентский autosave и curator decision sheet передают ожидаемый `updated_at`.
  Вторая вкладка получает `stale_draft`/`stale_intake` и не может перезаписать
  более свежее состояние.
- Переход на следующий шаг происходит только после успешного save. Ошибки
  истёкшей сессии, отсутствующего health consent, закрытой анкеты, stale draft и
  сети показаны разными простыми сообщениями; доступно явное повторение.
- Закрытие анкеты с несохранёнными изменениями сначала дожидается server save.
  `invite_prepared` клиенту ещё не открывает заполнение.
- Загрузка intake summaries обязательна для кураторского экрана. При её сбое
  legacy CTA скрыты до успешного retry; у intake-карточек нет старого удаления
  из очереди.
- Карточка показывает владельца следующего шага, возраст состояния и один
  главный CTA. `approved_waiting_slot` не предлагает старт при нуле мест.
- Повторная активация `trial_pending` идемпотентна: первая дата старта не
  меняется. Повторная отправка приглашения возвращает исходный `invite_sent_at`.
- SQL audit фиксирует prepare, sent, read, save, review/clarification,
  activation, reopen, revoke и purge без PIN, токенов, ответов, вопросов и
  внутренних заметок. RPC JSON-ответы имеют `Cache-Control: no-store`.

## Анкета 1.1

Схема `1.1` совместима с чтением черновиков `1.0`: клиент нормализует старые
boolean safety-ответы в явные `yes/no`, затем сохраняет обновлённую версию на
сервер. Завершение требует ответа `Нет / Да / Предпочитаю обсудить` на каждый
safety-вопрос. Для health-полей сначала задаётся такой же явный вопрос, а
описание раскрывается и становится обязательным только при `Да`.

Первый экран объясняет примерное время, server autosave, круг доступа и то, что
анкета не гарантирует триал. На последнем тематическом шаге доступна краткая
проверка основных ответов.

## Решение куратора

В первом слое карточки остаются цель и safety-флаги, полные ответы раскрываются
отдельно. Одна кнопка `Зафиксировать решение` открывает decision sheet:

1. выбор результата;
2. обязательный чек-лист для финального решения;
3. вопрос клиенту и разделы только для уточнения;
4. причина только для отказа;
5. внутренняя заметка, недоступная клиенту.

Чек-лист фиксирует границы услуги, понимание немедицинского характера HEYS,
готовность вести дневник, реалистичность ожиданий, безопасность формата и
наличие места. Для `approved` первые пять пунктов и место должны быть
подтверждены; для `approved_waiting_slot` первые пять подтверждены, а места пока
нет.

## Повторная заявка

Новая client-запись не создаётся. Куратор явно открывает существующего клиента,
если прошлый intake отклонён не менее 30 дней назад и у клиента нет активного
триала/подписки. Старые зашифрованные ответы, заметки, решение и сессии
удаляются/отзываются; выдаётся новый PIN и создаётся чистый `invite_prepared`.
Новый lead сохраняется и связывается с прежним client как доказательство новой
заявки и landing-consent.

## Файлы и проверка

- Migration: `database/2026-07-27_trial_intake_flow_v2.sql`
- Client UI: `apps/web/heys_trial_intake_v1.js`
- Curator UI: `apps/web/heys_trial_queue_v1.js`
- Web RPC auth boundary: `apps/web/heys_yandex_api_v1.js`
- RPC boundary: `yandex-cloud-functions/heys-api-rpc/index.js`
- Static/UI contracts: `apps/web/__tests__/trial-intake-flow.test.js`
- PostgreSQL integration: `scripts/db/test-trial-intake-migration.mjs`

Проверки:

- `pnpm vitest run apps/web/__tests__/trial-intake-flow.test.js` — 25/25.
- `pnpm test:db:trial-intake` — base и v2 migration integration пройдены.

## Integration-review и изоляция release scope

Migration зарегистрирована локально в managed manifest как order `10`. Source,
commit, migration и deploy в production не выполнялись. Review закрыл четыре
дефекта без изменения продуктового контракта:

- пустой код причины больше не позволяет зафиксировать отказ;
- draft-autosave не скрывает свежий запрос уточнений;
- повторная заявка блокирует lead row и проверяет владельца лида;
- purge переводит очередь в технический `canceled/trial_intake_purged`, после
  чего activation gate не принимает очищенного кандидата как legacy-клиента.

Если окно подготовленного приглашения закрыто или второй RPC после конвертации
не выполнился, карточка `invite_prepared`/legacy `invited` даёт восстановить
приглашение: сервер идемпотентно подготавливает intake, перевыпускает PIN и
отзывает прежние сессии. Статус `invite_sent` по-прежнему ставится только
отдельным подтверждением фактической отправки.

Изолированный runtime scope v2:

- `database/2026-07-27_trial_intake_flow_v2.sql`;
- только entry order `10` в `scripts/db/migrations/manifest.json`;
- `yandex-cloud-functions/heys-api-rpc/index.js`;
- `apps/web/heys_trial_intake_v1.js`;
- `apps/web/heys_trial_queue_v1.js`;
- `apps/web/heys_yandex_api_v1.js`.

Verification/docs scope: `apps/web/__tests__/trial-intake-flow.test.js`,
`scripts/db/test-trial-intake-migration.mjs`, этот протокол и
`docs/reference/systems/TRIAL_INTAKE.md`.

Из rollout исключаются параллельные consent/infra/landing-файлы,
`apps/web/heys_sync_merge_v1.js`, RPC-копия `lib/heys_sync_merge_v1.cjs` и все
preview-generated bundles/manifests/index/service worker. V2 не меняет короткую
форму лендинга; mixed diff `apps/landing/src/components/TrialForm.tsx` не входит
в этот source scope. Trial-suite проверяет только минимальный payload короткой
формы и отсутствие health-полей; визуальный текст success-state относится к
параллельному landing scope и не является зависимостью v2. `heys-maintenance`
также не требует нового deploy: уже опубликованный worker вызывает неизменённое
имя `purge_expired_trial_intakes()` и подхватит новую SQL-реализацию.

## Stop-gate rollout

### 0. Preflight в чистом integration checkout

```bash
test -z "$(git status --porcelain)"
node scripts/db/migrate.mjs --check
node --test scripts/db/migrate.test.mjs
pnpm test:db:trial-intake
pnpm --dir apps/web exec vitest run __tests__/trial-intake-flow.test.js --config vitest.config.js
pnpm docs:reference:check
node scripts/web-deploy-scope.mjs plan --files=apps/web/heys_trial_intake_v1.js,apps/web/heys_trial_queue_v1.js,apps/web/heys_yandex_api_v1.js
printf '%s\n' yandex-cloud-functions/heys-api-rpc/index.js | node yandex-cloud-functions/function-inventory.cjs --resolve
```

Preflight выполняется на локальном согласованном commit; push в `main`
удерживается до завершения разрешённых DB/RPC gates, затем сам запускает
канонический web deploy. До commit точный десятифайловый allowlist может
оставаться единственным dirty scope в отдельном worktree, но migration/deploy из
него запрещены.

STOP при любом лишнем source/generated-файле, непредусмотренном bundle/function,
ошибке теста или изменении snapshot после подтверждения scope.

### 1. Migration

Сначала выполнить только read-only проверку:

```bash
node scripts/db/migrate.mjs --status
```

На момент release-preflight ledger показывает `9 applied, 1 pending`: order `9`
`consent_proof_v2` уже применён, единственный pending — order `10`
`trial_intake_flow_v2`. Remote baseline `origin/main` содержит source и manifest
entry order `9`; diff manifest относительно него добавляет только order `10`.
Зависимость consent → trial удовлетворена, но production apply по-прежнему
требует отдельной прямой команды пользователя.

После отдельной прямой команды на production migration:

```bash
node scripts/db/migrate.mjs --apply --confirm-production
node scripts/db/migrate.mjs --status --require-current
```

Сразу проверить новые колонки/constraint/functions/grants. Между migration и web
deploy решения кураторов ставятся на короткую паузу: migration отзывает legacy
review RPC, а новый экран вызывает v2 RPC.

### 2. RPC

Deploy допустим только из чистого integration checkout. Штатный deploy-скрипт
копирует shared sync-merge source в пакет `heys-api-rpc`; текущий общий dirty
checkout поэтому не подходит даже при чистом diff `index.js`.

После отдельной прямой команды на deploy опубликовать только `heys-api-rpc`,
проверить health, новые allowlist/type hints, JWT-подмену `p_curator_id`, IDOR и
transaction-scoped encryption. `heys-maintenance` не переиздавать.

```bash
node scripts/db/migrate.mjs --status --require-current
node yandex-cloud-functions/function-inventory.cjs --verify
node yandex-cloud-functions/function-inventory.cjs \
  --assert-deployable heys-api-rpc
cd yandex-cloud-functions
./deploy-all.sh heys-api-rpc --dry-run
# только после отдельной прямой команды:
./deploy-all.sh heys-api-rpc
```

Не использовать `--force-dirty`, `--skip-checks` или `--skip-health`.

### 3. Web / landing

Web classifier должен вернуть только затронутые `boot-app` и `boot-core` для
трёх v2 source-файлов. Лендинг остаётся короткой формой и в v2 source не
меняется; smoke подтверждает, что на нём нет health-полей и ссылка после
контакта ведёт в универсальный `/?intake=1`. Отдельный landing deploy не
выполняется. Scoped dry-run подтверждает точный web scope, а production web
публикуется fast-forward push согласованного release commit в `main` через
канонический GitHub workflow. До успешного web gate пауза кураторских решений
сохраняется.

```bash
bash scripts/deploy-web-scoped.sh \
  --files=apps/web/heys_trial_intake_v1.js,apps/web/heys_trial_queue_v1.js,apps/web/heys_yandex_api_v1.js \
  --dry-run
# после DB/RPC gates и отдельной прямой команды:
git fetch origin
git merge-base --is-ancestor origin/main HEAD
git push origin HEAD:main
```

Clean-checkout интеграция от `HEAD` с наложением только трёх v2 web source
подтвердила `boot-app.bundle.6e50b5b76067.js` и
`boot-core.bundle.453e7c73cea1.js`. Shared preview дал другой `boot-core` из-за
параллельного dirty `heys_sync_merge_v1.js`; его hash и generated-файлы не
являются release evidence.

### 4. Synthetic production smoke

На заранее записанных синтетических client/lead IDs последовательно проверить:

1. существующая PIN-сессия открывает анкету без второго auth-контура;
2. `invite_prepared` восстанавливается после закрытия окна, копирование не
   меняет статус, явная отметка даёт `invite_sent`; resend уже отправленного
   приглашения отзывает старые сессии, но сохраняет исходный `invite_sent_at`;
3. без health consent `1.5` save блокируется; с актуальными runtime consent
   versions работает;
4. незаполненный safety-вопрос блокирует completion;
5. server autosave переживает reload, а client storage не содержит answers;
6. clarification и разделы остаются после draft-save, клиент не видит internal
   note, чужой curator получает `forbidden`;
7. `approved_waiting_slot` с будущей датой превращается в `approved` и
   `trial_pending`;
8. purge удаляет просроченный intake, оставляет canceled-marker и блокирует
   activation, но не удаляет свежий clarification или `completed`;
9. reapplication до 30 дней возвращает `reapply_cooldown`, после 30 дней
   переиспользует client, очищает encrypted data и отзывает старые sessions;
10. revoke health consent удаляет intake/health KV и завершает sessions;
11. удалить synthetic fixtures и подтвердить отсутствие связанных health,
    session, queue и consent-строк.
12. две клиентские и две кураторские вкладки со старым `updated_at` получают
    conflict без изменения свежих данных; повтор будущей активации не меняет
    первоначальную дату.

Ни PIN, ни session token, ни health-ответы не сохраняются в shell history или
release evidence. STOP при первом расхождении, без перехода к следующему этапу.

Cleanup выполняется одной транзакцией только по заранее записанным точным
synthetic `client_id`/`lead_id`, с row locks, проверкой synthetic marker и
жёстким ограничением количества строк. Запрещены выборки по имени, телефону или
дате. После удаления проверяется ноль строк в `clients`, `leads`,
`trial_intakes`, `client_sessions`, `trial_queue`, `consents`, `subscriptions`,
`client_kv_store`, `trial_queue_events` и `funnel_events`.
`data_access_audit_log` не удаляется: synthetic chronology остаётся evidence, но
metadata проверяется на отсутствие ответов, вопроса, заметки, PIN и токена.

## Facts Table

| Утверждение                                                                    | Источник                                                        | Проверка                                                                   | Результат                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| Managed manifest валиден; v2 зарегистрирован как order 10                      | clean `origin/main` checkout + `migrate.mjs`                    | `--check`: 10 managed / 323 baseline / 333 SQL                             | подтверждено локально      |
| Consent order 9 уже является production/remote baseline                        | production ledger + `origin/main`                               | `--status`: 9 applied / 1 pending; manifest diff добавляет только order 10 | подтверждено               |
| Новые статусы добавлены без удаления legacy `invited`                          | v2 migration                                                    | DB integration + status constraint                                         | подтверждено               |
| `invite_prepared` восстанавливаем, `invite_sent` требует явного действия       | curator UI + invite RPC                                         | UI contract + DB transition                                                | подтверждено               |
| Вопрос клиенту и заметка куратора хранятся раздельно и зашифрованно            | v2 migration                                                    | clarification round-trip + draft-save                                      | подтверждено               |
| Клиентский доступ остаётся session-bound                                       | `get/save_trial_intake_by_session`                              | ownership/session integration                                              | подтверждено               |
| Все safety-ответы `1.1` обязательны                                            | validator v2                                                    | negative completion fixture                                                | подтверждено               |
| Capacity не является причиной отказа v2                                        | review RPC v2                                                   | static contract + waiting activation                                       | подтверждено               |
| Повторная заявка блокирует lead, проверяет ownership/cooldown и очищает данные | reopen RPC                                                      | PostgreSQL negative/positive integration                                   | подтверждено               |
| Purge сохраняет свежий clarification и блокирует legacy activation             | purge + activation RPC                                          | PostgreSQL integration                                                     | подтверждено               |
| Stale client/curator writes не перезаписывают новое состояние                  | save/review RPC + UI                                            | PostgreSQL + static/UI contracts                                           | подтверждено локально      |
| Health revoke оставляет tombstone и блокирует legacy activation                | deferred revoke trigger + activation                            | PostgreSQL integration                                                     | подтверждено локально      |
| Convert→prepared атомарен и проверяет ownership lead                           | wrapper RPC + grants                                            | PostgreSQL integration                                                     | подтверждено локально      |
| Переходы пишут audit chronology без содержимого анкеты                         | SQL transition audit                                            | PostgreSQL metadata assertions                                             | подтверждено локально      |
| Web source классифицируется только в `boot-app`/`boot-core`                    | deploy scope planner                                            | exact three-file plan                                                      | подтверждено локально      |
| Чистый web bundle не включает parallel sync diff                               | disposable checkout от `origin/main` + exact three-file overlay | `boot-app 6e50b5b76067`, `boot-core 453e7c73cea1`                          | подтверждено локально      |
| Trial-suite не зависит от параллельного landing success-copy                   | static test boundary                                            | 25/25 на минимальном landing payload contract                              | подтверждено локально      |
| RPC manual deploy из shared dirty checkout не изолирован                       | `deploy-all.sh` sync copy                                       | source audit                                                               | STOP; нужен clean checkout |
