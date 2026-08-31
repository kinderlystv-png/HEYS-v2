// Ярус «На чём основано» — общий компонент ядра и его дневные данные.
//
// Ярус проверяется симуляцией, а не взглядом на экран: он показывается только
// там, где расчёт подключён к реестру, а «не показывается» глазами на локалке
// неотличимо от «сломался». Здесь оба состояния — состояния, и оба видны.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.resolve(WEB, rel), 'utf8');

const KERNEL = read('_kernel/heys_kernel_bibliography_v1.js');
const KERNEL_UI = read('_kernel/heys_kernel_bibliography_ui_v1.js');
const DATA = read('heys_day_bibliography_v1.js');
const DEBT = read('heys_day_caloric_debt_core_v1.js');
const DASH = read('insights/pi_ui_dashboard.js');
const BUNDLE = fs.readFileSync(
  path.resolve(WEB, '../../scripts/legacy-bundle-config.mjs'), 'utf8');

let TIER;
let B;
beforeEach(() => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  /* eslint-disable no-eval */
  (0, eval)(KERNEL);
  eval(KERNEL_UI);
  (0, eval)(DATA);
  /* eslint-enable no-eval */
  TIER = window.HEYS.TrainingKernel.bibliographyUI.SourcesTier;
  B = window.HEYS.DayBibliography;
});

const registryOf = (list) =>
  window.HEYS.TrainingKernel.bibliography.createRegistry(list);

describe('ярус «На чём основано» · компонент ядра', () => {
  it('строка — автор, год и ссылка на PubMed', () => {
    const { container } = render(React.createElement(TIER, {
      registry: B.registry, ids: ['leibel1995']
    }));
    const link = container.querySelector('a');
    expect(link.textContent).toBe('Leibel, 1995');
    expect(link.getAttribute('href')).toBe('https://pubmed.ncbi.nlm.nih.gov/7632212/');
    // Название работы не показываем: в реестре его нет, и человек видит его
    // на PubMed, куда ведёт ссылка.
    expect(container.textContent).not.toContain('title');
  });

  it('сильная работа стоит выше слабой — порядок строк это обоснование', () => {
    const registry = registryOf([
      { id: 'weak', author: 'Weak', year: 2001, url: 'u', strength: 'low' },
      { id: 'mid', author: 'Mid', year: 2002, url: 'u', strength: 'moderate' },
      { id: 'strong', author: 'Strong', year: 2003, url: 'u', strength: 'high' }
    ]);
    const { container } = render(React.createElement(TIER, {
      registry, ids: ['weak', 'mid', 'strong']
    }));
    const names = [...container.querySelectorAll('a')].map((a) => a.textContent);
    expect(names).toEqual(['Strong, 2003', 'Mid, 2002', 'Weak, 2001']);
  });

  it('нет strength — колонка справа пустая, а не «неизвестно»', () => {
    const registry = registryOf([{ id: 'x', author: 'X', year: 2000, url: 'u' }]);
    const { container } = render(React.createElement(TIER, { registry, ids: ['x'] }));
    expect(container.querySelector('.kernel-sources__strength').textContent).toBe('');
    expect(container.textContent).not.toContain('неизвестно');
    // Запись без силы не выпадает: её просто нечем ранжировать.
    expect(container.querySelectorAll('a').length).toBe(1);
  });

  it('ни один id не разрешился — яруса нет целиком', () => {
    const { container } = render(React.createElement(TIER, {
      registry: B.registry, ids: ['areta2013', 'atkinson2008']
    }));
    expect(container.innerHTML).toBe('');
    // Долг при этом остаётся видимым — но вызовом, а не строкой на экране.
    expect(B.missing(['areta2013', 'atkinson2008']))
      .toEqual(['areta2013', 'atkinson2008']);
  });

  it('второго такого компонента в продукте нет', () => {
    expect(KERNEL_UI).toContain('SourcesTier: SourcesTier');
    // Экран берёт готовый компонент, а не верстает ярус своими руками.
    expect(DASH).toContain('bibliographyUI.SourcesTier');
    expect(DASH).not.toContain("'На чём основано'");
  });
});

describe('ярус в листе «Как считается долг»', () => {
  it('id стоят у констант движка, а не в разметке листа', () => {
    expect(DEBT).toContain("SOURCE_IDS = ['leibel1995', 'hall2011']");
    expect(DASH).toContain('HEYS.dayCaloricDebtCore && HEYS.dayCaloricDebtCore.SOURCE_IDS');
    // Номер работы в разметке — вторая ссылка, которая разойдётся с первой.
    const sheet = DASH.slice(DASH.indexOf('function InsightsV4DebtSheet'),
      DASH.indexOf('function InsightsV4DebtSheet') + 1600);
    expect(sheet).not.toMatch(/pubmed\.ncbi\.nlm\.nih\.gov|PMID/);
  });

  it('обе работы движка есть в реестре — ярус нарисуется', () => {
    /* eslint-disable-next-line no-eval */
    (0, eval)(DEBT);
    const ids = window.HEYS.dayCaloricDebtCore.SOURCE_IDS;
    expect(B.missing(ids)).toEqual([]);
    const { container } = render(React.createElement(TIER, {
      registry: B.registry, ids, className: 'insights-v4-sources'
    }));
    expect(container.querySelector('.insights-v4-sources__tier').textContent)
      .toBe('На чём основано');
    expect([...container.querySelectorAll('a')].map((a) => a.textContent))
      .toEqual(['Leibel, 1995', 'Hall, 2011']);
  });

  it('модуль яруса грузится раньше экрана, что его зовёт', () => {
    const uiAt = BUNDLE.indexOf("'_kernel/heys_kernel_bibliography_ui_v1.js'");
    const dashAt = BUNDLE.indexOf("'insights/pi_ui_dashboard.js'");
    expect(uiAt).toBeGreaterThan(-1);
    expect(dashAt).toBeGreaterThan(uiAt);
  });
});
