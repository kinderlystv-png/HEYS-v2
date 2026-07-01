import { HEYS_WEB_URL } from '../../shared/config/urls';
import { requestWebSessionExchange } from '../auth/api';
import type { StoredSession } from '../session/types';
import { getInitialWebUrl } from './navigation-policy';

export async function getAuthenticatedWebUrl(session: StoredSession): Promise<string> {
  const response = await requestWebSessionExchange(session.accessToken, HEYS_WEB_URL);
  const url = response.exchange_url || response.web_url;

  if (!url) {
    throw new Error('API не вернул ссылку для web session exchange');
  }

  return url;
}

export function getUnauthenticatedWebUrl(): string {
  return getInitialWebUrl('/');
}
