import * as Linking from 'expo-linking';

export type DeepLinkTarget =
  | { route: '/auth/login' }
  | { route: '/settings' }
  | { route: '/web'; webPath?: string };

export function parseDeepLink(url: string): DeepLinkTarget {
  const parsed = Linking.parse(url);
  const path = [parsed.hostname, parsed.path].filter(Boolean).join('/');
  const normalizedPath = path.replace(/^\/+/, '');

  if (!normalizedPath || normalizedPath === 'open') return { route: '/web' };
  if (normalizedPath === 'login' || normalizedPath === 'auth/login') return { route: '/auth/login' };
  if (normalizedPath === 'settings' || normalizedPath === 'support') return { route: '/settings' };

  if (normalizedPath.startsWith('open/')) {
    return { route: '/web', webPath: `/${normalizedPath.replace(/^open\//, '')}` };
  }

  return { route: '/web', webPath: `/${normalizedPath}` };
}
