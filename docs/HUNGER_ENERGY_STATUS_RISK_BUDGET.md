# Осознанность и баланс энергообмена — Risk Budget v0

Companion for
[HUNGER_ENERGY_STATUS_DECISION_ENGINE.md](HUNGER_ENERGY_STATUS_DECISION_ENGINE.md).
This defines the computed risk rail shown beside the hunger slider.

## Purpose

Risk Budget answers:

> "If the user keeps delaying food, how likely is control, safety, mood, focus,
> or later eating behavior to worsen?"

Risk is not hunger intensity:

- high hunger + calm control can stay medium risk;
- moderate hunger + low control + stress + failed delay history can be high
  risk;
- safety-like symptoms make risk irrelevant because delay should stop.

## Output

```ts
type RiskBudget = {
  score: number; // 0-100
  level: 'unknown' | 'low' | 'medium' | 'high' | 'stop';
  confidence: 'low' | 'medium' | 'high';
  driversUp: string[];
  driversDown: string[];
  hardOverride?: string;
  missingInputs?: string[];
};
```

## Risk Bands

- `0-25` low: delay/checkpoint is probably okay if Energy Status agrees.
- `26-55` medium: short checkpoint only, snack fallback visible.
- `56-79` high: avoid more delay; use `riskBrakeMeal` or meal.
- `80-100` stop: safety/loss-of-control concern; `doNotDelay`.

## Hard Overrides

- dizziness, shaking, faintness, confusion, nausea -> `stop`;
- control <=3 with hunger >=6 -> minimum `high`;
- two confirmed failed checkpoints today -> minimum `high`;
- active/past ED or repeated loss-of-control pattern -> minimum `high`; no
  fasting-style delay suggestions;
- diabetes/hypoglycemia risk/relevant medication -> `stop` or medical caution;
- low energy availability concern -> minimum `high`;
- alcohol + poor sleep + morning symptoms -> minimum `medium`.

## Base Score Draft

```text
base = hungerLevel * 2
```

Then adjust:

- hunger rising: `+8`; falling/stable: `-8`;
- control 5-6: `+10`; control <=4: `+22`;
- strong craving/specific food pull: `+10`;
- stress high: `+10`; bad mood/irritability: `+8`;
- poor sleep: `+8`; very poor sleep: `+14`;
- long gap vs personal history: `+8`;
- skipped planned meal: `+4`;
- known rebound pattern: `+12`;
- failed delay history in similar context: `+14`; two real recent checkpoints:
  `+10` and minimum `medium`;
- all-or-nothing thoughts: `+18`;
- training recovery/protein debt: `+8`;
- good control: `-8`; stable focus adds `-4`;
- recent meal: gradual protection up to `-12`, based on time, kcal, protein,
  fiber, and meal quality;
- successful wait history in similar context: `-8`.

Clamp to `0-100`, then apply hard overrides.

Hunger `8+` alone sets only a `medium` checkpoint floor. It does not create
`high` risk without low control, failed delays, safety, or another risk driver.

## Confidence Gates

- Missing safety flags: confidence max `medium`.
- Missing control level: confidence max `medium`, and risk cannot be shown as
  confidently low when hunger >=6.
- Missing history: use generic thresholds; do not claim a personal pattern.
- Missing last-meal data: avoid low-risk certainty if hunger is rising.

## UI Contract

The risk rail is computed, not manually dragged. It should show:

- level color/state;
- top 1-3 drivers;
- stop-delay signals;
- "why not wait" copy when high.

Good copy:

> "Risk rising: poor sleep, stress, and past skipped-meal rebounds."

Bad copy:

> "You have low willpower."
