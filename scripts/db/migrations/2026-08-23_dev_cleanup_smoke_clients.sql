-- Optional dev cleanup: remove smoke junk clients from poplanton@mail.ru curator.
-- UI filter in heys_e2e_fixtures_v1.js hides these even if rows remain.
-- Safe/idempotent: DELETE only explicit smoke UUIDs; never touches E2E fixtures
-- or real family clients. client_kv_store cascades via FK ON DELETE CASCADE.
--
-- Real clients (KEEP): ccfe6ea3-… Антон Полtavский, 4545ee50-… Александра
-- E2E fixtures (KEEP): 11111111-… E2E-TestAlex, 22222222-… E2E-TestPopl
--
-- Rollback: not applicable (destructive optional cleanup).

BEGIN;

DELETE FROM public.clients
 WHERE curator_id = '6d4dbb32-fd9d-45b3-8e01-512595e2cb2c'::uuid
   AND id IN (
     '7397a9db-03bb-45ce-a202-74b3aea2836e'::uuid,
     '9bc6f6c3-77e1-49cd-a270-ab3356f8bdb6'::uuid,
     '5d067903-da72-407a-bc36-bfd57e3eb60f'::uuid,
     'f5822a0f-3944-40c5-88cf-a4fd6c4215cb'::uuid,
     'a8958ff0-0000-4000-8000-000000008958'::uuid
   )
   AND id NOT IN (
     '11111111-1111-1111-1111-111111111111'::uuid,
     '22222222-2222-2222-2222-222222222222'::uuid,
     'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a'::uuid,
     '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc'::uuid
   );

COMMIT;
