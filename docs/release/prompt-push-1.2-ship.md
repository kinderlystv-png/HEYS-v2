# prompt-push-1.2-ship

> Кодеру. 16.08.2026. Отправляется вместе с обязательной преамбулой из
> `docs/release/handoff-prompts.md` (§ «Обязательная преамбула ко всем
> промптам») и с `release-plan.md`. Календарь: **сегодня** — выкат и применение;
> хвосты — до 27.08.

## 0. Задача одной фразой

Юрист вычитал согласие на push: клиентское **1.2** и кураторское **1.1**
(кураторское поднято с 1.0 — правки существенные). Финальные тексты приложены
файлами. Нужно положить их в репозиторий побайтово, обновить манифест и
миграции, выкатить и **только потом** применить SQL в базу.

## 1. Состояние прода на момент задания — проверено 16.08, но перепроверь

- `app.heyslab.ru/version.json` → `2026.08.16.0913.2aea455b`, buildTime
  `2026-08-16T06:14:51Z`.
- Живой `app.heyslab.ru/heys_legal_versions_v1.js` отдаёт
  `push_notifications: '1.2'` — фронт уже требует 1.2 (коммит `0552c9a5`).
- `database/2026-08-15_activate_push_consent_v1_2.sql` содержит
  `RAISE EXCEPTION 'DO NOT APPLY'` — по всем признакам **не применялась**; в
  реестре по push должна быть активна 1.1 (`99433c27…`).
- Следствие: **подписать push-согласие на проде сейчас нельзя** —
  `consent_version_not_allowed`. Обязательные согласия (`user_agreement`,
  `personal_data`) не затронуты, вход цел. Ложных подписей быть не могло: под
  1.2 не подписан никто.

**Первое, что делаешь — проверяешь это запросом, а не веришь заданию:**

```sql
select consent_type, document_version, status, document_sha256, effective_at, legal_signoff_ref
  from public.legal_consent_registry
 where consent_type in ('push_notifications','curator_push_notifications')
 order by consent_type, document_version;

select consent_type, document_version, count(*)
  from public.consents where consent_type = 'push_notifications' group by 1,2;

select curator_id, consent_type, document_version, granted, revoked_at
  from public.curator_consents where consent_type = 'curator_push_notifications';
```

Если по push уже есть активная 1.2 или есть **хоть одна подпись** под 1.2 —
**останавливайся и пиши в чат**: это другой сценарий, там придётся разбираться с
доказательствами уже собранных согласий, а не просто катить.

## 2. Файлы — побайтово, не переписывать руками

Два приложенных файла: UTF-8, LF, один завершающий перенос строки. Их формат
отличается от прежних версий (нет `> **Версия:**` с `<br>`) — **так и должно
быть, приводить к прежнему стилю нельзя**: от байтов считается хэш, который
регистрируется как доказательство согласия.

| Документ                 | Куда класть                                                                                                                | sha256                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Клиентское push **1.2**  | `docs/legal/push-notifications-consent.md` **и** `apps/web/public/docs/v1.2/push-notifications-consent.md`                 | `b1b03ad270746c73af93a60cc36fbcf19a0e8bbacbe5766969a5ad83b9d29108` |
| Кураторское push **1.1** | `docs/legal/curator-push-notifications-consent.md` **и** `apps/web/public/docs/v1.1/curator-push-notifications-consent.md` | `973e0fe4f2ec7544964c8706a7679d616f8009344bc28927567acd3fdcd47153` |

- Клиентский 1.2 **заменяет невычитанный драфт** (`fba4df9d…`), который сейчас
  лежит в обоих местах.
- `apps/web/public/docs/v1.0/curator-push-notifications-consent.md` **не
  трогать**: под 1.0 есть подпись, снимок неизменяем. Юрист прямо просил 1.0 не
  аннулировать, а заместить на будущее.
- Prettier эти пути уже не форматирует (`.prettierignore`:
  `docs/legal/*-consent.md`, `apps/web/public/docs/**/*.md`) — проверь, что
  после `pnpm format`/pre-commit хэш не изменился.

Проверка хэшей ровно так, как их считает деплой-гейт (utf8, CRLF→LF):

```bash
node -e "const c=require('node:crypto'),f=require('node:fs');for(const p of process.argv.slice(1))console.log(c.createHash('sha256').update(f.readFileSync(p,'utf8').replace(/\r\n/g,'\n')).digest('hex'),p)" \
  docs/legal/push-notifications-consent.md \
  apps/web/public/docs/v1.2/push-notifications-consent.md \
  docs/legal/curator-push-notifications-consent.md \
  apps/web/public/docs/v1.1/curator-push-notifications-consent.md
```

Все четыре должны совпасть с таблицей выше (по два одинаковых).

## 3. Манифест

`docs/legal/legal-document-manifest.json`:

- `push_notifications.sha256` → `b1b03ad2…` (версия остаётся `1.2`, пути те же);
- `curator_push_notifications`: `version` `1.0` → `1.1`, `snapshotPath` →
  `apps/web/public/docs/v1.1/curator-push-notifications-consent.md`, `sha256` →
  `973e0fe4…`.

## 4. Миграции

### 4.1. Клиентская — правится существующий файл, новый не заводить

`database/2026-08-15_activate_push_consent_v1_2.sql` сам предписывает порядок
правки в шапке. Сделать:

- удалить блок `DO $$ … RAISE EXCEPTION 'DO NOT APPLY' … $$;`;
- `document_sha256` →
  `b1b03ad270746c73af93a60cc36fbcf19a0e8bbacbe5766969a5ad83b9d29108`;
- `effective_at` → `'2026-08-16 00:00:00+03'` (юрист: дата вступления в силу =
  дата регистрации в реестре, не дата вычитки и не 15.08; в самих текстах стоит
  16 августа — расхождение даты в тексте и в реестре недопустимо);
- `legal_signoff_ref` → `'docs/release/vychitka-push-1.2-2026-08-16.md'` (файл с
  вычиткой приложен, положить туда же);
- шапку переписать под фактический порядок выката из §5 — прежняя формулировка
  «реестр раньше фронта» в этой ситуации **неверна**, и следующий, кто её
  прочитает, сделает ложное доказательство. Причина — в §5.
- Строку `('push_notifications','1.1', …)` из более ранних миграций не трогать.

### 4.2. Кураторская — новый файл

`database/2026-08-16_activate_curator_push_consent_v1_1.sql`:

```sql
-- Curator push consent 1.1 (lawyer review 16.08.2026).
-- Replaces 1.0 going forward. 1.0 is NOT annulled: signatures under it stay
-- valid as a snapshot of the text that was signed (lawyer, answer 7).
-- Signature rows are NOT stamped here: every curator signs 1.1 himself.

INSERT INTO public.legal_consent_registry (
  consent_type, document_version, document_sha256, document_path,
  status, effective_at, legal_signoff_ref
) VALUES (
  'curator_push_notifications', '1.1',
  '973e0fe4f2ec7544964c8706a7679d616f8009344bc28927567acd3fdcd47153',
  'apps/web/public/docs/v1.1/curator-push-notifications-consent.md',
  'active', '2026-08-16 00:00:00+03',
  'docs/release/vychitka-push-1.2-2026-08-16.md'
)
ON CONFLICT (consent_type, document_version) DO UPDATE SET
  document_sha256 = EXCLUDED.document_sha256,
  document_path   = EXCLUDED.document_path,
  status          = EXCLUDED.status,
  effective_at    = EXCLUDED.effective_at,
  legal_signoff_ref = EXCLUDED.legal_signoff_ref;

UPDATE public.legal_consent_registry
   SET status = 'retired'
 WHERE consent_type = 'curator_push_notifications'
   AND document_version <> '1.1'
   AND status = 'active';
```

Перед применением проверь на своей копии, что `retired` у 1.0 **не роняет**
кураторский гейт: `LIVE_CURATOR_PUSH_CONSENT_SQL`
(`yandex-cloud-functions/heys-api-push/push-consent.js:16`) версию не смотрит, а
смотрит `granted = true AND revoked_at IS NULL`. Если найдёшь путь, где версия
всё-таки сверяется, — скажи, а не подстраивайся под это задание.

### 4.3. Деплой-гейт

`scripts/verify-legal-release.mjs`, массив `MIGRATION_PATHS`: добавить
`'database/2026-08-16_activate_curator_push_consent_v1_1.sql'` **после**
`'scripts/db/migrations/2026-08-15_curator_push_consent_gate_v1.sql'`. Порядок
важен: `parseRegistry` складывает строки в `Map` по ключу `type:version`, и
более поздний файл перекрывает более ранний.

Локально до коммита:

```bash
node scripts/verify-legal-release.mjs
```

Гейт сверяет манифест ↔ файлы ↔ **текст SQL**, но не состояние базы. Зелёный
гейт не означает, что миграция применена.

## 5. Порядок выката — здесь он ИНВЕРТИРОВАН, читай внимательно

Обычное правило проекта — «реестр раньше фронта», чтобы не поймать
`consent_version_not_allowed`. **Сегодня оно даёт худший исход**, потому что
фронт уже уехал на 1.2 первым:

- если применить SQL сейчас, пока прод отдаёт старый текст драфта, клиент увидит
  на экране один текст, а в доказательство ляжет хэш другого. Это ложное
  доказательство согласия — то, ради чего вся эта конструкция и строилась;
- если сначала выкатить текст, а SQL применить после, то до применения
  подписание остаётся сломанным ровно так же, как сейчас, — то есть **ничего не
  ухудшается и подписать неверный текст физически нельзя**.

Поэтому:

1. Один коммит: два текста ×2 пути, манифест, обе миграции, `MIGRATION_PATHS`,
   файл вычитки, правки плана (§7). `HEYS_COMMIT_SOURCE_ONLY=1`, явным списком
   путей.
2. Push в `main` → дождаться зелёного `Deploy to Yandex Cloud`. Номер run — в
   отчёт.
3. Проверить, что прод отдаёт именно эти байты:

   ```bash
   curl -s https://app.heyslab.ru/docs/v1.2/push-notifications-consent.md | sha256sum
   curl -s https://app.heyslab.ru/docs/v1.1/curator-push-notifications-consent.md | sha256sum
   ```

   Должны совпасть с таблицей §2. Не совпало — **не применять SQL**, разбираться
   (кэш CDN, снимок не попал в dist).

4. Только теперь применить обе миграции:

   ```bash
   bash scripts/db/psql.sh -f database/2026-08-15_activate_push_consent_v1_2.sql
   bash scripts/db/psql.sh -f database/2026-08-16_activate_curator_push_consent_v1_1.sql
   ```

   SQL показать владельцу до применения — правило проекта, оно здесь в силе.

5. Повторить запросы из §1: по `push_notifications` активна 1.2 с `b1b03ad2…`,
   1.1 в `retired`; по `curator_push_notifications` активна 1.1 с `973e0fe4…`.
6. Owner smoke: на своём аккаунте включить push-уведомления и подписать 1.2 —
   подпись прошла, в `consents` строка с `document_version = '1.2'` и
   `document_sha256 = b1b03ad2…` (хэш ставит триггер
   `enforce_consent_document_proof` из реестра — если он разошёлся с показанным
   текстом, ты это увидишь здесь).

## 6. Кураторская подпись — экрана нет, нужен ответ владельца

Проверено 16.08: `curator_consents` фигурирует только на сервере
(`heys-api-messages`, `heys-api-push`, `heys-cron-reminders`), ссылки на
кураторский документ в интерфейсе нет — в `heys_consents_v1.js` есть строки для
клиентских документов, кураторского там нет. Строки 1.0 были **проставлены
миграцией 15.08**, а не подписаны человеком.

Юрист требует, чтобы куратор подписывал сам (для наёмных это принципиально:
согласие под угрозой недопуска к работе добровольным не считается). Развилка,
решает владелец, **не решай сам**:

- **мини-экран** в кураторском профиле: текст документа + кнопка «Подписываю» →
  строка в `curator_consents`. Дороже, но это единственный вариант, который
  доживёт до найма;
- **акт подписания** владельцем на бумаге + строка, проставленная миграцией, с
  ссылкой на акт в `legal_signoff_ref`. Дешевле, годится пока куратор один.

До ответа: 1.1 регистрируем (это безопасно), подпись под ней не проставляем.

## 7. Что поправить в плане

- `release-track-c.md`, строка «Push идут через FCM и APNs»: снять «согласие 1.1
  уже на проде» и «текст 1.0 юрист не вычитывал», записать вычитку 16.08, номер
  деплоя, состояние реестра по факту запроса. Штамп файла поднять — сейчас там
  14.08, хотя файл правился 16.08.
- `release-plan.md` §5 «Ваше, не делегируется», п. 5 (Payload push): переписать
  по факту; убрать «registry на проде ещё 1.1», если запрос показал иное.
- Не трогать §12, §13, §14 и даты — правило преамбулы.

## 8. Хвосты, которые юрист назвал важнее самих push-согласий — до 27.08

Mozilla Corporation названа в уведомлении № 100383874, поданном в РКН, но её нет
ни в согласии на обработку ПДн 1.0, ни в политике 1.8, ни в перечне обработчиков
1.3. То есть клиенту показывается менее полная картина, чем регулятору.

Это **не** сегодняшняя задача, но оценить объём надо сейчас, потому что цена
разная:

- `subprocessors.md` 1.3 → 1.4 — не подписывается, дёшево;
- политика 1.8 → 1.9 — новый хэш, подписи нет, средне;
- **согласие на обработку ПДн 1.0 → 1.1 — обязательное согласие**: новый хэш
  запускает `check_required_consents_v2`, грейс 7 дней и блокирующий
  ConsentScreen у всех. Аккаунтов пока пять и все свои, но это ровно то окно
  переподписания, которое запланировано до 27.08 вместе с пакетом 1.11, — **всё
  должно уехать одним заходом, не двумя**;
- в `curator-access-consent.md` 1.1 → 1.2 добавить строку о том, что уведомления
  о событиях по дневнику могут направляться на устройство куратора и содержать
  имя клиента (юрист, ответ 5). Тем же окном.

Категорию «уведомления по дневнику» в политику добавлять не нужно — §2 состав
данных уже покрывает (юрист, ответ 8).

## 9. Отчёт

В отчёте: вывод запросов из §1 до правок и после применения; четыре хэша из §2;
номер деплой-run; вывод `node scripts/verify-legal-release.mjs`; результат
owner-smoke подписания; всё, что разошлось с этим заданием. Задание собрано
человеком по grep — считай его фактуру предположением и проверяй.
