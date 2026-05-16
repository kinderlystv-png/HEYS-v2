# heys-snapshot-demo

Каждый час публикует snapshot двух демо-аккаунтов (мужской/женский) в публичный
S3 bucket. Демо HEYS на `try.heyslab.ru` грузит эти JSON-файлы при старте вместо
запросов в облако.

## Что попадает в snapshot (whitelist)

- `heys_products_overlay_v2` — каталог продуктов клиента, **денормализован**
  через JOIN с `shared_products` (ссылки `shared_origin_id` заменяются полным
  набором nutrient-полей, ссылки на куратора убираются)
- `heys_dayv2_YYYY-MM-DD` — последние 30 дней
- `heys_norms`, `heys_deleted_ids`, `heys_hr_zones`, `heys_ratio_zones`
- `heys_profile` — **синтетический**, не из БД (реальный зашифрован в
  `v_encrypted`; для демо используем нейтральные значения по полу)

## Что НЕ попадает

- Любые ключи с `v_encrypted IS NOT NULL` (зашифрованы — не можем прочитать)
- Любые ключи которых нет в whitelist (advice*\*, insights*_, BACKUP\__, etc.)
- Поля `created_by_user_id`, `created_by_client_id` в продуктах (идентификация
  куратора-автора)

## Cron

`0 * * * ? *` — каждый час, в 00 минут UTC.

## Environment variables

| Var                                         | Default                                   | Описание              |
| ------------------------------------------- | ----------------------------------------- | --------------------- |
| `PG_HOST`                                   | rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net | Postgres host         |
| `PG_PORT`                                   | 6432                                      |                       |
| `PG_DATABASE`                               | heys_production                           |                       |
| `PG_USER`                                   | heys_admin                                |                       |
| `PG_PASSWORD`                               | —                                         | из Lockbox            |
| `S3_BUCKET`                                 | heys-public-snapshot                      | публичный bucket      |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | —                                         |                       |
| `DEMO_MALE_CLIENT_ID`                       | ccfe6ea3-…                                | Poplanton             |
| `DEMO_FEMALE_CLIENT_ID`                     | 4545ee50-…                                | Александра            |
| `MALE_PSEUDONYM`                            | Дмитрий                                   | имя в demo            |
| `FEMALE_PSEUDONYM`                          | Мария                                     |                       |
| `DAYS_TO_INCLUDE`                           | 30                                        | дней назад от сегодня |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`   | —                                         | алерт при ошибке      |

## Локальный тест

```bash
cd yandex-cloud-functions/heys-snapshot-demo
npm install
PGPASSWORD=$(bash ../../scripts/db/get-pg-password.sh && echo $PGPASSWORD) \
  node test-local.js
```

Создаст `/tmp/snapshot-male.json` и `/tmp/snapshot-female.json` без аплоада в
S3.

## Deploy

```bash
cd yandex-cloud-functions
./deploy-all.sh heys-snapshot-demo
```

После deploy — создать Timer Trigger вручную в Yandex Cloud Console:
`heys-snapshot-demo-timer`, cron `0 * * * ? *`, service account с правами
`storage.editor` для bucket `heys-public-snapshot`.

## Smoke test после deploy

```bash
yc serverless function invoke --name heys-snapshot-demo
curl -s https://storage.yandexcloud.net/heys-public-snapshot/snapshot-male.json | \
  jq '.products | length, .lsKeys | keys'
```
