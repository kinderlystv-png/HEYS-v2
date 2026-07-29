# HEYS «Собери день» — production-мегаплан

> Файл намеренно назван `assemble_prodution_megaplan.md` по запросу владельца
> продукта.<br> Статус: активный последовательный план развития<br> Версия: 1.2
> · Sprint 0 truth/evidence contract<br> Дата актуализации: 2026-07-30<br>
> Область: базовая вымышленная кампания до персонального режима и кураторской
> интеграции Текущий gate: Sprint 0 `DONE`; следующий разрешённый prompt —
> Sprint 1

[← К документации «Собери день»](./README.md)

---

## 1. Как пользоваться этим документом

Спринты выполняются строго по порядку. Следующий промпт берётся только после
выполнения критериев предыдущего спринта либо явной записи владельца продукта о
пропуске gate.

1. Скопировать промпт спринта целиком.
2. Проверить актуальные файлы, `git status` и последние записи журнала.
3. Выполнить только scope спринта и его проверки.
4. Дописать короткий фактологический лог в конец документа.
5. Не переписывать старые записи: журнал append-only.

### 1.1. Словарь статусов

- `FACT` — подтверждено кодом, отчётом или прямым человеческим evidence.
- `HYPOTHESIS` — требует заранее описанной проверки на людях.
- `DECIDED` — принято в `10_DECISION_REGISTER.md` и раскрыто в owner-модуле.
- `DEFERRED` — сознательно не входит в текущий gate.
- `BLOCKED` — обязательный gate не пройден.
- `SKIPPED_BY_GATE` — условная работа не нужна по evidence; это не `DONE`.

Severity ниже относится к production-маршруту. Она не переписывает историю
`vertical-slice-evaluation-v0.1.md`.

### 1.2. Постоянный Definition of Done implementation-спринта

Каждый копируемый промпт считает этот раздел частью своего scope.

1. **Ownership.** Новое продуктовое решение получает `D…`; открытая развилка не
   кодируется молча.
2. **Совместимость.** Классифицируются `schema`, `scenario`, `calibration`,
   `technical`, `envelope` и `trace` версии. Старый checkpoint либо мигрирует
   доказанно, либо сохраняется с явным fail-closed экраном. Silent reset и
   пересчёт активной кампании новыми правилами запрещены.
3. **Причинность.** Формулы, branching, availability и causal aggregates
   принадлежат engine/content contract. UI только отображает причину, цену,
   направление и confidence.
4. **Два журнала.** Human history не содержит raw ID/path/delta; replay-safe
   technical trace не содержит client ID и данных дневника.
5. **Сохранение.** Checkpoint создаётся только после reducer/setup/planning
   step. Измеряется полный envelope:
   `(key.length + JSON.stringify(envelope).length) * 2`.
6. **Click-only loading.** До клика нет request/registration/execution JS/CSS
   игры; игра не входит в eager legacy bundles.
7. **UI и copy.** Перед UI-правкой фиксируется `UI-гейт`; проверяются основной
   flow, второй слой, 390×844, desktop, keyboard/focus/screen reader, 200% zoom,
   reduced motion и overflow. Перед текстом читается
   `apps/landing/COPY_VOICE.md`.
8. **Проверки.** Сначала focused source tests, затем
   `pnpm --dir apps/web bundle:assemble-day`.
   `pnpm bundle:legacy:auto --files=<свои legacy source-файлы>` запускается лишь
   для реально затронутого legacy scope; full legacy build запрещён. После
   reference-правок — `pnpm docs:reference:check`.
9. **История.** `CHANGELOG.md` владеет версиями, журнал ниже — execution-log с
   evidence и gate.

### 1.3. Формат журнала

```md
### YYYY-MM-DD · Sprint N · DONE | PARTIAL | BLOCKED | SKIPPED_BY_GATE

- Игрок: …
- Механика: …
- Документация: …
- Проверки: …
- Evidence: …
- Gate: …
- Осталось: …
```

Планы нельзя записывать как сделанную работу. Формулировки «улучшено» и «готово»
без конкретного результата запрещены.

---

## 2. Вердикт глубокого аудита

Сейчас это рабочий семидневный причинный прототип, но ещё не доказанная игра на
длинную дистанцию. Технический QA подтверждает детерминизм и отсутствие тупиков,
однако не доказывает справедливость необратимого касания, удовольствие, желание
переиграть или возвращаться между сессиями.

### Что уже действительно работает

- 31 engine-action, 38 scenario slots и 42 event templates;
- сон, питание, кофеин, движение, работа, семья, деньги и обязательства;
- engine-owned `ActionOffer`, reducer-step и result beat;
- заранее приготовленная порция и отдельное действие «Приготовить завтрак»;
- известная цена до необратимого первого касания по D61;
- causal echoes, стабилизирующие пути, same-seed replay и четыре оси итога;
- client-scoped checkpoint с явными stale/foreign/incompatible состояниями;
- копируемый replay-safe trace и click-only standalone загрузка;
- единый уровень сложности, без XP, общего уровня и `win/lose`.

### Подтверждённые production-разрывы

| Severity  | Разрыв                               | Evidence                                                                                                       | Почему это важно                                                                   |
| --------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| S1        | Privacy seed                         | Web формирует seed с raw `clientId`, который попадает в `campaignId`/RNG                                       | Вымышленный state содержит идентификатор реального профиля                         |
| S1        | Checkpoint почти без запаса          | Один воспроизводимый planned-week state занимает 509 890 UTF-16 bytes при cap 512 KiB ещё до envelope/key      | Расширение истории или 30 дней может перестать сохраняться                         |
| CLOSED S0 | Два маршрута истины                  | README, roadmap и мегаплан теперь фиксируют `Sprint 0 DONE → Sprint 1`; human gate — Sprint 6                  | Закрыто документальным контрактом v0.32                                            |
| S1        | Бесплатная ёмкость планирования      | Фокусы и weekly rules уменьшают effort/pressure без резервирования ресурса                                     | Стратегия создаёт скрытые бесплатные скидки                                        |
| S1        | Нет замкнутого контракта недели      | До planning нет полного brief, финал не показывает engine `openThreads`                                        | Итог нельзя сверить с изначальными ставками                                        |
| S1        | D4 неполон                           | Нет настоящего day boundary summary; result не всегда показывает направление; итог раскрывает internal numbers | Причинность верна в коде, но не обязательно понятна человеку                       |
| S1        | Развитие частично декоративно        | Habits/planning отображаются без достаточного downstream; `late_work` может называться `improved`              | Игра обещает развитие и морализует паттерн поведения                               |
| S1        | Нет runtime rule-evidence binding    | Registry v0.1 создан в `09_CALIBRATION_QA.md`, но stable ID ещё не привязан к runtime rules/claims             | До Sprint 5 нельзя проследить конкретный пользовательский claim до строки registry |
| S1        | Human protocol наводит               | Задания заранее называют цену, echo и причинную цепочку; first-touch не veto                                   | Положительный тест может измерять послушание инструкции                            |
| S2        | Technical trace не равен UX evidence | Trace не хранит экран, касание, details, паузу, exit/reload                                                    | Он доказывает reducer, но не поведение человека                                    |
| S2        | Content ownership раздвоен           | Полный copy в web; engine содержит заглушки и raw codes                                                        | Headless и UI могут объяснять одну механику по-разному                             |
| S2        | Accessibility не доказана            | Radio/focus flow неполон                                                                                       | Mouse smoke не доказывает доступность выбора                                       |
| S2        | QA не замыкает расширения            | Нет обязательного full report после family/economy/replay и 30-day/policies                                    | Human gate может тестировать build без массового отчёта                            |
| S2        | Month был сверхшироким шагом         | Engine ограничен днями 0…6, 38 slots, одним planning lock и недельным budget                                   | Регрессии lifecycle, persistence и content невозможно локализовать                 |

### Непроверенные гипотезы

- 38 решений могут утомлять, но decision fatigue не измерен;
- fixed character может давать слабые эмоциональные ставки, но это не факт;
- locked weekly contract может уменьшать агентность, но это не подтверждено;
- семья и экономика входят в target scope, но не доказано, что именно их глубины
  не хватает интересу;
- ограниченная вариативность seed — технический факт, её вред для replay —
  H23/H31;
- месячный итог не является дефектом семидневного slice до существования
  реального месяца.

### H33 — реальная траектория клиента как развитие персонажа

Идея владельца продукта зафиксирована на будущее: минимальные агрегированные
данные HEYS могут помогать человеку видеть свою долгосрочную траекторию через
персонажа. Это не цифровой диагноз, не импорт каждого события дневника и не
«сила персонажа за хорошее поведение».

Статус: `HYPOTHESIS / DEFERRED`. Канонический ID `H33` зарегистрирован в
`11_HYPOTHESES_BACKLOG.md`. До Sprint 20 запрещены импорт данных, профилирование
и кураторская интеграция. Первый допустимый эксперимент — storyboard на
полностью синтетических данных: понимает ли человек границу «модель персонажа ≠
оценка меня», видит ли пользу, доверяет ли источнику и понимает ли
consent/deletion.

### Постоянные запреты до отдельных gates

- реальные данные дневника, автоматический импорт и куратор;
- диагнозы, назначения и медицинские обещания;
- редактор внешности и демографическая персонализация fixed slice;
- XP, score, streaks, общий уровень и выбор сложности;
- скрытый rubber-banding и моральные оценки;
- runtime automation до доказанной усталости от повторов.

---

## 3. Последовательность спринтов v1.1

| Sprint | Название                                     | Gate                                                               |
| -----: | -------------------------------------------- | ------------------------------------------------------------------ |
|      0 | Truth, decisions и rule-evidence contract    | `DONE` 2026-07-30: один маршрут и матрица FACT/HYPOTHESIS/DEFERRED |
|      1 | Privacy, checkpoint и delivery foundation    | Нет client ID; storage/trace имеют запас                           |
|      2 | Честная ёмкость планирования                 | Нет бесплатных скидок                                              |
|      3 | Campaign brief и итоги D4                    | Начало и финал сверяют один контракт                               |
|      4 | Причинно честное развитие                    | Прогресс влияет дальше без морализации                             |
|      5 | Context, confidence, content ownership, a11y | Один authored source; flow доступен                                |
|      6 | Formative human gate                         | Неподсказанная причинность и интерес оценены отдельно              |
|      7 | Full QA human-tested build                   | 10 000 × 7 на отдельном runner                                     |
|      8 | Самостоятельность семьи                      | D21–D23 реализованы компактно                                      |
|      9 | Экономика и карьера                          | Setup reducer и честный горизонт                                   |
|     10 | Replay/content по evidence                   | Условный спринт, иначе SKIPPED_BY_GATE                             |
|     11 | Full QA expanded week                        | Расширенный slice имеет свой report                                |
|     12 | Stage 6 human exit gate                      | Семидневный slice получил PASS/PASS                                |
|     13 | Longitudinal GO/NO-GO                        | Доказана ценность возврата до постройки месяца                     |
|     14 | Month lifecycle/headless contract            | Периоды и resets атомарны                                          |
|     15 | Playable 30-day cycle                        | Месяц возобновляем и имеет итог                                    |
|     16 | Runtime policies                             | Только при observed repetitive burden                              |
|     17 | Full QA long-horizon                         | 30-day build имеет свой report                                     |
|     18 | Longitudinal human exit gate                 | Межсессионный месяц проверен людьми                                |
|     19 | Breadth GO/NO-GO                             | Решено, когда расширять configurations                             |
|     20 | Gate longitudinal mirror H33                 | Только решение; реального импорта нет                              |

### Жёсткие переходы

- Sprint 6 — formative gate. До него хватает focused tests и короткого
  последовательного smoke; тяжёлый mass-QA не задерживает раннюю проверку
  людьми.
- После Sprint 6 нужны causality=`PASS`, first-touch veto и отсутствие S0/S1.
  При interest=`WARN` допустим один evidence-selected эксперимент; при `FAIL`
  расширение блокируется.
- Sprint 7 проходит до family/economy. Sprint 10 запускается только при
  evidence, что replay упирается в вариативность.
- Sprint 12 требует `PASS/PASS`; `WARN` не разрешает переход к месяцу.
- Sprint 14 начинается только после `GO` Sprint 13. Sprint 16 — только после
  наблюдаемой repetitive burden.
- Sprint 20 требует PASS Sprints 17–18 и отдельного продуктового, экспертного,
  правового и privacy-разрешения.

### Матрица ключевых гипотез

| Гипотеза                                 |    Sprint | Evidence                                     | Сейчас       |
| ---------------------------------------- | --------: | -------------------------------------------- | ------------ |
| H29 — first-touch справедлив             |         6 | Неподсказанный first run и veto              | Не проверена |
| H30 — result beat раскрывает причинность |         6 | Prediction → choice → result → next choice   | Не проверена |
| H31 — same-seed replay интересен         | 6, 10, 12 | Фактическая вторая стратегия                 | Не проверена |
| H32 — тяжёлое состояние даёт адаптацию   |     6, 12 | Два разных платных стабилизатора             | Не проверена |
| H23 — случайность честна                 |        12 | Отличение внешнего события от echo           | Не проверена |
| H26 — недели хватает для каскада         |     6, 12 | Естественная полная неделя                   | Не проверена |
| H33 — агрегаты HEYS ценны как mirror     |        20 | Synthetic storyboard + privacy comprehension | Deferred     |

---

## Sprint 0 — Truth, decisions и rule-evidence contract

**Статус:** `DONE` 2026-07-30. Не выполнять повторно без нового подтверждённого
противоречия; execution evidence — в журнале §6.

### Результат

README, roadmap, register, backlog и мегаплан дают одну очередь. Каждое
обязательство имеет owner-doc, runtime evidence и статус; содержательные правила
получают evidence registry до изменения формул.

### Промпт

```text
Продолжи HEYS «Собери день»: выполни Sprint 0 из docs/assemble-day/assemble_prodution_megaplan.md — синхронизируй канонический маршрут, открытые решения и rule-evidence contract. Это docs/contract sprint без изменения игрового поведения.

Проблемы: README отправляет сразу в human gate, production-мегаплан содержит обязательные privacy/persistence blockers; 05_STATE_CAUSAL_ENGINE.md §16 и 08_VERTICAL_SLICE.md §14 требуют source/population/transfer/confidence, но исполнимого registry нет; вопросы семьи, занятости и month lifecycle открыты в backlog.

Изучи README, 01–12 owner-docs, D1–D68, implementation contracts, reference dossier и Facts Table мегаплана. Составь матрицу `обязательство/решение → owner-doc → runtime evidence → FACT/HYPOTHESIS/DEFERRED → sprint`. Устрани противоречия статусов без переписывания истории. Зарегистрируй H33 о longitudinal mirror агрегатов HEYS как deferred hypothesis, не решение.

В существующем owner calibration создай versioned rule-evidence registry либо сначала зафиксируй ownership-решение. Для правила нужны stable ID, механика, тип основания D45, источник, популяция, граница переноса, допустимая формулировка и экспертный статус. Не меняй коэффициенты.

Критерии: один next step во всех маршрутных документах; month summary DEFERRED до реального месяца; replay diversity остаётся hypothesis; blocking decisions Sprints 8/9/14 перечислены; H33 зарегистрирована; Facts Table содержит runnable checks; `pnpm docs:reference:check` проходит. Добавь append-only запись с Evidence и Gate.

Не меняй engine, UI, calibration, QA-пороги или causal reports. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 1 — Privacy, checkpoint и delivery foundation

### Результат

GameState не содержит client ID; checkpoint имеет измеримый запас; trace
восстанавливается из компактной истории; standalone остаётся click-only.

### Промпт

```text
Продолжи HEYS «Собери день»: реализуй Sprint 1 из docs/assemble-day/assemble_prodution_megaplan.md — privacy, checkpoint scalability и standalone delivery foundation.

Блокеры: web seed содержит raw clientId, который попадает в state; один воспроизводимый planned-week state занимает 509 890 UTF-16 bytes при cap 512 KiB ещё до envelope/key; checkpoint дублирует большие истории; standalone generator вызывается отдельно от legacy auto workflow.

Изучи D6, D7, D42, D67, 07_HEYS_INTEGRATION_SAFETY.md, GAME_STATE_SCHEMA.md, reducer protocol, storage registry/interceptor, envelope/ledger/trace и bundle/loader tests. Сначала зафиксируй version/compatibility matrix §1.2.

Сделай opaque game seed без clientId; clientId остаётся только store boundary. Старые snapshots не переписывай молча. Спроектируй bounded checkpoint без двух полных историй: deterministic resume, human history и локальное восстановление trace через replay. Утверди byte budget с запасом и докажи worst-case недели; для месяца зафиксируй hard ceiling/dependency, если lifecycle ещё не позволяет расчёт.

Privacy QA проверяет значения: UUID клиента отсутствует в serialized state, campaignId, ledger и copied trace. Сохрани reload, stale/foreign/corrupt/incompatible recovery, revision conflict и replay. Докажи exact standalone workflow и click-only: до клика 0 requests/registration/execution, после — один JS и CSS. Зафиксируй bytes JS/CSS/checkpoint/trace.

Критерии: raw clientId отсутствует; weekly envelope укладывается в budget; trace replay совпадает; данные не теряются; standalone воспроизводим; постоянный DoD §1.2, focused engine/web/storage/lazy tests, `pnpm --dir apps/web bundle:assemble-day`, только необходимый scoped legacy bundle, smoke 390×844/desktop и `pnpm docs:reference:check` проходят. Полный causal QA не запускать. Добавь лог с bytes, Evidence и Gate.

Не подключай дневник, персональный режим или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 2 — Честная ограниченная ёмкость планирования

### Результат

Фокусы и weekly rules помогают только через объяснимое резервирование времени,
денег, внимания, обязательств или окна; у каждой поддержки есть встречная цена.

### Промпт

```text
Продолжи HEYS «Собери день»: реализуй Sprint 2 из docs/assemble-day/assemble_prodution_megaplan.md — честную ограниченную ёмкость weekly contract и priorities. Сначала проверь DONE Sprints 0–1.

Проблема: planning.ts уменьшает effort/pressure для focus и трёх weekly rules без резервирования встречного ресурса. Это бесплатная скидка, а не стратегия.

Изучи D13/D36/D62/D66, planning contracts, reducer, UI и rule evidence. Для каждого benefit назови реальный источник: protected window, budget, заранее сделанный setup, сокращённое обязательство или отказ от конкурирующей задачи. Добавь counterfactual одинакового state с/без плана; помощь в одном домене обязана иметь opportunity cost или ограниченную ёмкость в другом.

Planning остаётся атомарным reducer-step и не двигает clock/cursor/RNG. UI до подтверждения показывает capacity, conflicts и pressure из engine; branching/formulas в UI запрещены. Monthly priorities на семидневном slice называй горизонтом, не фиктивным месячным результатом.

Критерии: ни один focus/rule не облегчает действие без источника; counterfactual показывает цену; конфликт виден; journals называют вход; постоянный DoD §1.2, focused tests, короткий sequential QA smoke, standalone/scoped bundle, browser smoke и `pnpm docs:reference:check` проходят. Полный report оставить Sprint 7. Добавь лог с Evidence и Gate.

Не подключай персональные данные, куратора, score или сложность. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 3 — Campaign brief и настоящие итоги D4

### Результат

До planning виден контракт недели. Result показывает направление; на реальной
границе дня появляется один summary; финал сверяет brief, rules, четыре оси и
open threads.

### Промпт

```text
Продолжи HEYS «Собери день»: реализуй Sprint 3 из docs/assemble-day/assemble_prodution_megaplan.md — campaign brief и настоящие period summaries D4. Сначала проверь DONE Sprints 0–2.

Проблемы: brief неполон; ResultBeat не всегда показывает направление; DaySummaryCard не используется; WeekScreen не сверяет rules; engine openThreads не показаны; часть user summary раскрывает internal 0–100. MonthScreen сейчас только planning horizon — настоящий month summary DEFERRED.

Изучи 01_PRODUCT_VISION.md, 02_GAMEPLAY_CAMPAIGN.md §13.2, 06_UI_UX.md, D4/D64, scenario slots, campaign.ts, reducer journal и UI. Создай engine-owned campaign brief из фактических задач, обязательств, финансовой границы и пространства выбора. Первый слой показывает миссию и ставки без общего score.

Реализуй idempotent `PeriodBoundary/PeriodSummary` для смены дня и завершения недели. Не определяй границу только по clock: reducer может materialize следующий event заранее. Flow: `ResultBeat → один DaySummary → следующая развилка`; reload не дублирует reducer/journal/summary. Переименуй step summary, чтобы не спутать с day summary.

User-facing итог качественный; raw values/paths остаются diagnostics. Week checkpoint зеркально сверяет brief, rules/commitments/pressure, четыре оси и openThreads. Не симулируй month summary поверх семи дней.

Критерии: новый игрок называет задачу и ставки; на каждой day boundary ровно один итог; reload воспроизводим; финал сверяет тот же contract; постоянный DoD §1.2, focused tests, QA smoke, standalone/scoped bundle, browser smoke и `pnpm docs:reference:check` проходят. Добавь лог с Evidence и Gate.

Не добавляй win/lose, общий score, 30 дней, персональные данные или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 4 — Причинно честное развитие персонажа

### Результат

Показанное развитие меняет будущие decisions и описывается нейтрально
относительно паттерна поведения.

### Промпт

```text
Продолжи HEYS «Собери день»: реализуй Sprint 4 из docs/assemble-day/assemble_prodution_megaplan.md — причинно честное развитие без общего уровня. Сначала проверь DONE Sprints 0–3.

Проблемы: habits/planning отображаются как development, но offers/events читают их не полностью; усиление late_work/caffeine_compensation может называться improved. Это декоративная причинность и морализующая подпись.

Изучи 02_GAMEPLAY_CAMPAIGN.md §13.1, 05_STATE_CAUSAL_ENGINE.md, D12/D52/D63/D65, state/actions/scenario/reducer/campaign и LifeScreen. Для каждого типа составь карту `source → accumulation → threshold → future offer/event → counterfactual → journal evidence`. Skill может менять effort/availability, habit — friction, infrastructure — конкретное окно, capability — набор стратегий. Накопление допустимо без мгновенного эффекта, если порог объясним.

Замени `improved/worsened` нейтральным `strengthened/weakened/changed` относительно паттерна. Если показателю нечем менять будущее, оставь его в history и не называй development. Не добавляй XP, tree или невидимый общий bonus.

Критерии: каждый элемент development имеет downstream/counterfactual test либо исключён; минимум две стратегии открывают разные возможности; human journal объясняет практический эффект, trace — точный вход; постоянный DoD §1.2, focused tests, QA smoke, standalone/scoped bundle, browser smoke и `pnpm docs:reference:check` проходят. Добавь лог с Evidence и Gate.

Не добавляй общий уровень, badges, персональные данные или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 5 — Context, confidence, content ownership и accessibility

### Результат

Существенные входы и confidence видны до выбора; authored copy принадлежит
content contract; human history отделена от diagnostics; flow доступен без мыши.

### Промпт

```text
Продолжи HEYS «Собери день»: реализуй Sprint 5 из docs/assemble-day/assemble_prodution_megaplan.md — единый content/evidence contract, контекстную ясность и accessibility. Сначала проверь DONE Sprints 0–4.

Проблемы: важные входы не всегда видны; authored EVENT_COPY/action copy живёт в web, engine содержит заглушки/raw codes; known conditional effects и unavailable reasons не имеют одного human contract; role=radio/focus flow неполон.

Изучи D3/D24/D30/D34/D39/D45–D46, 05 §16, 06, 08 §14 и content budget, schemas, Sprint 0 registry, action/scenario contracts и UI. Перед copy прочитай apps/landing/COPY_VOICE.md. Перенеси title/situation/causeHint, option labels, known conditional effects и unavailable reasons в engine/content. Причина ссылается на ruleEvidenceId, confidence и transfer limit. UI не ветвится по IDs и не вычисляет последствия.

Из одного source сформируй human history без raw ID/path/delta и trace без client ID. Layer 1 показывает только факторы, изменившие offer; layer 2 — цепочку/source/confidence. Добавь предусмотренную fictional HEYS observation-card только на synthetic character data и маркируй как игровое наблюдение.

UI-гейт: цель — понять различие вариантов; главное действие — сравнить известную цену и выбрать; слой 1 — контекст, цена, направление, риск, необратимость; слой 2 — chain/source/confidence; критическое не скрывать — unavailable, conflict, irreversibility, material input.

Реализуй WAI-ARIA radio pattern, visible focus, result focus/announcement, screen-reader labels, 200% zoom, reduced motion, non-color signals и отсутствие overflow.

Критерии: headless/web используют один authored source; нет UI branching copy; human/technical journals разделены; observation не имитирует personal data; flow проходит клавиатурой; постоянный DoD §1.2, focused contract/web/a11y tests, standalone/scoped bundle, smoke 390×844/desktop и `pnpm docs:reference:check` проходят. Добавь лог с Evidence и Gate.

Не добавляй medical claims, formulas в UI, personal data или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 6 — Formative human gate центрального loop

### Результат

На frozen build измерены неподсказанная причинность и игровой интерес;
first-touch имеет отдельный veto, а UX evidence не подменяется technical trace.

### Промпт

```text
Проведи Sprint 6 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — formative human gate центрального loop после DONE Sprints 0–5.

Обнови historical protocol vertical-slice-evaluation-v0.1.md новой versioned редакцией, не переписывая baseline. До рекрутинга зафиксируй screener: взрослые mobile users, не участники разработки, без знакомства с решениями игры; exclusion, consent, anonymization, retention и deletion. Один-два pilot используются только для проверки протокола и не входят в cohort; после pilot заморозь build, script и rubric.

Проведи минимум пять основных сессий. Сначала участник без подсказок входит через HEYS «Игры», проходит первый выбор/result и доступные слои. Не называй заранее цену, echo, contract или нужную chain. Затем он естественно проходит полную неделю; одинаковые targeted probes допустимы только после самостоятельного объяснения. Replay засчитывай по фактическому старту второй стратегии, не обещанию.

First-touch — veto: до касания видны необратимость и известная цена, касание намеренно, человек не ожидает смены выбора после раскрытия. Отдельно оцени prediction→choice→result→next choice, weekly contract, echo, два платных stabilizer, development, brief/final и replay. Causality и interest получают независимые PASS/WARN/FAIL.

Technical trace нужен только для сверки reducer. Отдельный interaction ledger хранит anonymized session ID, timestamp, screen, visible state, touch/keyboard action, details-open, pause, back/exit/reload и quote; без client ID/дневника. Каждый issue получает evidence, severity и отдельную hypothesis.

Критерии: pilots не смешаны с пятью rubric; first-touch veto пройден; causality=PASS; нет S0/S1. При interest=WARN разрешён один evidence-selected experiment и mini-gate; при FAIL Sprints 7–20 BLOCKED. Без реальных участников статус BLOCKED, evidence не выдумывать. `pnpm docs:reference:check` проходит. Добавь лог с cohort, Evidence и Gate.

Не меняй engine, calibration, QA-пороги или решения по одному наблюдению. Не подключай personal data/куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 7 — Full causal QA human-tested build

### Результат

Точный build Sprint 6 получает новый полный отчёт 10 000 seed × 7 QA-policies
без ослабления gates.

### Промпт

```text
Проведи Sprint 7 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — полный causal QA human-tested build. Начинай только при causality=PASS Sprint 6 и отсутствии S0/S1.

Установи фактические schema/scenario/calibration/technical/report версии и immutable source fingerprint. Исторические отчёты не перезаписывай; имя нового отчёта выводи из реального contract, не из предположенной версии.

Полный 10 000 seed × 7 QA-policies прогон выполняй только на отдельном runner/CI либо одним последовательным процессом в согласованное окно. На рабочем ноутбуке не запускай параллельные процессы. Если runner недоступен, подготовь точную command/config, выполни 20-seed smoke и зафиксируй BLOCKED; smoke не является PASS.

Сохрани D60 gates и проверь planning capacity/counterfactuals, boundary idempotency, development downstream/counterfactuals, ruleEvidenceId, multi-stabilization, echo coverage, all action/event/slot coverage, replay mismatch, terminal lock и отсутствие client ID в значениях state/trace. QA PolicyId остаётся типом simulation agent, не runtime feature.

Критерии: 10 000 × 7 завершены; failed gates=0; report/fingerprint относится к build Sprint 6; README, 09_CALIBRATION_QA.md, 12_ROADMAP.md и reference dossier называют один current report; `pnpm docs:reference:check` проходит. Добавь лог с fingerprint, Evidence и Gate.

Не ослабляй пороги, не подбирай calibration под policy, не запускай несколько mass-QA процессов. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 8 — Компактная самостоятельность семьи

### Результат

Партнёр и ребёнок имеют объяснимые окна, обязательства и reciprocity, не
превращаясь в фоновую симуляцию The Sims.

### Промпт

```text
Продолжи HEYS «Собери день»: реализуй Sprint 8 из docs/assemble-day/assemble_prodution_megaplan.md — компактную самостоятельность семьи. Начинай только после PASS Sprint 7.

Проблема: family state хранит available/load/trust, но availability почти не ограничивает помощь, а собственные окна семьи не участвуют в decisions. Сначала сверь D21–D23, 04_FAMILY_SOCIAL.md и блокеры Sprint 8 в backlog. Возраст 7–9 лет уже принят D22 и не открывается заново. Если точные state-поля, расписание/cadence, autonomy boundaries, передача задач, decay нагрузки или запрещённые события меняют schema/content и остаются открыты, оформи решение и останови implementation как PARTIAL/BLOCKED; не кодируй ответ молча.

После решений создай минимальную дискретную модель: known busy windows, current load/energy, concrete commitments и history распределения. Ответ на просьбу детерминированно объясним состоянием, не hidden random refusal. Добавь нагрузочные и положительные reciprocal events. Не вводи moral parent rating.

Критерии: ask_partner_help имеет реальную availability/price; partner/child windows читаются offer/reducer; одно решение партнёра и одно событие ребёнка меняют future choice; есть positive reciprocal path; journal называет вход; несколько viable strategies сохраняются; постоянный DoD §1.2, focused tests, QA smoke, standalone/scoped bundle, smoke 390×844/desktop и `pnpm docs:reference:check` проходят. Добавь лог с Evidence и Gate.

Не добавляй тяжёлые кризисы, диагнозы, gender roles, personal data или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 9 — Экономика и карьерный минимум

### Результат

Выбор занятости проходит отдельным setup reducer; финансовая цель, обязательства
и вложение в возможность создают реальные компромиссы.

### Промпт

```text
Продолжи HEYS «Собери день»: реализуй Sprint 9 из docs/assemble-day/assemble_prodution_megaplan.md — экономический и карьерный минимум. Начинай только после PASS Sprint 8.

Изучи D10/D12–D18, 03_ECONOMY_CAREER.md, backlog и contracts. Рубли, офисно-проектная карьерная семья и офисный/удалённый/проектный форматы уже приняты D16–D18 и не открываются заново. Сначала закрой только оставшиеся решения: income cadence, obligations, первая goal, exact versioned price-book, порядок setup и downstream capabilities. Если ответ меняет schema, до решения код не правь.

Сохрани карьерную семью координатора проектов. Выбор формата реализуй атомарным setup reducer-step до planning, с revision, journal, trace и resume; UI не мутирует initial state. Форматы различаются доходом, schedule, commute, stability, planning freedom и evening intrusion. Добавь одну goal, несколько obligations и одно вложение в обучение/infrastructure, открывающее конкретное действие или окно, а не общий процент.

Критерии: setup-step воспроизводим; нет universal best format; есть viable baseline; goal видна до выбора и в summary; deficit мягкий без hidden debt/terminal state; investment меняет offers; постоянный DoD §1.2, focused tests, QA smoke, standalone/scoped bundle, smoke 390×844/desktop и `pnpm docs:reference:check` проходят. Коэффициенты версионируй; добавь лог с Evidence и Gate.

Не добавляй credits, investments market, real vacancies, personal data или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 10 — Содержательное разнообразие и replay по evidence

### Результат

Спринт выполняется только если люди хотят replay, но упираются в однообразие;
иначе получает `SKIPPED_BY_GATE`.

### Промпт

```text
Продолжи HEYS «Собери день»: выполни условный Sprint 10 из docs/assemble-day/assemble_prodution_megaplan.md — content diversity и replay. Начинай только после PASS Sprint 9 и evidence Sprint 6, что H31 ограничена вариативностью. Если replay не нужен из-за broken loop, запиши SKIPPED_BY_GATE и код не меняй.

Технический факт: 38 fixed slots и 42 templates ограничивают пространство. Вред для interest — hypothesis. Используй interaction/replay evidence, не аргумент «играм нужен контент».

Добавь минимальное evidence-selected число event families. У каждой trigger, cooldown, domain limit, causal input, rule evidence и минимум два contexts. Fixed anchors остаются; same seed детерминирован, другой seed меняет только разрешённые внешние обстоятельства. Вариант обязан менять decision/trade-off, не только текст.

Критерии: в журнале есть evidence запуска; same seed воспроизводим; different seeds различимы и справедливы; D59 limits/fixed anchors сохранены; new families покрыты; две стратегии создают разные choices; постоянный DoD §1.2, focused tests, QA smoke, standalone/scoped bundle, smoke 390×844/desktop и `pnpm docs:reference:check` проходят. Добавь лог с Evidence и Gate.

Не добавляй loot, achievements, rarity, hidden rubber-banding, personal data или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 11 — Full causal QA expanded week

### Результат

Family/economy/replay build получает отдельный массовый отчёт, а не наследует
PASS старой calibration.

### Промпт

```text
Проведи Sprint 11 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — full causal QA expanded week после Sprints 8–10. Если Sprint 10 SKIPPED_BY_GATE, проверяй фактический build без выдуманного контента.

Повтори дисциплину Sprint 7: реальные версии/fingerprint, новый immutable report, отдельный runner/CI или один согласованный sequential process, без параллельного mass-QA на ноутбуке. Без runner — smoke и BLOCKED.

Сохрани все старые gates. Добавь coverage family availability/reciprocity, employment setup, financial goals/obligations, new event families и counterfactuals. Проверь terminal lock, path diversity без universal strategy, fixed anchors, checkpoint/trace privacy и determinism.

Критерии: 10 000 × 7 завершены; failed gates=0; новые branches покрыты; report соответствует source fingerprint; owner docs называют один current report; `pnpm docs:reference:check` проходит. Smoke не PASS. Добавь лог с Evidence и Gate.

Не ослабляй thresholds и не подбирай calibration под policy. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 12 — Stage 6 human exit gate

### Результат

Полный семидневный slice получает независимые PASS/PASS по causality и interest
на build, прошедшем Sprint 11.

### Промпт

```text
Проведи Sprint 12 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — human exit gate Stage 6. Начинай только после PASS Sprint 11.

Используй frozen build и protocol Sprint 6. Набери минимум пять новых участников, не знакомых с разработкой/предыдущим тестом; зафиксируй screener, consent и retention. Проведи неподсказанный first run и естественную полную неделю. Targeted probes — только после самостоятельного объяснения.

First-touch veto обязателен. Проверь weekly contract, family negotiation, economy horizon, два платных stabilizer, development, external disruption vs echo и итог с openThreads. Same-seed replay засчитывается только после фактического старта отличимой стратегии у заранее заданной доли cohort.

Causality/interest оцени отдельно. WARN не разрешает month: допустим один evidence-selected experiment и repeat mini-gate. FAIL блокирует expansion. Technical trace — только сверка mechanics; факты/quotes/interpretation раздельны.

Критерии: cohort/build fingerprint сохранены; causality=PASS, interest=PASS, first-touch veto пройден; нет S0/S1; issues имеют evidence/severity; owner docs/backlog/roadmap обновлены только подтверждёнными выводами; `pnpm docs:reference:check` проходит. Без участников — BLOCKED. Добавь лог с Evidence и Gate.

Не меняй calibration, thresholds, engine или decisions по одному наблюдению. Не подключай personal data/куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 13 — Longitudinal GO/NO-GO до месяца

### Результат

До разработки 30 дней доказано или опровергнуто, что игроку нужна межсессионная
траектория, а не просто более длинная текущая неделя.

### Промпт

```text
Проведи Sprint 13 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — longitudinal GO/NO-GO до разработки month lifecycle. Начинай только после PASS/PASS Sprint 12.

Подтверждённого evidence, что человек хочет возвращаться к этой игре в другой день и держать месячную цель, пока нет. Не принимай «хочу больше контента» за доказательство длинного цикла.

Подготовь versioned research protocol и минимальный synthetic storyboard продолжения: старт месяца, weekly checkpoint, изменение приоритета, накопленная open thread и month outcome. Не реализуй production engine/UI. Набери минимум пять участников из подходящего screener и проведи минимум две разнесённые во времени сессии на человека; первая использует текущий slice, вторая — storyboard/return cue. Не выдумывай возвращение: фиксируй фактический return, recall стратегии, понятность carry-over и ценность month goal.

Раздельно проверь: хочет ли человек продолжить того же персонажа; помнит ли незавершённую линию; понимает ли отличие дня/недели/месяца; меняет ли weekly checkpoint следующую стратегию; нужен ли 30-day horizon или достаточно новой семидневной кампании. Заранее зафиксируй GO/NO-GO thresholds и privacy/retention.

Критерии: cohort/protocol/artifacts воспроизводимы; минимум две сессии на участника; facts/quotes/behavior/hypotheses разделены; принято явное GO/NO-GO. D11 уже фиксирует условный 30-дневный цикл: Sprint 13 решает, реализовывать ли этот target; противоречащее evidence требует нового решения, явно заменяющего D11. При NO-GO Sprints 14–18 SKIPPED_BY_GATE, код не меняется; при GO закрыты week boundaries, replanning cadence и carry-over. Income cadence принадлежит Sprint 9 и здесь не открывается повторно; `pnpm docs:reference:check` проходит. Добавь лог с Evidence и Gate.

Не подключай real HEYS data, персональный режим или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 14 — Month lifecycle и headless period contract

### Результат

Engine умеет атомарно переходить day→week→month, обновлять planning и budgets и
сохранять carry-over без UI и без копирования недели четыре раза.

### Промпт

```text
Продолжи HEYS «Собери день»: реализуй Sprint 14 из docs/assemble-day/assemble_prodution_megaplan.md — headless month lifecycle и period contract. Начинай только после GO Sprint 13 и закрытых month decisions.

Проблемы: current scenario жёстко ограничен day 0…6/38 slots; planning lock один на кампанию; weekLargeCount и event budgets не имеют недельного reset; day boundary может materialize next-day event до summary; exact-version checkpoint не имеет migrations.

Изучи D4/D9–D13/D25–D28, owner docs, state/schema/reducer/scenario/campaign/persistence contracts и rule evidence. Сначала определи versioned `PeriodState`: absolute day, day-in-week, week-in-cycle, boundaries, per-period counters, active plan, carry-over, income/obligation cadence и openThreads. Не встраивай calendar arithmetic в UI.

Реализуй idempotent reducer-owned boundaries. Каждый новый week имеет отдельный planning step/lock и reset только явно weekly counters; persistent consequences не сбрасываются. Day summary относится к завершённому дню даже если следующий event уже materialized. Month completion не теряет unresolved threads. Добавь migration только если она доказана; иначе explicit incompatible screen остаётся owner Sprint 15.

Критерии: 30 headless days проходят без hard-coded 0…6 assumptions; day/week/month boundaries атомарны и idempotent; weekly budgets reset ровно один раз; replanning и income/obligations происходят по contract; deterministic replay/reload на каждой границе; checkpoint ceiling Sprint 1 соблюдён или Sprint 15 BLOCKED; постоянный DoD §1.2, focused engine/contract tests, sequential QA smoke и `pnpm docs:reference:check` проходят. UI/bundle не менять. Добавь лог с Evidence и Gate.

Не добавляй content breadth, runtime policies, personal data или куратора. Не запускай full mass-QA в этом спринте. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 15 — Playable 30-day cycle, persistence и UI

### Результат

Headless lifecycle становится возобновляемой 30-дневной кампанией с weekly
replanning и настоящим month outcome, сохраняя простой первый слой.

### Промпт

```text
Продолжи HEYS «Собери день»: реализуй Sprint 15 из docs/assemble-day/assemble_prodution_megaplan.md — playable 30-day cycle поверх PASS headless contract Sprint 14.

Изучи D4/D9–D13/D25–D28, 01/02/03/06, lifecycle contract, checkpoint/trace budgets Sprint 1 и current UI. Не растягивай неделю copy-paste. Создай content schedule с fixed campaign anchors, controlled events, weekly checkpoints/replanning, income/obligations и month completion.

Monthly priorities получают ограниченную реальную capacity из Sprint 2. Month summary связывает initial goals, reinforcing decisions, stabilizations, trade-offs, open/closed threads и opportunities; нет общего score/win/lose. State, money, work, relationships, skills, infrastructure и unresolved obligations переходят по contract.

Persistence хранит bounded snapshot + compact confirmed ledger, а не 30 дней полного duplicated journal. Full trace собирается через deterministic replay и выдаётся chunked/yielding, чтобы copy/log не зависал. Измерь worst-case envelope, trace generation time и memory на mobile-class environment; cap registry не повышай молча. Corrupt/stale/incompatible snapshot не сбрасывай.

UI-гейт: цель — принять решение текущего периода; главное действие — текущая развилка/replanning; слой 1 — сегодня, краткая причина и ближайшая ставка; слой 2 — week/month history, open threads и trace; критическое не скрывать — boundary, commitment, incompatibility и irreversible choice.

Критерии: 30 дней проходят и возобновляются до/после каждой boundary; weekly/month summaries строятся из engine; checkpoint с запасом; trace не блокирует UI; click-only invariant сохраняется; постоянный DoD §1.2, focused engine/web/storage tests, standalone/scoped bundle, smoke 390×844/desktop и `pnpm docs:reference:check` проходят. Full mass-QA оставить Sprint 17. Добавь лог с bytes/timings, Evidence и Gate.

Не добавляй endless content, multiple professions, personal data или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 16 — Runtime-политики знакомых решений

### Результат

Только при доказанной repetitive burden игрок может создать прозрачные
низкорисковые policies; крупные и необратимые решения остаются ручными.

### Промпт

```text
Продолжи HEYS «Собери день»: выполни условный Sprint 16 из docs/assemble-day/assemble_prodution_megaplan.md — runtime policies знакомых решений. Начинай только при evidence Sprints 13/15, что повторы реально утомляют. Иначе запиши SKIPPED_BY_GATE и код не меняй.

Изучи D31/D44/D52, habits/capabilities, reducer/checkpoint/trace и human evidence. Создай отдельный product contract `DecisionPolicy` или эквивалент; не переиспользуй QA `PolicyId`, который описывает simulation agents. Policy открывается после заранее заданного числа ручных решений одного типа.

Начни максимум с 2–3 низкорисковых действий. До исполнения показывай recognized condition, proposed action, known price и stop condition. Policy создаёт обычный confirmed reducer-step, не обходит checkpoint, и может быть overridden. Она никогда не подтверждает first-touch, дорогие, family, career, conflict или irreversible choices.

Критерии: нет доступа до manual familiarity; simulation policy и runtime policy типобезопасно разделены; suggestion/confirmation/override различаются в journals; policy не скрывает цену и не меняет state напрямую; постоянный DoD §1.2, focused engine/web/persistence tests, QA smoke, standalone/scoped bundle, smoke 390×844/desktop и `pnpm docs:reference:check` проходят. Добавь лог с Evidence и Gate.

Не добавляй autoplay, streak rewards, personal data или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 17 — Full causal QA long-horizon build

### Результат

Фактический 30-day build, включая runtime policies если они прошли gate,
получает отдельный массовый отчёт и performance/storage evidence.

### Промпт

```text
Проведи Sprint 17 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — full causal QA long-horizon build после Sprint 15 и фактического статуса Sprint 16.

Зафиксируй schema/scenario/calibration/technical/envelope/trace versions и source fingerprint. Создай новый immutable long-horizon report; старые отчёты не перезаписывай. Выполняй полный профиль только на отдельном runner/CI или одним sequential process в согласованное окно. Без runner — smoke и BLOCKED.

Не ослабляя D60, проверь 30-day terminal lock, day/week/month boundary idempotency, weekly resets, replanning, income/obligations, openThread carry-over, strategy viability, event/domain limits, counterfactual development, checkpoint budget, replay, privacy values и all content coverage. Если runtime policies есть, добавь отдельные scenarios suggestion/override/stop; QA agents остаются отдельным типом.

Критерии: заранее утверждённый long-horizon seed×QA-policy profile завершён; failed gates=0; coverage всех periods/content; source/report fingerprints совпадают; storage/performance ceilings не нарушены; README/09/12/reference называют current report; `pnpm docs:reference:check` проходит. Smoke не PASS. Добавь лог с Evidence и Gate.

Не ослабляй thresholds, не повышай storage cap как способ пройти gate, не запускай parallel mass-QA на ноутбуке. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 18 — Longitudinal human exit gate

### Результат

Пять участников реально возвращаются к одной 30-дневной кампании в нескольких
сессиях; causality, interest, return value и итог оцениваются независимо.

### Промпт

```text
Проведи Sprint 18 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — longitudinal human exit gate после PASS Sprint 17.

Подготовь frozen build/protocol/screener/consent. Минимум пять новых участников проходят одну кампанию в нескольких разнесённых сессиях; checkpoint подмена допустима только в заранее обозначенном техническом rehearsal, не в evidence cohort. Фиксируй фактический return, recall goals/openThreads, изменение weekly strategy и завершение month.

Отдельно оцени causality, interest, return motivation, decision fatigue, usefulness weekly replanning, policy comprehension/override если policies есть, month summary и desire for another campaign. First-touch fairness остаётся veto. Same-seed replay оценивается фактической альтернативной траекторией хотя бы у заданной доли cohort, если H31 всё ещё активна.

Interaction evidence и technical trace разделены. Issue содержит session/time/visible state/behavior/quote/severity; hypotheses не выдаются за facts. Заранее зафиксируй PASS/WARN/FAIL thresholds; WARN не разрешает personal mode.

Критерии: пять complete longitudinal rubrics; causality=PASS, interest=PASS, return value=PASS; нет S0/S1; final outcome осмыслен без diagnostics; подтверждённые выводы обновлены; `pnpm docs:reference:check` проходит. Без реальных sessions — BLOCKED. Добавь лог с Evidence и Gate.

Не меняй calibration/engine по одному наблюдению и не подключай personal data/куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 19 — Breadth GO/NO-GO

### Результат

После доказанного core и месяца принимается решение, нужны ли новые
household/career configurations, какие именно и какую подтверждённую проблему
они решают.

### Промпт

```text
Проведи Sprint 19 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — product/content GO/NO-GO на расширение configurations. Начинай только после PASS Sprint 18.

Изучи D20, target scope docs, human evidence Sprints 12/18, coverage reports и backlog. Не считай разнообразие самоцелью. Составь карту `observed unmet strategy/identification need → proposed household/career configuration → changed mechanics → content/rule evidence cost → risk`. Отдели желание увидеть себя от необходимости персональных данных.

Проведи concept test на synthetic character cards с заранее заданными thresholds. Не реализуй новый engine/UI content. При GO выбери минимальный набор mechanically distinct configurations и зафиксируй owner decisions, schema/content dependencies и отдельный implementation plan. При NO-GO оставь fixed character.

Критерии: есть воспроизводимый evidence и явный GO/NO-GO; каждый proposed configuration меняет decisions, а не только biography; нет demographic stereotyping; при NO-GO код не меняется; `pnpm docs:reference:check` проходит. Добавь лог с Evidence и Gate.

Не добавляй appearance editor, real client data, diagnoses или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 20 — Gate longitudinal mirror реальных данных HEYS

### Результат

Идея H33 получает доказательное GO/NO-GO на synthetic storyboard. Реальные
данные не подключаются в этом спринте даже при GO.

### Промпт

```text
Проведи Sprint 20 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — продуктовый, экспертный, правовой и privacy gate гипотезы H33: реальная долгосрочная траектория клиента как развитие персонажа. Начинай только после PASS Sprints 17–18 и отдельного разрешения владельца продукта.

Изучи 07_HEYS_INTEGRATION_SAFETY.md, D8/D41–D48, H33, storage/data architecture и human evidence. На полностью synthetic data создай storyboard: consent, список минимальных агрегатов, источник/confidence, изменение longitudinal context, право оспорить, disconnect и deletion. Не импортируй реальные записи и не делай production integration.

Проверь на людях: ценность mirror; понимание «игровая модель ≠ оценка меня»; отсутствие чувства наказания за реальные показатели; ясность synthetic/real boundary; informed consent; ожидания retention/deletion; желание видеть source и отменять inference. Отдельно проведи экспертную, правовую и privacy review.

Предпочтительный data principle при возможном GO: coarse derived aggregates, purpose limitation, opt-in, local/client scope, no raw diary, reversible consent, deletion of derivatives и неизменность base action success при одинаковом game state. Вес, calories, diagnoses, drugs и curator notes не входят по умолчанию.

Критерии: явный GO/NO-GO; categories/purpose/retention/consent/deletion/audit trail определены; human comprehension thresholds заданы и проверены; при NO-GO код не меняется; при GO создан отдельный implementation plan/contract tests, но интеграция не выполняется; `pnpm docs:reference:check` проходит. Добавь лог с Evidence и Gate.

Не подключай реальные HEYS data, не записывай game events в дневник и не добавляй curator integration. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## 4. Антифичи и постоянные ограничения

Не добавлять ради ощущения «игры»:

- XP, levels, stars, coins, streaks и daily rewards;
- единый score здоровья или «баланса жизни»;
- moral labels «хорошее/плохое решение»;
- hidden rubber-banding и бесплатное спасение;
- выбор уровня сложности;
- псевдонаучные panels и точные claims без evidence;
- decorative habits/skills/infrastructure/events без downstream;
- family/food/rest только как штраф;
- content breadth до evidence;
- personal data до Sprint 20 gate;
- curator integration до отдельной доказанной ценности.

---

## 5. Facts Table глубокого аудита

Storage measurement воспроизводится текущим engine без записи файлов:

```bash
node --import tsx -e "Promise.all([import('./packages/assemble-day-engine/src/content/scenario.ts'),import('./packages/assemble-day-engine/src/planning.ts'),import('./packages/assemble-day-engine/src/reducer.ts'),import('./packages/assemble-day-engine/src/policies.ts')]).then(([s,p,r,q])=>{let state=p.reducePlanningStep({state:s.createInitialState('checkpoint-budget'),plan:{weeklyRuleIds:['protect_sleep','family_anchor','work_blocks'],mainGoal:'work',supportingGoal:'family'}}).state;let steps=0;while(state.scenarioCursor<s.registries.slots.length){const e=r.initialEvent(state,s.registries);const offers=r.getActionOffers(state,e.templateId,s.registries);const a=q.selectAction(state,state.scenarioCursor,'balanced',offers);state=r.reduceStep({state,openEvent:e,actionId:a.actionId},s.registries).state;steps++;}console.log({steps,journal:state.causalJournal.length,jsonChars:JSON.stringify(state).length,utf16ApproxBytes:JSON.stringify(state).length*2});})"
```

| Проверяемое утверждение                                                     | Source                                                                      | Verification                                                                                                                                                                                                                      | Статус последней проверки                                                                                                                                                                                    | Интерпретация                                                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------- |
| Реестры содержат 31 action, 42 events и 38 slots                            | `packages/assemble-day-engine/src/content/scenario.ts`                      | `node --import tsx -e "import('./packages/assemble-day-engine/src/content/scenario.ts').then(({registries})=>console.log(Object.keys(registries.actions).length,Object.keys(registries.events).length,registries.slots.length))"` | ✅ `31 42 38`                                                                                                                                                                                                | Технически насыщенная, но фиксированная неделя                                                     |
| QA v0.2 прошёл 10 000 × 7                                                   | `reports/causal-qa-v0.2.json`                                               | `node -e "const s=require('./docs/assemble-day/reports/causal-qa-v0.2.json').simulation; console.log(s.seedCount,s.policyIds.length,s.runCount,s.failures.length,Object.values(s.gates).filter(g=>!g.passed).length)"`            | ✅ `10000 7 70000 0 0`                                                                                                                                                                                       | Доказывает gates симуляции, не human interest                                                      |
| Full v0.3 report отсутствует                                                | filesystem                                                                  | `test ! -e docs/assemble-day/reports/causal-qa-v0.3.json`                                                                                                                                                                         | ✅ absent                                                                                                                                                                                                    | Smoke нельзя называть full QA                                                                      |
| Маршрут синхронизирован: Sprint 0 DONE → Sprint 1; human gate — Sprint 6    | README, roadmap, megapлан                                                   | `rg -n 'Sprint 0.\*заверш                                                                                                                                                                                                         | Следующ.\*Sprint 1                                                                                                                                                                                           | human.\*Sprint 6                                                                                   | formative.\*Sprint 6' docs/assemble-day/{README.md,12_ROADMAP.md,assemble_prodution_megaplan.md}` | ✅ 2026-07-30                                                         | Два маршрута истины закрыты Sprint 0                                     |
| Human protocol содержит наводящие T3–T7                                     | `reports/vertical-slice-evaluation-v0.1.md`                                 | `sed -n '30,58p' docs/assemble-day/reports/vertical-slice-evaluation-v0.1.md`                                                                                                                                                     | ✅ задания называют цену, перенос, ограничения и точную историю                                                                                                                                              | Нужен неподсказанный first run до probes                                                           |
| Rule-evidence registry v0.1 существует, runtime binding отсутствует         | `05_STATE_CAUSAL_ENGINE.md`, `08_VERTICAL_SLICE.md`, `09_CALIBRATION_QA.md` | `rg -n 'Rule-evidence registry v0.1                                                                                                                                                                                               | re_sleep_duration_recovery                                                                                                                                                                                   | re_event_load_antispiral' docs/assemble-day/09_CALIBRATION_QA.md && ! rg -n 'ruleEvidenceId        | evidenceRuleId' packages/assemble-day-engine/src apps/web/assemble-day`                           | ✅ registry docs; runtime ID absent 2026-07-30                        | Sprint 0 закрыл governance-таблицу; provenance binding остаётся Sprint 5 |
| Raw clientId участвует в game seed                                          | `apps/web/assemble-day/heys_assemble_day_game_v1.ts`                        | `rg -n 'clientId.\*seed                                                                                                                                                                                                           | seed.\*clientId                                                                                                                                                                                              | assemble-day.\*clientId' apps/web/assemble-day/heys_assemble_day_game_v1.ts`                       | ✅ найдено в start/new-session paths                                                              | Требуется Sprint 1 privacy fix                                        |
| Initial state сохраняет seed в campaignId/RNG                               | `packages/assemble-day-engine/src/content/scenario.ts`                      | `rg -n 'campaignId:                                                                                                                                                                                                               | rng:                                                                                                                                                                                                         | seed' packages/assemble-day-engine/src/content/scenario.ts`                                        | ✅ seed copied                                                                                    | Privacy проблема достигает serialized state                           |
| Registry cap checkpoint = 512 KiB                                           | `apps/web/heys_storage_registry_v1.js`                                      | `rg -n -A8 'planning_assemble_day_campaign' apps/web/heys_storage_registry_v1.js`                                                                                                                                                 | ✅ `512 * KB`                                                                                                                                                                                                | Нужен bounded envelope, не повышение cap                                                           |
| Один planned-week state почти достигает cap                                 | reducer replay measurement                                                  | Команда над таблицей                                                                                                                                                                                                              | ✅ `38` steps, `772` journal entries, `509890` UTF-16 bytes                                                                                                                                                  | До cap 524 288 bytes остаётся 14 398 bytes ещё без key/envelope                                    |
| Checkpoint compatibility exact-version                                      | game adapter checkpoint contract                                            | `rg -n 'incompatible                                                                                                                                                                                                              | schemaVersion                                                                                                                                                                                                | scenarioVersion                                                                                    | calibrationVersion                                                                                | technicalVersion' apps/web/assemble-day/heys_assemble_day_game_v1.ts` | ✅ exact checks; migrations не найдены                                   | Future versions требуют migration или explicit fail-closed |
| DaySummaryCard только объявлен                                              | web UI                                                                      | `rg -n 'DaySummaryCard' apps/web/assemble-day/heys_assemble_day_game_v1.ts`                                                                                                                                                       | ✅ declaration only                                                                                                                                                                                          | Настоящий day boundary summary отсутствует                                                         |
| Engine openThreads не показаны в completion UI                              | campaign + web UI                                                           | `rg -n 'openThreads                                                                                                                                                                                                               | CompletionSummary' packages/assemble-day-engine/src/campaign.ts apps/web/assemble-day/heys_assemble_day_game_v1.ts`                                                                                          | ✅ engine creates; UI summary omits                                                                | Финал не замыкает кампанию                                                                        |
| Planning даёт прямые reductions                                             | `packages/assemble-day-engine/src/planning.ts`                              | `rg -n 'effortScore                                                                                                                                                                                                               | optionPressure                                                                                                                                                                                               | work_blocks                                                                                        | family_anchor                                                                                     | protect_sleep' packages/assemble-day-engine/src/planning.ts`          | ✅ reductions есть                                                       | Нужен встречный capacity/counterfactual                    |
| Habits почти не читаются будущими offers/events                             | actions/scenario/planning/policies                                          | `rg -n 'habits                                                                                                                                                                                                                    | habitId' packages/assemble-day-engine/src/content/actions.ts packages/assemble-day-engine/src/content/scenario.ts packages/assemble-day-engine/src/planning.ts packages/assemble-day-engine/src/policies.ts` | ✅ запись есть, downstream ограничен                                                               | Часть development декоративна                                                                     |
| Habit direction может морализовать                                          | `packages/assemble-day-engine/src/campaign.ts`                              | `rg -n 'improved                                                                                                                                                                                                                  | late_work                                                                                                                                                                                                    | caffeine_compensation' packages/assemble-day-engine/src/campaign.ts`                               | ✅ совпадения есть                                                                                | Нужна neutral direction semantics                                     |
| Human result содержит internal values                                       | `packages/assemble-day-engine/src/campaign.ts`                              | `rg -n 'energy                                                                                                                                                                                                                    | trust                                                                                                                                                                                                        | tension                                                                                            | recovery' packages/assemble-day-engine/src/campaign.ts`                                           | ✅ exact values в summary builders                                    | Human и diagnostic layers нужно разделить                                |
| Authored event copy находится в web                                         | scenario + web UI                                                           | `rg -n 'Контрольная развилка                                                                                                                                                                                                      | EVENT_COPY' packages/assemble-day-engine/src/content/scenario.ts apps/web/assemble-day/heys_assemble_day_game_v1.ts`                                                                                         | ✅ web owns full copy                                                                              | Headless/web source раздвоен                                                                      |
| Privacy QA сканирует key names                                              | `packages/assemble-day-engine/src/simulation.ts`                            | `rg -n 'containsPersonalization                                                                                                                                                                                                   | Object.keys' packages/assemble-day-engine/src/simulation.ts`                                                                                                                                                 | ✅ key-name traversal                                                                              | UUID в value может пройти gate                                                                    |
| UI trace не является interaction ledger                                     | web UI                                                                      | `rg -n 'trace                                                                                                                                                                                                                     | decision                                                                                                                                                                                                     | planning                                                                                           | details                                                                                           | pointer                                                               | keydown' apps/web/assemble-day/heys_assemble_day_game_v1.ts`             | ✅ reducer/planning trace; UX ledger нет                   | Нельзя выводить usability из technical trace |
| Standalone имеет отдельный generator                                        | `apps/web/package.json`, bundler script                                     | `rg -n 'bundle:assemble-day                                                                                                                                                                                                       | bundle-assemble-day-game' apps/web/package.json apps/web/scripts/bundle-assemble-day-game.mjs`                                                                                                               | ✅ отдельная command                                                                               | TS change требует exact standalone workflow                                                       |
| H1–H32 не проверены; H33 зарегистрирована как deferred                      | `11_HYPOTHESES_BACKLOG.md`                                                  | `rg -c 'Не проверена' docs/assemble-day/11_HYPOTHESES_BACKLOG.md && rg -n '^\| H33 \|.*DEFERRED.*Sprint 20' docs/assemble-day/11_HYPOTHESES_BACKLOG.md`                                                                           | ✅ `32` + H33 deferred, 2026-07-30                                                                                                                                                                           | Реализация механизма не повышает human hypothesis                                                  |
| D8 открыт; registry не содержит reviewed-строк                              | decision register + calibration owner                                       | `rg -n '^\| D8 \|.*Открыто' docs/assemble-day/10_DECISION_REGISTER.md && rg -n 'reviewed.*запрещён                                                                                                                                | таких строк нет' docs/assemble-day/09_CALIBRATION_QA.md`                                                                                                                                                     | ✅ 2026-07-30                                                                                      | UX PASS не заменяет product/expert governance                                                     |
| Реальный month outcome deferred; replay value/diversity остаётся hypothesis | README/register/backlog/roadmap                                             | `rg -n 'месячн.\*DEFERRED                                                                                                                                                                                                         | H23                                                                                                                                                                                                          | H31' docs/assemble-day/{README.md,10_DECISION_REGISTER.md,11_HYPOTHESES_BACKLOG.md,12_ROADMAP.md}` | ✅ 2026-07-30                                                                                     | Не путать target D4/D11 и технический D64 с human evidence            |

Evidence выше ведёт к последовательности: foundation → честный core → formative
human gate → full QA → controlled breadth → human exit → longitudinal gate →
month → long-horizon QA/human gate → только затем H33.

---

## 6. Журнал развития игры

### 2026-07-29 · Audit baseline · DONE

- Игрок: базовый flow признан причинным семидневным прототипом, но не полной
  многодневной игрой.
- Механика: зафиксированы разрывы итогов D4, planning capacity, development,
  family, economy, replay и content ownership.
- Документация: создан первый production-мегаплан из 13 gated sprints.
- Проверки: focused engine/web tests и `pnpm docs:reference:check` были PASS на
  baseline.
- Evidence: initial Facts Table v1.0.
- Gate: superseded by deep review v1.1; не является разрешением начать старый
  Sprint 1.
- Осталось: применить обновлённую последовательность v1.1.

### 2026-07-29 · Deep production-plan review v1.1 · DONE

- Игрок: first-touch fairness, неподсказанная причинность, реальный replay,
  возврат между сессиями и осмысленный month outcome получили отдельные gates.
- Механика: privacy seed, bounded checkpoint, version compatibility, honest
  planning capacity, period lifecycle, QA/runtime policy separation и trace
  ownership перенесены до расширений.
- Документация: сформирована последовательность Sprints 0–20; каждый спринт
  имеет копируемый prompt, Evidence и Gate; H33 зафиксирована только как
  deferred synthetic/privacy research.
- Проверки: 21 последовательный Sprint/Result/Prompt, 21 subagent guard, 21
  shared-workspace guard, 46 закрытых code fences; `pnpm docs:reference:check` —
  `172 local links`, `19 dossier passports`, ошибок нет.
- Evidence: Facts Table §5 и read-only audits concept/human/technical.
- Gate: мегаплан готов к последовательному выполнению; первый разрешённый prompt
  — Sprint 0.
- Осталось: ни одна описанная implementation-задача этим аудитом не выполнена.

### 2026-07-30 · Sprint 0 · DONE

- Игрок: игровое поведение не менялось; принятый target месяца отделён от ещё не
  существующего 30-дневного runtime, а технический replay — от непроверенной
  ценности H23/H31.
- Механика: создан документальный rule-evidence registry v0.1 из 14 стабильных
  правил; коэффициенты, engine, UI, calibration, QA-пороги и causal reports не
  менялись; runtime binding ID явно оставлен Sprint 5.
- Документация: README, roadmap, register, backlog, reference-досье и мегаплан
  сведены к маршруту `Sprint 0 DONE → Sprint 1`; H33 зарегистрирована как
  deferred; блокирующие входы Sprints 8/9/14 перечислены; метаданные 01–12
  нормализованы как версии отдельных модулей.
- Проверки: `14` registry rows, `33` hypotheses, `D8=Открыто`, `46`
  закрывающих/открывающих code-fence строк; `pnpm docs:reference:check` —
  `175 local links`, `19 dossier passports`, ошибок и duplicate IDs нет.
- Evidence: production-матрица в `12_ROADMAP.md`, registry в
  `09_CALIBRATION_QA.md`, blockers/H33 в `11_HYPOTHESES_BACKLOG.md`, runnable
  Facts Tables здесь и в reference-досье.
- Gate: Sprint 0 закрыт; следующий разрешённый prompt — Sprint 1. Formative
  human gate остаётся Sprint 6, full QA v0.3 — Sprint 7 на отдельном runner,
  personal/curator — не раньше Sprint 20 и отдельного D8/privacy/legal/expert
  gate.
- Осталось: подтверждённые privacy seed/checkpoint/delivery blockers Sprint 1;
  rule-evidence runtime binding Sprint 5.
