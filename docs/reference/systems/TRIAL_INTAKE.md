# Отбор кандидатов на пробную неделю

> **Статус:** production v2 опубликован; локально подготовлены v3 и следующий
> forward-only контракт коррекций ответов, в которых анкета заполняется до
> создания client account. v3 ещё не применён и не опубликован, поэтому
> production-статус остаётся красным до deploy и нового live-smoke. Migration
> ledger и основной live-контур проверены 2026-07-28. Operator smoke 2026-07-29
> подтвердил ownership UI-fix, но остановился fail-closed на
> `fresh_application_required`: старый Telegram-лид не содержал versioned
> privacy proof. Bot fix опубликован; smoke подтвердил показ policy 1.7 и
> registry-backed proof после контакта без дубля лида/handoff. Повторный prepare
> выявил DB ACL blocker: владелец entry point `heys_admin` не мог вызвать
> вложенный `admin_convert_lead`. Ошибка откатилась полностью. Forward migration
> №12 восстановила owner-only вызов и сохранила запрет для gateway/public;
> rollback-only smoke зелёный. Production остаётся красным до ручного smoke с
> фактически созданным клиентом. **Охват:** landing handoff, consent,
> session/RPC boundary, encrypted storage, client/curator UI, decision gate,
> retention, DSAR и production smoke. Legal 1.8 активна в production; source 1.9
> и forward migration подготовлены локально, rollout не выполнялся. **Не
> подтверждено/Не охвачено:** post-trial payment rollout; он не входит в
> контракт первого trial. Отдельное изменение РКН для этого flow не требуется:
> опубликованная запись № 26-22-005319 уже охватывает заявки/триалы,
> сопровождение и специальные данные о здоровье.

## Поток

```text
короткая заявка на лендинге
  → куратор: «Создать приглашение»
  → trial_candidate + отдельный PIN, client ещё не существует
  → универсальная ссылка /?intake=1 без PII и токена
  → отдельная candidate-сессия + действующий health consent 1.5
  → многошаговая анкета с server autosave
  → ручной разбор куратором; вопросы обсуждаются лично
  → при необходимости append-only корректировка рядом с исходным ответом
  → approved → создание client + перенос эффективной версии анкеты + клиентский PIN
  → отдельное принятие клиентских consent-документов после первого входа
  → позже существующий admin_activate_trial
```

Approval заканчивается созданием аккаунта и PIN. Он не выбирает дату и не
расходует пробную неделю: `admin_activate_trial` вызывается отдельно из
кураторского управления подпиской.

## Данные и доступ

В v3 новые заявки хранятся в `trial_candidates`, а ответы — в
`answers_encrypted`. Отдельные candidate sessions, consents и audit events не
дают временной анкете притворяться клиентским аккаунтом. `clients`,
`client_sessions`, `trial_intakes` и `trial_queue` до решения `approved` не
создаются. Candidate health proof остаётся в отдельном ledger и не становится
клиентским согласием автоматически. Старые client-backed анкеты продолжают
обслуживаться прежними RPC.

Локальный forward-only контракт хранит кураторские корректировки в отдельном
зашифрованном append-only ledger. Исходная анкета кандидата не изменяется;
кураторский экран получает исходные ответы, эффективную версию и историю с
автором, временем, каналом общения и основанием. Для полей здоровья и
безопасности требуется отдельное подтверждение обсуждения. При одобрении в
клиентскую анкету переносится эффективная версия, а DSAR включает и оригинал, и
историю корректировок.

`trial_intakes` хранит открыто только workflow metadata: client/curator, версию
схемы, статус, текущий шаг и даты. Все ответы и внутренняя заметка куратора
шифруются через `encrypt_health_data()` в `bytea`. Клиентские RPC получают
`client_id` только из живой `client_sessions`; кураторские RPC каждый раз
проверяют `clients.curator_id`. Чтение и запись попадают в
`data_access_audit_log` как health-data.

Ответы не попадают в URL, localStorage/sessionStorage, Telegram-уведомление,
funnel metadata или аналитику. При отзыве health consent анкета удаляется; при
отказе задаётся срок удаления 30 дней, который обслуживает
`purge_expired_trial_intakes()`. DSAR export включает расшифрованную анкету.

Отзыв health consent выполняется атомарно через `revoke_consent_by_session`:
сервер получает владельца только из живой сессии, отзывает согласие, удаляет
health-KV и intake, затем завершает сессии. Старые публичные RPC с произвольным
`client_id` (`log_consents`, `revoke_consent`, `purge_health_data` и связанные
read/check методы) исключены из gateway и у роли `heys_rpc` отозвано право
исполнения.

Ротация устаревшей версии `health_data` на новую активную версию не считается
отзывом: purge-триггер отложен до конца транзакции и удаляет intake только если
активного health consent больше не осталось.

Так как production PostgreSQL доступен через transaction-pooling PgBouncer, ключ
расшифровки и вызов encrypted trial RPC устанавливаются одной транзакцией через
`SET LOCAL`; отдельный session-level `SET` для этих методов запрещён. Маршрут
`?intake=1` после прохождения consent gate является эксклюзивным: обычный app
shell и его onboarding-overlays не конкурируют с анкетой за фокус.

## Статусы и решение

Для нового UI:
`invite_prepared → invite_sent → in_progress → completed → rejected | promoted`.
Вопросы не создают отдельную ветку: куратор связывается с кандидатом лично и при
необходимости фиксирует подтверждённую корректировку. Только `approved` вызывает
`admin_convert_lead`; место и дата старта решаются после создания клиента.
Повторный review закрыт optimistic lock, статусом и идемпотентным результатом.
Legacy-статусы `needs_clarification` и `approved_waiting_slot` остаются
читаемыми и могут быть завершены новым RPC.

В legacy v2 действует `not_invited → invited → in_progress → completed`. Куратор
вручную переводит завершённую анкету в `needs_clarification`, `approved` или
`rejected`. Отказ требует внутреннюю заметку и один из кодов: `out_of_scope`,
`safety`, `unrealistic_expectations`, `format_mismatch`, `no_capacity`,
`candidate_withdrew`. Клиент не видит внутренний код или заметку и получает
нейтральный текст. Флаги безопасности подсвечиваются куратору, но не запускают
диагноз или автоматический отказ.

### Production v2

Migration `2026-07-27_trial_intake_flow_v2.sql` вводит
`invite_prepared → invite_sent`, клиент-видимый зашифрованный запрос уточнений,
обязательные явные safety-ответы схемы `1.1` и `approved_waiting_slot`.
Неактивные приглашения/черновики/уточнения получают 30-дневный TTL; повторная
заявка после 30 дней переиспользует существующего client, очищает прежний intake
и отзывает старые сессии.

Финальный pre-release hardening v2 закрывает конкурентные и аварийные сценарии:
`admin_prepare_trial_candidate_from_lead` атомарно выполняет convert→invite
prepared и проверяет владельца lead; прямой convert и legacy review отозваны у
runtime-ролей. Client autosave и curator review используют optimistic token
`updated_at`, поэтому старая вкладка не перезаписывает свежий черновик,
уточнение или решение.

Черновой autosave ответа на уточнение сохраняет статус `needs_clarification`,
поэтому вопрос и отмеченные разделы остаются видимыми до финальной отправки.
После purge чувствительная intake-запись удаляется, а запись очереди становится
техническим `canceled`-маркером `trial_intake_purged`: это не даёт активировать
очищенного кандидата через legacy-путь. Закрытое окно подготовленного
приглашения восстанавливается из карточки с перевыпуском PIN и отзывом старых
сессий.

Настоящий отзыв health consent также оставляет
`canceled/trial_intake_health_revoked`; оба tombstone блокируют legacy
activation. Переходы
prepare/sent/read/save/review/activation/reopen/revoke/purge образуют audit
chronology без содержимого анкеты, PIN, токенов, вопроса клиенту или внутренней
заметки. Кураторский экран загружает intake summaries fail-closed, показывает
владельца следующего шага и не даёт активировать `approved_waiting_slot`, пока
свободных мест нет.

Operator UI обязан сохранять тот же ownership-контракт до вызова RPC: новые лиды
остаются в общей очереди, а `contacted` виден только назначенному куратору. Без
достоверного `curatorId` UI скрывает все `contacted` fail-closed. Этот контракт
подтверждён production smoke 2026-07-29.

Prepare RPC отдельно проверяет свежесть заявки: отсутствие `consent_accepted_at`
возвращает `fresh_application_required` до создания клиента и `invite_prepared`.
Личная проверка 2026-07-29 подтвердила эту границу и отсутствие побочных дублей.
Для Telegram-пути proof можно записывать только после явного показа действующей
политики и нового действия пользователя.

Локальная v3-миграция закрывает серверную границу ownership:
`admin_get_leads(p_status, p_curator_id)` возвращает `contacted` только
назначенному куратору. До применения v3 в production этот контракт считается
подготовленным локально, но не опубликованным.

Полный UX/logic-контракт и stop conditions:
`docs/implementation/TRIAL_INTAKE_FLOW_V2_PROTOCOL.md`.

## Точки входа

| Область                                 | Источник                                                                                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Схема, RPC, retention и activation gate | `database/2026-07-27_trial_intake_flow.sql`, `database/2026-07-27_trial_intake_flow_v2.sql`, `scripts/db/migrations/2026-07-29_trial_intake_preclient_v3.sql`, `scripts/db/migrations/2026-07-30_trial_candidate_answer_corrections_v1.sql` |
| Клиентская анкета                       | `apps/web/heys_trial_intake_v1.js`                                                                                                                                                                                                          |
| Кураторский разбор и приглашение        | `apps/web/heys_trial_queue_v1.js`                                                                                                                                                                                                           |
| Web auth/RPC dispatch                   | `apps/web/heys_yandex_api_v1.js`                                                                                                                                                                                                            |
| Gate после авторизации и согласий       | `apps/web/heys_app_gate_flow_v1.js`                                                                                                                                                                                                         |
| RPC allowlist/type hints                | `yandex-cloud-functions/heys-api-rpc/index.js`                                                                                                                                                                                              |
| Health consent 1.5                      | `apps/web/public/docs/v1.5/health-data-consent.md`                                                                                                                                                                                          |
| Daily retention invocation              | `yandex-cloud-functions/heys-maintenance/index.js`                                                                                                                                                                                          |
| Data/RKN gate                           | `docs/legal/operator/heys-data-change-gate.md`                                                                                                                                                                                              |

## Инварианты

1. Заявка и анкета не гарантируют пробную неделю.
2. Новая intake-запись должна быть `approved` до `admin_activate_trial`.
3. Candidate health-поля нельзя сохранить без действующего health consent 1.5;
   неактивный draft 2.0 этому flow не показывается и не принимается.
4. Ссылка не является credential: доступ определяется только живой сессией.
5. Решение принимает человек; клиенту не раскрываются внутренние причины.
6. Legacy-клиенты без intake сохраняют прежний путь активации.
7. Intake v1 принимает только известные секции, поля, типы и enum-значения;
   завершение требует все обязательные ответы.
8. `signature_method` хранит фактическое действие `checkbox`; доказательство,
   что оно совершено после входа, обеспечивают session-bound RPC, client id,
   время, серверные IP и User-Agent.
9. `invite_prepared` не разрешает заполнение; клиент начинает только после
   явного `invite_sent` (legacy `invited` поддерживается на переходный период).
10. Stale client/curator write отклоняется до изменения encrypted payload.
11. Intake-managed кандидата нельзя удалить старым queue RPC; purge/revoke
    обязаны оставить activation-blocking tombstone.
12. До `approved` у нового кандидата нет строки `clients`, клиентской сессии или
    записи `trial_queue`; личное уточнение и отказ аккаунт не создают.
13. Кураторская корректировка не перезаписывает исходную анкету: новая версия
    добавляется в зашифрованную историю, а safety-поле требует отдельного
    подтверждения.

## Подтверждённое production-состояние

- Managed migration ledger содержит trial intake v2 и legal 1.8; pending
  migrations отсутствуют. RPC и maintenance активны, web/landing trial-сборка
  опубликована.
- Первичный production smoke подтвердил существующую PIN-сессию, consent,
  autosave/resume, curator ownership/IDOR, approval/activation и revoke/purge;
  три синтетических клиента удалены.
- Legal 1.8 активна в production; live legal drift проходит.
- Source legal 1.9 и migration №14 подготовлены 2026-07-29; они не применены и
  не меняют приведённое выше production-состояние.
- Data-change gate пройден: intake не меняет опубликованные цели, категории
  субъектов/данных, получателей, способы обработки или трансграничную передачу.
- Operator smoke 2026-07-29 подтвердил исправленный ownership filter, затем
  штатно остановил старый Telegram-лид с `fresh_application_required`. Клиент,
  `invite_prepared` и повторное уведомление не созданы.

## Facts Table

| ID   | Утверждение                                                                                                                        | Проверка                                                                           | Статус                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| TI1  | Landing не собирает health-данные и не передаёт health consent                                                                     | `trial-intake-flow.test.js`: landing contract                                      | проверено 2026-07-27                               |
| TI2  | Intake URL универсален и не содержит client id, телефона или токена                                                                | `trial-intake-flow.test.js`: invite URL contract                                   | проверено 2026-07-27                               |
| TI3  | Клиентские RPC требуют живую сессию и отдельный health consent 1.5                                                                 | `trial-intake-flow.test.js`: session/consent contract                              | проверено 2026-07-27                               |
| TI4  | Ответы и служебная заметка сохраняются только в encrypted columns                                                                  | `trial-intake-flow.test.js`: encrypted storage contract                            | проверено 2026-07-27                               |
| TI5  | Новую пробную неделю нельзя активировать до ручного `approved`                                                                     | `trial-intake-flow.test.js`: activation gate contract                              | проверено 2026-07-27                               |
| TI6  | Версии health consent синхронизированы между web, landing и public docs                                                            | `pnpm pdn:monthly-audit`                                                           | проверено 2026-07-27                               |
| TI7  | Существующий daily maintenance вызывает 30-дневную очистку intake                                                                  | `trial-intake-flow.test.js`: retention invocation contract                         | проверено 2026-07-27                               |
| TI8  | Реальная migration компилируется и исполняет session/consent/ownership/encryption/decision/purge/DSAR контракты в PostgreSQL 15    | `pnpm test:db:trial-intake`                                                        | проверено 2026-07-27                               |
| TI9  | Прямые consent/purge RPC по `client_id` недоступны публичному gateway и `heys_rpc`                                                 | `trial-intake-flow.test.js`, `pnpm test:db:trial-intake`, `pnpm pdn:monthly-audit` | проверено 2026-07-27                               |
| TI10 | Production rollout v2 и полный synthetic smoke завершены; fixtures удалены                                                         | release-task evidence + managed migration ledger                                   | проверено 2026-07-28                               |
| TI11 | Production legal 1.8 активна; source 1.9 и re-consent migration подготовлены, но не опубликованы                                   | live legal drift check + legal configs + migration №14                             | source обновлён 2026-07-29; rollout не выполнялся  |
| TI12 | Stale autosave/review, pending purge и health revoke не обходят более свежее состояние или approval gate                           | `pnpm test:db:trial-intake`, `trial-intake-flow.test.js`                           | проверено локально 2026-07-27                      |
| TI13 | Convert→prepared атомарен; прямые convert/legacy review RPC недоступны runtime-ролям                                               | PostgreSQL integration privilege/ownership matrix                                  | проверено локально 2026-07-27                      |
| TI14 | Кураторский UI fail-closed при отсутствии summaries и показывает одно следующее действие                                           | static/UI contracts, 25/25                                                         | проверено локально 2026-07-27                      |
| TI15 | Intake UI показывает `new` и только закреплённые за текущим куратором `contacted`; без curator id скрывает `contacted` fail-closed | `trial-intake-flow.test.js`, 26/26 + operator smoke                                | проверено production 2026-07-29                    |
| TI16 | v3 ограничивает `contacted` lead rows назначенным куратором на серверной границе                                                   | v3 migration + `trial-intake-flow.test.js`                                         | проверено локально 2026-07-29; production pending  |
| TI17 | Лид без свежего privacy proof не создаёт клиента/`invite_prepared` и не даёт побочных дублей                                       | prepare RPC + operator smoke `fresh_application_required`; повторный bot/DB smoke  | bot proof green 2026-07-29                         |
| TI18 | SECURITY DEFINER prepare entry point должен иметь внутренний `EXECUTE` на закрытый для gateway `admin_convert_lead`                | migration №12 + production ACL introspection + rollback-only prepare               | ✅ owner=true, gateway/public=false, prepare green |
| TI19 | Prepare, перевыпуск candidate PIN и ожидание места не создают client/queue; approval создаёт ровно по одной строке                 | PostgreSQL v3 integration + 27 UI/contract tests                                   | проверено локально 2026-07-29; production pending  |
| TI20 | Верхняя «Очередь» показывает тот же actionable-счётчик, что внутренний таб «Лиды»: `new` + свой `contacted` без candidate intake   | `trial-intake-flow.test.js`, 29/29 + operator smoke                                | local UI green 2026-07-30 01:16 MSK; prod pending  |
| TI21 | Новый review UI имеет только одобрение с созданием клиента и отказ; личное уточнение не является отдельным статусом                | `trial-intake-flow.test.js`, `admin_review_trial_candidate_v4`                     | подготовлено локально 2026-07-30; rollout pending  |
| TI22 | `daily_tracking=unsure` проходит server validation/save/read, а коррекция хранит original/effective/history без перезаписи         | `pnpm test:db:trial-intake`, `trial-intake-flow.test.js`                           | проверено локально 2026-07-30; rollout pending     |
| TI23 | Approval создаёт аккаунт/PIN без trial; дату старта куратор задаёт отдельно в управлении подпиской                                 | `trial-intake-flow.test.js`, `trial-prestart-access-contract.test.js`              | проверено локально 2026-07-30; rollout pending     |
