# Инфраструктура и эксплуатация

> **Статус:** repository contracts проверены 2026-07-17<br> **Охват:** frontend
> delivery, Cloud Functions deploy, gateway, secrets, database access,
> monitoring и release evidence<br> **Не подтверждено:** текущие YC/DNS/VM/CDN
> ресурсы, production versions, сертификаты, GitHub secrets и последние workflow
> runs

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

| Вопрос                               | Канонический repository source                     |
| ------------------------------------ | -------------------------------------------------- |
| Какие frontend artifacts публикуются | `.github/workflows/deploy-yandex.yml`              |
| Какие функции умеет deploy flow      | `yandex-cloud-functions/deploy-all.sh`             |
| Как URL связан с функцией            | `yandex-cloud-functions/api-gateway-spec.yaml`     |
| Какие automations должны быть живы   | `check-heys-ops-status.cjs` + `BACKGROUND_JOBS.md` |
| Как подаются runtime secrets         | `deploy-all.sh` + `shared/secrets.js` copies       |
| Как выполнять production SQL         | `scripts/db/psql.sh` и versioned migrations        |
| Детали VM/CDN/S3 и восстановление    | `infra/README.md`, operational runbooks            |
| Что реально развернуто сейчас        | только YC/GitHub/DNS/HTTP runtime evidence         |

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

`deploy-all.sh` — текущий общий deploy entrypoint. Он поддерживает одну функцию
или группы `api`/`automations`/`all`, валидирует `.env`, создаёт/обновляет
versions и умеет обновлять gateway. Inventory заметно шире старого README:
включает продуктовые API, SpeechKit worker, bots, maintenance, backup и cron
functions.

Deploy script передаёт идентификаторы Lockbox и placeholders/hashes, а guard
отказывается публиковать raw token/password/private key в function environment.
После прохода он выполняет health/canary согласно выбранному режиму и пишет
deploy receipt best effort. Наличие новой function version не гарантирует, что
gateway уже указывает на нужную функцию: gateway spec обновляется отдельным
шагом/условием.

GitHub workflow автоматически реагирует только на `heys-api-*`, shared deploy
files и gateway spec. Изменения каталогов `heys-cron-*`, `heys-maintenance` или
`heys-bot-client` не входят в его push path filter. Эти automations требуют
явного deployment flow; зелёный frontend workflow их не публикует.

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

`api-health-monitor.yml` больше не является 24/7 schedule: cron закомментирован,
workflow запускается вручную или по backend push. Автономный operational
контроль сейчас должен опираться на YC timers/security alerts/heartbeat и
внешний запуск strict ops-check, а не на старое утверждение README.

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

## Подтверждённые слабые места и пробелы

- `infra/README.md` содержит быстро устаревающие live identifiers и срок SSL,
  прошедший к дате аудита. Он полезен как runbook, но требует runtime проверки.
- `yandex-cloud-functions/README.md` всё ещё описывает семь функций и 24/7
  GitHub monitoring; оба утверждения противоречат текущему source.
- Backend auto-deploy path filter не включает automation function directories.
  Изменение cron/bot/maintenance source само по себе не запускает workflow.
- Health monitor schedule отключён. Push-triggered smoke не является внешним
  круглосуточным watchdog.
- `deploy-all.sh` inventory и `check-heys-ops-status.cjs` inventory расходятся:
  SpeechKit уже отмечен в `BACKGROUND_JOBS.md`; новые функции могут выпадать из
  наблюдаемости без отдельного обновления checker.
- В репозитории несколько исторических deploy/runbook документов. Без этого
  приоритета агент легко выберет старый ручной flow вместо текущих workflow и
  `deploy-all.sh`.
- Текущие ресурсы, сертификаты, deployed commits и workflow results не
  проверялись live в рамках документационного прохода.

## Facts Table

| ID  | Утверждение                                                                           | Проверка                                                                                                                   | Статус                                             |
| --- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| I1  | Frontend workflow сериализует main deploy и использует production build-meta baseline | `sed -n '1,105p' .github/workflows/deploy-yandex.yml`                                                                      | проверено 2026-07-17                               |
| I2  | Workflow загружает PWA/demo/landing в три bucket                                      | `rg -n -e 'YC_BUCKET_' -e 'aws s3 sync' -e 'aws s3 cp' .github/workflows/deploy-yandex.yml`                                | проверено 2026-07-17                               |
| I3  | Deploy script имеет актуальные API/automation inventories                             | `sed -n '110,150p' yandex-cloud-functions/deploy-all.sh`                                                                   | проверено 2026-07-17                               |
| I4  | Deploy guard запрещает plaintext secret env                                           | `sed -n '200,230p' yandex-cloud-functions/deploy-all.sh`                                                                   | проверено 2026-07-17                               |
| I5  | Gateway update и ops canary являются отдельными deploy steps                          | `rg -n -e 'api-gateway update' -e 'check-heys-ops-status' -e 'record_deploy_receipt' yandex-cloud-functions/deploy-all.sh` | проверено 2026-07-17                               |
| I6  | Backend workflow push filter охватывает только `heys-api-*` и shared/gateway tooling  | `sed -n '1,25p' .github/workflows/cloud-functions-deploy.yml`                                                              | проверено 2026-07-17                               |
| I7  | API health schedule закомментирован                                                   | `sed -n '1,15p' .github/workflows/api-health-monitor.yml`                                                                  | проверено 2026-07-17                               |
| I8  | Production psql wrapper использует Lockbox и verify-full TLS                          | `sed -n '1,35p' scripts/db/psql.sh`                                                                                        | проверено 2026-07-17                               |
| I9  | Старый backend README заявляет только семь функций и 24/7 monitor                     | `sed -n '1,75p' yandex-cloud-functions/README.md`                                                                          | проверено 2026-07-17; помечено устаревшим          |
| I10 | Infra README содержит snapshot date и истёкшую относительно аудита дату SSL           | `sed -n '1,35p' infra/README.md`                                                                                           | проверено 2026-07-17; live certificate не проверен |
