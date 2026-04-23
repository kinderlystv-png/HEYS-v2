-- Migration: auth_rate_limits for curator login brute-force protection
-- Replaces per-instance in-memory Map with persistent DB counter so the
-- limit is enforced correctly across all parallel YC Function instances.
--
-- Apply:
--   PGPASSWORD="$PG_ADMIN_PASSWORD" psql \
--     "host=$PG_HOST port=6432 dbname=heys_production user=heys_admin \
--      sslmode=verify-full sslrootcert=yandex-cloud-functions/heys-api-auth/certs/root.crt" \
--     -f database/2026-04-23_curator_login_rate_limits.sql

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  ip       TEXT        NOT NULL,
  attempts INT         NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (ip)
);

-- Index for periodic cleanup of expired rows (optional maintenance job)
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_reset_at
  ON public.auth_rate_limits(reset_at);

COMMENT ON TABLE  public.auth_rate_limits IS 'Per-IP brute-force counter for curator (email+password) login';
COMMENT ON COLUMN public.auth_rate_limits.ip       IS 'Client IP address (x-forwarded-for first hop)';
COMMENT ON COLUMN public.auth_rate_limits.attempts IS 'Failed attempt count within current window';
COMMENT ON COLUMN public.auth_rate_limits.reset_at IS 'Window expiry; row may be recycled after this timestamp';

-- Grant to runtime users used by heys-api-auth
-- heys_admin is the default fallback in heys-api-auth/shared/db-pool.js
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.auth_rate_limits TO heys_admin;
-- Also grant to restricted runtime users in case PG_USER is overridden in prod env
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_rpc') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.auth_rate_limits TO heys_rpc';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heys_maintenance') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.auth_rate_limits TO heys_maintenance';
  END IF;
END$$;
