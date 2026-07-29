-- Bind an authorized Telegram actor to exactly one active HEYS curator.
-- The value is operational identity data and is populated in production,
-- never committed as a literal in the repository.

BEGIN;

ALTER TABLE public.curators
  ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_curators_telegram_user_id_unique
  ON public.curators (telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

COMMENT ON COLUMN public.curators.telegram_user_id IS
  'Telegram user id allowed to claim leads for this curator; NULL means Telegram claim is unavailable.';

COMMIT;
