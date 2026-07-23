# Инфраструктура и эксплуатация

> **Статус:** repository contracts и YC functions/triggers проверены 2026-07-18
> **Охват:** frontend delivery, Cloud Functions deploy, gateway, secrets,
> database access, monitoring и release evidence **Не подтверждено:**
> DNS/VM/CDN, сертификаты, GitHub secrets, последние workflow runs и публикация
> изменений этой итерации

## Карта production-доставки

```text
push main
  ├─ deploy-yandex.yml
  │    → test/build gates
  │    → PWA dist → heys-app S3 → app.heyslab.ru proxy
  │    → demo mirror → try-heyslab-ru
  │    → landing export → heys-static S3 → heyslab.ru CDN
  │    → build-meta verification
  └─ cloud-functions-deploy.yml (только подходящие backend paths)
       → deploy-all.sh
       → Cloud Function versions
       → optional API Gateway update
       → health/canary/deploy receipt

Managed PostgreSQL ← Cloud Functions / controlled psql wrapper
Lockbox             → runtime secrets overlay
Object Storage      → frontend, photos, backups
```

## Источники истины

| Вопрос                                             | Канонический repository source                                   |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| Какие frontend artifacts публикуются               | `.github/workflows/deploy-yandex.yml`                            |
| Какие функции существуют и участвуют в auto-deploy | `yandex-cloud-functions/function-inventory.cjs`                  |
| Как функция публикуется                            | `.github/workflows/cloud-functions-deploy.yml` → `deploy-all.sh` |
| Как URL связан с функцией                          | `yandex-cloud-functions/api-gateway-spec.yaml`                   |
| Какие automations должны быть живы                 | `check-heys-ops-status.cjs` + `BACKGROUND_JOBS.md`               |
| Как подаются runtime secrets                       | `deploy-all.sh` + `shared/secrets.js` copies                     |
| Как выполнять production SQL                       | `scripts/db/psql.sh` и versioned migrations                      |
| Детали VM/CDN/S3 и восстановление                  | `infra/README.md`, operational runbooks                          |
| Что реально развернуто сейчас                      | только YC/GitHub/DNS/HTTP runtime evidence                       |

README с IP, версиями, количеством функций или датой сертификата — snapshot, а
не вечный источник истины. Его нужно проверять перед операцией.

## Frontend release

Основной workflow сериализует deployments на `main`. Он сравнивает HEAD не
только с предыдущим commit, а с hash из production `build-meta.json`. Если
baseline отсутствует или не найден в истории, выбирается полный build. Только
release metadata может идти по fast path без пересборки приложения.

Full path запускает web tests, собирает deploy artifact, загружает PWA в
`heys-app`, зеркалирует demo и выгружает статический landing в `heys-static`.
Критичные entry files и hashed assets получают разные cache policies;
`build-meta.json` загружается последним как маркер целостного релиза. Финальная
проверка сопоставляет deployed hash с ожидаемым commit/ancestor contract.

Подробные VM/CDN правила остаются в `infra/README.md`, но указанный там срок SSL
уже прошёл относительно даты этого аудита. Это не доказывает истечение текущего
сертификата — только то, что документ нельзя использовать вместо live check.

## Backend deployment

`function-inventory.cjs` — единый явный каталог 19 source-функций: 10 API и 9
automations. Восемнадцать участвуют в auto-deploy; удалённая из production
`heys-api-sms` оставлена как явно отключённая и не может попасть в
автоматическую публикацию. Проверка сравнивает каталог с каждой директорией
`heys-*`, имеющей `package.json`, поэтому новая или удалённая функция ломает CI
до deploy.

`deploy-all.sh` — общий deploy entrypoint. Он читает из каталога группы
`api`/`automations`/`all`, поддерживает одну функцию, валидирует `.env`,
создаёт/обновляет versions и умеет обновлять gateway. `test-functions.sh` читает
тот же полный список, отдельного ручного inventory больше нет.

Deploy script передаёт идентификаторы Lockbox и placeholders/hashes, а guard
отказывается публиковать raw token/password/private key в function environment.
После прохода он выполняет health/canary согласно выбранному режиму и пишет
deploy receipt best effort. Наличие новой function version не гарантирует, что
gateway уже указывает на нужную функцию: gateway spec обновляется отдельным
шагом/условием.

GitHub workflow следит за `yandex-cloud-functions/heys-*/**`, shared/runtime
tooling и gateway spec. Оба шага — predeploy tests и фактический deploy — отдают
список изменённых файлов одному classifier. Конкретный каталог выбирает одну
функцию, общий файл выбирает все 18 auto-deploy targets, неизвестная или явно
отключённая функция завершает workflow ошибкой. Gateway-only изменение не
превращается в полный deploy.

Перед публикацией backend workflow fail-closed проверяет ledger production
миграций: при любой pending managed migration deploy не начинается. После
публикации messenger-функции и обновления Gateway workflow отдельно проверяет
desired-state маршруты `set-acked` и `set-done`: unauthenticated POST обязан
доходить до функции и вернуть `401`, а CORS preflight — `204`; `404` считается
ошибкой маршрутизации.

CI deploy публикует function versions, но не вызывает trigger ensure; изменение
timer topology остаётся отдельной явно разрешаемой операцией. Локальный не-CI
release-flow сохраняет существующий explicit ensure для SpeechKit.

## Secrets и database operations

Runtime code загружает DB/App/S3 secrets из Lockbox через общую модель overlay.
Локальный `.env`/GitHub secrets нужны deploy tooling, но raw production secrets
не должны становиться постоянными function env values.

Production SQL выполняется через `scripts/db/psql.sh`: wrapper получает пароль
из Lockbox при отсутствии `PGPASSWORD` и включает TLS verification. Изменения
схемы должны оставаться versioned migrations; ручной SQL допустим как
операционная команда, но не заменяет сохранённый migration contract.

## Наблюдаемость и доказательство релиза

Есть три разных доказательства, их нельзя подменять друг другом:

1. **Repository:** код, workflow и manifests описывают ожидаемое состояние.
2. **Deployment receipt/build-meta:** фиксируют, какой commit пытались
   доставить.
3. **Runtime:** YC versions/triggers, gateway spec, DB heartbeat и HTTP smoke
   доказывают, что система реально работает сейчас.

`api-health-monitor.yml` запускается каждые 15 минут, вручную и после backend
push. После HTTP-проверок он всегда выполняет независимый DB dead-man: не
вызывает `heys-maintenance`, а напрямую читает `maintenance_heartbeat` и
последний `backup_run_log`. Stale или отсутствующая обязательная строка, старый,
partial либо failed backup завершают шаг ошибкой; в уведомление попадают только
типы проверок и ссылка на GitHub logs, без DB rows и secrets.

На момент live-проверки в YC активны все 17 ожидаемых HEYS timer triggers и все
9 опубликованных automation functions. Десять старых heartbeat и backup были
свежими. Шесть новых строк отдельных cron-workers появятся после применения
versioned seed migration и отдельно разрешённого production deploy. Migration
даёт один нормальный интервал на первый запуск; дальше timestamp обновляет
только сам worker. До rollout новый strict dead-man намеренно возвращает
`missing`, то есть переход fail-closed, а не ложный зелёный статус.

## Инварианты

1. Production publication происходит только после явного push/release flow.
2. Frontend deployments сериализованы; два uploader не должны перетирать S3.
3. Неизвестный deployed baseline ведёт к full build, не к fast path.
4. Hashed assets immutable, entry/SW/build markers обновляемы.
5. Raw secrets не публикуются в Cloud Function environment.
6. Function version, gateway route и timer trigger — отдельные deployment
   сущности; успех одной не доказывает остальные.
7. Repository README не доказывает live resource state.
8. Production SQL использует TLS и versioned migrations.
9. Source, generated artifacts и deployment evidence не смешиваются в один
   неявный commit агентом.
10. Backend deploy останавливается при отставшем migration ledger или отсутствии
    production Gateway-маршрутов desired-state messenger API.

## Подтверждённые слабые места и пробелы

- `infra/README.md` содержит быстро устаревающие live identifiers и срок SSL,
  прошедший к дате аудита. Он полезен как runbook, но требует runtime проверки.
- `yandex-cloud-functions/README.md` всё ещё описывает семь функций и 24/7
  GitHub monitoring; оба утверждения противоречат текущему source.
- Новые heartbeat-записи шести отдельных cron-workers ещё отсутствуют в
  production: migration, source и monitor готовы, но migration/functions в этой
  итерации не публиковались. До rollout strict dead-man закономерно красный.
- GitHub secret `PG_PASSWORD` и первый scheduled run нового monitor не
  проверялись: repository contract не доказывает состояние GitHub settings.
- В репозитории несколько исторических deploy/runbook документов. Без этого
  приоритета агент легко выберет старый ручной flow вместо текущих workflow и
  `deploy-all.sh`.
- Остальные live-ресурсы, сертификаты, deployed commits и workflow results в
  этой итерации не проверялись.

## Facts Table

| ID  | Утверждение                                                                                               | Проверка                                                                                                                                                                                                                                                          | Статус                                               |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| I1  | Frontend workflow сериализует main deploy и использует production build-meta baseline                     | `sed -n '1,105p' .github/workflows/deploy-yandex.yml`                                                                                                                                                                                                             | проверено 2026-07-17                                 |
| I2  | Workflow загружает PWA/demo/landing в три bucket                                                          | `rg -n 'YC*BUCKET*                                                                                                                        \| aws s3 (sync                                         \| cp)' .github/workflows/deploy-yandex.yml`                    | проверено 2026-07-17                                 |
| I3  | Явный inventory полностью покрывает 19 source functions; deploy/test scripts читают его                   | `node yandex-cloud-functions/function-inventory.cjs --verify && node --test yandex-cloud-functions/__tests__/function-inventory.test.cjs`                                                                                                                         | проверено 2026-07-18; 10 inventory tests             |
| I4  | Deploy guard запрещает plaintext secret env                                                               | `sed -n '200,230p' yandex-cloud-functions/deploy-all.sh`                                                                                                                                                                                                          | проверено 2026-07-17                                 |
| I5  | Gateway update и ops canary являются отдельными deploy steps                                              | `rg -n 'api-gateway update                                                                                                                \| check-heys-ops-status                                \| record_deploy_receipt' yandex-cloud-functions/deploy-all.sh` | проверено 2026-07-17                                 |
| I6  | Backend workflow охватывает API и automation paths и использует один fail-closed classifier в test/deploy | `sed -n '1,225p' .github/workflows/cloud-functions-deploy.yml`                                                                                                                                                                                                    | исправлено и проверено 2026-07-18                    |
| I7  | Health workflow имеет schedule и независимый strict DB dead-man                                           | `sed -n '1,235p' .github/workflows/api-health-monitor.yml`                                                                                                                                                                                                        | исправлено и проверено 2026-07-18                    |
| I8  | Production psql wrapper использует Lockbox и verify-full TLS                                              | `sed -n '1,35p' scripts/db/psql.sh`                                                                                                                                                                                                                               | проверено 2026-07-17                                 |
| I9  | Старый backend README заявляет только семь функций и 24/7 monitor                                         | `sed -n '1,75p' yandex-cloud-functions/README.md`                                                                                                                                                                                                                 | проверено 2026-07-17; помечено устаревшим            |
| I10 | Infra README содержит snapshot date и истёкшую относительно аудита дату SSL                               | `sed -n '1,35p' infra/README.md`                                                                                                                                                                                                                                  | проверено 2026-07-17; live certificate не проверен   |
| I11 | Production соответствует 9 automation functions и 17 ожидаемым active triggers                            | `yc serverless function list --format json`; `yc serverless trigger list --format json`; `evaluateTrigger`                                                                                                                                                        | live read-only проверка 2026-07-18; расхождений нет  |
| I12 | Dead-man fail-closed видит шесть новых heartbeat как missing до deploy, backup и прежние строки свежие    | `node yandex-cloud-functions/check-heys-ops-status.cjs --dead-man --strict --json`                                                                                                                                                                                | ожидаемый exit 1; production не изменялся 2026-07-18 |
| I13 | Seed migration создаёт все шесть heartbeat с порогами, не обновляя существующий `last_ok_at`              | `sed -n '1,35p' database/2026-07-18_automation_worker_heartbeats.sql`                                                                                                                                                                                             | проверено 2026-07-18; migration не применялась       |
