import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';

import { parseDeepLink } from '../src/features/deeplink/routes';

function DeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      const target = parseDeepLink(url);
      if (target.route === '/web' && target.webPath) {
        router.push({ pathname: '/web', params: { path: target.webPath } });
        return;
      }
      router.push(target.route);
    };

    Linking.getInitialURL().then(handleUrl).catch(() => undefined);
    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, [router]);

  return null;
}

export default function RootLayout() {
  return (
    <>
      <DeepLinkHandler />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ title: 'HEYS' }} />
        <Stack.Screen name="auth/login" options={{ title: 'Вход' }} />
        <Stack.Screen name="web/index" options={{ title: 'HEYS' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Настройки' }} />
      </Stack>
    </>
  );
}

export const unstable_settings = {
  initialRouteName: 'index',
};
