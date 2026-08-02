import fs from 'fs';
import path from 'path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');
const cssSource = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/1000-messenger.css'),
  'utf8',
);
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

function loadMessengerComponentInternals() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  eval(messengerSource);
  return window.HEYS.Messenger._test;
}

describe('шапка мессенджера после редизайна', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('клиент видит имя куратора и аватар с инициалами', () => {
    const { MessengerHeader } = loadMessengerComponentInternals();
    window.HEYS.config = { curatorDisplayName: 'Анна Петрова' };

    const { getByText, container } = render(
      RealReact.createElement(MessengerHeader, { subtitle: 'отвечает в течение часа', onClose: () => {} }),
    );

    expect(getByText('Куратор Анна Петрова')).toBeTruthy();
    expect(container.querySelector('.messenger-avatar')?.textContent).toBe('АП');
  });

  it('у куратора аватара клиента нет, заголовок другой', () => {
    const { MessengerHeader } = loadMessengerComponentInternals();

    const { getByText, container } = render(
      RealReact.createElement(MessengerHeader, { isCurator: true, subtitle: 'Pro', onClose: () => {} }),
    );

    expect(getByText('Сообщения с клиентом')).toBeTruthy();
    expect(container.querySelector('.messenger-avatar')).toBeNull();
  });

  it('иконки — svg, эмодзи в шапке не остаётся', () => {
    const { MessengerHeader } = loadMessengerComponentInternals();

    const { container } = render(
      RealReact.createElement(MessengerHeader, { subtitle: 'статус', onClose: () => {} }),
    );

    expect(container.querySelectorAll('svg.messenger-icon').length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/[💬✕⋯🗑↩✎]/u);
  });

  it('без пунктов меню кнопка «ещё» не показывается', () => {
    const { MessengerHeader } = loadMessengerComponentInternals();

    const { container } = render(
      RealReact.createElement(MessengerHeader, { subtitle: 'статус', onClose: () => {} }),
    );

    expect(container.querySelectorAll('.messenger-header-button')).toHaveLength(1);
    expect(container.querySelector('.messenger-header-menu')).toBeNull();
  });

  it('меню открывается, выполняет действие и закрывается', () => {
    const { MessengerHeader } = loadMessengerComponentInternals();
    const onSelect = vi.fn();

    const { container, getByText, getByLabelText } = render(
      RealReact.createElement(MessengerHeader, {
        subtitle: 'статус',
        onClose: () => {},
        menuItems: [{ key: 'transcription', label: 'Расшифровка голосовых', hint: 'выключена', onSelect }],
      }),
    );

    fireEvent.click(getByLabelText('Ещё'));
    expect(getByText('Расшифровка голосовых')).toBeTruthy();
    expect(getByText('выключена')).toBeTruthy();

    fireEvent.click(getByText('Расшифровка голосовых'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.messenger-header-menu')).toBeNull();
  });

  it('Escape закрывает меню', () => {
    const { MessengerHeader } = loadMessengerComponentInternals();

    const { container, getByLabelText } = render(
      RealReact.createElement(MessengerHeader, {
        subtitle: 'статус',
        onClose: () => {},
        menuItems: [{ key: 'a', label: 'Пункт', onSelect: () => {} }],
      }),
    );

    fireEvent.click(getByLabelText('Ещё'));
    expect(container.querySelector('.messenger-header-menu')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('.messenger-header-menu')).toBeNull();
  });

  it('инициалы берутся из одного или двух слов', () => {
    const { getInitials } = loadMessengerComponentInternals();

    expect(getInitials('Анна')).toBe('А');
    expect(getInitials('Анна Петрова')).toBe('АП');
    expect(getInitials('  ')).toBe('?');
  });

  it('шапка перекрывает строку чек-листа, иначе меню уходит под неё', () => {
    // Регресс визуальной проверки 2026-08-02: при равном z-index выпадающее
    // меню оказывалось под чек-листом, потому что тот идёт следующим в потоке.
    const withoutComments = cssSource.replace(/\/\*[\s\S]*?\*\//g, '');
    const header = withoutComments.match(/\.messenger-header \{[^}]*\}/)[0];
    const checklist = withoutComments.match(/\.messenger-day-checklist \{[^}]*\}/)[0];
    const headerZ = Number(header.match(/z-index:\s*(\d+)/)[1]);
    const checklistZ = Number(checklist.match(/z-index:\s*(\d+)/)[1]);

    expect(headerZ).toBeGreaterThan(checklistZ);
  });

  it('полоса согласия на расшифровку больше не живёт в композере', () => {
    expect(messengerSource).not.toMatch(/messenger-transcription-settings/);
    expect(cssSource).not.toMatch(/messenger-transcription-settings/);
  });
});
