# HEYS · PDN incident drill template

Статус: empty operational drill template. Фактический drill-result хранить вне
репо, потому что он может содержать технические доказательства, IP, accounts,
client references, screenshots или юридические комментарии. Здесь хранится
только repo-safe структура проверки.

## Drill scope

- Owner до делегирования: ИП Поплавский Антон Сергеевич.
- Run before: paid-scale/R2, внешний куратор, новый обработчик ПДн или крупный
  релиз с изменением доступа.
- Scenario baseline: случайная отправка contact/health-data в не тот канал,
  публичный лог с ПДн, подозрение на доступ не того куратора или утечка секрета.
- Evidence storage: private operator workspace outside git.

## Drill row template

| Field                             | Value                                                          |
| --------------------------------- | -------------------------------------------------------------- |
| Drill ID                          | `INC-DRILL-YYYY-MM-NN`                                         |
| Date/time started                 |                                                                |
| Scenario                          | Telegram leak / log leak / wrong curator / secret leak / other |
| Facilitator                       |                                                                |
| Participants                      |                                                                |
| Systems touched                   | app DB / Telegram / Yandex Cloud / Lockbox / S3 / YooKassa     |
| Detection path                    |                                                                |
| Stop action within 24h            |                                                                |
| RKN 24h notification decision     | required / not required / simulate only                        |
| 72h investigation output          |                                                                |
| Subject notification decision     | required / not required / simulate only                        |
| Break-glass used                  | yes / no                                                       |
| Evidence location                 | private folder outside repo                                    |
| Gaps opened in `маркетинг/22`     |                                                                |
| Decision logged in `маркетинг/15` | yes / no                                                       |
| Closed at                         |                                                                |

## Success criteria

1. Владелец может за 15 минут найти playbook, calendar/reminder и private
   evidence folder.
2. В течение simulated 24h есть понятное решение: что остановить, кого
   уведомить, какие доказательства сохранить.
3. В течение simulated 72h есть понятная структура расследования: причина,
   объём, категории ПДн, меры предотвращения повтора.
4. Ни один drill artifact не попадает в git, issue tracker, Telegram или обычные
   docs, если там есть ПДн/секреты.
5. Все найденные gaps заведены в `маркетинг/22`, а решение о допуске к R2/R3
   фиксируется в `маркетинг/15` только после внешнего sign-off.

## Repo-safe summary

Для `heys-pdn-monthly-audit.md` допустим только агрегированный статус:

| Period  | Drill done | Scenario class | Gaps opened | R2 allowed | Notes without PII |
| ------- | ---------- | -------------- | ----------- | ---------- | ----------------- |
| YYYY-MM | no         | —              | 0           | no         |                   |
