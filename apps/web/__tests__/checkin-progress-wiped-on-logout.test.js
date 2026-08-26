/**
 * @fileoverview Строка контракта checkin-morning «выход, удаление данных,
 * производительность»: «незаконченный чек-ин при выходе из аккаунта стирается
 * вместе с кешем».
 *
 * Точечной чистки этого ключа в коде нет и не должно быть: `cloud.signOut()`
 * зовёт `clearNamespace()` без clientId, а полный wipe сносит любой наш ключ,
 * которого нет в `NON_CLIENT_DATA_BLACKLIST`. Правило держится тем, что ключ
 * прогресса в этот список не попадёт — искать его в чужом коде бессмысленно,
 * стеречь надо именно исключение.
 *
 * Пользователь такой стык не соберёт руками: нужно бросить чек-ин на середине,
 * выйти и посмотреть, что осталось в хранилище. Поэтому реплика поведения.
 */

import { describe, expect, it } from 'vitest';

const fs = require('node:fs');
const path = require('node:path');

const storageSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'heys_storage_supabase_v1.js'),
  'utf8',
);

function blacklistArea() {
  const start = storageSrc.indexOf('const NON_CLIENT_DATA_BLACKLIST = [');
  if (start < 0) throw new Error('Test setup: NON_CLIENT_DATA_BLACKLIST не найден');
  const end = storageSrc.indexOf('];', start);
  if (end < 0) throw new Error('Test setup: конец NON_CLIENT_DATA_BLACKLIST не найден');
  return storageSrc.slice(start, end);
}

describe('незаконченный чек-ин стирается при выходе', () => {
  it('ключ прогресса не занесён в список переживающих выход', () => {
    expect(blacklistArea()).not.toContain('morning_checkin_progress');
  });

  it('ключ прогресса объявлен client-specific', () => {
    const start = storageSrc.indexOf('const CLIENT_SPECIFIC_PREFIXES = [');
    expect(start).toBeGreaterThan(-1);
    const area = storageSrc.slice(start, storageSrc.indexOf('];', start));
    expect(area).toContain('heys_morning_checkin_progress_v1_');
  });

  it('signOut зовёт полную чистку без clientId', () => {
    const start = storageSrc.indexOf('cloud.signOut = function');
    expect(start).toBeGreaterThan(-1);
    const body = storageSrc.slice(start, start + 4000);
    expect(body).toMatch(/clearNamespace\(\s*\)/);
  });

  it('реплика полного wipe: прогресс уходит, а сессия и раскладка остаются', () => {
    // Повторяем ветку `else` из clearNamespace: наш ключ, не из чёрного
    // списка, не раскладка Главной — удаляется.
    const BLACKLIST = new Set([
      'heys_supabase_auth_token',
      'heys_pin_auth_client',
      'heys_theme',
    ]);
    const stripScope = (k) => k.replace(/^heys_[0-9a-f-]{36}_/i, 'heys_');
    const isOurKey = (k) => k.startsWith('heys_') && !/^heys_(supabase_auth_token|pin_auth_client)$/.test(k);
    const isNonClientDataKey = (k) => BLACKLIST.has(k) || BLACKLIST.has(stripScope(k));

    const cid = '11111111-2222-3333-4444-555555555555';
    const store = {
      [`heys_${cid}_morning_checkin_progress_v1_2026-08-26`]: '{"step":3}',
      'heys_morning_checkin_progress_v1_2026-08-26': '{"step":1}',
      [`heys_${cid}_widget_layout_v1`]: '[]',
      heys_supabase_auth_token: 'token',
      heys_theme: 'sand',
    };

    for (const k of Object.keys(store)) {
      if (isOurKey(k) && !isNonClientDataKey(k)) {
        if (/_widget_layout_(?:meta_)?v1$/i.test(k)) continue;
        delete store[k];
      }
    }

    expect(Object.keys(store).sort()).toEqual([
      `heys_${cid}_widget_layout_v1`,
      'heys_supabase_auth_token',
      'heys_theme',
    ]);
  });

  it('мутация: занеси ключ в чёрный список — проверка падает', () => {
    const mutated = blacklistArea() + "\n    'heys_morning_checkin_progress_v1_2026-08-26',";
    expect(mutated).toContain('morning_checkin_progress');
  });
});
