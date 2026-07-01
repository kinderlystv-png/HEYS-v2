import { WEB_SESSION_EXCHANGE_PATH } from '../../shared/config/urls';
import { apiClient } from '../../services/api-client';
import type { MobileSession, SessionUser } from '../session/types';

export type LoginRequest = {
  email: string;
  mfa_code?: string;
  password: string;
};

export type PinLoginRequest = {
  phone: string;
  pin: string;
};

type LoginApiResponse = {
  access_token?: string;
  expires_at?: number;
  expires_in?: number;
  mfa_required?: boolean;
  token?: string;
  token_type?: string;
  user?: {
    email?: string;
    id?: string;
    role?: string;
    user_metadata?: {
      name?: string;
    };
  };
};

type PinLoginApiResponse = {
  verify_client_pin_v3?: PinLoginResult;
} | PinLoginResult | PinLoginResult[];

type PinLoginResult = {
  client_id?: string;
  client_name?: string;
  error?: string;
  name?: string;
  session_expires_at?: string;
  session_token?: string;
  success?: boolean;
};

type ClientSessionVerifyResponse = {
  error?: string;
  get_client_data_by_session?: {
    error?: string;
    id?: string;
  };
};

export type WebSessionExchangeResponse = {
  exchange_url?: string;
  expires_at?: number;
  web_url?: string;
};

function normalizeUser(user: LoginApiResponse['user']): SessionUser | undefined {
  if (!user?.id) return undefined;
  return {
    email: user.email,
    id: user.id,
    name: user.user_metadata?.name,
    role: user.role,
  };
}

function normalizeSession(response: LoginApiResponse): MobileSession {
  const accessToken = response.access_token || response.token;
  if (!accessToken) throw new Error('API не вернул access_token');

  return {
    accessToken,
    createdAt: Date.now(),
    expiresAt:
      response.expires_at ||
      (response.expires_in ? Math.floor(Date.now() / 1000) + response.expires_in : undefined),
    kind: 'curator',
    tokenType: response.token_type || 'bearer',
    user: normalizeUser(response.user),
  };
}

function normalizePhoneForPin(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function unwrapPinResponse(response: PinLoginApiResponse): PinLoginResult {
  if (Array.isArray(response)) return response[0] || {};
  const wrapped = response as { verify_client_pin_v3?: PinLoginResult };
  if (wrapped.verify_client_pin_v3) return wrapped.verify_client_pin_v3;
  return response as PinLoginResult;
}

function parseExpiresAt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestampMs = Date.parse(value);
  if (Number.isNaN(timestampMs)) return undefined;
  return Math.floor(timestampMs / 1000);
}

export async function login(req: LoginRequest): Promise<MobileSession> {
  const response = await apiClient.post<LoginApiResponse>('/auth/login', req);
  if (response.mfa_required) throw new Error('Для аккаунта требуется MFA-код');
  return normalizeSession(response);
}

export async function loginWithPin(req: PinLoginRequest): Promise<MobileSession> {
  const response = await apiClient.post<PinLoginApiResponse>(
    '/rpc?fn=verify_client_pin_v3',
    {
      p_phone: normalizePhoneForPin(req.phone),
      p_pin: req.pin,
    },
    { timeoutMs: 15000 }
  );
  const result = unwrapPinResponse(response);
  if (!result?.success || !result.client_id || !result.session_token) {
    const error = result?.error === 'rate_limited'
      ? 'Слишком много попыток. Попробуйте позже.'
      : 'Телефон или PIN не подошли.';
    throw new Error(error);
  }

  return {
    accessToken: result.session_token,
    createdAt: Date.now(),
    expiresAt: parseExpiresAt(result.session_expires_at),
    kind: 'client',
    tokenType: 'bearer',
    user: {
      id: result.client_id,
      name: result.name || result.client_name,
      role: 'client',
    },
  };
}

export async function verifySession(session: MobileSession): Promise<void> {
  if (session.kind === 'client') {
    const response = await apiClient.post<ClientSessionVerifyResponse>(
      '/rpc?fn=get_client_data_by_session',
      { p_session_token: session.accessToken },
      { timeoutMs: 15000 }
    );
    const result = response?.get_client_data_by_session;
    if (response?.error || result?.error) {
      throw new Error(response.error || result?.error || 'Client session is invalid');
    }
    return;
  }

  await apiClient.post('/auth/verify', { token: session.accessToken }, { token: session.accessToken });
}

export async function logoutSession(session: MobileSession): Promise<void> {
  if (session.kind === 'client') {
    await apiClient.post('/auth/client-logout', { session_token: session.accessToken }, { token: session.accessToken });
    return;
  }

  await apiClient.post('/auth/curator-logout', undefined, { token: session.accessToken });
}

export async function requestWebSessionExchange(
  token: string,
  returnUrl: string
): Promise<WebSessionExchangeResponse> {
  return apiClient.post<WebSessionExchangeResponse>(
    WEB_SESSION_EXCHANGE_PATH,
    { return_url: returnUrl },
    { token, timeoutMs: 10000 }
  );
}
