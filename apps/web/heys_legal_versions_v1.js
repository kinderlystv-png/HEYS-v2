// heys_legal_versions_v1.js
// Единый источник версий legal-документов для web-bundle.
// Зеркало apps/landing/src/config/legal-versions.ts.
//
// 🔑 При bump'е версии документа: меняем здесь И в landing legal-versions.ts.
// Серверный check_required_consents_v2 сравнивает эти значения с тем что
// подписано в БД (consents.document_version). При несовпадении — запускается
// grace 7 дней → блокирующий ConsentScreen в режиме re-consent.

(function (global) {
  'use strict';
  const HEYS = global.HEYS = global.HEYS || {};

  const versions = {
    user_agreement:     '1.11',
    personal_data:      '1.0',
    health_data:        '1.5',
    marketing:          '1.4',
    payment_oferta:     '1.11',
    push_notifications: '1.2',
    curator_access:     '1.1',
    speech_transcription: '1.2',
    supplements_tracking: '1.0',
    body_measurements:    '1.0',
    _updatedAt:         '2026-08-15'
  };

  // Required types для check_required_consents_v2 — обязательные согласия,
  // без которых нельзя пользоваться сервисом. health_data изъят из набора 1.11.
  versions.required = Object.freeze([
    'user_agreement',
    'personal_data'
  ]);

  // Human-readable метки для UI ("Мои согласия и данные" в профиле).
  versions.labels = Object.freeze({
    user_agreement:     'Пользовательское соглашение',
    personal_data:      'Согласие на обработку персональных данных',
    health_data:        'Согласие на обработку данных о здоровье (прекращено)',
    marketing:          'Маркетинговые материалы',
    payment_oferta:     'Оферта на оплату',
    push_notifications: 'Push-уведомления',
    curator_access:     'Доступ куратора к моим данным',
    speech_transcription: 'Расшифровка голосовых сообщений',
    supplements_tracking: 'Отметки о добавках',
    body_measurements:    'Замеры тела'
  });

  HEYS.LegalVersions = Object.freeze(versions);
})(typeof window !== 'undefined' ? window : globalThis);
