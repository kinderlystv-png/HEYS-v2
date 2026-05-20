// Единый источник версий и дат legal-документов.
// При бампе версии документа: меняем здесь — landing-страницы, TrialForm и
// PurchaseModal подтянут автоматически. Бамп влечёт re-consent для активных
// пользователей: координируется отдельно с docs/legal/ и apps/web/public/docs/.

export interface LegalDocMeta {
  version: string
  effectiveDate: string // ISO-like human-readable: '20 мая 2026 г.'
  lastUpdated: string
}

export const LEGAL_DOCS = {
  userAgreement: {
    version: '1.5',
    effectiveDate: '20 мая 2026 г.',
    lastUpdated: '20 мая 2026 г.',
  },
  privacyPolicy: {
    version: '1.5',
    effectiveDate: '20 мая 2026 г.',
    lastUpdated: '20 мая 2026 г.',
  },
  healthDataConsent: {
    version: '1.3',
    effectiveDate: '20 мая 2026 г.',
    lastUpdated: '20 мая 2026 г.',
  },
  refund: {
    version: '1.0',
    effectiveDate: '28 апреля 2026 г.',
    lastUpdated: '28 апреля 2026 г.',
  },
  cookiePolicy: {
    version: '1.0',
    effectiveDate: '14 мая 2026 г.',
    lastUpdated: '14 мая 2026 г.',
  },
} as const satisfies Record<string, LegalDocMeta>

export const SUPPORT_CONTACTS = {
  generalEmail: 'support@heys.app',
  privacyEmail: 'privacy@heys.app',
  telegramHandle: '@heyslab_support',
  telegramUrl: 'https://t.me/heyslab_support',
} as const

export const OPERATOR = {
  fullName: 'ИП Поплавский Антон Сергеевич',
  inn: '263517141102',
  ogrnip: '320265100094118',
  address: '355041, г. Ставрополь, ул. Краснофлотская, д. 88/1, кв. 56',
} as const

export const SUPPORT_HOURS = '09:00–21:00'
