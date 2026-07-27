# HEYS · live evidence технического R0

Дата проверки: 2026-07-26. Область: только HEYS; Kinderly не изменялся. Секреты,
тестовые контакты, session tokens и полные идентификаторы в документ не
включаются.

| Гейт               | Вердикт                     | Проверяемое доказательство                                                                                                                                                                                                 |
| ------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| РКН `1.7`          | ✅ готово                   | Публичная запись `26-22-005319` и приказ № 131 от 24.07.2026 уже сверены; HEYS-цели и данные о здоровье опубликованы.                                                                                                      |
| ИСПДн level/model  | ✅ R0 / 🟡 R2               | Рабочие тип угроз 3 и УЗ-4 зафиксированы в `heys-ispdn-threat-model-r0.md`; внешний sign-off остаётся до R2.                                                                                                               |
| Scoped web deploy  | ✅ готово                   | Scoped legacy bundle для `index.html`, storage и Yandex API загружен в HEYS web-контур; production index содержит cookie-only curator boot без восстановления browser-readable JWT.                                        |
| Strict write/read  | ✅ готово                   | Target env: `HEYS_WRITE_CONTEXT_STRICT=1`, `HEYS_REST_READ_STRICT=1`. После deploy SEC-004 и SEC-024: `ready=true`, warn counts пусты.                                                                                     |
| PIN/curator sync   | ✅ готово                   | Два синтетических клиента: PIN cookie read/write и logout, curator context write/read; production UI открыл список клиентов и профиль со статусом `Готово`.                                                                |
| Two-client IDOR    | ✅ готово                   | Без auth → 401; Client A читает B → 403; A читает A и curator читает B → 200. Cross-write capability A не изменил B.                                                                                                       |
| Telegram lead      | ✅ готово                   | Production contact создал один active lead и один `lead` event; replay не создал второй. Handoff доставлен и визуально не содержал phone/name/raw Telegram ID.                                                             |
| Telegram claim     | ✅ готово                   | `✅ Взял в работу` добавлен и задеплоен; 23/23 теста PASS. Живой операторский клик изменил заявку на `contacted`, установил `contacted_at` и обновил Telegram-сообщение; после проверки синтетические lead/events удалены. |
| Regression pack    | ✅ готово                   | `pnpm test:regressions`: 87/87 PASS.                                                                                                                                                                                       |
| Privacy/governance | ✅ готово                   | `pnpm privacy:marketing` PASS; `pnpm pdn:monthly-audit` — 61/61.                                                                                                                                                           |
| Calendar `.ics`    | 📅 запланировано, не блокер | Файл валиден и содержит пять HEYS reminder-серий. Импорт — удобный способ не забывать периодические проверки, но не является условием R0 или запуска заявок.                                                               |

## Команды повторной проверки

```bash
pnpm test:regressions
pnpm privacy:marketing
pnpm pdn:monthly-audit
pnpm security:strict-readiness -- \
  --source-fix-deployed-at "2026-07-26 20:27:39+03" \
  --write-since "2026-07-26 20:27:39+03" \
  --read-since "2026-07-26 20:27:39+03" \
  --events --fail-on-not-ready
python3 маркетинг/tools/build_dashboard.py
node scripts/sync-marketing-dashboard.mjs --check
```

## Ограничения прохода

- Commit и push не выполнялись.
- Бот был опубликован из проверенного dirty source через штатный
  `--force-dirty`, потому commit отдельно запрещён пользователем.
- Синтетические клиенты и заявки удаляются после финального live-click; реальные
  health-данные в smoke не использовались.
