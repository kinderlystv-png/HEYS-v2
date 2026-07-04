# Осознанность и баланс энергообмена — Acceptance Fixtures v0

Companion for
[HUNGER_ENERGY_STATUS_SCENARIOS.md](HUNGER_ENERGY_STATUS_SCENARIOS.md). These
are deterministic product expectations, not final numeric tests.

## Fixture Rule

Each scenario passes only if the engine returns:

- compatible Energy Status;
- Risk Budget band;
- Food Priority band;
- action family;
- confidence behavior;
- no banned claim/copy.

Automated fixtures must also assert:

- `delayAllowed`;
- `hardOverride`;
- `suggestedAction`;
- `foodBandKcal`;
- `copyRisk`;
- `recheckAfterMin`;
- no user-facing numeric Food Priority score.

Use bands rather than exact scores until real outcome calibration exists.

## Bands

- Risk: `low`, `medium`, `high`, `stop`.
- Food Priority: `wait`, `checkpoint`, `snack`, `meal`, `foodFirst`.
- Confidence: `low`, `medium`, `high`.

## Scenario Matrix

| #   | Energy Status                        | Risk                | Food Priority         | Action family                       | Confidence  |
| --- | ------------------------------------ | ------------------- | --------------------- | ----------------------------------- | ----------- |
| 1   | `stableBetweenMeals` / `reboundRisk` | low/medium          | checkpoint            | hydrate + re-check; coffee optional | medium/high |
| 2   | `reboundRisk`                        | high                | snack/meal            | `riskBrakeMeal`                     | medium/high |
| 3   | `fed`                                | low-high by control | checkpoint/snack      | pause or protein/fiber brake        | medium      |
| 4   | `stableBetweenMeals`                 | low                 | wait/checkpoint       | observe/delay                       | high        |
| 5   | safety override                      | stop                | foodFirst             | `doNotDelay`                        | high        |
| 6   | `recoveryNeed`                       | medium/high         | meal/foodFirst        | meal/protein first                  | medium/high |
| 7   | `deficitPressure`                    | high                | meal                  | controlled meal                     | medium/high |
| 8   | `reboundRisk`                        | high                | snack/meal            | `riskBrakeMeal`                     | medium/high |
| 9   | social context                       | low/medium          | checkpoint/snack      | bridge only if needed               | medium      |
| 10  | sleep-relative state                 | by context          | by context            | evaluate by wake/meal rhythm        | medium      |
| 11  | `reboundRisk`                        | medium/high         | checkpoint/snack/meal | hydrate first, food if symptoms     | low/medium  |
| 12  | night pattern                        | high                | snack/meal/foodFirst  | support + pattern tracking          | medium      |
| 13  | `medicalCaution`                     | stop/high           | foodFirst             | conservative/pro guidance           | medium/high |
| 14  | possible pattern                     | low/medium          | by state              | "possible driver"                   | low         |
| 15  | `nutritionFloorRisk`                 | high/stop           | foodFirst             | recovery food-first                 | medium/high |
| 16  | `reboundRisk` possible               | medium              | checkpoint/snack      | planned anchor/checkpoint           | medium      |
| 17  | `fed`                                | low                 | checkpoint            | satiety-lag re-check                | medium/high |
| 18  | unknown/partial                      | unknown/medium      | checkpoint            | ask 1-2 questions                   | low         |
| 19  | UI input state                       | computed            | computed              | snap slider + rails                 | n/a         |
| 20  | `fed` / satiety-lag                  | low/medium          | checkpoint            | re-check + fallback                 | medium      |
| 21  | `reboundRisk`                        | high                | snack/meal            | `riskBrakeMeal`                     | medium/high |
| 22  | rhythm/history dependent             | differs             | differs               | context-specific                    | medium      |
| 23  | partial data                         | unknown/medium      | checkpoint            | ask context, no exact kcal          | low/medium  |
| 24  | safety override                      | stop                | foodFirst             | `doNotDelay`                        | high        |
| 25  | loss-of-control risk                 | high                | snack/meal            | `riskBrakeMeal`                     | medium/high |
| 26  | UI layout state                      | computed            | computed              | no overlap + fallback input         | n/a         |
| 27  | `medicalCaution`                     | high/stop           | foodFirst             | food-first support, no delay        | medium/high |

## Global Failure Conditions

Fail any scenario if the engine:

- recommends delay under safety symptoms;
- treats hunger level as Food Priority directly;
- treats hunger level as Risk directly;
- shows numeric Food Priority score to the user;
- gives precise kcal bands with stale/missing meal data;
- turns eating into failure language;
- diagnoses ED/night-eating/cycle problems;
- praises longer fasting as inherently better;
- lets fasting window override safety, recovery, or high risk.
- uses delay/fasting/0 kcal language in ED-sensitive mode.
