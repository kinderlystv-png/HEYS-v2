const USE_MOCKS = import.meta.env.VITE_USE_CLIENT_MOCKS === 'true';
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

let telegramInitData: string | null = null;
let curatorSessionToken: string | null = null;

export interface HttpRequestOptions extends RequestInit {
  /**
   * Пропустить автоматическую прокатку Telegram initData.
   * Используется, например, при первичной валидации initData.
   */
  skipAuth?: boolean;
}

export function setTelegramAuthPayload(initData: string | null) {
  telegramInitData = initData;
}

export function getTelegramAuthPayload() {
  return telegramInitData;
}

export function setCuratorSessionToken(token: string | null) {
  curatorSessionToken = token;
}

export function getCuratorSessionToken() {
  return curatorSessionToken;
}

function resolveRequestInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === 'string' && input.startsWith('/') && API_BASE_URL) {
    return `${API_BASE_URL}${input}`;
  }

  return input;
}

export async function httpRequest(input: RequestInfo | URL, options: HttpRequestOptions = {}) {
  const { skipAuth, headers, ...rest } = options;
  const finalHeaders = new Headers(headers ?? undefined);
  const resolvedInput = resolveRequestInput(input);

  if (!skipAuth && telegramInitData && !USE_MOCKS) {
    finalHeaders.set('X-Telegram-Init-Data', telegramInitData);
  }

  if (!skipAuth && curatorSessionToken && !USE_MOCKS && !finalHeaders.has('Authorization')) {
    finalHeaders.set('Authorization', `Bearer ${curatorSessionToken}`);
  }

  if (rest.body && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json');
  }

  return fetch(resolvedInput, {
    ...rest,
    headers: finalHeaders
  });
}
