// leads.ts — единственное место, где формируется тело заявки и делается запрос
// к `POST https://api.heyslab.ru/leads`.
//
// Зачем модуль. Контракт заявки (согласия, honeypot, 18+, UTM, `ym_client_id`)
// одинаков для всех версий лендинга, а оформление — разное. До версии D он жил
// прямо внутри `TrialForm`, и второй формы просто не могло появиться без
// копипасты всей логики. Здесь лежит контракт; разметка остаётся за версией.
//
// `TrialForm` (публичная версия A) намеренно НЕ переведён на этот модуль в этой
// задаче: автотестов у боевой формы нет, а рефакторить работающий приём заявок
// ради стройности — несоразмерный риск. Когда владелец выберет основную версию,
// проигравшая форма уйдёт вместе со своей копией логики. До тех пор при
// изменении контракта правятся оба места — это записано и здесь, и в
// `TrialForm`.

import { LEGAL_DOCS } from '@/config/legal-versions';

declare global {
  interface Window {
    ym?: (...args: unknown[]) => void;
  }
}

const LEADS_ENDPOINT = 'https://api.heyslab.ru/leads';

export type Messenger = 'telegram' | 'whatsapp' | 'max';

export interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

export interface LeadInput {
  name: string;
  /** Десять цифр без кода страны: код добавляется здесь. */
  phoneDigits: string;
  messenger: Messenger;
  birthYear: number;
  /** Honeypot: у человека всегда пустой. */
  website: string;
  marketingAccepted: boolean;
  utm: UtmParams;
  ymClientId?: string;
  /** Какая версия страницы отправила заявку. */
  abVariant: string;
  /** Код сегмента квиза, если человек прошёл разбор. */
  quizSegment?: string;
  /** Уточнения квиза — частота, барьер, цель. */
  quizDetails?: Record<string, string | null>;
}

export function readUtmParams(): UtmParams {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_term: params.get('utm_term') || undefined,
    utm_content: params.get('utm_content') || undefined,
  };
}

/**
 * `ym_client_id` берём только при данном согласии: до него Метрика не
 * инициализирована (`AnalyticsConsentGate`), и запрашивать нечего.
 */
export function readYandexClientId(consentAccepted: boolean): Promise<string | undefined> {
  const counterId = process.env.NEXT_PUBLIC_YM_ID || '';
  if (typeof window === 'undefined' || !consentAccepted || !counterId || !window.ym) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(undefined), 300);
    try {
      window.ym?.(Number(counterId), 'getClientID', (clientId: unknown) => {
        window.clearTimeout(timer);
        resolve(typeof clientId === 'string' && clientId.trim() ? clientId.trim() : undefined);
      });
    } catch {
      window.clearTimeout(timer);
      resolve(undefined);
    }
  });
}

export async function submitLead(input: LeadInput): Promise<void> {
  const response = await fetch(LEADS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name.trim(),
      phone: '7' + input.phoneDigits,
      messenger: input.messenger,
      website: input.website,
      ab_variant: input.abVariant,
      ym_client_id: input.ymClientId,
      birth_year: input.birthYear,
      quiz_segment: input.quizSegment,
      // Уточнения квиза уходят одним пакетом вместе с заявкой и согласием —
      // поштучная отправка ответов до согласия запрещена (`17`, реестр данных).
      quiz_details: input.quizDetails,
      ...input.utm,
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      landing_page: typeof window !== 'undefined' ? window.location.pathname : undefined,
      consent: {
        privacy_version: LEGAL_DOCS.privacyPolicy.version,
        method: 'checkbox',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      },
      marketing_consent: input.marketingAccepted
        ? { granted: true, version: LEGAL_DOCS.marketingConsent.version }
        : null,
    }),
  });

  const data: { success?: boolean; message?: string } = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Ошибка отправки');
  }
}
