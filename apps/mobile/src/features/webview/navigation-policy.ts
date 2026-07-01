import { Linking } from 'react-native';

import { getAllowedWebHosts, HEYS_WEB_URL } from '../../shared/config/urls';

export type NavigationDecision =
  | { action: 'allow' }
  | { action: 'block'; reason: string }
  | { action: 'external'; url: string };

const BLOCKED_SCHEMES = new Set(['file:', 'data:', 'javascript:']);

export function getInitialWebUrl(path = '/'): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${HEYS_WEB_URL}${normalizedPath}`;
}

export function decideNavigation(url: string): NavigationDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { action: 'block', reason: 'Некорректная ссылка' };
  }

  if (BLOCKED_SCHEMES.has(parsed.protocol)) {
    return { action: 'block', reason: `Схема ${parsed.protocol} запрещена` };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { action: 'external', url };
  }

  const allowedHosts = getAllowedWebHosts();
  if (allowedHosts.has(parsed.hostname.toLowerCase())) {
    return { action: 'allow' };
  }

  return { action: 'external', url };
}

export async function openExternalUrl(url: string): Promise<void> {
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) throw new Error('iOS не может открыть эту ссылку');
  await Linking.openURL(url);
}
