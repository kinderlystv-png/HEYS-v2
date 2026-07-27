# HEYS · R0/R1/R2 sign-off package

Статус: R0 closed / R1–R3 external actions pending. Файл не заменяет юриста,
ЮKassa smoke или incident drill. Его задача — собрать в одном месте, что именно
уже готово в репо и что проверять перед R0, R1 и R2.

Не хранить здесь номера/ключи РКН-уведомлений, скрины ЕСИА, ПДн клиентов,
секреты YooKassa/Lockbox или юридические комментарии с привилегией. Полные
доказательства хранятся вне репо, а здесь фиксируется только статус.

## R0 — заявки и бесплатные триалы

Live evidence текущего прохода:
[heys-r0-live-evidence-2026-07-26.md](heys-r0-live-evidence-2026-07-26.md).

| Проверка                    | Источник                                                                                                         | Статус        | Что остается вне репо / в live                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------- |
| РКН updateform              | [rkn-notification-heys.md](rkn-notification-heys.md), `маркетинг/31`                                             | ✅            | запись проверена 2026-07-26; HEYS-цели и health-data опубликованы |
| Реестр данных               | [heys-data-register.md](heys-data-register.md)                                                                   | ✅            | сверено с опубликованной записью 26-22-005319                     |
| ИСПДн level/threat model    | [heys-ispdn-threat-model-r0.md](heys-ispdn-threat-model-r0.md), [heys-ispdn-gap-list.md](heys-ispdn-gap-list.md) | ✅ R0 / 🟡 R2 | рабочие тип 3 / УЗ-4 приняты; внешний sign-off до R2              |
| Access matrix + break-glass | [heys-access-matrix.md](heys-access-matrix.md), [heys-pdn-incident-playbook.md](heys-pdn-incident-playbook.md)   | ✅            | drill перед R2                                                    |
| Calendar/reminders          | [heys-pdn-calendar.ics](heys-pdn-calendar.ics)                                                                   | 📅            | плановое напоминание, не R0 gate                                  |
| Monthly audit preflight     | `pnpm pdn:monthly-audit`                                                                                         | 🟡            | первая фактическая запись после РКН/запуска                       |
| Telegram lead notification  | live DB/handoff/replay, PII-free metadata, 23/23 tests, claim-кнопка в production                                | ✅            | штатный poll heartbeat                                            |
| Security strict readiness   | production strict read/write, two-client IDOR, SEC-004/024 `ready=true`                                          | ✅            | штатное observation                                               |

R0 закрыт 2026-07-26. Публичные privacy 1.6 и health consent 1.4
синхронизированы 2026-07-27; smoke 5–10 знакомых — следующий продуктовый
контроль перед закрепом и массовым CTA, а не ПДн/security blocker.

Новый предтриальный intake проходит тот же R0-контур: health consent 1.5 и
внутренний реестр обновлены, а data-change gate подтвердил, что действующая
запись РКН уже охватывает заявки/триалы и специальные данные о здоровье.
Отдельная повторная подача не является production-блокером.

## R1 — первая оплата

| Проверка                        | Источник                                                                      | Статус | Что остается вне репо / в live                             |
| ------------------------------- | ----------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| Payment function/gateway        | `yandex-cloud-functions/heys-api-payments/DEPLOY.md`, `pnpm payments:gateway` | 🟡     | YooKassa secrets, deploy, gateway route                    |
| Webhook + payload core behavior | `pnpm payments:webhook-test`                                                  | ✅     | live create/webhook/refund/status smoke                    |
| Payment metadata privacy        | `pnpm privacy:marketing` + payload unit test                                  | ✅     | contact/health metadata guard; повторить live после deploy |
| RKN/privacy data-change check   | [heys-data-change-gate.md](heys-data-change-gate.md)                          | 🟡     | проверить фактическую схему ЮKassa/чеков                   |
| Receipt contact                 | `phone/email` в payment flow                                                  | 🟡     | проверить 54-ФЗ/ЮKassa настройки                           |

R1 включается только после R0. Если ЮKassa/чеки добавляют новые категории,
получателей или сроки хранения, сначала обновить register/privacy/RKN decision.

## R2/R3 — paid-scale и внешние кураторы

| Проверка                         | Источник                                                                                                                                                                                                                            | Статус | Что остается вне репо / в live                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| External legal sign-off          | [legal-signoff-template.md](legal-signoff-template.md)                                                                                                                                                                              | 🟡     | выбрать проверяющего, сохранить memo вне репо                                                    |
| Incident drill                   | [heys-pdn-incident-playbook.md](heys-pdn-incident-playbook.md), [heys-pdn-incident-drill-template.md](heys-pdn-incident-drill-template.md)                                                                                          | 🟡     | template ready; провести 24/72 drill вне репо                                                    |
| First monthly audit record       | [heys-pdn-monthly-audit.md](heys-pdn-monthly-audit.md)                                                                                                                                                                              | 🟡     | заполнить фактическую запись                                                                     |
| Retention legal decision         | [heys-retention-policy-draft.md](heys-retention-policy-draft.md), [heys-retention-job-runbook.md](heys-retention-job-runbook.md)                                                                                                    | 🟡     | dry-run runbook ready; sign-off сроков, payments retention, backup retention                     |
| DSAR owner/log/sign-off          | [heys-dsar-procedure-draft.md](heys-dsar-procedure-draft.md), [heys-dsar-request-log-template.md](heys-dsar-request-log-template.md), [heys-privacy-intake-runbook.md](heys-privacy-intake-runbook.md), `export_my_data_by_session` | 🟡     | self-service RPC/UI + owner/template/intake runbook ready; legal sign-off + factual external log |
| External curator contract/access | `маркетинг/22` 4.9, [heys-access-matrix.md](heys-access-matrix.md)                                                                                                                                                                  | 🟡     | договор/конфиденциальность/доступы до найма                                                      |
| ERID paid placements             | `маркетинг/33_ERID_регламент_и_шаблоны.md`                                                                                                                                                                                          | 🟡     | заполнить ERID-001 и ОРД перед посевом                                                           |

## Evidence commands

Перед ручным review пакета выполнить:

```bash
pnpm pdn:monthly-audit
pnpm privacy:marketing
pnpm payments:webhook-test
pnpm security:l6-watchdogs
```

Команды не заменяют live-smoke и внешние действия; они проверяют, что локальный
пакет не распался.
