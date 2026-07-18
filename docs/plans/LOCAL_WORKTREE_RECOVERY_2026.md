# HEYS Local Worktree Recovery 2026

- Статус: **in progress**
- Начато: **2026-07-18**
- Контрольная ветка: `codex/local-recovery-20260718`
- База: `origin/main` @ `1f77cce5d5fbde96f43aaf6173046123f07d25ae`
- Исходный dirty checkout: `/Users/poplavskijanton/HEYS-v2`
- Контрольный worktree: `/private/tmp/heys-recovery-20260718`

## Цель

Без потери пользовательских изменений разобрать накопленный локальный scope,
перенести полезные части на актуальный `origin/main`, проверить и публиковать их
независимыми логическими группами. Исходный checkout до завершения захвата
используется только как источник чтения: без `stash`, `reset`, `restore`,
удаления или перезаписи файлов.

## Критерий завершения

- Каждое локальное изменение классифицировано как опубликованное, сохранённое
  для следующей итерации, сгенерированное заново либо ожидающее конкретного
  решения пользователя.
- Полезные группы перенесены на текущую remote-базу, покрыты соразмерными
  проверками и отдельными commit'ами.
- Для опубликованных групп подтверждены remote commit и, где применимо,
  production/deployment state.
- Исходный dirty checkout не очищается необратимо без отдельного подтверждения;
  к финалу существует точная таблица того, что в нём осталось и почему.

## Правила интеграции

1. Работать только в чистых worktree от актуального `origin/main`.
2. Не копировать целые конфликтующие файлы поверх remote-версии: переносить
   локальный смысл поверх текущих контрактов.
3. Одна группа — один независимый scope, точечные тесты и логический commit.
4. Source и тесты первичны. Web bundles, manifests, service worker и release
   notes не считать самостоятельным исходником; пересобирать их после интеграции
   source в разрешённом release-проходе.
5. DB migration применять только после фиксации неизменяемого SQL в commit и
   прохождения idempotency/contract gates.
6. Не смешивать deploy cloud functions, web release и DB apply, если группа не
   требует их как единый атомарный rollout.

## Карта групп

| ID  | Группа                             | Предварительный scope                                                  | Статус                    | Выходной gate                                       |
| --- | ---------------------------------- | ---------------------------------------------------------------------- | ------------------------- | --------------------------------------------------- |
| G01 | Mobile / WebView                   | `apps/mobile/app/web/index.tsx`                                        | source published          | navigation/session tests                            |
| G02 | Nutrition / day / insulin wave     | `apps/web/day/**`, day bundles, IW, products, status, advice           | wave 3 committed + tested | точечные расчётные и UI-contract tests              |
| G03 | Mobility                           | `apps/web/mobility/**`, mobility bundle/tests/styles                   | wave 3 committed + tested | mobility suite + scoped UI bundle                   |
| G04 | Storage / sync                     | storage layer/supabase, merge/snapshot tests                           | wave 3 committed + tested | sync-critical contracts                             |
| G05 | Product contracts                  | gamification, predictive, subscriptions/paywall, supplements, training | wave 3 committed + tested | отдельные regression tests по дефектам              |
| G06 | RPC / Telegram / reminders / leads | cloud functions, deploy script, новые function tests                   | published + deployed      | package gates + load checks + canary после deploy   |
| G07 | DB migration                       | `scripts/db/migrations/2026-07-18_push_idempotency_delivery_state.sql` | applied + verified        | checksum, idempotency tests, managed apply          |
| G08 | Documentation                      | root/docs/reference/infra/function docs                                | transferred + audited     | ссылки и утверждения сверены с опубликованным кодом |
| G09 | Generated web artifacts            | bundles, manifests, `sw.js`, `whats-new.json`, hash sync               | regenerate only           | release build from integrated source                |

Статусы групп будут обновляться значениями `inventory`, `transferred`, `tested`,
`committed`, `published`, `deployed`, `blocked` или `superseded`.

## Порядок проходов

1. Зафиксировать net-diff каждой группы относительно локального `HEAD` и
   проверить пересечения с 14 remote commit'ами.
2. Сначала интегрировать маленькие независимые regression fixes, затем
   storage/sync и cloud/DB, после них крупные nutrition и mobility scopes.
3. Документацию обновлять вслед за фактическими code commit'ами.
4. Generated web artifacts собрать один раз из итогового source и публиковать
   отдельным release commit только после зелёных source gates.
5. Выполнить итоговый remote/production audit и сформировать точную карту
   остатка исходного checkout.

## Facts Table

| Claim                                                                      | Source           | Verify command                                                                                                                                                       | Result на 2026-07-18                                                                                                                              |
| -------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Предыдущая программа R01–R10 завершена                                     | remote roadmap   | `git show origin/main:docs/plans/TECHNICAL_RISK_PROGRAM_2026.md \| sed -n '1,35p'`                                                                                   | ✅ roadmap имеет статус `completed`, все R01–R10 отмечены `completed`                                                                             |
| Актуальная remote-база — `1f77cce5`                                        | Git ref          | `git rev-parse origin/main`                                                                                                                                          | ✅ `1f77cce5d5fbde96f43aaf6173046123f07d25ae`                                                                                                     |
| Исходный local `main` отстаёт на 14 commit'ов                              | Git history      | `git rev-list --count HEAD..origin/main`                                                                                                                             | ✅ `14`                                                                                                                                           |
| Исходный checkout содержит 93 tracked и 41 untracked path                  | Git status       | `git diff --name-only \| wc -l`; `git ls-files --others --exclude-standard \| wc -l`                                                                                 | ✅ `93` и `41`                                                                                                                                    |
| Tracked dirty scope без generated web/hash файлов — 78 файлов              | Git diff         | `git diff --shortstat HEAD -- . ':(exclude)apps/web/public/**' ':(exclude)apps/web/bundle-manifest.json' ':(exclude)apps/web/index.html'`                            | ✅ `78 files changed`                                                                                                                             |
| Локальные и remote-изменения пересекаются в source у storage, RPC и deploy | Git intersection | `comm -12 <(git diff --name-only HEAD \| sort) <(git diff --name-only HEAD..origin/main \| sort)`                                                                    | ✅ пересечения включают `heys_storage_supabase_v1.js`, `heys-api-rpc/index.js`, `deploy-all.sh`; остальные пересечения — web generated/hash files |
| Контрольный worktree создан чистым от текущего `origin/main`               | worktree status  | `git -C /private/tmp/heys-recovery-20260718 status --short --branch`                                                                                                 | ✅ ветка `codex/local-recovery-20260718`, dirty paths отсутствуют                                                                                 |
| Production web отвечает, а HEYS automation canary проходит                 | live checks      | HTTP check `https://app.heyslab.ru/`; `pnpm ops:heys:canary`                                                                                                         | ✅ HTTP 200; canary 4/4 на старте recovery                                                                                                        |
| Mobile safe-area patch совместим с navigation/session contracts            | tests            | `pnpm test:mobile:critical`; `pnpm --dir apps/mobile type-check`                                                                                                     | ✅ 10/10 tests; TypeScript без ошибок                                                                                                             |
| Game stale-write guard одинаков в browser, RPC и REST                      | source mirror    | `cmp -s apps/web/heys_sync_merge_v1.js yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs`; аналогично REST                                              | ✅ обе serverless-копии byte-identical источнику                                                                                                  |
| Новый merge outcome сохраняет существующие sync-контракты                  | tests            | `pnpm vitest run apps/web/__tests__/merge-scalar-kv-meta.test.js apps/web/__tests__/sync-merge-shared.test.js`                                                       | ✅ 109/109 tests                                                                                                                                  |
| RPC и REST с новым merge-контрактом загружаются как cloud functions        | function gate    | `yandex-cloud-functions/test-functions.sh heys-api-rpc heys-api-rest`                                                                                                | ✅ 2/2 target gates                                                                                                                               |
| Recovery wave 1 опубликована в `main`                                      | Git remote       | `git fetch origin`; `git rev-parse origin/main`                                                                                                                      | ✅ `ae5e97316a8e4b1e774c50310899b26d369c6bf8`                                                                                                     |
| Web release wave 1 развернут и совпадает с HEAD                            | GitHub Actions   | `gh run view 29624626130`                                                                                                                                            | ✅ build, 2,816-test gate, deploy, health и deployed-state verify прошли                                                                          |
| RPC game guard работает из Node.js 22 production version                   | cloud metadata   | `yc serverless function version list --function-id d4e9e90es31bgjp87j8i --limit 1 --format json`                                                                     | ✅ ACTIVE; `HEYS_DEPLOY_COMMIT=37a6dbf8`; post-deploy health и canary 4/4                                                                         |
| Production bundles содержат runtime-код wave 1                             | live assets      | `curl --compressed` production hashes и `rg` по новым identifiers                                                                                                    | ✅ найдены `mergeScalarKvWithOutcome`, `cloud_precheck:failed_blocked`, `getLatestValidMeal`, `buildScoreHistory`                                 |
| Leads validation не обращается к БД для invalid phone                      | function tests   | `node --test yandex-cloud-functions/heys-api-leads/__tests__/phone-validation.test.cjs`                                                                              | ✅ 6/6 tests; function pre-deploy gate passed                                                                                                     |
| Telegram lead claim авторизован и идемпотентен                             | function tests   | `node --test yandex-cloud-functions/heys-bot-client/__tests__/lead-taken-callback.test.cjs yandex-cloud-functions/heys-bot-client/__tests__/start-lead-crm.test.cjs` | ✅ 23/23 tests; function pre-deploy gate passed                                                                                                   |
| Push delivery state совместим с production-схемой                          | DB dry-run       | managed migration в `BEGIN`/`ROLLBACK`, затем повторная проверка колонок и test key                                                                                  | ✅ схема применена и проверена; после rollback осталось 2 исходные колонки и 0 test rows                                                          |
| Reminder retry contract проходит package gate                              | function tests   | `yandex-cloud-functions/test-functions.sh heys-cron-reminders`                                                                                                       | ✅ 33/33 function tests; pre-deploy gate passed                                                                                                   |
| Recovery wave 2 опубликована и развернута                                  | Git/YC/DB        | `git rev-parse origin/main`; managed migration history; function metadata и canary                                                                                   | ✅ `origin/main` @ `4fce1cbf`; migration применена; leads, bot и reminders deployed; canary 4/4                                                   |
| Storage write failures не маскируются успешным локальным save              | tests            | `pnpm vitest run apps/web/__tests__/storage-layer.test.js`                                                                                                           | ✅ contract усилен в `dd849853`                                                                                                                   |
| Product placeholder, subscription gate и training save fail closed         | tests            | targeted product/subscription/training suites                                                                                                                        | ✅ commits `b9695eaa`, `c2699583`, `8559f107`; 47/47 targeted tests                                                                               |
| Явные `grams: 0` сохраняются во всех подтверждённых nutrition readers      | tests            | `pnpm vitest run apps/web/__tests__/item-grams-zero-contract.test.js`                                                                                                | ✅ 6/6 contract; commit `67fc869f`                                                                                                                |
| Mobility safety и pair-save recovery покрыты всем domain suite             | tests            | `pnpm vitest run apps/web/__tests__/mobility-*.test.js`                                                                                                              | ✅ 13 files, 173 tests; commit `a5c01506`                                                                                                         |
| Новый живой справочник имеет воспроизводимые Facts Table и целые ссылки    | docs audit       | read-only execution встроенных команд + relative-link scan                                                                                                           | ✅ 181 быстрых проверки: 181/181 после исправления синтаксиса; 12 test-команд подтверждены профильными прогонами; новых broken links нет          |

## Журнал выполнения

### 2026-07-18 — baseline и безопасный контур

- Полностью прочитаны project/user instructions и завершённая technical-risk
  roadmap.
- Проверены Git refs, 14 remote commit'ов, dirty inventory и пересечения.
- Production baseline зелёный: web HTTP 200, последние deploy/security runs
  successful, automation canary 4/4.
- Создан чистый контрольный worktree от `origin/main`; исходный checkout не
  изменялся.

### 2026-07-18 — первые независимые группы

- G01: Android WebView получил нижний safe area без изменения iOS; mobile
  critical 10/10 и type-check прошли; commit `6f86312f`.
- G05: score history приведён к шкале 0–100 (`68d573d5`), status использует
  фактически позднейшее валидное время приёма пищи (`99bac7d8`), gamification
  fail-closed блокирует запись при неуспешном cloud precheck (`cd8d913e`).
  Regression tests: 4/4 и 4/4; hook обновил только line-drift allowlist.
- G04/G06: `heys_game` stale write теперь возвращает явный
  `stale_write_blocked`. Pre-commit gate обнаружил отсутствующий browser/REST
  mirror; контракт исправлен во всех трёх runtime-копиях. Merge tests 109/109,
  RPC+REST function gates 2/2; commit `37a6dbf8`.

### 2026-07-18 — wave 1 опубликована и развернута

- Integration commits: merge `6bbe6916`, generated release `c66f5794`, What's
  New `ae5e9731`; `origin/main` опубликован до `ae5e9731`.
- Pre-push: 208 test files, 2,816 passed, 33 skipped; bundle/source и size gates
  прошли.
- GitHub web deploy `29624626130` и cloud auto-deploy `29624626142` завершились
  success; production deployed-state совпал с HEAD.
- `heys-api-rpc` дополнительно развернут selective deploy: latest ACTIVE,
  Node.js 22, `HEYS_DEPLOY_COMMIT=37a6dbf8`; HTTP/DB health и canary 4/4.
- Production assets содержат все четыре новых runtime-маркера. Mobile source
  опубликован, но новый RuStore APK в этой wave не собирался и не загружался.

### 2026-07-18 — wave 2 подготовлена

- G06: серверная валидация телефона лида выполняется до rate-limit/БД; commit
  `483c5c1d`, 6/6 tests и function gate.
- G06: curator bot обрабатывает `Взял в работу` через существующий long-poll,
  авторизует actor/chat и атомарно переводит один лид в `contacted`; commit
  `c4a188ea`, 23/23 tests и function gate.
- G06/G07: неуспешная Web Push-доставка освобождает bounded claim для retry, а
  успешная доставка становится terminal sentinel; commit `1a852982`, 33/33
  function tests и migration runner checks.
- Конфликтующий local diff `deploy-all.sh` не перенесён: он возвращал секреты из
  Lockbox в environment variables и ослаблял опубликованный security contract.

### 2026-07-18 — wave 2 опубликована и развернута

- Source, migration metadata, release notes и SAST-fix опубликованы до
  `origin/main` @ `4fce1cbf`.
- Managed migration применена до функции reminders; leads, bot и reminders
  развернуты selective deploy и прошли function gates/health.
- Общий automation canary прошёл 4/4. Cloud heartbeat bot polling был
  актуальным; локальная прямая Telegram-проверка была ограничена сетью, поэтому
  реальное callback-нажатие не заявляется как проверенное.

### 2026-07-18 — wave 3 source и документация

- G04: storage API возвращает результат local write и не скрывает сбой; commit
  `dd849853`.
- G02/G05: unresolved shared nutrients блокируют выбор, subscription access
  fail-closed, training save подтверждается readback, явные `grams: 0`
  сохраняются; commits `b9695eaa`, `c2699583`, `8559f107`, `67fc869f`.
- G03: mobility onboarding fail-closed, профиль сохраняется, pair-save имеет
  idempotent recovery и мгновенное обновление records; commit `a5c01506`; полный
  mobility suite — 173/173.
- G08: перенесён живой справочник и маркировки старых документов. Проверены
  relative links и 181 быстрая команда Facts Table; исправлены невыполнимые
  примеры и устаревшие фразы о deployment wave 2.

## Durable handoff

### Current state

- Wave 1 и wave 2 опубликованы и проверены в production; G01 source опубликован
  без отдельного RuStore release.
- G02–G05 source закоммичены и протестированы в wave 3. G08 перенесена и
  проверена; G09 требует единой integration/release сборки.
- Исходный checkout остаётся неизменным dirty-источником.

### Next action

Зафиксировать G08, интегрировать wave 3 в чистом worktree от текущего
`origin/main`, пересобрать release artifacts один раз, пройти pre-push gates,
опубликовать и подтвердить GitHub deploy, production health и runtime markers.
