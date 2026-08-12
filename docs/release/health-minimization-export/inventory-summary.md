# Инвентарь ответов до миграции schema 1.2

Снято: 2026-08-12 01:09 MSK  
Полный файл: `pre-migration-answers-2026-08-12.json` (расшифрованные answers)

## Счётчики

| Источник           | Строк с answers_encrypted | У всех есть секции health+safety |
| ------------------ | ------------------------: | -------------------------------- |
| `trial_intakes`    |                         4 | да                               |
| `trial_candidates` |                         5 | да                               |

## Идентификаторы (без содержимого ответов)

### trial_intakes (PK = client_id)

- `45d9e94c-f6ec-4ba7-9e19-0c2be9098eb1` — status approved, step 5, schema 1.1
- `7397a9db-03bb-45ce-a202-74b3aea2836e` — status approved, step 5, schema 1.1
- `9bc6f6c3-77e1-49cd-a270-ab3356f8bdb6` — status approved, step 5, schema 1.1
- `c3a19a47-313f-4379-8f10-1768d0aec97b` — status approved, step 5, schema 1.1

### trial_candidates (PK = id)

- `3666a59d-cf42-40ee-8c7d-f25679a0ee20` — promoted, step 5, schema 1.1
- `6e19b47e-c05e-46b5-a64f-1031d5162ade` — promoted, step 5, schema 1.1
- `b8a513fc-255a-4d5a-a2a3-7a20ebd357b7` — promoted, step 5, schema 1.1
- `c4659a02-60c4-437b-9224-8ae475e29524` — promoted, step 5, schema 1.1
- `fa1b4c60-95e9-4aa3-8707-db87c3a28db1` — promoted, step 5, schema 1.1

## Что снимет intake-миграция

`UPDATE` в `2026-08-11_health_minimization_intake_v1.sql` удаляет ключи `health`
и `safety` из answers, ставит `meta.schema_version = 1.2`,
`current_step = LEAST(step, 4)`, добавляет пустой `warning: {}`.

## Профили с cycleTrackingEnabled=true (для отдельного disable\_\*)

5 строк `heys_profile`:  
`4545ee50…`, `45d9e94c…` (qwe qwe), `5d067903…` (s), `c3a19a47…` (тестовый
пупсик), `e0011f63…` (Андрей Агапитов).
