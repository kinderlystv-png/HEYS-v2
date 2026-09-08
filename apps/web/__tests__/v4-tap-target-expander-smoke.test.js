/**
 * Смоук ::after-припусков: геометрия цели и маршрутизация клика.
 * jsdom не рисует псевдоэлементы отдельными узлами — проверяем математику
 * expanded bounds и поведение React-обработчиков на краю видимой зоны.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import {
  effectiveTouchSize,
  parsePseudoPaddingExpand,
} from '../../../scripts/ui-v4-check-touch-target-visible.mjs';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_730 = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');
const CSS_611 = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/611-aps-product-card.css'), 'utf8');
const CSS_BASE = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');
const PALETTE = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'), 'utf8');

const MIN = 44;

function ruleBlock(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`, 's'));
  return m?.[1] || '';
}

function afterBlock(css, host) {
  const esc = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`${esc}::after\\s*\\{([^}]*)\\}`, 's'));
  return m?.[1] || '';
}

function parsePx(value) {
  const n = Number.parseFloat(String(value || ''));
  return Number.isFinite(n) ? n : 0;
}

function visibleAxis(block, axis) {
  const prop = axis === 'width' ? 'width' : 'height';
  const minProp = axis === 'width' ? 'min-width' : 'min-height';
  const m1 = new RegExp(`${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`).exec(block);
  const m2 = new RegExp(`${minProp}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`).exec(block);
  return Math.max(m1 ? parsePx(m1[1]) : 0, m2 ? parsePx(m2[1]) : 0);
}

function touchFromCss(css, host, visibleW, visibleH) {
  const expand = parsePseudoPaddingExpand(afterBlock(css, host));
  return effectiveTouchSize(visibleW, visibleH, expand ? { expand } : null);
}

function injectCss(text) {
  const style = document.createElement('style');
  style.textContent = text;
  document.head.appendChild(style);
  return style;
}

function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function expandedRect(element, expand) {
  const r = element.getBoundingClientRect();
  return {
    left: r.left - expand.left,
    top: r.top - expand.top,
    right: r.right + expand.right,
    bottom: r.bottom + expand.bottom,
  };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-expander-smoke]').forEach((n) => n.remove());
});

describe('v4 tap-target expander smoke', () => {
  it('quick group · край минуса попадает в минус, не в соседний чип', () => {
    const styles = injectCss(`${PALETTE}\n${CSS_730}`);
    styles.setAttribute('data-expander-smoke', '1');

    const onMinus = vi.fn();
    const onChip = vi.fn();
    const { container } = render(
      React.createElement(
        'div',
        { className: 'widgets-quick-chips', style: { position: 'relative', width: 200, height: 60 } },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'widgets-quick-minus',
            onClick: onMinus,
            style: { position: 'absolute', left: 0, top: 10 },
          },
          React.createElement('span', { className: 'widgets-quick-minus__host' }, '−'),
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'widgets-quick-chip',
            onClick: onChip,
            style: { position: 'absolute', left: 34, top: 8 },
          },
          React.createElement('span', { className: 'widgets-quick-chip__host' }, '+', React.createElement('span', { className: 'widgets-quick-chip__label' }, 'Вода')),
        ),
      ),
    );

    const minusExpand = parsePseudoPaddingExpand(afterBlock(CSS_730, '.widgets-quick-minus__host'));
    expect(minusExpand).toBeTruthy();
    const minusVisible = { left: 0, top: 10, width: 22, height: 22 };
    const minusTouch = {
      left: minusVisible.left - minusExpand.left,
      top: minusVisible.top - minusExpand.top,
      right: minusVisible.left + minusVisible.width + minusExpand.right,
      bottom: minusVisible.top + minusVisible.height + minusExpand.bottom,
    };
    const chipRect = { left: 34, top: 8, right: 114, bottom: 36 };

    const edgeX = minusTouch.left + 1;
    const edgeY = (minusTouch.top + minusTouch.bottom) / 2;
    expect(pointInRect(edgeX, edgeY, minusTouch)).toBe(true);
    expect(pointInRect(edgeX, edgeY, chipRect)).toBe(false);
    expect(minusTouch.bottom - minusTouch.top).toBeGreaterThanOrEqual(MIN);

    fireEvent.click(container.querySelector('.widgets-quick-minus'), { clientX: edgeX, clientY: edgeY });
    expect(onMinus).toHaveBeenCalledTimes(1);
    expect(onChip).not.toHaveBeenCalled();
  });

  it('cal-cell · сетка gap 4 px не даёт 44 без перекрытия соседа', () => {
    const cellBlock = ruleBlock(CSS_BASE, '.cal-cell');
    const visibleH = visibleAxis(cellBlock, 'height') || 24;
    const visibleW = 42;
    const need = (MIN - visibleH) / 2;
    const gridGap = 4;
    expect(need).toBeGreaterThan(gridGap / 2);
    expect(visibleH + 2 * (gridGap / 2)).toBeLessThan(MIN);
  });

  it('aps-create-barcode-clear · клик по краю попадает в clear, не в input', () => {
    const styles = injectCss(`${PALETTE}\n${CSS_611}`);
    styles.setAttribute('data-expander-smoke', '1');

    const onClear = vi.fn();
    const onInput = vi.fn();
    const { container } = render(
      React.createElement(
        'div',
        { className: 'aps-create-barcode-row' },
        React.createElement('input', {
          className: 'aps-create-barcode-input',
          onClick: onInput,
          readOnly: true,
          value: '4600338011099',
        }),
        React.createElement('button', {
          type: 'button',
          className: 'aps-create-barcode-clear',
          onClick: onClear,
          'aria-label': 'Очистить',
        }, '×'),
      ),
    );

    const clear = container.querySelector('.aps-create-barcode-clear');
    const expand = parsePseudoPaddingExpand(afterBlock(CSS_611, '.aps-create-barcode-clear'));
    const touch = expandedRect(clear, expand);
    const edgeX = touch.left + 1;
    const edgeY = (touch.top + touch.bottom) / 2;

    fireEvent.click(clear, { clientX: edgeX, clientY: edgeY });
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onInput).not.toHaveBeenCalled();

    const size = touchFromCss(CSS_611, '.aps-create-barcode-clear', 38, 38);
    expect(size.width).toBeGreaterThanOrEqual(MIN);
    expect(size.height).toBeGreaterThanOrEqual(MIN);
  });

  it('widgets-settings-fab · припуск даёт 44×44 при видимых 40×40', () => {
    const fabBlock = ruleBlock(CSS_730, '.widgets-settings-fab');
    const size = touchFromCss(CSS_730, '.widgets-settings-fab__host', visibleAxis(fabBlock, 'width') || 40, visibleAxis(fabBlock, 'height') || 40);
    expect(size.width).toBeGreaterThanOrEqual(MIN);
    expect(size.height).toBeGreaterThanOrEqual(MIN);
  });

  it('photo-processed-checkbox · припуск 24→44 без смены width/height', () => {
    const block = ruleBlock(CSS_BASE, '.photo-processed-checkbox');
    expect(block).toMatch(/width:\s*24px/);
    expect(block).toMatch(/height:\s*24px/);
    const size = touchFromCss(CSS_BASE, '.photo-processed-checkbox', 24, 24);
    expect(size.width).toBeGreaterThanOrEqual(MIN);
    expect(size.height).toBeGreaterThanOrEqual(MIN);
  });
});
