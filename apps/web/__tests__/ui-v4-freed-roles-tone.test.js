/**
 * Смоук: места, освобождённые снятием гейта classic-drift, дают в четырёх
 * наборах разный тон — там, где он обязан быть разным.
 *
 * Почему не проверкой по тексту файла. Литерал вместо роли ловится грепом, а
 * вот «роль подставлена, но выше по каскаду её перебивает темозависимое
 * правило» — нет. Ровно так жил круг иконки в шапке листа куратора: базовое
 * правило держало песочный литерал, а три `html[data-theme-id=…]` правила
 * перекрашивали его во вторую поверхность --c2 вместо контрактного --tint.
 * Поэтому сюда кладётся настоящий CSS продукта, на корне выставляются
 * атрибуты набора и читается вычисленный стиль — jsdom подставляет var().
 *
 * Ожидаемые значения — из блока [data-contract] и v4-canvas.css пакета
 * дизайна (роли --tx, --gr, --tint, --ac, --c1, --gr2).
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');

const CSS_FILES = [
  'styles/modules/002-ui-v4-palette-roles.css',
  'styles/modules/000-base-and-gamification.css',
  'styles/modules/500-pwa-and-offline.css',
  'styles/modules/733-ui-v4-login-theme.css',
];

const SETS = ['sand', 'sand-dark', 'blue', 'blue-dark'];
const PALETTE_OF = { sand: 'sand', 'sand-dark': 'sand', blue: 'blue', 'blue-dark': 'blue' };

// Роли канваса по наборам — из v4-canvas.css (:root / .pal.dk / .pal.bl / .pal.bldk).
const TX = { sand: '#201e1d', 'sand-dark': '#f2ede6', blue: '#101826', 'blue-dark': '#eef3f8' };
const GR = { sand: '#5c6a45', 'sand-dark': '#9fb981', blue: '#1f6e4d', 'blue-dark': '#7fd1a0' };
const TINT = { sand: '#f6e6dd', 'sand-dark': '#3a241a', blue: '#fbe6e2', 'blue-dark': '#33242a' };
const AC = { sand: '#8a4a20', 'sand-dark': '#e2a468', blue: '#1d5e96', 'blue-dark': '#7fbceb' };
const C1 = { sand: '#f7efe2', 'sand-dark': '#23201b', blue: '#eef3f9', 'blue-dark': '#182a3a' };
// Тона, которыми круг иконки красили темозависимые правила до сведения:
// вторая поверхность --c2 (в песочно-тёмной — даже не она, а свой #2c231c).
const ICON_WAS = {
  sand: '#f6e6dd',
  'sand-dark': '#2c231c',
  blue: '#e2ecf6',
  'blue-dark': '#1e3448',
};
// Точка факта в календаре. Двенадцатая сборка контракта date-remainders
// назвала её тон прямо: строка «вид клетки» — «Точка факта 4 px под числом
// через 3, тон --gr2». Прежде тон брали с кадров «Календарь · легенда», где
// нарисована роль --val-good (#7a8a5e / #8faa6d / #3e9a6b / #4caf7d);
// совпадает она только в песочной. Контракт старше кадра — здесь --gr2.
const GR2 = {
  sand: '#7a8a5e',
  'sand-dark': '#8a9a6a',
  blue: '#4f9a78',
  'blue-dark': '#6fbf9a',
};

/** `#RRGGBB` / `rgb(r, g, b)` → канонический `#rrggbb`. */
function norm(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  const rgb = raw.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((n) => Number(n).toString(16).padStart(2, '0'))
      .join('')}`;
  }
  const short = raw.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return raw;
}

/**
 * Ставит набор на корень так же, как это делает продукт, и пересобирает
 * разметку.
 *
 * Пересборка — не косметика: движок селекторов jsdom (nwsapi) кеширует
 * результаты и после голого `setAttribute` на `<html>` продолжает отвечать
 * «не совпало» на правила вида `html[data-theme-id="blue"] .класс`. Подстановку
 * переменных это не задевает (они пересчитываются), а темозависимые
 * переопределения — задевает, и тест молча перестаёт их видеть. Проверено:
 * с внедрённым обратно переопределением круга иконки без пересборки все
 * утверждения проходили. Мутация DOM сбрасывает кеш.
 */
function applySet(id) {
  const root = document.documentElement;
  root.setAttribute('data-theme-id', id);
  root.setAttribute('data-theme', id);
  root.setAttribute('data-palette', PALETTE_OF[id]);
  document.body.innerHTML = MARKUP;
}

function tone(selector, prop) {
  const el = document.querySelector(selector);
  expect(el, `нет узла ${selector}`).toBeTruthy();
  return norm(getComputedStyle(el).getPropertyValue(prop));
}

const MARKUP = `
  <div class="heys-auth-shell">
    <div class="heys-auth-card">
      <div class="heys-auth-mark">
        <svg class="heys-auth-logo">
          <g><g>
            <path id="mark-letter"></path>
            <rect id="mark-bar"></rect>
          </g></g>
        </svg>
      </div>
    </div>
  </div>
  <div class="ca-modal">
    <div class="ca-modal__header">
      <div class="ca-modal__header-icon"><svg class="ca-modal__header-svg"></svg></div>
    </div>
  </div>
  <div class="mc-weight-week-delta mc-weight-week-delta--down"></div>
  <div class="mc-rest-cold-streak"></div>
  <div class="mc-rest-consent-card"></div>
  <div class="date-picker-sheet">
    <span class="day-data-dot"></span>
    <span class="legend-swatch legend-swatch--dot"></span>
  </div>
`;

describe('UI v4 — освобождённые роли дают тон набора', () => {
  beforeAll(() => {
    const style = document.createElement('style');
    style.textContent = CSS_FILES.map((rel) => fs.readFileSync(path.join(WEB, rel), 'utf8')).join(
      '\n',
    );
    document.head.appendChild(style);
  });

  // Файл переписывает `document.body` и атрибуты набора на `<html>` целиком, а
  // прогон идёт одним форком (vitest.config.ts, `singleFork`). Оставленная за
  // собой разметка травит движок селекторов следующего файла: соседний смоук
  // шторки календаря переставал находить составной `.date-picker-day.selected
  // .today` — при том, что по отдельности оба класса на клетке были. Отсюда
  // уборка: проверено парой `date-remainders-v4-smoke` + этот файл.
  afterAll(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it.each(SETS)('%s: знак входа берёт чернила набора (строка «знак»)', (id) => {
    applySet(id);
    expect(tone('#mark-letter', 'fill')).toBe(TX[id]);
    expect(tone('#mark-bar', 'fill')).toBe(TX[id]);
    expect(tone('.heys-auth-mark', 'color')).toBe(TX[id]);
  });

  it('знак в тёмных наборах не остаётся тёмным на тёмном', () => {
    applySet('sand');
    const light = tone('#mark-letter', 'fill');
    applySet('sand-dark');
    expect(tone('#mark-letter', 'fill')).not.toBe(light);
    applySet('blue-dark');
    expect(tone('#mark-letter', 'fill')).not.toBe(light);
  }, 30_000);

  it.each(SETS)(
    '%s: круг иконки в шапке листа куратора — --tint с иконкой --ac',
    (id) => {
      applySet(id);
      expect(tone('.ca-modal__header-icon', 'background-color')).toBe(TINT[id]);
      expect(tone('.ca-modal__header-icon', 'color')).toBe(AC[id]);
    },
    30_000,
  );

  it('круг иконки не перебит темозависимым правилом на --c2', () => {
    for (const id of SETS) {
      if (id === 'sand') continue; // светлый ряд и был контрактным тоном
      applySet(id);
      expect(tone('.ca-modal__header-icon', 'background-color')).not.toBe(ICON_WAS[id]);
    }
  }, 30_000);

  it.each(SETS)('%s: серия и недельная динамика чек-ина — тон --gr', (id) => {
    applySet(id);
    expect(tone('.mc-rest-cold-streak', 'color')).toBe(GR[id]);
    expect(tone('.mc-weight-week-delta', 'color')).toBe(GR[id]);
  });

  it.each(SETS)('%s: плашка согласия чек-ина — первая поверхность --c1', (id) => {
    applySet(id);
    expect(tone('.mc-rest-consent-card', 'background-color')).toBe(C1[id]);
  });

  it.each(SETS)('%s: точка факта в календаре — роль --gr2 набора', (id) => {
    applySet(id);
    expect(tone('.day-data-dot', 'background-color')).toBe(GR2[id]);
    expect(tone('.legend-swatch--dot', 'background-color')).toBe(GR2[id]);
  });

  // Анкета кандидата красится инлайновыми стилями из JS, поэтому её чернила
  // берутся прямо из константы модуля и проверяются тем же способом.
  it.each(SETS)('%s: чернила анкеты кандидата — роль набора', (id) => {
    const src = fs.readFileSync(path.join(WEB, 'heys_trial_intake_v1.js'), 'utf8');
    const ink = src.match(/const INK = '([^']+)'/);
    expect(ink, 'константа INK не найдена').toBeTruthy();
    applySet(id);
    const probe = document.createElement('div');
    probe.setAttribute('style', `color: ${ink[1]}`);
    document.body.appendChild(probe);
    expect(norm(getComputedStyle(probe).color)).toBe(TX[id]);
  });

  it('точка факта перестала быть песочной во всех наборах сразу', () => {
    const tones = new Set();
    for (const id of SETS) {
      applySet(id);
      tones.add(tone('.day-data-dot', 'background-color'));
    }
    expect(tones.size).toBe(4);
  }, 30_000);
});
