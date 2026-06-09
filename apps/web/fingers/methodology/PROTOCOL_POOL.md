# Пул протоколов — стартовый канонический набор

Единый пул, сгруппированный по качествам (часть 2 методологии). Все записи — в
финальном формате и являются прямыми кандидатами в **атомы** конструктора
([`CONSTRUCTOR_SPEC.md`](CONSTRUCTOR_SPEC.md) §1.2). Оси разметки — из
[`METHODOLOGY.md`](METHODOLOGY.md) §5.0; классификация нейтральна, школа живёт в
`sourceIds` (провенанс).

`sourceIds` ссылаются на стабильные ID из [`BIBLIOGRAPHY.md`](BIBLIOGRAPHY.md)
(полные ссылки + уровень доказательности). Плейсхолдеры `generic_*` устранены.

## Легенда полей

```
id            — стабильный идентификатор
quality       — качество-цель
energySystem  — phosphagen | glycolytic | aerobic | null
modality      — fingerboard|board|wall|campus|weights|drill|mobility|antagonist
doseShape     — hang|attempts|circuit|continuous|reps|process
dose          — поля зависят от doseShape (см. §1.2)
loadModel     — addedWeightKg|pctMax|rpe|grade|bodyweight|rm_margin|none
loadValue     — число; для grade — enum (easy-mid|submax|near-limit|limit|limit-skill)
fatigueCost   — low|moderate|high|max
tissueLoad    — low|moderate|high|max   (нагрузка на пальцы/связки)
gates         — minLevel / minAge / dangerLevel / prerequisites  (часть 9; minAge:null=fail-closed)
sourceIds     — ID из BIBLIOGRAPHY.md (там — СИЛА ИСТОЧНИКА)
doseConfidence — A|B|C  (уверенность в числах дозировки)
```

**Две оси доказательности.** Поле **`doseConfidence`** (A/B/C) — уверенность в
_самих числах_ протокола; trailing-комментарий `# 🟢/🟡/🟠` оставлен только как
визуальная подсказка. Сила источника — отдельно, в
[`BIBLIOGRAPHY.md`](BIBLIOGRAPHY.md). Протокол может ссылаться на 🟢 A работу,
но иметь дозу `doseConfidence: B` (экстраполяция).

(`intent` develop/maintain/recover — не в атоме, а на блоке/сессии при сборке.)

---

## Сила пальцев (блок A) — 6

```yaml
- id: fs_maxhang_20mm_half # Max Hangs, полузамок — рабочая лошадка
  quality: finger_strength
  energySystem: phosphagen
  modality: fingerboard
  doseShape: hang
  dose: { workSec: 10, restSec: 0, reps: 1, sets: 5, restSetsSec: 180 }
  loadModel: rm_margin
  loadValue: 3
  gripId: halfcrimp
  edgeSizeMm: 20
  fatigueCost: high
  tissueLoad: high
  gates:
    {
      minLevel: intermediate,
      minAge: 16,
      dangerLevel: moderate,
      prerequisites: [warmup_done, base_>=1y],
    }
  sourceIds: [lopez2019, lopez2012, horst_tfc] # 🟢 A
  doseConfidence: A

- id: fs_maxhang_20mm_open # Max Hangs, открытый — баланс хвата, безопаснее
  quality: finger_strength
  energySystem: phosphagen
  modality: fingerboard
  doseShape: hang
  dose: { workSec: 10, restSec: 0, reps: 1, sets: 5, restSetsSec: 180 }
  loadModel: rm_margin
  loadValue: 3
  gripId: openhand4
  edgeSizeMm: 20
  fatigueCost: high
  tissueLoad: moderate
  gates:
    {
      minLevel: intermediate,
      minAge: 16,
      dangerLevel: low,
      prerequisites: [warmup_done, base_>=1y],
    }
  sourceIds: [lopez2019, horst_tfc, feehally_beastmaking] # 🟢 A
  doseConfidence: A

- id: fs_repeater_73 # Repeaters 7:3 — strength-endurance/гипертрофия
  quality: finger_strength
  energySystem: phosphagen # дрейфует в glycolytic при наборе объёма (методология 3.2)
  modality: fingerboard
  doseShape: hang
  dose: { workSec: 7, restSec: 3, reps: 6, sets: 4, restSetsSec: 150 }
  loadModel: rm_margin
  loadValue: 2
  gripId: openhand4
  edgeSizeMm: 20
  fatigueCost: moderate
  tissueLoad: moderate
  gates:
    {
      minLevel: intermediate,
      minAge: 14,
      dangerLevel: low,
      prerequisites: [warmup_done],
    }
  sourceIds: [medernach2015, horst_tfc, beastmaker_app] # 🟢 A
  doseConfidence: A

- id: fs_nohang_pickup # No-Hangs — безопасный вход / реабилитация
  quality: finger_strength
  energySystem: phosphagen
  modality: fingerboard
  doseShape: hang
  dose: { workSec: 8, restSec: 0, reps: 1, sets: 4, restSetsSec: 150 }
  loadModel: addedWeightKg
  loadValue: null
  gripId: halfcrimp
  edgeSizeMm: 20
  fatigueCost: moderate
  tissueLoad: moderate
  gates:
    {
      minLevel: beginner,
      minAge: 14,
      dangerLevel: low,
      prerequisites: [warmup_done],
    }
  sourceIds: [nelson_c4hp, lattice_research] # 🟡 B
  doseConfidence: B

- id: fs_density_hang # Density Hangs — объём/прочность ткани
  quality: finger_strength
  energySystem: phosphagen
  modality: fingerboard
  doseShape: hang
  dose: { workSec: 30, restSec: 0, reps: 1, sets: 4, restSetsSec: 150 }
  loadModel: rm_margin
  loadValue: 5
  gripId: openhand4
  edgeSizeMm: 25
  fatigueCost: moderate
  tissueLoad: moderate
  gates:
    {
      minLevel: intermediate,
      minAge: 16,
      dangerLevel: low,
      prerequisites: [warmup_done],
    }
  sourceIds: [nelson_c4hp] # 🟠 C
  doseConfidence: C

- id: fs_minedge_recruit # Минимальный edge / max recruitment — потолок, риск
  quality: finger_strength
  energySystem: phosphagen
  modality: fingerboard
  doseShape: hang
  dose: { workSec: 5, restSec: 0, reps: 1, sets: 4, restSetsSec: 180 }
  loadModel: rm_margin
  loadValue: 2
  gripId: halfcrimp
  edgeSizeMm: 8
  fatigueCost: high
  tissueLoad: high
  gates:
    {
      minLevel: advanced,
      minAge: 18,
      dangerLevel: high,
      prerequisites: [warmup_done, base_>=2y, strength_base],
    }
  sourceIds: [lopez2019, horst_tfc] # 🟡 B
  doseConfidence: B
```

## Макс. сила тела (блок B) — 4

```yaml
- id: str_limit_boulder
  quality: max_strength
  energySystem: phosphagen
  modality: board
  doseShape: attempts
  dose: { movesPerAttempt: [1, 5], attempts: [6, 12], restSetsSec: 240 }
  loadModel: grade
  loadValue: limit
  fatigueCost: high
  tissueLoad: moderate
  gates:
    {
      minLevel: intermediate,
      minAge: 14,
      dangerLevel: moderate,
      prerequisites: [warmup_done],
    }
  sourceIds: [anderson_rctm] # 🟢 A
  doseConfidence: A

- id: str_weighted_pullup
  quality: max_strength
  energySystem: phosphagen
  modality: weights
  doseShape: reps
  dose: { reps: [3, 5], sets: 4, restSetsSec: 180 }
  loadModel: addedWeightKg
  loadValue: null
  fatigueCost: moderate
  tissueLoad: low
  gates:
    {
      minLevel: intermediate,
      minAge: 14,
      dangerLevel: low,
      prerequisites: [warmup_done],
    }
  sourceIds: [horst_tfc, anderson_rctm] # 🟡 B
  doseConfidence: B

- id: str_lockoff_iso
  quality: max_strength
  energySystem: phosphagen
  modality: weights
  doseShape: hang
  dose: { workSec: 8, restSec: 0, reps: 1, sets: 4, restSetsSec: 150 }
  loadModel: bodyweight
  loadValue: null
  fatigueCost: moderate
  tissueLoad: low
  gates:
    {
      minLevel: intermediate,
      minAge: 14,
      dangerLevel: low,
      prerequisites: [warmup_done],
    }
  sourceIds: [horst_tfc] # 🟡 B
  doseConfidence: B

- id: str_body_tension
  quality: max_strength
  energySystem: phosphagen
  modality: board
  doseShape: reps
  dose: { reps: [4, 8], sets: 3, restSetsSec: 120 }
  loadModel: bodyweight
  fatigueCost: moderate
  tissueLoad: low
  gates:
    {
      minLevel: intermediate,
      minAge: 14,
      dangerLevel: low,
      prerequisites: [warmup_done],
    }
  sourceIds: [feehally_beastmaking] # 🟡 B
  doseConfidence: B
```

## Анаэробная ёмкость / power-endurance (блок D) — 5

```yaml
- id: pe_boulder_4x4
  quality: anaerobic_capacity
  energySystem: glycolytic
  modality: wall
  doseShape: circuit
  dose: { problemsPerRound: 4, rounds: 4, restRoundsSec: 240 }
  loadModel: grade
  loadValue: submax
  fatigueCost: high
  tissueLoad: moderate
  gates:
    {
      minLevel: intermediate,
      minAge: 14,
      dangerLevel: low,
      prerequisites: [warmup_done],
    }
  sourceIds: [anderson_rctm, horst_tfc] # 🟢 A
  doseConfidence: A

- id: pe_fingerboard_lactic
  quality: anaerobic_capacity
  energySystem: glycolytic
  modality: fingerboard
  doseShape: hang
  dose: { workSec: 30, restSec: 20, reps: 6, sets: 3, restSetsSec: 180 }
  loadModel: rpe
  loadValue: 7
  gripId: openhand4
  edgeSizeMm: 20
  fatigueCost: high
  tissueLoad: moderate
  gates:
    {
      minLevel: advanced,
      minAge: 16,
      dangerLevel: moderate,
      prerequisites: [warmup_done, base_>=2y],
    }
  sourceIds: [maciejczyk2022, horst_tfc] # 🟡 B
  doseConfidence: B

- id: pe_linkups
  quality: anaerobic_capacity
  energySystem: glycolytic
  modality: wall
  doseShape: circuit
  dose: { problemsPerRound: 1, rounds: 6, restRoundsSec: 180 } # связки 30–120 с
  loadModel: grade
  loadValue: near-limit
  fatigueCost: high
  tissueLoad: moderate
  gates:
    {
      minLevel: intermediate,
      minAge: 14,
      dangerLevel: low,
      prerequisites: [warmup_done],
    }
  sourceIds: [anderson_rctm] # 🟢 A
  doseConfidence: A

- id: pe_route_repeats # повтор сустейн-участка трассы (спорт)
  quality: anaerobic_capacity
  energySystem: glycolytic
  modality: wall
  doseShape: circuit
  dose: { problemsPerRound: 1, rounds: 4, restRoundsSec: 360 } # 1:1.5–1:2 к работе
  loadModel: grade
  loadValue: submax
  fatigueCost: high
  tissueLoad: moderate
  gates:
    {
      minLevel: intermediate,
      minAge: 14,
      dangerLevel: low,
      prerequisites: [warmup_done],
    }
  sourceIds: [anderson_rctm, horst_tfc] # 🟢 A
  doseConfidence: A

- id: pe_on_the_minute # болдер-интервалы: проблема каждую минуту
  quality: anaerobic_capacity
  energySystem: glycolytic
  modality: wall
  doseShape: circuit
  dose: { problemsPerRound: 1, rounds: 10, restRoundsSec: 60 } # EMOM-формат
  loadModel: grade
  loadValue: submax
  fatigueCost: high
  tissueLoad: moderate
  gates:
    {
      minLevel: intermediate,
      minAge: 14,
      dangerLevel: low,
      prerequisites: [warmup_done],
    }
  sourceIds: [horst_tfc] # 🟡 B
  doseConfidence: B
```

## Мощность / контактная сила (блок C) — 5

```yaml
- id: pow_dyno_limit # динамический лимит-болдер — безопасная база, приоритет
  quality: power
  energySystem: phosphagen
  modality: board
  doseShape: attempts
  dose: { movesPerAttempt: [1, 3], attempts: [6, 10], restSetsSec: 240 }
  loadModel: grade
  loadValue: limit
  fatigueCost: high
  tissueLoad: moderate
  gates:
    {
      minLevel: intermediate,
      minAge: 16,
      dangerLevel: moderate,
      prerequisites: [warmup_done],
    }
  sourceIds: [horst_tfc, anderson_rctm] # 🟢 A
  doseConfidence: A

- id: pow_first_move_max # максимальное «первое движение» / взрывной старт
  quality: power
  energySystem: phosphagen
  modality: board
  doseShape: attempts
  dose: { movesPerAttempt: [1, 1], attempts: [8, 12], restSetsSec: 180 }
  loadModel: grade
  loadValue: limit
  fatigueCost: high
  tissueLoad: moderate
  gates:
    {
      minLevel: intermediate,
      minAge: 16,
      dangerLevel: moderate,
      prerequisites: [warmup_done],
    }
  sourceIds: [horst_tfc] # 🟡 B
  doseConfidence: B

- id: pow_plyo_catch # плиометрика хвата — сбросы/ловли на зацепах
  quality: power
  energySystem: phosphagen
  modality: campus
  doseShape: attempts
  dose: { movesPerAttempt: [1, 2], attempts: [4, 6], restSetsSec: 240 }
  loadModel: bodyweight
  fatigueCost: high
  tissueLoad: high
  gates:
    {
      minLevel: advanced,
      minAge: 18,
      dangerLevel: high,
      prerequisites: [warmup_done, strength_base, base_>=2y],
    }
  sourceIds: [horst_tfc] # 🟠 C
  doseConfidence: C

- id: pow_campus_ladder # кампус-лесенки 1-2-3 — высокий риск/польза
  quality: power
  energySystem: phosphagen
  modality: campus
  doseShape: attempts
  dose: { movesPerAttempt: [3, 5], attempts: [3, 5], restSetsSec: 300 }
  loadModel: bodyweight
  fatigueCost: max
  tissueLoad: high
  gates:
    {
      minLevel: advanced,
      minAge: 18,
      dangerLevel: very-high,
      prerequisites: [warmup_done, strength_base, base_>=2y],
    }
  sourceIds: [horst_tfc, anderson_rctm] # 🟡 B
  doseConfidence: B

- id: pow_rfd_pulls # взрывные изометрические pulls — RFD (как быстро)
  quality: power
  energySystem: phosphagen
  modality: fingerboard
  doseShape: attempts
  dose: { movesPerAttempt: [1, 1], attempts: [15, 25], restSetsSec: 150 } # «выстрелы» <5с
  loadModel: rpe
  loadValue: 9 # максимально быстро, не до отказа
  gripId: halfcrimp
  edgeSizeMm: 20
  fatigueCost: moderate
  tissueLoad: moderate
  gates:
    {
      minLevel: intermediate,
      minAge: 16,
      dangerLevel: moderate,
      prerequisites: [warmup_done],
    }
  sourceIds: [levernier2019] # 🟡 B  (нейральная RFD-адаптация)
  doseConfidence: B
```

## Аэробная база предплечий (блок E) — 4

```yaml
- id: aer_arc
  quality: aerobic_base
  energySystem: aerobic
  modality: wall
  doseShape: continuous
  dose: { workSec: 1800, sets: 1 } # 20–45 мин непрерывно
  loadModel: rpe
  loadValue: 3
  fatigueCost: low
  tissueLoad: low
  gates: { minLevel: beginner, minAge: 14, dangerLevel: low, prerequisites: [] }
  sourceIds: [anderson_rctm, maciejczyk2022] # 🟡 B
  doseConfidence: B

- id: aer_power_intervals
  quality: aerobic_base
  energySystem: aerobic
  modality: wall
  doseShape: circuit
  dose: { problemsPerRound: 1, rounds: 4, restRoundsSec: 300 } # 4–6 мин усилия
  loadModel: rpe
  loadValue: 6
  fatigueCost: moderate
  tissueLoad: low
  gates:
    {
      minLevel: intermediate,
      minAge: 14,
      dangerLevel: low,
      prerequisites: [warmup_done],
    }
  sourceIds: [maciejczyk2022, horst_tfc] # 🟡 B
  doseConfidence: B

- id: aer_mileage
  quality: aerobic_base
  energySystem: aerobic
  modality: wall
  doseShape: continuous
  dose: { workSec: 2700, sets: 1 }
  loadModel: grade
  loadValue: easy-mid
  fatigueCost: low
  tissueLoad: low
  gates: { minLevel: beginner, minAge: 0, dangerLevel: low, prerequisites: [] }
  sourceIds: [anderson_rctm, macleod_9of10] # 🟢 A
  doseConfidence: A

- id: aer_bfr_lowload # BFR — низкая нагрузка + ограничение кровотока
  quality: aerobic_base
  energySystem: aerobic
  modality: fingerboard
  doseShape: hang
  dose: { workSec: 0, restSec: 0, reps: 1, sets: 4, restSetsSec: 60 } # до отказа на подход
  loadModel: pctMax
  loadValue: 40 # ~40% MVC, манжета ~60% окклюзии
  gripId: openhand4
  edgeSizeMm: 20
  fatigueCost: moderate
  tissueLoad: low # низкая механическая нагрузка — плюс для бережного стимула
  gates:
    {
      minLevel: intermediate,
      minAge: 18,
      dangerLevel: moderate,
      prerequisites: [warmup_done, bfr_cuff_technique],
    }
  sourceIds: [perrin2026] # 🟡 B  (RCT: ↑CF +22%)
  doseConfidence: B
```

> Якорь дозировки блоков D/E — Critical Force (методология ч.8): около/ниже CF →
> аэробная ёмкость (E), выше CF → анаэробная (D). Тест CF — `aer_cf_test` (часть
> 8).

## Техника (блок F) — 4

```yaml
- id: tech_silent_feet
  quality: technique
  energySystem: null
  modality: drill
  doseShape: continuous
  dose: { workSec: 900, sets: 1 }
  loadModel: rpe
  loadValue: 2
  fatigueCost: low
  tissueLoad: low
  gates: { minLevel: beginner, minAge: 0, dangerLevel: low, prerequisites: [] }
  sourceIds: [macleod_9of10, motor_learning] # 🟢 A
  doseConfidence: A

- id: tech_constraint_led
  quality: technique
  energySystem: null
  modality: drill
  doseShape: continuous
  dose: { workSec: 900, sets: 1 }
  loadModel: rpe
  loadValue: 3
  fatigueCost: low
  tissueLoad: low
  gates: { minLevel: beginner, minAge: 0, dangerLevel: low, prerequisites: [] }
  sourceIds: [cla_framework, lattice_research] # 🟡 B
  doseConfidence: B

- id: tech_limit_project_movement
  quality: technique
  energySystem: null
  modality: wall
  doseShape: attempts
  dose: { movesPerAttempt: [3, 8], attempts: [6, 12], restSetsSec: 180 }
  loadModel: grade
  loadValue: limit-skill
  fatigueCost: moderate
  tissueLoad: low
  gates:
    {
      minLevel: intermediate,
      minAge: 0,
      dangerLevel: low,
      prerequisites: [warmup_done],
    }
  sourceIds: [macleod_9of10, motor_learning] # 🟢 A
  doseConfidence: A

- id: tech_variety_mileage
  quality: technique
  energySystem: null
  modality: wall
  doseShape: continuous
  dose: { workSec: 2700, sets: 1 }
  loadModel: grade
  loadValue: easy-mid
  fatigueCost: low
  tissueLoad: low
  gates: { minLevel: beginner, minAge: 0, dangerLevel: low, prerequisites: [] }
  sourceIds: [macleod_9of10] # 🟢 A
  doseConfidence: A
```

## Антагонисты / прехаб (блок G) — 3

```yaml
- id: ant_push_shoulder
  quality: antagonist
  energySystem: null
  modality: antagonist
  doseShape: reps
  dose: { reps: [8, 15], sets: 3, restSetsSec: 60 }
  loadModel: rpe
  loadValue: 6
  fatigueCost: low
  tissueLoad: low
  gates: { minLevel: beginner, minAge: 0, dangerLevel: low, prerequisites: [] }
  sourceIds: [vagy_rockrehab, vigouroux2014] # 🟠 (профилактика — RCT нет; механизм 🟡)
  doseConfidence: C

- id: ant_finger_extensors
  quality: antagonist
  energySystem: null
  modality: antagonist
  doseShape: reps
  dose: { reps: [15, 25], sets: 3, restSetsSec: 45 }
  loadModel: rpe
  loadValue: 5
  fatigueCost: low
  tissueLoad: low
  gates: { minLevel: beginner, minAge: 0, dangerLevel: low, prerequisites: [] }
  sourceIds: [vagy_rockrehab, vigouroux2014] # 🟠 (баланс — механизм 🟡, профилактика RCT нет)
  doseConfidence: C

- id: ant_prehab_targeted
  quality: antagonist
  energySystem: null
  modality: antagonist
  doseShape: reps
  dose: { reps: [10, 15], sets: 3, restSetsSec: 60 }
  loadModel: rpe
  loadValue: 5
  fatigueCost: low
  tissueLoad: low
  gates:
    {
      minLevel: beginner,
      minAge: 0,
      dangerLevel: low,
      prerequisites: [injury_screen],
    }
  sourceIds: [vagy_rockrehab, schoffl2003, miro_schoffl2021] # 🟢 A
  doseConfidence: A
```

## Мобильность (блок H) — 2

```yaml
- id: mob_hip_turnout
  quality: mobility
  energySystem: null
  modality: mobility
  doseShape: reps
  dose: { reps: [8, 12], sets: 2, restSetsSec: 30 }
  loadModel: bodyweight
  fatigueCost: low
  tissueLoad: low
  gates: { minLevel: beginner, minAge: 0, dangerLevel: low, prerequisites: [] }
  sourceIds: [feehally_beastmaking] # 🟡 B
  doseConfidence: B

- id: mob_shoulder
  quality: mobility
  energySystem: null
  modality: mobility
  doseShape: reps
  dose: { reps: [8, 12], sets: 2, restSetsSec: 30 }
  loadModel: bodyweight
  fatigueCost: low
  tissueLoad: low
  gates: { minLevel: beginner, minAge: 0, dangerLevel: low, prerequisites: [] }
  sourceIds: [feehally_beastmaking, vagy_rockrehab] # 🟡 B
  doseConfidence: B
```

## Ментальное / тактика (блок I) — 3

```yaml
- id: mental_fall_practice
  quality: mental
  energySystem: null
  modality: wall
  doseShape: reps
  dose: { reps: [5, 10], sets: 1, restSetsSec: 120 }
  loadModel: rpe
  loadValue: 4
  fatigueCost: low
  tissueLoad: low
  gates:
    {
      minLevel: beginner,
      minAge: 0,
      dangerLevel: moderate,
      prerequisites: [safe_fall_setup],
    }
  sourceIds: [macleod_9of10] # 🟡 B
  doseConfidence: B

- id: mental_redpoint_tactics
  quality: mental
  energySystem: null
  modality: wall
  doseShape: process
  dose: { checklist: [сегменты, beta-план, точки отдыха, дыхание, меморизация] }
  loadModel: none
  fatigueCost: low
  tissueLoad: low
  gates:
    { minLevel: intermediate, minAge: 0, dangerLevel: low, prerequisites: [] }
  sourceIds: [macleod_9of10] # 🟠 C
  doseConfidence: C

- id: mental_efficiency_under_load
  quality: mental
  energySystem: null
  modality: wall
  doseShape: continuous
  dose: { workSec: 1200, sets: 1 }
  loadModel: rpe
  loadValue: 4
  fatigueCost: low
  tissueLoad: low
  gates:
    { minLevel: intermediate, minAge: 0, dangerLevel: low, prerequisites: [] }
  sourceIds: [macleod_9of10] # 🟡 B
  doseConfidence: B
```

---

## Покрытие пула

| Качество           | Протоколов | Блок |
| ------------------ | :--------: | :--: |
| Сила пальцев       |     6      |  A   |
| Макс. сила тела    |     4      |  B   |
| Анаэробная ёмкость |     5      |  D   |
| Мощность           |     5      |  C   |
| Аэробная база      |     4      |  E   |
| Техника            |     4      |  F   |
| Антагонисты        |     3      |  G   |
| Мобильность        |     2      |  H   |
| Ментальное/тактика |     3      |  I   |

**Итого 36 протоколов**, все 9 качеств покрыты ≥2 протоколами. Все `sourceIds` —
реальные ID из [`BIBLIOGRAPHY.md`](BIBLIOGRAPHY.md); плейсхолдеров нет.

## Находки схемы (учтены в §1.2)

1. ✅ `loadModel += rm_margin, none`; grade-значение — enum.
2. ✅ `doseShape` (hang/attempts/circuit/continuous/reps/process).
3. ✅ `gripId/edgeSizeMm` опциональны по модальности.
4. ✅ `minAge: null = нет данных → fail-closed`; `0 = без гейта`.
5. ✅ `intent` — на блоке/сессии, не в атоме.
6. ✅ Тактика — `doseShape:'process'` с `checklist[]`.

## Дальше

- Пул готов для реализации (`block_catalog` / `assessment` / `validators`,
  CONSTRUCTOR_SPEC §2.3).
- Глубину можно растить точечно: добавить варианты под дисциплины и при
  необходимости новые источники (заводить сначала в `BIBLIOGRAPHY.md`).
