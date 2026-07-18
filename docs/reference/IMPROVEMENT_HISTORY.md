# История закрытых проблем HEYS

Это короткий журнал результатов, удалённых из активного
[`IMPROVEMENT_BACKLOG.md`](IMPROVEMENT_BACKLOG.md). Он нужен для поиска причины
регрессии и связанных тестов, но не является второй очередью задач.

| Дата       | ID          | Что изменилось                                                                                              | Основная регрессия / evidence                                                                                                               |
| ---------- | ----------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-17 | P0-01       | Mobility onboarding стал fail-closed для возраста и disclaimer                                              | `mobility-assessment-readiness.test.js`, `mobility-entry.test.js`, `mobility-ui.test.js`                                                    |
| 2026-07-17 | P0-02       | Ошибка game cloud precheck блокирует upload; stale semantic revision отклоняется server merge-save          | `gamification-cloud-sync-guard.test.js`, `merge-scalar-kv-meta.test.js`                                                                     |
| 2026-07-18 | P1-01…P1-04 | Унифицированы шкала score history, выбор последнего meal, `grams: 0` и missing shared product gate          | `predictive-score-history-scale.test.js`, `status-latest-meal-time.test.js`, `item-grams-zero-contract.test.js`, overlay/product gate tests |
| 2026-07-18 | P1-05       | Mobility pair-save получил явные outcomes и идемпотентный retry                                             | mobility UI/records, training diary и storage fault-injection tests                                                                         |
| 2026-07-18 | P2-01       | Keyed reminders получили lease, delivered commit и безопасный retry                                         | `heys-cron-reminders/__tests__/push-idempotency.test.js`                                                                                    |
| 2026-07-18 | P2-02       | Function inventory, deploy classifier, worker heartbeat и независимый dead-man сведены в проверяемый контур | function inventory и ops-status tests; production deployment оставался отдельным шагом                                                      |
| 2026-07-18 | P2-03       | Client write-access решения сведены к fail-closed `canWriteStatus`                                          | `subscription-curator-guard.test.js`; server KV gate остаётся независимым                                                                   |
| 2026-07-18 | P2-04       | Curator lead callback стал авторизованным и идемпотентным в общем polling worker                            | `lead-taken-callback.test.cjs`                                                                                                              |
| 2026-07-18 | P2-05       | Leads API нормализует и валидирует российский телефон до DB и side effects                                  | `phone-validation.test.cjs`                                                                                                                 |

## Правило ведения

После закрытия активной проблемы сюда добавляется одна строка: дата, ID,
изменившийся контракт и тест или runtime evidence. Подробный отчёт реализации,
число прогонов и временные deployment-оговорки сюда не копируются; они остаются
в diff, commit или профильном runbook.
