-- 2026-05-31: создание 2 dedicated e2e test clients.
--
-- Цель: e2e тесты (TESTS/e2e/curator-switch-pollution.spec.ts,
-- perf-budget.spec.ts) переходят с real prod credentials Александры/Poplanton
-- на эти test rows. Cleanup (afterAll hook) trivial по client_id.
--
-- Owner: poplanton@mail.ru curator (id=6d4dbb32-fd9d-45b3-8e01-512595e2cb2c).
-- Phones: +70000000001, +70000000002 (fake test prefix).
-- PINs: 0000, 1111 (bcrypt-hashed via pgcrypto crypt(pin, gen_salt('bf'))).
--
-- Rollback: DELETE FROM public.clients WHERE id IN ('11111111-...', '22222222-...');
-- (FK client_kv_store.client_id ON DELETE CASCADE — снесёт любые kv rows).

BEGIN;

WITH curator AS (
  SELECT id FROM public.curators WHERE email = 'poplanton@mail.ru' LIMIT 1
)
INSERT INTO public.clients (
  id, curator_id, name, phone, phone_normalized, pin_hash, pin_updated_at,
  subscription_status, trial_starts_at, trial_ends_at,
  created_at, updated_at
)
SELECT
  test.uuid::uuid,
  curator.id,
  test.name,
  test.phone,
  test.phone,  -- phone_normalized = same digits-only string
  crypt(test.pin, gen_salt('bf')),
  NOW(),
  'active',
  NOW(),
  NOW() + INTERVAL '10 years',
  NOW(),
  NOW()
FROM curator, (VALUES
  ('11111111-1111-1111-1111-111111111111', 'E2E-TestAlex', '70000000001', '0000'),
  ('22222222-2222-2222-2222-222222222222', 'E2E-TestPopl', '70000000002', '1111')
) AS test(uuid, name, phone, pin)
ON CONFLICT (id) DO NOTHING;

-- Pre-populate minimal heys_profile для каждого test client.
-- Без этого app показывает registration form при PIN login,
-- и тесты падают на ожидании dashboard кнопки "Добавить приём пищи".
INSERT INTO public.client_kv_store (client_id, k, v, updated_at)
VALUES
  (
    '11111111-1111-1111-1111-111111111111'::uuid,
    'heys_profile',
    jsonb_build_object(
      'firstName', 'E2E TestAlex',
      'lastName', 'Test',
      'gender', 'Женский',
      'age', 30,
      'height', 165,
      'weight', 60,
      'birthDate', '1995-01-01',
      'birthDay', 1, 'birthMonth', 1, 'birthYear', 1995,
      'profileCompleted', true,
      'desktopAllowed', true,
      'defaultTab', 'diary',
      'stepsGoal', 10000,
      'sleepHours', 8,
      'baseWeight', 60,
      'weightGoal', 60,
      'updatedAt', (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
    ),
    NOW()
  ),
  (
    '22222222-2222-2222-2222-222222222222'::uuid,
    'heys_profile',
    jsonb_build_object(
      'firstName', 'E2E TestPopl',
      'lastName', 'Test',
      'gender', 'Мужской',
      'age', 30,
      'height', 175,
      'weight', 75,
      'birthDate', '1995-01-01',
      'birthDay', 1, 'birthMonth', 1, 'birthYear', 1995,
      'profileCompleted', true,
      'desktopAllowed', true,
      'defaultTab', 'diary',
      'stepsGoal', 10000,
      'sleepHours', 8,
      'baseWeight', 75,
      'weightGoal', 75,
      'updatedAt', (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
    ),
    NOW()
  )
ON CONFLICT (client_id, k) DO NOTHING;

COMMIT;
