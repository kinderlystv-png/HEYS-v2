# Backup retention policy — HEYS

**Действует с:** 2026-05-20 **Версия:** 1.2 (2026-08-15)

Два слоя резервного копирования. Их нельзя описывать одной цифрой «14 дней на
всё». Живая сверка 2026-08-15: кластер `heys-production`, функция
`heys-client-daily-backup`, бакеты `heys-backups` / `heys-photos`.

## Слой 1. База PostgreSQL (управляемый сервис Yandex)

База HEYS живёт в **Yandex.Cloud Managed Service for PostgreSQL**, регион
`ru-central1-a`, кластер `heys-production`.

- **Тип:** автоматические снапшоты сервиса (BASE + INCREMENTAL) + PITR.
- **Окно:** около 22:00 UTC (`backup_window_start`).
- **Местоположение:** Yandex Object Storage (Россия).
- **Шифрование:** AES-256 на стороне сервиса.
- **Retention:** **14 дней** (`backup_retain_period_days`, проверка:
  `yc managed-postgresql cluster get c9qk0squejja8jast509`).
- **Состав:** вся база, включая чат (`client_messages`), согласия, платежи,
  дневник в `client_kv_store`.

## Слой 2. Суточные снимки клиента (`heys-client-daily-backup`)

- **Частота:** ежедневно, timer `heys-client-daily-backup-timer` (01:00 UTC).
- **Куда:** бакет `heys-backups`, префикс
  `client-daily/YYYY-MM-DD/<clientId>.json.gz`.
- **Retention:** **365 дней** (`RETENTION_DAYS` в коде функции, по умолчанию).
- **Состав:** `client_kv_store` клиента (дневник, профиль) + часть
  account-таблиц (`clients`, `consents`, `subscriptions`, `trial_queue`,
  `payments`) без `pin_hash` / session secrets.
- **Не входит:** фото, голосовые файлы, таблица чата `client_messages`.

## Что не копируется

Фото еды и голосовые сообщения хранятся только в бакете `heys-photos`.
Отдельного резервного копирования этого бакета нет (решение оператора
2026-08-15): источник правды по питанию — дневник, не файл. Versioning бакета
выключен. После удаления аккаунта orphan-объекты должен убирать
`heys-cron-photo-cleanup` (grace 7 дней; задание активно; `DRY_RUN=0` задаётся
при деплое через `deploy-all.sh`).

## Что происходит при удалении аккаунта

При вызове `delete_my_account()`:

1. **В active БД:** запись клиента и связанные данные удаляются сразу
   (cascade-delete для `client_kv_store`, `client_sessions`, `subscriptions`,
   `trial_queue`). Записи `consents` обнуляются по PII (IP/UA) для audit-trail.
2. **В Telegram/уведомлениях:** payload содержит только UUID-prefix, не PII.
3. **В `data_access_audit_log`:** событие `account_deleted` с UUID клиента (без
   имени/телефона).
4. **В `leads`:** контактные поля обезличиваются триггером
   `leads_anonymize_on_client_delete`.

После удаления:

- **PostgreSQL backups:** данные клиента могут вернуться при restore снимка
  младше **14 дней**. Потом слой перезаписывается. Вырезать одного человека из
  уже сделанного снимка Yandex Managed PostgreSQL нельзя.
- **Суточные снимки:** объект в `heys-backups` может оставаться до **365 дней**,
  пока ротация его не сотрёт. Автоматического «не восстанавливать удалённых»
  нет: restore — ручной скрипт по `client_id` и дате.
- **Фото/голос в `heys-photos`:** не в бэкапе; должны уйти cleanup-заданием
  после grace.

## Согласно 152-ФЗ ст. 21

Срок уничтожения после требования субъекта — до 30 дней.

- Active БД: удаление немедленное.
- Слой PostgreSQL: естественный retention **14 дней** (внутри 30 дней).
- Слой суточных снимков: **365 дней** — дольше 30 дней. Это открытый правовой
  зазор относительно желаемой политики; смена `RETENTION_DAYS` — отдельное
  решение оператора, не маскируется формулировкой «14 дней на всё».
- Уведомления (Telegram, push): не содержат PII.

## Контакты для запросов

poplanton@mail.ru — обращения по обработке персональных данных (ответ в течение
10 рабочих дней).
