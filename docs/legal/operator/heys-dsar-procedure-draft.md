# HEYS · Draft DSAR procedure

Статус: technical/legal draft. Codex-часть строки `7.10` закрыта: процесс, SLA,
owner, evidence, self-service RPC/UI, ручной runbook и safe journal template
описаны. Перед публичным использованием нужен юридический sign-off.

## Какие запросы покрываем

| Тип запроса           | Что делает HEYS                                                  | SLA draft                               |
| --------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| Доступ к данным       | подтверждает личность и отдаёт копию данных клиента              | до 10 рабочих дней                      |
| Уточнение             | исправляет некорректные ПДн или просит клиента исправить их в UI | до 10 рабочих дней                      |
| Отзыв согласия        | прекращает обработку выбранной категории данных                  | до 10 рабочих дней                      |
| Удаление              | удаляет аккаунт/health-data и запускает cleanup S3 photos        | до 10 рабочих дней + S3 grace до 7 дней |
| Ограничение обработки | блокирует спорную обработку до выяснения                         | до 3 рабочих дней                       |

## Intake

1. Канал запроса: `privacy@heyslab.ru` или Telegram/service chat, если identity
   можно подтвердить.
2. Владелец приема: ИП Поплавский Антон Сергеевич до делегирования privacy
   owner.
3. Запрос получает внутренний ID формата `DSAR-YYYY-MM-NN`.
4. Фактический журнал DSAR хранится вне репо; repo-safe шаблон:
   [heys-dsar-request-log-template.md](heys-dsar-request-log-template.md).

## Identity check

| Сценарий                        | Проверка                                                         |
| ------------------------------- | ---------------------------------------------------------------- |
| Клиент с активным доступом      | вход по PIN/session + подтверждение телефона при необходимости   |
| Клиент без активной сессии      | phone OTP или другой согласованный канал, привязанный к аккаунту |
| Запрос от третьего лица         | не выполнять без доверенности/подтверждения полномочий           |
| Невозможно подтвердить личность | запрос отклонить с нейтральным объяснением                       |

## Runbook: access export

Self-service путь уже есть: `export_my_data_by_session` открыт в `heys-api-rpc`
allowlist, логирует `log_data_access('client_self', ...)`, а UI кнопка «Скачать
мои данные» вызывает этот путь из user profile. Ручной runbook ниже нужен для
operator fallback, спорного запроса или проверки внешним reviewer'ом.

1. Найти `client_id` по подтверждённому телефону/session.
2. Экспортировать account data: `clients`, `consents`, `subscriptions`,
   `payments`, `trial_queue`.
3. Экспортировать `client_kv_store` keys клиента, включая `heys_profile`,
   `heys_dayv2_*`, `heys_hr_zones`.
4. Собрать список фото из day records; выдавать не публичные permanent URLs, а
   временные ссылки или архив по безопасному каналу.
5. Сформировать zip/json, проверить отсутствие данных других клиентов.
6. Записать в DSAR-журнал: дата, тип, исполнитель, способ передачи, checksum.

## Runbook: deletion

1. Подтвердить, что нет активного спора/обязанности сохранить бухгалтерский
   минимум по платежам.
2. Выполнить deletion через утверждённую product/RPC процедуру; ручной SQL
   `DELETE FROM clients` допустим только как break-glass с записью причины.
3. Проверить cascade tables: `client_kv_store`, `client_sessions`, `consents`,
   `client_messages`, `subscriptions`, `payments`, `push_subscriptions`.
4. Проверить, что `leads`/`funnel_events` обезличены через `SET NULL`.
5. Проверить S3 cleanup: prefix `heys-photos/<client_id>/` попал в
   `photo_cleanup_log`; после grace объект удалён при `DRY_RUN=0`.
6. Отправить субъекту подтверждение выполнения без раскрытия внутренних
   технических деталей.

## Evidence template

| Поле                    | Значение                                                  |
| ----------------------- | --------------------------------------------------------- |
| DSAR ID                 |                                                           |
| Дата запроса            |                                                           |
| Тип запроса             | access / correction / withdrawal / deletion / restriction |
| Канал                   |                                                           |
| Identity check          |                                                           |
| Client ID               |                                                           |
| Исполнитель             |                                                           |
| Выполненные действия    |                                                           |
| Файлы/evidence вне репо |                                                           |
| Дата ответа субъекту    |                                                           |
| Закрыто                 | да / нет                                                  |

Полный журнал вести по
[heys-dsar-request-log-template.md](heys-dsar-request-log-template.md); сюда не
копировать реальные строки с ПДн.

## Product gaps before automation

| Gap                                   | Почему не блокирует draft                                                 | Следующий технический шаг                                       |
| ------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Operator-side disputed export         | self-service `export_my_data_by_session` уже есть; ручной fallback описан | отдельный operator script/RPC только после первых реальных DSAR |
| S3 cleanup пока safety-first          | есть deployed cron с `DRY_RUN=1` и log                                    | после наблюдения включить `DRY_RUN=0`                           |
| Нет отдельного privacy mailbox в коде | intake можно вести вручную                                                | создать alias и внести в privacy docs                           |
