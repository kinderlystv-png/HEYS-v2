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

  it('prefers curator JWT over stale PIN session token outside PIN auth', () => {
    localStorage.setItem('heys_curator_session', 'curator.jwt.token');
    localStorage.setItem('heys_session_token', JSON.stringify('stale-pin-token'));

    const api = loadMessengerAPI();

    expect(api._getBearerToken()).toBe('curator.jwt.token');
  });

  it('unwraps JSON-serialized curator JWT before sending Authorization', () => {
    localStorage.setItem('heys_curator_session', JSON.stringify('curator.jwt.token'));
    localStorage.setItem('heys_session_token', JSON.stringify('stale-pin-token'));

    const api = loadMessengerAPI();

    expect(api._getBearerToken()).toBe('curator.jwt.token');
  });

  it('keeps PIN session token precedence for explicit PIN auth clients', () => {
    localStorage.setItem('heys_pin_auth_client', 'test-pin-client-id');
    localStorage.setItem('heys_curator_session', 'curator.jwt.token');
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
    localStorage.setItem('heys_curator_session', 'curator.jwt.token');
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
