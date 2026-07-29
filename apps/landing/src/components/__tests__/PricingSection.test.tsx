// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import PricingSectionContent, { comparisonRows } from '../pricing/PricingSectionContent';
import PricingSSR from '../PricingSSR';

Object.assign(globalThis, { React });

function getRequiredElement<T extends Element>(container: ParentNode, selector: string): T {
  const element = container.querySelector<T>(selector);

  if (!element) throw new Error(`Expected element not found: ${selector}`);

  return element;
}

describe('PricingSSR', () => {
  afterEach(cleanup);

  it('renders the approved pricing section directly without preview controls', () => {
    const { container } = render(
      React.createElement(PricingSSR, {
        content: {} as React.ComponentProps<typeof PricingSSR>['content'],
        variant: 'A',
      }),
    );

    expect(screen.getByRole('heading', { name: 'Какую помощь вы хотите получить?' })).toBeTruthy();
    expect(container.querySelector('[data-pricing-variant-control]')).toBeNull();
    expect(container.querySelector('[data-pricing-preview-variant]')).toBeNull();
  });
});

describe('PricingSectionContent', () => {
  afterEach(cleanup);

  it('keeps three closed cards focused on one action each', () => {
    const { container } = render(React.createElement(PricingSectionContent));
    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-pricing-plan]'));

    expect(cards.map((card) => card.dataset.pricingPlan)).toEqual(['pro', 'base', 'pro-plus']);
    expect(cards).toHaveLength(3);

    expect(cards[0].querySelectorAll('li')).toHaveLength(8);
    expect(cards[1].querySelectorAll('li')).toHaveLength(4);
    expect(cards[2].querySelectorAll('li')).toHaveLength(8);

    cards.forEach((card) => {
      expect(card.querySelectorAll('details')).toHaveLength(0);
      expect(card.querySelectorAll('a, button')).toHaveLength(1);
    });

    expect(cards[0].className).toContain('md:col-span-5');
    expect(cards[1].className).toContain('md:col-span-2');
    expect(cards[2].className).toContain('md:col-span-3');
  });

  it('renders contextual Pro support and the weekly review as separate layers', () => {
    const { container } = render(React.createElement(PricingSectionContent));
    const pro = within(getRequiredElement<HTMLElement>(container, '[data-pricing-plan="pro"]'));

    expect(
      pro.getByText(
        'Вы присылаете фото, текст или голос. Куратор ведёт дневник, помнит, что происходило в течение недели, и помогает понять, что изменить, если планы или режим сбились.',
      ),
    ).toBeTruthy();
    expect(pro.getByRole('heading', { name: 'По ходу недели' })).toBeTruthy();
    expect(pro.getByRole('heading', { name: 'Итог недели' })).toBeTruthy();
    expect(pro.getByText('Все присланные приёмы заносятся в дневник.')).toBeTruthy();
    expect(
      pro.getByText(
        'Если меняются планы или график, куратор помогает решить, как действовать дальше.',
      ),
    ).toBeTruthy();
    expect(pro.getByText('Подробный разбор занимает 20–45 минут.')).toBeTruthy();

    expect(pro.getByRole('link', { name: 'Оставить заявку на 7 дней Pro' })).toBeTruthy();
    expect(pro.queryByRole('button')).toBeNull();
    expect(pro.queryByText(/одна корректировка/i)).toBeNull();
  });

  it('keeps Self on the existing PurchaseButton flow with precise training copy', () => {
    const { container } = render(React.createElement(PricingSectionContent));
    const self = within(getRequiredElement<HTMLElement>(container, '[data-pricing-plan="base"]'));

    expect(
      self.getByText(
        'Питание, КБЖУ, тренировочные записи и динамика собраны в HEYS — без участия куратора.',
      ),
    ).toBeTruthy();

    fireEvent.click(self.getByRole('button', { name: 'Выбрать Self' }));
    expect(screen.getByRole('heading', { name: 'Оформление: Self' })).toBeTruthy();
  });

  it('renders the full Pro Sport work without promising mandatory programme changes', () => {
    const { container } = render(React.createElement(PricingSectionContent));
    const sport = within(
      getRequiredElement<HTMLElement>(container, '[data-pricing-plan="pro-plus"]'),
    );

    expect(
      sport.getByText(
        'Один специалист ведёт питание и тренировки, составляет программу под ваш график и видит, как вы выполняете упражнения. Поэтому нагрузка, питание и восстановление не существуют отдельно друг от друга.',
      ),
    ).toBeTruthy();
    expect(
      sport.getByText('Тренер ведёт тренировочный дневник и видит, что реально выполнено'),
    ).toBeTruthy();
    expect(
      sport.getByText(
        'Если обстоятельства меняются, тренер помогает перестроить ближайшую тренировку',
      ),
    ).toBeTruthy();
    expect(
      sport.getByText('Тренер проверяет технику упражнений вашей программы по коротким видео'),
    ).toBeTruthy();
    expect(
      sport.getByText(
        'Тренер обновляет программу с учётом того, как вы реально выполняете тренировки',
      ),
    ).toBeTruthy();
    expect(sport.queryByText(/до двух упражнений/i)).toBeNull();
    expect(sport.getByRole('link', { name: 'Обсудить Pro Спорт' })).toBeTruthy();
    expect(sport.queryByText(/обязательно.*обнов|каждую неделю.*обнов/i)).toBeNull();
  });

  it('keeps comparison and service boundaries outside the cards', () => {
    const { container } = render(React.createElement(PricingSectionContent));
    const cards = getRequiredElement<HTMLElement>(container, '[data-pricing-cards]');
    const comparison = getRequiredElement<HTMLElement>(container, '[data-pricing-comparison]');
    const boundaries = getRequiredElement<HTMLElement>(container, '[data-pricing-boundaries]');

    expect(cards.nextElementSibling).toBe(comparison);
    expect(comparison.nextElementSibling).toBe(boundaries);
    expect(boundaries.nextElementSibling).toBeNull();
    expect(container.querySelectorAll('details')).toHaveLength(2);
    expect(within(boundaries).getByText('Как устроено сопровождение')).toBeTruthy();

    const table = within(comparison).getByRole('table');
    expect(table.querySelectorAll('th[scope="col"]')).toHaveLength(4);
    expect(comparisonRows).toHaveLength(10);
    expect(table.querySelectorAll('th[scope="row"]')).toHaveLength(10);

    expect(within(boundaries).getByText(/26 990 ₽\/мес/)).toBeTruthy();
    expect(within(boundaries).getByText(/HEYS не заменяет врача/)).toBeTruthy();
    expect(
      within(boundaries).getByText(/Для этого не нужно ждать недельного разбора/),
    ).toBeTruthy();
    expect(within(boundaries).getByRole('heading', { name: 'По ходу недели' })).toBeTruthy();
    expect(within(boundaries).getByRole('heading', { name: 'Итог недели' })).toBeTruthy();
    expect(within(boundaries).getByRole('heading', { name: 'Как работает тренер' })).toBeTruthy();
    expect(
      within(boundaries).getByRole('heading', { name: 'Как тренер проверяет технику' }),
    ).toBeTruthy();
    expect(
      within(boundaries).getByText(
        /При необходимости тренер сам просит прислать контрольное видео/,
      ),
    ).toBeTruthy();
    expect(within(boundaries).getByText(/Если материалов много, тренер определяет/)).toBeTruthy();
    expect(within(boundaries).getByText(/09:00–21:00 МСК/)).toBeTruthy();
    expect(within(cards).queryByText(/26 990 ₽\/мес/)).toBeNull();
    expect(container.textContent).not.toMatch(
      /одна корректировка|одна асинхронная корректировка|одна в середине недели|корректировка между разборами/i,
    );
    expect(screen.queryByText(/Как рассматриваются предложения/)).toBeNull();
  });
});
