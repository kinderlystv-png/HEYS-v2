import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const UI = path.resolve(__dirname, '../heys_widgets_ui_v1.js');
const CSS = path.resolve(__dirname, '../styles/modules/730-widgets-dashboard.css');
const PALETTE = path.resolve(__dirname, '../styles/modules/002-ui-v4-palette-roles.css');

function contractValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<b>${escaped}<\\/b><span data-v="([^"]*)"`));
  return match?.[1] || '';
}

function cssRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1] || '';
}

function loadGoalBar(uiSource) {
  const source = uiSource.match(/function v4GoalBar\(pct, tone\) \{[\s\S]*?\n  \}/)?.[0];
  expect(source).toBeTruthy();
  const React = {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children };
    },
  };
  return Function('React', `${source}; return v4GoalBar;`)(React);
}

describe('полоса дневной цели следует актуальному контракту home-widgets', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const ui = fs.readFileSync(UI, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');

  it('читает порог 67 %, роли заливки и дорожку из data-v', () => {
    const contract = contractValue(canvas, 'вид · полоса цели');
    expect(contract).toContain('ниже двух третей нормы — заливка роли --ovl');
    expect(contract).toContain('от 67 % — --gr2');
    expect(contract).toContain('Дорожка --v4-track');
    expect(contract).toContain('Порог полосы и порог числа РАЗНЫЕ намеренно');
  });

  it('переключает полосу ровно на границе 67 % и ограничивает ширину', () => {
    const goalBar = loadGoalBar(ui);
    const fill66 = goalBar(66).children[0];
    const fill67 = goalBar(67).children[0];
    const fillOver = goalBar(150).children[0];
    const fillBelow = goalBar(-5).children[0];

    expect(fill66.props.className).toBe('widget-v4-goalbar__fill');
    expect(fill67.props.className).toBe('widget-v4-goalbar__fill is-on-track');
    expect(fillOver.props.style.width).toBe('100%');
    expect(fillBelow.props.style.width).toBe('0%');
  });

  it('не наследует цвет числа и использует роли всех четырёх наборов', () => {
    expect(cssRule(css, '.widget-v4-goalbar')).toMatch(/background:\s*var\(--v4-track/);
    expect(cssRule(css, '.widget-v4-goalbar__fill')).toMatch(
      /background:\s*var\(--v4-overlay-fill/,
    );
    expect(cssRule(css, '.widget-v4-goalbar__fill.is-on-track')).toMatch(
      /background:\s*var\(--v4-ok-fill/,
    );
    expect(cssRule(css, '.widget-v4-goalbar__fill')).not.toContain('currentColor');
    expect(palette.match(/--v4-overlay-fill:/g)).toHaveLength(4);
    expect(palette.match(/--v4-overlay-fill:\s*#[0-9a-f]{6};/gi)).toHaveLength(4);
  });
});
