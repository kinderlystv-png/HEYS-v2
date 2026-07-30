# Visual V0 — аудит визуального слоя персонажа

Дата проверки: 2026-07-30

Статус: `DONE`

Scope: read-only аудит; production UI, engine, reducer, persistence и bundles не
изменялись.

## Короткий вердикт

Визуальный слой уже существует, но пока это качественный **нейтральный
baseline**, а не выразительный персонаж: статический силуэт, роль, состав семьи
и три качественных индикатора — энергия, настроение и напряжение. Его сильные
стороны — спокойный HEYS-язык, click-only доставка, светлая/тёмная тема, forced
colors и reduced motion. Слабое место — UI сам переводит числа в уровни `38/67`,
а engine-owned read-only selector для целостного состояния персонажа
отсутствует.

Итоговая оценка текущего слоя — **6/10**:

| Часть                             | Оценка | Почему                                                                                    |
| --------------------------------- | -----: | ----------------------------------------------------------------------------------------- |
| Canonical state и причинность     |   8/10 | Поля и производный контекст определены движком; reload/replay детерминированы.            |
| Presentation contract             |   4/10 | Для live-character нет engine-owned selector; пороги дублируются в UI и campaign summary. |
| Текущий визуал                    |   5/10 | Чистый и взрослый, но силуэт статичен и почти не помогает считать смешанные состояния.    |
| Delivery/accessibility foundation |   8/10 | Standalone click-only, темы, forced colors и reduced motion уже предусмотрены.            |
| Готовность к 8-bit реализации     |   3/10 | Не выбран art direction и есть прямой конфликт с D2/D32.                                  |

**Решение V0:** S1-блокеров нет; Visual V1 можно проектировать после review
этого отчёта. Visual V2 начинать нельзя до owner-resolution по D2/D32 и до
утверждения engine-owned presentation contract.

Промпты Visual V0/V1/V2 в мегаплане оцениваются как **9/10**: они разделяют
аудит, концепцию и реализацию, защищают canonical state, progressive disclosure,
IP, click-only delivery и измеримые бюджеты. Правильный следующий prompt уже
есть — Visual V1. Его качество зависит не от дополнительного текста, а от
фактического review этого отчёта и явного решения по конфликту D2/D32.

## Facts Table

| Fact                                                                                  | Status   | Evidence                                                                                                                                                                                                                            | Last verified | Notes                                                                                          |
| ------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `GameState` хранит семь vitals и шесть accumulators; поля `health` нет                | Verified | `packages/assemble-day-engine/src/types.ts:224-249`; `rg -n "health\|здоров" packages/assemble-day-engine/src/types.ts packages/assemble-day-engine/src/reducer.ts apps/web/assemble-day/heys_assemble_day_game_v1.ts` → no matches | 2026-07-30    | Нельзя вводить шкалу «здоровье».                                                               |
| Sleepiness/sleep readiness/pressure/focus вычисляются движком                         | Verified | `packages/assemble-day-engine/src/reducer.ts:43-58`                                                                                                                                                                                 | 2026-07-30    | Производные поля нельзя повторно вычислять в UI.                                               |
| Производный `DecisionContext` не сериализуется                                        | Verified | `docs/assemble-day/GAME_STATE_SCHEMA.md:264-283`                                                                                                                                                                                    | 2026-07-30    | Отдельный visual checkpoint не нужен.                                                          |
| Тяжёлое состояние уже имеет engine-owned gate                                         | Verified | `packages/assemble-day-engine/src/reducer.ts:188-189`                                                                                                                                                                               | 2026-07-30    | Это safety/selection gate, не готовая human-facing классификация.                              |
| Новый event и его `onOpenEffects` материализуются внутри подтверждённого reducer-step | Verified | `packages/assemble-day-engine/src/reducer.ts:193-210`                                                                                                                                                                               | 2026-07-30    | Visual показывает итоговое current state, но не приписывает все изменения выбранному действию. |
| Web UI коммитит новую session после успешного шага                                    | Verified | `apps/web/assemble-day/heys_assemble_day_game_v1.ts:1058-1071`                                                                                                                                                                      | 2026-07-30    | Это единственный момент обновления live visual.                                                |
| Текущий персонаж — статический силуэт + 3 status pills                                | Verified | `apps/web/assemble-day/heys_assemble_day_game_v1.ts:605-633`; `apps/web/styles/modules/912-planning-game-assemble-day.css:73-133`                                                                                                   | 2026-07-30    | Выразительной state scene пока нет.                                                            |
| UI сам классифицирует значения по `38/67`                                             | Verified | `apps/web/assemble-day/heys_assemble_day_game_v1.ts:130-134,629-631`                                                                                                                                                                | 2026-07-30    | Это presentation logic в неправильном слое.                                                    |
| Campaign summary отдельно дублирует те же `38/67`                                     | Verified | `packages/assemble-day-engine/src/campaign.ts:41-48,185-204`                                                                                                                                                                        | 2026-07-30    | Нужен один engine-owned словарь/selector, а не третий набор порогов.                           |
| `content/presentation.ts` владеет copy/evidence, но не live character projection      | Verified | `packages/assemble-day-engine/src/content/presentation.ts:1-94`; `rg -n "CharacterPresentation\|getCharacterPresentation\|characterPresentation" packages/assemble-day-engine/src apps/web/assemble-day` → no matches               | 2026-07-30    | Название файла не означает наличие нужного контракта.                                          |
| Discomfort в текущей кампании только читается формулой sleep readiness                | Verified | `packages/assemble-day-engine/src/reducer.ts:49`; `rg -n "vitals\.discomfort" packages/assemble-day-engine/src --glob '*.ts'` → один match                                                                                          | 2026-07-30    | Не выводить пользовательский cue до появления реального authored source/effect.                |
| Development projection намеренно ограничена тремя downstream-backed линиями           | Verified | `packages/assemble-day-engine/src/campaign.ts:223-252`                                                                                                                                                                              | 2026-07-30    | Skills/habits/capabilities не являются текущим самочувствием.                                  |
| D2 требует нейтральный силуэт и отделяет D3 indicators от портрета                    | Verified | `docs/assemble-day/10_DECISION_REGISTER.md:130-147`; `docs/assemble-day/06_UI_UX.md:92-101`                                                                                                                                         | 2026-07-30    | Выразительная state-driven поза/лицо требует owner-resolution либо доказанной совместимости.   |
| D32 отклоняет мультяшную стилизацию и тяжёлую геймификацию                            | Verified | `docs/assemble-day/10_DECISION_REGISTER.md:779-802`                                                                                                                                                                                 | 2026-07-30    | 8-bit — гипотеза V1, не принятое решение.                                                      |
| 390×844 должен сохранять начало вариантов решения                                     | Verified | `docs/assemble-day/06_UI_UX.md:173-182`                                                                                                                                                                                             | 2026-07-30    | Сцена не может увеличивать первый экран без доказательства.                                    |
| Standalone JS/CSS запрашиваются только после открытия игры                            | Verified | `apps/web/heys_planning_v1.js:103-112`; `apps/web/__tests__/planning-games-ui.test.js:154-176`                                                                                                                                      | 2026-07-30    | Visual не должен добавлять eager asset.                                                        |
| Текущий standalone весит 310951 B JS / 20951 B CSS; gzip 57841 / 3890 B               | Verified | `wc -c ...`; `gzip -c ... \| wc -c`                                                                                                                                                                                                 | 2026-07-30    | Baseline для V2 delta, не performance trace.                                                   |
| Runtime baseline в этой сессии не снят                                                | Verified | `nc -vz localhost 3001` → `Connection refused`                                                                                                                                                                                      | 2026-07-30    | Сервер специально не запускался по scope V0; V1 обязан снять новый mobile/desktop baseline.    |

## Что является состоянием персонажа

Принцип карты: наличие поля в схеме ещё не делает его полезным visual cue.
Состояние человека, внешние ресурсы, давление контекста и развитие показаны
раздельно.

| Canonical source                             | Смысл                                    | Нужный engine-owned human selector                              | Visual cue                                        | Human label            | Слой                                            | Update moment                          |
| -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- | ---------------------- | ----------------------------------------------- | -------------------------------------- |
| `vitals.energy`                              | Текущий запас сил                        | `low/moderate/high`                                             | поза и амплитуда силуэта                          | Энергия                | 1, всегда                                       | После успешного reducer-step           |
| `vitals.mood`                                | Эмоциональный фон вымышленного героя     | `low/moderate/high`                                             | выражение/направление взгляда                     | Настроение             | 1, всегда                                       | После успешного reducer-step           |
| `vitals.tension`                             | Текущее возбуждение/напряжение           | `low/moderate/high`                                             | плотность/ритм окружения, не «злой персонаж»      | Напряжение             | 1, всегда                                       | После успешного reducer-step           |
| `vitals.hunger`                              | Потребность в еде                        | offer-aware `quiet/relevant/heavy`                              | небольшой cue еды/пустого окна                    | Голод                  | 1 только когда меняет текущую развилку; иначе 2 | После успешного reducer-step           |
| `vitals.physicalFatigue`                     | Физическая усталость                     | `quiet/relevant/high` совместно с recovery, но без общего score | опора/положение плеч                              | Физическая усталость   | Контекстный 1 или 2                             | После успешного reducer-step           |
| `vitals.discomfort`                          | Дискомфорт                               | Пока selector не нужен                                          | —                                                 | —                      | Diagnostics                                     | Не визуализировать в current scenario  |
| `context.sleepiness`                         | Производная сонливость                   | `quiet/relevant/high`                                           | закрывающиеся глаза только если это не морализует | Сонливость             | Контекстный 1 или 2                             | После successful step/reload recompute |
| `accumulators.sleepDebtMin`                  | Скрытый долг сна                         | Не прямой label; причина sleepiness/recovery                    | только во втором слое как причина                 | Накопился дефицит сна  | 2                                               | После успешного reducer-step           |
| `vitals.windDown` + `context.sleepReadiness` | Готовность завершать день                | `quiet/ready/not_ready`, только вечером                         | вечерний ambient cue                              | Готовность ко сну      | Контекстный 1 вечером; иначе 2                  | После successful step/reload recompute |
| `accumulators.activeCaffeineMg`              | Активная кофеиновая нагрузка модели      | `quiet/relevant/high`; без миллиграммов                         | маленький non-medical cue                         | Кофеин ещё влияет      | 2; в 1 только при текущем выборе кофе/сна       | После successful step/reload recompute |
| `accumulators.recoveryNeed`                  | Накопленная потребность в восстановлении | `quiet/relevant/high`                                           | recovery cue, не «здоровье»                       | Нужно восстановление   | Контекстный 1 или 2                             | После успешного reducer-step           |
| `accumulators.satietyWindowMin`              | Скрытое окно сытости                     | Не показывать напрямую                                          | причина динамики голода                           | Еда ещё поддерживает   | 2 при объяснении                                | После успешного reducer-step           |
| `economy.*`, obligations                     | Внешний ресурс/обязательства             | Уже существующие finance views                                  | не менять тело/лицо                               | Деньги / обязательства | Existing context, не character state            | После успешного reducer-step           |
| `context.deadlinePressure`                   | Давление работы                          | `low/moderate/high` уже частично используется                   | окружение/desk cue только при релевантности       | Давление срока         | Existing context; optional 1 cue                | После successful step/reload recompute |
| `family.*`, `context.familyImbalance`        | Отношения и распределение нагрузки       | Отдельные family summaries                                      | окружение/строка, не «грустное лицо»              | Семейная нагрузка      | Existing context/2                              | После successful step/reload recompute |
| `character.habits/skills/capabilities`       | Долговременное развитие                  | `getCharacterDevelopment()`                                     | badge/history, не поза                            | Развитие персонажа     | Life/2                                          | После успешного reducer-step           |

### Что выводить в первом слое

Всегда остаются три независимых сигнала D3: **энергия, настроение, напряжение**.
Допускаются не более двух контекстных сигналов из hunger / sleepiness / sleep
readiness / physical fatigue / recovery need / pressure, и только если они:

1. меняют geometry/доступность текущих offers или попадают в heavy gate;
2. имеют engine-owned qualitative result и human reason;
3. не повторяют уже видимую цену/обязательство.

Итого первый слой содержит **3–5 уникальных смысловых сигналов**, hard cap — 6.
Визуальная поза и текстовая метка считаются двумя каналами одного сигнала, а не
двумя разными показателями. Полный список причин и скрытых accumulators остаётся
во втором слое «Состояние персонажа».

## Почему нельзя делать одну шкалу «здоровье» или «сон»

Возможны честные смешанные состояния:

- низкая энергия + хорошее настроение + высокое напряжение;
- высокая сонливость + низкая sleep readiness из-за времени/кофеина/напряжения;
- высокая physical fatigue + низкая recovery need после полезной тренировки;
- низкая энергия + низкий голод после еды;
- позитивный социальный эффект + реальная финансовая или временная цена.

Один score уничтожит причинность и превратит компромисс в моральную оценку.
Поэтому state machine ортогональна: pose, expression, load и contextual cue
выбираются независимо, а не складываются в «хорошо/плохо».

## Минимальный архитектурный вариант

Не создавать новый виджет и не добавлять persistence. Заменить только текущий
статический `Silhouette` внутри `CharacterCard` одной компактной inline SVG/CSS
сценой; существующие текстовые indicators сохранить как доступный primary truth.

Движок должен отдать read-only projection примерно такой формы (точные имена
утверждаются в Visual V1):

```ts
type CharacterLevel = 'low' | 'moderate' | 'high';
type CharacterPose = 'steady' | 'depleted' | 'recovering';
type CharacterExpression = 'subdued' | 'neutral' | 'bright';
type CharacterLoad = 'calm' | 'pressured';

interface CharacterPresentation {
  pose: CharacterPose;
  expression: CharacterExpression;
  load: CharacterLoad;
  primarySignals: Array<{
    id: 'energy' | 'mood' | 'tension';
    label: string;
    level: CharacterLevel;
  }>;
  contextualSignals: Array<{
    id:
      | 'hunger'
      | 'sleepiness'
      | 'sleep_readiness'
      | 'physical_fatigue'
      | 'recovery_need'
      | 'deadline_pressure'
      | 'family_imbalance';
    label: string;
    level: CharacterLevel;
    reason: string;
    sourcePaths: string[];
  }>;
  ariaSummary: string;
}
```

Selector должен жить в engine presentation layer и получать canonical `state`,
вычисленный `context` и текущие `ActionOffer[]`, чтобы prioritization был
offer-aware. UI только сопоставляет закрытые enum-значения с `data-*`/SVG frame
и выводит готовые строки; числа, пороги и branching по raw state в React не
добавляются.

### State machine visual

| Ось        | Состояния                        | Canonical ownership                                          | Допустимое выражение                                               |
| ---------- | -------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Pose       | `steady / depleted / recovering` | Engine selector по energy + physical fatigue + recovery need | Наклон, опора, положение плеч; без болезни/наказания               |
| Expression | `subdued / neutral / bright`     | Engine selector по mood                                      | 2–3 дискретных пиксельных frame; не изображать эмоцию пользователя |
| Load       | `calm / pressured`               | Engine selector по tension                                   | Плотность/ритм фона и линия дыхания; смысл дублируется текстом     |
| Context    | `none` + максимум 2 cues         | Engine offer-aware prioritization                            | Маленький предмет/ambient cue + human label/reason                 |

Отдельный `healthState`, общий score, XP, streak, питомец со своими
потребностями и UI-local state machine запрещены.

## Контракт обновления

Visual меняется **только после успешного reducer-step**. Не менять его при
hover, первом необратимом касании, preview, planning draft или save attempt до
commit. Тот же projection вычисляется при reload/replay из canonical session
state.

Reducer в том же атомарном шаге может материализовать следующее событие и
применить его `onOpenEffects`. Поэтому сцена после подтверждения означает
«текущее состояние сейчас», а не «всё это сделал выбранный вариант». Текстовый
result beat продолжает объяснять action-owned последствия по causal journal.

## Поведение по экранам

| Экран                | Поведение                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| Planning / contract  | Нейтральная компактная карточка; scene не меняется от draft.                                             |
| Day decision         | Scene + 3 primary labels + максимум 2 relevant cues; главное действие остаётся выбором развилки.         |
| Result / day summary | Scene обновлена по committed state; result text объясняет действие, scene — current state.               |
| Week / Month         | Не добавлять постоянную сцену. При необходимости — тихое раскрытие «Состояние персонажа» во втором слое. |
| Life                 | Не дублировать live scene; оставить outcome, development и journal.                                      |
| Completion           | Четыре outcome axes, development и open threads важнее декоративного visual.                             |

## Wireframes

### Mobile 390×844

```text
┌──────────────────────────────────────┐
│ День · время · деньги                │
├──────────────────────────────────────┤
│ [scene 88×96] Алексей                │  scene cap: 104–112 px
│                роль · семья          │
│ [Энергия] [Настроение] [Напряжение] │
│ [контекст 0–2, только если relevant] │
├──────────────────────────────────────┤
│ ближайшие обязательства              │
├──────────────────────────────────────┤
│ Текущая ситуация                     │
│ текст и известная цена               │
├──────────────────────────────────────┤
│ Вариант 1 ...                        │  начало options остаётся visible
│ Вариант 2 ...                        │
└──────────────────────────────────────┘
```

Scene не становится отдельной высокой карточкой и не вытесняет событие/цену. На
200% zoom блоки переходят в естественный вертикальный reflow без горизонтального
overflow.

### Desktop

```text
┌────────────── left rail ─────────────┬──────── decision column ────────┐
│ [compact scene]                      │ обязательства / ситуация       │
│ Алексей · роль · семья               │ варианты и главное действие    │
│ энергия · настроение · напряжение    │ result beat / summary           │
│ relevant context + disclosure        │                                │
└──────────────────────────────────────┴────────────────────────────────┘
```

Сцена остаётся compact rail element и не растягивается в баннер.

## Budgets и guardrails

### Performance/delivery

- `0` eager requests до открытия standalone игры;
- `0` remote assets, remote fonts, canvas/WebGL;
- `0` постоянных timers и `requestAnimationFrame` loops;
- один inline SVG scene tree, `shape-rendering: crispEdges`; без отдельного
  sprite download;
- не более `80` rendered SVG/DOM primitives всей scene;
- combined standalone JS+CSS gzip delta не более `12 KiB` относительно
  `57 841 + 3 890 B`;
- максимум одна короткая state-change анимация через CSS `steps()`, без
  бесконечного цикла и без смысловой зависимости от движения.

### Accessibility

- SVG декоративен (`aria-hidden`) при наличии одного живого текстового
  `ariaSummary`; не озвучивать каждую пиксельную деталь;
- pose/expression/load различаются геометрией и текстом, не только цветом;
- high contrast сохраняет контур/паттерн; dark theme проектируется отдельно;
- `prefers-reduced-motion` полностью отключает переход без потери смысла;
- scene не добавляет focusable элементы; disclosure имеет обычный button,
  keyboard flow и target не меньше 48×48 CSS px;
- reflow без horizontal overflow при 200% zoom.

### Privacy

- только synthetic campaign `GameState`; не читать дневник, профиль HEYS,
  здоровье пользователя, куратора или cross-client storage;
- никакой фотографии, демографии, biometric inference или персонализированной
  диагностики;
- `ariaSummary` описывает вымышленного героя и игровую модель.

### IP

- оригинальная геометрия персонажа, корпуса и пиктограмм;
- нельзя копировать Tamagotchi/Bandai device shell, egg shape, characters,
  icons, logo, button layout, animation frames или узнаваемый trade dress;
- retro/pocket/8-bit — только общая техника: ограниченная сетка, дискретные
  frames, crisp edges;
- без скачанных sprite sheets, чужих шрифтов и внешних copyrighted assets;
- prompts/negative constraints и provenance concept assets сохраняются в V1.

## Риски

| Severity | Риск                                                                                   | Gate/решение                                                                          |
| -------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| S1       | Нет подтверждённого S1-блокера для разработки концепции                                | V1 разрешён после review V0.                                                          |
| S2       | Нет engine-owned live character selector; UI содержит пороги `38/67`                   | До V2 утвердить минимальный read-only contract и focused engine tests.                |
| S2       | Выразительный 8-bit portrait конфликтует с D2, cartoon/retro может конфликтовать с D32 | V1 сравнивает три направления; изменение решений — только отдельная owner-resolution. |
| S2       | Scene может вытеснить начало вариантов на 390×844                                      | V1 обязан показать annotated mobile baseline/key frames и layout cap.                 |
| S2       | `onOpenEffects` следующего события уже входят в committed result state                 | Scene маркируется current state; action result остаётся journal-owned.                |
| S3       | `discomfort` не меняется current content                                               | Не визуализировать до authored downstream path.                                       |
| S3       | Нет focused тестов CharacterCard/live presentation                                     | Добавить только в V2 вместе с selector/scene.                                         |
| S3       | Текущий runtime baseline не воспроизведён: localhost:3001 недоступен                   | Visual V1 начинает с нового 390×844 и desktop baseline.                               |

## Focused verification для Visual V2

1. Engine selector fixtures для каждой оси и counterfactual: меняется один
   canonical input — меняется только ожидаемая qualitative axis.
2. Mixed-state fixture: low energy + bright mood + high tension не сворачивается
   в общий score.
3. Offer-aware prioritization: context cue появляется только при текущей
   relevance/heavy gate; contextual cues `<=2`, все сигналы `<=6`.
4. UI test: first touch/preview не меняет scene; successful confirm меняет scene
   и text согласованно.
5. Reload/replay даёт тот же `CharacterPresentation`; новых persisted полей нет.
6. Lazy test сохраняет `0` resources до click; после click только один
   standalone JS и CSS.
7. DOM count `<=80`, gzip delta `<=12 KiB`, timers/RAF/remote assets
   отсутствуют.
8. Screen reader получает один human summary; forced colors, reduced motion,
   dark theme и 200% zoom не теряют смысл.
9. Current scenario не выводит discomfort cue.

## Точный scope Visual V1

Visual V1 не пишет production-код. Он должен:

1. снять текущий baseline на 390×844 и desktop;
2. проверить три оригинальные концепции из мегаплана: HEYS-native premium
   minimal, adult pocket retro, hybrid editorial;
3. показать минимум четыре mixed-state key frames, result beat, reduced-motion и
   high-contrast frame;
4. оценить варианты по D2/D3/D32, adult tone, mobile density, non-color
   readability, IP, zero-loop delivery и стоимости SVG/CSS;
5. выбрать одну концепцию или честно отклонить 8-bit;
6. зафиксировать component/state map, palette, grid, frame inventory,
   `selector → frame → text alternative → update moment` и budgets;
7. подготовить отдельный текст owner-resolution, если рекомендация меняет
   D2/D3/D32; сам decision register не менять;
8. уточнить без реализации предложенный engine presentation contract и набор
   focused tests для V2.

До owner-review этого отчёта Visual V1 остаётся `BLOCKED до review`; после
review его можно запускать. Visual V2 остаётся `BLOCKED` до утверждённой
концепции, owner-resolution и прямого решения «реализовывать».
