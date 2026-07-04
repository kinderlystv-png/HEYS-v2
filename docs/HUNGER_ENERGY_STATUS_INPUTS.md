# Осознанность и баланс энергообмена — Inputs & Privacy

Companion for
[HUNGER_ENERGY_STATUS_CONCEPT.md](HUNGER_ENERGY_STATUS_CONCEPT.md). This defines
data inputs without locking implementation to one file.

## Input Contract

| Input                         | Candidate HEYS source                    | Freshness                 | If missing/stale            |
| ----------------------------- | ---------------------------------------- | ------------------------- | --------------------------- |
| Hunger level/control/symptoms | new Hunger Event                         | current event             | ask 1-2 modal questions     |
| Last meal and meal timing     | `heys_dayv2_{date}.meals`                | today/current wake cycle  | no precise food band        |
| Day totals kcal/prot/fiber    | day totals / nutrition state             | after meal update         | lower confidence            |
| Insulin wave                  | insulin-wave modules/data                | after meal update         | do not use wave as driver   |
| Sleep/stress/mood             | morning check-in / `DayRecord`           | current day or last sleep | ask if risk depends on it   |
| Training/recovery             | `DayRecord.trainings` / training modules | today/yesterday           | avoid recovery confidence   |
| Hydration/alcohol/caffeine    | day context or quick tags                | current day               | use conservative checkpoint |
| Cycle context                 | cycle state if enabled                   | current cycle day         | treat as absent if disabled |
| Planned meal/social context   | quick tag / planner                      | current event             | avoid over-planning         |
| Medication/medical caution    | safety profile / quick flag              | profile or event          | conservative food-first     |
| Personal history              | prior Hunger Events + outcomes           | rolling 30-60 days        | generic rules only          |

## Existing Data Anchors

- `DayRecord` uses `heys_dayv2_{YYYY-MM-DD}` and includes sleep, mood, stress,
  water, meals, trainings, cycle day, and refeed fields.
- Day totals include `kcal`, `prot`, `fiber`, carbs, fat, and related nutrition
  aggregates.
- Existing docs list insulin-wave, caloric balance, cycle, meal recommender, and
  pattern modules as candidate integration points.

## Freshness Rules

- Current event inputs are fresh only for that hunger event.
- Meal/insulin/totals are stale after meal edits, date switches, client
  switches, or failed sync.
- Sleep/stress are stale after a new sleep cycle unless refreshed.
- Training/recovery can affect the same day and the next day.
- Personal patterns decay: recent 30-60 days count more than older history.

## Sensitive Data

Sensitive:

- safety symptoms;
- eating disorder history or loss-of-control pattern;
- diabetes/hypoglycemia/medication context;
- pregnancy/breastfeeding/minor status;
- cycle context;
- repeated night-eating pattern.

Rules:

- store only if needed for this feature;
- scope by `clientId`;
- allow user-visible edit/delete;
- do not infer diagnoses;
- use safety language, not labels;
- never use sensitive flags for gamification or streaks.

## Missing-Data Behavior

The system can always respond to hunger level, but:

- no safety data -> no aggressive delay;
- no control level with hunger >=6 -> ask control question;
- no last meal -> avoid precise kcal band;
- no history -> say "possible driver", not "your pattern";
- stale data -> show lower confidence and ask minimal context.
