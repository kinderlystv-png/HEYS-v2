# Осознанность и баланс энергообмена — Review Pass

Review companion for
[HUNGER_ENERGY_STATUS_CONCEPT.md](HUNGER_ENERGY_STATUS_CONCEPT.md). Keep this
file compact; if it becomes long, fold decisions back into the concept,
scenarios, or decision engine.

## Concept Status

Final v0 / engine-ready. Pure engine implementation can start. UI/release remain
blocked until acceptance fixtures pass and legacy insulin-wave copy/code is
audited.

## Closed In Current Concept

- Name updated from hunger-only framing to "Осознанность и баланс энергообмена";
  hunger is now one signal inside Energy Status.
- State-first logic is explicit: safety, risk, recovery, deficit, timing, then
  insulin/fasting optimization.
- Risk Budget is separate from energy need and can override low insulin-wave
  "good window" interpretations.
- Fluids/coffee are checkpoints, not food replacement or proof that food is not
  needed.
- Intermittent fasting is optional context, not the command source.
- FAB modal is defined: bottom-right entry, vertical hunger slider, computed
  risk rail, Food Priority score, minimal missing-context prompts, safe-area
  placement.
- Low energy availability / `nutritionFloorRisk` is now a first-class stop
  condition.
- Appetite/glucose-affecting medication lowers confidence and blocks
  fasting-style nudges.
- Cycle/premenstrual context is personalization only; missing periods with low
  intake/training are safety context.
- Post-meal hunger has a satiety-lag re-check path.
- Scenario suite now includes safety, rebound, social, shift-work, alcohol,
  medication, cycle, low availability, satiety-lag, mobile-input, and Food
  Priority divergence cases.
- Food Priority has a v0 scoring contract: bands, modifiers, hard overrides,
  confidence gates, and data freshness.
- Risk Budget has a v0 scoring contract: bands, hard overrides, confidence
  gates, and UI risk rail behavior.
- Input/privacy contract defines candidate HEYS sources, freshness rules,
  missing-data behavior, and sensitive-data handling.
- FAB modal has a v0 UX contract: entry, layout, interaction states, missing
  context prompts, accessibility, and anti-obsession rules.
- Acceptance fixtures define expected bands/actions/confidence for all
  scenarios.
- Latest audit adopted stricter safety overrides, removed low availability from
  hunger types, softened Food Priority copy, and added ED-sensitive handling.
- Final audit added engine invariants, narrowed `fastCarbSafety`, and expanded
  fixture DoD fields.

## Implementation Follow-Ups

- Visual implementation details: final icon, spacing, animation, and responsive
  polish.
- Risk rail calibration: tune v0 thresholds against real outcomes without
  allowing hunger alone to define risk.
- Food Priority calibration: tune v0 weights against real outcomes without
  breaking hard safety overrides.
- Implementation source mapping: bind candidate inputs to exact runtime
  functions/selectors.
- Privacy implementation: exact storage keys, retention, edit/delete UI.
- Copy implementation: enforce wording rules in final UI strings.
- Test implementation: convert acceptance matrix into automated fixtures.
- Release blocker: remove legacy "fat-burning window" insulin-wave copy/code
  before exposing this feature in UI.

## Final Readiness Definition

The concept is implementation-ready only when:

- the main concept stays within its compactness rule;
- every Energy Status label is represented in decision logic and scenarios;
- every safety flag has a conservative action;
- the FAB modal can produce a useful response from hunger level alone, but never
  an aggressive delay without safety/control context;
- Food Priority can diverge from hunger level when context/history requires it;
- all 27 scenarios pass without contradiction;
- acceptance fixture bands exist for all scenarios;
- evidence notes support major medical/safety claims;
- input freshness and sensitive-data behavior are explicit;
- FAB modal interaction and accessibility contract are explicit;
- unresolved choices are product/design details, not conceptual contradictions.
