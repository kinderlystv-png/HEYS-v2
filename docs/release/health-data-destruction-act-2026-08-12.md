# Акт об уничтожении персональных данных (спецкатегория / health minimization)

**Дата:** 2026-08-12 11:15 MSK  
**Исполнитель:** Anton Poplavskiy / Cursor agent  
**Основание:** решение владельца от 11.08.2026 (минимизация спецкатегории ПДн,
трек B1) + поправка 12.08.2026: исключение семейного аккаунта супруги из purge
по cycle + measurements + supplements.  
**Команда на purge:** прямая команда владельца 2026-08-12 (с расширением
exclude).  
**SQL / функция:** `public.purge_health_minimization_data_v1` (миграция
`scripts/db/migrations/2026-08-12_health_minimization_purge_exclude_spouse_v2.sql`,
commits `f03247910`, `8723f2440`).  
**Вызов:**

```sql
SELECT public.purge_health_minimization_data_v1(
  'Anton Poplavskiy / Cursor agent',
  0,   -- p_expected_profiles_enabled (non-excluded)
  2,   -- p_expected_profiles_cycle_keys
  0,   -- p_expected_day_cycle_payload
  245  -- p_expected_day_cycle_keys
);
-- p_exclude_client_ids default:
-- ARRAY['4545ee50-4f5f-4fc0-b862-7ca45fa1bafc']
```

**audit_logs:** `action=health_minimization_purge`,
`created_at=2026-08-12 11:15:26.626119+03`.

---

## Важно

Это **не** «всё удалено». Из purge **исключён** аккаунт Александры; её cycle /
measurements / supplements **сохранены**. Остальные клиенты по перечисленным
полям очищены; согласия `health_data` отозваны. Legacy-блоки `health`/`safety` в
анкетах к моменту purge уже были 0 (сняты ранее intake-миграцией).

---

## Что уничтожено (удалено / очищено)

| Категория                        | Где                                  | Что                                                               | Записей                                   |
| -------------------------------- | ------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------- |
| Цикл — профили с ключами cycle\* | `client_kv_store` `heys_profile`     | `cycleTrackingEnabled`, `cycleLength`, …                          | **2**                                     |
| Цикл — дни с любыми cycle\* keys | `client_kv_store` `heys_dayv2_*`     | `cycleDay`, `cycleStatus`, `cycleAnsweredAt`, `cycleUpdatedAt`    | **245**                                   |
| Цикл — дни с payload             | то же                                | non-empty `cycleDay`/`cycleStatus`                                | **0** (до purge уже 0 среди non-excluded) |
| Замеры                           | `heys_dayv2_*`                       | `measurements`                                                    | **5**                                     |
| Добавки (дни)                    | `heys_dayv2_*`                       | `supplementsPlanned` / `supplementsTaken` (+ meta timestamps)     | **191**                                   |
| Добавки (профиль)                | `heys_profile`                       | `customSupplements` / `plannedSupplements` / `supplementSettings` | **0**                                     |
| Анкета intake legacy             | `trial_intakes.answers_encrypted`    | секции `health`, `safety`                                         | **0** (уже сняты до purge)                |
| Анкета кандидатов legacy         | `trial_candidates.answers_encrypted` | секции `health`, `safety`                                         | **0** (уже сняты до purge)                |
| Согласия кандидатов              | `trial_candidate_consents`           | `health_data` active → revoked                                    | **5**                                     |
| Согласия клиентов                | `consents`                           | `health_data` granted → revoked                                   | **4**                                     |

Числа cleared — из результата `purge_health_minimization_data_v1` /
`audit_logs.metadata`.

---

## Что сохранено (исключение)

**Чей аккаунт:** Александра  
**client_id:** `4545ee50-4f5f-4fc0-b862-7ca45fa1bafc`  
**Основание исключения:** семейный аккаунт, не клиент; исключение до первого
клиента; решение владельца 2026-08-12. Scope keep: **cycle + measurements +
supplements**.

| Категория                               | Kept count |
| --------------------------------------- | ---------- |
| Профиль `cycleTrackingEnabled=true`     | **1**      |
| Профиль с любыми cycle\* keys           | **1**      |
| Дни с cycle payload (non-empty)         | **45**     |
| Дни с любыми cycle\* keys               | **181**    |
| Дни с `measurements`                    | **2**      |
| Дни с supplements keys                  | **126**    |
| Профиль с non-empty `customSupplements` | **0**      |

`kept_reason` в audit:
`owner_exception_spouse_family_account_cycle_measurements_supplements`.

---

## Контрольные числа before → after (SQL inventory, exclude = супруга)

Метрика = DELETE (non-excluded) / KEEP (spouse).

| Метрика                        | BEFORE delete | BEFORE keep | AFTER delete | AFTER keep |
| ------------------------------ | ------------: | ----------: | -----------: | ---------: |
| profiles_enabled               |             0 |           1 |            0 |          1 |
| profiles_cycle_keys            |             2 |           1 |            0 |          1 |
| day_cycle_payload              |             0 |          45 |            0 |         45 |
| day_cycle_keys                 |           245 |         181 |            0 |        181 |
| day_measurements               |             5 |           2 |            0 |          2 |
| day_supplements                |           191 |         126 |            0 |        126 |
| profiles_custom_supplements    |             0 |           0 |            0 |          0 |
| trial_health_consents_active   |             5 |           — |            0 |          — |
| client_health_consents_granted |             4 |           — |            0 |          — |

Assert gates перед purge (только non-excluded): `0 / 2 / 0 / 245` — совпали;
первая попытка с битым INSERT в `audit_logs` откатилась целиком (данные не
изменились); после фикса schema (`8723f2440`) purge завершился успешно.

---

## Способ уничтожения

- Удаление полей из JSON в `client_kv_store` (не обезличивание).
- Перезапись зашифрованных ответов анкеты без `health`/`safety` (в этом прогоне
  0 строк).
- Отзыв согласий `health_data`.
- Запись в `audit_logs` (`action`, `resource_type`, `metadata`).

## Подтверждение

- [x] Перед purge выполнен inventory с DELETE/KEEP split; assert gates показаны.
- [x] Владелец дал прямую команду на purge с расширенным exclude.
- [x] После purge: non-excluded cycle/measurements/supplements = 0; spouse keep
      совпал с before keep.

Подпись владельца: ******\_\_\_\_******
