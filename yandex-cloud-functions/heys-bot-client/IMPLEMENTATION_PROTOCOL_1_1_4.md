# 1.1.4 CRM/logging implementation protocol

Date: 2026-06-17

Scope: close marketing plan item `1.1.4` for `heys-bot-client`: Telegram contact
handoff creates a CRM lead, logs the funnel event, and sends the curator a
PII-free summary.

## Status

| Step                    | Status | Evidence / reviewer focus                                                                                                                                                                                                                                                        |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements check      | Done   | `маркетинг/22_План_реализации_маркетинга.md` required source, deploy, gateway route, and live smoke.                                                                                                                                                                             |
| CRM lead handoff        | Done   | `createStartLeadFromContact()` links a `week_request` event to `public.leads`, stores contact data only in PostgreSQL, and records a PII-free `lead` funnel event.                                                                                                               |
| Replay/dedupe hardening | Done   | Replays now reuse `funnel_events.lead_id` from the existing `week_request` before looking up by phone. If the request was already linked, the curator handoff is not sent again.                                                                                                 |
| Local tests             | Done   | `node --check yandex-cloud-functions/heys-bot-client/index.js` PASS; `pnpm bot:crm-test` PASS, 13/13; `pnpm privacy:marketing` PASS.                                                                                                                                             |
| Deploy                  | Done   | `./deploy-all.sh heys-bot-client --force-dirty` created active version `d4ehh23e1habumh6v2mg` at `2026-06-17T19:07:11Z`. Used dirty-source override because the project forbids commit without a separate command; source commit still remains for a later explicit commit pass. |
| Gateway routes          | Done   | `heys-api` API Gateway now has `/bot/webhook`, `/bot/send`, `/bot/health`, `/start-bot/webhook`, `/start-bot/health`; tracked `api-gateway-spec.yaml` was updated with the same routes.                                                                                          |
| Live smoke              | Done   | `GET /start-bot/health` and `GET /bot/health` returned 200; spoof POST without Telegram secret returned 403; controlled test webhook created one lead, one linked `week_request`, and one `lead` event.                                                                          |

## Acceptance Map

| Requirement                                               | Current evidence                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contact creates `public.leads` row                        | Covered by `HEYS Start contact creates CRM lead and sends PII-free curator handoff`.                                                             |
| `lead` event is recorded through `record_funnel_event`    | Covered by the same test; metadata excludes phone/name/email/chat id.                                                                            |
| Curator handoff has `lead_id`, source, segment, readiness | Covered by the same test and live runbook.                                                                                                       |
| Curator handoff has no phone/name/raw chat id             | Covered by the same test and `CRM_SMOKE.md`.                                                                                                     |
| Contact before `week_request` does not create a lead      | Covered by `HEYS Start contact without week_request does not create CRM lead`.                                                                   |
| Replay does not duplicate active lead or curator handoff  | Covered by `HEYS Start contact replay reuses linked week_request lead without duplicate curator handoff`.                                        |
| Production path works                                     | Live smoke 2026-06-17: `lead_rows=1`, `active_leads=1`, `lead_events=1`, `linked_week_requests=1`; event metadata had no phone/name/raw chat id. |

## Notes

- Do not put phone, name, raw Telegram `chat_id`, IP, or user-agent in Telegram
  handoff messages or funnel metadata.
- Generated bundles, commit, and push were not performed in this pass.

## Personal Bot Latency Hotfix

Date: 2026-06-21

| Step             | Status | Evidence / reviewer focus                                                                                                                                                                                                                                                                            |
| ---------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root cause check | Done   | `@heyslab_bot` webhook was empty and `pending_update_count=0`; delivery depended on `heys-client-bot-poll`. Trigger was active but used `window_ms=45000`, leaving a gap each minute. Logs also showed intermittent `getUpdates failed: fetch failed`, which previously ended the whole poll window. |
| Runtime fix      | Done   | `handleTelegramWebhook()` now delivers personal-bot replies through direct Telegram `sendMessage`, same pattern as `HEYS Start`, instead of relying on Telegram webhook response body. Poll delivery counts direct `{ ok, delivered }` responses and avoids duplicate sends.                         |
| Poller hardening | Done   | `runStartBotPoll()` and `runClientBotPoll()` now retry inside the same polling window after transient `getUpdates` network errors instead of breaking until the next timer tick.                                                                                                                     |
| Trigger tuning   | Done   | `heys-client-bot-poll` updated to payload `{"poll":"heys-client-bot","window_ms":55000}` on the existing 1-minute cron, reducing the no-listen gap to roughly 5 seconds.                                                                                                                             |
| Checks           | Done   | `node --check yandex-cloud-functions/heys-bot-client/index.js` PASS; `pnpm bot:crm-test` PASS, 14/14; `pnpm privacy:marketing` PASS; post-deploy health check PASS.                                                                                                                                  |
| Deploy           | Done   | `./deploy-all.sh heys-bot-client --force-dirty` deployed active version `d4eu983gdmd8m82jde6p` at `2026-06-21T09:58:28Z`. Used dirty-source override because commit is a separate explicit user command.                                                                                             |

## Personal Bot Instant-Reply Follow-up

Date: 2026-06-21

| Step                     | Status | Evidence / reviewer focus                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retest result            | Done   | Manual product test still waited about 30-40 seconds, so 55-second timer polling was not enough for the desired UX. Live logs showed the poller active but intermittent Telegram `getUpdates failed: fetch failed` / aborted calls could still delay delivery.                                            |
| Webhook security         | Done   | Deployed `TELEGRAM_WEBHOOK_SECRET_SHA256` into `heys-bot-client` runtime env; spoof `POST /bot/webhook` without Telegram secret now returns HTTP 403.                                                                                                                                                     |
| Instant path             | Done   | `@heyslab_bot` webhook set to `https://api.heyslab.ru/bot/webhook` with Telegram `secret_token`, `allowed_updates=["message"]`, `drop_pending_updates=false`. Because `handleTelegramWebhook()` now sends direct Bot API replies, the webhook no longer relies on Telegram method-response body behavior. |
| Polling conflict removal | Done   | `heys-client-bot-poll` paused after webhook activation; Telegram cannot use webhook and `getUpdates` for the same bot at the same time.                                                                                                                                                                   |
| Live checks              | Done   | `getWebhookInfo`: URL set, `pending_update_count=0`, `allowed_updates=["message"]`; safe empty-update with correct secret returned HTTP 200 `ignored:no-message`.                                                                                                                                         |

## Personal Bot Webhook Rollback

Date: 2026-06-21

| Step                | Status | Evidence / reviewer focus                                                                                                                                                                                     |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook retest      | Done   | A later live click left `@heyslab_bot` at `pending_update_count=1` with Telegram `last_error_message="Connection timed out"`, so webhook was not reliable enough for the personal bot.                        |
| Queue preservation  | Done   | Webhook was removed with `deleteWebhook(drop_pending_updates=false)`, preserving the pending `/start` update instead of discarding it.                                                                        |
| Pending drain       | Done   | Manual invoke `{"poll":"heys-client-bot","window_ms":55000}` processed `1` update and delivered `1` reply. Follow-up `getWebhookInfo` showed empty webhook URL and `pending_update_count=0`.                  |
| Active runtime path | Done   | `heys-client-bot-poll` is active again with payload `{"poll":"heys-client-bot","window_ms":55000}`. Current production path is long polling plus direct Bot API `sendMessage`, not Telegram webhook delivery. |

## Personal Bot Retry Latency Tuning

Date: 2026-06-21

| Step          | Status | Evidence / reviewer focus                                                                                                                                                                                                |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Retest result | Done   | Manual product test improved from 30-40 seconds to about 5-10 seconds, but still felt too slow for first-click `/start`.                                                                                                 |
| Runtime cause | Done   | Live logs around the retest showed client poll `getUpdates failed` / aborted and one `offset commit failed`, so the remaining delay matched a long `getUpdates` retry window rather than GitHub publication or app code. |
| Source change | Done   | `runClientBotPoll()` now caps the personal-bot `getUpdates` timeout at 3 seconds, reducing retry latency when Telegram/Yandex networking stalls. `runStartBotPoll()` keeps its previous 10-second max timeout.           |
| Checks        | Done   | `node --check yandex-cloud-functions/heys-bot-client/index.js` PASS; `pnpm bot:crm-test` PASS, 14/14; `pnpm privacy:marketing` PASS.                                                                                     |
| Deploy        | Done   | `./deploy-all.sh heys-bot-client --force-dirty` deployed active version `d4eiv42l9759o5p8cokv` at `2026-06-21T10:18:05Z`; post-deploy health check PASS.                                                                 |
| Live state    | Done   | `@heyslab_bot` webhook URL is empty, `pending_update_count=0`; `heys-client-bot-poll` is ACTIVE on `$latest` with payload `{"poll":"heys-client-bot","window_ms":55000}`.                                                |

## Telegram Bot Polling Parity

Date: 2026-06-21

| Step           | Status | Evidence / reviewer focus                                                                                                                                                               |
| -------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope check    | Done   | Incoming Telegram bots handled by `heys-bot-client` are `@heyslab_bot` / client bot and HEYS Start. Both use direct Bot API delivery from their handlers and timer-driven long polling. |
| Source parity  | Done   | Both `runStartBotPoll()` and `runClientBotPoll()` now cap each `getUpdates` cycle at 3 seconds and retry inside the same poll window after transient network failures.                  |
| Trigger parity | Done   | `heys-start-bot-poll` was updated from `window_ms=45000` to `window_ms=55000`; `heys-client-bot-poll` was already at `window_ms=55000`.                                                 |
| Checks         | Done   | `node --check yandex-cloud-functions/heys-bot-client/index.js` PASS; `pnpm bot:crm-test` PASS, 14/14; `pnpm privacy:marketing` PASS.                                                    |
| Deploy         | Done   | `./deploy-all.sh heys-bot-client --force-dirty` deployed active version `d4e1997u28s8l7qr7hv0` at `2026-06-21T10:20:38Z`; post-deploy health check PASS.                                |
| Live state     | Done   | Both Telegram `getWebhookInfo` checks showed empty webhook URL and `pending_update_count=0`; both polling triggers are ACTIVE on `$latest` with `window_ms=55000`.                      |
