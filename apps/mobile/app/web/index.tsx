import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { getAuthenticatedWebUrl, getUnauthenticatedWebUrl } from '../../src/features/webview/session-exchange';
import { decideNavigation, getInitialWebUrl, openExternalUrl } from '../../src/features/webview/navigation-policy';
import { clearStoredSession, isSessionExpired, loadStoredSession } from '../../src/features/session/storage';
import { colors, PrimaryButton, ScreenState } from '../../src/shared/ui/shell';

export default function WebScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ path?: string }>();
  const webViewRef = useRef<WebView>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  const loadWebSession = useCallback(async () => {
    try {
      setError(null);
      const session = await loadStoredSession();
      if (!session || isSessionExpired(session)) {
        await clearStoredSession();
        router.replace('/auth/login');
        return;
      }

      const authenticatedUrl = await getAuthenticatedWebUrl(session, params.path);
      setSourceUrl(authenticatedUrl);
    } catch (err) {
      const fallback = getUnauthenticatedWebUrl();
      setSourceUrl(fallback);
      setError(
        err instanceof Error
          ? `${err.message}. Открыт web-вход без передачи mobile token.`
          : 'Не удалось подготовить web-сессию.'
      );
    }
  }, [params.path, router]);

  useEffect(() => {
    loadWebSession();
  }, [loadWebSession]);

  const onShouldStartLoadWithRequest = (request: WebViewNavigation) => {
    const decision = decideNavigation(request.url);
    if (decision.action === 'allow') return true;
    if (decision.action === 'external') {
      openExternalUrl(decision.url).catch((err) => Alert.alert('Ссылка не открылась', err.message));
      return false;
    }

    Alert.alert('Переход заблокирован', decision.reason);
    return false;
  };

  if (!sourceUrl) {
    return (
      <ScreenState
        body="Готовим безопасный вход в web-часть HEYS."
        loading
        title="Открываем приложение"
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>HEYS</Text>
        <View style={styles.toolbarActions}>
          <Pressable accessibilityRole="button" onPress={() => webViewRef.current?.reload()}>
            <Text style={styles.toolbarLink}>Обновить</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/settings')}>
            <Text style={styles.toolbarLink}>Настройки</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.warning}>
          <Text style={styles.warningText}>{error}</Text>
          <PrimaryButton label="Повторить exchange" onPress={loadWebSession} secondary style={styles.retry} />
        </View>
      ) : null}

      <WebView
        ref={webViewRef}
        allowsBackForwardNavigationGestures
        javaScriptEnabled
        onError={(event) => setError(event.nativeEvent.description)}
        onHttpError={(event) => setError(`HTTP ${event.nativeEvent.statusCode}`)}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        originWhitelist={['https://*', 'http://*', 'heys://*']}
        pullToRefreshEnabled
        source={{ uri: sourceUrl }}
        startInLoadingState
      />

      <Pressable accessibilityRole="button" onPress={() => Linking.openURL(sourceUrl)} style={styles.externalOpen}>
        <Text style={styles.externalOpenText}>Открыть в Safari</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    flex: 1,
  },
  externalOpen: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
  externalOpenText: {
    color: colors.muted,
    fontSize: 13,
  },
  retry: {
    marginTop: 10,
  },
  toolbar: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 54,
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: 16,
  },
  toolbarLink: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  toolbarTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  warning: {
    backgroundColor: '#fff8e8',
    borderBottomColor: '#eed99d',
    borderBottomWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  warningText: {
    color: '#6f5418',
    fontSize: 13,
    lineHeight: 18,
  },
});
