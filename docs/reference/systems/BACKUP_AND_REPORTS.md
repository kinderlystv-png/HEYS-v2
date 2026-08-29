# Отчёты, пользовательский backup и серверное восстановление

> **Статус:** backup/restore consistency проверена 2026-07-18; production chain
> сверена 2026-08-15; reports — частично<br> **Охват:** browser export/import
> v3, local snapshots, server daily snapshot, admin restore и границы с
> отчётами<br> **Не подтверждено:** restore drill, RTO, KMS/SSE policy бакета,
> photo-bucket replica, полный контракт каждого отчёта

## Три разных механизма

| Механизм            | Цель                                                         | Источник                                  |
| ------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Отчёты              | Представление/анализ данных, не восстановление               | `heys_reports_*`, weekly/monthly services |
| Browser backup      | Переносимый пользовательский JSON/gzip и локальные snapshots | `heys_app_backup_*`                       |
| Server daily backup | Административное восстановление client KV/account rows       | `heys-client-daily-backup`                |

Их нельзя подменять друг другом. PDF/weekly report не является backup, а browser
export не доказывает наличие серверной disaster recovery копии.

## Browser backup v3

### Экспорт

`HEYS.AppBackupExport` сканирует localStorage по allow-by-default + deny-list
правилу. Новые пользовательские ключи автоматически попадают в `kv`, если они не
security/runtime/cache-only. Days и product overlay экспортируются отдельными
секциями.

Защиты экспорта:

- auth/session keys запрещены hard deny-list и финальным leak probe;
- foreign-client scoped keys исключаются;
- server-owned subscription/trial snapshots и производные caches исключаются;
- registry с `cloudSync='never'` или `maxSize=0` может дополнительно исключить
  ключ;
- размер/количество ограничены safety caps; при поддержке платформы используется
  gzip.

### Импорт

`HEYS.AppBackupImport.importFromFile(file)` поддерживает schema 1–3, валидирует
структуру и восстанавливает v3 в порядке:

1. устанавливает restore marker и временно подавляет hot-sync;
2. profile/norms/hr zones;
3. product overlay через его собственный snapshot API;
4. days batch;
5. остальные KV;
6. события обновления и постановка восстановленных cloud keys в очередь.

Прямая local restore запись нужна, чтобы cloud mirror не начал отправлять
частично восстановленное состояние. Marker остаётся при аварии и обнаруживается
на следующем boot.

Рядом существует более старый `createBackupHelpers`: он создаёт локальные
`*_backup` snapshots и простой version-1 download. Для полного переносимого
снимка каноничен `AppBackupExport` schema v3; старый helper нельзя принимать за
полный реестр состояния.

## Server daily backup

`heys-client-daily-backup` для каждого клиента:

1. открывает одну `REPEATABLE READ` transaction;
2. внутри неё читает `client_kv_store` и account tables без PIN/session hashes;
3. строит schema v2 snapshot с KV и accountData;
4. сохраняет encrypted payload как base64 вместе с `key_version`;
5. вычисляет SHA-256, gzip и загружает объект
   `<prefix>/<businessDate>/<clientId>.json.gz`;
6. удаляет snapshots старше настроенного retention.

Business date использует московскую границу дня 03:00. Наличие функции и README
не подтверждает, что timer trigger сейчас активен или последний запуск успешен.

## Admin restore

`restore-client-backup.js` уже реализован и поддерживает:

- download по client/date и проверку совпадения client id;
- dry-run diff;
- фильтр конкретных KV keys;
- `--account-only` / `--kv-only`;
- transactional upsert KV с сохранением encrypted bytes/key version/timestamp;
- единый transaction для полного KV + account restore;
- отдельные transactions только для явно выбранных `--account-only` /
  `--kv-only`.

При полном restore ошибка любого account write откатывает ранее выполненные KV
writes. Dry-run по-прежнему только вычисляет diff и не открывает write
transaction.

## Отчёты

Legacy `HEYS.ReportsTab` снят полностью 2026-08-29: вход из UI убрали ещё в
июне, но модуль оставался в сборке и на каждой загрузке вешал 33 наблюдателя за
днями, продуктами, профилем и зонами — ради компонента, который никто не
монтировал. Живой второй рендер того же экрана и есть будущий источник
расхождений, поэтому он удалён вместе со своим compatibility-прокси. Архив
сохранён: `archive/legacy-v12/heys_reports_v12_archived.js`.

Weekly/monthly services строят пользовательские представления из
day/profile/norm данных. Их аудит остаётся частичным: расчётные метрики
принадлежат соответствующим nutrition/analytics модулям, а отчёт не должен
заводить вторую формулу.

Ключевые точки:

- `apps/web/heys_weekly_reports_v2.js` — weekly представление, оно же
  вычислительное ядро листа периодов;
- `apps/web/heys_monthly_reports_service_v1.js` — monthly data service; месяц
  считается по календарным дням, а не складыванием недель;
- `apps/web/heys_monthly_reports_v1.js` — лист карточек периодов;
- `apps/web/heys_export_utils_v1.js` — общие export helpers.

## Инварианты

1. Ни один auth/session secret не попадает в переносимый browser backup.
2. Export куратора не включает ключи другого клиента.
3. Overlay и days восстанавливаются их специализированными путями.
4. Частичный restore не должен зеркалиться в cloud до завершения локальной фазы.
5. Server snapshot сохраняет encrypted representation и key version и не кладёт
   plaintext `v` рядом с `v_encrypted`.
6. Restore обязан сверить target client с snapshot client.
7. Dry-run ничего не изменяет; полный live restore атомарен: сначала account
   (`clients` до KV), затем KV.
8. Отчёты переиспользуют domain calculations, а не становятся новым source of
   truth.
9. Фото и голос в `heys-photos` не входят в backup-контур.

## Подтверждённые слабые места и пробелы

- `heys-client-daily-backup/README.md` всё ещё утверждал, что restore script
  появится позже, хотя он реализован. Это исправлено в документации.
- Browser export использует allow-by-default. Это уменьшает риск пропустить
  новую фичу, но повышает цену корректности deny-list и финального secret leak
  probe.
- Production trigger `heys-client-daily-backup-timer` ACTIVE (`0 1 * * ? *`);
  2026-08-14 в `s3://heys-backups/client-daily/2026-08-14/` лежит 16 объектов
  (проверено 2026-08-15). Restore drill по-прежнему не выполнялся.
- В префиксах daily backup есть исторический разрыв `2026-04-14`… `2026-05-10`
  (совпадает с комментарием `backup_chain_gap` про accidentally deleted
  version). Цепочка с `2026-05-11` по `2026-08-14` непрерывна.
- `heys-photos` и `heys-backups`: versioning disabled; у photos нет отдельного
  backup-слоя.
- Admin restore — merge, не replace: ключи новее снимка не удаляются. Полный
  restore пишет `clients` до KV. Чат и медиа в daily snapshot по-прежнему не
  входят.
- `docs/legal/backup-retention.md` с 15.08 описывает два слоя (14 / 365) и явно
  говорит, что фото/голос не бэкапятся. Срок daily 365 дней vs 30 дней 152-ФЗ
  остаётся открытым правовым зазором, не маскируется.
- Photo cleanup на проде с `DRY_RUN=0` (выложено 2026-08-15). Ручной прогон: 45
  abandoned messenger-объектов удалены; 1 orphan-префикс клиента ещё не прошёл
  7-дневный grace, поэтому не удалён.
- Полный аудит отчётных формул не выполнен; карта помечает reports как partial.

## Facts Table

| ID  | Утверждение                                                             | Проверка                                                                                                                                                            | Статус                          |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| D1  | Browser export использует schema v3 и deny-list                         | `rg -n -e 'SCHEMA_VERSION = 3' -e 'BACKUP_DENY_PATTERNS' apps/web/heys_app_backup_export_v1.js`                                                                     | проверено 2026-07-17            |
| D2  | Import поддерживает v1–v3 и имеет crash marker                          | `rg -n -e 'SUPPORTED_SCHEMA_VERSIONS' -e 'RESTORE_PROGRESS_LS_KEY' apps/web/heys_app_backup_import_v1.js`                                                           | проверено 2026-07-17            |
| D3  | V3 restore отделяет priority, overlay, days и remaining KV              | `rg -n -e 'async function restoreV3' -e 'PRIORITY_KEYS' -e 'applyOverlay' -e 'Object.keys\(data.days\)' apps/web/heys_app_backup_import_v1.js`                      | проверено 2026-07-17            |
| D4  | Server snapshot читает KV и account в одной repeatable-read transaction | `rg -n -e 'snapshotClientBundle' -e 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ' yandex-cloud-functions/heys-client-daily-backup/index.js`                   | исправлено и покрыто 2026-07-18 |
| D5  | Server snapshot schema v2 содержит accountData и checksum               | `rg -n -e 'schemaVersion: 2' -e 'accountData' -e 'snapshot.checksum' yandex-cloud-functions/heys-client-daily-backup/index.js`                                      | проверено 2026-07-18            |
| D6  | Полный restore пишет account (`clients`) до KV в одной transaction      | `rg -n -e 'executeFullRestore' -e 'restoreAccountRows' -e 'restoreKvRows' yandex-cloud-functions/heys-client-daily-backup/restore-client-backup.js`                 | исправлено 2026-08-15           |
| D7  | KV restore сохраняет `v_encrypted`, `key_version`, `updated_at`         | `rg -n -e 'v_encrypted = EXCLUDED' -e 'key_version = EXCLUDED' -e 'updated_at = EXCLUDED' yandex-cloud-functions/heys-client-daily-backup/restore-client-backup.js` | проверено 2026-07-18            |
| D8  | Legacy ReportsTab не грузится: нет ни модуля, ни его записи в сборке    | `rg -n 'heys_reports_tab_impl_v1\|heys_reports_v12' scripts/legacy-bundle-config.mjs apps/web` — пусто                                                              | снят 2026-08-29                 |
| D9  | Concurrent snapshot и fault-after-KV rollback защищены регрессиями      | `node --test yandex-cloud-functions/heys-client-daily-backup/__tests__/backup-consistency.test.cjs`                                                                 | 4/4 пройдено 2026-08-15         |
| D10 | Production daily backup trigger активен и пишет объекты                 | `yc serverless trigger list --folder-id b1gnv1a4q8i6de6atl6n`; ручной invoke 2026-08-15                                                                             | 16/16, businessDate 2026-08-14  |
| D11 | Managed PG backup 14 дней, окно 22:00 UTC, живые AUTOMATED копии        | `yc managed-postgresql cluster get c9qk0squejja8jast509`; `yc managed-postgresql backup list --folder-id b1gnv1a4q8i6de6atl6n`                                      | retain=14; 14.08 CREATING       |
| D12 | Photo cleanup на проде с `DRY_RUN=0`                                    | live env `DRY_RUN=0`; invoke 2026-08-15 `deletedCount=45`, `eligibleForDelete=0`, `dryRun=false`                                                                    | выложено 2026-08-15             |
| D13 | Encrypted KV в daily snapshot без plaintext `v`                         | `node --test yandex-cloud-functions/heys-client-daily-backup/__tests__/backup-consistency.test.cjs`                                                                 | добавлено 2026-08-15            |
