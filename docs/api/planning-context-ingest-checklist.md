# Planning Context Ingest — Implementation Checklist

## Backend

- [ ] Create `POST /planning/context-ingest` route behind auth.
- [ ] Resolve `userId` from token/session only (never trust body `userId`).
- [ ] Add strict JSON schema validation for request payload.
- [ ] Add idempotency table/storage (`idempotencyKey`, `requestHash`,
      `response`, `expiresAt`).
- [ ] Return `409` when same key is reused with different payload hash.
- [ ] Add rate limit (for example `30 requests / 5 min / user`).

## Parsing + Mode

- [ ] Parse `[SNAPSHOT]` and `[HEYS_DAYS_LAST_5]` safely (fallback to raw text).
- [ ] Extract context features: `sleep`, `stress`, `overdue`, `todayDue`,
      `scheduled`, `inbox`.
- [ ] Compute mode (`careful|steady|focus`) using current HEYS rules.
- [ ] Produce a stable normalized text representation for dedupe scoring.

## Dedupe + Upsert

- [ ] Fetch active user entities (`inbox`, `tasks`, `links`, optional projects)
      for candidate matching.
- [ ] Implement exact/fuzzy/semantic matching pipeline.
- [ ] Apply thresholds:
  - `>= 0.88` update existing
  - `0.75..0.88` safe merge
  - `< 0.75` create new
- [ ] Prevent duplicate `todo` tasks with same semantic intent.
- [ ] Ensure `antiDuplicateFirst=true` path runs before any create.

## Writes

- [ ] Implement `dryRun=true` mode with zero writes.
- [ ] Implement `applyNow=true` mode with transactional writes.
- [ ] Upsert inbox items by type
      (`thread/decision/question/constraint/value/capture`).
- [ ] Upsert tasks (`priority`, `status`, `projectId`, `dueDate`).
- [ ] Upsert links with relation enum
      (`promoted_to|causes|blocks|related|supports|contradicts`).
- [ ] Return deterministic `created/updated/skipped` arrays in response.

## Observability + Safety

- [ ] Add structured logs (request id, user id, source, mode, summary counts).
- [ ] Mask PII in logs and enforce payload retention policy.
- [ ] Add metrics: latency, error rate, created/updated ratio, duplicate-skip
      ratio.
- [ ] Add feature flag for staged rollout.

## Tests

- [ ] Unit: payload validation, mode calculation, dedupe thresholds.
- [ ] Unit: idempotency replay returns same response.
- [ ] Integration: end-to-end create/update/skip behavior.
- [ ] Integration: `dryRun=true` leaves DB unchanged.
- [ ] Integration: duplicate prevention for similar tasks.
- [ ] Regression fixtures from real `🧠 Всё` payload examples.

## Rollout

- [ ] Stage 1: `dryRun` only (collect metrics, no writes).
- [ ] Stage 2: write mode for internal users only.
- [ ] Stage 3: gradual rollout with monitoring and rollback switch.
- [ ] Stage 4: set UI/agent policy to server-write as default path.
