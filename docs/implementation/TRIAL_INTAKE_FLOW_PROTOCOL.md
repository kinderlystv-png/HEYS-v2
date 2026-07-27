# Протокол реализации: защищённая анкета перед пробной неделей

## Цель

Сохранить короткую заявку на лендинге и перенести сбор контекста и данных о
здоровье в защищённый клиентский flow после контакта с куратором.

## UI-гейт

Цель — безопасно довести подходящего кандидата до решения. Главное действие у
клиента — «Продолжить анкету», у куратора — «Пригласить к анкете» или действие
по готовой анкете. Первый слой показывает статус, краткую причину и одно
действие. Полные ответы и служебные детали находятся во втором слое. Отдельное
health-согласие, safety-флаги, отказ и активация триала не скрываются.

## Шаги

- [x] 1. Source/live-аудит контрактов и фиксация Facts Table.
- [x] 2. Landing и consent: короткая форма, отдельное ПДн-согласие, без
     автоматического health consent при конвертации.
- [x] 3. DB/RPC: versioned intake v1, client/curator ownership, encryption,
     consent gate, статусы и решения.
- [x] 4. UI: клиентская многошаговая анкета и кураторская карточка.
- [x] 5. Legal/reference docs, targeted tests, scoped bundle и local runtime.

## Решение

- Использовать существующую client session и curator ownership.
- Хранить health-ответы в отдельном зашифрованном intake-контракте, а не в
  `leads.notes`, URL, аналитике или localStorage.
- Валидировать versioned JSON на сервере и последовательно отправлять autosave,
  чтобы поздний черновик не откатывал шаг после перехода.
- Выполнять согласия и отзыв health-данных только через session-bound RPC;
  отзыв, purge и завершение сессий — одна транзакция.
- Не активировать trial при приглашении к анкете.
- Не принимать решение автоматически по медицинским ответам: система только
  поднимает safety-флаги, решение фиксирует куратор.
- Не создавать второй auth-контур в `apps/landing`.

## Риски и открытые вопросы

- В worktree уже есть отдельные изменения consent UI и его preview-бандлов; они
  сохраняются, scoped bundle будет собран из текущего состояния bundle scope.
- Новые категории анкеты требуют data-change gate и синхронизации health consent
  до production-релиза.

## Summary по крупным шагам

1. **Аудит:** подтверждены текущие landing payload, ложный перенос трёх согласий
   в `admin_convert_lead`, session/RPC boundary и encryption helpers.
2. **Данные:** добавлен отдельный `trial_intakes`; ответы и review note —
   encrypted-only, DSAR и удаление при отзыве health consent включены.
3. **Клиент:** шесть шагов, навигация назад, server autosave без browser
   storage, нейтральные финальные статусы.
4. **Куратор:** приглашение из лида, статусы, raw answers во втором слое, ручные
   `needs_clarification/approved/rejected`, структурированные причины.
5. **Legal:** health consent 1.5 и versioned snapshot готовы; data-change gate
   подтверждает, что отдельное изменение РКН не требуется: опубликованная запись
   уже охватывает заявки/триалы и специальные данные о здоровье.
6. **Retention:** 30-дневная очистка отклонённых intake подключена к
   существующему `daily_cleanup`; source готов, deploy не выполнялся.
7. **Security hardening:** закрыты legacy RPC с произвольным `client_id`;
   реальная migration проверена в изолированном PostgreSQL 15, включая IDOR,
   отзыв consent, selective purge и DSAR.
8. **Consent runtime:** production-схема принимает фактический метод `checkbox`;
   аутентифицированный контекст подтверждает session-bound RPC. Убран лишний
   enum `checkbox_after_auth`, который на localhost приводил к откату записи и
   повторному открытию consent gate.
9. **Production forward-fix:** smoke выявил, что ротация старого health consent
   ошибочно запускала purge intake на промежуточном `UPDATE`. Отложенный триггер
   теперь проверяет итог транзакции: version bump сохраняет приглашение, полный
   отзыв без активного health consent по-прежнему удаляет анкету.
10. **PgBouncer encryption gate:** RPC чтения/записи анкеты, curator review и
    DSAR выполняют `SET LOCAL heys.encryption_key` и сам SQL-вызов в одной
    транзакции. Trial-экран сообщает `BlankScreenGuard` о первом видимом кадре,
    поэтому защитный overlay не перекрывает уже отрисованную анкету. Пока этот
    route активен, app shell, профильный onboarding и остальные overlays не
    рендерятся поверх анкеты.

## Facts Table

| Утверждение                                                                                                       | Источник                                                                                   | Команда проверки                                        | Результат                                                         |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Landing trial-form отправлял user-agreement version вместе с privacy                                              | `apps/landing/src/components/TrialForm.tsx` до правки                                      | `git diff -- apps/landing/src/components/TrialForm.tsx` | подтверждено и исправлено                                         |
| Актуальный `admin_convert_lead` создавал `user_agreement`, `personal_data`, `health_data` с одной privacy version | `database/2026-06-19_fix_admin_convert_lead_curator_guard.sql` и live `pg_get_functiondef` | source/live read-only audit                             | подтверждено; новая migration переносит только personal/marketing |
| RPC gateway получает encryption key до SQL RPC                                                                    | `yandex-cloud-functions/heys-api-rpc/index.js`                                             | `rg -n 'heys.encryption_key' ...`                       | подтверждено                                                      |
| Сессии проверяются по hash, expiry и revoked_at                                                                   | `client_sessions` pattern и новая migration                                                | targeted contract test                                  | подтверждено                                                      |
| Universal intake URL не содержит credential или PII                                                               | `apps/web/heys_trial_queue_v1.js`, migration                                               | targeted contract test                                  | подтверждено                                                      |
| Ответы и заметка не имеют plaintext JSONB columns                                                                 | `database/2026-07-27_trial_intake_flow.sql`                                                | targeted contract test                                  | подтверждено                                                      |
| Новая активация требует `approved`, legacy без intake совместим                                                   | `admin_activate_trial` в новой migration                                                   | targeted contract test                                  | подтверждено                                                      |
| Health consent 1.5 имеет отдельный versioned snapshot                                                             | `apps/web/public/docs/v1.5/health-data-consent.md`                                         | `cmp` latest/snapshot                                   | подтверждено                                                      |
| Отдельное изменение РКН для intake не требуется                                                                   | `docs/legal/operator/rkn-notification-heys.md`, опубликованная запись № 26-22-005319       | source/legal review                                     | подтверждено; production blocker снят                             |
| Migration не только читается статически, но компилируется и выполняет ключевые контракты                          | `scripts/db/test-trial-intake-migration.mjs`                                               | `pnpm test:db:trial-intake`                             | подтверждено                                                      |
| Отзыв health consent не принимает `client_id` и атомарно удаляет health-KV/intake                                 | новая `revoke_consent_by_session`, RPC allowlist                                           | DB integration + targeted contract test                 | подтверждено                                                      |
| Реальный consent method совместим с действующим DB constraint                                                     | `heys_consents_v1.js`, `consents_signature_method_check`                                   | read-only production schema check + targeted tests      | `checkbox`, подтверждено                                          |

## Проверка

- [x] Targeted landing, SQL/RPC, consent, ownership, encryption, blank-screen
      guard и UI tests: 7 файлов, 69 тестов.
- [x] Реальная migration в изолированном PostgreSQL 15:
      `pnpm test:db:trial-intake`.
- [x] Landing TypeScript:
      `pnpm exec tsc -p apps/landing/tsconfig.json --noEmit`.
- [x] `pnpm pdn:monthly-audit`: версии, snapshots, data register и покрытие
      действующей записью РКН проверены; внешнего blocker по intake нет.
- [x] `pnpm docs:reference:check`: 153 ссылки, 18 паспортов.
- [x] `pnpm bundle:legacy:auto --files=<source-файлы задачи>`: selective rebuild
      без staging; финальные preview hashes: `boot-app=d5de100c70cb`,
      `boot-core=1f000787d9bb`, `postboot-1-game-lazy=8df53f15adc9`.
- [x] Существующий `pnpm dev:local`: web и API отвечают `200` на
      `http://localhost:3001` и `http://localhost:4001/health`.

## Production rollout — подготовлен, не выполнен

Rollout выполняется только после отдельной прямой команды на migration/deploy.
Каждый этап имеет stop-gate: при ошибке следующий слой не публикуется.

| №   | Этап                    | Действие после разрешения                                                                                                                                                                | Stop-gate перед продолжением                                                                                                                                                             |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Preflight               | Зафиксировать точный source/commit scope, отсутствие секретов и повторить `pnpm test:db:trial-intake`, trial-intake/consent tests, `pnpm pdn:monthly-audit`, `pnpm docs:reference:check` | Все проверки зелёные; версии `user_agreement=1.6`, `personal_data=1.6`, `health_data=1.5`; production backup/доступ к БД подтверждены                                                    |
| 1   | Migration               | `bash scripts/db/psql.sh -v ON_ERROR_STOP=1 -f database/2026-07-27_trial_intake_flow.sql`                                                                                                | `trial_intakes` и функции существуют; grants/revokes совпадают с migration; существующий клиент без intake сохраняет legacy activation path                                              |
| 2   | RPC + maintenance       | `cd yandex-cloud-functions && ./deploy-all.sh heys-api-rpc heys-maintenance`                                                                                                             | Обе версии активны и health-check зелёный; новые client RPC доступны только по PIN-session, curator RPC — только по JWT/ownership; `daily_cleanup` видит `purge_expired_trial_intakes()` |
| 3   | Web + landing           | Выполнить штатный разрешённый integration/release flow и production deploy web/landing                                                                                                   | Production build-meta указывает разрешённый commit; landing отправляет только простую заявку без health/user-agreement; app загружает актуальные bundles без blank-screen guard          |
| 4   | Существующая PIN-сессия | На выделенном синтетическом клиенте со старыми consent versions открыть уже сохранённую сессию                                                                                           | Открывается re-consent, а не login/ошибка; приложение не создаёт согласия автоматически; повторное открытие consent gate отсутствует                                                     |
| 5   | Consent 1.5             | Принять обязательные `1.6/1.6/1.5` отдельными действиями                                                                                                                                 | В proof сохранены точные version, server time, IP, User-Agent и фактический `signature_method=checkbox`; intake write до health 1.5 отклоняется, после — разрешён                        |
| 6   | Autosave/resume         | Пригласить синтетического клиента, заполнить часть анкеты, перезагрузить, продолжить и завершить                                                                                         | URL не содержит PII/token; draft восстановлен с сервера, browser storage пуст; статус проходит `invited → in_progress → completed`                                                       |
| 7   | Curator ownership       | Прочитать карточку назначенным куратором и повторить запрос другим curator/client identity                                                                                               | Владелец видит summary/details и audit entry; чужой куратор/клиент получает `forbidden`/свои данные, без IDOR и утечки raw answers                                                       |
| 8   | Approval + activation   | До решения проверить блокировку активации, затем `approved`, выбрать дату и активировать trial                                                                                           | До approval — `intake_not_approved`; после — trial/trial_pending и queue `assigned`; approval и activation остаются двумя отдельными действиями                                          |
| 9   | Revoke + purge          | На отдельных синтетических fixtures проверить health revoke и rejected TTL cleanup                                                                                                       | Revoke атомарно удаляет health-KV/intake и завершает сессии; purge удаляет только rejected intake с истёкшим `retention_delete_at`; fixtures и временные записи очищены                  |

### Rollback/forward-fix границы

- Migration аддитивна по таблице, но заменяет рабочие функции и отзывает legacy
  consent/purge grants; автоматического down-migration нет.
- До web/landing deploy ошибка migration или backend останавливает rollout.
- После migration откат frontend/backend допустим только на версию, совместимую
  с session-bound consent RPC; саму таблицу не удалять в аварийном порядке. Для
  SQL-дефекта использовать forward-fix migration.
- Любой IDOR, plaintext health-data, consent loop, ошибочная активация до
  approval или неатомарный revoke — немедленный STOP без перехода к следующему
  этапу.
