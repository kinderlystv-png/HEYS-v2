# heys-bot-client CRM smoke

This smoke closes the `1.1.4` marketing-plan gate after an approved deploy of
`heys-bot-client`.

Do not run this as a dry marketing test with real customer PII. Use a controlled
Telegram test account and a test phone number that the operator is allowed to
process.

## Preconditions

- `heys-bot-client` has been deployed from the current source.
- `@heys_start_bot` webhook points to:

```text
https://api.heyslab.ru/start-bot/webhook
```

- Telegram webhook `secret_token` matches `HEYS_START_WEBHOOK_SECRET`.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are configured for curator
  handoff.
- `HEYS_START_BOT_TOKEN`, `INTERNAL_CRON_TOKEN`, `PG_*` and app Lockbox access
  are configured.

## Source preflight

```bash
cd /Users/poplavskijanton/HEYS-v2
node --check yandex-cloud-functions/heys-bot-client/index.js
curl -sS https://api.heyslab.ru/start-bot/health
curl -sS -i -X POST https://api.heyslab.ru/start-bot/webhook \
  -H 'Content-Type: application/json' \
  -d '{"update_id":1}'
```

Expected spoof result without Telegram secret header: HTTP 403.

## Manual Telegram flow

1. Open `@heys_start_bot`.
2. Send `/start src_smoke`.
3. Complete the quiz.
4. Choose `Записаться на неделю`.
5. Share contact from the same test Telegram account.

Expected user-facing result:

- bot thanks the user and says curator will contact them;
- no error appears in the bot chat.

Expected curator Telegram result:

```text
HEYS Старт: заявка на неделю

lead_id: <uuid>
source: smoke
segment: <segment>
readiness: <this_week|next_week>
...
ПДн не отправлены в Telegram. Полные данные — в PostgreSQL РФ.
```

The curator message must not contain phone, name, raw Telegram `chat_id`, IP or
user-agent.

## DB verification

Use `scripts/db/psql.sh` and substitute the `lead_id` from the curator handoff.

```sql
SELECT id, phone IS NOT NULL AS has_phone, messenger, utm_source,
       utm_medium, utm_campaign, quiz_segment, readiness, how_heard,
       consent_method, consent_privacy_version
  FROM public.leads
 WHERE id = '<lead_id>';
```

Expected:

- one row;
- `has_phone = true`;
- `messenger = telegram`;
- `utm_source = smoke` or the sanitized source used in `/start`;
- `utm_medium = bot`;
- `utm_campaign = heys_start`;
- `quiz_segment` is not null;
- `readiness` is `this_week` or `next_week`;
- `how_heard = telegram_bot`;
- `consent_method = telegram_contact`.

```sql
SELECT event_type, lead_id, source, campaign, segment,
       metadata ? 'phone' AS has_phone,
       metadata ? 'name' AS has_name,
       metadata ? 'chat_id' AS has_chat_id,
       metadata ? 'chat_hash' AS has_chat_hash,
       metadata->>'readiness' AS readiness,
       dedupe_key
  FROM public.funnel_events
 WHERE lead_id = '<lead_id>' OR dedupe_key LIKE '%start:%'
 ORDER BY occurred_at DESC
 LIMIT 20;
```

Expected:

- `lead` event exists for the new lead;
- `week_request` event exists before contact handoff;
- `has_phone = false`;
- `has_name = false`;
- `has_chat_id = false`;
- `has_chat_hash = true` only in bot qualification metadata;
- dedupe keys are stable and no duplicate `lead` event appears after replay.

## Replay / dedupe check

Repeat contact sharing once from the same Telegram account.

Expected:

- no second active lead for the same normalized phone;
- existing `week_request` gets the same `lead_id`;
- `record_funnel_event(... dedupe_key='lead:start:<lead_id>')` stays idempotent.

```sql
SELECT phone, count(*)
  FROM public.leads
 WHERE phone = (SELECT phone FROM public.leads WHERE id = '<lead_id>')
   AND status IN ('new', 'contacted', 'trial_started')
 GROUP BY phone;
```

Expected `count = 1`.

## Pass criteria

`1.1.4` can be marked `✅` only when all are true:

- source preflight passes;
- spoof webhook without Telegram secret returns 403;
- curator handoff contains `lead_id`, source, segment and readiness;
- curator handoff contains no phone/name/raw chat id;
- DB row in `public.leads` has contact data and qualification fields;
- `funnel_events` has `lead` event without PII metadata;
- replay does not create a duplicate active lead.
