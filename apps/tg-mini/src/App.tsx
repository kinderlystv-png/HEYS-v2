import React from 'react';

import { verifyTelegramSession } from './api/auth';
import { setCuratorSessionToken, setTelegramAuthPayload } from './api/httpClient';
import { DebugPanel } from './components/DebugPanel';
import { useTelegramWebApp } from './hooks/useTelegramWebApp';
import { ClientDayScreen } from './screens/ClientDayScreen';
import { ClientListScreen } from './screens/ClientListScreen';
import type { MiniAppScreen } from './types/navigation';
import type { CuratorClient, CuratorSession } from './types/api';
import { debugLogger } from './utils/debugLogger';

const USE_MOCKS = import.meta.env.VITE_USE_CLIENT_MOCKS === 'true';

function App() {
  const { isReady, user, initData, colorScheme, webApp, isDevMode } = useTelegramWebApp();
  const [screen, setScreen] = React.useState<MiniAppScreen>('clientList');
  const [selectedClient, setSelectedClient] = React.useState<CuratorClient | null>(null);
  const [session, setSession] = React.useState<CuratorSession | null>(null);
  const [authState, setAuthState] = React.useState<'idle' | 'checking' | 'authorized' | 'error'>('idle');
  const [authError, setAuthError] = React.useState<string | null>(null);

  const buildDevSession = React.useCallback((): CuratorSession => ({
    curatorId: 'dev-curator-001',
    name: 'Dev Curator (Browser Mode)',
    username: user?.username || 'dev_curator',
    telegramUserId: user?.id || 123456789,
    token: 'dev-token-' + Date.now(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // +24h
    isDevFallback: true
  }), [user]);

  const runTelegramVerification = React.useCallback(async () => {
    if (!initData) {
      debugLogger.error('Telegram initData недоступна');
      setAuthState('error');
      setAuthError('Telegram initData недоступна. Откройте mini-app из Telegram.');
      setSession(null);
      setTelegramAuthPayload(null);
      setCuratorSessionToken(null);
      return;
    }

    debugLogger.info('Начинаем верификацию Telegram', { initDataLength: initData.length });
    setAuthState('checking');
    setAuthError(null);

    try {
      const verifiedSession = await verifyTelegramSession(initData);
      debugLogger.success('Авторизация успешна', { curatorId: verifiedSession.curatorId });
      setTelegramAuthPayload(initData);
      setSession(verifiedSession);
      setAuthState('authorized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка авторизации';
      debugLogger.error('Ошибка авторизации', { error: errorMessage });
      setSession(null);
      setTelegramAuthPayload(null);
      setCuratorSessionToken(null);
      setAuthState('error');
      setAuthError(errorMessage);
    }
  }, [initData]);

  React.useEffect(() => {
    if (session?.token) {
      setCuratorSessionToken(session.token);
    } else {
      setCuratorSessionToken(null);
    }
  }, [session?.token]);

  React.useEffect(() => {
    if (!isReady) {
      return;
    }

    // Dev-mode: работаем на моках, без реального API
    // Также включаем для случая когда initData пустой (например Telegram Desktop)
    if (USE_MOCKS || isDevMode || !initData || initData.includes('dev_mode_hash')) {
      if (authState !== 'authorized' || !session?.isDevFallback) {
        debugLogger.info('Активирован браузерный режим (моки)', { 
          USE_MOCKS, 
          isDevMode, 
          hasInitData: Boolean(initData)
        });
        setSession(buildDevSession());
        setAuthState('authorized');
        setAuthError(null);
        setTelegramAuthPayload(null);
      }
      return;
    }

    // Не запускаем верификацию повторно если уже проверяли
    if (authState !== 'idle') {
      return;
    }

    runTelegramVerification();
  }, [authState, buildDevSession, isDevMode, isReady, runTelegramVerification, session?.isDevFallback, initData]);

  const resolvedTelegramUser = React.useMemo(() => {
    if (session) {
      return {
        id: session.telegramUserId,
        firstName: session.name.split(' ')[0] || 'Curator',
        lastName: session.name.split(' ')[1],
        username: session.username,
        languageCode: 'ru',
        isPremium: false
      };
    }

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name ?? undefined,
      username: user.username ?? undefined,
      languageCode: user.language_code ?? undefined,
      isPremium: Boolean(user.is_premium)
    };
  }, [session, user]);

  const authStatus = React.useMemo(() => {
    switch (authState) {
      case 'authorized':
        return {
          color: session?.isDevFallback ? '#6d4c41' : '#2e7d32',
          title: session?.isDevFallback ? 'Dev-режим (браузер без Telegram)' : 'Авторизация подтверждена',
          description: session?.isDevFallback
            ? 'Работаем на моках без проверки подписи. Для боевого сценария откройте mini-app из Telegram.'
            : 'Подпись initData провалидирована на сервере, куратор подтверждён.'
        };
      case 'checking':
        return {
          color: '#1976d2',
          title: 'Проверяем подпись Telegram...',
          description: 'Пожалуйста, подождите — это занимает менее секунды.'
        };
      case 'error':
        return {
          color: '#c62828',
          title: 'Авторизация не выполнена',
          description: authError ?? 'Mini-app не получил подтверждение от сервера.'
        };
      default:
        return {
          color: '#607d8b',
          title: 'Ожидаем initData',
          description: 'Как только Telegram передаст данные, проверим подпись автоматически.'
        };
    }
  }, [authError, authState, session]);

  const handleSelectClient = React.useCallback((client: CuratorClient) => {
    setSelectedClient(client);
    setScreen('clientDay');
  }, []);

  const handleBackToList = React.useCallback(() => {
    setScreen('clientList');
    setSelectedClient(null);
  }, []);

  const handleRetryAuth = React.useCallback(() => {
    if (USE_MOCKS || isDevMode) {
      setSession(buildDevSession());
      setAuthState('authorized');
      setAuthError(null);
      setTelegramAuthPayload(null);
      return;
    }

    runTelegramVerification();
  }, [buildDevSession, isDevMode, runTelegramVerification]);

  if (!isReady) {
    return (
      <div style={{ marginTop: '24px' }}>
        <p style={{ 
          padding: '16px', 
          background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)',
          borderRadius: '8px',
          fontSize: '14px'
        }}>
          Инициализация...
        </p>
      </div>
    );
  }

  return (
    <>
      <DebugPanel />
      <div style={{ marginTop: '24px' }}>
        {/* Статус интеграции */}
        <div style={{ 
          padding: '16px', 
          background: webApp ? '#4CAF50' : '#FF9800',
          color: 'white',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '14px',
          fontWeight: '600'
        }}>
          {webApp ? '✅ Telegram WebApp подключен' : '⚠️ Браузерный режим (без Telegram)'}
        </div>

      <div style={{
        padding: '16px',
        background: authStatus.color,
        color: 'white',
        borderRadius: '8px',
        marginBottom: '16px',
        fontSize: '14px',
        lineHeight: 1.5
      }}>
        <div style={{ fontWeight: 600 }}>{authStatus.title}</div>
        <div style={{ marginTop: '6px' }}>{authStatus.description}</div>
        {authState === 'error' && (
          <button
            type="button"
            onClick={handleRetryAuth}
            style={{
              marginTop: '12px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: '#ffffff',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Повторить проверку
          </button>
        )}
      </div>

      {/* Информация о пользователе */}
      {resolvedTelegramUser && (
        <div style={{ 
          padding: '16px', 
          background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          <div style={{ fontWeight: '600', marginBottom: '8px' }}>👤 Пользователь Telegram:</div>
          <div>ID: {resolvedTelegramUser.id}</div>
          <div>Имя: {resolvedTelegramUser.firstName} {resolvedTelegramUser.lastName || ''}</div>
          {resolvedTelegramUser.username && <div>Username: @{resolvedTelegramUser.username}</div>}
          {resolvedTelegramUser.languageCode && <div>Язык: {resolvedTelegramUser.languageCode}</div>}
          {resolvedTelegramUser.isPremium && <div>⭐ Premium</div>}
        </div>
      )}

      {/* Данные WebApp */}
      <div style={{ 
        padding: '16px', 
        background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)',
        borderRadius: '8px',
        marginBottom: '16px',
        fontSize: '13px'
      }}>
        <div style={{ fontWeight: '600', marginBottom: '8px' }}>📱 WebApp данные:</div>
        {webApp && (
          <>
            <div>Платформа: {webApp.platform}</div>
            <div>Версия: {webApp.version}</div>
            <div>Тема: {colorScheme}</div>
            <div>Развёрнут: {webApp.isExpanded ? 'Да' : 'Нет'}</div>
            <div>Высота viewport: {webApp.viewportHeight}px</div>
          </>
        )}
        {!webApp && <div>Данные недоступны в браузерном режиме</div>}
      </div>

      <div style={{ 
        padding: '16px', 
        background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)',
        borderRadius: '8px',
        marginTop: '16px',
        fontSize: '14px',
        lineHeight: '1.5'
      }}>
        <strong>Итерация 7 — авторизация куратора (в процессе)</strong>
        <br />
        <br />
        - Проверяем подпись `initData` на backend.<br />
        - В браузерном режиме доступен dev-fallback на моках.<br />
        - После подтверждения сервером курируем клиентов с реальными данными.
      </div>

      {/* Основной контент mini-app */}
      <div style={{ 
        marginTop: '24px',
        borderRadius: '12px',
        border: '1px solid var(--tg-theme-secondary-bg-color, #e0e0e0)',
        background: 'var(--tg-theme-bg-color, #ffffff)'
      }}>
        {screen === 'clientList' && (
          <ClientListScreen
            session={session}
            isAuthorized={authState === 'authorized'}
            onSelectClient={handleSelectClient}
          />
        )}

        {screen === 'clientDay' && selectedClient && (
          <ClientDayScreen 
            clientId={selectedClient.id} 
            client={selectedClient} 
            onBack={handleBackToList}
          />
        )}
      </div>
      </div>
    </>
  );
}

export default App;
