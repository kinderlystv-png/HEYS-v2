# HEYS · Протокол consent/payment/SpeechKit/analytics readiness

**Дата аудита и правовой актуальности:** 27 июля 2026 г.  
**Статус source:** payment/refund/SpeechKit/analytics и consent-proof hardening
подготовлены  
**Release verdict:** **SOURCE READY / NOT DEPLOYED**; health 2.0 остаётся
**INACTIVE STOP** до письменного legal sign-off и отдельной activation
migration.

## 1. Scope и ограничения

В этом проходе исправлены Пользовательское соглашение, возвраты, единый
платёжный акцепт, SpeechKit exact-version gate, privacy/cookie disclosure и
analytics opt-in. Опубликованные trial-intake hunks и preview-generated legacy
bundles не откатывались и не пересобирались. Kinderly не читался и не менялся.

Commit, production build, migration, push и deploy не выполнялись. Внешний
письменный sign-off российского юриста остаётся обязательным.

## 2. UI-гейт

Цель — осознанный выбор без давления; главное действие — продолжить с выбранными
настройками; слой 1 — одно честное объяснение и равноправные варианты; слой 2 —
полный документ; критическое не скрывается: передача аудио, возможные
health-data, аналитика, отзыв и последствия отказа.

## 3. Facts Table

| Утверждение                                                     | Source file:line                                                 | Runtime/backend/DB evidence                                                                           | Нормативное основание                          | Статус                 | Риск            | Решение                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------- | --------------- | -------------------------------------------------------- |
| Пользователь может отказаться от платных услуг в любое время    | `apps/web/public/docs/user-agreement.md:79`, `refund.md:16`      | refund flow существует через payments API                                                             | ст. 32 ЗоЗПП                                   | confirmed              | P0              | убраны 14 дней и «активное использование»                |
| HEYS при своей отмене возвращает 100% текущего периода          | `user-agreement.md:85`, `refund.md:33`                           | сумма инициируется существующим refund API                                                            | п. 2 ст. 782 ГК РФ                             | confirmed              | P0              | сохранено право на полные убытки                         |
| Payment UI и backend используют один контракт                   | `heys_subscriptions_v1.js:626`, `heys-api-payments/index.js:301` | backend проверяет активный `payment_oferta` точной версии до создания payment                         | ст. 438 ГК РФ; ст. 9 152-ФЗ для доказательства | confirmed              | P0              | версия 1.7 + SHA-256 в payment metadata                  |
| Куратор отвечает ориентировочно 1–2 часа, не гарантированно     | `user-agreement.md:141`                                          | продукт не вводит технический SLA                                                                     | ст. 10, 12 ЗоЗПП — достоверность информации    | confirmed              | P1              | единая честная формулировка и 112                        |
| Старая версия SpeechKit не разрешает расшифровку                | `heys-api-messages/index.js:243,276,516-551`                     | два EXISTS требуют speech 1.1 и health 1.5; unit test                                                 | ст. 9, 10 152-ФЗ                               | confirmed source-only  | P0              | fail closed; deploy ещё не выполнен                      |
| Отказ SpeechKit не мешает голосовому                            | `heys_messenger_v1.js:2850-2875`                                 | существующий send сохраняет `consent_required` и отправляет аудио                                     | добровольность согласия                        | confirmed              | P1              | отдельные «Без расшифровки»/«Согласен»                   |
| Метрика не загружается до opt-in                                | `AnalyticsConsentGate.tsx:7-34`                                  | component test 3/3; layout больше не содержит direct Script/noscript                                  | ст. 9 152-ФЗ                                   | confirmed source-only  | P0              | versioned `granted/denied`; старый marker игнорируется   |
| Privacy описывает фото, аудио и расшифровки                     | `privacy-policy.md:24-55`                                        | messenger хранит media в Object Storage и transcript в message data                                   | ст. 18.1 152-ФЗ                                | confirmed              | P0              | privacy 1.7 + snapshot                                   |
| Подписанное согласие связано с exact hash и server time         | `database/2026-07-27_consent_proof_v2.sql`                       | insert triggers назначают registry hash и `accepted_at`; backfill отсутствует                         | ст. 9, 10 152-ФЗ; ст. 6, 9 63-ФЗ               | prepared, not deployed | P0 release gate | rollout + re-consent; health 2.0 отдельно после sign-off |
| Backend принимает только разрешённые версии всех согласий       | `database/2026-07-27_consent_proof_v2.sql`                       | весь payload валидируется до mutation, direct RPC отозван у runtime role                              | обязанность доказать конкретное согласие       | prepared, not deployed | P0 release gate | migration/API/web rollout                                |
| Landing marketing хранит отдельную версию/hash/server timestamp | `TrialForm.tsx`, `heys-api-leads/index.js`, новая migration      | browser передаёт только granted/version 1.3; hash/time назначает DB; conversion проверяет exact proof | ст. 15 152-ФЗ; ст. 18 Закона о рекламе         | prepared, not deployed | P0 release gate | coordinated rollout без backfill                         |

## 4. Audit matrix

| Приоритет | Контекст        | Было                                                     | Стало / решение                                                        |
| --------- | --------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| P0        | Возврат         | 14 дней, ограничения активностью, исключения             | отказ в любое время; только подтверждённые фактические расходы         |
| P0        | Отмена HEYS     | договор не гарантировал полный возврат                   | 100% текущего периода + сохранение права на убытки                     |
| P0        | Payment         | UI писал user agreement, backend ждал payment_oferta 1.3 | единый payment_oferta 1.7, exact backend gate, hash в metadata         |
| P0        | SpeechKit       | любая старая active version считалась действующей        | только speech 1.1 + client health 1.5                                  |
| P0        | Metrica         | Script и noscript загружались до выбора                  | только после versioned opt-in; reject оставляет сайт рабочим           |
| P0        | Privacy         | отрицала фактическое хранение media/transcripts          | раскрыты чат, Object Storage, SpeechKit, Telegram, Metrica и backups   |
| P1        | Cookie UX       | одна кнопка «Понятно»                                    | равноправные «Отклонить» / «Разрешить»                                 |
| P1        | Speech UX       | без полного документа и health warning                   | честная строка + ссылка; отказ не блокирует голосовое                  |
| P1        | SLA             | конфликтующие/слишком жёсткие обещания                   | ориентир первой реакции 1–2 часа и экстренный 112                      |
| P2        | Единый источник | ручные копии без hash gate                               | manifest с exact SHA-256 + tests; landing остаётся presentation mirror |

## 5. Redline документов

| Документ           | Было                                                            | Стало                                                                                               | Основание                       |
| ------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------- |
| User agreement 1.7 | 14 дней, лимит ответственности, подсудность HEYS, обратная сила | законный отказ/возврат, прозрачный trial, SLA, законная подсудность, без retroactive adverse change | ст. 16, 32 ЗоЗПП; ст. 782 ГК РФ |
| Refund 1.1         | тарифные запреты и «положительное решение» HEYS                 | однозначное заявление, 10 календарных дней, только доказанные расходы                               | ст. 32 ЗоЗПП                    |
| Privacy 1.7        | фото «не хранятся», нет SpeechKit/Metrica/media                 | фактические категории, получатели, локализация, retention caveats                                   | ст. 18.1 152-ФЗ                 |
| Cookie 1.1         | аналитика описана как уже работающая                            | script не загружается до opt-in, old marker не согласие                                             | ст. 9 152-ФЗ                    |
| Speech 1.1         | только короткая строка                                          | отдельный полный документ: категории, health warning, обработчик, действия, срок, отзыв             | ст. 9, 10 152-ФЗ                |

## 6. Version matrix и canonical hashes

Канонический машинно-проверяемый реестр:
`docs/legal/legal-document-manifest.json`.

| Contract                             | Версия | SHA-256                                                            |
| ------------------------------------ | -----: | ------------------------------------------------------------------ |
| user_agreement / payment_oferta      |    1.7 | `ba9011a7a4f9f283dbf11217ca36657c774d5b0eb98371e2b9c38e443deefb00` |
| personal_data                        |    1.7 | `30e0821966128f06d34d356b0fc1d87a7851c5d9f5d6df1b653bc3fc0b3e1317` |
| health_data immutable snapshot       |    1.5 | `a05365f23b7758deb1d6858d6816e7ee34fd5239c9d1fc84b2786c6027428256` |
| refund                               |    1.1 | `efed493603bfc88024ffb82ad6bf0e70b9f1c2a9d24cbd1ef518bbf70111ce70` |
| cookie_policy                        |    1.1 | `be1dd07df10d6fed174943c2db16ea3500069007988e87eb0d383f2ff4c164f5` |
| speech_transcription                 |    1.1 | `c95880e472cfe6237e0b99581f2e745cf775440a376f89ce96e39186e2d5edb8` |
| marketing                            |    1.3 | `8627a1daa46e20250ec9aeb4baa9a8d6053094cbb90a3d2f8466ffba02eefd43` |
| push_notifications                   |    1.0 | `a179b6e2e499d0bdd48538dd743168460bd143fc3b098a07ba816fdf9a7fd0de` |
| curator_access                       |    1.0 | `a3bca78a3bb0b86ce4993f9bd979694dcbe90a62cef417a544cf0daeb59feb91` |
| health_data 2.0 candidate (inactive) |    2.0 | `2ce834202b70f9b9413994e1301a868111dac1303ebf451e0a83349b5c61e39c` |

## 7. Проверки

| Проверка                                | Результат       |
| --------------------------------------- | --------------- |
| `consent-release-contract.test.js`      | 5/5             |
| `AnalyticsConsentGate.test.tsx`         | 3/3             |
| messenger contract                      | 8/8             |
| `pnpm payments:webhook-test`            | PASS, 3/3       |
| `pnpm privacy:marketing`                | PASS            |
| `pnpm docs:reference:check`             | PASS, 153 links |
| `pnpm pdn:monthly-audit`                | PASS, 69 checks |
| landing TypeScript `--noEmit`           | PASS            |
| `git diff --check` / diff secret scan   | PASS / CLEAN    |
| consent-proof contract + leads handler  | PASS, 12/12     |
| consent/web/trial gates                 | PASS, 25/25     |
| messenger hash/time gate                | PASS, 8/8       |
| source → migration → runtime bundle     | PASS            |
| managed migration/deploy gates          | PASS, 13/13     |
| PostgreSQL 15 consent/trial integration | PASS            |

Legacy bundle, production build, browser smoke, deploy, commit и push не
выполнялись по прямому ограничению handoff.

## 8. Legal decision log и release gates

1. **STOP — health 2.0 activation.** Redline-кандидат и hash подготовлены, но
   версия не входит в active allowlist. Нужны письменный sign-off по
   обязательным реквизитам и ПЭП/OTP, отдельная activation migration и
   re-consent.
2. **STOP — publication.** Source не опубликован: DB/backend/landing/web
   потребуют согласованного integration flow, deploy и production smoke по
   отдельной команде.
3. **STOP — migration first.** `2026-07-27_consent_proof_v2` зафиксирована как
   применённая migration № 9 и не переписывается. Переход user agreement и
   payment oferta на `1.8` выполняет отдельная forward-only migration № 11
   `2026-07-28_activate_user_agreement_v1_8`; frontend и backend deploy
   fail-closed, пока она pending. Server allowlist не даст сборке записать
   неопубликованную версию, а runtime bundle отдельно сверяется с manifest до
   upload.
4. **External sign-off.** Юрист РФ должен письменно утвердить health ПЭП-модель,
   обязательный состав health 2.0, retention/backups, Telegram cross-border
   disclosure и договорную модель возвратов. До массовой автоматизированной
   рекламной рассылки отдельно подтвердить допустимый способ отправки по части 2
   статьи 18 Закона о рекламе; наличие marketing consent само по себе этот
   operational gate не закрывает.

## 9. Изменённый source scope

- legal versions, agreement/refund/privacy/cookie/SpeechKit documents and
  immutable snapshots;
- payment frontend/backend exact version and payment metadata hash;
- SpeechKit backend exact-version/health gate and messenger disclosure;
- landing analytics consent gate, banner, legal pages and indexes;
- managed consent migration, frontend/backend migration gates and runtime bundle
  verification;
- targeted tests, legal manifest, monthly audit sync and this protocol.

Foreign preview-generated bundles from shared checkout остались нетронутыми.
