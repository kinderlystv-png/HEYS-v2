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

| ID  | Группа                             | Предварительный scope                                                  | Статус          | Выходной gate                                       |
| --- | ---------------------------------- | ---------------------------------------------------------------------- | --------------- | --------------------------------------------------- |
| G01 | Mobile / WebView                   | `apps/mobile/app/web/index.tsx`                                        | inventory       | navigation/session tests                            |
| G02 | Nutrition / day / insulin wave     | `apps/web/day/**`, day bundles, IW, products, status, advice           | inventory       | точечные расчётные и UI-contract tests              |
| G03 | Mobility                           | `apps/web/mobility/**`, mobility bundle/tests/styles                   | inventory       | mobility suite + scoped UI bundle                   |
| G04 | Storage / sync                     | storage layer/supabase, merge/snapshot tests                           | inventory       | sync-critical contracts                             |
| G05 | Product contracts                  | gamification, predictive, subscriptions/paywall, supplements, training | inventory       | отдельные regression tests по дефектам              |
| G06 | RPC / Telegram / reminders / leads | cloud functions, deploy script, новые function tests                   | inventory       | package gates + load checks + canary после deploy   |
| G07 | DB migration                       | `database/2026-07-18_push_idempotency_delivery_state.sql`              | inventory       | checksum, idempotency tests, managed apply          |
| G08 | Documentation                      | root/docs/reference/infra/function docs                                | inventory       | ссылки и утверждения сверены с опубликованным кодом |
| G09 | Generated web artifacts            | bundles, manifests, `sw.js`, `whats-new.json`, hash sync               | regenerate only | release build from integrated source                |

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

| Claim                                                                      | Source           | Verify command                                                                                                                            | Result на 2026-07-18                                                                                                                              |
| -------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Предыдущая программа R01–R10 завершена                                     | remote roadmap   | `git show origin/main:docs/plans/TECHNICAL_RISK_PROGRAM_2026.md \| sed -n '1,35p'`                                                        | ✅ roadmap имеет статус `completed`, все R01–R10 отмечены `completed`                                                                             |
| Актуальная remote-база — `1f77cce5`                                        | Git ref          | `git rev-parse origin/main`                                                                                                               | ✅ `1f77cce5d5fbde96f43aaf6173046123f07d25ae`                                                                                                     |
| Исходный local `main` отстаёт на 14 commit'ов                              | Git history      | `git rev-list --count HEAD..origin/main`                                                                                                  | ✅ `14`                                                                                                                                           |
| Исходный checkout содержит 93 tracked и 41 untracked path                  | Git status       | `git diff --name-only \| wc -l`; `git ls-files --others --exclude-standard \| wc -l`                                                      | ✅ `93` и `41`                                                                                                                                    |
| Tracked dirty scope без generated web/hash файлов — 78 файлов              | Git diff         | `git diff --shortstat HEAD -- . ':(exclude)apps/web/public/**' ':(exclude)apps/web/bundle-manifest.json' ':(exclude)apps/web/index.html'` | ✅ `78 files changed`                                                                                                                             |
| Локальные и remote-изменения пересекаются в source у storage, RPC и deploy | Git intersection | `comm -12 <(git diff --name-only HEAD \| sort) <(git diff --name-only HEAD..origin/main \| sort)`                                         | ✅ пересечения включают `heys_storage_supabase_v1.js`, `heys-api-rpc/index.js`, `deploy-all.sh`; остальные пересечения — web generated/hash files |
| Контрольный worktree создан чистым от текущего `origin/main`               | worktree status  | `git -C /private/tmp/heys-recovery-20260718 status --short --branch`                                                                      | ✅ ветка `codex/local-recovery-20260718`, dirty paths отсутствуют                                                                                 |
| Production web отвечает, а HEYS automation canary проходит                 | live checks      | HTTP check `https://app.heyslab.ru/`; `pnpm ops:heys:canary`                                                                              | ✅ HTTP 200; canary 4/4 на старте recovery                                                                                                        |

## Журнал выполнения

### 2026-07-18 — baseline и безопасный контур

- Полностью прочитаны project/user instructions и завершённая technical-risk
  roadmap.
- Проверены Git refs, 14 remote commit'ов, dirty inventory и пересечения.
- Production baseline зелёный: web HTTP 200, последние deploy/security runs
  successful, automation canary 4/4.
- Создан чистый контрольный worktree от `origin/main`; исходный checkout не
  изменялся.

## Durable handoff

### Current state

- Recovery roadmap создана в контрольной ветке, но ещё не закоммичена.
- Ни одна пользовательская группа пока не переносилась и не публиковалась.
- Исходный checkout остаётся неизменным dirty-источником.

### Next action

Построить подробный inventory G01–G09: для каждого файла отделить локальный
patch от уже опубликованных remote-изменений, после чего начать с самой
маленькой независимой группы, не имеющей конфликтов с `origin/main`.
