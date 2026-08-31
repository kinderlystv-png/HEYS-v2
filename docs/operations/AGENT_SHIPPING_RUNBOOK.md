# HEYS agent commit and shipping runbook

On-demand operational reference for Codex and Claude. Before any permitted
staging, commit, production/release build, integration, push or PR, read this
file completely and re-check the referenced scripts. This runbook describes
mechanics; it never grants permission.

<!-- POLICY {"id":"shipping-runbook-required","path":"docs/operations/AGENT_SHIPPING_RUNBOOK.md","before":["staging","commit","production-build","integration","push","pr"],"grantsPermission":false} -->
<!-- POLICY {"id":"commit-is-agent-discretion","actions":["staging","commit"],"requiresDirectInstruction":false,"since":"2026-08-09"} -->
<!-- POLICY {"id":"publication-requires-direct-instruction","actions":["push","deploy","pr","publication","production-build","integration"],"requiresDirectInstruction":true} -->
<!-- POLICY {"id":"commit-only-no-push","command":"pnpm ship","requiredArgs":["--no-push"],"push":false} -->
<!-- POLICY {"id":"push-requires-grant","taskApproval":false,"allowedGrants":["direct","session-wide-scoped"]} -->
<!-- POLICY {"id":"hook-bypass-explicit-only","tokens":["--no-verify","HUSKY=0"],"requires":"explicit-exact-operation"} -->
<!-- POLICY {"id":"codex-main-only","workBranch":"main","pushTarget":"origin/main","createBranches":false} -->
<!-- POLICY {"id":"agent-branch-source-only","branches":["codex/*","claude/*"],"generated":false,"releaseArtifacts":false} -->
<!-- POLICY {"id":"integration-never-push","command":"pnpm agents:integrate","commits":true,"push":false} -->

## 1. Permission gate

- **Staging and commit are the agent's call** (owner decision, 2026-08-09). A
  normal task approval (`сделай`, `исправь`) allows source edits, proportionate
  verification, the scoped local preview flow **and committing finished,
  verified blocks**. No separate command is needed; do not ask «коммитить?».
- A normal task approval still does **not** allow push, deploy, PR, publication,
  production/release build or integration — those need a separate direct
  instruction unless they are an unavoidable hook side effect of a commit.
- `commit` means commit-only. It does not include push. Use a non-pushing flow.
- `commit and push`, `push`, `ship` or an equivalent direct instruction grants
  only the named publication action and intended scope.
- A session-wide instruction such as `push в конце` is a push grant for the
  stated session/end point; do not silently broaden it to other scopes.
- Permission to commit includes the mandatory pre-commit hook side effects for
  that staged scope. It does not authorize a standalone/full legacy rebuild,
  collector integration or unrelated generated/release artifacts.
- Build, integration and release-artifact generation require their own direct
  grant when they are not an unavoidable hook side effect of an already
  permitted commit.

## 2. Choose the operation before staging

| User grant                               | Canonical operation                                                                        | Push? |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ | ----- |
| No commit grant                          | Source edit + scoped local preview only                                                    | No    |
| Commit-only, one intended staged group   | `pnpm ship "<conventional message>" --no-push`                                             | No    |
| Commit + push, one intended staged group | `pnpm ship "<conventional message>"` — after push runs `sync:local` automatically          | Yes   |
| Push already-created commit(s)           | `pnpm push:agent -- --confirm-push ...` — after push runs `sync:local` automatically       | Yes   |
| Explicit collector integration           | `pnpm agents:integrate --confirm-integration ...` from a clean intended collector worktree | No    |

`pnpm ship` rejects an empty staged set, expects `main` by default, and refuses
a non-`main` branch unless `--allow-non-main` is intentional. Without
`--no-push` it pushes the current branch and watches deploy workflows on `main`
(`Deploy to Yandex Cloud` and `Auto-deploy Cloud Functions`). A missing run
after a successful push is a warning, not a failed ship. `--no-watch` still
pushes. `--no-lock` bypasses shipping serialization and is emergency-only. The
script intentionally does not support `--no-verify`.

Commit message: subject (first line) must be conventional and ≤100 chars;
optional body after a blank line is passed as a second `-m`. Literal `\n` in the
CLI string is accepted. Before commit, ship resets dirty **generated** files
owned by the staged source rebuild scope (leftover from a failed previous ship
of the same scope) and refuses if any **foreign** generated path is dirty — it
never stash/restores another agent's preview. Parallel agents still use separate
worktrees + `pnpm agents:integrate` for independent write streams.

`pnpm ship --dry-run` is not a permission-free planning command: it still
requires an explicitly staged scope and may clean stale Git lock files and
create/remove the ship lock. Use it only after staging itself is authorized.

### Single-pass production documentation

- Update source and canonical documentation together while implementing. Ask for
  publication permission only after the complete intended scope is ready,
  reviewed and verified.
- Present that exact scope once. One direct `commit + push + deploy` approval
  covers commit, mandatory pre-push, push and deploy for that scope without
  intermediate approval prompts. It does not cover source/docs added after the
  approval except mandatory hook auto-fixes; material expansion requires a new
  permission gate.
- Before the permitted commit, include the stable decision, changed contract,
  expected deploy gate and next user-owned step. Do not claim that production is
  live before the deploy evidence exists.
- After push, verify the live outcome from the CI run and, where supported,
  `record_ops_deploy_receipt`. Report the run URL, deployed commit, version and
  canary/health result in the final response; those runtime facts do not require
  a second Git commit by themselves.
- Create a follow-up documentation commit only when the live result changes a
  decision, roadmap status, risk or next gate, or proves tracked documentation
  false. Treat it as a new scope under the normal commit/push permission gate.
- Never create a second push merely to copy transient deployment identifiers
  from CI into Markdown. This keeps the normal flow atomic: one intended commit,
  one push and one deploy.

## 3. Intended staging and dirty workspace

Before any staging or branch mutation:

1. Run `git status --short --branch`, inspect `git diff` and
   `git diff --cached`, and identify the exact intended files.
2. Group files into logical commits. Prefer `git add -- <paths>`. Use
   `git add -A` only when the user or collector explicitly accepts every dirty
   file as one intended scope. To split work into multiple commits, stage paths
   and commit twice — never `git checkout HEAD -- <path>` to “drop” unstaged
   changes; that wipes uncommitted work with no git recovery.
3. Before `git checkout`, `git restore`, or `git reset` on explicit paths, run
   `git diff --stat -- <paths>`. If output is non-empty, do not run the command.
   Do not stash, checkout, restore, reset, delete generated files or resolve
   conflicts in another agent's or uncertain scope. If scopes overlap, stop and
   report the conflict.
4. Before a reset relative to upstream, run `git log --oneline @{u}..HEAD` and
   establish ownership of every unpushed commit. Never erase another session's
   commits.
5. Re-check status after hooks because allowed auto-fix hooks can modify and
   stage additional files. Review the final commit diff before reporting it.

Unstaged files may remain beside a staged commit, but they are not permission to
capture them. A clean tree is mandatory for `agents:integrate` because that
collector mutates history, performs a full build pass and can roll back a failed
merge to its starting HEAD.

## 4. Scoped legacy bundles and generated artifacts

For a local web/UI preview use:

```bash
pnpm bundle:legacy:auto --files=<comma-separated-source-files>
```

This selects affected bundles but rebuilds them from the current on-disk state
of every source in that bundle scope. It does not stage outputs. If another
agent edits the same bundle scope, their source can therefore appear in the
preview output; report that fact and do not claim exclusive ownership.

Do not run full `pnpm bundle:legacy` for preview. A full-trigger file passed via
`--files` is report-only and tells the agent that a full integration/release
pass is required. Full rebuild is reserved for an explicit full-build grant or
the collector flow.

Preview bundles, manifests and `index.html` hash updates remain local QA output.
List them in the final response. Remove only output known to be yours and no
longer needed; do not revert uncertain or shared generated state.

Agent branches/worktrees are source-only. Their commits must not contain managed
web bundles, manifests, `index.html` hash sync or What's New release files. An
explicitly permitted collector/integration flow owns final generated and release
artifacts. Integration creates commits but never grants or performs push.

## 5. Hooks and fail-closed behavior

### Файл сообщения коммита — в свой каталог, не в общий `/tmp`

Многострочное сообщение удобно передавать через `git commit -F <файл>`, но
`/tmp` в этом окружении **общий для всех сессий**. 31.08 две сессии одновременно
писали `/tmp` под одним именем, и коммит уехал с чужим сообщением: файлы в нём
были свои, текст — соседский. Поймано глазами при чтении лога, а не проверкой.

Пиши файл сообщения в каталог своей сессии (`scratchpad` из системного
приглашения) либо давай ему имя с идентификатором сессии. Хук `commit-msg`
проверяет формат, но не авторство текста, и такой подмены не видит.

Current hook sources: [commit-msg](../../.husky/commit-msg),
[pre-commit](../../.husky/pre-commit) and [pre-push](../../.husky/pre-push).

- `commit-msg`: Commitlint.
- `pre-commit`: workspace runtime check; `lint-staged`; staged-hygiene (partial
  stage on shared MCP files, deleted workspace manifests); agent
  staging/source-only guard and multi-zone block; legacy sync (`agent-check` is
  report-only, `integration` rebuilds and stages generated scope); lazy-chunk,
  legacy free-variable (`lint-legacy-undef.mjs --staged`, allowlist in
  `scripts/lint-legacy-undef-allowlist.txt`), pricing, CommonJS mirror and
  heys-mcp web-mirror guards; allowlist auto-fixes. **Windows + dev-сервер:**
  при `localhost:3001` rebuild не останавливается — неизменённые locked-бандлы
  пропускаются, новые хэши пишутся в новые файлы; после коммита с новым lazy —
  hard reload. Commit body — строки ≤100 символов (commitlint).
- `pre-push`: delegates to `push:preflight` for the outgoing committed range.
  The current fast gates are workspace runtime, source/generated scope,
  Gitleaks, the migration test when migration contracts changed,
  direct-localStorage, unscoped-client-write and raw-session-clear guards, plus
  relevant Vitest. Clean legacy-bundle verification and the full web suite
  belong to deploy CI. React start-transition counting is optional diagnostics,
  not a blocking hook.
- `pnpm lint:shared-cache` is a manual-only check, not an active Husky hook.

Hooks fail closed. Follow their stderr and fix only the reported owned scope. Do
not auto-stash or rewrite another agent's dirty files to make a hook pass.
Legacy integration stops when a dirty generated baseline or unstaged legacy
source could contaminate the same output; move to an isolated/clean collector
flow instead of bypassing the gate.

Never use `--no-verify` or `HUSKY=0` as a normal flow. `pnpm ship` cannot pass
`--no-verify`. For direct Git commands, bypassing hooks requires a separate,
explicit user instruction for that exact operation and a report of the skipped
gates. `pnpm push:safe` is deprecated and does not provide a safe bypass.

## 6. Codex shipping flow

- Codex works only in the root `main` checkout. Codex agents must not create or
  switch to `codex/*` branches or use an agent branch as an intermediate step.
  If `main` is occupied by a temporary worktree, coordinate ownership and free
  it safely; do not create another branch to work around the conflict.
- Codex may commit on `main` when the user directly authorizes the intended
  scope. Selectively stage it, then use the operation table above. A permitted
  push targets only `origin/main`.
- Existing `codex/*` refs are legacy/integration inputs: audit them read-only,
  move confirmed current changes into `main`, then remove the refs only after
  merge verification and explicit destructive scope. The source-only branch
  guard remains a fail-safe for old refs, not permission for new Codex commits.
- `pnpm push:agent -- --confirm-push ...` is a fallback for already-created or
  grouped commits, not the default way to create a source commit. It can create
  a What's New follow-up commit when that feature is enabled, always runs
  `push:preflight`, pushes `HEAD:<target branch>` with bounded retries, runs
  `sync:local --force` so localhost matches pushed sources, and on `main`
  watches and verifies deployment. Do not ask the user to run `sync:local` or
  `pnpm pull` after a successful agent push — that step is built in. Use
  `--skip-sync-local` only when explicitly requested.
- `pnpm ship` likewise runs `sync:local --force` after a successful push unless
  `--skip-sync-local` is passed.
- Answer “committed/pushed/deployed?” from current evidence, not memory: inspect
  status and log; fetch the remote before making a remote-state claim.

## 7. Claude shipping and worktree flow

- Preserve a session-wide push grant exactly as stated. A grant to push at the
  end does not authorize intermediate pushes; use `ship --no-push` for those
  commits, then one final permitted push.
- Before leaving a stale `claude/*` branch or switching to `main`, inspect
  status, staged diff, upstream divergence and worktree ownership. Never start
  with a blind checkout/reset in a dirty shared root.
- Read-only parallel audits can share the root. For two or more independent
  write-capable tasks that need branch integration, create isolated worktrees:

```bash
pnpm agent:worktree <task>
```

The helper fetches `origin`, creates `.claude/worktrees/<task>` on
`claude/<task>` from `origin/main`, configures the worktree and runs a real
`pnpm install`. It does not clean up the worktree later.

After explicitly authorized source-only commits, run collector integration only
from a clean, intended collector worktree and provide the required branch and
release-text arguments:

```bash
pnpm agents:integrate --confirm-integration \
  --branches=claude/a,claude/b \
  --title="..." \
  --items='[{"type":"fix","title":"...","description":"..."}]'
```

`--branches=auto` requires `--yes` for a mutating run. The collector merges with
`--no-ff`, runs web `predev`, full `bundle:legacy`, verifies and commits
generated artifacts, and conditionally creates release metadata. It does not
verify that the current branch is `main`/`develop`, push, or remove worktrees
and branches; the caller must confirm the collector branch. Remove only
confirmed integrated worktrees; use `git worktree list`,
`git worktree remove <path>` and `git worktree prune` deliberately.

## 8. Release metadata, diagnostics and fallbacks

What's New is controlled by
[heys_release_features_v1.js](../../apps/web/heys_release_features_v1.js). When
disabled, `ship`, `push:agent` and `agents:integrate` do not create release
metadata. When enabled, they may create a separate `chore(release)` commit; use
[WHATS_NEW_COPY.md](../../apps/web/WHATS_NEW_COPY.md) for user-facing text.
Visible UI/behavior changes use `feat`/`fix`/`perf` and become user-facing
entries; internal build, security, docs, test and refactor changes use their
matching conventional type and remain technical. If a user would not notice the
change without reading the diff, do not classify it as user-facing.

`pnpm push:ready` is the older interactive What's New-only fallback. When the
feature is enabled it previews/checks release text, stages only release metadata
and can create a release follow-up commit; it never pushes. When the feature is
disabled it exits without staging or committing.

Useful non-shipping diagnostics:

```bash
pnpm push:agent -- --status
pnpm push:agent -- --print-command
pnpm push:preflight
pnpm push:preflight -- --diagnostics
```

`push:preflight` does not commit or push, but it can run relevant tests and warm
their cache. `push:agent --dry-run --no-push` can also run preflight and is not
a pure no-op. `push:agent --no-push` is not a commit-only replacement: release
preparation can still mutate and commit metadata before push is skipped.

If a command fails, follow the current stderr instead of copying an old command
from chat history. Before final reporting, show the final intended diff/status,
separate source from generated/release artifacts, and state explicitly whether
commit, push and deployment each did or did not happen.

After changing this runbook, the package shipping commands, their entrypoints or
active Husky hooks, run `pnpm docs:shipping:check`. The checker is read-only and
must stay outside pre-commit and CI unless a separate performance/necessity
review justifies adding it there.

## Confirmed implementation references

- [`package.json`](../../package.json)
- [`scripts/check-agent-shipping-docs.mjs`](../../scripts/check-agent-shipping-docs.mjs)
- [`scripts/ship.mjs`](../../scripts/ship.mjs)
- [`scripts/push-agent.mjs`](../../scripts/push-agent.mjs)
- [`scripts/push-preflight.mjs`](../../scripts/push-preflight.mjs)
- [`scripts/release-prepare-and-commit.mjs`](../../scripts/release-prepare-and-commit.mjs)
- [`scripts/auto-sync-legacy-bundles.mjs`](../../scripts/auto-sync-legacy-bundles.mjs)
- [`scripts/check-agent-staging.mjs`](../../scripts/check-agent-staging.mjs)
- [`scripts/agent-worktree.mjs`](../../scripts/agent-worktree.mjs)
- [`scripts/integrate-agents.mjs`](../../scripts/integrate-agents.mjs)
- [`scripts/push-safe.mjs`](../../scripts/push-safe.mjs)
