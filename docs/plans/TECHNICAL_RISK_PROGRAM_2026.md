# HEYS Technical Risk Program 2026

- Статус: **active, wave 4**
- Начато: **2026-07-17**
- Ветка: **main** Цель: закрыть десять подтверждённых технических рисков
  четырьмя отдельными волнами без общего рефакторинга и без смешивания
  несвязанных изменений.

## Правила программы

- Одна волна означает один проверяемый scope и отдельный commit.
- Перед реализацией каждой волны факты и зависимости проверяются повторно.
- После крупного шага обновляются статус, проверки, commit и deployment state.
- Чужой dirty scope не добавляется в commits и не откатывается.
- Необратимые DB/retention-операции требуют отдельного подтверждения.
- После compaction работа восстанавливается из этого документа и фактического
  состояния Git/production.

## Текущий baseline

На старте `main` опережает `origin/main` на два локальных commits:

- `fce10e7d fix(checkin): resume morning flow across shells`
- `c9c1eff1 fix(checkin): harden progress conflict merge`

Они считаются входящим состоянием программы, пока повторная проверка не докажет
обратное. Рабочее дерево содержит несвязанные изменения в mobile UI,
документации и preview-generated web bundles. Программа их не захватывает.

## Карта рисков

| ID  | Риск                                                     | Волна | Статус    | Критерий закрытия                                                           |
| --- | -------------------------------------------------------- | ----: | --------- | --------------------------------------------------------------------------- |
| R01 | Curator JWT доступен через `localStorage`                |     2 | completed | Production использует HttpOnly cookie; JS storage и Bearer fallback удалены |
| R02 | Cloud deploy не имеет pre-deploy test gate               |     2 | completed | Deploy job зависит от успешных тестов изменённой функции                    |
| R03 | Cloud Functions работают на неподдерживаемом Node.js 18  |     2 | completed | Functions, CI и engines используют поддерживаемый совместимый runtime       |
| R04 | SQL-миграции распределены без единого ledger             |     3 | completed | Один apply-flow, порядок и checksum воспроизводимы                          |
| R05 | PWA/RuStore/mobile critical path не входит в CI          |     1 | completed | Check-in и mobile session/navigation contracts входят в короткий CI gate    |
| R06 | Storage/sync остаётся большим глобальным модулем         |     4 | in review | Выделены проверенные контракты без смены legacy public API                  |
| R07 | Критические KV payload не валидируются по версии и форме |     3 | completed | Critical keys имеют versioned validation и совместимое чтение               |
| R08 | Критические тесты зависят от текста source               |     1 | completed | Выбранные critical paths проверяют поведение исполняемого кода              |
| R09 | На старте загружаются пять тяжёлых boot bundles          |     4 | in review | Есть baseline, budget и подтверждённое уменьшение initial gzip payload      |
| R10 | Retention для audit-данных не полностью исполняется      |     3 | completed | Dry-run считает кандидатов; удаление остаётся выключенным до sign-off       |

## Последовательность волн

### Волна 1. Регрессионная защита

Scope: R05 и R08.

План:

- [x] Проверить существующий runtime harness инцидента PWA/RuStore.
- [x] Подтвердить девять шагов, обязательный `yesterdayVerify`, повторное
      открытие flow, `saved_local`, пустые supplements,
      `coldExposure.type=none`, skipped measurements и завершённый final.
- [x] Добавить check-in harness в короткий web critical CI suite.
- [x] Добавить чистые mobile tests для navigation policy, session expiry,
      SecureStore serialization и one-time WebView exchange URL.
- [x] Добавить mobile critical test command и path-scoped CI job.
- [x] Запустить оба коротких suite, validate CI YAML и mobile type-check.
- [x] Провести self-review и обновить этот документ.
- [x] Сделать отдельный commit волны 1
      (`test(ci): gate check-in and mobile critical paths`).

Выходной gate:

- регрессия check-in доказана поведенческим тестом;
- два shell-состояния продолжают один `flowId` и не повторяют сохранённые шаги;
- mobile navigation/session contracts выполняются без production WebView и
  production-аккаунтов;
- PR с изменением critical paths не может стать зелёным без этих тестов.

### Волна 2. Безопасность и выкладка

Scope: R01, R02 и R03.

Порядок: inventory всех curator-token readers → cookie-only transport →
совместимое CSP tightening → function-specific pre-deploy tests → Node.js 22
compatibility → selective deploy и health checks.

Проверено перед публикацией:

- [x] Production browser origin принудительно получает cookie-only
      login/register response; клиентский флаг не может запросить JWT обратно.
- [x] Native запрос без browser Origin сохраняет token-response для SecureStore
      и one-time WebView exchange; localhost держит dev token только в памяти
      вкладки.
- [x] Старые `heys_curator_session` / `heys_supabase_auth_token` удаляются при
      boot, новые записи в JS storage отсутствуют.
- [x] `unsafe-eval` удалён из production CSP; `unsafe-inline` остаётся до
      отдельного выноса inline boot-кода.
- [x] Cloud deploy имеет отдельный prerequisite job и повторный локальный gate;
      post-deploy HTTP checks, runtime audit и automation canaries сохранены.
- [x] Канонический runtime, `.nvmrc`, root engines и CI выровнены на Node.js 22.
- [x] Все 19 описанных function packages установились, загрузились и прошли
      доступные unit/contract tests на Node.js `v22.23.1`.
- [x] Commit/push, фактический deploy 17 активных HEYS functions и production
      runtime/smoke verification.

Выходной gate: curator JWT отсутствует в JS storage, красные contract tests
останавливают deploy, все функции проходят smoke на поддерживаемом runtime.

### Волна 3. Данные и хранение

Scope: R04, R07 и R10.

Порядок: inventory SQL → canonical migration manifest/ledger без повторного
применения history → versioned validators критических KV keys → retention
report/dry-run. Реальное retention deletion не включается без legal sign-off.

Проверено перед публикацией:

- [x] 317 SQL-файлов проинвентаризированы: 316 legacy baseline и одна новая
      managed migration; неизвестный SQL, checksum drift и разрыв порядка
      блокируют runner.
- [x] `--status` read-only показал отсутствующий ledger и одну pending
      migration; apply откладывается до фиксации неизменяемого checksum в
      commit.
- [x] Profile, day, planning и morning check-in имеют versioned contracts;
      production JSON-типы существующих profile/planning rows совместимы.
- [x] Merge, single/batch RPC и REST write paths валидируют payload под row
      lock; legacy без версии разрешён, неизвестная версия и destructive empty
      write отклоняются.
- [x] Retention report выполнен read-only: 0 кандидатов во всех четырёх policy
      classes; агрегаты не содержат идентификаторов.
- [x] Обнаруженные active deletes `security_events` (30 дней) и
      `client_log_trace` (14 дней) заменены dry-run по draft-окнам 1 год/30
      дней.
- [x] 17 pure/ledger/retention contract tests и function gates RPC/REST/
      maintenance прошли.
- [x] Source/release commits `ebc0e722`, `c0d60e5b`, `7a015554` опубликованы;
      ledger применён (`1 applied / 0 pending`).
- [x] Cloud deploy обновил все 17 функций; HTTP checks и runtime audit прошли.
      Первый strict canary попал в кратковременную недоступность maintenance,
      повторный production canary прошёл полностью; CI rerun запущен.

Выходной gate: migration state воспроизводим, несовместимые critical writes
отклоняются, dry-run показывает объём и возраст retention candidates.

### Волна 4. Архитектура и производительность

Scope: R06 и R09.

Порядок: dependency/bundle baseline → один контракт за проход → поведенческий
test → перенос только подтверждённых non-critical boot readers → повторное
измерение cold/reload/offline/SW paths.

Проверено перед публикацией:

- [x] Из `heys_storage_supabase_v1.js` выделен чистый versioned contract
      владения client-scoped/session ключами; legacy `HEYS.cloud` API не
      менялся.
- [x] Контракт загружается перед storage bridge и fail-closed проверяет порядок.
- [x] Два manual export-helper перенесены из `boot-core` в существующий lazy UI
      chunk; их consumers уже имели полные inline fallback paths.
- [x] Поведенческие contract/anti-pollution tests: 6/6; web sync-critical:
      185/185.
- [x] Minified `boot-core` gzip уменьшен с 274,622 до 273,096 байт; суммарный
      initial gzip пяти boot bundles — с 907,781 до 906,255 байт (-1,526).
- [x] Чистый local runtime smoke: новый boot hash исполнился, contract v1,
      `HEYS.cloud` и оба lazy export-helper доступны; page exceptions
      отсутствуют.
- [ ] Source-only push и deployed-state verification.

Выходной gate: выделенные модули сохраняют legacy public API, initial gzip
payload уменьшается относительно записанного baseline, runtime smoke зелёный.

## Facts Table

| Claim                                                           | Source                  | Verify command                                                                                                                                                                                                                                                                                                                                                            | Result на 2026-07-17                                                                                                                                           |
| --------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Curator JWT читается из JS storage, а CSP допускает inline/eval | source                  | `rg -n "heys_curator_session\|Authorization.*Bearer" apps/web/heys_yandex_api_v1.js`; `sed -n '16,24p' apps/web/index.html`                                                                                                                                                                                                                                               | ✅ Есть `localStorage` readers/Bearer headers; CSP содержит `unsafe-inline` и `unsafe-eval`                                                                    |
| Auto-deploy выполняет deploy до test command                    | workflow                | `sed -n '145,205p' .github/workflows/cloud-functions-deploy.yml`; `rg -n "vitest\|node --test\|pnpm test\|npm test" .github/workflows/cloud-functions-deploy.yml`                                                                                                                                                                                                         | ✅ Deploy и post-deploy verify есть; pre-deploy test command отсутствует                                                                                       |
| Deploy script задаёт Node.js 18 для всех описанных функций      | script + official docs  | `rg -c 'echo "nodejs18' yandex-cloud-functions/deploy-all.sh`                                                                                                                                                                                                                                                                                                             | ✅ 19 записей; Yandex помечает `nodejs18` unsupported и `nodejs22` supported                                                                                   |
| Migration SQL распределён, ledger не найден                     | filesystem/search       | `for d in database/migrations migrations scripts/db/migrations supabase/migrations yandex-cloud-functions/migrations database/yandex_migration; do find "$d" -maxdepth 1 -name '*.sql' \| wc -l; done`; `rg "schema_migrations\|migration_history\|applied_migrations" database migrations scripts/db supabase yandex-cloud-functions`                                    | ✅ 1+2+21+1+9+1 migration files и 199 root `database/*.sql`; ledger match отсутствует                                                                          |
| До волны 1 mobile tests и Playwright CI job отсутствовали       | Git baseline            | `git ls-tree -r --name-only origin/main apps/mobile \| rg '\.(test\|spec)\.'`; `git grep -n -e playwright -e test:e2e origin/main -- .github/workflows`                                                                                                                                                                                                                   | ✅ Baseline match отсутствует; волна 1 добавила 3 test files и path-scoped CI job                                                                              |
| Storage/RPC имеют крупный legacy scope                          | source count            | `wc -l apps/web/heys_storage_supabase_v1.js yandex-cloud-functions/heys-api-rpc/index.js`                                                                                                                                                                                                                                                                                 | ✅ 16,612 и 4,596 строк                                                                                                                                        |
| KV table хранит произвольный JSONB, registry не проверяет shape | schema/source           | `sed -n '60,74p' database/yandex_migration/001_schema.sql`; `sed -n '154,182p' apps/web/heys_storage_registry_v1.js`                                                                                                                                                                                                                                                      | ✅ `v JSONB`; `analyze()` проверяет policy/size, но не payload schema                                                                                          |
| Большинство web test-файлов читают source                       | test search             | `find apps/web/__tests__ -maxdepth 1 -name '*.test.*'`; `rg -l readFileSync apps/web/__tests__ -g '*.test.*'`                                                                                                                                                                                                                                                             | ✅ 201 web test files, 168 содержат `readFileSync`; critical behavior coverage добавлено без роста source-reading count, mobile получил 3 отдельных test files |
| Пять boot bundles грузятся при старте                           | manifest/assets/index   | `node -e "const fs=require('fs'),m=require('./apps/web/bundle-manifest.json'); let n=0,c=0; for(const [k,v] of Object.entries(m)){if(!/^boot-(core\|calc\|day\|app\|init)$/.test(k))continue; n+=fs.statSync('apps/web/public/'+v.file+'.gz').size;c+=v.fileCount} console.log(n,c)"`; `sed -n '946,965p' apps/web/index.html`; `sed -n '4118,4135p' apps/web/index.html` | ✅ До Wave 4: 907,781 gzip bytes и 178 source files                                                                                                            |
| Retention delete-поведение расходилось с draft                  | docs/source/live report | `sed -n '1,34p' docs/legal/operator/heys-retention-policy-draft.md`; `sed -n '352,385p' yandex-cloud-functions/heys-maintenance/index.js`; `node scripts/db/retention-report.mjs`                                                                                                                                                                                         | ✅ До Wave 3 maintenance удалял security events через 30 дней и trace через 14 дней; production dry-run: 0 кандидатов по draft-окнам                           |
| Storage key ownership вынесен в исполняемый контракт            | source/test/config      | `rg -n "storageKeyContract" apps/web/heys_storage_key_contract_v1.js apps/web/heys_storage_supabase_v1.js`; `pnpm vitest run tests/regressions/storage-key-contract.test.ts tests/regressions/7fb8be2f-anti-pollution-scoping.test.ts`                                                                                                                                    | ✅ Pure contract зарегистрирован до bridge; 6/6 поведенческих и anti-pollution tests прошли                                                                    |
| Wave 4 уменьшает initial gzip без смены UI                      | generated measurement   | `git cat-file -s 7a015554:apps/web/public/boot-core.bundle.46e3e786e590.js.gz`; `stat -f '%z' apps/web/public/boot-core.bundle.3497ec9c0fba.js.gz`; остальные четыре boot bundles не менялись                                                                                                                                                                             | ✅ `boot-core`: 274,622 → 273,096; initial total: 907,781 → 906,255 байт (-1,526)                                                                              |

Official runtime evidence:

- <https://yandex.cloud/en/docs/functions/concepts/runtime/>
- <https://nodejs.org/en/about/previous-releases>

## Журнал выполнения

### 2026-07-17 — запуск программы

- Цель, project instructions и архитектурные документы прочитаны.
- Dirty scope и два локальных check-in commits зафиксированы.
- Все десять исходных предпосылок перепроверены.
- `morning-checkin-flow-resume` и `sync-merge-shared`: 92/92 tests passed.
- Волна 1: mobile critical 10/10, web sync-critical 183/183, mobile type-check и
  CI YAML validation прошли.
- Публикация и deploy ещё не выполнялись.

### 2026-07-17 — волна 1 завершена

- Source/CI commit:
  `f4916ae9 test(ci): gate check-in and mobile critical paths`.
- Release commits: `d6aa614d`, `d2af97a1`.
- `main` опубликован до `d2af97a1`.
- Pre-push gate: 206 test files passed, 2,804 tests passed, 33 skipped.
- GitHub Actions run `29610231173`: build, unit gate, PWA/landing deploy и
  deployed-state verification прошли.
- R05 и R08 закрыты; начат inventory cookie-only auth для волны 2.

### 2026-07-17 — волна 2 готова к публикации

- Cookie-only web auth проверен 227 web tests и 10 auth function contract tests.
- Полный function gate: 19/19 packages passed на Node.js `v22.23.1`.
- Deploy dry-run для `heys-api-auth` показал `runtime=nodejs22` и обязательный
  pre-deploy gate до создания версии.
- Production CSP больше не содержит `unsafe-eval`; runtime source не содержит
  `eval()` / `new Function()`.
- Scoped legacy QA собрал 7 затронутых bundles; `localhost:3001` отдаёт новые
  hashes и CSP без `unsafe-eval`.
- До публикации production всё ещё содержит 17 HEYS functions на `nodejs18`;
  статус R01–R03 станет `completed` только после push/deploy/smoke.

### 2026-07-17 — волна 2 завершена

- Source/release commits: `239db724`, `f7673e48`, `06f83c4e`, `1f52ca7a`,
  `f314ee0a`, `bd182d6c`, `1ff2de7d`, `44328d6e`.
- Первый deploy выявил отсутствие VAPID public/subject в GitHub Secrets;
  fallback безопасно восстанавливает только публичные значения из текущей
  `$latest`, private key остаётся в Lockbox.
- GitHub Actions `29615414530`: Node.js 22 pre-deploy gate, deploy и verify
  зелёные.
- Все 17 существующих HEYS functions имеют `$latest` runtime `nodejs22`, status
  `ACTIVE`; payments target корректно пропущен, потому что функция/секреты не
  настроены.
- `pnpm ops:heys:canary`: bot warmup, два polling worker и maintenance DB canary
  прошли. R01, R02 и R03 закрыты.

### 2026-07-17 — волна 3 готова к фиксации

- Canonical migration manifest учитывает 317 SQL-файлов и не переигрывает
  историю; ledger migration остаётся pending до commit checksum.
- Critical KV contract tests: 8/8; migration/retention tests: 9/9; RPC gate:
  37/37 плюс load check, REST и maintenance load gates прошли.
- Production type inventory: все найденные planning rows — JSON arrays, profile
  rows — JSON objects; несовместимых типов в выбранном critical scope нет.
- Read-only retention report: trace 71,005 rows / 49.3 MB, security 336,
  data-loss audit 28,709, access audit 49,343, messages 90; policy candidates 0.

### 2026-07-18 — волна 3 развернута

- Source/release commits: `ebc0e722`, `c0d60e5b`, `7a015554`; `origin/main`
  опубликован до `7a015554`.
- Migration ledger применён в production: `1 applied / 0 pending`.
- GitHub Actions `29617214105`: pre-deploy test, deploy всех функций, пять HTTP
  checks и runtime audit 17/17 прошли. Первый maintenance canary был transient;
  непосредственный повтор `pnpm ops:heys:canary` прошёл 4/4. Rerun обнаружил,
  что `set -e` преждевременно завершал verify на первом curl timeout; retry loop
  исправлен и ожидает публикации.
- R04, R07 и R10 закрыты; destructive retention по-прежнему не включён.

### 2026-07-18 — волна 4 готова к публикации

- Выделен `HEYS.storageKeyContract` без изменения публичного `HEYS.cloud`.
- Manual export helpers перенесены в существующий postboot lazy chunk с
  сохранением встроенных fallback paths.
- Sync-critical: 185/185; contract/anti-pollution: 6/6.
- `boot-core` gzip уменьшен на 1,526 байт; total initial gzip — до 906,255 байт.
- Изолированный runtime smoke: contract v1, `HEYS.cloud` и lazy export helpers
  зарегистрированы, исключений исполнения нет.
