# Осознанность и баланс энергообмена — Decision Engine Draft

Decision-engine companion for
[HUNGER_ENERGY_STATUS_CONCEPT.md](HUNGER_ENERGY_STATUS_CONCEPT.md).

This is not final code. It defines the order of decisions so the product does
not contradict itself.

## Inputs

Required for any response:

- `now`
- `hungerLevel`

Required for confident response:

- `controlLevel`
- `safetyFlags: SafetyFlag[]`
- `lastMealAt`
- `lastMealSummary`
- `goalMode`

Useful context:

- insulin wave state;
- remaining kcal and 3-day caloric debt/excess;
- protein debt;
- nutrition floor / low energy availability concern;
- sleep quality/hours;
- clock time, time since waking, and usual meal rhythm;
- stress/mood/focus;
- training/recovery load;
- hydration/caffeine/alcohol;
- medication context, especially appetite/glucose-affecting medication;
- cycle/premenstrual context if relevant;
- planned social meal timing;
- just-ate / possible satiety-lag context;
- shift-work/travel context;
- night wake-to-eat pattern;
- personal pattern history.

## Decision Order

1. Evaluate safety flags.
2. Estimate Risk Budget.
3. Estimate Energy Status.
4. Apply goal mode.
5. Calculate Food Priority.
6. Select action.
7. Set re-check rule.
8. Store outcome for learning.

The order matters: Energy Status must not override safety or Risk Budget.

## Safety Gate

Return `delayAllowed=false` plus `doNotDelay`, `fastCarbSafety`, or conservative
food-first guidance if any hard flag exists:

- dizziness, shaking, faintness, confusion, nausea;
- diabetes / hypoglycemia risk / relevant medication;
- pregnancy/breastfeeding;
- minor age;
- active or past eating disorder;
- repeated loss-of-control eating;
- illness, intense recovery need, very low intake day, or low energy
  availability concern.

If safety data is missing, set confidence lower and avoid aggressive delay. Hard
override is evaluated before Risk Budget, Energy Status, or Food Priority.

## Engine Invariants

- If `hardOverride` exists, then `delayAllowed=false`.
- If `delayAllowed=false`, then `recheckAfterMin` is unset unless the action is
  post-food outcome capture.
- `hardOverride='delayForbidden'` cannot return `observe`, `hydratePause`,
  `coffeePause`, or `delayWithCheck`.
- `hardOverride='fastCarbSafety'` is only for suspected/confirmed hypoglycemia:
  diabetes, hypoglycemia risk, glucose-affecting medication, low glucose
  reading, or hypoglycemia-like symptoms in that context. It is not a normal
  hunger snack.
- Safety output wins over Risk Budget, Energy Status, Food Priority, fasting
  window, and calorie target.

## Risk Budget Heuristic

Start with `low`. Detailed v0 scoring lives in
[HUNGER_ENERGY_STATUS_RISK_BUDGET.md](HUNGER_ENERGY_STATUS_RISK_BUDGET.md).

Raise to `medium` if any apply:

- hunger 6-7;
- hunger is rising;
- control <=6;
- poor sleep;
- stress high;
- strong craving;
- known rebound pattern;
- long gap compared with personal history;
- premenstrual/craving-prone context with low control.

Raise to `high` if any apply:

- hunger >=8;
- control <=4;
- all-or-nothing thoughts;
- safety-like body signals;
- repeated failed checkpoints today;
- stress high + poor sleep + strong craving;
- stress high + long gap/skipped meal + strong craving;
- low energy availability concern;
- restriction/binge history or recent uncontrolled episode.

Risk can only be lowered by stable/falling hunger, good control, low stress,
good focus, and successful personal history in similar contexts.

## Energy Status Heuristic

Use the most explanatory label:

- `fed`: recent meal or active wave, food still being processed;
- `postMealDecline`: meal energy fading, normal transition hunger possible;
- `stableBetweenMeals`: normal gap, low risk, stable state;
- `deficitPressure`: low intake, accumulated debt, or long gap raises food
  value;
- `recoveryNeed`: training/illness/fatigue/protein debt raises food priority;
- `nutritionFloorRisk`: intake/recovery is too low for more delay;
- `reboundRisk`: meal/context pattern predicts stronger hunger or loss of
  control.

When labels compete, use conflict priority from the concept: safety -> risk ->
low availability/recovery -> weekly deficit -> timing -> insulin.

## Food Priority Heuristic

Food Priority is a 0-100 score for "how much HEYS recommends eating now".
Detailed v0 scoring lives in
[HUNGER_ENERGY_STATUS_FOOD_PRIORITY.md](HUNGER_ENERGY_STATUS_FOOD_PRIORITY.md).

- `0-20` wait: no food now, only observe/hydrate if safe.
- `21-45` checkpoint: pause, re-check, prepare snack fallback.
- `46-65` snack: controlled bridge or protein/fiber anchor.
- `66-85` meal: normal meal fits current state.
- `86-100` food-first: safety, recovery, low availability, or high risk.

The score rises with hunger, rising trend, low control, high Risk Budget,
`recoveryNeed`, `nutritionFloorRisk`, protein debt, very low intake, high-risk
time-of-day pattern, long gap vs personal history, and failed delays. It falls
with recent meal/satiety-lag, stable control, low risk, planned meal soon, and
successful history in similar contexts. Safety flags jump to food-first
regardless of hunger score.

## Edge-Case Modifiers

- Shift work / travel: use time since waking and meal rhythm, not clock labels.
- Time of day: use as a pattern modifier, not a rule; evening may raise risk for
  some users, morning may be rebound/ritual for others.
- Alcohol: lower confidence, raise rebound risk, avoid coffee-first framing.
- Medication context: if appetite/glucose is medication-affected, lower
  confidence and avoid fasting-style nudges.
- Cycle context: premenstrual hunger/cravings may raise risk; missing periods or
  cycle disruption with training/low intake is safety context.
- Social meal soon: prefer planned participation; use bridge snack only if it
  protects control.
- Post-meal hunger: if the user just ate, use a short satiety-lag re-check only
  when risk/safety are low.
- Night wake-to-eat pattern: raise risk, track pattern, avoid diagnosis
  language.
- Pattern-learning mode: keep claims as "possible driver" until thresholds pass.

## Action Selection

- Safety hard flag -> `doNotDelay`.
- Risk high -> `riskBrakeMeal` or `eatMeal`.
- Nutrition floor risk -> `eatMeal` or `proteinFiberFirst`.
- Recovery high -> `eatMeal` or `proteinFiberFirst`.
- Risk medium + uncertain hunger -> one checkpoint with snack plan.
- Risk low + stable state -> `delayWithCheck`, `hydratePause`, or `observe`.
- Coffee only if habitual, caffeine risk is low, and it is not late-day.
- If social meal is soon, avoid overfeeding now unless risk is high.
- If just ate and risk is low, re-check before adding more food.
- After one or two failed checkpoints -> food, not another postpone loop.

## Output Contract

Every decision returns:

- status label and confidence;
- `delayAllowed` and hard override if present;
- Risk Budget level and drivers;
- Food Priority score, level, and drivers;
- one suggested action;
- one short explanation;
- optional food kcal band;
- re-check interval if delaying;
- UI risk rail value and confidence;
- stop-delay signals;
- missing inputs that lowered confidence.

Low confidence can still produce guidance, but not aggressive delay.

## Re-Check Rules

- `hydratePause` / `coffeePause`: re-check in 15-40 minutes.
- `delayWithCheck`: re-check in 30-60 minutes.
- `riskBrakeMeal`: re-check outcome in 30-90 minutes.
- `eatMeal`: evaluate next hunger event, not immediate success/failure.

## Learning Rule

Store:

> context + last meal + status + risk + action -> outcome

Only promote a pattern after the thresholds in the concept are met. Weak
evidence stays "possible driver".
