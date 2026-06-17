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
