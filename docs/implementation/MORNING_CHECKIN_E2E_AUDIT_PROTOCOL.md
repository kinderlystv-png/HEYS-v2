# Протокол: end-to-end аудит утреннего чек-ина

> **Дата:** 2026-07-19 **Статус:** завершено

## UI-гейт

Цель — один спокойный, возобновляемый чек-ин; главное действие — сохранить
текущий шаг и продолжить; слой 1 — шаг, прогресс и честный статус сохранения;
слой 2 — диагностический trace; критическое не скрывать — несохранённый шаг и
обязательную проверку прошлых дней.

## Критерий успеха

Flow открывается только на готовых данных, сохраняет каждый подтверждённый шаг
локально ровно один раз, возобновляется после прерывания, не зависит от сети,
получает cloud-ack после отправки и не может завершиться дважды или миновать
актуальный `YesterdayVerify`.

## Результаты

1. **Readiness и повторный вход — готово.** План ждёт полный initial sync;
   журнал сохраняет `flowId`, терминальные ответы и восстанавливает только
   незавершённые шаги.
2. **Local-first и offline — готово.** Шаг переходит сразу в `saved_local`, а
   отсутствие uploader отмечается как `sync_unavailable` и не блокирует UI.
3. **Единственный переход — готово.** Убрана двойная запись `saved_local` для
   одного шага; синхронные повторные нажатия закрыты in-flight guard до
   завершения save/finalize.
4. **Финал и прошлые дни — готово.** Перед session-флагом повторно проверяется
   `YesterdayVerify`; новый обязательный шаг возвращает flow в `open`.
5. **Плавность и диагностика — готово.** Успешные status/AuthInit events больше
   не засоряют warning-канал; touch-слайдер не вызывает `preventDefault` из
   passive listener.
6. **Проверка — готово.** 78/78 точечных тестов и syntax-check прошли;
   reference-check: 146 ссылок, 16 паспортов. Read-only mobile smoke после
   сборки: один основной экран, 0 ошибок, 0 новых AuthInit warnings и 0 passive
   listener warnings. Web/API отвечают 200.
7. **Локальный QA — готово.** Scoped bundle обновил только затронутые scope:
   `boot-app` → `5f91cf5c5ea8`, `postboot-3-ui-lazy` → `5ad95570117d`.

## Facts Table

| Утверждение                                | Источник                                                                  | Проверка                        | Результат                         |
| ------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------- | --------------------------------- |
| План ждёт полный sync                      | `heys_app_morning_checkin_v1.js:82-113`, readiness test `:83`             | targeted Vitest                 | 2/2                               |
| Один tap не запускает второй save/finalize | `heys_step_modal_v1.js:513,736-817`, flow-resume test `:208`              | двойной DOM click в одном `act` | 1 save, 1 complete                |
| Один шаг создаёт один status transition    | `heys_morning_checkin_v1.js:1421-1429,1692-1730`, flow-resume test `:456` | подсчёт `step_status` events    | 1                                 |
| Offline не блокирует следующий шаг         | `heys_morning_checkin_v1.js:1716-1729`, flow-resume test `:479`           | uploader отсутствует            | `saved_local`, `sync_unavailable` |
| Очередь даёт явный cloud-ack               | `heys_morning_checkin_v1.js:1834-1860,2158-2161`, flow-resume test `:423` | queue-drain helper              | `synced`, pending=false           |
| Финал не минует прошлые дни                | `heys_morning_checkin_v1.js:1805-1832`, flow-resume test `:397`           | финальная повторная проверка    | flow=`open`                       |
| Happy-path trace/AuthInit не warning       | `heys_client_log_trace_v1.js:655`, `heys_app_auth_init_v1.js:189`         | source test + runtime logs      | 0 новых warnings                  |
| Touch drag не вызывает passive warning     | `heys_steps_v1.js:122-131`                                                | source test + runtime console   | 0 passive warnings                |

## Оставшийся ручной риск

Полный реальный сценарий с отключением сети и последующей серверной сверкой
нельзя безопасно прогнать на пользовательском профиле без изменения его данных;
он закрыт детерминированным local-first/cloud-ack тестом, а runtime smoke
остаётся read-only.
