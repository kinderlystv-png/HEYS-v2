# prompt-login-pin-diag

**Цель.** Установить, почему выданный клиенту PIN не проходит на входе. **Только
диагностика** — ничего не чинить до отчёта владельцу.

**Контекст (проверено 12.08.2026).**

- Условие готовности №2 снято с ✅: вход «работает не всегда», дефект
  повторяется на приглашениях в анкету и на экране «Вход клиента».
- Живое воспроизведение на проде: клиент `пупс`, id
  `6b9e20c0-4757-4993-991d-0de24247a2bc`, телефон `+7 888 888-88-88` (в панели
  `78888888888`), PIN `1212`. PIN переустановлен через `heys_client_access` /
  `admin_set_client_pin`. Вход на `https://app.heyslab.ru/` → «PIN не подошёл».
  `heys_get_client_health`: **0 попыток** — запрос до rate-limit не доходит.
- Сервер login v2 выкачен 11.08 (`2026-08-11_client_login_scheme_v2.sql`), но
  фронт входа **ещё не** переведён на `verify_client_onetime_pin` /
  `login_client_v1` — см. `lawyer-C-consents-and-screens.md`.

Отправляется вместе с **обязательной преамбулой** из `handoff-prompts.md` и
`release-plan.md`.

---

## Главная рабочая гипотеза (проверить первой)

После login v2 выдача PIN и проверка на входе **разъехались**:

| Действие                                        | Куда пишет                                               | Где в коде                                                         |
| ----------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| Создание клиента в панели                       | `pin_hash` (SHA256 с солью с клиента)                    | `create_client_with_pin` ← `heys_auth_v1.js` `createClientWithPin` |
| Перевыпуск PIN / `heys_client_access reset_pin` | `onetime_pin_hash` (bcrypt в БД)                         | `admin_set_client_pin` → `issue_onetime_pin_for_client`            |
| Вход клиента на app                             | ищет **`pin_hash IS NOT NULL`**, сверяет через `crypt()` | `verify_client_pin_v3` ← `heys_auth_v1.js` `loginClient`           |

Если гипотеза верна: после `reset_pin` у клиента `onetime_pin_hash` заполнен, а
`pin_hash` может быть NULL или несовместим — `verify_client_pin_v3` клиента **не
находит** (`pin_hash IS NOT NULL` в WHERE), пользователь видит «PIN не подошёл»,
счётчик попыток не растёт.

Отдельно: `create_client_with_pin` кладёт **клиентский SHA256**, а
`verify_client_pin_v3` сравнивает через **`crypt(p_pin, pin_hash)`** (bcrypt).
Это второй класс дефекта для свежесозданных клиентов.

---

## Два разных входа — не смешивать в отчёте

1. **Вход клиента в приложение** — экран «Вход клиента», RPC
   `verify_client_pin_v3` (`apps/web/heys_auth_v1.js`, ~286–365).
2. **Вход кандидата в анкету** — `?intake=1`, RPC `verify_trial_candidate_pin`
   (`apps/web/heys_yandex_api_v1.js`, ~861; SQL в
   `scripts/db/migrations/2026-07-29_trial_intake_preclient_v3.sql`, ~218–244).
   Таблица `trial_candidates.pin_hash`, код **многоразовый** (новая сессия на 7
   дней, hash не сгорает). Это **другая** задача (`prompt-transfer-measures`),
   но владелец говорит, что PIN «в приглашении» тоже часто не работает — проверь
   оба пути и скажи, где именно ломается кейс `пупс`.

---

## Что выяснить (по порядку)

### A. Запись в базе для `пупс`

```sql
SELECT id, phone, phone_normalized,
       pin_hash IS NOT NULL AS has_pin_hash,
       left(pin_hash, 7) AS pin_hash_prefix,
       pin_salt IS NOT NULL AS has_pin_salt,
       onetime_pin_hash IS NOT NULL AS has_onetime,
       onetime_pin_expires_at, onetime_pin_consumed_at,
       access_code_hash IS NOT NULL AS has_access_code,
       pin_failed_attempts, pin_locked_until, updated_at
FROM clients
WHERE id = '6b9e20c0-4757-4993-991d-0de24247a2bc';
```

Плюс `regexp_replace(COALESCE(phone,''),'[^0-9]','','g')` — совпадает ли с тем,
что уходит из `normalizePhone()` (`7` + 10 цифр)?

### B. Контрольный рабочий клиент

Тот же SELECT для «Александра» (вход заведомо рабочий). Сравнить: какие поля
hash заполнены, какой префикс (`$2a$` = bcrypt vs hex = SHA256).

### C. Прямой вызов RPC на проде/staging

1. `verify_client_pin_v3(p_phone := '<нормализованный телефон>', p_pin := '1212')`
   — что возвращает (`success`, `error`, `client_exists` в security_events)?
2. Если `onetime_pin_hash` заполнен — `verify_client_onetime_pin` с тем же
   телефоном и PIN.
3. Для анкеты (если `пупс` — кандидат) — `verify_trial_candidate_pin`.

### D. Цепочки выдачи PIN

| Источник                  | RPC / функция                                                    | Файл                                                                             |
| ------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Панель «новый клиент»     | `create_client_with_pin`                                         | `database/2025-12-12_phone_pin_auth.sql`                                         |
| Панель / MCP reset        | `admin_set_client_pin`                                           | `database/2026-08-11_client_login_scheme_v2.sql` ~239                            |
| MCP `heys_client_access`  | `api.setClientPin` → `admin_set_client_pin`                      | `heys-mcp/lib/heys-api.js` ~485                                                  |
| Приглашение в анкету (v2) | `admin_convert_lead` / `admin_prepare_trial_candidate_from_lead` | `database/2026-07-27_trial_intake_flow_v2.sql` — пишет `clients.pin_hash` bcrypt |
| Приглашение (preclient)   | создание `trial_candidates.pin_hash`                             | см. миграции trial intake                                                        |

Для каждой цепочки: **один столбец или два**, **bcrypt или SHA256**, **какой RPC
проверяет на входе**.

### E. Логи security_events

Есть ли `pin_failed` / `pin_legacy_blocked` / `onetime_pin_success` для id
`пупс` за время воспроизведения? Если пусто — подтверждение, что до verify не
доходит (клиент не найден в WHERE).

---

## Чего не делать

- Не чинить до отчёта, не менять схему, не трогать `access_code_hash`.
- Не деплоить и не пушить.
- Не править `release-plan.md` / `handoff-prompts.md` — только текст отчёта
  владельцу.

Если причина очевидна за пять минут — **всё равно сначала доложи**: возможно,
чинить надо не там, где кажется (например, фронт должен звать
`verify_client_onetime_pin`, а не `verify_client_pin_v3`).

---

## Отдельным пунктом в отчёте

1. **Текст «PIN не подошёл» при ненайденном клиенте** — дефект UX: отправляет
   искать опечатку в PIN, хотя PIN мог быть выдан в `onetime_pin_hash`. Предложи
   честную формулировку без раскрытия существования номера.
2. **Один корневая причина или несколько** (создание vs reset vs анкета vs
   телефон).
3. **Минимальный фикс** одной строкой — без реализации, только «что менять и
   где».

---

## Критерий готово

Владелец по отчёту понимает: (а) почему `пупс` не вошёл; (б) затронуты ли все
пути выдачи или один; (в) что чинить в следующем промпте (фронт / SQL / оба).
