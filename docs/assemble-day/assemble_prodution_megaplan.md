# HEYS «Собери день» — production-мегаплан

> Файл намеренно назван `assemble_prodution_megaplan.md` по запросу владельца
> продукта.<br> Статус: активный последовательный план развития<br> Версия: 1.9
> · personal owner-gates<br> Дата актуализации: 2026-07-30<br> Область: базовая
> вымышленная кампания до персонального режима и кураторской интеграции Текущий
> gate: Sprint 5 `DONE`; следующий разрешённый prompt — Sprint 6

[← К документации «Собери день»](./README.md)

---

## Статус выполнения

> **Готово: 6 из 21 core-спринтов (Sprint 0–5).** Следующий разрешённый этап —
> **Sprint 6** — личная приёмка владельцем на полной неделе и повторе того же
> seed другой стратегией.

| Статус           | Спринты | Что это означает                                         |
| ---------------- | ------- | -------------------------------------------------------- |
| ✅ `DONE`        | 0–5     | Реализованы и зафиксированы в журнале §6                 |
| ▶️ `NEXT`        | 6       | Разрешён следующий; ещё не начат                         |
| ⛔ `BLOCKED`     | 7       | Нельзя начинать до результата Sprint 6                   |
| ⬜ `NOT STARTED` | 8–20    | Не начаты и не разрешены до прохождения предыдущих gates |

Статус продублирован у каждого спринта. Подробный результат уже выполненных
этапов хранится в append-only журнале §6; он не заменяет этот трекер.

### Режим доказательств: личный продукт

Целевой пользователь текущей версии — владелец продукта. Поэтому личная приёмка
владельцем является достаточным продуктовым gate для движения по core- спринтам.
Она подтверждает пригодность игры **для владельца**, но не считается
исследованием удобства или интереса для других людей.

Внешние cohort-тесты остаются `DEFERRED` и становятся обязательными только после
отдельного решения расширять продукт на других пользователей или публичный
релиз. Технические gates, first-touch veto, отсутствие S0/S1, privacy,
accessibility и causal QA этим решением не ослабляются.

`Личный продукт` здесь означает только аудиторию из одного владельца. Это не
открывает персональный режим, данные дневника HEYS или кураторскую интеграцию.

---

## Параллельный visual track — 8-bit персонаж и состояния

> Этот трек независим от последовательности core-сринтов ниже и не меняет их
> gates. Он получает отдельного writer'а только после проверки ownership UI-
> файлов. Visual track не меняет reducer, balance, calibration, checkpoint и
> causal QA: персонаж является представлением уже подтверждённого состояния, а
> не вторым источником истины.<br>Статус: `Visual V0 — DONE 2026-07-30`;
> `Visual V1 — DONE — Concept B selected and owner-resolution accepted`;
> `Visual V2 — DONE 2026-07-30`.

### Зачем нужен визуальный слой

Компактный оригинальный 8-bit персонаж должен за один взгляд передавать
состояние вымышленного героя и сделать причинную симуляцию эмоционально
понятнее. Референс на карманные цифровые игрушки 1990-х задаёт только
настроение: нельзя копировать корпус, персонажей, пиктограммы, логотипы или
trade dress Tamagotchi/Bandai.

Первый слой остаётся спокойным и функциональным:

- одна небольшая пиксельная сцена с фиксированным нейтральным персонажем;
- 4–6 главных качественных сигналов текущего решения;
- изменение позы, лица и окружения только после подтверждённого reducer-step;
- полный перечень доступных состояний — во втором слое «Состояние персонажа»;
- raw `0–100`, внутренние paths, формулы и diagnostic trace — только в
  диагностике.

`Здоровье` нельзя придумывать как новую шкалу: сначала V0 устанавливает, есть ли
такой engine-owned показатель. Если его нет, интерфейс использует честное
название существующего состояния (`самочувствие`, дискомфорт, усталость и т. п.)
или оставляет тему вне UI. Сонливость, долг сна и готовность ко сну также не
сливаются в одну шкалу без подтверждённого presentation-контракта.

### Visual V0 — повторный аудит на слой глубже

#### Промпт

```text
Продолжи HEYS «Собери день»: проведи Visual V0 — глубокий read-only аудит перед созданием лёгкого 8-bit интерфейса персонажа. Ничего не реализуй и не меняй core-спринты production-мегаплана.

Цель: доказать, какие фактические состояния персонажа уже существуют, где ими владеет движок, что уже приходит в CampaignView/UI и как визуализировать их без второй модели данных, UI-формул, морализации и перегрузки первого слоя.

Изучи docs/assemble-day/assemble_prodution_megaplan.md, 01_PRODUCT_VISION.md, 05_STATE_CAUSAL_ENGINE.md, 06_UI_UX.md, GAME_STATE_SCHEMA.md, 07_HEYS_INTEGRATION_SAFETY.md, docs/reference/systems/ASSEMBLE_DAY_ENGINE.md, apps/web/ARCHITECTURE.md, apps/landing/COPY_VOICE.md, engine types/reducer/presentation selectors, текущий apps/web/assemble-day/heys_assemble_day_game_v1.ts, standalone loader и CSS. Если локальный сервер уже доступен, проверь текущий fullscreen на 390×844 и desktop; специально тяжёлый browser/performance прогон не запускай.

Составь verified-карту `source field → meaning → engine-owned qualitative selector → visual cue → human label → layer 1/layer 2/diagnostics → update moment`. Обязательно проверь energy, mood, tension/stress, hunger, physical fatigue, discomfort, sleepiness, sleep debt, wind-down/sleep readiness, caffeine load, recovery need, satiety window, money/obligations, work pressure, family state, habits/skills/capabilities. Не обещай показать поле только потому, что оно есть: отдели состояние человека, внешний ресурс, давление контекста и развитие.

Ответь на риски:
1. Не дублирует ли виджет уже существующую карточку персонажа и три status cards.
2. Какие 4–6 сигналов действительно нужны на первом слое для следующего решения.
3. Какие сочетания нельзя честно свести к одной шкале «здоровье» или «сон».
4. Какие visual states должны быть дискретными и engine-owned, чтобы UI не рассчитывал пороги.
5. Как не превратить нейтральную причинность в «хороший/плохой персонаж».
6. Когда sprite меняется: только после reducer-step, после materialized event или также при preview — обоснуй один контракт.
7. Как виджет ведёт себя на planning/result/day/week/month/life и не крадёт главное действие.
8. Как сохранить click-only standalone delivery и client privacy.
9. Как обеспечить screen-reader текст, high contrast, keyboard, reduced motion и 200% zoom.
10. Как получить 8-bit настроение без копирования Tamagotchi/Bandai и без внешних copyrighted assets.
11. Как исключить постоянный canvas/game loop, тяжёлую анимацию, font download и лишние requests.
12. Какими focused tests и измеримым bundle budget доказать минимальную системную цену.

Предложи один минимальный архитектурный вариант. Предпочтение: оригинальный inline SVG/CSS sprite с `shape-rendering: crispEdges`/`image-rendering: pixelated`, дискретные data-state frames и отсутствие постоянного JS-loop. Не создавай отдельный persistence: визуал должен полностью восстанавливаться из canonical session view. Если существующего selector недостаточно, зафиксируй точный gap и минимальный engine-owned read-only presentation contract, но не реализуй его.

Результат запиши отдельным документом docs/assemble-day/reports/visual-character-audit-v0.1.md: честный вердикт, Facts Table с file:line evidence, карта полей, слой 1/2, state machine визуала, wireframe 390×844/desktop, performance/accessibility/privacy budgets, IP guardrails, список S1–S3 рисков и точный scope будущего Visual V1. В assemble_prodution_megaplan.md измени только статус visual track и добавь короткую append-only запись после согласования одного writer'а; core sprint statuses не меняй.

Критерии: нет выдуманной шкалы здоровья; все сигналы имеют canonical source; UI не содержит формул/branching; visual update привязан к подтверждённому состоянию; первый слой не превышает 4–6 сигналов; предложен zero-loop/zero-eager-request путь; определены gzip/DOM/motion budgets и focused tests; pnpm docs:reference:check проходит. Staging, commit, push, PR, bundle и реализацию не выполнять.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и git status, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

### Visual V1 — разработка и выбор визуальной концепции

> Этот prompt нельзя запускать, пока Visual V0 не получил review и статус
> `DONE`. Результат V1 — утверждаемая концепция и проверяемые макеты, не
> production-код.

#### Промпт

```text
Продолжи HEYS «Собери день»: выполни Visual V1 из параллельного visual track docs/assemble-day/assemble_prodution_megaplan.md — разработай, сравни и доведи до решения визуальную концепцию персонажа и его состояний. Сначала проверь, что Visual V0 DONE, полностью прочитай docs/assemble-day/reports/visual-character-audit-v0.1.md и не продолжай, если аудит оставил S1-блокер или не подтвердил canonical source нужных состояний. Production UI, engine, reducer, balance, persistence, bundles и core-спринты не меняй.

Цель: найти оригинальный визуальный язык, который делает состояние вымышленного взрослого героя эмоционально считываемым за один взгляд, но сохраняет спокойный премиальный характер HEYS и не конкурирует с текущей развилкой. 8-bit/карманная retro-game эстетика — проверяемая гипотеза, а не заранее утверждённый ответ.

Изучи действующие решения D2, D3 и D32 в docs/assemble-day/10_DECISION_REGISTER.md, docs/assemble-day/06_UI_UX.md, apps/landing/COPY_VOICE.md, HEYS design-style/brand assets, текущие apps/web/assemble-day/heys_assemble_day_game_v1.ts и apps/web/styles/modules/912-planning-game-assemble-day.css. Сними baseline текущего fullscreen на 390×844 и desktop. Явно зафиксируй конфликт: D2 требует нейтральный силуэт без дублирования трёх status indicators, D32 отклоняет мультяшную стилизацию, поэтому любая более выразительная retro-концепция требует либо доказанной совместимости, либо отдельной owner-resolution; не переписывай решения молча.

UI-гейт: цель — понять состояние героя перед следующим решением; главное действие — выбор/подтверждение текущей развилки; слой 1 — компактный образ и только необходимые сейчас сигналы из утверждённой V0-карты; слой 2 — «Состояние персонажа» с человеческими названиями и краткими причинами; критическое не скрывать — тяжёлое состояние, недоступность действия, необратимость первого касания и ближайшую цену.

Разработай ровно три существенно разные оригинальные концепции:
1. HEYS-native premium minimal — нейтральный силуэт/сцена с очень сдержанными pixel cues.
2. Pocket retro — выразительный, но взрослый 8-bit character HUD без детской игрушечности и копирования чужого trade dress.
3. Hybrid editorial — спокойная карточка персонажа, где поза, окружение и типографические state cues дают эмоциональность без полноценного sprite-экрана.

Для каждой концепции подготовь mobile 390×844 и desktop key frame минимум для четырёх доказанных V0-состояний: нейтральное, усталость/восстановление, напряжение/давление, позитивное состояние с реальной ценой-компромиссом. Дополнительно покажи result beat и reduced-motion/high-contrast вариант. Используй только engine-owned qualitative states из V0; не придумывай здоровье, общий score, награду/наказание, эмоцию пользователя или новые правила симуляции. Если создаёшь растровые concept images, используй доступный image generation workflow и сохраняй точные prompts/negative constraints; финальные acceptance-макеты должны иметь подписанные состояния и layout-аннотации, чтобы решение не зависело от красивого moodboard.

Оцени варианты по одной матрице: понятность следующего решения, совместимость с D2/D3/D32, HEYS brand fit, взрослая тональность, различимость состояний без цвета/анимации, mobile density, оригинальность/IP safety, техническая цена, zero-loop/click-only delivery и возможность реализовать через один компактный SVG/CSS scene tree. Не выбирай среднее арифметическое автоматически: назови veto-риски и объясни продуктовый компромисс.

Выбери одну рекомендуемую концепцию и доведи её до implementation-ready specification: композиция и размеры mobile/desktop, pixel grid/shape language, HEYS-compatible palette для light/dark/high contrast, типографика, 4–6 layer-1 cues, layer-2 anatomy, полный state/frame inventory, transition rules, reduced-motion fallback, ARIA-текст, asset ownership, SVG/DOM и gzip budgets. Приложи component/state map без production-кода и таблицу `canonical selector → visual frame → text alternative → update moment`. Для отклонённых направлений кратко зафиксируй причину.

Результат запиши в docs/assemble-day/reports/visual-character-concept-v0.1.md, а статичные concept assets — в docs/assemble-day/reports/assets/visual-character-concept-v0.1/ с понятными именами. В отчёте обязательны: baseline, три концепции, decision matrix, рекомендуемая концепция, макеты, design tokens/spec, accessibility/performance/IP checks, список S1–S3 рисков и точный delta к будущему Visual V2. Если рекомендация меняет D2/D3/D32, подготовь текст отдельной owner-resolution, но не меняй decision register до явного одобрения владельца. В assemble_prodution_megaplan.md измени только статус visual track и добавь короткую append-only visual-запись после согласования одного writer'а; core sprint statuses не меняй.

Критерии: сравниваются три реально разные концепции; 8-bit не принят без проверки; выбранный вариант показан на mobile и desktop в ключевых состояниях; каждый cue связан с canonical selector; первый слой не дублирует status cards и не вытесняет решение; концепция работает без движения и одного цвета; IP-границы явные; V2 получает однозначный component/state/asset contract; pnpm docs:reference:check проходит. Staging, commit, push, PR, production implementation и bundle не выполнять.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и git status, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

### Visual V2 — реализация утверждённой character HUD-концепции

> Этот prompt нельзя запускать, пока Visual V1 не получил review, выбранная
> концепция не утверждена владельцем продукта и не получено отдельное решение
> `реализовывать`.

#### Промпт

```text
Продолжи HEYS «Собери день»: выполни Visual V2 из параллельного visual track docs/assemble-day/assemble_prodution_megaplan.md — реализуй утверждённую оригинальную character HUD-концепцию. Сначала проверь, что Visual V0 и Visual V1 получили статус DONE, полностью прочитай docs/assemble-day/reports/visual-character-audit-v0.1.md и docs/assemble-day/reports/visual-character-concept-v0.1.md, найди явную owner-resolution выбранной концепции и не меняй scope, если остался S1-блокер или решение D2/D3/D32 не согласовано.

Цель: добавить в standalone fullscreen утверждённую компактную сцену с фиксированным нейтральным персонажем и engine-owned качественными состояниями. Следуй выбранной V1 art direction и её IP-ограничениям; не подменяй её собственным редизайном и не копируй чужие корпуса, персонажей, пиктограммы, логотипы или trade dress.

UI-гейт: цель — понять текущее состояние героя до следующего решения; главное действие — выбор/подтверждение текущей развилки; слой 1 — одна небольшая сцена и не более 4–6 важных сейчас качественных сигналов; слой 2 — полный экран/раскрытие «Состояние персонажа» с человеческими названиями и краткими причинами; критическое не скрывать — тяжёлое состояние, недоступность действия, необратимость первого касания и ближайшая цена.

Реализуй только утверждённые V0 state map и V1 component/state/asset specification. Используй выбранный оригинальный inline SVG/CSS zero-loop вариант; если концепция использует pixel grid, сохрани crisp rendering. Не добавляй canvas/WebGL, постоянный animation loop, remote font, внешние изображения или eager resource. Дискретная анимация допустима только по правилам V1, редко, при `prefers-reduced-motion: no-preference`; без движения смысл полностью сохраняется. Visual state обновляется из canonical engine/session presentation после подтверждённого reducer-step и корректно восстанавливается после reload/replay; отдельного localStorage/checkpoint нет.

Не вычисляй пороги, здоровье, сонливость, стресс или составные оценки в React/UI. Если нужный качественный selector утверждён в V0 как engine gap, добавь только согласованный read-only engine-owned presentation contract и focused counterfactual tests. Raw 0–100, IDs, paths и deltas не показывай в product layer. Полезное действие с ценой визуализируй как компромисс, а не как моральную награду/наказание; не используй красный/зелёный как единственный носитель смысла.

Сохрани progressive disclosure на Day/Result/Week/Month/Life, выход в HEYS, first-touch flow и click-only loading. До клика визуальный код/CSS/assets не запрашиваются, не регистрируются и не исполняются. На 390×844 сцена не должна вытеснять ситуацию, цену и начало вариантов; desktop не растягивает пиксельную сцену до декоративного баннера. Alt/ARIA-текст называет состояние и причину; порядок focus, screen reader, 200% zoom, high contrast, reduced motion и touch targets >=44px проверены.

Performance budget по умолчанию: 0 eager requests, 0 постоянных JS timers/RAF, 0 remote assets, не более одного SVG scene tree, не более 80 rendered SVG/DOM primitives, прирост standalone JS+CSS <=12 KiB gzip. Изменить budget можно только с evidence из V0 и явной записью причины. Не добавляй редактор внешности, питомца с отдельными потребностями, XP, общий уровень, streak, sound autoplay, сложность, персональные данные или куратора.

Критерии: canonical source для каждого видимого сигнала; после reducer-step sprite и текст меняются согласованно; reload/replay дают тот же visual state; основной flow понятен без открытия деталей; first layer <=6 сигналов; accessibility и budgets соблюдены; focused engine/web/lazy tests, pnpm --dir apps/web bundle:assemble-day, только действительно нужный pnpm bundle:legacy:auto --files=<свои legacy source-файлы>, browser smoke 390×844/desktop и pnpm docs:reference:check проходят. Зафиксируй actual JS/CSS gzip delta, DOM primitive count, requests до/после клика и короткий append-only лог. Полный causal QA не запускать. Staging, commit, push и PR не выполнять.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и git status, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

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

| Severity  | Разрыв                               | Evidence                                                                                                           | Почему это важно                                                               |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| CLOSED S1 | Privacy seed                         | Opaque `ad1_…` seed не зависит от `clientId`; UUID scan и replay tests проходят                                    | Закрыто Sprint 1 envelope v2                                                   |
| CLOSED S1 | Checkpoint почти без запаса          | Полная неделя хранится как compact ledger и имеет внутренний hard budget 128 KiB при внешнем cap 512 KiB           | Закрыто Sprint 1 replay/checkpoint contract                                    |
| CLOSED S0 | Два маршрута истины                  | Единый маршрут создан в v0.32; текущий header/Facts фиксирует `Sprints 0–1 DONE → Sprint 2`; human gate — Sprint 6 | Закрыто документальным контрактом v0.32                                        |
| CLOSED S1 | Бесплатная ёмкость планирования      | Фокусы и weekly rules уменьшают effort/pressure без резервирования ресурса                                         | Закрыто Sprint 2 — журнал §6 от 2026-07-30                                     |
| CLOSED S1 | Нет замкнутого контракта недели      | До planning нет полного brief, финал не показывает engine `openThreads`                                            | Закрыто Sprint 3 — журнал §6 от 2026-07-30                                     |
| CLOSED S1 | D4 неполон                           | Нет настоящего day boundary summary; result не всегда показывает направление; итог раскрывает internal numbers     | Закрыто Sprint 3 — журнал §6 от 2026-07-30                                     |
| CLOSED S1 | Развитие частично декоративно        | Habits/planning отображаются без достаточного downstream; `late_work` может называться `improved`                  | Закрыто Sprint 4 — журнал §6 от 2026-07-30                                     |
| CLOSED S1 | Нет runtime rule-evidence binding    | Registry v0.1 создан в `09_CALIBRATION_QA.md`, но stable ID ещё не привязан к runtime rules/claims                 | Закрыто Sprint 5 — журнал §6 от 2026-07-30                                     |
| S1        | Human protocol наводит               | Задания заранее называют цену, echo и причинную цепочку; first-touch не veto                                       | Положительный тест может измерять послушание инструкции                        |
| S2        | Technical trace не равен UX evidence | Trace не хранит экран, касание, details, паузу, exit/reload                                                        | Он доказывает reducer, но не поведение человека                                |
| S2        | Content ownership раздвоен           | Полный copy в web; engine содержит заглушки и raw codes                                                            | Headless и UI могут объяснять одну механику по-разному                         |
| S2        | Accessibility не доказана            | Radio/focus flow неполон                                                                                           | Mouse smoke не доказывает доступность выбора                                   |
| S2        | QA не замыкает расширения            | Нет обязательного full report после family/economy/replay и 30-day/policies                                        | Human gate может тестировать build без массового отчёта                        |
| S2        | Month был сверхшироким шагом         | Engine ограничен днями 0…6, 38 slots, одним planning lock и недельным budget                                       | Регрессии lifecycle, persistence и content невозможно локализовать             |
| CLOSED S2 | Срез открыт клиентам до Sprint 6     | Вкладка «Игры» скрыта fail-closed: куратор или client-scoped `heys_planning_games_access_v1`; в проде после деплоя | Закрыто 2026-07-31 — `apps/web/heys_planning_v1.js`, тест P18 в досье PLANNING |
| S2        | Causal QA gate нестабилен по времени | `qa.test.ts` идёт 35–57 с; из двух прогонов 2026-07-31 первый упал по таймауту, повтор зелёный (46/46)             | Долгий тест в общем наборе даёт ложные красные и маскирует реальные регрессии  |

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

## 3. Последовательность спринтов v1.2

| Sprint | Название                                     | Статус           | Gate                                                            |
| -----: | -------------------------------------------- | ---------------- | --------------------------------------------------------------- |
|      0 | Truth, decisions и rule-evidence contract    | ✅ `DONE`        | 2026-07-30: один маршрут и матрица FACT/HYPOTHESIS/DEFERRED     |
|      1 | Privacy, checkpoint и delivery foundation    | ✅ `DONE`        | 2026-07-30: opaque seed, envelope v2, click-only                |
|      2 | Честная ёмкость планирования                 | ✅ `DONE`        | 2026-07-30: 2/3 rules, attention 2+1, tagged trade-offs         |
|      3 | Campaign brief и итоги D4                    | ✅ `DONE`        | 2026-07-30: один brief, 7 day + 1 week summaries                |
|      4 | Причинно честное развитие                    | ✅ `DONE`        | 2026-07-30: только downstream-подтверждённые линии              |
|      5 | Context, confidence, content ownership, a11y | ✅ `DONE`        | 2026-07-30: engine presentation/evidence + keyboard flow        |
|      6 | Personal owner-acceptance gate               | ▶️ `NEXT`        | Полная неделя + same-seed replay, затем явное решение владельца |
|      7 | Full QA owner-accepted build                 | ⛔ `BLOCKED`     | После `OWNER_ACCEPTED` Sprint 6; 10 000 × 7 на отдельном runner |
|      8 | Самостоятельность семьи                      | ⬜ `NOT STARTED` | После Sprint 7; D21–D23 реализованы компактно                   |
|      9 | Экономика и карьера                          | ⬜ `NOT STARTED` | После Sprint 8; setup reducer и честный горизонт                |
|     10 | Replay/content по evidence                   | ⬜ `NOT STARTED` | Условный спринт, иначе SKIPPED_BY_GATE                          |
|     11 | Full QA expanded week                        | ⬜ `NOT STARTED` | Расширенный slice имеет свой report                             |
|     12 | Stage 6 owner exit gate                      | ⬜ `NOT STARTED` | Владелец принял расширенный семидневный slice                   |
|     13 | Owner longitudinal GO/NO-GO                  | ⬜ `NOT STARTED` | Владелец проверил ценность возврата до постройки месяца         |
|     14 | Month lifecycle/headless contract            | ⬜ `NOT STARTED` | Только после GO Sprint 13; периоды и resets атомарны            |
|     15 | Playable 30-day cycle                        | ⬜ `NOT STARTED` | Месяц возобновляем и имеет итог                                 |
|     16 | Runtime policies                             | ⬜ `NOT STARTED` | Только при observed repetitive burden                           |
|     17 | Full QA long-horizon                         | ⬜ `NOT STARTED` | 30-day build имеет свой report                                  |
|     18 | Longitudinal owner exit gate                 | ⬜ `NOT STARTED` | Владелец принял межсессионный месяц                             |
|     19 | Breadth GO/NO-GO                             | ⬜ `NOT STARTED` | Решено, когда расширять configurations                          |
|     20 | Gate longitudinal mirror H33                 | ⬜ `NOT STARTED` | Только решение; реального импорта нет                           |

### Жёсткие переходы

- Sprint 6 — личный owner-gate. Владелец проходит полную неделю и начинает
  same-seed replay с другой стратегией, отдельно оценивает причинность и интерес
  и фиксирует `OWNER_ACCEPTED` либо `REWORK`.
- `OWNER_ACCEPTED` требует пройденного first-touch veto и отсутствия S0/S1.
  Внешний cohort не блокирует core, но остаётся `DEFERRED` и не подменяется
  личным наблюдением.
- Sprint 7 проходит до family/economy. Sprint 10 запускается только при
  evidence, что replay упирается в вариативность.
- Sprint 12 требует явного `OWNER_ACCEPTED`; `REWORK` не разрешает переход к
  месяцу.
- Sprint 14 начинается только после `GO` Sprint 13. Sprint 16 — только после
  наблюдаемой repetitive burden.
- Sprint 20 требует PASS Sprint 17, `OWNER_ACCEPTED` Sprint 18 и отдельного
  продуктового, экспертного, правового и privacy-разрешения.

### Матрица ключевых гипотез

| Гипотеза                                 |    Sprint | Evidence                                     | Сейчас       |
| ---------------------------------------- | --------: | -------------------------------------------- | ------------ |
| H29 — first-touch справедлив             |         6 | Owner run + veto; внешний cohort deferred    | Не проверена |
| H30 — result beat раскрывает причинность |         6 | Owner prediction → choice → result → next    | Не проверена |
| H31 — same-seed replay интересен         | 6, 10, 12 | Фактическая вторая стратегия владельца       | Не проверена |
| H32 — тяжёлое состояние даёт адаптацию   |     6, 12 | Два разных платных стабилизатора             | Не проверена |
| H23 — случайность честна                 |        12 | Владелец отличает внешнее событие от echo    | Не проверена |
| H26 — недели хватает для каскада         |     6, 12 | Полная неделя владельца                      | Не проверена |
| H33 — агрегаты HEYS ценны как mirror     |        20 | Synthetic storyboard + privacy comprehension | Deferred     |

---

## Sprint 0 — Truth, decisions и rule-evidence contract

**Статус:** ✅ `DONE` 2026-07-30. Не выполнять повторно без нового
подтверждённого противоречия; execution evidence — в журнале §6.

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

**Статус:** ✅ `DONE` 2026-07-30. Version matrix: state schema `2`, scenario
`3`, calibration `0.3`, technical contract `0.31` и trace `1` не менялись;
storage envelope повышен `1 → 2`. Execution evidence — в журнале §6.

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

**Статус:** ✅ `DONE` 2026-07-30. Результат и проверки — в журнале §6.

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

**Статус:** ✅ `DONE` 2026-07-30. Результат и проверки — в журнале §6.

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

**Статус:** ✅ `DONE` 2026-07-30. Результат и проверки — в журнале §6.

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

**Статус:** ✅ `DONE` 2026-07-30. Результат и проверки — в журнале §6.

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

## Sprint 6 — Personal owner-acceptance центрального loop

**Статус:** ▶️ `NEXT` — не начат. Для закрытия владелец проходит полную неделю и
same-seed replay другой стратегией.

### Результат

Владелец лично принимает или возвращает на доработку центральный causal loop;
first-touch имеет отдельный veto, а субъективная приёмка не выдаётся за внешнее
исследование.

### Промпт

```text
Проведи Sprint 6 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — personal owner-acceptance центрального loop после DONE Sprints 0–5. Целевой пользователь текущей версии — владелец продукта; внешний cohort сознательно DEFERRED и не блокирует core-разработку.

Зафиксируй текущий build/version/seed и создай docs/assemble-day/reports/owner-acceptance-v0.1.md. Не называй эту сессию независимым human test. Владелец проходит игру сам, без чтения кода, документации и diagnostic trace во время принятия решений: вход через HEYS «Игры», первый выбор/result, полная неделя, Week/Month/Life, журнал, выход и reload/resume.

First-touch — veto: до касания видны необратимость и известная цена, касание намеренно, после раскрытия последствий сменить вариант нельзя. До каждого ключевого решения владелец кратко фиксирует ожидаемый компромисс; после result — что произошло и как это меняет следующий выбор. Отдельно оцени weekly contract, echo, два платных stabilizer, development, brief/final и четыре оси итога.

После первой полной недели запусти тот же seed с другим weekly plan и реально начни вторую стратегию. Replay считается состоявшимся только когда изменённый выбор или план приводит к первой наблюдаемой downstream-разнице в следующем решении; обещание «переиграл бы иначе» не считается.

Причинность и интерес владелец оценивает независимо как ACCEPT/WARN/REJECT и поясняет одним конкретным фактом поведения. После прохождения скопируй replay-safe technical trace и сверь его с наблюдаемой цепочкой, не используя trace как доказательство интереса. Каждый дефект получает screen/step, visible state, expected/actual, severity S0–S3; гипотезы отделены от фактов.

Критерии: полная неделя завершена; same-seed replay дошёл до downstream-разницы; first-touch veto пройден; causality и interest не имеют REJECT; нет S0/S1. WARN допускается только с явной записью принятого владельцем риска. Итог — ровно `OWNER_ACCEPTED` или `REWORK`; при REWORK Sprints 7–20 остаются BLOCKED. Внешняя пригодность остаётся `NOT VALIDATED / DEFERRED`. `pnpm docs:reference:check` проходит. Добавь append-only лог с build, seed, Evidence и Gate.

Не меняй engine, calibration, QA-пороги или продуктовые решения внутри gate-сессии: наблюдения сначала фиксируются, отдельная доработка запускается новым prompt. Не подключай personal data/куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 7 — Full causal QA owner-accepted build

**Статус:** ⛔ `BLOCKED` — нельзя начинать до результата Sprint 6.

### Результат

Точный build Sprint 6 получает новый полный отчёт 10 000 seed × 7 QA-policies
без ослабления gates.

### Промпт

```text
Проведи Sprint 7 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — полный causal QA owner-accepted build. Начинай только при `OWNER_ACCEPTED` Sprint 6 и отсутствии S0/S1. Личная приёмка не является внешним human validation; этот факт сохрани в отчёте и маршрутных документах.

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

**Статус:** ⬜ `NOT STARTED` — не разрешён до прохождения предыдущих gates.

### Результат

Партнёр и ребёнок имеют объяснимые окна, обязательства и reciprocity, не
превращаясь в фоновую симуляцию The Sims.

### Промпт

```text
Продолжи HEYS «Собери день»: реализуй Sprint 8 из docs/assemble-day/assemble_prodution_megaplan.md — компактную самостоятельность семьи. Начинай только после `OWNER_ACCEPTED` Sprint 6 и PASS Sprint 7.

Проблема: family state хранит available/load/trust, но availability почти не ограничивает помощь, а собственные окна семьи не участвуют в decisions. Сначала сверь D21–D23, 04_FAMILY_SOCIAL.md и блокеры Sprint 8 в backlog. Возраст 7–9 лет уже принят D22 и не открывается заново. Если точные state-поля, расписание/cadence, autonomy boundaries, передача задач, decay нагрузки или запрещённые события меняют schema/content и остаются открыты, оформи решение и останови implementation как PARTIAL/BLOCKED; не кодируй ответ молча.

После решений создай минимальную дискретную модель: known busy windows, current load/energy, concrete commitments и history распределения. Ответ на просьбу детерминированно объясним состоянием, не hidden random refusal. Добавь нагрузочные и положительные reciprocal events. Не вводи moral parent rating.

Критерии: ask_partner_help имеет реальную availability/price; partner/child windows читаются offer/reducer; одно решение партнёра и одно событие ребёнка меняют future choice; есть positive reciprocal path; journal называет вход; несколько viable strategies сохраняются; постоянный DoD §1.2, focused tests, QA smoke, standalone/scoped bundle, smoke 390×844/desktop и `pnpm docs:reference:check` проходят. Добавь лог с Evidence и Gate.

Не добавляй тяжёлые кризисы, диагнозы, gender roles, personal data или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 9 — Экономика и карьерный минимум

**Статус:** ⬜ `NOT STARTED` — не разрешён до прохождения предыдущих gates.

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

**Статус:** ⬜ `NOT STARTED` — условный этап после evidence предыдущих gates.

### Результат

Спринт выполняется только если люди хотят replay, но упираются в однообразие;
иначе получает `SKIPPED_BY_GATE`.

### Промпт

```text
Продолжи HEYS «Собери день»: выполни условный Sprint 10 из docs/assemble-day/assemble_prodution_megaplan.md — content diversity и replay. Начинай только после PASS Sprint 9 и owner evidence Sprint 6, что H31 ограничена вариативностью. Если replay не нужен из-за broken loop, запиши SKIPPED_BY_GATE и код не меняй.

Технический факт: 38 fixed slots и 42 templates ограничивают пространство. Вред для interest — hypothesis. Используй interaction/replay evidence, не аргумент «играм нужен контент».

Добавь минимальное evidence-selected число event families. У каждой trigger, cooldown, domain limit, causal input, rule evidence и минимум два contexts. Fixed anchors остаются; same seed детерминирован, другой seed меняет только разрешённые внешние обстоятельства. Вариант обязан менять decision/trade-off, не только текст.

Критерии: в журнале есть evidence запуска; same seed воспроизводим; different seeds различимы и справедливы; D59 limits/fixed anchors сохранены; new families покрыты; две стратегии создают разные choices; постоянный DoD §1.2, focused tests, QA smoke, standalone/scoped bundle, smoke 390×844/desktop и `pnpm docs:reference:check` проходят. Добавь лог с Evidence и Gate.

Не добавляй loot, achievements, rarity, hidden rubber-banding, personal data или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 11 — Full causal QA expanded week

**Статус:** ⬜ `NOT STARTED` — не разрешён до прохождения предыдущих gates.

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

## Sprint 12 — Stage 6 owner exit gate

**Статус:** ⬜ `NOT STARTED` — не разрешён до прохождения предыдущих gates.

### Результат

Владелец принимает или возвращает на доработку полный семидневный slice на
build, прошедшем Sprint 11; внешняя пригодность остаётся deferred.

### Промпт

```text
Проведи Sprint 12 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — personal owner exit gate Stage 6. Начинай только после PASS Sprint 11.

Используй frozen build и owner-acceptance protocol Sprint 6. Владелец самостоятельно проходит обновлённую полную неделю без кода, документации и diagnostics во время решений, затем запускает same-seed replay с отличимой стратегией. Результат запиши новой versioned редакцией owner-acceptance report, не переписывая Sprint 6.

First-touch veto обязателен. Проверь weekly contract, family negotiation, economy horizon, два платных stabilizer, development, external disruption vs echo и итог с openThreads. Same-seed replay засчитывается только после фактического старта отличимой стратегии владельца и наблюдаемой downstream-разницы.

Causality/interest оцени отдельно как ACCEPT/WARN/REJECT. REJECT блокирует expansion; WARN допускается только с явной записью принятого владельцем риска. Technical trace — только сверка mechanics; факты, субъективная оценка и гипотезы разделены.

Критерии: build fingerprint сохранён; causality и interest не имеют REJECT; first-touch veto пройден; нет S0/S1; replay дошёл до downstream-разницы; issues имеют evidence/severity; итог — `OWNER_ACCEPTED` или `REWORK`; owner docs/backlog/roadmap обновлены только подтверждёнными фактами. Внешняя пригодность остаётся `NOT VALIDATED / DEFERRED`; `pnpm docs:reference:check` проходит. Добавь лог с Evidence и Gate.

Не меняй calibration, thresholds, engine или decisions по одному наблюдению. Не подключай personal data/куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 13 — Owner longitudinal GO/NO-GO до месяца

**Статус:** ⬜ `NOT STARTED` — не разрешён до прохождения предыдущих gates.

### Результат

До разработки 30 дней владелец проверяет на себе, нужна ли ему межсессионная
траектория, а не просто более длинная текущая неделя.

### Промпт

```text
Проведи Sprint 13 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — personal owner longitudinal GO/NO-GO до разработки month lifecycle. Начинай только после `OWNER_ACCEPTED` Sprint 12.

Подтверждённого evidence, что человек хочет возвращаться к этой игре в другой день и держать месячную цель, пока нет. Не принимай «хочу больше контента» за доказательство длинного цикла.

Подготовь versioned owner protocol и минимальный synthetic storyboard продолжения: старт месяца, weekly checkpoint, изменение приоритета, накопленная open thread и month outcome. Не реализуй production engine/UI. Владелец проводит минимум две сессии в разные дни: первая использует текущий slice, вторая — storyboard/return cue. Не имитируй возвращение мгновенным checkpoint: фиксируй фактический return, recall стратегии, понятность carry-over и ценность month goal.

Раздельно проверь: хочет ли человек продолжить того же персонажа; помнит ли незавершённую линию; понимает ли отличие дня/недели/месяца; меняет ли weekly checkpoint следующую стратегию; нужен ли 30-day horizon или достаточно новой семидневной кампании. Заранее зафиксируй GO/NO-GO thresholds и privacy/retention.

Критерии: protocol/artifacts воспроизводимы; есть две owner-сессии в разные дни и фактический return; факты, поведение, субъективная оценка и гипотезы разделены; принято явное GO/NO-GO. D11 уже фиксирует условный 30-дневный цикл: Sprint 13 решает, реализовывать ли этот target; противоречащее evidence требует нового решения, явно заменяющего D11. При NO-GO Sprints 14–18 SKIPPED_BY_GATE, код не меняется; при GO закрыты week boundaries, replanning cadence и carry-over. Вывод применим только к владельцу; внешний longitudinal evidence остаётся DEFERRED. Income cadence принадлежит Sprint 9 и здесь не открывается повторно; `pnpm docs:reference:check` проходит. Добавь лог с Evidence и Gate.

Не подключай real HEYS data, персональный режим или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 14 — Month lifecycle и headless period contract

**Статус:** ⬜ `NOT STARTED` — только после `GO` Sprint 13.

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

**Статус:** ⬜ `NOT STARTED` — не разрешён до прохождения предыдущих gates.

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

**Статус:** ⬜ `NOT STARTED` — только при подтверждённой repetitive burden.

### Результат

Только при доказанной repetitive burden игрок может создать прозрачные
низкорисковые policies; крупные и необратимые решения остаются ручными.

### Промпт

```text
Продолжи HEYS «Собери день»: выполни условный Sprint 16 из docs/assemble-day/assemble_prodution_megaplan.md — runtime policies знакомых решений. Начинай только при evidence Sprints 13/15, что повторы реально утомляют. Иначе запиши SKIPPED_BY_GATE и код не меняй.

Изучи D31/D44/D52, habits/capabilities, reducer/checkpoint/trace и owner evidence. Создай отдельный product contract `DecisionPolicy` или эквивалент; не переиспользуй QA `PolicyId`, который описывает simulation agents. Policy открывается после заранее заданного числа ручных решений одного типа.

Начни максимум с 2–3 низкорисковых действий. До исполнения показывай recognized condition, proposed action, known price и stop condition. Policy создаёт обычный confirmed reducer-step, не обходит checkpoint, и может быть overridden. Она никогда не подтверждает first-touch, дорогие, family, career, conflict или irreversible choices.

Критерии: нет доступа до manual familiarity; simulation policy и runtime policy типобезопасно разделены; suggestion/confirmation/override различаются в journals; policy не скрывает цену и не меняет state напрямую; постоянный DoD §1.2, focused engine/web/persistence tests, QA smoke, standalone/scoped bundle, smoke 390×844/desktop и `pnpm docs:reference:check` проходят. Добавь лог с Evidence и Gate.

Не добавляй autoplay, streak rewards, personal data или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 17 — Full causal QA long-horizon build

**Статус:** ⬜ `NOT STARTED` — не разрешён до прохождения предыдущих gates.

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

## Sprint 18 — Longitudinal owner exit gate

**Статус:** ⬜ `NOT STARTED` — не разрешён до прохождения предыдущих gates.

### Результат

Владелец реально возвращается к одной 30-дневной кампании в нескольких сессиях;
causality, interest, return value и итог оцениваются независимо.

### Промпт

```text
Проведи Sprint 18 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — longitudinal owner exit gate после PASS Sprint 17.

Подготовь frozen build и versioned owner protocol. Владелец проходит одну 30-дневную кампанию в нескольких реально разнесённых сессиях; checkpoint подмена допустима только в заранее обозначенном техническом rehearsal, не в owner evidence. Фиксируй фактический return, recall goals/openThreads, изменение weekly strategy и завершение month.

Отдельно оцени causality, interest, return motivation, decision fatigue, usefulness weekly replanning, policy comprehension/override если policies есть, month summary и желание владельца начать ещё одну кампанию. First-touch fairness остаётся veto. Same-seed replay оценивается фактической альтернативной траекторией владельца, если H31 всё ещё активна.

Interaction evidence и technical trace разделены. Issue содержит session/time/visible state/behavior/owner note/severity; hypotheses не выдаются за facts. Causality, interest и return value оцениваются отдельно как ACCEPT/WARN/REJECT.

Критерии: одна complete owner longitudinal rubric на фактической 30-дневной кампании; causality, interest и return value не имеют REJECT; WARN принят явно; нет S0/S1; final outcome осмыслен без diagnostics; итог — `OWNER_ACCEPTED` или `REWORK`; подтверждённые выводы обновлены. Внешняя пригодность остаётся `NOT VALIDATED / DEFERRED`; без реально разнесённых owner-сессий статус BLOCKED. `pnpm docs:reference:check` проходит. Добавь лог с Evidence и Gate.

Не меняй calibration/engine по одному наблюдению и не подключай personal data/куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 19 — Breadth GO/NO-GO

**Статус:** ⬜ `NOT STARTED` — не разрешён до прохождения предыдущих gates.

### Результат

После доказанного core и месяца принимается решение, нужны ли новые
household/career configurations, какие именно и какую подтверждённую проблему
они решают.

### Промпт

```text
Проведи Sprint 19 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — product/content GO/NO-GO на расширение configurations. Начинай только после `OWNER_ACCEPTED` Sprint 18.

Изучи D20, target scope docs, owner evidence Sprints 12/18, coverage reports и backlog. Не считай разнообразие самоцелью. Составь карту `observed unmet strategy/identification need → proposed household/career configuration → changed mechanics → content/rule evidence cost → risk`. Отдели желание увидеть себя от необходимости персональных данных.

Владелец проводит concept test на synthetic character cards с заранее заданными критериями. Не реализуй новый engine/UI content. При GO выбери минимальный набор mechanically distinct configurations и зафиксируй owner decisions, schema/content dependencies и отдельный implementation plan. При NO-GO оставь fixed character. Внешняя идентификация других пользователей этим тестом не подтверждается.

Критерии: есть воспроизводимый evidence и явный GO/NO-GO; каждый proposed configuration меняет decisions, а не только biography; нет demographic stereotyping; при NO-GO код не меняется; `pnpm docs:reference:check` проходит. Добавь лог с Evidence и Gate.

Не добавляй appearance editor, real client data, diagnoses или куратора. Не выполняй staging, commit, push или PR.

Используй субагентов только для независимых частей, которые действительно выгодно выполнять параллельно.

В этом же workspace могут параллельно работать агенты из других чатов. Перед правками проверь текущее состояние файлов и `git status`, изменяй только свой согласованный scope, не откатывай и не перезаписывай чужие изменения. Если обнаружено пересечение по тем же файлам или тесно связанным контрактам, используй доступный межзадачный канал: сообщи владельцу точные файлы/контракты, согласуй границы и одного writer'а. Пока ждёшь ответа, продолжай только независимую часть. Если канала нет или ownership не согласован, остановись и явно сообщи о конфликте вместо молчаливого разрешения. Перед handoff или освобождением scope отправь владельцу краткий итог: что изменено, какие проверки прошли и какие риски остались.
```

---

## Sprint 20 — Gate longitudinal mirror реальных данных HEYS

**Статус:** ⬜ `NOT STARTED` — deferred до PASS Sprint 17, `OWNER_ACCEPTED`
Sprint 18 и отдельных product/expert/legal/privacy gates.

### Результат

Идея H33 получает доказательное GO/NO-GO на synthetic storyboard. Реальные
данные не подключаются в этом спринте даже при GO.

### Промпт

```text
Проведи Sprint 20 HEYS «Собери день» из docs/assemble-day/assemble_prodution_megaplan.md — продуктовый, экспертный, правовой и privacy gate гипотезы H33: реальная долгосрочная траектория клиента как развитие персонажа. Начинай только после PASS Sprint 17, `OWNER_ACCEPTED` Sprint 18 и отдельного разрешения владельца продукта.

Изучи 07_HEYS_INTEGRATION_SAFETY.md, D8/D41–D48, H33, storage/data architecture и owner evidence. На полностью synthetic data создай storyboard: consent, список минимальных агрегатов, источник/confidence, изменение longitudinal context, право оспорить, disconnect и deletion. Не импортируй реальные записи и не делай production integration.

Владелец проверяет на synthetic storyboard: ценность mirror; понимание «игровая модель ≠ оценка меня»; отсутствие чувства наказания за реальные показатели; ясность synthetic/real boundary; informed consent; ожидания retention/deletion; желание видеть source и отменять inference. Отдельная экспертная, правовая и privacy review остаётся обязательной даже для личного продукта.

Предпочтительный data principle при возможном GO: coarse derived aggregates, purpose limitation, opt-in, local/client scope, no raw diary, reversible consent, deletion of derivatives и неизменность base action success при одинаковом game state. Вес, calories, diagnoses, drugs и curator notes не входят по умолчанию.

Критерии: явный GO/NO-GO; categories/purpose/retention/consent/deletion/audit trail определены; owner comprehension criteria заданы и проверены; внешняя пригодность остаётся DEFERRED; expert/legal/privacy review имеет явный результат; при NO-GO код не меняется; при GO создан отдельный implementation plan/contract tests, но интеграция не выполняется; `pnpm docs:reference:check` проходит. Добавь лог с Evidence и Gate.

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
node --import tsx -e "Promise.all([import('./packages/assemble-day-engine/src/content/scenario.ts'),import('./packages/assemble-day-engine/src/planning.ts'),import('./packages/assemble-day-engine/src/reducer.ts'),import('./packages/assemble-day-engine/src/policies.ts')]).then(([s,p,r,q])=>{let state=p.reducePlanningStep({state:s.createInitialState('checkpoint-budget'),plan:{weeklyRuleIds:['protect_sleep','work_blocks'],mainGoal:'work',supportingGoal:'family'}}).state;let steps=0;while(state.scenarioCursor<s.registries.slots.length){const e=r.initialEvent(state,s.registries);const offers=r.getActionOffers(state,e.templateId,s.registries);const a=q.selectAction(state,state.scenarioCursor,'balanced',offers);state=r.reduceStep({state,openEvent:e,actionId:a.actionId},s.registries).state;steps++;}console.log({steps,journal:state.causalJournal.length,jsonChars:JSON.stringify(state).length,utf16ApproxBytes:JSON.stringify(state).length*2});})"
```

| Проверяемое утверждение                                                     | Source                                                                      | Verification                                                                                                                                                                                                                      | Статус последней проверки                                                                                               | Интерпретация                                                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------- |
| Реестры содержат 31 action, 42 events и 38 slots                            | `packages/assemble-day-engine/src/content/scenario.ts`                      | `node --import tsx -e "import('./packages/assemble-day-engine/src/content/scenario.ts').then(({registries})=>console.log(Object.keys(registries.actions).length,Object.keys(registries.events).length,registries.slots.length))"` | ✅ `31 42 38`                                                                                                           | Технически насыщенная, но фиксированная неделя                                                     |
| QA v0.2 прошёл 10 000 × 7                                                   | `reports/causal-qa-v0.2.json`                                               | `node -e "const s=require('./docs/assemble-day/reports/causal-qa-v0.2.json').simulation; console.log(s.seedCount,s.policyIds.length,s.runCount,s.failures.length,Object.values(s.gates).filter(g=>!g.passed).length)"`            | ✅ `10000 7 70000 0 0`                                                                                                  | Доказывает gates симуляции, не human interest                                                      |
| Full v0.4 report отсутствует                                                | filesystem                                                                  | `test ! -e docs/assemble-day/reports/causal-qa-v0.4.json`                                                                                                                                                                         | ✅ absent                                                                                                               | Smoke нельзя называть full QA                                                                      |
| Личный маршрут: Sprints 0–5 DONE → Sprint 6 owner acceptance                | production-мегаплан                                                         | `rg -n -e 'Personal owner-acceptance' -e 'OWNER_ACCEPTED' docs/assemble-day/assemble_prodution_megaplan.md`                                                                                                                       | ✅ 2026-07-30                                                                                                           | Для владельца внешний cohort deferred; general-audience claims не повышены                         |
| Human protocol содержит наводящие T3–T7                                     | `reports/vertical-slice-evaluation-v0.1.md`                                 | `sed -n '30,58p' docs/assemble-day/reports/vertical-slice-evaluation-v0.1.md`                                                                                                                                                     | ✅ задания называют цену, перенос, ограничения и точную историю                                                         | Нужен неподсказанный first run до probes                                                           |
| Rule-evidence registry v0.2 связан с runtime                                | `05_STATE_CAUSAL_ENGINE.md`, `08_VERTICAL_SLICE.md`, `09_CALIBRATION_QA.md` | `rg -n -e 'Rule-evidence registry v0.2' -e 'ruleEvidenceId' docs/assemble-day/09_CALIBRATION_QA.md packages/assemble-day-engine/src`                                                                                              | ✅ stable IDs и offer evidence присутствуют 2026-07-30                                                                  | Экспертный D8 остаётся открытым; runtime provenance Sprint 5 закрыта                               |
| Game seed и сериализованный state не содержат UUID клиента                  | browser adapter + focused test                                              | `pnpm --dir apps/web exec vitest run __tests__/planning-game-assemble-day.test.js --no-coverage`                                                                                                                                  | ✅ 14 tests; opaque `ad1_…`, UUID-bearing seed отклоняется                                                              | Raw clientId остаётся только storage boundary                                                      |
| Initial state сохраняет opaque seed в campaignId/RNG                        | `packages/assemble-day-engine/src/content/scenario.ts`                      | `rg -n -e 'campaignId:' -e 'rng:' -e 'seed' packages/assemble-day-engine/src/content/scenario.ts`                                                                                                                                 | ✅ seed copied                                                                                                          | Допустимо: seed UUID-free и не зависит от профиля                                                  |
| Registry cap checkpoint = 512 KiB; внутренний budget = 128 KiB              | registry + browser adapter                                                  | `rg -n -A8 'planning_assemble_day_campaign' apps/web/heys_storage_registry_v1.js && rg -n 'CHECKPOINT_BUDGET_BYTES' apps/web/assemble-day/heys_assemble_day_game_v1.ts`                                                           | ✅ `512 * KB`; `128 * 1024`                                                                                             | Внешний cap не повышался                                                                           |
| Полная неделя сохраняется как компактный envelope v2                        | focused browser-adapter test                                                | `pnpm --dir apps/web exec vitest run __tests__/planning-game-assemble-day.test.js --no-coverage`                                                                                                                                  | ✅ replay совпадает; запас до cap >480 KiB                                                                              | Полный state/journal/trace не дублируются                                                          |
| Checkpoint compatibility fail-closed                                        | game adapter + storage-layer sentinel test                                  | `pnpm --dir apps/web exec vitest run __tests__/planning-game-assemble-day.test.js __tests__/storage-layer.test.js --no-coverage`                                                                                                  | ✅ missing/corrupt/foreign/incompatible/privacy/stale различаются                                                       | Safe v1 мигрирует только после следующего confirmed step                                           |
| Day boundary summary исполняется ровно один раз                             | campaign + web UI + tests                                                   | `pnpm --dir packages/assemble-day-engine exec vitest run src/__tests__/campaign.test.ts --no-coverage && pnpm --dir apps/web exec vitest run __tests__/planning-game-assemble-day.test.js --no-coverage`                          | ✅ 7 day + 1 week boundaries; reload не меняет revision/journal                                                         | Закрыто Sprint 3                                                                                   |
| Engine openThreads показаны в completion UI                                 | campaign + web UI                                                           | `rg -n 'openThreads                                                                                                                                                                                                               | Что осталось открытым' packages/assemble-day-engine/src/campaign.ts apps/web/assemble-day/heys_assemble_day_game_v1.ts` | ✅ human-readable threads входят в week summary и первый слой финала                               | Финал зеркально замыкает brief                          |
| Planning capacity имеет встречную цену                                      | planning/types/actions/scenario                                             | focused `planning.test.ts` + source scan                                                                                                                                                                                          | ✅ `2/3` rule slots, attention `2+1`, authored alignment/window tags                                                    | Бесплатный planning benefit устранён                                                               |
| Habits без downstream не называются development                             | actions/scenario/campaign/tests                                             | `pnpm --dir packages/assemble-day-engine exec vitest run src/__tests__/campaign.test.ts --no-coverage`                                                                                                                            | ✅ projection содержит только professional/cooking/reciprocal-support                                                   | Записи остаются history/trace, не декоративным прогрессом                                          |
| Development direction нейтрально описывает паттерн                          | `packages/assemble-day-engine/src/types.ts`, `campaign.ts`                  | `rg -n 'strengthened.*weakened.*changed' packages/assemble-day-engine/src/types.ts`                                                                                                                                               | ✅ `improved/gained` отсутствуют из user-facing type                                                                    | Морализующая семантика устранена                                                                   |
| Outcome, period и development summaries не показывают internal 0–100        | `packages/assemble-day-engine/src/campaign.ts`                              | `pnpm --dir packages/assemble-day-engine exec vitest run src/__tests__/campaign.test.ts --no-coverage`                                                                                                                            | ✅ raw paths/internal deltas отсутствуют в user projection                                                              | Exact evidence остаётся diagnostics                                                                |
| Authored presentation и evidence принадлежат engine                         | presentation/actions/scenario + web UI                                      | `rg -n -e 'EVENT_COPY' -e 'ruleEvidenceId' packages/assemble-day-engine/src/content packages/assemble-day-engine/src/types.ts && ! rg -n 'const EVENT_COPY                                                                        | const EVENT_ACTION_COPY' apps/web/assemble-day/heys_assemble_day_game_v1.ts`                                            | ✅ один engine source; UI получает готовую проекцию                                                | Content ownership и runtime provenance закрыты Sprint 5 |
| Privacy QA сканирует key names                                              | `packages/assemble-day-engine/src/simulation.ts`                            | `rg -n 'containsPersonalization                                                                                                                                                                                                   | Object.keys' packages/assemble-day-engine/src/simulation.ts`                                                            | ✅ key-name traversal                                                                              | UUID в value может пройти gate                          |
| UI trace не является interaction ledger                                     | web UI                                                                      | `rg -n 'trace                                                                                                                                                                                                                     | decision                                                                                                                | planning                                                                                           | details                                                 | pointer                                                    | keydown' apps/web/assemble-day/heys_assemble_day_game_v1.ts` | ✅ reducer/planning trace; UX ledger нет | Нельзя выводить usability из technical trace |
| Standalone имеет отдельный generator                                        | `apps/web/package.json`, bundler script                                     | `rg -n 'bundle:assemble-day                                                                                                                                                                                                       | bundle-assemble-day-game' apps/web/package.json apps/web/scripts/bundle-assemble-day-game.mjs`                          | ✅ отдельная command                                                                               | TS change требует exact standalone workflow             |
| H1–H32 не проверены; H33 зарегистрирована как deferred                      | `11_HYPOTHESES_BACKLOG.md`                                                  | `rg -c 'Не проверена' docs/assemble-day/11_HYPOTHESES_BACKLOG.md && rg -n '^\| H33 \|.*DEFERRED.*Sprint 20' docs/assemble-day/11_HYPOTHESES_BACKLOG.md`                                                                           | ✅ `32` + H33 deferred, 2026-07-30                                                                                      | Реализация механизма не повышает human hypothesis                                                  |
| D8 открыт; registry не содержит reviewed-строк                              | decision register + calibration owner                                       | `rg -n '^\| D8 \|.*Открыто' docs/assemble-day/10_DECISION_REGISTER.md && rg -n 'reviewed.*запрещён                                                                                                                                | таких строк нет' docs/assemble-day/09_CALIBRATION_QA.md`                                                                | ✅ 2026-07-30                                                                                      | UX PASS не заменяет product/expert governance           |
| Реальный month outcome deferred; replay value/diversity остаётся hypothesis | README/register/backlog/roadmap                                             | `rg -n 'месячн.\*DEFERRED                                                                                                                                                                                                         | H23                                                                                                                     | H31' docs/assemble-day/{README.md,10_DECISION_REGISTER.md,11_HYPOTHESES_BACKLOG.md,12_ROADMAP.md}` | ✅ 2026-07-30                                           | Не путать target D4/D11 и технический D64 с human evidence |

Evidence выше ведёт к последовательности: foundation → честный core → owner
acceptance → full QA → controlled breadth → owner exit → longitudinal owner gate
→ month → long-horizon QA/owner exit → только затем H33. Внешний human track
остаётся deferred до решения расширять аудиторию.

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

### 2026-07-30 · Sprint 1 · DONE

- Игрок: подтверждённый planning/action шаг возобновляется после reload с тем же
  result beat; повреждённое, чужое, несовместимое или privacy-unsafe сохранение
  не сбрасывается и не перезаписывается молча.
- Механика: browser seed заменён на UUID-free `ad1_…`; raw `clientId` остаётся
  storage-boundary. Envelope повышен `1 → 2` и хранит seed, scope tag, contract,
  revision, state hash и компактный ledger; state, summary, journal и trace
  восстанавливаются точным reducer replay. Engine, schema `2`, scenario `3`,
  calibration `0.3`, QA-пороги и causal reports не менялись.
- Размеры: полная неделя с planning — `9 434` байта из внутреннего budget
  `131 072` байта; запас до registry cap 512 KiB — `514 854` байта. Standalone
  artifact — `252 306` байт (`48 570` gzip), CSS — `16 330` байт (`3 323` gzip).
  Полный trace — `2 031 543` UTF-8 байта и создаётся только по явному
  копированию, в checkpoint не хранится.
- Delivery: isolated browser trace до клика показал `0` game requests, `0`
  resource nodes и отсутствие регистрации модуля; после клика появились ровно
  standalone JS и CSS, модуль зарегистрировался и открыл fullscreen. Повторный
  reload снова дал `0` ресурсов до клика и восстановил revision `2` после
  открытия.
- Проверки: web/storage/lazy — `98/98 PASS`; focused engine contracts/planning/
  reducer/RNG — `31/31 PASS`; `pnpm --dir apps/web bundle:assemble-day` и
  `node --check` — PASS. Browser smoke: `390×844` и `1440×900`, horizontal
  overflow отсутствует, выход возвращает фокус карточке, console errors `0`.
  `pnpm docs:reference:check` — `175 local links`, `19 dossier passports`,
  duplicate IDs и ошибок нет.
- Evidence: regression tests
  `planning-game-assemble-day.test.js`/`storage-layer.test.js`, runnable Facts
  Tables §5 и reference-досье, checkpoint measurement и isolated browser
  resource trace 2026-07-30.
- Gate: Sprint 1 закрыт; следующий разрешённый prompt — Sprint 2. Full causal QA
  v0.3 не запускался и остаётся Sprint 7 на отдельном runner.
- Осталось: настоящий 30-дневный budget повторно доказывается в Sprints 14–15;
  fixed-name SW может отдать предыдущий standalone asset при обновлении и
  требует отдельного hashed-asset/revalidation контракта, когда shared generated
  ownership свободен. Human causality/interest не повышены и остаются Sprint 6.

### 2026-07-30 · Sprint 2 · DONE

- Игрок: в «Неделе» до подтверждения видит ёмкость `2/3`, источник и цену каждой
  границы; в горизонте планирования — распределение внимания `2+1`. Третья
  граница недоступна, пока игрок не освободит один слот.
- Механика: удалены бесплатные time reductions. `ActionDefinitionV2` явно задаёт
  `priorityAlignment.supports/conflicts`; scenario v4 владеет тегами рабочего,
  семейного и вечернего окон. Поддержка применяется максимум к одному
  сильнейшему фокусу, а конкурирующее действие получает risk/option-pressure и
  журналирует конкретный `planningCapacity.*` вход. Persisted `GameStateV2` не
  расширялся.
- Версии: package `0.4.0`, scenario `4`, calibration `0.4`, technical contract
  `0.32`; прежние D60/D66 thresholds не ослаблены. Старый exact-version
  checkpoint получает существующий явный `incompatible`, без silent migration.
- Проверки: engine contracts/planning/reducer — `32/32 PASS`; engine type-check
  и standalone syntax — PASS; web/storage/lazy — `98/98 PASS` с точечной
  перепроверкой game adapter `13/13`; последовательный `qa.test.ts` 20 seed × 7
  policies — `3/3 PASS`. Full 10 000×7 report не запускался.
- Delivery: `pnpm --dir apps/web bundle:assemble-day` — PASS; scoped
  `bundle:legacy:auto` подтвердил, что общие legacy bundles не затронуты.
  Standalone JS — `261 515` байт (`50 105` gzip), CSS — `17 029` байт (`3 410`
  gzip).
- Browser: isolated synthetic client, `390×844` и `1440×900`; `2/2`, конфликт,
  `3/3`, подтверждение плана и переход к дневной развилке видимы; horizontal
  overflow отсутствует, console errors `0`.
- Evidence: `planning.test.ts`, `planning-game-assemble-day.test.js`, Facts
  Table `AD10/AD22` reference-досье и owner-contracts v0.34.
- Gate: Sprint 2 закрыт; следующий разрешённый prompt — Sprint 3. Человеческие
  гипотезы не повышены, полный causal QA v0.4 остаётся Sprint 7 на отдельном
  runner.
- Осталось: campaign brief, idempotent day/week summaries и зеркальный финал
  принадлежат Sprint 3; rule-evidence runtime binding и accessibility —
  Sprint 5.

### 2026-07-30 · Sprint 3 · DONE

- Игрок: до недельного контракта видит одну миссию, срок, семейные и финансовые
  ставки и реальный масштаб кампании. После решения появляется направленный
  result beat; на границе — ровно один итог дня; после воскресенья — зеркальная
  контрольная точка недели без score/win/lose.
- Механика: `CampaignBrief` восстанавливается из same-seed initial scenario.
  `getPeriodBoundaries` сверяет соседний `scenarioCursor` с authored slots, а не
  полагается на clock. Семь day boundaries и один week boundary превращаются в
  чистые `PeriodSummary`, которые не пишутся в state/checkpoint/journal.
- Финал: исходная миссия сопоставлена с двумя выбранными rules, commitments,
  qualitative pressure, четырьмя axes и human-readable `openThreads`. Month UI
  остаётся planning horizon; фиктивного месячного результата нет.
- Privacy/persistence: envelope v2 по-прежнему хранит только opaque seed,
  contract, revision, hash и decision ledger. Reload replay-восстанавливает
  `lastStepSummary` и `periodSummaries`; повторный просмотр не меняет revision,
  causal journal или storage.
- Версии: package `0.5.0`, technical contract `0.33`, docs-contract `0.35`;
  schema `2`, scenario `4`, calibration `0.4`, D60/D66 thresholds и causal
  reports не менялись.
- Проверки: engine type-check и `36/36` focused engine tests — PASS;
  web/storage/lazy — `65/65 PASS`, включая browser-adapter `14/14`.
  Последовательный smoke `20 seed × 7 policies` — PASS; полный causal QA не
  запускался. `pnpm docs:reference:check` — `175 local links`,
  `19 dossier passports`, ошибок и duplicate IDs нет.
- Browser: isolated synthetic client, `390×844` и `1440×1000`; до загрузки
  standalone ресурсы отсутствуют, campaign brief, result beat, day boundary и
  зеркальный week summary видимы; horizontal overflow отсутствует. Единственные
  console error/warning относятся к отсутствующему curator token тестовой
  страницы, не к игре.
- Evidence: `campaign.ts`, `campaign.test.ts`, web flow regression, Facts Table
  `AD23` и owner-contracts D4/D64.
- Gate: Sprint 3 закрыт; следующий разрешённый prompt — Sprint 4. Human
  causality/interest не повышены; full QA v0.4 остаётся Sprint 7 на отдельном
  runner.
- Осталось: downstream-контрфактическое развитие и нейтральная семантика —
  Sprint 4; content/evidence/a11y — Sprint 5; реальный month summary — Sprint 15
  после GO Sprint 13.

### 2026-07-30 · Sprint 4 · DONE

- Игрок: «Жизнь» больше не выдаёт каждое записанное изменение за прогресс.
  Карточка показывает только рабочий паттерн, порядок готовки и взаимную помощь
  коллеги, когда соответствующая линия действительно изменилась, и сразу
  объясняет практический эффект для будущих решений.
- Механика: `getCharacterDevelopment` стал allowlist-проекцией реального
  downstream. Professional меняет focus/offer geometry, cooking — цену
  `cook_meal_batch` и субботнее echo, `work.reciprocal_support` — будущие
  рабочие echo events. Planning/physical-fitness/habits и декоративная kitchen
  capability остаются persisted history/trace, но исключены из development.
- Семантика: `CharacterDevelopmentItem.direction` ограничен нейтральными
  `strengthened / weakened / changed`; raw delta/path остаются diagnostics.
  Human history переиспользует практический engine summary, когда carry связан с
  показанным development.
- Версии: package `0.6.0`, technical contract `0.34`, docs-contract `0.36`;
  schema `2`, scenario `4`, calibration `0.4`, QA thresholds и causal reports не
  менялись.
- Проверки: engine type-check и `38/38` focused engine tests — PASS;
  web/storage/lazy — `65/65 PASS`; последовательный QA smoke
  `20 seed × 7 policies` — `3/3 PASS`. Standalone — `289 354` байта (`54 627`
  gzip), CSS — `18 837` байт (`3 581` gzip); scoped legacy sync не затронул
  общие bundles.
- Browser: isolated synthetic client, `390×844` и `1440×1000`; click-only до
  загрузки `0` JS/CSS, после cooking виден только downstream-подтверждённый
  «Порядок готовки»; horizontal overflow отсутствует.
- Evidence: `campaign.ts`, `campaign.test.ts`, `reducer.test.ts`, Facts Table
  `AD24`, D12/D65 и rule-evidence row `re_habit_skill_future_geometry`.
- Gate: Sprint 4 закрыт; следующий разрешённый prompt — Sprint 5. Human
  causality/interest не повышены; full QA v0.4 остаётся Sprint 7 на отдельном
  runner.
- Осталось: единый authored content/evidence contract, human/technical history
  split и keyboard/a11y принадлежат Sprint 5.

### 2026-07-30 · Sprint 5 · DONE

- Игрок: все 38 базовых развилок получили authored human copy вместо технических
  заглушек. На карточке решения видны цена, известные последствия, повлиявший
  контекст и нейтральные метки `Сохранено / Компромисс / Под напряжением`;
  источник, уверенность и предел переноса раскрываются во втором слое.
- Механика: presentation и rule-evidence binding принадлежат engine registries.
  Все conditional, scheduled и geometry-changing rules связаны со стабильными
  `ruleEvidenceId`; UI использует `ActionOffer` и не читает effect schema или
  формулы. Точный path/delta остаётся только в диагностическом trace.
- Accessibility: decision radiogroup имеет один tab-stop; стрелки только
  перемещают фокус, а первое нажатие, `Space` или `Enter` необратимо фиксирует
  вариант. Planning radios используют стандартный roving pattern; result beat
  получает фокус и объявляется live region. Добавлены non-color labels,
  48-пиксельные targets, forced-colors focus и reduced-motion guard.
- Privacy: «Игровое наблюдение» строится только по синтетическому персонажу;
  дневник HEYS и персональные данные не читаются. D8 остаётся открытым:
  `plausible_model` не повышен до экспертно рассмотренного evidence.
- Версии: package `0.7.0`, technical contract `0.35`, docs-contract `0.37`;
  schema `2`, scenario `4`, calibration `0.4`, QA thresholds и causal reports не
  менялись.
- Проверки: engine type-check и `38/38` focused engine tests — PASS; game
  adapter/storage/lazy — `101/101 PASS`; последовательный QA smoke
  `20 seed × 7 policies` завершён без failed gate. Полный `10 000 × 7` прогон не
  запускался.
- Delivery: standalone JS — `310 951` байт (`57 841` gzip), CSS — `20 951` байт
  (`3 890` gzip). `pnpm --dir apps/web bundle:assemble-day` — PASS; scoped
  `bundle:legacy:auto` подтвердил, что общие legacy bundles не затронуты.
- Browser: synthetic isolated flow на `390×844`, `1440×1000` и desktop-
  equivalent 200%; до клика `0` game JS/CSS и модуль не зарегистрирован, после
  клика загружены только standalone JS/CSS. Planning, необратимое решение,
  result focus, Week/Month/Life и reload/resume проверены; horizontal overflow
  отсутствует. Сетевые ошибки localhost demo относились к заблокированным
  CORS/WebSocket служебным запросам, не к игровому модулю.
- Документация: `pnpm docs:reference:check` — `175 local links`,
  `19 dossier passports`, ошибок и duplicate IDs нет. Runtime registry v0.2
  согласован с `05_STATE_CAUSAL_ENGINE.md`, `06_UI_UX.md`,
  `08_VERTICAL_SLICE.md`, `09_CALIBRATION_QA.md`, technical addendum и
  reference-досье.
- Gate: Sprint 5 закрыт; следующий разрешённый prompt — Sprint 6. Его нельзя
  закрыть автоматикой: нужны пять реальных модерируемых сессий и независимые
  оценки причинности и интереса.
- Осталось: человеческий formative gate Sprint 6; full causal QA Sprint 7 —
  только на отдельном runner/CI. Персональный режим и кураторская интеграция не
  открыты.

### 2026-07-30 · Видимость статусов мегаплана · DONE

- Добавлен верхний трекер выполнения: Sprint 0–5 `DONE`, Sprint 6 `NEXT`, Sprint
  7 `BLOCKED`, Sprint 8–20 `NOT STARTED`.
- В таблице последовательности и под заголовком каждого спринта теперь явно
  указано, выполнен ли этап и разрешено ли его начинать.
- Содержание спринтов, продуктовые решения, код игры, balance, calibration и QA
  не менялись.

### 2026-07-30 · Personal owner-gates · DONE

- Целевой пользователь текущего маршрута — владелец продукта; пять внешних
  участников больше не блокируют core-разработку.
- Sprint 6, 12, 13 и 18 переведены на воспроизводимую личную приёмку с
  фактическим прохождением, replay/return и явным `OWNER_ACCEPTED` или `REWORK`.
- Sprint 7–20 используют owner-gates последовательно; внешняя пригодность честно
  остаётся `NOT VALIDATED / DEFERRED` до решения расширять аудиторию.
- Technical QA, first-touch veto, S0/S1, privacy, accessibility, expert/legal/
  privacy gates не ослаблены; engine, UI, balance и calibration не менялись.

### 2026-07-30 · Visual V0 · DONE

- Read-only аудит зафиксирован в
  `docs/assemble-day/reports/visual-character-audit-v0.1.md`; production UI,
  engine, reducer, persistence, bundles и core-спринты не менялись.
- S1-блокеров нет. Canonical state достаточен для концепции, но live-character
  projection отсутствует: UI и campaign summary отдельно используют пороги
  `38/67`; до V2 нужен один engine-owned read-only presentation contract.
- Текущий слой оценён в `6/10`: взрослый чистый baseline и сильная delivery/a11y
  основа, но статический силуэт почти не передаёт смешанные состояния.
- `health` в canonical state нет; discomfort не меняется current content;
  energy, mood и tension остаются независимыми, а первый слой ограничен тремя
  primary и максимум двумя relevant contextual signals.
- Visual V1 остаётся `BLOCKED` до owner-review отчёта. Выразительная 8-bit
  концепция требует доказанной совместимости с D2/D32 либо отдельной
  owner-resolution; Visual V2 требует утверждённой концепции и прямого решения
  «реализовывать».

### 2026-07-30 · Visual V1 · DONE

- Три направления и implementation-ready spec зафиксированы в
  `docs/assemble-day/reports/visual-character-concept-v0.1.md`; prompts,
  provenance и четыре iteration boards сохранены рядом в `assets/`.
- После user feedback первый Pocket Retro переработан в настоящий четырёхцветный
  B2 с фиксированной pixel-grid; recommendation — B2 scene внутри спокойного
  HEYS shell направления A. Concept C отклонён как portrait-heavy.
- Production UI, engine, reducer, persistence, bundles, core-спринты и D2/D3/D32
  не менялись. Draft owner-resolution подготовлен только в отчёте.
- Visual V2 остаётся `BLOCKED` до явного принятия owner-resolution D2/D32,
  утверждения B2 recommendation и отдельной команды «реализовывать».

### 2026-07-30 · Visual V1 owner selection · DONE

- После прямого сравнения владелец выбрал исходный `B. Pocket Retro`, файл
  `02a-pocket-retro-first-pass.png`, вместо более жёсткой B2-итерации.
- Concept B становится visual north star; phone frame, английский copy и
  сгенерированные иконки остаются только presentation-макетом и не переносятся в
  production.
- Visual V2 остаётся `BLOCKED` до owner-resolution D2/D32 и отдельной команды
  «реализовывать»; production UI, engine и decision register не менялись.

### 2026-07-30 · Visual V2 · DONE

- Узкая owner-resolution D2/D32 фиксирует Concept B Pocket Retro как visual
  north star: настроение исходной сцены сохранено, но телефонная рамка,
  английский copy и сгенерированные иконки в production не перенесены.
- Движок владеет read-only проекцией `CharacterPresentation`. Она переводит
  подтверждённое состояние в позу, выражение, нагрузку, фазу дня, три
  качественных индикатора и не более двух релевантных причин; reducer,
  checkpoint schema, balance и calibration не менялись.
- Статический силуэт заменён компактной inline SVG-сценой: 24 примитива, без
  raster/remote assets, canvas и непрерывного цикла. Первый слой сохраняет
  персонажа и три состояния; причины остаются во втором слое «Состояние
  персонажа».
- Focused verification: 9 engine tests и 24 web/lazy tests — PASS; TypeScript
  no-emit — PASS. Standalone bundle — 319 731 байт / 59 799 gzip, CSS — 23 373
  байта / 4 317 gzip; общий visual gzip delta около 2,4 KiB, ниже бюджета 12
  KiB.
- Browser smoke — PASS: до клика `0` ресурсов игры и модуль не зарегистрирован;
  после клика запрашиваются только standalone JS/CSS. На `390×844` и `1440×900`
  нет horizontal overflow, размеры сцены — `96×82` и `112×96`; эквивалент 200%
  desktop zoom (`720×450`) и forced colors также не создают overflow,
  минимальная видимая кнопка — `44px`. Reduced motion отключает animation и
  сокращает transition до практически нулевой длительности.
- `pnpm docs:reference:check` — PASS: 175 local links, 19 dossier passports,
  duplicate IDs нет.
- Visual track закрыт. Статусы core-спринтов и их owner gates не менялись.
