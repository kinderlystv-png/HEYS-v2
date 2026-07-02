import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { getAuthenticatedWebUrl, getUnauthenticatedWebUrl } from '../../src/features/webview/session-exchange';
import { decideNavigation, getInitialWebUrl, openExternalUrl } from '../../src/features/webview/navigation-policy';
import { clearStoredSession, isSessionExpired, loadStoredSession } from '../../src/features/session/storage';
import { colors, PrimaryButton, ScreenState } from '../../src/shared/ui/shell';

const mobileSettingsBridgeScript = `
(function () {
  if (window.__HEYS_MOBILE_SETTINGS_BRIDGE__) return true;
  window.__HEYS_MOBILE_SETTINGS_BRIDGE__ = true;

  function post(type) {
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: type }));
    } catch (error) {}
  }

  function makeItem(className, icon, label, type) {
    var item = document.createElement('div');
    item.className = 'tab-settings-item ' + className;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.innerHTML = '<span class="tab-settings-icon">' + icon + '</span><span>' + label + '</span>';
    item.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      post(type);
    });
    item.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        post(type);
      }
    });
    return item;
  }

  function syncMobileSettingsItems() {
    var menu = document.querySelector('.tab-settings-menu');
    if (!menu || menu.querySelector('.heys-mobile-native-settings-item')) return;

    var webSettingsItem = menu.querySelector('.tab-settings-item');
    var nativeSettingsItem = makeItem(
      'heys-mobile-native-settings-item',
      '📱',
      'Настройки приложения',
      'open-native-settings'
    );
    var reloadItem = makeItem(
      'heys-mobile-reload-item',
      '↻',
      'Обновить',
      'reload-webview'
    );

    if (webSettingsItem && webSettingsItem.nextSibling) {
      menu.insertBefore(reloadItem, webSettingsItem.nextSibling);
      menu.insertBefore(nativeSettingsItem, reloadItem);
      return;
    }

    menu.insertBefore(nativeSettingsItem, menu.firstChild);
    menu.insertBefore(reloadItem, nativeSettingsItem.nextSibling);
  }

  syncMobileSettingsItems();
  setInterval(syncMobileSettingsItems, 500);

  if (document.body) {
    new MutationObserver(syncMobileSettingsItems).observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  return true;
})();
true;
`;

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

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string };
      if (message.type === 'open-native-settings') {
        router.push('/settings');
        return;
      }
      if (message.type === 'reload-webview') {
        webViewRef.current?.reload();
      }
    } catch {
      // Ignore unrelated messages from the web app.
    }
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
    <SafeAreaView edges={['top']} style={styles.container}>
      {error ? (
        <View style={styles.warning}>
          <Text style={styles.warningText}>{error}</Text>
          <PrimaryButton label="Повторить exchange" onPress={loadWebSession} secondary style={styles.retry} />
        </View>
      ) : null}

      <WebView
        ref={webViewRef}
        allowsBackForwardNavigationGestures
        injectedJavaScript={mobileSettingsBridgeScript}
        javaScriptEnabled
        onError={(event) => setError(event.nativeEvent.description)}
        onHttpError={(event) => setError(`HTTP ${event.nativeEvent.statusCode}`)}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        originWhitelist={['https://*', 'http://*', 'heys://*']}
        pullToRefreshEnabled
        source={{ uri: sourceUrl }}
        startInLoadingState
        style={styles.webview}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    flex: 1,
  },
  retry: {
    marginTop: 10,
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
  webview: {
    flex: 1,
  },
});
