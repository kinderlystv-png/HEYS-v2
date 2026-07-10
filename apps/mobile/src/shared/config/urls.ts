import Constants from 'expo-constants';

type MobileExtra = {
  accountDeletionUrl?: string;
  privacyUrl?: string;
  supportUrl?: string;
  termsUrl?: string;
  webUrl?: string;
};

const PRODUCTION_API_URL = 'https://api.heyslab.ru';
const mobileExtra = (Constants.expoConfig?.extra?.mobile ?? {}) as MobileExtra;

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function fromEnvOrExtra(envValue: string | undefined, extraValue: string | undefined, fallback: string) {
  return envValue?.trim() || extraValue?.trim() || fallback;
}

export const API_URL = normalizeBaseUrl(
  __DEV__
    ? fromEnvOrExtra(process.env.EXPO_PUBLIC_API_URL, undefined, PRODUCTION_API_URL)
    : PRODUCTION_API_URL
);

export const HEYS_WEB_URL = normalizeBaseUrl(
  fromEnvOrExtra(process.env.EXPO_PUBLIC_HEYS_WEB_URL, mobileExtra.webUrl, 'https://app.heyslab.ru')
);

export const SUPPORT_URL = fromEnvOrExtra(
  process.env.EXPO_PUBLIC_SUPPORT_URL,
  mobileExtra.supportUrl,
  'https://t.me/heyslab_support_bot'
);

export const PRIVACY_URL = fromEnvOrExtra(
  process.env.EXPO_PUBLIC_PRIVACY_URL,
  mobileExtra.privacyUrl,
  `${HEYS_WEB_URL}/docs/privacy-policy.md`
);

export const TERMS_URL = fromEnvOrExtra(
  process.env.EXPO_PUBLIC_TERMS_URL,
  mobileExtra.termsUrl,
  `${HEYS_WEB_URL}/docs/user-agreement.md`
);

export const ACCOUNT_DELETION_URL = fromEnvOrExtra(
  process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL,
  mobileExtra.accountDeletionUrl,
  `${HEYS_WEB_URL}/docs/account-deletion.md`
);

export const WEB_SESSION_EXCHANGE_PATH =
  process.env.EXPO_PUBLIC_WEB_SESSION_EXCHANGE_PATH?.trim() || '/auth/mobile/session-exchange';

export function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function getAllowedWebHosts(): Set<string> {
  const hosts = [API_URL, HEYS_WEB_URL, PRIVACY_URL, TERMS_URL, ACCOUNT_DELETION_URL]
    .map(getHostname)
    .filter((host): host is string => Boolean(host));

  return new Set(hosts);
}
