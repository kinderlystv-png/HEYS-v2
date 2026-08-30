// Геометрия панели куратора против кадров data-demo="stop" канваса
// curator-cabinet.v4.dc.html на 375 px.
//
// Метод выбран по канвасу: геометрия панели живёт в классах его собственного
// <style> (.cd, .cl, .av, .cln, .cls, .badge, .tier), поэтому сверка идёт
// парами «класс кадра → правило продуктового CSS». Кадры четырёх СТАРЫХ
// вкладок кабинета (шапка, карточка клиента, очередь, диагностика, служебные
// листы) сюда не входят: они не сведены, а гейт на несведённом экране
// выключают в первый же день.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/curator-cabinet.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/734-ui-v4-curator-panel.css');

function parseRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map();
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = match[2].trim();
    for (const selector of match[1].split(',')) {
      const key = selector.trim();
      if (!rules.has(key)) rules.set(key, []);
      rules.get(key).push(body);
    }
  }
  return rules;
}

// Канвас пишет шрифт шорткатом `font: 600 11px/1.35 Figtree`, продуктовый CSS —
// раскладкой. Приводим обе формы к одному виду.
function declarations(bodies) {
  const out = {};
  for (const body of bodies || []) {
    for (const decl of body.split(';')) {
      const at = decl.indexOf(':');
      if (at < 0) continue;
      const prop = decl.slice(0, at).trim();
      const value = decl.slice(at + 1).trim();
      if (prop === 'font') {
        const font = /^(\d+)\s+([\d.]+)px\/([\d.]+)/.exec(value);
        if (font) {
          out['font-weight'] = font[1];
          out['font-size'] = `${font[2]}px`;
          out['line-height'] = font[3];
          continue;
        }
      }
      if (prop === 'margin') {
        const parts = value.split(/\s+/);
        if (parts.length === 3) {
          out['margin-top'] = parts[0];
          out['margin-bottom'] = parts[2];
          continue;
        }
      }
      out[prop] = value;
    }
  }
  return out;
}

// Роли канваса → роли продуктовой палитры. Тот же словарь, что у сведённых
// зон: имена канваса продуктовыми ролями не являются.
const ROLE = new Map(Object.entries({
  '--c1': '--v4-surface',
  '--c2': '--v4-hero',
  '--bg': '--v4-bg',
  '--tx': '--v4-ink',
  '--ac': '--v4-act-text',
  '--ac2': '--v4-warn-text',
  '--acs': '--v4-act',
  '--on-acs': '--v4-btn-on-act',
  '--gr': '--v4-ok-text',
  '--gr-bg': '--v4-ok-bg',
  '--red': '--v4-bad-text',
}));

// Прозрачные чернила канваса значат разное в разных местах: у линии это роль
// линии, у текста — ступень тона. Один общий словарь свёл бы подпись 60 % к
// цвету рамки, поэтому нормализация знает, какое свойство сверяет.
function inkRole(alpha, prop) {
  if (prop.startsWith('border')) {
    if (alpha === 0.12) return '--v4-track';
    if (alpha === 0.18) return '--v4-edge';
    return '--v4-line';
  }
  if (alpha >= 0.55) return '--v4-ink-2';
  if (alpha >= 0.38) return '--v4-ink-3';
  return '--v4-line';
}

function normalize(value, prop = '') {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    // запасное значение роли — запись для гейта перекраски, не второе значение
    .replace(/var\((--[a-z0-9-]+)\s*,(?:[^()]|\([^()]*\))*\)/gi, 'var($1)')
    .replace(
      /rgba\(var\(--ink\)\s*,\s*(\.?\d*\.?\d+)\)/gi,
      (whole, a) => `var(${inkRole(parseFloat(a[0] === '.' ? `0${a}` : a), prop)})`,
    )
    // color-mix продукта — та же ступень тона, записанная процентом
    .replace(
      /color-mix\(in srgb, var\(--v4-ink\) (\d+)%, transparent\)/gi,
      (whole, pct) => `var(${inkRole(Number(pct) / 100, prop)})`,
    )
    .replace(/var\((--[a-zA-Z0-9-]+)\)/g, (whole, name) => `var(${ROLE.get(name) || name})`)
    // `flex: none` и `flex: 0 0 auto` — одно и то же, записанное по-разному
    .replace(/^none$/, '0 0 auto')
    // .04em и 0.04em — одно число
    .replace(/(^|[\s(,])\.(\d)/g, '$10.$2')
    .replace(/(^|[\s(,])-\.(\d)/g, '$1-0.$2')
    .toLowerCase();
}

const PAIRS = [
  // Полотно вкладки и карточка группы.
  ['.sc', '.cur-panel'],
  ['.tier', '.cur-group__title'],
  ['.cd', '.cur-group__card'],
  ['.grp', '.cur-panel__empty'],
  ['.h1', '.cur-panel__empty-title'],
  ['.p', '.cur-panel__empty-note'],
  // Строка клиента.
  ['.cl', '.cur-row'],
  ['.av', '.cur-row__avatar'],
  ['.cln', '.cur-row__name'],
  ['.cls', '.cur-row__state'],
  ['.dot', '.cur-row__dot'],
  // Пилюля давности и чип фильтра — одна и та же пилюля кадра.
  ['.badge', '.cur-row__age'],
  ['.badge', '.cur-chip'],
];

const CHECKED = [
  'padding', 'margin-top', 'margin-bottom', 'margin-right', 'border-radius',
  'gap', 'height', 'width', 'font-size', 'font-weight', 'line-height',
  'letter-spacing', 'text-transform', 'background', 'color', 'align-items',
  'justify-content', 'flex', 'border-bottom', 'vertical-align',
];

// Осознанные отступления — поимённо, иначе список молча растёт.
const EXCEPTIONS = new Set([
  // Чип фильтра — кнопка: у кадра это span, и заливка выбранного состояния
  // стоит инлайном. Базовый фон и оба состояния проверяет тест вида.
  '.cur-chip|background',
  // `.sc { flex: none }` — свойство раскладки самого канваса: кадр там флекс-
  // ребёнок макета телефона. Содержимое вкладки в продукте ничьим флекс-
  // ребёнком не является, и повторять это значило бы копировать чужую сетку.
  '.cur-panel|flex',
]);

describe('геометрия панели куратора против кадров канваса', () => {
  const canvasSource = fs.readFileSync(CANVAS, 'utf8');
  const helmet = canvasSource.slice(
    canvasSource.indexOf('<style>') + '<style>'.length,
    canvasSource.indexOf('</style>'),
  );
  const canvas = parseRules(helmet);
  const product = parseRules(fs.readFileSync(CSS, 'utf8'));

  it('каждый блок кадра имеет пару в продуктовом CSS', () => {
    const orphans = PAIRS.filter(([c, m]) => !canvas.has(c) || !product.has(m));
    expect(orphans).toEqual([]);
  });

  it('числа совпадают с кадрами', () => {
    const drift = [];
    for (const [canvasSel, productSel] of PAIRS) {
      const want = declarations(canvas.get(canvasSel));
      // Значение может стоять на самом узле или на его базовом классе —
      // собираем цепочку так же, как её видит браузер: от общего к частному.
      const base = productSel.split(/\s+/).pop().replace(/\[[^\]]*\]/g, '');
      const parent = base.replace(/(__[a-z-]+|\.is-[a-z-]+|--[a-z-]+)$/, '');
      const chain = [];
      for (const sel of [parent, base, productSel]) {
        if (sel && product.has(sel) && !chain.includes(sel)) chain.push(sel);
      }
      const got = declarations(chain.flatMap((sel) => product.get(sel) || []));

      for (const prop of CHECKED) {
        if (!(prop in want)) continue;
        if (EXCEPTIONS.has(`${productSel}|${prop}`)) continue;
        const expected = normalize(want[prop], prop);
        const actual = prop in got ? normalize(got[prop], prop) : '— нет —';
        if (expected !== actual) {
          drift.push(`${productSel} { ${prop} } — кадр: ${expected}, код: ${actual}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(2);
  });

  it('гейт закрывает панель, а не весь кабинет', () => {
    // Кадры старых вкладок в парах не участвуют: они ещё не сведены, и красный
    // тест, который никто не может починить, отключают в первый же день.
    const cabinetOnly = ['.mch', '.tabs', '.tab'];
    for (const sel of cabinetOnly) {
      expect(PAIRS.some(([c]) => c === sel), sel).toBe(false);
    }
  });
});
