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
    version: '1.8',
    effectiveDate: '28 июля 2026 г.',
    lastUpdated: '28 июля 2026 г.',
  },
  privacyPolicy: {
    version: '1.7',
    effectiveDate: '27 июля 2026 г.',
    lastUpdated: '27 июля 2026 г.',
  },
  healthDataConsent: {
    version: '1.5',
    effectiveDate: '27 июля 2026 г.',
    lastUpdated: '27 июля 2026 г.',
  },
  refund: {
    version: '1.1',
    effectiveDate: '27 июля 2026 г.',
    lastUpdated: '27 июля 2026 г.',
  },
  cookiePolicy: {
    version: '1.1',
    effectiveDate: '27 июля 2026 г.',
    lastUpdated: '27 июля 2026 г.',
  },
  speechTranscriptionConsent: {
    version: '1.1',
    effectiveDate: '27 июля 2026 г.',
    lastUpdated: '27 июля 2026 г.',
  },
  marketingConsent: {
    version: '1.3',
    effectiveDate: '27 июля 2026 г.',
    lastUpdated: '27 июля 2026 г.',
  },
} as const satisfies Record<string, LegalDocMeta>

export const SUPPORT_CONTACTS = {
  generalEmail: 'poplanton@mail.ru',
  privacyEmail: 'poplanton@mail.ru',
  telegramHandle: '@heyslab_support_bot',
  telegramUrl: 'https://t.me/heyslab_support_bot',
} as const

export const OPERATOR = {
  fullName: 'ИП Поплавский Антон Сергеевич',
  inn: '263517141102',
  ogrnip: '320265100094118',
  address: '355041, г. Ставрополь, ул. Краснофлотская, д. 88/1, кв. 56',
  rknRegistrationNumber: '26-22-005319',
  rknOrder: 'приказ № 131 от 24 июля 2026 г.',
  rknRegistryUrl: 'https://pd.rkn.gov.ru/operators-registry/operators-list/',
} as const
