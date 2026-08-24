// Строка контракта login.v4.dc.html «слово»: только «код»; PIN не встречается
// нигде — ни в поле, ни в ошибках, ни в подписях.
//
// Проверяется всё, что видит человек, включая подписи для скринридера:
// aria-label статичного логин-гейта в index.html — такая же подпись, как
// видимая, просто озвученная. Внутренние имена в коде (ключи localStorage,
// id полей, комментарии) словом продукта не являются и под строку не попадают.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');

function userFacingPinMentions(source) {
  const found = [];
  // Видимый текст между тегами и подписи aria-label/title/placeholder.
  const patterns = [
    />([^<>]*\bPIN\b[^<>]*)</gi,
    /(?:aria-label|title|placeholder)="([^"]*\bPIN\b[^"]*)"/gi,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      const text = m[1].trim();
      // Комментарии HTML в захват «>текст<» не попадают, а вот содержимое
      // <script> — попадает: там PIN живёт только в коде и комментариях.
      if (!text || /^\s*\/\//.test(text)) continue;
      found.push(text);
    }
  }
  return found;
}

describe('login: слово только «код»', () => {
  it('does not show PIN anywhere the user can read or hear it', () => {
    const markup = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    expect(userFacingPinMentions(markup)).toEqual([]);
  });

  it('names the keypad and the backspace by the code, not by PIN', () => {
    expect(html).toContain('aria-label="Цифровая клавиатура кода"');
    expect(html).toContain('aria-label="Удалить цифру кода"');
    expect(html).toContain('Если код не подходит или его нужно сбросить');
  });

  it('keeps the field label naming the source of the code', () => {
    // Контракт «подпись поля»: «Код от куратора» — называет источник.
    expect(html).toContain("'Код от куратора'");
  });
});
