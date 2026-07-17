import { beforeEach, describe, expect, it, vi } from 'vitest';

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));

vi.mock('expo-linking', () => ({ parse }));

import { parseDeepLink } from '../routes';

beforeEach(() => {
  parse.mockReset();
});

describe('mobile deep-link routing', () => {
  it('routes login back through the controlled WebView', () => {
    parse.mockReturnValue({ hostname: 'login', path: null });

    expect(parseDeepLink('heys://login')).toEqual({ route: '/web' });
  });

  it('keeps settings native and forwards content paths to the guarded WebView', () => {
    parse.mockReturnValueOnce({ hostname: 'settings', path: null });
    expect(parseDeepLink('heys://settings')).toEqual({ route: '/settings' });

    parse.mockReturnValueOnce({ hostname: 'open', path: 'diary/2026-07-17' });
    expect(parseDeepLink('heys://open/diary/2026-07-17')).toEqual({
      route: '/web',
      webPath: '/diary/2026-07-17',
    });
  });
});
