# HEYS · Privacy/DSAR intake runbook

Статус: repo-side runbook. Фактические письма, имена, телефоны, client IDs,
скриншоты и DSAR-журнал хранятся вне git.

## Текущий R0-канал

Пока отдельный alias `privacy@heyslab.ru` не создан, production-intake идет
через уже опубликованный контакт оператора: `poplanton@mail.ru`.

Этот адрес уже указан в публичных legal docs и в конфиге legal versions, поэтому
он безопаснее для R0, чем ссылка на несуществующий alias.

## Правило обработки входящего запроса

1. В день получения письма или сообщения определить тип: DSAR, отзыв согласия,
   удаление, инцидент, возврат, общий вопрос.
2. Если запрос касается ПДн, присвоить внутренний ID `DSAR-YYYY-MM-NN` или
   `INC-YYYY-MM-NN`.
3. Проверить личность по правилам
   [heys-dsar-procedure-draft.md](heys-dsar-procedure-draft.md).
4. Завести строку во внешнем DSAR/incident-журнале; в git реальные строки не
   копировать.
5. Для SLA-контроля сверяться с `heys-pdn-calendar.ics`: DSAR triage, 10 рабочих
   дней на ответ, 24/72 часа для инцидента.
6. В monthly audit фиксировать только repo-safe summary без ПДн.

## Когда появится privacy alias

Перед переключением на `privacy@heyslab.ru`:

1. Создать alias/forwarder и проверить доставку на владельца.
2. Проверить, что у владельца есть доступ без передачи пароля в репо/чат.
3. Обновить `apps/landing/src/config/legal-versions.ts` и публичные legal docs
   только отдельным legal-version bump.
4. Обновить РКН/privacy register, если меняется контакт оператора в поданной
   записи или публичных документах.
5. Добавить строку в monthly audit без персональных данных.

## Минимальный smoke

```text
From: owner test mailbox
To: poplanton@mail.ru или privacy@heyslab.ru после alias
Subject: HEYS privacy intake smoke
Expected: письмо получено владельцем, ID присвоен во внешнем журнале,
repo-safe summary добавлен в monthly audit без ПДн.
```
