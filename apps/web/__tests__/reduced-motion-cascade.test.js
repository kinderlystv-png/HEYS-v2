// Смоук каскада при системной настройке «уменьшить движение».
//
// Вопрос здесь не «есть ли такая строка в файле», а «кто выигрывает». Флаг
// animate-always выводит из-под глобального гашения всё поддерево
// (`:not(.animate-always *)`), поэтому адресное правило по псевдоэлементу
// обязано пережить и базовое объявление ниже по файлу, и глобальный killer,
// который грузится последним (main.css: heys-components.css после modules/*).
// Проверка по строке исходника этого не показывает.
//
// Три поправки к jsdom. Каждая заменяет то, чего в нём нет, на равное по
// смыслу, и ни одна не подменяет предмет проверки — реальный текст CSS:
//
// 1. `@media (prefers-reduced-motion: reduce)` jsdom не сопоставляет, поэтому
//    блоки раскрываются на месте — ровно то, что делает браузер при включённой
//    настройке; порядок правил при этом сохраняется.
// 2. Вычисленный стиль псевдоэлемента jsdom не отдаёт, поэтому `::before`
//    заменяется на дочерний `> probe-before`. Специфичность совпадает
//    (псевдоэлемент и тип — оба 0,0,1), а дочерний комбинатор сохраняет смысл
//    «псевдоэлемент принадлежит своему элементу»: при потомке правило
//    глобального killer'а ошибочно доставало бы под флаг родителя.
// 3. Движок селекторов jsdom (nwsapi) неверно считает `:not(.animate-always *)`
//    — он даёт true для потомков элемента с флагом, то есть в jsdom killer
//    достаёт под флаг, чего в браузере не происходит. Проверено отдельно и это
//    ровно тот механизм, ради которого тест и написан. Поэтому потомки
//    помечаются классом `aa-desc` через `closest()` (он работает верно), а в
//    таблице `:not(.animate-always *)` заменяется на `:not(.aa-desc)` —
//    множество то же, специфичность та же (0,1,0).

import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');

// Порядок — как в документе: heys-boot-mark.css стоит в шапке (там живёт общий
// знак ожидания и его дыхание при «уменьшить движение»), затем модули main.css,
// затем heys-components.css с глобальным killer'ом.
const CSS_FILES = [
  'styles/heys-boot-mark.css',
  'styles/modules/300-modals-and-day.css',
  'styles/modules/400-water-and-hydration.css',
  'styles/modules/730-widgets-dashboard.css',
  'styles/heys-components.css',
];

const KILLED_DURATION = '0.01ms';

/** Раскрывает `@media (prefers-reduced-motion: reduce) { … }` на месте. */
function unwrapReducedMotion(css) {
  const marker = '@media (prefers-reduced-motion: reduce)';
  let out = '';
  let i = 0;
  for (;;) {
    const at = css.indexOf(marker, i);
    if (at === -1) return out + css.slice(i);
    out += css.slice(i, at);
    const open = css.indexOf('{', at + marker.length);
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') depth -= 1;
      j += 1;
    }
    out += css.slice(open + 1, j - 1);
    i = j;
  }
}

function forJsdom(css) {
  return unwrapReducedMotion(css)
    .replace(/::before/g, ' > probe-before')
    .replace(/::after/g, ' > probe-after')
    .replace(/:not\(\.animate-always \*\)/g, ':not(.aa-desc)');
}

const SHEET = CSS_FILES.map((rel) => forJsdom(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'))).join(
  '\n',
);

const computedMemo = new Map();

function mount(html) {
  computedMemo.clear();
  document.head.innerHTML = '';
  document.body.innerHTML = html;
  // Множество `.animate-always *` — строгие потомки элемента с флагом.
  document.body.querySelectorAll('*').forEach((el) => {
    if (el.parentElement && el.parentElement.closest('.animate-always')) el.classList.add('aa-desc');
  });
  const style = document.createElement('style');
  style.textContent = SHEET;
  document.head.appendChild(style);
}

// getComputedStyle тут перебирает несколько тысяч правил реальных файлов —
// в пределах одного фикстура результат по селектору не меняется.
function motion(selector) {
  if (computedMemo.has(selector)) return computedMemo.get(selector);
  const el = document.querySelector(selector);
  if (!el) throw new Error(`нет элемента ${selector}`);
  const cs = getComputedStyle(el);
  const read = {
    shorthand: (cs.animation || '').trim(),
    duration: cs.animationDuration,
    iteration: cs.animationIterationCount,
    transition: (cs.transition || '').trim(),
    transitionDuration: cs.transitionDuration,
  };
  computedMemo.set(selector, read);
  return read;
}

/** Достал ли до элемента глобальный killer (он бьёт по longhand'ам). */
function reachedByGlobalKiller(selector) {
  return motion(selector).duration === KILLED_DURATION;
}

describe('каскад при «уменьшить движение» — блики воды', () => {
  beforeAll(() => {
    mount(`
      <div class="widgets-grid">
        <div class="widget widget--1x1">
          <div class="widget-water widget-water--micro widget-v4-mini widget-water--v4">
            <span class="widget-water__fill animate-always"><probe-before></probe-before></span>
            <span class="widget-water__drop animate-always"></span>
            <span class="widget-water__ripple animate-always"></span>
          </div>
        </div>
      </div>
      <div class="water-column animate-always">
        <div class="water-column__bar">
          <span class="water-column__fill"><probe-before></probe-before></span>
        </div>
      </div>
    `);
  });

  it('глобальный killer до бликов не достаёт — их гасит только адресное правило', () => {
    // Если бы достал, задача решалась бы сама и правило было бы не нужно.
    expect(reachedByGlobalKiller('.widget-water__fill > probe-before')).toBe(false);
    expect(reachedByGlobalKiller('.water-column__fill > probe-before')).toBe(false);
  });

  it('блик в плитке останавливается, хотя родитель под флагом', () => {
    expect(motion('.widget-water__fill > probe-before').shorthand).toMatch(/^none\b/);
  });

  it('блик в мерном столбике останавливается, хотя флаг на корне столбика', () => {
    expect(motion('.water-column__fill > probe-before').shorthand).toMatch(/^none\b/);
  });

  it('капля и круг — решение владельца — продолжают проигрываться', () => {
    expect(motion('.widget-water__drop').shorthand).toContain('widgetWaterDrop');
    expect(motion('.widget-water__ripple').shorthand).toContain('widgetWaterRipple');
    expect(reachedByGlobalKiller('.widget-water__drop')).toBe(false);
    expect(reachedByGlobalKiller('.widget-water__ripple')).toBe(false);
  });

  it('подъём уровня остаётся: флаг с родителя не снят', () => {
    const fill = motion('.widget-water__fill');
    // Глобальный killer сюда не достаёт — иначе уровень встал бы вместе с
    // бликами, а это решение владельца, которое задача не трогает.
    expect(fill.transitionDuration).not.toBe(KILLED_DURATION);
    expect(fill.transition).toContain('160ms');
    const col = motion('.water-column__fill');
    expect(col.transitionDuration).toBe('160ms');
  });
});

describe('каскад при «уменьшить движение» — сетка Главной', () => {
  beforeAll(() => {
    mount(`
      <div class="widgets-grid">
        <div class="widget widget--streak"><span class="widget__flame"></span></div>
        <div class="widget widget--water"><span class="widget__wave"></span></div>
        <div class="widget">
          <div class="widget__loading">
            <span class="heys-wait-mark heys-wait-mark--button is-wait">
              <span class="heys-wait-mark__spin animate-always"><svg></svg></span>
            </span>
          </div>
        </div>
        <div class="widget"><span class="sparkline-svg animate-always"><span class="sparkline-path"></span></span></div>
      </div>
    `);
  });

  it('сетка больше не выведена из-под гашения', () => {
    expect(document.querySelector('.widgets-grid').classList.contains('animate-always')).toBe(false);
    // Пульсы в плитках доходят до глобального killer'а — раньше флаг на корне
    // сетки укрывал всё поддерево целиком.
    expect(reachedByGlobalKiller('.widget__flame')).toBe(true);
  });

  it('правило гашения сетки ожило: пульсы плиток остановлены', () => {
    expect(motion('.widget--streak .widget__flame').shorthand).toMatch(/^none\b/);
    expect(motion('.widget--water .widget__wave').shorthand).toMatch(/^none\b/);
  });

  it('знак ожидания не замирает — это обратная связь, не украшение', () => {
    // Своё кольцо widget-spin снято, в плитке стоит общий знак (контракт
    // «Спиннеры» → «форма»). Свойство то же: остановленный знак читается как
    // «зависло», поэтому при настройке он не гаснет, а дышит прозрачностью —
    // правило heys-boot-mark.css по флагу animate-always на самой дуге.
    const spin = motion('.heys-wait-mark__spin');
    // jsdom не раскладывает шорткат `animation` на longhand'ы, поэтому
    // бесконечность читаем из самого шортката, а не из animation-iteration.
    expect(spin.shorthand).toContain('heys-boot-breathe');
    expect(spin.shorthand).toContain('infinite');
    expect(reachedByGlobalKiller('.heys-wait-mark__spin')).toBe(false);
  });

  it('плитка больше не рисует своё кольцо', () => {
    const css = fs.readFileSync(
      path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8',
    );
    expect(css).not.toMatch(/\.widget__spinner\s*\{/);
    expect(css).not.toMatch(/@keyframes widget-spin/);
  });

  it('спарклайны держат свой флаг и отрисовку не теряют', () => {
    // Ради них флаг на сетке и заводили в 2025-м; с тех пор у них свой
    // animate-always на .sparkline-svg (heys_day_sparklines_v1.js).
    expect(reachedByGlobalKiller('.sparkline-path')).toBe(false);
  });
});
