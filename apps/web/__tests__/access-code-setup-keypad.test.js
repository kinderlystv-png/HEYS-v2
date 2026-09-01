// access-code-setup-keypad.test.js — keypad must keep digits after overlay fade.

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../heys_client_access_code_setup_v1.js'),
  'utf8',
);

const WEAK = new Set(['0000', '1111', '1234', '2580']);

function loadSetup() {
  window.HEYS = {
    auth: {
      validatePinStrict(pin) {
        const s = String(pin || '');
        return /^\d{4}$/.test(s) && !WEAK.has(s);
      },
      setClientAccessCode: vi.fn(async ({ accessCode }) => ({
        ok: true,
        clientId: 'client-1',
        accessCode,
      })),
    },
  };
  globalThis.HEYS = window.HEYS;
  globalThis.React = window.React = React;
  // eslint-disable-next-line no-new-func
  new Function(SRC)();
  return window.HEYS.ClientAccessCodeSetup.createReactComponent(React);
}

describe('ClientAccessCodeSetup keypad', () => {
  afterEach(() => {
    cleanup();
    delete window.HEYS;
    delete globalThis.HEYS;
    delete globalThis.React;
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps keypad digits after a delayed empty onChange and saves on confirm', async () => {
    const Setup = loadSetup();
    const onComplete = vi.fn();
    render(React.createElement(Setup, {
      phone: '76666666666',
      clientId: 'client-1',
      sessionToken: 'sess-1',
      onComplete,
    }));

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));

    const first = document.getElementById('heys-access-code-code-1');
    expect(first.value).toBe('2');
    fireEvent.change(first, { target: { value: '' } });
    expect(first.value).toBe('2');
    expect(document.querySelectorAll('.heys-auth-pin-dot, .pin-digit-overlay').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(document.querySelector('.heys-auth-title')?.textContent).toContain('Повторите код');

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    await waitFor(() => {
      expect(window.HEYS.auth.setClientAccessCode).toHaveBeenCalledWith(
        expect.objectContaining({ accessCode: '2123', sessionToken: 'sess-1' }),
      );
    });
  });

  it('explains a weak code instead of silently blocking Продолжить', () => {
    const Setup = loadSetup();
    render(React.createElement(Setup, {
      phone: '76666666666',
      clientId: 'client-1',
      sessionToken: 'sess-1',
    }));

    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(document.querySelector('.heys-auth-title')?.textContent).toMatch(/слишком простой/i);
    expect(screen.getByText(/Не подходят: подряд идущие цифры/i)).toBeTruthy();
    // Подпись поля — «Новый код» (кадры nc1/nc4 канваса login); прежняя
    // строка «Придумайте код доступа» дублировала заголовок экрана.
    expect(screen.getByText('Новый код')).toBeTruthy();
    expect(window.HEYS.auth.setClientAccessCode).not.toHaveBeenCalled();
  });

  it('returns a mismatched confirmation to the first step with the canvas copy', () => {
    const Setup = loadSetup();
    render(React.createElement(Setup, {
      phone: '76666666666',
      clientId: 'client-1',
      sessionToken: 'sess-1',
    }));

    ['2', '1', '2', '3'].forEach((digit) => {
      fireEvent.click(screen.getByRole('button', { name: digit }));
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    ['2', '1', '2', '4'].forEach((digit) => {
      fireEvent.click(screen.getByRole('button', { name: digit }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(document.querySelector('.heys-auth-title')?.textContent).toBe('Коды не совпали');
    expect(screen.getByText('Введите новый код заново — с первого шага.')).toBeTruthy();
    expect(screen.getByText('Начнём сначала: придумайте код и повторите его')).toBeTruthy();
    expect(document.getElementById('heys-access-code-code-1')?.value).toBe('');
  });

  it('paints the setup card as pep and keeps change-code copy quiet', () => {
    const Setup = loadSetup();
    render(React.createElement(Setup, {
      phone: '76666666666',
      clientId: 'client-1',
      sessionToken: 'sess-1',
      onCancel: vi.fn(),
    }));

    expect(document.querySelector('.heys-auth-card--pep')).toBeTruthy();
    // Подпись поля — «Новый код» (кадры nc1/nc4 канваса login); прежняя
    // строка «Придумайте код доступа» дублировала заголовок экрана.
    expect(screen.getByText('Новый код')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(document.querySelector('.heys-auth-title')?.textContent).toContain('Повторите код');
    expect(screen.getByRole('button', { name: 'Изменить код' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '← Изменить код' })).toBeNull();
    expect(document.querySelector('.heys-auth-pep-check')).toBeNull();
    expect(document.querySelector('.heys-auth-change-code')).toBeTruthy();
    expect(screen.getByText('Соглашение вы приняли на прошлом шаге')).toBeTruthy();
  });
});

describe('код доступа · оба факта в момент создания', () => {
  it('плашка стоит на шаге создания, а не только после сброса', () => {
    // Ответ дизайнера №1: «заменяет подпись» жило на экране подписания,
    // «никому не сообщайте» — только после сброса; большинство не видело ни
    // того, ни другого в момент, когда код придумывают.
    const src = readFileSync(
      resolve(__dirname, '../heys_client_access_code_setup_v1.js'), 'utf8');
    expect(src).toContain('Код доступа заменяет собственноручную подпись.');
    expect(src).toContain('Не сообщайте его никому, включая куратора.');
    // Условие показа — сам шаг, а не признак сброса.
    expect(src).toContain("phase === 'code' && entryIssue !== 'mismatch'");
    // Строка про прежний код остаётся, но только после сброса.
    expect(src).toContain('Прежний код перестал работать');
  });
});
