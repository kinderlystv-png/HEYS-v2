# HEYS · DSAR request log template

Статус: empty operational template. Фактический журнал хранить вне репо, потому
что он может содержать ПДн, каналы связи, identity-check evidence и юридические
комментарии. В репо остается только структура полей и правила заполнения.

## Owner and storage

- Owner до делегирования: ИП Поплавский Антон Сергеевич.
- Storage: private operator workspace outside git.
- Access: owner + назначенный privacy/legal reviewer.
- Link back: в репо можно фиксировать только агрегированный статус без DSAR ID,
  ПДн, скринов, телефонов, email или вложений.

## Log row template

| Field                 | Value                                                     |
| --------------------- | --------------------------------------------------------- |
| DSAR internal ID      | `DSAR-YYYY-MM-NN`                                         |
| Request date/time     |                                                           |
| Request channel       | email / Telegram / support / other                        |
| Request type          | access / correction / withdrawal / deletion / restriction |
| Identity check result | confirmed / rejected / pending                            |
| Client reference      | internal link outside repo                                |
| Assigned owner        |                                                           |
| Due date              |                                                           |
| Actions performed     |                                                           |
| Systems checked       | app DB / S3 photos / backups / YooKassa / Telegram / docs |
| Delivery channel      |                                                           |
| Evidence location     | private folder outside repo                               |
| Response sent at      |                                                           |
| Closure reviewer      |                                                           |
| Status                | open / waiting / closed / rejected                        |

## Safety rules

1. Не хранить в git реальные DSAR rows, телефоны, email, ФИО, client IDs,
   screenshots, exported archives или links на приватные файлы.
2. Для access export записывать checksum архива только во внешнем журнале.
3. Для deletion/withdrawal фиксировать в журнале, какие системы проверены:
   `clients` cascade, `client_kv_store`, `consents`, `payments`, `leads`,
   `funnel_events`, S3 photos, backup retention.
4. Если запрос отклонен из-за identity check, хранить минимум объяснения без
   лишних деталей о внутренних правилах.
5. Любой спорный запрос переводить в incident/legal file outside repo и
   ссылаться на него только как на private evidence location.

## Repo-safe monthly summary

Для `heys-pdn-monthly-audit.md` допустим только такой агрегированный формат:

| Period  | New DSAR | Closed DSAR | Open DSAR | Gaps opened in `22` | Notes without PII |
| ------- | -------- | ----------- | --------- | ------------------- | ----------------- |
| YYYY-MM | 0        | 0           | 0         | 0                   |                   |
