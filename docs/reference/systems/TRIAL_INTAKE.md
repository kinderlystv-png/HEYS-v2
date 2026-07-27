# Отбор кандидатов на пробную неделю

> **Статус:** source-контракт реализован 2026-07-27. **Охват:** landing handoff,
> consent, session/RPC boundary, encrypted storage, client/curator UI, decision
> gate, retention и DSAR. **Не подтверждено/Не охвачено:** применение миграции,
> deploy RPC/web/landing/maintenance и production runtime. Отдельное изменение
> РКН для этого flow не требуется: опубликованная запись № 26-22-005319 уже
> охватывает заявки/триалы, сопровождение и специальные данные о здоровье.

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

## Точки входа

| Область                                 | Источник                                           |
| --------------------------------------- | -------------------------------------------------- |
| Схема, RPC, retention и activation gate | `database/2026-07-27_trial_intake_flow.sql`        |
| Клиентская анкета                       | `apps/web/heys_trial_intake_v1.js`                 |
| Кураторский разбор и приглашение        | `apps/web/heys_trial_queue_v1.js`                  |
| Gate после авторизации и согласий       | `apps/web/heys_app_gate_flow_v1.js`                |
| RPC allowlist/type hints                | `yandex-cloud-functions/heys-api-rpc/index.js`     |
| Health consent 1.5                      | `apps/web/public/docs/v1.5/health-data-consent.md` |
| Daily retention invocation              | `yandex-cloud-functions/heys-maintenance/index.js` |
| Data/RKN gate                           | `docs/legal/operator/heys-data-change-gate.md`     |

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

## Не подтверждено/Не охвачено

- Миграция и изменённые функции не применялись к production БД.
- RPC, web и landing не публиковались; production smoke не выполнялся.
- Daily maintenance source вызывает `purge_expired_trial_intakes()`, но
  изменённая функция не публиковалась и production-вызов не подтверждён.
- Data-change gate пройден: intake не меняет опубликованные цели, категории
  субъектов/данных, получателей, способы обработки или трансграничную передачу.

## Facts Table

| ID  | Утверждение                                                                                                                     | Проверка                                                                           | Статус               |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------- |
| TI1 | Landing не собирает health-данные и не передаёт health consent                                                                  | `trial-intake-flow.test.js`: landing contract                                      | проверено 2026-07-27 |
| TI2 | Intake URL универсален и не содержит client id, телефона или токена                                                             | `trial-intake-flow.test.js`: invite URL contract                                   | проверено 2026-07-27 |
| TI3 | Клиентские RPC требуют живую сессию и отдельный health consent 1.5                                                              | `trial-intake-flow.test.js`: session/consent contract                              | проверено 2026-07-27 |
| TI4 | Ответы и служебная заметка сохраняются только в encrypted columns                                                               | `trial-intake-flow.test.js`: encrypted storage contract                            | проверено 2026-07-27 |
| TI5 | Новую пробную неделю нельзя активировать до ручного `approved`                                                                  | `trial-intake-flow.test.js`: activation gate contract                              | проверено 2026-07-27 |
| TI6 | Версии health consent синхронизированы между web, landing и public docs                                                         | `pnpm pdn:monthly-audit`                                                           | проверено 2026-07-27 |
| TI7 | Существующий daily maintenance вызывает 30-дневную очистку intake                                                               | `trial-intake-flow.test.js`: retention invocation contract                         | проверено 2026-07-27 |
| TI8 | Реальная migration компилируется и исполняет session/consent/ownership/encryption/decision/purge/DSAR контракты в PostgreSQL 15 | `pnpm test:db:trial-intake`                                                        | проверено 2026-07-27 |
| TI9 | Прямые consent/purge RPC по `client_id` недоступны публичному gateway и `heys_rpc`                                              | `trial-intake-flow.test.js`, `pnpm test:db:trial-intake`, `pnpm pdn:monthly-audit` | проверено 2026-07-27 |
