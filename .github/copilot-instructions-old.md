# HEYS v2 – Copilot Playbook

## System Layout

- Все ответы и комментарии ведём на русском языке. Английские термины и имена
  файлов оставляем по-английски, но связующий текст — по-русски.

- Monorepo managed with `pnpm` workspaces + Turbo; packages live in
  `packages/*`, deployable apps in `apps/*`, legacy v12 assets remain at repo
  root for reference only.
- Core runtime code is TypeScript-first; each package typically ships via `tsup`
  (CJS + ESM) and expects generated `dist/**` (including `.d.ts`) files to
  exist.
- Configuration shared across packages sits at the root (`tsconfig.json`,
  `levels.config.js`, `logger.config.*`). Logger utilities in `packages/logger`
  are consumed broadly.

## Required Tooling & Commands

- Use Node ≥ 18 and `pnpm` ≥ 8 (enforced by `.nvmrc` and `package.json`
  engines).
- Bootstrap once with `pnpm install`. `pnpm demo/dev` scripts spin up the web
  app; prefer `pnpm --filter @heys/web run dev` for frontend-only.
- Type safety is driven by `pnpm run type-check` (Turbo fan-out). Many packages
  demand their build step first: run `pnpm -r --filter @heys/* run build` to
  refresh declarations before a clean type-check.
- Unit tests: `pnpm test:packages` (per package `vitest`), end-to-end via
  Playwright (`pnpm test:e2e`).
- Build artifacts for release use `pnpm run build` (Turbo) or target a package
  (`pnpm --filter @heys/logger run build`).

## Coding Conventions

- Root `tsconfig.json` has `"noEmit": true`; rely on package-level configs
  (often `composite`) for emission. Update `paths`/`references` when introducing
  new cross-package imports.
- Logger levels/types are sourced from `levels.config.js`; when adding
  transports adjust `packages/logger/src/transports.ts` _and_ keep level
  mappings in sync.
- Shared security & analytics modules (`packages/shared/src/security/**`,
  `.../analytics/**`) assume Supabase + custom threat detection stubs. Guard
  optional fields to satisfy `exactOptionalPropertyTypes` and avoid implicit
  `any`.
- Legacy performance helpers under `packages/shared/src/performance/**` pull in
  React/Vite types even though `@heys/shared` is nominally framework-agnostic.
  Ensure the package’s `tsconfig` and dependencies cover those imports before
  refactoring.
- Many legacy JS/HTML files at repo root are preserved for documentation—avoid
  editing unless explicitly requested.

## Integration Notes

- Supabase access flows through `DatabaseService`
  (`packages/shared/src/database/DatabaseService.ts`); incidents and analytics
  objects expect specific shape (status enums, timestamps, etc.).
- Security analytics bridge
  (`packages/shared/src/security/threat-detection-bridge.ts`) optionally loads
  `@heys/threat-detection`; provide mocks when the dependency is absent.
- Frontend styling uses Vite + Tailwind (`apps/web/postcss.config.js` expects
  `@tailwindcss/postcss`). Install corresponding plugins before running
  `vite build`.
- Turbo caches outputs aggressively; when debugging inconsistent builds, clear
  via `pnpm clean` or `turbo run build --force`.

## Documentation Pointers

- High-level system context: `docs/ARCHITECTURE.md`, API specifics in
  `docs/API_DOCUMENTATION.md`, security processes in `docs/SECURITY.md`.
- Legacy navigation aids (`NAVIGATION_MAPS_README.md`,
  `dynamic-navigation-mapper.js`) map anchors for large HTML/JS bundles—useful
  if you must touch v12 assets.

Let me know if any section needs deeper coverage or if new workflows should be
documented.
