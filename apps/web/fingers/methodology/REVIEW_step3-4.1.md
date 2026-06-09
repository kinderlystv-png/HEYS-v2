# Ревью: Phase 1, Шаги 3.1–4.1 (strangler-цепочка fingers)

**Роль:** code/methodology reviewer (передача облачному агенту-методологу).
**Дата:** 2026-06-08. **Скоуп ревью (диффы):**

| Шаг | Модуль          | Commit     | Тесты | Прод         |
| --- | --------------- | ---------- | ----- | ------------ |
| 3.1 | `block_catalog` | `ea6dcfea` | 18    | ✅           |
| 3.2 | `validators`    | `3e8a23dd` | 37    | ✅           |
| 3.3 | `assessment`    | `f0d3d524` | 26    | ⏳ ждёт push |
| 4.1 | `engine_router` | `f0ea8a3c` | 10    | ⏳ ждёт push |

Регрессия **139/139** (48 baseline mixEngine + 18 + 37 + 26 + 10).

**Что сверено с первоисточником:** `CONSTRUCTOR_SPEC.md` §3.2 (L320, L333,
L334-335), §1.2 (контракт атома); `PROTOCOL_POOL.md` (36 атомов, распределение
6/4/5/5/4/4/3/2/3); `METHODOLOGY` ч.9 (S1–S8). Правок в код не вносилось — это
read-only review.

---

## Вердикт: 🟢 зелёный на переход к 4.2

Дисциплина strangler образцовая. Реализации спеки точные (сверено построчно).
Таксономия из 9 качеств согласована через все три слоя. **Перед 4.2 — два
связующих момента** (не баги в текущем коде, а швы, где методологическая ошибка
протечёт в `sessionBuilder`). Плюс набор нитов на потом.

| Модуль            | Статус | Резюме                                                            |
| ----------------- | ------ | ----------------------------------------------------------------- |
| 4.1 engine_router | 🟢     | Эталонный strangler-каркас; passthrough бит-в-бит по конструкции  |
| 3.3 assessment    | 🟢     | §3.2 реализована точно; чистая, детерминированная; тесты глубокие |
| 3.2 validators    | 🟢     | fail-closed; 1 нит детерминизма (S2 `Date.now()`)                 |
| 3.1 block_catalog | 🟢     | 36×9 верно; фиделити значений к пулу не запинено тестом (нит)     |

---

## По модулям

### 4.1 `engine_router` — strangler-каркас: отлично

`heys_fingers_engine_router_v1.js`

- Флаг default `false` (L36-38), idempotent-guard (L31), off-live-path — UI всё
  ещё зовёт `mixEngine.recommendDay` напрямую (L13).
- При flag=off — **буквальный passthrough**:
  `return Fingers.mixEngine.recommendDay(opts)` (L49) возвращает тот же объект →
  бит-в-бит идентичность гарантирована конструкцией, а не тестом.
- Fail-safe цепочка при flag=on: нет builder / `null|undefined` / throw → старый
  движок (L60-80). «Новый движок никогда не валит пользователю генерацию.»
- Тесты покрывают все ветки: default, делегирование (структурно: intensity +
  `__role`-последовательность + length), recovery-сессия, age fail-closed
  (NaN→null на обоих путях), fallback (нет builder), null→fallback,
  throw→`fallback-error` без падения, valid→`new`.

### 3.3 `assessment` — спека §3.2 реализована верно (сверено)

`heys_fingers_assessment_v1.js`

- `computeDeficit` (L105-113) = clamp-формула спеки **§3.2 L320**.
- `limiterScores[q] = Math.max(deficit, flag) * prior` (L151) = спека **§3.2
  L333** (`max(deficit_q, flag_q) × levelPrior_q`) — точно.
- argmax `leadingLimiter` (L155-162) + `normalize(limiterScore)` для
  `blockWeights` (L164-169) = спека **§3.2 L334-335**.
- `LEVEL_PRIOR` (L71-96) реализует принцип спеки L331-332 (низкий уровень → выше
  technique/mental; элита → выше finger_strength).
- Чистая, детерминированная (нет Date.now/random). Тесты пинят числовые кейсы
  глубоко, включая elite prior-1.5 worked example.

### 3.2 `validators` — fail-closed, добротно

`heys_fingers_validators_v1.js`

- 12 валидаторов (S1–S8 + homed `V_*`), чистые функции `(input) → Issue[]`,
  отсутствующий/невалидный вход → `level:'error'`, не молчаливый `ok`.
- S1 age null → error (L63-65), S8 unknown painFlag → error (L247) — fail-closed
  правильно.
- `runAll` (L358-389) — presence-based оркестратор.

### 3.1 `block_catalog` — данные верны 1:1

`heys_fingers_block_catalog_v1.js`

- Проверено напрямую: **36 атомов, 9 блоков**, распределение
  **6/4/5/5/4/4/3/2/3** (тест ассертит `ATOMS.length===36` + распределение).
- Схема атома по §1.2 консистентна (id, blockId, quality, energySystem,
  modality, doseShape, dose, loadModel/loadValue, gates, sourceIds,
  doseConfidence).
- `validate()` (L491-562): энумы + согласованность quality блока↔атома +
  `minAge≠null` fail-closed + непустой `sourceIds`. Override energySystem vs
  derive → warning, не error (документировано).

### Сквозное (strangler-discipline)

- **Единый словарь из 9 качеств** проходит через все три слоя: assessment
  `ALL_QUALITIES` ↔ 9 блоков A-I (`BLOCKS[].quality`) ↔ quality-строки
  валидаторов. Это и делает цепочку когерентной.
- `blockWeights[quality]` напрямую ложится на `BLOCKS[].quality` — чистый шов
  для `sessionBuilder`.
- Registration-паттерн (`__<name>Registered` + IIFE + `HEYS.Fingers.*`) одинаков
  везде (минорно: mixEngine использует `__registered`).
- Все 4 модуля реально off-live-path — true strangler staging.

---

## ⚠️ Два момента ДО 4.2 (где методология протечёт в следующий слой)

### Риск 1 — шов «assessment → builder» содержит ловушку безопасности

6 из 9 качеств
(`max_strength, power, anaerobic_capacity, aerobic_base, antagonist, mobility`)
не имеют ни уровневого бенчмарка, ни флага → их `limiterScore ≡ 0` →
`blockWeights = 0`. Это **по спеке §3.5** (нет нормативов), не дефект
assessment.

**Но:** валидатор `S6_antagonistBalance` ТРЕБУЕТ antagonist-блок при тяжёлых
тягах; prehab/mobility нужны для безопасности независимо от веса. Если
`sessionBuilder` наивно выведет объём из `blockWeights`, он выдаст сессии,
проваливающие S6 и выкидывающие prehab — а так как валидаторы тоже
off-live-path, в рантайме это сейчас никто не поймает.

→ **Перед 4.2: заложить «пол» объёма для safety-блоков (antagonist/mobility), НЕ
выводимый из `blockWeights`.** Это главный риск перетекания.

### Риск 2 — роутер не валидирует выход нового движка

При flag=on любой truthy-объект от `sessionBuilder` отдаётся пользователю как
есть (`engine_router` L66-72) — без проверки контракта (`intensity`,
`exercises[].__role`, length>0). Сейчас безопасно (off-live-path, флаг off), но
это ровно точка, где кривой выход 4.2 уйдёт в прод молча.

→ **В 4.2: добавить contract-guard на форму выхода ИЛИ shadow-compare** (гонять
оба движка, логировать расхождение, отдавать старый) перед тем как доверять
`new`.

---

## Ниты (на ревью методолога, не блокеры)

1. **`S2_tissueFreshness`: `num(now) || Date.now()`** (validators L106) —
   скрытая нечистота в модуле, заявленном как «чистые функции»; это класс
   Date.now из `BUGS_HISTORY`. Плюс `||`-баг: легитимный `now=0` проваливается в
   `Date.now()`. Лучше требовать `now` явно (fail-closed как остальные) или
   `?? Date.now()` + пометить нечистоту.
2. **Шорткат в коммите 3.3** «deficit × flag × levelPrior» роняет `max()` — и
   код (L151), и спека §3.2 L333 говорят `max(deficit, flag) × levelPrior`.
   Литеральное произведение было бы ≡0 (deficit/flag взаимоисключающи по
   качеству). Поправить формулировку коммита/хедера, чтобы автор 4.2 не прочитал
   как продукт.
3. **Фиделити каталога к `PROTOCOL_POOL` не запинено тестом** — проверяются
   count/распределение/энумы, но не значения `dose`/`gates` каждого атома.
   Инвариант «1:1» держится ручной сверкой; при изменении пула дрейф доз ничто
   не ловит. Рассмотреть генерируемый чек/чексумму, если пул авторитетен.
4. **Подтвердить, что тест/CI зовёт `blockCatalog.validate()` и ассертит
   `errors.length===0`** — иначе enum-чеки мёртвые.
5. **`runAll` presence-dispatch:** «runAll без ошибок» ≠ «S8/S1 прошли»
   (валидатор без входа просто не запускается). Для safety-гейтов (age, pain)
   `sessionBuilder` должен звать их явно, не полагаться на presence-dispatch.
6. `assess` возвращает лишний `maxLimiterScore` вне задокументированного
   контракта в хедере (тривиально).
7. (Косметика) Тест роутера обещает «бит-в-бит», но ассертит структурный
   поднабор (intensity + `__role` + length). Т.к. это passthrough того же
   объекта — верно по конструкции; можно усилить до `toEqual(direct)`, чтобы
   тест соответствовал заявлению.

---

## Чек-лист для автора Шага 4.2 (sessionBuilder)

- [ ] Объём antagonist/mobility/prehab — с «полом», НЕ из `blockWeights` (Риск
      1, S6).
- [ ] Явно прогонять safety-валидаторы (S1 age, S8 pain, S6 antagonist, S2
      tissue) на собранной сессии — не полагаться на `runAll` presence-dispatch.
- [ ] Выход совместим со старым контрактом `mixEngine.recommendDay`
      (`intensity`, `exercises[].__role`, …) — иначе роутер отдаст кривое (Риск
      2).
- [ ] Детерминизм: никакого `Date.now()`/random в алгоритме (передавать время
      аргументом, как и в остальных модулях).
- [ ] Характеризационный тест: при flag=on результат builder валидируется против
      контракта; добавить shadow-compare лог расхождений с mixEngine.
- [ ] Ожидать, что `leadingLimiter` сейчас фактически ∈ {finger_strength,
      technique, mental}, а `blockWeights` сильно концентрированы / с нулями
      (следствие §3.5).
