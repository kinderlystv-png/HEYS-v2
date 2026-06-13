# Конструктор зарядок/мобильности и контракты ядра — спецификация реализации

Версия 0.1 (черновик) · Июнь 2026

> **Назначение.** Слой _реализации_ (как методология формулируется в коде).
> Выводится из [`METHODOLOGY.md`](METHODOLOGY.md) частей 1–11 и
> [`IMPLEMENTATION_MAP.md`](IMPLEMENTATION_MAP.md). Ссылки «методология ч.N» —
> на методологию; «§N» — внутренние; «fingers §N» — на
> [`../../fingers/methodology/CONSTRUCTOR_SPEC.md`](../../fingers/methodology/CONSTRUCTOR_SPEC.md).
>
> **Это второй инстанс портируемого контракта.** Движок sport-agnostic уже
> описан у пальцев (**fingers §4 — `SPORT_CONFIG`**): generic-движок +
> спорт-числа в данных. Мобильность реализуется **против того же контракта**, а
> не как отдельная копия (правило проекта «Архитектура тренировочных режимов:
> ядро + контент», CLAUDE.md/AGENTS.md). Этот документ задаёт
> мобильность-инстанс `SPORT_CONFIG` (§4 здесь) + доменную схему атома и
> закрывает технические блокеры пула (`Q-atom-1`, `Q-pain-1`, `Q-limit-1`,
> `Q-dose-1`).
>
> **Канонический словарь.** Где generic-движок уже задаёт имя — используем его,
> а не плодим синоним. Расхождения в словаре, которые надо свести при извлечении
> ядра, собраны в §5.

---

## Часть 1. Конструктор зарядок/мобильности

Формальная модель: из этих сущностей собирается **любая** валидная сессия под
режим/цель/уровень/популяцию, а невалидная — блокируется. Все ограничения
безопасности (методология ч.9, S1–S9) входят как обязательные валидаторы (§1.6).

### 1.1. Иерархия

```
Атом (Atom)                 // минимальная единица воздействия
  → Блок (Block)            // атомы одной оси/цели + параметры
    → Сессия (Session)      // блоки одного режима (= зарядка/растяжка/восстановление)
      → Микроцикл (Week)    // сессии недели (regularity > эпизод)
        → Мезоцикл (Meso)   // развитие ROM 4–8 нед + поддержание
          → Макро (опц.)    // подводка к цели/сезону (если есть goalDate)
```

Отличие от пальцев: для разминки/релакса/восстановления «сессия» часто
самодостаточна (без макро); полноценные циклы нужны **режиму развития
мобильности** (§1.5). Это допустимо — шаблон каркас, не прокруст.

### 1.2. Атом (Atom) — закрывает `Q-atom-1`

Расширяет generic-схему атома (fingers §1.2), заменяя climbing-оси на оси
мобильности. `energySystem` для мобильности = `null` (n/a); первичные оси —
`purpose × autonomic` (методология 1.2/1.7).

```
Atom {
  id              // канонический, kebab: <block>_<pattern>_<region>
                  //   напр. flex_static_hamstring, smr_foamroll_quad, breath_cyclic_sigh
  block           // 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'  (каталог методологии ч.4)
  axis            // ось воздействия (методология ч.2, 9 осей):
                  //   'active_rom'|'passive_flex'|'readiness'|'activation'|'autonomic'|
                  //   'tissue_recovery'|'motor_control'|'joint_stability'|'mental'
  purpose         // 'prep'|'develop'|'recover'|'regulate'   (первичная ось 1.2)
  autonomic       // 'tonify'|'neutral'|'relax'              (вектор 1.7)
  energySystem    // null для мобильности (поле generic-схемы; держим для совместимости)

  modality        // 'bodyweight'|'band'|'strap'|'foam_roll'|'ball'|'percussion'|
                  //   'loaded'|'breath'|'bolster'|'wall_env'
  doseShape       // см. §1.3
  dose            // объект, поля зависят от doseShape (§1.3)

  // — позиция (обобщение gripId/edge пальцев → сустав/зона + время суток) —
  jointRegion     // 'ankle'|'knee'|'hip'|'lumbar'|'thoracic'|'shoulder'|'wrist'|
                  //   'neck'|'full'|'systemic'  (systemic = дыхание/автономика)
  timeOfDayPref?  // 'morning'|'day'|'evening'|null  (циркадная подсказка, 3.1)

  // — нагрузка (для большинства мобильности — bodyweight; loaded/eccentric — иначе) —
  loadModel       // 'bodyweight'|'addedWeightKg'|'rpe'|'amplitude'|'none'
  loadValue       // число в смысле loadModel; 'amplitude' = доля доступного диапазона 0..1

  // — гейты (входы валидаторов §1.6) — ПОДОБЪЕКТ `gates` (форма контракта ядра,
  //   как у пальцев `atom.gates.*`):
  gates: {
    minLevel        // 'beginner'|'intermediate'|'advanced'
    minAge          // число. null = НЕТ ДАННЫХ → fail-closed (S1). 0 = явно без гейта.
    populationGate[]// популяции, для которых атом ОГРАНИЧЕН: ['hypermobile','pregnancy',...]
    contraind[]     // 'over_bone'|'over_nerve'|'acute_injury'|'varicose'|'valsalva_risk'|'pre_power'
    equipment[]     // ['foam_roll']|['band']|['strap']|['ball']|['percussion']|['bolster']|[]  (Q-equip-1)
    prerequisites[] // ['warmup_done', ...] (§3.4-токены)
  }

  // — мета —
  sourceIds[]     // привязка к bibliography (сила источника живёт там)
  doseConfidence  // 'A'|'B'|'C' — доказанность ИМЕННО этих чисел (см. две оси доказ.)
}
```

**Две оси доказательности** (как у пальцев): _сила источника_ (в `bibliography`)
≠ `doseConfidence` (доказанность дозы). Пример: `flex_static_*` опирается на 🟢
мета-анализы ROM, но точные секунды — `doseConfidence:'B'` (нет чёткого
оптимума, методология 5.3).

### 1.3. `doseShape` → поля `dose`

Мобильность-формы (часть наследует generic, часть новые — расширение enum через
`SPORT_CONFIG`, §4):

```
raise:        { durationSec, intensity:'low'|'rising' }            // A пульс-разминка
dynamic:      { reps:[min,max], sets, tempo:'controlled' }         // B динам. мобилизация
flow:         { durationSec | rounds, sequence:[...] }             // B2 mobility-поток
activation:   { reps:[min,max], sets, restSec }                    // C бэнд/изометр. активация
hold:         { holdSec, reps, sets, restSec, intensity:'comfort'|'develop' } // D статика, F2 loaded
pnf:          { contractSec, contractPct, relaxSec, holdSec, reps } // E contract-relax/CRAC
eccentric:    { reps, sets, tempoEccSec }                          // F1 эксцентрика
cars:         { reps, tempo:'slow' }                               // G CARs
smr:          { durationSec, sets, target }                        // H валик/мяч/перкуссия
breath:       { pattern:'cyclic_sigh'|'resonant'|'box', durationSec, ratio:{in,hold,out} } // I
active_rec:   { durationSec }                                      // J активн. восстановление
```

`process`/тактика у мобильности нет → не используется. Старые климбинг-формы
(`hang`/`attempts`/`circuit`) для мобильности не применяются.

> **`intent`/`purpose` на атоме vs блоке.** В отличие от пальцев (там
> `targetStimulus` на блоке), у мобильности `purpose` — **первичная ось атома**
> (1.2): один и тот же жест с разным `purpose`/`autonomic` = разный
> атом-вариант, т.к. меняются доза/темп/время. Блок наследует `purpose`
> доминирующего атома.

### 1.4. Блок и Сессия

```
Block {
  id, name
  axis                    // главная ось блока (§1.2)
  purpose                 // 'prep'|'develop'|'recover'|'regulate'
  autonomic               // 'tonify'|'neutral'|'relax'
  atoms[]
  fatigueCost             // 'low'|'moderate'|'high'   (loaded/eccentric → high)
  tissueLoad              // 'low'|'moderate'|'high'   (end-range/эксцентрика → выше)
}

Session {
  date, timeOfDay
  mode                    // один из 7 режимов (§ методология ч.6 / §4 здесь)
  purpose, autonomic      // целевые для режима — инвариант когерентности (§1.6 R1)
  blocks[]                // обычно: raise → activate → mobilise (→ develop) → down-regulate
  readinessGate?          // опц. сигнал (HRV/субъективное), не блок
  totalFatigue, totalTissueLoad
}
```

**Правило порядка блоков** (методология 5.1 RAMP / 1.2): разогрев → активация →
мобилизация → (развитие) → заминка/релакс. Долгая статика (`hold develop` >60с)
**не перед** мощностью/силой (S8). Тонизация и релакс **не в одной сессии**
(R1).

### 1.5. Циклы (для режима развития мобильности)

```
Microcycle (week) { sessions[]; rule: ROM-развитие ≥2–3×/нед (regularity, 5.3) }
Mesocycle { weeks[]; focus: лимитер-сустав; 4–8 нед; deload по необходимости }
Macro (опц.) { goalDate?; режим: develop в базу, maintain в пик (6 периодизация) }
```

Тайминг холода (3.4) и циркадность (3.1) — модификаторы расписания, не отдельные
циклы; живут в `mode_engine` через `SPORT_CONFIG.recoveryWindows` / хук времени
суток.

### 1.6. Правила сборки (валидаторы S1–S9)

Конструктор **запрещает невалидные сборки**. Источник — методология ч.9 / §11.2;
исполняются generic-фреймворком валидаторов (fail-closed gate-runner), правила —
данные `SPORT_CONFIG` + доменные хуки.

| #   | Правило                                                               | Триггер → действие                                                           |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| S1  | Уровень/возраст-гейт; нет данных → консервативно                      | `atom.minLevel/minAge` vs profile → фильтр; подростки fail-closed            |
| S2  | Боль → стоп                                                           | `painFlag.level==='pain'` (§3.2) → стоп прогрессии, режим rehab              |
| S3  | Разминка перед интенсивным; баллистика только после разогрева/с базой | блок без `warmup_done` → невалидно; баллистика+новичок → блок (S1)           |
| S4  | Гипермобильность — гейт глубокой растяжки/PNF                         | `population:hypermobile` ∈ `atom.populationGate` → блок, приоритет stability |
| S5  | PNF под контролем (субмакс, без Вальсальвы)                           | `pnf` + `valsalva_risk`/ССЗ-флаг → warn; `contractPct` ограничен             |
| S6  | МФР/перкуссия противопоказания                                        | `contraind` (over_bone/nerve/acute_injury) ∨ перкуссия+`pre_power` → блок    |
| S7  | Свежая травма/острое воспаление → rehab                               | `mode==='rehab'` → строгие гейты, прогрессия по отсутствию боли              |
| S8  | Долгая статика (>60с) не перед мощностью                              | `hold` `holdSec>60` + следом power/strength → переставить/warn               |
| S9  | Утром не форсировать конечный диапазон                                | end-range атом + `timeOfDay==='morning'` без полной разминки → warn          |

Плюс инвариант **R1 (когерентность вектора):** в одной сессии не смешивать
`autonomic:tonify` и `autonomic:relax` (методология 1.2/1.7).

### 1.7. Поток генерации сессии (гибрид — `Q-mode-1`)

```
1. Профиль (онбординг, 4 входа Q-onb-1): уровень, популяция-флаги, цель, оборудование.
2. (опц.) Аудит лимитера (§3.1): скрины ROM → ведущий лимитер-сустав + веса блоков.
3. Пользователь выбирает режим/цель/время → mode_engine задаёт purpose×autonomic.
4. routine_builder подбирает блоки/атомы: фильтр гейтов S1–S9 + equipment + populationGate;
   приоритет блоков по лимитеру; порядок §1.4.
5. Прогон валидаторов. Конфликт → пересборка/предупреждение.
6. Пользователь правит сборку (убрать/заменить атом) — гибрид.
7. Лог выполнения (+painFlag) → records → обновление readiness/прогресса.
```

---

## Часть 2. Привязка к движку (контракт ядра)

Мобильность — **доменный слой против generic-движка**. Что переиспользуется vs
что доменное — см. правило архитектуры + таблица ниже.

### 2.1. Переиспользуется из ядра (по контракту, не копией)

- **strangler-роутер**, **timer-ядро/runner-shell** (RPE/pain/abort/lifecycle),
  **records/persistence** (client-scoped, инвариант HEYS #9), **bibliography**
  (+doseConfidence), **readiness-математика** (z-score/MAD),
  **валидатор-фреймворк** (fail-closed gate-runner), **онбординг-фреймворк**,
  **assessment→лимитер алгоритм** (§3.1 — структура та же, что fingers §3.2),
  **периодизация-машинерия**, **прогрессия** (плато/оси).
- Эти модули у пальцев пока в namespace `HEYS.Fingers.*` с прямыми зависимостями
  на `currentClientId`/localStorage. **При выносе в ядро —
  dependency-injection** (контекст клиента/хранилище передаём, не хардкодим). До
  выноса мобильность обращается к ним по тем же сигнатурам.

### 2.2. Доменное (мобильность пишет своё)

- `atom_catalog` / `axis_catalog` — **данные** (атомы A–J §1.2, 9 осей).
- `mobility SPORT_CONFIG` — §4 (числа/оси/риск-ткань/нормы).
- Доменные плееры: `breath_runner` (дыхание I), плеер `pnf`-фаз, плеер `hold`/
  `cars`; измеритель ROM (ручной ввод углов, Q-test-2).
- Доменные правила в валидаторах: S4 (гипермобильность), S6 (контра МФР), S9
  (циркадность) — как доменные хуки/данные поверх generic-фреймворка.

### 2.3. Namespace и размещение

- Доменный код: `apps/web/mobility/` (по паттерну `apps/web/fingers/`).
- Общее (после выноса, правило двух/трёх): `apps/web/_kernel/` (или packages).
- Не хардкодить climbing-литералы в общем коде (grip/edge/A2) — это баг
  переносимости (fingers §4 инвариант форка).

---

## Часть 3. Алгоритмы (закрывают блокеры пула)

### 3.1. Аудит лимитера подвижности — `Q-limit-1`

**Зачем:** из ROM-скринов (методология 8.1 + нормы 8.1.1) получить **ведущий
лимитер-сустав + веса приоритетов блоков** + **тип ограничения** (это
mobility-специфика поверх generic-scoring fingers §3.2).

```
Вход: по каждому суставу/тесту q — measure_q (замер), normPassive_q, normActive_q (§8.1.1),
      activeROM_q, passiveROM_q.

1. Дефицит к норме (общий, как fingers §3.2):
     deficit_q = clamp( (norm_q − measure_q) / norm_q , 0, 1 )
2. Классификатор ТИПА ограничения (mobility-специфика):
     gap_q = passiveROM_q − activeROM_q              // зона без контроля (1.5)
     if  deficit(passive)_q ≥ θ_ceiling:   type = 'ceiling'   // → растяжка/PNF/нагруженная (D/E/F)
     elif gap_q ≥ θ_control:               type = 'control'   // → end-range сила/CARs (F/G)
     else if movement-fail без deficit/gap: type = 'strength_or_technique'  // вне scope режима
     else:                                  type = 'ok'
3. levelPrior_q — приор уровня (методология 7): новичку выше вес базовой мобильности.
4. limiterScore_q = max(deficit_q, gap_q/norm_q) × levelPrior_q
5. ведущий лимитер = argmax(limiterScore); веса блоков = normalize(limiterScore по q);
   тип определяет КАКИЕ блоки поднять (ceiling→D/E/F, control→F/G).
6. Переоценка раз в 4–8 нед (методология 8.4), лимитер мигрирует (1.4).
```

**Честно:** структура (отклонение×приор) обоснована 🟡; пороги
`θ_ceiling/θ_control` и `levelPrior` — тюнируемые константы конфига; нормы — 🟠
референс (§8.1.1), не пороги диагноза. Один ведущий лимитер = фокус (develop),
остальное — поддержка.

### 3.2. Формат флага боли — `Q-pain-1` (вход S2)

```
PainFlag {
  level: 'none' | 'discomfort' | 'pain'     // discomfort = тянущее (ок); pain = острое (стоп)
  zone:  jointRegion                         // где (§1.2 enum)
  atomId                                     // на каком атоме
  ts
}
```

`level==='pain'` → S2: стоп прогрессии по этой зоне, предложить мягкий
режим/rehab (S7), снять атом из автоподбора до сброса флага. `discomfort` — лог,
не блок.

### 3.3. Подача дозы при «нет оптимума» — `Q-dose-1`

Методология 5.3: чёткой дозо-зависимости ROM нет. Решение:

- У атома — **фиксированный дефолт дозы** (`SPORT_CONFIG.doseDefaults`): статика
  15–30с×2 (острый) / 30–60с (развитие), ~1 мин/день/мышца суммарно; PNF 3–6с
  контракт ×2–4; SMR 30–120с; дыхание 5 мин.
- **Прогрессия — «пока даёт прирост»** (правило, не автонакрутка объёма, риск
  1.8): держим дефолт, при плато по records (нет роста ROM N сессий) →
  предложить сменить переменную (амплитуда/темп/нагрузка), не «добавить минут».
- Пользователю показываем дефолт + reason «науке точный оптимум неизвестен, это
  безопасный разумный дефолт» (UI-инвариант AGENTS.md).

### 3.4. `prerequisites_catalog` (токен → проверка)

```
warmup_done   → session.warmupCompleted === true
equipment:<X> → X ∈ profile.equipment   (foam_roll/band/strap/ball/percussion/bolster)
no_acute_pain → нет активного PainFlag.level==='pain' по зоне атома
```

Неизвестный токен → fail-closed (блок атома) + лог.

### 3.5. Нормы ROM (бенчмарки) — ссылка

`benchmark(jointRegion)` берёт из **методологии §8.1.1** (AAOS + клинич., 🟠).
Отличие от пальцев: норма **абсолютная по суставу** (а не %BW по уровню), с
возрастной/популяционной поправкой как множителем — это допустимая доменная
форма бенчмарка (см. §4 / §5 реконсиляция).

---

## Часть 4. MOBILITY `SPORT_CONFIG` (инстанс контракта переносимости)

Реализация контракта **fingers §4**. Движок читает спорт-числа ТОЛЬКО отсюда.

```
SPORT_CONFIG (mobility) {
  sportId: 'mobility'

  qualityAxes: [                      // 9 осей (методология ч.2)
    active_rom, passive_flex, readiness, activation, autonomic,
    tissue_recovery, motor_control, joint_stability, mental ]

  modalities: [ bodyweight, band, strap, foam_roll, ball, percussion,
                loaded, breath, bolster, wall_env ]

  positionAxes: [ {jointRegion}, {timeOfDay} ]   // обобщение gripId/edge пальцев

  tissueRiskModel: {                  // ⚠️ НЕСУЩЕЕ — заменяет climbing A2/A4 целиком
    riskTissue:   'капсула сустава / мышечно-сухожильный блок; нестабильность при гипермобильности',
    loadRatioField: 'endRangeLoad × amplitude',   // нет a2ForceRatio; риск = перерастяжение/баллистика на холодную
    dangerBudgetCap: 'кап end-range/баллистического объёма на сессию по уровню'
  }

  recoveryWindows: {                  // tissueLoad-tier → часы
    low: 0, moderate: 12, high: 48 }  // loaded/эксцентрика (F) ведёт себя как сила (DOMS ~48ч)

  intensityWeightMap: {               // loadModel → вес для агрегатов нагрузки
    bodyweight: 0.4, amplitude: '0.4..1.0 по доле диапазона',
    addedWeightKg: '1 + добавка/вес_тела', rpe: 'rpe/7', none: 0 }

  tissueWeights: { low:0.3, moderate:0.6, high:1.0 }

  benchmarks: <методология §8.1.1>,   // АБСОЛЮТНЫЕ по суставу (не per-level %BW) + возр./попул. множитель

  doseDefaults: <§3.3>,               // дефолты доз (заменяют climbing transferFunctions)
  progressionRule: 'hold-default; switch-variable-on-plateau',  // не автонакрутка объёма

  mevMav: { rom_development: '~5–10 мин/нед на мышцу, ≥2–3×/нед' },  // методология 5.3

  skillAllocation: null,              // n/a — у мобильности нет дележа «навык/железо»;
                                      //   баланс задаётся purpose-микс режима (6)

  modes: [                            // 7 режимов (методология ч.6) — purpose×autonomic
    morning_tonify   {purpose:prep,    autonomic:tonify,  blocks:[A2,B,G,I-act]},
    pre_workout_ramp {purpose:prep,    autonomic:tonify,  blocks:[A,C,B,(Pot)]},
    post_workout     {purpose:recover, autonomic:relax,   blocks:[H,J,D-light]},
    develop_mobility {purpose:develop, autonomic:neutral, blocks:[D2,E,F]},
    evening_relax    {purpose:regulate,autonomic:relax,   blocks:[I,D-light,H-slow]},
    rehab            {purpose:recover, autonomic:neutral, blocks:[E?,F,H/G], gates:strict},
    anti_sedentary   {purpose:prep,    autonomic:tonify,  blocks:[J2,B,G], micro:true}
  ],

  prerequisitesCatalog: <§3.4>,
  painLocations: jointRegion-enum,    // §3.2
  ageGate: { ballistic/aggressive_PNF: подростки до созревания; hypermobile: stability-first }
}
```

**Generic (в движке, НЕ в конфиге):** схема атома (§1.2 поля), формы дозы как
enum (расширяемый), две оси доказательности, иерархия блок→сессия→циклы и
правило порядка, структура валидаторов S1–S9 (fail-closed runner), алгоритм
аудита-лимитера (§3.1 каркас), readiness-математика, периодизация-машинерия,
records/PR с абстрактным lift-identifier, bibliography.

**Инвариант форка:** литерал climbing (grip/edge/A2/CF/hang) в коде движка =
баг. Литерал mobility (jointRegion/ROM-норма/cyclic_sigh) в коде движка = тоже
баг — он живёт в этом `SPORT_CONFIG`.

---

## Часть 5. Реконсиляция словаря ядра + план извлечения

Мобильность — **второй инстанс**; теперь видно, что в generic-словаре надо
доуточнить при выносе ядра (правило «после второго домена»):

| Концепт           | Пальцы                                     | Мобильность                              | Канон ядра (предложение)                                     |
| ----------------- | ------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------ |
| Намерение блока   | `targetStimulus{develop,maintain,recover}` | `purpose{prep,develop,recover,regulate}` | супермножество `{prep,develop,maintain,recover,regulate}`    |
| Автономный вектор | (нет)                                      | `autonomic{tonify,neutral,relax}`        | добавить как опц. generic-ось                                |
| Первичная ось     | `energySystem`                             | `purpose×autonomic`                      | `primaryAxis` — pluggable per-sport (energySystem / purpose) |
| Позиция           | `gripId+edgeMm`                            | `jointRegion+timeOfDay`                  | generic `positionAxes[]` (уже есть, fingers §4)              |
| Бенчмарк          | `benchmarks[level][q]` (%BW)               | `benchmarks[q]` (абсолют по суставу)     | обобщить: `benchmarks` допускает per-level И per-q-absolute  |
| Каталог осей      | `quality_catalog`                          | `axis_catalog`                           | единое имя ядра: `quality_catalog` (домен мапит)             |
| Каталог атомов    | `block_catalog`                            | `atom_catalog`                           | единое имя ядра: `catalog`                                   |
| Сборщик           | `mix_engine`/`session_builder`             | `routine_builder`                        | единое: `session_builder`                                    |
| Гейтинг           | `age_gating`                               | `population_gating`                      | единое: `gating` (возраст+популяция)                         |

**План извлечения (после реализации мобильности):** взять generic-части из обоих
доменов → `apps/web/_kernel/`: валидатор-фреймворк, периодизация, прогрессия,
assessment-каркас, readiness, records (abstract lift-id), bibliography, роутер,
timer/runner-shell, онбординг. Каждый домен оставляет: `SPORT_CONFIG` + данные
каталогов + доменные плееры. Контракт `SPORT_CONFIG` (fingers §4 + §4 здесь) —
точка стыковки; имена свести к канону (таблица выше) в момент выноса, не раньше.

---

_Документ v0.1 — спецификация реализации мобильности против контракта
переносимости. Закрывает `Q-atom-1` (§1.2), `Q-pain-1` (§3.2), `Q-limit-1`
(§3.1), `Q-dose-1` (§3.3). Старт реализации: см. порядок очереди в
[`IMPLEMENTATION_MAP.md`](IMPLEMENTATION_MAP.md) (safety → каталоги → builder/
mode_engine → runners → assessment → онбординг), всё против контрактов ядра._
