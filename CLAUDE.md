# HEYS v2 — Claude Code Context

> Ответы по-русски, код на английском.

Основные правила находятся в `.github/copilot-instructions.md`. Этот файл —
только быстрый redirect, чтобы не дублировать always-on контекст.

## Quick rules

1. Не делать rollback-команды (`git checkout/restore/reset`) без явного запроса.
2. Не предлагать localhost API; использовать только `https://api.heyslab.ru`.
3. Не перезапускать dev/HMR без необходимости.
4. Tailwind first; inline styles запрещены.
5. Supabase SDK не использовать; только `HEYS.YandexAPI.rpc()` / `.rest()`.

## Quick refs

- Архитектура: `docs/ARCHITECTURE.md`, `docs/AI_KEY_FILES.md`
- API/security: `docs/API_DOCUMENTATION.md`, `docs/SECURITY_RUNBOOK.md`
- Data model/scoring: `docs/DATA_MODEL_REFERENCE.md`,
  `docs/DATA_MODEL_NUTRITION.md`, `docs/DATA_MODEL_ANALYTICS.md`,
  `docs/SCORING_REFERENCE.md`
- Sync/storage: `docs/SYNC_REFERENCE.md`, `docs/CURATOR_VS_CLIENT.md`,
  `docs/dev/STORAGE_PATTERNS.md`

## Useful commands

- `pnpm dev`
- `pnpm test:run`
- `pnpm type-check`
- `bash scripts/deploy-frontend.sh`
- `cd yandex-cloud-functions && ./validate-env.sh && ./health-check.sh`

Если задача узкая — читать только релевантные docs, а не весь набор подряд.
