# HEYS · Draft retention rules for PII and audit data

Статус: technical/legal draft. Codex-часть закрыта: таблицы, S3-объекты, сроки,
owner и evidence перечислены. Перед включением в публичные документы нужен
юридический sign-off.

## Scope

Документ покрывает строки `7.8` и L6 retention из
`маркетинг/22_План_реализации_маркетинга.md`: `data_access_audit_log`,
`data_loss_audit`, `security_events`, `client_messages`, photos в S3 и связанные
таблицы ПДн.

## Retention matrix

| Класс данных             | Где хранится                                                        | Срок хранения                                                                              | Действие по окончании срока                                                     | Evidence                        |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------- |
| Аккаунт клиента          | `clients`                                                           | до удаления аккаунта или отзыва согласия                                                   | удалить row; дочерние таблицы уходят по FK cascade                              | DSAR/deletion ticket + DB audit |
| Health-дневник и профиль | `client_kv_store` (`heys_profile`, `heys_dayv2_*`, `heys_hr_zones`) | до удаления аккаунта или отзыва `health_data`                                              | удалить через `clients` cascade или `purge_health_data`                         | consent/revocation proof        |
| Согласия                 | `consents`                                                          | 5 лет после отзыва или спорного события                                                    | оставить минимальный proof без health payload                                   | consent proof export            |
| Платежи                  | `payments`, YooKassa                                                | 5 лет после операции                                                                       | сохранить бухгалтерский минимум; health/curator context не хранить              | payment register                |
| Лиды                     | `leads`                                                             | 2 года после первого контакта или до отзыва                                                | обезличить/удалить контактные поля; funnel оставить без `client_id`             | monthly audit                   |
| Воронка                  | `funnel_events`                                                     | 2 года                                                                                     | хранить только агрегируемые события; без ПДн и health-values                    | weekly funnel report            |
| Access audit             | `data_access_audit_log`                                             | 3 года                                                                                     | архивировать или удалять batch job                                              | quarterly security review       |
| Data-loss/security audit | `data_loss_audit`, `security_events`                                | 1 год                                                                                      | удалять/архивировать с сохранением агрегатов по инцидентам                      | quarterly security review       |
| Messages                 | `client_messages`                                                   | до удаления аккаунта; для поддержки — не дольше 1 года после закрытия обращения            | cascade-delete; спорные обращения экспортировать в incident/legal file вне репо | support/incident ticket         |
| Debug trace              | `client_log_trace`, browser debug events                            | 30 дней                                                                                    | auto-delete                                                                     | ops log                         |
| Фото еды                 | S3 `heys-photos/<client_id>/...`                                    | пока активен клиент; orphan после удаления клиента удалять cron-cleanup после grace 7 дней | `heys-cron-photo-cleanup`; после dry-run включить real delete                   | `photo_cleanup_log`             |
| Backups                  | S3 `heys-backups/client-daily/...`                                  | 90 дней hot/cold baseline; longer archive только после legal sign-off                      | lifecycle policy или batch delete                                               | backup run log                  |

## Operational rules

1. Новое поле ПДн не проходит release без строки в `heys-data-register.md` и
   проверки retention в этом документе.
2. Новая интеграция не получает health-values в metadata, URL params, Telegram
   notifications или payment metadata.
3. Audit-логи не удаляются вручную из-за неудобного события; исправление идёт
   через incident playbook.
4. Перед paid-scale включить регулярный retention job для audit/debug tables.
5. `heys-cron-photo-cleanup` держать в `DRY_RUN=1` первые 1-2 недели, затем
   включить `DRY_RUN=0` после review orphan log.

## Open legal decisions

| Вопрос                                     | Draft-позиция                                                                         | Кто закрывает   |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | --------------- |
| Можно ли hard-delete `payments` по cascade | До первых платежей не блокирует; для paid-scale лучше anonymized soft-retention 5 лет | юрист/бухгалтер |
| Срок хранения consent proof                | 5 лет как защитный baseline                                                           | юрист           |
| Фото после удаления аккаунта               | удалить в течение 7-14 дней через cron-cleanup                                        | юрист           |
| Backup retention                           | 90 дней baseline; longer archive только если это описано в policy                     | юрист + founder |
