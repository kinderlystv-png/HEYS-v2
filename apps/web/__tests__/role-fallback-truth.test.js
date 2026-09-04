// Запасное значение рядом с ролью не должно называть ДРУГУЮ поверхность набора.
//
// Четвёртый гейт цепочки `pnpm ui:v4:check:roles`. Три regex-скрипта рядом exit 0
// на битом CSS; здесь postcss падает на незакрытых скобках и прочем синтаксисе.
//
// Форма записи `var(--роль, запасное)` рисует роль, а читается — запасное:
// именно его видит ревью и сверка с канвасом. Пока запасное совпадает со
// значением роли, это безобидное дублирование. Как только оно называет соседнюю
// поверхность, код начинает врать: `var(--v4-hero, #f7efe2)` рисует вторую
// поверхность, обещая первую, — и неверно выбранная роль перестаёт быть видимой
// при чтении кода.
//
// Класс уже возвращался сам. 30 августа карточки советов перевели на верную
// роль --v4-c1, но лист под ними остался на --v4-surface: обе роли дают
// #f7efe2, обводки и тени у карточек нет, и в песочной теме карточки слились с
// листом. Поймали глазами; второй раз никто не обязан.
//
// Якорь — семейство ролей и лестница поверхностей самой палитры, а не список
// цветов в этом файле: смена значения набора проверку не ломает и не протухает.
import fs from 'node:fs';
import path from 'node:path';

import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const MODULES = path.resolve(__dirname, '../styles/modules');
const PALETTE = path.join(MODULES, '002-ui-v4-palette-roles.css');
const PALETTES = ['sand', 'sand-dark', 'blue', 'blue-dark'];

// Лестница bg / c1 / c2 каждого набора — из блока [data-contract] пакета
// дизайна, теми же числами, что держит v4-palette-roles-contract.test.js.
const ЛЕСТНИЦА = {
  sand: ['#fffaf1', '#f7efe2', '#efe3cf'],
  'sand-dark': ['#141210', '#23201b', '#2f2820'],
  blue: ['#ffffff', '#eef3f9', '#e2ecf6'],
  'blue-dark': ['#0d1a26', '#182a3a', '#1e3448'],
};

// Единственное исключение, и оно про совпадение, а не про поверхность: фон
// синего набора — чистый белый, и любое дореформенное `#ffffff` в запасном
// значении читалось бы как «названа первая ступень синей лестницы». Белый в
// коде почти всегда просто белый, поэтому по нему не судим.
const СОВПАДЕНИЕ = '#ffffff';

const norm = (value) => {
  const v = value.trim().toLowerCase().replace(/\s+/g, '');
  if (/^#[0-9a-f]{3}$/.test(v))
    return `#${v
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`;
  return v;
};

/** Значения всех ролей v4 по каждому из четырёх наборов. */
function paletteBlocks() {
  const root = postcss.parse(fs.readFileSync(PALETTE, 'utf8'), { from: PALETTE });
  const blocks = new Map(PALETTES.map((id) => [id, new Map()]));
  root.walkRules((rule) => {
    for (const id of PALETTES) {
      if (!rule.selector.includes(`[data-theme-id="${id}"]`)) continue;
      rule.walkDecls((decl) => {
        if (decl.prop.startsWith('--v4-')) blocks.get(id).set(decl.prop, norm(decl.value));
      });
    }
  });
  return blocks;
}

/** Роли, которые хоть в одном наборе стоят на ступени лестницы. */
function surfaceRoles(blocks) {
  const out = new Set();
  for (const id of PALETTES) {
    for (const [role, value] of blocks.get(id)) {
      if (ЛЕСТНИЦА[id].includes(value)) out.add(role);
    }
  }
  return out;
}

/**
 * Ключ нарушения — файл, селектор и свойство: номера строк в общем main
 * съезжают от чужих правок каждый час, селектор это переживает.
 */
function scan(blocks, roles) {
  const found = new Map();
  for (const file of fs.readdirSync(MODULES).filter((f) => f.endsWith('.css'))) {
    const full = path.join(MODULES, file);
    const root = postcss.parse(fs.readFileSync(full, 'utf8'), { from: full });
    root.walkDecls((decl) => {
      for (const m of decl.value.matchAll(
        /var\(\s*(--v4-[a-z0-9-]+)\s*,\s*(#[0-9a-fA-F]{3,6})\s*\)/g,
      )) {
        const role = m[1];
        if (!roles.has(role)) continue;
        const fallback = norm(m[2]);
        if (fallback === СОВПАДЕНИЕ) continue;
        // Запасное, равное значению САМОЙ роли в любом наборе, — правда: так
        // пишут в тёмных блоках, где рядом уместно тёмное значение той же роли.
        if (PALETTES.some((id) => blocks.get(id).get(role) === fallback)) continue;
        // Ступень чьей лестницы названа и что на этой ступени стоит на самом деле.
        const id = PALETTES.find((p) => ЛЕСТНИЦА[p].includes(fallback) && blocks.get(p).get(role));
        if (!id) continue;
        const owners = [...blocks.get(id)]
          .filter(([k, v]) => roles.has(k) && v === fallback)
          .map(([k]) => k);
        const selector = (decl.parent.selector || '').replace(/\s+/g, ' ').trim();
        found.set(
          `${file} | ${selector} | ${decl.prop}`,
          `${role} в наборе ${id} даёт ${blocks.get(id).get(role)}, запасное обещает ${fallback} — это ${owners.join(', ')}`,
        );
      }
    });
  }
  return found;
}

describe('запасное значение рядом с ролью не называет соседнюю поверхность', () => {
  const blocks = paletteBlocks();
  const roles = surfaceRoles(blocks);

  it('палитра прочитана: четыре набора и лестница в каждом', () => {
    for (const id of PALETTES) {
      const values = new Set(blocks.get(id).values());
      for (const step of ЛЕСТНИЦА[id]) expect(values.has(step), `${id}: ${step}`).toBe(true);
    }
    expect(roles.size).toBeGreaterThan(5);
  });

  // Списка исключений у этой проверки нет и заводить его не нужно: поверхность
  // видна на экране сразу, а починка — одна строка. Класс закрыт 30–31 августа,
  // гейт входит зелёным.
  it('ни одного места, где роль и запасное — разные ступени лестницы', () => {
    const found = scan(blocks, roles);
    const list = [...found].map(([key, why]) => `${key}\n      ${why}`);
    expect(list, `запасное обещает не ту поверхность:\n${list.join('\n')}`).toEqual([]);
  });
});
