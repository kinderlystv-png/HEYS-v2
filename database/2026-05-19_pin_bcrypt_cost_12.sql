-- ═══════════════════════════════════════════════════════════════════
-- Migration: bcrypt PIN cost upgrade rounds=6 → rounds=12
-- Date: 2026-05-19
-- Purpose:
--   Все наши `crypt(pin, gen_salt('bf'))` использовали дефолтный cost
--   pgcrypto (rounds=6) — verification ≈10 мс. 4-значный PIN имеет 10 000
--   вариантов, утечка хеша = офлайн-перебор ≈100 секунд. При cost=12
--   verification ≈250 мс, перебор уходит за 40 минут на современном CPU.
--
--   Меняем cost в трёх местах, которые реально применены в проде:
--     1. admin_set_client_pin  (database/2026-04-28_admin_set_client_pin.sql)
--     2. admin_convert_lead + admin_regenerate_pin
--                              (database/2026-04-28_telegram_bot.sql)
--
--   Параллельно расширяем anti-timing-окно в verify_client_pin_v3 с
--   80–120 мс до 250–350 мс — иначе бекрипт-время (≈250 мс) превышает
--   окно и timing-канал «найден / не найден» открывается обратно.
--
--   Lazy-rehash: добавлен в verify_client_pin_v3 в успешной ветке. На
--   первый успешный логин клиента, если pin_hash имеет префикс `$2a$0?$`
--   (cost < 10), переписываем хеш с cost=12. Один UPDATE на клиента за
--   всю жизнь сессии; амортизирует миграцию.
--
-- Apply:
--   ./scripts/db/psql.sh -f database/2026-05-19_pin_bcrypt_cost_12.sql
--
-- Idempotent: все вложенные миграции используют CREATE OR REPLACE
-- FUNCTION / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

\echo '🔐 Re-applying admin_set_client_pin (cost=12)'
\i database/2026-04-28_admin_set_client_pin.sql

\echo '🔐 Re-applying telegram_bot functions (admin_convert_lead + admin_regenerate_pin, cost=12)'
\i database/2026-04-28_telegram_bot.sql

\echo '🔐 Re-applying verify_client_pin_v3 (anti-timing 250-350ms + lazy-rehash)'
\i database/2025-12-25_p2_phone_enumeration_fix.sql

COMMIT;

-- Verify: fresh PIN hash should start with $2a$12$
-- ./scripts/db/psql.sh -c "SELECT admin_set_client_pin(id, '0000') FROM clients LIMIT 1;"
-- ./scripts/db/psql.sh -c "SELECT LEFT(pin_hash, 7) FROM clients WHERE pin_hash IS NOT NULL LIMIT 5;"
