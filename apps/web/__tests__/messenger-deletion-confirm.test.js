// Смоук: удаление сообщения — продуктовая модалка без превью и system confirm.
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');
const messengerCss = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/1000-messenger.css'),
  'utf8',
);
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

function loadMessengerInternals() {
  globalThis.React = React;
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  eval(messengerSource);
  return window.HEYS.Messenger._test;
}

describe('мессенджер · удаление сообщения', () => {
  beforeEach(() => {
    window.HEYS = {};
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('DeleteConfirmDialog — канвасный текст, legal-класс, столбик кнопок без превью', () => {
    const { DeleteConfirmDialog } = loadMessengerInternals();
    const onCancel = () => {};
    const onConfirm = () => {};

    const { container, getByRole } = render(
      React.createElement(DeleteConfirmDialog, { busy: false, onCancel, onConfirm }),
    );

    expect(getByRole('dialog', { name: /удалить сообщение/i })).toBeTruthy();
    expect(container.querySelector('.messenger-confirm-icon')).toBeNull();
    expect(container.querySelector('.messenger-confirm-preview')).toBeNull();
    expect(container.querySelector('.consent-doc-body')?.textContent).toContain('У куратора оно тоже исчезнет');

    const actions = container.querySelector('.messenger-confirm-actions');
    expect(actions).toBeTruthy();
    expect(messengerCss).toMatch(/\.messenger-confirm-actions[\s\S]*flex-direction:\s*column/);

    const buttons = Array.from(container.querySelectorAll('.messenger-confirm-actions button'));
    expect(buttons.map((b) => b.textContent.trim())).toEqual(['Удалить', 'Оставить']);
    expect(buttons[0].className).toContain('messenger-confirm-delete');
    expect(buttons[1].className).toContain('messenger-confirm-cancel');
  });

  it('подложка и оболочка — absolute scrim blur 2.5px, радиус 26', () => {
    expect(messengerCss).toMatch(/\.messenger-confirm-backdrop[\s\S]*position:\s*absolute/);
    expect(messengerCss).toMatch(/\.messenger-confirm-backdrop[\s\S]*var\(--scrim/);
    expect(messengerCss).toMatch(/blur\(var\(--v4-modal-backdrop-blur,\s*2\.5px\)\)/);
    expect(messengerCss).toMatch(/\.messenger-confirm-dialog[\s\S]*border-radius:\s*26px/);
    expect(messengerCss).toMatch(/\.messenger-confirm-dialog[\s\S]*padding:\s*22px 18px 18px/);
  });

  it('не использует window.confirm для удаления', () => {
    expect(messengerSource).not.toMatch(/window\.confirm\([^)]*удал/i);
    expect(messengerSource).toMatch(/DeleteConfirmDialog/);
  });
});
