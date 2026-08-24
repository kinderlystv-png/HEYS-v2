// Разбор heys-boot-mark.css для проверок знака ожидания.
//
// Проверки движения знака должны читать сам блок @media, а не искать подстроку
// где-нибудь в файле: подстрочная проверка легко становится зелёной вхолостую
// (так и вышло с прежним not.toMatch на дыхание — порядок частей в выражении
// был обратен порядку в файле, и оно не находило даже удалённый код).
//
// Файл намеренно назван без .test. — vitest собирает только
// __tests__/**/*.{test,spec}.*, так что помощник не станет пустым набором.

/** Вырезает тело `@media (prefers-reduced-motion: reduce) { ... }` по балансу скобок. */
export function readReducedMotionBlock(css) {
  const at = css.indexOf('@media (prefers-reduced-motion: reduce)');
  if (at < 0) throw new Error('в heys-boot-mark.css нет блока prefers-reduced-motion: reduce');
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error('блок prefers-reduced-motion не закрыт');
}

/**
 * Находит правило, в селекторе которого встречается `needle`.
 * Возвращает { selector, body } с уже вычищенными комментариями.
 */
export function readRule(block, needle) {
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) {
    const selector = m[1].trim();
    if (selector.includes(needle)) return { selector, body: m[2].trim() };
  }
  throw new Error(`в блоке prefers-reduced-motion нет правила с селектором «${needle}»`);
}

/** Тело именованных кадров. */
export function readKeyframes(css, name) {
  const at = css.indexOf(`@keyframes ${name}`);
  if (at < 0) throw new Error(`нет кадров @keyframes ${name}`);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`кадры @keyframes ${name} не закрыты`);
}
