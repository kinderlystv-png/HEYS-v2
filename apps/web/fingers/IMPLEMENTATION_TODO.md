# Fingers implementation TODO

> Started: 2026-06-10. Working document for completing the climbing fingerboard
> module from methodology to safe rollout.

## Goal

Bring `apps/web/fingers/` from strangler-ready MVP to a safely enabled
finger-training planner: methodology coverage stays explicit, the new engine can
be rolled out behind telemetry, and every safety-critical path has tests.

## Operating rules

- Do not edit `apps/web/heys_fingers_bundle_v1.js` manually.
- Do not rebuild bundles, commit, push, or open PRs without a separate explicit
  user command.
- After each large stage, prepare a review packet for another review agent:
  scope, changed files, key invariants, commands run, risks left.
- Treat cloud/client scoping as a safety invariant: any localStorage scan must
  filter foreign-scoped keys.
- Facts that drive implementation must point back to methodology/code lines or
  tests before being marked done.

## Stage 0 - Baseline and audit lock

- [x] Create this TODO document.
- [x] Run current focused baseline:
      `cd apps/web && pnpm exec vitest run $(printf '%s ' __tests__/fingers-*.test.js)`.
      Latest result 2026-06-10: 27 files passed, 553 tests passed.
- [x] Run methodology coverage checker:
      `node apps/web/fingers/methodology/tools/impl-coverage.mjs`. Result
      2026-06-10: 61/61 methodology units mapped, 0 orphan rows, 28/28 questions
      resolved.
- [x] Run shadow envelope:
      `node apps/web/fingers/methodology/tools/shadow-envelope.mjs --check`.
      Result 2026-06-10: 8/8 scenarios pass.
- [ ] Run browser smoke without forbidden bundle rebuild, or request explicit
      bundle/dev permission first. Target path: hang session + reps session +
      RPE/pain/abort/resume render path. Note: `pnpm dev:local`/web `predev`
      triggers `bundle-fingers.cjs`, so it is not used silently.
- [x] Merge methodology audit findings into this TODO.
- [x] Merge code audit findings into this TODO.

Review packet 0:

- Baseline command outputs: fingers Vitest 24/24 files, 513/513 tests before
  implementation; latest focused output: fingers Vitest 27/27 files, 553/553
  tests after P0 + pre-flip fixes.
- Methodology checks: impl-coverage 61/61, 0 orphan rows, 28/28 questions;
  shadow-envelope 8/8.
- Current failure list: none in focused automated baseline.
- Git status 2026-06-10 after Stage 1/P1 fixes: modified router/session UI/
  calendar/boards catalog and related fingers tests; new TODO document plus
  board/calendar tests.
- Confirmed no bundle rebuild / commit / push.
- Stage 0 status: partially closed. Automated baseline and methodology audit
  intake are done; browser smoke is deferred until it can run without bundle
  rebuild or after explicit permission; code audit intake is merged into this
  TODO.

## Stage 1 - Safe rollout gates for `flags.newEngine`

- [x] Define dev/canary rollout switch for `HEYS.Fingers.flags.newEngine`.
      Result 2026-06-10: `engineRouter.configureCanary()`, `loadCanaryFlag()`,
      and `enableCanaryIfGatePasses()` keep default off, enable canary
      explicitly, and can persist a client-scoped canary key.
- [x] Add observable fallback-rate collection around `engineRouter.lastSource` /
      `engineRouter.lastShadowDiff`. Result 2026-06-10:
      `engineRouter.getTelemetry()` exposes route counters, fallback total/rate,
      shadow compare count/errors, and last timestamps.
- [x] Verify/extend tests that `shadowCompare` records renderability metrics for
      all supported `doseShape` values. Result 2026-06-10:
      `fingers-engine-router.test.js` covers all 6 supported shapes as
      renderable and an unknown shape as `uiRendererRisk=true`. Focused suite
      after change: 27 files passed, 547 tests passed.
- [x] Verify existing tests that invalid builder output never reaches UI and
      falls back through `fallback-contract`. Existing coverage:
      `fingers-engine-router.test.js` checks missing exercises, empty exercises,
      and non-object builder output.
- [x] Document canary checklist in this file after the implementation exists.
      Checklist 2026-06-10: default `newEngine=false`; enable canary only
      through `engineRouter.enableCanaryIfGatePasses()` or explicit
      `configureCanary()`; review `getTelemetry().fallbackRate`,
      `shadowCompareErrors`, `shadowCompareTotal`, and
      `lastShadowDiff.nonRenderableCount.uiRendererRisk`; gate fails closed on
      `insufficient-routes`, `insufficient-shadow-samples`, and
      `no-shadow-data`; block flip on `fallback-rate`, `shadow-compare-errors`,
      `ui-renderer-risk`, `danger-budget`, `duration-delta`, or
      `exercise-count-delta` unless consciously forced.

Acceptance:

- `newEngine=false` remains the default until explicit flip.
- `newEngine=true` can be enabled locally/canary without removing fallback.
- Fallback reasons are visible enough to review after real sessions.
- Rollout gate can reject canary when observed fallback/shadow metrics are
  outside thresholds.
- Empty telemetry / missing shadow data cannot pass the gate.

Review packet 1:

- Files changed in router/telemetry/tests.
- Sample `lastShadowDiff` payload.
- Before/after focused test output.

Status 2026-06-10:

- Changed files: `apps/web/fingers/heys_fingers_engine_router_v1.js`,
  `apps/web/__tests__/fingers-engine-router.test.js`,
  `apps/web/fingers/heys_fingers_session_builder_v1.js`,
  `apps/web/__tests__/fingers-session-builder.test.js`,
  `apps/web/fingers/IMPLEMENTATION_TODO.md`.
- Runtime router now exposes in-memory telemetry; behavior is pinned by tests.
- `lastShadowDiff` sample now includes all six supported shapes:
  `{ hang:1, reps:1, continuous:1, attempts:1, circuit:1, process:1 }`,
  `nonRenderableCount.new=0`, `uiRendererRisk=false`.
- Negative sample: `doseShape:'isometric_cluster'` gives
  `nonRenderableCount.new=1`, `uiRendererRisk=true`.
- Danger sample: recovery session with `fullcrimp` gives
  `dangerBudget.new.spent=33`, cap `8`, `overBudget=true`, reason
  `danger-budget`.
- Verification:
  `cd apps/web && pnpm exec vitest run $(printf '%s ' __tests__/fingers-*.test.js)`
  -> 27 files passed, 553 tests passed.

Additional runtime telemetry status 2026-06-10:

- Changed file: `apps/web/fingers/heys_fingers_engine_router_v1.js`.
- New internal API: `engineRouter.getTelemetry()` and
  `engineRouter.resetTelemetry()`.
- Covered counters: `old`, `new`, `fallback`, `fallback-contract`,
  `fallback-error`, `fallbackRate`, `shadowCompareTotal`, `shadowCompareErrors`.

## Stage 2 - Level capture and assessment bridge

- [x] Inventory current profile/records inputs used by
      `engineRouter._enrichOpts`, `assessment`, `calibration`, and onboarding.
- [x] Add or complete level-capture UI so most users are not stuck on the
      conservative beginner floor.
- [x] Preserve safety semantics for MVC-derived level: MVC can derive/cap but
      must not seed hidden prerequisites. Reconciled 2026-06-10 from
      reviewer/code history: MVC-derived level is already implemented behind
      flags and reviewed end-to-end; remaining work here is explicit level
      capture UI and rollout gates.
- [x] Persist level/profile data through the existing client-scoped path.
- [x] Add/verify tests for explicit level, missing level, and client-switch
      behavior. MVC-derived level already has existing coverage/review; do not
      reimplement it as new work.
- [ ] Bridge saved profile/prerequisite data into the expanded assessment flow
      once Stage 5 battery fields exist.

Done 2026-06-10:

- Added `heys_fingers_profile_store_v1.js` as the shared resolver for
  `Fingers.getProfile()` / `Fingers.saveProfilePatch()`.
- Onboarding and Settings now capture explicit `level`; profile store normalizes
  missing/unknown level to null and `completedPrerequisites` to a de-duped
  array.
- Advanced/elite level selection now explains that level means finger-tissue
  training history, not climbing grade, and requires confirmation before it can
  seed advanced prerequisites.
- Bundle source order updated; generated bundle intentionally not rebuilt yet.

Acceptance:

- No silent intermediate default.
- Missing age/level still fails closed where methodology requires it.
- Derived level does not unlock prerequisites such as base years or BFR.

Review packet 2:

- UI flow screenshots or DOM test evidence.
- Profile persistence path.
- Safety tests proving fail-closed behavior.

## Stage 3 - Progression enforcement

- [x] Convert existing `progression.detectPlateau`, `progression.nextAxis`, and
      `sessionBuilder.__progressionHints` from advisory hints into generator
      constraints where safe.
- [x] Enforce axis order per quality: volume before edge/load, power speed only
      after volume, density for endurance qualities.
- [x] Add records-driven tests for plateau windows and generator changes.
- [x] Keep pain/readiness hard stops stronger than progression suggestions.

Done 2026-06-10:

- `sessionBuilder` now builds records-driven progression constraints before slot
  selection; atoms beyond the currently allowed axis are skipped.
- `__progressionHints` remain visible for debug/review, but the same data now
  affects generation.
- Tests cover volume hold, edge switch after plateau, and pain stop precedence.

Acceptance:

- A plateau can change the next generated stimulus, not only annotate it.
- Unsafe axes are not selected before lower-risk axes are exhausted.
- Current advisory fields remain backward-compatible or have a migration note.

Review packet 3:

- Examples of generated sessions before/after plateau.
- Test cases for each axis policy.
- Any remaining advisory-only cases.

## Stage 4 - MEV/MAV and weekly load bands

- [x] Audit current `mix_engine.applyVolume`, `sessionBuilder` FTL trimming, and
      `validators.S4_progressionCap`.
- [x] Add lower-bound MEV logic where methodology gives enough confidence.
- [x] Keep MAV/danger budget enforcement stronger than MEV fill.
- [x] Add weekly-quality tests: under-MEV recommendation, near-MAV trimming,
      over-cap recovery behavior.

Done 2026-06-10:

- `sessionBuilder` now computes quality-specific weekly TUT bands from
  `qualityTutWeekToDate` / `ftl.qualityTutWeekToDate`.
- MAV is enforced by trimming quality slots before global S4 FTL trimming.
- MEV is advisory-only in trace/coachReason; it never adds load over caps.

Acceptance:

- Generator can explain why a quality was added, held, or trimmed.
- No session exceeds existing danger budget gates.
- First-week/no-history behavior stays conservative.

Review packet 4:

- Weekly load fixtures.
- Generated trace fields.
- Edge cases for empty history and S4 overload.

## Stage 5 - Full assessment battery and retest cadence

- [ ] Expand assessment UI for the full test battery described in methodology:
      finger strength, power/contact, pull, critical force, mobility.
- [x] Expand assessment data model for the full test battery described in
      methodology: finger strength, power/contact, pull, critical force,
      mobility.
- [ ] Store test results in the existing records/client-scoped model.
- [x] Add retest reminders tied to mesocycle boundaries once periodization
      exists; before that, add inert metadata only.
- [ ] Replace default benchmark placeholders when vetted tables are available.

Done 2026-06-10:

- `assessment.TEST_BATTERY` defines physical tests and marker checklists.
- `scoresFromBattery()` and `assessBattery()` map partial battery data into the
  existing limiter scoring without changing the old `assess()` contract.
- `dueTests()` adds per-test retest cadence metadata (28/56 days) without UI
  spam or scheduling side effects.

Acceptance:

- Current `assessment` score limiter remains usable with partial data.
- Missing test values degrade gracefully and never over-unlock advanced content.
- Retest cadence does not spam until periodization owns the schedule.

Review packet 5:

- Data schema and migration impact.
- Partial-data examples.
- Benchmark source status.

## Stage 6 - Periodization engine

- [x] Add `heys_fingers_periodization_engine_v1.js` as a new source module.
- [x] Model mesocycle state: linear, nonlinear, DUP, taper, maintenance, deload.
- [x] Persist plans client-scoped; never infer cleanup by object shape.
- [x] Integrate periodization with `sessionBuilder` as planner context, not as a
      UI-only label.
- [x] Implement S7 deload as real enforcement, not only warning.
- [x] Add tests for macro/meso selection, deload, taper, maintenance, and
      client-switch isolation.

Done 2026-06-10:

- Added `heys_fingers_periodization_engine_v1.js` with linear, nonlinear, DUP,
  taper, maintenance, deload/retest phase modeling.
- Plans persist under `heys_<cid>_fingers_periodization_v1`; no LS scans or
  shape-inference cleanup.
- `engineRouter` enriches opts with saved planner context; `sessionBuilder`
  treats planner ceiling as a cap before slot selection.
- `volumeMultiplier` now trims session volume only by removing slots; it never
  increases load.
- `focusQuality` can come from `assessment.leadingLimiter` and reorders only
  qualities already allowed by the slot, so it cannot unlock unrelated atoms.

Acceptance:

- Single-day recommendation can be constrained by a week/mesocycle plan.
- Plans survive reload/client switch without foreign key leakage.
- Existing one-day builder still works without a plan.

Review packet 6:

- New module API.
- Persistence keys and client scoping proof.
- Periodization fixtures and test output.

## Stage 7 - UI architecture and runtime quality

- [ ] Split or isolate `heys_fingers_session_ui_v1.js` hot paths without
      changing public API.
- [ ] Consolidate duplicated timer cycle logic from `useCountdownCycle` and
      `useRepsCycle` behind the existing characterized hook tests
      (`fingers-timer-cycle`, `fingers-reps-cycle`).
- [ ] Audit intervals, legacy wake-lock paths, audio handles, and fullscreen
      cleanup. New timer hooks already use `HEYS.AppHooks.useWakeLock`; do not
      count that as missing global work.
- [ ] Add accessibility coverage for timer controls, abort confirmation, manual
      phase buttons, and RPE/pain prompts.
- [ ] Add performance smoke around repeated state changes in the session UI.
- [x] Review-pass Step-5 runners before flip: `continuous`, `attempts`,
      `circuit`, and `process` keep the shared RPE/pain/abort shell. Result
      2026-06-10: no runtime changes needed; added ExerciseRunner coverage
      proving all four new runner displays route `onAbort` through the shared
      confirm flow. Focused Step-5 suite: 5 files passed, 109/109 tests passed.

Acceptance:

- No timer interval survives unmount/abort/done.
- Manual and timed runners keep current behavior under existing tests.
- UI split lowers risk without forcing a bundle rebuild in this stage.

Review packet 7:

- Step-5 review scope: `ContinuousRunner`, `AttemptsRunner`, `CircuitRunner`,
  `ProcessRunner` in `heys_fingers_session_ui_v1.js` plus their display tests.
- Evidence: all four route through the shared shell for RPE/pain and abort
  confirmation; no bypass of `ConfirmModal` found.
- Verification 2026-06-10:
  `pnpm exec vitest run __tests__/fingers-exercise-runner.test.js __tests__/fingers-continuous-display.test.js __tests__/fingers-attempts-display.test.js __tests__/fingers-circuit-display.test.js __tests__/fingers-process-display.test.js`
  -> 5 files passed, 109/109 tests passed.

## Stage 8 - Product gaps

- [x] History view for finger sessions and per-grip progression.
- [x] Charts for MVC, RPE, pain, tissue load, and quality balance.
- [x] Export/debug dump for review of a generated recommendation.
- [ ] Optional wake-lock visibility and recovery after browser release; new
      timer hooks already acquire wake lock, so this is UX/legacy-path
      hardening.
- [ ] Better offline/resume UX for active sessions.
- [x] Human-readable recommendation reasons / `coachReason` for generated
      sessions, so rollout review can inspect why a plan was chosen. Result
      2026-06-10: `sessionBuilder` no longer exposes internal
      `bucket`/`block_catalog`/`safety-floor` terms in `description` or
      `coachReason`; tests lock this down.

Done 2026-06-10:

- Existing Progress tab already includes recent sessions, year heatmap, weekly
  volume, working-weight trend, records, PRs, grip usage, cooldown callout, and
  CSV export.
- Added `buildFingersDebugDump()` / `exportFingersDebugJson()` and settings
  button for review/support snapshots.

Acceptance:

- Product gaps are prioritized after safety/planner correctness.
- Each item has a measurable user workflow before implementation.

## Open methodology/code audit intake

Items below are placeholders until the two detailed audits are merged.

- [ ] Methodology audit: list all remaining `TODO`, `future`, `Phase 2`, known
      issues, and not-implemented points.
- [x] Methodology audit: first pass merged 2026-06-10. Live backlog confirmed:
      canary/fallback observation, `periodization_engine`, full planner with
      deload/taper/maintenance, generator-level progression and MEV/MAV, full
      assessment battery and retest cadence, level-capture UI, transfer
      max-strength -> board/wall, Berta 2025 benchmark upgrade, homed Phase-2
      validators/items (FDP/FDS edge rotation, `skinStatus`, `ageModifier 35+`;
      `V_skillBalance` and `V_energySystemSequence` already exist as validator
      functions, remaining work is wiring/enforcement if needed).
- [ ] Methodology audit follow-up: decide whether S10/danger-budget remains a
      separate validator/entity or stays inside current danger-budget checks.
- [x] Code audit: list real TODO/FIXME/stub/dead-code findings with file and
      function names.
- [x] Code audit: verify persistence direction and localStorage client-scoping.
- [x] Code audit: verify timer races and cleanup.
- [x] Code audit: verify UI/a11y/performance gaps.

Code audit live findings 2026-06-10:

- [x] P0.1: active-session localStorage scans must filter by current client.
      Boot stub scanned all `heys_*_finger_active_session` keys and
      `clearForTraining()` could remove foreign snapshots with matching
      date/training. Result 2026-06-10: boot lazy-load scan and persistence
      clear/load path are current-client scoped; covered by
      `fingers-boot-stub.test.js` and `fingers-session-persistence.test.js`.
- [x] P0.2: prevent two tabs from running independent live timers for the same
      client. Result 2026-06-10: timer core now acquires a raw localStorage lock
      scoped by current client, stores owner tab id, refreshes heartbeat,
      rejects fresh foreign locks, reclaims stale locks, releases on
      terminal/unmount, and expires the local timer if ownership is lost.
      Covered by `fingers-timer-cycle.test.js` and `fingers-reps-cycle.test.js`.
- [x] P0.3: replace UTC date-key fallbacks with local calendar date in session
      UI. Result 2026-06-10: `_todayDateKey()` wraps
      `_formatDateKey(new Date())`, and summary/readiness/achievement fallbacks
      no longer use `new Date().toISOString().slice(0, 10)`. Covered by
      `fingers-happy-path.test.js`.
- [x] P0.4: keep heavy session UI progress scans memoized but invalidatable.
      Result 2026-06-10: progress stats and last-done program scans depend on
      records `updatedAt` plus in-memory `HEYS.__fingersDiaryVersion`, bumped
      after successful full or partial fingers saves. Covered by helper
      regression in `fingers-happy-path.test.js`; full browser smoke remains
      deferred until bundle rebuild/dev-server permission.
- [x] P1: route Today recommendation through `engineRouter.recommendDay`;
      current UI path still calls `Fingers.mixEngine.recommendDay` directly, so
      `flags.newEngine` does not affect the main product path. Result
      2026-06-10: generated mix path uses `engineRouter.recommendDay` when
      available, then falls back to `mixEngine`, then legacy
      `generateMixedWorkout`. Covered by `fingers-today-recommend.test.js`.
- [x] P1: write `startedAt`/`endedAt` into `fingersLog` or make calendar read
      the existing timestamp consistently; current calendar cooldown expects
      `fingersLog.startedAt/endedAt`, while session log writes `completedAt`.
      Result 2026-06-10: new logs write `startedAt`/`endedAt`/`completedAt`;
      calendar falls back from missing `endedAt` to legacy `completedAt`;
      covered by `fingers-happy-path.test.js` and
      `fingers-calendar-cooldown.test.js`.
- [x] P1: replace UTC dateKey defaults based on
      `new Date().toISOString().slice(0, 10)` with the app local-date
      helper/path. Result 2026-06-10: closed as P0.3 in
      `heys_fingers_session_ui_v1.js`.
- [x] P1: fix duplicate `lattice_block` id in `boards_catalog`; current id map
      overwrites one board. Result 2026-06-10: full board keeps `lattice_block`,
      portable block is `lattice_hang_block`; `fingers-boards-catalog.test.js`
      pins unique ids and kind separation. Legacy `blockBoardId:'lattice_block'`
      is normalized to `lattice_hang_block` in block context.
- [ ] P1/P2: make non-hang completion, partial save, and summary use
      `doseShape`-aware duration/volume instead of legacy hang-only fields.
- [ ] P2: partial save should store completed portion semantics, not full
      planned `exercises` as if all volume was done.
- [ ] P2: abort progress should record completed counts, not raw cycle indices.
- [x] P2: document/verify active-session localStorage key behavior under storage
      interceptor; module assumes it is local-only. Result 2026-06-10: active
      snapshot writes remain raw `localStorage.setItem`, and scans are now
      current-client scoped.
- [ ] P2: timer callbacks should prefer refs over stale closure state for
      pause/resume/skip fast-click safety.
- [ ] P2: add focus trap/restoration and dialog semantics for fullscreen/RPE
      overlays.
- [ ] P2: add bounded audio cache or lifecycle cleanup for voice assets.
- [ ] P3: replace raw `programId` in partial activity labels with human labels.
- [ ] P3: update stale comments: bundle module count and programs Phase-2 note.
