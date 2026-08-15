-- heys/006d2b: close unused owner curator account after moving its clients.
-- Prod 15.08.2026: d1118a83-… (kinderlystv@gmail.com) last_login 22.12.2025.
-- Two clients on it were smoke/test, not live people:
--   f5822a0f-… login-smoke-deploy
--   a8958ff0-… Purge Warn Smoke Client
-- Live family clients already sit on 6d4dbb32-… (poplanton@mail.ru).
-- Order: reassign clients, revoke leftover push consent, then is_active=false.
-- Do not deactivate first: clients would be orphaned.

UPDATE public.clients
   SET curator_id = '6d4dbb32-fd9d-45b3-8e01-512595e2cb2c',
       updated_at = NOW()
 WHERE curator_id = 'd1118a83-aea1-4c3b-b7e5-0272f62ec63f'
   AND id IN (
     'f5822a0f-3944-40c5-88cf-a4fd6c4215cb',
     'a8958ff0-0000-4000-8000-000000008958'
   );

UPDATE public.curator_consents
   SET granted = false,
       revoked_at = NOW()
 WHERE curator_id = 'd1118a83-aea1-4c3b-b7e5-0272f62ec63f'
   AND consent_type = 'curator_push_notifications'
   AND revoked_at IS NULL;

UPDATE public.curators
   SET is_active = false,
       updated_at = NOW()
 WHERE id = 'd1118a83-aea1-4c3b-b7e5-0272f62ec63f'
   AND is_active IS TRUE;
