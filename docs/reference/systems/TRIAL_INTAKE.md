# Отбор кандидатов на пробную неделю

> **Статус:** production v2 опубликован; migration ledger и основной live-контур
> проверены 2026-07-28. Operator smoke 2026-07-29 подтвердил ownership UI-fix,
> но остановился fail-closed на `fresh_application_required`: старый
> Telegram-лид не содержит versioned privacy proof. Production остаётся красным
> до bot fix, повторного осознанного согласия и smoke до созданного клиента.
> **Охват:** landing handoff, consent, session/RPC boundary, encrypted storage,
> client/curator UI, decision gate, retention, DSAR и production smoke. Legal
> 1.8 активна, live legal drift проходит. **Не подтверждено/Не охвачено:**
> post-trial payment rollout; он не входит в контракт первого trial. Отдельное
> изменение РКН для этого flow не требуется: опубликованная запись №
> 26-22-005319 уже охватывает заявки/триалы, сопровождение и специальные данные
> о здоровье.

## Поток

```text
короткая заявка на лендинге
  → куратор: «Пригласить к анкете»
  → client со status=none + PIN, trial ещё не активен
  → универсальная ссылка /?intake=1 без PII и токена
  → PIN-сессия + отдельные user agreement / personal data / health consent
  → многошаговая анкета с server autosave
  → ручной разбор куратором
  → approved → существующий admin_activate_trial
```

## Данные и доступ

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

`not_invited → invited → in_progress → completed`. Куратор вручную переводит
завершённую анкету в `needs_clarification`, `approved` или `rejected`. Отказ
требует внутреннюю заметку и один из кодов: `out_of_scope`, `safety`,
`unrealistic_expectations`, `format_mismatch`, `no_capacity`,
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

Отдельный подтверждённый риск остаётся на серверной границе:
`admin_get_leads(p_status, p_curator_id)` принимает curator id, но действующая
SQL-реализация не использует его в `WHERE`. UI не показывает чужой `contacted`,
однако RPC-ответ всё ещё может содержать лишние lead rows. Server-side ownership
filter требует отдельной миграции и проверки до multi-curator rollout; текущий
UI-fix этот контракт не объявляет закрытым.

Полный UX/logic-контракт и stop conditions:
`docs/implementation/TRIAL_INTAKE_FLOW_V2_PROTOCOL.md`.

## Точки входа

| Область                                 | Источник                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| Схема, RPC, retention и activation gate | `database/2026-07-27_trial_intake_flow.sql`, `database/2026-07-27_trial_intake_flow_v2.sql` |
| Клиентская анкета                       | `apps/web/heys_trial_intake_v1.js`                                                          |
| Кураторский разбор и приглашение        | `apps/web/heys_trial_queue_v1.js`                                                           |
| Web auth/RPC dispatch                   | `apps/web/heys_yandex_api_v1.js`                                                            |
| Gate после авторизации и согласий       | `apps/web/heys_app_gate_flow_v1.js`                                                         |
| RPC allowlist/type hints                | `yandex-cloud-functions/heys-api-rpc/index.js`                                              |
| Health consent 1.5                      | `apps/web/public/docs/v1.5/health-data-consent.md`                                          |
| Daily retention invocation              | `yandex-cloud-functions/heys-maintenance/index.js`                                          |
| Data/RKN gate                           | `docs/legal/operator/heys-data-change-gate.md`                                              |

## Инварианты

1. Заявка и анкета не гарантируют пробную неделю.
2. Новая intake-запись должна быть `approved` до `admin_activate_trial`.
3. Health-поля нельзя сохранить без активного health consent 1.5.
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

## Подтверждённое production-состояние

- Managed migration ledger содержит trial intake v2 и legal 1.8; pending
  migrations отсутствуют. RPC и maintenance активны, web/landing trial-сборка
  опубликована.
- Первичный production smoke подтвердил существующую PIN-сессию, consent,
  autosave/resume, curator ownership/IDOR, approval/activation и revoke/purge;
  три синтетических клиента удалены.
- Legal 1.8 активна в production; live legal drift проходит.
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
| TI11 | Legal 1.8 активна, live legal drift проходит                                                                                       | live legal drift check + legal configs                                             | проверено 2026-07-28                               |
| TI12 | Stale autosave/review, pending purge и health revoke не обходят более свежее состояние или approval gate                           | `pnpm test:db:trial-intake`, `trial-intake-flow.test.js`                           | проверено локально 2026-07-27                      |
| TI13 | Convert→prepared атомарен; прямые convert/legacy review RPC недоступны runtime-ролям                                               | PostgreSQL integration privilege/ownership matrix                                  | проверено локально 2026-07-27                      |
| TI14 | Кураторский UI fail-closed при отсутствии summaries и показывает одно следующее действие                                           | static/UI contracts, 25/25                                                         | проверено локально 2026-07-27                      |
| TI15 | Intake UI показывает `new` и только закреплённые за текущим куратором `contacted`; без curator id скрывает `contacted` fail-closed | `trial-intake-flow.test.js`, 26/26 + operator smoke                                | проверено production 2026-07-29                    |
| TI16 | `admin_get_leads` получает `p_curator_id`, но SQL пока не ограничивает им возвращаемые lead rows                                   | `database/2026-03-02_fix_admin_get_leads_name.sql`                                 | подтверждённый риск 2026-07-29; server fix pending |
| TI17 | Лид без свежего privacy proof не создаёт клиента/`invite_prepared` и не даёт побочных дублей                                       | prepare RPC + operator smoke `fresh_application_required`                          | проверено production 2026-07-29; bot fix pending   |
