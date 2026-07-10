# Hunger & Energy Status — Offline Calibration v1

Companion for
[HUNGER_ENERGY_STATUS_DECISION_ENGINE.md](HUNGER_ENERGY_STATUS_DECISION_ENGINE.md).

## Purpose

Calibration checks whether recommendation families and active factors agree with
later outcomes. It produces review candidates; it never rewrites production
weights automatically.

## Outcome Sources

1. Explicit follow-up outcome, when present.
2. Conservative next-event inference:
   - delay + no meal + hunger falls by at least 2 -> wait success;
   - delay + no meal + hunger rises by at least 2 -> under-support;
   - food action + meal recorded + hunger falls by at least 2 -> food success;
   - food action + meal recorded + hunger rises by at least 2 -> under-support.

Pairs outside `15-360` minutes and ambiguous meal/action sequences are excluded.
Safety fast-carb events are excluded from normal calibration.

## Follow-up Lifecycle

- Delay advice stores a persistent `dueAt` from `recheckAfterMin` (30 minutes by
  default).
- Food advice stays `waiting_for_meal`; its `dueAt` is set to 45 minutes after
  the first recorded meal within 6 hours of the recommendation.
- The open app uses the same timestamp for its timer and checks overdue items
  again on boot, sync, visibility, and client changes.
- The reminders cron reads the cloud-synced event and sends Web Push to an
  existing subscription outside quiet hours. The push opens
  `?openHungerFollowUp=1`.
- One recommendation can send at most one Web Push. The in-app question can be
  postponed once; the second postponement dismisses it until a new assessment.
- Answers are written to `outcomePlan.userReported`; unanswered follow-ups
  expire after 12 hours and never block a new assessment.

## Readiness Gates

- Overall report: at least 12 rated outcomes across 5 days.
- Action-family review: at least 6 rated outcomes across 3 days.
- Factor review: at least 6 rated exposures across 3 days.
- High factor confidence: at least 12 exposures across 5 days.

Before the gates, the report status is `collecting` and no factor direction is
treated as a recommendation.

## Output

`HEYS.HungerEnergyCalibration.evaluate(rows)` returns:

- decision and rated-outcome counts;
- explicit/inferred outcome counts and coverage;
- success, under-support, and over-support rates for delay/food actions;
- factor diagnostics from saved decision traces;
- review flags with sample size and confidence;
- `autoAdjustmentAllowed: false` as a fail-closed invariant.

## Interpretation Boundary

The report is observational. A flagged factor is a candidate for fixture review
and offline weight tuning, not proof of causality. Any weight change requires a
separate code change plus acceptance/regression tests.

## UI Contract

Calibration stays in technical diagnostics because it does not change the
current recommendation. The panel shows outcome coverage and review candidates;
the normal user flow remains unchanged.
