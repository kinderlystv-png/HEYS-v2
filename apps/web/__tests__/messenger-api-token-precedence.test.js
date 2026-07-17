import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;

const modulePath = path.resolve(__dirname, '../heys_messenger_api_v1.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');

function loadMessengerAPI() {
  eval(moduleSource);
  return window.HEYS.MessengerAPI;
}

describe('HEYS.MessengerAPI token precedence', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
  });

  afterEach(() => {
    localStorage.clear();
    window.HEYS = originalHEYS;
  });

  it('does not reuse a stale PIN bearer during cookie-only curator auth', () => {
    localStorage.setItem('heys_curator_cookie_session_hint', '1');
    localStorage.setItem('heys_session_token', JSON.stringify('stale-pin-token'));

    const api = loadMessengerAPI();

    expect(api._getBearerToken()).toBeNull();
  });

  it('ignores legacy curator JWT storage during production requests', () => {
    localStorage.setItem('heys_curator_session', JSON.stringify('legacy.curator.jwt'));
    localStorage.setItem('heys_curator_cookie_session_hint', '1');
    localStorage.setItem('heys_session_token', JSON.stringify('stale-pin-token'));

    const api = loadMessengerAPI();

    expect(api._getBearerToken()).toBeNull();
  });

  it('keeps PIN session token precedence for explicit PIN auth clients', () => {
    localStorage.setItem('heys_pin_auth_client', 'test-pin-client-id');
    localStorage.setItem('heys_curator_cookie_session_hint', '1');
    localStorage.setItem('heys_session_token', JSON.stringify('pin-session-token'));

    const api = loadMessengerAPI();

    expect(api._getBearerToken()).toBe('pin-session-token');
  });

  it('does not poll unread count before any session token exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, unread_count: 3 }),
    });

    const api = loadMessengerAPI();
    const count = api.getFabUnreadCount();

    await Promise.resolve();

    expect(count).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('backs off inbox polling after server errors', async () => {
    localStorage.setItem('heys_curator_cookie_session_hint', '1');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'internal_error' }),
    });

    const api = loadMessengerAPI();

    await api.refreshInbox();
    await api.refreshInbox();

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[0][0]).toContain('/messages/inbox');
  });
});
