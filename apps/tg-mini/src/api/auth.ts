import { httpRequest } from './httpClient';
import type { CuratorSession } from '../types/api';

export async function verifyTelegramSession(initData: string): Promise<CuratorSession> {
  const response = await httpRequest('/api/telegram/auth/verify', {
    method: 'POST',
    skipAuth: true,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ initData })
  });

  if (!response.ok) {
    let message = 'Не удалось подтвердить авторизацию в Telegram';

    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      message = payload.error ?? payload.message ?? message;
    } catch {
      // ignore JSON parsing errors
    }

    throw new Error(message);
  }

  return response.json() as Promise<CuratorSession>;
}
