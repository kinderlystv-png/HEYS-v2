# Осознанность и баланс энергообмена — FAB Modal UX v0

Companion for
[HUNGER_ENERGY_STATUS_CONCEPT.md](HUNGER_ENERGY_STATUS_CONCEPT.md). This defines
the first usable UI shape.

## Entry

- Bottom-right FAB near messenger FAB.
- FAB icon should signal hunger/energy, not fasting.
- Respect safe-area, bottom nav, chat input, and meal action buttons.
- Do not show unsolicited "keep fasting" prompts.

## Modal Layout

The modal is a compact bottom/right sheet optimized for one hand.

Right side:

- vertical Hunger slider, 0-10;
- snap anchors: 0 / 3 / 5 / 7 / 10;
- tap selection fallback, not drag-only.

Near the slider:

- computed Risk rail;
- computed Food Support Need rail;
- confidence indicator.

Main content:

- Energy Status label;
- top 1-3 drivers;
- recommended action;
- food band if eating is recommended;
- re-check timer if delaying.

## Interaction

- Slider movement updates Hunger immediately.
- Risk and Food Support Need recompute live from context/history.
- If confidence is low, ask only 1-2 missing questions.
- Safety question has priority over all other prompts.
- After action selection, collapse into a small active checkpoint/timer state.

## Missing-Context Prompts

Use chips/buttons, not a long form:

- "Can choose calmly?"
- "Dizzy/shaky?"
- "Just ate?"
- "Hard training?"
- "Meal soon?"

Stop after enough data for a safe recommendation; do not chase perfect data.

## Modal States

- `quickInput`: user is setting hunger.
- `checkpoint`: pause/timer active.
- `foodRecommended`: snack/meal path visible.
- `safetyStop`: do not delay.
- `lowConfidence`: ask minimal context.
- `outcomeCapture`: 30-90 min follow-up.

## Copy Contract

Good:

> "Food support: snack. A small protein/fiber snack is likely the safer deficit
> move now."

Good:

> "Risk rising because sleep was poor and two recent evening delays ended in
> overeating."

Bad:

> "You failed your fast."

Bad:

> "Ignore hunger; fat burning is active."

## Accessibility

- All rail values must be readable as text.
- Slider must support tap/stepper controls.
- Minimum touch target: 44px.
- Color cannot be the only state channel.
- Motion should be minimal and reducible.

## Anti-Obsession

- No fasting streaks.
- No "perfect control" score.
- No shame after eating.
- No more than two delay loops.
- Food Support Need is a recommendation strength, not a moral grade or ban.
