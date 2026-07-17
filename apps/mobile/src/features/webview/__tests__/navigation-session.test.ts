import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestWebSessionExchange } = vi.hoisted(() => ({
  requestWebSessionExchange: vi.fn(),
}));

vi.mock('react-native', () => ({
  Linking: {
    canOpenURL: vi.fn(),
    openURL: vi.fn(),
  },
}));

vi.mock('../../../shared/config/urls', () => ({
  HEYS_WEB_URL: 'https://app.heyslab.ru',
  getAllowedWebHosts: () => new Set(['app.heyslab.ru', 'api.heyslab.ru']),
}));

vi.mock('../../auth/api', () => ({ requestWebSessionExchange }));

import { decideNavigation, getInitialWebUrl } from '../navigation-policy';
import { getAuthenticatedWebUrl, getUnauthenticatedWebUrl } from '../session-exchange';

const session = {
  accessToken: 'mobile-session-token',
  createdAt: 1_700_000_000,
  expiresAt: 2_000_000_000,
  kind: 'client' as const,
  tokenType: 'Bearer',
  user: { id: 'client-1' },
};

beforeEach(() => {
  requestWebSessionExchange.mockReset();
});

describe('mobile WebView navigation policy', () => {
  it('keeps relative paths on the HEYS web origin', () => {
    expect(getInitialWebUrl('diary/2026-07-17')).toBe('https://app.heyslab.ru/diary/2026-07-17');
    expect(getUnauthenticatedWebUrl()).toBe('https://app.heyslab.ru/');
  });

  it('allows HEYS hosts, opens foreign links externally, and blocks scriptable schemes', () => {
    expect(decideNavigation('https://app.heyslab.ru/diary')).toEqual({ action: 'allow' });
    expect(decideNavigation('https://example.com/help')).toEqual({
      action: 'external',
      url: 'https://example.com/help',
    });
    expect(decideNavigation('javascript:alert(1)')).toEqual({
      action: 'block',
      reason: 'Схема javascript: запрещена',
    });
    expect(decideNavigation('not a url')).toEqual({
      action: 'block',
      reason: 'Некорректная ссылка',
    });
  });
});

describe('one-time mobile WebView session exchange', () => {
  it('requests an exchange for the guarded return URL without putting the session token in it', async () => {
    requestWebSessionExchange.mockResolvedValue({
      exchange_url: 'https://api.heyslab.ru/auth/mobile/session-exchange?code=one-time',
    });

    const result = await getAuthenticatedWebUrl(session, '/diary');

    expect(requestWebSessionExchange).toHaveBeenCalledWith(
      'mobile-session-token',
      'https://app.heyslab.ru/diary',
    );
    expect(result).toBe('https://api.heyslab.ru/auth/mobile/session-exchange?code=one-time');
    expect(result).not.toContain(session.accessToken);
  });

  it('fails closed when the API returns no exchange URL', async () => {
    requestWebSessionExchange.mockResolvedValue({});

    await expect(getAuthenticatedWebUrl(session, '/')).rejects.toThrow(
      'API не вернул ссылку для web session exchange',
    );
  });
});
