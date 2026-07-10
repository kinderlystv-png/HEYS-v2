import { useEffect, useState } from 'react';
import * as Network from 'expo-network';
import { useRouter } from 'expo-router';

import { unlockWithBiometrics } from '../src/features/biometrics';
import { isSessionExpired, loadStoredSession, clearStoredSession } from '../src/features/session/storage';
import { verifySession } from '../src/features/auth/api';
import { ScreenState } from '../src/shared/ui/shell';

export default function Index() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setError(null);
        const session = await loadStoredSession();
        if (!session || isSessionExpired(session)) {
          if (session) await clearStoredSession();
          if (!cancelled) router.replace('/web');
          return;
        }

        if (session.biometricUnlockEnabled) {
          const unlocked = await unlockWithBiometrics();
          if (!unlocked) {
            if (!cancelled) setError('Не удалось подтвердить вход через Face ID или код устройства.');
            return;
          }
        }

        const network = await Network.getNetworkStateAsync();
        if (!network.isConnected || !network.isInternetReachable) {
          if (!cancelled) setError('Нет подключения к интернету. Проверьте сеть и повторите.');
          return;
        }

        await verifySession(session);
        if (!cancelled) router.replace('/web');
      } catch {
        await clearStoredSession();
        if (!cancelled) router.replace('/web');
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <ScreenState
        actionLabel="Войти заново"
        body={error}
        onAction={() => router.replace('/web')}
        title="Нужен вход"
      />
    );
  }

  return (
    <ScreenState
      body="Проверяем сессию, сеть и доступ к HEYS."
      loading
      title="Открываем HEYS"
    />
  );
}
