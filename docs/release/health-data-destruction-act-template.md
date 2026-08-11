# Акт об уничтожении персональных данных (шаблон)

**Статус:** шаблон для заполнения после применения
`purge_health_minimization_data_v1`  
**Дата:** **\*\***\_**\*\***  
**Исполнитель:** **\*\***\_**\*\***  
**Основание:** решение владельца от 11.08.2026 — минимизация спецкатегории ПДн
(трек B1)

## Что уничтожено

| Категория                 | Таблица/ключ                                       | Поля                                | Записей |
| ------------------------- | -------------------------------------------------- | ----------------------------------- | ------- |
| Анкета (legacy)           | `trial_intakes.answers_encrypted`                  | `health`, `safety`                  |         |
| Анкета кандидата (legacy) | `trial_candidates.answers_encrypted`               | `health`, `safety`                  |         |
| Цикл                      | `client_kv_store` (`heys_dayv2_*`)                 | `cycleDay`, `cycleStatus`, …        |         |
| Замеры                    | `client_kv_store` (`heys_dayv2_*`)                 | `measurements`                      |         |
| Добавки                   | `client_kv_store` (`heys_dayv2_*`, `heys_profile`) | `supplements*`, `customSupplements` |         |

Числа — из результата
`SELECT public.purge_health_minimization_data_v1('ФИО исполнителя');`  
или предварительного
`SELECT * FROM public.inventory_health_minimization_purge_v1();`.

## Способ уничтожения

- Удаление полей из JSON в `client_kv_store` (не обезличивание).
- Перезапись зашифрованных ответов анкеты без секций `health`/`safety`, schema
  1.2.
- Запись в `audit_logs` с action `health_minimization_purge`.

## Подтверждение

- [ ] Перед purge выполнен `inventory_health_minimization_purge_v1()` и список
      показан владельцу.
- [ ] Владелец дал прямую команду на применение
      `purge_health_minimization_data_v1`.
- [ ] Smoke анкеты (schema 1.2, warning) пройден до purge.

Подпись владельца: **\*\***\_**\*\***
