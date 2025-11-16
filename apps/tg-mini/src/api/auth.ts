import { httpRequest } from './httpClient';
import type { CuratorSession } from '../types/api';

export async function verifyTelegramSession(initData: string): Promise<CuratorSession> {
  console.log('[auth] 🔵 START verifyTelegramSession');
  console.log('[auth] initData length:', initData?.length);
  console.log('[auth] about to call httpRequest("/api/telegram/auth/verify")');

  const response = await httpRequest('/api/telegram/auth/verify', {
    method: 'POST',
    skipAuth: true,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ initData })
  });

  console.log('[auth] ✅ httpRequest completed, response.ok =', response.ok, 'status =', response.status);

  if (!response.ok) {
    let message = 'Не удалось подтвердить авторизацию в Telegram';

    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      message = payload.error ?? payload.message ?? message;
      console.log('[auth] ❌ ERROR response payload:', payload);
    } catch (e) {
      console.log('[auth] ⚠️ Failed to parse error JSON:', e);
    }

    console.log('[auth] ❌ Throwing error:', message);
    throw new Error(message);
  }

  console.log('[auth] 🎉 SUCCESS - parsing response JSON');
  return response.json() as Promise<CuratorSession>;
}
