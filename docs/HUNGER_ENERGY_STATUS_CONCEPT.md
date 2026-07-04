# Осознанность и баланс энергообмена

Technical name: Hunger & Energy Status Concept.

> Working concept for discussion. The document must stay compact: target 450-700
> lines maximum. If it grows beyond that, revise it into a denser version
> without losing core meaning. If the document becomes too tight even after
> compression, the limit may be raised slightly, but only with this rule updated
> explicitly.

## 1. Core Idea

HEYS should treat hunger as one signal inside broader energy-exchange awareness,
not as an automatic command to eat.

The product goal is to help the user understand:

- what kind of hunger they feel;
- what likely triggered it;
- whether food is probably needed now;
- what amount/type of food fits the current state;
- how the decision affects the average deficit without guilt or punishment.

User-facing metaphor:

> "My body may be asking for energy, comfort, rhythm, or recovery. HEYS helps me
> understand which one."

Working rule for this document: after each meaningful discussion insight, update
the concept so later implementation does not inherit contradictions.

## 2. Physiological Baseline

Working assumptions:

- Hunger does not mean the body has run out of energy.
- Some healthy adults may observe mild-to-moderate hunger briefly when no
  safety, recovery, medical, or distress signals apply; this is context, not a
  goal.
- Fat is not "turned on" only when hunger starts. Fat oxidation happens all the
  time; its share usually grows as insulin drops and time from meal increases.
- Early fasting is not a binary food-to-fat switch. It is a changing mix of
  digestion, glucose use, glycogen, insulin/glucagon balance, and fat oxidation.
- Hunger can come from energy need, but also from habit, empty stomach, ghrelin
  rhythm, poor sleep, stress, boredom, food cues, rapid glucose swings, or weak
  satiety in the previous meal.
- Morning hunger after a late caloric/sweet meal is not automatic food need. It
  can be a normal wake-up cue, empty-stomach signal, or rebound after a weakly
  satiating meal.

## 3. Product Principle

The feature should not say: "You are burning fat now", "ignore hunger", "you
need exactly X kcal", "the longer you wait, the better", or "hunger is
weakness".

The feature should say: "This hunger is likely physical / emotional / habitual /
recovery-driven", "your last meal probably still covers part of current needs",
"you can try a short pause if no red flags apply", "if you eat now, this
meal/snack size fits", and "if you wait, watch these signals."

## 4. Safety Boundaries

The system must stay conservative.

Do not recommend delaying food when the user reports dizziness, faintness,
shaking, confusion, nausea, pregnancy/breastfeeding, minor age, diabetes,
hypoglycemia risk, appetite/glucose-affecting medication, eating disorder
history, medical fasting restrictions, intense training recovery, illness,
unusually high fatigue, possible low energy availability, hunger 8-10 with
rising distress, or repeated restriction/binge pattern.

In these cases, the recommendation shifts from "observe" to "eat now" or "seek
medical guidance", depending on severity.

## 5. Hunger Event

A hunger event is a short check-in, not a diary essay.

Minimum for quick response:

- `time`
- `hungerLevel` from 0 to 10

Minimum for higher-confidence response:

- `controlLevel` from 0 to 10
- `safetyFlags`

Completed event adds:

- `actionTaken`
- `outcomeAfter30to90Min`

Richer fields:

- `hungerType`
- `bodySignals`
- `context`
- `lastMealDistance`

Suggested `hungerType` values:

- `physical`: stomach emptiness, steady hunger, food-neutral;
- `craving`: specific food, reward-seeking, urgent;
- `habit`: appears at usual time or ritual;
- `stress`: emotion, tension, need for relief;
- `fatigue`: sleepiness, low energy, poor focus;
- `rebound`: after high-GI / low-protein / low-fiber meal;
- `recovery`: after training or high activity.

Suggested context tags: sleep, stress, training today/yesterday, hydration,
caffeine/alcohol, food cues, social situation, late meal, sweet meal, time since
last meal, clock time, time since waking, usual meal rhythm, planned meal soon,
current deficit pressure, cycle/premenstrual context if relevant, medication
context if relevant.

Scale anchors:

- `0`: no hunger;
- `3`: mild, easy to ignore;
- `5`: clear hunger, still calm;
- `7`: strong hunger, harder to choose well;
- `10`: urgent/distressing or unsafe.

Separate ratings:

- hunger: body signal for food;
- appetite: general interest in eating;
- craving: specific food/reward pull;
- fullness: stomach/content signal;
- control: ability to choose calmly.

## 6. Energy Status

Energy Status is an estimate, not a lab value.

Labels:

- `fed`: recent meal is still active;
- `postMealDecline`: meal energy is fading, hunger may begin;
- `stableBetweenMeals`: normal gap, enough reserve, watch trend;
- `deficitPressure`: accumulated deficit or long gap increases food priority;
- `recoveryNeed`: training/illness/fatigue makes food more useful now;
- `nutritionFloorRisk`: intake/recovery looks too low for more delay;
- `reboundRisk`: meal pattern may provoke stronger hunger or overeating.

Example: if the user wakes hungry after eating sweet/caloric food at 01:00 and
has no safety symptoms, Energy Status should usually reduce immediate urgency
and suggest a short re-check before food.

Inputs: clock time, time since waking, usual meal rhythm, time since last meal,
meal kcal/macros, protein, fiber, fat, carbohydrate quality, insulin wave
estimate, current day calories vs target, 3-day caloric debt/excess,
activity/training load, sleep, stress, medication/cycle context if relevant, and
previous hunger outcomes.

Outputs: Energy Status label, confidence, likely drivers, suggested action,
meal/snack size if eating, and safety note if delaying food is a bad idea.

Risk Budget is separate from energy need. Longer gaps can be useful when the
user is stable, but can increase rebound/binge risk when combined with high
hunger, poor sleep, stress, bad mood, low focus, strict restraint history,
training recovery, or repeated failed delays.

Risk Budget inputs: hunger trend, self-rated control, mood, stress, sleep,
energy, focus, irritability, previous delay outcomes, and recent restriction.

## 7. Link With Insulin Wave

The existing insulin wave becomes one layer inside Energy Status.

Useful mapping:

- high active wave: food is still being processed; hunger may be cue, craving,
  stress, or meal-quality issue;
- falling wave: transition into between-meals state; hunger can be normal;
- low wave with stable signals: reasonable moment for planned deficit if the
  user feels okay;
- low wave with high distress or long deficit: food priority rises.

Key warning:

> Low insulin-wave estimate + poor sleep + high stress + strong craving means
> "high overeating risk", not simply "good fat-burning window".

## 8. Fluids & Coffee

Water, unsweetened tea, black coffee, and non-caloric electrolytes are not food
in the energy model: they add little/no kcal and do not solve true energy need.
They can still change the felt signal by reducing thirst, stomach emptiness,
sleep inertia, sweat/alcohol-related dehydration, or ritual hunger.

Caffeine can temporarily reduce appetite, increase alertness, and slightly shift
energy expenditure/fat oxidation, but this is a weak bridge signal, not a meal
replacement or proof that the body "does not need food".

Rule: use water/tea as a low-risk checkpoint only when no safety symptoms apply.
If hunger fades, thirst, ritual, fatigue, satiety lag, or context may have
contributed; do not infer certainty from one event. Coffee is allowed only when
habitual and low-risk. Coffee with sugar, honey, milk, cream, or syrup is food.

Avoid `coffeePause` when anxiety, palpitations, very poor sleep, late-day
timing, alcohol recovery, or caffeine sensitivity is present.

## 9. Relation To Intermittent Fasting

This logic is related to intermittent fasting / time-restricted eating, but it
should not be framed as a fasting feature by default.

Difference:

- intermittent fasting is schedule-first: eat inside a chosen window;
- Energy Status is state-first: decide from hunger, last meal, risk, recovery,
  deficit, sleep, stress, and safety signals.

The feature can support a fasting-style habit by helping the user extend a meal
gap safely, but it should not reward fasting for its own sake. Evidence suggests
time-restricted eating often helps mainly because it reduces total intake and
snacking; metabolic advantages are mixed and not a magic fat-loss switch.

Evidence notes live in
[HUNGER_ENERGY_STATUS_EVIDENCE.md](HUNGER_ENERGY_STATUS_EVIDENCE.md); this
concept keeps only product implications.

Product rule: treat fasting windows as optional context, not as the command
source. If the fasting window conflicts with safety, recovery, or high rebound
risk, Energy Status overrides the window and recommends food.

Conflict priority:

1. Safety and medical flags.
2. Loss-of-control / rebound risk.
3. Low energy availability, training, illness, or recovery need.
4. Sustainable weekly deficit.
5. Meal timing / fasting-window preference.
6. Insulin-wave optimization.

Lower-priority signals must never overrule higher-priority risk.

## 10. Control Logic

Control loop:

1. Notice hunger.
2. Classify hunger type and intensity.
3. Estimate Energy Status.
4. Estimate rebound/binge Risk Budget.
5. Choose a response.
6. Re-check after 30-90 minutes.
7. Learn which triggers are real for this user.

Decision order is specified in
[HUNGER_ENERGY_STATUS_DECISION_ENGINE.md](HUNGER_ENERGY_STATUS_DECISION_ENGINE.md).
Risk scoring lives in
[HUNGER_ENERGY_STATUS_RISK_BUDGET.md](HUNGER_ENERGY_STATUS_RISK_BUDGET.md). Food
Priority scoring lives in
[HUNGER_ENERGY_STATUS_FOOD_PRIORITY.md](HUNGER_ENERGY_STATUS_FOOD_PRIORITY.md).

Possible responses:

- `eatMeal`: normal meal;
- `eatSnack`: planned small snack;
- `proteinFiberFirst`: protein/fiber anchor before carbs;
- `hydratePause`: water/tea and 15-30 minute pause;
- `coffeePause`: black coffee as a short checkpoint, not as food replacement;
- `moveBriefly`: light walk/mobility if stress or craving;
- `restOrSleep`: if fatigue-driven;
- `delayWithCheck`: wait 30-60 minutes and re-check;
- `riskBrakeMeal`: small protein/fiber meal to prevent later loss of control;
- `doNotDelay`: safety or high-risk state.

The system should prefer small, practical moves over willpower framing.

Morning-after rule: after a late sweet/caloric meal, if hunger <=6, control is
okay, and no safety symptoms apply, suggest water/tea and 20-30 minutes of
observation. Coffee is optional only if habitual and low-risk. If eating, prefer
protein/fiber over another sweet trigger.

Delay rule: extending the gap is useful only while Risk Budget stays low or
medium. If hunger keeps rising, mood worsens, stress is high, or the user starts
thinking in all-or-nothing terms, switch from "wait" to `riskBrakeMeal`.

## 11. Food Amount Logic

The product should estimate "how much food makes sense now", not just "eat/don't
eat".

Food-size bands:

- `0 kcal`: no food now, only if safe and low urgency;
- `100-200 kcal`: bridge snack;
- `200-400 kcal`: controlled snack / small meal;
- `400-700 kcal`: normal meal;
- `700+ kcal`: recovery or planned high-need meal.

The band depends on remaining calories today, accumulated caloric debt, protein
debt, training/recovery context, time until next planned meal, hunger trend, and
binge/rebound risk.

Minimum floor rule:

> Remaining kcal is not allowed to overrule recovery, protein debt, very low
> intake, medical caution, or low energy availability signals.

Key rule:

> A small snack can be the better deficit decision if it prevents a later
> uncontrolled meal.

Risk rule:

> The best deficit is the one the user can still control two hours later.

## 12. Trigger Learning

HEYS should learn personal hunger patterns.

Examples:

- hunger spikes 2-3 hours after low-protein breakfast;
- evening craving after sleep under 6 hours;
- hunger after high-GI lunch without fiber;
- morning hunger after late sweet food;
- stress hunger after meetings;
- training-day hunger delayed by 4-8 hours;
- premenstrual hunger/cravings for this user, if cycle tracking is relevant;
- caffeine suppresses hunger, then rebound appears.

Example output:

> "Your strongest hunger trigger this week: low-protein first meal. Fix: add
> 25-35 g protein before 12:00."

## 13. UI Shape

First version can be a bottom-right FAB next to the messenger FAB. Tapping it
opens a thumb-friendly modal with three linked indicators:

- Hunger slider: manual vertical 0-10 input from the user;
- Risk rail: computed rebound/safety/control risk from context and history;
- Food Support Need: user-facing label for computed Food Priority.

Food Priority is not the same as hunger and does not mean "permission to eat".
It combines hunger level, Risk Budget, Energy Status, time of day, wake rhythm,
recovery/nutrition floor, remaining kcal, planned meals, and personal outcomes.
High hunger can still produce "re-check first" after a recent meal; medium
hunger can produce "eat now" when risk or recovery is high.

The FAB stack must reserve safe-area spacing and avoid covering bottom
navigation, chat input, or primary meal actions. The slider should snap to
anchors 0 / 3 / 5 / 7 / 10, support tap selection, and have an accessible
fallback. If confidence is low, ask only 1-2 missing questions, such as "control
okay?" or "dizzy/shaky?"

The modal must feel like a status dashboard, not a judgment screen. It should
explain "what is probably happening" and "what to do now" in one glance.

Example status copy:

> Hunger 6/10. Food support: checkpoint. Risk: low. Likely drivers: 4h after
> low-fiber meal + stress. Best move: 20 min pause; eat 150-250 kcal protein
> snack if focus keeps dropping.

## 14. Data Model Draft

```ts
type HungerType =
  | 'physical'
  | 'craving'
  | 'habit'
  | 'stress'
  | 'fatigue'
  | 'rebound'
  | 'recovery';

type HungerAction =
  | 'observe'
  | 'hydratePause'
  | 'coffeePause'
  | 'moveBriefly'
  | 'restOrSleep'
  | 'delayWithCheck'
  | 'riskBrakeMeal'
  | 'eatSnack'
  | 'eatMeal'
  | 'proteinFiberFirst'
  | 'doNotDelay';

type GoalMode =
  | 'fatLoss'
  | 'maintenance'
  | 'trainingRecovery'
  | 'medicalCaution'
  | 'patternLearning';

type SafetyFlag =
  | 'dizzy'
  | 'faint'
  | 'shaky'
  | 'confused'
  | 'nausea'
  | 'diabetes'
  | 'hypoglycemiaRisk'
  | 'glucoseAffectingMedication'
  | 'pregnantOrBreastfeeding'
  | 'minor'
  | 'activeOrPastEatingDisorder'
  | 'medicalFastingRestriction'
  | 'illness'
  | 'possibleLowEnergyAvailability'
  | 'hardTrainingRecovery'
  | 'lossOfControlRisk';

type SafetyOverride =
  | 'foodNow'
  | 'fastCarbSafety'
  | 'medicalBoundary'
  | 'curatorReview'
  | 'delayForbidden';

type HungerEvent = {
  id: string;
  clientId: string;
  createdAt: string;
  hungerLevel: number;
  fullnessLevel?: number;
  cravingLevel?: number;
  controlLevel?: number;
  hungerType?: HungerType;
  bodySignals?: string[];
  contextTags?: string[];
  lastMealAt?: string;
  stressLevel?: number;
  mood?: 'good' | 'neutral' | 'bad';
  energyFocus?: 'ok' | 'dropping' | 'bad';
  sleepQuick?: 'good' | 'poor' | 'veryPoor';
  safetyFlags?: SafetyFlag[];
  wakeAt?: string;
  plannedMealAt?: string;
  trainingRecovery?: 'none' | 'light' | 'hard' | 'veryHard';
  cycleContext?: 'none' | 'premenstrual' | 'period' | 'unknown';
  medicationContext?: 'none' | 'appetiteOrGlucoseAffecting' | 'unknown';
  nutritionFloorRisk?: boolean;
  checkpointAttemptCount?: number;
  checkpointStartedAt?: string;
  checkpointEndsAt?: string;
  decisionVersion?: string;
  source?: 'user' | 'curator' | 'system';
  inputFreshnessSec?: number;
  actionTaken?: HungerAction;
  outcomeAt?: string;
  outcomeHungerLevel?: number;
  outcomeControlLevel?: number;
  outcomeDistressLevel?: number;
  uncontrolledEpisode?: boolean;
  note?: string;
};

type EnergyStatusLabel =
  | 'fed'
  | 'postMealDecline'
  | 'stableBetweenMeals'
  | 'deficitPressure'
  | 'recoveryNeed'
  | 'nutritionFloorRisk'
  | 'reboundRisk';

type EnergyStatus = {
  label: EnergyStatusLabel;
  confidence: 'low' | 'medium' | 'high';
  goalMode: GoalMode;
  likelyDrivers: string[];
  riskBudget: {
    level: 'unknown' | 'low' | 'medium' | 'high' | 'stop';
    drivers: string[];
  };
  foodPriority: {
    score: number; // 0-100, practical usefulness of eating now
    level: 'wait' | 'checkpoint' | 'snack' | 'meal' | 'foodFirst';
    drivers: string[];
  };
  suggestedAction: HungerAction;
  delayAllowed: boolean;
  hardOverride?: SafetyOverride;
  evidenceLevel: 'low' | 'moderate' | 'high';
  requiresCuratorReview?: boolean;
  copyRisk?: 'normal' | 'avoidRestrictionLanguage' | 'foodFirstOnly';
  foodBandKcal?: [number, number];
  explanation: string;
  recheckAfterMin?: [number, number];
  stopDelaySignals?: string[];
  missingInputs?: string[];
  safetyNote?: string;
};
```

## 15. Success Criteria

The feature is useful if the user can answer:

- "Why am I hungry right now?"
- "Is it reasonable to wait?"
- "If I eat, what size/type of food fits the goal?"
- "Which patterns make my hunger harder to control?"
- "How do I keep a weekly deficit without provoking rebound?"

The feature fails if it becomes fasting encouragement, exact metabolic fantasy,
guilt layer, manual logging burden, or another calorie screen with different
words.

Companion docs: scenarios, acceptance, review, input/privacy, risk scoring, Food
Priority scoring, and FAB UX. Any implementation must pass them.

## 16. Five Decision Blocks

### 16.1 Risk Thresholds

Risk is not "how long since food". Risk is whether the user is likely to lose
control if the gap continues.

- `low`: hunger <=5, stable/falling trend, mood okay, stress manageable, focus
  okay, no safety symptoms, no recent failed delay. Action: checkpoint or wait.
- `medium`: hunger 6-7, rising trend, poor sleep, stress, irritability,
  cravings, long gap, or known rebound pattern. Action: short checkpoint with
  snack plan.
- `high`: hunger 8-10, loss-of-control feeling, all-or-nothing thoughts,
  dizziness/weakness, high stress + poor sleep, low energy availability concern,
  repeated failed delays, or restriction/binge history. Action: `riskBrakeMeal`
  or `doNotDelay`.

The system should not maximize fasting duration. It should maximize controlled
state 1-2 hours later.

### 16.2 User State Inputs

The quick check-in should be small enough to use while hungry.

Core ratings:

- hunger 0-10;
- control 0-10: "can I choose calmly?";
- stress 0-10;
- mood: good / neutral / bad;
- energy/focus: okay / dropping / bad;
- craving: none / mild / strong / specific;
- sleep: good / poor / very poor.

Optional tags: late meal, sweet meal, training, alcohol, caffeine, social cue,
work pressure, boredom, hydration, planned meal soon, medication context, cycle
phase if relevant.

Rule: if the user gives only hunger level, HEYS can still respond, but
confidence is lower and the recommendation should be more conservative.

### 16.3 Personal History

HEYS should learn a personal trigger map:

> context + last meal + state + action -> outcome after 30-90 minutes.

Useful learned patterns:

- this user rebounds after late sweet food;
- this user can wait after black coffee only when sleep was good;
- this user overeats after skipping breakfast on stressful days;
- this user needs a protein/fiber brake after training evenings;
- this user handles 4-5 hour gaps well but not 7-8 hour gaps.

The product should prefer personal evidence over generic diet rules once enough
events exist.

### 16.4 Action Ladder

Actions should form a ladder, not a binary "eat / do not eat".

1. `observe`: no food, just notice and re-check.
2. `hydratePause`: water/tea, 15-30 minutes.
3. `coffeePause`: black coffee, short checkpoint, not a meal replacement.
4. `moveBriefly` / `restOrSleep`: when stress or fatigue is the driver.
5. `riskBrakeMeal`: 100-300 kcal protein/fiber snack to preserve control.
6. `eatMeal`: normal meal when true need, recovery, or high risk is present.
7. `doNotDelay`: safety symptoms or high loss-of-control risk.

No endless postpone loops: after one or two failed checkpoints, switch to food.

`riskBrakeMeal` should usually avoid fast sugar as the main component. Prefer a
protein/fiber anchor that reduces urgency without pretending to be a full meal.

Post-meal hunger should allow a short satiety-lag re-check if the user just ate
and has no safety/risk flags; it should not become automatic extra restriction.

### 16.5 UI Placement

Best shape is layered: quick FAB modal, Energy Status widget, meal-screen
explanation, and morning/evening pattern summary. Calculation updates after
meals, hunger events, check-ins, training, and major state changes. Avoid
unsolicited "keep fasting" notifications; use reminders only after the user
starts a checkpoint. Every UI surface answers: why, what now, when to re-check.

## 17. Final Guardrails & Contracts

### 17.1 Anti-Obsession Rules

The feature must reduce automatic eating, not create automatic restriction.

Do not build:

- fasting streaks;
- "perfect hunger control" scores;
- leaderboards or badges for longest gap;
- shame copy after eating;
- more than two postpone loops for the same hunger event;
- daily pressure to log every hunger signal.

Good copy: "You chose a control-preserving meal." Bad copy: "You failed your
fast."

### 17.2 Personalization Threshold

Before enough data exists, HEYS says "possible driver", not "your pattern".

Suggested thresholds:

- `hypothesis`: 2-3 matching events;
- `candidatePattern`: 4+ events across at least 3 days;
- `likelyPattern`: 6+ events across at least 7 days;
- `strongPattern`: 10+ events across at least 14 days;
- `retiredPattern`: pattern not seen for 30+ days or contradicted repeatedly.

Personal evidence overrides generic rules only at `likelyPattern` or higher.
Sensitive binge/restriction/ED patterns use safety prompts, not labels.

### 17.3 Outcome Metrics

Success is not "more fasting".

Track:

- fewer uncontrolled meals;
- fewer late sweet rebound episodes;
- higher planned-deficit adherence over 7-14 days;
- lower hunger distress;
- fewer all-or-nothing episodes;
- stable protein/fiber anchors;
- preserved training recovery and mood.

Do not optimize directly for weight, fasting duration, or lowest kcal at the
single-event level.

### 17.4 Goal Modes

Energy Status should adapt to the user's current goal:

- `fatLoss`: protect average deficit, but never at the cost of high rebound
  risk;
- `maintenance`: prioritize rhythm, stable mood, and fewer uncontrolled meals;
- `trainingRecovery`: raise food priority after hard sessions and protein debt;
- `medicalCaution`: conservative defaults, no fasting-style nudges;
- `patternLearning`: first 1-2 weeks, collect outcomes before strong claims.

If no mode is set, default to `maintenance` behavior with gentle deficit support
only when the user's existing calorie target already implies it.

### 17.5 Integration Contracts

Before implementation, bind explicit inputs from existing HEYS modules: insulin
wave, caloric balance, protein/fiber debt, nutrition floor, meal history,
morning check-in, training/recovery, safety profile, and context tags.

Fail-closed rule: if a safety input is missing or ambiguous, do not recommend
aggressive delay.

### 17.6 Sensitive Data & Privacy

Medical flags, eating disorder history, pregnancy/breastfeeding, loss-of-control
patterns, and medication context are sensitive. They should be stored only when
needed, scoped to the current client, and shown with calm language.

Do not infer or label eating disorders from behavior alone. Use wording like
"this pattern may need extra support" rather than "you have X".

### 17.7 Edge-Case Defaults

- Shift work / travel: use time since sleep and meal rhythm, not clock-only
  morning/evening labels.
- Alcohol: raise rebound risk and lower confidence in hunger interpretation.
- Illness or medication effects: avoid delay recommendations unless explicitly
  safe for the user.
- Cycle context: premenstrual hunger/cravings can be a normal modifier; missing
  periods or cycle disruption with training/low intake is a safety concern.
- Social meals: support planned participation; do not frame eating as failure.
- Night eating: detect repeated night wake-to-eat separately from normal hunger.
- Training days: protect recovery before deficit optimization.
- Very low intake day: avoid extra delay even if insulin wave is low.
- Post-meal hunger: if the user just ate, allow a short satiety-lag re-check
  unless safety/risk says to eat more now.

### 17.8 Medical Boundary

This is behavior support, not diagnosis or treatment. For diabetes, hypoglycemia
risk, pregnancy/breastfeeding, minors, appetite/glucose-affecting medication,
active eating disorder, past eating disorder, possible low energy availability,
or repeated loss-of-control eating, default to conservative food-first guidance
and suggest professional support where appropriate.

## 18. Implementation Plan

Build order: data and pure decisions first, UI after fixtures pass.

1. Source mapping: bind runtime selectors/functions for meals, day totals,
   insulin wave, check-in, training, cycle, history, and stale markers.
2. Pure engine: implement Energy Status, Risk Budget, Food Priority, safety
   overrides, confidence, freshness, action selection, and explainability.
3. Fixtures: convert scenario/acceptance rows into deterministic tests before
   UI; failing safety, stale-data, or divergence scenarios block release.
4. Storage: add Hunger Events, outcomes, pattern thresholds, client scoping,
   sensitive-data retention, edit/delete behavior, and outcome follow-up.
5. Integration adapters: feed the engine from HEYS modules without business
   logic inside UI; expose one stable `EnergyStatusDecision` output.
6. FAB modal: render hunger slider, risk rail, Food Priority rail, context
   chips, checkpoint timer, food band, action, and outcome capture.
7. Product surfaces: connect meal screen, Energy Status widget, summaries, and
   re-check reminders without unsolicited fasting prompts.
8. QA gates: pass fixtures, mobile one-hand smoke, accessibility fallback,
   no-overlap layout, privacy review, legacy insulin-wave copy audit, and
   anti-obsession copy review.

Release rule: ship only when the engine explains why now, eat/wait, how much,
what risk changed, and when to re-check without violating safety priority.
