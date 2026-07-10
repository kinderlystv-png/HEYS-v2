# Осознанность и баланс энергообмена — Food Priority v0

Companion for
[HUNGER_ENERGY_STATUS_DECISION_ENGINE.md](HUNGER_ENERGY_STATUS_DECISION_ENGINE.md).
This is a scoring contract, not clinical math.

## Purpose

Food Priority answers:

> "Given hunger + context + history, how strongly should HEYS recommend eating
> now?"

User-facing label: `Food Support Need`. Low score means "food is not strongly
recommended by context", not "you are forbidden to eat".

It must be allowed to disagree with hunger intensity:

- high hunger + recent meal + calm control -> checkpoint first;
- medium hunger + high stress + poor sleep + failed delays -> eat now;
- low hunger + low energy availability -> food-first/recovery prompt.

## Output

```ts
type FoodPriorityLevel = 'wait' | 'checkpoint' | 'snack' | 'meal' | 'foodFirst';

type FoodPriority = {
  score: number; // 0-100
  level: FoodPriorityLevel;
  confidence: 'low' | 'medium' | 'high';
  driversUp: string[];
  driversDown: string[];
  hardOverride?: string;
  missingInputs?: string[];
  dataFreshness?: 'fresh' | 'partial' | 'stale';
};
```

## Score Bands

- `0-20` wait: no food now; observe/hydrate if safe.
- `21-45` checkpoint: pause and re-check; snack fallback is visible.
- `46-65` snack: controlled bridge or protein/fiber anchor.
- `66-85` meal: normal meal fits current state.
- `86-100` food-first: safety, recovery, low availability, or high risk.

## Hard Overrides

Set level before normal scoring:

- safety symptoms or hypoglycemia risk -> `foodFirst` / `doNotDelay`;
- pregnancy/breastfeeding/minor/ED history/medical caution -> conservative
  food-first or professional-guidance path;
- active/past ED or repeated loss-of-control pattern -> no delay suggestions, no
  `0 kcal` band, no fasting-window language;
- `nutritionFloorRisk` -> minimum `meal`, usually `foodFirst`;
- hard training recovery + protein debt -> minimum `meal`;
- recent meal + low risk + good control -> cap at `checkpoint` for 15-30 min;
- planned social meal soon + low risk -> cap at `checkpoint` or `snack`.

## Base Score Draft

Start from hunger:

```text
base = hungerLevel * 4
```

Then adjust:

- hunger rising: `+8`; falling/stable after pause: `-8`;
- control 5-6: `+8`; control <=4: `+18`;
- Risk Budget selects the safe action family, but its band is not added to the
  score again; this avoids counting hunger, trend, and control twice;
- `fed`: `-15`; `postMealDecline`: `+5`;
- `deficitPressure`: `+12`; `reboundRisk`: `+14`;
- `recoveryNeed`: `+22`; `nutritionFloorRisk`: `+35`;
- protein debt: `+8`; very low intake day: `+18`;
- poor sleep: `+6`; very poor sleep: `+12`;
- high stress/bad mood: `+8`; strong craving: `+8`;
- high-risk time-of-day pattern: `+6`;
- recent meal: gradual reduction up to `-18`, based on time and meal quality;
- planned meal soon: `-8`, unless risk is high;
- successful wait history in similar context: `-8`;
- failed delay/uncontrolled history in similar context: `+12`.

Clamp to `0-100`.

When the daily energy target is already close, normal (non-safety, non-recovery)
food support is capped at `snack`; the food band remains at least `100-200` kcal
so the target never becomes a recommendation to ignore strong hunger.

## Food Band Matrix

- Safety override -> `foodFirst` / medical boundary; no delay.
- Suspected/confirmed hypoglycemia in diabetes/hypoglycemia/medication context
  -> `fastCarbSafety`, not protein/fiber waiting.
- Recovery need + protein debt -> `200-400` or `400-700` kcal.
- High risk + falling control -> `150-300` kcal `riskBrakeMeal`.
- Recent meal + low risk -> `0 kcal` + short re-check.
- Long gap + deficit pressure -> `200-400` kcal or meal.
- Planned meal within 60 min -> `100-200` kcal bridge only if needed.
- ED/restriction-sensitive profile -> food-first copy, no `0 kcal` band.

## Confidence Gates

- Missing `safetyFlags`: confidence max `medium`; do not recommend aggressive
  delay.
- Missing `controlLevel` when hunger >=6: confidence max `medium`; ask one quick
  control question.
- Missing last meal data: confidence max `medium`; use broader bands.
- Stale meal/training data: mark `dataFreshness: stale`; avoid precise food
  bands.
- Conflicting data, e.g. "recent meal" + "shaky/dizzy": safety wins.

## UI Contract

The modal shows three different things:

- Hunger: "what I feel";
- Risk: "what may happen if I keep delaying";
- Food Support Need: "how useful food looks now".

Food Priority copy should name the top 1-3 drivers:

> "Eat now: moderate hunger, poor sleep, skipped meal, and past evening rebounds
> make waiting risky."

or:

> "Checkpoint first: hunger is high, but you ate recently and control looks
> stable. Re-check in 20 minutes."
