/**
 * Плитка «Шаги · Как сейчас» против своего кадра.
 *
 * Кадр нарисован 15 сентября строкой контракта «вид · плитка шагов»: 1×1,
 * кикер «Шаги», число 21/600 табличными чернилами БЕЗ единицы — шаги считаются
 * штуками и подписи не требуют, — полоса доли 4 px на чернилах 8 % с заливкой
 * --acs. Тонов состояний у шагов нет: цель по шагам не бывает «перебрана» во
 * вред, полоса просто доходит до края и останавливается.
 *
 * Геометрия кадра размечена ИНЛАЙНОМ, поэтому общий гейт пар «класс кадра →
 * класс продукта» её не видит — этот тест читает сам кадр по метке экрана.
 *
 * ОТСТУПЛЕНИЕ, названное вслух: строка «шаги» (22 августа) говорит «два вида,
 * оба — тренды. Вида „сейчас“ не существует». Две строки пакета спорят между
 * собой; код идёт за новой и более частной, а спор уехал дизайнеру записью в
 * UI_V4_FINDINGS.md. Дефолт при этом не трогаем: он остаётся «Неделя», как
 * говорит старая строка.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const CANVAS = path.resolve(
  WEB,
  '../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const CSS = fs.readFileSync(path.join(WEB, 'styles/modules/730-widgets-dashboard.css'), 'utf8');
const PALETTE = fs.readFileSync(path.join(WEB, 'styles/modules/002-ui-v4-palette-roles.css'), 'utf8');
const UI = fs.readFileSync(path.join(WEB, 'heys_widgets_ui_v1.js'), 'utf8');
const VARIANTS = fs.readFileSync(path.join(WEB, 'heys_widgets_variants_v4.js'), 'utf8');
const canvasSource = fs.readFileSync(CANVAS, 'utf8');

/** Кадр целиком по метке экрана — от своего <div class="w" до его закрытия. */
function frame(label) {
  const at = canvasSource.indexOf(`data-screen-label="${label}"`);
  if (at < 0) throw new Error(`нет кадра «${label}»`);
  const start = canvasSource.lastIndexOf('<div', at);
  let depth = 0;
  for (let i = start; i < canvasSource.length; i += 1) {
    if (canvasSource.startsWith('<div', i)) depth += 1;
    else if (canvasSource.startsWith('</div>', i)) {
      depth -= 1;
      if (depth === 0) return canvasSource.slice(start, i + '</div>'.length);
    }
  }
  throw new Error(`кадр «${label}» не закрыт`);
}

/** Инлайновые стили кадра по порядку: [{ tag, cls, style }]. */
function inlineNodes(html) {
  const out = [];
  for (const m of html.matchAll(/<(\w+)([^>]*)>/g)) {
    const attrs = m[2];
    const style = /style="([^"]*)"/.exec(attrs);
    if (!style) continue;
    const cls = /class="([^"]*)"/.exec(attrs);
    out.push({ tag: m[1], cls: cls ? cls[1] : '', style: style[1] });
  }
  return out;
}

function decls(text) {
  const out = {};
  for (const part of String(text).split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const prop = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (prop === 'font') {
      const font = /^(\d+)\s+([\d.]+)px\/([\d.]+)/.exec(value);
      if (font) {
        out['font-weight'] = font[1];
        out['font-size'] = `${font[2]}px`;
        out['line-height'] = font[3];
        continue;
      }
    }
    out[prop] = value;
  }
  return out;
}

/** Правила продукта по селекторам, слитые в порядке файла — как каскад. */
function productDecls(...selectors) {
  const clean = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const merged = {};
  let seen = false;
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const heads = m[1].split(',').map((s) => s.trim());
    if (!heads.some((h) => selectors.includes(h))) continue;
    seen = true;
    Object.assign(merged, decls(m[2]));
  }
  if (!seen) throw new Error(`нет правил ${selectors.join(', ')}`);
  return merged;
}

// Песочный набор: роль → значение. Сверяется по файлу палитр, чтобы гейт не
// сравнивал цвет с выдуманным числом, если роль переедет.
const ROLE = {
  '--v4-ink': '#201e1d',
  '--v4-ink-3': 'rgba(0, 0, 0, 0.45)',
  '--v4-line': 'rgba(0, 0, 0, 0.08)',
  '--v4-act': '#c67139',
};

function normalize(value) {
  let out = String(value).trim().replace(/\s+/g, ' ');
  out = out.replace(/var\((--v4-[a-z0-9-]+)\)/gi, (whole, role) => ROLE[role] || whole);
  out = out.replace(/var\(--[a-z0-9-]+\s*,\s*([^)]+)\)/gi, '$1');
  return out
    .replace(/rgba\(var\(--ink\),\s*([\d.]+)\)/g, (_, a) => `rgba(0, 0, 0, ${a.startsWith('.') ? `0${a}` : a})`)
    .replace(/var\(--tx\)/g, ROLE['--v4-ink'])
    .replace(/var\(--acs\)/g, ROLE['--v4-act'])
    .replace(/(^|[\s(,])\.(\d)/g, '$10.$2')
    .replace(/(^|[\s(,])-\.(\d)/g, '$1-0.$2')
    .replace(/\s*,\s*/g, ', ')
    .toLowerCase();
}

/** Тело ветки «Как сейчас» в продукте — по нему сверяем, чего в ней нет. */
function nowBranch() {
  const from = UI.indexOf("if (variantId === 'now') {");
  const to = UI.indexOf("if (variantId === 'month') {", from);
  if (from < 0 || to < 0) throw new Error('не нашлась ветка «Как сейчас»');
  return UI.slice(from, to);
}

describe('плитка «Шаги · Как сейчас» против кадра', () => {
  const html = frame('Шаги · Как сейчас');
  const nodes = inlineNodes(html);
  // Кадр: [0] сама плитка, [1] ряд числа, [2] число, [3] дорожка, [4] заливка.
  const [tileNode, heroNode, valueNode, trackNode, fillNode] = nodes;

  it('кадр называет свою строку вида — иначе сверять нечего', () => {
    expect(html).toContain('data-vid="вид · плитка шагов"');
    expect(html).toContain('data-demo="stop"');
    expect(tileNode.cls).toBe('w');
    expect(decls(tileNode.style)['grid-column']).toBe('span 1');
    expect(decls(tileNode.style)['grid-row']).toBe('span 1');
    expect(nodes).toHaveLength(5);
  });

  it('роли песочного набора держат значения, с которыми сверяет гейт', () => {
    for (const [role, value] of Object.entries(ROLE)) {
      expect(PALETTE).toContain(`${role}: ${value};`);
    }
  });

  it('вид зарегистрирован как 1×1 и дефолтом не становится', () => {
    const block = VARIANTS.slice(VARIANTS.indexOf('    steps: ['), VARIANTS.indexOf('    weight: ['));
    expect(block).toContain("{ id: 'now', title: 'Как сейчас'");
    expect(/\{ id: 'now'[^}]*size: '1x1' \}/.test(block)).toBe(true);
    expect(/\{ id: 'now'[^}]*isDefault/.test(block)).toBe(false);
    // Строка «шаги»: дефолт — «Неделя» 2×1.
    expect(/\{ id: 'week'[^}]*isDefault: true \}/.test(block)).toBe(true);
  });

  it('кикер плитки — «Шаги» ключом, а не заголовком', () => {
    expect(html).toContain('<div class="k">Шаги</div>');
    expect(nowBranch()).toContain("v4Kicker('Шаги')");
    expect(nowBranch()).toContain('widget-v4-steps--now');
  });

  it('ряд числа: baseline, зазор 3, отступ сверху auto', () => {
    const want = decls(heroNode.style);
    const got = productDecls('.widget-v4-goal-hero', '.widget-v4-mini.widget-v4-steps .widget-v4-goal-hero');
    for (const prop of ['display', 'align-items', 'gap', 'margin-top']) {
      expect(`${prop}: ${normalize(got[prop])}`).toBe(`${prop}: ${normalize(want[prop])}`);
    }
  });

  it('число: 21/600, трекинг −.02, чернила, табличные цифры', () => {
    const want = decls(valueNode.style);
    const got = productDecls(
      '.widget-v4-goal-value',
      '.widget-v4-mini.widget-v4-steps .widget-v4-goal-value',
      '.widget-v4-val--neutral',
    );
    for (const prop of ['font-size', 'font-weight', 'line-height', 'letter-spacing', 'color']) {
      expect(`${prop}: ${normalize(got[prop])}`).toBe(`${prop}: ${normalize(want[prop])}`);
    }
    // «Табличными» сказано прозой строки, в разметке кадра этого нет.
    expect(normalize(got['font-variant-numeric'])).toBe('tabular-nums');
  });

  it('единицы у числа нет — шаги считаются штуками', () => {
    expect(html).not.toContain('class="u"');
    expect(nowBranch()).not.toContain('widget-v4-unit');
  });

  it('дорожка полосы: 4 px, радиус 999, чернила 8 %, отступ 7', () => {
    const want = decls(trackNode.style);
    const got = productDecls('.widget-v4-goalbar', '.widget-v4-goalbar--steps');
    for (const prop of ['height', 'border-radius', 'background', 'margin-top']) {
      expect(`${prop}: ${normalize(got[prop])}`).toBe(`${prop}: ${normalize(want[prop])}`);
    }
  });

  it('заливка полосы — --acs по доле от цели, ширина приходит из данных', () => {
    const want = decls(fillNode.style);
    const got = productDecls('.widget-v4-goalbar__fill', '.widget-v4-goalbar--steps .widget-v4-goalbar__fill');
    for (const prop of ['border-radius', 'background']) {
      expect(`${prop}: ${normalize(got[prop])}`).toBe(`${prop}: ${normalize(want[prop])}`);
    }
    // Кадр пишет заливке height:4px, продукт — 100 % внутри дорожки. Это одно
    // и то же: дорожка сверена выше и она 4 px. Записано как равенство, а не
    // как пропуск, — иначе высота заливки ушла бы из-под проверки совсем.
    expect(want.height).toBe('4px');
    expect(normalize(got.height)).toBe('100%');
    expect(normalize(productDecls('.widget-v4-goalbar', '.widget-v4-goalbar--steps').height)).toBe('4px');
    // Ширина в кадре — пример (72 %); в продукте это доля от дневной цели.
    expect(want.width).toBe('72%');
    expect(nowBranch()).toContain('v4StepsGoalBar(data?.pct)');
  });

  it('тонов состояний у плитки нет ни в коде, ни в CSS', () => {
    const bar = UI.slice(UI.indexOf('function v4StepsGoalBar'), UI.indexOf('function StepsVariantBody'));
    expect(bar).not.toContain('is-on-track');
    expect(bar).not.toContain('--bad');
    const body = nowBranch();
    // Общая полоса цели красится шалфеем от 67 % — звать её здесь нельзя.
    expect(body).not.toContain('v4GoalBar(');
    expect(body).not.toContain('v4StepsState');
    expect(body).not.toContain('v4ValueStateClass');
    expect(CSS).not.toContain('.widget-v4-goalbar--steps .widget-v4-goalbar__fill.is-on-track');
  });

  it('до чек-ина — прочерк на --v4-ink-3 и без полосы', () => {
    const body = nowBranch();
    expect(body).toContain('widget-v4-goal-value--empty');
    expect(body).toMatch(/hasData \? v4StepsGoalBar\(data\?\.pct\) : null/);
    const empty = productDecls('.widget-v4-mini.widget-v4-steps .widget-v4-goal-value--empty');
    expect(normalize(empty.color)).toBe(normalize('var(--v4-ink-3)'));
  });

  it('эмодзи-плитки 🚶 в v4 нет', () => {
    expect(UI).not.toContain('🚶');
    expect(VARIANTS).not.toContain('🚶');
  });
});
