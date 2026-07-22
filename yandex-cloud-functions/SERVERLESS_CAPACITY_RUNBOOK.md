# HEYS Serverless Capacity Runbook

## Инцидент и подтверждённая причина

22.07.2026 `heys-api-rpc` получил массовые ответы платформы:

```text
Code: 429 Message: No node can serve the request:
Concurrent requests quota 10 exceeded
```

Live-проверка показала `concurrency=4`, `512 MB`, `30s` у `$latest` версий
`heys-api-rpc` и `heys-api-rest`, но общая cloud-квота
`serverless.request.count=10`. Это общий потолок вызовов всех функций в зоне, а
не настройка одного контейнера. Увеличение `concurrency` версии без повышения
cloud-квот этот инцидент не устраняет.

## Capacity policy

Источник истины — `serverless-capacity-policy.cjs`:

- 6 одновременно синхронизирующихся клиентов;
- максимум 3 запроса на клиент: Phase A + два upload;
- 2 operational canary-запроса (RPC + REST);
- target peak: `6 × 3 + 2 = 20`;
- обязательный запас 2×: `serverless.request.count >= 40`;
- связанная квота: `serverless.workers.count >= 40`;
- RAM: минимум 20 GB (`40 × 512 MB`), уже назначено cloud.

Runtime `concurrency=4` сохраняется. Для rpc/rest явно задаются scaling policies
`zone_instances_limit=40` и `zone_requests_limit=40`; сейчас live policies у
обеих функций отсутствуют. Handler guard не ставит предел ниже runtime
concurrency, чтобы сам не создавать `429` на каждом четвёртом запросе. Вызов,
который всё же превысил admission limit внутри handler, получает `429`,
`Retry-After: 2`, `Cache-Control: no-store` и `X-HEYS-Overload`.

Важно: platform-level `429` возникает до запуска handler, поэтому код функции не
может добавить к нему заголовок. Основная защита от него — cloud-квота и scaling
limits 40; handler-level overload имеет корректный `Retry-After`.

## Quota gate

Проверка фактических квот и `$latest` версий:

```bash
node yandex-cloud-functions/check-serverless-capacity.cjs --strict
```

`deploy-all.sh` перед любым deploy rpc/rest проверяет quota-only часть gate и
отказывается создавать новую версию, пока запас меньше policy. После создания
версии он применяет scaling policy; полный strict-check подтверждает и квоты, и
фактические runtime/scaling settings.

Для cloud `b1gocduuj5htqej5ujoj` нужно запросить:

```text
serverless.request.count = 40
serverless.workers.count = 40
```

CLI Quota Manager сейчас отвечает, что cloud не имеет alpha-флага
`QUOTA_MANAGER_USE_QUOTA_REQUEST_SERVICE_VIA_API`. Поэтому заявку нужно создать
в Yandex Cloud Console → Quotas или через поддержку. После одобрения повторить
capacity check; успешный gate обязан показать `ok: true`.

## Alert и operational canary

Безопасная read-only проверка production:

```bash
node yandex-cloud-functions/serverless-ops-canary.cjs --strict
node yandex-cloud-functions/check-serverless-error-logs.cjs --since 20m --strict
```

Workflow `API Health Monitor` запускается каждые 10 минут. Он выполняет RPC и
REST без маскирующего retry, затем сканирует Cloud Function logs на точные коды
`429` и `503`. Любой такой код проваливает workflow и попадает в Telegram alert.

## Target load test

Тест запускается только после одобрения квот и отдельного разрешённого deploy.
Он создаёт волну из 20 одновременных запросов: Phase A + два canary-upload для
шести тестовых клиентов и два operational probes. После волны он повторно читает
критические ключи и оба probe-key каждого клиента. Тела upload не пересобираются
при recovery, поэтому retry проверяет сохранность исходной pending-записи.

Credentials не хранятся в git. Создать `/tmp/heys-capacity-clients.json`:

```json
{
  "baseUrl": "https://api.heyslab.ru",
  "clients": [
    {
      "name": "capacity-client-1",
      "sessionToken": "<dedicated test session>",
      "contextId": "<active write context>"
    }
  ]
}
```

Нужно шесть dedicated test clients. Защитить и запустить:

```bash
chmod 600 /tmp/heys-capacity-clients.json
node yandex-cloud-functions/serverless-sync-load-test.cjs \
  --scenario /tmp/heys-capacity-clients.json \
  --clients 6
```

Критерий target-load: `ok=true`, `targetWaveSize=20`, `maxInFlight>=20`,
`initialOverloads=0`, `verificationOk=true`, `missingProbeWrites=[]`.

Для контролируемой overload-проверки используется `--expect-overload`: каждый
`429/503` обязан содержать валидный `Retry-After`, повтор завершиться успешно, а
probe-записи — читаться после recovery.

## Rollout gate

1. Квоты request/workers одобрены до 40.
2. `check-serverless-capacity.cjs --strict --quota-only` зелёный.
3. Unit/contract tests зелёные.
4. Отдельной командой пользователя разрешён deploy rpc/rest.
5. Полный `check-serverless-capacity.cjs --strict` подтверждает runtime и
   scaling.
6. Operational canary зелёный.
7. Target load test зелёный.
8. Повторный log scan за окно теста не содержит `429/503`.

Без прохождения пунктов 1–2 deploy блокируется; без пунктов 5–8 rollout не
считается проверенным.
