import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

// heys/bcc11c — короткие псевдонимы текстовых ролей.
//
// Дефект, который здесь закрыт: --text-primary, --text-secondary и
// --text-tertiary были объявлены только внутри [data-theme$="dark"]. В светлых
// темах var(--text-*) не разрешался: где стоял запасной цвет — рисовался он,
// где не стоял — текст оставался вовсе без цвета.
//
// Правило: роль, которую используют без запасного значения, обязана быть
// объявлена в теманезависимом :root. Тёмная тема переопределяет её через
// --heys-text-*, а не через отдельное объявление псевдонима.

const tokensPath = path.resolve(__dirname, '../styles/modules/001-design-tokens.css');
const tokens = fs.readFileSync(tokensPath, 'utf8');
const stylesDir = path.resolve(__dirname, '../styles');

const ROLES = ['text-primary', 'text-secondary', 'text-tertiary'];

/** Текст первого :root { ... } блока — того, что действует в любой теме. */
function rootBlock(css) {
  const start = css.indexOf(':root {');
  expect(start).toBeGreaterThan(-1);
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
}

function cssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

describe('текстовые роли объявлены для всех тем', () => {
  const root = rootBlock(tokens);

  it.each(ROLES)('--%s объявлена в базовом :root', (role) => {
    expect(root).toMatch(new RegExp('--' + role + ':'));
  });

  it.each(ROLES)('--%s ложится на темозависимый --heys-text-*', (role) => {
    // Прямой цвет вместо var(--heys-text-*) сломал бы тёмную тему молча:
    // объявление в :root перестало бы переопределяться.
    expect(root).toMatch(new RegExp('--' + role + ':\\s*var\\(--heys-text-'));
  });

});

describe('использование ролей', () => {
  it('места без запасного значения опираются на объявленную роль', () => {
    // 730-widgets-dashboard.css держал 16 таких мест на --text-tertiary —
    // именно они рисовались без цвета. Тест не запрещает такой стиль записи,
    // он лишь фиксирует: раз пишем без запасного, роль должна существовать.
    // Только цветовые роли: --text-base и соседи — это типографика, она
    // объявлена в другом модуле и к этому дефекту отношения не имеет.
    const used = new Set();
    for (const file of cssFiles(stylesDir)) {
      const css = fs.readFileSync(file, 'utf8');
      for (const m of css.matchAll(/var\(--(text-[a-z-]+)\)/g)) {
        if (ROLES.includes(m[1])) used.add(m[1]);
      }
    }
    const root = rootBlock(tokens);
    const undeclared = [...used].filter((role) => !new RegExp('--' + role + ':').test(root));
    expect(undeclared).toEqual([]);
    // Дефект был именно здесь: без объявления эти места рисовались без цвета.
    expect(used.has('text-tertiary')).toBe(true);
  });
});
