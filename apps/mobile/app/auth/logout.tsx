import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';

import { logoutCurator } from '../../src/features/auth/api';
import { clearStoredSession, loadStoredSession } from '../../src/features/session/storage';
import { API_URL } from '../../src/shared/config/urls';
import { ScreenState } from '../../src/shared/ui/shell';

const WEB_LOGOUT_URL = `${API_URL}/auth/curator-logout`;

export default function LogoutScreen() {
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const finishedRef = useRef(false);
  const [webLogoutStarted, setWebLogoutStarted] = useState(false);

  const finishLogout = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    try {
      webViewRef.current?.clearCache?.(true);
    } catch {
      // Best-effort only: cookie clearing is handled by the server logout response.
    }

    await clearStoredSession();
    router.replace('/auth/login');
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function revokeNativeSession() {
      const session = await loadStoredSession();
      const token = session?.accessToken;
      if (token) {
        await logoutCurator(token).catch(() => undefined);
      }
      if (!cancelled) setWebLogoutStarted(true);
    }

    revokeNativeSession().catch(() => {
      if (!cancelled) setWebLogoutStarted(true);
    });

    const fallback = setTimeout(() => {
      finishLogout().catch(() => undefined);
    }, 4000);

    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, [finishLogout]);

  return (
    <View style={{ flex: 1 }}>
      <ScreenState
        body="Завершаем web-сессию и очищаем локальный вход на этом устройстве."
        loading
        title="Выходим из HEYS"
      />
      {webLogoutStarted ? (
        <WebView
          ref={webViewRef}
          onError={() => finishLogout().catch(() => undefined)}
          onHttpError={() => finishLogout().catch(() => undefined)}
          onLoadEnd={() => finishLogout().catch(() => undefined)}
          source={{
            body: '{}',
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            uri: WEB_LOGOUT_URL,
          }}
          style={{ height: 1, opacity: 0, width: 1 }}
        />
      ) : null}
    </View>
  );
}

