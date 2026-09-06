// Контраст вспомогательного текста: старая система чернил против лестницы.
// Считается точно по WCAG 2.1: composite полупрозрачных чернил на фоне набора,
// затем отношение относительных яркостей. Браузер не нужен — арифметика та же.
import fs from 'node:fs';

const CSS = fs.readFileSync(
  'C:/Users/User/HEYS-v2/apps/web/styles/modules/002-ui-v4-palette-roles.css',
  'utf8',
);

const SETS = [
  ['песочный', '[data-theme="sand"][data-palette="sand"]'],
  ['песочный тёмный', '[data-theme-id="sand-dark"]'],
  ['синий', '[data-theme-id="blue"]'],
  ['синий тёмный', '[data-theme-id="blue-dark"]'],
];

function block(i) {
  const start = CSS.indexOf(SETS[i][1]);
  const end = i + 1 < SETS.length ? CSS.indexOf(SETS[i + 1][1], start) : CSS.length;
  return CSS.slice(start, end);
}

function decl(blk, name) {
  const m = blk.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

const hexToRgb = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

const srgb = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => {
  const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
  return (hi + 0.05) / (lo + 0.05);
};
// Полупрозрачные чернила поверх фона — то, что реально видит человек.
const over = (ink, alpha, bg) => ink.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));

const SURFACES = ['--v4-bg', '--v4-c1', '--v4-hero'];
console.log('набор            поверхность  значение   56 % data   лестница   порог 4,5');
for (let i = 0; i < SETS.length; i += 1) {
  const blk = block(i);
  const inkRgbRaw = decl(blk, '--v4-ink-rgb');
  const ink2Raw = decl(blk, '--v4-ink-2');
  if (!inkRgbRaw || !ink2Raw) continue;
  const inkRgb = inkRgbRaw.split(',').map((n) => Number(n.trim()));
  const ink2Alpha = Number(ink2Raw.match(/,\s*([\d.]+)\s*\)/)[1]);
  for (const surf of SURFACES) {
    const raw = decl(blk, surf);
    if (!raw || !raw.startsWith('#')) continue;
    const bg = hexToRgb(raw);
    const oldR = ratio(over(inkRgb, 0.56, bg), bg);
    const newR = ratio(over(inkRgb, ink2Alpha, bg), bg);
    const mark = (r) => (r >= 4.5 ? 'ок   ' : 'НИЖЕ ');
    console.log(
      `${SETS[i][0].padEnd(16)} ${surf.padEnd(12)} ${raw.padEnd(10)} ` +
        `${oldR.toFixed(2)} ${mark(oldR)} ${newR.toFixed(2)} ${mark(newR)}`,
    );
  }
}
