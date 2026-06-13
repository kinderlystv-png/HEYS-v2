#!/usr/bin/env node
/**
 * ⚡ PERF D2 (2026-06-13, PASS4 S3): оборачивает :hover-правила в
 * @media (hover: hover). На тач-устройствах (Android) тап триггерит sticky-hover
 * (артефакт десктопных стилей): style recalc на ~1.7 МБ CSS на каждый тап +
 * «залипшая» подсветка. Гард убирает hover-правила из матчинга на тачах;
 * desktop/iPhone-с-мышью не меняются.
 *
 * Безопасность преобразования:
 *  - селекторы с :hover внутри :not(...) НЕ трогаем (инверсия семантики);
 *  - группы селекторов разделяются: hover-части уходят под гард, остальные
 *    остаются на месте (каскадный порядок сохраняется вставкой сразу после);
 *  - правила уже внутри @media (hover: hover/none) и @keyframes пропускаются.
 *
 * Запуск: node scripts/perf-wrap-hover-guard.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const stylesDir = path.join(root, 'apps/web/styles');
const dry = process.argv.includes('--dry');

const files = [];
const collect = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p);
    else if (e.name.endsWith('.css') && !e.name.includes('.pre-split')) files.push(p);
  }
};
collect(stylesDir);

const hasUnsafeNotHover = (sel) => /:not\([^)]*:hover/.test(sel);
const isHoverSel = (sel) => sel.includes(':hover') && !hasUnsafeNotHover(sel);

let totalWrapped = 0;
let totalSkippedNot = 0;

for (const file of files) {
  const css = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = postcss.parse(css, { from: file });
  } catch (e) {
    console.error(`SKIP (parse error): ${file}: ${e.message}`);
    continue;
  }

  const targets = [];
  ast.walkRules((rule) => {
    if (!rule.selector || !rule.selector.includes(':hover')) return;
    // Пропустить, если уже внутри hover-media или keyframes
    for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
      if (p.type === 'atrule') {
        const n = (p.name || '').toLowerCase();
        if (n.endsWith('keyframes')) return;
        if (n === 'media' && /hover\s*:\s*(hover|none)/i.test(p.params)) return;
      }
    }
    targets.push(rule);
  });

  let wrapped = 0;
  for (const rule of targets) {
    const sels = rule.selectors;
    const hov = sels.filter(isHoverSel);
    const rest = sels.filter((s) => !isHoverSel(s));
    if (!hov.length) {
      totalSkippedNot += sels.filter(hasUnsafeNotHover).length;
      continue;
    }
    const media = postcss.atRule({
      name: 'media',
      params: '(hover: hover)',
      raws: { before: '\n\n', after: '\n', afterName: ' ' },
    });
    const clone = rule.clone();
    clone.selectors = hov;
    clone.raws.before = '\n  ';
    media.append(clone);
    rule.parent.insertAfter(rule, media);
    if (rest.length) rule.selectors = rest;
    else rule.remove();
    wrapped++;
  }

  if (wrapped > 0) {
    const out = ast.toResult().css;
    postcss.parse(out, { from: file }); // валидация результата
    if (!dry) fs.writeFileSync(file, out);
    console.log(`${path.relative(root, file)}: wrapped ${wrapped}`);
    totalWrapped += wrapped;
  }
}

console.log(`\nTOTAL wrapped: ${totalWrapped}, skipped :not(:hover): ${totalSkippedNot}${dry ? ' (dry-run)' : ''}`);
