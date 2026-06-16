# HEYS-v2 Release Readiness Methodology

Дата аудита: 2026-06-17  
Область: весь проект HEYS-v2 в `/Users/poplavskijanton/HEYS-v2`  
Принцип: клиентская надежность без оверинжиниринга.

## 1. Executive Summary

HEYS-v2 близок к управляемому клиентскому релизу на текущем масштабе, но выпуск
реальным клиентам нельзя считать готовым до закрытия нескольких конкретных
рисков: красного auth/session regression, live-проверки tenant isolation strict
flags, юридических задач по персональным данным и коротких smoke-проверок
sync/storage на production-like окружении.

Сильные стороны проекта:

- Архитектурные инварианты для продуктов, sync и storage явно описаны и частично
  закреплены линтами.
- Критический sync-набор тестов проходит: `79` тестов в `6` файлах.
- Legacy bundles сейчас синхронизированы с manifest и `index.html`.
- Мобильность и тренировочное ядро имеют формальную карту покрытия, а
  `check:mobility-map` проходит.
- Документы по security, release process, data-loss и debugging уже есть, то
  есть релизный процесс не нужно строить с нуля.

Главные стоп-факторы:

- `pnpm test:regressions` красный: cookie-only PIN logout regression ожидает
  старый контракт, а source использует `hasCookieSessionHint('pin')`.
- Live-строгость `HEYS_WRITE_CONTEXT_STRICT=1` и `HEYS_REST_READ_STRICT=1` не
  подтверждена в этой сессии, а security review прямо помечает tenant isolation
  как P0 до подтверждения.
- Для публичной работы с реальными клиентами остаются пользовательские/legal
  задачи: уведомления в РКН и внутренняя политика обработки ПДн.
- Dependency audit refresh закрыт 2026-06-17: `pnpm deps:check` и
  `pnpm audit --prod` зелёные после точечных dependency bumps/overrides.

## 2. Release Readiness Scorecard

| Area                          | Status       | Release meaning                                                                                         | Evidence                                                                                                    |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Product & Release Readiness   | Yellow       | Основные flows описаны, но pre-release smoke по PIN/curator/sync нужен перед клиентами.                 | `todo.md:7`, `todo.md:245`, `docs/RELEASE_PROCESS.md:111`                                                   |
| Architecture & Modularity     | Green/Yellow | Инварианты ясные; ядро тренировок извлекается через contracts, без преждевременной сверх-абстракции.    | `apps/web/ARCHITECTURE.md:10`, `apps/web/_kernel/KERNEL_EXTRACTION_PLAN.md:10`                              |
| Data, Sync, Auth & Storage    | Yellow/Red   | Source содержит защитные механизмы, но auth regression красный и live strict не подтвержден.            | `apps/web/heys_storage_supabase_v1.js:12200`, `TESTS/regressions/task-005-write-context-resilience.test.ts` |
| Security & Privacy            | Yellow/Red   | Security headers, origin guards и allowlist есть; legal и strict production checks обязательны.         | `yandex-cloud-functions/heys-api-rest/index.js:411`, `docs/SECURITY_REVIEW.md:83`, `todo.md:245`            |
| Reliability                   | Yellow       | Есть backoff, pending registry, bundle verification; нужны короткие production-like recovery smokes.    | `apps/web/heys_storage_supabase_v1.js:10680`, `apps/web/heys_day_global_exports_v1.js:7`                    |
| UX, UI & Copy                 | Yellow       | Правила UI-инвариантов заданы, но релизу нужен focused walkthrough empty/loading/error/mobile.          | `AGENTS.md`, `todo.md:103`, `apps/web/ARCHITECTURE.md:238`                                                  |
| Training Modules              | Green/Yellow | Мобильность покрыта картой; широкий glob тестов выявил isolation risk.                                  | `apps/web/mobility/IMPLEMENTATION_PROTOCOL.md:31`, command `check:mobility-map`                             |
| Testing & QA                  | Yellow/Red   | Критические sync-тесты зеленые; regression остаётся отдельным красным пунктом; dependency audit закрыт. | command results below                                                                                       |
| Performance & Maintainability | Yellow       | Android freezes исследованы; есть правый размер плана без переписывания приложения.                     | `docs/PERF_ANDROID_2026-06.md:31`, `docs/REFACTOR_REACT_MEMO_DAY_TAB.md:7`                                  |
| Release Operations            | Green/Yellow | Hooks/release path описаны; важно не обходить hooks и не запускать generated builds без команды.        | `.husky/pre-push:4`, `docs/RELEASE_PROCESS.md:1`                                                            |

## 3. Methodology

Аудит выполнен как 10 последовательных прогонов, каждый прогон смотрит один вид
риска и фиксирует только достаточные действия для релиза на текущем масштабе.

Для каждой рекомендации используется формат:

- `Priority`: `P0` блокирует клиентский релиз, `P1` закрыть до широкого запуска
  или сразу после первого controlled release, `P2` плановая доработка.
- `Risk addressed`: какой клиентский или операционный риск снимаем.
- `Minimal sufficient fix`: минимальная правка или проверка, достаточная сейчас.
- `Acceptance criteria`: как понять, что риск закрыт.
- `Overengineering guardrail`: что специально не делаем.

## 4. Right-Sizing Principles

- Надежность клиента важнее идеального SaaS-процесса.
- Не требовать 100% coverage; покрывать критические риски: auth, sync, storage,
  data-loss, release hooks, mobile responsiveness.
- Не вводить тяжелый observability stack; достаточно существующих diagnostics,
  trace logs, targeted smoke checks и понятного support runbook.
- Не переписывать localStorage/sync перед релизом; исправлять проверенные слабые
  места.
- Не вытаскивать все тренировочные домены в универсальный framework раньше
  времени; следовать правилу contracts и двух референс-реализаций.
- Не блокировать core release платежными задачами, если платежи не включены для
  клиентов.

## 5. Findings By Review Pass

### Pass 1. Product & Release Readiness

| Priority | Recommendation                                                                                                                                    | Risk addressed                                                                 | Minimal sufficient fix                                                                                         | Acceptance criteria                                                                                                   | Overengineering guardrail                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| P0       | Зафиксировать pre-release smoke для real-client flows: PIN login, curator login, add product/meal, cross-device sync, logout, export/delete path. | Клиент сразу попадает в broken flow или теряет данные.                         | Один чеклист на 30-45 минут на production-like окружении с двумя клиентами и двумя ролями.                     | Smoke пройден, pending queue `0`, данные одинаковы в PIN и curator sessions, logout работает для cookie-only session. | Не строить полноценную QA platform; достаточно повторяемого чеклиста и команд.   |
| P0       | Закрыть user-only legal blockers: уведомления РКН и внутренняя политика ПДн.                                                                      | Риск выпуска с реальными персональными данными без базовых legal оснований.    | Пользователь подает 2 уведомления РКН и утверждает внутреннюю политику.                                        | Статус задач отмечен как done в release checklist.                                                                    | Не внедрять enterprise GRC; только обязательные документы для текущего масштаба. |
| P1       | Разделить demo/prod ожидания в release checklist.                                                                                                 | Demo-данные или тестовые ожидания могут попасть в клиентский запуск.           | В чеклисте явно отметить env, тестовых клиентов, реальные роли, платежи enabled/disabled.                      | Перед релизом есть заполненная строка `environment`, `clients`, `roles`, `payments mode`.                             | Не делать сложную environment matrix.                                            |
| P1       | Support flow должен иметь короткую диагностическую карточку.                                                                                      | При первом клиентском инциденте команда теряет время на ручной сбор контекста. | В release checklist добавить: client id, role, browser, last sync time, last error, pending queue, screenshot. | Support issue можно заполнить за 5 минут без доступа к devtools клиента.                                              | Не подключать helpdesk/CRM ради первого релиза.                                  |

### Pass 2. Architecture & Modularity

| Priority | Recommendation                                                                          | Risk addressed                                                                        | Minimal sufficient fix                                                                                | Acceptance criteria                                                     | Overengineering guardrail                       |
| -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| P1       | Держать `apps/web/_kernel` как contract layer, а не как место для доменных shortcut-ов. | Kernel закрепит допущения пальцев/мобильности и станет хрупким для следующих режимов. | Для новых общих механизмов требовать ссылку на contract и хотя бы один второй доменный use-case.      | Новая общая логика либо в `_kernel` с contract, либо остается в домене. | Не делать большой framework до третьего домена. |
| P1       | Исправить documentation drift по `storage_audit_enforce`.                               | Команда может ошибочно думать, что enforcement выключен по умолчанию.                 | Обновить `apps/web/ARCHITECTURE.md`: source default сейчас `true`.                                    | Док и `heys_feature_flags_v1.js` говорят одно и то же.                  | Не вводить отдельный config registry.           |
| P2       | Добавить короткий ADR для границы generated/source artifacts.                           | Риск случайно закоммитить generated bundles в agent-работе.                           | Одна секция в release docs: source-only agent changes, bundles only through integration/release flow. | Новый агент понимает, какие команды запрещены без прямой команды.       | Не строить отдельную release branch policy.     |

### Pass 3. Data, Sync, Auth & Storage

| Priority | Recommendation                                                | Risk addressed                                                                    | Minimal sufficient fix                                                                                                                         | Acceptance criteria                                                                                      | Overengineering guardrail                                                   |
| -------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| P0       | Починить или переутвердить cookie-only PIN logout regression. | Пользователь может остаться в сессии, либо тесты не ловят реальный auth contract. | Если `hasCookieSessionHint('pin')` верный новый контракт, обновить regression test и добавить black-box logout smoke; иначе вернуть поведение. | `pnpm test:regressions` green или targeted task-005 green; cookie-only logout подтвержден runtime-smoke. | Не переписывать auth; закрыть конкретный контракт logout.                   |
| P0       | Live-проверить tenant isolation strict flags.                 | Cross-client write/read может пройти в production при неверном env.               | Проверить `HEYS_WRITE_CONTEXT_STRICT=1`, `HEYS_REST_READ_STRICT=1` и выполнить IDOR smoke с двумя клиентами.                                   | Чужой client write/read получает deny, легитимные PIN/curator flows работают.                            | Не внедрять новую auth platform; проверить текущие guards.                  |
| P1       | Закрепить stale snapshot/offline conflict smoke.              | При offline/online или clock skew может перетереться свежая запись.               | Один сценарий: локальная правка, cloud snapshot, reconnect, verify merge.                                                                      | Нет data loss; diagnostics показывают expected skip/apply reason.                                        | Не заменять sync engine; использовать существующие revision checks и tests. |
| P1       | Добавить smoke corrupted localStorage recovery.               | Один битый LS value может ломать клиентский старт.                                | В devtools/test подложить некорректный JSON для некритичного ключа и проверить graceful recovery.                                              | UI стартует, error logged, auth keys не тронуты.                                                         | Не мигрировать storage на IndexedDB перед релизом.                          |

### Pass 4. Security & Privacy

| Priority | Recommendation                                              | Risk addressed                                                                                  | Minimal sufficient fix                                                                          | Acceptance criteria                                                | Overengineering guardrail                                           |
| -------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| P0       | Закрыть legal ПДн задачи до real-client launch.             | Регуляторный риск обработки персональных данных.                                                | РКН уведомления и внутренняя политика обработки ПДн.                                            | Ссылки/номера/статусы внесены в release checklist.                 | Не покупать DLP/SIEM на текущем этапе.                              |
| P0       | Production IDOR/read/write sanity check перед релизом.      | Один клиент видит или меняет данные другого клиента.                                            | Curl/browser smoke с двумя clients и curator/PIN roles.                                         | Запрещенные операции получают deny; allowed flows не ломаются.     | Не строить pentest program до первого контролируемого релиза.       |
| P1       | Разобрать `pnpm audit` high advisories.                     | Уязвимые dev/build/test зависимости могут быть использованы в dev server или supply-chain пути. | ✅ 2026-06-17: точечно bump/override для `form-data`, `vite`, `dompurify` и связанных dev deps. | `pnpm deps:check` green; `pnpm audit --prod` green.                | Не вводить SCA platform; достаточно lockfile hygiene и audit notes. |
| P1       | Проверить, что secrets не логируются в support/debug flows. | Токены могут попасть в issue/screenshot/log.                                                    | Один grep/log review по auth/session keys и support checklist.                                  | Support карточка не просит токены; logs не содержат session token. | Не внедрять централизованный secret scanner как релизный блокер.    |

### Pass 5. Reliability

| Priority | Recommendation                                         | Risk addressed                                                      | Minimal sufficient fix                                                                             | Acceptance criteria                                                    | Overengineering guardrail                                                 |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P1       | Прогнать recovery smoke для network timeout и API 413. | Клиентская запись может застрять без понятного восстановления.      | Отключить сеть/подложить oversized payload в dev smoke, проверить backoff и user-visible recovery. | Retry/backoff срабатывает, UI не зависает, запись не теряется молча.   | Не строить distributed queue; достаточно текущего backoff и diagnostics.  |
| P1       | Проверить concurrent tabs на один client.              | Две вкладки могут перетереть изменения или держать stale snapshot.  | Две вкладки: изменить рацион/продукт в обеих, проверить финальное состояние и logs.                | Нет silent data loss; конфликт объясним в trace.                       | Не вводить CRDT; текущий revision/tombstone contract должен пройти smoke. |
| P1       | Закрыть broad training test isolation failure.         | Широкий прогон может быть flaky и скрывать реальные UI regressions. | Очистить DOM/state между training tests или сузить setup.                                          | Broad glob `kernel/fingers/mobility` проходит стабильно 2 раза подряд. | Не переписывать test runner.                                              |
| P2       | Добавить короткую mobile reload smoke процедуру.       | Android-specific freezes и stale UI могут попасть к клиенту.        | Один сценарий на реальном/эмулированном Android: scroll, add item, reload, sync.                   | Время отклика в приемлемом диапазоне; нет повторного freeze.           | Не делать device lab.                                                     |

### Pass 6. UX, UI & Copy

| Priority | Recommendation                                                                                                      | Risk addressed                                                     | Minimal sufficient fix                                                           | Acceptance criteria                                                | Overengineering guardrail                           |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| P1       | Проверить empty/loading/error states в PIN и curator flows.                                                         | Клиент не понимает, идет ли sync, ошибка или пустые данные.        | Walkthrough с чеклистом: first login, empty ration, sync error, offline, logout. | В каждом состоянии есть короткое понятное действие или объяснение. | Не писать onboarding tour для всего продукта.       |
| P1       | Для методологических правил тренировок показывать практичный reason/tooltip там, где engine влияет на рекомендацию. | Пользователь не доверяет рекомендации или не понимает safety gate. | Только для правил, меняющих решение: badge/reason row/help popover.              | В UI видно, что учтено и что делать пользователю.                  | Не делать учебник методологии в интерфейсе.         |
| P1       | Проверить mobile layout без перекрытий на ключевых экранах.                                                         | Первый клиентский опыт на телефоне ломается визуально.             | Browser/Playwright screenshots по ключевым screens после запуска dev окружения.  | Нет перекрытий, кнопки доступны, текст не вылезает.                | Не делать полный visual regression suite до релиза. |
| P2       | Landing/copy править только после чтения `apps/landing/COPY_VOICE.md`.                                              | Риск overpromise и неуместного tone.                               | Перед copy change читать voice doc и вносить историю замечаний.                  | Copy review соответствует blacklist/principles.                    | Не запускать brand book project.                    |

### Pass 7. Training Modules

| Priority | Recommendation                                                                                                              | Risk addressed                                               | Minimal sufficient fix                               | Acceptance criteria                                               | Overengineering guardrail                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| P1       | Для release считать готовым только модуль, прошедший safety/protocols/periodization/records/runner/onboarding/bibliography. | Выпуск "MVP" тренировочного режима с дырками в безопасности. | Использовать `TRAINING_MODE_REGULATION.md` как gate. | Для включенного режима есть methodology map и green check команд. | Не требовать все будущие домены до core release. |
| P1       | После исправления test isolation повторить broad training subset.                                                           | Модуль может быть source-complete, но UI tests нестабильны.  | Прогнать broad glob 2 раза.                          | 0 failures; isolated and broad results совпадают.                 | Не писать e2e для каждого упражнения сразу.      |
| P2       | Отложить тяжелое извлечение periodization/limiter/progression до второго/третьего домена.                                   | Риск преждевременной абстракции.                             | Держать common only where contract already proven.   | Новый common code имеет domain-neutral interface.                 | Не строить универсальный training engine сейчас. |

### Pass 8. Testing & QA

| Priority | Recommendation                                                            | Risk addressed                                                 | Minimal sufficient fix                                                                                                                              | Acceptance criteria                             | Overengineering guardrail                                                     |
| -------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| P0       | Сделать `pnpm test:regressions` green для auth/session критического пути. | Релиз с красным regression suite по auth.                      | Закрыть cookie-only logout failure.                                                                                                                 | `pnpm test:regressions` exit 0.                 | Не требовать весь monorepo `pnpm test`, потому `turbo test` зависит от build. |
| P1       | Добавить короткий pre-release test pack.                                  | Команда не знает, какие проверки обязательны без build/bundle. | Pack: `validate:ci`, storage lints, `test:web:sync-critical`, `test:regressions`, `verify:legacy-bundles`, `check:mobility-map`, targeted UI smoke. | Pack описан и повторяем.                        | Не делать 100% coverage gate.                                                 |
| P1       | Перенести BUGS_HISTORY incidents в regression checklist.                  | Уже пойманные data-loss bugs могут вернуться.                  | На каждый high-impact incident: тест или smoke item.                                                                                                | Checklist с references на incidents и commands. | Не превращать историю багов в большой process.                                |
| P2       | Зафиксировать known flaky/isolation tests.                                | Красные тесты теряют доверие.                                  | Документировать и исправлять только те, что мешают release signal.                                                                                  | Flaky список пуст или у каждого есть owner/fix. | Не внедрять test analytics platform.                                          |

### Pass 9. Performance & Maintainability

| Priority | Recommendation                                                                                 | Risk addressed                                           | Minimal sufficient fix                                                                                                           | Acceptance criteria                                                            | Overengineering guardrail                     |
| -------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| P1       | Закрыть Android DayTab freeze plan до широкого запуска, если DayTab является core client flow. | Клиент воспринимает продукт как зависающий и ненадежный. | Выполнить уже описанный refactor plan: убрать timer-to-transition patterns, сократить full recompute, проверить scroll/add-item. | Targeted Android smoke укладывается в documented budget, нет 188-375ms freeze. | Не переписывать React app и state management. |
| P1       | Проверить, что diagnostics/logging не ухудшает runtime.                                        | Debug code может тормозить основной flow.                | Оставить sampling/feature flag для тяжелых logs, проверить hot paths.                                                            | В core flows нет заметного overhead.                                           | Не внедрять APM.                              |
| P2       | Dependency cleanup делать точечно.                                                             | Бесконтрольные обновления могут сломать legacy UI.       | Обновлять только advisories и связанные lockfile paths, прогонять pre-release pack.                                              | Audit risk снижен без больших runtime изменений.                               | Не делать массовый major upgrade.             |

### Pass 10. Release Operations

| Priority | Recommendation                                               | Risk addressed                                                      | Minimal sufficient fix                                                                                  | Acceptance criteria                              | Overengineering guardrail                                                      |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| P0       | Не обходить hooks и release guardrails.                      | Можно запушить runtime change без whats-new, tests или legacy sync. | Использовать описанный `pnpm push:agent`/release path только по прямой команде пользователя.            | Release commit проходит hooks; no `HUSKY=0`.     | Не вводить сложный approval workflow.                                          |
| P1       | Для DB migrations иметь rollback/readiness notes.            | Миграция ломает client data или auth path.                          | В checklist: migration file, applied env, verification query, rollback note.                            | Перед релизом заполнены 4 поля.                  | Не строить migration platform.                                                 |
| P1       | Платежи держать за feature flag, если YuKassa flow не готов. | Клиент может оплатить и не иметь cancel/refund support.             | Если payments disabled, не блокировать core release; если enabled, закрыть cancel/refund/webhook smoke. | Payments mode явно указан в release checklist.   | Не блокировать весь продукт платежной дорожной картой, если платежи выключены. |
| P2       | Добавить one-page rollback для frontend/API.                 | При клиентском инциденте непонятно, как вернуться.                  | Ссылки на previous deployment, env flags, kill switch, contacts.                                        | On-call может выполнить rollback без археологии. | Не строить blue/green/CD platform.                                             |

## 6. Client Release Blockers

### P0 blockers

1. `pnpm test:regressions` is red on cookie-only PIN logout.
   - Minimal close: fix or rebaseline the `hasCookieSessionHint('pin')` contract
     and prove logout by targeted test/smoke.

2. Production tenant isolation strictness is not verified in this session.
   - Minimal close: confirm `HEYS_WRITE_CONTEXT_STRICT=1`,
     `HEYS_REST_READ_STRICT=1`, then run two-client IDOR smoke.

3. Legal/user-only real-client prerequisites remain open.
   - Minimal close: file required RKN notifications and approve internal
     personal-data policy.

4. Production-like data-loss smoke is still required before the first real
   client.
   - Minimal close: PIN + curator sync smoke with
     add/edit/delete/reload/offline-ish recovery and pending queue `0`.

### Not P0 for core release

- Payments cancel/refund/webhook work is P0 only if payments are enabled for the
  release.
- Full generic training kernel extraction is not a blocker.
- 100% test coverage is not a blocker.
- Enterprise observability, SIEM, DLP, multi-region scaling, Kubernetes, or a
  new auth platform are not release prerequisites for current scope.

## 7. Pre-Release Checklist

Use this as the short gate before real clients.

| Gate                   | Required result                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch/worktree        | Clean or intentionally scoped; no unrelated generated artifacts.                                                                                        |
| Environment            | Target env named; demo/prod mode explicit.                                                                                                              |
| Auth strict flags      | `HEYS_WRITE_CONTEXT_STRICT=1`, `HEYS_REST_READ_STRICT=1` verified in target env.                                                                        |
| Legal                  | RKN notifications and internal PDn policy status recorded.                                                                                              |
| Commands               | `validate:ci`, storage lints, `test:web:sync-critical`, `test:regressions`, `verify:legacy-bundles`, `check:mobility-map` green or exceptions recorded. |
| Security audit         | `pnpm audit` high/moderate triaged or fixed.                                                                                                            |
| PIN smoke              | Login, read, write, sync, logout, reload.                                                                                                               |
| Curator smoke          | Login, client switch, product/meal write, moderation/shared tabs if enabled.                                                                            |
| Cross-client isolation | Client A cannot read/write Client B data.                                                                                                               |
| Data-loss smoke        | Local edit vs cloud snapshot, concurrent tab, reload, pending queue `0`.                                                                                |
| Mobile smoke           | Android key flow: scroll, add item, reload, sync.                                                                                                       |
| Training modules       | Enabled modules pass map/check/tests; no MVP gaps.                                                                                                      |
| Payments               | Explicitly disabled or cancel/refund/webhook smoke passed.                                                                                              |
| Release docs           | Whats-new/release notes path understood; no hook bypass.                                                                                                |
| Rollback               | Previous deploy or kill-switch path written down.                                                                                                       |

## 8. Testing & Verification Plan

### Required pre-release pack

```bash
pnpm validate:ci
node scripts/lint-direct-localstorage-writes.mjs
node scripts/lint-unscoped-client-writes.mjs
node scripts/lint-raw-session-clear.mjs
pnpm test:web:sync-critical
pnpm test:regressions
pnpm verify:legacy-bundles
pnpm --dir apps/web run check:mobility-map
```

Do not use `pnpm test` as a default release audit command in this repository:
`turbo.json` makes `test` depend on `build`, and build/bundle commands mutate
generated artifacts or are explicitly restricted in agent work.

### Targeted checks after current red items

```bash
pnpm vitest run TESTS/regressions/task-005-write-context-resilience.test.ts -t "cookie-only PIN logout" --no-coverage
pnpm vitest run apps/web/__tests__/kernel-training-focus-ui.test.js --no-coverage
pnpm vitest run apps/web/__tests__/kernel-*.test.js apps/web/__tests__/fingers-*.test.js apps/web/__tests__/mobility-*.test.js apps/web/__tests__/training-step-drums-tab.test.js --no-coverage
```

### Manual/browser smoke

- PIN cookie-only logout.
- Curator role switch and client switching.
- Cross-client isolation read/write.
- Offline/reconnect product or meal edit.
- Corrupted non-auth localStorage key recovery.
- Android DayTab scroll/add item/reload.
- Enabled training module onboarding, safety gate, runner, record save.

## 9. Documentation Gaps

| Priority | Gap                                                                                                                        | Minimal sufficient update                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| P1       | `ARCHITECTURE.md` says `storage_audit_enforce` default is false, source default is true.                                   | Update architecture doc to match `heys_feature_flags_v1.js`.                         |
| P1       | Release checklist exists but does not yet combine legal, strict flags, smoke checks, and red command results in one place. | Add a one-page release gate or link this methodology from `docs/RELEASE_PROCESS.md`. |
| P1       | BUGS_HISTORY is rich but not directly mapped to pre-release regression checks.                                             | Add a table: incident -> test/smoke -> command.                                      |
| P1       | Support diagnostics are spread across docs.                                                                                | Add a short support issue template.                                                  |
| P2       | Payments readiness is mixed with core roadmap.                                                                             | Mark payments as feature-flagged/non-blocking unless enabled.                        |

## 10. Roadmap To Release

### Step 1. Close P0 release blockers

- Fix/rebaseline cookie-only PIN logout regression.
- Verify strict flags and IDOR behavior in target env.
- Complete legal/user-only PDn tasks.
- Run data-loss smoke with PIN + curator roles.

### Step 2. Make release signal green

- Re-run pre-release pack.
- Dependency audit already green as of 2026-06-17; re-run `pnpm deps:check`
  before release.
- Fix broad training test isolation or record narrow accepted scope.

### Step 3. Controlled client release

- Release to a small real-client group.
- Keep support checklist ready.
- Monitor sync/auth/manual reports for first client cycle.
- Do not enable payments unless cancel/refund/webhook smoke is complete.

### Step 4. Post-release hardening

- Android DayTab performance work if clients use that flow heavily.
- Convert high-impact BUGS_HISTORY incidents to regression checks.
- Tighten documentation drift and support/runbook gaps.

## 11. Facts Table

| Claim                                                                                                                                  | Source                                                                                                                      | Lines                                                                                 | Verification                                                                                    | Confidence |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| Products canonical store is `HEYS.OverlayStore` merged view, not legacy `heys_products`.                                               | `apps/web/ARCHITECTURE.md`                                                                                                  | 22-47                                                                                 | Read with `nl -ba apps/web/ARCHITECTURE.md`.                                                    | High       |
| Sync/storage architecture uses a single cloud snapshot entrypoint and local mutations auto-sync through intercepted writes.            | `apps/web/ARCHITECTURE.md`                                                                                                  | 49-83                                                                                 | Read with `nl -ba apps/web/ARCHITECTURE.md`.                                                    | High       |
| Auth/session storage keys are protected by a never-touch allowlist.                                                                    | `apps/web/ARCHITECTURE.md`                                                                                                  | 194-202                                                                               | Read with `nl -ba apps/web/ARCHITECTURE.md`.                                                    | High       |
| `storage_audit_enforce` source default is currently `true`.                                                                            | `apps/web/heys_feature_flags_v1.js`                                                                                         | 35-64                                                                                 | Read with `nl -ba apps/web/heys_feature_flags_v1.js`; contradicts architecture text at 144-147. | High       |
| Storage registry enforcement reads the `storage_audit_enforce` feature flag.                                                           | `apps/web/heys_storage_registry_v1.js`                                                                                      | 511-517                                                                               | Read with `nl -ba apps/web/heys_storage_registry_v1.js`.                                        | High       |
| Cloud upload has explicit error handling for auth errors, 413 backoff, retry scheduling and success logs.                              | `apps/web/heys_storage_supabase_v1.js`                                                                                      | 10680-10735                                                                           | Read with `nl -ba apps/web/heys_storage_supabase_v1.js`.                                        | High       |
| `cloud.saveKey` skips logout suppression, local-only keys and sensitive session keys, and routes client-scoped keys to client storage. | `apps/web/heys_storage_supabase_v1.js`                                                                                      | 12200-12245                                                                           | Read with `nl -ba apps/web/heys_storage_supabase_v1.js`.                                        | High       |
| Write context validation can fail closed when `HEYS_WRITE_CONTEXT_STRICT=1`; without strict it can warn and allow.                     | `yandex-cloud-functions/heys-api-rest/index.js`                                                                             | 163-233                                                                               | Read with `nl -ba yandex-cloud-functions/heys-api-rest/index.js`.                               | High       |
| REST API has origin allowlist, body size limit and security headers.                                                                   | `yandex-cloud-functions/heys-api-rest/index.js`                                                                             | 288-301, 411-425, 439-479                                                             | Read with `nl -ba yandex-cloud-functions/heys-api-rest/index.js`.                               | High       |
| REST writable table allowlist excludes direct writes to `clients`, `kv_store` and `consents`.                                          | `yandex-cloud-functions/heys-api-rest/index.js`                                                                             | 306-317, 532-548                                                                      | Read with `nl -ba yandex-cloud-functions/heys-api-rest/index.js`.                               | High       |
| REST client sends curator JWT when present, else session token, and always uses `credentials:'include'`.                               | `apps/web/heys_yandex_api_v1.js`                                                                                            | 460-516                                                                               | Read with `nl -ba apps/web/heys_yandex_api_v1.js`.                                              | High       |
| Cookie-only PIN REST reads are covered by tests that expect credentials include and no `X-Session-Token`.                              | `apps/web/__tests__/yandex-api-session-guards.test.js`                                                                      | 245-268                                                                               | Read with `nl -ba apps/web/__tests__/yandex-api-session-guards.test.js`.                        | High       |
| Current auth/yandex logout source uses `hasCookieSessionHint('pin')`, while regression task-005 expects an older hostname-based regex. | `apps/web/heys_auth_v1.js`, `apps/web/heys_yandex_api_v1.js`, `TESTS/regressions/task-005-write-context-resilience.test.ts` | `heys_auth_v1.js` 554-562; `heys_yandex_api_v1.js` 2671-2685; regression test 368-375 | `pnpm test:regressions` and targeted vitest failed on regex expectations.                       | High       |
| Pending mutation registry and capped cloud-blocking exist for day operations.                                                          | `apps/web/heys_day_global_exports_v1.js`                                                                                    | 7-13, 16-30, 51-60, 63-92                                                             | Read with `nl -ba apps/web/heys_day_global_exports_v1.js`.                                      | High       |
| Day hooks flush before disabled guard and use forced ref-based day selection to avoid stale closures.                                  | `apps/web/heys_day_hooks.js`                                                                                                | 321-397                                                                               | Read with `nl -ba apps/web/heys_day_hooks.js`.                                                  | High       |
| Day effects include a periodic reconciler with raw localStorage fast path and visibility checks.                                       | `apps/web/heys_day_effects.js`                                                                                              | 1008-1045                                                                             | Read with `nl -ba apps/web/heys_day_effects.js`.                                                | High       |
| Security review marks strict write context and REST read strictness as pre-launch/tenant isolation gates.                              | `docs/SECURITY_REVIEW.md`                                                                                                   | 83-100, 116-126, 186-204                                                              | Read with `nl -ba docs/SECURITY_REVIEW.md`.                                                     | High       |
| User-level launch tasks include RKN notifications and internal PDn policy.                                                             | `todo.md`                                                                                                                   | 245-268                                                                               | Read with `nl -ba todo.md`.                                                                     | High       |
| Current release process relies on hooks and warns not to bypass with `HUSKY=0`.                                                        | `docs/RELEASE_PROCESS.md`, `.husky/pre-push`                                                                                | `docs/RELEASE_PROCESS.md` 1-16, 73-75, 111-119; `.husky/pre-push` 4-12, 74-123        | Read with `nl -ba`.                                                                             | High       |
| Web package lifecycle scripts can run bundle generation before build/dev.                                                              | `apps/web/package.json`                                                                                                     | 8-18                                                                                  | Read with `nl -ba apps/web/package.json`.                                                       | High       |
| Root test task depends on build in turbo, so full `pnpm test` is not safe under the no-build constraint.                               | `turbo.json`                                                                                                                | `test` task                                                                           | Read `turbo.json`; checked `package.json` scripts.                                              | High       |
| Training mode regulation requires full artifacts rather than MVP release.                                                              | `apps/web/_kernel/TRAINING_MODE_REGULATION.md`                                                                              | 10-21, 56-90, 116-135                                                                 | Read with `nl -ba apps/web/_kernel/TRAINING_MODE_REGULATION.md`.                                | High       |
| Kernel extraction is intended as source-level contract reuse, with no generated bundle changes unless explicit.                        | `apps/web/_kernel/KERNEL_EXTRACTION_PLAN.md`                                                                                | 10-18, 21-57, 70-83                                                                   | Read with `nl -ba apps/web/_kernel/KERNEL_EXTRACTION_PLAN.md`.                                  | High       |
| Mobility map currently reports complete coverage.                                                                                      | `pnpm --dir apps/web run check:mobility-map`                                                                                | Command output                                                                        | Command exit 0: methodology units 69, map rows 73, source/test artifacts 33/33.                 | High       |
| Android DayTab freezes and right-sized performance plan are already documented.                                                        | `docs/PERF_ANDROID_2026-06.md`, `docs/REFACTOR_REACT_MEMO_DAY_TAB.md`                                                       | `PERF` 31-43, 58-115; `REFACTOR` 7-34, 63-98                                          | Read with `nl -ba`.                                                                             | High       |
| Legacy bundles are currently in sync.                                                                                                  | `pnpm verify:legacy-bundles`                                                                                                | Command output                                                                        | Command exit 0: manifest, public assets and `index.html` in sync.                               | High       |
| Critical sync tests currently pass.                                                                                                    | `pnpm test:web:sync-critical`                                                                                               | Command output                                                                        | Command exit 0: 6 files, 79 tests passed.                                                       | High       |
| Dependency audit is currently green after targeted refresh.                                                                            | `pnpm deps:check`, `pnpm audit --prod`                                                                                      | Command output                                                                        | Both commands exit 0; no known vulnerabilities found.                                           | High       |

## 12. Appendix: commands and short result

| Command                                                                                                                                                                                           | Result                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short`                                                                                                                                                                              | Clean before document edit.                                                                                                                       |
| `pnpm validate:ci`                                                                                                                                                                                | Exit 0; CI YAML validated.                                                                                                                        |
| `node scripts/lint-direct-localstorage-writes.mjs`                                                                                                                                                | Exit 0; 198 warnings, 0 violations.                                                                                                               |
| `node scripts/lint-unscoped-client-writes.mjs`                                                                                                                                                    | Exit 0; 3 allowlisted unscoped writes, 0 violations.                                                                                              |
| `node scripts/lint-raw-session-clear.mjs`                                                                                                                                                         | Exit 0; 4 warnings, 0 violations.                                                                                                                 |
| `pnpm test:web:sync-critical`                                                                                                                                                                     | Exit 0; 6 files, 79 tests passed.                                                                                                                 |
| `pnpm vitest run apps/web/__tests__/kernel-*.test.js apps/web/__tests__/fingers-*.test.js apps/web/__tests__/mobility-*.test.js apps/web/__tests__/training-step-drums-tab.test.js --no-coverage` | Exit 1; 923/924 tests passed; one broad-glob isolation failure in `kernel-training-focus-ui.test.js` due duplicate `Сегодня` tab in retained DOM. |
| `pnpm vitest run apps/web/__tests__/kernel-training-focus-ui.test.js --no-coverage`                                                                                                               | Exit 0; isolated file passed, 3 tests.                                                                                                            |
| `pnpm --dir apps/web run check:mobility-map`                                                                                                                                                      | Exit 0; coverage complete, required source/test artifacts 33/33.                                                                                  |
| `pnpm test:regressions`                                                                                                                                                                           | Exit 1; 82 tests passed, 2 failed in task-005 cookie-only PIN logout regex expectations.                                                          |
| `pnpm vitest run TESTS/regressions/task-005-write-context-resilience.test.ts -t "cookie-only PIN logout" --no-coverage`                                                                           | Exit 1; targeted failure confirms regression mismatch.                                                                                            |
| `pnpm verify:legacy-bundles`                                                                                                                                                                      | Exit 0; manifest, public assets and `index.html` in sync.                                                                                         |
| `pnpm deps:check`                                                                                                                                                                                 | Exit 0; no known vulnerabilities found after targeted dependency refresh.                                                                         |
| `pnpm audit --prod`                                                                                                                                                                               | Exit 0; no known vulnerabilities found.                                                                                                           |
