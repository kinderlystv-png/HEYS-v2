import { WEB_SESSION_EXCHANGE_PATH } from '../../shared/config/urls';
import { apiClient } from '../../services/api-client';
import type { MobileSession, SessionUser } from '../session/types';

export type LoginRequest = {
  email: string;
  mfa_code?: string;
  password: string;
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
    tokenType: response.token_type || 'bearer',
    user: normalizeUser(response.user),
  };
}

export async function login(req: LoginRequest): Promise<MobileSession> {
  const response = await apiClient.post<LoginApiResponse>('/auth/login', req);
  if (response.mfa_required) throw new Error('Для аккаунта требуется MFA-код');
  return normalizeSession(response);
}

export async function verifySession(token: string): Promise<void> {
  await apiClient.post('/auth/verify', { token }, { token });
}

export async function logoutCurator(token: string): Promise<void> {
  await apiClient.post('/auth/curator-logout', undefined, { token });
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
