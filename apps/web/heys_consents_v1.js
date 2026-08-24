// heys_consents_v1.js — Модуль согласий и ПЭП (простая электронная подпись)
// Версия: 1.0
// 152-ФЗ compliant consent management

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const { useState, useEffect, useCallback, useRef, useMemo } = React || {};

  function useFallbackAccessSignPin() {
    const [value, setValue] = useState('');
    return {
      pinValue: value,
      isComplete: value.length >= 4,
      resetDigits: () => setValue(''),
      applyPinDigits: (arr) => setValue((arr || []).slice(0, 4).join('')),
    };
  }

  // =====================================================
  // Константы
  // =====================================================

  const CONSENT_TYPES = {
    USER_AGREEMENT: 'user_agreement',
    PERSONAL_DATA: 'personal_data',
    HEALTH_DATA: 'health_data',
    MARKETING: 'marketing',
    PAYMENT_OFERTA: 'payment_oferta',
    SPEECH_TRANSCRIPTION: 'speech_transcription',
    SUPPLEMENTS_TRACKING: 'supplements_tracking',
    BODY_MEASUREMENTS: 'body_measurements'
  };

  const CURRENT_VERSIONS = {
    user_agreement: '1.11', // 2026-08-14: пакет 1.11 — цены, ПЭП, Self, изъятие health
    personal_data: '1.0',  // 2026-08-14: отдельное согласие, не политика
    health_data: '1.5',  // изъято из обязательного набора; снимок 1.5 в архиве
    marketing: '1.4',
    payment_oferta: '1.11',
    push_notifications: '1.2',
    speech_transcription: '1.2',
    supplements_tracking: '1.0',
    body_measurements: '1.0'
  };

  const REQUIRED_CONSENTS = [
    CONSENT_TYPES.USER_AGREEMENT,
    CONSENT_TYPES.PERSONAL_DATA
  ];

  // =====================================================
  // Конфигурация верификации
  // =====================================================

  // SMS верификация отключена — используем явное действие в аутентифицированной
  // сессии + audit trail. Достаточность этой ПЭП-модели для письменного
  // health-consent остаётся отдельным внешним legal release gate.
  //
  // ⚠ Перед тем как включать (true): SMS-код формирует ПЭП по 63-ФЗ, что меняет
  // состав условий обработки специальной категории ПДн. По 152-ФЗ это требует
  // нового согласия от каждого активного клиента. Обязательная последовательность:
  //   1. Bump publicLegal-версий user-agreement + health-data-consent в
  //      apps/landing/src/config/legal-versions.ts (новый snapshot в
  //      apps/web/public/docs/v1.X/) — текст должен описать SMS-код как
  //      применяемый метод подписи, а не «планируется».
  //   2. Дождаться, пока ConsentOutdatedBanner соберёт re-consent от всех клиентов.
  //   3. Передеплоить cloud function heys-api-sms (удалена 2026-05-22), вернуть
  //      SMS_API_KEY в Lockbox + env.
  //   4. Только после этого переключать флаг в true.
  // Подробнее в docs/legal/subprocessors.md §4.
  const SMS_VERIFICATION_ENABLED = false;

  const CONSENT_SIGN_SHEET_DOCS = ['user_agreement', 'personal_data'];

  // Inline shell — первый кадр с отступами (как канвас: backdrop full-screen + frame padding 12px).
  const CONSENT_SIGN_ROOT_STYLE = {
    position: 'fixed',
    inset: 0,
    zIndex: 11000,
    pointerEvents: 'none',
  };

  const CONSENT_SIGN_BACKDROP_STYLE = {
    position: 'absolute',
    inset: 0,
    background: 'var(--v4-modal-backdrop-dim, rgba(42, 26, 12, 0.45))',
    backdropFilter: 'blur(var(--v4-modal-backdrop-blur, 2.5px))',
    WebkitBackdropFilter: 'blur(var(--v4-modal-backdrop-blur, 2.5px))',
    pointerEvents: 'auto',
  };

  // Строка «вид шторки подписи»: лист прижат к низу во всю ширину — рамки
  // в 12 px вокруг него нет, радиус 26 только сверху.
  const CONSENT_SIGN_FRAME_STYLE = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: 0,
    boxSizing: 'border-box',
    pointerEvents: 'none',
  };

  const CONSENT_SIGN_SHEET_STYLE = {
    position: 'relative',
    width: '100%',
    borderRadius: '26px 26px 0 0',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
  };

  const SIGN_SHEET_FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  // Строка «доступность»: ловушка фокуса шторки подписи обходит только то, что
  // внутри листа. Скрытые с глаз, но доступные клавиатуре поля PIN сюда входят.
  function getSignSheetFocusables(sheet) {
    if (!sheet || typeof sheet.querySelectorAll !== 'function') return [];
    return Array.from(sheet.querySelectorAll(SIGN_SHEET_FOCUSABLE_SELECTOR))
      .filter((el) => el && el.getAttribute && el.getAttribute('aria-hidden') !== 'true');
  }

  // Строка «после подписи»: в журнал вместе с подписью уходит navigator.userAgent
  // (logConsentsBySession / logConsents), поэтому человеку показываем то же
  // устройство — короткой парой «система · браузер», а не строкой агента.
  function describeSignDevice() {
    const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
    if (!ua) return 'это устройство';
    const os = /iPhone/i.test(ua) ? 'iPhone'
      : /iPad/i.test(ua) ? 'iPad'
        : /Android/i.test(ua) ? 'Android'
          : /Windows/i.test(ua) ? 'Windows'
            : /Macintosh|Mac OS X/i.test(ua) ? 'Mac'
              : /Linux/i.test(ua) ? 'Linux'
                : '';
    // Порядок важен: YaBrowser и Edge несут в агенте и Chrome, CriOS — и Safari.
    const browser = /YaBrowser/i.test(ua) ? 'Яндекс Браузер'
      : /Edg\//i.test(ua) ? 'Edge'
        : /OPR\/|Opera/i.test(ua) ? 'Opera'
          : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
            : /Chrome|CriOS/i.test(ua) ? 'Chrome'
              : /Safari/i.test(ua) ? 'Safari'
                : '';
    if (os && browser) return `${os} · ${browser}`;
    return os || browser || 'это устройство';
  }

  function formatAccessCodeSignMeta(signedAt) {
    const date = signedAt instanceof Date ? signedAt : new Date();
    const day = date.getDate();
    const month = date.toLocaleString('ru-RU', { month: 'long' });
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    // Строка «после подписи»: документ и версия стоят в карточке ниже, здесь —
    // способ подписи, дата, время и устройство.
    return `Подпись — код доступа, ${day} ${month} в ${hours}:${minutes}, ${describeSignDevice()}`;
  }

  function renderConsentSignDoneIcon() {
    return React.createElement('svg', {
      width: 25, height: 25, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 2.75, strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': 'true',
    }, React.createElement('path', { d: 'M20 6L9 17l-5-5' }));
  }

  // =====================================================
  // Тексты документов
  // =====================================================

  const CONSENT_TEXTS = {
    // Короткие тексты для чекбоксов
    checkboxes: {
      user_agreement: {
        label: 'Принимаю условия Пользовательского соглашения (Оферты)',
        screenLabel: 'Пользовательское соглашение',
        summary: 'Определяет доступ к HEYS, условия тарифа и оплаты, правила отмены и то, что сервис не является медицинской услугой.',
        screenSummary: 'Доступ к HEYS, условия тарифа и отмены.',
        link: '/legal/user-agreement',
        required: true
      },
      personal_data: {
        label: 'Даю согласие на обработку моих персональных данных',
        screenLabel: 'Обработка персональных данных',
        summary: 'Отдельный документ: какие данные, для чего, кому передаются, срок и как отозвать. Политика описывает работу оператора и не заменяет это согласие.',
        screenSummary: 'Храним имя, контакт и профиль в России. Доступ у вас и куратора. Telegram, Google и Apple получают только то, что названо в согласии, — приглашение, статус заявки и доставку уведомлений.',
        link: '/legal/personal-data-consent',
        required: true
      },
      health_data: {
        label: 'Согласие на обработку данных о здоровье прекращено',
        summary: 'Документ 1.5 изъят из обязательного набора. Специальная категория не обрабатывается. Снимок 1.5 хранится в архиве.',
        link: '/legal/health-data-consent',
        required: false
      },
      marketing: {
        label: 'Согласен получать информационные и рекламные материалы сервиса',
        screenLabel: 'Новости и советы',
        screenHint: 'Письма о продукте, не чаще раза в месяц',
        summary: 'Можем присылать материалы, новости и акции по email и push. Это необязательно: можно отказаться без потери доступа к HEYS.',
        link: '/docs/marketing-consent.md',
        required: false
      },
      notifications: {
        label: 'Напоминания, события по дневнику и факт нового сообщения куратора',
        screenLabel: 'Напоминания',
        screenHint: 'Статус пробной недели и сообщения куратора',
        summary: 'Служебные уведомления. Сообщение куратора — без текста переписки. Остальные могут содержать сведения из дневника. Доставка через Google, Apple и Mozilla. Рекламное согласие оформляется отдельно.',
        link: '/docs/v1.2/push-notifications-consent.md',
        required: false
      },
      payment_oferta: {
        label: 'Нажимая «Оплатить», принимаю условия Публичной оферты',
        link: 'https://heyslab.ru/legal/user-agreement',
        secondaryLink: 'https://heyslab.ru/legal/privacy-policy',
        required: true
      },
      speech_transcription: {
        label: 'Согласен на передачу голосовых сообщений в Yandex SpeechKit для автоматической расшифровки',
        summary: 'Передаём выбранное аудио в Yandex SpeechKit и показываем текст в чате. В записи не сообщайте сведения о заболеваниях. Отказ не мешает отправить голосовое без расшифровки.',
        link: '/docs/speech-transcription-consent.md',
        required: false
      },
      supplements_tracking: {
        label: 'Вести отметки о добавках из справочника сервиса',
        screenLabel: 'Добавки и витамины',
        screenHint: 'Учёт приёма в дневнике',
        summary: 'Сохраняем выбранные позиции и даты приёма. Лекарства вносить нельзя. Видят вы и куратор. Можно отказаться без потери доступа к HEYS.',
        link: '/docs/v1.0/supplements-consent.md',
        required: false
      },
      body_measurements: {
        label: 'Вести замеры тела в дневнике',
        screenLabel: 'Замеры тела',
        screenHint: 'Обхваты тела в дневнике',
        summary: 'Сохраняем обхваты и даты, чтобы видеть динамику вам и куратору. Можно отказаться без потери доступа к HEYS. Выключение удаляет внесённые замеры.',
        link: '/docs/v1.0/body-measurements-consent.md',
        required: false
      }
    },

    // Дружелюбные описания документов для модального окна
    friendlySummaries: {
      user_agreement: {
        emoji: '🤝',
        title: 'Что это значит простыми словами?',
        color: '#dbeafe', // blue-100
        borderColor: '#3b82f6', // blue-500
        textColor: '#1e40af', // blue-800
        points: [
          '📱 Вы получаете доступ к приложению HEYS для ведения дневника питания',
          '👨‍💼 В Pro — сопровождение куратора; в Pro Спорт — питание и тренировки ведёт один специалист',
          '⚠️ Это НЕ медицинская услуга — куратор помогает с питанием, но не ставит диагнозы',
          '💰 Подтверждённый пробный период бесплатный, затем продолжение оплачивается помесячно',
          '🚪 От платных услуг можно отказаться в любой момент; удерживаются только подтверждённые фактические расходы'
        ]
      },
      personal_data: {
        emoji: '🔒',
        title: 'Что мы делаем с вашими данными?',
        color: '#dcfce7', // green-100
        borderColor: '#22c55e', // green-500
        textColor: '#166534', // green-800
        points: [
          '📝 Храним имя, контакт, профиль и дневник для аккаунта и сопровождения',
          '🇷🇺 Первичная база и файлы внутреннего чата хранятся в Yandex Cloud в России',
          '🔐 Telegram, Google и Apple получают только то, что названо в согласии: приглашение, статус заявки и доставка уведомлений',
          '🗑️ Можно отозвать согласие в настройках или письмом — удаление не дольше 30 дней',
          '📧 Маркетинговые сообщения — только по отдельному согласию'
        ]
      },
      health_data: {
        emoji: '❤️',
        title: 'Почему этого согласия больше нет?',
        color: '#fce7f3', // pink-100
        borderColor: '#ec4899', // pink-500
        textColor: '#9d174d', // pink-800
        points: [
          '📋 Специальная категория из основного пути убрана',
          '🛡️ Сервис не запрашивает диагнозы, лекарства и ограничения',
          '📊 Дневник, переписка и фото — под согласием на персональные данные',
          '📁 Текст версии 1.5 остаётся в архиве как доказательство прошлого',
          '⚠️ Если сведения о заболеваниях попадут в свободный текст, их удалят'
        ]
      },
      marketing: {
        emoji: '📬',
        title: 'Что будем присылать?',
        color: '#fef3c7', // amber-100
        borderColor: '#f59e0b', // amber-500
        textColor: '#92400e', // amber-800
        points: [
          '💡 Полезные советы по питанию и здоровому образу жизни',
          '🎁 Информацию о новых функциях и акциях',
          '✉️ Сообщения только по выбранным контактным каналам',
          '🔕 Можно отписаться в любой момент в настройках',
          '✅ Отказ не влияет на заявку, триал или использование HEYS'
        ]
      },
      supplements_tracking: {
        emoji: '💊',
        title: 'Что сохраняем по добавкам?',
        color: '#ecfdf5',
        borderColor: '#10b981',
        textColor: '#065f46',
        points: [
          '📋 Только позиции из справочника сервиса и даты приёма',
          '🚫 Лекарства и свободный ввод недоступны',
          '👤 Видят вы и назначенный куратор',
          '🚪 Можно отказаться сейчас или выключить позже — доступ к HEYS сохранится',
          '🗑️ Выключение удаляет сохранённые отметки'
        ]
      },
      body_measurements: {
        emoji: '📏',
        title: 'Что сохраняем по замерам?',
        color: '#eef2ff',
        borderColor: '#6366f1',
        textColor: '#312e81',
        points: [
          '📐 Обхваты тела и даты замеров',
          '📈 Динамика нужна вам и куратору, не для диагноза',
          '👤 Видят вы и назначенный куратор',
          '🚪 Можно отказаться сейчас или выключить позже — доступ к HEYS сохранится',
          '🗑️ Выключение удаляет внесённые замеры'
        ]
      }
    },

    // Дисклеймер
    disclaimer: {
      short: 'HEYS — учёт питания и сопровождение куратора, не медицинская услуга.',
      full: 'HEYS предоставляет информационные услуги по учёту питания и коучинговое сопровождение. ' +
        'Сервис НЕ является медицинской организацией, не оказывает медицинские услуги, ' +
        'не ставит диагнозы и не назначает лечение. При наличии заболеваний обратитесь к врачу.'
    },

    // Полный текст согласия (краткая версия для экрана)
    consentSummary: `
Нажимая «Продолжить», вы подтверждаете:
• Ознакомление с Пользовательским соглашением (Офертой)
• Согласие на обработку персональных данных

Замеры тела и отметки о добавках подключаются только если вы отдельно отметили эти пункты. Их можно не давать и позже включить в настройках.

Согласие даётся до начала обработки данных и может быть отозвано в любой момент через настройки профиля.
    `.trim()
  };

  // =====================================================
  // API для работы с согласиями
  // =====================================================

  const consentsAPI = {
    /**
     * Логирование согласий через YandexAPI
     */
    async logConsents(clientId, consents) {
      try {
        // clientId намеренно не отправляется: сервер определяет владельца
        // согласия только по активной PIN/cookie-сессии.
        if (HEYS.YandexAPI?.logConsentsBySession) {
          const result = await HEYS.YandexAPI.logConsentsBySession(consents, navigator.userAgent);
          if (result.error) throw new Error(result.error?.message || result.error);
          console.log('[Consents] ✅ Logged:', result);
          const payload = result.data?.log_consents_by_session || result.data;
          if (payload?.success === false) {
            const errCode = payload.error || '';
            if (errCode === 'signing_requires_access_code' || errCode === 'pin_confirm_requires_access_code') {
              return {
                success: false,
                error: errCode,
                needsAccessCode: true,
                data: result.data,
              };
            }
          }
          return { success: payload?.success ?? !result.error, data: result.data };
        }

        console.warn('[Consents] YandexAPI not available');
        return { success: false, error: 'No API client' };
      } catch (err) {
        console.error('[Consents] ❌ Error logging:', err);
        return { success: false, error: err.message };
      }
    },

    async signConsentsWithAccessCode(consents, accessCode) {
      try {
        if (!HEYS.YandexAPI?.signConsentsWithAccessCodeBySession) {
          return { success: false, error: 'API not ready' };
        }
        const result = await HEYS.YandexAPI.signConsentsWithAccessCodeBySession(
          consents,
          accessCode,
          typeof navigator !== 'undefined' ? navigator.userAgent : null
        );
        if (result.error) throw new Error(result.error?.message || result.error);
        const payload = result.data?.sign_consents_with_access_code_by_session || result.data;
        if (payload?.success === false) {
          throw new Error(payload.error || payload.message || 'sign_failed');
        }
        return { success: true, data: payload };
      } catch (err) {
        console.error('[Consents] ❌ Error signing with access code:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Проверка наличия всех обязательных согласий
     */
    async checkRequired(clientId) {
      try {
        // Legacy hook сохраняет сигнатуру, но проверка всегда session-bound.
        if (HEYS.YandexAPI?.checkRequiredConsentsBySession) {
          const result = await HEYS.YandexAPI.checkRequiredConsentsBySession(getCurrentLegalVersions());
          if (result.error) throw new Error(result.error?.message || result.error);
          const data = result.data?.check_required_consents_by_session || result.data;
          return {
            valid: data?.valid ?? false,
            missing: data?.missing || REQUIRED_CONSENTS
          };
        }

        return { valid: false, missing: REQUIRED_CONSENTS };
      } catch (err) {
        console.error('[Consents] ❌ Error checking:', err);
        return { valid: false, missing: REQUIRED_CONSENTS, error: err.message };
      }
    },

    /**
     * Отзыв согласия
     */
    async revoke(clientId, consentType) {
      return consentsAPI.revokeConsentBySession(consentType);
    },

    /**
     * Отзыв согласия на обработку health-данных (152-ФЗ ст. 21).
     * Удаляет только health-классифицированные KV (is_health_key) и trial intake
     * через серверный триггер. Дневник и переписка — под personal_data.
     */
    async revokeHealthDataAndPurge() {
      try {
        const result = await consentsAPI.revokeConsentBySession('health_data');
        if (!result?.success) throw new Error(result?.error || 'Не удалось отозвать согласие');

        const deletedKeys = result.deleted_keys ?? 0;
        console.log('[Consents] ✅ Health-data consent revoked, KV keys:', deletedKeys);
        return { success: true, deleted_keys: deletedKeys };
      } catch (err) {
        console.error('[Consents] ❌ Error revoking health-data:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Отзыв согласия на обработку персональных данных + удаление ПДн на сервере
     * (дневник, переписка, фото в очереди cleanup, снапшоты, audit-копии).
     */
    async revokePersonalDataAndPurge() {
      try {
        const result = await consentsAPI.revokeConsentBySession('personal_data');
        if (!result?.success) throw new Error(result?.error || 'Не удалось отозвать согласие');

        const clientId = (HEYS.currentClientId || '').toLowerCase();
        const authKeep = new Set([
          'heys_supabase_auth_token',
          'heys_pin_auth_client',
          'heys_cookie_info_seen',
        ]);
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (!k || authKeep.has(k) || k.startsWith('sb-')) continue;
            if (!clientId) {
              localStorage.removeItem(k);
              continue;
            }
            const scopedMatch = /^heys_([0-9a-f-]{36})_/i.exec(k);
            if (scopedMatch && scopedMatch[1].toLowerCase() !== clientId) continue;
            localStorage.removeItem(k);
          }
        } catch (_) { /* best-effort */ }

        const purge = result.personal_data_purge || {};
        console.log('[Consents] ✅ Personal-data revoked + purged:', purge);
        return {
          success: true,
          deleted_keys: result.deleted_keys ?? purge.deleted_kv ?? 0,
          personal_data_purge: purge,
        };
      } catch (err) {
        console.error('[Consents] ❌ Error revoking personal-data:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Полное удаление аккаунта (152-ФЗ ст. 21). Проверка сессии
     * выполняется внутри RPC. После успеха клиент должен быть выкинут
     * на экран login.
     */
    async deleteAccount() {
      try {
        if (!HEYS.YandexAPI) return { success: false, error: 'No API client' };

        // JS-readable token is optional: HttpOnly cookie sessions are verified
        // inside delete_my_account through the API proxy.
        const sessionToken =
          (HEYS.auth && typeof HEYS.auth.getSessionToken === 'function'
            ? HEYS.auth.getSessionToken()
            : null) || null;

        const res = await HEYS.YandexAPI.deleteMyAccount(sessionToken || null);
        if (res.error) throw new Error(res.error?.message || res.error);

        const success = res.data?.delete_my_account?.success ?? false;
        if (success) {
          // Чистим локальные следы — кэш SW, localStorage, sessionStorage.
          try {
            const keysToKeep = new Set(['heys_cookie_info_seen']);
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const k = localStorage.key(i);
              if (k && !keysToKeep.has(k)) localStorage.removeItem(k);
            }
            sessionStorage.clear();
            if (window.caches && typeof window.caches.keys === 'function') {
              const keys = await window.caches.keys();
              await Promise.all(keys.map((k) => window.caches.delete(k)));
            }
          } catch (_) { /* best-effort */ }
          console.log('[Consents] ✅ Account deleted, local state cleared');
        }
        return { success, raw: res.data };
      } catch (err) {
        console.error('[Consents] ❌ Error deleting account:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Локальная проверка (из localStorage)
     */
    hasLocalConsent(clientId) {
      const key = `heys_consents_${clientId}`;
      const stored = localStorage.getItem(key);
      if (!stored) return false;

      try {
        const data = JSON.parse(stored);
        return REQUIRED_CONSENTS.every(type => data[type] === true);
      } catch {
        return false;
      }
    },

    /**
     * Сохранить локально (для быстрой проверки)
     */
    saveLocal(clientId, consents) {
      const key = `heys_consents_${clientId}`;
      const data = {};
      consents.forEach(c => {
        data[c.type] = c.granted !== false;
      });
      data.timestamp = Date.now();
      data.version = CURRENT_VERSIONS;
      localStorage.setItem(key, JSON.stringify(data));
    }
  };

  function readClientProfile() {
    let profile = null;
    try {
      if (HEYS.store && typeof HEYS.store.get === 'function') {
        profile = HEYS.store.get('heys_profile', null);
      }
    } catch (_) { /* noop */ }
    if (!profile || typeof profile !== 'object') {
      try {
        profile = HEYS.utils?.lsGet?.('heys_profile', {}) || {};
      } catch (_) {
        profile = {};
      }
    }
    return { ...profile };
  }

  function writeClientProfile(next, fields, source) {
    try {
      if (HEYS.store && typeof HEYS.store.set === 'function') {
        HEYS.store.set('heys_profile', next);
      } else if (HEYS.utils?.lsSet) {
        HEYS.utils.lsSet('heys_profile', next);
      }
    } catch (_) { /* noop */ }
    try {
      window.dispatchEvent(new CustomEvent('heys:profile-updated', {
        detail: { fields: fields || [], source: source || 'consents' }
      }));
    } catch (_) { /* noop */ }
  }

  function getPendingOptionalFeatureTypes(profile) {
    const p = profile || {};
    const pending = [];
    if (p.measurementsTrackingEnabled !== true) pending.push('body_measurements');
    if (p.supplementsTrackingEnabled !== true) pending.push('supplements_tracking');
    return pending;
  }

  function shouldOfferOptionalFeatures() {
    try {
      if (typeof window !== 'undefined' && window.__HEYS_READONLY_MODE__?.enabled) return false;
    } catch (_) { /* noop */ }
    const clientId = String(HEYS.currentClientId || '');
    if (clientId && HEYS._optionalFeatureOfferDoneClientId === clientId) return false;
    const profile = readClientProfile();
    if (profile.optionalFeatureConsentsOfferedAt) return false;
    return getPendingOptionalFeatureTypes(profile).length > 0;
  }

  function markOptionalFeatureConsentsOffered(extraFields, source) {
    const clientId = String(HEYS.currentClientId || '');
    if (clientId) HEYS._optionalFeatureOfferDoneClientId = clientId;
    const profile = readClientProfile();
    const extra = extraFields && typeof extraFields === 'object' ? extraFields : {};
    const next = {
      ...profile,
      ...extra,
      optionalFeatureConsentsOfferedAt: profile.optionalFeatureConsentsOfferedAt || Date.now(),
      revision: (Number(profile.revision) || 0) + 1,
      updatedAt: Date.now(),
    };
    writeClientProfile(
      next,
      Object.keys(extra).concat('optionalFeatureConsentsOfferedAt'),
      source || 'optional-feature-offer'
    );
  }

  function applyOptionalFeatureFlagsFromConsents(consentList) {
    const granted = {};
    (Array.isArray(consentList) ? consentList : []).forEach((item) => {
      if (item && item.granted && item.type) granted[item.type] = true;
    });
    const extra = {};
    if (granted.supplements_tracking) {
      extra.supplementsTrackingEnabled = true;
      extra.showDiarySupplementsPanel = true;
    }
    if (granted.body_measurements) {
      extra.measurementsTrackingEnabled = true;
    }
    markOptionalFeatureConsentsOffered(extra, 'consent-screen');
  }

  // =====================================================
  // React компоненты
  // =====================================================

  /**
   * Экран согласий (полноэкранный, блокирующий)
   * @param {string} clientId - ID клиента
   * @param {string} phone - Телефон клиента (для SMS верификации)
   * @param {Array<string|object>} outdatedTypes - Документы, обновлённые для re-consent
   * @param {function} onComplete - Вызывается при успешном принятии согласий
   * @param {function} onCancel - Вызывается при отказе (выход без принятия)
   * @param {function} onError - Вызывается при ошибке
   */
  function ConsentScreen({ clientId, phone, outdatedTypes = [], onComplete, onCancel, onError, diagnosticReplay = false }) {
    // Шаги: 'consents' → 'verify_code' → done
    // ВАЖНО: если SMS выключен — verify_code никогда не используется!
    // HEYS_DEBUG_REPLAY_REGISTRATION: diagnosticReplay — тот же UI, без записи ПЭП
    const [step, setStep] = useState('consents');
    const [consents, setConsents] = useState({
      user_agreement: false,
      personal_data: false,
      health_data: false,
      marketing: false,
      supplements_tracking: false,
      body_measurements: false
    });
    // notifications — отдельный preference, НЕ 152-ФЗ согласие.
    // Default OFF: предустановка ≠ активное действие субъекта (lawyer-review-5 §1).
    const [notificationsOptIn, setNotificationsOptIn] = useState(false);
    const [readRequiredTypes, setReadRequiredTypes] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showFullText, setShowFullText] = useState(null);
    const screenRef = useRef(null);
    // Замороженная копия (stable.heyslab.ru): экран открыт для скринов, запись
    // согласий заблокирована на уровне API — «Продолжить» только закрывает UI.
    const isReadonlyHost = !!(typeof window !== 'undefined'
      && window.__HEYS_READONLY_MODE__
      && window.__HEYS_READONLY_MODE__.enabled);
    const isDiagnosticReplay = diagnosticReplay === true;
    const outdatedTypeSet = new Set(
      (Array.isArray(outdatedTypes) ? outdatedTypes : [])
        .map(item => item?.type || item)
        .filter(Boolean)
    );
    const hasOutdatedDocuments = outdatedTypeSet.size > 0;

    const buildConsentList = useCallback((signatureMethod) => (
      Object.entries(consents)
        .filter(([type, granted]) => {
          if (type === 'supplements_tracking' || type === 'body_measurements') return !!granted;
          return true;
        })
        .map(([type, granted]) => ({
          type,
          granted,
          version: CURRENT_VERSIONS[type] || '1.0',
          signature_method: signatureMethod || 'checkbox'
        }))
    ), [consents]);

    const completeWithoutWrite = useCallback(() => {
      const consentList = buildConsentList('checkbox');
      console.info('[Consents] READONLY_MODE — skip log_consents, continue without write');
      applyOptionalFeatureFlagsFromConsents(consentList);
      onComplete?.(consentList);
    }, [buildConsentList, onComplete]);

    const finishConsentFlow = useCallback(async (consentList) => {
      applyOptionalFeatureFlagsFromConsents(consentList);
      if (notificationsOptIn) {
        try {
          if (HEYS.push?.setEnabled) {
            await HEYS.push.setEnabled(true);
          } else {
            await consentsAPI.setPushConsent(true);
            if (HEYS.push) {
              HEYS.push.subscribe().catch((err) =>
                console.warn('[Consents] push.subscribe failed:', err?.message)
              );
            }
          }
        } catch (err) {
          console.warn('[Consents] setPushConsent failed:', err?.message);
        }
      }
      onComplete?.(consentList);
    }, [notificationsOptIn, onComplete]);

    const persistConsentsOrRequestAccessCode = useCallback(async (consentList) => {
      const result = await consentsAPI.logConsents(clientId, consentList);
      if (result.needsAccessCode) {
        setStep('access_code_sign');
        return { deferred: true };
      }
      if (!result.success) {
        throw new Error(result.error || 'Ошибка сохранения согласий');
      }
      consentsAPI.saveLocal(clientId, consentList);
      return { deferred: false, consentList };
    }, [clientId]);

    useEffect(() => {
      HEYS.BlankScreenGuard?.reportVisibleFrame?.({
        element: screenRef.current,
        screen: 'consent',
        reason: 'consent_screen_painted'
      });
    }, []);

    // SMS verification state
    const [code, setCode] = useState('');
    const [codeSent, setCodeSent] = useState(false);
    const [resendTimer, setResendTimer] = useState(0);
    const codeInputRef = useRef(null);
    const accessSignKeypadRef = useRef(null);
    const pinKeypadKit = HEYS.AuthPinKeypad?.createKit?.(React);
    const useAccessSignPin = pinKeypadKit ? pinKeypadKit.usePinKeypad : useFallbackAccessSignPin;
    const accessSignPinApi = useAccessSignPin({
      disabled: loading,
      idPrefix: 'consent-access-code',
      autoFocus: step === 'access_code_sign',
    });
    const accessSignCode = accessSignPinApi.pinValue;
    const [signAttemptsRemaining, setSignAttemptsRemaining] = useState(3);
    const [signPinError, setSignPinError] = useState(false);
    const [signSuccess, setSignSuccess] = useState(false);
    const [signedConsentList, setSignedConsentList] = useState(null);
    const [signedAt, setSignedAt] = useState(null);
    const prevConsentStepRef = useRef(step);
    const signSheetRef = useRef(null);
    // «клавиатура»: та же механика, что у мастера регистрации
    // (heys_step_modal_v1.js) — пока клавиатура открыта, шторка живёт в высоте
    // visualViewport, и полка с «Подписать» не уезжает под клавиши.
    const [signKeyboardViewportHeight, setSignKeyboardViewportHeight] = useState(0);

    useEffect(() => {
      if (step !== 'access_code_sign' || !accessSignPinApi) {
        prevConsentStepRef.current = step;
        return;
      }
      if (prevConsentStepRef.current === 'access_code_sign') return;
      prevConsentStepRef.current = step;
      accessSignPinApi.resetDigits();
      setSignAttemptsRemaining(3);
      setSignPinError(false);
      setSignSuccess(false);
      setSignedConsentList(null);
      setSignedAt(null);
      setError(null);
    }, [step, accessSignPinApi]);

    // Строка «доступность»: шторка подписи — модальный диалог с запертым
    // фокусом. Первый Tab уводит внутрь листа, дальше обход ходит по кругу и
    // не уходит на экран согласий под подложкой; на выходе фокус возвращается
    // туда, откуда шторку открыли.
    useEffect(() => {
      // Полный текст документа открывается поверх шторки и живёт вне листа —
      // пока он на экране, ловушка молчит, иначе Tab выдёргивало бы фокус из него.
      if (step !== 'access_code_sign' || showFullText) return undefined;
      if (typeof document === 'undefined') return undefined;
      const sheet = signSheetRef.current;
      if (!sheet) return undefined;
      const restoreTo = document.activeElement;
      if (!sheet.contains(document.activeElement)) {
        const first = getSignSheetFocusables(sheet)[0] || sheet;
        try { first.focus(); } catch (_) { /* фокус не критичен */ }
      }
      return () => {
        try {
          if (restoreTo && typeof restoreTo.focus === 'function' && restoreTo.isConnected !== false) {
            restoreTo.focus();
          }
        } catch (_) { /* элемент мог исчезнуть вместе с экраном */ }
      };
    }, [step, showFullText]);

    useEffect(() => {
      if (step !== 'access_code_sign' || showFullText) return undefined;
      if (typeof document === 'undefined') return undefined;
      const onKeyDown = (event) => {
        const sheet = signSheetRef.current;
        if (!sheet) return;
        if (event.key === 'Escape') {
          if (loading || signSuccess || typeof onCancel !== 'function') return;
          event.preventDefault();
          onCancel();
          return;
        }
        if (event.key !== 'Tab') return;
        const items = getSignSheetFocusables(sheet);
        if (!items.length) {
          event.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!sheet.contains(active)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
          return;
        }
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', onKeyDown, true);
      return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [step, showFullText, loading, signSuccess, onCancel]);

    useEffect(() => {
      if (step !== 'access_code_sign') {
        setSignKeyboardViewportHeight(0);
        return undefined;
      }
      const viewport = typeof global !== 'undefined' ? global.visualViewport : null;
      if (!viewport) return undefined;
      const sync = () => {
        const inset = Math.round(global.innerHeight - viewport.height - viewport.offsetTop);
        // Порог отсекает адресную строку и мелкие сдвиги — реагируем на клавиатуру.
        setSignKeyboardViewportHeight(inset > 80 ? Math.round(viewport.height) : 0);
      };
      sync();
      viewport.addEventListener('resize', sync);
      viewport.addEventListener('scroll', sync);
      return () => {
        viewport.removeEventListener('resize', sync);
        viewport.removeEventListener('scroll', sync);
      };
    }, [step]);

    const allRequiredAccepted = REQUIRED_CONSENTS.every(type => consents[type]);
    const requiredConsentReason = (() => {
      const missing = REQUIRED_CONSENTS.filter((type) => !consents[type]);
      if (missing.length === 0) return null;
      if (missing.length === 2) return 'Откройте и дочитайте оба документа';
      if (missing[0] === CONSENT_TYPES.USER_AGREEMENT) {
        return 'Откройте и дочитайте пользовательское соглашение';
      }
      return 'Откройте и дочитайте согласие на персональные данные';
    })();

    const handleRequiredOrOptionalToggle = useCallback((type) => {
      const isRequiredRead = REQUIRED_CONSENTS.includes(type);
      if (isRequiredRead && !readRequiredTypes[type] && !consents[type]) {
        setShowFullText(type);
        return;
      }
      setConsents((prev) => ({ ...prev, [type]: !prev[type] }));
    }, [consents, readRequiredTypes]);

    // =====================================================
    // АВАРИЙНЫЙ ВЫКЛЮЧАТЕЛЬ: если SMS выключен — verify_code невозможен
    // =====================================================
    useEffect(() => {
      if (!SMS_VERIFICATION_ENABLED && step === 'verify_code') {
        console.warn('[Consents] ⚠️ SMS выключен, но step=verify_code — принудительный сброс');
        setStep('consents');
      }
    }, [step]);

    const handleToggle = useCallback((type) => {
      setConsents(prev => ({ ...prev, [type]: !prev[type] }));
    }, []);

    // Отправка SMS кода
    const sendVerificationCode = useCallback(async () => {
      if (!phone) {
        setError('Номер телефона не указан');
        return false;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await HEYS.sms?.sendCode(phone);

        if (result?.success) {
          setCodeSent(true);
          setResendTimer(60);
          return true;
        } else {
          setError(result?.error || 'Ошибка отправки SMS');
          return false;
        }
      } catch (err) {
        setError(err.message);
        return false;
      } finally {
        setLoading(false);
      }
    }, [phone]);

    // Таймер повторной отправки
    useEffect(() => {
      if (resendTimer > 0) {
        const timer = setTimeout(() => setResendTimer(r => r - 1), 1000);
        return () => clearTimeout(timer);
      }
    }, [resendTimer]);

    // Проверка кода
    const verifyCodeAndSubmit = useCallback(async () => {
      if (code.length < 4) {
        setError('Введите код из SMS');
        return;
      }

      if (isReadonlyHost) {
        completeWithoutWrite();
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Проверяем код
        const verifyResult = HEYS.sms?.verifyCode(phone, code);

        if (!verifyResult?.valid) {
          setError(verifyResult?.error || 'Неверный код');
          setLoading(false);
          return;
        }

        // Код верный — сохраняем согласия с методом подписи.
        // Ветка недостижима, пока SMS_VERIFICATION_ENABLED === false (см. выше):
        // 'sms_code' удалён из CHECK-constraint signature_method
        // (database/2026-08-11_consents_pin_confirm_signature.sql), поэтому если
        // флаг когда-нибудь включат обратно, значение здесь тоже нужно решить
        // заново — это часть будущей схемы подписи, не текущей.
        const consentList = buildConsentList('checkbox');

        const persisted = await persistConsentsOrRequestAccessCode(consentList);
        if (persisted.deferred) return;

        await finishConsentFlow(consentList);
      } catch (err) {
        setError(err.message);
        onError?.(err);
      } finally {
        setLoading(false);
      }
    }, [clientId, phone, code, buildConsentList, isReadonlyHost, completeWithoutWrite, finishConsentFlow, persistConsentsOrRequestAccessCode, onError]);

    // Переход к шагу верификации
    const handleProceedToVerify = useCallback(async () => {
      if (!allRequiredAccepted) return;

      // Замороженная копия: запись согласий заблокирована — только закрыть UI.
      if (isReadonlyHost) {
        completeWithoutWrite();
        return;
      }

      // HEYS_DEBUG_REPLAY_REGISTRATION — UI шторки кода, без записи ПЭП
      if (isDiagnosticReplay) {
        setError(null);
        setStep('access_code_sign');
        return;
      }

      // SMS верификация отключена — используем только чекбоксы + логирование
      // Для health-data юридическая достаточность ПЭП подтверждается отдельно.
      if (!SMS_VERIFICATION_ENABLED || !HEYS.sms || !phone) {
        console.log('[Consents] ✅ Сохраняем согласия (чекбокс + логирование, без SMS)');
        // Сохраняем без верификации
        setLoading(true);
        try {
          const consentList = buildConsentList('checkbox');

          const persisted = await persistConsentsOrRequestAccessCode(consentList);
          if (persisted.deferred) return;

          await finishConsentFlow(consentList);
        } catch (err) {
          setError(err.message || 'Неизвестная ошибка');
          onError?.(err);
        } finally {
          setLoading(false);
        }
        return;
      }

      // Переходим к верификации
      setStep('verify_code');
      // Сразу отправляем код
      await sendVerificationCode();
      // Фокус на поле ввода
      setTimeout(() => codeInputRef.current?.focus(), 100);
    }, [allRequiredAccepted, buildConsentList, clientId, phone, isReadonlyHost, isDiagnosticReplay, completeWithoutWrite, finishConsentFlow, persistConsentsOrRequestAccessCode, onError, sendVerificationCode]);

    // Старый handleSubmit для обратной совместимости (без верификации)
    const handleSubmit = useCallback(async () => {
      if (!allRequiredAccepted) return;

      if (isReadonlyHost) {
        completeWithoutWrite();
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Формируем массив согласий
        const consentList = buildConsentList('checkbox');

        const persisted = await persistConsentsOrRequestAccessCode(consentList);
        if (persisted.deferred) return;

        await finishConsentFlow(consentList);
      } catch (err) {
        setError(err.message);
        onError?.(err);
      } finally {
        setLoading(false);
      }
    }, [clientId, buildConsentList, allRequiredAccepted, isReadonlyHost, completeWithoutWrite, finishConsentFlow, persistConsentsOrRequestAccessCode, onError]);

    const handleAccessCodeSign = useCallback(async () => {
      if (signSuccess) {
        if (isDiagnosticReplay) {
          // HEYS_DEBUG_REPLAY_REGISTRATION — закрыть UI, не трогать push/флаги
          onComplete?.(signedConsentList || buildConsentList('checkbox'));
          return;
        }
        await finishConsentFlow(signedConsentList || await buildConsentListForSigning(consents));
        return;
      }

      if (!HEYS.auth?.validatePinStrict?.(accessSignCode)) {
        setError('Введите код доступа из 4 цифр');
        return;
      }

      if (isReadonlyHost) {
        completeWithoutWrite();
        return;
      }

      // HEYS_DEBUG_REPLAY_REGISTRATION — имитация подписи без API
      if (isDiagnosticReplay) {
        const signList = buildConsentList('access_code');
        setSignedConsentList(signList);
        setSignSuccess(true);
        setSignedAt(new Date());
        setSignPinError(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      setSignPinError(false);

      try {
        const signList = await buildConsentListForSigning(consents);
        if (!signList.length) {
          throw new Error('Нет документов для подписи');
        }
        const result = await consentsAPI.signConsentsWithAccessCode(signList, accessSignCode);
        if (!result.success) {
          const errCode = String(result.error || '');
          if (errCode.includes('invalid_access_code') || errCode.includes('access_code')) {
            const nextAttempts = Math.max(0, signAttemptsRemaining - 1);
            setSignAttemptsRemaining(nextAttempts);
            setSignPinError(true);
            accessSignPinApi.resetDigits();
            // Строка «ошибка при подписании»: называем цену — что будет,
            // когда попытки кончатся. Прежде счётчик стоял без последствий.
            throw new Error(nextAttempts > 0
              ? `Код не подошёл. Осталось ${nextAttempts} ${nextAttempts === 1 ? 'попытка' : (nextAttempts < 5 ? 'попытки' : 'попыток')}, дальше вход закроется и понадобится куратор.`
              : 'Код не подошёл. Вход закрыт — напишите куратору, он откроет доступ.');
          }
          throw new Error(errCode || 'Не удалось подписать документы');
        }
        consentsAPI.saveLocal(clientId, signList);
        setSignedConsentList(signList);
        setSignSuccess(true);
        setSignedAt(new Date());
        setSignPinError(false);
        setError(null);
      } catch (err) {
        setError(err.message);
        onError?.(err);
      } finally {
        setLoading(false);
      }
    }, [accessSignCode, clientId, consents, signAttemptsRemaining, signSuccess, signedConsentList, finishConsentFlow, isReadonlyHost, isDiagnosticReplay, completeWithoutWrite, onComplete, onError, accessSignPinApi, buildConsentList]);

    const signAutoSubmitLockRef = useRef(false);
    useEffect(() => {
      if (step !== 'access_code_sign' || signSuccess || loading) return;
      if (!accessSignPinApi?.isComplete) return;
      if (signAutoSubmitLockRef.current) return;
      signAutoSubmitLockRef.current = true;
      Promise.resolve(handleAccessCodeSign()).finally(() => {
        signAutoSubmitLockRef.current = false;
      });
    }, [step, signSuccess, loading, accessSignPinApi?.isComplete, handleAccessCodeSign]);

    if (step === 'access_code_sign') {
      const signedDocRows = (signedConsentList || [])
        .filter((item) => item?.granted && CONSENT_SIGN_SHEET_DOCS.includes(item.type));
      const signedDocsForDisplay = signedDocRows.length
        ? signedDocRows
        : CONSENT_SIGN_SHEET_DOCS.map((type) => ({
          type,
          granted: true,
          version: CURRENT_VERSIONS[type] || '1.0',
        }));

      // Строка «подпись документа»: в шторке видно, что подписывается, и есть
      // ссылка на документ. Раньше стоял только заголовок «Подпишите документы».
      const signDocName = (type) => CONSENT_TEXTS.checkboxes[type]?.screenLabel
        || CONSENT_TEXTS.checkboxes[type]?.label
        || type;
      const signSheetTitle = signedDocsForDisplay.length === 1
        ? signDocName(signedDocsForDisplay[0].type)
        : 'Подпишите документы';

      return React.createElement('div', {
        ref: screenRef,
        'data-heys-visible-frame': signSuccess ? 'consent-signed' : 'consent-sign',
        className: 'heys-consent-sign-root',
        style: CONSENT_SIGN_ROOT_STYLE,
      },
        React.createElement('div', {
          className: 'heys-consent-sign-backdrop',
          style: CONSENT_SIGN_BACKDROP_STYLE,
          onClick: () => { if (!loading && !signSuccess && typeof onCancel === 'function') onCancel(); },
        }),
        React.createElement('div', {
          className: 'heys-consent-sign-frame',
          // «клавиатура»: пока клавиатура открыта, рама шторки живёт в высоте
          // visualViewport — лист сжимается, полка поднимается над клавишами.
          style: signKeyboardViewportHeight > 0
            ? { ...CONSENT_SIGN_FRAME_STYLE, bottom: 'auto', height: `${signKeyboardViewportHeight}px` }
            : CONSENT_SIGN_FRAME_STYLE,
        },
          React.createElement('div', {
            className: 'heys-consent-sign-sheet'
              + (signSuccess ? ' heys-consent-sign-sheet--done' : ' heys-consent-sign-sheet--sign'),
            style: CONSENT_SIGN_SHEET_STYLE,
            ref: signSheetRef,
            role: 'dialog',
            'aria-modal': 'true',
            // Строка «доступность»: лист сам принимает фокус, когда внутри ещё
            // некуда его поставить, — иначе ловушка осталась бы без якоря.
            tabIndex: -1,
            'aria-label': signSuccess ? 'Документы подписаны' : 'Подписание',
          },
          // Строка «вид шторки подписи»: ручка 38×4 сверху листа.
          React.createElement('div', {
            className: 'heys-consent-sign-sheet__handle',
            'aria-hidden': 'true',
          }),
          React.createElement('div', { className: 'heys-consent-sign-sheet__body' },
          React.createElement('div', { className: 'heys-consent-sign-sheet__kicker' }, 'Подписание'),
          React.createElement('div', { className: 'heys-consent-sign-sheet__title' }, signSheetTitle),
          signedDocsForDisplay.map((item) => React.createElement('div', {
            key: 'sign_doc_' + item.type,
            className: 'heys-consent-sign-sheet__doc-link-row',
          },
            React.createElement('span', { className: 'heys-consent-sign-sheet__doc-edition' },
              (signedDocsForDisplay.length === 1 ? 'Редакция ' : signDocName(item.type) + ', редакция ')
              + (item.version || CURRENT_VERSIONS[item.type] || '1.0')
            ),
            React.createElement('button', {
              type: 'button',
              className: 'heys-consent-sign-sheet__doc-link',
              onClick: () => setShowFullText(item.type),
            }, 'Читать')
          )),
          signSuccess
            ? React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'heys-consent-sign-sheet__done', role: 'status' },
                React.createElement('span', { className: 'heys-consent-sign-sheet__done-icon' },
                  renderConsentSignDoneIcon()
                ),
                React.createElement('div', { className: 'heys-consent-sign-sheet__done-title' },
                  'Документы подписаны'
                ),
                React.createElement('div', { className: 'heys-consent-sign-sheet__done-meta' },
                  formatAccessCodeSignMeta(signedAt)
                )
              ),
              React.createElement('div', { className: 'heys-consent-sign-sheet__doc-card' },
                signedDocsForDisplay.map((item, index) => {
                  const label = CONSENT_TEXTS.checkboxes[item.type]?.screenLabel
                    || CONSENT_TEXTS.checkboxes[item.type]?.label
                    || item.type;
                  const version = item.version || CURRENT_VERSIONS[item.type] || '1.0';
                  return React.createElement(React.Fragment, { key: item.type },
                    index > 0 && React.createElement('div', {
                      className: 'heys-consent-sign-sheet__doc-divider',
                      'aria-hidden': 'true',
                    }),
                    React.createElement('div', { className: 'heys-consent-sign-sheet__doc-row' },
                      React.createElement('span', { className: 'heys-consent-sign-sheet__doc-name' }, label),
                      React.createElement('span', { className: 'heys-consent-sign-sheet__doc-version' }, `в. ${version}`)
                    )
                  );
                })
              ),
              // Строка «после подписи»: запись — документ, версия, время и
              // устройство, тот же список, что в журнале.
              React.createElement('p', { className: 'heys-consent-sign-sheet__done-note' },
                'Запись о подписании сохранена: документ, версия, время и устройство. Копию можно запросить у куратора.'
              )
            )
            : React.createElement(React.Fragment, null,
              pinKeypadKit
                ? pinKeypadKit.renderPinKeypadSection({
                  pin: accessSignPinApi,
                  label: 'Код доступа',
                  labelClassName: 'heys-auth-label',
                  sectionClassName: 'heys-auth-pin-section space-y-3 is-active'
                    + (signPinError ? ' is-error' : ''),
                  gridClassName: signPinError ? 'is-error' : '',
                  keypadRef: accessSignKeypadRef,
                })
                : null,
              error && React.createElement('div', {
                className: 'heys-consent-sign-sheet__error',
                role: 'alert',
              }, error)
            )
          ),
          // Строка «вид полки с кнопкой»: строка и кнопка закреплены внизу листа
          // и не уезжают с содержимым; в фазе ввода кнопки прежде не было вовсе.
          React.createElement('div', { className: 'heys-consent-sign-sheet__dock' },
            !signSuccess && React.createElement('p', { className: 'heys-consent-sign-sheet__hint' },
              'Код вводится каждый раз при подписании — даже на запомненном устройстве. Так подпись не зависит от того, у кого в руках телефон.'
            ),
            React.createElement('button', {
              type: 'button',
              className: 'heys-consent-sign-sheet__primary'
                + (signSuccess ? ' heys-consent-sign-sheet__primary--continue' : ''),
              disabled: !!loading || (!signSuccess && !accessSignPinApi?.isComplete),
              onClick: handleAccessCodeSign,
            },
              // Спиннеры, строка «когда есть»: подписание документа — одно из
              // четырёх мест с ответом сервера, значит дуга не исчезает, а
              // досчитывается до галочки на том же месте.
              // Строка «после подписи»: подпись регистрацию не заканчивает —
              // кнопка ведёт дальше словом «Продолжить», а не «Готово».
              HEYS.WaitMark?.button?.(React, {
                busy: !!loading && !signSuccess,
                ok: !!signSuccess,
                idle: signSuccess ? 'Продолжить' : 'Подписать',
                busyLabel: 'Подписываем',
                okLabel: 'Продолжить',
              }) || (signSuccess ? 'Продолжить' : (loading ? 'Подписываем…' : 'Подписать'))),
            !signSuccess && typeof onCancel === 'function' && React.createElement('button', {
              type: 'button',
              className: 'heys-consent-sign-sheet__cancel',
              disabled: !!loading,
              onClick: () => onCancel(),
            }, 'Отмена')
          )
          )
        ),
        showFullText && React.createElement(FullTextModal, {
          type: showFullText,
          onClose: () => setShowFullText(null),
          onAccept: () => setShowFullText(null),
        }),
      );
    }

    // UI-гейт: цель — подписать обязательные; главное — Подписать оба / Подписать;
    // слой 1 — документы и галочки; слой 2 — необязательные после обязательных;
    // критическое — «Важно» и полный текст до галочки.
    return React.createElement('div', {
      ref: screenRef,
      'data-heys-visible-frame': 'consent',
      className: 'fixed inset-0 flex flex-col',
      style: { backgroundColor: '#fffaf1', zIndex: 11000 }
    },
      step !== 'consents' && React.createElement('div', {
        className: 'p-4',
        style: { paddingTop: 20 }
      },
        React.createElement('h1', {
          style: { font: '700 20px/1.3 Figtree, system-ui, sans-serif', color: '#201e1d' }
        }, step === 'verify_code' ? 'Подтверждение' : 'Подпишите документы'),
        React.createElement('p', {
          style: {
            marginTop: 8,
            font: '500 12px/1.5 Figtree, system-ui, sans-serif',
            color: 'rgba(0,0,0,.55)',
          }
        }, step === 'verify_code'
          ? 'Введите код из SMS для подтверждения согласия на обработку данных о здоровье'
          : 'Введите код доступа — он заменяет собственноручную подпись.')
      ),

      // READONLY: постоянный баннер — эталон для скринов, запись недоступна
      isReadonlyHost && React.createElement('div', {
        'data-testid': 'consents-readonly-banner',
        className: 'px-4 py-2 text-sm',
        style: { backgroundColor: '#fef3c7', color: '#92400e', borderBottom: '1px solid #fcd34d' }
      }, 'Замороженная копия — только просмотр. Согласия не сохраняются.'),

      // Content - разные шаги
      step === 'consents' ? (
        React.createElement('div', {
          className: 'flex-1 overflow-auto',
          style: { padding: '16px 18px 0' }
        },
          !allRequiredAccepted && React.createElement(React.Fragment, null,
            React.createElement('div', {
              style: {
                font: '700 20px/1.3 Figtree, system-ui, sans-serif',
                color: '#201e1d',
                marginTop: 6,
                textWrap: 'pretty',
              }
            }, 'Согласия и условия'),
            React.createElement('div', {
              style: {
                marginTop: 8,
                font: '500 12px/1.5 Figtree, system-ui, sans-serif',
                color: 'rgba(0,0,0,.55)',
                textWrap: 'pretty',
              }
            }, hasOutdatedDocuments
              ? 'Проверьте содержание документов и подтвердите актуальные условия'
              : 'Оба документа открываются целиком: отметка появится, когда дочитаете до конца.'),
            React.createElement('div', {
              style: {
                backgroundColor: '#f6e6dd',
                borderRadius: 18,
                padding: '13px 15px',
                marginTop: 16,
              }
            },
              React.createElement('div', {
                style: { font: '700 12px/1.4 Figtree, system-ui, sans-serif', color: '#a1471c' }
              }, 'Важно'),
              React.createElement('div', {
                style: {
                  marginTop: 4,
                  font: '500 11.5px/1.5 Figtree, system-ui, sans-serif',
                  color: 'rgba(0,0,0,.6)',
                  textWrap: 'pretty',
                }
              }, CONSENT_TEXTS.disclaimer.short)
            )
          ),

          React.createElement('div', {
            style: { display: 'flex', flexDirection: 'column', gap: allRequiredAccepted ? 6 : 8, marginTop: allRequiredAccepted ? 16 : 8 }
          },
            allRequiredAccepted && React.createElement('div', {
              style: {
                font: '600 10px/1 Figtree, system-ui, sans-serif',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: '#8a4a20',
                marginBottom: 2,
              }
            }, 'Обязательные'),
            React.createElement(ConsentCheckbox, {
              type: 'user_agreement',
              checked: consents.user_agreement,
              requireRead: true,
              hasRead: !!readRequiredTypes.user_agreement,
              useScreenCopy: true,
              compact: allRequiredAccepted,
              onChange: () => handleRequiredOrOptionalToggle('user_agreement'),
              config: CONSENT_TEXTS.checkboxes.user_agreement,
              onShowFull: () => setShowFullText('user_agreement')
            }),

            React.createElement(ConsentCheckbox, {
              type: 'personal_data',
              checked: consents.personal_data,
              requireRead: true,
              hasRead: !!readRequiredTypes.personal_data,
              useScreenCopy: true,
              compact: allRequiredAccepted,
              onChange: () => handleRequiredOrOptionalToggle('personal_data'),
              config: CONSENT_TEXTS.checkboxes.personal_data,
              onShowFull: () => setShowFullText('personal_data')
            }),

            allRequiredAccepted && React.createElement(React.Fragment, null,
              React.createElement('div', {
                style: {
                  font: '600 10px/1 Figtree, system-ui, sans-serif',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: '#8a4a20',
                  marginTop: 10,
                  marginBottom: 2,
                }
              }, 'Можно включить, можно нет'),

              React.createElement(ConsentCheckbox, {
                type: 'body_measurements',
                checked: consents.body_measurements,
                useScreenCopy: true,
                onChange: () => handleToggle('body_measurements'),
                config: CONSENT_TEXTS.checkboxes.body_measurements,
                onShowFull: () => setShowFullText('body_measurements')
              }),

              React.createElement(ConsentCheckbox, {
                type: 'supplements_tracking',
                checked: consents.supplements_tracking,
                useScreenCopy: true,
                onChange: () => handleToggle('supplements_tracking'),
                config: CONSENT_TEXTS.checkboxes.supplements_tracking,
                onShowFull: () => setShowFullText('supplements_tracking')
              }),

              React.createElement(ConsentCheckbox, {
                type: 'notifications',
                checked: notificationsOptIn,
                useScreenCopy: true,
                onChange: () => setNotificationsOptIn(v => !v),
                config: CONSENT_TEXTS.checkboxes.notifications
              }),

              React.createElement(ConsentCheckbox, {
                type: 'marketing',
                checked: consents.marketing,
                useScreenCopy: true,
                onChange: () => handleToggle('marketing'),
                config: CONSENT_TEXTS.checkboxes.marketing
              }),

              React.createElement('p', {
                style: {
                  marginTop: 12,
                  font: '500 11px/1.5 Figtree, system-ui, sans-serif',
                  color: 'rgba(0,0,0,.42)',
                  textWrap: 'pretty',
                }
              }, 'Необязательное отмечается тапом и меняется в настройках в любой момент. Заранее ничего не включено.')
            )
          ),

          error && React.createElement('div', {
            className: 'rounded-xl p-4',
            style: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', marginTop: 12 }
          }, '❌ ', error)
        )
      ) : step === 'access_code_sign' ? (
        React.createElement('div', {
          className: 'flex-1 overflow-auto p-4 space-y-4'
        },
          React.createElement('div', {
            className: 'rounded-xl p-4',
            style: { backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }
          },
            React.createElement('p', {
              className: 'text-sm',
              style: { color: '#1e40af' }
            }, 'Код доступа — ваша простая электронная подпись. Никому его не сообщайте, в том числе куратору.')
          ),
          React.createElement('div', { className: 'space-y-2' },
            pinKeypadKit
              ? pinKeypadKit.renderPinKeypadSection({
                pin: accessSignPinApi,
                label: 'Код доступа',
                labelClassName: 'block text-sm font-medium',
                sectionClassName: 'heys-auth-pin-section space-y-3 is-active',
                keypadRef: accessSignKeypadRef,
              })
              : React.createElement(React.Fragment, null,
                React.createElement('label', {
                  className: 'block text-sm font-medium',
                  style: { color: '#3f3f46' }
                }, 'Код доступа'),
                React.createElement('input', {
                  type: 'tel',
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  maxLength: 4,
                  placeholder: '• • • •',
                  value: accessSignCode,
                  onChange: (e) => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 4);
                    accessSignPinApi.applyPinDigits(next.split('').concat(['', '', '', '']).slice(0, 4));
                  },
                  className: 'w-full px-4 py-4 text-center text-2xl font-bold tracking-widest rounded-xl',
                  style: {
                    border: '2px solid #e5e7eb',
                    outline: 'none',
                    letterSpacing: '0.5em'
                  },
                  disabled: loading
                })
              )
          ),
          error && React.createElement('div', {
            className: 'rounded-xl p-4',
            style: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }
          }, '❌ ', error)
        )
      ) : (
        // Шаг 2: Ввод кода SMS
        React.createElement('div', {
          className: 'flex-1 overflow-auto p-4 space-y-4'
        },
          // Инфо о коде
          React.createElement('div', {
            className: 'rounded-xl p-4',
            style: { backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }
          },
            React.createElement('div', {
              className: 'flex items-start gap-3'
            },
              React.createElement('span', { className: 'text-xl' }, '📱'),
              React.createElement('div', null,
                React.createElement('p', {
                  className: 'font-medium',
                  style: { color: '#1e40af' }
                }, codeSent ? 'Код отправлен' : 'Отправляем код...'),
                React.createElement('p', {
                  className: 'text-sm mt-1',
                  style: { color: '#3b82f6' }
                }, codeSent
                  ? `SMS с кодом отправлено на номер ${phone?.replace(/(\d{1})(\d{3})(\d{3})(\d{2})(\d{2})/, '+$1 ($2) ***-**-$5')}`
                  : 'Подождите, идёт отправка...')
              )
            )
          ),

          // Поле ввода кода
          React.createElement('div', {
            className: 'space-y-2'
          },
            React.createElement('label', {
              className: 'block text-sm font-medium',
              style: { color: '#3f3f46' }
            }, 'Код из SMS'),
            React.createElement('input', {
              ref: codeInputRef,
              type: 'text',
              inputMode: 'numeric',
              pattern: '[0-9]*',
              maxLength: 4,
              placeholder: '• • • •',
              value: code,
              onChange: (e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4)),
              className: 'w-full px-4 py-4 text-center text-2xl font-bold tracking-widest rounded-xl',
              style: {
                border: '2px solid #e5e7eb',
                outline: 'none',
                letterSpacing: '0.5em'
              },
              disabled: loading
            })
          ),

          // Повторная отправка
          React.createElement('div', {
            className: 'text-center'
          },
            resendTimer > 0
              ? React.createElement('p', {
                className: 'text-sm',
                style: { color: '#71717a' }
              }, `Отправить повторно через ${resendTimer} сек`)
              : React.createElement('button', {
                type: 'button',
                onClick: sendVerificationCode,
                disabled: loading,
                className: 'text-sm font-medium',
                style: { color: '#3b82f6' }
              }, '🔄 Отправить код повторно')
          ),

          // Пояснение
          React.createElement('div', {
            className: 'rounded-xl p-4',
            style: { backgroundColor: '#f4f4f5' }
          },
            React.createElement('p', {
              className: 'text-sm',
              style: { color: '#71717a' }
            }, '🔒 Подтверждение кодом требуется для согласия на обработку данных о здоровье в соответствии с 152-ФЗ ст.10')
          ),

          // Error
          error && React.createElement('div', {
            className: 'rounded-xl p-4',
            style: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }
          }, '❌ ', error)
        )
      ),

      // Footer
      React.createElement('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '10px 18px calc(14px + env(safe-area-inset-bottom, 0px))',
          backgroundColor: '#fffaf1',
        }
      },
        step === 'consents' ? (
          React.createElement(React.Fragment, null,
            requiredConsentReason && React.createElement('div', {
              style: {
                textAlign: 'center',
                font: '600 11.5px/1.45 Figtree, system-ui, sans-serif',
                color: 'rgba(0,0,0,.5)',
              }
            }, requiredConsentReason),
            React.createElement('button', {
              onClick: handleProceedToVerify,
              disabled: !allRequiredAccepted || loading,
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 48,
                borderRadius: 999,
                border: 'none',
                font: '700 13px/1 Figtree, system-ui, sans-serif',
                backgroundColor: allRequiredAccepted && !loading ? '#c67139' : '#f7efe2',
                color: allRequiredAccepted && !loading ? '#2b1608' : 'rgba(0,0,0,.3)',
                cursor: allRequiredAccepted && !loading ? 'pointer' : 'not-allowed',
              }
            }, HEYS.WaitMark?.button?.(React, {
              busy: loading,
              idle: isReadonlyHost ? 'Продолжить' : (allRequiredAccepted ? 'Подписать' : 'Подписать оба'),
              busyLabel: 'Загружаем',
            }) || (loading ? 'Загружаем…' : (isReadonlyHost ? 'Продолжить' : (allRequiredAccepted ? 'Подписать' : 'Подписать оба')))),
            !allRequiredAccepted && onCancel && React.createElement('button', {
              onClick: onCancel,
              disabled: loading,
              type: 'button',
              style: {
                // Строка «цель касания»: минимум 44 — кадр рисует 40, верен контракт.
                minHeight: 44,
                border: 'none',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                font: '700 12px/1 Figtree, system-ui, sans-serif',
                color: 'rgba(0,0,0,.5)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }
            }, 'Выйти без регистрации')
          )
        ) : step === 'access_code_sign' ? (
          React.createElement('button', {
            onClick: handleAccessCodeSign,
            disabled: !accessSignPinApi.isComplete || loading,
            className: 'w-full py-4 rounded-xl font-semibold text-white transition-all',
            style: {
              backgroundColor: accessSignPinApi.isComplete && !loading ? '#22c55e' : '#d4d4d8',
              cursor: accessSignPinApi.isComplete && !loading ? 'pointer' : 'not-allowed'
            }
          }, HEYS.WaitMark?.button?.(React, {
            busy: loading,
            idle: 'Подписать', busyLabel: 'Подписываем',
          }) || (loading ? 'Подписываем…' : 'Подписать'))
        ) : (
          // Кнопка "Подтвердить" код
          React.createElement('button', {
            onClick: verifyCodeAndSubmit,
            disabled: code.length < 4 || loading,
            className: 'w-full py-4 rounded-xl font-semibold text-white transition-all',
            style: {
              backgroundColor: code.length >= 4 && !loading ? '#22c55e' : '#d4d4d8',
              cursor: code.length >= 4 && !loading ? 'pointer' : 'not-allowed'
            }
          }, HEYS.WaitMark?.button?.(React, {
            busy: loading,
            idle: 'Подтвердить', busyLabel: 'Проверяем',
          }) || (loading ? 'Проверяем…' : 'Подтвердить'))
        ),

        // Кнопка "Назад" для verify / access (не canvas-кадр согласий)
        step === 'verify_code' ? (
          React.createElement('button', {
            onClick: () => { setStep('consents'); setError(null); setCode(''); },
            disabled: loading,
            className: 'w-full py-3 rounded-xl font-medium transition-all',
            style: { color: '#71717a' }
          }, '← Назад к согласиям')
        ) : step === 'access_code_sign' ? (
          React.createElement('button', {
            onClick: () => { setStep('consents'); setError(null); setAccessSignCode(''); },
            disabled: loading,
            className: 'w-full py-3 rounded-xl font-medium transition-all',
            style: { color: '#71717a' }
          }, '← Назад к согласиям')
        ) : null
      ),

      // Full text modal
      showFullText && React.createElement(FullTextModal, {
        type: showFullText,
        onClose: () => setShowFullText(null),
        onAccept: () => {
          const acceptedType = showFullText;
          if (REQUIRED_CONSENTS.includes(acceptedType)) {
            setReadRequiredTypes((prev) => ({ ...prev, [acceptedType]: true }));
          }
          setConsents((prev) => ({ ...prev, [acceptedType]: true }));
          setShowFullText(null);
        }
      })
    );
  }

  /**
   * Чекбокс согласия
   */
  function ConsentCheckbox({ type, checked, onChange, config, onShowFull, requireRead = false, hasRead = false, useScreenCopy = false, compact = false }) {
    const checkedStyle = {
      border: '1px solid #22c55e',
      backgroundColor: '#f0fdf4'
    };
    const uncheckedStyle = {
      border: '1px solid #e5e7eb',
      backgroundColor: '#ffffff'
    };
    const title = (useScreenCopy && config.screenLabel) || config.label;
    const disclosure = (useScreenCopy && config.screenSummary) || config.summary;
    const optionalHint = useScreenCopy ? (config.screenHint || '') : '';
    const lockUntilRead = requireRead && !hasRead && !checked;
    const canvasCard = useScreenCopy === true;
    const cardStyle = canvasCard
      ? {
        backgroundColor: '#f7efe2',
        border: 'none',
        borderRadius: compact ? 14 : 18,
      }
      : (checked ? checkedStyle : uncheckedStyle);
    const boxStyle = canvasCard
      ? (checked
        ? { border: 'none', backgroundColor: '#c67139', boxShadow: 'none' }
        : { border: 'none', backgroundColor: '#fffaf1', boxShadow: 'inset 0 0 0 2px rgba(0,0,0,.18)' })
      : (checked
        ? { border: '2px solid #22c55e', backgroundColor: '#22c55e' }
        : { border: '2px solid #d4d4d8', backgroundColor: 'transparent' });

    const openFull = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onShowFull?.();
    };

    return React.createElement('label', {
      className: canvasCard ? '' : 'flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all',
      style: canvasCard
        ? {
          ...cardStyle,
          display: 'flex',
          alignItems: compact ? 'center' : 'flex-start',
          gap: 11,
          padding: compact ? '11px 13px' : '11px 14px',
          cursor: 'pointer',
        }
        : { ...cardStyle, padding: compact ? '11px 13px' : undefined }
    },
      React.createElement('div', {
        style: {
          ...boxStyle,
          width: 22,
          height: 22,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
          marginTop: compact ? 0 : 1,
        }
      },
        checked && (canvasCard
          ? React.createElement('svg', {
            width: compact ? 12 : 12,
            height: compact ? 12 : 12,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: '#fffaf1',
            strokeWidth: 3.5,
            strokeLinecap: 'round',
            'aria-hidden': 'true',
          }, React.createElement('path', { d: 'M5 13l4 4L19 7' }))
          : React.createElement('span', { className: 'text-white text-sm' }, '✓'))
      ),

      React.createElement('div', {
        style: { flex: 1, minWidth: 0 }
      },
        React.createElement('span', {
          style: {
            display: 'inline',
            font: canvasCard
              ? (compact ? '600 12px/1.35 Figtree, system-ui, sans-serif' : '600 12.5px/1.4 Figtree, system-ui, sans-serif')
              : undefined,
            color: checked && canvasCard ? '#201e1d' : (canvasCard ? 'rgba(0,0,0,.55)' : '#3f3f46'),
          },
          className: canvasCard ? undefined : 'text-sm'
        }, title),

        // Строка «доступность»: обязательность названа словом, а не звёздочкой —
        // скринридер читает «звёздочка» и смысла не передаёт. Звёздочка кадра
        // остаётся на экране («вид пункта согласия»), но уходит из озвучки.
        config.required && !compact && React.createElement(React.Fragment, null,
          React.createElement('span', {
            style: { color: canvasCard ? '#8a4a20' : '#ef4444', marginLeft: 4 },
            'aria-hidden': 'true',
          }, '*'),
          React.createElement('span', { className: 'sr-only' }, ' — обязательно')
        ),

        !compact && (config.required || !useScreenCopy) && disclosure && React.createElement('div', {
          style: {
            marginTop: 8,
            backgroundColor: '#fffaf1',
            borderRadius: 14,
            padding: '9px 12px',
          }
        },
          React.createElement('div', {
            style: { font: '700 10.5px/1.3 Figtree, system-ui, sans-serif', color: '#5c6a45' }
          }, 'Коротко и честно'),
          React.createElement('div', {
            style: {
              marginTop: 4,
              font: '500 11px/1.5 Figtree, system-ui, sans-serif',
              color: 'rgba(0,0,0,.55)',
              textWrap: 'pretty',
            }
          }, disclosure)
        ),

        !config.required && optionalHint && React.createElement('span', {
          style: {
            display: 'block',
            marginTop: 3,
            font: '500 10.5px/1.4 Figtree, system-ui, sans-serif',
            color: 'rgba(0,0,0,.42)',
          }
        }, optionalHint),

        !compact && config.link && (!useScreenCopy || config.required) && React.createElement('button', {
          type: 'button',
          onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            onShowFull?.();
          },
          style: canvasCard
            ? {
              display: 'flex',
              alignItems: 'center',
              // Строка «цель касания»: минимум 44 — кадр рисует 40, верен контракт.
              minHeight: 44,
              marginTop: 0,
              padding: 0,
              border: 'none',
              background: 'transparent',
              font: '700 11.5px/1 Figtree, system-ui, sans-serif',
              color: '#8a4a20',
              cursor: 'pointer',
            }
            : { color: '#3b82f6' },
          className: canvasCard ? undefined : 'block mt-1 text-xs hover:underline'
        }, 'Читать полностью →')
      ),

      React.createElement('input', {
        type: 'checkbox',
        checked: checked,
        onChange: lockUntilRead ? openFull : onChange,
        className: 'sr-only'
      })
    );
  }

  // === Маппинг типов согласий на markdown файлы ===
  // Файлы находятся в public/docs/ (симлинк на docs/legal/)
  // ⚠️ ВАЖНО (радикально против CDN-кэша):
  // - НИКОГДА не перезаписываем одну и ту же версию документа по одному и тому же URL.
  // - При изменении текста документа — увеличиваем CURRENT_VERSIONS.
  // - Приложение грузит документы по УНИКАЛЬНОМУ пути: /docs/v<version>/...
  // - /docs/... остаётся как "latest" (для прямых ссылок/инспекции), но может залипать на edge.
  function buildVersionedDocPath(fileName, version) {
    return `/docs/v${version}/${fileName}`;
  }

  function buildLatestDocPath(fileName, version) {
    // Query — как дополнительный cache-busting на стороне браузера/Service Worker.
    // Важно: CDN может игнорировать query, поэтому это НЕ основная защита.
    return `/docs/${fileName}?v=${version}`;
  }

  function escapeRegExp(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isExpectedDocVersion(markdown, expectedVersion) {
    // Не все документы версионируются (например, chat rules) — тогда проверка не нужна.
    if (!expectedVersion) return true;
    if (!markdown) return false;

    const v = escapeRegExp(expectedVersion);
    // **Версия:** 1.2 — большинство legal-шаблонов
    const boldRe = new RegExp(`\\*\\*Версия:\\*\\*\\s*${v}(\\b|\\s|$)`);
    // Версия: 1.2. — push 1.2 и часть новых текстов без markdown-bold
    const plainRe = new RegExp(`(?:^|\\n)\\s*Версия:\\s*${v}(\\.|\\b|\\s)`, 'i');
    return boldRe.test(markdown) || plainRe.test(markdown);
  }

  const DOC_PATHS = {
    user_agreement: {
      versioned: buildVersionedDocPath('user-agreement.md', CURRENT_VERSIONS.user_agreement),
      latest: buildLatestDocPath('user-agreement.md', CURRENT_VERSIONS.user_agreement)
    },
    personal_data: {
      versioned: buildVersionedDocPath('personal-data-consent.md', CURRENT_VERSIONS.personal_data),
      latest: buildLatestDocPath('personal-data-consent.md', CURRENT_VERSIONS.personal_data)
    },
    health_data: {
      // Отдельный документ согласия на данные о здоровье (152-ФЗ ст.10)
      versioned: buildVersionedDocPath('health-data-consent.md', CURRENT_VERSIONS.health_data),
      latest: buildLatestDocPath('health-data-consent.md', CURRENT_VERSIONS.health_data)
    },
    marketing: {
      versioned: buildVersionedDocPath('marketing-consent.md', CURRENT_VERSIONS.marketing),
      latest: buildLatestDocPath('marketing-consent.md', CURRENT_VERSIONS.marketing)
    },
    supplements_tracking: {
      versioned: buildVersionedDocPath('supplements-consent.md', '1.0'),
      latest: buildLatestDocPath('supplements-consent.md', '1.0')
    },
    body_measurements: {
      versioned: buildVersionedDocPath('body-measurements-consent.md', '1.0'),
      latest: buildLatestDocPath('body-measurements-consent.md', '1.0')
    },
    speech_transcription: {
      // Нужен не онбордингу, а повторной подписи: без записи здесь клиент не
      // может достать текст, а без текста серверная подпись не проходит —
      // sign_consents_with_access_code_by_session сверяет sha256 с реестром.
      versioned: buildVersionedDocPath('speech-transcription-consent.md', CURRENT_VERSIONS.speech_transcription),
      latest: buildLatestDocPath('speech-transcription-consent.md', CURRENT_VERSIONS.speech_transcription)
    },
    push_notifications: {
      versioned: buildVersionedDocPath('push-notifications-consent.md', CURRENT_VERSIONS.push_notifications),
      latest: buildLatestDocPath('push-notifications-consent.md', CURRENT_VERSIONS.push_notifications)
    }
  };

  const OPTIONAL_FEATURE_VERSIONS = Object.freeze({
    supplements_tracking: '1.0',
    body_measurements: '1.0',
  });

  function getDocExpectedVersion(type) {
    return CURRENT_VERSIONS[type]
      || HEYS.LegalVersions?.[type]
      || OPTIONAL_FEATURE_VERSIONS[type]
      || null;
  }

  const rawMarkdownCache = {};

  // Реестр считает sha256 по LF (verify-legal-release / миграция).
  // Windows checkout отдаёт те же файлы с CRLF — без нормализации подпись
  // падает с document_text_hash_mismatch.
  function normalizeLegalDocumentText(text) {
    return String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  }

  async function fetchConsentDocumentMarkdown(type) {
    if (rawMarkdownCache[type]) return rawMarkdownCache[type];

    const docInfo = DOC_PATHS[type];
    if (!docInfo) {
      throw new Error('document_not_found:' + type);
    }

    async function fetchMarkdown(url) {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    }

    const expectedVersion = getDocExpectedVersion(type);
    let markdown;
    try {
      markdown = await fetchMarkdown(docInfo.versioned);
      if (!isExpectedDocVersion(markdown, expectedVersion)) {
        throw new Error('DOC_VERSION_MISMATCH');
      }
    } catch (_) {
      markdown = await fetchMarkdown(docInfo.latest);
      if (!isExpectedDocVersion(markdown, expectedVersion)) {
        throw new Error('DOC_VERSION_MISMATCH:' + type);
      }
    }

    rawMarkdownCache[type] = normalizeLegalDocumentText(markdown);
    return rawMarkdownCache[type];
  }

  async function buildConsentListForSigning(consentsState) {
    const list = [];
    for (const [type, granted] of Object.entries(consentsState || {})) {
      if (!granted || !DOC_PATHS[type]) continue;
      const version = CURRENT_VERSIONS[type] || '1.0';
      const document_text = await fetchConsentDocumentMarkdown(type);
      list.push({
        type,
        granted: true,
        version,
        signature_method: 'pin_confirm',
        document_text,
      });
    }
    return list;
  }

  // Кеш загруженных документов (с версией)
  const docCache = {};
  const docCacheVersion = `${CURRENT_VERSIONS.user_agreement}-${CURRENT_VERSIONS.personal_data}-${CURRENT_VERSIONS.health_data}`;

  // При изменении версии — очищаем localStorage кэш
  (() => {
    const cacheKey = 'heys_docs_cache_version';
    const storedVersion = localStorage.getItem(cacheKey);
    if (storedVersion !== docCacheVersion) {
      // 🔇 v4.7.1: Лог отключён
      localStorage.setItem(cacheKey, docCacheVersion);
      // Очищаем in-memory кэш (уже пустой при загрузке, но для надёжности)
      Object.keys(docCache).forEach(key => delete docCache[key]);
    }
  })();

  /**
   * Выносит метаданные документа в шапку экрана (канвас «Документ · чтение»).
   * Юридический markdown не меняем — только presentation-слой для UI.
   */
  function prepareConsentMarkdown(md) {
    const text = String(md || '').replace(/\r\n/g, '\n');
    let title = '';
    const h1Match = text.match(/^#\s+(.+)$/m);
    if (h1Match) {
      title = h1Match[1].replace(/\s*\([^)]*\)\s*$/g, '').trim();
    }

    let version = '';
    let effectiveDate = '';
    const versionMatch = text.match(/\*\*Версия:\*\*\s*([0-9][0-9.]*)/);
    if (versionMatch) version = versionMatch[1].trim();
    const effectiveMatch = text.match(/\*\*Дата вступления в силу:\*\*\s*([^<\n]+)/);
    if (effectiveMatch) {
      effectiveDate = effectiveMatch[1]
        .replace(/<br\s*\/?>/gi, '')
        .replace(/\s*г\.?\s*$/i, '')
        .trim();
    }

    let body = text
      .replace(/^#\s+.+\n+/, '')
      .replace(/^>\s*[\s\S]*?\n\n---\n\n/m, '')
      .replace(/^---\n\n/m, '');

    return { title, version, effectiveDate, body };
  }

  function enhanceConsentContactSection(html) {
    return String(html || '').replace(
      /<h2 class="consent-doc-h2">13\. Контакты<\/h2>\s*<ul class="consent-doc-ul">([\s\S]*?)<\/ul>/,
      (_, listBody) => (
        '<h2 class="consent-doc-h2">13. Контакты</h2>'
        + '<div class="consent-doc-contact-card">'
        + '<ul class="consent-doc-contact-list">'
        + listBody
        + '</ul>'
        + '</div>'
      )
    );
  }

  function parseConsentDocument(md) {
    const presentation = prepareConsentMarkdown(md);
    let html = parseMarkdown(presentation.body, { consentDoc: true });
    html = enhanceConsentContactSection(html);
    return { html, presentation };
  }

  /**
   * Markdown → HTML для модалок согласий.
   * Хэш подписи считается по LF-нормализованному исходнику, как в реестре.
   * Поддержка: заголовки, blockquote (в т.ч. многостричный), списки ul/ol,
   * таблицы, жирный/курсив, hr, ссылки, инлайн-код, literal br из шаблонов.
   */
  function parseMarkdown(md, options) {
    const opts = options || {};
    if (!md) return '';

    let text = String(md)
      .replace(/\r\n/g, '\n')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // В legal-шаблонах часто стоит HTML <br> внутри blockquote — после
    // экранирования возвращаем только этот безопасный тег.
    text = text.replace(/&lt;br\s*\/?&gt;/gi, '<br>');

    function formatInline(s) {
      return String(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_([^_\n]+)_/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-sm">$1</code>')
        .replace(
          /\[(.+?)\]\((.+?)\)/g,
          '<a href="$2" class="text-blue-500 underline" target="_blank" rel="noopener noreferrer">$1</a>'
        );
    }

    function isTableRow(line) {
      const t = line.trim();
      return t.startsWith('|') && t.includes('|', 1);
    }

    function isTableSep(line) {
      return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line.trim());
    }

    function isUl(line) {
      return /^[-•] /.test(line);
    }

    function isOl(line) {
      return /^\d+\. /.test(line);
    }

    function isSpecial(line) {
      const t = line.trim();
      if (!t) return true;
      if (/^#{1,4} /.test(t)) return true;
      if (/^---+$/.test(t)) return true;
      if (/^&gt;/.test(line)) return true;
      if (isUl(line) || isOl(line) || isTableRow(line)) return true;
      return false;
    }

    const lines = text.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i += 1;
        continue;
      }

      if (/^---+$/.test(trimmed)) {
        out.push(opts.consentDoc
          ? '<hr class="consent-doc-hr">'
          : '<hr class="my-4 border-zinc-300 dark:border-zinc-600">');
        i += 1;
        continue;
      }

      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        if (opts.consentDoc) {
          const clsMap = {
            1: 'consent-doc-h1',
            2: 'consent-doc-h2',
            3: 'consent-doc-h3',
            4: 'consent-doc-h4',
          };
          out.push(
            `<h${level} class="${clsMap[level] || 'consent-doc-h4'}">${formatInline(heading[2])}</h${level}>`
          );
        } else {
          const cls =
            level === 1
              ? 'text-2xl font-bold mb-4'
              : level === 2
                ? 'text-xl font-bold mt-8 mb-4'
                : level === 3
                  ? 'text-lg font-semibold mt-6 mb-3'
                  : 'text-base font-semibold mt-4 mb-2';
          out.push(
            `<h${level} class="${cls}">${formatInline(heading[2])}</h${level}>`
          );
        }
        i += 1;
        continue;
      }

      if (/^&gt;/.test(line)) {
        const parts = [];
        while (i < lines.length && /^&gt;/.test(lines[i])) {
          parts.push(lines[i].replace(/^&gt;\s?/, ''));
          i += 1;
        }
        out.push(opts.consentDoc
          ? `<blockquote class="consent-doc-bq">${formatInline(parts.join(' '))}</blockquote>`
          : `<blockquote class="border-l-4 border-zinc-300 dark:border-zinc-600 pl-4 italic text-zinc-600 dark:text-zinc-400 my-2">${formatInline(parts.join(' '))}</blockquote>`);
        continue;
      }

      if (isTableRow(line)) {
        const rows = [];
        while (i < lines.length && isTableRow(lines[i])) {
          rows.push(lines[i]);
          i += 1;
        }
        const bodyRows = rows.filter((r) => !isTableSep(r));
        if (bodyRows.length) {
          const parseCells = (row) =>
            row
              .trim()
              .replace(/^\|/, '')
              .replace(/\|$/, '')
              .split('|')
              .map((c) => c.trim());
          const header = parseCells(bodyRows[0]);
          const data = bodyRows.slice(1).map(parseCells);
          let table =
            '<div class="my-3 overflow-x-auto"><table class="w-full text-sm border-collapse">';
          table += '<thead><tr>';
          header.forEach((cell) => {
            table += `<th class="border border-zinc-300 dark:border-zinc-600 px-2 py-1 text-left font-semibold">${formatInline(cell)}</th>`;
          });
          table += '</tr></thead><tbody>';
          data.forEach((cells) => {
            table += '<tr>';
            cells.forEach((cell) => {
              table += `<td class="border border-zinc-300 dark:border-zinc-600 px-2 py-1 align-top">${formatInline(cell)}</td>`;
            });
            table += '</tr>';
          });
          table += '</tbody></table></div>';
          out.push(table);
        }
        continue;
      }

      if (isUl(line)) {
        out.push(opts.consentDoc
          ? '<ul class="consent-doc-ul">'
          : '<ul class="my-2 list-disc pl-5">');
        while (i < lines.length && isUl(lines[i])) {
          out.push(opts.consentDoc
            ? `<li class="consent-doc-li">${formatInline(lines[i].replace(/^[-•] /, ''))}</li>`
            : `<li class="my-1">${formatInline(lines[i].replace(/^[-•] /, ''))}</li>`);
          i += 1;
        }
        out.push('</ul>');
        continue;
      }

      if (isOl(line)) {
        // Отдельный <ol> на каждый непрерывный блок — иначе list-decimal
        // нумерует сквозь весь документ (симптом «36.» вместо «4.»).
        out.push(opts.consentDoc
          ? '<ol class="consent-doc-ol">'
          : '<ol class="my-2 list-decimal pl-5">');
        while (i < lines.length && isOl(lines[i])) {
          out.push(opts.consentDoc
            ? `<li class="consent-doc-li">${formatInline(lines[i].replace(/^\d+\. /, ''))}</li>`
            : `<li class="my-1">${formatInline(lines[i].replace(/^\d+\. /, ''))}</li>`);
          i += 1;
        }
        out.push('</ol>');
        continue;
      }

      const paraParts = [];
      while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) {
        let chunk = lines[i];
        if (/ {2}$/.test(chunk)) {
          chunk = chunk.replace(/ {2}$/, '') + '<br>';
        }
        paraParts.push(chunk);
        i += 1;
      }
      out.push(opts.consentDoc
        ? `<p class="consent-doc-p">${formatInline(paraParts.join(' '))}</p>`
        : `<p class="my-2">${formatInline(paraParts.join(' '))}</p>`);
    }

    return out.join('\n');
  }

  /**
   * Модальное окно с полным текстом документа
   * Загружает и парсит markdown файлы из /docs/legal/
   * Требует прокрутки до конца для подтверждения
   */
  function FullTextModal({ type, onClose, onAccept, acceptLabel, busy, error: externalError }) {
    const [docView, setDocView] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retryCount, setRetryCount] = useState(0);
    const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
    const [scrollProgress, setScrollProgress] = useState(0);
    const contentRef = useRef(null);
    const screenLabel = CONSENT_TEXTS.checkboxes[type]?.screenLabel
      || CONSENT_TEXTS.checkboxes[type]?.label
      || type;
    const progressPct = Math.round((hasScrolledToEnd ? 1 : scrollProgress) * 100);
    const docTitle = docView?.presentation?.title || screenLabel;
    const docVersion = docView?.presentation?.version || getDocExpectedVersion(type) || '';
    const docEffectiveDate = docView?.presentation?.effectiveDate || '';

    const handleScroll = useCallback(() => {
      if (!contentRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      const span = Math.max(1, scrollHeight - clientHeight);
      setScrollProgress(Math.min(1, scrollTop / span));
      if (hasScrolledToEnd) return;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;

      if (isAtBottom) {
        setHasScrolledToEnd(true);
        setScrollProgress(1);
      }
    }, [hasScrolledToEnd]);

    // Проверка при загрузке контента (если документ короткий)
    useEffect(() => {
      if (docView?.html && contentRef.current) {
        const { scrollHeight, clientHeight } = contentRef.current;
        // Если контент помещается без скролла — сразу разрешаем
        if (scrollHeight <= clientHeight + 10) {
          setHasScrolledToEnd(true);
          setScrollProgress(1);
        }
      }
    }, [docView]);

    useEffect(() => {
      async function loadDocument() {
        setLoading(true);
        setError(null);
        setHasScrolledToEnd(false);
        setScrollProgress(0);

        const docInfo = DOC_PATHS[type];

        if (!docInfo) {
          setError('Документ не найден');
          setLoading(false);
          return;
        }

        // Проверяем кеш (только если не retry)
        if (retryCount === 0 && docCache[type]) {
          setDocView(docCache[type]);
          setLoading(false);
          return;
        }

        async function fetchMarkdown(url) {
          const response = await fetch(url, { cache: 'no-store' });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          return response.text();
        }

        try {
          // 1) Сначала пробуем "неубиваемый" версионированный путь.
          // 2) Если /docs/vX ещё не задеплоены — пробуем /docs/latest, НО только если версия в тексте совпадает.
          //    Это принципиально: нельзя показывать пользователю устаревший юридический документ из CDN-кэша.
          let markdown;
          const expectedVersion = getDocExpectedVersion(type);

          try {
            markdown = await fetchMarkdown(docInfo.versioned);
            if (!isExpectedDocVersion(markdown, expectedVersion)) {
              throw new Error('DOC_VERSION_MISMATCH');
            }
          } catch (e) {
            markdown = await fetchMarkdown(docInfo.latest);
            if (!isExpectedDocVersion(markdown, expectedVersion)) {
              const exp = expectedVersion ? `v${expectedVersion}` : 'актуальная версия';
              setError(
                `Сейчас CDN отдаёт устаревшую версию документа (ожидается ${exp}).\n\n` +
                `Пожалуйста, обновите страницу или попробуйте позже.`
              );
              setLoading(false);
              return;
            }
          }

          // Теперь health_data имеет свой отдельный документ — парсим полностью
          const parsed = parseConsentDocument(markdown);

          // Сохраняем в кеш
          docCache[type] = parsed;

          setDocView(parsed);
          setError(null);
        } catch (err) {
          console.error('[Consents] Ошибка загрузки документа:', err);
          setError('Не удалось загрузить документ. Попробуйте позже.');
        } finally {
          setLoading(false);
        }
      }

      loadDocument();
    }, [type, retryCount]);

    // Retry handler
    const handleRetry = () => {
      delete docCache[type];
      setRetryCount(c => c + 1);
    };

    return React.createElement('div', {
      className: 'consent-fulltext-backdrop',
      style: { zIndex: 12000 }
    },
      React.createElement('div', { className: 'consent-fulltext' },
        React.createElement('div', { className: 'consent-fulltext__top' },
          React.createElement('div', { className: 'consent-fulltext__header' },
            React.createElement('button', {
              type: 'button',
              onClick: onClose,
              className: 'consent-fulltext__close',
              'aria-label': 'Закрыть'
            },
              React.createElement('svg', {
                width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2.75, strokeLinecap: 'round',
                'aria-hidden': 'true',
              },
                React.createElement('path', { d: 'M18 6L6 18M6 6l12 12' })
              )
            ),
            React.createElement('span', { className: 'consent-fulltext__screen-label' }, screenLabel),
            React.createElement('span', {
              className: 'consent-fulltext__progress-label',
              // Процент уже озвучен полосой ниже — второй раз читать его незачем.
              'aria-hidden': 'true',
            }, `${progressPct} %`)
          ),
          // Строка «доступность»: полоса чтения — progressbar с процентом,
          // прогресс озвучен, а не только нарисован.
          React.createElement('div', {
            className: 'consent-fulltext__progress-track',
            role: 'progressbar',
            'aria-label': 'Прочитано документа',
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': progressPct,
            'aria-valuetext': `${progressPct} % документа прочитано`,
          },
            React.createElement('div', {
              className: 'consent-fulltext__progress-fill',
              style: { width: `${progressPct}%` }
            })
          ),
          React.createElement('div', {
            className: 'consent-fulltext__bridge',
            'aria-hidden': 'true'
          })
        ),

        React.createElement('div', {
          ref: contentRef,
          onScroll: handleScroll,
          className: 'consent-fulltext__scroll'
        },
        loading
          ? React.createElement('div', { className: 'consent-fulltext__state' }, 'Загрузка документа...')
          : error
            ? React.createElement('div', { className: 'consent-fulltext__state consent-fulltext__state--error' },
              React.createElement('p', null, error),
              React.createElement('button', {
                type: 'button',
                onClick: handleRetry,
                className: 'consent-fulltext__retry'
              }, 'Попробовать снова')
            )
            : React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'consent-fulltext__hero' },
                React.createElement('h1', { className: 'consent-fulltext__title' }, docTitle),
                (docVersion || docEffectiveDate) && React.createElement('div', { className: 'consent-fulltext__badges' },
                  docVersion && React.createElement('span', { className: 'consent-fulltext__badge consent-fulltext__badge--version' }, `Версия ${docVersion}`),
                  docEffectiveDate && React.createElement('span', { className: 'consent-fulltext__badge consent-fulltext__badge--date' }, `В силе с ${docEffectiveDate}`)
                ),
                React.createElement('div', { className: 'consent-fulltext__hero-divider' })
              ),
              React.createElement('div', {
                className: 'consent-doc-body',
                dangerouslySetInnerHTML: { __html: docView?.html || '' }
              })
            )
      ),

      React.createElement('div', { className: 'consent-fulltext__footer' },
        externalError && React.createElement('div', {
          className: 'consent-fulltext__alert',
          role: 'alert',
        }, externalError),
        !loading && !error && !hasScrolledToEnd && React.createElement('p', {
          // Строка «доступность»: причина недоступности кнопки названа словами
          // и привязана к ней через aria-describedby.
          id: 'consent-fulltext-accept-reason',
          className: 'consent-fulltext__scroll-hint'
        }, 'Долистайте до конца, чтобы принять'),
        !loading && !error && React.createElement('button', {
          type: 'button',
          // Строка «доступность»: до дочитывания кнопка не выключается атрибутом
          // disabled — иначе она выпадает из обхода и молчит о причине. Остаётся
          // фокусируемой с aria-disabled, а нажатие не проходит.
          onClick: () => {
            if (busy || !hasScrolledToEnd) return;
            onAccept?.();
          },
          disabled: !!busy,
          'aria-disabled': (!!busy || !hasScrolledToEnd) ? 'true' : undefined,
          'aria-describedby': !hasScrolledToEnd ? 'consent-fulltext-accept-reason' : undefined,
          className: 'consent-fulltext__accept'
            + (hasScrolledToEnd ? ' is-ready' : '')
            + (busy ? ' is-busy' : ''),
        }, HEYS.WaitMark?.button?.(React, {
          busy: !!busy,
          idle: (acceptLabel || 'Ознакомлен, принимаю'),
          busyLabel: 'Сохраняем',
        }) || (busy ? 'Сохраняем…' : (acceptLabel || 'Ознакомлен, принимаю'))),

        !loading && !error && hasScrolledToEnd && React.createElement('button', {
          type: 'button',
          onClick: onClose,
          disabled: !!busy,
          className: 'consent-fulltext__decline'
        }, 'Закрыть без принятия')
      )
      )
    );
  }

  let optionalFeatureConsentHost = null;
  let optionalFeatureConsentRoot = null;

  function OptionalFeatureConsentFlow({ consentType, onDone }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const isReadonlyHost = !!(global.__HEYS_READONLY_MODE__ && global.__HEYS_READONLY_MODE__.enabled);

    const handleAccept = useCallback(async () => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        if (isReadonlyHost) {
          onDone({ granted: true, readonly: true });
          return;
        }
        const version = getDocExpectedVersion(consentType) || '1.0';
        if (!HEYS.YandexAPI?.logConsentsBySession) {
          throw new Error('API not ready');
        }
        const result = await HEYS.YandexAPI.logConsentsBySession([{
          type: consentType,
          version,
          granted: true,
        }]);
        if (result?.error) {
          throw new Error(result.error?.message || result.error);
        }
        onDone({ granted: true });
      } catch (err) {
        setError(err.message || 'Не удалось сохранить согласие');
        setBusy(false);
      }
    }, [busy, consentType, isReadonlyHost, onDone]);

    return React.createElement(FullTextModal, {
      type: consentType,
      busy,
      error,
      acceptLabel: '✅ Даю согласие',
      onClose: () => {
        if (!busy) onDone({ granted: false });
      },
      onAccept: handleAccept,
    });
  }

  function mountOptionalFeatureConsentFlow(consentType) {
    return new Promise((resolve) => {
      if (!React || !global.ReactDOM) {
        resolve({ granted: false, error: 'react_unavailable' });
        return;
      }
      if (!optionalFeatureConsentHost) {
        optionalFeatureConsentHost = document.createElement('div');
        optionalFeatureConsentHost.id = 'heys-optional-feature-consent-root';
        document.body.appendChild(optionalFeatureConsentHost);
        optionalFeatureConsentRoot = global.ReactDOM.createRoot
          ? global.ReactDOM.createRoot(optionalFeatureConsentHost)
          : null;
      }
      const finish = (result) => {
        try {
          if (optionalFeatureConsentRoot) {
            optionalFeatureConsentRoot.render(null);
          } else if (global.ReactDOM.render) {
            global.ReactDOM.unmountComponentAtNode(optionalFeatureConsentHost);
          }
        } catch (_) { /* noop */ }
        resolve(result);
      };
      const element = React.createElement(OptionalFeatureConsentFlow, {
        consentType,
        onDone: finish,
      });
      if (optionalFeatureConsentRoot) {
        optionalFeatureConsentRoot.render(element);
      } else if (global.ReactDOM.render) {
        global.ReactDOM.render(element, optionalFeatureConsentHost);
      } else {
        finish({ granted: false, error: 'react_dom_unavailable' });
      }
    });
  }

  /**
   * UI-гейт: цель — один раз предложить уже вошедшим замеры и добавки;
   * главное действие — Продолжить без обязательных галочек; слой 1 — чекбоксы;
   * слой 2 — полный текст; критическое — отказ не блокирует вход.
   */
  function OptionalFeatureOfferScreen({ clientId, onComplete }) {
    const profile = readClientProfile();
    const pendingTypes = getPendingOptionalFeatureTypes(profile);
    const [consents, setConsents] = useState(() => {
      const initial = {};
      pendingTypes.forEach((type) => { initial[type] = false; });
      return initial;
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showFullText, setShowFullText] = useState(null);
    const screenRef = useRef(null);
    const isReadonlyHost = !!(typeof window !== 'undefined'
      && window.__HEYS_READONLY_MODE__
      && window.__HEYS_READONLY_MODE__.enabled);

    useEffect(() => {
      HEYS.BlankScreenGuard?.reportVisibleFrame?.({
        element: screenRef.current,
        screen: 'consent',
        reason: 'optional_feature_offer_painted'
      });
    }, []);

    const handleToggle = useCallback((type) => {
      setConsents((prev) => ({ ...prev, [type]: !prev[type] }));
    }, []);

    const handleContinue = useCallback(async () => {
      if (loading) return;
      setLoading(true);
      setError(null);
      try {
        const grantedTypes = pendingTypes.filter((type) => consents[type]);
        if (grantedTypes.length && !isReadonlyHost) {
          const consentList = grantedTypes.map((type) => ({
            type,
            granted: true,
            version: CURRENT_VERSIONS[type] || '1.0',
            signature_method: 'checkbox'
          }));
          const result = await consentsAPI.logConsents(clientId, consentList);
          if (!result.success && !result.needsAccessCode) {
            throw new Error(result.error || 'Не удалось сохранить согласие');
          }
          if (result.success) consentsAPI.saveLocal(clientId, consentList);
          applyOptionalFeatureFlagsFromConsents(consentList);
        } else {
          markOptionalFeatureConsentsOffered({}, 'optional-feature-offer');
        }
        onComplete?.();
      } catch (err) {
        setError(err.message || 'Не удалось сохранить');
        setLoading(false);
      }
    }, [clientId, consents, isReadonlyHost, loading, onComplete, pendingTypes]);

    return React.createElement('div', {
      ref: screenRef,
      'data-heys-visible-frame': 'consent',
      className: 'fixed inset-0 flex flex-col',
      style: { backgroundColor: '#ffffff', zIndex: 11000 }
    },
      React.createElement('div', {
        className: 'p-4 border-b',
        style: { borderColor: '#e5e7eb' }
      },
        React.createElement('h1', {
          className: 'text-xl font-semibold',
          style: { color: '#18181b' }
        }, 'Замеры тела и добавки'),
        React.createElement('p', {
          className: 'text-sm mt-1',
          style: { color: '#71717a' }
        }, 'Можно включить сейчас или позже в профиле. Отказ не мешает пользоваться дневником.')
      ),
      React.createElement('div', {
        className: 'flex-1 overflow-auto p-4 space-y-4'
      },
        React.createElement('div', { className: 'space-y-3' },
          pendingTypes.includes('body_measurements') && React.createElement(ConsentCheckbox, {
            type: 'body_measurements',
            checked: !!consents.body_measurements,
            onChange: () => handleToggle('body_measurements'),
            config: CONSENT_TEXTS.checkboxes.body_measurements,
            onShowFull: () => setShowFullText('body_measurements')
          }),
          pendingTypes.includes('supplements_tracking') && React.createElement(ConsentCheckbox, {
            type: 'supplements_tracking',
            checked: !!consents.supplements_tracking,
            onChange: () => handleToggle('supplements_tracking'),
            config: CONSENT_TEXTS.checkboxes.supplements_tracking,
            onShowFull: () => setShowFullText('supplements_tracking')
          })
        ),
        error && React.createElement('div', {
          className: 'rounded-xl p-4',
          style: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }
        }, error)
      ),
      React.createElement('div', {
        className: 'p-4 space-y-3',
        style: {
          borderTop: '1px solid #e5e7eb',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))'
        }
      },
        React.createElement('button', {
          type: 'button',
          onClick: handleContinue,
          disabled: loading,
          className: 'w-full py-4 rounded-xl font-semibold text-white transition-all',
          style: {
            backgroundColor: loading ? '#86efac' : '#22c55e',
            cursor: loading ? 'not-allowed' : 'pointer'
          }
        }, HEYS.WaitMark?.button?.(React, {
          busy: loading,
          idle: 'Продолжить',
          busyLabel: 'Сохраняем'
        }) || (loading ? 'Сохраняем…' : 'Продолжить'))
      ),
      showFullText && React.createElement(FullTextModal, {
        type: showFullText,
        onClose: () => setShowFullText(null),
        onAccept: () => {
          setConsents((prev) => ({ ...prev, [showFullText]: true }));
          setShowFullText(null);
        },
        acceptLabel: '✅ Даю согласие'
      })
    );
  }

  /**
   * Баннер дисклеймера (для футера)
   */
  function DisclaimerBanner({ variant = 'short' }) {
    const text = variant === 'full'
      ? CONSENT_TEXTS.disclaimer.full
      : CONSENT_TEXTS.disclaimer.short;

    return React.createElement('div', {
      className: 'px-4 py-2 text-center',
      style: { backgroundColor: '#f4f4f5' }
    },
      React.createElement('p', {
        className: 'text-xs',
        style: { color: '#71717a' }
      }, '⚠️ ', text)
    );
  }

  /**
   * Мини-бейдж "Не медицина"
   */
  function NotMedicineBadge() {
    return React.createElement('span', {
      className: 'inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full',
      style: { backgroundColor: '#fef3c7', color: '#b45309' }
    }, '⚠️ Не является медицинской услугой');
  }

  // =====================================================
  // Hook для проверки согласий
  // =====================================================

  function useConsentsRequired(clientId) {
    const [needsConsent, setNeedsConsent] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
      if (!clientId) {
        setChecking(false);
        return;
      }

      // Быстрая локальная проверка
      if (consentsAPI.hasLocalConsent(clientId)) {
        setNeedsConsent(false);
        setChecking(false);
        return;
      }

      // Проверка на сервере
      consentsAPI.checkRequired(clientId).then(result => {
        setNeedsConsent(!result.valid);
        setChecking(false);
      });
    }, [clientId]);

    return { needsConsent, checking };
  }

  // =====================================================
  // 🆕 COMPLIANCE OVERHAUL 2026-05-20 — extensions
  // =====================================================

  // Источник версий — единый, читаем из HEYS.LegalVersions (см.
  // apps/web/heys_legal_versions_v1.js). Fallback на локальный
  // CURRENT_VERSIONS если legal-versions модуль не загрузился.
  function getCurrentLegalVersions() {
    if (typeof HEYS.LegalVersions === 'object' && HEYS.LegalVersions) {
      return HEYS.LegalVersions;
    }
    return CURRENT_VERSIONS;
  }

  // ── Version-aware check (re-consent на bump) ────────────────────────────
  consentsAPI.checkRequiredVersioned = async function () {
    try {
      if (!HEYS.YandexAPI || !HEYS.YandexAPI.checkRequiredConsentsBySession) {
        return { valid: false, missing: REQUIRED_CONSENTS, error: 'API not ready' };
      }
      const versions = getCurrentLegalVersions();
      const result = await HEYS.YandexAPI.checkRequiredConsentsBySession(versions);
      if (result.error) throw new Error(result.error?.message || result.error);
      const data = result.data?.check_required_consents_by_session || result.data;
      return {
        valid: data?.valid ?? false,
        missing: data?.missing || [],
        outdated: data?.outdated || [],
        graceExpiresAt: data?.grace_expires_at || null,
        graceStatus: data?.grace_status || 'none',
        mustBlock: data?.must_block ?? false,
        // 2026-05-21 fix4: возвращаем age_confirmed для AgeGateModal trigger
        ageConfirmed: data?.age_confirmed ?? true,
      };
    } catch (err) {
      // 'No session token' — это race в начале PIN-flow (token ещё в process
      // of becoming доступным). НЕ error — useConsentCheck сделает fallback
      // на legacy checkRequired который не требует токена.
      const msg = String(err?.message || '');
      const isExpectedRace = /no session token/i.test(msg);
      if (isExpectedRace) {
        // By-design: автор отметил "fallback will handle". Норма во время PIN-handshake'а.
        console.info('[Consents] checkRequiredVersioned: no token (fallback will handle)');
      } else {
        console.error('[Consents] checkRequiredVersioned failed:', err);
      }
      return { valid: false, missing: REQUIRED_CONSENTS, error: err.message, ageConfirmed: true };
    }
  };

  // ── Необязательные согласия, отставшие по версии (heys/d8f2b0) ──────
  //
  // Блокирующая проверка (checkRequiredVersioned) смотрит только жёсткий
  // список сервера: user_agreement, personal_data, health_data. Всё остальное
  // — доступ куратора, push, маркетинг, расшифровка — при подъёме версии
  // проходит незамеченным, и подписи под новой редакцией не собираются.
  // Эта проверка закрывает пробел и НИЧЕГО не блокирует: её результат ведёт
  // к мягкому баннеру, а не к экрану-гейту.
  consentsAPI.checkOptionalOutdated = async function () {
    try {
      if (!HEYS.YandexAPI?.checkOptionalConsentsBySession) return { outdated: [] };
      const result = await HEYS.YandexAPI.checkOptionalConsentsBySession(getCurrentLegalVersions());
      if (result.error) return { outdated: [] };
      const data = result.data?.check_optional_consents_by_session || result.data;
      if (data?.success === false) return { outdated: [] };
      const raw = Array.isArray(data?.outdated) ? data.outdated : [];

      // Показываем только то, что приложение реально умеет дать подписать.
      //
      // Сервер честно возвращает все отставшие необязательные документы, но
      // подписать документ можно лишь когда его текст доступен клиенту:
      // sign_consents_with_access_code_by_session требует document_text и
      // сверяет его sha256 с реестром. Тип без записи в DOC_PATHS текст
      // достать не может, значит подписать его нечем.
      //
      // Без этого фильтра получается ловушка, и она случилась на живом проде
      // 21.08: баннер звал подписать «Расшифровку голосовых сообщений», клик
      // открывал экран согласий, тот умеет собирать только свой набор, человек
      // подписывал заново обязательную пару, расхождение оставалось, баннер
      // возвращался. Лучше промолчать, чем звать в тупик.
      //
      // Когда для типа появится путь подписи (текст в DOC_PATHS плюс экран
      // повторного согласия), он начнёт показываться сам, без правок здесь.
      const signable = raw.filter((item) => {
        const type = item?.type || item;
        return typeof type === 'string' && !!DOC_PATHS[type];
      });
      const skipped = raw.length - signable.length;
      if (skipped > 0) {
        console.info('[Consents] Отставших документов без пути подписи:', skipped,
          raw.filter((i) => !DOC_PATHS[i?.type || i]).map((i) => i?.type || i).join(', '));
      }
      return { outdated: signable };
    } catch (err) {
      // Молча: необязательный документ не повод ломать экран.
      console.info('[Consents] checkOptionalOutdated skipped:', err?.message || err);
      return { outdated: [] };
    }
  };

  // ── My consents list (для UI «Мои согласия») ────────────────────────────
  consentsAPI.getMyConsents = async function () {
    try {
      if (!HEYS.YandexAPI?.getMyConsentsBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.getMyConsentsBySession();
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.get_my_consents_by_session || r.data;
      return { success: true, consents: data?.consents || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // ── Proof of consent (скачать как файл) ──────────────────────────────────
  consentsAPI.getConsentProof = async function (consentType) {
    try {
      if (!HEYS.YandexAPI?.getConsentProofBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.getConsentProofBySession(consentType);
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.get_consent_proof_by_session || r.data;
      return { success: true, proof: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.downloadConsentProofAsFile = async function (consentType) {
    const res = await consentsAPI.getConsentProof(consentType);
    if (!res.success) return res;
    const blob = new Blob([JSON.stringify(res.proof, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heys-consent-${consentType}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { success: true };
  };

  // ── DSAR (152-ФЗ ст.14 / GDPR Art.15) ────────────────────────────────────
  consentsAPI.exportMyData = async function () {
    try {
      if (!HEYS.YandexAPI?.exportMyDataBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.exportMyDataBySession();
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.export_my_data_by_session || r.data;
      return { success: true, export: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.downloadMyDataAsFile = async function () {
    const res = await consentsAPI.exportMyData();
    if (!res.success) return res;
    const blob = new Blob([JSON.stringify(res.export, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heys-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { success: true };
  };

  // ── Setters / toggles ────────────────────────────────────────────────────
  consentsAPI.setMarketingConsent = async function (granted) {
    try {
      if (!HEYS.YandexAPI?.logConsentsBySession) return { success: false, error: 'API not ready' };
      const versions = getCurrentLegalVersions();
      const r = await HEYS.YandexAPI.logConsentsBySession([
        { type: 'marketing', granted: !!granted, version: versions.marketing || '1.3' }
      ]);
      if (r.error) throw new Error(r.error?.message || r.error);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.setPushConsent = async function (granted, accessCode) {
    try {
      if (!granted) {
        return consentsAPI.revokeConsentBySession('push_notifications');
      }
      const versions = getCurrentLegalVersions();
      const version = versions.push_notifications || '1.0';
      const result = await consentsAPI.logConsents(null, [{
        type: 'push_notifications',
        granted: true,
        version,
        signature_method: 'checkbox',
      }]);
      if (result.needsAccessCode) {
        if (!accessCode) {
          try {
            const mine = await consentsAPI.getMyConsents();
            const active = (mine?.consents || []).find(
              (row) => row.type === 'push_notifications' && row.granted && !row.revoked_at
            );
            if (active && String(active.version || '') === version) {
              return { success: true, alreadySigned: true };
            }
          } catch (_) { /* noop */ }
          return {
            success: false,
            needsAccessCode: true,
            error: result.error || 'signing_requires_access_code',
          };
        }
        const document_text = await fetchConsentDocumentMarkdown('push_notifications');
        return consentsAPI.signConsentsWithAccessCode([{
          type: 'push_notifications',
          granted: true,
          version,
          signature_method: 'pin_confirm',
          document_text,
        }], accessCode);
      }
      if (!result.success) {
        return { success: false, error: result.error || 'consent_failed' };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.confirmAge = async function (birthYear) {
    if (typeof window !== 'undefined'
      && window.__HEYS_READONLY_MODE__
      && window.__HEYS_READONLY_MODE__.enabled) {
      console.info('[Consents] READONLY_MODE — skip confirmAge, continue without write');
      return { success: true, readonly: true };
    }
    try {
      if (!HEYS.YandexAPI?.confirmAgeBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.confirmAgeBySession(birthYear);
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.confirm_age_by_session || r.data;
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.requestRestriction = async function (active) {
    try {
      if (!HEYS.YandexAPI?.requestRestrictionBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.requestRestrictionBySession(!!active);
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.request_restriction_by_session || r.data;
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.revokeCuratorAccess = async function () {
    try {
      if (!HEYS.YandexAPI?.revokeCuratorAccessBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.revokeCuratorAccessBySession();
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.revoke_curator_access_by_session || r.data;
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.revokeConsentBySession = async function (consentType) {
    try {
      if (!HEYS.YandexAPI?.revokeConsentBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.revokeConsentBySession(consentType);
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.revoke_consent_by_session || r.data;
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.requestOptionalFeatureConsent = async function (consentType) {
    if (!DOC_PATHS[consentType]) {
      return { granted: false, error: 'unknown_consent_type' };
    }
    return mountOptionalFeatureConsentFlow(consentType);
  };

  // ── ConsentOutdatedBanner (sticky top, мягкий призыв пере-подписать) ────
  // Запасное поле кода на случай, если модуль клавиатуры не загрузился.
  // Хук вызывается всегда — подменяется реализация, а не факт вызова, иначе
  // нарушится порядок хуков.
  function useFallbackCodeField() {
    const [value, setValue] = useState('');
    return {
      pinValue: value,
      isComplete: value.length >= 4,
      resetDigits: function () { setValue(''); },
      applyPinDigits: function (arr) { setValue((arr || []).slice(0, 4).join('')); },
    };
  }

  // ── ReconsentSheet: повторная подпись документов вне онбординга ────────
  //
  // Зачем отдельный экран. ConsentScreen — экран регистрации: он собирает
  // обязательную пару и те необязательные, у которых в каталоге есть
  // screenLabel. Документы вроде расшифровки голосовых там не появляются
  // намеренно — их включают в своём месте. Но переподписать обновлённую
  // редакцию человеку нужно, и вести его в регистрационный экран нельзя: он
  // подпишет заново не то — ровно это и случилось на проде 21.08.
  //
  // Порядок здесь другой, чем в онбординге, и это осознанно. В регистрации
  // человек выбирает, что включать. В повторной подписи выбор сделан раньше —
  // меняется текст, и подтвердить нужно именно его. Поэтому: прочитать каждый
  // документ, затем один раз ввести код доступа, затем одна подпись на все.
  // «Позже» доступно на любом шаге и ничего не ломает: документ остаётся в
  // прежней редакции, баннер вернётся при следующем входе.
  function ReconsentSheet({ outdatedTypes, onDone, onClose }) {
    const types = (Array.isArray(outdatedTypes) ? outdatedTypes : [])
      .map(function (item) { return typeof item === 'string' ? item : item && item.type; })
      .filter(function (type) { return type && DOC_PATHS[type]; });

    const [openDoc, setOpenDoc] = useState(null);
    const [accepted, setAccepted] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    // Код доступа вводится тем же способом, что и везде в продукте: четыре
    // ячейки и своя цифровая клавиатура. Обычное поле ввода здесь было
    // ошибкой — на телефоне оно поднимает системную клавиатуру, не
    // ограничивает длину и выглядит чужеродно рядом с экраном входа.
    const pinKit = HEYS.AuthPinKeypad && HEYS.AuthPinKeypad.createKit
      ? HEYS.AuthPinKeypad.createKit(React)
      : null;
    const usePinField = pinKit ? pinKit.usePinKeypad : useFallbackCodeField;
    const codeField = usePinField({ disabled: busy, idPrefix: 'reconsent-code', autoFocus: false });
    const keypadRef = useRef(null);
    const code = codeField.pinValue;

    if (!types.length) return null;

    const allRead = accepted.length >= types.length;

    const labelOf = function (type) {
      // Тот же порядок, что у баннера: сначала короткое человеческое имя из
      // LegalVersions.labels («Расшифровка голосовых сообщений»), и только
      // потом формулировка из каталога — она юридическая и в списке из
      // нескольких строк читается плохо.
      const entry = CONSENT_TEXTS.checkboxes[type] || {};
      const short = (HEYS.LegalVersions && HEYS.LegalVersions.labels || {})[type];
      return short || entry.screenLabel || entry.label || type;
    };

    const handleAccept = function (type) {
      setOpenDoc(null);
      setAccepted(function (prev) { return prev.indexOf(type) >= 0 ? prev : prev.concat(type); });
    };

    const describeError = function (raw) {
      const text = String(raw || '');
      if (/invalid_access_code/.test(text)) return 'Неверный код доступа';
      if (/access_code_not_set/.test(text)) return 'Код доступа не задан — обратитесь к куратору';
      if (/consent_version_not_allowed/.test(text)) return 'Версия документа не зарегистрирована — сообщите куратору';
      if (/document_text_hash_mismatch/.test(text)) return 'Текст документа изменился, откройте его заново';
      return 'Не удалось подписать. Попробуйте ещё раз';
    };

    const handleSign = async function () {
      setError(null);
      if (!code.trim()) {
        setError('Введите код доступа');
        return;
      }
      setBusy(true);
      try {
        const list = [];
        for (const type of accepted) {
          const document_text = await fetchConsentDocumentMarkdown(type);
          list.push({
            type: type,
            granted: true,
            version: CURRENT_VERSIONS[type],
            signature_method: 'pin_confirm',
            document_text: document_text,
          });
        }
        const res = await consentsAPI.signConsentsWithAccessCode(list, code.trim());
        setBusy(false);
        if (!res || !res.success) {
          setError(describeError(res && res.error));
          return;
        }
        onDone && onDone(accepted);
      } catch (err) {
        console.error('[Reconsent] sign failed:', err);
        setBusy(false);
        setError('Не удалось подписать. Попробуйте ещё раз');
      }
    };

    if (openDoc) {
      return React.createElement(FullTextModal, {
        type: openDoc,
        onClose: function () { setOpenDoc(null); },
        onAccept: function () { handleAccept(openDoc); },
        acceptLabel: 'Прочитал, подтверждаю',
      });
    }

    return React.createElement('div', {
      style: {
        position: 'fixed', inset: 0, zIndex: 2147483100,
        background: 'rgba(0,0,0,.45)', display: 'flex',
        alignItems: 'flex-end', justifyContent: 'center',
      },
      onClick: function (e) { if (e.target === e.currentTarget && !busy) onClose && onClose(); },
    },
      React.createElement('div', {
        style: {
          background: '#fff', borderRadius: '18px 18px 0 0', padding: '20px 18px 24px',
          width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
          font: '400 14px/1.5 Figtree, system-ui, sans-serif', color: '#1f2937',
        },
      },
        React.createElement('div', {
          style: { font: '600 17px/1.3 Figtree, system-ui, sans-serif', marginBottom: 6 },
        }, 'Документы обновлены'),

        React.createElement('div', {
          style: { color: 'rgba(0,0,0,.6)', marginBottom: 16 },
        }, types.length === 1
          ? 'Мы изменили текст документа, который вы подписывали раньше. Прочитайте новую редакцию и подтвердите её.'
          : 'Мы изменили тексты документов, которые вы подписывали раньше. Прочитайте новые редакции и подтвердите их.'),

        types.map(function (type) {
          const done = accepted.indexOf(type) >= 0;
          return React.createElement('button', {
            key: type,
            type: 'button',
            disabled: busy,
            onClick: function () { setOpenDoc(type); },
            style: {
              display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
              background: done ? '#f0fdf4' : '#f6e6dd',
              border: done ? '1px solid #86efac' : '1px solid transparent',
              borderRadius: 14, padding: '12px 14px', marginBottom: 10, font: 'inherit',
            },
          },
            React.createElement('div', { style: { fontWeight: 600 } },
              (done ? '✓ ' : '') + labelOf(type)),
            React.createElement('div', { style: { color: 'rgba(0,0,0,.55)', marginTop: 2 } },
              done ? 'Прочитано' : 'Открыть и прочитать')
          );
        }),

        allRead && React.createElement('div', { style: { marginTop: 16 } },
          React.createElement('div', { style: { fontWeight: 600, marginBottom: 6 } }, 'Код доступа'),
          React.createElement('div', { style: { color: 'rgba(0,0,0,.55)', marginBottom: 8 } },
            'Тот же, которым вы входите в HEYS. Подпись фиксируется вместе с версией документа и временем.'),
          pinKit
            ? pinKit.renderPinKeypadSection({
              pin: codeField,
              sectionClassName: 'heys-auth-pin-section space-y-3 is-active',
              keypadRef: keypadRef,
            })
            : React.createElement('input', {
              type: 'password',
              inputMode: 'numeric',
              autoComplete: 'one-time-code',
              maxLength: 4,
              value: code,
              disabled: busy,
              onChange: function (e) {
                codeField.applyPinDigits(String(e.target.value || '').replace(/\D/g, '').slice(0, 4).split(''));
              },
              style: {
                width: '100%', padding: '11px 13px', borderRadius: 12,
                border: '1px solid #d4d4d8', font: 'inherit', boxSizing: 'border-box',
              },
            })
        ),

        error && React.createElement('div', {
          role: 'alert',
          style: { marginTop: 10, color: '#b91c1c' },
        }, error),

        React.createElement('button', {
          type: 'button',
          disabled: !allRead || busy,
          onClick: handleSign,
          style: {
            width: '100%', marginTop: 16, padding: '13px 16px', borderRadius: 14,
            border: 'none', cursor: (!allRead || busy) ? 'default' : 'pointer',
            background: (!allRead || busy) ? '#e5e7eb' : '#d97642',
            color: (!allRead || busy) ? 'rgba(0,0,0,.4)' : '#fff',
            font: '600 15px/1 Figtree, system-ui, sans-serif',
          },
        }, busy ? 'Подписываем…' : (allRead ? 'Подписать' : 'Сначала прочитайте документы')),

        React.createElement('button', {
          type: 'button',
          disabled: busy,
          onClick: function () { onClose && onClose(); },
          style: {
            width: '100%', marginTop: 8, padding: '11px 16px', borderRadius: 14,
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'rgba(0,0,0,.55)', font: 'inherit',
          },
        }, 'Позже')
      )
    );
  }

  function ConsentOutdatedBanner({ outdatedTypes, graceExpiresAt, onClick }) {
    if (!outdatedTypes || outdatedTypes.length === 0) return null;
    const expDate = graceExpiresAt ? new Date(graceExpiresAt) : null;
    const daysLeft = expDate ? Math.max(0, Math.ceil((expDate - new Date()) / 86400000)) : null;
    const labels = (HEYS.LegalVersions?.labels) || {};
    const typeNames = (Array.isArray(outdatedTypes) ? outdatedTypes : [])
      .map(t => labels[t?.type || t] || (t?.type || t))
      .join(', ');

    const handleClick = function (e) {
      // Защита: если что-то выше в DOM поймало event — всё равно срабатываем
      try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch (_) {}
      try { onClick && onClick(e); } catch (err) {
        console.error('[ConsentOutdatedBanner] onClick error:', err);
      }
    };

    // <button> вместо <div onClick> — нативный target для клика, не теряет
    // events на mobile/tap-zone, accessibility-friendly. z-index 2147483000
    // чтобы наверняка перекрыть все остальные оверлеи (но ниже max-int чтобы
    // toast/modal могли быть выше при необходимости).
    return React.createElement('button', {
      type: 'button',
      role: 'alert',
      onClick: handleClick,
      onTouchEnd: handleClick,
      style: {
        position: 'fixed', top: 0, left: 0, right: 0,
        zIndex: 2147483000,
        width: '100%',
        background: '#fef3c7',
        border: 'none',
        borderBottom: '1px solid #fbbf24',
        padding: '12px 16px',
        color: '#92400e',
        fontSize: '14px',
        textAlign: 'center',
        cursor: 'pointer',
        font: 'inherit',
        display: 'block',
        boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
        WebkitTapHighlightColor: 'rgba(146,64,14,0.15)',
        pointerEvents: 'auto',
      }
    },
      React.createElement('strong', null, '📋 Документы обновлены: '),
      'мы обновили ', typeNames, '. Пожалуйста, ознакомьтесь и подпишите.',
      daysLeft !== null && React.createElement('span', null,
        ' Осталось дней: ', React.createElement('strong', null, daysLeft), '.'),
      React.createElement('span', { style: { textDecoration: 'underline', marginLeft: 8 } }, 'Открыть')
    );
  }

  // ── AgeGateModal (18+ для старых клиентов без birth_year) ───────────────
  function AgeGateModal({ onConfirm, onDismiss }) {
    const [year, setYear] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const currentYear = new Date().getFullYear();
    const isReadonlyHost = !!(typeof window !== 'undefined'
      && window.__HEYS_READONLY_MODE__
      && window.__HEYS_READONLY_MODE__.enabled);

    const submit = async () => {
      const y = parseInt(year, 10);
      if (!Number.isInteger(y) || y < 1900 || y > currentYear) {
        setError('Введите корректный год рождения');
        return;
      }
      if (currentYear - y < 18) {
        setError('Сервис доступен только лицам старше 18 лет (152-ФЗ ст.9.5).');
        return;
      }
      if (isReadonlyHost) {
        console.info('[Consents] READONLY_MODE — skip confirmAge UI write, continue without write');
        onConfirm && onConfirm(y);
        return;
      }
      setLoading(true);
      const res = await consentsAPI.confirmAge(y);
      setLoading(false);
      if (res?.success) {
        onConfirm && onConfirm(y);
      } else {
        setError(res?.error || res?.message || 'Не удалось сохранить');
      }
    };

    return React.createElement('div', {
      style: {
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16
      }
    },
      React.createElement('div', {
        style: {
          background: '#fff', borderRadius: 16, padding: '24px',
          maxWidth: 420, width: '100%'
        }
      },
        React.createElement('h2', { style: { marginTop: 0, fontSize: 20 } },
          '🎂 Подтвердите возраст'),
        isReadonlyHost && React.createElement('div', {
          'data-testid': 'age-gate-readonly-banner',
          style: {
            marginTop: 12, padding: '10px 12px', borderRadius: 8,
            background: '#fef3c7', color: '#92400e', fontSize: 13,
            border: '1px solid #fcd34d'
          }
        }, 'Замороженная копия — только просмотр. Возраст не сохраняется.'),
        React.createElement('p', { style: { color: '#52525b', fontSize: 14 } },
          'По требованиям 152-ФЗ ст.9.5 сервисом могут пользоваться только лица старше 18 лет. Пожалуйста, укажите ваш год рождения.'),
        React.createElement('input', {
          type: 'number', placeholder: 'Год рождения (например, 1990)',
          value: year,
          onChange: e => setYear(e.target.value),
          style: {
            width: '100%', padding: '12px', fontSize: 16,
            border: '1px solid #d4d4d8', borderRadius: 8, marginTop: 12
          }
        }),
        error && React.createElement('div', {
          style: { color: '#dc2626', fontSize: 13, marginTop: 8 }
        }, error),
        React.createElement('button', {
          onClick: submit,
          disabled: loading,
          style: {
            marginTop: 16, padding: '12px 20px', width: '100%',
            background: '#22c55e', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 16, cursor: 'pointer'
          }
        }, HEYS.WaitMark?.button?.(React, {
          busy: loading,
          idle: 'Подтвердить', busyLabel: 'Сохраняем',
        }) || (loading ? 'Сохраняем…' : 'Подтвердить')),
        onDismiss && React.createElement('button', {
          onClick: onDismiss,
          style: {
            marginTop: 8, padding: '10px', width: '100%',
            background: 'transparent', color: '#71717a',
            border: 'none', fontSize: 14, cursor: 'pointer'
          }
        }, 'Напомнить позже')
      )
    );
  }

  // ── HEYS_DEBUG_REPLAY_REGISTRATION ─────────────────────────────────────
  // Временный mount ConsentScreen без записи ПЭП. Grep чтобы выкинуть.
  let diagnosticReplayHost = null;
  let diagnosticReplayRoot = null;

  function showDiagnosticReplay({ onComplete, onCancel } = {}) {
    if (!React || !global.ReactDOM) {
      onCancel?.({ error: 'react_unavailable' });
      return;
    }
    if (!diagnosticReplayHost) {
      diagnosticReplayHost = document.createElement('div');
      diagnosticReplayHost.id = 'heys-diagnostic-replay-consent-root';
      document.body.appendChild(diagnosticReplayHost);
      diagnosticReplayRoot = global.ReactDOM.createRoot
        ? global.ReactDOM.createRoot(diagnosticReplayHost)
        : null;
    }
    const clientId =
      (window.HEYS && window.HEYS.currentClientId) ||
      localStorage.getItem('heys_client_current') || '';
    const unmount = () => {
      try {
        if (diagnosticReplayRoot) {
          diagnosticReplayRoot.render(null);
        } else if (global.ReactDOM.unmountComponentAtNode) {
          global.ReactDOM.unmountComponentAtNode(diagnosticReplayHost);
        }
      } catch (_) { /* noop */ }
    };
    const element = React.createElement(ConsentScreen, {
      clientId,
      phone: null,
      diagnosticReplay: true,
      onComplete: (list) => {
        unmount();
        onComplete?.(list);
      },
      onCancel: () => {
        unmount();
        onCancel?.();
      },
      onError: () => { /* swallow in diagnostic */ },
    });
    if (diagnosticReplayRoot) {
      diagnosticReplayRoot.render(element);
    } else if (global.ReactDOM.render) {
      global.ReactDOM.render(element, diagnosticReplayHost);
    } else {
      onCancel?.({ error: 'react_dom_unavailable' });
    }
  }

  // ── Self-service ConsentScreen wrapper для re-consent flow ─────────────
  // Простая обёртка: пере-используем существующий ConsentScreen,
  // передаём clientId из текущей сессии, после complete — closе.
  function ReConsentScreen({ outdatedTypes, onComplete, onDismiss }) {
    const clientId =
      (window.HEYS && window.HEYS.currentClientId) ||
      localStorage.getItem('heys_client_current') || '';

    return React.createElement('div', { style: { position: 'fixed', inset: 0, zIndex: 9998 } },
      React.createElement('div', {
        style: {
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '12px 16px', background: '#fef3c7',
          color: '#92400e', textAlign: 'center', fontSize: 14
        }
      }, '📋 Мы обновили документы. Пожалуйста, ознакомьтесь и подпишите.'),
      React.createElement(ConsentScreen, {
        clientId,
        phone: null,  // re-consent flow без SMS verify
        outdatedTypes,
        onComplete: onComplete,
        onCancel: onDismiss,
        onError: () => { /* swallow */ }
      })
    );
  }

  // =====================================================
  // Экспорт
  // =====================================================
  // ⚠️ Регрессия 2026-05-20 (8d40d31f): отдельные присваивания
  // `HEYS.Consents.X = X` ниже выполнялись ДО блока Object.assign,
  // что вызывало TypeError "undefined is not an object" на первой
  // загрузке у всех клиентов (HEYS.Consents ещё не существовал).
  // Теперь Object.assign идёт первым и создаёт namespace.

  HEYS.Consents = Object.assign(HEYS.Consents || {}, {
    // Константы
    TYPES: CONSENT_TYPES,
    REQUIRED: REQUIRED_CONSENTS,
    VERSIONS: CURRENT_VERSIONS,
    TEXTS: CONSENT_TEXTS,

    // API
    api: consentsAPI,

    // Компоненты
    ConsentScreen,
    ConsentCheckbox,
    OptionalFeatureOfferScreen,
    DisclaimerBanner,
    NotMedicineBadge,
    FullTextModal,
    ConsentOutdatedBanner,
    ReconsentSheet,
    AgeGateModal,
    ReConsentScreen,
    showDiagnosticReplay,
    shouldOfferOptionalFeatures,

    // Hook
    useConsentsRequired,

    // Utils
    getCurrentLegalVersions,
    parseMarkdown,
    parseConsentDocument,
    prepareConsentMarkdown,
    normalizeLegalDocumentText
  });

  // Verbose init log removed
  try {
    window.dispatchEvent(new CustomEvent('heys:consents-ready'));
  } catch (_) { /* noop */ }

})(typeof window !== 'undefined' ? window : global);
