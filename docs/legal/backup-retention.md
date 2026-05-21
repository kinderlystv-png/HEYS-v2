# Backup retention policy — HEYS

**Действует с:** 2026-05-20 **Версия:** 1.0

## Где хранятся бэкапы

База данных HEYS (PostgreSQL) живёт в управляемом сервисе **Yandex.Cloud Managed
Service for PostgreSQL**, регион `ru-central1-a`. Бэкапы создаются автоматически
на стороне Yandex.Cloud:

- **Тип:** инкрементальные снапшоты + полные дампы.
- **Местоположение:** Yandex Object Storage (Россия).
- **Шифрование:** AES-256 (server-side, Yandex KMS).
- **Retention period:** 7 дней (стандартная политика Yandex.Cloud для managed
  PostgreSQL).

Дополнительные snapshot'ы в S3 (`heys-backup` function) создаются по расписанию
с retention 30 дней.

## Что происходит при удалении аккаунта

При вызове `delete_my_account()`:

1. **В active БД:** запись клиента и все связанные данные удаляются немедленно
   (cascade-delete для `client_kv_store`, `client_sessions`, `subscriptions`,
   `trial_queue`). Записи `consents` обнуляются по PII (IP/UA) для сохранения
   audit-trail.
2. **В Telegram/уведомлениях:** payload содержит только UUID-prefix, не PII.
3. **В `data_access_audit_log`:** регистрируется событие `account_deleted` с
   UUID клиента (без имени/телефона).
4. **В `leads`:** запись клиента (если была конверсия из лида) anonymized через
   trigger `leads_anonymize_on_client_delete` —
   `name`/`phone`/`email`/`ip_address`/`user_agent` обнуляются на `[deleted]`
   или `NULL`. Marketing-аналитика (UTM-метки, messenger, status) сохраняется.

## Что происходит с данными в бэкапах

После delete_my_account:

- **В Yandex.Cloud Postgres backups:** запись остаётся в течение retention
  period (7 дней). После 7 дней — окончательно перезаписана.
- **В S3 snapshots:** до 30 дней. Затем перезаписывается.

**Важно:** мы не можем «принудительно» удалить данные из истёкших бэкапов на
стороне Yandex — это часть управляемого сервиса. Но через 30 дней максимум
данные физически отсутствуют во всех слоях.

## Согласно 152-ФЗ ст. 21

«Оператор обязан прекратить обработку и уничтожить персональные данные» в
течение 30 дней после требования субъекта.

**HEYS соответствует:**

- Active БД: удаление **немедленное** (≤ 1 секунды).
- Backups: уничтожение **в течение 30 дней** (естественный retention).
- Уведомления (Telegram, push payloads): не содержат PII.

## Согласно GDPR Art. 17 (Right to erasure)

«Including backups» — да, бэкапы естественным retention'ом перезаписываются
через 7-30 дней. Активные слои чистятся сразу.

## Контакты для запросов

privacy@heys.app — обращения по обработке персональных данных (ответ в течение
10 рабочих дней).
