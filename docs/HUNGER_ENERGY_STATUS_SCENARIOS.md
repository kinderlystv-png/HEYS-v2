# Осознанность и баланс энергообмена — Scenario Suite

Scenario validation for
[HUNGER_ENERGY_STATUS_CONCEPT.md](HUNGER_ENERGY_STATUS_CONCEPT.md). Use this
file to test whether the concept makes sane decisions in realistic states.
Acceptance fixture bands live in
[HUNGER_ENERGY_STATUS_ACCEPTANCE.md](HUNGER_ENERGY_STATUS_ACCEPTANCE.md).

## Pass Rule

Each scenario must answer:

- what is the likely Energy Status;
- what is the Risk Budget;
- what action should HEYS suggest;
- what must HEYS not say.

If a future implementation fails these scenarios, the model is not ready.

## Core Scenarios

| #   | Scenario                                                                                             | Expected status / risk                                 | Expected action                                            | Must not say                                 |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------- |
| 1   | Morning hunger after 01:00 sweet/caloric meal, no red flags, okay sleep                              | `stableBetweenMeals` or `reboundRisk`, risk low/medium | water/tea checkpoint; coffee only if habitual and low-risk | "You must eat now" or "you are burning fat"  |
| 2   | Same as #1, but poor sleep, stress high, control low                                                 | `reboundRisk`, risk high                               | `riskBrakeMeal`, protein/fiber first                       | "Just push through the fast"                 |
| 3   | Active insulin wave after recent meal, craving specific sweet                                        | `fed`, risk depends on control/stress                  | pause, move/rest, or protein/fiber brake if control drops  | "Your body needs energy"                     |
| 4   | Low insulin wave, calm mood, hunger 4-5, no safety flags                                             | `stableBetweenMeals`, risk low                         | `delayWithCheck` or observe                                | "Longer fasting is always better"            |
| 5   | Low insulin wave, hunger 8, dizziness or shaking                                                     | safety override                                        | `doNotDelay`; food-first / medical caution                 | "Good fat-burning window"                    |
| 6   | Planned fasting window, hard training yesterday, protein debt                                        | `recoveryNeed`, risk medium/high                       | `eatMeal` or protein/fiber meal                            | "Fasting window overrides recovery"          |
| 7   | Very low intake day by evening, low wave, mood dropping                                              | `deficitPressure`, risk high                           | controlled meal, not more delay                            | "Stay under target at any cost"              |
| 8   | Stressful workday, skipped breakfast, strong evening cravings                                        | `reboundRisk`, risk high                               | `riskBrakeMeal` before uncontrolled eating                 | "You lack willpower"                         |
| 9   | Social dinner soon, mild hunger now                                                                  | context-dependent, risk low/medium                     | planned bridge snack only if needed; support dinner        | "Eating socially is failure"                 |
| 10  | Shift worker wakes at 15:00 hungry after sleep                                                       | sleep-relative state, not clock-morning                | evaluate from time since sleep/meal                        | "This is afternoon logic by clock"           |
| 11  | Alcohol night, morning hunger/thirst, poor sleep                                                     | `reboundRisk`, confidence low                          | hydrate, conservative food-first if symptoms/risk          | "Coffee solves this"                         |
| 12  | Repeated night wake-to-eat pattern                                                                   | possible night-eating pattern, risk high               | gentle safety prompt, pattern tracking, support            | diagnose or shame                            |
| 13  | Diabetes / hypoglycemia risk / relevant meds                                                         | `medicalCaution`, safety priority                      | conservative food-first, professional guidance             | fasting-style nudges                         |
| 14  | Pattern-learning week, only one late-sweet rebound event                                             | low confidence                                         | "possible driver" language                                 | "This is your trigger"                       |
| 15  | Hard training block + repeated low intake + persistent fatigue or cycle disruption                   | `nutritionFloorRisk`, risk high                        | food-first / recovery guidance                             | "Great deficit discipline"                   |
| 16  | Premenstrual week, stronger cravings than usual, control still okay                                  | `reboundRisk` possible, risk medium                    | planned protein/fiber anchor or short checkpoint           | "Hormones mean you cannot control it"        |
| 17  | User just ate a normal meal but still reports hunger 5 after 5-10 min                                | `fed`, risk low if calm                                | short satiety-lag re-check                                 | "Keep restricting" or "eat more immediately" |
| 18  | Hunger modal opened with only hunger 7 and no safety/context data                                    | low confidence, risk unknown/medium                    | ask 1-2 safety/control questions before delay              | confident metabolic claim                    |
| 19  | Hungry user opens bottom-right FAB on phone one-handed                                               | UI input state                                         | vertical snap slider + computed risk rail                  | tiny precise controls or long form           |
| 20  | User raises hunger slider from 4 to 8 while context shows recent meal, good control, no safety flags | Food Priority rises only mildly; risk stays low/medium | re-check first, snack fallback if trend continues          | "hunger 8 means eat a full meal now"         |
| 21  | Hunger 5 but stress high, skipped meal, poor sleep, past failed delays                               | Food Priority high; risk high                          | `riskBrakeMeal` / protein-fiber snack now                  | "wait because hunger is only moderate"       |
| 22  | Same hunger 6 at 08:00 vs 22:30 with different personal histories                                    | Food Priority differs by rhythm/history                | morning checkpoint or evening brake, context-dependent     | same recommendation by clock alone           |
| 23  | Hunger 6, but last meal/training data is stale or missing                                            | low/medium confidence                                  | ask minimal context; avoid precise kcal band               | confident exact recommendation               |
| 24  | Recent meal suggests checkpoint, but user reports shaking/dizziness                                  | safety override                                        | `doNotDelay`; food-first / medical caution                 | "satiety lag, just wait"                     |
| 25  | Hunger 4-5, but control 2, strong craving, failed delay history                                      | risk high despite moderate hunger                      | `riskBrakeMeal` / support action                           | "risk is low because hunger is moderate"     |
| 26  | FAB modal opens on small mobile screen with bottom nav/chat FAB present                              | usable UI state                                        | no overlap; tap/stepper fallback; readable rail values     | drag-only cramped control                    |
| 27  | Active/past ED or repeated restriction/loss-of-control pattern                                       | `medicalCaution`, risk high/stop                       | food-first support; no delay or 0 kcal band                | fasting, control, or failure language        |

## Red-Team Checks

- If risk is high, Energy Status must not recommend delay just because insulin
  wave is low.
- If safety is unknown, recommendation must be conservative.
- If the user eats, the UI must preserve control narrative, not failure
  narrative.
- If the user wants fat loss, the system must still optimize weekly
  sustainability over single-event restriction.
- If a pattern is based on weak history, the product must show low confidence.
- If the hunger FAB modal has missing safety/control data, it must ask a minimal
  follow-up before recommending delay.
- If low energy availability is plausible, deficit optimization must stop.
- Food Priority must be computed from hunger + context/history, not copied from
  the hunger slider.
- Stale or conflicting data must lower confidence; safety beats model context.
- Risk rail must be computed from control/history/safety, not copied from
  hunger.
- ED/restriction-sensitive mode must remove delay/fasting framing.

## Simulation Pass Notes

- Scenarios 8-12 require explicit edge-case modifiers in the decision engine:
  skipped meals under stress, social meals, shift work, alcohol, and repeated
  night wake-to-eat patterns cannot be left as generic context.
- Scenario 9 should not recommend a full meal before a planned social dinner
  unless Risk Budget is already high.
- Scenario 11 must not use coffee as the default after alcohol/poor sleep; start
  from hydration and conservative food-first guidance if symptoms or risk rise.
- Scenario 14 proves that pattern confidence is a release requirement, not just
  analytics polish.
- Scenarios 15-27 close the UI/safety gap: the modal needs a computed risk rail,
  minimum missing-context prompts, satiety-lag handling, one-handed input, and a
  hard stop for low energy availability.
