-- 2026-06-01: DB-level CHECK constraint на heys_profile shape (Layer #11)
--
-- Context: wave 3 — defense in depth. Сервер уже валидирует identity-fields в
-- merge_save handler (heys-api-rpc), но прямой SQL/admin-bypass (psql,
-- migration scripts, dbeaver) обходит проверку. TRIGGER на client_kv_store
-- WHERE k='heys_profile' гарантирует bounds на самом низком уровне.
--
-- Validation rules (синхронизировано с heys-api-rpc merge_save schema check):
--   gender ∈ {Мужской, Женский, Другой}  (null ok — onboarding-incomplete)
--   age ∈ [10, 120]
--   height ∈ [50, 250]
--   weight ∈ [20, 400]
--
-- Audit 2026-06-01: все 4 existing rows проходят bounds (no legacy violations).
--
-- Rollback: inline ниже.

BEGIN;

-- ===== FORWARD =====

CREATE OR REPLACE FUNCTION public.validate_profile_jsonb()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_gender   text;
  v_age      numeric;
  v_height   numeric;
  v_weight   numeric;
BEGIN
  -- Только heys_profile validates — другие keys пропускаем
  IF NEW.k <> 'heys_profile' THEN
    RETURN NEW;
  END IF;

  -- Null/missing fields разрешены (onboarding до завершения)
  v_gender := NEW.v->>'gender';
  IF v_gender IS NOT NULL AND v_gender <> '' AND v_gender NOT IN ('Мужской','Женский','Другой') THEN
    RAISE EXCEPTION 'invalid_profile_gender: % (allowed: Мужской/Женский/Другой)', v_gender
      USING ERRCODE = 'check_violation';
  END IF;

  -- Численные поля — пропускаем NULL/empty, валидируем только если задано
  BEGIN
    v_age := (NEW.v->>'age')::numeric;
    IF v_age IS NOT NULL AND (v_age < 10 OR v_age > 120) THEN
      RAISE EXCEPTION 'invalid_profile_age: % (allowed: 10..120)', v_age
        USING ERRCODE = 'check_violation';
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    -- Empty string / non-numeric → skip (legacy data может содержать)
    NULL;
  END;

  BEGIN
    v_height := (NEW.v->>'height')::numeric;
    IF v_height IS NOT NULL AND (v_height < 50 OR v_height > 250) THEN
      RAISE EXCEPTION 'invalid_profile_height: % (allowed: 50..250)', v_height
        USING ERRCODE = 'check_violation';
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN NULL;
  END;

  BEGIN
    v_weight := (NEW.v->>'weight')::numeric;
    IF v_weight IS NOT NULL AND (v_weight < 20 OR v_weight > 400) THEN
      RAISE EXCEPTION 'invalid_profile_weight: % (allowed: 20..400)', v_weight
        USING ERRCODE = 'check_violation';
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN NULL;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_profile_jsonb IS
  'DB-level schema validation для heys_profile bounds. Mirrors RPC merge_save check (heys-api-rpc/index.js).';

DROP TRIGGER IF EXISTS trg_validate_profile ON public.client_kv_store;

CREATE TRIGGER trg_validate_profile
  BEFORE INSERT OR UPDATE ON public.client_kv_store
  FOR EACH ROW
  WHEN (NEW.k = 'heys_profile')
  EXECUTE FUNCTION public.validate_profile_jsonb();

COMMIT;

-- ===== ROLLBACK =====
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_validate_profile ON public.client_kv_store;
-- DROP FUNCTION IF EXISTS public.validate_profile_jsonb();
-- COMMIT;
