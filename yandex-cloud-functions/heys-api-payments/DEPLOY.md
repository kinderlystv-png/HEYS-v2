# heys-api-payments deploy and smoke

This function is the YuKassa production payment API:

- `GET /payments`
- `POST /payments/create`
- `POST /payments/webhook`
- `GET /payments/status`
- `POST /payments/refund`

Current deployment source of truth is `../deploy-all.sh`. Do not use the old
manual zip flow unless `deploy-all.sh` is unavailable and the fallback is
explicitly approved.

## Required secrets

`../deploy-all.sh heys-api-payments` fails closed unless these values are
present in `../.env`:

```bash
YUKASSA_SHOP_ID=...
YUKASSA_SECRET_KEY=...
YUKASSA_WEBHOOK_SECRET=...
INTERNAL_CRON_TOKEN=...
```

Optional Metrica Measurement Protocol variables:

```bash
YANDEX_METRICA_COUNTER_ID=...
YANDEX_METRICA_MP_TOKEN=...
YANDEX_METRICA_DRY_RUN=1
```

`YANDEX_METRICA_DRY_RUN=1` is suitable for the first smoke pass: the function
marks funnel events as `dry_run` without sending them to Metrica.

## Preflight without secrets

These checks do not publish anything:

```bash
cd /Users/poplavskijanton/HEYS-v2
node --check yandex-cloud-functions/heys-api-payments/index.js
node scripts/check-pricing-sync.cjs
yc serverless function list --format json
curl -sS https://api.heyslab.ru/payments
```

Expected state before first deploy:

- `heys-api-payments` is absent from `yc serverless function list`;
- `https://api.heyslab.ru/payments` returns the generic `HEYS API` health
  service, because API Gateway is still routed to health.

Expected state after deploy + gateway update:

- `heys-api-payments` is `ACTIVE`;
- `GET /payments` returns `{"service":"heys-api-payments","status":"ok",...}`;
- CORS is origin-whitelisted, not `Access-Control-Allow-Origin: *`.

## Deploy

Only run this after the secrets above are configured:

```bash
cd /Users/poplavskijanton/HEYS-v2/yandex-cloud-functions
./deploy-all.sh heys-api-payments
```

`deploy-all.sh` creates the function shell automatically if `heys-api-payments`
does not exist yet. After deploy, get its id:

```bash
yc serverless function get --name=heys-api-payments --format=json | jq -r '.id'
```

Prepare API Gateway so every `/payments*` route points to the new function id.
The helper is dry-run by default:

```bash
cd /Users/poplavskijanton/HEYS-v2
pnpm payments:gateway -- --function-id "$PAYMENTS_FUNCTION_ID"
pnpm payments:gateway -- --function-id "$PAYMENTS_FUNCTION_ID" --write
pnpm payments:gateway -- --function-id "$PAYMENTS_FUNCTION_ID" --check
```

It adds or updates these routes:

- `GET /payments`
- `POST /payments/create`
- `POST /payments/webhook`
- `GET /payments/status`
- `POST /payments/refund`

Apply the spec:

```bash
yc serverless api-gateway update \
  --id=d5d7939njvjp27ofsok0 \
  --spec=../api-gateway-spec.yaml
```

## YuKassa webhook

In the YuKassa merchant cabinet, set webhook URL:

```text
https://api.heyslab.ru/payments/webhook
```

Events:

- `payment.succeeded`
- `payment.canceled`
- `refund.succeeded`

The function checks YuKassa source IPs and, when `YUKASSA_WEBHOOK_SECRET` is
set, also checks the HMAC signature header.

## Smoke checklist

1. Health:

```bash
curl -sS https://api.heyslab.ru/payments
```

2. CORS preflight:

```bash
curl -sS -i -X OPTIONS https://api.heyslab.ru/payments/create \
  -H 'Origin: https://app.heyslab.ru' \
  -H 'Access-Control-Request-Method: POST'
```

3. Payment create from a real PIN session:

```bash
curl -sS -X POST 'https://api.heyslab.ru/payments/create' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CLIENT_SESSION_TOKEN" \
  -d '{
    "clientId": "'"$CLIENT_ID"'",
    "plan": "base",
    "returnUrl": "https://app.heyslab.ru/payment-result?clientId='"$CLIENT_ID"'"
  }'
```

4. Verify DB side effects:

- `payments.status = pending` after create;
- `payment_events` has exactly one row per webhook event;
- duplicate webhook does not create a second event;
- `funnel_events.event_type` is `payment` for first success and `renewal` for
  later success;
- Metrica status is `dry_run`, `sent` or explicit `skipped:*`.

5. Refund smoke is curator-only and must use a real curator JWT:

```bash
curl -sS -X POST 'https://api.heyslab.ru/payments/refund' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CURATOR_JWT" \
  -d '{"paymentId":"'"$PAYMENT_ID"'"}'
```
