# HEYS · ИСПДн gap-list перед R0

Статус: R0 working gap-list / external legal-security sign-off pending. Это не
финальное заключение по уровню защищенности ИСПДн, а рабочая карта того, что уже
закрыто локально и что нельзя считать закрытым без внешней проверки, публикации
РКН-изменений или live-smoke.

## Область

HEYS обрабатывает обычные ПДн, online identifiers, платежные данные на R1 и
специальную категорию на практике: данные о здоровье, питании, активности,
самочувствии, сне, весе, цикле и readiness. Канонический реестр полей:
[heys-data-register.md](heys-data-register.md).

## Предварительная модель

Рабочая модель угроз для R0 вынесена в
[heys-ispdn-threat-model-r0.md](heys-ispdn-threat-model-r0.md). Фактические
production-доказательства текущего прохода собраны в
[heys-r0-live-evidence-2026-07-26.md](heys-r0-live-evidence-2026-07-26.md).

| Вопрос                               | Рабочее решение                                                                                                                      | Статус        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Оператор                             | ИП Поплавский Антон Сергеевич                                                                                                        | ✅            |
| Запись РКН                           | Одна запись оператора `26-22-005319`; HEYS-цели и специальные данные о здоровье опубликованы и сверены 2026-07-26                    | ✅            |
| Тип ИСПДн                            | Интернет-сервис с БД в Yandex Cloud РФ, клиентским кабинетом, кураторским доступом, ботом и платежами на R1                          | ✅            |
| Категории ПДн                        | обычные ПДн, online identifiers, спец. категория здоровья, платежные данные на R1                                                    | ✅            |
| Уровень защищенности по ПП РФ № 1119 | рабочий УЗ-4 для R0: спецкатегория, менее 100 000 субъектов, не работники, угрозы типа 3                                             | ✅ R0         |
| Модель угроз                         | рабочая модель и fail-closed условия переклассификации зафиксированы в `heys-ispdn-threat-model-r0.md`; внешний sign-off нужен до R2 | ✅ R0 / 🟡 R2 |

## Что уже закрыто локально

| Контур                        | Доказательство                                                                                        | Статус |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ------ |
| Реестр данных                 | [heys-data-register.md](heys-data-register.md)                                                        | 🟡     |
| Матрица доступа               | [heys-access-matrix.md](heys-access-matrix.md)                                                        | ✅     |
| Health-key encryption         | `heys_profile`, `heys_dayv2_*`, `heys_hr_zones` описаны как health-key контур                         | ✅     |
| Consent/proof                 | `personal_data`, `health_data`, `marketing`, `payment_oferta`; smoke consent/proof пройден 2026-06-14 | ✅     |
| Audit curator access          | `data_access_audit_log`, `log_data_access()`; live SQL подтвердил curator health rows 2026-06-14      | ✅     |
| Break-glass                   | процедура описана в [heys-pdn-incident-playbook.md](heys-pdn-incident-playbook.md)                    | ✅     |
| Funnel/event log minimization | health/PII metadata strip зафиксирован в реестре и privacy guard                                      | ✅     |
| Monthly audit/preflight       | [heys-pdn-monthly-audit.md](heys-pdn-monthly-audit.md), `pnpm pdn:monthly-audit`                      | ✅     |
| Incident 24/72 owner          | ИП Поплавский А.С. назначен ответственным до делегирования                                            | ✅     |

## Открытые gaps

| Gap                                    | Почему блокирует / где нужен                                                                                 | Владелец до делегирования   | Следующее действие                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------- |
| РКН-изменение по записи `26-22-005319` | R0: HEYS-цели и специальные данные о здоровье опубликованы и сверены 2026-07-26                              | ИП Поплавский А.С.          | поддерживать актуальность через data-change gate и monthly audit                   |
| Внешняя проверка УЗ-4 и модели угроз   | R2: рабочее решение R0 принято; до масштабирования нужен независимый sign-off                                | ИП + внешний legal/security | проверить `heys-ispdn-threat-model-r0.md`, меры № 21 и остаточные риски            |
| `6Б.3` write-context strict            | ✅ R0 2026-07-26: production flag `1`, PIN/curator writes и новое окно SEC-004 `ready=true` без warn         | тех                         | продолжать штатное observation                                                     |
| `6Б.4` REST read strict                | ✅ R0 2026-07-26: production flag `1`, anon=401, A→B=403, own/curator=200; SEC-024 `ready=true`              | тех                         | продолжать штатное observation                                                     |
| Telegram lead notification live smoke  | ✅ R0 2026-07-26: live DB/handoff/replay и claim-клик, handoff без phone/name/raw chat id; синтетика удалена | тех                         | штатно следить за poll heartbeat                                                   |
| Payment metadata live smoke            | R1: перед первой оплатой доказать, что ЮKassa metadata не несет health                                       | тех                         | secrets + deploy `heys-api-payments`, create/webhook/refund/log smoke              |
| Первая monthly audit запись            | R2: перед масштабированием нужен фактический журнал сверки                                                   | ИП Поплавский А.С.          | заполнить после запуска/RKN-подачи или перед R2                                    |
| Incident drill                         | R2: playbook есть, но не проверен руками                                                                     | ИП Поплавский А.С.          | провести drill 24/72 и сохранить запись вне репо                                   |
| External legal/security sign-off       | R2/R3: масштабирование и внешние кураторы без него рискованны                                                | ИП + внешний проверяющий    | заполнить [legal-signoff-template.md](legal-signoff-template.md), хранить вне репо |

## Минимальный R0-вывод

РКН-часть, рабочее решение по ИСПДн и технические R0-гейты закрыты 2026-07-26:
запись опубликована, тип 3 / УЗ-4 зафиксированы, strict read/write, IDOR,
PIN/curator sync и Telegram lead/claim без ПДн проверены в production. R0
закрыт; импорт календаря обязательств остаётся плановым способом напоминания, но
не release-gate. До первой оплаты дополнительно нужен платежный live-smoke R1.
