# HEYS Technical Risk Program 2026

Статус: **active**  
Начато: **2026-07-17**  
Ветка: **main**  
Цель: закрыть десять подтверждённых технических рисков четырьмя отдельными
волнами без общего рефакторинга и без смешивания несвязанных изменений.

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
| R01 | Curator JWT доступен через `localStorage`                |     2 | pending   | Production использует HttpOnly cookie; JS storage и Bearer fallback удалены |
| R02 | Cloud deploy не имеет pre-deploy test gate               |     2 | pending   | Deploy job зависит от успешных тестов изменённой функции                    |
| R03 | Cloud Functions работают на неподдерживаемом Node.js 18  |     2 | pending   | Functions, CI и engines используют поддерживаемый совместимый runtime       |
| R04 | SQL-миграции распределены без единого ledger             |     3 | pending   | Один apply-flow, порядок и checksum воспроизводимы                          |
| R05 | PWA/RuStore/mobile critical path не входит в CI          |     1 | completed | Check-in и mobile session/navigation contracts входят в короткий CI gate    |
| R06 | Storage/sync остаётся большим глобальным модулем         |     4 | pending   | Выделены проверенные контракты без смены legacy public API                  |
| R07 | Критические KV payload не валидируются по версии и форме |     3 | pending   | Critical keys имеют versioned validation и совместимое чтение               |
| R08 | Критические тесты зависят от текста source               |     1 | completed | Выбранные critical paths проверяют поведение исполняемого кода              |
| R09 | На старте загружаются пять тяжёлых boot bundles          |     4 | pending   | Есть baseline, budget и подтверждённое уменьшение initial gzip payload      |
| R10 | Retention для audit-данных не полностью исполняется      |     3 | pending   | Dry-run считает кандидатов; удаление остаётся выключенным до sign-off       |

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

Выходной gate: curator JWT отсутствует в JS storage, красные contract tests
останавливают deploy, все функции проходят smoke на поддерживаемом runtime.

### Волна 3. Данные и хранение

Scope: R04, R07 и R10.

Порядок: inventory SQL → canonical migration manifest/ledger без повторного
применения history → versioned validators критических KV keys → retention
report/dry-run. Реальное retention deletion не включается без legal sign-off.

Выходной gate: migration state воспроизводим, несовместимые critical writes
отклоняются, dry-run показывает объём и возраст retention candidates.

### Волна 4. Архитектура и производительность

Scope: R06 и R09.

Порядок: dependency/bundle baseline → один контракт за проход → поведенческий
test → перенос только подтверждённых non-critical boot readers → повторное
измерение cold/reload/offline/SW paths.

Выходной gate: выделенные модули сохраняют legacy public API, initial gzip
payload уменьшается относительно записанного baseline, runtime smoke зелёный.

## Facts Table

| Claim                                                              | Source                 | Verify command                                                                                                                                                                                                                                                                                                                                                            | Result на 2026-07-17                                                                                                                                           |
| ------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Curator JWT читается из JS storage, а CSP допускает inline/eval    | source                 | `rg -n "heys_curator_session\|Authorization.*Bearer" apps/web/heys_yandex_api_v1.js`; `sed -n '16,24p' apps/web/index.html`                                                                                                                                                                                                                                               | ✅ Есть `localStorage` readers/Bearer headers; CSP содержит `unsafe-inline` и `unsafe-eval`                                                                    |
| Auto-deploy выполняет deploy до test command                       | workflow               | `sed -n '145,205p' .github/workflows/cloud-functions-deploy.yml`; `rg -n "vitest\|node --test\|pnpm test\|npm test" .github/workflows/cloud-functions-deploy.yml`                                                                                                                                                                                                         | ✅ Deploy и post-deploy verify есть; pre-deploy test command отсутствует                                                                                       |
| Deploy script задаёт Node.js 18 для всех описанных функций         | script + official docs | `rg -c 'echo "nodejs18' yandex-cloud-functions/deploy-all.sh`                                                                                                                                                                                                                                                                                                             | ✅ 19 записей; Yandex помечает `nodejs18` unsupported и `nodejs22` supported                                                                                   |
| Migration SQL распределён, ledger не найден                        | filesystem/search      | `for d in database/migrations migrations scripts/db/migrations supabase/migrations yandex-cloud-functions/migrations database/yandex_migration; do find "$d" -maxdepth 1 -name '*.sql' \| wc -l; done`; `rg "schema_migrations\|migration_history\|applied_migrations" database migrations scripts/db supabase yandex-cloud-functions`                                    | ✅ 1+2+21+1+9+1 migration files и 199 root `database/*.sql`; ledger match отсутствует                                                                          |
| До волны 1 mobile tests и Playwright CI job отсутствовали          | Git baseline           | `git ls-tree -r --name-only origin/main apps/mobile \| rg '\.(test\|spec)\.'`; `git grep -n -e playwright -e test:e2e origin/main -- .github/workflows`                                                                                                                                                                                                                   | ✅ Baseline match отсутствует; волна 1 добавила 3 test files и path-scoped CI job                                                                              |
| Storage/RPC имеют крупный legacy scope                             | source count           | `wc -l apps/web/heys_storage_supabase_v1.js yandex-cloud-functions/heys-api-rpc/index.js`                                                                                                                                                                                                                                                                                 | ✅ 16,612 и 4,596 строк                                                                                                                                        |
| KV table хранит произвольный JSONB, registry не проверяет shape    | schema/source          | `sed -n '60,74p' database/yandex_migration/001_schema.sql`; `sed -n '154,182p' apps/web/heys_storage_registry_v1.js`                                                                                                                                                                                                                                                      | ✅ `v JSONB`; `analyze()` проверяет policy/size, но не payload schema                                                                                          |
| Большинство web test-файлов читают source                          | test search            | `find apps/web/__tests__ -maxdepth 1 -name '*.test.*'`; `rg -l readFileSync apps/web/__tests__ -g '*.test.*'`                                                                                                                                                                                                                                                             | ✅ 201 web test files, 168 содержат `readFileSync`; critical behavior coverage добавлено без роста source-reading count, mobile получил 3 отдельных test files |
| Пять boot bundles грузятся при старте                              | manifest/assets/index  | `node -e "const fs=require('fs'),m=require('./apps/web/bundle-manifest.json'); let n=0,c=0; for(const [k,v] of Object.entries(m)){if(!/^boot-(core\|calc\|day\|app\|init)$/.test(k))continue; n+=fs.statSync('apps/web/public/'+v.file+'.gz').size;c+=v.fileCount} console.log(n,c)"`; `sed -n '946,965p' apps/web/index.html`; `sed -n '4118,4135p' apps/web/index.html` | ✅ 911,338 gzip bytes и 178 source files в текущем preview baseline                                                                                            |
| Retention policy draft, delete job для `data_loss_audit` не найден | docs/search            | `sed -n '1,34p' docs/legal/operator/heys-retention-policy-draft.md`; `rg "DELETE FROM data_loss_audit" yandex-cloud-functions scripts database`                                                                                                                                                                                                                           | ✅ Требуется legal sign-off; maintenance только читает `data_loss_audit`                                                                                       |

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
