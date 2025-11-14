import crypto from 'node:crypto';

export interface TelegramUserInfo {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TelegramInitData {
  query_id?: string;
  user?: TelegramUserInfo;
  auth_date: string | number;
  hash: string;
  [key: string]: unknown;
}

export interface VerifyTelegramResult {
  ok: boolean;
  user?: TelegramUserInfo;
  error?: string;
}

export function parseInitData(input: string): Record<string, string> {
  const result: Record<string, string> = {};

  input.split('&').forEach((chunk) => {
    const [rawKey, rawValue] = chunk.split('=');
    if (!rawKey) return;
    const key = decodeURIComponent(rawKey);
    const value = decodeURIComponent(rawValue ?? '');
    result[key] = value;
  });

  return result;
}

export function verifyTelegramInitData(initData: string, botToken: string): VerifyTelegramResult {
  if (!initData) {
    return { ok: false, error: 'initData отсутствует' };
  }

  if (!botToken) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN не настроен' };
  }

  const parsed = parseInitData(initData);
  const receivedHash = parsed.hash;
  if (!receivedHash) {
    return { ok: false, error: 'hash отсутствует в initData' };
  }

  const authDate = Number(parsed.auth_date);
  if (!authDate || Number.isNaN(authDate)) {
    return { ok: false, error: 'Некорректный auth_date' };
  }

  const dataCheckString = Object.entries(parsed)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (calculatedHash !== receivedHash) {
    return { ok: false, error: 'Подпись Telegram не совпадает' };
  }

  let user: TelegramUserInfo | undefined;
  if (parsed.user) {
    try {
      user = JSON.parse(parsed.user) as TelegramUserInfo;
    } catch (error) {
      return { ok: false, error: `Не удалось разобрать user: ${(error as Error).message}` };
    }
  }

  return { ok: true, user };
}

export function ensureUserAllowed(telegramId: number, allowedIds: number[]): VerifyTelegramResult {
  if (!allowedIds.length) {
    return { ok: true };
  }

  if (!allowedIds.includes(telegramId)) {
    return { ok: false, error: 'Этот Telegram ID не имеет доступа к панели куратора' };
  }

  return { ok: true };
}
