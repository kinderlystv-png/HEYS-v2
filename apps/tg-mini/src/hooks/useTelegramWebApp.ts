import { useEffect, useState } from 'react';

import type { TelegramWebApp } from '../telegram';

/**
 * React-хук для работы с Telegram WebApp API
 * Инициализирует WebApp и предоставляет доступ к его методам и данным
 */
/**
 * Создаёт моковые данные для dev-режима (работа без реального Telegram)
 */
function createDevFallback() {
  return {
    user: {
      id: 123456789,
      first_name: 'Dev',
      last_name: 'Curator',
      username: 'dev_curator',
      language_code: 'ru',
      is_bot: false,
      allows_write_to_pm: true,
    },
    // Моковый initData для тестирования (НЕ используется в production!)
    initData: 'user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Dev%22%2C%22last_name%22%3A%22Curator%22%2C%22username%22%3A%22dev_curator%22%2C%22language_code%22%3A%22ru%22%7D&auth_date=1700000000&hash=dev_mode_hash',
  };
}

export function useTelegramWebApp() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    // Проверяем доступность Telegram WebApp
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      
      // Инициализируем WebApp
      tg.ready();
      
      // Разворачиваем на весь экран
      tg.expand();
      
      // Применяем тему Telegram к странице
      document.body.style.backgroundColor = tg.backgroundColor;
      
      setWebApp(tg);
      setIsReady(true);
      
      // Логируем данные для отладки (только в dev-режиме)
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('🔷 Telegram WebApp initialized');
        // eslint-disable-next-line no-console
        console.log('Platform:', tg.platform);
        // eslint-disable-next-line no-console
        console.log('Version:', tg.version);
        // eslint-disable-next-line no-console
        console.log('Color Scheme:', tg.colorScheme);
        // eslint-disable-next-line no-console
        console.log('Init Data:', tg.initData || '(empty)');
        // eslint-disable-next-line no-console
        console.log('User:', tg.initDataUnsafe.user || '(none)');
        // eslint-disable-next-line no-console
        console.log('Theme Params:', tg.themeParams);
      }
    } else {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('⚠️ Telegram WebApp SDK not available. Running in browser mode.');
        setDevMode(true);
      }
      setIsReady(true);
    }
  }, []);

  // Dev-fallback для работы без Telegram
  const devFallback = import.meta.env.DEV ? createDevFallback() : null;
  const hasRealTelegramData = webApp && (webApp.initData || webApp.initDataUnsafe.user);

  return {
    webApp,
    isReady,
    isDevMode: devMode || (!hasRealTelegramData && import.meta.env.DEV),
    user: webApp?.initDataUnsafe.user || devFallback?.user || null,
    initData: webApp?.initData || devFallback?.initData || '',
    colorScheme: webApp?.colorScheme || 'light',
    themeParams: webApp?.themeParams || {},
  };
}
