// Кегли поля телефона на входе сверяются с КАДРАМИ канваса, а не с прозой.
//
// В login.v4.dc.html строка «вид карточки и боксов кода» говорит «текст
// 13 px/600», а собственные кадры того же файла рисуют номер 17 px/600 и
// префикс «+7» 15 px/600. Канвас расходится сам с собой. 25 августа сессия
// поверила строке и увела код с 17 на 13 — номер стал мелким и перестал
// занимать ширину поля. Решением владельца 30 августа верны кадры.
//
// Дрейф контрактов этого не ловит: он сверяет текст контракта с вердиктами,
// расхождение строки со своим же кадром для него невидимо. Поэтому числа тут
// берутся прямо из кадров — тест краснеет и при правке кода, и при правке
// макета, то есть переживёт следующий пакет дизайна.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const CANVAS = path.join(
  ROOT,
  'web/../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/login.v4.dc.html',
);
const CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/733-ui-v4-login-theme.css'),
  'utf8',
);

/** Кегли из кадров: у номера и у префикса «+7» они разные.
 *
 *  Первое вхождение номера-образца лежит в прозе контракта (строка «пределы и
 *  формат» цитирует маску), там объявлений шрифта нет. Поэтому идём по всем
 *  вхождениям и берём первое, рядом с которым кадр действительно задаёт кегли. */
function frameFontSizes() {
  const html = fs.readFileSync(CANVAS, 'utf8');
  for (const m of html.matchAll(/455-61-11/g)) {
    const chunk = html.slice(Math.max(0, m.index - 320), m.index + 60);
    const fonts = [...chunk.matchAll(/font:\s*600\s+(\d+(?:\.\d+)?)px/g)].map((x) => Number(x[1]));
    if (fonts.length >= 2) return { prefix: fonts.at(-2), number: fonts.at(-1) };
  }
  throw new Error('в кадрах канваса не нашлось поля телефона с объявленными кеглями');
}

/** Значение font-size у правила, чей селектор содержит признак. */
function cssFontSize(marker) {
  const rules = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  for (const [, selector, body] of rules) {
    if (!selector.includes(marker)) continue;
    const m = body.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
    if (m) return Number(m[1]);
  }
  return null;
}

describe('вход · кегли поля телефона совпадают с кадрами канваса', () => {
  it('кадры задают 15 px у префикса и 17 px у номера', () => {
    const { prefix, number } = frameFontSizes();
    expect(prefix).toBe(15);
    expect(number).toBe(17);
  });

  it('продуктовый CSS повторяет числа кадров, а не строку про 13 px', () => {
    const { prefix, number } = frameFontSizes();
    expect(cssFontSize('.heys-auth-shell .phone-prefix-large')).toBe(prefix);
    expect(cssFontSize('.heys-auth-shell input.phone-input-large')).toBe(number);
  });
});
