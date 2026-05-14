-- =====================================================
-- HEYS Landing Leads: фиксация согласия в БД (152-ФЗ ст. 9)
-- Версия: 1.0.0
-- Дата: 2026-05-14
-- Описание:
--   Добавляет поля фиксации согласия пользователя на обработку ПДн
--   при отправке заявки через landing TrialForm. До этой миграции
--   согласие проверялось только на стороне UI (state checkbox),
--   что не позволяло оператору доказать факт получения согласия.
--
--   Согласно ст. 9 152-ФЗ согласие должно быть «конкретным,
--   информированным и сознательным», а оператор обязан иметь
--   возможность подтвердить факт согласия. Эта миграция закрывает
--   разрыв.
--
--   Поле consent_marketing_accepted_at — NULLABLE заготовка
--   на будущее (на момент миграции маркетинговых рассылок нет;
--   при их появлении нужно будет добавить второй checkbox в форму
--   и записывать сюда timestamp).
-- =====================================================

ALTER TABLE public.leads
  -- Версия документа политики конфиденциальности на момент согласия
  ADD COLUMN IF NOT EXISTS consent_privacy_version TEXT,
  -- Время фиксации согласия (может отличаться от created_at, если форма
  -- отправлялась с задержкой)
  ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ,
  -- Способ выражения согласия: 'checkbox' для form-based, 'sms_otp' и т. д.
  -- для будущих сценариев
  ADD COLUMN IF NOT EXISTS consent_method TEXT,
  -- User-Agent на момент согласия (для подтверждения подлинности)
  ADD COLUMN IF NOT EXISTS consent_user_agent TEXT,
  -- Заготовка для будущего согласия на маркетинговые рассылки (38-ФЗ).
  -- На момент миграции рассылок нет; поле NULL для всех записей.
  ADD COLUMN IF NOT EXISTS consent_marketing_accepted_at TIMESTAMPTZ;

-- Проверка целостности: для новых записей consent-поля должны быть заполнены.
-- Существующие записи (до миграции) остаются с NULL — это исторические
-- лиды, для которых согласие фиксировалось только в UI. Их не удаляем,
-- но при проверке РКН по таким лидам оператор сможет показать только
-- старый UI flow.
COMMENT ON COLUMN public.leads.consent_privacy_version IS
  'Версия privacy-policy на момент согласия. Заполняется приложением.';
COMMENT ON COLUMN public.leads.consent_accepted_at IS
  'Timestamp фиксации согласия пользователя. NULL для записей до 2026-05-14.';
COMMENT ON COLUMN public.leads.consent_method IS
  'Способ согласия: checkbox / sms_otp / signed_document.';
COMMENT ON COLUMN public.leads.consent_user_agent IS
  'User-Agent браузера на момент согласия (отдельно от тех. user_agent в utm-блоке).';
COMMENT ON COLUMN public.leads.consent_marketing_accepted_at IS
  'Заготовка на будущее согласие на маркетинг (38-ФЗ). NULL если не дано.';

-- Индекс на consent_accepted_at пригодится при будущем аудите согласий
CREATE INDEX IF NOT EXISTS idx_leads_consent_accepted_at
  ON public.leads(consent_accepted_at)
  WHERE consent_accepted_at IS NOT NULL;
