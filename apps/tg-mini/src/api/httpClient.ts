import { debugLogger } from '../utils/debugLogger';

const USE_MOCKS = import.meta.env.VITE_USE_CLIENT_MOCKS === 'true';
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

// 🐛 DEBUG: Логируем конфигурацию при инициализации модуля
console.log('[httpClient] VITE_API_URL =', import.meta.env.VITE_API_URL);
console.log('[httpClient] API_BASE_URL =', API_BASE_URL);

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
    const url = `${API_BASE_URL}${input}`;
    console.log('[httpClient] resolveRequestInput: input =', input, '→ url =', url);
    return url;
  }

  console.log('[httpClient] resolveRequestInput: raw input =', input);
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

  debugLogger.info('HTTP Request', {
    url: String(resolvedInput),
    method: rest.method ?? 'GET',
    hasAuth: !skipAuth && (Boolean(telegramInitData) || Boolean(curatorSessionToken)),
    useMocks: USE_MOCKS
  });

  try {
    const response = await fetch(resolvedInput, {
      ...rest,
      headers: finalHeaders
    });

    // Не логируем 401 ошибки в dev-режиме (это ожидаемое поведение для браузера)
    const shouldLogError = !response.ok && !(response.status === 401 && import.meta.env.DEV);

    if (response.ok) {
      debugLogger.success(`HTTP ${response.status}`, {
        url: String(resolvedInput),
        status: response.status,
        statusText: response.statusText
      });
    } else if (shouldLogError) {
      debugLogger.error(`HTTP ${response.status}`, {
        url: String(resolvedInput),
        status: response.status,
        statusText: response.statusText
      });
    }

    return response;
  } catch (error) {
    debugLogger.error('HTTP Error', {
      url: String(resolvedInput),
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
