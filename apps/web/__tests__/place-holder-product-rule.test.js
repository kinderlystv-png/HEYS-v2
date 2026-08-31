// Смоук строки «держатель места · правило продукта» (home-widgets.v4.dc.html):
// «пока данных нет, тяжёлый элемент занимает свою высоту заливкой поверхности
// --c1 <…> ни пульсации, ни скелетон-полос, ни спиннера внутри. Появление
// данных — проявление за 200 мс».
//
// Руками это не поймать: держатель живёт доли секунды на медленной сети, а
// мерцание возвращается тихо — достаточно кому-то добавить skeleton-класс со
// старым градиентом. Тест читает настоящий CSS через postcss, поэтому ловит и
// новые нарушения, а не только известные.
import fs from 'node:fs';
import path from 'node:path';

import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const STYLES = path.join(WEB_DIR, 'styles');

// Файлы, где держатели живут на самом деле. Обход всего дерева стилей здесь
// был бы храповиком пошире, но он гоняется в одном наборе с тестами, которые
// временно правят CSS и возвращают его обратно, — и тогда прогон видит файл на
// середине правки. Узкий список даёт ту же защиту без гонки.
const PLACEHOLDER_CSS = [
  'heys-components.css',
  'modules/000-base-and-gamification.css',
  'modules/002-ui-v4-palette-roles.css',
  'modules/730-widgets-dashboard.css',
  'modules/732-ui-v4-nutrition.css',
];

function cssFiles() {
  return PLACEHOLDER_CSS.map((rel) => path.join(STYLES, rel)).filter((f) => fs.existsSync(f));
}

/** Селекторы держателей, которые продукт действительно рисует. */
function liveAnimatedPlaceholders() {
  const hits = [];
  for (const file of cssFiles()) {
    let root;
    try {
      root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
    } catch {
      continue;
    }
    root.walkRules((rule) => {
      if (!/place-holder|placeholder|skeleton/i.test(rule.selector)) return;
      const animated = rule.nodes.filter(
        (n) => n.type === 'decl' && /^animation/.test(n.prop) && !/\bnone\b/.test(n.value),
      );
      if (animated.length) {
        hits.push({
          file: path.relative(WEB_DIR, file).split(path.sep).join('/'),
          selector: rule.selector.replace(/\s+/g, ' '),
        });
      }
    });
  }
  return hits;
}

/** Класс живой, если его ставит продуктовый код, а не только CSS. */
function isLiveInProduct(selector) {
  const cls = [...selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
  const files = fs
    .readdirSync(WEB_DIR)
    .filter((f) => f.endsWith('.js') && !f.includes('bundle'))
    .map((f) => path.join(WEB_DIR, f));
  for (const sub of ['day', 'insights', 'fingers']) {
    const dir = path.join(WEB_DIR, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.js')) files.push(path.join(dir, f));
    }
  }
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    if (cls.some((c) => src.includes(c))) return true;
  }
  return false;
}

describe('держатель места · правило продукта', () => {
  it('механизм заведён: ровная заливка --c1, без движения и тени', () => {
    const roles = fs.readFileSync(
      path.join(STYLES, 'modules/002-ui-v4-palette-roles.css'),
      'utf8',
    );
    expect(roles).toMatch(/\.v4-place-holder \{[\s\S]*?background: var\(--v4-c1/);
    expect(roles).toMatch(/\.v4-place-holder \{[\s\S]*?animation: none;/);
    expect(roles).toMatch(/\.v4-place-holder \{[\s\S]*?box-shadow: none;/);
  });

  it('проявление данных — 200 мс, как называет строка', () => {
    const roles = fs.readFileSync(
      path.join(STYLES, 'modules/002-ui-v4-palette-roles.css'),
      'utf8',
    );
    expect(roles).toMatch(/\.v4-place-reveal \{\s*animation: v4-place-reveal-in 200ms/);
  });

  it('роль --v4-c1 объявлена во всех четырёх наборах палитры', () => {
    const roles = fs.readFileSync(
      path.join(STYLES, 'modules/002-ui-v4-palette-roles.css'),
      'utf8',
    );
    expect((roles.match(/^\s*--v4-c1:/gm) || []).length).toBe(4);
  });

  it('миниатюра фото приёма — заливка, а не бегущий градиент', () => {
    const base = fs.readFileSync(
      path.join(STYLES, 'modules/000-base-and-gamification.css'),
      'utf8',
    );
    expect(base).toMatch(/\.meal-photo-thumb\.skeleton \{[\s\S]{0,120}?animation: none;/);
    expect(base).not.toContain('animation: shimmer 1.5s infinite;\n    }\n\n    .meal-photo-thumb');
    const dark = base.slice(base.indexOf('[data-theme$="dark"] .meal-photo-thumb.skeleton'));
    expect(dark.slice(0, 160)).toContain('var(--v4-c1');
    expect(dark.slice(0, 160)).not.toContain('linear-gradient');
  });

  it('ни один живой держатель не пульсирует', () => {
    // Мёртвых скелетонов в дереве много — сорок пять на 26.08. Строку нарушает
    // только то, что продукт реально рисует, поэтому список фильтруется по
    // применению класса в коде, а не по наличию правила в CSS.
    // Разрешение на insights-skeleton снято 31 августа: контракт у зоны
    // появился, и оказалось, что скелетон там не рисовался вовсе — компонент
    // SkeletonCard был объявлен, экспортирован и ни разу не вызван, а
    // 110 строк CSS держали его вид. Снят вместе со стилями; список
    // исключений снова пуст, как ему и положено.
    const unexpected = liveAnimatedPlaceholders().filter((h) => isLiveInProduct(h.selector));
    expect(
      unexpected.map((h) => h.file + '  ' + h.selector),
      'живые держатели с анимацией — строка запрещает пульсацию',
    ).toEqual([]);
  });
});
