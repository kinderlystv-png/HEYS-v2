# Ревью #3: Шаг 4.3 — закрытие находок ревью #2 + структурные ограничения активации

**Роль:** code/methodology reviewer (передача облачному методологу). **Дата:**
2026-06-08. **Скоуп:** commits `fc6f1b61` (4.3a level fail-closed), `a69132c8`
(4.3b-d output-контракт + sessionIntensity + opts.intensity), `7add4450` (4.3e
shadow-compare). **Регрессия:** заявлено зелёной (цепочка `f0d3d524`→`7add4450`,
7 непушенных). **Сверено по коду** (не со слов саммари):
`session_builder_v1.js`, `engine_router_v1.js`, `mix_engine_v1.js` (L127-128,
L475-478, L505-507), `session_ui_v1.js` (L70-95, L705-720, L2756, рендер-сайты).

---

## Вердикт: 🟢 как фикс-итерация; ⚠️ два структурных ограничения активации

Все три находки ревью #2 закрыты **корректно** (проверено), shadow-compare —
полезный инструмент. Но третий обход вскрыл два ограничения, которые блокируют
`flag=on` вживую (не 4.4): builder инертен на боевых opts, и UI рендерит только
hang-протокол, а каталог — весь спектр doseShape.

---

## Что реально закрыто (verified)

| Находка #2                                     | Как закрыто                                                                                                                                                                                | Где                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 🔴 #1 level silent mis-level                   | `if (!o.profile && !o.level) return null` + `_pickAtomForSlot` fail-closed; profile без дефолта level                                                                                      | builder L233, L165-167, L246-250          |
| 🔴 #2 output ⊂ UI                              | 16 полей mixEngine + legacy aliases (`hangSec/restSec/repsPerSet/setsCount/restBetweenSetsSec/addedWeightKg`); `isValidSession` усилён (`__role`, `name`, `durationMin`, `requiresWarmup`) | builder L198-222, L350-389; router L70-83 |
| 🟡 #3 intensity-домен                          | `sessionIntensity(exercises)` — зеркало mixEngine L127-128; `opts.intensity` только понижает (L238-243); equipment-starved max → авто-recovery                                             | builder L79-87, L238-243                  |
| shadow-compare                                 | default off; оба движка; отдаёт builder; дифф в `lastShadowDiff`+console.debug; shadow-ошибки проглатываются                                                                               | router L40-42, L85-109, L141-150          |
| ниты (`__role` guard, equipment-starved «max») | закрыты                                                                                                                                                                                    | router L74-76; builder L79-87             |

Качество фиксов высокое: S2-окно с верхней границей, `??` вместо `||`,
`maxLimiterScore` в хедере, `validate()` ассертится — всё на месте.

---

## ⚠️ Структурное ограничение 1 — fail-closed = инертность на боевых opts

`level` fail-closed корректен. Но **mixEngine `level` не читает вообще** (в
файле только `dangerLevel` и output `level:'mixed'`); боевые opts — зеркало
mixEngine — его не несут. → builder всегда вернёт `null` → роутер всегда
fallback на mixEngine. **Новый движок физически не может отработать для
пользователя сейчас.**

«Безопасно» здесь = «пока не запускается вживую». Перед активацией: определить
источник `level` (калибровка/грейд юзера из профиля) и прокинуть в opts. Понижаю
#1 с 🔴-safety до 🟡-«инертен, пока не подключён `level`».

---

## 🔴 Структурное ограничение 2 — UI рендерит только hang-протокол (главное)

**Подтверждено по коду:** вся существующая система работает исключительно в
hang-протоколе:

- mixEngine строит exercise из `{hangSec, restSec, repsPerSet, setsCount}`
  (`mix_engine_v1.js` L475-478); **0 упоминаний** boulder/circuit/arc/campus/
  attempts во всём файле.
- UI-плеер читает те же поля и дефолтит `hangSec || 7` (`session_ui_v1.js`
  L2756); длительность и `fingersLog` считаются по hang-модели (L715, L2010+).
- Ветвления по `doseShape`/`modality` в рендере нет.

А `block_catalog` builder'а — **6 doseShape × 8 modality**, большинство НЕ hang:
boulder (`attempts`), ARC (`continuous`), campus (`attempts`), circuit,
antagonist/mobility (`reps`), mental (`process`). Aliases заполняют их как
`hangSec=0/repsPerSet=1` → UI отрендерит boulder/ARC/campus/антагонист-повторы
как вырожденный **«7с виса × 1 повт × N сетов»** (через дефолт L2756).

Это не косметика — **неверные инструкции пользователю**, а для campus/power —
ещё и tissue-load-бессмыслица (campus-лесенка как 7-сек вис). `isValidSession`
это **не ловит** — он про session-level поля, не про renderability на уровне
exercise. «Прошёл contract-guard» ≠ «UI это покажет».

**Перед `flag=on` live — выбрать:**

1. ограничить builder hang-атомами (убивает смысл 36-атомного каталога), **или**
2. расширить `session_ui` player на non-hang doseShape'ы (существенная работа).

Это настоящий гейт всей strangler-затеи — больше всего, что всплывало раньше.
**Вопрос к методологу/роадмапу:** планируется ли rebuild UI/player под non-hang,
или builder держим в hang-подмножестве до отдельного UI-шага? В `KICKOFF`/брифах
явного решения не нашёл.

---

## Мелкое

- `coachReason`/`description` = внутренний жаргон («Bucket=max; safety-floor
  antagonist/mobility активен») — не отдавать юзеру (автор отметил →
  локализация).
- `durationMin` через `_estimateAtomSec` — новая эвристика; спот-чек
  правдоподобен (maxhang ≈13 мин, boulder-limit ≈33 мин), не safety. Но UI имеет
  СВОЙ расчёт длительности (L715) по hang-полям → для non-hang атомов две оценки
  разойдутся.

---

## По 4.4 и порядку работ

4.4 (assessment-интеграция) **можно начинать** — она контракт-внутренняя,
ограничения 1/2 её не блокируют. Рекомендации:

1. **Сначала прогнать shadow-compare на dev** (для этого и сделан). **Добавить в
   `_diffSessions` распределение `doseShape`/`modality`** builder-сессии — это
   прямая метрика ограничения #2 (сколько non-hang атомов движок тащит в
   hang-only UI).
2. **Ограничение #2 решить принципиально до того, как assessment дойдёт до
   live** — иначе строим интеллект (приоритизация по `leadingLimiter`) поверх
   движка, который UI не может корректно показать. Приоритет: **roadmap-решение
   про UI > assessment-интеллект.**

---

## Чек-лист ДО `flag=on` в проде (накопительный, обновление к ревью #2)

- [x] `level` fail-closed (ревью #2 #1) — сделано.
- [x] Полный output-контракт mixEngine + `isValidSession` по UI-полям — сделано.
- [x] `intensity` value-домен (`sessionIntensity`) + `opts.intensity` — сделано.
- [ ] **Источник `level` в боевых opts** (калибровка/грейд) — иначе движок
      инертен (огр. 1).
- [ ] **Renderability non-hang doseShape'ов** — ограничить builder hang-атомами
      ИЛИ расширить UI-плеер (огр. 2).
- [ ] Свериться с реальным потреблением полей в `session_ui_v1.js` для non-hang
      exercise — сейчас плеер hang-only.
- [ ] `coachReason`/`description` — человеческий текст вместо внутреннего
      жаргона.

---

## Дополнение (commit `7bbb3d62` + эмпирика) — решение гейта #2: B1.5

### Эмпирическое распределение (детерминированный прогон builder в node)

Прогнал `sessionBuilder.recommendDay` на репрезентативных opts (age 25, level
intermediate; readiness × equipment).

**Каталог (36 атомов):**
`hang:9, attempts:7, reps:8, circuit:5, continuous:6, process:1` → **9 hang / 27
non-hang.** Hang = весь блок A (6) + B:lockoff_iso + D:fingerboard_lactic +
E:bfr_lowload.

**Сгенерированные сессии:** **71% упражнений — non-hang** (отрендерятся как «7с
виса» в текущем плеере). Примеры: `max/full` = [power:attempts,
max-strength:hang, strength-endurance:hang, antagonist:reps, mobility:reps] (2
hang / 3 non-hang); `door`/`none` любой readiness = [antagonist:reps,
mobility:reps] (0 hang).

### Ключевой вывод — чистый B1 нежизнеспособен

**В каждой сгенерированной сессии есть ≥1 non-hang**, потому что antagonist
приходит через safety-floor, а **весь блок G (antagonist) и H (mobility) — это
`reps`, не `hang`.** Ограничение «builder только `doseShape='hang'`» **ломает
antagonist/mobility safety-floor** (Риск 1 ревью #2) → S6 снова зафейлится. B1
как сформулировано — отпадает.

Развилка переопределена: **B1 infeasible (конфликт с safety), B2 (все 6 shape) =
Шаг 5, B1.5 = точка разблокировки.**

### Решение: B1.5 — builder ⊂ {hang, reps}, UI рендерит `reps`

`hang + reps` = 17 из 36 атомов (блок A «главный детерминант» §2 + antagonist +
mobility = ядро + обязательная safety). Boulder(`attempts`)/ARC(`continuous`)/
circuit/campus/mental(`process`) → Шаг 5.

**Builder (малая правка `_pickAtomForSlot`):**

- `const RENDERABLE_DOSESHAPES = { hang:true, reps:true };` (Шаг 5 расширяет).
- Гейт в **`_atomFits`** (единый chokepoint — покрывает slot-picks, 2nd-attempt,
  antagonist-floor, mobility-floor):
  `if (!RENDERABLE_DOSESHAPES[atom.doseShape]) return false;`
- `SLOT_TEMPLATES` НЕ трогать: неподдержанные слоты (power→attempts) сами
  резолвятся пусто, `safetyTrace.picks` пишет `skipped:true`. Шаг 5 включит их
  расширением set'а — нулевой churn шаблонов.
- Следствия (из данных): power-слот пуст (boulder/campus = attempts); capacity
  вырождается (ARC/mileage = continuous → остаётся
  bfr_lowload/fingerboard_lactic hang или пусто). `max/full` v1 =
  [max-strength:hang, strength-endurance:hang, antagonist:reps, mobility:reps];
  intensity='max' честно через `sessionIntensity` (max-strength присутствует).
  Safety-floor цел (antagonist/mobility = reps = allowed).
- Тесты: (a) любой opts → exercises только {hang,reps}; (b) antagonist/mobility
  присутствуют (S6 ok); (c) power-слот `skipped` в trace для max; (d) shadow
  doseShape-dist не показывает утечки excluded-shape.

**UI (минимальный reps-рендер):**

- Перенести `doseShape` на exercise (builder уже кладёт).
- Ветка в плеере на точке сборки hang-цикла (~`session_ui_v1.js` L2756/L3016):
  `if (ex.doseShape === 'reps')` → rep-set view (reps из `dose.reps` (диапазон
  «8–15»), sets `dose.sets`, отдых `restSetsSec`; per-set «готово»-трекер +
  countdown отдыха между сетами; нагрузка из `loadModel/loadValue`, напр. RPE/
  bodyweight). Иначе — существующий hang-таймер.
- Лог `_buildFingersLog` (L715): для reps время = `sets×reps×~3s + rest` ИЛИ
  доверять builder `durationMin`. Уточнить позже.
- **Объём:** 1 ветка (`reps`). B2 = +4 ветки (attempts/circuit/continuous/
  process). B1.5 UI ≈ 1/5 от B2.

**Гейт #1 (level) — ортогонально, после B1.5:** прокинуть `level` из калибровки/
грейда юзера в opts на call-site (`session_ui_v1.js` ~L997 `mixOpts`). Быстро,
но смысл только после того, как B1.5 сделает выход renderable.

**Последовательность:** B1.5 builder-cut + reps-renderer → wire `level` →
flag=on на dev → 4.4 (assessment) параллельно (контракт-внутренняя).

### Статус: (a) сделано — commit `5fabebad`

`RENDERABLE_DOSESHAPES={hang,reps}` + gate в `_atomFits`. Регрессия 189/189.
Empirical signal из shadow-diff (без dev-server): на max-сессии после cut'а
`doseShape.new={hang:2,reps:2}`, `nonHangCount=2` (только antagonist+mobility =
safety-floor), `uiRendererRisk=true` (до reps-render). Подтверждает, что cut
отдаёт ровно то, что обещано — никаких attempts/circuit/continuous.

---

## Решение гейта #1 (источник `level`): **B с полом `'beginner'`**

`level` — safety-гейт (S1 пускает атом при `profile.level ≥ atom.minLevel`),
поэтому ошибки обязаны быть в безопасную сторону (недооценка):

- **Источник:** derive из калибровки/MVC через `BENCHMARKS.finger_strength` (уже
  в `assessment_v1.js`) — измеренно, без UI/onboarding.
- **Пол:** нет/неполная калибровка → `'beginner'`, **не `'intermediate'`**.
  Дефолт-intermediate (вар. A и как fallback) = находка reviewer #2 #1 в видимой
  одежде: для новичка, который не тронет chip, та же переоценка.
- **Кэп:** `level` в гейтах кодирует тренировочную зрелость/стаж, не %BW
  (`fs_minedge_recruit` = `minLevel:'advanced'` +
  `prerequisites:['base_>=2y','strength_base']`). MVC меряет силу →
  сильный-от-природы новичок получит `'advanced'` (переоценка в injury-prone
  сторону). MVC-derived level **кэпить**, не брать как единственный определитель
  зрелости.

---

## 🔴 Новая находка (ревью 4.3, safety-шов) — `gates.prerequisites` / `dangerLevel` не проверяются

`S1_ageLevelGate` и `_atomFits` гейтят **только age + level**.
`gates.prerequisites` и `gates.dangerLevel` **не валидируются нигде** в пути
выбора атома (session-level `S3_warmupRequired` проверяет лишь `warmupDone`, не
per-atom prereq). Значит при ЛЮБОМ источнике `level` B1.5-сессия может включить
атом с невыполненными prereq'ами:

| Атом                   | minLevel     | Невыполненный prereq игнорируется                 | Кого бьёт                                                                                                                     |
| ---------------------- | ------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `aer_bfr_lowload`      | intermediate | `bfr_cuff_technique`                              | **честный intermediate** — BFR-окклюзия без обучения манжете (реально попадает в capacity-слот после cut'а: hang, low-tissue) |
| `fs_minedge_recruit`   | advanced     | `base_>=2y`, `strength_base` (danger `high`, 8мм) | сильный новичок, переоценённый до advanced                                                                                    |
| `mental_fall_practice` | beginner     | `safe_fall_setup`                                 | любой                                                                                                                         |
| `ant_prehab_targeted`  | beginner     | `injury_screen`                                   | любой                                                                                                                         |

→ «Правильный `level`» — это **пол-гейта**. `bfr_lowload` пробивается уже сейчас
при честном intermediate — не гипотетика. Приоритет этой задачи **выше**
точности level-деривации.

**Фикс (до `flag=on` live):** enforce `prerequisites`/`dangerLevel` в builder —
новый валидатор (напр. `S1b_prerequisiteGate(atom, profileCapabilities)`) или
расширить `S1`, проверяющий
`atom.gates.prerequisites ⊆ profile.completedPrereqs` (набор пройденных:
`bfr_cuff_technique`, `base_>=2y`, `strength_base`, `safe_fall_setup`,
`injury_screen`, …). Без него высоко-danger атомы проходят по одному только
level.

---

## Обновлённый чек-лист ДО `flag=on` в проде

- [x] `level` fail-closed (ревью #2 #1).
- [x] Полный output-контракт + `isValidSession` по UI-полям (ревью #2 #2).
- [x] `intensity` value-домен + `opts.intensity` (ревью #2 #3).
- [x] **(a)** B1.5 builder-cut `{hang,reps}` (`5fabebad`).
- [ ] **(b)** Источник `level` = B с полом `'beginner'` + кэп MVC→зрелость.
- [ ] **(d)** UI `reps`-рендер (1 ветка в плеере по `doseShape`).
- [ ] **🔴 prereq-gate** — enforce `prerequisites`/`dangerLevel` (новый
      safety-шов; приоритет выше level-точности).
- [ ] `coachReason`/`description` — человеческий текст.
